import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ApiConnectionState, AugmentMeta, ChampionAugmentData, ChampionSummary } from '../shared/contracts.js'
import {
  normalizeAugmentCatalog,
  normalizeChampionAugmentDetail,
  normalizeChampionCatalog,
} from '../shared/data-normalize.js'
import type { ConfigStore } from './config-store.js'
import { logger } from './logger.js'

const API_ORIGIN = 'https://data.dtodo.cn'
const API_PREFIX = '/api/v1/zh-CN'
// Detail cache v1 omitted pickRate/provenance and v2 omitted documented build
// recommendations. Keep the local schema in the filename so an unchanged
// upstream dataVersion cannot pin an older shape.
const DETAIL_CACHE_SCHEMA = 3
const DEFAULT_API_STATE: ApiConnectionState = {
  configured: false,
  status: 'missing',
  gamePatch: '',
  dataVersion: '',
  publishedAt: '',
  lastError: null,
}

interface ProviderConfig {
  gamePatch?: string
  dataVersion?: string
  publishedAt?: string
}

function isChampionDetailCache(value: unknown, version: string): value is ChampionAugmentData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const detail = value as Partial<ChampionAugmentData>
  if (!Number.isInteger(detail.championId) || (detail.championId ?? 0) <= 0) return false
  if (detail.dataVersion !== version || !Array.isArray(detail.ranks) || !Array.isArray(detail.builds)) return false
  const ranksValid = detail.ranks.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const rank = entry as Partial<ChampionAugmentData['ranks'][number]>
    const sourceValid = rank.statsSource === null || ['iesdev', 'tencent', 'aramgg-client-upload'].includes(String(rank.statsSource))
    const regionValid = rank.statsRegion === null || rank.statsRegion === 'WORLD' || rank.statsRegion === 'CN'
    const provenanceComplete = rank.pickRate === null || (rank.statsSource !== null && rank.statsRegion !== null)
    return (
      Number.isInteger(rank.augmentId) &&
      (rank.augmentId ?? 0) > 0 &&
      Object.hasOwn(rank, 'pickRate') &&
      Object.hasOwn(rank, 'statsSource') &&
      Object.hasOwn(rank, 'statsRegion') &&
      (rank.pickRate === null || (typeof rank.pickRate === 'number' && rank.pickRate >= 0 && rank.pickRate <= 1)) &&
      sourceValid &&
      regionValid &&
      provenanceComplete
    )
  })
  const buildsValid = detail.builds.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const build = entry as ChampionAugmentData['builds'][number]
    const validItem = (item: unknown): boolean => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as ChampionAugmentData['builds'][number]['coreItems'][number]
      return Number.isInteger(candidate.id) && candidate.id > 0 && typeof candidate.name === 'string' && typeof candidate.iconUrl === 'string'
    }
    return (
      typeof build.label === 'string' &&
      typeof build.patch === 'string' &&
      build.source === 'iesdev' &&
      Array.isArray(build.startingItems) && build.startingItems.every(validItem) &&
      Array.isArray(build.coreItems) && build.coreItems.every(validItem) &&
      Array.isArray(build.situationalItems) && build.situationalItems.every(validItem)
    )
  })
  return ranksValid && buildsValid
}

