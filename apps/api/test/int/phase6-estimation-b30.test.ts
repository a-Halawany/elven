/**
 * CP-6 B30 part `estimation` (migration 0103 §ES) — TWIN STATE ESTIMATION AND CONTINUOUS RECONCILIATION (F-P5-02), on a real database
 * through the real routes, ports, the attention tick and the Reconciliation Agent, with named humans holding sessions of their own (the ports
 * compare the acting principal). Every figure is SYNTHETIC: the "PortWatch-shaped" transit series is the Phase 4 fixture source (a
 * synthetic REST double — it demonstrates the software and closes no clause that needs the real PortWatch integration), the twin is the
 * corridor chain's harness copy (NORDWERK's data is the demonstration's).
 *
 *   ES1 · DECLARED ESTIMATORS: the twin owner declares a primary (ratio to baseline) and challengers (moving average, Kalman); refused: another
 *         twin owner (ownership 403), an analyst (the PDP), a second primary (duplicate 409), a ratio without its baseline (422); recovered:
 *         the same name re-declared is version 2, the first superseded.
 *   ES2 · INPUT QUALIFICATION BEFORE ESTIMATION: refused while the series is STALE against the head's world cut-off (nothing written); a new
 *         transit count arrives → qualified; refused again while the source is SUSPENDED (health); recovered when it is reactivated; a
 *         challenger declaring the wrong unit is excluded with the reason while the rest estimate.
 *   ES3 · CANDIDATE STATE, DISAGREEMENT RETAINED, CONSTRAINT VALIDATION BEFORE PUBLISH: the proposal keeps every candidate and states the
 *         spread; the conservation set over the corridor's transit balance and the business rule pass; the active snapshot is untouched;
 *         refused at approval: a smoothed primary whose balance does not conserve the observed count (constraint 422), a value outside the
 *         declared bounds (range 422); recovered: the primary re-declared, proposed again, satisfied.
 *   ES4 · OWNER REVIEW ROUTING, PUBLICATION INTO A NEW SNAPSHOT: a material change is routed to the twin owner (twin.reconciliation); refused:
 *         another twin owner (403), the proposer deciding (separation of duties 403), a stale head (409 — and the whole approval rolled back:
 *         no draft, no version left); the owner approves → a new admitted snapshot carrying the ESTIMATED element (TwinStateChanged announced);
 *         a decline states its reason.
 *   ES5 · THE RECONCILIATION AGENT AND THE TRIGGERS: telemetry (a new count), an internal-system change (an upstream twin's admitted
 *         version) and an ontology revision each queue a proposal check after the attention tick; the agent's scan proposes (never approves:
 *         its attempt to decide is refused at the PDP and recorded); refused: a foreign digest at registration, a drifted registration's run;
 *         recovered: re-registered, it runs.
 *   ES6 · REQUESTS FOR NEW OBSERVATIONS (V02-T-013): a stale or missing input is requested — through the collection scheduler where the
 *         source is scheduled, else an attention item; the agent requests when its primary is stale; refused: an unknown series (404), a
 *         person without the role (PDP), a stranger cancelling (403); recovered: a new evidence version fulfils it after the tick.
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
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ConstraintsController } from '../../src/twin/constraints/constraints.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { EstimationController } from '../../src/twin/estimation/estimation.controller.js';
import { RECONCILIATION_AGENT_DIGEST, RECONCILIATION_AGENT_VERSION } from '../../src/twin/estimation/reconciliation-agent.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, SERIES_START, syntheticEgress, syntheticValue } from './phase4-helpers.js';
import { RECORD_FILES, completeElements } from './phase5-fixtures.js';

// this file's own vault roots (the records and the series evidence are written through the governed paths).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b30-es-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let twins: TwinController; let exec: ExecutiveController; let prediction: PredictionController; let cons: ConstraintsController;
let comp: CompositionController; let graph: GraphController; let est: EstimationController; let timer: AttentionTimerService;
/** T. Nakamura (the corridor twin's owner), A. Hoffmann (the analyst who proposes), E. Kovács (another twin's owner), S. Lindqvist (constraint steward). */
let nakamura: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let kovacs: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let execOwner: AuthenticatedPrincipal; let ontAnalyst: AuthenticatedPrincipal; let ontSteward: AuthenticatedPrincipal;
let twinId = ''; let v1 = 0; let seriesKey = ''; let attentionAgent = ''; let entityId = ''; let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
let day = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const KEY = 'corridor.capacity_share';
/** The corridor's baseline transit count (SYNTHETIC): the capacity share is the latest count against it, in per cent. */
const BASELINE = 104;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const transitsOn = (date: string): number => syntheticValue(Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${SERIES_START}T00:00:00Z`)) / 86_400_000), date);
const evidenceLog = (id: string, e: Row) => { console.log(`B30-ES EVIDENCE ${id} ${JSON.stringify(e)}`); };

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  const raw = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e));
  return { status: mapped === null ? null : mapped.getStatus(), message: raw };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type = 'TWN', id: string | null = null) => h.req(as, action, type, id, 'twin');
const declareEstimator = (payload: Row, as = nakamura) => est.declare(E(as, 'twin.estimator.declare', 'TWN', String(payload['twinId'] ?? twinId)), T(), D(), { payload }) as Promise<{ estimator: Row }>;
const retireEstimator = (id: string, reason: string, as = nakamura) => est.retire(E(as, 'twin.estimator.declare', 'TWX', id), T(), D(), id, { payload: { reason } }) as Promise<{ estimator: Row }>;
const preview = (key = KEY, as = nakamura, twin = twinId) => est.preview(E(as, 'twin.estimation.read', 'TWN', twin), T(), D(), { payload: { twinId: twin, key } }).then((r) => (r as { preview: Row }).preview);
const propose = (key = KEY, as = analyst, twin = twinId) => est.propose(E(as, 'twin.estimate.propose', 'TWE'), T(), D(), { payload: { twinId: twin, key } }).then((r) => (r as { estimate: Row }).estimate);
const decide = (id: string, decision: 'approved' | 'declined', note?: string, as = nakamura, allowIncomplete = false) =>
  est.decide(E(as, 'twin.estimate.decide', 'TWE', id), T(), D(), id, { payload: { decision, ...(note === undefined ? {} : { note }), allowIncomplete } }) as Promise<{ decision: Row; snapshot: Row | null }>;
const readEstimate = (id: string, as = nakamura) => est.read(E(as, 'twin.estimation.read', 'TWE', id), T(), D(), id).then((r) => (r as { estimate: Row }).estimate);
const requestObs = (payload: Row, as = nakamura) => est.request(E(as, 'twin.observation.request', 'TWQ'), T(), D(), { payload }) as Promise<{ request: Row }>;
const cancelRequest = (id: string, reason: string, as = nakamura) => est.cancel(E(as, 'twin.observation.request', 'TWQ', id), T(), D(), id, { payload: { reason } }) as Promise<{ request: Row }>;
const overview = (as = nakamura) => est.overview(E(as, 'twin.estimation.read', 'TWN', twinId), T(), D(), { payload: { twinId } }).then((r) => (r as { overview: Row }).overview);
const estimateRows = async () => rows(sql`select estimate_id::text, key, state, proposed_value::float8 as v, proposer_kind, applied_version from twin.estimates where tenant_id = ${T()}::uuid order by proposed_at`);
const versionsOf = async (id = twinId) => rows(sql`select version, branch_id, state, supersedes, observed_through::text as observed_through, opened_by::text as opened_by from twin.twin_versions where twin_id = ${id}::uuid order by version`);
const ledger = async (event: string) => rows(sql`select event_id::text, key, estimator_id::text, estimate_id::text, request_id::text, details, actor_principal_id::text as actor from twin.estimation_events where tenant_id = ${T()}::uuid and event = ${event} order by occurred_at, event_id`);
const items = async (cls: string, subject: string) => rows(sql`select item_id::text, owner_principal_id::text as owner, state, title, details from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);
/** The primary estimator of the capacity share (SYNTHETIC): the latest transit count against the corridor's baseline, in per cent. */
const primaryDecl = (over: Row = {}): Row => ({ twinId, key: KEY, name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline', parameters: { baseline: BASELINE, scale: 100 },
  inputs: [{ kind: 'series', series_key: seriesKey, unit: 'transits/day', cadence_days: 1 }], unit: '%', bounds: { min: 0, max: 100 }, materiality: 0.05, ambiguity: 0.5,
  note: 'corridor capacity from the latest transit count against the baseline (SYNTHETIC)', ...over });
