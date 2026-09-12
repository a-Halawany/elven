/**
 * EXECUTIVE REQUESTS (0066 §9; interface L10-I04 ExecutiveActionRequested; AU-EXO-0051).
 *
 * A typed request is a person's command with an exactly-once institutional effect. The requester names a `request_key`
 * (the idempotency boundary) and the request's content digest — SHA-256 over the canonical form of kind, subject,
 * instruction, delegate, owner, due and until — is recorded with it: the same key with the same digest returns the
 * request already recorded (no second effect, no second event); the same key with a different digest is refused. The
 * port routes the request to the responsible capability (`analysis` → an agent run under the agent's own session with
 * trigger kind `request`; `scenario`, `simulation`, `decision` → the owner's own governed act, which names the request
 * and fulfils it) or effects it in the write (`delegation`, `suppression`, `follow_up`). ExecutiveActionRequested is
 * published from the write that recorded a NEW request; a repeat publishes nothing.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { errorBody, jcsCanonicalize } from '@eye/contracts';
import type { ScopeContext } from '../../shared/scope.js';
import type { ExecutiveReads, RequestWrites } from '../executive.capabilities.js';

type Row = Record<string, unknown>;
export const REQUEST_KINDS = ['analysis', 'scenario', 'simulation', 'decision', 'delegation', 'suppression', 'follow_up'] as const;
export type RequestKind = typeof REQUEST_KINDS[number];
export interface RequestIntake { kind: RequestKind; requestKey: string; subject: Row; instruction: string; delegate: string | null; owner: string | null; dueAt: string | null; until: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string => v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
const isoOrNull = (v: unknown): string | null => v === null || v === undefined ? null : iso(v);

export function validateRequest(p: Row, correlationId: string): RequestIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  const kind = String(p['kind'] ?? '');
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) bad(`kind is one of ${REQUEST_KINDS.join(', ')}`);
  const requestKey = typeof p['request_key'] === 'string' ? p['request_key'].trim() : '';
  if (requestKey.length < 1 || requestKey.length > 200) bad('request_key (1–200 characters) is the requester\'s idempotency key for this request');
  const instruction = typeof p['instruction'] === 'string' ? p['instruction'].trim() : '';
  if (instruction.length < 4 || instruction.length > 4096) bad('instruction states the request (4–4096 characters)');
  const subject = (p['subject'] !== null && typeof p['subject'] === 'object' && !Array.isArray(p['subject']) ? p['subject'] : {}) as Row;
  if (subject['object_id'] !== undefined && (typeof subject['object_id'] !== 'string' || !UUID.test(subject['object_id']))) bad('subject.object_id must be a uuid');
  if (subject['object_type'] !== undefined && (typeof subject['object_type'] !== 'string' || !/^[A-Z]{3}$/.test(subject['object_type']))) bad('subject.object_type is a three-letter object type');
  if (subject['version'] !== undefined && subject['version'] !== null && !(Number.isInteger(subject['version']) && Number(subject['version']) >= 1)) bad('subject.version is a positive integer');
  if (kind === 'analysis' && subject['task'] !== undefined && !['draft', 'briefing', 'report', 'monitor'].includes(String(subject['task']))) bad('subject.task is draft, briefing, report or monitor');
  if (subject['agent_id'] !== undefined && (typeof subject['agent_id'] !== 'string' || !UUID.test(subject['agent_id']))) bad('subject.agent_id must be an agent id');
  const uuidOrNull = (k: string): string | null => {
    const v = p[k]; if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !UUID.test(v)) bad(`${k} must be a principal id`); return v as string;
  };
  const instantOrNull = (k: string): string | null => {
    const v = p[k]; if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(`${k} must be an instant`); return new Date(v as string).toISOString();
  };
  const delegate = uuidOrNull('delegate'); const owner = uuidOrNull('owner'); const dueAt = instantOrNull('due_at'); const until = instantOrNull('until');
  if (kind === 'delegation' && delegate === null) bad('a delegation names the delegate');
  if (kind === 'delegation' && until === null) bad('a delegation names until when it stands');
  if (kind === 'suppression' && until === null) bad('a suppression names until when it stands');
  if (kind === 'follow_up' && dueAt === null) bad('a follow-up names when it is due');
  return { kind: kind as RequestKind, requestKey, subject, instruction, delegate, owner, dueAt, until };
}

/** The request's content digest: what the key is bound to. */
export function requestDigest(i: RequestIntake): string {
  return createHash('sha256').update(jcsCanonicalize({ kind: i.kind, subject: i.subject, instruction: i.instruction, delegate: i.delegate, owner: i.owner, due_at: i.dueAt, until: i.until })).digest('hex');
}

