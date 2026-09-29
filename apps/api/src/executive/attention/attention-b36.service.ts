/**
 * THE ATTENTION COMPLETION — CP-6 B36 part `attention` (0094 §A; F-P6-07 COMPLETES).
 *
 *   (n)  THE RESUME ROUTE: an act (0090 §A4) whose SETTLE fails after its governed action COMMITTED reads settle_failed with the failure
 *        and the committed action's receipt (act.service.ts records it right after the failure); the resume (the launcher or the executive
 *        operator; executive.attention.item.act.resume) re-runs the settle from the audit chain's record — the governed action is NEVER
 *        re-executed (the port performs nothing; a resume on an act whose action did not commit is refused: state).
 *   (o1) ACCEPT-PRIORITY: the accountable person's distinct act (executive.attention.item.accept_priority) — the digest of the item's
 *        evaluation, the consequence preview, and a SIGNATURE (§0 SignatureService, kind queue_transition) in the same write.
 *   (o2) THE HOLD: after the queue evaluation (0090 §A5, untouched) the route calls executive.hold_queue — the fairness measure below the
 *        policy's floor or the staleness measure above its ceiling holds the queue (read-only) and routes a queue.governance item to the
 *        executive; the executive releases it with a reason (executive.attention.queue.release).
 *   (o3) THE RECOVERY ROUTES: the degraded states (delivery_sink_down, tick_stalled, policy_invalid, evaluation_stale, hold) read from the
 *        ledgers; each state's route run by a named human and recorded with before / after / outcome (executive.attention.queue.recover).
 *        A SYNTHETIC fixture arms a one-shot settle fault in this process (executive.attention.fixture.arm) — the harness's and the
 *        demonstration's way to reproduce (n); it closes no clause on its own.
 *   (o4) THE CONTEXT ON THE QUEUE: /attention/queue answers {context, policy, hold} beside the items served UNDER the principal's executive
 *        context (§0 executive.current_context) — the filtered counted, never dropped; the ranking names the context digest.
 *   (o5) FORUMS: a room of kind forum convened by the executive operator (members, a cadence period, a context); the forum's queue is the
 *        same items under the forum's context — no copy.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { SignatureService } from '../signatures/signature.service.js';
import { AttentionTimerService } from './attention-timer.service.js';
import { AttentionActService } from './act.service.js';
import { AttentionB36Capability, type AttentionB36Reads } from './attention-b36.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };

export const DEGRADED_STATES = ['delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold'] as const;
export type DegradedState = (typeof DEGRADED_STATES)[number];
export const ROUTE_OF: Record<DegradedState, string> = { delivery_sink_down: 're-deliver', tick_stalled: 're-tick', policy_invalid: 're-validate', evaluation_stale: 're-evaluate', hold: 'release' };
export const FORUM_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;

/* ───────────── the intakes (pure; unit-tested) ───────────── */
export function validateAcceptPriority(p: Row, correlationId: string): { note: string | null } {
  const note = p['note'] === undefined || p['note'] === null ? null : typeof p['note'] === 'string' ? p['note'].trim() : bad(correlationId, 'payload.note is text (optional)');
  if (note !== null && note.length > 1000) bad(correlationId, 'payload.note is at most 1000 characters');
  return { note: note === '' ? null : note };
}
export function validateRelease(p: Row, correlationId: string): { reason: string } {
  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
  if (reason.length < 8) bad(correlationId, 'payload.reason says why the hold is released (at least 8 characters)');
  return { reason };
}
export function validateRecover(p: Row, correlationId: string): { state: DegradedState; note: string | null } {
  const state = typeof p['state'] === 'string' ? p['state'].trim() : '';
  if (!(DEGRADED_STATES as readonly string[]).includes(state)) bad(correlationId, `payload.state is a degraded state: ${DEGRADED_STATES.join(', ')}`);
  const note = typeof p['note'] === 'string' && p['note'].trim() !== '' ? p['note'].trim() : null;
  if (note !== null && note.length > 1000) bad(correlationId, 'payload.note is at most 1000 characters');
  return { state: state as DegradedState, note };
}
export function validateLimit(p: Row): number {
  const n = Number(p['limit'] ?? 200);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), 500) : 200;
}
export function validateForum(p: Row, correlationId: string): { title: string; members: string[]; period: string; context: Row } {
  const title = typeof p['title'] === 'string' ? p['title'].trim() : '';
  if (title.length < 2 || title.length > 256) bad(correlationId, 'payload.title is the forum\'s title (2 to 256 characters)');
  const members = Array.isArray(p['members']) ? p['members'].map(String) : [];
  if (members.length === 0 || members.some((m) => !UUID.test(m))) bad(correlationId, 'payload.members is a non-empty list of principal ids (named, active humans)');
  const period = typeof p['period'] === 'string' ? p['period'].trim() : '';
  if (!(FORUM_PERIODS as readonly string[]).includes(period)) bad(correlationId, 'payload.period is the cadence: weekly, monthly or quarterly');
  const c = p['context'];
  if (c === null || typeof c !== 'object' || Array.isArray(c)) bad(correlationId, 'payload.context is {objective_id?, horizon, scenario_id?, classification?}');
  const ctx = c as Row;
  const horizon = typeof ctx['horizon'] === 'string' ? ctx['horizon'] : '';
  if (!(HORIZONS as readonly string[]).includes(horizon)) bad(correlationId, 'payload.context.horizon is 30d, 90d, 12m or 36m');
  const objective = ctx['objective_id'] === undefined || ctx['objective_id'] === null || ctx['objective_id'] === '' ? null : String(ctx['objective_id']);
  if (objective !== null && !UUID.test(objective)) bad(correlationId, 'payload.context.objective_id is a strategy object id or empty');
  const scenario = ctx['scenario_id'] === undefined || ctx['scenario_id'] === null || ctx['scenario_id'] === '' ? null : String(ctx['scenario_id']);
  if (scenario !== null && !UUID.test(scenario)) bad(correlationId, 'payload.context.scenario_id is a scenario id or empty');
  const classification = ctx['classification'] === undefined || ctx['classification'] === null || ctx['classification'] === '' ? 'internal' : String(ctx['classification']);
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, 'payload.context.classification is public, internal, confidential or restricted');
  return { title, members: [...new Set(members)], period, context: { objective_id: objective, horizon, scenario_id: scenario, classification } };
}

