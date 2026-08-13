import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/extract-ocr-title-fixture.mjs <4k-calibration-screenshot>')

const source = path.resolve(input)
const outputDirectory = path.resolve('tests', 'fixtures', 'ocr')
await mkdir(outputDirectory, { recursive: true })
const metadata = await sharp(source).metadata()
if (!metadata.width || !metadata.height) throw new Error('OCR fixture screenshot dimensions are unavailable')

// Card rectangles are normalized from the user-provided 3840x2093 4K
// calibration capture. Only the three title bands are retained as fixtures.
const cards = [
  ['left', { x: .228, y: .177, width: .167, height: .493 }],
  ['center', { x: .417, y: .180, width: .173, height: .490 }],
  ['right', { x: .612, y: .177, width: .169, height: .490 }],
]

for (const [name, card] of cards) {
  const title = {
    x: card.x + card.width * .10,
    y: card.y + card.height * .39,
    width: card.width * .80,
    height: card.height * .17,
  }
  await sharp(source)
    .extract({
      left: Math.round(title.x * metadata.width),
      top: Math.round(title.y * metadata.height),
      width: Math.round(title.width * metadata.width),
      height: Math.round(title.height * metadata.height),
    })
    .png()
    .toFile(path.join(outputDirectory, `4k-${name}.png`))
}

console.log(`Extracted three title-only OCR fixtures to ${outputDirectory}`)
