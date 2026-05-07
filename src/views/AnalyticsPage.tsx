'use client'

import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Card, ErrorBox, HelpTip, Label, PageTitle } from '../components/Ui'

type TrendPoint = {
  run_id?: string | null
  timestamp: string
  risk_score: number
  finding_count: number
}

type TrendResponse = {
  framework: string
  points: TrendPoint[]
}

export function AnalyticsPage() {
  const [frameworks, setFrameworks] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string>('iso27001')
  const [trend, setTrend] = useState<TrendResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [sortKey, setSortKey] = useState<'timestamp' | 'risk_score' | 'finding_count'>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState({
    timestamp: '',
    risk_score: '',
    finding_count: '',
  })

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(null)
      try {
        const list = await apiJson<string[]>('/analytics/frameworks')
        if (!cancelled) {
          setFrameworks(list)
          setSelected((current) => (list.length && !list.includes(current) ? list[0] : current))
        }
      } catch (e) {
        if (!cancelled) setError(e as ApiError)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const visiblePoints = useMemo(() => {
    const points = trend?.points ?? []
    const normalize = (value: unknown) => String(value ?? '').toLowerCase()
    const filtered = points.filter((point) => {
      if (filters.timestamp && !normalize(point.timestamp).includes(filters.timestamp.toLowerCase())) {
        return false
      }
      if (
        filters.risk_score &&
        !normalize(point.risk_score).includes(filters.risk_score.toLowerCase())
      ) {
        return false
      }
      if (
        filters.finding_count &&
        !normalize(point.finding_count).includes(filters.finding_count.toLowerCase())
      ) {
        return false
      }
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'timestamp') {
        const aTime = Date.parse(a.timestamp) || 0
        const bTime = Date.parse(b.timestamp) || 0
        return (aTime - bTime) * direction
      }
      const aValue = sortKey === 'risk_score' ? a.risk_score : a.finding_count
      const bValue = sortKey === 'risk_score' ? b.risk_score : b.finding_count
      return ((aValue ?? 0) - (bValue ?? 0)) * direction
    })
    return sorted.slice(0, 20)
  }, [trend, filters, sortKey, sortDir])

  const toggleSort = (key: 'timestamp' | 'risk_score' | 'finding_count') => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortLabel = (key: 'timestamp' | 'risk_score' | 'finding_count') =>
    sortKey === key ? (sortDir === 'asc' ? ' (asc)' : ' (desc)') : ''

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!selected) return
      setError(null)
      try {
        const result = await apiJson<TrendResponse>(`/analytics/frameworks/${encodeURIComponent(selected)}`)
        if (!cancelled) setTrend(result)
      } catch (e) {
        if (!cancelled) setError(e as ApiError)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [selected])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PageTitle>Analytics</PageTitle>
          <HelpTip text={'Pick a framework to see recent trend points (risk score and finding counts) pulled from stored runs.'} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label>Framework</Label>
            <HelpTip text={'Framework to view. Example: iso27001, nis2, dora.'} />
          </div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
          >
            {(frameworks ?? ['iso27001']).map((fw) => (
              <option key={fw} value={fw}>
                {fw}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-slate-300">
        Track framework trends over time. Pick a framework to view recent score and finding changes.
      </p>

      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}

      <Card>
        <Label>Trend points</Label>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => toggleSort('timestamp')}
                  >
                    Timestamp{sortLabel('timestamp')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => toggleSort('risk_score')}
                  >
                    Risk score{sortLabel('risk_score')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => toggleSort('finding_count')}
                  >
                    Findings{sortLabel('finding_count')}
                  </button>
                </th>
              </tr>
              <tr className="text-slate-400">
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.timestamp}
                    onChange={(e) => setFilters({ ...filters, timestamp: e.target.value })}
                    placeholder="Filter"
                    aria-label="Filter timestamp"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.risk_score}
                    onChange={(e) => setFilters({ ...filters, risk_score: e.target.value })}
                    placeholder="Filter"
                    aria-label="Filter risk score"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <input
                    className="w-full rounded border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-200"
                    value={filters.finding_count}
                    onChange={(e) => setFilters({ ...filters, finding_count: e.target.value })}
                    placeholder="Filter"
                    aria-label="Filter findings"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f365a]">
              {visiblePoints.map((p) => (
                <tr key={`${p.timestamp}-${p.run_id ?? ''}`} className="text-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs">{p.timestamp}</td>
                  <td className="py-2 pr-4">{p.risk_score}</td>
                  <td className="py-2 pr-4">{p.finding_count}</td>
                </tr>
              ))}
              {!visiblePoints.length ? (
                <tr>
                  <td className="py-4 text-sm text-slate-300" colSpan={3}>
                    No trend data returned.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
