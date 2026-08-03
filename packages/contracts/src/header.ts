/**
 * Canonical intelligence object header — Volume 7 Appendix E (40 fields),
 * an additive refinement of Volume 3 Ch.7's 8 field groups. (ADR-P0-05)
 *
 * The authoritative representation is the typed relational row in
 * `objects.canonical_objects`; this module defines the shared shape,
 * validation, and the content-digest rule (SHA-256 over JCS).
 * Four-axis temporal model: event / observation / valid / record time (ADR-P0-07).
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface CanonicalHeader {
  // Identity block
  object_id: string;
  object_type: string;
  tenant_id: string | null; // null only for PLATFORM-scoped control objects
  domain_id: string | null;
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
  object_version: string; // monotonic integer-as-string per object
  lifecycle_state: string;
  owning_component: string;
  accountable_owner: string;
  source_object_ids: string[];
  // Temporal block (four axes)
  event_time: string | null;
  observation_time: string | null;
  valid_from: string | null;
  valid_to: string | null;
  recorded_at: string; // record time — assigned by the committing component
  time_precision: string; // e.g. 'exact' | 'day' | 'month' | 'approximate'
  source_clock_quality: 'trusted' | 'degraded' | 'unknown';
  // Epistemic block
  truth_state: string;
  synthetic_state: boolean;
  confidence: Record<string, unknown> | null; // {method, scale, value, calibration_ref}
  uncertainty: Record<string, unknown> | null;
  // Provenance block
  evidence_refs: string[];
  provenance_ref: string | null;
  method_ref: string | null;
  contradiction_refs: string[];
  corroboration_refs: string[];
  human_refs: string[];
  // Policy block
  classification: string;
  purpose_scope: string;
  rights_profile: string | null;
  residency_profile: string | null;
  retention_profile: string | null;
  access_policy_ref: string | null;
  // Quality block
  quality_profile: string | null;
  quality_state: Record<string, unknown> | null;
  freshness_state: Record<string, unknown> | null;
  // Schema/semantics block
  schema_ref: string;
  ontology_ref: string | null;
  // Correction block
  correction_of: string | null; // prior (object_id,version) ref corrected by this version
  supersedes: string | null;
  withdrawal_reason: string | null;
  // Audit / payload block
  audit_correlation_id: string;
  content_ref: string | null; // large-object reference; payload inline otherwise
}

/**
 * Provenance minimum for canonical admission (writes without provenance are
 * rejected — Phase 0 acceptance criterion 7): at least one of evidence_refs /
 * source_object_ids / method_ref / human_refs must be present, plus
 * provenance-bearing scope fields validated by the owning component.
 */
export function hasMinimumProvenance(h: Pick<CanonicalHeader, 'evidence_refs' | 'source_object_ids' | 'method_ref' | 'human_refs'>): boolean {
  return (
    h.evidence_refs.length > 0 ||
    h.source_object_ids.length > 0 ||
    h.method_ref !== null ||
    h.human_refs.length > 0
  );
}

const uuid = { type: 'string', format: 'uuid' } as const;
const uuidOrNull = { type: ['string', 'null'], format: 'uuid' } as const;
const isoOrNull = { type: ['string', 'null'], format: 'date-time' } as const;
const strArr = { type: 'array', items: { type: 'string' }, maxItems: 1024 } as const;

