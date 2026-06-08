'use client';

import { useEffect, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  GhostButton,
  PrimaryButton,
  Select,
  SignatureBox,
  TextInput,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'
import { useI18n } from '../lib/i18n'

type Principal = {
  subject: string
  roles: string[]
  tenant_id?: string
}

type ApiKeyRecord = {
  key_id: string
  api_key?: string   // only present immediately after creation
  subject: string
  roles: string[]
  label?: string
  tenant_id?: string
}

const ROLE_TONE: Record<string, 'navy' | 'blue' | 'green' | 'gray'> = {
  admin: 'navy',
  auditor: 'blue',
  reporter: 'green',
  reader: 'gray',
  worker: 'gray',
}

export function AttestivApiKeysPage() {
  const { t } = useI18n()

  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loadingPrincipal, setLoadingPrincipal] = useState(true)
  const [loadingKeys, setLoadingKeys] = useState(true)

  // create form
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [subject, setSubject] = useState('')
  const [role, setRole] = useState('reporter')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<ApiKeyRecord | null>(null)
  const [copied, setCopied] = useState(false)

  // delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadPrincipal() {
    try {
      const r = await apiFetch('/auth/me')
      if (r.ok) setPrincipal(await r.json())
    } finally {
      setLoadingPrincipal(false)
    }
  }

  async function loadKeys() {
    setLoadingKeys(true)
    try {
      const r = await apiFetch('/admin/keys')
      if (r.ok) {
        const body = await r.json()
        setKeys(Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [])
      }
    } finally {
      setLoadingKeys(false)
    }
  }

  useEffect(() => {
    loadPrincipal()
    loadKeys()
  }, [])

  async function handleCreate() {
    if (!subject.trim()) { setCreateError('Subject is required'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const r = await apiFetch('/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || subject.trim(), subject: subject.trim(), roles: [role] }),
      })
      const body = await r.json()
      if (!r.ok) { setCreateError(body?.error ?? `Error ${r.status}`); return }
      setNewKey(body)
      setShowForm(false)
      setLabel('')
      setSubject('')
      setRole('reporter')
      loadKeys()
    } catch (e: any) {
      setCreateError(e?.message ?? 'Request failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(keyId: string) {
    setDeletingId(keyId)
    try {
      await apiFetch(`/admin/keys/${keyId}`, { method: 'DELETE' })
      setKeys(k => k.filter(x => x.key_id !== keyId))
      if (newKey?.key_id === keyId) setNewKey(null)
    } finally {
      setDeletingId(null)
    }
  }

  function copyKey(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <Topbar
        title={t('API keys', 'API keys')}
        right={
          <PrimaryButton onClick={() => { setShowForm(s => !s); setCreateError(null); setNewKey(null) }}>
            <i className="ti ti-plus" aria-hidden="true" />
            {t('Create key', 'Create key')}
          </PrimaryButton>
        }
      />
      <div className="attestiv-content">

        {/* ── new-key banner ─────────────────────────────────────────── */}
        {newKey?.api_key && (
          <div style={{
            background: 'var(--color-status-green-bg)',
            border: '1px solid var(--color-status-green-mid)',
            borderRadius: 'var(--border-radius-md)',
            padding: '12px 16px',
            marginBottom: 12,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-status-green-deep)' }}>
              {t('Key created — copy it now, it will not be shown again.', 'Key created — copy it now, it will not be shown again.')}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{newKey.api_key}</code>
              <GhostButton onClick={() => copyKey(newKey.api_key!)}>
                <i className={`ti ti-${copied ? 'check' : 'copy'}`} aria-hidden="true" />
                {copied ? t('Copied', 'Copied') : t('Copy', 'Copy')}
              </GhostButton>
            </div>
          </div>
        )}

        {/* ── create form ────────────────────────────────────────────── */}
        {showForm && (
          <Card style={{ marginBottom: 12 }}>
            <CardTitle>{t('New API key', 'New API key')}</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {t('Label', 'Label')}
                <TextInput
                  placeholder={t('e.g. Veeam tape script', 'e.g. Veeam tape script')}
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  style={{ marginTop: 4, width: '100%' }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {t('Subject', 'Subject')} <span style={{ color: 'var(--color-status-red-deep)' }}>*</span>
                <TextInput
                  placeholder={t('e.g. veeam-tape-script', 'e.g. veeam-tape-script')}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ marginTop: 4, width: '100%' }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {t('Role', 'Role')}
                <Select value={role} onChange={e => setRole(e.target.value)} style={{ marginTop: 4, width: '100%' }}>
                  <option value="reporter">{t('reporter — can push ingest data', 'reporter — can push ingest data')}</option>
                  <option value="reader">{t('reader — read-only', 'reader — read-only')}</option>
                  <option value="auditor">{t('auditor — read-only auditor scope', 'auditor — read-only auditor scope')}</option>
                  <option value="admin">{t('admin — full access', 'admin — full access')}</option>
                </Select>
              </label>
              {createError && (
                <div style={{ fontSize: 12, color: 'var(--color-status-red-deep)', background: 'var(--color-status-red-bg)', padding: '6px 10px', borderRadius: 'var(--border-radius-md)' }}>
                  {createError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton onClick={handleCreate} disabled={creating}>
                  {creating ? t('Creating…', 'Creating…') : t('Create', 'Create')}
                </PrimaryButton>
                <GhostButton onClick={() => { setShowForm(false); setCreateError(null) }}>
                  {t('Cancel', 'Cancel')}
                </GhostButton>
              </div>
            </div>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>

          {/* ── existing keys ───────────────────────────────────────── */}
          <Card>
            <CardTitle>{t('Active keys', 'Active keys')}</CardTitle>
            {loadingKeys ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('Loading…', 'Loading…')}</div>
            ) : keys.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {t('No keys yet. Use "Create key" to generate one.', 'No keys yet. Use "Create key" to generate one.')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {keys.map(k => (
                  <div key={k.key_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: 'var(--color-background-secondary)',
                    borderRadius: 'var(--border-radius-md)',
                    fontSize: 13,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {k.label || k.subject}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {k.subject}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {(k.roles ?? []).map(r => (
                        <Badge key={r} tone={ROLE_TONE[r.toLowerCase()] ?? 'gray'}>{r}</Badge>
                      ))}
                    </div>
                    <GhostButton
                      onClick={() => handleDelete(k.key_id)}
                      disabled={deletingId === k.key_id}
                    >
                      <i className="ti ti-trash" aria-hidden="true" style={{ color: 'var(--color-status-red-deep)' }} />
                    </GhostButton>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── current credential ──────────────────────────────────── */}
          <Card>
            <CardTitle>{t('Your current credential', 'Your current credential')}</CardTitle>
            {loadingPrincipal ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('Loading…', 'Loading…')}</div>
            ) : principal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <KV label={t('Subject', 'Subject')} value={principal.subject} mono />
                <KV label={t('Tenant', 'Tenant')} value={principal.tenant_id ?? '—'} mono={!!principal.tenant_id} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{t('Roles', 'Roles')}</span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {principal.roles.map(r => (
                      <Badge key={r} tone={ROLE_TONE[r.toLowerCase()] ?? 'gray'}>{r}</Badge>
                    ))}
                  </span>
                </div>
              </div>
            ) : null}
          </Card>

        </div>

        {/* ── ingest usage hint ────────────────────────────────────── */}
        <Card style={{ marginTop: 12 }}>
          <CardTitle>{t('Using a key for push ingest', 'Using a key for push ingest')}</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {t('Create a key with the', 'Create a key with the')} <strong>reporter</strong> {t('role, then POST to the ingest endpoint:', 'role, then POST to the ingest endpoint:')}
          </div>
          <SignatureBox label="curl" value={`curl -X POST https://<host>/api/v1/ingest \\
  -H "X-API-Key: <your-key>" \\
  -H "X-Tenant-ID: <tenant>" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"veeam_tape_ps","resilience_signals":[...]}'`} />
        </Card>

      </div>
    </>
  )
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontWeight: 500,
        textAlign: 'right',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}>
        {value}
      </span>
    </div>
  )
}
