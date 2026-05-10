import { loadSettings } from './settings'
import { oidcAccessToken } from './auth'
import { log } from './logger'

export class ApiError extends Error {
  status: number
  bodyText: string

  constructor(message: string, status: number, bodyText: string) {
    super(message)
    this.status = status
    this.bodyText = bodyText
  }
}

export type ApiPerfEntry = {
  id: string
  url: string
  method: string
  status: number
  ok: boolean
  duration_ms: number
  size_bytes: number | null
  timestamp: string
}

const PERF_LIMIT = 200
const perfEntries: ApiPerfEntry[] = []
const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function recordPerf(entry: ApiPerfEntry) {
  perfEntries.push(entry)
  if (perfEntries.length > PERF_LIMIT) {
    perfEntries.splice(0, perfEntries.length - PERF_LIMIT)
  }
}

export function getApiPerfEntries(): ApiPerfEntry[] {
  return [...perfEntries].reverse()
}

export function clearApiPerfEntries() {
  perfEntries.length = 0
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function isHtmlPayload(bodyText: string): boolean {
  const trimmed = bodyText.trim().toLowerCase()
  if (!trimmed) return false
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<html') ||
    trimmed.includes('<body') ||
    trimmed.includes('<title>')
  )
}

function stripHtmlToText(bodyText: string): string {
  return bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeHtmlError(bodyText: string, fallback: string): string {
  const titleMatch = bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const h1Match = bodyText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? stripHtmlToText(titleMatch[1]) : ''
  const h1 = h1Match ? stripHtmlToText(h1Match[1]) : ''
  const summary = h1 || title || fallback
  return summary || fallback
}

function formatApiErrorMessage(bodyText: string, fallback: string): string {
  const trimmed = bodyText.trim()
  if (!trimmed) return fallback
  if (isHtmlPayload(trimmed)) {
    return summarizeHtmlError(trimmed, fallback)
  }
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown; message?: unknown }
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail.trim()
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // ignore JSON parsing errors
  }
  const compact = trimmed.replace(/\s+/g, ' ').trim()
  if (!compact) return fallback
  if (compact.length > 200) return `${compact.slice(0, 200)}...`
  return compact
}

function formatApiErrorDetail(bodyText: string, fallback: string): string {
  const trimmed = bodyText.trim()
  if (!trimmed) return fallback
  if (isHtmlPayload(trimmed)) {
    const summary = summarizeHtmlError(trimmed, fallback)
    return `${summary}\n(Upstream gateway returned an HTML error page.)`
  }
  if (trimmed.length > 2000) return `${trimmed.slice(0, 2000)}...`
  return trimmed
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const settings = loadSettings()
  const url = joinUrl(settings.apiBaseUrl, `/v1${path.startsWith('/') ? path : `/${path}`}`)
  const started = nowMs()
  const method = String(init?.method ?? 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  const maxAttempts = canRetry ? 3 : 1

  const headers = new Headers(init?.headers ?? {})
  if (settings.authMode === 'oidc') {
    // Phase 4b/OIDC: the credential is the httpOnly session cookie
    // minted by /v1/auth/oidc/exchange. We deliberately do NOT add a
    // Bearer header — falling back to the IdP token would let a
    // misconfigured deployment leak it through the network tab.
    void oidcAccessToken
  } else if (settings.authMode === 'local') {
    // Phase 4b: local auth uses an httpOnly session cookie set by the
    // server on /v1/auth/login. The browser carries it automatically as
    // long as the request includes credentials. localToken is only a
    // fallback for the rare case where a token was issued before the
    // cookie migration; new logins do not populate it.
    if (settings.localToken) headers.set('Authorization', `Bearer ${settings.localToken}`)
  } else if (settings.apiKey) {
    headers.set('Authorization', `Bearer ${settings.apiKey}`)
  }
  if (settings.tenantId) {
    headers.set('X-Tenant-ID', settings.tenantId)
  }

  let response: Response | null = null
  let networkError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetch(url, {
        ...init,
        headers,
        // Required for the httpOnly session cookie to flow on
        // cross-origin requests (frontend at :3000, API at :8001 in
        // local dev). The backend must respond with
        // Access-Control-Allow-Credentials: true for the browser to
        // accept the response — already configured by corsMiddleware
        // when COMPLIANCE_CORS_ALLOW_CREDENTIALS is true.
        credentials: 'include',
      })
    } catch (err) {
      networkError = err
      if (attempt + 1 < maxAttempts) {
        await sleep(200 * 2 ** attempt)
        continue
      }
      const duration = Math.max(0, nowMs() - started)
      recordPerf({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        method,
        status: 0,
        ok: false,
        duration_ms: Math.round(duration),
        size_bytes: null,
        timestamp: new Date().toISOString(),
      })
      log('error', 'API request failed', {
        scope: 'api',
        details: { url, method, message: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }

    break
  }

  if (!response) {
    const duration = Math.max(0, nowMs() - started)
    recordPerf({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      method,
      status: 0,
      ok: false,
      duration_ms: Math.round(duration),
      size_bytes: null,
      timestamp: new Date().toISOString(),
    })
    throw (networkError instanceof Error ? networkError : new Error('Request failed'))
  }

  const duration = Math.max(0, nowMs() - started)
  const lengthHeader = response.headers.get('content-length')
  const sizeBytes = lengthHeader ? Number(lengthHeader) : null
  recordPerf({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    method,
    status: response.status,
    ok: response.ok,
    duration_ms: Math.round(duration),
    size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    timestamp: new Date().toISOString(),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    log(response.status >= 500 ? 'error' : 'warning', 'API response error', {
      scope: 'api',
      details: { url, method, status: response.status, statusText: response.statusText },
    })
    const fallback = `${response.status} ${response.statusText}`
    const message = formatApiErrorMessage(bodyText, fallback)
    const detail = formatApiErrorDetail(bodyText, fallback)
    throw new ApiError(message, response.status, detail)
  }

  return response
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  return (await response.json()) as T
}
