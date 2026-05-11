'use client';
// Frameworks / Crosswalk.
//
// "One evidence record satisfies multiple controls in multiple
// frameworks" — the crosswalk page makes that mapping explicit. For
// each evidence template (e.g. "EDR endpoint inventory"), it shows
// every framework + control id the same record satisfies. This is
// the strongest argument for compliance automation: prove
// SOC 2 CC6.1, ISO 27001 A.9.2, and CIS 6.7 with one signed record
// instead of three separate manual reviews.
//
// Backed by /v1/config/control-crosswalks. Falls back to a
// representative subset when the endpoint is empty.

import { useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n';

type CrosswalkEntry = {
  evidence_template: string
  description?: string
  mappings: Array<{ framework: string; control_id: string; control_name?: string }>
}

const DEMO: CrosswalkEntry[] = [
  {
    evidence_template: 'EDR endpoint inventory',
    description: 'Daily snapshot of every endpoint with the configured EDR agent installed and reporting.',
    mappings: [
      { framework: 'SOC 2', control_id: 'CC6.1', control_name: 'Logical access' },
      { framework: 'ISO 27001', control_id: 'A.8.1', control_name: 'Asset management' },
      { framework: 'CIS Controls v8', control_id: '1.1', control_name: 'Inventory of authorized devices' },
      { framework: 'PCI DSS 4.0', control_id: '2.1', control_name: 'Default credentials' },
    ],
  },
  {
    evidence_template: 'Firewall change log',
    description: 'Authoritative change record for every firewall policy modification, signed by the change-management system.',
    mappings: [
      { framework: 'SOC 2', control_id: 'CC8.1', control_name: 'Change management' },
      { framework: 'ISO 27001', control_id: 'A.12.1', control_name: 'Operational procedures' },
      { framework: 'PCI DSS 4.0', control_id: '1.2.5', control_name: 'Restrict traffic flows' },
    ],
  },
  {
    evidence_template: 'MFA enrollment ledger',
    description: 'Per-user MFA enrollment state pulled from the IdP, refreshed every 15 minutes.',
    mappings: [
      { framework: 'SOC 2', control_id: 'CC6.1', control_name: 'Logical access' },
      { framework: 'ISO 27001', control_id: 'A.9.2', control_name: 'User access management' },
      { framework: 'CIS Controls v8', control_id: '6.5', control_name: 'Strong authentication' },
      { framework: 'PCI DSS 4.0', control_id: '8.4', control_name: 'MFA' },
    ],
  },
  {
    evidence_template: 'Backup integrity check',
    description: 'Periodic restore-test record produced by Veeam Enterprise Manager.',
    mappings: [
      { framework: 'SOC 2', control_id: 'A1.2', control_name: 'Availability' },
      { framework: 'ISO 27001', control_id: 'A.12.3', control_name: 'Backup' },
      { framework: 'CIS Controls v8', control_id: '11.4', control_name: 'Recovery testing' },
    ],
  },
]

export function AttestivFrameworkCrosswalkPage() {
  const {
    t
  } = useI18n();

  const [entries, setEntries] = useState<CrosswalkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch('/config/control-crosswalks')
        if (!response.ok) throw new Error(`${response.status}`)
        const body = await response.json().catch(() => ({}))
        const items: any[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []
        const mapped: CrosswalkEntry[] = items
          .map((item) => ({
            evidence_template: String(item?.evidence_template ?? item?.name ?? ''),
            description: item?.description,
            mappings: Array.isArray(item?.mappings)
              ? item.mappings
                  .map((mapping: any) => ({
                    framework: String(mapping?.framework ?? ''),
                    control_id: String(mapping?.control_id ?? ''),
                    control_name: mapping?.control_name,
                  }))
                  .filter((mapping: any) => mapping.framework && mapping.control_id)
              : [],
          }))
          .filter((entry) => entry.evidence_template && entry.mappings.length > 0)
        if (!cancelled) {
          if (mapped.length > 0) {
            setEntries(mapped)
            setUsingDemo(false)
          } else {
            setEntries(DEMO)
            setUsingDemo(true)
          }
        }
      } catch {
        if (!cancelled) {
          setEntries(DEMO)
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

  const frameworkColumns = useMemo(() => {
    const set = new Set<string>()
    for (const entry of entries) {
      for (const mapping of entry.mappings) {
        set.add(mapping.framework)
      }
    }
    return Array.from(set).sort()
  }, [entries])

  return (
    <>
      <Topbar
        title={t('Framework crosswalk', 'Framework crosswalk')}
        left={usingDemo ? <Badge tone="amber">{t(
          'Demo crosswalks — no mappings configured',
          'Demo crosswalks — no mappings configured'
        )}</Badge> : null}
        right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{entries.length} templates</span>}
      />
      <div className="attestiv-content">
        <Card>
          <CardTitle>{t('Evidence templates → controls', 'Evidence templates → controls')}</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            {t(
              'Each row is one evidence template. The columns show every framework control that the same record satisfies — one signed evidence covers many controls.',
              'Each row is one evidence template. The columns show every framework control that the same record satisfies — one signed evidence covers many controls.'
            )}
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('Loading…', 'Loading…')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '6px 10px 6px 0', minWidth: 220 }}>{t('Evidence template', 'Evidence template')}</th>
                    {frameworkColumns.map((framework) => (
                      <th key={framework} style={{ padding: '6px 10px', minWidth: 140 }}>
                        {framework}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.evidence_template} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                      <td style={{ padding: '12px 10px 12px 0', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 500 }}>{entry.evidence_template}</div>
                        {entry.description ? (
                          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                            {entry.description}
                          </div>
                        ) : null}
                      </td>
                      {frameworkColumns.map((framework) => {
                        const matches = entry.mappings.filter((mapping) => mapping.framework === framework)
                        return (
                          <td key={framework} style={{ padding: '12px 10px', verticalAlign: 'top' }}>
                            {matches.length === 0 ? (
                              <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {matches.map((mapping) => (
                                  <div key={mapping.control_id}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>
                                      {mapping.control_id}
                                    </div>
                                    {mapping.control_name ? (
                                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                        {mapping.control_name}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
