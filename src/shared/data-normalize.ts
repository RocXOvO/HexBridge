import type {
  AugmentMeta,
  ChampionAugmentData,
  ChampionBuildItem,
  ChampionBuildRecommendation,
  ChampionSummary,
} from './contracts.js'

export const asNumber = (value: unknown): number | null => {
  const numberValue = Number(value)
  return value != null && value !== '' && Number.isFinite(numberValue) ? numberValue : null
}

const ratio = (value: unknown): number | null => {
  const numberValue = asNumber(value)
  if (numberValue == null) return null
  const normalized = numberValue > 1 ? numberValue / 100 : numberValue
  return normalized >= 0 && normalized <= 1 ? normalized : null
}

const documentedRatio = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null
}

const statsSource = (value: unknown): 'iesdev' | 'tencent' | 'aramgg-client-upload' | null =>
  value === 'iesdev' || value === 'tencent' || value === 'aramgg-client-upload' ? value : null

const statsRegion = (value: unknown): 'WORLD' | 'CN' | null =>
  value === 'WORLD' || value === 'CN' ? value : null

const positiveInteger = (value: unknown): number | null => {
  const numberValue = asNumber(value)
  return numberValue != null && Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

const safeText = (value: unknown, maximumLength = 80): string =>
  typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''

const safeHttpsUrl = (value: unknown): string => {
  const candidate = safeText(value, 500)
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const itemIds = (value: unknown): number[] => {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  const normalized = values.map(positiveInteger)
  return normalized.every((id): id is number => id != null) ? normalized : []
}

function normalizeBuildRecommendations(detail: Record<string, any>): ChampionBuildRecommendation[] {
  const itemLookup = new Map<number, { name: string; iconUrl: string }>()
  const rememberItem = (value: unknown): number | null => {
    const item = safeRecord(value)
    const id = positiveInteger(item.id ?? item.itemId)
    if (!id) return null
    const name = safeText(item.name ?? item.displayName)
    const iconUrl = safeHttpsUrl(item.iconUrl)
    const current = itemLookup.get(id)
    if (!current || name || iconUrl) {
      itemLookup.set(id, {
        name: name || current?.name || '',
        iconUrl: iconUrl || current?.iconUrl || '',
      })
    }
    return id
  }
  const catalog = Array.isArray(detail.items) ? detail.items : []
  for (const entry of catalog) rememberItem(entry)

  const resolveItems = (record: unknown): ChampionBuildItem[] => {
    const row = safeRecord(record)
    const expandedItems = Array.isArray(row.items) && row.items.some((item: unknown) => typeof item === 'object')
      ? row.items.map(rememberItem).filter((id): id is number => id != null)
      : []
    const ids = expandedItems.length
      ? expandedItems
      : itemIds(row.itemIds ?? row.items ?? row.itemId ?? row.id)
    return ids.flatMap((id): ChampionBuildItem[] => {
      const item = itemLookup.get(id)
      return item?.name && item.iconUrl ? [{ id, name: item.name, iconUrl: item.iconUrl }] : []
    })
  }

  const rows = Array.isArray(detail.builds) ? detail.builds.slice(0, 4) : []
  return rows.flatMap((entry, index): ChampionBuildRecommendation[] => {
    const build = safeRecord(entry)
    const startingRows = Array.isArray(build.startingItems) ? build.startingItems : []
    const coreRows = Array.isArray(build.coreItems) ? build.coreItems : []
    const situationalRows = Array.isArray(build.situationalItems) ? build.situationalItems : []
    const startingItems = resolveItems(startingRows[0])
    const coreItems = resolveItems(coreRows[0])
    const situationalItems = situationalRows.flatMap(resolveItems).filter((item, itemIndex, items) =>
      items.findIndex((candidate) => candidate.id === item.id) === itemIndex,
    ).slice(0, 8)
    if (!startingItems.length && !coreItems.length && !situationalItems.length) return []

    const tagValues = build.tags && typeof build.tags === 'object' && !Array.isArray(build.tags)
      ? Object.values(build.tags).map((value) => safeText(value, 30)).filter(Boolean)
      : Array.isArray(build.tags)
        ? build.tags.map((value) => safeText(value, 30)).filter(Boolean)
        : []
    const label = tagValues.slice(0, 3).join(' / ')
      || safeText(build.tier, 40)
      || safeText(build.role, 40)
      || `推荐流派 ${index + 1}`
    return [{
      label,
      patch: safeText(build.patch, 30),
      source: 'iesdev',
      startingItems,
      coreItems,
      situationalItems,
    }]
  })
}

export function safeRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
}

export function normalizeChampionCatalog(payload: unknown, fallbackPatch = ''): ChampionSummary[] {
  const envelope = safeRecord(payload)
  const data = Array.isArray(envelope.data) ? envelope.data : []
  return data.flatMap((entry): ChampionSummary[] => {
    const item = safeRecord(entry)
    const stats = safeRecord(item.stats)
    const id = asNumber(item.id)
    if (!id) return []
    const alias = String(item.alias ?? '')
    return [{
      id,
      alias,
      name: String(item.name ?? (alias || `英雄 ${id}`)),
      title: String(item.title ?? ''),
      roles: Array.isArray(item.roles) ? item.roles.map(String) : [],
      iconUrl: String(item.iconUrl ?? ''),
      splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${alias}_0.jpg`,
      tier: asNumber(stats.tier),
      winRate: ratio(stats.winRate),
      // The dtodo catalog does not expose a verified champion-level pick-rate
      // field. Keep the slot explicit and null rather than borrowing an
      // augment or global metric from another source.
      championPickRate: null,
      patch: String(stats.gamePatch ?? fallbackPatch),
      date: String(stats.date ?? ''),
      source: String(stats.source ?? 'tencent'),
    }]
  })
}

export function normalizeAugmentCatalog(payload: unknown): AugmentMeta[] {
  const envelope = safeRecord(payload)
  const data = Array.isArray(envelope.data) ? envelope.data : []
  return data.flatMap((entry): AugmentMeta[] => {
    const item = safeRecord(entry)
    const stats = safeRecord(item.stats)
    const id = asNumber(item.id)
    if (!id || item.enabled === false) return []
    return [{
      id,
      name: String(item.name ?? `海克斯 ${id}`),
      iconUrl: String(item.iconUrl ?? ''),
      rarity: asNumber(item.rarity),
      rarityName: String(item.rarityDisplayName ?? item.rarityName ?? ''),
      description: String(item.description ?? item.tooltip ?? '').replace(/<[^>]+>/g, ''),
      globalTier: asNumber(stats.tier),
    }]
  })
}

export function normalizeChampionAugmentDetail(
  payload: unknown,
  championId: number,
  dataVersion: string,
): ChampionAugmentData {
  const envelope = safeRecord(payload)
  const detail = safeRecord(envelope.data)
  const rows = Array.isArray(detail.augments) ? detail.augments : []
  return {
    championId,
    dataVersion,
    ranks: rows.flatMap((entry): ChampionAugmentData['ranks'] => {
      const item = safeRecord(entry)
      const stats = safeRecord(item.stats)
      const augmentId = asNumber(item.id ?? item.augmentId)
      if (!augmentId) return []
      const normalizedSource = statsSource(stats.source)
      const normalizedRegion = statsRegion(stats.region)
      return [{
        augmentId,
        rank: asNumber(stats.rank),
        total: asNumber(stats.total),
        tier: asNumber(stats.tier),
        // The documented champion-detail contract is already a 0..1 ratio.
        // Reject percentages, malformed values and unverified provenance
        // instead of guessing units or presenting an unattributed statistic.
        pickRate: normalizedSource && normalizedRegion ? documentedRatio(stats.pickRate) : null,
        statsSource: normalizedSource,
        statsRegion: normalizedRegion,
      }]
    }),
    builds: normalizeBuildRecommendations(detail),
  }
}
