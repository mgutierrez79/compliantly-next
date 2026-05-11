'use client';
import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, InfoBox, Input, Label, PageTitle, Textarea } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type EvidenceStatus = 'requested' | 'received' | 'approved' | 'rejected' | 'expired'

type EvidenceRequestEntry = {
  request_id: string
  run_id?: string | null
  title: string
  description?: string | null
  owner?: string | null
  due_date?: string | null
  sla_date?: string | null
  status: EvidenceStatus
  status_label?: string | null
  required_artifacts: string[]
  attachments: string[]
  evidence_urls: string[]
  metadata: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
}

type AuditEvent = {
  timestamp?: string
  action?: string
  by?: string
  details?: Record<string, unknown>
}

type EvidenceRequestsResponse = {
  items: EvidenceRequestEntry[]
  count: number
}

type EvidenceTemplate = {
  id: string
  title: string
  description?: string | null
  required_artifacts: string[]
  evidence_urls: string[]
  due_in_days?: number | null
  sla_in_days?: number | null
}

type EvidenceTemplateConfig = {
  framework: string
  templates: EvidenceTemplate[]
}

type EvidenceTemplatesResponse = {
  items: EvidenceTemplateConfig[]
}

type ConnectorEvidenceTemplateConfig = {
  connector: string
  instance?: string | null
  framework?: string | null
  templates: EvidenceTemplate[]
}

type ConnectorEvidenceTemplatesResponse = {
  items: ConnectorEvidenceTemplateConfig[]
}

type FrameworksResponse = {
  available: string[]
}

type ConnectorsConfigResponse = {
  available?: string[]
  enabled?: string[]
}

type AuthMeResponse = {
  subject: string
  roles: string[]
  tenant_id?: string | null
}

type ConnectorTemplateOption = EvidenceTemplate & {
  framework?: string | null
  instance?: string | null
}

type AppliedTemplate =
  | { source: 'framework'; framework: string; templateId: string }
  | {
      source: 'connector'
      connector: string
      instance?: string | null
      framework?: string | null
      templateId: string
    }

const statusOptions: EvidenceStatus[] = ['requested', 'received', 'approved', 'rejected', 'expired']

function formatDate(value?: string | null) {
  if (!value) return 'n/a'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function addDays(days: number) {
  const target = new Date()
  target.setUTCDate(target.getUTCDate() + days)
  return target.toISOString().slice(0, 10)
}

function extractConnectorInstances(payload: unknown) {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as { items?: unknown[]; name?: unknown }
  if (Array.isArray(record.items)) {
    return record.items
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const name = (item as { name?: unknown }).name
        return typeof name === 'string' ? name.trim() : null
      })
      .filter((name): name is string => Boolean(name))
  }
  if (typeof record.name === 'string' && record.name.trim()) {
    return [record.name.trim()]
  }
  return []
}

function getAuditEvents(metadata: Record<string, unknown>): AuditEvent[] {
  const raw = metadata?.audit_events
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => item && typeof item === 'object') as AuditEvent[]
}

