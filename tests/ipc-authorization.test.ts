import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: electronMock.handle },
}))

vi.mock('../src/main/config-store.js', () => ({
  sanitizeWallpaperEnginePreferences: (value: unknown) => value,
}))

vi.mock('../src/main/runtime.js', () => ({ HexBridgeRuntime: class {} }))

import { registerIpc } from '../src/main/ipc.js'

describe('IPC sender authorization', () => {
  const mainSender = { route: 'main' }
  const championSender = { route: 'champion' }
  const calibrationSender = { route: 'calibration' }
  const replacedMainSender = { route: 'stale-main' }

  beforeEach(() => {
    electronMock.handlers.clear()
    electronMock.handle.mockClear()
  })

  function setup(): {
    clearDiagnostics: ReturnType<typeof vi.fn>
    retryLcu: ReturnType<typeof vi.fn>
    updateSettings: ReturnType<typeof vi.fn>
    sampleLiveClient: ReturnType<typeof vi.fn>
    captureLiveClientPrivate: ReturnType<typeof vi.fn>
    clearLiveClientPrivate: ReturnType<typeof vi.fn>
  } {
    const clearDiagnostics = vi.fn(() => 'cleared')
    const retryLcu = vi.fn(() => 'retried')
    const updateSettings = vi.fn((patch) => patch)
    const sampleLiveClient = vi.fn((step) => ({ ok: true, message: 'sampled', sample: { step } }))
    const captureLiveClientPrivate = vi.fn((step) => ({ ok: true, message: 'captured', fileName: `${step}.json`, bytes: 12 }))
    const clearLiveClientPrivate = vi.fn(() => ({ ok: true, message: 'cleared-private' }))
    const windowManager = {
      isWindowSender: vi.fn((name: 'main' | 'calibration', sender: unknown) =>
        name === 'main' ? sender === mainSender : sender === calibrationSender),
    }
    registerIpc({
      getWindowManager: () => windowManager,
      clearDiagnosticScreenshots: clearDiagnostics,
      retryLcuConnection: retryLcu,
      updateSettings,
      sampleLiveClientDiagnostics: sampleLiveClient,
      captureLiveClientPrivateData: captureLiveClientPrivate,
      clearLiveClientPrivateData: clearLiveClientPrivate,
    } as any)
    return { clearDiagnostics, retryLcu, updateSettings, sampleLiveClient, captureLiveClientPrivate, clearLiveClientPrivate }
  }

  it.each([
    ['hexbridge:clear-diagnostics', 'clearDiagnostics', 'cleared'],
    ['hexbridge:retry-lcu', 'retryLcu', 'retried'],
  ] as const)('allows the active Main sender to invoke %s', (channel, method, expected) => {
    const runtime = setup()
    const handler = electronMock.handlers.get(channel)
    expect(handler).toBeTypeOf('function')
    expect(handler?.({ sender: mainSender })).toBe(expected)
    expect(runtime[method]).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['champion', championSender],
    ['calibration', calibrationSender],
    ['unknown', {}],
    ['replaced Main', replacedMainSender],
  ])('rejects the %s sender before either privileged action runs', (_label, sender) => {
    const runtime = setup()
    const clearHandler = electronMock.handlers.get('hexbridge:clear-diagnostics')
    const retryHandler = electronMock.handlers.get('hexbridge:retry-lcu')

    expect(() => clearHandler?.({ sender })).toThrow('该操作不允许从当前窗口调用')
    expect(() => retryHandler?.({ sender })).toThrow('该操作不允许从当前窗口调用')
    expect(runtime.clearDiagnostics).not.toHaveBeenCalled()
    expect(runtime.retryLcu).not.toHaveBeenCalled()
  })

  it('drops legacy private directory input before the Main settings update', () => {
    const runtime = setup()
    const handler = electronMock.handlers.get('hexbridge:update-settings')
    const privateDirectory = 'D:\\Private\\League'

    expect(handler?.({ sender: mainSender }, {
      autoOcr: true,
      gameDirectory: privateDirectory,
    })).toEqual({ autoOcr: true })
    expect(runtime.updateSettings).toHaveBeenCalledWith({ autoOcr: true })
    expect(JSON.stringify(runtime.updateSettings.mock.calls)).not.toContain(privateDirectory)
  })

  it('keeps Live Client diagnostic sampling Main-only', () => {
    const runtime = setup()
    const handler = electronMock.handlers.get('hexbridge:sample-live-client-diagnostics')
    expect(handler?.({ sender: mainSender }, 'cards-visible')).toEqual({
      ok: true,
      message: 'sampled',
      sample: { step: 'cards-visible' },
    })
    expect(runtime.sampleLiveClient).toHaveBeenCalledWith('cards-visible')
    expect(() => handler?.({ sender: championSender }, 'cards-visible')).toThrow('该操作不允许从当前窗口调用')
    expect(runtime.sampleLiveClient).toHaveBeenCalledTimes(1)
  })

  it('keeps full Live Client capture and deletion Main-only', () => {
    const runtime = setup()
    const captureHandler = electronMock.handlers.get('hexbridge:capture-live-client-private-data')
    const clearHandler = electronMock.handlers.get('hexbridge:clear-live-client-private-data')
    expect(captureHandler?.({ sender: mainSender }, 'cards-visible')).toEqual({
      ok: true,
      message: 'captured',
      fileName: 'cards-visible.json',
      bytes: 12,
    })
    expect(clearHandler?.({ sender: mainSender })).toEqual({ ok: true, message: 'cleared-private' })
    expect(runtime.captureLiveClientPrivate).toHaveBeenCalledWith('cards-visible')
    expect(runtime.clearLiveClientPrivate).toHaveBeenCalledTimes(1)
    expect(() => captureHandler?.({ sender: championSender }, 'cards-visible')).toThrow('该操作不允许从当前窗口调用')
    expect(() => clearHandler?.({ sender: championSender })).toThrow('该操作不允许从当前窗口调用')
    expect(runtime.captureLiveClientPrivate).toHaveBeenCalledTimes(1)
    expect(runtime.clearLiveClientPrivate).toHaveBeenCalledTimes(1)
  })
})
