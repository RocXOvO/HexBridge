import sharp from 'sharp'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  LOBBY_BACKGROUND_CAPTURE_SCRIPT,
  LOBBY_BACKGROUND_MAX_RENDERER_BYTES,
  LobbyBackgroundController,
  parseLobbyBackgroundCaptureLine,
  sanitizeLobbyBackgroundFrame,
  shouldDiscoverLobbyBackground,
} from '../src/main/lobby-background.js'

class FakeCaptureChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false
  readonly kill = vi.fn(() => {
    if (this.killed) return false
    this.killed = true
    this.emit('close', null, 'SIGTERM')
    return true
  })
}

const eligible = {
  platform: 'win32' as const,
  settingEnabled: true,
  lcuConnected: true,
  phase: 'Lobby',
  matchStage: 'none' as const,
  mainVisible: true,
  mainFocused: true,
  mainMinimized: false,
  livePageVisible: true,
  rendererReducedMotion: false,
  systemReducedMotion: false,
  activeVisualMode: 'balanced' as const,
  authorityClientPid: 123,
}

describe('Lobby background safety boundary', () => {
  it.each(['Lobby', 'Matchmaking', 'ReadyCheck'])(
    'allows only a focused waiting surface in %s',
    (phase) => {
      expect(shouldDiscoverLobbyBackground({ ...eligible, phase })).toBe(true)
    },
  )

  it.each([
    { settingEnabled: false },
    { lcuConnected: false },
    { phase: 'None' },
    { phase: 'ChampSelect' },
    { matchStage: 'selecting' as const },
    { matchStage: 'launching' as const },
    { matchStage: 'active' as const },
    { mainVisible: false },
    { mainFocused: false },
    { mainMinimized: true },
    { livePageVisible: false },
    { rendererReducedMotion: true },
    { systemReducedMotion: true },
    { activeVisualMode: 'eco' as const },
    { authorityClientPid: null },
    { platform: 'darwin' as const },
  ])('fails closed for %j', (patch) => {
    expect(shouldDiscoverLobbyBackground({ ...eligible, ...patch })).toBe(false)
  })

  it('rejects Lobby during the handoff stage even though the raw phase looks idle', () => {
    expect(shouldDiscoverLobbyBackground({ ...eligible, phase: 'Lobby', matchStage: 'launching' })).toBe(false)
  })

  it('accepts only a bounded base64 frame envelope', () => {
    const bytes = Buffer.from('safe-frame')
    expect(parseLobbyBackgroundCaptureLine(JSON.stringify({ ok: true, frame: bytes.toString('base64') })))
      .toEqual({ frame: bytes })
    expect(parseLobbyBackgroundCaptureLine(JSON.stringify({ ok: false, frame: bytes.toString('base64') }))).toBeNull()
    expect(parseLobbyBackgroundCaptureLine('{"ok":true,"frame":"window:123"}')).toBeNull()
    expect(parseLobbyBackgroundCaptureLine('not-json')).toBeNull()
  })

  it('uses exact HWND PrintWindow capture without screen-copy or docking operations', () => {
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).toContain('PrintWindow')
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).toContain('GetWindowThreadProcessId')
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).toContain("ProcessName -ne 'LeagueClientUx'")
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).toContain('DwmGetWindowAttributeInt')
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).toContain('$pixels -gt 16777216')
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).not.toContain('CopyFromScreen')
    expect(LOBBY_BACKGROUND_CAPTURE_SCRIPT).not.toContain('SetWindowPos')
  })

  it('sends only a bounded, downsampled and strongly blurred JPEG to the renderer', async () => {
    const source = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#8a3344' },
    }).png().toBuffer()
    const output = await sanitizeLobbyBackgroundFrame(source)
    const metadata = await sharp(output).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBeLessThanOrEqual(960)
    expect(metadata.height).toBeLessThanOrEqual(540)
    expect(output.length).toBeLessThanOrEqual(LOBBY_BACKGROUND_MAX_RENDERER_BYTES)
  })

  it('clears immediately on disable and drops a late frame from an old HWND epoch', async () => {
    const children: FakeCaptureChild[] = []
    let finishSanitize!: (value: Buffer) => void
    const sanitize = vi.fn(() => new Promise<Buffer>((resolve) => { finishSanitize = resolve }))
    const changed = vi.fn()
    const controller = new LobbyBackgroundController(changed, {
      platform: 'win32',
      spawnCapture: () => {
        const child = new FakeCaptureChild()
        children.push(child)
        return child as any
      },
      sanitizeFrame: sanitize,
    })
    const raw = Buffer.from('safe-frame')

    controller.update(true, 101, '501')
    children[0]!.stdout.write(`${JSON.stringify({ ok: true, frame: raw.toString('base64') })}\n`)
    await vi.waitFor(() => expect(sanitize).toHaveBeenCalledOnce())
    controller.update(true, 202, '502')
    expect(children[0]!.kill).toHaveBeenCalledOnce()
    finishSanitize(Buffer.from('sanitized-frame'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(changed).not.toHaveBeenCalled()

    controller.stop()
    expect(children[1]!.kill).toHaveBeenCalledOnce()
  })

  it('keeps a timed-out native sanitizer single-flight until the real task settles', async () => {
    vi.useFakeTimers()
    try {
      const children: FakeCaptureChild[] = []
      let finishSanitize!: (value: Buffer) => void
      const sanitize = vi.fn(() => new Promise<Buffer>((resolve) => { finishSanitize = resolve }))
      const changed = vi.fn()
      const controller = new LobbyBackgroundController(changed, {
        platform: 'win32',
        spawnCapture: () => {
          const child = new FakeCaptureChild()
          children.push(child)
          return child as any
        },
        sanitizeFrame: sanitize,
      })

      controller.update(true, 101, '501')
      void (controller as any).acceptFrame(Buffer.from('first'), (controller as any).epoch, 101, '501')
      await vi.advanceTimersByTimeAsync(0)
      expect(sanitize).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(3_000)
      expect(children[0]!.kill).toHaveBeenCalledOnce()

      controller.update(true, 202, '502')
      expect(children).toHaveLength(1)
      finishSanitize(Buffer.from('late-frame'))
      await vi.runAllTicks()
      await vi.advanceTimersByTimeAsync(0)
      expect(children).toHaveLength(2)
      expect(changed).not.toHaveBeenCalled()
      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('invalidates the raw fingerprint when the capture helper terminates', async () => {
    vi.useFakeTimers()
    try {
      const children: FakeCaptureChild[] = []
      const sanitize = vi.fn(async () => Buffer.from('sanitized-frame'))
      const changed = vi.fn()
      const controller = new LobbyBackgroundController(changed, {
        platform: 'win32',
        spawnCapture: () => {
          const child = new FakeCaptureChild()
          children.push(child)
          return child as any
        },
        sanitizeFrame: sanitize,
      })
      const raw = Buffer.from('same-raw')

      controller.update(true, 101, '501')
      void (controller as any).acceptFrame(raw, (controller as any).epoch, 101, '501')
      await vi.advanceTimersByTimeAsync(0)
      expect(changed).toHaveBeenCalledTimes(1)
      children[0]!.emit('close', 1, null)
      expect(changed).toHaveBeenLastCalledWith(null)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(children).toHaveLength(2)
      void (controller as any).acceptFrame(raw, (controller as any).epoch, 101, '501')
      await vi.advanceTimersByTimeAsync(0)
      expect(sanitize).toHaveBeenCalledTimes(2)
      expect(changed).toHaveBeenCalledTimes(3)
      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a sanitizer result that arrives after the current helper terminates', async () => {
    vi.useFakeTimers()
    try {
      const children: FakeCaptureChild[] = []
      let finishSanitize!: (value: Buffer) => void
      const sanitize = vi.fn(() => new Promise<Buffer>((resolve) => { finishSanitize = resolve }))
      const changed = vi.fn()
      const controller = new LobbyBackgroundController(changed, {
        platform: 'win32',
        spawnCapture: () => {
          const child = new FakeCaptureChild()
          children.push(child)
          return child as any
        },
        sanitizeFrame: sanitize,
      })

      controller.update(true, 101, '501')
      void (controller as any).acceptFrame(Buffer.from('raw'), (controller as any).epoch, 101, '501')
      await vi.advanceTimersByTimeAsync(0)
      children[0]!.emit('close', 1, null)
      finishSanitize(Buffer.from('late-sanitized'))
      await vi.advanceTimersByTimeAsync(0)
      expect(changed).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(15_000)
      expect(children).toHaveLength(2)
      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores stdout from a helper that was replaced by a new HWND epoch', async () => {
    const children: FakeCaptureChild[] = []
    const sanitize = vi.fn(async () => Buffer.from('sanitized'))
    const controller = new LobbyBackgroundController(vi.fn(), {
      platform: 'win32',
      spawnCapture: () => {
        const child = new FakeCaptureChild()
        children.push(child)
        return child as any
      },
      sanitizeFrame: sanitize,
    })
    const resetWatchdog = vi.spyOn(controller as any, 'resetWatchdog')

    controller.update(true, 101, '501')
    controller.update(true, 202, '502')
    expect(children).toHaveLength(2)
    expect(resetWatchdog).toHaveBeenCalledTimes(2)
    children[0]!.stdout.write(`${JSON.stringify({
      ok: true,
      frame: Buffer.from('obsolete').toString('base64'),
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(resetWatchdog).toHaveBeenCalledTimes(2)
    expect(sanitize).not.toHaveBeenCalled()
    controller.stop()
  })

  it('publishes only the sanitized frame and revokes it synchronously when stopped', async () => {
    const child = new FakeCaptureChild()
    const changed = vi.fn()
    const sanitized = Buffer.from('sanitized-frame')
    const controller = new LobbyBackgroundController(changed, {
      platform: 'win32',
      spawnCapture: () => child as any,
      sanitizeFrame: async () => sanitized,
    })
    const raw = Buffer.from('safe-frame')
    controller.update(true, 101, '501')
    child.stdout.write(`${JSON.stringify({ ok: true, frame: raw.toString('base64') })}\n`)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(changed.mock.calls[0]![0]).toEqual({
      mimeType: 'image/jpeg',
      bytes: new Uint8Array(sanitized),
    })

    controller.stop()
    expect(changed).toHaveBeenLastCalledWith(null)
  })
})
