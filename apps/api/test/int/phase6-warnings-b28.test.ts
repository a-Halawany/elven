/**
 * CP-6 B28 (migration 0088 §W, part `warnings`; F-P4-12) — THE EARLY-WARNING LIFECYCLE: warning CANDIDATES from origins other than an
 * indicator breach (0088 §0's intake) turned into warnings — DEDUPLICATED by (cause, affected objectives, geographies, horizon), CLUSTERED
 * with their stance, a STORM folded into its lead — RAISED through prediction.raise_warning (unchanged) in their own write; the CONTEXT
 * (contradicting evidence, affected objectives, falsification, the verification/simulation playbook); EXPIRY that escalates the linked
 * attention item at once, run by the attention tick; CLOSURE on a criterion; FEEDBACK and the warning EVALUATION; the COVERAGE GAPS read;
 * the warnings CONSUMER's three origins — on a real database with real Redis, the real outbox publisher and the real dispatcher
 * (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the world of `bootDecisionWorld` and B28's own humans with sessions of their own.
 *
 * The candidates of L1–L3 are SUBMITTED through the intake port (prediction.submit_warning_candidate, under prediction.warning.raise —
 * one of the four actions it admits) exactly as the stream-rules and weak-signal parts will submit theirs: those parts are built in
 * parallel worktrees and are not on this branch (stated). The consumer's candidates (L7) come from the consumer itself.
 *
 *   L1 · DEDUP + RAISE: three reports of one Bab el-Mandeb incident (two supporting, one CONTRADICTING, from three sources) against the
 *   Regensburg objective → ONE warning with three members (lead + two duplicates, one contradicting), ONE EarlyWarningRaised; the same
 *   incident against a DISTINCT objective → a second warning; routed to each objective's owner; the PDP (a domain analyst 403), the
 *   intake bound (422); the raise's canonical WRN object, the projection check (mismatched 0) after the non-state events.
 *   L2 · CONTEXT: the owner sets contradicting evidence, the affected objective, a falsification condition and a SIMULATION playbook
 *   (scenario, branch, run); refused — an unknown scenario 404, an unknown objective 404, a malformed playbook 422, a non-owner 403 (the
 *   port) and a role outside the rule 403 (the PDP), a stale version 409; recovery — the right version accepted; the coverage GAP of a
 *   member's degraded source on the lifecycle read.
 *   L3 · STORM: five reports of one cause across five geographies → three warnings raised, the other two folded into the storm's LEAD
 *   (member kind storm, their own keys kept), no event for them; a later report of the storm → folded again.
 *   L4 · THE TICK: the attention agent's tick — the step `warning-candidates` folds a duplicate and leaves a new key RAISE-OWED (the tick
 *   never raises: stated), a person's processing raises it (recovery); `warning-expiry` expires the Bab el-Mandeb warning whose window was
 *   moved into the past by the superuser (stated) and ESCALATES its attention item at once (`warning.escalated`, item escalated with the
 *   class's escalation roles); a second tick changes nothing (idempotent).
 *   L5 · CLOSE: refused — a falsified closure without a declared condition 409, a non-owner 403, a malformed criterion 422, an unknown
 *   warning 404; closed by the owner on `falsified` naming the held condition; a second closure 409 (not_open); the context of a closed
 *   warning 409.
 *   L6 · FEEDBACK + EVALUATION: J. Weber marks the expired warning `late` (the event; a repeat answers `repeated`, no second event); the
 *   PDP (an auditor 403), a malformed kind 422, a false verdict with no note 422 (the port), an unknown warning 404; the executive's
 *   evaluation (min_sample 1): the rates BY ORIGIN, T3 measured over the one warning that declares a deadline, the acknowledgement
 *   abstaining; min_sample 50 → abstained; the PDP (a forecast owner 403); the list.
 *   L7 · THE CONSUMER: a `warnings` subscription; three GraphChanged rows PLANTED as their producers write them (stated) — an invalidation
 *   reaching the Regensburg objective, a forecast withdrawn, a twin version admitted → three candidates (graph_impact, forecast_revision,
 *   twin_degradation), origin_key = event id + item; the REPLAY re-applies the deliveries and submits nothing twice; the graph-impact
 *   candidate processed into a warning of origin graph_impact.
 *
 * EACH CASE LOGS ONE `B28 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b28-warnings-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Candidate = { candidate_id: string; state: string; warning_id: string | null; origin_kind: string; origin_key: string; cause_key: string; outcome: Row };
type Member = { member_id: string; member_kind: string; stance: string; candidate_id: string; source_id: string | null; dedup_key: string; cause_key: string; geographies: string[] };

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let commitDb: Db;
let graph: GraphController; let prediction: PredictionController; let exec: ExecutiveController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let timer: AttentionTimerService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal;
let regOwner: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal;
/** What the cases leave one another (each named where it is made). */
let regObjective = ''; let A = ''; let B = ''; let stormLead = ''; let agentId = '';
const subs: Record<string, string> = {};
const SRC_A = uuidv7(); const SRC_C = uuidv7();
const INCIDENT = 'incident:bab-el-mandeb:2026-09-26';
const STORM = 'incident:red-sea-insurers:2026-09-26';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(300);
  }
}
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B28 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the intake (the port, as the stream-rules and weak-signal parts submit) ───────────── */
interface Submission { originKind?: string; originKey: string; originRef?: Row; title: string; consequence?: string; confidence?: number | null; causeKey: string; affected: Row; evidence: Row[]; windowHours?: number | null }
const submit = (s: Submission) => inCommitContext(commitDb, { sessionId: forecastOwner.sessionId as string, contextKey: forecastOwner.contextKey as string }, { tenantId: T(), domainId: D() },
  'prediction.warning.raise', uuidv7(), async (tx) => (await sql<{ r: Row }>`select prediction.submit_warning_candidate(${T()}::uuid, ${D()}::uuid, ${s.originKind ?? 'weak_signal'}, ${s.originKey},
    ${JSON.stringify({ synthetic: true, ...(s.originRef ?? {}) })}::jsonb, ${s.title}, ${s.consequence ?? 'C2'}, ${s.confidence === undefined ? 0.7 : s.confidence}::numeric, ${s.causeKey},
    ${JSON.stringify(s.affected)}::jsonb, ${JSON.stringify(s.evidence)}::jsonb, ${s.windowHours ?? null}::int, ${forecastOwner.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never)).rows[0]!.r);
const key = (label: string) => ['b28', label, uuidv7().slice(-8)].join('-');

/* ───────────── the routes (in process) ───────────── */
type Processing = { processing: { passes: Row[]; raised: Row[] } };
const processNow = (as = forecastOwner, payload: Row = {}) => prediction.processWarningCandidates(h.req(as, 'prediction.warning.candidates.process', 'WRN', null), T(), D(), { payload } as never) as unknown as Promise<Processing>;
const lifecycle = (id: string, as = forecastOwner) => prediction.warningLifecycle(h.req(as, 'prediction.read', 'WRN', id), T(), D(), id) as unknown as Promise<{ lifecycle: Row & { members: Member[] } }>;
const setContext = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.setWarningContext(h.req(as, 'prediction.warning.context.set', 'WRN', id), T(), D(), id, { payload }) as unknown as Promise<{ context: Row }>;
const closeWarning = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.closeWarning(h.req(as, 'prediction.warning.close', 'WRN', id), T(), D(), id, { payload }) as unknown as Promise<{ warning: Row }>;
const feedback = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.warningFeedback(h.req(as, 'prediction.warning.feedback', 'WRN', id), T(), D(), id, { payload }) as unknown as Promise<{ feedback: Row }>;
const evaluate = (as: AuthenticatedPrincipal, payload: Row) => prediction.runWarningEvaluation(h.req(as, 'prediction.warning.evaluate', 'WRN', null), T(), D(), { payload }) as unknown as Promise<{ evaluation: Row }>;
const evaluations = (as: AuthenticatedPrincipal) => prediction.listWarningEvaluations(h.req(as, 'prediction.warning.evaluations.read', 'WRN', null), T(), D(), { payload: {} }) as unknown as Promise<{ evaluations: Row[] }>;
const verifyProjections = () => prediction.verifyProjections(h.req(forecastOwner, 'prediction.read', 'FCT', null), T(), D()) as unknown as Promise<{ projections: Array<{ projection: string; mismatched: string }> }>;

/* ───────────── the rows ───────────── */
const candidate = async (id: string): Promise<Candidate> => (await sql<Candidate>`select candidate_id::text, state, warning_id::text, origin_kind, origin_key, cause_key, outcome from prediction.warning_candidates where candidate_id = ${id}::uuid`.execute(su)).rows[0]!;
const warningRow = async (id: string) => (await sql<{ state: string; routed_to: string; origin_kind: string; cluster_id: string | null; origin_ref: Row; response_window_closes_at: Date; context_version: number; level: string; consequence_class: string }>`
  select state, routed_to::text, origin_kind, cluster_id::text, origin_ref, response_window_closes_at, context_version, level, consequence_class from prediction.warnings_current where warning_id = ${id}::uuid`.execute(su)).rows[0]!;
const warningEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from prediction.warning_events where warning_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const raisedEvents = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'EarlyWarningRaised' and payload ->> 'warning_id' = ${id}`.execute(su)).rows[0]!.n;
const itemOf = async (warningId: string) => (await sql<{ item_id: string; state: string; escalations: number; route_roles: string[] }>`select item_id::text, state, escalations, route_roles from executive.attention_items where signal_class = 'warning.raised' and subject_id = ${warningId}::uuid`.execute(su)).rows[0];
const itemEvents = async (itemId: string) => (await sql<{ event: string; details: Row }>`select event, details from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;

/** A row PLANTED in the tenant's outbox partition the way 0064 places every row (the B22 harness :183) — PENDING, so the real publisher leases and routes it. */
async function plantOutbox(eventType: string, payload: Row): Promise<{ id: string; seq: number }> {
  const id = uuidv7(); const k = `tenant:${T()}`;
  const r = await sql<{ n: number }>`with pk as (insert into objects.outbox_partitions (partition_key) values (${k}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${k} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${k}, seq.n, 'v1' from seq returning partition_seq::int as n`.execute(su);
  return { id, seq: r.rows[0]!.n };
}
/** A GraphChanged payload as its producers write it (graph-change.ts): the change, the walk's objects, the typed block of the kind. */
const graphChanged = (kind: string, objects: Partial<Record<string, string[]>>, extra: Row = {}): Row => ({
  schema: 'GraphChanged', schema_version: 'v1', change: { kind, occurred_at: new Date().toISOString(), ...(obj(extra['change'])) },
  identities: [], relationships: { edges: [], resolutions: [], dependencies: [] },
  objects: { claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], briefings: [], memoryItems: [], truncated: false, walked: true, ...objects },
  temporal: { known_at: new Date().toISOString() }, subscriptions: [], cause: { action: 'b28.harness', actor: `principal:${dadmin.principalId}`, target_type: 'OBJ', target_id: null },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'change')),
});
const deliveryOf = async (eventId: string, kind: string) => (await sql<{ state: string; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>; replay_seq: number }>`
  select state, items, items_applied, replay_seq from graph.subscription_deliveries where event_id = ${eventId}::uuid and consumer_kind = ${kind}`.execute(su)).rows[0];

/** The domain's attention policy: warning.raised routed to the strategy owner, escalated to the executive; the neutral confidence (0.5) is material. */
const RULES = (): Row => ({
  classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.4 }, route_roles: ['strategy_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 2,
                        suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' },
  },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  graph = h.app.get(Gc); prediction = h.app.get(Pc); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); timer = h.app.get(AttentionTimerService);
  commitDb = h.app.get<Db>(COMMIT_DB);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal). Persona text is pronoun-neutral.
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b28-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b28-domain-admin');
  executive = await h.humanWithSession(['executive'], 'b28-executive');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b28-forecast-owner');
  regOwner = await h.humanWithSession(['strategy_owner'], 'b28-regensburg-owner');
  weber = await h.humanWithSession(['executive'], 'b28-j-weber');
  analyst = await h.humanWithSession(['domain_analyst'], 'b28-analyst');
  auditor = await h.humanWithSession(['auditor'], 'b28-auditor', 'TENANT');
  collector = await h.humanWithSession(['collection_manager'], 'b28-collector');
  w = await bootDecisionWorld(h);
  // The Regensburg objective of the scene, owned by a named human with a session of their own (the world's objective is the second one).
  regObjective = (await graph.declare(h.req(regOwner, 'graph.strategy.declare', 'OBJ', null, 'graph'), T(), D(), { payload: { objectType: 'OBJ', title: 'Keep the Regensburg magnet line supplied (B28)',
    statement: 'no line stop at Regensburg attributable to the Red Sea corridor', restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the line is supplied through this strait' }] } }) as unknown as { strategy: { objectId: string } }).strategy.objectId;
  // THE ATTENTION POLICY and the two subscriptions this file reads through (the tenant administrator; the backlog left).
  await exec.publishAttentionPolicy(h.req(executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules: RULES(), reason: 'the corridor warnings routed to the strategy owner (B28 harness)' } as never });
  for (const kind of ['attention', 'warnings']) {
    const r = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
      { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as unknown as { subscription: { subscriptionId: string } };
    subs[kind] = r.subscription.subscriptionId;
  }
}, 400_000);

afterAll(async () => {
  try { if (agentId !== '') await exec.revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the harness is done (B28 harness)' } }); } catch { /* already revoked */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B28 · the early-warning lifecycle (0088 §W; F-P4-12)', () => {
  it('L1 · DEDUP + RAISE: three reports of one incident → one warning with three members (one contradicting); a distinct objective → a second warning; the PDP and the intake bound refuse', async () => {
    const deadline = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const affected = { objectives: [regObjective], geographies: ['BAB-EL-MANDEB'], horizon: '30d' };
    const c1 = await submit({ originKey: key('bab-1'), title: 'Bab el-Mandeb: a container vessel attacked near Perim (report 1)', causeKey: INCIDENT, affected,
      originRef: { source_id: SRC_A, decision_deadline: deadline }, evidence: [{ object_id: w.evd.id, version: w.evd.version, source_id: SRC_A, stance: 'supporting' }] });
    const c2 = await submit({ originKey: key('bab-2'), title: 'Bab el-Mandeb: the same attack reported by a second source', causeKey: INCIDENT, affected: { ...affected, geographies: ['bab-el-mandeb'] },
      evidence: [{ object_id: w.records.inv.id, version: w.records.inv.version, source_id: h.fx.sourceId, stance: 'supporting' }] });
    const c3 = await submit({ originKey: key('bab-3'), title: 'Bab el-Mandeb: a third source says the vessel was not hit', causeKey: INCIDENT, affected,
      evidence: [{ object_id: w.records.ship.id, version: w.records.ship.version, source_id: SRC_C, stance: 'contradicting' }] });
    const c4 = await submit({ originKey: key('bab-4'), title: 'Bab el-Mandeb: the attack against the world objective', causeKey: INCIDENT, affected: { objectives: [w.objectiveId], geographies: ['BAB-EL-MANDEB'], horizon: '30d' },
      evidence: [{ object_id: w.evd.id, version: w.evd.version, source_id: SRC_A, stance: 'supporting' }] });
    // the intake is idempotent on (origin_kind, origin_key): the same key answers `repeated`
    const again = await submit({ originKey: String((await candidate(String(c1['candidate_id']))).origin_key), title: 'a redelivered report', causeKey: INCIDENT, affected, evidence: [] });
    expect(again).toMatchObject({ candidate_id: c1['candidate_id'], repeated: true });
    /* L1.1 THE PDP and the route's bound. */
    await refused(processNow(analyst), /./, 403, 'EYE-AUT-001');
    await refused(processNow(forecastOwner, { limit: 0 }), /payload\.limit is a whole number in \[1, 200\]/, 422, 'EYE-REQ-001');
    expect((await candidate(String(c1['candidate_id']))).state, 'a refused call decides nothing').toBe('pending');
    /* L1.2 THE PROCESSING: pass 1 raises c1 and c4 (two keys), defers c2 and c3 behind c1's raise; pass 2 folds them into A. */
    const p = await processNow();
    const raised = p.processing.raised.filter((r) => r['decision'] === 'raised');
    expect(raised.map((r) => r['candidate_id']).sort()).toEqual([c1['candidate_id'], c4['candidate_id']].sort());
    A = String(raised.find((r) => r['candidate_id'] === c1['candidate_id'])!['warning_id']);
    B = String(raised.find((r) => r['candidate_id'] === c4['candidate_id'])!['warning_id']);
    expect(A).not.toBe(B);
    const pass1 = p.processing.passes[0]!;
    expect((pass1['deferred'] as Row[]).map((d) => d['candidate_id']).sort()).toEqual([c2['candidate_id'], c3['candidate_id']].sort());
    expect(p.processing.passes.length, 'the deferred are decided on the next pass').toBe(2);
    for (const c of [c2, c3]) expect(await candidate(String(c['candidate_id']))).toMatchObject({ state: 'clustered', warning_id: A });
    /* L1.3 THE WARNING: one warning, three members, one contradicting; routed to each objective's owner; the origin and the key recorded. */
    const lc = (await lifecycle(A)).lifecycle;
    expect(lc.members.map((m) => [m.member_kind, m.stance]).sort()).toEqual([['duplicate', 'contradicting'], ['duplicate', 'supporting'], ['lead', 'supporting']]);
    expect(lc.members.find((m) => m.stance === 'contradicting')!.source_id).toBe(SRC_C);
    expect(obj(lc['contradicting'])['count'], 'the contradicting report is on the warning').toBe(1);
    const wa = await warningRow(A);
    expect(wa).toMatchObject({ state: 'raised', routed_to: regOwner.principalId, origin_kind: 'weak_signal', consequence_class: 'C2' });
    expect(wa.origin_ref).toMatchObject({ candidate_id: c1['candidate_id'], cause_key: INCIDENT, dedup_key: `${INCIDENT}|obj:${regObjective}|geo:bab-el-mandeb|h:30d` });
    expect(await warningRow(B)).toMatchObject({ routed_to: w.twinOwner.principalId, origin_kind: 'weak_signal' });
    expect(obj(lc['cluster'])['dedup_key']).not.toBe(String(obj((await lifecycle(B)).lifecycle['cluster'])['dedup_key']));
    /* L1.4 ONE EarlyWarningRaised per warning, none for a member; the canonical WRN object; `warning.clustered` twice on A. */
    expect(await raisedEvents(A)).toBe(1);
    expect(await raisedEvents(B)).toBe(1);
    const wrn = (await sql<{ method_ref: string; schema_ref: string; synthetic_state: boolean }>`select method_ref, schema_ref, synthetic_state from objects.canonical_objects where object_id = ${A}::uuid`.execute(su)).rows[0]!;
    expect(wrn).toEqual({ method_ref: 'warning-candidate@1.0.0', schema_ref: 'WRN@v2', synthetic_state: true });
    expect((await warningEvents(A)).map((e) => e.event)).toEqual(['warning.raised', 'warning.clustered', 'warning.clustered']);
    /* L1.5 THE PROJECTION CHECK follows the four state events (0088 §W9): the clustered events read as nothing. */
    const proj = (await verifyProjections()).projections.find((x) => x.projection === 'warnings_current')!;
    expect(Number(proj.mismatched)).toBe(0);
    sixEvidence('L1', { fault_trace: { refused: ['analyst 403 (PDP)', 'limit 0 → 422'] }, watermark: { passes: p.processing.passes.length, deferred: 2 },
      consumer_behaviour: { raised: [A, B], members_of_A: lc.members.length, contradicting: 1 }, operator_action: 'the forecast owner processed the intake',
      recovery: { deferred_folded_on_pass_2: true, repeated_intake: true }, reconciliation: { early_warning_raised: { A: 1, B: 1 }, projection_mismatched: 0 } });
  }, 240_000);

  it('L2 · CONTEXT: contradicting, affected, falsification and a simulation playbook set by the owner; the refusals (404, 422, 403, 409) and the recovery; the coverage gap of a member\'s degraded source', async () => {
    const good = (over: Row = {}): Row => ({
      expected_version: 0,
      contradicting: [{ object_id: w.records.ship.id, version: w.records.ship.version, source_id: SRC_C, note: 'the third source says the vessel was not hit' }],
      affected: { objectives: [regObjective], assets: ['SYN-SHIP-4472'], actors: [], geographies: ['BAB-EL-MANDEB'], horizon: '30d' },
      falsification: [{ condition: 'transits through Bab el-Mandeb recover above 40 a day for three consecutive days', indicator_id: w.indicatorId }],
      playbook: { kind: 'simulation', scenario_id: w.scenarioId, branch_id: w.branchId, run_id: w.controlId, note: 'the corridor collapse branch' },
      ...over,
    });
    /* L2.1 THE REFUSALS. */
    await refused(setContext(regOwner, A, good({ playbook: { kind: 'simulation', scenario_id: uuidv7() } })), /^warning context rejected: no such scenario .* \(playbook\)/, 404, 'EYE-STA-001');
    await refused(setContext(regOwner, A, good({ affected: { objectives: [uuidv7()] } })), /^warning context rejected: no such objective/, 404, 'EYE-STA-001');
    await refused(setContext(regOwner, A, good({ playbook: { kind: 'guess', scenario_id: w.scenarioId } })), /^warning context rejected: the playbook is \{kind: verification \| simulation/, 422, 'EYE-REQ-001');
    await refused(setContext(regOwner, A, good({ falsification: [{ condition: 'short' }] })), /^warning context rejected: each falsification condition is/, 422, 'EYE-REQ-001');
    await refused(setContext(regOwner, A, { contradicting: [] }), /payload\.expected_version is the context version read/, 422, 'EYE-REQ-001');
    await refused(setContext(executive, A, good()), /^warning context rejected: the context is set by the warning's owner/, 403, 'EYE-AUT-001');
    await refused(setContext(collector, A, good()), /./, 403, 'EYE-AUT-001');
    expect((await warningRow(A)).context_version, 'nothing refused was written').toBe(0);
    /* L2.2 THE CONTEXT, then a stale version refused and the right one accepted (recovery). */
    const c = (await setContext(regOwner, A, good())).context;
    expect(c).toMatchObject({ context_version: 1, playbook: { kind: 'simulation', scenario_id: w.scenarioId, run_id: w.controlId } });
    await refused(setContext(regOwner, A, good({ contradicting: [] })), /^warning context rejected \(stale_version\): the context stands at version 1, not 0/, 409, 'EYE-STA-002');
    const c2 = (await setContext(regOwner, A, good({ expected_version: 1 }))).context;
    expect(c2['context_version']).toBe(2);
    /* L2.3 THE COVERAGE GAP: a marker PLANTED (stated) as the source-health subscriber sets it on a product of a member's source. */
    await sql`insert into observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${h.fx.sourceId}::uuid, 'forecast', ${w.forecastId}::uuid, 'degraded', 'the corridor feed lost coverage (B28 harness, planted)', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const lc = (await lifecycle(A)).lifecycle;
    expect(obj(lc['contradicting'])['count'], 'the context\'s item and the member\'s report').toBe(2);
    expect(obj(lc['affected'])['objectives']).toEqual([{ objective_id: regObjective, title: 'Keep the Regensburg magnet line supplied (B28)', status: 'active', owner: regOwner.principalId }]);
    expect(lc['falsification']).toHaveLength(1);
    const gaps = obj(lc['coverage_gaps']);
    expect(gaps['count']).toBe(1);
    expect((gaps['markers'] as Row[])[0]).toMatchObject({ source_id: h.fx.sourceId, health_state: 'degraded', via: 'a member\'s source' });
    expect((await warningEvents(A)).filter((e) => e.event === 'warning.context_set').map((e) => e.details['context_version'])).toEqual([1, 2]);
    expect(Number((await verifyProjections()).projections.find((x) => x.projection === 'warnings_current')!.mismatched)).toBe(0);
    sixEvidence('L2', { fault_trace: { refused: ['unknown scenario 404', 'unknown objective 404', 'malformed playbook 422', 'short condition 422', 'no version 422', 'non-owner 403 (port)', 'collection manager 403 (PDP)', 'stale 409'] },
      watermark: { context_version: 2 }, consumer_behaviour: { contradicting: 2, playbook: 'simulation' }, operator_action: 'the Regensburg objective owner set the context',
      recovery: 'the stale write retried at version 1', reconciliation: { coverage_gaps: gaps['count'] } });
  }, 120_000);

  it('L3 · STORM: five reports of one cause across five geographies → three raised, two folded into the lead (member kind storm), no event for them; a later report folded again', async () => {
    const ids: string[] = [];
    for (const g of ['ADEN', 'HODEIDAH', 'JEDDAH', 'PORT-SUDAN', 'DJIBOUTI']) {
      const r = await submit({ originKind: 'stream_rule', originKey: key(`storm-${g}`), title: `Red Sea insurers withdraw cover at ${g}`, causeKey: STORM, affected: { geographies: [g], horizon: '7d' },
        evidence: [{ object_id: w.evd.id, version: w.evd.version, stance: 'supporting' }] });
      ids.push(String(r['candidate_id']));
    }
    const p = await processNow();
    const raised = p.processing.raised.filter((r) => r['decision'] === 'raised').map((r) => String(r['candidate_id']));
    expect(raised).toEqual(ids.slice(0, 3));
    const first = await candidate(ids[0]!);
    stormLead = String(first.warning_id);
    for (const id of ids.slice(3)) {
      const c = await candidate(id);
      expect(c).toMatchObject({ state: 'clustered', warning_id: stormLead });
      expect(obj(c.outcome)['member_kind']).toBe('storm');
    }
    const lc = (await lifecycle(stormLead)).lifecycle;
    expect(lc.members.filter((m) => m.member_kind === 'storm').map((m) => m.geographies)).toEqual([['port-sudan'], ['djibouti']]);
    expect(obj(lc['storm'])).toMatchObject({ members: 2, causes: [STORM], rule: { version: 1, max_raises: 3, window_minutes: 60 } });
    // a storm member keeps its OWN key (a different geography); no EarlyWarningRaised was published for it
    expect(new Set(lc.members.map((m) => m.dedup_key)).size).toBe(3);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'EarlyWarningRaised' and payload ->> 'warning_id' = any(${[String((await candidate(ids[0]!)).warning_id), String((await candidate(ids[1]!)).warning_id), String((await candidate(ids[2]!)).warning_id)]}::text[])`.execute(su)).rows[0]!.n).toBe(3);
    // a later report of the storm (a sixth geography) folds into the same lead
    const late = await submit({ originKind: 'stream_rule', originKey: key('storm-MASSAWA'), title: 'Red Sea insurers withdraw cover at MASSAWA', causeKey: STORM, affected: { geographies: ['MASSAWA'], horizon: '7d' }, evidence: [] });
    const p2 = await processNow();
    expect(p2.processing.raised).toHaveLength(0);
    expect(await candidate(String(late['candidate_id']))).toMatchObject({ state: 'clustered', warning_id: stormLead });
    sixEvidence('L3', { fault_trace: { storm_rule: obj(lc['storm'])['rule'] }, watermark: { raised: 3, folded: 3 }, consumer_behaviour: { lead: stormLead, storm_members: 3 },
      operator_action: 'the forecast owner processed the intake twice', recovery: 'the deferred storm members folded on the next pass', reconciliation: { early_warning_raised: 3 } });
  }, 180_000);

  it('L4 · THE TICK: the candidates step folds a duplicate and leaves a new key raise-owed — RAISED right after the tick by the attention agent (the after-tick hook, 0088 §I); the expiry step expires the Bab el-Mandeb warning and escalates its attention item at once; a second tick changes nothing', async () => {
    // The warning's attention item, routed by the attention subscriber from EarlyWarningRaised (the real dispatcher).
    const item = await waitFor('the attention item of warning A', () => itemOf(A), (x) => x !== undefined, 120_000);
    expect(item).toMatchObject({ state: 'open', escalations: 0 });
    const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST,
      ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string; principalId: string } };
    agentId = r.agent.agentId;
    // The registration points the domain's timer at the agent and its scheduler runs a FIRST tick at once (a BullMQ repeat's first
    // iteration): waited for, then the timer unscheduled (stated) — the ticks below are the test hook's, each its own instant. Two
    // ticks that meet the same pending candidate never both take it (FOR UPDATE SKIP LOCKED); the harness still keeps them apart.
    const repeatTicks = async () => (await sql<{ n: number }>`select count(*)::int n from executive.attention_ticks t join executive.agent_runs r on r.run_id = t.run_id where r.agent_id = ${agentId}::uuid and r.trigger_ref like 'repeat:%'`.execute(su)).rows[0]!.n;
    await waitFor('the timer\'s first scheduled tick', repeatTicks, (n) => n >= 1, 30_000).catch(() => 0);
    await scheduler.unscheduleAttentionTick(T(), D());
    const dup = await submit({ originKey: key('bab-5'), title: 'Bab el-Mandeb: a fourth source repeats the attack', causeKey: INCIDENT, affected: { objectives: [regObjective], geographies: ['BAB-EL-MANDEB'], horizon: '30d' },
      evidence: [{ object_id: w.evd.id, version: w.evd.version, stance: 'supporting' }] });
    const fresh = await submit({ originKey: key('bab-6'), title: 'Bab el-Mandeb: the attack on the 90-day horizon', causeKey: INCIDENT, affected: { objectives: [regObjective], geographies: ['BAB-EL-MANDEB'], horizon: '90d' },
      evidence: [{ object_id: w.evd.id, version: w.evd.version, stance: 'supporting' }] });
    // the Bab el-Mandeb warning's window moved into the past by the superuser (stated: the DB clock, the opening two hours ago)
    await sql`update prediction.warnings_current set response_window_opens_at = clock_timestamp() - interval '2 hours', response_window_closes_at = clock_timestamp() - interval '1 minute' where warning_id = ${A}::uuid`.execute(su);
    const t1 = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2033, 0, 1)) });
    expect(t1.outcome, JSON.stringify(t1.stopReason)).toBe('finished');
    const steps = obj(obj(t1.run?.outputs)['steps']);
    expect(obj(t1.run?.outputs)['order']).toEqual(expect.arrayContaining([{ name: 'warning-candidates', order: 5 }, { name: 'warning-expiry', order: 6 }]));
    expect(steps['warning-candidates']).toMatchObject({ clustered: 1, raise_owed: 1, owed: [fresh['candidate_id']] });
    expect(steps['warning-expiry']).toMatchObject({ expired: 1 });
    expect(await candidate(String(dup['candidate_id']))).toMatchObject({ state: 'clustered', warning_id: A });
    // B28 (0088 §I): the tick itself never raises (its write is executive.attention.tick); the owed candidate is raised RIGHT AFTER it by the
    // attention agent in its own write under prediction.warning.raise (the after-tick hook `warning-raise`), recorded on the run.
    expect(obj(obj(t1.run?.outputs)['after'])['warning-raise']).toMatchObject({ owed: 1, raised: 1 });
    expect(await candidate(String(fresh['candidate_id']))).toMatchObject({ state: 'raised' });
    /* the expiry and its escalation */
    expect((await warningRow(A)).state).toBe('expired');
    const evs = await warningEvents(A);
    expect(evs.map((e) => e.event).slice(-2)).toEqual(['warning.expired', 'warning.escalated']);
    expect((evs.at(-1)!.details['items'] as Row[])[0]).toMatchObject({ item_id: item!.item_id, from_state: 'open', to_state: 'escalated', escalation: 1 });
    const esc = (await itemOf(A))!;
    expect(esc).toMatchObject({ state: 'escalated', escalations: 1 });
    expect([...esc.route_roles].sort()).toEqual(['executive', 'strategy_owner']);
    expect((await itemEvents(esc.item_id)).find((e) => e.event === 'item.escalated')!.details).toMatchObject({ via: 'warning.expired', warning_id: A, escalation: 1 });
    /* a second tick (the next instant of the agent's daily cadence — the tick key is the instant over the cadence): nothing more expires, nothing escalates again, nothing is owed */
    const t2 = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2033, 0, 2)) });
    expect(obj(obj(obj(t2.run?.outputs)['steps'])['warning-expiry'])['expired']).toBe(0);
    expect((await itemOf(A))!.escalations).toBe(1);
    expect(obj(obj(t2.run?.outputs)['after'])['warning-raise']).toMatchObject({ owed: 0, raised: 0 });
    /* a person's processing afterwards finds nothing owed: the agent raised it (never twice) */
    const p = await processNow();
    expect(p.processing.raised).toEqual([]);
    expect(Number((await verifyProjections()).projections.find((x) => x.projection === 'warnings_current')!.mismatched)).toBe(0);
    sixEvidence('L4', { fault_trace: { window_closed: 'moved into the past (stated)' }, watermark: { tick_1: steps, tick_2_expired: 0 },
      consumer_behaviour: { item: esc.item_id, escalated: 1, via: 'warning.expired' }, operator_action: 'the attention agent ticked twice; the forecast owner processed the intake (nothing owed)',
      recovery: 'the raise-owed candidate raised by the attention agent after its tick', reconciliation: { warning_state: 'expired', projection_mismatched: 0 } });
  }, 240_000);

  it('L5 · CLOSE: refused (409 no falsification, 403 non-owner, 422 criterion, 404 unknown); closed by the owner on a falsified condition; a second closure and a context on a closed warning 409', async () => {
    // the world objective's warning B has no falsification condition: a falsified closure is refused
    await refused(closeWarning(dadmin, B, { criterion: 'falsified', condition: 0, reason: 'transits recovered above the line' }), /^warning closure rejected \(no_falsification\)/, 409, 'EYE-STA-002');
    await refused(closeWarning(executive, B, { criterion: 'resolved', reason: 'the executive is not the owner' }), /^warning closure rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    await refused(closeWarning(dadmin, B, { criterion: 'forgotten', reason: 'not a criterion of this product' }), /payload\.criterion is one of/, 422, 'EYE-REQ-001');
    await refused(closeWarning(dadmin, uuidv7(), { criterion: 'resolved', reason: 'no such warning here at all' }), /^warning closure rejected: no such warning/, 404, 'EYE-STA-001');
    await refused(closeWarning(dadmin, B, { criterion: 'duplicate', duplicate_of: B, reason: 'the warning duplicates itself' }), /^warning closure rejected: a duplicate closure names the other warning/, 422, 'EYE-REQ-001');
    // A (expired) carries a falsification condition: the owner closes it as falsified, naming the condition that held
    await refused(closeWarning(regOwner, A, { criterion: 'falsified', condition: 3, reason: 'the transits recovered for three days' }), /^warning closure rejected: condition 3 is not one of the 1 declared/, 422, 'EYE-REQ-001');
    const closed = (await closeWarning(regOwner, A, { criterion: 'falsified', condition: 0, reason: 'the transits recovered above 40 for three consecutive days' })).warning;
    expect(closed).toMatchObject({ state: 'closed', closure: { criterion: 'falsified', condition_index: 0, from_state: 'expired', by: regOwner.principalId } });
    await refused(closeWarning(regOwner, A, { criterion: 'resolved', reason: 'a second closure of the same warning' }), /^warning closure rejected \(not_open\)/, 409, 'EYE-STA-002');
    await refused(setContext(regOwner, A, { expected_version: 2, contradicting: [], affected: {}, falsification: [] }), /^warning context rejected \(closed\)/, 409, 'EYE-STA-002');
    // B closed by the domain administrator as a duplicate of A
    expect((await closeWarning(dadmin, B, { criterion: 'duplicate', duplicate_of: A, reason: 'the same attack, reported against the world objective' })).warning).toMatchObject({ state: 'closed', closure: { criterion: 'duplicate', of_warning_id: A } });
    expect((await warningEvents(A)).at(-1)!.event).toBe('warning.closed');
    expect(Number((await verifyProjections()).projections.find((x) => x.projection === 'warnings_current')!.mismatched)).toBe(0);
    // the as-of read follows the state events (0088 §W9): A was closed, not "closed" by an earlier non-state event
    expect((await sql<{ s: string }>`select decision.warning_state_as_of(${A}::uuid, clock_timestamp()) s`.execute(su)).rows[0]!.s).toBe('closed');
    sixEvidence('L5', { fault_trace: { refused: ['no_falsification 409', 'not_owner 403', 'criterion 422', 'unknown 404', 'self-duplicate 422', 'condition out of range 422', 'not_open 409', 'closed context 409'] },
      watermark: { closed: [A, B] }, consumer_behaviour: { closure_A: closed['closure'] }, operator_action: 'the owner closed A as falsified; the domain administrator closed B as a duplicate',
      recovery: 'the falsified closure named a declared condition', reconciliation: { projection_mismatched: 0 } });
  }, 120_000);

  it('L6 · FEEDBACK + EVALUATION: J. Weber marks the expired warning late (a repeat answers repeated); the refusals; the evaluation by origin with T3 measured, the acknowledgement abstaining, and a full abstention below min_sample', async () => {
    const f = (await feedback(weber, A, { kind: 'late', note: 'the escalation came after the rerouting window had closed' })).feedback;
    expect(f).toMatchObject({ warning_id: A, kind: 'late', warning_state: 'closed', repeated: false });
    const again = (await feedback(weber, A, { kind: 'late', note: 'said twice' })).feedback;
    expect(again).toMatchObject({ feedback_id: f['feedback_id'], repeated: true });
    expect((await warningEvents(A)).filter((e) => e.event === 'warning.feedback')).toHaveLength(1);
    await feedback(regOwner, B, { kind: 'duplicated', note: 'the same attack as the Regensburg warning' });
    await feedback(regOwner, stormLead, { kind: 'useful' });
    await refused(feedback(auditor, A, { kind: 'useful' }), /./, 403, 'EYE-AUT-001');
    await refused(feedback(weber, A, { kind: 'meh' }), /payload\.kind is one of false, late, missed, duplicated, useful/, 422, 'EYE-REQ-001');
    await refused(feedback(weber, A, { kind: 'false' }), /^warning feedback rejected: false feedback carries a note of at least 8 characters/, 422, 'EYE-REQ-001');
    await refused(feedback(weber, uuidv7(), { kind: 'useful' }), /^warning feedback rejected: no such warning/, 404, 'EYE-STA-001');
    const lc = (await lifecycle(A)).lifecycle;
    expect((lc['feedback'] as Row[]).map((x) => [x['kind'], x['given_by']])).toEqual([['late', weber.principalId]]);
    /* THE EVALUATION (the executive) */
    await refused(evaluate(forecastOwner, { min_sample: 1 }), /./, 403, 'EYE-AUT-001');
    await refused(evaluate(executive, { min_sample: 0 }), /min_sample is a whole number in \[1, 10000\]/, 422, 'EYE-REQ-001');
    const e = (await evaluate(executive, { min_sample: 1 })).evaluation;
    const ws = obj(obj(e['by_origin'])['weak_signal']);
    expect(ws).toMatchObject({ with_feedback: 2, counts: { late: 1, duplicated: 1, false: 0, useful: 0 }, late_rate: { abstained: false, value: 0.5 } });
    expect(obj(obj(e['by_origin'])['stream_rule'])).toMatchObject({ with_feedback: 1, useful_rate: { abstained: false, value: 1 } });
    expect(obj(e['t3'])).toMatchObject({ abstained: false, sample: 1, value: 1 });
    expect(Number(obj(e['t3'])['unmeasured'])).toBeGreaterThanOrEqual(5);
    expect(obj(e['acknowledgement'])).toMatchObject({ abstained: true, sample: 0, expired_unanswered: 1 });
    expect(obj(e['clusters'])).toMatchObject({ contradicting_reports: 1, storm_members: 3 });
    expect(e['verdict']).toBe('partial');
    const none = (await evaluate(executive, { min_sample: 50 })).evaluation;
    expect(none['verdict']).toBe('abstained');
    expect(String(obj(obj(obj(none['by_origin'])['weak_signal'])['late_rate'])['reason'])).toMatch(/below min_sample 50/);
    const listed = (await evaluations(weber)).evaluations;
    expect(listed.map((x) => x['verdict'])).toEqual(['abstained', 'partial']);
    await refused(evaluations(collector), /./, 403, 'EYE-AUT-001');
    sixEvidence('L6', { fault_trace: { refused: ['auditor 403', 'kind 422', 'false without note 422', 'unknown 404', 'forecast owner evaluates 403', 'min_sample 0 422'] },
      watermark: { window: e['window'] }, consumer_behaviour: { weak_signal: ws, t3: e['t3'] }, operator_action: 'J. Weber marked the warning late; the executive evaluated twice',
      recovery: 'the repeated feedback answered the recorded one', reconciliation: { verdicts: listed.map((x) => x['verdict']) } });
  }, 120_000);

  it('L7 · THE CONSUMER: graph impact, forecast revision and twin degradation → one candidate each (origin_key = event + item); a replay submits nothing twice; the graph-impact candidate becomes a warning of that origin', async () => {
    const inv = uuidv7();
    const e1 = await plantOutbox('GraphChanged', graphChanged('invalidation.assessed', { objectives: [regObjective], twins: [] }, { change: { invalidation_id: inv } }));
    const e2 = await plantOutbox('GraphChanged', graphChanged('forecast.withdrawn', { forecasts: [w.forecastId], objectives: [regObjective] },
      { forecast: { forecast_id: w.forecastId, series_key: w.seriesKey, horizon: '30d', reason: 'the corridor feed was suspended (B28 harness)', unfit_class: 'data_shift', withdrawn_at: new Date().toISOString(), dependants: {} } }));
    const e3 = await plantOutbox('GraphChanged', graphChanged('twin.state_changed', { twins: [w.twinId] },
      { twin: { twin_id: w.twinId, version: 2, supersedes: 1, branch_id: 'main', change: 'version.admitted', changed_variables: 1, runs_of_superseded: 4 } }));
    const d = await Promise.all([e1, e2, e3].map((e) => waitFor(`the warnings delivery of ${e.id}`, () => deliveryOf(e.id, 'warnings'), (x) => x?.state === 'applied', 120_000)));
    expect(d.map((x) => x!.items)).toEqual([[`graph_impact:${regObjective}`], [`forecast_revision:${w.forecastId}`], [`twin_degradation:${w.twinId}`]]);
    const byKey = async (originKey: string) => (await sql<Candidate>`select candidate_id::text, state, warning_id::text, origin_kind, origin_key, cause_key, outcome from prediction.warning_candidates where origin_key = ${originKey}`.execute(su)).rows;
    const g = await byKey(`${e1.id}:graph_impact:${regObjective}`);
    const fr = await byKey(`${e2.id}:forecast_revision:${w.forecastId}`);
    const tw = await byKey(`${e3.id}:twin_degradation:${w.twinId}`);
    expect([g.length, fr.length, tw.length]).toEqual([1, 1, 1]);
    expect([g[0]!.origin_kind, fr[0]!.origin_kind, tw[0]!.origin_kind]).toEqual(['graph_impact', 'forecast_revision', 'twin_degradation']);
    expect([g[0]!.cause_key, fr[0]!.cause_key, tw[0]!.cause_key]).toEqual([`graph:${inv}`, `forecast:${w.forecastId}`, `twin:${w.twinId}`]);
    /* THE REPLAY: the deliveries re-applied; the intake answers repeated — nothing submitted twice. */
    await graph.replaySubscription(h.req(dadmin, 'graph.subscription.replay', 'SUB', subs['warnings']!, 'platform.administration'), T(), D(), subs['warnings']!, { payload: { fromSeq: e1.seq - 1, reason: 'B28 L7: re-drive the three origins (harness)' } });
    await waitFor('the replayed deliveries applied', () => Promise.all([e1, e2, e3].map((e) => deliveryOf(e.id, 'warnings'))), (xs) => xs.every((x) => x?.state === 'applied' && x.replay_seq >= 1), 120_000);
    for (const k of [`${e1.id}:graph_impact:${regObjective}`, `${e2.id}:forecast_revision:${w.forecastId}`, `${e3.id}:twin_degradation:${w.twinId}`]) expect(await byKey(k)).toHaveLength(1);
    /* the graph-impact candidate processed: a warning of origin graph_impact routed to the objective's owner */
    const p = await processNow();
    const gw = p.processing.raised.find((x) => x['candidate_id'] === g[0]!.candidate_id)!;
    expect(gw['decision']).toBe('raised');
    expect(await warningRow(String(gw['warning_id']))).toMatchObject({ origin_kind: 'graph_impact', routed_to: regOwner.principalId, state: 'raised' });
    expect(obj((await warningRow(String(gw['warning_id']))).origin_ref)).toMatchObject({ event_id: e1.id, change_kind: 'invalidation.assessed', confidence_basis: expect.stringMatching(/stated no confidence/) });
    sixEvidence('L7', { fault_trace: { planted: [e1.id, e2.id, e3.id] }, watermark: { seqs: [e1.seq, e2.seq, e3.seq] },
      consumer_behaviour: { items: d.map((x) => x!.items), candidates: [g[0]!.candidate_id, fr[0]!.candidate_id, tw[0]!.candidate_id] }, operator_action: 'the domain administrator replayed the subscription',
      recovery: 'the replay re-applied; the intake answered repeated', reconciliation: { one_candidate_per_origin_key: true, graph_impact_warning: gw['warning_id'] } });
  }, 240_000);
});
