/**
 * CP-6 B29 §C (0092) — THE METHOD FABRIC AND THE GENERALISED RUNTIME (F-P5-05 clauses 1, 2, 4), through the real database and controllers.
 *
 *   C1 the adapter fabric with CONTAINMENT: the registry (seven methods, supply-flow@1 unchanged), adapters run OUT OF PROCESS under time
 *      and heap bounds; a fault (timeout, crash, memory, invalid output) is recorded; after `quarantine_after` consecutive faults the
 *      adapter is quarantined and every new run of it refused; a governed probe and a method steward's reinstatement recover it.
 *   C2 the six METHOD FAMILIES: the demonstration's discrete-event run of a Regensburg-like line under a 21-day bearing shortage, its
 *      reproduction byte-equal in a separate process, one run (and one reproduction) per family; a malformed parameter set refused.
 *   C4 the GENERALISED RUNTIME: bindings by the twin's owner (the approved uses), supply-flow@1 through the implicit binding, the
 *      model-aware input rules, dispatch by model reference, and §D's gate at opening (a violated verdict refuses) and completion.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's); the adapters are
 * the product's own — no external solver is integrated here. The unstable adapter (phase6-methods-unstable.cjs) is registered by this
 * harness only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { jcsCanonicalize } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { MethodsController } from '../../src/twin/methods/methods.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import { MethodRegistry } from '../../src/twin/methods/method-registry.js';
import { CONSTRAINT_GATE, type ConstraintGate } from '../../src/twin/methods/types.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../src/twin/models/supply-flow.digest.js';
import { Phase4Harness } from './phase4-helpers.js';
import { RECORD_FILES, cite, completeElements, type Evd } from './phase5-fixtures.js';
import { BEARING, FAMILY_ELEMENTS, FAMILY_PARAMS, LINE_ELEMENTS } from './phase6-methods-fixtures.js';

// This file's own vault roots (the uploads).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b29-methods-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

const HERE = dirname(fileURLToPath(import.meta.url));
const UNSTABLE_MODULE = join(HERE, 'phase6-methods-unstable.cjs');
const UNSTABLE = 'harness-unstable@1';
/* B29-F2 (the bounded B29 review of 2026-09-29): the harness adapter's containment. The time bound is wide enough that an EXHAUSTED HEAP
   is reached long before it on a loaded hosted runner (locally the heap bound of 48 MB is reached in ~80 ms; hosted, one run took over
   1,500 ms and was killed as a TIMEOUT — a competing resource limit, not a containment defect). Each fault kind is proven on its own
   below; the timeout case waits the whole bound. */
const TIMEOUT_MS = 10_000;
const HEAP_MB = 48;
const QUARANTINE_AFTER = 3;
type Row = Record<string, unknown>;

let h: Phase4Harness;
let twins: TwinController;
let methods: MethodsController;
let composition: CompositionController;
let registry: MethodRegistry;
let gate: ConstraintGate;
let owner: AuthenticatedPrincipal;
let peerOwner: AuthenticatedPrincipal;
let operator: AuthenticatedPrincipal;
let opSteward: AuthenticatedPrincipal;
let steward: AuthenticatedPrincipal;
let twinId = '';
let v1 = 0;
let records: { inv: Evd; ship: Evd; terms: Evd };
const desRuns: string[] = [];
const familyRuns: Record<string, string> = {};

const T = () => h.fx.tenantId;
const D = () => h.fx.domainId;
/** A refusal as the HTTP surface answers it: an HttpException as thrown, a port's refusal through the mapper. */
async function refusal(p: Promise<unknown>): Promise<{ status: number | 'ok'; message: string }> {
  try { await p; return { status: 'ok', message: '' }; } catch (e) {
    const x = e instanceof HttpException ? e : asObservationRefusal(e, uuidv7());
    if (x === null) return { status: -1, message: e instanceof Error ? e.message : String(e) };
    const body = x.getResponse() as { message?: string };
    return { status: x.getStatus(), message: String(body.message ?? x.message) };
  }
}
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const runRow = async (id: string) => (await rows(sql`select * from simulation.runs_current where run_id = ${id}::uuid`))[0] as Row;
const runEvents = async (id: string) => (await rows(sql`select event, details from simulation.run_events where run_id = ${id}::uuid order by occurred_at, event`)).map((r) => ({ event: String(r['event']), details: r['details'] as Row }));
const health = async (modelRef: string) => (await rows(sql`select * from simulation.adapter_health where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and model_ref = ${modelRef}`))[0] as Row | undefined;

const run = (payload: Record<string, unknown>, as: AuthenticatedPrincipal = operator) =>
  twins.run(h.req(as, 'simulation.run', 'SIM', null), T(), D(), { payload }) as Promise<{ run: Row }>;
