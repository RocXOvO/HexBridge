import { describe, expect, it } from 'vitest'
import {
  calculateCompanionDock,
  leagueWindowObserverRetryDelay,
  parseLeagueWindowObservation,
} from '../src/main/league-window-observer.js'

describe('League window observation transport', () => {
  it('accepts only the three bounded boolean fields', () => {
    expect(parseLeagueWindowObservation('{"gameForeground":true,"clientVisible":false,"targetPlaced":false}')).toEqual({
      gameForeground: true,
      clientVisible: false,
      targetPlaced: false,
    })
    expect(parseLeagueWindowObservation('{"gameForeground":"true","clientVisible":false,"targetPlaced":false}')).toBeNull()
    expect(parseLeagueWindowObservation('{"gameForeground":true,"clientVisible":false}')).toBeNull()
    expect(parseLeagueWindowObservation('not-json')).toBeNull()
  })

  it('docks flush to a stable side and falls back inside instead of drifting to a work-area edge', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(calculateCompanionDock(
      { x: 100, y: 80, width: 1200, height: 760 },
      { width: 430, height: 570 },
      workArea,
    )).toEqual({
      side: 'right',
      bounds: { x: 1304, y: 80, width: 430, height: 570 },
    })
    expect(calculateCompanionDock(
      { x: 350, y: 40, width: 1500, height: 900 },
      { width: 430, height: 570 },
      workArea,
    )).toEqual({
      side: 'inside-right',
      bounds: { x: 1420, y: 40, width: 430, height: 570 },
    })
    expect(calculateCompanionDock(
      { x: 445, y: 80, width: 1050, height: 760 },
      { width: 430, height: 570 },
      workArea,
      'left',
    ).side).toBe('left')
  })

  it('backs off repeated observer failures without growing without bound', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(leagueWindowObserverRetryDelay)).toEqual([
      1_500,
      3_000,
      6_000,
      12_000,
      24_000,
      30_000,
      30_000,
    ])
  })
})
