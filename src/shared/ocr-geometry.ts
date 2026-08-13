import type { NormalizedRect } from './contracts.js'

/**
 * Calibration intentionally asks the user to outline each whole card because
 * that target is large and unambiguous at 4K. OCR only needs the title band.
 */
export function cardRectToTitleRect(card: NormalizedRect): NormalizedRect {
  return {
    x: card.x + card.width * 0.10,
    y: card.y + card.height * 0.39,
    width: card.width * 0.80,
    height: card.height * 0.17,
  }
}

export function looksLikeWholeCard(rect?: NormalizedRect | null): rect is NormalizedRect {
  return Boolean(rect && (rect.height >= 0.18 || rect.height >= rect.width * 1.25))
}

export function titleRectForCalibration(rect: NormalizedRect): NormalizedRect {
  return looksLikeWholeCard(rect) ? cardRectToTitleRect(rect) : rect
}

export interface PixelRect {
  left: number
  top: number
  width: number
  height: number
}

export function normalizedRectToPixels(
  rect: NormalizedRect,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const safeWidth = Math.max(1, Math.round(imageWidth))
  const safeHeight = Math.max(1, Math.round(imageHeight))
  const left = Math.max(0, Math.min(safeWidth - 1, Math.round(rect.x * safeWidth)))
  const top = Math.max(0, Math.min(safeHeight - 1, Math.round(rect.y * safeHeight)))
  return {
    left,
    top,
    width: Math.max(1, Math.min(safeWidth - left, Math.round(rect.width * safeWidth))),
    height: Math.max(1, Math.min(safeHeight - top, Math.round(rect.height * safeHeight))),
  }
}
