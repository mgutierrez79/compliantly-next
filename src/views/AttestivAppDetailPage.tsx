'use client';
// Application detail page.
//
// One scrollable view, four sections:
//   1. Summary — name, criticality, GxP flag, owner, DR requirements.
//   2. Components — VMs that make up the app, with site + DR site.
//   3. Dependencies — declared + resolved chain (transitive close).
//   4. Availability — latest probe results per component + dependency.
//   5. Change-control records — CCRs, with the GxP quality-approval badge.
//
// Each section degrades gracefully when its endpoint is unavailable
// or returns no_data; the page never blanks because one panel failed.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import {
  Badge,
  Banner,
  Card,
  CardTitle,
  EmptyState,
  GhostButton,
  Skeleton,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n';

type AppDetail = {
  application_id: string
  display_name: string
  description?: string
  owner_email?: string
  criticality_tier?: string
  gxp_validated?: boolean
  component_count?: number
  dependency_count?: number
  components?: AppComponent[]
  dependencies?: AppDependency[]
  dependency_chain?: string
  dependents?: string[]
  dr_requirements?: { rto_minutes?: number; rpo_minutes?: number; tier?: string; classification?: string }
}

type AppComponent = {
  vm_name: string
  role?: string
  is_primary?: boolean
  connector?: string
  criticality?: string
  site?: string
  dr_site?: string
  dr_site_vm?: string
}

type AppDependency = {
  application_id: string
  dependency_type?: string
  criticality?: string
  description?: string
}

type AvailabilityResult = {
  application_id?: string
  status?: string // "no_data" | undefined
  message?: string
  all_components_available?: boolean
  all_dependencies_healthy?: boolean
  overall_available?: boolean
  component_results?: Array<{ vm_name?: string; available?: boolean; reason?: string }>
  dependency_results?: Array<{ application_id?: string; healthy?: boolean; reason?: string }>
  checked_at?: string
}

type CCR = {
  id: string
  change_ref?: string
  change_type?: string
  description?: string
  impact_assessment?: string
  test_protocol?: string
  gxp_revalidation_required?: boolean
  requested_by?: string
  approved_by?: string
  quality_approved_by?: string
  approved_at?: string
  implemented_at?: string
  evidence_id?: string
  created_at?: string
}

const TIER_TONE: Record<string, 'red' | 'amber' | 'navy' | 'gray'> = {
  tier_1: 'red',
  tier_2: 'amber',
  tier_3: 'navy',
}

