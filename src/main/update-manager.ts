import type { AppUpdateState } from '../shared/contracts.js'
import { logger } from './logger.js'

export interface UpdateAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  fullChangelog: boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface UpdateManagerOptions {
  currentVersion: string
  supported: boolean
  isGameInProgress: () => boolean
  onStateChanged: () => void
  adapter?: UpdateAdapter
  adapterLoader?: () => Promise<UpdateAdapter>
  scheduleAutomaticChecks?: boolean
}

const emptyState = (currentVersion: string, supported: boolean): AppUpdateState => ({
  status: supported ? 'idle' : 'unsupported',
  currentVersion,
  availableVersion: null,
  releaseName: null,
  releaseNotes: '',
  percent: null,
  transferred: null,
  total: null,
  bytesPerSecond: null,
  lastCheckedAt: null,
  errorCode: null,
  message: supported ? '可检查正式版更新' : '仅 Windows 安装版支持客户端内更新',
})

const finiteNonNegative = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null
}

export function sanitizeReleaseNotes(value: unknown): string {
  const source = Array.isArray(value)
    ? value.map((entry) => typeof entry === 'string' ? entry : entry?.note).filter(Boolean).join('\n')
    : typeof value === 'string' ? value : ''
  return source
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[链接]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200)
}

export function classifyUpdateError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/ENOTFOUND|ECONN|ETIMEDOUT|network|offline|internet/i.test(raw)) {
    return { code: 'UPDATE_OFFLINE', message: '无法连接更新服务，请检查网络后重试' }
  }
  if (/sha512|checksum|signature|publisher/i.test(raw)) {
    return { code: 'UPDATE_INTEGRITY', message: '更新包校验失败，已保留当前版本' }
  }
  if (/latest\.yml|metadata|404|release/i.test(raw)) {
    return { code: 'UPDATE_METADATA', message: '更新信息暂不可用，请稍后重试' }
  }
  return { code: 'UPDATE_FAILED', message: '更新操作失败，已保留当前版本' }
}

export class UpdateManager {
  private state: AppUpdateState
  private initialized = false
  private automaticCheckTimer: NodeJS.Timeout | null = null
  private periodicCheckTimer: NodeJS.Timeout | null = null
  private adapter: UpdateAdapter | null = null

  constructor(private readonly options: UpdateManagerOptions) {
    this.state = emptyState(options.currentVersion, options.supported)
  }

  initialize(): void {
    if (this.initialized || !this.options.supported) return
    this.initialized = true
    if (this.options.adapter) {
      this.configure(this.options.adapter)
      return
    }
    if (!this.options.adapterLoader) {
      this.fail(new Error('Updater adapter unavailable'))
      return
    }
    void this.options.adapterLoader().then((adapter) => this.configure(adapter)).catch((error) => {
      this.fail(error)
    })
  }

