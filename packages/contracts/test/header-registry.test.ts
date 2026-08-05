/**
 * R10 mandated test 11 — the canonical field registry and the digest binding.
 *
 * Proves: (a) the registry is exactly 40 authoritative + 3 governed = 43
 * fields and matches the validation schema field-for-field; (b) validateHeader
 * rejects a header missing ANY registry field (production writes validate the
 * complete header through this same function); (c) canonicalHeaderDigest
 * changes when ANY of the 43 header fields — or the payload — mutates
 * (parameterized over every field, no exclusions).
 */
import { describe, expect, it } from 'vitest';
import {
  AUTHORITATIVE_HEADER_FIELDS,
  AUTHORITATIVE_HEADER_FIELD_COUNT,
  CANONICAL_HEADER_FIELDS,
  CANONICAL_HEADER_FIELD_COUNT,
  GOVERNED_EXTENSION_FIELDS,
  HEADER_SCHEMA,
  canonicalHeaderDigest,
  validateHeader,
  type CanonicalHeader,
} from '../src/header.js';

const UUID = '019893e2-0000-7000-8000-000000000001';
const UUID2 = '019893e2-0000-7000-8000-000000000002';

function baseline(): CanonicalHeader {
  return {
    object_id: UUID,
    object_type: 'CLM',
    tenant_id: UUID2,
    domain_id: null,
    scope: 'TENANT',
    object_version: '1',
    lifecycle_state: 'admitted',
    owning_component: 'CP-OBJ-01',
    accountable_owner: 'principal:test',
    source_object_ids: [],
    event_time: '2026-01-01T00:00:00.000Z',
    observation_time: '2026-01-02T00:00:00.000Z',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: '2026-02-01T00:00:00.000Z',
    recorded_at: '2026-01-03T00:00:00.000Z',
    time_precision: 'exact',
    source_clock_quality: 'trusted',
    truth_state: 'asserted',
    synthetic_state: false,
    confidence: { method: 'test', scale: 'unit', value: 0.5 },
    uncertainty: null,
    evidence_refs: ['evidence:1'],
    provenance_ref: 'prov:1',
    method_ref: null,
    contradiction_refs: [],
    corroboration_refs: [],
    human_refs: [],
    classification: 'internal',
    purpose_scope: 'test',
    rights_profile: null,
    residency_profile: 'local',
    retention_profile: 'default',
    access_policy_ref: null,
    quality_profile: null,
    quality_state: { checked: true },
    freshness_state: null,
    schema_ref: 'CLM@v1',
    ontology_ref: null,
    correction_of: null,
    supersedes: null,
    withdrawal_reason: null,
    audit_correlation_id: UUID,
    content_ref: null,
  };
}

/** A type-compatible, schema-valid, DIFFERENT value for each field. */
const MUTATIONS: Record<string, unknown> = {
  object_id: UUID2,
  object_type: 'EVD',
  tenant_id: UUID,
  domain_id: UUID, // paired with scope mutation below in digest test only
  scope: 'DOMAIN',
  object_version: '2',
  lifecycle_state: 'corrected',
  owning_component: 'CP-OBJ-02',
  accountable_owner: 'principal:other',
  source_object_ids: ['src:1'],
  event_time: '2026-03-01T00:00:00.000Z',
  observation_time: '2026-03-02T00:00:00.000Z',
  valid_from: '2026-03-01T00:00:00.000Z',
  valid_to: '2026-04-01T00:00:00.000Z',
  recorded_at: '2026-03-03T00:00:00.000Z',
  time_precision: 'day',
  source_clock_quality: 'degraded',
  truth_state: 'observed',
  synthetic_state: true,
  confidence: { method: 'test', scale: 'unit', value: 0.9 },
  uncertainty: { spread: 1 },
  evidence_refs: ['evidence:2'],
  provenance_ref: 'prov:2',
  method_ref: 'method:1',
  contradiction_refs: ['contra:1'],
  corroboration_refs: ['corro:1'],
  human_refs: ['human:1'],
  classification: 'restricted',
  purpose_scope: 'other',
  rights_profile: 'rp:1',
  residency_profile: 'eu',
  retention_profile: 'long',
  access_policy_ref: 'apr:1',
  quality_profile: 'qp:1',
  quality_state: { checked: false },
  freshness_state: { age_days: 3 },
  schema_ref: 'CLM@v2',
  ontology_ref: 'ont:1',
  correction_of: `${UUID}@1`,
  supersedes: `${UUID}@1`,
  withdrawal_reason: 'test withdrawal',
  audit_correlation_id: UUID2,
  content_ref: 'blob:1',
};

