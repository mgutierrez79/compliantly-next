'use client';
// Trust store page — Settings ▸ Trust store.
//
// Per-tenant root CA bundles for the connector pipeline. Pilots that
// run connectors against internal appliances (Palo Alto Panorama,
// vCenter, PowerStore, ...) signed by a private CA upload that root
// here so verify_tls stays meaningful end-to-end — instead of
// telling users to disable TLS verification, the backend layers
// these CAs on top of the system trust store at probe time.
//
// Backend API:
//   GET    /v1/settings/trust-store/cas
//   POST   /v1/settings/trust-store/cas      body: {label, pem}
//   GET    /v1/settings/trust-store/cas/{id}
//   DELETE /v1/settings/trust-store/cas/{id}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  PrimaryButton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n'

type CABundleSummary = {
  id: string
  tenant_id?: string
  label: string
  fingerprint_sha256: string
  subject: string
  issuer: string
  not_before: string
  not_after: string
  created_at: string
  created_by?: string
}

// Roughly how long before expiry we surface a warning chip. Same
// heuristic as the cert-expiry helpers in siteregistry — 30 days
// is the "renew now" window, 90 is "plan ahead."
const EXPIRY_WARNING_DAYS = 30
const EXPIRY_NOTICE_DAYS = 90

export function AttestivTrustStorePage() {
  const { t } = useI18n()
  const router = useRouter()
  const [bundles, setBundles] = useState<CABundleSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [pemInput, setPemInput] = useState('')

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const response = await apiFetch('/settings/trust-store/cas')
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(extractMessage(body, response))
      }
      const body = await response.json()
      const list = Array.isArray(body?.bundles) ? body.bundles : []
      setBundles(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trust store')
      setBundles([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Read a .pem / .crt file directly so the operator does not have
  // to copy-paste a multi-line PEM into the textarea. We never read
  // anything beyond the chosen file, and the binary preview stays
  // client-side — the upload still flows through our normal
  // apiFetch + auth headers.
  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setPemInput(text)
      if (!labelInput.trim()) {
        // Convenience: use the filename (minus extension) as the
        // default label so a user dropping in "auxia-root-ca.pem"
        // doesn't have to type "Auxia root CA" twice.
        setLabelInput(file.name.replace(/\.[^.]+$/, ''))
      }
    }
    reader.readAsText(file)
  }

  async function upload() {
    if (!labelInput.trim() || !pemInput.trim()) {
      setError(t('Label and PEM are required.', 'Label and PEM are required.'))
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const response = await apiFetch('/settings/trust-store/cas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: labelInput.trim(), pem: pemInput }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(extractMessage(body, response))
      }
      setLabelInput('')
      setPemInput('')
      setInfo(t('Root CA uploaded.', 'Root CA uploaded.'))
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload CA')
    } finally {
      setBusy(false)
    }
  }

  async function remove(bundleID: string, label: string) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        t('Remove the CA "{label}"? Connectors that relied on it will fail TLS verification again.', 'Remove the CA "{label}"? Connectors that relied on it will fail TLS verification again.').replace('{label}', label),
      )
      if (!ok) return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const response = await apiFetch(`/settings/trust-store/cas/${encodeURIComponent(bundleID)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(extractMessage(body, response))
      }
      setInfo(t('Root CA removed.', 'Root CA removed.'))
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete CA')
    } finally {
      setBusy(false)
    }
  }

  const now = useMemo(() => new Date(), [])

  return (
    <>
      <Topbar
        title={t('Trust store', 'Trust store')}
        left={<Badge tone="navy">{t('admin only', 'admin only')}</Badge>}
        right={
          <GhostButton onClick={() => router.push('/settings')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> {t('Settings', 'Settings')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {info ? <Banner tone="success">{info}</Banner> : null}

        <Card>
          <CardTitle>{t('Why this matters', 'Why this matters')}</CardTitle>
          <p>
            {t(
              'Upload your corporate root CAs so connectors can verify internal appliances (Palo Alto Panorama, vCenter, PowerStore, etc.) without disabling TLS verification.',
              'Upload your corporate root CAs so connectors can verify internal appliances (Palo Alto Panorama, vCenter, PowerStore, etc.) without disabling TLS verification.',
            )}
          </p>
          <p style={{ marginTop: 8 }}>
            {t(
              'CAs are stored per tenant. They are layered on top of the system trust store at probe time, so verify_tls=true keeps its meaning against private CAs.',
              'CAs are stored per tenant. They are layered on top of the system trust store at probe time, so verify_tls=true keeps its meaning against private CAs.',
            )}
          </p>
        </Card>

        <Card>
          <CardTitle>{t('Upload a root CA', 'Upload a root CA')}</CardTitle>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'block' }}>
              <div className="attestiv-label">{t('Label', 'Label')}</div>
              <input
                type="text"
                value={labelInput}
                onChange={(event) => setLabelInput(event.target.value)}
                placeholder={t('Auxia Internal Root 2024', 'Auxia Internal Root 2024')}
                className="attestiv-input"
              />
            </label>
            <label style={{ display: 'block' }}>
              <div className="attestiv-label">{t('PEM file (.pem / .crt)', 'PEM file (.pem / .crt)')}</div>
              <input type="file" accept=".pem,.crt,.cer,application/x-pem-file,text/plain" onChange={onFileSelected} />
            </label>
            <label style={{ display: 'block' }}>
              <div className="attestiv-label">{t('Or paste PEM directly', 'Or paste PEM directly')}</div>
              <textarea
                rows={8}
                value={pemInput}
                onChange={(event) => setPemInput(event.target.value)}
                placeholder={'-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----'}
                className="attestiv-input"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </label>
            <div>
              <PrimaryButton onClick={upload} disabled={busy || !labelInput.trim() || !pemInput.trim()}>
                <i className="ti ti-upload" aria-hidden="true" /> {t('Upload', 'Upload')}
              </PrimaryButton>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>{t('Uploaded root CAs', 'Uploaded root CAs')}</CardTitle>
          {bundles === null ? (
            <p>{t('Loading…', 'Loading…')}</p>
          ) : bundles.length === 0 ? (
            <EmptyState
              icon="ti-certificate"
              title={t('No root CAs uploaded yet.', 'No root CAs uploaded yet.')}
              description={t(
                'Connectors will fall back to the system trust store. Upload a PEM above to trust private CAs.',
                'Connectors will fall back to the system trust store. Upload a PEM above to trust private CAs.',
              )}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>{t('Label', 'Label')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('Subject', 'Subject')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('Expires', 'Expires')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('Fingerprint (SHA-256)', 'Fingerprint (SHA-256)')}</th>
                  <th style={{ padding: '8px 12px' }} />
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => {
                  const expiry = new Date(bundle.not_after)
                  const daysLeft = Math.round((expiry.getTime() - now.getTime()) / 86400000)
                  let tone: 'red' | 'amber' | 'navy' = 'navy'
                  if (daysLeft <= 0) tone = 'red'
                  else if (daysLeft <= EXPIRY_WARNING_DAYS) tone = 'red'
                  else if (daysLeft <= EXPIRY_NOTICE_DAYS) tone = 'amber'
                  return (
                    <tr key={bundle.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{bundle.label}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{bundle.subject}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        <Badge tone={tone}>
                          {daysLeft <= 0
                            ? t('Expired', 'Expired')
                            : t('{n} days', '{n} days').replace('{n}', String(daysLeft))}
                        </Badge>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                          {expiry.toISOString().slice(0, 10)}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                        {bundle.fingerprint_sha256.slice(0, 16)}…{bundle.fingerprint_sha256.slice(-8)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <GhostButton onClick={() => void remove(bundle.id, bundle.label)} disabled={busy}>
                          <i className="ti ti-trash" aria-hidden="true" /> {t('Remove', 'Remove')}
                        </GhostButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}

// extractMessage reads body.detail first (the platform's writeError
// convention), falls back to body.error for legacy endpoints, and
// finally to the bare status line — mirrors the wizard's error
// parser so the trust-store UI surfaces upstream messages instead
// of generic statuses.
function extractMessage(body: any, response: Response): string {
  if (body && typeof body.detail === 'string' && body.detail) return body.detail
  if (body && typeof body.error === 'string' && body.error) return body.error
  return `${response.status} ${response.statusText}`
}
