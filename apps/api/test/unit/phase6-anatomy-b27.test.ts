/**
 * CP-6 B27 part `anatomy` (0097 §A) — the pure logic: the intervention → mechanism → impact map, the grouping by kind, the route validators,
 * EVERY refusal text of the migration through the mapper (its class → its status), and the PDP's exact rules.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  AnatomyService, ELEMENT_KINDS, groupByKind, mapInterventions, validateElement, validateLink, validateRecord, validateSuspend, visibleElements, type AnatomyElement,
} from '../../src/prediction/scenarios/anatomy/anatomy.service.js';

const C = '0190b1c2-d3e4-7000-8000-0000000000c0';
const U = (n: number) => `0190b1c2-d3e4-7000-8000-${String(n).padStart(12, '0')}`;
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); } catch (e) { if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) }; throw e; }
  throw new Error('the validator should have refused');
};
const el = (n: number, kind: AnatomyElement['kind'], name: string, attributes: Record<string, unknown> = {}, branch: string | null = null, state: 'active' | 'retired' = 'active'): AnatomyElement =>
  ({ element_id: U(n), scenario_id: U(900), branch_id: branch, kind, name, description: `${name} (unit)`, attributes, graph_refs: [], version: 1, state });

describe('the map: interventions → drivers/mechanisms → impacts', () => {
  const B = U(500); const OTHER = U(501);
  const houthi = el(1, 'driver', 'Houthi activity', { exogenous: true });
  const insurer = el(2, 'driver', 'Insurer withdrawal', { exogenous: false }, B);
  const premium = el(3, 'mechanism', 'War-risk premium', { cause: 'premium', effect: 'reroute', dependencies: [U(1), U(2)] }, B);
  const delay = el(4, 'mechanism', 'Cape delay', { cause: 'reroute', effect: 'late', dependencies: [U(3)] }, B);
  const stop = el(5, 'impact', 'Line stop', { on: { kind: 'strategy', id: U(99) }, direction: 'adverse', magnitude: 'severe', horizon: '30d', dependencies: [U(4)] }, B);
  const escort = el(6, 'intervention', 'Naval escort', { by: 'navies', expected_effect: 'fewer attacks', targets: [U(1)] }, B);
  const talks = el(7, 'intervention', 'Talks', { by: 'mediators', expected_effect: 'ceasefire', targets: [U(1)] });
  const elsewhere = el(8, 'impact', 'Other branch impact', { direction: 'adverse', magnitude: 'low', horizon: '7d', dependencies: [U(1)] }, OTHER);
  const retired = el(9, 'impact', 'Retired impact', { direction: 'adverse', magnitude: 'low', horizon: '7d', dependencies: [U(1)] }, B, 'retired');
  const all = [houthi, insurer, premium, delay, stop, escort, talks, elsewhere, retired];

  it('the branch sees the scenario-wide elements and its own (active only); the whole scenario only its own', () => {
    expect(visibleElements(all, B).map((e) => e.name).sort()).toEqual(['Cape delay', 'Houthi activity', 'Insurer withdrawal', 'Line stop', 'Naval escort', 'Talks', 'War-risk premium']);
    expect(visibleElements(all, null).map((e) => e.name).sort()).toEqual(['Houthi activity', 'Talks']);
  });
  it('the chain is followed transitively through mechanisms; a scenario-wide intervention reaches the branch\'s impact from the branch, nothing from the whole scenario', () => {
    const m = mapInterventions(all, B);
    expect(m.map((p) => p.intervention.name)).toEqual(['Naval escort', 'Talks']);
    expect(m[0]!.targets.map((t) => t.name)).toEqual(['Houthi activity']);
    expect(m[0]!.mechanisms.map((x) => x.name)).toEqual(['Cape delay', 'War-risk premium']);
    expect(m[0]!.impacts.map((x) => [x.name, x.direction, x.magnitude, x.horizon])).toEqual([['Line stop', 'adverse', 'severe', '30d']]);
    expect(m[0]!.unmapped).toBe(false);
    expect(m[1]!.impacts.map((x) => x.name)).toEqual(['Line stop']);
    const whole = mapInterventions(all, null);
    expect(whole.map((p) => [p.intervention.name, p.unmapped, p.mechanisms.length])).toEqual([['Talks', true, 0]]);
    // another branch's impact and a retired one are never reached
    expect(mapInterventions(all, B).flatMap((p) => p.impacts.map((x) => x.name))).not.toContain('Other branch impact');
    expect(mapInterventions(all, B).flatMap((p) => p.impacts.map((x) => x.name))).not.toContain('Retired impact');
  });
  it('an impact resting on the intervention itself is reached; a cycle of mechanisms terminates', () => {
    const direct = el(10, 'impact', 'Direct', { direction: 'favourable', magnitude: 'low', horizon: '7d', dependencies: [U(7)] });
    const a = el(11, 'mechanism', 'A', { cause: 'x', effect: 'y', dependencies: [U(12)] }); const b = el(12, 'mechanism', 'B', { cause: 'x', effect: 'y', dependencies: [U(11), U(1)] });
    const m = mapInterventions([houthi, talks, direct, a, b], null);
    expect(m[0]!.impacts.map((x) => x.name)).toEqual(['Direct']);
    expect(m[0]!.mechanisms.map((x) => x.name)).toEqual(['A', 'B']);
  });
  it('grouping by kind names every kind (possibly empty), active only, in name order; the service composes per branch', () => {
    const g = groupByKind(all);
    expect(Object.keys(g)).toEqual([...ELEMENT_KINDS]);
    expect(g.impact.map((e) => e.name)).toEqual(['Line stop', 'Other branch impact']);
    const composed = new AnatomyService().compose({ elements: all, branches: [{ branch_id: B, name: 'Disruption' }] }) as { branches: Array<{ elements_by_kind: Record<string, AnatomyElement[]>; map: unknown[] }>; scenario_wide: { map: unknown[] } };
    expect(composed.branches[0]!.elements_by_kind['driver']!.map((e) => e.name)).toEqual(['Insurer withdrawal']);
    expect(composed.branches[0]!.map).toHaveLength(2);
    expect(composed.scenario_wide.map).toHaveLength(1);
  });
});

describe('the route validators (the SHAPE; the ports judge the rest)', () => {
  it('an element: its kind, name, description, attributes object, graph refs list, the uuid branch and the version', () => {
    expect(validateElement({ kind: 'driver', name: 'Houthi', description: 'attacks on shipping', attributes: { exogenous: true }, branchId: U(1).toUpperCase() }, C)).toMatchObject({ kind: 'driver', branchId: U(1), expectedVersion: null });
    expect(status(() => validateElement({ kind: 'shock', name: 'X', description: 'xxxxxxxx' }, C))).toMatchObject({ status: 422, message: expect.stringMatching(/^scenario element rejected \(kind\)/) });
    expect(status(() => validateElement({ kind: 'driver', name: 'X', description: 'xxxxxxxx' }, C)).message).toMatch(/\(name\)/);
    expect(status(() => validateElement({ kind: 'driver', name: 'Xy', description: 'short' }, C)).message).toMatch(/\(description\)/);
    expect(status(() => validateElement({ kind: 'driver', name: 'Xy', description: 'xxxxxxxx', attributes: [] }, C)).message).toMatch(/\(attributes\)/);
    expect(status(() => validateElement({ kind: 'driver', name: 'Xy', description: 'xxxxxxxx', graphRefs: 'e' }, C)).message).toMatch(/\(graph_ref\)/);
    expect(status(() => validateElement({ kind: 'driver', name: 'Xy', description: 'xxxxxxxx', branchId: 'b' }, C)).message).toMatch(/\(branchId\)/);
    expect(status(() => validateElement({ kind: 'driver', name: 'Xy', description: 'xxxxxxxx', expectedVersion: 0 }, C)).message).toMatch(/\(expectedVersion\)/);
  });
  it('a link: the ASU, critical, the condition (claim/indicator ids carried), the rationale', () => {
    expect(validateLink({ assumptionId: U(2), critical: true, rationale: 'the branch rests on it', condition: { kind: 'claim', claimId: U(3), text: 'the claim is disputed' } }, C))
      .toMatchObject({ critical: true, condition: { kind: 'claim', claim_id: U(3), text: 'the claim is disputed' }, branchId: null });
    expect(validateLink({ assumptionId: U(2), critical: false, rationale: 'the branch rests on it' }, C).condition).toEqual({ kind: 'state', text: '' });
    expect(status(() => validateLink({ critical: true, rationale: 'xxxxxxxx' }, C)).message).toMatch(/\(assumptionId\)/);
    expect(status(() => validateLink({ assumptionId: U(2), critical: 'yes', rationale: 'xxxxxxxx' }, C)).message).toMatch(/\(critical\)/);
    expect(status(() => validateLink({ assumptionId: U(2), critical: true, rationale: 'xxxxxxxx', condition: { kind: 'vibes' } }, C)).message).toMatch(/\(condition\)/);
    expect(status(() => validateLink({ assumptionId: U(2), critical: true, rationale: 'short' }, C)).message).toMatch(/\(rationale\)/);
  });
  it('a record: its kind, title, body and citations; a suspension: its reason and the optional element', () => {
    expect(validateRecord({ kind: 'option', title: 'Air-bridge', body: 'fly the first lot', cites: [{ kind: 'claim', id: U(4) }] }, C)).toMatchObject({ kind: 'option', cites: [{ kind: 'claim', id: U(4) }], supersedes: null });
    expect(status(() => validateRecord({ kind: 'memo', title: 'X1', body: 'xxxxxxxx' }, C)).message).toMatch(/\(kind\)/);
    expect(status(() => validateRecord({ kind: 'option', title: 'X1', body: 'xxxxxxxx', cites: [{ kind: 'rumour', id: U(4) }] }, C)).message).toMatch(/\(cites\)/);
    expect(validateSuspend({ reason: 'the escort changes the reading' }, C)).toEqual({ reason: 'the escort changes the reading', elementId: null });
    expect(status(() => validateSuspend({ reason: 'short' }, C))).toMatchObject({ status: 422, message: expect.stringMatching(/^branch suspension rejected \(reason\)/) });
  });
});

describe('every refusal text of 0097 §A maps to its class\'s status', () => {
  // §I: the part file is combined into the one 0097 — judge §A's section only (between its header and §Q's)
  const whole = readFileSync(join(__dirname, '../../migrations/0097_b27_scenario_anatomy_sets_coherence.sql'), 'utf8');
  const sqlText = whole.slice(whole.indexOf('-- section `anatomy` (§A)'), whole.indexOf('-- section `quality` (§Q)'));
  const raw = [...sqlText.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1]!.replace(/''/g, "'"));
  const families = ['scenario element', 'scenario assumption', 'scenario record', 'branch suspension'];
  const texts = raw.flatMap((t) => (t.startsWith('% rejected') ? families.map((f) => f + t.slice(1)) : [t]))
    .flatMap((t) => (t.includes('rejected (%)') ? ['stale', 'duplicate'].map((c) => t.replace('rejected (%)', `rejected (${c})`)) : [t]))
    .map((t) => t.replace(/%/g, 'x'));
  const expected = (t: string): number => {
    const cls = /rejected \(([a-z_]+)\)/.exec(t)?.[1] ?? '';
    if (['actor', 'ownership', 'authority'].includes(cls)) return 403;
    if (cls.startsWith('unknown_')) return 404;
    if (['state', 'stale', 'duplicate', 'in_use', 'invalidated', 'branch_suspended'].includes(cls)) return 409;
    return 422;
  };
  it('the migration raises at least 70 texts, every one in a family with a class', () => {
    expect(texts.length).toBeGreaterThanOrEqual(70);
    for (const t of texts) expect(t).toMatch(/^(scenario element|scenario assumption|scenario record|branch suspension|run) rejected \([a-z_]+\): /);
  });
  it.each(texts.map((t) => [t]))('%s', (t) => {
    const e = asObservationRefusal({ code: '22023', message: t }, C);
    expect(e, t).not.toBeNull();
    expect(e!.getStatus(), t).toBe(expected(t));
    expect(String((e!.getResponse() as { message?: string }).message)).toBe(t);
  });
});

describe('the PDP: the exact rules of prediction.scenario.anatomy.*', () => {
  const pdp = new PdpService();
  const T = '01890a5d-ac96-774b-bcce-b302099a8051'; const D = '01890a5d-ac96-774b-bcce-b302099a8052';
  const input = (action: string, role: string): PolicyInput => ({
    principal: { principalId: 'p1', kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] },
    delegationId: null, action, objectType: 'SCN', objectId: null, purposeId: 'prediction', context: { scope: 'DOMAIN', tenantId: T, domainId: D },
    consequenceClass: 'C2', environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const writes = ['element', 'retire', 'assumption', 'record', 'suspend', 'reinstate'].map((a) => `prediction.scenario.anatomy.${a}`);
  it('the writes: the strategy and forecast owners and the domain administrator — never the analyst, the decision roles or the executive; human-gated', () => {
    for (const a of writes) {
      for (const r of ['strategy_owner', 'forecast_owner', 'domain_admin']) {
        const d = pdp.evaluate(input(a, r));
        expect(d.decision, `${a} ${r}`).toBe('allow_with_obligations');
        expect(JSON.stringify(d.obligations ?? []), a).toMatch(/human_gate/);
      }
      for (const r of ['domain_analyst', 'decision_owner', 'decision_authority', 'executive', 'forecast_agent']) expect(pdp.evaluate(input(a, r)).decision, `${a} ${r}`).not.toMatch(/^allow/);
    }
  });
  it('the read adds the analyst, the decision owner and authority and the executive', () => {
    for (const r of ['strategy_owner', 'forecast_owner', 'domain_admin', 'domain_analyst', 'decision_owner', 'decision_authority', 'executive']) {
      expect(pdp.evaluate(input('prediction.scenario.anatomy.read', r)).decision, r).toBe('allow');
    }
    expect(pdp.evaluate(input('prediction.scenario.anatomy.read', 'forecast_agent')).decision).not.toMatch(/^allow/);
  });
  it('no earlier prefix rule swallows the names (a near-miss matches no rule and is not allowed)', () => {
    expect(pdp.evaluate(input('prediction.scenario.anatomy.elements', 'strategy_owner')).decision).not.toMatch(/^allow/);
  });
});
