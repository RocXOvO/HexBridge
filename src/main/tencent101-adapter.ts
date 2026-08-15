import { createHash } from 'node:crypto'
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  AugmentMeta,
  ChampionSummary,
  RecommendationAugmentRank,
  RecommendationDataState,
  RecommendationDetail,
} from '../shared/contracts.js'
import { logger } from './logger.js'

const TENCENT_SERVICE_ORIGIN = 'https://mlol.qt.qq.com'
const TENCENT_STATIC_ORIGIN = 'https://game.gtimg.cn'
const RUNE_PATH = '/go/battle_info/odp_proxy/fuwen_aram_rune_rank_v2?augmentid_level=255'
const HERO_PATH = '/go/battle_info/odp_proxy/fuwen_aram_hero_rank_v2'
const AUGMENT_CATALOG_PATH = '/images/lol/act/img/js/kiwi/kiwi_augments.json'
const HERO_CATALOG_PATH = '/images/lol/act/img/js/heroList/hero_list.js'
const CACHE_SCHEMA = 1
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024
const CACHE_POINTER_LIMIT_BYTES = 4 * 1024
const CACHE_SNAPSHOT_LIMIT_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000
const NETWORK_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000
const NETWORK_RETRY_INTERVAL_MS = 15 * 60 * 1_000

interface TencentAugmentStatistic {
  augmentId: number
  pickRate: number
  pickRank: number
  pickRankChange: number
  winRate: number
  winRank: number
  winRankChange: number
}

interface TencentHeroStatistic {
  heroId: number
  rank: number
  winRate: number
  pickRate: number
  recommendedAugmentIds: number[]
}

export interface Tencent101Snapshot {
  schema: 1
  source: 'tencent101'
  statisticsDate: string
  fetchedAt: number
  snapshotId: string
  champions: ChampionSummary[]
  augments: AugmentMeta[]
  augmentStatistics: TencentAugmentStatistic[]
  heroStatistics: TencentHeroStatistic[]
}

