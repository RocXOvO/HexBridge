export type AugmentInterfaceResult = 'matched' | 'detected' | 'not-detected' | 'unreliable' | 'busy' | 'error'

export interface AugmentRoundDecision {
  commitMatched: boolean
  clearPrevious: boolean
}

/**
 * Keeps the last reliable recommendation visible between augment rounds.
 * A round only advances after the interface has disappeared twice and then
 * positively reappeared, so transient OCR misses cannot erase useful results.
 */
export class AugmentRoundTracker {
  private phase: 'waiting' | 'showing' | 'between-rounds' | 'recognizing-next' = 'waiting'
  private consecutiveAbsence = 0
  private combination = ''

  reset(): void {
    this.phase = 'waiting'
    this.consecutiveAbsence = 0
    this.combination = ''
  }

  observe(
    result: AugmentInterfaceResult,
    options: { combination?: string; manual?: boolean } = {},
  ): AugmentRoundDecision {
    if (result === 'busy' || result === 'error') return { commitMatched: false, clearPrevious: false }

    if (result === 'not-detected') {
      if (this.phase === 'showing') {
        this.consecutiveAbsence += 1
        if (this.consecutiveAbsence >= 2) this.phase = 'between-rounds'
      }
      return { commitMatched: false, clearPrevious: false }
    }

    if (result === 'detected') {
      if (this.phase === 'showing') this.consecutiveAbsence = 0
      return { commitMatched: false, clearPrevious: false }
    }

    if (result === 'unreliable') {
      // A manual scan is an explicit observation of the currently visible
      // three-card surface. When automatic OCR is disabled there may be no
      // between-round absence samples, so retaining the previous round here
      // would present stale recommendations as if they described the new
      // cards. Busy, scanner errors and a missing interface remain harmless.
      const isNewRound = this.phase === 'between-rounds' || (options.manual === true && this.phase === 'showing')
      this.consecutiveAbsence = 0
      if (isNewRound) {
        this.phase = 'recognizing-next'
        this.combination = ''
      }
      return { commitMatched: false, clearPrevious: isNewRound }
    }

    const nextCombination = options.combination ?? ''
    const roundChanged = this.phase === 'between-rounds' || this.phase === 'recognizing-next'
    const commitMatched = roundChanged || options.manual === true || nextCombination !== this.combination
    this.phase = 'showing'
    this.consecutiveAbsence = 0
    this.combination = nextCombination
    return { commitMatched, clearPrevious: false }
  }
}
