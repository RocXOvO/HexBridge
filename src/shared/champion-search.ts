import type { ChampionSummary } from './contracts.js'

// Stable, commonly used Simplified-Chinese aliases that are not present in
// Riot's localized name/title fields. Keep this list explicit and reviewable.
const COMMON_ALIASES: Record<string, string[]> = {
  Vayne: ['VN'],
  TwistedFate: ['TF'],
  JarvanIV: ['J4', '皇子'],
  LeeSin: ['瞎子'],
  MonkeyKing: ['猴子'],
  MissFortune: ['MF'],
  MasterYi: ['剑圣'],
  DrMundo: ['蒙多'],
  Gangplank: ['船长'],
  Fiddlesticks: ['稻草人'],
  KogMaw: ['大嘴'],
  ChoGath: ['大虫子'],
  TahmKench: ['蛤蟆'],
}

const normalize = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[\s·・.'’_-]/g, '')

export function championSearchText(champion: ChampionSummary): string {
  return [
    champion.name,
    champion.title,
    champion.alias,
    ...(champion.searchAliases ?? []),
    ...(COMMON_ALIASES[champion.alias] ?? []),
  ].map(normalize).join('|')
}

export function matchesChampionSearch(champion: ChampionSummary, query: string): boolean {
  const normalized = normalize(query.trim())
  return !normalized || championSearchText(champion).includes(normalized)
}
