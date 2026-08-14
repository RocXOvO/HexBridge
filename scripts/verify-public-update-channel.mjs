import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pollText } from './update-channel-poll.mjs'

const expectedVersion = (process.env.HEXBRIDGE_EXPECTED_UPDATE_VERSION || process.argv[2] || '').replace(/^v/, '')
const versionedUrl = 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/latest.yml'
let exactContent = null
if (expectedVersion) {
  exactContent = await readFile(
    path.join(process.cwd(), 'release', 'update-channel', 'v2', 'latest.yml'),
    'utf8',
  ).catch(() => null)
}
const versionFrom = (metadata) => metadata.match(/^version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1] ?? null
const result = await pollText({
  url: versionedUrl,
  acceptText: (metadata) => exactContent !== null
    ? metadata === exactContent
    : Boolean(versionFrom(metadata) && (!expectedVersion || versionFrom(metadata) === expectedVersion)),
})
const metadata = result.text
const value = (pattern, label) => {
  const match = metadata.match(pattern)
  if (!match?.[1]) throw new Error(`Stable update channel missing ${label}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}
const version = value(/^version:\s*(.+)$/m, 'version')
const installerUrl = value(/^\s{2}- url:\s*(.+)$/m, 'files[0].url')
const legacyPath = value(/^path:\s*(.+)$/m, 'path')
const sha512 = value(/^\s{4}sha512:\s*(.+)$/m, 'files[0].sha512')
const size = Number(value(/^\s{4}size:\s*(\d+)$/m, 'files[0].size'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Stable update channel version is invalid')
if (expectedVersion && version !== expectedVersion) {
  throw new Error(`Stable update channel ${version} does not match expected ${expectedVersion}`)
}
const expectedUrl = `https://github.com/RocXOvO/HexBridge/releases/download/v${version}/HexBridge-${version}-x64.exe`
if (installerUrl !== expectedUrl || legacyPath !== expectedUrl) {
  throw new Error('Stable update channel installer URL is outside the official release allowlist')
}
if (!/^[A-Za-z0-9+/]{80,}={0,2}$/.test(sha512) || !Number.isSafeInteger(size) || size < 1) {
  throw new Error('Stable update channel checksum or size is invalid')
}
console.log(`Verified public stable update channel ${version} (${size} bytes, ${result.attempts} attempt(s))`)
