/**
 * CP-6 B33 part `twin` (0111 §TW) — the pure pieces: the cross-twin dependency verdict and the coupling's unavailable dependency (TW5), the
 * estimate's own citation (TW4), the scenario-element intake with the SCENARIO citation (TW2), the refusal rows of the two new estimate
 * classes, and the proof that simulation.open_run is copied WHOLE from its last definition (0092) with only the two envelope texts changed
 * (TW8).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { couplingUnavailable, dependencyVerdict } from '../../src/twin/estimation/dependency-b33.js';
import { estimateCitation } from '../../src/twin/estimation/estimation.service.js';
import { validateScenarioElements } from '../../src/twin/branches/branch.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const C = '00000000-0000-4000-8000-000000000001';
const S = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const B = '01a0f78e-7d30-7cea-9b84-1f614e716086';
const A = '01a0f78e-7d30-7cea-9b84-1f614e716087';
const msg = (f: () => unknown): string => { try { f(); return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message) : String(e); } };
const up = (over: Record<string, unknown> = {}) => ({ twin_id: 'u', title: 'Upstream', head_version: 3, cited_version: 3, behind: false, verification_state: 'verified', freshness: 'fresh', ...over });

describe('TW5 · the cross-twin dependency verdict (pure)', () => {
  it('none without an upstream; certain upstreams are neither hard nor soft', () => {
    expect(dependencyVerdict(null)).toEqual({ state: 'none', hard: [], soft: [] });
    expect(dependencyVerdict({ state: 'certain', upstream: [up() as never] })).toMatchObject({ state: 'certain', hard: [], soft: [] });
  });
  it('HARD: no admitted head, or unverified (the publication refused); SOFT: stale or behind (the owner\'s note) — an upstream counted once, hard first', () => {
    const v = dependencyVerdict({ state: 'uncertain', upstream: [up({ twin_id: 'a', freshness: 'no_head', head_version: null }), up({ twin_id: 'b', verification_state: 'unverified', behind: true }),
                                                                 up({ twin_id: 'c', freshness: 'stale' }), up({ twin_id: 'd', behind: true, cited_version: 2 })] as never });
    expect(v.hard.map((u) => u.twin_id)).toEqual(['a', 'b']);
    expect(v.soft.map((u) => u.twin_id)).toEqual(['c', 'd']);
  });
  it('the coupling\'s upstream unavailable: no head, the carried version unverified, the head unverified — in words; available → null', () => {
    const base = { upstreamTwinId: 'U', upstreamVersion: 3, upstreamVersionVerification: 'verified', upstreamHead: 3, upstreamHeadVerification: 'verified' };
    expect(couplingUnavailable(base)).toBeNull();
    expect(couplingUnavailable({ ...base, upstreamVersionVerification: 'unverified' })).toBe('upstream twin U: its version v3 the proposal carries is UNVERIFIED (a cited input was corrected)');
    expect(couplingUnavailable({ ...base, upstreamHead: 4, upstreamHeadVerification: 'unverified' })).toBe('upstream twin U: its head v4 is UNVERIFIED');
    expect(couplingUnavailable({ ...base, upstreamHead: null, upstreamHeadVerification: null })).toBe('upstream twin U: the upstream twin has no admitted head');
  });
});

describe('TW4 · the estimate\'s own citation (pure)', () => {
  it('{kind: estimate, id: estimate_id, version 1, digest: inputs_digest}', () => {
    expect(estimateCitation({ estimate_id: C, inputs_digest: 'a'.repeat(64), proposed_value: 62 })).toEqual({ kind: 'estimate', id: C, version: 1, digest: 'a'.repeat(64) });
  });
  it('the two new classes map before B30\'s rows: dependency 409 (with stale), citation 422', () => {
    expect(asObservationRefusal({ code: '22023', message: `estimate rejected (dependency): estimate ${C} rests on twin ${C} v3, whose upstream twin dependency is unavailable — Upstream (u): unverified; publish once the upstream has a verified admitted head` }, 'c')?.getStatus()).toBe(409);
    expect(asObservationRefusal({ code: '22023', message: `estimate rejected (citation): version 4 carries corridor.capacity_share without exactly this estimate's citation {kind: estimate, id: ${C}, version: 1, digest: x}` }, 'c')?.getStatus()).toBe(422);
    expect(asObservationRefusal({ code: '22023', message: 'estimate rejected (stale): estimate x was computed against v2 of the twin; the head moved to v3' }, 'c')?.getStatus()).toBe(409);   // B30's rows unchanged
    expect(asObservationRefusal({ code: '22023', message: 'estimate rejected (note): the cross-twin dependency is uncertain (Upstream (u): stale); an estimate on it is approved with the owner\'s note (at least 8 characters)' }, 'c')?.getStatus()).toBe(422);
  });
});

describe('TW2 · the scenario-element intake with the SCENARIO citation', () => {
  it('positive: the scenario alone (optionally its version), or beside the assumption; B30\'s shape unchanged when the scenario is not cited', () => {
    expect(validateScenarioElements({ elements: [{ key: 'corridor.closure_share', value: 100, unit: '%', scenarioId: S, scenarioBranchId: B, citeScenario: true, scenarioVersion: 3 }] }, C))
      .toEqual([{ key: 'corridor.closure_share', value: 100, unit: '%', scenarioId: S, scenarioBranchId: B, assumption: null, validFrom: null, validTo: null, confidence: null, scenario: { version: 3 } }]);
    expect(validateScenarioElements({ elements: [{ key: 'shock.corridor_delay_days', value: 45, scenarioId: S, scenarioBranchId: B, assumption: { id: A }, citeScenario: true }] }, C)[0])
      .toMatchObject({ assumption: { id: A, version: null }, scenario: { version: null } });
    expect(Object.keys(validateScenarioElements({ elements: [{ key: 'shock.corridor_delay_days', value: 45, scenarioId: S, scenarioBranchId: B, assumption: { id: A } }] }, C)[0] as object)).not.toContain('scenario');
  });
  it('refusal: no basis at all, a non-boolean citeScenario, a version without the citation, a bad version', () => {
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'k', value: 1, scenarioId: S, scenarioBranchId: B }] }, C))).toMatch(/^scenario element rejected \(basis\): k cites the scenario branch's assumption \{ id, version\? \} or the scenario itself/);
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'k', value: 1, scenarioId: S, scenarioBranchId: B, citeScenario: 'yes' }] }, C))).toMatch(/^scenario element rejected \(basis\): citeScenario is true or false/);
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'k', value: 1, scenarioId: S, scenarioBranchId: B, assumption: { id: A }, scenarioVersion: 2 }] }, C))).toMatch(/set citeScenario/);
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'k', value: 1, scenarioId: S, scenarioBranchId: B, citeScenario: true, scenarioVersion: 0 }] }, C))).toMatch(/^scenario element rejected \(scenario_version\)/);
  });
});

describe('TW8 · simulation.open_run copied WHOLE from its last definition (0092:1888-2131) — only the two envelope texts change', () => {
  const MIG = join(__dirname, '..', '..', 'migrations');
  const original = readFileSync(join(MIG, '0092_b29_twin_families_methods_constraints.sql'), 'utf8').split('\n').slice(1887, 2131);
  const part = ((readFileSync(join(MIG, '0111_b33_supply_chain_intelligence_domain_packages.sql'), 'utf8')) as string).split('\n-- §TW — ')[1]!.split('-- ── end of the folded §TW ──')[0]!;   // §TW, folded into 0111 at integration
  const start = part.indexOf('CREATE OR REPLACE FUNCTION simulation.open_run(');
  const mine = part.slice(start).split('\n').slice(0, original.length + 2)   // + the two B33 comment lines
    .filter((l) => !l.trimStart().startsWith('-- B33 twin (TW8)'));
  it('every line but the two RAISE texts is word for word; the two name the holder B30 made it', () => {
    expect(original[0]).toMatch(/^CREATE OR REPLACE FUNCTION simulation\.open_run\(/);
    expect(mine).toHaveLength(original.length);
    const differ = original.map((l, i) => [l, mine[i] as string] as const).filter(([a, b]) => a !== b);
    expect(differ).toHaveLength(2);
    expect(differ[0]?.[0]).toMatch(/needs a twin owner''s or the domain administrator''s acknowledgement/);
    expect(differ[0]?.[1]).toMatch(/needs a twin owner''s acknowledgement \(envelope\.acknowledge true/);
    expect(differ[1]?.[0]).toMatch(/is a twin owner''s or the domain administrator''s; the acting principal holds neither role/);
    expect(differ[1]?.[1]).toMatch(/is a twin owner''s of this domain; the acting principal is not one \(%\)/);
  });
});
