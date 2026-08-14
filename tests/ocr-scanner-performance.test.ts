import { mkdtemp, rm } from 'node:fs/promises'
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
  hotkey: 'F8',
  gameDirectory: '',
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
    vi.spyOn(scanner as unknown as { hasInterfaceSignal(crop: Buffer): Promise<boolean> }, 'hasInterfaceSignal')
      .mockResolvedValue(false)
    expect((await scanner.scan(augments, false)).status).toBe('not-detected')
    expect(widths).toEqual([augmentScannerDefaults.automaticGateWidth])
  })

  it('uses one bounded thumbnail and one bounded OCR frame after an automatic hit', async () => {
    const { scanner, widths } = await scannerFixture()
    vi.spyOn(scanner as unknown as { hasInterfaceSignal(crop: Buffer): Promise<boolean> }, 'hasInterfaceSignal')
      .mockResolvedValue(true)
    expect((await scanner.scan(augments, false)).status).toBe('matched')
    expect(widths).toEqual([
      augmentScannerDefaults.automaticGateWidth,
      augmentScannerDefaults.ocrCaptureWidth,
    ])
  })

  it('manual recognition skips polling and captures only one bounded OCR frame', async () => {
    const { scanner, widths } = await scannerFixture()
    vi.spyOn(scanner as unknown as { hasInterfaceSignal(crop: Buffer): Promise<boolean> }, 'hasInterfaceSignal')
      .mockResolvedValue(true)
    expect((await scanner.scan(augments, true)).status).toBe('matched')
    expect(widths).toEqual([augmentScannerDefaults.ocrCaptureWidth])
    expect(augmentScannerDefaults.ocrCaptureWidth).toBe(1_440)
  })

  it('releases hidden windows immediately after capture and before OCR inference', async () => {
    const { scanner } = await scannerFixture()
    vi.spyOn(scanner as unknown as { hasInterfaceSignal(crop: Buffer): Promise<boolean> }, 'hasInterfaceSignal')
      .mockResolvedValue(true)
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
