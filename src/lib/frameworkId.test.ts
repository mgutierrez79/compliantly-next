import { describe, it, expect } from 'vitest'
import { frameworkLabelToId } from './frameworkId'

// Regression guard: the previous AttestivFrameworkControlsPage.keyFor
// used the regex `\s+v?[\d.]+` to derive a canonical framework id from
// the display label. That regex stripped legitimate id-embedded digits,
// so "ISO 27001" → "iso" and every /scoring/frameworks/{id}/controls/
// {cid} link 404'd. The canonical ids cannot be derived by regex from
// the display labels; the explicit map IS the source of truth.

describe('frameworkLabelToId', () => {
  it('maps every humanised label to its canonical platform id', () => {
    expect(frameworkLabelToId('SOC 2')).toBe('soc2')
    expect(frameworkLabelToId('SOC 2 Type II')).toBe('soc2')
    expect(frameworkLabelToId('ISO 27001')).toBe('iso27001') // <-- the bug
    expect(frameworkLabelToId('ISO/IEC 27001')).toBe('iso27001')
    expect(frameworkLabelToId('PCI DSS 4.0')).toBe('pci_dss')
    expect(frameworkLabelToId('PCI-DSS v4')).toBe('pci_dss')
    expect(frameworkLabelToId('CIS Controls v8')).toBe('cis')
    expect(frameworkLabelToId('NIS2')).toBe('nis2')
    expect(frameworkLabelToId('DORA')).toBe('dora')
    expect(frameworkLabelToId('DORA regulation')).toBe('dora')
    expect(frameworkLabelToId('GxP')).toBe('gxp')
    expect(frameworkLabelToId('NIST CSF 2.0')).toBe('nist')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(frameworkLabelToId('  iso 27001  ')).toBe('iso27001')
    expect(frameworkLabelToId('Soc 2')).toBe('soc2')
  })

  it('falls back without stripping digits for unknown frameworks', () => {
    // Previously the regex would have turned this into "custom framework"
    // (stripping the year). Now unknown labels just lowercase + collapse
    // whitespace — preserves any embedded digits.
    expect(frameworkLabelToId('Custom Framework 2024')).toBe('customframework2024')
    expect(frameworkLabelToId('')).toBe('')
  })
})
