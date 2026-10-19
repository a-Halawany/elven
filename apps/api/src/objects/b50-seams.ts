/**
 * B50 §0 (migration 0120 §0) — THE SEAMS of the knowledge core: the contracts every part codes against (§HD header, identity and time; §LC
 * the work-object lifecycle; §PV provenance, explanation, unfit; §CI impact, triggers, classes; §CL closure, acknowledgement, freeze; §TL
 * timeline, as-of, trace), the knowledge hooks' signatures and use kinds, and the refusal nouns. Types and constants only — no behaviour.
 * Parts add nothing here — ask the integrator.
 *
 * THE HOOKS (0120 §0.1; internal, STABLE, never write — decision.derive_option is STABLE; no runtime grant: reachable only from inside the
 * SECURITY DEFINER ports that call them):
 *   objects.assert_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void        §0's — never re-declared by a part
 *     → objects._header_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void    §HD fills it (header profiles)
 *     → objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void   §PV fills it (product fitness)
 *   objects.publication_frozen(p_type text, p_id uuid, p_version int, OUT frozen boolean, OUT case_id uuid)   §CL fills it (freezes)
 * A part fills its hook by re-declaring the stub WHOLE with the same signature, volatility (STABLE) and return type.
 *
 * WHO CALLS THEM (0120 §0.2, each port copied whole, the call marked `-- B50 §0`):
 *   decision.derive_option          per cited object (kind → type: run SIM, forecast FCT, claim CLM, evidence EVD, assumption ASU, warning WRN)
 *   executive.approve_publication   the version's source (briefing → BRF, report → DPK; source_version = the canonical version) + the freeze
 *   executive.deliver_publication   the same, before any recipient is placed
 *   retention.record_export_package the latest EVD of every executed manifest of the approved scope + the freeze
 *   decision.gate_act               the 'ready' act only: every citation of the version's options
 * A briefing's composition is NOT a use: a briefing is a snapshot of what is known and shows absence; it never refuses (DESIGN D17).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses); DEMONSTRATED OPERATION (the act — SYNTHETIC personas,
 * `claim = 'demonstration'`); REAL ACCEPTANCE (B111's recording path, then R2/H3 — never claimed).
 */

/* ── THE HOOKS ── */
/** The decision-active uses (DESIGN D17 / Q18). objects.assert_usable refuses any other with `object use rejected (use)`. */
export const USE_KINDS = ['decision_option', 'publication', 'export', 'gate'] as const;
export type UseKind = (typeof USE_KINDS)[number];

export const HOOKS = {
  assertUsable: { fn: 'objects.assert_usable(text, uuid, integer, text)', owner: '§0', returns: 'void' },
  headerUsable: { fn: 'objects._header_usable(text, uuid, integer, text)', owner: '§HD', returns: 'void' },
  lineageUsable: { fn: 'objects._lineage_usable(text, uuid, integer, text)', owner: '§PV', returns: 'void' },
  publicationFrozen: { fn: 'objects.publication_frozen(text, uuid, integer)', owner: '§CL', returns: 'record (frozen boolean, case_id uuid)' },
} as const;

/** The ports §0 re-declared (no part re-declares them) and what each passes to the hooks. */
export const HOOKED_PORTS = [
  { fn: 'decision.derive_option(uuid, uuid, timestamp with time zone, date, jsonb, text, text)', from: '0078', use: 'decision_option', frozen: false },
  { fn: 'executive.approve_publication(uuid, uuid, uuid, integer, text, uuid, bigint, uuid, uuid)', from: '0094 §D', use: 'publication', frozen: true },
  { fn: 'executive.deliver_publication(uuid, uuid, uuid, integer, uuid, uuid)', from: '0094 §D', use: 'publication', frozen: true },
  { fn: 'retention.record_export_package(uuid, uuid, uuid, uuid, text, text, jsonb, integer, integer, bigint, text, text, uuid, uuid)', from: '0073', use: 'export', frozen: true },
  { fn: 'decision.gate_act(uuid, uuid, uuid, uuid, integer, text, text, timestamp with time zone, text, text, uuid, uuid, uuid, jsonb, uuid)', from: '0119 §HA', use: 'gate', frozen: false },
] as const;

/** The freeze's answer (objects.publication_frozen). */
export interface FreezeState { frozen: boolean; caseId: string | null }

