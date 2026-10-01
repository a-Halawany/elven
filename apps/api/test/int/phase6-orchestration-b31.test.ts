/**
 * CP-6 B31 part O (0099 §O) — SIMULATION RUN ORCHESTRATION, BUDGETS, CHECKPOINTS, PARTIAL RUNS AND THE RUN CENTER (F-P5-06: L8-C06,
 * V03-T-149/-153/-155/-344..-347/-354, ES-38-001/-007/-008/-009, V04-T-033/-034, PR-35-001..-005, CAP-DS-04/-05, WS-13, JRN-14), through the
 * real database and controllers: the twin of phase5-simulations' shortest world (a supply-flow@1 twin, version 1 complete), the run
 * route's own opening path, the domain's ATTENTION AGENT as the background worker (its after-tick hook `simulation-experiments`, driven by
 * the timer's tickNow — never by sleeping), the chunk executor a SEPARATE PROCESS from the built tree (dist). Every figure is SYNTHETIC.
 *
 *   O1 · DECLARE AND APPROVE (V03-T-344, JRN-14, PR-35-003): the declaration's refusals (intake 422; the port's budget 422 and unknown
 *        version 404; the analyst 403 at the PDP); the approval request routed (simulation.budget, to the approving roles); the approval's
 *        refusals (the declarer — separation of duties 403; a stale budget digest 409; the analyst at the PDP); RECOVERY: the right digest
 *        approves and the request closes.
 *   O2 · START — THE ADMISSION AND THE RUN (V03-T-346/-345, L8-I02): before approval 409; FEASIBILITY refused and RECORDED; the run
 *        opened through the existing path (seeded, samples = paths) and bound; SimulationStarted; a run the gates REFUSE fails the
 *        experiment with the refusal as its reason, the declarer told (the fail-closed degraded behaviour).
 *   O3 · THE BACKGROUND EXECUTION (L8-C06, V03-T-347/-155, ES-38-008, the demonstration's scene): a 5,000-path experiment in chunks of 500,
 *        one chunk per tick; each chunk a CHECKPOINT with the digest chained to the previous one and the indicators; HALFWAY (5 of 10) it is
 *        PAUSED — a tick executes nothing —, its pause refused to an unrelated operator (403) and its resumption refused while running
 *        (409); RESUMED from the last checkpoint; COMPLETED with its MANIFEST: the run completed, its outputs EXACTLY the single execution's
 *        (the digest of simulateSupplyFlow over the stored contract), the SIM object SYNTHETIC, run.completed with the experiment named,
 *        SimulationCompleted under the worker's action, the declarer told; the run REPRODUCES cold through the existing route.
 *   O4 · THE WORKER'S AUTHORITY: a run operator's execute refused at the PDP; a holder of the attention_agent role who is not an active
 *        attention agent refused by the port (403).
 *   O5 · PARTIAL RUNS (V03-T-153/-354, V04-T-034, PR-35-005; fault injection): a chunk that crashes is RETRIED (recovery); the budget's
 *        chunk executions exhausted → budget_exceeded, the declarer told, the run PARTIAL with its declaration (750 of 1,000 paths, the
 *        missing range, the missing outputs, diagnostic only) and no new run event; a chunk that fails for good → partial (chunk_failed);
 *        CONVERGENCE before the declared paths → partial (converged).
 *   O6 · RECOVERY OF A WORKER LOST MID-CHUNK (V03-T-155): a chunk reclaimed by another worker meanwhile — the late record FENCED (stale) —;
 *        its lease lapsed (a stated superuser move of started_at) → reclaimed (chunk_reclaimed, the next attempt) and completed.
 *   O7 · CANCEL AND CAPACITY: a third concurrent experiment refused (capacity) and admitted once a slot frees (recovery); a cancellation
 *        the run partial over the chunks done (or failed when none), refused twice (409) and to an unrelated operator (403); a declared
 *        experiment cancelled with no run.
 *   O8 · READS: the list and the read (budget use, chunks, checkpoints, ledger, the run, the executor) to an analyst; a principal without a
 *        reading role refused at the PDP.
 *
 * Stated: the executor is a separate process per chunk on this host (distributed execution across machines is out of reach); the
 * Simulation Agent (AG-021) is not built; supply-flow@1 is the only chunkable method; the chunk executes the contract with samples = its
 * last path and keeps its own (the pinned implementation exports no per-index sampler — the cost grows with the offset).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { jcsCanonicalize } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { simulateSupplyFlow } from '../../src/twin/models/supply-flow.js';
import { contractOf } from '../../src/twin/simulations/simulation.service.js';
import { OrchestrationController } from '../../src/twin/simulations/orchestration/orchestration.controller.js';
import { OrchestrationService, processExecutor, type ChunkExecutor } from '../../src/twin/simulations/orchestration/orchestration.service.js';
import { OrchestrationCapability } from '../../src/twin/simulations/orchestration/orchestration.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';
import { RECORD_FILES, completeElements } from './phase5-fixtures.js';

// C5 / Nit 8: this file's own vault roots (h.upload uploads through the governed path).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b31-o-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let twins: TwinController; let exec: ExecutiveController; let ctl: OrchestrationController; let svc: OrchestrationService; let timer: AttentionTimerService;
/** T. Nakamura's part (the twin owner and run operator: declares, starts, pauses), J. Weber's (the strategy owner: approves the budget). */
let nakamura: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let operator2: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let pseudoAgent: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let execOwner: AuthenticatedPrincipal;
let twinId = ''; let v1 = 0; let agentId = ''; let agentPrincipal = ''; let day = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const JITTER = { '0': 0.5, '3': 0.3, '7': 0.2 };

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'SXP', id, 'simulation');
const declare = (payload: Row, as = nakamura) => ctl.declare(R(as, 'simulation.experiment.declare'), T(), D(), { payload }) as Promise<{ experiment: Row }>;
const approve = (id: string, budgetDigest: string, note = 'the corridor budget is proportionate (SYNTHETIC)', as = weber) =>
  ctl.approve(R(as, 'simulation.experiment.approve', id), T(), D(), id, { payload: { budgetDigest, note } }) as Promise<{ experiment: Row }>;
