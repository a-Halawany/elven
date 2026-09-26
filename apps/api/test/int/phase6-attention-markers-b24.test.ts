/**
 * CP-6 B24 (migration 0086 §markers) — SOURCE-IMPACT MARKERS THAT CONSTRAIN DECISION-ACTIVE USE (F-P6-07; V03-T-077 "claims, twins,
 * scenarios, briefings unmarked; no UI shows markers"). B22 (0083 §6) set the markers; B24 makes them REACH the scenarios and runs
 * resting on a degraded source and the packages citing those runs, READ where the products are used, and CONSTRAIN two uses:
 * the COMMITMENT of a package version (refused while an active marker bearing on it is not acknowledged for THAT version by a
 * decision authority) and the OPENING of a scenario-bound run (refused on a failed or suspended source; admitted on a degraded or
 * unknown one with controls.source_impact declared and the run itself marked). On a real database with real Redis, the real outbox
 * publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the SOURCE-HEALTH subscription
 * registered in the harness's own domain, the world of `bootDecisionWorld` (its forecast rests on the fixture REST source; its
 * scenario is declared on that forecast), a twin version admitted after the scenario and two runs bound to the scenario.
 *
 * TWO HEALTH SIGNALS ARE PLANTED (stated): the coverage evaluation's SourceHealthChanged (new_state degraded | unknown | healthy) is
 * written into the tenant's outbox partition as the evaluation would write it (the B22 A8/A9 plantOutbox idiom) — no cheap coverage
 * evaluation reaches `degraded` in this world; the real publisher leases it and the real source-health consumer applies it. The
 * SUSPENSION and the reactivation go through the real lifecycle route (the B22 A6 idiom).
 *
 *   K1 · DEGRADED → markers on the forecast, the scenario, both runs and both packages (through their run citations); the markers read
 *   (grouped by source, each product named) and one package version's bearing (gate blocked); the commitment refused 409 (the port's
 *   sentence names every outstanding marker); a partial acknowledgement leaves it refused; the rest acknowledged → the gate clear → the
 *   commitment; a repeat is `repeated` (no second event); the refusals of the acknowledgement (404 unknown marker / package, 422 reason /
 *   list / not bearing, 409 a committed version); A NEW VERSION NEEDS A NEW ACKNOWLEDGEMENT (v1's acknowledgement does not carry to v2).
 *   K4 · THE STANDING (403): the decision owner, the approver and the executive refused by the PDP; a decision authority acting through
 *   another's session refused by the port (the acting principal); a non-human principal refused by the human gate — nothing recorded;
 *   the authority's own acknowledgement recorded (recovery). (Run second: it needs the markers K1 leaves active.)
 *   K2 · THE RUN GATE: on DEGRADED a scenario run admitted with controls.source_impact (degraded) and a run marker; SUSPENDED (the route)
 *   → the run refused 409 and nothing written; UNKNOWN (planted) → admitted with controls.source_impact (unknown).
 *   K3 · HEALTHY → every marker cleared by that event → a package on the same runs commits with no acknowledgement, a scenario run opens
 *   with no source_impact; acknowledging a cleared marker 409; the read shows no active marker.
 *
 * EACH CASE LOGS ONE `B24 EVIDENCE` LINE with the six things V04-T-024/026 demand.
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
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { DecisionController } from '../../src/decision/decision.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b24-markers-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Delivery = { event_id: string; consumer_kind: string; state: string; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>; last_error: string | null };
type Marker = { marker_id: string; subject_kind: string; subject_id: string; health_state: string; state: string; cleared_state: string | null; set_by_event: string; cleared_by_event: string | null; reason: string | null };
type Bearing = { marker_id: string; subject_kind: string; subject_id: string; health_state: string; acknowledged: boolean; acknowledged_by: string | null; subject_title: string; bearing: string | null };
type PackageBearing = { package_id: string; title: string; state: string; version: number; markers: Bearing[]; outstanding: number; gate: 'clear' | 'blocked' };
type SourceGroup = { source_id: string; source_name: string | null; worst_state: string; markers: Array<{ marker_id: string; subject_kind: string; subject_id: string; subject_title: string; health_state: string; state: string }>; counts: Record<string, number> };
type Ack = { acknowledgement_id: string | null; package_id: string; version: number; repeated: boolean; acknowledged: string[]; already_acknowledged: string[]; outstanding: Array<{ marker_id: string }>; acknowledged_by: string };

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let observation: ObservationController; let decisions: DecisionController; let twins: TwinController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let tenantAdmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
/** What the cases leave one another (each named where it is made). */
let vK = 0; let R1 = ''; let R2 = ''; let P1 = ''; let P2 = ''; let sourceId = ''; let sourceKey = '';
let degradedEvent = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A marker on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    const pending = Number((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'pending'`.execute(su)).rows[0]!.n);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0 && pending === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}; pending outbox rows ${pending}`);
    await sleep(300);
  }
};
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B24 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the outbox and the deliveries ───────────── */
/**
 * A coverage-shaped SourceHealthChanged PLANTED in the tenant's outbox partition the way 0064 places every row (the B22 plantOutbox
 * idiom) — PENDING, so the real publisher leases it and routes it to the source-health subscription.
 */
