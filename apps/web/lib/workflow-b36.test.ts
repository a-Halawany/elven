import { describe, expect, it } from 'vitest';
import { completableNow, deliveryWords, externalSurface, pickupCodeShape, waitsOnWords, type Delivery, type GrantSurface } from './workflow';

/** CP-6 B36 (0094 §C): the dependencies, the delivery and the external's surface are the server's; the pages word them. */
describe('B36 collab · the words of the dependencies, the delivery and the external\'s surface', () => {
  const now = '2026-09-30T12:00:00.000Z';
  it('what a task waits on, and whether Complete is offered', () => {
    expect(waitsOnWords([])).toBe('waits on nothing');
    expect(waitsOnWords(undefined)).toBe('waits on nothing');
    expect(waitsOnWords([{ task_id: 'a', title: 'Review the route summary', state: 'open' }, { task_id: 'b', title: 'Customs brief', state: 'escalated' }]))
      .toBe('waits on "Review the route summary" (open), "Customs brief" (escalated) — completed when they are');
    expect(completableNow({ kind: 'collab.review', blocked: false })).toBe(true);
    expect(completableNow({ kind: 'collab.review', blocked: true })).toBe(false);
    expect(completableNow({ kind: 'gate.approve', blocked: false })).toBe(false);
  });
  it('the delivery: delivered with the code\'s expiry, picked up, locked, expired, or not delivered', () => {
    const base: Delivery = { delivery_id: 'd', channel: 'demo-mailbox', synthetic: true, delivered_at: now, code_expires_at: '2026-10-02T12:00:00.000Z', failures: 0, locked_at: null, picked_up_at: null, picked_up_from: null, state: 'delivered', attempts: [] };
    expect(deliveryWords(null, now)).toBe('not delivered to the mailbox');
    expect(deliveryWords(base, now)).toBe('delivered to the SYNTHETIC mailbox · code expires in 2 d');
    expect(deliveryWords({ ...base, failures: 2 }, now)).toBe('delivered to the SYNTHETIC mailbox · code expires in 2 d · 2 wrong code(s)');
    expect(deliveryWords({ ...base, state: 'picked_up', picked_up_at: now, picked_up_from: '127.0.0.1' }, now)).toBe('picked up from 127.0.0.1');
    expect(deliveryWords({ ...base, state: 'locked', failures: 5, locked_at: now }, now)).toBe('LOCKED after 5 wrong codes — the owner revokes and re-invites');
    expect(deliveryWords({ ...base, state: 'expired', failures: 1 }, now)).toBe('code expired · 1 wrong code(s)');
  });
  it('the pickup code as typed: normalised for display; anything else is not a code', () => {
    expect(pickupCodeShape('abcd efgh jkmn')).toBe('ABCD-EFGH-JKMN');
    expect(pickupCodeShape('oil0-1234-5678')).toBe('0110-1234-5678');
    expect(pickupCodeShape('ABCD-EFGH')).toBeNull();
    expect(pickupCodeShape('ABCD-EFGH-JKMU')).toBeNull();
  });
  it('the external\'s surface: the live grant\'s workspace, else why there is none', () => {
    const g = (over: Partial<GrantSurface>): GrantSurface => ({ grant_id: 'g', workspace_id: 'w', workspace_title: 'Dual-sourcing review', purpose: 'collaboration.dual-sourcing-review', audience_ceiling: 'internal',
      state: 'accepted', expires_at: '2026-10-14T00:00:00.000Z', invitation_expires_at: null, accepted_at: now, live: true, expired: false, ended: false, reason: null, ...over });
    expect(externalSurface(null)).toEqual({ kind: 'none' });
    expect(externalSurface({ grants: [], expired: false })).toEqual({ kind: 'none' });
    expect(externalSurface({ grants: [g({})], expired: false })).toMatchObject({ kind: 'workspace', grant: { workspace_id: 'w' } });
    expect(externalSurface({ grants: [g({ live: false, expired: true, reason: 'expired' })], expired: true })).toEqual({ kind: 'expired', reason: 'expired' });
    expect(externalSurface({ grants: [g({ live: false, ended: true, state: 'revoked', reason: 'revoked' })], expired: false })).toEqual({ kind: 'expired', reason: 'revoked' });
  });
});
