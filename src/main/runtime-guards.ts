import type {
  AppSettings,
  ChampionAugmentData,
  ChampionAugmentRank,
  ChampionBuildRecommendation,
  ChampSelectSnapshot,
  LcuConnectionState,
  RankedAugmentSlot,
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

export function shouldShowAugmentCompanion(
  settings: Pick<AppSettings, 'showInGameRecommendations'>,
  snapshot: Pick<ChampSelectSnapshot, 'matchStage'>,
  overlay: { visible: boolean; slots: Array<Pick<RankedAugmentSlot, 'augmentId'>> },
  gameSurfaceAvailable: boolean,
): boolean {
  return settings.showInGameRecommendations &&
    snapshot.matchStage === 'active' &&
    overlay.visible &&
    overlay.slots.length === 3 &&
    overlay.slots.every((slot) => slot.augmentId != null) &&
    gameSurfaceAvailable
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
  mainActivity: { visible: boolean; minimized: boolean; focused?: boolean } = { visible: true, minimized: false, focused: true },
  inGameOverlay: { enabled: boolean; gameForeground: boolean } = { enabled: false, gameForeground: false },
): boolean {
  const hasVisibleSurface = (mainActivity.visible && !mainActivity.minimized && mainActivity.focused !== false) || (
    inGameOverlay.enabled && inGameOverlay.gameForeground
  )
  return autoOcr &&
    snapshot.modeActive &&
    snapshot.currentChampionId != null &&
    snapshot.matchStage === 'active' &&
    hasVisibleSurface
}

export function automaticOcrErrorDelay(errors: number): number {
  return [4_000, 8_000, 15_000][Math.max(0, Math.min(2, Math.trunc(errors)))] ?? 15_000
}

export function fingerprintDistance(left: string[], right: string[]): number {
  if (left.length !== 3 || right.length !== 3) return 1
  let maximum = 0
  for (let slot = 0; slot < 3; slot += 1) {
    const a = left[slot] ?? ''
    const b = right[slot] ?? ''
    if (!a || a.length !== b.length) return 1
    let changed = 0
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) changed += 1
    maximum = Math.max(maximum, changed / a.length)
  }
  return maximum
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

export function detailBuildForCurrentChampion(
  detail: ChampionAugmentData | null,
  currentChampionId: number | null,
  dataVersion: string,
): ChampionBuildRecommendation | null {
  if (
    !detail ||
    detail.championId !== currentChampionId ||
    !dataVersion ||
    detail.dataVersion !== dataVersion
  ) {
    return null
  }
  return detail.builds[0] ?? null
}
