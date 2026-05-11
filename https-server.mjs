// Frontend HTTPS wrapper.
//
// Next.js standalone output ships a `server.js` that calls
// `http.createServer(handler).listen(port)`. There's no public knob to
// make that an HTTPS server, but `http` is CommonJS and resolves to a
// singleton module object, so we can monkey-patch `createServer` on
// import and have the standalone server transparently terminate TLS.
//
// When the cert/key env vars are not set, this file just delegates to
// server.js untouched and the frontend keeps running plain HTTP. That
// lets the same container image work in dev (HTTP, no certs needed) and
// pilot (HTTPS, certs mounted from the shared TLS volume).
//
// Required env vars for HTTPS:
//   COMPLIANCE_FRONTEND_TLS_CERT_FILE  PEM-encoded server cert
//   COMPLIANCE_FRONTEND_TLS_KEY_FILE   PEM-encoded private key
//
// Optional:
//   COMPLIANCE_FRONTEND_TLS_CA_FILE    PEM-encoded CA chain (rarely
//                                       needed for a server cert; only
//                                       set if you also want client-
//                                       cert verification via
//                                       requestCert + rejectUnauthorized).

import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

// Default search paths inside the container. The wrapper falls back to
// these when the COMPLIANCE_FRONTEND_TLS_* env vars are unset, so the
// "drop the bundle into /run/secrets/compliantly and restart" workflow
// works zero-config. The first file that exists in each list wins.
// Multiple names are accepted so the wrapper interoperates with both
// the new gentls layout (frontend-server.{crt,key}) AND older bundles
// that used a single multi-SAN backend cert pair.
const DEFAULT_CERT_CANDIDATES = [
  '/run/secrets/compliantly/frontend-server.crt',
  '/run/secrets/compliantly/server.crt',
  '/run/secrets/compliantly/backend.crt',
]
const DEFAULT_KEY_CANDIDATES = [
  '/run/secrets/compliantly/frontend-server.key',
  '/run/secrets/compliantly/server.key',
  '/run/secrets/compliantly/backend.key',
]
const DEFAULT_CA_CANDIDATES = ['/run/secrets/compliantly/ca.crt']

function firstExisting(envValue, candidates) {
  const explicit = envValue?.trim()
  if (explicit) return explicit
  for (const path of candidates) {
    try {
      fs.accessSync(path, fs.constants.R_OK)
      return path
    } catch {
      // try next
    }
  }
  return undefined
}

const certFile = firstExisting(process.env.COMPLIANCE_FRONTEND_TLS_CERT_FILE, DEFAULT_CERT_CANDIDATES)
const keyFile = firstExisting(process.env.COMPLIANCE_FRONTEND_TLS_KEY_FILE, DEFAULT_KEY_CANDIDATES)
const caFile = firstExisting(process.env.COMPLIANCE_FRONTEND_TLS_CA_FILE, DEFAULT_CA_CANDIDATES)

if (certFile && keyFile) {
  let tlsOptions
  try {
    tlsOptions = {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    }
    if (caFile) tlsOptions.ca = fs.readFileSync(caFile)
  } catch (err) {
    console.error('[Attestiv] Failed to load frontend TLS material:', err.message)
    console.error('[Attestiv] Falling back to plain HTTP. Fix the cert paths or unset the env vars to suppress this warning.')
    tlsOptions = null
  }

  if (tlsOptions) {
    // Replace http.createServer with an https.createServer that wraps
    // whatever options + handler the Next.js standalone server passes
    // through. Three call shapes show up in the wild:
    //   http.createServer()                       → no-arg
    //   http.createServer(handler)                → handler only
    //   http.createServer({...opts}, handler)     → opts + handler
    const originalCreateServer = http.createServer.bind(http)
    http.createServer = function patchedCreateServer(...args) {
      let serverOptions = {}
      let requestListener
      if (args.length === 1 && typeof args[0] === 'function') {
        requestListener = args[0]
      } else if (args.length >= 1 && typeof args[0] === 'object' && args[0] !== null) {
        serverOptions = args[0]
        requestListener = args[1]
      }
      const merged = { ...serverOptions, ...tlsOptions }
      const server = https.createServer(merged, requestListener)
      // Mirror the noisy "http" name on logs in case Next.js inspects
      // the constructor name — harmless if it doesn't.
      Object.defineProperty(server.constructor, 'name', { value: 'Server' })
      return server
    }
    console.log(
      `[Attestiv] Frontend HTTPS enabled (cert=${certFile}${caFile ? `, ca=${caFile}` : ''})`,
    )
  }
} else if (certFile || keyFile) {
  // Asymmetric case usually means a perm trap: cert is 0644 (readable
  // by everyone) but key is 0600 (owner-only on host), so the
  // container's non-root user can read one but not the other.
  // Surface the unreadable candidates so the operator can fix perms
  // without re-running gen-tls in debug mode.
  const certHave = certFile ? `yes (${certFile})` : 'no'
  const keyHave = keyFile ? `yes (${keyFile})` : 'no'
  let unreadable = []
  if (!keyFile) {
    for (const p of DEFAULT_KEY_CANDIDATES) {
      try {
        fs.statSync(p)
        unreadable.push(p)
      } catch {
        // skip nonexistent
      }
    }
  }
  if (!certFile) {
    for (const p of DEFAULT_CERT_CANDIDATES) {
      try {
        fs.statSync(p)
        unreadable.push(p)
      } catch {
        // skip nonexistent
      }
    }
  }
  console.error(`[Attestiv] Asymmetric TLS material: cert=${certHave}, key=${keyHave}. Running plain HTTP.`)
  if (unreadable.length > 0) {
    console.error(`[Attestiv] These files exist but the container user can't read them (likely 0600 perms): ${unreadable.join(', ')}`)
    console.error('[Attestiv] Fix on the host: chmod 0644 <those files> (the bundle is a self-signed internal CA on a trusted host).')
  }
} else {
  console.log('[Attestiv] Frontend running plain HTTP (set COMPLIANCE_FRONTEND_TLS_CERT_FILE + KEY_FILE for HTTPS).')
}

// Hand off to the Next.js standalone server. Anything we patched on
// the http module is in place before this import resolves the
// standalone server's `require('http')`.
await import('./server.js')
