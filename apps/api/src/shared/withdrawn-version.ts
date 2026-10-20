/**
 * THE WITHDRAWN VERSION of a canonical object (CP-6 B18; design §2.2, D8, D9) — the one PURE rule three paths share.
 *
 * A withdrawal never edits the row that stands: it admits a NEW version of the same object whose lifecycle and truth
 * state say `withdrawn`, whose `correction_of` and `supersedes` name the version it withdraws, and whose reason says
 * why. The corrections path wrote the field rules first (corrections.service.ts: the identity, scope, schema, temporal,
 * policy and provenance fields the prior's; the version the prior's + 1; confidence, uncertainty, the quality fields,
 * the access policy and the ontology reference cleared; the actor the accountable owner and the one human reference);
 * the governed import generalised them for a revoked package (import-package.ts `importWithdrawalHeaderOf`); B18 lifts
 * them here so a forecast withdrawn as unfit (prediction.forecast.withdraw) and a run whose result is invalidated
 * (simulation.run.invalidate, or a reproduction's unreproducible verdict) admit their withdrawn FCT and SIM versions by
 * the SAME rule — the reproduction's availability check reads the object's latest version, so without the object's own
 * state the chain's automatic step would never fire.
 *
 * This module builds the HEADER alone. The payload the caller hands `objects.admit_version` is the prior payload
 * verbatim (the caller admits it with `canonicalHeaderDigest(header, prior.payload)`); the caller validates the header
 * (`validateHeader`) before the admission as every other admitting path does. No service import: unit-testable on a
 * fixture row.
 */
import type { CanonicalHeader } from '@eye/contracts';
import { buildHeader } from '../objects/header-builder.js';

type Row = Record<string, unknown>;

/** What a withdrawing write says about itself: who, under which correlation and purpose, when, by which method, and why. */
export interface WithdrawnVersionArgs {
  actor: string;
  correlationId: string;
  purposeId: string;
  /** The write's clock, as an ISO instant — the header's `recorded_at`. */
  recordedAt: string;
  /** The withdrawing method, `<action>@<version>` (`prediction.forecast.withdraw@1.0.0`, `simulation.run.invalidate@1.0.0`). */
  methodRef: string;
  /** The header's `withdrawal_reason`, written for a person. */
  withdrawalReason: string;
  /** One evidence reference the withdrawal adds to the prior's (a notice, a case), or null when the act itself is the evidence. */
  evidenceRef: string | null;
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (JSON.parse(v) as unknown[]).map(String) : []);

/**
 * The withdrawn version of a canonical object: the prior row's 43 header fields (`prior`: an objects.canonical_objects
 * row as read — instants as Date or string, `object_version` a bigint string, the reference fields as arrays) with
 * `object_version` + 1, lifecycle_state and truth_state `withdrawn`, `correction_of` = `supersedes` = `<id>@<prior>`,
 * the reason, the method, `human_refs` [actor], the purpose and the correlation of the write; confidence, uncertainty,
 * the quality fields, the access policy and the ontology reference null; the evidence references the prior's plus the
 * one given. A row without a version is refused: nothing is withdrawn from nothing.
 */
export function withdrawnVersionHeaderOf(prior: Row, a: WithdrawnVersionArgs): CanonicalHeader {
  const priorVersion = Number(prior['object_version']);
  if (!Number.isInteger(priorVersion) || priorVersion < 1) throw new Error(`the prior row of ${String(prior['object_id'])} carries no version (${String(prior['object_version'])})`);
  const withdrawn = `${String(prior['object_id'])}@${priorVersion}`;
  const clock = String(prior['source_clock_quality'] ?? 'unknown');
  return buildHeader({
    objectId: String(prior['object_id']),
    objectType: String(prior['object_type']),
    tenantId: str(prior['tenant_id']),
    domainId: str(prior['domain_id']),
    scope: 'DOMAIN',
    objectVersion: String(priorVersion + 1),
    lifecycleState: 'withdrawn',
    owningComponent: String(prior['owning_component'] ?? 'CP-OBS-01'),
    accountableOwner: `principal:${a.actor}`,
    sourceObjectIds: arr(prior['source_object_ids']),
    eventTime: iso(prior['event_time']),
    observationTime: iso(prior['observation_time']),
    validFrom: iso(prior['valid_from']),
    validTo: iso(prior['valid_to']),
    recordedAt: a.recordedAt,
    timePrecision: String(prior['time_precision'] ?? 'exact'),
    sourceClockQuality: (clock === 'trusted' || clock === 'degraded' ? clock : 'unknown') as CanonicalHeader['source_clock_quality'],
    // A withdrawn object's truth state SAYS SO (the corrections path's rule): a reader never takes the withdrawn version at face value.
    truthState: 'withdrawn',
    syntheticState: Boolean(prior['synthetic_state']),
    confidence: null,
    uncertainty: null,
    evidenceRefs: a.evidenceRef === null ? arr(prior['evidence_refs']) : [...arr(prior['evidence_refs']), a.evidenceRef],
    provenanceRef: str(prior['provenance_ref']),
    methodRef: a.methodRef,
    contradictionRefs: [],
    corroborationRefs: [],
    humanRefs: [a.actor],
    classification: String(prior['classification']),
    purposeScope: a.purposeId,
    rightsProfile: str(prior['rights_profile']),
    residencyProfile: str(prior['residency_profile']),
    retentionProfile: str(prior['retention_profile']),
    accessPolicyRef: null,
    qualityProfile: null,
    qualityState: null,
    freshnessState: null,
    schemaRef: String(prior['schema_ref']),
    ontologyRef: null,
    correctionOf: withdrawn,
    supersedes: withdrawn,
    withdrawalReason: a.withdrawalReason,
    auditCorrelationId: a.correlationId,
    contentRef: str(prior['content_ref']),
  });
}
