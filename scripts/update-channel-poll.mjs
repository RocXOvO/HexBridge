const DEFAULT_TOTAL_TIMEOUT_MS = 100_000
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

const retryAfterMilliseconds = (value, now) => {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null
}

export async function fetchWithTimeout(url, options = {}, {
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const fetchTextWithTimeout = async (url, options, { fetchImpl, timeoutMs }) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal })
    return { response, text: response.ok ? await response.text() : null }
  } finally {
    clearTimeout(timer)
  }
}

export async function pollText({
  url,
  acceptText,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  nowImpl = Date.now,
}) {
  const startedAt = nowImpl()
  let delayMs = 1_000
  let lastReason = 'no response'
  let attempt = 0
  while (nowImpl() - startedAt < totalTimeoutMs) {
    attempt += 1
    try {
      const { response, text: actual } = await fetchTextWithTimeout(
        `${url}${url.includes('?') ? '&' : '?'}noCache=${nowImpl()}`,
        { cache: 'no-store' },
        { fetchImpl, timeoutMs: Math.min(requestTimeoutMs, totalTimeoutMs - (nowImpl() - startedAt)) },
      )
      if (response.ok) {
        if (acceptText(actual)) return { text: actual, attempts: attempt, elapsedMs: nowImpl() - startedAt }
        lastReason = 'content has not propagated'
      } else {
        lastReason = `HTTP ${response.status}`
        if (response.status === 429) {
          delayMs = retryAfterMilliseconds(response.headers.get('retry-after'), nowImpl()) ?? delayMs
        }
      }
    } catch (error) {
      lastReason = error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : 'request failed'
    }
    const remainingMs = totalTimeoutMs - (nowImpl() - startedAt)
    if (remainingMs <= 0) break
    const waitMs = Math.min(Math.max(0, delayMs), remainingMs)
    await sleepImpl(waitMs)
    delayMs = Math.min(Math.max(1_000, delayMs * 2), 10_000)
  }
  throw new Error(`Stable update channel did not propagate within ${totalTimeoutMs}ms (${lastReason})`)
}

export async function pollExactText(options) {
  const result = await pollText({
    ...options,
    acceptText: (actual) => actual === options.expectedText,
  })
  return { attempts: result.attempts, elapsedMs: result.elapsedMs }
}
