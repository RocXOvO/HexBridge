import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outputDirectory = path.resolve('build')
await mkdir(outputDirectory, { recursive: true })
await sharp(path.resolve('resources', 'icon.svg'))
  .resize(1024, 1024)
  .png()
  .toFile(path.join(outputDirectory, 'icon.png'))
console.log('Generated build/icon.png')
