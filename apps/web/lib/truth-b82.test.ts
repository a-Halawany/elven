/**
 * B82 §TS — the truth, AI-notice and freshness models (CMP-021, CMP-023, HX-02, HX-11, HX-15, TS-01…10, UX-ADR-005/-009, REL-06/-07, CNT-08,
 * UX-06-001/-003/-005) and THE AI-NOTICE RATCHET (Q16 / DESIGN D16): a page that renders agent-authored content without the notice fails —
 * §TS's pages carry it; every other page listed here names its carrier and the list may only shrink. CONSTRUCTION evidence only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYMBOLS } from '@eye/tokens';
import { LIBRARY_B82 } from './b82-seams';
import type { ProjectionBlock } from './graph';
import {
  AI_NOTICE_TEXT, DERIVED_STATES, DISPLAY_STATES, STORED_STATES, TRUTH_STATE_ENTRIES, aiNoticeFinding, aiNoticeView, aiOutputLabel, dimensionIntro, displayTruthOf,
  freshnessView, isAgentAuthored, pendingCommandsLine, refKey, refOfRow, stateStripView, truthBatches, truthGate, truthLabelView, truthStateCollisions, truthTermOf,
} from './truth-b82';

const ID = '01a084f5-7979-7000-8000-000000000001';
const row = (over: Record<string, unknown> = {}) => ({ ref: `CLM:${ID}@2`, stored: 'extracted', display: 'corrected', basis: 'stored EXTRACTED; this version is a correction of CLM:x@1', rule_version: 'b82-ts-display-1',
  reasons: [{ code: 'correction_of', ref: `CLM:${ID}@1`, detail: `this version corrects CLM:${ID}@1 (the original is preserved)` }], constrained_use: null, correction_of: `CLM:${ID}@1`, corrected_by: null,
  lifecycle: 'corrected', agent_authored: false, ...over });

describe('UX-ADR-005 / REL-07 / TS-01…10 · the twelve states are distinct, from the symbol set', () => {
  it('nine stored + three derived; each with its own label, glyph and (for the ten Appendix B rows) token — no collision', () => {
    expect(STORED_STATES).toHaveLength(9); expect(DERIVED_STATES).toEqual(['recommended', 'corrected', 'indeterminate']); expect(DISPLAY_STATES).toHaveLength(12);
    expect(truthStateCollisions()).toEqual([]);
    const ts = TRUTH_STATE_ENTRIES.filter((e) => /^TS-/.test(e.symbolId)).map((e) => [e.symbolId, e.label, e.token]);
    expect(ts).toEqual([
      ['TS-01', 'OBSERVED', 'color.observed'], ['TS-02', 'ASSERTED', 'color.asserted'], ['TS-03', 'INFERRED', 'color.inferred'], ['TS-04', 'ASSESSED', 'color.assessed'],
      ['TS-05', 'SYNTHETIC', 'color.synthetic'], ['TS-07', 'DECIDED', 'color.decided'], ['TS-09', 'WITHDRAWN', 'color.withdrawn'],
      ['TS-06', 'RECOMMENDED', 'color.recommended'], ['TS-08', 'CORRECTED', 'color.corrected'], ['TS-10', 'INDETERMINATE', 'color.uncertain'],
    ]);
  });
  it('the check finds a collision when two states share a glyph (the test of the test)', () => {
    const [a, b] = TRUTH_STATE_ENTRIES;
    expect(truthStateCollisions([a!, { ...b!, glyphDigest: a!.glyphDigest }])).toEqual([`${a!.state} and ${b!.state} share the glyph ${a!.glyphDigest}`]);
  });
  it('every state has its canonical term (the registry fallback until the act publishes the governed terms)', () => {
    for (const s of DISPLAY_STATES) {
      const t = truthTermOf(s)!;
      expect(t.label).toBe(SYMBOLS.find((x) => x.key === s)!.label); expect(t.category).toBe('truth_state'); expect(t.state).toBe('registry');
    }
    expect(truthTermOf('nonsense')).toBeNull();
  });
});

describe('the server\'s read and CMP-021\'s label', () => {
  it('a row maps to the seam\'s DisplayTruth — nothing re-worded; an unknown state is not admitted', () => {
    const d = displayTruthOf(row())!;
    expect(d).toMatchObject({ stored: 'extracted', display: 'corrected', correctionOf: `CLM:${ID}@1`, correctedBy: null, lifecycle: 'corrected', agentAuthored: false, ruleVersion: 'b82-ts-display-1' });
    expect(displayTruthOf(row({ display: 'certain' }))).toBeNull();
    expect(displayTruthOf(row({ stored: 'recommended' }))).toBeNull();   // a derived state is never a stored one
  });
  it('CORRECTED: the badge shows the display state, the stored one beside it, and the link to the preserved original', () => {
    const v = truthLabelView(displayTruthOf(row())!);
    expect(v).toMatchObject({ badge: 'corrected', derived: true, storedNote: 'stored EXTRACTED', unread: null });
    expect(v.correction).toEqual([{ label: 'corrects v1 (the original is preserved)', ref: `CLM:${ID}@1` }]);
    expect(v.reasons).toEqual([]);
  });
  it('the ORIGINAL: its own stored state, superseded by correction v2', () => {
    const v = truthLabelView(displayTruthOf(row({ display: 'extracted', correction_of: null, corrected_by: `CLM:${ID}@2`, constrained_use: 'superseded by correction v2 — the preserved original',
      reasons: [{ code: 'corrected_by', ref: `CLM:${ID}@2`, detail: 'superseded by correction v2' }] }))!);
    expect(v).toMatchObject({ badge: 'extracted', derived: false, storedNote: null, constrainedUse: 'superseded by correction v2 — the preserved original' });
    expect(v.correction).toEqual([{ label: 'superseded by correction v2', ref: `CLM:${ID}@2` }]);
  });
  it('an UNREAD display truth shows the stored state and says so — never a guessed display state', () => {
    expect(truthLabelView({ stored: 'asserted', unread: 'HTTP 403 — no reading role here' })).toMatchObject({ badge: 'asserted', derived: false, unread: 'display truth not read — HTTP 403 — no reading role here; the stored state is shown' });
  });
});

describe('HX-02 · the gate while INDETERMINATE', () => {
  const ind = displayTruthOf(row({ display: 'indeterminate', stored: 'asserted', correction_of: null, reasons: [{ code: 'contradiction', ref: null, detail: 'contradiction X is open' }], constrained_use: 'not for a decision-active use' }))!;
  it('promote / approve / publish / review / derive are held with the reasons; a stated reason, never a silent disable', () => {
    for (const act of ['promote', 'approve', 'publish', 'review', 'derive'] as const) expect(truthGate(ind, act)).toBe(`the truth state is INDETERMINATE — contradiction X is open; ${act} is held until it is resolved`);
  });
  it('nothing held for a resolved state or an unread one; a WITHDRAWN object is not promoted again', () => {
    expect(truthGate(displayTruthOf(row())!, 'approve')).toBeNull();
    expect(truthGate({ stored: 'asserted', unread: 'x' }, 'approve')).toBeNull();
    expect(truthGate(displayTruthOf(row({ display: 'withdrawn', stored: 'withdrawn', correction_of: null }))!, 'publish')).toBe('the object is WITHDRAWN — it is not published again');
  });
});

describe('HX-11 / CNT-08 / UX-ADR-009 · the AI notice — one wording', () => {
  it('the statement and the AI-output label name the agent or model and say "not a decision"', () => {
    expect(AI_NOTICE_TEXT).toBe('AI recommends, forecasts, simulates, reasons and explains; it does not decide.');
    expect(aiOutputLabel('recommended', { kind: 'agent', name: 'Decision Agent', version: '1.0.0' })).toBe('RECOMMENDED — by the agent Decision Agent 1.0.0; not a decision');
    expect(aiOutputLabel('synthetic', { kind: 'model', name: 'fixture-model-7b' })).toBe('SYNTHETIC — by the model fixture-model-7b; not a decision');
    expect(aiOutputLabel('proposed', null)).toBe('PROPOSED — by an unnamed agent or model (not recorded on this read); not a decision');
  });
  it('a notice without a producer is a stated problem; the contest and explain paths ride with it (REL-06)', () => {
    expect(aiNoticeView({ output: 'proposed', producer: null }).problems).toEqual(['the AI notice names no agent or model — the producer is not recorded on this read']);
    expect(aiNoticeView({ output: 'recommended', producer: { kind: 'agent', name: 'Decision Agent' }, contestHref: '/decisions/explanations', explainHref: '/decisions/explanations' }))
      .toMatchObject({ producer: 'Agent: Decision Agent', contest: '/decisions/explanations', problems: [] });
  });
  it('agent-authored records: the author, the composer, the renderer, the proposer, the display truth\'s flag', () => {
    for (const r of [{ author_kind: 'agent' }, { composed_via: 'agent' }, { renderer_kind: 'agent' }, { proposed_by_kind: 'agent' }, { agent_authored: true }]) expect(isAgentAuthored(r)).toBe(true);
    for (const r of [{ author_kind: 'human' }, {}, null]) expect(isAgentAuthored(r)).toBe(false);
  });
});

/* ── THE AI-NOTICE RATCHET (Q16; DESIGN D16) ── */
const WEB = join(__dirname, '..');
const walkPages = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walkPages(p) : n === 'page.tsx' ? [p] : []; });
/** Pages rendering agent-authored content without <AiNotice at B82 §TS (2026-10-19) — each names its carrier; the list may only shrink. */
const AI_NOTICE_PENDING: Readonly<Record<string, string>> = {
  'app/decisions/briefings/page.tsx': 'B82 §EV (decisions/briefings)',
  'app/graph/strategy/page.tsx': 'B82 §GM (graph/strategy)',
  'app/graph/strategy/planning/page.tsx': 'B82 §GM (graph/strategy, the planning view)',
  'app/prediction/domains/page.tsx': 'the stage that next builds the page (B83, F-P7-E-14); B111 sweeps the remainder',
  'app/graph/data/analytics/experience/page.tsx': 'the stage that next builds the page; B111 sweeps the remainder',
  'app/admin/governance/design/page.tsx': 'the stage that next builds the page (B84, F-P7-E-16); B111 sweeps the remainder',
  'app/admin/onboarding/migration/page.tsx': 'the stage that next builds the page; B111 sweeps the remainder',
};
describe('Q16 · the AI-notice ratchet over app/**/page.tsx', () => {
  const findings = walkPages(join(WEB, 'app')).filter((p) => aiNoticeFinding(readFileSync(p, 'utf8')) === 'missing').map((p) => relative(WEB, p).split('\\').join('/')).sort();
  it('§TS\'s AI-assisted page carries the notice (decisions/recommendations)', () => {
    expect(findings).not.toContain('app/decisions/recommendations/page.tsx');
    expect(readFileSync(join(WEB, 'app/decisions/recommendations/page.tsx'), 'utf8')).toMatch(/<AiNotice\b/);
  });
  it('no page outside the committed list renders agent-authored content without the notice; the list only shrinks', () => {
    expect(findings.filter((p) => AI_NOTICE_PENDING[p] === undefined)).toEqual([]);
  });
  it('the finding itself: markers without the notice → missing; with it → none; no markers → none', () => {
    expect(aiNoticeFinding('const k = r.author_kind;')).toBe('missing');
    expect(aiNoticeFinding('const k = r.author_kind; <AiNotice output="recommended" producer={null} />')).toBeNull();
    expect(aiNoticeFinding('<p>no AI here</p>')).toBeNull();
  });
});

