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
import { normalizedRectToPixels } from '../../shared/ocr-geometry.js'
import { logger } from '../logger.js'
import { OcrEngine } from './ocr-engine.js'

const DEFAULT_RECTS: CalibrationRects = {
  left: { x: 0.165, y: 0.255, width: 0.205, height: 0.082 },
  center: { x: 0.3975, y: 0.255, width: 0.205, height: 0.082 },
  right: { x: 0.63, y: 0.255, width: 0.205, height: 0.082 },
}

const SLOTS: AugmentSlot[] = ['left', 'center', 'right']
const MAX_DIAGNOSTIC_FILES = 60

export interface ScanResult {
  status: 'matched' | 'not-detected' | 'unreliable' | 'busy' | 'error'
  slots: OcrSlotResult[]
  durationMs: number
  error: string | null
}

export class AugmentScanner {
  readonly engine = new OcrEngine()
  private busy = false
  private lastDurationMs: number | null = null
  private lastError: string | null = null

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly diagnosticsDirectory: string,
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
      const physicalWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor))
      const physicalHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor))
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: physicalWidth, height: physicalHeight },
        fetchWindowIcons: false,
      })
      const source =
        sources.find((candidate) => candidate.display_id === String(display.id)) ??
        (sources.length === 1 ? sources[0] : undefined)
      if (!source || source.thumbnail.isEmpty()) throw new Error('无法捕获目标显示器')

      const screenshot = source.thumbnail.toPNG()
      const metadata = await sharp(screenshot).metadata()
      const width = metadata.width ?? physicalWidth
      const height = metadata.height ?? physicalHeight
      const rects = settings.calibration ?? DEFAULT_RECTS
      const crops: Buffer[] = []
      for (const slot of SLOTS) {
        const rect = rects[slot]
        const pixelRect = normalizedRectToPixels(rect, width, height)
        const crop = await sharp(screenshot)
          .extract(pixelRect)
          .sharpen()
          .png()
          .toBuffer()
        crops.push(crop)
      }

      if (settings.diagnosticsScreenshots && manual) {
        try {
          await this.saveDiagnosticCrops(crops)
        } catch (error) {
          logger.warn('Unable to save OCR diagnostic crops', error instanceof Error ? error.message : error)
        }
      }

      const gates = await Promise.all(crops.map((crop) => this.hasInterfaceSignal(crop)))
      if (gates.filter(Boolean).length < 2) {
        return this.finish('not-detected', [], startedAt, null)
      }

      const recognized: OcrSlotResult[] = []
      for (let index = 0; index < crops.length; index += 1) {
        const rawText = await this.engine.recognize(crops[index] as Buffer)
        recognized.push(matchAugmentText(SLOTS[index] as AugmentSlot, rawText, augments, 0.9))
      }

      const allReliable = recognized.length === 3 && recognized.every((slot) => slot.augmentId != null)
      return this.finish(allReliable ? 'matched' : 'unreliable', recognized, startedAt, null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('OCR scan failed', message)
      return this.finish('error', [], startedAt, message)
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
    const displays = screen.getAllDisplays()
    return displays.find((display) => String(display.id) === displayId) ?? screen.getPrimaryDisplay()
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

export const augmentScannerDefaults = { rects: DEFAULT_RECTS }
