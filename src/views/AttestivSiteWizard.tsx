'use client'
// Sites / new — site creation wizard.
//
// Today's pilot has the site registry sourced from YAML files baked
// into the container image (policies/sites/*.yaml) plus a runtime
// store overlay. The YAML path is fine for the platform's seed data
// but the operator can't add a site without rebuilding the image.
// This wizard POSTs to /v1/sites which persists the new site to the
// runtime store; the registry rebuild after save makes the row
// appear immediately on /sites.
//
// Scope: identity tier only — site_id, display_name, site_type,
// city/country/region, optional DR pairing. The richer blocks
// (physical / connectivity / hosted_cis) live in YAML for now;
// they're the kind of fields a v2 wizard would walk the operator
// through one tab at a time. For the pilot, "list every datacenter
// we run" is the immediate need and identity fields cover it.

import { useEffect, useMemo, useState } from 'react'
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
import { useI18n } from '../lib/i18n'

type SiteType = 'primary_datacenter' | 'dr_datacenter' | 'cloud_region' | 'colocation' | 'branch_office'

type ExistingSite = {
  site_id: string
  display_name?: string
}

const SITE_TYPE_LABEL: Record<SiteType, { en: string; fr: string }> = {
  primary_datacenter: { en: 'Primary datacenter', fr: 'Datacenter principal' },
  dr_datacenter:      { en: 'DR datacenter',      fr: 'Datacenter de secours (PRA)' },
  cloud_region:       { en: 'Cloud region',       fr: 'Région cloud' },
  colocation:         { en: 'Colocation',         fr: 'Colocation' },
  branch_office:      { en: 'Branch office',      fr: 'Bureau distant' },
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function AttestivSiteWizard() {
  const { t } = useI18n()
  const router = useRouter()

  const [siteId, setSiteId] = useState('')
  const [siteIdTouched, setSiteIdTouched] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [siteType, setSiteType] = useState<SiteType>('primary_datacenter')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [drSite, setDrSite] = useState('')
  const [primarySite, setPrimarySite] = useState('')
  const [threshold, setThreshold] = useState<number>(50)

  const [existingSites, setExistingSites] = useState<ExistingSite[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-derive the site_id slug from the display name until the
  // operator types into the id field directly. Same pattern as the
  // connector wizard's name → instance_slug auto-fill.
  useEffect(() => {
    if (siteIdTouched) return
    setSiteId(slugify(displayName))
  }, [displayName, siteIdTouched])

  // Populate the DR-site dropdown from the existing site list so
  // operators don't have to remember site_ids. Failure is non-fatal
  // — the field stays empty and the operator can still type a
  // site_id by hand.
  useEffect(() => {
    let cancelled = false
    apiFetch('/sites')
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return
        const items = Array.isArray(body?.items) ? body.items : []
        setExistingSites(items.map((s: any) => ({ site_id: String(s.site_id), display_name: s.display_name })))
      })
      .catch(() => {
        // Silent — DR pairing is optional.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const siteTypeOptions = useMemo(() => {
    const entries = Object.entries(SITE_TYPE_LABEL) as Array<[SiteType, { en: string; fr: string }]>
    return entries.map(([value, labels]) => ({ value, label: t(labels.en, labels.en) }))
  }, [t])

  const drSiteOptions = useMemo(() => {
    return existingSites
      .filter((s) => s.site_id !== siteId)
      .map((s) => ({ value: s.site_id, label: s.display_name ? `${s.display_name} (${s.site_id})` : s.site_id }))
  }, [existingSites, siteId])

  function isValid(): string | null {
    if (!siteId.trim()) return t('site_id is required', 'site_id is required')
    if (!displayName.trim()) return t('Display name is required', 'Display name is required')
    if (!siteType) return t('Site type is required', 'Site type is required')
    if (threshold < 0 || threshold > 100) return t('Concentration threshold must be 0–100', 'Concentration threshold must be 0–100')
    return null
  }

  async function save() {
    const validationError = isValid()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const body = {
        site_id: siteId.trim(),
        display_name: displayName.trim(),
        site_type: siteType,
        city: city.trim(),
        country: country.trim(),
        region: region.trim(),
        dr_site: drSite.trim(),
        primary_site: primarySite.trim(),
        concentration_risk_threshold_pct: threshold,
      }
      const response = await apiFetch('/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(responseBody?.detail || responseBody?.error || `${response.status} ${response.statusText}`)
      }
      router.push('/sites')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create site')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
  const inputStyle: React.CSSProperties = {
    fontSize: 13,
    padding: '6px 10px',
    border: '1px solid var(--color-border-secondary)',
    borderRadius: 'var(--border-radius-md)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    width: '100%',
  }

  return (
    <>
      <Topbar
        title={t('Add a site', 'Add a site')}
        left={<Badge tone="navy">{t('admin only', 'admin only')}</Badge>}
        right={
          <GhostButton onClick={() => router.push('/sites')}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
            {t('Back to sites', 'Back to sites')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card>
          <CardTitle>{t('Identity', 'Identity')}</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Display name', 'Display name')}</label>
              <input
                style={inputStyle}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('Datacenter Paris 1', 'Datacenter Paris 1')}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Site ID (slug)', 'Site ID (slug)')}</label>
              <input
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                value={siteId}
                onChange={(e) => {
                  setSiteIdTouched(true)
                  setSiteId(e.target.value)
                }}
                placeholder="dc-paris-1"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Site type', 'Site type')}</label>
              <select
                style={inputStyle}
                value={siteType}
                onChange={(e) => setSiteType(e.target.value as SiteType)}
              >
                {siteTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Concentration threshold (%)', 'Concentration threshold (%)')}</label>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                style={inputStyle}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>{t('Location', 'Location')}</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('City', 'City')}</label>
              <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Country (2-letter)', 'Country (2-letter)')}</label>
              <input style={inputStyle} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="FR" maxLength={2} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Region', 'Region')}</label>
              <input style={inputStyle} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Île-de-France" />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>{t('DR pairing (optional)', 'DR pairing (optional)')}</CardTitle>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 0 }}>
            {t(
              'Link this site to its DR partner so cascade analysis and recovery-order calculation know which site to fall back to.',
              'Link this site to its DR partner so cascade analysis and recovery-order calculation know which site to fall back to.',
            )}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('DR site', 'DR site')}</label>
              <select style={inputStyle} value={drSite} onChange={(e) => setDrSite(e.target.value)}>
                <option value="">{t('— none —', '— none —')}</option>
                {drSiteOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {t('Set on a primary site to point at its DR partner.', 'Set on a primary site to point at its DR partner.')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>{t('Primary site', 'Primary site')}</label>
              <select style={inputStyle} value={primarySite} onChange={(e) => setPrimarySite(e.target.value)}>
                <option value="">{t('— none —', '— none —')}</option>
                {drSiteOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {t('Set on a DR site to point back at the primary it covers.', 'Set on a DR site to point back at the primary it covers.')}
              </span>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <GhostButton onClick={() => router.push('/sites')} disabled={saving}>
            {t('Cancel', 'Cancel')}
          </GhostButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? (
              <>
                <i className="ti ti-loader-2" aria-hidden="true" style={{ animation: 'attestiv-spin 1s linear infinite' }} />
                {t('Saving…', 'Saving…')}
              </>
            ) : (
              <>
                <i className="ti ti-device-floppy" aria-hidden="true" />
                {t('Create site', 'Create site')}
              </>
            )}
          </PrimaryButton>
        </div>

        <Card>
          <CardTitle>{t('What about hosted CIs and WAN links?', 'What about hosted CIs and WAN links?')}</CardTitle>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
            {t(
              'This wizard covers the identity tier (id, name, type, location, DR pairing). Hosted CIs, WAN links, physical power/cooling, and DORA Art.28 third-party metadata are richer blocks — they belong in YAML for now, under policies/sites/<site_id>.yaml. The runtime registry overlays whatever you save here on top of those YAML definitions, so it\'s safe to start with identity and add the deeper config later.',
              'This wizard covers the identity tier (id, name, type, location, DR pairing). Hosted CIs, WAN links, physical power/cooling, and DORA Art.28 third-party metadata are richer blocks — they belong in YAML for now, under policies/sites/<site_id>.yaml. The runtime registry overlays whatever you save here on top of those YAML definitions, so it\'s safe to start with identity and add the deeper config later.',
            )}
          </p>
        </Card>
      </div>
    </>
  )
}
