import { describe, expect, it } from 'vitest';
import {
  acceptCommitted, acceptCurrent, actionGate, assess, assessmentText, classify, clearRows, consequenceDigest, emptySelection, headerState, isSelected, outcomeText,
  runPerItem, selectExactly, toggle, type Candidate,
} from './selection-b80';

/** CP-6 B80 §CL-D (PAT-18, UX-22-003/-004/-005): bulk selection. Every row is SYNTHETIC fixture data. */
const fp = (lifecycle: string, mode = 'replay') => `${lifecycle}|${mode}|v1`;
const cand = (id: string, lifecycle: string, mode = 'replay', reason?: string): Candidate =>
  ({ id, label: `${id}@v1`, fingerprint: fp(lifecycle, mode), eligibility: reason === undefined ? { ok: true } : { ok: false, reason } });

describe('selection: exact identified rows, no select-all ambiguity', () => {
  it('toggle, select exactly the matched rows (a prior snapshot is kept), clear, header state against the rows SHOWN', () => {
    let s = emptySelection('sources');
    s = toggle(s, cand('a', 'active'));
    expect(isSelected(s, 'a')).toBe(true);
    s = selectExactly(s, [cand('a', 'suspended'), cand('b', 'active')]);
    expect(s.items).toEqual([{ id: 'a', label: 'a@v1', fingerprint: fp('active') }, { id: 'b', label: 'b@v1', fingerprint: fp('active') }]);
    expect(headerState(s, ['a', 'b'])).toBe('true');
    expect(headerState(s, ['a', 'b', 'c'])).toBe('mixed');
    expect(headerState(s, ['c'])).toBe('false');
    expect(headerState(s, [])).toBe('false');
    s = clearRows(s, ['a']); expect(s.items.map((x) => x.id)).toEqual(['b']);
    s = toggle(s, cand('b', 'active')); expect(s.items).toEqual([]);
  });
});

