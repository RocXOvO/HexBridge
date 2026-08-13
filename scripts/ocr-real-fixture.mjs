import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ort from 'onnxruntime-node'
import { PaddleOcrService } from 'paddleocr'
import sharp from 'sharp'
import {
  createBoundedOrt,
  OCR_DETECTION_OPTIONS,
} from '../src/main/ocr/ort-bounded.mjs'

const directory = path.resolve('resources', 'paddleocr')
const toArrayBuffer = (buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
const [detection, recognition, dictionary] = await Promise.all([
  readFile(path.join(directory, 'PP-OCRv6_small_det_infer.onnx')),
  readFile(path.join(directory, 'PP-OCRv6_small_rec_infer.onnx')),
  readFile(path.join(directory, 'ppocrv6_dict.txt'), 'utf8'),
])
const service = await PaddleOcrService.createInstance({
  ort: createBoundedOrt(ort),
  modelPreset: 'PP-OCRv6_small',
  detection: { modelBuffer: toArrayBuffer(detection) },
  recognition: {
    modelBuffer: toArrayBuffer(recognition),
    charactersDictionary: [...dictionary.trimEnd().split(/\r?\n/), ' '],
  },
})

const expected = [
  ['left', '由心及物'],
  ['center', '冰寒'],
  ['right', '虹吸'],
]
const observed = []
const startedAt = performance.now()
for (const [slot, title] of expected) {
  const fixture = sharp(path.resolve('tests', 'fixtures', 'ocr', `4k-${slot}.png`))
  const metadata = await fixture.metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Invalid ${slot} OCR fixture`)
  // Reproduce the production 3840px desktop -> 1440px thumbnail reduction
  // before the title crop is normalized to the 180px OCR input height.
  const reducedWidth = Math.max(1, Math.round(metadata.width * 1_440 / 3_840))
  const reducedHeight = Math.max(1, Math.round(metadata.height * 1_440 / 3_840))
  const { data, info } = await fixture
    .resize(reducedWidth, reducedHeight, { fit: 'fill' })
    .resize({ height: 180, fit: 'inside' })
    .sharpen()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const results = await service.recognize({
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  }, {
    detection: OCR_DETECTION_OPTIONS,
  })
  const text = service.processRecognition(results).text
  if (!String(text).split(/\r?\n/).includes(title)) {
    throw new Error(`Real 4K ${slot} title OCR regressed: ${JSON.stringify(text)}`)
  }
  observed.push(`${slot}:${title}`)
}
console.log(`Real 4K OCR fixture passed in ${Math.round(performance.now() - startedAt)}ms (${observed.join(', ')})`)
