'use client';
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

import { useI18n } from '../lib/i18n';

export function AttestivSupportBundlePage() {
  const {
    t
  } = useI18n();

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
        title={t('Support bundle', 'Support bundle')}
        left={<Badge tone="navy">{t('admin only', 'admin only')}</Badge>}
        right={
          <GhostButton onClick={() => router.push('/settings')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> {t('Settings', 'Settings')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {lastSize != null ? (
          <Banner tone="success">
            {t('Downloaded', 'Downloaded')} {formatBytes(lastSize)}{t(
              '. Email the file to your platform support contact — do not\n            upload to a public file-sharing service.',
              '. Email the file to your platform support contact — do not\n            upload to a public file-sharing service.'
            )}
          </Banner>
        ) : null}

        <Banner tone="info" title={t('What a support bundle is for', 'What a support bundle is for')}>
          {t(
            'When something on the platform isn\'t behaving correctly and you need help debugging it, this\n          page produces a signed',
            'When something on the platform isn\'t behaving correctly and you need help debugging it, this\n          page produces a signed'
          )} <code>{t('.zip', '.zip')}</code> {t(
            'with the last 7 days of audit events, the last month\n          of scoring trend events, current connector status, dead-letter queue summary, and the\n          platform\'s framework YAML hashes. Email it to support; we use it to reproduce the issue\n          without needing access to your network.',
            'with the last 7 days of audit events, the last month\n          of scoring trend events, current connector status, dead-letter queue summary, and the\n          platform\'s framework YAML hashes. Email it to support; we use it to reproduce the issue\n          without needing access to your network.'
          )}
        </Banner>

        <Card>
          <CardTitle right={<Badge tone="navy">signed</Badge>}>{t('Generate & download', 'Generate & download')}</CardTitle>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 0 }}>
            {t(
              'The bundle is generated against the current tenant. It carries an Ed25519 signature over\n            its',
              'The bundle is generated against the current tenant. It carries an Ed25519 signature over\n            its'
            )} <code>manifest.json</code> {t(
              'so support can prove no file was modified after download.',
              'so support can prove no file was modified after download.'
            )}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaryButton onClick={downloadBundle} disabled={busy}>
              <i className="ti ti-file-zip" aria-hidden="true" />
              {busy ? 'Generating…' : 'Download support bundle'}
            </PrimaryButton>
          </div>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>{t('What\'s inside', 'What\'s inside')}</CardTitle>
          <ul style={listStyle}>
            <li><code>manifest.json</code> {t(
                '— signed inventory of every file + SHA256.',
                '— signed inventory of every file + SHA256.'
              )}</li>
            <li><code>{t('signature.txt', 'signature.txt')}</code> {t('— Ed25519 signature over', '— Ed25519 signature over')} <code>manifest.json</code>.</li>
            <li><code>version.json</code> {t(
                '— platform version + framework YAML hashes.',
                '— platform version + framework YAML hashes.'
              )}</li>
            <li><code>{t('audit/audit_last_7d.json', 'audit/audit_last_7d.json')}</code> {t(
                '— tenant audit log; actor names redacted.',
                '— tenant audit log; actor names redacted.'
              )}</li>
            <li><code>{t('scoring/trend_events.json', 'scoring/trend_events.json')}</code> {t(
                '— scoring evaluation events (last month).',
                '— scoring evaluation events (last month).'
              )}</li>
            <li><code>{t('scoring/framework_snapshot.json', 'scoring/framework_snapshot.json')}</code> {t(
                '— latest score + control counts per framework.',
                '— latest score + control counts per framework.'
              )}</li>
            <li><code>{t('connectors/telemetry.json', 'connectors/telemetry.json')}</code> {t(
                '— last-run + success/failure counts; no credentials, no endpoint URLs.',
                '— last-run + success/failure counts; no credentials, no endpoint URLs.'
              )}</li>
            <li><code>{t('ingestion/dlq_entries.json', 'ingestion/dlq_entries.json')}</code> {t(
                '— failed ingestion entries; payloads dropped, error messages path-redacted.',
                '— failed ingestion entries; payloads dropped, error messages path-redacted.'
              )}</li>
            <li><code>{t('README.txt', 'README.txt')}</code> {t(
                '— plain-text instructions for verifying the signature.',
                '— plain-text instructions for verifying the signature.'
              )}</li>
          </ul>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>{t('What\'s deliberately NOT included', 'What\'s deliberately NOT included')}</CardTitle>
          <ul style={listStyle}>
            <li>{t(
              'Raw evidence payloads (firewall logs, MFA polls, backup-job blobs).',
              'Raw evidence payloads (firewall logs, MFA polls, backup-job blobs).'
            )}</li>
            <li>{t(
              'Connector credentials, API keys, or endpoint URLs.',
              'Connector credentials, API keys, or endpoint URLs.'
            )}</li>
            <li>{t(
                'Actor identities in the audit log — subjects appear as',
                'Actor identities in the audit log — subjects appear as'
              )} <code>[redacted]</code>.</li>
            <li>{t(
              'Customer-supplied free-text in DLQ error messages — paths and IP-like tokens are stripped before signing.',
              'Customer-supplied free-text in DLQ error messages — paths and IP-like tokens are stripped before signing.'
            )}</li>
          </ul>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            {t(
              'If support asks for a specific evidence record or audit entry, they\'ll request the exact ID\n            so you can attach it manually rather than including it in every bundle.',
              'If support asks for a specific evidence record or audit entry, they\'ll request the exact ID\n            so you can attach it manually rather than including it in every bundle.'
            )}
          </p>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle>{t('How to verify before sending', 'How to verify before sending')}</CardTitle>
          <ol style={{ ...listStyle, paddingLeft: 20 }}>
            <li>{t('Unzip the bundle.', 'Unzip the bundle.')}</li>
            <li>
              {t('Open', 'Open')} <code>manifest.json</code> {t('— confirm the file list and', '— confirm the file list and')} <code>tenant_id</code> {t(
                'match\n              what you expect.',
                'match\n              what you expect.'
              )}
            </li>
            <li>
              {t('Spot-check', 'Spot-check')} <code>{t('audit/audit_last_7d.json', 'audit/audit_last_7d.json')}</code> {t(
                'for any leftover content your security\n              team would not approve sending out.',
                'for any leftover content your security\n              team would not approve sending out.'
              )}
            </li>
            <li>
              {t('The Ed25519 signature in', 'The Ed25519 signature in')} <code>{t('signature.txt', 'signature.txt')}</code> {t(
                'proves no file in the bundle was modified\n              after the platform generated it; your security team can verify it against the public key at',
                'proves no file in the bundle was modified\n              after the platform generated it; your security team can verify it against the public key at'
              )}
              <code> /v1/public/keys</code>.
                          </li>
          </ol>
        </Card>
      </div>
    </>
  );
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
