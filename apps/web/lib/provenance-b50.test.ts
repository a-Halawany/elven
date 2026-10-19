/**
 * B50 §PV — the provenance, fitness, compare, contest and deep-link contract as pure functions (lib/provenance-b50.ts). Every fixture is
 * SYNTHETIC. CONSTRUCTION only.
 */
import { describe, expect, it } from 'vitest';
import {
  BOUNDARIES, CHALLENGE_STATE_WORDS, OUTCOME_WORDS, alignmentWords, boundaryCoverage, challengeActs, challengeRoute, compareSides, completenessNote, explainHref, explainPath,
  fitnessNote, flattenPointers, markCommand, nodeLine, outcomeSummary, parseExplainLink, type Challenge, type ExplainView, type FitnessView,
} from './provenance-b50';

const node = (nodeId: string, over: Partial<ExplainView['nodes'][number]> = {}): ExplainView['nodes'][number] =>
  ({ nodeId, kind: 'claim', ref: nodeId, label: nodeId, outcome: 'ok', at: null, actor: null, parents: [], span: null, ...over });
const VIEW: Pick<ExplainView, 'root' | 'nodes'> = {
  root: 'obj:CLM:c@1',
  nodes: [
    node('obj:CLM:c@1', { kind: 'product', parents: ['obj:EVD:e@1', 'model:m', 'review:r', 'challenge:k'] }),
    node('obj:EVD:e@1', { kind: 'evidence', parents: ['obj:OBS:o@1'], span: { start: 0, end: 7 } }),
    node('obj:OBS:o@1', { kind: 'source', parents: ['obj:CLM:c@1'] }),            // a cycle back to the root: visited once
    node('model:m', { kind: 'model_call', outcome: 'abstained', boundary: 'model', label: 'model fixture-7b' }),
    node('review:r', { kind: 'review', outcome: 'denied', boundary: 'human', actor: 'principal:k-mueller', at: '2026-10-19T08:00:00.000Z' }),
    node('challenge:k', { kind: 'review', outcome: 'challenged', boundary: 'human' }),
    node('orphan', { kind: 'policy_decision', outcome: 'failed' }),
  ],
};

describe('THE PATH — backward from the product, each node once, the unreached kept; outcomes in words', () => {
  it('breadth first over parents with the depth and the child it was reached from; a cycle visits once; an unreached node is listed apart', () => {
    const p = explainPath(VIEW);
    expect(p.rows.map((r) => [r.node.nodeId, r.depth, r.via])).toEqual([
      ['obj:CLM:c@1', 0, null], ['obj:EVD:e@1', 1, 'obj:CLM:c@1'], ['model:m', 1, 'obj:CLM:c@1'], ['review:r', 1, 'obj:CLM:c@1'], ['challenge:k', 1, 'obj:CLM:c@1'], ['obj:OBS:o@1', 2, 'obj:EVD:e@1']]);
    expect(p.unreached.map((n) => n.nodeId)).toEqual(['orphan']);
    expect(explainPath({ root: 'missing', nodes: VIEW.nodes }).rows).toEqual([]);   // a root the answer does not carry: nothing invented
  });
  it('every outcome has its word (colour is never the only signal); the summary counts what did not succeed — or says none is RECORDED', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual(['abstained', 'challenged', 'corrected', 'denied', 'failed', 'ok', 'overridden', 'unresolved']);
    expect(outcomeSummary(VIEW.nodes)).toBe('1 denied · 1 abstained · 1 challenged · 1 failed');
    expect(outcomeSummary([{ outcome: 'ok' }])).toBe('no denied, abstained, challenged, overridden, corrected, failed or unresolved path is recorded');
  });
  it('a node in words: kind, label, outcome, boundary, actor and instant — an absent actor or time said, never blank; the span named', () => {
    expect(nodeLine(VIEW.nodes[4]!)).toEqual({ title: 'review: review:r', outcome: 'DENIED', tone: 'critical', meta: 'human boundary · by principal:k-mueller · at 2026-10-19T08:00:00.000Z' });
    expect(nodeLine(VIEW.nodes[1]!).meta).toBe('actor not recorded · time not recorded · bytes 0–7');
  });
  it('the boundaries: each with its count; the TOOL boundary carried (B70), never shown as covered', () => {
    const b = boundaryCoverage({ synchronous: 3, agent: 1, tool: { nodes: 0, state: 'carried', carrier: 'B70 — the tool gateway (F-P7A-05)' } });
    expect(b.map((x) => x.boundary)).toEqual([...BOUNDARIES]);
    expect(b.find((x) => x.boundary === 'synchronous')!.statement).toBe('3 nodes recorded');
    expect(b.find((x) => x.boundary === 'model')!.statement).toBe('no node recorded across this boundary');
    expect(b.find((x) => x.boundary === 'tool')!.statement).toBe('carried — B70 — the tool gateway (F-P7A-05)');
    expect(boundaryCoverage({}).find((x) => x.boundary === 'tool')!.statement).toBe('not stated by the server');
  });
  it('completeness: a truncated walk and a gap are INCOMPLETE with the bound and the kinds named; complete only when the server says every reference resolved', () => {
    const bounds = { max_depth: 12, max_nodes: 400 };
    expect(completenessNote({ incomplete: true, truncated: true, gaps: [], examined: 400, bounds }).text).toBe('INCOMPLETE — the walk reached its bound (depth 12, 400 versions) after 400; history beyond it was not examined');
    expect(completenessNote({ incomplete: true, truncated: false, gaps: [{ kind: 'broken_custody', ref: 'x', at: 'x', reason: 'r' }, { kind: 'incomplete_lineage', ref: 'y', at: 'y', reason: 'r' }], examined: 4, bounds }))
      .toEqual({ complete: false, text: 'INCOMPLETE — 2 gaps in the recorded lineage (broken custody, incomplete lineage)' });
    expect(completenessNote({ incomplete: false, truncated: false, gaps: [], examined: 1, bounds })).toEqual({ complete: true, text: 'the whole recorded lineage was examined (1 version); every reference resolved' });
  });
});

