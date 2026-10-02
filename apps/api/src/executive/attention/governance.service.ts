/**
 * THE ATTENTION QUEUE'S GOVERNANCE — CP-6 B24 (migration 0086 §G; F-P6-07; V03-T-263, V03-T-171, PR-44-006, AT-44, CAP-EO-06,
 * V00-T-069 "delegate review").
 *
 * SUPPRESSION APPROVAL. When the class's rule in an item's OWN policy version says `suppression.approval_required`, a suppression is a
 * REQUEST (executive.suppress_attention_item records it; the item stays live and keeps escalating) that a SECOND person decides —
 * never the requester (separation of duties, 42501), a holder of the version's approver roles; an approved expiry is capped at the
 * decision instant + the class's max_hours; a request whose instant passes undecided EXPIRES, visibly (the approvers' sweep, and the
 * attention tick's step registered here). Without approval_required a suppression is 0083's act, unchanged.
 *
 * DELEGATION. A person who acts on an item in their own right (its owner, a holder of a routed role, an administrator) lends it to an
 * ACTIVE HUMAN holding one of the acknowledgement roles, for a bounded window, with a reason; exactly once on the delegator's
 * `request_key` under the delegation's digest (the executive.requests idiom); executive.may_act_on_item honours it in its window. The
 * owner stays accountable (the item's owner is never changed); a delegate does not delegate further.
 *
 * DISPOSITION AND EVALUATION. A person who may act on an item records what it turned out to be (actioned | not_material | duplicate |
 * late | missed); a NAMED HUMAN (executive, domain_admin, platform_admin) evaluates the queue over a window — precision and recall by
 * class, ranking stability, severe-item visibility, escalation latency — every measure computed inside the write from the ledgers, each
 * abstaining below min_sample, with the verdict and its reason (the 0066 §6 method-evaluation idiom).
 */
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody, jcsCanonicalize } from '@eye/contracts';
import type { ExecutiveReads } from '../executive.capabilities.js';
import { AttentionTickRegistry, type AttentionTickContext } from './tick.js';

