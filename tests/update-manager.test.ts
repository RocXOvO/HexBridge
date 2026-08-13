import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyUpdateError,
  isTrustedUpdateInfo,
  sanitizeReleaseNotes,
  UpdateManager,
  type UpdateAdapter,
} from '../src/main/update-manager.js'

interface TestUpdateInfo {
  version: string
  files: Array<{ url: string; sha512: string; size: number }>
  releaseName?: string
  releaseNotes?: string
}

const trustedUpdateInfo = (
  version = '0.1.5',
  url = `https://github.com/RocXOvO/HexBridge/releases/download/v${version}/HexBridge-${version}-x64.exe`,
): TestUpdateInfo => ({
  version,
  files: [{
    url,
    sha512: `${'A'.repeat(86)}==`,
    size: 200,
  }],
})
const availableResult = (info: TestUpdateInfo = trustedUpdateInfo()) => ({
  isUpdateAvailable: true,
  updateInfo: info,
})
const upToDateResult = (version = '0.1.5') => ({
  isUpdateAvailable: false,
  updateInfo: trustedUpdateInfo(version),
})

class FakeUpdater extends EventEmitter implements UpdateAdapter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = true
  allowDowngrade = true
  fullChangelog = true
  disableDifferentialDownload = true
  logger: UpdateAdapter['logger'] = null
  check = vi.fn(async (): Promise<unknown> => undefined)
  download = vi.fn(async () => [] as string[])
  install = vi.fn()
  feed = vi.fn()

  setFeedURL(options: Parameters<UpdateAdapter['setFeedURL']>[0]): void {
    this.feed(options)
  }

  checkForUpdates(): Promise<unknown> {
    return this.check()
  }

  downloadUpdate(): Promise<string[]> {
    return this.download()
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.install(isSilent, isForceRunAfter)
  }
}

