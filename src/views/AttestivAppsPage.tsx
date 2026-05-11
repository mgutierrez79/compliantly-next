'use client';
// Application registry page.
//
// One row per registered application — its display name, owner, the
// criticality tier the engine assigns it, GxP-validated flag, and
// the component + dependency counts that hint at how complex its
// blast radius is. Click through opens the detail view.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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

import { useI18n } from '../lib/i18n';

type AppSummary = {
  application_id: string
  display_name: string
  description?: string
  owner_email?: string
  criticality_tier?: string
  gxp_validated?: boolean
  component_count?: number
  dependency_count?: number
}

const TIER_TONE: Record<string, 'red' | 'amber' | 'navy' | 'gray'> = {
  tier_1: 'red',
  tier1: 'red',
  '1': 'red',
  tier_2: 'amber',
  tier2: 'amber',
  '2': 'amber',
  tier_3: 'navy',
  tier3: 'navy',
  '3': 'navy',
}

export function AttestivAppsPage() {
  const {
    t
  } = useI18n();

  const router = useRouter()
  const [apps, setApps] = useState<AppSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<{ tier?: string; gxp?: string }>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await apiFetch('/apps')
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const body = await response.json()
        if (!cancelled) {
          setApps(Array.isArray(body?.items) ? body.items : [])
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load applications')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      if (filter.tier && (app.criticality_tier ?? '').toLowerCase() !== filter.tier.toLowerCase()) {
        return false
      }
      if (filter.gxp === 'true' && !app.gxp_validated) return false
      if (filter.gxp === 'false' && app.gxp_validated) return false
      return true
    })
  }, [apps, filter])

  const summary = useMemo(() => {
    const totals = { total: apps.length, tier1: 0, gxp: 0 }
    for (const a of apps) {
      const tier = (a.criticality_tier ?? '').toLowerCase()
      if (tier === 'tier_1' || tier === 'tier1' || tier === '1') totals.tier1++
      if (a.gxp_validated) totals.gxp++
    }
    return totals
  }, [apps])

  return (
    <>
      <Topbar
        title={t('Applications', 'Applications')}
        left={<Badge tone="navy">{apps.length} registered</Badge>}
        right={
          <FilterBar value={filter} onChange={setFilter} />
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          <SummaryCard label={t('Total', 'Total')} value={summary.total} icon="ti-apps" tone="navy" />
          <SummaryCard label={t('Tier 1', 'Tier 1')} value={summary.tier1} icon="ti-flame" tone="red" />
          <SummaryCard label={t('GxP-validated', 'GxP-validated')} value={summary.gxp} icon="ti-flask" tone="navy" />
        </div>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{filtered.length} shown</span>}>
            {t('Application registry', 'Application registry')}
          </CardTitle>
          {loading ? (
            <Skeleton lines={5} height={42} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="ti-apps"
              title={t('No applications', 'No applications')}
              description={t(
                'Applications are configured via YAML in the policies/applications/ directory. Once registered they show up here for browsing + cascade analysis.',
                'Applications are configured via YAML in the policies/applications/ directory. Once registered they show up here for browsing + cascade analysis.'
              )}
            />
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '6px 10px 6px 0' }}>{t('Application', 'Application')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Tier', 'Tier')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('GxP', 'GxP')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Owner', 'Owner')}</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>{t('Components', 'Components')}</th>
                  <th style={{ padding: '6px 0 6px 10px', textAlign: 'right' }}>{t('Dependencies', 'Dependencies')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => {
                  const {
                    t
                  } = useI18n();

                  const tier = (app.criticality_tier ?? '').toLowerCase()
                  const tierTone = TIER_TONE[tier] ?? 'gray'
                  return (
                    <tr
                      key={app.application_id}
                      onClick={() => router.push(`/apps/${encodeURIComponent(app.application_id)}`)}
                      style={{
                        borderTop: '0.5px solid var(--color-border-tertiary)',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '10px 10px 10px 0' }}>
                        <div style={{ fontWeight: 500 }}>{app.display_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                          <code>{app.application_id}</code>
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {app.criticality_tier ? (
                          <Badge tone={tierTone}>{app.criticality_tier}</Badge>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {app.gxp_validated ? <Badge tone="navy" icon="ti-flask">{t('GxP', 'GxP')}</Badge> : <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>
                        {app.owner_email || '—'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {app.component_count ?? '—'}
                      </td>
                      <td style={{ padding: '10px 0 10px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {app.dependency_count ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'red' | 'amber' | 'navy' | 'green'
  icon: string
}) {
  const palette: Record<typeof tone, string> = {
    red: 'var(--color-status-red-mid)',
    amber: 'var(--color-status-amber-mid)',
    navy: 'var(--color-brand-blue)',
    green: 'var(--color-status-green-mid)',
  }
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${palette[tone]}1A`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: palette[tone],
          }}
        >
          <i className={`ti ${icon}`} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
        </div>
      </div>
    </Card>
  )
}

function FilterBar({
  value,
  onChange,
}: {
  value: { tier?: string; gxp?: string }
  onChange: (next: { tier?: string; gxp?: string }) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
      <SelectChip
        label={t('Tier', 'Tier')}
        value={value.tier}
        options={['tier_1', 'tier_2', 'tier_3']}
        onChange={(v) => onChange({ ...value, tier: v })}
      />
      <SelectChip
        label={t('GxP', 'GxP')}
        value={value.gxp}
        options={['true', 'false']}
        onChange={(v) => onChange({ ...value, gxp: v })}
      />
    </div>
  );
}

function SelectChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value?: string
  options: string[]
  onChange: (next: string | undefined) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={{
        fontSize: 11,
        padding: '4px 8px',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 'var(--border-radius-md)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        fontFamily: 'inherit',
      }}
    >
      <option value="">{label}{t(': any', ': any')}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {label}: {opt.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
