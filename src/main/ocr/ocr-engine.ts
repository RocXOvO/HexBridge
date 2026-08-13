import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'
import { logger } from '../logger.js'
import {
  createBoundedOrt,
  OCR_DETECTION_OPTIONS,
} from './ort-bounded.mjs'

const MODEL_FILES = {
  detection: 'PP-OCRv6_small_det_infer.onnx',
  recognition: 'PP-OCRv6_small_rec_infer.onnx',
  dictionary: 'ppocrv6_dict.txt',
}

export { createBoundedOrt, OCR_DETECTION_OPTIONS, OCR_SESSION_OPTIONS } from './ort-bounded.mjs'

export const OCR_INITIALIZATION_RETRY_MS = 60_000

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

export class OcrEngine {
  private service: any = null
  private loading: Promise<void> | null = null
  private error: string | null = null
  private initializationState: 'uninitialized' | 'loading' | 'ready' | 'failed' = 'uninitialized'
  private nextRetryAt = 0

  get ready(): boolean {
    return Boolean(this.service)
  }

  get lastError(): string | null {
    return this.error
  }

  private modelDirectory(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'paddleocr')
      : path.resolve(process.cwd(), 'resources', 'paddleocr')
  }

  async initialize(forceRetry = false): Promise<void> {
    if (this.service) return
    if (this.loading) return this.loading
    if (!forceRetry && this.initializationState === 'failed' && Date.now() < this.nextRetryAt) {
      throw new Error('OCR model initialization is cooling down')
    }
    this.initializationState = 'loading'
    this.loading = this.load()
    try {
      await this.loading
      this.initializationState = 'ready'
      this.nextRetryAt = 0
    } catch (error) {
      this.initializationState = 'failed'
      this.nextRetryAt = Date.now() + OCR_INITIALIZATION_RETRY_MS
      throw error
    } finally {
      this.loading = null
    }
  }

  private async load(): Promise<void> {
    try {
      const directory = this.modelDirectory()
      const [detection, recognition, dictionary, paddle, ort] = await Promise.all([
        readFile(path.join(directory, MODEL_FILES.detection)),
        readFile(path.join(directory, MODEL_FILES.recognition)),
        readFile(path.join(directory, MODEL_FILES.dictionary), 'utf8'),
        import('paddleocr'),
        import('onnxruntime-node'),
      ])
      const PaddleOcrService = (paddle as any).PaddleOcrService
      if (!PaddleOcrService) throw new Error('PaddleOCR 模块缺少 PaddleOcrService')
      this.service = await PaddleOcrService.createInstance({
        ort: createBoundedOrt(ort),
        modelPreset: 'PP-OCRv6_small',
        detection: { modelBuffer: toArrayBuffer(detection) },
        recognition: {
          modelBuffer: toArrayBuffer(recognition),
          charactersDictionary: [...dictionary.trimEnd().split(/\r?\n/), ' '],
        },
      })
      this.error = null
      logger.info('OCR models loaded')
    } catch (error) {
      this.service = null
      this.error = 'OCR 模型加载失败'
      logger.warn('OCR models unavailable', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      throw error
    }
  }

  async recognize(png: Buffer): Promise<string> {
    await this.initialize()
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const results = await this.service.recognize({
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    }, { detection: OCR_DETECTION_OPTIONS })
    const processed = this.service.processRecognition(results)
    if (typeof processed === 'string') return processed.trim()
    if (typeof processed?.text === 'string') return processed.text.trim()
    if (Array.isArray(results)) {
      return results
        .map((result: any) => result?.text ?? result?.recText ?? '')
        .filter(Boolean)
        .join(' ')
        .trim()
    }
    return ''
  }
}
