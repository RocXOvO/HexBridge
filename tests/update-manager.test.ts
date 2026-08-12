import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyUpdateError,
  sanitizeReleaseNotes,
  UpdateManager,
  type UpdateAdapter,
} from '../src/main/update-manager.js'

class FakeUpdater extends EventEmitter implements UpdateAdapter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = true
  allowDowngrade = true
  fullChangelog = true
  check = vi.fn(async () => undefined)
  download = vi.fn(async () => [] as string[])
  install = vi.fn()

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

    adapter.check.mockImplementationOnce(async () => {
      adapter.emit('update-available', {
        version: '0.1.5',
        releaseName: 'HexBridge v0.1.5',
        releaseNotes: '<b>修复</b> https://example.invalid/private',
        files: [{ size: 200 }],
      })
    })
    expect(await manager.check()).toMatchObject({ ok: true })
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

  it('blocks installation during a game and never invokes the installer', () => {
    const { adapter, manager } = setup(true)
    adapter.emit('update-available', { version: '0.1.5' })
    adapter.emit('update-downloaded', { version: '0.1.5' })
    expect(manager.install()).toEqual({
      ok: false,
      message: '对局进行中不会安装更新，请在对局结束后重试',
    })
    expect(adapter.install).not.toHaveBeenCalled()
  })

  it('recovers from a synchronous installer launch failure', () => {
    const { adapter, manager } = setup()
    adapter.emit('update-available', { version: '0.1.5' })
    adapter.emit('update-downloaded', { version: '0.1.5' })
    adapter.install.mockImplementationOnce(() => { throw new Error('installer failed') })
    expect(manager.install()).toMatchObject({ ok: false })
    expect(manager.getState()).toMatchObject({ status: 'error', errorCode: 'UPDATE_FAILED' })
  })

  it('rejects concurrent operations and preserves a retryable available version on error', async () => {
    const { adapter, manager } = setup()
    adapter.emit('update-available', { version: '0.1.5' })
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
})
