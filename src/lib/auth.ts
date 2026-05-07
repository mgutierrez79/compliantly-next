import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'
import { loadSettings } from './settings'

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function buildOidcManager(): UserManager {
  const settings = loadSettings()
  const issuer = normalizeIssuer(settings.oidcIssuer)
  const redirectUri = `${window.location.origin}/auth/callback`
  const postLogoutRedirectUri = `${window.location.origin}/settings`

  const extraQueryParams: Record<string, string> = {}
  if (settings.oidcAudience.trim()) {
    extraQueryParams.audience = settings.oidcAudience.trim()
  }

  return new UserManager({
    authority: issuer,
    client_id: settings.oidcClientId.trim(),
    redirect_uri: redirectUri,
    post_logout_redirect_uri: postLogoutRedirectUri,
    response_type: 'code',
    scope: settings.oidcScope.trim() || 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    loadUserInfo: true,
    extraQueryParams,
  })
}

let _manager: UserManager | null = null

export function oidcManager(): UserManager {
  if (_manager) return _manager
  _manager = buildOidcManager()
  return _manager
}

export async function oidcSignIn(): Promise<void> {
  const manager = oidcManager()
  await manager.clearStaleState()
  await manager.signinRedirect()
}

export async function oidcHandleCallback(): Promise<User> {
  const manager = oidcManager()
  return await manager.signinRedirectCallback()
}

export async function oidcSignOut(): Promise<void> {
  const manager = oidcManager()
  const user = await manager.getUser()
  if (!user) {
    await manager.removeUser()
    return
  }
  await manager.signoutRedirect()
}

export async function oidcAccessToken(): Promise<string | null> {
  const manager = oidcManager()
  const user = await manager.getUser()
  if (!user || user.expired) return null
  return user.access_token
}
