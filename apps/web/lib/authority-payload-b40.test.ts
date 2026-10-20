/**
 * B40 res (R1) — the CLIENT-SIDE PAYLOAD REVIEW of the two impact-trigger commands (record a trigger, close a challenge), on the pure model:
 * lib/authority-b81 (canonicalPayload, payloadReviewState, commandReviewGate's explicit payload-review mode) and lib/impact-b50 (the exact
 * payloads the page reviews and sends). The digest freeze is untouched for every other act; a dummy digest is never a substitute.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAYLOAD_REVIEW_NOTE, canonicalPayload, commandReviewGate, digestFreeze, eligibility, payloadReviewState, type ReviewState } from './authority-b81';
import { CHALLENGE_CLOSE_CONTRACT, TRIGGER_RECORD_CONTRACT, closeReviewPayload, triggerPayload, triggerReviewPayload, type TriggerForm } from './impact-b50';

const CLM = '01a084f5-9fb5-7a51-b5bb-f7e22666ff29';
const TRG = '01a15307-c7fb-7db7-8506-19efb7b41475';
const form = (over: Partial<TriggerForm> = {}): TriggerForm => ({
  kind: 'human_challenge', objectType: 'CLM', objectId: CLM, reason: 'the claim rests on a restated figure', basis: { statement: 'the figure was restated' }, ...over,
});
const analyst = eligibility({ action: 'graph.impact.trigger.human_challenge', me: 'p1', isHuman: true, roles: ['domain_analyst'], requiredRoles: ['domain_analyst', 'knowledge_owner'] });
const owner = eligibility({ action: 'graph.impact.trigger.close', me: 'p2', isHuman: true, roles: ['knowledge_owner'], requiredRoles: ['knowledge_owner', 'domain_admin'],
  excluded: [{ principal: 'p1', why: 'you opened this challenge' }] });
const recordState = (reviewed: string | null, f: TriggerForm): ReviewState => ({
  eligibility: analyst, shownDigest: null, currentDigest: null, consequenceRead: true, source: 'deliberate',
  payloadReview: { reviewed, current: canonicalPayload(triggerReviewPayload(f)) },
});

describe('canonicalPayload — one text per payload', () => {
  it('sorts keys at every depth, keeps array order, drops undefined, and distinguishes every value change', () => {
    expect(canonicalPayload({ b: 1, a: { d: [2, 1], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
    expect(canonicalPayload({ a: 1, b: undefined })).toBe(canonicalPayload({ a: 1 }));
    expect(canonicalPayload({ a: [1, 2] })).not.toBe(canonicalPayload({ a: [2, 1] }));
    expect(canonicalPayload({ reason: 'x' })).not.toBe(canonicalPayload({ reason: 'x ' }));
    expect(canonicalPayload(null)).toBe('null');
  });
});

describe('payloadReviewState — the review holds the exact payload, and says what it is', () => {
  it('unreviewed → not frozen; identical → frozen; changed → void, said as a client-side review', () => {
    expect(payloadReviewState(null, '{"a":1}')).toEqual({ frozen: false, reason: expect.stringMatching(/^review the exact payload first — this command binds no server version/) });
    expect(payloadReviewState('{"a":1}', '{"a":1}')).toEqual({ frozen: true, reason: null });
    const v = payloadReviewState('{"a":1}', '{"a":2}');
    expect(v.frozen).toBe(false);
    expect(v.reason).toMatch(/^the payload changed after you reviewed it — review it again \(a client-side payload review; the server binds no version here\)$/);
    expect(PAYLOAD_REVIEW_NOTE).toMatch(/^client-side payload review — this command carries no version or digest for the server to bind/);
  });
});

describe('commandReviewGate — the explicit payload-review mode, and ONLY where passed', () => {
  it('"Record the trigger": disabled until the exact payload is reviewed; enabled when reviewed; VOIDED by any changed input', () => {
    const f = form();
    const before = commandReviewGate({ action: 'graph.impact.trigger.human_challenge' }, recordState(null, f));
    expect(before.enabled).toBe(false);
    expect(before.reasons).toEqual(['review the exact payload first — this command binds no server version, so the review holds the payload you see']);
    const reviewed = canonicalPayload(triggerReviewPayload(f));
    expect(commandReviewGate({ action: 'graph.impact.trigger.human_challenge' }, recordState(reviewed, f))).toEqual({ enabled: true, reasons: [] });
    // every input the person can change after the review voids it: the kind, the object type, the object, the reason, the basis
    const changed: TriggerForm[] = [
      form({ reason: 'the claim rests on a restated figure — amended' }), form({ objectId: '01a084f5-9f8f-7eb6-98c5-7f8b34224557' }),
      form({ basis: { statement: 'another statement' } }), form({ objectType: 'ASM' }), form({ kind: 'data_quality_finding', basis: { dimension: 'accuracy', finding: 'restated' } }),
    ];
    for (const c of changed) {
      const g = commandReviewGate({ action: `graph.impact.trigger.${c.kind}` }, recordState(reviewed, c));
      expect(g.enabled, JSON.stringify(c)).toBe(false);
      expect(g.reasons).toContain('the payload changed after you reviewed it — review it again (a client-side payload review; the server binds no version here)');
    }
    // the same payload typed again (byte-identical after the route's own trimming) holds the review — the review binds what is SENT
    expect(commandReviewGate({ action: 'graph.impact.trigger.human_challenge' }, recordState(reviewed, form({ reason: '  the claim rests on a restated figure  ' }))).enabled).toBe(true);
  });
  it('"Close the challenge": the payload review, the rationale and the typed confirmation all hold; a changed reason voids the review', () => {
    const state = (reviewed: string | null, reason: string, typed: string): ReviewState => ({
      eligibility: owner, shownDigest: null, currentDigest: null, consequenceRead: true, source: 'deliberate', rationale: { value: reason, min: 8 },
      typed: { phrase: TRG.slice(0, 8), value: typed }, payloadReview: { reviewed, current: canonicalPayload(closeReviewPayload(TRG, reason)) },
    });
    const reason = 'checked against both sources';
    const reviewed = canonicalPayload(closeReviewPayload(TRG, reason));
    expect(commandReviewGate({ action: 'graph.impact.trigger.close' }, state(reviewed, reason, TRG.slice(0, 8)))).toEqual({ enabled: true, reasons: [] });
    expect(commandReviewGate({ action: 'graph.impact.trigger.close' }, state(reviewed, `${reason} and the registry`, TRG.slice(0, 8))).reasons)
      .toEqual(['the payload changed after you reviewed it — review it again (a client-side payload review; the server binds no version here)']);
    expect(commandReviewGate({ action: 'graph.impact.trigger.close' }, state(reviewed, reason, 'nope')).enabled).toBe(false);
    // another challenge is another payload: a review of one never enables the close of another
    expect(canonicalPayload(closeReviewPayload('01a15307-c7fb-7db7-8506-000000000000', reason))).not.toBe(reviewed);
    // the opener stays refused whatever was reviewed (separation of duties, as the port refuses it)
    const opener = { ...state(reviewed, reason, TRG.slice(0, 8)), eligibility: eligibility({ action: 'graph.impact.trigger.close', me: 'p1', isHuman: true, roles: ['knowledge_owner'],
      requiredRoles: ['knowledge_owner', 'domain_admin'], excluded: [{ principal: 'p1', why: 'you opened this challenge' }] }) };
    expect(commandReviewGate({ action: 'graph.impact.trigger.close' }, opener).reasons).toEqual(['separation of duties: you opened this challenge']);
  });
  it('without payloadReview the digest freeze is unchanged: a missing digest still disables, a different digest still voids — never relaxed', () => {
    const s: ReviewState = { eligibility: analyst, shownDigest: null, currentDigest: null, consequenceRead: true, source: 'deliberate' };
    expect(commandReviewGate({ action: 'decision.approve' }, s).reasons).toEqual([digestFreeze(null, null).reason]);
    expect(commandReviewGate({ action: 'decision.approve' }, { ...s, payloadReview: null }).reasons).toEqual([digestFreeze(null, null).reason]);
    expect(commandReviewGate({ action: 'decision.approve' }, { ...s, shownDigest: 'aaaaaaaa11', currentDigest: 'bbbbbbbb22' }).enabled).toBe(false);
    expect(commandReviewGate({ action: 'decision.approve' }, { ...s, shownDigest: 'aaaaaaaa11', currentDigest: 'aaaaaaaa11' }).enabled).toBe(true);
  });
});

describe('the payloads the page reviews ARE the payloads it sends', () => {
  it('the record payload is triggerPayload exactly (with its route); the close payload is the trimmed reason (with its challenge)', () => {
    const f = form({ objectId: CLM.toUpperCase(), reason: '  spaced reason here  ' });
    expect(triggerReviewPayload(f)).toEqual({ action: 'graph.impact.trigger.human_challenge', payload: triggerPayload(f) });
    expect(triggerReviewPayload(f).payload.objectId).toBe(CLM);
    expect(closeReviewPayload(TRG, '  why it closes  ')).toEqual({ action: 'graph.impact.trigger.close', triggerId: TRG, payload: { reason: 'why it closes' } });
    expect(TRIGGER_RECORD_CONTRACT).toMatch(/no version you read is bound$/);
    expect(CHALLENGE_CLOSE_CONTRACT).toMatch(/^that the challenge is still open/);
  });
  it('the impact page passes the payload review to exactly its two trigger commands, sends the reviewed builders, and passes no dummy digest', () => {
    const page = readFileSync(join(__dirname, '..', 'app', 'graph', 'impact', 'page.tsx'), 'utf8');
    expect(page.match(/payloadReview=\{\{/g)?.length).toBe(2);
    expect(page).toContain('payloadReview={{ payload: triggerReviewPayload(');
    expect(page).toContain('payloadReview={{ payload: closeReviewPayload(');
    expect(page).toContain('impactB50.record(scope, kind, triggerReviewPayload(');
    expect(page).toContain('impactB50.close(scope, sent.triggerId, sent.payload.reason)');
    expect(page.match(/digest=\{null\}/g)?.length).toBe(2);
    expect(page).not.toMatch(/digest=\{['"`]/);
  });
});
