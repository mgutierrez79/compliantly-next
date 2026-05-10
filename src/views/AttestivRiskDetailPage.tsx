'use client'

// Risk detail page — single risk record with timeline + edit panel.
//
// Edit surface lets a user change status, owner, treatment, due date,
// or treatment notes. Auto-risks honour status changes (so an auditor
// can move them through in_treatment → accepted) but title/category/
// likelihood/impact are read-only — those came from the rule engine
// and editing them would defeat the auto-close logic.

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  PrimaryButton,
  Skeleton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

type Risk = {
  risk_id: string
  title: string
  description?: string
  category?: string
  likelihood?: string
  impact?: string
  score?: number
  status?: string
  source?: string
  source_control_id?: string
  source_framework_id?: string
  source_rule_code?: string
  source_evidence_ids?: string[]
  owner?: string
  treatment?: string
  treatment_notes?: string
  due_date?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

type HistoryEntry = {
  risk_id: string
  change_type?: string
  changed_by?: string
  changed_at?: string
  previous_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
}

type DetailResponse = {
  risk: Risk
  history: HistoryEntry[]
}

const STATUS_TONE: Record<string, 'amber' | 'green' | 'gray' | 'navy' | 'red'> = {
  open: 'amber',
  in_treatment: 'navy',
  accepted: 'gray',
  closed: 'green',
}

export function AttestivRiskDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Editable fields snapshot. Reset whenever a fresh fetch arrives so
  // the form mirrors the persisted state until the user changes
  // something.
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [treatment, setTreatment] = useState('')
  const [treatmentNotes, setTreatmentNotes] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(`/risks/${encodeURIComponent(id)}`)
      if (!response.ok) {
        if (response.status === 404) throw new Error('Risk not found')
        throw new Error(`${response.status} ${response.statusText}`)
      }
      const body: DetailResponse = await response.json()
      setData(body)
      setStatus(body.risk.status || 'open')
      setOwner(body.risk.owner || '')
      setTreatment(body.risk.treatment || '')
      setTreatmentNotes(body.risk.treatment_notes || '')
      setDueDate(body.risk.due_date || '')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load risk'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const updates: Record<string, unknown> = {
        status,
        owner_user_id: owner || null,
        treatment: treatment || null,
        treatment_notes: treatmentNotes || null,
        due_date: dueDate || null,
      }
      const response = await apiFetch(`/risks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.detail || `${response.status} ${response.statusText}`)
      }
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const meta = useMemo(() => (data?.risk?.metadata as Record<string, unknown>) || {}, [data])

  if (loading) {
    return (
      <>
        <Topbar title="Risk" left={<GhostButton onClick={() => router.push('/risks')}><i className="ti ti-arrow-left" aria-hidden="true" /> Back</GhostButton>} />
        <div className="attestiv-content">
          <Skeleton lines={5} height={42} />
        </div>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <Topbar title="Risk" />
        <div className="attestiv-content">
          <EmptyState icon="ti-alert-octagon" title="Risk not found" description="The risk may have been deleted or you may not have access." />
        </div>
      </>
    )
  }

  const { risk } = data
  const isAuto = (risk.source || '').startsWith('auto_')
  const tone = STATUS_TONE[status.toLowerCase()] ?? 'gray'

  return (
    <>
      <Topbar
        title={risk.title || 'Risk'}
        left={
          <GhostButton onClick={() => router.push('/risks')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back
          </GhostButton>
        }
        right={
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <code>{risk.risk_id}</code>
          </span>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card>
          <CardTitle right={<Badge tone={tone}>{(risk.status || 'open').replace(/_/g, ' ')}</Badge>}>
            Summary
          </CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label="Category">{(risk.category || '—').replace(/_/g, ' ')}</Field>
            <Field label="Source">
              {isAuto ? <Badge tone="navy" icon="ti-rocket">{risk.source}</Badge> : <Badge tone="gray">manual</Badge>}
            </Field>
            <Field label="Likelihood × impact">
              {(risk.likelihood || '—').toUpperCase()} × {(risk.impact || '—').toUpperCase()}
            </Field>
            <Field label="Score">{String(risk.score ?? 0)}</Field>
            {risk.source_framework_id ? (
              <Field label="Linked control">
                <code>{risk.source_framework_id}/{risk.source_control_id}</code>
              </Field>
            ) : null}
            {typeof meta['control_name'] === 'string' ? (
              <Field label="Control name">{String(meta['control_name'])}</Field>
            ) : null}
            {typeof meta['score_percent'] === 'string' ? (
              <Field label="Last evaluation">{meta['score_percent'] as string}%</Field>
            ) : null}
          </div>
          {risk.description ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
              {risk.description}
            </p>
          ) : null}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>Treatment</CardTitle>
          <FormGrid>
            <FormRow label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {['open', 'in_treatment', 'accepted', 'closed'].map((opt) => (
                  <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Owner">
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="alice@acme" style={inputStyle} />
            </FormRow>
            <FormRow label="Treatment">
              <select value={treatment} onChange={(e) => setTreatment(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {['accept', 'mitigate', 'transfer', 'avoid'].map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </FormRow>
          </FormGrid>
          <FormRow label="Notes">
            <textarea
              value={treatmentNotes}
              onChange={(e) => setTreatmentNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </FormRow>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <PrimaryButton onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
          </div>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>History</CardTitle>
          {data.history.length === 0 ? (
            <EmptyState
              icon="ti-history"
              title="No history yet"
              description="Lifecycle changes (status, owner, treatment) will appear here as they happen."
            />
          ) : (
            <div>
              {data.history.map((entry, index) => (
                <HistoryRow key={`${entry.changed_at}-${index}`} entry={entry} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{children}</div>
    </div>
  )
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
      {children}
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const ts = entry.changed_at ? new Date(entry.changed_at).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z') : ''
  const next = (entry.new_value as Record<string, unknown>) || {}
  const previous = (entry.previous_value as Record<string, unknown>) || {}
  const changeType = entry.change_type || 'updated'
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '8px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        fontSize: 12,
        alignItems: 'flex-start',
      }}
    >
      <i
        className={`ti ${iconForChange(changeType)}`}
        aria-hidden="true"
        style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>
          {labelForChange(changeType)}
          {entry.changed_by ? <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}> · {entry.changed_by}</span> : null}
        </div>
        {changeType === 'status_changed' ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {previous['status'] ? `${String(previous['status'])} → ` : ''}
            <strong>{String(next['status'] || '—')}</strong>
          </div>
        ) : null}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{ts}</span>
    </div>
  )
}

function iconForChange(type: string): string {
  switch (type) {
    case 'created':         return 'ti-circle-plus'
    case 'status_changed':  return 'ti-arrow-bar-up'
    case 'owner_changed':   return 'ti-user'
    case 'treatment_added': return 'ti-tools'
    case 'auto_closed':     return 'ti-circle-check'
    default:                return 'ti-pencil'
  }
}

function labelForChange(type: string): string {
  switch (type) {
    case 'created':         return 'Risk created'
    case 'status_changed':  return 'Status changed'
    case 'owner_changed':   return 'Owner changed'
    case 'treatment_added': return 'Treatment added'
    case 'auto_closed':     return 'Auto-closed'
    case 'updated':         return 'Updated'
    default:                return type
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '6px 8px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 'var(--border-radius-md)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontFamily: 'inherit',
}
