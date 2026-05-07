'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, Label, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'

type FrameworkSummary = { key: string; name?: string; version?: string }
type FrameworksResponse = { frameworks: FrameworkSummary[] }

type RunItem = {
  run_id: string
  timestamp?: string
  risk_score?: number
  overall_risk?: string
}

type RunsResponse = { items: RunItem[]; count: number }

export function AuditorPortalPage() {
  const [frameworks, setFrameworks] = useState<FrameworkSummary[]>([])
  const [runs, setRuns] = useState<RunItem[]>([])
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const frameworkResponse = await apiJson<FrameworksResponse>('/config/frameworks')
        if (!cancelled) {
          setFrameworks(frameworkResponse.frameworks || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as ApiError)
        }
      }
      try {
        const runResponse = await apiJson<RunsResponse>('/runs?limit=50&lite=1')
        if (!cancelled) {
          setRuns(runResponse.items || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as ApiError)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const latestRun = useMemo(() => {
    if (!runs.length) return null
    return [...runs].sort((a, b) => (Date.parse(b.timestamp ?? '') || 0) - (Date.parse(a.timestamp ?? '') || 0))[0]
  }, [runs])

  const openReport = async (format: 'md' | 'pdf') => {
    if (!latestRun) return
    try {
      const response = await apiFetch(
        format === 'pdf'
          ? `/runs/${encodeURIComponent(latestRun.run_id)}/report/pdf`
          : `/runs/${encodeURIComponent(latestRun.run_id)}/report`,
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      setError(err as ApiError)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Auditor Portal</PageTitle>
        <div className="text-xs text-slate-400">Read-only access</div>
      </div>

      {error ? <ErrorBox title="Auditor portal error" detail={error.message} /> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Latest report</div>
            <div className="text-xs text-slate-400">
              {latestRun ? `Run ${latestRun.run_id} (${formatTimestamp(latestRun.timestamp)})` : 'No runs yet.'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => openReport('md')} disabled={!latestRun}>
              View report
            </Button>
            <Button onClick={() => openReport('pdf')} disabled={!latestRun}>
              PDF
            </Button>
            <Link href="/runs" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
              All reports
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Enabled regulations</Label>
            <div className="text-xs text-slate-400">Audit scope overview</div>
          </div>
          <Link href="/regulations" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            View regulations
          </Link>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
          {frameworks.length
            ? frameworks.map((fw) => (
                <div key={fw.key} className="rounded-md border border-[#1f365a] bg-[#0f1f36] px-3 py-2">
                  {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                </div>
              ))
            : 'No regulations configured.'}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/audit-log" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Audit log
          </Link>
          <Link href="/evidence-log" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Evidence log
          </Link>
          <Link href="/evidence-requests" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Evidence requests
          </Link>
          <Link href="/exceptions" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Exceptions
          </Link>
          <Link href="/inventory" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Inventory
          </Link>
          <Link href="/trust-center" className="rounded-md border border-[#274266] px-3 py-2 text-sm text-slate-200">
            Trust center
          </Link>
        </div>
      </Card>
    </div>
  )
}