describe('the assessment, BEFORE the action: included / excluded with reasons / hidden / changed / missing', () => {
  const selection = selectExactly(emptySelection('sources'), [cand('a', 'active'), cand('b', 'active', 'live'), cand('c', 'active'), cand('d', 'active'), cand('e', 'active')]);
  const current: Candidate[] = [
    cand('a', 'active'),
    cand('b', 'active', 'live', 'live-mode source: a lifecycle change also changes its schedule — act on it alone'),
    cand('c', 'suspended', 'replay', 'not in a state this action applies to (suspended; the action applies to active)'),
    cand('d', 'active'),
  ];
  const shown = new Set(['a', 'b', 'c']);
  const a = assess(selection, current, shown);
  it('every selected row lands in exactly one of included / excluded / hidden / missing; changed is reported on top', () => {
    expect(a.included.map((x) => x.id)).toEqual(['a']);
    expect(a.excluded.map((x) => [x.id, x.reason])).toEqual([['b', expect.stringMatching(/^live-mode/)], ['c', expect.stringMatching(/^not in a state/)]]);
    expect(a.hidden.map((x) => x.id)).toEqual(['d']);
    expect(a.missing.map((x) => x.id)).toEqual(['e']);
    expect(a.changed.map((x) => [x.id, x.fingerprint, x.now])).toEqual([['c', fp('active'), fp('suspended')]]);
    expect(a.counts).toEqual({ selected: 5, included: 1, excluded: 2, hidden: 1, changed: 1, missing: 1 });
    expect(assessmentText(a)).toBe('5 selected · 1 included · 2 excluded · 1 hidden by the filter · 1 changed since selection · 1 no longer in this read');
  });
  it('the action is FROZEN while rows changed or left the read; the reason param is required; nothing included = disabled', () => {
    const d = consequenceDigest({ key: 'suspend', params: { reason: 'x' } }, a);
    const g = actionGate(a, { requiredParams: { reason: '' }, confirmedDigest: null, digest: d });
    expect(g.allowed).toBe(false);
    expect(g.reasons).toEqual([
      expect.stringMatching(/1 selected row\(s\) changed since selection/),
      expect.stringMatching(/1 selected row\(s\) are no longer in this read/),
      expect.stringMatching(/the reason is required/),
    ]);
    const none = assess(emptySelection('s'), current, shown);
    expect(actionGate(none, { requiredParams: {}, confirmedDigest: null, digest: 'x' }).reasons[0]).toMatch(/nothing is included/);
  });
  it('accepting the current state re-snapshots (missing rows leave); then the gate opens on a reviewed digest only', () => {
    const s2 = acceptCurrent(selection, current);
    expect(s2.items.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    const a2 = assess(s2, current, new Set(['a', 'b', 'c', 'd']));
    expect(a2.counts).toEqual({ selected: 4, included: 2, excluded: 2, hidden: 0, changed: 0, missing: 0 });
    const d = consequenceDigest({ key: 'suspend', params: { reason: 'drill' } }, a2);
    expect(actionGate(a2, { requiredParams: { reason: 'drill' }, confirmedDigest: d, digest: d })).toEqual({ allowed: true, reasons: [] });
    expect(actionGate(a2, { requiredParams: { reason: 'drill' }, confirmedDigest: 'stale', digest: d }).reasons).toEqual(['the consequence changed after it was reviewed — review it again']);
    expect(actionGate(a2, { requiredParams: { reason: 'drill' }, confirmedDigest: d, digest: d, busy: true }).allowed).toBe(false);
  });
  it('after a run only the committed items are re-snapshotted; a concurrent change elsewhere stays reported', () => {
    const s = selectExactly(emptySelection('s'), [cand('a', 'active'), cand('d', 'active')]);
    const after = [cand('a', 'suspended'), cand('d', 'suspended')];
    const s2 = acceptCommitted(s, after, ['a']);
    expect(s2.items.map((x) => x.fingerprint)).toEqual([fp('suspended'), fp('active')]);
    expect(assess(s2, after, new Set(['a', 'd'])).changed.map((x) => x.id)).toEqual(['d']);
  });
  it('the consequence digest binds the action, its parameters and the exact included items at their state (order-free)', () => {
    const s2 = acceptCurrent(selection, current);
    const a2 = assess(s2, current, new Set(['a', 'b', 'c', 'd']));
    const d1 = consequenceDigest({ key: 'suspend', params: { reason: 'r' } }, a2);
    expect(consequenceDigest({ key: 'suspend', params: { reason: 'r' } }, { ...a2, included: [...a2.included].reverse() })).toBe(d1);
    expect(consequenceDigest({ key: 'suspend', params: { reason: 'r2' } }, a2)).not.toBe(d1);
    expect(consequenceDigest({ key: 'reactivate', params: { reason: 'r' } }, a2)).not.toBe(d1);
    expect(consequenceDigest({ key: 'suspend', params: { reason: 'r' } }, { ...a2, included: a2.included.slice(1) })).not.toBe(d1);
  });
});

describe('the per-item run: a receipt each; no answer is UNKNOWN, never success', () => {
  const item = { id: 'a', label: 'a@v1', fingerprint: 'f' };
  it('classify: committed only with a receipt; refused in the server\'s words; status 0 or no receipt = unknown', () => {
    expect(classify(item, { ok: true, status: 201, receipt: { policyDecisionId: 'p', auditSeq: 7 } })).toMatchObject({ outcome: 'committed', receipt: { auditSeq: 7 } });
    expect(classify(item, { ok: false, status: 403, error: { code: 'EYE-AUTHZ-001', message: 'source rejected (actor): not yours', correlationId: 'c' } })).toMatchObject({ outcome: 'refused', error: { message: 'source rejected (actor): not yours' } });
    expect(classify(item, { ok: false, status: 0, error: { code: 'EYE-DEP-001', message: 'API unreachable', correlationId: 'c' } }).outcome).toBe('unknown');
    expect(classify(item, { ok: true, status: 201 }).outcome).toBe('unknown');
  });
  it('one at a time, in order; progress reported as answers arrive; a cancel leaves the rest not attempted; a throw is unknown', async () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: `${id}@v1`, fingerprint: 'f' }));
    const sent: string[] = []; const seen: number[] = [];
    let stop = false;
    const out = await runPerItem(items, async (it) => {
      sent.push(it.id);
      if (it.id === 'b') return { ok: false, status: 409, error: { code: 'EYE-STATE', message: 'source rejected (state): already suspended', correlationId: 'x' } };
      if (it.id === 'c') { stop = true; throw new Error('socket hang up'); }
      return { ok: true, status: 201, receipt: { policyDecisionId: `p-${it.id}`, auditSeq: 1 } };
    }, { onItem: (_o, done) => seen.push(done), shouldStop: () => stop });
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(out.map((o) => o.outcome)).toEqual(['committed', 'refused', 'unknown', 'not_attempted']);
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(outcomeText(out)).toBe('4 items: 1 committed (each with its receipt) · 1 refused · 1 UNKNOWN — no answer arrived; re-read before acting again · 1 not attempted');
  });
});
