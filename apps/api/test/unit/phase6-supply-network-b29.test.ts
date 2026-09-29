/**
 * CP-6 B29 §B (0092) — the supply-network family's pure logic: the schema (the kind row's, byte-equal), the validator's rules, the measures
 * (tier coverage, the capacity bottleneck, single-source exposure), the findings the Supply Chain Agent proposes, and the agent's identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conformsToSchema, familyMeasures, validateFamily, type FamilyElement } from '../../src/twin/families/families.js';
import { SUPPLY_NETWORK_SCHEMA, analyseNetwork, findingsOf, networkRules } from '../../src/twin/supply-network/network.js';
import { SUPPLY_CHAIN_AGENT_DIGEST, SUPPLY_CHAIN_AGENT_METHOD, SUPPLY_CHAIN_AGENT_VERSION } from '../../src/executive/agents/supply-chain-agent.js';
import { STOP_CONDITION_KINDS, validateRegisterAgent } from '../../src/executive/agents/agents.service.js';
import { threeTier } from './phase6-supply-network-b29.fixtures.js';

describe('B29 §B · the supply-network family', () => {
  it('the kind row carries exactly this schema (the migration and the TS agree)', () => {
    const sqlText = readFileSync(join(__dirname, '../../migrations/0092_b29_twin_families_methods_constraints.sql'), 'utf8');
    const m = /'(\{"tier".*?\})'::jsonb/s.exec(sqlText);
    expect(m).not.toBeNull();
    expect(JSON.parse(((m as RegExpExecArray)[1] as string).replace(/''/g, "'"))).toEqual(SUPPLY_NETWORK_SCHEMA);
  });

  it('a conforming 3-tier network admits; the schema takes a capacity in its material\'s unit per day', () => {
    expect(validateFamily('supply-network', SUPPLY_NETWORK_SCHEMA, threeTier())).toEqual([]);
    expect(conformsToSchema(SUPPLY_NETWORK_SCHEMA, [{ key: 'capacity:x.y', value: 3, unit: 'kg' }])[0]).toMatch(/a unit of the form/);
    expect(conformsToSchema(SUPPLY_NETWORK_SCHEMA, [{ key: 'capacity:x.y', value: -3, unit: 'kg/day' }])[0]).toMatch(/negative/);
    expect(conformsToSchema(SUPPLY_NETWORK_SCHEMA, [{ key: 'lane:x', value: 1, unit: null }])[0]).toMatch(/not an element this kind declares/);
  });

  it('THE VALIDATOR: tiers 1..n, one terminal, declared route endpoints, consistent capacity units, a bill of materials, no cycle', () => {
    const rules = (extra: FamilyElement[], drop: string[] = []) => networkRules([...threeTier().filter((e) => !drop.includes(e.key)), ...extra]);
    expect(rules([{ key: 'route:r9', value: { from: 'module-a', to: 'nowhere', material: 'module' }, unit: null }]).join('; ')).toMatch(/route:r9: to nowhere — not a declared site/);
    expect(rules([{ key: 'tier:5', value: 'far', unit: null }]).join('; ')).toMatch(/numbered 1\.\.n without a gap/);
    expect(rules([{ key: 'site:x', value: { tier: 7, name: 'X' }, unit: null }]).join('; ')).toMatch(/tier 7 is not a declared tier/);
    expect(rules([{ key: 'site:plant-2', value: { tier: 0, name: 'Second plant' }, unit: null }]).join('; ')).toMatch(/exactly one terminal site/);
    expect(rules([{ key: 'capacity:module-b.module', value: 500, unit: 't/day' }], ['capacity:module-b.module']).join('; ')).toMatch(/module is counted in pcs, so its capacity is in pcs\/day/);
    expect(rules([], ['capacity:module-b.module']).join('; ')).toMatch(/route:r5: its origin module-b declares no capacity for module/);
    expect(rules([{ key: 'site:module-a', value: { tier: 1, name: 'Module maker A' }, unit: null }], ['site:module-a']).join('; ')).toMatch(/receives bearing but its bom/);
    expect(rules([{ key: 'route:r6', value: { from: 'regensburg', to: 'module-a', material: 'module' }, unit: null }, { key: 'capacity:regensburg.module', value: 1, unit: 'pcs/day' }], ['capacity:regensburg.module'])
      .join('; ')).toMatch(/form a cycle/);
    expect(validateFamily('supply-network', SUPPLY_NETWORK_SCHEMA, [...threeTier(), { key: 'route:r9', value: { from: 'module-a', to: 'nowhere', material: 'module' }, unit: null }])).toHaveLength(1);
  });

  it('THE MEASURES: the tier-2 bearing maker\'s capacity is the bottleneck, with the constrained quantity per day', () => {
    const a = analyseNetwork(threeTier());
    // 1800 bearings/day shared across two module makers → 900 each → 225 modules each (4 per module) → 450 modules/day into Regensburg
    expect(a.throughput_per_day).toBe(450);
    expect(a.throughput_unit).toBe('pcs/day');
    expect(a.bottleneck).toMatchObject({ site: 'bearing-maker', tier: 2, material: 'bearing', capacity_per_day: 1800, unit: 'pcs/day', throughput_per_day: 450, relieved_throughput_per_day: 1000 });   // relieved: Regensburg's intake (1000/day) bounds it
    expect(a.tier_coverage).toBe(1);
    expect(a.single_sources.map((s) => `${s.site}.${s.material}<-${s.supplier}`)).toEqual(['bearing-maker.steel<-steel-mill', 'module-a.bearing<-bearing-maker', 'module-b.bearing<-bearing-maker']);
    expect(familyMeasures('supply-network', threeTier())).toMatchObject({ bottleneck: 'bearing-maker.bearing', bottleneck_tier: 2, throughput_per_day: 450, tier_coverage: 1, single_sources: 3, single_source_exposure: 0.75 });
    // more bearings: still the bearing maker's; enough of them: the terminal's own intake binds
    const b = analyseNetwork(threeTier({ bearing: 3000 }));
    expect(b.throughput_per_day).toBe(750);
    expect(b.bottleneck).toMatchObject({ site: 'bearing-maker', material: 'bearing' });
    const c = analyseNetwork(threeTier({ bearing: 10_000 }));
    expect(c.throughput_per_day).toBe(1000);
    expect(c.bottleneck).toMatchObject({ site: 'regensburg', material: 'module', tier: 0, relieved_throughput_per_day: 1100 });
  });

  it('THE FINDINGS: the bottleneck first, then coverage gaps, then single sources; stable measures (the same numbers, the same finding)', () => {
    const f = findingsOf(analyseNetwork(threeTier()));
    expect(f.map((x) => `${x.finding_kind}:${x.subject}`)).toEqual(['bottleneck:bearing-maker.bearing', 'single_source:bearing-maker.steel', 'single_source:module-a.bearing', 'single_source:module-b.bearing']);
    expect(f[0]?.rationale).toMatch(/Bearing maker \(Ningbo\) \(tier 2\) at 1800 pcs\/day of bearing bounds the network's throughput to NORDWERK Regensburg at 450 pcs\/day/);
    expect(findingsOf(analyseNetwork(threeTier()))).toEqual(f);
    const gap = findingsOf(analyseNetwork([...threeTier(), { key: 'tier:4', value: 'ore', unit: null }]));
    expect(gap.map((x) => `${x.finding_kind}:${x.subject}`)).toContain('coverage_gap:tier:4');
  });
});

describe('B29 §B · the Supply Chain Agent\'s identity and registration', () => {
  it('is registered with this runtime\'s scan (a foreign digest refused); max_items is enforced by its scan', () => {
    expect(SUPPLY_CHAIN_AGENT_METHOD).toBe(`supply-chain-agent@${SUPPLY_CHAIN_AGENT_VERSION}`);
    expect(SUPPLY_CHAIN_AGENT_DIGEST).toMatch(/^[0-9a-f]{64}$/);
    const base = { ownerPrincipalId: 'o', escalationPrincipalId: 'e', budgets: { max_reads: 5, max_gateway_calls: 0, max_elapsed_ms: 60_000 }, stopConditions: [{ kind: 'max_items', value: 2 }] };
    expect(validateRegisterAgent({ ...base, kind: 'supply_chain', version: SUPPLY_CHAIN_AGENT_VERSION, codeDigest: SUPPLY_CHAIN_AGENT_DIGEST }, 'c').kind).toBe('supply_chain');
    expect(() => validateRegisterAgent({ ...base, kind: 'supply_chain', version: SUPPLY_CHAIN_AGENT_VERSION, codeDigest: 'a'.repeat(64) }, 'c')).toThrow(/registered with this runtime's scan/);
    expect(STOP_CONDITION_KINDS['max_items']).toContain('supply_chain');
    expect(() => validateRegisterAgent({ ...base, kind: 'supply_chain', version: SUPPLY_CHAIN_AGENT_VERSION, codeDigest: SUPPLY_CHAIN_AGENT_DIGEST, stopConditions: [{ kind: 'on_degraded' }] }, 'c')).toThrow(/not enforced by a supply_chain agent/);
  });
});
