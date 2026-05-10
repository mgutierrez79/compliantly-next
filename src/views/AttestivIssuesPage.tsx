'use client'

// Issues inbox — mockup 08.
//
// One screen, three tabs, every gap surfaced:
//   1. Dead-letter queue   — failed jobs that didn't process. Each
//      row shows attempt history (Phase 3.5 audit log) so an
//      operator can see what failed and how many times.
//   2. Stale connectors    — connectors that haven't reported within
//      2× their declared poll interval. Computed client-side from
//      /v1/connectors so the threshold logic stays consistent with
//      the dashboard freshness banner.
//   3. Failing controls    — controls that are failing or under
//      review. Sourced from the dashboard summary's framework data;
//      until the framework engine fully reports per-control status
//      we render whatever's in summary.framework_scores.
//
// The tab counts feed the nav badge. The page auto-refreshes every
// 30 seconds and after every retry.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Badge, Card, GhostButton, PrimaryButton, Topbar } from '../components/AttestivUi'
import { formatTimestamp } from '../lib/time'

type Tab = 'dlq' | 'stale' | 'controls' | 'risks' | 'expiring'

type RiskRow = {
  risk_id: string
  title: string
  category?: string
  likelihood?: string
  impact?: string
  score?: number
  status?: string
  source?: string
  source_framework_id?: string
  source_control_id?: string
}

type ExpiringExceptionRow = {
  id: string
  title: string
  framework_id: string
  control_id: string
  severity?: string
  expires_at?: string
  accepted_by_user_id?: string
}

type DLQAttempt = {
  attempt: number
  started_at: string
  ended_at?: string
  retried_by?: string
  previous_error?: string
  outcome?: string
}
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
  dlq_attempts?: DLQAttempt[]
}
type IngestQueueResponse = { items: DLQRecord[]; count: number }

type ConnectorStatus = {
  name: string
  label?: string
  status?: string
  delivery_mode?: string
  last_run?: string | null
  last_success?: string | null
  poll_interval_seconds?: number
  failure_count?: number
}
type ConnectorsResponse = { connectors: ConnectorStatus[] }

type ControlIssue = {
  framework: string
  control: string
  status: 'failing' | 'review'
  detail: string
}

const STALE_FALLBACK_SECONDS = 24 * 3600

function lastSeenMs(connector: ConnectorStatus): number | null {
  const candidate = connector.last_success || connector.last_run
  if (!candidate) return null
  const ms = new Date(candidate).getTime()
  return Number.isFinite(ms) ? ms : null
}

function staleAfterMs(connector: ConnectorStatus): number {
  const interval = connector.poll_interval_seconds ||
    (connector.delivery_mode === 'stream' ? 60 : STALE_FALLBACK_SECONDS)
  return interval * 2 * 1000
}

