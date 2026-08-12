import electronUpdater from 'electron-updater'
import { STABLE_UPDATE_FEEDS } from './update-channel.js'

export interface PublicUpdateSmokeResult {
  ok: true
  channelVersion: string
  updateAvailable: boolean
}

class PublicUpdateSmokeFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'PublicUpdateSmokeFailure'
  }
}

export async function runPublicUpdateSmokeTest(): Promise<PublicUpdateSmokeResult> {
  if (!process.argv.includes('--hexbridge-public-update-smoke-test')) {
    throw new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_MODE_REQUIRED')
  }
  if (!process.env.HEXBRIDGE_PUBLIC_UPDATE_SMOKE_RESULT) {
    throw new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_RESULT_REQUIRED')
  }
  const expectedVersion = process.env.HEXBRIDGE_PUBLIC_UPDATE_SMOKE_EXPECTED_VERSION
  if (!expectedVersion || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
    throw new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_VERSION_REQUIRED')
  }

  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.setFeedURL(STABLE_UPDATE_FEEDS[0])

  let timeout: NodeJS.Timeout | null = null
  const verification = async (): Promise<PublicUpdateSmokeResult> => {
    const checked = await autoUpdater.checkForUpdates()
    const channelVersion = checked?.updateInfo?.version
    if (channelVersion !== expectedVersion) {
      throw new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH')
    }
    if (checked?.isUpdateAvailable) {
      throw new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_CURRENT_VERSION_MARKED_AVAILABLE')
    }
    return {
      ok: true,
      channelVersion,
      updateAvailable: false,
    }
  }
  try {
    return await Promise.race([
      verification(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new PublicUpdateSmokeFailure('HB_PUBLIC_UPDATE_SMOKE_TIMEOUT')),
          60_000,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
