import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  screen: {},
  safeStorage: {},
  BrowserWindow: class {},
  desktopCapturer: {},
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

vi.mock('../src/main/config-store.js', () => ({
  ConfigStore: class {},
}))

import { HexBridgeRuntime } from '../src/main/runtime.js'

describe('runtime user actions', () => {
  it('returns after Key HEAD/save and refreshes catalogs in the background', async () => {
    let release: (() => void) | undefined
    const catalogRefresh = new Promise<void>((resolve) => { release = resolve })
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = {
      validateKey: vi.fn(async () => ({ ok: true, message: 'API Key 验证成功' })),
      initialize: vi.fn(async () => catalogRefresh),
    }
    runtime.sync = vi.fn()

    const result = await runtime.validateAndSaveApiKey('hx_live_12345678')
    expect(result).toEqual({ ok: true, message: 'API Key 验证成功' })
    expect(runtime.data.initialize).toHaveBeenCalledWith(true)
    expect(runtime.sync).toHaveBeenCalledTimes(1)
    release?.()
    await catalogRefresh
  })

  it('does not start catalog refresh when Key validation fails', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = {
      validateKey: vi.fn(async () => ({ ok: false, message: '上游返回 HTTP 401' })),
      initialize: vi.fn(),
    }
    runtime.sync = vi.fn()

    expect(await runtime.validateAndSaveApiKey('hx_live_invalid')).toEqual({
      ok: false,
      message: '上游返回 HTTP 401',
    })
    expect(runtime.data.initialize).not.toHaveBeenCalled()
  })
})
