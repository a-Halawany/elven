import { describe, expect, it } from 'vitest';
import {
  CLOSURE_KINDS, GAP_ACCEPTOR_ROLES, OPEN_STATES, REMEDIATION_STATES, STEP_KINDS, closureLine, isOpen, measurementLine, openPayload, remediationMark, stepLine, stepPayload,
} from './coverage-remediation';

/** CP-6 B28 (0088 §R): the remediation's words are the server's; the helpers only word what the record says. */
describe('coverage remediations are worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (observation.coverage_remediations CHECK, the ports\' kinds, the accept_gap roles)', () => {
    expect([...REMEDIATION_STATES]).toEqual(['open', 'in_progress', 'closed_recovered', 'closed_gap_accepted', 'withdrawn']);
    expect([...OPEN_STATES]).toEqual(['open', 'in_progress']);
    expect([...STEP_KINDS]).toEqual(['fallback_source', 'recollect', 'accept_gap']);
    expect([...CLOSURE_KINDS]).toEqual(['recovered', 'gap_accepted']);
    expect([...GAP_ACCEPTOR_ROLES]).toEqual(['collection_manager', 'domain_admin']);
    expect(REMEDIATION_STATES.filter(isOpen)).toEqual(['open', 'in_progress']);
  });
  it('every state has glyph + word + token (never colour alone)', () => {
    for (const s of [...REMEDIATION_STATES, 'other']) {
      const m = remediationMark(s);
      expect(m.token).toMatch(/^--eye-color-/);
      expect(m.glyph.length).toBeGreaterThan(0);
      expect(m.text.length).toBeGreaterThan(0);
    }
    expect(remediationMark('closed_recovered').text).toBe('CLOSED — SOURCE RECOVERED');
  });
  it('the steps, the gap and the closure are worded from the record', () => {
    expect(stepLine({ step: 1, kind: 'fallback_source', reason: 'r', by: 'p', at: 't', event_id: 'e', fallback_name: 'Corridor stream', fallback_health: { state: 'healthy', at: null, basis: 'x', ref: null } })).toBe('fallback to Corridor stream (healthy)');
    expect(stepLine({ step: 2, kind: 'recollect', reason: 'r', by: 'p', at: 't', event_id: 'e', run_id: 'run-1', run_state: 'finished', items_admitted: 3 })).toBe('re-collection run run-1 (finished, 3 admitted)');
    expect(stepLine({ step: 3, kind: 'accept_gap', reason: 'r', by: 'p', at: 't', event_id: 'e' })).toBe('gap accepted by a second person');
    expect(measurementLine('blind_spots', { state: 'absent', reason: 'no blind_spots measurement is recorded for this source' })).toBe('blind_spots: absent — no blind_spots measurement is recorded for this source');
    expect(measurementLine('degraded_regions', { state: 'unknown', window_start: 'a', window_end: 'b' })).toBe('degraded_regions: unknown over a → b');
    expect(measurementLine('blind_spots', undefined)).toBe('blind_spots: not reported');
    expect(closureLine(null)).toBe('open');
    expect(closureLine({ kind: 'recovered', by: 'p', at: 't', automatic: true })).toMatch(/^closed automatically/);
    expect(closureLine({ kind: 'recovered', by: 'p', at: 't', automatic: false, health: { state: 'healthy', at: null, basis: 'coverage evaluation', ref: null } })).toBe('closed recovered by a person (the source healthy per coverage evaluation)');
    expect(closureLine({ kind: 'gap_accepted', by: 'p', at: 't', automatic: false })).toBe('closed on the gap accepted by a second person');
  });
  it('the payloads send only what is set, trimmed', () => {
    expect(openPayload('item', '', '  why  ')).toEqual({ itemId: 'item', reason: 'why' });
    expect(openPayload('item', ' owner ', 'why')).toEqual({ itemId: 'item', owner: 'owner', reason: 'why' });
    expect(stepPayload('fallback_source', ' r ', ' src ')).toEqual({ kind: 'fallback_source', reason: 'r', fallbackSourceId: 'src' });
    expect(stepPayload('recollect', 'r', 'run')).toEqual({ kind: 'recollect', reason: 'r', runId: 'run' });
    expect(stepPayload('accept_gap', 'r', 'ignored')).toEqual({ kind: 'accept_gap', reason: 'r' });
  });
});
