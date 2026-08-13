import { describe, expect, it } from 'vitest'
import { resolveAutomaticVisualMode } from '../src/main/visual-policy.js'

const context = (patch: Partial<Parameters<typeof resolveAutomaticVisualMode>[0]> = {}) => ({
  matchStage: 'none' as const,
  mainVisible: true,
  mainFocused: true,
  mainMinimized: false,
  gpuAcceleration: true,
  lowMemory: false,
  ...patch,
})

describe('automatic visual performance policy', () => {
  it('uses the best visual path while the foreground app is idle or selecting', () => {
    expect(resolveAutomaticVisualMode(context())).toBe('cinematic')
    expect(resolveAutomaticVisualMode(context({ matchStage: 'selecting' }))).toBe('cinematic')
  })

  it('reduces an unfocused visible main window to balanced', () => {
    expect(resolveAutomaticVisualMode(context({ mainFocused: false }))).toBe('balanced')
  })

  it.each([
    { mainVisible: false },
    { mainMinimized: true },
    { matchStage: 'launching' as const },
    { matchStage: 'active' as const },
    { gpuAcceleration: false },
    { lowMemory: true },
  ])('uses eco for game, hidden, minimized, or constrained state: %o', (patch) => {
    expect(resolveAutomaticVisualMode(context(patch))).toBe('eco')
  })
})
