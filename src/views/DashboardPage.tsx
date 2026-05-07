'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { formatTimestamp } from '../lib/time'
import { Button, Card, ErrorBox, HelpTip, Label, PageTitle } from '../components/Ui'
import { getResilienceRuleHelp } from '../data/resilienceRuleHelp'

type RunItem = {
  run_id: string
  timestamp?: string
  risk_score?: number
  overall_risk?: string
}

type RunsResponse = { items: RunItem[]; count: number }

type ScoreHistoryItem = {
  run_id: string
  timestamp: string
  risk_score: number
  overall_risk?: string
}

type ScoreHistoryResponse = { items: ScoreHistoryItem[] }

type FrameworkListResponse = string[]

type DashboardFrameworkScore = {
  score?: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  controls_summary?: {
    compliant?: number
    partially_compliant?: number
    non_compliant?: number
    unknown?: number
    total?: number
  }
}

type DashboardSummaryResponse = {
  run_count: number
  latest_run?: RunItem | null
  score_history: ScoreHistoryItem[]
  frameworks: string[]
  framework_scores?: Record<string, DashboardFrameworkScore>
  framework_trend?: Record<string, FrameworkPoint[]>
  risk_drivers?: RiskDriverSummary | null
  cached_metrics?: {
    frameworks_cached?: number
    operational_cached?: number
    frameworks?: string[]
    operational?: string[]
    last_updated?: string | null
  }
  connector_health?: { ok: number; warn: number; error: number; unknown: number }
  connector_sources?: string[]
  connector_sla?: Record<string, Record<string, unknown>>
  finding_count?: number
  top_findings?: {
    asset_id?: string | null
    asset_label?: string | null
    type?: string | null
    severity?: string | null
    title?: string | null
    event_timestamp?: string | null
  }[]
  generated_at?: string | null
  cache_key?: string | null
}

type RiskDriverSource = {
  source: string
  count: number
  max_severity?: string | null
}

type RiskDriverSummary = {
  total_findings: number
  by_severity: Record<string, number>
  top_sources: RiskDriverSource[]
  other_sources?: number
}

type ReplicationRemoteSystemStatus = {
  id?: string | null
  name?: string | null
  replication_modes?: string[]
  status?: string | null
}

type ReplicationVolumeStatus = {
  id?: string | null
  name?: string | null
  status?: string | null
  hosts?: string[]
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
  last_success?: string | null
  job_name?: string | null
  status?: string | null
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
  remote_systems?: ReplicationRemoteSystemStatus[]
  replication_volumes?: ReplicationVolumeStatus[]
  replication_volume_groups?: ReplicationVolumeGroupStatus[]
  vm_last_backups?: VmLastBackupStatus[]
  storage_vms?: PowerStoreVmStatus[]
}

type ConnectorsResponse = { connectors: ConnectorStatus[] }
type ResilienceBackup = {
  last_success?: string | null
  status?: string | null
  job_name?: string | null
  source?: string | null
}
type ResilienceReplication = {
  state?: string | null
  volumes?: { id?: string | null; name?: string | null; status?: string | null; observed_at?: string | null }[]
  sources?: string[]
}
type SnapshotAsset = {
  source?: string | null
  asset_type?: string | null
  name?: string | null
  asset_id?: string | null
  metadata?: {
    vm_id?: string | null
    derived_from_source?: string | null
    derived_from_asset_id?: string | null
    derived_from_name?: string | null
    datastores?: string[] | null
    hardware?: {
      datastores?: string[] | null
    } | null
    resilience?: {
      backup?: ResilienceBackup | null
      replication?: ResilienceReplication | null
    } | null
  } | null
}
type ConnectorSnapshotResponse = {
  snapshot?: {
    assets?: SnapshotAsset[] | null
    resilience_signals?: SnapshotResilienceSignal[] | null
    change_events?: SnapshotChangeEvent[] | null
  } | null
}

type SnapshotResilienceSignal = {
  source?: string | null
  provider?: string | null
  signal_type?: string | null
  event_type?: string | null
  status?: string | null
  severity?: string | null
  observed_at?: string | null
  timestamp?: string | null
  metadata?: Record<string, unknown> | null
}

type SnapshotChangeEvent = {
  source?: string | null
  title?: string | null
  description?: string | null
  timestamp?: string | null
  metadata?: Record<string, unknown> | null
}

type VmResilienceListItem = {
  name: string
  replicationState: string
  source: string
  volumeCount: number
}

type FindingEntry = {
  run_id?: string | null
  asset_id?: string | null
  asset_name?: string | null
  asset_label?: string | null
  type?: string | null
  severity?: string | null
  title?: string | null
  description?: string | null
  event_timestamp?: string | null
  score?: number | null
}

type FindingsResponse = { items: FindingEntry[]; count: number }

type FrameworkPoint = {
  run_id?: string
  timestamp: string
  risk_score?: number
  finding_count?: number
}

type FrameworkTrendResponse = {
  framework: string
  points: FrameworkPoint[]
}

type InfraBenchmarkLayer = {
  layer: string
  passed: number
  total: number
  score_percent: number
}

type InfraBenchmarkConnector = {
  score: number
  failed_rules: number
  total_rules: number
}

type InfraBenchmarkResponse = {
  run_id?: string
  timestamp?: string
  framework?: string | null
  overall_score?: number
  layers?: InfraBenchmarkLayer[]
  per_connector?: Record<string, InfraBenchmarkConnector>
  policy_version?: string | null
}

type ExecKpiPoint = {
  run_id?: string
  timestamp?: string
  risk_score?: number
  finding_count?: number
  asset_count?: number
  infra_score?: number
  connector_health_ratio?: number
  validation_issue_count?: number
  risk_drivers?: RiskDriverSummary | null
}

type ExecKpiResponse = {
  current?: ExecKpiPoint | null
  trend?: ExecKpiPoint[]
}

type ResiliencePlaybookRule = {
  rule_id?: string
  title?: string
  category?: string
  severity?: string
  status?: string
  score_delta?: number
  evidence?: string
}

type ResiliencePlaybookSummary = {
  score?: number
  base_score?: number
  min_score?: number
  max_score?: number
  weight?: number
  controls_weight?: number
  rules?: ResiliencePlaybookRule[]
  findings?: ResiliencePlaybookRule[]
  metrics?: Record<string, number>
  ha_recovery_sequences?: HaRecoverySequenceDetail[]
  per_connector?: Record<string, ResiliencePlaybookSummary>
  policy_version?: string | null
}

type HaRecoverySequenceEvent = {
  timestampRaw: string
  timestampMs: number | null
  eventType: string
  severity: string
  eventId: string
  event: string
  description: string
}

type HaRecoverySequenceDetail = {
  source: string
  cluster: string
  status: string
  severity: string
  incidentDetected: boolean
  recovered: boolean
  lastEventMs: number | null
  lastEventLabel: string
  steps: Record<string, boolean>
  events: HaRecoverySequenceEvent[]
}

type HaRecoverySequenceEventWithSource = HaRecoverySequenceEvent & {
  source: string
  cluster: string
}

const NETWORK_HA_PROVIDER_PREFIXES = [
  'palo_alto:',
  'cisco_dnac:',
  'dnac:',
  'catalyst:',
  'cisco_restconf:',
  'restconf:',
  'cisco_netconf:',
  'netconf:',
]
const NETWORK_HA_RULE_IDS = new Set([
  'dora-res-ha',
  'dora-res-ha-failover-proof',
  'nis2-res-ha-config-full',
  'nis2-res-ha-config-min',
  'nis2-res-ha-failover-proof',
  'iso-res-ha-config-full',
  'iso-res-ha-config-min',
  'iso-res-ha',
  'iso-res-ha-failover-proof',
  'soc2-res-ha-config-full',
  'soc2-res-ha-config-min',
  'soc2-res-ha',
  'soc2-res-ha-failover-proof',
  'gxp-res-ha-config-full',
  'gxp-res-ha-config-min',
  'gxp-res-ha-failover-proof',
])

const RISK_SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info', 'unknown'] as const

const normalizeConnectorKey = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase()
const DASHBOARD_SNAPSHOT_FAST_POLL_MS = 10000
const DASHBOARD_SNAPSHOT_STEADY_POLL_MS = 30000
const DASHBOARD_SNAPSHOT_FAST_BOOT_DURATION_MS = 30000
const DASHBOARD_SNAPSHOT_FAST_REFRESH_DURATION_MS = 60000
const DEFAULT_HISTORY_LIMIT = 12
const HISTORY_OPTIONS = [5, 10, 12, 25, 50]
const HISTORY_STORAGE_KEY = 'dashboard_history_limit_v1'
const CONNECTOR_STATUS_CACHE_KEY = 'dashboard_connector_status_cache_v1'
const CONNECTOR_FORCE_REFRESH_TS_KEY = 'dashboard_connector_force_refresh_ts_v1'
const CONNECTOR_FORCE_REFRESH_INTERVAL_MS = 2 * 60 * 1000

const vmReplicationEvidence = (vm: PowerStoreVmStatus | undefined) => {
  if (!vm) return 0
  const volumes = vm.replication_volumes ?? []
  const state = String(vm.replication_state ?? '').trim().toLowerCase()
  const hasState = Boolean(state && state !== 'unknown' && state !== 'null' && state !== 'n/a')
  return volumes.length + (hasState ? 1 : 0)
}

const connectorEvidenceScore = (connector: ConnectorStatus | undefined) => {
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

const mergeStorageVms = (
  previousVms: PowerStoreVmStatus[] | undefined,
  incomingVms: PowerStoreVmStatus[] | undefined,
) => {
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

const mergeConnectorStatusesStable = (
  previousStatuses: ConnectorStatus[] | null,
  incomingStatuses: ConnectorStatus[],
): ConnectorStatus[] => {
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
      remote_systems: (incoming.remote_systems ?? []).length ? incoming.remote_systems : previous.remote_systems,
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

type DoraMetricsResponse = {
  run_id?: string
  timestamp?: string
  missing_inputs?: string[]
  policy_version?: string
  deployments: { count: number }
  lead_time_hours: Record<string, number>
  change_failure_rate_percent: number
  restore_time_hours: Record<string, number>
  inputs?: {
    deployment_signals?: number
    change_events?: number
    resilience_signals?: number
    security_events?: number
    recovery_jobs?: number
  }
  per_connector?: Record<
    string,
    {
      deployments: { count: number }
      lead_time_hours: Record<string, number>
      change_failure_rate_percent: number
      restore_time_hours: Record<string, number>
      inputs?: {
        deployment_signals?: number
        change_events?: number
        resilience_signals?: number
        security_events?: number
        recovery_jobs?: number
      }
    }
  >
}

type Nis2Control = {
  status: string
  impact?: string
  evidence?: string
  description?: string
  articles?: string[]
}

type Nis2ControlsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  policy_version?: string
  controls: Record<string, Nis2Control>
  per_connector: Record<string, Record<string, Nis2Control>>
  resilience_playbook?: ResiliencePlaybookSummary
}

type Soc2Control = {
  status: string
  impact?: string
  evidence?: string
  description?: string
  criteria?: string[]
}

type Soc2ControlsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  policy_version?: string
  controls: Record<string, Soc2Control>
  per_connector: Record<string, Record<string, Soc2Control>>
  resilience_playbook?: ResiliencePlaybookSummary
}

type GxpControl = {
  status: string
  impact?: string
  evidence?: string
  description?: string
  references?: string[]
}

type GxpControlsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  policy_version?: string
  controls: Record<string, GxpControl>
  per_connector: Record<string, Record<string, GxpControl>>
  resilience_playbook?: ResiliencePlaybookSummary
}

type GenericControlStatus = { status?: string }

type Nis2OperationalMetricsResponse = {
  run_id?: string | null
  timestamp?: string | null
  missing_inputs?: string[]
  policy_version?: string | null
  changes?: { count?: number; successful_count?: number; lead_time_hours?: Record<string, number> }
  incidents?: { significant_count?: number; mttr_hours?: Record<string, number> }
  security?: { high_or_critical_count?: number }
  recovery?: { restore_jobs?: number; restore_job_duration_hours?: Record<string, number> }
  per_connector?: Record<
    string,
    {
      changes?: { successful_count?: number; lead_time_hours?: Record<string, number> }
      incidents?: { significant_count?: number; mttr_hours?: Record<string, number> }
      recovery?: { restore_jobs?: number }
    }
  >
}

type Soc2OperationalMetricsResponse = {
  run_id?: string | null
  timestamp?: string | null
  missing_inputs?: string[]
  policy_version?: string | null
  changes?: { count?: number; successful_count?: number; lead_time_hours?: Record<string, number> }
  availability?: { incident_count?: number; restore_time_hours?: Record<string, number> }
  recovery?: { restore_jobs?: number }
  per_connector?: Record<
    string,
    {
      changes?: { successful_count?: number; lead_time_hours?: Record<string, number> }
      availability?: { incident_count?: number; restore_time_hours?: Record<string, number> }
      recovery?: { restore_jobs?: number }
    }
  >
}

type GxpOperationalMetricsResponse = {
  run_id?: string | null
  timestamp?: string | null
  missing_inputs?: string[]
  policy_version?: string | null
  backup?: { success_rate_percent?: number; failed?: number }
  restore?: { jobs?: number; job_duration_hours?: Record<string, number> }
  incidents?: { failure_signal_count?: number; restore_time_hours?: Record<string, number> }
  per_connector?: Record<
    string,
    {
      backup?: { success_rate_percent?: number; failed?: number }
      restore?: { jobs?: number; job_duration_hours?: Record<string, number> }
      incidents?: { failure_signal_count?: number; restore_time_hours?: Record<string, number> }
    }
  >
}

type IsoControlsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  policy_version?: string | null
  controls?: Record<string, GenericControlStatus>
  per_connector?: Record<string, Record<string, { status: string }>>
  resilience_playbook?: ResiliencePlaybookSummary
}