async function plantHealth(prior: string, next: string, reason: string): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  const payload = { schema_version: 'v1', source_id: sourceId, prior_state: prior, new_state: next, evaluated_at: new Date().toISOString(), reason, lag_class: 'fixture',
                    decision_use_constraint: next === 'healthy' ? 'none' : 'flag', calc_version: 'coverage-calc@1.1.0', coverage_universe_version: 1, evidence_refs: [] };
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'SourceHealthChanged', ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, consumer_kind, state, items_applied, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
/** The source-health delivery of an event applied. */
const healthApplied = async (eventId: string): Promise<Delivery> => {
  const ds = await waitFor(`the source-health delivery of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === 'source-health' && d.state === 'applied'), 120_000);
  return ds.find((d) => d.consumer_kind === 'source-health')!;
};
const outboxEvent = async (eventType: string, after: Date, where: (p: Row) => boolean): Promise<{ id: string; payload: Row }> => {
  const rows = await waitFor(`the ${eventType} row published`, async () => (await sql<{ id: string; status: string; payload: Row }>`select id::text, status, payload from objects.object_outbox
      where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload)),
    (rs) => rs.length >= 1 && rs.every((r) => r.status === 'published'));
  return rows.at(-1)!;
};

/* ───────────── the rows ───────────── */
const markers = async () => (await sql<Marker>`select marker_id::text, subject_kind, subject_id::text, health_state, state, cleared_state, set_by_event::text, cleared_by_event::text, reason
  from observation.source_impact_markers where source_id = ${sourceId}::uuid order by set_at, subject_kind, subject_id`.execute(su)).rows;
const active = async () => (await markers()).filter((m) => m.state === 'active');
const activeOn = async (kind: string, id: string) => (await active()).filter((m) => m.subject_kind === kind && m.subject_id === id);
const ackEvents = async (pkg: string) => (await sql<{ event_id: string; actor: string; details: Row }>`select event_id::text, actor_principal_id::text actor, details from decision.package_events
  where package_id = ${pkg}::uuid and event = 'source_impact.acknowledged' order by occurred_at, event_id`.execute(su)).rows;
const commitments = async (pkg: string) => (await sql<{ version: number }>`select version from decision.commitments where package_id = ${pkg}::uuid order by version`.execute(su)).rows.map((r) => r.version);
const pkgState = async (pkg: string) => (await sql<{ state: string; committed_version: number | null }>`select state, committed_version from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]!;
const runRow = async (runId: string) => (await sql<{ controls: Row; scenario_id: string | null }>`select controls, scenario_id::text from simulation.runs_current where run_id = ${runId}::uuid`.execute(su)).rows[0];
const runCount = async () => (await sql<{ n: number }>`select count(*)::int n from simulation.runs_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]!.n;

