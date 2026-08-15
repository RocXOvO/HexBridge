import { execFile } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type {
  MatchContextStage,
  WallpaperEnginePreferences,
  WallpaperEngineState,
  WallpaperEngineTarget,
} from '../shared/contracts.js'
import { logger } from './logger.js'

const STEAM_APP_ID = '431960'
const COMMAND_TIMEOUT_MS = 2_000
const COMMAND_OUTPUT_LIMIT = 64 * 1024
const HERO_CHANGE_DEBOUNCE_MS = 350

interface CommandResult {
  stdout: string
  stderr: string
}

type CommandRunner = (
  executable: string,
  args: string[],
  options: { timeoutMs: number; maxBuffer: number },
) => Promise<CommandResult>

export interface WallpaperEngineContext {
  modeActive: boolean
  matchStage: MatchContextStage
  matchGeneration: number
  championId: number | null
}

export interface WallpaperEngineControllerOptions {
  platform?: NodeJS.Platform
  getEnabled: () => boolean
  getPreferences: () => WallpaperEnginePreferences
  isLeaseHeld: () => boolean
  setLeaseHeld: (held: boolean) => void
  onStateChanged: () => void
  discoverExecutable?: () => Promise<string | null>
  isRunning?: (executable: string) => Promise<boolean>
  executeTarget?: (executable: string, target: WallpaperEngineTarget) => Promise<void>
  setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout
  clearTimer?: (timer: NodeJS.Timeout) => void
}

interface DesiredTarget {
  kind: 'champion' | 'restore'
  key: string
  target: WallpaperEngineTarget
  championId: number | null
}

const EMPTY_CONTEXT: WallpaperEngineContext = {
  modeActive: false,
  matchStage: 'none',
  matchGeneration: 0,
  championId: null,
}

export class WallpaperEngineController {
  private readonly platform: NodeJS.Platform
  private readonly discoverExecutable: () => Promise<string | null>
  private readonly isRunning: (executable: string) => Promise<boolean>
  private readonly executeTarget: (executable: string, target: WallpaperEngineTarget) => Promise<void>
  private readonly setTimer: NonNullable<WallpaperEngineControllerOptions['setTimer']>
  private readonly clearTimer: NonNullable<WallpaperEngineControllerOptions['clearTimer']>
  private context: WallpaperEngineContext = { ...EMPTY_CONTEXT }
  private state: WallpaperEngineState
  private executable: string | null = null
  private appliedKey: string | null = null
  private failedKey: string | null = null
  private revision = 0
  private rerun = false
  private running: Promise<void> | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private exiting = false
  private disposed = false
  private recoveryRequired = false

  constructor(private readonly options: WallpaperEngineControllerOptions) {
    this.platform = options.platform ?? process.platform
    this.discoverExecutable = options.discoverExecutable ?? (() => discoverWallpaperEngineExecutable())
    this.isRunning = options.isRunning ?? wallpaperEngineIsRunning
    this.executeTarget = options.executeTarget ?? executeWallpaperTarget
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
    this.state = {
      supported: this.platform === 'win32',
      configured: false,
      status: this.platform === 'win32' ? 'disabled' : 'not-installed',
      championId: null,
      errorCode: null,
      message: this.platform === 'win32'
        ? 'Wallpaper Engine 联动已关闭'
        : 'Wallpaper Engine 联动仅支持 Windows',
    }
    this.refreshConfiguredState()
  }

  getState(): WallpaperEngineState {
    return { ...this.state }
  }

  async initialize(context: WallpaperEngineContext): Promise<void> {
    this.context = { ...context }
    this.exiting = false
    this.disposed = false
    this.recoveryRequired = this.options.isLeaseHeld()
    this.refreshConfiguredState()
    await this.request(true)
  }

  reconcile(context: WallpaperEngineContext, immediate = false): void {
    this.context = { ...context }
    this.refreshConfiguredState()
    void this.request(immediate)
  }

  preferencesChanged(): void {
    this.appliedKey = null
    this.failedKey = null
    this.executable = null
    this.refreshConfiguredState()
    void this.request(true)
  }

  async retry(): Promise<{ ok: boolean; message: string }> {
    this.failedKey = null
    this.executable = null
    await this.request(true)
    return {
      ok: this.state.status === 'active' || this.state.status === 'idle' || this.state.status === 'disabled',
      message: this.state.message,
    }
  }

