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

const certFile = process.env.COMPLIANCE_FRONTEND_TLS_CERT_FILE?.trim()
const keyFile = process.env.COMPLIANCE_FRONTEND_TLS_KEY_FILE?.trim()
const caFile = process.env.COMPLIANCE_FRONTEND_TLS_CA_FILE?.trim()

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
  console.error('[Attestiv] Only one of COMPLIANCE_FRONTEND_TLS_CERT_FILE / KEY_FILE is set; need both for HTTPS. Running plain HTTP.')
} else {
  console.log('[Attestiv] Frontend running plain HTTP (set COMPLIANCE_FRONTEND_TLS_CERT_FILE + KEY_FILE for HTTPS).')
}

// Hand off to the Next.js standalone server. Anything we patched on
// the http module is in place before this import resolves the
// standalone server's `require('http')`.
await import('./server.js')
