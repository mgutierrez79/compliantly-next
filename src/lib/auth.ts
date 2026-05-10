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

  // sessionStorage rather than localStorage so the IdP token isn't
  // persisted across browser restarts. The credential of record is
  // the server-set httpOnly cookie minted via /v1/auth/oidc/exchange;
  // the OIDC user object only lives long enough to do the exchange.
  return new UserManager({
    authority: issuer,
    client_id: settings.oidcClientId.trim(),
    redirect_uri: redirectUri,
    post_logout_redirect_uri: postLogoutRedirectUri,
    response_type: 'code',
    scope: settings.oidcScope.trim() || 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
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
  const user = await manager.signinRedirectCallback()
  // Trade the IdP token for a server session cookie. From this point
  // the cookie is the credential — we drop the OIDC user from
  // session storage so a future bug can't accidentally fall back to
  // sending the IdP token as a Bearer.
  await exchangeOidcTokenForSession(user)
  await manager.removeUser()
  return user
}

async function exchangeOidcTokenForSession(user: User): Promise<void> {
  const settings = loadSettings()
  const baseUrl = settings.apiBaseUrl?.trim()?.replace(/\/+$/, '')
  if (!baseUrl) return
  const token = user.id_token ?? user.access_token
  if (!token) return
  const response = await fetch(`${baseUrl}/v1/auth/oidc/exchange`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `OIDC exchange failed: ${response.status}`)
  }
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
