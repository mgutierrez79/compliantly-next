'use client'

import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, Input, Label, PageTitle, Textarea } from '../components/Ui'

type ActionStatus = 'open' | 'in_progress' | 'waiting' | 'blocked' | 'done'

type ReminderEntry = {
  remind_at: string
  last_sent_at?: string | null
}

type PolicyTaskEntry = {
  task_id: string
  title: string
  description?: string | null
  owner?: string | null
  due_date?: string | null
  status: ActionStatus
  status_label?: string | null
  policy_key?: string | null
  reminders: ReminderEntry[]
  metadata: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
}

type PolicyTasksResponse = {
  items: PolicyTaskEntry[]
  count: number
}

type AuthMeResponse = {
  subject: string
  roles: string[]
  tenant_id?: string | null
}

const statusOptions: ActionStatus[] = ['open', 'in_progress', 'waiting', 'blocked', 'done']

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

export function PolicyTasksPage() {
  const [items, setItems] = useState<PolicyTaskEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [roleLabel, setRoleLabel] = useState<string>('Collaborator')

  const [filterStatus, setFilterStatus] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterPolicyKey, setFilterPolicyKey] = useState('')

  const [createTitle, setCreateTitle] = useState('')
  const [createOwner, setCreateOwner] = useState('')
  const [createDueDate, setCreateDueDate] = useState('')
  const [createStatus, setCreateStatus] = useState<ActionStatus>('open')
  const [createDescription, setCreateDescription] = useState('')
  const [createPolicyKey, setCreatePolicyKey] = useState('')
  const [createReminders, setCreateReminders] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [reminderUpdatingId, setReminderUpdatingId] = useState<string | null>(null)
  const [remindSendingId, setRemindSendingId] = useState<string | null>(null)
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, string>>({})

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterOwner) params.set('owner', filterOwner)
    if (filterPolicyKey) params.set('policy_key', filterPolicyKey)
    params.set('limit', '200')
    return params.toString()
  }, [filterStatus, filterOwner, filterPolicyKey])

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

  const loadTasks = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiJson<PolicyTasksResponse>(`/workflow/policy-tasks?${queryString}`)
      setItems(response.items)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
    loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const canManage = roles.includes('admin') || roles.includes('reporter')
  const isReadOnlyAuditor = roles.includes('auditor') && !canManage

  const handleCreate = async () => {
    if (!createTitle.trim()) {
      setMessage('Provide a title for the policy task.')
      return
    }
    setMessage(null)
    try {
      await apiJson<PolicyTaskEntry>('/workflow/policy-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          owner: createOwner.trim() || undefined,
          due_date: createDueDate.trim() || undefined,
          status: createStatus || undefined,
          description: createDescription.trim() || undefined,
          policy_key: createPolicyKey.trim() || undefined,
          reminders: splitList(createReminders).map((remind_at) => ({ remind_at })),
        }),
      })
      setCreateTitle('')
      setCreateOwner('')
      setCreateDueDate('')
      setCreateStatus('open')
      setCreateDescription('')
      setCreatePolicyKey('')
      setCreateReminders('')
      setMessage('Policy task created.')
      await loadTasks()
    } catch (err) {
      setError(err as ApiError)
    }
  }

  const handleStatusChange = async (taskId: string, status: ActionStatus) => {
    setStatusUpdatingId(taskId)
    setMessage(null)
    try {
      await apiJson<PolicyTaskEntry>(`/workflow/policy-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setMessage(`Status updated to ${status}.`)
      await loadTasks()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleReminderUpdate = async (taskId: string) => {
    setReminderUpdatingId(taskId)
    setMessage(null)
    try {
      const value = reminderDrafts[taskId] || ''
      await apiJson<PolicyTaskEntry>(`/workflow/policy-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminders: splitList(value).map((remind_at) => ({ remind_at })),
        }),
      })
      setMessage('Reminders updated.')
      await loadTasks()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setReminderUpdatingId(null)
    }
  }

  const handleRemind = async (taskId: string) => {
    setRemindSendingId(taskId)
    setMessage(null)
    try {
      await apiJson<PolicyTaskEntry>(`/workflow/policy-tasks/${taskId}/remind`, { method: 'POST' })
      setMessage('Reminder logged.')
      await loadTasks()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setRemindSendingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Policy Tasks</PageTitle>
        <Button onClick={loadTasks} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error ? <ErrorBox title="Policy tasks error" detail={error.message} /> : null}
      {message ? <div className="rounded-md border border-[#274266] bg-[#0f1f36] p-3 text-sm">{message}</div> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">Role: {roleLabel}</div>
          <div className="text-xs text-slate-400">Auditors can create and manage tasks.</div>
        </div>
        {canManage ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Title</Label>
                <Input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} />
              </div>
              <div>
                <Label>Owner</Label>
                <Input value={createOwner} onChange={(event) => setCreateOwner(event.target.value)} />
              </div>
              <div>
                <Label>Policy key</Label>
                <Input value={createPolicyKey} onChange={(event) => setCreatePolicyKey(event.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={createStatus}
                  onChange={(event) => setCreateStatus(event.target.value as ActionStatus)}
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
                <Label>Due date (ISO)</Label>
                <Input value={createDueDate} onChange={(event) => setCreateDueDate(event.target.value)} />
              </div>
              <div>
                <Label>Reminders (ISO, comma separated)</Label>
                <Input value={createReminders} onChange={(event) => setCreateReminders(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleCreate}>Create task</Button>
            </div>
          </>
        ) : isReadOnlyAuditor ? (
          <div className="mt-3 text-sm text-slate-300">Read-only auditors can view tasks but cannot edit.</div>
        ) : (
          <div className="mt-3 text-sm text-slate-300">Collaborators can view tasks but cannot edit.</div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm font-semibold text-slate-100">Filter</div>
          <div className="min-w-[180px]">
            <Label>Status</Label>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <Label>Owner</Label>
            <Input value={filterOwner} onChange={(event) => setFilterOwner(event.target.value)} />
          </div>
          <div className="min-w-[220px]">
            <Label>Policy key</Label>
            <Input value={filterPolicyKey} onChange={(event) => setFilterPolicyKey(event.target.value)} />
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {items.length === 0 && !loading ? <div className="text-sm text-slate-400">No policy tasks yet.</div> : null}
        {items.map((item) => {
          const isExpanded = expandedId === item.task_id
          const reminderDraft = reminderDrafts[item.task_id] ?? item.reminders.map((r) => r.remind_at).join(', ')
          return (
            <Card key={item.task_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-100">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Status: {item.status_label || item.status} · Owner: {item.owner || 'unassigned'} · Due:{' '}
                    {formatDate(item.due_date)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Policy: {item.policy_key || 'n/a'}</div>
                </div>
                <Button onClick={() => setExpandedId(isExpanded ? null : item.task_id)}>
                  {isExpanded ? 'Hide details' : 'View details'}
                </Button>
              </div>

              {isExpanded ? (
                <div className="mt-4 space-y-4 border-t border-[#1f365a] pt-4">
                  {item.description ? <div className="text-sm text-slate-200">{item.description}</div> : null}

                  <div>
                    <Label>Reminders</Label>
                    <div className="mt-1 space-y-1 text-sm text-slate-300">
                      {item.reminders.length ? (
                        item.reminders.map((reminder) => (
                          <div key={reminder.remind_at}>
                            {reminder.remind_at} · last sent: {formatDate(reminder.last_sent_at)}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400">No reminders configured.</div>
                      )}
                    </div>
                  </div>

                  {canManage ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Update reminders (ISO, comma separated)</Label>
                        <Input
                          value={reminderDraft}
                          onChange={(event) =>
                            setReminderDrafts((prev) => ({ ...prev, [item.task_id]: event.target.value }))
                          }
                        />
                        <div className="mt-3 flex gap-2">
                          <Button
                            onClick={() => handleReminderUpdate(item.task_id)}
                            disabled={reminderUpdatingId === item.task_id}
                          >
                            {reminderUpdatingId === item.task_id ? 'Saving...' : 'Save reminders'}
                          </Button>
                          <Button
                            onClick={() => handleRemind(item.task_id)}
                            disabled={remindSendingId === item.task_id}
                          >
                            {remindSendingId === item.task_id ? 'Sending...' : 'Send reminder'}
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label>Status</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {statusOptions.map((status) => (
                            <Button
                              key={status}
                              onClick={() => handleStatusChange(item.task_id, status)}
                              disabled={statusUpdatingId === item.task_id || item.status === status}
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
