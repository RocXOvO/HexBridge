const legacyUrl = `https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/latest.yml?noCache=${Date.now()}`
const response = await fetch(legacyUrl, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
if (!response.ok) throw new Error(`Legacy update channel returned HTTP ${response.status}`)
const metadata = await response.text()
const value = (pattern, label) => {
  const match = metadata.match(pattern)
  if (!match?.[1]) throw new Error(`Legacy update channel missing ${label}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}
const version = value(/^version:\s*(.+)$/m, 'version')
const installerUrl = value(/^\s{2}- url:\s*(.+)$/m, 'files[0].url')
const size = Number(value(/^\s{4}size:\s*(\d+)$/m, 'files[0].size'))
const sha512 = value(/^\s{4}sha512:\s*(.+)$/m, 'files[0].sha512')
if (
  version !== '0.1.14' ||
  installerUrl !== 'https://github.com/RocXOvO/HexBridge/releases/download/v0.1.14/HexBridge-0.1.14-x64.exe' ||
  size !== 199_183_989 ||
  sha512 !== '+20kE08T2vRQ1K8oQN36pai4nYaCQFlsPOwwH5YZ2zMz8NYTavMUc9XNA54XRJprVZ2pbi+H27mNV5WLp6+o9Q=='
) {
  throw new Error('Legacy update channel must remain frozen at the retained v0.1.14 Release')
}
console.log('Verified frozen v0.1.14 legacy update channel')
