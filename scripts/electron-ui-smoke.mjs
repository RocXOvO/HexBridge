import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import electron from 'electron'

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const expectedVersion = String(packageMetadata.version)

const packagedExecutable = process.argv[2] ? path.resolve(process.argv[2]) : null
const executable = packagedExecutable ?? electron
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-ui-smoke-'))
const userDataDirectory = path.join(temporaryDirectory, 'user-data')
const smokeTimeoutMs = 45_000
const timeoutAt = Date.now() + smokeTimeoutMs

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function within(promise, description, maximumMs = 5_000) {
  const milliseconds = Math.max(1, Math.min(maximumMs, timeoutAt - Date.now()))
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), milliseconds)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve) => server.close(resolve))
  if (!port) throw new Error('Unable to allocate a Chromium debugging port')
  return port
}

async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Chromium target list returned HTTP ${response.status}`)
  return response.json()
}

async function waitForTarget(port, predicate, description) {
  let lastError = null
  while (Date.now() < timeoutAt) {
    try {
      const match = (await targets(port)).find(predicate)
      if (match) return match
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

async function waitUntil(operation, description, timeoutMs = 10_000) {
  const deadline = Math.min(timeoutAt, Date.now() + timeoutMs)
  let lastValue = null
  while (Date.now() < deadline) {
    lastValue = await operation()
    if (lastValue) return lastValue
    await delay(80)
  }
  throw new Error(`Timed out waiting for ${description}; last result: ${JSON.stringify(lastValue)}`)
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  await within(new Promise((resolve, reject) => {
    const opened = () => {
      socket.removeEventListener('error', failed)
      resolve()
    }
    const failed = () => {
      socket.removeEventListener('open', opened)
      reject(new Error('CDP WebSocket failed to open'))
    }
    socket.addEventListener('open', opened, { once: true })
    socket.addEventListener('error', failed, { once: true })
  }), 'the CDP WebSocket to open')
  let sequence = 0
  const pending = new Map()
  const rejectPending = (reason) => {
    for (const waiter of pending.values()) waiter.reject(reason)
    pending.clear()
  }
  socket.addEventListener('close', () => rejectPending(new Error('CDP WebSocket closed unexpectedly')))
  socket.addEventListener('error', () => rejectPending(new Error('CDP WebSocket failed')))
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
  })
  const call = (method, params = {}, maximumMs = 5_000) => {
    if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP WebSocket is not open'))
    const id = ++sequence
    const response = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
    return within(response, `CDP ${method}`, maximumMs).finally(() => pending.delete(id))
  }
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    }
    return response.result?.value
  }
  return {
    call,
    evaluate,
    close: () => {
      rejectPending(new Error('CDP connection closed by smoke test'))
      socket.close()
    },
  }
}

async function waitForProcess(processHandle, milliseconds) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return true
  return new Promise((resolve) => {
    let timer = null
    const finish = (exited) => {
      if (timer) clearTimeout(timer)
      processHandle.removeListener('exit', onExit)
      processHandle.removeListener('error', onError)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const onError = () => finish(true)
    processHandle.once('exit', onExit)
    processHandle.once('error', onError)
    timer = setTimeout(() => finish(false), milliseconds)
  })
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    if (!(await waitForProcess(killer, 4_000))) killer.kill()
  }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await waitForProcess(child, 2_000)
}

const debuggingPort = await availablePort()
const args = packagedExecutable ? [] : ['.']
args.push(
  `--remote-debugging-port=${debuggingPort}`,
  '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${userDataDirectory}`,
)

let child = null
let stdout = ''
let stderr = ''
let mainCdp = null
let calibrationCdp = null
let hardTimeout = null

