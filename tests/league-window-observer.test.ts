import { describe, expect, it } from 'vitest'
import { leagueWindowObserverRetryDelay, parseLeagueWindowObservation } from '../src/main/league-window-observer.js'

describe('League window observation transport', () => {
  it('accepts only the two bounded boolean fields', () => {
    expect(parseLeagueWindowObservation('{"gameForeground":true,"clientVisible":false}')).toEqual({
      gameForeground: true,
      clientVisible: false,
    })
    expect(parseLeagueWindowObservation('{"gameForeground":"true","clientVisible":false}')).toBeNull()
    expect(parseLeagueWindowObservation('not-json')).toBeNull()
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