/* ───────────── the routes (in process) ───────────── */
const register = (kind: string) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const readMarkers = (as: AuthenticatedPrincipal, payload: Row = {}) => observation.sourceImpactMarkers(h.req(as, 'observation.source_impact.read', 'SRC', null, 'decision'), T(), D(), { payload: payload as never }) as unknown as Promise<{ sources?: SourceGroup[]; total?: number; package?: PackageBearing; receipt: Row }>;
const bearing = async (pkg: string, version?: number, as: AuthenticatedPrincipal = w.authority): Promise<PackageBearing> => (await readMarkers(as, version === undefined ? { packageId: pkg } : { packageId: pkg, version })).package!;
const ack = (as: AuthenticatedPrincipal, pkg: string, payload: Row) => decisions.acknowledgeSourceImpact(h.req(as, 'decision.source_impact.acknowledge', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload }) as unknown as Promise<{ acknowledgement: Ack; receipt: Row }>;
const openVersion = () => twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as unknown as Promise<{ version: { version: number } }>;
const admit = (version: number) => twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(version), { payload: {} }) as unknown as Promise<{ admitted: { completeness: string } }>;
/** A run bound to the world's scenario (its downside branch, open: no shock), on the twin version admitted after the scenario. */
const scenarioRun = (over: Row = {}) => twins.run(h.req(w.operator, 'simulation.run', 'SIM', null, 'simulation'), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: vK, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90,
               stochastic: { mode: 'deterministic' }, scenarioId: w.scenarioId, scenarioBranchId: w.branchId, ...over } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
