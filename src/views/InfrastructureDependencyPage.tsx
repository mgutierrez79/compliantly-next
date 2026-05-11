'use client';
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { formatTimestamp } from '../lib/time'
import { Button, Card, ErrorBox, Input, Label, PageTitle } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type ReplicationVolumeStatus = {
  id?: string | null
  name?: string | null
  status?: string | null
  hosts?: string[]
  host_groups?: string[]
}

type ReplicationVolumeGroupStatus = {
  id?: string | null
  name?: string | null
  status?: string | null
  replication_mode?: string | null
  replication_role?: string | null
  volumes?: ReplicationVolumeStatus[]
}

type VmLastBackupStatus = {
  name?: string | null
  status?: string | null
  last_success?: string | null
  job_name?: string | null
  last_recovery?: string | null
  last_recovery_status?: string | null
  last_recovery_type?: string | null
}

type PowerStoreVmStatus = {
  id?: string | null
  name?: string | null
  replication_state?: string | null
  volume_count?: number
  derived_from_source?: string | null
  replication_volumes?: { id?: string | null; name?: string | null; status?: string | null; state?: string | null }[]
}

type ConnectorStatus = {
  name: string
  replication_volumes?: ReplicationVolumeStatus[]
  replication_volume_groups?: ReplicationVolumeGroupStatus[]
  vm_last_backups?: VmLastBackupStatus[]
  storage_vms?: PowerStoreVmStatus[]
}

type ConnectorsResponse = { connectors: ConnectorStatus[] }

type SnapshotReplicationVolume = {
  id?: string | null
  name?: string | null
  status?: string | null
  state?: string | null
  source?: string | null
}

type SnapshotVmReplication = {
  state?: string | null
  sources?: string[]
  volumes?: SnapshotReplicationVolume[]
}

type SnapshotBackup = {
  last_success?: string | null
  last_success_at?: string | null
  status?: string | null
  job_name?: string | null
  jobName?: string | null
  source?: string | null
}

type SnapshotAsset = {
  source?: string | null
  asset_type?: string | null
  asset_id?: string | null
  name?: string | null
  metadata?: {
    host_id?: string | null
    host?: string | null
    datastores?: string[] | null
    hardware?: {
      datastores?: string[] | null
    } | null
    resilience?: {
      replication?: SnapshotVmReplication | null
      backup?: SnapshotBackup | null
    } | null
  } | null
}

type SnapshotRecoveryJob = {
  job_id?: string | null
  job_type?: string | null
  status?: string | null
  asset_id?: string | null
  started_at?: string | null
  ended_at?: string | null
  source?: string | null
  metadata?: Record<string, unknown> | null
}

type ConnectorSnapshotResponse = {
  snapshot?: {
    assets?: SnapshotAsset[] | null
    recovery_jobs?: SnapshotRecoveryJob[] | null
  } | null
}

type DependencyMapResponse = ConnectorsResponse & { snapshot?: ConnectorSnapshotResponse['snapshot'] | null }

type VmNode = {
  key: string
  name: string
  hostId: string
  datastores: string[]
  replicationState: string
  replicationSources: string[]
  replicationVolumes: SnapshotReplicationVolume[]
  backupState: string
  backupEvidence: VmBackupEvidence[]
}

type HostNode = {
  id: string
  name: string
  vms: VmNode[]
}

type StorageVolumeNode = {
  key: string
  id?: string | null
  name?: string | null
  status: string
  groupName: string
  replicationRole?: string | null
  mappedVms: VmNode[]
}

type StorageConnectorNode = {
  name: string
  volumeGroups: string[]
  volumes: StorageVolumeNode[]
  unmappedVms: VmNode[]
}

type BackupConnectorNode = {
  name: string
  entries: VmLastBackupStatus[]
}

type VmBackupEvidence = {
  source: string
  status: string
  jobName: string
  lastSuccess: string
  signature: string
}

type LayerTree = {
  networkConnectors: ConnectorStatus[]
  networkAssets: SnapshotAsset[]
  hosts: HostNode[]
  vms: VmNode[]
  storageConnectors: StorageConnectorNode[]
  backupConnectors: BackupConnectorNode[]
}

function normalizeLookup(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase()
}

function hasEvidenceValue(value?: string | null): boolean {
  const normalized = normalizeLookup(value)
  return Boolean(normalized && !['unknown', 'n/a', 'na', 'none', '-'].includes(normalized))
}

function hasReplicationEvidence(vm: VmNode, mappedVolumeCount: number): boolean {
  if (mappedVolumeCount > 0) return true
  if (vm.replicationVolumes.some((volume) => hasEvidenceValue(volume.id) || hasEvidenceValue(volume.name))) return true
  return Boolean(vm.replicationSources.length && hasEvidenceValue(vm.replicationState))
}

function hasBackupEvidence(backup: { status: string; jobName: string; lastSuccess: string }): boolean {
  return hasEvidenceValue(backup.jobName) || hasEvidenceValue(backup.lastSuccess) || hasEvidenceValue(backup.status)
}

function canonicalVolumeName(value?: string | null): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const hasReplicationPrefix = raw.includes('REPLIC_')
  const hasTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(raw)
  if (!hasReplicationPrefix && !hasTimestamp) return normalizeLookup(raw)
  const parts = raw
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  const cleaned = parts.filter((part) => {
    if (part.startsWith('REPLIC_')) return false
    if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(part)) return false
    if (/^\d+$/.test(part)) return false
    return true
  })
  const selected = cleaned.length ? cleaned[cleaned.length - 1] : raw
  return normalizeLookup(selected)
}

function stateRank(value?: string | null): number {
  const normalized = normalizeLookup(value).replace(/[\s-]+/g, '_')
  if (['error', 'failed', 'critical', 'down', 'fault', 'not_replicated', 'missing', 'disabled', 'unprotected'].includes(normalized))
    return 0
  if (['degraded', 'warning', 'warn', 'partial', 'lagging', 'syncing', 'paused'].includes(normalized)) return 1
  if (['ok', 'healthy', 'enabled', 'active', 'running', 'success', 'succeeded', 'up', 'normal', 'in_sync', 'sync'].includes(normalized))
    return 2
  return 3
}

function stateBadgeClass(value?: string | null): string {
  const rank = stateRank(value)
  if (rank === 0) return 'bg-rose-900/60 text-rose-200 border-rose-700/70'
  if (rank === 1) return 'bg-amber-900/60 text-amber-200 border-amber-700/70'
  if (rank === 2) return 'bg-emerald-900/60 text-emerald-200 border-emerald-700/70'
  return 'bg-slate-800/70 text-slate-200 border-slate-700'
}

function bestState(values: Array<string | null | undefined>, fallback = 'unknown'): string {
  let selected = fallback
  let selectedRank = stateRank(fallback)
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (!text) continue
    const rank = stateRank(text)
    if (rank < selectedRank) {
      selected = text
      selectedRank = rank
    }
  }
  return selected
}

function vmAliases(name: string): string[] {
  const normalized = normalizeLookup(name)
  if (!normalized) return []
  const short = normalized.split('.')[0]
  const compact = normalized.replace(/[^a-z0-9]/g, '')
  return Array.from(new Set([normalized, short, compact, short.replace(/[^a-z0-9]/g, '')].filter(Boolean)))
}

function matchVolume(vmVolume: SnapshotReplicationVolume, volumeById: Map<string, StorageVolumeNode>, volumeByName: Map<string, StorageVolumeNode>) {
  const idKey = normalizeLookup(vmVolume.id)
  const nameKey = normalizeLookup(vmVolume.name)
  const canonicalKey = canonicalVolumeName(vmVolume.name)
  return (idKey && volumeById.get(idKey)) || (nameKey && volumeByName.get(nameKey)) || (canonicalKey && volumeByName.get(canonicalKey))
}