  private configure(adapter: UpdateAdapter): void {
    this.adapter = adapter
    this.adapter.autoDownload = false
    this.adapter.autoInstallOnAppQuit = false
    this.adapter.allowPrerelease = false
    this.adapter.allowDowngrade = false
    this.adapter.fullChangelog = false
    this.adapter.on('checking-for-update', () => this.patch({
      status: 'checking', errorCode: null, message: '正在检查正式版更新…',
    }))
    this.adapter.on('update-available', (info: any) => this.patch({
      status: 'available',
      availableVersion: safeVersion(info?.version),
      releaseName: safeText(info?.releaseName, 120),
      releaseNotes: sanitizeReleaseNotes(info?.releaseNotes),
      percent: null,
      transferred: null,
      total: finiteNonNegative(info?.files?.[0]?.size),
      bytesPerSecond: null,
      lastCheckedAt: Date.now(),
      errorCode: null,
      message: `发现新版本 ${safeVersion(info?.version) ?? ''}`.trim(),
    }))
    this.adapter.on('update-not-available', () => this.patch({
      status: 'up-to-date',
      availableVersion: null,
      releaseName: null,
      releaseNotes: '',
      lastCheckedAt: Date.now(),
      errorCode: null,
      message: '当前已是最新正式版',
    }))
    this.adapter.on('download-progress', (progress: any) => this.patch({
      status: 'downloading',
      percent: Math.min(100, finiteNonNegative(progress?.percent) ?? 0),
      transferred: finiteNonNegative(progress?.transferred),
      total: finiteNonNegative(progress?.total),
      bytesPerSecond: finiteNonNegative(progress?.bytesPerSecond),
      errorCode: null,
      message: '正在下载更新…',
    }))
    this.adapter.on('update-downloaded', (info: any) => this.patch({
      status: 'downloaded',
      availableVersion: safeVersion(info?.version) ?? this.state.availableVersion,
      percent: 100,
      errorCode: null,
      message: '更新已下载，可在退出对局后重启安装',
    }))
    this.adapter.on('error', (error: unknown) => this.fail(error))

    if (this.options.scheduleAutomaticChecks !== false) {
      this.automaticCheckTimer = setTimeout(() => void this.check(false), 60_000)
      this.periodicCheckTimer = setInterval(() => void this.check(false), 6 * 60 * 60 * 1_000)
    }
    this.patch({ status: 'idle', errorCode: null, message: '可检查正式版更新' })
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  async check(manual = true): Promise<{ ok: boolean; message: string }> {
    if (!this.adapter) return {
      ok: false,
      message: this.options.supported ? '更新服务正在初始化，请稍后重试' : this.state.message,
    }
    if (['checking', 'downloading', 'installing'].includes(this.state.status)) {
      return { ok: false, message: '更新操作正在进行' }
    }
    if (this.state.status === 'downloaded') {
      return { ok: true, message: this.state.message }
    }
    this.patch({ status: 'checking', errorCode: null, message: '正在检查正式版更新…' })
    try {
      await this.adapter.checkForUpdates()
      return { ok: this.state.status !== 'error', message: this.state.message }
    } catch (error) {
      this.fail(error, manual)
      return { ok: false, message: this.state.message }
    }
  }

  async download(): Promise<{ ok: boolean; message: string }> {
    if (!this.adapter) return {
      ok: false,
      message: this.options.supported ? '更新服务正在初始化，请稍后重试' : this.state.message,
    }
    if (this.state.status !== 'available' && !(this.state.status === 'error' && this.state.availableVersion)) {
      return { ok: false, message: '请先检查并确认有可用更新' }
    }
    this.patch({ status: 'downloading', percent: 0, errorCode: null, message: '正在下载更新…' })
    try {
      await this.adapter.downloadUpdate()
      return { ok: this.state.status !== 'error', message: this.state.message }
    } catch (error) {
      this.fail(error)
      return { ok: false, message: this.state.message }
    }
  }

  install(): { ok: boolean; message: string } {
    if (!this.adapter || this.state.status !== 'downloaded') {
      return { ok: false, message: '尚无已下载的更新' }
    }
    if (this.options.isGameInProgress()) {
      return { ok: false, message: '对局进行中不会安装更新，请在对局结束后重试' }
    }
    this.patch({ status: 'installing', message: '正在退出并安装更新…' })
    try {
      this.adapter.quitAndInstall(false, true)
      return { ok: true, message: this.state.message }
    } catch (error) {
      this.fail(error)
      return { ok: false, message: this.state.message }
    }
  }

  stop(): void {
    if (this.automaticCheckTimer) clearTimeout(this.automaticCheckTimer)
    if (this.periodicCheckTimer) clearInterval(this.periodicCheckTimer)
    this.automaticCheckTimer = null
    this.periodicCheckTimer = null
  }

  private fail(error: unknown, manual = true): void {
    const classified = classifyUpdateError(error)
    logger.warn('Update operation failed', {
      code: classified.code,
      errorName: error instanceof Error ? error.name : 'Error',
      manual,
    })
    this.patch({ status: 'error', errorCode: classified.code, message: classified.message })
  }

  private patch(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.options.onStateChanged()
  }
}

function safeVersion(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(text) ? text.slice(0, 40) : null
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength)
  return text || null
}