type IsoOperationalMetricsResponse = {
  run_id?: string | null
  timestamp?: string | null
  missing_inputs?: string[]
  policy_version?: string | null
  changes?: { successful_count?: number; lead_time_hours?: Record<string, number> }
  incidents?: { significant_count?: number }
  recovery?: { restore_jobs?: number }
  per_connector?: Record<
    string,
    {
      changes?: { successful_count?: number; lead_time_hours?: Record<string, number> }
      incidents?: { significant_count?: number }
      recovery?: { restore_jobs?: number }
    }
  >
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (!values.length) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function statusTone(status?: string) {
  const normalized = (status ?? '').toLowerCase()
  if (['ok', 'healthy', 'up', 'ready', 'running'].includes(normalized)) return 'text-emerald-300'
  if (['degraded', 'warning', 'warn'].includes(normalized)) return 'text-amber-300'
  if (['error', 'failed', 'down'].includes(normalized)) return 'text-rose-300'
  return 'text-slate-300'
}

function formatPercentiles(values: Record<string, number> | null | undefined) {
  if (!values || !Object.keys(values).length) return 'n/a'
  const order = ['median', 'p75', 'p90']
  const parts = order
    .filter((key) => values[key] !== undefined)
    .map((key) => `${key === 'median' ? 'p50' : key}:${values[key].toFixed(1)}`)
  return parts.length ? parts.join(' | ') : 'n/a'
}

function formatRatio(value?: number) {
  if (typeof value !== 'number') return 'n/a'
  return `${(value * 100).toFixed(0)}%`
}

function formatMinutesAsHours(value?: number) {
  if (typeof value !== 'number') return 'n/a'
  return `${(value / 60).toFixed(1)}h`
}

function formatMissingInputs(inputs?: string[] | null) {
  if (!inputs?.length) return null
  return inputs.map((item) => item.replace(/_/g, ' ')).join(', ')
}

type NormalizedOperationalMetrics = {
  deployments?: number | null
  changes?: number | null
  leadTime?: Record<string, number> | null
  incidents?: number | null
  restoreTime?: Record<string, number> | null
  restores?: number | null
  changeFailureRate?: number | null
  policyVersion?: string | null
  perConnector?: Record<string, NormalizedOperationalMetrics>
}

function normalizeDoraOperational(metrics: DoraMetricsResponse): NormalizedOperationalMetrics {
  const perConnector =
    metrics.per_connector && Object.keys(metrics.per_connector).length
      ? Object.fromEntries(
          Object.entries(metrics.per_connector).map(([provider, entry]) => [
            provider,
            {
              deployments: entry.deployments?.count ?? null,
              changes: entry.inputs?.change_events ?? null,
              leadTime: entry.lead_time_hours ?? null,
              incidents: entry.inputs?.security_events ?? null,
              restoreTime: entry.restore_time_hours ?? null,
              restores: entry.inputs?.recovery_jobs ?? null,
              changeFailureRate: entry.change_failure_rate_percent ?? null,
            },
          ]),
        )
      : undefined
  return {
    deployments: metrics.deployments?.count ?? null,
    changes: metrics.inputs?.change_events ?? null,
    leadTime: metrics.lead_time_hours ?? null,
    incidents: metrics.inputs?.security_events ?? null,
    restoreTime: metrics.restore_time_hours ?? null,
    restores: metrics.inputs?.recovery_jobs ?? null,
    changeFailureRate: metrics.change_failure_rate_percent ?? null,
    policyVersion: metrics.policy_version ?? null,
    perConnector,
  }
}

function normalizeNis2Operational(metrics: Nis2OperationalMetricsResponse): NormalizedOperationalMetrics {
  const restoreTime = metrics.incidents?.mttr_hours ?? metrics.recovery?.restore_job_duration_hours ?? null
  const perConnector =
    metrics.per_connector && Object.keys(metrics.per_connector).length
      ? Object.fromEntries(
          Object.entries(metrics.per_connector).map(([provider, entry]) => [
            provider,
            {
              changes: entry.changes?.successful_count ?? null,
              leadTime: entry.changes?.lead_time_hours ?? null,
              incidents: entry.incidents?.significant_count ?? null,
              restoreTime: entry.incidents?.mttr_hours ?? null,
              restores: entry.recovery?.restore_jobs ?? null,
            },
          ]),
        )
      : undefined
  return {
    changes: metrics.changes?.successful_count ?? null,
    leadTime: metrics.changes?.lead_time_hours ?? null,
    incidents: metrics.incidents?.significant_count ?? null,
    restoreTime,
    restores: metrics.recovery?.restore_jobs ?? null,
    policyVersion: metrics.policy_version ?? null,
    perConnector,
  }
}

function normalizeIsoOperational(metrics: IsoOperationalMetricsResponse): NormalizedOperationalMetrics {
  const perConnector =
    metrics.per_connector && Object.keys(metrics.per_connector).length
      ? Object.fromEntries(
          Object.entries(metrics.per_connector).map(([provider, entry]) => [
            provider,
            {
              changes: entry.changes?.successful_count ?? null,
              leadTime: entry.changes?.lead_time_hours ?? null,
              incidents: entry.incidents?.significant_count ?? null,
              restores: entry.recovery?.restore_jobs ?? null,
            },
          ]),
        )
      : undefined
  return {
    changes: metrics.changes?.successful_count ?? null,
    leadTime: metrics.changes?.lead_time_hours ?? null,
    incidents: metrics.incidents?.significant_count ?? null,
    restores: metrics.recovery?.restore_jobs ?? null,
    policyVersion: metrics.policy_version ?? null,
    perConnector,
  }
}

function normalizeSoc2Operational(metrics: Soc2OperationalMetricsResponse): NormalizedOperationalMetrics {
  const perConnector =
    metrics.per_connector && Object.keys(metrics.per_connector).length
      ? Object.fromEntries(
          Object.entries(metrics.per_connector).map(([provider, entry]) => [
            provider,
            {
              changes: entry.changes?.successful_count ?? null,
              leadTime: entry.changes?.lead_time_hours ?? null,
              incidents: entry.availability?.incident_count ?? null,
              restoreTime: entry.availability?.restore_time_hours ?? null,
              restores: entry.recovery?.restore_jobs ?? null,
            },
          ]),
        )
      : undefined
  return {
    changes: metrics.changes?.successful_count ?? null,
    leadTime: metrics.changes?.lead_time_hours ?? null,
    incidents: metrics.availability?.incident_count ?? null,
    restoreTime: metrics.availability?.restore_time_hours ?? null,
    restores: metrics.recovery?.restore_jobs ?? null,
    policyVersion: metrics.policy_version ?? null,
    perConnector,
  }
}

function normalizeGxpOperational(metrics: GxpOperationalMetricsResponse): NormalizedOperationalMetrics {
  const perConnector =
    metrics.per_connector && Object.keys(metrics.per_connector).length
      ? Object.fromEntries(
          Object.entries(metrics.per_connector).map(([provider, entry]) => [
            provider,
            {
              incidents: entry.incidents?.failure_signal_count ?? null,
              restoreTime: entry.restore?.job_duration_hours ?? null,
              restores: entry.restore?.jobs ?? null,
            },
          ]),
        )
      : undefined
  return {
    incidents: metrics.incidents?.failure_signal_count ?? null,
    restoreTime: metrics.restore?.job_duration_hours ?? null,
    restores: metrics.restore?.jobs ?? null,
    policyVersion: metrics.policy_version ?? null,
    perConnector,
  }
}

function OperationalMetricsBlock({
  metrics,
  emptyText,
  missingInputs,
  timestamp,
}: {
  metrics: NormalizedOperationalMetrics | null
  emptyText: string
  missingInputs?: string[] | null
  timestamp?: string | null
}) {
  const missingText = formatMissingInputs(missingInputs ?? undefined)
  const timestampText = timestamp ? `Data as of ${formatTimestamp(timestamp)}` : null
  if (!metrics) {
    return (
      <>
        <div className="text-xs text-slate-200">{emptyText}</div>
        {missingText ? (
          <div className="mt-2 text-[11px] text-amber-200">Missing inputs: {missingText}</div>
        ) : null}
        {timestampText ? <div className="text-[11px] text-slate-400">{timestampText}</div> : null}
      </>
    )
  }
  const deployments =
    typeof metrics.deployments === 'number' ? String(metrics.deployments) : 'n/a'
  const changes =
    typeof metrics.changes === 'number' ? String(metrics.changes) : 'n/a'
  const incidents =
    typeof metrics.incidents === 'number' ? String(metrics.incidents) : 'n/a'
  const restores =
    typeof metrics.restores === 'number' ? String(metrics.restores) : 'n/a'
  const changeFailureRate =
    typeof metrics.changeFailureRate === 'number'
      ? `${metrics.changeFailureRate.toFixed(1)}%`
      : 'n/a'
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Deployments</span>
        <span className="font-semibold">{deployments}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Change failure rate</span>
        <span className="font-semibold">{changeFailureRate}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Changes (successful)</span>
        <span className="font-semibold">{changes}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Lead time p50/p75/p90 (h)</span>
        <span className="font-semibold">{formatPercentiles(metrics.leadTime)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Incidents</span>
        <span className="font-semibold">{incidents}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Restore/MTTR p50/p75/p90 (h)</span>
        <span className="font-semibold">{formatPercentiles(metrics.restoreTime)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-200">Restores</span>
        <span className="font-semibold">{restores}</span>
      </div>
      {metrics.policyVersion ? (
        <div className="mt-1 text-[11px] text-slate-400">Policy {metrics.policyVersion}</div>
      ) : null}
      {missingText ? (
        <div className="mt-1 text-[11px] text-amber-200">Missing inputs: {missingText}</div>
      ) : null}
      {timestampText ? <div className="text-[11px] text-slate-400">{timestampText}</div> : null}
    </>
  )
}

const RESILIENCE_LAYER_MAP: { layer: string; categories: string[] }[] = [
  { layer: 'Network', categories: ['availability'] },
  { layer: 'Storage', categories: ['replication'] },
  { layer: 'Data protection', categories: ['backup'] },
  { layer: 'Recovery', categories: ['recovery'] },
  { layer: 'Observability', categories: ['telemetry', 'governance'] },
]

type ResilienceRuleTableRow = {
  id: string
  title: string
  category: string
  status: 'pass' | 'fail'
  source: string
  explanation: string
  lastTimestamp: string
}

function buildResilienceRuleConnectorIndex(perConnector?: Record<string, ResiliencePlaybookSummary>) {
  const byRule = new Map<string, { pass: Set<string>; fail: Set<string> }>()
  for (const [provider, summary] of Object.entries(perConnector ?? {})) {
    for (const rule of summary.rules ?? []) {
      const ruleId = String(rule.rule_id || rule.title || '').trim()
      if (!ruleId) continue
      const status = String(rule.status ?? '').toLowerCase().trim()
      const entry = byRule.get(ruleId) ?? { pass: new Set<string>(), fail: new Set<string>() }
      if (status === 'pass') entry.pass.add(provider)
      if (status === 'fail') entry.fail.add(provider)
      byRule.set(ruleId, entry)
    }
  }
  return byRule
}

function resilienceRuleSource(
  ruleId: string,
  status: 'pass' | 'fail',
  byRule: Map<string, { pass: Set<string>; fail: Set<string> }>,
  allProviders: string[],
) {
  if (isHaFailoverProofRule(ruleId)) {
    const configuredPaloAltoProviders = allProviders
      .filter((provider) => normalizeConnectorKey(provider).startsWith('palo_alto:'))
      .sort()
    if (configuredPaloAltoProviders.length) return configuredPaloAltoProviders.join(', ')
  }
  const entry = byRule.get(ruleId)
  const providers =
    status === 'pass' ? Array.from(entry?.pass ?? []).sort() : Array.from(entry?.fail ?? []).sort()
  const filtered = filterProvidersForRule(ruleId, providers)
  if (filtered.length) return filtered.join(', ')
  const fallbackProviders = filterProvidersForRule(ruleId, allProviders)
  if (fallbackProviders.length) return fallbackProviders.join(', ')
  if (status === 'fail') return 'n/a'
  if (allProviders.length) return allProviders.join(', ')
  return 'n/a'
}

function normalizeRuleId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isNetworkHaProvider(provider: string) {
  const normalized = normalizeConnectorKey(provider)
  if (!normalized) return false
  if (normalized === 'cisco_dnac' || normalized === 'dnac' || normalized === 'cisco_restconf') return true
  if (normalized === 'restconf' || normalized === 'cisco_netconf' || normalized === 'netconf') return true
  return NETWORK_HA_PROVIDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function filterProvidersForRule(ruleId: string, providers: string[]) {
  const normalizedRuleId = normalizeRuleId(ruleId)
  if (NETWORK_HA_RULE_IDS.has(normalizedRuleId)) {
    return providers.filter((provider) => isNetworkHaProvider(provider))
  }
  return providers
}

function metricNumber(metrics: Record<string, number> | undefined, key: string) {
  const value = metrics?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function formatMetricRatio(value: number | null) {
  if (value === null) return 'n/a'
  return `${Math.round(value * 100)}%`
}

function formatMetricCount(value: number | null) {
  if (value === null) return 'n/a'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatMetricDateTime(value: number | null) {
  if (value === null) return 'n/a'
  const epochSeconds = value > 1_000_000_000_000 ? value / 1000 : value
  const date = new Date(epochSeconds * 1000)
  if (Number.isNaN(date.valueOf())) return 'n/a'
  return formatTimestamp(date.toISOString())
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function parseAnyTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.trunc(value) : Math.trunc(value * 1000)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const direct = Date.parse(raw)
  if (Number.isFinite(direct)) return direct
  const match = raw.match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, year, month, day, hour, minute, second] = match
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )
  }
  return null
}

function formatTimestampFromMs(value: number | null) {
  if (value === null) return 'n/a'
  return formatTimestamp(new Date(value).toISOString())
}

function flattenSignalMetadata(value: unknown) {
  const root = toRecord(value)
  if (!root) return {}
  const flattened: Record<string, unknown> = {}
  let current: Record<string, unknown> | null = root
  let guard = 0
  while (current && guard < 10) {
    guard += 1
    Object.assign(flattened, current)
    current = toRecord(current.metadata)
  }
  return flattened
}

function parseSequenceEvents(rawEvents: unknown[]): HaRecoverySequenceEvent[] {
  return rawEvents
    .map((item) => {
      const payload = toRecord(item)
      if (!payload) return null
      const timestampRaw = String(payload.timestamp ?? '').trim()
      const eventType = String(payload.event_type ?? payload.type ?? payload.subtype ?? '').trim()
      const severity = String(payload.severity ?? '').trim()
      const eventId = String(payload.event_id ?? '').trim()
      const event = String(payload.event ?? '').trim()
      const description = String(payload.description ?? '').trim()
      if (!timestampRaw && !event && !description && !eventType && !severity && !eventId) return null
      return {
        timestampRaw,
        timestampMs: parseAnyTimestampMs(timestampRaw),
        eventType: eventType || 'ha',
        severity: severity || 'informational',
        eventId: eventId || 'n/a',
        event: event || 'n/a',
        description: description || 'n/a',
      } satisfies HaRecoverySequenceEvent
    })
    .filter((item): item is HaRecoverySequenceEvent => Boolean(item))
    .sort((a, b) => (a.timestampMs ?? Number.POSITIVE_INFINITY) - (b.timestampMs ?? Number.POSITIVE_INFINITY))
}

function synthesizeSequenceEventFromSignal(
  signal: SnapshotResilienceSignal,
  metadata: Record<string, unknown>,
): HaRecoverySequenceEvent | null {
  const signalMetadata = toRecord(signal?.metadata)
  const timestampRaw = String(signal?.observed_at ?? signal?.timestamp ?? metadata.observed_at ?? metadata.timestamp ?? '').trim()
  const eventType = String(metadata.subtype ?? metadata.type ?? signal?.signal_type ?? signal?.event_type ?? '').trim()
  const severity = String(signal?.severity ?? metadata.severity ?? 'low').trim()
  const eventId = String(metadata.event_id ?? metadata.signal_id ?? '').trim()
  const event = String(metadata.event ?? signal?.signal_type ?? signal?.event_type ?? '').trim()
  const description = String(signalMetadata?.description ?? signal?.status ?? '').trim()
  if (!timestampRaw && !eventType && !severity && !eventId && !event && !description) return null
  return {
    timestampRaw,
    timestampMs: parseAnyTimestampMs(timestampRaw),
    eventType: eventType || 'ha',
    severity: severity || 'low',
    eventId: eventId || 'n/a',
    event: event || 'ha_health',
    description: description || 'Palo Alto HA state health',
  }
}

function buildSequenceStatus(
  incidentDetected: boolean,
  steps: Record<string, boolean>,
): { status: string; severity: string; recovered: boolean } {
  if (incidentDetected) {
    if (
      steps.sync_completed &&
      (steps.ha1_link_up || steps.control_link_running) &&
      (steps.ha2_link_up || steps.control_link_running)
    ) {
      return { status: 'ok', severity: 'low', recovered: true }
    }
    if (
      steps.backup_path_engaged ||
      steps.ha1_link_up ||
      steps.ha2_link_up ||
      steps.sync_started ||
      steps.control_link_running
    ) {
      return { status: 'degraded', severity: 'medium', recovered: false }
    }
    return { status: 'error', severity: 'critical', recovered: false }
  }
  if (steps.control_link_running || (steps.ha1_link_up && steps.ha2_link_up && steps.sync_completed)) {
    return { status: 'ok', severity: 'low', recovered: false }
  }
  return { status: 'observed', severity: 'low', recovered: false }
}

function eventNameFromChangeEvent(changeEvent: SnapshotChangeEvent, metadata: Record<string, unknown>) {
  return String(metadata.event ?? metadata.event_id ?? changeEvent.title ?? '').trim().toLowerCase()
}

function messageFromChangeEvent(changeEvent: SnapshotChangeEvent, metadata: Record<string, unknown>) {
  return String(changeEvent.description ?? metadata.description ?? '').trim().toLowerCase()
}

function isHaIncidentEvent(eventName: string, message: string) {
  const combined = `${eventName} ${message}`
  if (combined.includes('peer-split-brain') || combined.includes('split-brain')) return true
  return combined.includes('degraded state') && combined.includes('heartbeat backup')
}

function isHaRelatedChangeEvent(eventName: string, message: string) {
  const combined = `${eventName} ${message}`
  if (!combined) return false
  return [
    'ha',
    'split-brain',
    'connect-change',
    'session-synch',
    'ha1-link-change',
    'ha2-link-change',
    'heartbeat',
    'failover',
    'active state',
    'passive',
  ].some((token) => combined.includes(token))
}

function isHaBackupPathEvent(eventName: string, message: string) {
  return eventName.includes('connect-change') && message.includes('heartbeat backup')
}

function isHaLinkUpEvent(eventName: string, message: string, linkEvent: 'ha1-link-change' | 'ha2-link-change') {
  if (!eventName.includes(linkEvent)) return false
  return [' up', 'running', 'established', 'connection up'].some((token) => message.includes(token))
}

function isHaSyncStartedEvent(eventName: string, message: string) {
  return eventName.includes('session-synch') && message.includes('starting session synchron')
}

function isHaSyncCompletedEvent(eventName: string, message: string) {
  if (!eventName.includes('session-synch')) return false
  return ['completed session synchron', 'session synchronization completed'].some((token) =>
    message.includes(token),
  )
}

function isHaControlLinkRunningEvent(eventName: string, message: string) {
  if (!eventName.includes('connect-change')) return false
  return ['control link running', 'ha1 connection up'].some((token) => message.includes(token))
}

function buildSequenceFromChangeEvents(snapshot: ConnectorSnapshotResponse | null): HaRecoverySequenceDetail[] {
  const changeEvents = snapshot?.snapshot?.change_events
  if (!Array.isArray(changeEvents) || !changeEvents.length) return []
  const byKey = new Map<
    string,
    {
      source: string
      cluster: string
      events: Array<{
        timestampRaw: string
        timestampMs: number | null
        eventType: string
        severity: string
        eventId: string
        event: string
        description: string
      }>
    }
  >()
  for (const event of changeEvents) {
    const source = String(event?.source ?? '').trim()
    if (!source.toLowerCase().startsWith('palo_alto')) continue
    const metadata = flattenSignalMetadata(event?.metadata)
    const eventName = eventNameFromChangeEvent(event, metadata)
    const message = messageFromChangeEvent(event, metadata)
    if (!isHaRelatedChangeEvent(eventName, message)) continue
    const cluster = String(metadata.cluster ?? '').trim() || 'cluster-unknown'
    const key = `${source.toLowerCase()}|${cluster.toLowerCase()}`
    const entry = byKey.get(key) ?? { source, cluster, events: [] }
    const timestampRaw = String(event?.timestamp ?? '').trim()
    const eventType = String(metadata.subtype ?? metadata.type ?? '').trim() || 'ha'
    const severity = String(metadata.severity ?? '').trim() || 'informational'
    const eventId = String(metadata.event_id ?? '').trim() || 'n/a'
    entry.events.push({
      timestampRaw,
      timestampMs: parseAnyTimestampMs(timestampRaw),
      eventType,
      severity,
      eventId,
      event: eventName || String(event?.title ?? '').trim() || 'n/a',
      description: String(event?.description ?? '').trim() || 'n/a',
    })
    byKey.set(key, entry)
  }
  const sequences: HaRecoverySequenceDetail[] = []
  for (const item of byKey.values()) {
    const scopedEvents = [...item.events].sort(
      (a, b) => (a.timestampMs ?? Number.POSITIVE_INFINITY) - (b.timestampMs ?? Number.POSITIVE_INFINITY),
    )
    if (!scopedEvents.length) continue
    const incidentIndex = scopedEvents.findIndex((event) =>
      isHaIncidentEvent(event.event.toLowerCase(), event.description.toLowerCase()),
    )
    const steps: Record<string, boolean> = {
      incident_detected: incidentIndex >= 0,
      backup_path_engaged: false,
      ha1_link_up: false,
      ha2_link_up: false,
      sync_started: false,
      sync_completed: false,
      control_link_running: false,
    }
    for (const event of scopedEvents.slice(incidentIndex >= 0 ? incidentIndex : 0)) {
      const eventName = event.event.toLowerCase()
      const message = event.description.toLowerCase()
      if (isHaBackupPathEvent(eventName, message)) steps.backup_path_engaged = true
      if (isHaLinkUpEvent(eventName, message, 'ha1-link-change')) steps.ha1_link_up = true
      if (isHaLinkUpEvent(eventName, message, 'ha2-link-change')) steps.ha2_link_up = true
      if (isHaSyncStartedEvent(eventName, message)) steps.sync_started = true
      if (isHaSyncCompletedEvent(eventName, message)) steps.sync_completed = true
      if (isHaControlLinkRunningEvent(eventName, message)) steps.control_link_running = true
    }
    const statusPayload = buildSequenceStatus(steps.incident_detected, steps)
    const lastEventMs = scopedEvents.reduce<number | null>(
      (latest, event) =>
        event.timestampMs !== null && (latest === null || event.timestampMs > latest) ? event.timestampMs : latest,
      null,
    )
    sequences.push({
      source: item.source,
      cluster: item.cluster,
      status: statusPayload.status,
      severity: statusPayload.severity,
      incidentDetected: steps.incident_detected,
      recovered: statusPayload.recovered,
      lastEventMs,
      lastEventLabel: formatTimestampFromMs(lastEventMs),
      steps,
      events: scopedEvents,
    })
  }
  return sequences.sort((a, b) => (b.lastEventMs ?? Number.NEGATIVE_INFINITY) - (a.lastEventMs ?? Number.NEGATIVE_INFINITY))
}

function extractHaRecoverySequences(snapshot: ConnectorSnapshotResponse | null): HaRecoverySequenceDetail[] {
  const resilienceSignals = snapshot?.snapshot?.resilience_signals
  const details: HaRecoverySequenceDetail[] = []
  for (const signal of Array.isArray(resilienceSignals) ? resilienceSignals : []) {
    const signalType = String(signal?.signal_type ?? signal?.event_type ?? '')
      .trim()
      .toLowerCase()
    if (signalType !== 'ha_recovery_sequence') continue
    const source = String(signal?.source ?? signal?.provider ?? '').trim()
    if (!source.toLowerCase().startsWith('palo_alto')) continue
    const metadata = flattenSignalMetadata(signal?.metadata)
    const sequenceSteps = toRecord(metadata.sequence_steps) ?? {}
    const incidentDetected = Boolean(sequenceSteps.incident_detected)
    const status = String(signal?.status ?? metadata.status ?? 'unknown').trim().toLowerCase() || 'unknown'
    const severity = String(signal?.severity ?? metadata.severity ?? 'low').trim().toLowerCase() || 'low'
    const evidenceEventsRaw = Array.isArray(metadata.evidence_events) ? metadata.evidence_events : []
    const events = parseSequenceEvents(evidenceEventsRaw)
    if (!events.length) {
      const synthetic = synthesizeSequenceEventFromSignal(signal, metadata)
      if (synthetic) events.push(synthetic)
    }
    const signalObservedMs = parseAnyTimestampMs(signal?.observed_at ?? signal?.timestamp ?? metadata.observed_at)
    const eventLastMs = events.reduce<number | null>(
      (latest, event) =>
        event.timestampMs !== null && (latest === null || event.timestampMs > latest) ? event.timestampMs : latest,
      null,
    )
    const lastEventMs = eventLastMs ?? signalObservedMs
    const recovered =
      status === 'ok' ||
      status === 'healthy' ||
      status === 'success' ||
      status === 'resolved' ||
      (incidentDetected &&
        Boolean(sequenceSteps.sync_completed) &&
        Boolean(sequenceSteps.ha1_link_up || sequenceSteps.control_link_running) &&
        Boolean(sequenceSteps.ha2_link_up || sequenceSteps.control_link_running))
    details.push({
      source,
      cluster: String(metadata.cluster ?? '').trim() || 'n/a',
      status,
      severity,
      incidentDetected,
      recovered,
      lastEventMs,
      lastEventLabel: formatTimestampFromMs(lastEventMs),
      steps: Object.fromEntries(
        Object.entries(sequenceSteps).map(([key, value]) => [key, Boolean(value)]),
      ) as Record<string, boolean>,
      events,
    })
  }
  const fallbackSequences = buildSequenceFromChangeEvents(snapshot)
  const byKey = new Map<string, HaRecoverySequenceDetail>()
  for (const item of [...details, ...fallbackSequences]) {
    const key = `${item.source.toLowerCase()}|${item.cluster.toLowerCase()}`
    const previous = byKey.get(key)
    if (!previous) {
      byKey.set(key, item)
      continue
    }
    const previousScore = (previous.events.length ? 10 : 0) + (previous.recovered ? 2 : 0)
    const itemScore = (item.events.length ? 10 : 0) + (item.recovered ? 2 : 0)
    if (itemScore > previousScore) {
      byKey.set(key, item)
      continue
    }
    if (itemScore === previousScore && (item.lastEventMs ?? 0) > (previous.lastEventMs ?? 0)) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => (b.lastEventMs ?? Number.NEGATIVE_INFINITY) - (a.lastEventMs ?? Number.NEGATIVE_INFINITY),
  )
}

function isHaFailoverProofRule(ruleId: string) {
  return normalizeRuleId(ruleId).endsWith('-ha-failover-proof')
}

function pickRuleHaSequences(rule: ResilienceRuleTableRow, sequences: HaRecoverySequenceDetail[]) {
  if (!isHaFailoverProofRule(rule.id) || !sequences.length) return []
  const sourceFilters = parseRuleSourceFilters(rule.source)
  const relevant = sourceFilters.length
    ? sequences.filter((sequence) => sourceFilters.includes(sequence.source.toLowerCase()))
    : sequences
  const pool = relevant.length ? relevant : sequences
  const ranked = [...pool].sort((a, b) => {
    const aHasEvents = sequenceEvidenceEvents(a).length > 0 ? 1 : 0
    const bHasEvents = sequenceEvidenceEvents(b).length > 0 ? 1 : 0
    if (aHasEvents !== bHasEvents) return bHasEvents - aHasEvents
    const aRecovered = a.recovered ? 1 : 0
    const bRecovered = b.recovered ? 1 : 0
    if (aRecovered !== bRecovered) return bRecovered - aRecovered
    const aIncident = a.incidentDetected ? 1 : 0
    const bIncident = b.incidentDetected ? 1 : 0
    if (aIncident !== bIncident) return bIncident - aIncident
    return (b.lastEventMs ?? Number.NEGATIVE_INFINITY) - (a.lastEventMs ?? Number.NEGATIVE_INFINITY)
  })
  return ranked
}

function parseRuleSourceFilters(sourceValue: string | undefined) {
  return String(sourceValue ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function ensureAllRuleSourcesHaveSequences(
  sourceFilters: string[],
  sequences: HaRecoverySequenceDetail[],
): HaRecoverySequenceDetail[] {
  if (!sourceFilters.length) return sequences
  const next = [...sequences]
  const presentSources = new Set(sequences.map((item) => item.source.toLowerCase()))
  for (const source of sourceFilters) {
    if (!source.startsWith('palo_alto:')) continue
    if (presentSources.has(source)) continue
    next.push({
      source,
      cluster: 'n/a',
      status: 'no_data',
      severity: 'low',
      incidentDetected: false,
      recovered: false,
      lastEventMs: null,
      lastEventLabel: 'n/a',
      steps: {},
      events: [],
    })
    presentSources.add(source)
  }
  return next
}

function sequenceEvidenceEventsForRule(sequences: HaRecoverySequenceDetail[]): HaRecoverySequenceEventWithSource[] {
  const items: HaRecoverySequenceEventWithSource[] = []
  for (const sequence of sequences) {
    for (const event of sequenceDisplayEvents(sequence)) {
      items.push({
        ...event,
        source: sequence.source,
        cluster: sequence.cluster,
      })
    }
  }
  items.sort((a, b) => eventTimestampSortValue(b) - eventTimestampSortValue(a))
  return items
}

function isCriticalHaEvent(event: HaRecoverySequenceEvent) {
  const severity = String(event.severity ?? '').trim().toLowerCase()
  if (severity === 'critical') return true
  const combined = `${event.event} ${event.eventId} ${event.description}`.toLowerCase()
  return combined.includes('split-brain') || combined.includes('peer-split-brain')
}

function isRecoverySequenceEvidenceEvent(event: HaRecoverySequenceEvent) {
  const combined = `${event.event} ${event.eventId} ${event.eventType} ${event.description}`.toLowerCase()
  return [
    'ha_split_brain',
    'ha_link_change',
    'ha_sync',
    'ha_role_change',
    'split-brain',
    'peer-split-brain',
    'connect-change',
    'session-synch',
    'ha1-link-change',
    'ha2-link-change',
    'heartbeat backup',
    'control link running',
  ].some((token) => combined.includes(token))
}

function isHaSequenceDisplayEvent(event: HaRecoverySequenceEvent) {
  const eventType = String(event.eventType ?? '').trim().toLowerCase()
  const combined = `${event.event} ${event.eventId} ${event.eventType} ${event.description}`.toLowerCase()
  const hasHaWord = /\bha\b/.test(combined)
  if (eventType === 'ha' || eventType.startsWith('ha_')) return true
  if (hasHaWord) return true
  return [
    'split-brain',
    'peer-split-brain',
    'connect-change',
    'session-synch',
    'ha1-link-change',
    'ha2-link-change',
    'control link',
    'heartbeat backup',
    'failover',
    'active state',
    'passive',
  ].some((token) => combined.includes(token))
}

function sequenceEvidenceEvents(sequence: HaRecoverySequenceDetail | null | undefined): HaRecoverySequenceEvent[] {
  if (!sequence) return []
  return sequence.events.filter((event) => isRecoverySequenceEvidenceEvent(event))
}

function sequenceDisplayEvents(sequence: HaRecoverySequenceDetail | null | undefined): HaRecoverySequenceEvent[] {
  if (!sequence) return []
  const recoveryEvents = sequenceEvidenceEvents(sequence)
  if (recoveryEvents.length) return recoveryEvents
  return sequence.events
    .filter((event) => isHaSequenceDisplayEvent(event))
    .sort((a, b) => eventTimestampSortValue(a) - eventTimestampSortValue(b))
}

function eventTimestampSortValue(event: HaRecoverySequenceEvent | null | undefined) {
  if (!event) return Number.NEGATIVE_INFINITY
  if (typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)) return event.timestampMs
  const parsed = parseAnyTimestampMs(event.timestampRaw)
  return parsed ?? Number.NEGATIVE_INFINITY
}

function eventTimestampLabel(event: HaRecoverySequenceEvent | null | undefined) {
  if (!event) return 'n/a'
  const raw = String(event.timestampRaw ?? '').trim()
  if (raw) {
    const parsedRaw = parseAnyTimestampMs(raw)
    if (parsedRaw !== null) return formatTimestampFromMs(parsedRaw)
    return raw
  }
  if (typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)) {
    return formatTimestampFromMs(event.timestampMs)
  }
  return 'n/a'
}

function lastCriticalHaEvent(sequence: HaRecoverySequenceDetail | null | undefined): HaRecoverySequenceEvent | null {
  if (!sequence) return null
  return sequenceEvidenceEvents(sequence).reduce<HaRecoverySequenceEvent | null>((latest, event) => {
    if (!isCriticalHaEvent(event)) return latest
    if (!latest) return event
    return eventTimestampSortValue(event) > eventTimestampSortValue(latest) ? event : latest
  }, null)
}

function lastCriticalHaEventMs(sequence: HaRecoverySequenceDetail | null | undefined): number | null {
  const event = lastCriticalHaEvent(sequence)
  if (!event) return null
  const value = eventTimestampSortValue(event)
  return Number.isFinite(value) ? value : null
}

function pickBestHaSequence(sequences?: HaRecoverySequenceDetail[]): HaRecoverySequenceDetail | null {
  if (!sequences?.length) return null
  const ranked = [...sequences].sort((a, b) => {
    const aIncident = a.incidentDetected ? 1 : 0
    const bIncident = b.incidentDetected ? 1 : 0
    if (aIncident !== bIncident) return bIncident - aIncident
    const aCritical = lastCriticalHaEventMs(a) !== null ? 1 : 0
    const bCritical = lastCriticalHaEventMs(b) !== null ? 1 : 0
    if (aCritical !== bCritical) return bCritical - aCritical
    const aHasEvents = sequenceEvidenceEvents(a).length > 0 ? 1 : 0
    const bHasEvents = sequenceEvidenceEvents(b).length > 0 ? 1 : 0
    if (aHasEvents !== bHasEvents) return bHasEvents - aHasEvents
    return (b.lastEventMs ?? Number.NEGATIVE_INFINITY) - (a.lastEventMs ?? Number.NEGATIVE_INFINITY)
  })
  return ranked[0] ?? null
}

function isFailoverEvidenceSequence(sequence: HaRecoverySequenceDetail | null | undefined): boolean {
  if (!sequence) return false
  if (sequence.incidentDetected) return true
  return sequenceEvidenceEvents(sequence).length > 0
}

function haSequenceIdentity(sequence: HaRecoverySequenceDetail) {
  return `${String(sequence.source ?? '').trim().toLowerCase()}|${String(sequence.cluster ?? '').trim().toLowerCase()}`
}

function pickBetterHaSequence(
  current: HaRecoverySequenceDetail,
  candidate: HaRecoverySequenceDetail,
): HaRecoverySequenceDetail {
  const currentDisplayCount = sequenceDisplayEvents(current).length
  const candidateDisplayCount = sequenceDisplayEvents(candidate).length
  if (candidateDisplayCount !== currentDisplayCount) {
    return candidateDisplayCount > currentDisplayCount ? candidate : current
  }
  const currentCriticalMs = lastCriticalHaEventMs(current) ?? Number.NEGATIVE_INFINITY
  const candidateCriticalMs = lastCriticalHaEventMs(candidate) ?? Number.NEGATIVE_INFINITY
  if (candidateCriticalMs !== currentCriticalMs) {
    return candidateCriticalMs > currentCriticalMs ? candidate : current
  }
  const currentLastMs = current.lastEventMs ?? Number.NEGATIVE_INFINITY
  const candidateLastMs = candidate.lastEventMs ?? Number.NEGATIVE_INFINITY
  if (candidateLastMs !== currentLastMs) {
    return candidateLastMs > currentLastMs ? candidate : current
  }
  return candidate
}

function mergeHaRecoverySequences(
  live: HaRecoverySequenceDetail[],
  cached: HaRecoverySequenceDetail[],
): HaRecoverySequenceDetail[] {
  const byIdentity = new Map<string, HaRecoverySequenceDetail>()
  for (const sequence of [...cached, ...live]) {
    const identity = haSequenceIdentity(sequence)
    const previous = byIdentity.get(identity)
    if (!previous) {
      byIdentity.set(identity, sequence)
      continue
    }
    byIdentity.set(identity, pickBetterHaSequence(previous, sequence))
  }
  return Array.from(byIdentity.values()).sort(
    (a, b) => (b.lastEventMs ?? Number.NEGATIVE_INFINITY) - (a.lastEventMs ?? Number.NEGATIVE_INFINITY),
  )
}

function normalizeStoredHaSequenceEvent(event: Partial<HaRecoverySequenceEvent> & Record<string, unknown>) {
  const timestampRaw = String(event.timestampRaw ?? event.timestamp ?? '').trim()
  const timestampMs =
    typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)
      ? event.timestampMs
      : parseAnyTimestampMs(timestampRaw)
  return {
    timestampRaw,
    timestampMs,
    eventType: String(event.eventType ?? event.event_type ?? event.subtype ?? event.type ?? '').trim() || 'ha',
    severity: String(event.severity ?? '').trim() || 'informational',
    eventId: String(event.eventId ?? event.event_id ?? '').trim() || 'n/a',
    event: String(event.event ?? event.title ?? '').trim() || 'n/a',
    description: String(event.description ?? event.message ?? '').trim() || 'n/a',
  }
}

function normalizeStoredHaSequence(sequence: Partial<HaRecoverySequenceDetail> & Record<string, unknown>) {
  const source = String(sequence.source ?? '').trim()
  if (!source.toLowerCase().startsWith('palo_alto:')) return null
  const rawEvents = Array.isArray(sequence.events) ? (sequence.events as unknown[]) : []
  const events = rawEvents.length
    ? rawEvents
        .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === 'object')
        .map((event) => normalizeStoredHaSequenceEvent(event))
    : []
  const lastEventMs =
    typeof sequence.lastEventMs === 'number' && Number.isFinite(sequence.lastEventMs)
      ? sequence.lastEventMs
      : events.reduce<number | null>(
          (latest, event) =>
            event.timestampMs !== null && (latest === null || event.timestampMs > latest) ? event.timestampMs : latest,
          null,
        )
  return {
    source,
    cluster: String(sequence.cluster ?? '').trim() || 'n/a',
    status: String(sequence.status ?? 'unknown').trim().toLowerCase() || 'unknown',
    severity: String(sequence.severity ?? 'low').trim().toLowerCase() || 'low',
    incidentDetected: Boolean(sequence.incidentDetected),
    recovered: Boolean(sequence.recovered),
    lastEventMs,
    lastEventLabel: formatTimestampFromMs(lastEventMs),
    steps: Object.fromEntries(
      Object.entries(toRecord(sequence.steps) ?? {}).map(([key, value]) => [key, Boolean(value)]),
    ),
    events,
  } satisfies HaRecoverySequenceDetail
}

