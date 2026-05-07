'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageTitle } from '../components/Ui'
import { oidcHandleCallback } from '../lib/auth'

export function OidcCallbackPage() {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await oidcHandleCallback()
        if (!cancelled) setDone(true)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (done) router.replace('/health')
  }, [done, router])

  if (done) return null

  return (
    <div className="space-y-4">
      <PageTitle>Signing in...</PageTitle>
      <p className="text-sm text-slate-400">Finishing the single sign-on flow and returning to the app.</p>
      {error ? <pre className="whitespace-pre-wrap text-sm text-rose-200">{error}</pre> : null}
      {!error ? <div className="text-sm text-slate-300">Completing OIDC login.</div> : null}
    </div>
  )
}