const fabric = (family: string, over: Record<string, unknown> = {}) => {
  const f = FAMILY_PARAMS[family]!;
  return { twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: f.horizonDays,
           stochastic: f.seeded ? { mode: 'seeded', seed: 29, samples: 1, jitter: {} } : { mode: 'deterministic' }, modelRef: f.modelRef, params: f.params, ...over };
};
const unstable = (mode: string) => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }],
                                      horizonDays: 5, stochastic: { mode: 'deterministic' }, modelRef: UNSTABLE, params: { mode } });
const supplyFlow = (over: Record<string, unknown> = {}) => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG',
                                                               interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over });
const bind = (modelRef: string, as: AuthenticatedPrincipal = owner, twin = twinId) =>
  methods.bind(h.req(as, 'simulation.method.bind', 'TWN', twin), T(), D(), { payload: { twinId: twin, modelRef, reason: 'the Regensburg line study' } }) as Promise<{ binding: Row }>;
const unbind = (modelRef: string, as: AuthenticatedPrincipal = owner, reason = 'the study moved to another method') =>
  methods.unbind(h.req(as, 'simulation.method.unbind', 'TWN', twinId), T(), D(), { payload: { twinId, modelRef, reason } }) as Promise<{ binding: Row }>;
const probe = (modelRef: string, as: AuthenticatedPrincipal = steward) =>
  methods.probe(h.req(as, 'simulation.adapter.probe', 'SIM', null), T(), D(), { payload: { modelRef } }) as Promise<{ probe: Row }>;
const reinstate = (modelRef: string, as: AuthenticatedPrincipal = steward, reason = 'the probe passed after the faults were read') =>
  methods.reinstate(h.req(as, 'simulation.adapter.reinstate', 'SIM', null), T(), D(), { payload: { modelRef, reason } }) as Promise<{ adapter: Row }>;
/** §A's contract (twin.contract.publish, the twin's owner): the APPROVED USES a method family must be among (twin.use_approved). */
const ALL_FAMILIES = ['flow', 'discrete-event', 'system-dynamics', 'agent-based', 'optimisation', 'war-gaming', 'counterfactual'];
const publishContract = (methodFamilies: string[]) =>
  composition.publishContract(h.req(owner, 'twin.contract.publish', 'TWN', twinId), T(), D(), twinId,
    { payload: { exposed: { 'demand.daily': { unit: 'units', cadence: 'daily' } }, approvedUses: { methodFamilies, decisionClasses: ['capacity-planning'] } } }) as Promise<{ contract: Row }>;
const reproduce = (runId: string) =>
  twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', runId), T(), D(), runId, { payload: {} }) as Promise<{ reproduction: { verdict: string; coldProcess: boolean; reason: string; actual: string | null; expected: string } }>;

/** The Regensburg plant twin's elements: NORDWERK's magnet chain (supply-flow@1's inputs) and the line and every family's, ASSUMED, citing the terms document. */
const assumed = (e: { key: string; value: unknown; unit: string | null }) => ({ key: e.key, kind: 'assumed', value: e.value, unit: e.unit ?? undefined, citations: [cite(records.terms)] });
const ELEMENTS = () => [...completeElements(records), ...LINE_ELEMENTS.map(assumed), ...FAMILY_ELEMENTS.map(assumed)];

async function admitTwin(elements: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements } });
  await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: TC } = await import('../../src/twin/twin.controller.js');
  const { MethodsController: MC } = await import('../../src/twin/methods/methods.controller.js');
  twins = h.app.get(TC);
  methods = h.app.get(MC);
  const { CompositionController: CC } = await import('../../src/twin/composition/composition.controller.js');
  composition = h.app.get(CC);
  registry = h.app.get(MethodRegistry);
  gate = h.app.get<ConstraintGate>(CONSTRAINT_GATE);
  owner = await h.humanWithSession(['twin_owner', 'forecast_owner'], 'b29-owner');
  peerOwner = await h.humanWithSession(['twin_owner'], 'b29-peer-owner');
  operator = await h.humanWithSession(['simulation_operator'], 'b29-operator');
  opSteward = await h.humanWithSession(['simulation_operator', 'method_steward'], 'b29-op-steward');
  steward = await h.humanWithSession(['method_steward'], 'b29-steward');
  const up = await h.upload(RECORD_FILES());
  records = { inv: up[0] as Evd, ship: up[1] as Evd, terms: up[2] as Evd };
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Regensburg plant', 'regensburg plant', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Regensburg plant and its bearing supply',
    statement: 'the Regensburg assembly line and the chains that feed it', boundary: [entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days', 'working time only on the line'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(ELEMENTS(), 'actual');
  // THE HARNESS'S UNSTABLE ADAPTER: its module registered in this process, its registry row pinned to the module's bytes, contained tightly.
  const entry = registry.registerModule(UNSTABLE_MODULE);
  await sql`insert into twin.behaviour_models (method_ref, name, version, required_inputs, parameter_schema, operating_envelope, validation_notes, implementation_digest, family, adapter, containment)
    values (${UNSTABLE}, 'the harness''s unstable adapter (never shipped)', 1, ARRAY['demand.daily'], '{"mode": ["ok", "hang", "crash", "oom", "garbage"]}'::jsonb, '{"horizon_days": [1, 30]}'::jsonb,
            'B29 §C harness only', ${entry.adapter.digest}, 'system-dynamics', 'method-worker', ${JSON.stringify({ isolated: true, timeout_ms: TIMEOUT_MS, max_old_space_mb: HEAP_MB, quarantine_after: QUARANTINE_AFTER })}::jsonb)
    on conflict (method_ref) do nothing`.execute(h.su);
}, 300_000);

