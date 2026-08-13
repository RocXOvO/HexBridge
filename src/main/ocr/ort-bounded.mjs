export const OCR_DETECTION_OPTIONS = Object.freeze({
  // Title crops are small. PP-OCR's default "min" policy enlarges the
  // short side to 736px and creates an unnecessarily large tensor.
  limitType: 'max',
  maxSideLength: 640,
  maxSideLimit: 640,
})

export const OCR_SESSION_OPTIONS = Object.freeze({
  intraOpNumThreads: 2,
  interOpNumThreads: 1,
  executionMode: 'sequential',
  graphOptimizationLevel: 'all',
})

/**
 * Preserve the complete ONNX Runtime module surface while enforcing a small,
 * sequential CPU budget for every session PaddleOCR creates.
 *
 * @template {object} T
 * @param {T} ort
 * @returns {T}
 */
export function createBoundedOrt(ort) {
  return new Proxy(ort, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (property !== 'InferenceSession' || (typeof value !== 'object' && typeof value !== 'function')) {
        return value
      }
      return new Proxy(value, {
        get(sessionTarget, sessionProperty, sessionReceiver) {
          const sessionValue = Reflect.get(sessionTarget, sessionProperty, sessionReceiver)
          if (sessionProperty !== 'create' || typeof sessionValue !== 'function') return sessionValue
          return (model, options = {}) => Reflect.apply(sessionValue, sessionTarget, [
            model,
            { ...options, ...OCR_SESSION_OPTIONS },
          ])
        },
      })
    },
  })
}
