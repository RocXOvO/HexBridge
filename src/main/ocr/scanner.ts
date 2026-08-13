import { desktopCapturer, screen } from 'electron'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type {
  AppSettings,
  AugmentMeta,
  AugmentSlot,
  CalibrationRects,
  OcrSlotResult,
} from '../../shared/contracts.js'
import { matchAugmentText } from '../../shared/ocr-match.js'
import { normalizedRectToPixels, titleRectForCalibration } from '../../shared/ocr-geometry.js'
import { logger } from '../logger.js'
import { OcrEngine } from './ocr-engine.js'

const DEFAULT_RECTS: CalibrationRects = {
  left: { x: 0.245, y: 0.37, width: 0.134, height: 0.085 },
  center: { x: 0.436, y: 0.37, width: 0.137, height: 0.085 },
  right: { x: 0.629, y: 0.37, width: 0.136, height: 0.085 },
}

const SLOTS: AugmentSlot[] = ['left', 'center', 'right']
const MAX_DIAGNOSTIC_FILES = 60
const AUTO_GATE_WIDTH = 960
const OCR_CAPTURE_WIDTH = 1_920

export interface ScanResult {
  status: 'matched' | 'not-detected' | 'unreliable' | 'busy' | 'error'
  slots: OcrSlotResult[]
  durationMs: number
  error: string | null
}

export interface AugmentScannerDependencies {
  resolveDisplay?(displayId: string): Electron.Display
  captureDisplay?(display: Electron.Display, maximumWidth: number): Promise<Buffer>
}

