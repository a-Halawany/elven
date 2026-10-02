/**
 * CP-6 B30 part `envelope` (migration 0103 §EN; F-P5-04 COMPLETE) — on the real database and controllers.
 *
 * The clauses, each with a POSITIVE, a REFUSAL and a RECOVERY case:
 *   E1  DISABLED OUTSIDE — a 75-day corridor delay run lies outside supply-flow@1's envelope [0, 60]: the acknowledgement at opening is a
 *       twin owner's only (a domain administrator holding simulation_operator is refused 403 — the re-declared envelope_ack_holder), and the
 *       run's decision use is REFUSED (outside_envelope) — the envelope-disable degraded mode, served by the existing validity route too.
 *   E2  EXPLORATORY ADMISSION — only a twin owner (the twin's own owner, T. Nakamura's part) admits it as exploratory; the domain
 *       administrator is refused by the port (ownership), the operator by the PDP; it stays refused for decision, `exploratory: true`.
 *   E3  THE RAISED THRESHOLD — the promotion of an outside-envelope run waits for a method steward's concurrence (a second named human,
 *       neither the admitter nor the operator); then the reviewer promotes; the decision use stays refused.
 *   E4  CALIBRATION — supply-flow@1 on the corridor twin for outcome.line_stop_days:SYN-LINE-A1: three control runs against a LATER observed
 *       outcome (SYNTHETIC: 25 days); MAE / MAPE / bias over n; insufficient → drifting (attention to the owner and the stewards; the runs'
 *       decision use reads calibration_drifting) → stable under a declared wider tolerance; the element path (a simulated element against a
 *       later observation) pairs too.
 *   E5  STEWARDSHIP — the model's lifecycle per domain (deprecated marks a run; incompatible refuses; RETIRED refuses — the retired-model
 *       fault test; re-proposed and approved by ANOTHER steward restores), the domain administrator refused by the port.
 *   E6  THE AI CONTEXT (AI-28-004) — the envelope, the stale variables, the sensitivity (after an analysis) and the fitness, read by an agent
 *       role; an outsider refused by the PDP; an unknown twin 404.
 *   E7  DEGRADED MODES — a retired run (the prelude's columns, written here by the superuser where §EX's port will) is REFUSED (retired);
 *       FREEZE-WITH-FRESHNESS through the §BR seam: this part runs alone, so twin.snapshot_freezes is absent and the AI context says
 *       `seam_absent`; the integrator asserts the seam on the combined migration (§BR's tbr_frozen_expiry refuses a run on a frozen
 *       snapshot past its expiry, §BR's harness proves it).
 *   E8  THE PINS — no event on an existing path (run_events of the outside run ['run.opened','run.completed','run.promoted'], no twin_events
 *       from the ports); counts scoped to this harness's tenant.
 * Every figure seeded here is SYNTHETIC. Nothing is a narrative probability.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { EnvelopeController } from '../../src/twin/envelope/envelope.controller.js';
import type { ValidityController } from '../../src/twin/simulations/validity/validity.controller.js';
import type { ImpactController } from '../../src/twin/simulations/impact/impact.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import { cite, completeElements } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

// this file's own vault roots (the outcome record is uploaded through the real route)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b30-envelope-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let env: EnvelopeController; let validity: ValidityController; let impact: ImpactController;
/** T. Nakamura's part: the corridor twin's OWN owner with a session of its own. */
let owner: AuthenticatedPrincipal;
let dadmin: AuthenticatedPrincipal; let dadminOp: AuthenticatedPrincipal; let operatorS: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let steward2: AuthenticatedPrincipal;
let ownerSteward: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal;
/** What the cases leave one another. */
let V75 = 0; let V_OBS = 0; let R_OUT = ''; let R_OUT2 = ''; let R_IN = '';
const MODEL = 'supply-flow@1';
const OUTCOME_KEY = 'outcome.line_stop_days:SYN-LINE-A1';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const rows = async (q0: ReturnType<typeof sql>) => (await q0.execute(su)).rows as Row[];
const classes = (use: Row) => (use['reasons'] as Array<{ class: string }>).map((r) => r.class);

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const tw = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'twin');
const sim = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'simulation');
const run = (as: AuthenticatedPrincipal, payload: Row = {}) => w.twins.run(sim(as, 'simulation.run', 'SIM', null), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...payload } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
const promote = (as: AuthenticatedPrincipal, runId: string, payload: Row) => w.twins.promote(sim(as, 'simulation.result.promote', 'SIM', runId), T(), D(), runId, { payload }) as unknown as Promise<{ promotion: Row }>;
const readRun = (as: AuthenticatedPrincipal, runId: string) => env.readRun(sim(as, 'twin.read', 'SIM', runId), T(), D(), runId) as Promise<{ run: Row }>;
const listRuns = (as: AuthenticatedPrincipal, twinId?: string) => env.listRuns(sim(as, 'twin.read', 'SIM', null), T(), D(), { payload: twinId === undefined ? {} : { twinId } }) as Promise<{ runs: Row[] }>;
const admit = (as: AuthenticatedPrincipal, runId: string, reason: string) => env.admit(sim(as, 'twin.envelope.admit', 'SIM', runId), T(), D(), runId, { payload: { reason } }) as Promise<{ admission: Row }>;
const concur = (as: AuthenticatedPrincipal, runId: string, note: string) => env.concur(sim(as, 'twin.envelope.concur', 'SIM', runId), T(), D(), runId, { payload: { note } }) as Promise<{ concurrence: Row }>;
const calibrate = (as: AuthenticatedPrincipal, payload: Row) => env.calibrate(tw(as, 'twin.calibration.run', 'TWN', String(payload['twinId'] ?? '')), T(), D(), { payload }) as Promise<{ calibration: Row }>;
const calibrations = (as: AuthenticatedPrincipal, twinId: string) => env.calibrations(tw(as, 'twin.read', 'TWN', twinId), T(), D(), { payload: { twinId } }) as Promise<{ calibrations: Row }>;
const models = (as: AuthenticatedPrincipal) => env.models(tw(as, 'twin.read', 'TWN', null), T(), D(), { payload: {} }) as Promise<{ models: Row[]; events: Row[] }>;
const setState = (as: AuthenticatedPrincipal, state: string, reason: string, modelRef = MODEL) => env.setState(tw(as, 'twin.model.lifecycle', 'TWN', null), T(), D(), { payload: { modelRef, state, reason } }) as Promise<{ lifecycle: Row }>;
const compat = (as: AuthenticatedPrincipal, kind: string, compatible: boolean, note: string) => env.compatibility(tw(as, 'twin.model.lifecycle', 'TWN', null), T(), D(), { payload: { modelRef: MODEL, kind, compatible, note } }) as Promise<{ lifecycle: Row }>;
const aiContext = (as: AuthenticatedPrincipal, twinId: string, version?: number) => env.aiContext(tw(as, 'twin.ai_context.read', 'TWN', twinId), T(), D(), { payload: version === undefined ? { twinId } : { twinId, version } }) as Promise<{ context: Row }>;
const runUse = (as: AuthenticatedPrincipal, runId: string) => validity.runUse(sim(as, 'simulation.validity.read', 'SIM', runId), T(), D(), runId) as Promise<{ use: Row }>;
const decisionUse = async (runId: string): Promise<Row> => (await rows(sql`select simulation.run_decision_use(${runId}::uuid) as u`))[0]!['u'] as Row;
/* the ledgers, scoped to this harness's tenant (the hosted run shares one database across files — the #72 rule) */
const envelopeEvents = async (where: { runId?: string; model?: string } = {}) => (await rows(sql`select event, details, run_id::text, method_ref from twin.envelope_events
  where tenant_id = ${T()}::uuid and (${where.runId ?? null}::uuid is null or run_id = ${where.runId ?? null}::uuid) and (${where.model ?? null}::text is null or method_ref = ${where.model ?? null}::text)
  order by occurred_at, event_id`));
