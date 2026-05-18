import { DORALandingPage } from '@/views/DORALandingPage'

export const metadata = {
  title: 'Attestiv for DORA — signed evidence packet for your auditor',
  description:
    'DORA Reg. (EU) 2022/2554 evidence pipeline: ICT risk register, third-party Register of Information, 24h/72h/30d incident clock, DR testing with approval gates. Signed pre-packet your auditor verifies offline.',
}

export default function Page() {
  return <DORALandingPage />
}