const EV = { ref: 'CLM:c@1', reasons: [] as string[], gaps: [] as string[], examined: 4, truncated: false, ruleVersion: 'b50-pv-fitness-1', evaluatedAt: '2026-10-19T08:00:00.000Z' };
const fit = (over: Partial<FitnessView> = {}): FitnessView => ({ ref: 'CLM:c@1', evaluation: { ...EV, verdict: 'fit' }, mark: null, refusesUse: false, history: [], ...over });

describe('THE FITNESS — the recorded mark refuses use; the evaluation beside it; never fit by inference', () => {
  it('a mark unfit: refused, routed, said first', () => {
    const f = fit({ evaluation: { ...EV, verdict: 'unfit', reasons: ['broken_custody'] }, mark: { mark_id: 'm', verdict: 'unfit', reasons: ['broken_custody'], route: 'adjudication', marked_by: 'p', marked_at: 't', note: 'n' }, refusesUse: true });
    expect(fitnessNote(f)).toMatchObject({ headline: 'MARKED UNFIT (broken custody) — consequential use and export are refused; routed to adjudication', refusesUse: true, tone: 'critical' });
  });
  it('an evaluation unfit without a mark: NOT MARKED, use not refused until a person records it; a truncated evaluation is not determined, never fit', () => {
    expect(fitnessNote(fit({ evaluation: { ...EV, verdict: 'unfit', reasons: ['incomplete_lineage'] } }))).toMatchObject({ refusesUse: false, tone: 'attention', evaluation: 'the evaluation (b50-pv-fitness-1) finds it unfit: incomplete lineage' });
    expect(fitnessNote(fit({ evaluation: { ...EV, verdict: 'unknown', truncated: true } })).evaluation).toBe('the evaluation (b50-pv-fitness-1) could not determine it: the history beyond the bound was not examined');
    expect(fitnessNote(fit()).headline).toBe('NOT MARKED — no fitness mark is recorded for this version');
    expect(fitnessNote(fit()).evaluation).toBe('the evaluation (b50-pv-fitness-1) found no gap in the 4 recorded versions it examined');
  });
  it('the mark command: a steward\'s act; an unfit evaluation needs a route — disabled with the reason', () => {
    expect(markCommand(fit(), false, '')).toEqual({ enabled: false, reason: 'recording a fitness mark is a knowledge owner\'s, data steward\'s or domain administrator\'s act' });
    expect(markCommand(fit({ evaluation: { ...EV, verdict: 'unfit', reasons: ['incomplete_lineage'] } }), true, '').reason).toMatch(/^the evaluation finds it unfit: choose where the mark routes it/);
    expect(markCommand(fit({ evaluation: { ...EV, verdict: 'unfit', reasons: ['incomplete_lineage'] } }), true, 'recompute')).toEqual({ enabled: true, reason: null });
    expect(markCommand(fit(), true, '')).toEqual({ enabled: true, reason: null });
  });
});

describe('THE COMPARE — onto B80\'s DiffViewer: the header as recorded, the payload by JSON pointer', () => {
  it('pointers escape ~ and /, arrays by position, empty containers kept', () => {
    expect(flattenPointers({ b: [1, { 'x/y': 2 }], a: { '~k': null }, e: [] })).toEqual({ '/a/~0k': null, '/b/0': 1, '/b/1/x~1y': 2, '/e': '[]' });
  });
  it('the sides: header fields beside payload/… keys; nothing recorded is nothing to compare', () => {
    expect(compareSides({ object_version: 2, correction_of: 'c@1', payload: { object_value: 'reduced by 7%' } })).toEqual({ object_version: 2, correction_of: 'c@1', 'payload/object_value': 'reduced by 7%' });
    expect(compareSides(null)).toBeNull();
  });
});

const CH: Challenge = { challenge_id: 'k', state: 'open', grounds: 'The bulletin double counts (SYNTHETIC).', opened_by: 'ivanova', reviewer: null, decided_by: null, review_by: '2026-10-26T08:00:00.000Z',
  overdue: false, escalations: 0, subject: { kind: 'claim', type: 'CLM', id: 'c', version: 1, owner: 'owner' } };
