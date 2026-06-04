import { describe, it, expect } from 'vitest'
import { deriveFrameworksHero, type FrameworkPostureLike } from './frameworksHero'

// W0-4 contract tests for the Frameworks hero band. Pins every metric
// the auditor sees on the most-trafficked compliance surface — no
// drift possible between hero display and underlying scoring output.

describe('deriveFrameworksHero', () => {
  it('returns all-zeros when no frameworks loaded', () => {
    expect(deriveFrameworksHero([])).toEqual({
      avg: 0,
      evaluatedCount: 0,
      passingFrameworks: 0,
      passing: 0,
      total: 0,
      passingPct: 0,
      regulationTotal: 0,
      scoredAvg: 0,
    })
  })

  // The headline avg is now coverage-adjusted: passing / regulationTotal × 100.
  // Without this, a framework with 1 measured control passing scored 100%
  // and inflated the headline despite 99% of the regulation being uncovered.
  // The pilot dashboard showed 55% for a posture that auditor-honestly grades
  // ~7%, and that gap is exactly the bug class this test now pins.
  it('avg is passing / regulationTotal (coverage-adjusted, NOT the unweighted scored-subset average)', () => {
    const fws: FrameworkPostureLike[] = [
      // CIS-shape: 4 passing of 14 measured, but 153 auditable.
      { overall: 53, status: 'warn', passing_controls: 4, total_controls: 14, regulation_total: 153 },
      // DORA-shape: 11 passing of 25 measured, 23 auditable.
      { overall: 58, status: 'warn', passing_controls: 11, total_controls: 25, regulation_total: 23 },
    ]
    const hero = deriveFrameworksHero(fws)
    // 15 passing of 176 auditable = 8.5% → rounds to 9.
    expect(hero.avg).toBe(9)
    expect(hero.regulationTotal).toBe(176)
    // scoredAvg preserves the legacy meaning (55-ish average) so the
    // view can render it as the demoted subtitle.
    expect(hero.scoredAvg).toBe(Math.round((53 + 58) / 2))
  })

  it('falls back to scoredAvg when no regulation_total is provided (older payloads)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 60, status: 'pass', passing_controls: 60, total_controls: 100 },
      { overall: 80, status: 'pass', passing_controls: 80, total_controls: 100 },
      { overall: 0, status: 'no_data' },
    ]
    const hero = deriveFrameworksHero(fws)
    // No regulation_total anywhere → fall back to the legacy unweighted average.
    expect(hero.regulationTotal).toBe(0)
    expect(hero.avg).toBe(70)
    expect(hero.scoredAvg).toBe(70)
  })

  it('scoredAvg excludes no_data (never inflates "—" to 0%)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 60, status: 'pass', passing_controls: 60, total_controls: 100, regulation_total: 100 },
      { overall: 80, status: 'pass', passing_controls: 80, total_controls: 100, regulation_total: 100 },
      { overall: 0, status: 'no_data' }, // must NOT pull either avg toward 0
    ]
    const hero = deriveFrameworksHero(fws)
    expect(hero.scoredAvg).toBe(70)
    // Coverage-adjusted: 140 passing of 200 auditable = 70.
    expect(hero.avg).toBe(70)
    expect(hero.evaluatedCount).toBe(2)
    expect(hero.passing).toBe(140)
    expect(hero.total).toBe(200)
    expect(hero.passingPct).toBe(70)
  })

  it('passingFrameworks counts ≥95% overall (the gate pill)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 96, status: 'pass' },
      { overall: 95, status: 'pass' },
      { overall: 94, status: 'warn' },
      { overall: 50, status: 'fail' },
    ]
    expect(deriveFrameworksHero(fws).passingFrameworks).toBe(2)
  })

  it('aggregates controls across ALL frameworks (including no_data)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 80, passing_controls: 40, total_controls: 50, regulation_total: 200 },
      { overall: 0, status: 'no_data' },
    ]
    const hero = deriveFrameworksHero(fws)
    expect(hero.passing).toBe(40)
    expect(hero.total).toBe(50)
    expect(hero.passingPct).toBe(80)
    // Coverage-adjusted: 40 / 200 = 20%.
    expect(hero.avg).toBe(20)
    expect(hero.regulationTotal).toBe(200)
  })

  it('handles zero-total controls without dividing (passingPct stays 0)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 50, status: 'review' },
    ]
    expect(deriveFrameworksHero(fws).passingPct).toBe(0)
  })
})
