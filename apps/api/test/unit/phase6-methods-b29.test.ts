/**
 * CP-6 B29 §C (0092) — the method fabric's PURE controls: every family adapter's pinned digest (the sha256 of its source, as
 * phase5-supply-flow.test.ts pins supply-flow@1's) and its registry row in 0092_b29_twin_families_methods_constraints.sql; each adapter valid on its probe,
 * deterministic, conserving its balances; the demonstration's discrete-event scene; the containment helpers (the output check, the
 * containment defaults); the runtime's pure pieces (the method input of a stored run, the gate's output subject); the registry's
 * refusals; the refusal rows of observation-errors.ts.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jcsCanonicalize } from '@eye/contracts';
import type { MethodAdapter, MethodInput } from '../../src/twin/methods/types.js';
import { BUILTIN_METHODS, builtinMethod } from '../../src/twin/methods/builtin.js';
import { MethodRegistry } from '../../src/twin/methods/method-registry.js';
import { checkOutput, containmentOf, outputsDigestOf } from '../../src/twin/methods/method-runner.js';
import { DISCRETE_EVENT_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/discrete-event.digest.js';
import { SYSTEM_DYNAMICS_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/system-dynamics.digest.js';
import { AGENT_BASED_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/agent-based.digest.js';
import { OPTIMISATION_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/optimisation.digest.js';
import { WAR_GAMING_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/war-gaming.digest.js';
import { COUNTERFACTUAL_IMPLEMENTATION_DIGEST } from '../../src/twin/methods/counterfactual.digest.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../src/twin/models/supply-flow.digest.js';
import { methodInputOf, outputQuantities, environmentFor, environmentOf } from '../../src/twin/simulations/simulation.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { BEARING, FAMILY_ELEMENTS, FAMILY_PARAMS, LINE_ELEMENTS } from '../int/phase6-methods-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'src', 'twin', 'methods');
const MIGRATION = readFileSync(join(HERE, '..', '..', 'migrations', '0092_b29_twin_families_methods_constraints.sql'), 'utf8');
const PINS: Record<string, string> = {
  'discrete-event': DISCRETE_EVENT_IMPLEMENTATION_DIGEST, 'system-dynamics': SYSTEM_DYNAMICS_IMPLEMENTATION_DIGEST, 'agent-based': AGENT_BASED_IMPLEMENTATION_DIGEST,
  'optimisation': OPTIMISATION_IMPLEMENTATION_DIGEST, 'war-gaming': WAR_GAMING_IMPLEMENTATION_DIGEST, 'counterfactual': COUNTERFACTUAL_IMPLEMENTATION_DIGEST,
};
const adapterOf = (modelRef: string): MethodAdapter => builtinMethod(modelRef)!.adapter;
const regensburg = (family: string, seed: number | null = 29): MethodInput => {
  const f = FAMILY_PARAMS[family]!;
  return { modelRef: f.modelRef, params: { ...f.params, component: BEARING }, elements: [...LINE_ELEMENTS, ...FAMILY_ELEMENTS], horizonDays: f.horizonDays, seed: f.seeded ? seed : null };
};

describe('B29 §C · the pinned implementations', () => {
  it.each(Object.keys(PINS))('%s@1: the digest is the sha256 of its source, and 0092 §C pins the same bytes', (family) => {
    const src = readFileSync(join(SRC, `${family}.ts`));
    expect(createHash('sha256').update(src).digest('hex')).toBe(PINS[family]);
    expect(adapterOf(`${family}@1`).digest).toBe(PINS[family]);
    // the registry row: `('<family>@1', …, '<digest>', '<family>', 'method-worker', …containment…)`
    const row = new RegExp(`\\('${family}@1',[\\s\\S]*?'${PINS[family]}', '${family}', 'method-worker', '\\{"isolated": true`);
    expect(MIGRATION).toMatch(row);
  });

  it('supply-flow@1 is in the registry UNCHANGED: family flow, its pinned digest, no probe (never contained)', () => {
    const sf = builtinMethod('supply-flow@1')!;
    expect(sf.adapter).toMatchObject({ family: 'flow', digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST });
    expect(sf.probe).toBeNull();
    expect(BUILTIN_METHODS.map((m) => m.adapter.modelRef).sort()).toEqual(['agent-based@1', 'counterfactual@1', 'discrete-event@1', 'optimisation@1', 'supply-flow@1', 'system-dynamics@1', 'war-gaming@1']);
    // 0092 §C never writes supply-flow@1's row (the §0 defaults give it flow / in-process / not isolated)
    expect(MIGRATION).not.toMatch(/UPDATE twin\.behaviour_models[\s\S]{0,200}supply-flow@1/);
    // the environment of a supply-flow@1 run is the one it always was
    expect(environmentFor('supply-flow@1', SUPPLY_FLOW_IMPLEMENTATION_DIGEST)).toEqual(environmentOf());
  });
});

describe('B29 §C · each family on its probe and on the Regensburg scene', () => {
  it.each(BUILTIN_METHODS.filter((m) => m.probe !== null).map((m) => m.adapter.modelRef))('%s: valid on its probe, well-formed, deterministic, conserving', (modelRef) => {
    const m = builtinMethod(modelRef)!;
    expect(m.adapter.validate(m.probe!)).toEqual([]);
    const a = m.adapter.run(m.probe!); const b = m.adapter.run(m.probe!);
    expect(checkOutput(a)).toEqual([]);
    expect(outputsDigestOf(a)).toBe(outputsDigestOf(b));
    for (const x of a.balances ?? []) expect(Math.abs(x.opening + x.inflow - x.outflow - x.closing), x.key).toBeLessThan(1e-9);
  });

  it.each(Object.keys(FAMILY_PARAMS))('%s: the Regensburg run is valid, well-formed and conserves its balances', (family) => {
    const input = regensburg(family);
    const adapter = adapterOf(FAMILY_PARAMS[family]!.modelRef);
    expect(adapter.validate(input)).toEqual([]);
    const out = adapter.run(input);
    expect(checkOutput(out)).toEqual([]);
    for (const x of out.balances ?? []) expect(Math.abs(x.opening + x.inflow - x.outflow - x.closing), x.key).toBeLessThan(1e-6);
  });

  it('discrete-event@1: the 21-day bearing shortage starves the first station, stops the line and builds a backlog the line cannot clear', () => {
    const base = adapterOf('discrete-event@1').run({ ...regensburg('discrete-event'), params: { component: BEARING, start_date: '2026-10-05' } });
    const out = adapterOf('discrete-event@1').run(regensburg('discrete-event'));
    expect(base.summary['line_stop_days']).toBe(0);
    expect(Number(base.summary['final_backlog'])).toBe(0);
    expect(out.summary).toMatchObject({ shortage_days: 21, bottleneck_station: 'winding', unconstrained_daily_capacity: '818.18' });
    expect(Number(out.summary['line_stop_days'])).toBeGreaterThanOrEqual(15);
    const days = out.series;
    expect(days.slice(0, 7).every((d) => d['line_stop'] === false)).toBe(true);
    expect(days.slice(10, 28).every((d) => d['line_stop'] === true)).toBe(true);
    expect(Number(days[27]!['backlog'])).toBeGreaterThan(Number(days[7]!['backlog']));
    // seeded: the same seed, the same digest; another seed, another trajectory; deterministic mode draws nothing
    expect(outputsDigestOf(adapterOf('discrete-event@1').run(regensburg('discrete-event', 29)))).toBe(outputsDigestOf(out));
    expect(outputsDigestOf(adapterOf('discrete-event@1').run(regensburg('discrete-event', 30)))).not.toBe(outputsDigestOf(out));
    const det = { ...regensburg('discrete-event'), seed: null };
    expect(outputsDigestOf(adapterOf('discrete-event@1').run(det))).toBe(outputsDigestOf(adapterOf('discrete-event@1').run(det)));
  });

  it('the families answer what they are for', () => {
    const cf = adapterOf('counterfactual@1').run(regensburg('counterfactual'));
    expect(Number(cf.summary['delta_production'])).toBeGreaterThan(0);
    expect(Number(cf.summary['delta_final_backlog'])).toBeLessThan(0);
    const opt = adapterOf('optimisation@1').run(regensburg('optimisation'));
    expect(Number(opt.summary['lp_bound'])).toBeGreaterThanOrEqual(Number(opt.summary['objective']));
    expect(opt.summary['allocation_order']).toBe('a2 > a1'); // 5/3 k€ per bearing beats 3/2
    const wg = adapterOf('war-gaming@1').run(regensburg('war-gaming'));
    expect(wg.summary).toMatchObject({ verdict: 'plan breached', turns: 6 });
    const sd = adapterOf('system-dynamics@1').run(regensburg('system-dynamics'));
    expect(Number(sd.summary['peak_backlog'])).toBeGreaterThan(Number(sd.summary['opening_backlog']));
    const ab = adapterOf('agent-based@1').run(regensburg('agent-based'));
    expect(Number(ab.summary['switches'])).toBeGreaterThan(0);
  });

  it('a malformed parameter set is refused in the adapter\'s own words; an unseeded draw is refused', () => {
    const des = adapterOf('discrete-event@1');
    expect(des.validate({ ...regensburg('discrete-event'), params: { component: BEARING, start_date: '2026-13-40', shortage: { start_day: -1, days: 0, fraction: 2 } } }))
      .toEqual(expect.arrayContaining([expect.stringMatching(/start_date/), expect.stringMatching(/params\.shortage is/)]));
    expect(des.validate({ ...regensburg('discrete-event'), elements: LINE_ELEMENTS.filter((e) => e.key !== 'line.buffer:fit-winding') }))
      .toEqual([expect.stringMatching(/exactly one buffer follows station 2 \(found 0\)/)]);
    expect(() => des.run({ ...regensburg('discrete-event'), horizonDays: 0 })).toThrow(/discrete-event@1 input invalid/);
    expect(adapterOf('war-gaming@1').validate({ ...regensburg('war-gaming'), params: { turns: 3, adversary: 'random', tolerance: 1 } })).toEqual([expect.stringMatching(/seeded/)]);
    expect(adapterOf('agent-based@1').validate({ ...regensburg('agent-based'), seed: null })).toEqual([expect.stringMatching(/seeded/)]);
    expect(adapterOf('counterfactual@1').validate({ ...regensburg('counterfactual'), params: { component: BEARING, start_date: '2026-10-05' } }))
      .toEqual([expect.stringMatching(/params\.intervention/)]);
  });
});

describe('B29 §C · containment and the runtime\'s pure pieces', () => {
  it('checkOutput names what is wrong with an answer; containmentOf bounds and defaults', () => {
    expect(checkOutput({ series: 'x', summary: {} })).toEqual(['series is not an array']);
    expect(checkOutput({ series: [{ a: NaN }], summary: {}, extra: 1 })).toEqual(['series[0] is not a row of scalars', 'unexpected keys extra']);
    expect(checkOutput({ series: [], summary: { a: {} } })).toEqual(['summary is not an object of scalars']);
    expect(checkOutput({ series: [], summary: {}, balances: [{ key: 'k', opening: 1, inflow: 0, outflow: 0 }] })).toEqual([expect.stringMatching(/balances\[0\]/)]);
    expect(checkOutput(null)).toEqual(['the answer is not an object']);
    expect(containmentOf({})).toEqual({ isolated: false, timeout_ms: 30000, max_old_space_mb: 256, quarantine_after: 3 });
    expect(containmentOf({ isolated: true, timeout_ms: 5, max_old_space_mb: 1e9, quarantine_after: 0 })).toEqual({ isolated: true, timeout_ms: 100, max_old_space_mb: 8192, quarantine_after: 1 });
  });

  it('the method input of a stored run is built from the run alone: complete elements, the run\'s component, the bound parameters and seed', () => {
    const input = methodInputOf({ model_ref: 'discrete-event@1', component: BEARING, stochastic_mode: 'seeded', seed: '29',
      constraints: { horizon_days: 42, method_params: { start_date: '2026-10-05', component: 'other' } },
      initial_state: [{ key: 'demand.daily', value: 780, unit: 'units', health: 'complete' }, { key: 'line.minutes_per_day', value: 900, unit: 'min', health: 'stale' }] });
    expect(input).toEqual({ modelRef: 'discrete-event@1', params: { start_date: '2026-10-05', component: BEARING }, elements: [{ key: 'demand.daily', value: 780, unit: 'units' }], horizonDays: 42, seed: 29 });
  });

  it('the output subject of §D\'s gate: dated numeric cells and the balances\' four quantities', () => {
    const q = outputQuantities({ series: [{ day: 1, date: '2026-10-05', backlog: '12', line_stop: true, note: 'x' }, { turn: 1, residual: '3' }], summary: {},
                                 balances: [{ key: 'inventory.on_hand:bearing', opening: 1, inflow: 2, outflow: 3, closing: 0 }] });
    expect(q).toEqual([{ key: 'backlog', date: '2026-10-05', value: 12, unit: null },
      ...['opening', 'inflow', 'outflow', 'closing'].map((f, i) => ({ key: `inventory.on_hand:bearing.${f}`, date: null, value: [1, 2, 3, 0][i], unit: null }))]);
  });

  it('the registry never lets a module replace a product method, and names a module by its absolute path', () => {
    const r = new MethodRegistry();
    expect(r.get('discrete-event@1')?.module).toBeNull();
    expect(() => r.registerModule('relative/path.cjs')).toThrow(/absolute path/);
    const entry = r.registerModule(join(HERE, '..', 'int', 'phase6-methods-unstable.cjs'));
    expect(entry.adapter.digest).toBe(createHash('sha256').update(readFileSync(join(HERE, '..', 'int', 'phase6-methods-unstable.cjs'))).digest('hex'));
    expect(entry.probe).toMatchObject({ params: { mode: 'ok' } });
    r.unregister('harness-unstable@1');
    r.unregister('discrete-event@1');
    expect(r.get('harness-unstable@1')).toBeUndefined();
    expect(r.get('discrete-event@1')).toBeDefined();
    expect(jcsCanonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('B29 §C · the refusal rows (observation-errors.ts)', () => {
  const status = (message: string, code = '22023') => asObservationRefusal(Object.assign(new Error(message), { code }), 'c')?.getStatus() ?? null;
  it.each([
    ['run rejected (unbound_method): method war-gaming@1 is not bound to twin x; …', 409],
    ['run rejected (quarantined): the adapter of x@1 is quarantined in this domain since …', 409],
    ['run rejected (method_family): the war-gaming family (war-gaming@1) is not among the approved uses of twin x', 422],
    ['method binding rejected (not_owner): the methods of twin x are bound by its owner; the acting principal is not', 403, '42501'],
    ['method binding rejected: no twin x in this domain', 404, '23503'],
    ['method binding rejected: war-gaming@1 is not bound to twin x (no active binding)', 404, '23503'],
    ['method binding rejected (already_bound): x@1 is already bound to twin y', 409],
    ['method binding rejected (method_family): the war-gaming family (war-gaming@1) is not among the approved uses of twin x', 422],
    ['method binding rejected: an unbinding says why (a reason of 8+ characters)', 422],
    ['adapter reinstatement rejected (separation): the operator of the run whose fault was last may not reinstate its adapter', 403, '42501'],
    ['adapter reinstatement rejected (no_probe): no probe of x@1 has passed since its last fault (t)', 409],
    ['adapter reinstatement rejected: the adapter of x@1 is not quarantined in this domain (healthy)', 409],
    ['adapter reinstatement rejected: a reinstatement says why (a reason of 8+ characters)', 422],
    ['adapter probe rejected: x@1 is not a contained method (containment.isolated is false); nothing is probed', 422],
    ['adapter fault rejected: run x is not a run of y@1 in this domain', 404, '23503'],
    ['constraint check rejected: a violated verdict at opening refuses the run; it is never recorded on an opened run', 422],
  ] as Array<[string, number, string?]>)('%s → %i', (message, expected, code) => {
    expect(status(message, code ?? '22023')).toBe(expected);
  });
});
