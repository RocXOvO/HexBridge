import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, quit: vi.fn() },
  BrowserWindow: class {},
  desktopCapturer: { getSources: vi.fn() },
  screen: { getAllDisplays: vi.fn(), getPrimaryDisplay: vi.fn() },
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../src/main/config-store.js', () => ({ ConfigStore: class {} }))

import { app, desktopCapturer, screen } from 'electron'
import { WindowManager } from '../src/main/window-manager.js'

const state = {
  settings: { showChampionPanel: true },
  snapshot: {
    phase: 'ChampSelect', matchStage: 'selecting', matchGeneration: 1,
    modeActive: true, currentChampionId: 103,
  },
} as any

function fakeWindow(options: { visible: boolean; focused: boolean }) {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => options.visible),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => options.focused),
    hide: vi.fn(),
    show: vi.fn(),
    showInactive: vi.fn(),
    focus: vi.fn(),
  }
}

describe('WindowManager shutdown lifecycle', () => {
  it('hides visible windows for a manual capture and restores without stealing focus', async () => {
    const manager = new WindowManager({} as any)
    const main = fakeWindow({ visible: true, focused: false })
    const champion = fakeWindow({ visible: true, focused: false })
    const augment = fakeWindow({ visible: true, focused: false })
    ;(manager as any).windows.set('main', main)
    ;(manager as any).windows.set('champion', champion)
    ;(manager as any).windows.set('augment', augment)
    const order: string[] = []
    main.hide.mockImplementation(() => order.push('hide-main'))
    champion.hide.mockImplementation(() => order.push('hide-champion'))
    augment.hide.mockImplementation(() => order.push('hide-augment'))
    main.showInactive.mockImplementation(() => order.push('restore-main'))
    champion.showInactive.mockImplementation(() => order.push('restore-champion'))
    augment.showInactive.mockImplementation(() => order.push('restore-augment'))

    await manager.captureWithoutHexBridgeWindows(async () => { order.push('capture') })

    expect(order).toEqual([
      'hide-main', 'hide-champion', 'hide-augment',
      'capture',
      'restore-main', 'restore-champion', 'restore-augment',
    ])
    expect(main.focus).not.toHaveBeenCalled()
    expect(champion.focus).not.toHaveBeenCalled()
    expect(augment.focus).not.toHaveBeenCalled()
  })

  it('can restore windows after capture while OCR work is still pending', async () => {
    const manager = new WindowManager({} as any)
    const main = fakeWindow({ visible: true, focused: false })
    ;(manager as any).windows.set('main', main)
    let finishOcr!: () => void
    const ocrPending = new Promise<void>((resolve) => { finishOcr = resolve })

    const transaction = manager.captureWithoutHexBridgeWindows(async (restoreWindows) => {
      restoreWindows()
      await ocrPending
      return 'done'
    })
    await vi.waitFor(() => expect(main.showInactive).toHaveBeenCalledOnce())
    expect(main.focus).not.toHaveBeenCalled()
    finishOcr()
    await expect(transaction).resolves.toBe('done')
    expect(main.showInactive).toHaveBeenCalledOnce()
  })

  it('does not restore capture windows after shutdown begins', async () => {
    const manager = new WindowManager({} as any)
    const main = fakeWindow({ visible: true, focused: false })
    ;(manager as any).windows.set('main', main)

    await expect(manager.captureWithoutHexBridgeWindows(async () => {
      manager.prepareToQuit()
      throw new Error('capture failed')
    })).rejects.toThrow('capture failed')

    expect(main.showInactive).not.toHaveBeenCalled()
    expect(main.show).not.toHaveBeenCalled()
  })
  it('does not synchronize or emit activity after shutdown starts', () => {
    const manager = new WindowManager({} as any)
    const activityChanged = vi.fn()
    const destroyedWindow = {
      isDestroyed: () => true,
      showInactive: vi.fn(() => { throw new Error('Object has been destroyed') }),
      hide: vi.fn(() => { throw new Error('Object has been destroyed') }),
    }
    ;(manager as any).windows.set('champion', destroyedWindow)
    manager.setActivityChangedHandler(activityChanged)

    manager.prepareToQuit()
    expect(() => manager.sync(state)).not.toThrow()
    ;(manager as any).notifyActivityChanged()

    expect(activityChanged).not.toHaveBeenCalled()
    expect(destroyedWindow.showInactive).not.toHaveBeenCalled()
    expect(destroyedWindow.hide).not.toHaveBeenCalled()
  })

  it('prunes a destroyed companion before ordinary synchronization', () => {
    const manager = new WindowManager({} as any)
    const destroyedWindow = {
      isDestroyed: () => true,
      showInactive: vi.fn(() => { throw new Error('Object has been destroyed') }),
      hide: vi.fn(() => { throw new Error('Object has been destroyed') }),
    }
    ;(manager as any).windows.set('champion', destroyedWindow)

    expect(() => manager.sync(state)).not.toThrow()
    expect((manager as any).windows.has('champion')).toBe(false)
  })

  it('sends actual champion pick rate instead of relative ranking to the augment renderer', () => {
    const manager = new WindowManager({} as any)
    const send = vi.fn()
    const augment = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send },
    }
    ;(manager as any).sendAugmentView(augment, {
      settings: { calibration: null },
      overlay: {
        message: '推荐已更新',
        slots: [{
          slot: 'left',
          augmentId: 101,
          name: '冰寒',
          position: 1,
          tied: false,
          reason: '英雄专属顺序',
          iconUrl: 'https://example.invalid/private.png',
          pickRate: .42,
          statsSource: 'tencent',
          statsRegion: 'CN',
        }],
      },
    })

    const payload = send.mock.calls[0]![1]
    expect(payload.slots).toEqual([{
      slot: 'left',
      augmentId: 101,
      name: '冰寒',
      position: 1,
      tied: false,
      reason: '英雄专属顺序',
      pickRate: .42,
    }])
    expect(payload.slots[0]).not.toHaveProperty('iconUrl')
    expect(payload.layout).toHaveLength(3)
  })

  it('keeps the League foreground observer enabled for a retained manual OCR surface', () => {
    const manager = new WindowManager({} as any)
    const leagueWindows = (manager as any).leagueWindows
    const setEnabled = vi.spyOn(leagueWindows, 'setEnabled').mockImplementation(() => {})
    const augment = {
      ...fakeWindow({ visible: false, focused: false }),
      webContents: { isDestroyed: () => false, send: vi.fn() },
      setBounds: vi.fn(),
      getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
    }
    ;(manager as any).windows.set('augment', augment)
    vi.spyOn(manager as any, 'positionAugmentWindow').mockImplementation(() => {})
    vi.spyOn(manager as any, 'sendAugmentView').mockImplementation(() => {})

    manager.sync({
      settings: {
        showChampionPanel: false,
        showInGameRecommendations: true,
        autoOcr: false,
      },
      snapshot: {
        phase: 'InProgress', matchStage: 'active', matchGeneration: 1,
        modeActive: true, currentChampionId: 103,
      },
      overlay: {
        visible: true,
        championId: 103,
        slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
        detectedAt: 1,
        message: '推荐已更新',
      },
    } as any)

    expect(setEnabled).toHaveBeenCalledWith({
      enabled: true,
      target: null,
      dockTarget: false,
      discoverClient: false,
      clientProcessId: null,
    })
  })

  it('stops Lobby discovery for eco, reduced-motion, lost focus and ChampSelect', () => {
    const manager = new WindowManager({} as any, {
      platform: 'win32',
      systemReducedMotion: () => false,
    })
    const leagueWindows = (manager as any).leagueWindows
    vi.spyOn(leagueWindows, 'setEnabled').mockImplementation(() => {})
    vi.spyOn(leagueWindows, 'hasObservation').mockReturnValue(true)
    vi.spyOn(leagueWindows, 'isClientVisible').mockReturnValue(true)
    vi.spyOn(leagueWindows, 'getClientWindowHandle').mockReturnValue('777')
    const updateBackground = vi.spyOn((manager as any).lobbyBackground, 'update').mockImplementation(() => {})
    ;(manager as any).windows.set('main', {
      ...fakeWindow({ visible: true, focused: true }),
      webContents: { isDestroyed: () => false, send: vi.fn() },
    })
    manager.setLeagueClientProcessId(123)
    manager.setLobbyBackgroundPresentation({ livePageVisible: true, reducedMotion: false })
    const lobbyState = {
      settings: {
        lobbyBackground: true,
        showChampionPanel: false,
        showInGameRecommendations: false,
      },
      snapshot: {
        phase: 'Lobby', matchStage: 'none', matchGeneration: 0,
        modeActive: false, currentChampionId: null,
      },
      lcu: { connected: true },
      diagnostics: { activeVisualMode: 'balanced' },
      overlay: { visible: false, slots: [] },
    } as any

    manager.sync(lobbyState)
    expect(updateBackground).toHaveBeenLastCalledWith(true, 123, '777')

    manager.sync({
      ...lobbyState,
      diagnostics: { activeVisualMode: 'eco' },
    })
    expect(updateBackground).toHaveBeenLastCalledWith(false, 123, null)

    const main = (manager as any).windows.get('main')
    main.isFocused.mockReturnValue(false)
    manager.sync(lobbyState)
    expect(updateBackground).toHaveBeenLastCalledWith(false, 123, null)
    main.isFocused.mockReturnValue(true)

    manager.setLobbyBackgroundPresentation({ livePageVisible: true, reducedMotion: true })
    manager.sync(lobbyState)
    expect(updateBackground).toHaveBeenLastCalledWith(false, 123, null)
    manager.setLobbyBackgroundPresentation({ livePageVisible: true, reducedMotion: false })

    manager.sync({
      ...lobbyState,
      snapshot: { ...lobbyState.snapshot, phase: 'ChampSelect', matchStage: 'selecting' },
    })
    expect(updateBackground).toHaveBeenLastCalledWith(false, 123, null)
  })

  it('stops the Lobby capture controller for capture transactions and shutdown', async () => {
    const manager = new WindowManager({} as any)
    const stopBackground = vi.spyOn((manager as any).lobbyBackground, 'stop').mockImplementation(() => {})
    const main = {
      ...fakeWindow({ visible: true, focused: false }),
      webContents: { isDestroyed: () => false, send: vi.fn() },
    }
    ;(manager as any).windows.set('main', main)

    await manager.captureWithoutHexBridgeWindows(async () => undefined)
    expect(stopBackground).toHaveBeenCalled()
    const callsAfterCapture = stopBackground.mock.calls.length
    manager.prepareToQuit()
    expect(stopBackground.mock.calls.length).toBeGreaterThan(callsAfterCapture)
  })

  it('keeps a manually closed champion companion hidden for the current match only', () => {
    const manager = new WindowManager({} as any)
    const leagueWindows = (manager as any).leagueWindows
    // Isolate dismissal semantics from the Windows-only native placement gate.
    vi.spyOn(leagueWindows, 'setEnabled').mockImplementation(() => {})
    vi.spyOn(leagueWindows, 'hasObservation').mockReturnValue(true)
    vi.spyOn(leagueWindows, 'isClientVisible').mockReturnValue(true)
    vi.spyOn(leagueWindows, 'isTargetPlaced').mockReturnValue(true)
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const champion = {
      ...fakeWindow({ visible: false, focused: false }),
      webContents: sender,
    }
    ;(manager as any).windows.set('champion', champion)

    manager.sync(state)
    expect(champion.showInactive).toHaveBeenCalledOnce()
    manager.handleAction(sender as any, 'close')
    manager.sync(state)
    expect(champion.hide).toHaveBeenCalled()
    expect(champion.showInactive).toHaveBeenCalledOnce()

    manager.sync({
      ...state,
      snapshot: { ...state.snapshot, matchGeneration: 2 },
    })
    expect(champion.showInactive).toHaveBeenCalledTimes(2)
  })

  it('routes quit through Electron without committing WindowManager shutdown first', () => {
    const manager = new WindowManager({} as any)
    vi.mocked(app.quit).mockClear()
    manager.handleAction({} as any, 'quit')
    expect(app.quit).toHaveBeenCalledOnce()
    expect((manager as any).quitting).toBe(false)
  })

  it('keeps ordinary main-window close as hide-to-tray without requesting application quit', () => {
    const manager = new WindowManager({} as any)
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const main = { ...fakeWindow({ visible: true, focused: true }), webContents: sender }
    ;(manager as any).windows.set('main', main)
    vi.mocked(app.quit).mockClear()
    manager.handleAction(sender as any, 'close')
    expect(main.hide).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    expect((manager as any).quitting).toBe(false)
  })

  it('does not create a calibration window when shutdown starts during capture', async () => {
    let finishCapture!: (sources: unknown[]) => void
    vi.mocked(screen.getAllDisplays).mockReturnValue([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] as any)
    vi.mocked(screen.getPrimaryDisplay).mockReturnValue({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 } as any)
    vi.mocked(desktopCapturer.getSources).mockReturnValue(new Promise((resolve) => { finishCapture = resolve }) as any)
    const manager = new WindowManager({ getSettings: () => ({ displayId: '', calibration: null }) } as any)
    const main = { isDestroyed: () => false, isVisible: () => true, hide: vi.fn() }
    const createWindow = vi.spyOn(manager as any, 'createWindow')
    ;(manager as any).windows.set('main', main)

    const calibration = manager.startCalibration()
    await vi.waitFor(() => expect(desktopCapturer.getSources).toHaveBeenCalled())
    manager.prepareToQuit()
    finishCapture([])

    await expect(calibration).rejects.toThrow('校准已取消')
    expect(createWindow).not.toHaveBeenCalled()
    expect(main.hide).toHaveBeenCalledOnce()
  })

  it('can resume synchronization when an installer launch aborts', () => {
    const manager = new WindowManager({} as any)
    const activityChanged = vi.fn()
    manager.setActivityChangedHandler(activityChanged)
    const token = manager.prepareForUpdateInstall()
    manager.cancelPreparedQuit(token)
    ;(manager as any).notifyActivityChanged()
    expect(activityChanged).toHaveBeenCalledOnce()
  })

  it('never resumes callbacks after a prepared install becomes a committed quit', () => {
    const manager = new WindowManager({} as any)
    const activityChanged = vi.fn()
    manager.setActivityChangedHandler(activityChanged)
    const token = manager.prepareForUpdateInstall()

    manager.prepareToQuit()
    manager.cancelPreparedQuit(token)
    ;(manager as any).notifyActivityChanged()
    expect(activityChanged).not.toHaveBeenCalled()
    expect(() => manager.sync(state)).not.toThrow()
  })

  it('does not let an older install token cancel a newer preparation', () => {
    const manager = new WindowManager({} as any)
    const activityChanged = vi.fn()
    manager.setActivityChangedHandler(activityChanged)
    const firstToken = manager.prepareForUpdateInstall()
    manager.cancelPreparedQuit(firstToken)
    const secondToken = manager.prepareForUpdateInstall()

    manager.cancelPreparedQuit(firstToken)
    ;(manager as any).notifyActivityChanged()
    expect(activityChanged).not.toHaveBeenCalled()

    manager.cancelPreparedQuit(secondToken)
    ;(manager as any).notifyActivityChanged()
    expect(activityChanged).toHaveBeenCalledOnce()
  })
})
