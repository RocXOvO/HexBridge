import { describe, expect, it } from 'vitest'
import { AugmentRoundTracker } from '../src/main/augment-round.js'

describe('augment round lifecycle', () => {
  it('keeps a reliable result while the interface is gone', () => {
    const tracker = new AugmentRoundTracker()
    expect(tracker.observe('matched', { combination: '1:2:3' }).commitMatched).toBe(true)
    for (let index = 0; index < 20; index += 1) {
      expect(tracker.observe('not-detected')).toEqual({ commitMatched: false, clearPrevious: false })
    }
  })

  it('clears only after the next round positively reappears', () => {
    const tracker = new AugmentRoundTracker()
    tracker.observe('matched', { combination: '1:2:3' })
    tracker.observe('not-detected')
    tracker.observe('not-detected')
    expect(tracker.observe('unreliable')).toEqual({ commitMatched: false, clearPrevious: true })
    expect(tracker.observe('matched', { combination: '4:5:6' })).toEqual({
      commitMatched: true,
      clearPrevious: false,
    })
  })

  it('commits the same combination again in a confirmed next round', () => {
    const tracker = new AugmentRoundTracker()
    tracker.observe('matched', { combination: '1:2:3' })
    tracker.observe('not-detected')
    tracker.observe('not-detected')
    expect(tracker.observe('matched', { combination: '1:2:3' }).commitMatched).toBe(true)
  })

  it('clears the previous round when a manual scan sees a new but unreliable three-card surface', () => {
    const tracker = new AugmentRoundTracker()
    tracker.observe('matched', { combination: '1:2:3', manual: true })

    expect(tracker.observe('unreliable', { manual: true })).toEqual({
      commitMatched: false,
      clearPrevious: true,
    })
    expect(tracker.observe('matched', { combination: '4:5:6', manual: true })).toEqual({
      commitMatched: true,
      clearPrevious: false,
    })
  })

  it('does not advance rounds on busy or scanner errors', () => {
    const tracker = new AugmentRoundTracker()
    tracker.observe('matched', { combination: '1:2:3' })
    expect(tracker.observe('busy').clearPrevious).toBe(false)
    expect(tracker.observe('error').clearPrevious).toBe(false)
    expect(tracker.observe('matched', { combination: '1:2:3' }).commitMatched).toBe(false)
  })

  it('requires two consecutive low-cost absences before accepting the next round', () => {
    const tracker = new AugmentRoundTracker()
    tracker.observe('matched', { combination: '1:2:3' })
    tracker.observe('not-detected')
    tracker.observe('detected')
    tracker.observe('not-detected')
    expect(tracker.observe('matched', { combination: '1:2:3' }).commitMatched).toBe(false)
    tracker.observe('not-detected')
    tracker.observe('not-detected')
    expect(tracker.observe('matched', { combination: '1:2:3' }).commitMatched).toBe(true)
  })
})
