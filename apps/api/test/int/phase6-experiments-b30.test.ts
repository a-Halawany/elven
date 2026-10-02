/**
 * CP-6 B30 part `experiments` (0103 §EX) — the B30 carryovers of F-P5-06 and F-P5-07, through the real database and controllers: the decision
 * world of phase6-fixtures (the corridor twin, its control and intervention runs, a package citing them), a Regensburg-like PLANT twin bound
 * to the method fabric's seeded methods (phase6-methods-fixtures), the domain's ATTENTION AGENT as the background worker (B31's after-tick
 * hook, driven by the timer's tickNow — never by sleeping), the fabric chunk executor a SEPARATE PROCESS from the built tree (dist). Every
 * figure is SYNTHETIC.
 *
 *   X1 · CHUNKED METHOD-FABRIC EXPERIMENTS (L8-C06, PR-35-001): a discrete-event@1 experiment in chunks, each path one execution of the
 *        adapter with its per-path seed, executed out of process and COMPLETED; each chunk's paths recomputed in this process from the
 *        stored contract and its seed offset — the same digest (deterministic per seed offset). REFUSALS: a measure the method does not
 *        project, a method that is not chunkable, a contract its adapter refuses (the experiment fails at start — fail-closed).
 *        RECOVERY: a war-gaming@1 experiment (a random adversary) whose first chunk attempt crashes is retried and completes.
 *   X2 · THE CHECKPOINT INDICATORS ACTED ON (V03-T-354, ES-38-007/-009, V04-T-034): under `stop` an unstable checkpoint STOPS the experiment
 *        (partial, reason unstable); under `pause` it PAUSES it and an operator resumes it; a FAULT-SHAPED instability (the mean diverging)
 *        QUARANTINES the contained adapter and stops; every one a review ROUTED (simulation.checkpoint → the declarer, the method stewards).
 *        Under the default `none` nothing is acted on — B31's ledger. REFUSALS: the policy after approval, an unknown policy, an unrelated
 *        operator; the steward's quarantine of an in-process method, of a quarantined adapter, of an unknown model, by a non-steward.
 *        RECOVERY: a probe and a steward's reinstatement; a steward's on-demand quarantine recovered the same way.
 *   X3 · RETIREMENT (PR-35-001): a run retired with its REASON, its superseding run and its REACH (the package citing it, the intervention
 *        runs comparing against it, the sensitivity analysis resting on it), the package's owner told; an experiment retired with its run.
 *        REFUSALS: twice, unknown, an unrelated operator, a short reason, superseded by itself, an unfinished run or experiment; the retired
 *        run no longer analysed, swept, validated nor taken as a control. RECOVERY: the superseding run analysed and compared against.
 *   X4 · NONLINEAR RESPONSE ACROSS THE ENVELOPE (V02-T-167): the corridor control swept across supply-flow@1's operating envelope — the
 *        response curves, the corridor delay's threshold, the two-factor interactions; the port recomputes. REFUSALS: a forged
 *        nonlinearity, a range that is not the envelope, a missing pair, a fabric run, a partial run, a reader without the role.
 *        RECOVERY: the honest sweep recorded, the same digest twice.
 *   X5 · RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION, CONVERGENCE (AI-50-004): a seeded run's paths against a benchmark sample
 *        (consistent, converged) and an observed sample citing its evidence (discrepant: the rare-event tail under-represented). REFUSALS:
 *        an observed sample without citations, an unknown citation, a forged bias, a measure the run does not carry. RECOVERY: the honest
 *        validation recorded.
 *   X6 · READS: the fabric overview and a run's retirement to an analyst; a principal without a reading role refused at the PDP.
 *
 * Stated: the fabric chunk executor is a separate process on this host; the harness's executor DOUBLES (X1c's crash, X2's crafted path
 * values) are the test runtime's (useExecutorForTests) — they substitute the chunk's computation, never a port; the observed sample of X5
 * is entered with its evidence cited (no external benchmark feed is integrated).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { OrchestrationController } from '../../src/twin/simulations/orchestration/orchestration.controller.js';
import { OrchestrationService, productExecutor, type ChunkExecutor } from '../../src/twin/simulations/orchestration/orchestration.service.js';
import { MethodsController } from '../../src/twin/methods/methods.controller.js';
import { ImpactController } from '../../src/twin/simulations/impact/impact.controller.js';
import { FabricController } from '../../src/twin/simulations/fabric/fabric.controller.js';
import { FabricCapability } from '../../src/twin/simulations/fabric/fabric.capabilities.js';
import { builtinMethod } from '../../src/twin/methods/builtin.js';
import { methodInputOf } from '../../src/twin/simulations/simulation.service.js';
import { digestOfJson, fabricChunkPaths, pathSeed } from '../../src/twin/simulations/fabric/fabric-plan.js';
import { Phase4Harness } from './phase4-helpers.js';
import { cite, completeElements } from './phase5-fixtures.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { BEARING, FAMILY_ELEMENTS, LINE_ELEMENTS, SHORTAGE } from './phase6-methods-fixtures.js';

// this file's own vault roots (h.upload uploads through the governed path)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b30-x-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let twins: TwinController; let exec: ExecutiveController; let orch: OrchestrationController; let svc: OrchestrationService; let timer: AttentionTimerService;
let methods: MethodsController; let impact: ImpactController; let fabric: FabricController; let pipeline: PipelineService;
/** T. Nakamura (twin owner, run operator: declares, starts, retires), J. Weber (approves budgets), H. Petrović (the method steward). */
let nakamura: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let operator2: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let execOwner: AuthenticatedPrincipal;
let plantId = ''; let pv1 = 0; let agentId = ''; let day = 0;
/** What the cases leave one another. */
let DES_EXP = ''; let DES_RUN = ''; let WG_RUN = ''; let STOP_RUN = ''; let PAUSE_RUN = ''; let SWEEP_RUN = ''; let SEEDED_RUN = ''; let PKG = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const JITTER = { '0': 0.5, '3': 0.3, '7': 0.2 };

/* ───────────── refusals (the B21/B31 idiom) ───────────── */
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
const evidence = (id: string, e: Row) => { console.log(`B30-EX EVIDENCE ${id} ${JSON.stringify(e)}`); };

