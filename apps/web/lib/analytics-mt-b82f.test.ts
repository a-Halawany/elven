/**
 * B82-F mt — the definition and computation versions said TOGETHER (the catalog, the card, the drill-down, the operating review). The values
 * mirror the demonstration's MET-010 (definition v1 approved 2026-10-12; computation met010_correction_propagation v2 registered in 0120 §CL
 * on 2026-10-19) and are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { computationNowLine, computationTag, recordedComputationLine, registeredAfterDecision, versionsPair, type ComputationNow } from './analytics-md-b92';

const V2: ComputationNow = {
  computation_key: 'met010_correction_propagation', function_name: 'analytics.mc_met010_correction_propagation', version: 2, kind: 'duration', registered_in: '0120 §CL',
  registered_at: '2026-10-19T07:18:56.59666+00:00', body_digest: 'be69c305fa01a0496c0973982c95eb48', description: 'MET-010 v2 (SYNTHETIC test row)',
};

describe('the computation a definition names NOW', () => {
  it('says the key, the registry version, where and when it was registered and its digest; an unsupported or unregistered key says so', () => {
    expect(computationNowLine(V2, 'met010_correction_propagation')).toBe('met010_correction_propagation v2 — registered in 0120 §CL on 2026-10-19 (body digest be69c305fa01…)');
    expect(computationNowLine(null, null)).toBe('none — the definition is unsupported (no computation)');
    expect(computationNowLine(undefined, 'gone_key')).toBe('gone_key — not in the computation registry');
    expect(computationTag(V2, 'met010_correction_propagation')).toBe('met010_correction_propagation v2 (0120 §CL)');
    expect(computationTag(null, null)).toBe('none (unsupported)');
  });
  it('says when the computation was registered AFTER the definition version was decided — and nothing otherwise', () => {
    expect(registeredAfterDecision(V2, '2026-10-12T02:28:52.182052+00:00')).toBe('computation v2 was registered (0120 §CL, 2026-10-19) after this definition version was decided (2026-10-12)');
    expect(registeredAfterDecision(V2, '2026-10-20T00:00:00Z')).toBeNull();
    expect(registeredAfterDecision(V2, null)).toBeNull();
    expect(registeredAfterDecision(null, '2026-10-12T00:00:00Z')).toBeNull();
  });
});

describe('a stored result: its two versions together, its recorded computation beside the registry now', () => {
  it('the pair: definition and computation versions; an unsupported result and an unrecorded version said', () => {
    expect(versionsPair(1, { computation_key: 'met010_correction_propagation', computation_version: 2 })).toBe('definition v1 · computation v2');
    expect(versionsPair(3, { computation_key: null, computation_version: null })).toBe('definition v3 · no computation (unsupported)');
    expect(versionsPair(1, { computation_key: 'k_one', computation_version: null })).toBe('definition v1 · computation version not recorded');
  });
  it('the same version as the registry now; an earlier one (its registration NOT inferred); no version recorded (a stated limitation); no longer registered', () => {
    expect(recordedComputationLine({ computation_key: V2.computation_key, computation_version: 2, computation_digest: V2.body_digest }, V2))
      .toBe('met010_correction_propagation v2 (body digest be69c305fa01…) — the version the registry holds now (registered in 0120 §CL)');
    const earlier = recordedComputationLine({ computation_key: V2.computation_key, computation_version: 1, computation_digest: '0123456789abcdef0123456789abcdef' }, V2);
    expect(earlier).toBe('met010_correction_propagation v1 (body digest 0123456789ab…) — the registry now holds v2 (registered in 0120 §CL on 2026-10-19); where v1 was registered is not recorded (the registry keeps one row per computation)');
    expect(earlier).not.toMatch(/0113/);   // never inferred
    expect(recordedComputationLine({ computation_key: V2.computation_key, computation_version: null }, V2)).toBe('met010_correction_propagation — this result records no computation version (a stated limitation: the version is not inferred)');
    expect(recordedComputationLine({ computation_key: null }, null)).toBe('none — the result is unsupported (no computation ran)');
    expect(recordedComputationLine({ computation_key: 'k_one', computation_version: 1 }, null)).toBe('k_one v1 — the registry no longer holds this computation');
  });
});
