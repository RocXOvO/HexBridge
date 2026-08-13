import { readFile, stat } from 'node:fs/promises'

const [png, ico] = await Promise.all([readFile('build/icon.png'), readFile('build/icon.ico')])
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw new Error('build/icon.png is not a PNG')
}
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 4) {
  throw new Error('build/icon.ico is not a multi-size Windows icon')
}
const sizes = await Promise.all(['build/icon.png', 'build/icon.ico'].map(async (file) => (await stat(file)).size))
if (sizes.some((size) => size < 1_000)) throw new Error('Generated application icon is unexpectedly empty')
console.log(`Verified application icons (${sizes.join(', ')} bytes)`)
