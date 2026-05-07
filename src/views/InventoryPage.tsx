'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, DangerButton, ErrorBox, HelpTip, Input, Label, PageTitle } from '../components/Ui'

type ConnectorConfigResponse = { available: string[]; enabled: string[] }
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
  tags: string[]
  external_refs: InventoryExternalRef[]
  metadata: Record<string, unknown>
}
type AssetOption = { value: string; label: string }
type InventoryAssetsResponse = { items: InventoryAsset[]; count: number }
type InventoryImportResponse = { imported: number; updated: number; skipped: number }

type InventoryDraft = {
  asset_id: string
  name: string
  owner: string
  business_unit: string
  asset_type: string
  criticality: string
  datacenter_id: string
  application_id: string
  access_tier: string
  framework_evaluation_enabled: boolean
  tags: string
  external_refs: InventoryExternalRef[]
}

const EMPTY_DRAFT: InventoryDraft = {
  asset_id: '',
  name: '',
  owner: '',
  business_unit: '',
  asset_type: '',
  criticality: '',
  datacenter_id: '',
  application_id: '',
  access_tier: '',
  framework_evaluation_enabled: true,
  tags: '',
  external_refs: [],
}

const ASSET_TYPE_VALUES = [
  'application',
  'datacenter',
  'service',
  'network_device',
  'firewall',
  'server',
  'host',
  'vm',
  'cluster',
  'storage',
  'storage_array',
  'storage_volume',
  'storage_host',
  'backup_appliance',
  'repository',
  'computer',
  'device',
  'network',
  'ec2',
  'other',
  'unknown',
]

const formatAssetTypeLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const readFrameworkEvaluationEnabled = (asset: InventoryAsset): boolean => {
  if (typeof asset.framework_evaluation_enabled === 'boolean') {
    return asset.framework_evaluation_enabled
  }
  const value = asset.metadata?.framework_evaluation_enabled
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }
  }
  return true
}

