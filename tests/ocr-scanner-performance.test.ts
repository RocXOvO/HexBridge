import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { AppSettings, AugmentMeta } from '../src/shared/contracts.js'

vi.mock('electron', () => ({ desktopCapturer: {}, screen: {} }))
vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

import { AugmentScanner, augmentScannerDefaults } from '../src/main/ocr/scanner.js'
import { fingerprintDistance } from '../src/main/runtime-guards.js'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const settings = (): AppSettings => ({
  visualMode: 'auto',
  autoOcr: false,
  showChampionPanel: true,
  showInGameRecommendations: true,
  opponentScouting: false,
  lobbyBackground: false,
  wallpaperEngineEnabled: false,
  recommendationDataSource: 'dtodo',
  hotkey: 'F8',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
})

const augments: AugmentMeta[] = [
  { id: 1, name: '由心及物', iconUrl: '', rarity: 1, rarityName: '', description: '', globalTier: 1 },
  { id: 2, name: '冰寒', iconUrl: '', rarity: 1, rarityName: '', description: '', globalTier: 1 },
  { id: 3, name: '虹吸', iconUrl: '', rarity: 1, rarityName: '', description: '', globalTier: 1 },
]

async function scannerFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-scanner-'))
  temporaryDirectories.push(directory)
  const widths: number[] = []
  const image = await sharp({ create: { width: 960, height: 540, channels: 3, background: '#24463f' } })
    .png()
    .toBuffer()
  const scanner = new AugmentScanner(settings, directory, {
    resolveDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 }, scaleFactor: 1 } as Electron.Display),
    captureDisplay: async (_display, maximumWidth) => { widths.push(maximumWidth); return image },
  })
  vi.spyOn(scanner.engine, 'recognize')
    .mockResolvedValueOnce('由心及物\n复原力')
    .mockResolvedValueOnce('冰寒\n功能')
    .mockResolvedValueOnce('虹吸\n复原力')
  vi.spyOn(scanner.engine, 'initialize').mockResolvedValue()
  return { scanner, widths }
}

