import { app } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const lines: string[] = []
const MAX_LINES = 180
const SECRET_PATTERNS = [
  /hx_(?:live|test)_[A-Za-z0-9_-]+/g,
  /--remoting-auth-token=[^\s"']+/g,
  /Authorization:\s*(?:Basic|Bearer)\s+[^\s]+/gi,
  /https:\/\/riot:[^@]+@127\.0\.0\.1:\d+/g,
  /\b[a-f0-9]{64,}\b/gi,
  /\b[A-Za-z0-9_-]{70,}\b/g,
]

export function redact(value: unknown): string {
  let text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]')
  return text
}

async function writeToDisk(line: string): Promise<void> {
  if (!app.isReady()) return
  try {
    const directory = path.join(app.getPath('userData'), 'logs')
    await mkdir(directory, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    await appendFile(path.join(directory, `hexbridge-${date}.log`), `${line}\n`, 'utf8')
  } catch {
    // Logging must never affect the companion runtime.
  }
}

function emit(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, detail?: unknown): void {
  const suffix = detail == null ? '' : ` ${redact(detail)}`
  const line = `${new Date().toISOString()} ${level} ${redact(message)}${suffix}`
  lines.push(line)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
  void writeToDisk(line)
}

export const logger = {
  info: (message: string, detail?: unknown) => emit('INFO', message, detail),
  warn: (message: string, detail?: unknown) => emit('WARN', message, detail),
  error: (message: string, detail?: unknown) => emit('ERROR', message, detail),
  debug: (message: string, detail?: unknown) => emit('DEBUG', message, detail),
  recent: () => [...lines],
}