export function InventoryPage() {
  const ASSET_FETCH_STEP = 200
  const [assets, setAssets] = useState<InventoryAsset[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [configError, setConfigError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<InventoryDraft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<string>('')
  const [importRefresh, setImportRefresh] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [connectorConfig, setConnectorConfig] = useState<ConnectorConfigResponse | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filters, setFilters] = useState({
    asset_id: '',
    name: '',
    asset_type: '',
    criticality: '',
    datacenter_id: '',
    application_id: '',
    access_tier: '',
    source: '',
  })
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const [sortKey, setSortKey] = useState<'asset_id' | 'name' | 'asset_type' | 'criticality'>('asset_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(30)
  const [pageIndex, setPageIndex] = useState(1)
  const [assetFetchLimit, setAssetFetchLimit] = useState(ASSET_FETCH_STEP)
  const [assetTotal, setAssetTotal] = useState<number | null>(null)

  const assetTypeOptions = useMemo<AssetOption[]>(() => {
    const normalizedDraft = draft.asset_type.trim().toLowerCase()
    const base = ASSET_TYPE_VALUES.map((value) => ({
      value,
      label: formatAssetTypeLabel(value),
    }))
    if (normalizedDraft && !base.some((item) => item.value === normalizedDraft)) {
      base.unshift({
        value: normalizedDraft,
        label: `${draft.asset_type} (custom)`,
      })
    }
    return base
  }, [draft.asset_type])

  const datacenterOptions = useMemo<AssetOption[]>(() => {
    const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase()
    const datacenterTypes = new Set(['datacenter', 'data_center', 'data-center', 'dc', 'site'])
    const options = assets
      .filter((asset) => {
        const assetType = normalize(asset.asset_type)
        if (datacenterTypes.has(assetType)) return true
        return (asset.tags ?? []).some((tag) => normalize(tag).includes('datacenter'))
      })
      .map((asset) => ({
        value: asset.asset_id,
        label: asset.name ? `${asset.name} (${asset.asset_id})` : asset.asset_id,
      }))
    const unique = Array.from(new Map(options.map((item) => [item.value, item])).values())
    unique.sort((a, b) => a.label.localeCompare(b.label))
    if (draft.datacenter_id && !unique.some((item) => item.value === draft.datacenter_id)) {
      unique.unshift({ value: draft.datacenter_id, label: `${draft.datacenter_id} (custom)` })
    }
    return unique
  }, [assets, draft.datacenter_id])

  const applicationOptions = useMemo<AssetOption[]>(() => {
    const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase()
    const applicationTypes = new Set([
      'application',
      'app',
      'service',
      'business_service',
      'business-service',
      'business service',
    ])
    const options = assets
      .filter((asset) => {
        const assetType = normalize(asset.asset_type)
        if (applicationTypes.has(assetType)) return true
        return (asset.tags ?? []).some((tag) => normalize(tag).includes('application'))
      })
      .map((asset) => ({
        value: asset.asset_id,
        label: asset.name ? `${asset.name} (${asset.asset_id})` : asset.asset_id,
      }))
    const unique = Array.from(new Map(options.map((item) => [item.value, item])).values())
    unique.sort((a, b) => a.label.localeCompare(b.label))
    if (draft.application_id && !unique.some((item) => item.value === draft.application_id)) {
      unique.unshift({ value: draft.application_id, label: `${draft.application_id} (custom)` })
    }
    return unique
  }, [assets, draft.application_id])

  const sourceOptions = useMemo(() => {
    const enabled = connectorConfig?.enabled ?? []
    const base = enabled.map((item) => item.split(':')[0])
    const unique = Array.from(new Set([...base, 'service_now', 'glpi'])).filter(Boolean)
    return unique.sort()
  }, [connectorConfig])

  const filteredAssets = useMemo(() => {
    const normalize = (value: unknown) => String(value ?? '').toLowerCase()
    const filtered = assets.filter((asset) => {
      if (filters.asset_id && !normalize(asset.asset_id).includes(filters.asset_id.toLowerCase())) return false
      if (filters.name && !normalize(asset.name).includes(filters.name.toLowerCase())) return false
      if (filters.asset_type && !normalize(asset.asset_type).includes(filters.asset_type.toLowerCase())) return false
      if (filters.criticality && !normalize(asset.criticality).includes(filters.criticality.toLowerCase()))
        return false
      if (filters.datacenter_id && !normalize(asset.datacenter_id).includes(filters.datacenter_id.toLowerCase()))
        return false
      if (filters.application_id && !normalize(asset.application_id).includes(filters.application_id.toLowerCase()))
        return false
      if (filters.access_tier && !normalize(asset.access_tier).includes(filters.access_tier.toLowerCase()))
        return false
      if (filters.source) {
        const sources = (asset.external_refs ?? []).map((ref) => ref.source).join(' ')
        if (!normalize(sources).includes(filters.source.toLowerCase())) return false
      }
      return true
    })
    const direction = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const aValue = String(a[sortKey] ?? '').toLowerCase()
      const bValue = String(b[sortKey] ?? '').toLowerCase()
      return aValue.localeCompare(bValue) * direction
    })
  }, [assets, filters, sortDir, sortKey])

  const pageCount = Math.max(1, Math.ceil(filteredAssets.length / pageSize))
  const pagedAssets = useMemo(() => {
    const start = (pageIndex - 1) * pageSize
    return filteredAssets.slice(start, start + pageSize)
  }, [filteredAssets, pageIndex, pageSize])

  const pageAssetIds = useMemo(() => pagedAssets.map((asset) => asset.asset_id), [pagedAssets])
  const pageSelectedCount = useMemo(
    () => pageAssetIds.filter((id) => selectedAssetIds.includes(id)).length,
    [pageAssetIds, selectedAssetIds],
  )
  const allPageSelected = pageAssetIds.length > 0 && pageSelectedCount === pageAssetIds.length
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected
    }
  }, [somePageSelected])

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        pageAssetIds.forEach((id) => next.add(id))
      } else {
        pageAssetIds.forEach((id) => next.delete(id))
      }
      return Array.from(next)
    })
  }

  const toggleSelectAsset = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    )
  }

  const sortLabel = (key: typeof sortKey) => (sortKey === key ? (sortDir === 'asc' ? ' (asc)' : ' (desc)') : '')

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, pageCount))
  }, [pageCount])

  useEffect(() => {
    if (!assets.length) {
      setSelectedAssetIds([])
      return
    }
    setSelectedAssetIds((prev) => prev.filter((id) => assets.some((asset) => asset.asset_id === id)))
  }, [assets])

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiJson<InventoryAssetsResponse>(`/inventory/assets?limit=${assetFetchLimit}`)
      setAssets(result.items ?? [])
      setAssetTotal(result.count ?? null)
      if (result.count && result.count > assetFetchLimit) {
        setAssetFetchLimit(result.count)
      }
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }, [assetFetchLimit])

  const loadConnectorConfig = useCallback(async () => {
    setConfigError(null)
    try {
      const result = await apiJson<ConnectorConfigResponse>('/config/connectors')
      setConnectorConfig(result)
    } catch (err) {
      setConfigError(err as ApiError)
    }
  }, [])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    void loadConnectorConfig()
  }, [loadConnectorConfig])

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT)
    setEditingId(null)
    setShowForm(false)
  }

  const editAsset = (asset: InventoryAsset) => {
    setDraft({
      asset_id: asset.asset_id,
      name: asset.name ?? '',
      owner: asset.owner ?? '',
      business_unit: asset.business_unit ?? '',
      asset_type: String(asset.asset_type ?? '').toLowerCase(),
      criticality: asset.criticality ?? '',
      datacenter_id: asset.datacenter_id ?? '',
      application_id: asset.application_id ?? '',
      access_tier: asset.access_tier ?? '',
      framework_evaluation_enabled: readFrameworkEvaluationEnabled(asset),
      tags: (asset.tags ?? []).join(', '),
      external_refs: asset.external_refs ?? [],
    })
    setEditingId(asset.asset_id)
    setShowForm(true)
    setMessage(null)
  }

  const addExternalRef = () => {
    setDraft((prev) => ({
      ...prev,
      external_refs: [...prev.external_refs, { source: '', external_id: '' }],
    }))
  }

  const updateExternalRef = (index: number, patch: Partial<InventoryExternalRef>) => {
    setDraft((prev) => ({
      ...prev,
      external_refs: prev.external_refs.map((ref, idx) => (idx === index ? { ...ref, ...patch } : ref)),
    }))
  }

  const removeExternalRef = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      external_refs: prev.external_refs.filter((_, idx) => idx !== index),
    }))
  }

  const saveAsset = async () => {
    if (!draft.asset_id.trim()) {
      setMessage('Asset ID is required.')
      return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      asset_id: draft.asset_id.trim(),
      name: draft.name.trim() || null,
      owner: draft.owner.trim() || null,
      business_unit: draft.business_unit.trim() || null,
      asset_type: draft.asset_type.trim().toLowerCase() || null,
      criticality: draft.criticality.trim() || null,
      datacenter_id: draft.datacenter_id.trim() || null,
      application_id: draft.application_id.trim() || null,
      access_tier: draft.access_tier.trim() || null,
      framework_evaluation_enabled: draft.framework_evaluation_enabled,
      tags: draft.tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      external_refs: draft.external_refs
        .map((ref) => ({
          source: ref.source.trim(),
          external_id: ref.external_id.trim(),
        }))
        .filter((ref) => ref.source && ref.external_id),
    }
    try {
      if (editingId) {
        await apiFetch(`/inventory/assets/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch('/inventory/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      await loadAssets()
      setPageIndex(1)
      resetDraft()
      setMessage('Inventory asset saved.')
    } catch (err) {
      setMessage((err as ApiError)?.message || 'Failed to save inventory asset.')
    } finally {
      setSaving(false)
    }
  }

  const deleteSelectedAssets = async () => {
    if (!selectedAssetIds.length) return
    if (
      !window.confirm(
        `Delete ${selectedAssetIds.length} inventory asset(s)? This cannot be undone.`,
      )
    )
      return
    setSaving(true)
    setMessage(null)
    try {
      const results = await Promise.allSettled(
        selectedAssetIds.map((assetId) =>
          apiFetch(`/inventory/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
        ),
      )
      const failures = results.filter((result) => result.status === 'rejected')
      await loadAssets()
      setSelectedAssetIds([])
      if (failures.length) {
        setMessage(`Deleted ${selectedAssetIds.length - failures.length}; ${failures.length} failed.`)
      } else {
        setMessage(`Deleted ${selectedAssetIds.length} assets.`)
      }
    } catch (err) {
      setMessage((err as ApiError)?.message || 'Failed to delete selected assets.')
    } finally {
      setSaving(false)
    }
  }

  const updateFrameworkEvaluationForAssets = async (
    assetIds: string[],
    enabled: boolean,
    scopeLabel: string,
  ) => {
    if (!assetIds.length) return
    const actionLabel = enabled ? 'enable' : 'disable'
    if (!window.confirm(`${actionLabel} framework evaluation for ${assetIds.length} ${scopeLabel} asset(s)?`)) {
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const results = await Promise.allSettled(
        assetIds.map((assetId) =>
          apiFetch(`/inventory/assets/${encodeURIComponent(assetId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ framework_evaluation_enabled: enabled }),
          }),
        ),
      )
      const failedIds = results
        .map((result, index) => (result.status === 'rejected' ? assetIds[index] : null))
        .filter((assetId): assetId is string => Boolean(assetId))
      const failures = failedIds.length
      await loadAssets()
      if (scopeLabel === 'selected') {
        setSelectedAssetIds(failedIds)
      }
      const successCount = assetIds.length - failures
      if (failures) {
        setMessage(`${successCount} updated; ${failures} failed.`)
      } else {
        setMessage(`${successCount} assets updated.`)
      }
    } catch (err) {
      setMessage((err as ApiError)?.message || 'Failed to update framework evaluation in bulk.')
    } finally {
      setSaving(false)
    }
  }

  const enableFrameworkEvaluationSelected = async () =>
    updateFrameworkEvaluationForAssets(selectedAssetIds, true, 'selected')

  const disableFrameworkEvaluationSelected = async () =>
    updateFrameworkEvaluationForAssets(selectedAssetIds, false, 'selected')

  const selectFilteredAssets = () => {
    setSelectedAssetIds(filteredAssets.map((asset) => asset.asset_id))
  }

  const runImport = async () => {
    setImportMessage(null)
    try {
      const response = await apiFetch('/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: importSource.trim() || null,
          refresh: importRefresh,
          overwrite: importOverwrite,
        }),
      })
      const result = (await response.json()) as InventoryImportResponse
      setImportMessage(`Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.`)
      await loadAssets()
    } catch (err) {
      setImportMessage((err as ApiError)?.message || 'Import failed.')
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle>Inventory</PageTitle>
      {error ? <ErrorBox title="Inventory error" detail={error.message} /> : null}
      {configError ? <ErrorBox title="Inventory config error" detail={configError.message} /> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Inventory import</Label>
            <p className="text-sm text-slate-50">
              Pull assets from connector snapshots (ServiceNow, GLPI, Palo Alto, etc.) into the inventory register.
            </p>
          </div>
          <HelpTip text={'Import reads the connector snapshot and creates inventory assets. Use overwrite to refresh existing entries.'} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Source (optional)</Label>
            <select
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
              value={importSource}
              onChange={(event) => setImportSource(event.target.value)}
            >
              <option value="">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Refresh connectors</Label>
            <label className="flex items-center gap-2 text-sm text-slate-50">
              <input
                type="checkbox"
                checked={importRefresh}
                onChange={(event) => setImportRefresh(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Force refresh before import
            </label>
          </div>
          <div className="space-y-2">
            <Label>Overwrite</Label>
            <label className="flex items-center gap-2 text-sm text-slate-50">
              <input
                type="checkbox"
                checked={importOverwrite}
                onChange={(event) => setImportOverwrite(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Update existing assets
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={runImport}>Import assets</Button>
          {importMessage ? <span className="text-sm text-slate-50">{importMessage}</span> : null}
        </div>
      </Card>

      {showForm ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>{editingId ? `Edit asset ${editingId}` : 'Add inventory asset'}</Label>
            <div className="flex items-center gap-2">
              {editingId ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setDraft(EMPTY_DRAFT)
                    setEditingId(null)
                    setMessage(null)
                  }}
                >
                  New asset
                </Button>
              ) : null}
              <Button size="sm" onClick={resetDraft}>Close</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Asset ID</Label>
              <Input
                value={draft.asset_id}
                onChange={(event) => setDraft({ ...draft, asset_id: event.target.value })}
                placeholder="asset-001"
                disabled={Boolean(editingId)}
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Business unit</Label>
              <Input
                value={draft.business_unit}
                onChange={(event) => setDraft({ ...draft, business_unit: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Asset type</Label>
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
                value={draft.asset_type}
                onChange={(event) => setDraft({ ...draft, asset_type: event.target.value })}
              >
                <option value="">Select asset type</option>
                {assetTypeOptions.map((option) => (
                  <option key={`type-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Criticality</Label>
              <Input
                value={draft.criticality}
                onChange={(event) => setDraft({ ...draft, criticality: event.target.value })}
                placeholder="low, medium, high"
              />
            </div>
            <div className="space-y-2">
              <Label>Framework evaluation</Label>
              <label className="flex items-center gap-2 text-sm text-slate-50">
                <input
                  type="checkbox"
                  checked={draft.framework_evaluation_enabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      framework_evaluation_enabled: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Include this asset in framework evaluation
              </label>
            </div>
            <div className="space-y-2">
              <Label>Datacenter</Label>
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
                value={draft.datacenter_id}
                onChange={(event) => setDraft({ ...draft, datacenter_id: event.target.value })}
              >
                <option value="">Select datacenter asset</option>
                {!datacenterOptions.length ? (
                  <option value="" disabled>
                    No datacenter assets available
                  </option>
                ) : null}
                {datacenterOptions.map((option) => (
                  <option key={`dc-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Application</Label>
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
                value={draft.application_id}
                onChange={(event) => setDraft({ ...draft, application_id: event.target.value })}
              >
                <option value="">Select application asset</option>
                {!applicationOptions.length ? (
                  <option value="" disabled>
                    No application assets available
                  </option>
                ) : null}
                {applicationOptions.map((option) => (
                  <option key={`app-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Access tier</Label>
              <Input
                value={draft.access_tier}
                onChange={(event) => setDraft({ ...draft, access_tier: event.target.value })}
                placeholder="tier-1"
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input
                value={draft.tags}
                onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                placeholder="comma-separated tags"
              />
            </div>
            <div className="md:col-span-2">
              <Label>External references</Label>
              <div className="mt-2 space-y-2">
                {draft.external_refs.length ? (
                  <div className="space-y-2">
                    {draft.external_refs.map((ref, index) => (
                      <div key={`${ref.source}-${ref.external_id}-${index}`} className="grid gap-2 md:grid-cols-3">
                        <Input
                          value={ref.source}
                          onChange={(event) => updateExternalRef(index, { source: event.target.value })}
                          placeholder="source"
                        />
                        <Input
                          value={ref.external_id}
                          onChange={(event) => updateExternalRef(index, { external_id: event.target.value })}
                          placeholder="external id"
                        />
                        <Button
                          size="sm"
                          onClick={() => removeExternalRef(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">No external references yet.</div>
                )}
                <Button
                  size="sm"
                  onClick={addExternalRef}
                >
                  Add external reference
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-50">{message}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={saveAsset} disabled={saving}>
                {saving ? 'Saving...' : 'Save asset'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>Inventory register</Label>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-50">
            <span>
              {loading
                ? 'Loading...'
                : assetTotal !== null
                  ? `${assets.length} of ${assetTotal} loaded`
                  : `${filteredAssets.length} assets`}
            </span>
            <Button size="sm" disabled={!filteredAssets.length || saving} onClick={selectFilteredAssets}>
              Select filtered ({filteredAssets.length})
            </Button>
            <Button
              size="sm"
              disabled={!selectedAssetIds.length || saving}
              onClick={() => void enableFrameworkEvaluationSelected()}
            >
              Enable eval selected{selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
            </Button>
            <Button
              size="sm"
              disabled={!selectedAssetIds.length || saving}
              onClick={() => void disableFrameworkEvaluationSelected()}
            >
              Disable eval selected{selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
            </Button>
            <DangerButton size="sm" disabled={!selectedAssetIds.length} onClick={deleteSelectedAssets}>
              Delete selected{selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
            </DangerButton>
            <Button
              size="sm"
              onClick={() => {
                setDraft(EMPTY_DRAFT)
                setEditingId(null)
                setShowForm(true)
                setMessage(null)
              }}
            >
              Add asset
            </Button>
            <label className="flex items-center gap-2">
              <span>Rows</span>
              <select
                className="rounded-md border border-[#274266] bg-[#0d1a2b] px-2 py-1 text-xs text-slate-50"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPageIndex(1)
                }}
              >
                {[10, 20, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-50">
          <span>
            Page {pageIndex} of {pageCount}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setPageIndex(1)} disabled={pageIndex <= 1}>
              First
            </Button>
            <Button size="sm" onClick={() => setPageIndex((prev) => Math.max(1, prev - 1))} disabled={pageIndex <= 1}>
              Prev
            </Button>
            {Array.from({ length: pageCount }).map((_, idx) => {
              const page = idx + 1
              const isActive = page === pageIndex
              return (
                <button
                  key={`inventory-page-${page}`}
                  type="button"
                  onClick={() => setPageIndex(page)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                      : 'border-[#274266] bg-[#0d1a2b] text-slate-50'
                  }`}
                >
                  {page}
                </button>
              )
            })}
            <Button
              size="sm"
              onClick={() => setPageIndex((prev) => Math.min(pageCount, prev + 1))}
              disabled={pageIndex >= pageCount}
            >
              Next
            </Button>
            <Button size="sm" onClick={() => setPageIndex(pageCount)} disabled={pageIndex >= pageCount}>
              Last
            </Button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-50">
              <tr>
                <th className="py-2 pr-4">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(event) => toggleSelectAllPage(event.target.checked)}
                    aria-label="Select all assets on page"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                  />
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('asset_id')}>
                    Asset ID{sortLabel('asset_id')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('name')}>
                    Name{sortLabel('name')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('asset_type')}>
                    Type{sortLabel('asset_type')}
                  </button>
                </th>
                <th className="py-2 pr-4">
                  <button type="button" className="text-left" onClick={() => toggleSort('criticality')}>
                    Criticality{sortLabel('criticality')}
                  </button>
                </th>
                <th className="py-2 pr-4">Datacenter</th>
                <th className="py-2 pr-4">Application</th>
                <th className="py-2 pr-4">Access tier</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4">Sources</th>
                <th className="py-2 pr-4">Framework eval</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
              <tr className="text-slate-50">
                <th className="pb-2 pr-4" />
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.asset_id}
                    onChange={(event) => setFilters({ ...filters, asset_id: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by asset id"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.name}
                    onChange={(event) => setFilters({ ...filters, name: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by name"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.asset_type}
                    onChange={(event) => setFilters({ ...filters, asset_type: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by asset type"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.criticality}
                    onChange={(event) => setFilters({ ...filters, criticality: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by criticality"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.datacenter_id}
                    onChange={(event) => setFilters({ ...filters, datacenter_id: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by datacenter"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.application_id}
                    onChange={(event) => setFilters({ ...filters, application_id: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by application"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.access_tier}
                    onChange={(event) => setFilters({ ...filters, access_tier: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by access tier"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4" />
                <th className="pb-2 pr-4">
                  <Input
                    value={filters.source}
                    onChange={(event) => setFilters({ ...filters, source: event.target.value })}
                    placeholder="Filter"
                    aria-label="Filter by source"
                    className="text-xs"
                  />
                </th>
                <th className="pb-2 pr-4" />
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f365a]">
              {pagedAssets.map((asset) => (
                <tr key={asset.asset_id} className="text-slate-50">
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.includes(asset.asset_id)}
                      onChange={() => toggleSelectAsset(asset.asset_id)}
                      aria-label={`Select asset ${asset.asset_id}`}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                    />
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{asset.asset_id}</td>
                  <td className="py-2 pr-4">{asset.name ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.asset_type ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.criticality ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.datacenter_id ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.application_id ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.access_tier ?? '-'}</td>
                  <td className="py-2 pr-4">{asset.owner ?? '-'}</td>
                  <td className="py-2 pr-4 text-xs text-slate-200/80">
                    {(asset.external_refs ?? []).map((ref) => ref.source).join(', ') || '-'}
                  </td>
                  <td className="py-2 pr-4">
                    {readFrameworkEvaluationEnabled(asset) ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">Enabled</span>
                    ) : (
                      <span className="rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-200">Disabled</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => editAsset(asset)}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredAssets.length ? (
                <tr>
                  <td className="py-4 text-sm text-slate-50" colSpan={12}>
                    No inventory assets yet.
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
