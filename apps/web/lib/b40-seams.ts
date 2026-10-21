/**
 * CP-6 B40 (integration) — THE SOURCE PLATFORM'S LIBRARY FILES (the parts' contract, LIBRARY_B80 / LIBRARY_B82's idiom): each wave-1 part's
 * top-level component file and its exports. B107's design inventory reads exactly these files (`^apps/web/components/[^/]+\.tsx$`,
 * design-source.ts) — each component arrives `proposed` and the Design System Authority approves it in the act (the inventory is registered
 * there, never here). The catalogue renders §VA's and §IN's sections (catalogue/va-fixtures.tsx, in-fixtures.tsx); §RG's, §AP's and §CR's
 * sections are §AC's (wave 2, MAP §3). THREE CLAIMS: construction; demonstrated operation (SYNTHETIC); real acceptance (B111, then H3) —
 * never claimed.
 */
export const LIBRARY_B40 = {
  registry:     { part: '§RG', files: ['components/source-registry.tsx'], exports: ['ReviewedRequest', 'CandidateTable', 'ImpactList', 'RegistryVersions', 'RightsHistory', 'IncidentList'] },
  authenticity: { part: '§VA', files: ['components/authenticity.tsx'], exports: ['AuthenticityOutcomeBadge', 'PublisherKeyTable', 'EvidenceAuthenticityPanel', 'InheritedObligationsPanel', 'TenantRetentionRegister'] },
  intake:       { part: '§IN', files: ['components/intake.tsx'], exports: ['InspectionOutcomeMark', 'VerdictList', 'InspectionPanel', 'IntakeAssessment', 'CaseExcerpt', 'UploadApprovalReview'] },
  acquisition:  { part: '§AP', files: ['components/acquisition-policy.tsx'], exports: ['AcquisitionDeclaration', 'CoverageGapList', 'AuthorizationLedger', 'RobotsCacheList', 'CoverageGapPanel'] },
  connectors:   { part: '§CR', files: ['components/connector-cell.tsx'], exports: ['CellBoundaryNote', 'AdapterPackageCard', 'RequalificationCard', 'EgressReceiptTable'] },
} as const;
