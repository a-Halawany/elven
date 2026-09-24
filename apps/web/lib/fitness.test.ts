import { describe, expect, it } from 'vitest';
import {
  COHERENCE_STATES, ENVELOPE_STATES, FITNESS_CLASSES, FITNESS_STATES,
  coherenceLabel, coherenceOf, envelopeKeyLines, envelopeLine, envelopeOf, fitnessLabel, fitnessOf,
} from './fitness';

/** CP-6 B21 (0081): the fitness, coherence and envelope words are the server's; a row from before 0081 reads as its honest default. */
describe('fitness is stated, never invented', () => {
  it('the vocabularies are the register\'s (design-p3 D1; corrections-3 contracts)', () => {
    expect([...FITNESS_STATES]).toEqual(['none', 'fit', 'unfit', 'indeterminate']);
    expect([...FITNESS_CLASSES]).toEqual(['calibration_failure', 'drift', 'data_shift', 'envelope_breach']);
    expect([...COHERENCE_STATES]).toEqual(['unchecked', 'passed', 'failed']);
    expect([...ENVELOPE_STATES]).toEqual(['inside', 'outside', 'unchecked', 'unrecorded']);
  });
  it('a row without a state, or with a word outside the vocabulary, is none / unchecked / unrecorded', () => {
    expect(fitnessOf(undefined)).toBe('none');
    expect(fitnessOf(null)).toBe('none');
    expect(fitnessOf('good')).toBe('none');
    expect(coherenceOf(undefined)).toBe('unchecked');
    expect(coherenceOf('ok')).toBe('unchecked');
    expect(envelopeOf(undefined)).toBe('unrecorded');
    expect(envelopeOf('within')).toBe('unrecorded');
  });
  it('a twin version reads FIT / UNFIT — behaviours disabled / INDETERMINATE / not validated as glyph + label + token (GLB-09)', () => {
    expect(fitnessLabel({ fitness_state: 'fit' }, 'twin')).toEqual({ glyph: '●', token: '--eye-color-success', text: 'FIT' });
    expect(fitnessLabel({ fitness_state: 'unfit' }, 'twin')).toEqual({ glyph: '✕', token: '--eye-color-critical', text: 'UNFIT — behaviours disabled' });
    expect(fitnessLabel({ fitness_state: 'indeterminate' }, 'twin')).toEqual({ glyph: '◍', token: '--eye-color-warning', text: 'INDETERMINATE' });
    expect(fitnessLabel({ fitness_state: 'none' }, 'twin').text).toBe('not validated');
    expect(fitnessLabel(undefined, 'twin').text).toBe('not validated');
    for (const s of FITNESS_STATES) expect(fitnessLabel({ fitness_state: s }, 'twin').token).toMatch(/^--eye-color-/);
  });
  it('a forecast\'s UNFIT names its class; none reads not assessed', () => {
    expect(fitnessLabel({ fitness_state: 'unfit', fitness_class: 'calibration_failure' }, 'forecast').text).toBe('UNFIT (calibration_failure)');
    expect(fitnessLabel({ fitness_state: 'unfit', fitness_class: 'envelope_breach' }, 'forecast').text).toBe('UNFIT (envelope_breach)');
    expect(fitnessLabel({ fitness_state: 'unfit', fitness_class: null }, 'forecast').text).toBe('UNFIT (class not recorded)');
    expect(fitnessLabel({ fitness_state: 'fit' }, 'forecast').text).toBe('FIT');
    expect(fitnessLabel({ fitness_state: 'indeterminate' }, 'forecast').text).toBe('INDETERMINATE');
    expect(fitnessLabel({}, 'forecast').text).toBe('not assessed');
  });
  it('a run\'s fit names the use it was promoted for (OBJ-29); unfit is the invalidation; none is a dash', () => {
    expect(fitnessLabel({ fitness_state: 'fit', promoted_for: 'the NORDWERK corridor routing decision' }, 'run').text).toBe('fit for the NORDWERK corridor routing decision');
    expect(fitnessLabel({ fitness_state: 'fit', promoted_for: null }, 'run').text).toBe('fit for a use the row does not name');
    expect(fitnessLabel({ fitness_state: 'unfit' }, 'run').text).toBe('UNFIT');
    expect(fitnessLabel({ fitness_state: 'none' }, 'run').text).toBe('—');
  });
  it('coherence reads PASSED / FAILED / unchecked', () => {
    expect(coherenceLabel('passed')).toEqual({ glyph: '●', token: '--eye-color-success', text: 'PASSED' });
    expect(coherenceLabel('failed')).toEqual({ glyph: '✕', token: '--eye-color-critical', text: 'FAILED' });
    expect(coherenceLabel('unchecked').text).toBe('unchecked');
    expect(coherenceLabel(undefined).text).toBe('unchecked');
  });
  it('the run\'s own envelope state is a different fact from a perturbation\'s; outside names its acknowledgement', () => {
    expect(envelopeLine({ envelope_state: 'inside' })).toBe('envelope inside');
    expect(envelopeLine({ envelope_state: 'unchecked' })).toBe('envelope unchecked (no numeric value to judge)');
    expect(envelopeLine({ envelope_state: 'unrecorded' })).toBe('envelope unrecorded (opened before 0081)');
    expect(envelopeLine({})).toBe('envelope unrecorded (opened before 0081)');
    expect(envelopeLine({ envelope_state: 'outside', envelope_ack: { acknowledged_by: '0192f1c2-aaaa-7000-8000-000000000001', reason: 'the 75-day delay is the stress case' } }))
      .toBe('envelope OUTSIDE (acknowledged by 0192f1c2…: the 75-day delay is the stress case)');
    expect(envelopeLine({ envelope_state: 'outside', envelope_ack: null })).toBe('envelope OUTSIDE (acknowledged by nobody named)');
  });
  it('the envelope keys of a recorded check render verbatim, sorted by key', () => {
    const lines = envelopeKeyLines({ keys: {
      horizon_days: { range: [1, 365], value: null, source: null, verdict: 'unchecked' },
      corridor_delay_days: { range: [0, 60], value: 14, source: 'shock.corridor_delay_days', verdict: 'inside' },
    } });
    expect(lines).toEqual([
      'corridor_delay_days = 14 inside [0, 60] (from shock.corridor_delay_days)',
      'horizon_days = no value unchecked [1, 365]',
    ]);
    expect(envelopeKeyLines(null)).toEqual([]);
    expect(envelopeKeyLines({ keys: { k: {} } })).toEqual(['k = no value unchecked [no range]']);
  });
});
