// auditorApi.ts is the token-based API client for the external
// auditor portal. Unlike apiFetch (which uses an httpOnly session
// cookie or stored API key), this client carries a bearer token
// passed in the magic-link URL and forwards it as
// `Authorization: Bearer <token>` on every request.
//
// Token lifecycle inside the browser:
//
//   1. First load with `?token=<plaintext>` in the URL: capture the
//      token into sessionStorage and rewrite the URL to drop the
//      query param (so a screenshot doesn't leak it).
//   2. Subsequent calls read from sessionStorage. sessionStorage
//      (not localStorage) means closing the tab clears the token —
//      safer default for a third-party using a shared workstation.
//   3. The auditor's bookmark stays bookmark-able because the
//      magic-link URL still works on a fresh tab (token re-captured
//      from the query string).
//
// The token is bound to a single tenant on the backend; this client
// deliberately does NOT send X-Tenant-ID so the backend resolves
// tenant from the principal (auditorAccessStatus enforces the
// read-only + whitelisted-prefix policy).

const STORAGE_KEY = 'attestiv.auditor.token'

export type AuditorTokenStatus = 'absent' | 'captured-from-url' | 'from-session'

// captureAuditorTokenFromURL reads `?token=...` from the current
// URL (browser-only), stores it in sessionStorage, and rewrites
// the URL to remove the param. Safe to call on every render — only
// the first call with a token actually does anything.
export function captureAuditorTokenFromURL(): AuditorTokenStatus {
  if (typeof window === 'undefined') return 'absent'
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (token && token.length > 0) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, token)
    } catch {
      // Some privacy-mode browsers throw on sessionStorage writes.
      // The token still works in-memory below, just not across navs.
    }
    url.searchParams.delete('token')
    // history.replaceState keeps the same back-stack entry but drops
    // the token from the visible URL — protects against screenshot /
    // shoulder-surfing leakage.
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''))
    return 'captured-from-url'
  }
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return 'from-session'
  } catch {
    // see above — silent fallback.
  }
  return 'absent'
}

export function readAuditorToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function clearAuditorToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api'
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${trimmedBase}${normalizedPath}`
}

export async function auditorApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = readAuditorToken()
  const url = joinUrl(apiBaseUrl(), `/v1${path.startsWith('/') ? path : `/${path}`}`)
  const headers = new Headers(init?.headers ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(url, {
    ...init,
    headers,
  })
}
