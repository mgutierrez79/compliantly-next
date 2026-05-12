import { Suspense } from 'react'

import { AttestivConnectorWizard } from '@/views/AttestivConnectorWizard'

// useSearchParams() inside the wizard (used for the ?edit=<row-name>
// flow) requires a Suspense boundary on the route under Next.js 16's
// static prerender, otherwise the build aborts with
// "useSearchParams() should be wrapped in a suspense boundary".
// The fallback is the same blank page the SSR would have rendered
// before the client hydrates — no flash of mismatched content.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AttestivConnectorWizard />
    </Suspense>
  )
}
