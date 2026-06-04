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
  // The framework's full regulation denominator (e.g. CIS v8 = 153,
  // DORA = 23). Distinct from total_controls, which is the COUNT of
  // controls we managed to score. The headline posture grades against
  // the regulation, so this field is required for an honest number.
  regulation_total?: number
}

export type FrameworksHero = {
  // Coverage-adjusted headline posture across all auditable controls,
  // 0..100. This is `passing / regulationTotal × 100` — the number an
  // auditor would conclude from "how much of the regulation is
  // demonstrably met?". 0 when no regulation totals available.
  avg: number
  evaluatedCount: number
  // ≥95%-of-overall count (the "trust-grade" pill).
  passingFrameworks: number
  // Aggregate control tally across ALL frameworks (including no_data).
  passing: number
  total: number
  passingPct: number
  // Sum of regulation_total across all frameworks. The honest
  // denominator the hero divides against.
  regulationTotal: number
  // The legacy unweighted average of each framework's `overall` (its
  // score of the SCORED subset). Demoted to a subtitle on the hero
  // because it's misleading at a glance — a framework with 1 measured
  // control passing inflates this number to 100% while 99% of the
  // regulation has zero evidence. Retained for the auditor-facing
  // explainer ("of measured controls, the average is X%").
  scoredAvg: number
}

// deriveFrameworksHero — the single source of truth for what the
// Frameworks hero displays. The view's useMemo + the contract tests
// both call this function, so they cannot disagree.
export function deriveFrameworksHero(frameworks: FrameworkPostureLike[]): FrameworksHero {
  const evaluated = frameworks.filter((f) => f.status !== 'no_data')
  const scoredAvg = evaluated.length
    ? Math.round(evaluated.reduce((a, f) => a + f.overall, 0) / evaluated.length)
    : 0
  const passingFrameworks = frameworks.filter((f) => f.overall >= 95).length
  let passing = 0
  let total = 0
  let regulationTotal = 0
  for (const f of frameworks) {
    passing += f.passing_controls ?? 0
    total += f.total_controls ?? 0
    regulationTotal += f.regulation_total ?? 0
  }
  const passingPct = total > 0 ? Math.round((passing / total) * 100) : 0
  // Honest headline: passing controls out of EVERY auditable control
  // the regulation defines. When regulation_total is absent (older
  // payloads, or scoping changes), fall back to scoredAvg so the hero
  // doesn't go blank — but log the gap by also returning scoredAvg
  // so the view can render the fallback marker.
  const avg = regulationTotal > 0 ? Math.round((passing / regulationTotal) * 100) : scoredAvg
  return {
    avg,
    evaluatedCount: evaluated.length,
    passingFrameworks,
    passing,
    total,
    passingPct,
    regulationTotal,
    scoredAvg,
  }
}
