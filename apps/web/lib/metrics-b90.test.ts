import { describe, expect, it } from 'vitest';
import { MAX_CERTIFICATION_DAYS, STATE_LABEL, VIEW_LABEL, certificationLine, dayOf, diffLine, expiryWithinLimit, filtersOfLines, instantOfLocal, valueLine } from './metrics-b90';

/** CP-6 B90 §M (0095): the metrics page is worded, never judged on the client (the states, the certification and the values are the server's). */
describe('the semantic metrics page is worded, never scored on the client', () => {
  it('the vocabularies are the migration\'s (the four model states, the two views), each with a glyph and words; the executive view names its rule', () => {
    expect(Object.keys(STATE_LABEL)).toEqual(['declared', 'certified', 'withdrawn', 'expired']);
    expect(Object.keys(VIEW_LABEL)).toEqual(['executive', 'analyst']);
    expect(VIEW_LABEL.executive).toMatch(/certified metrics only/);
    expect(STATE_LABEL.withdrawn).toMatch(/last valid version is frozen/);
    expect(MAX_CERTIFICATION_DAYS).toBe(366);
  });
  it('the certification line names who certified, until when and the signature (or UNSIGNED); a withdrawn one leads with the withdrawal and its reason', () => {
    const c = { certification_id: 'c1', version: 1, certified_by: '0190b1c2-aaaa-7000-8000-000000000001', certified_at: '2026-09-30T10:00:00.000Z', expires_at: '2026-12-29T10:00:00.000Z', signature_id: 's1', met_object_version: 1,
      state: 'active' as const, withdrawn_at: null, withdrawn_by: null, withdrawal_reason: null, signatures: [{ signature_id: 's1', signer: '0190b1c2-aaaa-7000-8000-000000000001', key_id: 'ed25519:0123456789abcdef', signed_at: '2026-09-30T10:00:00.000Z', bound_action: 'products.metric.certify' }] };
    expect(certificationLine(c)).toBe('certified by 0190b1c2… at 2026-09-30T10:00:00.000Z until 2026-12-29T10:00:00.000Z — signed by 0190b1c2… (ed25519:0123456789abcdef) at 2026-09-30T10:00:00.000Z');
    expect(certificationLine({ ...c, signatures: [] })).toMatch(/UNSIGNED$/);
    expect(certificationLine({ ...c, state: 'withdrawn', withdrawn_at: '2026-10-01T00:00:00.000Z', withdrawn_by: 'x', withdrawal_reason: 'reproducibility: the source revision changed' })).toMatch(/^WITHDRAWN at 2026-10-01T00:00:00.000Z: reproducibility/);
    expect(certificationLine(null)).toBe('not certified');
  });
  it('a value line keeps the server\'s number and unit and says when a value is withheld; a diff names the keys from → to', () => {
    expect(valueLine({ grain_key: '2026-08', value: 610000 }, 'EUR')).toBe('2026-08: 610000 EUR');
    expect(valueLine({ grain_key: 'corridor_risk', value: null }, 'points')).toMatch(/withheld/);
    expect(diffLine({ diff_id: 'd', from_version: 1, to_version: 2, changed: [{ key: 'aggregation', from: 'last', to: 'avg' }], recorded_by: 'x', recorded_at: 't' })).toBe('v1 → v2: aggregation "last" → "avg"');
  });
  it('the expiry courtesy check admits only a future instant within 366 days (the port decides); a datetime-local becomes an ISO instant; filter lines become an object', () => {
    const now = new Date('2026-09-30T12:00:00.000Z');
    expect(expiryWithinLimit('2026-12-29T12:00:00.000Z', now)).toBe(true);
    expect(expiryWithinLimit('2026-09-30T11:00:00.000Z', now)).toBe(false);
    expect(expiryWithinLimit('2027-12-01T12:00:00.000Z', now)).toBe(false);
    expect(expiryWithinLimit('nonsense', now)).toBe(false);
    expect(instantOfLocal('')).toBeNull();
    expect(instantOfLocal('2026-09-30T14:00')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(filtersOfLines('measure_id=0190b1c2\n\nobjective_id = abc \nbad line')).toEqual({ measure_id: '0190b1c2', objective_id: 'abc' });
    expect(dayOf('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
    expect(dayOf(null)).toBe('—');
  });
});
