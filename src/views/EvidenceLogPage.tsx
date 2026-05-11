'use client';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, Input, Label, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'
import { verifyManifest, type ManifestPayload, type VerifyResult } from '../lib/verify'

import { useI18n } from '../lib/i18n';

type RunManifestResponse = {
  run_id: string
  path: string
  manifest: ManifestPayload
  signature_status?: { valid?: boolean | null }
}

type EvidenceLogEntry = {
  run_id: string
  timestamp: string
  frameworks?: string[]
  risk_score?: number | null
  finding_count?: number | null
  report_signature?: string | null
  run_hash?: string | null
  metadata?: Record<string, unknown>
}

type EvidenceLogResponse = {
  items: EvidenceLogEntry[]
  count: number
  limit: number
  offset: number
}

function VerifyBadge({ result }: { result: VerifyResult }) {
  const {
    t
  } = useI18n();

  // The status text is intentionally explicit — "verified offline"
  // tells the user the proof did not depend on the server's word.
  if (result.status === 'valid') {
    return (
      <div className="mt-3 rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
        {t(
          '✓ Signature verified offline using public key',
          '✓ Signature verified offline using public key'
        )}{' '}
        <span className="font-mono text-[10px]">{result.kid}</span>{t(
          '. The manifest has not been\n        modified since signing.',
          '. The manifest has not been\n        modified since signing.'
        )}
      </div>
    );
  }
  if (result.status === 'unsupported') {
    return (
      <div className="mt-3 rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
        {t('⚠ Verification unavailable:', '⚠ Verification unavailable:')} {result.reason}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-rose-700/60 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
      {t('✗ Signature did not verify:', '✗ Signature did not verify:')} {result.reason}
    </div>
  );
}

function toIso(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString()
}

function formatMetadata(entry: EvidenceLogEntry): string {
  const metadata = entry.metadata ?? {}
  if (!Object.keys(metadata).length) return '—'
  const serialized = JSON.stringify(metadata, null, 2)
  if (serialized.length <= 500) return serialized
  return `${serialized.slice(0, 500)}\n…`
}

export function EvidenceLogPage() {
  const {
    t
  } = useI18n();

  const [items, setItems] = useState<EvidenceLogEntry[]>([])
  const [count, setCount] = useState(0)
  const [limit, setLimit] = useState(200)
  const [offset, setOffset] = useState(0)
  const [runFilter, setRunFilter] = useState('')
  const [frameworkFilter, setFrameworkFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [untilFilter, setUntilFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [exporting, setExporting] = useState(false)
  // Per-row verification state. Keyed by run_id so users see live
  // status without us replaying the verify on every render.
  const [verifying, setVerifying] = useState<Record<string, boolean>>({})
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({})

  const verify = async (runID: string) => {
    if (!runID) return
    setVerifying((prev) => ({ ...prev, [runID]: true }))
    try {
      const response = await apiJson<RunManifestResponse>(`/runs/${encodeURIComponent(runID)}/manifest`)
      const result = await verifyManifest(response.manifest)
      setVerifyResults((prev) => ({ ...prev, [runID]: result }))
    } catch (err) {
      const apiError = err as ApiError
      setVerifyResults((prev) => ({
        ...prev,
        [runID]: { status: 'invalid', reason: apiError.message || 'failed to load manifest' },
      }))
    } finally {
      setVerifying((prev) => ({ ...prev, [runID]: false }))
    }
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (runFilter.trim()) params.set('run_id', runFilter.trim())
    if (frameworkFilter.trim()) params.set('framework', frameworkFilter.trim())
    if (sinceFilter.trim()) params.set('since', toIso(sinceFilter.trim()))
    if (untilFilter.trim()) params.set('until', toIso(untilFilter.trim()))
    return params.toString()
  }, [limit, offset, runFilter, frameworkFilter, sinceFilter, untilFilter])

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (runFilter.trim()) params.set('run_id', runFilter.trim())
    if (frameworkFilter.trim()) params.set('framework', frameworkFilter.trim())
    if (sinceFilter.trim()) params.set('since', toIso(sinceFilter.trim()))
    if (untilFilter.trim()) params.set('until', toIso(untilFilter.trim()))
    return params.toString()
  }, [runFilter, frameworkFilter, sinceFilter, untilFilter])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const response = await apiJson<EvidenceLogResponse>(`/evidence/log?${queryString}`)
      setItems(response.items || [])
      setCount(response.count ?? 0)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void load()
  }, [load])

  const clearFilters = () => {
    setRunFilter('')
    setFrameworkFilter('')
    setSinceFilter('')
    setUntilFilter('')
    setOffset(0)
  }

  const exportLog = async (format: 'csv' | 'jsonl') => {
    setExporting(true)
    setError(null)
    try {
      const suffix = exportQuery ? `?${exportQuery}&format=${format}` : `?format=${format}`
      const response = await apiFetch(`/evidence/log/export${suffix}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = format === 'csv' ? 'evidence-log.csv' : 'evidence-log.jsonl'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setExporting(false)
    }
  }

  const hasPrev = offset > 0
  const hasNext = offset + limit < count

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{t('Evidence Log', 'Evidence Log')}</PageTitle>
        <div className="text-xs text-slate-400">{count} entry(s)</div>
      </div>
      {error ? <ErrorBox title={t('Evidence log error', 'Evidence log error')} detail={error.message} /> : null}
      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>{t('Run id contains', 'Run id contains')}</Label>
            <Input
              value={runFilter}
              onChange={(event) => {
                setRunFilter(event.target.value)
                setOffset(0)
              }}
              placeholder="run-2026"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('Framework contains', 'Framework contains')}</Label>
            <Input
              value={frameworkFilter}
              onChange={(event) => {
                setFrameworkFilter(event.target.value)
                setOffset(0)
              }}
              placeholder="iso27001"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('Since', 'Since')}</Label>
            <Input
              type="datetime-local"
              value={sinceFilter}
              onChange={(event) => {
                setSinceFilter(event.target.value)
                setOffset(0)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('Until', 'Until')}</Label>
            <Input
              type="datetime-local"
              value={untilFilter}
              onChange={(event) => {
                setUntilFilter(event.target.value)
                setOffset(0)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('Page size', 'Page size')}</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(event) => {
                const next = Number(event.target.value || 0)
                setLimit(next > 0 ? Math.min(next, 1000) : 200)
                setOffset(0)
              }}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          <Button onClick={clearFilters} disabled={loading}>
            {t('Clear filters', 'Clear filters')}
          </Button>
          <Button onClick={() => exportLog('csv')} disabled={exporting}>
            {t('Export CSV', 'Export CSV')}
          </Button>
          <Button onClick={() => exportLog('jsonl')} disabled={exporting}>
            {t('Export JSONL', 'Export JSONL')}
          </Button>
          <span className="text-xs text-slate-400">
            {t('Showing', 'Showing')} {count === 0 ? 0 : offset + 1}-{Math.min(offset + limit, count)}of {count}
          </span>
        </div>
      </Card>
      <Card>
        <div className="grid gap-3">
          {items.length ? (
            items.map((entry, index) => {
              const {
                t
              } = useI18n();

              const result = verifyResults[entry.run_id]
              const isVerifying = !!verifying[entry.run_id]
              return (
                <div
                  key={`${entry.run_id}-${entry.timestamp}-${index}`}
                  className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{entry.run_id}</div>
                      <div className="text-xs text-slate-400">{formatTimestamp(entry.timestamp)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-300">
                        {entry.frameworks?.length ? entry.frameworks.join(', ') : 'no frameworks'}
                      </div>
                      <Button size="sm" onClick={() => verify(entry.run_id)} disabled={isVerifying || !entry.run_id}>
                        {isVerifying ? 'Verifying…' : 'Verify signature'}
                      </Button>
                    </div>
                  </div>
                  {result ? <VerifyBadge result={result} /> : null}
                  <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
                    <div>{t('Risk score:', 'Risk score:')} {entry.risk_score ?? 'n/a'}</div>
                    <div>{t('Findings:', 'Findings:')} {entry.finding_count ?? 'n/a'}</div>
                    <div className="break-all">{t('Signature:', 'Signature:')} {entry.report_signature || 'n/a'}</div>
                    <div className="break-all">{t('Run hash:', 'Run hash:')} {entry.run_hash || 'n/a'}</div>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-[#233a61] bg-[#0d1a2b] p-3 text-xs text-slate-200">
                    {formatMetadata(entry)}
                  </pre>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-slate-400">{t(
              'No evidence log entries recorded yet.',
              'No evidence log entries recorded yet.'
            )}</div>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={!hasPrev || loading}>
          {t('Previous', 'Previous')}
        </Button>
        <Button onClick={() => setOffset(offset + limit)} disabled={!hasNext || loading}>
          {t('Next', 'Next')}
        </Button>
      </div>
    </div>
  );
}
