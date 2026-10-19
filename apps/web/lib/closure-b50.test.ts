/**
 * B50 §CL — the correction-closure contract as pure functions (lib/closure-b50.ts): the consumer words, the deadline words (the server's
 * instants only), the freeze marker and its link, the per-consumer acts and their reasons (the port's rules mirrored), the close readiness
 * (the server's reasons, never inferred), the closure record and the notice. Every fixture is SYNTHETIC. CONSTRUCTION only.
 */
import { describe, expect, it } from 'vitest';
import {
  CLOSURE_ACTIONS, CONSUMER_STATE_WORDS, actConsequence, closeReadiness, closureStateWords, closureSummary, consumerActs, consumerStateWord, deadlineWords, freezeMarker,
  noticeSections, toClosureRecord, toConsumerAck, type ClosureConsumer,
} from './closure-b50';
import { isIrreversible } from './authority-b81';

const CASE = '01a1522a-0000-7000-8000-00000000c0de';
const OWNER = '01a1522a-0000-7000-8000-0000000000aa';
const APPLIER = '01a1522a-0000-7000-8000-0000000000bb';
const OTHER = '01a1522a-0000-7000-8000-0000000000cc';
const consumer = (over: Partial<ClosureConsumer> = {}): ClosureConsumer => ({
  consumer_kind: 'affected_product', consumer_ref: `DPK:${'01a1522a-0000-7000-8000-000000000001'}@1`, product_kind: 'decision_package', object_type: 'DPK',
  product_id: '01a1522a-0000-7000-8000-000000000001', product_version: 1, class: 'human_review', material: true, owner: OWNER, title: 'Reroute via the Cape (SYNTHETIC)',
  bucket: 'decision_packages', subscription_id: null, delivery_state: null, failure_class: null, state: 'pending', closing: false, deadline: '2026-10-20T08:00:00.000Z',
  overdue: false, frozen: false, ack: null, ...over,
});
const me = (principalId: string, roles: string[] = []) => ({ principalId, roles, appliedBy: APPLIER });

describe('the consumer words', () => {
  it('every server state has a glyph and a word (never colour alone); an unknown state is the server\'s word, flagged', () => {
    for (const [k, w] of Object.entries(CONSUMER_STATE_WORDS)) { expect(w.glyph.length, k).toBeGreaterThan(0); expect(w.label.length, k).toBeGreaterThan(2); }
    expect(consumerStateWord('bounded_exception')).toMatchObject({ label: 'bounded exception', known: true });
    expect(consumerStateWord('in_limbo')).toEqual({ glyph: '?', label: 'in_limbo', next: 'not a known consumer state — read the record', known: false });
    expect(CONSUMER_STATE_WORDS.failed.closing).toBe(false);
    expect(CONSUMER_STATE_WORDS.delivered.closing).toBe(true);
  });
  it('the deadline in words: the server decides overdue; a failed delivery stalls at once; no contract says so', () => {
    expect(deadlineWords(consumer(), 2)).toBe('acknowledgement due by 2026-10-20T08:00:00.000Z');
    expect(deadlineWords(consumer({ overdue: true }), 2)).toMatch(/^past its acknowledgement window \(due 2026-10-20T08:00:00.000Z\) — the case is stalled$/);
    expect(deadlineWords(consumer({ deadline: null }), null)).toBe('no window: the domain has declared no closure contract');
    expect(deadlineWords(consumer({ consumer_kind: 'subscription', state: 'failed', deadline: null }), 2)).toMatch(/immediate stall/);
    expect(deadlineWords(consumer({ closing: true }), 2)).toBe('closed — no deadline');
  });
  it('the ConsumerAck seam: the latest act, an exception carried; an unknown state is pending, never inferred closed', () => {
    const a = toConsumerAck(CASE, consumer({ state: 'bounded_exception', ack: { ack_id: 'a1', state: 'bounded_exception', by: OWNER, at: '2026-10-19T08:00:00Z', note: null, recompute_ref: null,
      exception: { reason: 'reissued next week (SYNTHETIC)', expires_at: '2026-10-26T08:00:00Z', owner: OWNER } } }));
    expect(a).toMatchObject({ caseId: CASE, state: 'bounded_exception', exception: { reason: 'reissued next week (SYNTHETIC)', expiresAt: '2026-10-26T08:00:00Z', owner: OWNER } });
    expect(toConsumerAck(CASE, consumer({ state: 'exception_expired' })).state).toBe('pending');
  });
});

