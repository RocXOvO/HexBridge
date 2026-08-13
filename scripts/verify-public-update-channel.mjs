const expectedVersion = (process.env.HEXBRIDGE_EXPECTED_UPDATE_VERSION || process.argv[2] || '').replace(/^v/, '')
const versionedUrl = `https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/latest.yml?noCache=${Date.now()}`
const legacyUrl = `https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/latest.yml?noCache=${Date.now()}`
let response = await fetch(versionedUrl, { cache: 'no-store' })
if (!response.ok && response.status === 404 && !expectedVersion) {
  response = await fetch(legacyUrl, { cache: 'no-store' })
}
if (!response.ok) throw new Error(`Stable update channel returned HTTP ${response.status}`)
const metadata = await response.text()
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
console.log(`Verified public stable update channel ${version} (${size} bytes)`)
