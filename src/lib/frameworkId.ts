// Maps the humanised framework labels the controls library returns
// ("ISO 27001", "PCI DSS 4.0", …) to the canonical lowercased ids the
// rest of the platform uses ("iso27001", "pci_dss", …).
//
// Direct map because the labels are NOT regex-derivable: the previous
// `\s+v?[\d.]+` regex stripped legitimate id-embedded digits (turned
// "ISO 27001" into "iso", breaking every /scoring/frameworks/{id}/
// controls/{cid} link AND every per-control task/exception lookup
// since the GRC stores key by the canonical id).
//
// Lives in src/lib so vitest can import it without pulling React.

const FRAMEWORK_LABEL_TO_ID: Record<string, string> = {
  'soc 2': 'soc2',
  'soc 2 type ii': 'soc2',
  'iso 27001': 'iso27001',
  'iso/iec 27001': 'iso27001',
  'pci dss 4.0': 'pci_dss',
  'pci dss v4': 'pci_dss',
  'pci-dss v4': 'pci_dss',
  'pci-dss': 'pci_dss',
  'cis controls v8': 'cis',
  cis: 'cis',
  nis2: 'nis2',
  dora: 'dora',
  'dora regulation': 'dora',
  gxp: 'gxp',
  'nist csf 2.0': 'nist',
  nist: 'nist',
}

export function frameworkLabelToId(label: string): string {
  const norm = (label ?? '').trim().toLowerCase()
  if (!norm) return ''
  if (FRAMEWORK_LABEL_TO_ID[norm]) return FRAMEWORK_LABEL_TO_ID[norm]
  // Fallback for an unknown framework: lowercase + collapse whitespace.
  // Do NOT strip digits — that was the original bug.
  return norm.replace(/\s+/g, '')
}
