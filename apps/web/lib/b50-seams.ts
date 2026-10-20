/**
 * B50 §0 (the integrator's prelude) — THE SEAMS the web parts code against (§HD header, identity, time; §LC the work-object lifecycle; §PV
 * provenance, explanation, unfit; §CI impact and affected classes; §CL closure, acknowledgement, freeze; §TL timeline, as-of, trace). Types
 * and the file / export contract only — no behaviour. The server's shapes are apps/api/src/objects/b50-seams.ts; these are the same
 * contracts as the pages read them (camelCase over the routes). New library components go ONLY in top-level `components/knowledge.tsx`
 * (B107's inventory reads `^apps/web/components/[^/]+\.tsx$`), each part in its own marked block (`/* B50 <part> *\/ … /* end B50 <part> *\/`);
 * they arrive `proposed` and the DSA approves them in the act. B81's ObjectHeader, LifecycleView, CommandReview, TypedConfirmation and
 * B80's DiffViewer are composed, never forked (dg-lint-2). Every consequential act (publish, retire, acknowledge, except, close, the
 * freeze lift) stays behind its page's Command Review and its own governed port; nothing is shown current, fit or closed by inference.
 */

/* ── THE KNOWLEDGE HOOKS (server-side; the pages show their refusals in the server's words) ── */
export type UseKind = 'decision_option' | 'publication' | 'export' | 'gate';
export interface FreezeState { frozen: boolean; caseId: string | null }

/* ── §HD HEADER, IDENTITY, TIME ── */
export type AbsenceState = 'not_assessed' | 'not_applicable' | 'unknown';
/** A declared absence, shown in words — never a blank. A version recorded before B50 reads "recorded before B50 — not populated". */
export interface DeclaredAbsence { state: AbsenceState; reason: string }
export type HeaderFieldValue<T = unknown> = { kind: 'value'; value: T } | { kind: 'absent'; absence: DeclaredAbsence } | { kind: 'pre_b50' };
export interface HeaderProfile {
  objectType: string; version: number; mandatory: Partial<Record<UseKind, string[]>>;
  issuingAuthority: string; qualityProfile: string | null; envelope: string[];
}
export type TimePrecision = 'exact' | 'second' | 'minute' | 'hour' | 'day' | 'part_of_month' | 'month' | 'quarter' | 'year' | 'unknown';
export interface TimeValue {
  kind: 'exact' | 'bounded' | 'approximate' | 'unknown' | 'recurring' | 'conflicting';
  instant?: string | null; earliest?: string | null; latest?: string | null;
  precision: TimePrecision; zone: string | null; source: string;
  rule?: string | null; conflicts?: Array<{ ref: string; value: string }>; clockQuality?: 'trusted' | 'degraded' | 'unknown';
}

/* ── §LC THE WORK-OBJECT LIFECYCLE ── */
/** ADR-006's eight states; `reviewed` maps to LS-03 on B81's catalogue (no new LS code). */
export type WorkObjectState = 'draft' | 'reviewed' | 'approved' | 'published' | 'corrected' | 'withdrawn' | 'archived' | 'retired';
export interface LifecycleProfile {
  objectType: string; version: number; states: string[]; canonicalMap: Record<string, string>;
  transitions: Array<{ from: string; to: string; action: string; actor: 'owner' | 'reviewer' | 'approver'; kind: 'forward' | 're_entry' | 'compensation' }>;
}
export interface TransitionCommand { objectType: string; objectId: string; expectedVersion: number; action: string; to: string; idempotencyKey: string; reason: string }
export interface TransitionOutcome {
  transitionId: string; outcome: 'accepted' | 'rejected' | 'compensated'; from: string; to: string | null;
  objectVersion: number | null; lastAuthoritativeVersion: number; attemptedAction: string;
  refusal: { class: string; message: string } | null; repeated: boolean;
}

