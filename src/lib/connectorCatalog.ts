// Connector catalog client. The backend at /v1/config/connectors
// publishes the authoritative list of every connector it knows
// about, including which authentication fields each one supports.
// The wizard used to hardcode this list — and drifted, so PAN-OS
// only showed an API key field even though the underlying Go
// connector also accepts username + password.
//
// This module is the single source of truth on the frontend. The
// wizard reads from it; future surfaces (settings page, debug
// panel) can read from it too without re-fetching.

import { apiFetch } from './api'

export type ConnectorCatalogEntry = {
  // Lowercased identifier. Same as the URL path under
  // /v1/config/connectors/{name} and the value persisted in
  // connector_sources.
  name: string
  label: string
  category: string
  summary?: string
  collector_type?: string
  delivery_mode?: string
  poll_interval_seconds?: number
  outputs?: string[]
  // Auth is the load-bearing field for the wizard: the list of
  // credential keys the backend knows how to read for this
  // connector. The wizard renders one input per entry. Two-method
  // connectors (Palo Alto's api_key + username/password) get all
  // three fields with hint copy explaining the either/or.
  auth?: string[]
  capabilities?: string[]
}

type CatalogResponse = {
  available?: string[]
  enabled?: string[]
  configured?: string[]
  frameworks?: unknown
  catalog?: ConnectorCatalogEntry[]
  // Tolerant of either casing the server might use; prefer .catalog
  // but fall back to .connectors if the legacy shape is in flight.
  connectors?: ConnectorCatalogEntry[]
}

let cachedCatalog: ConnectorCatalogEntry[] | null = null
let cachedAt = 0
const CATALOG_CACHE_MS = 30_000

// loadConnectorCatalog fetches the catalog and caches it briefly.
// 30-second cache is short enough that an admin who just edited a
// connector definition sees the change after one full wizard click,
// long enough that the per-step re-renders inside the wizard share
// one fetch.
export async function loadConnectorCatalog(): Promise<ConnectorCatalogEntry[]> {
  const now = Date.now()
  if (cachedCatalog && now - cachedAt < CATALOG_CACHE_MS) {
    return cachedCatalog
  }
  try {
    const response = await apiFetch('/config/connectors')
    if (!response.ok) {
      cachedCatalog = []
      cachedAt = now
      return []
    }
    const body: CatalogResponse = await response.json()
    const list = (body.catalog ?? body.connectors ?? []).filter(
      (entry): entry is ConnectorCatalogEntry => typeof entry?.name === 'string',
    )
    cachedCatalog = list
    cachedAt = now
    return list
  } catch {
    cachedCatalog = []
    cachedAt = now
    return []
  }
}

// authFieldsFor returns the catalog-declared auth keys for the
// given wizard kind. The wizard's `kind` strings (palo_alto_panorama,
// vmware_vcenter, etc.) don't always match catalog `name` strings
// (palo_alto, vcenter, etc.) — we map them with a small alias table
// rather than asking the backend to add per-instance entries.
const KIND_TO_CATALOG_NAME: Record<string, string> = {
  palo_alto_panorama: 'palo_alto',
  palo_alto_firewall: 'palo_alto',
  vmware_vcenter: 'vcenter',
  veeam_em: 'veeam_enterprise_manager',
  dell_powerstore: 'powerstore',
}

export function authFieldsFor(kind: string, catalog: ConnectorCatalogEntry[]): string[] {
  const canonical = KIND_TO_CATALOG_NAME[kind] ?? kind
  const entry = catalog.find((c) => c.name === canonical)
  return entry?.auth ?? []
}
