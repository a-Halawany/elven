/*
 * CP-6 B18 (0078; design §3.3, C9, N-d) · the lifecycle ports' refusals answer as what they are.
 *
 * The three new families — `forecast withdrawal rejected`, `run invalidation rejected`, `reopen rejected` — and the three
 * single texts of the chain (a second commitment over a standing one, a withdrawal over a standing commitment, a scenario
 * declared on a withdrawn forecast) are driven through the mapper with the exact SQLSTATE + message pairs the migration
 * raises, and the ORDER is probed: the B9 alternations are matched 403 → 404 → 409 → 422, so a text of the record's
 * state must land in the 409 row before the family's 422 fallback catches it, and the executive's own `withdrawal
 * rejected` family (a request's withdrawal) must answer exactly as it did before B18.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), body: r.getResponse() as { code: string; message: string } };
};
const RUN = '0190b1c2-d3e4-7000-8000-000000000001'; const FCT = '0190b1c2-d3e4-7000-8000-000000000002'; const PKG = '0190b1c2-d3e4-7000-8000-000000000003';

describe('B18 · the standing (403): the acting principal, the owner, the reproduction\'s context', () => {
  it('each family\'s "recorded by the acting principal", the owner-only reopen and the trigger/context mismatch answer 403 with the port\'s sentence', () => {
    for (const m of [
      'forecast withdrawal rejected: recorded by the acting principal',
      'run invalidation rejected: recorded by the acting principal',
      'reopen rejected: recorded by the acting principal',
      'reopen rejected: the package owner reopens it',
      'run invalidation rejected: a reproduction invalidates under simulation.reproduce with trigger reproduction; a person under simulation.run.invalidate with trigger operator (context simulation.run.invalidate, trigger reproduction)',
    ]) {
      const a = answer('42501', m);
      expect(a?.status, m).toBe(403);
      expect(a?.body.code, m).toBe('EYE-AUT-001');
      expect(a?.body.message, m).toBe(m);
    }
  });
});

describe('B18 · the absences (404): no such forecast, run, package, note, breach; a reference that is not an unreproducible reproduction', () => {
  it('answer 404 with the port\'s sentence', () => {
    for (const m of [
      `forecast withdrawal rejected: no such forecast ${FCT} in this domain`,
      `run invalidation rejected: no such run ${RUN} in this domain`,
      `run invalidation rejected: ${RUN} is not an unreproducible reproduction of run ${RUN}`,
      'reopen rejected: no such package in this domain',
      `reopen rejected: no such note ${RUN} on package ${PKG}`,
      `reopen rejected: no such breach ${RUN} on package ${PKG}`,
    ]) {
      const a = answer('23503', m);
      expect(a?.status, m).toBe(404);
      expect(a?.body.code, m).toBe('EYE-STA-001');
      expect(a?.body.message, m).toBe(m);
    }
  });
});

describe('B18 · the record\'s state (409), placed before the families\' 422 fallback', () => {
  it('a forecast withdrawn, superseded or not issued; a run already invalidated or not completed; a package reopened, closed, not committed, with an open draft, or without a recorded cause', () => {
    for (const m of [
      `forecast withdrawal rejected: forecast ${FCT} is withdrawn (at 2026-09-17T09:00:00Z, calibration_failure)`,
      `forecast withdrawal rejected: forecast ${FCT} is superseded by ${RUN}; the successor is the live one — withdraw that`,
      `forecast withdrawal rejected: forecast ${FCT} is resolved, not issued`,
      `run invalidation rejected: run ${RUN} is already invalidated (at 2026-09-17T09:00:00Z, trigger operator)`,
      `run invalidation rejected: run ${RUN} is opened, not completed — only a completed result is invalidated (an opened run has no result; a failed one none to withdraw)`,
      `reopen rejected: package ${PKG} is reopened with version 2 open; propose and commit it before reopening again`,
      `reopen rejected: package ${PKG} is closed; a closed decision is not reopened — a new package is declared`,
      `reopen rejected: package ${PKG} is proposed, not committed — a decision is reopened from its commitment; a draft or a proposal is versioned`,
      'reopen rejected: the package already has an open draft; propose it or withdraw it',
      `reopen rejected: no recorded cause — note ${RUN} was recorded at 2026-09-01T00:00:00Z, before the commitment at 2026-09-02T00:00:00Z; what was known at the decision is not a cause to reopen it`,
      `reopen rejected: no recorded cause — breach ${RUN} is of version 1, not the standing commitment (version 2)`,
    ]) {
      const a = answer('22023', m);
      expect(a?.status, m).toBe(409);
      expect(a?.body.code, m).toBe('EYE-STA-002');
      expect(a?.body.message, m).toBe(m);
    }
  });
  it('the chain\'s three single texts: a second commitment over a standing one (C5), a withdrawal over a standing commitment (C9), a scenario on a withdrawn forecast (N-d)', () => {
    for (const m of [
      'commitment rejected: package is already committed at version 1 and the commitment stands; a committed decision is reopened (decision.package.reopen), never re-committed over',
      'commitment rejected: package is already committed at version 1 and the commitment stands; a committed decision is reopened, never re-committed over',
      `withdrawal rejected: package ${PKG} was committed at version 1 and the commitment stands; a reopened decision is re-committed, not withdrawn`,
      `scenario rejected: forecast ${FCT} was withdrawn as unfit`,
    ]) {
      const a = answer('22023', m);
      expect(a?.status, m).toBe(409);
      expect(a?.body.code, m).toBe('EYE-STA-002');
      expect(a?.body.message, m).toBe(m);
    }
  });
  it('the executive\'s `withdrawal rejected` family is not shadowed: a request already withdrawn stays 409, its requester rule 403, the absence 404, and any other request withdrawal the caller\'s own 422', () => {
    expect(answer('22023', `withdrawal rejected: request ${RUN} is already withdrawn`)?.status).toBe(409);
    expect(answer('42501', 'withdrawal rejected: a request is withdrawn by its requester')?.status).toBe(403);
    expect(answer('42501', 'withdrawal rejected: recorded by the acting principal')?.status).toBe(403);
    expect(answer('23503', `withdrawal rejected: no request ${RUN} in this domain`)?.status).toBe(404);
    expect(answer('22023', 'withdrawal rejected: a request is withdrawn with a reason')?.status).toBe(422);
    // The pre-C9 wording of the package withdrawal (the state named without the version) is the caller's request, as the design stated.
    expect(answer('22023', 'withdrawal rejected: a reopened decision is re-committed, not withdrawn; its commitment stands')?.status).toBe(422);
  });
});

describe('B18 · the caller\'s own request (422)', () => {
  it('a reason too short, an unknown unfit class, a malformed cause, an unknown trigger', () => {
    for (const m of [
      'forecast withdrawal rejected: a withdrawal states its reason (at least 8 characters)',
      'forecast withdrawal rejected: unfit_class is one of calibration_failure, data_shift, drift, envelope_breach, input_withdrawn, method_unfit, owner_judgement',
      'run invalidation rejected: an invalidation states its reason (at least 8 characters)',
      'run invalidation rejected: the trigger is operator (a person\'s act) or reproduction (an unreproducible verdict)',
      'reopen rejected: a cause is a recorded input_invalidated note or a condition_breach of this package, named by its id ({kind, ref})',
    ]) {
      const a = answer('22023', m);
      expect(a?.status, m).toBe(422);
      expect(a?.body.code, m).toBe('EYE-REQ-001');
      expect(a?.body.message, m).toBe(m);
    }
  });
  it('the mapper stays gated on the SQLSTATE: the same text under a state the ports never raise is not a refusal', () => {
    expect(answer('XX000', 'reopen rejected: the package owner reopens it')).toBeNull();
    expect(answer('42P01', 'forecast withdrawal rejected: recorded by the acting principal')).toBeNull();
  });
  it('no earlier named rule catches a lifecycle text: the message answered is the port\'s own, never a Phase 5 sentence', () => {
    for (const [code, m] of [
      ['22023', `run invalidation rejected: run ${RUN} is failed, not completed — only a completed result is invalidated (an opened run has no result; a failed one none to withdraw)`],
      ['23503', `run invalidation rejected: no such run ${RUN} in this domain`],
      ['22023', `scenario rejected: forecast ${FCT} was withdrawn as unfit`],
    ] as const) {
      const a = answer(code, m);
      expect(a?.body.message, m).toBe(m);
    }
  });
});