describe('low-cost OCR capture plan', () => {
  it('does not request an OCR frame when the automatic thumbnail gate misses', async () => {
    const { scanner, widths } = await scannerFixture()
    vi.spyOn(scanner as unknown as { analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> }, 'analyzeInterfaceSignal')
      .mockResolvedValue({ detected: false, fingerprint: '0000' })
    expect((await scanner.scan(augments, false)).status).toBe('not-detected')
    expect(widths).toEqual([augmentScannerDefaults.automaticGateWidth])
  })

  it('uses one bounded thumbnail and one bounded OCR frame after an automatic hit', async () => {
    const { scanner, widths } = await scannerFixture()
    vi.spyOn(scanner as unknown as { analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> }, 'analyzeInterfaceSignal')
      .mockResolvedValue({ detected: true, fingerprint: '1111' })
    expect((await scanner.scan(augments, false)).status).toBe('matched')
    expect(widths).toEqual([
      augmentScannerDefaults.automaticGateWidth,
      augmentScannerDefaults.ocrCaptureWidth,
    ])
  })

  it('manual recognition skips polling and captures only one bounded OCR frame', async () => {
    const { scanner, widths } = await scannerFixture()
    vi.spyOn(scanner as unknown as { analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> }, 'analyzeInterfaceSignal')
      .mockResolvedValue({ detected: true, fingerprint: '1111' })
    const result = await scanner.scan(augments, true)
    expect(result.status).toBe('matched')
    expect(result.fingerprints).toHaveLength(3)
    expect(result.fingerprints.every((fingerprint) => fingerprint.length > 0)).toBe(true)
    expect(widths).toEqual([augmentScannerDefaults.ocrCaptureWidth])
    expect(augmentScannerDefaults.ocrCaptureWidth).toBe(1_440)
  })

  it('keeps manual and cheap-probe fingerprints aligned through the full 4K capture path', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-scanner-scale-'))
    temporaryDirectories.push(directory)
    const rects = [
      { x: .245, y: .37, width: .134, height: .085, name: '4k-left.png' },
      { x: .436, y: .37, width: .137, height: .085, name: '4k-center.png' },
      { x: .629, y: .37, width: .136, height: .085, name: '4k-right.png' },
    ]
    const composites = await Promise.all(rects.map(async (rect) => ({
      input: await sharp(await readFile(new URL(`./fixtures/ocr/${rect.name}`, import.meta.url)))
        .resize({ width: Math.round(rect.width * 3_840), height: Math.round(rect.height * 2_160), fit: 'fill' })
        .png()
        .toBuffer(),
      left: Math.round(rect.x * 3_840),
      top: Math.round(rect.y * 2_160),
    })))
    const fullFrame = await sharp({
      create: { width: 3_840, height: 2_160, channels: 3, background: '#10151b' },
    }).composite(composites).png().toBuffer()
    const widths: number[] = []
    const scanner = new AugmentScanner(settings, directory, {
      resolveDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 3_840, height: 2_160 }, scaleFactor: 1 } as Electron.Display),
      captureDisplay: async (_display, maximumWidth) => {
        widths.push(maximumWidth)
        return sharp(fullFrame).resize({ width: maximumWidth }).png().toBuffer()
      },
    })
    vi.spyOn(scanner.engine, 'initialize').mockResolvedValue()
    vi.spyOn(scanner.engine, 'recognize')
      .mockResolvedValueOnce('由心及物')
      .mockResolvedValueOnce('冰寒')
      .mockResolvedValueOnce('虹吸')

    const manual = await scanner.scan(augments, true)
    const probe = await scanner.probeInterface()

    expect(manual.status).toBe('matched')
    expect(probe.status).toBe('detected')
    expect(widths).toEqual([1_440, 960])
    expect(fingerprintDistance(manual.fingerprints, probe.fingerprints)).toBeLessThan(.08)
  })

  it('releases hidden windows immediately after capture and before OCR inference', async () => {
    const { scanner } = await scannerFixture()
    vi.spyOn(scanner as unknown as { analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> }, 'analyzeInterfaceSignal')
      .mockResolvedValue({ detected: true, fingerprint: '1111' })
    const order: string[] = []
    vi.mocked(scanner.engine.recognize)
      .mockReset()
      .mockImplementation(async () => { order.push('recognize'); return '由心及物' })
    await scanner.scan(augments, true, () => order.push('restore'))
    expect(order[0]).toBe('restore')
    expect(order.slice(1)).toEqual(['recognize', 'recognize', 'recognize'])
  })

  it('lets a manual request wait briefly for an automatic probe to release the scanner', async () => {
    const { scanner } = await scannerFixture()
    const probe = scanner.probeInterface()
    const idle = scanner.waitUntilIdle(1_000)
    await probe
    await expect(idle).resolves.toBe(true)
  })

  it('reports bounded probe and full-OCR timing metrics and can reset them', async () => {
    const { scanner } = await scannerFixture()
    vi.spyOn(scanner as unknown as { analyzeInterfaceSignal(crop: Buffer): Promise<{ detected: boolean; fingerprint: string }> }, 'analyzeInterfaceSignal')
      .mockResolvedValue({ detected: true, fingerprint: '1111' })

    await scanner.scan(augments, true)
    await scanner.probeInterface()

    expect(scanner.getDiagnostics()).toMatchObject({
      cheapProbeCount: 1,
      cheapProbeLastDurationMs: expect.any(Number),
      cheapProbeMaxDurationMs: expect.any(Number),
      fullOcrCount: 1,
      fullOcrLastDurationMs: expect.any(Number),
      fullOcrMaxDurationMs: expect.any(Number),
    })
    scanner.resetPerformanceDiagnostics()
    expect(scanner.getDiagnostics()).toMatchObject({
      lastDurationMs: null,
      lastError: null,
      cheapProbeCount: 0,
      cheapProbeLastDurationMs: null,
      cheapProbeMaxDurationMs: null,
      fullOcrCount: 0,
      fullOcrLastDurationMs: null,
      fullOcrMaxDurationMs: null,
    })
  })

  it('drops timing from a probe that settles after the performance epoch resets', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-scanner-epoch-'))
    temporaryDirectories.push(directory)
    const image = await sharp({ create: { width: 960, height: 540, channels: 3, background: '#24463f' } })
      .png()
      .toBuffer()
    let resolveCapture: (value: Buffer) => void = () => undefined
    const capture = new Promise<Buffer>((resolve) => { resolveCapture = resolve })
    const scanner = new AugmentScanner(settings, directory, {
      resolveDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 960, height: 540 }, scaleFactor: 1 } as Electron.Display),
      captureDisplay: async () => capture,
    })
    const pending = scanner.probeInterface()
    await Promise.resolve()
    scanner.resetPerformanceDiagnostics()
    resolveCapture(image)
    await pending
    expect(scanner.getDiagnostics().cheapProbeCount).toBe(0)
  })

  it('validates three recognized titles before calibration can be saved', async () => {
    const { scanner } = await scannerFixture()
    const screenshot = await sharp({ create: { width: 960, height: 540, channels: 3, background: '#24463f' } })
      .png()
      .toBuffer()
    const result = await scanner.previewCalibration(
      `data:image/png;base64,${screenshot.toString('base64')}`,
      augmentScannerDefaults.rects,
      augments,
    )
    expect(result).toEqual({
      ok: true,
      names: ['由心及物', '冰寒', '虹吸'],
      message: '识别验证通过：由心及物 / 冰寒 / 虹吸',
    })
  })
})
