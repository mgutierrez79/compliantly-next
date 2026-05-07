import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { defaultSettings, loadSettings, saveSettings } from './settings'

export type Language = 'en' | 'es' | 'fr'

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
    setLanguage(loadSettings().language)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const t = buildTranslator(language)
    const setLanguageValue = (next: Language) => {
      setLanguage(next)
      saveSettings({ ...loadSettings(), language: next })
    }
    return { language, setLanguage: setLanguageValue, t }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
