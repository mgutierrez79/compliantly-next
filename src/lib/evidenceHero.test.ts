import { describe, it, expect } from 'vitest'
import {
  connectorSourceOf,
  deriveEvidenceHero,
  evidenceHasSignature,
  isDLQEntry,
  type EvidenceLogEntry,
} from './evidenceHero'

// W0-4 contract tests: the values the Evidence hero band displays MUST
// equal what the source records actually carry. Past bug surfaced live:
// the hero showed "100% integrity / 1 source" while the records were
// genuinely unsigned run-reports. The tests below pin every regression
// scenario so the displayed metrics can't drift again.

const signedEnvelope: EvidenceLogEntry = {
  evidence_id: 'evd_1',
  source: 'vcenter:dca',
  signature: 'ed25519:abcd',
  kind: 'asset',
}

const signedRunReport: EvidenceLogEntry = {
  run_id: 'run-20260525-1',
  source: 'run_report',
  report_signature: '74cfd9deadbeef',
  frameworks: ['dora'],
}

const unsignedRunReport: EvidenceLogEntry = {
  run_id: 'run-20260525-2',
  source: 'run_report',
  // No signature, no report_signature → unsigned.
  frameworks: ['dora'],
}

const dlqEntry: EvidenceLogEntry = {
  evidence_id: 'evd_dlq',
  source: 'palo_alto:fw1',
  status: 'dead_letter',
  signature: 'ed25519:zzz', // even with a signature, DLQ wins
}

const connectorRowNoSig: EvidenceLogEntry = {
  evidence_id: 'evd_2',
  source: 'powerstore:array1',
  // missing signature; not DLQ → unsigned (NOT silently counted as signed)
}

describe('isDLQEntry', () => {
  it('returns true for known DLQ status values', () => {
    expect(isDLQEntry({ status: 'dead_letter' })).toBe(true)
    expect(isDLQEntry({ status: 'DLQ' })).toBe(true)
    expect(isDLQEntry({ status: 'failed' })).toBe(true)
  })
  it('returns false for missing or healthy status', () => {
    expect(isDLQEntry({})).toBe(false)
    expect(isDLQEntry({ status: 'ok' })).toBe(false)
    expect(isDLQEntry({ status: '' })).toBe(false)
  })
})

describe('evidenceHasSignature', () => {
  it('treats only non-empty signature/report_signature as signed', () => {
    expect(evidenceHasSignature({ signature: 'sig' })).toBe(true)
    expect(evidenceHasSignature({ report_signature: 'digest' })).toBe(true)
  })
  it('does NOT treat missing signature as signed (the regression)', () => {
    expect(evidenceHasSignature({})).toBe(false)
    expect(evidenceHasSignature({ signature: '' })).toBe(false)
    expect(evidenceHasSignature({ signature: null })).toBe(false)
    expect(evidenceHasSignature({ report_signature: '' })).toBe(false)
  })
  it('does NOT count "not in DLQ" as signed (the original bug)', () => {
    // A run report with no signature but no DLQ status: must be unsigned.
    expect(evidenceHasSignature(unsignedRunReport)).toBe(false)
  })
})

describe('connectorSourceOf', () => {
  it('returns the base connector name from a kind:slug source', () => {
    expect(connectorSourceOf({ source: 'vcenter:dca' })).toBe('vcenter')
    expect(connectorSourceOf({ source: 'palo_alto:fw1' })).toBe('palo_alto')
  })
  it('excludes synthetic sources so they do not inflate the count', () => {
    // run_report comes from runAsEvidenceEntry; core from platform events.
    // Neither is a real connector — counting them caused sources=1 when
    // the feed was 100% run reports.
    expect(connectorSourceOf({ source: 'run_report' })).toBeNull()
    expect(connectorSourceOf({ source: 'core' })).toBeNull()
  })
  it('returns null for missing source', () => {
    expect(connectorSourceOf({})).toBeNull()
    expect(connectorSourceOf({ source: '' })).toBeNull()
  })
})

describe('deriveEvidenceHero — UI == source contract', () => {
  it('mixed feed: signed envelopes + signed run reports + unsigned + DLQ', () => {
    const items: EvidenceLogEntry[] = [
      signedEnvelope,    // signed
      signedRunReport,   // signed (report_signature carries the chain digest)
      unsignedRunReport, // unsigned
      connectorRowNoSig, // unsigned
      dlqEntry,          // DLQ (NOT signed even though signature field is set)
    ]
    expect(deriveEvidenceHero(items)).toEqual({
      loaded: 5,
      signed: 2,
      unsigned: 2,
      dlq: 1,
      // 3 real connector sources: vcenter (signed), powerstore (unsigned),
      // palo_alto (DLQ row — its source still counts; DLQ excludes the
      // record from "signed" but NOT from connector-coverage).
      // run_report (×2) excluded.
      sources: 3,
    })
  })

  it('empty feed → all zeros (no division-by-zero, no fake values)', () => {
    expect(deriveEvidenceHero([])).toEqual({
      loaded: 0,
      signed: 0,
      unsigned: 0,
      dlq: 0,
      sources: 0,
    })
  })

  it('regression: all-unsigned run reports must NOT report 100% signed', () => {
    // This is the exact shape that previously showed "100% integrity".
    const items: EvidenceLogEntry[] = [unsignedRunReport, unsignedRunReport, unsignedRunReport]
    const hero = deriveEvidenceHero(items)
    expect(hero.signed).toBe(0) // critical: was bugged to 3
    expect(hero.unsigned).toBe(3)
    expect(hero.sources).toBe(0) // run_report is excluded, NOT counted as 1
  })

  it('signed counts honor DLQ exclusion (a DLQ row is never "signed")', () => {
    const items: EvidenceLogEntry[] = [dlqEntry]
    const hero = deriveEvidenceHero(items)
    expect(hero.signed).toBe(0)
    expect(hero.dlq).toBe(1)
  })

  it('sources de-duplicates and excludes synthetic buckets', () => {
    const items: EvidenceLogEntry[] = [
      { source: 'vcenter:dca' },
      { source: 'vcenter:dr' }, // same connector kind, different instance
      { source: 'palo_alto:fw1' },
      { source: 'run_report' }, // excluded
      { source: 'core' },        // excluded
    ]
    expect(deriveEvidenceHero(items).sources).toBe(2)
  })
})
