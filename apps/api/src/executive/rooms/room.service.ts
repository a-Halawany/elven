/**
 * DECISION ROOMS — Phase 6 (L9), stage P6-M4. A room mirrors its package's state
 * and adds nothing to the package's authority; membership and cadence are the
 * owner's governed writes; a review is a member's act on the cadence; "review
 * overdue" is a fact of the clock, said in words.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ExecutiveReads, RoomWrites } from '../executive.capabilities.js';

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()));
/** open · deciding · monitoring · closed — from the package's state. */
export function roomStateOf(packageState: string): 'open' | 'deciding' | 'monitoring' | 'closed' {
  if (['draft', 'proposed'].includes(packageState)) return 'open';
  if (['under_review', 'approved'].includes(packageState)) return 'deciding';
  if (['committed', 'monitoring'].includes(packageState)) return 'monitoring';
  return 'closed';
}

@Injectable()
export class RoomService {
  async open(cap: RoomWrites, ctx: ScopeContext, a: { packageId: string; title: string; reviewEveryDays: number }, actor: string, correlationId: string, roomId: string = newId()) {
    if (!Number.isInteger(a.reviewEveryDays) || a.reviewEveryDays < 1 || a.reviewEveryDays > 365) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'reviewEveryDays must be an integer between 1 and 365'), 422);
    if (typeof a.title !== 'string' || a.title.trim().length < 2) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'title is required'), 422);
    const r = await cap.openRoom({ roomId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId: a.packageId, title: a.title, reviewEveryDays: a.reviewEveryDays, actor, eventId: newId(), correlationId });
    return { roomId, packageId: a.packageId, nextReviewAt: iso(r.next_review_at) };
  }
  async membership(cap: RoomWrites, ctx: ScopeContext, roomId: string, a: { principal: string; role: string; op: 'add' | 'remove' }, actor: string, correlationId: string) {
    await cap.setMembership({ roomId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, principal: a.principal, role: a.role, op: a.op, actor, eventId: newId(), correlationId });
    return { roomId, principal: a.principal, role: a.role, op: a.op };
  }
  async cadence(cap: RoomWrites, ctx: ScopeContext, roomId: string, a: { everyDays: number; nextReviewAt: string | null }, actor: string, correlationId: string) {
    const r = await cap.setCadence({ roomId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, everyDays: a.everyDays, nextReviewAt: a.nextReviewAt, actor, eventId: newId(), correlationId });
    return { roomId, reviewEveryDays: Number(r.review_every_days), nextReviewAt: iso(r.next_review_at) };
  }
  async review(cap: RoomWrites, ctx: ScopeContext, roomId: string, note: string, actor: string, correlationId: string) {
    const r = await cap.recordReview({ roomId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, note, actor, eventId: newId(), correlationId });
    return { roomId, reviewedAt: iso(r.reviewed_at), nextReviewAt: iso(r.next_review_at), wasOverdue: r.was_overdue === true };
  }

  async list(cap: ExecutiveReads, reader: string): Promise<Array<Record<string, unknown>>> {
    const rooms = (await cap.readRooms().selectAll().orderBy('opened_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const now = Date.now();
    const out: Array<Record<string, unknown>> = [];
    for (const r of rooms) {
      const p = (await cap.readPackages().select(['state' as never]).where('package_id' as never, '=', String(r['package_id']) as never).executeTakeFirst()) as { state: string } | undefined;
      const member = await cap.isMember({ roomId: String(r['room_id']), principal: reader });
      out.push({ room_id: r['room_id'], package_id: r['package_id'], title: r['title'], owner_principal_id: r['owner_principal_id'], state: roomStateOf(String(p?.state ?? 'closed')),
                 review_every_days: r['review_every_days'], next_review_at: iso(r['next_review_at']), last_review_at: iso(r['last_review_at']),
                 review_overdue: new Date(String(r['next_review_at'])).getTime() < now, member });
    }
    return out;
  }

  /** The room, for a member: members, cadence, review overdue in words, the package's state, the briefings it holds. */
  async get(cap: ExecutiveReads, roomId: string, reader: string, correlationId: string): Promise<Record<string, unknown>> {
    const r = (await cap.readRooms().selectAll().where('room_id' as never, '=', roomId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized room matches'), 404);
    if (!(await cap.isMember({ roomId, principal: reader }))) throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'the room is read by its members; you are not one'), 403);
    const members = (await cap.readMembers().selectAll().where('room_id' as never, '=', roomId as never).orderBy('added_at' as never).execute()) as Array<Record<string, unknown>>;
    const events = (await cap.readRoomEvents().selectAll().where('room_id' as never, '=', roomId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', String(r['package_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const briefings = (await cap.readBriefings().select(['briefing_id', 'composed_at', 'composed_by', 'composed_via', 'known_at', 'prior_briefing_id', 'content_digest', 'degraded'] as never).where('room_id' as never, '=', roomId as never).orderBy('composed_at' as never).execute()) as Array<Record<string, unknown>>;
    const now = await cap.now();
    const overdue = new Date(String(r['next_review_at'])).getTime() < new Date(now).getTime();
    return {
      ...r, next_review_at: iso(r['next_review_at']), last_review_at: iso(r['last_review_at']), opened_at: iso(r['opened_at']),
      state: roomStateOf(String(p?.['state'] ?? 'closed')), package_state: p?.['state'] ?? null, package_title: p?.['title'] ?? null,
      review_overdue: overdue, review_status: overdue ? `review overdue since ${iso(r['next_review_at'])}` : `next review due ${iso(r['next_review_at'])}`,
      members: members.map((m) => ({ ...m, added_at: iso(m['added_at']), removed_at: iso(m['removed_at']), live: m['removed_at'] === null })),
      events: events.map((e) => ({ ...e, occurred_at: iso(e['occurred_at']) })),
      briefings: briefings.map((b) => ({ ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']) })),
    };
  }
}
