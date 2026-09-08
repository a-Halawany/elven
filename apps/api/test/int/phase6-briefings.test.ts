/**
 * PHASE 6 · P6-M4 — decision rooms and executive briefings, through the real database
 * and controller.
 *
 * F4: a room shows its members, its cadence and "review overdue" in words when a
 * review is due without a review event; a briefing records its watermark (the bound
 * prior, or none, and the reader's known_at) and its source records; its content
 * digest is over those and its items, so recomposition under the same watermark and
 * known_at yields the same digest and never shifts its own baseline; every item
 * carries truth state, freshness and source state; windows are ordered by time left;
 * the narrative is optional, labelled and cites only included items; reading a room
 * briefing enforces membership at read time. Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let P: { pkg: string; v: number; digest: string };
let roomId = '';
let outsider: AuthenticatedPrincipal;
let b1 = ''; let d1 = ''; let k1 = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  outsider = await h.humanWithSession(['executive'], 'executive-outside');
  P = await c.proposed();
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P6-M4 · rooms — the owner\'s space, members named, cadence bound, review overdue in words', () => {
  it('a room is opened by the package owner only; members are named humans; an agent is never a member', async () => {
    expect(await status(c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line', reviewEveryDays: 7 }, w.approver))).toBe(403);
    expect(await message(c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line', reviewEveryDays: 7 }, w.executive))).toMatch(/opened by the package owner/);
    expect(await message(c.openRoom({ packageId: uuidv7(), title: 'On nothing', reviewEveryDays: 7 }))).toMatch(/no such package/);
    expect(await status(c.openRoom({ packageId: P.pkg, title: 'x', reviewEveryDays: 0 }))).toBe(422);
    const r = await c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line', reviewEveryDays: 7 });
    roomId = r.room.roomId;
    expect(new Date(r.room.nextReviewAt).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(await message(c.openRoom({ packageId: P.pkg, title: 'Again', reviewEveryDays: 7 }))).toMatch(/already has a room/);
    await c.membership(roomId, { principal: w.approver.principalId, role: 'approver', op: 'add' });
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    await c.membership(roomId, { principal: w.approver2.principalId, role: 'dissenter', op: 'add' });
    expect(await message(c.membership(roomId, { principal: w.machinePrincipalId, role: 'observer', op: 'add' }))).toMatch(/named, active human|never a member/);
    expect(await message(c.membership(roomId, { principal: w.owner.principalId, role: 'observer', op: 'remove' }))).toMatch(/owner is not removed/);
    expect(await message(c.membership(roomId, { principal: w.authority.principalId, role: 'observer', op: 'add' }, w.executive))).toMatch(/only the room owner/);
    expect(await status(c.membership(roomId, { principal: w.authority.principalId, role: 'observer', op: 'add' }, w.approver))).toBe(403);
    const g = await c.getRoom(roomId);
    expect(g.room['state']).toBe('open');
    expect(g.room.members.filter((m) => m['live'] === true).map((m) => m['role']).sort()).toEqual(['approver', 'dissenter', 'observer', 'owner']);
    expect(g.room['review_overdue']).toBe(false);
    expect(String(g.room['review_status'])).toMatch(/^next review due /);
    // a room is read by its members; an executive outside it is refused, and the list shows membership truthfully
    expect(await status(c.getRoom(roomId, outsider))).toBe(403);
    expect((await c.listRooms(outsider)).rooms.map((r) => r['member'])).toEqual([false]);
    expect((await c.listRooms(w.approver)).rooms.map((r) => r['member'])).toEqual([true]);
  });

  it('review overdue is a fact of the clock, said in words; a member\'s review clears it and is recorded on the room and the package', async () => {
    await c.cadence(roomId, { reviewEveryDays: 7, nextReviewAt: new Date(Date.now() - 3_600_000).toISOString() });
    let g = await c.getRoom(roomId, w.executive);
    expect(g.room['review_overdue']).toBe(true);
    expect(String(g.room['review_status'])).toMatch(/^review overdue since /);
    expect(await message(c.review(roomId, 'an outsider reviewing', outsider))).toMatch(/only a member/);
    expect(await status(c.review(roomId, 'the agent reviewing', w.agent))).toBe(403);
    const r = await c.review(roomId, 'Reviewed the corridor position; nothing changes the ranking.', w.approver);
    expect(r.review.wasOverdue).toBe(true);
    g = await c.getRoom(roomId);
    expect(g.room['review_overdue']).toBe(false);
    expect(g.room.events.map((e) => e['event'])).toEqual(['room.opened', 'member.added', 'member.added', 'member.added', 'cadence.set', 'review.recorded']);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.package_events where package_id = ${P.pkg}::uuid and event = 'review.recorded'`.execute(h.su)).rows[0]?.n).toBe('1');
    expect(await message(c.cadence(roomId, { reviewEveryDays: 7 }, w.executive))).toMatch(/only the room owner/);
  });
});

describe('P6-M4 · F4 — briefings: what changed, why it matters, who owns it, which window is closing — from a bound baseline', () => {
  it('composed from stored records under the reader\'s known_at with no prior: items carry truth state, freshness and source state; windows are ordered by time left', async () => {
    k1 = new Date().toISOString();
    expect(await message(c.compose({ roomId, knownAt: k1 }, outsider))).toMatch(/composed by a member/);
    expect(await status(c.compose({ roomId, knownAt: k1 }, w.approver))).toBe(403);
    const r = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null })).briefing;
    b1 = r.briefingId; d1 = r.contentDigest;
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(r.watermark).toEqual({ prior_briefing_id: null, prior_composed_at: null, known_at: k1 });
    const kinds = new Set(r.items.map((i) => String(i['kind'])));
    expect([...kinds]).toEqual(expect.arrayContaining(['evidence', 'run', 'package']));
    expect(r.items.filter((i) => i['kind'] === 'run').length).toBe(4);
    for (const i of r.items) {
      expect(String(i['truth_state']).length).toBeGreaterThan(0);
      expect(typeof (i['freshness'] as { age_hours: number }).age_hours).toBe('number');
      expect(['live', 'replayed', 'degraded', 'blocked', 'operator-upload', 'internal']).toContain(i['source_state']);
      expect(String(i['at']) <= k1).toBe(true);
    }
    const ev = r.items.filter((i) => i['kind'] === 'evidence');
    expect(ev.some((i) => i['source_state'] === 'live')).toBe(true);
    expect(ev.some((i) => i['source_state'] === 'operator-upload')).toBe(true);
    expect(r.items.filter((i) => i['kind'] === 'run').every((i) => i['synthetic_state'] === true && i['truth_state'] === 'synthetic')).toBe(true);
    // why it matters: the evidence the twin was grounded on is what the DEC rests on since the proposal
    const withMatters = r.items.filter((i) => (i['matters'] as unknown[]).length > 0);
    expect(withMatters.length).toBeGreaterThan(0);
    expect(withMatters.some((i) => (i['matters'] as Array<{ dependent_type: string }>).some((m) => m.dependent_type === 'DEC'))).toBe(true);
    // who owns it: runs carry the operator, packages the owner
    expect(r.items.filter((i) => i['kind'] === 'run').every((i) => i['owner'] === w.operator.principalId)).toBe(true);
    expect(r.items.filter((i) => i['kind'] === 'package').every((i) => i['owner'] === w.owner.principalId)).toBe(true);
    // which window is closing: the decision deadline (2024-01-19, overdue) first, then the next review
    expect(r.windows.map((x) => x['kind'])).toEqual(['decision-deadline', 'review']);
    expect(r.windows[0]?.['overdue']).toBe(true);
    expect(Number(r.windows[0]?.['time_left_seconds'])).toBeLessThan(0);
    expect(r.windows[1]?.['overdue']).toBe(false);
    // source states name what is live, replayed, blocked or uploaded
    expect(r.sourceStates.map((s) => s['state']).sort()).toEqual(['live', 'operator-upload']);
    expect(r.degraded).toBe(false);
    // the BRF record
    const obj = (await sql<Record<string, unknown>>`select object_type, schema_ref, owning_component, supersedes, quality_state from objects.canonical_objects where object_id = ${b1}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(obj['object_type']).toBe('BRF');
    expect(obj['schema_ref']).toBe('BRF@v1');
    expect(obj['owning_component']).toBe('CP-EXE-01');
    expect(obj['supersedes']).toBeNull();
    expect((obj['quality_state'] as Record<string, unknown>)['narrative']).toBe('none');
  });

  it('recomposition under the same watermark and known_at yields the same content digest; the default prior is the room\'s latest, bound by id', async () => {
    const r2 = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null }, w.owner)).briefing;
    expect(r2.contentDigest).toBe(d1);
    expect(r2.briefingId).not.toBe(b1);
    // the world moves: an approval; then a briefing that follows the latest by default
    await c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' });
    await c.dissent(P.pkg, P.v, { position: 'against the reroute', rationale: 'The Cape adds fourteen days we do not have before the February build.' }, w.approver2);
    const k3 = new Date().toISOString();
    const r3 = (await c.compose({ roomId, knownAt: k3 })).briefing;
    expect(r3.watermark['prior_briefing_id']).toBe(r2.briefingId);
    expect(String(r3.watermark['prior_composed_at']).length).toBeGreaterThan(0);
    expect(r3.items.map((i) => String(i['kind']))).toEqual(['package', 'package', 'dissent']);
    expect(r3.items.map((i) => (i['details'] as Record<string, unknown>)['event'])).toEqual(['review.recorded', 'version.approved', 'dissent.recorded']);
    expect(r3.windows.map((x) => x['kind'])).toEqual(['decision-deadline', 'review', 'approval-expiry']);
    expect(r3.contentDigest).not.toBe(d1);
    // the same watermark again, explicitly: the same digest, whoever composes
    const r3b = (await c.compose({ roomId, knownAt: k3, priorBriefingId: r2.briefingId }, w.owner)).briefing;
    expect(r3b.contentDigest).toBe(r3.contentDigest);
    // a prior from another room / a prior composed after known_at / a watermark that lies — refused at the port
    expect(await message(c.compose({ roomId, knownAt: k1, priorBriefingId: r3.briefingId }))).toMatch(/composed after this briefing's known_at/);
    expect(await status(c.compose({ roomId, knownAt: k3, priorBriefingId: uuidv7() }))).toBe(404);
    const obj = (await sql<{ s: string }>`select supersedes s from objects.canonical_objects where object_id = ${r3.briefingId}::uuid`.execute(h.su)).rows[0];
    expect(obj?.s).toBe(`BRF:${r2.briefingId}@1`);
  });

  it('the narrative is optional, labelled, cites only included items and sits outside the content digest', async () => {
    const k = new Date().toISOString();
    const plain = (await c.compose({ roomId, knownAt: k, priorBriefingId: b1 })).briefing;
    const itemId = String(plain.items[0]?.['item_id']);
    expect(await status(c.compose({ roomId, knownAt: k, priorBriefingId: b1, narrative: 'The approval arrived and one member dissents.', narrativeCites: ['package:nope'] }))).toBe(422);
    expect(await status(c.compose({ roomId, knownAt: k, priorBriefingId: b1, narrative: 'A narrative with no citations.', narrativeCites: [] }))).toBe(422);
    const told = (await c.compose({ roomId, knownAt: k, priorBriefingId: b1, narrative: 'The approval arrived and one member dissents.', narrativeCites: [itemId] })).briefing;
    expect(told.contentDigest).toBe(plain.contentDigest);
    expect(told.narrative).toBe('The approval arrived and one member dissents.');
    expect(told.narrativeCites).toEqual([itemId]);
    const q = (await sql<{ q: Record<string, unknown> }>`select quality_state q from objects.canonical_objects where object_id = ${told.briefingId}::uuid`.execute(h.su)).rows[0]?.q;
    expect(q?.['narrative']).toBe('labelled');
    await expect(sql`update executive.briefings set narrative = 'rewritten' where briefing_id = ${told.briefingId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
  });

  it('retrieval is governed like composition: a room briefing is read by the room\'s members, under their authority now; the read is audited', async () => {
    const g = await c.getBriefing(b1, w.approver);
    expect(g.briefing['content_digest']).toBe(d1);
    expect(await status(c.getBriefing(b1, outsider))).toBe(403);
    expect(await message(c.getBriefing(b1, outsider))).toMatch(/read by the room's members/);
    expect(await status(c.getBriefing(b1, h.manager))).toBe(403);
    expect((await c.listBriefings(roomId, outsider)).briefings.length).toBe(0);
    expect((await c.listBriefings(roomId, w.executive)).briefings.length).toBeGreaterThanOrEqual(5);
    // membership is enforced at READ time: removed from the room, the executive no longer reads what they composed
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'remove' });
    expect(await status(c.getBriefing(b1, w.executive))).toBe(403);
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    expect(await status(c.getBriefing(b1, w.executive))).toBe('ok');
    const reads = (await sql<{ n: string }>`select count(*)::text n from policy.policy_decisions where action = 'briefing.read' and decision = 'allow_with_obligations' and obligations @> '[{"type":"audit_access"}]'`.execute(h.su)).rows[0]?.n;
    expect(Number(reads)).toBeGreaterThanOrEqual(3);
    // a domain briefing (no room): readable by any reader role
    const dom = (await c.compose({ roomId: null, knownAt: new Date().toISOString(), priorBriefingId: null }, w.executive)).briefing;
    expect(dom.items.length).toBeGreaterThan(0);
    expect(await status(c.getBriefing(dom.briefingId, outsider))).toBe('ok');
    // the write action binds BRF to briefing.compose and nothing else
    expect((await sql<{ t: string[] }>`select object_types t from observation.canonical_write_actions where action = 'briefing.compose'`.execute(h.su)).rows[0]?.t).toEqual(['BRF']);
  });
});
