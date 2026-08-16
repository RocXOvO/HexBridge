import type {
  AppSettings,
  AugmentSlot,
  ChampionAugmentData,
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

/**
 * Return the physically changed title slots when both fingerprints are
 * complete. A null result is deliberately fail-closed: incomplete or
 * differently sized fingerprints must use the existing three-slot OCR path.
 */
export function fingerprintChangedSlots(
  left: readonly string[],
  right: readonly string[],
  threshold = 0.08,
): AugmentSlot[] | null {
  if (
    left.length !== 3 ||
    right.length !== 3 ||
    left.some((value, index) => !value || value.length !== right[index]?.length)
  ) return null

  const slots: AugmentSlot[] = ['left', 'center', 'right']
  return slots.filter((_slot, index) => {
    const a = left[index] as string
    const b = right[index] as string
    let changed = 0
    for (let character = 0; character < a.length; character += 1) {
      if (a[character] !== b[character]) changed += 1
    }
    return changed / a.length >= threshold
  })
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
