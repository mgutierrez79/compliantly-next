'use client'

// LanguageSwitcher — compact <select> that drives the i18n provider
// AND syncs a `compliantly.lang` cookie the Go API reads when it
// renders a localised report. The dropdown options show each
// language's autonym (Français, Deutsch, ...) so a user who only
// reads German can still find their language when the UI is currently
// in English.

import { LANGUAGE_AUTONYMS, SUPPORTED_LANGUAGES, useI18n, type Language } from '../lib/i18n'

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        marginBottom: 8,
        background: 'var(--color-background-tertiary)',
        borderRadius: 'var(--border-radius-md)',
        fontSize: 11,
      }}
    >
      <i className="ti ti-language" aria-hidden="true" style={{ color: 'var(--color-text-tertiary)' }} />
      <label
        htmlFor="attestiv-language-switcher"
        style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
      >
        {t('language.switcher_label')}
      </label>
      <select
        id="attestiv-language-switcher"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          fontFamily: 'inherit',
          fontSize: 11,
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_AUTONYMS[lang]}
          </option>
        ))}
      </select>
    </div>
  )
}
