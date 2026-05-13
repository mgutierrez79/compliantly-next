import { Suspense } from 'react'

import { AttestivSiteWizard } from '@/views/AttestivSiteWizard'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AttestivSiteWizard />
    </Suspense>
  )
}