function migrateLegacyChampionDetail(value: unknown, version: string): ChampionAugmentData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const detail = value as Partial<ChampionAugmentData>
  if (!Number.isInteger(detail.championId) || (detail.championId ?? 0) <= 0) return null
  if (detail.dataVersion !== version || !Array.isArray(detail.ranks)) return null
  const ranks = detail.ranks.flatMap((entry): ChampionAugmentData['ranks'] => {
    if (!entry || typeof entry !== 'object') return []
    const rank = entry as Partial<ChampionAugmentData['ranks'][number]>
    if (!Number.isInteger(rank.augmentId) || (rank.augmentId ?? 0) <= 0) return []
    const nullableNumber = (candidate: unknown): number | null =>
      candidate === null || candidate === undefined
        ? null
        : typeof candidate === 'number' && Number.isFinite(candidate)
          ? candidate
          : null
    const normalizedSource = rank.statsSource === 'iesdev' || rank.statsSource === 'tencent' || rank.statsSource === 'aramgg-client-upload'
      ? rank.statsSource
      : null
    const normalizedRegion = rank.statsRegion === 'WORLD' || rank.statsRegion === 'CN' ? rank.statsRegion : null
    const normalizedPickRate = normalizedSource && normalizedRegion &&
      (rank.pickRate === null || (typeof rank.pickRate === 'number' && rank.pickRate >= 0 && rank.pickRate <= 1))
      ? rank.pickRate
      : null
    return [{
      augmentId: rank.augmentId as number,
      rank: nullableNumber(rank.rank),
      total: nullableNumber(rank.total),
      tier: nullableNumber(rank.tier),
      pickRate: normalizedPickRate,
      statsSource: normalizedSource,
      statsRegion: normalizedRegion,
    }]
  })
  return ranks.length
    ? { championId: detail.championId as number, dataVersion: version, ranks, builds: [] }
    : null
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function keyValidationMessage(error: unknown): string {
  if (error instanceof ProviderError && error.status === 401) return 'API Key 无效或已失效，请重新复制后再试'
  if (error instanceof ProviderError && error.status === 429) return '请求过于频繁，请稍后再验证'
  if (error instanceof Error && error.name === 'AbortError') return '验证超时，请检查网络后重试'
  if (error instanceof TypeError) return '无法连接数据服务，请检查网络或代理设置'
  return error instanceof Error ? error.message : 'API Key 验证失败'
}

export class DataService {
  private apiState: ApiConnectionState = { ...DEFAULT_API_STATE }
  private champions: ChampionSummary[] = []
  private augments: AugmentMeta[] = []
  private details = new Map<number, ChampionAugmentData>()
  private legacyDetails = new Map<number, ChampionAugmentData>()
  private detailRequests = new Map<number, Promise<ChampionAugmentData>>()
  private cachedDataVersion = ''
  private cacheLoaded = false
  private initializeInFlight: Promise<ApiConnectionState> | null = null

  constructor(
    private readonly cacheDirectory: string,
    private readonly configStore: ConfigStore,
    private readonly clientVersion = 'development',
  ) {}

  getState(): ApiConnectionState {
    return { ...this.apiState, configured: this.configStore.hasApiKey() }
  }

  getChampions(): ChampionSummary[] {
    return [...this.champions]
  }

  getAugments(): AugmentMeta[] {
    return [...this.augments]
  }

  private cachePath(name: string): string {
    return path.join(this.cacheDirectory, name)
  }

  private async request(
    resource: string,
    options: {
      method?: 'GET' | 'HEAD'
      authenticated?: boolean
      timeoutMs?: number
      apiKey?: string
    } = {},
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `HexBridge/${this.clientVersion}`,
    }
    if (options.authenticated !== false) {
      const key = options.apiKey ?? this.configStore.getApiKey()
      if (!key) throw new ProviderError('尚未配置 API Key', 401)
      headers.Authorization = `Bearer ${key}`
    }

