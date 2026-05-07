export const LOG_LEVELS = ['critical', 'error', 'warning', 'info', 'debug'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export type LogEntry = {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  scope?: string
  details?: string
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  critical: 50,
  error: 40,
  warning: 30,
  info: 20,
  debug: 10,
}

const MAX_LOGS = 500
const MAX_DETAIL_LENGTH = 4000
const listeners = new Set<(entries: LogEntry[]) => void>()
const buffer: LogEntry[] = []

const configuredLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL
let currentLevel: LogLevel = isLogLevel(configuredLogLevel) ? configuredLogLevel : 'info'

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogs(): LogEntry[] {
  return [...buffer]
}

export function clearLogs(): void {
  if (!buffer.length) return
  buffer.length = 0
  notify()
}

export function subscribeLogs(listener: (entries: LogEntry[]) => void): () => void {
  listeners.add(listener)
  listener([...buffer])
  return () => listeners.delete(listener)
}

export function log(level: LogLevel, message: string, options?: { scope?: string; details?: unknown }): void {
  if (!shouldLog(level)) return
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    scope: options?.scope?.trim() || undefined,
    details: normalizeDetails(options?.details),
  }
  buffer.push(entry)
  if (buffer.length > MAX_LOGS) {
    buffer.splice(0, buffer.length - MAX_LOGS)
  }
  writeConsole(entry)
  notify()
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel]
}

function normalizeDetails(details?: unknown): string | undefined {
  if (details === undefined || details === null) return undefined
  if (typeof details === 'string') return truncate(details)
  if (details instanceof Error) {
    const stack = details.stack ? `\n${details.stack}` : ''
    return truncate(`${details.message}${stack}`)
  }
  try {
    return truncate(JSON.stringify(details, null, 2))
  } catch {
    return truncate(String(details))
  }
}

function truncate(value: string): string {
  if (value.length <= MAX_DETAIL_LENGTH) return value
  return `${value.slice(0, MAX_DETAIL_LENGTH)}...`
}

function notify(): void {
  const snapshot = [...buffer]
  listeners.forEach((listener) => listener(snapshot))
}

function writeConsole(entry: LogEntry): void {
  const prefix = entry.scope ? `[${entry.scope}]` : '[app]'
  const payload = entry.details ? [entry.message, entry.details] : [entry.message]
  if (entry.level === 'critical' || entry.level === 'error') {
    console.error(prefix, ...payload)
    return
  }
  if (entry.level === 'warning') {
    console.warn(prefix, ...payload)
    return
  }
  if (entry.level === 'info') {
    console.info(prefix, ...payload)
    return
  }
  console.debug(prefix, ...payload)
}
