'use client'

// NetworkMapSigma.tsx — sigma.js + graphology renderer for the
// network map. Drop-in replacement for the SVG NetworkMap with the
// same data shape (MapNode[] + MapEdge[] + siteOrder[]), but a real
// force-directed layout (ForceAtlas2, the Gephi algorithm) and
// WebGL/canvas rendering that handles 1000+ nodes without choking.
//
// Sites are encoded as initial circular cluster seeds — ForceAtlas2
// then pulls highly-connected nodes together inside each cluster
// while inter-site edges stretch and end up colour-coded as red
// "pipes" between cluster centres. Operators get the Gephi look
// without having to leave the browser.

import { useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import forceAtlas2Layout from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import type { Settings as SigmaSettings } from 'sigma/settings'

export type MapNode = { id: string; label: string; site: string; assetType: string }
export type MapEdge = { from: string; to: string; subtype: string }

const MAIN_TYPES = new Set(['Intersite_Link', 'Port_Channel', 'Switch_Link'])

const SUBTYPE_COLOR: Record<string, string> = {
  Intersite_Link: '#C73030',
  Port_Channel: '#1C68C7',
  Switch_Link: '#8CC0F2',
}

const ROLE_COLOR: Record<string, string> = {
  network: '#03234A',
  host: '#1C68C7',
  server: '#3E92E6',
  firewall: '#993C1D',
  storage: '#534AB7',
  generic: '#807e76',
}

const SITE_PALETTE = ['#1C68C7', '#534AB7', '#199E78', '#ED9314', '#993C1D', '#3E92E6']

function nodeKind(assetType: string): keyof typeof ROLE_COLOR {
  const t = (assetType || '').toLowerCase()
  if (t === 'network_device' || t === 'switch' || t === 'router') return 'network'
  if (t === 'host' || t === 'esxi_host' || t === 'hypervisor') return 'host'
  if (t === 'server') return 'server'
  if (t === 'firewall' || t === 'firewall_manager') return 'firewall'
  if (t === 'storage_array' || t === 'storage_appliance' || t === 'storage_volume') return 'storage'
  return 'generic'
}

function siteAccent(site: string): string {
  if (site === 'unassigned') return '#807e76'
  let hash = 0
  for (let i = 0; i < site.length; i++) {
    hash = (hash * 31 + site.charCodeAt(i)) >>> 0
  }
  return SITE_PALETTE[hash % SITE_PALETTE.length]
}

export type SigmaSelection =
  | { kind: 'node'; node: MapNode; connectedCount: number }
  | { kind: 'edge'; edge: MapEdge; fromLabel: string; toLabel: string; fromSite: string; toSite: string }
  | null

export function NetworkMapSigma({
  data,
  onSelect,
}: {
  data: { nodes: MapNode[]; edges: MapEdge[]; siteOrder: string[] }
  onSelect?: (selection: SigmaSelection) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const [mounted, setMounted] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [panel, setPanel] = useState<SigmaSelection>(null)

  // Build (and rebuild when data changes) the graphology Graph +
  // run ForceAtlas2 to settle initial positions. The graph is then
  // handed to sigma for live rendering.
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const graph = new Graph({ multi: false, type: 'undirected' })
    graphRef.current = graph

    // Initial position: place sites on a ring, scatter each site's
    // nodes around its centre. This gives ForceAtlas2 a sensible
    // seed so the final layout cleanly separates the data centres.
    const siteCount = Math.max(data.siteOrder.length, 1)
    const RING_R = 600
    const siteCenters: Record<string, { x: number; y: number }> = {}
    data.siteOrder.forEach((site, i) => {
      const angle = (i / siteCount) * Math.PI * 2
      siteCenters[site] = { x: Math.cos(angle) * RING_R, y: Math.sin(angle) * RING_R }
    })

    const nodesBySite: Record<string, number> = {}
    for (const node of data.nodes) {
      const center = siteCenters[node.site] ?? { x: 0, y: 0 }
      // Scatter within an inner radius around the site centre.
      const offset = (nodesBySite[node.site] = (nodesBySite[node.site] ?? 0) + 1)
      const localAngle = (offset / 6) * Math.PI * 2
      const localR = 60 + (offset % 3) * 25
      const role = nodeKind(node.assetType)
      graph.addNode(node.id, {
        x: center.x + Math.cos(localAngle) * localR,
        y: center.y + Math.sin(localAngle) * localR,
        size: role === 'network' ? 11 : 7,
        label: shortenLabel(node.label),
        fullLabel: node.label,
        site: node.site,
        assetType: node.assetType,
        color: ROLE_COLOR[role],
        roleKind: role,
        siteAccent: siteAccent(node.site),
      })
    }

    // Edges: skip duplicates between the same pair (sigma's
    // simple-graph mode treats them as one).
    const edgeMeta: Record<string, MapEdge> = {}
    for (const edge of data.edges) {
      if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue
      // Skip duplicate undirected edge between the same pair.
      if (graph.hasEdge(edge.from, edge.to)) continue
      const color = SUBTYPE_COLOR[edge.subtype] ?? '#807e76'
      const id = graph.addEdge(edge.from, edge.to, {
        size: edge.subtype === 'Intersite_Link' ? 3 : 1.5,
        color,
        subtype: edge.subtype,
        type: edge.subtype === 'Switch_Link' ? 'arrow' : 'line',
      })
      edgeMeta[id] = edge
    }

    // ForceAtlas2 — 300 iterations is plenty for our scale and
    // settles in <300 ms on commodity hardware. Tunings biased
    // toward "spread out enough to read labels" rather than
    // "tightly clustered".
    forceAtlas2Layout.assign(graph, {
      iterations: 300,
      settings: {
        gravity: 0.4,
        scalingRatio: 12,
        slowDown: 4,
        barnesHutOptimize: data.nodes.length > 80,
        adjustSizes: true,
      },
    })

    // Sigma instance. We use mostly defaults — colours/sizes are
    // driven by node + edge attributes.
    const settings: Partial<SigmaSettings> = {
      renderLabels: true,
      labelColor: { color: '#14130f' },
      labelSize: 11,
      labelWeight: '500',
      labelFont: 'var(--font-sans), -apple-system, "Segoe UI", Roboto, sans-serif',
      labelRenderedSizeThreshold: 6,
      defaultEdgeColor: '#807e76',
      enableEdgeEvents: true,
      // Reducers fire on every frame for every node/edge — used here
      // to apply hover dimming + selection highlight without
      // rebuilding the graph.
      nodeReducer: (id, attrs) => {
        const dimmed =
          (hoveredNode !== null && hoveredNode !== id && !graph.areNeighbors(hoveredNode, id)) ||
          (selectedNode !== null && selectedNode !== id && !graph.areNeighbors(selectedNode, id))
        const highlighted = selectedNode === id
        return {
          ...attrs,
          size: highlighted ? attrs.size * 1.6 : attrs.size,
          color: dimmed ? withAlpha(attrs.color, 0.15) : attrs.color,
          label: dimmed ? '' : attrs.label,
          zIndex: highlighted ? 10 : 0,
          borderColor: highlighted ? attrs.color : 'transparent',
        }
      },
      edgeReducer: (id, attrs) => {
        const ext = graph.extremities(id)
        const involvedInHover =
          hoveredNode !== null && (ext[0] === hoveredNode || ext[1] === hoveredNode)
        const involvedInSelection =
          selectedNode !== null && (ext[0] === selectedNode || ext[1] === selectedNode)
        const isSelectedEdge = selectedEdge === id
        const dimmed =
          (hoveredNode !== null && !involvedInHover) ||
          (selectedNode !== null && !involvedInSelection && !isSelectedEdge)
        const highlighted = involvedInHover || involvedInSelection || isSelectedEdge
        return {
          ...attrs,
          size: highlighted ? attrs.size + 1.5 : attrs.size,
          color: dimmed ? withAlpha(attrs.color, 0.08) : attrs.color,
          zIndex: highlighted ? 5 : 0,
        }
      },
    }

    const renderer = new Sigma(graph, container, settings)
    sigmaRef.current = renderer
    setMounted(true)

    renderer.on('enterNode', (event) => setHoveredNode(event.node))
    renderer.on('leaveNode', () => setHoveredNode(null))
    renderer.on('clickNode', (event) => {
      setSelectedNode(event.node)
      setSelectedEdge(null)
      const attrs = graph.getNodeAttributes(event.node)
      const node: MapNode = { id: event.node, label: attrs.fullLabel, site: attrs.site, assetType: attrs.assetType }
      const sel: SigmaSelection = { kind: 'node', node, connectedCount: graph.degree(event.node) }
      setPanel(sel)
      onSelect?.(sel)
    })
    renderer.on('clickEdge', (event) => {
      setSelectedEdge(event.edge)
      setSelectedNode(null)
      const edge = edgeMeta[event.edge]
      if (!edge) return
      const fromAttrs = graph.getNodeAttributes(edge.from)
      const toAttrs = graph.getNodeAttributes(edge.to)
      const sel: SigmaSelection = {
        kind: 'edge',
        edge,
        fromLabel: fromAttrs.fullLabel,
        toLabel: toAttrs.fullLabel,
        fromSite: fromAttrs.site,
        toSite: toAttrs.site,
      }
      setPanel(sel)
      onSelect?.(sel)
    })
    renderer.on('clickStage', () => {
      setSelectedNode(null)
      setSelectedEdge(null)
      setPanel(null)
      onSelect?.(null)
    })

    return () => {
      renderer.kill()
      sigmaRef.current = null
      graphRef.current = null
      setMounted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Refresh the renderer when hover / selection state changes so
  // the reducers re-evaluate. Sigma's refresh() is cheap (one frame
  // re-render) compared to rebuilding the graph.
  useEffect(() => {
    sigmaRef.current?.refresh()
  }, [hoveredNode, selectedNode, selectedEdge])

  // Camera controls (zoom buttons + reset).
  function zoomBy(factor: number) {
    const camera = sigmaRef.current?.getCamera()
    if (!camera) return
    camera.animatedZoom({ duration: 200, factor })
  }
  function fit() {
    const camera = sigmaRef.current?.getCamera()
    if (!camera) return
    camera.animatedReset({ duration: 240 })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 560,
          border: '0.5px solid rgba(20,30,60,0.08)',
          borderRadius: 12,
          background:
            'radial-gradient(ellipse at 30% 0%, rgba(28,104,199,0.06), transparent 60%), ' +
            'radial-gradient(ellipse at 80% 100%, rgba(83,74,183,0.05), transparent 55%), #ffffff',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 360ms ease',
          cursor: 'grab',
        }}
      />

      {/* Selection panel */}
      <SigmaSelectionPanel
        selection={panel}
        onClose={() => {
          setPanel(null)
          setSelectedNode(null)
          setSelectedEdge(null)
          sigmaRef.current?.refresh()
          onSelect?.(null)
        }}
      />

      {/* Floating zoom controls */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 3,
          display: 'flex',
          gap: 4,
          background: '#ffffff',
          border: '0.5px solid rgba(20,30,60,0.18)',
          padding: 3,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(3,35,74,0.08)',
        }}
      >
        <ZoomBtn onClick={() => zoomBy(0.7)} title="Zoom in">+</ZoomBtn>
        <ZoomBtn onClick={() => zoomBy(1.4)} title="Zoom out">−</ZoomBtn>
        <ZoomBtn onClick={fit} title="Fit to view">⤢</ZoomBtn>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 10,
          fontSize: 11,
          color: '#54534e',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Swatch color={SUBTYPE_COLOR.Intersite_Link} label="Intersite link" />
        <Swatch color={SUBTYPE_COLOR.Port_Channel} label="Port channel" />
        <Swatch color={SUBTYPE_COLOR.Switch_Link} label="Switch link" />
        <span style={{ width: 1, height: 12, background: 'rgba(20,30,60,0.18)' }} />
        <Swatch color={ROLE_COLOR.network} dot label="Switch / router" />
        <Swatch color={ROLE_COLOR.host} dot label="Hypervisor" />
        <Swatch color={ROLE_COLOR.firewall} dot label="Firewall" />
        <Swatch color={ROLE_COLOR.storage} dot label="Storage" />
        <span style={{ marginLeft: 'auto', color: '#807e76' }}>
          Drag to pan · scroll to zoom · click a node or edge
        </span>
      </div>
    </div>
  )
}

function ZoomBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        border: 0,
        background: 'transparent',
        color: '#03234A',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  )
}

function Swatch({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {dot ? (
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }}
        />
      ) : (
        <svg width={26} height={6}>
          <line x1={0} y1={3} x2={26} y2={3} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      )}
      {label}
    </span>
  )
}

function shortenLabel(label: string): string {
  return label.length > 22 ? label.slice(0, 20) + '…' : label
}

function withAlpha(color: string, alpha: number): string {
  // Hex (#rrggbb) → rgba. sigma accepts CSS colour strings on edges
  // via its colour reducer, so this is fine.
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return color
}

// Slide-in detail panel — same shape as the SVG version's panel
// but adapted to sigma's flat edge model (no member-count chip
// because sigma collapses parallel edges to a single line; the
// table below still shows every bundle individually).
function SigmaSelectionPanel({
  selection,
  onClose,
}: {
  selection: SigmaSelection
  onClose: () => void
}) {
  const open = selection !== null
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        bottom: 50,
        width: open ? 300 : 0,
        background: '#ffffff',
        border: open ? '0.5px solid rgba(20,30,60,0.18)' : '0 solid transparent',
        borderRadius: 12,
        boxShadow: open ? '0 6px 24px rgba(3,35,74,0.12)' : 'none',
        overflow: 'hidden',
        transition: 'width 240ms cubic-bezier(0.2, 0.7, 0.2, 1), border 240ms ease',
        zIndex: 4,
        marginTop: 44, // clear the zoom controls
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {open && selection && (
        <div style={{ padding: 14, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#807e76',
                  marginBottom: 2,
                }}
              >
                {selection.kind === 'node' ? 'Device' : 'Link'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#14130f', wordBreak: 'break-word' }}>
                {selection.kind === 'node'
                  ? selection.node.label
                  : selection.edge.subtype.replace(/_/g, ' ')}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                border: 0,
                background: 'transparent',
                color: '#807e76',
                cursor: 'pointer',
                fontSize: 16,
                padding: 4,
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>

          {selection.kind === 'node' && (
            <>
              <PanelRow
                label="Role"
                value={roleLabel(selection.node.assetType)}
                accent={ROLE_COLOR[nodeKind(selection.node.assetType)]}
              />
              <PanelRow label="Site" value={selection.node.site} mono />
              <PanelRow
                label="Links"
                value={`${selection.connectedCount} ${selection.connectedCount === 1 ? 'connection' : 'connections'}`}
              />
              <PanelRow label="Asset ID" value={selection.node.id} mono small />
              <a
                href={`/inventory/${encodeURIComponent(selection.node.id)}`}
                style={{
                  display: 'block',
                  marginTop: 12,
                  padding: '8px 12px',
                  background: '#03234A',
                  color: '#ffffff',
                  textAlign: 'center',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Open in inventory →
              </a>
            </>
          )}

          {selection.kind === 'edge' && (
            <>
              <PanelRow label="From" value={selection.fromLabel} mono />
              <PanelRow label="To" value={selection.toLabel} mono />
              <PanelRow
                label="Sites"
                value={
                  selection.fromSite === selection.toSite
                    ? selection.fromSite
                    : `${selection.fromSite} → ${selection.toSite}`
                }
                mono
              />
              {selection.edge.subtype === 'Intersite_Link' && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    background: '#FCE7E5',
                    color: '#6E1A1A',
                    borderRadius: 6,
                    fontSize: 11,
                    lineHeight: 1.4,
                  }}
                >
                  Cross-DC link — DORA Art. 12 / NIS2 Art. 21 anchor. Failure here splits the two sites.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PanelRow({
  label,
  value,
  mono,
  small,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  small?: boolean
  accent?: string
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          color: '#807e76',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: small ? 10 : 12,
          color: accent ?? '#14130f',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          wordBreak: 'break-all',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function roleLabel(assetType: string): string {
  switch (nodeKind(assetType)) {
    case 'network':
      return 'switch / router'
    case 'host':
      return 'hypervisor host'
    case 'server':
      return 'server'
    case 'firewall':
      return 'firewall'
    case 'storage':
      return 'storage'
    default:
      return assetType || 'asset'
  }
}

// Helpers re-exported so the page can build the same MapNode data
// from its existing buildMapData function (the SVG version still
// lives in the page file; the sigma version just consumes that).
export { MAIN_TYPES }
