import type { HotkeyRegistrationResult } from '../shared/contracts.js'
import { validateOcrHotkey } from '../shared/hotkey.js'

export interface GlobalShortcutAdapter {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

export function resolveActiveHotkeyOverride(persisted: string, active: string): string | null {
  // Empty is meaningful: registration failed and no accelerator is active.
  // Preserve it instead of falsely falling back to the persisted label.
  return active !== persisted ? active : null
}

export function registerInitialOcrHotkey(
  configured: string,
  register: (hotkey: string) => HotkeyRegistrationResult,
): HotkeyRegistrationResult {
  const configuredResult = register(configured)
  if (configuredResult.ok || configured === 'F8') return configuredResult
  return register('F8')
}

/** Registers the replacement before releasing the current accelerator. */
export class OcrHotkeyManager {
  private activeHotkey = ''

  constructor(
    private readonly shortcuts: GlobalShortcutAdapter,
    private readonly trigger: () => void,
    private readonly changed: (activeHotkey: string) => void = () => undefined,
  ) {}

  get active(): string {
    return this.activeHotkey
  }

  register(candidate: string): HotkeyRegistrationResult {
    const validation = validateOcrHotkey(candidate)
    if (!validation.ok) {
      return {
        ok: false,
        activeHotkey: this.activeHotkey,
        errorCode: validation.errorCode,
        message: validation.message,
      }
    }
    const accelerator = validation.accelerator
    if (accelerator === this.activeHotkey && this.shortcuts.isRegistered(accelerator)) {
      return { ok: true, activeHotkey: accelerator, errorCode: null, message: validation.message }
    }
    try {
      if (!this.shortcuts.register(accelerator, this.trigger)) {
        return {
          ok: false,
          activeHotkey: this.activeHotkey,
          errorCode: 'HOTKEY_CONFLICT',
          message: '该快捷键已被其他程序占用，原快捷键保持不变',
        }
      }
      const previous = this.activeHotkey
      this.activeHotkey = accelerator
      if (previous && previous !== accelerator) this.shortcuts.unregister(previous)
      this.changed(accelerator)
      return { ok: true, activeHotkey: accelerator, errorCode: null, message: validation.message }
    } catch {
      return {
        ok: false,
        activeHotkey: this.activeHotkey,
        errorCode: 'HOTKEY_REGISTER_FAILED',
        message: '快捷键注册失败，原快捷键保持不变',
      }
    }
  }

  dispose(): void {
    if (this.activeHotkey) this.shortcuts.unregister(this.activeHotkey)
    this.activeHotkey = ''
  }
}

export function commitHotkeyRegistration(
  previous: string,
  registered: HotkeyRegistrationResult,
  persist: (hotkey: string) => void,
  restore: (hotkey: string) => HotkeyRegistrationResult,
): HotkeyRegistrationResult {
  if (!registered.ok) return registered
  try {
    persist(registered.activeHotkey)
    return registered
  } catch {
    const restored = restore(previous)
    if (!restored.ok) {
      return {
        ok: false,
        activeHotkey: restored.activeHotkey,
        errorCode: 'HOTKEY_ROLLBACK_FAILED',
        message: `快捷键无法写入磁盘，原快捷键也无法恢复；本次运行仍使用 ${restored.activeHotkey || registered.activeHotkey}`,
      }
    }
    return {
      ok: false,
      activeHotkey: restored.activeHotkey,
      errorCode: 'HOTKEY_SAVE_FAILED',
      message: '快捷键保存失败，已恢复原快捷键',
    }
  }
}
