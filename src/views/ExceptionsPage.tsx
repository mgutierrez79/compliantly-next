'use client';
import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, HelpTip, Input, Label, PageTitle } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type ExceptionTicket = {
  system?: string | null
  ticket_id?: string | null
  url?: string | null
  status?: string | null
}

type ExceptionItem = {
  exception_id: string
  risk_id?: string | null
  run_id?: string | null
  title: string
  description?: string | null
  reason?: string | null
  owner?: string | null
  status?: string | null
  status_label?: string | null
  expires_on?: string | null
  approved_by?: string | null
  approved_at?: string | null
  acceptance_note?: string | null
  remediation_plan?: string | null
  ticket?: ExceptionTicket | null
  expired_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type ExceptionsResponse = { items: ExceptionItem[]; count: number }
type AuthMeResponse = { roles: string[] }

const statusActions: Record<string, Array<{ label: string; next: string }>> = {
  requested: [
    { label: 'Approve', next: 'approved' },
    { label: 'Reject', next: 'rejected' },
  ],
  approved: [{ label: 'Expire', next: 'expired' }],
  rejected: [{ label: 'Reopen', next: 'requested' }],
}

export function ExceptionsPage() {
  const {
    t
  } = useI18n();

  const [data, setData] = useState<ExceptionsResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [roleLabel, setRoleLabel] = useState('Collaborator')
  const [filters, setFilters] = useState({ status: '', owner: '', risk_id: '' })
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    title: '',
    reason: '',
    owner: '',
    status: 'requested',
    expires_on: '',
    remediation_plan: '',
    acceptance_note: '',
    ticket_system: '',
    ticket_id: '',
    ticket_url: '',
    ticket_status: '',
  })

  const fetchExceptions = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.owner) params.set('owner', filters.owner)
      if (filters.risk_id) params.set('risk_id', filters.risk_id)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const result = await apiJson<ExceptionsResponse>(`/risk/exceptions${suffix}`)
      setData(result)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchExceptions()
    // Initial load only; filter changes are applied by the Fetch button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadRoles = async () => {
      try {
        const response = await apiJson<AuthMeResponse>('/auth/me')
        const roleList = (response.roles || []).map((role) => role.toLowerCase())
        if (!cancelled) {
          setRoles(roleList)
          if (roleList.includes('admin') || roleList.includes('reporter')) {
            setRoleLabel('Auditor')
          } else if (roleList.includes('auditor')) {
            setRoleLabel('Auditor (read-only)')
          } else {
            setRoleLabel('Collaborator')
          }
        }
      } catch {
        if (!cancelled) {
          setRoles([])
          setRoleLabel('Collaborator')
        }
      }
    }
    void loadRoles()
    return () => {
      cancelled = true
    }
  }, [])

  const canManage = roles.includes('admin') || roles.includes('reporter')
  const isReadOnlyAuditor = roles.includes('auditor') && !canManage

  const createException = async () => {
    setActionError(null)
    try {
      const payload = {
        title: form.title,
        reason: form.reason || undefined,
        owner: form.owner || undefined,
        status: form.status || undefined,
        expires_on: form.expires_on || undefined,
        remediation_plan: form.remediation_plan || undefined,
        acceptance_note: form.acceptance_note || undefined,
        ticket: {
          system: form.ticket_system || undefined,
          ticket_id: form.ticket_id || undefined,
          url: form.ticket_url || undefined,
          status: form.ticket_status || undefined,
        },
      }
      await apiJson('/risk/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setForm({
        title: '',
        reason: '',
        owner: '',
        status: 'requested',
        expires_on: '',
        remediation_plan: '',
        acceptance_note: '',
        ticket_system: '',
        ticket_id: '',
        ticket_url: '',
        ticket_status: '',
      })
      await fetchExceptions()
    } catch (e) {
      setActionError(e as ApiError)
    }
  }

  const updateStatus = async (exceptionId: string, next: string) => {
    setActionError(null)
    try {
      await apiJson(`/risk/exceptions/${encodeURIComponent(exceptionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      await fetchExceptions()
    } catch (e) {
      setActionError(e as ApiError)
    }
  }

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const fields = [
        item.title,
        item.reason,
        item.owner,
        item.status,
        item.risk_id,
        item.ticket?.ticket_id,
      ]
      return fields.some((field) => String(field ?? '').toLowerCase().includes(q))
    })
  }, [data, query])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PageTitle>{t('Exceptions', 'Exceptions')}</PageTitle>
          <HelpTip text="Track risk exceptions, approvals, ticketing links, and expiry." />
        </div>
        <Button onClick={fetchExceptions} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh list'}
        </Button>
      </div>
      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}
      {actionError ? <ErrorBox title={actionError.message} detail={actionError.bodyText} /> : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label>{t('Create exception', 'Create exception')}</Label>
            <HelpTip text="Use this for risk acceptance, remediation tracking, and ticket references." />
          </div>
          <div className="text-xs text-slate-400">{t('Role:', 'Role:')} {roleLabel}</div>
        </div>
        {canManage ? (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <Label>{t('Title', 'Title')}</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>{t('Owner', 'Owner')}</Label>
                <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
              </div>
              <div>
                <Label>{t('Reason', 'Reason')}</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div>
                <Label>{t('Status', 'Status')}</Label>
                <select
                  className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="requested">{t('Requested', 'Requested')}</option>
                  <option value="approved">{t('Approved', 'Approved')}</option>
                  <option value="rejected">{t('Rejected', 'Rejected')}</option>
                  <option value="expired">{t('Expired', 'Expired')}</option>
                </select>
              </div>
              <div>
                <Label>{t('Expires on', 'Expires on')}</Label>
                <Input
                  value={form.expires_on}
                  onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <Label>{t('Remediation plan', 'Remediation plan')}</Label>
                <Input
                  value={form.remediation_plan}
                  onChange={(e) => setForm({ ...form, remediation_plan: e.target.value })}
                  placeholder={t('Short plan or control reference', 'Short plan or control reference')}
                />
              </div>
              <div>
                <Label>{t('Acceptance note', 'Acceptance note')}</Label>
                <Input
                  value={form.acceptance_note}
                  onChange={(e) => setForm({ ...form, acceptance_note: e.target.value })}
                  placeholder={t('Approved with conditions', 'Approved with conditions')}
                />
              </div>
            </div>
            <div className="mt-4 border-t border-slate-800 pt-4">
              <Label>{t('Ticketing', 'Ticketing')}</Label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input
                  value={form.ticket_system}
                  onChange={(e) => setForm({ ...form, ticket_system: e.target.value })}
                  placeholder={t('System (ServiceNow, Jira)', 'System (ServiceNow, Jira)')}
                />
                <Input
                  value={form.ticket_id}
                  onChange={(e) => setForm({ ...form, ticket_id: e.target.value })}
                  placeholder={t('Ticket ID', 'Ticket ID')}
                />
                <Input
                  value={form.ticket_url}
                  onChange={(e) => setForm({ ...form, ticket_url: e.target.value })}
                  placeholder={t('Ticket URL', 'Ticket URL')}
                />
                <Input
                  value={form.ticket_status}
                  onChange={(e) => setForm({ ...form, ticket_status: e.target.value })}
                  placeholder={t('Ticket status', 'Ticket status')}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={createException} disabled={!form.title.trim()}>
                {t('Create exception', 'Create exception')}
              </Button>
            </div>
          </>
        ) : isReadOnlyAuditor ? (
          <div className="mt-3 text-sm text-slate-300">{t(
            'Read-only auditors can view exceptions but cannot edit.',
            'Read-only auditors can view exceptions but cannot edit.'
          )}</div>
        ) : (
          <div className="mt-3 text-sm text-slate-300">{t(
            'Collaborators can view exceptions but cannot edit.',
            'Collaborators can view exceptions but cannot edit.'
          )}</div>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>{t('Exceptions list', 'Exceptions list')}</Label>
            <div className="text-xs text-slate-400">{data ? `${data.count} items` : 'n/a'}</div>
          </div>
          <div className="flex items-center gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search', 'Search')} />
            <Input
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              placeholder={t('Owner filter', 'Owner filter')}
            />
            <Input
              value={filters.risk_id}
              onChange={(e) => setFilters({ ...filters, risk_id: e.target.value })}
              placeholder={t('Risk ID filter', 'Risk ID filter')}
            />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">{t('Title', 'Title')}</th>
                <th className="py-2 pr-4">{t('Owner', 'Owner')}</th>
                <th className="py-2 pr-4">{t('Status', 'Status')}</th>
                <th className="py-2 pr-4">{t('Expires', 'Expires')}</th>
                <th className="py-2 pr-4">{t('Ticket', 'Ticket')}</th>
                <th className="py-2 pr-4">{t('Actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((item) => (
                <tr key={item.exception_id} className="text-slate-200">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-slate-400">{item.reason || 'n/a'}</div>
                  </td>
                  <td className="py-2 pr-4">{item.owner || 'n/a'}</td>
                  <td className="py-2 pr-4">{item.status_label || item.status || 'n/a'}</td>
                  <td className="py-2 pr-4">{item.expires_on || 'n/a'}</td>
                  <td className="py-2 pr-4">
                    {item.ticket?.ticket_id ? (
                      <div>
                        <div>{item.ticket.ticket_id}</div>
                        <div className="text-xs text-slate-400">{item.ticket.status || ''}</div>
                      </div>
                    ) : (
                      'n/a'
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {canManage
                        ? (statusActions[item.status || 'requested'] || []).map((action) => (
                            <Button key={action.next} onClick={() => updateStatus(item.exception_id, action.next)}>
                              {action.label}
                            </Button>
                          ))
                        : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td className="py-4 text-sm text-slate-400" colSpan={6}>
                    {t('No exceptions found.', 'No exceptions found.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
