import { describe, expect, it, vi } from 'vitest'
import {
  commitHotkeyRegistration,
  OcrHotkeyManager,
  registerInitialOcrHotkey,
  resolveActiveHotkeyOverride,
} from '../src/main/hotkey-manager.js'

describe('OCR hotkey transaction', () => {
  it('keeps the active shortcut when the replacement conflicts', () => {
    const registered = new Set<string>()
    const adapter = {
      register: vi.fn((value: string) => {
        if (value === 'Ctrl+Shift+K') return false
        registered.add(value)
        return true
      }),
      unregister: vi.fn((value: string) => registered.delete(value)),
      isRegistered: vi.fn((value: string) => registered.has(value)),
    }
    const manager = new OcrHotkeyManager(adapter, () => undefined)
    expect(manager.register('F8').ok).toBe(true)
    expect(manager.register('Ctrl+Shift+K')).toMatchObject({ ok: false, activeHotkey: 'F8' })
    expect(registered).toEqual(new Set(['F8']))
    expect(adapter.unregister).not.toHaveBeenCalled()
  })

  it('registers the replacement before releasing the old shortcut', () => {
    const calls: string[] = []
    const registered = new Set<string>()
    const manager = new OcrHotkeyManager({
      register: (value) => { calls.push(`register:${value}`); registered.add(value); return true },
      unregister: (value) => { calls.push(`unregister:${value}`); registered.delete(value) },
      isRegistered: (value) => registered.has(value),
    }, () => undefined)
    manager.register('F8')
    manager.register('Ctrl+Shift+K')
    expect(calls.slice(-2)).toEqual(['register:Ctrl+Shift+K', 'unregister:F8'])
  })

  it('restores the old shortcut when persistence fails', () => {
    const restore = vi.fn(() => ({ ok: true, activeHotkey: 'F8', errorCode: null, message: 'ok' }))
    const result = commitHotkeyRegistration(
      'F8',
      { ok: true, activeHotkey: 'F9', errorCode: null, message: 'ok' },
      () => { throw new Error('disk full') },
      restore,
    )
    expect(result).toMatchObject({ ok: false, activeHotkey: 'F8', errorCode: 'HOTKEY_SAVE_FAILED' })
    expect(restore).toHaveBeenCalledWith('F8')
  })

  it('reports the actually active replacement when rollback also fails', () => {
    const result = commitHotkeyRegistration(
      'F8',
      { ok: true, activeHotkey: 'F9', errorCode: null, message: 'ok' },
      () => { throw new Error('disk full') },
      () => ({
        ok: false,
        activeHotkey: 'F9',
        errorCode: 'HOTKEY_CONFLICT',
        message: 'conflict',
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      activeHotkey: 'F9',
      errorCode: 'HOTKEY_ROLLBACK_FAILED',
    })
    expect(result.message).toContain('F9')
  })

  it('keeps reporting the real active shortcut after a rollback failure and a later conflict', () => {
    const persisted = 'F8'
    expect(resolveActiveHotkeyOverride(persisted, 'F9')).toBe('F9')
    // A later invalid/conflicting registration still reports the manager's
    // real active accelerator. It must not clear the runtime override merely
    // because this second result has a different error code.
    const laterConflict = {
      ok: false,
      activeHotkey: 'F9',
      errorCode: 'HOTKEY_CONFLICT',
      message: 'conflict',
    }
    expect(resolveActiveHotkeyOverride(persisted, laterConflict.activeHotkey)).toBe('F9')
    expect(resolveActiveHotkeyOverride('F9', laterConflict.activeHotkey)).toBeNull()
  })

  it('represents a default F8 startup conflict as no active shortcut', () => {
    const register = vi.fn((_candidate: string) => ({ ok: false, activeHotkey: '', errorCode: 'HOTKEY_CONFLICT', message: 'conflict' }))
    const result = registerInitialOcrHotkey('F8', register)
    expect(result).toMatchObject({ ok: false, activeHotkey: '' })
    expect(resolveActiveHotkeyOverride('F8', result.activeHotkey)).toBe('')
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('represents custom and fallback startup conflicts as no active shortcut', () => {
    const register = vi.fn((_candidate: string) => ({ ok: false, activeHotkey: '', errorCode: 'HOTKEY_CONFLICT', message: 'conflict' }))
    const result = registerInitialOcrHotkey('Ctrl+Shift+K', register)
    expect(result).toMatchObject({ ok: false, activeHotkey: '' })
    expect(resolveActiveHotkeyOverride('Ctrl+Shift+K', result.activeHotkey)).toBe('')
    expect(register.mock.calls.map(([candidate]) => candidate)).toEqual(['Ctrl+Shift+K', 'F8'])
  })
})
