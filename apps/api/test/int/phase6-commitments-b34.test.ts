/**
 * CP-6 B34 part C (migration 0090 §C; F-P6-05) — THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF, on a real database, the real
 * pipeline, the real subscription dispatch (BullMQ on the rehearsal Redis) and a SYNTHETIC ERP (scripts/execution/synthetic-erp.mjs, spawned:
 * a real TLS server on a loopback port with a self-signed certificate for `erp.b34.invalid`, requiring the bearer bound as EYE_DST_B34C).
 *
 * THE ONE SUBSTITUTION, STATED (the B14 harness's): the product's execution egress (http-client.ts `deliver`) resolves the target's host
 * and REFUSES every loopback address before it connects; this file replaces the ExecutionEgress provider's transport with the client's
 * own `deliverPinned(req, '127.0.0.1')` — the SAME function `deliver` calls once the address is settled (the TLS handshake against the
 * declared anchor, the POST, the headers, the credential on the one hop, the redirect refused). S1 restores the production egress and
 * proves the vetting refuses the loopback target (nothing reaches the ERP). The SYNTHETIC ERP closes no real-ERP clause.
 *
 * Stated superuser moves (the DB clock): a handoff's next attempt and an item's due instant are moved into the past to run the tick's
 * steps now, never the ports' own records otherwise.
 *
 *   C1 · THE SEED AND THE TRACKER — the objective re-owned to the reviewer; a commit seeds the ROOT (owner the action owner, reviewer the
 *        objective's owner, basis objective_owner), the accept task, commitment.item_opened, CommitmentChanged item.opened; children declared
 *        (a resource mirrored CMT → RSC); refusals 403/404/409/422; the tracker read
 *   E1 · THE GATEWAY — a non-synthetic target refused (422), the PDP (403), a duplicate (409); the synthetic target with its anchor
 *   E2 · THE DEMO SCENE (FEX-18) — the dual-sourcing handoff issued (C3, execution_authority; the drafter, the committer and a stale digest
 *        refused), the ERP in `partial` → HALF effected: the residual per line, a partial_effect exception, execution.partial_effect; reconcile,
 *        closure and the package's close refused while the residual is undisposed; the residual assigned to a named compensation owner
 *        (reissue_residual), the compensating handoff effected, both reconciled
 *   E3 · RETRIES AND A STALE RECEIPT — `error` (500) → retried by the tick's execution-deliveries step; `stale` → unbound (evidence, never an
 *        effect); `normal` → effected at attempt 3; the ERP idempotent on the handoff id
 *   E4 · DENY AND REJECT-LINE — 403 → failed denied (a blocked exception); reject-line → partially effected; accept_residual PROPOSED, the
 *        proposer's co-sign refused, the reviewer's co-sign accepted; reconciled
 *   D1 · THE DEADLINE SWEEP — due_soon once; overdue once + deadline_missed; the after-tick CommitmentChanged; extension proposed by the owner,
 *        co-signed by the reviewer (self co-sign refused)
 *   O1 · THE OBJECTIVE CHANGE (V02-T-117) — the objective's owner transferred and the objective revised: GraphChanged/objective.changed through
 *        the REAL subscription dispatch → items retask_required, the reviewer reassigned (basis objective_owner), CommitmentChanged
 *        item.retasked / reviewer.reassigned; re-accepted
 *   Z1 · CLOSURE (OBJ-37) — proposed by the owner with deliverables, the proposer's co-sign refused, co-signed by the reviewer: CMT version 2
 *        closed; the timeline's five lanes; the package's close passes the commitment check
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { CommitmentController } from '../../src/decision/commitments/commitment.controller.js';
import { ExecutionEgress } from '../../src/decision/commitments/commitment.service.js';
import { deliver, deliverPinned, type DeliveryRequest } from '../../src/observation/connectors/http-client.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b34c-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
// The target's bearer: built at run time (never a literal that looks like a secret), bound by reference before the boot.
const DST_REF = 'EYE_DST_B34C';
const DST_TOKEN = `b34-${createHash('sha256').update(String(process.pid) + String(Date.now())).digest('hex').slice(0, 24)}`;
process.env[DST_REF] = DST_TOKEN;
const ERP = resolvePath(__dirname, '../../../../scripts/execution/synthetic-erp.mjs');
const ERP_HOST = 'erp.b34.invalid';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let exec: ExecutiveController; let cm: CommitmentController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let timer: AttentionTimerService; let egress: ExecutionEgress;
let dadmin: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let reviewer2: AuthenticatedPrincipal; let issuer: AuthenticatedPrincipal; let buyer: AuthenticatedPrincipal;
let dual: AuthenticatedPrincipal; let authIssuer: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
let erp: ChildProcess | null = null; let erpPort = 0; let erpCert = ''; let agentId = '';
/** What the cases leave one another. */
let P = { pkg: '', v: 0, digest: '', approvalId: '', commitmentId: '' }; let ROOT = ''; let HAND = ''; let MILE = ''; let RSC = ''; let H1 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B34C EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen()).slice(0, 400)}`);
    await sleep(300);
  }
}
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<string> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r.message;
};

/* ───────────── the routes ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'decision');
const tracker = (as: AuthenticatedPrincipal) => cm.tracker(R(as, 'decision.commitment.read', 'CMI', null), T(), D(), { payload: {} }) as Promise<{ tracker: { items: Row[]; summary: Row } }>;
const getC = (as: AuthenticatedPrincipal, id: string) => cm.get(R(as, 'decision.commitment.read', 'CMT', id), T(), D(), id, { payload: {} }) as Promise<{ commitment: Row & { items: Row[]; handoffs: Row[]; timeline: Row[]; exceptions: Row[]; blockers: string | null } }>;
const declareItem = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.declareItem(R(as, 'decision.commitment.item.declare', 'CMT', id), T(), D(), id, { payload }) as Promise<{ item: Row }>;
const accept = (as: AuthenticatedPrincipal, id: string) => cm.accept(R(as, 'decision.commitment.item.accept', 'CMI', id), T(), D(), id, { payload: { note: 'accepted (harness)' } }) as Promise<{ item: Row }>;
const complete = (as: AuthenticatedPrincipal, id: string, evidence: string) => cm.complete(R(as, 'decision.commitment.item.complete', 'CMI', id), T(), D(), id, { payload: { evidence } }) as Promise<{ item: Row }>;
const decide = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.decide(R(as, 'decision.commitment.exception.decide', 'CMX', id), T(), D(), id, { payload }) as Promise<{ exception: Row }>;
const declareTarget = (as: AuthenticatedPrincipal, payload: Row) => cm.declareTarget(R(as, 'decision.execution.target.declare', 'EXT', null), T(), D(), { payload }) as Promise<{ target: Row }>;
const draft = (as: AuthenticatedPrincipal, itemId: string, payload: Row) => cm.draft(R(as, 'decision.execution.draft', 'EXH', null), T(), D(), itemId, { payload }) as Promise<{ handoff: Row }>;
const issue = (as: AuthenticatedPrincipal, id: string, payloadDigest: string) => cm.issue(R(as, 'decision.execution.issue', 'EXH', id), T(), D(), id, { payload: { payloadDigest } }) as Promise<{ handoff: Row & { attempt: Row } }>;
const compensate = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.compensate(R(as, 'decision.execution.compensation.assign', 'EXH', id), T(), D(), id, { payload }) as Promise<{ compensation: Row }>;
const cosignComp = (as: AuthenticatedPrincipal, id: string) => cm.cosignCompensation(R(as, 'decision.execution.compensation.cosign', 'EXC', id), T(), D(), id, { payload: { note: 'the residual is accepted (harness)' } }) as Promise<{ compensation: Row }>;
const reconcile = (as: AuthenticatedPrincipal, id: string) => cm.reconcile(R(as, 'decision.execution.reconcile', 'EXH', id), T(), D(), id) as Promise<{ handoff: Row }>;
const propose = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.proposeClosure(R(as, 'decision.commitment.closure.propose', 'CMT', id), T(), D(), id, { payload }) as Promise<{ closure: Row }>;
const cosignClosure = (as: AuthenticatedPrincipal, closureId: string, commitmentId: string) => cm.cosignClosure(R(as, 'decision.commitment.close', 'CMT', commitmentId), T(), D(), closureId, { payload: { commitmentId } }) as Promise<{ closure: Row }>;
const assignOwner = (objectId: string, ownerPrincipalId: string) => graph.assignStrategyOwner(h.req(dadmin, 'graph.strategy.owner.assign', 'OBJ', objectId, 'graph'), T(), D(), objectId, { payload: { ownerPrincipalId, reason: 'the objective changes hands (B34 harness)' } });
const revise = (as: AuthenticatedPrincipal, objectId: string, payload: Row) => graph.reviseObjective(h.req(as, 'graph.objective.revise', 'OBJ', objectId, 'graph'), T(), D(), objectId, { payload }) as Promise<{ objective: Row }>;

/* ───────────── the rows ───────────── */
const itemRow = async (id: string) => (await sql<Row>`select * from decision.commitment_items where item_id = ${id}::uuid`.execute(su)).rows[0]!;
const handoffRow = async (id: string) => (await sql<Row>`select * from decision.execution_handoffs where handoff_id = ${id}::uuid`.execute(su)).rows[0]!;
const effects = async (id: string) => (await sql<Row>`select line_key, requested_quantity::float8 req, effected_quantity::float8 eff, status from decision.execution_effects where handoff_id = ${id}::uuid order by line_key`.execute(su)).rows;
const attempts = async (id: string) => (await sql<Row>`select attempt, outcome, http_status, by_tick from decision.execution_attempts where handoff_id = ${id}::uuid order by attempt`.execute(su)).rows;
const exceptionsOf = async (itemId: string) => (await sql<Row>`select exception_id::text, kind, state, source_ref from decision.commitment_exceptions where item_id = ${itemId}::uuid order by raised_at`.execute(su)).rows;
const tasksOf = async (itemId: string) => (await sql<Row>`select kind, state, assignee_principal_id::text assignee from executive.human_tasks where subject @> ${JSON.stringify({ kind: 'commitment_item', id: itemId })}::jsonb order by opened_at`.execute(su)).rows;
const changed = async (kind: string, itemId: string) => (await sql<Row>`select payload from objects.object_outbox where event_type = 'CommitmentChanged' and payload -> 'change' ->> 'kind' = ${kind} and payload ->> 'item_id' = ${itemId}`.execute(su)).rows;
const pkgEvents = async (pkg: string, event: string) => (await sql<Row>`select details from decision.package_events where package_id = ${pkg}::uuid and event = ${event}`.execute(su)).rows;

/* ───────────── the ERP's side ───────────── */
const erpCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Row }> => new Promise((res, rej) => {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const req = httpsRequest({ host: '127.0.0.1', port: erpPort, servername: ERP_HOST, path, method, ca: erpCert, rejectUnauthorized: true,
    headers: { authorization: `Bearer ${DST_TOKEN}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
    const chunks: Buffer[] = [];
    r.on('data', (x: Buffer) => chunks.push(x));
    r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row }); } catch (e) { rej(e); } });
  });
  req.on('error', rej);
  if (payload !== null) req.write(payload);
  req.end();
});
const setMode = async (mode: string) => { expect((await erpCall('POST', '/_control', { mode })).status).toBe(200); };
/** The commitments delivery of the newest objective.changed since `after` applied. */
const objectiveChangeApplied = async (after: Date): Promise<Row> => {
  const ev = await waitFor('the objective.changed row', async () => (await sql<Row>`select id::text from objects.object_outbox where event_type = 'GraphChanged' and payload -> 'change' ->> 'kind' = 'objective.changed' and created_at >= ${after} order by created_at desc limit 1`.execute(su)).rows, (r) => r.length === 1);
  return waitFor('its commitments delivery applied', async () => (await sql<Row>`select state, items from graph.subscription_deliveries where event_id = ${String(ev[0]!['id'])}::uuid and consumer_kind = 'commitments'`.execute(su)).rows[0] ?? {}, (d) => d['state'] === 'applied', 120_000);
};
const harnessEgress = (req: DeliveryRequest) => deliverPinned(req, '127.0.0.1');
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2034, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const LINES = [
  { line_key: 'NDFEB-N52', description: 'NdFeB N52 magnet blocks from the second source (SYNTHETIC)', quantity: 1000, unit: 'kg' },
  { line_key: 'QUAL-LOT', description: 'Qualification lots for the second source (SYNTHETIC)', quantity: 4, unit: 'lot' },
];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { CommitmentController: Cc } = await import('../../src/decision/commitments/commitment.controller.js');
  graph = h.app.get(Gc); exec = h.app.get(Ec); cm = h.app.get(Cc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); timer = h.app.get(AttentionTimerService); egress = h.app.get(ExecutionEgress);
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  dadmin = await h.humanWithSession(['domain_admin', 'strategy_owner'], 'b34c-dadmin');
  reviewer = await h.humanWithSession(['strategy_owner'], 'b34c-reviewer');
  reviewer2 = await h.humanWithSession(['strategy_owner'], 'b34c-reviewer-2');
  issuer = await h.humanWithSession(['execution_authority'], 'b34c-issuer');
  buyer = await h.humanWithSession(['decision_owner'], 'b34c-buyer');
  dual = await h.humanWithSession(['decision_owner', 'execution_authority'], 'b34c-dual');
  authIssuer = await h.humanWithSession(['decision_authority', 'execution_authority'], 'b34c-auth-issuer');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b34c-tenant-admin', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b34c-executive');
  // The synthetic ERP: a real TLS server on a loopback port, its self-signed certificate the target's anchor.
  erp = spawn(process.execPath, [ERP, '--self-signed', ERP_HOST, '--listen', '127.0.0.1:0', '--bearer-env', DST_REF, '--name', 'NORDWERK purchasing (SYNTHETIC)'], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`the ERP did not start: ${out.join('')}`)), 20_000);
    erp!.stdout!.on('data', (x: Buffer) => {
      out.push(x.toString('utf8'));
      const all = out.join(''); const cert = /^certificate (.+)$/m.exec(all); const l = /^listening (https:\/\/[^\s]+)$/m.exec(all);
      if (cert !== null && l !== null) { erpCert = readFileSync(cert[1]!, 'utf8'); erpPort = Number(new URL(l[1]!).port); clearTimeout(t); res(); }
    });
    erp!.stderr!.on('data', (x: Buffer) => out.push(x.toString('utf8')));
    erp!.on('exit', (code) => { clearTimeout(t); rej(new Error(`the ERP exited ${code}: ${out.join('')}`)); });
  });
  egress.deliver = harnessEgress;
  // the commitments consumer, registered like every consumer (its subscriber holds commitment_subscriber alone)
  await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
    { payload: { consumerKind: 'commitments', ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never });
  // the attention agent: the tick's host; its first scheduled tick waited for, then the timer unscheduled (the ticks below are the hook's)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
}, 300_000);