describe('the freeze marker', () => {
  it('a frozen product says so and links to its case; an unfrozen one carries no marker', () => {
    expect(freezeMarker({ frozen: false, caseId: null })).toEqual({ frozen: false, text: 'not frozen', href: null });
    expect(freezeMarker({ frozen: true, caseId: CASE })).toEqual({ frozen: true, text: 'FROZEN by correction case 01a1522a… — publication, delivery and export are refused until it closes', href: `/observation/corrections/${CASE}` });
    expect(freezeMarker({ frozen: true, caseId: null }).href).toBeNull();
  });
});

describe('the per-consumer acts (the port\'s rules, mirrored; the server re-checks)', () => {
  it('the owner acknowledges; never recomputes a human review; the correction authority never acknowledges a human review; another person is told whose it is', () => {
    const own = consumerActs(consumer(), me(OWNER), false);
    expect(own.acknowledge).toEqual({ enabled: true, reason: null });
    expect(own.recompute.enabled).toBe(false);
    expect(own.recompute.reason).toMatch(/never recomputed \(no automatic rewrite\)/);
    const applier = consumerActs(consumer(), me(APPLIER, ['collection_manager']), false);
    expect(applier.acknowledge.reason).toMatch(/^separation of duties: the correction authority/);
    expect(consumerActs(consumer(), me(OTHER, ['domain_admin']), false).acknowledge.reason).toMatch(/its owner \(01a1522a…\) closes it/);
    expect(consumerActs(consumer(), me(OTHER, ['domain_admin']), false).except.enabled).toBe(true);
  });
  it('a product with no owner is a steward\'s; a subscription is acknowledged only after a failure; a current product needs nothing; a closed case nothing', () => {
    expect(consumerActs(consumer({ owner: null, class: 'recompute' }), me(OTHER, ['knowledge_owner']), false).acknowledge.enabled).toBe(true);
    expect(consumerActs(consumer({ owner: null, class: 'recompute' }), me(OTHER, ['domain_analyst']), false).acknowledge.reason).toMatch(/a knowledge owner or the domain administrator/);
    const sub = consumer({ consumer_kind: 'subscription', consumer_ref: 'SUB:01a1522a-0000-7000-8000-000000000009', class: null, state: 'delivered', closing: true, owner: OWNER });
    expect(consumerActs(sub, me(OWNER), false).acknowledge.reason).toMatch(/already delivered/);
    expect(consumerActs({ ...sub, state: 'failed', closing: false }, me(OWNER), false).acknowledge.enabled).toBe(true);
    expect(consumerActs({ ...sub, state: 'failed', closing: false }, me(OWNER), false).recompute.reason).toMatch(/never recomputed/);
    expect(consumerActs({ ...sub, state: 'failed', closing: false }, me(OWNER), false).freeze.reason).toBe('only an affected product is frozen');
    expect(consumerActs(consumer({ material: false, class: 'current', state: 'current' }), me(OWNER), false).acknowledge.reason).toMatch(/current/);
    expect(consumerActs(consumer(), me(OWNER), true).acknowledge.reason).toMatch(/the case is closed/);
  });
  it('the freeze is a steward\'s act, once', () => {
    expect(consumerActs(consumer(), me(OTHER, ['data_steward']), false).freeze.enabled).toBe(true);
    expect(consumerActs(consumer({ frozen: true }), me(OTHER, ['data_steward']), false).freeze.reason).toBe('it is already frozen');
    expect(consumerActs(consumer(), me(OWNER, ['decision_owner']), false).freeze.enabled).toBe(false);
  });
});

