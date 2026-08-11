import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import { registerIpc } from './ipc.js'
import { logger } from './logger.js'
import { HexBridgeRuntime } from './runtime.js'

let runtime: HexBridgeRuntime | null = null
let tray: Tray | null = null

const TRAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#11161c" stroke="#79b8ad" stroke-width="2" d="M16 2 28 9v14l-12 7-12-7V9Z"/><path fill="none" stroke="#d4b66f" stroke-width="2" stroke-linecap="round" d="M9 20c2-6 5-9 7-9s5 3 7 9M8 22h16"/></svg>`

if (!app.requestSingleInstanceLock()) app.quit()

function registerHotkey(accelerator: string): void {
  globalShortcut.unregisterAll()
  try {
    if (accelerator && globalShortcut.register(accelerator, () => void runtime?.triggerOcr())) return
    logger.warn('Unable to register OCR hotkey', accelerator)
  } catch (error) {
    logger.warn('Invalid OCR hotkey', error instanceof Error ? error.message : accelerator)
  }
}

async function start(): Promise<void> {
  runtime = new HexBridgeRuntime()
  registerIpc(runtime)
  await runtime.initialize()
  runtime.setHotkeyHandler(registerHotkey)

  const trayIcon = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(TRAY_SVG).toString('base64')}`)
    .resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('HexBridge')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 HexBridge', click: () => runtime?.getWindowManager().showMain() },
      { label: 'F8 重新识别', click: () => void runtime?.triggerOcr() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  )
  tray.on('double-click', () => runtime?.getWindowManager().showMain())
}

app.on('second-instance', () => runtime?.getWindowManager().showMain())
app.on('window-all-closed', () => undefined)
app.on('before-quit', () => {
  runtime?.getWindowManager().prepareToQuit()
  runtime?.stop()
  globalShortcut.unregisterAll()
})

void app.whenReady().then(start).catch((error) => {
  logger.error('HexBridge failed to start', error instanceof Error ? error.stack : error)
  app.quit()
})
