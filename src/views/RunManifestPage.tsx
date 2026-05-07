'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ApiError, apiJson } from '../lib/api'
import { Card, ErrorBox, Label, PageTitle } from '../components/Ui'
import { formatTimestamp } from '../lib/time'

type RunManifestResponse = {
  run_id: string
  path: string
  manifest: Record<string, unknown>
  signature_status?: SignatureStatus
}

type ManifestIntegrity = {
  inputs_hash?: string
  outputs_hash?: string
  evidence_log_hash?: string
  analytics_hash?: string
  signature?: string | null
}

type SignatureStatus = {
  enabled: boolean
  present: boolean
  valid?: boolean | null
  expected?: string | null
}

type ManifestShape = Record<string, unknown> & {
  timestamp?: string
  run_contract_version?: string
  language?: string
  integrity?: ManifestIntegrity | null
}

export function RunManifestPage() {
  const params = useParams<{ runId: string }>()
  const runId = Array.isArray(params.runId) ? params.runId[0] : params.runId
  const [data, setData] = useState<RunManifestResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    const load = async () => {
      setError(null)
      setLoading(true)
      try {
        const response = await apiJson<RunManifestResponse>(`/runs/${encodeURIComponent(runId)}/manifest`)
        if (!cancelled) setData(response)
      } catch (err) {
        if (!cancelled) setError(err as ApiError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [runId])

  const manifest = (data?.manifest ?? {}) as ManifestShape
  const integrity = manifest.integrity ?? {}
  const rawJson = useMemo(() => (data ? JSON.stringify(data.manifest, null, 2) : ''), [data])
  const signatureStatus = data?.signature_status
  const statusLabel = useMemo(() => {
    if (!signatureStatus) return 'n/a'
    if (!signatureStatus.enabled) return 'Not configured'
    if (!signatureStatus.present) return 'Missing'
    if (signatureStatus.valid) return 'Valid'
    return 'Invalid'
  }, [signatureStatus])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Run Manifest</PageTitle>
        <Link href="/runs" className="text-xs text-slate-300 underline">
          Back to runs
        </Link>
      </div>

      {!runId ? <ErrorBox title="Missing run id" detail="No run id provided in the URL." /> : null}
      {error ? <ErrorBox title="Manifest error" detail={error.message} /> : null}

      <Card>
        {loading ? (
          <div className="text-sm text-slate-300">Loading manifest…</div>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>Run</Label>
              <div className="mt-2 text-sm text-slate-100">{data.run_id}</div>
              <div className="text-xs text-slate-400">{formatTimestamp(String(manifest.timestamp || ''))}</div>
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>Contract version</Label>
              <div className="mt-2 text-sm text-slate-100">{String(manifest.run_contract_version || 'n/a')}</div>
              <div className="text-xs text-slate-400">Language: {String(manifest.language || 'n/a')}</div>
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>Signature</Label>
              <div className="mt-2 text-xs text-slate-300">Status: {statusLabel}</div>
              <div className="mt-2 break-all text-xs text-slate-200">{String(integrity.signature || 'n/a')}</div>
              {signatureStatus?.enabled ? (
                <div className="text-xs text-slate-400">
                  Expected: {signatureStatus.expected ? `${signatureStatus.expected.slice(0, 12)}…` : 'n/a'}
                </div>
              ) : (
                <div className="text-xs text-slate-400">Set COMPLIANCE_MANIFEST_SECRET to enable</div>
              )}
            </div>
            <div className="rounded-xl border border-[#1f365a] bg-[#0b1626] p-4">
              <Label>Hashes</Label>
              <div className="mt-2 text-xs text-slate-300">
                Inputs: {integrity.inputs_hash ? 'present' : 'n/a'}
              </div>
              <div className="text-xs text-slate-300">
                Outputs: {integrity.outputs_hash ? 'present' : 'n/a'}
              </div>
              <div className="text-xs text-slate-300">
                Evidence: {integrity.evidence_log_hash ? 'present' : 'n/a'}
              </div>
              <div className="text-xs text-slate-300">
                Analytics: {integrity.analytics_hash ? 'present' : 'n/a'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-300">No manifest available.</div>
        )}
      </Card>

      {data ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>Raw manifest</Label>
            <div className="text-xs text-slate-400">{data.path}</div>
          </div>
          <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#233a61] bg-[#0d1a2b] p-4 text-xs text-slate-200">
            {rawJson}
          </pre>
        </Card>
      ) : null}
    </div>
  )
}
