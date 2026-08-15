import type {
  AugmentCompanionPresentationStatus,
  ChampionCompanionPresentationStatus,
  LeagueWindowObserverStatus,
  PresentationDiagnostics,
} from './contracts.js'

export const DEFAULT_PRESENTATION_DIAGNOSTICS: PresentationDiagnostics = {
  observer: 'stopped',
  championCompanion: 'ineligible',
  augmentCompanion: 'inactive',
}

export interface ChampionCompanionDiagnosticInput {
  settingEnabled: boolean
  eligible: boolean
  dismissed: boolean
  observerRequired: boolean
  authorityAvailable: boolean
  observerStatus: LeagueWindowObserverStatus
  hasObservation: boolean
  clientVisible: boolean
  targetPlaced: boolean
}

export function classifyChampionCompanion(
  input: ChampionCompanionDiagnosticInput,
): ChampionCompanionPresentationStatus {
  if (!input.settingEnabled) return 'disabled'
  if (!input.eligible) return 'ineligible'
  if (input.dismissed) return 'dismissed'
  if (!input.observerRequired) return 'visible'
  if (!input.authorityAvailable) return 'authority-missing'
  if (input.hasObservation && input.clientVisible && input.targetPlaced) return 'visible'
  if (input.observerStatus === 'starting' || input.observerStatus === 'retrying') {
    return 'observer-starting'
  }
  if (input.hasObservation && !input.clientVisible) return 'client-hidden'
  if (input.hasObservation && !input.targetPlaced) return 'placement-pending'
  return 'observer-starting'
}

export interface AugmentCompanionDiagnosticInput {
  settingEnabled: boolean
  active: boolean
  overlayVisible: boolean
  slotCount: number
  reliableSlotCount: number
  gameForeground: boolean
}

export function classifyAugmentCompanion(
  input: AugmentCompanionDiagnosticInput,
): AugmentCompanionPresentationStatus {
  if (!input.settingEnabled) return 'disabled'
  if (!input.active) return 'inactive'
  if (input.slotCount !== 3 || input.reliableSlotCount !== 3) {
    return input.slotCount === 0 && input.reliableSlotCount === 0 ? 'no-result' : 'partial-result'
  }
  if (!input.overlayVisible) return 'no-result'
  if (!input.gameForeground) return 'game-background'
  return 'visible'
}

export function samePresentationDiagnostics(
  left: PresentationDiagnostics,
  right: PresentationDiagnostics,
): boolean {
  return left.observer === right.observer &&
    left.championCompanion === right.championCompanion &&
    left.augmentCompanion === right.augmentCompanion
}