interface Tencent101Pointer {
  schema: 1
  source: 'tencent101'
  statisticsDate: string
  snapshotId: string
  file: string
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const EMPTY_STATE: RecommendationDataState = {
  source: 'tencent101',
  status: 'loading',
  snapshotId: '',
  dataVersion: '',
  statisticsDate: '',
  stale: false,
  lastError: null,
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function positiveInteger(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^[1-9]\d*$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function integer(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^-?\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function ratio(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  // Tencent occasionally serializes very small rates with scientific notation
  // (for example 8e-05). Accept only the decimal/scientific number grammar here;
  // the numeric range check below still rejects percentages and other units.
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

function shortText(value: unknown, maximum = 120): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= maximum ? normalized : null
}

function validStatisticsDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    year >= 2000 && year <= 2100 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function controlledTencentImage(value: unknown): string {
  const text = shortText(value, 500)
  if (!text) return ''
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'https:' && parsed.hostname === 'game.gtimg.cn'
      ? parsed.toString()
      : ''
  } catch {
    return ''
  }
}

function compressedPayload(value: unknown): Record<string, unknown> {
  const root = record(value)
  const data = record(root?.data)
  if (!root || !data || (root.code !== 0 && root.result !== 0)) {
    throw new Error('腾讯 101 响应外层结构不受支持')
  }
  const candidates: string[] = []
  if (typeof data.result === 'string') candidates.push(data.result)
  if (typeof data._fieldValues === 'string') {
    candidates.push(data._fieldValues)
  } else {
    const fieldValues = record(data._fieldValues)
    if (!fieldValues) throw new Error('腾讯 101 压缩字段结构不受支持')
    for (const field of Object.values(fieldValues)) {
      if (typeof field === 'string') candidates.push(field)
    }
  }
  const unique = [...new Set(candidates.map((entry) => entry.trim()).filter(Boolean))]
  if (unique.length !== 1 || unique[0]!.length > RESPONSE_LIMIT_BYTES) {
    throw new Error('腾讯 101 压缩字段缺失或存在歧义')
  }
  const parsed = JSON.parse(unique[0]!) as unknown
  const result = record(parsed)
  if (!result) throw new Error('腾讯 101 压缩字段不是对象')
  return result
}

export function parseTencentRuneRank(payload: unknown): {
  statisticsDate: string
  rows: TencentAugmentStatistic[]
} {
  const parsed = compressedPayload(payload)
  const statisticsDate = shortText(parsed.dtstatdate, 8)
  if (!validStatisticsDate(statisticsDate)) throw new Error('腾讯强化榜缺少有效统计日期')
  const list = typeof parsed.augmentlist === 'string' ? parsed.augmentlist : ''
  const records = list.split('#').filter(Boolean)
  if (records.length < 50 || records.length > 500) throw new Error('腾讯强化榜条目数量异常')
  const ids = new Set<number>()
  const rows = records.map((entry) => {
    const fields = entry.split('_')
    if (fields.length !== 9) throw new Error('腾讯强化榜字段数量发生变化')
    const augmentId = positiveInteger(fields[0])
    const level = positiveInteger(fields[1])
    const pickRate = ratio(fields[2])
    const pickRank = positiveInteger(fields[3])
    const pickRankChange = integer(fields[4])
    const winRate = ratio(fields[5])
    const winRank = positiveInteger(fields[6])
    const winRankChange = integer(fields[7])
    if (
      !augmentId || level !== 255 || pickRate == null || !pickRank || pickRankChange == null ||
      winRate == null || !winRank || winRankChange == null || ids.has(augmentId)
    ) throw new Error('腾讯强化榜包含无效或重复字段')
    ids.add(augmentId)
    return { augmentId, pickRate, pickRank, pickRankChange, winRate, winRank, winRankChange }
  })
  return { statisticsDate, rows }
}

export function parseTencentHeroRank(payload: unknown): TencentHeroStatistic[] {
  const parsed = compressedPayload(payload)
  const list = typeof parsed.listcollect === 'string' ? parsed.listcollect : ''
  const records = list.split('#').filter(Boolean)
  if (records.length < 100 || records.length > 300) throw new Error('腾讯英雄榜条目数量异常')
  const ids = new Set<number>()
  return records.map((entry) => {
    const fields = entry.split('_')
    if (fields.length !== 11) throw new Error('腾讯英雄榜字段数量发生变化')
    const heroId = positiveInteger(fields[0])
    const rank = positiveInteger(fields[1])
    const winRate = ratio(fields[3])
    const pickRate = ratio(fields[4])
    if (!heroId || !rank || winRate == null || pickRate == null || ids.has(heroId)) {
      throw new Error('腾讯英雄榜包含无效或重复字段')
    }
    const recommendations = fields[10]?.trim()
      ? fields[10]!.split(',').map(positiveInteger)
      : []
    if (recommendations.some((id) => id == null) || recommendations.length > 30) {
      throw new Error('腾讯英雄推荐海克斯列表无效')
    }
    const recommendedAugmentIds = recommendations as number[]
    if (new Set(recommendedAugmentIds).size !== recommendedAugmentIds.length) {
      throw new Error('腾讯英雄推荐海克斯列表包含重复项')
    }
    ids.add(heroId)
    return { heroId, rank, winRate, pickRate, recommendedAugmentIds }
  })
}

function parseTencentHeroCatalog(payload: unknown, statistics: TencentHeroStatistic[], date: string): ChampionSummary[] {
  const root = record(payload)
  if (!root || !Array.isArray(root.hero) || root.hero.length < 100 || root.hero.length > 300) {
    throw new Error('腾讯英雄静态目录不完整')
  }
  const stats = new Map(statistics.map((entry) => [entry.heroId, entry]))
  const ids = new Set<number>()
  const heroes = root.hero.flatMap((entry): ChampionSummary[] => {
    const item = record(entry)
    const id = positiveInteger(item?.heroId)
    const alias = shortText(item?.alias, 50)
    const name = shortText(item?.title, 50)
    const title = shortText(item?.name, 80)
    const statistic = id ? stats.get(id) : null
    if (!id || !alias || !/^[A-Za-z0-9]+$/.test(alias) || !name || !title || !statistic || ids.has(id)) return []
    const roles = Array.isArray(item?.roles)
      ? item.roles.filter((role): role is string => typeof role === 'string' && /^[a-z]+$/.test(role)).slice(0, 5)
      : []
    const searchAliases = typeof item?.keywords === 'string'
      ? [...new Set(item.keywords.split(',').map((keyword) => keyword.trim()).filter((keyword) => keyword && keyword.length <= 30))].slice(0, 30)
      : []
    ids.add(id)
    return [{
      id,
      alias,
      searchAliases,
      name,
      title,
      roles,
      iconUrl: `${TENCENT_STATIC_ORIGIN}/images/lol/act/img/champion/${alias}.png`,
      splashUrl: `${TENCENT_STATIC_ORIGIN}/images/lol/act/img/skin/big${id}000.jpg`,
      tier: statistic.rank,
      winRate: statistic.winRate,
      patch: '',
      date,
      source: 'tencent101',
    }]
  })
  if (heroes.length < 100) throw new Error('腾讯英雄榜与静态目录无法完整关联')
  return heroes
}

export function parseTencentAugmentCatalog(payload: unknown): AugmentMeta[] {
  const root = record(payload)
  const entries = Array.isArray(payload) ? payload : root ? Object.values(root) : []
  if (entries.length < 100 || entries.length > 500) {
    throw new Error('腾讯海克斯静态目录条目数量异常')
  }
  const byId = new Map<number, AugmentMeta>()
  for (const entry of entries) {
    const item = record(entry)
    const id = positiveInteger(item?.augmentID)
    const name = shortText(item?.name_cn, 100)
    const iconUrl = controlledTencentImage(item?.large_Icon)
    if (!id || !name || !iconUrl) throw new Error('腾讯海克斯静态目录包含无效条目')
    const level = shortText(item?.level, 40)
    const rarity = level === 'kPrismatic' ? 3 : level === 'kGold' ? 2 : level === 'kSilver' ? 1 : null
    const rarityName = rarity === 3 ? '棱彩' : rarity === 2 ? '黄金' : rarity === 1 ? '白银' : '海克斯强化'
    const description = shortText(item?.tooltip, 1_500) ?? shortText(item?.desc, 1_500) ?? ''
    const normalized: AugmentMeta = { id, name, iconUrl, rarity, rarityName, description, globalTier: null }
    const existing = byId.get(id)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
        throw new Error('腾讯海克斯静态目录重复 ID 存在冲突')
      }
      continue
    }
    byId.set(id, normalized)
  }
  const augments = [...byId.values()]
  if (augments.length < 100 || augments.length > 500) throw new Error('腾讯海克斯静态目录不完整')
  return augments
}

function snapshotHash(snapshot: Omit<Tencent101Snapshot, 'snapshotId'>): string {
  return createHash('sha256').update(JSON.stringify({
    schema: snapshot.schema,
    source: snapshot.source,
    statisticsDate: snapshot.statisticsDate,
    fetchedAt: snapshot.fetchedAt,
    champions: snapshot.champions,
    augments: snapshot.augments,
    augmentStatistics: snapshot.augmentStatistics,
    heroStatistics: snapshot.heroStatistics,
  })).digest('hex')
}

function uniquePositiveIds(values: unknown[], select: (value: Record<string, unknown>) => number | null): boolean {
  const ids = new Set<number>()
  for (const value of values) {
    const item = record(value)
    const id = item ? select(item) : null
    if (!id || ids.has(id)) return false
    ids.add(id)
  }
  return true
}

function validCachedChampion(value: unknown, date: string): boolean {
  const item = record(value)
  if (!item) return false
  const icon = controlledTencentImage(item.iconUrl)
  const splash = controlledTencentImage(item.splashUrl)
  return Boolean(
    positiveInteger(item.id) && shortText(item.alias, 50) && shortText(item.name, 50) &&
    shortText(item.title, 80) && Array.isArray(item.roles) &&
    item.roles.length <= 5 &&
    item.roles.every((role) => typeof role === 'string' && /^[a-z]+$/.test(role)) &&
    (item.searchAliases === undefined || (
      Array.isArray(item.searchAliases) &&
      item.searchAliases.length <= 30 &&
      item.searchAliases.every((alias) => typeof alias === 'string' && alias.length > 0 && alias.length <= 30)
    )) && icon === item.iconUrl && splash === item.splashUrl &&
    positiveInteger(item.tier) && ratio(item.winRate) != null && item.patch === '' &&
    item.date === date && item.source === 'tencent101'
  )
}

function validCachedAugment(value: unknown): boolean {
  const item = record(value)
  if (!item) return false
  const rarity = item.rarity
  return Boolean(
    positiveInteger(item.id) && shortText(item.name, 100) &&
    controlledTencentImage(item.iconUrl) === item.iconUrl &&
    (rarity === null || rarity === 1 || rarity === 2 || rarity === 3) &&
    shortText(item.rarityName, 40) && typeof item.description === 'string' && item.description.length <= 1_500 &&
    item.globalTier === null
  )
}

function validCachedAugmentStatistic(value: unknown): boolean {
  const item = record(value)
  return Boolean(
    item && positiveInteger(item.augmentId) && ratio(item.pickRate) != null &&
    positiveInteger(item.pickRank) && integer(item.pickRankChange) != null &&
    ratio(item.winRate) != null && positiveInteger(item.winRank) && integer(item.winRankChange) != null
  )
}

function validCachedHeroStatistic(value: unknown): boolean {
  const item = record(value)
  if (!item || !Array.isArray(item.recommendedAugmentIds) || item.recommendedAugmentIds.length > 30) return false
  const recommendations = item.recommendedAugmentIds.map(positiveInteger)
  return Boolean(
    positiveInteger(item.heroId) && positiveInteger(item.rank) && ratio(item.winRate) != null &&
    ratio(item.pickRate) != null && recommendations.every((id) => id != null) &&
    new Set(recommendations).size === recommendations.length
  )
}

function isSnapshot(value: unknown): value is Tencent101Snapshot {
  const item = record(value)
  if (
    !item || item.schema !== CACHE_SCHEMA || item.source !== 'tencent101' ||
    !validStatisticsDate(item.statisticsDate) ||
    typeof item.fetchedAt !== 'number' || !Number.isFinite(item.fetchedAt) || item.fetchedAt <= 0 ||
    typeof item.snapshotId !== 'string' || !/^[a-f0-9]{64}$/.test(item.snapshotId) ||
    !Array.isArray(item.champions) || item.champions.length < 100 || item.champions.length > 300 ||
    !Array.isArray(item.augments) || item.augments.length < 100 || item.augments.length > 500 ||
    !Array.isArray(item.augmentStatistics) || item.augmentStatistics.length < 50 || item.augmentStatistics.length > 500 ||
    !Array.isArray(item.heroStatistics) || item.heroStatistics.length < 100 || item.heroStatistics.length > 300
  ) return false
  const { snapshotId, ...body } = item as unknown as Tencent101Snapshot
  if (snapshotHash(body) !== snapshotId) return false
  if (
    !item.champions.every((entry) => validCachedChampion(entry, item.statisticsDate as string)) ||
    !uniquePositiveIds(item.champions, (entry) => positiveInteger(entry.id)) ||
    !item.augments.every(validCachedAugment) ||
    !uniquePositiveIds(item.augments, (entry) => positiveInteger(entry.id)) ||
    !item.augmentStatistics.every(validCachedAugmentStatistic) ||
    !uniquePositiveIds(item.augmentStatistics, (entry) => positiveInteger(entry.augmentId)) ||
    !item.heroStatistics.every(validCachedHeroStatistic) ||
    !uniquePositiveIds(item.heroStatistics, (entry) => positiveInteger(entry.heroId))
  ) return false
  const championIds = new Set(item.champions.map((entry) => positiveInteger(record(entry)?.id)))
  return item.heroStatistics.every((entry) => championIds.has(positiveInteger(record(entry)?.heroId)))
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > RESPONSE_LIMIT_BYTES) throw new Error('腾讯 101 响应超过 2 MiB 限制')
  if (!response.body) throw new Error('腾讯 101 响应缺少正文')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > RESPONSE_LIMIT_BYTES) {
      await reader.cancel()
      throw new Error('腾讯 101 响应超过 2 MiB 限制')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export class Tencent101Adapter {
  private state: RecommendationDataState = { ...EMPTY_STATE }
  private snapshot: Tencent101Snapshot | null = null
  private initializeInFlight: Promise<RecommendationDataState> | null = null
  private cacheLoaded = false
  private lastNetworkAttemptAt = 0

  constructor(
    private readonly cacheDirectory: string,
    private readonly clientVersion = 'development',
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): RecommendationDataState {
    return { ...this.state }
  }

  getChampions(): ChampionSummary[] {
    return this.snapshot ? this.snapshot.champions.map((entry) => ({ ...entry, roles: [...entry.roles], searchAliases: [...(entry.searchAliases ?? [])] })) : []
  }

  getAugments(): AugmentMeta[] {
    return this.snapshot ? this.snapshot.augments.map((entry) => ({ ...entry })) : []
  }

  getChampionRecommendation(championId: number): RecommendationDetail {
    const snapshot = this.snapshot
    if (!snapshot) throw new Error('腾讯 101 推荐数据尚未就绪')
    const hero = snapshot.heroStatistics.find((entry) => entry.heroId === championId)
    if (!hero) throw new Error('腾讯数据站暂无该英雄的推荐海克斯')
    const recommendationOrder = new Map(hero.recommendedAugmentIds.map((id, index) => [id, index + 1]))
    const statistics = new Map(snapshot.augmentStatistics.map((entry) => [entry.augmentId, entry]))
    const ids = new Set([...snapshot.augments.map((entry) => entry.id), ...hero.recommendedAugmentIds])
    const ranks: RecommendationAugmentRank[] = [...ids].map((augmentId) => {
      const global = statistics.get(augmentId)
      return {
        augmentId,
        heroRecommendationRank: recommendationOrder.get(augmentId) ?? null,
        heroRecommendationTotal: hero.recommendedAugmentIds.length || null,
        heroTier: null,
        championPickRate: null,
        globalPickRate: global?.pickRate ?? null,
        globalWinRate: global?.winRate ?? null,
        globalPickRank: global?.pickRank ?? null,
        globalWinRank: global?.winRank ?? null,
        globalPickRankChange: global?.pickRankChange ?? null,
        globalWinRankChange: global?.winRankChange ?? null,
        statsSource: global ? 'tencent' : null,
        statsRegion: global ? 'CN' : null,
      }
    })
    return {
      source: 'tencent101',
      championId,
      snapshotId: snapshot.snapshotId,
      dataVersion: snapshot.statisticsDate,
      statisticsDate: snapshot.statisticsDate,
      ranks,
    }
  }

  initialize(force = false, signal?: AbortSignal): Promise<RecommendationDataState> {
    if (this.initializeInFlight) {
      return this.initializeInFlight.catch((error) => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        if (error instanceof Error && error.name === 'AbortError') {
          // A source switch may abort the previous caller while a new caller
          // selects Tencent again before that promise settles. Retry only after
          // the aborted single-flight operation has released its slot.
          return this.initialize(force, signal)
        }
        throw error
      })
    }
    const operation = this.initializeInternal(force, signal).finally(() => {
      if (this.initializeInFlight === operation) this.initializeInFlight = null
    })
    this.initializeInFlight = operation
    return operation
  }

  private async initializeInternal(force: boolean, signal?: AbortSignal): Promise<RecommendationDataState> {
    throwIfAborted(signal)
    await mkdir(this.cacheDirectory, { recursive: true })
    if (!this.cacheLoaded) {
      await this.loadCache()
      this.cacheLoaded = true
    }
    throwIfAborted(signal)
    if (!force) {
      if (
        this.lastNetworkAttemptAt > 0 &&
        this.now() - this.lastNetworkAttemptAt < NETWORK_RETRY_INTERVAL_MS
      ) return this.getState()
      if (this.snapshot && this.now() - this.snapshot.fetchedAt < NETWORK_REFRESH_INTERVAL_MS) {
        return this.getState()
      }
    }
    this.state = { ...this.state, status: 'loading', lastError: null }
    this.lastNetworkAttemptAt = this.now()
    try {
      const runePayload = await this.requestJson(`${TENCENT_SERVICE_ORIGIN}${RUNE_PATH}`, signal)
      const rune = parseTencentRuneRank(runePayload)
      const [heroPayload, augmentCatalogPayload, heroCatalogPayload] = await Promise.all([
        this.requestJson(`${TENCENT_SERVICE_ORIGIN}${HERO_PATH}?dtstatdate=${rune.statisticsDate}`, signal),
        this.requestJson(`${TENCENT_STATIC_ORIGIN}${AUGMENT_CATALOG_PATH}`, signal),
        this.requestJson(`${TENCENT_STATIC_ORIGIN}${HERO_CATALOG_PATH}`, signal),
      ])
      const heroStatistics = parseTencentHeroRank(heroPayload)
      const augments = parseTencentAugmentCatalog(augmentCatalogPayload)
      const champions = parseTencentHeroCatalog(heroCatalogPayload, heroStatistics, rune.statisticsDate)
      throwIfAborted(signal)
      const body: Omit<Tencent101Snapshot, 'snapshotId'> = {
        schema: CACHE_SCHEMA,
        source: 'tencent101',
        statisticsDate: rune.statisticsDate,
        fetchedAt: this.now(),
        champions,
        augments,
        augmentStatistics: rune.rows,
        heroStatistics,
      }
      const snapshot: Tencent101Snapshot = { ...body, snapshotId: snapshotHash(body) }
      if (!isSnapshot(snapshot)) throw new Error('腾讯 101 数据快照关联不完整')
      await this.commitSnapshot(snapshot, signal)
      throwIfAborted(signal)
      this.snapshot = snapshot
      this.state = {
        source: 'tencent101',
        status: 'ready',
        snapshotId: snapshot.snapshotId,
        dataVersion: snapshot.statisticsDate,
        statisticsDate: snapshot.statisticsDate,
        stale: false,
        lastError: null,
      }
      logger.info('Tencent 101 recommendation snapshot updated', {
        statisticsDate: snapshot.statisticsDate,
        champions: snapshot.champions.length,
        augments: snapshot.augments.length,
      })
    } catch (error) {
      if (signal?.aborted) {
        // A caller-driven source/context switch is not an upstream failure.
        // Do not let it consume the retry window for an immediate re-selection.
        this.lastNetworkAttemptAt = 0
        throw new DOMException('Aborted', 'AbortError')
      }
      const message = error instanceof Error ? error.message : '腾讯 101 数据不可用'
      this.state = this.snapshot
        ? {
            source: 'tencent101',
            status: 'stale',
            snapshotId: this.snapshot.snapshotId,
            dataVersion: this.snapshot.statisticsDate,
            statisticsDate: this.snapshot.statisticsDate,
            stale: true,
            lastError: message,
          }
        : { ...EMPTY_STATE, status: error instanceof TypeError ? 'offline' : 'error', lastError: message }
      logger.warn('Tencent 101 recommendation refresh failed', {
        status: this.state.status,
        errorName: error instanceof Error ? error.name : 'Error',
      })
    }
    return this.getState()
  }

  private async requestJson(url: string, externalSignal?: AbortSignal): Promise<unknown> {
    if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const parsed = new URL(url)
    const queryEntries = [...parsed.searchParams.entries()]
    const allowedRuneRequest = parsed.origin === TENCENT_SERVICE_ORIGIN &&
      parsed.pathname === RUNE_PATH.split('?')[0] &&
      queryEntries.length === 1 && parsed.searchParams.get('augmentid_level') === '255'
    const allowedHeroRequest = parsed.origin === TENCENT_SERVICE_ORIGIN &&
      parsed.pathname === HERO_PATH && queryEntries.length === 1 &&
      /^\d{8}$/.test(parsed.searchParams.get('dtstatdate') ?? '')
    const allowedStaticRequest = (
      parsed.origin === TENCENT_STATIC_ORIGIN &&
      queryEntries.length === 0 &&
      (parsed.pathname === AUGMENT_CATALOG_PATH || parsed.pathname === HERO_CATALOG_PATH)
    )
    if (!allowedRuneRequest && !allowedHeroRequest && !allowedStaticRequest) {
      throw new Error('腾讯 101 请求不在固定白名单内')
    }
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    externalSignal?.addEventListener('abort', onAbort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    try {
      const response = await this.fetcher(parsed, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': `HexBridge/${this.clientVersion}` },
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`腾讯 101 上游返回 HTTP ${response.status}`)
      return await readJsonResponse(response)
    } catch (error) {
      if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('腾讯 101 请求超时或被上游中断', { cause: error })
      }
      throw error
    } finally {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', onAbort)
    }
  }

  private async commitSnapshot(snapshot: Tencent101Snapshot, signal?: AbortSignal): Promise<void> {
    const file = `snapshot-${snapshot.statisticsDate}-${snapshot.snapshotId}.json`
    throwIfAborted(signal)
    let previousPointer: string | null = null
    try {
      previousPointer = await this.readCacheFile('current.json', CACHE_POINTER_LIMIT_BYTES)
    } catch {
      // A first successful snapshot has no previous pointer to restore.
    }
    throwIfAborted(signal)
    await this.atomicWrite(file, snapshot, signal)
    const pointer: Tencent101Pointer = {
      schema: CACHE_SCHEMA,
      source: 'tencent101',
      statisticsDate: snapshot.statisticsDate,
      snapshotId: snapshot.snapshotId,
      file,
    }
    let pointerWritten = false
    try {
      throwIfAborted(signal)
      await this.atomicWrite('current.json', pointer, signal)
      pointerWritten = true
      throwIfAborted(signal)
    } catch (error) {
      if (pointerWritten && signal?.aborted) {
        if (previousPointer != null) {
          await this.atomicWriteText('current.json', previousPointer)
        } else {
          await unlink(path.join(this.cacheDirectory, 'current.json')).catch(() => undefined)
        }
      }
      throw error
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const pointer = JSON.parse(await this.readCacheFile('current.json', CACHE_POINTER_LIMIT_BYTES)) as Tencent101Pointer
      if (
        pointer.schema !== CACHE_SCHEMA || pointer.source !== 'tencent101' ||
        !validStatisticsDate(pointer.statisticsDate) || !/^[a-f0-9]{64}$/.test(pointer.snapshotId) ||
        pointer.file !== `snapshot-${pointer.statisticsDate}-${pointer.snapshotId}.json`
      ) return
      const value = JSON.parse(await this.readCacheFile(pointer.file, CACHE_SNAPSHOT_LIMIT_BYTES)) as unknown
      if (!isSnapshot(value) || value.snapshotId !== pointer.snapshotId || value.statisticsDate !== pointer.statisticsDate) return
      this.snapshot = value
      const stale = this.now() - value.fetchedAt >= NETWORK_REFRESH_INTERVAL_MS
      this.state = {
        source: 'tencent101',
        status: stale ? 'stale' : 'ready',
        snapshotId: value.snapshotId,
        dataVersion: value.statisticsDate,
        statisticsDate: value.statisticsDate,
        stale,
        lastError: null,
      }
    } catch {
      // A fresh installation has no Tencent 101 cache.
    }
  }

  private async readCacheFile(name: string, limit: number): Promise<string> {
    const handle = await open(path.join(this.cacheDirectory, name), 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > limit) throw new Error('腾讯 101 缓存文件超出限制')
      return await handle.readFile({ encoding: 'utf8' })
    } finally {
      await handle.close()
    }
  }

  private async atomicWrite(name: string, value: unknown, signal?: AbortSignal): Promise<void> {
    await this.atomicWriteText(name, JSON.stringify(value), signal)
  }

  private async atomicWriteText(name: string, value: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const destination = path.join(this.cacheDirectory, name)
    const temporary = `${destination}.${process.pid}.${this.now()}.tmp`
    let renamed = false
    try {
      await writeFile(temporary, value, { encoding: 'utf8', signal })
      throwIfAborted(signal)
      await rename(temporary, destination)
      renamed = true
    } finally {
      if (!renamed) await unlink(temporary).catch(() => undefined)
    }
  }
}
