'use client';
// Frameworks page.
//
// One card per enabled framework. Each card shows the framework's
// overall posture (percent), a breakdown by control area with
// progress bars, and a Generate report button that triggers the
// async report endpoint.
//
// Why this view is the primary surface for compliance managers: the
// posture per framework is the fact they answer to leadership for.
// The dashboard's Framework posture card is a glance — this page is
// the working view, where they read each control area, decide which
// areas need an evidence push, and trigger the signed PDF for an
// auditor.

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  FrameworkBar,
  GhostButton,
  PrimaryButton,
  Skeleton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'
import { isDemoMode } from '../lib/demoMode'

import { useI18n } from '../lib/i18n';

type ControlArea = {
  name: string
  percent: number
}

type FrameworkPosture = {
  id: string
  name: string
  overall: number
  control_areas: ControlArea[]
  last_updated?: string
  // Real backend fields. When the scoring engine has actually
  // evaluated this framework, status is one of pass/warn/review/
  // fail; when no run exists yet, status is no_data and the
  // control_areas array is empty so the card renders an honest
  // "not evaluated yet" rather than fake percentages.
  status?: 'pass' | 'warn' | 'review' | 'fail' | 'no_data' | string
  total_controls?: number
  passing_controls?: number
  review_controls?: number
  warn_controls?: number
  fail_controls?: number
}

type ScoringFrameworkResult = {
  framework_id: string
  framework_name: string
  score?: number
  status?: string
  total_controls?: number
  passing_controls?: number
  review_controls?: number
  warn_controls?: number
  fail_controls?: number
  evaluated_at?: string
}

const DEMO_POSTURE: FrameworkPosture[] = [
  {
    id: 'soc2',
    name: 'SOC 2',
    overall: 96,
    control_areas: [
      { name: 'Security', percent: 98 },
      { name: 'Availability', percent: 95 },
      { name: 'Confidentiality', percent: 96 },
      { name: 'Processing integrity', percent: 92 },
      { name: 'Privacy', percent: 99 },
    ],
  },
  {
    id: 'iso27001',
    name: 'ISO 27001',
    overall: 91,
    control_areas: [
      { name: 'A.5 Information security policies', percent: 100 },
      { name: 'A.8 Asset management', percent: 88 },
      { name: 'A.9 Access control', percent: 92 },
      { name: 'A.12 Operations security', percent: 89 },
      { name: 'A.16 Incident management', percent: 86 },
    ],
  },
  {
    id: 'pci_dss',
    name: 'PCI DSS 4.0',
    overall: 84,
    control_areas: [
      { name: 'Build and maintain network', percent: 90 },
      { name: 'Protect cardholder data', percent: 88 },
      { name: 'Maintain vulnerability program', percent: 76 },
      { name: 'Implement access control', percent: 82 },
      { name: 'Monitor and test networks', percent: 80 },
    ],
  },
  {
    id: 'cis',
    name: 'CIS Controls v8',
    overall: 89,
    control_areas: [
      { name: 'Inventory and control of assets', percent: 95 },
      { name: 'Data protection', percent: 88 },
      { name: 'Secure configuration', percent: 84 },
      { name: 'Audit log management', percent: 92 },
      { name: 'Incident response', percent: 86 },
    ],
  },
]

