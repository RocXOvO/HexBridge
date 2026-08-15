import { describe, expect, it, vi } from 'vitest'
import {
  calculateCompanionDock,
  LeagueWindowObserver,
  LEAGUE_WINDOW_FOLLOW_INTERVAL_MS,
  LEAGUE_WINDOW_GUARD_INTERVAL_MS,
  LEAGUE_WINDOW_REDISCOVERY_INTERVAL_MS,
  leagueWindowObserverRetryDelay,
  parseLeagueWindowObservation,
} from '../src/main/league-window-observer.js'

describe('League window observation transport', () => {
  it('accepts only the bounded observation fields and decimal HWND', () => {
    expect(parseLeagueWindowObservation('{"gameForeground":true,"clientVisible":true,"targetPlaced":false,"clientWindowHandle":"12345"}')).toEqual({
      gameForeground: true,
      clientVisible: true,
      targetPlaced: false,
      clientWindowHandle: '12345',
    })
    expect(parseLeagueWindowObservation('{"gameForeground":false,"clientVisible":false,"targetPlaced":false,"clientWindowHandle":null}')).toEqual({
      gameForeground: false,
      clientVisible: false,
      targetPlaced: false,
      clientWindowHandle: null,
    })
    expect(parseLeagueWindowObservation('{"gameForeground":"true","clientVisible":false,"targetPlaced":false,"clientWindowHandle":null}')).toBeNull()
    expect(parseLeagueWindowObservation('{"gameForeground":true,"clientVisible":false,"targetPlaced":false,"clientWindowHandle":"window:1"}')).toBeNull()
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
      bounds: { x: 1300, y: 80, width: 430, height: 570 },
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

  it('follows the verified client frequently without rediscovering processes every frame', () => {
    expect(LEAGUE_WINDOW_FOLLOW_INTERVAL_MS).toBeLessThanOrEqual(100)
    expect(LEAGUE_WINDOW_REDISCOVERY_INTERVAL_MS).toBeGreaterThanOrEqual(1_000)
    expect(LEAGUE_WINDOW_REDISCOVERY_INTERVAL_MS).toBeGreaterThan(
      LEAGUE_WINDOW_FOLLOW_INTERVAL_MS * 10,
    )
    expect(LEAGUE_WINDOW_GUARD_INTERVAL_MS).toBeGreaterThanOrEqual(350)
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

  it('exposes only a bounded observer lifecycle enum', () => {
    const observer = new LeagueWindowObserver(() => undefined)
    expect(observer.getStatus()).toBe('stopped')
    ;(observer as any).wanted = true
    expect(observer.getStatus()).toBe('starting')
    ;(observer as any).restartTimer = {}
    expect(observer.getStatus()).toBe('retrying')
    ;(observer as any).restartTimer = null
    ;(observer as any).child = {}
    ;(observer as any).currentChildObserved = true
    expect(observer.getStatus()).toBe('observing')
  })

  it('notifies retrying, starting and observing without reviving a stopped timer', () => {
    vi.useFakeTimers()
    try {
      const changed = vi.fn()
      const observer = new LeagueWindowObserver(changed)
      const firstChild = {}
      ;(observer as any).wanted = true
      ;(observer as any).targetHandle = '1'
      ;(observer as any).child = firstChild
      const stableObservation = {
        gameForeground: false,
        clientVisible: true,
        targetPlaced: false,
        clientWindowHandle: '123',
      }
      ;(observer as any).publish(stableObservation)
      expect(observer.getStatus()).toBe('observing')
      changed.mockClear()
      vi.spyOn(observer as any, 'spawnObserver').mockImplementation(() => {
        ;(observer as any).child = {}
        ;(observer as any).currentChildObserved = false
      })

      ;(observer as any).handleChildTermination(firstChild)
      expect(observer.getStatus()).toBe('retrying')
      expect(changed).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1_500)
      expect(observer.getStatus()).toBe('starting')
      expect(changed).toHaveBeenCalledTimes(2)

      ;(observer as any).publish(stableObservation)
      expect(observer.getStatus()).toBe('observing')
      expect(changed).toHaveBeenCalledTimes(3)
      ;(observer as any).publish(stableObservation)
      expect(changed).toHaveBeenCalledTimes(3)

      const staleChild = (observer as any).child
      ;(observer as any).handleChildTermination(staleChild)
      expect(changed).toHaveBeenCalledTimes(4)
      observer.stop()
      const callsAfterStop = changed.mock.calls.length
      vi.advanceTimersByTime(30_000)
      expect(observer.getStatus()).toBe('stopped')
      expect(changed).toHaveBeenCalledTimes(callsAfterStop)
    } finally {
      vi.useRealTimers()
    }
  })
})