const attention = async (subjectId: string) => rows(sql`select signal_class, subject_kind, state, owner_principal_id::text, route_roles, title from executive.attention_items
  where tenant_id = ${T()}::uuid and signal_class = 'twin.envelope' and subject_id = ${subjectId}::uuid order by created_at`);
const runEvents = async (runId: string) => (await rows(sql`select event from simulation.run_events where run_id = ${runId}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { EnvelopeController: Ec } = await import('../../src/twin/envelope/envelope.controller.js');
  const { ValidityController: Vc } = await import('../../src/twin/simulations/validity/validity.controller.js');
  const { ImpactController: Ic } = await import('../../src/twin/simulations/impact/impact.controller.js');
  env = h.app.get(Ec); validity = h.app.get(Vc); impact = h.app.get(Ic);
  w = await bootDecisionWorld(h);
  owner = await h.openSession(w.twinOwner);
  dadmin = await h.humanWithSession(['domain_admin'], 'b30e-domain-admin');
  dadminOp = await h.humanWithSession(['domain_admin', 'simulation_operator'], 'b30e-domain-admin-operator');
  operatorS = await h.humanWithSession(['simulation_operator'], 'b30e-operator');
  steward = await h.humanWithSession(['method_steward'], 'b30e-steward');
  steward2 = await h.humanWithSession(['method_steward'], 'b30e-steward-2');
  ownerSteward = await h.humanWithSession(['twin_owner', 'method_steward'], 'b30e-owner-steward');
  reviewer = await h.humanWithSession(['strategy_owner'], 'b30e-reviewer');
  analyst = await h.humanWithSession(['domain_analyst'], 'b30e-analyst');
  outsider = await h.humanWithSession(['collection_manager'], 'b30e-outsider');
  agent = await h.humanWithSession(['decision_agent'], 'b30e-decision-agent');
  // THE STRESS VERSION (SYNTHETIC): 75 corridor days — supply-flow@1 declares corridor_delay_days in [0, 60]
  const o = await w.twins.openVersion(tw(owner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId,
    { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1, except: ['shock.corridor_delay_days'] } }) as { version: { version: number } };
  V75 = o.version.version;
  await w.twins.ground(tw(owner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(V75), { payload: { elements: [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 75, unit: 'days', citations: [cite(w.records.terms)] }] } });
  await w.twins.admit(tw(owner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(V75), { payload: {} });
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B30 §EN E1 · DISABLED OUTSIDE THE ENVELOPE (envelope-disable degraded mode; the acknowledgement a twin owner\'s only)', () => {
  it('E1 · REFUSAL: no acknowledgement 422; the domain administrator (holding simulation_operator) acknowledging 403 — the narrowed holder; the operator 403', async () => {
    await refused(run(owner, { twinVersion: V75 }), /^run rejected \(envelope\): outside the operating envelope of supply-flow@1 \(corridor_delay_days = 75 outside \[0, 60\]\)/, 422);
    await refused(run(dadminOp, { twinVersion: V75, envelope: { acknowledge: true, reason: 'the administrator acknowledges the stress case (B30 harness)' } }), /^run rejected \(envelope_ack\)/, 403);
    await refused(run(operatorS, { twinVersion: V75, envelope: { acknowledge: true, reason: 'the operator acknowledges the stress case (B30 harness)' } }), /^run rejected \(envelope_ack\)/, 403);
    expect((await rows(sql`select count(*)::int n from simulation.runs_current where tenant_id = ${T()}::uuid and twin_version = ${V75}`))[0]!['n']).toBe(0);
  }, 120_000);

  it('E1 · POSITIVE: the twin owner\'s acknowledged 75-day run completes OUTSIDE and is REFUSED for decision use (outside_envelope) — on this part\'s read and on the existing validity route; an inside run\'s answer has no new key', async () => {
    const r = (await run(owner, { twinVersion: V75, envelope: { acknowledge: true, reason: 'the 75-day corridor delay is the stress case (B30 harness)' } })).run;
    expect(r.state).toBe('completed'); R_OUT = r.runId;
    const use = await decisionUse(R_OUT);
    expect(use['use']).toBe('refused');
    expect(classes(use)).toEqual(['outside_envelope', 'unpromoted']);
    expect(use['exploratory']).toBe(false);
    expect(use['label']).toBe('REFUSED for decision use: outside_envelope');
    expect(String((use['reasons'] as Row[])[0]!['detail'])).toMatch(/^the run lies outside the operating envelope of supply-flow@1 \(corridor_delay_days = 75 outside \[0, 60\]\): the behaviour is DISABLED for decision use; only a twin owner may admit it as exploratory$/);
    const served = (await runUse(analyst, R_OUT)).use;
    expect(served).toMatchObject({ use: 'refused', exploratory: false });
    const view = (await readRun(analyst, R_OUT)).run;
    expect(view).toMatchObject({ envelope_state: 'outside', model_state: 'approved', admission: null });
    expect((await listRuns(analyst, w.twinId)).runs.map((x) => x['run_id'])).toEqual([R_OUT]);
    const inside = await decisionUse(w.controlId);
    expect(Object.keys(inside).sort()).toEqual(['fitness_state', 'invalidated_at', 'invalidation', 'label', 'partial', 'promoted_for', 'promotion_id', 'reasons', 'run_id', 'state', 'use', 'validity']);
  }, 120_000);

  it('E1 · RECOVERY: a run of the same owner on the version INSIDE the envelope is not disabled (diagnostic: unpromoted only)', async () => {
    const r = (await run(owner)).run;
    expect(r.state).toBe('completed'); R_IN = r.runId;
    expect(classes(await decisionUse(R_IN))).toEqual(['unpromoted']);
  }, 120_000);
});

describe('B30 §EN E2 · ONLY A TWIN OWNER ADMITS IT AS EXPLORATORY (the domain administrator refused)', () => {
  it('E2 · REFUSAL: the domain administrator 403 by the port (ownership, in words); the operator 403 by the PDP; an inside run 409; a short reason 422; an unknown run 404 — nothing recorded', async () => {
    await refused(admit(dadmin, R_OUT, 'the administrator admits the stress case (B30 harness)'), /^exploratory admission rejected \(ownership\): only a twin owner admits an outside-envelope run as exploratory/, 403);
    expect((await refusal(admit(operatorS, R_OUT, 'the operator admits the stress case (B30 harness)'))).status).toBe(403);
    await refused(admit(owner, R_IN, 'an inside run needs no admission (B30 harness)'), /^exploratory admission rejected \(state\): run .* reads INSIDE against the operating envelope of supply-flow@1/, 409);
    await refused(admit(owner, R_OUT, 'short'), /^exploratory admission rejected \(reason\)/, 422);
    await refused(admit(owner, '0190b1c2-d3e4-7000-8000-00000000b30e', 'an unknown run (B30 harness)'), /^exploratory admission rejected \(unknown_run\)/, 404);
    expect((await rows(sql`select count(*)::int n from simulation.exploratory_admissions where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(0);
  }, 120_000);

  it('E2 · POSITIVE: the twin\'s own owner admits it as EXPLORATORY — still REFUSED for decision, exploratory stated; the method stewards asked to concur (twin.envelope); the ledger', async () => {
    const a = (await admit(owner, R_OUT, 'explore the 75-day closure as a stress case, never as a plan')).admission;
    expect(a).toMatchObject({ run_id: R_OUT, model_ref: MODEL, admitted_by: owner.principalId, keys: [{ key: 'corridor_delay_days', value: 75, range: [0, 60] }] });
    const use = obj(a['decision_use']);
    expect(use).toMatchObject({ use: 'refused', exploratory: true, exploratory_admission: { admitted_by: owner.principalId, concurred_by: null } });
    expect(use['label']).toBe('EXPLORATORY ONLY — REFUSED for decision use: outside_envelope');
    expect(String((use['reasons'] as Row[])[0]!['detail'])).toMatch(/admitted as EXPLORATORY by .*; awaiting a method steward's concurrence — exploratory only, never decision-grade$/);
    const items = await attention(R_OUT);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ signal_class: 'twin.envelope', subject_kind: 'run', state: 'open', route_roles: ['method_steward'] });
    expect((await envelopeEvents({ runId: R_OUT })).map((e) => e['event'])).toEqual(['exploratory.admitted']);
  }, 120_000);

  it('E2 · RECOVERY/DUPLICATE: a second admission is refused 409 (recorded once); the view reads the one admission', async () => {
    await refused(admit(owner, R_OUT, 'admitting it twice (B30 harness)'), /^exploratory admission rejected \(duplicate\)/, 409);
    expect(obj((await readRun(analyst, R_OUT)).run['admission'])).toMatchObject({ admitted_by: owner.principalId, concurred_by: null });
  }, 120_000);
});

