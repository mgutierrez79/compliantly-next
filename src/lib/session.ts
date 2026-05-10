// Phase 4.1 session marker.
//
// This module manages a non-sensitive cookie ("compliantly.session")
// that signals to the edge middleware that a user has configured auth
// in this browser. The cookie does NOT carry credentials — actual
// API calls still authenticate via the Bearer token from
// localStorage. The marker exists so middleware can redirect cold
// loads on /(console)/* routes to /login before any protected HTML
// renders, eliminating the flash-of-unprotected-shell problem.
//
// Phase 4.2 will replace this with a proper httpOnly session cookie
// minted by the API server on login. Until then, treat this marker
// as a hint, not a credential.

const SESSION_COOKIE = 'compliantly.session'
// 30-day expiry mirrors the practical lifetime of the localStorage
// settings; if a user clears their browser data the cookie clears
// too, and middleware bounces them through /login on the next visit.
const SESSION_TTL_DAYS = 30

export function setSessionMarker(): void {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS)
  // SameSite=Lax keeps the cookie on top-level navigation but blocks
  // it on cross-site requests, which is the right default for an app
  // that does not embed in third-party frames.
  const attrs = [
    `${SESSION_COOKIE}=1`,
    `Path=/`,
    `Expires=${expires.toUTCString()}`,
    `SameSite=Lax`,
  ]
  if (window.location.protocol === 'https:') {
    attrs.push('Secure')
  }
  document.cookie = attrs.join('; ')
}

export function clearSessionMarker(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

export function hasSessionMarker(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((entry) => entry.trim().startsWith(`${SESSION_COOKIE}=`))
}
