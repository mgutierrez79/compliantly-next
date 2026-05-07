'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, ErrorBox, HelpTip, Label, PageTitle, Textarea } from '../components/Ui'
import { ApiError, apiJson } from '../lib/api'

type FrameworksResponse = {
  available: string[]
  frameworks: Array<{ key: string; name?: string; version?: string }>
  enabled: string[]
  configured: string[]
  all_enabled: boolean
  source?: string | null
}

type FrameworkMetricsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  resilience_policy_version?: string | null
  metrics_policy_version?: string | null
  controls_policy_version?: string | null
  controls_summary?: {
    compliant: number
    partially_compliant: number
    non_compliant: number
    unknown: number
    total: number
  }
}

type DoraOperationalMetricsResponse = {
  deployments?: { count?: number }
  restore_time_hours?: Record<string, number>
}

type Nis2OperationalMetricsResponse = {
  policy_version?: string | null
  incidents?: { significant_count?: number; mttr_hours?: Record<string, number> }
  security?: { high_or_critical_count?: number }
  recovery?: { restore_jobs?: number }
}

type IsoOperationalMetricsResponse = {
  policy_version?: string | null
  incidents?: { significant_count?: number }
  security?: { high_or_critical_count?: number }
  recovery?: { restore_jobs?: number }
}

type Soc2OperationalMetricsResponse = {
  policy_version?: string | null
  availability?: { incident_count?: number; restore_time_hours?: Record<string, number> }
  security?: { high_or_critical_count?: number }
  recovery?: { restore_jobs?: number }
}

type GxpOperationalMetricsResponse = {
  policy_version?: string | null
  backup?: { success_rate_percent?: number; failed?: number }
  restore?: { jobs?: number; job_duration_hours?: Record<string, number> }
  incidents?: { failure_signal_count?: number; change_failure_rate_percent?: number }
}

type ControlLibraryEntry = {
  framework: string
  control_id: string
  description?: string | null
  references?: string[]
  evidence_types?: string[]
  tags?: string[]
}

type ControlLibraryResponse = {
  items: ControlLibraryEntry[]
}

type FrameworksRequest = {
  enabled_frameworks: string[]
  scope: 'tenant' | 'system'
  all_enabled: boolean
}

type PolicyVariant = 'framework' | 'controls' | 'metrics' | 'operational-metrics' | 'resilience-playbook'

type PolicyRawResponse = {
  key: string
  variant: string
  path: string
  source_hash: string
  content: string
}