afterAll(async () => { registry?.unregister(UNSTABLE); await h?.close(); });

describe('B29 §C · C4 the generalised runtime — bindings, the implicit binding, dispatch by model reference', () => {
  it('POSITIVE: the owner binds the six families (method.bound); supply-flow@1 keeps running through the implicit binding, byte-identical and with its B18 event ledger', async () => {
    for (const f of Object.values(FAMILY_PARAMS)) {
      const b = await bind(f.modelRef);
      expect(b.binding).toMatchObject({ model_ref: f.modelRef, state: 'active', twin_id: twinId });
    }
    const bound = await rows(sql`select details ->> 'model_ref' m from twin.twin_events where twin_id = ${twinId}::uuid and event = 'method.bound' order by occurred_at`);
    expect(bound.map((r) => r['m'])).toEqual(Object.values(FAMILY_PARAMS).map((f) => f.modelRef));
    // supply-flow@1, no modelRef: the §6b anchor, the implementation it always had
    const sf = await run(supplyFlow());
    expect(sf.run['state']).toBe('completed');
    expect((sf.run['totals'] as Row)['line_stop_days']).toBe(29);
    expect(((sf.run['totals'] as Row)['cost'] as Row)['total']).toBe('4118000.00');
    const sfRow = await runRow(String(sf.run['runId']));
    expect(sfRow['model_ref']).toBe('supply-flow@1');
    expect(sfRow['implementation_digest']).toBe(SUPPLY_FLOW_IMPLEMENTATION_DIGEST);
    expect((await runEvents(String(sf.run['runId']))).map((e) => e.event)).toEqual(['run.opened', 'run.completed']);
    // §D's verdicts are on the run (the real engine since integration: this domain declares no constraint set, so both stages are satisfied)
    const checks = await rows(sql`select stage, outcome, indeterminate_reason from simulation.run_constraint_checks where run_id = ${String(sf.run['runId'])}::uuid order by stage desc`);
    expect(checks.map((c) => [c['stage'], c['outcome']])).toEqual([['opening', 'satisfied'], ['completion', 'satisfied']]);
    // naming supply-flow@1 explicitly is the same run
    const named = await run(supplyFlow({ modelRef: 'supply-flow@1' }));
    expect(await runRow(String(named.run['runId']))).toMatchObject({ outputs_digest: sfRow['outputs_digest'] });
  }, 180_000);

  it('POSITIVE: the model-aware input rules read the METHOD\'s required inputs; the old signatures stay the twin\'s own model\'s', async () => {
    const v2 = await admitTwin(ELEMENTS().filter((e) => !e.key.startsWith('sd.')), 'no-sd');
    const unusable = async (model: string | null) => (await rows(model === null
      ? sql`select twin.unusable_inputs(${twinId}::uuid, ${v2}::int, ${BEARING}) u`
      : sql`select twin.unusable_inputs(${twinId}::uuid, ${v2}::int, ${BEARING}, ${model}) u`))[0]!['u'] as Array<{ input: string; problem: string }>;
    expect((await unusable('system-dynamics@1')).map((u) => [u.input, u.problem])).toEqual([['sd.adjust_days', 'missing'], ['sd.capacity', 'missing'], ['sd.target_delivery_days', 'missing']]);
    expect(await unusable('discrete-event@1')).toEqual([]);
    expect(await unusable(null)).toEqual((await unusable('supply-flow@1')));
    const cites = (await rows(sql`select twin.required_citations(${twinId}::uuid, ${v1}::int, ${BEARING}, 'discrete-event@1') c`))[0]!['c'] as Array<{ key: string }>;
    const desPrefixes = ['line.station', 'line.buffer', 'line.minutes_per_day', 'bom.per_unit', 'inventory.on_hand', 'inbound.daily', 'demand.daily'];
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.every((c) => desPrefixes.includes(c.key.split(':')[0]!))).toBe(true);
    // the port refuses the SD run on v2 (the adapter names what is missing first), the DES run on v2 goes through
    const sd = await refusal(run(fabric('system-dynamics', { twinVersion: v2 })));
    expect(sd.status).toBe(422);
    expect(sd.message).toMatch(/system-dynamics@1 contract invalid: .*sd\.capacity/);
    const des = await run(fabric('discrete-event', { twinVersion: v2 }));
    expect(des.run['state']).toBe('completed');
  }, 180_000);

  it('REFUSAL: an unbound method; a binding by someone who is not the twin\'s owner; a family outside the approved uses (bind and run); an intervention run of a method', async () => {
    const unbound = await refusal(run(unstable('ok')));
    expect(unbound).toMatchObject({ status: 409 });
    expect(unbound.message).toMatch(/^run rejected \(unbound_method\): method harness-unstable@1 is not bound to twin/);
    expect(await runsOf(UNSTABLE)).toBe(0);
    // an operator holds no simulation.method.bind (the PDP); another twin owner is not this twin's owner (the port)
    expect((await refusal(bind(UNSTABLE, operator))).status).toBe(403);
    const peer = await refusal(bind(UNSTABLE, peerOwner));
    expect(peer).toMatchObject({ status: 403 });
    expect(peer.message).toMatch(/^method binding rejected \(not_owner\)/);
    expect((await refusal(bind('discrete-event@1'))).message).toMatch(/^method binding rejected \(already_bound\)/);
    expect((await refusal(bind('supply-flow@1'))).message).toMatch(/bound implicitly/);
    // THE APPROVED USES (§A's twin.use_approved over the twin's CURRENT CONTRACT): the owner publishes a contract that approves every
    // family but war-gaming — the bound war-gaming method's run is refused, and so is binding it again
    await publishContract(ALL_FAMILIES.filter((f) => f !== 'war-gaming'));
    const r = await refusal(run(fabric('war-gaming')));
    expect(r).toMatchObject({ status: 422 });
    expect(r.message).toMatch(/^run rejected \(method_family\): the war-gaming family \(war-gaming@1\) is not among the approved uses of twin/);
    await unbind('war-gaming@1');
    const b = await refusal(bind('war-gaming@1'));
    expect(b).toMatchObject({ status: 422 });
    expect(b.message).toMatch(/^method binding rejected \(method_family\)/);
    // supply-flow@1 through the implicit binding is the twin's own model: the contract does not stand between a twin and itself
    expect((await run(supplyFlow())).run['state']).toBe('completed');
    // a method-fabric run is a control run
    const iv = await refusal(run(fabric('discrete-event', { runKind: 'intervention', controlRunId: uuidv7(), interventions: [{ type: 'reroute', shipment: 'x' }] })));
    expect(iv).toMatchObject({ status: 422 });
    expect(iv.message).toMatch(/is a control run/);
  }, 180_000);

  it('RECOVERY: the owner publishes a contract approving war-gaming, binds it again and its run completes; an unbound binding is history (active → unbound once)', async () => {
    await publishContract(ALL_FAMILIES);
    await bind('war-gaming@1');
    const r = await run(fabric('war-gaming'));
    expect(r.run['state']).toBe('completed');
    const hist = await rows(sql`select state, unbind_reason from twin.twin_method_bindings where twin_id = ${twinId}::uuid and model_ref = 'war-gaming@1' order by bound_at`);
    expect(hist.map((x) => x['state'])).toEqual(['unbound', 'active']);
    await expect(sql`update twin.twin_method_bindings set state = 'active' where twin_id = ${twinId}::uuid and model_ref = 'war-gaming@1' and state = 'unbound'`.execute(h.su)).rejects.toThrow(/only change is active → unbound/);
  }, 120_000);
});

