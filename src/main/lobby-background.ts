import { createHash } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import sharp from 'sharp'
import type {
  GameflowPhase,
  LobbyBackgroundFrame,
  MatchContextStage,
  VisualMode,
} from '../shared/contracts.js'
import { LeagueWindowObserver } from './league-window-observer.js'

export const LOBBY_BACKGROUND_CAPTURE_INTERVAL_MS = 5_000
export const LOBBY_BACKGROUND_CAPTURE_TIMEOUT_MS = 9_000
export const LOBBY_BACKGROUND_SANITIZE_TIMEOUT_MS = 3_000
export const LOBBY_BACKGROUND_MAX_RAW_BYTES = 800_000
export const LOBBY_BACKGROUND_MAX_RENDERER_BYTES = 500_000

const ALLOWED_PHASES = new Set<GameflowPhase>(['Lobby', 'Matchmaking', 'ReadyCheck'])

export interface LobbyBackgroundEligibilityInput {
  platform?: NodeJS.Platform
  settingEnabled: boolean
  lcuConnected: boolean
  phase: GameflowPhase
  matchStage: MatchContextStage
  mainVisible: boolean
  mainFocused: boolean
  mainMinimized: boolean
  livePageVisible: boolean
  rendererReducedMotion: boolean
  systemReducedMotion: boolean
  activeVisualMode: VisualMode
  authorityClientPid: number | null
}

export function shouldDiscoverLobbyBackground(input: LobbyBackgroundEligibilityInput): boolean {
  return (input.platform ?? process.platform) === 'win32' &&
    input.settingEnabled &&
    input.lcuConnected &&
    input.matchStage === 'none' &&
    ALLOWED_PHASES.has(input.phase) &&
    input.mainVisible &&
    input.mainFocused &&
    !input.mainMinimized &&
    input.livePageVisible &&
    !input.rendererReducedMotion &&
    !input.systemReducedMotion &&
    input.activeVisualMode !== 'eco' &&
    Number.isInteger(input.authorityClientPid) &&
    Number(input.authorityClientPid) > 0
}

interface CaptureLine {
  frame: Buffer
}

export function parseLobbyBackgroundCaptureLine(line: string): CaptureLine | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    if (value.ok !== true || typeof value.frame !== 'string') return null
    if (value.frame.length < 16 || value.frame.length > Math.ceil(LOBBY_BACKGROUND_MAX_RAW_BYTES * 4 / 3) + 8) return null
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value.frame)) return null
    const frame = Buffer.from(value.frame, 'base64')
    if (frame.length < 8 || frame.length > LOBBY_BACKGROUND_MAX_RAW_BYTES) return null
    return { frame }
  } catch {
    return null
  }
}

export async function sanitizeLobbyBackgroundFrame(input: Buffer): Promise<Buffer> {
  const output = await sharp(input, { failOn: 'error', limitInputPixels: 16_777_216 })
    .resize({ width: 960, height: 540, fit: 'inside', withoutEnlargement: true })
    .blur(9)
    .modulate({ brightness: 0.52, saturation: 0.62 })
    .jpeg({ quality: 48, chromaSubsampling: '4:2:0', progressive: false })
    .toBuffer()
  if (output.length < 8 || output.length > LOBBY_BACKGROUND_MAX_RENDERER_BYTES) {
    throw new Error('Lobby background frame exceeded its bounded renderer payload')
  }
  return output
}

