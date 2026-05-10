'use client'

// Framework subscription page — lets a tenant admin pick the
// frameworks the scoring engine evaluates for them.
//
// Two-source merge:
//   1. /v1/config/frameworks — the platform's catalog (which frameworks
//      exist, which the platform admin has globally disabled).
//   2. /v1/tenant/profile — the tenant's `frameworks_enabled` field.
//      Absent = subscribed to everything (the historical default for
//      tenants that pre-date this feature). Empty array = explicitly
//      subscribed to nothing.
//
// On save we PUT the full profile back — `sanitizeTenantProfile` on
// the server replaces the whole profile, so the page reloads the
// current profile first and merges its other fields untouched.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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

type FrameworkEntry = {
  key: string
  label: string
  description?: string
}

type FrameworksResponse = {
  available?: string[]
  enabled?: string[]
  frameworks?: FrameworkEntry[]
  all_enabled?: boolean
}

type TenantProfileResponse = {
  tenant_id: string
  profile: Record<string, unknown>
}

export function AttestivFrameworkSubscriptionPage() {
  const router = useRouter()
  const [catalog, setCatalog] = useState<FrameworkEntry[]>([])
  const [globallyEnabled, setGloballyEnabled] = useState<Set<string>>(new Set())
  const [allEnabled, setAllEnabled] = useState(true)
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [tenantID, setTenantID] = useState<string>('')
  // selection is the *working* subscription. null = no explicit
  // selection yet (subscribe to all); Set = explicit allowlist.
  const [selection, setSelection] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [catalogRes, profileRes] = await Promise.all([
          apiFetch('/config/frameworks'),
          apiFetch('/tenant/profile'),
        ])
        if (cancelled) return
        if (!catalogRes.ok) {
          throw new Error(`config/frameworks: ${catalogRes.status} ${catalogRes.statusText}`)
        }
        if (!profileRes.ok) {
          throw new Error(`tenant/profile: ${profileRes.status} ${profileRes.statusText}`)
        }
        const catalogBody: FrameworksResponse = await catalogRes.json()
        const profileBody: TenantProfileResponse = await profileRes.json()
        const entries = Array.isArray(catalogBody.frameworks) ? catalogBody.frameworks : []
        setCatalog(entries)
        setGloballyEnabled(new Set(catalogBody.enabled ?? []))
        setAllEnabled(catalogBody.all_enabled ?? true)
        setTenantID(profileBody.tenant_id || '')
        setProfile(profileBody.profile || {})
        const tenantList = profileBody.profile?.frameworks_enabled
        if (Array.isArray(tenantList)) {
          setSelection(new Set((tenantList as string[]).map((s) => s.toLowerCase())))
        } else {
          setSelection(null)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load framework settings')
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

  function toggle(frameworkKey: string) {
    setSavedMessage(null)
    setSelection((current) => {
      const next = new Set(current ?? subscribeAllInitial(catalog, globallyEnabled, allEnabled))
      if (next.has(frameworkKey)) {
        next.delete(frameworkKey)
      } else {
        next.add(frameworkKey)
      }
      return next
    })
  }

  function selectAll() {
    setSavedMessage(null)
    setSelection(new Set(subscribeAllInitial(catalog, globallyEnabled, allEnabled)))
  }

  function selectNone() {
    setSavedMessage(null)
    setSelection(new Set())
  }

  function resetToDefault() {
    setSavedMessage(null)
    setSelection(null)
  }

  async function save() {
    if (!profile) return
    setBusy(true)
    setError(null)
    setSavedMessage(null)
    try {
      const merged: Record<string, unknown> = { ...profile }
      if (selection === null) {
        // Reset-to-default — explicitly send an empty list would
        // unsubscribe from everything. To restore "subscribe to
        // all", we OMIT the key from the PUT. The server's
        // sanitizer drops absent keys cleanly.
        delete merged.frameworks_enabled
      } else {
        merged.frameworks_enabled = Array.from(selection).sort()
      }
      const response = await apiFetch('/tenant/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.detail || `${response.status} ${response.statusText}`)
      }
      const body: TenantProfileResponse = await response.json()
      setProfile(body.profile || {})
      const tenantList = body.profile?.frameworks_enabled
      if (Array.isArray(tenantList)) {
        setSelection(new Set((tenantList as string[]).map((s) => s.toLowerCase())))
      } else {
        setSelection(null)
      }
      setSavedMessage('Saved. The next scoring evaluation will use this subscription.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  // What "checked" looks like — null selection means subscribe to
  // all, so every globally-enabled framework reads as checked. The
  // user has to make one explicit change before save matters.
  const effectiveSelection = useMemo(() => {
    if (selection !== null) return selection
    return new Set(subscribeAllInitial(catalog, globallyEnabled, allEnabled))
  }, [selection, catalog, globallyEnabled, allEnabled])

  const summary = useMemo(() => {
    return {
      total: catalog.length,
      selected: effectiveSelection.size,
      isDefault: selection === null,
    }
  }, [catalog, effectiveSelection, selection])

  return (
    <>
      <Topbar
        title="Framework subscription"
        left={
          tenantID ? (
            <Badge tone="navy">
              tenant <code>{tenantID}</code>
            </Badge>
          ) : null
        }
        right={
          <GhostButton onClick={() => router.push('/settings')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Settings
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {savedMessage ? <Banner tone="success">{savedMessage}</Banner> : null}

        <Banner tone="info" title="What this controls">
          The scoring engine only evaluates frameworks you subscribe to. Unsubscribing a framework
          means it stops appearing on the Frameworks page, stops generating control failures, and
          stops dragging your score down. Subscribe back anytime — the evidence is preserved and
          the next evaluation rebuilds the history.
        </Banner>

        <Card style={{ marginTop: 12 }}>
          <CardTitle
            right={
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {summary.selected} of {summary.total} selected{summary.isDefault ? ' · default (subscribe-to-all)' : ''}
              </span>
            }
          >
            Available frameworks
          </CardTitle>

          {loading ? (
            <Skeleton lines={5} height={42} />
          ) : catalog.length === 0 ? (
            <EmptyState
              icon="ti-layout-list"
              title="No frameworks configured"
              description="The platform admin hasn't enabled any frameworks. Ask them to add YAMLs under policies/frameworks/ and update the global enable list."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catalog.map((entry) => {
                const checked = effectiveSelection.has(entry.key)
                const globallyAllowed = allEnabled || globallyEnabled.has(entry.key)
                return (
                  <FrameworkToggle
                    key={entry.key}
                    entry={entry}
                    checked={checked}
                    locked={!globallyAllowed}
                    onToggle={() => toggle(entry.key)}
                  />
                )
              })}
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <GhostButton onClick={selectAll} disabled={busy || loading}>
            <i className="ti ti-checkbox" aria-hidden="true" /> Select all
          </GhostButton>
          <GhostButton onClick={selectNone} disabled={busy || loading}>
            <i className="ti ti-square" aria-hidden="true" /> Select none
          </GhostButton>
          <GhostButton onClick={resetToDefault} disabled={busy || loading || selection === null}>
            <i className="ti ti-refresh" aria-hidden="true" /> Reset to default
          </GhostButton>
          <span style={{ flex: 1 }} />
          <PrimaryButton onClick={save} disabled={busy || loading}>
            {busy ? 'Saving…' : 'Save subscription'}
          </PrimaryButton>
        </div>
      </div>
    </>
  )
}

function FrameworkToggle({
  entry,
  checked,
  locked,
  onToggle,
}: {
  entry: FrameworkEntry
  checked: boolean
  locked: boolean
  onToggle: () => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-md)',
        background: locked ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked && !locked}
        disabled={locked}
        onChange={onToggle}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {entry.label}
          {locked ? (
            <Badge tone="gray" icon="ti-lock">platform-disabled</Badge>
          ) : null}
        </div>
        {entry.description ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {entry.description}
          </div>
        ) : null}
      </div>
      <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{entry.key}</code>
    </label>
  )
}

// subscribeAllInitial returns the implicit allowlist used when the
// tenant has no explicit selection — every framework the platform
// admin hasn't globally disabled. Matches the scoring engine's
// "nil FrameworksEnabled = subscribe to all" semantics so the UI
// preview is honest.
function subscribeAllInitial(
  catalog: FrameworkEntry[],
  globallyEnabled: Set<string>,
  allEnabled: boolean,
): string[] {
  return catalog
    .filter((entry) => allEnabled || globallyEnabled.has(entry.key))
    .map((entry) => entry.key)
}