/** One attention tick (its own day); answers the `twin-estimation` hook's result. */
const tick = async (): Promise<Row> => {
  day += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId: attentionAgent, scheduledAt: new Date(Date.UTC(2038, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const hook = obj(obj(obj(t.run?.outputs)['after'])['twin-estimation']);
  expect(hook['error'], String(hook['error'])).toBeUndefined();
  return hook;
};
/** A new contract version of the fixture source and one governed collection: the new transit counts arrive (SYNTHETIC) — `to` is exclusive (the last point is the day before). */
const collect = async (from: string, to: string) => {
  await h.newVersion({ from, to, windowDays: 40 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ConstraintsController: Cc } = await import('../../src/twin/constraints/constraints.controller.js');
  const { CompositionController: Co } = await import('../../src/twin/composition/composition.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  twins = h.app.get(Tc); exec = h.app.get(Ec); prediction = h.app.get(Pc); cons = h.app.get(Cc); comp = h.app.get(Co); graph = h.app.get(Gc);
  est = h.app.get(EstimationController); timer = h.app.get(AttentionTimerService);
  nakamura = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b30es-nakamura');
  analyst = await h.humanWithSession(['domain_analyst'], 'b30es-analyst');
  kovacs = await h.humanWithSession(['twin_owner'], 'b30es-kovacs');
  steward = await h.humanWithSession(['constraint_steward'], 'b30es-lindqvist');
  outsider = await h.humanWithSession(['decision_approver'], 'b30es-outsider');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b30es-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin', 'forecast_owner'], 'b30es-dadmin');
  execOwner = await h.humanWithSession(['executive'], 'b30es-executive');
  ontAnalyst = await h.humanWithSession(['domain_analyst'], 'b30es-ont-analyst');
  ontSteward = await h.humanWithSession(['ontology_steward'], 'b30es-ont-steward');
  // THE TELEMETRY (SYNTHETIC): the fixture's transit series through 2023-12-31, registered as a series of the domain.
  const sv = await h.newVersion({ from: '2023-10-01', to: '2024-01-01', windowDays: 100 });
  const r0 = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r0.state, r0.reason).toBe('finished');
  seriesKey = `fixture:${sv.sourceKey}:value`;
  await prediction.registerSeries(h.req(dadmin, 'prediction.series.register', 'SER', null), T(), D(),
    { payload: { seriesKey, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7,
                 attribution: 'Source: fixture statistics.', description: 'synthetic daily corridor transits (the PortWatch shape)' } });
  // THE TWIN (SYNTHETIC; the corridor chain's harness copy): the records uploaded, version 1 grounded complete and admitted, observed through 2024-01-17.
  const up = await h.upload(RECORD_FILES());
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  entityId = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${nakamura.principalId}::uuid, ${ec}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entityId}::uuid, 'entity.created', ${nakamura.principalId}::uuid,
            ${JSON.stringify({ entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', normalized_name: 'bab el-mandeb strait', split_from: null })}::jsonb, ${ec}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(nakamura, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain (B30 estimation harness)',
    statement: 'the magnet chain', boundary: [entityId], owner: nakamura.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  const o = await twins.openVersion(h.req(nakamura, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(nakamura, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: completeElements(records) } });
  await twins.admit(h.req(nakamura, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  v1 = o.version.version;
  // THE ATTENTION AGENT: the tick's principal (the scheduler is off: the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: execOwner.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  attentionAgent = r.agent.agentId;
}, 900_000);

afterAll(async () => { await h?.close(); }, 120_000);

let MA = ''; let A = ''; let C = '';

describe('B30 part ES · twin state estimation and continuous reconciliation (0103 §ES; F-P5-02)', () => {
  it('ES1 · DECLARED ESTIMATORS: the owner declares a primary and its challengers; refused — another owner, an analyst, a second primary, a ratio without a baseline; recovered — the same name is version 2', async () => {
    const p = (await declareEstimator(primaryDecl())).estimator;
    expect(p).toMatchObject({ version: 1, key: KEY, name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline' });
    const ma = (await declareEstimator(primaryDecl({ name: 'portwatch-ma', role: 'challenger', method: 'moving_average', parameters: { window: 7, baseline: BASELINE, scale: 100 }, note: 'the weekly mean as a challenger (SYNTHETIC)' }))).estimator;
    MA = String(ma['estimator_id']);
    await declareEstimator(primaryDecl({ name: 'portwatch-kalman', role: 'challenger', method: 'kalman_1d', parameters: { window: 30, process_variance: 4, measurement_variance: 25, baseline: BASELINE, scale: 100 },
                                         note: 'a random-walk Kalman filter as a challenger (SYNTHETIC)' }));
    // REFUSED: another twin owner (the port's ownership, 403), an analyst (the PDP, 403), a second primary (409), a ratio without its baseline (the route, 422)
    await refused(declareEstimator(primaryDecl({ name: 'kovacs-ratio', role: 'challenger' }), kovacs), /^estimator rejected \(ownership\)/, 403);
    await refused(declareEstimator(primaryDecl({ name: 'analyst-ratio', role: 'challenger' }), analyst), /twin\.estimator\.declare|not permitted|denied|role/i, 403);
    await refused(declareEstimator(primaryDecl({ name: 'second-primary' })), /^estimator rejected \(duplicate\): portwatch-ratio is the primary/, 409);
    await refused(declareEstimator(primaryDecl({ name: 'no-baseline', role: 'challenger', parameters: { scale: 100 } })), /a ratio to baseline names its baseline/, 422);
    // RECOVERED: the moving average re-declared (a shorter window) is version 2; version 1 superseded, both kept
    const ma2 = (await declareEstimator(primaryDecl({ name: 'portwatch-ma', role: 'challenger', method: 'moving_average', parameters: { window: 5, baseline: BASELINE, scale: 100 }, note: 'the five-day mean as a challenger (SYNTHETIC)' }))).estimator;
    expect(ma2).toMatchObject({ estimator_id: MA, version: 2, supersedes: 1 });
    const all = await rows(sql`select name, version, state from twin.estimators where tenant_id = ${T()}::uuid order by name, version`);
    expect(all.map((x) => `${String(x['name'])}@${String(x['version'])}:${String(x['state'])}`)).toEqual(['portwatch-kalman@1:active', 'portwatch-ma@1:superseded', 'portwatch-ma@2:active', 'portwatch-ratio@1:active']);
    expect((await ledger('estimator.declared')).length).toBe(4);
    expect((await ledger('estimator.superseded')).length).toBe(1);
  });

  it('ES2 · INPUT QUALIFICATION BEFORE ESTIMATION: stale → refused (nothing written); a new transit count arrives → qualified; the source suspended → refused (health); reactivated → recovered; a wrong unit excluded', async () => {
    // REFUSED: the series ends 2023-12-31; the head is observed through 2024-01-17 — 17 days, the daily cadence allows 2
    const pv = await preview();
    const q = arr(arr(pv['qualification']).find((x) => x['estimator_id'] !== MA)?.['inputs']);
    expect(q[0]).toMatchObject({ verdict: 'disqualified', cadence: expect.objectContaining({ verdict: 'stale', last_point: '2023-12-31', reference_date: '2024-01-17', lag_days: 17 }) });
    expect(String(arr(q[0]?.['reasons'])[0])).toMatch(/^stale: the latest point 2023-12-31 is 17 day\(s\) before the reference date 2024-01-17/);
    await refused(propose(), /^estimate rejected \(unqualified\): the primary estimator portwatch-ratio has no qualified candidate — stale/, 422);
    expect(await estimateRows()).toEqual([]);
    expect(await rows(sql`select 1 from twin.input_qualifications where tenant_id = ${T()}::uuid`)).toEqual([]);
    // POSITIVE: a new transit count arrives (2024-01-01 … 2024-01-17) — every input qualifies
    await collect('2024-01-01', '2024-01-18');
    const pv2 = await preview();
    for (const e of arr(pv2['qualification'])) for (const x of arr(e['inputs'])) {
      expect(x, JSON.stringify(x)).toMatchObject({ verdict: 'qualified', source_health: expect.objectContaining({ state: 'healthy' }), unit_check: expect.objectContaining({ verdict: 'match' }),
                                                   truth_state: expect.objectContaining({ verdict: 'admissible' }), cadence: expect.objectContaining({ verdict: 'on_cadence', last_point: '2024-01-17', lag_days: 0 }) });
    }
    // REFUSED: the source suspended — its health disqualifies the input
    await h.transition(h.version, 'suspended');
    await refused(propose(), /^estimate rejected \(unqualified\): .*source health is suspended/, 422);
    // RECOVERED: reactivated, the input qualifies again
    await h.transition(h.version, 'active');
    const pv3 = await preview();
    expect(arr(arr(pv3['qualification'])[0]?.['inputs'])[0]).toMatchObject({ verdict: 'qualified', source_health: expect.objectContaining({ state: 'healthy' }) });
    // a challenger declaring the wrong unit is excluded with the reason; the others still estimate
    await declareEstimator(primaryDecl({ name: 'weekly-unit', role: 'challenger', method: 'last_observation', parameters: { baseline: BASELINE, scale: 100 },
      inputs: [{ kind: 'series', series_key: seriesKey, unit: 'transits/week', cadence_days: 7 }], note: 'a challenger that declares the wrong unit (SYNTHETIC)' }));
    const pv4 = await preview();
    const weekly = arr(pv4['candidates']).find((c) => c['name'] === 'weekly-unit');
    expect(weekly).toMatchObject({ value: null, excluded: expect.stringMatching(/unit mismatch: the series is in transits\/day, the input declares transits\/week \(never converted\)/) });
    evidenceLog('ES2', { stale: q[0]?.['cadence'], qualified: arr(arr(pv2['qualification'])[0]?.['inputs'])[0]?.['cadence'], excluded: weekly?.['excluded'] });
  });

  it('ES3 · CANDIDATE STATE, DISAGREEMENT RETAINED, CONSTRAINTS BEFORE PUBLISH: conservation and the business rule pass, the snapshot untouched; refused — a balance that does not conserve, a value outside the bounds; recovered', async () => {
    // the constraint set (S. Lindqvist): the corridor's transit balance conserved within half a transit, and the capacity share at most 100 %
    const set = await cons.declare(h.req(steward, 'simulation.constraint.declare', 'CST', null, 'twin'), T(), D(), { payload: { setKey: 'corridor-transit-balance', title: 'Corridor transit balance (SYNTHETIC)',
      constraints: [{ key: 'transits-conserved', kind: 'conservation', stocks: [KEY], tolerance: 0.5, unit: 'transits/day', applies_to: ['run_input'], title: 'the proposal accounts for the observed count' },
                    { key: 'share-at-most-100', kind: 'business_rule', quantity: KEY, op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'] }],
      note: 'the estimate is checked before it is published' } }) as { set: Row };
    expect(set.set['set_key'] ?? obj(set.set)['set_key']).toBe('corridor-transit-balance');
    const before = { versions: (await versionsOf()).length, elements: (await rows(sql`select 1 from twin.state_elements where twin_id = ${twinId}::uuid`)).length,
                     events: (await rows(sql`select 1 from twin.twin_events where twin_id = ${twinId}::uuid`)).length };
    // POSITIVE: the analyst proposes; every candidate kept; the value is the latest count against the baseline
    const a = await propose();
    A = String(a['estimate_id']);
    const expected = round3((transitsOn('2024-01-17') / BASELINE) * 100);
    expect(a).toMatchObject({ state: 'proposed', key: KEY, unit: '%', as_of: '2024-01-17', head_version: v1, constraint: 'satisfied', proposer_kind: 'human', material: true, routed: true });
    expect(Number(a['value'])).toBe(expected);
    const cands = arr(a['candidates']);
    expect(cands.map((c) => `${String(c['name'])}:${c['value'] === null ? 'excluded' : 'value'}`).sort()).toEqual(['portwatch-kalman:value', 'portwatch-ma:value', 'portwatch-ratio:value', 'weekly-unit:excluded']);
    const spread = obj(a['spread']);
    expect(spread['n']).toBe(3);
    expect(Number(spread['max']) - Number(spread['min'])).toBeGreaterThan(0);   // the challengers DISAGREE — and the disagreement is kept
    const recorded = await readEstimate(A);
    expect(recorded['constraint_check']).toMatchObject({ outcome: 'satisfied', vacuous: false, pins: [expect.objectContaining({ set_key: 'corridor-transit-balance', version: 1 })] });
    expect(arr(recorded['qualifications']).length).toBe(4);
    // THE ACTIVE SNAPSHOT IS UNTOUCHED: no version, no element, no twin event
    expect({ versions: (await versionsOf()).length, elements: (await rows(sql`select 1 from twin.state_elements where twin_id = ${twinId}::uuid`)).length,
             events: (await rows(sql`select 1 from twin.twin_events where twin_id = ${twinId}::uuid`)).length }).toEqual(before);
    // REFUSED (constraint): a primary smoothed over seven points no longer accounts for the latest count — the balance does not conserve
    await declareEstimator(primaryDecl({ parameters: { baseline: BASELINE, scale: 100, window: 7 }, note: 'the primary smoothed over a week (SYNTHETIC)' }));
    const b = await propose();
    const seven = ['2024-01-11', '2024-01-12', '2024-01-13', '2024-01-14', '2024-01-15', '2024-01-16', '2024-01-17'].map(transitsOn);
    const residual = Math.abs(seven.reduce((x, y) => x + y, 0) / 7 - transitsOn('2024-01-17'));
    expect(residual).toBeGreaterThan(0.5);
    expect(b).toMatchObject({ constraint: 'violated', ambiguous: true, supersedes: A });
    expect(String(arr(b['ambiguity_reasons']).join(' '))).toMatch(/the constraint check is violated/);
    await refused(decide(String(b['estimate_id']), 'approved', 'approving a violated estimate'), /^estimate rejected \(constraint\): the constraint check before publish is violated \(.*does not balance/, 422);
    // REFUSED (range): the bounds narrowed below the proposal
    await declareEstimator(primaryDecl({ bounds: { min: 0, max: 10 }, note: 'the primary with a narrow range (SYNTHETIC)' }));
    const c0 = await propose();
    expect(c0).toMatchObject({ constraint: 'satisfied', range: expect.objectContaining({ verdict: 'outside' }) });
    await refused(decide(String(c0['estimate_id']), 'approved', 'approving outside the bounds'), /^estimate rejected \(range\): .* is outside the declared bounds \[0, 10\]/, 422);
    // RECOVERED: the primary re-declared as it was; proposed again; satisfied, inside
    await declareEstimator(primaryDecl({ note: 'the primary restored: the latest count, the full range (SYNTHETIC)' }));
    const c = await propose();
    C = String(c['estimate_id']);
    expect(c).toMatchObject({ constraint: 'satisfied', range: expect.objectContaining({ verdict: 'inside' }), state: 'proposed' });
    expect(Number(c['value'])).toBe(expected);
    expect((await estimateRows()).map((x) => String(x['state']))).toEqual(['superseded', 'superseded', 'superseded', 'proposed']);
    evidenceLog('ES3', { value: c['value'], spread, residual_week: residual, constraint: recorded['constraint_check'] });
  });

  it('ES4 · OWNER REVIEW AND PUBLICATION: routed to the owner; refused — another owner, the proposer, a stale head (rolled back whole); the owner approves into a new snapshot; a decline states its reason', async () => {
    // ROUTED: the material change waits in the owner's queue
    const it0 = await items('twin.reconciliation', C);
    expect(it0).toEqual([expect.objectContaining({ owner: nakamura.principalId, state: 'open' })]);
    // REFUSED: another twin owner (the port, 403); the analyst who proposed it (the PDP: no decide rule, 403)
    await refused(decide(C, 'approved', undefined, kovacs), /^estimate rejected \(ownership\)/, 403);
    await refused(decide(C, 'approved', undefined, analyst), /twin\.estimate\.decide|not permitted|denied|role/i, 403);
    // REFUSED: the owner deciding his OWN proposal (separation of duties)
    const own = await propose(KEY, nakamura);
    await refused(decide(String(own['estimate_id']), 'approved'), /^estimate rejected \(separation_of_duties\)/, 403);
    // POSITIVE: the analyst proposes; T. Nakamura approves — ONE transaction: a new snapshot on actual carrying v1, the estimated element, the admission
    const e = await propose();
    const ok = await decide(String(e['estimate_id']), 'approved', 'the transit count is in; the capacity share is accepted (SYNTHETIC)');
    const v2 = Number(obj(ok.snapshot)['version']);
    expect(ok.decision).toMatchObject({ state: 'approved', applied_version: v2, value: e['value'], unit: '%' });
    expect((await versionsOf()).slice(-1)[0]).toMatchObject({ version: v2, branch_id: 'actual', state: 'admitted', supersedes: v1, observed_through: '2024-01-17', opened_by: nakamura.principalId });
    const el = (await rows(sql`select kind, value::text as value, unit, citations, confidence::float8 as confidence from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v2} and key = ${KEY}`))[0] as Row;
    expect(el).toMatchObject({ kind: 'estimated', unit: '%' });
    expect(Number(el['value'])).toBe(Number(e['value']));
    expect(arr(el['citations']).every((x) => x['kind'] === 'evidence')).toBe(true);
    expect((await rows(sql`select 1 from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v2}`)).length)
      .toBe((await rows(sql`select 1 from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v1}`)).length + 1);
    const announced = await rows(sql`select payload from objects.object_outbox where tenant_id = ${T()}::uuid and event_type = 'TwinStateChanged' and payload ->> 'twin_id' = ${twinId} order by created_at`);
    expect(announced.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(announced.slice(-1)[0]?.['payload'])).toContain('twin.estimate.decide');
    // REFUSED (stale): a proposal on v2; the owner admits v3 meanwhile; the approval of the stale proposal is refused and ROLLED BACK whole
    const f = await propose();
    const o3 = await twins.openVersion(h.req(nakamura, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: v2 } }) as { version: { version: number } };
    await twins.admit(h.req(nakamura, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o3.version.version), { payload: {} });
    const versionsBefore = await versionsOf();
    await refused(decide(String(f['estimate_id']), 'approved', 'approving on a moved head'), /^estimate rejected \(stale\): estimate .* was computed against v2 of the twin; the head moved to v3/, 409);
    expect(await versionsOf()).toEqual(versionsBefore);   // no draft, no version: the open, the ground and the admission rolled back with the refusal
    expect((await rows(sql`select 1 from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'draft'`)).length).toBe(0);
    expect((await readEstimate(String(f['estimate_id'])))['state']).toBe('proposed');
    // A DECLINE states its reason (the route, 422 without one); recorded
    await refused(decide(String(f['estimate_id']), 'declined'), /a declined estimate states its reason/, 422);
    const dec = await decide(String(f['estimate_id']), 'declined', 'computed on a superseded head — a new proposal follows');
    expect(dec.decision).toMatchObject({ state: 'declined' });
    // RECOVERED: proposed again on v3, approved into v4
    const g = await propose();
    expect(g['head_version']).toBe(o3.version.version);
    const ok2 = await decide(String(g['estimate_id']), 'approved', 'proposed again on the current head (SYNTHETIC)');
    expect(Number(obj(ok2.snapshot)['version'])).toBe(o3.version.version + 1);
    expect(await ledger('estimate.approved')).toHaveLength(2);
    evidenceLog('ES4', { routed: it0, snapshot: ok.snapshot, stale_refused: true, recovered: ok2.decision });
  });

  it('ES5 · THE RECONCILIATION AGENT AND THE TRIGGERS: telemetry, an upstream twin\'s change and an ontology revision queue checks after the tick; the agent proposes, never approves; refused — a foreign digest, a drifted run; recovered', async () => {
    const base = { kind: 'reconciliation', version: RECONCILIATION_AGENT_VERSION, codeDigest: RECONCILIATION_AGENT_DIGEST, ownerPrincipalId: nakamura.principalId, escalationPrincipalId: execOwner.principalId,
                   budgets: { max_reads: 40, max_gateway_calls: 0, max_elapsed_ms: 300_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] };
    const register = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload } as never) as unknown as Promise<{ agent: { agentId: string; principalId: string; role: string } }>;
    // REFUSED: a foreign digest at registration
    await refused(register({ ...base, codeDigest: 'a'.repeat(64) }), /a reconciliation agent is registered with this runtime's scan/, 422);
    const reg = (await register(base)).agent;
    expect(reg.role).toBe('reconciliation_agent');
    // the first tick: the count collected in ES2 was recorded AFTER the estimators were declared — a telemetry check queued, the scan proposes
    // on it; the head already holds that value (approved in ES4): NOT material, not routed
    const t0 = await tick();
    expect(arr(t0['queued']).map((x) => x['kind'])).toEqual(['telemetry']);
    expect(obj(t0['scan'])).toMatchObject({ outcome: 'finished' });
    const first = arr(obj((await rows(sql`select outputs from executive.agent_runs where run_id = ${String(obj(t0['scan'])['run_id'])}::uuid`))[0]?.['outputs'])['proposed']);
    expect(first).toEqual([expect.objectContaining({ material: false, routed: false })]);
    // nothing pending now: the tick queues nothing and runs no scan
    const idle = await tick();
    expect(idle).toMatchObject({ queued: [], pending: [], scan: null });
    // TELEMETRY: a new transit count (2024-01-18 … 2024-01-24) → the tick queues the check, the agent's scan proposes
    await collect('2024-01-18', '2024-01-25');
    const t1 = await tick();
    expect(arr(t1['queued']).map((x) => x['kind'])).toEqual(['telemetry']);
    expect(obj(t1['scan'])).toMatchObject({ outcome: 'finished' });
    const runId = String(obj(t1['scan'])['run_id']);
    const run = (await rows(sql`select outcome, task, refusals, outputs from executive.agent_runs where run_id = ${runId}::uuid`))[0] as Row;
    expect(run).toMatchObject({ outcome: 'finished', task: 'reconcile_scan' });
    const proposed = arr(obj(run['outputs'])['proposed']);
    expect(proposed).toHaveLength(1);
    const agentEstimate = String(proposed[0]?.['estimate_id']);
    expect(await readEstimate(agentEstimate)).toMatchObject({ proposer_kind: 'agent', agent_id: reg.agentId, run_id: runId, as_of: '2024-01-24', state: 'proposed' });
    expect(Number((await readEstimate(agentEstimate))['proposed_value'])).toBe(round3((transitsOn('2024-01-24') / BASELINE) * 100));
    // PROPOSES ONLY: its attempt to decide was refused at the PDP and recorded on the run
    expect(arr(run['refusals']).map((x) => x['action'])).toContain('twin.estimate.decide');
    expect((await ledger('trigger.consumed')).length).toBeGreaterThanOrEqual(1);
    expect((await tick())['pending']).toEqual([]);   // answered: nothing pending, no second scan
    // the OWNER approves the agent's proposal
    const okA = await decide(agentEstimate, 'approved', 'the agent\'s proposal on the new count is accepted (SYNTHETIC)');
    expect(okA.decision).toMatchObject({ state: 'approved' });
    // INTERNAL-SYSTEM CHANGE: an upstream twin (E. Kovács) published and linked; its new admitted version queues a check
    const ud = await twins.declare(h.req(kovacs, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'Upstream port twin (B30 harness)', statement: 'the upstream port',
      boundary: [entityId], owner: kovacs.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    const U = ud.twin.twinId;
    const uo = await twins.openVersion(h.req(kovacs, 'twin.version', 'TWN', U), T(), D(), U, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
    await twins.ground(h.req(kovacs, 'twin.ground', 'TWN', U), T(), D(), U, String(uo.version.version), { payload: { elements: completeElements(records) } });
    await twins.admit(h.req(kovacs, 'twin.version.admit', 'TWN', U), T(), D(), U, String(uo.version.version), { payload: {} });
    await comp.publishContract(h.req(kovacs, 'twin.contract.publish', 'TWN', U, 'twin'), T(), D(), U, { payload: { exposed: { 'inventory.on_hand:SYN-PART-MAG': { unit: 'sets', cadence: 'on-admission' } },
      approvedUses: { methodFamilies: ['flow'], decisionClasses: ['capacity-planning'] } } });
    await comp.declareLink(h.req(nakamura, 'twin.link.declare', 'TWN', twinId, 'twin'), T(), D(), { payload: { upstreamTwinId: U, downstreamTwinId: twinId,
      mapping: [{ from: 'inventory.on_hand:SYN-PART-MAG', to: 'upstream.inventory.on_hand:SYN-PART-MAG' }], use: 'capacity-planning' } });
    const uo2 = await twins.openVersion(h.req(kovacs, 'twin.version', 'TWN', U), T(), D(), U, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: uo.version.version } }) as { version: { version: number } };
    await twins.admit(h.req(kovacs, 'twin.version.admit', 'TWN', U), T(), D(), U, String(uo2.version.version), { payload: {} });
    const t2 = await tick();
    expect(arr(t2['queued']).map((x) => `${String(x['kind'])}:${String(x['upstream_twin_id'] ?? '')}`)).toEqual([`internal_change:${U}`]);
    expect(obj(t2['scan'])).toMatchObject({ outcome: 'finished' });
    // ONTOLOGY REVISION: the domain's ontology activated → a check queued; the scan proposes again
    const prop = await graph.proposeOntology(h.req(ontAnalyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: ['organization', 'place', 'route'],
      rationale: 'B30: the corridor vocabulary (SYNTHETIC)', predicates: [{ predicate: 'ships_through', subject_types: ['organization'], object_types: ['place'] }] } }) as unknown as { ontology: { version_id: string } };
    await graph.decideOntology(h.req(ontSteward, 'graph.ontology.decide', 'ONT', prop.ontology.version_id, 'graph'), T(), D(), prop.ontology.version_id, { payload: { decision: 'approve', reason: 'B30: additive vocabulary, reviewed' } });
    const t3 = await tick();
    expect(arr(t3['queued']).map((x) => x['kind'])).toEqual(['ontology_revision']);
    expect(obj(t3['scan'])).toMatchObject({ outcome: 'finished' });
    expect((await ledger('trigger.internal_change')).length).toBe(1);
    expect((await ledger('trigger.ontology_revision')).length).toBe(1);
    // REFUSED: a drifted registration's run is refused and recorded; RECOVERED: the digest restored, the agent runs again
    await sql`update executive.agents set code_digest = ${'b'.repeat(64)} where agent_id = ${reg.agentId}::uuid`.execute(h.su);
    const drift = (await exec.runAgent(h.req(execOwner, 'agent.trigger', 'AGT', reg.agentId, 'twin'), T(), D(), reg.agentId, { payload: { task: 'reconcile_scan' } as never }) as unknown as { run: Row }).run;
    expect(drift).toMatchObject({ outcome: 'refused' });
    expect(String(drift['stopReason'])).toMatch(/^reconcile scan refused \(drift\)/);
    await sql`update executive.agents set code_digest = ${RECONCILIATION_AGENT_DIGEST} where agent_id = ${reg.agentId}::uuid`.execute(h.su);
    const again = (await exec.runAgent(h.req(execOwner, 'agent.trigger', 'AGT', reg.agentId, 'twin'), T(), D(), reg.agentId, { payload: { task: 'reconcile_scan' } as never }) as unknown as { run: Row }).run;
    expect(again).toMatchObject({ outcome: 'finished' });
    evidenceLog('ES5', { telemetry: t1['queued'], internal: t2['queued'], ontology: t3['queued'], agent_estimate: agentEstimate, refusals: run['refusals'] });
  });

  it('ES6 · REQUESTS FOR NEW OBSERVATIONS: a person requests (the scheduler, or the steward\'s queue); the agent requests when its primary is stale; refused — an unknown series, no role, a stranger cancelling; recovered — fulfilled by a new count', async () => {
    // POSITIVE (a person): the series' source is NOT scheduled (the harness collects by hand) — an attention item to the source's steward (its approver)
    expect(await rows(sql`select 1 from observation.scheduler_entries where source_id = ${h.fx.sourceId}::uuid`)).toEqual([]);
    const approver = String((await rows(sql`select approver_principal_id::text a from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid and lifecycle_state = 'active'`))[0]?.['a']);
    const r1 = (await requestObs({ twinId, key: KEY, input: { kind: 'series', series_key: seriesKey }, reasonClass: 'stale', note: 'the corridor count is needed daily (SYNTHETIC)' })).request;
    expect(r1).toMatchObject({ via: 'attention', standing: false, routed_to: approver });
    expect(await items('twin.observation_request', twinId)).toEqual([expect.objectContaining({ owner: approver, state: 'open' })]);
    // asking again answers the standing request
    expect((await requestObs({ twinId, key: KEY, input: { kind: 'series', series_key: seriesKey }, reasonClass: 'stale', note: 'asked again by the analyst (SYNTHETIC)' }, analyst)).request).toMatchObject({ standing: true, request_id: r1['request_id'] });
    // POSITIVE (an element: no source) → an attention item to the twin owner
    const r2 = (await requestObs({ twinId, input: { kind: 'element', key: 'route.lead_time:SYN-PART-MAG' }, reasonClass: 'missing', note: 'the lead time is not grounded (SYNTHETIC)' }, analyst)).request;
    expect(r2).toMatchObject({ via: 'attention', routed_to: nakamura.principalId });
    expect((await items('twin.observation_request', twinId)).map((x) => x['owner'])).toEqual([approver, nakamura.principalId]);
    // REFUSED: an unknown series (404), a person without the role (the PDP), a stranger cancelling (403)
    await refused(requestObs({ twinId, input: { kind: 'series', series_key: 'fixture:no-such-series' }, reasonClass: 'missing', note: 'a series nobody registered' }), /^observation request rejected \(unknown_series\)/, 404);
    await refused(requestObs({ twinId, input: { kind: 'series', series_key: seriesKey }, reasonClass: 'stale', note: 'not my twin at all' }, outsider), /twin\.observation\.request|not permitted|denied|role/i, 403);
    await refused(cancelRequest(String(r2['request_id']), 'not mine to cancel', kovacs), /^observation request rejected \(ownership\)/, 403);
    // RECOVERED: the requester cancels the element request; a new count fulfils the series request after the tick
    expect((await cancelRequest(String(r2['request_id']), 'grounded by hand instead (SYNTHETIC)', analyst)).request).toMatchObject({ state: 'cancelled' });
    // THE AGENT REQUESTS: the owner moves the head's world cut-off past the series (2024-02-15) — the primary goes stale; an ontology revision wakes the scan
    const head = Number((await versionsOf()).filter((v) => v['state'] === 'admitted').slice(-1)[0]?.['version']);
    const ov = await twins.openVersion(h.req(nakamura, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-02-15', carryFrom: head } }) as { version: { version: number } };
    await twins.admit(h.req(nakamura, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(ov.version.version), { payload: { allowIncomplete: true } });
    const prop = await graph.proposeOntology(h.req(ontAnalyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: ['organization', 'place', 'route', 'vessel'],
      rationale: 'B30: vessels join the vocabulary (SYNTHETIC)', predicates: [{ predicate: 'ships_through', subject_types: ['organization'], object_types: ['place'] }] } }) as unknown as { ontology: { version_id: string } };
    await graph.decideOntology(h.req(ontSteward, 'graph.ontology.decide', 'ONT', prop.ontology.version_id, 'graph'), T(), D(), prop.ontology.version_id, { payload: { decision: 'approve', reason: 'B30: additive vocabulary, reviewed' } });
    const t = await tick();
    expect(arr(t['queued']).map((x) => x['kind'])).toEqual(['ontology_revision']);
    const runId = String(obj(t['scan'])['run_id']);
    const out = obj((await rows(sql`select outputs from executive.agent_runs where run_id = ${runId}::uuid`))[0]?.['outputs']);
    expect(arr(out['proposed'])).toEqual([]);
    expect(arr(out['requested'])).toEqual([expect.objectContaining({ request_id: r1['request_id'], standing: true })]);   // the standing request answers the agent
    expect(arr(t['pending']).length).toBe(1);   // not answered by a proposal: it stays pending
    // RECOVERED: the new count (2024-01-25 … 2024-02-15) fulfils the request and wakes the scan, which proposes
    await collect('2024-01-25', '2024-02-16');
    const t2 = await tick();
    expect(arr(t2['fulfilled']).map((x) => x['request_id'])).toEqual([r1['request_id']]);
    const out2 = obj((await rows(sql`select outputs from executive.agent_runs where run_id = ${String(obj(t2['scan'])['run_id'])}::uuid`))[0]?.['outputs']);
    expect(arr(out2['proposed'])).toHaveLength(1);
    expect((await rows(sql`select state from twin.observation_requests where request_id = ${String(r1['request_id'])}::uuid`))[0]).toMatchObject({ state: 'fulfilled' });
    // POSITIVE (the scheduler path): the source scheduled (the entry recorded through the registry port, as activation records it) — a new
    // request rides the collection scheduler: the entry is recorded with it, no attention item is raised
    const itemsBefore = (await items('twin.observation_request', twinId)).length;
    await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', h.fx.sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.transition', objectType: 'SRC', objectId: h.fx.sourceId }, ObservationCapability.registry,
      async (cap) => { await cap.upsertSchedulerEntry({ sourceId: h.fx.sourceId, tenantId: T(), domainId: D(), contractVersion: h.version, schedulerId: `obs:${T()}:${D()}:src:${h.fx.sourceId}`,
        queueName: `obs:${T()}:${D()}:collection`, cadenceSeconds: 3600, jitterSeconds: 5, status: 'scheduled' }); return { result: {}, targetType: 'SRC', targetId: h.fx.sourceId, targetVersion: String(h.version), outboxEvent: null }; });
    const r3 = (await requestObs({ twinId, key: KEY, input: { kind: 'series', series_key: seriesKey }, reasonClass: 'stale', note: 'tomorrow\'s count is needed (SYNTHETIC)' })).request;
    expect(r3).toMatchObject({ via: 'scheduler', standing: false, attention_item_id: null, scheduler: expect.objectContaining({ cadence_seconds: 3600, scheduler_id: `obs:${T()}:${D()}:src:${h.fx.sourceId}` }) });
    expect((await items('twin.observation_request', twinId)).length).toBe(itemsBefore);
    const o = await overview();
    expect(arr(o['requests']).map((x) => `${String(x['via'])}:${String(x['state'])}`).sort()).toEqual(['attention:cancelled', 'attention:fulfilled', 'scheduler:open']);
    evidenceLog('ES6', { series_request: r1, element_request: r2, fulfilled: t2['fulfilled'], scheduled_request: r3 });
  });
});
