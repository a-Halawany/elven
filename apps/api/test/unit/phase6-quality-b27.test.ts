/**
 * CP-6 B27 §Q (0097) — the pure logic of the quality part: the validators word a request's fault before any port is reached; the refusal
 * families `scenario quality rejected (<class>)`, `branch probability rejected (<class>)` and `frequency map rejected (<class>)` map to
 * honest answers through the observation mapper (every port text run through it, the SQLSTATE the port raises beside it); the older
 * `scenario rejected`, `branch rejected` and `coherence check rejected` texts keep their behaviour.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PROBABILITY_METHODS, QUALITY_FAIL_RULES_V1, QUALITY_NOTE_RULES_V1, QUALITY_TRIGGERS, SCENARIO_QUALITY_ORDER, SCENARIO_QUALITY_STEP, bandLine, validateMap, validateProbability, validateTrigger,
  validateWithdrawal } from '../../src/prediction/scenarios/quality/quality.service.js';

const C = '0190b1c2-d3e4-7000-8000-0000000000c0';
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); } catch (e) { if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) }; throw e; }
  throw new Error('the validator should have refused');
};
const mapped = (message: string, code = '22023'): { status: number | null; message: string } => {
  const e = asObservationRefusal({ code, message }, C);
  return e === null ? { status: null, message } : { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) };
};
const BANDS = [{ frequency_label: 'rare', min_per_year: 0, max_per_year: 0.2, probability_low: 0, probability_high: 0.05 }, { frequency_label: 'often', min_per_year: 0.2, max_per_year: null, probability_low: 0.05, probability_high: 0.5 }];
const ELICIT = { elicitation: { experts: ['N. Eriksen'], question: 'is it likely?', elicited_at: '2026-09-29T10:00:00Z', record: 'a recorded session (SYNTHETIC)' } };

describe('the vocabularies and the step are the migration\'s', () => {
  it('the step scenario-quality at order 68; the triggers, the methods, the v1 rules by outcome', () => {
    expect([SCENARIO_QUALITY_STEP, SCENARIO_QUALITY_ORDER]).toEqual(['scenario-quality', 68]);
    expect([...QUALITY_TRIGGERS]).toEqual(['declare', 'branch', 'operator']);
    expect([...PROBABILITY_METHODS]).toEqual(['frequency_map', 'expert_elicitation', 'model']);
    expect([...QUALITY_FAIL_RULES_V1]).toEqual(['indistinct_branches', 'collapse_to_one_forecast', 'prohibited_contradiction', 'element_temporal_order', 'indicator_missing', 'indicator_stale']);
    expect([...QUALITY_NOTE_RULES_V1]).toEqual(['coverage', 'bias', 'signpost_shared', 'review_overdue']);
    expect(bandLine(0.05, 0.3)).toBe('5%–30%');
  });
});

describe('the validators word the fault before any port', () => {
  it('the trigger: operator by default; declare and branch accepted; the tick\'s own refused', () => {
    expect(validateTrigger({}, C)).toBe('operator');
    expect(validateTrigger({ trigger: 'branch' }, C)).toBe('branch');
    expect(status(() => validateTrigger({ trigger: 'tick' }, C))).toMatchObject({ status: 422, message: expect.stringMatching(/^scenario quality rejected \(trigger\)/) });
  });
  it('a map: its name, horizon and bands (the port judges contiguity and order); the last band unbounded as null', () => {
    expect(validateMap({ name: ' Corridor map ', horizon: 'a year', bands: BANDS }, C)).toMatchObject({ name: 'Corridor map', horizon: 'a year', owner: null, bands: [{ max_per_year: 0.2 }, { max_per_year: null }] });
    expect(status(() => validateMap({ name: 'xy', horizon: 'a year', bands: BANDS }, C)).message).toMatch(/^frequency map rejected \(name\)/);
    expect(status(() => validateMap({ name: 'Corridor map', horizon: '', bands: BANDS }, C)).message).toMatch(/^frequency map rejected \(horizon\)/);
    expect(status(() => validateMap({ name: 'Corridor map', horizon: 'a year', bands: [] }, C)).message).toMatch(/^frequency map rejected \(bands\)/);
    expect(status(() => validateMap({ name: 'Corridor map', horizon: 'a year', bands: [{ frequency_label: 'x', min_per_year: '0' }] }, C)).message).toMatch(/^frequency map rejected \(bands\): band 1/);
  });
  it('a probability: the method, the basis, never narrative; the band only off the map; the map only on it', () => {
    expect(validateProbability({ method: 'frequency_map', mapId: C, basis: { frequency_per_year: 1, observation: 'the log (SYNTHETIC)' } }, C)).toMatchObject({ method: 'frequency_map', low: null, high: null, mapId: C });
    expect(validateProbability({ method: 'expert_elicitation', low: 0.1, high: 0.2, basis: ELICIT }, C)).toMatchObject({ low: 0.1, high: 0.2, mapId: null });
    expect(status(() => validateProbability({ method: 'guess', basis: {} }, C)).message).toMatch(/^branch probability rejected \(method\)/);
    expect(status(() => validateProbability({ method: 'model', low: 0.1, high: 0.2, basis: { narrative: 'it reads likely' } }, C)).message).toMatch(/^branch probability rejected \(narrative\): a probability is never derived from narrative text/);
    expect(status(() => validateProbability({ method: 'model', low: 0.1, high: 0.2 }, C)).message).toMatch(/^branch probability rejected \(basis\)/);
    expect(status(() => validateProbability({ method: 'frequency_map', mapId: C, low: 0.1, basis: {} }, C)).message).toMatch(/^branch probability rejected \(band\): the frequency_map method computes the band/);
    expect(status(() => validateProbability({ method: 'model', low: 0.3, high: 0.2, basis: {} }, C)).message).toMatch(/^branch probability rejected \(band\): the model method states the band/);
    expect(status(() => validateProbability({ method: 'model', low: 0.1, high: 1.2, basis: {} }, C)).message).toMatch(/^branch probability rejected \(band\)/);
    expect(status(() => validateProbability({ method: 'frequency_map', basis: {} }, C)).message).toMatch(/^branch probability rejected \(map\): the frequency_map method names the map/);
    expect(status(() => validateProbability({ method: 'model', low: 0.1, high: 0.2, mapId: C, basis: {} }, C)).message).toMatch(/^branch probability rejected \(map\): only the frequency_map method names a map/);
  });
  it('a withdrawal says why (8+ characters)', () => {
    expect(validateWithdrawal({ reason: '  re-based the log  ' }, C)).toBe('re-based the log');
    expect(status(() => validateWithdrawal({ reason: 'short' }, C)).message).toMatch(/^branch probability rejected \(reason\)/);
  });
});

describe('the refusal families map to honest answers (the port\'s own texts, with their SQLSTATEs)', () => {
  it('403 for the acting principal and the authority; 404 for the absences; 409 for the state; 422 for the rest', () => {
    expect(mapped('scenario quality rejected (actor): an evaluation is recorded by the acting principal', '42501').status).toBe(403);
    expect(mapped('branch probability rejected (authority): a probability is set by a named human — the scenario\'s owner, the branch\'s owner or an administrator', '42501').status).toBe(403);
    expect(mapped('frequency map rejected (authority): a map is declared by a named, active human', '42501').status).toBe(403);
    expect(mapped('scenario quality rejected (unknown_scenario): x is not a scenario of this domain', '23503').status).toBe(404);
    expect(mapped('branch probability rejected (unknown_branch): x is not a branch of this domain', '23503').status).toBe(404);
    expect(mapped('branch probability rejected (unknown_run): x is not a simulation run of this domain', '23503').status).toBe(404);
    expect(mapped('branch probability rejected (unknown_map): x is not a frequency map of this domain', '23503').status).toBe(404);
    expect(mapped('frequency map rejected (unknown_owner): the owner x is not a named, active human of this tenant', '23503').status).toBe(404);
    expect(mapped('scenario quality rejected (state): scenario x is retired; only an active scenario is evaluated (declare a successor)').status).toBe(409);
    expect(mapped('branch probability rejected (state): branch "Strait closure" has no standing probability to withdraw').status).toBe(409);
    expect(mapped('branch probability rejected (state): map "Corridor" version 1 is superseded; use its current version').status).toBe(409);
    expect(mapped('frequency map rejected (state): a map version is immutable; only active → superseded by its next version').status).toBe(409);
    for (const t of ['scenario quality rejected (trigger): a person\'s evaluation is prompted by declare, branch or operator (the tick evaluates under its own step)',
      'branch probability rejected (narrative): a probability is never derived from narrative text — state the observed frequency, the elicitation record or the model run',
      'branch probability rejected (sum): the live branches\' lows would sum to 1.05 (the others 0.30 + this 0.75); they must not exceed 1',
      'branch probability rejected (basis): the model method names the simulation run (run_id)',
      'frequency map rejected (bands): band 2 starts at 1 per year; the bands are contiguous from 0 (each starts where the previous ends)']) {
      const m = mapped(t);
      expect(m.status, t).toBe(422);
      expect(m.message).toBe(t);
    }
  });
  it('the older families keep their behaviour (no row of this part reads them)', () => {
    expect(mapped('branch rejected (duplicate): x').status).toBe(409);
    expect(mapped('coherence check rejected: scenario x is retired; a retired scenario is not checked (declare a successor)').status).toBe(409);
  });
});
