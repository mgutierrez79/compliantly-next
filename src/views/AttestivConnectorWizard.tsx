'use client';
// Connector wizard.
//
// Four-step flow that lives inside the console: pick connector kind,
// fill credentials, run a connection test, save & schedule. The page
// keeps form state in React; only the final step makes a real backend
// call. The test button is best-effort — if /v1/connectors/test isn't
// available it's degraded into a "deferred" outcome so the user can
// still complete the wizard.
//
// Why a wizard rather than one long form: the eight pilot connectors
// have wildly different credential shapes (PAN-OS API key, vCenter
// SSO, Veeam OAuth, GLPI app+user tokens). Splitting the steps lets
// the credential block be replaced cleanly per kind without the rest
// of the form rerendering.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Badge,
  Card,
  FormField,
  GhostButton,
  PrimaryButton,
  Select,
  Stepper,
  TextInput,
  Topbar,
} from '../components/AttestivUi'
import { loadSettings } from '../lib/settings'
import { ConnectorLogo, connectorBrandHex } from '../components/ConnectorLogo'
import {
  loadConnectorCatalog,
  authFieldsFor,
  type ConnectorCatalogEntry,
} from '../lib/connectorCatalog'
import { describeAuthField, groupAuthMethods, type AuthMethod } from '../lib/connectorAuthFields'

import { useI18n } from '../lib/i18n';

type CredentialField = {
  key: string
  label: string
  type?: 'text' | 'password'
  hint?: string
  required?: boolean
}

type ConnectorKind = {
  value: string
  label: string
  category: 'Network' | 'Storage' | 'Virtualization' | 'Backup' | 'ITSM' | 'Observability'
  endpointHint: string
  fields: CredentialField[]
  pollDefault: number
}

const STEPS = ['Pick connector', 'Credentials', 'Test connection', 'Save & schedule']

