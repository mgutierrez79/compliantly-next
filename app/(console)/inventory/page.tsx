import { Suspense } from 'react'

import { InventoryPage } from '@/views/InventoryPage'

// useSearchParams() inside InventoryPage (used for the ?asset_type /
// ?source / ?criticality / ?q filter deep-links) requires a Suspense
// boundary on the route under Next.js 16's static prerender, otherwise
// the build aborts with "useSearchParams() should be wrapped in a
// suspense boundary". The fallback is null because the page already
// renders Skeleton rows during its own load() effect.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <InventoryPage />
    </Suspense>
  )
}
