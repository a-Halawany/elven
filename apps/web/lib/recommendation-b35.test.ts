/**
 * The recommendation client's words (CP-6 B35 part `recommendation`, 0101 §R): the AI named as such, a state never by colour alone,
 * accepted FOR CONSIDERATION never a decision, the flags and the coverage in words, the component lines parsed.
 */
import { describe, expect, it } from 'vitest';
import { authorMark, completenessWords, coverageWords, flagWords, linesOf, sourcedOf, stateMark, type Completeness, type Coverage } from './recommendation-b35';

describe('B35 recommendation · the words', () => {
  it('the author: the Decision Agent is named as AI that drafts and never decides; a human as a named human', () => {
    expect(authorMark('agent').text).toBe('DECISION AGENT (AI) — drafted, never decides');
    expect(authorMark('human').text).toBe('NAMED HUMAN');
  });
  it('a state as glyph, token and words — accepted for consideration is not a decision', () => {
    expect(stateMark('accepted_for_consideration')).toEqual({ glyph: '●', token: '--eye-color-success', text: 'ACCEPTED FOR CONSIDERATION — not a decision' });
    expect(stateMark('proposed').text).toBe('AWAITING REVIEW');
    expect(stateMark('superseded').glyph).toBe('↷');
    expect(stateMark('odd').text).toBe('ODD');
  });
  it('the flags and the coverage in words', () => {
    expect(flagWords({ class: 'scenario_quality', detail: 'scenario Q fails' })).toBe('SCENARIO QUALITY FAILED — scenario Q fails');
    expect(flagWords({ class: 'run_indicator', indicator: 'constraint_indeterminate', detail: 'store unreachable' })).toBe('INDICATOR CONSTRAINT INDETERMINATE — store unreachable');
    const cov: Coverage = { basis: 'cited_scenarios', option_key: 'stage', share: 2 / 3, label: 'DECISION COVERAGE 2 of 3 live branch(es) (67%)',
      live_branches: [], assessed: [], unassessed: [{ branch_id: 'b', name: 'Insurer withdrawal', kind: 'disruption' }] };
    expect(coverageWords(cov)).toBe('DECISION COVERAGE 2 of 3 live branch(es) (67%) — not assessed on: Insurer withdrawal');
    expect(coverageWords({ ...cov, unassessed: [] })).toMatch(/every live branch assessed$/);
    expect(coverageWords({ ...cov, share: null, label: 'DECISION COVERAGE not applicable' })).toBe('DECISION COVERAGE not applicable');
    expect(coverageWords(null)).toBe('decision coverage not read');
  });
  it('the completeness in words, naming what was not assessed', () => {
    const c = { label: 'INCOMPLETE: 2 gap(s) — alternatives, evidence', not_assessed: [{ category: 'explanation', reason: 'absent' }] } as unknown as Completeness;
    expect(completenessWords(c)).toBe('INCOMPLETE: 2 gap(s) — alternatives, evidence (not assessed: explanation)');
    expect(completenessWords(null)).toBe('completeness not read');
  });
  it('the component lines: "kind:ref | statement", a bare line a stated source', () => {
    expect(sourcedOf('run:abc | the reroute run\nno source here', 'stated')).toEqual([
      { statement: 'the reroute run', source: { kind: 'run', ref: 'abc' } },
      { statement: 'no source here', source: { kind: 'stated', ref: 'stated by the author' } },
    ]);
    expect(sourcedOf('obligation | customs pre-clearance')).toEqual([{ statement: 'customs pre-clearance', source: { kind: 'obligation', ref: 'stated by the author' } }]);
    expect(linesOf(' a \n\n b ')).toEqual(['a', 'b']);
  });
});