const setup = (inGame = false, lifecycle?: { begin: () => unknown; cancel: (token: unknown) => void }) => {
  const adapter = new FakeUpdater()
  const changed = vi.fn()
  const manager = new UpdateManager({
    currentVersion: '0.1.5',
    supported: true,
    isGameInProgress: () => inGame,
    onStateChanged: changed,
    adapter,
    feeds: [
      { provider: 'generic', url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/', useMultipleRangeRequest: false },
      { provider: 'github', owner: 'RocXOvO', repo: 'HexBridge', releaseType: 'release' },
    ],
    scheduleAutomaticChecks: false,
    beginInstallShutdown: lifecycle?.begin,
    cancelInstallShutdown: lifecycle?.cancel,
  })
  manager.initialize()
  return { adapter, changed, manager }
}

describe('client update manager', () => {
  it('supports the verified update phases and silently installs a differential payload', async () => {
    const { adapter, manager } = setup()
    expect(adapter).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      allowDowngrade: false,
      fullChangelog: false,
      disableDifferentialDownload: false,
    })

    adapter.check.mockResolvedValueOnce(availableResult({
        ...trustedUpdateInfo(),
        releaseName: 'HexBridge v0.1.5',
        releaseNotes: '<b>修复</b> https://example.invalid/private',
    }))
    expect(await manager.check()).toMatchObject({ ok: true })
    expect(adapter.feed).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/',
      useMultipleRangeRequest: false,
    })
    expect(manager.getState()).toMatchObject({
      status: 'available',
      availableVersion: '0.1.5',
      releaseNotes: '修复 [链接]',
      total: 200,
    })

    adapter.download.mockImplementationOnce(async () => {
      adapter.logger?.info('Download block maps (old: hidden, new: hidden)')
      adapter.logger?.info('Full: 200 MB, To download: 2 MB (1%)')
      adapter.emit('download-progress', {
        percent: 51.5,
        transferred: 103,
        total: 200,
        bytesPerSecond: 80,
      })
      adapter.emit('update-downloaded', { version: '0.1.5' })
      return ['hidden-local-path']
    })
    expect(await manager.download()).toMatchObject({ ok: true })
    expect(manager.getState()).toMatchObject({
      status: 'downloaded',
      percent: 100,
      downloadMode: 'differential',
      downloadModeMessage: '差分下载',
    })
    expect(manager.install()).toMatchObject({ ok: true })
    expect(adapter.install).toHaveBeenCalledWith(true, true)
  })

  it('shows a controlled full-package fallback without exposing updater internals', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.download.mockImplementationOnce(async () => {
      adapter.logger?.info('Download block maps (old: private-local-path, new: secret-url)')
      adapter.logger?.error('Cannot download differentially, fallback to full download: C:\\private\\installer.exe')
      adapter.emit('download-progress', { percent: 1, transferred: 2, total: 200 })
      return []
    })

    await manager.download()
    expect(manager.getState()).toMatchObject({
      status: 'downloading',
      downloadMode: 'full',
      downloadModeMessage: '差分不可用，已改用完整安装包',
      message: '差分下载不可用，正在下载完整安装包…',
    })
    expect(JSON.stringify(manager.getState())).not.toContain('private')
    expect(JSON.stringify(manager.getState())).not.toContain('secret-url')
  })

  it('keeps the differential fallback reason after later progress and completion events', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.download.mockImplementationOnce(async () => {
      adapter.logger?.error('Cannot download differentially, fallback to full download: hidden')
      adapter.emit('download-progress', { percent: 80, transferred: 160, total: 200 })
      adapter.emit('update-downloaded', { version: '0.1.5' })
      return []
    })

    await manager.download()
    expect(manager.getState()).toMatchObject({
      status: 'downloaded',
      downloadMode: 'full',
      downloadModeMessage: '差分不可用，已改用完整安装包',
      message: '差分不可用，完整安装包已下载，可在退出对局后重启安装',
    })
    expect(manager.install()).toMatchObject({ ok: true })
    expect(adapter.install).toHaveBeenCalledWith(true, true)
  })

  it('labels an already cached installer without pretending it was a full download', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.download.mockImplementationOnce(async () => {
      adapter.emit('update-downloaded', { version: '0.1.5' })
      return ['hidden-local-path']
    })

    expect(await manager.download()).toMatchObject({ ok: true })
    expect(manager.getState()).toMatchObject({
      status: 'downloaded',
      downloadMode: null,
      downloadModeMessage: '已使用本机缓存',
      message: '已找到本机缓存的更新，可在退出对局后重启安装',
    })
    expect(manager.install()).toMatchObject({ ok: true })
    expect(adapter.install).toHaveBeenCalledWith(true, true)
  })

  it('blocks installation during a game and never invokes the installer', async () => {
    const { adapter, manager } = setup(true)
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.emit('update-downloaded', { version: '0.1.5' })
    expect(manager.install()).toEqual({
      ok: false,
      message: '对局进行中不会安装更新，请在对局结束后重试',
    })
    expect(adapter.install).not.toHaveBeenCalled()
  })

  it('runs check, download and silent install from one explicit update intent', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    adapter.download.mockImplementationOnce(async () => {
      adapter.emit('download-progress', { percent: 100, transferred: 200, total: 200 })
      adapter.emit('update-downloaded', { version: '0.1.5' })
      return []
    })

    expect(await manager.applyUpdate()).toMatchObject({ ok: true })
    expect(adapter.check).toHaveBeenCalledTimes(1)
    expect(adapter.download).toHaveBeenCalledTimes(1)
    expect(adapter.install).toHaveBeenCalledWith(true, true)
  })

  it('blocks the one-click update before any network or installer work during a game', async () => {
    const { adapter, manager } = setup(true)
    expect(await manager.applyUpdate()).toEqual({
      ok: false,
      message: '对局进行中，请在本局结束后更新',
    })
    expect(adapter.check).not.toHaveBeenCalled()
    expect(adapter.download).not.toHaveBeenCalled()
    expect(adapter.install).not.toHaveBeenCalled()
  })

  it('does not start downloading when a game begins while the update check is pending', async () => {
    let inGame = false
    const adapter = new FakeUpdater()
    const manager = new UpdateManager({
      currentVersion: '0.1.5',
      supported: true,
      isGameInProgress: () => inGame,
      onStateChanged: () => undefined,
      adapter,
      scheduleAutomaticChecks: false,
    })
    manager.initialize()
    let resolveCheck!: (value: unknown) => void
    adapter.check.mockReturnValueOnce(new Promise((resolve) => { resolveCheck = resolve }))

    const operation = manager.applyUpdate()
    await Promise.resolve()
    inGame = true
    resolveCheck(availableResult())

    await expect(operation).resolves.toEqual({
      ok: false,
      message: '对局已开始，本次更新已暂停；请在本局结束后重试',
    })
    expect(adapter.download).not.toHaveBeenCalled()
    expect(adapter.install).not.toHaveBeenCalled()
  })

  it('recovers from a synchronous installer launch failure', async () => {
    const order: string[] = []
    const lifecycle = {
      begin: vi.fn(() => { order.push('prepare'); return 7 }),
      cancel: vi.fn((token: unknown) => order.push(`cancel:${token}`)),
    }
    const { adapter, manager } = setup(false, lifecycle)
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.emit('update-downloaded', { version: '0.1.5' })
    adapter.install.mockImplementationOnce(() => {
      order.push('install')
      throw new Error('installer failed')
    })
    expect(manager.install()).toMatchObject({ ok: false })
    expect(manager.getState()).toMatchObject({ status: 'error', errorCode: 'UPDATE_FAILED' })
    expect(order).toEqual(['prepare', 'install', 'cancel:7'])
  })

  it('enters guarded shutdown before launching the installer', async () => {
    const order: string[] = []
    const { adapter, manager } = setup(false, {
      begin: () => { order.push('prepare'); return 8 },
      cancel: (token) => order.push(`cancel:${token}`),
    })
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.emit('update-downloaded', { version: '0.1.5' })
    adapter.install.mockImplementationOnce(() => order.push('install'))

    expect(manager.install()).toMatchObject({ ok: true })
    expect(order).toEqual(['prepare', 'install'])
  })

  it('reports failure when quitAndInstall synchronously emits an updater error', async () => {
    const order: string[] = []
    const { adapter, manager } = setup(false, {
      begin: () => { order.push('prepare'); return 9 },
      cancel: (token) => order.push(`cancel:${token}`),
    })
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.emit('update-downloaded', { version: '0.1.5' })
    adapter.install.mockImplementationOnce(() => adapter.emit('error', new Error('installer failed')))

    expect(manager.install()).toMatchObject({ ok: false })
    expect(manager.getState()).toMatchObject({ status: 'error', errorCode: 'UPDATE_FAILED' })
    expect(order).toEqual(['prepare', 'cancel:9'])
  })

  it('falls back from the stable channel to the packaged GitHub provider', async () => {
    const { adapter, manager } = setup()
    adapter.check
      .mockRejectedValueOnce(Object.assign(new Error('net::ERR_FAILED'), { code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' }))
      .mockResolvedValueOnce(availableResult(trustedUpdateInfo('0.1.6', 'HexBridge-0.1.6-x64.exe')))

    expect(await manager.check()).toEqual({ ok: true, message: '发现新版本 0.1.6' })
    expect(adapter.feed.mock.calls).toEqual([
      [{ provider: 'generic', url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/', useMultipleRangeRequest: false }],
      [{ provider: 'github', owner: 'RocXOvO', repo: 'HexBridge', releaseType: 'release' }],
    ])
    expect(manager.getState()).toMatchObject({ status: 'available', availableVersion: '0.1.6' })
  })

  it('checks the GitHub fallback when the stable channel is stale', async () => {
    const { adapter, manager } = setup()
    adapter.check
      .mockResolvedValueOnce(upToDateResult())
      .mockResolvedValueOnce(availableResult(trustedUpdateInfo('0.1.6', 'HexBridge-0.1.6-x64.exe')))

    expect(await manager.check()).toEqual({ ok: true, message: '发现新版本 0.1.6' })
    expect(adapter.check).toHaveBeenCalledTimes(2)
    expect(manager.getState()).toMatchObject({ status: 'available', availableVersion: '0.1.6' })
  })

  it('keeps a trusted up-to-date result when the fallback provider fails', async () => {
    const { adapter, manager } = setup()
    adapter.check
      .mockResolvedValueOnce(upToDateResult())
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 403 rate limit'), { statusCode: 403 }))

    expect(await manager.check()).toEqual({ ok: true, message: '当前已是最新正式版' })
    expect(manager.getState()).toMatchObject({ status: 'up-to-date', errorCode: null })
  })

  it('clears a previous candidate when new metadata leaves the official release allowlist', async () => {
    const { adapter, manager } = setup()
    adapter.check
      .mockResolvedValueOnce(availableResult())
      .mockResolvedValueOnce(availableResult(trustedUpdateInfo(
        '0.1.6',
        'https://example.invalid/HexBridge-0.1.6-x64.exe',
      )))

    expect(await manager.check()).toMatchObject({ ok: true })
    expect(await manager.check()).toMatchObject({ ok: false })
    expect(manager.getState()).toMatchObject({
      status: 'error',
      availableVersion: null,
      errorCode: 'UPDATE_UNTRUSTED',
    })
    expect(await manager.download()).toMatchObject({ ok: false })
    expect(adapter.download).not.toHaveBeenCalled()
  })

  it('rejects concurrent operations and preserves a retryable available version on error', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    let resolveDownload!: (value: string[]) => void
    const pendingDownload = new Promise<string[]>((resolve) => { resolveDownload = resolve })
    adapter.download.mockReturnValueOnce(pendingDownload)
    const first = manager.download()
    expect(await manager.check()).toMatchObject({ ok: false, message: '更新操作正在进行' })
    adapter.emit('error', new Error('ETIMEDOUT https://github.com/private'))
    resolveDownload([])
    await first
    expect(manager.getState()).toMatchObject({
      status: 'error',
      availableVersion: '0.1.5',
      errorCode: 'UPDATE_OFFLINE',
    })
    expect(JSON.stringify(manager.getState())).not.toContain('github.com')
  })

  it('shares an in-flight check after an early provider result event', async () => {
    const { adapter, manager } = setup()
    let resolveCheck!: (value: unknown) => void
    adapter.check.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCheck = resolve
      adapter.emit('update-not-available', trustedUpdateInfo())
    }))

    const first = manager.check()
    await Promise.resolve()
    const second = manager.check()
    expect(adapter.check).toHaveBeenCalledTimes(1)
    resolveCheck(upToDateResult())
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({ ok: true })
  })

  it('does not consume updater check events before their result promise settles', async () => {
    const { adapter, manager } = setup()
    let resolveCheck!: (value: unknown) => void
    adapter.check.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCheck = resolve
      adapter.emit('update-available', trustedUpdateInfo('9.9.9', 'malicious.exe'))
    }))

    const check = manager.check()
    await Promise.resolve()
    expect(manager.getState().status).toBe('checking')
    resolveCheck(upToDateResult())
    await expect(check).resolves.toEqual({ ok: true, message: '当前已是最新正式版' })
  })

  it('reports unsupported platforms without touching an updater', async () => {
    const manager = new UpdateManager({
      currentVersion: '0.1.5',
      supported: false,
      isGameInProgress: () => false,
      onStateChanged: () => undefined,
      scheduleAutomaticChecks: false,
    })
    manager.initialize()
    expect(manager.getState().status).toBe('unsupported')
    expect(await manager.check()).toMatchObject({ ok: false })
    expect(await manager.download()).toMatchObject({ ok: false })
    expect(manager.install()).toMatchObject({ ok: false })
  })
})

