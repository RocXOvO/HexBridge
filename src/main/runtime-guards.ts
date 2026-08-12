import type {
  AppSettings,
  ChampionAugmentData,
  ChampionAugmentRank,
  ChampSelectSnapshot,
  LcuConnectionState,
} from '../shared/contracts.js'

export function shouldShowChampionCompanion(
  settings: Pick<AppSettings, 'showChampionPanel'>,
  snapshot: ChampSelectSnapshot,
): boolean {
  return settings.showChampionPanel &&
    snapshot.modeActive &&
    snapshot.currentChampionId != null &&
    (snapshot.matchStage === 'selecting' || snapshot.matchStage === 'launching')
}

export function sameSnapshot(left: ChampSelectSnapshot, right: ChampSelectSnapshot): boolean {
  return (
    left.phase === right.phase &&
    left.locale === right.locale &&
    left.queueId === right.queueId &&
    left.modeActive === right.modeActive &&
    left.matchStage === right.matchStage &&
    left.matchGeneration === right.matchGeneration &&
    left.currentChampionId === right.currentChampionId &&
    left.benchEnabled === right.benchEnabled &&
    left.benchChampionIds.length === right.benchChampionIds.length &&
    left.benchChampionIds.every((id, index) => id === right.benchChampionIds[index])
  )
}

export function sameLcuState(left: LcuConnectionState, right: LcuConnectionState): boolean {
  return (
    left.connected === right.connected &&
    left.source === right.source &&
    left.lastError === right.lastError &&
    left.lastConnectedAt === right.lastConnectedAt
  )
}

export function isCurrentChampionRequest(
  requestedChampionId: number,
  requestedSequence: number,
  currentChampionId: number | null,
  currentSequence: number,
): boolean {
  return requestedChampionId === currentChampionId && requestedSequence === currentSequence
}

export function shouldRunOcr(
  autoOcr: boolean,
  snapshot: ChampSelectSnapshot,
): boolean {
  return autoOcr && isMatchContextOcrEligible(snapshot)
}

export function isMatchContextOcrEligible(snapshot: ChampSelectSnapshot): boolean {
  return (
    snapshot.modeActive &&
    snapshot.currentChampionId != null &&
    (snapshot.matchStage === 'launching' || snapshot.matchStage === 'active')
  )
}

export function isCurrentScanContext(
  snapshot: ChampSelectSnapshot,
  generation: number,
  championId: number,
): boolean {
  return (
    isMatchContextOcrEligible(snapshot) &&
    snapshot.matchGeneration === generation &&
    snapshot.currentChampionId === championId
  )
}

export function classifyScanContext(
  snapshot: ChampSelectSnapshot,
  generation: number,
  championId: number,
): 'current' | 'switched' | 'ended' {
  if (!isMatchContextOcrEligible(snapshot)) return 'ended'
  return isCurrentScanContext(snapshot, generation, championId) ? 'current' : 'switched'
}

export function detailRanksForCurrentChampion(
  detail: ChampionAugmentData | null,
  currentChampionId: number | null,
  dataVersion: string,
): ChampionAugmentRank[] {
  if (
    !detail ||
    detail.championId !== currentChampionId ||
    !dataVersion ||
    detail.dataVersion !== dataVersion
  ) {
    return []
  }
  return detail.ranks
}
