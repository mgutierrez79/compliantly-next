'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { formatTimestamp } from '../lib/time'
import { Button, Card, DangerButton, ErrorBox, HelpTip, Input, Label, PageTitle } from '../components/Ui'

type WorkerJobResponse = {
  job_id: string
  status: string
  result?: Record<string, unknown> | null
  error?: string | null
  attempts?: number | null
  max_retries?: number | null
}

type WorkerJobEntry = {
  job_id: string
  status: string
  kind?: string | null
  created_at?: string | null
  updated_at?: string | null
  attempts?: number | null
  max_retries?: number | null
  error?: string | null
}

type WorkerJobsResponse = {
  items: WorkerJobEntry[]
  count: number
}

type WorkerStatusResponse = {
  queue_mode: string
  totals: Record<string, number>
  inflight: number
  avg_duration_seconds?: number | null
  last_completed_at?: string | null
  sample_size: number
  redis?: { queue: number; processing: number } | null
}

type WorkerSummaryResponse = {
  status: WorkerStatusResponse
  jobs: WorkerJobsResponse
}

type FrameworkItem = { key: string; name?: string; version?: string }
type FrameworksResponse = { frameworks: FrameworkItem[] }

type GenerateReportPayload = {
  kind?: string
  assets: Array<Record<string, unknown>>
  patch_statuses: Array<Record<string, unknown>>
  identity_exposures: Array<Record<string, unknown>>
  framework?: string | null
  run_id?: string | null
  language?: string
}

const JOB_KINDS = [
  { value: 'generate_report', label: 'Generate report' },
  { value: 'dashboard_pdf', label: 'Dashboard PDF' },
  { value: 'framework_pdf', label: 'Framework PDF' },
  { value: 'framework_summary_pdf', label: 'Framework summary PDF' },
  { value: 'application_compliance_pdf', label: 'Application compliance PDF' },
  { value: 'executive_brief_pdf', label: 'Executive brief PDF' },
  { value: 'management_view_pdf', label: 'Management view PDF' },
  { value: 'board_readout_pdf', label: 'Board readout PDF' },
]

