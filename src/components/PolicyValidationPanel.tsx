'use client';

// PolicyValidationPanel — on-demand document content-validation UI.
//
// Calls GET /v1/policy-docs/{id}/validate and renders the verdict the backend
// returns: does this document actually contain the elements the standard
// requires? The backend does "AI extracts, rules decide" — the model (or the
// heuristic fallback) detects per-element presence; the deterministic engine
// returns the verdict. This panel just presents it: verdict, completeness, the
// per-element checklist with the quoted evidence, and the provenance (which
// extractor + rubric hash).
//
// States handled:
//   - validated:false                  -> no rubric for this category
//   - result.verdict pass/incomplete/needs_review
//   - extracted:false + needs_ocr      -> scanned/image-only PDF, needs OCR/human
//   - 404                              -> no document uploaded yet

import { useState } from 'react';

import { Badge, Banner, Card, CardTitle, PrimaryButton } from './AttestivUi';
import { apiFetch, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';

type Element = {
  key: string;
  name: string;
  required: boolean;
  present: boolean;
  confidence: number;
  evidence?: string;
};

type ValidationResult = {
  doc_type: string;
  verdict: 'pass' | 'incomplete' | 'needs_review';
  completeness: number;
  pass_threshold: number;
  elements: Element[];
  missing_keys: string[] | null;
  low_conf_keys: string[] | null;
  rubric_hash: string;
  extractor: string;
};

type ValidateResponse = {
  policy_id: string;
  category: string;
  validated: boolean;
  // no-rubric path
  reason?: string;
  available_doc_types?: string[];
  // validated + extracted
  result?: ValidationResult;
  source?: string;
  filename?: string;
  // scanned / unreadable
  verdict?: string;
  doc_type?: string;
  extracted?: boolean;
  needs_ocr?: boolean;
  note?: string;
};

type VerdictView = { tone: 'green' | 'red' | 'amber'; icon: string; label: string };

export function PolicyValidationPanel({ policyId }: { policyId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ValidateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noDoc, setNoDoc] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setNoDoc(false);
    try {
      const r = await apiFetch(`/policy-docs/${encodeURIComponent(policyId)}/validate`);
      if (!r.ok) {
        if (r.status === 404) {
          setNoDoc(true);
          setResp(null);
          return;
        }
        throw new ApiError(`validate failed (${r.status})`, r.status, await r.text());
      }
      setResp((await r.json()) as ValidateResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const result = resp?.result;

  return (
    <Card style={{ marginTop: 12 }} data-tour-id="policy-validation-panel">
      <CardTitle
        right={
          <PrimaryButton onClick={run} disabled={loading} data-tour-id="policy-validate-btn">
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-file-search'}`} aria-hidden="true" />{' '}
            {loading
              ? t('Analyzing document…', 'Analyzing document…')
              : resp || noDoc
                ? t('Re-validate', 'Re-validate')
                : t('Validate document', 'Validate document')}
          </PrimaryButton>
        }
      >
        {t('Content validation', 'Content validation')}
      </CardTitle>

      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 0 }}>
        {t(
          'Checks the uploaded document actually contains the elements this document type requires — not just that a file exists.',
          'Checks the uploaded document actually contains the elements this document type requires — not just that a file exists.'
        )}
      </p>

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {t(
            'Running the content check. The first run can take ~30s while the local model warms up.',
            'Running the content check. The first run can take ~30s while the local model warms up.'
          )}
        </p>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      {noDoc ? (
        <Banner tone="info" title={t('No document yet', 'No document yet')}>
          {t('Upload a document above, then run the content check.', 'Upload a document above, then run the content check.')}
        </Banner>
      ) : null}

      {/* No rubric for this category */}
      {resp && resp.validated === false ? (
        <Banner tone="info" title={t('No content check for this type', 'No content check for this type')}>
          {t(
            'There is no content rubric for the category',
            'There is no content rubric for the category'
          )}{' '}
          <code>{(resp.category || '—').replace(/_/g, ' ')}</code>.
        </Banner>
      ) : null}

      {/* Scanned / unreadable */}
      {resp && resp.validated === true && resp.extracted === false ? (
        <Banner tone="warning" title={t('Could not read the document', 'Could not read the document')}>
          {resp.needs_ocr
            ? t(
                'This looks like a scanned / image-only PDF with no text layer. It needs OCR or a manual review before it can be content-validated.',
                'This looks like a scanned / image-only PDF with no text layer. It needs OCR or a manual review before it can be content-validated.'
              )
            : resp.note || t('The document text could not be extracted.', 'The document text could not be extracted.')}
        </Banner>
      ) : null}

      {/* Full result */}
      {result ? <ResultBody result={result} source={resp?.source} /> : null}
    </Card>
  );
}

function ResultBody({ result, source }: { result: ValidationResult; source?: string }) {
  const { t } = useI18n();
  const v = verdictView(result.verdict, t);
  const pct = Math.round((result.completeness || 0) * 100);
  const present = result.elements.filter((e) => e.present).length;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Badge tone={v.tone} icon={v.icon}>
          {v.label}
        </Badge>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {pct}% {t('complete', 'complete')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {present}/{result.elements.length} {t('elements present', 'elements present')}
        </span>
        <span style={{ flex: 1 }} />
        <ExtractorPill extractor={result.extractor} source={source} t={t} />
      </div>

      {/* completeness bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--color-background-tertiary)',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background:
              v.tone === 'green'
                ? 'var(--color-status-green-mid)'
                : v.tone === 'amber'
                  ? 'var(--color-status-amber-mid)'
                  : 'var(--color-status-red-mid)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {result.elements.map((e) => (
          <ElementRow key={e.key} el={e} />
        ))}
      </div>

      {result.rubric_hash ? (
        <p style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 10, marginBottom: 0 }}>
          {t('Rubric', 'Rubric')} <code>{result.doc_type}</code> · <code>{result.rubric_hash.slice(0, 12)}</code>
        </p>
      ) : null}
    </div>
  );
}

function ElementRow({ el }: { el: Element }) {
  const { t } = useI18n();
  const ok = el.present;
  const color = ok ? 'var(--color-status-green-mid)' : 'var(--color-status-red-mid)';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '6px 8px',
        borderRadius: 4,
        background: 'var(--color-background-secondary)',
      }}
    >
      <i
        className={`ti ${ok ? 'ti-circle-check' : 'ti-circle-x'}`}
        aria-hidden="true"
        style={{ color, marginTop: 1, fontSize: 15 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>
          {el.name}
          {el.required ? null : (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}> · {t('optional', 'optional')}</span>
          )}
        </div>
        {ok && el.evidence ? (
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              fontStyle: 'italic',
              marginTop: 2,
              whiteSpace: 'pre-wrap',
            }}
          >
            “{el.evidence}”
          </div>
        ) : null}
        {!ok ? (
          <div style={{ fontSize: 11, color: 'var(--color-status-red-text, var(--color-status-red-deep))', marginTop: 2 }}>
            {t('missing', 'missing')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExtractorPill({
  extractor,
  source,
  t,
}: {
  extractor: string;
  source?: string;
  t: (k: string, f?: string) => string;
}) {
  let label: string;
  let icon: string;
  if (extractor?.startsWith('llm:')) {
    label = `${t('AI', 'AI')}: ${extractor.slice(4)}`;
    icon = 'ti-sparkles';
  } else if (extractor === 'heuristic') {
    label = t('Rule-based (no model)', 'Rule-based (no model)');
    icon = 'ti-list-check';
  } else {
    label = extractor || t('unknown', 'unknown');
    icon = 'ti-help';
  }
  return (
    <span
      title={source ? `${t('source', 'source')}: ${source}` : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10.5,
        color: 'var(--color-text-tertiary)',
      }}
    >
      <i className={`ti ${icon}`} aria-hidden="true" /> {label}
    </span>
  );
}

function verdictView(verdict: ValidationResult['verdict'], t: (k: string, f?: string) => string): VerdictView {
  switch (verdict) {
    case 'pass':
      return { tone: 'green', icon: 'ti-circle-check', label: t('Passed', 'Passed') };
    case 'needs_review':
      return { tone: 'amber', icon: 'ti-alert-triangle', label: t('Needs review', 'Needs review') };
    default:
      return { tone: 'red', icon: 'ti-alert-circle', label: t('Incomplete', 'Incomplete') };
  }
}