@Injectable()
export class RequestsService {
  async open(cap: RequestWrites, ctx: ScopeContext, requestId: string, i: RequestIntake, requester: string, correlationId: string): Promise<{ request: Row; event: { eventType: string; payload: Row } | null }> {
    const digest = requestDigest(i);
    const r = await cap.openRequest({ requestId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, kind: i.kind, requestKey: i.requestKey, requestDigest: digest, subject: i.subject, instruction: i.instruction,
      delegate: i.delegate, owner: i.owner, dueAt: i.dueAt, until: i.until, requester, correlationId });
    const request = { ...r, request_digest: digest, requested_at: isoOrNull(r['requested_at']) };
    if (r['repeated'] === true) return { request, event: null };
    return { request, event: { eventType: 'ExecutiveActionRequested', payload: {
      schema: 'ExecutiveActionRequested', schema_version: 'v1', request_id: String(r['request_id']), kind: i.kind, request_key: i.requestKey, request_digest: digest,
      subject: i.subject, instruction: i.instruction, routed_to: r['routed_to'] ?? null, routed_ref: r['routed_ref'] ?? null, state: r['state'] ?? null, effect: r['effect'] ?? {},
      delegate: i.delegate, owner: i.owner, due_at: i.dueAt, until: i.until, requester: `principal:${requester}`,
      temporal: { known_at: new Date().toISOString() }, cause: { action: 'executive.request', actor: `principal:${requester}`, target_type: 'EXR', target_id: String(r['request_id']) },
    } } };
  }

  async list(cap: ExecutiveReads, a: { state?: string | null; kind?: string | null; limit?: number }): Promise<Row[]> {
    let q = cap.readRequests().selectAll().orderBy('requested_at' as never, 'desc').limit(Math.min(a.limit ?? 100, 500));
    if (a.state) q = q.where('state' as never, '=', a.state as never);
    if (a.kind) q = q.where('kind' as never, '=', a.kind as never);
    const rows = (await q.execute()) as Row[];
    return rows.map((r) => this.view(r));
  }

  async get(cap: ExecutiveReads, requestId: string, correlationId: string): Promise<Row> {
    const r = (await cap.readRequests().selectAll().where('request_id' as never, '=', requestId as never).executeTakeFirst()) as Row | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized request matches'), 404);
    const events = (await cap.readRequestEvents().selectAll().where('request_id' as never, '=', requestId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const effect: Row = {};
    if (r['kind'] === 'delegation') effect['delegation'] = ((await cap.readDelegations().selectAll().where('request_id' as never, '=', requestId as never).executeTakeFirst()) as Row | undefined) ?? null;
    if (r['kind'] === 'suppression') effect['suppression'] = ((await cap.readWarningSuppressions().selectAll().where('request_id' as never, '=', requestId as never).executeTakeFirst()) as Row | undefined) ?? null;
    if (r['kind'] === 'follow_up') effect['follow_up'] = ((await cap.readFollowUps().selectAll().where('request_id' as never, '=', requestId as never).executeTakeFirst()) as Row | undefined) ?? null;
    return { ...this.view(r), effect, events: events.map((e) => ({ event: e['event'], occurred_at: iso(e['occurred_at']), actor_principal_id: e['actor_principal_id'], details: e['details'] })) };
  }

  /** The open follow-ups of a package (or the domain), overdue read against now — the agenda. */
  async followUps(cap: ExecutiveReads, a: { packageId?: string | null; roomId?: string | null; now?: string }): Promise<Row[]> {
    let q = cap.readFollowUps().selectAll().orderBy('due_at' as never);
    if (a.packageId) q = q.where('package_id' as never, '=', a.packageId as never);
    if (a.roomId) q = q.where('room_id' as never, '=', a.roomId as never);
    const now = a.now ?? new Date().toISOString();
    return ((await q.execute()) as Row[]).map((f) => ({ ...f, due_at: iso(f['due_at']), done_at: isoOrNull(f['done_at']), created_at: iso(f['created_at']), overdue: f['state'] === 'open' && iso(f['due_at']) < now, status: f['state'] === 'open' ? (iso(f['due_at']) < now ? 'overdue' : 'open') : String(f['state']) }));
  }

  private view(r: Row): Row {
    return { ...r, requested_at: iso(r['requested_at']), fulfilled_at: isoOrNull(r['fulfilled_at']), withdrawn_at: isoOrNull(r['withdrawn_at']), due_at: isoOrNull(r['due_at']), until_at: isoOrNull(r['until_at']) };
  }
}
