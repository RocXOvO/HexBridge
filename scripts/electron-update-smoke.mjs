import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

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
const candidateInstaller = path.resolve(`release/HexBridge-${currentVersion}-x64.exe`)
const candidateBlockmap = path.resolve(`${candidateInstaller}.blockmap`)
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-update-smoke-'))
const feedDirectory = path.join(temporaryDirectory, 'feed')
const resultPath = path.join(temporaryDirectory, 'result.json')
const userDataDirectory = path.join(temporaryDirectory, 'user-data')
const localAppDataDirectory = path.join(temporaryDirectory, 'local-app-data')
const roamingAppDataDirectory = path.join(temporaryDirectory, 'roaming-app-data')
const targetName = `HexBridge-${expectedVersion}-x64.exe`
const targetPath = path.join(feedDirectory, targetName)
const targetBlockmapName = `${targetName}.blockmap`
const targetBlockmapPath = path.join(feedDirectory, targetBlockmapName)
const sourceBlockmapName = `HexBridge-${currentVersion}-x64.exe.blockmap`
const sourceInstaller = path.join(temporaryDirectory, 'previous-installer.exe')
const sourceBlockmap = path.join(temporaryDirectory, 'previous-installer.exe.blockmap')

await Promise.all([
  mkdir(feedDirectory, { recursive: true }),
  mkdir(localAppDataDirectory, { recursive: true }),
  mkdir(roamingAppDataDirectory, { recursive: true }),
])
const previousRelease = await resolvePreviousStableRelease(currentVersion)
await Promise.all([
  downloadPublicAsset(previousRelease.installerUrl, sourceInstaller),
  downloadPublicAsset(previousRelease.blockmapUrl, sourceBlockmap),
])
// Use the exact retained previous Release as the differential base and the
// exact candidate built by this job as the target. The synthetic metadata
// version is only needed because the smoke executable itself is the candidate.
await copyFile(candidateInstaller, targetPath)
await copyFile(candidateBlockmap, targetBlockmapPath)
await copyFile(sourceBlockmap, path.join(feedDirectory, sourceBlockmapName))