const start = (id: string, as = nakamura) => ctl.start(R(as, 'simulation.experiment.start', id), T(), D(), id) as Promise<{ experiment: Row }>;
const pause = (id: string, reason = 'halfway review', as = nakamura) => ctl.pause(R(as, 'simulation.experiment.pause', id), T(), D(), id, { payload: { reason } }) as Promise<{ experiment: Row }>;
const resume = (id: string, as = nakamura) => ctl.resume(R(as, 'simulation.experiment.resume', id), T(), D(), id, { payload: { reason: 'review done' } }) as Promise<{ experiment: Row }>;
const cancel = (id: string, reason = 'superseded by a wider experiment', as = nakamura) => ctl.cancel(R(as, 'simulation.experiment.cancel', id), T(), D(), id, { payload: { reason } }) as Promise<{ experiment: Row }>;
const read = (id: string, as = nakamura) => ctl.read(R(as, 'simulation.experiment.read', id), T(), D(), id).then((r) => (r as unknown as { experiment: Row }).experiment);
const list = (as = nakamura) => ctl.list(R(as, 'simulation.experiment.read'), T(), D(), { payload: {} }) as Promise<{ experiments: Row[] }>;
const runRow = async (id: string) => (await rows(sql`select * from simulation.runs_current where run_id = ${id}::uuid`))[0] as Row;
const events = async (id: string) => (await rows(sql`select event from simulation.experiment_events where experiment_id = ${id}::uuid order by occurred_at, event_id`)).map((e) => String(e['event']));
const runEvents = async (id: string) => (await rows(sql`select event from simulation.run_events where run_id = ${id}::uuid order by occurred_at`)).map((e) => String(e['event']));
const items = async (cls: string, subject: string) => rows(sql`select item_id::text, owner_principal_id::text as owner, route_roles, state, title, details from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);

/** A declaration (SYNTHETIC): a control run of the corridor twin under the hypothetical shock, its paths in chunks, seeded. */
const declaration = (over: Row = {}, budget: Row = {}) => ({
  title: 'Corridor closure — Monte-Carlo (SYNTHETIC)', question: 'How many line-stop days does the corridor closure cost, across lead-time jitter?',
  run: { twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90 },
  paths: 1000, chunkSize: 250, seed: 31, jitter: JITTER, measures: ['total_cost', 'line_stop_days'],
  budget: { max_paths: 5000, max_wall_seconds: 600, max_chunks: 12, ...budget }, ...over,
});
/** Declared and approved (Weber), then started (Nakamura): the experiment as read. */
const approvedAndStarted = async (over: Row = {}, budget: Row = {}) => {
  const d = (await declare(declaration(over, budget))).experiment;
  await approve(String(d['experiment_id']), String(d['budget_digest']));
  return (await start(String(d['experiment_id']))).experiment;
};
/** One attention tick (its own day); answers the worker's drain from the after-tick hook. */
const tick = async (): Promise<Row> => {
  day += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2037, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const drain = obj(obj(obj(t.run?.outputs)['after'])['simulation-experiments']);
  expect(drain['error'], String(drain['error'])).toBeUndefined();
  return drain;
};
const sixEvidence = (id: string, e: Row) => { console.log(`B31-O EVIDENCE ${id} ${JSON.stringify(e)}`); };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  twins = h.app.get(Tc); exec = h.app.get(Ec); ctl = h.app.get(OrchestrationController); svc = h.app.get(OrchestrationService); timer = h.app.get(AttentionTimerService);
  nakamura = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b31o-nakamura');
  weber = await h.humanWithSession(['strategy_owner'], 'b31o-weber');
  analyst = await h.humanWithSession(['domain_analyst'], 'b31o-analyst');
  operator2 = await h.humanWithSession(['simulation_operator'], 'b31o-operator2');
  outsider = await h.humanWithSession(['decision_approver'], 'b31o-outsider');
  pseudoAgent = await h.humanWithSession(['attention_agent'], 'b31o-pseudo-agent');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b31o-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b31o-dadmin');
  execOwner = await h.humanWithSession(['executive'], 'b31o-executive');
  // THE TWIN (SYNTHETIC; phase5-simulations' shortest world): the corridor chain's records uploaded, version 1 grounded complete and admitted.
  const up = await h.upload(RECORD_FILES());
  const records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  const entityId = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${nakamura.principalId}::uuid, ${ec}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entityId}::uuid, 'entity.created', ${nakamura.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', normalized_name: 'bab el-mandeb strait', split_from: null })}::jsonb, ${ec}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(nakamura, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain (B31 harness)', statement: 'the magnet chain',
    boundary: [entityId], owner: nakamura.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  const o = await twins.openVersion(h.req(nakamura, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(nakamura, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: completeElements(records) } });
  await twins.admit(h.req(nakamura, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  v1 = o.version.version;
  // THE ATTENTION AGENT: the background worker's principal (the scheduler is off: the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: execOwner.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  agentPrincipal = String((await rows(sql`select principal_id::text p from executive.agents where agent_id = ${agentId}::uuid`))[0]?.['p']);
}, 600_000);

afterAll(async () => { svc?.useExecutorForTests(null); await h?.close(); }, 120_000);

let MAIN = ''; let MAIN_RUN = '';

describe('B31 part O · simulation orchestration (0099 §O; F-P5-06)', () => {
  it('O1 · DECLARE AND APPROVE: the refusals; the approval request routed; the declarer refused (SoD), a stale digest refused; the right digest approves and the request closes', async () => {
    // the intake (422): paths beyond the model's bound, a chunk larger than the paths, a method-fabric contract, a stochastic block in the contract
    await refused(declare(declaration({ paths: 20_000 })), /experiment rejected \(declaration\): paths/, 422);
    await refused(declare(declaration({ chunkSize: 2000 })), /chunkSize/, 422);
    await refused(declare(declaration({ run: { ...declaration().run, stochastic: { mode: 'deterministic' } } })), /no stochastic block/, 422);
    await refused(declare(declaration({ jitter: { '0': 0.5 } })), /sum to 1/, 422);
    // the port: the budget below the declared paths (422); an unknown twin version (404)
    await refused(declare(declaration({}, { max_paths: 500 })), /experiment rejected \(budget\): the declared 1000 paths exceed the budget's max_paths 500/, 422);
    await refused(declare(declaration({ run: { ...declaration().run, twinVersion: 99 } })), /experiment rejected \(unknown_twin_version\)/, 404);
    // the PDP: an analyst does not declare
    await refused(declare(declaration(), analyst), /./, 403);
    expect((await rows(sql`select count(*)::int n from simulation.experiments`))[0]?.['n']).toBe(0);
    // POSITIVE: the 5,000-path corridor experiment (the demonstration's scene), in chunks of 500, one chunk per tick
    const d = (await declare(declaration({ paths: 5000, chunkSize: 500, title: 'Corridor closure — 5,000 paths (SYNTHETIC)' }, { max_paths: 5000, max_wall_seconds: 900, max_chunks: 14 }))).experiment;
    MAIN = String(d['experiment_id']);
    expect(d['state']).toBe('declared');
    expect(d['budget']).toEqual({ max_paths: 5000, max_wall_seconds: 900, max_chunks: 14 });
    expect(d['stop_conditions']).toEqual({ paths: 5000, converged: null });
    const req = await items('simulation.budget', MAIN);
    expect(req).toHaveLength(1);
    expect(req[0]).toMatchObject({ owner: null, state: 'open', route_roles: ['domain_admin', 'strategy_owner', 'twin_owner'] });
    expect(obj(req[0]?.['details'])['kind']).toBe('approval_requested');
    // REFUSALS: the declarer (who holds twin_owner, so the PDP admits him) — separation of duties at the port; a stale digest; the analyst at the PDP
    await refused(approve(MAIN, String(d['budget_digest']), 'I approve my own budget', nakamura), /experiment rejected \(separation_of_duties\)/, 403);
    await refused(approve(MAIN, 'f'.repeat(64)), /experiment rejected \(stale\): the budget approved/, 409);
    await refused(approve(MAIN, String(d['budget_digest']), 'an analyst approval', analyst), /./, 403);
    expect((await read(MAIN))['state']).toBe('declared');
    // RECOVERY: the budget as read, approved by Weber; the request closed
    const a = (await approve(MAIN, String(d['budget_digest']))).experiment;
    expect(a).toMatchObject({ state: 'approved', approved_by: weber.principalId, approved_budget_digest: d['budget_digest'] });
    expect((await items('simulation.budget', MAIN))[0]?.['state']).toBe('closed');
    await refused(approve(MAIN, String(d['budget_digest'])), /experiment rejected \(state\)/, 409);
    expect(await events(MAIN)).toEqual(['declared', 'approved']);
    sixEvidence('O1', { experiment: MAIN, approval: { by: weber.principalId, digest: d['budget_digest'] }, refusals: ['intake 422 ×4', 'budget 422', 'unknown_twin_version 404', 'PDP 403', 'separation_of_duties 403', 'stale 409'] });
  }, 300_000);

  it('O2 · START: refused before approval; FEASIBILITY refused and recorded; the run opened through the existing path and bound (SimulationStarted); a run the gates refuse fails the experiment', async () => {
    // before approval (409)
    const early = (await declare(declaration({ title: 'Not yet approved (SYNTHETIC)' }))).experiment;
    await refused(start(String(early['experiment_id'])), /experiment rejected \(state\): .* not approved/, 409);
    // FEASIBILITY: 1,000 paths in chunks of 100 need 10 executions; the budget allows 4 → refused and RECORDED (the experiment stays approved)
    const inf = (await declare(declaration({ title: 'Infeasible (SYNTHETIC)', chunkSize: 100 }, { max_chunks: 4 }))).experiment;
    const infId = String(inf['experiment_id']);
    await approve(infId, String(inf['budget_digest']));
    await refused(start(infId), /experiment rejected \(admission\): .* feasibility: the declared 1000 paths need 10 chunk executions; the approved budget allows 4/, 409);
    expect((await read(infId))['state']).toBe('approved');
    expect(await events(infId)).toEqual(['declared', 'approved', 'admission_refused']);
    // POSITIVE: the main experiment admitted, its run opened (seeded, samples = paths) and bound
    const t0 = (await rows(sql`select clock_timestamp() t`))[0]?.['t'] as Date;
    const s = (await start(MAIN)).experiment;
    expect(s['state']).toBe('running');
    MAIN_RUN = String(s['run_id']);
    const run = await runRow(MAIN_RUN);
    expect(run).toMatchObject({ state: 'opened', stochastic_mode: 'seeded', samples: 5000, operator_principal_id: nakamura.principalId });
    expect(Number(run['seed'])).toBe(31);
    expect(obj(s['admission'])).toMatchObject({ admitted: true, deterministic: true, chunks: 10, capacity: 2, in_use: 0 });
    expect((s['chunks'] as Row[]).map((c) => [c['first_path'], c['paths'], c['state']])).toEqual(Array.from({ length: 10 }, (_, i) => [i * 500, 500, 'queued']));
    expect(await events(MAIN)).toEqual(['declared', 'approved', 'started', 'run_opened']);
    expect(await runEvents(MAIN_RUN)).toEqual(['run.opened']);
    const started = await rows(sql`select payload from objects.object_outbox where event_type = 'SimulationStarted' and created_at >= ${t0} and payload ->> 'run_id' = ${MAIN_RUN}`);
    expect(started).toHaveLength(1);
    expect(obj(obj(started[0]?.['payload'])['stochastic'])).toMatchObject({ mode: 'seeded', seed: 31, samples: 5000 });
    // A RUN THE GATES REFUSE (an intervention naming no completed control): the experiment FAILS with the refusal; the declarer is told
    const bad = await approvedAndStarted({ title: 'Refused at opening (SYNTHETIC)', run: { ...declaration().run, runKind: 'intervention', controlRunId: uuidv7(), interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] } })
      .then(() => null, (e: unknown) => e);
    expect(bad).not.toBeNull();
    const failed = (await rows(sql`select experiment_id::text id, state, outcome from simulation.experiments where title = 'Refused at opening (SYNTHETIC)'`))[0]!;
    expect(failed['state']).toBe('failed');
    expect(obj(failed['outcome'])['reason']).toBe('run_refused');
    expect(await events(String(failed['id']))).toEqual(['declared', 'approved', 'started', 'failed']);
    expect((await items('simulation.experiment', String(failed['id'])))[0]).toMatchObject({ owner: nakamura.principalId, state: 'open' });
    sixEvidence('O2', { started: MAIN, run: MAIN_RUN, infeasible: infId, refused_at_opening: failed['id'] });
  }, 300_000);

  it('O3 · THE BACKGROUND EXECUTION: chunk per tick, chained checkpoints, PAUSED halfway (a tick runs nothing), refusals, RESUMED, COMPLETED with its manifest — the outputs exactly the single execution\'s, reproduced cold', async () => {
    const chain: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = await tick();
      expect(d['chunks']).toBe(1);
      const e = await read(MAIN);
      expect(obj(e['progress'])['paths_done']).toBe((i + 1) * 500);
      const k = (e['checkpoints'] as Row[])[i]!;
      const c = (e['chunks'] as Row[])[i]!;
      expect(k).toMatchObject({ seq: i + 1, chunk_index: i, paths_done: (i + 1) * 500 });
      expect(k['digest']).toBe(sha(`${i === 0 ? `genesis:${MAIN}` : chain[i - 1]}|${i}|${String(c['digest'])}`));
      chain.push(String(k['digest']));
    }
    // HALFWAY: the indicators of the 5th checkpoint (ES-38-008)
    let e = await read(MAIN);
    const ind = obj(e['indicators']);
    expect(obj(obj(ind['numerical_stability'])['total_cost'])).toMatchObject({ measure: 'total_cost', n: 2500, rule: 'sio-stability@1' });
    expect(['stable', 'unstable']).toContain(obj(obj(ind['numerical_stability'])['total_cost'])['state']);
    // constraint satisfaction: the run's own recorded verdict (0092's run_constraint_checks — the opening gate's), restated on the experiment
    const cc = (await rows(sql`select stage, outcome from simulation.run_constraint_checks where run_id = ${MAIN_RUN}::uuid order by checked_at desc limit 1`))[0];
    expect(obj(ind['constraint_satisfaction'])).toMatchObject(cc === undefined ? { outcome: 'not_applicable' } : { stage: cc['stage'], outcome: cc['outcome'] });
    expect(Number(obj(ind['latency'])['chunk_wall_ms'])).toBeGreaterThan(0);
    expect(obj(ind['failure_containment'])).toMatchObject({ chunk_failures: 0, contained: true });
    expect(obj(e['budget_use'])['chunk_executions']).toEqual({ used: 5, approved_max: 14 });
    // PAUSE: refused to an unrelated operator (the port, 403) and resumption refused while running (409); Nakamura pauses
    await refused(pause(MAIN, 'not mine to pause', operator2), /experiment rejected \(authority\): pausing/, 403);
    await refused(resume(MAIN), /experiment rejected \(state\): .* not paused/, 409);
    expect((await pause(MAIN)).experiment['state']).toBe('paused');
    const idle = await tick();
    expect(idle['chunks']).toBe(0);
    expect(obj((await read(MAIN))['progress'])['paths_done']).toBe(2500);
    // RESUMED from the last checkpoint: the next chunk is 5
    expect((await resume(MAIN)).experiment['state']).toBe('running');
    let lastDrain: Row = {};
    for (let i = 5; i < 10; i += 1) lastDrain = await tick();
    e = await read(MAIN);
    expect(e['state'], JSON.stringify(lastDrain['steps'])).toBe('completed');
    expect(await events(MAIN)).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'checkpointed', 'checkpointed', 'checkpointed', 'checkpointed', 'paused', 'resumed',
      'checkpointed', 'checkpointed', 'checkpointed', 'checkpointed', 'checkpointed', 'completed']);
    // THE RUN: completed; its outputs EXACTLY the single execution's over the stored contract
    const run = await runRow(MAIN_RUN);
    expect(run['state']).toBe('completed');
    const single = simulateSupplyFlow(contractOf(run).params, contractOf(run).options, contractOf(run).interventions);
    expect(run['outputs_digest']).toBe(sha(jcsCanonicalize(single)));
    expect((obj(obj(run['outputs'])['stochastic'])['sample_totals'] as unknown[]).length).toBe(5000);
    expect(obj(run['sensitivity'])['basis']).toMatch(/deterministic trajectory/);
    expect(await runEvents(MAIN_RUN)).toEqual(['run.opened', 'run.completed']);
    const completedEv = (await rows(sql`select details from simulation.run_events where run_id = ${MAIN_RUN}::uuid and event = 'run.completed'`))[0]!;
    expect(obj(completedEv['details'])['experiment_id']).toBe(MAIN);
    const simObj = (await rows(sql`select truth_state, synthetic_state, schema_ref from objects.canonical_objects where object_id = ${MAIN_RUN}::uuid`))[0];
    expect(simObj).toMatchObject({ truth_state: 'synthetic', synthetic_state: true, schema_ref: 'SIM@v2' });
    const deps = (await rows(sql`select depends_on_kind k from graph.dependencies where dependent_object_id = ${MAIN_RUN}::uuid`)).map((x) => x['k']);
    expect(deps).toEqual(['twin']);
    // THE MANIFEST: every chunk's seed offset and digest, the checkpoint head, the approved budget, the versions
    const m = obj(e['manifest']);
    expect((m['chunks'] as Row[]).map((c) => [c['chunk_index'], c['first_path'], c['state']])).toEqual(Array.from({ length: 10 }, (_, i) => [i, i * 500, 'done']));
    expect(obj(m['checkpoint_head'])).toMatchObject({ seq: 10 });
    expect(obj(m['method'])['implementation_digest']).toBe(run['implementation_digest']);
    expect(obj(obj(m['budget'])['approved'])).toEqual({ max_paths: 5000, max_wall_seconds: 900, max_chunks: 14 });
    expect(m['outputs_digest']).toBe(run['outputs_digest']);
    // ANNOUNCED: SimulationCompleted under the worker's action; the declarer told
    const done = await rows(sql`select payload from objects.object_outbox where event_type = 'SimulationCompleted' and payload ->> 'run_id' = ${MAIN_RUN}`);
    expect(done).toHaveLength(1);
    expect(obj(obj(done[0]?.['payload'])['cause'])).toMatchObject({ action: 'simulation.experiment.execute', actor: agentPrincipal, experiment_id: MAIN });
    expect((await items('simulation.experiment', MAIN)).map((x) => [x['owner'], x['state']])).toEqual([[nakamura.principalId, 'open']]);
    // REPRODUCED cold through the existing route (the stored contract re-executed in a separate process)
    const rep = await twins.reproduce(h.req(nakamura, 'simulation.reproduce', 'SIM', MAIN_RUN, 'simulation'), T(), D(), MAIN_RUN, { payload: {} }) as unknown as { reproduction: Row };
    expect(rep.reproduction['verdict']).toBe('reproduced');
    expect(rep.reproduction['coldProcess']).toBe(true);
    // a finished experiment is not paused, resumed or cancelled
    await refused(pause(MAIN), /experiment rejected \(state\)/, 409);
    await refused(cancel(MAIN), /experiment rejected \(state\)/, 409);
    sixEvidence('O3', { experiment: MAIN, run: MAIN_RUN, outputs_digest: run['outputs_digest'], checkpoint_head: m['checkpoint_head'], reproduction: rep.reproduction['verdict'] });
  }, 600_000);

  it('O4 · THE WORKER\'S AUTHORITY: a run operator\'s execute refused at the PDP; an attention_agent role holder who is not an active attention agent refused by the port', async () => {
    const claimAs = (p: AuthenticatedPrincipal) => h.pipeline.write(h.env(p, 'simulation.experiment.execute', 'SXP', null, 'simulation'), p,
      { scope: 'DOMAIN' as const, tenantId: T(), domainId: D(), action: 'simulation.experiment.execute', objectType: 'SXP', objectId: null }, OrchestrationCapability.execute,
      async (cap) => ({ result: await cap.claim({ tenantId: T(), domainId: D(), experimentId: null, exclude: [], leaseSeconds: 300, actor: p.principalId, correlationId: uuidv7() }), targetType: 'SXP', targetId: null, targetVersion: null, outboxEvent: null }));
    await refused(claimAs(nakamura), /./, 403);
    await refused(claimAs(pseudoAgent), /experiment rejected \(authority\): the executor of experiment chunks is an active attention agent/, 403);
  }, 120_000);

  it('O5 · PARTIAL RUNS: a crashed chunk retried; the budget exhausted → PARTIAL with its declaration (no new run event); a chunk failed for good → partial; convergence → partial', async () => {
    // FAULT INJECTION: the first execution of chunks 0 and 1 crashes; the retries succeed (recovery) — but they spend the budget's 5 executions with chunk 3 left
    const attempts = new Map<string, number>();
    const flaky: ChunkExecutor = async (c) => {
      const key = `${String(c['experiment_id'])}:${String(c['chunk_index'])}`;
      const n = (attempts.get(key) ?? 0) + 1; attempts.set(key, n);
      if (Number(c['chunk_index']) <= 1 && n === 1) return { ok: false, error: 'injected crash (SYNTHETIC fault)', wallMs: 5 };
      return processExecutor(c);
    };
    svc.useExecutorForTests(flaky);
    const b = await approvedAndStarted({ title: 'Budget-bound (SYNTHETIC)', pace: { chunks_per_tick: 10 } }, { max_chunks: 5 });
    const B = String(b['experiment_id']);
    const drain = await tick();
    expect((drain['steps'] as Row[]).map((s) => [s['step'], s['chunk_index'] ?? null, s['outcome']])).toEqual([
      ['chunk', 0, 'failed'], ['chunk', 0, 'done'], ['chunk', 1, 'failed'], ['chunk', 1, 'done'], ['chunk', 2, 'done'], ['finish', null, 'partial']]);
    const eb = await read(B);
    expect(eb['state']).toBe('partial');
    expect(await events(B)).toEqual(['declared', 'approved', 'started', 'run_opened', 'chunk_failed', 'checkpointed', 'chunk_failed', 'checkpointed', 'checkpointed', 'budget_exceeded', 'partial']);
    const run = await runRow(String(eb['run_id']));
    expect(run['state']).toBe('partial');
    expect(run['partial']).toMatchObject({ reason: 'budget_exceeded', completed_paths: 750, declared_paths: 1000, missing_paths: [{ chunk_index: 3, from_path: 750, to_path: 999 }],
      decision_use: 'diagnostic only: a partial run is never decision-active' });
    expect((obj(run['partial'])['missing_outputs'] as string[])[0]).toBe('stochastic.sample_totals for 250 of 1000 declared paths');
    expect((obj(obj(run['outputs'])['stochastic'])['sample_totals'] as unknown[]).length).toBe(750);
    expect(run['header_digest']).toBeNull();
    expect(await runEvents(String(eb['run_id']))).toEqual(['run.opened']);
    const budgetItems = await items('simulation.budget', B);
    expect(budgetItems.map((x) => [obj(x['details'])['kind'], x['owner'], x['state']])).toEqual([['approval_requested', null, 'closed'], ['budget_exceeded', nakamura.principalId, 'open']]);
    // A CHUNK THAT FAILS FOR GOOD (three attempts): partial (chunk_failed) over the chunk done
    svc.useExecutorForTests(async (c) => (Number(c['chunk_index']) === 1 ? { ok: false, error: 'injected permanent fault (SYNTHETIC)', wallMs: 3 } : processExecutor(c)));
    const f = await approvedAndStarted({ title: 'Chunk fails for good (SYNTHETIC)', paths: 500, chunkSize: 250, pace: { chunks_per_tick: 10 } });
    await tick();
    const ef = await read(String(f['experiment_id']));
    expect(ef['state']).toBe('partial');
    expect((ef['chunks'] as Row[]).map((c) => [c['state'], c['attempts']])).toEqual([['done', 1], ['failed', 3]]);
    expect((await runRow(String(ef['run_id'])))['partial']).toMatchObject({ reason: 'chunk_failed', completed_paths: 250 });
    // CONVERGENCE before the declared paths: partial (converged) — the declared stop condition
    svc.useExecutorForTests(null);
    const c = await approvedAndStarted({ title: 'Converges early (SYNTHETIC)', paths: 400, chunkSize: 100, pace: { chunks_per_tick: 10 },
      stopConditions: { converged: { measure: 'line_stop_days', ci_half_width: 1000, min_paths: 100 } } });
    await tick();
    const ec = await read(String(c['experiment_id']));
    expect(ec['state']).toBe('partial');
    expect(await events(String(c['experiment_id']))).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'converged', 'partial']);
    expect((await runRow(String(ec['run_id'])))['partial']).toMatchObject({ reason: 'converged', completed_paths: 100, declared_paths: 400 });
    sixEvidence('O5', { budget_bound: B, chunk_failed: f['experiment_id'], converged: c['experiment_id'], fault: 'injected through useExecutorForTests (test runtime only)' });
  }, 600_000);

  it('O6 · A WORKER LOST MID-CHUNK: the late record fenced (stale); the lapsed lease reclaimed with the next attempt; the experiment completes', async () => {
    let first = true;
    svc.useExecutorForTests(async (c) => {
      const out = await processExecutor(c);
      if (first) {
        first = false;
        // STATED SUPERUSER MOVE: another worker reclaimed this chunk meanwhile (its attempt advanced, its lease fresh)
        await sql`update simulation.experiment_chunks set attempts = attempts + 1, started_at = clock_timestamp() where experiment_id = ${String(c['experiment_id'])}::uuid and chunk_index = ${Number(c['chunk_index'])}`.execute(h.su);
      }
      return out;
    });
    const x = await approvedAndStarted({ title: 'Lost mid-chunk (SYNTHETIC)', paths: 500, chunkSize: 250, pace: { chunks_per_tick: 10 } });
    const X = String(x['experiment_id']);
    const d1 = await tick();
    expect((d1['steps'] as Row[])[0]).toMatchObject({ step: 'record', chunk_index: 0 });
    expect(String((d1['steps'] as Row[])[0]?.['error'])).toMatch(/experiment rejected \(stale\): chunk 0 .* is running at attempt 2 \(this record is attempt 1/);
    // the lease still live: the next tick takes chunk 1 and leaves chunk 0 alone
    svc.useExecutorForTests(null);
    const d2 = await tick();
    expect((d2['steps'] as Row[]).map((s) => [s['step'], s['chunk_index']])).toEqual([['chunk', 1]]);
    // STATED SUPERUSER MOVE: the lease lapses (started_at moved back past 300 s); the next tick reclaims chunk 0 (attempt 3) and finishes
    await sql`update simulation.experiment_chunks set started_at = clock_timestamp() - interval '10 minutes' where experiment_id = ${X}::uuid and chunk_index = 0`.execute(h.su);
    const d3 = await tick();
    expect((d3['steps'] as Row[]).map((s) => [s['step'], s['chunk_index'] ?? null, s['outcome']])).toEqual([['chunk', 0, 'done'], ['finish', null, 'completed']]);
    const ex = await read(X);
    expect(ex['state']).toBe('completed');
    expect((ex['chunks'] as Row[])[0]).toMatchObject({ state: 'done', attempts: 3 });
    expect(await events(X)).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'chunk_reclaimed', 'checkpointed', 'completed']);
    sixEvidence('O6', { experiment: X, fenced: 'attempt 1 refused stale', reclaimed: 'attempt 3' });
  }, 300_000);

  it('O7 · CAPACITY AND CANCEL: a third concurrent experiment refused and admitted once a slot frees; a cancellation leaves the run partial (or failed when none ran); refusals', async () => {
    const one = await approvedAndStarted({ title: 'Slot one (SYNTHETIC)', paths: 500, chunkSize: 250 });
    const two = await approvedAndStarted({ title: 'Slot two (SYNTHETIC)', paths: 500, chunkSize: 250 });
    const third = (await declare(declaration({ title: 'Slot three (SYNTHETIC)', paths: 500, chunkSize: 250 }))).experiment;
    await approve(String(third['experiment_id']), String(third['budget_digest']));
    await refused(start(String(third['experiment_id'])), /experiment rejected \(admission\): .* capacity: 2 of 2 concurrent experiments/, 409);
    // slot two paused (nothing runs on it); one chunk of slot one — pace 1
    await pause(String(two['experiment_id']));
    await tick();
    expect(obj((await read(String(one['experiment_id'])))['progress'])['paths_done']).toBe(250);
    // CANCEL refusals: an unrelated operator (403); then Nakamura cancels — the run PARTIAL over chunk 0 (reason cancelled)
    await refused(cancel(String(one['experiment_id']), 'an unrelated cancellation', operator2), /experiment rejected \(authority\): cancelling/, 403);
    const c1 = (await cancel(String(one['experiment_id']))).experiment;
    expect(c1['state']).toBe('cancelled');
    const r1 = await runRow(String(c1['run_id']));
    expect(r1['state']).toBe('partial');
    expect(r1['partial']).toMatchObject({ reason: 'cancelled', completed_paths: 250, declared_paths: 500, cancellation: 'superseded by a wider experiment' });
    expect((c1['chunks'] as Row[]).map((c) => c['state'])).toEqual(['done', 'failed']);
    await refused(cancel(String(one['experiment_id'])), /experiment rejected \(state\)/, 409);
    // RECOVERY: the slot is free — the third starts
    expect((await start(String(third['experiment_id']))).experiment['state']).toBe('running');
    // a started experiment with no chunk done: the run FAILED (run.failed); a declared one: no run
    const c2 = (await cancel(String(two['experiment_id']))).experiment;
    expect((await runRow(String(c2['run_id'])))['state']).toBe('failed');
    expect(await runEvents(String(c2['run_id']))).toEqual(['run.opened', 'run.failed']);
    const c3 = (await cancel(String(third['experiment_id']))).experiment;
    expect(c3['state']).toBe('cancelled');
    const declaredOnly = (await declare(declaration({ title: 'Never approved (SYNTHETIC)' }))).experiment;
    const c4 = (await cancel(String(declaredOnly['experiment_id']))).experiment;
    expect(c4).toMatchObject({ state: 'cancelled', run_id: null, manifest: null });
    sixEvidence('O7', { capacity_refused: third['experiment_id'], cancelled_partial: one['experiment_id'], cancelled_failed: two['experiment_id'] });
  }, 300_000);

  it('O8 · READS: the list and the read to an analyst; a principal without a reading role refused', async () => {
    const all = (await list(analyst)).experiments;
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all.find((x) => x['experiment_id'] === MAIN)).toMatchObject({ state: 'completed', run: { run_id: MAIN_RUN, state: 'completed' } });
    const e = await read(MAIN, analyst);
    expect(e['budget_use']).toEqual({ paths: { done: 5000, declared: 5000, approved_max: 5000 }, wall_seconds: { used: expect.any(Number), approved_max: 900 }, chunk_executions: { used: 10, approved_max: 14 } });
    expect(e['executor']).toEqual({ kind: 'attention agent (after its tick)', active: true });
    expect(e['synthetic']).toBe(true);
    await refused(read(MAIN, outsider), /./, 403);
    await refused(read(uuidv7()), /experiment rejected \(unknown_experiment\)/, 404);
  }, 120_000);
});
