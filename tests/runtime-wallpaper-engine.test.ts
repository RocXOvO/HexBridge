import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {}, screen: {}, shell: {}, safeStorage: {}, BrowserWindow: class {}, desktopCapturer: {},
}))
vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))
vi.mock('../src/main/config-store.js', () => ({ ConfigStore: class {} }))

import { HexBridgeRuntime } from '../src/main/runtime.js'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('Runtime Wallpaper Engine lifecycle', () => {
  it('coalesces application quit preparation and waits for restore before committing windows', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const restore = deferred<void>()
    const order: string[] = []
    runtime.quitPrepared = false
    runtime.quitCommitted = false
    runtime.quitPreparation = null
    runtime.wallpaper = {
      prepareForExit: vi.fn(async () => {
        order.push('restore-start')
        await restore.promise
        order.push('restore-finished')
      }),
    }
    runtime.windows = { prepareToQuit: vi.fn(() => order.push('windows')) }

    const first = runtime.prepareForApplicationQuit()
    const second = runtime.prepareForApplicationQuit()
    await Promise.resolve()
    expect(order).toEqual(['restore-start'])
    restore.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['restore-start', 'restore-finished', 'windows'])
    expect(runtime.wallpaper.prepareForExit).toHaveBeenCalledTimes(1)
    expect(runtime.isApplicationQuitPrepared()).toBe(true)
  })

  it('restores before update shutdown and resumes the current hero if install is cancelled', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const order: string[] = []
    runtime.snapshot = {
      modeActive: true,
      matchStage: 'active',
      matchGeneration: 3,
      currentChampionId: 81,
    }
    runtime.quitPrepared = false
    runtime.quitCommitted = false
    runtime.wallpaper = {
      prepareForExit: vi.fn(async () => { order.push('restore') }),
      resume: vi.fn(() => order.push('resume')),
    }
    runtime.windows = {
      prepareForUpdateInstall: vi.fn(() => { order.push('prepare-window'); return 17 }),
      cancelPreparedQuit: vi.fn(() => order.push('cancel-window')),
    }

    await expect(runtime.prepareForUpdateInstall()).resolves.toBe(17)
    expect(order).toEqual(['restore', 'prepare-window'])
    runtime.cancelPreparedUpdateInstall(17)
    expect(order).toEqual(['restore', 'prepare-window', 'cancel-window', 'resume'])
    expect(runtime.wallpaper.resume).toHaveBeenCalledWith({
      modeActive: true,
      matchStage: 'active',
      matchGeneration: 3,
      championId: 81,
    })
  })

  it('never resumes a hero after final quit has been committed', () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.quitCommitted = true
    runtime.wallpaper = { resume: vi.fn() }
    runtime.windows = { cancelPreparedQuit: vi.fn() }
    runtime.cancelPreparedUpdateInstall(4)
    expect(runtime.windows.cancelPreparedQuit).not.toHaveBeenCalled()
    expect(runtime.wallpaper.resume).not.toHaveBeenCalled()
  })

  it('rejects clearing the restore target while enabled or while a recovery lease is held', () => {
    for (const [enabled, leaseHeld] of [[true, false], [false, true]]) {
      const runtime = Object.create(HexBridgeRuntime.prototype) as any
      runtime.config = {
        getSettings: vi.fn(() => ({ wallpaperEngineEnabled: enabled })),
        isWallpaperEngineLeaseHeld: vi.fn(() => leaseHeld),
        saveWallpaperEnginePreferences: vi.fn(),
      }
      runtime.wallpaper = { preferencesChanged: vi.fn() }
      runtime.sync = vi.fn()

      expect(runtime.saveWallpaperEnginePreferences({
        championTargetType: 'profile',
        championTargetTemplate: 'HexBridge-{id}',
        restoreTarget: null,
      })).toMatchObject({ ok: false })
      expect(runtime.config.saveWallpaperEnginePreferences).not.toHaveBeenCalled()
    }
  })

  it('keeps Wallpaper Engine disabled when an unconfigured caller tries to enable it directly', () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    let settings = {
      displayId: '',
      calibration: null,
      wallpaperEngineEnabled: false,
      recommendationDataSource: 'dtodo',
      showInGameRecommendations: true,
      autoOcr: false,
      opponentScouting: false,
    }
    runtime.config = {
      getSettings: vi.fn(() => settings),
      getWallpaperEnginePreferences: vi.fn(() => ({
        championTargetType: 'profile',
        championTargetTemplate: 'HexBridge-{id}',
        restoreTarget: null,
      })),
      updateSettings: vi.fn((patch) => {
        settings = { ...settings, ...patch }
        return settings
      }),
    }
    runtime.wallpaper = { reconcile: vi.fn() }
    runtime.overlay = { visible: false, slots: [] }
    runtime.manualOverlayMonitorDeadlineAt = null
    runtime.setManualOverlayMonitorDeadline = vi.fn()
    runtime.stopScanLoop = vi.fn()
    runtime.cancelOpponentScoutRequest = vi.fn()
    runtime.sync = vi.fn()

    expect(runtime.updateSettings({ wallpaperEngineEnabled: true }).wallpaperEngineEnabled).toBe(false)
    expect(runtime.config.updateSettings).toHaveBeenCalledWith({})
    expect(runtime.wallpaper.reconcile).not.toHaveBeenCalled()
  })
})
