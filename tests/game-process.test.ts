import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GAME_PROCESS_ACTIVE_POLL_MS,
  GAME_PROCESS_EXIT_CONFIRM_MS,
  GAME_PROCESS_LAUNCHING_POLL_MS,
  GameProcessExitGuard,
  gameProcessPollInterval,
  isLeagueGameProcessRunning,
  tasklistShowsLeagueGame,
} from '../src/main/game-process.js'

describe('game process polling budget', () => {
  it('avoids the old two-second process spawn throughout active games', () => {
    expect(gameProcessPollInterval('selecting')).toBeNull()
    expect(gameProcessPollInterval('launching')).toBe(GAME_PROCESS_LAUNCHING_POLL_MS)
    expect(gameProcessPollInterval('active')).toBe(GAME_PROCESS_ACTIVE_POLL_MS)
    expect(GAME_PROCESS_LAUNCHING_POLL_MS).toBeGreaterThanOrEqual(3_000)
    expect(GAME_PROCESS_ACTIVE_POLL_MS).toBeGreaterThanOrEqual(10_000)
  })
})

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (child.exitCode != null || child.signalCode != null) return true
  return Promise.race([
    once(child, 'exit').then(() => true).catch(() => true),
    delay(milliseconds).then(() => false),
  ])
}

describe('League game process evidence', () => {
  it('requires a real running observation and continuous negative grace before clearing', () => {
    const guard = new GameProcessExitGuard()
    const context = { matchStage: 'active' as const, matchGeneration: 4, currentChampionId: 103 }

    expect(guard.observe('not-running', context, 1_000)).toBe(false)
    expect(guard.observe('running', context, 2_000)).toBe(false)
    expect(guard.observe('not-running', context, 3_000)).toBe(false)
    expect(guard.observe('not-running', context, 3_000 + GAME_PROCESS_EXIT_CONFIRM_MS - 1)).toBe(false)
    expect(guard.observe('not-running', context, 3_000 + GAME_PROCESS_EXIT_CONFIRM_MS)).toBe(true)
  })

  it('does not treat errors as exit evidence and isolates match generations', () => {
    const guard = new GameProcessExitGuard()
    const first = { matchStage: 'active' as const, matchGeneration: 4, currentChampionId: 103 }
    const second = { matchStage: 'active' as const, matchGeneration: 5, currentChampionId: 81 }

    guard.observe('running', first, 1_000)
    guard.observe('not-running', first, 2_000)
    expect(guard.observe('error', first, 10_000)).toBe(false)
    expect(guard.observe('not-running', first, 11_000)).toBe(false)
    expect(guard.observe('not-running', second, 20_000)).toBe(false)
    expect(guard.observe('not-running', second, 30_000)).toBe(false)
  })

  it('never clears launching matches that have not reached active', () => {
    const guard = new GameProcessExitGuard()
    const context = { matchStage: 'launching' as const, matchGeneration: 4, currentChampionId: 103 }
    guard.observe('running', context, 1_000)
    expect(guard.observe('not-running', context, 20_000)).toBe(false)
  })

  it('accepts only a CSV task row for the actual game executable', () => {
    expect(tasklistShowsLeagueGame('"League of Legends.exe","8124","Console","1","2,014,220 K"')).toBe(true)
    expect(tasklistShowsLeagueGame('"LeagueClientUx.exe","8124","Console","1","220,000 K"')).toBe(false)
    expect(tasklistShowsLeagueGame('信息: 没有运行的任务匹配指定标准。')).toBe(false)
    expect(tasklistShowsLeagueGame('Filter: imagename eq League of Legends.exe')).toBe(false)
  })

  it.runIf(process.platform === 'win32')(
    'detects a real Windows process whose image name matches the game client',
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-game-process-'))
      const executable = path.join(directory, 'League of Legends.exe')
      let child: ChildProcess | null = null
      try {
        await copyFile(process.execPath, executable)
        child = spawn(
          executable,
          ['-e', 'setInterval(() => undefined, 1000)'],
          { stdio: 'ignore', windowsHide: true },
        )
        await once(child, 'spawn')
        const deadline = Date.now() + 5_000
        let detected = false
        while (!detected && Date.now() < deadline) {
          detected = await isLeagueGameProcessRunning()
          if (!detected) await delay(100)
        }
        expect(detected).toBe(true)
        expect(child.exitCode).toBeNull()
        expect(child.signalCode).toBeNull()
      } finally {
        if (child && child.exitCode == null && child.signalCode == null) {
          child.kill()
          if (!(await waitForExit(child, 2_000)) && child.pid) {
            const killer = spawn(
              'taskkill.exe',
              ['/pid', String(child.pid), '/T', '/F'],
              { stdio: 'ignore', windowsHide: true },
            )
            await waitForExit(killer, 3_000)
            await waitForExit(child, 2_000)
          }
        }
        await rm(directory, { recursive: true, force: true })
      }
    },
    30_000,
  )
})
