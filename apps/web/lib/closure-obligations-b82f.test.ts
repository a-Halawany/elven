/**
 * B82-F cc — the owner's correction obligations (lib/closure-obligations-b82f): positive, refusal, recovery and fault cases over SYNTHETIC
 * answers shaped as graph.correction_obligations answers them.
 */
import { describe, expect, it } from 'vitest';
import { actEligibility, escalationWords, latestActWords, obligationFormProblems, obligationStateWords, parseObligations } from './closure-obligations-b82f';

const CASE = '01a15307-da43-7fef-a63d-afa50b235fbd';
const NOW = new Date(Date.now()).toISOString();
const BY = new Date(Date.now() + 30 * 86_400_000).toISOString();
const row = (over: Record<string, unknown> = {}) => ({
  case: { case_id: CASE, kind: 'correction', closure_state: 'stalled', reason: 'restated transits (SYNTHETIC)', received_at: NOW, applied_at: NOW },
  corrected: [{ object_id: '01a0e792-2771-739b-b85a-20cd6449ca29', from_version: 1, to_version: 2 }],
  consumer_ref: 'DEC:01a0e792-2771-739b-b85a-20cd6449ca29@1', consumer_kind: 'affected_product', product_kind: 'decision', object_type: 'DEC',
  product_id: '01a0e792-2771-739b-b85a-20cd6449ca29', product_version: 1, title: 'Reroute via the Cape (SYNTHETIC)', class: 'human_review',
  state: 'pending', closing: false, deadline: NOW, overdue: true, frozen: true, as_owner: true, basis: 'the accountable owner', state_digest: 'a'.repeat(64),
  latest_act: null, escalations: [{ item_id: '01a1530a-b843-7000-8000-000000000001', state: 'open', due_at: NOW, escalations: 1, created_at: NOW }],
  acts: {
    acknowledge: { allowed: true, reason: null, action: 'graph.closure.acknowledge' },
    recompute: { allowed: false, reason: 'a person\'s decision or commitment is reviewed and acknowledged by its owner, never recomputed (no automatic rewrite)', action: 'graph.closure.acknowledge' },
    except: { allowed: true, reason: null, action: 'graph.closure.except', expires_after: NOW, expires_by: BY, exception_max_days: 30, record_authority_owner_required: false },
  },
  ...over,
});

describe('parseObligations — the server\'s answer, a malformed row dropped and counted', () => {
  it('POSITIVE: a well-formed answer reads whole (the contract version and the instant kept)', () => {
    const p = parseObligations({ schema: 'eye.correction-obligations/1', contract_version: 2, as_of: NOW, obligations: [row()] });
    expect(p).toMatchObject({ dropped: 0, contractVersion: 2, asOf: NOW });
    expect(p.obligations[0]).toMatchObject({ consumer_ref: 'DEC:01a0e792-2771-739b-b85a-20cd6449ca29@1', class: 'human_review', frozen: true, as_owner: true });
    expect(p.obligations[0]!.acts.except.exception_max_days).toBe(30);
  });
  it('FAULT: a row without its case, its acts or its digest is dropped and counted — never guessed at; a non-answer is empty', () => {
    const p = parseObligations({ obligations: [row(), { ...row(), acts: null }, { ...row(), case: 'x' }, { ...row(), state_digest: undefined }, 'junk'] });
    expect(p.obligations).toHaveLength(1);
    expect(p.dropped).toBe(4);
    expect(parseObligations(null)).toEqual({ obligations: [], dropped: 0, contractVersion: null, asOf: null });
  });
});

