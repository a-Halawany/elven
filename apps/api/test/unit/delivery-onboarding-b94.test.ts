/**
 * B94 §ON — the pure logic of the onboarding programme and the configuration baseline manager: the step vocabulary and its defaults, the
 * ROLLBACK PLAN (one governed restoring act per drifted pointer; a missing port said as a gap, never hidden), the step moves, the REPLAY
 * (the ledger folded into the version chain and compared with the stored versions), the PDP rules (exact; the approval human-gated and the
 * onboarding authority's only), and the refusal texts through the central mapper (403 / 404 / 409 / 422 by class).
 */
import { describe, expect, it } from 'vitest';
import { REALIZATION_KINDS, STEP_DEFAULTS, STEP_KEYS, restoringAct, rollbackPlan, stepMoves, type DriftChange } from '../../src/delivery/onboarding/rollback.js';
import { replayProgramme } from '../../src/delivery/onboarding/replay.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const C = (section: string, key: string | null, change: DriftChange['change'], baseline: unknown, observed: unknown): DriftChange => ({ section, key, change, baseline, observed });

describe('the step vocabulary (JRN-01 → JRN-23)', () => {
  it('sixteen keys in order; every key has its realizing kinds and a default realizing and compensating act', () => {
    expect(STEP_KEYS).toHaveLength(16);
    expect(STEP_KEYS.slice(0, 3)).toEqual(['intent', 'domain', 'authority']);
    expect(STEP_KEYS.at(-1)).toBe('acceptance');
    for (const k of STEP_KEYS) {
      expect(REALIZATION_KINDS[k].length, k).toBeGreaterThan(0);
      expect(STEP_DEFAULTS[k].compensation.action, k).toMatch(/^[a-z][a-z_]*(\.[a-z_]+)+$/);
      expect(STEP_DEFAULTS[k].compensation.description.length, k).toBeGreaterThanOrEqual(8);
    }
    expect(STEP_DEFAULTS.domain.compensation.description).toMatch(/no domain-retirement port exists/);
  });
});

