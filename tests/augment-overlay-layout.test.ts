import { describe, expect, it } from 'vitest'
import {
  calculateAugmentOverlayBounds,
  calculateAugmentOverlayColumns,
  DEFAULT_AUGMENT_CARD_RECTS,
  resolveAugmentCardRects,
} from '../src/shared/augment-overlay-layout.js'

describe('augment recommendation overlay layout', () => {
  it('places the strip above the default three-card area', () => {
    const bounds = calculateAugmentOverlayBounds(
      null,
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    )
    expect(bounds.x).toBeGreaterThan(400)
    const cardTop = Math.round(DEFAULT_AUGMENT_CARD_RECTS.left.y * 1080)
    expect(bounds.y + bounds.height).toBeLessThan(cardTop)
    expect(bounds.width).toBeGreaterThan(900)
    expect(bounds.height).toBe(96)
  })

  it.each([
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ])('keeps an eight-pixel gap above the cards at $width×$height', ({ width, height }) => {
    const bounds = calculateAugmentOverlayBounds(
      DEFAULT_AUGMENT_CARD_RECTS,
      { x: 0, y: 0, width, height },
      { x: 0, y: 0, width, height },
    )
    const cardTop = Math.round(DEFAULT_AUGMENT_CARD_RECTS.left.y * height)
    expect(bounds.y + bounds.height + 8).toBeLessThanOrEqual(cardTop)
  })

  it('uses calibrated card bodies and clamps to a negative-coordinate work area', () => {
    const bounds = calculateAugmentOverlayBounds(
      DEFAULT_AUGMENT_CARD_RECTS,
      { x: -2560, y: -120, width: 2560, height: 1440 },
      { x: -2560, y: -120, width: 2560, height: 1400 },
      110,
    )
    expect(bounds.x).toBeGreaterThanOrEqual(-2560)
    expect(bounds.y).toBeGreaterThanOrEqual(-120)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1280)
  })

  it('does not treat a legacy title-only calibration as whole-card placement', () => {
    const legacy = {
      left: { x: .245, y: .37, width: .134, height: .085 },
      center: { x: .436, y: .37, width: .137, height: .085 },
      right: { x: .629, y: .37, width: .136, height: .085 },
    }
    const bounds = calculateAugmentOverlayBounds(
      legacy,
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    )
    const cardTop = Math.round(DEFAULT_AUGMENT_CARD_RECTS.left.y * 1080)
    expect(bounds.y + bounds.height).toBeLessThan(cardTop)
    expect(resolveAugmentCardRects(legacy)).toBe(DEFAULT_AUGMENT_CARD_RECTS)
  })

  it('keeps each compact recommendation aligned with its calibrated card column', () => {
    const columns = calculateAugmentOverlayColumns(DEFAULT_AUGMENT_CARD_RECTS)
    expect(columns.map((item) => item.slot)).toEqual(['left', 'center', 'right'])
    expect(columns[0]!.left).toBe(0)
    expect(columns[0]!.left + columns[0]!.width).toBeLessThan(columns[1]!.left)
    expect(columns[1]!.left + columns[1]!.width).toBeLessThan(columns[2]!.left)
    expect(columns[2]!.left + columns[2]!.width).toBeCloseTo(1, 5)
  })

  it('falls back from non-finite or reversed calibration and stays inside tiny work areas', () => {
    const malformed = {
      left: { x: Number.NaN, y: .2, width: .2, height: .5 },
      center: { x: .6, y: .2, width: .2, height: .5 },
      right: { x: .3, y: .2, width: .2, height: .5 },
    }
    expect(resolveAugmentCardRects(malformed)).toBe(DEFAULT_AUGMENT_CARD_RECTS)
    const bounds = calculateAugmentOverlayBounds(
      malformed,
      { x: 10, y: 20, width: 320, height: 180 },
      { x: 10, y: 20, width: 320, height: 120 },
      200,
    )
    expect(bounds).toMatchObject({ x: 10, width: 320, height: 120 })
    expect(bounds.y).toBe(20)
  })
})
