import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import electron from 'electron'

const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-bridge-smoke-'))
const resultPath = path.join(directory, 'result.json')
const packagedExecutable = process.argv[2] ? path.resolve(process.argv[2]) : null
const executable = packagedExecutable ?? electron
const args = packagedExecutable ? [] : ['.']
args.push('--hexbridge-smoke-test', `--user-data-dir=${path.join(directory, 'user-data')}`)

let child = null
let timeout = null
let stdout = ''
let stderr = ''

try {
  child = spawn(executable, args, {
    cwd: process.cwd(),
    env: { ...process.env, HEXBRIDGE_SMOKE_RESULT: resultPath },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-12_000) })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000) })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code))
    timeout = setTimeout(() => {
      child?.kill('SIGKILL')
      reject(new Error('Electron bridge smoke test timed out'))
    }, 30_000)
  })
  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (
    exitCode !== 0 ||
    result.ok !== true ||
    result.bridge !== true ||
    result.ipc !== true ||
    result.lcuDiscovery !== true ||
    result.shutdownLifecycle !== true
  ) {
    throw new Error(`Electron bridge smoke test failed: ${JSON.stringify({ exitCode, result, stdout, stderr })}`)
  }
  if (process.platform === 'win32' && result.windowsDisplayCapture !== true) {
    throw new Error(`Electron display capture smoke test failed: ${JSON.stringify(result)}`)
  }
  if (packagedExecutable && process.platform === 'win32') {
    const packagedResources = path.join(path.dirname(packagedExecutable), 'resources')
    const iconSizes = await Promise.all(['icon.ico', 'icon.png'].map(async (name) => (
      await stat(path.join(packagedResources, name))
    ).size))
    if (iconSizes.some((size) => size < 1_000)) {
      throw new Error(`Packaged application icon resources are missing or empty: ${JSON.stringify(iconSizes)}`)
    }
  }
  const security = result.security ?? {}
  if (
    security.sandbox !== true ||
    security.contextIsolation !== true ||
    security.nodeIntegration !== false ||
    security.webSecurity !== true
  ) {
    throw new Error(`Electron security preferences regressed: ${JSON.stringify(security)}`)
  }
  console.log(`Electron bridge smoke test passed (${packagedExecutable ? 'packaged' : 'built'} app)`)
} finally {
  if (timeout) clearTimeout(timeout)
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await rm(directory, { recursive: true, force: true })
}
