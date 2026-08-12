import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const releaseDirectory = path.resolve('release')
const { version } = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
const artifactPrefix = `HexBridge-${version}-`
const files = (await readdir(releaseDirectory))
  .filter((name) => name.startsWith(artifactPrefix) && /\.(?:exe|zip)$/.test(name))
  .sort()
if (
  files.length !== 2 ||
  !files.some((name) => name.endsWith('.exe')) ||
  !files.some((name) => name.endsWith('.zip'))
) {
  throw new Error(`Expected exactly one ${version} EXE and ZIP artifact, found: ${files.join(', ') || 'none'}`)
}

const lines = []
for (const name of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(releaseDirectory, name))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${name}`)
}
await writeFile(path.join(releaseDirectory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote SHA256SUMS.txt for ${files.length} artifacts`)
