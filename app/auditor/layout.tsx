// Auditor route group layout.
//
// Deliberately minimal — the auditor isn't an operator; they don't
// need the console sidebar, sub-nav, or settings menu. Just a
// brand strip + the page body. The bigger surface lives inside
// each page (executive summary, heatmap, prepacket download).
//
// Token capture happens on first render inside the page component
// so this layout stays a server component (no useEffect needed
// here).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Attestiv · Auditor portal',
  description: 'Read-only audit view for external auditors',
}

export default function AuditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-family-base)',
      }}
    >
      <header
        style={{
          borderBottom: '0.5px solid var(--color-border-secondary)',
          background: 'var(--color-background-primary)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Attestiv
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            · Auditor portal
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Read-only · token-authenticated</span>
      </header>
      <main>{children}</main>
    </div>
  )
}