  async prepareForExit(timeoutMs = 2_500): Promise<void> {
    this.exiting = true
    this.clearDebounce()
    this.revision += 1
    this.rerun = true
    const operation = this.drain()
    await Promise.race([
      operation,
      new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, timeoutMs))),
    ])
  }

  resume(context: WallpaperEngineContext): void {
    if (this.disposed) return
    this.exiting = false
    this.context = { ...context }
    this.failedKey = null
    void this.request(true)
  }

  dispose(): void {
    this.disposed = true
    this.exiting = true
    this.revision += 1
    this.rerun = false
    this.clearDebounce()
  }

  private async request(immediate: boolean): Promise<void> {
    if (this.disposed || this.platform !== 'win32') return
    this.revision += 1
    this.rerun = true
    this.clearDebounce()
    const desired = this.desiredTarget()
    if (!immediate && desired?.kind === 'champion') {
      this.debounceTimer = this.setTimer(() => {
        this.debounceTimer = null
        void this.drain()
      }, HERO_CHANGE_DEBOUNCE_MS)
      return
    }
    await this.drain()
  }

  private drain(): Promise<void> {
    if (this.running) return this.running
    const operation = (async () => {
      do {
        this.rerun = false
        await this.runLatestTarget()
      } while (this.rerun && !this.disposed)
    })().finally(() => {
      if (this.running === operation) this.running = null
    })
    this.running = operation
    return operation
  }

  private async runLatestTarget(): Promise<void> {
    const capturedRevision = this.revision
    const desired = this.desiredTarget()
    if (!desired) {
      this.publishIdleState()
      return
    }
    if (desired.key === this.appliedKey) {
      this.patch({
        status: desired.kind === 'champion' ? 'active' : 'idle',
        championId: desired.championId,
        errorCode: null,
        message: desired.kind === 'champion'
          ? '已向 Wallpaper Engine 发送当前英雄配置'
          : '已恢复用户指定的桌面配置',
      })
      return
    }
    if (desired.key === this.failedKey) return

    const executable = this.executable ?? await this.discoverExecutable().catch(() => null)
    if (capturedRevision !== this.revision) {
      this.rerun = true
      return
    }
    if (!executable) {
      this.failedKey = desired.key
      this.patch({
        status: 'not-installed',
        championId: null,
        errorCode: 'WE_NOT_INSTALLED',
        message: '未在 Steam 库中找到 Wallpaper Engine',
      })
      return
    }
    this.executable = executable
    const running = await this.isRunning(executable).catch(() => false)
    if (capturedRevision !== this.revision) {
      this.rerun = true
      return
    }
    if (!running) {
      this.failedKey = desired.key
      this.patch({
        status: 'not-running',
        championId: null,
        errorCode: 'WE_NOT_RUNNING',
        message: 'Wallpaper Engine 未运行；HexBridge 不会自动启动它',
      })
      return
    }

    if (desired.kind === 'champion') this.options.setLeaseHeld(true)
    const startedAt = Date.now()
    this.patch({
      status: desired.kind === 'champion' ? 'applying' : 'restoring',
      championId: desired.championId,
      errorCode: null,
      message: desired.kind === 'champion'
        ? '正在请求 Wallpaper Engine 切换英雄桌面…'
        : '正在恢复用户指定的桌面配置…',
    })
    try {
      await this.executeTarget(executable, desired.target)
      logger.info('Wallpaper Engine control completed', {
        action: desired.kind,
        durationMs: Date.now() - startedAt,
      })
      if (desired.kind === 'restore') {
        this.options.setLeaseHeld(false)
        this.recoveryRequired = false
      }
      this.appliedKey = desired.key
      this.failedKey = null
      if (desired.kind === 'restore' && !this.exiting && this.context.modeActive) {
        this.rerun = true
      }
      if (capturedRevision !== this.revision) {
        this.rerun = true
        return
      }
      this.patch({
        status: desired.kind === 'champion' ? 'active' : 'idle',
        championId: desired.championId,
        errorCode: null,
        message: desired.kind === 'champion'
          ? '已向 Wallpaper Engine 发送当前英雄配置'
          : '已恢复用户指定的桌面配置',
      })
    } catch (error) {
      logger.warn('Wallpaper Engine control failed', {
        action: desired.kind,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
      })
      this.failedKey = desired.key
      if (capturedRevision !== this.revision) {
        this.rerun = true
        return
      }
      this.patch({
        status: 'error',
        championId: desired.championId,
        errorCode: 'WE_COMMAND_FAILED',
        message: desired.kind === 'champion'
          ? 'Wallpaper Engine 未确认切换请求，可重试'
          : '未能恢复桌面配置，将在下次启动时再尝试',
      })
    }
  }

  private desiredTarget(): DesiredTarget | null {
    const preferences = this.options.getPreferences()
    const restore = preferences.restoreTarget
    const leaseHeld = this.options.isLeaseHeld()
    const enabled = this.options.getEnabled()
    const inSupportedContext =
      this.context.modeActive &&
      this.context.matchStage !== 'none' &&
      Number.isInteger(this.context.championId) &&
      (this.context.championId ?? 0) > 0

    if (leaseHeld && (this.exiting || this.recoveryRequired)) {
      if (!restore) return null
      return {
        kind: 'restore',
        key: `restore:${restore.type}:${restore.name}`,
        target: restore,
        championId: null,
      }
    }
    if (!this.exiting && enabled && restore && inSupportedContext) {
      const championId = this.context.championId as number
      const name = preferences.championTargetTemplate.replaceAll('{id}', String(championId))
      const target: WallpaperEngineTarget = {
        type: preferences.championTargetType,
        name,
      }
      return {
        kind: 'champion',
        key: `champion:${this.context.matchGeneration}:${championId}:${target.type}:${target.name}`,
        target,
        championId,
      }
    }
    if (leaseHeld) {
      if (!restore) return null
      return {
        kind: 'restore',
        key: `restore:${restore.type}:${restore.name}`,
        target: restore,
        championId: null,
      }
    }
    return null
  }

  private publishIdleState(): void {
    const configured = this.isConfigured()
    if (this.options.isLeaseHeld() && !configured) {
      this.patch({
        configured: false,
        status: 'error',
        championId: null,
        errorCode: 'WE_RESTORE_NOT_CONFIGURED',
        message: '需先配置恢复 Profile 或 Playlist',
      })
      return
    }
    if (!this.options.getEnabled()) {
      this.patch({
        configured,
        status: 'disabled',
        championId: null,
        errorCode: null,
        message: 'Wallpaper Engine 联动已关闭',
      })
      return
    }
    if (!configured) {
      this.patch({
        configured: false,
        status: 'unconfigured',
        championId: null,
        errorCode: 'WE_NOT_CONFIGURED',
        message: '需先配置英雄命名模板和恢复目标',
      })
      return
    }
    this.patch({
      configured: true,
      status: 'idle',
      championId: null,
      errorCode: null,
      message: '等待受支持的对局英雄',
    })
  }

  private isConfigured(): boolean {
    const preferences = this.options.getPreferences()
    return Boolean(preferences.restoreTarget && preferences.championTargetTemplate.includes('{id}'))
  }

  private refreshConfiguredState(): void {
    this.state = {
      ...this.state,
      configured: this.isConfigured(),
    }
  }

  private patch(patch: Partial<WallpaperEngineState>): void {
    const next = { ...this.state, ...patch }
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    this.options.onStateChanged()
  }

  private clearDebounce(): void {
    if (!this.debounceTimer) return
    this.clearTimer(this.debounceTimer)
    this.debounceTimer = null
  }
}

