/**
 * The withdrawn version's header at the function boundary (CP-6 B18; design §2.2; D8, D9): the ONE rule the forecast's
 * withdrawal and the run's invalidation share, pinned key by key on a fixture FCT@1 row as objects.canonical_objects
 * answers it (instants as Date, `object_version` a bigint string, the reference fields as arrays) — the prior's fields
 * kept where the corrections path keeps them, the version + 1, lifecycle and truth state withdrawn, `correction_of` =
 * `supersedes` = the version withdrawn, the reason, the method, the actor as the accountable owner and the one human
 * reference, the purpose and the correlation of the write; the cleared fields; the evidence reference appended only when
 * given; a SIM row's synthetic flag kept; a row without a version refused. The result validates and digests.
 */
import { describe, expect, it } from 'vitest';
import { canonicalHeaderDigest, validateHeader } from '@eye/contracts';
import { withdrawnVersionHeaderOf, type WithdrawnVersionArgs } from '../../../src/shared/withdrawn-version.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190c1d2-e3f4-7000-8000-${h}`; };
const T = uid(); const D = uid(); const FCT = uid(); const ACTOR = uid(); const CORR = uid();

/** A forecast's FCT@1 row as the projection reads it: the 43 header columns (the instants as Date), the payload, the digest. */
function forecastRow(over: Row = {}): Row {
  return {
    object_id: FCT, object_type: 'FCT', tenant_id: T, domain_id: D, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
    owning_component: 'CP-PRD-01', accountable_owner: 'principal:issuer', source_object_ids: [`EVD:${uid()}@1`, `EVD:${uid()}@2`],
    event_time: new Date('2021-03-17T00:00:00.000Z'), observation_time: new Date('2026-09-17T09:00:00.000Z'), valid_from: new Date('2021-02-15T00:00:00.000Z'),
    valid_to: new Date('2021-03-17T00:00:00.000Z'), recorded_at: new Date('2026-09-17T09:00:00.000Z'), time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'inferred', synthetic_state: false, confidence: null, uncertainty: { q10: 1.1, q50: 1.2, q90: 1.3 },
    evidence_refs: [`EVD:${uid()}@1`], provenance_ref: 'series:ecb-eurusd', method_ref: 'seasonal-naive@1.0.0', contradiction_refs: [], corroboration_refs: [], human_refs: [],
    classification: 'internal', purpose_scope: 'prediction', rights_profile: 'ECB: shown as published', residency_profile: 'EU', retention_profile: 'default', access_policy_ref: 'policy:fx',
    quality_profile: null, quality_state: { validation: 'validation_impossible' }, freshness_state: { origin_at: '2021-02-15' }, schema_ref: 'FCT@v1', ontology_ref: 'onto:fx',
    correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uid(), content_ref: null,
    payload: { series_key: 'ecb-eurusd', horizon: { code: '30d', days: 30 }, distribution: { q50: 1.2 } }, content_digest: 'a'.repeat(64), ...over,
  };
}
const args = (over: Partial<WithdrawnVersionArgs> = {}): WithdrawnVersionArgs => ({
  actor: ACTOR, correlationId: CORR, purposeId: 'prediction', recordedAt: '2026-09-17T10:00:05.000Z', methodRef: 'prediction.forecast.withdraw@1.0.0',
  withdrawalReason: 'withdrawn as unfit (data_shift): the corridor series shifted after issue', evidenceRef: null, ...over,
});

