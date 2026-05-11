'use client';
// Phase 4.7: data-freshness banner.
//
// Compliance teams need to know whether the dashboard is showing
// current evidence or stale data. This banner reports two things:
//   - When the most recent piece of evidence arrived ("3 minutes ago").
//   - Which connector has the oldest stale collection ("Veeam, 4h").
//
// "Stale" = older than 2× the connector's declared poll interval.
// Streaming connectors with no recent event are treated as stale
// after 2× their backstop poll interval (default 60s).

import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../lib/api'

import { useI18n } from '../lib/i18n';

type ConnectorStatus = {
  name: string
  label?: string
  last_run?: string | null
  last_success?: string | null
  poll_interval_seconds?: number
  delivery_mode?: string
}

type ConnectorsResponse = { connectors: ConnectorStatus[] }

const FALLBACK_INTERVAL_SECONDS = 24 * 3600

function lastSeenMs(connector: ConnectorStatus): number | null {
  const candidate = connector.last_success || connector.last_run
  if (!candidate) return null
  const ms = new Date(candidate).getTime()
  return Number.isFinite(ms) ? ms : null
}

function staleAfterMs(connector: ConnectorStatus): number {
  const interval = connector.poll_interval_seconds || (
    connector.delivery_mode === 'stream' ? 60 : FALLBACK_INTERVAL_SECONDS
  )
  return interval * 2 * 1000
}

function humanDuration(ms: number): string {
  if (ms < 0) return 'just now'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function FreshnessBanner() {
  const {
    t
  } = useI18n();

  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await apiJson<ConnectorsResponse>('/connectors')
        if (!cancelled) setConnectors(response.connectors || [])
      } catch {
        // Swallow: the dashboard surfaces other connectivity errors.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const refresh = window.setInterval(load, 60_000)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [])

  const summary = useMemo(() => {
    if (!connectors.length) return null
    let mostRecentMs: number | null = null
    let stalest: { connector: ConnectorStatus; ageMs: number } | null = null
    let staleCount = 0
    for (const connector of connectors) {
      const seen = lastSeenMs(connector)
      if (seen !== null) {
        if (mostRecentMs === null || seen > mostRecentMs) mostRecentMs = seen
        const age = now - seen
        if (age > staleAfterMs(connector)) {
          staleCount += 1
          if (!stalest || age > stalest.ageMs) {
            stalest = { connector, ageMs: age }
          }
        }
      } else {
        // Connector with no successful collection ever — counts as stale.
        staleCount += 1
        const ageMs = Number.MAX_SAFE_INTEGER
        if (!stalest || ageMs > stalest.ageMs) {
          stalest = { connector, ageMs }
        }
      }
    }
    return { mostRecentMs, stalest, staleCount }
  }, [connectors, now])

  if (loading || !summary) return null

  const { mostRecentMs, stalest, staleCount } = summary
  const lastEvidence = mostRecentMs ? humanDuration(now - mostRecentMs) : 'never'
  const tone = staleCount > 0 ? 'amber' : 'emerald'
  const palette =
    tone === 'emerald'
      ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-100'
      : 'border-amber-700/50 bg-amber-900/20 text-amber-100'

  return (
    <div className={`rounded-lg border px-4 py-2 text-sm ${palette}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          {t('Last evidence:', 'Last evidence:')} <span className="font-semibold">{lastEvidence}</span>
        </span>
        {stalest ? (
          <span>
            {t('Stalest connector:', 'Stalest connector:')}{' '}
            <span className="font-semibold">{stalest.connector.label || stalest.connector.name}</span>
            {' · '}
            {stalest.ageMs === Number.MAX_SAFE_INTEGER
              ? 'never reported'
              : humanDuration(stalest.ageMs)}
          </span>
        ) : (
          <span>{t('All connectors fresh.', 'All connectors fresh.')}</span>
        )}
        {staleCount > 0 ? (
          <span className="ml-auto text-xs">
            {staleCount} {t('stale connector', 'stale connector')}{staleCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
