import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release helper intentionally has no TypeScript declaration file.
import { pollExactText } from '../scripts/update-channel-poll.mjs'

const response = (status: number, body = '', headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  text: async () => body,
})

describe('stable update channel propagation poll', () => {
  it('waits through stale content, 404 and 5xx until exact content propagates', async () => {
    let now = 0
    const replies = [response(200, 'old'), response(404), response(503), response(200, 'new')]
    const result = await pollExactText({
      url: 'https://example.test/latest.yml',
      expectedText: 'new',
      totalTimeoutMs: 100_000,
      fetchImpl: async () => replies.shift(),
      sleepImpl: async (milliseconds: number) => { now += milliseconds },
      nowImpl: () => now,
    })
    expect(result.attempts).toBe(4)
    expect(now).toBe(7_000)
  })

  it('honors Retry-After without exceeding the bounded propagation window', async () => {
    let now = 0
    const waits: number[] = []
    let calls = 0
    await expect(pollExactText({
      url: 'https://example.test/latest.yml',
      expectedText: 'new',
      totalTimeoutMs: 9_000,
      fetchImpl: async () => {
        calls += 1
        return response(429, '', { 'retry-after': '7' })
      },
      sleepImpl: async (milliseconds: number) => { waits.push(milliseconds); now += milliseconds },
      nowImpl: () => now,
    })).rejects.toThrow(/HTTP 429/)
    expect(calls).toBe(2)
    expect(waits).toEqual([7_000, 2_000])
  })

  it('reports a bounded failure when raw content never becomes exact', async () => {
    let now = 0
    await expect(pollExactText({
      url: 'https://example.test/latest.yml',
      expectedText: 'new',
      totalTimeoutMs: 3_000,
      fetchImpl: async () => response(200, 'old'),
      sleepImpl: async (milliseconds: number) => { now += milliseconds },
      nowImpl: () => now,
    })).rejects.toThrow(/content has not propagated/)
  })

  it('aborts a raw request that never returns headers', async () => {
    await expect(pollExactText({
      url: 'https://example.test/latest.yml',
      expectedText: 'new',
      totalTimeoutMs: 25,
      requestTimeoutMs: 5,
      fetchImpl: async (_url: string, options: RequestInit) => new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    })).rejects.toThrow(/request timed out/)
  })
})