/* ── §PV PROVENANCE, EXPLANATION, UNFIT ── */
export type ExplainNodeOutcome = 'ok' | 'denied' | 'abstained' | 'challenged' | 'overridden' | 'corrected' | 'failed' | 'unresolved';
export interface ExplainNode {
  nodeId: string; kind: string; ref: string; label: string; outcome: ExplainNodeOutcome; at: string | null; actor: string | null; parents: string[];
  span?: { start: number; end: number } | null; boundary?: 'synchronous' | 'event' | 'workflow' | 'agent' | 'model' | 'human' | 'tool';
}
export interface TraceNode extends ExplainNode { stage: 'source' | 'evidence' | 'claim' | 'product' | 'decision' }

/* ── §CI IMPACT AND AFFECTED CLASSES ── */
export type AffectedClass = 'current' | 'stale' | 'challenged' | 'withdrawn' | 'recompute' | 'human_review';
export interface AffectedProduct {
  invalidationId: string; ref: string; objectType: string; objectId: string; version: number | null;
  bucket: string; class: AffectedClass; ruleVersion: string; owner: string | null; path: string[];
}

/* ── §CL CLOSURE, ACKNOWLEDGEMENT, FREEZE ── */
export type ConsumerAckState = 'pending' | 'acknowledged' | 'recomputed' | 'bounded_exception' | 'failed';
export interface ConsumerAck {
  ackId: string | null; caseId: string; consumer: { kind: 'affected_product' | 'subscription'; ref: string };
  state: ConsumerAckState; by: string | null; at: string | null; exception?: { reason: string; expiresAt: string; owner: string } | null;
}
export interface ClosureRecord {
  closureId: string; caseId: string; closedBy: string; closedAt: string; reachedConsumers: number;
  failedDeliveries: Array<{ ref: string; failureClass: string }>;
  residualExposure: Array<{ ref: string; class: AffectedClass; exception: ConsumerAck['exception'] }>;
  acknowledgements: ConsumerAck[]; projectionsReconciled: boolean; auditDigest: string;
}

/* ── §TL TIMELINE, AS-OF, TRACE ── */
export type TimelineAxis = 'event' | 'observation' | 'valid' | 'record';
export interface TimelineItem {
  ref: string; objectType: string; title: string;
  eventTime: string | null; observedAt: string | null; validFrom: string | null; validTo: string | null; recordedAt: string;
  correctedLater: { at: string; by: string } | null;
  clock: 'trusted' | 'degraded' | 'unknown' | 'observation_after_record' | 'conflict'; time?: TimeValue | null;
}
export interface TimelineDisclosure {
  missingIntervals: Array<{ sourceKey: string; from: string; to: string }>;
  withheld: { count: number; reason: 'classification' | 'audience' | 'policy' };
  clockFlags: number; brokenLineage: Array<{ ref: string; cites: string }>; incomplete: boolean;
}

/* ── THE LIBRARY'S NEW FILE AND EXPORTS (appended to B80's LIBRARY and B81's LIBRARY_B81 at the fold; one file, a block per part) ── */
export const LIBRARY_B50 = {
  header:    { part: '§HD', files: ['components/knowledge.tsx'], exports: ['TimeValueText', 'DeclaredAbsenceText'] },
  lifecycle: { part: '§LC', files: ['components/knowledge.tsx'], exports: ['LifecycleHistory', 'TransitionOutcomeNote'] },
  lineage:   { part: '§PV', files: ['components/knowledge.tsx'], exports: ['ExplainPath', 'FitnessNote'] },
  impact:    { part: '§CI', files: ['components/knowledge.tsx'], exports: ['AffectedClassBadge', 'AffectedProductList'] },
  closure:   { part: '§CL', files: ['components/knowledge.tsx'], exports: ['FreezeMarker', 'AcknowledgementList', 'ClosureRecordView'] },
  timeline:  { part: '§TL', files: ['components/knowledge.tsx'], exports: ['TimelineScrubber', 'TimelineDisclosureNote', 'TraceView'] },
} as const;
