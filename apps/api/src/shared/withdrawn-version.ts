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
  return {
    object_id: String(prior['object_id']),
    object_type: String(prior['object_type']),
    tenant_id: str(prior['tenant_id']),
    domain_id: str(prior['domain_id']),
    scope: 'DOMAIN',
    object_version: String(priorVersion + 1),
    lifecycle_state: 'withdrawn',
    owning_component: String(prior['owning_component'] ?? 'CP-OBS-01'),
    accountable_owner: `principal:${a.actor}`,
    source_object_ids: arr(prior['source_object_ids']),
    event_time: iso(prior['event_time']),
    observation_time: iso(prior['observation_time']),
    valid_from: iso(prior['valid_from']),
    valid_to: iso(prior['valid_to']),
    recorded_at: a.recordedAt,
    time_precision: String(prior['time_precision'] ?? 'exact'),
    source_clock_quality: (clock === 'trusted' || clock === 'degraded' ? clock : 'unknown') as CanonicalHeader['source_clock_quality'],
    // A withdrawn object's truth state SAYS SO (the corrections path's rule): a reader never takes the withdrawn version at face value.
    truth_state: 'withdrawn',
    synthetic_state: Boolean(prior['synthetic_state']),
    confidence: null,
    uncertainty: null,
    evidence_refs: a.evidenceRef === null ? arr(prior['evidence_refs']) : [...arr(prior['evidence_refs']), a.evidenceRef],
    provenance_ref: str(prior['provenance_ref']),
    method_ref: a.methodRef,
    contradiction_refs: [],
    corroboration_refs: [],
    human_refs: [a.actor],
    classification: String(prior['classification']),
    purpose_scope: a.purposeId,
    rights_profile: str(prior['rights_profile']),
    residency_profile: str(prior['residency_profile']),
    retention_profile: str(prior['retention_profile']),
    access_policy_ref: null,
    quality_profile: null,
    quality_state: null,
    freshness_state: null,
    schema_ref: String(prior['schema_ref']),
    ontology_ref: null,
    correction_of: withdrawn,
    supersedes: withdrawn,
    withdrawal_reason: a.withdrawalReason,
    audit_correlation_id: a.correlationId,
    content_ref: str(prior['content_ref']),
  };
}
