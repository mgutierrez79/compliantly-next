'use client';
// API keys management.
//
// Keys are configured via the COMPLIANCE_AUTH_API_KEYS env var on the
// server, not provisioned through an API. There's no rotate-button
// here that talks to a key-rotation endpoint because no such endpoint
// exists yet — that's a deliberate pilot trade-off (env-only keys =
// simpler trust boundary, no admin endpoint to harden). What this
// page does provide:
//
//   - The current principal's identity, roles, and tenant binding
//     (read from /v1/auth/me) so the operator can verify which key
//     they're hitting the API with.
//   - The key-id format contract (key|subject|roles|tenant) so a new
//     entry can be added correctly.
//   - The Phase 5 contract that non-admin keys MUST bind a tenant —
//     calling this out reduces the chance of a misconfigured key
//     being silently accepted.

import { useEffect, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  GhostButton,
  SignatureBox,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n';

type Principal = {
  subject: string
  roles: string[]
  tenant_id?: string
}

const ROLE_TONE: Record<string, 'navy' | 'blue' | 'green' | 'gray'> = {
  admin: 'navy',
  auditor: 'blue',
  engineer: 'green',
  reporter: 'gray',
  reader: 'gray',
  worker: 'gray',
}

export function AttestivApiKeysPage() {
  const {
    t
  } = useI18n();

  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch('/auth/me')
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const body = (await response.json()) as Principal
        if (!cancelled) setPrincipal(body)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load identity')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Topbar
        title={t('API keys', 'API keys')}
        right={
          <GhostButton onClick={() => undefined}>
            <i className="ti ti-book" aria-hidden="true" />
            {t('Tenant onboarding runbook', 'Tenant onboarding runbook')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 12,
          }}
        >
          <Card>
            <CardTitle>{t('Current credential', 'Current credential')}</CardTitle>
            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('Loading…', 'Loading…')}</div>
            ) : error ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-status-red-deep)',
                  background: 'var(--color-status-red-bg)',
                  padding: '8px 10px',
                  borderRadius: 'var(--border-radius-md)',
                }}
              >
                {error}
              </div>
            ) : principal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <KV label={t('Subject', 'Subject')} value={principal.subject} mono />
                <KV label={t('Tenant', 'Tenant')} value={principal.tenant_id || '—'} mono={!!principal.tenant_id} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{t('Roles', 'Roles')}</span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {principal.roles.map((role) => (
                      <Badge key={role} tone={ROLE_TONE[role.toLowerCase()] ?? 'gray'}>
                        {role}
                      </Badge>
                    ))}
                  </span>
                </div>
                {!principal.tenant_id && !principal.roles.includes('admin') ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-status-amber-text)',
                      background: 'var(--color-status-amber-bg)',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-md)',
                      marginTop: 4,
                    }}
                  >
                    {t(
                      'Non-admin keys MUST bind a tenant. This key has no tenant — every tenant-scoped endpoint will reject it.',
                      'Non-admin keys MUST bind a tenant. This key has no tenant — every tenant-scoped endpoint will reject it.'
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardTitle>{t('Key entry format', 'Key entry format')}</CardTitle>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              {t(
                'Keys are a comma-separated list in the',
                'Keys are a comma-separated list in the'
              )} <code>COMPLIANCE_AUTH_API_KEYS</code> {t(
                'env var.\n              Each entry has four pipe-delimited fields:',
                'env var.\n              Each entry has four pipe-delimited fields:'
              )}
            </div>
            <SignatureBox label={t('Format', 'Format')} value="key|subject|roles|tenant" />
            <div style={{ marginTop: 8 }}>
              <SignatureBox label={t('Example', 'Example')} value="k-7a3f|reporter@acme.example|reporter|acme" />
            </div>
            <ul
              style={{
                margin: '12px 0 0',
                paddingLeft: 18,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.7,
              }}
            >
              <li><strong>key</strong> {t(
                  '— the bearer string the client sends. Treat as a credential.',
                  '— the bearer string the client sends. Treat as a credential.'
                )}</li>
              <li><strong>subject</strong> {t(
                  '— identity for audit-trail attribution.',
                  '— identity for audit-trail attribution.'
                )}</li>
              <li><strong>roles</strong> {t(
                  '— semicolon-separated. Any of admin, engineer, reporter, auditor, reader, worker.',
                  '— semicolon-separated. Any of admin, engineer, reporter, auditor, reader, worker.'
                )}</li>
              <li><strong>tenant</strong> {t(
                  '— required for non-admin roles. Admin keys may omit it.',
                  '— required for non-admin roles. Admin keys may omit it.'
                )}</li>
            </ul>
          </Card>
        </div>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>{t('Rotation policy', 'Rotation policy')}</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 8px' }}>
              {t(
                'Rotate keys on a 90-day cadence and after any team change touching credentials.\n              The signing key (used to mint Ed25519 manifests) rotates separately — see the',
                'Rotate keys on a 90-day cadence and after any team change touching credentials.\n              The signing key (used to mint Ed25519 manifests) rotates separately — see the'
              )}
              <code> {t('docs/runbooks/key-rotation.md', 'docs/runbooks/key-rotation.md')}</code> {t(
                'runbook. Multi-key signing means\n              evidence signed before a rotation continues to verify.',
                'runbook. Multi-key signing means\n              evidence signed before a rotation continues to verify.'
              )}
            </p>
            <p style={{ margin: 0 }}>
              {t('When you rotate an API key, update', 'When you rotate an API key, update')} <code>COMPLIANCE_AUTH_API_KEYS</code>{t(
                ', restart\n              the API process, then revoke the old key entry on the next deploy. The frontend\n              re-prompts for credentials automatically when a request 401s.',
                ', restart\n              the API process, then revoke the old key entry on the next deploy. The frontend\n              re-prompts for credentials automatically when a request 401s.'
              )}
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontWeight: 500,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  )
}
