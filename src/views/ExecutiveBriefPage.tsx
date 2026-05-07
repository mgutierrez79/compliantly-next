'use client'

import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../lib/api'
import { Card, ErrorBox, Label, PageTitle } from '../components/Ui'
import { MarkdownView } from '../components/MarkdownView'

type MarkdownViewResponse = {
  run_id: string
  path: string
  content: string
}

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
]

export function ExecutiveBriefPage() {
  const [language, setLanguage] = useState('en')
  const [data, setData] = useState<MarkdownViewResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (language) params.set('language', language)
    return params.toString()
  }, [language])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      setLoading(true)
      try {
        const response = await apiJson<MarkdownViewResponse>(`/executive/brief/markdown?${query}`)
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
  }, [query])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Executive Brief</PageTitle>
        <div className="text-xs text-slate-400">{data?.run_id ? `Run ${data.run_id}` : ''}</div>
      </div>

      {error ? <ErrorBox title="Executive brief error" detail={error.message} /> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Language</Label>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="mt-2 rounded-lg border border-[#29446c] bg-[#0b1729] px-3 py-2 text-sm text-slate-100"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-400">{data?.path ? `Source: ${data.path}` : ''}</div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="text-sm text-slate-300">Loading executive brief…</div>
        ) : data?.content ? (
          <MarkdownView content={data.content} />
        ) : (
          <div className="text-sm text-slate-300">No executive brief available.</div>
        )}
      </Card>
    </div>
  )
}
