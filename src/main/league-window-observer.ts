import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import type { BrowserWindow, Rectangle } from 'electron'
import type { LeagueWindowObserverStatus } from '../shared/contracts.js'

export interface LeagueWindowObservation {
  gameForeground: boolean
  clientVisible: boolean
  targetPlaced: boolean
  clientWindowHandle: string | null
}

export interface LeagueWindowObserverOptions {
  enabled: boolean
  target: BrowserWindow | null
  dockTarget: boolean
  discoverClient: boolean
  clientProcessId: number | null
}

export type CompanionDockSide = 'right' | 'left' | 'inside-right'

export const LEAGUE_WINDOW_FOLLOW_INTERVAL_MS = 80
export const LEAGUE_WINDOW_GUARD_INTERVAL_MS = 350
export const LEAGUE_WINDOW_REDISCOVERY_INTERVAL_MS = 1_000

export function calculateCompanionDock(
  client: Rectangle,
  target: Pick<Rectangle, 'width' | 'height'>,
  workArea: Rectangle,
  previousSide: CompanionDockSide | null = null,
): { bounds: Rectangle; side: CompanionDockSide } {
  const gap = 0
  const hysteresis = 24
  const rightSpace = workArea.x + workArea.width - (client.x + client.width)
  const leftSpace = client.x - workArea.x
  const canRight = rightSpace >= target.width + gap
  const canLeft = leftSpace >= target.width + gap
  const keepRight = previousSide === 'right' && rightSpace >= target.width + gap - hysteresis
  const keepLeft = previousSide === 'left' && leftSpace >= target.width + gap - hysteresis
  const side: CompanionDockSide = keepRight || (!keepLeft && canRight)
    ? 'right'
    : keepLeft || canLeft
      ? 'left'
      : 'inside-right'
  const desiredX = side === 'right'
    ? client.x + client.width + gap
    : side === 'left'
      ? client.x - target.width - gap
      : client.x + client.width - target.width
  return {
    side,
    bounds: {
      x: Math.max(workArea.x, Math.min(desiredX, workArea.x + workArea.width - target.width)),
      y: Math.max(workArea.y, Math.min(client.y, workArea.y + workArea.height - target.height)),
      width: target.width,
      height: target.height,
    },
  }
}

