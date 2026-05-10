'use client'

// Attestiv login.
//
// Cream-themed sign-in for the console. We expose three sign-in modes
// so a single deployment can satisfy operator, auditor, and CI use
// cases with the same page:
//
//   - Local: username + password against /v1/auth/login. The token is
//     stored in localStorage and used as a Bearer for every subsequent
//     API call. Best for pilot-stage deployments without an IdP.
//   - SSO: OIDC issuer + client. The user is redirected to the IdP and
//     comes back through /auth/callback. Best for production.
//   - API key: paste a long-lived key. Used by smoke tests, CI runs,
//     and trusted automation; not a normal user path.
//
// Why three modes on one page rather than separate routes: the wiring
// information (API base URL + tenant) is shared. Splitting the routes
// would duplicate fields and let the user save inconsistent settings
// per mode. One page = one source of truth for the connection.
//
// Why not a multi-step wizard (mockup specced 3 screens — email/SSO,
// tenant, MFA): MFA isn't enforced server-side yet (it's on the 4b
// backlog) and a true tenant-select requires server-driven discovery
// we don't have. Showing fake steps would set expectations the
// product can't honor. The tabbed treatment is honest about what
// works today and matches the rest of the Attestiv visual language.

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Card,
  FormField,
  GhostButton,
  PrimaryButton,
  TextInput,
} from '../components/AttestivUi'
import { defaultSettings, loadSettings, saveSettings } from '../lib/settings'
import { setSessionMarker } from '../lib/session'

type Mode = 'local' | 'sso' | 'api-key'

type LocalLoginResponse = {
  access_token: string
  token_type: string
  expires_at: string
}

const SSO_PRESETS = [
  {
    label: 'Microsoft Entra ID',
    issuer: 'https://login.microsoftonline.com/<tenant-id>/v2.0',
    scope: 'openid profile email',
  },
  {
    label: 'Google',
    issuer: 'https://accounts.google.com',
    scope: 'openid profile email',
  },
]

export function AttestivLoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('local')
  const [settings, setSettings] = useState(defaultSettings)
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl)
  const [tenantId, setTenantId] = useState(settings.tenantId)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [issuer, setIssuer] = useState(settings.oidcIssuer)
  const [clientId, setClientId] = useState(settings.oidcClientId)
  const [scope, setScope] = useState(settings.oidcScope)
  const [localSubject, setLocalSubject] = useState('')
  const [localPassword, setLocalPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    const saved = loadSettings()
    setSettings(saved)
    setApiBaseUrl(saved.apiBaseUrl)
    setApiKey(saved.apiKey)
    setTenantId(saved.tenantId)
    setIssuer(saved.oidcIssuer)
    setClientId(saved.oidcClientId)
    setScope(saved.oidcScope)
  }, [])

  function redirectTarget(): string {
    if (typeof window === 'undefined') return '/dashboard'
    const search = new URLSearchParams(window.location.search)
    const next = search.get('next')
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')) {
      return next
    }
    return '/dashboard'
  }

  async function onLocalSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (!apiBaseUrl.trim() || !localSubject.trim() || !localPassword) {
      setError('API base URL, username, and password are required.')
      return
    }
    setBusy(true)
    try {
      const baseUrl = apiBaseUrl.trim().replace(/\/+$/, '')
      const response = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: localSubject.trim(), password: localPassword }),
        // Phase 4b: the server sets an httpOnly session cookie on
        // success. credentials:'include' is what tells the browser to
        // accept and store cross-origin Set-Cookie. Without this the
        // cookie is silently dropped and every subsequent API call
        // would 401.
        credentials: 'include',
      })
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        throw new Error(bodyText || `${response.status} ${response.statusText}`)
      }
      // We deliberately do NOT read access_token from the response and
      // park it in localStorage. The credential lives in the httpOnly
      // cookie now; localStorage was the XSS surface 4b removes.
      saveSettings({
        ...settings,
        apiBaseUrl: apiBaseUrl.trim(),
        tenantId: tenantId.trim(),
        authMode: 'local',
        apiKey: '',
        localToken: '',
        oidcIssuer: issuer.trim(),
        oidcClientId: clientId.trim(),
        oidcScope: scope.trim() || settings.oidcScope,
        oidcAudience: settings.oidcAudience,
      })
      setInfo('Signed in. Redirecting...')
      router.push(redirectTarget())
    } catch (err: any) {
      setError(err?.message ?? 'Local login failed')
    } finally {
      setBusy(false)
    }
  }

  function onApiKeySubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (!apiBaseUrl.trim() || !apiKey.trim()) {
      setError('API base URL and API key are required.')
      return
    }
    saveSettings({
      ...settings,
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      tenantId: tenantId.trim(),
      authMode: 'apiKey',
      localToken: '',
      oidcIssuer: issuer.trim(),
      oidcClientId: clientId.trim(),
      oidcScope: scope.trim() || settings.oidcScope,
      oidcAudience: settings.oidcAudience,
    })
    setSessionMarker()
    setInfo('Saved. Redirecting...')
    router.push(redirectTarget())
  }

  function onSsoSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (!apiBaseUrl.trim() || !issuer.trim() || !clientId.trim()) {
      setError('API base URL, OIDC issuer, and client ID are required.')
      return
    }
    saveSettings({
      ...settings,
      apiBaseUrl: apiBaseUrl.trim(),
      tenantId: tenantId.trim(),
      authMode: 'oidc',
      apiKey: '',
      localToken: '',
      oidcIssuer: issuer.trim(),
      oidcClientId: clientId.trim(),
      oidcScope: scope.trim() || settings.oidcScope,
      oidcAudience: settings.oidcAudience,
    })
    setSessionMarker()
    setInfo('OIDC settings saved. Redirecting...')
    router.push(redirectTarget())
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-background-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <BrandHeader />

        <Card style={{ padding: '20px 22px' }}>
          <ModeTabs mode={mode} onChange={setMode} />

          <SharedFields
            apiBaseUrl={apiBaseUrl}
            tenantId={tenantId}
            setApiBaseUrl={setApiBaseUrl}
            setTenantId={setTenantId}
          />

          {mode === 'local' ? (
            <form onSubmit={onLocalSubmit}>
              <FormField label="Username">
                <TextInput
                  value={localSubject}
                  onChange={(event) => setLocalSubject(event.target.value)}
                  placeholder="admin@acme.example"
                  autoComplete="username"
                />
              </FormField>
              <FormField label="Password">
                <TextInput
                  type="password"
                  value={localPassword}
                  onChange={(event) => setLocalPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </FormField>
              <SubmitRow busy={busy} label="Sign in" />
            </form>
          ) : null}

          {mode === 'api-key' ? (
            <form onSubmit={onApiKeySubmit}>
              <FormField
                label="API key (Bearer)"
                hint="Use a key with the role required for the pages you'll visit. CI keys are typically scoped to reporter."
              >
                <TextInput
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="key-admin / key-reporter / ..."
                />
              </FormField>
              <SubmitRow busy={busy} label="Save and continue" />
            </form>
          ) : null}

          {mode === 'sso' ? (
            <form onSubmit={onSsoSubmit}>
              <FormField label="OIDC issuer">
                <TextInput
                  value={issuer}
                  onChange={(event) => setIssuer(event.target.value)}
                  placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0"
                />
              </FormField>
              <FormField label="Client ID">
                <TextInput
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="client-id from IdP"
                />
              </FormField>
              <FormField label="Scope">
                <TextInput
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  placeholder="openid profile email"
                />
              </FormField>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {SSO_PRESETS.map((preset) => (
                  <GhostButton
                    key={preset.label}
                    onClick={() => {
                      setIssuer(preset.issuer)
                      setScope(preset.scope)
                      setInfo(`Preset applied: ${preset.label}`)
                    }}
                  >
                    {preset.label}
                  </GhostButton>
                ))}
              </div>
              <SubmitRow busy={busy} label="Save and redirect" />
            </form>
          ) : null}

          {error ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--color-status-red-deep)',
                background: 'var(--color-status-red-bg)',
                padding: '8px 10px',
                borderRadius: 'var(--border-radius-md)',
              }}
            >
              {error}
            </div>
          ) : null}
          {info ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--color-status-blue-deep)',
                background: 'var(--color-status-blue-bg)',
                padding: '8px 10px',
                borderRadius: 'var(--border-radius-md)',
              }}
            >
              {info}
            </div>
          ) : null}
        </Card>

        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            textAlign: 'center',
            marginTop: 14,
            lineHeight: 1.5,
          }}
        >
          New tenant?{' '}
          <a
            href="/onboarding"
            style={{ color: 'var(--color-brand-blue)', textDecoration: 'none', fontWeight: 500 }}
          >
            Run first-time setup
          </a>
          .
        </div>
      </div>
    </div>
  )
}

