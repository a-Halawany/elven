/**
 * CP-6 B81 §CT — the content model's contract (vitest, node). The shared fixtures bind this copy, the API's content-lint.ts and the SQL ports
 * (phase6-terms-b81). Every text is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import fx from './content-b81.fixtures.json';
import en from '../messages/en.json';
import { CONTENT_LINT_RULES } from './b81-seams';
import {
  AUDIENCES, LIFECYCLE_TERMS, READING_CEILINGS, TRUTH_TERMS, combinesTruthAndLifecycle, commandLabelProblem, contentProblems, correctionView, destructiveProblem, dilutionProblem,
  errorTextProblem, explanationFor, helpHidesCondition, helpModel, lifecycleLabelProblem, productIdentityProblem, readingCheck, readingGrade, receiptProblem, receiptText, recoveryFor,
  resolveTerm, syllables, termFromCatalogue, titleProblem, truthSymbolId, type TermRecord,
} from './content-b81';

const T = (o: Partial<TermRecord>): TermRecord => ({ key: 'truth.assessed', label: 'ASSESSED', definition: 'Reviewed analytical judgment with uncertainty', locale: 'en', version: 1, state: 'published',
  explanations: { executive: 'ASSESSED means a reviewer judged it; uncertainty remains.' }, category: 'truth_state', protectedWords: ['uncertainty'], synonyms: [], example: 'An ASSESSED claim', conditions: [],
  cites: [], glossaryKeys: [], digest: 'd'.repeat(64), translation: null, correction: null, ...o });

describe('the shared fixtures (the API copy and the SQL ports assert the same values)', () => {
  it('the reading grade is deterministic and exact to the tenth', () => {
    for (const r of fx.readingGrade) expect(readingGrade(r.text), r.text).toBe(r.grade);
    for (const s of fx.syllables) expect(syllables(s.word), s.word).toBe(s.n);
  });
  it('the five rules', () => {
    for (const c of fx.commandLabel) expect(commandLabelProblem(c.label) !== null, c.label).toBe(c.problem);
    for (const c of fx.destructive) expect(destructiveProblem(c.label, c.context) !== null, `${c.label} | ${c.context}`).toBe(c.problem);
    for (const c of fx.errorText) expect(errorTextProblem(c.text) !== null, c.text).toBe(c.problem);
    for (const c of fx.title) expect(titleProblem(c.title) !== null, c.title).toBe(c.problem);
    for (const c of fx.dilution) expect(dilutionProblem(c.label, c.definition, c.protected, c.explanations as unknown as Record<string, string>)).toBe(c.problem);
  });
  it('the rule ids are the seams\' and contentProblems applies them by kind', () => {
    expect([...CONTENT_LINT_RULES]).toEqual(['verb-object', 'destructive-scope', 'error-recovery', 'no-dilution', 'title-noun-phrase']);
    expect(contentProblems({ kind: 'command', text: 'Withdraw' }).map((p) => p.rule)).toEqual(['verb-object', 'destructive-scope']);
    expect(contentProblems({ kind: 'command', text: 'Close warning', context: 'The warning stays recorded; closing cannot be undone.' })).toEqual([]);
    expect(contentProblems({ kind: 'error', text: 'Failed.' })[0]!.rule).toBe('error-recovery');
    expect(contentProblems({ kind: 'title', text: 'Manage terms' })[0]!.rule).toBe('title-noun-phrase');
  });
});

describe('GLB-20: the audience explanation never dilutes the term', () => {
  it('the audience\'s explanation when it keeps the canonical label and the protected words; else the DEFINITION, with the reason', () => {
    expect(explanationFor(T({}), 'executive')).toMatchObject({ fellBack: false, audience: 'executive' });
    expect(explanationFor(T({}), 'operator')).toMatchObject({ fellBack: true, text: 'Reviewed analytical judgment with uncertainty' });
    const diluted = explanationFor(T({ explanations: { executive: 'ASSESSED means it is basically known.' } }), 'executive');
    expect(diluted.fellBack).toBe(true);
    expect(diluted.reason).toMatch(/drops "uncertainty"/);
    expect(explanationFor(T({ explanations: { executive: 'ASSESSED is the final word; uncertainty is gone.' } }), 'executive').reason).toMatch(/certainty/);
  });
  it('the reading check names each audience\'s grade and ceiling', () => {
    expect(AUDIENCES).toEqual(['analyst', 'executive', 'operator']);
    expect(READING_CEILINGS).toEqual({ analyst: 14, executive: 10, operator: 8 });
    const r = readingCheck({ executive: fx.readingGrade[0]!.text, operator: fx.readingGrade[1]!.text });
    expect(r).toEqual([{ audience: 'executive', grade: 5.9, ceiling: 10, pass: true }, { audience: 'operator', grade: 15.9, ceiling: 8, pass: false }]);
  });
});

describe('UX-69-005: the locale resolution and its verified-fallback marks', () => {
  const canon = T({ version: 2 });
  it('a translation carrying its provenance on the version in force is shown; otherwise the canonical English term, marked', () => {
    const good = T({ locale: 'en-GB', label: 'ASSESSED', translation: { fromVersion: 2, method: 'human' } });
    expect(resolveTerm([canon, good], 'truth.assessed', 'en-GB')).toMatchObject({ mark: 'translated', fallback: false });
    expect(resolveTerm([canon], 'truth.assessed', 'en-GB')).toMatchObject({ mark: 'untranslated', fallback: true, term: { locale: 'en' } });
    expect(resolveTerm([canon, T({ locale: 'en-GB', translation: null })], 'truth.assessed', 'en-GB')).toMatchObject({ mark: 'unreviewed', fallback: true, term: { locale: 'en' } });
    expect(resolveTerm([canon, T({ locale: 'en-GB', translation: { fromVersion: 1, method: 'machine' } })], 'truth.assessed', 'en-GB')).toMatchObject({ mark: 'source_corrected', term: { locale: 'en' } });
    expect(resolveTerm([canon], 'truth.assessed', 'en')).toMatchObject({ mark: 'canonical', fallback: false });
    expect(resolveTerm([T({ state: 'proposed' })], 'truth.assessed', 'en')).toBeNull();
  });
  it('a catalogue row of the server becomes a TermRecord without a word changed; an unknown mark is never shown as reviewed', () => {
    const row = { key: 'truth.assessed', mark: 'untranslated', entry: { term_key: 'truth.assessed', label: 'ASSESSED', definition: 'Reviewed analytical judgment with uncertainty', explanations: { executive: 'x' },
      locale: 'en', version: 3, category: 'truth_state', protected_words: ['uncertainty'], synonyms: ['judged'], example: 'e', conditions: [], cites: [], glossary_keys: ['ais position'], state: 'published', digest: 'a'.repeat(64) } };
    const r = termFromCatalogue(row);
    expect(r).toMatchObject({ mark: 'untranslated', fallback: true, term: { label: 'ASSESSED', version: 3, synonyms: ['judged'], glossaryKeys: ['ais position'] } });
    expect(termFromCatalogue({ ...row, mark: 'whatever' }).mark).toBe('unreviewed');
  });
});

describe('CNT-04 / CNT-05: truth states and lifecycle states', () => {
  it('the ten truth states come from the symbol registry (UPPERCASE label, symbol, definition) and are marked `registry`', () => {
    expect(TRUTH_TERMS.map((t) => t.label)).toEqual(['OBSERVED', 'ASSERTED', 'INFERRED', 'ASSESSED', 'SYNTHETIC', 'RECOMMENDED', 'DECIDED', 'CORRECTED', 'WITHDRAWN', 'INDETERMINATE']);
    expect(TRUTH_TERMS.find((t) => t.key === 'truth.assessed')).toMatchObject({ definition: 'Reviewed analytical judgment with uncertainty', state: 'registry' });
    expect(truthSymbolId('truth.assessed')).toBe('TS-04');
    expect(truthSymbolId('truth.nothing')).toBeNull();
  });
  it('lifecycle labels are the approved title-case LS labels, never combined with a truth state', () => {
    expect(LIFECYCLE_TERMS).toHaveLength(12);
    expect(lifecycleLabelProblem('In Review')).toBeNull();
    expect(lifecycleLabelProblem('in review')).toMatch(/not title case — the approved label is "In Review"/);
    expect(lifecycleLabelProblem('Pending')).toMatch(/not an approved lifecycle label/);
    expect(lifecycleLabelProblem('ASSESSED Approved')).toMatch(/combines a truth state and a lifecycle state/);
    expect(combinesTruthAndLifecycle('CORRECTED')).toBe(false);
    expect(combinesTruthAndLifecycle('OBSERVED Published')).toBe(true);
  });
});

describe('CNT-16: help never hides a required condition', () => {
  it('the conditions are in the visible part; only the detail is deferred; a missing example is a stated problem', () => {
    const m = helpModel({ title: 'Canonical terms', explanation: 'Each concept has one canonical term.', conditions: ['A named human approves.'], detail: 'More text' });
    expect(m).toMatchObject({ conditions: ['A named human approves.'], deferred: 'More text', problems: ['help carries an example (CNT-16)'] });
    expect(helpHidesCondition(m, 'Each concept has one canonical term. A named human approves.')).toBe(false);
    expect(helpHidesCondition(m, 'Each concept has one canonical term.')).toBe(true);
    expect(helpModel({ title: 'Manage terms', explanation: 'x', example: 'e' }).problems).toEqual(['help explains the context in a sentence (8+ characters)', '"Manage terms" is an instruction — a title names the governed work (a noun phrase)']);
  });
});

describe('CNT-10 / CNT-14 / CNT-15 / CNT-01', () => {
  it('every recovery sentence passes the error rule: condition + affected task + safe recovery, no blame', () => {
    for (const code of ['EYE_AUT_001', 'EYE_STA_001', 'EYE_STA_002', 'EYE_REQ_001', 'EYE-DEP-001', 'EYE-INT-001', 'UNKNOWN']) {
      const r = recoveryFor(code, 'approving the package');
      expect(errorTextProblem(r.text), code).toBeNull();
      expect(r.text).toContain('Affected: approving the package.');
    }
  });
  it('the correction shows original, replacement, impact, action and the recipients\' carrier', () => {
    expect(correctionView(null)).toBeNull();
    const v = correctionView({ original: { version: 1, label: 'ASSESSED', definition: 'old', digest: 'a' }, replacement: { label: 'ASSESSED', definition: 'new' }, impact: 'claims re-read', action: 'read again' });
    expect(v!.map((x) => x.label)).toEqual(['Original', 'Replacement', 'Impact', 'Action', 'Recipients']);
    expect(v![4]!.value).toMatch(/B84/);
  });
  it('a receipt states actor / command / object / time / result, or it is not rendered', () => {
    const r = { actor: 'L. Haddad (SYNTHETIC)', command: 'governance.design.term.publish', object: 'truth.assessed v2', time: '2026-10-18T10:00:00Z', result: 'published' };
    expect(receiptText(r)).toBe('Actor: L. Haddad (SYNTHETIC)\nCommand: governance.design.term.publish\nObject: truth.assessed v2\nTime: 2026-10-18T10:00:00Z\nResult: published');
    expect(receiptProblem({ ...r, time: null })).toMatch(/time/);
    expect(receiptText({ ...r, result: '' })).toBeNull();
  });
  it('the product identity: the catalogue opens with "The Eye", never abbreviated (CNT-01)', () => {
    expect(productIdentityProblem(en as Record<string, string>)).toBeNull();
    expect(productIdentityProblem({ 'app.title': 'TE — admin' })).toMatch(/does not open/);
  });
  it('the b81.ct catalogue keys are titles that pass the noun-phrase rule and say nothing a surface rule forbids', () => {
    const own = Object.entries(en as Record<string, string>).filter(([k]) => k.startsWith('b81.ct.'));
    expect(own.length).toBeGreaterThan(5);
    for (const [k, v] of own) if (k.endsWith('.title')) expect(titleProblem(v), k).toBeNull();
  });
});
