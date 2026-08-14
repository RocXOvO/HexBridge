import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { logger } from '../logger.js'

const execFileAsync = promisify(execFile)
const CIM_TIMEOUT_MS = 2_600
const GET_PROCESS_TIMEOUT_MS = 1_800
const DIAGNOSTIC_LOG_INTERVAL_MS = 30_000
const DIRECTORY_SCAN_TIMEOUT_MS = 600

let lastDiagnosticSignature = ''
let lastDiagnosticAt = 0
let knownDirectoryCache: { expiresAt: number; directories: string[] } | null = null

export interface LcuCredentials {
  port: number
  token: string
  source: 'process' | 'lockfile' | 'log' | 'manual'
  executablePath: string
  /** Internal client-instance hint. Never expose this value to Renderer or logs. */
  processId?: number | null
  /** Internal process creation hint used with PID to avoid PID-reuse collisions. */
  processStartedAt?: string | null
}

interface ProcessRecord {
  Name?: string | null
  ProcessId?: number | null
  CommandLine?: string | null
  ExecutablePath?: string | null
  ProcessStartedAt?: string | null
}

export interface LcuDiscoveryResult {
  candidates: LcuCredentials[]
  summary: string
  processCount: number
  manualConfigured: boolean
  processStrategies: Record<ProcessQueryMethod, ProcessStrategyStatus>
}

export type ProcessQueryMethod = 'cim' | 'get-process'
export type ProcessStrategyStatus = 'ok' | 'empty' | 'unavailable' | 'unparseable' | 'not-run'
type ProcessQueryRunner = (
  method: ProcessQueryMethod,
  script: string,
  timeoutMs: number,
) => Promise<string>

function validPort(value: string | number | undefined): number | null {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
}

function commandLineArgument(commandLine: string, name: string): string | null {
  const expression = new RegExp(
    `(?:^|\\s|")--${name}=(?:"([^"]+)"|'([^']+)'|([^\\s"']+))`,
    'i',
  )
  const match = commandLine.match(expression)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function parseCommandLine(
  commandLine: string,
  executablePath = '',
  processId: number | null = null,
  processStartedAt: string | null = null,
): LcuCredentials | null {
  const port = validPort(commandLineArgument(commandLine, 'app-port') ?? undefined)
  const token = commandLineArgument(commandLine, 'remoting-auth-token')?.trim()
  if (!port || !token) return null
  return { port, token, source: 'process', executablePath, processId, processStartedAt }
}

function parseLockfile(
  content: string,
  source: LcuCredentials['source'],
  executablePath = '',
): LcuCredentials | null {
  const parts = content.replace(/^\uFEFF/, '').trim().split(':')
  if (parts.length < 5 || String(parts[4]).toLowerCase() !== 'https') return null
  const port = validPort(parts[2])
  const token = parts[3]?.trim()
  if (!port || !token) return null
  const processId = positiveProcessId(parts[1])
  return { port, token, source, executablePath, processId, processStartedAt: null }
}

function positiveProcessId(value: unknown): number | null {
  const processId = Number(value)
  return Number.isInteger(processId) && processId > 0 ? processId : null
}

function parseLog(content: string, executablePath = ''): LcuCredentials | null {
  const lines = content.split(/\r?\n/).reverse()
  for (const line of lines) {
    const urls = [...line.matchAll(/https:\/\/riot:([^@\s]+)@127\.0\.0\.1:(\d+)/g)]
    const latestUrl = urls.at(-1)
    const urlPort = validPort(latestUrl?.[2])
    if (latestUrl?.[1] && urlPort) {
      return {
        port: urlPort,
        token: latestUrl[1],
        source: 'log',
        executablePath,
        processId: null,
        processStartedAt: null,
      }
    }
    const command = parseCommandLine(line, executablePath)
    if (command) return { ...command, source: 'log' }
  }
  return null
}

function parseProcessJson(stdout: string): ProcessRecord[] {
  const text = stdout.replace(/^\uFEFF/, '').trim()
  if (!text || text === 'null') return []
  const parsed = JSON.parse(text) as ProcessRecord | ProcessRecord[]
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean)
}

async function defaultProcessQueryRunner(
  _method: ProcessQueryMethod,
  script: string,
  timeoutMs: number,
): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
  )
  return stdout
}

