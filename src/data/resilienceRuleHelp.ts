export type ResilienceRuleHelpQuery = {
  id: string
  title?: string
  category?: string
}

export type ResilienceRuleHelpContent = {
  check: string
  why: string
  resolveSteps: string[]
  evidenceExamples: string[]
}

type ResilienceRuleHelpEntry = {
  key: string
  matcher: {
    ids?: string[]
    includes?: string[]
    categories?: string[]
  }
  content: ResilienceRuleHelpContent
}

const RESILIENCE_RULE_HELP_ENTRIES: ResilienceRuleHelpEntry[] = [
  {
    key: 'rpo',
    matcher: { includes: ['rpo'], categories: ['replication'] },
    content: {
      check:
        'This rule checks whether recovery point objective (RPO) stays within the target defined by the framework.',
      why: 'When RPO is too high, you can lose more data than the business accepts after an incident.',
      resolveSteps: [
        'Identify assets with the highest replication lag and prioritize them first.',
        'Fix replication health issues and verify that lag is decreasing over time.',
        'Confirm fresh RPO samples are collected so the p90 value reflects current conditions.',
      ],
      evidenceExamples: [
        'RPO dashboard/report shows p90 below target for the covered scope.',
        'Replication status is healthy/synchronized for critical systems.',
      ],
    },
  },
  {
    key: 'dr-plan',
    matcher: { includes: ['dr', 'disaster'], categories: ['recovery'] },
    content: {
      check: 'This rule checks that in-scope assets have a clear disaster recovery plan.',
      why: 'Without a maintained DR plan, teams lose time during outages and recovery becomes inconsistent.',
      resolveSteps: [
        'Attach a DR runbook to each critical asset or service.',
        'Assign an owner and review date for every plan.',
        'Run and document DR tests regularly to prove the plan works.',
      ],
      evidenceExamples: [
        'DR runbook document linked to each critical asset with owner and last review date.',
        'Most recent DR test record includes execution notes and outcomes.',
      ],
    },
  },
  {
    key: 'backup',
    matcher: { includes: ['backup'], categories: ['backup'] },
    content: {
      check: 'This rule checks that backup operations are active and successful for the required scope.',
      why: 'If backups fail or are missing, recovery after ransomware or corruption may not be possible.',
      resolveSteps: [
        'Enable or correct backup schedules for uncovered assets.',
        'Investigate failed jobs and remove recurring failure patterns.',
        'Add alerting so new backup failures are handled quickly.',
      ],
      evidenceExamples: [
        'Backup job history shows recent successful runs for critical systems.',
        'Failure queue is empty or actively tracked with remediation tickets.',
      ],
    },
  },
  {
    key: 'recovery',
    matcher: { includes: ['restore', 'recovery', 'failover'], categories: ['recovery'] },
    content: {
      check: 'This rule checks that restore/failover capability is proven, not only planned.',
      why: 'Backup data is not enough by itself; recovery procedures must be tested to be trusted.',
      resolveSteps: [
        'Schedule regular restore or failover tests for key services.',
        'Record test failures and track remediation to closure.',
        'Repeat tests after changes until results are stable.',
      ],
      evidenceExamples: [
        'Successful restore/failover test records with timestamps and scope.',
        'Recovery event logs linked to runbooks or tickets.',
      ],
    },
  },
  {
    key: 'ha',
    matcher: { includes: ['ha', 'high availability', 'availability'], categories: ['availability'] },
    content: {
      check: 'This rule checks that high availability is configured and healthy where required.',
      why: 'Missing or degraded HA increases outage risk from single points of failure.',
      resolveSteps: [
        'Enable HA for eligible systems and connectors.',
        'Verify active-passive or active-active health status after configuration.',
        'Monitor failover readiness continuously and remediate degraded states.',
      ],
      evidenceExamples: [
        'Connector/platform status confirms HA configured and healthy.',
        'Failover readiness checks pass for critical components.',
      ],
    },
  },
  {
    key: 'replication',
    matcher: { includes: ['replication', 'replicate'], categories: ['replication'] },
    content: {
      check: 'This rule checks that replication is enabled and operating correctly.',
      why: 'Unhealthy replication directly impacts continuity and data protection outcomes.',
      resolveSteps: [
        'Enable replication for in-scope assets that are not yet protected.',
        'Resolve replication errors and stale links.',
        'Verify replication returns to healthy/synchronized state.',
      ],
      evidenceExamples: [
        'Replication status report shows healthy state for covered assets.',
        'No open replication-critical errors in connector telemetry.',
      ],
    },
  },
  {
    key: 'telemetry',
    matcher: { includes: ['telemetry', 'signal', 'observability'], categories: ['telemetry'] },
    content: {
      check: 'This rule checks that resilience telemetry is available, current, and complete.',
      why: 'If telemetry is missing, compliance and resilience decisions are based on blind spots.',
      resolveSteps: [
        'Confirm required connectors are enabled and collecting resilience events.',
        'Fix ingestion/parser issues producing missing or invalid signals.',
        'Validate freshness so telemetry reflects current operational state.',
      ],
      evidenceExamples: [
        'Recent resilience signals are present from expected connector sources.',
        'No sustained parsing or ingestion errors in connector status.',
      ],
    },
  },
  {
    key: 'governance',
    matcher: { includes: ['metadata', 'governance'], categories: ['governance'] },
    content: {
      check: 'This rule checks that resilience metadata is complete enough for governance and reporting.',
      why: 'Incomplete metadata makes coverage hard to prove and slows remediation decisions.',
      resolveSteps: [
        'Populate required resilience metadata fields across inventory assets.',
        'Define ownership for metadata quality and review cadence.',
        'Add validation checks to prevent future metadata drift.',
      ],
      evidenceExamples: [
        'Asset records include current HA, DR, replication, and RPO metadata.',
        'Periodic metadata quality report shows low missing-field rates.',
      ],
    },
  },
]

const DEFAULT_HELP_CONTENT: ResilienceRuleHelpContent = {
  check: 'This rule checks whether a required resilience control is in place and evidenced.',
  why: 'A failing rule indicates a gap that can increase recovery risk and audit exposure.',
  resolveSteps: [
    'Review the current evidence and identify the exact control gap.',
    'Implement the missing control or fix the failing implementation.',
    'Re-run collection and verify this rule changes to compliant.',
  ],
  evidenceExamples: [
    'Latest connector evidence supports compliant rule status.',
    'Control ownership, review date, and operational proof are documented.',
  ],
}

function normalize(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function includesAny(text: string, needles: string[] | undefined): boolean {
  if (!needles?.length) return false
  return needles.some((needle) => text.includes(normalize(needle)))
}

function matchesRule(entry: ResilienceRuleHelpEntry, query: ResilienceRuleHelpQuery): boolean {
  const id = normalize(query.id)
  const title = normalize(query.title)
  const category = normalize(query.category)
  const full = `${id} ${title} ${category}`.trim()
  const ids = entry.matcher.ids?.map((item) => normalize(item)) ?? []
  const categories = entry.matcher.categories?.map((item) => normalize(item)) ?? []
  if (ids.length && ids.includes(id)) return true
  if (categories.length && categories.includes(category)) return true
  if (includesAny(full, entry.matcher.includes)) return true
  return false
}

export function getResilienceRuleHelp(query: ResilienceRuleHelpQuery): ResilienceRuleHelpContent {
  const match = RESILIENCE_RULE_HELP_ENTRIES.find((entry) => matchesRule(entry, query))
  return match?.content ?? DEFAULT_HELP_CONTENT
}
