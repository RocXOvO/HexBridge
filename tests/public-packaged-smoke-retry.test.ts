import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error Executable release helper intentionally has no TypeScript declaration file.
import { isPublicPackagedVersionMismatch, retryPublicPackagedSmoke, shouldRetryPublicPackagedFailure } from '../scripts/public-packaged-smoke-retry.mjs'

describe('public packaged update propagation retry', () => {
  it('retries only stale-version results and succeeds with a fresh attempt', async () => {
    let time = 0
    const sleep = vi.fn(async (milliseconds: number) => { time += milliseconds })
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: true, retryable: false, result: { channelVersion: '0.1.27' } })

    await expect(retryPublicPackagedSmoke({ execute, sleep, now: () => time })).resolves.toMatchObject({
      ok: true,
      attempts: 3,
      exhausted: false,
    })
    expect(sleep.mock.calls).toEqual([[2_000], [5_000]])
    expect(execute.mock.calls.map(([value]) => value.timeoutMs)).toEqual([20_000, 20_000, 20_000])
  })

  it('does not retry timeouts, launch failures, or other smoke errors', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: false, retryable: false, error: new Error('launch failed') })
    const sleep = vi.fn()
    await expect(retryPublicPackagedSmoke({ execute, sleep })).resolves.toMatchObject({
      ok: false,
      attempts: 1,
      exhausted: false,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stays inside the total propagation budget', async () => {
    let time = 0
    const execute = vi.fn().mockResolvedValue({ ok: false, retryable: true })
    const sleep = vi.fn(async (milliseconds: number) => { time += milliseconds })
    const result = await retryPublicPackagedSmoke({ execute, sleep, now: () => time, budgetMs: 14_000 })
    expect(result).toMatchObject({ ok: false, attempts: 2, exhausted: true })
    expect(sleep.mock.calls).toEqual([[2_000]])
  })

  it('reserves cleanup time after an attempt consumes most of the wall-clock budget', async () => {
    let time = 0
    const execute = vi.fn(async ({ timeoutMs }: { timeoutMs: number }) => {
      time += timeoutMs
      return { ok: false, retryable: true }
    })
    const sleep = vi.fn(async (milliseconds: number) => { time += milliseconds })
    const result = await retryPublicPackagedSmoke({ execute, sleep, now: () => time, budgetMs: 15_000 })
    expect(result).toMatchObject({ ok: false, attempts: 1, exhausted: true })
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 7_000, deadlineAt: 15_000 })
    expect(time).toBe(7_000)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('classifies only the stable version-mismatch code as propagation lag', () => {
    expect(isPublicPackagedVersionMismatch('HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH')).toBe(true)
    expect(isPublicPackagedVersionMismatch('HB_PUBLIC_UPDATE_SMOKE_TIMEOUT')).toBe(false)
    expect(isPublicPackagedVersionMismatch('spawn failed')).toBe(false)
    expect(shouldRetryPublicPackagedFailure({
      exitCode: 1,
      output: 'HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH',
    })).toBe(true)
    expect(shouldRetryPublicPackagedFailure({
      exitCode: 0,
      output: JSON.stringify({ ok: false, channelVersion: null }),
    })).toBe(false)
    expect(shouldRetryPublicPackagedFailure({
      exitCode: null,
      output: 'HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH',
    })).toBe(false)
  })
})
