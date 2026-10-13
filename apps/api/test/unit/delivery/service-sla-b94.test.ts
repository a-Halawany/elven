/**
 * B94 §SV (0114_b94_x_sv) — the service portal's pure logic: the live SLA status of a case from the facts its ports recorded, the acts each
 * state admits, and the customer-success assembly (value stays as MET-040 says — unsupported until B76; no renewal-risk score inferred).
 * SYNTHETIC values.
 */
import { describe, expect, it } from 'vitest';
import { ACT_FROM, PROGRESS_FROM, actAvailable, assembleSuccess, slaStatus } from '../../../src/delivery/service/sla.js';

const NOW = '2026-10-13T10:00:00.000Z';
const base = { state: 'open', response_due_at: '2026-10-13T10:30:00.000Z', resolution_due_at: '2026-10-13T18:00:00.000Z', responded_at: null, resolved_at: null,
               response_breached_at: null, resolution_breached_at: null };

describe('slaStatus — the objectives from the recorded facts, never a stored "met"', () => {
  it('running with the minutes left at the database instant', () => {
    expect(slaStatus(base, NOW)).toEqual([
      { objective: 'response', due_at: base.response_due_at, met_at: null, state: 'running', minutes_left: 30, note: 'running' },
      { objective: 'resolution', due_at: base.resolution_due_at, met_at: null, state: 'running', minutes_left: 480, note: 'running' },
    ]);
  });
  it('met by the first response evidence — the earliest of the response and a support-grant request', () => {
    const s = slaStatus({ ...base, responded_at: '2026-10-13T10:20:00.000Z' }, NOW, '2026-10-13T10:05:00.000Z');
    expect(s[0]).toMatchObject({ state: 'met', met_at: '2026-10-13T10:05:00.000Z' });
  });
  it('breached past due (even before the tick records it); met late once a breach is recorded or the response came after the due instant', () => {
    expect(slaStatus(base, '2026-10-13T11:00:00.000Z')[0]).toMatchObject({ state: 'breached', minutes_left: -30, note: expect.stringMatching(/next tick/) });
    expect(slaStatus({ ...base, response_breached_at: '2026-10-13T10:31:00.000Z', responded_at: '2026-10-13T10:40:00.000Z' }, NOW)[0]).toMatchObject({ state: 'met_late' });
  });
  it('the resolution is met only by resolved / cannot_reproduce / closed — a degraded case is NOT resolved', () => {
    expect(slaStatus({ ...base, state: 'degraded_guidance', resolved_at: null }, NOW)[1]).toMatchObject({ state: 'running' });
    expect(slaStatus({ ...base, state: 'resolved', resolved_at: '2026-10-13T12:00:00.000Z' }, NOW)[1]).toMatchObject({ state: 'met' });
    expect(slaStatus({ ...base, state: 'triaged', resolved_at: '2026-10-13T12:00:00.000Z' }, NOW)[1]).toMatchObject({ state: 'running' });   // a reopened case
  });
  it('no due instant → stopped, said', () => {
    expect(slaStatus({ ...base, response_due_at: null }, NOW)[0]).toMatchObject({ state: 'stopped', note: 'no objective recorded' });
  });
});

describe('the acts a state admits (the ports decide; the page words it)', () => {
  it('closure only from resolved / cannot_reproduce; reopen from resolved, unreproduced or closed; triage only from open', () => {
    expect(ACT_FROM.close).toEqual(['resolved', 'cannot_reproduce']);
    expect(actAvailable('reopen', 'closed')).toEqual({ available: true, reason: null });
    expect(actAvailable('triage', 'triaged')).toEqual({ available: false, reason: 'the case is triaged; triage is reached from open' });
    expect(PROGRESS_FROM['resolved']).not.toContain('open');
    expect(PROGRESS_FROM['degraded_guidance']).toContain('workaround_offered');
  });
});

describe('assembleSuccess — the customer-success read model', () => {
  const inputs = {
    health: [], adoption: [{ metric_key: 'ADP-001', state: 'indeterminate' }], outcomes: [], value: { metric_key: 'MET-040', state: 'unsupported', carrier: 'B76' },
    licence: { state: 'active', licence: { version: 5, effective_to: '2027-10-13T00:00:00.000Z' } }, routing: null,
    cases: [{ state: 'open', severity: 'S2' }, { state: 'closed', severity: 'S1' }, { state: 'resolved', severity: 'S2' }],
    breaches: [{ drill: true }, { drill: false }], commitments: [{ state: 'open' }, { state: 'breached' }], reviews: [], read_at: '2026-10-13T00:00:00.000Z',
  };
  it('health not computed is said; adoption indeterminate counted; value unsupported (B76); the term as recorded, no risk score', () => {
    const s = assembleSuccess(inputs);
    expect(s.health).toMatchObject({ state: 'not computed', note: expect.stringMatching(/nothing is shown healthy by inference/) });
    expect(s.adoption).toMatchObject({ determinate: 0, indeterminate: 1 });
    expect(s.value).toMatchObject({ state: 'unsupported', note: 'realized value stays unsupported (B76)' });
    expect(s.licence).toMatchObject({ term_end: '2027-10-13T00:00:00.000Z', days_to_term_end: 365, note: expect.stringMatching(/no renewal-risk score/) });
    expect(s.cases).toEqual({ open: 2, by_severity: { S1: 0, S2: 2, S3: 0, S4: 0 }, breaches: 1, drills: 1, commitments_open: 1, commitments_breached: 1 });
    expect(s.boundary).toMatch(/R2/);
  });
});