export const LOBBY_BACKGROUND_CAPTURE_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
$signature = @'
using System;
using System.Runtime.InteropServices;
public static class HexBridgeLobbyCaptureNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] public static extern int DwmGetWindowAttributeInt(IntPtr hWnd, int attribute, out int value, int size);
}
'@
Add-Type -TypeDefinition $signature
try { [void][HexBridgeLobbyCaptureNative]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch {}
$handle = [IntPtr]([Int64]$env:HEXBRIDGE_CAPTURE_HWND)
[int]$authorityPid = 0
[void][int]::TryParse($env:HEXBRIDGE_CAPTURE_PID, [ref]$authorityPid)
function Write-HexBridgeFailure {
  @{ ok = $false } | ConvertTo-Json -Compress | Write-Output
}
function Get-HexBridgeFrame {
  if ($handle -eq [IntPtr]::Zero -or $authorityPid -le 0) { return $null }
  if (-not [HexBridgeLobbyCaptureNative]::IsWindowVisible($handle) -or [HexBridgeLobbyCaptureNative]::IsIconic($handle)) { return $null }
  [uint32]$actualPid = 0
  [void][HexBridgeLobbyCaptureNative]::GetWindowThreadProcessId($handle, [ref]$actualPid)
  if ([int]$actualPid -ne $authorityPid) { return $null }
  try {
    $process = [System.Diagnostics.Process]::GetProcessById($authorityPid)
    if ($process.ProcessName -ne 'LeagueClientUx') { return $null }
  } catch { return $null }
  [int]$cloaked = 0
  try {
    $cloakResult = [HexBridgeLobbyCaptureNative]::DwmGetWindowAttributeInt($handle, 14, [ref]$cloaked, 4)
    if ($cloakResult -ne 0 -or $cloaked -ne 0) { return $null }
  } catch { return $null }
  $rect = New-Object HexBridgeLobbyCaptureNative+RECT
  if (-not [HexBridgeLobbyCaptureNative]::GetWindowRect($handle, [ref]$rect)) { return $null }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $pixels = [int64]$width * [int64]$height
  if ($width -lt 600 -or $height -lt 400 -or $width -gt 7680 -or $height -gt 4320 -or $pixels -gt 16777216) { return $null }
  $bitmap = $null
  $graphics = $null
  $scaled = $null
  $scaledGraphics = $null
  $stream = $null
  $encoderParameters = $null
  try {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    try {
      if (-not [HexBridgeLobbyCaptureNative]::PrintWindow($handle, $hdc, 2)) { return $null }
    } finally {
      $graphics.ReleaseHdc($hdc)
    }
    $scale = [Math]::Min(1.0, 960.0 / [double]$width)
    $scaledWidth = [Math]::Max(1, [int][Math]::Round($width * $scale))
    $scaledHeight = [Math]::Max(1, [int][Math]::Round($height * $scale))
    $scaled = [System.Drawing.Bitmap]::new($scaledWidth, $scaledHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaled)
    $scaledGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $scaledGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Low
    $scaledGraphics.DrawImage($bitmap, 0, 0, $scaledWidth, $scaledHeight)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    if ($null -eq $codec) { return $null }
    $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [int64]55)
    $stream = [System.IO.MemoryStream]::new()
    $scaled.Save($stream, $codec, $encoderParameters)
    $bytes = $stream.ToArray()
    if ($bytes.Length -lt 8 -or $bytes.Length -gt ${LOBBY_BACKGROUND_MAX_RAW_BYTES}) { return $null }
    return [Convert]::ToBase64String($bytes)
  } catch { return $null }
  finally {
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $encoderParameters) { $encoderParameters.Dispose() }
    if ($null -ne $scaledGraphics) { $scaledGraphics.Dispose() }
    if ($null -ne $scaled) { $scaled.Dispose() }
    if ($null -ne $graphics) { $graphics.Dispose() }
    if ($null -ne $bitmap) { $bitmap.Dispose() }
  }
}
while ($true) {
  $frame = Get-HexBridgeFrame
  if ($null -eq $frame) { Write-HexBridgeFailure; break }
  @{ ok = $true; frame = $frame } | ConvertTo-Json -Compress | Write-Output
  if ($env:HEXBRIDGE_CAPTURE_ONESHOT -eq '1') { break }
  Start-Sleep -Milliseconds ${LOBBY_BACKGROUND_CAPTURE_INTERVAL_MS}
}
`

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

export interface LobbyBackgroundControllerDependencies {
  platform?: NodeJS.Platform
  spawnCapture?: (authorityPid: number, windowHandle: string) => ChildProcessWithoutNullStreams
  sanitizeFrame?: (input: Buffer) => Promise<Buffer>
}

function spawnLobbyBackgroundCapture(
  authorityPid: number,
  windowHandle: string,
  oneshot = false,
): ChildProcessWithoutNullStreams {
  const { executable, environment } = powershellExecutable()
  return spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LOBBY_BACKGROUND_CAPTURE_SCRIPT], {
    windowsHide: true,
    env: {
      ...environment,
      HEXBRIDGE_CAPTURE_PID: String(authorityPid),
      HEXBRIDGE_CAPTURE_HWND: windowHandle,
      HEXBRIDGE_CAPTURE_ONESHOT: oneshot ? '1' : '0',
    },
  })
}

export async function smokeLobbyBackgroundCapture(authorityPid: number): Promise<void> {
  if (process.platform !== 'win32') return
  if (!Number.isInteger(authorityPid) || authorityPid <= 0) {
    throw new Error('Lobby background smoke requires an authority client PID')
  }
  let observer: LeagueWindowObserver | null = null
  let discoveryTimeout: NodeJS.Timeout | null = null
  const windowHandle = await new Promise<string>((resolve, reject) => {
    const finish = (error?: Error, handle?: string): void => {
      if (discoveryTimeout) clearTimeout(discoveryTimeout)
      observer?.stop()
      if (error) reject(error)
      else if (handle) resolve(handle)
      else reject(new Error('Lobby background smoke did not discover the authority HWND'))
    }
    observer = new LeagueWindowObserver((observation) => {
      if (observation.clientVisible && observation.clientWindowHandle) {
        finish(undefined, observation.clientWindowHandle)
      }
    })
    observer.setEnabled({
      enabled: true,
      target: null,
      dockTarget: false,
      discoverClient: true,
      clientProcessId: authorityPid,
    })
    discoveryTimeout = setTimeout(
      () => finish(new Error('Lobby background smoke authority discovery timed out')),
      8_000,
    )
  })

  const captureOnce = (candidatePid: number): Promise<Buffer | null> => {
    const child = spawnLobbyBackgroundCapture(candidatePid, windowHandle, true)
    return new Promise((resolve, reject) => {
      let buffered = ''
      let settled = false
      const timeout = setTimeout(() => finish(new Error('Lobby background smoke capture timed out')), 8_000)
      const finish = (error?: Error, frame?: Buffer | null): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (!child.killed) child.kill()
        if (error) reject(error)
        else resolve(frame ?? null)
      }
      child.once('error', (error) => finish(error))
      child.stderr.resume()
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (buffered.length + chunk.length > 1_200_000) {
          finish(new Error('Lobby background smoke capture exceeded its output bound'))
          return
        }
        buffered += chunk
        const lines = buffered.split(/\r?\n/)
        buffered = lines.pop() ?? ''
        for (const line of lines) {
          let envelope: Record<string, unknown>
          try {
            envelope = JSON.parse(line.trim()) as Record<string, unknown>
          } catch {
            finish(new Error('Lobby background smoke capture returned invalid JSON'))
            return
          }
          if (envelope.ok === false) {
            finish(undefined, null)
            return
          }
          const parsed = parseLobbyBackgroundCaptureLine(line.trim())
          if (!parsed) {
            finish(new Error('Lobby background smoke capture returned an invalid frame'))
            return
          }
          finish(undefined, parsed.frame)
          return
        }
      })
      child.once('close', (code) => {
        if (!settled) finish(new Error(`Lobby background smoke capture exited ${code ?? 'without output'}`))
      })
    })
  }

  const wrongPid = authorityPid === 2_147_483_647 ? authorityPid - 1 : authorityPid + 1
  if (await captureOnce(wrongPid)) {
    throw new Error('Lobby background smoke accepted an HWND owned by another PID')
  }
  const captured = await captureOnce(authorityPid)
  if (!captured) throw new Error('Lobby background smoke rejected the authority HWND')
  const frame = await sanitizeLobbyBackgroundFrame(captured)
  const metadata = await sharp(frame).metadata()
  if (
    metadata.format !== 'jpeg' || !metadata.width || !metadata.height ||
    metadata.width > 960 || metadata.height > 540
  ) throw new Error('Lobby background smoke sanitizer returned invalid metadata')
}

export class LobbyBackgroundController {
  private child: ChildProcessWithoutNullStreams | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private watchdog: NodeJS.Timeout | null = null
  private wanted = false
  private authorityPid: number | null = null
  private windowHandle: string | null = null
  private epoch = 0
  private failures = 0
  private processing = false
  private pendingRestartDelay: number | null = null
  private lastRawHash = ''
  private lastRendererHash = ''
  private currentFrame: LobbyBackgroundFrame | null = null

  constructor(
    private readonly onChanged: (frame: LobbyBackgroundFrame | null) => void,
    private readonly dependencies: LobbyBackgroundControllerDependencies = {},
  ) {}

  update(enabled: boolean, authorityPid: number | null, windowHandle: string | null): void {
    const boundedPid = Number.isInteger(authorityPid) && Number(authorityPid) > 0 ? Number(authorityPid) : null
    const boundedHandle = typeof windowHandle === 'string' && /^[1-9]\d{0,19}$/.test(windowHandle)
      ? windowHandle
      : null
    if ((this.dependencies.platform ?? process.platform) !== 'win32' || !enabled || boundedPid == null || boundedHandle == null) {
      this.stop()
      return
    }
    if (this.wanted && this.authorityPid === boundedPid && this.windowHandle === boundedHandle) {
      if (!this.child && !this.restartTimer) this.spawnCapture()
      return
    }
    this.stopInternal(true)
    this.wanted = true
    this.authorityPid = boundedPid
    this.windowHandle = boundedHandle
    this.failures = 0
    this.spawnCapture()
  }

  getFrame(): LobbyBackgroundFrame | null {
    return this.currentFrame
      ? { mimeType: this.currentFrame.mimeType, bytes: new Uint8Array(this.currentFrame.bytes) }
      : null
  }

  stop(): void {
    this.stopInternal(true)
  }

  private stopInternal(clear: boolean): void {
    this.wanted = false
    this.authorityPid = null
    this.windowHandle = null
    this.epoch += 1
    this.lastRawHash = ''
    this.pendingRestartDelay = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.clearWatchdog()
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
    if (clear) this.clearFrame()
  }

  private spawnCapture(): void {
    if (
      !this.wanted || this.child || this.processing ||
      this.authorityPid == null || this.windowHandle == null
    ) return
    const epoch = ++this.epoch
    const authorityPid = this.authorityPid
    const windowHandle = this.windowHandle
    const child = (this.dependencies.spawnCapture ?? spawnLobbyBackgroundCapture)(authorityPid, windowHandle)
    this.child = child
    let buffered = ''
    this.resetWatchdog(child)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (!this.isCurrent(epoch, authorityPid, windowHandle) || this.child !== child) return
      if (buffered.length + chunk.length > 1_200_000) {
        this.failCapture(child)
        return
      }
      buffered += chunk
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const parsed = parseLobbyBackgroundCaptureLine(line.trim())
        if (!parsed) {
          this.failCapture(child)
          return
        }
        this.resetWatchdog(child)
        void this.acceptFrame(parsed.frame, epoch, authorityPid, windowHandle)
      }
    })
    child.stderr.resume()
    child.once('close', () => this.handleTermination(child))
    child.once('error', () => this.handleTermination(child))
  }

  private async acceptFrame(raw: Buffer, epoch: number, authorityPid: number, windowHandle: string): Promise<void> {
    if (
      this.processing || !this.isCurrent(epoch, authorityPid, windowHandle)
    ) return
    const rawHash = createHash('sha256').update(raw).digest('hex')
    if (rawHash === this.lastRawHash) return
    this.processing = true
    const sanitizeOperation = Promise.resolve()
      .then(() => (this.dependencies.sanitizeFrame ?? sanitizeLobbyBackgroundFrame)(raw))
    let sanitizeTimeout: NodeJS.Timeout | null = null
    let timedOut = false
    try {
      const sanitized = await Promise.race([
        sanitizeOperation,
        new Promise<never>((_resolve, reject) => {
          sanitizeTimeout = setTimeout(() => {
            timedOut = true
            reject(new Error('Lobby background sanitizer timed out'))
          }, LOBBY_BACKGROUND_SANITIZE_TIMEOUT_MS)
        }),
      ])
      if (!this.isCurrent(epoch, authorityPid, windowHandle)) return
      this.lastRawHash = rawHash
      const rendererHash = createHash('sha256').update(sanitized).digest('hex')
      if (rendererHash === this.lastRendererHash) return
      this.lastRendererHash = rendererHash
      this.failures = 0
      this.currentFrame = { mimeType: 'image/jpeg', bytes: new Uint8Array(sanitized) }
      this.onChanged(this.getFrame())
    } catch {
      if (this.isCurrent(epoch, authorityPid, windowHandle)) {
        this.clearFrame()
        this.failCapture(this.child)
      }
    } finally {
      if (sanitizeTimeout) clearTimeout(sanitizeTimeout)
      // A timed-out native Sharp task cannot be cancelled safely. Keep the
      // controller single-flight until the real operation settles; if it
      // never settles the feature remains fail-closed instead of piling up.
      if (timedOut) {
        void sanitizeOperation
          .catch(() => undefined)
          .finally(() => this.finishProcessing())
      } else {
        this.finishProcessing()
      }
    }
  }

  private finishProcessing(): void {
    if (!this.processing) return
    this.processing = false
    this.armRestart()
  }

  private isCurrent(epoch: number, authorityPid: number, windowHandle: string): boolean {
    return this.wanted && epoch === this.epoch &&
      authorityPid === this.authorityPid && windowHandle === this.windowHandle
  }

  private resetWatchdog(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.clearWatchdog()
    this.watchdog = setTimeout(() => this.failCapture(child), LOBBY_BACKGROUND_CAPTURE_TIMEOUT_MS)
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private failCapture(child: ChildProcessWithoutNullStreams | null): void {
    if (!child || this.child !== child) return
    this.clearWatchdog()
    if (!child.killed) child.kill()
  }

  private handleTermination(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.child = null
    this.clearWatchdog()
    this.epoch += 1
    this.lastRawHash = ''
    this.clearFrame()
    if (!this.wanted) return
    const delay = Math.min(60_000, 15_000 * (2 ** Math.min(2, this.failures)))
    this.failures = Math.min(3, this.failures + 1)
    this.pendingRestartDelay = delay
    this.armRestart()
  }

  private armRestart(): void {
    if (!this.wanted || this.processing || this.child || this.restartTimer) return
    const delay = this.pendingRestartDelay ?? 0
    this.pendingRestartDelay = null
    if (delay <= 0) {
      this.spawnCapture()
      return
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.spawnCapture()
    }, delay)
  }

  private clearFrame(): void {
    this.lastRendererHash = ''
    if (!this.currentFrame) return
    this.currentFrame = null
    this.onChanged(null)
  }
}