export const HEADER_SCHEMA = {
  $id: 'https://the-eye.local/schemas/canonical-header/v1',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: [
    'object_id', 'object_type', 'tenant_id', 'domain_id', 'scope', 'object_version',
    'lifecycle_state', 'owning_component', 'accountable_owner', 'source_object_ids',
    'event_time', 'observation_time', 'valid_from', 'valid_to', 'recorded_at',
    'time_precision', 'source_clock_quality',
    'truth_state', 'synthetic_state', 'confidence', 'uncertainty',
    'evidence_refs', 'provenance_ref', 'method_ref', 'contradiction_refs',
    'corroboration_refs', 'human_refs',
    'classification', 'purpose_scope', 'rights_profile', 'residency_profile',
    'retention_profile', 'access_policy_ref',
    'quality_profile', 'quality_state', 'freshness_state',
    'schema_ref', 'ontology_ref',
    'correction_of', 'supersedes', 'withdrawal_reason',
    'audit_correlation_id', 'content_ref',
  ],
  properties: {
    object_id: uuid,
    object_type: { type: 'string', pattern: '^[A-Z]{3}$' },
    tenant_id: uuidOrNull,
    domain_id: uuidOrNull,
    scope: { enum: ['PLATFORM', 'TENANT', 'DOMAIN'] },
    object_version: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' },
    lifecycle_state: {
      enum: ['proposed', 'admitted', 'active', 'disputed', 'corrected', 'withdrawn', 'superseded', 'archived', 'deleted'],
    },
    owning_component: { type: 'string', minLength: 1, maxLength: 128 },
    accountable_owner: { type: 'string', minLength: 1, maxLength: 256 },
    source_object_ids: strArr,
    event_time: isoOrNull,
    observation_time: isoOrNull,
    valid_from: isoOrNull,
    valid_to: isoOrNull,
    recorded_at: { type: 'string', format: 'date-time' },
    time_precision: { enum: ['exact', 'second', 'minute', 'hour', 'day', 'month', 'year', 'approximate', 'unknown'] },
    source_clock_quality: { enum: ['trusted', 'degraded', 'unknown'] },
    truth_state: {
      enum: ['observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'decided', 'disputed', 'withdrawn'],
    },
    synthetic_state: { type: 'boolean' },
    confidence: { type: ['object', 'null'] },
    uncertainty: { type: ['object', 'null'] },
    evidence_refs: strArr,
    provenance_ref: { type: ['string', 'null'] },
    method_ref: { type: ['string', 'null'] },
    contradiction_refs: strArr,
    corroboration_refs: strArr,
    human_refs: strArr,
    classification: { type: 'string', minLength: 1, maxLength: 64 },
    purpose_scope: { type: 'string', minLength: 1, maxLength: 256 },
    rights_profile: { type: ['string', 'null'] },
    residency_profile: { type: ['string', 'null'] },
    retention_profile: { type: ['string', 'null'] },
    access_policy_ref: { type: ['string', 'null'] },
    quality_profile: { type: ['string', 'null'] },
    quality_state: { type: ['object', 'null'] },
    freshness_state: { type: ['object', 'null'] },
    schema_ref: { type: 'string', minLength: 1 },
    ontology_ref: { type: ['string', 'null'] },
    correction_of: { type: ['string', 'null'] },
    supersedes: { type: ['string', 'null'] },
    withdrawal_reason: { type: ['string', 'null'] },
    audit_correlation_id: uuid,
    content_ref: { type: ['string', 'null'] },
  },
  allOf: [
    // Scope rules (ADR-P0-04)
    { if: { properties: { scope: { const: 'PLATFORM' } } }, then: { properties: { tenant_id: { type: 'null' }, domain_id: { type: 'null' } } } },
    { if: { properties: { scope: { const: 'TENANT' } } }, then: { properties: { tenant_id: { type: 'string' }, domain_id: { type: 'null' } } } },
    { if: { properties: { scope: { const: 'DOMAIN' } } }, then: { properties: { tenant_id: { type: 'string' }, domain_id: { type: 'string' } } } },
    // Synthetic consistency (ADR-P0-06)
    { if: { properties: { truth_state: { const: 'synthetic' } } }, then: { properties: { synthetic_state: { const: true } } } },
    // valid_to requires valid_from
    { if: { properties: { valid_to: { type: 'string' } } }, then: { properties: { valid_from: { type: 'string' } } } },
  ],
} as const;

let compiled: ReturnType<Ajv2020['compile']> | null = null;

export function validateHeader(input: unknown): { ok: boolean; errors?: string[] } {
  if (compiled === null) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats.default ? addFormats.default(ajv) : (addFormats as unknown as (a: Ajv2020) => void)(ajv);
    compiled = ajv.compile(HEADER_SCHEMA as unknown as Record<string, unknown>);
  }
  const valid = compiled(input);
  if (valid) return { ok: true };
  return { ok: false, errors: (compiled.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`) };
}
