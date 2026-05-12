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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  // Track which file the user actually picked so the drop zone can
  // show "Selected: auxia-root-ca.pem (2.4 KB)" feedback instead of
  // leaving the operator wondering whether their click did anything.
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null)
  // Visual highlight on the drop zone while a file is being dragged
  // over it. Without this state the zone looks identical whether
  // the dragged file will be accepted or not.
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
  function ingestFile(file: File) {
    setSelectedFileName(file.name)
    setSelectedFileSize(file.size)
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

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) ingestFile(file)
  }

  // Drop-zone event handlers. We keep these simple — the
  // "dragActive" boolean controls the highlight, dropEffect signals
  // to the OS that we'll accept the drop, and ingestFile takes the
  // first File in the transfer. Multiple files are deliberately
  // ignored: each bundle row in the trust store is one CA.
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }
  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
  }
  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) ingestFile(file)
  }

  function clearSelectedFile() {
    setSelectedFileName(null)
    setSelectedFileSize(null)
    setPemInput('')
    // The hidden <input> needs its value reset so picking the same
    // file twice in a row still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Human-readable byte size for the "(2.4 KB)" suffix next to the
  // selected filename. Capped at MB because no real CA bundle is
  // larger than that, and the server enforces a 64 KiB limit anyway.
  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
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
      setSelectedFileName(null)
      setSelectedFileSize(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
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
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Step 1: Label. Numbered so the user follows a sequence
                instead of guessing which field to fill first. */}
            <label style={{ display: 'block' }}>
              <div className="attestiv-label">
                <strong>1.</strong> {t('Label', 'Label')}
              </div>
              <input
                type="text"
                value={labelInput}
                onChange={(event) => setLabelInput(event.target.value)}
                placeholder={t('Auxia Internal Root 2024', 'Auxia Internal Root 2024')}
                className="attestiv-input"
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {t('Display name shown in the list below. Free text.', 'Display name shown in the list below. Free text.')}
              </div>
            </label>

            {/* Step 2: PEM source. The drop zone is a clickable div
                that triggers a hidden <input type="file"> via a ref.
                The bare <input type="file"> from before gave no visual
                affordance — operators asked "where do I click?".
                Drag-and-drop lands on this same zone, and an OR-pasted
                PEM below is treated as equivalent. */}
            <div>
              <div className="attestiv-label">
                <strong>2.</strong> {t('Select your PEM-encoded certificate', 'Select your PEM-encoded certificate')}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pem,.crt,.cer,application/x-pem-file,text/plain"
                onChange={onFileSelected}
                style={{ display: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '24px 16px',
                  borderRadius: 8,
                  border: dragActive
                    ? '2px dashed var(--color-accent, #2563eb)'
                    : selectedFileName
                      ? '2px solid var(--color-accent, #2563eb)'
                      : '2px dashed var(--color-border, #cbd5e1)',
                  background: dragActive
                    ? 'rgba(37, 99, 235, 0.08)'
                    : selectedFileName
                      ? 'rgba(37, 99, 235, 0.04)'
                      : 'var(--color-surface-muted, #f8fafc)',
                  cursor: 'pointer',
                  transition: 'border-color 120ms ease, background 120ms ease',
                  textAlign: 'center',
                }}
              >
                {selectedFileName ? (
                  <>
                    <i
                      className="ti ti-file-check"
                      aria-hidden="true"
                      style={{ fontSize: 32, color: 'var(--color-accent, #2563eb)' }}
                    />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedFileName}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {selectedFileSize !== null ? formatBytes(selectedFileSize) : ''}{' '}
                      · {t('PEM ready to upload', 'PEM ready to upload')}
                    </div>
                    {/* Absorbing wrapper so a click on the inner
                        buttons doesn't bubble up to the outer drop
                        zone (which would re-open the file dialog on
                        every "Clear" press). */}
                    <div
                      style={{ display: 'flex', gap: 8, marginTop: 4 }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GhostButton onClick={() => fileInputRef.current?.click()}>
                        <i className="ti ti-replace" aria-hidden="true" /> {t('Choose a different file', 'Choose a different file')}
                      </GhostButton>
                      <GhostButton onClick={() => clearSelectedFile()}>
                        <i className="ti ti-x" aria-hidden="true" /> {t('Clear', 'Clear')}
                      </GhostButton>
                    </div>
                  </>
                ) : (
                  <>
                    <i
                      className="ti ti-cloud-upload"
                      aria-hidden="true"
                      style={{ fontSize: 32, color: 'var(--color-text-tertiary, #64748b)' }}
                    />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {t('Click to choose a file', 'Click to choose a file')}{' '}
                      <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                        {t('or drag it here', 'or drag it here')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {t('Accepted: .pem, .crt, .cer (max 64 KB)', 'Accepted: .pem, .crt, .cer (max 64 KB)')}
                    </div>
                  </>
                )}
              </div>

              {/* Separator between the two equivalent input paths.
                  Without this, users were confused whether the file
                  picker and the textarea were redundant or both
                  required. Now it's clearly an OR. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '16px 0',
                  color: 'var(--color-text-tertiary, #64748b)',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--color-border, #e2e8f0)' }} />
                {t('or paste it below', 'or paste it below')}
                <div style={{ flex: 1, height: 1, background: 'var(--color-border, #e2e8f0)' }} />
              </div>

              <textarea
                rows={8}
                value={pemInput}
                onChange={(event) => {
                  setPemInput(event.target.value)
                  // If the user pastes after picking a file, the
                  // file label is stale — clear it so the UI tells
                  // the truth about what's actually queued.
                  if (selectedFileName) {
                    setSelectedFileName(null)
                    setSelectedFileSize(null)
                  }
                }}
                placeholder={'-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----'}
                className="attestiv-input"
                style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }}
              />
            </div>

            {/* Step 3: Upload. The disabled-state hint makes it
                explicit what's missing — users were clicking the
                grey button and getting no feedback. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={upload} disabled={busy || !labelInput.trim() || !pemInput.trim()}>
                {busy ? (
                  <>
                    <i className="ti ti-loader-2" aria-hidden="true" /> {t('Uploading…', 'Uploading…')}
                  </>
                ) : (
                  <>
                    <i className="ti ti-upload" aria-hidden="true" /> {t('Upload root CA', 'Upload root CA')}
                  </>
                )}
              </PrimaryButton>
              {!labelInput.trim() || !pemInput.trim() ? (
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {!labelInput.trim()
                    ? t('Enter a label first.', 'Enter a label first.')
                    : t('Select a PEM file or paste one above.', 'Select a PEM file or paste one above.')}
                </span>
              ) : null}
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
