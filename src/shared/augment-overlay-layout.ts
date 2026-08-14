import type { AugmentSlot, CalibrationRects, NormalizedRect } from './contracts.js'
import { looksLikeWholeCard } from './ocr-geometry.js'

export interface ScreenBounds {
  x: number
  y: number
  width: number
  height: number
}

// These bounds describe the whole card bodies, not the OCR title bands. They
// are only a placement fallback when the user has not calibrated this display.
export const DEFAULT_AUGMENT_CARD_RECTS: CalibrationRects = {
  left: { x: 0.228, y: 0.175, width: 0.168, height: 0.5 },
  center: { x: 0.419, y: 0.175, width: 0.171, height: 0.5 },
  right: { x: 0.612, y: 0.175, width: 0.17, height: 0.5 },
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function isFiniteRect(rect: NormalizedRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
    rect.x + rect.width <= 1.001 && rect.y + rect.height <= 1.001
}

function union(rects: NormalizedRect[]): NormalizedRect {
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resolveAugmentCardRects(cardRects: CalibrationRects | null): CalibrationRects {
  if (!cardRects) return DEFAULT_AUGMENT_CARD_RECTS
  const rects = [cardRects.left, cardRects.center, cardRects.right]
  const centers = rects.map((rect) => rect.x + rect.width / 2)
  const geometryIsUsable = rects.every((rect) => isFiniteRect(rect) && looksLikeWholeCard(rect)) &&
    centers[0]! < centers[1]! && centers[1]! < centers[2]!
  return geometryIsUsable ? cardRects : DEFAULT_AUGMENT_CARD_RECTS
}

export function calculateAugmentOverlayColumns(
  cardRects: CalibrationRects | null,
): Array<{ slot: AugmentSlot; left: number; width: number }> {
  const rects = resolveAugmentCardRects(cardRects)
  const cards = union([rects.left, rects.center, rects.right])
  const slots: AugmentSlot[] = ['left', 'center', 'right']
  return slots.map((slot) => ({
    slot,
    left: clamp((rects[slot].x - cards.x) / cards.width, 0, 1),
    width: clamp(rects[slot].width / cards.width, 0.08, 1),
  }))
}

export function calculateAugmentOverlayBounds(
  cardRects: CalibrationRects | null,
  displayBounds: ScreenBounds,
  workArea: ScreenBounds,
  height = 96,
  gap = 8,
): ScreenBounds {
  const rects = resolveAugmentCardRects(cardRects)
  const cards = union([rects.left, rects.center, rects.right])
  const desiredWidth = Math.round(cards.width * displayBounds.width)
  const maximumWidth = Math.max(1, Math.round(workArea.width))
  const minimumWidth = Math.min(540, maximumWidth)
  const width = clamp(desiredWidth, minimumWidth, maximumWidth)
  const safeHeight = clamp(Math.round(height), 1, Math.max(1, Math.round(workArea.height)))
  const desiredX = displayBounds.x + Math.round(cards.x * displayBounds.width)
  const desiredY = displayBounds.y + Math.round(cards.y * displayBounds.height) - safeHeight - gap
  return {
    x: clamp(desiredX, workArea.x, workArea.x + workArea.width - width),
    y: clamp(desiredY, workArea.y, workArea.y + workArea.height - safeHeight),
    width,
    height: safeHeight,
  }
}
