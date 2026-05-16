'use client';
// Evidence stream — mockup 01 evidence section.
//
// Two stacked cards:
//   1. "Incoming evidence — signed in real time" — list of evidence
//      records pulled from /v1/evidence/log. Each row shows the
//      truncated evidence id, a human-readable name, the kind +
//      timestamp, the truncated Ed25519 signature, the framework
//      tags, and a Signed/DLQ badge.
//   2. "Signature verification" — paste an evidence id (or run id),
//      the page fetches /v1/runs/{runId}/manifest and verifies it
//      offline using the Ed25519 public key from /v1/public/keys.
//      Status panel matches the mockup's sig-box style.
//
// Phase 4.6's verify code lives in src/lib/verify.ts; we reuse it
// here so the verification proof is the same as on the legacy
// evidence-log page (now retired).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Badge, Banner, Card, CardTitle, EmptyState, GhostButton, PrimaryButton, Pulse, Skeleton, Topbar } from '../components/AttestivUi'
import { loadPublicKeys, verifyManifest, type ManifestPayload, type VerifyResult } from '../lib/verify'

import { useI18n } from '../lib/i18n';

type EvidenceLogEntry = {
  run_id?: string
  evidence_id?: string
  timestamp?: string
  source?: string
  kind?: string
  section?: string
  frameworks?: string[]
  signature?: string | null
  report_signature?: string | null
  run_hash?: string | null
  status?: string
  finding_count?: number
  risk_score?: number
  metadata?: Record<string, unknown>
}
type EvidenceLogResponse = {
  items: EvidenceLogEntry[]
  count: number
}
type RunManifestResponse = {
  run_id: string
  manifest: ManifestPayload
}

function truncate(value: string | null | undefined, head = 12): string {
  if (!value) return ''
  if (value.length <= head + 3) return value
  return `${value.slice(0, head)}…`
}

function evidenceTitle(entry: EvidenceLogEntry): string {
  if (entry.kind && entry.source) {
    const friendly = entry.source.split(/[:\/]/)[0]
    const kind = entry.kind.replace(/_/g, ' ')
    return `${friendly[0].toUpperCase()}${friendly.slice(1)} — ${kind}`
  }
  // Run summary: frameworks + finding count + risk
  if (entry.run_id && (Array.isArray(entry.frameworks) || typeof entry.risk_score === 'number')) {
    const frameworks = Array.isArray(entry.frameworks) && entry.frameworks.length
      ? entry.frameworks.join(', ').toUpperCase()
      : 'all frameworks'
    const findings = Number.isFinite(entry.finding_count) ? Number(entry.finding_count) : 0
    const risk = Number.isFinite(entry.risk_score) ? Number(entry.risk_score) : 0
    return `Run report — ${frameworks} · ${findings === 1 ? '1 finding' : `${findings} findings`} · risk ${risk}`
  }
  if (entry.run_id) return `Run ${entry.run_id}`
  return 'Evidence record'
}

function evidenceMeta(entry: EvidenceLogEntry): string {
  const parts: string[] = []
  if (entry.kind) parts.push(entry.kind)
  if (entry.section) parts.push(entry.section)
  if (entry.run_id && !entry.kind) parts.push(entry.run_id)
  if (entry.timestamp) parts.push(`${entry.timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`)
  return parts.join(' · ')
}

function isDLQ(entry: EvidenceLogEntry): boolean {
  const status = (entry.status || '').toLowerCase()
  return status === 'dead_letter' || status === 'dlq' || status === 'failed'
}