export class AugmentScanner {
  readonly engine = new OcrEngine()
  private busy = false
  private lastDurationMs: number | null = null
  private lastError: string | null = null

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly diagnosticsDirectory: string,
    private readonly dependencies: AugmentScannerDependencies = {},
  ) {}

  getDiagnostics(): {
    ready: boolean
    busy: boolean
    lastDurationMs: number | null
    lastError: string | null
  } {
    return {
      ready: this.engine.ready,
      busy: this.busy,
      lastDurationMs: this.lastDurationMs,
      lastError: this.lastError ?? this.engine.lastError,
    }
  }

  async warmup(): Promise<void> {
    try {
      await this.engine.initialize()
    } catch {
      // Diagnostics exposes missing models; the app remains usable without OCR.
    }
  }

  async clearDiagnostics(): Promise<number> {
    try {
      const names = (await readdir(this.diagnosticsDirectory)).filter((name) => name.endsWith('.png'))
      await Promise.all(names.map((name) => unlink(path.join(this.diagnosticsDirectory, name))))
      return names.length
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code === 'ENOENT') return 0
      throw error
    }
  }

  async scan(augments: AugmentMeta[], manual = false): Promise<ScanResult> {
    if (this.busy) return { status: 'busy', slots: [], durationMs: 0, error: null }
    this.busy = true
    const startedAt = Date.now()
    try {
      const settings = this.getSettings()
      const display = this.resolveDisplay(settings.displayId)
      const rects = settings.calibration ?? DEFAULT_RECTS

      // Automatic polling only captures a small thumbnail first. A 4K OCR
      // frame is requested only after at least two title slots look active.
      if (!manual) {
        const gateScreenshot = await this.captureDisplay(display, AUTO_GATE_WIDTH)
        const gateCrops = await this.cropTitles(gateScreenshot, rects, false)
        const gates = await Promise.all(gateCrops.map((crop) => this.hasInterfaceSignal(crop)))
        if (gates.filter(Boolean).length < 2) {
          return this.finish('not-detected', [], startedAt, null)
        }
      }

      const screenshot = await this.captureDisplay(display, OCR_CAPTURE_WIDTH)
      const crops = await this.cropTitles(screenshot, rects, true)

      if (settings.diagnosticsScreenshots && manual) {
        try {
          await this.saveDiagnosticCrops(crops)
        } catch (error) {
          logger.warn('Unable to save OCR diagnostic crops', {
            errorName: error instanceof Error ? error.name : 'Error',
          })
        }
      }

      if (manual) {
        const gates = await Promise.all(crops.map((crop) => this.hasInterfaceSignal(crop)))
        if (gates.filter(Boolean).length < 2) {
          return this.finish('not-detected', [], startedAt, null)
        }
      }

      const recognized: OcrSlotResult[] = []
      for (let index = 0; index < crops.length; index += 1) {
        const rawText = await this.engine.recognize(crops[index] as Buffer)
        recognized.push(matchAugmentText(SLOTS[index] as AugmentSlot, rawText, augments, 0.9))
      }

      const allReliable = recognized.length === 3 && recognized.every((slot) => slot.augmentId != null)
      return this.finish(allReliable ? 'matched' : 'unreliable', recognized, startedAt, null)
    } catch (error) {
      const message = 'OCR 截图或识别失败'
      logger.warn('OCR scan failed', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return this.finish('error', [], startedAt, message)
    } finally {
      this.busy = false
    }
  }

  async previewCalibration(
    backgroundDataUrl: string,
    rects: CalibrationRects,
    augments: AugmentMeta[],
  ): Promise<{ ok: boolean; names: string[]; message: string }> {
    if (this.busy) return { ok: false, names: [], message: '识别任务正在运行，请稍后重试' }
    this.busy = true
    try {
      const encoded = backgroundDataUrl.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/)?.[1]
      if (!encoded) return { ok: false, names: [], message: '校准截图格式无效，请重新打开校准' }
      const crops = await this.cropTitles(Buffer.from(encoded, 'base64'), rects, true)
      const recognized: OcrSlotResult[] = []
      for (let index = 0; index < crops.length; index += 1) {
        const rawText = await this.engine.recognize(crops[index] as Buffer)
        recognized.push(matchAugmentText(SLOTS[index] as AugmentSlot, rawText, augments, 0.9))
      }
      const names = recognized.map((slot) => slot.augmentId == null ? '' : slot.name)
      const count = names.filter(Boolean).length
      return {
        ok: count === 3,
        names,
        message: count === 3
          ? `识别验证通过：${names.join(' / ')}`
          : `仅识别 ${count}/3 张标题，请重新框住完整卡片`,
      }
    } catch {
      return { ok: false, names: [], message: '校准识别验证失败，请重新框选或稍后重试' }
    } finally {
      this.busy = false
    }
  }

  private finish(
    status: ScanResult['status'],
    slots: OcrSlotResult[],
    startedAt: number,
    error: string | null,
  ): ScanResult {
    const durationMs = Date.now() - startedAt
    this.lastDurationMs = durationMs
    this.lastError = error
    return { status, slots, durationMs, error }
  }

  private resolveDisplay(displayId: string): Electron.Display {
    if (this.dependencies.resolveDisplay) return this.dependencies.resolveDisplay(displayId)
    const displays = screen.getAllDisplays()
    return displays.find((display) => String(display.id) === displayId) ?? screen.getPrimaryDisplay()
  }

  private async captureDisplay(display: Electron.Display, maximumWidth: number): Promise<Buffer> {
    if (this.dependencies.captureDisplay) return this.dependencies.captureDisplay(display, maximumWidth)
    const physicalWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor))
    const physicalHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor))
    const width = Math.min(maximumWidth, physicalWidth)
    const height = Math.max(1, Math.round(width * physicalHeight / physicalWidth))
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    })
    const source =
      sources.find((candidate) => candidate.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined)
    if (!source || source.thumbnail.isEmpty()) throw new Error('无法捕获目标显示器')
    return source.thumbnail.toPNG()
  }

  private async cropTitles(
    screenshot: Buffer,
    rects: CalibrationRects,
    prepareForOcr: boolean,
  ): Promise<Buffer[]> {
    const metadata = await sharp(screenshot).metadata()
    if (!metadata.width || !metadata.height) throw new Error('目标显示器截图尺寸无效')
    const image = sharp(screenshot)
    return Promise.all(SLOTS.map(async (slot) => {
      const titleRect = titleRectForCalibration(rects[slot])
      const pixelRect = normalizedRectToPixels(titleRect, metadata.width as number, metadata.height as number)
      let crop = image.clone().extract(pixelRect)
      if (prepareForOcr) {
        crop = crop.resize({ height: 180, fit: 'inside', withoutEnlargement: false }).sharpen()
      }
      return crop.png().toBuffer()
    }))
  }

  private async hasInterfaceSignal(crop: Buffer): Promise<boolean> {
    const { data } = await sharp(crop).grayscale().resize(64, 24, { fit: 'fill' }).raw().toBuffer({
      resolveWithObject: true,
    })
    if (!data.length) return false
    let sum = 0
    let squared = 0
    for (const value of data) {
      sum += value
      squared += value * value
    }
    const mean = sum / data.length
    const standardDeviation = Math.sqrt(Math.max(0, squared / data.length - mean * mean))
    return standardDeviation >= 14 && mean >= 18
  }

  private async saveDiagnosticCrops(crops: Buffer[]): Promise<void> {
    await mkdir(this.diagnosticsDirectory, { recursive: true })
    const existing = (await readdir(this.diagnosticsDirectory))
      .filter((name) => name.endsWith('.png'))
      .sort()
    const removeCount = Math.max(0, existing.length + crops.length - MAX_DIAGNOSTIC_FILES)
    await Promise.all(
      existing.slice(0, removeCount).map((name) => unlink(path.join(this.diagnosticsDirectory, name))),
    )
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await Promise.all(
      crops.map((crop, index) =>
        writeFile(path.join(this.diagnosticsDirectory, `${stamp}-${SLOTS[index]}.png`), crop),
      ),
    )
  }
}

export const augmentScannerDefaults = {
  rects: DEFAULT_RECTS,
  automaticGateWidth: AUTO_GATE_WIDTH,
  ocrCaptureWidth: OCR_CAPTURE_WIDTH,
}