function normalizeReplicationRole(value?: string | null): 'source' | 'destination' | 'unknown' {
  const text = normalizeLookup(value)
  if (text.includes('source') || text.includes('primary') || text.includes('local')) return 'source'
  if (text.includes('destination') || text.includes('target') || text.includes('secondary') || text.includes('remote'))
    return 'destination'
  return 'unknown'
}

function toTimestamp(value?: string | null): number {
  const raw = String(value ?? '').trim()
  if (!raw) return Number.NEGATIVE_INFINITY

  const direct = Date.parse(raw)
  if (Number.isFinite(direct)) return direct

  const normalized = Date.parse(raw.replace(/\//g, '-').replace(' ', 'T'))
  if (Number.isFinite(normalized)) return normalized

  const ymd = raw.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (ymd) {
    const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0'] = ymd
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)
    const second = Number(secondText)
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      Number.isFinite(second)
    ) {
      const localDate = new Date(year, Math.max(month - 1, 0), day, hour, minute, second)
      const localMs = localDate.getTime()
      if (Number.isFinite(localMs)) return localMs
    }
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (dmy) {
    const [, dayText, monthText, yearText, hourText = '0', minuteText = '0', secondText = '0'] = dmy
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)
    const second = Number(secondText)
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      Number.isFinite(second)
    ) {
      const localDate = new Date(year, Math.max(month - 1, 0), day, hour, minute, second)
      const localMs = localDate.getTime()
      if (Number.isFinite(localMs)) return localMs
    }
  }

  return Number.NEGATIVE_INFINITY
}

function displayTimestamp(value?: string | null): string {
  const raw = String(value ?? '').trim()
  if (!raw) return 'n/a'
  const ts = toTimestamp(raw)
  if (!Number.isFinite(ts)) return raw
  return formatTimestamp(new Date(ts).toISOString())
}

function ageLabel(value?: string | null): string {
  const ts = toTimestamp(value)
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - ts) / (60 * 1000)))
  if (deltaMinutes < 60) return `${deltaMinutes}m`
  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 48) return `${deltaHours}h`
  const deltaDays = Math.floor(deltaHours / 24)
  return `${deltaDays}d`
}

function isNetworkConnector(name: string): boolean {
  const lower = normalizeLookup(name)
  return (
    lower.startsWith('palo_alto') ||
    lower.startsWith('dnac') ||
    lower.startsWith('restconf') ||
    lower.startsWith('netconf') ||
    lower.startsWith('forti') ||
    lower.startsWith('cisco_')
  )
}

function isNetworkAsset(asset: SnapshotAsset): boolean {
  const source = normalizeLookup(asset.source)
  const type = normalizeLookup(asset.asset_type)
  if (isNetworkConnector(source)) return true
  return ['firewall', 'network_device', 'switch', 'router', 'gateway', 'load_balancer'].includes(type)
}

function isTruthyMetadataFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.trim().toLowerCase())
  return false
}

function isOperationalVmAsset(asset: SnapshotAsset): boolean {
  const rawName = String(asset.name ?? asset.asset_id ?? '').trim().toLowerCase()
  if (rawName) {
    if (rawName.startsWith('snapshot de vm')) return false
    if (rawName.startsWith('snapshot-')) return false
    if (rawName.startsWith('vm snapshot')) return false
    if (rawName.startsWith('modele_') || rawName.startsWith('modele ')) return false
    if (rawName.startsWith('model_') || rawName.startsWith('model ')) return false
    if (` ${rawName} `.includes(' template ')) return false
  }

  const metadata = (asset.metadata ?? {}) as Record<string, unknown>
  const boolFlags = ['is_snapshot', 'snapshot', 'is_template', 'template', 'is_clone', 'linked_clone']
  for (const key of boolFlags) {
    if (isTruthyMetadataFlag(metadata[key])) return false
  }

  const typeFields = ['type', 'vm_type', 'entity_type', 'object_type', 'resource_type', 'kind', 'category']
  for (const key of typeFields) {
    const value = String(metadata[key] ?? '')
      .trim()
      .toLowerCase()
    if (!value) continue
    if (value.includes('snapshot') || value.includes('template') || value.includes('golden_image') || value.includes('golden-image'))
      return false
  }

  return true
}

function normalizeConnectorKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function vmReplicationEvidence(vm: PowerStoreVmStatus | undefined): number {
  if (!vm) return 0
  const volumes = vm.replication_volumes ?? []
  const state = String(vm.replication_state ?? '').trim().toLowerCase()
  const hasState = Boolean(state && state !== 'unknown' && state !== 'null' && state !== 'n/a')
  return volumes.length + (hasState ? 1 : 0)
}

function connectorEvidenceScore(connector: ConnectorStatus | undefined): number {
  if (!connector) return 0
  const directVolumes = connector.replication_volumes ?? []
  const groupedVolumes = (connector.replication_volume_groups ?? []).reduce(
    (sum, group) => sum + (group.volumes ?? []).length,
    0,
  )
  const vmEvidence = (connector.storage_vms ?? []).reduce((sum, vm) => sum + vmReplicationEvidence(vm), 0)
  const backupEvidence = (connector.vm_last_backups ?? []).length
  return directVolumes.length + groupedVolumes + vmEvidence + backupEvidence
}

