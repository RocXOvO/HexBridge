import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { renderStableReleaseNotes } from './release-notes.mjs'

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const tag = process.env.GITHUB_REF_NAME
if (repository !== 'RocXOvO/HexBridge' || !token) throw new Error('Stable Release publisher requires GitHub Actions credentials')
const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
const version = String(packageJson.version)
if (tag !== `v${version}`) throw new Error(`Stable Release tag ${tag} does not match ${version}`)

const releaseDirectory = path.resolve('release')
const assetNames = [
  `HexBridge-${version}-x64.exe`,
  `HexBridge-${version}-x64.zip`,
  `HexBridge-${version}-x64.exe.blockmap`,
  'latest.yml',
  'SHA256SUMS.txt',
]
const localAssets = new Map(await Promise.all(assetNames.map(async (name) => {
  const filePath = path.join(releaseDirectory, name)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return [name, { filePath, size: (await stat(filePath)).size, digest: `sha256:${hash.digest('hex')}` }]
})))
const apiHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'HexBridge-release-workflow',
  'X-GitHub-Api-Version': '2022-11-28',
}
const api = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...apiHeaders, ...options.headers } })
  if (!response.ok) throw new Error(`GitHub Release operation failed: HTTP ${response.status}`)
  return response
}

let releases = null
for (let page = 1; page <= 10; page += 1) {
  const batch = await api(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`).then((response) => response.json())
  if (!Array.isArray(batch)) throw new Error('GitHub Release list is invalid')
  releases ??= []
  releases.push(...batch)
  if (batch.length < 100) break
  if (page === 10) throw new Error('GitHub Release list exceeds the bounded publisher')
}
let release = releases.find((candidate) => candidate?.tag_name === tag) ?? null
const releaseBody = renderStableReleaseNotes({ repository, version, releases })
if (!release) {
  release = await api(`https://api.github.com/repos/${repository}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      draft: true,
      prerelease: false,
      body: releaseBody,
    }),
  }).then((response) => response.json())
}
if (!release?.id || release.prerelease || (!release.draft && assetNames.some((name) => !release.assets?.some((asset) => asset.name === name)))) {
  throw new Error('Existing tagged Release cannot be safely resumed')
}

for (const name of assetNames) {
  const local = localAssets.get(name)
  let existing = release.assets?.find((asset) => asset?.name === name)
  if (existing?.state === 'starter' && existing?.size === 0 && Number.isSafeInteger(existing?.id)) {
    if (!release.draft) throw new Error('Refusing to remove an asset from a published Release')
    await api(`https://api.github.com/repos/${repository}/releases/assets/${existing.id}`, { method: 'DELETE' })
    existing = null
  }
  if (existing) {
    if (existing.size !== local.size || existing.digest !== local.digest) {
      throw new Error(`Existing Release asset ${name} differs from the current build`)
    }
    continue
  }
  if (!release.draft) throw new Error('Published stable Release is missing an immutable asset')
  const uploadUrl = `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(local.size),
      'User-Agent': 'HexBridge-release-workflow',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: createReadStream(local.filePath),
    duplex: 'half',
  })
  if (!response.ok) throw new Error(`Unable to upload Release asset ${name}: HTTP ${response.status}`)
}

release = await api(`https://api.github.com/repos/${repository}/releases/${release.id}`).then((response) => response.json())
for (const name of assetNames) {
  const local = localAssets.get(name)
  const asset = release.assets?.find((candidate) => candidate?.name === name)
  if (asset?.size !== local.size || asset?.digest !== local.digest) {
    throw new Error(`Uploaded Release asset ${name} failed digest verification`)
  }
}
if (release.draft) {
  release = await api(`https://api.github.com/repos/${repository}/releases/${release.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: releaseBody, draft: false, prerelease: false, make_latest: 'true' }),
  }).then((response) => response.json())
}
if (release.draft || release.prerelease) throw new Error('Stable Release was not published')
console.log(`Published and verified stable Release ${tag}`)
