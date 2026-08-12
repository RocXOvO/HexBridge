import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const releaseDirectory = path.join(root, 'release')
const installerName = `HexBridge-${version}-x64.exe`
const installerPath = path.join(releaseDirectory, installerName)
const blockmapName = `${installerName}.blockmap`
const metadataPath = path.join(releaseDirectory, 'latest.yml')
const appUpdatePath = path.join(releaseDirectory, 'win-unpacked', 'resources', 'app-update.yml')

const [metadata, appUpdate, installer, releaseFiles] = await Promise.all([
  readFile(metadataPath, 'utf8'),
  readFile(appUpdatePath, 'utf8'),
  readFile(installerPath),
  readdir(releaseDirectory),
])
const installerSize = (await stat(installerPath)).size
const blockmapSize = (await stat(path.join(releaseDirectory, blockmapName))).size
const sha512 = createHash('sha512').update(installer).digest('base64')

const value = (pattern, label) => {
  const match = metadata.match(pattern)
  if (!match?.[1]) throw new Error(`latest.yml missing ${label}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

const metadataVersion = value(/^version:\s*(.+)$/m, 'version')
const metadataUrl = value(/^\s{2}- url:\s*(.+)$/m, 'files[0].url')
const fileSha512 = value(/^\s{4}sha512:\s*(.+)$/m, 'files[0].sha512')
const fileSize = Number(value(/^\s{4}size:\s*(\d+)$/m, 'files[0].size'))
const legacyPath = value(/^path:\s*(.+)$/m, 'path')
const legacySha512 = value(/^sha512:\s*(.+)$/m, 'sha512')

if (metadataVersion !== version) throw new Error(`latest.yml version ${metadataVersion} != ${version}`)
if (metadataUrl !== installerName || legacyPath !== installerName) {
  throw new Error('latest.yml does not reference the current NSIS installer')
}
if (fileSize !== installerSize) throw new Error('latest.yml installer size mismatch')
if (fileSha512 !== sha512 || legacySha512 !== sha512) {
  throw new Error('latest.yml installer SHA-512 mismatch')
}
if (!releaseFiles.includes(blockmapName) || blockmapSize < 1) throw new Error(`Missing or empty ${blockmapName}`)
if ((metadata.match(/^\s{2}- url:/gm) ?? []).length !== 1) {
  throw new Error('latest.yml must contain exactly one update file')
}
const currentBlockmaps = releaseFiles.filter((name) =>
  name.startsWith(`HexBridge-${version}-`) && name.endsWith('.exe.blockmap'))
if (currentBlockmaps.length !== 1 || currentBlockmaps[0] !== blockmapName) {
  throw new Error('Expected exactly one current-version NSIS blockmap')
}
if (!/^provider:\s*github$/m.test(appUpdate)) throw new Error('Packaged app-update.yml provider is not GitHub')
if (!/^owner:\s*RocXOvO$/m.test(appUpdate) || !/^repo:\s*HexBridge$/m.test(appUpdate)) {
  throw new Error('Packaged app-update.yml repository mismatch')
}

console.log(`Verified updater metadata for ${installerName} (${installerSize} bytes)`)
