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
    })
  })

  it('averages ONLY evaluated frameworks (skips no_data, never inflates "—" to 0%)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 60, status: 'pass', passing_controls: 60, total_controls: 100 },
      { overall: 80, status: 'pass', passing_controls: 80, total_controls: 100 },
      { overall: 0, status: 'no_data' }, // must NOT pull the avg toward 0
    ]
    const hero = deriveFrameworksHero(fws)
    expect(hero.avg).toBe(70)             // (60+80)/2 — excludes no_data
    expect(hero.evaluatedCount).toBe(2)
    expect(hero.total).toBe(200)
    expect(hero.passing).toBe(140)
    expect(hero.passingPct).toBe(70)
  })

  it('passingFrameworks counts ≥95% overall (the gate pill)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 96, status: 'pass' },
      { overall: 95, status: 'pass' },
      { overall: 94, status: 'warn' }, // just below the gate
      { overall: 50, status: 'fail' },
    ]
    expect(deriveFrameworksHero(fws).passingFrameworks).toBe(2)
  })

  it('aggregates controls across ALL frameworks (including no_data with 0 controls — harmless)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 80, passing_controls: 40, total_controls: 50 },
      { overall: 0, status: 'no_data' }, // no controls counted but no error either
    ]
    const hero = deriveFrameworksHero(fws)
    expect(hero.passing).toBe(40)
    expect(hero.total).toBe(50)
    expect(hero.passingPct).toBe(80)
  })

  it('handles zero-total controls without dividing (passingPct stays 0)', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 50, status: 'review' }, // no controls reported
    ]
    expect(deriveFrameworksHero(fws).passingPct).toBe(0)
  })

  it('rounds the average — not silently floors or biases up', () => {
    const fws: FrameworkPostureLike[] = [
      { overall: 50, status: 'pass' },
      { overall: 51, status: 'pass' },
    ]
    // (50+51)/2 = 50.5 → rounds to 51 (banker's rounding is half-to-even in JS;
    // Math.round is half-away-from-zero, so 50.5 → 51)
    expect(deriveFrameworksHero(fws).avg).toBe(51)
  })
})