/**
 * THE REFUSAL NOUNS of §0 (mapped in observation-errors.ts `B50 §0`, at the head of B9_REFUSALS):
 *   `object use rejected (unknown_object)` 23503 → 404 · `(incomplete_header)` / `(unfit)` 22023 → 409 · `(use)` and the rest 22023 → 422;
 *   `publication rejected (held)` / `export rejected (held)` 22023 → 409 (the freeze, raised by the re-declared ports).
 * A part's own nouns (`<noun> rejected (<class>): …`) are reported to the integrator, who maps them.
 */
export const OBJECT_USE_CLASSES = { unknown_object: 404, incomplete_header: 409, unfit: 409, use: 422 } as const;
export type ObjectUseClass = keyof typeof OBJECT_USE_CLASSES;

/* ── §HD HEADER, IDENTITY, TIME ── */
/** A declared absence (DESIGN D3): a jsonb header field that is not known says why — never a bare null. */
export type AbsenceState = 'not_assessed' | 'not_applicable' | 'unknown';
export interface DeclaredAbsence { state: AbsenceState; reason: string }
/** A text field inherits (source contract → evidence → parent → domain) or is `none:<reason>`. */
export type InheritedFrom = 'source_contract' | 'evidence' | 'parent' | 'domain' | 'none';

/** objects.header_profiles: per type, the fields mandatory per use, the issuing authority, the quality profile. */
export interface HeaderProfile {
  objectType: string; version: number;
  mandatory: Partial<Record<UseKind, string[]>>;   // header field names (of the 43) mandatory before that use
  issuingAuthority: string;                          // the owning component / port that issues the identity
  qualityProfile: string | null;
  envelope: string[];                                // the trust-envelope fields the type must carry (V00-T-076)
}