/* ───────────── the routes (in process) ───────────── */
const X = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'simulation');
const declare = (payload: Row, as = nakamura) => orch.declare(X(as, 'simulation.experiment.declare', 'SXP'), T(), D(), { payload }) as Promise<{ experiment: Row }>;
const approve = (id: string, budgetDigest: string, as = weber) => orch.approve(X(as, 'simulation.experiment.approve', 'SXP', id), T(), D(), id, { payload: { budgetDigest, note: 'proportionate for the study (SYNTHETIC)' } }) as Promise<{ experiment: Row }>;
const start = (id: string, as = nakamura) => orch.start(X(as, 'simulation.experiment.start', 'SXP', id), T(), D(), id) as Promise<{ experiment: Row }>;
const resume = (id: string, as = nakamura) => orch.resume(X(as, 'simulation.experiment.resume', 'SXP', id), T(), D(), id, { payload: { reason: 'the checkpoint was reviewed' } }) as Promise<{ experiment: Row }>;
const cancel = (id: string, as = nakamura) => orch.cancel(X(as, 'simulation.experiment.cancel', 'SXP', id), T(), D(), id, { payload: { reason: 'not needed after the review' } }) as Promise<{ experiment: Row }>;
const readExp = (id: string) => orch.read(X(nakamura, 'simulation.experiment.read', 'SXP', id), T(), D(), id).then((r) => (r as unknown as { experiment: Row }).experiment);
const policy = (id: string, p: string, as = nakamura, reason = 'the study stops on an unstable checkpoint') =>
  fabric.policy(X(as, 'simulation.experiment.policy', 'SXP', id), T(), D(), id, { payload: { policy: p, reason } }) as Promise<{ experiment: Row }>;
const quarantine = (modelRef: string, as = steward, runId: string | null = null, reason = 'the solver diverged in the review') =>
  fabric.quarantine(X(as, 'simulation.adapter.quarantine', 'SIM', runId), T(), D(), { payload: { modelRef, runId, reason } }) as Promise<{ adapter: Row }>;
