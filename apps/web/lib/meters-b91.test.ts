/**
 * CP-6 B91 part `meters` — the client's wording: it says what the record says (quantities in their units, a cap's standing, a breach,
 * the licence bound) and never computes a meter. SYNTHETIC figures.
 */
import { describe, expect, it } from 'vitest';
import { STOPPABLE, UNITS, breachLine, capLine, licenceLine, quantity, type Breach, type Cap } from './meters-b91';

describe('meters-b91 wording', () => {
  it('words quantities in their units', () => {
    expect(quantity(1536, 'bytes')).toBe('1.5 KiB');
    expect(quantity(3_145_728, 'bytes')).toBe('3.0 MiB');
    expect(quantity(512, 'bytes')).toBe('512 B');
    expect(quantity(284, 'wall_ms')).toBe('284 ms');
    expect(quantity(3_600_000, 'wall_ms')).toBe('3600.0 s');
    expect(quantity(3, 'calls')).toBe('3 calls');
  });
  it('words a cap as the server answered it (reached or not), a breach, and the licence', () => {
    const cap = { cap_id: 'c', version: 2, scope: 'TENANT', domain_id: null, dimension: 'simulation_compute', unit: 'wall_ms', period: 'day', limit: 284, action: 'stop', state: 'active', licence: null,
                  reason: 'the corridor study (SYNTHETIC)', set_by: 'p', set_at: '2026-10-04T10:00:00Z', period_start: '2026-10-04T00:00:00+00:00', used: 284, remaining: 0, reached: true } as Cap;
    expect(capLine(cap)).toBe('Simulation compute · 284 ms per day · stops new work at admission — 284 ms used since 2026-10-04 00:00 UTC · REACHED');
    expect(capLine({ ...cap, action: 'warn', dimension: 'model_inference', unit: 'calls', limit: 900, used: 3, remaining: 897, reached: false })).toBe('Model inference · 900 calls per day · warns only — 3 calls used since 2026-10-04 00:00 UTC · 897 calls left');
    const b = { breach_id: 'b', kind: 'refused', action: 'stop', cap_id: 'c', cap_version: 1, dimension: 'simulation_compute', unit: 'wall_ms', period: 'day', period_start: '', limit: 284, used: 284,
                subject_kind: 'experiment', subject_id: '01a10655-0672-77be-9ca3-d71fd37c0dd2', domain_id: null, actor: null, occurred_at: '' } as Breach;
    expect(breachLine(b)).toBe('Simulation compute stop cap v1: new work stopped (experiment 01a10655) — nothing was deleted; 284 ms of 284 ms this day');
    expect(licenceLine({ contracted: false, note: '' })).toBe('Uncontracted — no licence limits apply; a cap is bounded by nothing but itself');
    expect(licenceLine({ contracted: true, licence_id: 'l', version: 3, state: 'active', package_key: 'foresight-decision', limits: {} })).toBe('Licence v3 (foresight-decision, active) — caps are set within its limits');
  });
  it('mirrors the server: stop only for simulation compute; the units per dimension', () => {
    expect(STOPPABLE).toEqual(['simulation_compute']);
    expect(UNITS.model_inference).toEqual(['calls']);
  });
});