describe('actEligibility — the SERVER says which act is open (never inferred here)', () => {
  it('an open act is eligible with the server\'s basis; a closed one carries the server\'s reason', () => {
    const o = parseObligations({ obligations: [row()] }).obligations[0]!;
    expect(actEligibility(o, 'acknowledge')).toEqual({ can: true, reason: null, role: null, basis: 'the accountable owner' });
    expect(actEligibility(o, 'recompute')).toMatchObject({ can: false, reason: expect.stringMatching(/never recomputed/) });
  });
  it('RECOVERY: after the act the server answers no act left — the page reads it so', () => {
    const done = parseObligations({ obligations: [row({ state: 'acknowledged', closing: true, latest_act: { state: 'acknowledged', at: NOW, by_you: true, recompute_ref: null, exception_expires_at: null },
      acts: { acknowledge: { allowed: false, reason: 'state: the consumer is already acknowledged', action: 'graph.closure.acknowledge' }, recompute: { allowed: false, reason: 'state: the consumer is already acknowledged', action: 'graph.closure.acknowledge' },
        except: { allowed: false, reason: 'state: the consumer is already acknowledged', action: 'graph.closure.except', expires_after: NOW, expires_by: BY, exception_max_days: 30, record_authority_owner_required: false } } })] }).obligations[0]!;
    for (const a of ['acknowledge', 'recompute', 'except'] as const) expect(actEligibility(done, a).can).toBe(false);
    expect(latestActWords(done)).toMatch(/^acknowledged at .* by you$/);
    expect(obligationStateWords(done, 2)).toMatchObject({ deadline: 'closed — no deadline' });
  });
});

describe('obligationFormProblems — the form\'s own unmet conditions, in words', () => {
  const o = parseObligations({ obligations: [row()] }).obligations[0]!;
  it('REFUSAL: a short note, a missing re-run record, an expiry outside the window, an owner that is not an id', () => {
    expect(obligationFormProblems(null, 'acknowledge', { note: '', recomputeRef: '', expiresAt: '', owner: '' })).toEqual(['choose one of your obligations']);
    expect(obligationFormProblems(o, 'acknowledge', { note: 'short', recomputeRef: '', expiresAt: '', owner: '' })).toEqual(['say what was reviewed (8 to 2000 characters)']);
    expect(obligationFormProblems(o, 'recompute', { note: 'reviewed against the restated series', recomputeRef: ' ', expiresAt: '', owner: '' })).toEqual(['name the re-run record (TYPE:<id>@<version>, or export_package:<id>)']);
    const late = new Date(Date.parse(BY) + 86_400_000).toISOString();
    expect(obligationFormProblems(o, 'except', { note: 'too short', recomputeRef: '', expiresAt: late, owner: 'me' })).toEqual([
      'state the reason the consumer cannot close now (16 to 2000 characters)', 'the exception expires after now and within 30 day(s)', 'name the exception\'s owner (a principal id — yours by default)']);
    expect(obligationFormProblems(o, 'except', { note: 'the board note is reissued next week (SYNTHETIC)', recomputeRef: '', expiresAt: '', owner: CASE })).toEqual(['enter the instant the exception expires']);
  });
  it('POSITIVE: a complete form has no unmet condition', () => {
    expect(obligationFormProblems(o, 'acknowledge', { note: 'reviewed: the reroute still holds', recomputeRef: '', expiresAt: '', owner: '' })).toEqual([]);
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(obligationFormProblems(o, 'except', { note: 'the board note is reissued next week (SYNTHETIC)', recomputeRef: '', expiresAt: soon, owner: CASE })).toEqual([]);
  });
});

describe('the words: state, deadline, escalations', () => {
  it('a stalled, frozen human review reads as pending, past its window, with its escalation', () => {
    const o = parseObligations({ obligations: [row()] }).obligations[0]!;
    expect(obligationStateWords(o, 2)).toMatchObject({ state: '○ pending', deadline: expect.stringMatching(/^past its acknowledgement window/) });
    expect(escalationWords(o)).toEqual([`stall item 01a1530a… — open, escalated 1 time(s); due ${NOW}`]);
    expect(latestActWords(o)).toBe('no act is recorded yet');
  });
});
