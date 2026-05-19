import { AttestivControlEvidenceDetailPage } from '@/views/AttestivControlEvidenceDetailPage'

export default async function Page({
  params,
}: {
  params: Promise<{ frameworkId: string; controlId: string }>
}) {
  const { frameworkId, controlId } = await params
  return <AttestivControlEvidenceDetailPage frameworkId={frameworkId} controlId={controlId} />
}
