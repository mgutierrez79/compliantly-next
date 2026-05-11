'use client';
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button, HelpTip, Input, Label } from '../components/Ui'
import { defaultSettings, loadSettings, saveSettings } from '../lib/settings'
import { setSessionMarker } from '../lib/session'
import loginLogo from '../assets/Login-logo.png'

import { useI18n } from '../lib/i18n';

type LocalLoginResponse = {
  access_token: string
  token_type: string
  expires_at: string
}

export function LoginPage() {
  const {
    t
  } = useI18n();

  const router = useRouter()
  const [settings, setSettings] = useState(defaultSettings)
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [tenantId, setTenantId] = useState(settings.tenantId)
  const [issuer, setIssuer] = useState(settings.oidcIssuer)
  const [clientId, setClientId] = useState(settings.oidcClientId)
  const [scope, setScope] = useState(settings.oidcScope)
  const [localSubject, setLocalSubject] = useState('')
  const [localPassword, setLocalPassword] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const savedSettings = loadSettings()
    setSettings(savedSettings)
    setApiBaseUrl(savedSettings.apiBaseUrl)
    setApiKey(savedSettings.apiKey)
    setTenantId(savedSettings.tenantId)
    setIssuer(savedSettings.oidcIssuer)
    setClientId(savedSettings.oidcClientId)
    setScope(savedSettings.oidcScope)
  }, [])

  // redirectTarget reads ?next=... from the URL so middleware-driven
  // redirects deliver the user back to the page they were trying to
  // reach. We restrict the target to absolute paths within our origin
  // to avoid open-redirect abuse.
  function redirectTarget(): string {
    if (typeof window === 'undefined') return '/health'
    const search = new URLSearchParams(window.location.search)
    const next = search.get('next')
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')) {
      return next
    }
    return '/health'
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const next = {
      ...settings,
      apiBaseUrl: apiBaseUrl.trim() || settings.apiBaseUrl,
      apiKey: apiKey.trim(),
      localToken: '',
      tenantId: tenantId.trim(),
      authMode: apiKey.trim() ? settings.authMode : 'oidc',
      oidcIssuer: issuer.trim(),
      oidcClientId: clientId.trim(),
      oidcScope: scope.trim() || settings.oidcScope,
      oidcAudience: settings.oidcAudience,
    }
    saveSettings(next)
    setSessionMarker()
    setMessage('Saved. Redirecting...')
    router.push(redirectTarget())
  }

  async function onLocalLogin(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!apiBaseUrl.trim() || !localSubject.trim() || !localPassword) {
      setError('API base URL, username, and password are required.')
      return
    }
    setLocalBusy(true)
    try {
      const baseUrl = apiBaseUrl.trim().replace(/\/+$/, '')
      const response = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: localSubject.trim(), password: localPassword }),
      })
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        throw new Error(bodyText || `${response.status} ${response.statusText}`)
      }
      const payload = (await response.json()) as LocalLoginResponse
      saveSettings({
        ...settings,
        apiBaseUrl: apiBaseUrl.trim(),
        tenantId: tenantId.trim(),
        authMode: 'local',
        apiKey: '',
        localToken: payload.access_token,
        oidcIssuer: issuer.trim(),
        oidcClientId: clientId.trim(),
        oidcScope: scope.trim() || settings.oidcScope,
        oidcAudience: settings.oidcAudience,
      })
      setSessionMarker()
      setMessage('Logged in. Redirecting...')
      router.push(redirectTarget())
    } catch (err: any) {
      setError(err.message ?? 'Local login failed')
    } finally {
      setLocalBusy(false)
    }
  }

  const presets: Array<{
    label: string
    issuer: string
    clientId: string
    scope?: string
  }> = [
    {
      label: 'Microsoft Entra ID',
      issuer: 'https://login.microsoftonline.com/<tenant-id>/v2.0',
      clientId: settings.oidcClientId || '',
      scope: 'openid profile email',
    },
    {
      label: 'Google',
      issuer: 'https://accounts.google.com',
      clientId: settings.oidcClientId || '',
      scope: 'openid profile email',
    },
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1224] via-[#0c1a30] to-[#0f2540] px-4">
      <div className="w-full max-w-md rounded-2xl bg-[#0f1f36]/90 p-8 shadow-2xl shadow-black/30 border border-[#1f365a]">
        <div className="flex flex-col items-center gap-3 mb-6">
          <Image src={loginLogo} alt="Attestiv" className="h-16 w-auto drop-shadow" priority />
          <div className="text-sm text-slate-300">{t(
            'Sign in to configure your API access',
            'Sign in to configure your API access'
          )}</div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('API base URL', 'API base URL')}</Label>
              <HelpTip text={'Base URL of the API. Example: https://localhost:8001'} />
            </div>
            <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8001" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('API key (Bearer)', 'API key (Bearer)')}</Label>
              <HelpTip text={'API key with roles. Example: key-admin or key-smoke'} />
            </div>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('key-admin or key-smoke', 'key-admin or key-smoke')} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('Tenant ID (optional)', 'Tenant ID (optional)')}</Label>
              <HelpTip text={'Tenant scope for multi-tenant mode. Example: acme'} />
            </div>
            <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="default" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('OIDC issuer', 'OIDC issuer')}</Label>
              <HelpTip text={'OIDC authority URL. Example: https://login.microsoftonline.com/<tenant-id>/v2.0'} />
            </div>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('OIDC client ID', 'OIDC client ID')}</Label>
              <HelpTip text={'Client ID registered in your IdP application.'} />
            </div>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t('client-id from IdP', 'client-id from IdP')} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('Scope', 'Scope')}</Label>
              <HelpTip text={'OIDC scopes. Example: openid profile email'} />
            </div>
            <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder={t('openid profile email', 'openid profile email')} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setIssuer(preset.issuer)
                  setClientId(preset.clientId)
                  if (preset.scope) setScope(preset.scope)
                  setMessage(`Preset applied: ${preset.label}`)
                }}
                className="rounded-md border border-[#274266] bg-[#13243c] px-3 py-2 text-sm text-slate-100 hover:bg-[#1a2f4d]"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={!apiBaseUrl.trim()}>
            {t('Save and continue', 'Save and continue')}
          </Button>
        </form>
        <div className="mt-6 border-t border-[#1f365a] pt-6">
          <div className="text-sm font-semibold text-slate-100">{t('Local login', 'Local login')}</div>
          <p className="mt-1 text-xs text-slate-400">{t(
            'Use a local username + password when local auth is enabled.',
            'Use a local username + password when local auth is enabled.'
          )}</p>
          <form className="mt-4 space-y-3" onSubmit={onLocalLogin}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>{t('Username', 'Username')}</Label>
                <HelpTip text={'Local user subject. Example: admin@example.com'} />
              </div>
              <Input value={localSubject} onChange={(e) => setLocalSubject(e.target.value)} placeholder={t('admin@example.com', 'admin@example.com')} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>{t('Password', 'Password')}</Label>
                <HelpTip text={'Local user password for /v1/auth/login.'} />
              </div>
              <Input
                type="password"
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                placeholder={t('Enter your password', 'Enter your password')}
              />
            </div>
            <Button type="submit" disabled={localBusy}>
              {localBusy ? 'Signing in...' : 'Sign in locally'}
            </Button>
          </form>
        </div>
        {error ? <div className="mt-4 text-sm text-rose-200">{error}</div> : null}
        {message ? <div className="mt-2 text-sm text-slate-200">{message}</div> : null}
        <div className="mt-6 text-xs text-slate-400">
          {t(
            'Use an API key with the right roles (e.g., admin for admin pages). You can change these values later in Settings.',
            'Use an API key with the right roles (e.g., admin for admin pages). You can change these values later in Settings.'
          )}
        </div>
      </div>
    </div>
  );
}
