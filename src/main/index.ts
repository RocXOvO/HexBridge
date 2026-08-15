import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import { writeFile } from 'node:fs/promises'
import { runBridgeSmokeTest } from './bridge-smoke.js'
import { registerIpc } from './ipc.js'
import { logger } from './logger.js'
import { HexBridgeRuntime } from './runtime.js'
import { runPackagedUpdateSmokeTest } from './update-smoke.js'
import { runPublicUpdateSmokeTest } from './public-update-smoke.js'
import { OcrHotkeyManager } from './hotkey-manager.js'
import { applicationIconPath } from './window-manager.js'

let runtime: HexBridgeRuntime | null = null
let tray: Tray | null = null
let hotkeys: OcrHotkeyManager | null = null
let quitPreparationRunning = false

function triggerOcrFrom(source: 'hotkey' | 'tray'): void {
  void runtime?.triggerOcr(source).catch((error) => {
    logger.warn('Manual OCR trigger callback failed', {
      source,
      errorName: error instanceof Error ? error.name : 'Error',
    })
  })
}

function quitApplication(): void {
  app.quit()
}

function applyUpdateFromTray(): void {
  void runtime?.applyUpdate().then((result) => {
    if (!result.ok) logger.warn('Tray update action did not complete', { message: result.message })
    refreshTrayMenu()
  }).catch((error) => {
    logger.warn('Tray update action failed', {
      errorName: error instanceof Error ? error.name : 'Error',
    })
    refreshTrayMenu()
  })
}

const bridgeSmokeMode = process.argv.includes('--hexbridge-smoke-test')
const updateSmokeMode = process.argv.includes('--hexbridge-update-smoke-test')
const publicUpdateSmokeMode = process.argv.includes('--hexbridge-public-update-smoke-test')

if (!bridgeSmokeMode && !updateSmokeMode && !publicUpdateSmokeMode && !app.requestSingleInstanceLock()) app.quit()

async function finishBridgeSmoke(result: object, exitCode: number): Promise<void> {
  const resultPath = process.env.HEXBRIDGE_SMOKE_RESULT
  if (resultPath) await writeFile(resultPath, JSON.stringify(result), 'utf8')
  if (exitCode === 0) console.log('HEXBRIDGE_BRIDGE_SMOKE_OK')
  else {
    const code = 'code' in result && typeof result.code === 'string' ? result.code : 'HB_SMOKE_UNKNOWN'
    console.error('HEXBRIDGE_BRIDGE_SMOKE_FAILED', code)
  }
  app.exit(exitCode)
}

function refreshTrayMenu(): void {
  if (!tray) return
  const activeHotkey = hotkeys?.active ?? ''
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 HexBridge', click: () => runtime?.getWindowManager().showMain() },
    {
      label: activeHotkey ? `${activeHotkey} 立即识别` : '手动立即识别（快捷键未注册）',
      click: () => triggerOcrFrom('tray'),
    },
    { label: '立即更新', click: applyUpdateFromTray },
    { type: 'separator' },
    { label: '退出', click: quitApplication },
  ]))
}

async function start(): Promise<void> {
  if (publicUpdateSmokeMode) {
    try {
      await finishPublicUpdateSmoke(await runPublicUpdateSmokeTest(), 0)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'HB_PUBLIC_UPDATE_SMOKE_UNKNOWN'
      await finishPublicUpdateSmoke({ ok: false, code }, 1)
    }
    return
  }
  if (updateSmokeMode) {
    try {
      await finishUpdateSmoke(await runPackagedUpdateSmokeTest(), 0)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'HB_UPDATE_SMOKE_UNKNOWN'
      await finishUpdateSmoke({ ok: false, code }, 1)
    }
    return
  }
  if (bridgeSmokeMode) {
    try {
      await finishBridgeSmoke(await runBridgeSmokeTest(), 0)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'HB_SMOKE_UNKNOWN'
      await finishBridgeSmoke({ ok: false, code }, 1)
    }
    return
  }

  if (process.platform === 'win32') app.setAppUserModelId('dev.hexbridge.app')
  runtime = new HexBridgeRuntime()
  registerIpc(runtime)
  await runtime.initialize()
  hotkeys = new OcrHotkeyManager(
    globalShortcut,
    () => triggerOcrFrom('hotkey'),
    () => refreshTrayMenu(),
  )
  runtime.setHotkeyHandler((candidate) => hotkeys?.register(candidate) ?? {
    ok: false,
    activeHotkey: '',
    errorCode: 'HOTKEY_UNAVAILABLE',
    message: '全局快捷键服务尚未就绪',
  })

  const trayIcon = nativeImage.createFromPath(applicationIconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('HexBridge')
  refreshTrayMenu()
  tray.on('double-click', () => runtime?.getWindowManager().showMain())
}

async function finishPublicUpdateSmoke(result: object, exitCode: number): Promise<void> {
  const resultPath = process.env.HEXBRIDGE_PUBLIC_UPDATE_SMOKE_RESULT
  if (resultPath) await writeFile(resultPath, JSON.stringify(result), 'utf8')
  if (exitCode === 0) console.log('HEXBRIDGE_PUBLIC_UPDATE_SMOKE_OK')
  else {
    const code = 'code' in result && typeof result.code === 'string'
      ? result.code
      : 'HB_PUBLIC_UPDATE_SMOKE_UNKNOWN'
    console.error('HEXBRIDGE_PUBLIC_UPDATE_SMOKE_FAILED', code)
  }
  app.exit(exitCode)
}

async function finishUpdateSmoke(result: object, exitCode: number): Promise<void> {
  const resultPath = process.env.HEXBRIDGE_UPDATE_SMOKE_RESULT
  if (resultPath) await writeFile(resultPath, JSON.stringify(result), 'utf8')
  if (exitCode === 0) console.log('HEXBRIDGE_UPDATE_SMOKE_OK')
  else {
    const code = 'code' in result && typeof result.code === 'string'
      ? result.code
      : 'HB_UPDATE_SMOKE_UNKNOWN'
    console.error('HEXBRIDGE_UPDATE_SMOKE_FAILED', code)
  }
  app.exit(exitCode)
}

app.on('second-instance', () => runtime?.getWindowManager().showMain())
app.on('window-all-closed', () => undefined)
app.on('before-quit', (event) => {
  if (runtime && !runtime.isApplicationQuitPrepared()) {
    event.preventDefault()
    if (!quitPreparationRunning) {
      quitPreparationRunning = true
      void runtime.prepareForApplicationQuit().finally(() => {
        quitPreparationRunning = false
        app.quit()
      })
    }
    return
  }
  runtime?.commitApplicationQuit()
  runtime?.stop()
  hotkeys?.dispose()
})

void app.whenReady().then(start).catch((error) => {
  logger.error('HexBridge failed to start', error instanceof Error ? error.stack : error)
  app.exit(1)
})
