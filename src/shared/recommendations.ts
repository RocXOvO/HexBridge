import type {
  AugmentMeta,
  AugmentSlot,
  ChampionCandidate,
  ChampionSummary,
  ChampSelectSnapshot,
  OcrSlotResult,
  RecommendationAugmentRank,
  RecommendationDataSource,
  RecommendationDetail,
  RankedAugmentSlot,
} from './contracts.js'

const finiteNumber = (value: number | null): number | null =>
  value != null && Number.isFinite(value) ? value : null

export function compareChampions(a: ChampionSummary, b: ChampionSummary): number {
  const aTier = finiteNumber(a.tier) ?? Number.POSITIVE_INFINITY
  const bTier = finiteNumber(b.tier) ?? Number.POSITIVE_INFINITY
  if (aTier !== bTier) return aTier - bTier

  const aWinRate = finiteNumber(a.winRate) ?? Number.NEGATIVE_INFINITY
  const bWinRate = finiteNumber(b.winRate) ?? Number.NEGATIVE_INFINITY
  if (aWinRate !== bWinRate) return bWinRate - aWinRate
  return a.id - b.id
}

export function buildChampionCandidates(
  snapshot: ChampSelectSnapshot,
  champions: ChampionSummary[],
): ChampionCandidate[] {
  if (!snapshot.modeActive) return []
  const byId = new Map(champions.map((champion) => [champion.id, champion]))
  const orderedIds = [
    ...(snapshot.currentChampionId ? [snapshot.currentChampionId] : []),
    ...snapshot.benchChampionIds,
  ].filter((id, index, values) => id > 0 && values.indexOf(id) === index)

  const available = orderedIds
    .map((id) => byId.get(id))
    .filter((champion): champion is ChampionSummary => Boolean(champion))

  const best = [...available].sort(compareChampions)[0] ?? null
  const current = snapshot.currentChampionId
    ? byId.get(snapshot.currentChampionId) ?? null
    : null

  const toCandidate = (champion: ChampionSummary): ChampionCandidate => ({
    ...champion,
    sourceType: champion.id === snapshot.currentChampionId ? 'current' : 'bench',
    isCurrent: champion.id === snapshot.currentChampionId,
    isBest: champion.id === best?.id,
    winRateDelta:
      champion.winRate != null && current?.winRate != null
        ? champion.winRate - current.winRate
        : null,
  })

  const currentCandidate = current ? toCandidate(current) : null
  const benchCandidates = available
    .filter((champion) => champion.id !== snapshot.currentChampionId)
    .sort(compareChampions)
    .map(toCandidate)

  return currentCandidate ? [currentCandidate, ...benchCandidates] : benchCandidates
}

type RankKey = [number, number, number]

export function dtodoRecommendationDetail(
  detail: import('./contracts.js').ChampionAugmentData,
  statisticsDate = '',
): RecommendationDetail {
  return {
    source: 'dtodo',
    championId: detail.championId,
    snapshotId: detail.dataVersion,
    dataVersion: detail.dataVersion,
    statisticsDate,
    ranks: detail.ranks.map((rank) => ({
      augmentId: rank.augmentId,
      heroRecommendationRank: rank.rank,
      heroRecommendationTotal: rank.total,
      heroRecommendationBasis: null,
      heroTier: rank.tier,
      championPickRate: rank.pickRate,
      globalPickRate: null,
      globalWinRate: null,
      globalPickRank: null,
      globalWinRank: null,
      globalPickRankChange: null,
      globalWinRankChange: null,
      statsSource: rank.statsSource,
      statsRegion: rank.statsRegion,
    })),
  }
}

function augmentRankKey(
  rank: RecommendationAugmentRank | undefined,
  meta: AugmentMeta | undefined,
  source: RecommendationDataSource,
): RankKey | null {
  // The in-game Tencent ranking must stay hero-specific.  The adapter also
  // carries global statistics for the browse/detail page, but those values
  // are not a safe fallback when ordering the three cards on the live
  // surface.
  if (source === 'tencent101' && rank?.heroRecommendationBasis !== 'lowest_rank_runes') {
    return null
  }
  if (rank?.heroRecommendationRank != null) {
    return [0, rank.heroRecommendationRank, rank.heroTier ?? Number.POSITIVE_INFINITY]
  }
  if (source === 'tencent101') return null
  if (rank?.heroTier != null) return [1, rank.heroTier, Number.POSITIVE_INFINITY]
  if (meta?.globalTier != null) return [2, meta.globalTier, Number.POSITIVE_INFINITY]
  return null
}

