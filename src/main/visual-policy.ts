import type { MatchContextStage, VisualMode } from '../shared/contracts.js'

export interface VisualPolicyContext {
  matchStage: MatchContextStage
  mainVisible: boolean
  mainFocused: boolean
  mainMinimized: boolean
  gpuAcceleration: boolean
  lowMemory: boolean
}

/**
 * Visual performance is deliberately automatic. The renderer may pause more
 * work for reduced-motion/document visibility, but it cannot override this
 * Main-process policy.
 */
export function resolveAutomaticVisualMode(context: VisualPolicyContext): VisualMode {
  if (!context.gpuAcceleration || context.lowMemory) return 'eco'
  if (!context.mainVisible || context.mainMinimized) return 'eco'
  if (context.matchStage === 'launching' || context.matchStage === 'active') return 'eco'
  if (!context.mainFocused) return 'balanced'
  return 'cinematic'
}