@Injectable()
export class AttentionB36Service {
  constructor(private readonly pipeline: PipelineService, private readonly signatures: SignatureService, private readonly timer: AttentionTimerService,
              private readonly acts: AttentionActService, @Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private chained(envelope: Envelope, action: string, objectType: string, objectId: string | null): Envelope {
    return { ...envelope, action, message_id: newId(), object_type: objectType, object_id: objectId } as Envelope;
  }

  /* ───────────── (o4) the reads ───────────── */
  async queue(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, limit: number): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ATI', null), AttentionB36Capability.read,
      async (cap) => cap.queueRead({ principal: principal.principalId, tenantId, domainId, limit }));
    return { ...out.result, receipt: receipt(out) };
  }
  async context(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ATI', null), AttentionB36Capability.read,
      async (cap) => cap.queueContext({ principal: principal.principalId, tenantId, domainId }));
    return { ...out.result, receipt: receipt(out) };
  }
  /** An item's acceptance with its signatures (§0 signature_of), and the acts of the item with their resumptions. */
  async acceptanceOf(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, itemId: string): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ATI', itemId), AttentionB36Capability.read,
      async (cap) => {
        const acceptance = ((await cap.readPriorityAcceptances().selectAll().where('item_id' as never, '=', itemId as never).execute()) as Row[])[0] ?? null;
        const signatures = acceptance === null ? [] : await cap.signatureOf({ kind: 'queue_transition', subjectId: String(acceptance['acceptance_id']), version: 1 });
        const acts = (await cap.readAttentionItemActs().selectAll().where('item_id' as never, '=', itemId as never).orderBy('launched_at' as never, 'desc').execute()) as Row[];
        const resumptions = (await cap.readActResumptions().selectAll().where('item_id' as never, '=', itemId as never).orderBy('resumed_at' as never, 'desc').execute()) as Row[];
        return { acceptance, signatures: signatures.map((s) => ({ ...s, verified: this.signatures.verify(s as never) })), acts, resumptions,
                 signing: { bound: this.signatures.bound(), key: this.signatures.publicKey()?.keyId ?? null } };
      });
    return { ...out.result, receipt: receipt(out) };
  }
  async holds(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, limit: number): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ATH', null), AttentionB36Capability.read,
      async (cap) => ({ holds: (await cap.readQueueHolds().selectAll().orderBy('held_at' as never, 'desc').limit(limit).execute()) as Row[] }));
    return { ...out.result, receipt: receipt(out) };
  }
  async degradedStates(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ATR', null), AttentionB36Capability.read,
      async (cap) => ({ ...(await cap.degradedStates({ tenantId, domainId })),
                        routes: (await cap.readRecoveryRoutes().selectAll().orderBy('run_at' as never, 'desc').limit(50).execute()) as Row[],
                        fixtures: { settle_fault: this.acts.settleFaultArmed(), synthetic: true } }));
    return { ...out.result, receipt: receipt(out) };
  }
  async forums(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ROOM', null), AttentionB36Capability.read,
      async (cap) => {
        const rooms = (await cap.readRooms().selectAll().where('kind' as never, '=', 'forum' as never).orderBy('opened_at' as never, 'desc').limit(100).execute()) as Row[];
        const members = rooms.length === 0 ? [] : (await cap.readRoomMembers().selectAll().where('room_id' as never, 'in', rooms.map((r) => r['room_id']) as never).execute()) as Row[];
        return { forums: rooms.map((r) => ({ ...r, members: members.filter((m) => m['room_id'] === r['room_id'] && (m['removed_at'] === null || m['removed_at'] === undefined)).map((m) => ({ principal_id: m['principal_id'], role: m['role'] })) })) };
      });
    return { ...out.result, receipt: receipt(out) };
  }
  async forumQueue(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, roomId: string, limit: number): Promise<Row> {
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.read', 'ROOM', roomId), AttentionB36Capability.read,
      async (cap) => cap.forumQueue({ roomId, tenantId, domainId, principal: principal.principalId, limit }));
    return { ...out.result, receipt: receipt(out) };
  }

  /* ───────────── (n) the resume ───────────── */
  async resume(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, actId: string): Promise<Row> {
    const resumptionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.act.resume', 'ATI', actId), AttentionB36Capability.actResume,
      async (cap, scope) => ({ result: await cap.resumeAct({ resumptionId, actId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: actId, targetVersion: null, outboxEvent: null }));
    return { act: out.result, resumption: out.result['resumption'] ?? null, re_executed: false, receipt: receipt(out) };
  }

  /* ───────────── (o1) accept-priority: the port, then the signature in the same write ───────────── */
  async acceptPriority(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, itemId: string, note: string | null): Promise<Row> {
    const acceptanceId = newId();
    const action = 'executive.attention.item.accept_priority';
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, action, 'ATI', itemId), AttentionB36Capability.priority,
      async (cap, scope) => {
        const acceptance = await cap.acceptPriority({ acceptanceId, itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note, actor: principal.principalId, correlationId: envelope.correlation_id });
        const signature = await this.signatures.sign(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, action, kind: 'queue_transition', subjectId: acceptanceId, subjectVersion: 1,
                                                            subjectDigest: String(acceptance['evaluation_digest']), actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { acceptance, signature } as Row, targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null };
      });
    return { ...out.result, receipt: receipt(out) };
  }

  /* ───────────── (o2) the evaluation acts: evaluate, then hold, one write ───────────── */
  async evaluateAndHold(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: { windowFrom: string | null; windowTo: string | null; minSample: number }): Promise<Row> {
    const evaluationId = newId(); const holdId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.evaluate', 'ATE', evaluationId), AttentionB36Capability.hold,
      async (cap, scope) => {
        const T = scope.tenantId as string; const D = scope.domainId as string;
        const evaluation = await cap.evaluateQueue({ evaluationId, tenantId: T, domainId: D, windowFrom: intake.windowFrom, windowTo: intake.windowTo, minSample: intake.minSample, actor: principal.principalId, correlationId: envelope.correlation_id });
        const governance = await cap.holdQueue({ holdId, tenantId: T, domainId: D, evaluationId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { evaluation, governance } as Row, targetType: 'ATE', targetId: evaluationId, targetVersion: null, outboxEvent: null };
      });
    return { ...out.result, receipt: receipt(out) };
  }
  async release(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, holdId: string, reason: string): Promise<Row> {
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.release', 'ATH', holdId), AttentionB36Capability.hold,
      async (cap, scope) => ({ result: await cap.releaseHold({ holdId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATH', targetId: holdId, targetVersion: null, outboxEvent: null }));
    return { hold: out.result, receipt: receipt(out) };
  }

  /* ───────────── (o3) the recovery routes ───────────── */
  /**
   * A state's route: the state READ before (its own audited read), the route's mechanics as their own governed acts where they are not the
   * port's (re-tick: the timer reconciled and — in the test runtime — one tick now; re-evaluate: the evaluation write under its own action
   * and PDP), then executive.recover_queue records the run with the state after. The hold's route is the release (its own action).
   */
  async recover(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: { state: DegradedState; note: string | null }): Promise<Row> {
    const routeId = newId();
    /* THE RUN OPENED as a governed write under the route's own action (audited: "the route opened by …"): the PDP's human gate and the
       port's authority answer BEFORE any mechanics run — a refused person ticks nothing, evaluates nothing. The state before is read here. */
    const before = await this.pipeline.write(this.chained(envelope, 'executive.attention.queue.recover', 'ATR', routeId), principal, this.route(tenantId, domainId, 'executive.attention.queue.recover', 'ATR', routeId), AttentionB36Capability.recovery,
      async (cap, scope) => {
        await cap.assertRecoveryAuthority({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId });
        return { result: { ...(await this.stateOf(await cap.degradedStates({ tenantId, domainId }), intake.state, cap)), opened: 'the route opened; the mechanics follow, then the record' } as Row, targetType: 'ATR', targetId: routeId, targetVersion: null, outboxEvent: null };
      });
    const mechanics: Row = {};
    if (intake.state === 'tick_stalled') {
      const r = await this.timer.reconcile('recovery route re-tick');
      mechanics['reconciled'] = { eligible: r.eligible, scheduled: r.scheduled.filter((s) => s.tenantId === tenantId && s.domainId === domainId).length, failures: r.failures.length };
      const agentId = typeof before.result['agent_id'] === 'string' ? before.result['agent_id'] : null;
      if (this.cfg['eye.runtime.env'] === 'test' && agentId !== null) {
        const t = await this.timer.tickNow({ tenantId, domainId, agentId });
        mechanics['tick'] = { outcome: t.outcome, run_id: t.runId, repeated: t.repeated, stop_reason: t.stopReason };
      } else {
        mechanics['tick'] = agentId === null ? 'no active attention agent: nothing to tick' : 'the reconciled scheduler ticks at the agent\'s cadence (a tick on demand is the test runtime\'s)';
      }
    } else if (intake.state === 'evaluation_stale') {
      const e = await this.evaluateAndHold(this.chained(envelope, 'executive.attention.queue.evaluate', 'ATE', null), principal, tenantId, domainId, { windowFrom: null, windowTo: null, minSample: 5 });
      mechanics['evaluation'] = { evaluation_id: (e['evaluation'] as Row)['evaluation_id'], verdict: (e['evaluation'] as Row)['verdict'], governance: e['governance'] };
    }
    const out = await this.pipeline.write(this.chained(envelope, 'executive.attention.queue.recover', 'ATR', routeId), principal, this.route(tenantId, domainId, 'executive.attention.queue.recover', 'ATR', routeId), AttentionB36Capability.recovery,
      async (cap, scope) => ({ result: await cap.recoverQueue({ routeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, state: intake.state, before: { ...before.result, mechanics }, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATR', targetId: routeId, targetVersion: null, outboxEvent: null }));
    return { recovery: out.result, mechanics, receipt: receipt(out) };
  }
  private async stateOf(states: Row, state: string, cap: AttentionB36Reads): Promise<Row> {
    const s = ((states['states'] as Row[] | undefined) ?? []).find((x) => x['state'] === state) ?? {};
    const agent = state === 'tick_stalled'
      ? (((await cap.readAttentionAgents().selectAll().where('agent_kind' as never, '=', 'attention' as never).where('status' as never, '=', 'active' as never).orderBy('created_at' as never, 'desc').limit(1).execute()) as Row[])[0] ?? null)
      : null;
    return { state, active: s['active'] ?? null, detail: s['detail'] ?? null, as_of: states['as_of'] ?? null, agent_id: agent === null ? null : String(agent['agent_id']) };
  }
  /** THE SYNTHETIC FIXTURE (executive.attention.fixture.arm; human-gated): the next act's settle in this process fails once — the way (n) is reproduced; recorded as an audited act. */
  async armSettleFault(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string): Promise<Row> {
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.fixture.arm', 'ATI', null), AttentionB36Capability.read,
      async (cap) => ({ result: this.acts.armSettleFault({ by: principal.principalId, at: await cap.now() }), targetType: 'ATI', targetId: null, targetVersion: null, outboxEvent: null }));
    return { fixture: out.result, receipt: receipt(out) };
  }

  /* ───────────── (o5) forums ───────────── */
  async convene(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: { title: string; members: string[]; period: string; context: Row }): Promise<Row> {
    const roomId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.forum.convene', 'ROOM', roomId), AttentionB36Capability.forum,
      async (cap, scope) => ({ result: await cap.conveneForum({ roomId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, title: intake.title, members: intake.members, period: intake.period, context: intake.context,
                                                                actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                               targetType: 'ROOM', targetId: roomId, targetVersion: null, outboxEvent: null }));
    return { forum: out.result, receipt: receipt(out) };
  }
}