/** A draft on the two scenario runs: the status quo on R1, the reroute on R2 (one common baseline, R1), the terms, the choice. */
async function draftOnRuns(title: string): Promise<{ pkg: string; v: number }> {
  const pkg = (await c.declare({ decisionObjectId: w.decisionId, title, statement: 'whether to reroute while the corridor source is degraded (B24 harness)', owner: w.owner.principalId })).package.packageId;
  const v = (await c.open(pkg)).version.version;
  await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: R1 }] });
  await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: R2 }] });
  await c.terms(pkg, v, c.validTerms());
  await c.choice(pkg, v, c.validChoice());
  return { pkg, v };
}
const proposeApprove = async (pkg: string, v: number): Promise<string> => {
  const digest = (await c.propose(pkg, v)).proposal.versionDigest;
  await c.approve(pkg, v, { decision: 'approve', versionDigest: digest, rationale: 'The reroute keeps the line running; the premium is acceptable (B24 harness).' }, w.approver);
  return digest;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { DecisionController: Dc } = await import('../../src/decision/decision.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  graph = h.app.get(Gc); observation = h.app.get(Oc); decisions = h.app.get(Dc); twins = h.app.get(Tc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // K2 suspends and reactivates the fixture's REST source through the route (its schedule is materialized): the collection a tick would
  // run reads the synthetic publisher (no network), and the harness unschedules it at once.
  h.app.get(CollectionOrchestrator).useEgressForTests(syntheticEgress().egress);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b24m-tenant-admin', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b24m-executive');
  // THE WORLD (booted BEFORE the subscription: its own events are left behind by the 'leave' backlog).
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  sourceId = h.fx.sourceId;
  sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${sourceId}::uuid limit 1`.execute(su)).rows[0]!.source_key;
  // A TWIN VERSION ADMITTED AFTER THE SCENARIO (its known_at binds the scenario's version), and the two runs bound to the scenario.
  vK = (await openVersion()).version.version;
  expect((await admit(vK)).admitted.completeness).toBe('complete');
  R1 = (await scenarioRun()).run.runId;
  R2 = (await scenarioRun({ runKind: 'intervention', controlRunId: R1, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })).run.runId;
  // THE TWO PACKAGES, declared before the degradation (so the package markers are set): P1 approved, P2 proposed.
  const a = await draftOnRuns('B24 P1: reroute on the scenario runs (harness)'); P1 = a.pkg;
  await proposeApprove(P1, a.v);
  const b = await draftOnRuns('B24 P2: a second version after the acknowledgement (harness)'); P2 = b.pkg;
  await c.propose(P2, b.v);
  await settle();
  // THE SUBSCRIPTION: the source-health kind, registered by the tenant administrator with the backlog left.
  const r = await register('source-health');
  expect(r.served.workerRunning, 'the domain\'s queue is served from registration').toBe(true);
  await settle();
}, 420_000);

afterAll(async () => {
  try { await scheduler.unschedule(T(), D(), h.fx.sourceId); } catch { /* nothing scheduled */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B24 · source-impact markers constrain decision-active use (0086 §markers; F-P6-07, V03-T-077)', () => {
  it('K1 · DEGRADED → markers on the forecast, the scenario, the runs and the packages; the commitment refused 409 until a decision authority acknowledges every bearing marker for THIS version; acknowledged → committed; a new version needs a new acknowledgement', async () => {
    const issued = (await sql<{ forecast_id: string }>`select fc.forecast_id::text from prediction.forecasts_current fc join prediction.series_registry sr on sr.series_key = fc.series_key and sr.tenant_id = fc.tenant_id and sr.domain_id = fc.domain_id
       where fc.tenant_id = ${T()}::uuid and fc.domain_id = ${D()}::uuid and fc.state = 'issued' and sr.source_key = ${sourceKey}`.execute(su)).rows.map((x) => x.forecast_id);
    expect(issued).toContain(w.forecastId);
    expect(await active(), 'no marker before the signal').toEqual([]);
    /* K1.1 THE SIGNAL (planted, coverage-shaped) → the source-health consumer → the markers. */
    degradedEvent = await plantHealth('healthy', 'degraded', 'B24 K1: the publisher lags three days (harness)');
    const d = await healthApplied(degradedEvent);
    expect(d.items_applied[0]).toMatchObject({ effect: 'markers.set', details: { state: 'degraded' } });
    const m = await active();
    for (const x of m) expect(x).toMatchObject({ health_state: 'degraded', set_by_event: degradedEvent, reason: 'B24 K1: the publisher lags three days (harness)' });
    expect(sorted(m.filter((x) => x.subject_kind === 'forecast').map((x) => x.subject_id))).toEqual(sorted(issued));
    expect(m.filter((x) => x.subject_kind === 'scenario').map((x) => x.subject_id)).toEqual([w.scenarioId]);
    expect(sorted(m.filter((x) => x.subject_kind === 'run').map((x) => x.subject_id)), 'the runs bound to the scenario (the world\'s unbound runs are not reached)').toEqual(sorted([R1, R2]));
    expect(sorted(m.filter((x) => x.subject_kind === 'package').map((x) => x.subject_id)), 'the packages reached THROUGH THEIR RUN CITATIONS').toEqual(sorted([P1, P2]));
    const setDetails = (d.items_applied[0]!.details!['set'] as Row[]);
    expect(setDetails.find((x) => x['id'] === P1)?.['via']).toMatch(/^option (reroute|status-quo) cites run /);
    /* K1.2 THE READ (the UI's route): grouped by source, each product named; one version's bearing, the gate blocked. */
    const listed = await readMarkers(w.owner);
    expect(listed.receipt).toMatchObject({ policyDecisionId: expect.any(String) });
    const g = listed.sources!.find((x) => x.source_id === sourceId)!;
    expect(g).toMatchObject({ worst_state: 'degraded', counts: { scenario: 1, run: 2, package: 2 } });
    expect(g.markers.find((x) => x.subject_id === w.scenarioId)?.subject_title).toMatch(/^scenario: Bab el-Mandeb over the next 30 days/);
    expect(g.markers.find((x) => x.subject_id === R1)?.subject_title).toMatch(/^SYNTHETIC control run on SYN-PART-MAG/);
    expect(g.markers.find((x) => x.subject_id === P1)?.subject_title).toMatch(/^decision package: B24 P1/);
    const b1 = await bearing(P1);
    expect(b1).toMatchObject({ package_id: P1, version: 1, state: 'approved', outstanding: 3, gate: 'blocked' });
    expect(sorted(b1.markers.map((x) => `${x.subject_kind}:${x.subject_id}`))).toEqual(sorted([`package:${P1}`, `run:${R1}`, `run:${R2}`]));
    expect(b1.markers.every((x) => !x.acknowledged)).toBe(true);
    expect(b1.markers.find((x) => x.subject_id === R1)?.bearing).toMatch(/cites it$/);
    /* K1.3 THE COMMITMENT REFUSED (409, the port's sentence) — nothing committed. */
    const digest1 = String((await sql<{ d: string }>`select version_digest d from decision.package_versions where package_id = ${P1}::uuid and version = 1`.execute(su)).rows[0]!.d);
    const r1 = await refused(c.commit(P1, 1, digest1, w.authority), /^commitment rejected \(source_impact\): 3 active source-impact marker\(s\) bear on version 1 of package .* and are not acknowledged for this version — /, 409, 'EYE-STA-002');
    for (const id of [P1, R1, R2]) expect(r1.message).toContain(id);
    expect(await commitments(P1)).toEqual([]);
    expect(await pkgState(P1)).toMatchObject({ state: 'approved', committed_version: null });
    /* K1.4 THE ACKNOWLEDGEMENT'S REFUSALS (the caller's request 422, the absences 404) — nothing recorded. */
    const pkgMarker = b1.markers.find((x) => x.subject_kind === 'package')!.marker_id;
    const runMarkers = b1.markers.filter((x) => x.subject_kind === 'run').map((x) => x.marker_id);
    const forecastMarker = m.find((x) => x.subject_kind === 'forecast' && x.subject_id === w.forecastId)!.marker_id;
    await refused(ack(w.authority, P1, { version: 1, markerIds: [pkgMarker], reason: 'short' }), /^source impact acknowledgement rejected: a reason of 8 to 2000 characters/, 422, 'EYE-REQ-001');
    await refused(ack(w.authority, P1, { version: 1, markerIds: [], reason: 'an empty list (B24 harness)' }), /^source impact acknowledgement rejected: marker_ids is a list of 1 to 200 marker ids/, 422, 'EYE-REQ-001');
    await refused(ack(w.authority, P1, { version: 1, markerIds: [forecastMarker], reason: 'P1 cites no forecast (B24 harness)' }), /^source impact acknowledgement rejected \(not_bearing\): marker .* \(forecast .*\) does not bear on version 1 of package/, 422, 'EYE-REQ-001');
    await refused(ack(w.authority, P1, { version: 0, markerIds: [pkgMarker], reason: 'no version zero (B24 harness)' }), /version is the positive integer/, 422, 'EYE-REQ-001');
    await refused(ack(w.authority, P1, { version: 1, markerIds: [uuidv7()], reason: 'a marker that does not exist (B24 harness)' }), /^source impact acknowledgement rejected \(unknown_marker\): marker .* is not a source-impact marker of this domain/, 404, 'EYE-STA-001');
    await refused(ack(w.authority, P1, { version: 9, markerIds: [pkgMarker], reason: 'a version that does not exist (B24 harness)' }), /^source impact acknowledgement rejected: no such version 9 of package/, 404, 'EYE-STA-001');
    const ghost = uuidv7();
    await refused(ack(w.authority, ghost, { version: 1, markerIds: [pkgMarker], reason: 'a package that does not exist (B24 harness)' }), /^source impact acknowledgement rejected: no such package in this domain/, 404, 'EYE-STA-001');
    expect(await ackEvents(P1), 'no refused acknowledgement was recorded').toEqual([]);
    /* K1.5 PARTIAL: the package marker alone → recorded; the commitment still refused, naming the two runs. */
    const a1 = (await ack(w.authority, P1, { version: 1, markerIds: [pkgMarker], reason: 'the package rests on a lagging source; the lag is three days (B24 harness)' })).acknowledgement;
    expect(a1).toMatchObject({ package_id: P1, version: 1, repeated: false, acknowledged: [pkgMarker], already_acknowledged: [], acknowledged_by: w.authority.principalId });
    expect(sorted(a1.outstanding.map((x) => x.marker_id))).toEqual(sorted(runMarkers));
    await refused(c.commit(P1, 1, digest1, w.authority), /^commitment rejected \(source_impact\): 2 active source-impact marker\(s\) bear on version 1/, 409, 'EYE-STA-002');
    /* K1.6 THE REST → the gate clear; a repeat is `repeated` (no second event). */
    const a2 = (await ack(w.authority, P1, { version: 1, markerIds: [...runMarkers, pkgMarker], reason: 'the runs rest on the lagging source; we decide now (B24 harness)' })).acknowledgement;
    expect(a2).toMatchObject({ repeated: false, already_acknowledged: [pkgMarker], outstanding: [] });
    expect(sorted(a2.acknowledged)).toEqual(sorted(runMarkers));
    const again = (await ack(w.authority, P1, { version: 1, markerIds: runMarkers, reason: 'the same acknowledgement, retried (B24 harness)' })).acknowledgement;
    expect(again).toMatchObject({ repeated: true, acknowledged: [], acknowledgement_id: null });
    const evs = await ackEvents(P1);
    expect(evs).toHaveLength(2);
    expect(evs[1]!.details).toMatchObject({ version: 1, reason: 'the runs rest on the lagging source; we decide now (B24 harness)', version_state: 'approved' });
    expect((await bearing(P1, 1))).toMatchObject({ outstanding: 0, gate: 'clear' });
    /* K1.7 THE COMMITMENT (the retry). */
    const cm = await c.commit(P1, 1, digest1, w.authority);
    expect(cm.commitment.commitmentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await commitments(P1)).toEqual([1]);
    // a committed version is not acknowledged again (409, the record's state)
    await refused(ack(w.authority, P1, { version: 1, markerIds: [pkgMarker], reason: 'after the commitment (B24 harness)' }), /^source impact acknowledgement rejected \(version_state\): version 1 of package .* is committed/, 409, 'EYE-STA-002');
    /* K1.8 A NEW VERSION NEEDS A NEW ACKNOWLEDGEMENT: P2 v1 acknowledged; v2 (carried from v1) proposed, approved — refused until its own. */
    const b21 = await bearing(P2, 1);
    expect(b21.outstanding).toBe(3);
    await ack(w.authority, P2, { version: 1, markerIds: b21.markers.map((x) => x.marker_id), reason: 'v1 rests on the lagging source (B24 harness)' });
    expect((await bearing(P2, 1)).gate).toBe('clear');
    const v2 = (await c.open(P2, { carryFrom: 1 })).version.version;
    expect(v2).toBe(2);
    await c.choice(P2, v2, c.validChoice());
    const digest2 = await proposeApprove(P2, v2);
    const b22 = await bearing(P2);
    expect(b22).toMatchObject({ version: 2, outstanding: 3, gate: 'blocked' });
    expect(sorted(b22.markers.map((x) => x.marker_id)), 'the same markers, unacknowledged for v2').toEqual(sorted(b21.markers.map((x) => x.marker_id)));
    await refused(c.commit(P2, v2, digest2, w.authority), /^commitment rejected \(source_impact\): 3 active source-impact marker\(s\) bear on version 2 of package/, 409, 'EYE-STA-002');
    await ack(w.authority2, P2, { version: 2, markerIds: b22.markers.map((x) => x.marker_id), reason: 'v2 rests on the same lagging source (B24 harness)' });
    await c.commit(P2, v2, digest2, w.authority);
    expect(await commitments(P2)).toEqual([2]);
    expect((await ackEvents(P2)).map((e) => [e.details['version'], e.actor])).toEqual([[1, w.authority.principalId], [2, w.authority2.principalId]]);
    sixEvidence('K1', { fault_trace: { degraded_event: degradedEvent, refused: r1.message.slice(0, 160) }, watermark: { markers: m.map((x) => `${x.subject_kind}:${x.subject_id}`) },
      consumer_behaviour: 'source-health set markers on the forecast, the scenario, its runs and the packages citing them', operator_action: 'a decision authority acknowledges the bearing markers per version',
      recovery: 'the commitment retried after the acknowledgement; v2 acknowledged anew', reconciliation: { P1: await commitments(P1), P2: await commitments(P2), acks: (await ackEvents(P1)).length + (await ackEvents(P2)).length } });
  }, 300_000);

  it('K4 · THE STANDING (403): the owner, the approver and the executive refused by the PDP; an authority acting through another\'s session refused by the port; a non-human refused by the human gate — nothing recorded; the authority\'s own acknowledgement recorded', async () => {
    // A draft on the runs, declared AFTER the degradation: no package marker, but the run markers bear on it (its options cite the runs).
    const { pkg } = await draftOnRuns('B24 P4: the standing (harness)');
    const b = await bearing(pkg, 1, executive);
    expect(sorted(b.markers.map((x) => `${x.subject_kind}:${x.subject_id}`))).toEqual(sorted([`run:${R1}`, `run:${R2}`]));
    const ids = b.markers.map((x) => x.marker_id);
    const payload = { version: 1, markerIds: ids, reason: 'the standing is checked before anything is recorded (B24 harness)' };
    for (const who of [w.owner, w.approver, executive]) await refused(ack(who, pkg, payload), /./, 403, 'EYE-AUT-001');
    // an authority's roles on the manager's session: the PDP and the gate admit it; the port compares the acting principal
    const borrowed = await h.principalWith(['decision_authority'], 'b24m-borrowed');
    await refused(ack(borrowed, pkg, payload), /^source impact acknowledgement rejected: recorded by the acting principal, never on behalf of another/, 403, 'EYE-AUT-001');
    // a non-human principal holding the role: the PEP's human gate (EYE-WFL-002) before any capability is minted
    await refused(ack({ ...w.authority, kind: 'agent' } as AuthenticatedPrincipal, pkg, payload), /human gate: decision\.source_impact\.acknowledge requires a named human principal/, 403, 'EYE-WFL-002');
    expect(await ackEvents(pkg), 'no refused acknowledgement was recorded').toEqual([]);
    const ok = (await ack(w.authority, pkg, payload)).acknowledgement;
    expect(ok).toMatchObject({ repeated: false, outstanding: [], acknowledged_by: w.authority.principalId });
    expect(await ackEvents(pkg)).toHaveLength(1);
    sixEvidence('K4', { fault_trace: 'decision_owner / approver / executive 403 (PDP); borrowed session 403 (port); agent 403 (human gate)', watermark: { markers: ids.length },
      consumer_behaviour: null, operator_action: 'the acknowledgement attempted by five principals', recovery: 'the decision authority\'s own acknowledgement recorded', reconciliation: { events: 1 } });
  }, 180_000);

  it('K2 · THE RUN GATE: degraded → a scenario run admitted with controls.source_impact and a run marker; SUSPENDED (the route) → refused 409, nothing written; UNKNOWN → admitted with controls.source_impact', async () => {
    /* K2.1 DEGRADED (K1's markers stand): admitted, declared, marked. */
    const R3 = (await scenarioRun()).run.runId;
    const row3 = await runRow(R3);
    const si = row3!.controls['source_impact'] as Row;
    expect(si).toMatchObject({ health_state: 'degraded', scenario_id: w.scenarioId, forecast_id: w.forecastId });
    expect(sorted((si['markers'] as Row[]).map((x) => `${String(x['subject_kind'])}:${String(x['subject_id'])}`))).toEqual(sorted([`forecast:${w.forecastId}`, `scenario:${w.scenarioId}`]));
    const openedEvent = (await sql<{ event_id: string }>`select event_id::text from simulation.run_events where run_id = ${R3}::uuid and event = 'run.opened'`.execute(su)).rows[0]!.event_id;
    expect(await activeOn('run', R3)).toEqual([expect.objectContaining({ health_state: 'degraded', set_by_event: openedEvent })]);
    // the world's unbound run (no scenario) carries no source_impact
    expect((await runRow(w.controlId))!.controls['source_impact']).toBeUndefined();
    /* K2.2 CLEAR (planted healthy), then SUSPENDED through the lifecycle route (the markers take the suspended state afresh). */
    await settle();
    const healthy = await plantHealth('degraded', 'healthy', 'B24 K2: the lag closed (harness)');
    await healthApplied(healthy);
    expect(await active()).toEqual([]);
    await settle();
    const t0 = await mark();
    await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', sourceId, 'observation'), T(), D(), sourceId,
      { payload: { contractVersion: h.version, target: 'suspended', reason: 'B24 K2: the publisher stopped answering (harness)' } });
    const shc = await outboxEvent('SourceHealthChanged', t0, (p) => p['source_id'] === sourceId && p['state'] === 'suspended');
    await healthApplied(shc.id);
    expect((await activeOn('forecast', w.forecastId))[0]).toMatchObject({ health_state: 'suspended', set_by_event: shc.id });
    expect((await activeOn('run', R3))[0]).toMatchObject({ health_state: 'suspended' });
    /* K2.3 THE RUN REFUSED (409, the port's sentence) — no run row, no marker. */
    const runsBefore = await runCount(); const markersBefore = (await markers()).length;
    const rr = await refused(scenarioRun(), /^run rejected \(source_impact\): scenario .* rests on forecast .* whose source is suspended \(source .* suspended\); a branch resting on a failed or suspended source is not simulated until the source recovers/, 409, 'EYE-STA-002');
    expect(rr.message).toContain(w.scenarioId);
    expect(await runCount()).toBe(runsBefore);
    expect((await markers()).length).toBe(markersBefore);
    // a run that names no scenario is not gated (its world rests on no forecast of the source)
    const free = (await scenarioRun({ scenarioId: null, scenarioBranchId: null })).run;
    expect(free.state).toBe('completed');
    expect((await runRow(free.runId))!.controls['source_impact']).toBeUndefined();
    /* K2.4 ACTIVE again (the route) → cleared; UNKNOWN (planted) → admitted, declared unknown. */
    await settle();
    const t1 = await mark();
    await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', sourceId, 'observation'), T(), D(), sourceId,
      { payload: { contractVersion: h.version, target: 'active', reason: 'B24 K2: the publisher answers again (harness)' } });
    await scheduler.unschedule(T(), D(), sourceId);
    const back = await outboxEvent('SourceHealthChanged', t1, (p) => p['source_id'] === sourceId && p['state'] === 'active');
    await healthApplied(back.id);
    expect(await active()).toEqual([]);
    await settle();
    const unknown = await plantHealth('healthy', 'unknown', 'B24 K2: the coverage cannot be computed (harness)');
    await healthApplied(unknown);
    const R4 = (await scenarioRun()).run.runId;
    expect((await runRow(R4))!.controls['source_impact']).toMatchObject({ health_state: 'unknown' });
    expect(await activeOn('run', R4)).toEqual([expect.objectContaining({ health_state: 'unknown' })]);
    sixEvidence('K2', { fault_trace: { suspended_event: shc.id, refused: rr.message.slice(0, 140) }, watermark: { admitted_degraded: R3, admitted_unknown: R4 },
      consumer_behaviour: 'the run gate reads the scenario forecast\'s markers', operator_action: 'the collection manager suspends and reactivates the source; runs attempted on the scenario',
      recovery: 'active again → cleared; unknown admits with the declaration', reconciliation: { runs_refused: 1, run_markers: [R3, R4] } });
  }, 300_000);

  it('K3 · HEALTHY → every marker cleared by that event → a package on the same runs commits with no acknowledgement, a scenario run opens with no source_impact; a cleared marker is not acknowledged (409); the read shows none active', async () => {
    const before = await active();
    expect(before.length).toBeGreaterThan(0);
    await settle();
    const healthy = await plantHealth('unknown', 'healthy', 'B24 K3: coverage restored (harness)');
    const d = await healthApplied(healthy);
    expect(d.items_applied[0]).toMatchObject({ effect: 'markers.cleared', details: { state: 'healthy' } });
    expect(await active()).toEqual([]);
    for (const x of (await markers()).filter((y) => before.some((b) => b.marker_id === y.marker_id))) expect(x).toMatchObject({ state: 'cleared', cleared_state: 'healthy', cleared_by_event: healthy });
    const listed = await readMarkers(w.authority);
    expect(listed.sources).toEqual([]);
    const all = await readMarkers(w.authority, { state: 'all' });
    expect(all.sources!.find((g) => g.source_id === sourceId)?.worst_state).toBe('cleared');
    /* THE COMMITMENT PROCEEDS WITHOUT ACKNOWLEDGEMENT. */
    const { pkg, v } = await draftOnRuns('B24 P3: after the recovery (harness)');
    const digest = await proposeApprove(pkg, v);
    expect(await bearing(pkg)).toMatchObject({ outstanding: 0, gate: 'clear', markers: [] });
    await c.commit(pkg, v, digest, w.authority);
    expect(await commitments(pkg)).toEqual([v]);
    expect(await ackEvents(pkg)).toEqual([]);
    /* THE RUN PROCEEDS WITH NO DECLARATION. */
    const R5 = (await scenarioRun()).run.runId;
    expect((await runRow(R5))!.controls['source_impact']).toBeUndefined();
    expect(await activeOn('run', R5)).toEqual([]);
    /* A CLEARED MARKER IS NOT ACKNOWLEDGED (409). */
    const { pkg: p6 } = await draftOnRuns('B24 P6: a cleared marker (harness)');
    await refused(ack(w.authority, p6, { version: 1, markerIds: [before[0]!.marker_id], reason: 'the source recovered (B24 harness)' }), /^source impact acknowledgement rejected \(cleared\): marker .* was cleared at .* \(the source is healthy\)/, 409, 'EYE-STA-002');
    sixEvidence('K3', { fault_trace: { healthy_event: healthy }, watermark: { cleared: before.length }, consumer_behaviour: 'source-health cleared every marker of the source',
      operator_action: 'a commitment and a run after the recovery', recovery: 'no acknowledgement needed; no declaration on the run', reconciliation: { committed: pkg, run: R5 } });
  }, 240_000);
});