try {
  child = spawn(executable, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-12_000) })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000) })
  const earlyExit = new Promise((_, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`HexBridge exited before UI smoke completed (${code})`)))
  })

  const smoke = async () => {
    const mainTarget = await waitForTarget(
      debuggingPort,
      (target) => target.type === 'page' && /#main$/.test(target.url),
      'the main HexBridge renderer',
    )
    const obsoleteAugmentTarget = (await targets(debuggingPort)).find(
      (target) => target.type === 'page' && /#augment$/.test(target.url),
    )
    if (obsoleteAugmentTarget) {
      throw new Error('Obsolete full-screen augment renderer is still being created')
    }
    mainCdp = await connectCdp(mainTarget.webSocketDebuggerUrl)
    // A freshly unpacked Windows executable can expose its CDP target before
    // the renderer runtime is ready to answer the first command. Keep the
    // smoke's 45s hard stop, but do not mistake that bounded startup delay for
    // a product failure.
    await mainCdp.call('Runtime.enable', {}, 10_000)

    await waitUntil(
      () => mainCdp.evaluate(`Boolean(document.querySelector('.app-shell') && window.hexbridge)`),
      'the main UI and preload bridge',
    )

    const calibrationIsolation = await mainCdp.evaluate(`(async () => {
      try {
        await window.hexbridge.getCalibrationContext()
        return { rejected: false }
      } catch (error) {
        return { rejected: true, safe: !/(data:image|token|\\\\|:\\/)/i.test(String(error?.message || error)) }
      }
    })()`)
    if (!calibrationIsolation?.rejected || !calibrationIsolation.safe) {
      throw new Error(`Calibration screenshot bridge isolation failed: ${JSON.stringify(calibrationIsolation)}`)
    }

    const keyResult = await mainCdp.evaluate(`(async () => {
      const clickByText = (selector, text) => {
        const element = [...document.querySelectorAll(selector)].find((item) => item.textContent.includes(text))
        if (!element) throw new Error('Missing UI control: ' + text)
        element.click()
      }
      clickByText('.sidebar nav button', '设置')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const input = document.querySelector('.key-row input')
      const button = [...document.querySelectorAll('.key-row button')]
        .find((item) => item.textContent.includes('验证并保存'))
      if (!input || !button) throw new Error('Missing API Key form')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'not-a-valid-key')
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (button.disabled) throw new Error('API Key submit stayed disabled after input')
      button.click()
      return { clicked: true, inputFont: parseFloat(getComputedStyle(input).fontSize) }
    })()`)
    if (!keyResult?.clicked || keyResult.inputFont < 14) {
      throw new Error(`API Key form smoke failed: ${JSON.stringify(keyResult)}`)
    }
    const keyFeedback = await waitUntil(
      () => mainCdp.evaluate(`document.querySelector('.inline-feedback.error')?.textContent || ''`),
      'visible API Key validation feedback',
    )
    if (!String(keyFeedback).includes('Key 格式')) {
      throw new Error(`Unexpected API Key feedback: ${keyFeedback}`)
    }
    const keyIdle = await waitUntil(
      () => mainCdp.evaluate(`(() => {
        const button = [...document.querySelectorAll('.key-row button')]
          .find((item) => item.textContent.includes('验证并保存'))
        if (!button || button.disabled || button.getAttribute('aria-busy') === 'true') return null
        return { disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy') }
      })()`),
      'the API Key submit button to recover after validation',
    )

    const updaterUi = await mainCdp.evaluate(`(async () => {
      const updateNavigation = [...document.querySelectorAll('.sidebar nav button')]
        .find((item) => item.textContent.includes('更新'))
      updateNavigation?.click()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const card = document.querySelector('.update-surface')
      if (!card) return null
      const buttons = [...card.querySelectorAll('button')].map((item) => item.textContent.trim())
      return {
        bridge: ['checkForUpdates', 'downloadUpdate', 'installUpdate', 'openReleasePage']
          .every((name) => typeof window.hexbridge[name] === 'function'),
        currentVersion: card.textContent.includes(${JSON.stringify(`v${expectedVersion}`)}),
        chineseStatus: card.textContent.includes('当前系统不支持') || card.textContent.includes('等待检查'),
        redundantSecurityCopy: card.textContent.includes('商业代码签名') || card.textContent.includes('不会静默更新'),
        checkButton: buttons.some((text) => text.includes('检查更新')),
      }
    })()`)
    if (!updaterUi?.bridge || !updaterUi.currentVersion || !updaterUi.chineseStatus || updaterUi.redundantSecurityCopy || !updaterUi.checkButton) {
      throw new Error(`Updater UI/bridge smoke failed: ${JSON.stringify(updaterUi)}`)
    }

    const typography = await mainCdp.evaluate(`(async () => {
      const clickByText = (selector, text) => [...document.querySelectorAll(selector)]
        .find((item) => item.textContent.includes(text))?.click()
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const font = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)
      clickByText('.sidebar nav button', '诊断')
      await settle()
      const diagnostics = font('.health-grid p')
      clickByText('.sidebar nav button', '实时助手')
      await settle()
      const liveStatus = font('.empty-copy h2')
      const liveEyebrow = font('.eyebrow')
      return { diagnostics, liveStatus, liveEyebrow }
    })()`)
    if (Object.values(typography).some((value) => value < 14)) {
      throw new Error(`Critical typography regressed: ${JSON.stringify(typography)}`)
    }

    await mainCdp.call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    const reducedMotion = await mainCdp.evaluate(`(() => {
      const selectors = ['.connection-stage', '.connection-ring', '.connection-path i']
      const animations = Object.fromEntries(selectors.map((selector) => {
        const style = getComputedStyle(document.querySelector(selector))
        return [selector, { name: style.animationName, iterations: style.animationIterationCount }]
      }))
      return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, animations }
    })()`)
    const reducedAnimations = Object.values(reducedMotion?.animations ?? {})
    if (
      !reducedMotion?.matches ||
      reducedAnimations.length !== 3 ||
      reducedAnimations.some((animation) => animation.name !== 'none' || Number(animation.iterations) > 1)
    ) {
      throw new Error(`Reduced-motion guard failed: ${JSON.stringify(reducedMotion)}`)
    }

    let calibration = null
    if (process.platform === 'win32' || process.env.HEXBRIDGE_SMOKE_CALIBRATION === 'true') {
      await mainCdp.evaluate(`(async () => {
        const settings = [...document.querySelectorAll('.sidebar nav button')]
          .find((item) => item.textContent.includes('设置'))
        settings.click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const button = [...document.querySelectorAll('.settings-card button')]
          .find((item) => item.textContent.includes('框选三张完整海克斯卡片'))
        if (!button) throw new Error('Missing calibration entry')
        button.click()
        return true
      })()`)
      const calibrationTarget = await waitForTarget(
        debuggingPort,
        (target) => target.type === 'page' && /#calibration$/.test(target.url),
        'the calibration renderer',
      )
      calibrationCdp = await connectCdp(calibrationTarget.webSocketDebuggerUrl)
      await calibrationCdp.call('Runtime.enable', {}, 10_000)
      calibration = await waitUntil(
        () => calibrationCdp.evaluate(`(() => {
          const image = document.querySelector('.calibration-screenshot')
          const toolbar = document.querySelector('.calibration-toolbar')
          if (!image || !toolbar || !image.complete || image.naturalWidth < 1) return null
          return {
            imageWidth: image.naturalWidth,
            imageHeight: image.naturalHeight,
            imageSource: image.currentSrc.slice(0, 24),
            text: toolbar.textContent,
            instructionFont: parseFloat(getComputedStyle(toolbar.querySelector('p')).fontSize),
          }
        })()`),
        'the screenshot-backed calibration instructions',
      )
      if (
        calibration.instructionFont < 14 ||
        calibration.imageWidth < 320 ||
        calibration.imageHeight < 240 ||
        calibration.imageWidth / calibration.imageHeight < .5 ||
        calibration.imageWidth / calibration.imageHeight > 4 ||
        !calibration.imageSource.startsWith('data:image/') ||
        !calibration.text.includes('左侧整张卡片') ||
        !calibration.text.includes('自动提取') ||
        !calibration.text.includes('Esc')
      ) {
        throw new Error(`Calibration instructions regressed: ${JSON.stringify(calibration)}`)
      }
      const hiddenPause = await mainCdp.evaluate(`({
        hidden: document.hidden,
        paused: document.querySelector('.app-shell')?.classList.contains('animations-paused'),
      })`)
      // Hosted Windows runners do not guarantee that a BrowserWindow can ever
      // become foreground-visible, so document.hidden is not a reliable proxy
      // for BrowserWindow.hide() there. The product invariant is that the
      // background renderer is paused while calibration owns the interaction.
      if (!hiddenPause?.paused) {
        throw new Error(`Background main window did not pause animations: ${JSON.stringify(hiddenPause)}`)
      }
      await calibrationCdp.call('Page.bringToFront')
      try {
        await calibrationCdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/CDP WebSocket (?:closed unexpectedly|is not open)/.test(message)) throw error
      }
      await waitUntil(
        async () => !(await targets(debuggingPort)).some((target) => /#calibration$/.test(target.url)),
        'Escape to close the calibration window',
      )
      await waitUntil(
        async () => (await targets(debuggingPort)).some((target) => target.type === 'page' && /#main$/.test(target.url)),
        'the main renderer to remain alive after calibration',
      )
      const restoredMain = await waitUntil(
        () => mainCdp.evaluate(`(() => {
          const hidden = document.hidden
          const focused = document.hasFocus()
          const paused = document.querySelector('.app-shell')?.classList.contains('animations-paused') === true
          return hidden ? null : { hidden, focused, paused }
        })()`),
        'the main window to restore after calibration',
      )
      // Headless Windows runners are allowed to refuse foreground focus. A
      // restored but unfocused window must remain paused; if focus is granted,
      // its animations must resume. This verifies both visibility and the
      // performance guard without conflating OS focus policy with restoration.
      if (restoredMain.paused === restoredMain.focused) {
        throw new Error(`Restored main animation state is inconsistent: ${JSON.stringify(restoredMain)}`)
      }
      calibration.restoredMain = restoredMain
    }

    return { keyFeedback, keyIdle, updaterUi, typography, reducedMotion, calibrationIsolation, calibration }
  }

  const hardStop = new Promise((_, reject) => {
    hardTimeout = setTimeout(() => reject(new Error(`UI smoke exceeded ${smokeTimeoutMs}ms hard timeout`)), smokeTimeoutMs)
  })
  const result = await Promise.race([smoke(), earlyExit, hardStop])
  console.log(`Electron UI smoke test passed (${packagedExecutable ? 'packaged' : 'built'} app): ${JSON.stringify(result)}`)
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : error}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    { cause: error },
  )
} finally {
  if (hardTimeout) clearTimeout(hardTimeout)
  calibrationCdp?.close()
  mainCdp?.close()
  await terminate(child)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
