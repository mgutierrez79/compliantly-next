'use client';
import { useEffect, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Card, ErrorBox, Label, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'

import { useI18n } from '../lib/i18n';

type FrameworkDelta = {
  framework: string
  score: number
  delta?: number | null
  status?: string | null
}

type OwnerSummary = {
  owner: string
  high_findings: number
}

type RiskTier = {
  label?: string
  tier?: string
  message?: string
}

type ManagementViewResponse = {
  run_id: string
  timestamp: string
  overall_risk: string
  risk_score: number
  risk_tier?: RiskTier
  score_delta?: number | null
  trend?: Array<Record<string, unknown>>
  framework_deltas?: FrameworkDelta[]
  top_risk_drivers?: string[]
  top_actions?: string[]
  owners?: OwnerSummary[]
  risks_total?: number | null
  risks_open?: number | null
  exceptions_total?: number | null
  exceptions_open?: number | null
}

export function ExecutiveManagementPage() {
  const {
    t
  } = useI18n();

  const [data, setData] = useState<ManagementViewResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      setLoading(true)
      try {
        const response = await apiJson<ManagementViewResponse>('/executive/management')
        if (!cancelled) setData(response)
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const riskTier: RiskTier = data?.risk_tier || {}

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{t('Executive Management View', 'Executive Management View')}</PageTitle>
        <div className="text-xs text-slate-400">{data ? `Run ${data.run_id}` : ''}</div>
      </div>
      {error ? <ErrorBox title={t('Executive view error', 'Executive view error')} detail={error.message} /> : null}
      <Card>
        {loading ? (
          <div className="text-sm text-slate-300">{t('Loading executive view…', 'Loading executive view…')}</div>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>{t('Risk score', 'Risk score')}</Label>
              <div className="mt-2 text-3xl font-semibold text-slate-100">{data.risk_score}</div>
              <div className="text-xs text-slate-300">
                {t('Overall risk:', 'Overall risk:')} {data.overall_risk?.toUpperCase() || 'n/a'}
              </div>
              {data.score_delta !== null && data.score_delta !== undefined ? (
                <div className="text-xs text-slate-400">{t('Delta:', 'Delta:')} {data.score_delta}</div>
              ) : null}
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>{t('Risk tier', 'Risk tier')}</Label>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {String(riskTier.label || riskTier.tier || 'n/a')}
              </div>
              <div className="text-xs text-slate-300">{String(riskTier.message || '')}</div>
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>{t('Risks', 'Risks')}</Label>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {data.risks_open ?? 0} {t('open /', 'open /')} {data.risks_total ?? 0}total
                              </div>
              <div className="text-xs text-slate-400">{t('Updated', 'Updated')} {formatTimestamp(data.timestamp)}</div>
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>{t('Exceptions', 'Exceptions')}</Label>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {data.exceptions_open ?? 0} {t('open /', 'open /')} {data.exceptions_total ?? 0}total
                              </div>
              <div className="text-xs text-slate-400">{t('Run', 'Run')} {data.run_id}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-300">{t('No executive summary available.', 'No executive summary available.')}</div>
        )}
      </Card>
      {data ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <Label>{t('Top risk drivers', 'Top risk drivers')}</Label>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {(data.top_risk_drivers || []).length ? (
                data.top_risk_drivers?.map((driver, index) => (
                  <div key={`driver-${index}`} className="rounded-md border border-[#203659] bg-[#0b1626] p-2">
                    {driver}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">{t('No drivers recorded.', 'No drivers recorded.')}</div>
              )}
            </div>
          </Card>

          <Card>
            <Label>{t('Top actions', 'Top actions')}</Label>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {(data.top_actions || []).length ? (
                data.top_actions?.map((action, index) => (
                  <div key={`action-${index}`} className="rounded-md border border-[#203659] bg-[#0b1626] p-2">
                    {action}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">{t('No actions recorded.', 'No actions recorded.')}</div>
              )}
            </div>
          </Card>

          <Card>
            <Label>{t('Owners to act', 'Owners to act')}</Label>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {(data.owners || []).length ? (
                data.owners?.map((owner, index) => (
                  <div key={`owner-${index}`} className="flex items-center justify-between rounded-md border border-[#203659] bg-[#0b1626] p-2">
                    <span>{owner.owner || 'unassigned'}</span>
                    <span className="text-xs text-slate-400">{owner.high_findings} high/critical</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">{t('No owners recorded.', 'No owners recorded.')}</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}
      {data ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>{t('Framework deltas', 'Framework deltas')}</Label>
            <div className="text-xs text-slate-400">{t('Latest vs previous', 'Latest vs previous')}</div>
          </div>
          <div className="mt-3 space-y-2">
            {(data.framework_deltas || []).length ? (
              data.framework_deltas?.map((delta, index) => {
                const {
                  t
                } = useI18n();

                return (
                  <div
                    key={`delta-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#203659] bg-[#0b1626] px-3 py-2 text-sm"
                  >
                    <span>{delta.framework}</span>
                    <span className="text-slate-200">{t('Score:', 'Score:')} {delta.score}</span>
                    <span className="text-xs text-slate-400">
                      {t('Delta:', 'Delta:')} {delta.delta ?? 0} {delta.status ? `(${delta.status})` : ''}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-400">{t('No framework deltas available.', 'No framework deltas available.')}</div>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
