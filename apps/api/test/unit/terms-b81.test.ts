/**
 * CP-6 B81 §CT (0119_b81_x_ct) — the PURE logic of the governed product language: the content lint dg-lint-3 (the five rules over planted
 * sources and over the REAL web source as a RATCHET — today's findings committed, the list only shrinks), the reading grade and the no-dilution
 * rule bound to the SHARED fixtures (apps/web/lib/content-b81.fixtures.json — the web copy and the SQL ports assert the same values), the
 * vocabularies equal to the web copy's, the entry shape, the eligibility words and the class-form refusals. Fixtures are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { readRepository, repoRoot } from '../../src/governance/design/design-source.js';
import {
  BLAME, CERTAINTY_WORDS, CONTENT_LINT_VERSION, CONTENT_RULES, DESTRUCTIVE_VERBS, GENERIC_LABELS, IMPERATIVE_TITLE_WORDS, NON_COMMAND_WORDS, READING_CEILINGS, RECOVERY, REVERSIBILITY,
  commandLabelProblem, commandLabelsOf, destructiveProblem, dilutionProblem, errorTextProblem, explanationsOf, lintContent, ratchet, readingGrade, readingLevels, syllables, titleProblem,
} from '../../src/governance/design/terms/content-lint.js';
import { CONTENT_LINT_RATCHET } from '../../src/governance/design/terms/content-lint-ratchet.js';
import { entryProblem, proposalProblem, refuseTerm, termAction, termEligibility, termRefusal, TERM_ACTS } from '../../src/governance/design/terms/terms-logic.js';
import { contentVersion } from '../../src/governance/design/terms/terms.service.js';

const root = repoRoot()!;
const fx = JSON.parse(readFileSync(join(root, 'apps/web/lib/content-b81.fixtures.json'), 'utf8')) as Record<string, Array<Record<string, unknown>>>;
const webSrc = readFileSync(join(root, 'apps/web/lib/content-b81.ts'), 'utf8');
const ENTRY = { category: 'truth_state', label: 'ASSESSED', definition: 'Reviewed analytical judgment with uncertainty',
  explanations: { executive: 'ASSESSED means a reviewer judged it; uncertainty remains.', analyst: 'ASSESSED: a reviewed analytical judgment with stated uncertainty.', operator: 'ASSESSED: reviewed, with uncertainty.' },
  example: 'An ASSESSED corridor claim (SYNTHETIC)', protected: ['uncertainty'], synonyms: [], conditions: [], cites: [], glossary_keys: [] };

describe('the shared fixtures — this copy equals the web copy (and the SQL, in phase6-terms-b81)', () => {
  it('the reading grade and the syllables', () => {
    for (const r of fx['readingGrade']!) expect(readingGrade(String(r['text'])), String(r['text'])).toBe(r['grade']);
    for (const s of fx['syllables']!) expect(syllables(String(s['word'])), String(s['word'])).toBe(s['n']);
    expect(readingLevels({ operator: 'Go.', executive: String(fx['readingGrade']![0]!['text']) })).toEqual({ executive: 5.9, operator: 0 });
  });
  it('the five rules', () => {
    for (const c of fx['commandLabel']!) expect(commandLabelProblem(String(c['label'])) !== null, String(c['label'])).toBe(c['problem']);
    for (const c of fx['destructive']!) expect(destructiveProblem(String(c['label']), String(c['context'])) !== null).toBe(c['problem']);
    for (const c of fx['errorText']!) expect(errorTextProblem(String(c['text'])) !== null, String(c['text'])).toBe(c['problem']);
    for (const c of fx['title']!) expect(titleProblem(String(c['title'])) !== null, String(c['title'])).toBe(c['problem']);
    for (const c of fx['dilution']!) expect(dilutionProblem(String(c['label']), String(c['definition']), c['protected'] as string[], c['explanations'] as Record<string, string>)).toBe(c['problem']);
  });
  it('the vocabularies are the web copy\'s, word for word', () => {
    const arr = (name: string) => { const m = webSrc.match(new RegExp(`export const ${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\];`)); return m === null ? null : [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]); };
    const re = (name: string) => webSrc.match(new RegExp(`export const ${name} = (/.*/[a-z]*);`))?.[1];
    expect(arr('GENERIC_LABELS')).toEqual([...GENERIC_LABELS]);
    expect(arr('NON_COMMAND_WORDS')).toEqual([...NON_COMMAND_WORDS]);
    expect(arr('DESTRUCTIVE_VERBS')).toEqual([...DESTRUCTIVE_VERBS]);
    expect(arr('IMPERATIVE_TITLE_WORDS')).toEqual([...IMPERATIVE_TITLE_WORDS]);
    expect(arr('CERTAINTY_WORDS')).toEqual([...CERTAINTY_WORDS]);
    expect(re('REVERSIBILITY')).toBe(String(REVERSIBILITY));
    expect(re('RECOVERY')).toBe(String(RECOVERY));
    expect(re('BLAME')).toBe(String(BLAME));
    expect(READING_CEILINGS).toEqual({ analyst: 14, executive: 10, operator: 8 });
    expect(webSrc).toContain('READING_CEILINGS: Readonly<Record<Audience, number>> = { analyst: 14, executive: 10, operator: 8 }');
    expect(webSrc).toContain(`CONTENT_LINT_VERSION = '${CONTENT_LINT_VERSION}'`);
  });
});

describe('dg-lint-3 over planted sources', () => {
  it('command labels, destructive commands, errors, explanations and titles are found where the rules say', () => {
    const files = [
      { path: 'apps/web/app/x/page.tsx', text: [
        "export default function P() { return (<>",
        "  <h1>Manage the corridor</h1>",
        "  <GovernedButton label=\"Continue\" pendingLabel=\"x\" onRun={go} />",
        "  <Button label={'Approve the package'} onClick={go} />",
        "  <button type=\"button\" onClick={() => setOpen(true)}>Reject</button>",
        "  <GovernedButton label=\"Close warning\" pendingLabel=\"x\" onRun={go} />",
        "  <button type=\"button\" onClick={() => setOpen(false)}>Cancel</button>",
        "</>); }",
        "const t = { label: 'ASSESSED', definition: 'Reviewed analytical judgment with uncertainty', protected: ['uncertainty'], explanations: { executive: 'ASSESSED is basically known.' } };",
        "setError('the owner is a principal id');",
      ].join('\n') },
      { path: 'apps/web/messages/en.json', text: '{\n  "x.title": "What is this?",\n  "y.action": "OK",\n  "z.error": "Failed."\n}\n' },
      { path: 'apps/web/lib/a.test.ts', text: "setError('x y z');" },
    ];
    const r = lintContent(files);
    expect(r.rulesVersion).toBe('dg-lint-3');
    expect(r.findings.map((f) => [f.rule, f.file.split('/').pop(), f.line, f.excerpt])).toEqual([
      ['title-noun-phrase', 'page.tsx', 2, 'Manage the corridor'], ['verb-object', 'page.tsx', 3, 'Continue'], ['destructive-scope', 'page.tsx', 5, 'Reject'], ['verb-object', 'page.tsx', 5, 'Reject'],
      ['destructive-scope', 'page.tsx', 6, 'Close warning'], ['no-dilution', 'page.tsx', 9, 'ASSESSED'], ['error-recovery', 'page.tsx', 10, 'the owner is a principal id'],
      ['title-noun-phrase', 'en.json', 2, 'What is this?'], ['verb-object', 'en.json', 3, 'OK'], ['error-recovery', 'en.json', 4, 'Failed.'],
    ]);
    expect(r.counts).toEqual({ 'verb-object': 3, 'destructive-scope': 2, 'error-recovery': 2, 'no-dilution': 1, 'title-noun-phrase': 2 });
    expect(lintContent([...files].reverse())).toEqual(r);
  });
  it('a reversibility statement beside a destructive command satisfies it; an arrow function in onClick does not hide a <button>\'s text', () => {
    const r = lintContent([{ path: 'apps/web/app/y/page.tsx', text: "<p>Closing cannot be undone; the warning stays recorded.</p>\n<GovernedButton label=\"Close warning\" pendingLabel=\"x\" onRun={go} />\n" }]);
    expect(r.findings).toEqual([]);
    expect(commandLabelsOf("<button onClick={() => a()}>Reject</button>").map((x) => x.label)).toEqual(['Reject']);
    expect(explanationsOf("{ label: 'X', explanations: { operator: 'X is fine.' } }")).toHaveLength(1);
  });
});

describe('THE RATCHET over the REAL web source (DESIGN D6)', () => {
  it('every finding today is committed (no regression); the committed list only shrinks', () => {
    const repo = readRepository(root);
    expect(repo).not.toBeNull();
    const r = lintContent(repo!.files);
    const k = ratchet(r.findings, CONTENT_LINT_RATCHET);
    expect(k.regressions.map((f) => `${f.rule} ${f.file}:${f.line} "${f.excerpt}"`), 'a NEW content finding — correct the content (the list only shrinks)').toEqual([]);
    expect(k.holds).toBe(true);
    expect(r.findings.length).toBeLessThanOrEqual(CONTENT_LINT_RATCHET.length);
    /* a committed entry no longer found is RESOLVED: remove it from content-lint-ratchet.ts in the same change (the list shrinks) */
    expect(k.resolved.map((x) => `${x.rule} ${x.file} "${x.excerpt}"`), 'resolved — remove these entries from the committed list').toEqual([]);
    // §CT's own files add nothing
    expect(r.findings.filter((f) => /components\/help\.tsx|lib\/content-b81\.ts|lib\/terms-b81\.ts|admin\/governance\/terms\//.test(f.file))).toEqual([]);
    expect(new Set(CONTENT_LINT_RATCHET.map((x) => x.rule))).toEqual(new Set(['verb-object', 'destructive-scope', 'error-recovery']));
  });
  it('the ratchet\'s arithmetic: a new finding is a regression; a fixed one is resolved; a multiset by fingerprint', () => {
    const f = (fp: string) => ({ rule: 'verb-object' as const, principle: 'p', file: 'f', line: 1, excerpt: fp, note: '', fingerprint: fp });
    const c = (fp: string) => ({ rule: 'verb-object' as const, file: 'f', excerpt: fp, fingerprint: fp });
    expect(ratchet([f('a'), f('a')], [c('a'), c('a'), c('b')])).toMatchObject({ holds: true, baseline: 3, current: 2, resolved: [c('b')] });
    expect(ratchet([f('a'), f('a'), f('a')], [c('a'), c('a')])).toMatchObject({ holds: false, regressions: [f('a')] });
    expect(CONTENT_RULES).toEqual(['verb-object', 'destructive-scope', 'error-recovery', 'no-dilution', 'title-noun-phrase']);
  });
});

describe('the entry shape, the eligibility words, the refusals', () => {
  it('entryProblem mirrors governance.term_entry_problem (the harness compares them on the same inputs)', () => {
    expect(entryProblem(ENTRY)).toBeNull();
    expect(entryProblem({ ...ENTRY, category: 'x' })).toMatch(/^category:/);
    expect(entryProblem({ ...ENTRY, explanations: { executive: 'ASSESSED: fine, uncertainty.' } })).toMatch(/^explanation: the analyst explanation/);
    expect(entryProblem({ ...ENTRY, explanations: { ...ENTRY.explanations, board: 'ASSESSED for the board, uncertainty.' } })).toMatch(/^explanation: board is not an audience/);
    expect(entryProblem({ ...ENTRY, example: '' })).toMatch(/^example:/);
    expect(entryProblem({ ...ENTRY, synonyms: ['assessed'] })).toMatch(/^synonym: a synonym is never the canonical label/);
    expect(entryProblem({ ...ENTRY, glossary_keys: ['AIS Position'] })).toMatch(/^glossary:/);
    expect(proposalProblem({ key: 'Truth', entry: ENTRY })).toMatch(/^key:/);
    expect(proposalProblem({ key: 'truth.assessed', locale: 'english', entry: ENTRY })).toMatch(/^locale:/);
  });
  it('the eligibility explains; the port decides', () => {
    expect(TERM_ACTS.map(termAction)).toEqual(['governance.design.term.propose', 'governance.design.term.review', 'governance.design.term.approve', 'governance.design.term.publish',
      'governance.design.term.correct', 'governance.design.term.retire']);
    const base = { kind: 'human', roles: ['design_system_authority'], principal: 'a', proposer: 'b', state: 'reviewed' };
    expect(termEligibility({ ...base, act: 'approve' })).toEqual([]);
    expect(termEligibility({ ...base, act: 'approve', principal: 'b' })).toEqual(['you proposed it — no self-approval']);
    expect(termEligibility({ ...base, act: 'approve', kind: 'agent', roles: [] })).toHaveLength(2);
    expect(termEligibility({ ...base, act: 'review', roles: ['conformance_steward'] })).toEqual(['it is reviewed, not proposed']);
    expect(termEligibility({ ...base, act: 'correct', roles: ['product_authority'], published: false })).toEqual(['it has no published version — revise it by a new proposal']);
  });
  it('the class-form refusals of `design term` (403 · 404 · 409 · 422); anything else is not mapped here', () => {
    const st = (m: string) => termRefusal(new Error(m), 'c')?.getStatus() ?? null;
    expect(st('design term rejected (separation_of_duties): no')).toBe(403);
    expect(st('design term rejected (unknown_term): no')).toBe(404);
    expect(st('design term rejected (conflict): no')).toBe(409);
    expect(st('design term rejected (held): no')).toBe(409);
    expect(st('design term rejected (reading_level): no')).toBe(422);
    expect(st('something else')).toBeNull();
    expect(termRefusal(new HttpException('x', 400), 'c')).toBeNull();
    expect((refuseTerm('request', 'r', 'c').getResponse() as Record<string, unknown>)['message']).toBe('design term rejected (request): r');
  });
  it('the content version digests the terms and the message catalogue together', () => {
    expect(contentVersion('a', 'b')).toMatch(/^[0-9a-f]{64}$/);
    expect(contentVersion('a', 'b')).not.toBe(contentVersion('a', 'c'));
    expect(contentVersion('a', null)).not.toBe(contentVersion('a', 'b'));
  });
});