const OBSERVER_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$signature = @'
using System;
using System.Runtime.InteropServices;
public static class HexBridgeWindowNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] public static extern int DwmGetWindowAttributeRect(IntPtr hWnd, int attribute, out RECT rect, int size);
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] public static extern int DwmGetWindowAttributeInt(IntPtr hWnd, int attribute, out int value, int size);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
}
'@
Add-Type -TypeDefinition $signature
$dpiReady = $false
try { $dpiReady = [HexBridgeWindowNative]::SetThreadDpiAwarenessContext([IntPtr](-4)) -ne [IntPtr]::Zero } catch {}
$target = [IntPtr]([Int64]$env:HEXBRIDGE_TARGET_HWND)
$followClient = $env:HEXBRIDGE_FOLLOW_CLIENT -eq '1'
$discoverClient = $env:HEXBRIDGE_DISCOVER_CLIENT -eq '1'
[int]$authorityClientPid = 0
[void][int]::TryParse($env:HEXBRIDGE_CLIENT_PID, [ref]$authorityClientPid)
$lastState = ''
$preferredClientPid = 0
$preferredClientHandle = [IntPtr]::Zero
$preferredSide = ''
$lastClientDiscoveryAt = 0L
function Get-HexBridgeVisualRect([IntPtr]$handle) {
  $rect = New-Object HexBridgeWindowNative+RECT
  try {
    $result = [HexBridgeWindowNative]::DwmGetWindowAttributeRect(
      $handle,
      9,
      [ref]$rect,
      [Runtime.InteropServices.Marshal]::SizeOf($rect)
    )
    if ($result -eq 0 -and $rect.Right -gt $rect.Left -and $rect.Bottom -gt $rect.Top) { return $rect }
  } catch {}
  if ([HexBridgeWindowNative]::GetWindowRect($handle, [ref]$rect)) { return $rect }
  return $null
}
function Get-HexBridgeClientCandidate([IntPtr]$handle) {
  if ($handle -eq [IntPtr]::Zero -or -not [HexBridgeWindowNative]::IsWindowVisible($handle) -or [HexBridgeWindowNative]::IsIconic($handle)) { return $null }
  [int]$cloaked = 0
  try {
    $cloakResult = [HexBridgeWindowNative]::DwmGetWindowAttributeInt($handle, 14, [ref]$cloaked, 4)
    if ($cloakResult -ne 0 -or $cloaked -ne 0) { return $null }
  } catch { return $null }
  [uint32]$processId = 0
  [void][HexBridgeWindowNative]::GetWindowThreadProcessId($handle, [ref]$processId)
  if ($processId -le 0 -or ($authorityClientPid -gt 0 -and [int]$processId -ne $authorityClientPid)) { return $null }
  if ([int]$processId -ne $preferredClientPid) {
    try {
      $process = [System.Diagnostics.Process]::GetProcessById([int]$processId)
      if ($process.ProcessName -ne 'LeagueClientUx') { return $null }
    } catch { return $null }
  }
  $rect = Get-HexBridgeVisualRect $handle
  if ($null -eq $rect) { return $null }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 600 -or $height -lt 400) { return $null }
  return @{ Handle = $handle; Rect = $rect; Pid = [int]$processId }
}
while ($true) {
  $gameForeground = $false
  $clientVisible = $false
  $targetPlaced = $false
  try {
    $foreground = [HexBridgeWindowNative]::GetForegroundWindow()
    $foregroundClientPid = 0
    if ($foreground -ne [IntPtr]::Zero) {
      [uint32]$foregroundPid = 0
      [void][HexBridgeWindowNative]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
      if ($foregroundPid -gt 0) {
        $foregroundProcess = [System.Diagnostics.Process]::GetProcessById([int]$foregroundPid)
        $gameForeground = $foregroundProcess.ProcessName -eq 'League of Legends'
        if ($foregroundProcess.ProcessName -eq 'LeagueClientUx') { $foregroundClientPid = [int]$foregroundPid }
      }
    }

    $best = $null
    if (($followClient -or $discoverClient) -and $dpiReady) {
      # Window movement uses the already verified HWND fast path. Full process
      # enumeration remains bounded to once per second so faster docking does
      # not multiply LeagueClientUx discovery cost.
      $best = Get-HexBridgeClientCandidate $preferredClientHandle
      $now = [Environment]::TickCount64
      $needsDiscovery = $lastClientDiscoveryAt -eq 0 -or ($now - $lastClientDiscoveryAt) -ge ${LEAGUE_WINDOW_REDISCOVERY_INTERVAL_MS}
      if ($needsDiscovery) {
        $lastClientDiscoveryAt = $now
        $best = $null
        $sticky = $null
        $bestPriority = -1
        $bestArea = 0L
        foreach ($process in [System.Diagnostics.Process]::GetProcessesByName('LeagueClientUx')) {
          if ($authorityClientPid -gt 0 -and $process.Id -ne $authorityClientPid) { continue }
          $handle = $process.MainWindowHandle
          $candidate = Get-HexBridgeClientCandidate $handle
          if ($null -eq $candidate) { continue }
          $width = $candidate.Rect.Right - $candidate.Rect.Left
          $height = $candidate.Rect.Bottom - $candidate.Rect.Top
          if ($handle -eq $preferredClientHandle) { $sticky = $candidate }
          $area = [int64]$width * [int64]$height
          $priority = if ($authorityClientPid -gt 0 -and $process.Id -eq $authorityClientPid) { 3 } elseif ($process.Id -eq $foregroundClientPid) { 2 } elseif ($process.Id -eq $preferredClientPid) { 1 } else { 0 }
          if ($priority -gt $bestPriority -or ($priority -eq $bestPriority -and $area -gt $bestArea)) {
            $best = $candidate
            $bestPriority = $priority
            $bestArea = $area
          }
        }
        if ($null -ne $sticky -and -not ($authorityClientPid -gt 0 -and $sticky.Pid -ne $authorityClientPid)) {
          $best = $sticky
        }
      }
    }

    if (($followClient -or $discoverClient) -and $null -ne $best) {
      $clientVisible = $true
      $preferredClientPid = $best.Pid
      $preferredClientHandle = $best.Handle
    }

    if ($followClient -and $null -ne $best) {
      $targetRect = Get-HexBridgeVisualRect $target
      if ($null -ne $targetRect) {
        $width = $targetRect.Right - $targetRect.Left
        $height = $targetRect.Bottom - $targetRect.Top
        $monitor = [HexBridgeWindowNative]::MonitorFromWindow($best.Handle, 2)
        $info = New-Object HexBridgeWindowNative+MONITORINFO
        $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
        if ([HexBridgeWindowNative]::GetMonitorInfo($monitor, [ref]$info)) {
          $client = $best.Rect
          $gap = 0
          $hysteresis = 24
          $rightSpace = $info.rcWork.Right - $client.Right
          $leftSpace = $client.Left - $info.rcWork.Left
          $canRight = $rightSpace -ge ($width + $gap)
          $canLeft = $leftSpace -ge ($width + $gap)
          $keepRight = $preferredSide -eq 'right' -and $rightSpace -ge ($width + $gap - $hysteresis)
          $keepLeft = $preferredSide -eq 'left' -and $leftSpace -ge ($width + $gap - $hysteresis)
          if ($keepRight -or (-not $keepLeft -and $canRight)) {
            $preferredSide = 'right'
            $x = $client.Right + $gap
          } elseif ($keepLeft -or $canLeft) {
            $preferredSide = 'left'
            $x = $client.Left - $width - $gap
          } else {
            $preferredSide = 'inside-right'
            $x = $client.Right - $width
          }
          $x = [Math]::Max($info.rcWork.Left, [Math]::Min($x, $info.rcWork.Right - $width))
          $y = $client.Top
          $y = [Math]::Max($info.rcWork.Top, [Math]::Min($y, $info.rcWork.Bottom - $height))
          $alreadyPlaced = [Math]::Abs($targetRect.Left - $x) -le 1 -and [Math]::Abs($targetRect.Top - $y) -le 1
          if ($alreadyPlaced) {
            $targetPlaced = $true
          } else {
            # Reassert the companion's topmost layer while moving it. Electron's
            # alwaysOnTop flag can be lost after a hidden/showInactive cycle;
            # HWND_TOPMOST keeps the panel above the client without activating it.
            $targetPlaced = [HexBridgeWindowNative]::SetWindowPos($target, [IntPtr](-1), $x, $y, 0, 0, 0x211)
          }
        }
      }
    }
  } catch {}
  $clientWindowHandle = if ($clientVisible -and $preferredClientHandle -ne [IntPtr]::Zero) { $preferredClientHandle.ToInt64().ToString() } else { $null }
  $state = @{ gameForeground = $gameForeground; clientVisible = $clientVisible; targetPlaced = $targetPlaced; clientWindowHandle = $clientWindowHandle } | ConvertTo-Json -Compress
  if ($state -ne $lastState) { Write-Output $state; $lastState = $state }
  if ($env:HEXBRIDGE_OBSERVER_ONESHOT -eq '1') { break }
  $interval = if ($followClient) { ${LEAGUE_WINDOW_FOLLOW_INTERVAL_MS} } else { ${LEAGUE_WINDOW_GUARD_INTERVAL_MS} }
  Start-Sleep -Milliseconds $interval
}
`

export function parseLeagueWindowObservation(line: string): LeagueWindowObservation | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    if (
      typeof value.gameForeground !== 'boolean' ||
      typeof value.clientVisible !== 'boolean' ||
      typeof value.targetPlaced !== 'boolean' ||
      !(value.clientWindowHandle === null || (
        typeof value.clientWindowHandle === 'string' && /^[1-9]\d{0,19}$/.test(value.clientWindowHandle)
      ))
    ) return null
    return {
      gameForeground: value.gameForeground,
      clientVisible: value.clientVisible,
      targetPlaced: value.targetPlaced,
      clientWindowHandle: value.clientWindowHandle,
    }
  } catch {
    return null
  }
}

export function leagueWindowObserverRetryDelay(failures: number): number {
  return Math.min(30_000, 1_500 * (2 ** Math.max(0, Math.min(5, Math.trunc(failures)))))
}

function nativeHandle(window: BrowserWindow): string | null {
  try {
    if (typeof window.getNativeWindowHandle !== 'function') return null
    const buffer = window.getNativeWindowHandle()
    if (!Buffer.isBuffer(buffer)) return null
    if (buffer.length >= 8) return buffer.readBigUInt64LE().toString()
    if (buffer.length >= 4) return String(buffer.readUInt32LE())
    return null
  } catch {
    // A window can be destroyed between the caller's liveness check and the
    // native handle read. Missing/invalid handles simply disable observation.
    return null
  }
}

function powershellExecutable(): { executable: string; environment: NodeJS.ProcessEnv } {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return {
    executable: path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    environment: {
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
      PSModulePath: process.env.PSModulePath || '',
    },
  }
}

export async function smokeLeagueWindowObserverScript(): Promise<LeagueWindowObservation> {
  if (process.platform !== 'win32') return { gameForeground: false, clientVisible: false, targetPlaced: false, clientWindowHandle: null }
  const { executable, environment } = powershellExecutable()
  const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', OBSERVER_SCRIPT], {
    windowsHide: true,
    env: {
      ...environment,
      HEXBRIDGE_TARGET_HWND: '1',
      HEXBRIDGE_FOLLOW_CLIENT: '0',
      HEXBRIDGE_DISCOVER_CLIENT: '0',
      HEXBRIDGE_CLIENT_PID: '0',
      HEXBRIDGE_OBSERVER_ONESHOT: '1',
    },
  })
  return new Promise((resolve, reject) => {
    let output = ''
    let stdout = ''
    let settled = false
    const timeout = setTimeout(() => finish(new Error('League window observer smoke timed out')), 8_000)
    const finish = (error?: Error, observation?: LeagueWindowObservation): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (!child.killed) child.kill()
      if (error) reject(error)
      else if (observation) resolve(observation)
      else reject(new Error('League window observer returned no state'))
    }
    child.once('error', (error) => finish(error))
    child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-1_024) })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-2_048)
      const lines = stdout.split(/\r?\n/)
      stdout = lines.pop() ?? ''
      for (const line of lines) {
        const observation = parseLeagueWindowObservation(line.trim())
        if (observation) return finish(undefined, observation)
      }
    })
    child.once('exit', (code) => {
      if (code && code !== 0) finish(new Error(`League window observer exited ${code}: ${output.slice(-160)}`))
    })
  })
}

export async function smokeLeagueWindowObserverFollow(target: BrowserWindow): Promise<void> {
  if (process.platform !== 'win32' || process.env.HEXBRIDGE_SMOKE_FAKE_LEAGUE !== '1') return
  target.setBounds({ x: 8, y: 8, width: 180, height: 100 })
  let clientVisible = false
  let targetPlaced = false
  const smokeClientPid = Number(process.env.HEXBRIDGE_SMOKE_FAKE_LEAGUE_PID)
  const observer = new LeagueWindowObserver((observation) => {
    if (observation.clientVisible) clientVisible = true
    if (observation.targetPlaced) targetPlaced = true
  })
  observer.setEnabled({
    enabled: true,
    target,
    dockTarget: true,
    discoverClient: true,
    clientProcessId: Number.isInteger(smokeClientPid) && smokeClientPid > 0 ? smokeClientPid : null,
  })
  const deadlineAt = Date.now() + 10_000
  let firstFollowedBounds: Rectangle | null = null
  let recoveredFromDisplacement = false
  try {
    while (Date.now() < deadlineAt) {
      if (clientVisible && targetPlaced) {
        const bounds = target.getBounds()
        if (!firstFollowedBounds) {
          firstFollowedBounds = bounds
          target.setBounds({ x: 8, y: 8, width: bounds.width, height: bounds.height })
        } else if (!recoveredFromDisplacement && (Math.abs(bounds.x - 8) >= 20 || Math.abs(bounds.y - 8) >= 20)) {
          recoveredFromDisplacement = true
          firstFollowedBounds = bounds
        }
        else if (
          recoveredFromDisplacement && (
            Math.abs(bounds.x - firstFollowedBounds.x) >= 80 ||
            Math.abs(bounds.y - firstFollowedBounds.y) >= 40
          )
        ) return
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    throw new Error('League window observer did not follow the moving client window')
  } finally {
    observer.stop()
  }
}

export class LeagueWindowObserver {
  private child: ChildProcessWithoutNullStreams | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private wanted = false
  private targetHandle = ''
  private followClient = false
  private discoverClient = false
  private clientProcessId: number | null = null
  private restartFailures = 0
  private observed = false
  private currentChildObserved = false
  private observation: LeagueWindowObservation = {
    gameForeground: false,
    clientVisible: false,
    targetPlaced: false,
    clientWindowHandle: null,
  }

  constructor(private readonly onChanged: (observation: LeagueWindowObservation) => void) {}

  setEnabled(options: LeagueWindowObserverOptions): void {
    if (process.platform !== 'win32') return
    const handle = options.target && !options.target.isDestroyed()
      ? nativeHandle(options.target)
      : null
    const boundedProcessId = Number.isInteger(options.clientProcessId) && Number(options.clientProcessId) > 0
      ? Number(options.clientProcessId)
      : null
    if (
      !options.enabled ||
      (options.dockTarget && !handle) ||
      (options.discoverClient && boundedProcessId == null)
    ) {
      this.stop()
      return
    }
    this.wanted = true
    const targetHandle = options.dockTarget ? handle ?? '' : '0'
    if (
      this.targetHandle === targetHandle &&
      this.followClient === options.dockTarget &&
      this.discoverClient === options.discoverClient &&
      this.clientProcessId === boundedProcessId
    ) {
      if (this.child || this.restartTimer) return
      this.spawnObserver()
      return
    }
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.stopChild()
    this.targetHandle = targetHandle
    this.followClient = options.dockTarget
    this.discoverClient = options.discoverClient
    this.clientProcessId = boundedProcessId
    this.resetObservation()
    this.restartFailures = 0
    this.spawnObserver()
  }

  isGameForeground(): boolean {
    return this.observation.gameForeground
  }

  isClientVisible(): boolean {
    return this.observation.clientVisible
  }

  isTargetPlaced(): boolean {
    return this.observation.targetPlaced
  }

  getClientWindowHandle(): string | null {
    return this.observation.clientWindowHandle
  }

  hasObservation(): boolean {
    return this.observed
  }

  getStatus(): LeagueWindowObserverStatus {
    if (!this.wanted) return 'stopped'
    if (this.restartTimer) return 'retrying'
    if (this.child && this.currentChildObserved) return 'observing'
    return 'starting'
  }

  stop(): void {
    this.wanted = false
    this.targetHandle = ''
    this.followClient = false
    this.discoverClient = false
    this.clientProcessId = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.restartFailures = 0
    this.currentChildObserved = false
    this.stopChild()
    this.resetObservation()
  }

  private spawnObserver(): void {
    if (!this.wanted || !this.targetHandle || this.child) return
    const { executable, environment } = powershellExecutable()
    const targetHandle = this.targetHandle
    const followClient = this.followClient
    const discoverClient = this.discoverClient
    const clientProcessId = this.clientProcessId
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', OBSERVER_SCRIPT], {
      windowsHide: true,
      env: {
        ...environment,
        HEXBRIDGE_TARGET_HWND: targetHandle,
        HEXBRIDGE_FOLLOW_CLIENT: followClient ? '1' : '0',
        HEXBRIDGE_DISCOVER_CLIENT: discoverClient ? '1' : '0',
        HEXBRIDGE_CLIENT_PID: String(clientProcessId ?? 0),
      },
    })
    this.child = child
    this.currentChildObserved = false
    let buffered = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffered = `${buffered}${chunk}`.slice(-2_048)
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const next = parseLeagueWindowObservation(line.trim())
        if (
          next && this.wanted && this.child === child &&
          this.targetHandle === targetHandle && this.followClient === followClient
          && this.discoverClient === discoverClient
          && this.clientProcessId === clientProcessId
        ) {
          this.restartFailures = 0
          this.publish(next)
        }
      }
    })
    child.stderr.resume()
    child.once('close', () => this.handleChildTermination(child))
    child.once('error', () => this.handleChildTermination(child))
  }

  private stopChild(): void {
    const child = this.child
    this.child = null
    this.currentChildObserved = false
    if (child && !child.killed) child.kill()
  }

  private handleChildTermination(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.child = null
    if (!this.wanted || this.restartTimer) return
    const delay = leagueWindowObserverRetryDelay(this.restartFailures)
    this.restartFailures = Math.min(6, this.restartFailures + 1)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.spawnObserver()
      if (this.wanted && this.child) this.onChanged(this.observation)
    }, delay)
    this.onChanged(this.observation)
  }

  private publish(next: LeagueWindowObservation): void {
    const first = !this.observed
    const firstForCurrentChild = !this.currentChildObserved
    this.currentChildObserved = true
    this.observed = true
    if (
      !first &&
      !firstForCurrentChild &&
      next.gameForeground === this.observation.gameForeground &&
      next.clientVisible === this.observation.clientVisible &&
      next.targetPlaced === this.observation.targetPlaced
      && next.clientWindowHandle === this.observation.clientWindowHandle
    ) return
    this.observation = next
    this.onChanged(next)
  }

  private resetObservation(): void {
    const changed = this.observed || this.observation.gameForeground ||
      this.observation.clientVisible || this.observation.targetPlaced ||
      this.observation.clientWindowHandle !== null
    this.observation = {
      gameForeground: false,
      clientVisible: false,
      targetPlaced: false,
      clientWindowHandle: null,
    }
    this.observed = false
    if (changed) this.onChanged(this.observation)
  }
}