describe('the rollback plan (CAP-DL-05: rollback evidence — never a direct write)', () => {
  it('one restoring act per drifted pointer, by section and change', () => {
    const plan = rollbackPlan([
      C('attention_policy', null, 'changed', { version: 1 }, { version: 2 }),
      C('analytics_purposes', 'mission-outcomes', 'added', null, 1),
      C('analytics_purposes', 'quality', 'removed', 2, null),
      C('packages', 'geo', 'changed', { version: 1, semver: '1.0.0' }, { version: 2, semver: '2.0.0' }),
      C('packages', 'cyber', 'added', null, { version: 1 }),
      C('workflow_definitions', 'review', 'changed', 1, 2),
      C('source_contracts', 'feed', 'changed', 1, 2),
      C('source_contracts', 'new-feed', 'added', null, 1),
      C('role_census', 'domain_admin', 'changed', 1, 2),
      C('role_census', 'risk_owner', 'changed', 1, 0),
      C('licence', null, 'changed', { version: 4 }, { version: 5 }),
    ]);
    expect(plan.map((p) => p.action)).toEqual(['executive.attention.policy.publish', 'analytics.purpose.retire', 'analytics.purpose.propose → analytics.purpose.decide',
      'domain.package.activate', 'domain.package.retire', 'executive.workflow.define', 'observation.source.transition', 'observation.source.transition',
      'identity.credential.revoke', 'identity.principal.create', 'commercial.licence.issue']);
    expect(plan[0]!.restores).toMatch(/publish the rules of attention policy v1 again as the next version/);
    expect(plan[8]!.restores).toMatch(/1 more holder\(s\) of domain_admin than the baseline's 1/);
    expect(plan[8]!.gap).toMatch(/no port revokes a single role binding/);
    expect(plan[9]!.gap).toBeNull();
    expect(plan[10]!.role).toBe('commercial_authority');
  });
  it('no persons in the plan; a section with no restoring act is a GAP, not silence; an in-line domain has an empty plan', () => {
    const plan = rollbackPlan([C('role_census', 'executive', 'changed', 3, 5)]);
    expect(JSON.stringify(plan)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(restoringAct(C('mystery', null, 'changed', 1, 2))).toMatchObject({ action: 'none', gap: 'section mystery has no governed restoring act' });
    expect(restoringAct(C('attention_policy', null, 'added', null, { version: 1 })).gap).toMatch(/no port retires an attention policy/);
    expect(rollbackPlan([])).toEqual([]);
  });
});

describe('the step moves', () => {
  it('a done step moves only by its revert; a held or closed programme disables every record', () => {
    expect(stepMoves('done', 'in_progress').filter((m) => m.allowed).map((m) => m.to)).toEqual(['reverted']);
    expect(stepMoves('planned', 'in_progress').filter((m) => m.allowed).map((m) => m.to)).toEqual(['in_progress', 'done', 'held']);
    expect(stepMoves('in_progress', 'held').filter((m) => m.allowed).map((m) => m.to)).toEqual(['held']);
    expect(stepMoves('done', 'accepted').some((m) => m.allowed)).toBe(false);
  });
});

describe('the replay (the ledger reconstructs the programme)', () => {
  const ev = (version: number, event: string, state: string, digest: string) => ({ subject_kind: 'onboarding_programme', version, event, occurred_at: `2026-10-13T10:0${version}:00Z`,
    actor_principal_id: 'a', details: { state, digest, target_domain_id: version >= 3 ? 'd' : null } });
  const events = [ev(1, 'programme.opened', 'planned', 'x1'), { subject_kind: 'onboarding_step', version: 1, event: 'step.planned', details: {} }, ev(2, 'programme.held', 'held', 'x2'), ev(3, 'programme.domain_drafted', 'held', 'x3')];
  it('folds the programme events into the version chain and agrees with the stored versions', () => {
    const r = replayProgramme(events, [{ version: 1, state: 'planned', digest: 'x1' }, { version: 2, state: 'held', digest: 'x2' }, { version: 3, state: 'held', digest: 'x3' }]);
    expect(r.consistent).toBe(true);
    expect(r.versions.map((v) => `${v.version}:${v.event}:${v.state}`)).toEqual(['1:programme.opened:planned', '2:programme.held:held', '3:programme.domain_drafted:held']);
    expect(r.versions[2]!.target_domain_id).toBe('d');
  });
  it('a tampered or missing version is a mismatch, said', () => {
    expect(replayProgramme(events, [{ version: 1, state: 'planned', digest: 'x1' }, { version: 2, state: 'in_progress', digest: 'x2' }, { version: 3, state: 'held', digest: 'zz' }]).mismatches)
      .toEqual(['v2: state held replayed, in_progress stored', 'v3: digest differs']);
    expect(replayProgramme([ev(1, 'programme.opened', 'planned', 'x1'), ev(3, 'programme.held', 'held', 'x3')]).mismatches).toEqual(['event 2 (programme.held) produced v3, expected v2']);
  });
});

describe('the PDP rules of §ON (exact; the customer authority approves, the lead never)', () => {
  const pdp = new PdpService();
  const ctx = { scope: 'DOMAIN' as const, tenantId: 't', domainId: 'd' };
  const ask = (action: string, roles: Array<[string, 'TENANT' | 'DOMAIN']>, kind: 'human' | 'agent' = 'human') => pdp.evaluate({
    principal: { principalId: 'p', kind, assurance: 'password', bindings: roles.map(([roleCode, scope]) => ({ roleCode, scope, tenantId: 't', domainId: scope === 'DOMAIN' ? 'd' : null })) },
    delegationId: null, action, objectType: null, objectId: null, purposeId: 'onboarding', context: ctx, consequenceClass: 'C2', environment: { deployment: 'local-dev', clockQuality: 'trusted' } });
  it('the baseline decision: the onboarding authority only, human-gated; the lead and the sponsor denied', () => {
    expect(ask('onboarding.baseline.decide', [['onboarding_authority', 'TENANT']])).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
    expect(ask('onboarding.baseline.decide', [['implementation_lead', 'TENANT']]).decision).toBe('deny');
    expect(ask('onboarding.baseline.decide', [['customer_sponsor', 'TENANT']]).decision).toBe('deny');
    expect(ask('onboarding.baseline.capture', [['implementation_lead', 'TENANT']]).decision).toBe('allow');
    expect(ask('onboarding.baseline.capture', [['onboarding_authority', 'TENANT']]).decision).toBe('deny');
  });
  it('the sponsor intent is the sponsor\'s (human-gated); withdrawal the sponsor\'s or the tenant admin\'s (human-gated); the drift record the attention agent\'s too', () => {
    expect(ask('onboarding.intent.record', [['customer_sponsor', 'TENANT']])).toMatchObject({ decision: 'allow_with_obligations' });
    expect(ask('onboarding.intent.record', [['implementation_lead', 'TENANT']]).decision).toBe('deny');
    expect(ask('onboarding.programme.withdraw', [['implementation_lead', 'TENANT']]).decision).toBe('deny');
    expect(ask('onboarding.programme.withdraw', [['tenant_admin', 'TENANT']])).toMatchObject({ obligations: [{ type: 'human_gate' }] });
    expect(ask('onboarding.baseline.drift', [['attention_agent', 'DOMAIN']], 'agent').decision).toBe('allow');
    expect(ask('onboarding.step.revert', [['customer_sponsor', 'TENANT']]).decision).toBe('deny');
  });
  it('no prefix leaks: an action near a rule has no rule; the draft domain is the tenancy.domain. prefix rule\'s (tenant admin)', () => {
    expect(ask('onboarding.baseline.decide.force', [['onboarding_authority', 'TENANT']]).decision).toBe('indeterminate');
    expect(ask('onboarding.programme', [['implementation_lead', 'TENANT']]).decision).toBe('indeterminate');
    expect(ask('tenancy.domain.draft', [['tenant_admin', 'TENANT']]).decision).toBe('allow');
    expect(ask('tenancy.domain.draft', [['implementation_lead', 'TENANT']]).decision).toBe('deny');
  });
});

describe('the refusal texts through the central mapper (class → status)', () => {
  const status = (message: string, code = '22023') => asObservationRefusal(Object.assign(new Error(message), { code }), 'c')?.getStatus() ?? null;
  it('403 / 404 / 409 / 422', () => {
    expect(status('config baseline rejected (separation_of_duties): an implementation lead never approves or accepts on the customer\'s behalf (approving a configuration baseline)', '42501')).toBe(403);
    expect(status('sponsor intent rejected (actor): the sponsor intent is a named human sponsor\'s own record', '42501')).toBe(403);
    expect(status('onboarding programme rejected (ownership): the owner of a programme is an active implementation lead', '42501')).toBe(403);
    expect(status('onboarding step rejected (unknown_record): no domain x is recorded in this tenant')).toBe(404);
    expect(status('onboarding programme rejected (unknown_programme): x is not an onboarding programme of this tenant')).toBe(404);
    expect(status('config baseline rejected (stale): the decision names digest x')).toBe(409);
    expect(status('onboarding step rejected (held): programme p is held (r)')).toBe(409);
    expect(status('domain draft rejected (duplicate): the tenant already has a domain named x')).toBe(409);
    expect(status('onboarding step rejected (compensation): a done step names the governed act that would reverse it')).toBe(422);
    expect(status('onboarding programme rejected (unchanged): the revision changes nothing of v2')).toBe(422);
  });
});
