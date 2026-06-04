// Pure derivation functions for the Evidence-stream hero band.
//
// Extracted out of the view so the same logic that the UI displays can
// be locked down by unit tests — guarding W0-4 (UI == signed source).
// Past bug: the hero counted "not in DLQ" as "signed" and shipped 100%
// integrity / 1 source while the records were actually unsigned run
// reports. Centralising the derivation here means a single test suite
// covers every case (signed envelope, unsigned run report, DLQ row,
// missing source field, etc.) and rejects any future drift between the
// displayed value and the source data.

export type EvidenceLogEntry = {
  run_id?: string
  evidence_id?: string
  timestamp?: string
  source?: string
  kind?: string
  section?: string
  frameworks?: string[]
  signature?: string | null
  report_signature?: string | null
  signature_algorithm?: string | null
  key_id?: string | null
  run_hash?: string | null
  status?: string
  finding_count?: number
  control_fail_count?: number
  risk_score?: number
  metadata?: Record<string, unknown>
}

// isDLQEntry: an entry is "dead-lettered" only when its status field
// explicitly says so. Anything else (including blank) is NOT DLQ —
// this is the contract the hero / row badge rely on, and it must not
// treat "no status" as a failure mode.
export function isDLQEntry(entry: EvidenceLogEntry): boolean {
  const status = (entry.status || '').toLowerCase()
  return status === 'dead_letter' || status === 'dlq' || status === 'failed'
}

// evidenceHasSignature: an entry is "signed" iff a non-empty signature
// or report_signature value is present. NOT "signature is missing but
// the row isn't in DLQ" — that was the bug. Both fields are accepted
// because envelope evidence carries `signature` while run-report
// summaries carry `report_signature` (the hash-chain digest).
export function evidenceHasSignature(entry: EvidenceLogEntry): boolean {
  return Boolean((entry.signature && entry.signature.length > 0) || (entry.report_signature && entry.report_signature.length > 0))
}

// connectorSourceOf: returns the connector-base part of an entry's
// source field (e.g. "vcenter" from "vcenter:dca"). Synthetic sources
// emitted by the run-store backfill ("run_report") and core platform
// events ("core") are excluded — they're not real connector evidence
// and counting them inflates the "Connector sources" stat (the bug
// that returned `sources=1` when the feed was all run reports).
export function connectorSourceOf(entry: EvidenceLogEntry): string | null {
  const raw = entry.source ?? ''
  if (!raw) return null
  const base = raw.split(/[:/]/)[0]
  if (!base || base === 'run_report' || base === 'core') return null
  return base
}

export type EvidenceHero = {
  loaded: number   // records returned in this page
  signed: number   // hasSignature && !DLQ
  unsigned: number // !hasSignature && !DLQ
  dlq: number      // status indicates DLQ
  sources: number  // distinct real connector sources (excludes run_report/core)
}

// deriveEvidenceHero: the SINGLE source of truth for what the Evidence
// hero band displays. Given the loaded list, returns the exact counts
// the UI renders. Unit tests assert these counts against hand-crafted
// inputs so the displayed value can never silently diverge from what
// the backend response actually contains.
export function deriveEvidenceHero(items: EvidenceLogEntry[]): EvidenceHero {
  const loaded = items.length
  const dlq = items.filter(isDLQEntry).length
  const signed = items.filter((e) => evidenceHasSignature(e) && !isDLQEntry(e)).length
  const unsigned = Math.max(0, loaded - signed - dlq)
  const sources = new Set(
    items
      .map((e) => connectorSourceOf(e))
      .filter((s): s is string => Boolean(s)),
  ).size
  return { loaded, signed, unsigned, dlq, sources }
}
