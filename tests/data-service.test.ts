import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

import { DataService } from '../src/main/data-service.js'

class MemoryConfig {
  key = ''
  hasApiKey() { return Boolean(this.key) }
  getApiKey() { return this.key || null }
  saveApiKey(key: string) { this.key = key }
  clearApiKey() { this.key = '' }
}

const directories: string[] = []
async function cacheDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('DataService failures and fallback', () => {
  it('maps a rejected key to unauthorized and clears the attempted key', async () => {
    const config = new MemoryConfig()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    const service = new DataService(await cacheDirectory(), config as any)
    const result = await service.validateKey('hx_live_12345678')
    expect(result.ok).toBe(false)
    expect(service.getState().status).toBe('unauthorized')
    expect(config.key).toBe('')
  })

  it('does not persist a candidate key until HEAD validation succeeds', async () => {
    const config = new MemoryConfig()
    let observedStoredKey: string | null = null
    vi.stubGlobal('fetch', vi.fn(async () => {
      observedStoredKey = config.getApiKey()
      return new Response(null, { status: 204 })
    }))
    const service = new DataService(await cacheDirectory(), config as any)
    const result = await service.validateKey('hx_live_12345678')
    expect(observedStoredKey).toBeNull()
    expect(result.ok).toBe(true)
    expect(config.key).toBe('hx_live_12345678')
  })

  it('maps catalog rate limiting to limited', async () => {
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('config.json')) {
        return Response.json({ gamePatch: '16.15', dataVersion: '16.15.6', publishedAt: 'now' })
      }
      return new Response(null, { status: 429 })
    }))
    const service = new DataService(await cacheDirectory(), config as any)
    await service.initialize()
    expect(service.getState()).toMatchObject({ status: 'limited', dataVersion: '16.15.6' })
  })

  it('restores a complete old cache and marks it stale when offline', async () => {
    const directory = await cacheDirectory()
    const cachedChampion = {
      id: 103, alias: 'Ahri', name: '阿狸', title: '', roles: [], iconUrl: '', splashUrl: '',
      tier: 2, winRate: .528, patch: '16.14', date: '', source: 'tencent',
    }
    await Promise.all([
      writeFile(path.join(directory, 'current.json'), JSON.stringify({ version: '16.14.1' })),
      writeFile(path.join(directory, 'champions-16.14.1.json'), JSON.stringify([cachedChampion])),
      writeFile(path.join(directory, 'augments-16.14.1.json'), JSON.stringify([{ id: 1 }])),
    ])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const service = new DataService(directory, new MemoryConfig() as any)
    await service.initialize()
    expect(service.getChampions()).toEqual([cachedChampion])
    expect(service.getState()).toMatchObject({ status: 'stale', dataVersion: '16.14.1' })
  })

  it('coalesces concurrent initialization to avoid duplicate API credits and cache writes', async () => {
    const config = new MemoryConfig()
    let release: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const fetchMock = vi.fn(async () => {
      await waiting
      return Response.json({ gamePatch: '16.15', dataVersion: '16.15.6', publishedAt: 'now' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const service = new DataService(await cacheDirectory(), config as any)

    const first = service.initialize()
    const second = service.initialize(true)
    expect(first).toBe(second)
    release?.()
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
