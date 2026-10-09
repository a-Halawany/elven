/**
 * CP-6 B33 §SC (0111) — supply-chain intelligence, the PURE network maths (no database): the kind's schema (byte-equal to the forward UPDATE),
 * the optional fields' rules (every v1 element valid unchanged), the uncertainty roll-up, the records, the hidden-tier rule, the disruption
 * map, an option's feasibility. Every figure is SYNTHETIC.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPLY_NETWORK_SCHEMA, SUPPLY_NETWORK_SCHEMA_B33, networkRules } from '../../src/twin/supply-network/network.js';
import { validateFamily } from '../../src/twin/families/families.js';
import {
  canonical, digestOf, evaluateAlternative, inferHiddenTiers, mapDisruption, parseSupplyRecords, uncertaintyOf, unsourcedOf, type NetworkInput, type RecordRead,
} from '../../src/twin/supply-intel/intel.js';
import { readNetwork } from '../../src/twin/supply-network/network.js';
import { threeTier } from './phase6-supply-network-b29.fixtures.js';
import { CONFLICT_RECORDS, OPTIONS, SHENZHEN_RECORDS, regensburgLine, sceneNetwork, shenzhenApplied } from './phase6-supply-b33.fixtures.js';

const ev = (id: string, version = 1) => ({ kind: 'evidence' as const, id, version, digest: id.replace(/-/g, '').padEnd(64, '0').slice(0, 64) });
const reads = (text: string, id = '01a0f000-0000-7000-8000-000000000001'): RecordRead[] => [{ evidence: ev(id), records: parseSupplyRecords(text).records }];
const net = (elements = sceneNetwork(), freshness: string | null = 'fresh', lineFresh: string | null = 'fresh'): NetworkInput => ({
  twin_id: 'N', title: 'Regensburg hub-module network', version: 3, owner: 'O', elements, freshness,
  links: [{ twin_id: 'L', title: 'Regensburg plant — assembly line', version: 4, owner: 'K', elements: regensburgLine(), freshness: lineFresh, mapping: [{ from: 'capacity:regensburg.module', to: 'supply.capacity_per_day' }] }],
});
const RED_SEA = { chokepoints: ['bab-el-mandeb'], places: [], derating: 0.75, duration_days: 60 };

describe('SC1 · the kind and the network\'s uncertainty (AI-53-003)', () => {
  it('the kind\'s element schema after 0111 §SC is the forward UPDATE\'s object, byte-equal; 0092\'s stays the B29 pin', () => {
    const sqlText = ((readFileSync(join(__dirname, '../../migrations/0111_b33_supply_chain_intelligence_domain_packages.sql'), 'utf8')) as string).split('\n-- §SC — ')[1]!.split('-- ── end of the folded §SC ──')[0]!;   // §SC, folded into 0111 at integration
    const m = /UPDATE twin\.twin_kind_schemas SET element_schema = '(.*?)'::jsonb\s+WHERE kind = 'supply-network'/s.exec(sqlText);
    expect(m).not.toBeNull();
    expect(JSON.parse(((m as RegExpExecArray)[1] as string).replace(/''/g, "'"))).toEqual(SUPPLY_NETWORK_SCHEMA_B33);
    expect(Object.keys(SUPPLY_NETWORK_SCHEMA_B33).sort()).toEqual(['capacity', 'inventory', 'material', 'obligation', 'route', 'site', 'tier']);
    expect(Object.keys(SUPPLY_NETWORK_SCHEMA).sort()).toEqual(['capacity', 'material', 'route', 'site', 'tier']);
  });

  it('positive: a v1 network validates unchanged; the scene network with every optional field validates under the B33 schema', () => {
    expect(networkRules(threeTier())).toEqual([]);
    expect(validateFamily('supply-network', SUPPLY_NETWORK_SCHEMA_B33, threeTier())).toEqual([]);
    expect(validateFamily('supply-network', SUPPLY_NETWORK_SCHEMA_B33, sceneNetwork())).toEqual([]);
  });

  it('refusal: malformed optional fields, an inventory in another unit, an inferred site naming no inference', () => {
    const errs = networkRules(sceneNetwork({ extra: [
      { key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 }, country: 'Czechia', ownership: { parent: 'X' } }, unit: null },
      { key: 'route:r5', value: { from: 'module-b', to: 'regensburg', material: 'module', via: ['D5!'], lead_days: -1 }, unit: null },
      { key: 'inventory:regensburg.module', value: 6000, unit: 't' },
      { key: 'site:steel-mill', value: { tier: 3, name: 'Steel mill', bom: {}, provenance: { basis: 'inferred' } }, unit: null },
    ] }));
    expect(errs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^site:module-b: country is an ISO 3166 alpha-2 code/), expect.stringMatching(/^site:module-b: ownership is/),
      expect.stringMatching(/^route:r5: via lists chokepoint or place keys/), expect.stringMatching(/^route:r5: lead_days is a number of days/),
      expect.stringMatching(/^inventory:regensburg\.module: unit t — module is counted in pcs/), expect.stringMatching(/^site:steel-mill: an inferred site names the inference/)]));
    expect(validateFamily('supply-network', SUPPLY_NETWORK_SCHEMA_B33, [...sceneNetwork(), { key: 'inventory:regensburg.module', value: 3, unit: 'pcs/day' }])).toEqual(
      expect.arrayContaining([expect.stringMatching(/inventory:regensburg\.module: unit pcs\/day — the kind declares a unit of the form/)]));
  });

  it('the roll-up: per tier declared / validated / inferred and the UNKNOWN parent, country, contract — counted, never imputed', () => {
    const u = uncertaintyOf(sceneNetwork());
    expect(u.coverage).toMatchObject({ sites: 5, declared: 5, validated: 0, inferred: 0, declared_share: 1 });
    expect(u.tiers.find((t) => t.tier === 1)).toMatchObject({ sites: 3, declared: 3, unknown_parent: 2, unknown_country: 1, unknown_contract: 2, single_source: 1 });
    expect(u.sites.find((s) => s.id === 'nordbearing')).toMatchObject({ unknown: [], country: 'SE', contract: { ref: 'SYN-CTR-0042' } });
    expect(u.sites.find((s) => s.id === 'module-b')?.unknown).toEqual(['parent', 'country', 'contract', 'geo_confidence']);
    expect(u.unsourced).toEqual([{ site: 'nordbearing', tier: 1, material: 'bearing-blank' }]);
    expect(u.routes.find((r) => r.id === 'r1')?.unknown).toEqual(['via', 'confidence']);
    const applied = uncertaintyOf(sceneNetwork({ extra: shenzhenApplied('01a0f000-0000-7000-8000-0000000000aa') }));
    expect(applied.coverage).toMatchObject({ sites: 6, declared: 5, validated: 1, inferred: 0 });
    expect(applied.unsourced).toEqual([]);
  });
});

describe('SC2 · the records and the hidden-tier rule (PR-30-003)', () => {
  it('records: a supply CSV is parsed; another CSV holds none (never an error); a malformed line is counted rejected', () => {
    const p = parseSupplyRecords(SHENZHEN_RECORDS);
    expect(p).toMatchObject({ recognised: true, rejected: 0 });
    expect(p.records).toHaveLength(3);
    expect(p.records[0]).toMatchObject({ record_kind: 'shipment', consignee: 'Nordbearing AB', shipper: 'Shenzhen precision bearing maker (SYNTHETIC)', shipper_country: 'CN', quantity: 20000, via: ['malacca', 'bab-el-mandeb', 'suez'] });
    expect(parseSupplyRecords('synthetic,record_id,key,value,unit\ntrue,SYN-1,capacity:x.y,3,pcs/day\n')).toEqual({ recognised: false, records: [], rejected: 0 });
    expect(parseSupplyRecords(`${SHENZHEN_RECORDS}true,BAD,shipment,Nordbearing AB,X,China,,bearing blank,1,pcs,2026-08-30,\n`).rejected).toBe(1);
  });

  it('positive: a hidden tier-2 supplier behind Nordbearing, confidence from count and agreement, sensitive (a named counterparty)', () => {
    const [c, ...rest] = inferHiddenTiers(sceneNetwork(), reads(SHENZHEN_RECORDS));
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ behind_site: 'nordbearing', behind_tier: 1, material: 'bearing-blank', proposed_site: 'shenzhen-bearing-blank',
      proposed_value: { tier: 2, name: 'Shenzhen precision bearing maker (SYNTHETIC)', country: 'CN', city: 'Shenzhen', provenance: { basis: 'inferred', confidence: 0.875 } },
      proposed_route: { from: 'shenzhen-bearing-blank', to: 'nordbearing', material: 'bearing-blank', via: ['malacca', 'bab-el-mandeb', 'suez'] },
      observed_flow_per_day: 3000, flow_unit: 'pcs/day', confidence: 0.875, sensitive: true, sensitivity: ['a named counterparty'], isolated: false, conflict: null });
    expect(c?.basis).toMatchObject({ records: 3, agreeing: 3, agreement: 1, record_kinds: ['customs', 'shipment'] });
    // deterministic: the same reads, the same candidate
    expect(inferHiddenTiers(sceneNetwork(), reads(SHENZHEN_RECORDS))).toEqual([c]);
    // a disagreeing record lowers the agreement — and so the confidence
    const mixed = inferHiddenTiers(sceneNetwork(), [...reads(SHENZHEN_RECORDS), ...reads(CONFLICT_RECORDS, '01a0f000-0000-7000-8000-000000000002')])[0];
    expect(mixed).toMatchObject({ confidence: 0.656, basis: { records: 4, agreeing: 3, agreement: 0.75 } });
  });

  it('refusal: no record → no inference; the network declaring the route → nothing unsourced; a shipper that IS a declared site → ISOLATED', () => {
    expect(inferHiddenTiers(sceneNetwork(), [])).toEqual([]);
    expect(inferHiddenTiers(sceneNetwork({ extra: shenzhenApplied('01a0f000-0000-7000-8000-0000000000aa') }), reads(SHENZHEN_RECORDS))).toEqual([]);
    const [iso] = inferHiddenTiers(sceneNetwork(), reads(CONFLICT_RECORDS));
    expect(iso).toMatchObject({ isolated: true, conflict: { site: 'bearing-maker' } });
    expect(String(iso?.rationale)).toMatch(/ISOLATED: the records name Bearing maker \(Ningbo\), which the network declares as site bearing-maker \(tier 2, CN\)/);
  });

  it('recovery: an unnamed shipper is not sensitive; behind an inferred (unvalidated) site nothing more is inferred', () => {
    const anon = SHENZHEN_RECORDS.replace(/Shenzhen precision bearing maker \(SYNTHETIC\)/g, '');
    const [c] = inferHiddenTiers(sceneNetwork(), reads(anon));
    expect(c).toMatchObject({ sensitive: false, sensitivity: [], proposed_value: { name: 'Unnamed bearing blank supplier (CN)' } });
    const inferredBehind = sceneNetwork({ extra: [{ key: 'site:nordbearing', value: { tier: 1, name: 'Nordbearing AB', bom: { 'bearing-blank': 1 }, provenance: { basis: 'inferred', inference_id: '01a0f000-0000-7000-8000-0000000000bb' } }, unit: null }] });
    expect(inferHiddenTiers(inferredBehind, reads(SHENZHEN_RECORDS))).toEqual([]);
  });

  it('the canonical digest is key-order free', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(digestOf({ b: 1, a: 2 })).toBe(digestOf({ a: 2, b: 1 }));
  });
});

describe('SC3 · the disruption map (JRN-11 detect → map; V01-T-024)', () => {
  it('positive: the Red Sea derates Ningbo\'s two routes; Regensburg falls 450 → 112.5 a day; the line\'s cover 17.78 days; 42.22 days of stop', () => {
    const m = mapDisruption(RED_SEA, [net()], null);
    const n = m.networks[0]!;
    expect(n.affected_routes.map((r) => [r.route, r.passes, r.why])).toEqual([['r2', 0.25, ['via bab-el-mandeb']], ['r3', 0.25, ['via bab-el-mandeb']]]);
    expect(n).toMatchObject({ throughput_before_per_day: 450, throughput_after_per_day: 112.5, excluded: [], isolated: [], stale: false, confidence: 0.8 });
    expect(n.lines[0]).toMatchObject({ lines: [{ line: 'SYN-LINE-A1', capacity_per_day: 1000 }], run_rate_before_per_day: 450, run_rate_after_per_day: 112.5, shortfall_per_day: 337.5,
      cover_days: 17.78, line_stop_days: 42.22, utilisation_before: 0.45, utilisation_after: 0.1125 });
    expect(n.lines[0]?.cover_basis).toEqual([
      { material: 'bearing', demand_per_day: 450, arriving_per_day: 2400, deficit_per_day: 0 },
      { material: 'module', demand_per_day: 450, arriving_per_day: 112.5, deficit_per_day: 337.5, on_hand: 6000, unit: 'pcs', days: 17.78 }]);
    expect(m.summary).toMatch(/^2 route\(s\) derated to 25 %; SYN-LINE-A1 runs at 112.5 of 450 per day, 17.78 day\(s\) of cover$/);
    // with the validated Shenzhen tier applied, its route is derated too (Nordbearing's blanks) — the bearings still cover the line
    const withShenzhen = mapDisruption(RED_SEA, [net(sceneNetwork({ extra: shenzhenApplied('01a0f000-0000-7000-8000-0000000000aa') }))], null).networks[0]!;
    expect(withShenzhen.affected_routes.map((r) => r.route)).toEqual(['inf-shenzhen-bearing-blank', 'r2', 'r3']);
    expect(withShenzhen.lines[0]?.cover_basis[0]).toMatchObject({ material: 'bearing', arriving_per_day: 750, deficit_per_day: 0 });
  });

  it('a place disrupts the routes leaving it; a disruption elsewhere reaches nothing', () => {
    const ningbo = mapDisruption({ chokepoints: [], places: [{ country: 'CN', city: 'Ningbo' }], derating: 1, duration_days: null }, [net()], null).networks[0]!;
    expect(ningbo.affected_routes.map((r) => r.route)).toEqual(['r2', 'r3']);
    expect(ningbo).toMatchObject({ throughput_after_per_day: 0 });
    expect(ningbo.lines[0]).toMatchObject({ line_stop_days: null, cover_days: 13.33, shortfall_per_day: 450 });
    const none = mapDisruption({ chokepoints: ['panama'], places: [], derating: 0.5, duration_days: 10 }, [net()], null);
    expect(none.affected).toBe(false);
    expect(none.summary).toMatch(/^no route/);
  });

  it('continuity (PR-30-005): an inferred site is EXCLUDED, two sites of one entity ISOLATED, a stale twin FLAGGED, an unknown inventory leaves the cover unknown', () => {
    const inferred = sceneNetwork({ extra: shenzhenApplied('01a0f000-0000-7000-8000-0000000000aa').map((e) => (e.key.startsWith('site:') ? { ...e, value: { ...(e.value as object), provenance: { basis: 'inferred', inference_id: '01a0f000-0000-7000-8000-0000000000aa' } } } : e)) });
    const m1 = mapDisruption(RED_SEA, [net(inferred)], null).networks[0]!;
    expect(m1.excluded).toEqual([{ site: 'shenzhen-bearing-blank', reason: 'not mapped: an inferred site not yet validated by a named analyst' }]);
    expect(m1.affected_routes.map((r) => r.route)).toEqual(['r2', 'r3']);
    const E = '01a0f000-0000-7000-8000-0000000000cc';
    const twins = sceneNetwork({ extra: [
      { key: 'site:module-a', value: { tier: 1, name: 'Module maker A', bom: { bearing: 4 }, entity_id: E }, unit: null },
      { key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 }, entity_id: E }, unit: null }] });
    const m2 = mapDisruption(RED_SEA, [net(twins)], null).networks[0]!;
    expect(m2.isolated).toEqual([{ sites: ['module-a', 'module-b'], reason: expect.stringMatching(/^identity conflict: sites module-a, module-b resolve to one graph entity/) }]);
    expect(m2).toMatchObject({ throughput_before_per_day: null, throughput_after_per_day: null });
    expect(m2.coverage['incomplete']).toEqual(['the terminal\'s module reaches it only through excluded or isolated sites: the throughput is not computed']);
    const m3 = mapDisruption(RED_SEA, [net(sceneNetwork(), 'fresh', 'stale')], { twin_id: 'C', version: 20, freshness: 'stale' });
    expect(m3).toMatchObject({ stale: true });
    expect(m3.stale_reasons).toEqual([expect.stringMatching(/^the telemetry twin C \(v20\) is stale/), expect.stringMatching(/^the linked twin Regensburg plant — assembly line \(v4\) is stale/)]);
    expect(m3.summary).toMatch(/STALE inputs: not current$/);
    const m4 = mapDisruption(RED_SEA, [net(sceneNetwork({ drop: ['inventory:regensburg.module'] }))], null).networks[0]!;
    expect(m4.lines[0]).toMatchObject({ cover_days: null, line_stop_days: null });
    expect(m4.lines[0]?.cover_basis[1]).toMatchObject({ material: 'module', on_hand: null });
  });
});

describe('SC4/SC5 · alternatives with feasibility on scenario branches (V01-T-024; AT-30)', () => {
  const head = sceneNetwork();
  const m = mapDisruption(RED_SEA, [net(head)], null).networks[0]!;
  const evalOf = (kind: 'routing' | 'sourcing' | 'inventory', branch: ReturnType<typeof sceneNetwork>, over: Partial<Parameters<typeof evaluateAlternative>[0]> = {}) =>
    evaluateAlternative({ kind, spec: RED_SEA, network: m, line: m.lines[0] ?? null, head, branch, constraint: null, cost: null, ...over });

  it('positive: the Cape reroute and the Moravian dual source are FEASIBLE — the run rate restored within the cover', () => {
    const r = evalOf('routing', OPTIONS.reroute(head));
    expect(r).toMatchObject({ verdict: 'feasible', recommendable: true, throughput_on_branch_per_day: 450, restored_share: 1, effect_after_days: 11, cover_days: 17.78 });
    expect(r.changed_routes.map((c) => [c['route'], c['change'], c['added_lead_days']])).toEqual([['r2', 'rerouted', 11], ['r3', 'rerouted', 11]]);
    const s = evalOf('sourcing', OPTIONS.dualSource(head));
    expect(s).toMatchObject({ verdict: 'feasible', run_rate_with_option_per_day: 487.5, restored_share: 1.0833, effect_after_days: 5, added_sites: ['moravia-bearings'] });
  });

  it('refusal: the safety-stock draw-down is INFEASIBLE (26.67 days of a 60-day disruption); a violated rule makes an option infeasible; too little restored is infeasible', () => {
    const i = evalOf('inventory', OPTIONS.safetyStock(head));
    expect(i).toMatchObject({ verdict: 'infeasible', recommendable: false, cover_with_option_days: 26.67 });
    expect(i.reasons).toContain('the stock covers 26.67 day(s) of a 60-day disruption: the line stops before it ends');
    const v = evalOf('routing', OPTIONS.reroute(head), { constraint: { outcome: 'violated', reason: 'lead-time rule v1: lead_days 45 > 40' } });
    expect(v).toMatchObject({ verdict: 'infeasible' });
    const weak = evalOf('sourcing', [...head, ...OPTIONS.dualSource([]).map((e) => (e.key === 'capacity:moravia-bearings.bearing' ? { ...e, value: 100 } : e))]);
    expect(weak.verdict).toBe('infeasible');
    expect(weak.reasons[0]).toMatch(/^the option restores \d+(\.\d+)? % of the pre-disruption run rate .* below the 95 % required$/);
    const slow = evalOf('sourcing', OPTIONS.dualSource(head).map((e) => (e.key.startsWith('route:rm') ? { ...e, value: { ...(e.value as object), lead_days: 30 } } : e)));
    expect(slow).toMatchObject({ verdict: 'infeasible' });
    expect(slow.reasons).toContain('the option takes effect after 30 day(s), beyond the 17.78 day(s) of cover: the line stops first');
  });

  it('continuity: stale inputs, an option resting on an unvalidated site, an unknown lead time → INDETERMINATE, never recommendable; coverage limits disclosed', () => {
    const stale = mapDisruption(RED_SEA, [net(head, 'stale')], null).networks[0]!;
    expect(evaluateAlternative({ kind: 'routing', spec: RED_SEA, network: stale, line: stale.lines[0] ?? null, head, branch: OPTIONS.reroute(head), constraint: null, cost: null }))
      .toMatchObject({ verdict: 'indeterminate', recommendable: false });
    const unvalidated = OPTIONS.dualSource(head).map((e) => (e.key === 'site:moravia-bearings' ? { ...e, value: { ...(e.value as object), provenance: { basis: 'inferred', inference_id: '01a0f000-0000-7000-8000-0000000000dd' } } } : e));
    const u = evalOf('sourcing', unvalidated);
    expect(u).toMatchObject({ verdict: 'indeterminate', relies_on_unvalidated: ['moravia-bearings'] });
    const nolead = evalOf('sourcing', OPTIONS.dualSource(head).map((e) => (e.key === 'route:rm1' ? { ...e, value: { from: 'moravia-bearings', to: 'module-a', material: 'bearing' } } : e)));
    expect(nolead.verdict).toBe('indeterminate');
    expect(evalOf('routing', OPTIONS.reroute(head)).coverage_limits).toEqual(['nordbearing\'s bearing-blank is unsourced in the network (a hidden tier may stand behind it)']);
  });

  it('the unsourced inputs of a network', () => {
    expect(unsourcedOf(readNetwork(sceneNetwork()).network)).toEqual([{ site: 'nordbearing', tier: 1, material: 'bearing-blank' }]);
  });
});
