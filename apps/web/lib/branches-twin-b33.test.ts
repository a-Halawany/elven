/**
 * CP-6 B33 part `twin` (0111 §TW1/§TW3) — the explorer's B33 words and the scenario-element form's payload (pure): the merge's TARGET named
 * (actual's words unchanged), the targets offered, the form's shape (the server judges the rest), a DATE sent as the day it names.
 */
import { describe, expect, it } from 'vitest';
import { branchEventLine, divergingLine, groundedScenarioLine, mergeStateMark, mergeTargets, scenarioElementPayload, type ScenarioElementForm } from './branches-b30';

const S = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const B = '01a0f78e-7d30-7cea-9b84-1f614e716086';
const A = '01a0f78e-7d30-7cea-9b84-1f614e716087';
const form = (over: Partial<ScenarioElementForm> = {}): ScenarioElementForm => ({
  key: 'shock.corridor_delay_days', value: '45', unit: 'days', scenarioId: S, scenarioBranchId: B, basis: 'scenario', assumptionId: '', validFrom: '', validTo: '', confidence: '', ...over,
});

describe('B33 twin · the merge target in words', () => {
  it('a merge into actual reads as B30 wrote it; into another branch, the target is named', () => {
    expect(mergeStateMark({ state: 'open', unresolved: ['a'], diverging: [{} as never], merged_version: null }).text).toBe('OPEN — merging back is refused until reconciliation: 1 of 1 diverging key(s) unresolved');
    expect(mergeStateMark({ state: 'open', unresolved: ['a'], diverging: [{} as never], merged_version: null, target_branch: 'actual' }).text).toMatch(/^OPEN — merging back/);
    expect(mergeStateMark({ state: 'open', unresolved: ['a'], diverging: [{} as never], merged_version: null, target_branch: 'blockade' }).text).toBe('OPEN — merging into blockade is refused until reconciliation: 1 of 1 diverging key(s) unresolved');
    expect(mergeStateMark({ state: 'merged', unresolved: [], diverging: [], merged_version: 22, target_branch: 'blockade' }).text).toBe('MERGED — admitted on blockade as v22');
    expect(mergeStateMark({ state: 'completing', unresolved: [], diverging: [], merged_version: null, target_branch: 'blockade' }).text).toMatch(/blockade is held until its admission/);
    const d = { key: 'route.reroute_delay_days', change: 'changed' as const, conflict: true, source: { kind: 'assumed', value: 26, unit: 'days' }, target: { kind: 'assumed', value: 21, unit: 'days' }, base: { kind: 'assumed', value: 11, unit: 'days' } };
    expect(divergingLine(d)).toBe('route.reroute_delay_days: branch 26 days (assumed) · actual 21 days (assumed) · fork point 11 days (assumed) · CONFLICT (actual changed it too)');
    expect(divergingLine(d, 'blockade')).toBe('route.reroute_delay_days: source 26 days (assumed) · blockade 21 days (assumed) · common version 11 days (assumed) · CONFLICT (blockade changed it too)');
    expect(branchEventLine({ event: 'merge.opened', details: { source_branch: 'stress-75', source_version: 17, target_version: 16, target_branch: 'blockade', diverging_keys: ['a'] } }))
      .toBe('merge of stress-75 v17 into blockade v16 opened — 1 diverging key(s)');
    expect(branchEventLine({ event: 'merge.opened', details: { source_branch: 'blockade', source_version: 4, target_version: 2, diverging_keys: ['a', 'b'] } })).toBe('merge of blockade v4 into actual v2 opened — 2 diverging key(s)');
    expect(branchEventLine({ event: 'merge.merged', details: { merged_version: 9 } })).toBe('merged as actual v9');
    expect(branchEventLine({ event: 'merge.merged', details: { merged_version: 9, target_branch: 'blockade' } })).toBe('merged as blockade v9');
  });

  it('the targets offered: actual and every OTHER branch with an admitted head, never the source itself', () => {
    const tree = [
      { branch_id: 'actual', forked_from: null, head: 20, draft: null, versions: [20], withdrawn: [] },
      { branch_id: 'blockade', forked_from: 1, head: 16, draft: null, versions: [16], withdrawn: [] },
      { branch_id: 'stress-75', forked_from: 1, head: 17, draft: null, versions: [17], withdrawn: [] },
      { branch_id: 'empty', forked_from: 1, head: null, draft: 30, versions: [30], withdrawn: [] },
    ];
    expect(mergeTargets(tree, 'stress-75')).toEqual(['actual', 'blockade']);
    expect(mergeTargets(tree, '')).toEqual([]);
  });
});

describe('B33 twin · the scenario-element form', () => {
  it('positive: the scenario citation alone, the assumption alone, both; a number-looking value is a number; a DATE is the day it names', () => {
    expect(scenarioElementPayload(form())).toEqual({ ok: true, payload: { key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: S, scenarioBranchId: B, citeScenario: true } });
    expect(scenarioElementPayload(form({ basis: 'assumption', assumptionId: ` ${A} ` }))).toEqual({ ok: true, payload: { key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: S, scenarioBranchId: B, assumption: { id: A } } });
    const both = scenarioElementPayload(form({ basis: 'both', assumptionId: A, validFrom: '2026-10-09', validTo: '2026-11-23', confidence: '0.4', value: 'closed' }));
    expect(both).toEqual({ ok: true, payload: { key: 'shock.corridor_delay_days', value: 'closed', unit: 'days', scenarioId: S, scenarioBranchId: B, assumption: { id: A }, citeScenario: true,
                                                validFrom: '2026-10-09', validTo: '2026-11-23', confidence: 0.4 } });
  });
  it('refusal: what is still needed is said — the key, the value, the scenario and its branch, the assumption id, the days, the confidence', () => {
    const why = (f: ScenarioElementForm) => { const r = scenarioElementPayload(f); return r.ok ? '' : r.why; };
    expect(why(form({ key: 'Bad Key' }))).toMatch(/a key like/);
    expect(why(form({ value: ' ' }))).toBe('the scenario value');
    expect(why(form({ scenarioId: '' }))).toBe('the scenario');
    expect(why(form({ scenarioBranchId: 'x' }))).toBe('the scenario branch');
    expect(why(form({ basis: 'assumption' }))).toMatch(/the assumption id/);
    expect(why(form({ validFrom: '09/10/2026' }))).toBe('valid from is a day');
    expect(why(form({ validFrom: '2026-11-01', validTo: '2026-10-01' }))).toBe('valid to is not before valid from');
    expect(why(form({ confidence: '1.5' }))).toBe('a confidence in [0, 1]');
  });
  it('recovery: corrected, the same form gives the payload; the grounded answer is worded with its citations', () => {
    expect(scenarioElementPayload(form({ confidence: '0.5' })).ok).toBe(true);
    expect(groundedScenarioLine({ key: 'shock.corridor_delay_days', material: true, scenario: { id: S, version: 3, branch: B }, assumption: { id: A, version: 1 } }))
      .toBe('shock.corridor_delay_days grounded as a SCENARIO element citing scenario 01a0f78e… v3 (branch 01a0f78e…) and assumption 01a0f78e… v1 (a material key)');
  });
});
