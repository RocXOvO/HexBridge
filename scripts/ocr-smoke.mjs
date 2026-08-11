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

const svg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="120">
    <rect width="640" height="120" fill="white" />
    <text x="24" y="78" font-family="Arial, sans-serif" font-size="52" fill="black">HEXBRIDGE OCR</text>
  </svg>
`)
const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const results = await service.recognize({
  width: info.width,
  height: info.height,
  data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
})
const text = service.processRecognition(results).text
console.log(`PaddleOCR smoke test passed${text ? `: ${text}` : ''}`)