export function AttestivAppDetailPage() {
  const {
    t
  } = useI18n();

  const router = useRouter()
  const params = useParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [app, setApp] = useState<AppDetail | null>(null)
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null)
  const [ccrs, setCCRs] = useState<CCR[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const detailRes = await apiFetch(`/apps/${encodeURIComponent(id)}`).catch((err: Error) => {
        return new Response(JSON.stringify({ detail: err.message }), { status: 599 })
      })
      if (cancelled) return
      if (!detailRes.ok) {
        if (detailRes.status === 404) {
          setError('Application not found')
        } else {
          setError(`${detailRes.status} ${detailRes.statusText}`)
        }
        setLoading(false)
        return
      }
      const detail: AppDetail = await detailRes.json()
      setApp(detail)

      // Availability + CCRs are best-effort. They run AFTER the
      // detail loads so the page can render the summary even if
      // these endpoints are temporarily unavailable.
      const [availRes, ccrRes] = await Promise.allSettled([
        apiFetch(`/apps/${encodeURIComponent(id)}/availability`),
        apiFetch(`/apps/${encodeURIComponent(id)}/change-control`),
      ])
      if (cancelled) return
      if (availRes.status === 'fulfilled' && availRes.value.ok) {
        const body = await availRes.value.json()
        setAvailability(body)
      }
      if (ccrRes.status === 'fulfilled' && ccrRes.value.ok) {
        const body = await ccrRes.value.json()
        setCCRs(Array.isArray(body?.items) ? body.items : [])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <>
        <Topbar
          title={t('Application', 'Application')}
          left={
            <GhostButton onClick={() => router.push('/apps')}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> {t('Back', 'Back')}
            </GhostButton>
          }
        />
        <div className="attestiv-content">
          <Skeleton lines={5} height={42} />
        </div>
      </>
    );
  }

  if (!app) {
    return (
      <>
        <Topbar title={t('Application', 'Application')} />
        <div className="attestiv-content">
          {error ? <Banner tone="error">{error}</Banner> : null}
          <EmptyState icon="ti-apps" title={t('Application not found', 'Application not found')} description={t(
            'The application may not be registered or you may not have access.',
            'The application may not be registered or you may not have access.'
          )} />
        </div>
      </>
    );
  }

  const tier = (app.criticality_tier ?? '').toLowerCase()
  const tierTone = TIER_TONE[tier] ?? 'gray'

  return (
    <>
      <Topbar
        title={app.display_name}
        left={
          <GhostButton onClick={() => router.push('/apps')}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> {t('Back', 'Back')}
          </GhostButton>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {app.criticality_tier ? <Badge tone={tierTone}>{app.criticality_tier}</Badge> : null}
            {app.gxp_validated ? <Badge tone="navy" icon="ti-flask">{t('GxP', 'GxP')}</Badge> : null}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <code>{app.application_id}</code>
            </span>
          </div>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card>
          <CardTitle>{t('Summary', 'Summary')}</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label={t('Owner', 'Owner')}>{app.owner_email || '—'}</Field>
            <Field label={t('Components', 'Components')}>{String(app.component_count ?? 0)}</Field>
            <Field label={t('Dependencies', 'Dependencies')}>{String(app.dependency_count ?? 0)}</Field>
            {app.dr_requirements?.rto_minutes !== undefined ? (
              <Field label={t('RTO target', 'RTO target')}>{app.dr_requirements.rto_minutes} min</Field>
            ) : null}
            {app.dr_requirements?.rpo_minutes !== undefined ? (
              <Field label={t('RPO target', 'RPO target')}>{app.dr_requirements.rpo_minutes} min</Field>
            ) : null}
          </div>
          {app.description ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12, marginBottom: 0 }}>
              {app.description}
            </p>
          ) : null}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={<Badge tone="navy">{app.components?.length ?? 0}</Badge>}>{t('Components', 'Components')}</CardTitle>
          {!app.components || app.components.length === 0 ? (
            <EmptyState icon="ti-server-cog" title={t('No components', 'No components')} description={t(
              'The application\'s component list is empty in the YAML registry.',
              'The application\'s component list is empty in the YAML registry.'
            )} />
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={headerRowStyle}>
                  <th style={{ padding: '6px 10px 6px 0' }}>VM</th>
                  <th style={{ padding: '6px 10px' }}>{t('Role', 'Role')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('Site', 'Site')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('DR site', 'DR site')}</th>
                  <th style={{ padding: '6px 0 6px 10px' }}>{t('Connector', 'Connector')}</th>
                </tr>
              </thead>
              <tbody>
                {app.components.map((c, i) => (
                  <tr key={`${c.vm_name}-${i}`} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '8px 10px 8px 0' }}>
                      <code style={{ fontSize: 11 }}>{c.vm_name}</code>
                      {c.is_primary ? <Badge tone="navy" icon="ti-star">primary</Badge> : null}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{c.role ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {c.site ? <code style={{ fontSize: 11 }}>{c.site}</code> : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {c.dr_site ? <code style={{ fontSize: 11 }}>{c.dr_site}</code> : '—'}
                    </td>
                    <td style={{ padding: '8px 0 8px 10px', color: 'var(--color-text-secondary)' }}>
                      {c.connector ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={<Badge tone="navy">{app.dependencies?.length ?? 0}</Badge>}>{t('Dependencies', 'Dependencies')}</CardTitle>
          {!app.dependencies || app.dependencies.length === 0 ? (
            <EmptyState icon="ti-link-off" title={t('No declared dependencies', 'No declared dependencies')} description={t(
              'The application has no upstream dependency declarations.',
              'The application has no upstream dependency declarations.'
            )} />
          ) : (
            <div>
              {app.dependencies.map((d, i) => (
                <div
                  key={`${d.application_id}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '0.5px solid var(--color-border-tertiary)',
                    fontSize: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/apps/${encodeURIComponent(d.application_id)}`)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'var(--color-text-primary)',
                      padding: 0,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      <code>{d.application_id}</code>
                    </div>
                    {d.description ? (
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{d.description}</div>
                    ) : null}
                  </button>
                  {d.dependency_type ? (
                    <Badge tone="gray">{d.dependency_type.replace(/_/g, ' ')}</Badge>
                  ) : null}
                  {d.criticality ? <Badge tone="amber">{d.criticality}</Badge> : null}
                </div>
              ))}
            </div>
          )}
          {app.dependency_chain ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
              {t('Resolved chain:', 'Resolved chain:')} <code>{app.dependency_chain}</code>
            </div>
          ) : null}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle
            right={
              availability?.overall_available !== undefined ? (
                <Badge tone={availability.overall_available ? 'green' : 'red'}>
                  {availability.overall_available ? 'available' : 'degraded'}
                </Badge>
              ) : null
            }
          >
            {t('Availability snapshot', 'Availability snapshot')}
          </CardTitle>
          {availability?.status === 'no_data' ? (
            <EmptyState
              icon="ti-circle-dashed"
              title={t('No availability data yet', 'No availability data yet')}
              description={availability.message || 'The platform hasn\'t computed availability for this application yet.'}
            />
          ) : !availability ? (
            <EmptyState icon="ti-circle-dashed" title={t('Availability not loaded', 'Availability not loaded')} description={t(
              'The /v1/apps/{id}/availability endpoint did not respond.',
              'The /v1/apps/{id}/availability endpoint did not respond.'
            )} />
          ) : (
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                {t('Checked at', 'Checked at')} {availability.checked_at ? availability.checked_at.slice(0, 19).replace('T', ' ') + 'Z' : '—'}{t('.\n                Components:', '.\n                Components:')} {availability.all_components_available ? 'all available' : 'some unavailable'} {t('·\n                Dependencies:', '·\n                Dependencies:')} {availability.all_dependencies_healthy ? 'all healthy' : 'some degraded'}
              </div>
              {availability.component_results && availability.component_results.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {availability.component_results.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                      <Badge tone={c.available ? 'green' : 'red'}>
                        {c.available ? 'up' : 'down'}
                      </Badge>
                      <code style={{ fontSize: 11 }}>{c.vm_name ?? '—'}</code>
                      {c.reason ? <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{c.reason}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={<Badge tone="navy">{ccrs.length}</Badge>}>{t('Change-control records', 'Change-control records')}</CardTitle>
          {ccrs.length === 0 ? (
            <EmptyState icon="ti-stamp" title={t('No change-control records', 'No change-control records')} description={t(
              'CCRs link approved changes to evidence. They appear here once filed via the API or admin UI.',
              'CCRs link approved changes to evidence. They appear here once filed via the API or admin UI.'
            )} />
          ) : (
            <div>
              {ccrs.map(ccr => {
                const {
                  t
                } = useI18n();

                return (
                  <div
                    key={ccr.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 130px 130px 100px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>
                        {ccr.change_ref || ccr.id.slice(0, 12)}
                        {ccr.gxp_revalidation_required ? (
                          <Badge tone="navy" icon="ti-flask">{t('GxP revalidation', 'GxP revalidation')}</Badge>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {ccr.description || ccr.change_type || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {ccr.requested_by || '—'}
                      {ccr.approved_by ? (
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                          ✓ {ccr.approved_by}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {ccr.quality_approved_by ? (
                        <Badge tone="green" icon="ti-circle-check">{ccr.quality_approved_by}</Badge>
                      ) : ccr.gxp_revalidation_required ? (
                        <Badge tone="amber">{t('QA pending', 'QA pending')}</Badge>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
                      {ccr.approved_at ? ccr.approved_at.slice(0, 10) : ccr.created_at ? ccr.created_at.slice(0, 10) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
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

const headerRowStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-text-tertiary)',
  textAlign: 'left',
}