describe('THE CONTEST — routed subjects; every act enabled or disabled with its reason', () => {
  it('a claim, an assessment, a warning, a forecast take a knowledge challenge; a decision and a run are routed', () => {
    for (const t of ['CLM', 'ASM', 'WRN', 'FCT']) expect(challengeRoute(t).allowed, t).toBe(true);
    expect(challengeRoute('DPK')).toEqual({ allowed: false, statement: 'a decision is contested through its appeal (B35) or its gate challenge (B36)' });
    expect(challengeRoute('SIM').statement).toMatch(/simulation challenge \(B21\)/);
    expect(challengeRoute('EVD').allowed).toBe(false);
  });
  it('reviewer ≠ opener ≠ owner; only the reviewer decides; the opener alone withdraws; escalation only when the server says overdue', () => {
    const steward = { principalId: 'mueller', steward: true, domainAdmin: false };
    expect(challengeActs(CH, steward).review).toEqual({ enabled: true, reason: null });
    expect(challengeActs(CH, { ...steward, principalId: 'ivanova' }).review.reason).toBe('the opener never reviews their own challenge');
    expect(challengeActs(CH, { ...steward, principalId: 'owner' }).review.reason).toBe('the subject\'s owner never reviews a challenge of it');
    expect(challengeActs(CH, { principalId: 'x', steward: false, domainAdmin: false }).review.reason).toMatch(/knowledge owner's, data steward's or domain administrator's act/);
    const ur: Challenge = { ...CH, state: 'under_review', reviewer: 'mueller' };
    expect(challengeActs(ur, steward).decide.enabled).toBe(true);
    expect(challengeActs(ur, { ...steward, principalId: 'other' }).decide.reason).toBe('only the reviewer who took it decides it');
    expect(challengeActs(ur, { principalId: 'ivanova', steward: false, domainAdmin: false }).withdraw.enabled).toBe(true);
    expect(challengeActs(ur, steward).withdraw.reason).toBe('only its opener withdraws a challenge');
    expect(challengeActs(CH, { principalId: 'ivanova', steward: false, domainAdmin: false }).escalate.reason).toBe('not overdue: the review is due by 2026-10-26T08:00:00.000Z (the server\'s clock decides)');
    expect(challengeActs({ ...CH, overdue: true }, { principalId: 'ivanova', steward: false, domainAdmin: false }).escalate.enabled).toBe(true);
    expect(challengeActs({ ...CH, overdue: true }, { principalId: 'outsider', steward: false, domainAdmin: false }).escalate.enabled).toBe(false);
    expect(challengeActs({ ...CH, state: 'upheld' }, steward).evidence.reason).toBe('evidence is submitted while the challenge is live');
    expect(Object.keys(CHALLENGE_STATE_WORDS).sort()).toEqual(['dismissed', 'open', 'under_review', 'upheld', 'withdrawn']);
  });
});

describe('THE DEEP LINK — opens exactly what it names, or says why it cannot', () => {
  it('a link round-trips; a missing type, id or version is named', () => {
    const href = explainHref('CLM', '01a151f7-3986-7e2b-836e-3445e0acd1ca', 2);
    expect(href).toBe('/graph/explain/CLM/01a151f7-3986-7e2b-836e-3445e0acd1ca?version=2');
    expect(parseExplainLink('CLM', '01A151F7-3986-7E2B-836E-3445E0ACD1CA', '2')).toEqual({ ok: true, type: 'CLM', id: '01a151f7-3986-7e2b-836e-3445e0acd1ca', version: 2 });
    expect(parseExplainLink('clm', 'x', '1')).toEqual({ ok: false, reason: 'this link names no object type (three capitals, e.g. CLM); it named "clm"' });
    expect(parseExplainLink('CLM', 'not-a-uuid', '1')).toMatchObject({ ok: false, reason: expect.stringMatching(/names no object id/) });
    expect(parseExplainLink('CLM', '01a151f7-3986-7e2b-836e-3445e0acd1ca', null)).toMatchObject({ ok: false, reason: expect.stringMatching(/names no version/) });
    expect(parseExplainLink('CLM', '01a151f7-3986-7e2b-836e-3445e0acd1ca', '0').ok).toBe(false);
  });
  it('the alignment in words: misaligned said first, every count named', () => {
    expect(alignmentWords({ verdict: 'misaligned', summary: { citations: 3, bound: 1, unsupported_labelled: 0, unsupported_unlabelled: 2, unresolved: 1 } }))
      .toBe('MISALIGNED — 3 citations: 1 bound to evidence, 0 unsupported but labelled, 2 unsupported and unlabelled, 1 not resolving');
    expect(alignmentWords({ verdict: 'aligned', summary: { citations: 1, bound: 1 } })).toBe('aligned — 1 citation: 1 bound to evidence, 0 unsupported but labelled, 0 unsupported and unlabelled, 0 not resolving');
  });
});