type Row = Record<string, unknown>;
export const DISPOSITIONS = ['actioned', 'not_material', 'duplicate', 'late', 'missed'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const SUPPRESSION_REQUEST_STATES = ['pending', 'approved', 'refused', 'expired'] as const;
export const DELEGATION_STATES = ['active', 'ended'] as const;
export const EVALUATION_VERDICTS = ['measured', 'partial', 'abstained'] as const;
/** The tick step this section registers (0086 §G1): the lapsed pending requests recorded expired. */
export const SUPPRESSION_EXPIRY_STEP = 'suppression-expiry';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const instantOrNull = (p: Row, k: string, correlationId: string): string | null => {
  const v = p[k]; if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(correlationId, `${k} must be an instant (ISO 8601)`);
  return new Date(v as string).toISOString();
};

/** The intake of a decision on a suppression request (the port decides the standing, the separation of duties and the request's state). */
export function validateDecide(p: Row, correlationId: string): { decision: 'approve' | 'refuse'; reason: string } {
  const decision = p['decision'];
  if (decision !== 'approve' && decision !== 'refuse') bad(correlationId, 'payload.decision is approve or refuse');
  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
  if (reason.length < 8) bad(correlationId, 'payload.reason says why (at least 8 characters)');
  return { decision: decision as 'approve' | 'refuse', reason };
}

export interface DelegateIntake { to: string; reason: string; until: string; requestKey: string }
/** The intake of a delegation (422 on a malformed request; the port decides the people, the item, the window and the key). */
export function validateDelegate(p: Row, correlationId: string): DelegateIntake {
  if (typeof p['to'] !== 'string' || !UUID.test(p['to'])) bad(correlationId, 'payload.to is the principal id of the person the item is delegated to');
  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the item is delegated (8–2000 characters)');
  const until = instantOrNull(p, 'until', correlationId);
  if (until === null) bad(correlationId, 'payload.until is the instant the delegation ends (ISO 8601)');
  const key = typeof p['request_key'] === 'string' ? p['request_key'].trim() : '';
  if (key.length < 1 || key.length > 200) bad(correlationId, 'payload.request_key (1–200 characters) is the delegator\'s idempotency key for this delegation');
  return { to: (p['to'] as string).toLowerCase(), reason, until: until as string, requestKey: key };
}

/** The delegation's content digest: what the request key is bound to (the item, the delegate, the reason, the end instant). */
export function delegationDigest(itemId: string, i: DelegateIntake): string {
  return createHash('sha256').update(jcsCanonicalize({ item_id: itemId.toLowerCase(), to: i.to, reason: i.reason, until: i.until })).digest('hex');
}

/** The intake of a disposition (the port decides who may and whether `missed` fits the item). */
export function validateDisposition(p: Row, correlationId: string): { disposition: Disposition; note: string | null } {
  const d = p['disposition'];
  if (typeof d !== 'string' || !(DISPOSITIONS as readonly string[]).includes(d)) bad(correlationId, `payload.disposition is one of ${DISPOSITIONS.join(', ')}`);
  const note = typeof p['note'] === 'string' && p['note'].trim() !== '' ? p['note'].trim() : null;
  if (note !== null && note.length > 2000) bad(correlationId, 'payload.note is at most 2000 characters');
  return { disposition: d as Disposition, note };
}

/** The intake of an evaluation: the window (defaults: the 30 days before now) and the sample floor (default 5). */
export function validateEvaluate(p: Row, correlationId: string): { windowFrom: string | null; windowTo: string | null; minSample: number } {
  const windowFrom = instantOrNull(p, 'window_from', correlationId);
  const windowTo = instantOrNull(p, 'window_to', correlationId);
  if (windowFrom !== null && windowTo !== null && windowTo < windowFrom) bad(correlationId, 'window_to is at or after window_from');
  const m = p['min_sample'] === undefined || p['min_sample'] === null ? 5 : p['min_sample'];
  if (!Number.isInteger(m) || Number(m) < 1 || Number(m) > 10_000) bad(correlationId, 'min_sample is a whole number in [1, 10000]');
  return { windowFrom, windowTo, minSample: Number(m) };
}

@Injectable()
export class AttentionGovernanceService implements OnModuleInit {
  constructor(private readonly tick: AttentionTickRegistry) {}

  /** The tick step (the timer host runs it, bound to executive.attention.tick): the pending requests past their instant recorded expired. */
  onModuleInit(): void {
    this.tick.register({
      name: SUPPRESSION_EXPIRY_STEP, order: 5,
      run: async (c: AttentionTickContext) => {
        const r = (await sql<{ r: Row }>`select executive.expire_attention_suppressions(${c.tenantId}::uuid, ${c.domainId}::uuid, ${c.agentPrincipalId}::uuid, ${c.correlationId}::uuid) as r`.execute(c.tx)).rows[0]?.r ?? {};
        const expired = Array.isArray(r['expired']) ? (r['expired'] as Row[]) : [];
        return { expired: expired.length, requests: expired.map((x) => x['request_id']) };
      },
    });
  }

  /** The domain's suppression requests, newest first — a pending one past its instant is shown `lapsed` until the sweep records it expired. */
  async requests(cap: ExecutiveReads, p: { state?: unknown; itemId?: unknown; limit?: unknown }, now: string): Promise<Row[]> {
    let q = cap.readSuppressionRequests().selectAll();
    if (typeof p.state === 'string' && (SUPPRESSION_REQUEST_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.itemId === 'string' && UUID.test(p.itemId)) q = q.where('item_id' as never, '=', p.itemId as never);
    const limit = Math.min(Math.max(Number(p.limit ?? 200) || 200, 1), 500);
    const rows = (await q.orderBy('requested_at' as never, 'desc').limit(limit).execute()) as Row[];
    return rows.map((r) => {
      const until = iso(r['until']);
      return {
        request_id: r['request_id'], item_id: r['item_id'], state: r['state'], requested_by: r['requested_by'], requested_at: iso(r['requested_at']), until, reason: r['reason'],
        policy_version: r['policy_version'], max_hours: r['max_hours'] === null ? null : Number(r['max_hours']), approver_roles: r['approver_roles'], from_state: r['from_state'],
        decided_by: r['decided_by'], decided_at: iso(r['decided_at']), decision_reason: r['decision_reason'], approved_until: iso(r['approved_until']), capped: r['capped'],
        lapsed: r['state'] === 'pending' && until !== null && until <= now,
      };
    });
  }

  /** The domain's item delegations, newest first — `in_force` is an active one inside its window. */
  async delegations(cap: ExecutiveReads, p: { state?: unknown; itemId?: unknown; limit?: unknown }, now: string): Promise<Row[]> {
    let q = cap.readItemDelegations().selectAll();
    if (typeof p.state === 'string' && (DELEGATION_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.itemId === 'string' && UUID.test(p.itemId)) q = q.where('item_id' as never, '=', p.itemId as never);
    const limit = Math.min(Math.max(Number(p.limit ?? 200) || 200, 1), 500);
    const rows = (await q.orderBy('from_at' as never, 'desc').limit(limit).execute()) as Row[];
    return rows.map((r) => {
      const until = iso(r['until_at']);
      return {
        delegation_id: r['delegation_id'], item_id: r['item_id'], from: r['from_principal_id'], to: r['to_principal_id'], owner: r['owner_principal_id'], owner_stays_accountable: true,
        reason: r['reason'], from_at: iso(r['from_at']), until, state: r['state'], ended_at: iso(r['ended_at']), ended_by: r['ended_by'], end_reason: r['end_reason'],
        request_key: r['request_key'], in_force: r['state'] === 'active' && until !== null && until > now,
      };
    });
  }

  /** The queue's evaluations, newest first (append-only). */
  async evaluations(cap: ExecutiveReads, p: { limit?: unknown }): Promise<Row[]> {
    const limit = Math.min(Math.max(Number(p.limit ?? 50) || 50, 1), 200);
    const rows = (await cap.readQueueEvaluations().selectAll().orderBy('evaluated_at' as never, 'desc').limit(limit).execute()) as Row[];
    return rows.map((r) => ({ evaluation_id: r['evaluation_id'], window_from: iso(r['window_from']), window_to: iso(r['window_to']), min_sample: r['min_sample'], measures: r['measures'],
      verdict: r['verdict'], reason: r['reason'], evaluated_by: r['evaluated_by'], evaluated_at: iso(r['evaluated_at']) }));
  }
}