function BrandHeader() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'var(--color-brand-navy)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <i
          className="ti ti-shield-check"
          aria-hidden="true"
          style={{ color: 'var(--color-brand-blue-pale)', fontSize: 28 }}
        />
      </div>
      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>Attestiv</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        Sign in to the compliance console
      </div>
    </div>
  )
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (next: Mode) => void }) {
  const tabs: Array<{ value: Mode; label: string; icon: string }> = [
    { value: 'local', label: 'Local', icon: 'ti-key' },
    { value: 'sso', label: 'SSO', icon: 'ti-id' },
    { value: 'api-key', label: 'API key', icon: 'ti-bolt' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        background: 'var(--color-background-secondary)',
        borderRadius: 'var(--border-radius-md)',
        padding: 3,
        marginBottom: 16,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.value === mode
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              padding: '6px 10px',
              borderRadius: 'var(--border-radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: active ? 'var(--color-background-primary)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            <i className={`ti ${tab.icon}`} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function SharedFields({
  apiBaseUrl,
  tenantId,
  setApiBaseUrl,
  setTenantId,
}: {
  apiBaseUrl: string
  tenantId: string
  setApiBaseUrl: (v: string) => void
  setTenantId: (v: string) => void
}) {
  return (
    <>
      <FormField label="API base URL" hint="Where the Attestiv backend is reachable from this browser.">
        <TextInput
          value={apiBaseUrl}
          onChange={(event) => setApiBaseUrl(event.target.value)}
          placeholder="http://127.0.0.1:8001"
          autoComplete="off"
        />
      </FormField>
      <FormField label="Tenant" hint="Lower-case slug. Leave empty for single-tenant deployments.">
        <TextInput
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          placeholder="default"
          autoComplete="off"
        />
      </FormField>
    </>
  )
}

function SubmitRow({ busy, label }: { busy: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
      <PrimaryButton type="submit" disabled={busy}>
        {busy ? 'Working…' : label}
        <i className="ti ti-arrow-right" aria-hidden="true" />
      </PrimaryButton>
    </div>
  )
}