export function JobsPage() {
  const STALLED_HOURS = 4
  const [jobKind, setJobKind] = useState('generate_report')
  const [language, setLanguage] = useState('en')
  const [assetId, setAssetId] = useState('asset-ui')
  const [assetEnv, setAssetEnv] = useState('ui')
  const [patchStatus, setPatchStatus] = useState('missing')
  const [exposureType, setExposureType] = useState('public')
  const [frameworks, setFrameworks] = useState<FrameworkItem[]>([])
  const [frameworkKey, setFrameworkKey] = useState('')
  const [runId, setRunId] = useState('')
  const [jobId, setJobId] = useState<string>('')
  const [job, setJob] = useState<WorkerJobResponse | null>(null)
  const [jobFilter, setJobFilter] = useState<'running' | 'completed' | 'failed' | 'all'>('running')
  const [jobList, setJobList] = useState<WorkerJobEntry[]>([])
  const [jobListLoading, setJobListLoading] = useState(false)
  const [workerStatus, setWorkerStatus] = useState<WorkerStatusResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<ApiError | null>(null)

  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start) return 'n/a'
    const startMs = Date.parse(start)
    if (Number.isNaN(startMs)) return 'n/a'
    const endMs = end ? Date.parse(end) : Date.now()
    if (Number.isNaN(endMs)) return 'n/a'
    let deltaSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))
    const days = Math.floor(deltaSeconds / 86400)
    deltaSeconds -= days * 86400
    const hours = Math.floor(deltaSeconds / 3600)
    deltaSeconds -= hours * 3600
    const minutes = Math.floor(deltaSeconds / 60)
    const seconds = deltaSeconds - minutes * 60
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    if (days > 0) return `${days}d ${hh}:${mm}:${ss}`
    return `${hh}:${mm}:${ss}`
  }

  const secondsSince = (value?: string | null) => {
    if (!value) return null
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return null
    return Math.max(0, Math.floor((Date.now() - ms) / 1000))
  }

  const formatAge = (value?: string | null) => {
    const seconds = secondsSince(value)
    if (seconds === null) return 'n/a'
    return formatDuration(new Date(Date.now() - seconds * 1000).toISOString(), new Date().toISOString())
  }

  const isGenerateReport = jobKind === 'generate_report'
  const requiresFramework = jobKind === 'framework_pdf' || jobKind === 'framework_summary_pdf'
  const supportsRunId =
    jobKind === 'executive_brief_pdf' || jobKind === 'management_view_pdf' || jobKind === 'board_readout_pdf'

  const loadWorkerSummary = async () => {
    const response = await apiJson<WorkerSummaryResponse>('/worker/summary?limit=50')
    setWorkerStatus(response.status)
    setJobList(response.jobs.items || [])
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await apiJson<FrameworksResponse>('/config/frameworks')
        if (cancelled) return
        setFrameworks(response.frameworks || [])
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    const load = async () => {
      try {
        const summary = await apiJson<WorkerSummaryResponse>('/worker/summary?limit=50')
        if (cancelled) return
        setWorkerStatus(summary.status)
        setJobList(summary.jobs.items || [])
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
    }
    void load()
    intervalId = setInterval(load, 10000)
    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (frameworkKey || !frameworks.length) return
    setFrameworkKey(frameworks[0]?.key || '')
  }, [frameworkKey, frameworks])

  async function submitJob(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setJob(null)
    setLoading(true)
    try {
      const payload: GenerateReportPayload = {
        kind: jobKind,
        assets: assetId
          ? [
              {
                asset_id: assetId,
                metadata: assetEnv ? { env: assetEnv } : undefined,
              },
            ]
          : [],
        patch_statuses: assetId && patchStatus ? [{ asset_id: assetId, patch_status: patchStatus }] : [],
        identity_exposures: assetId && exposureType ? [{ asset_id: assetId, exposure_type: exposureType }] : [],
        language,
      }
      if (requiresFramework) {
        payload.framework = frameworkKey || null
      }
      if (supportsRunId && runId.trim()) {
        payload.run_id = runId.trim()
      }
      if (!isGenerateReport) {
        payload.assets = []
        payload.patch_statuses = []
        payload.identity_exposures = []
      }
      const response = await apiJson<WorkerJobResponse>('/worker/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setJobId(response.job_id)
      setJob(response)
      void refreshJobs()
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoading(false)
    }
  }

  async function refreshStatus() {
    if (!jobId) return
    setError(null)
    try {
      const response = await apiJson<WorkerJobResponse>(`/worker/report/${encodeURIComponent(jobId)}`)
      setJob(response)
      void refreshJobs()
    } catch (e) {
      setError(e as ApiError)
    }
  }

  async function refreshJobs() {
    setJobListLoading(true)
    setError(null)
    try {
      await loadWorkerSummary()
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setJobListLoading(false)
    }
  }

  const cancelJob = async (jobId: string) => {
    setActionError(null)
    try {
      await apiJson<WorkerJobResponse>(`/worker/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })
      void refreshJobs()
    } catch (err) {
      setActionError(err as ApiError)
    }
  }

  const eraseJob = async (jobId: string) => {
    setActionError(null)
    try {
      await apiJson<{ deleted: boolean }>(`/worker/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
      void refreshJobs()
    } catch (err) {
      setActionError(err as ApiError)
    }
  }

  const filteredJobs = jobList.filter((entry) => {
    if (jobFilter === 'all') return true
    if (jobFilter === 'running') return ['queued', 'running', 'retrying'].includes(entry.status)
    return entry.status === jobFilter
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PageTitle>Tasks</PageTitle>
        <HelpTip text={'Track worker tasks, then submit async jobs and poll their status. Use a sample asset to sanity-check the report pipeline.'} />
      </div>
      <p className="text-sm text-slate-400">
        Monitor running and completed tasks, then submit async worker jobs and check their status.
      </p>
      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}
      {actionError ? <ErrorBox title={actionError.message} detail={actionError.bodyText} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <Label>Worker status</Label>
            <Button onClick={refreshJobs} disabled={jobListLoading}>
              {jobListLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-slate-200">
            <div>
              <Label>Queue mode</Label>
              <div className="mt-1">{workerStatus?.queue_mode ?? 'n/a'}</div>
            </div>
            <div>
              <Label>In flight</Label>
              <div className="mt-1">{workerStatus?.inflight ?? 0}</div>
            </div>
            <div>
              <Label>Avg duration</Label>
              <div className="mt-1">
                {workerStatus?.avg_duration_seconds ? `${workerStatus.avg_duration_seconds.toFixed(1)}s` : 'n/a'}
              </div>
            </div>
            <div>
              <Label>Last completed</Label>
              <div className="mt-1">{formatTimestamp(workerStatus?.last_completed_at ?? undefined)}</div>
            </div>
            <div>
              <Label>Redis queue</Label>
              <div className="mt-1">
                {workerStatus?.redis
                  ? `${workerStatus.redis.queue} queued / ${workerStatus.redis.processing} processing`
                  : 'n/a'}
              </div>
            </div>
            <div className="md:col-span-2 text-xs text-slate-400">
              Sample size: {workerStatus?.sample_size ?? 0}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Label>Task summary</Label>
            <HelpTip text={'Recent task counts by status (from cached job records).'} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-200">
            <div>
              <Label>Queued</Label>
              <div className="mt-1">{workerStatus?.totals?.queued ?? 0}</div>
            </div>
            <div>
              <Label>Running</Label>
              <div className="mt-1">{workerStatus?.totals?.running ?? 0}</div>
            </div>
            <div>
              <Label>Retrying</Label>
              <div className="mt-1">{workerStatus?.totals?.retrying ?? 0}</div>
            </div>
            <div>
              <Label>Completed</Label>
              <div className="mt-1">{workerStatus?.totals?.completed ?? 0}</div>
            </div>
            <div>
              <Label>Failed</Label>
              <div className="mt-1">{workerStatus?.totals?.failed ?? 0}</div>
            </div>
            <div>
              <Label>Unknown</Label>
              <div className="mt-1">{workerStatus?.totals?.unknown ?? 0}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>Recent tasks</Label>
          <div className="flex flex-wrap gap-2">
            {(['running', 'completed', 'failed', 'all'] as const).map((filter) => {
              const isActive = jobFilter === filter
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setJobFilter(filter)}
                  className={[
                    'rounded-lg border border-[#2b4a75] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition',
                    isActive ? 'bg-[#1c3352] text-white' : 'bg-[#0d1a2b] text-slate-300 hover:bg-[#162a44]',
                  ].join(' ')}
                >
                  {filter}
                </button>
              )
            })}
          </div>
        </div>
        {workerStatus?.totals?.queued && !workerStatus?.totals?.running && !workerStatus?.totals?.retrying ? (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Queue has {workerStatus.totals.queued} job(s) waiting but none running. Worker may be down or connected to a different Redis.
          </div>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          {filteredJobs.length ? (
            <table className="min-w-full text-sm text-slate-200">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4">Job ID</th>
                  <th className="py-2 pr-4">Kind</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2 pr-4">Age</th>
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredJobs.map((entry) => {
                  const updatedAge = secondsSince(entry.updated_at ?? entry.created_at)
                  const isStalled = updatedAge !== null && updatedAge >= STALLED_HOURS * 3600
                  return (
                  <tr key={entry.job_id} className="text-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">{entry.job_id}</td>
                    <td className="py-2 pr-4">{entry.kind || 'generate_report'}</td>
                    <td className="py-2 pr-4">
                      <span>{entry.status}</span>
                      {isStalled ? (
                        <span className="ml-2 rounded-full border border-amber-400/50 px-2 py-0.5 text-[10px] uppercase text-amber-200">
                          stalled
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{formatTimestamp(entry.updated_at ?? entry.created_at ?? undefined)}</td>
                    <td className="py-2 pr-4">{formatAge(entry.updated_at ?? entry.created_at)}</td>
                    <td className="py-2 pr-4">
                      {entry.status === 'completed' || entry.status === 'failed'
                        ? formatDuration(entry.created_at, entry.updated_at)
                        : formatDuration(entry.created_at, null)}
                    </td>
                    <td className="py-2 pr-4">
                      {entry.attempts ?? 0}/{entry.max_retries ?? 0}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.status !== 'completed' && entry.status !== 'failed' ? (
                          <Button
                            size="sm"
                            onClick={() => cancelJob(entry.job_id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                        <DangerButton size="sm" onClick={() => eraseJob(entry.job_id)}>
                          Erase
                        </DangerButton>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-slate-400">No tasks to show.</div>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Cancel/retry controls are not available yet in the API.
        </div>
      </Card>

      <Card>
        <Label>Submit job (async)</Label>
        <form className="mt-3 space-y-3" onSubmit={submitJob}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <Label>Job type</Label>
                <HelpTip text={'Choose which async worker task to queue.'} />
              </div>
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                value={jobKind}
                onChange={(e) => setJobKind(e.target.value)}
              >
                {JOB_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Label>Language</Label>
                <HelpTip text={'Report language code. Example: en, fr, es.'} />
              </div>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en|fr|es" />
            </div>
            {requiresFramework ? (
              <div>
                <div className="flex items-center gap-2">
                  <Label>Framework</Label>
                  <HelpTip text={'Framework key for PDF generation. Example: dora, nis2, iso27001.'} />
                </div>
                <select
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  value={frameworkKey}
                  onChange={(e) => setFrameworkKey(e.target.value)}
                >
                  {frameworks.map((fw) => (
                    <option key={fw.key} value={fw.key}>
                      {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {supportsRunId ? (
              <div>
                <div className="flex items-center gap-2">
                  <Label>Run ID (optional)</Label>
                  <HelpTip text={'Target a specific run id or leave empty for the latest run.'} />
                </div>
                <Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="run-YYYYMMDD-HHMMSS" />
              </div>
            ) : null}
            {isGenerateReport ? (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Asset ID</Label>
                    <HelpTip text={'Unique asset identifier used in findings. Example: asset-123.'} />
                  </div>
                  <Input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="asset-123" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Asset environment</Label>
                    <HelpTip text={'Optional environment tag. Example: prod, dev, lab.'} />
                  </div>
                  <Input value={assetEnv} onChange={(e) => setAssetEnv(e.target.value)} placeholder="prod|dev|lab" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Patch status</Label>
                    <HelpTip text={'Patch status used for scoring. Example: missing or ok.'} />
                  </div>
                  <Input
                    value={patchStatus}
                    onChange={(e) => setPatchStatus(e.target.value)}
                    placeholder="missing|ok"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Exposure type</Label>
                    <HelpTip text={'Exposure category for identity risk. Example: public or none.'} />
                  </div>
                  <Input
                    value={exposureType}
                    onChange={(e) => setExposureType(e.target.value)}
                    placeholder="public|none"
                  />
                </div>
              </>
            ) : null}
          </div>
          <Button type="submit" disabled={loading || (requiresFramework && !frameworkKey)}>
            {loading ? 'Submitting...' : 'Submit job'}
          </Button>
        </form>
      </Card>

      <Card>
        <Label>Job status</Label>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Label>Job ID</Label>
              <HelpTip text={'Paste the job_id returned by the async request. Example: 6f2c...'} />
            </div>
            <Input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="job_id" />
          </div>
          <div className="md:col-span-1">
            <Button onClick={refreshStatus} disabled={!jobId}>
              Refresh
            </Button>
          </div>
        </div>
        {job ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-200">
            <div>
              <Label>Status</Label>
              <div className="mt-1">{job.status}</div>
            </div>
            <div>
              <Label>Attempts</Label>
              <div className="mt-1">{job.attempts ?? 0}</div>
            </div>
            <div>
              <Label>Max retries</Label>
              <div className="mt-1">{job.max_retries ?? 0}</div>
            </div>
            <div className="md:col-span-3">
              <Label>Result</Label>
              <div className="mt-1 text-xs text-slate-300">
                {job.result && Object.keys(job.result).length
                  ? Object.entries(job.result).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-slate-400">{key}:</span>
                        <span>{String(value)}</span>
                      </div>
                    ))
                  : 'No result yet.'}
              </div>
            </div>
            {job.error ? (
              <div className="md:col-span-3">
                <Label>Error</Label>
                <div className="mt-1 text-xs text-rose-200">{job.error}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-400">No job loaded.</div>
        )}
      </Card>
    </div>
  )
}
