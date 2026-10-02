/**
 * THE WORKFLOW TIMERS' FIRING — CP-6 B34 part `workflow` (migration 0090 §W2; F-P6-14; RU-06 "escalate and preserve deadline", MS-05
 * "named authority, deadline, and escalation", IA-41-005 "timers drift … suppress duplicate effects").
 *
 * The prelude's executive.workflow_timers are FIRED here, by the attention tick (the B24 timer host: one tick per domain with an active
 * attention agent, under that agent's own session; the tick's one governed write is bound to executive.attention.tick). Two steps:
 *
 *   workflow-timers (order 20) — claim the domain's due timers (FOR UPDATE SKIP LOCKED: a concurrent tick never takes the same one), hand
 *     each to the WorkflowTimerRegistry's handler for its kind under a SAVEPOINT, and mark it FIRED ONCE (fired_at, the drift, the
 *     firing ledger) in the same savepoint — the effect and the mark commit together or not at all. A handler that throws is rolled back to
 *     its savepoint and RECORDED (executive.record_workflow_timer_failure): the timer stays due and the next tick retries it; the third
 *     failure fires it as `failed` (abandoned, visible). A kind no handler serves is left due and reported (`unhandled`): the part that
 *     owns the kind registers its handler (commitment.checkpoint — the commitments part; gate.expiry — the gates part).
 *   collab-grant-expiry (order 22) — every collaboration grant past its expiry that is still invited or accepted LAPSES (the grant.expiry
 *     timer normally did it at step 20; the sweep leaves no grant live past its expiry whatever happened to its timer); then it READS the
 *     external principals still holding a live credential or session that no live grant names (B34-F1, 0091 §7: executive.collab_access_pending).
 *   the after-tick hook collab-access-revocation (B34-F1) — once the tick committed, each principal step 22 found is revoked by the IDENTITY
 *     authority (collab-identity.service.ts: credentials, sessions, epoch): never nested inside the tick's write; a failure is recorded on
 *     the tick's run and the next tick's read finds the principal again.
 *
 * The kinds served here: task.deadline (ESCALATE the task), task.reminder, workflow.step_timeout, grant.expiry. Every port they call lists
 * executive.attention.tick. The tick's row is written after its steps (agents.service.ts), so a firing carries the tick's KEY and its
 * correlation id (fired_by_tick holds the correlation id — stated).
 */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../attention/tick.js';
import { WorkflowCapability, type WorkflowTickWrites } from './workflow.capabilities.js';
import { CollabIdentityService } from './collab-identity.service.js';

type Row = Record<string, unknown>;
/** The tick steps this part registers (their orders are the B34 map's). */
export const WORKFLOW_TIMERS_STEP = 'workflow-timers';
export const COLLAB_GRANT_EXPIRY_STEP = 'collab-grant-expiry';
/** B34-F1 (0091): the after-tick hook that revokes, through the identity authority, what step 22 found still live. */
export const COLLAB_ACCESS_REVOCATION_HOOK = 'collab-access-revocation';
/** At most this many timers are fired per tick (the claim's bound; what one tick leaves, the next one takes). */
export const FIRE_LIMIT = 100;

/** What a handler is given: the tick's context, the tick capability over its transaction, and the claimed timer. */
export interface WorkflowTimerContext extends AttentionTickContext { cap: WorkflowTickWrites }
export interface ClaimedTimer { timer_id: string; owner_kind: string; owner_id: string; kind: string; due_at: string; payload: Row; attempts: number }
export interface WorkflowTimerHandler {
  /** The timer kind it serves (one of executive.workflow_timer_kinds()). */
  readonly kind: string;
  /** Performs the timer's effect through its owning port (which lists executive.attention.tick); answers what it did. */
  handle(ctx: WorkflowTimerContext, timer: ClaimedTimer): Promise<Row>;
}

@Injectable()
export class WorkflowTimerRegistry {
  private readonly handlers = new Map<string, WorkflowTimerHandler>();
  private readonly doubles = new Map<string, WorkflowTimerHandler>();
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}
  register(h: WorkflowTimerHandler): void {
    if (this.handlers.has(h.kind)) throw new Error(`workflow timer handler ${h.kind} is registered twice`);
    this.handlers.set(h.kind, h);
  }
  handler(kind: string): WorkflowTimerHandler | undefined { return this.doubles.get(kind) ?? this.handlers.get(kind); }
  /** TEST CONTROL ONLY: replace a kind's handler with a double (a failing one), or restore the product's with null. */
  useHandlerForTests(kind: string, h: WorkflowTimerHandler | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useHandlerForTests is available only in the test runtime');
    if (h === null) this.doubles.delete(kind); else this.doubles.set(kind, h);
  }
  kinds(): string[] { return [...this.handlers.keys()].sort(); }
}

