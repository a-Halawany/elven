/**
 * CP-6 B23 (0084, part `branch`) · L7-I02 BranchScenario at the function boundary, no database: ScenarioBranched@v1 pinned key by
 * key (scenario-events.ts), the coherence trigger `branch` and its action, the PDP row (EXACT `prediction.scenario.branch`, the
 * declaring roles, not human-gated, never matched by the `prediction.scenario.declare` PREFIX rule), the command's intake
 * (validateBranchCommand: the four kinds, `user_defined` as the vocabulary's `user-defined`, baseline and the other kinds refused 422
 * with the reason, the key and the version) and its digest (what the idempotency key binds), and the refusal rows — every text the
 * port and the opening gate raise, driven through the mapper with its SQLSTATE, pinned status + code + the port's sentence.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { SCENARIO_COHERENCE_TRIGGER_ACTION, scenarioBranchedEvent } from '../../src/prediction/scenarios/scenario-events.js';
import { BRANCHABLE_KINDS, branchRequestDigest, validateBranchCommand } from '../../src/prediction/scenarios/scenarios.service.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

type Row = Record<string, unknown>;
const SCN = '0190c1d2-e3f4-7000-8000-000000000001'; const BR = '0190c1d2-e3f4-7000-8000-000000000002'; const REQ = '0190c1d2-e3f4-7000-8000-000000000003';
const ACTOR = '0190c1d2-e3f4-7000-8000-000000000004'; const OWNER = '0190c1d2-e3f4-7000-8000-000000000005'; const IND = '0190c1d2-e3f4-7000-8000-000000000006';
const CHK = '0190c1d2-e3f4-7000-8000-000000000007'; const FCT = '0190c1d2-e3f4-7000-8000-000000000008';
const AT = '2026-09-25T09:00:00.000Z';

const branch = (over: Row = {}): Row => ({ name: 'Insurer withdrawal', kind: 'user_defined', kindLabel: 'insurer withdrawal', statement: 'war-risk cover is withdrawn',
  divergence: 'insurers withdraw cover whatever the transits say', indicatorId: IND, owner: OWNER, consequence: 'reroute every open booking', responseWindowHours: 24, ...over });
const body = (over: Row = {}, b: Row = {}): Row => ({ expected_version: 1, idempotency_key: 'k-1', branch: branch(b), ...over });
const status = (f: () => unknown): { status: number | null; message: string } => {
  try { f(); return { status: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message ?? '') };
    throw e;
  }
};

describe('B23 · ScenarioBranched@v1 and the coherence trigger', () => {
  it('the trigger→action map gains branch → prediction.scenario.branch (the four B21 triggers unchanged)', () => {
    expect(SCENARIO_COHERENCE_TRIGGER_ACTION).toEqual({ declare: 'prediction.scenario.declare', review: 'prediction.scenario.review', subscription: 'prediction.scenario.subscription.apply',
      operator: 'prediction.scenario.check', branch: 'prediction.scenario.branch' });
  });
  it('pinned key by key: the scenario, the versions, the branch, the request, the coherence on the new version, the temporal and the cause on the SCN', () => {
    const answer: Row = { request_id: REQ, scenario_id: SCN, branch_id: BR, base_version: 2, version: 3, repeated: false, name: 'Insurer withdrawal', kind: 'user-defined',
      kind_label: 'insurer withdrawal', requested_at: AT, title: 'Corridor tree', owner: OWNER, forecast_id: FCT };
    const row = scenarioBranchedEvent({ answer, branch: { indicator_id: IND, owner: OWNER, consequence_class: 'C3', statement: 'war-risk cover is withdrawn' },
      idempotencyKey: 'k-1', requestDigest: 'a'.repeat(64), coherence: { check_id: CHK, outcome: 'passed', changed: false, rule_version: '1', findings: [] }, actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('ScenarioBranched');
    expect(row.payload).toEqual({
      schema: 'ScenarioBranched', schema_version: 'v1', scenario_id: SCN, title: 'Corridor tree', owner: OWNER, forecast_id: FCT, base_version: 2, version: 3,
      branch: { branch_id: BR, name: 'Insurer withdrawal', kind: 'user-defined', kind_label: 'insurer withdrawal', statement: 'war-risk cover is withdrawn', indicator_id: IND, owner: OWNER, consequence_class: 'C3' },
      request: { request_id: REQ, idempotency_key: 'k-1', request_digest: 'a'.repeat(64) },
      coherence: { check_id: CHK, outcome: 'passed', changed: false, rule_version: '1' },
      temporal: { known_at: AT },
      cause: { action: 'prediction.scenario.branch', actor: ACTOR, target_type: 'SCN', target_id: SCN },
    });
  });
});

describe('B23 · the command\'s intake and its digest', () => {
  it('the four kinds the contract names; user_defined read as the vocabulary\'s user-defined', () => {
    expect([...BRANCHABLE_KINDS]).toEqual(['upside', 'downside', 'disruption', 'user-defined']);
    const c = validateBranchCommand(SCN, body(), 'corr');
    expect(c).toMatchObject({ scenarioId: SCN, expectedVersion: 1, idempotencyKey: 'k-1', offeredCadence: null, branch: { kind: 'user-defined', kindLabel: 'insurer withdrawal', indicatorId: IND } });
    for (const kind of ['upside', 'downside']) expect(validateBranchCommand(SCN, body({}, { kind, kindLabel: null, divergence: null }), 'corr').branch.kind).toBe(kind);
    expect(validateBranchCommand(SCN, body({}, { kind: 'disruption', kindLabel: null }), 'corr').branch.kind).toBe('disruption');
  });
  it('baseline, the other vocabulary kinds and an unknown kind are refused 422 with the reason; the key, the version and the scenario id are the caller\'s to give', () => {
    expect(status(() => validateBranchCommand(SCN, body({}, { kind: 'baseline', kindLabel: null }), 'corr'))).toMatchObject({ status: 422, message: expect.stringMatching(/kind "baseline" is not one of them \(a scenario has one baseline/) });
    for (const kind of ['stress', 'adversarial', 'counterfactual']) {
      expect(status(() => validateBranchCommand(SCN, body({}, { kind, kindLabel: null }), 'corr'))).toMatchObject({ status: 422, message: expect.stringMatching(/\(declare it with the scenario tree\)$/) });
    }
    expect(status(() => validateBranchCommand(SCN, body({}, { kind: 'wildcard' }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand(SCN, body({ idempotency_key: '' }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand(SCN, body({ idempotency_key: 'k'.repeat(201) }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand(SCN, body({ expected_version: 0 }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand(SCN, body({ expected_version: 1.5 }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand(SCN, body({ branch: null }), 'corr')).status).toBe(422);
    expect(status(() => validateBranchCommand('nope', body(), 'corr')).status).toBe(422);
    // the declaration's own branch rules still hold
    expect(status(() => validateBranchCommand(SCN, body({}, { kindLabel: null }), 'corr')).message).toMatch(/is user-defined and must name its kind/);
    expect(status(() => validateBranchCommand(SCN, body({}, { indicatorId: null }), 'corr')).message).toMatch(/must name the indicator that flips it/);
  });
  it('the digest binds the scenario, the version read and the branch as offered: equal for the same body, different for any change', () => {
    const d = branchRequestDigest(validateBranchCommand(SCN, body(), 'corr'));
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(branchRequestDigest(validateBranchCommand(SCN, body(), 'corr'))).toBe(d);
    expect(branchRequestDigest(validateBranchCommand(SCN, body({}, { kind: 'user-defined' }), 'corr'))).toBe(d); // the alias is the same kind
    expect(branchRequestDigest(validateBranchCommand(SCN, body({ expected_version: 2 }), 'corr'))).not.toBe(d);
    expect(branchRequestDigest(validateBranchCommand(SCN, body({}, { name: 'Insurer withdrawal II' }), 'corr'))).not.toBe(d);
    expect(branchRequestDigest(validateBranchCommand(BR, body(), 'corr'))).not.toBe(d);
  });
});

describe('B23 · the PDP row', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const at = (action: string, roles: string[], consequenceClass: PolicyInput['consequenceClass'] = 'C2'): PolicyInput => ({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
                 bindings: roles.map((roleCode) => (roleCode === 'platform_admin'
                   ? { roleCode, scope: 'PLATFORM' as const, tenantId: null, domainId: null }
                   : { roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'SCN', objectId: null, purposeId: 'prediction',
    context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const pdp = new PdpService();
  it('prediction.scenario.branch: the declaring roles, no human gate, C2 — denied to the analyst, the agents and above C2', () => {
    for (const role of ['platform_admin', 'domain_admin', 'strategy_owner', 'forecast_owner']) {
      const r = pdp.evaluate(at('prediction.scenario.branch', [role]));
      expect(r.decision, role).toBe('allow');
      expect(r.obligations, role).toEqual([]);
    }
    for (const role of ['domain_analyst', 'forecast_agent', 'scenario_subscriber', 'twin_owner']) expect(pdp.evaluate(at('prediction.scenario.branch', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(at('prediction.scenario.branch', ['strategy_owner'], 'C3')).decision).toBe('deny');
    // EXACT: a suffixed action is not the branch's (and the declare PREFIX rule never saw the branch action)
    expect(pdp.evaluate(at('prediction.scenario.branch.extra', ['strategy_owner'])).decision).toBe('indeterminate');
    expect(pdp.evaluate(at('prediction.scenario.declare', ['forecast_owner'])).decision).toBe('allow');
  });
});

describe('B23 · the refusal rows (the port\'s sentence, answered as what it is)', () => {
  const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
  const expectAnswer = (code: string, m: string, st: number, c: string): void => {
    const r = asObservationRefusal(pg(code, m), 'corr');
    expect(r?.getStatus(), m).toBe(st);
    const b = r?.getResponse() as { code: string; message: string };
    expect(b.code, m).toBe(c);
    expect(b.message, m).toBe(m);
  };
  it('403 standing, 404 absence, 409 the record\'s state (stale, the key, a duplicate, a retired scenario), 422 the caller\'s request and the opening gate', () => {
    expectAnswer('42501', 'branch rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    expectAnswer('23503', `branch rejected: no such scenario ${SCN} in this domain`, 404, 'EYE-STA-001');
    expectAnswer('23503', `branch rejected: no active scenario ${SCN} in this domain`, 404, 'EYE-STA-001');
    expectAnswer('23503', 'branch rejected: no such indicator in this domain', 404, 'EYE-STA-001');
    for (const m of [
      `branch rejected (stale_version): scenario ${SCN} stands at version 3, the request names version 2; reload the scenario and branch its current version`,
      'branch rejected (idempotency_conflict): idempotency key k-1 was already used by this requester for a different branching (digest aaaaaaaaaaaa recorded, bbbbbbbbbbbb offered); a new branching takes a new key',
      `branch rejected: scenario ${SCN} is retired; only an active scenario takes a new branch (declare a successor)`,
    ]) expectAnswer('22023', m, 409, 'EYE-STA-002');
    for (const m of [
      `branch rejected (duplicate): scenario ${SCN} already has a live branch named "Corridor collapse" (${BR})`,
      `branch rejected (duplicate): scenario ${SCN} already has a live user-defined branch "Insurer withdrawal" of the kind "insurer withdrawal" (${BR})`,
      `branch rejected (duplicate): the live downside branch "Corridor collapse" (${BR}) shares the same indicator; a second one does not cover distinct uncertainty (the coherence rule's duplicate_branch)`,
    ]) expectAnswer('23514', m, 409, 'EYE-STA-002');
    for (const [code, m] of [
      ['22023', 'branch rejected: BranchScenario adds an upside, downside, disruption or user-defined branch; kind baseline is not one of them'],
      ['22023', 'branch rejected: the idempotency key is 1-200 characters'],
      ['22023', `branch rejected: no SCN version 3 of scenario ${SCN} naming branch ${BR} was admitted by this write (the version is admitted first, superseding version 2)`],
      ['23514', 'branch rejected: kind wildcard is not in scenario kind vocabulary v1 (baseline, upside)'],
      ['22023', `run rejected (branch_added_later): branch ${BR} was added in version 2 of scenario ${SCN}, after version 1 that this twin version's known_at (2026-09-25 09:00:00+00) binds; it was not in the tree this run knew`],
    ] as const) expectAnswer(code, m, 422, 'EYE-REQ-001');
  });
});