afterAll(async () => {
  delete process.env[DST_REF];
  if (erp !== null) erp.kill('SIGTERM');
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B34 part C · the commitment tracker and the governed execution handoff (0090 §C; F-P6-05)', () => {
  it('C1 · THE SEED AND THE TRACKER: the root seeded by the commit (owner, reviewer by the objective\'s owner, the accept task, item.opened); children declared with a resource mirrored; refusals 403/404/409/422; the tracker', async () => {
    const t0 = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    await assignOwner(w.objectiveId, reviewer.principalId);
    await objectiveChangeApplied(t0); // the transfer's own event delivered BEFORE the commit (nothing rests on the objective yet)
    P = await c.committed();
    const root = (await sql<Row>`select * from decision.commitment_items where commitment_id = ${P.commitmentId}::uuid and parent_item_id is null`.execute(su)).rows[0]!;
    ROOT = String(root['item_id']);
    expect(root).toMatchObject({ kind: 'obligation', state: 'open', owner_principal_id: w.owner.principalId, reviewer_principal_id: reviewer.principalId, reviewer_basis: 'objective_owner' });
    expect(await tasksOf(ROOT)).toEqual([{ kind: 'commitment.accept', state: 'open', assignee: w.owner.principalId }]);
    expect(await pkgEvents(P.pkg, 'commitment.item_opened')).toHaveLength(1);
    const opened = await changed('item.opened', ROOT);
    expect(opened).toHaveLength(1);
    expect(opened[0]!['payload']).toMatchObject({ schema: 'CommitmentChanged', schema_version: 1, commitment_id: P.commitmentId, package_id: P.pkg, owner: w.owner.principalId, reviewer: reviewer.principalId,
      cause: { action: 'decision.commit' } });
    // a resource the handoff consumes (RSC), declared by the strategy owner
    RSC = ((await graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'RSC', null, 'graph'), T(), D(), { payload: { objectType: 'RSC', title: 'Second-source magnet budget', statement: 'The budget for the second NdFeB source (B34 harness)', status: 'active',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the resource serves the objective (B34 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
    // refusals: an approver holds no tracker write (PDP 403); the reviewer is not the commitment's owner (port 403); unknown (404); a due past the root's (422)
    await refused(declareItem(w.approver, P.commitmentId, { kind: 'handoff', title: 'x', owner: w.owner.principalId, dueAt: inDays(5) }), /./, 403);
    await refused(declareItem(reviewer, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request', owner: w.owner.principalId, dueAt: inDays(5) }), /commitment item rejected \(not_owner\)/, 403);
    await refused(declareItem(w.owner, '0190aaaa-0000-7000-8000-000000000001', { kind: 'handoff', title: 'Dual-source purchase request', owner: w.owner.principalId, dueAt: inDays(5) }), /commitment item rejected \(unknown_commitment\)/, 404);
    await refused(declareItem(w.owner, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request', owner: w.owner.principalId, dueAt: inDays(90) }), /commitment item rejected \(due_at\)/, 422);
    await refused(declareItem(w.owner, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request', owner: w.owner.principalId, dueAt: inDays(5), resourceIds: [w.objectiveId] }), /commitment item rejected \(resource\)/, 422);
    HAND = String((await declareItem(w.owner, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request to the ERP', owner: w.owner.principalId, dueAt: inDays(10), resourceIds: [RSC] })).item['item_id']);
    MILE = String((await declareItem(w.owner, P.commitmentId, { kind: 'milestone', title: 'Second source qualified', owner: buyer.principalId, dueAt: inDays(20) })).item['item_id']);
    expect(await itemRow(HAND)).toMatchObject({ reviewer_principal_id: reviewer.principalId, reviewer_basis: 'objective_owner', state: 'open' });
    expect((await sql<{ n: number }>`select count(*)::int n from graph.dependencies where dependent_object_id = ${P.commitmentId}::uuid and depends_on_id = ${RSC}::uuid`.execute(su)).rows[0]!.n).toBe(1);
    // accept: the owner, once; a non-owner refused
    await refused(accept(reviewer, HAND), /commitment item rejected \(not_owner\)/, 403);
    for (const id of [ROOT, HAND]) expect((await accept(w.owner, id)).item['state']).toBe('in_progress');
    expect((await accept(buyer, MILE)).item['state']).toBe('in_progress');
    await refused(accept(w.owner, HAND), /commitment item rejected \(state\)/, 409);
    expect((await tasksOf(ROOT)).map((t) => `${String(t['kind'])}:${String(t['state'])}`)).toEqual(['commitment.accept:completed', 'commitment.checkpoint:open']);
    // the tracker: every item of the package, their transparent severity
    await refused(tracker(w.operator), /./, 403);
    const t = await tracker(executive);
    const mine = t.tracker.items.filter((i) => i['commitment_id'] === P.commitmentId);
    expect(mine.map((i) => i['kind']).sort()).toEqual(['handoff', 'milestone', 'obligation']);
    expect(mine.every((i) => i['severity'] === 'C2' && (i['reasons'] as string[]).length === 0)).toBe(true);
    sixEvidence('C1', { fault_trace: { refused: ['PDP 403 approver', '403 not_owner', '404 unknown_commitment', '422 due_at', '404 resource', '409 state'] }, watermark: { root: ROOT }, consumer_behaviour: 'the seed is the trigger; the route announces item.opened',
      operator_action: 'declare, accept', recovery: 'none needed', reconciliation: { items: mine.length } });
  }, 240_000);

  it('E1 · THE GATEWAY: a non-synthetic target refused (the owner decision), the PDP (403), a duplicate (409); the synthetic target with its trust anchor', async () => {
    const endpoint = `https://${ERP_HOST}:${erpPort}/purchase-requests`;
    await refused(declareTarget(dadmin, { targetKey: 'real-erp', label: 'A real ERP', endpoint, synthetic: false }), /execution target rejected \(not_synthetic\)/, 422);
    await refused(declareTarget(w.owner, { targetKey: 'nordwerk-erp', label: 'x', endpoint, synthetic: true }), /./, 403);
    await refused(declareTarget(dadmin, { targetKey: 'bad-anchor', label: 'x', endpoint, synthetic: true, trustAnchorPem: 'not a pem' }), /execution target rejected \(trust_anchor\)/, 422);
    const t = await declareTarget(dadmin, { targetKey: 'nordwerk-erp', label: 'NORDWERK purchasing (SYNTHETIC)', endpoint, credentialRef: DST_REF, trustAnchorPem: erpCert, synthetic: true });
    expect(t.target).toMatchObject({ target_key: 'nordwerk-erp', synthetic: true, state: 'active', trust_anchor_declared: true, credential_ref: DST_REF });
    expect(JSON.stringify(t)).not.toContain(DST_TOKEN);
    await refused(declareTarget(dadmin, { targetKey: 'nordwerk-erp', label: 'again', endpoint, synthetic: true }), /execution target rejected \(duplicate\)/, 409);
    sixEvidence('E1', { fault_trace: { refused: ['422 not_synthetic', 'PDP 403', '422 trust_anchor', '409 duplicate'] }, watermark: t.target['target_id'], consumer_behaviour: 'n/a', operator_action: 'declare', recovery: 'n/a', reconciliation: 'one target' });
  }, 60_000);

  it('E2 · THE DEMO SCENE (FEX-18): the dual-sourcing handoff issued to the synthetic ERP in `partial` → half effected, the residual with a compensation owner; the refusals while undisposed; reissued; reconciled', async () => {
    await setMode('partial');
    const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp', lines: LINES })).handoff;
    H1 = String(d['handoff_id']);
    expect(d).toMatchObject({ state: 'drafted', role: 'primary', payload_digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    // the issue: the drafter lacks the role (PDP 403); the committer's own issue refused by the port; a stale digest (409)
    await refused(issue(w.owner, H1, String(d['payload_digest'])), /./, 403);
    await refused(issue(issuer, H1, 'f'.repeat(64)), /execution issue rejected \(stale_digest\)/, 409);
    const r = await issue(issuer, H1, String(d['payload_digest']));
    expect(r.handoff).toMatchObject({ state: 'issuing', attempt: { attempt: 1, outcome: 'partial', state: 'partially_effected' } });
    expect(await effects(H1)).toEqual([{ line_key: 'NDFEB-N52', req: 1000, eff: 500, status: 'partial' }, { line_key: 'QUAL-LOT', req: 4, eff: 2, status: 'partial' }]);
    expect(await handoffRow(H1)).toMatchObject({ state: 'partially_effected', attempts: 1, issued_by: issuer.principalId });
    expect((await exceptionsOf(HAND)).map((e) => `${String(e['kind'])}:${String(e['state'])}`)).toEqual(['partial_effect:open']);
    expect((await itemRow(HAND))['state']).toBe('exception');
    expect(await pkgEvents(P.pkg, 'execution.partial_effect')).toHaveLength(1);
    expect(await changed('handoff.issued', HAND)).toHaveLength(1);
    expect(await changed('handoff.partial', HAND)).toHaveLength(1);
    const tr = (await tracker(executive)).tracker.items.find((i) => i['item_id'] === HAND)!;
    expect(tr).toMatchObject({ severity: 'C3' });
    expect(tr['reasons']).toEqual(expect.arrayContaining(['undisposed_residual', 'open_exception']));
    // the residual undisposed: reconcile, closure and the package's close refused
    await refused(reconcile(w.owner, H1), /execution reconcile rejected \(residual_undisposed\)/, 409);
    await refused(propose(w.owner, P.commitmentId, { deliverables: [{ title: 'Early', evidence: 'nothing yet (harness)' }], statement: 'closing too early (harness)' }), /commitment closure rejected \(not_ready\)/, 409);
    await refused(c.close(P.pkg, 'closing while the residual is undisposed (harness)'), /closure rejected \(commitment_open\)/, 409);
    // the residual to a NAMED compensation owner: reissue_residual (the assigner is the item's owner; a stranger refused)
    await refused(compensate(buyer, H1, { kind: 'reissue_residual', owner: buyer.principalId, dueAt: inDays(3), note: 'reissue the residual (harness)' }), /execution compensation rejected \(not_party\)/, 403);
    const comp = (await compensate(w.owner, H1, { kind: 'reissue_residual', owner: buyer.principalId, dueAt: inDays(3), note: 'reissue the residual half to the second source (harness)' })).compensation;
    expect(comp).toMatchObject({ state: 'assigned', owner_principal_id: buyer.principalId, residual: [{ line_key: 'NDFEB-N52', residual: 500 }, { line_key: 'QUAL-LOT', residual: 2 }] });
    expect(await changed('compensation.assigned', HAND)).toHaveLength(1);
    expect((await tasksOf(HAND)).some((t) => t['kind'] === 'commitment.compensation' && t['assignee'] === buyer.principalId && t['state'] === 'open')).toBe(true);
    const trc = (await tracker(executive)).tracker.items.find((i) => i['item_id'] === HAND)!;
    expect((trc['residual'] as Row[])[0]!['compensation']).toMatchObject({ kind: 'reissue_residual', owner: buyer.principalId, state: 'assigned' });
    // the compensating handoff: drafted by the compensation's owner, issued, effected in full → the compensation done
    await setMode('normal');
    await refused(draft(w.owner, HAND, { targetKey: 'nordwerk-erp', compensationId: comp['compensation_id'], lines: [{ ...LINES[0], quantity: 500 }] }), /execution handoff rejected \(not_compensation_owner\)/, 403);
    const d2 = (await draft(buyer, HAND, { targetKey: 'nordwerk-erp', compensationId: comp['compensation_id'], lines: [{ ...LINES[0], quantity: 500 }, { ...LINES[1], quantity: 2 }] })).handoff;
    expect((await issue(issuer, String(d2['handoff_id']), String(d2['payload_digest']))).handoff.attempt).toMatchObject({ outcome: 'effected', state: 'effected' });
    expect((await sql<Row>`select state from decision.execution_compensations where compensation_id = ${String(comp['compensation_id'])}::uuid`.execute(su)).rows[0]!['state']).toBe('done');
    // both reconciled: the exception resolved, the item back in progress
    expect((await reconcile(w.owner, H1)).handoff).toMatchObject({ state: 'reconciled', from: 'partially_effected' });
    expect((await reconcile(w.owner, String(d2['handoff_id']))).handoff).toMatchObject({ state: 'reconciled', from: 'effected' });
    expect((await exceptionsOf(HAND)).map((e) => e['state'])).toEqual(['resolved']);
    expect((await itemRow(HAND))['state']).toBe('in_progress');
    sixEvidence('E2', { fault_trace: { partial: await effects(H1), refused: ['PDP 403 drafter', '409 stale_digest', '409 residual_undisposed', '409 not_ready', '409 commitment_open', '403 not_party', '403 not_compensation_owner'] },
      watermark: { handoff: H1, attempts: await attempts(H1) }, consumer_behaviour: 'the receipt echoes handoff, attempt and digest', operator_action: 'compensation reissue_residual by the buyer',
      recovery: 'the compensating handoff effected', reconciliation: 'both handoffs reconciled' });
  }, 240_000);

  it('E3 · RETRIES AND A STALE RECEIPT: 500 → retried by the tick\'s execution-deliveries step; a stale receipt is unbound (never an effect); effected at attempt 3; the ERP idempotent on the handoff id', async () => {
    await setMode('error');
    const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp', lines: [LINES[1]] })).handoff;
    const id = String(d['handoff_id']);
    expect((await issue(issuer, id, String(d['payload_digest']))).handoff.attempt).toMatchObject({ outcome: 'transport', state: 'issuing' });
    const next = (await handoffRow(id))['next_attempt_at'] as Date;
    expect(next.getTime()).toBeGreaterThan(Date.now());
    // not due yet: a tick attempts nothing
    await tick(1);
    expect((await attempts(id))).toHaveLength(1);
    await setMode('stale');
    await sql`update decision.execution_handoffs set next_attempt_at = clock_timestamp() - interval '1 second' where handoff_id = ${id}::uuid`.execute(su); // stated: the DB clock
    await tick(2);
    expect(await attempts(id)).toEqual([{ attempt: 1, outcome: 'transport', http_status: 500, by_tick: false }, { attempt: 2, outcome: 'unbound', http_status: 200, by_tick: true }]);
    expect(await effects(id)).toEqual([]);
    await setMode('normal');
    await sql`update decision.execution_handoffs set next_attempt_at = clock_timestamp() - interval '1 second' where handoff_id = ${id}::uuid`.execute(su);
    await tick(3);
    expect((await attempts(id)).map((a) => a['outcome'])).toEqual(['transport', 'unbound', 'effected']);
    expect(await handoffRow(id)).toMatchObject({ state: 'effected', attempts: 3 });
    // the ERP remembers the handoff: a replayed POST answers the same effects (idempotent on the handoff id)
    const seen = (await erpCall('GET', '/_received')).body;
    expect(Object.keys(seen['effected'] as Row)).toContain(id);
    expect((await reconcile(w.owner, id)).handoff).toMatchObject({ state: 'reconciled' });
    sixEvidence('E3', { fault_trace: await attempts(id), watermark: { next_attempt_at: next }, consumer_behaviour: 'the tick drains the due retries (order 50)', operator_action: 'none: the tick', recovery: 'effected at attempt 3', reconciliation: 'reconciled' });
  }, 240_000);

  it('E4 · DENY AND REJECT-LINE: 403 → failed denied with a blocked exception; reject-line → partially effected; accept_residual proposed, the proposer\'s co-sign refused, the reviewer\'s accepted; reconciled', async () => {
    await setMode('deny');
    const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp', lines: LINES })).handoff;
    const denied = String(d['handoff_id']);
    expect((await issue(issuer, denied, String(d['payload_digest']))).handoff.attempt).toMatchObject({ outcome: 'denied', state: 'failed', failure_class: 'denied' });
    expect((await exceptionsOf(HAND)).filter((e) => e['state'] === 'open').map((e) => e['kind'])).toEqual(['blocked']);
    await setMode('reject-line');
    const d2 = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp', lines: LINES })).handoff;
    const rej = String(d2['handoff_id']);
    expect((await issue(issuer, rej, String(d2['payload_digest']))).handoff.attempt).toMatchObject({ outcome: 'partial', state: 'partially_effected' });
    expect(await effects(rej)).toEqual([{ line_key: 'NDFEB-N52', req: 1000, eff: 0, status: 'rejected' }, { line_key: 'QUAL-LOT', req: 4, eff: 4, status: 'effected' }]);
    for (const hid of [denied, rej]) {
      const comp = (await compensate(w.owner, hid, { kind: 'accept_residual', owner: w.owner.principalId, dueAt: inDays(2), note: 'the residual is sourced outside this commitment (harness)' })).compensation;
      expect(comp['state']).toBe('proposed');
      await refused(cosignComp(w.owner, String(comp['compensation_id'])), /execution compensation rejected \(not_reviewer\)/, 403);
      expect((await cosignComp(reviewer, String(comp['compensation_id']))).compensation).toMatchObject({ state: 'accepted', cosigned_by: reviewer.principalId });
      expect((await reconcile(w.owner, hid)).handoff).toMatchObject({ state: 'reconciled' });
    }
    expect((await exceptionsOf(HAND)).every((e) => e['state'] === 'resolved')).toBe(true);
    sixEvidence('E4', { fault_trace: { denied: await attempts(denied), reject_line: await effects(rej) }, watermark: null, consumer_behaviour: 'n/a', operator_action: 'accept_residual co-signed by the reviewer', recovery: 'reconciled', reconciliation: 'exceptions resolved' });
  }, 240_000);

  it('D1 · THE DEADLINE SWEEP (tick step 45): due_soon once; overdue once with deadline_missed and the after-tick CommitmentChanged; an extension proposed by the owner and co-signed by the reviewer', async () => {
    const soon = String((await declareItem(w.owner, P.commitmentId, { kind: 'deliverable', title: 'Dual-source contract signed', owner: w.owner.principalId, dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString() })).item['item_id']);
    await accept(w.owner, soon);
    const t1 = await tick(4);
    const step = ((t1.run as unknown as { outputs: Row }).outputs['steps'] as Row | undefined)?.['commitment-deadlines'] as Row | undefined;
    expect(step === undefined || Number(step['count']) >= 1).toBe(true);
    await tick(5);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.commitment_events where item_id = ${soon}::uuid and event = 'item.due_soon'`.execute(su)).rows[0]!.n, 'recorded once').toBe(1);
    await sql`update decision.commitment_items set due_at = clock_timestamp() - interval '1 hour' where item_id = ${soon}::uuid`.execute(su); // stated: the DB clock
    await tick(6);
    await tick(7);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.commitment_events where item_id = ${soon}::uuid and event = 'item.overdue'`.execute(su)).rows[0]!.n, 'recorded once').toBe(1);
    const ex = (await exceptionsOf(soon)).find((e) => e['kind'] === 'deadline_missed')!;
    expect(ex['state']).toBe('open');
    await waitFor('the after-tick CommitmentChanged item.overdue', () => changed('item.overdue', soon), (rows) => rows.length === 1, 30_000);
    expect((await changed('item.overdue', soon))[0]!['payload']).toMatchObject({ severity: 'C3', cause: { action: 'executive.attention.tick' } });
    // the extension: resolve refused for a deadline; the owner proposes; the owner's own co-sign refused; the reviewer co-signs
    await refused(decide(w.owner, String(ex['exception_id']), { act: 'resolve', note: 'resolving a deadline by hand (harness)' }), /commitment exception rejected \(kind\)/, 422);
    await decide(w.owner, String(ex['exception_id']), { act: 'propose_extension', newDueAt: inDays(7), note: 'the signature slips a week (harness)' });
    await refused(decide(w.owner, String(ex['exception_id']), { act: 'cosign', note: 'self co-sign (harness)' }), /commitment exception rejected \(not_reviewer\)/, 403);
    expect((await decide(reviewer, String(ex['exception_id']), { act: 'cosign', note: 'the week is accepted (harness)' })).exception).toMatchObject({ state: 'extended', cosigned_by: reviewer.principalId });
    expect(await itemRow(soon)).toMatchObject({ state: 'in_progress', overdue_recorded_for: null });
    expect((await complete(w.owner, soon, 'the contract PDF filed in the room (harness)')).item['state']).toBe('done');
    sixEvidence('D1', { fault_trace: { overdue: ex }, watermark: { ticks: [4, 5, 6, 7] }, consumer_behaviour: 'once per due instant', operator_action: 'extension co-signed', recovery: 'in_progress', reconciliation: 'done' });
  }, 240_000);

  it('O1 · THE OBJECTIVE CHANGE (V02-T-117): the owner transferred and the objective revised → GraphChanged/objective.changed through the real dispatch; the items re-tasked, the reviewer reassigned; re-accepted', async () => {
    const before = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    await assignOwner(w.objectiveId, reviewer2.principalId);
    await waitFor('the root re-tasked', () => itemRow(ROOT), (r) => r['state'] === 'retask_required' && r['reviewer_principal_id'] === reviewer2.principalId, 120_000);
    expect(await itemRow(HAND)).toMatchObject({ state: 'retask_required', reviewer_principal_id: reviewer2.principalId });
    expect(await itemRow(MILE)).toMatchObject({ state: 'retask_required' });
    const ev = (await sql<Row>`select id::text, payload from objects.object_outbox where event_type = 'GraphChanged' and payload -> 'change' ->> 'kind' = 'objective.changed' and created_at >= ${before}`.execute(su)).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]!['payload']).toMatchObject({ objective: { objective_id: w.objectiveId, change: 'owner_assigned', owner_to: reviewer2.principalId }, objects: { objectives: [w.objectiveId], walked: false } });
    await waitFor('item.retasked and reviewer.reassigned', async () => [(await changed('item.retasked', ROOT)).length, (await changed('reviewer.reassigned', ROOT)).length], (n) => n[0] === 1 && n[1] === 1, 60_000);
    // the delivery is marked applied after the consumer's effects land (the events above), so it is WAITED for, not read at once — #77's hosted
    // run (2026-10-03) read it between the two ('received'); the assertion is unchanged
    const deliveryOf = async () => (await sql<Row>`select state, items from graph.subscription_deliveries where event_id = ${String(ev[0]!['id'])}::uuid and consumer_kind = 'commitments'`.execute(su)).rows;
    await waitFor('the commitments delivery applied', deliveryOf, (rows) => rows.length === 1 && rows[0]!['state'] === 'applied', 60_000);
    const del = await deliveryOf();
    expect(del).toEqual([expect.objectContaining({ state: 'applied' })]);
    // the revision: a new version, a second re-task (no reassignment: the owner did not move); the non-owner refused
    await refused(revise(w.owner, w.objectiveId, { title: 'x', reason: 'not mine to revise (harness)' }), /./, 403);
    for (const id of [ROOT, HAND, MILE]) await accept(id === MILE ? buyer : w.owner, id);
    const rv = await revise(reviewer2, w.objectiveId, { statement: 'Keep line A1 running on two magnet sources by Q2 (revised, B34 harness)', reason: 'the dual-source target moves to Q2 (harness)' });
    expect(rv.objective).toMatchObject({ object_type: 'OBJ', to_version: Number(rv.objective['from_version']) + 1 });
    await waitFor('the root re-tasked again', () => itemRow(ROOT), (r) => r['state'] === 'retask_required', 120_000);
    expect((await exceptionsOf(ROOT)).filter((e) => e['kind'] === 'objective_changed')).toHaveLength(2);
    expect((await changed('reviewer.reassigned', ROOT))).toHaveLength(1);
    for (const id of [ROOT, HAND, MILE]) expect((await accept(id === MILE ? buyer : w.owner, id)).item['state']).toBe('in_progress');
    sixEvidence('O1', { fault_trace: del, watermark: { event: ev[0]!['id'] }, consumer_behaviour: 'commitments consumer: retask + reassign once per event', operator_action: 'owner transfer, revision', recovery: 're-accepted', reconciliation: 'reviewer2 reviews' });
  }, 300_000);

  it('Z1 · CLOSURE (OBJ-37): proposed by the owner with deliverables; the proposer\'s co-sign refused; co-signed by the reviewer → CMT version 2 closed; the five-lane timeline; the package close passes the commitment check', async () => {
    await refused(propose(w.owner, P.commitmentId, { deliverables: [{ title: 'Second source live', evidence: 'the ERP receipts (harness)' }], statement: 'the commitment is delivered (harness)' }), /commitment closure rejected \(not_ready\)/, 409);
    expect((await complete(w.owner, HAND, 'the ERP receipts for both handoffs, reconciled (harness)')).item['state']).toBe('done');
    expect((await complete(buyer, MILE, 'the qualification report filed (harness)')).item['state']).toBe('done');
    await refused(propose(reviewer2, P.commitmentId, { deliverables: [{ title: 'x', evidence: 'nothing (harness)' }], statement: 'not the owner (harness)' }), /commitment closure rejected \(not_owner\)/, 403);
    await refused(propose(w.owner, P.commitmentId, { deliverables: [], statement: 'no deliverables (harness)' }), /commitment closure rejected \(deliverables\)/, 422);
    const pc = (await propose(w.owner, P.commitmentId, { deliverables: [{ title: 'Second NdFeB source live', evidence: 'ERP receipts SYN-PR (harness)' }], statement: 'Dual sourcing is in place (harness)' })).closure;
    expect(await changed('closure.proposed', ROOT)).toHaveLength(1);
    await refused(cosignClosure(w.owner, String(pc['closure_id']), P.commitmentId), /commitment closure rejected \(not_reviewer\)/, 403);
    const done = (await cosignClosure(reviewer2, String(pc['closure_id']), P.commitmentId)).closure;
    expect(done).toMatchObject({ state: 'cosigned', cmt_version: 2 });
    expect((await sql<Row>`select status, object_version::int v from graph.strategy_current where strategy_object_id = ${P.commitmentId}::uuid`.execute(su)).rows[0]).toEqual({ status: 'closed', v: 2 });
    expect((await sql<Row>`select object_version::int v, payload ->> 'status' s from objects.canonical_objects where object_id = ${P.commitmentId}::uuid order by object_version`.execute(su)).rows).toEqual([{ v: 1, s: 'active' }, { v: 2, s: 'closed' }]);
    expect(await pkgEvents(P.pkg, 'commitment.closed')).toHaveLength(1);
    expect(await changed('closure.cosigned', ROOT)).toHaveLength(1);
    const g = await getC(executive, P.commitmentId);
    expect(new Set(g.commitment.timeline.map((x) => x['lane']))).toEqual(new Set(['commitment', 'resource', 'operational', 'deviation', 'governance']));
    expect(g.commitment.blockers).toBeNull();
    // the package's close now fails on its OWN rule (no outcome recorded) — the commitment check passed
    const after = await refusal(c.close(P.pkg, 'closing after the commitment closed (harness)'));
    expect(after.message).toMatch(/no outcome is recorded/);
    sixEvidence('Z1', { fault_trace: { refused: ['409 not_ready', '403 not_owner', '422 deliverables', '403 not_reviewer'] }, watermark: done, consumer_behaviour: 'n/a', operator_action: 'propose + co-sign',
      recovery: 'n/a', reconciliation: { lanes: [...new Set(g.commitment.timeline.map((x) => x['lane']))] } });
  }, 120_000);

  it('S1 · SEPARATION AND THE VETTING: the drafter who holds execution_authority and the decision\'s committer are refused by the port; the production egress refuses the loopback target (nothing reaches the ERP)', async () => {
    // a second commitment, committed by an authority who ALSO holds execution_authority; its item owned by an owner who also does
    const p2 = await c.proposed();
    await c.approve(p2.pkg, p2.v, { decision: 'approve', versionDigest: p2.digest, rationale: 'the second package, for the separation probes (harness)' }, w.approver);
    const cm2 = (await c.commit(p2.pkg, p2.v, p2.digest, authIssuer)).commitment.commitmentId;
    const root2 = String((await sql<Row>`select item_id::text from decision.commitment_items where commitment_id = ${cm2}::uuid and parent_item_id is null`.execute(su)).rows[0]!['item_id']);
    await accept(w.owner, root2);
    const it2 = String((await declareItem(w.owner, cm2, { kind: 'handoff', title: 'Separation probe handoff', owner: dual.principalId, dueAt: inDays(5) })).item['item_id']);
    await accept(dual, it2);
    await setMode('normal');
    const d = (await draft(dual, it2, { targetKey: 'nordwerk-erp', lines: [LINES[1]] })).handoff;
    await refused(issue(dual, String(d['handoff_id']), String(d['payload_digest'])), /execution issue rejected \(separation\): the drafter/, 403);
    await refused(issue(authIssuer, String(d['handoff_id']), String(d['payload_digest'])), /execution issue rejected \(separation\): the decision's committer/, 403);
    // the PRODUCTION egress restored: the target's name does not resolve / a loopback literal is refused by the vetting — recorded, never thrown
    egress.deliver = (req: DeliveryRequest) => deliver(req);
    try {
      const before = ((await erpCall('GET', '/_received')).body['received'] as Row[]).length;
      const r = await issue(issuer, String(d['handoff_id']), String(d['payload_digest']));
      expect(r.handoff.attempt).toMatchObject({ outcome: 'transport', state: 'issuing' });
      expect(((await erpCall('GET', '/_received')).body['received'] as Row[]).length, 'nothing reached the ERP').toBe(before);
    } finally { egress.deliver = harnessEgress; }
    sixEvidence('S1', { fault_trace: { refused: ['403 separation drafter', '403 separation committer'] }, watermark: null, consumer_behaviour: 'n/a', operator_action: 'n/a', recovery: 'the harness egress restored', reconciliation: 'n/a' });
  }, 240_000);

  it('I1 · §I THE INTEGRATION: an overdue item\'s after-tick CommitmentChanged ROUTED by the attention consumer as commitment.breach (read through decision.commitment_item_signal); the item\'s owner ACTS from the attention item (propose_extension, human-gated) and the reviewer co-signs on the tracker', async () => {
    // the attention consumer registered here (the backlog left) and a policy naming the commitment classes
    await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
      { payload: { consumerKind: 'attention', ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never });
    await exec.publishAttentionPolicy(h.req(executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the commitment classes for the tracker (harness)', rules: { classes: {
      'commitment.breach': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 60 },
      'commitment.due': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 240 } } } } as never });
    const fresh = await c.committed(); // a commitment still open (P's is closed by Z1)
    const item = String((await declareItem(w.owner, fresh.commitmentId, { kind: 'deliverable', title: 'Customs pre-clearance filed (harness)', owner: w.owner.principalId, dueAt: inDays(1) })).item['item_id']);
    await accept(w.owner, item);
    await sql`update decision.commitment_items set due_at = clock_timestamp() - interval '1 hour' where item_id = ${item}::uuid`.execute(su); // stated: the DB clock
    await tick(21); await tick(22);
    const ex = await waitFor('the deadline_missed exception', () => exceptionsOf(item), (rows) => rows.some((e) => e['kind'] === 'deadline_missed' && e['state'] === 'open'));
    await waitFor('the after-tick CommitmentChanged item.overdue', () => changed('item.overdue', item), (rows) => rows.length === 1, 30_000);
    const routed = await waitFor('the routed commitment.breach item', async () => (await sql<Row>`select item_id::text, signal_class, owner_principal_id::text owner, state from executive.attention_items
                                                                               where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and subject_kind = 'commitment_item' and subject_id = ${item}::uuid`.execute(su)).rows,
      (rows) => rows.some((r) => r['signal_class'] === 'commitment.breach'), 60_000);
    const it_ = routed.find((r) => r['signal_class'] === 'commitment.breach')!;
    expect(it_).toMatchObject({ owner: w.owner.principalId });
    // the act: refused to someone who is not the item's person; performed by the owner — the extension proposed
    const actOn = (as: AuthenticatedPrincipal, payload: Row) => exec.actOnAttentionItem(h.req(as, 'executive.attention.item.act', 'ATI', String(it_['item_id']), 'executive'), T(), D(), String(it_['item_id']), { payload }) as unknown as Promise<{ act: Row }>;
    await refused(actOn(reviewer2, { action_key: 'propose_extension', rationale: 'not my item (harness)', params: { newDueAt: inDays(5) } }), /./, 403);
    const acted = (await actOn(w.owner, { action_key: 'propose_extension', rationale: 'the clearance slips five days (harness)', params: { newDueAt: inDays(5) } })).act;
    expect(acted).toMatchObject({ state: 'acted' });
    const exId = String(ex.find((e) => e['kind'] === 'deadline_missed')!['exception_id']);
    expect((await exceptionsOf(item)).find((e) => e['exception_id'] === exId)!['state']).toBe('proposed');
    expect((await sql<{ n: number }>`select count(*)::int n from executive.attention_item_events where item_id = ${String(it_['item_id'])}::uuid and event = 'item.acted'`.execute(su)).rows[0]!.n).toBe(1);
    const rev = String((await itemRow(item))['reviewer_principal_id']);
    const revP = [reviewer, reviewer2, w.twinOwner, w.authority, w.executive].find((x) => x.principalId === rev)!;
    // the reviewer (the objective's owner — a fixture principal on the manager's session) co-signs on a session of its own
    expect((await decide(await h.openSession(revP), exId, { act: 'cosign', note: 'five days accepted (harness)' })).exception).toMatchObject({ state: 'extended' });
    sixEvidence('I1', { fault_trace: { overdue: exId }, watermark: { attention_item: it_['item_id'] }, consumer_behaviour: 'commitment.breach routed through the signal contract',
      operator_action: 'the owner acts from the item; the reviewer co-signs', recovery: 'extended', reconciliation: acted });
  }, 240_000);
});
