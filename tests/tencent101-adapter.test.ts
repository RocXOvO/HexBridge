import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseTencentAugmentCatalog,
  parseTencentHeroRank,
  parseTencentRuneRank,
  Tencent101Adapter,
} from '../src/main/tencent101-adapter.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const compressed = (value: Record<string, unknown>, duplicate?: string) => {
  const encoded = JSON.stringify(value)
  return {
    code: 0,
    data: {
      result: encoded,
      _fieldValues: { R15381: duplicate ?? encoded },
    },
  }
}

const runePayload = (date = '20260814', pickRates: Record<number, string> = {}) => compressed({
  dtstatdate: date,
  augmentlist: Array.from({ length: 60 }, (_, index) => {
    const id = 1001 + index
    return `${id}_255_${pickRates[index] ?? (0.1 + index / 1000).toFixed(3)}_${index + 1}_0_${(0.4 + index / 1000).toFixed(3)}_${60 - index}_0_1,2`
  }).join('#'),
})

const heroPayload = (recommendation = '1003,1001,1002', count = 100) => compressed({
  listcollect: Array.from({ length: count }, (_, index) => {
    const id = index + 1
    const recommended = id === 1 ? recommendation : ''
    return `${id}_${index + 1}_0_0.500_0.100__0_0_0_0_${recommended}`
  }).join('#'),
})

const augmentCatalog = () => Array.from({ length: 100 }, (_, index) => {
  const id = 1001 + index
  return {
    augmentID: String(id),
    name_cn: `强化${id}`,
    level: index % 3 === 0 ? 'kPrismatic' : index % 3 === 1 ? 'kGold' : 'kSilver',
    tooltip: `强化 ${id} 的描述`,
    large_Icon: `https://game.gtimg.cn/images/lol/act/img/augment/${id}.png`,
  }
})

const heroCatalog = (count = 100) => ({
  hero: Array.from({ length: count }, (_, index) => {
    const id = index + 1
    return {
      heroId: String(id),
      alias: `Hero${id}`,
      title: `英雄${id}`,
      name: `英雄称号${id}`,
      roles: ['mage'],
      keywords: `英雄${id},别名${id}`,
    }
  }),
})

const jsonResponse = (value: unknown, headers?: Record<string, string>) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
})

const validFetcher = () => vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' })
  if (url.pathname.endsWith('fuwen_aram_rune_rank_v2')) return jsonResponse(runePayload())
  if (url.pathname.endsWith('fuwen_aram_hero_rank_v2')) {
    expect(url.searchParams.get('dtstatdate')).toBe('20260814')
    return jsonResponse(heroPayload())
  }
  if (url.pathname.endsWith('kiwi_augments.json')) return jsonResponse(augmentCatalog())
  if (url.pathname.endsWith('hero_list.js')) return jsonResponse(heroCatalog())
  return new Response('', { status: 404 })
})

describe('Tencent 101 compressed fixtures', () => {
  it('parses the verified field order, date, recommendation order and global metrics', () => {
    const runes = parseTencentRuneRank(runePayload())
    const heroes = parseTencentHeroRank(heroPayload())
    expect(runes.statisticsDate).toBe('20260814')
    expect(runes.rows[0]).toEqual({
      augmentId: 1001,
      pickRate: .1,
      pickRank: 1,
      pickRankChange: 0,
      winRate: .4,
      winRank: 60,
      winRankChange: 0,
    })
    expect(heroes[0]).toMatchObject({ heroId: 1, rank: 1, recommendedAugmentIds: [1003, 1001, 1002] })
  })

  it('fails closed on ambiguous compressed fields, changed row shapes and duplicate recommendations', () => {
    expect(() => parseTencentRuneRank(compressed({ dtstatdate: '20260814', augmentlist: 'x' }, '{"changed":true}'))).toThrow(/歧义/)
    expect(() => parseTencentRuneRank(compressed({ dtstatdate: '20260814', augmentlist: '1_255_0.1' }))).toThrow(/条目数量/)
    expect(() => parseTencentHeroRank(heroPayload('1001,1001'))).toThrow(/重复/)
    expect(() => parseTencentRuneRank(runePayload('20260230'))).toThrow(/有效统计日期/)
  })

  it('accepts the verified direct data._fieldValues JSON-string envelope', () => {
    const payload = runePayload()
    const encoded = payload.data.result
    expect(parseTencentRuneRank({ result: 0, data: { _fieldValues: encoded } }).statisticsDate).toBe('20260814')
  })

  it('accepts bounded scientific notation used by Tencent for very small rates', () => {
    const parsed = parseTencentRuneRank(runePayload('20260814', {
      0: '8e-05',
      1: '1.2E-4',
    }))

    expect(parsed.rows[0]?.pickRate).toBe(0.00008)
    expect(parsed.rows[1]?.pickRate).toBe(0.00012)
    expect(() => parseTencentRuneRank(runePayload('20260814', { 0: '1e1' }))).toThrow(/\u65e0\u6548/)
    expect(() => parseTencentRuneRank(runePayload('20260814', { 0: '12.5' }))).toThrow(/\u65e0\u6548/)
  })
})

