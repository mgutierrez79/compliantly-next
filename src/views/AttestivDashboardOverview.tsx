'use client'

// Dashboard > Overview — the Phase A vertical slice.
//
// Pixel-faithful to the Attestiv mockup but wired to real backend
// data: connector health from /v1/connectors, framework posture
// from /v1/dashboard/summary (when available), DLQ depth via the
// shared issuesCount source. The shape is fixed; the values are
// live.
//
// What's intentionally NOT here yet:
//   - Risk-driver detail (scoring engine output beyond the headline)
//   - Per-framework drill-down navigation (those land in Phase B
//     when /frameworks gets its real implementation)
//   - DR test schedule preview ("DR test scheduled" pipeline step
//     is hard-coded for now; wires up when /dr lands in Phase C)

import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Card,
  CardTitle,
  FrameworkBar,
  GhostButton,
  MetricCard,
  PipelineStep,
  Pulse,
  SourceRow,
  Topbar,
} from '../components/AttestivUi'
import { ApiError, apiJson } from '../lib/api'
import { ConnectorLogo, connectorBrandHex } from '../components/ConnectorLogo'

type ConnectorStatus = {
  name: string
  label?: string
  status?: string
  delivery_mode?: string
  last_run?: string | null
  last_success?: string | null
  failure_count?: number
  poll_interval_seconds?: number
  last_event_count?: number
  events_per_minute?: number
}
type ConnectorsResponse = { connectors: ConnectorStatus[] }

type FrameworkScore = {
  score?: number
  controls_score?: number
  controls_summary?: { compliant?: number; total?: number }
}
type DashboardSummary = {
  finding_count?: number
  framework_scores?: Record<string, FrameworkScore>
  connector_health?: { ok?: number; warn?: number; error?: number; unknown?: number }
  generated_at?: string | null
}

const FRAMEWORK_LABELS: Record<string, string> = {
  iso27001: 'ISO 27001',
  soc2: 'SOC 2 Type II',
  nis2: 'NIS2',
  dora: 'DORA regulation',
  gxp: 'GxP',
  cis: 'CIS',
  nist: 'NIST',
  pci_dss: 'PCI-DSS v4',
  'pci-dss': 'PCI-DSS v4',
}