function extractHaRecoverySequencesFromPlaybooks(playbooks: Array<ResiliencePlaybookSummary | null | undefined>) {
  const sequences: HaRecoverySequenceDetail[] = []
  for (const playbook of playbooks) {
    for (const sequence of playbook?.ha_recovery_sequences ?? []) {
      const normalized = normalizeStoredHaSequence(sequence as Partial<HaRecoverySequenceDetail> & Record<string, unknown>)
      if (normalized) sequences.push(normalized)
    }
    for (const connectorPlaybook of Object.values(playbook?.per_connector ?? {})) {
      for (const sequence of connectorPlaybook?.ha_recovery_sequences ?? []) {
        const normalized = normalizeStoredHaSequence(
          sequence as Partial<HaRecoverySequenceDetail> & Record<string, unknown>,
        )
        if (normalized) sequences.push(normalized)
      }
    }
  }
  return mergeHaRecoverySequences(sequences, [])
}

const HA_SEQUENCE_STEP_LABELS: Array<[string, string]> = [
  ['incident_detected', 'Incident detected'],
  ['backup_path_engaged', 'Backup path engaged'],
  ['ha1_link_up', 'HA1 link up'],
  ['ha2_link_up', 'HA2 link up'],
  ['sync_started', 'Session sync started'],
  ['sync_completed', 'Session sync completed'],
  ['control_link_running', 'Control link running'],
]

function resilienceRuleEvidenceText(
  rule: ResiliencePlaybookRule,
  metrics: Record<string, number> | undefined,
  fallback: string,
  sequences?: HaRecoverySequenceDetail[],
  sourceFilter?: string,
) {
  const ruleId = normalizeRuleId(String(rule.rule_id || rule.title || ''))
  if (!NETWORK_HA_RULE_IDS.has(ruleId)) return fallback
  if (ruleId.endsWith('-ha-failover-proof')) {
    const scopedSequences = sourceFilter
      ? (sequences ?? []).filter((sequence) => sequence.source.toLowerCase() === sourceFilter.toLowerCase())
      : sequences ?? []
    const incidents = scopedSequences.length
      ? scopedSequences.filter((sequence) => sequence.incidentDetected).length
      : metricNumber(metrics, 'palo_ha_failover_incidents')
    const evidence = scopedSequences.length
      ? scopedSequences.filter((sequence) => isFailoverEvidenceSequence(sequence)).length
      : metricNumber(metrics, 'palo_ha_failover_evidence')
    const recovered = scopedSequences.length
      ? scopedSequences.filter((sequence) => sequence.incidentDetected && sequence.recovered).length
      : metricNumber(metrics, 'palo_ha_failover_recovered')
    const incidentCount = incidents ?? 0
    const recoveredCount = recovered ?? 0
    const ratio = scopedSequences.length
      ? (incidentCount > 0 ? recoveredCount / incidentCount : null)
      : metricNumber(metrics, 'palo_ha_failover_recovered_ratio')
    const controlledFailoverDetected = evidence !== null && evidence > 0
    const controlledFailoverText = controlledFailoverDetected
      ? ' Controlled failover detected.'
      : ''
    const retainedEvidence = metricNumber(metrics, 'palo_ha_failover_recent_evidence_1y')
    const retainedEvidenceText =
      retainedEvidence !== null && retainedEvidence >= 1
        ? ' Recent HA failover evidence within the last year.'
        : ''
    const fallbackSequence = pickBestHaSequence(scopedSequences)
    const fallbackCriticalEvent = lastCriticalHaEvent(fallbackSequence)
    const lastEventText =
      fallbackCriticalEvent
        ? `Last critical HA change: ${eventTimestampLabel(fallbackCriticalEvent)}. `
        : 'Last critical HA change: n/a. '
    return (
      `Palo Alto failover evidence ${formatMetricCount(evidence)} sequence(s). ` +
      `HA incidents recovered ${formatMetricCount(recovered)}/${formatMetricCount(incidents)} ` +
      `(${formatMetricRatio(ratio)}). ` +
      lastEventText +
      controlledFailoverText +
      retainedEvidenceText +
      `Target >= 100% when incidents exist or recent failover evidence is available.`
    )
  }
  const enabled = metricNumber(metrics, 'assets_ha_enabled')
  const total = metricNumber(metrics, 'assets_total')
  const ratio = metricNumber(metrics, 'network_ha_connectors_ratio')
  const networkConfigured = metricNumber(metrics, 'network_ha_connectors_configured')
  const networkTotal = metricNumber(metrics, 'network_ha_connectors_total')
  const connectorsConfigured = metricNumber(metrics, 'ha_connectors_configured')
  const connectorsTotal = metricNumber(metrics, 'ha_connectors_total')
  const target =
    ruleId.endsWith('-config-full')
      ? 1
      : ruleId.endsWith('-config-min')
        ? 0.5
        : ruleId === 'iso-res-ha'
          ? 0.5
          : 0.6
  return (
    `Network HA coverage ${formatMetricCount(networkConfigured)}/${formatMetricCount(networkTotal)} connectors ` +
    `(${formatMetricRatio(ratio)}). ` +
    `HA-ready connectors ${formatMetricCount(connectorsConfigured)}/${formatMetricCount(connectorsTotal)}. ` +
    `HA-enabled assets ${formatMetricCount(enabled)}/${formatMetricCount(total)}. ` +
    `Target >= ${Math.round(target * 100)}%.`
  )
}

