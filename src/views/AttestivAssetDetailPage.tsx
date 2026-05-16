'use client';
// Per-asset detail / compliance contribution view.
//
// Operator lands here from the inventory page. Shows:
//   1. Asset header (name, type, source, scope flag)
//   2. Parent application (if any registered)
//   3. Per-VM compliance contribution — framework scores computed
//      against ONLY this asset's evidence pool (vm scope)
//
// Surfaces the auditor-attribution question: "this finding involves
// THIS specific VM — what controls is it touching, and which fail?"

import { useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'
import { useI18n } from '../lib/i18n'

type InventoryAsset = {
  asset_id: string
  name?: string | null
  asset_type?: string | null
  datacenter_id?: string | null
  criticality?: string | null
  application_id?: string | null
  framework_evaluation_enabled?: boolean
  tags?: string[]
  external_refs?: Array<{ source?: string }>
  metadata?: Record<string, unknown>
}

type AppSummary = {
  application_id: string
  display_name: string
  criticality_tier?: string
  gxp?: { validated?: boolean }
  components?: Array<{ vm_name?: string }>
}

type FrameworkSummary = {
  framework_id: string
  framework_name?: string
  score: number
  status: string
  total_controls: number
  passing_controls: number
  review_controls: number
  warn_controls: number
  fail_controls: number
}

type ScopeResult = {
  members_in_scope: number
  evidence_count: number
  frameworks_evaluated: number
  results: FrameworkSummary[]
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  PASS: 'green',
  REVIEW: 'amber',
  WARN: 'amber',
  FAIL: 'red',
}

export function AttestivAssetDetailPage({ assetID }: { assetID: string }) {
  const { t } = useI18n()
  const [asset, setAsset] = useState<InventoryAsset | null>(null)
  const [parentApp, setParentApp] = useState<AppSummary | null>(null)
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await apiFetch(`/inventory/assets/${encodeURIComponent(assetID)}`)
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const body = await response.json().catch(() => ({}))
        if (cancelled) return
        setAsset(body as InventoryAsset)
        // Find parent app by checking each registered app's components
        // for a vm_name match. The /v1/apps list is small (1-10 apps)
        // so client-side search is fine.
        try {
          const appsResp = await apiFetch('/apps')
          const appsBody = await appsResp.json().catch(() => ({}))
          if (!cancelled && Array.isArray(appsBody?.items)) {
            const name = String(body.name ?? '').toLowerCase()
            const id = String(body.asset_id ?? '').toLowerCase()
            const match = (appsBody.items as AppSummary[]).find((app) =>
              (app.components ?? []).some((c) => {
                const cn = String(c.vm_name ?? '').toLowerCase()
                return cn === name || cn === id
              }),
            )
            setParentApp(match ?? null)
          }
        } catch {
          // Apps unreachable / no apps registered — fine.
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load asset')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [assetID])

  async function evaluateScope() {
    if (!asset) return
    setEvaluating(true)
    setError(null)
    try {
      const response = await apiFetch('/scoring/evaluate-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_type: 'vm', scope_id: asset.asset_id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.detail || body?.error || `${response.status} ${response.statusText}`)
      }
      setScopeResult(body as ScopeResult)
    } catch (err: any) {
      setError(err?.message ?? 'Evaluation failed')
    } finally {
      setEvaluating(false)
    }
  }

  const sortedResults = useMemo(() => {
    if (!scopeResult?.results) return []
    return [...scopeResult.results].sort((a, b) => a.framework_id.localeCompare(b.framework_id))
  }, [scopeResult])

  return (
    <>
      <Topbar title={asset?.name ?? assetID} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 24px' }}>
        {error && <Banner tone="error">{error}</Banner>}

        {loading ? (
          <Skeleton lines={4} height={36} />
        ) : !asset ? (
          <EmptyState
            icon="ti-database-off"
            title={t('Asset not found', 'Asset not found')}
            description={t('The asset id is unknown to the inventory store.', 'The asset id is unknown to the inventory store.')}
          />
        ) : (
          <>
            <Card>
              <CardTitle>{t('Asset', 'Asset')}</CardTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginTop: 8, fontSize: 13 }}>
                <Stat label={t('Asset id', 'Asset id')} value={asset.asset_id} mono />
                <Stat label={t('Type', 'Type')} value={asset.asset_type ?? '—'} />
                <Stat label={t('Datacenter', 'Datacenter')} value={asset.datacenter_id ?? '—'} />
                <Stat label={t('Criticality', 'Criticality')} value={asset.criticality ?? '—'} />
                <Stat
                  label={t('Scope', 'Scope')}
                  value={
                    asset.framework_evaluation_enabled === false
                      ? t('Out of scope', 'Out of scope')
                      : t('In scope', 'In scope')
                  }
                />
                <Stat
                  label={t('Source', 'Source')}
                  value={(asset.external_refs ?? []).map((r) => r.source).filter(Boolean).join(', ') || '—'}
                />
              </div>
            </Card>

            <Card>
              <CardTitle>{t('Parent application', 'Parent application')}</CardTitle>
              {parentApp ? (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <a href={`/apps/${parentApp.application_id}`} style={{ fontWeight: 500 }}>
                      {parentApp.display_name}
                    </a>
                    {parentApp.gxp?.validated && <Badge tone="amber">GxP</Badge>}
                    {parentApp.criticality_tier && <Badge tone="navy">{parentApp.criticality_tier}</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                    {t('See app-scope compliance', 'See app-scope compliance')}:{' '}
                    <a href={`/scoring/scope?type=application&id=${parentApp.application_id}`}>
                      /scoring/scope
                    </a>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                  {t(
                    'This asset is not registered as a component of any application. Register it in /apps to get a parent-app compliance view.',
                    'This asset is not registered as a component of any application. Register it in /apps to get a parent-app compliance view.',
                  )}
                </p>
              )}
            </Card>

            <Card>
              <CardTitle
                right={
                  <button
                    type="button"
                    onClick={() => void evaluateScope()}
                    disabled={evaluating || asset.framework_evaluation_enabled === false}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: '0.5px solid var(--color-border-tertiary)',
                      background: 'var(--color-surface-secondary)',
                      cursor: evaluating ? 'wait' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {evaluating
                      ? t('Evaluating…', 'Evaluating…')
                      : t('Evaluate per-VM scope', 'Evaluate per-VM scope')}
                  </button>
                }
              >
                {t('Per-VM compliance contribution', 'Per-VM compliance contribution')}
              </CardTitle>
              {asset.framework_evaluation_enabled === false ? (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                  {t(
                    'This asset is marked out of scope. Mark it in scope from the inventory page to score it.',
                    'This asset is marked out of scope. Mark it in scope from the inventory page to score it.',
                  )}
                </p>
              ) : !scopeResult ? (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                  {t(
                    'Click Evaluate to compute framework scores against ONLY this VM\'s evidence. Useful for finding which controls this asset contributes to or fails for.',
                    'Click Evaluate to compute framework scores against ONLY this VM\'s evidence. Useful for finding which controls this asset contributes to or fails for.',
                  )}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 24, marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    <span>{t('Members in scope: {n}', 'Members in scope: {n}', { n: scopeResult.members_in_scope })}</span>
                    <span>{t('Evidence records: {n}', 'Evidence records: {n}', { n: scopeResult.evidence_count })}</span>
                    <span>{t('Frameworks: {n}', 'Frameworks: {n}', { n: scopeResult.frameworks_evaluated })}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ padding: '6px 10px 6px 0' }}>{t('Framework', 'Framework')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Score', 'Score')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Status', 'Status')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Pass', 'Pass')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Review', 'Review')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Warn', 'Warn')}</th>
                        <th style={{ padding: '6px 10px' }}>{t('Fail', 'Fail')}</th>
                        <th style={{ padding: '6px 0 6px 10px' }}>{t('Total', 'Total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map((f) => (
                        <tr key={f.framework_id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                          <td style={{ padding: '8px 10px 8px 0' }}>
                            <div style={{ fontWeight: 500 }}>{f.framework_name || f.framework_id}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{f.framework_id}</div>
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{(f.score * 100).toFixed(1)}%</td>
                          <td style={{ padding: '8px 10px' }}>
                            <Badge tone={STATUS_TONE[f.status] ?? 'gray'}>{f.status}</Badge>
                          </td>
                          <td style={{ padding: '8px 10px' }}>{f.passing_controls}</td>
                          <td style={{ padding: '8px 10px' }}>{f.review_controls}</td>
                          <td style={{ padding: '8px 10px' }}>{f.warn_controls}</td>
                          <td style={{ padding: '8px 10px' }}>{f.fail_controls}</td>
                          <td style={{ padding: '8px 0 8px 10px' }}>{f.total_controls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : undefined }}>
        {value}
      </span>
    </div>
  )
}