describe('B18 · withdrawnVersionHeaderOf — the withdrawn version of a canonical object', () => {
  it('a fixture FCT@1 row → the header pinned key by key: the prior\'s identity, temporal, policy and provenance fields; version 2; withdrawn twice over; the version withdrawn named; the write\'s facts', () => {
    const prior = forecastRow();
    const h = withdrawnVersionHeaderOf(prior, args());
    // identity and scope: the prior's
    expect(h.object_id).toBe(FCT); expect(h.object_type).toBe('FCT'); expect(h.tenant_id).toBe(T); expect(h.domain_id).toBe(D); expect(h.scope).toBe('DOMAIN');
    expect(h.object_version).toBe('2');
    expect(h.lifecycle_state).toBe('withdrawn'); expect(h.truth_state).toBe('withdrawn');
    expect(h.correction_of).toBe(`${FCT}@1`); expect(h.supersedes).toBe(`${FCT}@1`);
    expect(h.withdrawal_reason).toBe('withdrawn as unfit (data_shift): the corridor series shifted after issue');
    expect(h.method_ref).toBe('prediction.forecast.withdraw@1.0.0');
    // the write's facts
    expect(h.accountable_owner).toBe(`principal:${ACTOR}`); expect(h.human_refs).toEqual([ACTOR]);
    expect(h.recorded_at).toBe('2026-09-17T10:00:05.000Z'); expect(h.audit_correlation_id).toBe(CORR); expect(h.purpose_scope).toBe('prediction');
    // kept from the prior row: the temporal block (instants re-serialised), the policy labels, the schema, the provenance, the owning component, the clock quality, the sources
    expect(h.event_time).toBe('2021-03-17T00:00:00.000Z'); expect(h.observation_time).toBe('2026-09-17T09:00:00.000Z');
    expect(h.valid_from).toBe('2021-02-15T00:00:00.000Z'); expect(h.valid_to).toBe('2021-03-17T00:00:00.000Z');
    expect(h.time_precision).toBe('exact'); expect(h.source_clock_quality).toBe('trusted');
    expect(h.owning_component).toBe('CP-PRD-01'); expect(h.source_object_ids).toEqual(prior['source_object_ids']);
    expect(h.classification).toBe('internal'); expect(h.rights_profile).toBe('ECB: shown as published'); expect(h.residency_profile).toBe('EU'); expect(h.retention_profile).toBe('default');
    expect(h.schema_ref).toBe('FCT@v1'); expect(h.provenance_ref).toBe('series:ecb-eurusd'); expect(h.synthetic_state).toBe(false);
    // no evidence reference given: the prior's list, unchanged
    expect(h.evidence_refs).toEqual(prior['evidence_refs']);
    // cleared, as the corrections path clears them
    expect(h.confidence).toBeNull(); expect(h.uncertainty).toBeNull(); expect(h.quality_profile).toBeNull(); expect(h.quality_state).toBeNull(); expect(h.freshness_state).toBeNull();
    expect(h.access_policy_ref).toBeNull(); expect(h.ontology_ref).toBeNull(); expect(h.contradiction_refs).toEqual([]); expect(h.corroboration_refs).toEqual([]);
    expect(h.content_ref).toBeNull();
    // the 43 fields, validating and digesting with the prior payload verbatim
    expect(Object.keys(h).length).toBe(43);
    expect(validateHeader(h).ok).toBe(true);
    expect(canonicalHeaderDigest(h, prior['payload'] as Row)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the version is the string of the prior\'s + 1 whatever the driver hands back (a bigint string, a number); an evidence reference is appended when given', () => {
    expect(withdrawnVersionHeaderOf(forecastRow({ object_version: '7' }), args()).object_version).toBe('8');
    expect(withdrawnVersionHeaderOf(forecastRow({ object_version: 3 }), args()).object_version).toBe('4');
    const prior = forecastRow();
    const h = withdrawnVersionHeaderOf(prior, args({ evidenceRef: 'reproduction:abc' }));
    expect(h.evidence_refs).toEqual([...(prior['evidence_refs'] as string[]), 'reproduction:abc']);
    expect(h.correction_of).toBe(`${FCT}@1`);
    expect(validateHeader(h).ok).toBe(true);
  });
  it('a SIM row keeps its synthetic flag, its content reference and a degraded clock; an unknown clock and missing defaults are said as such', () => {
    const SIM = uid();
    const prior = forecastRow({ object_id: SIM, object_type: 'SIM', schema_ref: 'SIM@v2', truth_state: 'synthetic', synthetic_state: true, owning_component: 'CP-SIM-01',
                                source_clock_quality: 'degraded', content_ref: 'vault:evidence/x', event_time: null, observation_time: null, valid_from: null, valid_to: null,
                                provenance_ref: `twin:${uid()}@2`, method_ref: 'supply-flow@1#0123456789abcdef' });
    const h = withdrawnVersionHeaderOf(prior, args({ methodRef: 'simulation.run.invalidate@1.0.0', withdrawalReason: 'reproduction: unreproducible: forecast withdrawn', purposeId: 'simulation' }));
    expect(h.object_type).toBe('SIM'); expect(h.synthetic_state).toBe(true); expect(h.truth_state).toBe('withdrawn'); expect(h.lifecycle_state).toBe('withdrawn');
    expect(h.source_clock_quality).toBe('degraded'); expect(h.content_ref).toBe('vault:evidence/x'); expect(h.schema_ref).toBe('SIM@v2');
    expect(h.event_time).toBeNull(); expect(h.observation_time).toBeNull(); expect(h.valid_from).toBeNull(); expect(h.valid_to).toBeNull();
    expect(h.method_ref).toBe('simulation.run.invalidate@1.0.0'); expect(h.withdrawal_reason).toBe('reproduction: unreproducible: forecast withdrawn'); expect(h.purpose_scope).toBe('simulation');
    expect(validateHeader(h).ok).toBe(true);
    const sparse = withdrawnVersionHeaderOf({ ...prior, source_clock_quality: 'odd', owning_component: null, time_precision: null, source_object_ids: '["a"]', evidence_refs: null }, args());
    expect(sparse.source_clock_quality).toBe('unknown'); expect(sparse.owning_component).toBe('CP-OBS-01'); expect(sparse.time_precision).toBe('exact');
    expect(sparse.source_object_ids).toEqual(['a']); expect(sparse.evidence_refs).toEqual([]);
  });
  it('a row without a version is refused: nothing is withdrawn from nothing', () => {
    expect(() => withdrawnVersionHeaderOf(forecastRow({ object_version: 'x' }), args())).toThrow(/carries no version/);
    expect(() => withdrawnVersionHeaderOf(forecastRow({ object_version: 0 }), args())).toThrow(/carries no version/);
    expect(() => withdrawnVersionHeaderOf(forecastRow({ object_version: null }), args())).toThrow(/carries no version/);
  });
});