async function runsOf(modelRef: string): Promise<number> {
  return Number((await rows(sql`select count(*)::int n from simulation.runs_current where twin_id = ${twinId}::uuid and model_ref = ${modelRef}`))[0]!['n']);
}

describe('B29 §C · C2 the six method families', () => {
  it('POSITIVE: the discrete-event run of the Regensburg line under a 21-day bearing shortage — out of process, seeded — and its reproduction byte-equal', async () => {
    const r = await run(fabric('discrete-event'));
    const id = String(r.run['runId']);
    desRuns.push(id);
    expect(r.run).toMatchObject({ state: 'completed', modelRef: 'discrete-event@1', isolated: true });
    expect(r.run['pid']).not.toBe(process.pid);
    const s = r.run['summary'] as Row;
    expect(s).toMatchObject({ component: BEARING, horizon_days: 42, shortage_days: 21, bottleneck_station: 'winding', unconstrained_daily_capacity: '818.18' });
    expect(Number(s['line_stop_days'])).toBeGreaterThanOrEqual(15);
    expect(Number(s['final_backlog'])).toBeGreaterThan(5000);
    const row = await runRow(id);
    expect(row).toMatchObject({ state: 'completed', model_ref: 'discrete-event@1', stochastic_mode: 'seeded', seed: '29', rng: 'xoshiro128**@1' });
    const outputs = row['outputs'] as { series: Row[]; balances: Array<{ key: string; opening: number; inflow: number; outflow: number; closing: number }> };
    expect(outputs.series).toHaveLength(42);
    expect(outputs.series.filter((d) => d['shortage'] === true)).toHaveLength(21);
    expect(outputs.series.filter((d) => d['line_stop'] === true).length).toBe(Number(s['line_stop_days']));
    for (const b of outputs.balances) expect(b.opening + b.inflow - b.outflow, b.key).toBe(b.closing);
    expect(createHash('sha256').update(jcsCanonicalize(outputs)).digest('hex')).toBe(row['outputs_digest']);
    const sim = (await rows(sql`select truth_state, synthetic_state, method_ref, payload -> 'totals' ->> 'line_stop_days' lsd from objects.canonical_objects where object_id = ${id}::uuid`))[0]!;
    expect(sim).toMatchObject({ truth_state: 'synthetic', synthetic_state: true, lsd: String(s['line_stop_days']) });
    expect(String(sim['method_ref'])).toMatch(/^discrete-event@1#/);
    // a method-fabric run announces §D's verdicts (opening, completion) beside its own events
    expect((await runEvents(id)).map((e) => e.event).sort()).toEqual(['constraint.checked', 'constraint.checked', 'run.completed', 'run.opened']);
    const rep = await reproduce(id);
    expect(rep.reproduction).toMatchObject({ verdict: 'reproduced', coldProcess: true });
    expect(rep.reproduction.actual).toBe(row['outputs_digest']);
    expect(rep.reproduction.reason).toMatch(/separate process \(pid \d+/);
  }, 180_000);

  it('POSITIVE: one run per family completes and reproduces; the stock-bearing families conserve their balances', async () => {
    for (const [family, f] of Object.entries(FAMILY_PARAMS)) {
      const r = await run(fabric(family));
      const id = String(r.run['runId']);
      familyRuns[family] = id;
      expect(r.run['state'], family).toBe('completed');
      const row = await runRow(id);
      expect(row['model_ref']).toBe(f.modelRef);
      const bm = (await rows(sql`select implementation_digest, family from twin.behaviour_models where method_ref = ${f.modelRef}`))[0]!;
      expect(row['implementation_digest']).toBe(bm['implementation_digest']);
      expect(bm['family']).toBe(family);
      for (const b of ((row['outputs'] as Row)['balances'] as Array<Record<string, number>> | undefined) ?? []) {
        expect(Math.abs(b['opening']! + b['inflow']! - b['outflow']! - b['closing']!), `${family} ${String(b['key'])}`).toBeLessThan(1e-6);
      }
      const rep = await reproduce(id);
      expect(rep.reproduction.verdict, family).toBe('reproduced');
    }
    const summary = async (family: string) => (await runRow(familyRuns[family]!))['outputs'] as { summary: Row };
    expect((await summary('war-gaming')).summary).toMatchObject({ verdict: 'plan breached', adversary: 'greedy' });
    expect(Number((await summary('counterfactual')).summary['delta_production'])).toBeGreaterThan(0);
    expect(Number((await summary('agent-based')).summary['switches'])).toBeGreaterThan(0);
    expect(Number((await summary('optimisation')).summary['lp_bound'])).toBeGreaterThanOrEqual(Number((await summary('optimisation')).summary['objective']));
  }, 300_000);

  it('REFUSAL: a malformed parameter set is refused at opening in the adapter\'s own words — nothing opened', async () => {
    const before = await runsOf('discrete-event@1');
    const r = await refusal(run(fabric('discrete-event', { params: { start_date: '2026-10-05', shortage: { start_day: -1, days: 21, fraction: 1.4 } } })));
    expect(r).toMatchObject({ status: 422 });
    expect(r.message).toMatch(/^discrete-event@1 contract invalid: params\.shortage is/);
    expect((await refusal(run(fabric('discrete-event', { params: { shortage: 'soon' } })))).message).toMatch(/params\.start_date/);
    expect((await refusal(run(fabric('discrete-event', { params: ['not', 'an', 'object'] })))).status).toBe(422);
    expect((await refusal(run(fabric('discrete-event', { stochastic: { mode: 'seeded', seed: 1, samples: 5, jitter: {} } })))).message).toMatch(/one sample per seed/);
    expect(await runsOf('discrete-event@1')).toBe(before);
  }, 120_000);

  it('RECOVERY: the corrected parameter set runs; the same seed reproduces the same outputs, another seed differs', async () => {
    const again = await run(fabric('discrete-event'));
    const first = await runRow(desRuns[0]!);
    expect((await runRow(String(again.run['runId'])))['outputs_digest']).toBe(first['outputs_digest']);
    const other = await run(fabric('discrete-event', { stochastic: { mode: 'seeded', seed: 30, samples: 1, jitter: {} } }));
    expect((await runRow(String(other.run['runId'])))['outputs_digest']).not.toBe(first['outputs_digest']);
  }, 120_000);
});

describe('B29 §C · C1 containment — faults, quarantine, the probe and the governed reinstatement', () => {
  it('POSITIVE: the registry carries seven methods with the pinned bytes; supply-flow@1 unchanged (flow, in process); a contained run executes out of process', async () => {
    const list = (await methods.list(h.req(operator, 'simulation.read', 'SIM', null), T(), D())) as { methods: Row[] };
    const product = list.methods.filter((m) => m['method_ref'] !== UNSTABLE);
    expect(product.map((m) => m['method_ref'])).toEqual(['agent-based@1', 'counterfactual@1', 'discrete-event@1', 'optimisation@1', 'supply-flow@1', 'system-dynamics@1', 'war-gaming@1']);
    expect(product.every((m) => m['carried'] === true && m['carried_digest_matches'] === true)).toBe(true);
    expect(product.find((m) => m['method_ref'] === 'supply-flow@1')).toMatchObject({ family: 'flow', adapter: 'in-process', implementation_digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, containment: { isolated: false } });
    expect(product.filter((m) => m['method_ref'] !== 'supply-flow@1').every((m) => (m['containment'] as Row)['isolated'] === true && m['adapter'] === 'method-worker')).toBe(true);
    await bind(UNSTABLE);
    const ok = await run(unstable('ok'));
    expect(ok.run).toMatchObject({ state: 'completed', isolated: true });
    expect(ok.run['pid']).not.toBe(process.pid);
  }, 120_000);

  /* B29-F2: the three fault kinds, each proven ON ITS OWN — its classification, its run failed with nothing half-written, its place in the
     streak — so a failure of one never masks another; the third consecutive fault quarantines (the memory case, made so whatever came before). */
  it('RECOVERY (the fault path, 1 of 3 — TIMEOUT): a hang is killed at the TIME bound and recorded as a timeout fault; the run failed, never half-completed', async () => {
    const streak = Number((await health(UNSTABLE))?.['consecutive_faults'] ?? 0);
    const t = await refusal(run(unstable('hang')));
    expect(t.status).toBe(409);
    expect(t.message).toMatch(new RegExp(`^run failed \\(adapter_fault: timeout\\): run .* is failed, never half-completed — the adapter of harness-unstable@1 faulted \\(timeout\\): .*${TIMEOUT_MS} ms`));
    const hung = String((await rows(sql`select run_id from simulation.runs_current where model_ref = ${UNSTABLE} order by opened_at desc limit 1`))[0]!['run_id']);
    expect(await runRow(hung)).toMatchObject({ state: 'failed', outputs: null, outputs_digest: null, header_digest: null });
    expect(String((await runRow(hung))['failure'])).toMatch(/faulted \(timeout\)/);
    expect(await health(UNSTABLE)).toMatchObject({ state: 'healthy', consecutive_faults: streak + 1 });
    expect(((await health(UNSTABLE))!['last_fault'] as Row)['kind']).toBe('timeout');
  }, 180_000);

  it('RECOVERY (the fault path, 2 of 3 — CRASH): an abnormal exit mid-run is recorded as a crash fault; no canonical object, the run\'s ledger complete', async () => {
    const streak = Number((await health(UNSTABLE))?.['consecutive_faults'] ?? 0);
    const c = await refusal(run(unstable('crash')));
    expect(c.status).toBe(409);
    expect(c.message).toMatch(/^run failed \(adapter_fault: crash\)/);
    const crashed = String((await rows(sql`select run_id from simulation.runs_current where model_ref = ${UNSTABLE} order by opened_at desc limit 1`))[0]!['run_id']);
    const cr = await runRow(crashed);
    expect(cr).toMatchObject({ state: 'failed', outputs: null, outputs_digest: null, header_digest: null });
    expect(String(cr['failure'])).toMatch(/faulted \(crash\)/);
    expect((await rows(sql`select count(*)::int n from objects.canonical_objects where object_id = ${crashed}::uuid`))[0]!['n']).toBe(0);
    expect((await runEvents(crashed)).map((e) => e.event).sort()).toEqual(['adapter.faulted', 'constraint.checked', 'run.failed', 'run.opened']);
    expect(await health(UNSTABLE)).toMatchObject({ state: 'healthy', consecutive_faults: streak + 1 });
    expect(((await health(UNSTABLE))!['last_fault'] as Row)['kind']).toBe('crash');
  }, 180_000);

  it('RECOVERY (the fault path, 3 of 3 — MEMORY): an exhausted heap is recorded as a MEMORY fault — the heap bound reached, not the time bound — and the third consecutive fault QUARANTINES the adapter in this domain', async () => {
    // Whatever the two cases above left, this case quarantines with a MEMORY fault: the streak is brought to quarantine_after − 1 first.
    while (Number((await health(UNSTABLE))?.['consecutive_faults'] ?? 0) < QUARANTINE_AFTER - 1) await refusal(run(unstable('oom')));
    expect(await health(UNSTABLE)).toMatchObject({ state: 'healthy', consecutive_faults: QUARANTINE_AFTER - 1 });
    // the LAST fault is by an operator who is also a method steward (the separation case below)
    const m = await refusal(run(unstable('oom'), opSteward));
    expect(m.status).toBe(409);
    expect(m.message).toMatch(new RegExp(`^run failed \\(adapter_fault: memory\\).*exhausted its heap bound of ${HEAP_MB} MB.*QUARANTINED in this domain`));
    expect(m.message).not.toMatch(/timeout/);
    const hq = await health(UNSTABLE);
    expect(hq).toMatchObject({ state: 'quarantined', consecutive_faults: QUARANTINE_AFTER, last_fault_operator: opSteward.principalId });
    expect((hq!['last_fault'] as Row)['kind']).toBe('memory');
    const oomRun = String(hq!['quarantined_by_run']);
    const oomRow = await runRow(oomRun);
    expect(oomRow).toMatchObject({ state: 'failed', outputs: null, outputs_digest: null, header_digest: null });
    expect(String(oomRow['failure'])).toMatch(/faulted \(memory\)/);
    expect((await runEvents(oomRun)).map((e) => e.event)).toEqual(expect.arrayContaining(['adapter.faulted', 'adapter.quarantined', 'run.failed']));
    // the three faults of the streak, each its own kind, on the health row's ledger
    const kinds = await rows(sql`select details ->> 'kind' k from simulation.adapter_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and model_ref = ${UNSTABLE} and event = 'faulted' order by occurred_at`);
    expect(kinds.slice(-3).map((r) => r['k'])).toEqual(['timeout', 'crash', 'memory']);
  }, 180_000);

  it('REFUSAL: a quarantined adapter opens no run; the reinstatement is refused without a passing probe and to the last faulted run\'s operator; the probe is a steward\'s', async () => {
    const before = await runsOf(UNSTABLE);
    const q = await refusal(run(unstable('ok')));
    expect(q).toMatchObject({ status: 409 });
    expect(q.message).toMatch(new RegExp(`^run rejected \\(quarantined\\): the adapter of harness-unstable@1 is quarantined in this domain .* after ${QUARANTINE_AFTER} consecutive faults \\(last: memory\\)`));
    expect(await runsOf(UNSTABLE)).toBe(before);
    const np = await refusal(reinstate(UNSTABLE));
    expect(np).toMatchObject({ status: 409 });
    expect(np.message).toMatch(/^adapter reinstatement rejected \(no_probe\)/);
    expect((await refusal(reinstate(UNSTABLE, operator))).status).toBe(403); // no method_steward role (the PDP)
    expect((await refusal(probe(UNSTABLE, operator))).status).toBe(403);
    expect((await refusal(probe('supply-flow@1'))).message).toMatch(/not a contained method/);
    const p = await probe(UNSTABLE);
    expect(p.probe).toMatchObject({ passed: true, state: 'quarantined' });
    const sep = await refusal(reinstate(UNSTABLE, opSteward));
    expect(sep).toMatchObject({ status: 403 });
    expect(sep.message).toMatch(/^adapter reinstatement rejected \(separation\)/);
    expect((await refusal(reinstate(UNSTABLE, steward, 'ok'))).status).toBe(422);
    expect(await health(UNSTABLE)).toMatchObject({ state: 'quarantined' });
  }, 180_000);

  it('RECOVERY: the steward\'s OWN passing probe, then the reinstatement; the run succeeds; the ledger says it all; a new fault starts a new streak', async () => {
    // B29-F2: the recovery establishes its own passing probe — it rests on no earlier case's.
    const own = await probe(UNSTABLE);
    expect(own.probe).toMatchObject({ passed: true, state: 'quarantined' });
    const r = await reinstate(UNSTABLE);
    expect(r.adapter).toMatchObject({ state: 'healthy', model_ref: UNSTABLE });
    expect(await health(UNSTABLE)).toMatchObject({ state: 'healthy', consecutive_faults: 0, reinstated_by: steward.principalId });
    const ok = await run(unstable('ok'));
    expect(ok.run).toMatchObject({ state: 'completed', isolated: true });
    const ledger = await rows(sql`select event from simulation.adapter_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and model_ref = ${UNSTABLE} order by occurred_at`);
    expect(ledger.map((e) => e['event'])).toEqual(['faulted', 'faulted', 'faulted', 'quarantined', 'probed', 'probed', 'reinstated']);
    const oomRun = String((await health(UNSTABLE))!['quarantined_by_run']);
    expect((await runEvents(oomRun)).map((e) => e.event)).toContain('adapter.reinstated');
    const g = await refusal(run(unstable('garbage')));
    expect(g.message).toMatch(/^run failed \(adapter_fault: invalid_output\).*series is not an array/);
    expect(await health(UNSTABLE)).toMatchObject({ state: 'healthy', consecutive_faults: 1, total_faults: 4 });
    const health2 = (await methods.health(h.req(steward, 'simulation.read', 'SIM', null), T(), D(), { payload: { modelRef: UNSTABLE } })) as { adapter: { probes: Row[]; events: Row[] } };
    expect(health2.adapter.probes).toHaveLength(2);
  }, 180_000);
});

describe('B29 §C · C4 §D\'s constraint gate at opening and completion', () => {
  it('REFUSAL: a VIOLATED verdict on the inputs refuses the run before it exists — 422 naming the constraint, its bound and what was observed', async () => {
    const original = gate.check;
    gate.check = async () => ({ outcome: 'violated', setId: 'regensburg-warehouse', setVersion: 2, violations: [
      { constraintKey: 'warehouse:regensburg', kind: 'business_rule', bound: '≤ 1800 pallets', observed: '2350 pallets on 2026-10-14', message: 'the bearing store is over capacity' }] });
    try {
      const before = await runsOf('optimisation@1');
      const r = await refusal(run(fabric('optimisation')));
      expect(r).toMatchObject({ status: 422 });
      expect(r.message).toMatch(/^run rejected \(constraint\): the run's inputs violate constraint set regensburg-warehouse v2: warehouse:regensburg \(business_rule\): bound ≤ 1800 pallets, observed 2350 pallets on 2026-10-14/);
      expect(await runsOf('optimisation@1')).toBe(before);
      // supply-flow@1 is gated by the same rule
      expect((await refusal(run(supplyFlow()))).message).toMatch(/^run rejected \(constraint\)/);
    } finally { gate.check = original; }
  }, 120_000);

  it('RECOVERY: satisfied inputs open the run; violated OUTPUTS are recorded and announced (constraint.refused); a failing gate is INDETERMINATE, never satisfied', async () => {
    const original = gate.check;
    gate.check = async (_scope, subject) => subject.kind === 'run_input'
      ? { outcome: 'satisfied', setId: 'regensburg-warehouse', setVersion: 3, violations: [] }
      : { outcome: 'violated', setId: 'regensburg-warehouse', setVersion: 3, violations: [{ constraintKey: 'no-backlog', kind: 'business_rule', bound: '≤ 0 units', observed: `${subject.quantities.length} quantities`, message: 'the plan leaves a backlog' }] };
    try {
      const r = await run(fabric('optimisation'));
      expect(r.run['state']).toBe('completed');
      const id = String(r.run['runId']);
      const checks = await rows(sql`select stage, outcome, set_id, set_version, violations from simulation.run_constraint_checks where run_id = ${id}::uuid order by stage desc`);
      expect(checks.map((c) => [c['stage'], c['outcome'], c['set_id'], c['set_version']])).toEqual([['opening', 'satisfied', 'regensburg-warehouse', 3], ['completion', 'violated', 'regensburg-warehouse', 3]]);
      const ev = await runEvents(id);
      expect(ev.find((e) => e.event === 'constraint.refused')!.details).toMatchObject({ stage: 'completion', outcome: 'violated', read_as_satisfied: false });
      expect(ev.find((e) => e.event === 'constraint.checked')!.details).toMatchObject({ stage: 'opening', outcome: 'satisfied', read_as_satisfied: true });
      gate.check = async () => { throw new Error('the evaluator is unreachable'); };
      const i = await run(fabric('optimisation'));
      const ic = await rows(sql`select stage, outcome, indeterminate_reason from simulation.run_constraint_checks where run_id = ${String(i.run['runId'])}::uuid order by stage desc`);
      expect(ic.map((c) => c['outcome'])).toEqual(['indeterminate', 'indeterminate']);
      expect(String(ic[0]!['indeterminate_reason'])).toMatch(/the constraint gate failed: the evaluator is unreachable/);
      const got = (await twins.getRun(h.req(operator, 'simulation.read', 'SIM', id, 'simulation'), T(), D(), id)) as { run: { constraint_checks: Row[] } };
      expect(got.run.constraint_checks).toHaveLength(2);
    } finally { gate.check = original; }
  }, 120_000);
});
