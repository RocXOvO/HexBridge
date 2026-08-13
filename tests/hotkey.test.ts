import { describe, expect, it } from 'vitest'
import { validateOcrHotkey } from '../src/shared/hotkey.js'

describe('OCR global hotkey validation', () => {
  it.each([
    ['f8', 'F8'],
    ['ctrl+shift+h', 'Ctrl+Shift+H'],
    ['Alt+1', 'Alt+1'],
  ])('canonicalizes %s', (input, expected) => {
    expect(validateOcrHotkey(input)).toMatchObject({ ok: true, accelerator: expected })
  })

  it.each(['A', 'Alt+F4', 'Ctrl+', 'Ctrl+Mouse1', 'Ctrl+H+J'])('rejects unsafe or invalid %s', (input) => {
    expect(validateOcrHotkey(input).ok).toBe(false)
  })
})
