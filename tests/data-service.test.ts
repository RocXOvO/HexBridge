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

  it('returns an immediate, user-facing network error and does not persist the candidate', async () => {
    const config = new MemoryConfig()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const service = new DataService(await cacheDirectory(), config as any)
    const result = await service.validateKey('hx_live_12345678')
    expect(result).toEqual({ ok: false, message: '无法连接数据服务，请检查网络或代理设置' })
    expect(config.key).toBe('')
  })

  it('reports secure-storage failure after a successful HEAD without pretending the Key was saved', async () => {
    const config = new MemoryConfig()
    config.saveApiKey = () => { throw new Error('当前系统无法提供安全的密钥存储') }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    const service = new DataService(await cacheDirectory(), config as any)
    const result = await service.validateKey('hx_live_12345678')
    expect(result).toEqual({ ok: false, message: '当前系统无法提供安全的密钥存储' })
    expect(config.key).toBe('')
  })

  it('tells the user that the previous Key remains active when replacement validation fails', async () => {
    const config = new MemoryConfig()
    config.key = 'hx_live_previous1'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    const service = new DataService(await cacheDirectory(), config as any)
    const result = await service.validateKey('hx_live_candidate1')
    expect(result.message).toBe('新 Key 验证失败，已保留原 Key：API Key 无效或已失效，请重新复制后再试')
    expect(config.key).toBe('hx_live_previous1')
  })

  it('also confirms that the previous Key is preserved when the replacement format is invalid', async () => {
    const config = new MemoryConfig()
    config.key = 'hx_live_previous1'
    const service = new DataService(await cacheDirectory(), config as any)
    expect(await service.validateKey('not-a-key')).toEqual({
      ok: false,
      message: '新 Key 格式无效，原 Key 仍保留；格式应以 hx_live_ 或 hx_test_ 开头',
    })
    expect(config.key).toBe('hx_live_previous1')
  })

  it('classifies Key rate limits and aborted validation without persisting the candidate', async () => {
    const limitedConfig = new MemoryConfig()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })))
    const limited = new DataService(await cacheDirectory(), limitedConfig as any)
    expect(await limited.validateKey('hx_live_candidate1')).toEqual({
      ok: false,
      message: '请求过于频繁，请稍后再验证',
    })
    expect(limitedConfig.key).toBe('')

    const abortedConfig = new MemoryConfig()
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }))
    const aborted = new DataService(await cacheDirectory(), abortedConfig as any)
    expect(await aborted.validateKey('hx_live_candidate1')).toEqual({
      ok: false,
      message: '验证超时，请检查网络后重试',
    })
    expect(abortedConfig.key).toBe('')
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

  it('refreshes v1/v2 detail caches after the local build schema changes', async () => {
    const directory = await cacheDirectory()
    await Promise.all([
      writeFile(path.join(directory, 'champion-detail-16.15.6-103.json'), JSON.stringify({
        championId: 103, dataVersion: '16.15.6',
        ranks: [{ augmentId: 7, rank: 1, total: 100, tier: 1 }],
      })),
      writeFile(path.join(directory, 'champion-detail-v2-16.15.6-103.json'), JSON.stringify({
        championId: 103, dataVersion: '16.15.6',
        ranks: [{ augmentId: 7, rank: 1, total: 100, tier: 1, pickRate: .2 }],
      })),
    ])
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    const fetchMock = vi.fn(async () => Response.json({ data: { augments: [{
      id: 7,
      stats: { rank: 1, total: 100, tier: 1, pickRate: .2, source: 'tencent', region: 'CN' },
    }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new DataService(directory, config as any) as any
    service.apiState = { ...service.apiState, status: 'ready', dataVersion: '16.15.6' }
    service.cachedDataVersion = '16.15.6'
    await service.loadDetailCaches('16.15.6')

    const detail = await service.getChampionAugments(103)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(detail.ranks[0]).toMatchObject({
      pickRate: .2,
      statsSource: 'tencent',
      statsRegion: 'CN',
    })
    expect(detail.builds).toEqual([])
  })

  it('rejects a cached pick rate without complete allowlisted provenance', async () => {
    const directory = await cacheDirectory()
    await writeFile(path.join(directory, 'champion-detail-v3-16.15.6-103.json'), JSON.stringify({
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 7, rank: 1, total: 100, tier: 1, pickRate: .9, statsSource: null, statsRegion: null }],
      builds: [],
    }))
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    const fetchMock = vi.fn(async () => Response.json({ data: { augments: [{
      id: 7,
      stats: { rank: 1, total: 100, tier: 1, pickRate: .2, source: 'tencent', region: 'CN' },
    }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new DataService(directory, config as any) as any
    service.apiState = { ...service.apiState, status: 'ready', dataVersion: '16.15.6' }
    service.cachedDataVersion = '16.15.6'
    await service.loadDetailCaches('16.15.6')

    const detail = await service.getChampionAugments(103)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(detail.ranks[0]).toMatchObject({
      pickRate: .2,
      statsSource: 'tencent',
      statsRegion: 'CN',
    })
  })

  it('uses a v2 pick-rate detail as stale fallback when the upgraded client is offline', async () => {
    const directory = await cacheDirectory()
    await writeFile(path.join(directory, 'champion-detail-v2-16.15.6-103.json'), JSON.stringify({
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 7, rank: 3, total: 167, tier: 1, pickRate: .2, statsSource: 'tencent', statsRegion: 'CN' }],
    }))
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const service = new DataService(directory, config as any) as any
    service.apiState = { ...service.apiState, status: 'ready', dataVersion: '16.15.6' }
    service.cachedDataVersion = '16.15.6'
    await service.loadDetailCaches('16.15.6')

    const detail = await service.getChampionAugments(103)

    expect(service.getState().status).toBe('stale')
    expect(detail).toEqual({
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 7, rank: 3, total: 167, tier: 1, pickRate: .2, statsSource: 'tencent', statsRegion: 'CN' }],
      builds: [],
    })
  })

  it('drops an unattributed legacy pick rate while preserving rank fallback offline', async () => {
    const directory = await cacheDirectory()
    await writeFile(path.join(directory, 'champion-detail-v2-16.15.6-103.json'), JSON.stringify({
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 7, rank: 3, total: 167, tier: 1, pickRate: .9 }],
    }))
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const service = new DataService(directory, config as any) as any
    service.apiState = { ...service.apiState, status: 'ready', dataVersion: '16.15.6' }
    service.cachedDataVersion = '16.15.6'
    await service.loadDetailCaches('16.15.6')

    const detail = await service.getChampionAugments(103)

    expect(service.getState().status).toBe('stale')
    expect(detail.ranks[0]).toMatchObject({
      rank: 3,
      pickRate: null,
      statsSource: null,
      statsRegion: null,
    })
  })

  it('uses a legacy rank-only detail as stale fallback when the upgraded client is offline', async () => {
    const directory = await cacheDirectory()
    await writeFile(path.join(directory, 'champion-detail-16.15.6-103.json'), JSON.stringify({
      championId: 103, dataVersion: '16.15.6',
      ranks: [{ augmentId: 7, rank: 3, total: 167, tier: 1 }],
    }))
    const config = new MemoryConfig()
    config.key = 'hx_live_12345678'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const service = new DataService(directory, config as any) as any
    service.apiState = { ...service.apiState, status: 'ready', dataVersion: '16.15.6' }
    service.cachedDataVersion = '16.15.6'
    await service.loadDetailCaches('16.15.6')

    const detail = await service.getChampionAugments(103)

    expect(service.getState().status).toBe('stale')
    expect(detail.ranks).toEqual([{
      augmentId: 7,
      rank: 3,
      total: 167,
      tier: 1,
      pickRate: null,
      statsSource: null,
      statsRegion: null,
    }])
    expect(detail.builds).toEqual([])
  })
})