export function FrameworksPage() {
  const [frameworks, setFrameworks] = useState<string[]>([])
  const [frameworkMeta, setFrameworkMeta] = useState<Array<{ key: string; name?: string; version?: string }>>([])
  const [latestMetrics, setLatestMetrics] = useState<Record<string, FrameworkMetricsResponse>>({})
  const [latestOperational, setLatestOperational] = useState<Record<string, string>>({})
  const [controlLibrary, setControlLibrary] = useState<ControlLibraryEntry[]>([])
  const [controlLibraryError, setControlLibraryError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [useAll, setUseAll] = useState(true)
  const [source, setSource] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantHint, setTenantHint] = useState<string | null>(null)
  const [authHint, setAuthHint] = useState<string | null>(null)
  const [dbHint, setDbHint] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailTabs, setDetailTabs] = useState<Record<string, 'references' | 'yaml'>>({})
  const [policyVariant, setPolicyVariant] = useState<Record<string, PolicyVariant>>({})
  const [policyRaw, setPolicyRaw] = useState<Record<string, Partial<Record<PolicyVariant, PolicyRawResponse>>>>({})
  const [policyError, setPolicyError] = useState<Record<string, Partial<Record<PolicyVariant, string>>>>({})
  const [policyLoading, setPolicyLoading] = useState<Record<string, Partial<Record<PolicyVariant, boolean>>>>({})
  const [policyDraft, setPolicyDraft] = useState<Record<string, Partial<Record<PolicyVariant, string>>>>({})
  const [policySaving, setPolicySaving] = useState<Record<string, Partial<Record<PolicyVariant, boolean>>>>({})

  function formatApiError(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      const apiErr = err as ApiError
      const body = apiErr.bodyText || ''
      try {
        const parsed = JSON.parse(body)
        if (parsed?.detail) return String(parsed.detail)
      } catch {
        if (body.trim()) return body
      }
      const message = apiErr.message || fallback
      if (apiErr.status === 401) {
        setAuthHint('API access denied. Set an API key or log in (Settings).')
      } else if (apiErr.status === 403) {
        setAuthHint('Forbidden. Use an admin-capable API key or login.')
      }
      return message
    }
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message?: string }).message || fallback)
    }
    return fallback
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const list = await apiJson<string[]>('/analytics/frameworks')
        if (cancelled) return
        setFrameworks(list || [])
      } catch (err: unknown) {
        if (!cancelled) setError(formatApiError(err, 'Failed to load frameworks'))
      }
      try {
        const config = await apiJson<FrameworksResponse>('/config/frameworks')
        if (cancelled) return
        setFrameworks(config.available || [])
        setFrameworkMeta(config.frameworks || [])
        setEnabled(new Set(config.configured || config.enabled || []))
        setUseAll(config.all_enabled)
        setSource(config.source ?? null)
        setCanEdit(true)
      } catch (err: unknown) {
        if (!cancelled) {
          const message = formatApiError(err, 'Failed to load regulation configuration')
          setError(message)
          if (message.toLowerCase().includes('tenant')) {
            setTenantHint('Set a Tenant ID in Settings to manage regulations for this tenant.')
          }
          if (message.toLowerCase().includes('database') || message.toLowerCase().includes('db')) {
            setDbHint('Admin database not reachable. Start the DB or switch to tenant scope.')
          }
          setCanEdit(false)
        }
      }

      // Best-effort control library for regulation references
      try {
        const library = await apiJson<ControlLibraryResponse>('/config/control-library')
        if (!cancelled) setControlLibrary(library.items || [])
      } catch (err: unknown) {
        if (!cancelled) setControlLibraryError(formatApiError(err, 'Failed to load control library'))
      }

      // Best-effort latest run metrics per regulation
      try {
        const [dora, nis2, iso, soc2, gxp] = await Promise.allSettled([
          apiJson<FrameworkMetricsResponse>('/analytics/dora/metrics'),
          apiJson<FrameworkMetricsResponse>('/analytics/nis2/metrics'),
          apiJson<FrameworkMetricsResponse>('/analytics/iso/metrics'),
          apiJson<FrameworkMetricsResponse>('/analytics/soc2/metrics'),
          apiJson<FrameworkMetricsResponse>('/analytics/gxp/metrics'),
        ])
        if (cancelled) return
        const next: Record<string, FrameworkMetricsResponse> = {}
        for (const item of [dora, nis2, iso, soc2, gxp]) {
          if (item.status === 'fulfilled' && item.value?.framework) {
            next[item.value.framework] = item.value
          }
        }
        setLatestMetrics(next)
      } catch {
        // ignore
      }

      // Best-effort operational metrics summary per regulation
      try {
        const [doraOps, nis2Ops, isoOps, soc2Ops, gxpOps] = await Promise.allSettled([
          apiJson<DoraOperationalMetricsResponse>('/analytics/dora/operational-metrics'),
          apiJson<Nis2OperationalMetricsResponse>('/analytics/nis2/operational-metrics'),
          apiJson<IsoOperationalMetricsResponse>('/analytics/iso/operational-metrics'),
          apiJson<Soc2OperationalMetricsResponse>('/analytics/soc2/operational-metrics'),
          apiJson<GxpOperationalMetricsResponse>('/analytics/gxp/operational-metrics'),
        ])
        if (cancelled) return
        const next: Record<string, string> = {}
        if (doraOps.status === 'fulfilled') {
          const mttr = doraOps.value.restore_time_hours?.median
          next['dora'] = `Deployments: ${doraOps.value.deployments?.count ?? 0} · MTTR p50: ${
            typeof mttr === 'number' ? `${mttr.toFixed(1)}h` : 'n/a'
          }`
        }
        if (nis2Ops.status === 'fulfilled') {
          const mttr = nis2Ops.value.incidents?.mttr_hours?.median
          next['nis2'] = `Incidents: ${nis2Ops.value.incidents?.significant_count ?? 0} · MTTR p50: ${
            typeof mttr === 'number' ? `${mttr.toFixed(1)}h` : 'n/a'
          }`
        }
        if (isoOps.status === 'fulfilled') {
          next['iso27001'] = `Incidents: ${isoOps.value.incidents?.significant_count ?? 0} · Restores: ${
            isoOps.value.recovery?.restore_jobs ?? 0
          }`
        }
        if (soc2Ops.status === 'fulfilled') {
          const rt = soc2Ops.value.availability?.restore_time_hours?.median
          next['soc2'] = `Availability incidents: ${soc2Ops.value.availability?.incident_count ?? 0} · Restore p50: ${
            typeof rt === 'number' ? `${rt.toFixed(1)}h` : 'n/a'
          }`
        }
        if (gxpOps.status === 'fulfilled') {
          const rate = gxpOps.value.backup?.success_rate_percent
          next['gxp'] = `Backup success: ${typeof rate === 'number' ? `${rate.toFixed(1)}%` : 'n/a'} · Restores: ${
            gxpOps.value.restore?.jobs ?? 0
          }`
        }
        setLatestOperational(next)
      } catch {
        // ignore
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!frameworks.length) return
    if (useAll) {
      setEnabled(new Set(frameworks))
    }
  }, [frameworks, useAll])

  const selectedCount = useMemo(() => enabled.size, [enabled])
  const libraryByFramework = useMemo(() => {
    const grouped: Record<string, ControlLibraryEntry[]> = {}
    for (const entry of controlLibrary) {
      const key = entry.framework?.toLowerCase()
      if (!key) continue
      grouped[key] ||= []
      grouped[key].push(entry)
    }
    return grouped
  }, [controlLibrary])

  function toggleFramework(key: string) {
    if (useAll) {
      setUseAll(false)
    }
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function ensurePolicyLoaded(key: string, variant: PolicyVariant) {
    if (policyRaw[key]?.[variant]) return
    setPolicyLoading((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: true } }))
    setPolicyError((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: '' } }))
    try {
      const resp = await apiJson<PolicyRawResponse>(`/policies/${encodeURIComponent(key)}/raw?variant=${variant}`)
      setPolicyRaw((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: resp } }))
      setPolicyDraft((prev) => {
        const existing = prev[key]?.[variant]
        if (existing !== undefined) return prev
        return { ...prev, [key]: { ...(prev[key] ?? {}), [variant]: resp.content } }
      })
    } catch (err: unknown) {
      setPolicyError((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: formatApiError(err, 'Failed') } }))
    } finally {
      setPolicyLoading((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: false } }))
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        setDetailTabs((current) => (current[key] ? current : { ...current, [key]: 'yaml' }))
        setPolicyVariant((current) => (current[key] ? current : { ...current, [key]: 'resilience-playbook' }))
      }
      return next
    })
    const variant = policyVariant[key] ?? 'resilience-playbook'
    void ensurePolicyLoaded(key, variant)
  }

  function setDetailTab(key: string, tab: 'references' | 'yaml') {
    setDetailTabs((prev) => ({ ...prev, [key]: tab }))
  }

  function setVariant(key: string, variant: PolicyVariant) {
    setPolicyVariant((prev) => ({ ...prev, [key]: variant }))
    void ensurePolicyLoaded(key, variant)
  }

  function updateDraft(key: string, variant: PolicyVariant, value: string) {
    setPolicyDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: value } }))
  }

  function resetDraft(key: string, variant: PolicyVariant) {
    const raw = policyRaw[key]?.[variant]
    setPolicyDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [variant]: raw?.content ?? '' },
    }))
  }

  async function savePolicy(key: string, variant: PolicyVariant) {
    if (!canEdit) return
    const draft = policyDraft[key]?.[variant] ?? ''
    const raw = policyRaw[key]?.[variant]
    setPolicySaving((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: true } }))
    setPolicyError((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: '' } }))
    try {
      const resp = await apiJson<PolicyRawResponse>(`/policies/${encodeURIComponent(key)}/raw?variant=${variant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft, source_hash: raw?.source_hash }),
      })
      setPolicyRaw((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: resp } }))
      setPolicyDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: resp.content } }))
      setNotice('Policy saved.')
    } catch (err: unknown) {
      setPolicyError((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), [variant]: formatApiError(err, 'Failed to save policy') },
      }))
    } finally {
      setPolicySaving((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [variant]: false } }))
    }
  }

  const variantLabels: Record<PolicyVariant, string> = {
    framework: 'Framework',
    controls: 'Controls',
    metrics: 'Metrics',
    'operational-metrics': 'Operational',
    'resilience-playbook': 'Playbook',
  }

  async function saveSelection(scope: 'tenant' | 'system' = 'tenant') {
    if (!canEdit) return
    setLoading(true)
    setNotice(null)
    setError(null)
    setAuthHint(null)
    setDbHint(null)
    try {
      const payload: FrameworksRequest = {
        enabled_frameworks: useAll ? [] : Array.from(enabled).sort(),
        scope,
        all_enabled: useAll,
      }
      const resp = await apiJson<FrameworksResponse>('/config/frameworks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setFrameworks(resp.available || [])
      setFrameworkMeta(resp.frameworks || [])
      setEnabled(new Set(resp.configured || resp.enabled || []))
      setUseAll(resp.all_enabled)
      setSource(resp.source ?? null)
      setNotice(`Regulation settings saved (${scope}).`)
    } catch (err: unknown) {
      const message = formatApiError(err, 'Failed to save regulation settings')
      setError(message)
      if (message.toLowerCase().includes('database') || message.toLowerCase().includes('db')) {
        setDbHint('Admin database not reachable. Try tenant scope or start the DB.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <PageTitle>Regulations</PageTitle>
          <HelpTip text={'Enable or disable regulations for new compliance runs. Requires admin access to save.'} />
        </div>
        <Link
          href="/control-mappings"
          className="rounded-md border border-[#274266] bg-[#12233d] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-[#18365f]"
        >
          Control mappings
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Select which regulations are active. Changes affect new runs and reports, not past history.
      </p>
      {error ? <ErrorBox title="Regulations error" detail={error} /> : null}
      {tenantHint ? (
        <Card>
          <Label>Tenant required</Label>
          <div className="mt-2 text-sm text-slate-300">{tenantHint}</div>
        </Card>
      ) : null}
      {authHint ? (
        <Card>
          <Label>Auth required</Label>
          <div className="mt-2 text-sm text-slate-300">{authHint}</div>
        </Card>
      ) : null}
      {dbHint ? (
        <Card>
          <Label>Database issue</Label>
          <div className="mt-2 text-sm text-slate-300">{dbHint}</div>
        </Card>
      ) : null}
      {!canEdit ? (
        <Card>
          <Label>Read-only mode</Label>
          <div className="mt-2 text-sm text-slate-300">
            You do not have access to admin configuration. Use an admin role to enable or disable regulations.
          </div>
        </Card>
      ) : null}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Regulation selection</Label>
            <div className="mt-1 text-xs text-slate-400">
              {useAll ? 'All regulations enabled.' : `${selectedCount} selected.`}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              const next = !useAll
              setUseAll(next)
              if (next) setEnabled(new Set(frameworks))
            }}
          >
            {useAll ? 'Customize selection' : 'Enable all'}
          </Button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Source: {source ?? 'unknown'}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {frameworks.length ? (
            frameworks.map((key) => {
              const isChecked = enabled.has(key)
              const meta = frameworkMeta.find((entry) => entry.key === key)
              const label = meta?.name ? `${meta.name} (${key})` : key
              const version = meta?.version ? `v${meta.version}` : null
              const metric = latestMetrics[key]
              const summary = metric?.controls_summary
              const resilienceScore =
                typeof metric?.resilience_score === 'number' ? metric.resilience_score : null
              const resilienceSuffix = resilienceScore !== null ? `, resilience ${resilienceScore}` : ''
              const summaryText =
                summary && typeof summary.total === 'number' && summary.total > 0
                  ? `${summary.compliant}/${summary.total} compliant (score ${metric?.score ?? 0}${resilienceSuffix})`
                  : null
              const opText = latestOperational[key] ?? null
              const isExpanded = expanded.has(key)
              const currentVariant = policyVariant[key] ?? 'resilience-playbook'
              const raw = policyRaw[key]?.[currentVariant]
              const rawError = policyError[key]?.[currentVariant]
              const isPolicyLoading = Boolean(policyLoading[key]?.[currentVariant])
              const draft = policyDraft[key]?.[currentVariant] ?? raw?.content ?? ''
              const isDirty = raw ? draft !== raw.content : draft.trim().length > 0
              const isSaving = Boolean(policySaving[key]?.[currentVariant])
              const activeTab = detailTabs[key] ?? 'references'
              const libraryEntries = libraryByFramework[key.toLowerCase()] ?? []
              return (
                <div
                  key={key}
                  className={`rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm${
                    isExpanded ? ' md:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canEdit || useAll}
                      onChange={() => toggleFramework(key)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-100">{label}</div>
                          {version ? <div className="text-xs text-slate-400">{version}</div> : null}
                          {summaryText ? <div className="text-xs text-slate-400">{summaryText}</div> : null}
                          {opText ? <div className="text-xs text-slate-400">{opText}</div> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
                            onClick={() => toggleExpanded(key)}
                          >
                            {isExpanded ? 'Hide details' : 'Show details'}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-slate-200">Regulation references</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={`rounded-md px-2 py-1 text-xs ${
                                  activeTab === 'references'
                                    ? 'bg-white/10 text-slate-100'
                                    : 'border border-slate-800 text-slate-300 hover:bg-white/5'
                                }`}
                                onClick={() => setDetailTab(key, 'references')}
                              >
                                References
                              </button>
                              <button
                                type="button"
                                className={`rounded-md px-2 py-1 text-xs ${
                                  activeTab === 'yaml'
                                    ? 'bg-white/10 text-slate-100'
                                    : 'border border-slate-800 text-slate-300 hover:bg-white/5'
                                }`}
                                onClick={() => setDetailTab(key, 'yaml')}
                              >
                                YAML
                              </button>
                              {(
                                [
                                  'resilience-playbook',
                                  'framework',
                                  'controls',
                                  'metrics',
                                  'operational-metrics',
                                ] as const
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className={`rounded-md px-2 py-1 text-xs ${
                                    currentVariant === v
                                      ? 'bg-white/10 text-slate-100'
                                      : 'border border-slate-800 text-slate-300 hover:bg-white/5'
                                  }`}
                                  onClick={() => setVariant(key, v)}
                                >
                                  {variantLabels[v]}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                                onClick={async () => {
                                  const text = draft
                                  if (!text) return
                                  try {
                                    await navigator.clipboard.writeText(text)
                                    setNotice('YAML copied to clipboard.')
                                  } catch {
                                    // ignore
                                  }
                                }}
                                disabled={!draft}
                              >
                                Copy
                              </button>
                            </div>
                          </div>

                          {activeTab === 'references' ? (
                            <>
                              {controlLibraryError ? (
                                <div className="mt-2 text-xs text-rose-300">{controlLibraryError}</div>
                              ) : null}
                              {libraryEntries.length ? (
                                <div className="mt-3 grid gap-2">
                                  {libraryEntries.slice(0, 30).map((entry) => (
                                    <div
                                      key={`${entry.framework}-${entry.control_id}`}
                                      className="rounded-md border border-slate-800 bg-black/20 p-2"
                                    >
                                      <div className="text-xs font-semibold text-slate-100">{entry.control_id}</div>
                                      {entry.description ? (
                                        <div className="mt-1 text-xs text-slate-300">{entry.description}</div>
                                      ) : null}
                                      {entry.references?.length ? (
                                        <div className="mt-1 text-[11px] text-slate-400">
                                          References: {entry.references.join(', ')}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                  {libraryEntries.length > 30 ? (
                                    <div className="text-[11px] text-slate-400">
                                      Showing first 30 controls. Use Control Mappings for full library.
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="mt-2 text-xs text-slate-400">
                                  No control references found for this regulation.
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {rawError ? <div className="mt-2 text-xs text-rose-300">{rawError}</div> : null}
                              {raw ? (
                                <div className="mt-2 text-[11px] text-slate-400">
                                  <div>{raw.path}</div>
                                  <div>sha256: {raw.source_hash}</div>
                                </div>
                              ) : null}

                              {isPolicyLoading ? (
                                <div className="mt-2 text-xs text-slate-400">Loading?</div>
                              ) : raw ? (
                                <>
                                  <Textarea
                                    value={draft}
                                    onChange={(event) => updateDraft(key, currentVariant, event.target.value)}
                                    rows={14}
                                    readOnly={!canEdit}
                                    className="mt-3 font-mono text-xs"
                                  />
                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                                    <div>{isDirty ? 'Unsaved changes' : 'Saved'}</div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        disabled={!canEdit || !isDirty || isSaving}
                                        onClick={() => void savePolicy(key, currentVariant)}
                                      >
                                        {isSaving ? 'Saving...' : 'Save'}
                                      </Button>
                                      <button
                                        type="button"
                                        className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                                        onClick={() => resetDraft(key, currentVariant)}
                                        disabled={!isDirty || isSaving}
                                      >
                                        Reset
                                      </button>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="mt-2 text-xs text-slate-400">No policy content available.</div>
                              )}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-sm text-slate-300">No frameworks found.</div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void saveSelection('tenant')} disabled={!canEdit || loading}>
            {loading ? 'Saving...' : 'Save (tenant)'}
          </Button>
          <Button type="button" onClick={() => void saveSelection('system')} disabled={!canEdit || loading}>
            {loading ? 'Saving...' : 'Save (system)'}
          </Button>
          {notice ? <div className="text-sm text-emerald-300">{notice}</div> : null}
        </div>
      </Card>
    </div>
  )
}
