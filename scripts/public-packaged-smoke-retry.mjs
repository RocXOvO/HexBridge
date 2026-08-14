export const PUBLIC_PACKAGED_SMOKE_BUDGET_MS = 100_000
export const PUBLIC_PACKAGED_SMOKE_ATTEMPT_TIMEOUT_MS = 20_000
export const PUBLIC_PACKAGED_SMOKE_CLEANUP_RESERVE_MS = 8_000
export const PUBLIC_PACKAGED_SMOKE_RETRY_DELAYS_MS = Object.freeze([
  0,
  2_000,
  5_000,
  10_000,
  15_000,
  20_000,
  30_000,
])

export const isPublicPackagedVersionMismatch = (output) => (
  String(output).includes('HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH')
)

export const shouldRetryPublicPackagedFailure = ({ exitCode, output }) => (
  Number.isInteger(exitCode) && exitCode !== 0 && isPublicPackagedVersionMismatch(output)
)

export async function retryPublicPackagedSmoke({
  execute,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
  budgetMs = PUBLIC_PACKAGED_SMOKE_BUDGET_MS,
  cleanupReserveMs = PUBLIC_PACKAGED_SMOKE_CLEANUP_RESERVE_MS,
  delays = PUBLIC_PACKAGED_SMOKE_RETRY_DELAYS_MS,
}) {
  const startedAt = now()
  const deadlineAt = startedAt + budgetMs
  let attempts = 0
  let lastResult = null
  for (const delayMs of delays) {
    const beforeDelay = deadlineAt - now()
    if (delayMs + cleanupReserveMs >= beforeDelay) break
    if (delayMs > 0) await sleep(delayMs)
    const remainingMs = deadlineAt - now()
    if (remainingMs <= cleanupReserveMs) break
    attempts += 1
    lastResult = await execute({
      attempt: attempts,
      timeoutMs: Math.min(
        PUBLIC_PACKAGED_SMOKE_ATTEMPT_TIMEOUT_MS,
        remainingMs - cleanupReserveMs,
      ),
      deadlineAt,
      cleanupReserveMs,
    })
    if (lastResult.ok || !lastResult.retryable) {
      return { ...lastResult, attempts, exhausted: false }
    }
  }
  return { ...(lastResult ?? { ok: false, retryable: false }), attempts, exhausted: true }
}