export async function queryLeagueClientProcessesWithRunner(
  runner: ProcessQueryRunner,
  timeoutOverrides: Partial<Record<ProcessQueryMethod, number>> = {},
): Promise<{
  records: ProcessRecord[]
  summary: string
  strategies: Record<ProcessQueryMethod, ProcessStrategyStatus>
}> {
  const encodingScript = [
    '$utf8 = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::OutputEncoding = $utf8',
    '$OutputEncoding = $utf8',
  ]
  const cimScript = [
    ...encodingScript,
    "$ErrorActionPreference='Stop'",
    "$p = Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe' OR Name='LeagueClient.exe'\"",
    "$p | Select-Object Name,ProcessId,CommandLine,ExecutablePath,@{Name='ProcessStartedAt';Expression={if ($_.CreationDate) { ([DateTime]$_.CreationDate).ToUniversalTime().ToString('o') } else { $null }}} | ConvertTo-Json -Compress",
  ].join('; ')
  const processScript = [
    `${encodingScript.join('; ')};`,
    "$ErrorActionPreference='SilentlyContinue';",
    '@(Get-Process -Name LeagueClientUx,LeagueClient -ErrorAction SilentlyContinue)',
    "| Select-Object @{Name='Name';Expression={$_.ProcessName + '.exe'}},@{Name='ProcessId';Expression={$_.Id}},@{Name='ExecutablePath';Expression={$_.Path}},@{Name='CommandLine';Expression={$null}},@{Name='ProcessStartedAt';Expression={if ($_.StartTime) { $_.StartTime.ToUniversalTime().ToString('o') } else { $null }}}",
    '| ConvertTo-Json -Compress',
    '; exit 0',
  ].join(' ')

  const attempts = await Promise.allSettled([
    runner('cim', cimScript, timeoutOverrides.cim ?? CIM_TIMEOUT_MS),
    runner('get-process', processScript, timeoutOverrides['get-process'] ?? GET_PROCESS_TIMEOUT_MS),
  ])
  const labels = ['CIM', 'Get-Process'] as const
  const methods: ProcessQueryMethod[] = ['cim', 'get-process']
  const records: ProcessRecord[] = []
  const statuses: string[] = []
  const strategies: Record<ProcessQueryMethod, ProcessStrategyStatus> = {
    cim: 'unavailable',
    'get-process': 'unavailable',
  }
  attempts.forEach((attempt, index) => {
    const method = methods[index] ?? 'cim'
    if (attempt.status === 'rejected') {
      statuses.push(`${labels[index]} 不可用`)
      strategies[method] = 'unavailable'
      return
    }
    try {
      const parsed = parseProcessJson(attempt.value)
      records.push(...parsed)
      strategies[method] = parsed.length ? 'ok' : 'empty'
      statuses.push(`${labels[index]} ${parsed.length ? `发现 ${parsed.length} 个进程` : '未发现进程'}`)
    } catch {
      statuses.push(`${labels[index]} 返回无法解析`)
      strategies[method] = 'unparseable'
    }
  })

  const merged = new Map<string, ProcessRecord>()
  for (const record of records) {
    const key = `${record.ProcessId ?? 0}:${String(record.Name ?? '').toLowerCase()}`
    const previous = merged.get(key)
    merged.set(key, {
      Name: record.Name ?? previous?.Name,
      ProcessId: record.ProcessId ?? previous?.ProcessId,
      CommandLine: record.CommandLine || previous?.CommandLine,
      ExecutablePath: record.ExecutablePath || previous?.ExecutablePath,
      ProcessStartedAt: record.ProcessStartedAt || previous?.ProcessStartedAt,
    })
  }
  return { records: [...merged.values()], summary: statuses.join('；'), strategies }
}

export async function queryLeagueClientProcesses(
  timeoutOverrides: Partial<Record<ProcessQueryMethod, number>> = {},
): ReturnType<typeof queryLeagueClientProcessesWithRunner> {
  return queryLeagueClientProcessesWithRunner(defaultProcessQueryRunner, timeoutOverrides)
}

async function within<T>(operation: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } catch {
    return fallback
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory()
  } catch {
    return false
  }
}

