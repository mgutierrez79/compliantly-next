'use client';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Button, Card, ErrorBox, InfoBox, Input, Label, PageTitle, Textarea } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type FrameworkItem = { key: string; name?: string; version?: string }
type FrameworksResponse = { frameworks: FrameworkItem[] }

type ControlMapping = {
  framework: string
  control_ids: string[]
  notes?: string | null
}

type ConnectorMapping = {
  connector: string
  instance: string
  node?: string | null
  mappings: ControlMapping[]
}

type ControlMappingsResponse = {
  items: ConnectorMapping[]
}

function normalizeControlMappings(raw: unknown): ConnectorMapping[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<ConnectorMapping>
      const connector = typeof record.connector === 'string' ? record.connector : `connector-${idx + 1}`
      const instance = typeof record.instance === 'string' ? record.instance : 'default'
      const node = record.node && typeof record.node === 'string' ? record.node : undefined
      const mappings = Array.isArray(record.mappings)
        ? record.mappings.map((m) => {
            const framework =
              m && typeof m === 'object' && typeof (m as ControlMapping).framework === 'string'
                ? (m as ControlMapping).framework
                : ''
            const control_ids = Array.isArray((m as ControlMapping)?.control_ids)
              ? ((m as ControlMapping).control_ids || []).filter((c) => typeof c === 'string')
              : []
            const notes =
              m && typeof m === 'object' && typeof (m as ControlMapping).notes === 'string'
                ? (m as ControlMapping).notes
                : undefined
            return { framework, control_ids, notes }
          })
        : []
      return { connector, instance, node, mappings }
    })
    .filter(Boolean) as ConnectorMapping[]
}


type ControlLibraryEntry = {
  framework: string
  control_id: string
  description?: string | null
  references?: string[]
  evidence_types?: string[]
  tags?: string[]
}

type ControlLibraryResponse = {
  items: ControlLibraryEntry[]
}

type ControlCrosswalkMapping = {
  framework: string
  control_id: string
}

type ControlCrosswalkEntry = {
  primary_framework: string
  primary_control_id: string
  mappings: ControlCrosswalkMapping[]
  notes?: string | null
}

type ControlCrosswalksResponse = {
  items: ControlCrosswalkEntry[]
}

type ConnectorsConfigResponse = {
  available?: string[]
  enabled: string[]
  catalog?: Array<{
    name?: string
    label?: string
    outputs?: string[]
    capabilities?: string[]
  }>
}

