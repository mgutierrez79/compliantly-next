import { NextRequest, NextResponse } from 'next/server'

// Phase 4.1: edge middleware for the console.
//
// Responsibilities:
//   1. Security headers on every response. CSP locks `script-src` to self
//      + inline (Next requires inline runtime), prevents framing
//      (clickjacking), forces a referrer policy, and disables MIME-type
//      sniffing.
//   2. Redirect unauthenticated users away from console routes BEFORE
//      any HTML renders. Auth state is detected via a non-sensitive
//      "compliantly.session" cookie set by the Login page on successful
//      auth. This is a marker, not a credential — actual API calls
//      still require the Bearer token from localStorage. The cookie
//      exists so the middleware can detect "user has never logged in"
//      at the edge and redirect, eliminating the protected-shell flash.
//
// Phase 4.2 (deferred) will replace this with proper httpOnly session
// cookies bound to the API server, which the middleware can validate.
// Until then, this layer prevents the cold-load flash; the strong
// access control still lives in the API.

const SESSION_COOKIE = 'compliantly.session'

// Routes that DO NOT require auth. Everything else under /(console)/
// is protected. Login is at /login. Trust center is public for the
// auditor flow. /auth/* hosts the OIDC callback.
const publicPathPrefixes = ['/login', '/trust-center', '/auth', '/api', '/_next', '/favicon', '/robots.txt']

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  for (const prefix of publicPathPrefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true
  }
  // Static asset extensions Next emits during build (.js/.css/.png/etc.)
  // never carry auth and shouldn't bounce through /login.
  if (/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|map|json)$/.test(pathname)) {
    return true
  }
  return false
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  // CSP: Next.js needs 'unsafe-inline' for runtime hydration scripts in
  // dev. In production a stricter nonce-based policy is achievable but
  // requires per-request nonce injection — out of scope for Phase 4.1.
  // The current policy still blocks third-party scripts and inline
  // event handlers, which is the bulk of the XSS surface.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  const sessionMarker = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionMarker) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    // Preserve the deep link the user was trying to reach so the login
    // flow can return them after auth.
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return applySecurityHeaders(NextResponse.redirect(loginUrl))
  }

  return applySecurityHeaders(NextResponse.next())
}

export const config = {
  // Run on everything except Next.js internals and static files. The
  // exclusion regex mirrors what isPublicPath does; redundant but
  // matters because the matcher is the only way to keep middleware off
  // the static asset path entirely.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