export async function discoverWallpaperEngineExecutable(
  roots = defaultSteamRoots(),
  runCommand: CommandRunner = runCommandDefault,
): Promise<string | null> {
  if (process.platform !== 'win32' && roots.length === 0) return null
  const candidates = new Set(roots.map((root) => path.resolve(root)))
  for (const registryRoot of await registrySteamRoots(runCommand)) candidates.add(path.resolve(registryRoot))
  for (const root of [...candidates]) {
    const libraryFile = path.join(root, 'steamapps', 'libraryfolders.vdf')
    const text = await boundedRead(libraryFile, 512 * 1024)
    if (!text) continue
    for (const match of text.matchAll(/"path"\s+"([^"]+)"/giu)) {
      const library = match[1]?.replaceAll('\\\\', '\\').trim()
      if (library) candidates.add(path.resolve(library))
    }
  }
  const executables: string[] = []
  for (const root of candidates) {
    const steamappsDirectory = path.join(root, 'steamapps')
    const commonDirectory = path.join(steamappsDirectory, 'common')
    const manifestPath = path.join(steamappsDirectory, `appmanifest_${STEAM_APP_ID}.acf`)
    const manifest = await boundedRead(manifestPath, 256 * 1024)
    if (!manifest || !/"appid"\s+"431960"/iu.test(manifest)) continue
    const installDir = manifest.match(/"installdir"\s+"([A-Za-z0-9 _.()-]{1,80})"/iu)?.[1]
    if (!installDir) continue
    const appDirectory = path.join(commonDirectory, installDir)
    for (const name of ['wallpaper64.exe', 'wallpaper32.exe']) {
      const candidate = path.join(appDirectory, name)
      if (await validExecutableInside(candidate, {
        root,
        steamappsDirectory,
        commonDirectory,
        appDirectory,
      })) executables.push(candidate)
    }
  }
  for (const executable of executables) {
    if (await wallpaperEngineIsRunning(executable, runCommand).catch(() => false)) return executable
  }
  return executables[0] ?? null
}

