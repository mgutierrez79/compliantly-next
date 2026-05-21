import { useEffect, useState } from 'react'
import { apiJson } from './api'

// Client-side role awareness for hiding write controls from read-only
// roles. The backend RBAC (Require()) is the real enforcer — this is
// purely UX so reader/auditor users don't see Create/Delete/Approve
// buttons that would just 403.
//
// Roles come from /auth/me (deduped + cached in localStorage, the same
// key the console layout populates) so there's no flash for returning
// users. canWrite = admin or reporter; reader/auditor are read-only.

const ROLES_CACHE_KEY = 'compliantly.ui.roles'

function loadCachedRoles(): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ROLES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : null
  } catch {
    return null
  }
}

let _mePromise: Promise<string[]> | null = null

function fetchRoles(): Promise<string[]> {
  if (_mePromise) return _mePromise
  _mePromise = apiJson<{ roles?: string[] }>('/auth/me')
    .then((r) => (Array.isArray(r.roles) ? r.roles : []))
    .catch(() => [])
  return _mePromise
}

export type RoleState = {
  roles: string[] | null
  isAdmin: boolean
  canWrite: boolean
  ready: boolean
}

export function useRoles(): RoleState {
  const [roles, setRoles] = useState<string[] | null>(null)
  useEffect(() => {
    setRoles(loadCachedRoles())
    let cancelled = false
    fetchRoles().then((r) => {
      if (cancelled) return
      setRoles(r)
      try {
        window.localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify(r))
      } catch {
        // best-effort cache
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  const set = new Set((roles ?? []).map((r) => r.toLowerCase().trim()))
  const isAdmin = set.has('admin')
  // Unknown roles (null, pre-/auth/me) → optimistic write-capable so we
  // don't hide actions from admins/reporters during the brief load.
  const canWrite = roles === null ? true : isAdmin || set.has('reporter')
  return { roles, isAdmin, canWrite, ready: roles !== null }
}
