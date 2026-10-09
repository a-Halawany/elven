/**
 * CP-6 B33 §SC — the supply-chain intelligence client's words: they only say what the record says (nothing inferred, mapped or judged here).
 * Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import {
  tierLine, provenanceMark, siteLine, routeLine, coverageLine, inferenceMark, inferenceLine, inferenceEventLine, disruptionMark, signalLine, whereLine, staleBanner,
  lineImpactLine, affectedRouteLine, verdictMark, alternativeLine, instantOfLocal, listOf, type Inference, type Alternative, type LineImpact,
} from './supply-b33';

describe('the network\'s uncertainty in words (AI-53-003)', () => {
  it('a tier: declared / validated / inferred, the unknowns, the coverage gap', () => {
    expect(tierLine({ tier: 1, sites: 3, declared: 3, validated: 0, inferred: 0, unknown_parent: 2, unknown_country: 1, unknown_contract: 2, single_source: 1, routes: 4, covered: true }))
      .toBe('tier 1: 3 sites (3 declared, 0 validated, 0 inferred); 1 single source; 2 unknown parent, 1 unknown country, 2 unknown contract');
    expect(tierLine({ tier: 3, sites: 0, declared: 0, validated: 0, inferred: 0, unknown_parent: 0, unknown_country: 0, unknown_contract: 0, single_source: 0, routes: 0, covered: false }))
      .toBe('tier 3: 0 sites (0 declared, 0 validated, 0 inferred) — NOT COVERED (no route out of it)');
  });
  it('a site, a route, the provenance, the coverage — never colour alone', () => {
    expect(provenanceMark({ basis: 'inferred' }).text).toBe('INFERRED — not validated, never mapped');
    expect(siteLine({ id: 'nordbearing', tier: 1, name: 'Nordbearing AB', basis: 'declared', inference_id: null, country: 'SE', city: 'Göteborg', entity_id: null,
      ownership: { parent: null, share: null, confidence: 0.4 }, contract: { ref: 'SYN-CTR-0042', until: '2027-12-31', confidence: 0.95 }, geo_confidence: null, confidence: null, unknown: ['parent', 'geo_confidence'] }))
      .toBe('Nordbearing AB (nordbearing, tier 1) — Göteborg, SE; parent UNKNOWN (confidence 0.4); contract SYN-CTR-0042 until 2027-12-31; unknown: parent, geo_confidence');
    expect(routeLine({ id: 'r1', from: 'steel-mill', to: 'bearing-maker', material: 'steel', mode: null, via: [], lead_days: null, confidence: null, unknown: ['via'] })).toBe('r1: steel-mill → bearing-maker (steel) — via UNKNOWN');
    expect(coverageLine(null)).toBe('no admitted version: nothing is mapped');
    expect(coverageLine({ tiers: [], sites: [], routes: [], rule: '', unsourced: [{ site: 'nordbearing', tier: 1, material: 'bearing-blank' }],
      coverage: { sites: 5, declared: 5, validated: 0, inferred: 0, declared_share: 1, validated_share: 0, inferred_share: 0 } }))
      .toBe('5 supplier sites: 5 declared (100 %), 0 validated, 0 inferred — UNSOURCED: nordbearing\'s bearing-blank (a hidden tier may stand behind it)');
  });
});

describe('inferences, disruptions and options in words', () => {
  const inf = { proposed_site: 'shenzhen-bearing-blank', behind_site: 'nordbearing', behind_tier: 1, material: 'bearing-blank', confidence: '0.875', observed_flow_per_day: '3000', flow_unit: 'pcs/day',
    sensitive: true, sensitivity: ['a named counterparty'], isolated: false, proposed_value: { name: 'Shenzhen precision bearing maker (SYNTHETIC)', tier: 2, city: 'Shenzhen', country: 'CN' } } as unknown as Inference;
  it('an inference: who infers, who validates, what it rests on', () => {
    expect(inferenceLine(inf)).toBe('Shenzhen precision bearing maker (SYNTHETIC) (tier 2, Shenzhen, CN) behind nordbearing for bearing-blank — confidence 0.875; observed flow 3000 pcs/day; SENSITIVE (a named counterparty)');
    expect(inferenceMark('proposed').text).toMatch(/^PROPOSED by the Supply Chain Agent/);
    expect(inferenceMark('revoked').text).toMatch(/the owner reverts/);
    expect(inferenceEventLine({ event: 'inference.applied', details: { version: 5 } })).toBe('applied in version 5');
    expect(inferenceEventLine({ event: 'inference.validated', details: { valid_until: '2026-11-08T00:00:00Z', reason: 'agreeing records' } })).toBe('validated until 2026-11-08T00:00:00Z — “agreeing records”');
  });
  it('a disruption: its signal, where, the stale banner, the line', () => {
    expect(disruptionMark('proposed').text).toBe('PROPOSED by the agent — a person confirms it');
    expect(signalLine({ kind: 'twin_change', ref: '01a0f000-1111-7000-8000-000000000001', version: 21, note: 'capacity share fell' })).toBe('an admitted twin change 01a0f000… v21 — capacity share fell');
    expect(whereLine({ chokepoints: ['bab-el-mandeb'], places: [{ country: 'CN', city: 'Ningbo' }], derating: '0.75', duration_days: '60' })).toBe('bab-el-mandeb, Ningbo, CN: 75 % of capacity lost on an affected route for 60 days');
    expect(staleBanner({ stale: true, stale_reasons: ['the linked twin L (v4) is stale by its freshness policy'] })?.text).toMatch(/^STALE INPUTS — the linked twin L \(v4\) is stale .* every option is indeterminate$/);
    expect(staleBanner(null)).toBeNull();
    const line = { title: 'Regensburg line', lines: [{ line: 'SYN-LINE-A1', capacity_per_day: 1000 }], run_rate_before_per_day: 450, run_rate_after_per_day: 112.5, shortfall_per_day: 337.5,
      cover_days: 17.78, line_stop_days: 42.22, stale: false } as unknown as LineImpact;
    expect(lineImpactLine(line)).toBe('SYN-LINE-A1 (Regensburg line) runs at 112.5 of 450 per day — 17.78 day(s) of cover; 42.22 day(s) of line stop');
    expect(lineImpactLine({ ...line, cover_days: null, line_stop_days: null })).toBe('SYN-LINE-A1 (Regensburg line) runs at 112.5 of 450 per day — cover UNKNOWN');
    expect(affectedRouteLine({ route: 'r2', from: 'bearing-maker', to: 'module-a', material: 'bearing', via: ['bab-el-mandeb'], passes: 0.25, why: ['via bab-el-mandeb'] })).toBe('r2: bearing-maker → module-a (bearing) passes 25 % — via bab-el-mandeb');
  });
  it('an option: its verdict (an infeasible or indeterminate one never recommended) and its figures', () => {
    expect(verdictMark('infeasible').text).toBe('INFEASIBLE — constrained, never recommended');
    expect(verdictMark('indeterminate').text).toMatch(/never recommended/);
    const a = { kind: 'routing', branch_id: 'alt-cape-reroute', branch_version: 9, evaluation: { restored_share: 1, effect_after_days: 11 }, cost: { amount: 1850, currency: 'EUR' } } as unknown as Alternative;
    expect(alternativeLine(a)).toBe('routing on alt-cape-reroute v9 · restores 100 % of the run rate · effect after 11 day(s) · cost 1850 EUR');
    expect(alternativeLine({ ...a, kind: 'inventory', branch_id: 'alt-safety-stock', evaluation: { restored_share: 0.25, cover_with_option_days: 26.67 }, cost: null } as unknown as Alternative))
      .toBe('inventory on alt-safety-stock v9 · restores 25 % of the run rate · stock covers 26.67 day(s)');
  });
  it('inputs: a datetime-local is the instant it names; keys as a list', () => {
    expect(instantOfLocal('2026-11-08')).toBeNull();
    expect(instantOfLocal('2026-11-08T09:30')).toBe(new Date('2026-11-08T09:30').toISOString());
    expect(listOf(' bab-el-mandeb, ,suez ')).toEqual(['bab-el-mandeb', 'suez']);
  });
});
