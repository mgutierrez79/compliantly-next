import type { LogLevel } from './logger'

export type UiSettings = {
  apiBaseUrl: string
  tenantId: string
  language: 'en' | 'es' | 'fr'
  timeZone: string
  authMode: 'apiKey' | 'oidc' | 'local'
  apiKey: string
  localToken: string
  oidcIssuer: string
  oidcClientId: string
  oidcScope: string
  oidcAudience: string
  logLevel: LogLevel
}

const STORAGE_KEY = 'compliantly.ui.settings'

export function defaultSettings(): UiSettings {
  const envLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL
  return {
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api',
    tenantId: '',
    language: (process.env.NEXT_PUBLIC_UI_LANGUAGE as UiSettings['language']) ?? 'en',
    timeZone: 'UTC',
    authMode: (process.env.NEXT_PUBLIC_AUTH_MODE as UiSettings['authMode']) ?? 'apiKey',
    apiKey: process.env.NEXT_PUBLIC_API_KEY ?? '',
    localToken: '',
    oidcIssuer: process.env.NEXT_PUBLIC_OIDC_ISSUER ?? '',
    oidcClientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? '',
    oidcScope: process.env.NEXT_PUBLIC_OIDC_SCOPE ?? 'openid profile email',
    oidcAudience: process.env.NEXT_PUBLIC_OIDC_AUDIENCE ?? '',
    logLevel: isLogLevel(envLogLevel) ? envLogLevel : 'info',
  }
}

export function loadSettings(): UiSettings {
  const baseDefaults = defaultSettings()
  const browserLang =
    typeof navigator !== 'undefined' && navigator.language ? navigator.language.split('-')[0] : 'en'
  const inferredLanguage = browserLang === 'es' || browserLang === 'fr' ? browserLang : 'en'
  const inferredTimeZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const defaults: UiSettings = {
    ...baseDefaults,
    language: process.env.NEXT_PUBLIC_UI_LANGUAGE ? baseDefaults.language : inferredLanguage,
    timeZone: inferredTimeZone ?? 'UTC',
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<UiSettings>
    return {
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl ? parsed.apiBaseUrl : defaults.apiBaseUrl,
      apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey ? parsed.apiKey : defaults.apiKey,
      localToken: typeof parsed.localToken === 'string' ? parsed.localToken : '',
      tenantId: typeof parsed.tenantId === 'string' ? parsed.tenantId : '',
      language: parsed.language === 'es' || parsed.language === 'fr' ? parsed.language : defaults.language,
      timeZone: typeof parsed.timeZone === 'string' && parsed.timeZone ? parsed.timeZone : defaults.timeZone,
      authMode: parsed.authMode === 'oidc' ? 'oidc' : parsed.authMode === 'local' ? 'local' : 'apiKey',
      oidcIssuer: typeof parsed.oidcIssuer === 'string' ? parsed.oidcIssuer : defaults.oidcIssuer,
      oidcClientId: typeof parsed.oidcClientId === 'string' ? parsed.oidcClientId : defaults.oidcClientId,
      oidcScope: typeof parsed.oidcScope === 'string' && parsed.oidcScope ? parsed.oidcScope : defaults.oidcScope,
      oidcAudience: typeof parsed.oidcAudience === 'string' ? parsed.oidcAudience : defaults.oidcAudience,
      logLevel: isLogLevel(parsed.logLevel) ? parsed.logLevel : defaults.logLevel,
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: UiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function isLogLevel(value: unknown): value is UiSettings['logLevel'] {
  return value === 'critical' || value === 'error' || value === 'warning' || value === 'info' || value === 'debug'
}
