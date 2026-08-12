import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

if (process.platform !== 'win32') {
  console.log('Packaged update smoke skipped outside Windows')
  process.exit(0)
}

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const currentVersion = String(packageJson.version)
const versionParts = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/)
if (!versionParts) throw new Error(`Unsupported smoke version: ${currentVersion}`)
const expectedVersion = `${versionParts[1]}.${versionParts[2]}.${Number(versionParts[3]) + 1}`
const executable = path.resolve(process.argv[2] || 'release/win-unpacked/HexBridge.exe')
const sourceInstaller = path.resolve(`release/HexBridge-${currentVersion}-x64.exe`)
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-update-smoke-'))
const feedDirectory = path.join(temporaryDirectory, 'feed')
const resultPath = path.join(temporaryDirectory, 'result.json')
const userDataDirectory = path.join(temporaryDirectory, 'user-data')
const localAppDataDirectory = path.join(temporaryDirectory, 'local-app-data')
const roamingAppDataDirectory = path.join(temporaryDirectory, 'roaming-app-data')
const targetName = `HexBridge-${expectedVersion}-x64.exe`
const targetPath = path.join(feedDirectory, targetName)

await Promise.all([
  mkdir(feedDirectory, { recursive: true }),
  mkdir(localAppDataDirectory, { recursive: true }),
  mkdir(roamingAppDataDirectory, { recursive: true }),
])
await copyFile(sourceInstaller, targetPath)
const installerSize = (await stat(targetPath)).size
const sha512Hash = createHash('sha512')
for await (const chunk of createReadStream(targetPath)) sha512Hash.update(chunk)
const sha512 = sha512Hash.digest('base64')
await writeFile(path.join(feedDirectory, 'latest.yml'), [
  `version: ${expectedVersion}`,
  'files:',
  `  - url: ${targetName}`,
  `    sha512: ${sha512}`,
  `    size: ${installerSize}`,
  `path: ${targetName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n'), 'utf8')

let metadataRequests = 0
let installerRequests = 0
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const fileName = pathname === '/latest.yml'
    ? 'latest.yml'
    : pathname === `/${targetName}` ? targetName : null
  if (!fileName) {
    response.writeHead(404).end()
    return
  }
  if (fileName === 'latest.yml') metadataRequests += 1
  else installerRequests += 1
  const filePath = path.join(feedDirectory, fileName)
  const fileStat = await stat(filePath)
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  if (range) {
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : fileStat.size - 1
    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
      'Content-Type': 'application/octet-stream',
    })
    createReadStream(filePath, { start, end }).pipe(response)
    return
  }
  response.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': fileStat.size,
    'Content-Type': fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Unable to bind update smoke feed')

let child = null
let timeout = null
try {
  child = spawn(executable, [
    '--hexbridge-update-smoke-test',
    `--user-data-dir=${userDataDirectory}`,
  ], {
    cwd: root,
    env: {
      ...process.env,
      HEXBRIDGE_UPDATE_SMOKE_URL: `http://127.0.0.1:${address.port}/`,
      HEXBRIDGE_UPDATE_SMOKE_RESULT: resultPath,
      HEXBRIDGE_UPDATE_SMOKE_EXPECTED_VERSION: expectedVersion,
      LOCALAPPDATA: localAppDataDirectory,
      APPDATA: roamingAppDataDirectory,
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
      timeout = setTimeout(() => reject(new Error('Packaged update smoke timed out')), 125_000)
    }),
  ])
  if (exitCode !== 0) throw new Error(`Packaged update smoke exited ${exitCode}\n${stdout}\n${stderr}`)
  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (!result?.ok || result.availableVersion !== expectedVersion || result.downloaded !== true) {
    throw new Error(`Unexpected packaged update smoke result: ${JSON.stringify(result)}`)
  }
  if (metadataRequests < 1 || installerRequests < 1) {
    throw new Error(`Update feed was not fully exercised: metadata=${metadataRequests}, installer=${installerRequests}`)
  }
  const cachedFiles = await readdir(localAppDataDirectory, { recursive: true })
  if (!cachedFiles.some((name) => String(name).endsWith(targetName))) {
    throw new Error('Downloaded installer was not found in the isolated updater cache')
  }
  console.log(`Packaged update smoke passed: ${JSON.stringify({
    ...result,
    metadataRequests,
    installerRequests,
    isolatedCache: true,
  })}`)
} finally {
  if (timeout) clearTimeout(timeout)
  await terminate(child)
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
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