export function AttestivEvidenceStream() {
  const {
    t
  } = useI18n();

  const [items, setItems] = useState<EvidenceLogEntry[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifyId, setVerifyId] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [publicKeyUrl, setPublicKeyUrl] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const response = await apiJson<EvidenceLogResponse>('/evidence/log?limit=50')
      setItems(response.items || [])
      setError(null)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const handle = window.setInterval(() => void reload(), 10_000)
    return () => window.clearInterval(handle)
  }, [reload])

  // Pre-warm the public-key cache so the first verify click is fast.
  // We also stash the active key id for the sig-box display.
  useEffect(() => {
    let cancelled = false
    loadPublicKeys()
      .then((keys) => {
        if (cancelled) return
        if (keys.length) setPublicKeyUrl(`/v1/public/keys/${keys[0].kid}`)
      })
      .catch(() => {
        // Verify still works lazily; this is just a UX warm-up.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const verify = async () => {
    const target = verifyId.trim()
    if (!target) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      // Accept either a raw run id or "evd_..." style. Strip evd_ if
      // present and treat the remainder as a run id, since manifests
      // are addressed by run id today.
      const runId = target.replace(/^evd_/, '')
      const response = await apiJson<RunManifestResponse>(`/runs/${encodeURIComponent(runId)}/manifest`)
      const result = await verifyManifest(response.manifest)
      setVerifyResult(result)
    } catch (err) {
      const apiError = err as ApiError
      setVerifyResult({ status: 'invalid', reason: apiError.message || 'failed to load manifest' })
    } finally {
      setVerifying(false)
    }
  }

  const verifyStatusLine = useMemo(() => {
    const {
      t
    } = useI18n();

    if (!verifyResult) {
      return <span style={{ color: 'var(--color-text-tertiary)' }}>{t('Status: not checked', 'Status: not checked')}</span>;
    }
    if (verifyResult.status === 'valid') {
      return (
        <span style={{ color: 'var(--color-status-green-mid)' }}>
          {t(
            '✓ VALID — evidence unmodified since signing (kid',
            '✓ VALID — evidence unmodified since signing (kid'
          )} {verifyResult.kid})
                  </span>
      );
    }
    if (verifyResult.status === 'unsupported') {
      return (
        <span style={{ color: 'var(--color-status-amber-text)' }}>
          {t('⚠ Verification unavailable:', '⚠ Verification unavailable:')} {verifyResult.reason}
        </span>
      );
    }
    return (
      <span style={{ color: 'var(--color-status-red-deep)' }}>
        {t('✗ INVALID —', '✗ INVALID —')} {verifyResult.reason}
      </span>
    );
  }, [verifyResult])

  return (
    <>
      <Topbar
        title={t('Evidence stream', 'Evidence stream')}
        left={<Badge tone="green"><Pulse /> {t('Live', 'Live')}</Badge>}
        right={<GhostButton><i className="ti ti-filter" aria-hidden="true" style={{ fontSize: 13 }} /> {t('Filter', 'Filter')}</GhostButton>}
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{t('Failed to load evidence:', 'Failed to load evidence:')} {error.message}</Banner> : null}

        <Card>
          <CardTitle>{t(
            'Incoming evidence — signed in real time',
            'Incoming evidence — signed in real time'
          )}</CardTitle>
          {loading && items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Skeleton width={100} height={10} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="55%" height={12} />
                    <div style={{ marginTop: 4 }}>
                      <Skeleton width="80%" height={10} />
                    </div>
                  </div>
                  <Skeleton width={50} height={18} rounded={9} />
                </div>
              ))}
            </div>
          ) : items.length ? (
            items.slice(0, 30).map((entry, index) => (
              <EvidenceRow
                key={`${entry.evidence_id || entry.run_id}-${entry.timestamp}-${index}`}
                entry={entry}
              />
            ))
          ) : (
            <EmptyState
              icon="ti-file-certificate"
              title={t('No evidence records yet', 'No evidence records yet')}
              description={t(
                'Once a connector starts signing, records will appear here in real time.',
                'Once a connector starts signing, records will appear here in real time.'
              )}
            />
          )}
        </Card>

        <Card>
          <CardTitle>{t('Signature verification', 'Signature verification')}</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {t(
              'Paste any evidence id or run id to verify its cryptographic signature offline. The browser fetches\n            only the public key — Attestiv never sees the verification.',
              'Paste any evidence id or run id to verify its cryptographic signature offline. The browser fetches\n            only the public key — Attestiv never sees the verification.'
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={verifyId}
              onChange={(event) => setVerifyId(event.target.value)}
              placeholder={t('evd_a1b2c3d4 or run-20260508-1422', 'evd_a1b2c3d4 or run-20260508-1422')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void verify()
              }}
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 'var(--border-radius-md)',
                padding: '7px 10px',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
              }}
            />
            <PrimaryButton onClick={() => void verify()} disabled={verifying || !verifyId.trim()}>
              {verifying ? 'Verifying…' : 'Verify'}
            </PrimaryButton>
          </div>
          <SigBox>
            {t('Public key:', 'Public key:')} {publicKeyUrl || '/v1/public/keys/...'}
            <br />
            {t('Algorithm: Ed25519', 'Algorithm: Ed25519')}
            <br />
            {verifyStatusLine}
          </SigBox>
        </Card>
      </div>
    </>
  );
}

function EvidenceRow({ entry }: { entry: EvidenceLogEntry }) {
  const {
    t
  } = useI18n();

  const dlq = isDLQ(entry)
  const id = entry.evidence_id || entry.run_id || ''
  const signature = entry.signature || entry.report_signature || ''
  const algoPrefix = signature ? 'ed25519' : 'no-sig'
  const tags = entry.frameworks && entry.frameworks.length ? entry.frameworks.join(' · ') : ''
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--color-text-tertiary)',
          width: 110,
          flexShrink: 0,
          paddingTop: 1,
        }}
      >
        {truncate(id, 14)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
          {evidenceTitle(entry)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.4,
          }}
        >
          {evidenceMeta(entry)}
        </div>
        {dlq ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--color-status-red-deep)',
              marginTop: 2,
            }}
          >
            {t('DLQ — see Issues for retry history', 'DLQ — see Issues for retry history')}
            {tags ? ` · ${tags}` : ''}
          </div>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--color-text-tertiary)',
              marginTop: 2,
            }}
          >
            {signature ? `${algoPrefix}:${truncate(signature, 16)}` : 'unsigned'}
            {tags ? ` · ${tags}` : ''}
          </div>
        )}
      </div>
      <Badge tone={dlq ? 'red' : 'green'}>{dlq ? 'DLQ' : 'Signed'}</Badge>
    </div>
  );
}

function SigBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-background-secondary)',
        borderRadius: 'var(--border-radius-md)',
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--color-text-secondary)',
        lineHeight: 1.7,
        wordBreak: 'break-all',
        marginTop: 8,
      }}
    >
      {children}
    </div>
  )
}