describe('Tencent 101 augment catalog fixtures', () => {
  it('accepts the current array and the legacy object envelope', () => {
    const current = augmentCatalog()
    const legacy = Object.fromEntries(current.map((entry) => [String(entry.augmentID), entry]))

    expect(parseTencentAugmentCatalog(current)).toHaveLength(100)
    expect(parseTencentAugmentCatalog(legacy)).toEqual(parseTencentAugmentCatalog(current))
  })

  it('bounds raw work and rejects invalid catalog entries', () => {
    expect(() => parseTencentAugmentCatalog([])).toThrow(/数量异常/)
    expect(() => parseTencentAugmentCatalog(Array.from({ length: 501 }, () => null))).toThrow(/数量异常/)
    expect(() => parseTencentAugmentCatalog([...augmentCatalog(), null])).toThrow(/无效条目/)
  })

  it('deduplicates only semantically identical IDs and rejects conflicts', () => {
    const current = augmentCatalog()
    const duplicate = { ...current[0]! }
    expect(parseTencentAugmentCatalog([...current, duplicate])).toHaveLength(100)
    expect(() => parseTencentAugmentCatalog([
      ...current,
      { ...duplicate, name_cn: '冲突的强化名称' },
    ])).toThrow(/重复 ID 存在冲突/)
  })
})

