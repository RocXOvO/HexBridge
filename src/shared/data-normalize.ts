import type { AugmentMeta, ChampionAugmentData, ChampionSummary } from './contracts.js'

export const asNumber = (value: unknown): number | null => {
  const numberValue = Number(value)
  return value != null && value !== '' && Number.isFinite(numberValue) ? numberValue : null
}

const ratio = (value: unknown): number | null => {
  const numberValue = asNumber(value)
  if (numberValue == null) return null
  return numberValue > 1 ? numberValue / 100 : numberValue
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
      return [{
        augmentId,
        rank: asNumber(stats.rank),
        total: asNumber(stats.total),
        tier: asNumber(stats.tier),
      }]
    }),
  }
}
