import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const tag = process.env.GITHUB_REF_NAME
if (repository !== 'RocXOvO/HexBridge') throw new Error('Stable channel repository mismatch')
if (!token) throw new Error('GITHUB_TOKEN is required to publish the stable channel')

const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
const version = String(packageJson.version)
if (tag !== `v${version}`) throw new Error(`Stable channel tag ${tag} does not match ${version}`)
const content = await readFile(path.join(process.cwd(), 'release', 'update-channel', 'v2', 'latest.yml'), 'utf8')
if (!content.startsWith(`version: ${version}\n`)) throw new Error('Stable channel content version mismatch')

const parseStableVersion = (value) => {
  const parsed = value.match(/^version:\s*(\d+)\.(\d+)\.(\d+)\s*$/m)
  if (!parsed) throw new Error('Existing stable channel version is invalid')
  return parsed.slice(1).map(Number)
}
const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

const apiUrl = `https://api.github.com/repos/${repository}/contents/v2/latest.yml`
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'HexBridge-release-workflow',
  'X-GitHub-Api-Version': '2022-11-28',
}
const releaseResponse = await fetch(
  `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
  { headers },
)
if (!releaseResponse.ok) throw new Error(`Unable to verify published release: HTTP ${releaseResponse.status}`)
const release = await releaseResponse.json()
const expectedInstaller = `HexBridge-${version}-x64.exe`
const expectedSize = Number(content.match(/^\s{4}size:\s*(\d+)$/m)?.[1])
const installerAsset = Array.isArray(release?.assets)
  ? release.assets.find((asset) => asset?.name === expectedInstaller)
  : null
if (release?.draft || release?.prerelease || installerAsset?.size !== expectedSize) {
  throw new Error('Published release installer does not match the stable channel')
}
if (!release.assets.some((asset) => asset?.name === 'latest.yml')) {
  throw new Error('Published release is missing latest.yml')
}
const currentResponse = await fetch(`${apiUrl}?ref=update-channel`, { headers })
if (!currentResponse.ok && currentResponse.status !== 404) {
  throw new Error(`Unable to inspect stable channel: HTTP ${currentResponse.status}`)
}
const current = currentResponse.ok ? await currentResponse.json() : null
const currentContent = typeof current?.content === 'string'
  ? Buffer.from(current.content.replace(/\s+/g, ''), 'base64').toString('utf8')
  : null
let shouldPublish = true
if (currentResponse.ok) {
  if (!currentContent) throw new Error('Existing stable channel content is unavailable')
  const comparison = compareVersions(parseStableVersion(currentContent), parseStableVersion(content))
  if (comparison > 0) throw new Error('Refusing to roll back the stable update channel')
  if (comparison === 0) {
    if (currentContent !== content) throw new Error('Stable channel version already exists with different content')
    shouldPublish = false
  }
}
const body = {
  message: `Publish HexBridge stable channel v${version}`,
  content: Buffer.from(content).toString('base64'),
  branch: 'update-channel',
  ...(typeof current?.sha === 'string' ? { sha: current.sha } : {}),
}
if (shouldPublish) {
  const updateResponse = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) })
  if (!updateResponse.ok) throw new Error(`Unable to publish stable channel: HTTP ${updateResponse.status}`)
}

const rawUrl = 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/latest.yml'
let verified = false
for (let attempt = 0; attempt < 8; attempt += 1) {
  const response = await fetch(`${rawUrl}?noCache=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
  const remote = response?.ok ? await response.text() : ''
  if (remote === content) {
    verified = true
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
if (!verified) throw new Error('Published stable channel did not become readable')
console.log(`Published and verified stable update channel ${version}`)
