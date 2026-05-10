'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import brandLogo from '../assets/brand-logo.png.png'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { useI18n } from '../lib/i18n'

type IconName =
  | 'auditor'
  | 'dashboard'
  | 'health'
  | 'runs'
  | 'evidence'
  | 'exceptions'
  | 'policy'
  | 'trust'
  | 'analytics'
  | 'inventory'
  | 'frameworks'
  | 'connectors'
  | 'controls'
  | 'jobs'
  | 'issues'
  | 'settings'

type NavItem = { to: string; label: string; icon: IconName }
type GroupKey = 'executive' | 'evidence' | 'policyEngine' | 'ingestion'

const navItems: NavItem[] = [
  { to: '/auditor', label: 'Auditor Portal', icon: 'auditor' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/health', label: 'Health', icon: 'health' },
  { to: '/runs', label: 'Reports', icon: 'runs' },
  { to: '/executive-brief', label: 'Executive Brief', icon: 'runs' },
  { to: '/executive-management', label: 'Executive View', icon: 'dashboard' },
  { to: '/board-readout', label: 'Board Readout', icon: 'dashboard' },
  { to: '/audit-log', label: 'Audit Log', icon: 'evidence' },
  { to: '/evidence-log', label: 'Evidence Log', icon: 'evidence' },
  { to: '/evidence-requests', label: 'Evidence', icon: 'evidence' },
  { to: '/evidence-templates', label: 'Evidence Templates', icon: 'evidence' },
  { to: '/exceptions', label: 'Exceptions', icon: 'exceptions' },
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/inventory', label: 'Inventory', icon: 'inventory' },
  { to: '/infrastructure-dependency', label: 'Infrastructure Dependency', icon: 'inventory' },
  { to: '/regulations', label: 'Regulations', icon: 'frameworks' },
  { to: '/connectors', label: 'Connectors', icon: 'connectors' },
  { to: '/policy-tasks', label: 'Policy Tasks', icon: 'policy' },
  { to: '/trust-center', label: 'Trust Center', icon: 'trust' },
  { to: '/jobs', label: 'Jobs', icon: 'jobs' },
  { to: '/issues', label: 'Issues', icon: 'issues' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const EXECUTIVE_NAV_PATHS = new Set(['/dashboard', '/executive-management', '/executive-brief', '/board-readout'])
const EVIDENCE_NAV_PATHS = new Set(['/evidence-requests', '/evidence-log', '/evidence-templates'])
const POLICY_ENGINE_NAV_PATHS = new Set([
  '/runs',
  '/audit-log',
  '/exceptions',
  '/regulations',
  '/policy-tasks',
  '/jobs',
  '/analytics',
])
const INGESTION_NAV_PATHS = new Set(['/inventory', '/connectors', '/infrastructure-dependency'])

function classNames(...values: Array<string | false | undefined | null>): string {
  return values.filter(Boolean).join(' ')
}

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case 'auditor':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Zm-1 6h2v6h-2V8Zm0 8h2v2h-2v-2Z"
          />
        </svg>
      )
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h7v7H4V4Zm9 0h7v4h-7V4ZM13 10h7v10h-7V10ZM4 13h7v7H4v-7Z"
          />
        </svg>
      )
    case 'health':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M3 12h4l2-5 4 10 2-5h6v2h-5l-3 7-4-10-2 5H3v-2Z"
          />
        </svg>
      )
    case 'runs':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="currentColor" d="M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h16v2H4v-2Z" />
        </svg>
      )
    case 'evidence':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm6 1v4h4M8 13h8v2H8v-2Zm0 4h5v2H8v-2Zm0-8h8v2H8v-2Z"
          />
        </svg>
      )
    case 'exceptions':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2 3 6v6c0 5.5 3.8 10.4 9 12 5.2-1.6 9-6.5 9-12V6l-9-4Zm-1 6h2v5h-2V8Zm0 7h2v2h-2v-2Z"
          />
        </svg>
      )
    case 'policy':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5 3h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm9 1v4h4M7 11h10v2H7v-2Zm0 4h7v2H7v-2Z"
          />
        </svg>
      )
    case 'trust':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Zm-1 6h2v6h-2V8Zm0 8h2v2h-2v-2Z"
          />
        </svg>
      )
    case 'analytics':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="currentColor" d="M4 19h16v2H2V3h2v16Zm4-8h3v6H8v-6Zm5-4h3v10h-3V7Zm5 6h3v4h-3v-4Z" />
        </svg>
      )
    case 'inventory':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v6h-7v-6Zm0 8h7v2h-7v-2Z"
          />
        </svg>
      )
    case 'frameworks':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 6h7v6H4V6Zm9 0h7v6h-7V6ZM4 14h7v4H4v-4Zm9 0h7v4h-7v-4Z"
          />
        </svg>
      )
    case 'connectors':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 3h4v4H9v2H7V7H5V3h2Zm6 0h4v4h-2v2h-2V7h-2V3h2ZM7 15h2v2h2v4H7v-4H5v-2h2v2Zm10 0h2v2h-2v4h-4v-4h2v-2h2v2Z"
          />
        </svg>
      )
    case 'controls':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16v3H4V4Zm0 6h10v3H4v-3Zm0 6h16v3H4v-3Zm12-6h4v9h-4v-9Z"
          />
        </svg>
      )
    case 'jobs':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16v4H4V4Zm0 6h16v10H4V10Zm4 2v2h8v-2H8Zm0 4v2h5v-2H8Z"
          />
        </svg>
      )
    case 'issues':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 8h2v2h-2v-2Z"
          />
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="m12 7 2.2.6.8-1.8 2 1.2-1 1.7 1.6 1.6 1.7-1 1.2 2-1.8.8.6 2.2-1.9.4v2l1.9.4-.6 2.2-1.8.8 1.2 2-1.7-1-1.6 1.6 1 1.7-2 1.2-.8-1.8L12 17l-2.2.6-.8 1.8-2-1.2 1-1.7-1.6-1.6-1.7 1-1.2-2 1.8-.8L5 11l-1.9-.4v-2L5 8l-.6-2.2 1.8-.8-1.2-2 1.7 1 1.6-1.6-1-1.7 2-1.2.8 1.8L12 7Zm0 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
          />
        </svg>
      )
    default:
      return null
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [issuesCount, setIssuesCount] = useState(0)
  const [expandedGroups, setExpandedGroups] = useState<Record<GroupKey, boolean>>({
    executive: false,
    evidence: false,
    policyEngine: false,
    ingestion: false,
  })
  const { t } = useI18n()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await apiJson<{ roles?: string[] }>('/auth/me')
        if (!cancelled) {
          setRoles((response.roles || []).map((role) => role.toLowerCase()))
        }
      } catch {
        if (!cancelled) {
          setRoles([])
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Poll the DLQ count so the Issues nav item shows a live badge
  // when failures accumulate. 30s cadence matches the IssuesPage's
  // own auto-refresh and is well below the natural rate at which
  // operators glance at the sidebar.
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const response = await apiJson<{ count?: number }>(
          '/ingest/queue?queue=dead_letter&status=dead_letter&limit=1',
        )
        if (!cancelled) setIssuesCount(response.count || 0)
      } catch {
        // silent — Layout already surfaces auth errors via /auth/me
      }
    }
    void refresh()
    const handle = window.setInterval(refresh, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [])

  const isReadOnlyAuditor =
    roles.includes('auditor') && !roles.some((role) => role === 'admin' || role === 'reporter')

  useEffect(() => {
    if (!isReadOnlyAuditor) return
    const allowedPrefixes = [
      '/auditor',
      '/auth/callback',
      '/dashboard',
      '/health',
      '/runs',
      '/audit-log',
      '/evidence-log',
      '/evidence-requests',
      '/exceptions',
      '/inventory',
      '/infrastructure-dependency',
      '/regulations',
      '/trust-center',
    ]
    const isAllowed = allowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    if (!isAllowed) {
      router.replace('/auditor')
    }
  }, [isReadOnlyAuditor, pathname, router])

  const effectiveNavItems = useMemo(() => {
    if (!isReadOnlyAuditor) {
      return navItems
    }
    const allowed = new Set([
      '/auditor',
      '/dashboard',
      '/health',
      '/runs',
      '/audit-log',
      '/evidence-log',
      '/evidence-requests',
      '/exceptions',
      '/inventory',
      '/infrastructure-dependency',
      '/regulations',
      '/trust-center',
    ])
    return navItems.filter((item) => allowed.has(item.to))
  }, [isReadOnlyAuditor])

  const { executiveNavItems, evidenceNavItems, policyEngineNavItems, ingestionNavItems, primaryNavItems } = useMemo(() => {
    const executive: NavItem[] = []
    const evidence: NavItem[] = []
    const policyEngine: NavItem[] = []
    const ingestion: NavItem[] = []
    const primary: NavItem[] = []
    for (const item of effectiveNavItems) {
      if (EXECUTIVE_NAV_PATHS.has(item.to)) {
        executive.push(item)
      } else if (EVIDENCE_NAV_PATHS.has(item.to)) {
        evidence.push(item)
      } else if (POLICY_ENGINE_NAV_PATHS.has(item.to)) {
        policyEngine.push(item)
      } else if (INGESTION_NAV_PATHS.has(item.to)) {
        ingestion.push(item)
      } else {
        primary.push(item)
      }
    }
    return {
      executiveNavItems: executive,
      evidenceNavItems: evidence,
      policyEngineNavItems: policyEngine,
      ingestionNavItems: ingestion,
      primaryNavItems: primary,
    }
  }, [effectiveNavItems])

  const isNavItemActive = (item: NavItem) =>
    pathname === item.to || pathname.startsWith(`${item.to}/`)

  const renderNavItem = (item: NavItem) => {
    const isActive = isNavItemActive(item)
    const showBadge = item.to === '/issues' && issuesCount > 0
    return (
      <button
        key={item.to}
        type="button"
        onClick={() => router.push(item.to)}
        aria-current={isActive ? 'page' : undefined}
        className={classNames(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
          isActive
            ? 'border border-[#2b4a75] bg-gradient-to-r from-[#1a3a64] to-[#152d50] text-[#a5d3ff] font-semibold shadow-sm shadow-black/30'
            : 'text-slate-200 hover:bg-white/5 hover:text-white',
        )}
      >
        <NavIcon name={item.icon} />
        <span className="flex-1">{t(item.label)}</span>
        {showBadge ? (
          <span
            aria-label={`${issuesCount} unresolved issues`}
            className="rounded-full border border-rose-700/60 bg-rose-600/30 px-2 text-[10px] font-semibold text-rose-100"
          >
            {issuesCount}
          </span>
        ) : null}
      </button>
    )
  }

  const toggleGroup = (group: GroupKey) => {
    setExpandedGroups((previous) => ({ ...previous, [group]: !previous[group] }))
  }

  const renderNavGroup = (group: GroupKey, label: string, items: NavItem[]) => {
    if (!items.length) return null
    const isExpanded = expandedGroups[group]
    const hasActive = items.some(isNavItemActive)
    return (
      <div className="rounded-xl border border-[#223a61] bg-[#0c1a30] p-2 shadow-md shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup(group)}
          aria-expanded={isExpanded}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left hover:bg-white/5"
        >
          <span
            className={classNames(
              'text-[11px] font-semibold uppercase tracking-wide',
              hasActive ? 'text-[#a5d3ff]' : 'text-slate-400',
            )}
          >
            {t(label)}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={classNames(
              'h-4 w-4 transition-transform',
              isExpanded ? 'rotate-180 text-[#a5d3ff]' : 'text-slate-500',
            )}
            aria-hidden="true"
          >
            <path fill="currentColor" d="M7 10 12 15 17 10z" />
          </svg>
        </button>
        {isExpanded ? <div className="mt-1 space-y-1">{items.map(renderNavItem)}</div> : null}
      </div>
    )
  }

  const refreshSnapshot = async () => {
    setSnapshotLoading(true)
    setSnapshotMessage(null)
    try {
      await apiFetch('/connectors/data?refresh=true')
      setSnapshotMessage(t('Snapshot refreshed.'))
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('connectors:snapshot-refreshed'))
      }
    } catch (err) {
      const error = err as ApiError
      setSnapshotMessage(t('Refresh failed: {message}', { message: error.message }))
    } finally {
      setSnapshotLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#0a1223] via-[#0c1b33] to-[#0f2a4a] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="w-64 border-r border-[#203659] bg-[#0e1c33]/95 p-5 shadow-xl shadow-black/30 overflow-y-auto">
          <div className="mb-6 rounded-xl border border-[#223a61] bg-gradient-to-br from-[#142543] via-[#0f1f36] to-[#0b182d] p-4 shadow-md shadow-black/30">
            <Image src={brandLogo} alt="Attestiv" className="h-16 w-auto" priority />
            <div className="mt-2 text-xs text-slate-300">{t('Management Console')}</div>
          </div>
          <nav className="space-y-3">
            {renderNavGroup('executive', 'Executive', executiveNavItems)}
            {renderNavGroup('evidence', 'Evidence', evidenceNavItems)}
            {renderNavGroup('policyEngine', 'Policy Engine', policyEngineNavItems)}
            {renderNavGroup('ingestion', 'Ingestion', ingestionNavItems)}
            <div className="space-y-1">{primaryNavItems.map(renderNavItem)}</div>
          </nav>
          {isReadOnlyAuditor ? null : (
            <div className="mt-6 rounded-xl border border-[#223a61] bg-[#0c1a30] p-4 shadow-md shadow-black/30">
              <div className="text-xs uppercase text-slate-300">{t('Snapshot')}</div>
              <button
                type="button"
                onClick={refreshSnapshot}
                disabled={snapshotLoading}
                className="mt-2 w-full rounded-lg border border-[#2b4a75] bg-[#0d1a2b] px-3 py-2 text-sm font-semibold text-slate-100 shadow-inner shadow-black/30 transition hover:bg-[#132a4a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {snapshotLoading ? t('Refreshing...') : t('Refresh snapshot')}
              </button>
              {snapshotMessage ? <div className="mt-2 text-xs text-slate-300">{snapshotMessage}</div> : null}
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-auto bg-[#0c1627]/70 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
