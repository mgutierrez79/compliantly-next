'use client'
// Inventory / asset registry.
//
// Renders the per-tenant inventory that the connector poll loop
// populates (auto-import in compliantly-go 574ab0c). One row per
// discovered asset — firewalls, hypervisors, storage arrays, CMDB
// records — keyed by `asset_id` and tagged with the source connector
// via `external_refs[]`. The table is read-first; structural changes
// flow from upstream connectors, not from manual edits in this UI,
// which keeps the compliance audit trail intact.
//
// Backend API:
//   GET  /v1/inventory/assets
//   POST /v1/inventory/import  body: { refresh, overwrite, source? }
//
// What's intentionally NOT here (live in /apps and /sites instead):
//   - Application-aware grouping (apps page owns that)
//   - Site-level cascade analysis (sites page owns that)
//   - Per-row CRUD form — the connector is the source of truth;
//     letting the operator hand-edit asset_type/criticality would
//     drift from upstream and confuse the auditor

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  PrimaryButton,
  Skeleton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n'

type InventoryExternalRef = { source: string; external_id: string }

type InventoryAsset = {
  asset_id: string
  name?: string | null
  owner?: string | null
  business_unit?: string | null
  asset_type?: string | null
  criticality?: string | null
  datacenter_id?: string | null
  application_id?: string | null
  access_tier?: string | null
  framework_evaluation_enabled?: boolean
  tags?: string[]
  external_refs?: InventoryExternalRef[]
  metadata?: Record<string, unknown>
}

const CRITICALITY_TONE: Record<string, 'red' | 'amber' | 'green' | 'gray'> = {
  critical: 'red',
  high: 'amber',
  medium: 'amber',
  low: 'green',
}

export function InventoryPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [assets, setAssets] = useState<InventoryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // URL drives the filter so a sidebar link like
  // /inventory?asset_type=firewall lands on the right slice without
  // any in-page UI gymnastics.
  const assetTypeFilter = (searchParams?.get('asset_type') ?? '').toLowerCase()
  const sourceFilter = (searchParams?.get('source') ?? '').toLowerCase()
  const criticalityFilter = (searchParams?.get('criticality') ?? '').toLowerCase()
  const search = (searchParams?.get('q') ?? '').toLowerCase()

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const response = await apiFetch('/inventory/assets')
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.detail || body?.error || `${response.status} ${response.statusText}`)
      }
      const body = await response.json()
      const items: InventoryAsset[] = Array.isArray(body?.items) ? body.items : []
      setAssets(items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function refreshFromConnectors() {
    setImporting(true)
    setError(null)
    setInfo(null)
    try {
      const response = await apiFetch('/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: true, overwrite: false }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.detail || body?.error || `${response.status} ${response.statusText}`)
      }
      const imported = body?.imported ?? 0
      const updated = body?.updated ?? 0
      const skipped = body?.skipped ?? 0
      setInfo(
        t(
          '{imported} new, {updated} updated, {skipped} unchanged.',
          '{imported} new, {updated} updated, {skipped} unchanged.',
          { imported, updated, skipped },
        ),
      )
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh inventory')
    } finally {
      setImporting(false)
    }
  }

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const asset of assets) {
      for (const ref of asset.external_refs ?? []) {
        if (ref.source) set.add(ref.source.split(':')[0])
      }
    }
    return Array.from(set).sort()
  }, [assets])

  const assetTypes = useMemo(() => {
    const set = new Set<string>()
    for (const asset of assets) {
      const value = String(asset.asset_type ?? '').trim().toLowerCase()
      if (value) set.add(value)
    }
    return Array.from(set).sort()
  }, [assets])

  const filtered = useMemo(() => {
    return assets.filter((asset) => {
      if (assetTypeFilter && String(asset.asset_type ?? '').toLowerCase() !== assetTypeFilter) return false
      if (criticalityFilter && String(asset.criticality ?? '').toLowerCase() !== criticalityFilter) return false
      if (sourceFilter) {
        const refs = (asset.external_refs ?? []).map((r) => r.source.toLowerCase().split(':')[0])
        if (!refs.includes(sourceFilter)) return false
      }
      if (search) {
        const haystack = [
          asset.asset_id,
          asset.name,
          asset.asset_type,
          asset.owner,
          asset.business_unit,
          asset.datacenter_id,
          asset.application_id,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .join(' ')
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [assets, assetTypeFilter, sourceFilter, criticalityFilter, search])

  const counts = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const asset of assets) {
      const key = String(asset.asset_type ?? 'unknown').toLowerCase()
      byType[key] = (byType[key] ?? 0) + 1
    }
    return byType
  }, [assets])

  function pushFilter(key: 'asset_type' | 'source' | 'criticality', value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `/inventory?${qs}` : '/inventory')
  }

  function pushSearch(value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (value) params.set('q', value)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `/inventory?${qs}` : '/inventory')
  }

  return (
    <>
      <Topbar
        title={t('Inventory', 'Inventory')}
        left={
          <Badge tone="navy">
            {t('{count} assets', '{count} assets', { count: assets.length })}
          </Badge>
        }
        right={
          <>
            <FilterBar
              assetTypeFilter={assetTypeFilter}
              criticalityFilter={criticalityFilter}
              sourceFilter={sourceFilter}
              search={search}
              assetTypes={assetTypes}
              sources={sources}
              onAssetType={(v) => pushFilter('asset_type', v)}
              onCriticality={(v) => pushFilter('criticality', v)}
              onSource={(v) => pushFilter('source', v)}
              onSearch={pushSearch}
            />
            <PrimaryButton onClick={refreshFromConnectors} disabled={importing}>
              {importing ? (
                <>
                  <i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'attestiv-spin 1s linear infinite' }} />
                  {t('Refreshing…', 'Refreshing…')}
                </>
              ) : (
                <>
                  <i className="ti ti-refresh" aria-hidden="true" />
                  {t('Refresh from connectors', 'Refresh from connectors')}
                </>
              )}
            </PrimaryButton>
          </>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {info ? <Banner tone="success">{info}</Banner> : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <SummaryTile label={t('Total assets', 'Total assets')} value={assets.length} active={!assetTypeFilter} onClick={() => pushFilter('asset_type', '')} />
          {Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([type, count]) => (
              <SummaryTile
                key={type}
                label={formatAssetTypeLabel(type)}
                value={count}
                active={assetTypeFilter === type}
                onClick={() => pushFilter('asset_type', assetTypeFilter === type ? '' : type)}
              />
            ))}
        </div>

        <Card>
          <CardTitle
            right={
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {t('{count} shown', '{count} shown', { count: filtered.length })}
              </span>
            }
          >
            {t('Asset registry', 'Asset registry')}
          </CardTitle>
          {loading ? (
            <Skeleton lines={6} height={36} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="ti-database-off"
              title={
                assets.length === 0
                  ? t('No assets in inventory yet', 'No assets in inventory yet')
                  : t('No matches', 'No matches')
              }
              description={
                assets.length === 0
                  ? t(
                      'Assets appear here automatically after each connector poll. Click "Refresh from connectors" to pull immediately, or wait for the next 5-minute cycle.',
                      'Assets appear here automatically after each connector poll. Click "Refresh from connectors" to pull immediately, or wait for the next 5-minute cycle.',
                    )
                  : t(
                      'No assets match the current filters. Clear them to see the full inventory.',
                      'No assets match the current filters. Clear them to see the full inventory.',
                    )
              }
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
                  <th style={{ padding: '6px 10px 6px 0' }}>{t('Asset', 'Asset')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Type', 'Type')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Criticality', 'Criticality')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Source', 'Source')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Datacenter', 'Datacenter')}</th>
                  <th style={{ padding: '6px 0 6px 10px' }}>{t('Tags', 'Tags')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset) => (
                  <AssetRow key={asset.asset_id} asset={asset} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}

