import type {
  ChampionAugmentData,
  ChampionAugmentRank,
  ChampSelectSnapshot,
  LcuConnectionState,
} from '../shared/contracts.js'

export function sameSnapshot(left: ChampSelectSnapshot, right: ChampSelectSnapshot): boolean {
  return (
    left.phase === right.phase &&
    left.locale === right.locale &&
    left.queueId === right.queueId &&
    left.modeActive === right.modeActive &&
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
  lcuConnected: boolean,
  snapshot: ChampSelectSnapshot,
): boolean {
  return autoOcr && lcuConnected && snapshot.phase === 'InProgress' && snapshot.modeActive
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
