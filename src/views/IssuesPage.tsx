'use client';
// Phase 4.4 + 4.5: the operator's failure inbox.
//
// This page collects the three categories of "evidence that did not
// make it" so a compliance manager can see what is missing without
// reverse-engineering it from the connectors page or the audit log:
//
//   1. Failed collections — connectors with non-zero failure_count
//      from /v1/connectors. Surfaces last_error and partial_failures.
//   2. DLQ — items from the ingestion store with status=dead_letter,
//      including processor-failure entries (Phase 3.3).
//   3. Stale evidence — connectors whose last successful collection
//      is older than 2× their declared poll interval.
//
// Compliance teams must see what is missing, not only what succeeded.
// The /v1/issues/summary numbers feed the nav badge in Layout.tsx.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'

import { useI18n } from '../lib/i18n';

type Tab = 'dlq' | 'failed' | 'stale'

type ConnectorAlert = { key?: string; level?: string; message?: string }
type ConnectorStatus = {
  name: string
  label?: string
  status?: string
  last_run?: string | null
  last_success?: string | null
  last_error?: { timestamp?: string | null; message?: string | null } | string | null
  success_count?: number
  failure_count?: number
  partial_failure_count?: number
  poll_interval_seconds?: number
  delivery_mode?: string
  alerts?: ConnectorAlert[]
}

type ConnectorsResponse = { connectors: ConnectorStatus[] }

type DLQRecord = {
  queue_id: string
  envelope_id?: string
  queue?: string
  status?: string
  stage?: string
  run_id?: string
  tenant_id?: string
  error?: string | null
  attempts?: number
  created_at?: string
  updated_at?: string
  failed_at?: string
  envelope?: { source?: string; section?: string; tenant_id?: string }
  dlq_attempts?: Array<{
    attempt: number
    started_at: string
    retried_by?: string
    previous_error?: string
    outcome?: string
  }>
}

type IngestQueueResponse = { items: DLQRecord[]; count: number }

const STALE_FALLBACK_SECONDS = 24 * 3600 // 24h when no poll interval declared

function lastErrorMessage(value: ConnectorStatus['last_error']): string | null {
  if (!value) return null
  if (typeof value === 'string') return value || null
  return value.message || null
}

function isStale(connector: ConnectorStatus, now: Date): boolean {
  if (connector.delivery_mode === 'stream') {
    // Streaming sources are stale when no event has arrived in 2× the
    // backstop poll interval (default 5 minutes if undeclared).
    const lastSeen = connector.last_run || connector.last_success
    if (!lastSeen) return true
    const interval = (connector.poll_interval_seconds || 60) * 2 * 1000
    return now.getTime() - new Date(lastSeen).getTime() > interval
  }
  if (!connector.last_success) {
    // Polling source that has never succeeded is itself a problem,
    // surface it on the stale tab so the operator notices.
    return true
  }
  const interval = (connector.poll_interval_seconds || STALE_FALLBACK_SECONDS) * 2 * 1000
  return now.getTime() - new Date(connector.last_success).getTime() > interval
}