describe('the explicit field registry', () => {
  it('is exactly 40 authoritative + 3 governed extensions = 43 stored fields', () => {
    expect(AUTHORITATIVE_HEADER_FIELDS).toHaveLength(AUTHORITATIVE_HEADER_FIELD_COUNT);
    expect(AUTHORITATIVE_HEADER_FIELDS).toHaveLength(40);
    expect(GOVERNED_EXTENSION_FIELDS).toHaveLength(3);
    expect(CANONICAL_HEADER_FIELDS).toHaveLength(CANONICAL_HEADER_FIELD_COUNT);
    expect(CANONICAL_HEADER_FIELDS).toHaveLength(43);
    expect(new Set(CANONICAL_HEADER_FIELDS).size).toBe(43); // no duplicates
  });

  it('matches the validation schema field-for-field (required AND properties)', () => {
    const registry = [...CANONICAL_HEADER_FIELDS].sort();
    expect([...HEADER_SCHEMA.required].sort()).toEqual(registry);
    expect(Object.keys(HEADER_SCHEMA.properties).sort()).toEqual(registry);
  });

  it('the governed extensions are exactly scope, synthetic_state, human_refs', () => {
    expect([...GOVERNED_EXTENSION_FIELDS].sort()).toEqual(['human_refs', 'scope', 'synthetic_state']);
  });

  it('the baseline fixture is valid and covers every registry field', () => {
    const h = baseline();
    expect(Object.keys(h).sort()).toEqual([...CANONICAL_HEADER_FIELDS].sort());
    expect(validateHeader(h).ok).toBe(true);
  });
});

describe('complete-header validation (production write path uses this)', () => {
  it.each(CANONICAL_HEADER_FIELDS.map((f) => [f] as const))('rejects a header missing %s', (field) => {
    const h = baseline() as unknown as Record<string, unknown>;
    delete h[field];
    const res = validateHeader(h);
    expect(res.ok).toBe(false);
  });

  it('rejects unknown extra fields (additionalProperties: false)', () => {
    const h = { ...baseline(), smuggled: true } as unknown;
    expect(validateHeader(h).ok).toBe(false);
  });

  it('canonicalHeaderDigest refuses an incomplete header', () => {
    const h = baseline() as unknown as Record<string, unknown>;
    delete h['classification'];
    expect(() => canonicalHeaderDigest(h as unknown as CanonicalHeader, {})).toThrow(/digest-bound/);
  });
});

describe('mandated 11 — every registry field is digest-bound', () => {
  const payload = { amount: 100, currency: 'EUR' };

  it.each(CANONICAL_HEADER_FIELDS.map((f) => [f] as const))('mutating %s changes the digest', (field) => {
    const before = canonicalHeaderDigest(baseline(), payload);
    const mutated = { ...baseline(), [field]: MUTATIONS[field] } as CanonicalHeader;
    const after = canonicalHeaderDigest(mutated, payload);
    expect(after).not.toBe(before);
  });

  it('mutating the payload changes the digest', () => {
    const before = canonicalHeaderDigest(baseline(), payload);
    expect(canonicalHeaderDigest(baseline(), { ...payload, amount: 101 })).not.toBe(before);
  });

  it('the digest is stable for identical input (JCS determinism)', () => {
    expect(canonicalHeaderDigest(baseline(), payload)).toBe(canonicalHeaderDigest(baseline(), payload));
  });
});