function mergeStorageVms(
  previousVms: PowerStoreVmStatus[] | undefined,
  incomingVms: PowerStoreVmStatus[] | undefined,
): PowerStoreVmStatus[] {
  const previous = previousVms ?? []
  const incoming = incomingVms ?? []
  if (!incoming.length) return previous

  const token = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase()
  const stateRank = (value: string | null | undefined) => {
    const normalized = token(value)
    if (!normalized || normalized === 'unknown' || normalized === 'null' || normalized === 'n/a') return 3
    if (['error', 'failed', 'critical', 'down', 'fault'].includes(normalized)) return 0
    if (['degraded', 'warning', 'warn', 'partial', 'lagging', 'syncing', 'paused'].includes(normalized)) return 1
    return 2
  }
  const mergeVolumes = (
    left: { id?: string | null; name?: string | null; status?: string | null; state?: string | null }[] | undefined,
    right: { id?: string | null; name?: string | null; status?: string | null; state?: string | null }[] | undefined,
  ) => {
    const merged: { id?: string | null; name?: string | null; status?: string | null; state?: string | null }[] = []
    const seen = new Set<string>()
    for (const volume of [...(left ?? []), ...(right ?? [])]) {
      const idKey = token(volume.id)
      const nameKey = token(volume.name)
      const signature = `${idKey}|${nameKey}`
      if ((!idKey && !nameKey) || seen.has(signature)) continue
      seen.add(signature)
      merged.push(volume)
    }
    return merged
  }
  const mergeVm = (base: PowerStoreVmStatus, next: PowerStoreVmStatus): PowerStoreVmStatus => {
    const baseState = String(base.replication_state ?? '').trim()
    const nextState = String(next.replication_state ?? '').trim()
    const resolvedState = stateRank(nextState) < stateRank(baseState) ? nextState : baseState
    const baseVolumeCount = Number.isFinite(Number(base.volume_count)) ? Math.max(0, Math.trunc(Number(base.volume_count))) : 0
    const nextVolumeCount = Number.isFinite(Number(next.volume_count)) ? Math.max(0, Math.trunc(Number(next.volume_count))) : 0
    const mergedVolumes = mergeVolumes(base.replication_volumes, next.replication_volumes)
    return {
      ...base,
      ...next,
      replication_state: resolvedState || next.replication_state || base.replication_state,
      replication_volumes: mergedVolumes,
      volume_count: Math.max(baseVolumeCount, nextVolumeCount, mergedVolumes.length),
      derived_from_source: next.derived_from_source ?? base.derived_from_source,
    }
  }
  const consolidateIncoming = (items: PowerStoreVmStatus[]): PowerStoreVmStatus[] => {
    const rows: PowerStoreVmStatus[] = []
    const byId = new Map<string, number>()
    const byName = new Map<string, number>()
    for (const vm of items) {
      const idKey = token(vm.id)
      const nameKey = token(vm.name)
      let idx = idKey ? byId.get(idKey) : undefined
      if (idx === undefined && nameKey) {
        const idxByName = byName.get(nameKey)
        if (idxByName !== undefined) {
          const existingId = token(rows[idxByName]?.id)
          if (!(existingId && idKey && existingId !== idKey)) idx = idxByName
        }
      }
      if (idx === undefined) {
        rows.push(vm)
        idx = rows.length - 1
      } else {
        rows[idx] = mergeVm(rows[idx], vm)
      }
      const resolved = rows[idx]
      const resolvedId = token(resolved.id) || idKey
      const resolvedName = token(resolved.name) || nameKey
      if (resolvedId) byId.set(resolvedId, idx)
      if (resolvedName) byName.set(resolvedName, idx)
    }
    return rows
  }
  const consolidatedIncoming = consolidateIncoming(incoming)
  if (!previous.length) return consolidatedIncoming
  const previousById = new Map<string, PowerStoreVmStatus>()
  const previousByName = new Map<string, PowerStoreVmStatus>()
  for (const vm of previous) {
    const idKey = token(vm.id)
    const nameKey = token(vm.name)
    if (idKey) previousById.set(idKey, vm)
    if (nameKey) previousByName.set(nameKey, vm)
  }

  const merged: PowerStoreVmStatus[] = []
  for (const vm of consolidatedIncoming) {
    const idKey = token(vm.id)
    const nameKey = token(vm.name)
    const prevById = idKey ? previousById.get(idKey) : undefined
    let prevByName = nameKey ? previousByName.get(nameKey) : undefined
    if (prevByName && idKey) {
      const prevByNameId = token(prevByName.id)
      if (prevByNameId && prevByNameId !== idKey) prevByName = undefined
    }
    const prev = prevById || prevByName
    const incomingVolumes = vm.replication_volumes ?? []
    const previousVolumes = prev?.replication_volumes ?? []
    const mergedVolumes = mergeVolumes(previousVolumes, incomingVolumes)
    const incomingState = String(vm.replication_state ?? '').trim()
    const previousState = String(prev?.replication_state ?? '').trim()
    const resolvedState = stateRank(incomingState) < stateRank(previousState) ? incomingState : previousState
    const incomingVolumeCountRaw = Number(vm.volume_count ?? 0)
    const previousVolumeCountRaw = Number(prev?.volume_count ?? 0)
    const incomingVolumeCount = Number.isFinite(incomingVolumeCountRaw)
      ? Math.max(0, Math.trunc(incomingVolumeCountRaw))
      : 0
    const previousVolumeCount = Number.isFinite(previousVolumeCountRaw)
      ? Math.max(0, Math.trunc(previousVolumeCountRaw))
      : 0
    merged.push({
      ...prev,
      ...vm,
      replication_state: resolvedState || vm.replication_state || prev?.replication_state,
      replication_volumes: mergedVolumes,
      volume_count: Math.max(incomingVolumeCount, previousVolumeCount, mergedVolumes.length),
      derived_from_source: vm.derived_from_source ?? prev?.derived_from_source,
    })
  }
  return merged
}

function mergeConnectorStatusesStable(
  previousStatuses: ConnectorStatus[] | null,
  incomingStatuses: ConnectorStatus[],
): ConnectorStatus[] {
  if (!incomingStatuses.length) return previousStatuses ?? []
  if (!previousStatuses?.length) return incomingStatuses

  const previousByKey = new Map<string, ConnectorStatus>()
  for (const status of previousStatuses) {
    const key = normalizeConnectorKey(status.name)
    if (key) previousByKey.set(key, status)
  }

  const merged: ConnectorStatus[] = []
  const seen = new Set<string>()
  for (const incoming of incomingStatuses) {
    const key = normalizeConnectorKey(incoming.name)
    const previous = key ? previousByKey.get(key) : undefined
    if (!previous) {
      merged.push(incoming)
      if (key) seen.add(key)
      continue
    }

    const incomingScore = connectorEvidenceScore(incoming)
    const previousScore = connectorEvidenceScore(previous)
    if (incomingScore === 0 && previousScore > 0) {
      merged.push(previous)
      if (key) seen.add(key)
      continue
    }

    merged.push({
      ...previous,
      ...incoming,
      replication_volumes:
        (incoming.replication_volumes ?? []).length ? incoming.replication_volumes : previous.replication_volumes,
      replication_volume_groups:
        (incoming.replication_volume_groups ?? []).length
          ? incoming.replication_volume_groups
          : previous.replication_volume_groups,
      vm_last_backups: (incoming.vm_last_backups ?? []).length ? incoming.vm_last_backups : previous.vm_last_backups,
      storage_vms: mergeStorageVms(previous.storage_vms, incoming.storage_vms),
    })
    if (key) seen.add(key)
  }

  for (const previous of previousStatuses) {
    const key = normalizeConnectorKey(previous.name)
    if (key && seen.has(key)) continue
    merged.push(previous)
  }
  return merged
}

