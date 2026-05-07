'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, Input, Label, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'

type AuditLogEntry = {
  timestamp: string
  action: string
  actor: string
  metadata?: Record<string, unknown>
}

type AuditLogResponse = {
  items: AuditLogEntry[]
  count: number
  limit: number
  offset: number
}

function toIso(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString()
}

function formatMetadata(entry: AuditLogEntry): string {
  const metadata = entry.metadata ?? {}
  if (!Object.keys(metadata).length) return '—'
  const serialized = JSON.stringify(metadata, null, 2)
  if (serialized.length <= 500) return serialized
  return `${serialized.slice(0, 500)}\n…`
}

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [count, setCount] = useState(0)
  const [limit, setLimit] = useState(200)
  const [offset, setOffset] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [untilFilter, setUntilFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (actionFilter.trim()) params.set('action', actionFilter.trim())
    if (actorFilter.trim()) params.set('actor', actorFilter.trim())
    if (sinceFilter.trim()) params.set('since', toIso(sinceFilter.trim()))
    if (untilFilter.trim()) params.set('until', toIso(untilFilter.trim()))
    return params.toString()
  }, [actionFilter, actorFilter, limit, offset, sinceFilter, untilFilter])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const response = await apiJson<AuditLogResponse>(`/audit/log?${queryString}`)
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

  const hasPrev = offset > 0
  const hasNext = offset + limit < count

  const clearFilters = () => {
    setActionFilter('')
    setActorFilter('')
    setSinceFilter('')
    setUntilFilter('')
    setOffset(0)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Audit Log</PageTitle>
        <div className="text-xs text-slate-400">{count} event(s)</div>
      </div>

      {error ? <ErrorBox title="Audit log error" detail={error.message} /> : null}

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Action contains</Label>
            <Input
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value)
                setOffset(0)
              }}
              placeholder="connector.update"
            />
          </div>
          <div className="space-y-2">
            <Label>Actor contains</Label>
            <Input
              value={actorFilter}
              onChange={(event) => {
                setActorFilter(event.target.value)
                setOffset(0)
              }}
              placeholder="user@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Since</Label>
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
            <Label>Until</Label>
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
            <Label>Page size</Label>
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
            Clear filters
          </Button>
          <span className="text-xs text-slate-400">
            Showing {count === 0 ? 0 : offset + 1}-{Math.min(offset + limit, count)} of {count}
          </span>
        </div>
      </Card>

      <Card>
        <div className="grid gap-3">
          {items.length ? (
            items.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${entry.action}-${index}`}
                className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{entry.action}</div>
                    <div className="text-xs text-slate-400">
                      {entry.actor || 'unknown'} · {entry.timestamp ? formatTimestamp(entry.timestamp) : 'n/a'}
                    </div>
                  </div>
                </div>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-[#233a61] bg-[#0d1a2b] p-3 text-xs text-slate-200">
                  {formatMetadata(entry)}
                </pre>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400">No audit events recorded yet.</div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={!hasPrev || loading}>
          Previous
        </Button>
        <Button onClick={() => setOffset(offset + limit)} disabled={!hasNext || loading}>
          Next
        </Button>
      </div>
    </div>
  )
}