/** The governed time_precision vocabulary (CHECK) — today's header values `exact` / `day` kept. */
export const TIME_PRECISIONS = ['exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'unknown'] as const;
export type TimePrecision = (typeof TIME_PRECISIONS)[number];
export type TimeAxis = 'event' | 'observation' | 'valid_from' | 'valid_to' | 'recorded' | 'document';
/** ES-26-001/-004: unknown, approximate, bounded, recurring and conflicting time stated, never forced to a false instant. */
export interface TimeValue {
  kind: 'exact' | 'bounded' | 'approximate' | 'unknown' | 'recurring' | 'conflicting';
  instant?: string | null;                           // ISO 8601 (exact / approximate centre)
  earliest?: string | null; latest?: string | null;  // bounded: [earliest, latest)
  precision: TimePrecision;
  zone: string | null;                               // IANA zone, e.g. Europe/Berlin
  source: string;                                    // who stated it (e.g. 'publisher text', 'operator')
  rule?: string | null;                              // recurring: the rule (RFC 5545 RRULE)
  conflicts?: Array<{ ref: string; value: string }>; // conflicting: the sources that disagree
  clockQuality?: 'trusted' | 'degraded' | 'unknown';
}
/** objects.version_operations (side ledger keyed by (object_id, version); DESIGN D2). */
export interface VersionOperation { objectId: string; version: number; idempotencyKey: string | null; traceId: string | null }

/* ── §LC THE WORK-OBJECT LIFECYCLE ── */
/** ADR-006's eight canonical states (+ the existing states kept, each type's module states mapped through its profile). */
export const WORK_OBJECT_STATES = ['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired'] as const;
export type WorkObjectState = (typeof WORK_OBJECT_STATES)[number];
export type TransitionActor = 'owner' | 'reviewer' | 'approver';
export type TransitionKind = 'forward' | 're_entry' | 'compensation';
export interface LifecycleTransitionContract {
  from: string; to: string; action: string; actor: TransitionActor; kind: TransitionKind;
  separation: Array<'author' | 'reviewer' | 'approver' | 'owner'>; // who may NOT be the actor
  reentryReason?: string | null;
}
export interface LifecycleProfile {
  objectType: string; version: number;
  states: string[];                                  // the type's own states
  canonicalMap: Record<string, WorkObjectState | 'admitted' | 'active' | 'proposed' | 'disputed' | 'superseded' | 'deleted'>;
  transitions: LifecycleTransitionContract[];
  owningPort: string | null;                         // a module-owned type keeps its own port (0069:79 exclusions)
}
export interface TransitionCommand {
  objectType: string; objectId: string; expectedVersion: number; action: string; to: string;
  idempotencyKey: string; reason: string; causationId?: string | null; correlationId?: string | null;
}
export type TransitionOutcomeKind = 'accepted' | 'rejected' | 'compensated';
export interface TransitionOutcome {
  transitionId: string; outcome: TransitionOutcomeKind; from: string; to: string | null;
  objectVersion: number | null; lastAuthoritativeVersion: number; attemptedAction: string;
  refusal: { class: string; message: string } | null; repeated: boolean; // a repeated idempotency key answers the first result
}

/* ── §PV PROVENANCE, EXPLANATION, UNFIT ── */
export type ExplainNodeKind = 'source' | 'evidence' | 'claim' | 'method' | 'model_call' | 'agent_run' | 'review' | 'approval' | 'signature'
  | 'policy_decision' | 'workflow' | 'human_action' | 'correction' | 'product';
/** ES-28-004: the denied / abstained / challenged / overridden / corrected / failed paths are nodes, not only audit. */
export type ExplainNodeOutcome = 'ok' | 'denied' | 'abstained' | 'challenged' | 'overridden' | 'corrected' | 'failed' | 'unresolved';
export interface ExplainNode {
  nodeId: string; kind: ExplainNodeKind; ref: string;          // `<TYPE>:<id>@<version>` or a ledger row ref
  label: string; outcome: ExplainNodeOutcome; at: string | null;
  actor: string | null; parents: string[];                     // nodeIds this node rests on (backward)
  span?: { start: number; end: number } | null;                // claim_lineage byte span
  boundary?: 'synchronous' | 'event' | 'workflow' | 'agent' | 'model' | 'human' | 'tool';
}
export type FitnessVerdict = 'fit' | 'unfit' | 'unknown';
export interface ProductFitness { ref: string; verdict: FitnessVerdict; reasons: Array<'incomplete_lineage' | 'broken_custody' | 'unverifiable_artifact' | 'unsupported_claim'>; gaps: string[] }

/* ── §CI IMPACT, TRIGGERS, CLASSES ── */
export const AFFECTED_CLASSES = ['current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review'] as const;
export type AffectedClass = (typeof AFFECTED_CLASSES)[number];
export const TRIGGER_KINDS_B50 = ['legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'] as const;
export type TriggerKindB50 = (typeof TRIGGER_KINDS_B50)[number];
export interface AffectedProduct {
  invalidationId: string; ref: string; objectType: string; objectId: string; version: number | null;
  bucket: string;                                     // the walk's bucket (forecasts, warnings, decision_packages, publications, exports, evaluation_datasets, …)
  class: AffectedClass; ruleVersion: string;          // the versioned classification rule
  owner: string | null;                               // the accountable owner who closes it
  path: string[];                                     // the refs from the corrected input to this product
}

/* ── §CL CLOSURE, ACKNOWLEDGEMENT, FREEZE ── */
export type ConsumerAckState = 'pending' | 'acknowledged' | 'recomputed' | 'bounded_exception' | 'failed';
export interface ConsumerAck {
  ackId: string | null; caseId: string; consumer: { kind: 'affected_product' | 'subscription'; ref: string };
  state: ConsumerAckState; by: string | null; at: string | null;
  exception?: { reason: string; expiresAt: string; owner: string } | null;
}
export interface ClosureRecord {
  closureId: string; caseId: string; closedBy: string; closedAt: string;
  reachedConsumers: number; failedDeliveries: Array<{ ref: string; failureClass: string }>;
  residualExposure: Array<{ ref: string; class: AffectedClass; exception: ConsumerAck['exception'] }>;
  acknowledgements: ConsumerAck[]; projectionsReconciled: boolean; auditDigest: string;
}

/* ── §TL TIMELINE, AS-OF, TRACE ── */
export type TimelineAxis = 'event' | 'observation' | 'valid' | 'record';
export interface TimelineItem {
  ref: string; objectType: string; title: string;
  eventTime: string | null; observedAt: string | null; validFrom: string | null; validTo: string | null; recordedAt: string;
  correctedLater: { at: string; by: string } | null;  // shown, never dropped
  clock: 'trusted' | 'degraded' | 'unknown' | 'observation_after_record' | 'conflict';
  time?: TimeValue | null;
}
export interface TimelineDisclosure {
  missingIntervals: Array<{ sourceKey: string; from: string; to: string }>;
  withheld: { count: number; reason: 'classification' | 'audience' | 'policy' };
  clockFlags: number; brokenLineage: Array<{ ref: string; cites: string }>;
  incomplete: boolean;
}
/** graph.trace: explain projected source → evidence → claims → product. */
export interface TraceNode extends ExplainNode { stage: 'source' | 'evidence' | 'claim' | 'product' | 'decision' }
