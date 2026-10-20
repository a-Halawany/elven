/**
 * B34 (0090) commitments: the NEXT canonical version of a strategy object (an objective revised, a commitment closed) — the prior
 * version's header carried (its controls, owner, sources, classification and profiles), the version bumped, `supersedes` the prior
 * version, the instants and the method of THIS act; the scenario branching's rule (scenarios.service.ts) applied to the strategy types.
 */
import type { CanonicalHeader } from '@eye/contracts';
import { buildHeader } from '../../objects/header-builder.js';

type Row = Record<string, unknown>;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function nextVersionHeader(prev: Row, a: { actor: string; methodRef: string; purposeId: string; correlationId: string; now: string; humanRefs?: string[] }): CanonicalHeader {
  const version = Number(prev['object_version']) + 1;
  return buildHeader({
    objectId: String(prev['object_id']), objectType: String(prev['object_type']), tenantId: String(prev['tenant_id']), domainId: String(prev['domain_id']), scope: 'DOMAIN',
    objectVersion: String(version), lifecycleState: 'active', owningComponent: String(prev['owning_component']), accountableOwner: String(prev['accountable_owner']),
    sourceObjectIds: arr(prev['source_object_ids']), eventTime: null, observationTime: a.now, validFrom: null, validTo: null, recordedAt: a.now,
    timePrecision: 'exact', sourceClockQuality: 'trusted', truthState: 'asserted', syntheticState: prev['synthetic_state'] === true,
    confidence: null, uncertainty: null, evidenceRefs: arr(prev['evidence_refs']), provenanceRef: `principal:${a.actor}`, methodRef: a.methodRef,
    contradictionRefs: [], corroborationRefs: [], humanRefs: [...new Set([...arr(prev['human_refs']), `principal:${a.actor}`, ...(a.humanRefs ?? [])])],
    classification: String(prev['classification']), purposeScope: a.purposeId, rightsProfile: strOrNull(prev['rights_profile']), residencyProfile: strOrNull(prev['residency_profile']),
    retentionProfile: strOrNull(prev['retention_profile']), accessPolicyRef: strOrNull(prev['access_policy_ref']), qualityProfile: null, qualityState: (prev['quality_state'] ?? null) as never,
    freshnessState: null, schemaRef: String(prev['schema_ref']), ontologyRef: null, correctionOf: null, supersedes: `${String(prev['object_id'])}@${Number(prev['object_version'])}`,
    withdrawalReason: null, auditCorrelationId: a.correlationId, contentRef: null,
  });
}
