export const OCR_DETECTION_OPTIONS: Readonly<{
  limitType: 'max'
  maxSideLength: number
  maxSideLimit: number
}>

export const OCR_SESSION_OPTIONS: Readonly<{
  intraOpNumThreads: number
  interOpNumThreads: number
  executionMode: 'sequential'
  graphOptimizationLevel: 'all'
}>

export function createBoundedOrt<T extends object>(ort: T): T