export function IssuesPage() {
  const {
    t
  } = useI18n();

  const [tab, setTab] = useState<Tab>('dlq')
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [dlq, setDlq] = useState<DLQRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [connectorsResponse, dlqResponse] = await Promise.all([
        apiJson<ConnectorsResponse>('/connectors'),
        apiJson<IngestQueueResponse>('/ingest/queue?queue=dead_letter&status=dead_letter&limit=200'),
      ])
      setConnectors(connectorsResponse.connectors || [])
      setDlq(dlqResponse.items || [])
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // Background refresh every 30s so newly DLQ'd items show up
    // without requiring a manual click.
    const handle = window.setInterval(() => {
      void reload()
    }, 30_000)
    return () => window.clearInterval(handle)
  }, [reload])

  const failed = useMemo(() => connectors.filter((c) => (c.failure_count || 0) > 0), [connectors])
  const stale = useMemo(() => {
    const now = new Date()
    return connectors.filter((c) => isStale(c, now))
  }, [connectors])

  const counts = {
    dlq: dlq.length,
    failed: failed.length,
    stale: stale.length,
  }

  const retry = async (queueId: string) => {
    setRetrying(queueId)
    setRetryMessage(null)
    try {
      await apiFetch(`/ingest/dlq/${encodeURIComponent(queueId)}/retry`, { method: 'POST' })
      setRetryMessage(`Requeued ${queueId}.`)
      await reload()
    } catch (err) {
      const apiError = err as ApiError
      setRetryMessage(`Retry failed: ${apiError.message}`)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{t('Issues', 'Issues')}</PageTitle>
        <div className="text-xs text-slate-400">
          {loading ? 'Refreshing…' : 'Auto-refreshes every 30s'}
        </div>
      </div>
      {error ? <ErrorBox title={t('Failed to load issues', 'Failed to load issues')} detail={error.message} /> : null}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1f365a] pb-3">
        <TabButton active={tab === 'dlq'} onClick={() => setTab('dlq')}>
          {t('Dead-letter queue', 'Dead-letter queue')} <Pill count={counts.dlq} tone={counts.dlq > 0 ? 'danger' : 'neutral'} />
        </TabButton>
        <TabButton active={tab === 'failed'} onClick={() => setTab('failed')}>
          {t('Failed collections', 'Failed collections')} <Pill count={counts.failed} tone={counts.failed > 0 ? 'warn' : 'neutral'} />
        </TabButton>
        <TabButton active={tab === 'stale'} onClick={() => setTab('stale')}>
          {t('Stale evidence', 'Stale evidence')} <Pill count={counts.stale} tone={counts.stale > 0 ? 'warn' : 'neutral'} />
        </TabButton>
        <div className="ml-auto">
          <Button onClick={() => void reload()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>
      {retryMessage ? (
        <div className="rounded-lg border border-[#2b4a75] bg-[#102239] px-3 py-2 text-xs text-slate-200">
          {retryMessage}
        </div>
      ) : null}
      {tab === 'dlq' ? <DLQList items={dlq} retrying={retrying} onRetry={retry} /> : null}
      {tab === 'failed' ? <FailedList connectors={failed} /> : null}
      {tab === 'stale' ? <StaleList connectors={stale} /> : null}
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
        active
          ? 'border border-[#2b4a75] bg-gradient-to-r from-[#1a3a64] to-[#152d50] text-[#a5d3ff] font-semibold shadow-sm shadow-black/30'
          : 'text-slate-300 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Pill({ count, tone }: { count: number; tone: 'danger' | 'warn' | 'neutral' }) {
  const palette =
    tone === 'danger'
      ? 'bg-rose-600/30 text-rose-200 border-rose-700/50'
      : tone === 'warn'
        ? 'bg-amber-500/20 text-amber-200 border-amber-600/40'
        : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
  return (
    <span className={`rounded-full border px-2 text-[10px] font-semibold ${palette}`}>{count}</span>
  )
}

function DLQList({
  items,
  retrying,
  onRetry,
}: {
  items: DLQRecord[]
  retrying: string | null
  onRetry: (queueId: string) => void
}) {
  const {
    t
  } = useI18n();

  if (!items.length) {
    return (
      <Card>
        <div className="text-sm text-slate-300">
          {t(
            'No dead-letter records. Every signed envelope and processor output reached its\n          destination.',
            'No dead-letter records. Every signed envelope and processor output reached its\n          destination.'
          )}
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {items.map(entry => {
        const {
          t
        } = useI18n();

        return (
          <Card key={entry.queue_id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {entry.stage ? `${entry.stage} ` : ''}
                  <span className="text-rose-300">{entry.error || 'unknown failure'}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {entry.envelope?.source ? <span>{t('source:', 'source:')} {entry.envelope.source}</span> : null}
                  {entry.envelope?.section ? <span> {t('· section:', '· section:')} {entry.envelope.section}</span> : null}
                  {entry.run_id ? <span> {t('· run:', '· run:')} {entry.run_id}</span> : null}
                  {entry.tenant_id ? <span> {t('· tenant:', '· tenant:')} {entry.tenant_id}</span> : null}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('Failed at', 'Failed at')} {formatTimestamp(entry.failed_at || entry.updated_at || entry.created_at || '')}
                  {' · '}{t('attempts:', 'attempts:')} {entry.attempts ?? 0}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onRetry(entry.queue_id)}
                disabled={retrying === entry.queue_id}
              >
                {retrying === entry.queue_id ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
            {entry.dlq_attempts && entry.dlq_attempts.length ? (
              <div className="mt-3 border-t border-[#1f365a] pt-3 text-xs text-slate-400">
                <div className="mb-1 font-semibold text-slate-300">{t('Retry audit', 'Retry audit')}</div>
                <ul className="space-y-1">
                  {entry.dlq_attempts.map(attempt => {
                    const {
                      t
                    } = useI18n();

                    return (
                      <li key={`${entry.queue_id}-${attempt.attempt}`}>
                        {t('Attempt', 'Attempt')} {attempt.attempt}· {formatTimestamp(attempt.started_at)}·{' '}
                        {attempt.retried_by ? `by ${attempt.retried_by} · ` : ''}
                        {attempt.outcome || 'requeued'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function FailedList({ connectors }: { connectors: ConnectorStatus[] }) {
  const {
    t
  } = useI18n();

  if (!connectors.length) {
    return (
      <Card>
        <div className="text-sm text-slate-300">
          {t(
            'All connectors collected successfully. No failure events recorded.',
            'All connectors collected successfully. No failure events recorded.'
          )}
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {connectors.map(connector => {
        const {
          t
        } = useI18n();

        return (
          <Card key={connector.name}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {connector.label || connector.name}
                </div>
                <div className="text-xs text-slate-400">
                  {t('Failures:', 'Failures:')} {connector.failure_count ?? 0} {t('· partial:', '· partial:')} {connector.partial_failure_count ?? 0}
                  {connector.last_run ? ` · last run: ${formatTimestamp(connector.last_run)}` : ''}
                </div>
                {lastErrorMessage(connector.last_error) ? (
                  <div className="mt-2 rounded-lg border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
                    {lastErrorMessage(connector.last_error)}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function StaleList({ connectors }: { connectors: ConnectorStatus[] }) {
  const {
    t
  } = useI18n();

  if (!connectors.length) {
    return (
      <Card>
        <div className="text-sm text-slate-300">
          {t(
            'All declared connectors reported within their poll cadence. Evidence is fresh.',
            'All declared connectors reported within their poll cadence. Evidence is fresh.'
          )}
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {connectors.map((connector) => {
        const {
          t
        } = useI18n();

        const lastSeen = connector.last_success || connector.last_run
        return (
          <Card key={connector.name}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {connector.label || connector.name}
                </div>
                <div className="text-xs text-slate-400">
                  {t('Mode:', 'Mode:')} {connector.delivery_mode || 'unknown'} {t('· poll interval:', '· poll interval:')}{' '}
                  {connector.poll_interval_seconds ? `${connector.poll_interval_seconds}s` : 'undeclared'}
                </div>
                <div className="mt-2 text-xs text-amber-200">
                  {lastSeen
                    ? `Last evidence: ${formatTimestamp(lastSeen)} (older than 2× declared cadence)`
                    : 'No successful collection on record.'}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
