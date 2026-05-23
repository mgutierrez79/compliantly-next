'use client'
// Settings ▸ Authentication — the EDITABLE auth-policy knobs.
//
// Unlike the read-only Auth posture page, this one writes. It tunes
// the non-destructive policy knobs that the backend reads live
// (no restart): local auth on/off, MFA required, session TTL. These
// persist in the config store on top of the env defaults.
//
// The AUTH_ENABLED / DEV_MODE kill switches are deliberately NOT
// editable here — disabling authentication from inside the app's own
// admin UI is a footgun. They're shown read-only for context.

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Banner,
  Card,
  CardTitle,
  FormField,
  PrimaryButton,
  Select,
  Skeleton,
  TextInput,
  Topbar,
} from '../components/AttestivUi'
import { apiJson, ApiError } from '../lib/api'
import { useI18n } from '../lib/i18n'

type AuthPolicy = {
  local_auth_enabled: boolean
  mfa_required: boolean
  mtls_require_client_cert: boolean
  session_ttl_minutes: number
  env_defaults?: { local_auth_enabled: boolean; mfa_required: boolean; session_ttl_minutes: number }
  auth_enabled: boolean
  dev_mode: boolean
  oidc_configured: boolean
  // mTLS context so the UI can safely gate the require toggle.
  mtls_client_ca_configured?: boolean
  mtls_client_cert_seen?: boolean
  mtls_can_require?: boolean
  mtls_last_client_cert_seen?: string
}

