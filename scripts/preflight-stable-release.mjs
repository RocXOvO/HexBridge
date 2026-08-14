import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import {
  higherStableReleaseTags,
} from './stable-release-policy.mjs'
import { classifyTaggedRelease, publicationActions } from './release-preflight-policy.mjs'
import { canonicalUpdateChannelContent, planUpdateChannels } from './update-channel-policy.mjs'

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
  releaseDate: field(source, /^releaseDate:\s*(.+)$/m, 'releaseDate'),
})
const renderChannelMetadata = (metadata, installerUrl) => [
  `version: ${metadata.version}`,
  'files:',
  `  - url: ${installerUrl}`,
  `    sha512: ${metadata.sha512}`,
  `    size: ${metadata.size}`,
  `path: ${installerUrl}`,
  `sha512: ${metadata.sha512}`,
  `releaseDate: '${metadata.releaseDate}'`,
  '',
].join('\n')

const releaseDirectory = path.join(process.cwd(), 'release')
const localChannelContent = await readFile(path.join(releaseDirectory, 'update-channel', 'v2', 'latest.yml'), 'utf8')

const channelPaths = ['v2/latest.yml', 'latest.yml']
const currentChannels = await Promise.all(channelPaths.map(async (channelPath) => {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${channelPath}?ref=update-channel`,
    { headers },
  )
  if (!response.ok && response.status !== 404) {
    throw new Error(`Unable to inspect ${channelPath}: HTTP ${response.status}`)
  }
  const value = response.ok ? await response.json() : null
  const content = typeof value?.content === 'string'
    ? Buffer.from(value.content.replace(/\s+/g, ''), 'base64').toString('utf8')
    : null
  return { channelPath, content, metadata: content ? parseMetadata(content) : null }
}))
const publishedReleases = []
let releasePageComplete = false
for (let page = 1; page <= 10; page += 1) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
    { headers },
  )
  if (!response.ok) throw new Error(`Unable to inspect published releases: HTTP ${response.status}`)
  const batch = await response.json()
  if (!Array.isArray(batch)) throw new Error('Published release list is invalid')
  publishedReleases.push(...batch)
  if (batch.length < 100) {
    releasePageComplete = true
    break
  }
}
if (!releasePageComplete) throw new Error('Published release list exceeds the bounded preflight')
const higherStable = higherStableReleaseTags(publishedReleases, version)
if (higherStable.length) {
  throw new Error('Refusing to publish because a higher stable Release exists')
}

const installerName = `HexBridge-${version}-x64.exe`
const requiredAssetNames = [
  installerName,
  `HexBridge-${version}-x64.zip`,
  `${installerName}.blockmap`,
  'latest.yml',
  'SHA256SUMS.txt',
]
const localReleaseContent = await readFile(path.join(releaseDirectory, 'latest.yml'), 'utf8')
const localReleaseMetadata = parseMetadata(localReleaseContent)
const localChannelMetadata = parseMetadata(localChannelContent)
const matchingReleases = publishedReleases.filter((candidate) => candidate?.tag_name === tag)
if (matchingReleases.length > 1) throw new Error('Multiple Releases exist for the candidate tag')
const release = matchingReleases[0] ?? null

const sha256File = async (filePath) => {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { size, digest: `sha256:${hash.digest('hex')}` }
}
const localAssets = new Map(await Promise.all(requiredAssetNames.map(async (name) => [
  name,
  await sha256File(path.join(releaseDirectory, name)),
])))
const releaseClassification = classifyTaggedRelease(release, requiredAssetNames, localAssets)

const assertLocalMetadataConsistent = () => {
  const officialUrl = `https://github.com/${repository}/releases/download/${tag}/${installerName}`
  if (
    localReleaseMetadata.version !== version ||
    localReleaseMetadata.url !== installerName ||
    localChannelMetadata.version !== version ||
    localChannelMetadata.url !== officialUrl ||
    localReleaseMetadata.sha512 !== localChannelMetadata.sha512 ||
    localReleaseMetadata.size !== localChannelMetadata.size
  ) {
    throw new Error('Local release and stable channel metadata are inconsistent')
  }
}

const verifyExistingRelease = async () => {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const names = new Set(assets.map((asset) => asset?.name))
  if (release?.draft || release?.prerelease || requiredAssetNames.some((name) => !names.has(name))) {
    throw new Error('Existing stable release is incomplete')
  }
  if (requiredAssetNames.some((name) => {
    const asset = assets.find((candidate) => candidate?.name === name)
    return !Number.isSafeInteger(asset?.size) || asset.size < 1
  })) {
    throw new Error('Existing stable release contains an empty asset')
  }
  const installer = assets.find((asset) => asset?.name === installerName)
  const metadataAsset = assets.find((asset) => asset?.name === 'latest.yml')
  const checksumAsset = assets.find((asset) => asset?.name === 'SHA256SUMS.txt')
  if (assets.some((asset) => !/^sha256:[a-f0-9]{64}$/.test(String(asset?.digest)))) {
    throw new Error('Existing stable release asset digests are unavailable')
  }
  const metadataResponse = await fetch(metadataAsset.url, {
    headers: { ...headers, Accept: 'application/octet-stream' },
  })
  if (!metadataResponse.ok) throw new Error(`Unable to verify release metadata: HTTP ${metadataResponse.status}`)
  const remoteReleaseContent = await metadataResponse.text()
  const releaseMetadata = parseMetadata(remoteReleaseContent)
  const checksumResponse = await fetch(checksumAsset.url, {
    headers: { ...headers, Accept: 'application/octet-stream' },
  })
  if (!checksumResponse.ok) throw new Error(`Unable to verify release checksums: HTTP ${checksumResponse.status}`)
  const remoteChecksums = await checksumResponse.text()
  const checksumLines = remoteChecksums.trim().split(/\r?\n/)
  const expectedChecksumNames = new Set([installerName, `HexBridge-${version}-x64.zip`])
  if (
    checksumLines.length !== 2 ||
    checksumLines.some((line) => {
      const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/)
      if (!match || !expectedChecksumNames.delete(match[2])) return true
      return assets.find((asset) => asset?.name === match[2])?.digest !== `sha256:${match[1]}`
    }) || expectedChecksumNames.size
  ) {
    throw new Error('Existing stable release checksum manifest is inconsistent')
  }
  const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
  if (metadataAsset.digest !== sha256(remoteReleaseContent) || checksumAsset.digest !== sha256(remoteChecksums)) {
    throw new Error('Existing stable release metadata digest is inconsistent')
  }
  const officialUrl = `https://github.com/${repository}/releases/download/${tag}/${installerName}`
  if (
    releaseMetadata.version !== version ||
    releaseMetadata.url !== installerName ||
    installer?.size !== releaseMetadata.size
  ) {
    throw new Error('Existing stable release metadata does not match its installer asset')
  }
  return renderChannelMetadata(releaseMetadata, officialUrl)
}

let publishedChannelContent = null
if (releaseClassification.kind === 'published') {
  // A previous run may have uploaded and published all immutable assets before
  // one or both update-channel writes completed. Rebuilds can have a different
  // releaseDate, so the immutable published metadata is the canonical retry
  // content rather than this run's newly rendered local file.
  publishedChannelContent = await verifyExistingRelease()
} else if (releaseClassification.kind === 'matching-draft') {
  assertLocalMetadataConsistent()
  console.log(`Resuming matching draft Release; missing ${releaseClassification.missing.length} asset(s)`)
} else {
  assertLocalMetadataConsistent()
}

const canonicalChannelContent = canonicalUpdateChannelContent(
  releaseClassification.kind,
  localChannelContent,
  publishedChannelContent,
)
if (releaseClassification.kind === 'published') {
  await writeFile(path.join(releaseDirectory, 'update-channel', 'v2', 'latest.yml'), canonicalChannelContent, 'utf8')
  await writeFile(path.join(releaseDirectory, 'update-channel', 'latest.yml'), canonicalChannelContent, 'utf8')
}

const channelPlan = planUpdateChannels(
  currentChannels.map((channel) => channel.content),
  canonicalChannelContent,
)
const comparison = channelPlan.shouldPublish ? 1 : 0
const { shouldPublishRelease, shouldPublishChannel } = publicationActions(
  releaseClassification.kind,
  comparison,
)

await appendFile(outputFile, `should_publish=${shouldPublishRelease}\n`, 'utf8')
await appendFile(outputFile, `should_publish_release=${shouldPublishRelease}\n`, 'utf8')
await appendFile(outputFile, `should_publish_channel=${shouldPublishChannel}\n`, 'utf8')
console.log(JSON.stringify({ version, shouldPublishRelease, shouldPublishChannel }))