function resilienceRuleLastTimestampText(
  rule: ResiliencePlaybookRule,
  metrics: Record<string, number> | undefined,
  sequences?: HaRecoverySequenceDetail[],
  sourceFilter?: string,
) {
  const ruleId = normalizeRuleId(String(rule.rule_id || rule.title || ''))
  if (ruleId.endsWith('-ha-failover-proof')) {
    const scopedSequences = sourceFilter
      ? (sequences ?? []).filter((sequence) => sequence.source.toLowerCase() === sourceFilter.toLowerCase())
      : sequences
    const fallbackSequence = pickBestHaSequence(scopedSequences)
    const criticalEvent = lastCriticalHaEvent(fallbackSequence)
    if (criticalEvent) return eventTimestampLabel(criticalEvent)
    const retainedEvidenceEpoch = metricNumber(metrics, 'palo_ha_last_evidence_epoch')
    if (retainedEvidenceEpoch !== null) return formatMetricDateTime(retainedEvidenceEpoch)
    return 'n/a'
  }
  const candidateKeys: string[] = []
  if (ruleId.endsWith('-ha') || ruleId.endsWith('-ha-config-full') || ruleId.endsWith('-ha-config-min')) {
    candidateKeys.push('ha_last_epoch', 'signals_ha_last_epoch')
  } else if (ruleId.endsWith('-backup')) {
    candidateKeys.push('signals_backup_last_epoch')
  } else if (ruleId.endsWith('-immutability')) {
    candidateKeys.push('signals_immutability_last_epoch')
  } else if (ruleId.endsWith('-restore')) {
    candidateKeys.push(
      'restore_failover_last_epoch',
      'signals_restore_last_epoch',
      'recovery_jobs_restore_last_epoch',
      'recovery_jobs_failover_last_epoch',
    )
  } else if (ruleId.endsWith('-recovery-failures')) {
    candidateKeys.push('recovery_jobs_failed_last_epoch', 'recovery_jobs_last_epoch')
  } else if (ruleId.endsWith('-signal-errors')) {
    candidateKeys.push('signals_error_last_epoch')
  } else if (ruleId.endsWith('-replication') || ruleId.endsWith('-rpo')) {
    candidateKeys.push('replication_last_epoch', 'signals_replication_last_epoch')
  } else if (ruleId.endsWith('-telemetry')) {
    candidateKeys.push('signals_last_epoch')
  }

  for (const key of candidateKeys) {
    const metric = metricNumber(metrics, key)
    if (metric !== null) return formatMetricDateTime(metric)
  }
  return 'n/a'
}

function buildResilienceLayers(
  rules: ResiliencePlaybookRule[] | undefined,
  perConnector?: Record<string, ResiliencePlaybookSummary>,
  metrics?: Record<string, number>,
  sequences?: HaRecoverySequenceDetail[],
) {
  if (!rules?.length) return []
  const byRule = buildResilienceRuleConnectorIndex(perConnector)
  const allProviders = Object.keys(perConnector ?? {}).sort()
  const splitFailoverSources = (sourceValue: string) => {
    const listed = parseRuleSourceFilters(sourceValue)
    const fromSequences = (sequences ?? [])
      .map((sequence) => String(sequence.source ?? '').trim().toLowerCase())
      .filter((source) => source.startsWith('palo_alto:'))
    const ordered = [...listed, ...fromSequences]
    const unique: string[] = []
    const seen = new Set<string>()
    for (const source of ordered) {
      if (!source || seen.has(source)) continue
      seen.add(source)
      unique.push(source)
    }
    return unique.length ? unique : [sourceValue || 'n/a']
  }
  const layerTotals = new Map<
    string,
    {
      passed: number
      total: number
      compliantRules: ResilienceRuleTableRow[]
      nonCompliantRules: ResilienceRuleTableRow[]
    }
  >()
  for (const rule of rules) {
    const category = String(rule.category ?? '').toLowerCase().trim()
    const match = RESILIENCE_LAYER_MAP.find((entry) => entry.categories.includes(category))
    const layerName = match?.layer ?? 'Other'
    const entry = layerTotals.get(layerName) ?? {
      passed: 0,
      total: 0,
      compliantRules: [],
      nonCompliantRules: [],
    }
    entry.total += 1
    const isCompliant = String(rule.status ?? '').toLowerCase().trim() === 'pass'
    const ruleLabel = String(rule.rule_id || rule.title || '').trim()
    const title = String(rule.title || rule.rule_id || '').trim() || ruleLabel
    const fallbackExplanation = String(rule.evidence || rule.title || '').trim() || 'n/a'
    const sourceValue = resilienceRuleSource(ruleLabel, isCompliant ? 'pass' : 'fail', byRule, allProviders)
    const splitSources = isHaFailoverProofRule(ruleLabel) ? splitFailoverSources(sourceValue) : [sourceValue]
    if (isCompliant) {
      entry.passed += 1
      if (ruleLabel) {
        for (const source of splitSources) {
          const explanation = resilienceRuleEvidenceText(rule, metrics, fallbackExplanation, sequences, source)
          const lastTimestamp = resilienceRuleLastTimestampText(rule, metrics, sequences, source)
        entry.compliantRules.push({
          id: ruleLabel,
          title,
          category,
          status: 'pass',
            source,
          explanation,
          lastTimestamp,
        })
        }
      }
    } else if (ruleLabel) {
      for (const source of splitSources) {
        const explanation = resilienceRuleEvidenceText(rule, metrics, fallbackExplanation, sequences, source)
        const lastTimestamp = resilienceRuleLastTimestampText(rule, metrics, sequences, source)
        entry.nonCompliantRules.push({
          id: ruleLabel,
          title,
          category,
          status: 'fail',
          source,
          explanation,
          lastTimestamp,
        })
      }
    }
    layerTotals.set(layerName, entry)
  }
  const sorted: {
    layer: string
    passed: number
    total: number
    compliantRules: ResilienceRuleTableRow[]
    nonCompliantRules: ResilienceRuleTableRow[]
  }[] = []
  for (const layer of RESILIENCE_LAYER_MAP.map((entry) => entry.layer)) {
    const entry = layerTotals.get(layer)
    if (entry) sorted.push({ layer, ...entry })
  }
  if (layerTotals.has('Other')) {
    const entry = layerTotals.get('Other')
    if (entry) sorted.push({ layer: 'Other', ...entry })
  }
  return sorted
}

