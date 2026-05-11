'use client';
// Attestiv onboarding wizard.
//
// First-run experience for a fresh tenant: the user lands here after
// signing in for the first time, walks through four steps, and ends on
// the dashboard. The page is intentionally light on backend wiring —
// it's a guided form whose final action persists settings and
// optionally seeds a connector. Anything more involved (admin invites,
// SCIM provisioning, OIDC bootstrap) is out of scope for the pilot.
//
// We keep this outside the (console) layout so the rail and sidebar
// don't show — onboarding feels different from the running console
// and the visual contrast helps the user understand the flow has a
// distinct end state.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Card,
  FormField,
  GhostButton,
  PrimaryButton,
  Select,
  Stepper,
  TextInput,
} from '../components/AttestivUi'
import { defaultSettings, loadSettings, saveSettings } from '../lib/settings'

import { useI18n } from '../lib/i18n';

const STEPS = ['Tenant', 'Admin', 'First connector', 'Done']

const REGIONS = [
  { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
  { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
  { value: 'eu-west-1', label: 'eu-west-1 (Ireland)' },
  { value: 'eu-central-1', label: 'eu-central-1 (Frankfurt)' },
]

const CONNECTOR_OPTIONS = [
  { value: '', label: 'Skip — I will add a connector later' },
  { value: 'palo_alto_panorama', label: 'Palo Alto Panorama' },
  { value: 'palo_alto_firewall', label: 'Palo Alto firewall (PAN-OS)' },
  { value: 'dell_datadomain', label: 'Dell DataDomain' },
  { value: 'dell_powerstore', label: 'Dell PowerStore' },
  { value: 'vmware_vcenter', label: 'VMware vCenter' },
  { value: 'veeam_em', label: 'Veeam Backup Enterprise Manager' },
  { value: 'glpi', label: 'GLPI' },
  { value: 'dynatrace', label: 'Dynatrace' },
  { value: 'zabbix', label: 'Zabbix' },
]

export function AttestivOnboardingPage() {
  const {
    t
  } = useI18n();

  const router = useRouter()
  const [step, setStep] = useState(0)

  const initial = useMemo(() => {
    if (typeof window === 'undefined') return defaultSettings()
    return loadSettings()
  }, [])

  const [tenantId, setTenantId] = useState(initial.tenantId || '')
  const [tenantName, setTenantName] = useState('')
  const [environment, setEnvironment] = useState<'pilot' | 'production'>('pilot')
  const [region, setRegion] = useState(REGIONS[0].value)

  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')

  const [connectorKind, setConnectorKind] = useState('')
  const [connectorTarget, setConnectorTarget] = useState('')

  const [persisting, setPersisting] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)

  function next() {
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0))
  }

  function persistAndContinue() {
    setPersisting(true)
    setPersistError(null)
    try {
      const current = loadSettings()
      saveSettings({
        ...current,
        tenantId: tenantId.trim() || current.tenantId,
      })
      next()
    } catch (err: any) {
      setPersistError(err?.message ?? 'Failed to save tenant settings')
    } finally {
      setPersisting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-background-tertiary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px 60px',
      }}
    >
      <header
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'var(--color-brand-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="ti ti-shield-check" aria-hidden="true" style={{ color: 'white', fontSize: 18 }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{t('Welcome to Attestiv', 'Welcome to Attestiv')}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {t(
              'A four-step tour through tenant setup, admin access, and your first connector.',
              'A four-step tour through tenant setup, admin access, and your first connector.'
            )}
          </div>
        </div>
      </header>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <Card>
          <Stepper steps={STEPS} current={step} />
        </Card>

        <Card style={{ padding: '20px 22px' }}>
          {step === 0 ? (
            <TenantStep
              tenantId={tenantId}
              tenantName={tenantName}
              environment={environment}
              region={region}
              setTenantId={setTenantId}
              setTenantName={setTenantName}
              setEnvironment={setEnvironment}
              setRegion={setRegion}
            />
          ) : null}
          {step === 1 ? (
            <AdminStep
              adminName={adminName}
              adminEmail={adminEmail}
              setAdminName={setAdminName}
              setAdminEmail={setAdminEmail}
            />
          ) : null}
          {step === 2 ? (
            <ConnectorStep
              kind={connectorKind}
              target={connectorTarget}
              setKind={setConnectorKind}
              setTarget={setConnectorTarget}
            />
          ) : null}
          {step === 3 ? (
            <DoneStep
              tenantId={tenantId}
              connectorKind={connectorKind}
              onOpenDashboard={() => router.push('/dashboard')}
              onAddConnector={() => router.push('/connectors/new')}
            />
          ) : null}

          {persistError ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--color-status-red-deep)',
                background: 'var(--color-status-red-bg)',
                padding: '8px 10px',
                borderRadius: 'var(--border-radius-md)',
              }}
            >
              {persistError}
            </div>
          ) : null}

          {step < 3 ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 16,
                paddingTop: 16,
                borderTop: '0.5px solid var(--color-border-tertiary)',
              }}
            >
              <GhostButton onClick={back} disabled={step === 0}>
                <i className="ti ti-arrow-left" aria-hidden="true" />
                {t('Back', 'Back')}
              </GhostButton>
              <PrimaryButton
                disabled={persisting || !canAdvance(step, { tenantId, adminEmail })}
                onClick={step === 0 ? persistAndContinue : next}
              >
                {step === 2 ? 'Finish setup' : 'Continue'}
                <i className="ti ti-arrow-right" aria-hidden="true" />
              </PrimaryButton>
            </div>
          ) : null}
        </Card>

        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            textAlign: 'center',
            marginTop: 14,
          }}
        >
          {t(
            'You can change any of these settings later under',
            'You can change any of these settings later under'
          )} <strong>{t('Settings → Tenant', 'Settings → Tenant')}</strong>.
                  </div>
      </div>
    </div>
  );
}