function compareRankKey(a: RankKey | null, b: RankKey | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left === right) continue
    return left - right
  }
  return 0
}

function rankReason(
  rank: RecommendationAugmentRank | undefined,
  meta: AugmentMeta | undefined,
  source: RecommendationDataSource,
): string {
  if (source === 'tencent101') {
    return rank?.heroRecommendationBasis === 'lowest_rank_runes' && rank.heroRecommendationRank != null
      ? `腾讯英雄推荐第 ${rank.heroRecommendationRank}`
      : '腾讯数据站暂无该英雄专属推荐依据'
  }
  if (rank?.heroRecommendationRank != null) {
    return rank.heroRecommendationTotal
      ? `该英雄适配度排名第 ${rank.heroRecommendationRank}（共 ${rank.heroRecommendationTotal} 项）`
      : `该英雄适配度排名第 ${rank.heroRecommendationRank}`
  }
  if (rank?.heroTier != null) return `该英雄的适配等级为第 ${rank.heroTier} 档`
  if (meta?.globalTier != null) return `缺少英雄专属数据，参考全局第 ${meta.globalTier} 档`
  return '暂无可靠的推荐依据'
}

export function rankRecommendationSlots(
  slots: OcrSlotResult[],
  detail: RecommendationDetail | null,
  augments: AugmentMeta[],
  source: RecommendationDataSource,
): RankedAugmentSlot[] {
  const ranks = detail?.source === source ? detail.ranks : []
  const ranksById = new Map(ranks.map((rank) => [rank.augmentId, rank]))
  const augmentsById = new Map(augments.map((augment) => [augment.id, augment]))

  const enriched = slots.map((slot) => {
    const rank = slot.augmentId ? ranksById.get(slot.augmentId) : undefined
    const usableRank = source === 'tencent101' && rank?.heroRecommendationBasis !== 'lowest_rank_runes'
      ? undefined
      : rank
    const meta = slot.augmentId ? augmentsById.get(slot.augmentId) : undefined
    return { slot, rank: usableRank, meta, key: augmentRankKey(usableRank, meta, source) }
  })

  const sorted = [...enriched].sort((a, b) => compareRankKey(a.key, b.key))
  let lastKey: RankKey | null = null
  let lastPosition: number | null = null
  const positions = new Map<AugmentSlot, { position: number | null; tied: boolean }>()

  sorted.forEach((item, index) => {
    const position = item.key
      ? lastKey && compareRankKey(lastKey, item.key) === 0
        ? lastPosition
        : index + 1
      : null
    positions.set(item.slot.slot, { position, tied: false })
    lastKey = item.key
    lastPosition = position
  })

  for (const item of enriched) {
    const own = positions.get(item.slot.slot)
    if (!own?.position) continue
    own.tied = enriched.some(
      (other) =>
        other.slot.slot !== item.slot.slot &&
        other.key &&
        item.key &&
        compareRankKey(other.key, item.key) === 0,
    )
  }

  return enriched.map(({ slot, rank, meta }) => {
    const result = positions.get(slot.slot) ?? { position: null, tied: false }
    return {
      ...slot,
      position: result.position,
      tied: result.tied,
      reason: rankReason(rank, meta, source),
      iconUrl: meta?.iconUrl ?? '',
      rarityName: meta?.rarityName ?? '',
      pickRate: rank?.championPickRate ?? null,
      globalPickRate: source === 'tencent101' ? null : rank?.globalPickRate ?? null,
      globalWinRate: source === 'tencent101' ? null : rank?.globalWinRate ?? null,
      globalPickRank: source === 'tencent101' ? null : rank?.globalPickRank ?? null,
      globalWinRank: source === 'tencent101' ? null : rank?.globalWinRank ?? null,
      recommendationSource: source,
      statisticsDate: detail?.statisticsDate ?? '',
      metricScope: source === 'tencent101'
        ? null
        : rank?.championPickRate != null ? 'champion' : null,
      statsSource: rank?.statsSource ?? null,
      statsRegion: rank?.statsRegion ?? null,
    }
  })
}