export function EvidenceRequestsPage() {
  const {
    t
  } = useI18n();

  const [items, setItems] = useState<EvidenceRequestEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [roleLabel, setRoleLabel] = useState<string>('Collaborator')

  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterRun, setFilterRun] = useState('')

  const [templateSource, setTemplateSource] = useState<'framework' | 'connector'>('framework')
  const [frameworkOptions, setFrameworkOptions] = useState<string[]>([])
  const [templateConfigs, setTemplateConfigs] = useState<EvidenceTemplateConfig[]>([])
  const [connectorTemplateConfigs, setConnectorTemplateConfigs] = useState<
    ConnectorEvidenceTemplateConfig[]
  >([])
  const [connectorOptions, setConnectorOptions] = useState<string[]>([])
  const [connectorInstances, setConnectorInstances] = useState<Record<string, string[]>>({})
  const [templateFramework, setTemplateFramework] = useState('')
  const [customTemplateFramework, setCustomTemplateFramework] = useState('')
  const [connectorFrameworkFilter, setConnectorFrameworkFilter] = useState('')
  const [templateConnector, setTemplateConnector] = useState('')
  const [templateConnectorInstance, setTemplateConnectorInstance] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [appliedTemplate, setAppliedTemplate] = useState<AppliedTemplate | null>(null)

  const [createTitle, setCreateTitle] = useState('')
  const [createOwner, setCreateOwner] = useState('')
  const [createRunId, setCreateRunId] = useState('')
  const [createDueDate, setCreateDueDate] = useState('')
  const [createSlaDate, setCreateSlaDate] = useState('')
  const [createStatus, setCreateStatus] = useState<EvidenceStatus | ''>('requested')
  const [createDescription, setCreateDescription] = useState('')
  const [createArtifacts, setCreateArtifacts] = useState('')

  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [auditDownloadingId, setAuditDownloadingId] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterOwner) params.set('owner', filterOwner)
    if (filterRun) params.set('run_id', filterRun)
    params.set('limit', '200')
    return params.toString()
  }, [filterStatus, filterOwner, filterRun])

  const loadRequests = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiJson<EvidenceRequestsResponse>(
        `/workflow/evidence-requests?${queryString}`,
      )
      setItems(response.items)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }

  const loadRoles = async () => {
    try {
      const response = await apiJson<AuthMeResponse>('/auth/me')
      const roleList = (response.roles || []).map((role) => role.toLowerCase())
      setRoles(roleList)
      if (roleList.includes('admin') || roleList.includes('reporter')) {
        setRoleLabel('Auditor')
      } else if (roleList.includes('auditor')) {
        setRoleLabel('Auditor (read-only)')
      } else {
        setRoleLabel('Collaborator')
      }
    } catch {
      setRoles([])
      setRoleLabel('Collaborator')
    }
  }

  const loadTemplates = async () => {
    let templateConnectorNames: string[] = []
    try {
      const response = await apiJson<FrameworksResponse>('/config/frameworks')
      setFrameworkOptions(response.available || [])
    } catch (err) {
      setError(err as ApiError)
    }
    try {
      const response = await apiJson<EvidenceTemplatesResponse>('/config/evidence-templates')
      setTemplateConfigs(response.items || [])
    } catch (err) {
      setError(err as ApiError)
    }
    try {
      const response = await apiJson<ConnectorEvidenceTemplatesResponse>(
        '/config/connector-evidence-templates',
      )
      const items = response.items || []
      setConnectorTemplateConfigs(items)
      templateConnectorNames = Array.from(
        new Set(
          items
            .map((item) => item.connector)
            .filter((connector): connector is string => Boolean(connector)),
        ),
      )
    } catch (err) {
      setError(err as ApiError)
    }
    try {
      const response = await apiJson<ConnectorsConfigResponse>('/config/connectors')
      const enabled = response.enabled || []
      const options = enabled.length ? enabled : response.available || []
      const mergedOptions = Array.from(new Set([...options, ...templateConnectorNames])).sort()
      setConnectorOptions(mergedOptions)
      if (enabled.length) {
        const results = await Promise.all(
          enabled.map(async (connector) => {
            try {
              const config = await apiJson<unknown>(`/config/connectors/${connector}`)
              return { connector, instances: extractConnectorInstances(config) }
            } catch {
              return { connector, instances: [] }
            }
          }),
        )
        const instanceMap: Record<string, string[]> = {}
        results.forEach(({ connector, instances }) => {
          instanceMap[connector] = instances
        })
        setConnectorInstances(instanceMap)
      } else {
        setConnectorInstances({})
      }
    } catch (err) {
      if (templateConnectorNames.length) {
        setConnectorOptions(Array.from(new Set(templateConnectorNames)).sort())
      }
      setError(err as ApiError)
    }
  }

  useEffect(() => {
    loadRoles()
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    if (!frameworkOptions.length || templateFramework) return
    setTemplateFramework(frameworkOptions[0])
  }, [frameworkOptions, templateFramework])

  useEffect(() => {
    if (!connectorOptions.length || templateConnector) return
    setTemplateConnector(connectorOptions[0])
  }, [connectorOptions, templateConnector])

  useEffect(() => {
    setTemplateId('')
  }, [templateSource])

  const activeTemplateFramework =
    templateFramework === 'custom' ? customTemplateFramework.trim() : templateFramework

  const templateOptions = useMemo(() => {
    if (!activeTemplateFramework) return []
    return (
      templateConfigs.find((entry) => entry.framework === activeTemplateFramework)?.templates || []
    )
  }, [activeTemplateFramework, templateConfigs])

  const connectorTemplateOptions = useMemo<ConnectorTemplateOption[]>(() => {
    if (!templateConnector) return []
    const instanceFilter = templateConnectorInstance.trim()
    const frameworkFilter = connectorFrameworkFilter.trim()
    const options: ConnectorTemplateOption[] = []
    connectorTemplateConfigs
      .filter((entry) => entry.connector === templateConnector)
      .forEach((entry) => {
        const instanceMatch =
          !instanceFilter || !entry.instance || entry.instance === instanceFilter
        const frameworkMatch =
          !frameworkFilter || !entry.framework || entry.framework === frameworkFilter
        if (!instanceMatch || !frameworkMatch) return
        entry.templates.forEach((template) => {
          options.push({
            ...template,
            framework: entry.framework ?? null,
            instance: entry.instance ?? null,
          })
        })
      })
    return options
  }, [
    connectorFrameworkFilter,
    connectorTemplateConfigs,
    templateConnector,
    templateConnectorInstance,
  ])

  const activeTemplate = useMemo(() => {
    if (!templateId) return null
    const options = templateSource === 'framework' ? templateOptions : connectorTemplateOptions
    return options.find((template) => template.id === templateId) || null
  }, [connectorTemplateOptions, templateId, templateOptions, templateSource])

  const connectorInstanceOptions = connectorInstances[templateConnector] || []

  const canReview = roles.includes('admin') || roles.includes('reporter')
  const isReadOnlyAuditor = roles.includes('auditor') && !canReview
  const canSubmitEvidence = !isReadOnlyAuditor

  const applyTemplate = () => {
    if (!activeTemplate) return
    if (templateSource === 'framework' && !activeTemplateFramework) return
    if (templateSource === 'connector' && !templateConnector) return
    setCreateTitle(activeTemplate.title)
    setCreateDescription(activeTemplate.description || '')
    setCreateArtifacts(activeTemplate.required_artifacts.join(', '))
    setCreateStatus('requested')
    if (activeTemplate.due_in_days) {
      setCreateDueDate(addDays(activeTemplate.due_in_days))
    }
    if (activeTemplate.sla_in_days) {
      setCreateSlaDate(addDays(activeTemplate.sla_in_days))
    }
    if (templateSource === 'framework') {
      setAppliedTemplate({
        source: 'framework',
        framework: activeTemplateFramework,
        templateId: activeTemplate.id,
      })
      setMessage('Framework template applied to the request form.')
    } else {
      const connectorTemplate = activeTemplate as ConnectorTemplateOption
      setAppliedTemplate({
        source: 'connector',
        connector: templateConnector,
        instance: templateConnectorInstance || connectorTemplate.instance || undefined,
        framework: connectorTemplate.framework || connectorFrameworkFilter || undefined,
        templateId: activeTemplate.id,
      })
      setMessage('Connector template applied to the request form.')
    }
  }

  const handleCreate = async () => {
    if (!createTitle.trim()) {
      setMessage('Provide a title for the evidence request.')
      return
    }
    setMessage(null)
    try {
      await apiJson<EvidenceRequestEntry>('/workflow/evidence-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          owner: createOwner.trim() || undefined,
          run_id: createRunId.trim() || undefined,
          due_date: createDueDate.trim() || undefined,
          sla_date: createSlaDate.trim() || undefined,
          status: createStatus || undefined,
          description: createDescription.trim() || undefined,
          required_artifacts: splitList(createArtifacts),
          metadata: appliedTemplate
            ? appliedTemplate.source === 'framework'
              ? {
                  template_id: appliedTemplate.templateId,
                  framework: appliedTemplate.framework,
                  template_source: 'framework',
                }
              : {
                  template_id: appliedTemplate.templateId,
                  template_source: 'connector',
                  connector: appliedTemplate.connector,
                  connector_instance: appliedTemplate.instance || undefined,
                  framework: appliedTemplate.framework || undefined,
                }
            : undefined,
        }),
      })
      setCreateTitle('')
      setCreateOwner('')
      setCreateRunId('')
      setCreateDueDate('')
      setCreateSlaDate('')
      setCreateStatus('requested')
      setCreateDescription('')
      setCreateArtifacts('')
      setAppliedTemplate(null)
      setMessage('Evidence request created.')
      await loadRequests()
    } catch (err) {
      setError(err as ApiError)
    }
  }

  const handleSubmitEvidence = async (requestId: string) => {
    const url = (urlDrafts[requestId] || '').trim()
    const note = (noteDrafts[requestId] || '').trim()
    if (!url && !note) {
      setMessage('Provide an evidence URL or a note.')
      return
    }
    setSubmittingId(requestId)
    setMessage(null)
    try {
      await apiJson<EvidenceRequestEntry>(`/workflow/evidence-requests/${requestId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence_urls: url ? [url] : [],
          note: note || undefined,
        }),
      })
      setUrlDrafts((prev) => ({ ...prev, [requestId]: '' }))
      setNoteDrafts((prev) => ({ ...prev, [requestId]: '' }))
      setMessage('Evidence submitted.')
      await loadRequests()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setSubmittingId(null)
    }
  }

  const handleUpload = async (requestId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    setUploadingId(requestId)
    setMessage(null)
    try {
      await apiFetch(`/workflow/evidence-requests/${requestId}/attachments`, {
        method: 'POST',
        body: formData,
      })
      setMessage('Attachment uploaded.')
      await loadRequests()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setUploadingId(null)
    }
  }

  const handleStatusChange = async (requestId: string, status: EvidenceStatus) => {
    setStatusUpdatingId(requestId)
    setMessage(null)
    try {
      await apiJson<EvidenceRequestEntry>(`/workflow/evidence-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setMessage(`Status updated to ${status}.`)
      await loadRequests()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const downloadAttachment = async (requestId: string, filename: string) => {
    setMessage(null)
    try {
      const response = await apiFetch(
        `/workflow/evidence-requests/${requestId}/attachments/${encodeURIComponent(filename)}`,
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err as ApiError)
    }
  }

  const deleteAttachment = async (requestId: string, filename: string) => {
    if (!confirm(`Delete attachment ${filename}?`)) return
    setMessage(null)
    try {
      await apiFetch(
        `/workflow/evidence-requests/${requestId}/attachments/${encodeURIComponent(filename)}`,
        { method: 'DELETE' },
      )
      setMessage('Attachment deleted.')
      await loadRequests()
    } catch (err) {
      setError(err as ApiError)
    }
  }

  const downloadAudit = async (requestId: string, format: 'json' | 'csv') => {
    setAuditDownloadingId(requestId)
    setMessage(null)
    try {
      const response = await apiFetch(
        `/workflow/evidence-requests/${requestId}/audit?format=${encodeURIComponent(format)}`,
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `evidence-audit-${requestId}.${format}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setAuditDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>{t('Evidence Requests', 'Evidence Requests')}</PageTitle>
          <p className="text-sm text-slate-400">
            {t(
              'Create, track, and approve evidence requests with audit trails.',
              'Create, track, and approve evidence requests with audit trails.'
            )}
          </p>
        </div>
        <Button onClick={loadRequests} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      {error ? <ErrorBox title={t('Evidence requests error', 'Evidence requests error')} detail={error.message} /> : null}
      {message ? <InfoBox title={message} /> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Label>{t('New request', 'New request')}</Label>
            <div className="mt-1 text-sm text-slate-100">{t('Role:', 'Role:')} {roleLabel}</div>
          </div>
          <div className="max-w-md text-xs text-slate-400">
            {t(
              'Auditors can create requests and approve evidence. Read-only auditors can review only.',
              'Auditors can create requests and approve evidence. Read-only auditors can review only.'
            )}
          </div>
        </div>
        {canReview ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>{t('Template source', 'Template source')}</Label>
                <select
                  value={templateSource}
                  onChange={(event) => {
                    const next = event.target.value as 'framework' | 'connector'
                    setTemplateSource(next)
                    setTemplateId('')
                  }}
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                >
                  <option value="framework">{t('framework templates', 'framework templates')}</option>
                  <option value="connector">{t('connector templates', 'connector templates')}</option>
                </select>
              </div>
              {templateSource === 'framework' ? (
                <div>
                  <Label>{t('Template framework', 'Template framework')}</Label>
                  <select
                    value={templateFramework}
                    onChange={(event) => {
                      const next = event.target.value
                      setTemplateFramework(next)
                      setTemplateId('')
                      if (next !== 'custom') {
                        setCustomTemplateFramework('')
                      }
                    }}
                    className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  >
                    {(frameworkOptions.length
                      ? frameworkOptions
                      : templateConfigs.map((item) => item.framework)
                    ).map((framework) => (
                      <option key={framework} value={framework}>
                        {framework}
                      </option>
                    ))}
                    <option value="custom">custom</option>
                  </select>
                </div>
              ) : (
                <div>
                  <Label>{t('Connector', 'Connector')}</Label>
                  <select
                    value={templateConnector}
                    onChange={(event) => {
                      const next = event.target.value
                      setTemplateConnector(next)
                      setTemplateConnectorInstance('')
                      setTemplateId('')
                    }}
                    className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">{t('Select connector', 'Select connector')}</option>
                    {connectorOptions.map((connector) => (
                      <option key={connector} value={connector}>
                        {connector}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {templateSource === 'connector' ? (
                <div>
                  <Label>{t('Framework filter', 'Framework filter')}</Label>
                  <select
                    value={connectorFrameworkFilter}
                    onChange={(event) => {
                      setConnectorFrameworkFilter(event.target.value)
                      setTemplateId('')
                    }}
                    className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">{t('All frameworks', 'All frameworks')}</option>
                    {frameworkOptions.map((framework) => (
                      <option key={framework} value={framework}>
                        {framework}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {templateSource === 'connector' && connectorInstanceOptions.length ? (
                <div>
                  <Label>{t('Connector instance', 'Connector instance')}</Label>
                  <select
                    value={templateConnectorInstance}
                    onChange={(event) => {
                      setTemplateConnectorInstance(event.target.value)
                      setTemplateId('')
                    }}
                    className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">{t('All instances', 'All instances')}</option>
                    {connectorInstanceOptions.map((instance) => (
                      <option key={instance} value={instance}>
                        {instance}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {templateSource === 'framework' && templateFramework === 'custom' ? (
                <div className="md:col-span-2">
                  <Label>{t('Custom framework key', 'Custom framework key')}</Label>
                  <Input
                    value={customTemplateFramework}
                    onChange={(event) => setCustomTemplateFramework(event.target.value)}
                    placeholder="new-framework-key"
                  />
                </div>
              ) : null}
              <div className="md:col-span-2">
                <Label>{t('Template', 'Template')}</Label>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                  disabled={templateSource === 'framework' ? !activeTemplateFramework : !templateConnector}
                >
                  <option value="">{t('Select template', 'Select template')}</option>
                  {templateSource === 'framework'
                    ? templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.title}
                        </option>
                      ))
                    : connectorTemplateOptions.map((template) => (
                        <option
                          key={`${template.id}-${template.framework || 'general'}-${template.instance || 'any'}`}
                          value={template.id}
                        >
                          {template.framework ? `[${template.framework}] ` : ''}
                          {template.title}
                        </option>
                      ))}
                </select>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button onClick={applyTemplate} disabled={!activeTemplate}>
                  {t('Apply template', 'Apply template')}
                </Button>
                {activeTemplate ? (
                  <div className="text-xs text-slate-400">
                    {t('Due +', 'Due +')}{activeTemplate.due_in_days ?? 'n/a'} {t('days | SLA +', 'days | SLA +')}{activeTemplate.sla_in_days ?? 'n/a'}days
                                      </div>
                ) : null}
              </div>
              {activeTemplate?.evidence_urls?.length ? (
                <div className="md:col-span-2 text-xs text-slate-400">
                  {t('Suggested evidence:', 'Suggested evidence:')} {activeTemplate.evidence_urls.join(', ')}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>{t('Title', 'Title')}</Label>
                <Input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} />
              </div>
              <div>
                <Label>{t('Owner', 'Owner')}</Label>
                <Input value={createOwner} onChange={(event) => setCreateOwner(event.target.value)} />
              </div>
              <div>
                <Label>{t('Run ID', 'Run ID')}</Label>
                <Input value={createRunId} onChange={(event) => setCreateRunId(event.target.value)} />
              </div>
              <div>
                <Label>{t('Status', 'Status')}</Label>
                <select
                  value={createStatus}
                  onChange={(event) => setCreateStatus(event.target.value as EvidenceStatus)}
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('Due date (ISO)', 'Due date (ISO)')}</Label>
                <Input value={createDueDate} onChange={(event) => setCreateDueDate(event.target.value)} />
              </div>
              <div>
                <Label>{t('SLA date (ISO)', 'SLA date (ISO)')}</Label>
                <Input value={createSlaDate} onChange={(event) => setCreateSlaDate(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>{t(
                  'Required artifacts (comma separated)',
                  'Required artifacts (comma separated)'
                )}</Label>
                <Input value={createArtifacts} onChange={(event) => setCreateArtifacts(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>{t('Description', 'Description')}</Label>
                <Textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleCreate}>{t('Create request', 'Create request')}</Button>
            </div>
          </>
        ) : isReadOnlyAuditor ? (
          <div className="mt-3 text-sm text-slate-300">
            {t(
              'Read-only auditors can review evidence and audit exports, but cannot create or update requests.',
              'Read-only auditors can review evidence and audit exports, but cannot create or update requests.'
            )}
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-300">
            {t(
              'Collaborators can submit evidence URLs and attachments, but cannot create or approve requests.',
              'Collaborators can submit evidence URLs and attachments, but cannot create or approve requests.'
            )}
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>{t('Filters', 'Filters')}</Label>
          <div className="text-xs text-slate-400">{t(
            'Filter requests by status, owner, or run id.',
            'Filter requests by status, owner, or run id.'
          )}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="min-w-[180px]">
            <Label>{t('Status', 'Status')}</Label>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{t('All', 'All')}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <Label>{t('Owner', 'Owner')}</Label>
            <Input value={filterOwner} onChange={(event) => setFilterOwner(event.target.value)} />
          </div>
          <div className="min-w-[220px]">
            <Label>{t('Run ID', 'Run ID')}</Label>
            <Input value={filterRun} onChange={(event) => setFilterRun(event.target.value)} />
          </div>
        </div>
      </Card>
      <div className="space-y-4">
        {items.length === 0 && !loading ? <div className="text-sm text-slate-400">{t('No evidence requests yet.', 'No evidence requests yet.')}</div> : null}
        {items.map((item) => {
          const {
            t
          } = useI18n();

          const isExpanded = expandedId === item.request_id
          const hasEvidence = item.evidence_urls.length > 0 || item.attachments.length > 0
          const canMarkReceived = item.status === 'requested' && hasEvidence
          const canApproveReject = item.status === 'received' && hasEvidence
          const urlDraft = urlDrafts[item.request_id] || ''
          const noteDraft = noteDrafts[item.request_id] || ''
          const auditEvents = getAuditEvents(item.metadata || {})
          return (
            <Card key={item.request_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-100">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {t('Status:', 'Status:')} {item.status_label || item.status} {t('· Owner:', '· Owner:')} {item.owner || 'unassigned'} {t('· Due:', '· Due:')}{' '}
                    {formatDate(item.due_date)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('Run:', 'Run:')} {item.run_id || 'n/a'} {t('· Updated:', '· Updated:')} {formatDate(item.updated_at)}
                  </div>
                </div>
                <Button onClick={() => setExpandedId(isExpanded ? null : item.request_id)}>
                  {isExpanded ? 'Hide details' : 'View details'}
                </Button>
              </div>
              {isExpanded ? (
                <div className="mt-4 space-y-4 border-t border-[#1f365a] pt-4">
                  {item.description ? <div className="text-sm text-slate-200">{item.description}</div> : null}

                  <div>
                    <Label>{t('Required artifacts', 'Required artifacts')}</Label>
                    <div className="mt-1 text-sm text-slate-200">
                      {item.required_artifacts.length ? item.required_artifacts.join(', ') : 'n/a'}
                    </div>
                  </div>

                  <div>
                    <Label>{t('Evidence URLs', 'Evidence URLs')}</Label>
                    <div className="mt-1 space-y-1 text-sm">
                      {item.evidence_urls.length ? (
                        item.evidence_urls.map((url) => (
                          <div key={url}>
                            <a className="text-blue-300 underline" href={url} target="_blank" rel="noreferrer">
                              {url}
                            </a>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400">{t('No evidence URLs submitted.', 'No evidence URLs submitted.')}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>{t('Attachments', 'Attachments')}</Label>
                    <div className="mt-1 space-y-1 text-sm">
                      {item.attachments.length ? (
                        item.attachments.map(name => {
                          const {
                            t
                          } = useI18n();

                          return (
                            <div key={name} className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => downloadAttachment(item.request_id, name)}
                                className="text-left text-blue-300 underline"
                              >
                                {name}
                              </button>
                              {canReview && item.status !== 'approved' ? (
                                <button
                                  type="button"
                                  onClick={() => deleteAttachment(item.request_id, name)}
                                  className="text-xs text-rose-300 hover:text-rose-200"
                                >
                                  {t('Delete', 'Delete')}
                                </button>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-slate-400">{t('No attachments uploaded.', 'No attachments uploaded.')}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      {canSubmitEvidence ? (
                        <>
                          <Label>{t('Add evidence URL', 'Add evidence URL')}</Label>
                          <Input
                            value={urlDraft}
                            onChange={(event) =>
                              setUrlDrafts((prev) => ({ ...prev, [item.request_id]: event.target.value }))
                            }
                            placeholder="https://..."
                          />
                          <div className="mt-3">
                            <Label>{t('Submission note', 'Submission note')}</Label>
                          </div>
                          <Textarea
                            value={noteDraft}
                            onChange={(event) =>
                              setNoteDrafts((prev) => ({ ...prev, [item.request_id]: event.target.value }))
                            }
                            rows={2}
                            placeholder={t('Optional message to auditor.', 'Optional message to auditor.')}
                          />
                          <div className="mt-3">
                            <Button
                              onClick={() => handleSubmitEvidence(item.request_id)}
                              disabled={submittingId === item.request_id}
                            >
                              {submittingId === item.request_id ? 'Submitting...' : 'Submit evidence'}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-300">{t(
                          'Read-only auditors cannot submit evidence.',
                          'Read-only auditors cannot submit evidence.'
                        )}</div>
                      )}
                    </div>

                    <div>
                      {canSubmitEvidence ? (
                        <>
                          <Label>{t('Upload attachment', 'Upload attachment')}</Label>
                          <input
                            type="file"
                            className="mt-2 w-full text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-[#1f365a] file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-100 hover:file:bg-[#2b4b73]"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                handleUpload(item.request_id, file)
                              }
                              event.currentTarget.value = ''
                            }}
                            disabled={uploadingId === item.request_id}
                          />
                          {uploadingId === item.request_id ? (
                            <div className="mt-2 text-xs text-slate-400">{t('Uploading...', 'Uploading...')}</div>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-sm text-slate-300">{t(
                          'Read-only auditors cannot upload attachments.',
                          'Read-only auditors cannot upload attachments.'
                        )}</div>
                      )}

                      {canReview ? (
                        <div className="mt-4 space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => handleStatusChange(item.request_id, 'approved')}
                              disabled={statusUpdatingId === item.request_id || !canApproveReject}
                            >
                              {t('Approve', 'Approve')}
                            </Button>
                            <Button
                              onClick={() => handleStatusChange(item.request_id, 'rejected')}
                              disabled={statusUpdatingId === item.request_id || !canApproveReject}
                            >
                              {t('Reject', 'Reject')}
                            </Button>
                            <Button
                              onClick={() => handleStatusChange(item.request_id, 'received')}
                              disabled={statusUpdatingId === item.request_id || !canMarkReceived}
                            >
                              {t('Mark received', 'Mark received')}
                            </Button>
                          </div>
                          {!hasEvidence ? (
                            <div className="text-xs text-slate-400">{t(
                              'Approvals are locked until evidence is submitted.',
                              'Approvals are locked until evidence is submitted.'
                            )}</div>
                          ) : null}
                          {hasEvidence && item.status === 'requested' ? (
                            <div className="text-xs text-slate-400">{t('Mark as received before approval.', 'Mark as received before approval.')}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Label>{t('Audit export', 'Audit export')}</Label>
                    <Button
                      onClick={() => downloadAudit(item.request_id, 'csv')}
                      disabled={auditDownloadingId === item.request_id}
                    >
                      {auditDownloadingId === item.request_id ? 'Preparing...' : 'Download CSV'}
                    </Button>
                    <Button
                      onClick={() => downloadAudit(item.request_id, 'json')}
                      disabled={auditDownloadingId === item.request_id}
                    >
                      {t('Download JSON', 'Download JSON')}
                    </Button>
                  </div>

                  {auditEvents.length ? (
                    <div>
                      <Label>{t('Recent audit events', 'Recent audit events')}</Label>
                      <div className="mt-1 space-y-1 text-xs text-slate-300">
                        {auditEvents.slice(-5).map((event, index) => (
                          <div key={`${event.timestamp}-${index}`}>
                            {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'n/a'} · {event.action}{' '}
                            {event.by ? `by ${event.by}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
