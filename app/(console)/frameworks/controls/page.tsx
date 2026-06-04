// Merged "Controls" view: the coverage register is now the single
// controls page. The register is the full auditable denominator (every
// unit, with evidenced/attested/uncovered/out-of-scope status); the
// former "Scored controls" flat table is reached by filtering to
// Evidenced and drilling into a row's scored-control detail. One entry
// point, one mental model — kills the 140-vs-682 confusion.
import { AttestivCoverageRegisterPage } from '@/views/AttestivCoverageRegisterPage'

export default function Page() {
  return <AttestivCoverageRegisterPage />
}
