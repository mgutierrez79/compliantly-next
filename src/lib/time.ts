import { loadSettings } from './settings'

const LOCALE_BY_LANGUAGE: Record<'en' | 'es' | 'fr', string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
}

export function formatTimestamp(value?: string) {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  const settings = loadSettings()
  const locale = LOCALE_BY_LANGUAGE[settings.language] ?? 'en-US'
  const timeZone = settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date)
}
