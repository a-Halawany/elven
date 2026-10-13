import { describe, expect, it } from 'vitest';
import {
  actReason, bundleItemLine, dayOf, durationWords, objectiveLine, progressReason, routingLine, selectionGuard, stateMark, valueLine,
  type Objective, type Routing, type Success,
} from './delivery-sv-b94';

/** CP-6 B94 §SV (0114_b94_x_sv): the service pages WORD the server's record — they never decide routing, SLA, access or value. SYNTHETIC. */
describe('the service portal words the record, never judges it', () => {
  const routing = (over: Partial<Routing>): Routing => ({
    tier: 'standard', severity: 'S2', reason: 'uncontracted', licence: null, objectives: { response_minutes: 240, resolution_minutes: 2880, update_minutes: 480 }, named_support: null,
    queue: 'standard support queue', contract: null, policy: { version: 1, digest: 'd'.repeat(64) }, ...over,
  });
  it('the routing names its tier, objectives, named support and the licence it was read from', () => {
    expect(routingLine(routing({}))).toBe('STANDARD · S2: response 4 h 0 min, resolution 2 d 0 h · read from no licence (uncontracted)');
    expect(routingLine(routing({ tier: 'premium', named_support: 'SYNTHETIC premium desk', objectives: { response_minutes: 30, resolution_minutes: 480, update_minutes: 60 },
      licence: { licence_id: 'l', version: 5, state: 'active', package_key: 'p', premium_listed: true } })))
      .toBe('PREMIUM · S2: response 30 min, resolution 8 h 0 min · named support: SYNTHETIC premium desk · read from licence v5 (active)');
  });
  it('an objective is met, met late, breached or running — with the time as the server read it; never "healthy"', () => {
    const o = (over: Partial<Objective>): Objective => ({ objective: 'response', due_at: '2026-10-13T09:30:00.000Z', met_at: null, state: 'running', minutes_left: 23, note: '', ...over });
    expect(objectiveLine(o({}))).toBe('response · running · 23 min left (due 2026-10-13 09:30 UTC)');
    expect(objectiveLine(o({ state: 'breached', minutes_left: -95 }))).toBe('response · breached · 1 h 35 min past due (due 2026-10-13 09:30 UTC)');
    expect(objectiveLine(o({ state: 'met_late', met_at: '2026-10-13T10:00:00.000Z', minutes_left: null }))).toBe('response · met late (due 2026-10-13 09:30 UTC) · met 2026-10-13 10:00 UTC');
    expect(durationWords(3 * 1440 + 125)).toBe('3 d 2 h');
  });
  it('states are visibly distinct; resolved is never shown as closed; degraded says NOT recovered', () => {
    expect(stateMark('resolved').text).toMatch(/not closed/);
    expect(stateMark('degraded_guidance').text).toMatch(/NOT recovered/);
    expect(stateMark('closed').glyph).not.toBe(stateMark('resolved').glyph);
    expect(stateMark('something').text).toBe('something');
  });
  it('the acts a state admits, the role that performs them, and why not — the server decides', () => {
    const admin = new Set(['domain_admin']); const support = new Set(['support_engineer']); const manager = new Set(['collection_manager']);
    expect(actReason('close', 'resolved', manager)).toBeNull();
    expect(actReason('close', 'triaged', manager)).toMatch(/is reached from resolved, cannot reproduce/);
    expect(actReason('close', 'resolved', support)).toMatch(/support never performs it/);
    expect(actReason('workaround.execute', 'workaround_offered', support)).toMatch(/customer's own act/);
    expect(actReason('triage', 'open', manager)).toMatch(/domain admin/);
    expect(actReason('triage', 'open', admin)).toBeNull();
    expect(actReason('drill', 'open', support)).toMatch(/domain admin's/);
    expect(progressReason('resolved', 'open')).toMatch(/reached from triaged/);
    expect(progressReason('awaiting_access', 'open')).toBeNull();
  });
  it('a bundle item states its disposition and why, verbatim; a DATE is the day it names; value stays unsupported', () => {
    expect(bundleItemLine({ kind: 'source.evidence', id: 'x', disposition: 'withheld', reason: 'evidence content is the customer\'s data' })).toBe("source.evidence · withheld — evidence content is the customer's data");
    expect(bundleItemLine({ kind: 'source.contract', id: 'x', disposition: 'redacted', redactions: ['persons', 'endpoints'] })).toBe('source.contract · redacted — persons; endpoints');
    expect(bundleItemLine({ kind: 'case', id: 'x', disposition: 'included' })).toBe('case · included');
    expect(dayOf('2026-07-01')).toBe('2026-07-01'); expect(dayOf(null)).toBe('—');
    const v = { state: 'unsupported', carrier: 'B76', reason: 'no approved supported definition', note: '' } as Success['value'];
    expect(valueLine(v)).toBe('realized value UNSUPPORTED — no approved supported definition (carrier B76)');
  });
  it('the selection guard drops an older answer', () => {
    const g = selectionGuard(); const a = g.begin(); const b = g.begin();
    expect(g.current(a)).toBe(false); expect(g.current(b)).toBe(true);
  });
});
