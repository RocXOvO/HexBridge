import type { AppUpdateState } from '../shared/contracts.js'
import { logger } from './logger.js'

export interface UpdateAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  fullChangelog: boolean
  disableDifferentialDownload: boolean
  logger: {
    info(message?: unknown): void
    warn(message?: unknown): void
    error(message?: unknown): void
    debug?(message?: unknown): void
  } | null
  setFeedURL(options: UpdateFeedConfiguration): void
  on(event: string, listener: (...args: any[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export type UpdateFeedConfiguration =
  | { provider: 'generic'; url: string; useMultipleRangeRequest: false }
  | { provider: 'github'; owner: string; repo: string; releaseType: 'release' }

interface UpdateManagerOptions {
  currentVersion: string
  supported: boolean
  isGameInProgress: () => boolean
  onStateChanged: () => void
  adapter?: UpdateAdapter
  adapterLoader?: () => Promise<UpdateAdapter>
  feeds?: readonly UpdateFeedConfiguration[]
  scheduleAutomaticChecks?: boolean
  beginInstallShutdown?: () => unknown
  cancelInstallShutdown?: (token: unknown) => void
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
  downloadMode: null,
  downloadModeMessage: '',
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
  const { raw, statusCode } = updateErrorSignals(error)
  if (statusCode === 429 || /rate.?limit|too many requests/i.test(raw)) {
    return { code: 'UPDATE_RATE_LIMIT', message: '更新服务请求过于频繁，请稍后重试或打开官方下载页' }
  }
  if (statusCode === 401 || statusCode === 403 || /HTTP(?:Error)?:?\s*(?:401|403)\b/i.test(raw)) {
    return { code: 'UPDATE_ACCESS', message: '更新服务暂时拒绝请求，请稍后重试或打开官方下载页' }
  }
  if (/certificate|CERT_|TLS|SSL|ERR_CERT/i.test(raw)) {
    return { code: 'UPDATE_TLS', message: '更新服务安全连接失败，请检查系统时间、代理或证书设置' }
  }
  if (
    /ENOTFOUND|ECONN|ETIMEDOUT|network|offline|internet|fetch failed|socket|REFUSED_STREAM/i.test(raw) ||
    /ERR_(?:FAILED|CONNECTION|NETWORK|NAME_NOT_RESOLVED|HTTP2|TIMED_OUT|INTERNET_DISCONNECTED)/i.test(raw)
  ) {
    return { code: 'UPDATE_OFFLINE', message: '无法连接更新服务，请检查网络后重试' }
  }
  if (/sha512|checksum|signature|publisher/i.test(raw)) {
    return { code: 'UPDATE_INTEGRITY', message: '更新包校验失败，已保留当前版本' }
  }
  if (statusCode === 404 || /latest\.yml|metadata|\b404\b|release feed|published versions/i.test(raw)) {
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
  private activeFeedProvider: UpdateFeedConfiguration['provider'] = 'generic'
  private checkInFlight: Promise<{ ok: boolean; message: string }> | null = null
  private applyInFlight: Promise<{ ok: boolean; message: string }> | null = null
  private installShutdownToken: unknown = null
  private differentialFallback = false

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
    this.adapter.disableDifferentialDownload = false
    this.adapter.logger = {
      info: (message) => this.observeUpdaterTransport('info', message),
      warn: (message) => this.observeUpdaterTransport('warn', message),
      error: (message) => this.observeUpdaterTransport('error', message),
      debug: () => undefined,
    }
    this.adapter.on('download-progress', (progress: any) => {
      const downloadMode = this.state.downloadMode === 'preparing' ? 'full' : this.state.downloadMode
      this.patch({
        status: 'downloading',
        percent: Math.min(100, finiteNonNegative(progress?.percent) ?? 0),
        transferred: finiteNonNegative(progress?.transferred),
        total: finiteNonNegative(progress?.total),
        bytesPerSecond: finiteNonNegative(progress?.bytesPerSecond),
        downloadMode,
        downloadModeMessage: downloadMode === 'differential'
          ? '差分下载'
          : this.differentialFallback
            ? '差分不可用，已改用完整安装包'
            : '完整安装包下载',
        errorCode: null,
        message: downloadMode === 'differential'
          ? '正在下载版本差异…'
          : this.differentialFallback
            ? '差分下载不可用，正在下载完整安装包…'
            : '正在下载完整安装包…',
      })
    })
    this.adapter.on('update-downloaded', (info: any) => {
      const downloadedFromCache = this.state.downloadMode === 'preparing'
      this.patch({
        status: 'downloaded',
        availableVersion: safeVersion(info?.version) ?? this.state.availableVersion,
        percent: 100,
        downloadMode: downloadedFromCache ? null : this.state.downloadMode,
        downloadModeMessage: downloadedFromCache ? '已使用本机缓存' : this.state.downloadModeMessage,
        errorCode: null,
        message: this.state.downloadMode === 'differential'
          ? '差分更新已下载，可在退出对局后重启静默更新'
          : this.differentialFallback
            ? '差分不可用，完整安装包已下载，可在退出对局后重启安装'
          : downloadedFromCache
            ? '已找到本机缓存的更新，可在退出对局后重启安装'
            : '更新已下载，可在退出对局后重启安装',
      })
    })
    this.adapter.on('error', (error: unknown) => {
      if (!this.checkInFlight) {
        if (this.state.status === 'installing') this.cancelInstallShutdown()
        this.fail(error)
      }
    })

    if (this.options.scheduleAutomaticChecks !== false) {
      this.automaticCheckTimer = setTimeout(() => void this.check(false), 60_000)
      this.periodicCheckTimer = setInterval(() => void this.check(false), 6 * 60 * 60 * 1_000)
    }
    this.patch({ status: 'idle', errorCode: null, message: '可检查正式版更新' })
  }

  private observeUpdaterTransport(level: 'info' | 'warn' | 'error', value: unknown): void {
    if (this.state.status !== 'downloading') return
    const message = typeof value === 'string' ? value : ''
    if (level === 'info' && (message.startsWith('Download block maps') || /^Full: .*To download:/i.test(message))) {
      this.patch({
        downloadMode: 'differential',
        downloadModeMessage: '差分下载',
        message: '正在准备差分更新…',
      })
      return
    }
    if (level === 'error' && message.startsWith('Cannot download differentially, fallback to full download')) {
      this.differentialFallback = true
      this.patch({
        downloadMode: 'full',
        downloadModeMessage: '差分不可用，已改用完整安装包',
        message: '差分下载不可用，正在改用完整安装包…',
      })
    }
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  check(manual = true): Promise<{ ok: boolean; message: string }> {
    if (!this.adapter) return Promise.resolve({
      ok: false,
      message: this.options.supported ? '更新服务正在初始化，请稍后重试' : this.state.message,
    })
    if (this.checkInFlight) return this.checkInFlight
    if (['checking', 'downloading', 'installing'].includes(this.state.status)) {
      return Promise.resolve({ ok: false, message: '更新操作正在进行' })
    }
    if (this.state.status === 'downloaded') {
      return Promise.resolve({ ok: true, message: this.state.message })
    }
    const operation = Promise.resolve().then(() => this.performCheck(manual))
    const tracked = operation.finally(() => {
      if (this.checkInFlight === tracked) this.checkInFlight = null
    })
    this.checkInFlight = tracked
    return tracked
  }

  private async performCheck(manual: boolean): Promise<{ ok: boolean; message: string }> {
    if (!this.adapter) return { ok: false, message: '更新服务正在初始化，请稍后重试' }
    const feeds = this.options.feeds?.length ? this.options.feeds : [null]
    let lastError: unknown = null
    let trustedUpToDateState: AppUpdateState | null = null
    let trustedFailureState: AppUpdateState | null = null
    for (const [index, feed] of feeds.entries()) {
      this.patch({
        status: 'checking',
        errorCode: null,
        message: index === 0 ? '正在检查正式版更新…' : '主更新通道不可用，正在尝试备用通道…',
      })
      try {
        this.activeFeedProvider = feed?.provider ?? 'generic'
        if (feed) this.adapter.setFeedURL(feed)
        const result = await this.adapter.checkForUpdates()
        this.applyCheckResult(result)
        if (this.state.status === 'up-to-date') {
          trustedUpToDateState ??= { ...this.state }
          if (index < feeds.length - 1) continue
          return { ok: true, message: this.state.message }
        }
        if (this.state.status === 'error') {
          trustedFailureState ??= { ...this.state }
          lastError ??= new Error(this.state.errorCode ?? 'UPDATE_FAILED')
          continue
        }
        if (['available', 'downloaded'].includes(this.state.status)) {
          return { ok: true, message: this.state.message }
        }
        lastError ??= new Error('Update provider returned no terminal state')
      } catch (error) {
        lastError = error
        if (this.state.status === 'error') trustedFailureState ??= { ...this.state }
        logger.warn('Update feed attempt failed', {
          code: classifyUpdateError(error).code,
          feed: feed?.provider ?? 'packaged',
          attempt: index + 1,
        })
      }
    }
    if (trustedUpToDateState) {
      this.state = trustedUpToDateState
      this.options.onStateChanged()
      return { ok: true, message: this.state.message }
    }
    if (trustedFailureState) {
      this.state = trustedFailureState
      this.options.onStateChanged()
      return { ok: false, message: this.state.message }
    }
    this.fail(lastError, manual)
    return { ok: false, message: this.state.message }
  }

  private applyCheckResult(value: unknown): void {
    if (!value || typeof value !== 'object') throw new Error('Update provider returned no result')
    const result = value as Record<string, unknown>
    const info = result.updateInfo ?? result.versionInfo
    if (result.isUpdateAvailable === false) {
      this.patch({
        status: 'up-to-date',
        availableVersion: null,
        releaseName: null,
        releaseNotes: '',
        lastCheckedAt: Date.now(),
        errorCode: null,
        message: '当前已是最新正式版',
      })
      return
    }
    if (result.isUpdateAvailable !== true || !isTrustedUpdateInfo(info, this.activeFeedProvider)) {
      logger.warn('Rejected update metadata outside the release allowlist')
      this.patch({
        status: 'error',
        availableVersion: null,
        releaseName: null,
        releaseNotes: '',
        percent: null,
        transferred: null,
        total: null,
        bytesPerSecond: null,
        downloadMode: null,
        downloadModeMessage: '',
        lastCheckedAt: Date.now(),
        errorCode: 'UPDATE_UNTRUSTED',
        message: '更新信息未通过官方发布地址校验，已停止更新',
      })
      return
    }
    const updateInfo = info as Record<string, any>
    this.patch({
      status: 'available',
      availableVersion: safeVersion(updateInfo.version),
      releaseName: safeText(updateInfo.releaseName, 120),
      releaseNotes: sanitizeReleaseNotes(updateInfo.releaseNotes),
      percent: null,
      transferred: null,
      total: finiteNonNegative(updateInfo.files?.[0]?.size),
      bytesPerSecond: null,
      downloadMode: null,
      downloadModeMessage: '',
      lastCheckedAt: Date.now(),
      errorCode: null,
      message: `发现新版本 ${safeVersion(updateInfo.version) ?? ''}`.trim(),
    })
  }

  async download(): Promise<{ ok: boolean; message: string }> {
    if (!this.adapter) return {
      ok: false,
      message: this.options.supported ? '更新服务正在初始化，请稍后重试' : this.state.message,
    }
    if (this.state.status !== 'available' && !(this.state.status === 'error' && this.state.availableVersion)) {
      return { ok: false, message: '请先检查并确认有可用更新' }
    }
    this.patch({
      status: 'downloading',
      percent: 0,
      downloadMode: 'preparing',
      downloadModeMessage: '正在准备下载方式',
      errorCode: null,
      message: '正在准备更新下载…',
    })
    this.differentialFallback = false
    try {
      await this.adapter.downloadUpdate()
      return { ok: this.state.status !== 'error', message: this.state.message }
    } catch (error) {
      this.fail(error)
      return { ok: false, message: this.state.message }
    }
  }

  applyUpdate(): Promise<{ ok: boolean; message: string }> {
    if (this.applyInFlight) return this.applyInFlight
    if (this.options.isGameInProgress()) {
      return Promise.resolve({ ok: false, message: '对局进行中，请在本局结束后更新' })
    }
    const operation = this.performApplyUpdate()
    const tracked = operation.finally(() => {
      if (this.applyInFlight === tracked) this.applyInFlight = null
    })
    this.applyInFlight = tracked
    return tracked
  }

  private async performApplyUpdate(): Promise<{ ok: boolean; message: string }> {
    if (this.state.status === 'downloaded') return this.install()
    if (this.state.status !== 'available' && !(this.state.status === 'error' && this.state.availableVersion)) {
      const checked = await this.check(true)
      if (!checked.ok || this.state.status === 'up-to-date') return checked
    }
    if (this.options.isGameInProgress()) {
      return { ok: false, message: '对局已开始，本次更新已暂停；请在本局结束后重试' }
    }
    if (this.state.status === 'available' || (this.state.status === 'error' && this.state.availableVersion)) {
      const downloaded = await this.download()
      if (!downloaded.ok) return downloaded
    }
    const readyToInstall = this.getState().status === 'downloaded'
    if (!readyToInstall) {
      return { ok: false, message: this.state.message || '更新尚未准备完成，请重试' }
    }
    if (this.options.isGameInProgress()) {
      return { ok: false, message: '对局已开始，更新包已保留；请在本局结束后再次点击更新' }
    }
    return this.install()
  }

  install(): { ok: boolean; message: string } {
    if (!this.adapter || this.state.status !== 'downloaded') {
      return { ok: false, message: '尚无已下载的更新' }
    }
    if (this.options.isGameInProgress()) {
      return { ok: false, message: '对局进行中不会安装更新，请在对局结束后重试' }
    }
    this.patch({
      status: 'installing',
      message: '正在退出并完成更新…',
    })
    try {
      this.installShutdownToken = this.options.beginInstallShutdown?.() ?? null
      // A click on the single update action authorizes this one update. NSIS
      // stays silent for both differential and verified full-package fallback;
      // Windows may still show its own UAC or SmartScreen UI.
      this.adapter.quitAndInstall(true, true)
      const postInstallState = this.getState()
      if (postInstallState.status === 'error') return { ok: false, message: postInstallState.message }
      return { ok: true, message: this.state.message }
    } catch (error) {
      this.cancelInstallShutdown()
      this.fail(error)
      return { ok: false, message: this.state.message }
    }
  }

  private cancelInstallShutdown(): void {
    const token = this.installShutdownToken
    this.installShutdownToken = null
    this.options.cancelInstallShutdown?.(token)
  }

  stop(): void {
    if (this.automaticCheckTimer) clearTimeout(this.automaticCheckTimer)
    if (this.periodicCheckTimer) clearInterval(this.periodicCheckTimer)
    this.automaticCheckTimer = null
    this.periodicCheckTimer = null
  }

  private fail(error: unknown, manual = true): void {
    const classified = classifyUpdateError(error)
    const signals = updateErrorSignals(error)
    logger.warn('Update operation failed', {
      code: classified.code,
      errorName: error instanceof Error ? error.name : 'Error',
      transportCode: signals.transportCode,
      statusCode: signals.statusCode,
      manual,
    })
    this.patch({ status: 'error', errorCode: classified.code, message: classified.message })
  }

  private patch(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.options.onStateChanged()
  }
}

function updateErrorSignals(error: unknown): {
  raw: string
  statusCode: number | null
  transportCode: string | null
} {
  const parts: string[] = []
  let statusCode: number | null = null
  let transportCode: string | null = null
  let current: unknown = error
  const visited = new Set<unknown>()
  for (let depth = 0; current && depth < 4 && !visited.has(current); depth += 1) {
    visited.add(current)
    if (current instanceof Error) parts.push(current.name, current.message)
    else if (typeof current === 'string') parts.push(current)
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>
      const candidateStatus = Number(record.statusCode ?? record.status)
      if (!statusCode && Number.isInteger(candidateStatus) && candidateStatus >= 100 && candidateStatus <= 599) {
        statusCode = candidateStatus
      }
      const candidateCode = typeof record.code === 'string' ? record.code : ''
      if (!transportCode && /^[A-Z][A-Z0-9_]{1,80}$/.test(candidateCode)) transportCode = candidateCode
      if (candidateCode) parts.push(candidateCode)
      current = record.cause
    } else current = null
  }
  const raw = parts.join(' ').slice(0, 4_000)
  const embeddedStatus = raw.match(/(?:status(?:Code)?|HTTP(?:Error)?)\D{0,8}([1-5]\d\d)/i)
  if (!statusCode && embeddedStatus) statusCode = Number(embeddedStatus[1])
  return { raw, statusCode, transportCode }
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

export function isTrustedUpdateInfo(
  value: unknown,
  provider: UpdateFeedConfiguration['provider'] = 'generic',
): boolean {
  if (!value || typeof value !== 'object') return false
  const info = value as Record<string, unknown>
  const version = safeVersion(info.version)
  if (!version || version.includes('-')) return false
  const files = Array.isArray(info.files) ? info.files : []
  if (files.length !== 1 || !files[0] || typeof files[0] !== 'object') return false
  const file = files[0] as Record<string, unknown>
  const installerName = `HexBridge-${version}-x64.exe`
  const officialUrl = `https://github.com/RocXOvO/HexBridge/releases/download/v${version}/${installerName}`
  const expectedUrl = provider === 'generic' ? officialUrl : installerName
  if (String(file.url ?? '') !== expectedUrl) return false
  if (!/^[A-Za-z0-9+/]{80,}={0,2}$/.test(String(file.sha512 ?? ''))) return false
  return finiteNonNegative(file.size) !== null && Number(file.size) > 0
}
