'use client';
import { useEffect, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Card, ErrorBox, HelpTip, Label, PageTitle } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type Health = { status: string }
type ReadyCheck = { status: string; error?: string }
type ReadyPayload = {
  status: string
  checks?: Record<string, ReadyCheck>
  async_jobs_enabled?: boolean
  async_only_heavy_endpoints?: boolean
  workers?: { status?: string; mode?: string; autostart?: boolean }
}

function statusTone(status?: string) {
  if (!status) return 'border-slate-800 bg-slate-900/40 text-slate-200'
  const s = status.toLowerCase()
  if (['ok', 'healthy', 'ready', 'live', 'up', 'running'].includes(s)) {
    return 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100'
  }
  if (['degraded', 'warning', 'warn'].includes(s)) {
    return 'border-amber-500/40 bg-amber-950/30 text-amber-100'
  }
  if (['error', 'down', 'failed', 'fail'].includes(s)) {
    return 'border-rose-500/40 bg-rose-950/30 text-rose-100'
  }
  return 'border-slate-700 bg-slate-900/40 text-slate-200'
}

function statusLabel(status?: string) {
  if (!status) return 'unknown'
  return status
}

export function HealthPage() {
  const {
    t
  } = useI18n();

  const [live, setLive] = useState<Health | null>(null)
  const [ready, setReady] = useState<ReadyPayload | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(null)
      try {
        const [liveRes, readyRes] = await Promise.all([apiJson<Health>('/live'), apiJson<ReadyPayload>('/ready')])
        if (!cancelled) {
          setLive(liveRes)
          setReady(readyRes)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PageTitle>{t('Health', 'Health')}</PageTitle>
        <HelpTip text={'Live = process up; Ready = dependencies (DB/Redis), async toggle, and worker status.\nGreen=healthy, yellow=degraded, red=failing.'} />
      </div>
      <p className="text-sm text-slate-400">
        {t(
          'Green is healthy, yellow is degraded, red is failing. Use the worker section to confirm async processing.',
          'Green is healthy, yellow is degraded, red is failing. Use the worker section to confirm async processing.'
        )}
      </p>
      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Label>{t('Live', 'Live')}</Label>
          <div className={`mt-3 rounded-lg border p-3 text-sm ${statusTone(live?.status)}`}>
            {statusLabel(live?.status)}
          </div>
        </Card>
        <Card>
          <Label>{t('Ready', 'Ready')}</Label>
          <div className={`mt-3 rounded-lg border p-3 text-sm ${statusTone(ready?.status)}`}>
            {statusLabel(ready?.status)}
          </div>
          <div className="mt-3 text-xs text-slate-400">
            {t('Async jobs:', 'Async jobs:')} {ready?.async_jobs_enabled ? 'enabled' : 'disabled'}
          </div>
          <div className="text-xs text-slate-400">
            {t('Async-only heavy endpoints:', 'Async-only heavy endpoints:')} {ready?.async_only_heavy_endpoints ? 'on' : 'off'}
          </div>
        </Card>
        <Card>
          <Label>{t('Workers', 'Workers')}</Label>
          <div className={`mt-3 rounded-lg border p-3 text-sm ${statusTone(ready?.workers?.status)}`}>
            {statusLabel(ready?.workers?.status)}
          </div>
          <div className="mt-3 text-xs text-slate-400">{t('Mode:', 'Mode:')} {ready?.workers?.mode ?? 'unknown'}</div>
          <div className="text-xs text-slate-400">
            {t('Autostart:', 'Autostart:')} {ready?.workers?.autostart ? 'yes' : 'no'}
          </div>
        </Card>
      </div>
      <Card>
        <Label>{t('Subsystem checks', 'Subsystem checks')}</Label>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {Object.entries(ready?.checks ?? {}).map(([name, check]) => (
            <div key={name} className={`rounded-lg border p-3 text-sm ${statusTone(check.status)}`}>
              <div className="text-xs uppercase tracking-wide text-slate-300">{name}</div>
              <div className="mt-1 font-medium">{statusLabel(check.status)}</div>
              {check.error ? <div className="mt-2 text-xs text-slate-200/80">{check.error}</div> : null}
            </div>
          ))}
          {!ready?.checks || Object.keys(ready.checks).length === 0 ? (
            <div className="text-sm text-slate-400">{t('No checks reported.', 'No checks reported.')}</div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