const retireRun = (runId: string, payload: Row, as = nakamura) => fabric.retireRun(X(as, 'simulation.retirement.run', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ retirement: Row }>;
const retireExp = (id: string, reason: string, as = nakamura) => fabric.retireExperiment(X(as, 'simulation.retirement.experiment', 'SXP', id), T(), D(), id, { payload: { reason } }) as Promise<{ retirement: Row }>;
const sweep = (runId: string, payload: Row = {}, as = nakamura) => fabric.sweep(X(as, 'simulation.sweep.run', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ sweep: Row }>;
const bench = (runId: string, payload: Row, as = nakamura) => fabric.benchmark(X(as, 'simulation.benchmark.validate', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ validation: Row }>;
const overview = (as = analyst) => fabric.list(X(as, 'simulation.fabric.read', 'SXP'), T(), D(), { payload: {} }) as Promise<Row>;
const runRead = (runId: string, as = analyst) => fabric.readRun(X(as, 'simulation.fabric.read', 'SIM', runId), T(), D(), runId) as Promise<{ run: Row }>;
const run = (payload: Row, as = nakamura) => twins.run(h.req(as, 'simulation.run', 'SIM', null), T(), D(), { payload }) as Promise<{ run: Row }>;
const corridor = (over: Row = {}) => ({ twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90,
                                        stochastic: { mode: 'deterministic' }, ...over });
const sensitivity = (runId: string, as = nakamura) => impact.sensitivity(X(as, 'simulation.impact.sensitivity', 'SIM', runId), T(), D(), runId, { payload: { metric: 'total_cost', relative: 0.2 } }) as Promise<{ analysis: Row }>;
const probe = (modelRef: string) => methods.probe(h.req(steward, 'simulation.adapter.probe', 'SIM', null), T(), D(), { payload: { modelRef } }) as Promise<{ probe: Row }>;
const reinstate = (modelRef: string, as = steward) => methods.reinstate(h.req(as, 'simulation.adapter.reinstate', 'SIM', null), T(), D(), { payload: { modelRef, reason: 'the probe passed after the review' } }) as Promise<{ adapter: Row }>;
/** A port call with a hand-built handler through the REAL pipeline (the PDP, the capability, the audit) — the port's own refusal proven. */
const forged = <C>(as: AuthenticatedPrincipal, action: string, runId: string, factory: (tx: never, action: string) => C, call: (cap: C) => Promise<Row>) =>
  pipeline.write(h.env(as, action, 'SIM', runId, 'simulation'), as, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SIM', objectId: runId }, factory as never,
    async (cap: C) => ({ result: await call(cap), targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));

/* ───────────── the rows ───────────── */
const runRow = async (id: string) => (await rows(sql`select * from simulation.runs_current where run_id = ${id}::uuid`))[0] as Row;
const events = async (id: string) => (await rows(sql`select event from simulation.experiment_events where experiment_id = ${id}::uuid order by occurred_at, event_id`)).map((e) => String(e['event']));
const runEvents = async (id: string) => (await rows(sql`select event from simulation.run_events where run_id = ${id}::uuid order by occurred_at, event_id`)).map((e) => String(e['event']));
const items = async (cls: string, subject: string) => rows(sql`select item_id::text, owner_principal_id::text as owner, route_roles, state, title, details, subject_kind from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);
const health = async (modelRef: string) => (await rows(sql`select * from simulation.adapter_health where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and model_ref = ${modelRef}`))[0] as Row | undefined;

/** One attention tick (its own day); answers the worker's drain from the after-tick hook. */
const tick = async (): Promise<Row> => {
  day += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2038, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const drain = obj(obj(obj(t.run?.outputs)['after'])['simulation-experiments']);
  expect(drain['error'], String(drain['error'])).toBeUndefined();
  return drain;
};

/* ───────────── the declarations (SYNTHETIC) ───────────── */
const BUDGET = { max_paths: 1000, max_wall_seconds: 600, max_chunks: 12 };
const desDeclaration = (over: Row = {}, params: Row = {}) => ({
  title: 'Regensburg line — bearing shortage, 60 paths (SYNTHETIC)', question: 'How many line-stop days does the bearing shortage cost across cycle-time variation?',
  run: { twinId: plantId, twinVersion: pv1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 14,
         modelRef: 'discrete-event@1', params: { start_date: '2026-10-05', shortage: SHORTAGE, ...params } },
  paths: 60, chunkSize: 20, seed: 31, pace: { chunks_per_tick: 3 }, budget: BUDGET, ...over,
});
const wgDeclaration = (over: Row = {}) => ({
  title: 'Corridor war game — random adversary, 40 paths (SYNTHETIC)', question: 'What does the plan leave unmitigated against a random adversary, in k€?',
  run: { twinId: plantId, twinVersion: pv1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 6,
         modelRef: 'war-gaming@1', params: { turns: 6, adversary: 'random', tolerance: 900 } },
  paths: 40, chunkSize: 20, seed: 29, pace: { chunks_per_tick: 2 }, budget: BUDGET, ...over,
});
const sfDeclaration = (over: Row = {}) => ({
  title: 'Corridor closure — checkpoint study (SYNTHETIC)', question: 'Does the total cost settle across lead-time jitter before the budget runs out?',
  run: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90 },
  paths: 100, chunkSize: 50, seed: 41, jitter: JITTER, measures: ['total_cost'], budget: BUDGET, ...over,
});
const declared = async (d: Row, policyOf: string | null = null) => {
  const e = (await declare(d)).experiment;
  const id = String(e['experiment_id']);
  if (policyOf !== null) await policy(id, policyOf);
  await approve(id, String(e['budget_digest']));
  return id;
};

/* ───────────── the executor doubles (the test runtime's; never a port) ───────────── */
/** supply-flow@1 paths whose total cost is the given values (the Totals shape the port aggregates). */
const sfTotals = (values: number[]) => values.map((v) => ({ line_stop_days: 0, days_below_safety_stock: 0, min_on_hand: '0', first_line_stop_date: null, cost: { reroute: '0', air: '0', line_stop: '0', total: v.toFixed(2) } }));
/** fabric paths whose projected line-stop days are the given values. */
const fabricTotals = (seed: number, first: number, values: number[]) => values.map((v, i) => ({ path: first + i, seed: pathSeed(seed, first + i), line_stop_days: v, summary: {} }));
const double = (byChunk: (chunkIndex: number, claimed: Row) => unknown[]): ChunkExecutor => async (claimed) => {
  const totals = byChunk(Number(claimed['chunk_index']), claimed);
  return { ok: true, sampleTotals: totals as never, digest: digestOfJson(totals), wallMs: 5, pid: null };
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  twins = w.twins; exec = w.exec;
  orch = h.app.get(OrchestrationController); svc = h.app.get(OrchestrationService); timer = h.app.get(AttentionTimerService);
  methods = h.app.get(MethodsController); impact = h.app.get(ImpactController); fabric = h.app.get(FabricController); pipeline = h.app.get(PipelineService);
  nakamura = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b30x-nakamura');
  weber = await h.humanWithSession(['strategy_owner'], 'b30x-weber');
  steward = await h.humanWithSession(['method_steward'], 'b30x-petrovic');
  operator2 = await h.humanWithSession(['simulation_operator'], 'b30x-operator2');
  analyst = await h.humanWithSession(['domain_analyst'], 'b30x-analyst');
  outsider = await h.humanWithSession(['decision_approver'], 'b30x-outsider');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b30x-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b30x-dadmin');
  execOwner = await h.humanWithSession(['executive'], 'b30x-executive');
  // THE PLANT TWIN (SYNTHETIC): the magnet chain's records and the Regensburg-like line and every family's elements, ASSUMED, citing the terms
  const assumed = (e: { key: string; value: unknown; unit: string | null }) => ({ key: e.key, kind: 'assumed', value: e.value, unit: e.unit ?? undefined, citations: [cite(w.records.terms)] });
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Regensburg plant', 'regensburg plant', 'active', ${nakamura.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(nakamura, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Regensburg plant (B30 experiments harness)',
    statement: 'the Regensburg assembly line and its bearing supply', boundary: [entityId], owner: nakamura.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['working time only on the line'] } } }) as { twin: { twinId: string } };
  plantId = d.twin.twinId;
  const o = await twins.openVersion(h.req(nakamura, 'twin.version', 'TWN', plantId), T(), D(), plantId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(nakamura, 'twin.ground', 'TWN', plantId), T(), D(), plantId, String(o.version.version), { payload: { elements: [...completeElements(w.records), ...LINE_ELEMENTS.map(assumed), ...FAMILY_ELEMENTS.map(assumed)] } });
  await twins.admit(h.req(nakamura, 'twin.version.admit', 'TWN', plantId), T(), D(), plantId, String(o.version.version), { payload: {} });
  pv1 = o.version.version;
  for (const m of ['discrete-event@1', 'war-gaming@1', 'counterfactual@1']) {
    await methods.bind(h.req(nakamura, 'simulation.method.bind', 'TWN', plantId), T(), D(), { payload: { twinId: plantId, modelRef: m, reason: 'the Regensburg line study (B30 experiments)' } });
  }
  // THE ATTENTION AGENT: the background worker's principal (the scheduler is off: the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: execOwner.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
}, 600_000);

afterAll(async () => { svc?.useExecutorForTests(null); await h?.close(); }, 120_000);

describe('B30 experiments · X1 chunked method-fabric experiments (F-P5-06: L8-C06, PR-35-001)', () => {
  it('X1a · POSITIVE: a discrete-event@1 experiment in chunks — each path one seeded execution, out of process — COMPLETED; every chunk recomputed here from its seed offset to the same digest', async () => {
    svc.useExecutorForTests(null);
    expect((await rows(sql`select count(*)::int n from simulation.experiments where tenant_id = ${T()}::uuid`))[0]?.['n']).toBe(0);
    const d = (await declare(desDeclaration())).experiment;
    DES_EXP = String(d['experiment_id']);
    expect(d).toMatchObject({ method_ref: 'discrete-event@1', measures: ['line_stop_days'], jitter: { '0': 1 }, on_unstable: 'none' });
    await approve(DES_EXP, String(d['budget_digest']));
    const s = (await start(DES_EXP)).experiment;
    expect(s['state']).toBe('running');
    expect(obj(s['admission'])).toMatchObject({ admitted: true, deterministic: true, chunks: 3 });
    DES_RUN = String(s['run_id']);
    expect(await runRow(DES_RUN)).toMatchObject({ state: 'opened', model_ref: 'discrete-event@1', stochastic_mode: 'seeded', samples: 60, implementation_digest: builtinMethod('discrete-event@1')!.adapter.digest });
    const drain = await tick();
    expect(drain['chunks'], JSON.stringify(drain['steps'])).toBe(3);
    const e = await readExp(DES_EXP);
    expect(e['state'], JSON.stringify(drain['steps'])).toBe('completed');
    expect(await events(DES_EXP)).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'checkpointed', 'checkpointed', 'completed']);
    const r = await runRow(DES_RUN);
    expect(r['state']).toBe('completed');
    const out = obj(r['outputs']);
    expect(out).toMatchObject({ method_ref: 'discrete-event@1', rule: 'fabric-measures@1', projection: [{ measure: 'line_stop_days', from: 'summary.line_stop_days', unit: 'days' }] });
    const paths = obj(out['stochastic'])['sample_totals'] as Row[];
    expect(paths.map((p) => p['path'])).toEqual(Array.from({ length: 60 }, (_, i) => i));
    expect(paths.every((p) => p['seed'] === pathSeed(31, Number(p['path'])))).toBe(true);
    // DETERMINISTIC PER SEED OFFSET: each chunk the separate process ran is recomputed HERE from the stored contract and its offset — the same digest
    const des = builtinMethod('discrete-event@1')!.adapter;
    for (const ch of (e['chunks'] as Row[])) {
      const again = fabricChunkPaths(des, methodInputOf(r), Number(r['seed']), Number(ch['first_path']), Number(ch['paths']), Number(r['samples']));
      expect(digestOfJson(again)).toBe(ch['digest']);
    }
    expect([...await runEvents(DES_RUN)].sort()).toEqual(['constraint.checked', 'run.completed', 'run.opened']);
    expect(obj(e['manifest'])['chunks']).toHaveLength(3);
    expect(new Set(paths.map((p) => JSON.stringify(p['summary']))).size).toBeGreaterThan(1);
    evidence('X1a', { experiment: DES_EXP, run: DES_RUN, chunks: (e['chunks'] as Row[]).map((x) => x['digest']), mean_line_stop_days: obj(out['totals'])['line_stop_days'] });
  }, 600_000);

  it('X1b · REFUSAL: a measure the method does not project, a method that is not chunkable (422 at the declaration); a contract its adapter refuses FAILS the experiment at start', async () => {
    await refused(declare(desDeclaration({ measures: ['total_cost'] })), /experiment rejected \(declaration\): the measures of a discrete-event@1 experiment are among those it projects \(line_stop_days/, 422);
    await refused(declare({ ...desDeclaration(), run: { ...(desDeclaration().run as Row), modelRef: 'system-dynamics@1' }, jitter: { '0': 1 } }),
      /experiment rejected \(declaration\): a method-fabric run \(params\) is chunkable only for discrete-event@1, counterfactual@1, war-gaming@1/, 422);
    // the adapter's own rule refuses the contract at opening (a shortage window with a negative start): the experiment fails, the declarer told
    const bad = await declared(desDeclaration({ title: 'Malformed line contract (SYNTHETIC)' }, { shortage: { start_day: -1, days: 3, fraction: 0.5 } }));
    await refused(start(bad), /discrete-event@1 contract invalid: params\.shortage/, 422);
    expect((await readExp(bad))['state']).toBe('failed');
    expect(await events(bad)).toEqual(['declared', 'approved', 'started', 'failed']);
    expect((await items('simulation.experiment', bad))[0]).toMatchObject({ owner: nakamura.principalId, state: 'open' });
    evidence('X1b', { failed_at_start: bad });
  }, 300_000);

  it('X1c · RECOVERY: a war-gaming@1 experiment (a random adversary) whose first chunk attempt crashes is retried and completes with distinct paths', async () => {
    let crashed = false;
    svc.useExecutorForTests(async (claimed) => {
      if (!crashed) { crashed = true; return { ok: false, error: 'the chunk\'s process ended abnormally (SIGSEGV) — injected', wallMs: 3 }; }
      return productExecutor(claimed);
    });
    const id = await declared(wgDeclaration());
    WG_RUN = String((await start(id)).experiment['run_id']);
    await tick();
    let e = await readExp(id);
    if (e['state'] !== 'completed') { await tick(); e = await readExp(id); }
    expect(e['state']).toBe('completed');
    expect(await events(id)).toEqual(['declared', 'approved', 'started', 'run_opened', 'chunk_failed', 'checkpointed', 'checkpointed', 'completed']);
    const paths = obj(obj(obj((await runRow(WG_RUN))['outputs'])['stochastic']))['sample_totals'] as Row[];
    expect(paths).toHaveLength(40);
    expect(new Set(paths.map((p) => obj(p['cost'])['total'])).size).toBeGreaterThan(1);
    svc.useExecutorForTests(null);
    evidence('X1c', { experiment: id, run: WG_RUN });
  }, 300_000);
});

describe('B30 experiments · X2 the checkpoint indicators acted on (V03-T-354, ES-38-007/-009, V04-T-034)', () => {
  it('X2a · POSITIVE (stop): an unstable checkpoint STOPS the experiment — partial, reason unstable — and the review is routed to the declarer and the method stewards', async () => {
    // chunk 0: the total cost alternating 0 and 1,000,000 (a wildly unstable mean)
    svc.useExecutorForTests(double((i) => sfTotals(Array.from({ length: 50 }, (_, k) => (k % 2 === 0 ? 0 : 1_000_000 + i)))));
    const id = await declared(sfDeclaration({ title: 'Checkpoint study — stop (SYNTHETIC)' }), 'stop');
    expect((await readExp(id))['on_unstable']).toBe('stop');
    STOP_RUN = String((await start(id)).experiment['run_id']);
    await tick();
    const e = await readExp(id);
    expect(e['state']).toBe('partial');
    expect(await events(id)).toEqual(['declared', 'policy_set', 'approved', 'started', 'run_opened', 'checkpointed', 'stopped_unstable', 'review_routed', 'partial']);
    expect(obj(e['outcome'])).toMatchObject({ outcome: 'partial', reason: 'unstable', completed_paths: 50, declared_paths: 100 });
    expect(await runRow(STOP_RUN)).toMatchObject({ state: 'partial' });
    const review = await items('simulation.checkpoint', id);
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ owner: nakamura.principalId, route_roles: ['method_steward'], state: 'open', subject_kind: 'experiment' });
    expect(obj(review[0]?.['details'])).toMatchObject({ kind: 'checkpoint_unstable', seq: 1, policy: 'stop', actions: ['stopped'] });
    expect((obj(obj(review[0]?.['details'])['reading'])['unstable_measures'])).toEqual(['total_cost']);
    svc.useExecutorForTests(null);
    evidence('X2a', { experiment: id, run: STOP_RUN, review: review[0]?.['item_id'] });
  }, 300_000);

  it('X2b · POSITIVE (pause) and RECOVERY: an unstable checkpoint PAUSES it (a tick runs nothing); resumed, the next checkpoint is stable and it completes', async () => {
    // chunk 0: 80 / 120 alternating (a 5.6% half-width: unstable); chunk 1: 100 throughout (the running half-width 2.8%, the mean unmoved: stable)
    svc.useExecutorForTests(double((i) => sfTotals(Array.from({ length: 50 }, (_, k) => (i === 0 ? (k % 2 === 0 ? 80 : 120) : 100)))));
    const id = await declared(sfDeclaration({ title: 'Checkpoint study — pause (SYNTHETIC)' }), 'pause');
    PAUSE_RUN = String((await start(id)).experiment['run_id']);
    await tick();
    expect((await readExp(id))['state']).toBe('paused');
    expect((await tick())['chunks']).toBe(0);
    expect((await resume(id)).experiment['state']).toBe('running');
    await tick();
    const e = await readExp(id);
    expect(e['state']).toBe('completed');
    expect(await events(id)).toEqual(['declared', 'policy_set', 'approved', 'started', 'run_opened', 'checkpointed', 'paused_unstable', 'review_routed', 'resumed', 'checkpointed', 'completed']);
    expect(obj(obj(obj(e['indicators'])['numerical_stability'])['total_cost'])['state']).toBe('stable');
    expect((await items('simulation.checkpoint', id))[0]).toMatchObject({ state: 'open' });
    svc.useExecutorForTests(null);
    evidence('X2b', { experiment: id, run: PAUSE_RUN });
  }, 300_000);

  it('X2c · POSITIVE (fault-shaped): a diverging mean QUARANTINES the contained adapter and stops the experiment (under pause); a new run of the method is refused', async () => {
    // chunk 0: 5 line-stop days on every path (stable); chunk 1: 50 (the mean moves 450% after 40 paths — a solver diverging); chunk 2 never runs
    svc.useExecutorForTests(double((i, cl) => fabricTotals(31, Number(cl['first_path']), Array.from({ length: 40 }, () => (i === 0 ? 5 : 50)))));
    const id = await declared(desDeclaration({ title: 'Line study — diverging (SYNTHETIC)', paths: 120, chunkSize: 40, pace: { chunks_per_tick: 3 } }), 'pause');
    const runId = String((await start(id)).experiment['run_id']);
    await tick();
    const e = await readExp(id);
    expect(e['state']).toBe('partial');
    expect(await events(id)).toEqual(['declared', 'policy_set', 'approved', 'started', 'run_opened', 'checkpointed', 'checkpointed', 'adapter_quarantined', 'stopped_unstable', 'review_routed', 'partial']);
    expect(await health('discrete-event@1')).toMatchObject({ state: 'quarantined', quarantined_by_run: runId, last_fault_operator: nakamura.principalId });
    expect(obj((await health('discrete-event@1'))?.['last_fault'])).toMatchObject({ kind: 'unstable', experiment_id: id, checkpoint_seq: 2 });
    expect((await rows(sql`select event from simulation.adapter_events where tenant_id = ${T()}::uuid and model_ref = 'discrete-event@1' order by occurred_at`)).map((r) => r['event'])).toEqual(['quarantined']);
    expect(await runEvents(runId)).toContain('adapter.quarantined');
    expect(obj((await items('simulation.checkpoint', id))[0]?.['details'])['actions']).toEqual(['adapter_quarantined', 'stopped']);
    svc.useExecutorForTests(null);
    // a new run of the quarantined method is refused (B29's gate)
    await refused(run({ twinId: plantId, twinVersion: pv1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 7,
                        stochastic: { mode: 'seeded', seed: 3, samples: 1, jitter: {} }, modelRef: 'discrete-event@1', params: { start_date: '2026-10-05' } }), /run rejected \(quarantined\)/, 409);
    evidence('X2c', { experiment: id, run: runId, adapter: 'discrete-event@1 quarantined' });
  }, 300_000);

  it('X2d · REFUSAL: the policy after approval, an unknown policy, an unrelated operator, a reader; the quarantine of an in-process method, of a quarantined adapter, of an unknown model, by a non-steward — and under `none` nothing is acted on (B31)', async () => {
    const e = (await declare(sfDeclaration({ title: 'Checkpoint study — refusals (SYNTHETIC)' }))).experiment;
    const id = String(e['experiment_id']);
    await refused(policy(id, 'halt'), /experiment rejected \(policy\): the unstable-checkpoint policy is stop, pause or none \(not halt\)/, 422);
    await refused(policy(id, 'stop', operator2), /experiment rejected \(authority\): setting the unstable-checkpoint policy of/, 403);
    await refused(policy(id, 'stop', analyst), /./, 403);
    await refused(policy(id, 'stop', nakamura, 'short'), /experiment rejected \(reason\)/, 422);
    await approve(id, String(e['budget_digest']));
    await refused(policy(id, 'stop'), /experiment rejected \(state\): experiment .* is approved; its unstable-checkpoint policy is set while it is declared/, 409);
    // under the DEFAULT policy the same unstable chunk is recorded, not acted on: B31's ledger
    svc.useExecutorForTests(double(() => sfTotals(Array.from({ length: 50 }, (_, k) => (k % 2 === 0 ? 0 : 1_000_000)))));
    await start(id);
    await tick(); await tick();
    expect(await events(id)).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'checkpointed', 'completed']);
    expect(obj(obj(obj((await readExp(id))['indicators'])['numerical_stability'])['total_cost'])['state']).toBe('unstable');
    expect(await items('simulation.checkpoint', id)).toHaveLength(0);
    svc.useExecutorForTests(null);
    // the quarantine's refusals
    await refused(quarantine('supply-flow@1'), /adapter quarantine rejected \(not_contained\): supply-flow@1 runs in process/, 422);
    await refused(quarantine('discrete-event@1'), /adapter quarantine rejected \(state\): the adapter of discrete-event@1 is already quarantined/, 409);
    await refused(quarantine('no-such-method@1'), /adapter quarantine rejected \(unknown_model\)/, 404);
    await refused(quarantine('war-gaming@1', steward, null, 'short'), /adapter quarantine rejected \(reason\)/, 422);
    await refused(quarantine('war-gaming@1', operator2), /./, 403);
    await refused(quarantine('war-gaming@1', steward, uuidv7()), /adapter quarantine rejected \(unknown_run\)/, 404);
    evidence('X2d', { experiment: id });
  }, 300_000);

  it('X2e · RECOVERY: the quarantined adapter probed and reinstated by the method steward (never the run\'s operator); a steward\'s quarantine on demand recovered the same way', async () => {
    expect((await probe('discrete-event@1')).probe['passed']).toBe(true);
    expect((await reinstate('discrete-event@1')).adapter['state']).toBe('healthy');
    const ok = await run({ twinId: plantId, twinVersion: pv1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 7,
                           stochastic: { mode: 'seeded', seed: 3, samples: 1, jitter: {} }, modelRef: 'discrete-event@1', params: { start_date: '2026-10-05' } });
    expect(ok.run['state']).toBe('completed');
    // ON DEMAND: the steward quarantines war-gaming@1 naming the run that showed it; a run is refused; probe and reinstatement recover it
    const q = (await quarantine('war-gaming@1', steward, WG_RUN)).adapter;
    expect(q).toMatchObject({ quarantined: true, model_ref: 'war-gaming@1', cause: 'steward', run_id: WG_RUN });
    const wg = { twinId: plantId, twinVersion: pv1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 6,
                 stochastic: { mode: 'seeded', seed: 5, samples: 1, jitter: {} }, modelRef: 'war-gaming@1', params: { turns: 6, adversary: 'random', tolerance: 900 } };
    await refused(run(wg), /run rejected \(quarantined\)/, 409);
    await probe('war-gaming@1');
    await reinstate('war-gaming@1');
    expect((await run(wg)).run['state']).toBe('completed');
    expect((await rows(sql`select event from simulation.adapter_events where tenant_id = ${T()}::uuid and model_ref = 'war-gaming@1' order by occurred_at`)).map((r) => r['event'])).toEqual(['quarantined', 'probed', 'reinstated']);
    evidence('X2e', { reinstated: ['discrete-event@1', 'war-gaming@1'] });
  }, 300_000);
});

describe('B30 experiments · X3 retirement (PR-35-001)', () => {
  it('X3a · POSITIVE: the corridor control RETIRED, superseded — its reach recorded (the package citing it, the runs comparing against it, its sensitivity analysis) and the package\'s owner told', async () => {
    PKG = (await c.fullDraft()).pkg;
    await sensitivity(w.controlId);
    const r = (await retireRun(w.controlId, { reason: 'superseded by the corrected corridor control (SYNTHETIC)', supersededBy: w.control2Id })).retirement;
    expect(r).toMatchObject({ subject_kind: 'run', run_id: w.controlId, superseded_by: w.control2Id, retired_by: nakamura.principalId });
    expect(await runRow(w.controlId)).toMatchObject({ retired_by: nakamura.principalId, retire_reason: 'superseded by the corrected corridor control (SYNTHETIC)' });
    const reach = obj(r['reach']);
    expect((reach['packages'] as Row[]).map((p) => [p['package_id'], p['option_key'], p['via']])).toEqual([[PKG, 'status-quo', 'option_consequence']]);
    expect((reach['dependent_runs'] as Row[]).map((d) => d['run_id']).sort()).toEqual([w.rerouteId, w.airId].sort());
    expect((reach['dependent_runs'] as Row[]).every((d) => d['relation'] === 'control_of')).toBe(true);
    expect((obj(reach['analyses'])['sensitivity'] as unknown[])).toHaveLength(1);
    expect(obj(reach['counts'])).toMatchObject({ packages: 1, analyses: 1, dependent_runs: 2 });
    const told = await items('simulation.validity', PKG);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ owner: w.owner.principalId, state: 'open', subject_kind: 'package' });
    expect(obj(told[0]?.['details'])).toMatchObject({ kind: 'run_retired', run_id: w.controlId, superseded_by: w.control2Id });
    expect((r['notified'] as Row[]).map((n) => n['package_id'])).toEqual([PKG]);
    evidence('X3a', { run: w.controlId, package: PKG, reach: reach['counts'] });
  }, 300_000);

  it('X3b · REFUSAL: twice, unknown, an unrelated operator, a reader, a short reason, superseded by itself, an unfinished run or experiment; the retired run no longer analysed, swept, validated nor taken as a control', async () => {
    await refused(retireRun(w.controlId, { reason: 'retire it once more please' }), /retirement rejected \(state\): run .* was retired at/, 409);
    await refused(retireRun(uuidv7(), { reason: 'a run that does not exist' }), /retirement rejected \(unknown_run\)/, 404);
    await refused(retireRun(w.rerouteId, { reason: 'not mine to retire at all' }, operator2), /retirement rejected \(authority\): a run is retired by its operator/, 403);
    await refused(retireRun(w.rerouteId, { reason: 'an approver does not retire' }, outsider), /./, 403);
    await refused(retireRun(w.rerouteId, { reason: 'short' }), /retirement rejected \(reason\)/, 422);
    await refused(retireRun(w.rerouteId, { reason: 'superseded by itself (SYNTHETIC)', supersededBy: w.rerouteId }), /retirement rejected \(superseded_by\)/, 422);
    await refused(retireRun(w.rerouteId, { reason: 'superseded by a retired run (SYNTHETIC)', supersededBy: w.controlId }), /retirement rejected \(superseded_by\): .* retired/, 422);
    // an unfinished run and experiment: a started experiment's opened run
    const live = await declared(sfDeclaration({ title: 'Live experiment (SYNTHETIC)' }));
    const liveRun = String((await start(live)).experiment['run_id']);
    await refused(retireRun(liveRun, { reason: 'retiring an opened run (SYNTHETIC)' }), /retirement rejected \(state\): run .* is opened; only a finished run/, 409);
    await refused(retireExp(live, 'retiring a running experiment'), /retirement rejected \(state\): experiment .* is running; only a finished experiment/, 409);
    // RECOVERY of the live one: cancelled, then retired with its (failed) run
    await cancel(live);
    const re = (await retireExp(live, 'cancelled before any path ran (SYNTHETIC)')).retirement;
    expect(obj(re['experiment'])).toMatchObject({ state: 'retired' });
    expect(obj(obj(re['experiment'])['retirement'])).toMatchObject({ prior_state: 'cancelled', run_retired: true });
    // THE GATES on the retired control
    await refused(sensitivity(w.controlId), /impact analysis rejected \(state\): run .* was retired at .*; a retired result is not analysed/, 409);
    await refused(run(corridor({ runKind: 'intervention', controlRunId: w.controlId, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })), /run rejected \(retired_control\): control run .* was retired/, 409);
    await refused(sweep(w.controlId), /envelope sweep rejected \(state\): run .* was retired/, 409);
    await refused(bench(w.controlId, { measure: 'total_cost', kind: 'benchmark', values: [1, 2, 3, 4, 5], basis: 'a reference figure for the gate (SYNTHETIC)' }), /benchmark validation rejected \(state\): run .* was retired/, 409);
    evidence('X3b', { refused: 14 });
  }, 300_000);

  it('X3c · RECOVERY: the superseding control analysed and compared against; the completed fabric experiment retired with its run (its ledger: retired)', async () => {
    expect((await sensitivity(w.control2Id)).analysis['run_id']).toBe(w.control2Id);
    const iv = await run(corridor({ shock: false, runKind: 'intervention', controlRunId: w.control2Id, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] }));
    expect(iv.run['state']).toBe('completed');
    const r = (await retireExp(DES_EXP, 'superseded by the 1,000-path line study (SYNTHETIC)')).retirement;
    expect(r).toMatchObject({ subject_kind: 'experiment', experiment_id: DES_EXP, run_id: DES_RUN });
    expect(obj(r['experiment'])).toMatchObject({ state: 'retired' });
    expect(obj(obj(r['experiment'])['retirement'])).toMatchObject({ prior_state: 'completed', run_retired: true });
    expect((await events(DES_EXP)).at(-1)).toBe('retired');
    expect(await runRow(DES_RUN)).toMatchObject({ retire_reason: 'superseded by the 1,000-path line study (SYNTHETIC)' });
    await refused(retireExp(DES_EXP, 'and once more for good'), /retirement rejected \(state\): experiment .* was retired/, 409);
    await refused(retireExp(uuidv7(), 'an unknown experiment'), /retirement rejected \(unknown_experiment\)/, 404);
    evidence('X3c', { experiment: DES_EXP, run: DES_RUN });
  }, 300_000);
});

describe('B30 experiments · X4 nonlinear response across the operating envelope (V02-T-167)', () => {
  it('X4a · POSITIVE: the corridor control swept across supply-flow@1\'s envelope — response curves, the delay\'s threshold, the hidden dependencies — recorded with the port\'s recomputation', async () => {
    SWEEP_RUN = String((await run(corridor())).run['runId']);
    const s = (await sweep(SWEEP_RUN, { metric: 'line_stop_days', gridPoints: 7 })).sweep;
    expect(s).toMatchObject({ run_id: SWEEP_RUN, model_ref: 'supply-flow@1', metric: 'line_stop_days', grid_points: 7, rule: 'sxp-sweep@1', synthetic_state: true });
    const factors = s['factors'] as Row[];
    expect(factors.map((f) => f['key'])).toEqual(['consumption.weekly', 'corridor_delay_days', 'horizon_days']);
    const delay = factors.find((f) => f['key'] === 'corridor_delay_days')!;
    expect((delay['grid'] as Row[]).map((g) => g['value'])).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(delay['range']).toEqual([0, 60]);
    expect(s['nonlinear_factors']).toBe(factors.filter((f) => f['nonlinear'] === true).length);
    expect(s['thresholds']).toBe(factors.reduce((n, f) => n + (f['thresholds'] as unknown[]).length, 0));
    expect(s['hidden_dependencies']).toBe((s['interactions'] as Row[]).filter((i) => i['hidden_dependency'] === true).length);
    expect((s['interactions'] as Row[])).toHaveLength(3);
    expect(Number(s['nonlinear_factors']) + Number(s['thresholds'])).toBeGreaterThan(0);
    evidence('X4a', { sweep: s['sweep_id'], nonlinear: s['nonlinear_factors'], thresholds: s['thresholds'], hidden: s['hidden_dependencies'],
                      delay: (delay['grid'] as Row[]).map((g) => g['metric']), delay_thresholds: delay['thresholds'] });
  }, 300_000);

  it('X4b · REFUSAL: a forged nonlinearity, a range that is not the envelope, a missing pair (the port recomputes); a fabric run (422), a partial run (409), a reader without the role (403)', async () => {
    const honest = (await sweep(SWEEP_RUN, { metric: 'total_cost', gridPoints: 5 })).sweep;
    const base = { runId: SWEEP_RUN, outputsDigest: String((await runRow(SWEEP_RUN))['outputs_digest']), metric: 'total_cost', gridPoints: 5, base: Number(honest['base_value']),
                   factors: honest['factors'] as Row[], interactions: honest['interactions'] as Row[], digest: 'a'.repeat(64) };
    const call = (over: Partial<typeof base>) => forged(nakamura, 'simulation.sweep.run', SWEEP_RUN, FabricCapability.sweep as never,
      (cap: ReturnType<typeof FabricCapability.sweep>) => cap.sweep({ sweepId: uuidv7(), tenantId: T(), domainId: D(), actor: nakamura.principalId, correlationId: uuidv7(), ...base, ...over }));
    const f0 = base.factors[0]!;
    await refused(call({ factors: [{ ...f0, nonlinearity: Number(f0['nonlinearity']) + 0.3 }, ...base.factors.slice(1)] }), /envelope sweep rejected \(factors\): .* states a nonlinearity of/, 422);
    await refused(call({ factors: [{ ...f0, range: [1, 2] }, ...base.factors.slice(1)] }), /envelope sweep rejected \(grid\)/, 422);
    await refused(call({ interactions: base.interactions.slice(1) }), /envelope sweep rejected \(interactions\): every pair of the 3 swept factors is crossed once/, 422);
    const i0 = base.interactions[0]!;
    await refused(call({ interactions: [{ ...i0, interaction: Number(i0['interaction']) + 1000 }, ...base.interactions.slice(1)] }), /envelope sweep rejected \(interactions\)/, 422);
    await refused(sweep(WG_RUN), /envelope sweep rejected \(method\): rule sxp-sweep@1 sweeps supply-flow@1's deterministic trajectory/, 422);
    await refused(sweep(STOP_RUN), /envelope sweep rejected \(state\): run .* is partial/, 409);
    await refused(sweep(SWEEP_RUN, {}, outsider), /./, 403);
    await refused(sweep(uuidv7()), /envelope sweep rejected \(unknown_run\)/, 404);
    evidence('X4b', { refused: 8 });
  }, 300_000);

  it('X4c · RECOVERY: after the refusals the honest sweep records again — the same digest (deterministic)', async () => {
    const a = (await sweep(SWEEP_RUN, { metric: 'line_stop_days', gridPoints: 7 })).sweep;
    const prior = (await rows(sql`select digest from simulation.envelope_sweeps where run_id = ${SWEEP_RUN}::uuid and metric = 'line_stop_days' order by swept_at`)).map((r) => r['digest']);
    expect(prior).toHaveLength(2);
    expect(prior[0]).toBe(prior[1]);
    expect(a['digest']).toBe(prior[0]);
  }, 300_000);
});

describe('B30 experiments · X5 rare events, model discrepancy, benchmark validation, convergence (AI-50-004)', () => {
  it('X5a · POSITIVE: a seeded run\'s 400 paths against a benchmark drawn from it (consistent, converged) and against an observed sample citing its evidence (discrepant: the rare-event tail under-represented)', async () => {
    SEEDED_RUN = String((await run(corridor({ stochastic: { mode: 'seeded', seed: 11, samples: 400, jitter: JITTER } }))).run['runId']);
    const paths = obj(obj((await runRow(SEEDED_RUN))['outputs'])['stochastic'])['sample_totals'] as Row[];
    const costs = paths.map((p) => Number(obj(p['cost'])['total']));
    const sample = costs.filter((_, i) => i % 8 === 0);
    const v = (await bench(SEEDED_RUN, { measure: 'total_cost', kind: 'benchmark', values: sample, basis: 'every eighth path of the run itself — a self-consistency benchmark (SYNTHETIC)', tolerance: 0.1 })).validation;
    expect(v).toMatchObject({ verdict: 'consistent', run_paths: 400, benchmark_n: 50, benchmark_kind: 'benchmark', rule: 'sxp-benchmark@1' });
    expect(obj(v['convergence'])['verdict']).toBe('converged');
    expect((obj(v['convergence'])['checkpoints'] as Row[]).at(-1)).toMatchObject({ paths: 400 });
    // OBSERVED: the line's recorded costs (SYNTHETIC) cite the inventory record — a heavier tail than any path reaches
    const top = Math.max(...costs);
    const observed = [...costs.filter((_, i) => i % 10 === 0).slice(0, 36), top * 1.5, top * 1.6, top * 1.7, top * 1.8];
    const invDigest = String((await rows(sql`select content_digest from objects.canonical_objects where object_id = ${w.records.inv.id}::uuid and object_version = ${w.records.inv.version}`))[0]?.['content_digest']);
    const o = (await bench(SEEDED_RUN, { measure: 'total_cost', kind: 'observed', values: observed, basis: 'the quarter\'s recorded disruption costs (SYNTHETIC)',
                                         citations: [{ ...cite(w.records.inv), digest: invDigest }], tailThreshold: top * 1.4 })).validation;
    expect(o['verdict']).toBe('discrepant');
    expect(obj(o['tail'])).toMatchObject({ verdict: 'under_represented', run_frequency: 0, benchmark_frequency: 0.1, run_tail_paths: 0, threshold_basis: 'declared' });
    expect((obj(o['benchmark'])['citations'] as Row[])[0]?.['id']).toBe(w.records.inv.id);
    evidence('X5a', { run: SEEDED_RUN, consistent: v['validation_id'], discrepant: o['validation_id'], ks: obj(v['discrepancy'])['ks'] });
  }, 300_000);

  it('X5b · REFUSAL: an observed sample without citations, an unknown citation, a forged bias, a measure the run does not carry, a reader without the role', async () => {
    await refused(bench(SEEDED_RUN, { measure: 'total_cost', kind: 'observed', values: [1, 2, 3, 4, 5], basis: 'recorded costs with no evidence (SYNTHETIC)' }), /benchmark validation rejected \(citations\)/, 422);
    await refused(bench(SEEDED_RUN, { measure: 'total_cost', kind: 'observed', values: [1, 2, 3, 4, 5], basis: 'recorded costs, a phantom record (SYNTHETIC)', citations: [{ kind: 'evidence', id: uuidv7(), version: 1, digest: 'b'.repeat(64) }] }),
      /benchmark validation rejected \(unknown_citation\)/, 404);
    await refused(bench(SEEDED_RUN, { measure: 'total_cost', kind: 'benchmark', values: [1, 2, 3, 4, 5], basis: 'short' }), /benchmark validation rejected \(basis\)/, 422);
    await refused(bench(WG_RUN, { measure: 'line_stop_days', kind: 'benchmark', values: [1, 2, 3, 4, 5], basis: 'the war game carries no line-stop days (SYNTHETIC)' }), /benchmark validation rejected \(measure\)/, 422);
    await refused(bench(SEEDED_RUN, { measure: 'total_cost', kind: 'benchmark', values: [1, 2, 3, 4, 5], basis: 'a reader without the role (SYNTHETIC)' }, outsider), /./, 403);
    const outputsDigest = String((await runRow(SEEDED_RUN))['outputs_digest']);
    const call = (bias: number) => forged(nakamura, 'simulation.benchmark.validate', SEEDED_RUN, FabricCapability.benchmark as never, (cap: ReturnType<typeof FabricCapability.benchmark>) => cap.validate({
      validationId: uuidv7(), tenantId: T(), domainId: D(), actor: nakamura.principalId, correlationId: uuidv7(), runId: SEEDED_RUN, outputsDigest, measure: 'total_cost', kind: 'benchmark',
      benchmark: { values: [1, 2, 3, 4, 5], basis: 'a forged figure for the port (SYNTHETIC)' }, tolerance: 0.1, tailThreshold: null,
      discrepancy: { run_mean: 0, benchmark_mean: 3, bias, ks: 1, ks_critical: 1, coverage_in_band: 0, relative_bias: null }, tail: {}, convergence: { checkpoints: [], verdict: 'converged' }, digest: 'c'.repeat(64) }));
    await refused(call(-3), /benchmark validation rejected \(discrepancy\): run_mean is stated 0/, 422);
    evidence('X5b', { refused: 6 });
  }, 300_000);

  it('X5c · RECOVERY: the WAR GAME\'s own paths validated against a benchmark of residual costs — recorded, with its tail and convergence', async () => {
    const paths = obj(obj((await runRow(WG_RUN))['outputs'])['stochastic'])['sample_totals'] as Row[];
    const costs = paths.map((p) => Number(obj(p['cost'])['total']));
    const v = (await bench(WG_RUN, { measure: 'total_cost', kind: 'benchmark', values: costs.slice(0, 20), basis: 'the first half of the war game\'s own paths (SYNTHETIC)' })).validation;
    expect(v).toMatchObject({ run_paths: 40, benchmark_n: 20, model_ref: 'war-gaming@1' });
    expect(['consistent', 'discrepant']).toContain(v['verdict']);
    expect((obj(v['convergence'])['checkpoints'] as Row[]).at(-1)).toMatchObject({ paths: 40 });
  }, 300_000);
});

describe('B30 experiments · X6 reads', () => {
  it('X6 · the fabric overview and a run\'s retirement to an analyst; a principal without a reading role refused at the PDP', async () => {
    const o = await overview();
    expect((o['methods'] as Row[]).map((m) => m['method_ref'])).toEqual(['counterfactual@1', 'discrete-event@1', 'supply-flow@1', 'war-gaming@1']);
    expect(obj((o['methods'] as Row[]).find((m) => m['method_ref'] === 'discrete-event@1')?.['health'])['state']).toBe('healthy');
    const exps = o['experiments'] as Row[];
    expect(exps.find((x) => x['experiment_id'] === DES_EXP)).toMatchObject({ state: 'retired', method_ref: 'discrete-event@1' });
    expect(((exps.find((x) => x['title'] === 'Checkpoint study — stop (SYNTHETIC)')?.['actions']) as Row[]).map((a) => a['event'])).toEqual(['policy_set', 'stopped_unstable', 'review_routed']);
    expect((o['retirements'] as Row[]).length).toBe(3);
    expect((o['sweeps'] as Row[]).length).toBe(3);
    expect((o['validations'] as Row[]).length).toBe(3);
    const rr = (await runRead(w.controlId)).run;
    expect(rr).toMatchObject({ run_id: w.controlId, retire_reason: 'superseded by the corrected corridor control (SYNTHETIC)' });
    expect(obj(rr['retirement'])['superseded_by']).toBe(w.control2Id);
    await refused(overview(outsider), /./, 403);
    await refused(runRead(uuidv7()), /retirement rejected \(unknown_run\)/, 404);
    // every count above is this harness's tenant's (RLS): the complete run shares one database across files
    expect((await rows(sql`select count(*)::int n from simulation.retirements where tenant_id = ${T()}::uuid`))[0]?.['n']).toBe(3);
  }, 300_000);
});
