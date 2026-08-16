import type { ChampionSummary, RecommendationDataSource } from './contracts.js'

export const CHAMPION_TIER_BUCKETS = ['OP', 'T1', 'T2', 'T3', 'T4', 'T5'] as const
export type ChampionTierBucket = typeof CHAMPION_TIER_BUCKETS[number]

export interface ChampionTierGroup {
  key: ChampionTierBucket
  label: ChampionTierBucket
  items: ChampionSummary[]
}

function numericTier(champion: ChampionSummary): number | null {
  return Number.isFinite(champion.tier) && (champion.tier ?? 0) > 0 ? champion.tier : null
}

function compareWinRate(left: ChampionSummary, right: ChampionSummary): number {
  return (right.winRate ?? -1) - (left.winRate ?? -1) || left.id - right.id
}

function compareRank(left: ChampionSummary, right: ChampionSummary): number {
  return (numericTier(left) ?? Number.POSITIVE_INFINITY) - (numericTier(right) ?? Number.POSITIVE_INFINITY) ||
    compareWinRate(left, right)
}

function boundedCutoffs(total: number): number[] {
  if (total <= 0) return [0, 0, 0, 0, 0]
  const raw = [
    Math.min(3, total),
    Math.ceil(total * .12),
    Math.ceil(total * .28),
    Math.ceil(total * .48),
    Math.ceil(total * .72),
  ]
  let previous = 0
  return raw.map((value, index) => {
    const minimum = index === 0 ? 1 : index + 3
    previous = Math.min(total, Math.max(previous, value, minimum))
    return previous
  })
}

/**
 * Maps the provider's native score to the stable UI buckets requested by the
 * ranking page. Dtodo already supplies T1..T5; its three strongest T1 rows
 * become OP. Tencent supplies a numeric overall rank, so the remaining
 * buckets use fixed rank percentiles and never pretend to be Tencent tiers.
 */
export function classifyChampionTier(
  champion: ChampionSummary,
  reference: readonly ChampionSummary[],
  source: RecommendationDataSource,
): ChampionTierBucket {
  if (source === 'dtodo') {
    const tierOne = reference.filter((entry) => numericTier(entry) === 1).sort(compareWinRate)
    const opPool = tierOne.length ? tierOne : [...reference].sort(compareRank)
    if (opPool.slice(0, 3).some((entry) => entry.id === champion.id)) return 'OP'
    const tier = numericTier(champion)
    if (tier != null && tier >= 1 && tier <= 5) return `T${Math.trunc(tier)}` as ChampionTierBucket
    return 'T5'
  }

  const ranked = reference.filter((entry) => numericTier(entry) != null).sort(compareRank)
  const rank = numericTier(champion)
  if (rank == null || !ranked.length) return 'T5'
  const cutoffs = boundedCutoffs(ranked.length)
  const index = cutoffs.findIndex((cutoff) => rank <= cutoff)
  if (index === 0) return 'OP'
  if (index < 0) return 'T5'
  return `T${index}` as ChampionTierBucket
}

export function groupChampionsByTier(
  champions: readonly ChampionSummary[],
  source: RecommendationDataSource,
  sort: 'tier' | 'winRate',
  reference: readonly ChampionSummary[] = champions,
): ChampionTierGroup[] {
  const groups = new Map<ChampionTierBucket, ChampionSummary[]>(CHAMPION_TIER_BUCKETS.map((key) => [key, []]))
  const ordered = [...champions].sort(sort === 'winRate' ? compareWinRate : compareRank)
  for (const champion of ordered) {
    groups.get(classifyChampionTier(champion, reference, source))?.push(champion)
  }
  return CHAMPION_TIER_BUCKETS
    .map((key) => ({ key, label: key, items: groups.get(key) ?? [] }))
    .filter((group) => group.items.length > 0)
}
