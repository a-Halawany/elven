import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECISION_ACTIVE_TYPES, actionClassOf, contestPathFor, findBulkApprovals, isConsequential, isIrreversible, typedPhrase } from './authority-b81';
import {
  CONTEST_COMPOSED, CONTEST_NOT_COMPOSED, HAR_ACT_ROLES, HAR_EFFECTS, INTELLIGENCE_DECISIONS, INTELLIGENCE_LABEL, INTELLIGENCE_REVIEW_AUTHORITY, READ_ROLES, TYPED_ACTS,
  appealsOn, assessmentRecord, contestHref, extractionReviewRecord, mayRead, recommendationReviewRecord, statedConsequence,
} from './authority-har-b81';

/**
 * CP-6 B81 §HA-R — the wave-2 re-points over the wave-1 authority library: the roles are the PDP's own, the stated consequences say what is
 * kept and whether the act can be undone, the review records are never authority, the contest path is composed on every decision-active page
 * that has a route (or the page names its carrier), and the irreversible acts are typed. Reads the real source (the PDP, the pages). CONSTRUCTION
 * evidence only — the walk demonstrates (SYNTHETIC personas), H3 accepts. Every persona and record here is SYNTHETIC.
 */
const WEB = join(__dirname, '..');
const PDP = readFileSync(join(WEB, '..', 'api', 'src', 'policy', 'pdp.service.ts'), 'utf8');
const RULES = PDP.split(/actionPrefix:\s*/).slice(1).map((chunk) => {
  const prefix = /^'([^']+)'/.exec(chunk)?.[1] ?? '';
  const head = chunk.split(/requiredAnyRole|\n\s*\}/)[0]!;
  const roles = [...(/^[\s\S]*?requiredAnyRole:\s*\[([\s\S]*?)\]/.exec(chunk.split(/\n\s*\},?\s*\n/)[0]!)?.[1] ?? '').matchAll(/role:\s*'([a-z_]+)'/g)].map((r) => r[1]!);
  return { prefix, exact: /exact:\s*true/.test(head), roles };
}).filter((r) => r.prefix !== '');
const ruleFor = (action: string) => RULES.find((r) => (r.exact ? action === r.prefix : action.startsWith(r.prefix)));
const src = (file: string) => readFileSync(join(WEB, file), 'utf8');
const D1 = 'a1b2c3d4'.repeat(8);

describe('the roles are the PDP rules\' own (first match wins) — a page never offers what the PDP refuses, nor reads what it would refuse', () => {
  it('the acts and the two reads', () => {
    for (const [action, roles] of Object.entries({ ...HAR_ACT_ROLES, ...READ_ROLES })) {
      const r = ruleFor(action);
      expect(r, action).toBeDefined();
      expect([...r!.roles].sort(), action).toEqual([...roles].sort());
    }
    expect(mayRead('decision.appeal.read', ['board_member'])).toBe(false);
    expect(mayRead('decision.appeal.read', ['decision_owner'])).toBe(true);
    expect(mayRead('decision.read', ['auditor'])).toBe(true);
  });
});

describe('CMP-045 / PAT-17 — the stated consequences', () => {
  it('every stated act is a PDP act; the consequential ones say whether they can be undone and what is kept; wave 1\'s catalogue comes first', () => {
    for (const [key, c] of Object.entries(HAR_EFFECTS)) {
      const action = key.split(':')[0]!;
      expect(ruleFor(action), key).toBeDefined();
      expect(c.reversibility.length, key).toBeGreaterThan(10);
      expect(c.effect, key).not.toMatch(/\bwill\b.*\bguarantee/);
      expect(statedConsequence(key)).toMatchObject({ source: 'stated', blockers: [], effect: c.effect });
    }
    expect(statedConsequence('decision.approve')!.effect).toMatch(/one of the quorum/);
    expect(statedConsequence('nothing.like.this')).toBeNull();
    for (const a of ['prediction.warning.close', 'simulation.experiment.cancel']) expect(HAR_EFFECTS[a]!.reversibility, a).toMatch(/^cannot be undone/);
    expect(HAR_EFFECTS['simulation.experiment.cancel']!.reversibility).toMatch(/not rolled back/);
    expect(HAR_EFFECTS['prediction.warning.close']!.reversibility).toMatch(/stay recorded/);
    expect(HAR_EFFECTS['decision.recommendation.review:accept_for_consideration']!.effect).toMatch(/FOR CONSIDERATION — never a decision/);
    expect(HAR_EFFECTS['executive.request:decision']!.effect).toMatch(/it decides nothing/);
    expect(isConsequential(actionClassOf('decision.package.reopen'))).toBe(true);
  });
});

