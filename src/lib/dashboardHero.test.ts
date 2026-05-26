import { describe, it, expect } from 'vitest'
import {
  deriveControlsPassing,
  deriveOverallPosture,
  deriveTopFramework,
  scoreToPercent,
  type DashboardSummary,
} from './dashboardHero'

// W0-4 contract tests for the Dashboard hero. Three displayed metrics
// — Overall posture, Controls passing, Top framework — are now
// derivation-locked: same function the UI calls, same function the
// tests pin, no chance of "the dashboard says X but the data says Y".

describe('scoreToPercent — handles both 0-1 fraction and 0-100 percent shapes', () => {
  it('treats values <= 1 as a fraction', () => {
    expect(scoreToPercent({ score: 0.6448 })).toBe(64)
    expect(scoreToPercent({ score: 1 })).toBe(100)
    expect(scoreToPercent({ score: 0 })).toBe(0)
  })
  it('treats values > 1 as already-a-percent', () => {
    expect(scoreToPercent({ score: 64.48 })).toBe(64)
    expect(scoreToPercent({ score: 100 })).toBe(100)
  })
  it('falls back to controls_score when score is absent', () => {
    expect(scoreToPercent({ controls_score: 50 })).toBe(50)
  })
  it('clamps to 0..100', () => {
    expect(scoreToPercent({ score: 150 })).toBe(100) // already-percent shape, above 100 → clamped
    expect(scoreToPercent({ score: -0.1 })).toBe(0)  // negative fraction → clamped
  })
  it('returns 0 for missing/undefined input', () => {
    expect(scoreToPercent(undefined)).toBe(0)
    expect(scoreToPercent({})).toBe(0)
  })
})

describe('deriveOverallPosture — average across evaluated frameworks', () => {
  it('returns "—" when no frameworks have scored', () => {
    expect(deriveOverallPosture(null)).toEqual({ value: '—', percent: 0, count: 0 })
    expect(deriveOverallPosture({ framework_scores: {} })).toEqual({ value: '—', percent: 0, count: 0 })
  })
  it('averages the per-framework percents honestly', () => {
    const summary: DashboardSummary = {
      framework_scores: {
        dora: { score: 0.6 },   // 60
        nis2: { score: 80 },    // 80 (already percent)
        iso27001: { score: 0.4 }, // 40
      },
    }
    // (60 + 80 + 40) / 3 = 60
    expect(deriveOverallPosture(summary)).toEqual({ value: '60%', percent: 60, count: 3 })
  })
  it('mixed shapes still average correctly (regression: no double-percent inflation)', () => {
    const summary: DashboardSummary = {
      framework_scores: {
        a: { score: 0.5 },   // 50
        b: { score: 50 },    // 50 (already percent — must NOT become 5000)
      },
    }
    expect(deriveOverallPosture(summary).percent).toBe(50)
  })
})

describe('deriveControlsPassing — cross-framework controls rollup', () => {
  it('returns "—" when no controls have been totalled', () => {
    expect(deriveControlsPassing(null)).toEqual({ value: '—', sub: '', percent: 0, passing: 0, total: 0 })
    expect(deriveControlsPassing({ framework_scores: { a: { score: 0.5 } } })).toEqual({
      value: '—', sub: '', percent: 0, passing: 0, total: 0,
    })
  })
  it('sums compliant + total across frameworks and computes %', () => {
    const summary: DashboardSummary = {
      framework_scores: {
        dora: { controls_summary: { compliant: 80, total: 100 } },
        nis2: { controls_summary: { compliant: 60, total: 100 } },
      },
    }
    // 140 / 200 = 70%
    expect(deriveControlsPassing(summary)).toEqual({
      value: '70%', sub: '140 / 200', percent: 70, passing: 140, total: 200,
    })
  })
  it('zero-passing returns 0% (not "—" — the data exists)', () => {
    const summary: DashboardSummary = {
      framework_scores: { dora: { controls_summary: { compliant: 0, total: 50 } } },
    }
    expect(deriveControlsPassing(summary).value).toBe('0%')
    expect(deriveControlsPassing(summary).percent).toBe(0)
  })
})

describe('deriveTopFramework — highest-scoring framework callout', () => {
  it('returns "—" when no scores in', () => {
    expect(deriveTopFramework(null).value).toBe('—')
    expect(deriveTopFramework({ framework_scores: {} }).value).toBe('—')
  })
  it('picks the highest-scoring framework and humanises its label', () => {
    const summary: DashboardSummary = {
      framework_scores: {
        dora: { score: 0.6 },
        nis2: { score: 0.96 },
        iso27001: { score: 0.88 },
      },
    }
    const top = deriveTopFramework(summary)
    expect(top.id).toBe('nis2')
    expect(top.label).toBe('NIS2')
    expect(top.value).toBe('96%')
    expect(top.percent).toBe(96)
    expect(top.count).toBe(3)
  })
  it('uppercases the id when no humanised label exists', () => {
    const summary: DashboardSummary = {
      framework_scores: { custom_framework: { score: 0.5 } },
    }
    expect(deriveTopFramework(summary).label).toBe('CUSTOM_FRAMEWORK')
  })
})
