import { describe, expect, it } from 'vitest';
import { validateEnvelope } from '../src/envelope.js';
import { hasMinimumProvenance, validateHeader, type CanonicalHeader } from '../src/header.js';
import {
  isTruthState,
  syntheticConsistencyOk,
  TRUTH_STATES,
  TRUTH_STATE_COMPAT,
} from '../src/truth-state.js';
import { errorBody } from '../src/errors.js';

const validEnvelope = {
  message_id: '01890a5d-ac96-774b-bcce-b302099a8050',
  scope: 'DOMAIN',
  tenant_id: '01890a5d-ac96-774b-bcce-b302099a8051',
  domain_id: '01890a5d-ac96-774b-bcce-b302099a8052',
  principal_id: 'principal:admin',
  action: 'objects.create',
  side_effect_class: 'reversible',
  consequence_class: 'C1',
  object_type: 'CLM',
  schema_version: 'v1',
  issued_at: '2026-08-03T12:00:00.000Z',
  clock_quality: 'trusted',
  correlation_id: '01890a5d-ac96-774b-bcce-b302099a8053',
  trace_id: 't-1',
  payload_digest: 'a'.repeat(64),
};

const validHeader: CanonicalHeader = {
  object_id: '01890a5d-ac96-774b-bcce-b302099a8060',
  object_type: 'CLM',
  tenant_id: '01890a5d-ac96-774b-bcce-b302099a8051',
  domain_id: '01890a5d-ac96-774b-bcce-b302099a8052',
  scope: 'DOMAIN',
  object_version: '1',
  lifecycle_state: 'proposed',
  owning_component: 'CP-OBJ-01',
  accountable_owner: 'principal:admin',
  source_object_ids: [],
  event_time: '2026-08-01T00:00:00.000Z',
  observation_time: '2026-08-02T00:00:00.000Z',
  valid_from: '2026-08-01T00:00:00.000Z',
  valid_to: null,
  recorded_at: '2026-08-03T12:00:00.000Z',
  time_precision: 'exact',
  source_clock_quality: 'trusted',
  truth_state: 'asserted',
  synthetic_state: false,
  confidence: null,
  uncertainty: null,
  evidence_refs: ['evd:1'],
  provenance_ref: null,
  method_ref: null,
  contradiction_refs: [],
  corroboration_refs: [],
  human_refs: [],
  classification: 'internal',
  purpose_scope: 'analysis',
  rights_profile: null,
  residency_profile: null,
  retention_profile: null,
  access_policy_ref: null,
  quality_profile: null,
  quality_state: null,
  freshness_state: null,
  schema_ref: 'CLM@v1',
  ontology_ref: null,
  correction_of: null,
  supersedes: null,
  withdrawal_reason: null,
  audit_correlation_id: '01890a5d-ac96-774b-bcce-b302099a8053',
  content_ref: null,
};

describe('envelope schema (TS-002)', () => {
  it('accepts a valid DOMAIN-scoped envelope', () => {
    expect(validateEnvelope(validEnvelope).ok).toBe(true);
  });

  it('rejects missing mandatory fields before payload processing', () => {
    const { payload_digest: _omit, ...rest } = validEnvelope;
    const r = validateEnvelope(rest);
    expect(r.ok).toBe(false);
  });

  it('fails closed on scope/identifier mismatch (ADR-P0-04)', () => {
    expect(validateEnvelope({ ...validEnvelope, scope: 'PLATFORM' }).ok).toBe(false); // carries tenant ids
    expect(validateEnvelope({ ...validEnvelope, scope: 'TENANT', domain_id: null }).ok).toBe(true);
    expect(validateEnvelope({ ...validEnvelope, scope: 'DOMAIN', domain_id: null }).ok).toBe(false);
  });

  it('rejects unknown fields (no smuggled authority)', () => {
    expect(validateEnvelope({ ...validEnvelope, admin: true }).ok).toBe(false);
  });
});

describe('canonical header schema (TS-002)', () => {
  it('accepts a valid header', () => {
    expect(validateHeader(validHeader)).toEqual({ ok: true });
  });

  it('enforces synthetic consistency (ADR-P0-06)', () => {
    expect(validateHeader({ ...validHeader, truth_state: 'synthetic', synthetic_state: false }).ok).toBe(false);
    expect(validateHeader({ ...validHeader, truth_state: 'synthetic', synthetic_state: true }).ok).toBe(true);
  });

  it('rejects legacy/display truth-state vocabulary in storage', () => {
    for (const bad of ['claimed', 'superseded', 'simulated', 'corrected', 'recommended', 'indeterminate']) {
      expect(validateHeader({ ...validHeader, truth_state: bad }).ok).toBe(false);
    }
  });

  it('enforces scope/identifier rules', () => {
    expect(validateHeader({ ...validHeader, scope: 'PLATFORM' }).ok).toBe(false);
    expect(
      validateHeader({ ...validHeader, scope: 'PLATFORM', tenant_id: null, domain_id: null }).ok,
    ).toBe(true);
  });

  it('valid_to requires valid_from', () => {
    expect(validateHeader({ ...validHeader, valid_from: null, valid_to: '2026-09-01T00:00:00.000Z' }).ok).toBe(false);
  });
});

describe('truth-state model & compatibility mappings (ADR-P0-06)', () => {
  it('has exactly the nine canonical values', () => {
    expect(TRUTH_STATES).toHaveLength(9);
    expect(isTruthState('observed')).toBe(true);
    expect(isTruthState('claimed')).toBe(false);
  });

  it('maps every legacy term to a canonical value or a separate dimension', () => {
    expect(TRUTH_STATE_COMPAT['claimed']).toEqual({ canonical: 'asserted' });
    expect(TRUTH_STATE_COMPAT['simulated']).toEqual({ canonical: 'synthetic' });
    for (const term of ['superseded', 'corrected', 'recommended', 'indeterminate', 'unknown']) {
      const m = TRUTH_STATE_COMPAT[term];
      expect(m && 'dimension' in m).toBe(true);
    }
  });

  it('synthetic consistency helper', () => {
    expect(syntheticConsistencyOk('synthetic', true)).toBe(true);
    expect(syntheticConsistencyOk('synthetic', false)).toBe(false);
    expect(syntheticConsistencyOk('observed', false)).toBe(true);
  });
});

describe('error catalog (Vol 4 App. E)', () => {
  it('builds a policy-safe error body', () => {
    const b = errorBody('EYE_AUT_001', 'corr-1');
    expect(b.code).toBe('EYE-AUT-001');
    expect(b.machineName).toBe('access_denied');
    expect(b.retry).toBe('no');
    expect(b.correlationId).toBe('corr-1');
  });
});