@Injectable()
export class WorkflowTimerSteps implements OnModuleInit {
  constructor(private readonly ticks: AttentionTickRegistry, private readonly registry: WorkflowTimerRegistry, /* B34-F1 */ private readonly collabIdentity: CollabIdentityService) {}

  onModuleInit(): void {
    // the four kinds this part serves; each calls its own port under the tick's action
    this.registry.register({ kind: 'task.deadline', handle: async (c, t) => c.cap.escalateTask({ timerId: t.timer_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    this.registry.register({ kind: 'task.reminder', handle: async (c, t) => c.cap.remindTask({ timerId: t.timer_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    this.registry.register({ kind: 'workflow.step_timeout', handle: async (c, t) => c.cap.stepTimeout({ timerId: t.timer_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    this.registry.register({ kind: 'grant.expiry', handle: async (c, t) => c.cap.lapseGrant({ timerId: t.timer_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    this.ticks.register({ name: WORKFLOW_TIMERS_STEP, order: 20, run: async (ctx) => this.fire(ctx) });
    this.ticks.register({ name: COLLAB_GRANT_EXPIRY_STEP, order: 22, run: async (ctx) => this.sweepGrants(ctx) });
    /* B34-F1 (0091): the identity half of every lapse and revocation, after the tick's write committed */
    this.ticks.registerAfter({
      name: COLLAB_ACCESS_REVOCATION_HOOK,
      run: async (a) => {
        const pending = (((a.steps[COLLAB_GRANT_EXPIRY_STEP] ?? {}) as Row)['access_pending'] ?? []) as Row[];
        if (pending.length === 0) return { pending: 0, revoked: [], failed: [] };
        return this.collabIdentity.revokePending(pending, { principalId: a.principal.principalId, sessionId: a.principal.sessionId }, a.correlationId);
      },
    });
    /* end B34-F1 */
  }

  /** Step 20: claim, dispatch by kind, mark fired once — each timer in its own savepoint. */
  async fire(ctx: AttentionTickContext): Promise<Row> {
    const cap = WorkflowCapability.tick(ctx.tx, 'executive.attention.tick');
    const claimed = (await cap.claimDueTimers({ tenantId: ctx.tenantId, domainId: ctx.domainId, limit: FIRE_LIMIT })) as unknown as ClaimedTimer[];
    const tally: Record<string, number> = { fired: 0, skipped: 0, failed: 0, abandoned: 0, unhandled: 0 };
    const timers: Row[] = [];
    const c: WorkflowTimerContext = { ...ctx, cap };
    for (const t of claimed) {
      const h = this.registry.handler(t.kind);
      if (h === undefined) { tally['unhandled'] = (tally['unhandled'] ?? 0) + 1; timers.push({ timer_id: t.timer_id, kind: t.kind, outcome: 'unhandled' }); continue; }
      try {
        const out = await cap.withSavepoint('b34_workflow_timer', async () => {
          const result = await h.handle(c, t);
          const outcome = result['skipped'] === true ? 'skipped' : 'fired';
          const fired = await cap.fireTimer({ timerId: t.timer_id, tenantId: ctx.tenantId, domainId: ctx.domainId, tickKey: ctx.tickKey, tickRef: ctx.correlationId, outcome, result, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
          return { outcome, result, drift_seconds: Number(fired['drift_seconds']) };
        });
        tally[out.outcome] = (tally[out.outcome] ?? 0) + 1;
        timers.push({ timer_id: t.timer_id, kind: t.kind, owner_id: t.owner_id, ...out });
      } catch (e) {
        const error = String((e as Error)?.message ?? e).slice(0, 500);
        const rec = await cap.recordTimerFailure({ timerId: t.timer_id, tenantId: ctx.tenantId, domainId: ctx.domainId, error, tickKey: ctx.tickKey, tickRef: ctx.correlationId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
        const abandoned = rec['abandoned'] === true;
        tally[abandoned ? 'abandoned' : 'failed'] = (tally[abandoned ? 'abandoned' : 'failed'] ?? 0) + 1;
        timers.push({ timer_id: t.timer_id, kind: t.kind, owner_id: t.owner_id, outcome: abandoned ? 'abandoned' : 'failed', attempt: rec['attempt'], error });
      }
    }
    return { claimed: claimed.length, ...tally, timers };
  }

  /** Step 22: every grant past its expiry that is still invited or accepted lapses (its tasks reassigned with reason access_lost); the access still to revoke read. */
  async sweepGrants(ctx: AttentionTickContext): Promise<Row> {
    const cap = WorkflowCapability.tick(ctx.tx, 'executive.attention.tick');
    const lapsed = await cap.lapseExpiredGrants({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
    /* B34-F1 (0091 §7): what the after-tick hook revokes through the identity authority (this step's lapses and step 20's, and any left live before) */
    return { ...lapsed, access_pending: await cap.accessPending({ tenantId: ctx.tenantId, domainId: ctx.domainId }) };
  }
}