function AssetRow({ asset }: { asset: InventoryAsset }) {
  const displayName = (asset.name && asset.name.trim()) || asset.asset_id
  const assetType = String(asset.asset_type ?? '').toLowerCase()
  const criticality = String(asset.criticality ?? '').toLowerCase()
  const sources = (asset.external_refs ?? []).map((ref) => ref.source).filter(Boolean)
  const tags = asset.tags ?? []
  return (
    <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <td style={{ padding: '10px 10px 10px 0' }}>
        <div style={{ fontWeight: 500 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {asset.asset_id}
        </div>
      </td>
      <td style={{ padding: '10px' }}>
        {assetType ? <Badge tone="navy">{formatAssetTypeLabel(assetType)}</Badge> : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
      </td>
      <td style={{ padding: '10px' }}>
        {criticality ? (
          <Badge tone={CRITICALITY_TONE[criticality] ?? 'gray'}>{criticality}</Badge>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        )}
      </td>
      <td style={{ padding: '10px' }}>
        {sources.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {sources.slice(0, 2).map((src) => (
              <span
                key={src}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: 'var(--color-background-secondary)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontFamily: 'var(--font-mono)',
                }}
                title={src}
              >
                {src.split(':')[0]}
              </span>
            ))}
            {sources.length > 2 ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>+{sources.length - 2}</span>
            ) : null}
          </span>
        )}
      </td>
      <td style={{ padding: '10px', color: 'var(--color-text-secondary)', fontSize: 11 }}>
        {asset.datacenter_id || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
      </td>
      <td style={{ padding: '10px 0 10px 10px' }}>
        {tags.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: 'var(--color-background-tertiary)',
                  borderRadius: 'var(--border-radius-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>+{tags.length - 3}</span>
            ) : null}
          </span>
        )}
      </td>
    </tr>
  )
}

function SummaryTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-md)',
        background: active ? 'var(--color-status-blue-bg)' : 'var(--color-background-primary)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>{value}</div>
    </button>
  )
}

function FilterBar({
  assetTypeFilter,
  criticalityFilter,
  sourceFilter,
  search,
  assetTypes,
  sources,
  onAssetType,
  onCriticality,
  onSource,
  onSearch,
}: {
  assetTypeFilter: string
  criticalityFilter: string
  sourceFilter: string
  search: string
  assetTypes: string[]
  sources: string[]
  onAssetType: (v: string) => void
  onCriticality: (v: string) => void
  onSource: (v: string) => void
  onSearch: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
      <input
        type="search"
        value={search}
        placeholder={t('Search…', 'Search…')}
        onChange={(e) => onSearch(e.target.value)}
        style={{
          fontSize: 11,
          padding: '4px 8px',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          fontFamily: 'inherit',
          width: 160,
        }}
      />
      <SelectChip label={t('Type', 'Type')} value={assetTypeFilter} options={assetTypes} onChange={onAssetType} />
      <SelectChip
        label={t('Criticality', 'Criticality')}
        value={criticalityFilter}
        options={['critical', 'high', 'medium', 'low']}
        onChange={onCriticality}
      />
      <SelectChip label={t('Source', 'Source')} value={sourceFilter} options={sources} onChange={onSource} />
    </div>
  )
}

function SelectChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (next: string) => void
}) {
  const { t } = useI18n()
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
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
          {label}: {formatAssetTypeLabel(opt)}
        </option>
      ))}
    </select>
  )
}

function formatAssetTypeLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
