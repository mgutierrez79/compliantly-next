// Pure derivation functions for the Frameworks hero band.
//
// Extracted out of the view so the displayed hero metrics (overall
// posture across evaluated frameworks, ≥95% passing count, controls
// passing %, total controls) can be locked down by unit tests — W0-4
// (UI == signed source). The Frameworks page is the most auditor-
// facing surface; any drift between displayed numbers and the real
// scoring output here is exactly the bug class the contract tests
// exist to block.

// Minimal interface — only the fields the hero derivation actually
// reads. The view's full FrameworkPosture has more (control_areas,
// coverage, …) but the hero only needs these.
export type FrameworkPostureLike = {
  overall: number
  status?: string
  passing_controls?: number
  total_controls?: number
}

export type FrameworksHero = {
  // Overall average posture across evaluated frameworks (0..100). 0
  // when none have evaluated; caller decides to render "—" vs "0%".
  avg: number
  evaluatedCount: number
  // ≥95%-of-overall count (the "trust-grade" pill).
  passingFrameworks: number
  // Aggregate control tally across ALL frameworks (including no_data).
  passing: number
  total: number
  passingPct: number
}

// deriveFrameworksHero — the single source of truth for what the
// Frameworks hero displays. The view's useMemo + the contract tests
// both call this function, so they cannot disagree.
export function deriveFrameworksHero(frameworks: FrameworkPostureLike[]): FrameworksHero {
  const evaluated = frameworks.filter((f) => f.status !== 'no_data')
  const avg = evaluated.length
    ? Math.round(evaluated.reduce((a, f) => a + f.overall, 0) / evaluated.length)
    : 0
  const passingFrameworks = frameworks.filter((f) => f.overall >= 95).length
  let passing = 0
  let total = 0
  for (const f of frameworks) {
    passing += f.passing_controls ?? 0
    total += f.total_controls ?? 0
  }
  const passingPct = total > 0 ? Math.round((passing / total) * 100) : 0
  return {
    avg,
    evaluatedCount: evaluated.length,
    passingFrameworks,
    passing,
    total,
    passingPct,
  }
}
