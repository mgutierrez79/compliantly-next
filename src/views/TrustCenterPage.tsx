'use client';
import { useEffect, useState } from 'react'
import Image from 'next/image'
import brandLogo from '../assets/brand-logo.png.png'
import { defaultSettings, loadSettings } from '../lib/settings'
import { Button, Card, ErrorBox } from '../components/Ui'

import { useI18n } from '../lib/i18n';

type TrustCenterFramework = {
  key: string
  name: string
  version: string
}

type TrustCenterReport = {
  run_id?: string | null
  timestamp?: string | null
  pdf_url?: string | null
  md_url?: string | null
}

type ManifestSignatureStatus = {
  enabled: boolean
  present: boolean
  valid?: boolean | null
}

type ManifestVerificationResponse = {
  run_id: string
  status: ManifestSignatureStatus
}

type TrustCenterResponse = {
  frameworks: TrustCenterFramework[]
  latest_report?: TrustCenterReport | null
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

export function TrustCenterPage() {
  const {
    t
  } = useI18n();

  const [data, setData] = useState<TrustCenterResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verifyRunId, setVerifyRunId] = useState('')
  const [verifyStatus, setVerifyStatus] = useState<ManifestSignatureStatus | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultSettings().apiBaseUrl)

  const loadData = async (apiBaseUrlOverride?: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextApiBaseUrl = apiBaseUrlOverride ?? loadSettings().apiBaseUrl
      setApiBaseUrl(nextApiBaseUrl)
      const url = joinUrl(nextApiBaseUrl, '/v1/public/trust-center')
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      const payload = (await response.json()) as TrustCenterResponse
      setData(payload)
      if (payload.latest_report?.run_id) {
        setVerifyRunId(payload.latest_report.run_id)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData(loadSettings().apiBaseUrl)
  }, [])

  const pdfUrl = data?.latest_report?.pdf_url ? joinUrl(apiBaseUrl, data.latest_report.pdf_url) : null
  const mdUrl = data?.latest_report?.md_url ? joinUrl(apiBaseUrl, data.latest_report.md_url) : null

  const verifyManifest = async () => {
    setVerifyError(null)
    setVerifying(true)
    try {
      const runQuery = verifyRunId ? `?run_id=${encodeURIComponent(verifyRunId)}` : ''
      const url = joinUrl(apiBaseUrl, `/v1/public/manifest/verify${runQuery}`)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      const payload = (await response.json()) as ManifestVerificationResponse
      setVerifyStatus(payload.status)
      if (payload.run_id && payload.run_id !== verifyRunId) {
        setVerifyRunId(payload.run_id)
      }
    } catch (err) {
      setVerifyError((err as Error).message)
      setVerifyStatus(null)
    } finally {
      setVerifying(false)
    }
  }

  const verificationLabel = () => {
    if (!verifyStatus) return 'Not checked'
    if (!verifyStatus.enabled) return 'Verification not configured'
    if (!verifyStatus.present) return 'Signature missing'
    if (verifyStatus.valid) return 'Signature valid'
    return 'Signature invalid'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1224] via-[#0f1f36] to-[#102947] text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <Image src={brandLogo} alt="Attestiv" className="h-10 w-auto" priority />
          <div>
            <div className="text-lg font-semibold">{t('Attestiv', 'Attestiv')}</div>
            <div className="text-xs uppercase tracking-wide text-slate-300">{t('Trust Center', 'Trust Center')}</div>
          </div>
        </div>
        <Button onClick={() => void loadData()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 pb-12">
        <section className="rounded-2xl border border-[#1f365a] bg-[#0f1f36]/90 p-6 shadow-lg shadow-black/30">
          <h1 className="text-2xl font-semibold">{t('Compliance frameworks supported', 'Compliance frameworks supported')}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {t(
              'Overview of the frameworks currently supported by Compliantly for this tenant.',
              'Overview of the frameworks currently supported by Compliantly for this tenant.'
            )}
          </p>
        </section>

        {error ? <ErrorBox title={t('Trust center error', 'Trust center error')} detail={error} /> : null}

        <section className="grid gap-4 md:grid-cols-2">
          {(data?.frameworks || []).map(framework => {
            const {
              t
            } = useI18n();

            return (
              <Card key={framework.key}>
                <div className="text-sm font-semibold">{framework.name}</div>
                <div className="mt-1 text-xs text-slate-400">{t('Key:', 'Key:')} {framework.key}</div>
                <div className="mt-2 text-sm text-slate-200">{t('Version:', 'Version:')} {framework.version}</div>
              </Card>
            );
          })}
          {!loading && data?.frameworks?.length === 0 ? (
            <div className="text-sm text-slate-400">{t('No frameworks published yet.', 'No frameworks published yet.')}</div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#1f365a] bg-[#0f1f36]/90 p-6 shadow-lg shadow-black/30">
          <h2 className="text-xl font-semibold">{t('Latest report', 'Latest report')}</h2>
          <div className="mt-2 text-sm text-slate-300">
            {data?.latest_report?.run_id
              ? `Run: ${data.latest_report.run_id} · ${data.latest_report.timestamp || 'n/a'}`
              : 'No report published yet.'}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {pdfUrl ? (
              <a
                href={pdfUrl}
                className="rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100 hover:bg-[#132a4a]"
              >
                {t('Download PDF', 'Download PDF')}
              </a>
            ) : null}
            {mdUrl ? (
              <a
                href={mdUrl}
                className="rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100 hover:bg-[#132a4a]"
              >
                {t('Download Markdown', 'Download Markdown')}
              </a>
            ) : null}
            {!pdfUrl && !mdUrl ? <div className="text-sm text-slate-400">{t('No report available.', 'No report available.')}</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[#1f365a] bg-[#0f1f36]/90 p-6 shadow-lg shadow-black/30">
          <h2 className="text-xl font-semibold">{t('Verify report signature', 'Verify report signature')}</h2>
          <p className="mt-2 text-sm text-slate-300">
            {t(
              'Confirm the run manifest signature for the published report.',
              'Confirm the run manifest signature for the published report.'
            )}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={verifyRunId}
              onChange={(event) => setVerifyRunId(event.target.value)}
              placeholder="run-YYYYMMDD-HHMMSS"
              className="w-full rounded-md border border-[#274266] bg-[#0d1a2b] px-3 py-2 text-sm text-slate-100"
            />
            <Button onClick={verifyManifest} disabled={verifying}>
              {verifying ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
          {verifyError ? <ErrorBox title={t('Verification error', 'Verification error')} detail={verifyError} /> : null}
          <div className="mt-3 text-sm text-slate-200">{t('Status:', 'Status:')} {verificationLabel()}</div>
        </section>
      </main>
    </div>
  );
}
