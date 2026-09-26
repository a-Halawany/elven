import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGER_ROLE, IMPACT_STATES, IMPACT_SUBJECT_KINDS, acknowledgePayload, constraintLine, gateLine, healthMark, markersPayload } from './source-impact';

/** CP-6 B24 (0086 §markers): the markers' words are the server's; the helpers only word what the record says. */
describe('source-impact markers are worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (observation.source_impact_markers CHECKs, the PDP rule)', () => {
    expect([...IMPACT_STATES]).toEqual(['failed', 'suspended', 'degraded', 'unknown']);
    expect([...IMPACT_SUBJECT_KINDS]).toEqual(['forecast', 'warning', 'scenario', 'run', 'package']);
    expect(ACKNOWLEDGER_ROLE).toBe('decision_authority');
  });
  it('every state has glyph + word + token (never colour alone)', () => {
    for (const s of [...IMPACT_STATES, 'cleared', 'other']) {
      const m = healthMark(s);
      expect(m.token).toMatch(/^--eye-color-/);
      expect(m.glyph.length).toBeGreaterThan(0);
      expect(m.text.length).toBeGreaterThan(0);
    }
    expect(healthMark('suspended').text).toBe('SOURCE SUSPENDED');
    expect(healthMark('degraded').token).toBe('--eye-color-warning');
  });
  it('the constraint line states the server\'s rules: a failed or suspended source refuses a run; a degraded one declares it; a package waits for the acknowledgement', () => {
    expect(constraintLine('forecast', 'suspended')).toMatch(/refused until the source recovers/);
    expect(constraintLine('scenario', 'failed')).toMatch(/refused/);
    expect(constraintLine('scenario', 'degraded')).toMatch(/admitted with the source impact declared/);
    expect(constraintLine('forecast', 'unknown')).toMatch(/admitted/);
    expect(constraintLine('package', 'degraded')).toMatch(/decision authority acknowledges the impact for that version/);
    expect(constraintLine('run', 'suspended')).toMatch(/for that version/);
  });
  it('the gate line reads the server\'s gate and count', () => {
    expect(gateLine({ gate: 'clear', outstanding: 0, version: 2, markers: [] })).toBe('no active source-impact marker bears on version 2');
    expect(gateLine({ gate: 'blocked', outstanding: 3, version: 1, markers: [{} as never, {} as never, {} as never] })).toMatch(/^3 marker\(s\) bearing on version 1 not acknowledged/);
    expect(gateLine({ gate: 'clear', outstanding: 0, version: 1, markers: [{} as never] })).toMatch(/every marker bearing on version 1 is acknowledged/);
  });
  it('the payloads send only what is set; the acknowledgement deduplicates and trims', () => {
    expect(markersPayload()).toEqual({});
    expect(markersPayload({ state: '', sourceId: null })).toEqual({});
    expect(markersPayload({ state: 'all', sourceId: 'src' })).toEqual({ state: 'all', sourceId: 'src' });
    expect(acknowledgePayload(2, ['a', 'b', 'a', ' '], '  the reason  ')).toEqual({ version: 2, markerIds: ['a', 'b'], reason: 'the reason' });
  });
});
