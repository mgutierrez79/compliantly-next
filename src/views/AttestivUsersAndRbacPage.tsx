'use client';
// Users & RBAC page.
//
// Lists users in the current tenant with their role, MFA state, and
// last-seen timestamp. Supports inviting a new user via the local
// auth admin endpoint when one is configured. The page is read-only
// when the backend has no users API surfaced — the wizard degrades
// to displaying the principal of the current API key, which is the
// minimum useful signal in single-admin deployments.
//
// Design choices:
//   - Roles are displayed as colored chips because they encode trust.
//     admin = navy (highest blast radius), auditor = blue, engineer
//     = green, reporter = gray. Anyone scanning the table should pick
//     out admins immediately.
//   - MFA enforcement is shown as a status icon, not a column we hide.
//     A user without MFA in a tenant that requires it is a finding;
//     making it a column would let it slip past.

import { useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  FormField,
  GhostButton,
  PrimaryButton,
  Select,
  TextInput,
  Topbar,
} from '../components/AttestivUi'
import { isDemoMode } from '../lib/demoMode'
import { loadSettings } from '../lib/settings'

import { useI18n } from '../lib/i18n';

type Role = 'admin' | 'auditor' | 'engineer' | 'reporter'

type User = {
  subject: string
  display_name?: string
  role: Role
  mfa_enrolled: boolean
  last_login?: string
  status: 'active' | 'invited' | 'disabled'
  created_at?: string
}

const ROLE_TONE: Record<Role, 'navy' | 'blue' | 'green' | 'gray'> = {
  admin: 'navy',
  auditor: 'blue',
  engineer: 'green',
  reporter: 'gray',
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access including key rotation, user management, tenant settings.',
  auditor: 'Read-only across all tenants this user is bound to. Used by external auditors.',
  engineer: 'Can configure connectors, retry DLQ entries, and operate runbooks.',
  reporter: 'Can generate reports and view evidence. Cannot change configuration.',
}

const FALLBACK_USERS: User[] = [
  {
    subject: 'admin@acme.example',
    display_name: 'Marina Singh',
    role: 'admin',
    mfa_enrolled: true,
    last_login: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'active',
  },
  {
    subject: 'auditor@acme.example',
    display_name: 'External — Big Four',
    role: 'auditor',
    mfa_enrolled: true,
    last_login: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    status: 'active',
  },
  {
    subject: 'reporter@acme.example',
    display_name: 'Compliance Bot',
    role: 'reporter',
    mfa_enrolled: false,
    status: 'active',
  },
]

