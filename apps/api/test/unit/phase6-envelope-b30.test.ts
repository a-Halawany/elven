/*
 * CP-6 B30 part `envelope` (0103 §EN; F-P5-04) — the pure pieces: the route intake (admission, concurrence, calibration tolerance, the
 * lifecycle state, the compatibility, the AI context), the drift rule restated, and EVERY refusal text the migration raises driven through
 * the mapper with its SQLSTATE: the families `exploratory admission rejected (<class>)`, `calibration rejected (<class>)` and `behaviour
 * model rejected (<class>)` answer 403 → 404 → 409 → 422 by class, with the port's own sentence; no older unanchored row catches them.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { driftOf, validateAdmission, validateCalibration, validateCompatibility, validateConcurrence, validateContext, validateModelState } from '../../src/twin/envelope/envelope.service.js';

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
const intake = (f: () => unknown): { status: number; message: string } => {
  try { f(); return { status: 0, message: '' }; } catch (e) {
    if (!(e instanceof HttpException)) throw e;
    return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message ?? '') };
  }
};
const RUN = '0190b1c2-d3e4-7000-8000-000000000b30'; const TWIN = '0190b1c2-d3e4-7000-8000-000000000b31';

describe('B30 §EN · the refusal family by class (the port\'s sentence, verbatim)', () => {
  it('403: the acting principal, the twin owner\'s ownership (the domain administrator), the steward\'s authority, the separation of duties', () => {
    for (const m of [
      'exploratory admission rejected (actor): recorded by the acting principal',
      'exploratory admission rejected (ownership): only a twin owner admits an outside-envelope run as exploratory — the twin\'s own owner or a twin owner of this domain; a domain administrator, an operator or a steward does not (the raised threshold)',
      'exploratory admission rejected (authority): a concurrence is a method steward\'s of this domain',
      `exploratory admission rejected (separation_of_duties): the concurrence is a second named human's — neither the twin owner who admitted run ${RUN} nor its operator`,
      'calibration rejected (actor): recorded by the acting principal',
      'behaviour model rejected (actor): recorded by the acting principal',
      'behaviour model rejected (authority): a behaviour model\'s lifecycle is set by a method steward of this domain',
      'behaviour model rejected (separation_of_duties): the steward who proposed supply-flow@1 does not approve it; another method steward approves',
    ]) expectAnswer('42501', m, 403, 'EYE-AUT-001');
  });
  it('404: the absences', () => {
    for (const m of [
      `exploratory admission rejected (unknown_run): ${RUN} is not a run of this domain`,
      `exploratory admission rejected (unknown_admission): run ${RUN} has no exploratory admission in this domain; a twin owner admits it first`,
      `calibration rejected (unknown_twin): ${TWIN} is not a twin of this domain`,
      'calibration rejected (unknown_model): no-such@1 is not a registered behaviour model',
      'behaviour model rejected (unknown_model): no-such@1 is not a registered behaviour model',
      'behaviour model rejected (unknown_kind): no-such-kind is not a twin kind of this domain',
    ]) expectAnswer('23503', m, 404, 'EYE-STA-001');
  });
  it('409: the record\'s state — not outside, a duplicate, the promotion gate unconcurred, a retired model, a lifecycle step that is not one', () => {
    for (const m of [
      `exploratory admission rejected (state): run ${RUN} reads INSIDE against the operating envelope of supply-flow@1; only an outside-envelope run is disabled for decision use and admitted as exploratory`,
      `exploratory admission rejected (state): run ${RUN} is opened; only a finished run is admitted as exploratory`,
      `exploratory admission rejected (duplicate): run ${RUN} was admitted as exploratory already; an admission is recorded once`,
      `exploratory admission rejected (unconcurred): run ${RUN} lies outside its operating envelope and is disabled for decision use; it is promoted only after a twin owner admits it as exploratory and a method steward concurs`,
      `exploratory admission rejected (unconcurred): run ${RUN} was admitted as exploratory (admission x) but no method steward has concurred; the promotion waits for the second named human`,
      'behaviour model rejected (state): supply-flow@1 is RETIRED in this domain (by x, at y: z); a run on a retired model is refused — a method steward re-proposes it, or the twin binds another model',
      'behaviour model rejected (state): supply-flow@1 is APPROVED in this domain; approved → retired is not a lifecycle step (proposed → approved | retired; approved → deprecated; deprecated → approved | retired; retired → proposed)',
    ]) expectAnswer('22023', m, 409, 'EYE-STA-002');
  });
  it('422: the caller\'s own request', () => {
    for (const m of [
      'exploratory admission rejected (reason): an admission states its reason (at least 8 characters)',
      'exploratory admission rejected (note): a concurrence states its note (at least 8 characters)',
      `calibration rejected (model): discrete-event@1 is neither the behaviour model of twin ${TWIN} (supply-flow@1) nor bound to it`,
      'calibration rejected (key): Bad Key is not an element key',
      'calibration rejected (tolerance): a tolerance declares exactly one of mape or mae, and optionally min_n',
      'behaviour model rejected (incompatible): supply-flow@1 is declared INCOMPATIBLE with the twin kind supply-chain (by x: y); the run is refused',
      'behaviour model rejected (lifecycle_state): a state is proposed, approved, deprecated or retired',
      'behaviour model rejected (compatible): a declaration says compatible true or false',
    ]) expectAnswer('22023', m, 422, 'EYE-REQ-001');
  });
  it('the older families are untouched: the unanchored `admission rejected: ` (colon) and `run rejected (envelope_ack)` answer as before', () => {
    expect(answer('42501', 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner\'s of this domain; the acting principal is not one (corridor_delay_days = 75 outside [0, 60])')?.status).toBe(403);
    expect(answer('22023', 'run rejected (envelope): outside the operating envelope of supply-flow@1 (corridor_delay_days = 75 outside [0, 60]); a run outside the envelope needs a twin owner\'s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)')?.status).toBe(422);
  });
});

describe('B30 §EN · the route intake (plain words; the ports judge the rest)', () => {
  it('the admission\'s reason and the concurrence\'s note are 8–2048 characters', () => {
    expect(validateAdmission({ reason: '  explore the stress case  ' }, 'c')).toEqual({ reason: 'explore the stress case' });
    expect(intake(() => validateAdmission({ reason: 'short' }, 'c'))).toEqual({ status: 422, message: 'exploratory admission rejected (reason): an admission states its reason (8-2048 characters)' });
    expect(intake(() => validateConcurrence({}, 'c')).message).toMatch(/^exploratory admission rejected \(note\)/);
  });
  it('the calibration: a uuid twin, name@version, an element key, exactly one of mape (0, 10] or mae > 0, minN 2..1000 — renamed min_n', () => {
    expect(validateCalibration({ twinId: TWIN, modelRef: 'supply-flow@1', key: 'outcome.line_stop_days:SYN-LINE-A1', tolerance: { mape: 0.2, minN: 3 } }, 'c'))
      .toEqual({ twinId: TWIN, modelRef: 'supply-flow@1', key: 'outcome.line_stop_days:SYN-LINE-A1', tolerance: { mape: 0.2, min_n: 3 } });
    expect(validateCalibration({ twinId: TWIN, modelRef: 'supply-flow@1', key: 'k', tolerance: { mae: 5 } }, 'c').tolerance).toEqual({ mae: 5 });
    const bad = (p: Record<string, unknown>) => intake(() => validateCalibration({ twinId: TWIN, modelRef: 'supply-flow@1', key: 'k', tolerance: { mape: 0.2 }, ...p }, 'c'));
    expect(bad({ twinId: 'x' }).message).toBe('calibration rejected (twin): a uuid is required');
    expect(bad({ modelRef: 'supply flow' }).message).toMatch(/^calibration rejected \(model\)/);
    expect(bad({ key: 'Bad Key' }).message).toMatch(/^calibration rejected \(key\)/);
    expect(bad({ tolerance: { mape: 0.2, mae: 1 } }).message).toMatch(/^calibration rejected \(tolerance\): a tolerance declares exactly one/);
    expect(bad({ tolerance: {} }).message).toMatch(/^calibration rejected \(tolerance\): a tolerance declares exactly one/);
    expect(bad({ tolerance: { mape: 11 } }).message).toMatch(/no greater than 10/);
    expect(bad({ tolerance: { mae: -1 } }).message).toMatch(/^calibration rejected \(tolerance\): the mae tolerance is a positive number$/);
    expect(bad({ tolerance: { mape: 0.2, minN: 1 } }).message).toBe('calibration rejected (tolerance): minN is an integer from 2 to 1000');
    expect(bad({ tolerance: { mape: 0.2, window: 3 } }).message).toBe('calibration rejected (tolerance): unknown tolerance field(s) window');
  });
  it('the lifecycle state, the compatibility, the AI context', () => {
    expect(validateModelState({ modelRef: 'supply-flow@1', state: 'deprecated', reason: 'superseded by v2' }, 'c')).toEqual({ modelRef: 'supply-flow@1', state: 'deprecated', reason: 'superseded by v2' });
    expect(intake(() => validateModelState({ modelRef: 'supply-flow@1', state: 'archived', reason: 'superseded by v2' }, 'c')).message).toMatch(/^behaviour model rejected \(lifecycle_state\)/);
    expect(validateCompatibility({ modelRef: 'supply-flow@1', kind: 'supply-chain', compatible: false, note: 'mis-states multi-tier chains' }, 'c')).toMatchObject({ compatible: false, kind: 'supply-chain' });
    expect(intake(() => validateCompatibility({ modelRef: 'supply-flow@1', kind: 'supply-chain', compatible: 'no', note: 'mis-states multi-tier chains' }, 'c')).message).toMatch(/^behaviour model rejected \(compatible\)/);
    expect(validateContext({ twinId: TWIN }, 'c')).toEqual({ twinId: TWIN, version: null });
    expect(validateContext({ twinId: TWIN, version: 3 }, 'c')).toEqual({ twinId: TWIN, version: 3 });
    expect(intake(() => validateContext({ twinId: TWIN, version: 0 }, 'c')).message).toBe('twin context rejected (version): the version is a positive integer');
  });
});

describe('B30 §EN · the drift rule (restated from twin.calibrate)', () => {
  it('insufficient below min_n (or without a MAPE under a MAPE tolerance); drifting over the tolerance; else stable', () => {
    expect(driftOf({ n: 0, mae: null, mape: null }, { mape: 0.2 })).toBe('insufficient');
    expect(driftOf({ n: 2, mae: 1, mape: 0.1 }, { mape: 0.2 })).toBe('insufficient');
    expect(driftOf({ n: 3, mae: 11, mape: 0.44 }, { mape: 0.2 })).toBe('drifting');
    expect(driftOf({ n: 3, mae: 11, mape: 0.44 }, { mape: 0.9 })).toBe('stable');
    expect(driftOf({ n: 3, mae: 11, mape: null }, { mape: 0.2 })).toBe('insufficient');
    expect(driftOf({ n: 1, mae: 200, mape: 0.06 }, { mae: 100, min_n: 2 })).toBe('insufficient');
    expect(driftOf({ n: 2, mae: 200, mape: 0.06 }, { mae: 100, min_n: 2 })).toBe('drifting');
  });
});
