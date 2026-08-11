import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const models = [
  {
    name: 'PP-OCRv6_small_det_infer.onnx',
    source: 'https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/28fe5895c24fd108c19eb3e8479f4ab385fbfc62/inference.onnx',
    bytes: 9_880_512,
    sha256: 'd73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e',
  },
  {
    name: 'PP-OCRv6_small_rec_infer.onnx',
    source: 'https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/b8f84f0b80c529de40b4fbb3544b84fa7233a513/inference.onnx',
    bytes: 21_159_378,
    sha256: '5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634',
  },
  {
    name: 'ppocrv6_dict.txt',
    source: 'https://huggingface.co/x3zvawq/paddleocr-js-onnx/resolve/51c2133b5a7ea27b795fa8c400fdbfbd5337dd6a/ppocr_v6_small/ppocrv6_dict.txt',
    bytes: 74_947,
    sha256: 'b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d',
  },
]
const targetDirectory = path.resolve('resources', 'paddleocr')

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')

await mkdir(targetDirectory, { recursive: true })

for (const { name, source, bytes, sha256 } of models) {
  const destination = path.join(targetDirectory, name)
  try {
    await access(destination)
    const existing = await stat(destination)
    const existingDigest = existing.size === bytes ? digest(await readFile(destination)) : ''
    if (existingDigest === sha256) {
      console.log(`OCR model present: ${name}`)
      continue
    }
    console.warn(`OCR model failed integrity check and will be replaced: ${name}`)
  } catch {
    // Download below.
  }

  const temporary = `${destination}.download`
  console.log(`Downloading OCR model: ${name}`)
  const response = await fetch(`${source}?download=true`, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Failed to download ${name}: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length !== bytes) throw new Error(`Downloaded ${name} has an unexpected size`)
  if (digest(buffer) !== sha256) throw new Error(`Downloaded ${name} failed SHA-256 verification`)
  await writeFile(temporary, buffer)
  try {
    await unlink(destination)
  } catch {
    // A new install has no old file.
  }
  await rename(temporary, destination)
}

console.log(`PaddleOCR assets ready in ${targetDirectory}`)
