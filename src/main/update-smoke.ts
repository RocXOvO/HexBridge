import electronUpdater from 'electron-updater'

export interface UpdateSmokeResult {
  ok: true
  availableVersion: string
  downloaded: true
}

class UpdateSmokeFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'UpdateSmokeFailure'
  }
}

const loopbackFeed = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return null
    if (url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function runPackagedUpdateSmokeTest(): Promise<UpdateSmokeResult> {
  if (!process.argv.includes('--hexbridge-update-smoke-test')) {
    throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_MODE_REQUIRED')
  }
  if (!process.env.HEXBRIDGE_UPDATE_SMOKE_RESULT) {
    throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_RESULT_REQUIRED')
  }
  const feed = loopbackFeed(process.env.HEXBRIDGE_UPDATE_SMOKE_URL)
  if (!feed) throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_FEED_REJECTED')
  const expectedVersion = process.env.HEXBRIDGE_UPDATE_SMOKE_EXPECTED_VERSION
  if (!expectedVersion || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
    throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_VERSION_REQUIRED')
  }

  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.setFeedURL({ provider: 'generic', url: feed })

  let availableVersion: string | null = null
  let downloaded = false
  let rejectEvent: ((error: Error) => void) | null = null
  const eventFailure = new Promise<never>((_resolve, reject) => { rejectEvent = reject })
  const onError = (): void => rejectEvent?.(new UpdateSmokeFailure('HB_UPDATE_SMOKE_UPDATER_ERROR'))
  const onAvailable = (info: { version?: string }): void => { availableVersion = info.version ?? null }
  const onDownloaded = (): void => { downloaded = true }
  autoUpdater.on('error', onError)
  autoUpdater.on('update-available', onAvailable)
  autoUpdater.on('update-downloaded', onDownloaded)

  let timeout: NodeJS.Timeout | null = null
  const verification = async (): Promise<UpdateSmokeResult> => {
    const checked = await autoUpdater.checkForUpdates()
    const version = checked?.updateInfo?.version ?? availableVersion
    if (version !== expectedVersion) throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_VERSION_MISMATCH')
    await autoUpdater.downloadUpdate()
    if (!downloaded) throw new UpdateSmokeFailure('HB_UPDATE_SMOKE_DOWNLOAD_EVENT_MISSING')
    return { ok: true, availableVersion: version, downloaded: true }
  }

  try {
    return await Promise.race([
      verification(),
      eventFailure,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new UpdateSmokeFailure('HB_UPDATE_SMOKE_TIMEOUT')),
          120_000,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    autoUpdater.removeListener('error', onError)
    autoUpdater.removeListener('update-available', onAvailable)
    autoUpdater.removeListener('update-downloaded', onDownloaded)
  }
}
