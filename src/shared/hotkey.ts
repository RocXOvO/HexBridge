export interface HotkeyValidationResult {
  ok: boolean
  accelerator: string
  errorCode: string | null
  message: string
}

const KEY_PATTERN = /^(?:F(?:[1-9]|1[0-2])|[A-Z]|[0-9])$/

export function validateOcrHotkey(value: string): HotkeyValidationResult {
  const rawParts = String(value ?? '').trim().split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''
  for (const raw of rawParts) {
    const part = raw.toUpperCase()
    if (part === 'CTRL' || part === 'CONTROL') modifiers.add('Ctrl')
    else if (part === 'ALT') modifiers.add('Alt')
    else if (part === 'SHIFT') modifiers.add('Shift')
    else if (!key && KEY_PATTERN.test(part)) key = part
    else return invalid('HOTKEY_INVALID', '快捷键格式无效，请按 F 键或 Ctrl/Alt/Shift 组合键')
  }
  if (!key) return invalid('HOTKEY_KEY_REQUIRED', '请按下一个字母、数字或 F1–F12')
  if (!key.startsWith('F') && modifiers.size === 0) {
    return invalid('HOTKEY_MODIFIER_REQUIRED', '字母或数字必须搭配 Ctrl、Alt 或 Shift')
  }
  const accelerator = ['Ctrl', 'Alt', 'Shift'].filter((part) => modifiers.has(part)).concat(key).join('+')
  if (accelerator === 'Alt+F4') return invalid('HOTKEY_RESERVED', 'Alt+F4 是系统关闭窗口快捷键，请换一个组合')
  return { ok: true, accelerator, errorCode: null, message: `识别快捷键已设为 ${accelerator}` }
}

function invalid(errorCode: string, message: string): HotkeyValidationResult {
  return { ok: false, accelerator: '', errorCode, message }
}