describe('PAT-16 — the irreversible acts are confirmed by a typed phrase in a Command Review', () => {
  it('each named act is irreversible, and its page puts it through a Command Review with the typed phrase', () => {
    for (const t of TYPED_ACTS) {
      expect(isIrreversible(t.action), t.action).toBe(true);
      const text = src(t.file);
      const at = text.indexOf(`<CommandReview action="${t.action}"`);
      expect(at, `${t.file}: a Command Review of ${t.action}`).toBeGreaterThan(-1);
      expect(text.slice(at, at + 2400), t.file).toMatch(/typedPhrase=\{/);
      expect(text, `${t.file}: no bare governed button for ${t.action}`).not.toMatch(new RegExp(`<GovernedButton[^>]*label="(Close the warning|Cancel the experiment)"`));
    }
    expect(typedPhrase({ digest: D1, name: 'x' })).toBe('a1b2c3d4');
  });
  it('the cancellation is followed by §DG\'s residual state (nothing rolled back)', () => {
    expect(src('app/twins/simulations/orchestration/page.tsx')).toMatch(/<ResidualState residual=\{residualOf\(/);
  });
});

describe('PAT-06 — review records are never authority; the intelligence review decision is labelled from its PDP rule', () => {
  it('an outcome assessment, a recommendation review and an extraction review decision as records', () => {
    const a = assessmentRecord({ assessed_by: 'p-okafor-000001', version: 2, assessment_version: 1, digest: D1, assessed_at: '2026-10-19T08:00:00Z',
      observed: { outcomes: [{}, {}], statement: 'the line kept running (SYNTHETIC)' }, inferred: { statement: 'the reroute contributed', method: 'attribution_rule', confidence: 0.6 },
      counterfactual: { basis: { kind: 'stated_model', model: 'no reroute' } } });
    expect(a).toEqual({ reviewer: 'p-okafor-000001', version: 2, evidence: '2 recorded outcome(s); counterfactual basis a stated model; assessment digest a1b2c3d4…c3d4',
      findings: 'observed: the line kept running (SYNTHETIC) · inferred: the reroute contributed (attribution rule, confidence 0.6)', at: '2026-10-19T08:00:00Z',
      act: 'assessed the outcome (assessment v1)', authority: 'not decision authority' });
    const r = recommendationReviewRecord({ reviewer_principal_id: 'p-hoffmann-001', verdict: 'accept_for_consideration', rationale: 'the evidence holds (SYNTHETIC)', override: null, flags_at_review: [{}], compared: 2, reviewed_at: '2026-10-19T09:00:00Z' }, { version: 3, digest: D1 });
    expect(r).toMatchObject({ act: 'accept for consideration', version: 3, authority: 'not decision authority', evidence: 'the recommendation as recorded (a1b2c3d4…c3d4); 1 flag(s) standing at the review; compared with 2 other recommendation(s)' });
    const x = extractionReviewRecord({ case_id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', claim_version: 1, queued_reason: 'below_review_threshold' }, { state: 'corrected', newVersion: 2 }, 'p-lange-0000001', 'the value was misread (SYNTHETIC)', D1);
    expect(x).toMatchObject({ reviewer: 'p-lange-0000001', version: 2, act: 'corrected — the claim is now version 2', authority: 'not decision authority', findings: 'the value was misread (SYNTHETIC)' });
  });
  it('the intelligence review decision: an approval-CLASS act whose authority is extraction review — not decision authority', () => {
    expect(actionClassOf(INTELLIGENCE_REVIEW_AUTHORITY.rule)).toBe('approval');
    expect(HAR_ACT_ROLES[INTELLIGENCE_REVIEW_AUTHORITY.rule]).not.toContain('decision_authority');
    expect(HAR_ACT_ROLES[INTELLIGENCE_REVIEW_AUTHORITY.rule]!.some((r) => /agent/.test(r))).toBe(false);
    expect(INTELLIGENCE_REVIEW_AUTHORITY.scope).toMatch(/it is not decision authority/);
    expect(INTELLIGENCE_DECISIONS.map((d) => statedConsequence(`${INTELLIGENCE_REVIEW_AUTHORITY.rule}:${d}`) !== null)).toEqual([true, true, true]);
    expect(new Set(Object.values(INTELLIGENCE_LABEL)).size, 'approve, correct and reject stay distinct acts (HX-12)').toBe(3);
    const page = src('app/intelligence/review/page.tsx');
    expect(page).toMatch(/<CommandReview action=\{INTELLIGENCE_REVIEW_AUTHORITY\.rule\}/);
    expect(page).toMatch(/INTELLIGENCE_REVIEW_AUTHORITY\.scope/);
    expect(page).toMatch(/<ReviewRecord record=\{record\}/);
  });
});

describe('the re-pointed decision pages compose the library (never fork it)', () => {
  it('review, recommendations and requests: the acts are Command Reviews, the reviews are Review Records', () => {
    const review = src('app/decisions/review/page.tsx');
    expect(review).toMatch(/<CommandReview action="decision\.package\.reopen"/);
    expect(review).toMatch(/<CommandReview action="decision\.review\.outcome"/);
    expect(review).toMatch(/<ReviewRecord key=\{a\.assessment_id\}/);
    const rec = src('app/decisions/recommendations/page.tsx');
    expect(rec).toMatch(/<CommandReview action="decision\.recommendation\.review"/);
    expect(rec).toMatch(/<ReviewRecord key=\{v\.review_id\}/);
    expect(rec).toMatch(/<SubjectContest [^>]*appealKind="recommendation"/);
    const req = src('app/decisions/requests/page.tsx');
    expect(req).toMatch(/draft\.kind === 'decision' \? \(/);
    expect(req).toMatch(/<CommandReview action="executive\.request"[\s\S]*?statedConsequence\('executive\.request:decision'\)/);
  });
  it('no bulk authority path in the changed pages (PAT-07)', () => {
    const files = ['app/decisions/review/page.tsx', 'app/decisions/recommendations/page.tsx', 'app/decisions/requests/page.tsx', 'app/intelligence/review/page.tsx',
      'app/prediction/warnings/lifecycle-panel.tsx', 'app/twins/simulations/orchestration/page.tsx', 'app/decisions/contest-panel.tsx', 'app/decisions/board/page.tsx'].map((path) => ({ path, text: src(path) }));
    expect(findBulkApprovals(files)).toEqual([]);
  });
});

describe('HX-14 — the contest path on every decision-active page that has a route', () => {
  it('each composed page composes the library\'s ContestPath (directly or through SubjectContest); every decision-active type is composed or names its carrier', () => {
    for (const c of CONTEST_COMPOSED) {
      expect(src(c.file), c.file).toMatch(/<(ContestPath|SubjectContest)\b/);
      expect(contestPathFor(c.type), c.type).not.toBeNull();
    }
    expect(src('app/decisions/contest-panel.tsx')).toMatch(/<ContestPath route=\{route\}/);
    const covered = new Set([...CONTEST_COMPOSED.map((c) => c.type), ...CONTEST_NOT_COMPOSED.map((c) => c.type)]);
    expect(DECISION_ACTIVE_TYPES.filter((t) => !covered.has(t))).toEqual([]);
    for (const n of CONTEST_NOT_COMPOSED) expect(n.carrier.length, n.page).toBeGreaterThan(20);
  });
  it('the appeal cases on one subject, and the deep link to its appeal form', () => {
    const cases = [{ subject_kind: 'recommendation', subject_id: 'r1', case_id: 'a' }, { subject_kind: 'recommendation', subject_id: 'r2', case_id: 'b' }, { subject_kind: 'forecast', subject_id: 'r1', case_id: 'c' }];
    expect(appealsOn(cases, 'recommendation', 'r1').map((c) => c.case_id)).toEqual(['a']);
    expect(contestHref('package_version', 'p 1', 2)).toBe('/decisions/explanations?kind=package_version&id=p%201&version=2');
    expect(contestHref('forecast', 'f1')).toBe('/decisions/explanations?kind=forecast&id=f1');
  });
});
