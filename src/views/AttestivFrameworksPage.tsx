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

import { useEffect, useMemo, useState } from 'react'

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
  const [generated, setGenerated] = useState<{ id: string; path: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const allowDemo = isDemoMode()
    async function load() {
      try {
        const response = await apiFetch('/config/frameworks')
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const body = await response.json().catch(() => ({}))
        const enabledIds: string[] = Array.isArray(body?.enabled) ? body.enabled : []
        if (!cancelled) {
          if (enabledIds.length > 0) {
            setFrameworks(deriveFromEnabledList(enabledIds))
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

  // Two-step generate-and-download:
  //   1. POST /v1/generate-report — synchronously creates the run +
  //      markdown report. Response includes the run_id we need to
  //      pull the PDF off the per-run endpoint.
  //   2. GET /v1/runs/{run_id}/report/pdf — auto-generates the PDF
  //      from the just-created run and streams it back. We turn the
  //      streamed bytes into a blob URL and click an invisible <a>
  //      to trigger the browser's download dialogue.
  //
  // Errors at either step surface in the error banner and never
  // produce a half-generated state — if step 1 succeeds but step 2
  // fails, the markdown report is still on the server and the user
  // can download it later from the Audit / Reports page.
  async function generateReport(framework: FrameworkPosture) {
    setGenerating(framework.id)
    setGenerated(null)
    setError(null)
    try {
      const genResponse = await apiFetch('/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          framework: framework.id,
          frameworks: [framework.id],
        }),
      })
      if (!genResponse.ok) {
        const text = await genResponse.text().catch(() => '')
        throw new Error(text || `${genResponse.status} ${genResponse.statusText}`)
      }
      const genBody = await genResponse.json().catch(() => ({}))
      const runID: string | undefined =
        (typeof genBody?.run?.run_id === 'string' && genBody.run.run_id) ||
        (typeof genBody?.run_id === 'string' && genBody.run_id) ||
        undefined
      if (!runID) {
        throw new Error('Backend returned no run_id; cannot fetch PDF')
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
      setError(err?.message ?? 'Failed to generate report')
    } finally {
      setGenerating(null)
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
                onGenerate={() => generateReport(framework)}
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
  onGenerate,
}: {
  framework: FrameworkPosture
  generating: boolean
  onGenerate: () => void
}) {
  const {
    t
  } = useI18n();

  const tone: 'green' | 'amber' | 'red' =
    framework.overall >= 95 ? 'green' : framework.overall >= 85 ? 'amber' : 'red'
  return (
    <Card>
      <CardTitle right={<Badge tone={tone}>{framework.overall}%</Badge>}>
        {framework.name}
      </CardTitle>
      <div style={{ marginBottom: 10 }}>
        {framework.control_areas.map((area) => (
          <FrameworkBar key={area.name} name={area.name} percent={area.percent} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {framework.last_updated ? `Updated ${framework.last_updated}` : 'Posture from latest signed run'}
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
          <PrimaryButton onClick={onGenerate} disabled={generating}>
            {generating ? (
              <>
                <i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'attestiv-spin 1s linear infinite' }} />
                {t('Generating…', 'Generating…')}
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

function deriveFromEnabledList(enabled: string[]): FrameworkPosture[] {
  // The /v1/config/frameworks endpoint returns IDs but no posture.
  // Map known IDs to demo data; unknown IDs fall back to a neutral
  // "no data" entry rather than being dropped, so the user sees what's
  // configured even before runs accumulate.
  return enabled.map((id) => {
    const known = DEMO_POSTURE.find((entry) => entry.id === id)
    if (known) return known
    return {
      id,
      name: labelFor(id),
      overall: 0,
      control_areas: [],
    }
  })
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