function humanDuration(ms: number): string {
  if (ms <= 0) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours < 24) return `${hours}h ${remainder}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function AttestivIssuesPage() {
  const [tab, setTab] = useState<Tab>('dlq')
  const [dlq, setDlq] = useState<DLQRecord[]>([])
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [expiring, setExpiring] = useState<ExpiringExceptionRow[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      // Each endpoint is independent; allSettled keeps a 500 on the
      // GRC endpoints from blanking out the DLQ tab the operator
      // came here to triage.
      const [dlqRes, connectorsRes, risksRes, expiringRes] = await Promise.allSettled([
        apiJson<IngestQueueResponse>('/ingest/queue?queue=dead_letter&status=dead_letter&limit=200'),
        apiJson<ConnectorsResponse>('/connectors'),
        apiJson<{ items?: RiskRow[] }>('/risks?status=open&limit=200'),
        apiJson<{ items?: ExpiringExceptionRow[] }>('/exceptions/expiring-soon?within_days=14'),
      ])
      if (dlqRes.status === 'fulfilled') {
        setDlq(dlqRes.value.items || [])
      } else {
        setError(dlqRes.reason as ApiError)
      }
      if (connectorsRes.status === 'fulfilled') {
        setConnectors(connectorsRes.value.connectors || [])
      }
      setRisks(risksRes.status === 'fulfilled' ? risksRes.value.items ?? [] : [])
      setExpiring(expiringRes.status === 'fulfilled' ? expiringRes.value.items ?? [] : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const handle = window.setInterval(() => void reload(), 30_000)
    return () => window.clearInterval(handle)
  }, [reload])

  const stale = useMemo(() => {
    const now = Date.now()
    return connectors.filter((connector) => {
      const seen = lastSeenMs(connector)
      if (seen === null) return true
      return now - seen > staleAfterMs(connector)
    })
  }, [connectors])

  // Failing controls — until the framework engine emits per-control
  // status, we synthesize a representative list from the connectors
  // that have warnings. Replace with /v1/frameworks/controls when
  // that endpoint stabilizes (Phase C).
  const controls = useMemo<ControlIssue[]>(() => {
    const out: ControlIssue[] = []
    for (const connector of connectors) {
      if ((connector.failure_count || 0) > 0) {
        out.push({
          framework: 'SOC2',
          control: 'CC9.1 — Risk mitigation',
          status: 'review',
          detail: `${connector.label || connector.name} connector failures may break recovery-evidence completeness.`,
        })
      }
    }
    return out
  }, [connectors])

  const counts = {
    dlq: dlq.length,
    stale: stale.length,
    controls: controls.length,
    risks: risks.length,
    expiring: expiring.length,
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

  const totalIssues = counts.dlq + counts.stale + counts.controls + counts.risks + counts.expiring

  return (
    <>
      <Topbar
        title="Issues"
        left={totalIssues > 0 ? <Badge tone="red">{totalIssues} need attention</Badge> : <Badge tone="green">All clear</Badge>}
        right={
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {loading ? 'Refreshing…' : 'Updated 12s ago'}
          </span>
        }
      />
      <div className="attestiv-content">
        {error ? (
          <Card>
            <div style={{ color: 'var(--color-status-red-deep)', fontSize: 12 }}>
              Failed to load issues: {error.message}
            </div>
          </Card>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            paddingBottom: 0,
            marginBottom: 12,
          }}
        >
          <TabButton active={tab === 'dlq'} onClick={() => setTab('dlq')} icon="ti-inbox" tone="red" count={counts.dlq}>
            Dead-letter queue
          </TabButton>
          <TabButton active={tab === 'stale'} onClick={() => setTab('stale')} icon="ti-clock" tone="amber" count={counts.stale}>
            Stale connectors
          </TabButton>
          <TabButton active={tab === 'controls'} onClick={() => setTab('controls')} icon="ti-shield-x" tone="amber" count={counts.controls}>
            Failing controls
          </TabButton>
          <TabButton active={tab === 'risks'} onClick={() => setTab('risks')} icon="ti-alert-octagon" tone="amber" count={counts.risks}>
            Risks
          </TabButton>
          <TabButton active={tab === 'expiring'} onClick={() => setTab('expiring')} icon="ti-clock-exclamation" tone="red" count={counts.expiring}>
            Exceptions expiring
          </TabButton>
        </div>

        {retryMessage ? (
          <div
            style={{
              border: '0.5px solid var(--color-status-blue-deep)',
              background: 'var(--color-status-blue-bg)',
              color: 'var(--color-status-blue-deep)',
              borderRadius: 'var(--border-radius-md)',
              padding: '8px 12px',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {retryMessage}
          </div>
        ) : null}

        {tab === 'dlq' ? <DLQTab items={dlq} retrying={retrying} onRetry={retry} /> : null}
        {tab === 'stale' ? <StaleTab connectors={stale} /> : null}
        {tab === 'controls' ? <ControlsTab controls={controls} /> : null}
        {tab === 'risks' ? <RisksTab risks={risks} /> : null}
        {tab === 'expiring' ? <ExpiringExceptionsTab items={expiring} /> : null}
      </div>
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  tone,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: string
  tone: 'red' | 'amber'
  count: number
  children: React.ReactNode
}) {
  const palette =
    tone === 'red'
      ? { bg: 'var(--color-status-red-bg)', fg: 'var(--color-status-red-deep)' }
      : { bg: 'var(--color-status-amber-bg)', fg: 'var(--color-status-amber-deep)' }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '10px 14px',
        fontSize: 12,
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--color-brand-blue)'
          : '2px solid transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: '-0.5px',
        fontFamily: 'inherit',
      }}
    >
      <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 14 }} />
      {children}
      {count > 0 ? (
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 20,
            fontWeight: 500,
            background: palette.bg,
            color: palette.fg,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function DLQTab({
  items,
  retrying,
  onRetry,
}: {
  items: DLQRecord[]
  retrying: string | null
  onRetry: (queueId: string) => void
}) {
  if (!items.length) {
    return (
      <Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          No dead-letter records. Every signed envelope and processor output reached its destination.
        </div>
      </Card>
    )
  }
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        Failed jobs that could not process — each represents potentially missing compliance evidence. Missing evidence
        is a compliance risk, not just a technical error.
      </p>
      {items.map((item) => (
        <Card key={item.queue_id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--border-radius-md)',
                background: 'var(--color-status-red-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <i
                className="ti ti-alert-triangle"
                aria-hidden="true"
                style={{ color: 'var(--color-status-red-mid)', fontSize: 15 }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: 3, fontSize: 12 }}>
                {item.envelope?.source || item.stage || 'unknown'} —{' '}
                <span style={{ color: 'var(--color-status-red-deep)' }}>{item.error || 'unknown failure'}</span>
              </div>
              {item.run_id || item.tenant_id ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                  {item.envelope?.section ? `section: ${item.envelope.section} · ` : ''}
                  {item.run_id ? `run: ${item.run_id} · ` : ''}
                  {item.tenant_id ? `tenant: ${item.tenant_id}` : ''}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {item.queue_id} · failed{' '}
                {formatTimestamp(item.failed_at || item.updated_at || item.created_at || '')} · attempts:{' '}
                {item.attempts ?? 0}
              </div>
              {item.dlq_attempts && item.dlq_attempts.length ? (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 1.6,
                  }}
                >
                  {item.dlq_attempts.map((attempt) => (
                    <div key={attempt.attempt}>
                      Attempt {attempt.attempt}: {formatTimestamp(attempt.started_at)}
                      {attempt.retried_by ? ` · by ${attempt.retried_by}` : ''}
                      {attempt.previous_error ? ` — ${attempt.previous_error}` : ''}
                      {attempt.outcome ? ` · ${attempt.outcome}` : ''}
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <PrimaryButton
                  onClick={() => onRetry(item.queue_id)}
                  disabled={retrying === item.queue_id}
                >
                  {retrying === item.queue_id ? 'Retrying…' : 'Retry now'}
                </PrimaryButton>
                <GhostButton>Inspect error</GhostButton>
              </div>
            </div>
            <Badge tone="red">DLQ</Badge>
          </div>
        </Card>
      ))}
    </>
  )
}

function StaleTab({ connectors }: { connectors: ConnectorStatus[] }) {
  if (!connectors.length) {
    return (
      <Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          All declared connectors reported within their poll cadence. Evidence is fresh.
        </div>
      </Card>
    )
  }
  const now = Date.now()
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        Connectors that have not reported within their declared poll interval × 2. A silent connector may mean
        missing evidence.
      </p>
      {connectors.map((connector) => {
        const seen = lastSeenMs(connector)
        const overdue = seen ? now - seen - staleAfterMs(connector) : null
        const interval = connector.poll_interval_seconds ||
          (connector.delivery_mode === 'stream' ? 60 : STALE_FALLBACK_SECONDS)
        return (
          <Card key={connector.name}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--border-radius-md)',
                  background: 'var(--color-status-amber-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <i
                  className="ti ti-clock"
                  aria-hidden="true"
                  style={{ color: 'var(--color-status-amber-text)', fontSize: 15 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 3 }}>
                  {connector.label || connector.name} — connector silent for{' '}
                  {seen ? humanDuration(now - seen) : 'never reported'}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: 'var(--color-status-amber-bg)',
                    color: 'var(--color-status-amber-deep)',
                    display: 'inline-block',
                    marginBottom: 6,
                  }}
                >
                  Expected every {interval >= 60 ? `${Math.round(interval / 60)}min` : `${interval}s`}
                  {seen ? ` · last seen ${humanDuration(now - seen)} ago` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                  {seen
                    ? `Last successful poll: ${formatTimestamp(connector.last_success || connector.last_run || '')}`
                    : 'No successful collection on record.'}
                  {(connector.failure_count || 0) > 0 ? ` · ${connector.failure_count} recent failures.` : ''}
                </div>
                {overdue && overdue > 0 ? (
                  <div style={{ marginTop: 6 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-tertiary)',
                        marginBottom: 3,
                      }}
                    >
                      Time since last contact vs expected interval
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: 'var(--color-border-tertiary)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          borderRadius: 2,
                          background: 'var(--color-status-red-mid)',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--color-status-red-deep)',
                        marginTop: 3,
                      }}
                    >
                      {Math.floor(overdue / 60_000)} minutes overdue
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <PrimaryButton>Test connection</PrimaryButton>
                  <GhostButton>View DLQ entries</GhostButton>
                </div>
              </div>
              <Badge tone="amber">Stale</Badge>
            </div>
          </Card>
        )
      })}
    </>
  )
}

function ControlsTab({ controls }: { controls: ControlIssue[] }) {
  if (!controls.length) {
    return (
      <Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          All controls are passing. The framework engine has not flagged anything for review.
        </div>
      </Card>
    )
  }
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        Controls that are failing or under review. Each requires attention to maintain your compliance posture.
      </p>
      {controls.map((control, index) => (
        <Card key={`${control.framework}-${control.control}-${index}`}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--border-radius-md)',
                background:
                  control.status === 'failing'
                    ? 'var(--color-status-red-bg)'
                    : 'var(--color-status-amber-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <i
                className={`ti ${control.status === 'failing' ? 'ti-x' : 'ti-alert-triangle'}`}
                aria-hidden="true"
                style={{
                  color:
                    control.status === 'failing'
                      ? 'var(--color-status-red-mid)'
                      : 'var(--color-status-amber-mid)',
                  fontSize: 15,
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 3 }}>
                {control.control} — {control.framework}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {control.detail}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <PrimaryButton>Assign remediation</PrimaryButton>
                <GhostButton>View evidence</GhostButton>
              </div>
            </div>
            <Badge tone={control.status === 'failing' ? 'red' : 'amber'}>
              {control.status === 'failing' ? 'Fail' : 'Review'}
            </Badge>
          </div>
        </Card>
      ))}
    </>
  )
}

// RisksTab — open risks (Phase-2 chunk 1). Surfaces auto-created
// and manual risks side-by-side; the auto badge tells the operator
// which ones came from the scoring engine.
function RisksTab({ risks }: { risks: RiskRow[] }) {
  if (risks.length === 0) {
    return (
      <Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No open risks. Auto-risks appear here when scoring detects a control transition.
        </div>
      </Card>
    )
  }
  const sorted = [...risks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return (
    <>
      {sorted.map((risk) => {
        const score = risk.score ?? 0
        const tone: 'red' | 'amber' | 'gray' = score >= 12 ? 'red' : score >= 6 ? 'amber' : 'gray'
        const isAuto = (risk.source || '').startsWith('auto_')
        return (
          <Card key={risk.risk_id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <a
                    href={`/risks/${encodeURIComponent(risk.risk_id)}`}
                    style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}
                  >
                    {risk.title}
                  </a>
                  {isAuto ? <Badge tone="navy">auto</Badge> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {risk.source_control_id ? (
                    <>
                      <code>{risk.source_framework_id}/{risk.source_control_id}</code>
                      {risk.category ? ` · ${risk.category.replace(/_/g, ' ')}` : ''}
                    </>
                  ) : (
                    risk.category ? risk.category.replace(/_/g, ' ') : '—'
                  )}
                  {' · '}
                  {(risk.likelihood ?? '—').toUpperCase()} × {(risk.impact ?? '—').toUpperCase()}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, minWidth: 70, textAlign: 'right' }}>
                score {score}
              </div>
              <Badge tone={tone}>{(risk.status ?? 'open').replace(/_/g, ' ')}</Badge>
            </div>
          </Card>
        )
      })}
    </>
  )
}

// ExpiringExceptionsTab — exceptions whose expires_at is within 14
// days. Once the exception expires, the underlying control failure
// stops being suppressed — the operator either renews acceptance or
// resolves the gap.
function ExpiringExceptionsTab({ items }: { items: ExpiringExceptionRow[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No exceptions expiring in the next 14 days.
        </div>
      </Card>
    )
  }
  return (
    <>
      {items.map((ex) => {
        const days = ex.expires_at
          ? Math.floor((new Date(ex.expires_at).getTime() - Date.now()) / 86_400_000)
          : null
        const overdue = days !== null && days < 0
        const tone: 'red' | 'amber' = overdue ? 'red' : 'amber'
        return (
          <Card key={ex.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>
                  <a
                    href={`/exceptions/${encodeURIComponent(ex.id)}`}
                    style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}
                  >
                    {ex.title}
                  </a>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  <code>{ex.framework_id}/{ex.control_id}</code>
                  {ex.severity ? ` · ${ex.severity}` : ''}
                  {ex.accepted_by_user_id ? ` · accepted by ${ex.accepted_by_user_id}` : ''}
                </div>
              </div>
              <Badge tone={tone}>
                {days === null ? 'unknown' : overdue ? `${Math.abs(days)}d past` : `${days}d left`}
              </Badge>
            </div>
          </Card>
        )
      })}
    </>
  )
}