describe('the close readiness and the record', () => {
  it('the server\'s reasons are shown as given; the projection check must be read; the authority is required; nothing is inferred ready', () => {
    const r = closeReadiness({ tracked: true, closure: { state: 'stalled' }, readiness: { ready: false, reasons: ['2 material consumer(s) are not closed'], projections_checked: false } }, me(APPLIER, ['collection_manager']));
    expect(r.enabled).toBe(false);
    expect(r.reasons).toEqual(['2 material consumer(s) are not closed', 'run the projection check in this read first (the close re-checks it in its own write)']);
    expect(closeReadiness({ tracked: true, closure: { state: 'open' }, readiness: { ready: true, reasons: [], projections_checked: true } }, me(APPLIER, ['collection_manager']))).toEqual({ enabled: true, reasons: [] });
    expect(closeReadiness({ tracked: true, closure: { state: 'open' }, readiness: { ready: true, reasons: [], projections_checked: true } }, me(OTHER, ['domain_analyst'])).enabled).toBe(false);
    expect(closeReadiness({ tracked: false, closure: null, readiness: { ready: false, reasons: [], projections_checked: true } }, me(APPLIER, ['collection_manager'])).reasons[0]).toMatch(/adopt it first/);
    expect(closeReadiness({ tracked: true, closure: { state: 'open' }, readiness: null }, me(APPLIER, ['collection_manager'])).enabled).toBe(false);
  });
  it('the record: only a CLOSED closure yields one; its counts and digest are the server\'s', () => {
    expect(toClosureRecord({ state: 'stalled' }, { closure_id: 'x' })).toBeNull();
    const rec = toClosureRecord({ state: 'closed', audit_digest: 'a'.repeat(64) }, {
      closure_id: 'c1', case_id: CASE, closed_by: APPLIER, closed_at: '2026-10-19T09:00:00Z', reached_consumers: 7,
      failed_deliveries: [{ ref: 'SUB:s1', failure: 'delivery failed consumer_unavailable' }],
      residual_exposure: [{ ref: 'PUB:p1@1', class: 'stale', exception: { reason: 'reissued next week', expires_at: '2026-10-26T08:00:00Z', owner: OWNER } }],
      acknowledgements: [{ ack_id: 'a1', consumer_kind: 'affected_product', consumer_ref: 'DPK:d1@1', state: 'acknowledged', by: OWNER, at: '2026-10-19T08:30:00Z', exception: null }],
      projections: { reconciled: true },
    })!;
    expect(rec).toMatchObject({ caseId: CASE, reachedConsumers: 7, projectionsReconciled: true, auditDigest: 'a'.repeat(64) });
    expect(closureSummary(rec)).toBe(`7 consumer(s) reached · 1 failed delivery · 1 under a bounded exception (residual exposure) · 1 act(s) recorded · projections reconciled · audit digest ${'a'.repeat(12)}…`);
  });
  it('the notice (HX-18): the original, the correction, the affected products, the decisions, the required review, the closure — in that order', () => {
    const s = noticeSections({ original: [{ object_id: 'e1', from_version: 1, to_version: 2 }], correction: { kind: 'correction', reason: 'restated transits', received_at: 'r', applied_at: 'a' },
      affected_products: [{ ref: 'WRN:w1', title: 'Bab el-Mandeb warning', class: 'stale', state: 'pending', frozen: true }], decisions: [{ ref: 'DPK:d1@1', title: 'Reroute', state: 'acknowledged' }],
      required_review: [{ ref: 'DPK:d1@1', title: 'Reroute', state: 'acknowledged' }], closure: { state: 'stalled' } });
    expect(s.map((x) => x.key)).toEqual(['original', 'correction', 'affected', 'decisions', 'review', 'closure']);
    expect(s[0]!.items).toEqual(['e1: version 1 superseded by 2']);
    expect(s[2]!.items).toEqual(['Bab el-Mandeb warning — stale, pending, FROZEN']);
    expect(s[5]!.items[0]).toMatch(/^open \(stalled\)/);
    expect(noticeSections(null)).toEqual([]);
  });
  it('the list words: applied is never shown closed; the acts\' names; the close cannot be undone (a typed confirmation), the acknowledgement can', () => {
    expect(closureStateWords('open')).toMatch(/^open/);
    expect(closureStateWords('not_tracked')).toMatch(/adopt it/);
    expect(CLOSURE_ACTIONS.close).toBe('graph.closure.close');
    expect(isIrreversible(CLOSURE_ACTIONS.close)).toBe(true);
    expect(isIrreversible(CLOSURE_ACTIONS.acknowledge)).toBe(false);
    expect(actConsequence('close', CASE).reversibility).toMatch(/cannot be undone/);
    expect(actConsequence('acknowledge', 'DPK:d1@1').effect).toMatch(/nothing is rewritten/);
    for (const k of Object.keys(CLOSURE_ACTIONS) as Array<keyof typeof CLOSURE_ACTIONS>) expect(actConsequence(k, 'x').source).toBe('stated');
  });
});
