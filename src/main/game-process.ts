import { execFile } from 'node:child_process'

const GAME_PROCESS = 'League of Legends.exe'
export const GAME_PROCESS_EXIT_CONFIRM_MS = 4_000

export type LeagueGameProcessStatus = 'running' | 'not-running' | 'error'
export type GameProcessMatchStage = 'none' | 'selecting' | 'launching' | 'active'

export interface GameProcessMatchContext {
  matchStage: GameProcessMatchStage
  matchGeneration: number
  currentChampionId: number | null
}

export class GameProcessExitGuard {
  private observedRunningKey: string | null = null
  private negativeKey: string | null = null
  private negativeSince: number | null = null

  observe(
    status: LeagueGameProcessStatus,
    context: GameProcessMatchContext,
    now = Date.now(),
  ): boolean {
    const key = context.currentChampionId == null ||
      (context.matchStage !== 'launching' && context.matchStage !== 'active')
      ? null
      : `${context.matchGeneration}:${context.currentChampionId}`

    if (!key) {
      this.reset()
      return false
    }
    if (status === 'running') {
      this.observedRunningKey = key
      this.negativeKey = null
      this.negativeSince = null
      return false
    }
    if (status === 'error') {
      this.negativeKey = null
      this.negativeSince = null
      return false
    }
    if (context.matchStage !== 'active' || this.observedRunningKey !== key) {
      this.negativeKey = null
      this.negativeSince = null
      return false
    }
    if (this.negativeKey !== key || this.negativeSince == null) {
      this.negativeKey = key
      this.negativeSince = now
      return false
    }
    return now - this.negativeSince >= GAME_PROCESS_EXIT_CONFIRM_MS
  }

  reset(): void {
    this.observedRunningKey = null
    this.negativeKey = null
    this.negativeSince = null
  }
}

export function tasklistShowsLeagueGame(output: string): boolean {
  return output
    .split(/\r?\n/)
    .some((line) => /^\s*"?League of Legends\.exe"?\s*,/i.test(line))
}

export async function inspectLeagueGameProcess(): Promise<LeagueGameProcessStatus> {
  if (process.platform !== 'win32') return 'not-running'
  return new Promise<LeagueGameProcessStatus>((resolve) => {
    execFile(
      'tasklist.exe',
      ['/fo', 'csv', '/nh', '/fi', `imagename eq ${GAME_PROCESS}`],
      {
        windowsHide: true,
        timeout: 1_500,
        encoding: 'utf8',
        maxBuffer: 256 * 1_024,
      },
      (error, stdout) => {
        if (error) {
          resolve('error')
          return
        }
        resolve(tasklistShowsLeagueGame(stdout) ? 'running' : 'not-running')
      },
    )
  })
}

export async function isLeagueGameProcessRunning(): Promise<boolean> {
  return (await inspectLeagueGameProcess()) === 'running'
}