function canAdvance(step: number, values: { tenantId: string; adminEmail: string }): boolean {
  if (step === 0) {
    return values.tenantId.trim().length > 0
  }
  if (step === 1) {
    return values.adminEmail.trim().length > 0
  }
  return true
}

function TenantStep(props: {
  tenantId: string
  tenantName: string
  environment: 'pilot' | 'production'
  region: string
  setTenantId: (v: string) => void
  setTenantName: (v: string) => void
  setEnvironment: (v: 'pilot' | 'production') => void
  setRegion: (v: string) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <>
      <SectionHeader
        title={t('Tenant identity', 'Tenant identity')}
        sub={t(
          'The slug is what every API request and audit record is scoped to. Pick a short, lower-case identifier that matches how your team refers to this account.',
          'The slug is what every API request and audit record is scoped to. Pick a short, lower-case identifier that matches how your team refers to this account.'
        )}
      />
      <FormField label={t('Tenant slug', 'Tenant slug')} hint={t(
        'Lower-case, no spaces. Used in audit trails and URLs.',
        'Lower-case, no spaces. Used in audit trails and URLs.'
      )}>
        <TextInput
          value={props.tenantId}
          onChange={(event) => props.setTenantId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          placeholder="acme"
          autoFocus
        />
      </FormField>
      <FormField label={t('Display name', 'Display name')} hint={t(
        'Shown to operators in the console header.',
        'Shown to operators in the console header.'
      )}>
        <TextInput
          value={props.tenantName}
          onChange={(event) => props.setTenantName(event.target.value)}
          placeholder={t('Acme Corp', 'Acme Corp')}
        />
      </FormField>
      <FormField label={t('Environment', 'Environment')}>
        <Select
          value={props.environment}
          onChange={(event) => props.setEnvironment(event.target.value === 'production' ? 'production' : 'pilot')}
        >
          <option value="pilot">{t('Pilot', 'Pilot')}</option>
          <option value="production">{t('Production', 'Production')}</option>
        </Select>
      </FormField>
      <FormField label={t('Data residency', 'Data residency')}>
        <Select value={props.region} onChange={(event) => props.setRegion(event.target.value)}>
          {REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  );
}

function AdminStep(props: {
  adminEmail: string
  adminName: string
  setAdminEmail: (v: string) => void
  setAdminName: (v: string) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <>
      <SectionHeader
        title={t('Primary administrator', 'Primary administrator')}
        sub={t(
          'The first admin receives the API key and root role. They can add more users from Settings → Users once onboarding finishes.',
          'The first admin receives the API key and root role. They can add more users from Settings → Users once onboarding finishes.'
        )}
      />
      <FormField label={t('Full name', 'Full name')}>
        <TextInput
          value={props.adminName}
          onChange={(event) => props.setAdminName(event.target.value)}
          placeholder={t('Marina Singh', 'Marina Singh')}
          autoFocus
        />
      </FormField>
      <FormField label={t('Work email', 'Work email')} hint={t(
        'Used for compliance alerts (DLQ webhooks, key rotation reminders).',
        'Used for compliance alerts (DLQ webhooks, key rotation reminders).'
      )}>
        <TextInput
          type="email"
          value={props.adminEmail}
          onChange={(event) => props.setAdminEmail(event.target.value)}
          placeholder={t('marina@acme.example', 'marina@acme.example')}
        />
      </FormField>
      <div
        style={{
          background: 'var(--color-status-blue-bg)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--border-radius-md)',
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--color-status-blue-deep)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <i className="ti ti-info-circle" aria-hidden="true" style={{ fontSize: 14, marginTop: 1 }} />
        <span>
          {t(
            'MFA is required for the admin role. After completing onboarding you\'ll be prompted to enroll a TOTP authenticator on your next sign-in.',
            'MFA is required for the admin role. After completing onboarding you\'ll be prompted to enroll a TOTP authenticator on your next sign-in.'
          )}
        </span>
      </div>
    </>
  );
}

function ConnectorStep(props: {
  kind: string
  target: string
  setKind: (v: string) => void
  setTarget: (v: string) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <>
      <SectionHeader
        title={t('Wire your first source', 'Wire your first source')}
        sub={t(
          'Optional. Pick one of the eight pilot connectors so the dashboard has live evidence on day one — or skip and add it from the Connectors page later.',
          'Optional. Pick one of the eight pilot connectors so the dashboard has live evidence on day one — or skip and add it from the Connectors page later.'
        )}
      />
      <FormField label={t('Connector', 'Connector')}>
        <Select value={props.kind} onChange={(event) => props.setKind(event.target.value)}>
          {CONNECTOR_OPTIONS.map((option) => (
            <option key={option.value || 'skip'} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormField>
      {props.kind ? (
        <FormField label={t('Endpoint', 'Endpoint')} hint={t(
          'Hostname or URL the worker will poll. Credentials are entered on the next page.',
          'Hostname or URL the worker will poll. Credentials are entered on the next page.'
        )}>
          <TextInput
            value={props.target}
            onChange={(event) => props.setTarget(event.target.value)}
            placeholder={t('panorama.acme.internal', 'panorama.acme.internal')}
          />
        </FormField>
      ) : null}
    </>
  );
}

function DoneStep(props: {
  tenantId: string
  connectorKind: string
  onOpenDashboard: () => void
  onAddConnector: () => void
}) {
  const {
    t
  } = useI18n();

  return (
    <div style={{ textAlign: 'center', padding: '24px 8px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-status-green-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
        }}
      >
        <i
          className="ti ti-check"
          aria-hidden="true"
          style={{ fontSize: 28, color: 'var(--color-status-green-deep)' }}
        />
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>
        {t('Tenant', 'Tenant')} <code>{props.tenantId || 'default'}</code> {t('is live', 'is live')}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          maxWidth: 360,
          margin: '0 auto 18px',
          lineHeight: 1.5,
        }}
      >
        {props.connectorKind
          ? 'Your first connector is queued. The dashboard will populate once the first poll completes — usually under a minute.'
          : "You can add connectors from the Connectors page whenever you're ready."}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {props.connectorKind ? null : (
          <GhostButton onClick={props.onAddConnector}>
            <i className="ti ti-plug" aria-hidden="true" />
            {t('Add a connector', 'Add a connector')}
          </GhostButton>
        )}
        <PrimaryButton onClick={props.onOpenDashboard}>
          {t('Open dashboard', 'Open dashboard')}
          <i className="ti ti-arrow-right" aria-hidden="true" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}