export function AttestivAuthSettingsPage() {
  const { t } = useI18n()
  const [policy, setPolicy] = useState<AuthPolicy | null>(null)
  const [localAuth, setLocalAuth] = useState(false)
  const [mfa, setMfa] = useState(false)
  const [requireClientCert, setRequireClientCert] = useState(false)
  const [ttl, setTtl] = useState('60')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const hydrate = useCallback((p: AuthPolicy) => {
    setPolicy(p)
    setLocalAuth(!!p.local_auth_enabled)
    setMfa(!!p.mfa_required)
    setRequireClientCert(!!p.mtls_require_client_cert)
    setTtl(String(p.session_ttl_minutes ?? 60))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      hydrate(await apiJson<AuthPolicy>('/settings/auth-policy'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load auth policy (requires admin).')
    } finally {
      setLoading(false)
    }
  }, [hydrate])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await apiJson<AuthPolicy>('/settings/auth-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_auth_enabled: localAuth,
          mfa_required: mfa,
          mtls_require_client_cert: requireClientCert,
          session_ttl_minutes: Number(ttl) || 0,
        }),
      })
      hydrate(updated)
      setNotice('Authentication policy saved — applies immediately.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Topbar title={t('Authentication', 'Authentication')} />
      <div className="attestiv-content">
        <Banner tone="info" title={t('What you can change here', 'What you can change here')}>
          {t(
            'These policy knobs apply live (no restart) and persist over the environment defaults. The AUTH_ENABLED and DEV_MODE kill switches are intentionally environment-only — shown read-only below — so authentication cannot be turned off from inside the admin UI.',
            'These policy knobs apply live (no restart) and persist over the environment defaults. The AUTH_ENABLED and DEV_MODE kill switches are intentionally environment-only — shown read-only below — so authentication cannot be turned off from inside the admin UI.',
          )}
        </Banner>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}

        {loading ? (
          <Skeleton lines={6} height={32} />
        ) : !policy ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('No policy data', 'No policy data')}</div>
        ) : (
          <>
            <Card style={{ marginTop: 10 }}>
              <CardTitle>{t('Policy (editable)', 'Policy (editable)')}</CardTitle>

              <FormField
                label={t('Local username/password login', 'Local username/password login')}
                hint={t('Enables the Local tab on the sign-in page. Create users in Settings → Users & RBAC.', 'Enables the Local tab on the sign-in page. Create users in Settings → Users & RBAC.')}
              >
                <Select value={localAuth ? 'true' : 'false'} onChange={(e) => setLocalAuth(e.target.value === 'true')}>
                  <option value="true">{t('Enabled', 'Enabled')}</option>
                  <option value="false">{t('Disabled', 'Disabled')}</option>
                </Select>
              </FormField>

              <FormField
                label={t('MFA required', 'MFA required')}
                hint={t('Enforces the IdP MFA (amr) gate AND blocks static admin API keys from holding admin (they carry no second factor).', 'Enforces the IdP MFA (amr) gate AND blocks static admin API keys from holding admin (they carry no second factor).')}
              >
                <Select value={mfa ? 'true' : 'false'} onChange={(e) => setMfa(e.target.value === 'true')}>
                  <option value="false">{t('Not required', 'Not required')}</option>
                  <option value="true">{t('Required', 'Required')}</option>
                </Select>
              </FormField>

              <FormField
                label={t('Require client certificate (mTLS)', 'Require client certificate (mTLS)')}
                hint={t('When required, the API rejects every TLS connection that does not present a CA-signed client certificate. Defense-in-depth on top of API keys / SSO.', 'When required, the API rejects every TLS connection that does not present a CA-signed client certificate. Defense-in-depth on top of API keys / SSO.')}
              >
                <Select
                  value={requireClientCert ? 'true' : 'false'}
                  onChange={(e) => setRequireClientCert(e.target.value === 'true')}
                  disabled={!policy.mtls_client_ca_configured}
                >
                  <option value="false">{t('Not required (verify if presented)', 'Not required (verify if presented)')}</option>
                  <option value="true">{t('Required', 'Required')}</option>
                </Select>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                  {!policy.mtls_client_ca_configured
                    ? t('mTLS is not configured on this deployment (no client CA).', 'mTLS is not configured on this deployment (no client CA).')
                    : (
                      <>
                        {t('Client cert seen recently', 'Client cert seen recently')}:{' '}
                        <strong>{policy.mtls_client_cert_seen ? t('yes', 'yes') : t('no', 'no')}</strong>
                        {policy.mtls_last_client_cert_seen
                          ? ` (${t('last', 'last')}: ${policy.mtls_last_client_cert_seen.slice(0, 19).replace('T', ' ')}Z)`
                          : ''}
                        {!policy.mtls_can_require
                          ? ' — ' + t('cannot require until a client cert has been observed (the proxy must present one first).', 'cannot require until a client cert has been observed (the proxy must present one first).')
                          : ''}
                      </>
                    )}
                </div>
                {requireClientCert && !policy.mtls_require_client_cert ? (
                  <Banner tone="warning">
                    {t(
                      'Enabling this rejects EVERY connection without a client certificate — including vendor webhooks (e.g. Palo Alto CEF) and direct CLI/API calls. Make sure the Next.js proxy presents its client cert (Trust store → Platform TLS certificates) and that any direct API consumers have one. Recovery if locked out: run the pilot-diagnostic workflow with recover_mtls_required=true.',
                      'Enabling this rejects EVERY connection without a client certificate — including vendor webhooks (e.g. Palo Alto CEF) and direct CLI/API calls. Make sure the Next.js proxy presents its client cert (Trust store → Platform TLS certificates) and that any direct API consumers have one. Recovery if locked out: run the pilot-diagnostic workflow with recover_mtls_required=true.',
                    )}
                  </Banner>
                ) : null}
              </FormField>

              <FormField
                label={t('Session lifetime (minutes)', 'Session lifetime (minutes)')}
                hint={t('How long a sign-in session stays valid. 5–10080 (1 week).', 'How long a sign-in session stays valid. 5–10080 (1 week).')}
              >
                <TextInput type="number" value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="60" />
              </FormField>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <PrimaryButton disabled={busy} onClick={save}>
                  {busy ? t('Saving…', 'Saving…') : t('Save', 'Save')}
                </PrimaryButton>
              </div>
            </Card>

            <Card style={{ marginTop: 10 }}>
              <CardTitle right={<Badge tone="gray">{t('environment-only', 'environment-only')}</Badge>}>
                {t('Kill switches (read-only)', 'Kill switches (read-only)')}
              </CardTitle>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
                <tbody>
                  <PolicyRow label={t('Authentication enabled', 'Authentication enabled')} value={policy.auth_enabled ? 'yes' : 'NO'} tone={policy.auth_enabled ? undefined : 'amber'} />
                  <PolicyRow label={t('Dev mode', 'Dev mode')} value={policy.dev_mode ? 'yes' : 'no'} tone={policy.dev_mode ? 'amber' : undefined} />
                  <PolicyRow label={t('OIDC configured', 'OIDC configured')} value={policy.oidc_configured ? 'yes' : 'no'} />
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                {t(
                  'Set via COMPLIANCE_AUTH_ENABLED / COMPLIANCE_DEV_MODE in the deployment environment. OIDC issuer/client is configured per-environment and applies on restart.',
                  'Set via COMPLIANCE_AUTH_ENABLED / COMPLIANCE_DEV_MODE in the deployment environment. OIDC issuer/client is configured per-environment and applies on restart.',
                )}
              </p>
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function PolicyRow({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <tr style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <td style={{ padding: '8px', color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, width: 240 }}>{label}</td>
      <td style={{ padding: '8px', color: tone === 'amber' ? 'var(--color-status-amber-mid)' : 'var(--color-text-primary)' }}>
        <code style={{ fontSize: 12 }}>{value}</code>
      </td>
    </tr>
  )
}
