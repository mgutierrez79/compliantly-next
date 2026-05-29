import { Suspense } from 'react'

import { AttestivNetworkTopology } from '@/views/AttestivNetworkTopology'

// useSearchParams() inside AttestivNetworkTopology (used to read
// the ?app=<id> deep link from the per-app embed's "Open full map"
// button) requires a Suspense boundary on the route under Next.js
// 16's static prerender, otherwise the build aborts with
// "useSearchParams() should be wrapped in a suspense boundary".
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AttestivNetworkTopology />
    </Suspense>
  )
}
