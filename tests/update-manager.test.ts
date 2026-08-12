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

const setup = (inGame = false) => {
  const adapter = new FakeUpdater()
  const changed = vi.fn()
  const manager = new UpdateManager({
    currentVersion: '0.1.5',
    supported: true,
    isGameInProgress: () => inGame,
    onStateChanged: changed,
    adapter,
    feeds: [
      { provider: 'generic', url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/' },
      { provider: 'github', owner: 'RocXOvO', repo: 'HexBridge', releaseType: 'release' },
    ],
    scheduleAutomaticChecks: false,
  })
  manager.initialize()
  return { adapter, changed, manager }
}

describe('client update manager', () => {
  it('disables silent behavior and walks through check, download, and explicit install', async () => {
    const { adapter, manager } = setup()
    expect(adapter).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      allowDowngrade: false,
      fullChangelog: false,
    })

    adapter.check.mockResolvedValueOnce(availableResult({
        ...trustedUpdateInfo(),
        releaseName: 'HexBridge v0.1.5',
        releaseNotes: '<b>修复</b> https://example.invalid/private',
    }))
    expect(await manager.check()).toMatchObject({ ok: true })
    expect(adapter.feed).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/',
    })
    expect(manager.getState()).toMatchObject({
      status: 'available',
      availableVersion: '0.1.5',
      releaseNotes: '修复 [链接]',
      total: 200,
    })

    adapter.download.mockImplementationOnce(async () => {
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
    expect(manager.getState()).toMatchObject({ status: 'downloaded', percent: 100 })
    expect(manager.install()).toMatchObject({ ok: true })
    expect(adapter.install).toHaveBeenCalledWith(false, true)
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

  it('recovers from a synchronous installer launch failure', async () => {
    const { adapter, manager } = setup()
    adapter.check.mockResolvedValueOnce(availableResult())
    await manager.check()
    adapter.emit('update-downloaded', { version: '0.1.5' })
    adapter.install.mockImplementationOnce(() => { throw new Error('installer failed') })
    expect(manager.install()).toMatchObject({ ok: false })
    expect(manager.getState()).toMatchObject({ status: 'error', errorCode: 'UPDATE_FAILED' })
  })

  it('falls back from the stable channel to the packaged GitHub provider', async () => {
    const { adapter, manager } = setup()
    adapter.check
      .mockRejectedValueOnce(Object.assign(new Error('net::ERR_FAILED'), { code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' }))
      .mockResolvedValueOnce(availableResult(trustedUpdateInfo('0.1.6', 'HexBridge-0.1.6-x64.exe')))

    expect(await manager.check()).toEqual({ ok: true, message: '发现新版本 0.1.6' })
    expect(adapter.feed.mock.calls).toEqual([
      [{ provider: 'generic', url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/' }],
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
