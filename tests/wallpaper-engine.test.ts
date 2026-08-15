import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WallpaperEnginePreferences, WallpaperEngineTarget } from '../src/shared/contracts.js'
import {
  discoverWallpaperEngineExecutable,
  executeWallpaperTarget,
  wallpaperEngineIsRunning,
  WallpaperEngineController,
  type WallpaperEngineContext,
} from '../src/main/wallpaper-engine.js'

const activeContext = (championId = 103, generation = 1): WallpaperEngineContext => ({
  modeActive: true,
  matchStage: 'active',
  matchGeneration: generation,
  championId,
})

const noContext = (): WallpaperEngineContext => ({
  modeActive: false,
  matchStage: 'none',
  matchGeneration: 1,
  championId: null,
})

const preferences = (): WallpaperEnginePreferences => ({
  championTargetType: 'profile',
  championTargetTemplate: 'HexBridge-{id}',
  restoreTarget: { type: 'playlist', name: 'Daily restore' },
})

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function createController(overrides: {
  enabled?: () => boolean
  preferences?: () => WallpaperEnginePreferences
  lease?: { value: boolean }
  running?: () => Promise<boolean>
  execute?: (target: WallpaperEngineTarget) => Promise<void>
} = {}) {
  const lease = overrides.lease ?? { value: false }
  const execute = vi.fn(async (_executable: string, target: WallpaperEngineTarget) => {
    await overrides.execute?.(target)
  })
  const onStateChanged = vi.fn()
  const controller = new WallpaperEngineController({
    platform: 'win32',
    getEnabled: overrides.enabled ?? (() => true),
    getPreferences: overrides.preferences ?? preferences,
    isLeaseHeld: () => lease.value,
    setLeaseHeld: (held) => { lease.value = held },
    onStateChanged,
    discoverExecutable: async () => 'C:\\Steam\\wallpaper_engine\\wallpaper64.exe',
    isRunning: async () => overrides.running ? overrides.running() : true,
    executeTarget: execute,
  })
  return { controller, execute, lease, onStateChanged }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('WallpaperEngineController', () => {
  it('applies one profile per hero context and does not repeat it on LCU heartbeats', async () => {
    const { controller, execute, lease } = createController()
    await controller.initialize(activeContext())
    controller.reconcile(activeContext())
    await Promise.resolve()

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toEqual({ type: 'profile', name: 'HexBridge-103' })
    expect(lease.value).toBe(true)
    expect(controller.getState()).toMatchObject({ status: 'active', championId: 103 })
    expect(Object.keys(controller.getState()).sort()).toEqual([
      'championId',
      'configured',
      'errorCode',
      'message',
      'status',
      'supported',
    ])
    expect(JSON.stringify(controller.getState())).not.toContain('HexBridge-103')
    expect(JSON.stringify(controller.getState())).not.toContain('wallpaper64.exe')
  })

  it('debounces hero swaps and only applies the latest champion', async () => {
    vi.useFakeTimers()
    const { controller, execute } = createController()
    await controller.initialize(noContext())
    controller.reconcile(activeContext(81))
    controller.reconcile(activeContext(63))
    expect(execute).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(350)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toEqual({ type: 'profile', name: 'HexBridge-63' })
  })

  it('serializes a late hero command and restores instead of allowing stale state to win', async () => {
    const first = deferred<void>()
    const targets: WallpaperEngineTarget[] = []
    const { controller, lease } = createController({
      execute: async (target) => {
        targets.push(target)
        if (targets.length === 1) await first.promise
      },
    })
    const initializing = controller.initialize(activeContext(103))
    await vi.waitFor(() => expect(targets).toHaveLength(1))
    controller.reconcile(activeContext(81), true)
    controller.reconcile(noContext(), true)
    first.resolve()
    await initializing

    expect(targets).toEqual([
      { type: 'profile', name: 'HexBridge-103' },
      { type: 'playlist', name: 'Daily restore' },
    ])
    expect(lease.value).toBe(false)
    expect(controller.getState()).toMatchObject({ status: 'idle', championId: null })
  })

  it('serializes a late hero command and applies only the newest hero afterwards', async () => {
    const first = deferred<void>()
    const targets: WallpaperEngineTarget[] = []
    const { controller } = createController({
      execute: async (target) => {
        targets.push(target)
        if (targets.length === 1) await first.promise
      },
    })
    const initializing = controller.initialize(activeContext(103))
    await vi.waitFor(() => expect(targets).toHaveLength(1))
    controller.reconcile(activeContext(81), true)
    first.resolve()
    await initializing

    expect(targets).toEqual([
      { type: 'profile', name: 'HexBridge-103' },
      { type: 'profile', name: 'HexBridge-81' },
    ])
    expect(controller.getState()).toMatchObject({ status: 'active', championId: 81 })
  })

  it('restores a persisted crash lease before doing any new work', async () => {
    const lease = { value: true }
    const { controller, execute } = createController({ lease, enabled: () => false })
    await controller.initialize(noContext())
    expect(execute.mock.calls[0]?.[1]).toEqual({ type: 'playlist', name: 'Daily restore' })
    expect(lease.value).toBe(false)
  })

  it('restores a persisted crash lease before applying an already-active hero', async () => {
    const lease = { value: true }
    const targets: WallpaperEngineTarget[] = []
    const { controller } = createController({
      lease,
      execute: async (target) => { targets.push(target) },
    })

    await controller.initialize(activeContext(81, 4))

    expect(targets).toEqual([
      { type: 'playlist', name: 'Daily restore' },
      { type: 'profile', name: 'HexBridge-81' },
    ])
    expect(lease.value).toBe(true)
    expect(controller.getState()).toMatchObject({ status: 'active', championId: 81 })
  })

  it('fails closed without starting Wallpaper Engine when its process is absent', async () => {
    const { controller, execute, lease } = createController({ running: async () => false })
    await controller.initialize(activeContext())
    expect(execute).not.toHaveBeenCalled()
    expect(lease.value).toBe(false)
    expect(controller.getState()).toMatchObject({ status: 'not-running', errorCode: 'WE_NOT_RUNNING' })
  })

  it('keeps the recovery lease when restore fails so the next launch can retry', async () => {
    const lease = { value: true }
    const { controller } = createController({
      lease,
      enabled: () => false,
      execute: async () => { throw new Error('rejected') },
    })
    await controller.initialize(noContext())
    expect(lease.value).toBe(true)
    expect(controller.getState()).toMatchObject({ status: 'error', errorCode: 'WE_COMMAND_FAILED' })
  })

  it('restores on a bounded exit and never reapplies the hero afterwards', async () => {
    const targets: WallpaperEngineTarget[] = []
    const { controller, lease } = createController({ execute: async (target) => { targets.push(target) } })
    await controller.initialize(activeContext())
    await controller.prepareForExit(500)
    controller.reconcile(activeContext(81), true)
    await Promise.resolve()
    expect(targets).toEqual([
      { type: 'profile', name: 'HexBridge-103' },
      { type: 'playlist', name: 'Daily restore' },
    ])
    expect(lease.value).toBe(false)
  })

  it('keeps the crash-recovery lease when bounded exit restoration times out', async () => {
    const never = deferred<void>()
    const { controller, lease } = createController({
      execute: async (target) => {
        if (target.type === 'playlist') await never.promise
      },
    })
    await controller.initialize(activeContext())
    await controller.prepareForExit(5)
    expect(lease.value).toBe(true)
    expect(controller.getState()).toMatchObject({ status: 'restoring' })
    controller.dispose()
  })
})

describe('Wallpaper Engine command and Steam discovery boundaries', () => {
  it('passes only the allowlisted profile command as separate arguments without a shell', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await executeWallpaperTarget(
      'C:\\Steam\\wallpaper64.exe',
      { type: 'profile', name: 'HexBridge-103 & calc' },
      run,
    )
    expect(run).toHaveBeenCalledWith(
      'C:\\Steam\\wallpaper64.exe',
      ['-control', 'openProfile', '-profile', 'HexBridge-103 & calc'],
      { timeoutMs: 2_000, maxBuffer: 64 * 1024 },
    )
  })

  it('finds only a fixed Wallpaper Engine executable under Steam app 431960', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-wallpaper-steam-'))
    try {
      await mkdir(path.join(root, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true })
      await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" {}', 'utf8')
      await writeFile(
        path.join(root, 'steamapps', 'appmanifest_431960.acf'),
        '"AppState" { "appid" "431960" "installdir" "wallpaper_engine" }',
        'utf8',
      )
      const executable = path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'wallpaper64.exe')
      await writeFile(executable, 'fixture', 'utf8')
      expect(await discoverWallpaperEngineExecutable([root])).toBe(executable)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('selects wallpaper32 when both executables exist but only the 32-bit process path is running', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-wallpaper-bitness-'))
    try {
      const appDirectory = path.join(root, 'steamapps', 'common', 'wallpaper_engine')
      await mkdir(appDirectory, { recursive: true })
      await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" {}', 'utf8')
      await writeFile(
        path.join(root, 'steamapps', 'appmanifest_431960.acf'),
        '"AppState" { "appid" "431960" "installdir" "wallpaper_engine" }',
        'utf8',
      )
      const wallpaper32 = path.join(appDirectory, 'wallpaper32.exe')
      await writeFile(path.join(appDirectory, 'wallpaper64.exe'), 'fixture', 'utf8')
      await writeFile(wallpaper32, 'fixture', 'utf8')
      const run = vi.fn(async (_executable: string, args: string[]) => ({
        stdout: args.join(' ').includes('wallpaper32.exe') ? JSON.stringify([wallpaper32]) : '[]',
        stderr: '',
      }))
      expect(await discoverWallpaperEngineExecutable([root], run)).toBe(wallpaper32)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a same-name process whose executable path is not the discovered canonical file', async () => {
    const run = vi.fn(async () => ({
      stdout: JSON.stringify(['D:\\Other\\wallpaper64.exe']),
      stderr: '',
    }))
    await expect(wallpaperEngineIsRunning('C:\\Steam\\wallpaper_engine\\wallpaper64.exe', run)).resolves.toBe(false)
  })

  it('rejects a manifest whose internal app id is not Wallpaper Engine', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-wallpaper-appid-'))
    try {
      const appDirectory = path.join(root, 'steamapps', 'common', 'wallpaper_engine')
      await mkdir(appDirectory, { recursive: true })
      await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" {}', 'utf8')
      await writeFile(
        path.join(root, 'steamapps', 'appmanifest_431960.acf'),
        '"AppState" { "appid" "999" "installdir" "wallpaper_engine" }',
        'utf8',
      )
      await writeFile(path.join(appDirectory, 'wallpaper64.exe'), 'fixture', 'utf8')
      expect(await discoverWallpaperEngineExecutable([root])).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects an app directory that is a symlink or junction outside Steam common', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-wallpaper-ancestor-'))
    try {
      const commonDirectory = path.join(root, 'steamapps', 'common')
      const external = path.join(root, 'external-app')
      await mkdir(commonDirectory, { recursive: true })
      await mkdir(external, { recursive: true })
      await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" {}', 'utf8')
      await writeFile(
        path.join(root, 'steamapps', 'appmanifest_431960.acf'),
        '"AppState" { "appid" "431960" "installdir" "wallpaper_engine" }',
        'utf8',
      )
      await writeFile(path.join(external, 'wallpaper64.exe'), 'fixture', 'utf8')
      await symlink(external, path.join(commonDirectory, 'wallpaper_engine'), process.platform === 'win32' ? 'junction' : 'dir')
      expect(await discoverWallpaperEngineExecutable([root])).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a symlinked executable even when the filename looks valid', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-wallpaper-link-'))
    try {
      const appDirectory = path.join(root, 'steamapps', 'common', 'wallpaper_engine')
      await mkdir(appDirectory, { recursive: true })
      await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" {}', 'utf8')
      await writeFile(
        path.join(root, 'steamapps', 'appmanifest_431960.acf'),
        '"AppState" { "appid" "431960" "installdir" "wallpaper_engine" }',
        'utf8',
      )
      const external = path.join(root, 'external.exe')
      await writeFile(external, 'fixture', 'utf8')
      await symlink(external, path.join(appDirectory, 'wallpaper64.exe'))
      expect(await discoverWallpaperEngineExecutable([root])).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