describe('B30 §EN E3 · THE RAISED THRESHOLD: promotion waits for a method steward\'s concurrence (a second named human)', () => {
  it('E3 · REFUSAL: promoting before the concurrence 409 (unconcurred); the separation of duties (the steward who admitted, the operator) 403; a concurrence without an admission 404; the domain administrator by the PDP 403; a short note 422', async () => {
    await refused(promote(reviewer, R_OUT, { promotedFor: 'a stress-case exploration (B30 harness)', note: 'promoted before the concurrence (B30 harness)' }), /^exploratory admission rejected \(unconcurred\): run .* was admitted as exploratory .* but no method steward has concurred/, 409);
    // the owner-steward opens and admits a second outside run: the admitter does not concur
    R_OUT2 = (await run(ownerSteward, { twinVersion: V75, envelope: { acknowledge: true, reason: 'a second stress case (B30 harness)' } })).run.runId;
    await refused(promote(reviewer, R_OUT2, { promotedFor: 'a stress-case exploration (B30 harness)', note: 'promoted with no admission (B30 harness)' }), /^exploratory admission rejected \(unconcurred\): run .* lies outside its operating envelope and is disabled for decision use/, 409);
    await refused(concur(steward, R_OUT2, 'concurring with nothing admitted (B30 harness)'), /^exploratory admission rejected \(unknown_admission\)/, 404);
    await admit(ownerSteward, R_OUT2, 'a second stress case to explore (B30 harness)');
    await refused(concur(ownerSteward, R_OUT2, 'the admitter concurs with itself (B30 harness)'), /^exploratory admission rejected \(separation_of_duties\)/, 403);
    expect((await refusal(concur(dadmin, R_OUT, 'the administrator concurs (B30 harness)'))).status).toBe(403);
    await refused(concur(steward, R_OUT, 'short'), /^exploratory admission rejected \(note\)/, 422);
    expect((await rows(sql`select count(*)::int n from simulation.exploratory_admissions where tenant_id = ${T()}::uuid and concurred_at is not null`))[0]!['n']).toBe(0);
  }, 180_000);

  it('E3 · POSITIVE: the method steward concurs; the reviewer promotes it for a stated exploratory use; it stays REFUSED for decision (outside_envelope), exploratory, now promoted', async () => {
    const c = (await concur(steward, R_OUT, 'the stress case is worth exploring; not for a decision')).concurrence;
    expect(c).toMatchObject({ run_id: R_OUT, admitted_by: owner.principalId, concurred_by: steward.principalId });
    expect(String(((obj(c['decision_use'])['reasons']) as Row[])[0]!['detail'])).toMatch(/; concurred by .* — exploratory only, never decision-grade$/);
    const p = (await promote(reviewer, R_OUT, { promotedFor: 'a stress-case exploration of the corridor (B30 harness)', note: 'exploratory only: outside the envelope (B30 harness)' })).promotion;
    expect(p).toMatchObject({ run_id: R_OUT, fitness_state: 'fit', validation: { envelope_state: 'outside' } });
    const use = await decisionUse(R_OUT);
    expect(use).toMatchObject({ use: 'refused', exploratory: true });
    expect(classes(use)).toEqual(['outside_envelope']);
    expect((await envelopeEvents({ runId: R_OUT })).map((e) => e['event'])).toEqual(['exploratory.admitted', 'exploratory.concurred']);
  }, 120_000);

  it('E3 · RECOVERY/DUPLICATE: a second concurrence 409; the second run concurred by another steward is promotable', async () => {
    await refused(concur(steward2, R_OUT, 'concurring twice (B30 harness)'), /^exploratory admission rejected \(duplicate\)/, 409);
    await concur(steward2, R_OUT2, 'the second stress case may be explored');
    expect((await promote(reviewer, R_OUT2, { promotedFor: 'a second stress-case exploration (B30 harness)', note: 'exploratory only (B30 harness)' })).promotion).toMatchObject({ run_id: R_OUT2 });
  }, 120_000);
});