function formatRuleCategory(category?: string) {
  const normalized = String(category ?? '').trim()
  if (!normalized) return 'General resilience'
  return normalized
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function ResilienceRuleTable({
  rules,
  tone,
  rowKeyPrefix,
  haSequences,
}: {
  rules: ResilienceRuleTableRow[]
  tone: 'pass' | 'fail'
  rowKeyPrefix: string
  haSequences?: HaRecoverySequenceDetail[]
}) {
  const [expandedRuleKey, setExpandedRuleKey] = useState<string | null>(null)
  const [expandedSequenceKeys, setExpandedSequenceKeys] = useState<Set<string>>(new Set())
  if (!rules.length) {
    return <div className="mt-1 text-[10px] text-slate-400">none</div>
  }
  const tableTone =
    tone === 'pass'
      ? {
          headerText: 'text-emerald-100',
          headerCell: 'border border-emerald-800/70 bg-emerald-950/60 px-1.5 py-1 font-semibold',
          rowText: 'text-emerald-50',
          rowCell: 'border border-emerald-800/60 bg-emerald-900/35 px-1.5 py-1 align-top',
          cardShell: 'border-emerald-800/60 bg-emerald-950/35 text-emerald-50',
          section: 'border-emerald-800/45 bg-emerald-950/25',
          statusPill: 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/70',
        }
      : {
          headerText: 'text-rose-100',
          headerCell: 'border border-rose-800/70 bg-rose-950/60 px-1.5 py-1 font-semibold',
          rowText: 'text-rose-50',
          rowCell: 'border border-rose-800/60 bg-rose-900/35 px-1.5 py-1 align-top',
          cardShell: 'border-rose-800/60 bg-rose-950/30 text-rose-50',
          section: 'border-rose-800/45 bg-rose-950/20',
          statusPill: 'bg-rose-900/65 text-rose-100 border border-rose-700/70',
        }

  return (
    <div className="mt-1 overflow-x-auto">
      <table className="min-w-full border-collapse text-[10px]">
        <thead>
          <tr className={`text-left ${tableTone.headerText}`}>
            <th className={tableTone.headerCell}>Rule</th>
            <th className={tableTone.headerCell}>Source</th>
            <th className={tableTone.headerCell}>Current evidence</th>
            <th className={tableTone.headerCell}>Last timestamp</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const rowKey = `${rowKeyPrefix}-${rule.id}-${index}`
            const isExpanded = expandedRuleKey === rowKey
            const isHaFailoverRule = isHaFailoverProofRule(rule.id)
            const ruleSourceFilters = isHaFailoverRule ? parseRuleSourceFilters(rule.source) : []
            const matchedRuleSequences = isHaFailoverRule ? pickRuleHaSequences(rule, haSequences ?? []) : []
            const ruleSequences = isHaFailoverRule
              ? ensureAllRuleSourcesHaveSequences(ruleSourceFilters, matchedRuleSequences)
              : []
            const ruleSequenceEvents = isHaFailoverRule ? sequenceEvidenceEventsForRule(ruleSequences) : []
            const sequenceKey = `${rowKey}-sequence`
            const showSequence = expandedSequenceKeys.has(sequenceKey)
            const criticalSequenceEvent =
              isHaFailoverRule && ruleSequences.length
                ? ruleSequences.reduce<HaRecoverySequenceEvent | null>((latest, item) => {
                    const candidate = lastCriticalHaEvent(item)
                    if (!candidate) return latest
                    if (!latest) return candidate
                    return eventTimestampSortValue(candidate) > eventTimestampSortValue(latest) ? candidate : latest
                  }, null)
                : null
            const criticalSequenceLabel =
              criticalSequenceEvent ? eventTimestampLabel(criticalSequenceEvent) : null
            const displayLastTimestamp =
              criticalSequenceLabel !== null
                ? criticalSequenceLabel
                : rule.lastTimestamp !== 'n/a'
                  ? rule.lastTimestamp
                  : ruleSequences[0]?.lastEventLabel ?? rule.lastTimestamp
            const toggleSequenceDetails = () =>
              setExpandedSequenceKeys((previous) => {
                const next = new Set(previous)
                if (next.has(sequenceKey)) {
                  next.delete(sequenceKey)
                } else {
                  next.add(sequenceKey)
                }
                return next
              })
            const openSequenceDetails = () => {
              setExpandedRuleKey(rowKey)
              setExpandedSequenceKeys((previous) => {
                const next = new Set(previous)
                next.add(sequenceKey)
                return next
              })
            }
            const guidance = getResilienceRuleHelp({
              id: rule.id,
              title: rule.title,
              category: rule.category,
            })
            return (
              <Fragment key={rowKey}>
                <tr className={tableTone.rowText}>
                  <td className={tableTone.rowCell}>
                    <button
                      type="button"
                      onClick={() => setExpandedRuleKey((prev) => (prev === rowKey ? null : rowKey))}
                      className="text-left hover:opacity-90"
                    >
                      <div className="font-semibold underline decoration-dotted underline-offset-2">
                        {rule.title || rule.id}
                      </div>
                      {rule.title && rule.title !== rule.id ? (
                        <div className="mt-0.5 font-mono text-[9px] opacity-80">{rule.id}</div>
                      ) : null}
                      <div className="mt-0.5 text-[9px] opacity-75">Click for guidance</div>
                    </button>
                  </td>
                  <td className={tableTone.rowCell}>{rule.source}</td>
                  <td className={tableTone.rowCell}>
                    <div>{rule.explanation}</div>
                    {isHaFailoverRule ? (
                      <button
                        type="button"
                        className="mt-1 text-[10px] font-semibold text-sky-200 underline decoration-dotted underline-offset-2 hover:text-sky-100"
                        onClick={openSequenceDetails}
                      >
                        View detected sequence
                      </button>
                    ) : null}
                  </td>
                  <td className={tableTone.rowCell}>{displayLastTimestamp}</td>
                </tr>
                {isExpanded ? (
                  <tr className={tableTone.rowText}>
                    <td className={tableTone.rowCell} colSpan={4}>
                      <div className={`rounded-lg border p-3 text-[11px] ${tableTone.cardShell}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${tableTone.statusPill}`}>
                            {rule.status === 'pass' ? 'Compliant' : 'Non-compliant'}
                          </span>
                          <span className="rounded border border-slate-600/70 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-200">
                            {formatRuleCategory(rule.category)}
                          </span>
                          <span className="font-mono text-[10px] text-slate-300">{rule.id}</span>
                        </div>

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <section className={`rounded border p-2 ${tableTone.section}`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                              What This Rule Checks
                            </div>
                            <p className="mt-1 leading-relaxed">{guidance.check}</p>
                          </section>
                          <section className={`rounded border p-2 ${tableTone.section}`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                              Why This Matters
                            </div>
                            <p className="mt-1 leading-relaxed">{guidance.why}</p>
                          </section>
                        </div>

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <section className={`rounded border p-2 ${tableTone.section}`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                              How To Fix
                            </div>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {guidance.resolveSteps.map((step, stepIndex) => (
                                <li key={`${rowKey}-resolve-${stepIndex}`}>{step}</li>
                              ))}
                            </ul>
                          </section>
                          <section className={`rounded border p-2 ${tableTone.section}`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                              Example Evidence
                            </div>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {guidance.evidenceExamples.map((example, exampleIndex) => (
                                <li key={`${rowKey}-evidence-${exampleIndex}`}>{example}</li>
                              ))}
                            </ul>
                          </section>
                        </div>

                        <div className={`mt-2 rounded border p-2 ${tableTone.section}`}>
                          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                            Current Evidence In This Run
                          </div>
                          <div className="mt-1 text-[10px]">
                            <span className="font-semibold">Source: </span>
                            {rule.source}
                          </div>
                          <div className="mt-1 text-[10px] leading-relaxed">
                            <span className="font-semibold">Observed: </span>
                            {rule.explanation}
                          </div>
                          <div className="mt-1 text-[10px] leading-relaxed">
                            <span className="font-semibold">Last timestamp: </span>
                            {displayLastTimestamp}
                          </div>
                          {isHaFailoverRule ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                className="text-[10px] font-semibold text-sky-200 underline decoration-dotted underline-offset-2 hover:text-sky-100"
                                onClick={toggleSequenceDetails}
                              >
                                {showSequence ? 'Hide detected sequence' : 'View detected sequence'}
                              </button>
                            </div>
                          ) : null}
                          {isHaFailoverRule && showSequence ? (
                            ruleSequences.length ? (
                              <div className="mt-2 space-y-2">
                                <div className={`rounded border p-2 ${tableTone.section}`}>
                                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                                    Source coverage
                                  </div>
                                  <div className="mt-2 overflow-x-auto">
                                    <table className="min-w-full border-collapse text-[10px]">
                                      <thead>
                                        <tr className="text-left text-slate-300">
                                          <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                            Source
                                          </th>
                                          <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                            Cluster
                                          </th>
                                          <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                            Status
                                          </th>
                                          <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                            Last event
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {ruleSequences.map((sequenceItem, sequenceIndex) => {
                                          const sequenceItemEvents = sequenceDisplayEvents(sequenceItem)
                                          const sequenceItemLastEventMs =
                                            sequenceItemEvents.length > 0
                                              ? sequenceItemEvents.reduce<number | null>(
                                                  (latest, event) =>
                                                    event.timestampMs !== null && (latest === null || event.timestampMs > latest)
                                                      ? event.timestampMs
                                                      : latest,
                                                  null,
                                                )
                                              : null
                                          return (
                                            <tr
                                              key={`${sequenceKey}-source-summary-${sequenceIndex}-${sequenceItem.source}`}
                                              className="text-slate-200"
                                            >
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {sequenceItem.source}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {sequenceItem.cluster}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {sequenceItem.status}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {sequenceItemLastEventMs !== null ? formatTimestampFromMs(sequenceItemLastEventMs) : 'n/a'}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                <div className={`rounded border p-2 ${tableTone.section}`}>
                                  <div className="flex flex-wrap gap-1 text-[10px]">
                                    {HA_SEQUENCE_STEP_LABELS.map(([key, label]) => {
                                      const active = ruleSequences.some((sequenceItem) => Boolean(sequenceItem.steps[key]))
                                      return (
                                        <span
                                          key={`${sequenceKey}-step-${key}`}
                                          className={
                                            active
                                              ? 'rounded border border-emerald-700/80 bg-emerald-900/35 px-1.5 py-0.5 text-emerald-100'
                                              : 'rounded border border-slate-700/70 bg-slate-900/40 px-1.5 py-0.5 text-slate-300'
                                          }
                                        >
                                          {label}
                                        </span>
                                      )
                                    })}
                                  </div>
                                  {ruleSequenceEvents.length ? (
                                    <div className="mt-2 overflow-x-auto">
                                      <table className="min-w-full border-collapse text-[10px]">
                                        <thead>
                                          <tr className="text-left text-slate-300">
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Source
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Cluster
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Timestamp
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Type
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Severity
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Event
                                            </th>
                                            <th className="border border-slate-700/60 bg-slate-900/60 px-1.5 py-1">
                                              Description
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ruleSequenceEvents.map((event, eventIndex) => (
                                            <tr
                                              key={`${sequenceKey}-event-${event.source}-${event.cluster}-${eventIndex}`}
                                              className="text-slate-200"
                                            >
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.source}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.cluster}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {eventTimestampLabel(event)}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.eventType}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.severity}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.event}
                                              </td>
                                              <td className="border border-slate-700/50 bg-slate-950/30 px-1.5 py-1 align-top">
                                                {event.description}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[10px] text-slate-300">
                                      No detailed events available for this sequence.
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className={`mt-2 rounded border p-2 text-[10px] ${tableTone.section}`}>
                                No HA recovery sequence was found in the current snapshot. Refresh connector data and
                                verify Palo Alto HA system logs are included.
                              </div>
                            )
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function resilienceSummaryBlock(
  title: string,
  playbook?: ResiliencePlaybookSummary,
  score?: number,
  weight?: number,
  focus: 'all' | 'backup_replication' = 'all',
  haSequences?: HaRecoverySequenceDetail[],
) {
  if (!playbook) return null
  const metrics = playbook.metrics ?? {}
  const layerSummaryAll = buildResilienceLayers(playbook.rules, playbook.per_connector, playbook.metrics, haSequences)
  const layerSummary =
    focus === 'backup_replication'
      ? layerSummaryAll.filter((layer) => layer.layer === 'Storage' || layer.layer === 'Data protection')
      : layerSummaryAll
  const rulesCount = layerSummary.reduce((total, layer) => {
    const fallbackTotal = layer.compliantRules.length + layer.nonCompliantRules.length
    return total + (layer.total > 0 ? layer.total : fallbackTotal)
  }, 0)
  if (!rulesCount) return null
  const compliantCount = layerSummary.reduce((total, layer) => total + layer.compliantRules.length, 0)
  const failureCount = layerSummary.reduce((total, layer) => total + layer.nonCompliantRules.length, 0)
  const scoreValue = typeof score === 'number' ? score : playbook.score
  const weightValue = typeof weight === 'number' ? weight : playbook.weight
  const displayScore = typeof scoreValue === 'number' ? scoreValue : 'n/a'
  return (
    <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-200">
      <div className="mb-1 font-semibold text-slate-50">{title}</div>
      <div className="flex items-center justify-between text-[11px] text-slate-300">
        <span>Score {displayScore}/100</span>
        <span>Weight {formatRatio(weightValue)}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <div>
          Compliant elements: {compliantCount}/{rulesCount}
        </div>
        <div>
          Failing rules: {failureCount}/{rulesCount}
        </div>
        {focus === 'backup_replication' ? (
          <>
            <div>Backup signals: {metrics.signals_backup ?? 0}</div>
            <div>Replication signals: {metrics.signals_replication ?? 0}</div>
            <div>Replication OK: {formatRatio(metrics.assets_replication_ok_ratio)}</div>
            <div>RPO p90: {formatMinutesAsHours(metrics.assets_rpo_minutes_p90)}</div>
          </>
        ) : (
          <>
            <div>Signals: {metrics.signals_total ?? 0}</div>
            <div>Recovery jobs: {metrics.recovery_jobs_total ?? 0}</div>
            <div>HA coverage: {formatRatio(metrics.assets_ha_enabled_ratio)}</div>
            <div>Replication OK: {formatRatio(metrics.assets_replication_ok_ratio)}</div>
            <div>RPO p90: {formatMinutesAsHours(metrics.assets_rpo_minutes_p90)}</div>
          </>
        )}
      </div>
      {layerSummary.length ? (
        <div className="mt-2 space-y-1 text-[11px] text-slate-300">
          {layerSummary.map((layer) => {
            const displayPassed = Number.isFinite(layer.passed) ? layer.passed : layer.compliantRules.length
            const displayTotal =
              Number.isFinite(layer.total) && layer.total > 0
                ? layer.total
                : layer.compliantRules.length + layer.nonCompliantRules.length
            return (
            <details key={layer.layer} className="rounded bg-[#13233a]/80 p-1.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">{layer.layer}</span>
                <span className="shrink-0 rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-100">
                  {displayPassed}/{displayTotal}
                </span>
              </summary>
              <div className="mt-1 border-t border-slate-700/60 pt-1">
                <div className="mt-1 text-[10px] text-slate-300">Compliant rules</div>
                <ResilienceRuleTable
                  rules={layer.compliantRules}
                  tone="pass"
                  rowKeyPrefix={`summary-pass-${layer.layer}`}
                  haSequences={haSequences}
                />
                <div className="mt-1 text-[10px] text-slate-300">Non-compliant rules</div>
                <ResilienceRuleTable
                  rules={layer.nonCompliantRules}
                  tone="fail"
                  rowKeyPrefix={`summary-fail-${layer.layer}`}
                  haSequences={haSequences}
                />
              </div>
            </details>
            )
          })}
        </div>
      ) : null}
      {playbook.policy_version ? (
        <div className="mt-1 text-[11px] text-slate-400">Playbook {playbook.policy_version}</div>
      ) : null}
    </div>
  )
}

function resilienceLayersCompactBlock(
  playbook?: ResiliencePlaybookSummary,
  haSequences?: HaRecoverySequenceDetail[],
) {
  if (!playbook?.rules?.length) return null
  const layers = buildResilienceLayers(playbook.rules, playbook.per_connector, playbook.metrics, haSequences)
  if (!layers.length) return null
  return (
    <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-200">
      <div className="mb-1 font-semibold text-slate-50">Compliance layers</div>
      <div className="space-y-1 text-[11px] text-slate-300">
        {layers.map((layer) => {
          const displayPassed = Number.isFinite(layer.passed) ? layer.passed : layer.compliantRules.length
          const displayTotal =
            Number.isFinite(layer.total) && layer.total > 0
              ? layer.total
              : layer.compliantRules.length + layer.nonCompliantRules.length
          const coverageClass =
            displayTotal > 0 && displayPassed === displayTotal
              ? 'bg-emerald-900/40 text-emerald-100'
              : displayPassed > 0
                ? 'bg-amber-900/30 text-amber-100'
                : 'bg-rose-900/35 text-rose-100'
          return (
            <details key={`compact-layer-${layer.layer}`} className="rounded bg-[#13233a]/80 p-1.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">{layer.layer}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${coverageClass}`}>
                  {displayPassed}/{displayTotal}
                </span>
              </summary>
              <div className="mt-1 border-t border-slate-700/60 pt-1">
                <div className="mt-1 text-[10px] text-slate-300">Compliant rules</div>
                <ResilienceRuleTable
                  rules={layer.compliantRules}
                  tone="pass"
                  rowKeyPrefix={`compact-pass-${layer.layer}`}
                  haSequences={haSequences}
                />
                <div className="mt-1 text-[10px] text-slate-300">Non-compliant rules</div>
                <ResilienceRuleTable
                  rules={layer.nonCompliantRules}
                  tone="fail"
                  rowKeyPrefix={`compact-fail-${layer.layer}`}
                  haSequences={haSequences}
                />
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

type DoraControlsResponse = {
  framework: string
  score: number
  controls_score?: number
  resilience_score?: number
  resilience_weight?: number
  policy_version?: string | null
  controls?: Record<string, GenericControlStatus>
  per_connector?: Record<string, Record<string, { status: string }>>
  resilience_playbook?: ResiliencePlaybookSummary
}

export function DashboardPage() {
  const [showGuide, setShowGuide] = useState(true)
  const [historyLimit, setHistoryLimit] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_HISTORY_LIMIT
    try {
      const stored = Number(window.localStorage.getItem(HISTORY_STORAGE_KEY))
      return HISTORY_OPTIONS.includes(stored) ? stored : DEFAULT_HISTORY_LIMIT
    } catch {
      return DEFAULT_HISTORY_LIMIT
    }
  })
  const [runs, setRuns] = useState<RunsResponse | null>(null)
  const [scores, setScores] = useState<ScoreHistoryResponse | null>(null)
  const [frameworks, setFrameworks] = useState<FrameworkListResponse | null>(null)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryResponse | null>(null)
  const [frameworkTrend, setFrameworkTrend] = useState<FrameworkTrendResponse | null>(null)
  const [trendFindingsByRun, setTrendFindingsByRun] = useState<Record<string, FindingsResponse>>({})
  const [trendFindingsRun, setTrendFindingsRun] = useState<string | null>(null)
  const [trendFindingsLoading, setTrendFindingsLoading] = useState<string | null>(null)
  const [trendFindingsError, setTrendFindingsError] = useState<ApiError | null>(null)
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatus[] | null>(() => {
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
  const [connectorSnapshot, setConnectorSnapshot] = useState<ConnectorSnapshotResponse | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [infraBenchmark, setInfraBenchmark] = useState<InfraBenchmarkResponse | null>(null)
  const [execKpis, setExecKpis] = useState<ExecKpiResponse | null>(null)
  const [doraMetrics, setDoraMetrics] = useState<DoraMetricsResponse | null>(null)
  const [doraControls, setDoraControls] = useState<DoraControlsResponse | null>(null)
  const [nis2Operational, setNis2Operational] = useState<Nis2OperationalMetricsResponse | null>(null)
  const [nis2Controls, setNis2Controls] = useState<Nis2ControlsResponse | null>(null)
  const [isoOperational, setIsoOperational] = useState<IsoOperationalMetricsResponse | null>(null)
  const [isoControls, setIsoControls] = useState<IsoControlsResponse | null>(null)
  const [soc2Operational, setSoc2Operational] = useState<Soc2OperationalMetricsResponse | null>(null)
  const [soc2Controls, setSoc2Controls] = useState<Soc2ControlsResponse | null>(null)
  const [gxpOperational, setGxpOperational] = useState<GxpOperationalMetricsResponse | null>(null)
  const [gxpControls, setGxpControls] = useState<GxpControlsResponse | null>(null)
  const [vmResilienceDetail, setVmResilienceDetail] = useState<'replicated' | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set())
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const summaryCacheKey = `dashboard_summary_cache_v1_${historyLimit}`
  const snapshotInFlightRef = useRef(false)
  const statusesInFlightRef = useRef(false)

  const loadCachedSummary = () => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(summaryCacheKey)
      if (!raw) return null
      return JSON.parse(raw) as DashboardSummaryResponse
    } catch {
      return null
    }
  }

  const storeCachedSummary = (summary: DashboardSummaryResponse) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(summaryCacheKey, JSON.stringify(summary))
    } catch {
      // ignore storage failures
    }
  }

  const applySummary = (summary: DashboardSummaryResponse) => {
    setDashboardSummary(summary)
    setRuns({
      items: summary.latest_run ? [summary.latest_run] : [],
      count: summary.run_count ?? 0,
    })
    setScores({ items: summary.score_history ?? [] })
    const frameworksData = summary.frameworks ?? []
    setFrameworks(frameworksData)
    const cachedTrend =
      frameworksData.length && summary.framework_trend
        ? summary.framework_trend[frameworksData[0]] ?? null
        : null
    if (cachedTrend) {
      setFrameworkTrend({ framework: frameworksData[0], points: cachedTrend })
    }
  }

  const loadSummary = async (force: boolean, cancelled: boolean) => {
    setError(null)
    setSummaryLoading(true)
    setRefreshStatus(null)
    try {
      const cacheBust = force ? `&_ts=${Date.now()}` : ''
      const summary = await apiJson<DashboardSummaryResponse>(
        `/analytics/dashboard/summary?history_limit=${historyLimit}&lite=1${cacheBust}`,
      )
      if (cancelled) return
      applySummary(summary)
      storeCachedSummary(summary)
    } catch (err) {
      if (!cancelled) setError(err as ApiError)
    } finally {
      if (!cancelled) setSummaryLoading(false)
    }
    }

  const triggerRunAndRefresh = async () => {
    setSummaryLoading(true)
    setRefreshStatus('Starting run...')
    try {
      const job = await apiJson<{ job_id: string; status?: string }>('/generate-report/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets: [],
          dependencies: [],
          patch_statuses: [],
          identity_exposures: [],
        }),
      })
      const jobId = job.job_id
      let attempts = 0
      while (attempts < 20) {
        attempts += 1
        setRefreshStatus(`Run queued... (${attempts}/20)`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const status = await apiJson<{ status?: string }>(`/worker/report/${encodeURIComponent(jobId)}`)
          if (status.status && !['queued', 'running'].includes(status.status)) {
            break
          }
        } catch {
          // ignore polling failures
        }
      }
    } catch (err) {
      setError(err as ApiError)
    } finally {
      await loadSummary(true, false)
      await Promise.all([loadConnectorSnapshot(true), loadConnectorStatuses(), loadInfraBenchmark(true)])
      setSummaryLoading(false)
      setRefreshStatus(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, String(historyLimit))
      } catch {
        // ignore storage failures
      }
    }
    const cached = loadCachedSummary()
    if (cached) {
      applySummary(cached)
    }
    async function load() {
      await loadSummary(false, cancelled)
    }
    void load()
    return () => {
      cancelled = true
    }
    // The summary loader intentionally follows historyLimit only; refresh helpers are recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLimit])

  const latestRun = runs?.items?.[0]
  const visibleRunCount = scores?.items?.length ?? 0
  const frameworkCount = frameworks?.length ?? 0
  const trendValues = useMemo(() => {
    return (scores?.items ?? [])
      .slice(-historyLimit)
      .map((item) => item.risk_score)
      .filter((value): value is number => typeof value === 'number')
  }, [scores, historyLimit])

  const execTrendValues = useMemo(() => {
    return (execKpis?.trend ?? [])
      .map((item) => item.infra_score)
      .filter((value): value is number => typeof value === 'number')
  }, [execKpis])

  const execLatest = execKpis?.current ?? (execKpis?.trend?.length ? execKpis.trend[execKpis.trend.length - 1] : null)
  const summaryFrameworkScores = dashboardSummary?.framework_scores ?? {}
  const resolveFrameworkScore = (keys: string[]) => {
    for (const key of keys) {
      const score = summaryFrameworkScores[key]?.score
      if (typeof score === 'number') return score
    }
    return undefined
  }
  const doraOperational = useMemo(() => {
    return doraMetrics ? normalizeDoraOperational(doraMetrics) : null
  }, [doraMetrics])
  const nis2OperationalNormalized = useMemo(() => {
    return nis2Operational ? normalizeNis2Operational(nis2Operational) : null
  }, [nis2Operational])
  const isoOperationalNormalized = useMemo(() => {
    return isoOperational ? normalizeIsoOperational(isoOperational) : null
  }, [isoOperational])
  const soc2OperationalNormalized = useMemo(() => {
    return soc2Operational ? normalizeSoc2Operational(soc2Operational) : null
  }, [soc2Operational])
  const gxpOperationalNormalized = useMemo(() => {
    return gxpOperational ? normalizeGxpOperational(gxpOperational) : null
  }, [gxpOperational])

  const sharedResilienceCoverage = useMemo(() => {
    const candidates = [
      {
        key: 'dora',
        label: 'DORA',
        playbook: doraControls?.resilience_playbook,
        score: doraControls?.resilience_score,
        weight: doraControls?.resilience_weight,
      },
      {
        key: 'nis2',
        label: 'NIS2',
        playbook: nis2Controls?.resilience_playbook,
        score: nis2Controls?.resilience_score,
        weight: nis2Controls?.resilience_weight,
      },
      {
        key: 'iso',
        label: 'ISO 27001',
        playbook: isoControls?.resilience_playbook,
        score: isoControls?.resilience_score,
        weight: isoControls?.resilience_weight,
      },
      {
        key: 'soc2',
        label: 'SOC 2',
        playbook: soc2Controls?.resilience_playbook,
        score: soc2Controls?.resilience_score,
        weight: soc2Controls?.resilience_weight,
      },
      {
        key: 'gxp',
        label: 'GxP',
        playbook: gxpControls?.resilience_playbook,
        score: gxpControls?.resilience_score,
        weight: gxpControls?.resilience_weight,
      },
    ]
    for (const key of ['dora', 'nis2', 'iso', 'soc2', 'gxp']) {
      if (!expandedCards.has(key)) continue
      const candidate = candidates.find((item) => item.key === key)
      if (candidate?.playbook?.rules?.length) return candidate
    }
    for (const candidate of candidates) {
      if (candidate.playbook?.rules?.length) return candidate
    }
    for (const candidate of candidates) {
      if (candidate.playbook) return candidate
    }
    return null
  }, [doraControls, nis2Controls, isoControls, soc2Controls, gxpControls, expandedCards])

  const connectorHealth = useMemo(() => {
    return dashboardSummary?.connector_health ?? { ok: 0, warn: 0, error: 0, unknown: 0 }
  }, [dashboardSummary])

  const riskDrivers = dashboardSummary?.risk_drivers ?? null
  const riskSeverityCounts = riskDrivers?.by_severity ?? {}
  const riskTopSources = riskDrivers?.top_sources ?? []
  const riskOtherSources = riskDrivers?.other_sources ?? 0

  const connectorDetails = useMemo(() => {
    const sla = dashboardSummary?.connector_sla ?? {}
    const statusMap = new Map<string, ConnectorStatus>()
    for (const connector of connectorStatuses ?? []) {
      statusMap.set(connector.name, connector)
    }
    const entries = Object.entries(sla)
      .map(([name, status]) => {
        const record = status && typeof status === 'object' ? (status as Record<string, unknown>) : {}
        const overallOk = typeof record.overall_ok === 'boolean' ? record.overall_ok : undefined
        const freshnessOk = typeof record.freshness_ok === 'boolean' ? record.freshness_ok : undefined
        const provenanceOk = typeof record.provenance_ok === 'boolean' ? record.provenance_ok : undefined
        const ageHours = typeof record.age_hours === 'number' ? record.age_hours : undefined
        const lastSuccess = typeof record.last_success === 'string' ? record.last_success : undefined
        const haConfigured =
          typeof record.ha_configured === 'boolean' ? (record.ha_configured as boolean) : undefined
        const haStatus = typeof record.ha_status === 'string' ? (record.ha_status as string) : undefined
        const connectorStatus = statusMap.get(name)
        const remoteSystems = connectorStatus?.remote_systems ?? []
        const replicationVolumes = connectorStatus?.replication_volumes ?? []
        const replicationVolumeGroups = connectorStatus?.replication_volume_groups ?? []
        return {
          name,
          overallOk,
          freshnessOk,
          provenanceOk,
          ageHours,
          lastSuccess,
          haConfigured,
          haStatus,
          remoteSystems,
          replicationVolumes,
          replicationVolumeGroups,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      entries,
      healthy: entries.filter((entry) => entry.overallOk === true),
      issues: entries.filter((entry) => entry.overallOk !== true),
    }
  }, [dashboardSummary, connectorStatuses])

  const liveHaRecoverySequences = useMemo(() => extractHaRecoverySequences(connectorSnapshot), [connectorSnapshot])
  const persistedHaRecoverySequences = useMemo(
    () =>
      extractHaRecoverySequencesFromPlaybooks([
        doraControls?.resilience_playbook,
        nis2Controls?.resilience_playbook,
        isoControls?.resilience_playbook,
        soc2Controls?.resilience_playbook,
        gxpControls?.resilience_playbook,
      ]),
    [doraControls, nis2Controls, isoControls, soc2Controls, gxpControls],
  )

  const haRecoverySequences = useMemo(() => {
    return mergeHaRecoverySequences(liveHaRecoverySequences, persistedHaRecoverySequences)
  }, [liveHaRecoverySequences, persistedHaRecoverySequences])

  const vmResilienceSummary = useMemo(() => {
    const assets = connectorSnapshot?.snapshot?.assets ?? []
    const vcenterVms = assets.filter((asset) => {
      if (!asset || typeof asset !== 'object') return false
      const source = String(asset.source ?? '')
      return source.startsWith('vcenter') && asset.asset_type === 'vm'
    })
    const powerstoreDerivedVms = assets.filter((asset) => {
      if (!asset || typeof asset !== 'object') return false
      const source = String(asset.source ?? '')
      return (
        source.startsWith('powerstore') &&
        asset.asset_type === 'vm' &&
        Boolean(asset.metadata?.derived_from_asset_id)
      )
    })

    const normalizeVmName = (value?: string | null) => {
      const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
      return normalized || null
    }
    const vmNameAliases = (value?: string | null) => {
      const normalized = normalizeVmName(value)
      if (!normalized) return []
      const aliases = new Set<string>([normalized])
      const shortName = normalized.split('.')[0]
      if (shortName && shortName !== normalized) aliases.add(shortName)
      const compact = normalized.replace(/[^a-z0-9]/g, '')
      if (compact) aliases.add(compact)
      const shortCompact = shortName.replace(/[^a-z0-9]/g, '')
      if (shortCompact) aliases.add(shortCompact)
      return Array.from(aliases)
    }

    const toTimestamp = (value?: string | null) => {
      if (!value) return Number.NEGATIVE_INFINITY
      const parsed = Date.parse(value)
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
    }

    const replicationStateRank = (value?: string | null) => {
      const normalized = String(value ?? '').trim().toLowerCase()
      if (['error', 'failed', 'critical', 'down', 'fault'].includes(normalized)) return 0
      if (['degraded', 'warning', 'warn', 'partial', 'major', 'lagging'].includes(normalized)) return 1
      if (
        [
          'ok',
          'healthy',
          'enabled',
          'success',
          'synced',
          'synchronized',
          'active',
          'normal',
          'up',
          'running',
          'ready',
        ].includes(normalized)
      ) {
        return 2
      }
      return 3
    }
    const mergeReplicationState = (a?: string | null, b?: string | null) => {
      const aRank = replicationStateRank(a)
      const bRank = replicationStateRank(b)
      if (aRank <= bRank) return a ?? b ?? null
      return b ?? a ?? null
    }
    const isHealthyReplicationState = (value?: string | null) => {
      return replicationStateRank(value) === 2
    }

    const mergeBackup = (current?: ResilienceBackup | null, incoming?: ResilienceBackup | null) => {
      if (!incoming) return current
      if (!current) return { ...incoming }
      const currentTs = toTimestamp(current.last_success)
      const incomingTs = toTimestamp(incoming.last_success)
      const preferred = incomingTs >= currentTs ? incoming : current
      const secondary = preferred === incoming ? current : incoming
      return {
        ...secondary,
        ...preferred,
        last_success: preferred.last_success ?? secondary.last_success ?? null,
        status: preferred.status ?? secondary.status ?? null,
        job_name: preferred.job_name ?? secondary.job_name ?? null,
        source: preferred.source ?? secondary.source ?? null,
      }
    }

    const mergeReplication = (current?: ResilienceReplication | null, incoming?: ResilienceReplication | null) => {
      if (!incoming) return current
      if (!current) {
        return {
          ...incoming,
          volumes: incoming.volumes ? [...incoming.volumes] : undefined,
          sources: incoming.sources ? Array.from(new Set(incoming.sources.filter(Boolean))) : undefined,
        }
      }
      const volumes: { id?: string | null; name?: string | null; status?: string | null; observed_at?: string | null }[] = []
      const seen = new Map<string, number>()
      const addVolume = (
        volume: { id?: string | null; name?: string | null; status?: string | null; observed_at?: string | null },
        index: number,
        origin: string,
      ) => {
        const id = String(volume.id ?? '').trim()
        const name = String(volume.name ?? '').trim()
        const key = id || name ? `${id}|${name}` : `${origin}:${index}`
        const existingIndex = seen.get(key)
        if (existingIndex !== undefined) {
          const existing = volumes[existingIndex]
          existing.status = mergeReplicationState(existing.status, volume.status)
          const currentObservedAt = existing.observed_at
          const incomingObservedAt = volume.observed_at ?? null
          if (!currentObservedAt || toTimestamp(incomingObservedAt) > toTimestamp(currentObservedAt)) {
            existing.observed_at = incomingObservedAt
          }
          return
        }
        seen.set(key, volumes.length)
        volumes.push({
          id: id || undefined,
          name: name || undefined,
          status: volume.status ?? null,
          observed_at: volume.observed_at ?? null,
        })
      }
      ;(current.volumes ?? []).forEach((volume, index) => addVolume(volume, index, 'current'))
      ;(incoming.volumes ?? []).forEach((volume, index) => addVolume(volume, index, 'incoming'))
      const sourceSet = new Set<string>()
      for (const source of [...(current.sources ?? []), ...(incoming.sources ?? [])]) {
        const cleaned = String(source ?? '').trim()
        if (cleaned) sourceSet.add(cleaned)
      }
      return {
        ...current,
        ...incoming,
        state: mergeReplicationState(current.state, incoming.state),
        volumes: volumes.length ? volumes : undefined,
        sources: sourceSet.size ? Array.from(sourceSet) : undefined,
      }
    }

    const windowMs = 24 * 60 * 60 * 1000
    const now = Date.now()
    const isRecent = (value?: string | null) => {
      if (!value) return false
      const parsed = Date.parse(value)
      return Number.isFinite(parsed) && now - parsed <= windowMs
    }

    const vmKeyFromAsset = (asset: SnapshotAsset) => {
      const source = String(asset.source ?? '').trim()
      const assetId = String(asset.asset_id ?? '').trim()
      if (source.startsWith('vcenter')) return `${source}:${assetId}`
      if (source.startsWith('powerstore')) {
        const originSource = String(asset.metadata?.derived_from_source ?? '').trim()
        const originAssetId = String(asset.metadata?.derived_from_asset_id ?? '').trim()
        if (originSource && originAssetId) return `${originSource}:${originAssetId}`
      }
      return `${source}:${assetId}`
    }

    const extractAssetDatastores = (asset: SnapshotAsset) => {
      const fromMetadata = asset.metadata?.datastores
      if (Array.isArray(fromMetadata)) {
        return fromMetadata
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      }
      const fromHardware = asset.metadata?.hardware?.datastores
      if (Array.isArray(fromHardware)) {
        return fromHardware
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      }
      return []
    }
    const normalizeLookup = (value?: string | null) => String(value ?? '').trim().toLowerCase()

    type VmResilienceRecord = {
      name: string
      backup?: ResilienceBackup | null
      replication?: ResilienceReplication | null
      fallbackVolumeCount: number
      datastores: string[]
    }
    const aliasToVmKey = new Map<string, string>()
    const mergedVms = new Map<string, VmResilienceRecord>()
    const vcenterDatastoresByAlias = new Map<string, string[]>()

    const indexAliases = (key: string, name?: string | null) => {
      for (const alias of vmNameAliases(name)) {
        if (!aliasToVmKey.has(alias)) aliasToVmKey.set(alias, key)
      }
    }
    const resolveVmKeyFromName = (name?: string | null) => {
      for (const alias of vmNameAliases(name)) {
        const key = aliasToVmKey.get(alias)
        if (key) return key
      }
      return null
    }
    const ensureVmRecord = (key: string, name?: string | null): VmResilienceRecord => {
      const label = String(name ?? key).trim() || key
      const existing = mergedVms.get(key)
      if (existing) {
        if ((!existing.name || existing.name === key) && label) existing.name = label
        indexAliases(key, label)
        return existing
      }
      const created: VmResilienceRecord = {
        name: label,
        fallbackVolumeCount: 0,
        datastores: [],
      }
      mergedVms.set(key, created)
      indexAliases(key, label)
      return created
    }

    const mergeDatastores = (current: string[], incoming: string[]) => {
      const seen = new Set<string>(current.map((value) => normalizeLookup(value)))
      const merged = [...current]
      for (const item of incoming) {
        const normalized = normalizeLookup(item)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        merged.push(item)
      }
      return merged
    }

    for (const vm of vcenterVms) {
      const name = String(vm.name ?? vm.asset_id ?? '').trim()
      if (!name) continue
      const datastores = extractAssetDatastores(vm)
      if (!datastores.length) continue
      for (const alias of vmNameAliases(name)) {
        const existing = vcenterDatastoresByAlias.get(alias) ?? []
        vcenterDatastoresByAlias.set(alias, mergeDatastores(existing, datastores))
      }
    }

    for (const vm of [...vcenterVms, ...powerstoreDerivedVms]) {
      const key = vmKeyFromAsset(vm)
      const name = String(vm.name ?? vm.asset_id ?? key).trim() || key
      const current = ensureVmRecord(key, name)
      current.datastores = mergeDatastores(current.datastores, extractAssetDatastores(vm))
      const backup = vm.metadata?.resilience?.backup
      const replication = vm.metadata?.resilience?.replication
      if (backup) current.backup = mergeBackup(current.backup, backup)
      if (replication) current.replication = mergeReplication(current.replication, replication)
      const observedVolumeCount = replication?.volumes?.length ?? 0
      if (observedVolumeCount > current.fallbackVolumeCount) {
        current.fallbackVolumeCount = observedVolumeCount
      }
      mergedVms.set(key, current)
    }

    for (const connector of connectorStatuses ?? []) {
      const connectorName = String(connector.name ?? '').trim() || undefined
      for (const entry of connector.vm_last_backups ?? []) {
        const name = String(entry.name ?? '').trim()
        if (!name) continue
        const resolvedKey = resolveVmKeyFromName(name)
        const key = resolvedKey ?? `status:${vmNameAliases(name)[0] ?? name.toLowerCase()}`
        const current = ensureVmRecord(key, name)
        current.backup = mergeBackup(current.backup, {
          last_success: entry.last_success ?? null,
          status: entry.status ?? null,
          job_name: entry.job_name ?? null,
          source: connectorName ?? null,
        })
        mergedVms.set(key, current)
      }
      for (const entry of connector.storage_vms ?? []) {
        const name = String(entry.name ?? entry.id ?? '').trim()
        if (!name) continue
        const resolvedKey = resolveVmKeyFromName(name)
        const key = resolvedKey ?? `status:${vmNameAliases(name)[0] ?? name.toLowerCase()}`
        const current = ensureVmRecord(key, name)
        const volumeCountRaw = Number(entry.volume_count ?? 0)
        const volumeCount = Number.isFinite(volumeCountRaw) ? Math.max(0, Math.trunc(volumeCountRaw)) : 0
        if (volumeCount > current.fallbackVolumeCount) {
          current.fallbackVolumeCount = volumeCount
        }
        const sources = [connectorName, entry.derived_from_source].filter(
          (value): value is string => Boolean(value && String(value).trim()),
        )
        const entryReplicationVolumes = (entry.replication_volumes ?? []).reduce<
          { id?: string; name?: string; status?: string }[]
        >((acc, volume) => {
          const id = String(volume.id ?? '').trim()
          const volumeName = String(volume.name ?? '').trim()
          if (!id && !volumeName) return acc
          const status = String(volume.status ?? volume.state ?? '').trim()
          acc.push({
            id: id || undefined,
            name: volumeName || undefined,
            status: status || undefined,
          })
          return acc
        }, [])
        const datastoreFallback = mergeDatastores(
          current.datastores,
          vmNameAliases(name).flatMap((alias) => vcenterDatastoresByAlias.get(alias) ?? []),
        )
        current.datastores = datastoreFallback
        const existingVolumeCount = current.replication?.volumes?.length ?? 0
        const datastoreVolumes =
          existingVolumeCount === 0 && entryReplicationVolumes.length === 0 && datastoreFallback.length
            ? datastoreFallback.map((datastore) => ({ name: datastore }))
            : undefined
        current.replication = mergeReplication(current.replication, {
          state: entry.replication_state ?? 'unknown',
          sources: sources.length ? sources : undefined,
          volumes: entryReplicationVolumes.length ? entryReplicationVolumes : datastoreVolumes,
        })
        mergedVms.set(key, current)
      }
    }

    const vmRecords = Array.from(mergedVms.values())
    const canonicalVolumeName = (value?: string | null) => {
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
    const volumeStatusBySource = new Map<string, { byId: Map<string, string>; byName: Map<string, string> }>()
    const addIndexedStatus = (index: Map<string, string>, key: string, status: string) => {
      if (!key) return
      const existing = index.get(key)
      if (!existing) {
        index.set(key, status)
        return
      }
      const existingRank = replicationStateRank(existing)
      const incomingRank = replicationStateRank(status)
      if (incomingRank < existingRank) index.set(key, status)
    }
    for (const connector of connectorStatuses ?? []) {
      const source = String(connector.name ?? '').trim()
      if (!source) continue
      const byId = new Map<string, string>()
      const byName = new Map<string, string>()
      const allVolumes: ReplicationVolumeStatus[] = [
        ...(connector.replication_volumes ?? []),
        ...((connector.replication_volume_groups ?? []).flatMap((group) => group.volumes ?? [])),
      ]
      for (const volume of allVolumes) {
        const status = String(volume.status ?? '').trim()
        if (!status) continue
        const idKey = normalizeLookup(volume.id)
        const nameKey = normalizeLookup(volume.name)
        const canonicalNameKey = canonicalVolumeName(volume.name)
        if (idKey) addIndexedStatus(byId, idKey, status)
        if (nameKey) addIndexedStatus(byName, nameKey, status)
        if (canonicalNameKey && canonicalNameKey !== nameKey) addIndexedStatus(byName, canonicalNameKey, status)
      }
      if (byId.size || byName.size) volumeStatusBySource.set(source, { byId, byName })
    }

    const resolveVolumeStatus = (
      vm: VmResilienceRecord,
      volume: { id?: string | null; name?: string | null; status?: string | null; observed_at?: string | null },
    ) => {
      const explicit = String(volume.status ?? '').trim()
      if (explicit && explicit.toLowerCase() !== 'unknown') return explicit
      const idKey = normalizeLookup(volume.id)
      const nameKey = normalizeLookup(volume.name)
      const canonicalNameKey = canonicalVolumeName(volume.name)
      const matchFromIndex = (index: { byId: Map<string, string>; byName: Map<string, string> }) =>
        (idKey && index.byId.get(idKey)) ||
        (nameKey && index.byName.get(nameKey)) ||
        (canonicalNameKey && index.byName.get(canonicalNameKey)) ||
        undefined
      const sources = (vm.replication?.sources ?? []).map((value) => String(value ?? '').trim()).filter(Boolean)
      for (const source of sources) {
        const index = volumeStatusBySource.get(source)
        if (!index) continue
        const matched = matchFromIndex(index)
        if (matched) return matched
      }
      // Fallback for sparse source metadata: if status is unique across all sources, use it.
      const globalMatches = new Set<string>()
      for (const index of volumeStatusBySource.values()) {
        const matched = matchFromIndex(index)
        if (matched) globalMatches.add(matched)
      }
      if (globalMatches.size === 1) return Array.from(globalMatches)[0]
      return explicit || undefined
    }

    const volumeReplicationStateForVm = (vm: VmResilienceRecord) => {
      const volumes = vm.replication?.volumes ?? []
      if (!volumes.length) return String(vm.replication?.state ?? 'unknown')
      const statuses = volumes
        .map((volume) => resolveVolumeStatus(vm, volume))
        .filter((value): value is string => Boolean(value && String(value).trim()))
      if (!statuses.length) return String(vm.replication?.state ?? 'unknown')
      let selected = statuses[0]
      let selectedRank = replicationStateRank(selected)
      for (const status of statuses.slice(1)) {
        const rank = replicationStateRank(status)
        if (rank < selectedRank) {
          selected = status
          selectedRank = rank
        }
      }
      return selected
    }

    const withBackup = vmRecords.filter((vm) => vm.backup)
    const withReplication = vmRecords.filter((vm) => vm.replication)
    const withBoth = vmRecords.filter((vm) => vm.backup && vm.replication)
    const verified = vmRecords.filter((vm) => {
      const backup = vm.backup
      const replication = vm.replication
      if (!backup || !replication) return false
      if (!isRecent(backup.last_success)) return false
      if (!isHealthyReplicationState(replication.state)) return false
      const volumes = replication.volumes ?? []
      if (!volumes.length) return true
      const volumeTimestamps = volumes.map((volume) => volume.observed_at).filter(Boolean)
      if (!volumeTimestamps.length) return true
      return volumeTimestamps.some((value) => isRecent(value))
    })

    const knownVolumeLabels = new Set<string>()
    let mappedVolumes = 0
    let unknownVolumeLinks = 0
    for (const vm of vmRecords) {
      const volumes = vm.replication?.volumes ?? []
      const expectedCount = Math.max(volumes.length, vm.fallbackVolumeCount || 0)
      mappedVolumes += expectedCount
      for (const volume of volumes) {
        const label = String(volume.name ?? volume.id ?? '').trim()
        if (label) {
          knownVolumeLabels.add(label)
        } else {
          unknownVolumeLinks += 1
        }
      }
      const missingLabels = Math.max(0, expectedCount - volumes.length)
      unknownVolumeLinks += missingLabels
    }

    const missingBackup = vmRecords.length - withBackup.length
    const missingReplication = vmRecords.length - withReplication.length
    const sample = vmRecords.filter((vm) => vm.backup || vm.replication).slice(0, 6)
    const replicatedVms: VmResilienceListItem[] = withReplication
      .map((vm) => {
        const volumes = vm.replication?.volumes ?? []
        return {
          name: vm.name,
          replicationState: volumeReplicationStateForVm(vm),
          source: (vm.replication?.sources ?? []).filter(Boolean).join(', ') || 'n/a',
          volumeCount: Math.max(volumes.length, vm.fallbackVolumeCount || 0),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      total: vmRecords.length,
      withBackup: withBackup.length,
      withReplication: withReplication.length,
      withBoth: withBoth.length,
      verified: verified.length,
      mappedVolumes,
      uniqueVolumes: knownVolumeLabels.size + unknownVolumeLinks,
      volumeSample: Array.from(knownVolumeLabels).slice(0, 6),
      missingBackup,
      missingReplication,
      sample,
      replicatedVms,
    }
  }, [connectorSnapshot, connectorStatuses])

  useEffect(() => {
    if (vmResilienceDetail === 'replicated' && vmResilienceSummary.withReplication === 0) {
      setVmResilienceDetail(null)
    }
  }, [vmResilienceDetail, vmResilienceSummary.withReplication])

  const connectorIssueLabel = (entry: {
    name: string
    freshnessOk?: boolean
    provenanceOk?: boolean
    overallOk?: boolean
    ageHours?: number
    haConfigured?: boolean
    haStatus?: string
  }) => {
    const ignoreHa = entry.name.startsWith('powerstore')
    if (!ignoreHa) {
      if (entry.haConfigured === false) return 'HA not configured'
      if (entry.haStatus === 'unknown') return 'HA unknown'
      if (entry.haStatus === 'error') return 'HA error'
      if (entry.haStatus === 'degraded') return 'HA degraded'
    }
    if (entry.overallOk === true) return 'ok'
    if (entry.freshnessOk === false) {
      if (typeof entry.ageHours === 'number') {
        return `stale (${entry.ageHours}h)`
      }
      return 'no runs yet'
    }
    if (entry.provenanceOk === false) return 'no provenance'
    return 'needs attention'
  }

  const summarizeRemoteSystems = (systems: ReplicationRemoteSystemStatus[] | undefined) => {
    if (!systems || !systems.length) return null
    const items = systems.slice(0, 2).map((system) => {
      const name = system.name || system.id || 'remote'
      const modes = (system.replication_modes ?? []).filter(Boolean).join(', ') || 'unknown'
      const status = system.status || 'unknown'
      return `${name} (${modes}, ${status})`
    })
    const suffix = systems.length > 2 ? ` +${systems.length - 2}` : ''
    return `Remote systems: ${items.join(' | ')}${suffix}`
  }

  const summarizeReplicationVolumes = (volumes: ReplicationVolumeStatus[] | undefined) => {
    if (!volumes || !volumes.length) return null
    const items = volumes.slice(0, 2).map((volume) => {
      const name = volume.name || volume.id || 'volume'
      const status = volume.status || 'unknown'
      return `${name} (${status})`
    })
    const suffix = volumes.length > 2 ? ` +${volumes.length - 2}` : ''
    return `Replicated volumes: ${items.join(' | ')}${suffix}`
  }

  const replicationGroupModeLabel = (group: ReplicationVolumeGroupStatus) => {
    const mode = (group.replication_mode ?? '').toLowerCase()
    if (!mode || mode === 'unknown') return null
    if (mode === 'sync') return 'sync'
    if (mode === 'async') {
      const role = (group.replication_role ?? '').toLowerCase()
      if (role === 'source' || role === 'destination') return `async ${role}`
      if (role === 'mixed') return 'async mixed'
      return 'async'
    }
    return mode
  }

  const summarizeReplicationGroups = (
    groups: ReplicationVolumeGroupStatus[] | undefined,
    volumes: ReplicationVolumeStatus[] | undefined,
  ) => {
    if (groups && groups.length) {
      const items = groups.slice(0, 2).map((group) => {
        const name = group.name || group.id || 'group'
        const status = group.status || 'unknown'
        const modeLabel = replicationGroupModeLabel(group)
        return modeLabel ? `${name} (${modeLabel}, ${status})` : `${name} (${status})`
      })
      const suffix = groups.length > 2 ? ` +${groups.length - 2}` : ''
      return `Replication groups: ${items.join(' | ')}${suffix}`
    }
    return summarizeReplicationVolumes(volumes)
  }

  const findingCount = dashboardSummary?.finding_count ?? 0
  const topFindings = dashboardSummary?.top_findings ?? []
  const selectedTrendFindings = trendFindingsRun ? trendFindingsByRun[trendFindingsRun] : null
  const frameworkTrendPoints = useMemo(() => {
    const points = frameworkTrend?.points ?? []
    return [...points].sort((a, b) => {
      const aTime = Number.isFinite(Date.parse(a.timestamp)) ? Date.parse(a.timestamp) : 0
      const bTime = Number.isFinite(Date.parse(b.timestamp)) ? Date.parse(b.timestamp) : 0
      return aTime - bTime
    })
  }, [frameworkTrend])

  const handleTrendClick = async (point: FrameworkPoint) => {
    if (!point.run_id) return
    if (trendFindingsRun === point.run_id) {
      setTrendFindingsRun(null)
      return
    }
    setTrendFindingsRun(point.run_id)
    if (trendFindingsByRun[point.run_id]) return
    setTrendFindingsError(null)
    setTrendFindingsLoading(point.run_id)
    try {
      const response = await apiJson<FindingsResponse>(
        `/findings?run_id=${encodeURIComponent(point.run_id)}&limit=10`,
      )
      setTrendFindingsByRun((prev) => ({ ...prev, [point.run_id as string]: response }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setTrendFindingsError(new ApiError('Findings not available for this run (purged).', 404, ''))
      } else {
        setTrendFindingsError(err as ApiError)
      }
    } finally {
      setTrendFindingsLoading(null)
    }
  }

  const withLoading = async (key: string, action: () => Promise<void>) => {
    if (loadingCards.has(key)) return
    setLoadingCards((prev) => new Set(prev).add(key))
    try {
      await action()
    } finally {
      setLoadingCards((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        void loadOptionalData(key)
      }
      return next
    })
  }

  const isExpanded = (key: string) => expandedCards.has(key)
  const isLoading = (key: string) => loadingCards.has(key)

  const loadConnectorSnapshot = async (refresh = false) => {
    if (snapshotInFlightRef.current) return
    snapshotInFlightRef.current = true
    try {
      await withLoading('connector-snapshot', async () => {
        try {
          setSnapshotError(null)
          const endpoint = refresh ? '/connectors/data?refresh=true' : '/connectors/data'
          const response = await apiJson<ConnectorSnapshotResponse>(endpoint)
          setConnectorSnapshot((previous) => {
            const incomingAssets = response.snapshot?.assets ?? []
            const previousAssets = previous?.snapshot?.assets ?? []
            if (!incomingAssets.length && previousAssets.length) return previous
            return response
          })
        } catch (e) {
          setSnapshotError((e as ApiError).message ?? 'Failed to load connector snapshot.')
        }
      })
    } finally {
      snapshotInFlightRef.current = false
    }
  }

  const loadConnectorStatuses = async () => {
    if (statusesInFlightRef.current) return
    statusesInFlightRef.current = true
    try {
      await withLoading('connector-health', async () => {
        try {
          const response = await apiJson<ConnectorsResponse>('/connectors')
          setConnectorStatuses((previous) => {
            const merged = mergeConnectorStatusesStable(previous, response.connectors ?? [])
            if (merged.length && typeof window !== 'undefined') {
              try {
                window.localStorage.setItem(CONNECTOR_STATUS_CACHE_KEY, JSON.stringify(merged))
              } catch {
                // ignore storage limits
              }
            }
            return merged
          })
        } catch {
          // ignore
        }
      })
    } finally {
      statusesInFlightRef.current = false
    }
  }

  const loadInfraBenchmark = async (force = false) => {
    await withLoading('infra', async () => {
      try {
        const cacheBust = force ? `?_ts=${Date.now()}` : ''
        const benchmark = await apiJson<InfraBenchmarkResponse>(`/analytics/infra/benchmark${cacheBust}`)
        setInfraBenchmark(benchmark)
      } catch {
        // ignore
      }
    })
  }

  useEffect(() => {
    // Avoid forcing full ingestion from the dashboard; read latest cache quickly and poll.
    const refreshFromLatest = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void loadConnectorSnapshot(false)
      void loadConnectorStatuses()
    }
    const shouldRunForcedRefresh = () => {
      if (typeof window === 'undefined') return false
      try {
        const lastRun = Number(window.localStorage.getItem(CONNECTOR_FORCE_REFRESH_TS_KEY) ?? '0')
        return !Number.isFinite(lastRun) || Date.now() - lastRun >= CONNECTOR_FORCE_REFRESH_INTERVAL_MS
      } catch {
        return true
      }
    }
    const markForcedRefreshRun = () => {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(CONNECTOR_FORCE_REFRESH_TS_KEY, String(Date.now()))
      } catch {
        // ignore storage limits
      }
    }
    const refreshWithForcedIngest = async () => {
      if (!shouldRunForcedRefresh()) return
      markForcedRefreshRun()
      await loadConnectorSnapshot(true)
      await loadConnectorStatuses()
    }
    let fastPollTimer: number | null = null
    let fastPollUntil = 0
    const startFastPolling = (durationMs: number) => {
      fastPollUntil = Date.now() + durationMs
      if (fastPollTimer !== null) return
      fastPollTimer = window.setInterval(() => {
        refreshFromLatest()
        if (Date.now() >= fastPollUntil && fastPollTimer !== null) {
          window.clearInterval(fastPollTimer)
          fastPollTimer = null
        }
      }, DASHBOARD_SNAPSHOT_FAST_POLL_MS)
    }

    refreshFromLatest()
    void refreshWithForcedIngest()
    startFastPolling(DASHBOARD_SNAPSHOT_FAST_BOOT_DURATION_MS)

    const steadyPollTimer = window.setInterval(refreshFromLatest, DASHBOARD_SNAPSHOT_STEADY_POLL_MS)
    const onSnapshotRefreshed = () => {
      refreshFromLatest()
      startFastPolling(DASHBOARD_SNAPSHOT_FAST_REFRESH_DURATION_MS)
    }
    window.addEventListener('connectors:snapshot-refreshed', onSnapshotRefreshed)

    return () => {
      window.clearInterval(steadyPollTimer)
      if (fastPollTimer !== null) {
        window.clearInterval(fastPollTimer)
      }
      window.removeEventListener('connectors:snapshot-refreshed', onSnapshotRefreshed)
    }
    // This polling lifecycle is intentionally mounted once; handlers read current state through refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!expandedCards.has('infra')) return
    void loadInfraBenchmark(true)
    const timer = window.setInterval(() => {
      void loadInfraBenchmark(true)
    }, 15000)
    return () => window.clearInterval(timer)
    // Poll infra only while that card is expanded; loadInfraBenchmark is safe to use from the latest closure here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCards])

  const loadOptionalData = async (key: string) => {
    switch (key) {
      case 'connector-health':
        if (!connectorStatuses) {
          await loadConnectorStatuses()
        }
        break
      case 'dora':
        if (!doraMetrics || !doraControls) {
          await withLoading('dora', async () => {
            if (!doraMetrics) {
              try {
                const metrics = await apiJson<DoraMetricsResponse>('/analytics/dora/operational-metrics')
                setDoraMetrics(metrics)
              } catch {
                // ignore
              }
            }
            if (!doraControls) {
              try {
                const controls = await apiJson<DoraControlsResponse>('/analytics/dora/controls')
                setDoraControls(controls)
              } catch {
                // ignore
              }
            }
          })
        }
        if (!connectorSnapshot) {
          await loadConnectorSnapshot(false)
        }
        break
      case 'nis2':
        if (!nis2Operational || !nis2Controls) {
          await withLoading('nis2', async () => {
            if (!nis2Operational) {
              try {
                const ops = await apiJson<Nis2OperationalMetricsResponse>('/analytics/nis2/operational-metrics')
                setNis2Operational(ops)
              } catch {
                // ignore
              }
            }
            if (!nis2Controls) {
              try {
                const controls = await apiJson<Nis2ControlsResponse>('/analytics/nis2/controls')
                setNis2Controls(controls)
              } catch {
                // ignore
              }
            }
          })
        }
        if (!connectorSnapshot) {
          await loadConnectorSnapshot(false)
        }
        break
      case 'iso':
        if (!isoOperational || !isoControls) {
          await withLoading('iso', async () => {
            if (!isoOperational) {
              try {
                const ops = await apiJson<IsoOperationalMetricsResponse>('/analytics/iso/operational-metrics')
                setIsoOperational(ops)
              } catch {
                // ignore
              }
            }
            if (!isoControls) {
              try {
                const controls = await apiJson<IsoControlsResponse>('/analytics/iso/controls')
                setIsoControls(controls)
              } catch {
                // ignore
              }
            }
          })
        }
        if (!connectorSnapshot) {
          await loadConnectorSnapshot(false)
        }
        break
      case 'soc2':
        if (!soc2Operational || !soc2Controls) {
          await withLoading('soc2', async () => {
            if (!soc2Operational) {
              try {
                const ops = await apiJson<Soc2OperationalMetricsResponse>('/analytics/soc2/operational-metrics')
                setSoc2Operational(ops)
              } catch {
                // ignore
              }
            }
            if (!soc2Controls) {
              try {
                const controls = await apiJson<Soc2ControlsResponse>('/analytics/soc2/controls')
                setSoc2Controls(controls)
              } catch {
                // ignore
              }
            }
          })
        }
        if (!connectorSnapshot) {
          await loadConnectorSnapshot(false)
        }
        break
      case 'gxp':
        if (!gxpOperational || !gxpControls) {
          await withLoading('gxp', async () => {
            if (!gxpOperational) {
              try {
                const ops = await apiJson<GxpOperationalMetricsResponse>('/analytics/gxp/operational-metrics')
                setGxpOperational(ops)
              } catch {
                // ignore
              }
            }
            if (!gxpControls) {
              try {
                const controls = await apiJson<GxpControlsResponse>('/analytics/gxp/controls')
                setGxpControls(controls)
              } catch {
                // ignore
              }
            }
          })
        }
        if (!connectorSnapshot) {
          await loadConnectorSnapshot(false)
        }
        break
      case 'infra':
        await loadInfraBenchmark(true)
        break
      case 'exec':
        if (!execKpis) {
          await withLoading('exec', async () => {
            try {
              const kpis = await apiJson<ExecKpiResponse>('/analytics/executive/kpis')
              setExecKpis(kpis)
            } catch {
              // ignore
            }
          })
        }
        break
      default:
        break
    }
  }

  const vmResilienceSummaryBlock = () => {
    const loading = isLoading('connector-snapshot') || isLoading('connector-health')
    const hasVmEvidence =
      vmResilienceSummary.total > 0 ||
      vmResilienceSummary.withBackup > 0 ||
      vmResilienceSummary.withReplication > 0 ||
      vmResilienceSummary.mappedVolumes > 0
    const summary = (
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-200">
        <div>VMs: {vmResilienceSummary.total}</div>
        <div>Covered (backup + replication): {vmResilienceSummary.withBoth}</div>
        <div>Backed up: {vmResilienceSummary.withBackup}</div>
        <div>
          <button
            type="button"
            onClick={() =>
              setVmResilienceDetail((previous) => (previous === 'replicated' ? null : 'replicated'))
            }
            disabled={vmResilienceSummary.withReplication === 0}
            className="underline decoration-dotted underline-offset-2 enabled:hover:text-slate-50 disabled:opacity-60"
            title="Show replicated VMs"
          >
            Replicated: {vmResilienceSummary.withReplication}
          </button>
        </div>
        <div>Verified (24h): {vmResilienceSummary.verified}</div>
        <div>Volumes mapped: {vmResilienceSummary.uniqueVolumes}</div>
        <div>Volume links: {vmResilienceSummary.mappedVolumes}</div>
      </div>
    )
    return (
      <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-200">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          VM backup and replication
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Correlates vCenter backup and storage replication from snapshot data plus connector-status fallback.
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Verified = backup success within 24h AND replication OK within 24h.
        </div>
        {!hasVmEvidence && loading ? (
          <div className="mt-2 text-[11px] text-slate-300">Loading VM resilience evidence...</div>
        ) : null}
        {snapshotError ? <div className="mt-2 text-[11px] text-rose-300">{snapshotError}</div> : null}
        {hasVmEvidence ? (
          <>
            {summary}
            {vmResilienceSummary.volumeSample.length ? (
              <div className="mt-2 text-[11px] text-slate-300">
                Volumes (sample): {vmResilienceSummary.volumeSample.join(', ')}
                {vmResilienceSummary.uniqueVolumes > vmResilienceSummary.volumeSample.length
                  ? ` +${vmResilienceSummary.uniqueVolumes - vmResilienceSummary.volumeSample.length} more`
                  : ''}
              </div>
            ) : null}
            {vmResilienceDetail === 'replicated' ? (
              <div className="mt-2 rounded border border-slate-700 bg-[#0b1524]/80 p-2">
                <div className="text-[11px] font-semibold text-slate-200">
                  Replicated VMs ({vmResilienceSummary.replicatedVms.length})
                </div>
                {vmResilienceSummary.replicatedVms.length ? (
                  <div className="mt-1 max-h-48 overflow-auto">
                    <table className="w-full border-collapse text-[10px] text-slate-200">
                      <thead>
                        <tr className="text-left text-slate-400">
                          <th className="border-b border-slate-700 px-1 py-1">VM</th>
                          <th className="border-b border-slate-700 px-1 py-1">State</th>
                          <th className="border-b border-slate-700 px-1 py-1">Volumes</th>
                          <th className="border-b border-slate-700 px-1 py-1">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vmResilienceSummary.replicatedVms.map((vm, index) => (
                          <tr key={`${vm.name}-${index}`} className="align-top">
                            <td className="border-b border-slate-800 px-1 py-1">{vm.name}</td>
                            <td className="border-b border-slate-800 px-1 py-1">{vm.replicationState}</td>
                            <td className="border-b border-slate-800 px-1 py-1">{vm.volumeCount}</td>
                            <td className="border-b border-slate-800 px-1 py-1">{vm.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-400">No replicated VMs found.</div>
                )}
              </div>
            ) : null}
          </>
        ) : loading ? null : (
          <div className="mt-2 text-[11px] text-slate-300">
            No VM backup or replication evidence yet. Run ingestion and refresh the dashboard.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PageTitle>Dashboard</PageTitle>
        <HelpTip
          text={
            'Quick snapshot of compliance and risk.\n\nFramework cards show compliance by framework (DORA, NIS2, ISO 27001, SOC 2, GxP) using evidence.\nSecurity cards show current risk signals and remediation.\n\nScores: framework and infra scores are 0-100 (higher is better). Risk score is points (lower is better, no fixed max).\n\nUse Runs, Analytics, and Connectors for details.'
          }
        />
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label>History window</Label>
            <select
              value={historyLimit}
              onChange={(e) => setHistoryLimit(Number(e.target.value))}
              className="rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-50"
            >
              {HISTORY_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit} runs
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => void triggerRunAndRefresh()} disabled={summaryLoading}>
            {summaryLoading ? 'Running...' : 'Run now'}
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-50">
        Track overall posture at a glance. Drill into Runs, Analytics, or Connectors when needed.
      </p>
      <div className="text-xs text-slate-300">
        {dashboardSummary?.generated_at ? `Updated ${formatTimestamp(dashboardSummary.generated_at)}` : 'Updated n/a'}
        {dashboardSummary?.cache_key ? ` | Cache ${dashboardSummary.cache_key}` : ''}
        {dashboardSummary?.cached_metrics
          ? ` | Cached metrics ${dashboardSummary.cached_metrics.frameworks_cached ?? 0}/${dashboardSummary.cached_metrics.operational_cached ?? 0}`
          : ''}
        {dashboardSummary?.cached_metrics?.last_updated
          ? ` | Metrics as of ${formatTimestamp(dashboardSummary.cached_metrics.last_updated)}`
          : ''}
        {refreshStatus ? ` | ${refreshStatus}` : ''}
      </div>

      {showGuide ? (
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Label>How to read this</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[#274266] bg-[#0d1a2b]/70 p-3">
                  <div className="text-sm font-semibold text-slate-50">Framework dashboard</div>
                  <div className="mt-1 text-sm text-slate-100">
                    Answers: &quot;Are we compliant?&quot; by framework, with evidence and control mappings.
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-200">
                    <li>Evidence-backed, audit-friendly</li>
                    <li>Run-to-run deltas and exports</li>
                    <li>Mapped to requirements/controls</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-[#274266] bg-[#0d1a2b]/70 p-3">
                  <div className="text-sm font-semibold text-slate-50">Security dashboard</div>
                  <div className="mt-1 text-sm text-slate-100">
                    Answers: &quot;Are we secure right now?&quot; with current risks and remediation.
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-200">
                    <li>Operational posture (near real-time)</li>
                    <li>Risk drivers, exceptions, SLAs</li>
                    <li>Action-oriented for teams</li>
                  </ul>
                </div>
              </div>
              <div className="text-xs text-slate-200">
                Tip: lots of &quot;unknown&quot; connectors usually means they are not configured or ingestion has not run.
              </div>
            </div>
            <div className="shrink-0">
              <Button onClick={() => setShowGuide(false)}>Hide</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {error ? <ErrorBox title={error.message} detail={error.bodyText} /> : null}

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <Label>{`Runs (last ${historyLimit})`}</Label>
          <div className="mt-3 text-3xl font-semibold text-slate-50">{visibleRunCount}</div>
          <div className="mt-1 text-[11px] text-slate-400">Completed runs in selected window</div>
          <div className="mt-2 text-xs text-slate-200">Latest run: {latestRun?.run_id ?? 'n/a'}</div>
        </Card>
        <Card>
          <Label>Risk score (latest run)</Label>
          <div className="mt-3 text-3xl font-semibold text-slate-50">
            {latestRun?.risk_score ?? 'n/a'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Lower is better; no fixed maximum</div>
          <div className={`mt-2 text-xs ${statusTone(latestRun?.overall_risk)}`}>
            Risk tier: {latestRun?.overall_risk ?? 'unknown'}
          </div>
        </Card>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('findings')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>Critical findings (latest run)</Label>
            <span className="text-xs text-slate-300">{isExpanded('findings') ? 'Hide' : 'Show top 10'}</span>
          </button>
          <div className="mt-3 text-3xl font-semibold text-slate-50">{findingCount}</div>
          <div className="mt-1 text-[11px] text-slate-400">Critical findings stored for reporting</div>
          {isExpanded('findings') ? (
            <div className="mt-3 space-y-2 text-xs text-slate-200">
              {topFindings.length ? (
                <ul className="space-y-1 text-slate-100">
                  {topFindings.map((finding, index) => (
                    <li key={`${finding.asset_id ?? 'asset'}-${index}`} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                          {finding.asset_label || finding.asset_id || 'unknown'}
                        </span>
                        <span className="text-[10px] text-amber-300">
                          {(finding.severity || 'unknown').toString().toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        {finding.title || finding.type || 'Finding'}
                      </div>
                      {finding.event_timestamp ? (
                        <div className="text-[10px] text-slate-500">
                          {formatTimestamp(finding.event_timestamp)}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-slate-400">No critical findings in the latest run.</div>
              )}
            </div>
          ) : null}
        </Card>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('risk-drivers')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>Risk drivers (latest run)</Label>
            <span className="text-xs text-slate-300">{isExpanded('risk-drivers') ? 'Hide' : 'Details'}</span>
          </button>
          <div className="mt-3 text-3xl font-semibold text-slate-50">
            {riskDrivers ? riskDrivers.total_findings : 'n/a'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Total findings feeding the risk score (includes non-critical)
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-200">
            {['critical', 'high', 'medium', 'low'].map((level) => (
              <div key={level} className="flex items-center justify-between">
                <span className="capitalize">{level}</span>
                <span>{riskSeverityCounts[level] ?? 0}</span>
              </div>
            ))}
          </div>
          {isExpanded('risk-drivers') ? (
            <div className="mt-3 space-y-2 text-xs text-slate-200">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">By severity</div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {RISK_SEVERITY_ORDER.map((level) => (
                    <div key={level} className="flex items-center justify-between">
                      <span className="capitalize">{level}</span>
                      <span>{riskSeverityCounts[level] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top sources</div>
                {riskTopSources.length ? (
                  <ul className="mt-2 space-y-1 text-slate-100">
                    {riskTopSources.map((source) => (
                      <li key={source.source} className="flex items-center justify-between gap-2">
                        <span className="truncate">{source.source}</span>
                        <span className="text-[11px] text-slate-300">
                          {source.count} ({(source.max_severity ?? 'unknown').toUpperCase()})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-slate-400">No risk drivers reported yet.</div>
                )}
                {riskOtherSources ? (
                  <div className="mt-1 text-[11px] text-slate-400">Other sources: {riskOtherSources}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
        <Card>
          <Label>Frameworks scored</Label>
          <div className="mt-3 text-3xl font-semibold text-slate-50">{frameworkCount}</div>
          <div className="mt-1 text-[11px] text-slate-400">Scores are 0-100 (higher is better)</div>
          <div className="mt-2 text-xs text-slate-200">
            Trend focus: {frameworkTrend?.framework ?? frameworks?.[0] ?? 'n/a'}
          </div>
        </Card>
          <div className={isExpanded('connector-health') ? 'md:col-span-2' : undefined}>
            <Card>
              <button
                type="button"
                onClick={() => toggleCard('connector-health')}
                className="flex w-full items-center justify-between text-left"
              >
                <Label>Connector status</Label>
                <span className="text-xs text-slate-300">{isExpanded('connector-health') ? 'Hide' : 'Details'}</span>
              </button>
              <div className="mt-1 text-[11px] text-slate-400">Status counts from latest run</div>
              <div className="mt-3 space-y-1 text-sm text-slate-50">
                <div>
                  <span className="text-emerald-300">{connectorHealth.ok}</span> healthy
                </div>
                <div>
                  <span className="text-amber-300">{connectorHealth.warn}</span> degraded
                </div>
                <div>
                  <span className="text-rose-300">{connectorHealth.error}</span> failing
                </div>
                <div>
                  <span className="text-slate-300">{connectorHealth.unknown}</span> unknown
                </div>
              </div>
              {isExpanded('connector-health') ? (
                connectorDetails.entries.length ? (
                  <div className="mt-3 grid gap-3 text-xs text-slate-200 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Healthy</div>
                      {connectorDetails.healthy.length ? (
                        <ul className="mt-2 space-y-1 text-slate-100">
                          {connectorDetails.healthy.map((entry) => (
                            <li key={entry.name} className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate">{entry.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  Last successful run: {entry.lastSuccess ? formatTimestamp(entry.lastSuccess) : 'n/a'}
                                </div>
                                {summarizeRemoteSystems(entry.remoteSystems) ? (
                                  <div className="text-[10px] text-slate-400">
                                    {summarizeRemoteSystems(entry.remoteSystems)}
                                  </div>
                                ) : null}
                                {summarizeReplicationGroups(
                                  entry.replicationVolumeGroups,
                                  entry.replicationVolumes,
                                ) ? (
                                  <div className="text-[10px] text-slate-400">
                                    {summarizeReplicationGroups(
                                      entry.replicationVolumeGroups,
                                      entry.replicationVolumes,
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <span className="text-[11px] text-emerald-300">ok</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-slate-400">No healthy connectors reported.</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Needs attention</div>
                      {connectorDetails.issues.length ? (
                        <ul className="mt-2 space-y-1 text-slate-100">
                          {connectorDetails.issues.map((entry) => (
                            <li key={entry.name} className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate">{entry.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  Last successful run: {entry.lastSuccess ? formatTimestamp(entry.lastSuccess) : 'n/a'}
                                </div>
                                {summarizeRemoteSystems(entry.remoteSystems) ? (
                                  <div className="text-[10px] text-slate-400">
                                    {summarizeRemoteSystems(entry.remoteSystems)}
                                  </div>
                                ) : null}
                                {summarizeReplicationGroups(
                                  entry.replicationVolumeGroups,
                                  entry.replicationVolumes,
                                ) ? (
                                  <div className="text-[10px] text-slate-400">
                                    {summarizeReplicationGroups(
                                      entry.replicationVolumeGroups,
                                      entry.replicationVolumes,
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <span
                                className={
                                  !entry.name.startsWith('powerstore') &&
                                  (entry.haConfigured === false || entry.haStatus === 'error')
                                    ? 'text-[11px] text-rose-300'
                                    : 'text-[11px] text-amber-300'
                                }
                              >
                                {connectorIssueLabel(entry)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-slate-400">No connector issues reported.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-400">
                    No health details yet. Run ingestion to populate connector status.
                  </div>
                )
              ) : null}
            </Card>
          </div>
        <div className={isExpanded('dora') ? 'md:col-span-4' : undefined}>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('dora')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>DORA compliance score</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {doraControls?.score ?? resolveFrameworkScore(['dora']) ?? 'n/a'}
            </div>
          </button>
          {isExpanded('dora') ? (
            <div className="mt-3 space-y-2 text-sm text-slate-50">
              {isLoading('dora') && !doraMetrics && !doraControls ? (
                <div className="text-xs text-slate-300">Loading DORA signals...</div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-200">Operational signals (latest run)</div>
                <HelpTip text="Latest run signals. Add connectors to improve deployment, incident, and recovery coverage." />
              </div>
              <OperationalMetricsBlock
                metrics={doraOperational}
                emptyText="No DORA signals yet. Configure connectors and run again."
                missingInputs={doraMetrics?.missing_inputs}
                timestamp={doraMetrics?.timestamp}
              />
              {resilienceLayersCompactBlock(doraControls?.resilience_playbook, haRecoverySequences)}
            </div>
          ) : null}
        </Card>
        </div>
        <div className={isExpanded('nis2') ? 'md:col-span-4' : undefined}>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('nis2')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>NIS2 compliance score</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {nis2Controls?.score ?? resolveFrameworkScore(['nis2']) ?? 'n/a'}
            </div>
          </button>
          {isExpanded('nis2') ? (
            <div className="mt-3 space-y-2 text-sm text-slate-50">
              {isLoading('nis2') && !nis2Operational && !nis2Controls ? (
                <div className="text-xs text-slate-300">Loading NIS2 signals...</div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-200">Operational signals (latest run)</div>
                <HelpTip text="Latest run signals and NIS2 control summary." />
              </div>
              <OperationalMetricsBlock
                metrics={nis2OperationalNormalized}
                emptyText="No NIS2 signals yet. Configure connectors and run again."
                missingInputs={nis2Operational?.missing_inputs}
                timestamp={nis2Operational?.timestamp}
              />
              {resilienceLayersCompactBlock(nis2Controls?.resilience_playbook, haRecoverySequences)}
            </div>
          ) : null}
        </Card>
        </div>
        <div className={isExpanded('iso') ? 'md:col-span-4' : undefined}>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('iso')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>ISO 27001 compliance score</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {isoControls?.score ?? resolveFrameworkScore(['iso', 'iso27001']) ?? 'n/a'}
            </div>
          </button>
          {isExpanded('iso') ? (
            <div className="mt-3 space-y-2 text-sm text-slate-50">
              {isLoading('iso') && !isoOperational && !isoControls ? (
                <div className="text-xs text-slate-300">Loading ISO 27001 signals...</div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-200">Operational signals (latest run)</div>
                <HelpTip text="Latest run signals and ISO 27001 control summary." />
              </div>
              <OperationalMetricsBlock
                metrics={isoOperationalNormalized}
                emptyText="No ISO 27001 signals yet. Configure connectors and run again."
                missingInputs={isoOperational?.missing_inputs}
                timestamp={isoOperational?.timestamp}
              />
              {resilienceLayersCompactBlock(isoControls?.resilience_playbook, haRecoverySequences)}
            </div>
          ) : null}
        </Card>
        </div>
        <div className={isExpanded('soc2') ? 'md:col-span-4' : undefined}>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('soc2')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>SOC 2 compliance score</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {soc2Controls?.score ?? resolveFrameworkScore(['soc2']) ?? 'n/a'}
            </div>
          </button>
          {isExpanded('soc2') ? (
            <div className="mt-3 space-y-2 text-sm text-slate-50">
              {isLoading('soc2') && !soc2Operational && !soc2Controls ? (
                <div className="text-xs text-slate-300">Loading SOC 2 signals...</div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-200">Operational signals (latest run)</div>
                <HelpTip text="Latest run signals and SOC 2 control summary." />
              </div>
              <OperationalMetricsBlock
                metrics={soc2OperationalNormalized}
                emptyText="No SOC 2 signals yet. Configure connectors and run again."
                missingInputs={soc2Operational?.missing_inputs}
                timestamp={soc2Operational?.timestamp}
              />
              {resilienceLayersCompactBlock(soc2Controls?.resilience_playbook, haRecoverySequences)}
            </div>
          ) : null}
        </Card>
        </div>
        <div className={isExpanded('gxp') ? 'md:col-span-4' : undefined}>
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('gxp')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>GxP compliance score</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {gxpControls?.score ?? resolveFrameworkScore(['gxp']) ?? 'n/a'}
            </div>
          </button>
          {isExpanded('gxp') ? (
            <div className="mt-3 space-y-2 text-sm text-slate-50">
              {isLoading('gxp') && !gxpOperational && !gxpControls ? (
                <div className="text-xs text-slate-300">Loading GxP signals...</div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-200">Operational signals (latest run)</div>
                <HelpTip text="Latest run signals and GxP control summary." />
              </div>
              <OperationalMetricsBlock
                metrics={gxpOperationalNormalized}
                emptyText="No GxP signals yet. Configure connectors and run again."
                missingInputs={gxpOperational?.missing_inputs}
                timestamp={gxpOperational?.timestamp}
              />
              {resilienceLayersCompactBlock(gxpControls?.resilience_playbook, haRecoverySequences)}
            </div>
          ) : null}
        </Card>
        </div>
      </div>

      <Card>
        <Label>Shared resilience view</Label>
        <div className="mt-1 text-[11px] text-slate-400">
          Consolidated resilience evidence is shown once to keep framework cards focused on key operational signals.
          {sharedResilienceCoverage ? ` Source: ${sharedResilienceCoverage.label}.` : ''}
        </div>
        {vmResilienceSummaryBlock()}
        {sharedResilienceCoverage
          ? resilienceSummaryBlock(
              `${sharedResilienceCoverage.label} resilience coverage`,
              sharedResilienceCoverage.playbook,
            sharedResilienceCoverage.score,
            sharedResilienceCoverage.weight,
            'backup_replication',
            haRecoverySequences,
          )
          : (
            <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-300">
              No resilience playbook data yet. Expand a framework card to load controls and resilience details.
            </div>
          )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <Label>{`Risk score trend (last ${historyLimit} runs)`}</Label>
          <div className="mt-3">
            {trendValues.length ? (
              <svg viewBox="0 0 240 80" className="h-24 w-full">
                <polyline
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="3"
                  points={sparklinePoints(trendValues, 240, 80)}
                />
                <circle cx="236" cy="8" r="3" fill="#38bdf8" />
              </svg>
            ) : (
              <div className="text-sm text-slate-50">No trend data yet.</div>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Risk points (lower is better)</div>
          <div className="mt-2 text-xs text-slate-200">Updated {formatTimestamp(latestRun?.timestamp)}</div>
        </Card>

        <Card>
          <Label>Framework trend (risk + findings)</Label>
          <div className="mt-1 text-[11px] text-slate-400">
            Risk points and findings for the selected framework
          </div>
          <div className="mt-3 space-y-3 text-sm text-slate-50">
            {frameworkTrendPoints.length ? (
              <>
                <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
                  <span>Run time</span>
                  <span>Risk points</span>
                  <span>Findings</span>
                </div>
                {frameworkTrendPoints.slice(-4).map((point) => {
                  const isSelected = point.run_id && point.run_id === trendFindingsRun
                  return (
                    <button
                      key={`${point.timestamp}-${point.run_id ?? ''}`}
                      type="button"
                      onClick={() => handleTrendClick(point)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left ${
                        isSelected ? 'bg-[#13233a]/80 text-slate-100' : 'hover:bg-[#13233a]/60'
                      }`}
                    >
                      <span className="text-xs text-slate-200">{formatTimestamp(point.timestamp)}</span>
                      <span className="font-semibold">
                        {typeof point.risk_score === 'number' ? `${point.risk_score} pts` : 'n/a'}
                      </span>
                      <span className="text-xs text-slate-200">{point.finding_count ?? 0} findings</span>
                    </button>
                  )
                })}
              </>
            ) : (
              <div>No framework trend data.</div>
            )}
          </div>
          {trendFindingsRun ? (
            <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-200">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-50">Findings for run {trendFindingsRun}</div>
                <button
                  type="button"
                  onClick={() => setTrendFindingsRun(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  Hide
                </button>
              </div>
              {trendFindingsLoading === trendFindingsRun ? (
                <div className="text-[11px] text-slate-400">Loading findings...</div>
              ) : trendFindingsError ? (
                <div className="text-[11px] text-rose-300">{trendFindingsError.message}</div>
              ) : selectedTrendFindings?.items?.length ? (
                <ul className="space-y-1">
                  {selectedTrendFindings.items.map((finding, index) => (
                    <li key={`${finding.asset_id ?? 'asset'}-${index}`} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-100">
                          {finding.asset_label || finding.asset_name || finding.asset_id || 'unknown'}
                        </span>
                        <span className="text-[10px] text-amber-300">
                          {(finding.severity || 'unknown').toString().toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        {finding.title || finding.type || 'Finding'}
                      </div>
                      {finding.event_timestamp ? (
                        <div className="text-[10px] text-slate-500">
                          {formatTimestamp(finding.event_timestamp)}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-slate-400">No findings returned for this run.</div>
              )}
            </div>
          ) : null}
        </Card>

        <Card>
          <Label>Latest run details</Label>
          <div className="mt-3 space-y-2 text-sm text-slate-50">
            <div>
              <span className="text-slate-200">Run ID:</span> {latestRun?.run_id ?? 'n/a'}
            </div>
            <div>
              <span className="text-slate-200">Time:</span> {formatTimestamp(latestRun?.timestamp)}
            </div>
            <div>
              <span className="text-slate-200">Risk tier:</span> {latestRun?.overall_risk ?? 'n/a'}
            </div>
            <div>
              <span className="text-slate-200">Risk points:</span> {latestRun?.risk_score ?? 'n/a'}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <button
            type="button"
            onClick={() => toggleCard('infra')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>Infrastructure benchmark</Label>
            <div className="text-2xl font-semibold text-slate-50">
              {typeof infraBenchmark?.overall_score === 'number'
                ? `${infraBenchmark.overall_score.toFixed(0)}`
                : 'n/a'}
            </div>
          </button>
          <div className="mt-1 text-[11px] text-slate-400">
            Score 0-100 (average pass rate across layers)
          </div>
          {isExpanded('infra') ? (
            <div className="mt-2">
              {isLoading('infra') && !infraBenchmark ? (
                <div className="text-xs text-slate-300">Loading infrastructure benchmark...</div>
              ) : null}
              <div className="text-xs text-slate-300">
                {infraBenchmark?.framework
                  ? `Benchmark playbook ${infraBenchmark.framework.toUpperCase()}`
                  : 'Benchmark playbook n/a'}
              </div>
              {infraBenchmark?.layers?.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
                  {infraBenchmark.layers.map((layer) => (
                    <div key={layer.layer} className="rounded border border-slate-700 bg-[#0d1a2b]/70 p-2">
                      <div className="text-[11px] text-slate-300">{layer.layer}</div>
                      <div className="text-sm font-semibold text-slate-50">
                        {layer.passed}/{layer.total} - {layer.score_percent.toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-slate-300">No infra benchmark data yet.</div>
              )}
              {infraBenchmark?.per_connector && Object.keys(infraBenchmark.per_connector).length ? (
                <div className="mt-3 rounded border border-slate-700 bg-[#0d1a2b]/70 p-2 text-xs text-slate-200">
                  <div className="mb-1 font-semibold text-slate-50">Top connectors (benchmark)</div>
                  {Object.entries(infraBenchmark.per_connector)
                    .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))
                    .slice(0, 4)
                    .map(([name, item]) => (
                      <div key={name} className="flex items-center justify-between rounded bg-[#13233a]/80 p-2">
                        <span className="font-semibold text-slate-50">{name}</span>
                        <span className="text-slate-200">
                          {item.score}/100 ({item.total_rules - item.failed_rules}/{item.total_rules} pass)
                        </span>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-300">Expand for benchmark details.</div>
          )}
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => toggleCard('exec')}
            className="flex w-full items-center justify-between text-left"
          >
            <Label>Executive risk trend</Label>
            <div className="text-2xl font-semibold text-slate-50">{execLatest?.risk_score ?? 'n/a'}</div>
          </button>
          <div className="mt-1 text-[11px] text-slate-400">Risk points (lower is better)</div>
          {isExpanded('exec') ? (
            <>
              {isLoading('exec') && !execKpis ? (
                <div className="mt-2 text-xs text-slate-300">Loading executive KPIs...</div>
              ) : null}
              <div className="mt-3">
                {execTrendValues.length ? (
                  <svg viewBox="0 0 240 80" className="h-24 w-full">
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      points={sparklinePoints(execTrendValues, 240, 80)}
                    />
                    <circle cx="236" cy="8" r="3" fill="#fbbf24" />
                  </svg>
                ) : (
                  <div className="text-sm text-slate-50">No executive KPI trend data.</div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
                <div>
                  <div className="text-slate-300">Infrastructure score (0-100)</div>
                  <div className="text-sm font-semibold text-slate-50">
                    {typeof execLatest?.infra_score === 'number' ? execLatest.infra_score.toFixed(0) : 'n/a'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-300">Connector health (percent)</div>
                  <div className="text-sm font-semibold text-slate-50">
                    {formatRatio(execLatest?.connector_health_ratio)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-300">Risk points</div>
                  <div className="text-sm font-semibold text-slate-50">{execLatest?.risk_score ?? 'n/a'}</div>
                </div>
                <div>
                  <div className="text-slate-300">Validation issues</div>
                  <div className="text-sm font-semibold text-slate-50">
                    {execLatest?.validation_issue_count ?? 'n/a'}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Infrastructure score and connector health over time
              </div>
              <div className="mt-2 space-y-2 text-xs text-slate-200">
                {(execKpis?.trend ?? []).slice(-4).map((point) => (
                  <div key={`${point.run_id ?? ''}-${point.timestamp ?? ''}`} className="flex items-center justify-between">
                    <span className="text-slate-300">{formatTimestamp(point.timestamp)}</span>
                    <span className="font-semibold text-slate-50">
                      {typeof point.infra_score === 'number' ? point.infra_score.toFixed(0) : 'n/a'}
                    </span>
                    <span className="text-slate-300">{formatRatio(point.connector_health_ratio)}</span>
                  </div>
                ))}
                {!execKpis?.trend?.length ? (
                  <div className="text-xs text-slate-400">No executive trend runs yet.</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-2 text-xs text-slate-300">Expand to load KPI details.</div>
          )}
        </Card>
      </div>
    </div>
  )
}
