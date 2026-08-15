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
const OCR_METRIC_WINDOW = 16
const AUTO_GATE_WIDTH = 960
const OCR_CAPTURE_WIDTH = 1_440

export interface ScanResult {
  status: 'matched' | 'not-detected' | 'unreliable' | 'busy' | 'error'
  slots: OcrSlotResult[]
  fingerprints: string[]
  durationMs: number
  error: string | null
}

export interface InterfaceProbeResult {
  status: 'detected' | 'not-detected' | 'busy' | 'error'
  durationMs: number
  fingerprints: string[]
}

export interface AugmentScannerDependencies {
  resolveDisplay?(displayId: string): Electron.Display
  captureDisplay?(display: Electron.Display, maximumWidth: number): Promise<Buffer>
}

interface CapturedTitleCrops {
  ocr: Buffer[]
  probe: Buffer[]
}

export async function analyzeAugmentTitleCrop(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> {
  const { data } = await sharp(crop).grayscale().resize(32, 12, { fit: 'fill' }).raw().toBuffer({
    resolveWithObject: true,
  })
  if (!data.length) return { detected: false, fingerprint: '' }
  let sum = 0
  let squared = 0
  for (const value of data) {
    sum += value
    squared += value * value
  }
  const mean = sum / data.length
  const standardDeviation = Math.sqrt(Math.max(0, squared / data.length - mean * mean))
  let fingerprint = ''
  for (let y = 0; y < 12; y += 2) {
    for (let x = 0; x < 32; x += 2) {
      let block = 0
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) block += data[(y + dy) * 32 + x + dx] ?? 0
      }
      fingerprint += Math.round((block / 4) / 17).toString(16)
    }
  }
  return {
    detected: standardDeviation >= 14 && mean >= 18,
    fingerprint,
  }
}