function parseInstallMetadata(content: string): string[] {
  const values: string[] = []
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:product_install_full_path|product_install_root)\s*:\s*(.+?)\s*$/i)
    const value = match?.[1]?.replace(/^['"]|['"]$/g, '').trim()
    if (value) values.push(value.replaceAll('/', path.sep))
  }
  return uniquePaths(values)
}

async function knownInstallationDirectories(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  if (knownDirectoryCache && knownDirectoryCache.expiresAt > Date.now()) {
    return [...knownDirectoryCache.directories]
  }
  const systemDrive = process.env.SystemDrive?.trim() || 'C:'
  const drives = uniquePaths([systemDrive, 'C:', 'D:', 'E:', 'F:'])
  const candidates = drives.flatMap((drive) => [
    path.join(drive, 'Riot Games', 'League of Legends'),
    path.join(drive, 'WeGameApps', '英雄联盟'),
    path.join(drive, 'Program Files', '腾讯游戏', '英雄联盟'),
    path.join(drive, 'Program Files (x86)', '腾讯游戏', '英雄联盟'),
  ])
  const programData = process.env.ProgramData || process.env.ALLUSERSPROFILE
  if (programData) {
    const metadataPath = path.join(
      programData,
      'Riot Games',
      'Metadata',
      'league_of_legends.live',
      'league_of_legends.live.product_settings.yaml',
    )
    try {
      candidates.push(...parseInstallMetadata(await readFile(metadataPath, 'utf8')))
    } catch {
      // The Tencent client frequently has no Riot product metadata; fixed roots still apply.
    }
  }
  const uniqueCandidates = uniquePaths(candidates)
  const existing = await Promise.all(uniqueCandidates.map((candidate) => directoryExists(candidate)))
  const directories = uniqueCandidates.filter((_candidate, index) => existing[index])
  knownDirectoryCache = { expiresAt: Date.now() + DIAGNOSTIC_LOG_INTERVAL_MS, directories }
  return [...directories]
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((candidate) => {
    const normalized = path.resolve(candidate)
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function directoryRoots(directory: string): string[] {
  if (!directory.trim()) return []
  const root = path.resolve(directory.trim().replace(/^"|"$/g, ''))
  return uniquePaths([root, path.resolve(root, '..'), path.join(root, 'LeagueClient')])
}

function logDirectoryCandidates(root: string): string[] {
  return uniquePaths([
    root,
    path.join(root, 'LeagueClient'),
    path.join(root, 'Logs'),
    path.join(root, 'Logs', 'LeagueClient Logs'),
    path.join(root, 'LeagueClient', 'Logs'),
    path.join(root, 'LeagueClient', 'Logs', 'LeagueClient Logs'),
  ])
}

async function credentialsFromDirectory(
  directory: string,
  source: 'lockfile' | 'manual',
): Promise<LcuCredentials[]> {
  const roots = directoryRoots(directory)
  const found: LcuCredentials[] = []
  for (const root of roots) {
    const lockfile = path.join(root, 'lockfile')
    try {
      if (await fileExists(lockfile)) {
        const parsed = parseLockfile(await readFile(lockfile, 'utf8'), source, root)
        if (parsed) found.push(parsed)
      }
    } catch {
      // Inaccessible candidates are expected when client/app privilege levels differ.
    }
  }

  const logFiles = new Map<string, { path: string; mtime: number }>()
  const logDirectories = uniquePaths(roots.flatMap((root) => logDirectoryCandidates(root)))
  for (const logDirectory of logDirectories) {
    try {
      for (const entry of await readdir(logDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !/LeagueClientUx.*\.log$/i.test(entry.name)) continue
        const filePath = path.join(logDirectory, entry.name)
        const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath
        if (!logFiles.has(key)) logFiles.set(key, { path: filePath, mtime: (await stat(filePath)).mtimeMs })
      }
    } catch {
      // Continue through the bounded set of known locations.
    }
  }
  for (const item of [...logFiles.values()].sort((a, b) => b.mtime - a.mtime).slice(0, 6)) {
    try {
      const content = await readFile(item.path)
      const tail = content.subarray(Math.max(0, content.length - 512 * 1024)).toString('utf8')
      const parsed = parseLog(tail, path.dirname(item.path))
      if (parsed) found.push(parsed)
    } catch {
      // Try the next recent log.
    }
  }
  return found
}

export async function collectDirectoryCredentials(
  directories: string[],
  source: 'lockfile' | 'manual',
  reader: typeof credentialsFromDirectory = credentialsFromDirectory,
): Promise<LcuCredentials[]> {
  const results = await Promise.all(
    uniquePaths(directories).map((directory) =>
      within(reader(directory, source), DIRECTORY_SCAN_TIMEOUT_MS, []),
    ),
  )
  return results.flat()
}

function dedupeCredentials(credentials: LcuCredentials[]): LcuCredentials[] {
  const seen = new Set<string>()
  return credentials.filter((candidate) => {
    const key = `${candidate.port}:${candidate.token}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function discoverLcuCredentials(manualDirectory: string): Promise<LcuDiscoveryResult> {
  const all: LcuCredentials[] = []
  let processCount = 0
  let processSummary = process.platform === 'win32' ? '进程查询未执行' : '当前不是 Windows'
  let processStrategies: Record<ProcessQueryMethod, ProcessStrategyStatus> = {
    cim: 'not-run',
    'get-process': 'not-run',
  }
  const manualConfigured = Boolean(manualDirectory.trim())
  const manualTask = manualConfigured
    ? within(credentialsFromDirectory(manualDirectory, 'manual'), 900, [])
    : Promise.resolve([])
  const knownDirectoryTask = process.platform === 'win32'
    ? within(knownInstallationDirectories(), 700, [])
    : Promise.resolve([])
  const knownCredentialTask = knownDirectoryTask.then((directories) =>
    collectDirectoryCredentials(directories, 'lockfile'),
  )

  if (process.platform === 'win32') {
    try {
      const processResult = await queryLeagueClientProcesses()
      processSummary = processResult.summary
      processStrategies = processResult.strategies
      const processes = [...processResult.records].sort((a, b) =>
        Number(String(b.Name).toLowerCase() === 'leagueclientux.exe') -
        Number(String(a.Name).toLowerCase() === 'leagueclientux.exe'),
      )
      processCount = processes.length
      const processDirectories: string[] = []
      for (const processInfo of processes) {
        const fromCommand = parseCommandLine(
          processInfo.CommandLine ?? '',
          processInfo.ExecutablePath ?? '',
          positiveProcessId(processInfo.ProcessId),
          processInfo.ProcessStartedAt ?? null,
        )
        if (fromCommand) all.push(fromCommand)
        if (processInfo.ExecutablePath) {
          processDirectories.push(path.dirname(processInfo.ExecutablePath))
        }
      }
      all.push(...await collectDirectoryCredentials(processDirectories, 'lockfile'))
    } catch (error) {
      processSummary = 'Windows 进程查询失败'
      logger.debug('LCU process discovery unavailable', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
    }
  }

  all.push(...await manualTask)
  const knownDirectories = await knownDirectoryTask
  all.push(...await knownCredentialTask)
  const candidates = dedupeCredentials(all)
  const manualText = manualConfigured ? '已检查手动目录' : '未配置手动目录'
  const knownText = knownDirectories.length
    ? `已检查 ${knownDirectories.length} 个常见安装位置`
    : '未发现常见安装位置'
  const summary = candidates.length
    ? `${processSummary}；${manualText}；${knownText}；找到 ${candidates.length} 个凭据候选`
    : `${processSummary}；${manualText}；${knownText}；未找到可用的 LCU 凭据`
  const diagnostic = {
    processCount,
    candidateCount: candidates.length,
    manualConfigured,
  }
  const signature = JSON.stringify(diagnostic)
  const now = Date.now()
  if (signature !== lastDiagnosticSignature || now - lastDiagnosticAt >= DIAGNOSTIC_LOG_INTERVAL_MS) {
    logger.debug('LCU discovery completed', diagnostic)
    lastDiagnosticSignature = signature
    lastDiagnosticAt = now
  }
  return { candidates, summary, processCount, manualConfigured, processStrategies }
}

export const lcuDiscoveryInternals = {
  commandLineArgument,
  parseCommandLine,
  parseLockfile,
  parseLog,
  parseProcessJson,
  parseInstallMetadata,
  directoryRoots,
  credentialsFromDirectory,
  knownInstallationDirectories,
}