describe('Tencent101Adapter', () => {
  it('loads one atomic source snapshot without a dtodo key and preserves metric scope', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-'))
    temporaryDirectories.push(directory)
    const fetcher = validFetcher()
    const adapter = new Tencent101Adapter(directory, 'test', fetcher, () => 1_000)

    await expect(adapter.initialize()).resolves.toMatchObject({
      source: 'tencent101', status: 'ready', statisticsDate: '20260814', stale: false,
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(adapter.getChampions()).toHaveLength(100)
    expect(adapter.getAugments()).toHaveLength(100)
    const detail = adapter.getChampionRecommendation(1)
    expect(detail).toMatchObject({ source: 'tencent101', championId: 1, statisticsDate: '20260814' })
    expect(detail.ranks.find((rank) => rank.augmentId === 1003)).toMatchObject({
      heroRecommendationRank: 1,
      championPickRate: null,
      globalPickRate: .102,
      globalWinRate: .402,
      statsSource: 'tencent',
      statsRegion: 'CN',
    })
    await adapter.initialize()
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('uses only the fixed Tencent endpoint queries', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-allowlist-'))
    temporaryDirectories.push(directory)
    const fetcher = validFetcher()
    await new Tencent101Adapter(directory, 'test', fetcher, () => 1_500).initialize()

    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)))
    expect(urls.find((url) => url.pathname.endsWith('fuwen_aram_rune_rank_v2'))?.search).toBe('?augmentid_level=255')
    expect(urls.find((url) => url.pathname.endsWith('fuwen_aram_hero_rank_v2'))?.search).toBe('?dtstatdate=20260814')
    expect(urls.filter((url) => url.hostname === 'game.gtimg.cn').every((url) => url.search === '')).toBe(true)
  })

  it('loads only its own normalized cache and marks it stale when the network is unavailable', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-cache-'))
    temporaryDirectories.push(directory)
    const first = new Tencent101Adapter(directory, 'test', validFetcher(), () => 2_000)
    const ready = await first.initialize()
    const offline = new Tencent101Adapter(
      directory,
      'test',
      vi.fn(async () => { throw new TypeError('offline') }),
      () => 2_000 + 24 * 60 * 60 * 1_000 + 1,
    )
    await expect(offline.initialize()).resolves.toMatchObject({
      source: 'tencent101', status: 'stale', snapshotId: ready.snapshotId, statisticsDate: '20260814', stale: true,
    })
    expect(offline.getChampions()).toHaveLength(100)
    expect(offline.getChampionRecommendation(1).source).toBe('tencent101')
  })

  it('fails closed instead of restoring a tampered or malformed cache snapshot', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-tampered-'))
    temporaryDirectories.push(directory)
    await new Tencent101Adapter(directory, 'test', validFetcher(), () => 4_000).initialize()
    const pointer = JSON.parse(await readFile(path.join(directory, 'current.json'), 'utf8')) as { file: string }
    const snapshotPath = path.join(directory, pointer.file)
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as { champions: Array<{ name: string }> }
    snapshot.champions[0]!.name = '被篡改的缓存'
    await writeFile(snapshotPath, JSON.stringify(snapshot), 'utf8')
    const offline = new Tencent101Adapter(directory, 'test', vi.fn(async () => { throw new TypeError('offline') }))

    await expect(offline.initialize()).resolves.toMatchObject({ status: 'offline', snapshotId: '' })
    expect(offline.getChampions()).toEqual([])
  })

  it('includes fetchedAt in cache integrity instead of accepting a forged fresh lifetime', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-cache-time-'))
    temporaryDirectories.push(directory)
    await new Tencent101Adapter(directory, 'test', validFetcher(), () => 4_000).initialize()
    const pointer = JSON.parse(await readFile(path.join(directory, 'current.json'), 'utf8')) as { file: string }
    const snapshotPath = path.join(directory, pointer.file)
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as { fetchedAt: number }
    snapshot.fetchedAt = Date.now() + 365 * 24 * 60 * 60 * 1_000
    await writeFile(snapshotPath, JSON.stringify(snapshot), 'utf8')
    const offline = new Tencent101Adapter(directory, 'test', vi.fn(async () => { throw new TypeError('offline') }))

    await expect(offline.initialize()).resolves.toMatchObject({ status: 'offline', snapshotId: '' })
  })

  it('validates the complete network snapshot before advancing the cache pointer', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-relations-'))
    temporaryDirectories.push(directory)
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('fuwen_aram_rune_rank_v2')) return jsonResponse(runePayload())
      if (url.pathname.endsWith('fuwen_aram_hero_rank_v2')) return jsonResponse(heroPayload('', 101))
      if (url.pathname.endsWith('kiwi_augments.json')) return jsonResponse(augmentCatalog())
      return jsonResponse(heroCatalog(100))
    })
    const adapter = new Tencent101Adapter(directory, 'test', fetcher, () => 4_500)

    await expect(adapter.initialize()).resolves.toMatchObject({ status: 'error', snapshotId: '' })
    await expect(readFile(path.join(directory, 'current.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects decoded bodies above 2 MiB and never manufactures an empty snapshot', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-limit-'))
    temporaryDirectories.push(directory)
    const adapter = new Tencent101Adapter(directory, 'test', vi.fn(async () => new Response('x', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    })))
    await expect(adapter.initialize()).resolves.toMatchObject({ source: 'tencent101', status: 'error', snapshotId: '' })
    expect(adapter.getState().lastError).toContain('2 MiB')
    expect(adapter.getChampions()).toEqual([])
  })

  it('turns an internal request abort into a provider error instead of leaving loading state behind', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-timeout-'))
    temporaryDirectories.push(directory)
    const adapter = new Tencent101Adapter(
      directory,
      'test',
      vi.fn(async () => { throw new DOMException('Aborted', 'AbortError') }),
    )
    await expect(adapter.initialize()).resolves.toMatchObject({ status: 'error', stale: false })
    expect(adapter.getState().lastError).toContain('超时')
  })

  it('reuses a fresh cache across launches and backs off transient failures', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-frequency-'))
    temporaryDirectories.push(directory)
    await new Tencent101Adapter(directory, 'test', validFetcher(), () => 10_000).initialize()

    const freshFetcher = vi.fn(async () => { throw new TypeError('network should not be used') })
    const fresh = new Tencent101Adapter(directory, 'test', freshFetcher, () => 11_000)
    await expect(fresh.initialize()).resolves.toMatchObject({ status: 'ready', stale: false })
    expect(freshFetcher).not.toHaveBeenCalled()

    const emptyDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-backoff-'))
    temporaryDirectories.push(emptyDirectory)
    let now = 20_000
    const failingFetcher = vi.fn(async () => { throw new TypeError('offline') })
    const unavailable = new Tencent101Adapter(emptyDirectory, 'test', failingFetcher, () => now)
    await unavailable.initialize()
    now += 14 * 60 * 1_000
    await unavailable.initialize()
    expect(failingFetcher).toHaveBeenCalledTimes(1)
  })

  it('atomically advances the hero endpoint and cache pointer with the rune statistics date', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-date-'))
    temporaryDirectories.push(directory)
    let date = '20260814'
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('fuwen_aram_rune_rank_v2')) return jsonResponse(runePayload(date))
      if (url.pathname.endsWith('fuwen_aram_hero_rank_v2')) {
        expect(url.searchParams.get('dtstatdate')).toBe(date)
        return jsonResponse(heroPayload())
      }
      if (url.pathname.endsWith('kiwi_augments.json')) return jsonResponse(augmentCatalog())
      return jsonResponse(heroCatalog())
    })
    const adapter = new Tencent101Adapter(directory, 'test', fetcher, () => 5_000)
    const first = await adapter.initialize()
    date = '20260815'
    const second = await adapter.initialize(true)

    expect(first.statisticsDate).toBe('20260814')
    expect(second.statisticsDate).toBe('20260815')
    expect(second.snapshotId).not.toBe(first.snapshotId)
    const pointer = JSON.parse(await readFile(path.join(directory, 'current.json'), 'utf8')) as { statisticsDate: string; snapshotId: string }
    expect(pointer).toMatchObject({ statisticsDate: '20260815', snapshotId: second.snapshotId })
  })

  it('propagates cancellation instead of committing a late source response', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-abort-'))
    temporaryDirectories.push(directory)
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const adapter = new Tencent101Adapter(directory, 'test', fetcher)
    const controller = new AbortController()
    const operation = adapter.initialize(false, controller.signal)
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(adapter.getChampions()).toEqual([])
  })

  it('does not advance the cache when cancellation arrives after all responses resolve', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-late-abort-'))
    temporaryDirectories.push(directory)
    const controller = new AbortController()
    const succeeding = validFetcher()
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const response = await succeeding(input, init)
      if (new URL(String(input)).pathname.endsWith('hero_list.js')) controller.abort()
      return response
    })
    const adapter = new Tencent101Adapter(directory, 'test', fetcher, () => 4_800)

    await expect(adapter.initialize(false, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(readFile(path.join(directory, 'current.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(adapter.getChampions()).toEqual([])
  })

  it('restarts after an aborted single-flight request when Tencent is selected again immediately', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-tencent101-reselect-'))
    temporaryDirectories.push(directory)
    const succeeding = validFetcher()
    let first = true
    let firstStarted!: () => void
    const started = new Promise<void>((resolve) => { firstStarted = resolve })
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (!first) return succeeding(input, init)
      first = false
      firstStarted()
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })
    const adapter = new Tencent101Adapter(directory, 'test', fetcher)
    const oldSelection = new AbortController()
    const aborted = adapter.initialize(false, oldSelection.signal)
    await started
    oldSelection.abort()
    const reselected = adapter.initialize(false, new AbortController().signal)

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    await expect(reselected).resolves.toMatchObject({ source: 'tencent101', status: 'ready' })
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
})