const appUpdate = await readFile(path.join(root, 'release', 'win-unpacked', 'resources', 'app-update.yml'), 'utf8')
const updaterCacheDirName = appUpdate.match(/^updaterCacheDirName:\s*(\S+)\s*$/m)?.[1]
if (!updaterCacheDirName || !/^[a-z0-9._-]+$/i.test(updaterCacheDirName)) {
  throw new Error('Unable to resolve packaged updater cache directory')
}
const updaterCacheDirectory = path.join(localAppDataDirectory, updaterCacheDirName)
await mkdir(updaterCacheDirectory, { recursive: true })
// The real NSIS installer stores its own EXE here. Differential download uses it
// as the old file, so the smoke reproduces an installed N -> N+1 upgrade.
await copyFile(sourceInstaller, path.join(updaterCacheDirectory, 'installer.exe'))
const installerSize = (await stat(targetPath)).size
const sha512Hash = createHash('sha512')
for await (const chunk of createReadStream(targetPath)) sha512Hash.update(chunk)
const sha512 = sha512Hash.digest('base64')
await writeFile(path.join(feedDirectory, 'latest.yml'), [
  `version: ${expectedVersion}`,
  'files:',
  `  - url: download/${targetName}`,
  `    sha512: ${sha512}`,
  `    size: ${installerSize}`,
  `path: download/${targetName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n'), 'utf8')

let metadataRequests = 0
let oldBlockmapRequests = 0
let newBlockmapRequests = 0
let installerRangeRequests = 0
let installerFullRequests = 0
let installerTransferredBytes = 0
let redirectRequests = 0
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (pathname.startsWith('/download/')) {
    redirectRequests += 1
    response.writeHead(302, { Location: `/asset/${path.basename(pathname)}` }).end()
    return
  }
  const fileName = pathname === '/latest.yml'
    ? 'latest.yml'
    : pathname === `/asset/${targetName}` ? targetName
      : pathname === `/asset/${targetBlockmapName}` ? targetBlockmapName
        : pathname === `/asset/${sourceBlockmapName}` ? sourceBlockmapName : null
  if (!fileName) {
    response.writeHead(404).end()
    return
  }
  if (fileName === 'latest.yml') metadataRequests += 1
  else if (fileName === sourceBlockmapName) oldBlockmapRequests += 1
  else if (fileName === targetBlockmapName) newBlockmapRequests += 1
  const filePath = path.join(feedDirectory, fileName)
  const fileStat = await stat(filePath)
  if (request.method === 'HEAD') {
    response.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileStat.size,
      'Content-Type': fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
    }).end()
    return
  }
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  if (range) {
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : fileStat.size - 1
    if (fileName === targetName) {
      installerRangeRequests += 1
      installerTransferredBytes += end - start + 1
    }
    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
      'Content-Type': 'application/octet-stream',
    })
    createReadStream(filePath, { start, end }).pipe(response)
    return
  }
  if (fileName === targetName) installerFullRequests += 1
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
  const childEnvironment = { ...process.env }
  delete childEnvironment.GITHUB_TOKEN
  child = spawn(executable, [
    '--hexbridge-update-smoke-test',
    `--user-data-dir=${userDataDirectory}`,
  ], {
    cwd: root,
    env: {
      ...childEnvironment,
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
  if (!result?.ok || result.availableVersion !== expectedVersion || result.downloaded !== true || result.differentialDownload !== true) {
    throw new Error(`Unexpected packaged update smoke result: ${JSON.stringify(result)}`)
  }
  if (metadataRequests < 1 || oldBlockmapRequests < 1 || newBlockmapRequests < 1 || installerRangeRequests < 1 || redirectRequests < 3) {
    throw new Error(`Differential feed was not fully exercised: metadata=${metadataRequests}, oldBlockmap=${oldBlockmapRequests}, newBlockmap=${newBlockmapRequests}, ranges=${installerRangeRequests}, redirects=${redirectRequests}`)
  }
  if (installerFullRequests !== 0) {
    throw new Error(`Updater unexpectedly fell back to ${installerFullRequests} full installer request(s)`)
  }
  if (installerTransferredBytes >= installerSize * 0.25) {
    throw new Error(`Differential transfer was too large: ${installerTransferredBytes}/${installerSize}`)
  }
  const cachedFiles = await readdir(localAppDataDirectory, { recursive: true })
  if (!cachedFiles.some((name) => String(name).endsWith(targetName))) {
    throw new Error('Downloaded installer was not found in the isolated updater cache')
  }
  console.log(`Packaged update smoke passed: ${JSON.stringify({
    ...result,
    metadataRequests,
    oldBlockmapRequests,
    newBlockmapRequests,
    installerRangeRequests,
    redirectRequests,
    installerTransferredBytes,
    fullInstallerBytes: installerSize,
    previousReleaseVersion: previousRelease.version,
    isolatedCache: true,
  })}`)
} finally {
  if (timeout) clearTimeout(timeout)
  await terminate(child)
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
  await rm(temporaryDirectory, { recursive: true, force: true })
}

function versionTuple(value) {
  const match = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  return match ? match.slice(1).map(Number) : null
}

function compareStableVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

async function resolvePreviousStableRelease(candidateVersion) {
  const candidateTuple = versionTuple(candidateVersion)
  if (!candidateTuple) throw new Error('Candidate version is invalid')
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HexBridge-update-smoke',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }
  const response = await fetch(
    'https://api.github.com/repos/RocXOvO/HexBridge/releases?per_page=100&page=1',
    { headers, signal: AbortSignal.timeout(30_000) },
  )
  if (!response.ok) throw new Error(`Unable to inspect retained releases: HTTP ${response.status}`)
  const releases = await response.json()
  if (!Array.isArray(releases)) throw new Error('Retained release response is invalid')
  const eligible = releases
    .filter((release) => !release?.draft && !release?.prerelease && versionTuple(release?.tag_name))
    .map((release) => ({ release, tuple: versionTuple(release.tag_name) }))
    .filter(({ tuple }) => compareStableVersions(tuple, candidateTuple) < 0)
    .sort((left, right) => compareStableVersions(right.tuple, left.tuple))
  const selected = eligible[0]?.release
  const version = String(selected?.tag_name ?? '').replace(/^v/, '')
  if (!selected || !versionTuple(version)) throw new Error('No retained previous stable Release is available')
  const installerName = `HexBridge-${version}-x64.exe`
  const blockmapName = `${installerName}.blockmap`
  const assets = Array.isArray(selected.assets) ? selected.assets : []
  const installer = assets.find((asset) => asset?.name === installerName)
  const blockmap = assets.find((asset) => asset?.name === blockmapName)
  const expectedPrefix = `https://github.com/RocXOvO/HexBridge/releases/download/v${version}/`
  if (
    !installer?.browser_download_url?.startsWith(expectedPrefix) ||
    !blockmap?.browser_download_url?.startsWith(expectedPrefix) ||
    !Number.isSafeInteger(installer.size) || installer.size < 1 ||
    !Number.isSafeInteger(blockmap.size) || blockmap.size < 1
  ) {
    throw new Error('Previous stable Release is missing trusted differential assets')
  }
  return {
    version,
    installerUrl: installer.browser_download_url,
    blockmapUrl: blockmap.browser_download_url,
  }
}

async function downloadPublicAsset(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'HexBridge-update-smoke' },
    redirect: 'follow',
    signal: AbortSignal.timeout(240_000),
  })
  if (!response.ok || !response.body) throw new Error(`Unable to download retained update asset: HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: 'wx' }))
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
