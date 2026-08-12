import { execFile } from 'node:child_process'

const GAME_PROCESS = 'League of Legends.exe'

export function tasklistShowsLeagueGame(output: string): boolean {
  return output
    .split(/\r?\n/)
    .some((line) => /^\s*"?League of Legends\.exe"?\s*,/i.test(line))
}

export async function isLeagueGameProcessRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const output = await new Promise<string>((resolve) => {
    execFile(
      'tasklist.exe',
      ['/fo', 'csv', '/nh', '/fi', `imagename eq ${GAME_PROCESS}`],
      {
        windowsHide: true,
        timeout: 1_500,
        encoding: 'utf8',
        maxBuffer: 256 * 1_024,
      },
      (error, stdout) => resolve(error ? '' : stdout),
    )
  })
  return tasklistShowsLeagueGame(output)
}
