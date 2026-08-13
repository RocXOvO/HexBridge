import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outputDirectory = path.resolve('build')
await mkdir(outputDirectory, { recursive: true })
const source = path.resolve('resources', 'icon.svg')
await sharp(source)
  .resize(1024, 1024)
  .png()
  .toFile(path.join(outputDirectory, 'icon.png'))

const sizes = [16, 24, 32, 48, 64, 128, 256]
const sourceBuffer = await readFile(source)
const images = await Promise.all(sizes.map((size) => sharp(sourceBuffer).resize(size, size).png().toBuffer()))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
images.forEach((image, index) => {
  const size = sizes[index]
  const entry = 6 + index * 16
  header.writeUInt8(size === 256 ? 0 : size, entry)
  header.writeUInt8(size === 256 ? 0 : size, entry + 1)
  header.writeUInt8(0, entry + 2)
  header.writeUInt8(0, entry + 3)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
await writeFile(path.join(outputDirectory, 'icon.ico'), Buffer.concat([header, ...images]))
console.log('Generated build/icon.png and build/icon.ico')
