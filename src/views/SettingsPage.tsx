'use client'

import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, ErrorBox, HelpTip, Input, Label, PageTitle, Textarea } from '../components/Ui'
import { apiJson, clearApiPerfEntries, getApiPerfEntries } from '../lib/api'
import type { ApiPerfEntry } from '../lib/api'
import { oidcSignIn, oidcSignOut } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { clearLogs, getLogs, setLogLevel as setLoggerLevel, subscribeLogs, type LogEntry } from '../lib/logger'
import { defaultSettings, loadSettings, saveSettings } from '../lib/settings'

type SystemConfig = {
  db_url?: string | null
  redis_url?: string | null
  auth_enabled?: boolean | null
  tenancy_enabled?: boolean | null
  async_jobs_enabled?: boolean | null
  async_only_heavy_endpoints?: boolean | null
  enabled_frameworks?: string[] | null
  connectors?: string[] | null
  default_max_runs?: number | null
  default_max_reports?: number | null
  default_retention_days?: number | null
}

export function SettingsPage() {
  const { setLanguage: setUiLanguage } = useI18n()
  const current = defaultSettings()
  const [apiBaseUrl, setApiBaseUrl] = useState(current.apiBaseUrl)
  const [apiKey, setApiKey] = useState(current.apiKey)
  const [localToken, setLocalToken] = useState(current.localToken)
  const [tenantId, setTenantId] = useState(current.tenantId)
  const [language, setLanguage] = useState(current.language)
  const [timeZone, setTimeZone] = useState(current.timeZone)
  const [authMode, setAuthMode] = useState(current.authMode)
  const [oidcIssuer, setOidcIssuer] = useState(current.oidcIssuer)
  const [oidcClientId, setOidcClientId] = useState(current.oidcClientId)
  const [oidcScope, setOidcScope] = useState(current.oidcScope)
  const [oidcAudience, setOidcAudience] = useState(current.oidcAudience)
  const [logLevel, setLogLevel] = useState(current.logLevel)
  const [saved, setSaved] = useState(false)
  const [logEntries, setLogEntries] = useState<LogEntry[]>(() => getLogs())
  const [logNotice, setLogNotice] = useState<string | null>(null)
  const [perfEntries, setPerfEntries] = useState<ApiPerfEntry[]>([])
  const [perfNotice, setPerfNotice] = useState<string | null>(null)

  useEffect(() => {
    const savedSettings = loadSettings()
    setApiBaseUrl(savedSettings.apiBaseUrl)
    setApiKey(savedSettings.apiKey)
    setLocalToken(savedSettings.localToken)
    setTenantId(savedSettings.tenantId)
    setLanguage(savedSettings.language)
    setTimeZone(savedSettings.timeZone)
    setAuthMode(savedSettings.authMode)
    setOidcIssuer(savedSettings.oidcIssuer)
    setOidcClientId(savedSettings.oidcClientId)
    setOidcScope(savedSettings.oidcScope)
    setOidcAudience(savedSettings.oidcAudience)
    setLogLevel(savedSettings.logLevel)
    setUiLanguage(savedSettings.language)
    setLoggerLevel(savedSettings.logLevel)
  }, [setUiLanguage])

  const envVarKeys = [
    'COMPLIANCE_DB_URL',
    'COMPLIANCE_DB_ADMIN_URL',
    'COMPLIANCE_DB_NAME',
    'COMPLIANCE_REDIS_URL',
    'COMPLIANCE_AUTH_ENABLED',
    'COMPLIANCE_AUTH_API_KEYS',
    'COMPLIANCE_TENANCY_ENABLED',
    'COMPLIANCE_ASYNC_JOBS_ENABLED',
    'COMPLIANCE_ASYNC_ONLY_HEAVY_ENDPOINTS',
    'COMPLIANCE_ENABLED_FRAMEWORKS',
    'COMPLIANCE_CONNECTORS',
    'COMPLIANCE_DEFAULT_MAX_RUNS',
    'COMPLIANCE_DEFAULT_MAX_REPORTS',
    'COMPLIANCE_DEFAULT_RETENTION_DAYS',
  ] as const
  const [envValues, setEnvValues] = useState<Record<string, string>>(
    () => Object.fromEntries(envVarKeys.map((k) => [k, ''])) as Record<string, string>,
  )

  // DB-backed admin state
  const [activeTab, setActiveTab] = useState<'system' | 'tenants'>('system')
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null)
  const [sysError, setSysError] = useState<string | null>(null)
  const [sysLoading, setSysLoading] = useState(false)
  const [tenants, setTenants] = useState<any[]>([])
  const [tenantMeta, setTenantMeta] = useState('')
  const [tenantIdInput, setTenantIdInput] = useState('')
  const [secretName, setSecretName] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [secrets, setSecrets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [bindings, setBindings] = useState<any[]>([])
  const [userSubject, setUserSubject] = useState('')
  const [userRoleList, setUserRoleList] = useState('reader')
  const [userRoles, setUserRoles] = useState('reader')
  const [userPassword, setUserPassword] = useState('')
  const [bindingResource, setBindingResource] = useState('')
  const [bindingTenant, setBindingTenant] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notices, setNotices] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({
    tenants: null,
    secrets: null,
    users: null,
    bindings: null,
  })

  const oidcConfigured = useMemo(() => Boolean(oidcIssuer.trim() && oidcClientId.trim()), [oidcClientId, oidcIssuer])
  const userRolesList = useMemo(
    () =>
      userRoleList
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    [userRoleList],
  )
  const passwordRequired = authMode === 'local'
  const canSaveUser = Boolean(userSubject.trim() && userRolesList.length && (!passwordRequired || userPassword.trim()))
  const canSaveBinding = Boolean(
    userSubject.trim() && userRoles.split(',').map((role) => role.trim()).filter(Boolean).length,
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    saveSettings({
      apiBaseUrl: apiBaseUrl.trim(),
      tenantId: tenantId.trim(),
      authMode,
      apiKey: apiKey.trim(),
      localToken: localToken.trim(),
      language,
      timeZone: timeZone.trim(),
      oidcIssuer: oidcIssuer.trim(),
      oidcClientId: oidcClientId.trim(),
      oidcScope: oidcScope.trim(),
      oidcAudience: oidcAudience.trim(),
      logLevel,
    })
    setUiLanguage(language)
    setLoggerLevel(logLevel)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  // -------- API helpers --------
  async function refreshSystem() {
    setSysLoading(true)
    setSysError(null)
    try {
      const resp = await apiJson<{ config: SystemConfig }>('/admin/db/config')
      const nextConfig = resp.config || {}
      setSysConfig(nextConfig)
      setEnvValues((prev) => {
        const next = { ...prev }
        envVarKeys.forEach((key) => {
          const stored = (nextConfig as Record<string, unknown>)[key.toLowerCase()]
          if (stored === undefined || stored === null) return
          next[key] = String(stored)
        })
        return next
      })
    } catch (err: any) {
      setSysError(err.message ?? 'Failed to load system config')
    } finally {
      setSysLoading(false)
    }
  }

  async function refreshTenants() {
    try {
      const resp = await apiJson<{ tenants: any[] }>('/admin/db/tenants')
      setTenants(resp.tenants ?? [])
      setErrors((prev) => ({ ...prev, tenants: null }))
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, tenants: err.message ?? 'Failed to load tenants' }))
    }
  }

  async function refreshSecrets(tenant: string) {
    if (!tenant) return
    try {
      const resp = await apiJson<{ secrets: any[] }>(`/admin/db/tenants/${tenant}/secrets`)
      setSecrets(resp.secrets ?? [])
      setErrors((prev) => ({ ...prev, secrets: null }))
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, secrets: err.message ?? 'Failed to load secrets' }))
    }
  }

  async function refreshUsers() {
    try {
      const resp = await apiJson<{ users: any[] }>('/admin/db/users')
      setUsers(resp.users ?? [])
      setErrors((prev) => ({ ...prev, users: null }))
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, users: err.message ?? 'Failed to load users' }))
    }
  }

  async function refreshBindings() {
    try {
      const resp = await apiJson<{ bindings: any[] }>('/admin/db/rbac/bindings')
      setBindings(resp.bindings ?? [])
      setErrors((prev) => ({ ...prev, bindings: null }))
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, bindings: err.message ?? 'Failed to load bindings' }))
    }
  }

  useEffect(() => {
    refreshSystem().catch(() => undefined)
    // Load admin system state once when Settings opens; user actions call refreshSystem explicitly after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => subscribeLogs((entries) => setLogEntries(entries)), [])

  useEffect(() => {
    if (activeTab === 'tenants') {
      Promise.all([refreshTenants(), refreshUsers(), refreshBindings()]).catch(() => undefined)
    }
  }, [activeTab])

  function onTabChange(tab: 'system' | 'tenants') {
    setActiveTab(tab)
  }

  async function saveSystemConfig(event: FormEvent) {
    event.preventDefault()
    setBusy('Saving system config...')
    setSysError(null)
    setNotices(null)
    try {
      const payload: Record<string, any> = { ...(sysConfig ?? {}) }
      Object.entries(envValues).forEach(([k, v]) => {
        if (v.trim()) payload[k.toLowerCase()] = v.trim()
      })
      const resp = await apiJson<{ config: SystemConfig }>('/admin/db/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSysConfig(resp.config)
      setNotices('System configuration saved.')
    } catch (err: any) {
      setSysError(err.message ?? 'Failed to save system config')
    } finally {
      setBusy(null)
    }
  }

  async function saveTenant() {
    if (!tenantIdInput.trim()) return
    setBusy('Saving tenant...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, tenants: null }))
    try {
      const payload: any = { tenant_id: tenantIdInput.trim() }
      if (tenantMeta.trim()) {
        payload.metadata = JSON.parse(tenantMeta)
      }
      await apiJson('/admin/db/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setNotices('Tenant saved.')
      await refreshTenants()
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, tenants: err.message ?? 'Failed to save tenant (metadata must be JSON)' }))
    } finally {
      setBusy(null)
    }
  }

  async function saveSecret() {
    if (!tenantIdInput.trim() || !secretName.trim()) return
    setBusy('Saving secret...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, secrets: null }))
    try {
      await apiJson(`/admin/db/tenants/${tenantIdInput.trim()}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: secretName.trim(), value: secretValue }),
      })
      setNotices('Secret saved.')
      setSecretValue('')
      await refreshSecrets(tenantIdInput.trim())
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        secrets: err.message ?? 'Failed to save secret (ensure COMPLIANCE_SECRET_KEY is set server-side)',
      }))
    } finally {
      setBusy(null)
    }
  }

  async function saveUser() {
    if (!canSaveUser) return
    setBusy('Saving user...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, users: null }))
    try {
      const payload: Record<string, any> = {
        subject: userSubject.trim(),
        email: userSubject.trim(),
        name: userSubject.trim(),
        roles: userRolesList,
        status: 'active',
      }
      const password = userPassword.trim()
      if (password) {
        payload.password = password
      }
      await apiJson('/admin/db/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setNotices('User saved.')
      setUserPassword('')
      await refreshUsers()
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, users: err.message ?? 'Failed to save user' }))
    } finally {
      setBusy(null)
    }
  }

  async function saveBinding() {
    setBusy('Saving binding...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, bindings: null }))
    try {
      await apiJson('/admin/db/rbac/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: userSubject.trim() || null,
          tenant_id: bindingTenant.trim() || null,
          resource_type: bindingResource ? 'run' : null,
          resource_id: bindingResource || null,
          role: userRoles.split(',').map((r) => r.trim())[0] || 'reader',
        }),
      })
      setNotices('Binding saved.')
      await refreshBindings()
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, bindings: err.message ?? 'Failed to save binding' }))
    } finally {
      setBusy(null)
    }
  }

  async function deleteUser(subject: string) {
    if (!subject) return
    setBusy('Deleting user...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, users: null }))
    try {
      await apiJson(`/admin/db/users/${encodeURIComponent(subject)}`, { method: 'DELETE' })
      setNotices('User deleted.')
      await refreshUsers()
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, users: err.message ?? 'Failed to delete user' }))
    } finally {
      setBusy(null)
    }
  }

  async function deleteBinding(bindingId: string) {
    if (!bindingId) return
    setBusy('Deleting binding...')
    setNotices(null)
    setErrors((prev) => ({ ...prev, bindings: null }))
    try {
      await apiJson(`/admin/db/rbac/bindings/${encodeURIComponent(bindingId)}`, { method: 'DELETE' })
      setNotices('Binding deleted.')
      await refreshBindings()
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, bindings: err.message ?? 'Failed to delete binding' }))
    } finally {
      setBusy(null)
    }
  }

  function levelClass(level: LogEntry['level']) {
    if (level === 'critical') return 'text-rose-300'
    if (level === 'error') return 'text-rose-200'
    if (level === 'warning') return 'text-amber-200'
    if (level === 'info') return 'text-emerald-200'
    return 'text-slate-300'
  }

  function showLogNotice(message: string) {
    setLogNotice(message)
    setTimeout(() => setLogNotice(null), 1200)
  }

  async function copyLogs() {
    if (!logEntries.length) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      showLogNotice('Clipboard is not available.')
      return
    }
    try {
      const payload = JSON.stringify(logEntries, null, 2)
      await navigator.clipboard.writeText(payload)
      showLogNotice('Logs copied.')
    } catch {
      showLogNotice('Failed to copy logs.')
    }
  }

  function clearLogBuffer() {
    if (!logEntries.length) return
    clearLogs()
    showLogNotice('Logs cleared.')
  }

  const formatBytes = (value: number | null) => {
    if (!value || value <= 0) return 'n/a'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }

  const refreshPerf = () => {
    setPerfEntries(getApiPerfEntries())
  }

  const clearPerf = () => {
    clearApiPerfEntries()
    setPerfEntries([])
    setPerfNotice('Performance entries cleared.')
    setTimeout(() => setPerfNotice(null), 2000)
  }

  useEffect(() => {
    refreshPerf()
    const timer = setInterval(refreshPerf, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PageTitle>Settings</PageTitle>
        <HelpTip text={'Configure how the UI talks to the API. System tab controls API auth/base URL; Tenants tab manages DB-backed admin config.'} />
      </div>
      <p className="text-sm text-slate-400">
        Configure how the UI connects to your API, and choose API key, OIDC, or local authentication. DB-backed admin endpoints drive system
        config, tenants, secrets, users, and bindings.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => onTabChange('system')} disabled={activeTab === 'system'}>
          System
        </Button>
        <Button type="button" onClick={() => onTabChange('tenants')} disabled={activeTab === 'tenants'}>
          Tenants & Users
        </Button>
      </div>

      {activeTab === 'system' ? (
        <>
          {sysError ? <ErrorBox title="System config error" detail={sysError} /> : null}
          <Card>
            <Label>API connection</Label>
            <form className="mt-3 space-y-3" onSubmit={onSubmit}>
              <div>
                <div className="flex items-center gap-2">
                  <Label>API base URL</Label>
                  <HelpTip text={'Base URL for the backend API. Example: http://127.0.0.1:8001.'} />
                </div>
                <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8001" />
                <div className="mt-1 text-xs text-slate-400">{`The UI calls \`${apiBaseUrl}/v1/...\``}</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Language</Label>
                  <HelpTip text={'UI language. Example: English, Espanol, Francais.'} />
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'es' | 'fr')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Time zone</Label>
                  <HelpTip text={'Time zone for timestamps (IANA format). Example: Europe/Paris or America/New_York.'} />
                </div>
                <Input
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  placeholder="America/New_York"
                />
                <div className="mt-1 text-xs text-slate-400">Used for dashboard timestamps. Leave blank to use browser default.</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Log verbosity</Label>
                  <HelpTip text={'Controls UI log capture and console output. Example: warning for errors only.'} />
                </div>
                <select
                  value={logLevel}
                  onChange={(e) => setLogLevel(e.target.value as LogEntry['level'])}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="critical">Critical</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <div className="mt-1 text-xs text-slate-400">Stored locally in your browser.</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Auth mode</Label>
                  <HelpTip text={'Choose API key, OIDC (SSO), or local login for UI access.'} />
                </div>
                <select
                  value={authMode}
                  onChange={(e) => {
                    const next = e.target.value
                    if (next === 'oidc' || next === 'local' || next === 'apiKey') {
                      setAuthMode(next)
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="apiKey">API key</option>
                  <option value="oidc">OIDC (SSO)</option>
                  <option value="local">Local username/password</option>
                </select>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Tenant ID (optional)</Label>
                  <HelpTip text={'Optional tenant scope header. Example: acme.'} />
                </div>
                <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="acme" />
              </div>
              {authMode === 'apiKey' ? (
                <div>
                  <div className="flex items-center gap-2">
                    <Label>API key (Bearer)</Label>
                    <HelpTip text={'Bearer token from COMPLIANCE_AUTH_API_KEYS.'} />
                  </div>
                  <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="key-..." />
                  <div className="mt-1 text-xs text-slate-400">Stored locally in your browser.</div>
                </div>
              ) : authMode === 'oidc' ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>OIDC issuer (authority)</Label>
                      <HelpTip text={'OIDC issuer URL. Example: https://login.microsoftonline.com/...'} />
                    </div>
                    <Input value={oidcIssuer} onChange={(e) => setOidcIssuer(e.target.value)} placeholder="https://issuer.example.com" />
                    <div className="mt-1 text-xs text-slate-400">
                      Must expose OIDC discovery at `{oidcIssuer || '<issuer>'}/.well-known/openid-configuration`.
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>OIDC client id</Label>
                      <HelpTip text={'Client ID from your IdP app registration.'} />
                    </div>
                    <Input value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} placeholder="client-id" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Scope</Label>
                        <HelpTip text={'OIDC scopes. Example: openid profile email.'} />
                      </div>
                      <Input value={oidcScope} onChange={(e) => setOidcScope(e.target.value)} placeholder="openid profile email" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Audience (optional)</Label>
                        <HelpTip text={'Optional API audience. Example: api://compliantly.'} />
                      </div>
                      <Input value={oidcAudience} onChange={(e) => setOidcAudience(e.target.value)} placeholder="api://..." />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" disabled={!oidcConfigured} onClick={() => oidcSignIn()}>
                      Login (OIDC)
                    </Button>
                    <Button type="button" onClick={() => oidcSignOut()}>
                      Logout
                    </Button>
                    {!oidcConfigured ? <div className="text-sm text-rose-200">Set issuer + client id, then Save.</div> : null}
                  </div>
                  <div className="text-xs text-slate-400">
                    Callback URL to register in your IdP: <span className="font-mono">{`${window.location.origin}/auth/callback`}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Local access token</Label>
                    <HelpTip text={'Token returned by /v1/auth/login for local auth.'} />
                  </div>
                  <Input
                    type="password"
                    value={localToken}
                    onChange={(e) => setLocalToken(e.target.value)}
                    placeholder="Paste token from /v1/auth/login"
                  />
                  <div className="mt-1 text-xs text-slate-400">
                    Issued by the local login endpoint; stored only in your browser.
                  </div>
                  <div className="mt-2">
                    <Button type="button" onClick={() => setLocalToken('')}>
                      Clear token
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button type="submit">Save</Button>
                {saved ? <div className="text-sm text-emerald-300">Saved.</div> : null}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Label>API performance</Label>
              <HelpTip text={'Recent API calls captured in your browser. Use this to spot slow endpoints and large payloads.'} />
            </div>
            <p className="mt-2 text-sm text-slate-400">Updates every 3 seconds, stored locally in your browser.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={refreshPerf}>
                Refresh
              </Button>
              <Button type="button" onClick={clearPerf} disabled={!perfEntries.length}>
                Clear
              </Button>
              {perfNotice ? <div className="text-sm text-emerald-300">{perfNotice}</div> : null}
            </div>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-[#29446c] bg-[#0b1729] p-3 text-xs text-slate-200">
              {perfEntries.length === 0 ? (
                <div className="text-slate-400">No API calls captured yet.</div>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="pb-2 pr-3">Time</th>
                      <th className="pb-2 pr-3">Method</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3">Duration</th>
                      <th className="pb-2 pr-3">Size</th>
                      <th className="pb-2 pr-3">Endpoint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f365a]">
                    {perfEntries.slice(0, 30).map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2 pr-3 font-mono">{entry.timestamp}</td>
                        <td className="py-2 pr-3">{entry.method}</td>
                        <td className={`py-2 pr-3 ${entry.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {entry.status || 'ERR'}
                        </td>
                        <td className="py-2 pr-3">{entry.duration_ms} ms</td>
                        <td className="py-2 pr-3">{formatBytes(entry.size_bytes)}</td>
                        <td className="py-2 pr-3 text-slate-300">{entry.url}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Label>Application logs</Label>
              <HelpTip text={'In-browser logs for troubleshooting UI and API issues. Logs stay in your browser until cleared.'} />
            </div>
            <p className="mt-2 text-sm text-slate-400">Use this view to copy logs when reporting issues.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void copyLogs()} disabled={!logEntries.length}>
                Copy logs
              </Button>
              <Button type="button" onClick={clearLogBuffer} disabled={!logEntries.length}>
                Clear logs
              </Button>
              {logNotice ? <div className="text-sm text-emerald-300">{logNotice}</div> : null}
            </div>
            <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-[#29446c] bg-[#0b1729] p-3 text-xs text-slate-200">
              {logEntries.length === 0 ? (
                <div className="text-slate-400">No logs yet.</div>
              ) : (
                [...logEntries]
                  .reverse()
                  .map((entry) => (
                    <div key={entry.id} className="border-b border-[#1f365a] pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        <span>{entry.timestamp}</span>
                        <span className={levelClass(entry.level)}>{entry.level}</span>
                        {entry.scope ? <span>{entry.scope}</span> : null}
                      </div>
                      <div className="mt-1 text-sm text-slate-100">{entry.message}</div>
                      {entry.details ? (
                        <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300">{entry.details}</pre>
                      ) : null}
                    </div>
                  ))
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Label>Advanced (DB-backed configuration)</Label>
              <HelpTip text={'Persist environment-style key/value settings into the database. Requires DB + COMPLIANCE_SECRET_KEY on the API.'} />
            </div>
            <p className="mt-2 text-sm text-slate-400">Saved to /admin/db/config (admin role required).</p>
            <form className="mt-3 space-y-4" onSubmit={saveSystemConfig}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Label>DB URL</Label>
                    <HelpTip text={'Postgres connection string for the main database.'} />
                  </div>
                  <Input
                    value={sysConfig?.db_url ?? ''}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), db_url: e.target.value })}
                    placeholder="postgres://..."
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Redis URL</Label>
                    <HelpTip text={'Redis connection string for async jobs.'} />
                  </div>
                  <Input
                    value={sysConfig?.redis_url ?? ''}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), redis_url: e.target.value })}
                    placeholder="redis://..."
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Auth enabled</Label>
                    <HelpTip text={'Set true to require auth for API endpoints.'} />
                  </div>
                  <Input
                    value={sysConfig?.auth_enabled === undefined ? '' : String(sysConfig?.auth_enabled)}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), auth_enabled: e.target.value === 'true' })}
                    placeholder="true/false"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Tenancy enabled</Label>
                    <HelpTip text={'Set true to require X-Tenant-ID and tenant scoping.'} />
                  </div>
                  <Input
                    value={sysConfig?.tenancy_enabled === undefined ? '' : String(sysConfig?.tenancy_enabled)}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), tenancy_enabled: e.target.value === 'true' })}
                    placeholder="true/false"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Async jobs enabled</Label>
                    <HelpTip text={'Enable worker queue for heavy jobs.'} />
                  </div>
                  <Input
                    value={sysConfig?.async_jobs_enabled === undefined ? '' : String(sysConfig?.async_jobs_enabled)}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), async_jobs_enabled: e.target.value === 'true' })}
                    placeholder="true/false"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Async-only heavy endpoints</Label>
                    <HelpTip text={'Force heavy endpoints to use async jobs.'} />
                  </div>
                  <Input
                    value={
                      sysConfig?.async_only_heavy_endpoints === undefined ? '' : String(sysConfig?.async_only_heavy_endpoints)
                    }
                    onChange={(e) =>
                      setSysConfig({ ...(sysConfig ?? {}), async_only_heavy_endpoints: e.target.value === 'true' })
                    }
                    placeholder="true/false"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Connectors (csv)</Label>
                    <HelpTip text={'Comma-separated enabled connectors. Example: glpi, service_now.'} />
                  </div>
                  <Input
                    value={(sysConfig?.connectors ?? []).join(', ')}
                    onChange={(e) =>
                      setSysConfig({
                        ...(sysConfig ?? {}),
                        connectors: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="glpi, service_now"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Enabled frameworks (csv)</Label>
                    <HelpTip text={'Comma-separated framework keys. Example: dora, nis2, iso27001, soc2, gxp.'} />
                  </div>
                  <Input
                    value={(sysConfig?.enabled_frameworks ?? []).join(', ')}
                    onChange={(e) =>
                      setSysConfig({
                        ...(sysConfig ?? {}),
                        enabled_frameworks: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="dora, nis2, iso27001"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Default max runs</Label>
                    <HelpTip text={'Maximum runs retained per tenant. Example: 100.'} />
                  </div>
                  <Input
                    value={sysConfig?.default_max_runs ?? ''}
                    onChange={(e) => setSysConfig({ ...(sysConfig ?? {}), default_max_runs: Number(e.target.value) || 0 })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Default max reports</Label>
                    <HelpTip text={'Maximum reports retained per tenant. Example: 50.'} />
                  </div>
                  <Input
                    value={sysConfig?.default_max_reports ?? ''}
                    onChange={(e) =>
                      setSysConfig({ ...(sysConfig ?? {}), default_max_reports: Number(e.target.value) || 0 })
                    }
                    placeholder="50"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Default retention days</Label>
                    <HelpTip text={'Retention window in days. Example: 30.'} />
                  </div>
                  <Input
                    value={sysConfig?.default_retention_days ?? ''}
                    onChange={(e) =>
                      setSysConfig({ ...(sysConfig ?? {}), default_retention_days: Number(e.target.value) || 0 })
                    }
                    placeholder="30"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {envVarKeys.map((key) => (
                  <div key={key}>
                    <div className="flex items-center gap-2">
                      <Label>{key}</Label>
                      <HelpTip text={`Optional override for ${key}. Leave blank to keep current.`} />
                    </div>
                    <Input
                      value={envValues[key] ?? ''}
                      onChange={(e) => setEnvValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="value"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={sysLoading || !!busy}>
                  {sysLoading || busy ? busy ?? 'Saving...' : 'Save to database'}
                </Button>
                {notices ? <div className="text-sm text-emerald-300">{notices}</div> : null}
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {activeTab === 'tenants' ? (
        <>
          <Card>
            <div className="flex items-center gap-2">
              <Label>Tenants & secrets (DB-backed)</Label>
              <HelpTip text={'Manage per-tenant config and secrets stored in the database (admin role required).'} />
            </div>
            <p className="mt-2 text-sm text-slate-400">Config is saved to /admin/db/tenants and /admin/db/tenants/{'<id>'}/secrets.</p>
            {errors.tenants ? <ErrorBox title="Tenant error" detail={errors.tenants} /> : null}
            {errors.secrets ? <ErrorBox title="Secret error" detail={errors.secrets} /> : null}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <div className="flex items-center gap-2">
                  <Label>Tenant ID</Label>
                  <HelpTip text={'Tenant identifier. Example: tenant-123.'} />
                </div>
                <Input value={tenantIdInput} onChange={(e) => setTenantIdInput(e.target.value)} placeholder="tenant-123" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Secret name</Label>
                  <HelpTip text={'Secret key name. Example: api-token.'} />
                </div>
                <Input value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder="api-token" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Secret value</Label>
                  <HelpTip text={'Secret value stored encrypted in the DB.'} />
                </div>
                <Input
                  type="password"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="********"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <Label>Tenant metadata (JSON)</Label>
                  <HelpTip text={'Optional JSON metadata for tenant. Example: {"region":"us"}.'} />
                </div>
                <Textarea
                  rows={4}
                  value={tenantMeta}
                  onChange={(e) => setTenantMeta(e.target.value)}
                  placeholder='{"region": "us"}'
                />
              </div>
              <div className="space-y-2 text-sm text-slate-400">
                <div>Secrets require COMPLIANCE_SECRET_KEY set on the API.</div>
                <div>Metadata must be valid JSON; leave blank to skip.</div>
                <div>{busy ? `Working: ${busy}` : ''}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => void saveTenant()} disabled={!tenantIdInput.trim() || !!busy}>
                Save tenant
              </Button>
              <Button
                onClick={() => void saveSecret()}
                disabled={!tenantIdInput.trim() || !secretName.trim() || !secretValue.trim() || !!busy}
              >
                Save secret
              </Button>
              <Button onClick={() => void refreshSecrets(tenantIdInput.trim())} disabled={!tenantIdInput.trim()}>
                Refresh secrets
              </Button>
              <Button onClick={() => void refreshTenants()}>Refresh tenants</Button>
              {notices ? <div className="text-sm text-emerald-300">{notices}</div> : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Tenants</Label>
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  {tenants.length === 0 ? <div className="text-slate-400">No tenants.</div> : null}
                  {tenants.map((t) => (
                    <div key={t.tenant_id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <div className="font-semibold">{t.tenant_id}</div>
                      <div className="text-xs text-slate-400">{t.display_name || 'n/a'}</div>
                      <div className="text-xs text-slate-400">Status: {t.status || 'n/a'}</div>
                      <div className="text-xs text-slate-400">DB: {t.db_url || 'n/a'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Secrets for tenant</Label>
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  {secrets.length === 0 ? <div className="text-slate-400">No secrets.</div> : null}
                  {secrets.map((s) => (
                    <div key={s.name} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-400">Updated: {s.updated_at}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Label>User & role management</Label>
              <HelpTip text={'Invite users, assign roles (admin/reporter/reader/auditor/worker), and bind roles to tenants/resources.'} />
            </div>
            <p className="mt-2 text-sm text-slate-400">Backed by /admin/db/users and /admin/db/rbac/bindings.</p>
            {errors.users ? <ErrorBox title="User error" detail={errors.users} /> : null}
            {errors.bindings ? <ErrorBox title="Binding error" detail={errors.bindings} /> : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <Label>User email / subject</Label>
                  <HelpTip text={'Unique user identifier, usually email.'} />
                </div>
                <Input value={userSubject} onChange={(e) => setUserSubject(e.target.value)} placeholder="alice@example.com" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>User roles (csv)</Label>
                  <HelpTip text={'Comma-separated roles. Example: admin, reporter, auditor.'} />
                </div>
                <Input value={userRoleList} onChange={(e) => setUserRoleList(e.target.value)} placeholder="admin, reporter" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Password</Label>
                  <HelpTip text={'Required for local auth. Leave blank for SSO-only users.'} />
                </div>
                <Input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder={passwordRequired ? 'Required for local auth' : 'Optional'}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Role (first value used)</Label>
                  <HelpTip text={'Role used for binding creation. Example: reader.'} />
                </div>
                <Input value={userRoles} onChange={(e) => setUserRoles(e.target.value)} placeholder="admin, reporter" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Resource (optional)</Label>
                  <HelpTip text={'Optional run id to scope the binding. Example: run-2024-01.'} />
                </div>
                <Input value={bindingResource} onChange={(e) => setBindingResource(e.target.value)} placeholder="run-*, or specific run id" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Tenant (optional)</Label>
                  <HelpTip text={'Optional tenant id for the binding. Example: tenant-123.'} />
                </div>
                <Input value={bindingTenant} onChange={(e) => setBindingTenant(e.target.value)} placeholder="tenant-123" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => void saveUser()} disabled={!canSaveUser || !!busy}>
                Save user
              </Button>
              <Button onClick={() => void saveBinding()} disabled={!canSaveBinding || !!busy}>
                Save binding
              </Button>
              <Button onClick={() => void Promise.all([refreshUsers(), refreshBindings()])}>Refresh</Button>
              {notices ? <div className="text-sm text-emerald-300">{notices}</div> : null}
            </div>
            {!canSaveUser ? (
              <div className="text-xs text-rose-200">
                User subject and at least one role are required to save.
                {passwordRequired && !userPassword.trim() ? ' Password is required for local auth.' : ''}
              </div>
            ) : null}
            {!canSaveBinding ? (
              <div className="text-xs text-rose-200">Binding requires a subject and at least one role.</div>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Users</Label>
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  {users.length === 0 ? <div className="text-slate-400">No users.</div> : null}
                  {users.map((u) => (
                    <div key={u.subject} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{u.subject}</div>
                          <div className="text-xs text-slate-400">{u.email || 'n/a'}</div>
                          <div className="text-xs text-slate-400">Roles: {(u.roles ?? []).join(', ') || 'n/a'}</div>
                          <div className="text-xs text-slate-400">Status: {u.status || 'n/a'}</div>
                        </div>
                        <Button onClick={() => void deleteUser(u.subject)} disabled={!!busy}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Bindings</Label>
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  {bindings.length === 0 ? <div className="text-slate-400">No bindings.</div> : null}
                  {bindings.map((b) => (
                    <div key={b.binding_id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{b.role}</div>
                          <div className="text-xs text-slate-400">Subject: {b.subject || 'n/a'}</div>
                          <div className="text-xs text-slate-400">Tenant: {b.tenant_id || 'n/a'}</div>
                          <div className="text-xs text-slate-400">
                            Resource: {b.resource_type || 'n/a'} {b.resource_id || ''}
                          </div>
                        </div>
                        <Button onClick={() => void deleteBinding(b.binding_id)} disabled={!!busy}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}