describe('CMP-023 / HX-15 · freshness', () => {
  const proj = (over: Partial<ProjectionBlock> = {}): ProjectionBlock => ({ revision: 42, verified_seq: 40, verified_at: '2026-10-19T08:00:00Z', verified_check_id: null, checkpoint_seq: 40, lag_events: 0,
    unresolved_deliveries: 0, subscription: { subscription_id: null, status: null }, partitions: [], condition: 'current', degraded: false, code: null, label: null, withdrawn: [], domain_withdrawn: [], ...over } as ProjectionBlock);
  it('current: the cutoff, the read instant, the source health and the projection watermark; nothing constrained', () => {
    const f = freshnessView({ cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T09:00:00Z', sources: [{ label: 'PortWatch chokepoints', state: 'healthy', lastSeen: '2026-10-18T06:00:00Z' }], projection: proj() });
    expect(f.state).toBe('current'); expect(f.constrains).toBeNull();
    expect(f.watermark).toBe('CURRENT as of 2026-10-19T09:00:00Z — cutoff 2026-10-18T00:00:00Z');
    expect(f.lines).toEqual(['Data cutoff: 2026-10-18T00:00:00Z', 'Read at: 2026-10-19T09:00:00Z', 'Source PortWatch chokepoints: HEALTHY (last seen 2026-10-18T06:00:00Z)',
      'Projection watermark: revision 42, verified 2026-10-19T08:00:00Z (current)']);
  });
  it('stale or partial CONSTRAINS the consequential commands, with the reason', () => {
    const s = freshnessView({ cutoff: null, asOf: '2026-10-19T09:00:00Z', sources: [{ label: 'red-sea-ais-positions', state: 'stale', lastSeen: null }] });
    expect(s).toMatchObject({ state: 'stale', watermark: 'STALE — red-sea-ais-positions not current' });
    expect(s.constrains).toMatch(/consequential commands that depend on it are held/);
    const p = freshnessView({ cutoff: '2026-10-18T00:00:00Z', asOf: 'x', projection: proj({ condition: 'lagging', lag_events: 3 } as Partial<ProjectionBlock>), missingIntervals: [{ from: '2026-10-01', to: '2026-10-03' }] });
    expect(p.state).toBe('partial'); expect(p.partial.complete).toBe(false); expect(p.constrains).toMatch(/^the read is partial/);
    expect(freshnessView({ cutoff: null, asOf: null }).state).toBe('unknown');
  });
  it('CURRENT is never inferred from a cutoff alone — nothing verified it, so it says so', () => {
    const f = freshnessView({ cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T09:00:00Z', live: true, sourcesNote: 'not read — HTTP 403' });
    expect(f.state).toBe('unknown'); expect(f.constrains).toBeNull();
    expect(f.watermark).toBe('FRESHNESS NOT VERIFIED — cutoff 2026-10-18T00:00:00Z; no source health or projection watermark verifies it on this read');
    expect(f.lines).toContain('Source health: not read — HTTP 403');
    expect(f.lines).toContain('Read at: 2026-10-19T09:00:00Z (live — no as-of applied)');
  });
});

describe('UX-06-001 / -003 / -005 · the state strip and the one-dimension entry', () => {
  it('truth, freshness, policy and authority — each stated; an indeterminate truth or stale data names what it holds', () => {
    const ind = displayTruthOf(row({ display: 'indeterminate', stored: 'asserted', correction_of: null, reasons: [{ code: 'unfit', ref: null, detail: 'marked UNFIT' }] }))!;
    const items = stateStripView({ truth: ind, freshness: freshnessView({ cutoff: null, asOf: null, sources: [{ label: 'AIS', state: 'stale', lastSeen: null }] }), policy: { classification: 'internal', purpose: 'intelligence' }, authority: 'no approval exists for this version' });
    expect(items.map((i) => i.key)).toEqual(['truth', 'freshness', 'policy', 'authority']);
    expect(items[0]).toMatchObject({ value: 'INDETERMINATE (stored ASSERTED)', held: 'the truth state is INDETERMINATE — marked UNFIT; propose is held until it is resolved' });
    expect(items[1]!.held).toMatch(/stale/); expect(items[2]!.value).toBe('classification internal · purpose intelligence');
    expect(stateStripView({ truth: null, authority: 'x' })[0]).toMatchObject({ value: 'not read on this page', held: null });
  });
  it('the switch opened for ONE dimension, with the person\'s pending commands named — never altered by it', () => {
    expect(dimensionIntro('horizon')).toMatch(/^You opened the switch for ONE dimension — the horizon\./);
    expect(pendingCommandsLine([])).toBe('You hold no pending command on this page — no draft and no open Command Review.');
    expect(pendingCommandsLine([{ label: 'the review of recommendation 01a0…', kind: 'command_review' }, { label: 'your recommendation draft', kind: 'draft' }]))
      .toBe('Your pending commands here, unaffected by the switch: the review of recommendation 01a0… (an open Command Review — it keeps its digest; a switch approves nothing); your recommendation draft (your draft — stays yours, never submitted by a switch).');
  });
});

describe('the read\'s batching and refs', () => {
  it('unique refs in batches of ≤ 200, in order; malformed ones dropped', () => {
    const refs = Array.from({ length: 450 }, (_, i) => ({ type: 'EVD', id: `${ID.slice(0, -3)}${String(i % 430).padStart(3, '0')}`, version: 1 }));
    const b = truthBatches([...refs, { type: 'evd', id: ID, version: 1 }, { type: 'EVD', id: ID, version: 0 }]);
    expect(b.map((x) => x.length)).toEqual([200, 200, 30]);
    expect(refKey(b[0]![0]!)).toBe(`EVD:${ID.slice(0, -3)}000@1`);
  });
  it('a ref from a row', () => {
    expect(refOfRow({ object_type: 'CLM', object_id: ID, object_version: '3' })).toEqual({ type: 'CLM', id: ID, version: 3 });
    expect(refOfRow({ object_id: ID, object_version: 1 }, 'WRN')).toEqual({ type: 'WRN', id: ID, version: 1 });
    expect(refOfRow({ object_type: 'CLM', object_id: ID })).toBeNull();
  });
});

describe('the library contract (LIBRARY_B82.truth)', () => {
  it('components/truth.tsx exports exactly the components the seams name — no more (B107\'s inventory reads them)', () => {
    const src = readFileSync(join(WEB, 'components/truth.tsx'), 'utf8');
    const exported = [...src.matchAll(/^export function ([A-Z][A-Za-z0-9_]*)/gm)].map((m) => m[1]).sort();
    expect(exported).toEqual([...LIBRARY_B82.truth.exports].sort());
    expect(src).toMatch(/<TruthBadge\b/);   // D6: TruthBadge wrapped, never edited
    expect(src).toMatch(/<Term\b/);
  });
});