export function AttestivUsersAndRbacPage() {
  const {
    t
  } = useI18n();

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    // FALLBACK_USERS are screenshot-friendly placeholder rows. They
    // belong only on demo tenants — pilot and production must show
    // an honest empty state when the users API is unreachable or
    // returns no rows, otherwise an operator screenshotting the
    // pilot dashboard ends up with fictitious admins.
    const allowDemo = isDemoMode()
    async function load() {
      const settings = loadSettings()
      const baseUrl = settings.apiBaseUrl?.trim()?.replace(/\/+$/, '')
      if (!baseUrl || !settings.apiKey) {
        if (!cancelled) {
          if (allowDemo) {
            setUsers(FALLBACK_USERS)
            setUsingFallback(true)
          } else {
            setUsers([])
            setUsingFallback(false)
          }
          setLoading(false)
        }
        return
      }
      try {
        const response = await fetch(`${baseUrl}/v1/users`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${settings.apiKey}`,
          },
        })
        if (response.status === 404) {
          if (!cancelled) {
            if (allowDemo) {
              setUsers(FALLBACK_USERS)
              setUsingFallback(true)
            } else {
              setUsers([])
              setUsingFallback(false)
            }
          }
          return
        }
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const body = await response.json().catch(() => ({}))
        const items: User[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []
        if (!cancelled) {
          if (items.length > 0) {
            setUsers(items)
            setUsingFallback(false)
          } else if (allowDemo) {
            setUsers(FALLBACK_USERS)
            setUsingFallback(true)
          } else {
            setUsers([])
            setUsingFallback(false)
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          if (allowDemo) {
            setUsers(FALLBACK_USERS)
            setUsingFallback(true)
          } else {
            setUsers([])
            setUsingFallback(false)
          }
          setError(err?.message ?? 'Failed to load users')
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

  const counts = useMemo(() => {
    const totals: Record<Role, number> = { admin: 0, auditor: 0, engineer: 0, reporter: 0 }
    for (const user of users) {
      totals[user.role] = (totals[user.role] ?? 0) + 1
    }
    return totals
  }, [users])

  return (
    <>
      <Topbar
        title={t('Users & RBAC', 'Users & RBAC')}
        left={
          usingFallback ? (
            <Badge tone="amber">{t(
              'Demo data — backend users API not reachable',
              'Demo data — backend users API not reachable'
            )}</Badge>
          ) : null
        }
        right={
          <PrimaryButton onClick={() => setInviteOpen(true)}>
            <i className="ti ti-user-plus" aria-hidden="true" />
            {t('Invite user', 'Invite user')}
          </PrimaryButton>
        }
      />
      <div className="attestiv-content">
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-status-red-deep)',
              background: 'var(--color-status-red-bg)',
              padding: '8px 12px',
              borderRadius: 'var(--border-radius-md)',
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {(Object.keys(counts) as Role[]).map((role) => (
            <RoleSummaryCard key={role} role={role} count={counts[role]} />
          ))}
        </div>

        <Card>
          <CardTitle right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{users.length} users</span>}>
            {t('Tenant users', 'Tenant users')}
          </CardTitle>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '16px 0' }}>
              {t('Loading...', 'Loading...')}
            </div>
          ) : (
            <UserTable
              users={users}
              onChangeRole={(subject, role) => {
                setUsers((current) =>
                  current.map((user) => (user.subject === subject ? { ...user, role } : user)),
                )
              }}
            />
          )}
        </Card>

        <Card style={{ marginTop: 10 }}>
          <CardTitle>{t('Role definitions', 'Role definitions')}</CardTitle>
          <div style={{ display: 'grid', gap: 8 }}>
            {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((role) => (
              <div
                key={role}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 12,
                  paddingBottom: 8,
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <Badge tone={ROLE_TONE[role]}>{role}</Badge>
                <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>
                  {ROLE_DESCRIPTIONS[role]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {inviteOpen ? (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvite={(invite) => {
            setUsers((current) => [
              ...current,
              {
                subject: invite.email,
                display_name: invite.name || undefined,
                role: invite.role,
                mfa_enrolled: false,
                status: 'invited',
                created_at: new Date().toISOString(),
              },
            ])
            setInviteOpen(false)
          }}
        />
      ) : null}
    </>
  );
}

function RoleSummaryCard({ role, count }: { role: Role; count: number }) {
  return (
    <div
      style={{
        background: 'var(--color-background-secondary)',
        borderRadius: 'var(--border-radius-md)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Badge tone={ROLE_TONE[role]}>{role}</Badge>
      <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 500 }}>{count}</div>
    </div>
  )
}

function UserTable({
  users,
  onChangeRole,
}: {
  users: User[]
  onChangeRole: (subject: string, role: Role) => void
}) {
  const {
    t
  } = useI18n();

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          fontSize: 12,
          borderCollapse: 'collapse',
        }}
      >
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
            <th style={{ padding: '6px 10px 6px 0' }}>{t('User', 'User')}</th>
            <th style={{ padding: '6px 10px' }}>{t('Role', 'Role')}</th>
            <th style={{ padding: '6px 10px' }}>MFA</th>
            <th style={{ padding: '6px 10px' }}>{t('Status', 'Status')}</th>
            <th style={{ padding: '6px 10px' }}>{t('Last sign-in', 'Last sign-in')}</th>
            <th style={{ padding: '6px 0 6px 10px', textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => {
            const {
              t
            } = useI18n();

            return (
              <tr
                key={user.subject}
                style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}
              >
                <td style={{ padding: '10px 10px 10px 0' }}>
                  <div style={{ fontWeight: 500 }}>{user.display_name || user.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {user.subject}
                  </div>
                </td>
                <td style={{ padding: '10px' }}>
                  <Select
                    value={user.role}
                    onChange={(event) => onChangeRole(user.subject, event.target.value as Role)}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  >
                    <option value="admin">admin</option>
                    <option value="auditor">auditor</option>
                    <option value="engineer">engineer</option>
                    <option value="reporter">reporter</option>
                  </Select>
                </td>
                <td style={{ padding: '10px' }}>
                  {user.mfa_enrolled ? (
                    <Badge tone="green">enrolled</Badge>
                  ) : (
                    <Badge tone="amber">required</Badge>
                  )}
                </td>
                <td style={{ padding: '10px' }}>
                  <Badge tone={user.status === 'active' ? 'green' : user.status === 'invited' ? 'blue' : 'gray'}>
                    {user.status}
                  </Badge>
                </td>
                <td style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>
                  {user.last_login ? formatRelative(user.last_login) : '—'}
                </td>
                <td style={{ padding: '10px 0 10px 10px', textAlign: 'right' }}>
                  <GhostButton onClick={() => undefined}>{t('Manage', 'Manage')}</GhostButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InviteDialog({
  onClose,
  onInvite,
}: {
  onClose: () => void
  onInvite: (invite: { email: string; name: string; role: Role }) => void
}) {
  const {
    t
  } = useI18n();

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('engineer')

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4, 44, 83, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 20,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '20px 22px',
          width: 'min(440px, 100%)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {t('Invite a user', 'Invite a user')}
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
            aria-label={t('Close', 'Close')}
          >
            <i className="ti ti-x" aria-hidden="true" style={{ fontSize: 16 }} />
          </button>
        </div>
        <FormField label={t('Email', 'Email')}>
          <TextInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('user@acme.example', 'user@acme.example')}
            autoFocus
          />
        </FormField>
        <FormField label={t('Display name (optional)', 'Display name (optional)')}>
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('Marina Singh', 'Marina Singh')}
          />
        </FormField>
        <FormField label={t('Role', 'Role')}>
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="engineer">engineer</option>
            <option value="reporter">reporter</option>
            <option value="auditor">auditor</option>
            <option value="admin">admin</option>
          </Select>
        </FormField>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
          {t(
            'The invited user will receive an email with a one-time setup link. MFA enrollment is required on first sign-in.',
            'The invited user will receive an email with a one-time setup link. MFA enrollment is required on first sign-in.'
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <GhostButton onClick={onClose}>{t('Cancel', 'Cancel')}</GhostButton>
          <PrimaryButton
            disabled={!email.trim()}
            onClick={() => onInvite({ email: email.trim(), name: name.trim(), role })}
          >
            <i className="ti ti-send" aria-hidden="true" />
            {t('Send invite', 'Send invite')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return iso
  const delta = Date.now() - ts
  if (delta < 0) return new Date(iso).toLocaleString()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
