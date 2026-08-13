import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  createBoundedOrt,
  OCR_DETECTION_OPTIONS,
  OCR_INITIALIZATION_RETRY_MS,
  OCR_SESSION_OPTIONS,
  OcrEngine,
} from '../src/main/ocr/ocr-engine.js'

describe('OCR CPU budget', () => {
  it('keeps tiny title crops bounded and prevents ONNX from saturating game CPU', () => {
    expect(OCR_DETECTION_OPTIONS).toEqual({
      limitType: 'max',
      maxSideLength: 640,
      maxSideLimit: 640,
    })
    expect(OCR_SESSION_OPTIONS).toMatchObject({
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
      executionMode: 'sequential',
    })
  })

  it('applies the bounded options to every detection and recognition session', async () => {
    const create = vi.fn(async (_model: ArrayBuffer, _options?: Record<string, unknown>) => ({}))
    const bounded = createBoundedOrt({ InferenceSession: { create }, marker: true })
    await bounded.InferenceSession.create(new ArrayBuffer(1), { executionMode: 'parallel' })
    await bounded.InferenceSession.create(new ArrayBuffer(2))
    expect(create).toHaveBeenCalledTimes(2)
    for (const call of create.mock.calls) {
      expect(call[1]).toMatchObject(OCR_SESSION_OPTIONS)
    }
    expect(bounded.marker).toBe(true)
  })

  it('does not reload failed models on every poll but permits an explicit retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const engine = new OcrEngine()
    const load = vi.spyOn(engine as unknown as { load(): Promise<void> }, 'load')
      .mockRejectedValue(new Error('model unavailable'))
    await expect(engine.initialize()).rejects.toThrow('model unavailable')
    for (let index = 0; index < 10; index += 1) {
      await expect(engine.initialize()).rejects.toThrow('cooling down')
    }
    expect(load).toHaveBeenCalledTimes(1)
    await expect(engine.initialize(true)).rejects.toThrow('model unavailable')
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(OCR_INITIALIZATION_RETRY_MS)
    await expect(engine.initialize()).rejects.toThrow('model unavailable')
    expect(load).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
