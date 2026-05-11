'use client';
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, HelpTip, InfoBox, Input, Label, PageTitle } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type RunItem = {
  run_id: string
  timestamp?: string
  risk_score?: number
  overall_risk?: string
  path?: string | null
  summary?: Record<string, unknown>
}

type RunsResponse = { items: RunItem[]; count: number }
type FrameworksResponse = {
  frameworks: Array<{ key: string; name?: string; version?: string }>
}
type WorkerJobResponse = {
  job_id: string
  status: string
  result?: Record<string, unknown> | null
  error?: string | null
}
type AuthMeResponse = { roles: string[] }

export function RunsPage() {
  const {
    t
  } = useI18n();

  const RUN_FETCH_STEP = 50
  const [data, setData] = useState<RunsResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const [reportLanguage, setReportLanguage] = useState('en')
  const [reportFramework, setReportFramework] = useState('all')
  const [downloadFramework, setDownloadFramework] = useState('')
  const [frameworks, setFrameworks] = useState<Array<{ key: string; name?: string; version?: string }>>([])
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [exportingRunId, setExportingRunId] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'run_id' | 'timestamp' | 'risk_score' | 'overall_risk'>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [runFetchLimit, setRunFetchLimit] = useState(RUN_FETCH_STEP)
  const [filters, setFilters] = useState({
    run_id: '',
    timestamp: '',
    risk_score: '',
    overall_risk: '',
  })

  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(null)
      try {
        const result = await apiJson<RunsResponse>(`/runs?limit=${runFetchLimit}&lite=1`)
        if (!cancelled) setData(result)
      } catch (e) {
        if (!cancelled) setError(e as ApiError)
      }
      try {
        const result = await apiJson<FrameworksResponse>('/config/frameworks')
        if (!cancelled) setFrameworks(result.frameworks || [])
      } catch {
        if (!cancelled) setFrameworks([])
      }
      try {
        const authResult = await apiJson<AuthMeResponse>('/auth/me')
        if (!cancelled) {
          setRoles((authResult.roles || []).map((role) => role.toLowerCase()))
        }
      } catch {
        if (!cancelled) setRoles([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [runFetchLimit])

  const canGenerate = roles.includes('admin') || roles.includes('reporter')

  const refreshRuns = async () => {
    setActionError(null)
    try {
      const result = await apiJson<RunsResponse>(`/runs?limit=${runFetchLimit}&lite=1`)
      setData(result)
    } catch (e) {
      setActionError(e as ApiError)
    }
  }

  const generateReport = async () => {
    setActionMessage(null)
    setActionError(null)
    setGenerating(true)
    try {
      const response = await apiJson<WorkerJobResponse>('/generate-report/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets: [],
          patch_statuses: [],
          identity_exposures: [],
          frameworks: reportFramework === 'all' ? undefined : [reportFramework],
          language: reportLanguage || 'en',
        }),
      })
      setActionMessage(`Report job queued: ${response.job_id}. Check Jobs for status.`)
      await refreshRuns()
    } catch (e) {
      setActionError(e as ApiError)
    } finally {
      setGenerating(false)
    }
  }

  const downloadFrameworkReport = async () => {
    setActionMessage(null)
    setActionError(null)
    if (!downloadFramework) {
      setActionError({ message: 'Select a regulation to download.' } as ApiError)
      return
    }
    setDownloading(true)
    try {
      const response = await apiJson<WorkerJobResponse>(
        `/framework-summary/pdf/${encodeURIComponent(downloadFramework)}/async?language=${encodeURIComponent(
          reportLanguage || 'en',
        )}`,
      )
      setActionMessage(`Regulation PDF queued: ${response.job_id}. Check Jobs for status.`)
    } catch (e) {
      setActionError(e as ApiError)
    } finally {
      setDownloading(false)
    }
  }

  const openReport = async (runId: string, format: 'md' | 'pdf') => {
    setActionMessage(null)
    setActionError(null)
    try {
      const response = await apiFetch(
        format === 'pdf' ? `/runs/${encodeURIComponent(runId)}/report/pdf` : `/runs/${encodeURIComponent(runId)}/report`,
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      const err = e as ApiError
      if (format === 'pdf' && err.status === 404) {
        try {
          const response = await apiJson<WorkerJobResponse>(
            `/runs/${encodeURIComponent(runId)}/report/pdf/async?language=${encodeURIComponent(
              reportLanguage || 'en',
            )}`,
          )
          setActionMessage(`PDF queued: ${response.job_id}. Check Jobs for status.`)
          return
        } catch (enqueueError) {
          setActionError(enqueueError as ApiError)
          return
        }
      }
      setActionError(err)
    }
  }

  const exportPackage = async (runId: string) => {
    setActionMessage(null)
    setActionError(null)
    setExportingRunId(runId)
    try {
      const response = await apiFetch(`/runs/${encodeURIComponent(runId)}/export`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `export-${runId}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setActionMessage(`Export package downloaded for ${runId}.`)
    } catch (e) {
      setActionError(e as ApiError)
    } finally {
      setExportingRunId(null)
    }
  }

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    const q = query.trim().toLowerCase()
    const normalize = (value: unknown) => String(value ?? '').toLowerCase()
    const filteredItems = items.filter((item) => {
      if (q && !normalize(item.run_id).includes(q) && !normalize(item.overall_risk).includes(q)) {
        return false
      }
      if (filters.run_id && !normalize(item.run_id).includes(filters.run_id.toLowerCase())) {
        return false
      }
      if (filters.timestamp && !normalize(item.timestamp).includes(filters.timestamp.toLowerCase())) {
        return false
      }
      if (filters.risk_score && !normalize(item.risk_score).includes(filters.risk_score.toLowerCase())) {
        return false
      }
      if (filters.overall_risk && !normalize(item.overall_risk).includes(filters.overall_risk.toLowerCase())) {
        return false
      }
      return true
    })
    return filteredItems.sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'timestamp') {
        const aTime = Date.parse(a.timestamp ?? '') || 0
        const bTime = Date.parse(b.timestamp ?? '') || 0
        return (aTime - bTime) * direction
      }
      if (sortKey === 'risk_score') {
        return (((a.risk_score ?? 0) - (b.risk_score ?? 0)) * direction)
      }
      const aValue = String((a as Record<string, unknown>)[sortKey] ?? '').toLowerCase()
      const bValue = String((b as Record<string, unknown>)[sortKey] ?? '').toLowerCase()
      return aValue.localeCompare(bValue) * direction
    })
  }, [data, query, filters, sortKey, sortDir])

  const totalRuns = data?.count ?? 0
  const canLoadMore = totalRuns > (data?.items?.length ?? 0)

  const toggleSort = (key: 'run_id' | 'timestamp' | 'risk_score' | 'overall_risk') => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortLabel = (key: 'run_id' | 'timestamp' | 'risk_score' | 'overall_risk') =>
    sortKey === key ? (sortDir === 'asc' ? ' (asc)' : ' (desc)') : ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PageTitle>{t('Reports', 'Reports')}</PageTitle>
            <HelpTip text={'Browse generated runs, filter by run id or overall risk, and use the latest run for reports or PDFs.'} />
          </div>
          <p className="text-sm text-slate-400">
            {t(
              'Browse generated runs, filter by run id or overall risk, and use the latest run for reports.',
              'Browse generated runs, filter by run id or overall risk, and use the latest run for reports.'
            )}
          </p>
        </div>
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-2">
            <Label>{t('Filter', 'Filter')}</Label>
            <HelpTip text={'Search by run id or overall risk. Example: run-2024 or high.'} />
          </div>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Filter by run id or risk', 'Filter by run id or risk')} />
        </div>
      </div>
      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}
      {actionError ? <ErrorBox title={actionError.message} detail={actionError.bodyText} /> : null}
      {actionMessage ? <InfoBox title={actionMessage} /> : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>{t('Generate report', 'Generate report')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={refreshRuns}>{t('Refresh list', 'Refresh list')}</Button>
            {canGenerate ? (
              <Button onClick={generateReport} disabled={generating}>
                {generating ? 'Generating...' : 'Generate new report'}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <Label>{t('Language', 'Language')}</Label>
              <HelpTip text={'Language code for the report. Example: en, fr, es.'} />
            </div>
            <Input value={reportLanguage} onChange={(e) => setReportLanguage(e.target.value)} placeholder="en" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Label>{t('Regulation', 'Regulation')}</Label>
              <HelpTip text={'Generate a report for a specific regulation or use all enabled.'} />
            </div>
            <select
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
              value={reportFramework}
              onChange={(e) => setReportFramework(e.target.value)}
            >
              <option value="all">{t('All enabled', 'All enabled')}</option>
              {frameworks.map((fw) => (
                <option key={fw.key} value={fw.key}>
                  {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                </option>
              ))}
            </select>
          </div>
        </div>
        {canGenerate ? (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label>{t('Download regulation PDF', 'Download regulation PDF')}</Label>
              <Button onClick={downloadFrameworkReport} disabled={downloading || !downloadFramework}>
                {downloading ? 'Preparing...' : 'Download PDF'}
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <Label>{t('Regulation', 'Regulation')}</Label>
                  <HelpTip text={'Download the latest run summary PDF for a specific regulation.'} />
                </div>
                <select
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
                  value={downloadFramework}
                  onChange={(e) => setDownloadFramework(e.target.value)}
                >
                  <option value="">{t('Select regulation...', 'Select regulation...')}</option>
                  {frameworks.map((fw) => (
                    <option key={fw.key} value={fw.key}>
                      {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>{t('Runs', 'Runs')}</Label>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>
              {data ? `${data.items.length} of ${data.count} loaded` : 'n/a'}
            </span>
            {canLoadMore ? (
              <Button onClick={() => setRunFetchLimit((prev) => prev + RUN_FETCH_STEP)}>{t('Load more', 'Load more')}</Button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('run_id')}>
                    {t('Run', 'Run')}{sortLabel('run_id')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('timestamp')}>
                    {t('Timestamp', 'Timestamp')}{sortLabel('timestamp')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('risk_score')}>
                    {t('Risk score', 'Risk score')}{sortLabel('risk_score')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('overall_risk')}>
                    {t('Overall', 'Overall')}{sortLabel('overall_risk')}
                  </button>
                </th>
                <th className="py-2 pr-4">{t('Actions', 'Actions')}</th>
              </tr>
              <tr className="text-slate-400">
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.run_id}
                    onChange={(e) => setFilters({ ...filters, run_id: e.target.value })}
                    placeholder={t('Filter', 'Filter')}
                    aria-label={t('Filter run id', 'Filter run id')}
                  />
                </th>
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.timestamp}
                    onChange={(e) => setFilters({ ...filters, timestamp: e.target.value })}
                    placeholder={t('Filter', 'Filter')}
                    aria-label={t('Filter timestamp', 'Filter timestamp')}
                  />
                </th>
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.risk_score}
                    onChange={(e) => setFilters({ ...filters, risk_score: e.target.value })}
                    placeholder={t('Filter', 'Filter')}
                    aria-label={t('Filter risk score', 'Filter risk score')}
                  />
                </th>
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.overall_risk}
                    onChange={(e) => setFilters({ ...filters, overall_risk: e.target.value })}
                    placeholder={t('Filter', 'Filter')}
                    aria-label={t('Filter overall risk', 'Filter overall risk')}
                  />
                </th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(item => {
                const {
                  t
                } = useI18n();

                return (
                  <tr key={item.run_id} className="text-slate-200">
                    <td className="py-2 pr-4 font-mono text-xs">{item.run_id}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{item.timestamp ?? 'n/a'}</td>
                    <td className="py-2 pr-4">{item.risk_score ?? 'n/a'}</td>
                    <td className="py-2 pr-4">{item.overall_risk ?? 'n/a'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => openReport(item.run_id, 'md')}>{t('View', 'View')}</Button>
                        <Button onClick={() => openReport(item.run_id, 'pdf')}>PDF</Button>
                        <Button onClick={() => router.push(`/runs/${encodeURIComponent(item.run_id)}/manifest`)}>
                          {t('Manifest', 'Manifest')}
                        </Button>
                        <Button onClick={() => exportPackage(item.run_id)} disabled={exportingRunId === item.run_id}>
                          {exportingRunId === item.run_id ? 'Exporting...' : 'Export ZIP'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td className="py-4 text-sm text-slate-400" colSpan={5}>
                    {t('No runs found.', 'No runs found.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
