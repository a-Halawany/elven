/**
 * B34 (0090) commitments: the NEXT canonical version of a strategy object (an objective revised, a commitment closed) — the prior
 * version's header carried (its controls, owner, sources, classification and profiles), the version bumped, `supersedes` the prior
 * version, the instants and the method of THIS act; the scenario branching's rule (scenarios.service.ts) applied to the strategy types.
 */
import type { CanonicalHeader } from '@eye/contracts';

type Row = Record<string, unknown>;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function nextVersionHeader(prev: Row, a: { actor: string; methodRef: string; purposeId: string; correlationId: string; now: string; humanRefs?: string[] }): CanonicalHeader {
  const version = Number(prev['object_version']) + 1;
  return {
    object_id: String(prev['object_id']), object_type: String(prev['object_type']), tenant_id: String(prev['tenant_id']), domain_id: String(prev['domain_id']), scope: 'DOMAIN',
    object_version: String(version), lifecycle_state: 'active', owning_component: String(prev['owning_component']), accountable_owner: String(prev['accountable_owner']),
    source_object_ids: arr(prev['source_object_ids']), event_time: null, observation_time: a.now, valid_from: null, valid_to: null, recorded_at: a.now,
    time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: prev['synthetic_state'] === true,
    confidence: null, uncertainty: null, evidence_refs: arr(prev['evidence_refs']), provenance_ref: `principal:${a.actor}`, method_ref: a.methodRef,
    contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([...arr(prev['human_refs']), `principal:${a.actor}`, ...(a.humanRefs ?? [])])],
    classification: String(prev['classification']), purpose_scope: a.purposeId, rights_profile: strOrNull(prev['rights_profile']), residency_profile: strOrNull(prev['residency_profile']),
    retention_profile: strOrNull(prev['retention_profile']), access_policy_ref: strOrNull(prev['access_policy_ref']), quality_profile: null, quality_state: (prev['quality_state'] ?? null) as never,
    freshness_state: null, schema_ref: String(prev['schema_ref']), ontology_ref: null, correction_of: null, supersedes: `${String(prev['object_id'])}@${Number(prev['object_version'])}`,
    withdrawal_reason: null, audit_correlation_id: a.correlationId, content_ref: null,
  } as CanonicalHeader;
}
