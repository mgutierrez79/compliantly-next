// Pure derivation functions for the Dashboard hero band.
//
// Extracted out of the view so the displayed posture / top-framework /
// controls-passing values can be locked down by unit tests — W0-4
// (UI == signed source). The Evidence page had a 100%/1-source bug
// because the hero computed "not in DLQ" as "signed"; same drift class
// is possible on the Dashboard if these values stay inline in the view.

export type FrameworkScore = {
  score?: number
  controls_score?: number
  controls_summary?: { compliant?: number; total?: number }
}

export type DashboardSummary = {
  finding_count?: number
  framework_scores?: Record<string, FrameworkScore>
  connector_health?: { ok?: number; warn?: number; error?: number; unknown?: number }
  generated_at?: string | null
}

// scoreToPercent normalises a framework's score to a 0–100 integer.
// Accepts both shapes the backend has emitted (0–1 fraction and 0–100
// percent) — same logic the Frameworks page uses, centralised here so
// Dashboard and Frameworks can never display different numbers for the
// same underlying score.
export function scoreToPercent(score: FrameworkScore | undefined): number {
  const raw = score?.score ?? score?.controls_score ?? 0
  const pct = raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, Math.round(pct)))
}

// deriveOverallPosture returns the trust-grade hero headline: the mean
// posture across evaluated frameworks. Honest label: "—" when nothing
// has scored yet, never a misleading 0%.
export type OverallPosture = {
  value: string   // "64%" or "—"
  percent: number // 0..100 (0 when no data — caller decides what bar to render)
  count: number   // number of evaluated frameworks averaged
}

export function deriveOverallPosture(summary: DashboardSummary | null): OverallPosture {
  const scores = summary?.framework_scores ?? {}
  const entries = Object.entries(scores)
  if (entries.length === 0) {
    return { value: '—', percent: 0, count: 0 }
  }
  const pcts = entries.map(([, s]) => scoreToPercent(s))
  const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
  return { value: `${avg}%`, percent: avg, count: entries.length }
}

// deriveControlsPassing returns the cross-framework "% of controls
// passing" rollup. Two-line display: percent on top, "X / Y" sub.
// "—" when no controls have been totalled (no scoring run yet).
export type ControlsPassing = {
  value: string
  sub: string
  percent: number
  passing: number
  total: number
}

export function deriveControlsPassing(summary: DashboardSummary | null): ControlsPassing {
  const scores = summary?.framework_scores ?? {}
  let passing = 0
  let total = 0
  for (const score of Object.values(scores)) {
    if (score.controls_summary) {
      passing += score.controls_summary.compliant ?? 0
      total += score.controls_summary.total ?? 0
    }
  }
  if (total === 0) {
    return { value: '—', sub: '', percent: 0, passing: 0, total: 0 }
  }
  const pct = Math.round((passing / total) * 100)
  return { value: `${pct}%`, sub: `${passing} / ${total}`, percent: pct, passing, total }
}

// deriveTopFramework picks the highest-scoring framework — the
// trust-grade hero's secondary callout. NOT a hard-coded "DORA tier"
// (which would mislead a multi-framework tenant or be flat wrong when
// nothing is scored yet).
export type TopFramework = {
  id: string
  label: string   // FRAMEWORK_LABELS lookup or uppercased id
  value: string   // "96%" or "—"
  percent: number
  count: number   // total evaluated frameworks (for the "X frameworks scored" sub)
}

const FRAMEWORK_LABELS: Record<string, string> = {
  iso27001: 'ISO 27001',
  soc2: 'SOC 2 Type II',
  nis2: 'NIS2',
  dora: 'DORA regulation',
  gxp: 'GxP',
  cis: 'CIS',
  nist: 'NIST',
  pci_dss: 'PCI-DSS v4',
  'pci-dss': 'PCI-DSS v4',
}

export function deriveTopFramework(summary: DashboardSummary | null): TopFramework {
  const scores = summary?.framework_scores ?? {}
  const entries = Object.entries(scores)
  if (entries.length === 0) {
    return { id: '', label: '—', value: '—', percent: 0, count: 0 }
  }
  const ranked = entries
    .map(([key, score]) => ({ id: key, percent: scoreToPercent(score) }))
    .sort((a, b) => b.percent - a.percent)
  const winner = ranked[0]
  return {
    id: winner.id,
    label: FRAMEWORK_LABELS[winner.id] || winner.id.toUpperCase(),
    value: `${winner.percent}%`,
    percent: winner.percent,
    count: entries.length,
  }
}
