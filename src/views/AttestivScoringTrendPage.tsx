'use client'

// Scoring trend — 12-month sparkline + annotated events.
//
// Hand-rendered SVG (no chart library) because the dataset is tiny
// (≤12 points) and we want full control over the framework-coloured
// line + event markers + 95% threshold guideline. Adding Recharts
// for one widget would be a bigger dependency hit than the math.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import {
  Badge,
  Card,
  CardTitle,
  GhostButton,
  Topbar,
} from '../components/AttestivUi'
import {
  formatPercent,
  getTrend,
  statusTone,
  type MonthlyScore,
  type TrendEvent,
} from '../lib/scoring'

const FRAMEWORK_COLORS: Record<string, string> = {
  dora: '#1D9E75',
  iso27001: '#185FA5',
  soc2: '#EF9F27',
  nis2: '#534AB7',
  gxp: '#639922',
  pci_dss: '#E24B4A',
}

export function AttestivScoringTrendPage() {
  const params = useParams<{ frameworkId?: string | string[] }>()
  const frameworkID = Array.isArray(params?.frameworkId)
    ? params.frameworkId[0]
    : (params?.frameworkId ?? '')
  const [months, setMonths] = useState<6 | 12 | 24>(12)
  const [data, setData] = useState<{ items: MonthlyScore[]; events: TrendEvent[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!frameworkID) return
    let cancelled = false
    setLoading(true)
    getTrend(frameworkID, months)
      .then((body) => {
        if (!cancelled) setData({ items: body.items, events: body.events })
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'Trend load failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [frameworkID, months])

  return (
    <>
      <Topbar
        title={`${frameworkID || 'Framework'} trend`}
        right={
          <div style={{ display: 'flex', gap: 4, background: 'var(--color-background-secondary)', padding: 3, borderRadius: 'var(--border-radius-md)' }}>
            {[6, 12, 24].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option as 6 | 12 | 24)}
                style={{
                  background: months === option ? 'var(--color-background-primary)' : 'transparent',
                  color: months === option ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: 'var(--border-radius-md)',
                  fontSize: 11,
                  fontWeight: months === option ? 500 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {option}m
              </button>
            ))}
          </div>
        }
      />
      <div className="attestiv-content">
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-status-red-deep)',
              background: 'var(--color-status-red-bg)',
              padding: '8px 12px',
              borderRadius: 'var(--border-radius-md)',
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        <Card>
          <CardTitle right={data ? <Badge tone="navy">{data.items.length} months</Badge> : null}>
            Score over time
          </CardTitle>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : data && data.items.length > 0 ? (
            <TrendChart items={data.items} events={data.events} frameworkID={frameworkID} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No history yet. Click Re-evaluate now on the calculator page to seed the first data point.
            </div>
          )}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <CardTitle right={data ? <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{data.events.length} events</span> : null}>
            Events
          </CardTitle>
          {data && data.events.length > 0 ? (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px 6px 0' }}>Date</th>
                  <th style={{ padding: '6px 10px' }}>Type</th>
                  <th style={{ padding: '6px 10px' }}>Severity</th>
                  <th style={{ padding: '6px 0 6px 10px' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event, index) => (
                  <tr key={`${event.OccurredAt}-${index}`} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '10px 10px 10px 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {formatTimestamp(event.OccurredAt)}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge tone="gray">{event.Type}</Badge>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge tone={severityTone(event.Severity)}>{event.Severity}</Badge>
                    </td>
                    <td style={{ padding: '10px 0 10px 10px', color: 'var(--color-text-secondary)' }}>{event.Description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No events recorded for this window.</div>
          )}
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <GhostButton onClick={() => undefined}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
            Back to scoring
          </GhostButton>
        </div>
      </div>
    </>
  )
}

function TrendChart({
  items,
  events,
  frameworkID,
}: {
  items: MonthlyScore[]
  events: TrendEvent[]
  frameworkID: string
}) {
  const width = 720
  const height = 220
  const margin = { top: 12, right: 12, bottom: 24, left: 36 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  // Y axis: 0–1 (we render the 0.7 → 1.0 portion since that's where
  // most data lives). Anything below 0.7 is clamped at the bottom of
  // the chart but shown as a labelled point.
  const yMin = 0.7
  const yMax = 1.0
  function y(score: number) {
    if (score >= yMax) return margin.top
    if (score <= yMin) return margin.top + innerH
    const fraction = (score - yMin) / (yMax - yMin)
    return margin.top + innerH * (1 - fraction)
  }
  function x(index: number) {
    if (items.length === 1) return margin.left + innerW / 2
    return margin.left + (innerW * index) / (items.length - 1)
  }

  const lineColor = FRAMEWORK_COLORS[frameworkID] ?? '#185FA5'

  const path = items
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.Score).toFixed(1)}`)
    .join(' ')
  const passLine = y(0.95)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {/* Y axis grid */}
        {[0.7, 0.8, 0.9, 0.95, 1.0].map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={margin.left + innerW}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-border-tertiary)"
              strokeDasharray={tick === 0.95 ? '4 4' : '0'}
            />
            <text
              x={margin.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-text-tertiary)"
              fontFamily="var(--font-mono)"
            >
              {(tick * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* Pass threshold callout */}
        <text x={margin.left + innerW - 4} y={passLine - 4} textAnchor="end" fontSize={9} fill="var(--color-status-green-deep)">
          PASS 95%
        </text>

        {/* Event markers — vertical dotted lines at the event's month */}
        {events.map((event, index) => {
          const date = new Date(event.OccurredAt)
          const monthIndex = items.findIndex(
            (point) => point.Year === date.getUTCFullYear() && point.Month === date.getUTCMonth() + 1,
          )
          if (monthIndex < 0) return null
          return (
            <line
              key={index}
              x1={x(monthIndex)}
              x2={x(monthIndex)}
              y1={margin.top}
              y2={margin.top + innerH}
              stroke={severityChartColor(event.Severity)}
              strokeDasharray="2 3"
              strokeOpacity={0.7}
            />
          )
        })}

        {/* Score line */}
        <path d={path} stroke={lineColor} strokeWidth={2} fill="none" />

        {/* Score points */}
        {items.map((point, index) => (
          <g key={`${point.Year}-${point.Month}`}>
            <circle cx={x(index)} cy={y(point.Score)} r={4} fill={lineColor} />
            <text
              x={x(index)}
              y={margin.top + innerH + 14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-text-tertiary)"
            >
              {point.Year}-{String(point.Month).padStart(2, '0')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function severityTone(severity: string): 'red' | 'amber' | 'gray' | 'blue' {
  switch (severity) {
    case 'critical':
      return 'red'
    case 'warning':
      return 'amber'
    case 'info':
      return 'blue'
    default:
      return 'gray'
  }
}

function severityChartColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'var(--color-status-red-mid)'
    case 'warning':
      return 'var(--color-status-amber-mid)'
    default:
      return 'var(--color-status-blue-deep)'
  }
}

function formatTimestamp(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}

// keep the unused statusTone reference satisfied — used in CardTitle
// fallback in callers that re-export from this module.
void statusTone
