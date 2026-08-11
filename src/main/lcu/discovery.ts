import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { logger } from '../logger.js'

const execFileAsync = promisify(execFile)

export interface LcuCredentials {
  port: number
  token: string
  source: 'process' | 'lockfile' | 'log' | 'manual'
  executablePath: string
}

function parseCommandLine(commandLine: string, executablePath = ''): LcuCredentials | null {
  const port = commandLine.match(/--app-port=(\d+)/)?.[1]
  const token = commandLine.match(/--remoting-auth-token=([^\s"']+)/)?.[1]
  if (!port || !token) return null
  return { port: Number(port), token, source: 'process', executablePath }
}

function parseLockfile(content: string, source: LcuCredentials['source'], executablePath = ''): LcuCredentials | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const port = Number(parts[2])
  const token = parts[3]
  if (!port || !token) return null
  return { port, token, source, executablePath }
}

function parseLog(content: string, executablePath = ''): LcuCredentials | null {
  const matches = [...content.matchAll(/https:\/\/riot:([^@\s]+)@127\.0\.0\.1:(\d+)/g)]
  const latest = matches.at(-1)
  if (!latest?.[1] || !latest[2]) return null
  return { port: Number(latest[2]), token: latest[1], source: 'log', executablePath }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function discoverFromDirectory(directory: string, source: 'lockfile' | 'manual'): Promise<LcuCredentials | null> {
  if (!directory) return null
  const candidates = [directory, path.join(directory, 'LeagueClient')]
  for (const candidate of candidates) {
    const lockfile = path.join(candidate, 'lockfile')
    if (await fileExists(lockfile)) {
      const parsed = parseLockfile(await readFile(lockfile, 'utf8'), source, candidate)
      if (parsed) return parsed
    }
  }

  const logDirectories = [
    path.join(directory, 'Logs', 'LeagueClient Logs'),
    path.join(directory, 'Logs'),
    path.join(directory, 'LeagueClient', 'Logs'),
  ]
  for (const logDirectory of logDirectories) {
    try {
      const entries = await readdir(logDirectory)
      const logs = entries.filter((name) => /LeagueClientUx.*\.log$/i.test(name))
      const withStats = await Promise.all(
        logs.map(async (name) => ({ name, mtime: (await stat(path.join(logDirectory, name))).mtimeMs })),
      )
      const latest = withStats.sort((a, b) => b.mtime - a.mtime)[0]
      if (!latest) continue
      const content = await readFile(path.join(logDirectory, latest.name))
      const tail = content.subarray(Math.max(0, content.length - 256 * 1024)).toString('utf8')
      const parsed = parseLog(tail, directory)
      if (parsed) return parsed
    } catch {
      // Try the next known log location.
    }
  }
  return null
}

export async function discoverLcuCredentials(manualDirectory: string): Promise<LcuCredentials | null> {
  if (process.platform === 'win32') {
    try {
      const script = [
        "$p = Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe' OR Name='LeagueClient.exe'\"",
        '$p | Select-Object CommandLine,ExecutablePath | ConvertTo-Json -Compress',
      ].join('; ')
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 2500, windowsHide: true, maxBuffer: 1024 * 1024 },
      )
      const parsedJson = JSON.parse(stdout || '[]') as
        | { CommandLine?: string; ExecutablePath?: string }
        | Array<{ CommandLine?: string; ExecutablePath?: string }>
      const processes = Array.isArray(parsedJson) ? parsedJson : [parsedJson]
      for (const processInfo of processes) {
        const fromCommand = parseCommandLine(
          processInfo.CommandLine ?? '',
          processInfo.ExecutablePath ?? '',
        )
        if (fromCommand) return fromCommand
        const executableDirectory = processInfo.ExecutablePath
          ? path.dirname(processInfo.ExecutablePath)
          : ''
        const fromDirectory = await discoverFromDirectory(executableDirectory, 'lockfile')
        if (fromDirectory) return fromDirectory
      }
    } catch (error) {
      logger.debug('LCU process discovery unavailable', error instanceof Error ? error.message : error)
    }
  }

  if (manualDirectory) return discoverFromDirectory(manualDirectory, 'manual')
  return null
}

export const lcuDiscoveryInternals = { parseCommandLine, parseLockfile, parseLog }
