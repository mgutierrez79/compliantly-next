'use client'

// Support bundle page — Settings ▸ Support.
//
// One-click download of a signed, redacted diagnostic zip the
// tenant admin emails to platform support when something needs
// debugging. The page also documents exactly what's inside and
// what's deliberately not — useful for compliance review before
// the bundle leaves the customer's network.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  GhostButton,
  PrimaryButton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

export function AttestivSupportBundlePage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSize, setLastSize] = useState<number | null>(null)

  async function downloadBundle() {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch('/admin/support-bundle', { method: 'POST' })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `${response.status} ${response.statusText}`)
      }
      const blob = await response.blob()
      setLastSize(blob.size)
      const objectUrl = URL.createObjectURL(blob)
      // Mirror the Content-Disposition filename when we can; otherwise
      // build one with today's date. We prefer the server-provided
      // name because it carries the precise timestamp + tenant.
      const cd = response.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `support-bundle-${new Date().toISOString().slice(0, 10)}.zip`
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate support bundle')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Topbar
        title="Support bundle"
        left={<Badge tone="navy">admin only</Badge>}
        right={
          <GhostButton onClick={() => router.push('/settings')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Settings
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {lastSize != null ? (
          <Banner tone="success">
            Downloaded {formatBytes(lastSize)}. Email the file to your platform support contact — do not
            upload to a public file-sharing service.
          </Banner>
        ) : null}

        <Banner tone="info" title="What a support bundle is for">
          When something on the platform isn't behaving correctly and you need help debugging it, this
          page produces a signed <code>.zip</code> with the last 7 days of audit events, the last month
          of scoring trend events, current connector status, dead-letter queue summary, and the
          platform's framework YAML hashes. Email it to support; we use it to reproduce the issue
          without needing access to your network.
        </Banner>

        <Card>
          <CardTitle right={<Badge tone="navy">signed</Badge>}>Generate &amp; download</CardTitle>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 0 }}>
            The bundle is generated against the current tenant. It carries an Ed25519 signature over
            its <code>manifest.json</code> so support can prove no file was modified after download.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaryButton onClick={downloadBundle} disabled={busy}>
              <i className="ti ti-file-zip" aria-hidden="true" />
              {busy ? 'Generating…' : 'Download support bundle'}
            </PrimaryButton>
          </div>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>What's inside</CardTitle>
          <ul style={listStyle}>
            <li><code>manifest.json</code> — signed inventory of every file + SHA256.</li>
            <li><code>signature.txt</code> — Ed25519 signature over <code>manifest.json</code>.</li>
            <li><code>version.json</code> — platform version + framework YAML hashes.</li>
            <li><code>audit/audit_last_7d.json</code> — tenant audit log; actor names redacted.</li>
            <li><code>scoring/trend_events.json</code> — scoring evaluation events (last month).</li>
            <li><code>scoring/framework_snapshot.json</code> — latest score + control counts per framework.</li>
            <li><code>connectors/telemetry.json</code> — last-run + success/failure counts; no credentials, no endpoint URLs.</li>
            <li><code>ingestion/dlq_entries.json</code> — failed ingestion entries; payloads dropped, error messages path-redacted.</li>
            <li><code>README.txt</code> — plain-text instructions for verifying the signature.</li>
          </ul>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>What's deliberately NOT included</CardTitle>
          <ul style={listStyle}>
            <li>Raw evidence payloads (firewall logs, MFA polls, backup-job blobs).</li>
            <li>Connector credentials, API keys, or endpoint URLs.</li>
            <li>Actor identities in the audit log — subjects appear as <code>[redacted]</code>.</li>
            <li>Customer-supplied free-text in DLQ error messages — paths and IP-like tokens are stripped before signing.</li>
          </ul>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            If support asks for a specific evidence record or audit entry, they'll request the exact ID
            so you can attach it manually rather than including it in every bundle.
          </p>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>How to verify before sending</CardTitle>
          <ol style={{ ...listStyle, paddingLeft: 20 }}>
            <li>Unzip the bundle.</li>
            <li>
              Open <code>manifest.json</code> — confirm the file list and <code>tenant_id</code> match
              what you expect.
            </li>
            <li>
              Spot-check <code>audit/audit_last_7d.json</code> for any leftover content your security
              team would not approve sending out.
            </li>
            <li>
              The Ed25519 signature in <code>signature.txt</code> proves no file in the bundle was modified
              after the platform generated it; your security team can verify it against the public key at
              <code> /v1/public/keys</code>.
            </li>
          </ol>
        </Card>
      </div>
    </>
  )
}

const listStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  lineHeight: 1.8,
  paddingLeft: 18,
  marginTop: 0,
  marginBottom: 0,
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
