import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import type { BrowserWindow, Rectangle } from 'electron'

export interface LeagueWindowObservation {
  gameForeground: boolean
  clientVisible: boolean
  targetPlaced: boolean
}

export type CompanionDockSide = 'right' | 'left' | 'inside-right'

export function calculateCompanionDock(
  client: Rectangle,
  target: Pick<Rectangle, 'width' | 'height'>,
  workArea: Rectangle,
  previousSide: CompanionDockSide | null = null,
): { bounds: Rectangle; side: CompanionDockSide } {
  const gap = 4
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
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rect, int size);
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
[int]$authorityClientPid = 0
[void][int]::TryParse($env:HEXBRIDGE_CLIENT_PID, [ref]$authorityClientPid)
$lastState = ''
$preferredClientPid = 0
$preferredClientHandle = [IntPtr]::Zero
$preferredSide = ''
function Get-HexBridgeVisualRect([IntPtr]$handle) {
  $rect = New-Object HexBridgeWindowNative+RECT
  try {
    $result = [HexBridgeWindowNative]::DwmGetWindowAttribute(
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
    if ($followClient -and $dpiReady) {
      $sticky = $null
      $bestPriority = -1
      $bestArea = 0L
      foreach ($process in [System.Diagnostics.Process]::GetProcessesByName('LeagueClientUx')) {
        $handle = $process.MainWindowHandle
        if ($handle -eq [IntPtr]::Zero -or -not [HexBridgeWindowNative]::IsWindowVisible($handle) -or [HexBridgeWindowNative]::IsIconic($handle)) { continue }
        $rect = Get-HexBridgeVisualRect $handle
        if ($null -eq $rect) { continue }
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top
        if ($width -lt 600 -or $height -lt 400) { continue }
        $candidate = @{ Handle = $handle; Rect = $rect; Pid = $process.Id }
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

    if ($followClient -and $null -ne $best) {
      $clientVisible = $true
      $preferredClientPid = $best.Pid
      $preferredClientHandle = $best.Handle
      $targetRect = Get-HexBridgeVisualRect $target
      if ($null -ne $targetRect) {
        $width = $targetRect.Right - $targetRect.Left
        $height = $targetRect.Bottom - $targetRect.Top
        $monitor = [HexBridgeWindowNative]::MonitorFromWindow($best.Handle, 2)
        $info = New-Object HexBridgeWindowNative+MONITORINFO
        $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
        if ([HexBridgeWindowNative]::GetMonitorInfo($monitor, [ref]$info)) {
          $client = $best.Rect
          $gap = 4
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
            $targetPlaced = [HexBridgeWindowNative]::SetWindowPos($target, [IntPtr]::Zero, $x, $y, 0, 0, 0x215)
          }
        }
      }
    }
  } catch {}
  $state = @{ gameForeground = $gameForeground; clientVisible = $clientVisible; targetPlaced = $targetPlaced } | ConvertTo-Json -Compress
  if ($state -ne $lastState) { Write-Output $state; $lastState = $state }
  if ($env:HEXBRIDGE_OBSERVER_ONESHOT -eq '1') { break }
  Start-Sleep -Milliseconds 350
}
`

export function parseLeagueWindowObservation(line: string): LeagueWindowObservation | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    if (
      typeof value.gameForeground !== 'boolean' ||
      typeof value.clientVisible !== 'boolean' ||
      typeof value.targetPlaced !== 'boolean'
    ) return null
    return {
      gameForeground: value.gameForeground,
      clientVisible: value.clientVisible,
      targetPlaced: value.targetPlaced,
    }
  } catch {
    return null
  }
}

export function leagueWindowObserverRetryDelay(failures: number): number {
  return Math.min(30_000, 1_500 * (2 ** Math.max(0, Math.min(5, Math.trunc(failures)))))
}

function nativeHandle(window: BrowserWindow): string | null {
  const buffer = window.getNativeWindowHandle()
  if (buffer.length >= 8) return buffer.readBigUInt64LE().toString()
  if (buffer.length >= 4) return String(buffer.readUInt32LE())
  return null
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
  if (process.platform !== 'win32') return { gameForeground: false, clientVisible: false, targetPlaced: false }
  const { executable, environment } = powershellExecutable()
  const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', OBSERVER_SCRIPT], {
    windowsHide: true,
    env: {
      ...environment,
      HEXBRIDGE_TARGET_HWND: '1',
      HEXBRIDGE_FOLLOW_CLIENT: '0',
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
  observer.setEnabled(
    true,
    target,
    true,
    Number.isInteger(smokeClientPid) && smokeClientPid > 0 ? smokeClientPid : null,
  )
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
  private clientProcessId: number | null = null
  private restartFailures = 0
  private observed = false
  private observation: LeagueWindowObservation = {
    gameForeground: false,
    clientVisible: false,
    targetPlaced: false,
  }

  constructor(private readonly onChanged: (observation: LeagueWindowObservation) => void) {}

  setEnabled(
    enabled: boolean,
    target: BrowserWindow | null,
    followClient: boolean,
    clientProcessId: number | null = null,
  ): void {
    if (process.platform !== 'win32') return
    const handle = target && !target.isDestroyed() ? nativeHandle(target) : null
    if (!enabled || !handle) {
      this.stop()
      return
    }
    this.wanted = true
    const boundedProcessId = Number.isInteger(clientProcessId) && Number(clientProcessId) > 0
      ? Number(clientProcessId)
      : null
    if (
      this.targetHandle === handle &&
      this.followClient === followClient &&
      this.clientProcessId === boundedProcessId
    ) {
      if (this.child || this.restartTimer) return
      this.spawnObserver()
      return
    }
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.stopChild()
    this.targetHandle = handle
    this.followClient = followClient
    this.clientProcessId = boundedProcessId
    this.observed = false
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

  hasObservation(): boolean {
    return this.observed
  }

  stop(): void {
    this.wanted = false
    this.targetHandle = ''
    this.followClient = false
    this.clientProcessId = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.restartFailures = 0
    this.stopChild()
    const changed = this.observation.gameForeground ||
      this.observation.clientVisible || this.observation.targetPlaced
    this.observation = { gameForeground: false, clientVisible: false, targetPlaced: false }
    this.observed = false
    if (changed) this.onChanged(this.observation)
  }

  private spawnObserver(): void {
    if (!this.wanted || !this.targetHandle || this.child) return
    const { executable, environment } = powershellExecutable()
    const targetHandle = this.targetHandle
    const followClient = this.followClient
    const clientProcessId = this.clientProcessId
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', OBSERVER_SCRIPT], {
      windowsHide: true,
      env: {
        ...environment,
        HEXBRIDGE_TARGET_HWND: targetHandle,
        HEXBRIDGE_FOLLOW_CLIENT: followClient ? '1' : '0',
        HEXBRIDGE_CLIENT_PID: String(clientProcessId ?? 0),
      },
    })
    this.child = child
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
    }, delay)
  }

  private publish(next: LeagueWindowObservation): void {
    const first = !this.observed
    this.observed = true
    if (
      !first &&
      next.gameForeground === this.observation.gameForeground &&
      next.clientVisible === this.observation.clientVisible &&
      next.targetPlaced === this.observation.targetPlaced
    ) return
    this.observation = next
    this.onChanged(next)
  }
}
