import { describe, expect, it } from 'vitest';
import { caseLine, categoryMark, checkFaithfulness, contractLine, effectLine, groupByCategory, instantOf, parseSentences, statusLine, ITEM_CATEGORIES, type ExplanationItem } from './explanation-b35';

const item = (id: string, statement: string, material = false, category: ExplanationItem['category'] = 'model_inference'): ExplanationItem =>
  ({ id, category, role: material ? 'limitation' : 'support', ref: {}, field: null, statement, material, withheld: false });
const ITEMS = [item('I1', 'q50 42 transits/day at 30d'), item('I2', 'Validation: unvalidated — no accuracy is claimed', true, 'deterministic_transformation'), item('I3', 'Source "Corridor transits" observational', false, 'source_evidence')];

describe('explanation-b35 · the faithfulness preview (the server\'s check v1, the same rules)', () => {
  it('a rendering whose every sentence cites the items, states only their figures and cites every material item is FAITHFUL', () => {
    const r = checkFaithfulness(ITEMS, [{ text: 'The median is 42 transits a day on the observational source.', cites: ['I1', 'I3'] }, { text: 'It is unvalidated: no accuracy is claimed.', cites: ['I2'] }]);
    expect(r).toEqual({ faithful: true, findings: [] });
  });
  it('an uncited sentence, an unknown item, a figure no cited item states, hidden cognition, false certainty and an omitted material item are each a finding', () => {
    const r = checkFaithfulness(ITEMS, [
      { text: 'The corridor will certainly reopen next week.', cites: [] },
      { text: 'The model believes 43 transits a day is likely.', cites: ['I1', 'I9'] },
    ]);
    expect(r.faithful).toBe(false);
    expect(r.findings.map((f) => f.rule)).toEqual(['unsupported', 'false_certainty', 'unknown_item', 'unsupported_figure', 'hidden_cognition', 'omits_material']);
    expect(r.findings.at(-1)).toMatchObject({ sentence: null, items: ['I2'] });
  });
  it('an item id in the text is not a figure; a too-short sentence is a shape finding', () => {
    expect(checkFaithfulness([item('I1', 'no figure here')], [{ text: 'As I1 says, there is no figure.', cites: ['I1'] }]).faithful).toBe(true);
    expect(checkFaithfulness(ITEMS, [{ text: 'Short', cites: ['I1'] }]).findings[0]).toMatchObject({ rule: 'shape', sentence: 1 });
  });
});

describe('explanation-b35 · the words', () => {
  it('parses one sentence per line with its trailing citations', () => {
    expect(parseSentences('The median is 42. [I1, I3]\n\n  Unvalidated. [I2]\nNo cites here')).toEqual([
      { text: 'The median is 42.', cites: ['I1', 'I3'] }, { text: 'Unvalidated.', cites: ['I2'] }, { text: 'No cites here', cites: [] }]);
  });
  it('every category keeps its place, with a glyph and words — never colour alone', () => {
    const g = groupByCategory(ITEMS);
    expect(g.map((x) => x.category)).toEqual([...ITEM_CATEGORIES]);
    expect(g.find((x) => x.category === 'agent_judgment')?.items).toEqual([]);
    expect(categoryMark('human_assessment')).toEqual({ glyph: '☺', text: 'Human assessment' });
    expect(categoryMark('other').text).toBe('other');
  });
  it('the read-time state says stale, superseded, contested and corrected in words', () => {
    const st = { state: 'current' as const, faithfulness_state: 'complete', superseded_by: null, stale: false, stale_reason: null, subject_digest_now: null, contested_by: [], corrected_by: [] };
    expect(statusLine(st)).toBe('CURRENT · faithfulness complete');
    expect(statusLine({ ...st, state: 'stale', stale: true })).toMatch(/^STALE — the subject moved/);
    expect(statusLine({ ...st, faithfulness_state: 'contested', contested_by: ['c1'] })).toMatch(/CONTESTED \(1 open case\)$/);
    expect(statusLine({ ...st, corrected_by: ['c1'] })).toMatch(/CORRECTED by an upheld appeal$/);
    expect(statusLine(undefined)).toBe('state unknown');
  });
  it('a case line names the deadline and OVERDUE; an effect line names reopen_required and the preserved original', () => {
    expect(caseLine({ state: 'under_review', outcome: null, deadline_at: '2026-10-15T09:00:00.000Z', overdue: true, closure: null })).toBe('under review · response due 2026-10-15 09:00 — OVERDUE');
    expect(caseLine({ state: 'closed', outcome: 'partly_upheld', deadline_at: '2026-10-15T09:00:00.000Z', overdue: false, closure: 'resolved' })).toBe('closed (resolved) — partly upheld');
    expect(effectLine({ kind: 'reopen_required', committed_version: 2 })).toMatch(/^REOPEN REQUIRED — the commitment \(v2\) stands/);
    expect(effectLine({ kind: 'correction_required', owning_layer: 'observation' })).toMatch(/observation layer — the original is preserved$/);
    expect(effectLine(null)).toBe('not adjudicated');
  });
  it('a contract field reads its items or its stated absence; a datetime-local becomes an instant', () => {
    expect(contractLine({ items: ['I1', 'I2'] })).toBe('items I1, I2');
    expect(contractLine({ missing: 'no sensitivity is recorded' })).toBe('MISSING: no sensitivity is recorded');
    expect(contractLine({ inapplicable: 'n/a here' })).toBe('INAPPLICABLE: n/a here');
    expect(instantOf('')).toBeNull();
    expect(instantOf('2026-10-15T09:00')).toMatch(/^2026-10-1[45]T\d\d:00:00\.000Z$/);
  });
});
