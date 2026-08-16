import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  LIVE_CLIENT_HOST,
  LIVE_CLIENT_PORT,
  LiveClientAdapter,
  type LiveClientEndpoint,
  liveClientEndpointUrl,
  parseActivePlayerLevel,
} from '../src/main/live-client.js'

describe('Live Client level adapter', () => {
  it('accepts only integer hero levels in the official 1..18 range', () => {
    expect(parseActivePlayerLevel({ level: 1 })).toBe(1)
    expect(parseActivePlayerLevel({ level: 18 })).toBe(18)
    for (const value of [0, 19, 1.5, '8', null, undefined, [], { level: true }]) {
      expect(parseActivePlayerLevel({ level: value })).toBeNull()
    }
  })

  it('uses only the fixed localhost activeplayer endpoint', () => {
    expect(liveClientEndpointUrl('activeplayer')).toBe(
      `https://${LIVE_CLIENT_HOST}:${LIVE_CLIENT_PORT}/liveclientdata/activeplayer`,
    )
    expect(liveClientEndpointUrl('activeplayer')).not.toContain('summoner')
    expect(liveClientEndpointUrl('allgamedata')).toBe(
      `https://${LIVE_CLIENT_HOST}:${LIVE_CLIENT_PORT}/liveclientdata/allgamedata`,
    )
  })

  it('keeps one request in flight and drops aborted work without exposing payloads', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requester = vi.fn(() => new Promise<unknown>((resolve) => { resolveRequest = resolve }))
    const adapter = new LiveClientAdapter(requester)
    const first = adapter.readActivePlayerLevel()
    const second = adapter.readActivePlayerLevel()
    expect(requester).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    resolveRequest?.({ level: 7, summonerName: 'must not escape' })
    await expect(first).resolves.toEqual({ level: 7, code: 'ready' })
  })

  it('returns unavailable for malformed or failed responses', async () => {
    const malformed = new LiveClientAdapter(vi.fn(async () => ({ level: '7', puuid: 'secret' })))
    await expect(malformed.readActivePlayerLevel()).resolves.toEqual({ level: null, code: 'invalid' })
    const failed = new LiveClientAdapter(vi.fn(async () => { throw new Error('connection refused') }))
    await expect(failed.readActivePlayerLevel()).resolves.toEqual({ level: null, code: 'unavailable' })
  })

  it('emits bounded field summaries without identity fields or raw payload values', async () => {
    const adapter = new LiveClientAdapter(vi.fn(async (endpoint) => ({
      level: endpoint === 'activeplayer' ? 9 : undefined,
      summonerName: 'secret-name',
      puuid: 'secret-puuid',
      gameData: { gameMode: 'ARAM', phase: 'InProgress', score: 1.23456 },
      nested: { enabled: true },
    })))
    const result = await adapter.sampleDiagnostics()
    const fields = result.endpoints.flatMap((endpoint) => endpoint.fields)
    expect(result.level).toBe(9)
    expect(fields.some((field) => /name|puuid/i.test(field.path))).toBe(false)
    expect(fields).toContainEqual({ path: 'gameData.phase', type: 'string', value: 'InProgress' })
    expect(fields).toContainEqual({ path: 'nested.enabled', type: 'boolean', value: true })
    expect(JSON.stringify(result)).not.toContain('secret-name')
    expect(JSON.stringify(result)).not.toContain('secret-puuid')
  })

  it('probes allgamedata only through the explicit diagnostic read and redacts player branches', async () => {
    const requester = vi.fn(async (endpoint: LiveClientEndpoint) => endpoint === 'allgamedata'
      ? {
          activePlayer: { level: 3, summonerName: 'secret-name', puuid: 'secret-puuid' },
          allPlayers: [{ summonerName: 'other-secret', championName: 'Annie' }],
          gameData: { gameMode: 'KIWI', gameTime: 61.25, mapNumber: 12 },
          events: [{ EventID: 0, EventTime: 0.03, EventName: 'GameStart' }],
        }
      : { level: endpoint === 'activeplayer' ? 3 : undefined })
    const adapter = new LiveClientAdapter(requester)
    const result = await adapter.sampleDiagnostics()
    expect(requester.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      'activeplayer', 'eventdata', 'gamestats', 'allgamedata',
    ])
    const allGameData = result.endpoints.find((endpoint) => endpoint.endpoint === 'allgamedata')
    expect(allGameData?.status).toBe('ready')
    expect(allGameData?.fields).toContainEqual({ path: 'gameData.gameMode', type: 'string', value: 'KIWI' })
    expect(allGameData?.fields).toContainEqual({ path: 'gameData.gameTime', type: 'number', value: 61.25 })
    expect(JSON.stringify(allGameData)).not.toMatch(/secret|summoner|puuid|allPlayers/i)
  })

  it('aborts a request on stop and classifies the result without raw error text', async () => {
    let rejectRequest: ((error: Error) => void) | undefined
    const requester = vi.fn((_endpoint: LiveClientEndpoint, signal: AbortSignal) => new Promise<unknown>((_resolve, reject) => {
      rejectRequest = reject
      signal.addEventListener('abort', () => reject(new DOMException('raw detail', 'AbortError')), { once: true })
    }))
    const adapter = new LiveClientAdapter(requester)
    const pending = adapter.readActivePlayerLevel()
    adapter.stop()
    rejectRequest?.(new DOMException('raw detail', 'AbortError'))
    await expect(pending).resolves.toEqual({ level: null, code: 'aborted' })
  })

  it('keeps the opt-in private capture local while preserving the complete payload', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hexbridge-live-client-private-'))
    try {
      const adapter = new LiveClientAdapter(vi.fn(async () => ({
        activePlayer: { summonerName: 'private-name', puuid: 'private-puuid', level: 4 },
        allPlayers: [{ summonerName: 'other-private-name', championName: 'Annie' }],
        gameData: { gameMode: 'KIWI', gameTime: 123.4 },
      })))
      const result = await adapter.capturePrivateAllGameData('cards-visible', directory)
      expect(result.ok).toBe(true)
      expect(result.fileName).toMatch(/-cards-visible\.json$/)
      const raw = await readFile(path.join(directory, result.fileName as string), 'utf8')
      expect(raw).toContain('private-puuid')
      expect(raw).toContain('other-private-name')
      expect((await readdir(directory)).length).toBe(2)
      await expect(adapter.clearPrivateAllGameData(directory)).resolves.toEqual({
        ok: true,
        message: '已清除 2 个本机全量采样文件',
      })
      await expect(readdir(directory)).resolves.toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
