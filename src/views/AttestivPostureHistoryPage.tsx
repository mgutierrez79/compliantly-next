'use client';
// Dashboard / Posture history.
//
// 30/60/90-day compliance score trend per framework. The dashboard
// shows current posture; this page shows the slope. Compliance
// managers care about whether they're trending up or down between
// audits — a flat 92% might be fine but a 92% that started at 96% a
// month ago is an issue.
//
// Backed by /v1/scores/history. The chart is hand-rendered SVG: a
// single sparkline per framework with the latest value on the right.
// Heavier charting (Recharts/Visx) is overkill for a four-line
// dashboard widget that doesn't need axes or tooltips.

import { useEffect, useState } from 'react'

import {
  Badge,
  Card,
  CardTitle,
  Topbar,
} from '../components/AttestivUi'
import { apiFetch } from '../lib/api'

import { useI18n } from '../lib/i18n';

type ScorePoint = {
  date: string
  value: number
}

type FrameworkSeries = {
  framework: string
  current: number
  history: ScorePoint[]
}

const DEMO_SERIES: FrameworkSeries[] = [
  {
    framework: 'SOC 2',
    current: 96,
    history: [88, 89, 90, 91, 91, 92, 92, 93, 94, 94, 95, 96].map((value, index) => ({
      date: dateNDaysAgo(11 - index),
      value,
    })),
  },
  {
    framework: 'ISO 27001',
    current: 91,
    history: [82, 83, 85, 87, 88, 89, 89, 90, 90, 91, 91, 91].map((value, index) => ({
      date: dateNDaysAgo(11 - index),
      value,
    })),
  },
  {
    framework: 'PCI DSS 4.0',
    current: 84,
    history: [70, 72, 74, 76, 78, 79, 80, 81, 82, 83, 84, 84].map((value, index) => ({
      date: dateNDaysAgo(11 - index),
      value,
    })),
  },
  {
    framework: 'CIS Controls v8',
    current: 89,
    history: [86, 87, 88, 88, 87, 88, 88, 89, 89, 89, 89, 89].map((value, index) => ({
      date: dateNDaysAgo(11 - index),
      value,
    })),
  },
]

export function AttestivPostureHistoryPage() {
  const {
    t
  } = useI18n();

  const [series, setSeries] = useState<FrameworkSeries[]>([])
  const [usingDemo, setUsingDemo] = useState(false)
  const [window, setWindow] = useState<30 | 60 | 90>(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch(`/scores/history?days=${window}`)
        if (!response.ok) throw new Error(`${response.status}`)
        const body = await response.json().catch(() => ({}))
        const items: any[] = Array.isArray(body?.items) ? body.items : []
        const grouped = groupByFramework(items)
        if (!cancelled) {
          if (grouped.length > 0) {
            setSeries(grouped)
            setUsingDemo(false)
          } else {
            setSeries(DEMO_SERIES)
            setUsingDemo(true)
          }
        }
      } catch {
        if (!cancelled) {
          setSeries(DEMO_SERIES)
          setUsingDemo(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [window])

  return (
    <>
      <Topbar
        title={t('Compliance posture', 'Compliance posture')}
        left={usingDemo ? <Badge tone="amber">{t(
          'Demo trend — no historical scores yet',
          'Demo trend — no historical scores yet'
        )}</Badge> : null}
        right={<WindowToggle value={window} onChange={setWindow} />}
      />
      <div className="attestiv-content">
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('Loading…', 'Loading…')}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 12,
            }}
          >
            {series.map((entry) => (
              <FrameworkSparklineCard key={entry.framework} series={entry} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FrameworkSparklineCard({ series }: { series: FrameworkSeries }) {
  const {
    t
  } = useI18n();

  const tone: 'green' | 'amber' | 'red' = series.current >= 95 ? 'green' : series.current >= 85 ? 'amber' : 'red'
  const trend = trendDelta(series.history)
  const trendColor = trend > 0 ? 'var(--color-status-green-deep)' : trend < 0 ? 'var(--color-status-red-deep)' : 'var(--color-text-tertiary)'
  return (
    <Card>
      <CardTitle right={<Badge tone={tone}>{series.current}%</Badge>}>
        {series.framework}
      </CardTitle>
      <Sparkline points={series.history} tone={tone} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <span>{series.history.length} {t('data points', 'data points')}</span>
        <span style={{ color: trendColor, fontWeight: 500 }}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '–'} {Math.abs(trend).toFixed(1)} pts
        </span>
      </div>
    </Card>
  );
}

function Sparkline({ points, tone }: { points: ScorePoint[]; tone: 'green' | 'amber' | 'red' }) {
  const {
    t
  } = useI18n();

  if (points.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('No data.', 'No data.')}</div>;
  }
  const width = 320
  const height = 60
  const values = points.map((point) => point.value)
  const min = Math.min(...values, 70)
  const max = Math.max(...values, 100)
  const range = Math.max(1, max - min)
  const stepX = points.length > 1 ? width / (points.length - 1) : 0
  const path = points
    .map((point, index) => {
      const x = stepX * index
      const y = height - ((point.value - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const stroke =
    tone === 'green'
      ? 'var(--color-status-green-mid)'
      : tone === 'amber'
        ? 'var(--color-status-amber-mid)'
        : 'var(--color-status-red-mid)'
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} stroke={stroke} strokeWidth={2} fill="none" />
      <circle
        cx={width}
        cy={height - ((points[points.length - 1].value - min) / range) * height}
        r={3}
        fill={stroke}
      />
    </svg>
  )
}

function WindowToggle({
  value,
  onChange,
}: {
  value: 30 | 60 | 90
  onChange: (v: 30 | 60 | 90) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        background: 'var(--color-background-secondary)',
        padding: 3,
        borderRadius: 'var(--border-radius-md)',
      }}
    >
      {[30, 60, 90].map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option as 30 | 60 | 90)}
          style={{
            background: value === option ? 'var(--color-background-primary)' : 'transparent',
            color: value === option ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            border: 'none',
            padding: '4px 10px',
            borderRadius: 'var(--border-radius-md)',
            fontSize: 11,
            fontWeight: value === option ? 500 : 400,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {option}d
        </button>
      ))}
    </div>
  )
}

function groupByFramework(items: any[]): FrameworkSeries[] {
  const map = new Map<string, ScorePoint[]>()
  for (const item of items) {
    const framework = String(item?.framework ?? '')
    if (!framework) continue
    const value = Number(item?.score ?? item?.value ?? 0)
    if (!Number.isFinite(value)) continue
    const date = String(item?.timestamp ?? item?.date ?? '')
    if (!date) continue
    if (!map.has(framework)) map.set(framework, [])
    map.get(framework)!.push({ date, value })
  }
  return Array.from(map.entries()).map(([framework, history]) => {
    const sorted = history.sort((a, b) => a.date.localeCompare(b.date))
    return {
      framework,
      current: sorted.length > 0 ? sorted[sorted.length - 1].value : 0,
      history: sorted,
    }
  })
}

function trendDelta(points: ScorePoint[]): number {
  if (points.length < 2) return 0
  return points[points.length - 1].value - points[0].value
}

function dateNDaysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString().slice(0, 10)
}