it('sanitizes release notes and exposes only stable update error categories', () => {
  expect(sanitizeReleaseNotes([{ note: '<p>改进</p>' }, { note: 'https://example.com/a' }]))
    .toBe('改进 [链接]')
  expect(classifyUpdateError(new Error('sha512 checksum mismatch'))).toEqual({
    code: 'UPDATE_INTEGRITY',
    message: '更新包校验失败，已保留当前版本',
  })
  expect(classifyUpdateError(Object.assign(new Error('HttpError'), { statusCode: 429 }))).toEqual({
    code: 'UPDATE_RATE_LIMIT',
    message: '更新服务请求过于频繁，请稍后重试或打开官方下载页',
  })
  expect(classifyUpdateError(new Error('net::ERR_HTTP2_PROTOCOL_ERROR'))).toMatchObject({
    code: 'UPDATE_OFFLINE',
  })
  expect(classifyUpdateError(new Error('ERR_CERT_AUTHORITY_INVALID'))).toMatchObject({
    code: 'UPDATE_TLS',
  })
})

it('accepts only the official stable NSIS asset shape', () => {
  expect(isTrustedUpdateInfo(trustedUpdateInfo('0.1.7'), 'generic')).toBe(true)
  expect(isTrustedUpdateInfo(trustedUpdateInfo('0.1.7', 'HexBridge-0.1.7-x64.exe'), 'generic')).toBe(false)
  expect(isTrustedUpdateInfo(trustedUpdateInfo('0.1.7', 'HexBridge-0.1.7-x64.exe'), 'github')).toBe(true)
  expect(isTrustedUpdateInfo(
    trustedUpdateInfo('0.1.7', 'https://example.invalid/HexBridge-0.1.7-x64.exe'),
  )).toBe(false)
  expect(isTrustedUpdateInfo({
    ...trustedUpdateInfo('0.1.7'),
    files: [{ ...trustedUpdateInfo('0.1.7').files[0], sha512: 'missing' }],
  })).toBe(false)
})
