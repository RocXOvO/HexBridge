import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: class {},
  desktopCapturer: { getSources: vi.fn() },
  screen: { getAllDisplays: vi.fn(), getPrimaryDisplay: vi.fn() },
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../src/main/config-store.js', () => ({ ConfigStore: class {} }))

import { desktopCapturer, screen } from 'electron'
import { WindowManager } from '../src/main/window-manager.js'

const state = {
  settings: { showChampionPanel: true },
  snapshot: { phase: 'ChampSelect', matchStage: 'selecting' },
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
    ;(manager as any).windows.set('main', main)
    ;(manager as any).windows.set('champion', champion)
    const order: string[] = []
    main.hide.mockImplementation(() => order.push('hide-main'))
    champion.hide.mockImplementation(() => order.push('hide-champion'))
    main.showInactive.mockImplementation(() => order.push('restore-main'))
    champion.showInactive.mockImplementation(() => order.push('restore-champion'))

    await manager.captureWithoutHexBridgeWindows(async () => { order.push('capture') })

    expect(order).toEqual(['hide-main', 'hide-champion', 'capture', 'restore-main', 'restore-champion'])
    expect(main.focus).not.toHaveBeenCalled()
    expect(champion.focus).not.toHaveBeenCalled()
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
