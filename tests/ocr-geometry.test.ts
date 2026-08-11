import { describe, expect, it } from 'vitest'
import { normalizedRectToPixels } from '../src/shared/ocr-geometry.js'

describe('normalized OCR crop geometry', () => {
  const rect = { x: .165, y: .255, width: .205, height: .082 }

  it.each([
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ])('scales the same title box to %ix%i without leaving the image', (width, height) => {
    const result = normalizedRectToPixels(rect, width, height)
    expect(result.left).toBe(Math.round(width * rect.x))
    expect(result.width).toBe(Math.round(width * rect.width))
    expect(result.top + result.height).toBeLessThanOrEqual(height)
    expect(result.left + result.width).toBeLessThanOrEqual(width)
  })

  it('clamps a calibration rectangle at the image edge', () => {
    expect(normalizedRectToPixels({ x: .99, y: .99, width: .5, height: .5 }, 100, 100)).toEqual({
      left: 99, top: 99, width: 1, height: 1,
    })
  })
})