export class AugmentScanner {
  readonly engine = new OcrEngine()
  private busy = false
  private readonly idleWaiters = new Set<() => void>()
  private lastDurationMs: number | null = null
  private lastError: string | null = null
  private cheapProbeCount = 0
  private cheapProbeLastDurationMs: number | null = null
  private cheapProbeDurations: number[] = []
  private fullOcrCount = 0
  private fullOcrLastDurationMs: number | null = null
  private fullOcrDurations: number[] = []
  private performanceEpoch = 0

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
    cheapProbeCount: number
    cheapProbeLastDurationMs: number | null
    cheapProbeMaxDurationMs: number | null
    fullOcrCount: number
    fullOcrLastDurationMs: number | null
    fullOcrMaxDurationMs: number | null
  } {
    return {
      ready: this.engine.ready,
      busy: this.busy,
      lastDurationMs: this.lastDurationMs,
      lastError: this.lastError ?? this.engine.lastError,
      cheapProbeCount: this.cheapProbeCount,
      cheapProbeLastDurationMs: this.cheapProbeLastDurationMs,
      cheapProbeMaxDurationMs: this.maxDuration(this.cheapProbeDurations),
      fullOcrCount: this.fullOcrCount,
      fullOcrLastDurationMs: this.fullOcrLastDurationMs,
      fullOcrMaxDurationMs: this.maxDuration(this.fullOcrDurations),
    }
  }

  resetPerformanceDiagnostics(): void {
    this.performanceEpoch += 1
    this.lastDurationMs = null
    this.lastError = null
    this.cheapProbeCount = 0
    this.cheapProbeLastDurationMs = null
    this.cheapProbeDurations = []
    this.fullOcrCount = 0
    this.fullOcrLastDurationMs = null
    this.fullOcrDurations = []
  }

  async warmup(): Promise<void> {
    try {
      await this.engine.initialize()
    } catch {
      // Diagnostics exposes missing models; the app remains usable without OCR.
    }
  }

  async waitUntilIdle(timeoutMs = 1_500): Promise<boolean> {
    if (!this.busy) return true
    return new Promise((resolve) => {
      let settled = false
      const settle = (idle: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.idleWaiters.delete(onIdle)
        resolve(idle)
      }
      const onIdle = (): void => settle(true)
      const timeout = setTimeout(() => settle(false), timeoutMs)
      this.idleWaiters.add(onIdle)
    })
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

  async scan(
    augments: AugmentMeta[],
    manual = false,
    afterCapture?: () => void,
    interfaceAlreadyDetected = false,
  ): Promise<ScanResult> {
    if (this.busy) return { status: 'busy', slots: [], fingerprints: [], durationMs: 0, error: null }
    this.busy = true
    const performanceEpoch = this.performanceEpoch
    const startedAt = Date.now()
    try {
      const settings = this.getSettings()
      const display = this.resolveDisplay(settings.displayId)
      const rects = settings.calibration ?? DEFAULT_RECTS

      // Automatic polling only captures a small thumbnail first. A 4K OCR
      // frame is requested only after at least two title slots look active.
      if (!manual && !interfaceAlreadyDetected) {
        const gateCrops = await this.captureTitleCrops(display, AUTO_GATE_WIDTH, rects, false)
        const gates = await Promise.all(gateCrops.probe.map((crop) => this.analyzeInterfaceSignal(crop)))
        if (gates.filter((analysis) => analysis.detected).length < 2) {
          return this.finish('not-detected', [], [], startedAt, null)
        }
      }

      const captured = await this.captureTitleCrops(display, OCR_CAPTURE_WIDTH, rects, true, afterCapture)
      const analyses = await Promise.all(captured.probe.map((crop) => this.analyzeInterfaceSignal(crop)))

      if (manual) await this.engine.initialize(true)

      if (settings.diagnosticsScreenshots && manual) {
        try {
          await this.saveDiagnosticCrops(captured.ocr)
        } catch (error) {
          logger.warn('Unable to save OCR diagnostic crops', {
            errorName: error instanceof Error ? error.name : 'Error',
          })
        }
      }

      if (manual) {
        if (analyses.filter((analysis) => analysis.detected).length < 2) {
          return this.finish('not-detected', [], [], startedAt, null)
        }
      }

      const recognized: OcrSlotResult[] = []
      const fullOcrStartedAt = Date.now()
      try {
        for (let index = 0; index < captured.ocr.length; index += 1) {
          const rawText = await this.engine.recognize(captured.ocr[index] as Buffer)
          recognized.push(matchAugmentText(SLOTS[index] as AugmentSlot, rawText, augments, 0.9))
        }
      } finally {
        this.recordFullOcrDuration(Date.now() - fullOcrStartedAt, performanceEpoch)
      }

      const allReliable = recognized.length === 3 && recognized.every((slot) => slot.augmentId != null)
      const fingerprints = allReliable
        ? analyses.map((analysis) => analysis.fingerprint)
        : []
      return this.finish(allReliable ? 'matched' : 'unreliable', recognized, fingerprints, startedAt, null)
    } catch (error) {
      const message = 'OCR 截图或识别失败'
      logger.warn('OCR scan failed', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return this.finish('error', [], [], startedAt, message)
    } finally {
      this.releaseIdleWaiters()
    }
  }

  async probeInterface(): Promise<InterfaceProbeResult> {
    if (this.busy) return { status: 'busy', durationMs: 0, fingerprints: [] }
    this.busy = true
    const performanceEpoch = this.performanceEpoch
    const startedAt = Date.now()
    try {
      const settings = this.getSettings()
      const display = this.resolveDisplay(settings.displayId)
      const rects = settings.calibration ?? DEFAULT_RECTS
      const gateCrops = await this.captureTitleCrops(display, AUTO_GATE_WIDTH, rects, false)
      const analyses = await Promise.all(gateCrops.probe.map((crop) => this.analyzeInterfaceSignal(crop)))
      return {
        status: analyses.filter((item) => item.detected).length >= 2 ? 'detected' : 'not-detected',
        durationMs: Date.now() - startedAt,
        fingerprints: analyses.map((item) => item.fingerprint),
      }
    } catch (error) {
      logger.warn('OCR interface probe failed', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return { status: 'error', durationMs: Date.now() - startedAt, fingerprints: [] }
    } finally {
      this.recordCheapProbeDuration(Date.now() - startedAt, performanceEpoch)
      this.releaseIdleWaiters()
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
      await this.engine.initialize(true)
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
      this.releaseIdleWaiters()
    }
  }

  private finish(
    status: ScanResult['status'],
    slots: OcrSlotResult[],
    fingerprints: string[],
    startedAt: number,
    error: string | null,
  ): ScanResult {
    const durationMs = Date.now() - startedAt
    this.lastDurationMs = durationMs
    this.lastError = error
    return { status, slots, fingerprints, durationMs, error }
  }

  private releaseIdleWaiters(): void {
    this.busy = false
    const waiters = [...this.idleWaiters]
    this.idleWaiters.clear()
    for (const resolve of waiters) resolve()
  }

  private recordCheapProbeDuration(durationMs: number, performanceEpoch: number): void {
    if (performanceEpoch !== this.performanceEpoch) return
    this.cheapProbeCount += 1
    this.cheapProbeLastDurationMs = Math.max(0, durationMs)
    this.cheapProbeDurations = this.appendMetric(this.cheapProbeDurations, this.cheapProbeLastDurationMs)
  }

  private recordFullOcrDuration(durationMs: number, performanceEpoch: number): void {
    if (performanceEpoch !== this.performanceEpoch) return
    this.fullOcrCount += 1
    this.fullOcrLastDurationMs = Math.max(0, durationMs)
    this.fullOcrDurations = this.appendMetric(this.fullOcrDurations, this.fullOcrLastDurationMs)
  }

  private appendMetric(values: number[], value: number): number[] {
    const next = [...values, value]
    return next.length > OCR_METRIC_WINDOW ? next.slice(-OCR_METRIC_WINDOW) : next
  }

  private maxDuration(values: number[]): number | null {
    return values.length ? Math.max(...values) : null
  }

  private resolveDisplay(displayId: string): Electron.Display {
    if (this.dependencies.resolveDisplay) return this.dependencies.resolveDisplay(displayId)
    const displays = screen.getAllDisplays()
    return displays.find((display) => String(display.id) === displayId) ?? screen.getPrimaryDisplay()
  }

  private async captureTitleCrops(
    display: Electron.Display,
    maximumWidth: number,
    rects: CalibrationRects,
    prepareForOcr: boolean,
    afterCapture?: () => void,
  ): Promise<CapturedTitleCrops> {
    if (this.dependencies.captureDisplay) {
      const screenshot = await this.dependencies.captureDisplay(display, maximumWidth)
      afterCapture?.()
      const probe = await this.cropTitles(screenshot, rects, false)
      return {
        probe,
        ocr: prepareForOcr ? await this.prepareTitleCrops(probe) : probe,
      }
    }
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
    const croppedImages = cropNativeImageTitles(source.thumbnail, rects)
    afterCapture?.()
    const probe = croppedImages.map((crop) => crop.toPNG())
    return {
      probe,
      ocr: prepareForOcr ? await this.prepareTitleCrops(probe) : probe,
    }
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

  private prepareTitleCrops(crops: Buffer[]): Promise<Buffer[]> {
    return Promise.all(crops.map((crop) => sharp(crop)
      .resize({ height: 180, fit: 'inside', withoutEnlargement: false })
      .sharpen()
      .png()
      .toBuffer()))
  }

  private analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> {
    return analyzeAugmentTitleCrop(crop)
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

export function cropNativeImageTitles(
  thumbnail: Electron.NativeImage,
  rects: CalibrationRects,
): Electron.NativeImage[] {
  const size = thumbnail.getSize()
  return SLOTS.map((slot) => {
    const titleRect = titleRectForCalibration(rects[slot])
    const pixelRect = normalizedRectToPixels(titleRect, size.width, size.height)
    return thumbnail.crop({
      x: pixelRect.left,
      y: pixelRect.top,
      width: pixelRect.width,
      height: pixelRect.height,
    })
  })
}

export const augmentScannerDefaults = {
  rects: DEFAULT_RECTS,
  automaticGateWidth: AUTO_GATE_WIDTH,
  ocrCaptureWidth: OCR_CAPTURE_WIDTH,
}
