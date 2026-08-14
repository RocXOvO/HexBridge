import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchWithTimeout, pollExactText } from './update-channel-poll.mjs'
import { classifyUpdateChannelContent } from './update-channel-policy.mjs'

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

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'HexBridge-release-workflow',
  'X-GitHub-Api-Version': '2022-11-28',
}
const api = (url, options = {}) => fetchWithTimeout(url, {
  ...options,
  headers: { ...headers, ...options.headers },
}, { timeoutMs: 10_000 })

const releaseResponse = await api(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`)
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

const branch = 'update-channel'
const publishPath = async (channelPath) => {
  const apiUrl = `https://api.github.com/repos/${repository}/contents/${channelPath}`
  const currentResponse = await api(`${apiUrl}?ref=${branch}`)
  if (!currentResponse.ok && currentResponse.status !== 404) {
    throw new Error(`Unable to inspect ${channelPath}: HTTP ${currentResponse.status}`)
  }
  const current = currentResponse.ok ? await currentResponse.json() : null
  const currentContent = typeof current?.content === 'string'
    ? Buffer.from(current.content.replace(/\s+/g, ''), 'base64').toString('utf8')
    : null
  if (currentResponse.ok && !currentContent) throw new Error(`Existing ${channelPath} content is unavailable`)
  if (classifyUpdateChannelContent(currentContent, content) === 'current') return false
  const updateResponse = await api(apiUrl, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Publish HexBridge stable channel v${version} (${channelPath})`,
      content: Buffer.from(content).toString('base64'),
      branch,
      ...(typeof current?.sha === 'string' ? { sha: current.sha } : {}),
    }),
  })
  if (!updateResponse.ok) throw new Error(`Unable to publish ${channelPath}: HTTP ${updateResponse.status}`)
  const published = await updateResponse.json()
  const expectedBlobSha = published?.content?.sha
  const expectedCommitSha = published?.commit?.sha
  if (typeof expectedBlobSha !== 'string' || typeof expectedCommitSha !== 'string') {
    throw new Error(`${channelPath} publish response is incomplete`)
  }
  const readbackResponse = await api(`${apiUrl}?ref=${branch}`)
  if (!readbackResponse.ok) throw new Error(`Unable to read back ${channelPath}: HTTP ${readbackResponse.status}`)
  const readback = await readbackResponse.json()
  const readbackContent = typeof readback?.content === 'string'
    ? Buffer.from(readback.content.replace(/\s+/g, ''), 'base64').toString('utf8')
    : null
  if (readback?.sha !== expectedBlobSha || readbackContent !== content) {
    throw new Error(`${channelPath} authoritative readback differs from the published content`)
  }
  const refResponse = await api(`https://api.github.com/repos/${repository}/git/ref/heads/${branch}`)
  if (!refResponse.ok) throw new Error(`Unable to verify ${branch} commit: HTTP ${refResponse.status}`)
  const ref = await refResponse.json()
  if (ref?.object?.sha !== expectedCommitSha) {
    throw new Error(`${channelPath} branch commit did not match the publish result`)
  }
  return true
}

await publishPath('v2/latest.yml')
await publishPath('latest.yml')

for (const rawUrl of [
  'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/latest.yml',
  'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/latest.yml',
]) {
  await pollExactText({ url: rawUrl, expectedText: content })
}
console.log(`Published and verified stable update channels ${version}`)
