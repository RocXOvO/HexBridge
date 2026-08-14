import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid stable version: ${version}`)

const source = await readFile(path.join(root, 'release', 'latest.yml'), 'utf8')
const value = (pattern, label) => {
  const match = source.match(pattern)
  if (!match?.[1]) throw new Error(`release/latest.yml missing ${label}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

const metadataVersion = value(/^version:\s*(.+)$/m, 'version')
const installerName = `HexBridge-${version}-x64.exe`
const sourceUrl = value(/^\s{2}- url:\s*(.+)$/m, 'files[0].url')
const sha512 = value(/^\s{4}sha512:\s*(.+)$/m, 'files[0].sha512')
const size = Number(value(/^\s{4}size:\s*(\d+)$/m, 'files[0].size'))
const releaseDate = value(/^releaseDate:\s*(.+)$/m, 'releaseDate')
if (metadataVersion !== version || sourceUrl !== installerName) {
  throw new Error('Release metadata does not match the current package version')
}
if (!/^[A-Za-z0-9+/]{80,}={0,2}$/.test(sha512) || !Number.isSafeInteger(size) || size < 1) {
  throw new Error('Release metadata checksum or size is invalid')
}
const installerUrl = `https://github.com/RocXOvO/HexBridge/releases/download/v${version}/${installerName}`
const output = [
  `version: ${version}`,
  'files:',
  `  - url: ${installerUrl}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${installerUrl}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n')

const outputDirectory = path.join(root, 'release', 'update-channel')
await mkdir(path.join(outputDirectory, 'v2'), { recursive: true })
await writeFile(path.join(outputDirectory, 'v2', 'latest.yml'), output, 'utf8')
await writeFile(path.join(outputDirectory, 'latest.yml'), output, 'utf8')
console.log(`Rendered stable update channel for ${version}`)