type ConnectorItemsResponse = {
  items?: Array<{ name?: string; clusters?: Array<{ name?: string; passive_url?: string | null }> }>
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

const ALL_NODES = '__all__'
const LIBRARY_PAGE_SIZE = 200
const CROSSWALK_PAGE_SIZE = 50
const MAPPING_PAGE_SIZE = 20
const EMPTY_MAPPINGS: ControlMapping[] = []

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinCsv(values: string[]) {
  return values.join(', ')
}

function normalizeName(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function normalizeFrameworkSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeTokens(values: string[] | undefined) {
  if (!values?.length) return []
  return values.map((value) => normalizeToken(value)).filter(Boolean)
}

function scoreTokenOverlap(primary: string[], candidate: string[]) {
  if (!primary.length || !candidate.length) return 0
  const a = new Set(primary)
  const b = new Set(candidate)
  const intersection = Array.from(a).filter((token) => b.has(token))
  if (!intersection.length) return 0
  const union = new Set([...a, ...b])
  return intersection.length / union.size
}

function tokensForEntry(entry: ControlLibraryEntry) {
  const tagTokens = normalizeTokens(entry.tags)
  const evidenceTokens = normalizeTokens(entry.evidence_types)
  return tagTokens.length ? tagTokens : evidenceTokens
}

function controlKey(entry: ControlLibraryEntry) {
  return `${entry.framework}::${entry.control_id}`
}

function extractClusterNodes(rawClusters: unknown): string[] {
  if (!Array.isArray(rawClusters)) return []
  const nodes: string[] = []
  rawClusters.forEach((cluster, idx) => {
    if (!cluster || typeof cluster !== 'object') return
    const record = cluster as { name?: string; passive_url?: string | null }
    const clusterName = normalizeName(record.name, `cluster-${idx + 1}`)
    nodes.push(`${clusterName}/active`)
    if (record.passive_url) nodes.push(`${clusterName}/passive`)
  })
  return nodes
}

function normalizeInstancesAndNodes(payload: unknown): {
  instances: string[]
  nodesByInstance: Record<string, string[]>
} {
  const result: { instances: string[]; nodesByInstance: Record<string, string[]> } = {
    instances: [],
    nodesByInstance: {},
  }
  if (!payload || typeof payload !== 'object') return result
  const record = payload as ConnectorItemsResponse
  const items = Array.isArray(record.items)
    ? record.items
    : [payload as { name?: string; clusters?: Array<{ name?: string; passive_url?: string | null }> }]
  items.forEach((item, idx) => {
    const instanceName = normalizeName(item?.name, `instance-${idx + 1}`)
    result.instances.push(instanceName)
    const nodes = extractClusterNodes(item?.clusters)
    if (nodes.length) {
      result.nodesByInstance[instanceName] = nodes
    }
  })
  return result
}

function nodeKey(connector: string, instance: string) {
  return `${connector}::${instance}`
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const EVIDENCE_ALIASES: Record<string, string[]> = {
  procedure: ['procedure', 'procedures', 'policy', 'policies'],
  changeevents: ['changeevents', 'changeevent'],
  securityevents: ['securityevents', 'securityevent'],
  resiliencesignals: ['resiliencesignals', 'resiliencesignal'],
  recoveryjobs: ['recoveryjobs', 'recoveryjob'],
  assets: ['assets', 'asset'],
  identities: ['identities', 'identity'],
  vulnerabilities: ['vulnerabilities', 'vulnerability'],
  tads: ['tads', 'tad'],
  exploitmanuals: ['exploitmanuals', 'exploitmanual'],
  documents: ['documents', 'document'],
}

function expandEvidenceType(value: string) {
  const normalized = normalizeToken(value)
  return EVIDENCE_ALIASES[normalized] || [normalized]
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort()
}

type SelectedControlMappingEntry = {
  connector: string
  instance: string
  node?: string | null
  notes?: string | null
}

type ControlLibraryPanelProps = {
  libraryReady: boolean
  libraryError: ApiError | null
  loadingLibrary: boolean
  retryLibrary: () => void
  libraryFramework: string
  libraryFrameworkOptions: string[]
  onLibraryFrameworkChange: (value: string) => void
  librarySearch: string
  onLibrarySearchChange: (value: string) => void
  frameworkLabel: (key: string) => string
  filteredLibrary: ControlLibraryEntry[]
  visibleLibrary: ControlLibraryEntry[]
  hasMoreLibrary: boolean
  onShowMoreLibrary: () => void
  onShowAllLibrary: () => void
  selectedControlKey: string
  onSelectControlKey: (key: string) => void
  controlKey: (entry: ControlLibraryEntry) => string
  currentMappings: ControlMapping[]
  onToggleControlMapping: (item: ControlLibraryEntry) => void
  canEditMappings: boolean
  mappingScopeLabel: string
  onAddMappingRow: () => void
  onSuggestMappings: () => void
  hasControlLibrary: boolean
  selectedControl: ControlLibraryEntry | null
  selectedControlMappings: SelectedControlMappingEntry[]
  formatSelectedControlMapping: (entry: SelectedControlMappingEntry) => string
  combinedConnectorOptions: string[]
  selectedConnector: string
  onSelectedConnectorChange: (value: string) => void
  availableInstances: string[]
  selectedInstance: string
  onSelectedInstanceChange: (value: string) => void
  availableNodes: string[]
  selectedNode: string
  onSelectedNodeChange: (value: string) => void
  allNodesValue: string
  isSelectedControlMapped: boolean
  onToggleSelectedControlMapping: () => void
}

const ControlLibraryPanel = (
  {
    libraryReady,
    libraryError,
    loadingLibrary,
    retryLibrary,
    libraryFramework,
    libraryFrameworkOptions,
    onLibraryFrameworkChange,
    librarySearch,
    onLibrarySearchChange,
    frameworkLabel,
    filteredLibrary,
    visibleLibrary,
    hasMoreLibrary,
    onShowMoreLibrary,
    onShowAllLibrary,
    selectedControlKey,
    onSelectControlKey,
    controlKey,
    currentMappings,
    onToggleControlMapping,
    canEditMappings,
    mappingScopeLabel,
    onAddMappingRow,
    onSuggestMappings,
    hasControlLibrary,
    selectedControl,
    selectedControlMappings,
    formatSelectedControlMapping,
    combinedConnectorOptions,
    selectedConnector,
    onSelectedConnectorChange,
    availableInstances,
    selectedInstance,
    onSelectedInstanceChange,
    availableNodes,
    selectedNode,
    onSelectedNodeChange,
    allNodesValue,
    isSelectedControlMapped,
    onToggleSelectedControlMapping,
  }: ControlLibraryPanelProps
) => {
  const {
    t
  } = useI18n();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{t('Control library', 'Control library')}</Label>
        <div className="text-xs text-slate-400">{t(
          'Browse the controls loaded from framework policies.',
          'Browse the controls loaded from framework policies.'
        )}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          {libraryReady ? 'Control library loaded.' : 'Loading control library...'}
        </div>
        {libraryError ? <Button onClick={retryLibrary}>{t('Retry', 'Retry')}</Button> : null}
      </div>
      {libraryError ? (
        <div className="mt-4">
          <ErrorBox title={t('Failed to load control library', 'Failed to load control library')} detail={libraryError.bodyText || libraryError.message} />
        </div>
      ) : !libraryReady || loadingLibrary ? (
        <div className="mt-4">
          <InfoBox title={t('Loading control library...', 'Loading control library...')} />
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <Label>{t('Framework', 'Framework')}</Label>
              <select
                className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                value={libraryFramework}
                onChange={(event) => onLibraryFrameworkChange(event.target.value)}
              >
                <option value="">{t('All frameworks', 'All frameworks')}</option>
                {libraryFrameworkOptions.map((framework) => (
                  <option key={framework} value={framework}>
                    {frameworkLabel(framework)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('Search', 'Search')}</Label>
              <Input
                value={librarySearch}
                onChange={(event) => onLibrarySearchChange(event.target.value)}
                placeholder={t('Search controls, references, tags', 'Search controls, references, tags')}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="rounded border border-[#1f365a] bg-[#0b1524] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label>{t('Mapping scope', 'Mapping scope')}</Label>
                    <div className="text-xs text-slate-400">{mappingScopeLabel}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onAddMappingRow} disabled={!canEditMappings}>
                      {t('Add mapping row', 'Add mapping row')}
                    </Button>
                    <Button onClick={onSuggestMappings} disabled={!canEditMappings || !hasControlLibrary}>
                      {t('Auto-suggest', 'Auto-suggest')}
                    </Button>
                  </div>
                </div>
              </div>
              {filteredLibrary.length ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <div>
                      {t('Showing', 'Showing')} {Math.min(visibleLibrary.length, filteredLibrary.length)}of {filteredLibrary.length}
                    </div>
                    {hasMoreLibrary ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={onShowMoreLibrary}>{t('Show more', 'Show more')}</Button>
                        <Button onClick={onShowAllLibrary}>{t('Show all', 'Show all')}</Button>
                      </div>
                    ) : null}
                  </div>
                  {visibleLibrary.map((item, index) => {
                    const {
                      t
                    } = useI18n();

                    const key = controlKey(item)
                    const isSelected = key === selectedControlKey
                    const isMapped = currentMappings.some(
                      (mapping) =>
                        mapping.framework === item.framework && mapping.control_ids.includes(item.control_id),
                    )
                    return (
                      <div
                        key={`${item.framework}-${item.control_id}-${index}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectControlKey(key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectControlKey(key)
                          }
                        }}
                        className={`w-full rounded border p-3 text-left transition ${
                          isSelected ? 'border-[#4f8cff] bg-[#13213a]' : 'border-[#1f365a] hover:border-[#36507a]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-100">{item.control_id}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={isMapped ? 'text-emerald-300' : 'text-slate-400'}>
                              {isMapped ? 'Mapped' : 'Not mapped'}
                            </span>
                            <button
                              type="button"
                              className="rounded border border-[#274266] px-2 py-1 text-xs text-slate-100 hover:border-[#36507a]"
                              onClick={(event) => {
                                event.stopPropagation()
                                onSelectControlKey(key)
                                onToggleControlMapping(item)
                              }}
                              disabled={!canEditMappings}
                            >
                              {isMapped ? 'Remove' : 'Add'}
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">{t('Framework:', 'Framework:')} {frameworkLabel(item.framework)}</div>
                        {item.description ? <div className="text-sm text-slate-200">{item.description}</div> : null}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                          {item.references?.length ? (
                            <span>{t('Refs:', 'Refs:')} {item.references.join(', ')}</span>
                          ) : (
                            <span>{t('Refs: n/a', 'Refs: n/a')}</span>
                          )}
                          {item.evidence_types?.length ? (
                            <span>{t('Evidence:', 'Evidence:')} {item.evidence_types.join(', ')}</span>
                          ) : (
                            <span>{t('Evidence: n/a', 'Evidence: n/a')}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="text-sm text-slate-400">{t(
                  'No controls found for this selection.',
                  'No controls found for this selection.'
                )}</div>
              )}
            </div>
            <div className="rounded border border-[#1f365a] bg-[#0b1524] p-4 lg:sticky lg:top-24">
              <div className="text-sm font-semibold text-slate-100">{t('Control details', 'Control details')}</div>
              {!selectedControl ? (
                <div className="mt-2 text-sm text-slate-400">
                  {t(
                    'Select a control to review mappings and update coverage.',
                    'Select a control to review mappings and update coverage.'
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-2 text-sm font-semibold text-slate-100">{selectedControl.control_id}</div>
                  {selectedControl.description ? (
                    <div className="text-sm text-slate-200">{selectedControl.description}</div>
                  ) : null}
                  <div className="mt-3 text-xs text-slate-400">
                    {t('Framework:', 'Framework:')} {frameworkLabel(selectedControl.framework)}
                  </div>
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-200">{t('Mapped in', 'Mapped in')}</div>
                    {selectedControlMappings.length ? (
                      <div className="mt-2 space-y-2 text-xs text-slate-300">
                        {selectedControlMappings.map((entry, idx) => (
                          <div key={`${entry.connector}-${entry.instance}-${entry.node}-${idx}`}>
                            {formatSelectedControlMapping(entry)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">{t('Not mapped yet.', 'Not mapped yet.')}</div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-200">{t('Edit mapping', 'Edit mapping')}</div>
                    <div className="mt-2 grid gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={onAddMappingRow} disabled={!canEditMappings}>
                          {t('Add mapping row', 'Add mapping row')}
                        </Button>
                        <Button onClick={onSuggestMappings} disabled={!canEditMappings || !hasControlLibrary}>
                          {t('Auto-suggest', 'Auto-suggest')}
                        </Button>
                      </div>
                      <select
                        className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-xs text-slate-100"
                        value={selectedConnector}
                        onChange={(event) => onSelectedConnectorChange(event.target.value)}
                      >
                        {combinedConnectorOptions.map((connector) => (
                          <option key={connector} value={connector}>
                            {connector}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-xs text-slate-100"
                        value={selectedInstance}
                        onChange={(event) => onSelectedInstanceChange(event.target.value)}
                      >
                        {availableInstances.map((instance) => (
                          <option key={instance} value={instance}>
                            {instance}
                          </option>
                        ))}
                      </select>
                      {availableNodes.length ? (
                        <select
                          className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-xs text-slate-100"
                          value={selectedNode}
                          onChange={(event) => onSelectedNodeChange(event.target.value)}
                        >
                          <option value={allNodesValue}>{t('All nodes', 'All nodes')}</option>
                          {availableNodes.map((node) => (
                            <option key={node} value={node}>
                              {node}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <Button onClick={onToggleSelectedControlMapping} disabled={!canEditMappings}>
                        {isSelectedControlMapped ? 'Remove from selected' : 'Add to selected'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

type ControlCrosswalksPanelProps = {
  crosswalksReady: boolean
  crosswalksError: ApiError | null
  loadingCrosswalks: boolean
  crosswalks: ControlCrosswalkEntry[]
  visibleCrosswalks: ControlCrosswalkEntry[]
  hasMoreCrosswalks: boolean
  onShowMoreCrosswalks: () => void
  onShowAllCrosswalks: () => void
  addCrosswalk: () => void
  suggestCrosswalks: () => void
  saveCrosswalks: () => void
  crosswalkSaving: boolean
  expandAllCrosswalks: () => void
  collapseAllCrosswalks: () => void
  retryCrosswalks: () => void
  updateCrosswalk: (index: number, patch: Partial<ControlCrosswalkEntry>) => void
  addCrosswalkMapping: (index: number) => void
  updateCrosswalkMapping: (
    entryIndex: number,
    mappingIndex: number,
    patch: Partial<ControlCrosswalkMapping>,
  ) => void
  removeCrosswalkMapping: (entryIndex: number, mappingIndex: number) => void
  removeCrosswalk: (index: number) => void
  collapsedCrosswalks: Record<string, boolean>
  onToggleCrosswalkCollapse: (entry: ControlCrosswalkEntry, index: number) => void
  crosswalkKey: (entry: ControlCrosswalkEntry, index: number) => string
  frameworkOptions: FrameworkItem[]
  frameworkLabel: (key: string) => string
  hasControlLibrary: boolean
}

const ControlCrosswalksPanel = (
  {
    crosswalksReady,
    crosswalksError,
    loadingCrosswalks,
    crosswalks,
    visibleCrosswalks,
    hasMoreCrosswalks,
    onShowMoreCrosswalks,
    onShowAllCrosswalks,
    addCrosswalk,
    suggestCrosswalks,
    saveCrosswalks,
    crosswalkSaving,
    expandAllCrosswalks,
    collapseAllCrosswalks,
    retryCrosswalks,
    updateCrosswalk,
    addCrosswalkMapping,
    updateCrosswalkMapping,
    removeCrosswalkMapping,
    removeCrosswalk,
    collapsedCrosswalks,
    onToggleCrosswalkCollapse,
    crosswalkKey,
    frameworkOptions,
    frameworkLabel,
    hasControlLibrary,
  }: ControlCrosswalksPanelProps
) => {
  const {
    t
  } = useI18n();

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label>{t('Control crosswalks', 'Control crosswalks')}</Label>
          <div className="text-xs text-slate-400">{t(
            'Map equivalent controls across frameworks.',
            'Map equivalent controls across frameworks.'
          )}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addCrosswalk}>{t('Add crosswalk', 'Add crosswalk')}</Button>
          <Button onClick={suggestCrosswalks} disabled={!hasControlLibrary}>
            {t('Auto-suggest', 'Auto-suggest')}
          </Button>
          <Button onClick={saveCrosswalks} disabled={crosswalkSaving}>
            {crosswalkSaving ? 'Saving...' : 'Save crosswalks'}
          </Button>
          <Button onClick={expandAllCrosswalks} disabled={!crosswalks.length}>
            {t('Expand all', 'Expand all')}
          </Button>
          <Button onClick={collapseAllCrosswalks} disabled={!crosswalks.length}>
            {t('Collapse all', 'Collapse all')}
          </Button>
          {crosswalksError ? <Button onClick={retryCrosswalks}>{t('Retry', 'Retry')}</Button> : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {crosswalksError ? (
          <ErrorBox
            title={t('Failed to load control crosswalks', 'Failed to load control crosswalks')}
            detail={crosswalksError.bodyText || crosswalksError.message}
          />
        ) : !crosswalksReady || loadingCrosswalks ? (
          <InfoBox title={t('Loading crosswalks...', 'Loading crosswalks...')} />
        ) : crosswalks.length === 0 ? (
          <div className="text-sm text-slate-400">{t('No crosswalks defined yet.', 'No crosswalks defined yet.')}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <div>
                {t('Showing', 'Showing')} {Math.min(visibleCrosswalks.length, crosswalks.length)}of {crosswalks.length}
              </div>
              {hasMoreCrosswalks ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onShowMoreCrosswalks}>{t('Show more', 'Show more')}</Button>
                  <Button onClick={onShowAllCrosswalks}>{t('Show all', 'Show all')}</Button>
                </div>
              ) : null}
            </div>
            {visibleCrosswalks.map((entry, index) => {
              const {
                t
              } = useI18n();

              const key = crosswalkKey(entry, index)
              const isCollapsed = collapsedCrosswalks[key] ?? true
              return (
                <Card key={`${entry.primary_framework}-${entry.primary_control_id}-${index}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {entry.primary_control_id?.trim() || 'New crosswalk'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {`${frameworkLabel(entry.primary_framework)} -> ${entry.mappings.length} mapped`}
                      </div>
                    </div>
                    <button
                      className="text-xs text-slate-200 hover:text-white"
                      type="button"
                      onClick={() => onToggleCrosswalkCollapse(entry, index)}
                    >
                      {isCollapsed ? 'Expand' : 'Collapse'}
                    </button>
                  </div>
                  {isCollapsed ? null : (
                    <>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div>
                          <Label>{t('Primary framework', 'Primary framework')}</Label>
                          <select
                            className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                            value={entry.primary_framework}
                            onChange={(event) => updateCrosswalk(index, { primary_framework: event.target.value })}
                          >
                            {frameworkOptions.map((fw) => (
                              <option key={fw.key} value={fw.key}>
                                {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>{t('Primary control ID', 'Primary control ID')}</Label>
                          <Input
                            value={entry.primary_control_id}
                            onChange={(event) => updateCrosswalk(index, { primary_control_id: event.target.value })}
                            placeholder="change_management_controls"
                          />
                        </div>
                        <div>
                          <Label>{t('Notes', 'Notes')}</Label>
                          <Textarea
                            value={entry.notes || ''}
                            onChange={(event) => updateCrosswalk(index, { notes: event.target.value })}
                            rows={2}
                            placeholder={t(
                              'Optional rationale or alignment notes.',
                              'Optional rationale or alignment notes.'
                            )}
                          />
                        </div>
                      </div>
                      <div className="mt-3 space-y-3">
                        {entry.mappings.length === 0 ? (
                          <div className="text-sm text-slate-400">{t('No mapped controls yet.', 'No mapped controls yet.')}</div>
                        ) : (
                          entry.mappings.map((mapping, mappingIndex) => {
                            const {
                              t
                            } = useI18n();

                            return (
                              <div
                                key={`${mapping.framework}-${mapping.control_id}-${mappingIndex}`}
                                className="grid gap-3 md:grid-cols-3"
                              >
                                <div>
                                  <Label>{t('Mapped framework', 'Mapped framework')}</Label>
                                  <select
                                    className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                                    value={mapping.framework}
                                    onChange={(event) =>
                                      updateCrosswalkMapping(index, mappingIndex, { framework: event.target.value })
                                    }
                                  >
                                    {frameworkOptions.map((fw) => (
                                      <option key={fw.key} value={fw.key}>
                                        {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <Label>{t('Mapped control ID', 'Mapped control ID')}</Label>
                                  <Input
                                    value={mapping.control_id}
                                    onChange={(event) =>
                                      updateCrosswalkMapping(index, mappingIndex, { control_id: event.target.value })
                                    }
                                    placeholder="change_management_controls"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <Button onClick={() => removeCrosswalkMapping(index, mappingIndex)}>{t('Remove', 'Remove')}</Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <Button onClick={() => addCrosswalkMapping(index)}>{t('Add mapped control', 'Add mapped control')}</Button>
                        <Button onClick={() => removeCrosswalk(index)}>{t('Remove crosswalk', 'Remove crosswalk')}</Button>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}

type ControlMappingsPanelProps = {
  displayMappings: ControlMapping[]
  visibleMappings: ControlMapping[]
  hasSavedMappings: boolean
  hasMoreMappings: boolean
  onShowMoreMappings: () => void
  onShowAllMappings: () => void
  expandAllMappings: () => void
  collapseAllMappings: () => void
  collapsedMappings: Record<string, boolean>
  onToggleMappingCollapse: (mapping: ControlMapping, index: number) => void
  mappingKey: (mapping: ControlMapping, index: number) => string
  frameworkLabel: (key: string) => string
  frameworkOptions: FrameworkItem[]
  controlIdsByFramework: Record<string, string[]>
  updateMapping: (index: number, patch: Partial<ControlMapping>) => void
  removeMapping: (index: number) => void
  joinCsv: (values: string[]) => string
  splitCsv: (value: string) => string[]
}

const ControlMappingsPanel = (
  {
    displayMappings,
    visibleMappings,
    hasSavedMappings,
    hasMoreMappings,
    onShowMoreMappings,
    onShowAllMappings,
    expandAllMappings,
    collapseAllMappings,
    collapsedMappings,
    onToggleMappingCollapse,
    mappingKey,
    frameworkLabel,
    frameworkOptions,
    controlIdsByFramework,
    updateMapping,
    removeMapping,
    joinCsv,
    splitCsv,
  }: ControlMappingsPanelProps
) => {
  const {
    t
  } = useI18n();

  return (
    <div className="space-y-3">
      {!displayMappings.length ? (
        <div className="text-sm text-slate-400">{t(
          'No mappings for this connector yet.',
          'No mappings for this connector yet.'
        )}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400">
              {hasSavedMappings ? 'Saved mappings' : 'Draft mappings'} {t('- Showing', '- Showing')}{' '}
              {Math.min(visibleMappings.length, displayMappings.length)}of {displayMappings.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasMoreMappings ? (
                <>
                  <Button onClick={onShowMoreMappings}>{t('Show more', 'Show more')}</Button>
                  <Button onClick={onShowAllMappings}>{t('Show all', 'Show all')}</Button>
                </>
              ) : null}
              <Button onClick={expandAllMappings} disabled={!visibleMappings.length}>
                {t('Expand all', 'Expand all')}
              </Button>
              <Button onClick={collapseAllMappings} disabled={!visibleMappings.length}>
                {t('Collapse all', 'Collapse all')}
              </Button>
            </div>
          </div>
          {visibleMappings.map((mapping, index) => {
            const {
              t
            } = useI18n();

            const key = mappingKey(mapping, index)
            const isCollapsed = collapsedMappings[key] ?? true
            return (
              <Card key={`${mapping.framework}-${index}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{frameworkLabel(mapping.framework)}</div>
                    <div className="text-xs text-slate-400">
                      {mapping.control_ids.length ? joinCsv(mapping.control_ids) : 'No controls selected'}
                    </div>
                  </div>
                  <button
                    className="text-xs text-slate-200 hover:text-white"
                    type="button"
                    onClick={() => onToggleMappingCollapse(mapping, index)}
                  >
                    {isCollapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                {isCollapsed ? null : (
                  <>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <Label>{t('Framework', 'Framework')}</Label>
                        <select
                          className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                          value={mapping.framework}
                          onChange={(event) =>
                            updateMapping(index, { framework: event.target.value, control_ids: [] })
                          }
                        >
                          {frameworkOptions.map((fw) => (
                            <option key={fw.key} value={fw.key}>
                              {fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>{t('Control IDs', 'Control IDs')}</Label>
                        {controlIdsByFramework[mapping.framework]?.length ? (
                          <>
                            <select
                              multiple
                              className="h-36 w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
                              value={mapping.control_ids}
                              onChange={(event) => {
                                const selected = Array.from(event.target.selectedOptions).map(
                                  (option) => option.value,
                                )
                                updateMapping(index, { control_ids: selected })
                              }}
                            >
                              {controlIdsByFramework[mapping.framework].map((controlId) => (
                                <option key={controlId} value={controlId}>
                                  {controlId}
                                </option>
                              ))}
                            </select>
                            <div className="mt-2 text-xs text-slate-400">
                              {t(
                                'Hold Ctrl/Cmd to select multiple controls.',
                                'Hold Ctrl/Cmd to select multiple controls.'
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <Input
                              value={joinCsv(mapping.control_ids)}
                              onChange={(event) => updateMapping(index, { control_ids: splitCsv(event.target.value) })}
                              placeholder={t('A.5.8, Article 21(2)', 'A.5.8, Article 21(2)')}
                            />
                            <div className="mt-2 text-xs text-slate-400">
                              {t(
                                'No controls loaded for this framework yet.',
                                'No controls loaded for this framework yet.'
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div>
                        <Label>{t('Notes', 'Notes')}</Label>
                        <Textarea
                          value={mapping.notes || ''}
                          onChange={(event) => updateMapping(index, { notes: event.target.value })}
                          rows={2}
                          placeholder={t(
                            'Optional rationale or evidence pointer.',
                            'Optional rationale or evidence pointer.'
                          )}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button onClick={() => removeMapping(index)}>{t('Remove', 'Remove')}</Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

export function ControlMappingsPage() {
  const {
    t
  } = useI18n();

  const [frameworks, setFrameworks] = useState<FrameworkItem[]>([])
  const [controlLibrary, setControlLibrary] = useState<ControlLibraryEntry[]>([])
  const [libraryFramework, setLibraryFramework] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [crosswalks, setCrosswalks] = useState<ControlCrosswalkEntry[]>([])
  const [crosswalkMessage, setCrosswalkMessage] = useState<string | null>(null)
  const [crosswalkSaving, setCrosswalkSaving] = useState(false)
  const showLibrary = true
  const showCrosswalks = true
  const [libraryStatus, setLibraryStatus] = useState<LoadStatus>('idle')
  const [libraryError, setLibraryError] = useState<ApiError | null>(null)
  const [crosswalksStatus, setCrosswalksStatus] = useState<LoadStatus>('idle')
  const [crosswalksError, setCrosswalksError] = useState<ApiError | null>(null)
  const [showMappingEditor, setShowMappingEditor] = useState(true)
  const [connectorOptions, setConnectorOptions] = useState<string[]>([])
  const [connectorCatalog, setConnectorCatalog] = useState<
    Record<string, { label?: string; outputs: string[]; capabilities: string[] }>
  >({})
  const [instanceOptions, setInstanceOptions] = useState<Record<string, string[]>>({})
  const [nodeOptions, setNodeOptions] = useState<Record<string, string[]>>({})
  const [mappings, setMappings] = useState<ConnectorMapping[]>([])
  const [selectedConnector, setSelectedConnector] = useState('')
  const [selectedInstance, setSelectedInstance] = useState('')
  const [selectedNode, setSelectedNode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [collapsedCrosswalks, setCollapsedCrosswalks] = useState<Record<string, boolean>>({})
  const [collapsedMappings, setCollapsedMappings] = useState<Record<string, boolean>>({})
  const [libraryLimit, setLibraryLimit] = useState(LIBRARY_PAGE_SIZE)
  const [crosswalkLimit, setCrosswalkLimit] = useState(CROSSWALK_PAGE_SIZE)
  const [mappingLimit, setMappingLimit] = useState(MAPPING_PAGE_SIZE)
  const [selectedControlKey, setSelectedControlKey] = useState<string>('')
  const libraryReady = libraryStatus === 'ready'
  const crosswalksReady = crosswalksStatus === 'ready'
  const loadingLibrary = libraryStatus === 'loading'
  const loadingCrosswalks = crosswalksStatus === 'loading'
  const mappingConnectorOptions = useMemo(
    () => uniqueSorted(mappings.map((entry) => entry.connector).filter(Boolean)),
    [mappings],
  )
  const combinedConnectorOptions = useMemo(
    () => uniqueSorted([...connectorOptions, ...mappingConnectorOptions]),
    [connectorOptions, mappingConnectorOptions],
  )
  const preferredConnector = mappingConnectorOptions[0] || connectorOptions[0] || ''
  const shouldFetchConnectorConfig = useMemo(() => {
    if (!selectedConnector) return false
    return connectorOptions.includes(selectedConnector) || mappingConnectorOptions.includes(selectedConnector)
  }, [connectorOptions, mappingConnectorOptions, selectedConnector])
  const mappingInstanceOptions = useMemo(() => {
    if (!selectedConnector) return []
    return uniqueSorted(
      mappings
        .filter((entry) => entry.connector === selectedConnector)
        .map((entry) => entry.instance)
        .filter(Boolean),
    )
  }, [mappings, selectedConnector])
  const availableInstances = useMemo(() => {
    if (!selectedConnector) return []
    const configInstances = instanceOptions[selectedConnector] || []
    const merged = uniqueSorted([...mappingInstanceOptions, ...configInstances])
    return merged.length ? merged : ['default']
  }, [instanceOptions, mappingInstanceOptions, selectedConnector])
  const preferredInstance = useMemo(() => {
    if (!selectedConnector) return ''
    return mappingInstanceOptions[0] || (instanceOptions[selectedConnector] || [])[0] || 'default'
  }, [instanceOptions, mappingInstanceOptions, selectedConnector])
  const mappingNodes = useMemo(() => {
    if (!selectedConnector || !selectedInstance) return []
    return uniqueSorted(
      mappings
        .filter((entry) => entry.connector === selectedConnector && entry.instance === selectedInstance)
        .map((entry) => entry.node)
        .filter((node): node is string => typeof node === 'string' && node.length > 0),
    )
  }, [mappings, selectedConnector, selectedInstance])
  const availableNodes = useMemo(() => {
    if (!selectedConnector || !selectedInstance) return []
    const configNodes = nodeOptions[nodeKey(selectedConnector, selectedInstance)] || []
    return uniqueSorted([...configNodes, ...mappingNodes])
  }, [mappingNodes, nodeOptions, selectedConnector, selectedInstance])
  const hasAllNodesMapping = useMemo(() => {
    if (!selectedConnector || !selectedInstance) return false
    return mappings.some(
      (entry) =>
        entry.connector === selectedConnector &&
        entry.instance === selectedInstance &&
        (!entry.node || entry.node === ALL_NODES),
    )
  }, [mappings, selectedConnector, selectedInstance])

  const loadLibrary = useCallback(async (isCancelled: () => boolean) => {
    setLibraryStatus('loading')
    setLibraryError(null)
    try {
      const response = await apiJson<ControlLibraryResponse>('/config/control-library')
      if (isCancelled()) return
      setControlLibrary(response.items || [])
      setLibraryStatus('ready')
    } catch (err) {
      if (isCancelled()) return
      setLibraryError(err as ApiError)
      setLibraryStatus('error')
    }
  }, [])

  const loadCrosswalks = useCallback(async (isCancelled: () => boolean) => {
    setCrosswalksStatus('loading')
    setCrosswalksError(null)
    try {
      const response = await apiJson<ControlCrosswalksResponse>('/config/control-crosswalks')
      if (isCancelled()) return
      setCrosswalks(response.items || [])
      setCrosswalksStatus('ready')
    } catch (err) {
      if (isCancelled()) return
      setCrosswalksError(err as ApiError)
      setCrosswalksStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    const load = async () => {
      setError(null)
      setMessage(null)
      try {
        const frameworkResponse = await apiJson<FrameworksResponse>('/config/frameworks')
        if (!cancelled) setFrameworks(frameworkResponse.frameworks || [])
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
      await loadLibrary(isCancelled)
      try {
        const config = await apiJson<ConnectorsConfigResponse>('/config/connectors')
        const enabled = config.enabled || []
        if (!cancelled) setConnectorOptions(enabled)
        if (!cancelled) {
          const catalog = (config.catalog || []).reduce<
            Record<string, { label?: string; outputs: string[]; capabilities: string[] }>
          >((acc, entry) => {
            if (!entry?.name) return acc
            acc[entry.name] = {
              label: entry.label,
              outputs: entry.outputs || [],
              capabilities: entry.capabilities || [],
            }
            return acc
          }, {})
          setConnectorCatalog(catalog)
        }
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
      try {
        const response = await apiJson<ControlMappingsResponse>('/config/control-mappings')
        if (!cancelled) setMappings(normalizeControlMappings(response.items || []))
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      }
      await loadCrosswalks(isCancelled)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [loadCrosswalks, loadLibrary])

  useEffect(() => {
    if (!selectedConnector) return
    if (!shouldFetchConnectorConfig) {
      if (!instanceOptions[selectedConnector]) {
        setInstanceOptions((prev) => ({ ...prev, [selectedConnector]: ['default'] }))
      }
      return
    }
    if (instanceOptions[selectedConnector]) return
    let cancelled = false
    const fetchInstances = async () => {
      try {
        const payload = await apiJson<unknown>(`/config/connectors/${encodeURIComponent(selectedConnector)}`)
        const { instances, nodesByInstance } = normalizeInstancesAndNodes(payload)
        if (cancelled) return
        setInstanceOptions((prev) => ({ ...prev, [selectedConnector]: instances }))
        setNodeOptions((prev) => {
          const next = { ...prev }
          Object.entries(nodesByInstance).forEach(([instance, nodes]) => {
            next[nodeKey(selectedConnector, instance)] = nodes
          })
          return next
        })
      } catch (err) {
        if (!cancelled) {
          const apiError = err as ApiError
          if (apiError?.status === 404) {
            // Some connectors have no config endpoint; fall back to a default instance.
            setInstanceOptions((prev) => ({ ...prev, [selectedConnector]: ['default'] }))
          } else {
            setError(apiError)
            // prevent endless refetch loops when a connector config endpoint is misconfigured
            setInstanceOptions((prev) => ({ ...prev, [selectedConnector]: [] }))
          }
        }
      }
    }
    void fetchInstances()
    return () => {
      cancelled = true
    }
  }, [instanceOptions, selectedConnector, shouldFetchConnectorConfig])

  useEffect(() => {
    if (!combinedConnectorOptions.length) return
    if (!selectedConnector || !combinedConnectorOptions.includes(selectedConnector)) {
      if (preferredConnector) {
        setSelectedConnector(preferredConnector)
      } else {
        setSelectedConnector(combinedConnectorOptions[0])
      }
    }
  }, [combinedConnectorOptions, preferredConnector, selectedConnector])

  useEffect(() => {
    if (!selectedConnector) return
    if (!availableInstances.length) {
      setSelectedInstance('')
      return
    }
    if (!selectedInstance || !availableInstances.includes(selectedInstance)) {
      setSelectedInstance(preferredInstance || availableInstances[0])
    }
  }, [availableInstances, preferredInstance, selectedConnector, selectedInstance])

  useEffect(() => {
    if (!selectedConnector || !selectedInstance) {
      setSelectedNode(ALL_NODES)
      return
    }
    const choices = availableNodes.length ? [ALL_NODES, ...availableNodes] : [ALL_NODES]
    if (!selectedNode || !choices.includes(selectedNode)) {
      const preferred = !hasAllNodesMapping && availableNodes.length ? availableNodes[0] : ALL_NODES
      setSelectedNode(preferred)
      return
    }
    if (selectedNode === ALL_NODES && !hasAllNodesMapping && availableNodes.length) {
      setSelectedNode(availableNodes[0])
    }
  }, [availableNodes, hasAllNodesMapping, selectedConnector, selectedInstance, selectedNode])

  useEffect(() => {
    if (!controlLibrary.length) return
    if (!libraryFramework) return
    const available = new Set(controlLibrary.map((item) => item.framework))
    if (!available.has(libraryFramework)) {
      setLibraryFramework('')
    }
  }, [controlLibrary, libraryFramework])

  useEffect(() => {
    setLibraryLimit(LIBRARY_PAGE_SIZE)
  }, [libraryFramework, librarySearch])

  useEffect(() => {
    setCrosswalkLimit(CROSSWALK_PAGE_SIZE)
  }, [crosswalks.length])

  const libraryFrameworkOptions = useMemo(() => {
    return Array.from(new Set(controlLibrary.map((item) => item.framework))).sort()
  }, [controlLibrary])

  const frameworkOptions = useMemo(() => {
    const seen = new Map<string, FrameworkItem>()
    frameworks.forEach((fw) => {
      if (!fw.key) return
      seen.set(fw.key, fw)
    })
    libraryFrameworkOptions.forEach((key) => {
      if (!key || seen.has(key)) return
      seen.set(key, { key })
    })
    return Array.from(seen.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [frameworks, libraryFrameworkOptions])

  const frameworkKeyLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    const add = (raw: string | undefined, key: string) => {
      if (!raw) return
      const normalized = raw.toLowerCase()
      lookup.set(normalized, key)
      const slug = normalizeFrameworkSlug(raw)
      if (slug) lookup.set(slug, key)
    }
    frameworkOptions.forEach((fw) => {
      if (!fw.key) return
      add(fw.key, fw.key)
      if (fw.name) add(fw.name, fw.key)
      const label = fw.name ? `${fw.name}${fw.version ? ` ${fw.version}` : ''}` : fw.key
      add(label, fw.key)
    })
    return lookup
  }, [frameworkOptions])

  const normalizeFrameworkKey = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return trimmed
      const direct = frameworkKeyLookup.get(trimmed.toLowerCase())
      if (direct) return direct
      const slug = normalizeFrameworkSlug(trimmed)
      return frameworkKeyLookup.get(slug) ?? trimmed
    },
    [frameworkKeyLookup],
  )

  const currentEntry = useMemo(() => {
    const nodeValue = selectedNode || ALL_NODES
    return mappings.find(
      (entry) =>
        entry.connector === selectedConnector &&
        entry.instance === selectedInstance &&
        (entry.node || ALL_NODES) === nodeValue,
    )
  }, [mappings, selectedConnector, selectedInstance, selectedNode])

  const currentMappings = currentEntry?.mappings ?? EMPTY_MAPPINGS
  const displayMappings = useMemo(() => {
    const sourceMappings = currentMappings.length
      ? currentMappings
      : showMappingEditor
      ? (libraryFrameworkOptions.length ? libraryFrameworkOptions : frameworks.map((fw) => fw.key)).map(
          (framework) => ({ framework, control_ids: [], notes: '' }),
        )
      : []
    if (!sourceMappings.length) return []
    return sourceMappings.map((mapping) => ({
      ...mapping,
      framework: normalizeFrameworkKey(mapping.framework),
    }))
  }, [currentMappings, frameworks, libraryFrameworkOptions, normalizeFrameworkKey, showMappingEditor])
  const hasSavedMappings = currentMappings.length > 0

  useEffect(() => {
    setMappingLimit(MAPPING_PAGE_SIZE)
  }, [selectedConnector, selectedInstance, selectedNode, currentMappings.length])

  const filteredLibrary = useMemo(() => {
    if (!showLibrary) return []
    const search = librarySearch.trim().toLowerCase()
    return controlLibrary.filter((item) => {
      if (libraryFramework && item.framework !== libraryFramework) return false
      if (!search) return true
      const haystack = [
        item.control_id,
        item.description,
        (item.references || []).join(' '),
        (item.tags || []).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [controlLibrary, libraryFramework, librarySearch, showLibrary])

  const visibleLibrary = useMemo(
    () => filteredLibrary.slice(0, libraryLimit),
    [filteredLibrary, libraryLimit],
  )
  const hasMoreLibrary = filteredLibrary.length > visibleLibrary.length

  useEffect(() => {
    if (!showLibrary) return
    if (!filteredLibrary.length) {
      if (selectedControlKey) setSelectedControlKey('')
      return
    }
    const stillVisible = filteredLibrary.some((entry) => controlKey(entry) === selectedControlKey)
    if (!selectedControlKey || !stillVisible) {
      setSelectedControlKey(controlKey(filteredLibrary[0]))
    }
  }, [showLibrary, filteredLibrary, selectedControlKey])

  const visibleCrosswalks = useMemo(
    () => (showCrosswalks ? crosswalks.slice(0, crosswalkLimit) : []),
    [crosswalkLimit, crosswalks, showCrosswalks],
  )
  const hasMoreCrosswalks = crosswalks.length > visibleCrosswalks.length

  const visibleMappings = useMemo(
    () => (showMappingEditor ? displayMappings.slice(0, mappingLimit) : []),
    [displayMappings, mappingLimit, showMappingEditor],
  )
  const hasMoreMappings = displayMappings.length > visibleMappings.length
  const selectedControl = useMemo(
    () => controlLibrary.find((entry) => controlKey(entry) === selectedControlKey) || null,
    [controlLibrary, selectedControlKey],
  )
  const controlIdsByFramework = useMemo(() => {
    const grouped: Record<string, string[]> = {}
    controlLibrary.forEach((entry) => {
      if (!entry.framework || !entry.control_id) return
      grouped[entry.framework] ||= []
      grouped[entry.framework].push(entry.control_id)
    })
    Object.keys(grouped).forEach((key) => {
      grouped[key] = Array.from(new Set(grouped[key])).sort()
    })
    return grouped
  }, [controlLibrary])

  const frameworkLabel = (key: string) => {
    const match = frameworkOptions.find((fw) => fw.key === key)
    if (!match) return key
    if (match.name) return `${match.name}${match.version ? ` ${match.version}` : ''}`
    return match.key
  }

  const crosswalkKey = (entry: ControlCrosswalkEntry, index: number) =>
    `${entry.primary_framework}:${entry.primary_control_id || 'new'}:${index}`

  const mappingKey = (mapping: ControlMapping, index: number) =>
    `${mapping.framework}:${mapping.control_ids.join('|')}:${index}`

  const suggestCrosswalks = () => {
    if (!controlLibrary.length) {
      setMessage('Load the control library before generating crosswalks.')
      return
    }
    const libraryByFramework = controlLibrary.reduce<Record<string, ControlLibraryEntry[]>>((acc, entry) => {
      if (!entry.framework) return acc
      acc[entry.framework] ||= []
      acc[entry.framework].push(entry)
      return acc
    }, {})

    const frameworkOrder = frameworkOptions.map((fw) => fw.key)
    const getFrameworkOrder = (framework: string) => {
      const index = frameworkOrder.indexOf(framework)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }

    const suggestions: ControlCrosswalkEntry[] = []
    controlLibrary.forEach((primary) => {
      const primaryTokens = tokensForEntry(primary)
      if (!primaryTokens.length) return
      const candidateMatches = new Map<string, { control_id: string; score: number }>()
      Object.entries(libraryByFramework).forEach(([framework, entries]) => {
        if (framework === primary.framework) return
        let best: { control_id: string; score: number } | null = null
        entries.forEach((candidate) => {
          const candidateTokens = tokensForEntry(candidate)
          const score = scoreTokenOverlap(primaryTokens, candidateTokens)
          if (score < 0.34) return
          if (!best || score > best.score) {
            best = { control_id: candidate.control_id, score }
          }
        })
        if (best) {
          candidateMatches.set(framework, best)
        }
      })
      if (!candidateMatches.size) return
      const mappings = Array.from(candidateMatches.entries())
        .sort(([a], [b]) => getFrameworkOrder(a) - getFrameworkOrder(b))
        .map(([framework, match]) => ({ framework, control_id: match.control_id }))
      suggestions.push({
        primary_framework: primary.framework,
        primary_control_id: primary.control_id,
        mappings,
        notes: 'Auto-suggested by shared evidence tags.',
      })
    })

    if (!suggestions.length) {
      setMessage('No crosswalk suggestions matched. Add crosswalks manually if needed.')
      return
    }

    setCrosswalks(suggestions)
    setCrosswalkMessage(`Generated ${suggestions.length} crosswalk suggestion(s). Review and save.`)
  }

  const suggestMappings = () => {
    if (!selectedConnector || !selectedInstance) return
    const catalogEntry = connectorCatalog[selectedConnector]
    if (!catalogEntry) {
      setMessage('No connector metadata available for auto-suggest.')
      return
    }

    const outputs = new Set(catalogEntry.outputs.map(normalizeToken))
    const capabilities = new Set(catalogEntry.capabilities.map(normalizeToken))
    const signalTokens = new Set([...outputs, ...capabilities, normalizeToken(selectedConnector)])

    const suggestedByFramework: Record<string, string[]> = {}
    controlLibrary.forEach((entry) => {
      if (!entry.framework || !entry.control_id) return
      const evidenceTypes = entry.evidence_types || []
      const tags = entry.tags || []
      const evidenceMatch = evidenceTypes.some((value) =>
        expandEvidenceType(value).some((candidate) => outputs.has(candidate)),
      )
      const tagMatch = tags.some((tag) => signalTokens.has(normalizeToken(tag)))
      if (!evidenceMatch && !tagMatch) return
      suggestedByFramework[entry.framework] ||= []
      suggestedByFramework[entry.framework].push(entry.control_id)
    })

    const suggested = Object.entries(suggestedByFramework).map(([framework, controlIds]) => ({
      framework,
      control_ids: uniqueSorted(controlIds),
      notes: '',
    }))

    if (!suggested.length) {
      setMessage('No auto-suggested mappings matched this connector.')
      return
    }

    setShowMappingEditor(true)
    const updated = buildUpdatedMappings(suggested)
    setMappings(updated)
    void saveMappingsPayload(
      updated,
      `Auto-suggested and saved ${suggested.length} framework mapping(s).`,
    )
  }

  const selectedControlMappings = useMemo(() => {
    if (!selectedControl) return []
    const matches: Array<{
      connector: string
      instance: string
      node?: string | null
      notes?: string | null
    }> = []
    mappings.forEach((entry) => {
      entry.mappings.forEach((mapping) => {
        if (mapping.framework !== selectedControl.framework) return
        if (!mapping.control_ids.includes(selectedControl.control_id)) return
        matches.push({
          connector: entry.connector,
          instance: entry.instance,
          node: entry.node || ALL_NODES,
          notes: mapping.notes,
        })
      })
    })
    return matches
  }, [mappings, selectedControl])

  const currentMappingForSelectedControl = useMemo(() => {
    if (!selectedControl) return null
    return currentMappings.find((mapping) => mapping.framework === selectedControl.framework) || null
  }, [currentMappings, selectedControl])

  const isSelectedControlMapped =
    !!selectedControl &&
    !!currentMappingForSelectedControl &&
    currentMappingForSelectedControl.control_ids.includes(selectedControl.control_id)

  const toggleControlMapping = (control: ControlLibraryEntry) => {
    if (!selectedConnector || !selectedInstance) return
    const updated = currentMappings.map((mapping) => ({ ...mapping }))
    const targetIndex = updated.findIndex((mapping) => mapping.framework === control.framework)
    if (targetIndex === -1) {
      updateCurrentMappings([
        ...currentMappings,
        { framework: control.framework, control_ids: [control.control_id], notes: '' },
      ])
      return
    }
    const target = updated[targetIndex]
    const ids = new Set(target.control_ids)
    if (ids.has(control.control_id)) {
      ids.delete(control.control_id)
    } else {
      ids.add(control.control_id)
    }
    const nextIds = Array.from(ids)
    if (!nextIds.length) {
      updated.splice(targetIndex, 1)
    } else {
      updated[targetIndex] = { ...target, control_ids: nextIds }
    }
    updateCurrentMappings(updated)
  }

  const toggleSelectedControlMapping = () => {
    if (!selectedControl || !selectedConnector || !selectedInstance) return
    const updated = currentMappings.map((mapping) => ({ ...mapping }))
    const targetIndex = updated.findIndex((mapping) => mapping.framework === selectedControl.framework)
    if (targetIndex === -1) {
      updateCurrentMappings([
        ...currentMappings,
        { framework: selectedControl.framework, control_ids: [selectedControl.control_id], notes: '' },
      ])
      return
    }

    const target = updated[targetIndex]
    const ids = new Set(target.control_ids)
    if (ids.has(selectedControl.control_id)) {
      ids.delete(selectedControl.control_id)
    } else {
      ids.add(selectedControl.control_id)
    }
    const nextIds = Array.from(ids)
    if (!nextIds.length) {
      updated.splice(targetIndex, 1)
    } else {
      updated[targetIndex] = { ...target, control_ids: nextIds }
    }
    updateCurrentMappings(updated)
  }

  useEffect(() => {
    if (!showCrosswalks) return
    setCollapsedCrosswalks((prev) => {
      const next = { ...prev }
      let changed = false
      visibleCrosswalks.forEach((entry, index) => {
        const key = crosswalkKey(entry, index)
        if (next[key] === undefined) {
          next[key] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [showCrosswalks, visibleCrosswalks])

  useEffect(() => {
    if (!showMappingEditor) return
    setCollapsedMappings((prev) => {
      const next = { ...prev }
      let changed = false
      visibleMappings.forEach((mapping, index) => {
        const key = mappingKey(mapping, index)
        if (next[key] === undefined) {
          next[key] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [showMappingEditor, visibleMappings])

  const addCrosswalk = () => {
    const defaultFramework = frameworkOptions[0]?.key || libraryFramework || ''
    setCrosswalks((prev) => [
      ...prev,
      {
        primary_framework: defaultFramework,
        primary_control_id: '',
        mappings: [],
        notes: '',
      },
    ])
  }

  const updateCrosswalk = (index: number, patch: Partial<ControlCrosswalkEntry>) => {
    setCrosswalks((prev) => prev.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)))
  }

  const addCrosswalkMapping = (index: number) => {
    setCrosswalks((prev) =>
      prev.map((entry, idx) =>
        idx === index
          ? {
              ...entry,
              mappings: [...entry.mappings, { framework: frameworkOptions[0]?.key || '', control_id: '' }],
            }
          : entry,
      ),
    )
  }

  const updateCrosswalkMapping = (
    entryIndex: number,
    mappingIndex: number,
    patch: Partial<ControlCrosswalkMapping>,
  ) => {
    setCrosswalks((prev) =>
      prev.map((entry, idx) => {
        if (idx !== entryIndex) return entry
        const nextMappings = entry.mappings.map((mapping, mIdx) =>
          mIdx === mappingIndex ? { ...mapping, ...patch } : mapping,
        )
        return { ...entry, mappings: nextMappings }
      }),
    )
  }

  const removeCrosswalkMapping = (entryIndex: number, mappingIndex: number) => {
    setCrosswalks((prev) =>
      prev.map((entry, idx) => {
        if (idx !== entryIndex) return entry
        return { ...entry, mappings: entry.mappings.filter((_, mIdx) => mIdx !== mappingIndex) }
      }),
    )
  }

  const removeCrosswalk = (index: number) => {
    setCrosswalks((prev) => prev.filter((_, idx) => idx !== index))
  }

  const saveCrosswalks = async () => {
    setCrosswalkSaving(true)
    setCrosswalkMessage(null)
    setError(null)
    try {
      const payload: ControlCrosswalksResponse = { items: crosswalks }
      await apiJson<ControlCrosswalksResponse>('/config/control-crosswalks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setCrosswalkMessage('Control crosswalks saved.')
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setCrosswalkSaving(false)
    }
  }

  const buildUpdatedMappings = (next: ControlMapping[]) => {
    if (!selectedConnector || !selectedInstance) return mappings
    const nodeValue = selectedNode || ALL_NODES
    const updated = mappings.filter(
      (entry) =>
        !(
          entry.connector === selectedConnector &&
          entry.instance === selectedInstance &&
          (entry.node || ALL_NODES) === nodeValue
        ),
    )
    updated.push({
      connector: selectedConnector,
      instance: selectedInstance,
      node: nodeValue === ALL_NODES ? undefined : nodeValue,
      mappings: next,
    })
    return updated
  }

  const updateCurrentMappings = (next: ControlMapping[]) => {
    if (!selectedConnector || !selectedInstance) return
    setMappings(buildUpdatedMappings(next))
  }

  const retryLibrary = () => {
    void loadLibrary(() => false)
  }

  const retryCrosswalks = () => {
    void loadCrosswalks(() => false)
  }

  const addMapping = () => {
    const defaultFramework = frameworkOptions[0]?.key || ''
    updateCurrentMappings([
      ...currentMappings,
      { framework: defaultFramework, control_ids: [], notes: '' },
    ])
  }

  const expandAllCrosswalks = () => {
    setCollapsedCrosswalks((prev) => {
      const next = { ...prev }
      visibleCrosswalks.forEach((entry, index) => {
        next[crosswalkKey(entry, index)] = false
      })
      return next
    })
  }

  const collapseAllCrosswalks = () => {
    setCollapsedCrosswalks((prev) => {
      const next = { ...prev }
      visibleCrosswalks.forEach((entry, index) => {
        next[crosswalkKey(entry, index)] = true
      })
      return next
    })
  }

  const expandAllMappings = () => {
    setCollapsedMappings((prev) => {
      const next = { ...prev }
      visibleMappings.forEach((mapping, index) => {
        next[mappingKey(mapping, index)] = false
      })
      return next
    })
  }

  const collapseAllMappings = () => {
    setCollapsedMappings((prev) => {
      const next = { ...prev }
      visibleMappings.forEach((mapping, index) => {
        next[mappingKey(mapping, index)] = true
      })
      return next
    })
  }

  const updateMapping = (index: number, patch: Partial<ControlMapping>) => {
    const next = displayMappings.map((mapping, idx) =>
      idx === index ? { ...mapping, ...patch } : mapping,
    )
    updateCurrentMappings(next)
  }

  const removeMapping = (index: number) => {
    updateCurrentMappings(displayMappings.filter((_, idx) => idx !== index))
  }

  const canEditMappings = Boolean(selectedConnector && selectedInstance)
  const hasControlLibrary = controlLibrary.length > 0
  const mappingScopeLabel = `${selectedConnector || 'No connector selected'} / ${selectedInstance || 'default'} / ${
    selectedNode && selectedNode !== ALL_NODES ? selectedNode : 'all nodes'
  }`
  const formatSelectedControlMapping = (entry: SelectedControlMappingEntry) => {
    const nodeValue = entry.node || ALL_NODES
    const nodeLabel = nodeValue !== ALL_NODES ? ` / ${nodeValue}` : ' / all nodes'
    const notesLabel = entry.notes ? ` - ${entry.notes}` : ''
    return `${entry.connector} / ${entry.instance}${nodeLabel}${notesLabel}`
  }
  const handleAddMappingRow = () => {
    setShowMappingEditor(true)
    addMapping()
  }
  const handleToggleCrosswalkCollapse = (entry: ControlCrosswalkEntry, index: number) => {
    setCollapsedCrosswalks((prev) => {
      const key = crosswalkKey(entry, index)
      return { ...prev, [key]: !(prev[key] ?? true) }
    })
  }
  const handleToggleMappingCollapse = (mapping: ControlMapping, index: number) => {
    setCollapsedMappings((prev) => {
      const key = mappingKey(mapping, index)
      return { ...prev, [key]: !(prev[key] ?? true) }
    })
  }

  const saveMappingsPayload = async (
    payloadItems?: ConnectorMapping[],
    messageOverride?: string,
  ) => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const payloadItemsResolved = payloadItems || mappings
      const payload: ControlMappingsResponse = { items: payloadItemsResolved }
      await apiJson<ControlMappingsResponse>('/config/control-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (payloadItems) {
        setMappings(payloadItemsResolved)
      }
      setMessage(messageOverride || 'Control mappings saved.')
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setSaving(false)
    }
  }

  const saveMappings = async () => {
    await saveMappingsPayload()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>{t('Control Mappings', 'Control Mappings')}</PageTitle>
          <p className="text-sm text-slate-400">
            {t(
              'Map connector evidence to framework controls to document coverage and gaps.',
              'Map connector evidence to framework controls to document coverage and gaps.'
            )}
          </p>
        </div>
        <Button onClick={saveMappings} disabled={saving || !selectedConnector || !selectedInstance}>
          {saving ? 'Saving...' : 'Save mappings'}
        </Button>
      </div>
      {error ? <ErrorBox title={t('Control mappings error', 'Control mappings error')} detail={error.message} /> : null}
      {message ? <InfoBox title={message} /> : null}
      {crosswalkMessage ? <InfoBox title={crosswalkMessage} /> : null}
      <ControlLibraryPanel
        libraryReady={libraryReady}
        libraryError={libraryError}
        loadingLibrary={loadingLibrary}
        retryLibrary={retryLibrary}
        libraryFramework={libraryFramework}
        libraryFrameworkOptions={libraryFrameworkOptions}
        onLibraryFrameworkChange={setLibraryFramework}
        librarySearch={librarySearch}
        onLibrarySearchChange={setLibrarySearch}
        frameworkLabel={frameworkLabel}
        filteredLibrary={filteredLibrary}
        visibleLibrary={visibleLibrary}
        hasMoreLibrary={hasMoreLibrary}
        onShowMoreLibrary={() => setLibraryLimit((prev) => prev + LIBRARY_PAGE_SIZE)}
        onShowAllLibrary={() => setLibraryLimit(filteredLibrary.length)}
        selectedControlKey={selectedControlKey}
        onSelectControlKey={setSelectedControlKey}
        controlKey={controlKey}
        currentMappings={currentMappings}
        onToggleControlMapping={toggleControlMapping}
        canEditMappings={canEditMappings}
        mappingScopeLabel={mappingScopeLabel}
        onAddMappingRow={handleAddMappingRow}
        onSuggestMappings={suggestMappings}
        hasControlLibrary={hasControlLibrary}
        selectedControl={selectedControl}
        selectedControlMappings={selectedControlMappings}
        formatSelectedControlMapping={formatSelectedControlMapping}
        combinedConnectorOptions={combinedConnectorOptions}
        selectedConnector={selectedConnector}
        onSelectedConnectorChange={setSelectedConnector}
        availableInstances={availableInstances}
        selectedInstance={selectedInstance}
        onSelectedInstanceChange={setSelectedInstance}
        availableNodes={availableNodes}
        selectedNode={selectedNode}
        onSelectedNodeChange={setSelectedNode}
        allNodesValue={ALL_NODES}
        isSelectedControlMapped={isSelectedControlMapped}
        onToggleSelectedControlMapping={toggleSelectedControlMapping}
      />
      <ControlCrosswalksPanel
        crosswalksReady={crosswalksReady}
        crosswalksError={crosswalksError}
        loadingCrosswalks={loadingCrosswalks}
        crosswalks={crosswalks}
        visibleCrosswalks={visibleCrosswalks}
        hasMoreCrosswalks={hasMoreCrosswalks}
        onShowMoreCrosswalks={() => setCrosswalkLimit((prev) => prev + CROSSWALK_PAGE_SIZE)}
        onShowAllCrosswalks={() => setCrosswalkLimit(crosswalks.length)}
        addCrosswalk={addCrosswalk}
        suggestCrosswalks={suggestCrosswalks}
        saveCrosswalks={saveCrosswalks}
        crosswalkSaving={crosswalkSaving}
        expandAllCrosswalks={expandAllCrosswalks}
        collapseAllCrosswalks={collapseAllCrosswalks}
        retryCrosswalks={retryCrosswalks}
        updateCrosswalk={updateCrosswalk}
        addCrosswalkMapping={addCrosswalkMapping}
        updateCrosswalkMapping={updateCrosswalkMapping}
        removeCrosswalkMapping={removeCrosswalkMapping}
        removeCrosswalk={removeCrosswalk}
        collapsedCrosswalks={collapsedCrosswalks}
        onToggleCrosswalkCollapse={handleToggleCrosswalkCollapse}
        crosswalkKey={crosswalkKey}
        frameworkOptions={frameworkOptions}
        frameworkLabel={frameworkLabel}
        hasControlLibrary={hasControlLibrary}
      />
      <ControlMappingsPanel
        displayMappings={displayMappings}
        visibleMappings={visibleMappings}
        hasSavedMappings={hasSavedMappings}
        hasMoreMappings={hasMoreMappings}
        onShowMoreMappings={() => setMappingLimit((prev) => prev + MAPPING_PAGE_SIZE)}
        onShowAllMappings={() => setMappingLimit(displayMappings.length)}
        expandAllMappings={expandAllMappings}
        collapseAllMappings={collapseAllMappings}
        collapsedMappings={collapsedMappings}
        onToggleMappingCollapse={handleToggleMappingCollapse}
        mappingKey={mappingKey}
        frameworkLabel={frameworkLabel}
        frameworkOptions={frameworkOptions}
        controlIdsByFramework={controlIdsByFramework}
        updateMapping={updateMapping}
        removeMapping={removeMapping}
        joinCsv={joinCsv}
        splitCsv={splitCsv}
      />
    </div>
  );
}
