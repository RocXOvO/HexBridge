import { appendFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const tag = process.env.GITHUB_REF_NAME
const outputFile = process.env.GITHUB_OUTPUT
if (repository !== 'RocXOvO/HexBridge') throw new Error('Stable release repository mismatch')
if (!token || !outputFile) throw new Error('Stable release preflight requires GitHub Actions credentials')

const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
const version = String(packageJson.version)
if (tag !== `v${version}`) throw new Error(`Stable release tag ${tag} does not match ${version}`)

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'HexBridge-release-workflow',
  'X-GitHub-Api-Version': '2022-11-28',
}
const versionParts = (value) => {
  const parsed = value.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!parsed) throw new Error('Stable channel version is invalid')
  return parsed.slice(1).map(Number)
}
const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}
const field = (source, pattern, label) => {
  const match = source.match(pattern)
  if (!match?.[1]) throw new Error(`Stable metadata is missing ${label}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}
const parseMetadata = (source) => ({
  version: field(source, /^version:\s*(.+)$/m, 'version'),
  url: field(source, /^\s{2}- url:\s*(.+)$/m, 'files[0].url'),
  sha512: field(source, /^\s{4}sha512:\s*(.+)$/m, 'files[0].sha512'),
  size: Number(field(source, /^\s{4}size:\s*(\d+)$/m, 'files[0].size')),
})

const contentsUrl = `https://api.github.com/repos/${repository}/contents/latest.yml?ref=update-channel`
const currentResponse = await fetch(contentsUrl, { headers })
if (!currentResponse.ok && currentResponse.status !== 404) {
  throw new Error(`Unable to inspect stable channel: HTTP ${currentResponse.status}`)
}
const current = currentResponse.ok ? await currentResponse.json() : null
const currentContent = typeof current?.content === 'string'
  ? Buffer.from(current.content.replace(/\s+/g, ''), 'base64').toString('utf8')
  : null
const currentMetadata = currentContent ? parseMetadata(currentContent) : null
const comparison = currentMetadata
  ? compareVersions(versionParts(version), versionParts(currentMetadata.version))
  : 1
if (comparison < 0) throw new Error('Refusing to publish a release older than the stable channel')

const releaseResponse = await fetch(
  `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
  { headers },
)
if (!releaseResponse.ok && releaseResponse.status !== 404) {
  throw new Error(`Unable to inspect tagged release: HTTP ${releaseResponse.status}`)
}

let shouldPublish = true
if (comparison === 0) {
  if (!currentContent || !releaseResponse.ok) {
    throw new Error('Stable channel version exists without a matching published release')
  }
  const release = await releaseResponse.json()
  const installerName = `HexBridge-${version}-x64.exe`
  const requiredAssets = new Set([
    installerName,
    `HexBridge-${version}-x64.zip`,
    `${installerName}.blockmap`,
    'latest.yml',
    'SHA256SUMS.txt',
  ])
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const names = new Set(assets.map((asset) => asset?.name))
  if (release?.draft || release?.prerelease || [...requiredAssets].some((name) => !names.has(name))) {
    throw new Error('Existing stable release is incomplete')
  }
  const installer = assets.find((asset) => asset?.name === installerName)
  const metadataAsset = assets.find((asset) => asset?.name === 'latest.yml')
  const metadataResponse = await fetch(metadataAsset.url, {
    headers: { ...headers, Accept: 'application/octet-stream' },
  })
  if (!metadataResponse.ok) throw new Error(`Unable to verify release metadata: HTTP ${metadataResponse.status}`)
  const releaseMetadata = parseMetadata(await metadataResponse.text())
  const officialUrl = `https://github.com/${repository}/releases/download/${tag}/${installerName}`
  if (
    currentMetadata.version !== version ||
    currentMetadata.url !== officialUrl ||
    releaseMetadata.version !== version ||
    releaseMetadata.url !== installerName ||
    currentMetadata.sha512 !== releaseMetadata.sha512 ||
    currentMetadata.size !== releaseMetadata.size ||
    installer?.size !== releaseMetadata.size
  ) {
    throw new Error('Existing release does not match the stable channel')
  }
  shouldPublish = false
} else if (releaseResponse.ok) {
  throw new Error('Tagged release already exists ahead of the stable channel; refusing to overwrite assets')
}

await appendFile(outputFile, `should_publish=${shouldPublish}\n`, 'utf8')
console.log(shouldPublish ? `Stable release ${version} may be published` : `Stable release ${version} is already complete`)
