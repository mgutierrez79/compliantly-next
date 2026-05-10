import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { defaultSettings, loadSettings, saveSettings } from './settings'

export type Language = 'en' | 'es' | 'fr' | 'de'

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'fr', 'es', 'de']

// Names of each language presented in itself (autonyms) — what the
// switcher shows in the dropdown so a user who only reads German can
// find their language even when the UI is currently in English.
export const LANGUAGE_AUTONYMS: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
}

// Cookie the Go API reads to localise report generation when the
// request doesn't include an explicit ?lang= parameter. Synced from
// localStorage on every language change so the user's choice persists
// across browser sessions AND is visible to the backend on the next
// PDF/Markdown request.
const LANG_COOKIE = 'compliantly.lang'

function syncLanguageCookie(language: Language) {
  if (typeof document === 'undefined') return
  const oneYearSeconds = 60 * 60 * 24 * 365
  // SameSite=Lax matches the session cookie behaviour and lets the
  // backend read the value during normal navigation; we don't need
  // cross-site delivery for the language preference.
  document.cookie = `${LANG_COOKIE}=${language}; Max-Age=${oneYearSeconds}; Path=/; SameSite=Lax`
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

type I18nContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translator
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'Management Console': 'Management Console',
    Snapshot: 'Snapshot',
    'Refresh snapshot': 'Refresh snapshot',
    'Refreshing...': 'Refreshing...',
    'Snapshot refreshed.': 'Snapshot refreshed.',
    'Reports': 'Reports',
    'Auditor Portal': 'Auditor Portal',
    Executive: 'Executive',
    Dashboard: 'Dashboard',
    'Executive Brief': 'Executive Brief',
    'Executive View': 'Executive View',
    'Board Readout': 'Board Readout',
    'Policy Engine': 'Policy Engine',
    Ingestion: 'Ingestion',
    Health: 'Health',
    Evidence: 'Evidence',
    'Evidence Templates': 'Evidence Templates',
    Exceptions: 'Exceptions',
    Analytics: 'Analytics',
    Inventory: 'Inventory',
    'Infrastructure Dependency': 'Infrastructure Dependency',
    Regulations: 'Regulations',
    Connectors: 'Connectors',
    'Control Mappings': 'Control Mappings',
    'Policy Tasks': 'Policy Tasks',
    'Trust Center': 'Trust Center',
    Jobs: 'Jobs',
    Settings: 'Settings',
    Save: 'Save',
    'Save mappings': 'Save mappings',
    'Saving...': 'Saving...',
    Loading: 'Loading',
    'Loading control library...': 'Loading control library...',
    'Loading crosswalks...': 'Loading crosswalks...',
    Retry: 'Retry',
    Language: 'Language',
    English: 'English',
    Spanish: 'Spanish',
    French: 'French',
    Help: 'Help',
    Close: 'Close',
    'Refresh failed: {message}': 'Refresh failed: {message}',
    'UI language. Example: English, Espanol, Francais.': 'UI language. Example: English, Espanol, Francais.',
    'Report language code. Example: en, fr, es.': 'Report language code. Example: en, fr, es.',
    'nav.dashboard': 'Dashboard',
    'nav.connectors': 'Connectors',
    'nav.evidence': 'Evidence',
    'nav.frameworks': 'Frameworks',
    'nav.risks': 'Risks',
    'nav.policies': 'Policies',
    'nav.exceptions': 'Exceptions',
    'nav.remediation': 'Remediation',
    'nav.incidents': 'Incidents',
    'nav.third_parties': 'Third parties',
    'nav.dr': 'Disaster recovery',
    'nav.apps': 'Applications',
    'nav.sites': 'Sites',
    'nav.audit': 'Audit',
    'nav.settings': 'Settings',
    'nav.support': 'Support bundle',
    'nav.logout': 'Sign out',
    'login.title': 'Sign in to Attestiv',
    'login.email_label': 'Email',
    'login.password_label': 'Password',
    'login.submit_button': 'Sign in',
    'frameworks.title': 'Frameworks',
    'frameworks.generate_report': 'Generate report',
    'frameworks.subscribed_badge': 'Subscribed',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.loading': 'Loading...',
    'language.switcher_label': 'Language',
  },
  es: {
    'Management Console': 'Consola de Gestion',
    Snapshot: 'Instantanea',
    'Refresh snapshot': 'Actualizar instantanea',
    'Refreshing...': 'Actualizando...',
    'Snapshot refreshed.': 'Instantanea actualizada.',
    Reports: 'Informes',
    'Auditor Portal': 'Portal de Auditoria',
    Executive: 'Ejecutivo',
    Dashboard: 'Panel',
    'Executive Brief': 'Resumen Ejecutivo',
    'Executive View': 'Vista Ejecutiva',
    'Board Readout': 'Lectura de Consejo',
    'Policy Engine': 'Motor de Politica',
    Ingestion: 'Ingestion',
    Health: 'Estado',
    Evidence: 'Evidencias',
    'Evidence Templates': 'Plantillas de Evidencia',
    Exceptions: 'Excepciones',
    Analytics: 'Analiticas',
    Inventory: 'Inventario',
    'Infrastructure Dependency': 'Dependencia de Infraestructura',
    Regulations: 'Regulaciones',
    Connectors: 'Conectores',
    'Control Mappings': 'Mapeo de Controles',
    'Policy Tasks': 'Tareas de Politica',
    'Trust Center': 'Centro de Confianza',
    Jobs: 'Trabajos',
    Settings: 'Configuracion',
    Save: 'Guardar',
    'Save mappings': 'Guardar mapeos',
    'Saving...': 'Guardando...',
    Loading: 'Cargando',
    'Loading control library...': 'Cargando biblioteca de controles...',
    'Loading crosswalks...': 'Cargando equivalencias...',
    Retry: 'Reintentar',
    Language: 'Idioma',
    English: 'Ingles',
    Spanish: 'Espanol',
    French: 'Frances',
    Help: 'Ayuda',
    Close: 'Cerrar',
    'Refresh failed: {message}': 'Actualizacion fallida: {message}',
    'UI language. Example: English, Espanol, Francais.': 'Idioma de la interfaz. Ejemplo: Ingles, Espanol, Frances.',
    'Report language code. Example: en, fr, es.': 'Codigo de idioma del informe. Ejemplo: en, fr, es.',
    'nav.dashboard': 'Panel',
    'nav.connectors': 'Conectores',
    'nav.evidence': 'Evidencia',
    'nav.frameworks': 'Marcos',
    'nav.risks': 'Riesgos',
    'nav.policies': 'Políticas',
    'nav.exceptions': 'Excepciones',
    'nav.remediation': 'Remediación',
    'nav.incidents': 'Incidentes',
    'nav.third_parties': 'Terceros',
    'nav.dr': 'Recuperación ante desastres',
    'nav.apps': 'Aplicaciones',
    'nav.sites': 'Sitios',
    'nav.audit': 'Auditoría',
    'nav.settings': 'Configuración',
    'nav.support': 'Paquete de soporte',
    'nav.logout': 'Cerrar sesión',
    'login.title': 'Iniciar sesión en Attestiv',
    'login.email_label': 'Correo electrónico',
    'login.password_label': 'Contraseña',
    'login.submit_button': 'Iniciar sesión',
    'frameworks.title': 'Marcos',
    'frameworks.generate_report': 'Generar informe',
    'frameworks.subscribed_badge': 'Suscrito',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.loading': 'Cargando...',
    'language.switcher_label': 'Idioma',
  },
  fr: {
    'Management Console': 'Console de Gestion',
    Snapshot: 'Instantane',
    'Refresh snapshot': "Rafraichir l'instantane",
    'Refreshing...': 'Rafraichissement...',
    'Snapshot refreshed.': 'Instantane rafraichi.',
    Reports: 'Rapports',
    'Auditor Portal': "Portail d'Audit",
    Executive: 'Executif',
    Dashboard: 'Tableau de Bord',
    'Executive Brief': 'Resume Executif',
    'Executive View': 'Vue Executive',
    'Board Readout': 'Lecture du Conseil',
    'Policy Engine': 'Moteur de Politique',
    Ingestion: 'Ingestion',
    Health: 'Sante',
    Evidence: 'Preuves',
    'Evidence Templates': 'Modeles de Preuve',
    Exceptions: 'Exceptions',
    Analytics: 'Analyses',
    Inventory: 'Inventaire',
    'Infrastructure Dependency': "Dependance d'Infrastructure",
    Regulations: 'Reglementations',
    Connectors: 'Connecteurs',
    'Control Mappings': 'Cartographie des Controles',
    'Policy Tasks': 'Taches de Politique',
    'Trust Center': 'Centre de Confiance',
    Jobs: 'Taches',
    Settings: 'Parametres',
    Save: 'Enregistrer',
    'Save mappings': 'Enregistrer les mappings',
    'Saving...': 'Enregistrement...',
    Loading: 'Chargement',
    'Loading control library...': 'Chargement de la bibliotheque de controles...',
    'Loading crosswalks...': 'Chargement des correspondances...',
    Retry: 'Reessayer',
    Language: 'Langue',
    English: 'Anglais',
    Spanish: 'Espagnol',
    French: 'Francais',
    Help: 'Aide',
    Close: 'Fermer',
    'Refresh failed: {message}': 'Echec du rafraichissement: {message}',
    'UI language. Example: English, Espanol, Francais.': "Langue de l'interface. Exemple : Anglais, Espagnol, Francais.",
    'Report language code. Example: en, fr, es.': 'Code langue du rapport. Exemple : en, fr, es.',
    'nav.dashboard': 'Tableau de bord',
    'nav.connectors': 'Connecteurs',
    'nav.evidence': 'Preuves',
    'nav.frameworks': 'Référentiels',
    'nav.risks': 'Risques',
    'nav.policies': 'Politiques',
    'nav.exceptions': 'Exceptions',
    'nav.remediation': 'Remédiation',
    'nav.incidents': 'Incidents',
    'nav.third_parties': 'Tiers',
    'nav.dr': 'Reprise après sinistre',
    'nav.apps': 'Applications',
    'nav.sites': 'Sites',
    'nav.audit': 'Audit',
    'nav.settings': 'Paramètres',
    'nav.support': 'Paquet de support',
    'nav.logout': 'Se déconnecter',
    'login.title': 'Connexion à Attestiv',
    'login.email_label': 'Adresse e-mail',
    'login.password_label': 'Mot de passe',
    'login.submit_button': 'Se connecter',
    'frameworks.title': 'Référentiels',
    'frameworks.generate_report': 'Générer le rapport',
    'frameworks.subscribed_badge': 'Abonné',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.loading': 'Chargement...',
    'language.switcher_label': 'Langue',
  },
  de: {
    'Management Console': 'Verwaltungskonsole',
    Snapshot: 'Momentaufnahme',
    'Refresh snapshot': 'Momentaufnahme aktualisieren',
    'Refreshing...': 'Wird aktualisiert...',
    'Snapshot refreshed.': 'Momentaufnahme aktualisiert.',
    Reports: 'Berichte',
    'Auditor Portal': 'Prüferportal',
    Executive: 'Vorstand',
    Dashboard: 'Dashboard',
    'Executive Brief': 'Management-Briefing',
    'Executive View': 'Management-Ansicht',
    'Board Readout': 'Vorstandsbericht',
    'Policy Engine': 'Richtlinien-Engine',
    Ingestion: 'Aufnahme',
    Health: 'Status',
    Evidence: 'Evidenz',
    'Evidence Templates': 'Evidenzvorlagen',
    Exceptions: 'Ausnahmen',
    Analytics: 'Analytik',
    Inventory: 'Bestand',
    'Infrastructure Dependency': 'Infrastruktur-Abhängigkeit',
    Regulations: 'Vorschriften',
    Connectors: 'Konnektoren',
    'Control Mappings': 'Kontroll-Zuordnungen',
    'Policy Tasks': 'Richtlinien-Aufgaben',
    'Trust Center': 'Trust Center',
    Jobs: 'Aufgaben',
    Settings: 'Einstellungen',
    Save: 'Speichern',
    'Save mappings': 'Zuordnungen speichern',
    'Saving...': 'Wird gespeichert...',
    Loading: 'Wird geladen',
    'Loading control library...': 'Kontrollbibliothek wird geladen...',
    'Loading crosswalks...': 'Querverweise werden geladen...',
    Retry: 'Erneut versuchen',
    Language: 'Sprache',
    English: 'Englisch',
    Spanish: 'Spanisch',
    French: 'Französisch',
    Help: 'Hilfe',
    Close: 'Schließen',
    'Refresh failed: {message}': 'Aktualisierung fehlgeschlagen: {message}',
    'UI language. Example: English, Espanol, Francais.': 'Sprache der Oberfläche. Beispiel: Englisch, Spanisch, Französisch.',
    'Report language code. Example: en, fr, es.': 'Sprachcode des Berichts. Beispiel: en, fr, es, de.',
    'nav.dashboard': 'Dashboard',
    'nav.connectors': 'Konnektoren',
    'nav.evidence': 'Evidenz',
    'nav.frameworks': 'Rahmenwerke',
    'nav.risks': 'Risiken',
    'nav.policies': 'Richtlinien',
    'nav.exceptions': 'Ausnahmen',
    'nav.remediation': 'Remediation',
    'nav.incidents': 'Vorfälle',
    'nav.third_parties': 'Dritte',
    'nav.dr': 'Notfallwiederherstellung',
    'nav.apps': 'Anwendungen',
    'nav.sites': 'Standorte',
    'nav.audit': 'Audit',
    'nav.settings': 'Einstellungen',
    'nav.support': 'Support-Paket',
    'nav.logout': 'Abmelden',
    'login.title': 'Bei Attestiv anmelden',
    'login.email_label': 'E-Mail',
    'login.password_label': 'Passwort',
    'login.submit_button': 'Anmelden',
    'frameworks.title': 'Rahmenwerke',
    'frameworks.generate_report': 'Bericht erzeugen',
    'frameworks.subscribed_badge': 'Abonniert',
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.loading': 'Wird geladen...',
    'language.switcher_label': 'Sprache',
  },
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => undefined,
  t: (key: string) => key,
})

function formatMessage(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key]
    return value === undefined ? match : String(value)
  })
}

function buildTranslator(language: Language): Translator {
  const primary = TRANSLATIONS[language] || {}
  const fallback = TRANSLATIONS.en || {}
  return (key, vars) => {
    const value = primary[key] ?? fallback[key] ?? key
    return formatMessage(value, vars)
  }
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>(defaultSettings().language)

  useEffect(() => {
    const persisted = loadSettings().language
    setLanguage(persisted)
    // Make sure the cookie reflects the persisted choice even on
    // first mount — the backend uses it for the next PDF/Markdown
    // request and we don't want to send a stale tag.
    syncLanguageCookie(persisted)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const t = buildTranslator(language)
    const setLanguageValue = (next: Language) => {
      setLanguage(next)
      saveSettings({ ...loadSettings(), language: next })
      syncLanguageCookie(next)
    }
    return { language, setLanguage: setLanguageValue, t }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
