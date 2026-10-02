/**
 * CP-6 B30 part `branches` (0103 §BR) — the pure parts: the intakes' shapes (the ports judge every rule), the branch tree and the resumed
 * grounding, every refusal text the part raises mapped to its class's status by observation-errors (anchored, class form), and the PDP rows
 * (exact, reached, human-gated where a named human decides the twin's state). Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../../src/policy/pdp.service.js';
import { FRESHNESS_ORDER, FRESHNESS_STEP, branchTree, pendingGround, validateFreeze, validatePolicy, validateResolution, validateScenarioElements } from '../../../src/twin/branches/branch.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const U = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const U2 = '01a0f78e-7d30-7cea-9b84-1f614e716086';
const msg = (f: () => unknown): string => {
  try { f(); return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message) : String(e); }
};
const status = (f: () => unknown): number | null => { try { f(); return null; } catch (e) { return e instanceof HttpException ? e.getStatus() : null; } };

describe('B30 branches · the intakes', () => {
  it('the freshness policy: whole days, key prefixes, the near-expiry hours, a note', () => {
    expect(validatePolicy({ maxAgeDays: 2, keyMaxAge: { shock: 1, 'inventory.on_hand': 3 }, nearExpiryHours: 48, note: 'refreshed every two days' }, C))
      .toEqual({ maxAgeDays: 2, keyMaxAge: { shock: 1, 'inventory.on_hand': 3 }, nearExpiryHours: 48, note: 'refreshed every two days' });
    expect(validatePolicy({ maxAgeDays: 0, note: 'always refreshed' }, C)).toMatchObject({ keyMaxAge: {}, nearExpiryHours: null });
    expect(msg(() => validatePolicy({ maxAgeDays: 1.5, note: 'a fraction of a day' }, C))).toMatch(/^freshness policy rejected \(max_age\)/);
    expect(msg(() => validatePolicy({ maxAgeDays: 2, keyMaxAge: { 'Bad Key': 1 }, note: 'a malformed prefix' }, C))).toMatch(/^freshness policy rejected \(key_max_age\)/);
    expect(msg(() => validatePolicy({ maxAgeDays: 2, nearExpiryHours: 0, note: 'never announced' }, C))).toMatch(/^freshness policy rejected \(near_expiry\)/);
    expect(msg(() => validatePolicy({ maxAgeDays: 2, note: 'short' }, C))).toMatch(/^freshness policy rejected \(note\)/);
  });
  it('a resolution: keep_target and take_branch state nothing else; reconciled states a kind (assumed | estimated), a value and evidence or an assumption', () => {
    expect(validateResolution({ key: 'shock.corridor_delay_days', resolution: 'keep_target', note: 'the blockade stays a scenario' }, C))
      .toEqual({ key: 'shock.corridor_delay_days', resolution: 'keep_target', kind: null, value: null, unit: null, citations: [], note: 'the blockade stays a scenario' });
    expect(validateResolution({ key: 'route.reroute_delay_days', resolution: 'reconciled', kind: 'assumed', value: 23, unit: 'days', citations: [{ kind: 'evidence', id: U, version: 1 }], note: 'between the two figures' }, C))
      .toMatchObject({ resolution: 'reconciled', kind: 'assumed', value: 23, citations: [{ kind: 'evidence', id: U, version: 1 }] });
    expect(msg(() => validateResolution({ key: 'k', resolution: 'take_branch', value: 3, note: 'a value on a take' }, C))).toMatch(/^branch merge rejected \(resolution\): only a reconciled key/);
    expect(msg(() => validateResolution({ key: 'k', resolution: 'merge', note: 'not a resolution' }, C))).toMatch(/^branch merge rejected \(resolution\)/);
    expect(msg(() => validateResolution({ key: 'k', resolution: 'reconciled', kind: 'observed', value: 1, citations: [{ kind: 'evidence', id: U }], note: 'observed by the owner' }, C))).toMatch(/^branch merge rejected \(kind\)/);
    expect(msg(() => validateResolution({ key: 'k', resolution: 'reconciled', kind: 'assumed', value: 1, note: 'no citation given' }, C))).toMatch(/^branch merge rejected \(citations\)/);
    expect(msg(() => validateResolution({ key: 'k', resolution: 'reconciled', kind: 'assumed', value: 1, citations: [{ kind: 'claim', id: U }], note: 'a claim citation' }, C))).toMatch(/^branch merge rejected \(citations\)/);
    expect(msg(() => validateResolution({ key: 'Not A Key', resolution: 'keep_target', note: 'a malformed key' }, C))).toMatch(/^branch merge rejected \(key\)/);
  });
  it('a freeze: branch (default actual), an optional version, a warning, an instant', () => {
    expect(validateFreeze({ warning: 'serve the validated snapshot', expiresAt: '2026-10-09T12:00:00Z' }, C)).toEqual({ branchId: 'actual', version: null, warning: 'serve the validated snapshot', expiresAt: '2026-10-09T12:00:00.000Z' });
    expect(msg(() => validateFreeze({ warning: 'short', expiresAt: '2026-10-09T12:00:00Z' }, C))).toMatch(/^snapshot rejected \(warning\)/);
    expect(msg(() => validateFreeze({ warning: 'serve the validated snapshot', expiresAt: 'tomorrow' }, C))).toMatch(/^snapshot rejected \(expiry\)/);
    expect(msg(() => validateFreeze({ warning: 'serve the validated snapshot', expiresAt: '2026-10-09T12:00:00Z', version: 0 }, C))).toMatch(/^snapshot rejected \(version\)/);
  });
  it('a scenario element: the scenario, its branch and the branch\'s assumption — never evidence of the world', () => {
    const e = validateScenarioElements({ elements: [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: U, scenarioBranchId: U2, assumption: { id: U }, confidence: 0.4 }] }, C);
    expect(e).toEqual([{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: U, scenarioBranchId: U2, assumption: { id: U, version: null }, validFrom: null, validTo: null, confidence: 0.4 }]);
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'shock.corridor_delay_days', value: 45, scenarioId: U, scenarioBranchId: U2 }] }, C))).toMatch(/^scenario element rejected \(basis\)/);
    expect(msg(() => validateScenarioElements({ elements: [{ key: 'shock.corridor_delay_days', value: 45, scenarioId: 'x', scenarioBranchId: U2, assumption: { id: U } }] }, C))).toMatch(/^scenario element rejected \(scenario\)/);
    expect(msg(() => validateScenarioElements({ elements: [] }, C))).toMatch(/^scenario element rejected \(elements\)/);
    expect(status(() => validateScenarioElements({ elements: [{ key: 'k', value: 1, scenarioId: U, scenarioBranchId: U2, assumption: { id: U }, confidence: 2 }] }, C))).toBe(422);
  });
});

describe('B30 branches · the branch tree and the resumed grounding', () => {
  it('per branch: the fork point, the admitted head, the open draft, the withdrawn; actual first', () => {
    const v = (version: number, branch_id: string, state: string, forked_from_version: number | null = null) => ({ version, branch_id, state, forked_from_version });
    expect(branchTree([v(4, 'blockade', 'admitted', 1), v(1, 'actual', 'admitted'), v(2, 'actual', 'admitted'), v(5, 'blockade', 'draft'), v(3, 'alt-30-day-delay', 'withdrawn', 1), v(6, 'actual', 'withdrawn')])).toEqual([
      { branch_id: 'actual', forked_from: null, head: 2, draft: null, versions: [1, 2, 6], withdrawn: [6] },
      { branch_id: 'alt-30-day-delay', forked_from: 1, head: null, draft: null, versions: [3], withdrawn: [3] },
      { branch_id: 'blockade', forked_from: 1, head: 4, draft: 5, versions: [4, 5], withdrawn: [] },
    ]);
    expect(branchTree([])).toEqual([]);
  });
  it('a resumed completion grounds only what the draft does not hold yet', () => {
    expect(pendingGround([{ key: 'a' }, { key: 'b' }, { key: 'c' }], ['b'])).toEqual([{ key: 'a' }, { key: 'c' }]);
    expect(pendingGround([{ key: 'a' }], ['a'])).toEqual([]);
  });
  it('the tick step is `twin-freshness`, order 70 (after scenario-quality 68)', () => {
    expect([FRESHNESS_STEP, FRESHNESS_ORDER]).toEqual(['twin-freshness', 70]);
  });
});

describe('B30 branches · every refusal text maps to its class (anchored, class form)', () => {
  const TEXTS: Array<[string, number, string]> = [
    ['branch merge rejected (actor): recorded by the acting principal', 403, '42501'],
    ['branch merge rejected (ownership): reconciling a merge is the act of the twin\'s own owner (x), not of another holder of the role', 403, '42501'],
    ['branch merge rejected (unknown_merge): x is not a merge of this domain', 404, '23503'],
    ['branch merge rejected (unknown_branch): branch blockade of this twin has no admitted version', 404, '23503'],
    ['branch merge rejected (unknown_key): k is not a diverging key of merge x', 404, '23503'],
    ['branch merge rejected (unknown_citation): evidence x@1 is not an exact object of this domain', 404, '23503'],
    ['branch merge rejected (unknown_twin): x is not a twin of this domain', 404, '23503'],
    ['branch merge rejected (duplicate): branch blockade already has merge x in progress', 409, '23505'],
    ['branch merge rejected (state): merge x is merged', 409, '2F002'],
    ['branch merge rejected (state): actual has an open draft v9; admit or withdraw it before the merge is completed', 409, '2F002'],
    ['branch merge rejected (state): actual is held by merge x (branch blockade) being completed; v9 does not carry its reconciled plan (differs on: k)', 409, '2F002'],
    ['branch merge rejected (stale): the heads moved since merge x was opened (branch blockade v4 → v6, actual v5 → v7); withdraw it and open a new merge', 409, '2F002'],
    ['branch merge rejected (unreconciled): merging branch blockade back into actual is refused until reconciliation — 2 of 2 diverging key(s) unresolved: a, b', 409, '2F002'],
    ['branch merge rejected (unreconciled): branch blockade has merge x in progress (open); merging it back into actual goes through the merge, refused until reconciliation', 409, '2F002'],
    ['branch merge rejected (scenario): k is a SCENARIO value on branch blockade; a scenario value does not become actual state — keep actual\'s value or reconcile it with evidence', 422, '22023'],
    ['branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled', 422, '22023'],
    ['branch merge rejected (citations): a reconciled value cites the evidence or the assumption it rests on — exact {kind, id, version, digest}', 422, '22023'],
    ['branch merge rejected (reason): a merge says why (8 to 2000 characters)', 422, '22023'],
    ['snapshot rejected (ownership): freezing the served snapshot is the act of the twin\'s own owner (x), not of another holder of the role', 403, '42501'],
    ['snapshot rejected (unknown_freeze): x is not a freeze of this domain', 404, '23503'],
    ['snapshot rejected (duplicate): freeze x already stands on this twin; lift it first', 409, '23505'],
    ['snapshot rejected (state): branch actual has no admitted version validated fit; only a validated snapshot is frozen', 409, '2F002'],
    ['snapshot rejected (stale): v6 is the frozen snapshot of freeze x, which expired at 2026-10-02; a historical snapshot past its expiry is not used for runs — lift the freeze or run on a current version', 409, '2F002'],
    ['snapshot rejected (expiry): a frozen snapshot expires after now and within a year', 422, '22023'],
    ['freshness policy rejected (ownership): a freshness policy is the act of the twin\'s own owner (x), not of another holder of the role', 403, '42501'],
    ['freshness policy rejected (unknown_twin): x is not a twin of this domain', 404, '23503'],
    ['freshness policy rejected (max_age): the head\'s maximum age is a whole number of days in [0, 3650]', 422, '22023'],
    ['checkpoint restore rejected (ownership): restoring a checkpoint is the act of the twin\'s own owner (x), not of another holder of the role', 403, '42501'],
    ['checkpoint restore rejected (unknown_checkpoint): version 999 is not an admitted version of this twin', 404, '23503'],
    ['checkpoint restore rejected (state): draft v9 did not carry from v3 (it carried from nothing)', 409, '2F002'],
    ['checkpoint restore rejected (duplicate): draft v9 is already recorded as a restore', 409, '23505'],
    ['checkpoint restore rejected (checkpoint): v5 is not earlier than the head v5 of branch blockade; a restore returns to an earlier checkpoint', 422, '22023'],
  ];
  it.each(TEXTS)('%s → %i', (t, s, code) => {
    const e = asObservationRefusal({ code, message: t }, C);
    expect(e, t).not.toBeNull();
    expect(e!.getStatus(), t).toBe(s);
    expect(String((e!.getResponse() as { message?: string }).message)).toBe(t);
  });
});

describe('B30 branches · the PDP: exact rules, reached; the twin owner; human-gated where a named human decides the state', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const pdp = new PdpService();
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  const evaluate = (action: string, roles: string[], kind: 'human' | 'agent' = 'human') => pdp.evaluate({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'TWN', objectId: null, purposeId: 'twin', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as PolicyInput);
  it('each write: the twin owner; never the operator, the analyst, the domain administrator or the reconciliation agent', () => {
    for (const [a, gated] of [['twin.branch.merge', true], ['twin.branch.reconcile', true], ['twin.snapshot.freeze', true], ['twin.branch.restore', false], ['twin.freshness.policy', false]] as const) {
      const p = evaluate(a, ['twin_owner']);
      expect(allowed(p), a).toBe(true);
      expect(p.obligations.some((o) => o.type === 'human_gate'), a).toBe(gated);
      for (const no of ['simulation_operator', 'domain_analyst', 'domain_admin', 'reconciliation_agent']) expect(evaluate(a, [no]).decision, `${a} ${no}`).toBe('deny');
    }
  });
  it('the existing prefix rules are unchanged: twin.version and twin.ground stay the twin owner\'s; twin.read stays broad', () => {
    expect(allowed(evaluate('twin.version', ['twin_owner']))).toBe(true);
    expect(allowed(evaluate('twin.ground', ['twin_owner']))).toBe(true);
    expect(evaluate('twin.version', ['simulation_operator']).decision).toBe('deny');
    expect(allowed(evaluate('twin.read', ['domain_analyst']))).toBe(true);
  });
});
