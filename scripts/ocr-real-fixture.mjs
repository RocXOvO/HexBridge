import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ort from 'onnxruntime-node'
import { PaddleOcrService } from 'paddleocr'
import sharp from 'sharp'

const directory = path.resolve('resources', 'paddleocr')
const toArrayBuffer = (buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
const [detection, recognition, dictionary] = await Promise.all([
  readFile(path.join(directory, 'PP-OCRv6_small_det_infer.onnx')),
  readFile(path.join(directory, 'PP-OCRv6_small_rec_infer.onnx')),
  readFile(path.join(directory, 'ppocrv6_dict.txt'), 'utf8'),
])
const service = await PaddleOcrService.createInstance({
  ort,
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
for (const [slot, title] of expected) {
  const { data, info } = await sharp(path.resolve('tests', 'fixtures', 'ocr', `4k-${slot}.png`))
    .resize({ height: 180, fit: 'inside' })
    .sharpen()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const results = await service.recognize({
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  })
  const text = service.processRecognition(results).text
  if (!String(text).split(/\r?\n/).includes(title)) {
    throw new Error(`Real 4K ${slot} title OCR regressed: ${JSON.stringify(text)}`)
  }
  observed.push(`${slot}:${title}`)
}
console.log(`Real 4K OCR fixture passed (${observed.join(', ')})`)
