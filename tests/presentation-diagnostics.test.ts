import { describe, expect, it } from 'vitest'
import {
  classifyAugmentCompanion,
  classifyChampionCompanion,
  samePresentationDiagnostics,
} from '../src/shared/presentation-diagnostics.js'

const championBase = {
  settingEnabled: true,
  eligible: true,
  dismissed: false,
  observerRequired: true,
  authorityAvailable: true,
  observerStatus: 'observing' as const,
  hasObservation: true,
  clientVisible: true,
  targetPlaced: true,
}

describe('bounded window presentation diagnostics', () => {
  it('classifies every champion companion decision without native identifiers', () => {
    expect(classifyChampionCompanion({ ...championBase, settingEnabled: false })).toBe('disabled')
    expect(classifyChampionCompanion({ ...championBase, eligible: false })).toBe('ineligible')
    expect(classifyChampionCompanion({ ...championBase, dismissed: true })).toBe('dismissed')
    expect(classifyChampionCompanion({ ...championBase, observerRequired: false })).toBe('visible')
    expect(classifyChampionCompanion({ ...championBase, authorityAvailable: false })).toBe('authority-missing')
    expect(classifyChampionCompanion({
      ...championBase,
      observerStatus: 'starting',
      hasObservation: false,
      clientVisible: false,
      targetPlaced: false,
    })).toBe('observer-starting')
    expect(classifyChampionCompanion({
      ...championBase,
      observerStatus: 'retrying',
      hasObservation: false,
      clientVisible: false,
      targetPlaced: false,
    })).toBe('observer-starting')
    expect(classifyChampionCompanion({ ...championBase, clientVisible: false })).toBe('client-hidden')
    expect(classifyChampionCompanion({ ...championBase, targetPlaced: false })).toBe('placement-pending')
    expect(classifyChampionCompanion(championBase)).toBe('visible')
  })

  it('classifies the 96px strip from the same bounded inputs used to show it', () => {
    const base = {
      settingEnabled: true,
      active: true,
      overlayVisible: true,
      slotCount: 3,
      reliableSlotCount: 3,
      gameForeground: true,
    }
    expect(classifyAugmentCompanion({ ...base, settingEnabled: false })).toBe('disabled')
    expect(classifyAugmentCompanion({ ...base, active: false })).toBe('inactive')
    expect(classifyAugmentCompanion({ ...base, overlayVisible: false, slotCount: 0, reliableSlotCount: 0 })).toBe('no-result')
    expect(classifyAugmentCompanion({ ...base, slotCount: 2, reliableSlotCount: 2 })).toBe('partial-result')
    expect(classifyAugmentCompanion({ ...base, slotCount: 4, reliableSlotCount: 3 })).toBe('partial-result')
    expect(classifyAugmentCompanion({ ...base, slotCount: 3, reliableSlotCount: 4 })).toBe('partial-result')
    expect(classifyAugmentCompanion({ ...base, slotCount: -1, reliableSlotCount: -1 })).toBe('partial-result')
    expect(classifyAugmentCompanion({ ...base, gameForeground: false })).toBe('game-background')
    expect(classifyAugmentCompanion(base)).toBe('visible')
  })

  it('compares only the three public enum values', () => {
    const state = { observer: 'observing', championCompanion: 'visible', augmentCompanion: 'visible' } as const
    expect(samePresentationDiagnostics(state, { ...state })).toBe(true)
    expect(samePresentationDiagnostics(state, { ...state, augmentCompanion: 'game-background' })).toBe(false)
    expect(Object.keys(state).sort()).toEqual(['augmentCompanion', 'championCompanion', 'observer'])
    expect(JSON.stringify(state)).not.toMatch(/pid|hwnd|handle|path|bounds|title/i)
  })
})
