'use client'

// Audit / Manifests browser.
//
// Lists every signed compliance manifest the tenant has produced.
// Each manifest is a digest of (run, evidence list, framework
// scores) signed with the platform's Ed25519 key. Auditors come here
// to download a manifest + matching public key, then verify offline.
//
// Backed by /v1/runs — every run has a manifest_path and signature
// in the run summary. We map runs into a manifest-centric view so
// the auditor doesn't have to know about the run/manifest split.

import { useEffect, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  GhostButton,
  PrimaryButton,
  SignatureBox,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

type ManifestRow = {
  run_id: string
  timestamp: string
  risk_score?: number
  overall_risk?: string
  manifest_path?: string
  signature?: string
  evidence_count?: number
  frameworks?: string[]
}

const DEMO: ManifestRow[] = [
  {
    run_id: 'run-2026-05-08T14-22-19Z',
    timestamp: '2026-05-08T14:22:19.103Z',
    risk_score: 92,
    overall_risk: 'low',
    evidence_count: 1247,
    frameworks: ['SOC 2', 'ISO 27001'],
    signature: 'kid-7f3a91e45c2b1d:MEYCIQDqK1y3PqT8mVu6XkW...',
    manifest_path: '/manifests/2026-05-08T14-22-19Z.json',
  },
  {
    run_id: 'run-2026-05-07T14-22-12Z',
    timestamp: '2026-05-07T14:22:12.000Z',
    risk_score: 91,
    overall_risk: 'low',
    evidence_count: 1238,
    frameworks: ['SOC 2', 'ISO 27001'],
    signature: 'kid-7f3a91e45c2b1d:MEUCIQDqXKlLD3wjfA8R...',
    manifest_path: '/manifests/2026-05-07T14-22-12Z.json',
  },
  {
    run_id: 'run-2026-05-06T14-22-04Z',
    timestamp: '2026-05-06T14:22:04.000Z',
    risk_score: 88,
    overall_risk: 'medium',
    evidence_count: 1219,
    frameworks: ['SOC 2', 'ISO 27001', 'PCI DSS'],
    signature: 'kid-7f3a91e45c2b1d:MEUCIBpO0o5q2tkPbR9...',
    manifest_path: '/manifests/2026-05-06T14-22-04Z.json',
  },
]

export function AttestivManifestsPage() {
  const [rows, setRows] = useState<ManifestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)
  const [selected, setSelected] = useState<ManifestRow | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch('/runs?limit=50')
        if (!response.ok) throw new Error(`${response.status}`)
        const body = await response.json().catch(() => ({}))
        const items: any[] = Array.isArray(body?.items) ? body.items : []
        const mapped: ManifestRow[] = items.map((item) => ({
          run_id: String(item?.run_id ?? ''),
          timestamp: String(item?.timestamp ?? ''),
          risk_score: typeof item?.risk_score === 'number' ? item.risk_score : undefined,
          overall_risk: typeof item?.overall_risk === 'string' ? item.overall_risk : undefined,
          manifest_path: item?.path ?? undefined,
          signature: item?.summary?.signature ?? undefined,
          evidence_count: item?.summary?.evidence_count ?? undefined,
          frameworks: Array.isArray(item?.summary?.frameworks) ? item.summary.frameworks : undefined,
        }))
        if (!cancelled) {
          if (mapped.length > 0) {
            setRows(mapped)
            setSelected(mapped[0])
            setUsingDemo(false)
          } else {
            setRows(DEMO)
            setSelected(DEMO[0])
            setUsingDemo(true)
          }
        }
      } catch {
        if (!cancelled) {
          setRows(DEMO)
          setSelected(DEMO[0])
          setUsingDemo(true)
        }
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
        title="Signed manifests"
        left={usingDemo ? <Badge tone="amber">Demo data — no signed runs yet</Badge> : null}
        right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{rows.length} manifests</span>}
      />
      <div className="attestiv-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 12 }}>
          <Card>
            <CardTitle>Recent runs</CardTitle>
            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
            ) : (
              <div>
                {rows.map((row) => (
                  <button
                    key={row.run_id}
                    type="button"
                    onClick={() => setSelected(row)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 2fr) 100px 80px',
                      gap: 12,
                      padding: '10px 6px',
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                      background: selected?.run_id === row.run_id ? 'var(--color-status-blue-bg)' : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      color: 'var(--color-text-primary)',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.run_id || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {formatTimestamp(row.timestamp)}
                      </div>
                    </div>
                    <Badge tone={riskTone(row.overall_risk)}>{row.overall_risk ?? 'unknown'}</Badge>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
                      {row.evidence_count ?? '—'} evidence
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div>
            <Card>
              <CardTitle>Manifest detail</CardTitle>
              {selected ? (
                <ManifestDetail row={selected} />
              ) : (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Select a manifest.</div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

function ManifestDetail({ row }: { row: ManifestRow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <KV label="Run" value={row.run_id} mono />
      <KV label="Signed at" value={formatTimestamp(row.timestamp)} mono />
      {row.risk_score !== undefined ? <KV label="Risk score" value={String(row.risk_score)} /> : null}
      {row.evidence_count !== undefined ? <KV label="Evidence count" value={String(row.evidence_count)} /> : null}
      {row.frameworks ? <KV label="Frameworks" value={row.frameworks.join(', ')} /> : null}
      {row.signature ? <SignatureBox label="Signature" value={row.signature} /> : null}
      {row.manifest_path ? <SignatureBox label="Path" value={row.manifest_path} mono={false} /> : null}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <PrimaryButton onClick={() => undefined}>
          <i className="ti ti-file-download" aria-hidden="true" />
          Download manifest
        </PrimaryButton>
        <GhostButton onClick={() => undefined}>
          <i className="ti ti-key" aria-hidden="true" />
          Public key
        </GhostButton>
      </div>
    </div>
  )
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
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

function riskTone(risk?: string): 'green' | 'amber' | 'red' | 'gray' {
  switch ((risk ?? '').toLowerCase()) {
    case 'low':
      return 'green'
    case 'medium':
      return 'amber'
    case 'high':
    case 'critical':
      return 'red'
    default:
      return 'gray'
  }
}

function formatTimestamp(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}
