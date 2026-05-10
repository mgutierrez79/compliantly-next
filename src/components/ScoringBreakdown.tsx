'use client'

// ScoringBreakdown — renders one ControlResult.
//
// Two modes:
//   compact (default false): full requirement breakdown, sub-score
//     bars, evidence count + findings list. Used on the
//     /scoring/calculator algorithm tab and the framework detail
//     scoring drill-down.
//   compact = true: name + status + score only, with the requirement
//     breakdown collapsed behind a toggle. Used in the
//     /frameworks/[id] per-control list.

import { useState } from 'react'

import { Badge, StatusBadge } from './AttestivUi'
import { formatPercent, type ControlResult, type RequirementResult } from '../lib/scoring'

export function ScoringBreakdown({
  control,
  compact = false,
}: {
  control: ControlResult
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(!compact)

  return (
    <div
      style={{
        padding: '12px 14px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-md)',
        background: 'var(--color-background-primary)',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{control.ControlName}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            <code style={{ fontSize: 11 }}>{control.ControlID}</code>
            {control.ControlArea ? ` · ${control.ControlArea}` : ''}
            {control.Weight ? ` · weight ${control.Weight}` : ''}
          </div>
        </div>
        <StatusBadge status={control.Status} />
        <div style={{ fontSize: 18, fontWeight: 500, minWidth: 60, textAlign: 'right' }}>
          {formatPercent(control.Score)}
        </div>
        {compact ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <i className={`ti ${expanded ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {expanded && control.RequirementResults && control.RequirementResults.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {control.RequirementResults.map((req, index) => (
            <RequirementRow key={`${req.Tag}-${index}`} req={req} />
          ))}
        </div>
      ) : null}

      {expanded && control.Findings && control.Findings.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {control.Findings.map((finding, index) => (
            <div
              key={index}
              style={{
                fontSize: 12,
                color: 'var(--color-status-red-deep)',
                background: 'var(--color-status-red-bg)',
                padding: '8px 10px',
                borderRadius: 'var(--border-radius-md)',
                marginBottom: 6,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 2 }}>
                <code style={{ fontSize: 11 }}>{finding.Code}</code> · {finding.Description}
              </div>
              {finding.Remediation ? (
                <div style={{ fontSize: 11, opacity: 0.9 }}>{finding.Remediation}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {expanded && control.EvidenceIDs && control.EvidenceIDs.length > 0 ? (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <i className="ti ti-paperclip" aria-hidden="true" />{' '}
          {control.EvidenceIDs.length} evidence record{control.EvidenceIDs.length === 1 ? '' : 's'}
        </div>
      ) : null}
    </div>
  )
}

function RequirementRow({ req }: { req: RequirementResult }) {
  const isGate = req.Type === 'gate'
  const failed = req.GateFailed === true
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) 80px minmax(0, 2fr) 70px',
        gap: 12,
        alignItems: 'center',
        padding: '8px 10px',
        background: 'var(--color-background-secondary)',
        borderRadius: 'var(--border-radius-md)',
        border: failed ? '1px solid var(--color-status-red-mid)' : '0.5px solid var(--color-border-tertiary)',
        fontSize: 12,
      }}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>{req.Tag}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>weight {req.Weight}</div>
      </div>
      <Badge tone={isGate ? (failed ? 'red' : 'navy') : 'gray'}>{isGate ? 'gate' : 'standard'}</Badge>
      <SubScoreBars req={req} />
      <div style={{ fontWeight: 500, textAlign: 'right' }}>{formatPercent(req.CombinedScore)}</div>
    </div>
  )
}

function SubScoreBars({ req }: { req: RequirementResult }) {
  const cells: Array<{ label: string; value: number }> = [
    { label: 'P', value: req.PresenceScore },
    { label: 'Fr', value: req.FreshnessScore },
    { label: 'Fq', value: req.FrequencyScore },
    { label: 'T', value: req.ThresholdScore },
    { label: 'M', value: req.FieldMatchScore },
  ]
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {cells.map((cell) => {
        const tone =
          cell.value >= 0.95
            ? 'var(--color-status-green-mid)'
            : cell.value >= 0.7
              ? 'var(--color-status-amber-mid)'
              : 'var(--color-status-red-mid)'
        return (
          <div
            key={cell.label}
            title={`${cell.label}: ${(cell.value * 100).toFixed(0)}%`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}
          >
            <div
              style={{
                width: '100%',
                height: 4,
                background: 'var(--color-border-tertiary)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(1, cell.value)) * 100}%`,
                  height: '100%',
                  background: tone,
                }}
              />
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{cell.label}</span>
          </div>
        )
      })}
    </div>
  )
}
