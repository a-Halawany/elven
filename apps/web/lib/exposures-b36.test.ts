import { describe, expect, it } from 'vitest';
import { learningLine } from './exposures';

/** CP-6 B36 (0094 §C5): the learn step is worded from the server's record (the expected bracket, the review's outcomes, the basis change). */
describe('B36 collab · the learn step in words', () => {
  it('expected → happened → what changes in the basis', () => {
    expect(learningLine({ basis_version: 1, expected: { note: 'a two-week stop', probability: { low: 0.3, high: 0.6 }, impact: { low: 400000, high: 900000, unit: 'EUR' } },
      observed: { note: 'three days of line stop', effect: 'partly_effective' }, basis_change: 'the buffer, not the route, binds' }))
      .toBe('expected (v1: p 0.3–0.6, impact 400000–900000 EUR; a two-week stop) → happened (partly_effective; three days of line stop) → basis changes: the buffer, not the route, binds');
    expect(learningLine({ basis_version: 2, expected: { note: 'a qualified supplier in 12 weeks', plausibility: 'medium', impact: null }, observed: { note: 'the first article passed', effect: 'effective' }, basis_change: 'twelve weeks is the right window' }))
      .toBe('expected (v2: plausibility medium; a qualified supplier in 12 weeks) → happened (effective; the first article passed) → basis changes: twelve weeks is the right window');
    expect(learningLine({ basis_version: null, expected: { note: 'x' }, observed: { note: 'y' }, basis_change: 'z' })).toBe('expected (v?: no bracket; x) → happened (; y) → basis changes: z');
  });
});
