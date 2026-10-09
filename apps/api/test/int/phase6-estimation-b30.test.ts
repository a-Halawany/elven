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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { EstimationService, SCAN_AWAIT_MS } from '../../src/twin/estimation/estimation.service.js';
import { RECONCILIATION_AGENT_DIGEST, RECONCILIATION_AGENT_VERSION } from '../../src/twin/estimation/reconciliation-agent.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, SERIES_START, syntheticEgress, syntheticValue } from './phase4-helpers.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { SeriesService } from '../../src/prediction/series/series.service.js';
import { ConstraintService } from '../../src/twin/constraints/constraint.service.js';
import { ConstraintCapability, type SetWrites } from '../../src/twin/constraints/constraint.capabilities.js';
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
/** ES8's BEFORE mode (EYE_ES8_BASELINE=1, on a database through 0103 only): the approvals under a changed contract SUCCEED — the bypass reproduced. */
const ES8_BASELINE = process.env['EYE_ES8_BASELINE'] === '1';
/** ES9's BEFORE mode (EYE_ES9_BASELINE=1, on a database through 0105 only — no 0106): an approval racing an in-flight contract mutation COMMITS on the old contract. */
const ES9_BASELINE = process.env['EYE_ES9_BASELINE'] === '1';
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
    /* B33 twin (0111 §TW4) — the pin moves: the estimated element cites its evidence AND exactly this estimate (the estimate citation kind) */
    expect(arr(el['citations']).filter((x) => x['kind'] !== 'evidence')).toEqual([{ kind: 'estimate', id: String(e['estimate_id']), version: 1, digest: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(arr(el['citations']).some((x) => x['kind'] === 'evidence')).toBe(true);
    /* end B33 twin */
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

  /*
   * ES7 — the B30 act's finding (the demonstration's PortWatch series: a retention action tombstoned a superseded 2024 seed version, and EVERY
   * estimate on the series was refused for good). An unreadable version now counts only when its day (event time, else valid-from) falls
   * inside the widest window the estimators read, or when it states no day (estimators.ts unreadableInWindow — the window rule unit-proven in
   * test/unit/phase6-estimation-b30.test.ts). This fixture's evidence states NO day (one document per collection, no item time), so here an
   * unreadable version COUNTS: the conservative branch, proven through the real route and the port. LAST in the file: the tombstone degrades
   * the series for the rest of the database's life.
   */
  /**
   * ES9 · THE CONTRACT UNDER CONCURRENCY (0106): two sessions, interleaved deterministically. A REAL governed constraint mutation (the
   * pipeline, the PDP, the signed context, the port) is HELD OPEN after its port ran and before its commit (a test gate in the handler);
   * meanwhile the owner's REAL approval runs. Before 0106 (EYE_ES9_BASELINE=1) the approval commits on the contract it could see and
   * the mutation then commits with an instant BEFORE the approval — the record shows a contract change preceding an approval that never
   * saw it. With 0106 the approval WAITS on the contract's lock (seen in pg_stat_activity: an advisory lock wait in twin.decide_estimate),
   * reads the mutated contract once the mutation commits, and is REFUSED (contract, 409) with nothing admitted; recovered by a fresh
   * proposal. The reverse order (c): a mutation started while an approval's SHARED hold is in flight waits for it and records its instant
   * after it (the hold is a raw superuser session taking the same shared lock — the approval's own transaction cannot be paused from a
   * harness; this is the one stand-in, stated). Deterministic: every wait is observed, never slept for. Placed before ES8: it leaves only
   * `corridor-transit-balance` live (its declared set retired, governed).
   */
  it('ES9 · THE CONTRACT UNDER CONCURRENCY: an approval racing an in-flight version, declaration or retirement waits on the contract lock and is refused on the mutated contract (before 0106 it committed on the old one); a mutation racing an in-flight approval waits and records its instant after it', async () => {
    const pipeline = h.app.get(PipelineService); const svc = h.app.get(ConstraintService);
    /** Every held transaction, released in `finally` — a failing case never leaves a lock behind for the cases after it. */
    const holds: Array<{ release: () => void; done: Promise<unknown> }> = [];
    let releaseShared: () => void = () => undefined;
    try {
    const setRow = (await rows(sql`select set_id::text as set_id, current_version from simulation.constraint_sets where tenant_id = ${T()}::uuid and set_key = 'corridor-transit-balance' and state = 'live'`))[0] as Row;
    const SET = String(setRow['set_id']);
    const CONSERVED = { key: 'transits-conserved', kind: 'conservation', stocks: [KEY], tolerance: 0.5, unit: 'transits/day', applies_to: ['run_input'], title: 'the proposal accounts for the observed count' };
    const effects = async () => ({
      admitted: (await rows(sql`select 1 from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'admitted'`)).length,
      approvals: (await ledger('estimate.approved')).length,
      outbox: (await rows(sql`select 1 from objects.object_outbox where tenant_id = ${T()}::uuid and event_type in ('TwinStateChanged', 'GraphChanged') and payload::text like ${'%' + twinId + '%'}`)).length,
    });
    /** A governed constraint mutation held open after its port ran: `at` resolves with the port's answer, `release()` lets it commit, `done` is the route's result. */
    const hold = (action: string, objectId: string, run: (cap: SetWrites, scope: Parameters<Parameters<PipelineService['write']>[4]>[1]) => Promise<Row>) => {
      let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
      let reached!: (v: Row) => void; const at = new Promise<Row>((r) => { reached = r; });
      const done = pipeline.write(h.env(steward, action, 'CST', objectId, 'twin'), steward, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'CST', objectId },
        ConstraintCapability.set, async (cap, scope) => {
          const r = await run(cap, scope); reached(r); await gate;
          return { result: r, targetType: 'CST', targetId: objectId, targetVersion: String(r['version'] ?? 1), outboxEvent: null };
        });
      const held = { at, release, done }; holds.push(held);
      return held;
    };
    /** Whether a backend is waiting on an ADVISORY lock while running `fn` — polled (up to 10 s), never slept for. */
    const waitingIn = async (fn: string): Promise<boolean> => {
      for (let i = 0; i < 100; i += 1) {
        const n = (await rows(sql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory' and query ilike ${'%' + fn + '%'}`))[0] as Row;
        if (Number(n['n']) > 0) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };
    const settledWithin = async (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
    const ctx = (scope: { tenantId: string | null; domainId: string | null }) => ({ tenantId: scope.tenantId as string, domainId: scope.domainId as string });
    const decidedAt = async (id: string) => String(((await rows(sql`select to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t from twin.estimates where estimate_id = ${id}::uuid`))[0] as Row)['t']);
    const verAt = async (set: string, version: number) => String(((await rows(sql`select to_char(declared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t from simulation.constraint_set_versions where set_id = ${set}::uuid and version = ${version}`))[0] as Row)['t']);
    const out: Row = {};

    // (a1) A VERSION of the pinned set in flight while the owner approves.
    const vA = Number(setRow['current_version']);
    const pA = await propose(); expect(pA).toMatchObject({ constraint: 'satisfied', state: 'proposed' });
    const beforeA = await effects();
    const hv = hold('simulation.constraint.version', SET, async (cap, scope) => svc.version(cap, { ...scope, ...ctx(scope) } as never, SET,
      { expectedVersion: vA, constraints: [CONSERVED, { key: 'share-at-most-99', kind: 'business_rule', quantity: KEY, op: '<=', value: 99, unit: '%', per: 'day', applies_to: ['run_input'] }], note: 'the ES9 race: a version in flight (SYNTHETIC)' },
      steward.principalId, uuidv7()));
    expect(await hv.at).toMatchObject({ version: vA + 1 });
    const apA = decide(String(pA['estimate_id']), 'approved', 'approving while the steward versions the set (ES9)');
    if (ES9_BASELINE) {
      expect(await settledWithin(apA, 10_000), 'before 0106 the approval does not wait for the in-flight version').toBe(true);
      expect((await apA).decision).toMatchObject({ state: 'approved' });
      hv.release(); await hv.done;
      const [d, v] = [await decidedAt(String(pA['estimate_id'])), await verAt(SET, vA + 1)];
      expect(v < d, `the version (${v}) precedes the approval (${d}) the approval never saw`).toBe(true);
      out['a1'] = { approved_on_old_contract: true, version_declared_at: v, approved_at: d };
    } else {
      expect(await waitingIn('decide_estimate'), 'the approval waits on the contract lock while the version is in flight').toBe(true);
      hv.release(); await hv.done;
      await refused(apA, /^estimate rejected \(contract\): .*corridor-transit-balance.*v\d+.*v\d+/, 409);
      expect(await effects()).toEqual(beforeA);
      expect(await readEstimate(String(pA['estimate_id']))).toMatchObject({ state: 'proposed', constraint_check: expect.objectContaining({ pins: [expect.objectContaining({ version: vA })] }) });
      const pA2 = await propose(); expect(pA2).toMatchObject({ constraint: 'satisfied' });
      expect((await decide(String(pA2['estimate_id']), 'approved', 'proposed again after the raced version (ES9)')).decision).toMatchObject({ state: 'approved' });
      out['a1'] = { waited: true, refused: true, recovered: true };
    }

    // (b) A DECLARATION of a newly applicable set in flight while the owner approves (a row no read could lock).
    const pB = await propose(); expect(pB).toMatchObject({ constraint: 'satisfied' });
    const beforeB = await effects();
    const LATE = uuidv7();
    const hd = hold('simulation.constraint.declare', LATE, async (cap, scope) => svc.declare(cap, { ...scope, ...ctx(scope) } as never,
      { setKey: `corridor-es9-late-${LATE.slice(-6)}`, title: 'ES9 — a rule declared during an approval (SYNTHETIC)', steward: null,
        constraints: [{ key: 'share-at-most-100', kind: 'business_rule', quantity: KEY, op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'] }], note: 'the ES9 race: a declaration in flight' } as never,
      steward.principalId, uuidv7(), LATE));
    expect(await hd.at).toMatchObject({ set_id: LATE, version: 1 });
    const apB = decide(String(pB['estimate_id']), 'approved', 'approving while the steward declares a new set (ES9)');
    if (ES9_BASELINE) {
      expect(await settledWithin(apB, 10_000), 'before 0106 the approval does not wait for the in-flight declaration').toBe(true);
      expect((await apB).decision).toMatchObject({ state: 'approved' });
      hd.release(); await hd.done;
      const [d, v] = [await decidedAt(String(pB['estimate_id'])), await verAt(LATE, 1)];
      expect(v < d, `the applicable set (${v}) was declared before the approval (${d}) that never checked it`).toBe(true);
      out['b'] = { approved_without_the_new_set: true, set_declared_at: v, approved_at: d };
    } else {
      expect(await waitingIn('decide_estimate'), 'the approval waits on the contract lock while the declaration is in flight').toBe(true);
      hd.release(); await hd.done;
      await refused(apB, /^estimate rejected \(contract\): constraint set corridor-es9-late-.* came to apply after estimate/, 409);
      expect(await effects()).toEqual(beforeB);
      expect((await readEstimate(String(pB['estimate_id'])))['state']).toBe('proposed');
      const pB2 = await propose(); expect(pB2).toMatchObject({ constraint: 'satisfied' });
      expect((await readEstimate(String(pB2['estimate_id'])))['constraint_check']).toMatchObject({ pins: expect.arrayContaining([expect.objectContaining({ set_id: LATE })]) });
      expect((await decide(String(pB2['estimate_id']), 'approved', 'proposed again under the declared set (ES9)')).decision).toMatchObject({ state: 'approved' });
      out['b'] = { waited: true, refused: true, recovered: true };
    }

    // (a2) A RETIREMENT of a pinned set (the one (b) declared) in flight while the owner approves.
    const pC = await propose(); expect(pC).toMatchObject({ constraint: 'satisfied' });
    expect((await readEstimate(String(pC['estimate_id'])))['constraint_check']).toMatchObject({ pins: expect.arrayContaining([expect.objectContaining({ set_id: LATE })]) });
    const beforeC = await effects();
    const hr = hold('simulation.constraint.retire', LATE, async (cap, scope) => svc.retire(cap, { ...scope, ...ctx(scope) } as never, LATE, 'the ES9 race: a retirement in flight (SYNTHETIC)', steward.principalId, uuidv7()));
    expect(await hr.at).toMatchObject({ state: 'retired' });
    const apC = decide(String(pC['estimate_id']), 'approved', 'approving while the steward retires a pinned set (ES9)');
    if (ES9_BASELINE) {
      expect(await settledWithin(apC, 10_000), 'before 0106 the approval does not wait for the in-flight retirement').toBe(true);
      expect((await apC).decision).toMatchObject({ state: 'approved' });
      hr.release(); await hr.done;
      const d = await decidedAt(String(pC['estimate_id']));
      const r = String(((await rows(sql`select to_char(retired_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t from simulation.constraint_sets where set_id = ${LATE}::uuid`))[0] as Row)['t']);
      expect(r < d, `the pinned set was retired (${r}) before the approval (${d}) that relied on it`).toBe(true);
      out['a2'] = { approved_on_a_retired_set: true, retired_at: r, approved_at: d };
    } else {
      expect(await waitingIn('decide_estimate'), 'the approval waits on the contract lock while the retirement is in flight').toBe(true);
      hr.release(); await hr.done;
      await refused(apC, /^estimate rejected \(contract\): constraint set corridor-es9-late-.* is retired/, 409);
      expect(await effects()).toEqual(beforeC);
      expect((await readEstimate(String(pC['estimate_id'])))['state']).toBe('proposed');
      out['a2'] = { waited: true, refused: true };
    }

    // (c) THE REVERSE ORDER: an approval's SHARED hold in flight (the stand-in session) while the steward versions the set.
    const vC = Number(((await rows(sql`select current_version from simulation.constraint_sets where set_id = ${SET}::uuid`))[0] as Row)['current_version']);
    const sharedGate = new Promise<void>((r) => { releaseShared = r; });
    let heldAt!: (t: string) => void; const sharedHeld = new Promise<string>((r) => { heldAt = r; });
    let releasedAt = '';
    const sharedTx = h.su.transaction().execute(async (tx) => {
      await sql`select pg_advisory_xact_lock_shared(hashtextextended(${'simulation.constraint_contract:' + T() + ':' + D()}, 0))`.execute(tx);
      heldAt('held'); await sharedGate;
      releasedAt = String(((await sql<{ t: string }>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`.execute(tx)).rows[0])!.t);
    });
    await sharedHeld;
    const verC = cons.version(h.req(steward, 'simulation.constraint.version', 'CST', SET, 'twin'), T(), D(), SET,
      { payload: { expectedVersion: vC, constraints: [CONSERVED, { key: 'share-at-most-100', kind: 'business_rule', quantity: KEY, op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'] }], note: 'the ES9 reverse race: a version during an approval (SYNTHETIC)' } }) as Promise<{ set: Row }>;
    if (ES9_BASELINE) {
      expect(await settledWithin(verC, 10_000), 'before 0106 the version does not wait for an approval in flight').toBe(true);
      releaseShared(); await sharedTx;
      const v = await verAt(SET, vC + 1);
      expect(v < releasedAt, 'the version is recorded inside the approval\'s window').toBe(true);
      out['c'] = { version_inside_the_approval_window: true };
    } else {
      expect(await waitingIn('version_constraint_set'), 'the version waits on the contract lock while an approval holds it').toBe(true);
      releaseShared(); await sharedTx;
      expect((await verC).set).toMatchObject({ version: vC + 1 });
      const v = await verAt(SET, vC + 1);
      expect(v > releasedAt, `the version's instant (${v}) follows the approval's hold (${releasedAt})`).toBe(true);
      out['c'] = { waited: true, recorded_after: true };
    }
    evidenceLog('ES9', { baseline: ES9_BASELINE, ...out });
    } finally {
      releaseShared();
      for (const x of holds) { x.release(); await x.done.catch(() => undefined); }
    }
  });

  it('ES8 · THE CONSTRAINT CONTRACT AT PUBLICATION: an approval re-checks that the set versions the proposal was checked against are still the live ones — a set re-versioned (v2 the proposal violates) or retired between proposal and approval REFUSES the approval with nothing admitted, no approval event, no outbox; the proposal keeps its historical check; recovered by a fresh proposal; the unchanged contract approves', async () => {
    const setRow = (await rows(sql`select set_id::text as set_id, current_version, state from simulation.constraint_sets where tenant_id = ${T()}::uuid and set_key = 'corridor-transit-balance'`))[0] as Row;
    const SET = String(setRow['set_id']);
    const versionSet = (expectedVersion: number, constraints: Row[], note: string) =>
      cons.version(h.req(steward, 'simulation.constraint.version', 'CST', SET, 'twin'), T(), D(), SET, { payload: { expectedVersion, constraints, note } }) as Promise<{ set: Row }>;
    const CONSERVED = { key: 'transits-conserved', kind: 'conservation', stocks: [KEY], tolerance: 0.5, unit: 'transits/day', applies_to: ['run_input'], title: 'the proposal accounts for the observed count' };
    const effects = async () => ({
      admitted: (await rows(sql`select 1 from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'admitted'`)).length,
      drafts: (await rows(sql`select 1 from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'draft'`)).length,
      approvals: (await ledger('estimate.approved')).length,
      outbox: (await rows(sql`select 1 from objects.object_outbox where tenant_id = ${T()}::uuid and event_type in ('TwinStateChanged', 'GraphChanged') and payload::text like ${'%' + twinId + '%'}`)).length,
    });
    // POSITIVE (the contract unchanged): proposed against the live set version, approved
    const v0 = Number(setRow['current_version']);
    const p0 = await propose();
    expect(p0).toMatchObject({ constraint: 'satisfied', state: 'proposed' });
    expect((await readEstimate(String(p0['estimate_id'])))['constraint_check']).toMatchObject({ pins: [expect.objectContaining({ set_key: 'corridor-transit-balance', version: v0 })] });
    const ok0 = await decide(String(p0['estimate_id']), 'approved', 'the contract is unchanged since the proposal (SYNTHETIC)');
    expect(ok0.decision).toMatchObject({ state: 'approved' });
    // RE-VERSIONED: a proposal checked against v(n); the steward publishes v(n+1) the proposal violates (the share capped at 10 %), the head untouched
    const p1 = await propose();
    expect(p1).toMatchObject({ constraint: 'satisfied' });
    const vio = await versionSet(v0, [CONSERVED, { key: 'share-at-most-10', kind: 'business_rule', quantity: KEY, op: '<=', value: 10, unit: '%', per: 'day', applies_to: ['run_input'] }],
      'the corridor share capped at ten per cent for the audit (SYNTHETIC)');
    expect(vio.set).toBeTruthy();
    expect(Number(((await rows(sql`select current_version from simulation.constraint_sets where set_id = ${SET}::uuid`))[0] as Row)['current_version'])).toBe(v0 + 1);
    const before1 = await effects();
    if (ES8_BASELINE) {   // BEFORE 0104: approved under the changed contract — a new snapshot admitted, an approval event, the outbox
      expect((await decide(String(p1['estimate_id']), 'approved', 'approving under a contract that changed')).decision).toMatchObject({ state: 'approved' });
      const after1 = await effects();
      expect([after1.admitted - before1.admitted, after1.approvals - before1.approvals, after1.outbox > before1.outbox]).toEqual([1, 1, true]);
    } else {
      await refused(decide(String(p1['estimate_id']), 'approved', 'approving under a contract that changed'), /^estimate rejected \(contract\): .*corridor-transit-balance.*v\d+.*v\d+/, 409);
      expect(await effects()).toEqual(before1);   // nothing admitted, no draft, no approval event, no outbox
    }
    const kept1 = await readEstimate(String(p1['estimate_id']));
    expect(kept1).toMatchObject({ state: ES8_BASELINE ? 'approved' : 'proposed', constraint_check: expect.objectContaining({ outcome: 'satisfied', pins: [expect.objectContaining({ version: v0 })] }) });   // its history kept
    // RECOVERED: a fresh proposal under v(n+1) is checked against it (violated — not approvable); the steward restores a satisfiable v(n+2); a fresh proposal approves
    const p1b = await propose();
    expect(p1b).toMatchObject({ constraint: 'violated' });
    await versionSet(v0 + 1, [CONSERVED, { key: 'share-at-most-100', kind: 'business_rule', quantity: KEY, op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'] }],
      'the cap restored to one hundred per cent (SYNTHETIC)');
    const p1c = await propose();
    expect(p1c).toMatchObject({ constraint: 'satisfied' });
    expect((await decide(String(p1c['estimate_id']), 'approved', 'proposed again under the live contract (SYNTHETIC)')).decision).toMatchObject({ state: 'approved' });
    // RETIRED: a proposal checked against the live set; the steward retires the set before the approval
    const p2 = await propose();
    expect(p2).toMatchObject({ constraint: 'satisfied' });
    await cons.retire(h.req(steward, 'simulation.constraint.retire', 'CST', SET, 'twin'), T(), D(), SET, { payload: { reason: 'the corridor balance is checked elsewhere now (SYNTHETIC)' } });
    const before2 = await effects();
    if (ES8_BASELINE) {   // BEFORE 0104: approved under the retired contract
      expect((await decide(String(p2['estimate_id']), 'approved', 'approving under a retired contract')).decision).toMatchObject({ state: 'approved' });
      const after2 = await effects();
      expect([after2.admitted - before2.admitted, after2.approvals - before2.approvals, after2.outbox > before2.outbox]).toEqual([1, 1, true]);
    } else {
      await refused(decide(String(p2['estimate_id']), 'approved', 'approving under a retired contract'), /^estimate rejected \(contract\): .*corridor-transit-balance.*retired/, 409);
      expect(await effects()).toEqual(before2);
      expect((await readEstimate(String(p2['estimate_id'])))['state']).toBe('proposed');
    }
    // RECOVERED: a fresh proposal checked against what is live now (no set applies — stated vacuous), approved
    const p2b = await propose();
    expect(p2b).toMatchObject({ constraint: 'satisfied' });
    expect((await readEstimate(String(p2b['estimate_id'])))['constraint_check']).toMatchObject({ vacuous: true, pins: [] });
    expect((await decide(String(p2b['estimate_id']), 'approved', 'proposed again after the retirement (SYNTHETIC)')).decision).toMatchObject({ state: 'approved' });
    evidenceLog('ES8', { revisioned_refused: true, retired_refused: true, recovered: true });
  });

  /*
   * ES10 · THE LIVE-DEMO REGRESSION OF 2026-10-07 — A SCAN THAT OUTLIVES ITS SESSION. On eye_demo a new PortWatch count queued a telemetry
   * check; the after-tick hook ran the Reconciliation Agent's reconcile_scan INLINE (the tick awaited it) and the scan read the corridor's
   * whole history — ~9,000 governed retrievals per read, read twice (compute, then propose) — under sessions that live 15 minutes: the tick
   * was held (the queue runs one job at a time), both sessions lapsed, neither run could close, and the tick's lapsed close was recorded as a
   * refusal "before any session". Here the series read is HELD (a spy on SeriesService.assemble waits on a gate — fixture, said) and the
   * agent's session is lapsed while it is held (fixture scaffolding on identity.sessions, as the scheduled-collection harness does): the
   * 15 minutes the real read outlived, without the wait. Before the fix (b70a434) the same case asserted (a) the tick held, (b) both runs
   * left running, (c) the tick misrecorded, (d) both closes refused. Placed before ES7 (whose tombstone degrades the series for good).
   */
  const reconAgent = async () => String((await rows(sql`select agent_id::text a from executive.agents where tenant_id = ${T()}::uuid and agent_kind = 'reconciliation' and status = 'active' order by created_at desc limit 1`))[0]?.['a']);
  const principalOf = async (agentId: string) => String((await rows(sql`select principal_id::text p from executive.agents where agent_id = ${agentId}::uuid`))[0]?.['p']);
  const runsOf = async (agentId: string) => rows(sql`select run_id::text, outcome, spent, stop_reason, trigger_ref, finished_at, escalated_to::text, outputs, correlation_id::text from executive.agent_runs where agent_id = ${agentId}::uuid order by started_at`);

  it('ES10 · A SCAN THAT OUTLIVES ITS SESSION (the demo regression): the tick returns while the scan goes on; a tick meanwhile starts no second scan; the lapsed scan ENDS stopped with the reason, closed under a new session; the next tick completes and the scan reads the series once', async () => {
    const series = h.app.get(SeriesService); const estimation = h.app.get(EstimationService);
    const recon = await reconAgent(); const reconP = await principalOf(recon);
    const reconBefore = (await runsOf(recon)).map((r) => r['run_id']);
    // TELEMETRY: a new count (2024-02-16 … 2024-02-20) — the next tick queues a check and the hook starts the scan
    await collect('2024-02-16', '2024-02-21');
    let release: () => void = () => undefined; const gate = new Promise<void>((r) => { release = r; });
    let entered: () => void = () => undefined; const inRead = new Promise<void>((r) => { entered = r; });
    const original = series.assemble.bind(series);
    const spy = vi.spyOn(series, 'assemble').mockImplementation(async (...a: Parameters<SeriesService['assemble']>) => { entered(); await gate; return original(...a); });
    estimation.scanAwaitMs = 1_000;   // the tick's wait on the scan, shortened (30 s in the field)
    let reconRun: Row | undefined;
    try {
      day += 1;
      const tickP = timer.tickNow({ tenantId: T(), domainId: D(), agentId: attentionAgent, scheduledAt: new Date(Date.UTC(2038, 0, day)) });
      await inRead;   // the scan is inside its series read
      // (a) THE TICK IS NOT HELD: it returns with the scan in flight, its own run FINISHED (one run of the job, no refusal recorded beside it)
      const raced = await Promise.race([tickP.then(() => 'returned'), new Promise<string>((r) => { setTimeout(() => r('blocked'), 15_000); })]);
      expect(raced, 'the attention tick waited on the scan').toBe('returned');
      const t = await tickP;
      expect(t.outcome, String(t.stopReason)).toBe('finished');
      expect(obj(obj(obj(t.run?.outputs)['after'])['twin-estimation'])['scan']).toMatchObject({ in_flight: true, agent_id: recon });
      expect((await runsOf(attentionAgent)).filter((r) => r['trigger_ref'] === t.jobId).map((r) => r['outcome'])).toEqual(['finished']);
      // (c) A TICK WHILE THE SCAN IS LIVE completes and starts NO second scan of the agent; the check waits for the scan in flight
      const t2 = await tick();
      expect(String(obj(t2['scan'])['skipped'])).toMatch(/^a reconcile scan of agent .* is in flight since /);
      expect((await runsOf(recon)).filter((r) => !reconBefore.includes(r['run_id']))).toHaveLength(1);
      // the agent's session lapses while its read is held (the real read outlived its 15 minutes)
      await sql`update identity.sessions set expires_at = clock_timestamp() - interval '1 second'
        where principal_id = ${reconP}::uuid and assurance = 'agent_grant' and expires_at > clock_timestamp()`.execute(h.su);
      release();
      // (b) THE RUN ENDS: its next read is refused for the lapse; the agent closes the run under a new session — STOPPED, with the reason
      for (let i = 0; i < 300; i += 1) {
        reconRun = (await runsOf(recon)).find((r) => !reconBefore.includes(r['run_id']));
        if (reconRun !== undefined && reconRun['outcome'] !== 'running') break;
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally { release(); spy.mockRestore(); estimation.scanAwaitMs = SCAN_AWAIT_MS; }
    expect(reconRun).toMatchObject({ outcome: 'stopped', escalated_to: execOwner.principalId });
    expect(String(reconRun?.['stop_reason'])).toMatch(/^session lapsed: the run's session ended at .* before the run did; its next effect was refused \(authority insufficient for this operation\)/);
    expect(reconRun?.['finished_at']).not.toBeNull();
    expect(obj(reconRun?.['spent'])['elapsed_ms']).toEqual(expect.any(Number));
    expect(obj(obj(reconRun?.['outputs'])['closed_under_new_session'])['reason']).toMatch(/refused under its own session/);
    // (d) THE TERMINAL EVENT IS WRITTEN: the refused close is evidenced (capability denied, session_not_active) and the close under the new
    //     session committed (agent.run on the run: the open and the close)
    const audit = await rows(sql`select event_type, outcome, event -> 'metadata' as m from audit.audit_events where correlation_id = ${String(reconRun?.['correlation_id'])}::uuid
      and (event_type = 'request.capability_denied' or (action = 'agent.run' and event ->> 'target_id' = ${String(reconRun?.['run_id'])}))`);
    expect(audit.filter((x) => x['event_type'] === 'request.capability_denied').map((x) => `${String(obj(x['m'])['route_action'])}:${String(obj(x['m'])['denial_class'])}`)).toContain('agent.run:session_not_active');
    expect(audit.filter((x) => x['event_type'] !== 'request.capability_denied' && x['outcome'] === 'success')).toHaveLength(2);
    // THE NEXT TICK completes; its scan answers the check, reading the series ONCE (compute's read is the proposal's)
    const reads = vi.spyOn(series, 'assemble');
    let next!: Row; let assembled = -1;
    try { next = await tick(); assembled = reads.mock.calls.length; } finally { reads.mockRestore(); }
    expect(obj(next['scan'])).toMatchObject({ outcome: 'finished' });
    expect(assembled).toBe(1);
    expect((await tick())['pending']).toEqual([]);
    evidenceLog('ES10', { recon_run: { outcome: reconRun?.['outcome'], stop_reason: reconRun?.['stop_reason'] }, skipped: 'second scan', next_scan: next['scan'], assembled });
  }, 240_000);

  it('ES11 · RUNS LEFT RUNNING ON A DATABASE (eye_demo: 64 + 64 since 2026-10-07): the next tick closes the attention agent\'s, its scan the reconciliation agent\'s — stopped with the reason, each by the agent under its new session — and the tick completes; a run inside its session\'s lifetime is left alone', async () => {
    const recon = await reconAgent();
    // fixture scaffolding: two runs per agent left `running` two hours ago with nothing spent — the shape eye_demo carries (no governed path
    // leaves one now) — and one attention run started a minute ago (inside its session's lifetime)
    const stale: string[] = [];
    const leave = async (agentId: string, ago: string): Promise<string> => {
      const id = uuidv7();
      await sql`insert into executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_ref, budget, started_at, correlation_id)
        select ${id}::uuid, 'DOMAIN', tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, case agent_kind when 'attention' then 'attention_tick' else 'reconcile_scan' end,
               'scheduler', 'es11-fixture', budgets, clock_timestamp() - ${ago}::interval, ${uuidv7()}::uuid from executive.agents where agent_id = ${agentId}::uuid`.execute(h.su);
      return id;
    };
    for (const agentId of [attentionAgent, attentionAgent, recon, recon]) stale.push(await leave(agentId, '2 hours'));
    const recent = await leave(attentionAgent, '1 minute');
    // a new count, so the tick's scan runs
    await collect('2024-02-21', '2024-02-24');
    const t = await tick();
    expect(obj(t['scan'])).toMatchObject({ outcome: 'finished' });
    const closed = await rows(sql`select run_id::text, agent_id::text, outcome, stop_reason, finished_at, escalated_to::text, outputs from executive.agent_runs where run_id = any(${stale}::uuid[]) order by agent_id, started_at`);
    expect(closed.map((r) => r['outcome'])).toEqual(['stopped', 'stopped', 'stopped', 'stopped']);
    for (const r of closed) {
      expect(String(r['stop_reason'])).toMatch(/^session lapsed: the run started at .* and was still running a session's lifetime \(900 s\) later .* closed by the agent at the start of its run /);
      expect(r['finished_at']).not.toBeNull();
      expect(r['escalated_to']).not.toBeNull();
    }
    // the runs that closed them say so (outputs.lapsed_closed): the attention tick's own run, and its scan's
    const closers = await rows(sql`select agent_id::text, outcome, outputs -> 'lapsed_closed' as l from executive.agent_runs where tenant_id = ${T()}::uuid and outputs ? 'lapsed_closed'`);
    expect(closers.map((r) => `${String(r['agent_id'])}:${String(r['outcome'])}:${arr(r['l']).length}`).sort()).toEqual([`${attentionAgent}:finished:2`, `${recon}:finished:2`].sort());
    expect((await rows(sql`select outcome from executive.agent_runs where run_id = ${recent}::uuid`))[0]).toMatchObject({ outcome: 'running' });
    evidenceLog('ES11', { closed: closed.map((r) => ({ agent: r['agent_id'], outcome: r['outcome'] })), closers: closers.map((r) => r['agent_id']) });
  }, 240_000);

  it('ES7 · AN UNREADABLE VERSION THAT STATES NO DAY STILL DISQUALIFIES (the window rule\'s conservative branch); the preview discloses why — nothing proposed', async () => {
    const evd = await rows(sql`select (payload ->> 'manifest_id') as manifest, to_char(coalesce(event_time, valid_from) at time zone 'UTC', 'YYYY-MM-DD') as day from objects.canonical_objects
      where object_type = 'EVD' and tenant_id = ${T()}::uuid and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`);
    expect(evd.every((e) => e['day'] === null), JSON.stringify(evd.map((e) => e['day']))).toBe(true);
    const qualifiedBefore = arr(arr((await preview())['qualification'])[0]?.['inputs'])[0];
    expect(qualifiedBefore).toMatchObject({ verdict: 'qualified', cadence: expect.objectContaining({ unreadable: 0 }) });
    await sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${String((evd[0] as Row)['manifest'])}::uuid, 'ES7: superseded evidence past its retention (SYNTHETIC)', ${nakamura.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const pv = await preview();
    const q = arr(arr(pv['qualification'])[0]?.['inputs'])[0];
    expect(q, JSON.stringify(q)).toMatchObject({ verdict: 'disqualified', cadence: expect.objectContaining({ unreadable: 1 }) });
    expect(arr(q?.['reasons']).join(' ')).toMatch(/1 evidence version\(s\) of the series could not be read/);
    const before = (await estimateRows()).length;
    await refused(propose(), /^estimate rejected \(unqualified\): .*evidence version\(s\) of the series could not be read/, 422);
    expect((await estimateRows()).length).toBe(before);
    evidenceLog('ES7', { days: evd.map((e) => e['day']), disqualified: q?.['reasons'] });
  });
});
