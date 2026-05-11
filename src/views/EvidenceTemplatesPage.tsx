'use client';
import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, InfoBox, Input, Label, PageTitle, Textarea } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type EvidenceTemplate = {
  id: string
  title: string
  description?: string | null
  required_artifacts: string[]
  evidence_urls: string[]
  due_in_days?: number | null
  sla_in_days?: number | null
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

type ConnectorItemsResponse = {
  items?: Array<{ name?: string }>
  name?: string
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinCsv(values: string[]) {
  return values.join(', ')
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function formatOptionalNumber(value?: number | null) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeInstances(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as ConnectorItemsResponse
  if (Array.isArray(record.items)) {
    return record.items
      .map((item, idx) => (item.name || `instance-${idx + 1}`).trim())
      .filter(Boolean)
  }
  if (typeof record.name === 'string' && record.name.trim()) {
    return [record.name.trim()]
  }
  return []
}

export function EvidenceTemplatesPage() {
  const {
    t
  } = useI18n();

  const [connectorOptions, setConnectorOptions] = useState<string[]>([])
  const [instanceOptions, setInstanceOptions] = useState<Record<string, string[]>>({})
  const [frameworkOptions, setFrameworkOptions] = useState<string[]>([])
  const [templates, setTemplates] = useState<ConnectorEvidenceTemplateConfig[]>([])
  const [selectedConnector, setSelectedConnector] = useState('')
  const [selectedInstance, setSelectedInstance] = useState('')
  const [frameworkSelection, setFrameworkSelection] = useState('')
  const [customFramework, setCustomFramework] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      setMessage(null)
      let templateConnectorNames: string[] = []
      try {
        const response = await apiJson<FrameworksResponse>('/config/frameworks')
        if (!cancelled) setFrameworkOptions(response.available || [])
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
      try {
        const response = await apiJson<ConnectorEvidenceTemplatesResponse>(
          '/config/connector-evidence-templates',
        )
        const items = response.items || []
        templateConnectorNames = Array.from(
          new Set(
            items
              .map((item) => item.connector)
              .filter((connector): connector is string => Boolean(connector)),
          ),
        )
        if (!cancelled) setTemplates(items)
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
      try {
        const config = await apiJson<ConnectorsConfigResponse>('/config/connectors')
        const enabled = config.enabled || []
        const options = enabled.length ? enabled : config.available || []
        const merged = Array.from(new Set([...options, ...templateConnectorNames])).sort()
        if (!cancelled) setConnectorOptions(merged)
        const instanceMap: Record<string, string[]> = {}
        await Promise.all(
          enabled.map(async (connector) => {
            try {
              const payload = await apiJson<unknown>(`/config/connectors/${encodeURIComponent(connector)}`)
              instanceMap[connector] = normalizeInstances(payload)
            } catch {
              instanceMap[connector] = []
            }
          }),
        )
        if (!cancelled) setInstanceOptions(instanceMap)
      } catch (err) {
        if (!cancelled) {
          if (templateConnectorNames.length) {
            setConnectorOptions(Array.from(new Set(templateConnectorNames)).sort())
          }
          setError(err as ApiError)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!connectorOptions.length || selectedConnector) return
    setSelectedConnector(connectorOptions[0])
  }, [connectorOptions, selectedConnector])

  useEffect(() => {
    if (!selectedConnector || selectedInstance) return
    const entry = templates.find((item) => item.connector === selectedConnector && item.instance)
    if (entry?.instance) {
      setSelectedInstance(entry.instance)
    }
  }, [selectedConnector, selectedInstance, templates])

  useEffect(() => {
    if (!selectedConnector || frameworkSelection) return
    const entry = templates.find((item) => item.connector === selectedConnector && item.framework)
    if (entry?.framework) {
      setFrameworkSelection(entry.framework)
    }
  }, [frameworkSelection, selectedConnector, templates])

  const activeFramework =
    frameworkSelection === 'custom' ? customFramework.trim() : frameworkSelection

  const currentEntry = useMemo(() => {
    const instanceKey = selectedInstance.trim()
    const frameworkKey = activeFramework.trim()
    return templates.find(
      (entry) =>
        entry.connector === selectedConnector &&
        (entry.instance || '') === instanceKey &&
        (entry.framework || '') === frameworkKey,
    )
  }, [activeFramework, selectedConnector, selectedInstance, templates])

  const currentTemplates = currentEntry?.templates ?? []

  const updateTemplates = (nextTemplates: EvidenceTemplate[]) => {
    if (!selectedConnector) return
    const instanceKey = selectedInstance.trim()
    const frameworkKey = activeFramework.trim()
    setTemplates((prev) => {
      const remaining = prev.filter(
        (entry) =>
          !(
            entry.connector === selectedConnector &&
            (entry.instance || '') === instanceKey &&
            (entry.framework || '') === frameworkKey
          ),
      )
      if (nextTemplates.length) {
        remaining.push({
          connector: selectedConnector,
          instance: instanceKey || undefined,
          framework: frameworkKey || undefined,
          templates: nextTemplates,
        })
      }
      return remaining
    })
  }

  const addTemplate = () => {
    updateTemplates([
      ...currentTemplates,
      {
        id: `template-${currentTemplates.length + 1}`,
        title: '',
        description: '',
        required_artifacts: [],
        evidence_urls: [],
        due_in_days: null,
        sla_in_days: null,
      },
    ])
  }

  const updateTemplate = (index: number, patch: Partial<EvidenceTemplate>) => {
    const next = currentTemplates.map((template, idx) =>
      idx === index ? { ...template, ...patch } : template,
    )
    updateTemplates(next)
  }

  const removeTemplate = (index: number) => {
    updateTemplates(currentTemplates.filter((_, idx) => idx !== index))
  }

  const saveTemplates = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await apiJson<ConnectorEvidenceTemplatesResponse>('/config/connector-evidence-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: templates }),
      })
      setMessage('Connector evidence templates saved.')
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>{t('Evidence Templates', 'Evidence Templates')}</PageTitle>
          <p className="text-sm text-slate-400">
            {t(
              'Build reusable evidence requests scoped by connector, instance, and framework.',
              'Build reusable evidence requests scoped by connector, instance, and framework.'
            )}
          </p>
        </div>
        <Button onClick={saveTemplates} disabled={saving || !selectedConnector}>
          {saving ? 'Saving...' : 'Save templates'}
        </Button>
      </div>
      {error ? <ErrorBox title={t('Evidence templates error', 'Evidence templates error')} detail={error.message} /> : null}
      {message ? <InfoBox title={message} /> : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>{t('Template scope', 'Template scope')}</Label>
          <div className="text-xs text-slate-400">{t(
            'Select the connector and scope to edit templates.',
            'Select the connector and scope to edit templates.'
          )}</div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>{t('Connector', 'Connector')}</Label>
            <select
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
              value={selectedConnector}
              onChange={(event) => setSelectedConnector(event.target.value)}
            >
              {connectorOptions.map((connector) => (
                <option key={connector} value={connector}>
                  {connector}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('Instance (optional)', 'Instance (optional)')}</Label>
            {instanceOptions[selectedConnector]?.length ? (
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                value={selectedInstance}
                onChange={(event) => setSelectedInstance(event.target.value)}
              >
                <option value="">{t('All instances', 'All instances')}</option>
                {instanceOptions[selectedConnector].map((instance) => (
                  <option key={instance} value={instance}>
                    {instance}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={selectedInstance}
                onChange={(event) => setSelectedInstance(event.target.value)}
                placeholder={t('optional instance name', 'optional instance name')}
              />
            )}
          </div>
          <div>
            <Label>{t('Framework (optional)', 'Framework (optional)')}</Label>
            <select
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
              value={frameworkSelection}
              onChange={(event) => {
                const next = event.target.value
                setFrameworkSelection(next)
                if (next !== 'custom') setCustomFramework('')
              }}
            >
              <option value="">{t('All frameworks', 'All frameworks')}</option>
              {frameworkOptions.map((framework) => (
                <option key={framework} value={framework}>
                  {framework}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </div>
          {frameworkSelection === 'custom' ? (
            <div className="md:col-span-3">
              <Label>{t('Custom framework key', 'Custom framework key')}</Label>
              <Input
                value={customFramework}
                onChange={(event) => setCustomFramework(event.target.value)}
                placeholder="new-framework-key"
              />
            </div>
          ) : null}
          <div className="flex items-end md:col-span-3">
            <Button onClick={addTemplate} disabled={!selectedConnector}>
              {t('Add template', 'Add template')}
            </Button>
          </div>
        </div>
        <div className="mt-4 text-xs text-slate-400">
          {t(
            'Define connector-specific evidence requests that can be reused when creating evidence requests.',
            'Define connector-specific evidence requests that can be reused when creating evidence requests.'
          )}
        </div>
      </Card>
      <div className="space-y-3">
        {currentTemplates.length === 0 ? (
          <div className="text-sm text-slate-400">{t(
            'No templates for this connector scope yet.',
            'No templates for this connector scope yet.'
          )}</div>
        ) : (
          currentTemplates.map((template, index) => {
            const {
              t
            } = useI18n();

            return (
              <Card key={`${template.id}-${index}`}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>{t('Template ID', 'Template ID')}</Label>
                    <Input
                      value={template.id}
                      onChange={(event) => updateTemplate(index, { id: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t('Title', 'Title')}</Label>
                    <Input
                      value={template.title}
                      onChange={(event) => updateTemplate(index, { title: event.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t('Description', 'Description')}</Label>
                    <Textarea
                      value={template.description || ''}
                      onChange={(event) => updateTemplate(index, { description: event.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>{t('Required artifacts', 'Required artifacts')}</Label>
                    <Input
                      value={joinCsv(template.required_artifacts)}
                      onChange={(event) =>
                        updateTemplate(index, { required_artifacts: splitCsv(event.target.value) })
                      }
                      placeholder={t('artifact-1, artifact-2', 'artifact-1, artifact-2')}
                    />
                  </div>
                  <div>
                    <Label>{t('Evidence URLs', 'Evidence URLs')}</Label>
                    <Input
                      value={joinCsv(template.evidence_urls)}
                      onChange={(event) =>
                        updateTemplate(index, { evidence_urls: splitCsv(event.target.value) })
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>{t('Due in days', 'Due in days')}</Label>
                    <Input
                      value={formatOptionalNumber(template.due_in_days)}
                      onChange={(event) =>
                        updateTemplate(index, { due_in_days: parseOptionalNumber(event.target.value) })
                      }
                      placeholder="14"
                    />
                  </div>
                  <div>
                    <Label>{t('SLA in days', 'SLA in days')}</Label>
                    <Input
                      value={formatOptionalNumber(template.sla_in_days)}
                      onChange={(event) =>
                        updateTemplate(index, { sla_in_days: parseOptionalNumber(event.target.value) })
                      }
                      placeholder="30"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => removeTemplate(index)}>{t('Remove', 'Remove')}</Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
