/*
 * CP-6 B24 (0086 §markers; F-P6-07, V03-T-077) · the source-impact markers' refusals and rules, hermetic.
 *
 * The two GATES carry a class in parentheses — `commitment rejected (source_impact): …` (decision.commit_package) and
 * `run rejected (source_impact): …` (simulation.open_run) — so neither B18's `commitment rejected: package is already committed …`
 * 409 row nor the named generic `run rejected: ` 422 row (a fixed sentence) catches them: both answer 409 with the port's sentence.
 * The acknowledgement port's `source impact acknowledgement rejected …` family answers 403 → 404 → 409 → 422, and never lands on
 * B22's `source impact rejected` 422 row. The older rows answer exactly as before. The PDP: `decision.source_impact.acknowledge` is
 * EXACT, the decision authority's alone, human-gated, C2; `observation.source_impact.read` is EXACT (the catch-all `observation.`
 * rule, which admits the collection roles only, never answers it) and audited.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), body: r.getResponse() as { code: string; message: string } };
};
const expectAnswer = (code: string, m: string, status: number, body: string): void => {
  const a = answer(code, m);
  expect(a?.status, m).toBe(status);
  expect(a?.body.code, m).toBe(body);
  expect(a?.body.message, m).toBe(m);
};
const PKG = '0190b1c2-d3e4-7000-8000-000000000001'; const RUN = '0190b1c2-d3e4-7000-8000-000000000002'; const SRC = '0190b1c2-d3e4-7000-8000-000000000003';
const MRK = '0190b1c2-d3e4-7000-8000-000000000004'; const SCN = '0190b1c2-d3e4-7000-8000-000000000005'; const FCT = '0190b1c2-d3e4-7000-8000-000000000006';
const WHO = '0190b1c2-d3e4-7000-8000-000000000007';

describe('B24 · the two gates answer 409 with the port\'s sentence', () => {
  it('the commitment gate and the run gate (the record\'s state)', () => {
    expectAnswer('22023', `commitment rejected (source_impact): 2 active source-impact marker(s) bear on version 1 of package ${PKG} and are not acknowledged for this version — package ${PKG} (source ${SRC} degraded; marker ${MRK}); run ${RUN} (source ${SRC} degraded; marker ${MRK}); a decision authority acknowledges them for this version (decision.source_impact.acknowledge) before the commitment`, 409, 'EYE-STA-002');
    expectAnswer('22023', `run rejected (source_impact): scenario ${SCN} rests on forecast ${FCT} whose source is suspended (source ${SRC} suspended); a branch resting on a failed or suspended source is not simulated until the source recovers`, 409, 'EYE-STA-002');
    expectAnswer('22023', `run rejected (source_impact): scenario ${SCN} rests on forecast ${FCT} whose source is failed (source ${SRC} failed); a branch resting on a failed or suspended source is not simulated until the source recovers`, 409, 'EYE-STA-002');
  });
  it('the older rows answer exactly as before (B18\'s commitment 409; the generic run 422; B21\'s class gates)', () => {
    expectAnswer('22023', 'commitment rejected: package is already committed at version 1 and the commitment stands; a committed decision is reopened (decision.package.reopen), never re-committed over', 409, 'EYE-STA-002');
    const generic = answer('22023', 'run rejected: the controls offered are less restricted than the twin version\'s');
    expect(generic).toMatchObject({ status: 422, body: { code: 'EYE-REQ-001' } });
    expect(generic?.body.message).not.toMatch(/controls offered/);
    expectAnswer('22023', `run rejected (unfit_twin): twin version 1 of twin ${RUN} is unfit (validation ${MRK}); behaviours are disabled until a later validation finds it fit or indeterminate`, 409, 'EYE-STA-002');
    expectAnswer('22023', 'source impact rejected: nope is not a source health state', 422, 'EYE-REQ-001');
  });
});

describe('B24 · the acknowledgement port: 403 → 404 → 409 → 422', () => {
  it('the standing (403)', () => {
    for (const m of [
      'source impact acknowledgement rejected: recorded by the acting principal, never on behalf of another',
      'source impact acknowledgement rejected: a named, active human acknowledges a source impact',
      `source impact acknowledgement rejected: principal ${WHO} does not hold decision_authority at this scope; the authority who commits answers for a degraded source`,
    ]) expectAnswer('42501', m, 403, 'EYE-AUT-001');
  });
  it('the absences (404)', () => {
    for (const m of [
      'source impact acknowledgement rejected: no such package in this domain',
      `source impact acknowledgement rejected: no such version 3 of package ${PKG}`,
      `source impact acknowledgement rejected (unknown_marker): marker ${MRK} is not a source-impact marker of this domain`,
    ]) expectAnswer('23503', m, 404, 'EYE-STA-001');
  });
  it('the record\'s state (409)', () => {
    for (const m of [
      `source impact acknowledgement rejected (version_state): version 1 of package ${PKG} is committed (the package is committed); only a version not yet committed, rejected or superseded is acknowledged`,
      `source impact acknowledgement rejected (cleared): marker ${MRK} was cleared at 2026-09-25 10:00:00+00 (the source is healthy); there is nothing to acknowledge`,
    ]) expectAnswer('22023', m, 409, 'EYE-STA-002');
  });
  it('the caller\'s own request (422)', () => {
    for (const m of [
      'source impact acknowledgement rejected: a reason of 8 to 2000 characters says why the decision may rest on the degraded source',
      'source impact acknowledgement rejected: marker_ids is a list of 1 to 200 marker ids',
      `source impact acknowledgement rejected (not_bearing): marker ${MRK} (forecast ${FCT}) does not bear on version 1 of package ${PKG}`,
    ]) expectAnswer('22023', m, 422, 'EYE-REQ-001');
  });
});

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (over: Partial<PolicyInput> & { roles?: string[] }): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
               bindings: (over.roles ?? ['decision_authority']).map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action: 'decision.source_impact.acknowledge', objectType: 'DPK', objectId: null, purposeId: 'decision',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  ...over,
});

describe('B24 · the PDP rules', () => {
  const pdp = new PdpService();
  it('the acknowledgement: decision_authority only, human-gated, C2, exact', () => {
    const r = pdp.evaluate(input({}));
    expect(r.decision).toBe('allow_with_obligations');
    expect(r.obligations).toEqual([{ type: 'human_gate' }]);
    for (const role of ['decision_owner', 'decision_approver', 'executive', 'domain_admin', 'platform_admin', 'collection_manager']) {
      expect(pdp.evaluate(input({ roles: [role] })).decision, role).toBe('deny');
    }
    expect(pdp.evaluate(input({ consequenceClass: 'C3' })).decision).toBe('deny');
    for (const action of ['decision.source_impact', 'decision.source_impact.acknowledge.all', 'decision.source_impact.acknowledged']) {
      expect(pdp.evaluate(input({ action })).decision, action).toBe('indeterminate');
    }
  });
  it('the read: an exact audited rule the decision people hold; the collection agent (the catch-all\'s role) does not', () => {
    for (const role of ['decision_owner', 'decision_authority', 'executive', 'collection_manager', 'domain_analyst', 'forecast_owner', 'simulation_operator']) {
      const r = pdp.evaluate(input({ action: 'observation.source_impact.read', objectType: 'SRC', consequenceClass: 'C1', roles: [role] }));
      expect(r.decision, role).toBe('allow_with_obligations');
      expect(r.obligations, role).toEqual([{ type: 'audit_access' }]);
    }
    for (const role of ['collection_agent', 'decision_agent']) {
      expect(pdp.evaluate(input({ action: 'observation.source_impact.read', objectType: 'SRC', consequenceClass: 'C1', roles: [role] })).decision, role).toBe('deny');
    }
    // the catch-all still answers its own actions (nothing moved)
    expect(pdp.evaluate(input({ action: 'observation.run.open', objectType: 'SRC', roles: ['collection_agent'] })).decision).toBe('allow');
  });
});

describe('B24 (act-found) · the decision option and choice refusals answer 404 / 409 / 422, never 500', () => {
  it('the absent version, the immutable or closed version, and every other option or choice refusal', () => {
    expectAnswer('23503', 'option rejected: no such package version in this domain', 404, 'EYE-STA-001');
    expectAnswer('23503', 'choice rejected: no such package version in this domain', 404, 'EYE-STA-001');
    expectAnswer('2F002', 'option rejected: version 1 is committed and immutable; open a new version', 409, 'EYE-STA-002');
    expectAnswer('2F002', 'choice rejected: version 2 is approved and immutable; a different choice is a new version', 409, 'EYE-STA-002');
    expectAnswer('22023', `option rejected: version 1 of package ${PKG} is not an open draft`, 409, 'EYE-STA-002');
    expectAnswer('22023', `option rejected: run ${RUN} rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live forecast`, 422, 'EYE-REQ-001');
    expectAnswer('22023', `option rejected: forecast ${FCT} was withdrawn as unfit (data_shift: the corridor regime changed); a consequence cannot rest on it`, 422, 'EYE-REQ-001');
    expectAnswer('22023', 'choice rejected: at least one measurable outcome criterion is required', 422, 'EYE-REQ-001');
  });
});
