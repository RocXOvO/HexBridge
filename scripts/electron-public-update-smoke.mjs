import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

if (process.platform !== 'win32') {
  console.log('Public packaged update smoke skipped outside Windows')
  process.exit(0)
}

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const expectedVersion = String(packageJson.version)
const executable = path.resolve(process.argv[2] || 'release/win-unpacked/HexBridge.exe')
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-public-update-smoke-'))
const resultPath = path.join(temporaryDirectory, 'result.json')
const userDataDirectory = path.join(temporaryDirectory, 'user-data')
let child = null
let timeout = null

try {
  child = spawn(executable, [
    '--hexbridge-public-update-smoke-test',
    `--user-data-dir=${userDataDirectory}`,
  ], {
    cwd: root,
    env: {
      ...process.env,
      HEXBRIDGE_PUBLIC_UPDATE_SMOKE_RESULT: resultPath,
      HEXBRIDGE_PUBLIC_UPDATE_SMOKE_EXPECTED_VERSION: expectedVersion,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-8_000) })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000) })
  const exitCode = await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => resolve(code))
    }),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Public packaged update smoke timed out')), 65_000)
    }),
  ])
  if (exitCode !== 0) throw new Error(`Public packaged update smoke exited ${exitCode}\n${stdout}\n${stderr}`)
  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (!result?.ok || result.channelVersion !== expectedVersion) {
    throw new Error(`Unexpected public packaged update smoke result: ${JSON.stringify(result)}`)
  }
  console.log(`Public packaged update smoke passed: ${JSON.stringify(result)}`)
} finally {
  if (timeout) clearTimeout(timeout)
  await terminate(child)
  await rm(temporaryDirectory, { recursive: true, force: true })
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

async function terminate(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return
  const killer = spawn('taskkill.exe', ['/pid', String(processHandle.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  if (!(await waitForProcess(killer, 4_000))) killer.kill()
  if (processHandle.exitCode === null && processHandle.signalCode === null) processHandle.kill('SIGKILL')
  await waitForProcess(processHandle, 2_000)
}
