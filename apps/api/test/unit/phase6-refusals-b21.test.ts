/*
 * CP-6 B21 (0081; corrections C1, C6; design-p3-api.md D3.8) · the foresight ports' refusals answer as what they are.
 *
 * The five families — `twin validation rejected`, `forecast assessment rejected`, `coherence check rejected`, `simulation
 * challenge rejected`, `run promotion rejected` — the upheld-challenge texts of `run invalidation rejected`, the two single
 * texts of the scenario gates (`scenario rejected: forecast … was assessed unfit`, `a failed coherence check prohibits
 * promotion …`) and the FIVE RUN GATES of simulation.open_run, which carry a class in parentheses (`run rejected
 * (unfit_twin|incoherent_scenario|envelope|envelope_ack|challenge): …`) so the named generic `run rejected: ` row (a fixed
 * sentence, 422) cannot catch them, are driven through the mapper with the exact SQLSTATE + message pairs the migration
 * raises and pinned status + code + `body.message === message`. The ORDER is probed: the B9 alternations are matched
 * 403 → 404 → 409 → 422, so a text of the record's state lands in the 409 row before the family's 422 fallback, the
 * `(envelope_ack)` class lands 403 and never on the 422 row's `\((envelope|challenge)\)`, `(challenge): no such …` lands 404
 * and `(challenge): … disputes run …` 422 — and the named rows (`run rejected: scenario … was retired by review`, B9's
 * `challenge rejected: claim …`) answer exactly as before B21. phase5-refusals.test.ts is not edited (C1).
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), body: r.getResponse() as { code: string; message: string } };
};
const TWIN = '0190b1c2-d3e4-7000-8000-000000000001'; const RUN = '0190b1c2-d3e4-7000-8000-000000000002'; const RUN2 = '0190b1c2-d3e4-7000-8000-000000000003';
const FCT = '0190b1c2-d3e4-7000-8000-000000000004'; const FCT2 = '0190b1c2-d3e4-7000-8000-000000000005'; const SCN = '0190b1c2-d3e4-7000-8000-000000000006';
const CHL = '0190b1c2-d3e4-7000-8000-000000000007'; const VAL = '0190b1c2-d3e4-7000-8000-000000000008'; const CHK = '0190b1c2-d3e4-7000-8000-000000000009';
const PRM = '0190b1c2-d3e4-7000-8000-00000000000a';

const expectAnswer = (code: string, m: string, status: number, body: string): void => {
  const a = answer(code, m);
  expect(a?.status, m).toBe(status);
  expect(a?.body.code, m).toBe(body);
  expect(a?.body.message, m).toBe(m);
};

describe('B21 · the standing (403): the acting principal, the owner\'s SoD, the decider\'s SoD, the reviewer, the envelope acknowledgement\'s holder', () => {
  it('each family\'s "recorded by the acting principal" and the SoD texts answer 403 with the port\'s sentence', () => {
    for (const m of [
      'twin validation rejected: recorded by the acting principal',
      'forecast assessment rejected: recorded by the acting principal',
      'coherence check rejected: recorded by the acting principal',
      'simulation challenge rejected: recorded by the acting principal',
      'run promotion rejected: recorded by the acting principal',
      `twin validation rejected: the twin's owner does not validate their own twin; another twin owner or the domain administrator validates version 1 of ${TWIN}`,
      `simulation challenge rejected: the decider is the challenge's opener; someone else decides challenge ${CHL}`,
      `simulation challenge rejected: the decider operated the challenged run ${RUN}; someone else decides challenge ${CHL}`,
      'simulation challenge rejected: a challenge is withdrawn by its opener',
      `run promotion rejected: the reviewer operated run ${RUN}; a result is promoted by someone else (OBJ-29)`,
      'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner\'s or the domain administrator\'s; the acting principal holds neither role in this domain (corridor_delay_days = 75 outside [0, 60])',
      // B18's row, unchanged: the widened context text of run invalidation (an upheld challenge under simulation.challenge.decide)
      `run invalidation rejected: a reproduction invalidates under simulation.reproduce with trigger reproduction; an upheld challenge under simulation.challenge.decide with trigger challenge; a person under simulation.run.invalidate with trigger operator (context simulation.run.invalidate, trigger challenge)`,
    ]) expectAnswer('42501', m, 403, 'EYE-AUT-001');
  });
});

describe('B21 · the absences (404): no such twin, version, forecast, scenario, run, challenge; a reference that is not an upheld challenge', () => {
  it('answer 404 with the port\'s sentence', () => {
    for (const m of [
      `twin validation rejected: no such twin ${TWIN} in this domain`,
      `twin validation rejected: no such version 1 of twin ${TWIN}`,
      `forecast assessment rejected: no such forecast ${FCT} in this domain`,
      `coherence check rejected: no such scenario ${SCN} in this domain`,
      `simulation challenge rejected: no such run ${RUN} in this domain`,
      `simulation challenge rejected: no such challenge ${CHL} in this domain`,
      `simulation challenge rejected: no such challenge ${CHL} of run ${RUN} in this domain`,   // C6: the three challenge ports are bound to the run
      `run promotion rejected: no such run ${RUN} in this domain`,
      `run rejected (challenge): no such challenge ${CHL} in this domain`,
      `run invalidation rejected: ${CHL} is not an upheld challenge of run ${RUN}`,
    ]) expectAnswer('23503', m, 404, 'EYE-STA-001');
  });
});

describe('B21 · the record\'s state (409), placed before the families\' 422 fallback', () => {
  it('a draft version; a withdrawn or superseded forecast; a retired scenario; a run not completed, invalidated, promoted or disputed; a challenge not live; the scenario gates; the run gates\' classes', () => {
    for (const m of [
      `twin validation rejected: version 1 of twin ${TWIN} is a draft, not admitted; a validation judges admitted state`,
      `forecast assessment rejected: forecast ${FCT} is withdrawn (calibration_failure); a withdrawn forecast is not assessed`,
      `forecast assessment rejected: forecast ${FCT} is superseded by ${FCT2}; assess the successor`,
      `coherence check rejected: scenario ${SCN} is retired; a retired scenario is not checked (declare a successor)`,
      `simulation challenge rejected: run ${RUN} is opened, not completed — there is no result to dispute`,
      `simulation challenge rejected: run ${RUN} is invalidated (at 2026-09-23T09:00:00Z, trigger operator) — nothing to dispute`,
      `simulation challenge rejected: challenge ${CHL} of run ${RUN} by this opener is live; it is decided or withdrawn before another is opened`,
      `simulation challenge rejected: challenge ${CHL} is upheld, not open; a re-run is requested on an open challenge`,
      `simulation challenge rejected: challenge ${CHL} is dismissed; only a live challenge is withdrawn`,
      `simulation challenge rejected: challenge ${CHL} is withdrawn; only a live challenge is decided`,
      `run promotion rejected: run ${RUN} is opened, not completed`,
      `run promotion rejected: run ${RUN} is invalidated (at 2026-09-23T09:00:00Z, trigger challenge); an invalidated result is not promoted`,
      `run promotion rejected: run ${RUN} was promoted already (promotion ${PRM}, for "the corridor decision"); a promotion is recorded once`,
      `run promotion rejected: challenge ${CHL} of run ${RUN} is open — a disputed result is not promoted until the challenge is decided or withdrawn`,
      `scenario rejected: forecast ${FCT} was assessed unfit (calibration_failure)`,
      `a failed coherence check prohibits promotion to simulation: scenario ${SCN} failed check ${CHK} (duplicate_branch); resolve the findings and review again`,
      `run rejected (unfit_twin): twin version 1 of twin ${TWIN} is unfit (validation ${VAL}); behaviours are disabled until a later validation finds it fit or indeterminate`,
      `run rejected (incoherent_scenario): scenario ${SCN} failed its coherence check ${CHK} (duplicate_branch); a branch of an incoherent scenario is not simulated until a review resolves it`,
      `run rejected (challenge): challenge ${CHL} is not awaiting a re-run (state upheld)`,
      `run rejected (challenge): challenge ${CHL} is not awaiting a re-run (run ${RUN2} is its re-run)`,
    ]) expectAnswer('22023', m, 409, 'EYE-STA-002');
  });
});

describe('B21 · the caller\'s own request (422)', () => {
  it('a verdict, a trigger, a kind or a decision outside the vocabulary; a reason, a case, a note or a use too short; a malformed disputed list; a version outside its envelope validated fit; the envelope and the re-run\'s naming', () => {
    for (const m of [
      'twin validation rejected: the verdict is fit, unfit or indeterminate',
      'twin validation rejected: a validation states its reason (at least 8 characters)',
      'twin validation rejected: a version outside its operating envelope is not fit (corridor_delay_days = 75 outside [0, 60]); validate it indeterminate or unfit, or change the envelope',
      'forecast assessment rejected: the trigger is outcome, subscription or operator',
      'coherence check rejected: the trigger is declare, review, subscription or operator',
      'simulation challenge rejected: a challenge disputes assumptions, model, constraints or interpretation',
      'simulation challenge rejected: a challenge states its case (at least 8 characters)',
      'simulation challenge rejected: disputed is a list of the keys, parameters or interpretation disputed',
      'simulation challenge rejected: a decision upholds or dismisses the challenge',
      'simulation challenge rejected: a decision states its note (at least 8 characters)',
      'run promotion rejected: a promotion states the use the result is fit for (at least 8 characters)',
      'run promotion rejected: a promotion states its note (at least 8 characters)',
      'run rejected (envelope): outside the operating envelope of supply-flow@1 (corridor_delay_days = 75 outside [0, 60]); a run outside the envelope needs a twin owner\'s or the domain administrator\'s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)',
      `run rejected (challenge): challenge ${CHL} disputes run ${RUN}; a re-run names it as the run it corrects (correctsRunId)`,
      // B18's row, unchanged: the widened trigger vocabulary of run invalidation
      'run invalidation rejected: the trigger is operator (a person\'s act), reproduction (an unreproducible verdict) or challenge (an upheld challenge)',
    ]) expectAnswer('22023', m, 422, 'EYE-REQ-001');
  });
});

describe('B21 · the ORDER (C1): the run gates\' classes land by B9\'s rows with the port\'s sentence; the named rows answer as before', () => {
  it('`run rejected (challenge): … disputes run …` is the caller\'s request (422) — not the 404 of "no such challenge" nor the 409 of "not awaiting a re-run"', () => {
    const m = `run rejected (challenge): challenge ${CHL} disputes run ${RUN}; a re-run names it as the run it corrects (correctsRunId)`;
    const a = answer('22023', m);
    expect(a?.status).toBe(422); expect(a?.body.code).toBe('EYE-REQ-001'); expect(a?.body.message).toBe(m);
  });
  it('`run rejected (envelope_ack): …` is the standing (403), never the 422 row\'s `\\((envelope|challenge)\\)`', () => {
    const m = 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner\'s or the domain administrator\'s; the acting principal holds neither role in this domain (corridor_delay_days = 75 outside [0, 60])';
    const a = answer('42501', m);
    expect(a?.status).toBe(403); expect(a?.body.code).toBe('EYE-AUT-001'); expect(a?.body.message).toBe(m);
  });
  it('`run rejected (envelope): …` is the caller\'s request (422) with the port\'s sentence — not the named generic row\'s fixed sentence', () => {
    const m = 'run rejected (envelope): outside the operating envelope of supply-flow@1 (corridor_delay_days = 75 outside [0, 60]); a run outside the envelope needs a twin owner\'s or the domain administrator\'s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)';
    const a = answer('22023', m);
    expect(a?.status).toBe(422); expect(a?.body.message).toBe(m);
    expect(a?.body.message).not.toMatch(/^a run needs an admitted twin version/);
  });
  it('the named generic `run rejected: ` rows are untouched: a retired scenario answers 409 with the FIXED B9-era sentence; any other `run rejected: ` text the fixed 422 sentence', () => {
    const retired = answer('22023', `run rejected: scenario ${SCN} was retired by review`);
    expect(retired?.status).toBe(409); expect(retired?.body.code).toBe('EYE-STA-002');
    expect(retired?.body.message).toBe('the scenario was retired by review; a retired branch is not simulated — declare a successor scenario and bind the run to it.');
    // a `run rejected: ` text no named row matches (the `version`/`twin version`/`scenario`/`branch`/agent rows are earlier, each its own): the generic row's fixed sentence
    const generic = answer('22023', 'run rejected: the behaviour model digest does not match the registered implementation');
    expect(generic?.status).toBe(422);
    expect(generic?.body.message).toBe('a run needs an admitted twin version, a registered behaviour model whose implementation digest matches, and — for a control — no intervention and no control reference.');
  });
  it('B9\'s review challenge (`challenge rejected: claim … has no lineage`) is untouched by `^simulation challenge rejected`: 409 as before', () => {
    const m = `challenge rejected: claim ${FCT} has no lineage`;
    const a = answer('22023', m);
    expect(a?.status).toBe(409); expect(a?.body.message).toBe(m);
    expect(answer('23503', `challenge rejected: no claim ${FCT} in this domain`)?.status).toBe(404);
    expect(answer('22023', 'challenge rejected: a challenge states its case')?.status).toBe(422);
  });
  it('`a failed coherence check prohibits promotion …` lands 409 before the B9 422 `^(a|an) (review outcome|…)` row', () => {
    const m = `a failed coherence check prohibits promotion to simulation: scenario ${SCN} failed check ${CHK} (duplicate_branch, temporal_order); resolve the findings and review again`;
    const a = answer('22023', m);
    expect(a?.status).toBe(409); expect(a?.body.code).toBe('EYE-STA-002'); expect(a?.body.message).toBe(m);
  });
  it('`run rejected (challenge): no such challenge …` is the absence (404), before the class\'s 409 and 422 rows', () => {
    const m = `run rejected (challenge): no such challenge ${CHL} in this domain`;
    const a = answer('23503', m);
    expect(a?.status).toBe(404); expect(a?.body.code).toBe('EYE-STA-001'); expect(a?.body.message).toBe(m);
  });
  it('the mapper stays gated on the SQLSTATE: the same text under a state the ports never raise is not a refusal', () => {
    expect(answer('XX000', 'twin validation rejected: recorded by the acting principal')).toBeNull();
    expect(answer('42P01', `run rejected (unfit_twin): twin version 1 of twin ${TWIN} is unfit (validation ${VAL}); behaviours are disabled until a later validation finds it fit or indeterminate`)).toBeNull();
  });
  it('no earlier named rule catches a B21 text: the message answered is the port\'s own, never a Phase 5 sentence', () => {
    for (const [code, m] of [
      ['23503', `simulation challenge rejected: no such run ${RUN} in this domain`],
      ['22023', `simulation challenge rejected: run ${RUN} is failed, not completed — there is no result to dispute`],
      ['22023', `twin validation rejected: version 2 of twin ${TWIN} is a draft, not admitted; a validation judges admitted state`],
      ['22023', `run rejected (incoherent_scenario): scenario ${SCN} failed its coherence check ${CHK} (assumption_invalid, forecast_relationship); a branch of an incoherent scenario is not simulated until a review resolves it`],
    ] as const) {
      const a = answer(code, m);
      expect(a?.body.message, m).toBe(m);
    }
  });
});