async function registrySteamRoots(runCommand: CommandRunner): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const queries = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
  ] as const
  const roots: string[] = []
  for (const [key, value] of queries) {
    try {
      const result = await runCommand('reg.exe', ['query', key, '/v', value], {
        timeoutMs: 1_500,
        maxBuffer: 32 * 1024,
      })
      const match = result.stdout.match(/REG_SZ\s+([^\r\n]+)/iu)
      if (match?.[1]?.trim()) roots.push(match[1].trim())
    } catch {
      // Steam may be installed only for another scope; fixed roots remain.
    }
  }
  return roots
}

function defaultSteamRoots(): string[] {
  if (process.platform !== 'win32') return []
  return [
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : '',
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ].filter(Boolean)
}

async function boundedRead(filePath: string, limit: number): Promise<string | null> {
  try {
    const stats = await lstat(filePath)
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > limit) return null
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function validExecutableInside(
  candidate: string,
  directories: {
    root: string
    steamappsDirectory: string
    commonDirectory: string
    appDirectory: string
  },
): Promise<boolean> {
  try {
    const directoryPaths = [
      directories.root,
      directories.steamappsDirectory,
      directories.commonDirectory,
      directories.appDirectory,
    ]
    const directoryStats = await Promise.all(directoryPaths.map((entry) => lstat(entry)))
    if (directoryStats.some((stats) => !stats.isDirectory() || stats.isSymbolicLink())) return false
    const executableStats = await lstat(candidate)
    if (!executableStats.isFile() || executableStats.isSymbolicLink()) return false
    const [realRoot, realSteamapps, realCommon, realApp, realCandidate] = await Promise.all([
      realpath(directories.root),
      realpath(directories.steamappsDirectory),
      realpath(directories.commonDirectory),
      realpath(directories.appDirectory),
      realpath(candidate),
    ])
    return (
      sameFilesystemPath(path.dirname(realSteamapps), realRoot) &&
      sameFilesystemPath(path.dirname(realCommon), realSteamapps) &&
      sameFilesystemPath(path.dirname(realApp), realCommon) &&
      sameFilesystemPath(path.dirname(realCandidate), realApp) &&
      ['wallpaper64.exe', 'wallpaper32.exe'].includes(path.basename(realCandidate).toLowerCase())
    )
  } catch {
    return false
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  const normalize = process.platform === 'win32'
    ? (value: string): string => path.win32.normalize(value).toLowerCase()
    : (value: string): string => path.normalize(value)
  return normalize(left) === normalize(right)
}

export async function wallpaperEngineIsRunning(
  executable: string,
  runCommand: CommandRunner = runCommandDefault,
): Promise<boolean> {
  const expected = path.win32.basename(executable).toLowerCase()
  if (expected !== 'wallpaper64.exe' && expected !== 'wallpaper32.exe') return false
  const script = [
    "$ErrorActionPreference='Stop'",
    `$paths=@(Get-CimInstance Win32_Process -Filter "Name='${expected}'" | ForEach-Object { $_.ExecutablePath })`,
    'ConvertTo-Json -Compress -InputObject $paths',
  ].join(';')
  const result = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], { timeoutMs: 2_000, maxBuffer: 64 * 1024 })
  const parsed = JSON.parse(result.stdout.trim() || '[]') as unknown
  const paths = Array.isArray(parsed) ? parsed : [parsed]
  const expectedPath = path.win32.normalize(executable).toLowerCase()
  return paths.some((entry) => (
    typeof entry === 'string' && path.win32.normalize(entry).toLowerCase() === expectedPath
  ))
}

export async function executeWallpaperTarget(
  executable: string,
  target: WallpaperEngineTarget,
  runCommand: CommandRunner = runCommandDefault,
): Promise<void> {
  const action = target.type === 'profile' ? 'openProfile' : 'openPlaylist'
  const flag = target.type === 'profile' ? '-profile' : '-playlist'
  await runCommand(executable, ['-control', action, flag, target.name], {
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_OUTPUT_LIMIT,
  })
}

function runCommandDefault(
  executable: string,
  args: string[],
  options: { timeoutMs: number; maxBuffer: number },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      windowsHide: true,
      shell: false,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout, stderr })
    })
  })
}
