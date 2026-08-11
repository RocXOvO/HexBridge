import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const releaseDirectory = path.resolve('release')
const files = (await readdir(releaseDirectory))
  .filter((name) => /\.(?:exe|zip)$/.test(name))
  .sort()

const lines = []
for (const name of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(releaseDirectory, name))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${name}`)
}
await writeFile(path.join(releaseDirectory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote SHA256SUMS.txt for ${files.length} artifacts`)
