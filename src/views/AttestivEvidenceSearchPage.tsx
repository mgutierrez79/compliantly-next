'use client';
// Evidence / Search.
//
// Lookup by evidence ID, run ID, framework, or free-text. The Live
// stream is the always-on view; this is the targeted lookup. Both
// hit /v1/evidence/log; this page just adds query params and a
// keyboard-friendly form.

import { type FormEvent, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  GhostButton,
  PrimaryButton,
  SignatureBox,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n';

type EvidenceHit = {
  evidence_id: string
  source?: string
  event?: string
  timestamp?: string
  signature?: string
  signature_status?: 'signed' | 'dlq' | 'retrying' | 'unknown'
  frameworks?: string[]
  run_id?: string
}

const STATUS_TONE: Record<NonNullable<EvidenceHit['signature_status']>, 'green' | 'red' | 'amber' | 'gray'> = {
  signed: 'green',
  dlq: 'red',
  retrying: 'amber',
  unknown: 'gray',
}

export function AttestivEvidenceSearchPage() {
  const {
    t
  } = useI18n();

  const [query, setQuery] = useState('')
  const [framework, setFramework] = useState('')
  const [results, setResults] = useState<EvidenceHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (framework.trim()) params.set('framework', framework.trim())
      params.set('limit', '50')
      const response = await apiFetch(`/evidence/log?${params.toString()}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const body = await response.json().catch(() => ({}))
      const items: any[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []
      const mapped: EvidenceHit[] = items.map((item) => {
        // The on-disk evidence log uses `report_signature` (Ed25519 hex
        // hash) and stashes the connector source under metadata.source.
        // Fall through to the legacy top-level fields if a future
        // emitter does add them so the row still renders right.
        const signature: string | undefined =
          (typeof item?.signature === 'string' && item.signature) ||
          (typeof item?.report_signature === 'string' && item.report_signature) ||
          undefined
        const source: string | undefined =
          (typeof item?.source === 'string' && item.source) ||
          (typeof item?.metadata?.source === 'string' && item.metadata.source) ||
          (typeof item?.metadata?.connectors === 'string' && item.metadata.connectors) ||
          undefined
        return {
          evidence_id: String(item?.evidence_id ?? item?.id ?? item?.run_id ?? ''),
          source,
          event: item?.event ?? item?.name,
          timestamp: item?.timestamp ?? item?.created_at,
          signature,
          signature_status: item?.signature_status ?? (signature ? 'signed' : 'unknown'),
          frameworks: Array.isArray(item?.frameworks) ? item.frameworks : undefined,
          run_id: item?.run_id,
        }
      })
      setResults(mapped)
    } catch (err: any) {
      setError(err?.message ?? 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Topbar
        title={t('Search evidence', 'Search evidence')}
        right={
          <GhostButton onClick={() => undefined}>
            <i className="ti ti-list" aria-hidden="true" />
            {t('Live stream', 'Live stream')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        <Card>
          <CardTitle>{t('Search', 'Search')}</CardTitle>
          <form onSubmit={search}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>
                  {t('Evidence ID, run, source, or text', 'Evidence ID, run, source, or text')}
                </label>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('e.g. ev-2026-05-08-...', 'e.g. ev-2026-05-08-...')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '0.5px solid var(--color-border-secondary)',
                    borderRadius: 'var(--border-radius-md)',
                    background: 'var(--color-background-primary)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>
                  {t('Framework', 'Framework')}
                </label>
                <input
                  value={framework}
                  onChange={(event) => setFramework(event.target.value)}
                  placeholder={t('soc2 / iso27001 / ...', 'soc2 / iso27001 / ...')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '0.5px solid var(--color-border-secondary)',
                    borderRadius: 'var(--border-radius-md)',
                    background: 'var(--color-background-primary)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <PrimaryButton type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'attestiv-spin 1s linear infinite' }} />
                    {t('Searching…', 'Searching…')}
                  </>
                ) : (
                  <>
                    <i className="ti ti-search" aria-hidden="true" />
                    {t('Search', 'Search')}
                  </>
                )}
              </PrimaryButton>
            </div>
          </form>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{results.length} matches</span>}>
            {t('Results', 'Results')}
          </CardTitle>
          {error ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-status-red-deep)',
                background: 'var(--color-status-red-bg)',
                padding: '8px 12px',
                borderRadius: 'var(--border-radius-md)',
                marginBottom: 8,
              }}
            >
              {error}
            </div>
          ) : null}
          {!searched ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {t(
                'Enter a query to search the evidence log. Filters narrow by framework or run.',
                'Enter a query to search the evidence log. Filters narrow by framework or run.'
              )}
            </div>
          ) : results.length === 0 && !loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('No evidence matches.', 'No evidence matches.')}</div>
          ) : (
            <div>
              {results.map((hit) => (
                <EvidenceHitRow key={hit.evidence_id} hit={hit} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function EvidenceHitRow({ hit }: { hit: EvidenceHit }) {
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>
          {hit.evidence_id}
        </span>
        {hit.signature_status ? <Badge tone={STATUS_TONE[hit.signature_status]}>{hit.signature_status}</Badge> : null}
        {hit.source ? <Badge tone="navy">{hit.source}</Badge> : null}
        {hit.frameworks?.map((framework) => (
          <Badge key={framework} tone="blue">
            {framework}
          </Badge>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {hit.timestamp ? formatTimestamp(hit.timestamp) : '—'}
        </span>
      </div>
      {hit.event ? <div style={{ color: 'var(--color-text-secondary)' }}>{hit.event}</div> : null}
      {hit.signature ? <SignatureBox label="signature" value={hit.signature} /> : null}
    </div>
  )
}

function formatTimestamp(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}
