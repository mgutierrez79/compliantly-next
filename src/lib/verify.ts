// Phase 4.6: client-side Ed25519 signature verification.
//
// This module lets the UI verify a manifest signature with only the
// public key the platform publishes at /v1/public/keys — exactly the
// path an external auditor would take. No bearer token, no shared
// secret. If the verify here passes, you have proof that the
// manifest was signed by the holder of the private key bound to
// `kid` and has not been modified since.
//
// Web Crypto's Ed25519 support: Chrome/Edge 113+, Firefox 130+,
// Safari 17.4+. Older browsers fall through to a clear "verification
// unavailable in this browser" message rather than a silent pass.

import { apiJson } from './api'

export type PublicKey = {
  kid: string
  algorithm: 'ed25519' | string
  public_key: string
  created_at: string
  retired_at?: string | null
}

export type PublicKeysResponse = {
  active_kid: string
  keys: PublicKey[]
}

export type ManifestPayload = Record<string, unknown> & {
  signature?: string
  kid?: string
  integrity?: { signature?: string; kid?: string }
}

export type VerifyResult =
  | { status: 'valid'; kid: string }
  | { status: 'invalid'; reason: string }
  | { status: 'unsupported'; reason: string }

let cachedKeys: PublicKey[] | null = null
let cachedActiveKid: string | null = null

export async function loadPublicKeys(force = false): Promise<PublicKey[]> {
  if (!force && cachedKeys) return cachedKeys
  const response = await apiJson<PublicKeysResponse>('/public/keys')
  cachedKeys = response.keys || []
  cachedActiveKid = response.active_kid || null
  return cachedKeys
}

export function activeKeyID(): string | null {
  return cachedActiveKid
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  // Explicitly back the array with a plain ArrayBuffer so the result
  // satisfies BufferSource for crypto.subtle.{importKey,verify}. The
  // Uint8Array(length) shorthand returns Uint8Array<ArrayBufferLike>,
  // which TypeScript rejects against the stricter modern signatures.
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// canonicalSigningPayload reconstructs the bytes the server signed,
// mirroring internal/manifest/manifest.go signaturePayload + canonicalJSON.
// The `signature` field is stripped from both the top level and from
// integrity (the server zeroes integrity.signature with nil before
// signing, then writes the actual value back). kid stays intact —
// it's part of the signed payload by design.
function canonicalSigningPayload(manifest: ManifestPayload): Uint8Array<ArrayBuffer> {
  const clone: Record<string, unknown> = { ...manifest }
  delete clone.signature
  if (clone.integrity && typeof clone.integrity === 'object') {
    const integrity = { ...(clone.integrity as Record<string, unknown>) }
    integrity.signature = null
    clone.integrity = integrity
  }
  // Canonical JSON for the platform = json.Encoder with HTML escape
  // disabled, no trailing newline. JSON.stringify in JS produces the
  // same shape because it sorts struct fields in declaration order
  // (server-side) and we sort objects by key here to match. Maps in Go
  // marshal in sorted key order; JSON.stringify does not sort, so we
  // sort manually for any plain objects.
  const sortedJSON = stableStringify(clone)
  // TextEncoder.encode returns Uint8Array<ArrayBufferLike>; copy into a
  // fresh ArrayBuffer-backed view so it satisfies the strict
  // BufferSource expected by crypto.subtle.verify.
  const encoded = new TextEncoder().encode(sortedJSON)
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength))
  out.set(encoded)
  return out
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts = keys.map((key) => JSON.stringify(key) + ':' + stableStringify(obj[key]))
    return '{' + parts.join(',') + '}'
  }
  return 'null'
}

// verifyManifest verifies the manifest's Ed25519 signature using the
// public key bound to its `kid` field. Returns a structured result so
// callers can render the failure reason instead of a generic "false".
export async function verifyManifest(manifest: ManifestPayload): Promise<VerifyResult> {
  const signature = manifest.signature ?? manifest.integrity?.signature
  const kid = manifest.kid ?? manifest.integrity?.kid
  if (!signature || typeof signature !== 'string') {
    return { status: 'invalid', reason: 'manifest has no signature' }
  }
  if (!kid || typeof kid !== 'string') {
    return { status: 'invalid', reason: 'manifest has no key id (legacy HMAC manifest)' }
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return { status: 'unsupported', reason: 'Web Crypto not available in this context' }
  }
  let keys: PublicKey[]
  try {
    keys = await loadPublicKeys()
  } catch (err) {
    return {
      status: 'invalid',
      reason: `failed to load public keys: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  const match = keys.find((k) => k.kid === kid)
  if (!match) {
    return { status: 'invalid', reason: `no public key registered for kid=${kid}` }
  }
  if (match.algorithm !== 'ed25519') {
    return { status: 'unsupported', reason: `unsupported algorithm ${match.algorithm}` }
  }
  let cryptoKey: CryptoKey
  try {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(match.public_key),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
  } catch (err) {
    return {
      status: 'unsupported',
      reason: `Ed25519 import failed (browser may not support it): ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  const signedBytes = canonicalSigningPayload(manifest)
  const signatureBytes = base64ToBytes(signature)
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, signatureBytes, signedBytes)
  if (!ok) {
    return { status: 'invalid', reason: 'signature does not match published public key' }
  }
  return { status: 'valid', kid }
}
