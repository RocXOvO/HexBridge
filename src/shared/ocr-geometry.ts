import type { NormalizedRect } from './contracts.js'

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