export function AttestivFrameworksPage() {
  const {
    t
  } = useI18n();

  const [frameworks, setFrameworks] = useState<FrameworkPosture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingDemo, setUsingDemo] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const cancelRef = useRef<{ cancelled: boolean; jobID: string | null }>({ cancelled: false, jobID: null })
  const [generated, setGenerated] = useState<{ id: string; path: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const allowDemo = isDemoMode()
    async function load() {
      try {
        // Pull real scoring data, not the static "enabled IDs"
        // catalog. Each item carries the framework's real score and
        // control summary; frameworks that haven't been evaluated
        // yet come back with status="no_data" so we can render an
        // honest "not yet scored" instead of fake percentages.
        const response = await apiFetch('/scoring/frameworks')
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const body = await response.json().catch(() => ({}))
        const items: ScoringFrameworkResult[] = Array.isArray(body?.items) ? body.items : []
        if (!cancelled) {
          if (items.length > 0) {
            setFrameworks(items.map(scoringResultToPosture))
            setUsingDemo(false)
          } else if (allowDemo) {
            setFrameworks(DEMO_POSTURE)
            setUsingDemo(true)
          } else {
            setFrameworks([])
            setUsingDemo(false)
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          if (allowDemo) {
            setFrameworks(DEMO_POSTURE)
            setUsingDemo(true)
          } else {
            setFrameworks([])
            setUsingDemo(false)
          }
          setError(err?.message ?? 'Failed to load frameworks')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const overallTotals = useMemo(() => {
    if (frameworks.length === 0) return { passing: 0, total: 0 }
    const total = frameworks.length
    const passing = frameworks.filter((framework) => framework.overall >= 95).length
    return { passing, total }
  }, [frameworks])

  // Async generate-and-download:
  //   1. POST /v1/generate-report/async — enqueues a worker job and
  //      returns { job_id } immediately so the UI doesn't block.
  //   2. Poll GET /v1/worker/report/{job_id} until status="completed"
  //      (or "failed"/"cancelled"). result.run_id arrives once the
  //      worker finishes evaluating + rendering the markdown report.
  //   3. GET /v1/runs/{run_id}/report/pdf — pulls the PDF and triggers
  //      the browser download.
  //
  // The old synchronous /v1/generate-report path blocked the request
  // for 60+s on tenants with hundreds of assets, which read as
  // "broken" in the UI. The async flow surfaces an elapsed counter and
  // a Cancel button so the user can leave or abort. Polling cap: 10
  // min — long enough for big tenants, short enough that a wedged
  // worker doesn't keep polling forever.
  async function generateReport(framework: FrameworkPosture) {
    cancelRef.current = { cancelled: false, jobID: null }
    setGenerating(framework.id)
    setGenerated(null)
    setError(null)
    setElapsed(0)
    const startedAt = Date.now()
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    const POLL_MS = 2000
    const MAX_MS = 10 * 60 * 1000

    try {
      const enqueueResponse = await apiFetch('/generate-report/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          framework: framework.id,
          frameworks: [framework.id],
        }),
      })
      if (!enqueueResponse.ok) {
        const text = await enqueueResponse.text().catch(() => '')
        throw new Error(text || `${enqueueResponse.status} ${enqueueResponse.statusText}`)
      }
      const enqueueBody = await enqueueResponse.json().catch(() => ({}))
      const jobID: string | undefined = typeof enqueueBody?.job_id === 'string' ? enqueueBody.job_id : undefined
      if (!jobID) {
        throw new Error('Backend returned no job_id; cannot track report')
      }
      cancelRef.current.jobID = jobID

      let result: any = null
      while (true) {
        if (cancelRef.current.cancelled) {
          throw new Error('cancelled')
        }
        if (Date.now() - startedAt > MAX_MS) {
          throw new Error('Report generation exceeded 10 min — check /v1/worker/jobs for the job state')
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        const pollResponse = await apiFetch(`/worker/report/${encodeURIComponent(jobID)}`)
        if (!pollResponse.ok) {
          const text = await pollResponse.text().catch(() => '')
          throw new Error(text || `poll: ${pollResponse.status} ${pollResponse.statusText}`)
        }
        const pollBody = await pollResponse.json().catch(() => ({}))
        const status = String(pollBody?.status ?? '')
        if (status === 'completed') {
          result = pollBody?.result ?? {}
          break
        }
        if (status === 'failed') {
          throw new Error(String(pollBody?.error ?? 'job failed'))
        }
        if (status === 'cancelled') {
          throw new Error('cancelled')
        }
      }

      const runID: string | undefined =
        (typeof result?.run?.run_id === 'string' && result.run.run_id) ||
        (typeof result?.run_id === 'string' && result.run_id) ||
        undefined
      if (!runID) {
        throw new Error('Job finished without a run_id; cannot fetch PDF')
      }

      const pdfResponse = await apiFetch(`/runs/${encodeURIComponent(runID)}/report/pdf`)
      if (!pdfResponse.ok) {
        const text = await pdfResponse.text().catch(() => '')
        throw new Error(text || `pdf: ${pdfResponse.status} ${pdfResponse.statusText}`)
      }
      const blob = await pdfResponse.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${runID}-${framework.id}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)

      setGenerated({ id: framework.id, path: runID })
    } catch (err: any) {
      if (err?.message === 'cancelled') {
        setError(t('Report generation cancelled.', 'Report generation cancelled.'))
      } else {
        setError(err?.message ?? 'Failed to generate report')
      }
    } finally {
      clearInterval(tick)
      setGenerating(null)
      setElapsed(0)
    }
  }

  async function cancelGenerate() {
    cancelRef.current.cancelled = true
    const jobID = cancelRef.current.jobID
    if (!jobID) return
    try {
      await apiFetch(`/worker/jobs/${encodeURIComponent(jobID)}/cancel`, { method: 'POST' })
    } catch {
      // The polling loop will surface the cancellation regardless;
      // ignore network failures from the cancel call itself.
    }
  }

  return (
    <>
      <Topbar
        title={t('Frameworks', 'Frameworks')}
        left={
          usingDemo ? <Badge tone="amber">{t(
            'Demo posture — backend has no run summaries yet',
            'Demo posture — backend has no run summaries yet'
          )}</Badge> : null
        }
        right={
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {overallTotals.passing}/{overallTotals.total} {t('frameworks ≥95%', 'frameworks ≥95%')}
          </span>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {generated ? (
          <Banner tone="success" title={t('Report downloaded', 'Report downloaded')}>
            <span>
              <strong>{labelFor(generated.id)}</strong> {t('· run', '· run')} <code>{generated.path}</code> {t(
                '— also available from Audit / Reports.',
                '— also available from Audit / Reports.'
              )}
            </span>
          </Banner>
        ) : null}

        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 10,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton width="60%" height={18} />
                <div style={{ marginTop: 12 }}>
                  <Skeleton lines={4} height={10} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Skeleton width={120} height={28} rounded={8} />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 10,
            }}
          >
            {frameworks.map((framework) => (
              <FrameworkCard
                key={framework.id}
                framework={framework}
                generating={generating === framework.id}
                elapsed={generating === framework.id ? elapsed : 0}
                onGenerate={() => generateReport(framework)}
                onCancel={() => void cancelGenerate()}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FrameworkCard({
  framework,
  generating,
  elapsed,
  onGenerate,
  onCancel,
}: {
  framework: FrameworkPosture
  generating: boolean
  elapsed: number
  onGenerate: () => void
  onCancel: () => void
}) {
  const {
    t
  } = useI18n();

  const noData = framework.status === 'no_data'
  const tone: 'green' | 'amber' | 'red' | 'gray' = noData
    ? 'gray'
    : framework.overall >= 95
      ? 'green'
      : framework.overall >= 85
        ? 'amber'
        : 'red'
  const badgeText = noData ? t('not evaluated', 'not evaluated') : `${framework.overall}%`
  return (
    <Card>
      <CardTitle right={<Badge tone={tone}>{badgeText}</Badge>}>
        {framework.name}
      </CardTitle>
      <div style={{ marginBottom: 10 }}>
        {framework.control_areas.length > 0 ? (
          // Legacy DEMO data path (only reached in actual demo mode).
          framework.control_areas.map((area) => (
            <FrameworkBar key={area.name} name={area.name} percent={area.percent} />
          ))
        ) : noData ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
            {t(
              'No scoring run yet. Run /v1/scoring/evaluate to compute a real score against your current evidence.',
              'No scoring run yet. Run /v1/scoring/evaluate to compute a real score against your current evidence.',
            )}
          </div>
        ) : (
          <ControlBreakdown framework={framework} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {framework.last_updated
            ? `${t('Evaluated', 'Evaluated')} ${formatEvaluatedAt(framework.last_updated)}`
            : t('No scoring run yet', 'No scoring run yet')}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <GhostButton onClick={() => { if (typeof window !== 'undefined') window.location.href = `/scoring/trend/${framework.id}` }}>
            <i className="ti ti-chart-line" aria-hidden="true" />
            {t('Trend', 'Trend')}
          </GhostButton>
          <GhostButton onClick={() => { if (typeof window !== 'undefined') window.location.href = `/scoring/calculator` }}>
            <i className="ti ti-math-function" aria-hidden="true" />
            {t('How scored', 'How scored')}
          </GhostButton>
          {generating ? (
            <GhostButton onClick={onCancel}>
              <i className="ti ti-x" aria-hidden="true" />
              {t('Cancel', 'Cancel')}
            </GhostButton>
          ) : null}
          <PrimaryButton onClick={onGenerate} disabled={generating}>
            {generating ? (
              <>
                <i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'attestiv-spin 1s linear infinite' }} />
                {t('Generating…', 'Generating…')} {elapsed > 0 ? `${elapsed}s` : null}
              </>
            ) : (
              <>
                <i className="ti ti-file-export" aria-hidden="true" />
                {t('Generate report', 'Generate report')}
              </>
            )}
          </PrimaryButton>
        </div>
      </div>
    </Card>
  );
}

// ControlBreakdown renders the real pass/warn/review/fail tally the
// scoring engine emits. Three stacked horizontal segments + the raw
// counts underneath; no fake control-area names, no DEMO data.
function ControlBreakdown({ framework }: { framework: FrameworkPosture }) {
  const { t } = useI18n()
  const total = framework.total_controls ?? 0
  const passing = framework.passing_controls ?? 0
  const review = framework.review_controls ?? 0
  const warn = framework.warn_controls ?? 0
  const fail = framework.fail_controls ?? 0
  if (total === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
        {t('Framework has no controls loaded.', 'Framework has no controls loaded.')}
      </div>
    )
  }
  const pct = (n: number) => (n / total) * 100
  const segments: Array<{ key: string; pct: number; color: string; label: string; count: number }> = [
    { key: 'pass', pct: pct(passing), color: 'var(--color-status-green-mid)', label: t('Passing', 'Passing'), count: passing },
    { key: 'review', pct: pct(review), color: 'var(--color-status-blue-mid)', label: t('Review', 'Review'), count: review },
    { key: 'warn', pct: pct(warn), color: 'var(--color-status-amber-mid)', label: t('Warn', 'Warn'), count: warn },
    { key: 'fail', pct: pct(fail), color: 'var(--color-status-red-mid)', label: t('Fail', 'Fail'), count: fail },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 'var(--border-radius-sm)',
          overflow: 'hidden',
          background: 'var(--color-background-tertiary)',
        }}
        title={`${passing}/${total} ${t('passing', 'passing')}`}
      >
        {segments.map((seg) =>
          seg.pct > 0 ? (
            <div key={seg.key} style={{ width: `${seg.pct}%`, background: seg.color }} />
          ) : null,
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {segments
          .filter((seg) => seg.count > 0)
          .map((seg) => (
            <span key={seg.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'inline-block' }} />
              {seg.count} {seg.label.toLowerCase()}
            </span>
          ))}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>
          {total} {t('total controls', 'total controls')}
        </span>
      </div>
    </div>
  )
}

function formatEvaluatedAt(iso: string): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return iso
  const delta = Date.now() - ts
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

// scoringResultToPosture maps the real scoring-engine result into
// the page's FrameworkPosture shape. The backend's score is a
// normalized 0-1 weighted sum; we render as 0-100 percent.
//
// The fake "control areas" breakdown that lived here when this page
// was wired to DEMO_POSTURE is gone — that concept doesn't exist in
// the real backend (controls are flat under a framework, not grouped
// into named areas). The card now renders a real pass/warn/review/
// fail summary instead, which is the actual signal an auditor reads.
function scoringResultToPosture(result: ScoringFrameworkResult): FrameworkPosture {
  const rawScore = typeof result.score === 'number' ? result.score : 0
  const percent = Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)
  return {
    id: result.framework_id,
    name: result.framework_name || labelFor(result.framework_id),
    overall: percent,
    control_areas: [],
    last_updated: result.evaluated_at,
    status: result.status,
    total_controls: result.total_controls,
    passing_controls: result.passing_controls,
    review_controls: result.review_controls,
    warn_controls: result.warn_controls,
    fail_controls: result.fail_controls,
  }
}

function labelFor(id: string): string {
  const known: Record<string, string> = {
    soc2: 'SOC 2',
    iso27001: 'ISO 27001',
    pci_dss: 'PCI DSS 4.0',
    cis: 'CIS Controls v8',
    nist_800_53: 'NIST SP 800-53',
    hipaa: 'HIPAA',
    gdpr: 'GDPR',
  }
  return known[id] ?? id
}