    try {
      const response = await fetch(`${API_ORIGIN}${API_PREFIX}/${resource}`, {
        method: options.method ?? 'GET',
        headers,
        signal: controller.signal,
      })
      if (!response.ok) throw new ProviderError(`上游返回 HTTP ${response.status}`, response.status)
      return response
    } finally {
      clearTimeout(timeout)
    }
  }

  private setError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    let status: ApiConnectionState['status'] = 'error'
    if (error instanceof ProviderError && error.status === 401) status = 'unauthorized'
    else if (error instanceof ProviderError && error.status === 429) status = 'limited'
    else if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
      status = 'offline'
    }
    this.apiState = { ...this.apiState, configured: this.configStore.hasApiKey(), status, lastError: message }
    logger.warn('Data API request failed', { status, message })
  }

  async validateKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    const candidate = apiKey.trim()
    const previous = this.configStore.getApiKey()
    if (!/^hx_(?:live|test)_[A-Za-z0-9_-]{8,}$/.test(candidate)) {
      return {
        ok: false,
        message: previous
          ? '新 Key 格式无效，原 Key 仍保留；格式应以 hx_live_ 或 hx_test_ 开头'
          : 'Key 格式应以 hx_live_ 或 hx_test_ 开头',
      }
    }

    const previousState = this.getState()
    try {
      await this.request('champions.json', {
        method: 'HEAD',
        authenticated: true,
        timeoutMs: 8_000,
        apiKey: candidate,
      })
      this.configStore.saveApiKey(candidate)
      this.apiState = { ...this.apiState, configured: true, status: 'ready', lastError: null }
      return { ok: true, message: 'API Key 验证成功' }
    } catch (error) {
      this.setError(error)
      const message = keyValidationMessage(error)
      if (previous) {
        const preservedMessage = `新 Key 验证失败，已保留原 Key：${message}`
        this.apiState = {
          ...previousState,
          configured: true,
          lastError: preservedMessage,
        }
        return { ok: false, message: preservedMessage }
      }
      return { ok: false, message }
    }
  }

  initialize(force = false): Promise<ApiConnectionState> {
    if (this.initializeInFlight) return this.initializeInFlight
    const operation = this.initializeInternal(force).finally(() => {
      if (this.initializeInFlight === operation) this.initializeInFlight = null
    })
    this.initializeInFlight = operation
    return operation
  }

  private async initializeInternal(force: boolean): Promise<ApiConnectionState> {
    await mkdir(this.cacheDirectory, { recursive: true })
    if (!this.cacheLoaded) {
      await this.loadLatestCache()
      this.cacheLoaded = true
    }
    try {
      const configResponse = await this.request('config.json', { authenticated: false })
      const config = (await configResponse.json()) as ProviderConfig
      const dataVersion = String(config.dataVersion ?? '').trim()
      if (!dataVersion) throw new Error('上游配置缺少 dataVersion')
      this.apiState = {
        configured: this.configStore.hasApiKey(),
        status: this.configStore.hasApiKey() ? 'ready' : 'missing',
        gamePatch: String(config.gamePatch ?? ''),
        dataVersion,
        publishedAt: String(config.publishedAt ?? ''),
        lastError: null,
      }

      if (!this.configStore.hasApiKey()) return this.getState()
      const version = this.apiState.dataVersion || 'unknown'
      const haveVersion = this.cachedDataVersion === version
      if (force || !haveVersion || !this.champions.length || !this.augments.length) {
        await this.downloadCatalogs(version)
      }
    } catch (error) {
      this.setError(error)
      if (this.champions.length && ['offline', 'error', 'limited'].includes(this.apiState.status)) {
        this.apiState.status = 'stale'
      }
    }
    return this.getState()
  }

  private normalizeChampions(payload: unknown): ChampionSummary[] {
    return normalizeChampionCatalog(payload, this.apiState.gamePatch)
  }

  private normalizeAugments(payload: unknown): AugmentMeta[] {
    return normalizeAugmentCatalog(payload)
  }

  private async downloadCatalogs(version: string): Promise<void> {
    const [championsResponse, augmentsResponse] = await Promise.all([
      this.request('champions.json'),
      this.request('augments.json'),
    ])
    const [championsPayload, augmentsPayload] = await Promise.all([
      championsResponse.json(),
      augmentsResponse.json(),
    ])
    const champions = this.normalizeChampions(championsPayload)
    const augments = this.normalizeAugments(augmentsPayload)
    if (champions.length < 100 || augments.length < 50) throw new Error('上游目录数据不完整')

    this.champions = champions
    this.augments = augments
    await Promise.all([
      this.atomicWrite(`champions-${version}.json`, champions),
      this.atomicWrite(`augments-${version}.json`, augments),
    ])
    await this.atomicWrite('current.json', { version })
    this.cachedDataVersion = version
    logger.info('Data catalogs updated', { version, champions: champions.length, augments: augments.length })
  }

  private async loadLatestCache(): Promise<void> {
    try {
      const pointer = JSON.parse(await readFile(this.cachePath('current.json'), 'utf8')) as { version?: string }
      if (!pointer.version) return
      const [champions, augments] = await Promise.all([
        readFile(this.cachePath(`champions-${pointer.version}.json`), 'utf8'),
        readFile(this.cachePath(`augments-${pointer.version}.json`), 'utf8'),
      ])
      this.champions = JSON.parse(champions) as ChampionSummary[]
      this.augments = JSON.parse(augments) as AugmentMeta[]
      this.cachedDataVersion = pointer.version
      if (!this.apiState.dataVersion) {
        this.apiState = { ...this.apiState, dataVersion: pointer.version }
      }
      await this.loadDetailCaches(pointer.version)
    } catch {
      // A fresh install has no cache.
    }
  }

  private async loadDetailCaches(version: string): Promise<void> {
    try {
      const names = await readdir(this.cacheDirectory)
      await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
        const currentPrefix = `champion-detail-v${DETAIL_CACHE_SCHEMA}-${version}-`
        const legacyPrefixes = [
          `champion-detail-v2-${version}-`,
          `champion-detail-${version}-`,
        ]
        if (!name.startsWith(currentPrefix) && !legacyPrefixes.some((prefix) => name.startsWith(prefix))) return
        const payload = JSON.parse(await readFile(this.cachePath(name), 'utf8')) as unknown
        if (name.startsWith(currentPrefix)) {
          if (isChampionDetailCache(payload, version)) this.details.set(payload.championId, payload)
          return
        }
        const legacy = migrateLegacyChampionDetail(payload, version)
        if (legacy && !this.details.has(legacy.championId)) this.legacyDetails.set(legacy.championId, legacy)
      }))
    } catch {
      // Optional cache warm-up.
    }
  }

  async getChampionAugments(championId: number): Promise<ChampionAugmentData> {
    const inFlight = this.detailRequests.get(championId)
    if (inFlight) return inFlight
    const operation = this.fetchChampionAugments(championId).finally(() => {
      if (this.detailRequests.get(championId) === operation) this.detailRequests.delete(championId)
    })
    this.detailRequests.set(championId, operation)
    return operation
  }

  private async fetchChampionAugments(championId: number): Promise<ChampionAugmentData> {
    const dataVersion = this.apiState.dataVersion || this.cachedDataVersion
    const cached = this.details.get(championId)
    const legacy = this.legacyDetails.get(championId)
    if (cached?.dataVersion === dataVersion) return cached
    if (!dataVersion) throw new Error('数据版本尚未就绪')
    try {
      const response = await this.request(`champions/${championId}.json`)
      const normalized = normalizeChampionAugmentDetail(
        await response.json(),
        championId,
        dataVersion,
      )
      this.details.set(championId, normalized)
      this.legacyDetails.delete(championId)
      await this.atomicWrite(
        `champion-detail-v${DETAIL_CACHE_SCHEMA}-${dataVersion}-${championId}.json`,
        normalized,
      )
      return normalized
    } catch (error) {
      this.setError(error)
      const fallback = cached ?? legacy
      if (fallback) {
        if (['offline', 'error', 'limited'].includes(this.apiState.status)) this.apiState.status = 'stale'
        return fallback
      }
      throw error
    }
  }

  private async atomicWrite(name: string, value: unknown): Promise<void> {
    const destination = this.cachePath(name)
    const temporary = `${destination}.tmp`
    await writeFile(temporary, JSON.stringify(value), 'utf8')
    await rename(temporary, destination)
  }
}