describe('B30 §EN E4 · CALIBRATION against observed outcomes: estimation error and model-fitness indicators', () => {
  it('E4 · REFUSAL: the PDP (an analyst) 403; the intake (two metrics, a MAPE of 20) 422; an unknown twin 404; a model neither the twin\'s nor bound 422 — nothing recorded', async () => {
    expect((await refusal(calibrate(analyst, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.2 } }))).status).toBe(403);
    await refused(calibrate(owner, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.2, mae: 3 } }), /^calibration rejected \(tolerance\): a tolerance declares exactly one of mape or mae/, 422);
    await refused(calibrate(owner, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 20 } }), /^calibration rejected \(tolerance\): the mape tolerance is a positive number no greater than 10/, 422);
    await refused(calibrate(owner, { twinId: '0190b1c2-d3e4-7000-8000-00000000b30f', modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.2 } }), /^calibration rejected \(unknown_twin\)/, 404);
    await refused(calibrate(owner, { twinId: w.twinId, modelRef: 'discrete-event@1', key: OUTCOME_KEY, tolerance: { mape: 0.2 } }), /^calibration rejected \(model\): discrete-event@1 is neither the behaviour model of twin/, 422);
    expect((await rows(sql`select count(*)::int n from twin.calibrations where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(0);
  }, 120_000);

  it('E4 · POSITIVE: before any outcome — n 0, INSUFFICIENT; the later observed outcome (SYNTHETIC 25 line-stop days) pairs the three control runs INSIDE the envelope (the outside runs are not calibration evidence): MAE/MAPE/bias as computed, DRIFTING under MAPE 0.2 — the owner and the stewards asked (twin.envelope); the runs\' decision use reads calibration_drifting', async () => {
    const c0 = (await calibrate(owner, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.2 } })).calibration;
    expect(c0).toMatchObject({ seq: 1, n: 0, drift_state: 'insufficient', prior_state: null, mae: null, tolerance: { mape: 0.2, min_n: 3 } });
    // THE LATER OBSERVATION (SYNTHETIC): the line's outcome, uploaded and grounded on actual, observed through after the runs' horizons
    const [out] = await h.upload([{ filename: 'b30-line-outcome.csv', text: 'synthetic,record_id,line_id,line_stop_days\ntrue,SYN-OUT-001,SYN-LINE-A1,25\n', documentTime: '2024-04-30T00:00:00Z' }]);
    const o = await w.twins.openVersion(tw(owner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-30' } }) as { version: { version: number } };
    V_OBS = o.version.version;
    await w.twins.ground(tw(owner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(V_OBS), { payload: { elements: [...completeElements(w.records),
      { key: OUTCOME_KEY, kind: 'observed', value: 25, unit: 'days', validFrom: '2024-04-30', citations: [cite(out as { id: string; version: number })], record: { locator: 'SYN-OUT-001', field: 'line_stop_days' } },
      { key: 'context.port_congestion_index', kind: 'assumed', value: 0.7, unit: 'index', validTo: '2024-02-01', citations: [cite(w.records.terms)] }] } });
    await w.twins.admit(tw(owner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(V_OBS), { payload: { allowIncomplete: true } });
    const controls = await rows(sql`select run_id::text, (outputs -> 'totals' ->> 'line_stop_days')::numeric p from simulation.runs_current
      where twin_id = ${w.twinId}::uuid and run_kind = 'control' and state = 'completed' and envelope_state <> 'outside' order by run_id`);
    expect(controls.map((r) => r['run_id']).sort()).toEqual([w.controlId, w.control2Id, R_IN].sort());
    const ps = controls.map((r) => Number(r['p']));
    const mae = ps.reduce((s, p) => s + Math.abs(p - 25), 0) / 3; const mape = ps.reduce((s, p) => s + Math.abs(p - 25) / 25, 0) / 3; const bias = ps.reduce((s, p) => s + (p - 25), 0) / 3;
    const c1 = (await calibrate(owner, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.2 } })).calibration;
    expect(c1).toMatchObject({ seq: 2, n: 3, prior_state: 'insufficient' });
    expect(Number(c1['mae'])).toBeCloseTo(mae, 5); expect(Number(c1['mape'])).toBeCloseTo(mape, 5); expect(Number(c1['bias'])).toBeCloseTo(bias, 5);
    expect((c1['pairs'] as Row[]).every((p) => p['source'] === 'run' && Number(p['observed']) === 25)).toBe(true);
    expect(c1['drift_state']).toBe(mape > 0.2 ? 'drifting' : 'stable');
    expect(mape, 'the SYNTHETIC outcome is chosen so the corridor model drifts under 20 %').toBeGreaterThan(0.2);
    const items = await attention(w.twinId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ subject_kind: 'twin', state: 'open', owner_principal_id: w.twinOwner.principalId, route_roles: ['method_steward'] });
    expect(classes(await decisionUse(R_IN))).toEqual(['unpromoted', 'calibration_drifting']);
    const read = (await calibrations(analyst, w.twinId)).calibrations;
    expect(read['models']).toEqual([{ model_ref: MODEL, keys: 1, pairs: 3, fitness: 'drifting' }]);
    expect((read['history'] as Row[]).map((x) => x['drift_state'])).toEqual(['drifting', 'insufficient']);
  }, 300_000);

  it('E4 · RECOVERY: a declared wider tolerance (MAPE 0.9) reads STABLE — prior drifting, no second attention item; the runs\' decision use no longer reads calibration_drifting; the ELEMENT path pairs a simulated element against a later observation', async () => {
    const c2 = (await calibrate(steward, { twinId: w.twinId, modelRef: MODEL, key: OUTCOME_KEY, tolerance: { mape: 0.9 } })).calibration;
    expect(c2).toMatchObject({ seq: 3, n: 3, drift_state: 'stable', prior_state: 'drifting', calibrated_by: steward.principalId });
    expect(await attention(w.twinId)).toHaveLength(1);
    expect(classes(await decisionUse(R_IN))).toEqual(['unpromoted']);
    // the element path (SYNTHETIC): a simulated on-hand citing a run on a branch, then the plant count observed later on another branch
    const simKey = 'inventory.on_hand-2024-02-26:SYN-PART-MAG';
    const admitOn = async (branchId: string, extra: Row[], observedThrough = '2024-01-17') => {
      const ov = await w.twins.openVersion(tw(owner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId, knownAt: new Date().toISOString(), observedThrough } }) as { version: { version: number } };
      await w.twins.ground(tw(owner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(ov.version.version), { payload: { elements: [...completeElements(w.records), ...extra] } });
      await w.twins.admit(tw(owner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(ov.version.version), { payload: {} });
      return ov.version.version;
    };
    await admitOn('b30e-sim', [{ key: simKey, kind: 'simulated', value: 2900, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'run', id: R_IN }] }]);
    const [count] = await h.upload([{ filename: 'b30-plant-count.csv', text: 'synthetic,record_id,component_id,on_hand\ntrue,SYN-CNT-B30,SYN-PART-MAG,3100\n', documentTime: '2024-02-26T00:00:00Z' }]);
    await admitOn('b30e-obs', [{ key: simKey, kind: 'observed', value: 3100, unit: 'sets', validFrom: '2024-02-26', citations: [cite(count as { id: string; version: number })], record: { locator: 'SYN-CNT-B30', field: 'on_hand' } }], '2024-02-26');
    const ce = (await calibrate(owner, { twinId: w.twinId, modelRef: MODEL, key: simKey, tolerance: { mae: 100, minN: 2 } })).calibration;
    expect(ce).toMatchObject({ n: 1, drift_state: 'insufficient', pairs: [{ source: 'element', predicted: 2900, observed: 3100, error: -200 }] });
    expect(Number(ce['mae'])).toBe(200);
  }, 300_000);
});

describe('B30 §EN E5 · THE BEHAVIOUR MODEL\'S STEWARDSHIP LIFECYCLE (retired-model fault test)', () => {
  it('E5 · REFUSAL: the domain administrator 403 by the port (authority); approved → retired is not a step 409; an unknown model 404; an unknown kind 404', async () => {
    await refused(setState(dadmin, 'deprecated', 'the administrator deprecates the model (B30 harness)'), /^behaviour model rejected \(authority\): a behaviour model's lifecycle is set by a method steward/, 403);
    await refused(setState(steward, 'retired', 'retire it straight away (B30 harness)'), /^behaviour model rejected \(state\): supply-flow@1 is APPROVED in this domain; approved → retired is not a lifecycle step/, 409);
    await refused(setState(steward, 'deprecated', 'an unknown model (B30 harness)', 'no-such-model@1'), /^behaviour model rejected \(unknown_model\)/, 404);
    await refused(compat(steward, 'no-such-kind', false, 'an unknown kind (B30 harness)'), /^behaviour model rejected \(unknown_kind\)/, 404);
    expect((await rows(sql`select count(*)::int n from twin.model_lifecycle where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(0);
  }, 120_000);

  it('E5 · POSITIVE: DEPRECATED — a new run opens MARKED (the ledger) and reads model_lifecycle; INCOMPATIBLE with supply-chain — refused 422; RETIRED — refused 409 (the fault test)', async () => {
    expect((await setState(steward, 'deprecated', 'supply-flow@2 will supersede the corridor model')).lifecycle).toMatchObject({ state: 'deprecated', from: 'approved', version: 1, steward_principal_id: steward.principalId });
    const r = (await run(owner)).run;
    expect(r.state).toBe('completed');
    expect((await envelopeEvents({ runId: r.runId })).map((e) => [e['event'], obj(e['details'])['model_state']])).toEqual([['run.model_marked', 'deprecated']]);
    expect(classes(await decisionUse(r.runId))).toEqual(['unpromoted', 'model_lifecycle']);
    await compat(steward, 'supply-chain', false, 'the corridor model mis-states multi-tier chains (B30 harness)');
    await refused(run(owner), /^behaviour model rejected \(incompatible\): supply-flow@1 is declared INCOMPATIBLE with the twin kind supply-chain/, 422);
    await compat(steward, 'supply-chain', true, 'the corridor model fits the single-tier chain again (B30 harness)');
    await setState(steward, 'retired', 'the corridor model is withdrawn from use (B30 harness)');
    await refused(run(owner), /^behaviour model rejected \(state\): supply-flow@1 is RETIRED in this domain/, 409);
    expect(obj((await aiContext(agent, w.twinId, w.v1)).context['model'])).toMatchObject({ model_ref: MODEL, lifecycle_state: 'retired', compatibility: { compatible: true } });
    expect((await models(analyst)).models.find((m) => m['method_ref'] === MODEL)).toMatchObject({ state: 'retired', implicit: false });
  }, 300_000);

  it('E5 · RECOVERY: re-proposed (retired → proposed); its proposer may not approve it 403; ANOTHER steward approves; the run opens and reads no model_lifecycle class; the ledger', async () => {
    await setState(steward, 'proposed', 'the corridor model re-proposed after its review (B30 harness)');
    await refused(setState(steward, 'approved', 'approving my own proposal (B30 harness)'), /^behaviour model rejected \(separation_of_duties\)/, 403);
    expect((await setState(steward2, 'approved', 'reviewed: the corridor model is fit again (B30 harness)')).lifecycle).toMatchObject({ state: 'approved', approved_by: steward2.principalId });
    const r = (await run(owner)).run;
    expect(r.state).toBe('completed');
    expect(classes(await decisionUse(r.runId))).not.toContain('model_lifecycle');
    expect((await envelopeEvents({ model: MODEL })).filter((e) => String(e['event']).startsWith('model.')).map((e) => [e['event'], obj(e['details'])['to'] ?? obj(e['details'])['kind']])).toEqual([
      ['model.state_set', 'deprecated'], ['model.compatibility_declared', 'supply-chain'], ['model.compatibility_declared', 'supply-chain'],
      ['model.state_set', 'retired'], ['model.state_set', 'proposed'], ['model.state_set', 'approved']]);
  }, 300_000);
});

