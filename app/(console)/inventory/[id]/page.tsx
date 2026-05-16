import { AttestivAssetDetailPage } from '@/views/AttestivAssetDetailPage'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AttestivAssetDetailPage assetID={decodeURIComponent(id)} />
}