const CONNECTORS: ConnectorKind[] = [
  // Note on `fields`: this is now a SEED list. The wizard merges
  // each kind's seed fields with the catalog's `auth[]` array at
  // runtime (loadConnectorCatalog → authFieldsFor). Anything the
  // catalog declares that isn't in the seed gets rendered with the
  // descriptor map's defaults; anything in the seed that isn't in
  // the catalog still renders (so vendor niceties like "serial"
  // survive). Result: the wizard cannot drift from backend reality.
  {
    value: 'palo_alto_panorama',
    label: 'Palo Alto Panorama',
    category: 'Network',
    endpointHint: 'https://panorama.acme.internal',
    fields: [],
    pollDefault: 600,
  },
  {
    value: 'palo_alto_firewall',
    label: 'Palo Alto firewall (PAN-OS)',
    category: 'Network',
    endpointHint: 'https://fw01.acme.internal',
    fields: [
      { key: 'serial', label: 'Serial number', hint: 'Used for HA-aware scoping.' },
    ],
    pollDefault: 600,
  },
  {
    value: 'dell_datadomain',
    label: 'Dell DataDomain',
    category: 'Storage',
    endpointHint: 'https://dd-prod.acme.internal',
    fields: [
      { key: 'username', label: 'Username', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    pollDefault: 1800,
  },
  {
    value: 'dell_powerstore',
    label: 'Dell PowerStore',
    category: 'Storage',
    endpointHint: 'https://powerstore.acme.internal',
    fields: [
      { key: 'username', label: 'Username', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    pollDefault: 1800,
  },
  {
    value: 'vmware_vcenter',
    label: 'VMware vCenter',
    category: 'Virtualization',
    endpointHint: 'https://vcenter.acme.internal',
    fields: [
      { key: 'username', label: 'SSO username', required: true, hint: 'Service account, e.g. attestiv@vsphere.local.' },
      { key: 'password', label: 'SSO password', type: 'password', required: true },
    ],
    pollDefault: 900,
  },
  {
    value: 'veeam_em',
    label: 'Veeam Backup Enterprise Manager',
    category: 'Backup',
    endpointHint: 'https://veeam-em.acme.internal',
    fields: [
      { key: 'client_id', label: 'OAuth client id', required: true },
      { key: 'client_secret', label: 'OAuth client secret', type: 'password', required: true },
    ],
    pollDefault: 1800,
  },
  {
    value: 'glpi',
    label: 'GLPI',
    category: 'ITSM',
    endpointHint: 'https://glpi.acme.example/apirest.php',
    fields: [
      { key: 'app_token', label: 'App token', type: 'password', required: true },
      { key: 'user_token', label: 'User token', type: 'password', required: true },
    ],
    pollDefault: 1800,
  },
  {
    value: 'dynatrace',
    label: 'Dynatrace',
    category: 'Observability',
    endpointHint: 'https://abc12345.live.dynatrace.com',
    fields: [
      { key: 'api_token', label: 'API token (Api-Token)', type: 'password', required: true, hint: 'Needs problems.read and metrics.read scopes.' },
    ],
    pollDefault: 600,
  },
  {
    value: 'zabbix',
    label: 'Zabbix',
    category: 'Observability',
    endpointHint: 'https://zabbix.acme.example',
    fields: [
      { key: 'username', label: 'Username', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    pollDefault: 600,
  },
]

type TestResult =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'pass'; details: string }
  | { state: 'fail'; details: string }
  | { state: 'deferred'; details: string }

export function AttestivConnectorWizard() {
  const {
    t
  } = useI18n();

  const router = useRouter()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<string>('palo_alto_panorama')
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [pollSeconds, setPollSeconds] = useState<number>(600)
  // TLS verification defaults to ON. Turning it off is required for
  // self-signed certs on private-network deployments but is a
  // foot-gun — the wizard surfaces a red warning when off.
  const [verifyTLS, setVerifyTLS] = useState<boolean>(true)
  const [testResult, setTestResult] = useState<TestResult>({ state: 'idle' })
  const [savingError, setSavingError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; created_at: string } | null>(null)
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([])

  // Fetch the catalog once at mount. The wizard renders before the
  // fetch resolves; in that window the credential step shows only
  // the seed fields. Once the catalog lands, missing auth fields
  // (e.g. Palo Alto's username/password) appear without a re-render
  // dance because authFieldsFor reads the live catalog state.
  useEffect(() => {
    let cancelled = false
    loadConnectorCatalog()
      .then((entries) => {
        if (!cancelled) setCatalog(entries)
      })
      .catch(() => {
        // Catalog fetch failures degrade the wizard to seed-only
        // fields. The user can still configure connectors using
        // the static fields; the only thing they lose is the
        // catalog-declared extras (e.g. PAN-OS username/password).
      })
    return () => {
      cancelled = true
    }
  }, [])

  const connector = useMemo(() => CONNECTORS.find((entry) => entry.value === kind) ?? CONNECTORS[0], [kind])

  // mergedFields is the union of (a) the seed list curated in the
  // wizard and (b) the auth keys the catalog declares for this
  // connector. Seed entries come first to preserve curated label
  // copy / hints; catalog entries that aren't in the seed get
  // appended with descriptor-map defaults. Dupes are dropped.
  const mergedFields = useMemo<CredentialField[]>(() => {
    const seen = new Set<string>(connector.fields.map((f) => f.key))
    const out: CredentialField[] = [...connector.fields]
    for (const key of authFieldsFor(kind, catalog)) {
      if (seen.has(key)) continue
      seen.add(key)
      const desc = describeAuthField(key)
      out.push({
        key,
        label: desc.label,
        type: desc.type === 'password' ? 'password' : 'text',
        hint: desc.hint,
      })
    }
    return out
  }, [connector, kind, catalog])

  // Group the merged fields into common (non-auth) fields and a list
  // of mutually-exclusive auth methods. When the connector accepts
  // more than one auth method (e.g. Palo Alto: api_key OR
  // username/password), the wizard renders a picker and only the
  // active method's inputs.
  const { commonFields, authMethods } = useMemo(() => {
    const grouped = groupAuthMethods(mergedFields)
    return { commonFields: grouped.commonFields, authMethods: grouped.methods }
  }, [mergedFields])

  const [authMethodKey, setAuthMethodKey] = useState<string>('')

  // Auto-pick the first method when the connector kind changes (or
  // the catalog arrives after mount). If the user previously chose a
  // method that no longer exists for the current kind, fall back to
  // the first available method so the form is never in an invalid
  // state.
  useEffect(() => {
    if (authMethods.length === 0) {
      setAuthMethodKey('')
      return
    }
    if (!authMethods.some((m) => m.key === authMethodKey)) {
      setAuthMethodKey(authMethods[0].key)
    }
  }, [authMethods, authMethodKey])

  const activeAuthMethod: AuthMethod | undefined = useMemo(
    () => authMethods.find((m) => m.key === authMethodKey) ?? authMethods[0],
    [authMethods, authMethodKey],
  )

  // The fields actually rendered in the credentials step: common
  // fields (always visible) + the active method's fields. Field
  // metadata comes from mergedFields so we reuse the descriptor copy.
  const fieldByKey = useMemo(() => {
    const map = new Map<string, CredentialField>()
    mergedFields.forEach((f) => map.set(f.key, f))
    return map
  }, [mergedFields])

  const renderedFields = useMemo<CredentialField[]>(() => {
    const result: CredentialField[] = [...commonFields]
    if (activeAuthMethod) {
      for (const key of activeAuthMethod.fieldKeys) {
        const field = fieldByKey.get(key)
        if (field) result.push({ ...field, required: true })
      }
    }
    return result
  }, [commonFields, activeAuthMethod, fieldByKey])

  // When the user switches auth methods, drop credentials that
  // belong to methods other than the active one. We never want to
  // send both `api_key` and `password` to the backend just because
  // the user typed values into both before flipping the radio.
  function pickAuthMethod(nextKey: string) {
    setAuthMethodKey(nextKey)
    const next = authMethods.find((m) => m.key === nextKey)
    if (!next) return
    const keepKeys = new Set<string>([...commonFields.map((f) => f.key), ...next.fieldKeys])
    setCredentials((current) => {
      const trimmed: Record<string, string> = {}
      for (const [k, v] of Object.entries(current)) {
        if (keepKeys.has(k)) trimmed[k] = v
      }
      return trimmed
    })
  }

  function next() {
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0))
  }

  function selectKind(nextKind: string) {
    const entry = CONNECTORS.find((c) => c.value === nextKind)
    setKind(nextKind)
    setCredentials({})
    if (entry) {
      setPollSeconds(entry.pollDefault)
      if (!endpoint) {
        setEndpoint('')
      }
    }
  }

  function setCredential(key: string, value: string) {
    setCredentials((current) => ({ ...current, [key]: value }))
  }

  async function runTest() {
    setTestResult({ state: 'running' })
    const settings = loadSettings()
    const baseUrl = settings.apiBaseUrl?.trim()?.replace(/\/+$/, '')
    if (!baseUrl || !settings.apiKey) {
      setTestResult({
        state: 'deferred',
        details: 'No API key configured locally — connection test skipped. The wizard will save the connector and the worker will attempt the first poll.',
      })
      return
    }
    try {
      const response = await fetch(`${baseUrl}/v1/connectors/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ kind, endpoint, credentials }),
      })
      if (response.status === 404 || response.status === 405) {
        setTestResult({
          state: 'deferred',
          details: 'Backend has no /v1/connectors/test endpoint yet. The connector will be saved and the worker will validate on first poll.',
        })
        return
      }
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // The Go API returns errors as { "detail": "..." } via its
        // writeError helper. Some legacy endpoints used { "error": "..." }
        // — accept both before falling back to the bare status text so
        // we never lose the real upstream message (TLS failure, auth
        // rejection, unreachable host) in a generic "502 Bad Gateway".
        const message =
          (typeof body?.detail === 'string' && body.detail) ||
          (typeof body?.error === 'string' && body.error) ||
          `${response.status} ${response.statusText}`
        throw new Error(message)
      }
      setTestResult({
        state: 'pass',
        details: typeof body?.detail === 'string' ? body.detail : 'Endpoint reachable, credentials accepted.',
      })
    } catch (err: any) {
      setTestResult({
        state: 'fail',
        details: err?.message ?? 'Connection test failed',
      })
    }
  }

  async function save() {
    setSavingError(null)
    const settings = loadSettings()
    const baseUrl = settings.apiBaseUrl?.trim()?.replace(/\/+$/, '')
    if (!baseUrl || !settings.apiKey) {
      setSavingError('Set the API base URL and API key in Login first.')
      return
    }
    try {
      const response = await fetch(`${baseUrl}/v1/connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          name: name.trim() || kind,
          kind,
          endpoint,
          // verify_tls travels alongside credentials so the backend
          // config map carries the same shape connectors already
          // read (boolConfig(config["verify_tls"], envBool(...))).
          credentials: { ...credentials, verify_tls: verifyTLS ? 'true' : 'false' },
          poll_interval_seconds: pollSeconds,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // Mirror the test-step parser: detail is the Go API's
        // convention, error is the legacy form. Either way, surface
        // the real upstream message rather than a generic status.
        const message =
          (typeof body?.detail === 'string' && body.detail) ||
          (typeof body?.error === 'string' && body.error) ||
          `${response.status} ${response.statusText}`
        throw new Error(message)
      }
      setSaved({
        id: typeof body?.id === 'string' ? body.id : 'pending',
        created_at: typeof body?.created_at === 'string' ? body.created_at : new Date().toISOString(),
      })
    } catch (err: any) {
      setSavingError(err?.message ?? 'Failed to save connector')
    }
  }

  return (
    <>
      <Topbar
        title={t('New connector', 'New connector')}
        right={
          <GhostButton onClick={() => router.push('/connectors')}>
            <i className="ti ti-x" aria-hidden="true" />
            {t('Cancel', 'Cancel')}
          </GhostButton>
        }
      />
      <div className="attestiv-content">
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Card>
            <Stepper steps={STEPS} current={step} />
          </Card>

          <Card style={{ padding: '20px 22px' }}>
            {step === 0 ? (
              <PickStep kind={kind} onChange={selectKind} />
            ) : null}
            {step === 1 ? (
              <CredentialsStep
                connector={connector}
                fields={renderedFields}
                authMethods={authMethods}
                activeAuthMethodKey={activeAuthMethod?.key ?? ''}
                onPickAuthMethod={pickAuthMethod}
                name={name}
                endpoint={endpoint}
                credentials={credentials}
                pollSeconds={pollSeconds}
                verifyTLS={verifyTLS}
                setName={setName}
                setEndpoint={setEndpoint}
                setCredential={setCredential}
                setPollSeconds={setPollSeconds}
                setVerifyTLS={setVerifyTLS}
              />
            ) : null}
            {step === 2 ? (
              <TestStep result={testResult} onRun={runTest} onReset={() => setTestResult({ state: 'idle' })} connector={connector} />
            ) : null}
            {step === 3 ? (
              <SaveStep
                connector={connector}
                name={name}
                endpoint={endpoint}
                pollSeconds={pollSeconds}
                saved={saved}
                error={savingError}
                onSave={save}
                onOpenList={() => router.push('/connectors')}
              />
            ) : null}

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
              {step < STEPS.length - 1 ? (
                <PrimaryButton
                  disabled={!canAdvance(step, { renderedFields, name, endpoint, credentials, testResult })}
                  onClick={next}
                >
                  {t('Continue', 'Continue')}
                  <i className="ti ti-arrow-right" aria-hidden="true" />
                </PrimaryButton>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function canAdvance(
  step: number,
  values: {
    renderedFields: CredentialField[]
    name: string
    endpoint: string
    credentials: Record<string, string>
    testResult: TestResult
  },
): boolean {
  if (step === 0) {
    return true
  }
  if (step === 1) {
    if (!values.endpoint.trim()) return false
    for (const field of values.renderedFields) {
      if (field.required && !values.credentials[field.key]?.trim()) {
        return false
      }
    }
    return true
  }
  if (step === 2) {
    return values.testResult.state === 'pass' || values.testResult.state === 'deferred'
  }
  return true
}

function PickStep({ kind, onChange }: { kind: string; onChange: (next: string) => void }) {
  const {
    t
  } = useI18n();

  return (
    <>
      <SectionHeader
        title={t('Choose a source', 'Choose a source')}
        sub={t(
          'Eight connector kinds are available in the pilot. Each pulls a different evidence shape (firewall config, snapshot lineage, vCenter inventory, observability incidents) into the same signed pipeline.',
          'Eight connector kinds are available in the pilot. Each pulls a different evidence shape (firewall config, snapshot lineage, vCenter inventory, observability incidents) into the same signed pipeline.'
        )}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {CONNECTORS.map((connector) => {
          const active = connector.value === kind
          const brandHex = connectorBrandHex(connector.value)
          return (
            <button
              key={connector.value}
              type="button"
              onClick={() => onChange(connector.value)}
              style={{
                textAlign: 'left',
                background: active ? 'var(--color-status-blue-bg)' : 'var(--color-background-primary)',
                border: active
                  ? '1px solid var(--color-brand-blue)'
                  : '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--border-radius-md)',
                padding: '10px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: brandHex ? `${brandHex}1A` : 'var(--color-background-tertiary)',
                }}
              >
                <ConnectorLogo name={connector.value} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {connector.label}
                  </span>
                  {active ? <i className="ti ti-check" aria-hidden="true" style={{ color: 'var(--color-brand-blue)', flexShrink: 0 }} /> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  {connector.category}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </>
  );
}

function CredentialsStep(props: {
  connector: ConnectorKind
  // fields is the list to render: common fields + the active auth
  // method's fields only. Non-active methods are hidden.
  fields: CredentialField[]
  authMethods: AuthMethod[]
  activeAuthMethodKey: string
  onPickAuthMethod: (key: string) => void
  name: string
  endpoint: string
  credentials: Record<string, string>
  pollSeconds: number
  verifyTLS: boolean
  setName: (v: string) => void
  setEndpoint: (v: string) => void
  setCredential: (key: string, value: string) => void
  setPollSeconds: (v: number) => void
  setVerifyTLS: (v: boolean) => void
}) {
  const {
    t
  } = useI18n();

  const activeMethod = props.authMethods.find((m) => m.key === props.activeAuthMethodKey)
  const showMethodPicker = props.authMethods.length > 1
  return (
    <>
      <SectionHeader
        title={`Configure ${props.connector.label}`}
        sub={t(
          'Credentials are encrypted at rest using the platform signing key. The worker uses them on every poll and never logs the cleartext.',
          'Credentials are encrypted at rest using the platform signing key. The worker uses them on every poll and never logs the cleartext.'
        )}
      />
      <FormField label={t('Display name', 'Display name')} hint={t(
        'Shown in the connector registry. Defaults to the kind if empty.',
        'Shown in the connector registry. Defaults to the kind if empty.'
      )}>
        <TextInput
          value={props.name}
          onChange={(event) => props.setName(event.target.value)}
          placeholder={props.connector.label}
        />
      </FormField>
      <FormField label={t('Endpoint', 'Endpoint')} hint={`e.g. ${props.connector.endpointHint}`}>
        <TextInput
          value={props.endpoint}
          onChange={(event) => props.setEndpoint(event.target.value)}
          placeholder={props.connector.endpointHint}
        />
      </FormField>
      {showMethodPicker ? (
        <FormField
          label={t('Authentication method', 'Authentication method')}
          hint={t(
            'Pick one. Only the selected method\'s credentials are sent to the connector.',
            'Pick one. Only the selected method\'s credentials are sent to the connector.'
          )}
        >
          <AuthMethodPicker
            methods={props.authMethods}
            activeKey={props.activeAuthMethodKey}
            onPick={props.onPickAuthMethod}
          />
          {activeMethod?.hint ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              {activeMethod.hint}
            </div>
          ) : null}
        </FormField>
      ) : null}
      {props.fields.map((field) => (
        <FormField key={field.key} label={field.label} hint={field.hint}>
          <TextInput
            type={field.type === 'password' ? 'password' : 'text'}
            value={props.credentials[field.key] ?? ''}
            onChange={(event) => props.setCredential(field.key, event.target.value)}
          />
        </FormField>
      ))}
      <FormField label={t('Poll interval', 'Poll interval')} hint={t(
        'How often the worker collects evidence. Lower bound is enforced server-side.',
        'How often the worker collects evidence. Lower bound is enforced server-side.'
      )}>
        <Select
          value={String(props.pollSeconds)}
          onChange={(event) => props.setPollSeconds(Number(event.target.value))}
        >
          <option value="300">{t('Every 5 minutes', 'Every 5 minutes')}</option>
          <option value="600">{t('Every 10 minutes', 'Every 10 minutes')}</option>
          <option value="900">{t('Every 15 minutes', 'Every 15 minutes')}</option>
          <option value="1800">{t('Every 30 minutes', 'Every 30 minutes')}</option>
          <option value="3600">{t('Every hour', 'Every hour')}</option>
          <option value="21600">{t('Every 6 hours', 'Every 6 hours')}</option>
        </Select>
      </FormField>
      <FormField
        label={t('TLS certificate verification', 'TLS certificate verification')}
        hint={t(
          'Leave on unless the target uses a self-signed or internal-CA certificate the platform doesn\'t trust.',
          'Leave on unless the target uses a self-signed or internal-CA certificate the platform doesn\'t trust.'
        )}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={props.verifyTLS}
            onChange={(event) => props.setVerifyTLS(event.target.checked)}
          />
          <span>{t(
            'Verify TLS certificate (recommended)',
            'Verify TLS certificate (recommended)'
          )}</span>
        </label>
        {!props.verifyTLS ? (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              fontSize: 11,
              border: '0.5px solid var(--color-status-red-mid)',
              background: 'var(--color-status-red-bg)',
              color: 'var(--color-status-red-deep)',
              borderRadius: 'var(--border-radius-md)',
            }}
          >
            <strong>{t('Insecure:', 'Insecure:')}</strong> {t(
              'the worker will accept any certificate the endpoint presents.\n            This disables protection against man-in-the-middle attacks for this connector and must\n            be documented as a compensating control in your security policy.',
              'the worker will accept any certificate the endpoint presents.\n            This disables protection against man-in-the-middle attacks for this connector and must\n            be documented as a compensating control in your security policy.'
            )}
          </div>
        ) : null}
      </FormField>
    </>
  );
}

function TestStep({
  result,
  connector,
  onRun,
  onReset,
}: {
  result: TestResult
  connector: ConnectorKind
  onRun: () => void
  onReset: () => void
}) {
  const {
    t
  } = useI18n();

  return (
    <>
      <SectionHeader
        title={t('Test the connection', 'Test the connection')}
        sub={`Sends a no-op probe to ${connector.label}. The connector is not saved until you continue past this step.`}
      />
      {result.state === 'idle' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <PrimaryButton onClick={onRun}>
            <i className="ti ti-plug-connected" aria-hidden="true" />
            {t('Run connection test', 'Run connection test')}
          </PrimaryButton>
        </div>
      ) : null}
      {result.state === 'running' ? (
        <ResultBanner tone="blue" icon="ti-loader-2" title={t('Running probe...', 'Running probe...')} sub={t(
          'Reaching out to the configured endpoint.',
          'Reaching out to the configured endpoint.'
        )} spin />
      ) : null}
      {result.state === 'pass' ? (
        <ResultBanner tone="green" icon="ti-circle-check" title={t('Connection succeeded', 'Connection succeeded')} sub={result.details} />
      ) : null}
      {result.state === 'fail' ? (
        <ResultBanner tone="red" icon="ti-alert-triangle" title={t('Connection failed', 'Connection failed')} sub={result.details} />
      ) : null}
      {result.state === 'deferred' ? (
        <ResultBanner tone="amber" icon="ti-clock-pause" title={t('Test deferred', 'Test deferred')} sub={result.details} />
      ) : null}
      {result.state === 'fail' || result.state === 'pass' || result.state === 'deferred' ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <GhostButton onClick={onReset}>
            <i className="ti ti-refresh" aria-hidden="true" />
            {t('Run again', 'Run again')}
          </GhostButton>
        </div>
      ) : null}
    </>
  );
}

function SaveStep(props: {
  connector: ConnectorKind
  name: string
  endpoint: string
  pollSeconds: number
  saved: { id: string; created_at: string } | null
  error: string | null
  onSave: () => void
  onOpenList: () => void
}) {
  const {
    t
  } = useI18n();

  if (props.saved) {
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
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{t('Connector saved', 'Connector saved')}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 18 }}>ID <code>{props.saved.id}</code> {t('· queued for first poll.', '· queued for first poll.')}
        </div>
        <PrimaryButton onClick={props.onOpenList}>
          <i className="ti ti-list" aria-hidden="true" />
          {t('Back to connectors', 'Back to connectors')}
        </PrimaryButton>
      </div>
    );
  }
  return (
    <>
      <SectionHeader title={t('Review and save', 'Review and save')} sub={t(
        'The worker will pick up the new connector on its next poll cycle.',
        'The worker will pick up the new connector on its next poll cycle.'
      )} />
      <SummaryRow label={t('Kind', 'Kind')} value={props.connector.label} />
      <SummaryRow label={t('Display name', 'Display name')} value={props.name || props.connector.label} />
      <SummaryRow label={t('Endpoint', 'Endpoint')} value={props.endpoint} />
      <SummaryRow label={t('Poll interval', 'Poll interval')} value={`${props.pollSeconds}s`} />
      {props.error ? (
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
          {props.error}
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <PrimaryButton onClick={props.onSave}>
          <i className="ti ti-device-floppy" aria-hidden="true" />
          {t('Save connector', 'Save connector')}
        </PrimaryButton>
      </div>
    </>
  );
}

function ResultBanner({
  tone,
  icon,
  title,
  sub,
  spin,
}: {
  tone: 'green' | 'red' | 'amber' | 'blue'
  icon: string
  title: string
  sub: string
  spin?: boolean
}) {
  const palette = {
    green: { bg: 'var(--color-status-green-bg)', fg: 'var(--color-status-green-deep)' },
    red: { bg: 'var(--color-status-red-bg)', fg: 'var(--color-status-red-deep)' },
    amber: { bg: 'var(--color-status-amber-bg)', fg: 'var(--color-status-amber-text)' },
    blue: { bg: 'var(--color-status-blue-bg)', fg: 'var(--color-status-blue-deep)' },
  }[tone]
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        background: palette.bg,
        color: palette.fg,
        borderRadius: 'var(--border-radius-md)',
        padding: '14px 16px',
        alignItems: 'flex-start',
      }}
    >
      <i
        className={`ti ${icon}`}
        aria-hidden="true"
        style={{ fontSize: 18, marginTop: 1, animation: spin ? 'attestiv-spin 1s linear infinite' : undefined }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12 }}>{sub}</div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value || <Badge tone="amber">missing</Badge>}</span>
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

// AuthMethodPicker is a segmented-button row for choosing between
// mutually-exclusive authentication methods (e.g. "API key" vs
// "Username + password"). Only used when the connector accepts more
// than one method — for single-method connectors the picker is
// suppressed entirely.
function AuthMethodPicker({
  methods,
  activeKey,
  onPick,
}: {
  methods: AuthMethod[]
  activeKey: string
  onPick: (key: string) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label={t('Authentication method', 'Authentication method')}
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        background: 'var(--color-background-tertiary)',
        padding: 4,
        borderRadius: 'var(--border-radius-md)',
      }}
    >
      {methods.map((method) => {
        const active = method.key === activeKey
        return (
          <button
            key={method.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(method.key)}
            style={{
              flex: '1 1 0',
              minWidth: 120,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: active
                ? '1px solid var(--color-brand-blue)'
                : '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-md)',
              background: active ? 'var(--color-background-primary)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {active ? <i className="ti ti-check" aria-hidden="true" /> : null}
            <span>{method.label}</span>
          </button>
        )
      })}
    </div>
  );
}