export function InfrastructureDependencyPage() {
  const {
    t
  } = useI18n();

  const CONNECTOR_STATUS_CACHE_KEY = 'dependency_map_connector_status_cache_v1'
  const [connectors, setConnectors] = useState<ConnectorStatus[] | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(CONNECTOR_STATUS_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as ConnectorStatus[]
      return Array.isArray(parsed) && parsed.length ? parsed : null
    } catch {
      return null
    }
  })
  const [snapshot, setSnapshot] = useState<ConnectorSnapshotResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [filter, setFilter] = useState('')
  const loadInFlightRef = useRef(false)

  const load = async () => {
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const connectorResponse = await apiJson<DependencyMapResponse>('/connectors/dependency-map')
      setConnectors((previous) => {
        const merged = mergeConnectorStatusesStable(previous, connectorResponse.connectors || [])
        if (merged.length && typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(CONNECTOR_STATUS_CACHE_KEY, JSON.stringify(merged))
          } catch {
            // ignore storage limits
          }
        }
        return merged
      })
      setSnapshot({ snapshot: connectorResponse.snapshot ?? { assets: [], recovery_jobs: [] } })
    } catch (err) {
      setError(err as ApiError)
    } finally {
      loadInFlightRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const boot = async () => {
      await load()
      if (!active) return
    }
    void boot()
    const onSnapshotRefreshed = () => {
      void load()
    }
    window.addEventListener('connectors:snapshot-refreshed', onSnapshotRefreshed)
    return () => {
      active = false
      window.removeEventListener('connectors:snapshot-refreshed', onSnapshotRefreshed)
    }
  }, [])

  const layerTree = useMemo<LayerTree>(() => {
    const connectorList = connectors ?? []
    const assets = snapshot?.snapshot?.assets ?? []

    const networkConnectors = connectorList.filter((connector) => isNetworkConnector(connector.name))
    const networkAssets = assets.filter((asset) => isNetworkAsset(asset))

    const hostAssets = assets.filter(
      (asset) => normalizeLookup(asset.source).startsWith('vcenter') && normalizeLookup(asset.asset_type) === 'host',
    )
    const vmAssets = assets.filter(
      (asset) =>
        normalizeLookup(asset.source).startsWith('vcenter') &&
        normalizeLookup(asset.asset_type) === 'vm' &&
        isOperationalVmAsset(asset),
    )

    const hostNameById = new Map<string, string>()
    for (const host of hostAssets) {
      const id = normalizeLookup(host.asset_id)
      const name = String(host.name ?? host.asset_id ?? 'host').trim()
      if (!id) continue
      hostNameById.set(id, name)
    }

    const backupByAlias = new Map<string, string>()
    const backupConnectors: BackupConnectorNode[] = []
    for (const connector of connectorList) {
      const entries = connector.vm_last_backups ?? []
      if (!entries.length) continue
      backupConnectors.push({ name: connector.name, entries })
      for (const entry of entries) {
        const name = String(entry.name ?? '').trim()
        if (!name) continue
        const status = String(entry.status ?? 'unknown').trim() || 'unknown'
        for (const alias of vmAliases(name)) {
          const existing = backupByAlias.get(alias)
          backupByAlias.set(alias, bestState([existing, status]))
        }
      }
    }

    const vmMap = new Map<string, VmNode>()
    const vmAliasToKey = new Map<string, string>()
    const mergeDatastores = (current: string[], incoming: string[]) => {
      const seen = new Set(current.map((value) => normalizeLookup(value)))
      const merged = [...current]
      for (const value of incoming) {
        const normalized = normalizeLookup(value)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        merged.push(value)
      }
      return merged
    }
    const resolveVmKey = (name: string, id?: string | null): string => {
      for (const alias of vmAliases(name)) {
        const existing = vmAliasToKey.get(alias)
        if (existing) return existing
      }
      return vmAliases(name)[0] || normalizeLookup(id) || normalizeLookup(name) || name
    }
    const registerVmAliases = (key: string, name: string) => {
      for (const alias of vmAliases(name)) {
        if (!alias) continue
        if (!vmAliasToKey.has(alias)) vmAliasToKey.set(alias, key)
      }
    }
    const mergeBackupEvidence = (existingRows: VmBackupEvidence[], incomingRows: VmBackupEvidence[]) => {
      const seen = new Set(existingRows.map((row) => row.signature))
      const merged = [...existingRows]
      for (const row of incomingRows) {
        if (!row.signature || seen.has(row.signature)) continue
        seen.add(row.signature)
        merged.push(row)
      }
      return merged
    }

    for (const asset of vmAssets) {
      const name = String(asset.name ?? asset.asset_id ?? '').trim()
      if (!name) continue
      const key = resolveVmKey(name, asset.asset_id)
      const metadata = asset.metadata ?? {}
      const hostId = normalizeLookup(metadata.host_id ?? metadata.host)
      const replication = metadata.resilience?.replication ?? null
      const datastores = [
        ...((metadata.datastores ?? []) as string[]),
        ...((metadata.hardware?.datastores ?? []) as string[]),
      ]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
      const backupState = vmAliases(name)
        .map((alias) => backupByAlias.get(alias))
        .find(Boolean)
      const backupMetadata = metadata.resilience?.backup ?? null
      const backupEvidence: VmBackupEvidence[] = []
      if (backupMetadata) {
        const backupStatus = String(backupMetadata.status ?? '').trim() || 'unknown'
        const backupLastSuccess = String(backupMetadata.last_success ?? backupMetadata.last_success_at ?? '').trim()
        const backupJobName = String(backupMetadata.job_name ?? backupMetadata.jobName ?? '').trim()
        const backupSource = String(backupMetadata.source ?? asset.source ?? '').trim() || 'snapshot'
        if (backupStatus || backupLastSuccess || backupJobName || backupSource) {
          backupEvidence.push({
            source: backupSource,
            status: backupStatus,
            jobName: backupJobName,
            lastSuccess: backupLastSuccess,
            signature: `${backupSource}|${name}|${backupStatus}|${backupJobName}|${backupLastSuccess}`,
          })
        }
      }

      const incoming: VmNode = {
        key,
        name,
        hostId,
        datastores,
        replicationState: String(replication?.state ?? 'unknown').trim() || 'unknown',
        replicationSources: (replication?.sources ?? []).map((value) => String(value ?? '').trim()).filter(Boolean),
        replicationVolumes: (replication?.volumes ?? []).map((volume) => ({
          id: volume.id ?? null,
          name: volume.name ?? null,
          status: (volume as { status?: string | null }).status ?? null,
          state: (volume as { state?: string | null }).state ?? null,
          source: (volume as { source?: string | null }).source ?? null,
        })),
        backupState: backupState || 'unknown',
        backupEvidence,
      }

      const existing = vmMap.get(key)
      if (!existing) {
        vmMap.set(key, incoming)
        registerVmAliases(key, incoming.name)
      } else {
        existing.replicationState = bestState([existing.replicationState, incoming.replicationState], existing.replicationState)
        existing.backupState = bestState([existing.backupState, incoming.backupState], existing.backupState)
        existing.datastores = mergeDatastores(existing.datastores, incoming.datastores)
        existing.replicationSources = Array.from(new Set([...existing.replicationSources, ...incoming.replicationSources]))
        if (!existing.hostId && incoming.hostId) existing.hostId = incoming.hostId
        existing.backupEvidence = mergeBackupEvidence(existing.backupEvidence, incoming.backupEvidence)
        const seen = new Set(existing.replicationVolumes.map((item) => `${normalizeLookup(item.id)}|${normalizeLookup(item.name)}`))
        for (const volume of incoming.replicationVolumes) {
          const signature = `${normalizeLookup(volume.id)}|${normalizeLookup(volume.name)}`
          if (seen.has(signature)) continue
          seen.add(signature)
          existing.replicationVolumes.push(volume)
        }
        registerVmAliases(key, existing.name || incoming.name)
      }
    }

    for (const connector of connectorList.filter((item) => normalizeLookup(item.name).startsWith('powerstore:'))) {
      for (const entry of connector.storage_vms ?? []) {
        const name = String(entry.name ?? entry.id ?? '').trim()
        if (!name) continue
        const key = resolveVmKey(name, entry.id)
        const entryVolumes = (entry.replication_volumes ?? []).reduce<SnapshotReplicationVolume[]>((acc, volume) => {
          const id = String(volume.id ?? '').trim()
          const volumeName = String(volume.name ?? '').trim()
          if (!id && !volumeName) return acc
          acc.push({
            id: id || null,
            name: volumeName || null,
            status: String(volume.status ?? volume.state ?? '').trim() || null,
            state: String(volume.state ?? volume.status ?? '').trim() || null,
            source: connector.name,
          })
          return acc
        }, [])
        const existing = vmMap.get(key)
        const backupState = vmAliases(name)
          .map((alias) => backupByAlias.get(alias))
          .find(Boolean)
        if (!existing) {
          vmMap.set(key, {
            key,
            name,
            hostId: '',
            datastores: [],
            replicationState: String(entry.replication_state ?? 'unknown').trim() || 'unknown',
            replicationSources: [connector.name],
            replicationVolumes: entryVolumes,
            backupState: backupState || 'unknown',
            backupEvidence: [],
          })
          registerVmAliases(key, name)
        } else {
          existing.replicationState = bestState([existing.replicationState, entry.replication_state], existing.replicationState)
          existing.backupState = bestState([existing.backupState, backupState], existing.backupState)
          existing.replicationSources = Array.from(new Set([...existing.replicationSources, connector.name]))
          const seen = new Set(existing.replicationVolumes.map((item) => `${normalizeLookup(item.id)}|${normalizeLookup(item.name)}`))
          for (const volume of entryVolumes) {
            const signature = `${normalizeLookup(volume.id)}|${normalizeLookup(volume.name)}`
            if (seen.has(signature)) continue
            seen.add(signature)
            existing.replicationVolumes.push(volume)
          }
          registerVmAliases(key, existing.name || name)
        }
      }
    }

    for (const connector of backupConnectors) {
      for (const entry of connector.entries) {
        const name = String(entry.name ?? '').trim()
        if (!name) continue
        const status = String(entry.status ?? 'unknown').trim() || 'unknown'
        const jobName = String(entry.job_name ?? '').trim()
        const lastSuccess = String(entry.last_success ?? '').trim()
        if (!hasBackupEvidence({ status, jobName, lastSuccess })) continue
        const key = resolveVmKey(name)
        const backupEvidence: VmBackupEvidence = {
          source: connector.name,
          status,
          jobName,
          lastSuccess,
          signature: `${connector.name}|${name}|${status}|${jobName}|${lastSuccess}`,
        }
        const existing = vmMap.get(key)
        if (!existing) {
          vmMap.set(key, {
            key,
            name,
            hostId: '',
            datastores: [],
            replicationState: 'unknown',
            replicationSources: [],
            replicationVolumes: [],
            backupState: status,
            backupEvidence: [backupEvidence],
          })
          registerVmAliases(key, name)
        } else {
          existing.backupState = bestState([existing.backupState, status], existing.backupState)
          existing.backupEvidence = mergeBackupEvidence(existing.backupEvidence, [backupEvidence])
          registerVmAliases(key, existing.name || name)
        }
      }
    }

    const vms = Array.from(vmMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    const hostBuckets = new Map<string, HostNode>()
    for (const vm of vms) {
      const bucketId = vm.hostId || 'unassigned'
      const hostName = vm.hostId ? hostNameById.get(vm.hostId) || vm.hostId : 'Unassigned host'
      const existing = hostBuckets.get(bucketId)
      if (!existing) {
        hostBuckets.set(bucketId, { id: bucketId, name: hostName, vms: [vm] })
      } else {
        existing.vms.push(vm)
      }
    }
    const hosts = Array.from(hostBuckets.values())
      .map((host) => ({ ...host, vms: host.vms.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const storageConnectors: StorageConnectorNode[] = []
    const powerstoreConnectors = connectorList.filter((connector) => normalizeLookup(connector.name).startsWith('powerstore:'))
    for (const connector of powerstoreConnectors) {
      const connectorName = String(connector.name ?? '').trim()
      const volumeByKey = new Map<string, StorageVolumeNode>()
      const volumeById = new Map<string, StorageVolumeNode>()
      const volumeByName = new Map<string, StorageVolumeNode>()
      const groups = new Set<string>()

      const addVolume = (volume: ReplicationVolumeStatus, groupName: string, replicationRole?: string | null) => {
        const id = String(volume.id ?? '').trim() || undefined
        const name = String(volume.name ?? '').trim() || undefined
        const key = id || name || `${groupName}:unknown:${volumeByKey.size + 1}`
        const existing = volumeByKey.get(key)
        if (existing) {
          existing.status = bestState([existing.status, volume.status], existing.status)
          existing.replicationRole = normalizeReplicationRole(existing.replicationRole) === 'unknown' ? replicationRole : existing.replicationRole
          return existing
        }
        const created: StorageVolumeNode = {
          key,
          id,
          name,
          status: String(volume.status ?? 'unknown').trim() || 'unknown',
          groupName,
          replicationRole: replicationRole ?? null,
          mappedVms: [],
        }
        volumeByKey.set(key, created)
        if (id) volumeById.set(normalizeLookup(id), created)
        if (name) {
          const nameKey = normalizeLookup(name)
          if (nameKey) volumeByName.set(nameKey, created)
          const canonical = canonicalVolumeName(name)
          if (canonical) volumeByName.set(canonical, created)
        }
        return created
      }

      for (const group of connector.replication_volume_groups ?? []) {
        const groupName = String(group.name ?? group.id ?? 'Ungrouped').trim() || 'Ungrouped'
        const groupRole = String(group.replication_role ?? '').trim() || null
        groups.add(groupName)
        for (const volume of group.volumes ?? []) addVolume(volume, groupName, groupRole)
      }
      for (const volume of connector.replication_volumes ?? []) addVolume(volume, 'Ungrouped', null)

      const storageVmAliases = new Set<string>()
      for (const entry of connector.storage_vms ?? []) {
        const name = String(entry.name ?? entry.id ?? '').trim()
        if (!name) continue
        for (const alias of vmAliases(name)) storageVmAliases.add(alias)
      }

      const unmappedVms: VmNode[] = []
      for (const vm of vms) {
        const belongsToConnector =
          vm.replicationSources.includes(connectorName) ||
          vmAliases(vm.name).some((alias) => storageVmAliases.has(alias))
        if (!belongsToConnector) continue

        const candidates = vm.replicationVolumes.length
          ? vm.replicationVolumes
          : vm.datastores.map((datastore) => ({ name: datastore }))

        let mapped = false
        for (const candidate of candidates) {
          const matchedVolume = matchVolume(candidate, volumeById, volumeByName)
          if (!matchedVolume) continue
          mapped = true
          if (!matchedVolume.mappedVms.some((item) => item.key === vm.key)) {
            matchedVolume.mappedVms.push(vm)
          }
        }
        if (!mapped) unmappedVms.push(vm)
      }

      const volumes = Array.from(volumeByKey.values())
        .map((volume) => ({ ...volume, mappedVms: volume.mappedVms.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => String(a.name ?? a.id ?? a.key).localeCompare(String(b.name ?? b.id ?? b.key)))

      const volumeGroups = Array.from(new Set(volumes.map((volume) => volume.groupName).concat(Array.from(groups)))).sort((a, b) =>
        a.localeCompare(b),
      )

      storageConnectors.push({
        name: connectorName,
        volumeGroups,
        volumes,
        unmappedVms: unmappedVms.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }

    storageConnectors.sort((a, b) => a.name.localeCompare(b.name))
    backupConnectors.sort((a, b) => a.name.localeCompare(b.name))

    return {
      networkConnectors,
      networkAssets,
      hosts,
      vms,
      storageConnectors,
      backupConnectors,
    }
  }, [connectors, snapshot])

  const filtered = useMemo(() => {
    const query = normalizeLookup(filter)
    if (!query) return layerTree
    const match = (value: string) => normalizeLookup(value).includes(query)

    const networkConnectors = layerTree.networkConnectors.filter((connector) => match(connector.name))
    const networkAssets = layerTree.networkAssets.filter((asset) =>
      match(`${asset.name ?? ''} ${asset.asset_id ?? ''} ${asset.asset_type ?? ''} ${asset.source ?? ''}`),
    )

    const hosts = layerTree.hosts
      .map((host) => {
        const hostMatch = match(`${host.name} ${host.id}`)
        const vms = host.vms.filter((vm) => match(`${vm.name} ${vm.replicationState} ${vm.backupState} ${vm.datastores.join(' ')}`))
        if (hostMatch || vms.length) return { ...host, vms: hostMatch ? host.vms : vms }
        return null
      })
      .filter((value): value is HostNode => Boolean(value))

    const vms = hosts.flatMap((host) => host.vms)

    const storageConnectors = layerTree.storageConnectors
      .map((connector) => {
        const connectorMatch = match(connector.name)
        const volumes = connector.volumes
          .map((volume) => {
            const volumeMatch = match(`${volume.name ?? ''} ${volume.id ?? ''} ${volume.status} ${volume.groupName}`)
            const mappedVms = volume.mappedVms.filter((vm) => match(`${vm.name} ${vm.replicationState} ${vm.backupState}`))
            if (connectorMatch || volumeMatch || mappedVms.length) {
              return {
                ...volume,
                mappedVms: connectorMatch || volumeMatch ? volume.mappedVms : mappedVms,
              }
            }
            return null
          })
          .filter((value): value is StorageVolumeNode => Boolean(value))
        const unmappedVms = connector.unmappedVms.filter((vm) => match(`${vm.name} ${vm.replicationState} ${vm.backupState}`))
        if (connectorMatch || volumes.length || unmappedVms.length) {
          return {
            ...connector,
            volumes,
            unmappedVms: connectorMatch ? connector.unmappedVms : unmappedVms,
          }
        }
        return null
      })
      .filter((value): value is StorageConnectorNode => Boolean(value))

    const backupConnectors = layerTree.backupConnectors
      .map((connector) => {
        const connectorMatch = match(connector.name)
        const entries = connector.entries.filter((entry) => match(`${entry.name ?? ''} ${entry.status ?? ''} ${entry.job_name ?? ''}`))
        if (connectorMatch || entries.length) {
          return {
            ...connector,
            entries: connectorMatch ? connector.entries : entries,
          }
        }
        return null
      })
      .filter((value): value is BackupConnectorNode => Boolean(value))

    return {
      networkConnectors,
      networkAssets,
      hosts,
      vms,
      storageConnectors,
      backupConnectors,
    }
  }, [filter, layerTree])

  const vmVisualRows = useMemo(() => {
    const hostNameByVmKey = new Map<string, string>()
    for (const host of filtered.hosts) {
      for (const vm of host.vms) hostNameByVmKey.set(vm.key, host.name)
    }

    const storageByVmKey = new Map<
      string,
      { connector: string; group: string; volume: string; status: string; role: 'source' | 'destination' | 'unknown' }[]
    >()
    const storageSeenByVmKey = new Map<string, Set<string>>()
    const unmappedByVmKey = new Map<string, Set<string>>()
    const addStorageMapping = (
      vmKey: string,
      mapping: { connector: string; group: string; volume: string; status: string; role: 'source' | 'destination' | 'unknown' },
    ) => {
      const signature = `${mapping.connector}|${mapping.volume}|${mapping.role}`
      const seen = storageSeenByVmKey.get(vmKey) ?? new Set<string>()
      if (seen.has(signature)) return
      seen.add(signature)
      storageSeenByVmKey.set(vmKey, seen)
      const rows = storageByVmKey.get(vmKey) ?? []
      rows.push(mapping)
      storageByVmKey.set(vmKey, rows)
    }
    for (const connector of filtered.storageConnectors) {
      for (const volume of connector.volumes) {
        const volumeLabel = String(volume.name ?? volume.id ?? 'volume').trim()
        const groupLabel = String(volume.groupName ?? 'Ungrouped').trim() || 'Ungrouped'
        const role = normalizeReplicationRole(volume.replicationRole)
        for (const vm of volume.mappedVms) {
          addStorageMapping(vm.key, {
            connector: connector.name,
            group: groupLabel,
            volume: volumeLabel,
            status: String(volume.status ?? 'unknown').trim() || 'unknown',
            role,
          })
        }
      }
      for (const vm of connector.unmappedVms) {
        const names = unmappedByVmKey.get(vm.key) ?? new Set<string>()
        names.add(connector.name)
        unmappedByVmKey.set(vm.key, names)
      }
    }
    for (const vm of filtered.vms) {
      for (const volume of vm.replicationVolumes) {
        const volumeLabel = String(volume.name ?? volume.id ?? '').trim()
        const connectorName = String(volume.source ?? '').trim()
        if (!volumeLabel || !connectorName) continue
        addStorageMapping(vm.key, {
          connector: connectorName,
          group: 'Snapshot evidence',
          volume: volumeLabel,
          status: String(volume.status ?? volume.state ?? vm.replicationState ?? 'unknown').trim() || 'unknown',
          role: 'unknown',
        })
      }
    }

    const backupByAlias = new Map<
      string,
      {
        connector: string
        status: string
        jobName: string
        lastSuccess: string
        lastRecovery: string
        lastRecoveryStatus: string
        lastRecoveryType: string
        signature: string
      }[]
    >()
    for (const connector of filtered.backupConnectors) {
      for (const entry of connector.entries) {
        const name = String(entry.name ?? '').trim()
        if (!name) continue
        const status = String(entry.status ?? 'unknown').trim() || 'unknown'
        const jobName = String(entry.job_name ?? '').trim()
        const lastSuccess = String(entry.last_success ?? '').trim()
        const lastRecovery = String(entry.last_recovery ?? '').trim()
        const lastRecoveryStatus = String(entry.last_recovery_status ?? '').trim()
        const lastRecoveryType = String(entry.last_recovery_type ?? '').trim()
        const signature = `${connector.name}|${name}|${status}|${jobName}|${lastSuccess}|${lastRecovery}`
        for (const alias of vmAliases(name)) {
          const rows = backupByAlias.get(alias) ?? []
          if (!rows.some((row) => row.signature === signature)) {
            rows.push({
              connector: connector.name,
              status,
              jobName,
              lastSuccess,
              lastRecovery,
              lastRecoveryStatus,
              lastRecoveryType,
              signature,
            })
            backupByAlias.set(alias, rows)
          }
        }
      }
    }

    const recoveryByToken = new Map<
      string,
      { source: string; status: string; jobType: string; timestamp: string; timestampValue: number; signature: string }[]
    >()
    const recoveryJobs = snapshot?.snapshot?.recovery_jobs ?? []
    for (const job of recoveryJobs) {
      if (!job || typeof job !== 'object') continue
      const metadata = job.metadata && typeof job.metadata === 'object' ? (job.metadata as Record<string, unknown>) : {}
      const status = String(job.status ?? 'unknown').trim() || 'unknown'
      const jobType = String(job.job_type ?? '').trim()
      const timestamp = String(job.ended_at ?? job.started_at ?? '').trim()
      const timestampValue = toTimestamp(timestamp)
      const source = String(job.source ?? '').trim()
      const signature = `${job.job_id ?? ''}|${source}|${status}|${jobType}|${timestamp}`
      const candidates = new Set<string>()
      const pushCandidate = (value: unknown) => {
        const text = String(value ?? '').trim()
        if (text) candidates.add(text)
      }
      pushCandidate(job.asset_id)
      pushCandidate(metadata.vm_name)
      pushCandidate(metadata.vmName)
      pushCandidate(metadata.name)
      pushCandidate(metadata.asset_name)
      pushCandidate(metadata.assetName)
      pushCandidate(metadata.virtual_machine_name)
      pushCandidate(metadata.virtualMachineName)
      pushCandidate(metadata.vm_id)
      pushCandidate(metadata.asset_id)
      for (const candidate of candidates) {
        const token = normalizeLookup(candidate)
        if (!token) continue
        const rows = recoveryByToken.get(token) ?? []
        if (!rows.some((item) => item.signature === signature)) {
          rows.push({ source, status, jobType, timestamp, timestampValue, signature })
          recoveryByToken.set(token, rows)
        }
      }
    }

    return filtered.vms
      .map((vm) => {
        const backups: {
          connector: string
          status: string
          jobName: string
          lastSuccess: string
          lastRecovery: string
          lastRecoveryStatus: string
          lastRecoveryType: string
          signature: string
        }[] = []
        const seenBackup = new Set<string>()
        for (const row of vm.backupEvidence ?? []) {
          if (seenBackup.has(row.signature)) continue
          seenBackup.add(row.signature)
          backups.push({
            connector: row.source || 'snapshot',
            status: row.status || 'unknown',
            jobName: row.jobName || '',
            lastSuccess: row.lastSuccess || '',
            lastRecovery: '',
            lastRecoveryStatus: '',
            lastRecoveryType: '',
            signature: row.signature,
          })
        }
        for (const alias of vmAliases(vm.name)) {
          for (const row of backupByAlias.get(alias) ?? []) {
            if (seenBackup.has(row.signature)) continue
            seenBackup.add(row.signature)
            backups.push({
              connector: row.connector,
              status: row.status,
              jobName: row.jobName,
              lastSuccess: row.lastSuccess,
              lastRecovery: row.lastRecovery,
              lastRecoveryStatus: row.lastRecoveryStatus,
              lastRecoveryType: row.lastRecoveryType,
              signature: row.signature,
            })
          }
        }

        const recoveryRows: { source: string; status: string; jobType: string; timestamp: string; timestampValue: number }[] = []
        const seenRecovery = new Set<string>()
        for (const row of backups) {
          if (!row.lastRecovery) continue
          const signature = `backup-entry|${row.signature}|${row.lastRecovery}`
          if (seenRecovery.has(signature)) continue
          seenRecovery.add(signature)
          recoveryRows.push({
            source: row.connector,
            status: row.lastRecoveryStatus || 'unknown',
            jobType: row.lastRecoveryType || 'restore',
            timestamp: row.lastRecovery,
            timestampValue: toTimestamp(row.lastRecovery),
          })
        }
        const recoveryTokens = new Set<string>([normalizeLookup(vm.key), normalizeLookup(vm.name), ...vmAliases(vm.name)])
        for (const token of recoveryTokens) {
          for (const item of recoveryByToken.get(token) ?? []) {
            if (seenRecovery.has(item.signature)) continue
            seenRecovery.add(item.signature)
            recoveryRows.push({
              source: item.source,
              status: item.status,
              jobType: item.jobType,
              timestamp: item.timestamp,
              timestampValue: item.timestampValue,
            })
          }
        }
        const orderedMappings = (storageByVmKey.get(vm.key) ?? []).sort((a, b) =>
          `${a.connector}:${a.group}:${a.volume}`.localeCompare(`${b.connector}:${b.group}:${b.volume}`),
        )
        const backupsWithEvidence = backups.filter(hasBackupEvidence)
        if (!hasReplicationEvidence(vm, orderedMappings.length) && !backupsWithEvidence.length) return null

        recoveryRows.sort((a, b) => b.timestampValue - a.timestampValue)
        const latestRecovery = recoveryRows[0]
        const latestBackupRows = backupsWithEvidence.length ? backupsWithEvidence : backups
        const latestBackup = latestBackupRows.reduce<(typeof backups)[number] | null>((latest, current) => {
          const candidate = current.lastSuccess || null
          if (!candidate) return latest
          if (!latest?.lastSuccess) return current
          const candidateTs = toTimestamp(candidate)
          const latestTs = toTimestamp(latest.lastSuccess)
          if (Number.isFinite(candidateTs) && Number.isFinite(latestTs)) return candidateTs > latestTs ? current : latest
          if (Number.isFinite(candidateTs)) return current
          if (Number.isFinite(latestTs)) return latest
          return candidate.localeCompare(latest.lastSuccess) > 0 ? current : latest
        }, null)
        const latestBackupAt = latestBackup?.lastSuccess || null
        const latestBackupPlan = latestBackup?.jobName || 'n/a'
        const backupStatus = latestBackupRows.length
          ? bestState(
              latestBackupRows.map((item) => item.status),
              vm.backupState || 'unknown',
            )
          : vm.backupState || 'unknown'
        const sourceMappings = orderedMappings.filter((mapping) => mapping.role === 'source')
        const destinationMappings = orderedMappings.filter((mapping) => mapping.role === 'destination')
        const unknownMappings = orderedMappings.filter((mapping) => mapping.role === 'unknown')

        return {
          vm,
          hostName: hostNameByVmKey.get(vm.key) || 'Unassigned host',
          sourceMappings,
          destinationMappings,
          unknownMappings,
          unmappedStorageConnectors: Array.from(unmappedByVmKey.get(vm.key) ?? []).sort((a, b) => a.localeCompare(b)),
          backups: backups
            .sort((a, b) => `${a.connector}:${a.jobName}`.localeCompare(`${b.connector}:${b.jobName}`))
            .map(({ connector, status, jobName, lastSuccess }) => ({ connector, status, jobName, lastSuccess })),
          backupStatus,
          latestBackupPlan,
          latestBackupAt,
          latestBackupAge: ageLabel(latestBackupAt),
          latestRecoveryAt: latestRecovery?.timestamp || null,
          latestRecoveryAge: ageLabel(latestRecovery?.timestamp || null),
          latestRecoveryStatus: latestRecovery?.status || 'n/a',
          latestRecoverySource: latestRecovery?.source || 'n/a',
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.vm.name.localeCompare(b.vm.name))
  }, [filtered, snapshot])

  const summary = useMemo(() => {
    const storageVolumes = filtered.storageConnectors.reduce((acc, connector) => acc + connector.volumes.length, 0)
    const mappedLinks = vmVisualRows.reduce(
      (acc, row) => acc + row.sourceMappings.length + row.destinationMappings.length + row.unknownMappings.length,
      0,
    )
    const backupEntries = vmVisualRows.reduce((acc, row) => acc + row.backups.length, 0)
    return {
      networkNodes: filtered.networkAssets.length,
      networkConnectors: filtered.networkConnectors.length,
      hosts: new Set(vmVisualRows.map((row) => row.hostName)).size,
      vms: vmVisualRows.length,
      storageVolumes,
      mappedLinks,
      backupEntries,
    }
  }, [filtered, vmVisualRows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>{t('Infrastructure Visual Mapping', 'Infrastructure Visual Mapping')}</PageTitle>
        <Button onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh graph'}
        </Button>
      </div>
      {error ? <ErrorBox title={t('Dependency tree error', 'Dependency tree error')} detail={error.message} /> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,10rem))]">
          <div>
            <Label>{t('Filter', 'Filter')}</Label>
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t(
                'Filter layers, connectors, hosts, VMs, volumes, backups...',
                'Filter layers, connectors, hosts, VMs, volumes, backups...'
              )}
            />
          </div>
          <div className="rounded-lg border border-[#29446c] bg-[#0b1729] p-3">
            <Label>{t('Network', 'Network')}</Label>
            <div className="mt-1 text-lg font-semibold text-slate-100">{summary.networkNodes}</div>
            <div className="text-[11px] text-slate-400">{summary.networkConnectors} connectors</div>
          </div>
          <div className="rounded-lg border border-[#29446c] bg-[#0b1729] p-3">
            <Label>{t('Computing', 'Computing')}</Label>
            <div className="mt-1 text-lg font-semibold text-slate-100">{summary.vms}</div>
            <div className="text-[11px] text-slate-400">{summary.hosts} hosts</div>
          </div>
          <div className="rounded-lg border border-[#29446c] bg-[#0b1729] p-3">
            <Label>{t('Storage', 'Storage')}</Label>
            <div className="mt-1 text-lg font-semibold text-slate-100">{summary.storageVolumes}</div>
            <div className="text-[11px] text-slate-400">{summary.mappedLinks} {t('VM links', 'VM links')}</div>
          </div>
          <div className="rounded-lg border border-[#29446c] bg-[#0b1729] p-3">
            <Label>{t('Backup', 'Backup')}</Label>
            <div className="mt-1 text-lg font-semibold text-slate-100">{summary.backupEntries}</div>
            <div className="text-[11px] text-slate-400">{t('VM backup entries', 'VM backup entries')}</div>
          </div>
        </div>
      </Card>
      <Card>
        <div className="text-xs uppercase tracking-wide text-slate-300">{t('Fast Recovery Flow', 'Fast Recovery Flow')}</div>
        <div className="mt-1 text-xs text-slate-400">VM {'->'} {t('Volume + Storage Source', 'Volume + Storage Source')} {'->'} {t('Replication Status', 'Replication Status')} {'->'} {t('Volume + Storage Destination', 'Volume + Storage Destination')}
        </div>
        <div className="mt-2 rounded border border-[#29446c] bg-[#0b1729] p-2 text-xs text-slate-200">
          <span className="font-semibold text-slate-100">{t('Network context:', 'Network context:')}</span>{' '}
          {filtered.networkConnectors.map((connector) => connector.name).join(', ') || 'none'} ({filtered.networkAssets.length}{' '}
          assets)
        </div>
        <div className="mt-3 space-y-3">
          {!vmVisualRows.length ? (
            <div className="rounded border border-[#29446c] bg-[#0b1729] p-3 text-sm text-slate-300">
              {t(
                'No VM has replicated-volume or backup evidence in the current data set.',
                'No VM has replicated-volume or backup evidence in the current data set.'
              )}
            </div>
          ) : null}
          {vmVisualRows.map(row => {
            const {
              t
            } = useI18n();

            return (
              <div key={`fast-${row.vm.key}`} className="rounded border border-[#29446c] bg-[#0b1729] p-3">
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.6fr)_auto_minmax(0,0.9fr)_auto_minmax(0,1.6fr)]">
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">VM</div>
                    <div className="mt-1 text-sm font-semibold text-slate-100">{row.vm.name}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{t('Host:', 'Host:')} {row.hostName}</div>
                  </div>
                  <div className="self-center text-center text-slate-500">{'->'}</div>
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('Volume + Storage Source', 'Volume + Storage Source')}</div>
                    {row.sourceMappings.length ? (
                      <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                        {row.sourceMappings.slice(0, 6).map((mapping, index) => (
                          <li key={`src-${row.vm.key}-${index}`}>
                            <span className={`rounded border px-1.5 py-0.5 ${stateBadgeClass(mapping.status)}`}>{mapping.status}</span>{' '}
                            {mapping.volume} @ {mapping.connector}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-500">{t('No explicit source volume mapping.', 'No explicit source volume mapping.')}</div>
                    )}
                  </div>
                  <div className="self-center text-center text-slate-500">{'->'}</div>
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('Replication Status', 'Replication Status')}</div>
                    <div className="mt-1">
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${stateBadgeClass(row.vm.replicationState)}`}>
                        {row.vm.replicationState}
                      </span>
                    </div>
                    {row.vm.replicationSources.length ? (
                      <div className="mt-1 text-[11px] text-slate-400">{t('Sources:', 'Sources:')} {row.vm.replicationSources.join(', ')}</div>
                    ) : null}
                  </div>
                  <div className="self-center text-center text-slate-500">{'->'}</div>
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                      {t('Volume + Storage Destination', 'Volume + Storage Destination')}
                    </div>
                    {row.destinationMappings.length ? (
                      <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                        {row.destinationMappings.slice(0, 6).map((mapping, index) => (
                          <li key={`dst-${row.vm.key}-${index}`}>
                            <span className={`rounded border px-1.5 py-0.5 ${stateBadgeClass(mapping.status)}`}>{mapping.status}</span>{' '}
                            {mapping.volume} @ {mapping.connector}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-500">{t(
                        'No explicit destination volume mapping.',
                        'No explicit destination volume mapping.'
                      )}</div>
                    )}
                  </div>
                </div>
                {row.unknownMappings.length ? (
                  <div className="mt-2 text-[11px] text-slate-400">
                    {t('Unknown role mappings:', 'Unknown role mappings:')}{' '}
                    {row.unknownMappings
                      .slice(0, 6)
                      .map((mapping) => `${mapping.volume} @ ${mapping.connector}`)
                      .join(' | ')}
                  </div>
                ) : null}
                {row.unmappedStorageConnectors.length ? (
                  <div className="mt-1 text-[11px] text-amber-300">{t('Unmapped in:', 'Unmapped in:')} {row.unmappedStorageConnectors.join(', ')}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <div className="text-xs uppercase tracking-wide text-slate-300">{t('Backup And Recovery Flow', 'Backup And Recovery Flow')}</div>
        <div className="mt-1 text-xs text-slate-400">VM {'->'} {t('Backup Status + Last Backup Age', 'Backup Status + Last Backup Age')} {'->'} {t('Last Recovery', 'Last Recovery')}
        </div>
        <div className="mt-3 space-y-3">
          {!vmVisualRows.length ? (
            <div className="rounded border border-[#29446c] bg-[#0b1729] p-3 text-sm text-slate-300">
              {t(
                'No VM has replicated-volume or backup evidence in the current data set.',
                'No VM has replicated-volume or backup evidence in the current data set.'
              )}
            </div>
          ) : null}
          {vmVisualRows.map(row => {
            const {
              t
            } = useI18n();

            return (
              <div key={`backup-${row.vm.key}`} className="rounded border border-[#29446c] bg-[#0b1729] p-3">
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.6fr)_auto_minmax(0,1.6fr)]">
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">VM</div>
                    <div className="mt-1 text-sm font-semibold text-slate-100">{row.vm.name}</div>
                  </div>
                  <div className="self-center text-center text-slate-500">{'->'}</div>
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('Backup', 'Backup')}</div>
                    <div className="mt-1">
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${stateBadgeClass(row.backupStatus)}`}>
                        {row.backupStatus}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{t('Last backup age:', 'Last backup age:')} {row.latestBackupAge}</div>
                    <div className="text-[11px] text-slate-400">
                      {t('Last backup:', 'Last backup:')} {displayTimestamp(row.latestBackupAt)}
                    </div>
                    <div className="text-[11px] text-slate-400">{t('Backup plan:', 'Backup plan:')} {row.latestBackupPlan}</div>
                  </div>
                  <div className="self-center text-center text-slate-500">{'->'}</div>
                  <div className="rounded border border-[#203b5f] bg-[#0a1628] p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('Last Recovery', 'Last Recovery')}</div>
                    <div className="mt-1">
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${stateBadgeClass(row.latestRecoveryStatus)}`}>
                        {row.latestRecoveryStatus}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{t('Age:', 'Age:')} {row.latestRecoveryAge}</div>
                    <div className="text-[11px] text-slate-400">
                      {t('Timestamp:', 'Timestamp:')} {displayTimestamp(row.latestRecoveryAt)}
                    </div>
                    <div className="text-[11px] text-slate-400">{t('Source:', 'Source:')} {row.latestRecoverySource}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {!loading && !filtered.vms.length && !filtered.storageConnectors.length && !filtered.backupConnectors.length ? (
        <Card>
          <div className="text-sm text-slate-300">{t(
            'No dependency records found for current connectors/snapshot.',
            'No dependency records found for current connectors/snapshot.'
          )}</div>
        </Card>
      ) : null}
    </div>
  );
}