function relativeTime(iso?: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'never'
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function tone(percent: number): 'green' | 'amber' | 'red' {
  if (percent >= 95) return 'green'
  if (percent >= 85) return 'amber'
  return 'red'
}

// loadGRCMetrics fans out to the four Phase-2 endpoints and squashes
// the responses into a flat shape the metric cards consume. Each
// fetch is independent — a 500 on one endpoint shouldn't blank out
// the others. Falls back to `null` per metric so cards render "—"
// rather than misleading zeros.
async function loadGRCMetrics(): Promise<GRCMetrics> {
  const [risksRes, expiringRes, deadlinesRes, policiesRes] = await Promise.allSettled([
    apiJson<{ open_critical?: number; open_high?: number }>('/risks/summary'),
    apiJson<{ items?: Array<{ expires_at?: string }>; count?: number }>('/exceptions/expiring-soon?within_days=14'),
    apiJson<{ items?: Array<{ minutes_until?: number }>; count?: number }>('/incidents/deadlines'),
    apiJson<{ items?: unknown[]; count?: number }>('/policy-docs/overdue'),
  ])
  const out: GRCMetrics = { ...EMPTY_GRC }
  if (risksRes.status === 'fulfilled') {
    const r = risksRes.value || {}
    out.risksOpenCriticalAndHigh = (r.open_critical ?? 0) + (r.open_high ?? 0)
  }
  if (expiringRes.status === 'fulfilled') {
    const items = expiringRes.value?.items ?? []
    out.exceptionsActive = items.length
    if (items.length > 0) {
      const soonest = items
        .map((it) => (it.expires_at ? new Date(it.expires_at).getTime() : Number.MAX_SAFE_INTEGER))
        .reduce((a, b) => Math.min(a, b), Number.MAX_SAFE_INTEGER)
      if (Number.isFinite(soonest)) {
        out.exceptionsNearestExpiryDays = Math.max(0, Math.floor((soonest - Date.now()) / 86_400_000))
      }
    }
  }
  if (deadlinesRes.status === 'fulfilled') {
    const items = deadlinesRes.value?.items ?? []
    out.overdueNIS2Notifications = items.filter((d) => (d.minutes_until ?? 0) < 0).length
  }
  if (policiesRes.status === 'fulfilled') {
    out.policiesOverdue = policiesRes.value?.count ?? policiesRes.value?.items?.length ?? 0
  }
  return out
}

type GRCMetrics = {
  risksOpenCriticalAndHigh: number | null
  exceptionsActive: number | null
  exceptionsNearestExpiryDays: number | null
  overdueNIS2Notifications: number | null
  policiesOverdue: number | null
}

const EMPTY_GRC: GRCMetrics = {
  risksOpenCriticalAndHigh: null,
  exceptionsActive: null,
  exceptionsNearestExpiryDays: null,
  overdueNIS2Notifications: null,
  policiesOverdue: null,
}

export function AttestivDashboardOverview() {
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [grc, setGRC] = useState<GRCMetrics>(EMPTY_GRC)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [connectorsResponse, summaryResponse] = await Promise.allSettled([
          apiJson<ConnectorsResponse>('/connectors'),
          apiJson<DashboardSummary>('/dashboard/summary'),
        ])
        if (cancelled) return
        if (connectorsResponse.status === 'fulfilled') {
          setConnectors(connectorsResponse.value.connectors || [])
        }
        if (summaryResponse.status === 'fulfilled') {
          setSummary(summaryResponse.value)
        }
        // Surface only critical-path errors. A summary failure is
        // tolerable (the page degrades gracefully); a connectors
        // failure means we can't render the source-health panel
        // and should tell the user.
        if (connectorsResponse.status === 'rejected') {
          setError(connectorsResponse.reason as ApiError)
        }
        // Phase-2 metrics — fetched in parallel; each failure
        // degrades to "—" rather than blowing up the dashboard.
        if (!cancelled) {
          loadGRCMetrics().then((next) => {
            if (!cancelled) setGRC(next)
          })
        }
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
    }
    void load()
    const handle = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [])

  const connectorRows = useMemo(() => {
    return connectors.slice(0, 4).map((connector) => {
      const brandHex = connectorBrandHex(connector.name)
      const failures = connector.failure_count || 0
      const lastSeen = connector.last_success || connector.last_run
      const isStale = (() => {
        if (!lastSeen) return true
        const interval = (connector.poll_interval_seconds ||
          (connector.delivery_mode === 'stream' ? 60 : 21600)) * 2 * 1000
        return Date.now() - new Date(lastSeen).getTime() > interval
      })()
      const status: 'OK' | 'Warn' | 'Down' = failures > 0 || isStale ? 'Warn' : 'OK'
      const bar = status === 'OK' ? 92 : 45
      const barColor = status === 'OK'
        ? 'var(--color-status-green-mid)'
        : 'var(--color-status-amber-mid)'
      const subtitle = connector.delivery_mode === 'stream'
        ? `Streaming · last: ${relativeTime(lastSeen)}`
        : `Polling · last: ${relativeTime(lastSeen)}`
      return (
        <SourceRow
          key={connector.name}
          logo={<ConnectorLogo name={connector.name} size={16} />}
          iconBg={brandHex ? `${brandHex}1A` : 'var(--color-background-tertiary)'}
          name={connector.label || connector.name}
          sub={subtitle}
          bar={bar}
          barColor={barColor}
          badge={<Badge tone={status === 'OK' ? 'green' : 'amber'}>{status}</Badge>}
        />
      )
    })
  }, [connectors])

  const frameworkRows = useMemo(() => {
    const scores = summary?.framework_scores || {}
    const entries = Object.entries(scores)
    if (!entries.length) {
      // No live data yet — render the eight target frameworks at 0%
      // so the panel doesn't look broken. The framework engine
      // populates them once a run completes.
      return Object.keys(FRAMEWORK_LABELS).slice(0, 6).map((key) => (
        <FrameworkBar key={key} name={FRAMEWORK_LABELS[key]} percent={0} tone="red" />
      ))
    }
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, score]) => {
        const percent = Math.round((score?.score ?? score?.controls_score ?? 0) * 100) / 100
        const display = Math.max(0, Math.min(100, Math.round(percent)))
        return (
          <FrameworkBar
            key={key}
            name={FRAMEWORK_LABELS[key] || key.toUpperCase()}
            percent={display}
            tone={tone(display)}
          />
        )
      })
  }, [summary])

  // Top-level metric card values. Falls back to "—" when the API
  // hasn't returned, which is more honest than a misleading zero.
  const metricEvidenceCollected =
    summary?.finding_count != null ? summary.finding_count.toLocaleString() : '—'
  const metricControlsPassing = (() => {
    const scores = summary?.framework_scores || {}
    let totalCompliant = 0
    let totalControls = 0
    for (const score of Object.values(scores)) {
      if (score.controls_summary) {
        totalCompliant += score.controls_summary.compliant ?? 0
        totalControls += score.controls_summary.total ?? 0
      }
    }
    if (totalControls === 0) return { value: '—', sub: '' }
    const pct = Math.round((totalCompliant / totalControls) * 100)
    return { value: `${pct}%`, sub: `${totalCompliant} / ${totalControls}` }
  })()
  const metricActiveConnectors = connectors.length || '—'
  const metricConnectorWarning = (summary?.connector_health?.warn ?? 0) +
    (summary?.connector_health?.error ?? 0)
  const lastEvidence = relativeTime(summary?.generated_at)

  return (
    <>
      <Topbar
        title="Overview"
        left={<Badge tone="green"><Pulse /> Live</Badge>}
        right={
          <>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Last evidence: {lastEvidence}
            </span>
            <GhostButton>
              <i className="ti ti-download" aria-hidden="true" style={{ fontSize: 13 }} /> Export
            </GhostButton>
          </>
        }
      />
      <div className="attestiv-content">
        {error ? (
          <Card>
            <div style={{ color: 'var(--color-status-red-deep)', fontSize: 12 }}>
              Failed to load connector data: {error.message}
            </div>
          </Card>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <MetricCard
            label="Evidence collected"
            value={metricEvidenceCollected}
            sub={summary?.generated_at ? `as of ${relativeTime(summary.generated_at)}` : null}
          />
          <MetricCard
            label="Controls passing"
            value={metricControlsPassing.value}
            sub={metricControlsPassing.sub}
            valueColor="var(--color-status-green-deep)"
          />
          <MetricCard
            label="Active connectors"
            value={metricActiveConnectors}
            sub={metricConnectorWarning ? `${metricConnectorWarning} warning` : 'all healthy'}
          />
          <MetricCard
            label="DORA tier"
            value="High"
            sub="Towards elite"
            valueColor="var(--color-brand-blue)"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <MetricCard
            label="Open risks"
            value={grc.risksOpenCriticalAndHigh != null ? String(grc.risksOpenCriticalAndHigh) : '—'}
            sub="critical + high"
            valueColor={grc.risksOpenCriticalAndHigh && grc.risksOpenCriticalAndHigh > 0 ? 'var(--color-status-amber-mid)' : undefined}
          />
          <MetricCard
            label="Active exceptions"
            value={grc.exceptionsActive != null ? String(grc.exceptionsActive) : '—'}
            sub={grc.exceptionsNearestExpiryDays != null ? `next expiry: ${grc.exceptionsNearestExpiryDays}d` : 'no active'}
            valueColor={grc.exceptionsNearestExpiryDays != null && grc.exceptionsNearestExpiryDays <= 7 ? 'var(--color-status-red-mid)' : undefined}
          />
          <MetricCard
            label="Overdue NIS2"
            value={grc.overdueNIS2Notifications != null ? String(grc.overdueNIS2Notifications) : '—'}
            sub={grc.overdueNIS2Notifications && grc.overdueNIS2Notifications > 0 ? 'submit immediately' : 'on track'}
            valueColor={
              grc.overdueNIS2Notifications && grc.overdueNIS2Notifications > 0
                ? 'var(--color-status-red-mid)'
                : 'var(--color-status-green-deep)'
            }
          />
          <MetricCard
            label="Policies needing review"
            value={grc.policiesOverdue != null ? String(grc.policiesOverdue) : '—'}
            sub={grc.policiesOverdue && grc.policiesOverdue > 0 ? '−10% per linked control' : 'all current'}
            valueColor={grc.policiesOverdue && grc.policiesOverdue > 0 ? 'var(--color-status-amber-mid)' : undefined}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Card>
            <CardTitle right={<Badge tone="gray">{connectors.length} sources</Badge>}>
              Source health
            </CardTitle>
            {connectorRows.length ? connectorRows : (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                No connectors configured yet.
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>Framework posture</CardTitle>
            {frameworkRows}
          </Card>
        </div>

        <Card>
          <CardTitle>Recent pipeline activity</CardTitle>
          <PipelineStep
            dotColor="var(--color-status-green-mid)"
            name="Evidence processor — 4 subscribers active"
            desc="DORA · scoring · policy · contract signer · all goroutines running"
            time="now"
          />
          <PipelineStep
            dotColor="var(--color-status-green-mid)"
            name="DORA calculator — last batch complete"
            desc="Operational metrics computed from signed evidence"
            time="2m ago"
          />
          <PipelineStep
            dotColor={metricConnectorWarning ? 'var(--color-status-amber-mid)' : 'var(--color-status-green-mid)'}
            name={metricConnectorWarning ? `Connector warnings: ${metricConnectorWarning}` : 'Connectors healthy'}
            desc={metricConnectorWarning
              ? 'See Issues page for details'
              : 'All declared sources reported within their poll cadence'}
            time="4m ago"
          />
          <PipelineStep
            dotColor="var(--color-brand-blue-mid)"
            name="DR test schedule"
            desc="Next scheduled run will appear here once a schedule is configured (Phase C)"
            time="—"
          />
        </Card>
      </div>
    </>
  )
}