describe('B30 §EN E6 · THE AI CONTEXT (AI-28-004): envelope, stale variables, sensitivity, fitness', () => {
  it('E6 · REFUSAL: an outsider by the PDP 403; an unknown twin 404; a malformed version 422', async () => {
    expect((await refusal(aiContext(outsider, w.twinId))).status).toBe(403);
    await refused(aiContext(agent, '0190b1c2-d3e4-7000-8000-00000000b310'), /^twin context rejected \(unknown_twin\)/, 404);
    await refused(env.aiContext(tw(agent, 'twin.ai_context.read', 'TWN', w.twinId), T(), D(), { payload: { twinId: w.twinId, version: 0 } }), /^twin context rejected \(version\)/, 422);
  }, 120_000);

  it('E6 · POSITIVE: an agent role reads the 75-day version — the envelope OUTSIDE with the key, the runs refused (exploratory stated); the head version — the stale variable (its validity ended), the calibrations, the cut-offs\' ages', async () => {
    const c75 = (await aiContext(agent, w.twinId, V75)).context;
    expect(obj(c75['envelope'])['check']).toMatchObject({ state: 'outside', model: MODEL, keys: { corridor_delay_days: { verdict: 'outside', value: 75 } } });
    expect(obj(obj(c75['envelope'])['declared'])['corridor_delay_days']).toEqual([0, 60]);
    expect((c75['runs'] as Row[]).filter((r) => r['run_id'] === R_OUT)).toEqual([expect.objectContaining({ envelope_state: 'outside', use: 'refused', exploratory: true })]);
    const head = (await aiContext(agent, w.twinId)).context;
    expect(head['version']).toBe((await rows(sql`select max(version)::int v from twin.twin_versions where twin_id = ${w.twinId}::uuid and branch_id = 'actual' and state = 'admitted'`))[0]!['v']);
    expect((head['stale_variables'] as Row[]).map((s) => s['key'])).toEqual(['context.port_congestion_index']);
    expect(obj(head['fitness'])['calibrations']).toEqual(expect.arrayContaining([expect.objectContaining({ model_ref: MODEL, key: OUTCOME_KEY, drift_state: 'stable', n: 3 })]));
    expect(Number(obj(head['cutoffs'])['observation_age_days'])).toBeGreaterThan(365);
    expect((head['instructions'] as string[])[0]).toMatch(/^Treat any behaviour outside the operating envelope as disabled for decision use/);
    expect(c75['sensitivity']).toBeNull();
  }, 120_000);

  it('E6 · RECOVERY: after a one-at-a-time analysis of the inside run, the context of version 1 carries the sensitivity (the top factors)', async () => {
    expect((await aiContext(analyst, w.twinId, w.v1)).context['sensitivity']).toBeNull();
    const a = await impact.sensitivity(sim(operatorS, 'simulation.impact.sensitivity', 'SIM', R_IN), T(), D(), R_IN, { payload: {} }) as { analysis: Row };
    const ctx = (await aiContext(analyst, w.twinId, w.v1)).context;
    expect(obj(ctx['sensitivity'])).toMatchObject({ analysis_id: a.analysis['analysis_id'], run_id: R_IN, method: 'one_at_a_time' });
    expect((obj(ctx['sensitivity'])['factors'] as Row[]).length).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

describe('B30 §EN E7 · DEGRADED MODES with fault tests (envelope-disable, retired run, freeze-with-freshness through the §BR seam)', () => {
  it('E7 · RETIRED RUN (the prelude\'s columns; §EX\'s port writes them — written here by the superuser): REFUSED (retired), the instant and the reason stated; a fresh run of the same contract is not', async () => {
    const r = (await run(owner)).run.runId;
    await sql`update simulation.runs_current set retired_at = clock_timestamp(), retired_by = ${steward.principalId}::uuid, retire_reason = 'superseded by a later run (B30 harness)' where run_id = ${r}::uuid`.execute(su);
    const use = await decisionUse(r);
    expect(use).toMatchObject({ use: 'refused', retire_reason: 'superseded by a later run (B30 harness)' });
    expect(classes(use)).toEqual(['retired', 'unpromoted']);
    const fresh = (await run(owner)).run.runId;
    expect(classes(await decisionUse(fresh))).toEqual(['unpromoted']);
  }, 120_000);

  it('E7 · ENVELOPE-DISABLE under a comparison: the existing validity comparison is not decision-grade when it names the outside run', async () => {
    const cmp = await validity.compare(sim(analyst, 'simulation.validity.read', 'SIM', null), T(), D(), { payload: { runIds: [R_IN, R_OUT] } }) as { verdict: Row };
    expect(cmp.verdict).toMatchObject({ decision_grade: false });
    expect(cmp.verdict['refused']).toEqual([R_OUT]);
  }, 120_000);

  it('E7 · FREEZE-WITH-FRESHNESS through the §BR seam: alone, twin.snapshot_freezes is absent and the AI context says seam_absent; combined, the served state is read through twin.served_state (the integrator asserts it on 0103)', async () => {
    const present = (await rows(sql`select to_regclass('twin.snapshot_freezes') is not null as p`))[0]!['p'] === true;
    const served = obj((await aiContext(agent, w.twinId)).context['served_state']);
    if (!present) expect(served).toMatchObject({ state: 'seam_absent' });
    else expect(served['state'], 'the combined migration serves the state through §BR (the integrator asserts the seam)').not.toBe('seam_absent');
  }, 120_000);
});

describe('B30 §EN E8 · THE PINS: no event on an existing path; the ledgers scoped', () => {
  it('E8 · the outside run\'s run_events are the B21 path\'s plus its promotion; no twin_events from the envelope ports; the envelope ledger of this tenant', async () => {
    expect(await runEvents(R_OUT)).toEqual(['run.opened', 'run.completed', 'run.promoted']);
    expect((await rows(sql`select count(*)::int n from twin.twin_events where tenant_id = ${T()}::uuid and event not in ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted')`))[0]!['n']).toBe(0);
    const counts = await rows(sql`select event, count(*)::int n from twin.envelope_events where tenant_id = ${T()}::uuid group by event order by event`);
    expect(Object.fromEntries(counts.map((c) => [c['event'], c['n']]))).toMatchObject({ 'exploratory.admitted': 2, 'exploratory.concurred': 2, 'calibration.recorded': 4, 'model.state_set': 4, 'model.compatibility_declared': 2, 'run.model_marked': 1 });
  }, 120_000);
});
