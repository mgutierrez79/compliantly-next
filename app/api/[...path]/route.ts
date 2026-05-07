import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import type { OutgoingHttpHeaders } from 'node:http'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ path?: string[] }>
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

let cachedTLSOptions: https.RequestOptions | null | undefined

function apiProxyTarget(): URL {
  return new URL(process.env.COMPLIANCE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080')
}

function apiProxyTLSOptions(): https.RequestOptions | null {
  if (cachedTLSOptions !== undefined) return cachedTLSOptions

  const certFile = process.env.COMPLIANCE_API_PROXY_CLIENT_CERT_FILE
  const keyFile = process.env.COMPLIANCE_API_PROXY_CLIENT_KEY_FILE
  const caFile = process.env.COMPLIANCE_API_PROXY_CA_FILE
  const servername = process.env.COMPLIANCE_API_PROXY_SERVER_NAME
  const insecureSkipVerify = process.env.COMPLIANCE_API_PROXY_INSECURE_SKIP_VERIFY === '1'

  if (!certFile && !keyFile && !caFile && !servername && !insecureSkipVerify) {
    cachedTLSOptions = null
    return cachedTLSOptions
  }
  if ((certFile && !keyFile) || (!certFile && keyFile)) {
    throw new Error(
      'Both COMPLIANCE_API_PROXY_CLIENT_CERT_FILE and COMPLIANCE_API_PROXY_CLIENT_KEY_FILE are required for mTLS.',
    )
  }

  cachedTLSOptions = {
    ...(certFile && keyFile
      ? {
          cert: fs.readFileSync(certFile),
          key: fs.readFileSync(keyFile),
        }
      : {}),
    ...(caFile ? { ca: fs.readFileSync(caFile) } : {}),
    ...(servername ? { servername } : {}),
    ...(insecureSkipVerify ? { rejectUnauthorized: false } : {}),
  }
  return cachedTLSOptions
}

function filteredRequestHeaders(request: NextRequest, bodyLength: number | null): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {}
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'host' || HOP_BY_HOP_HEADERS.has(lower)) return
    headers[key] = value
  })

  const host = request.headers.get('host')
  if (host) headers['x-forwarded-host'] = host
  headers['x-forwarded-proto'] = request.nextUrl.protocol.replace(':', '')
  if (bodyLength !== null) headers['content-length'] = String(bodyLength)
  return headers
}

function filteredResponseHeaders(upstreamHeaders: http.IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower) || value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const targetBase = apiProxyTarget()
  const { path = [] } = await context.params
  const targetPath = `/${path.map(encodeURIComponent).join('/')}`
  const targetURL = new URL(targetPath, targetBase)
  targetURL.search = request.nextUrl.search

  const method = request.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : null
  const headers = filteredRequestHeaders(request, body ? body.length : null)
  const tlsOptions = targetURL.protocol === 'https:' ? apiProxyTLSOptions() : null

  return new Promise<Response>((resolve) => {
    const client = targetURL.protocol === 'https:' ? https : http
    const upstream = client.request(
      targetURL,
      {
        method,
        headers,
        ...(tlsOptions ?? {}),
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = []
        upstreamResponse.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        upstreamResponse.on('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: upstreamResponse.statusCode ?? 502,
              headers: filteredResponseHeaders(upstreamResponse.headers),
            }),
          )
        })
      },
    )

    upstream.on('error', (error) => {
      resolve(
        Response.json(
          {
            detail: 'upstream request failed',
            message: error.message,
          },
          { status: 502 },
        ),
      )
    })

    if (body && body.length) upstream.write(body)
    upstream.end()
  })
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function HEAD(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}
