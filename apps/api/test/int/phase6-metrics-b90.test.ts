/**
 * CP-6 B90 §M (0095) — THE SEMANTIC ANALYTICS LAYER AND CERTIFIED METRICS, through the real database and controllers (F-P7-F-10; V7 ch44
 * DP-44-001..006; DAT-SV-04; the Strategic Health Score data model). A Strategy Graph MSR "Corridor exposure (EUR at risk)" with EUR
 * readings → the metric product (kind metric, the prelude's registry) → DECLARED over measure_observations at grain month → CERTIFIED by
 * the owner (signed; the canonical MET admitted) → SERVED in the executive view with its grain and source revision → a second model "(draft)"
 * uncertified: the executive view refuses, the analyst view serves it MARKED → a definition change records the DIFF and WITHDRAWS the
 * certification (the servings exposed) → re-certified → the health score model (grain component) certified and served → REPRODUCIBILITY:
 * a stated superuser move changes a source reading → the recalculation withdraws (reason reproducibility, the diverged serving named) →
 * the EXPIRY SWEEP (the tick step metric-certification: a stated superuser move puts a certification's expiry in the past) → the ledgers.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). The signing key is
 * this process's own Ed25519 pair, bound as EYE_EXECUTIVE_SIGNING_KEY_DEMO before the harness boots. Stated superuser moves: a source
 * reading's value changed under a disabled append-only trigger (the reproducibility fault); a certification's expiry moved into the past
 * under a disabled forward trigger (the expiry fault). Every "as of" instant is the DATABASE's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { MetricsController } from '../../src/products/metrics/metrics.controller.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// THE SIGNING KEY: this process's own pair, by reference (the §0 discipline), set before the harness boots.
const KEY_REF = 'EYE_EXECUTIVE_SIGNING_KEY_DEMO';
const PAIR = generateKeyPairSync('ed25519');
process.env[KEY_REF] = PAIR.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const PUBLIC_PEM = PAIR.publicKey.export({ format: 'pem', type: 'spki' }).toString();
// this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b90m-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let products: ProductsController; let metrics: MetricsController; let scheduler: SchedulerService; let timer: AttentionTimerService; let signatures: SignatureService;
/** The steward, the owner (a strategy owner who also holds data_steward — the port's authority rules are the ones that refuse), the executive (the world's), an analyst, the administrators, an outsider. */
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentId = '';
/** What the cases leave one another. */
let MSR = ''; let P_EUR = ''; let P_DRAFT = ''; let P_HSS = ''; let P_EVT = ''; let EFF = ''; let I1 = '';
let AS_OF_EUR = ''; let SERVING_EUR = ''; let AS_OF_HSS = ''; let CERT_EUR_1 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v ?? {}) as Row;

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
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(su)).rows[0]!.t.toISOString();
const dbAhead = async (ahead: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() + ${ahead}::interval t`.execute(su)).rows[0]!.t.toISOString();

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const register = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const define = (as: AuthenticatedPrincipal, id: string, payload: Row) => metrics.define(E(as, 'products.metric.declare', 'MET', id), T(), D(), id, { payload }) as Promise<{ metric: Row }>;
const certify = (as: AuthenticatedPrincipal, id: string, version: number, expiresAt: string) => metrics.certify(E(as, 'products.metric.certify', 'MET', id), T(), D(), id, { payload: { version, expiresAt } }) as Promise<{ metric: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason: string) => metrics.withdraw(E(as, 'products.metric.withdraw_certification', 'MET', id), T(), D(), id, { payload: { reason } }) as Promise<{ metric: Row }>;
const serve = (as: AuthenticatedPrincipal, key: string, payload: Row) => metrics.serve(E(as, 'products.metric.serve', 'MET'), T(), D(), key, { payload }) as Promise<{ serving: Row }>;
const recalculate = (as: AuthenticatedPrincipal, id: string, asOf: string) => metrics.recalculate(E(as, 'products.metric.recalculate', 'MET', id), T(), D(), id, { payload: { asOf } }) as Promise<{ recalculation: Row }>;
const get = (as: AuthenticatedPrincipal, id: string) => metrics.get(E(as, 'products.metric.read', 'MET', id), T(), D(), id) as Promise<{ metric: Row }>;
const list = (as: AuthenticatedPrincipal, payload: Row = {}) => metrics.list(E(as, 'products.metric.read', 'MET'), T(), D(), { payload }) as Promise<{ metrics: Row[] }>;
const catalog = (as: AuthenticatedPrincipal) => metrics.catalog(E(as, 'products.metric.read', 'MET'), T(), D()) as Promise<{ measures: Row }>;
const declareStrategy = async (as: AuthenticatedPrincipal, objectType: string, title: string): Promise<string> =>
  ((await w.graph.declare(h.req(as, 'graph.strategy.declare', objectType, null, 'graph'), T(), D(), { payload: { objectType, title, statement: `${title} (B90 harness, SYNTHETIC)`, status: 'active',
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the measure is about the corridor through this strait (B90 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
const defineMeasure = (as: AuthenticatedPrincipal, id: string, objectiveId: string, over: Row = {}) => w.graph.defineMeasure(h.req(as, 'graph.measure.define', 'MSR', id, 'graph'), T(), D(), id,
  { payload: { objectiveId, unit: 'EUR', direction: 'lower_better', targetValue: 500000, targetDate: '2027-06-30', freshnessDays: 60, ...over } }) as Promise<{ measure: Row }>;
const observe = (as: AuthenticatedPrincipal, id: string, value: number, observedAt: string) => w.graph.observeMeasure(h.req(as, 'graph.measure.observe', 'MSR', id, 'graph'), T(), D(), id,
  { payload: { value, observedAt, source: { kind: 'evidence', id: w.evd.id } } }) as Promise<{ observation: Row }>;
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
/** An indicator evaluation PLANTED (stated): the value, the observation date (the database's current_date − n) and when it became known. */
const plantEvaluation = async (indicatorId: string, value: number, observedDaysAgo: number, knownAgo: string) =>
  sql`insert into prediction.indicator_evaluations (evaluation_id, scope, tenant_id, domain_id, indicator_id, evaluated_at, known_at, observation_at, value, evidence_object_id, evidence_version, satisfied, streak, breached, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${indicatorId}::uuid, clock_timestamp(), clock_timestamp() - ${knownAgo}::interval, current_date - ${observedDaysAgo}::int, ${value},
              ${w.evd.id}::uuid, ${w.evd.version}, true, 0, false, ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
const BANDS = [{ key: 'healthy', min: 70 }, { key: 'watch', min: 50 }, { key: 'critical', min: 0 }];
const HEALTH_MODEL = (): Row => ({
  min_coverage: 0.5, change_points: 10, min_confidence: 0.5,
  dimensions: [{ key: 'supply_resilience', label: 'Supply resilience', weight: 1, objective_ids: [w.objectiveId], bands: BANDS }],
  components: [
    { key: 'corridor_risk', label: 'Corridor transits (Bab el-Mandeb)', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I1, weight: 0.6, direction: 'higher_better', normalisation: { worst: 20, best: 60 }, stale_after_days: 14 },
    { key: 'corridor_indicator_live', label: 'Corridor collapse indicator', dimension: 'supply_resilience', input_kind: 'indicator', input_id: w.indicatorId, weight: 0.4, direction: 'higher_better', normalisation: { worst: 20, best: 80 }, stale_after_days: 3650 },
  ],
});
const EUR_DEFINITION = (over: Row = {}): Row => ({ measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR }, effectiveFrom: EFF, ...over });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { MetricsController: MC } = await import('../../src/products/metrics/metrics.controller.js');
  products = h.app.get(PC); metrics = h.app.get(MC);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService); signatures = h.app.get(SignatureService);
  w = await bootDecisionWorld(h);
  executive = w.executive;
  steward = await h.humanWithSession(['data_steward'], 'b90m-steward');
  owner = await h.humanWithSession(['strategy_owner', 'data_steward'], 'b90m-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b90m-analyst');
  dadmin = await h.humanWithSession(['domain_admin'], 'b90m-dadmin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b90m-tenant-admin', 'TENANT');
  outsider = await h.humanWithSession(['collection_manager'], 'b90m-outsider');
  // the attention agent: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // THE SOURCE (SYNTHETIC): a Strategy Graph MSR in EUR with three readings, 40 days apart (never two in one month), observed at the DATABASE's instants
  MSR = await declareStrategy(owner, 'MSR', 'Corridor exposure (EUR at risk)');
  await defineMeasure(owner, MSR, w.objectiveId);
  await observe(owner, MSR, 420000, await dbInstant('90 days'));
  await observe(owner, MSR, 610000, await dbInstant('50 days'));
  await observe(owner, MSR, 550000, await dbInstant('10 days'));
  EFF = await dbInstant('80 days');
  // THE HEALTH SCORE (SYNTHETIC): one indicator with a planted evaluation, the live corridor indicator evaluated through the real route, a two-component model proposed by the executive and approved by the domain administrator, computed once
  I1 = ((await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
    { payload: { seriesKey: w.seriesKey, description: 'SYNTHETIC NORDWERK corridor transits per day (B90 harness)', comparator: '<', threshold: 30, consecutiveDays: 1, owner: w.twinOwner.principalId } })) as { indicator: { indicatorId: string } }).indicator.indicatorId;
  await plantEvaluation(I1, 52, 2, '2 days');
  await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId, 'prediction'), T(), D(), w.indicatorId, { payload: { knownAt: await dbInstant('1 second') } });
  const def = (await w.exec.proposeHealthDefinition(h.req(executive, 'executive.health.definition.propose', 'HSD', null, 'executive'), T(), D(), { payload: { model: HEALTH_MODEL(), reason: 'the B90 metrics harness health model (SYNTHETIC)' } as never }) as unknown as { definition: Row }).definition;
  await w.exec.approveHealthDefinition(h.req(dadmin, 'executive.health.definition.approve', 'HSD', String(def['definition_id']), 'executive'), T(), D(), String(def['definition_id']), { payload: { note: 'approved for the B90 metrics harness (SYNTHETIC)' } });
  await w.exec.computeHealthScore(h.req(analyst, 'executive.health.compute', 'HSS', null, 'executive'), T(), D(), { payload: {} });
  // THE PRODUCTS (the prelude's registry): three of kind metric, one of kind event (the kind refusal)
  P_EUR = String((await register(steward, { key: 'corridor-exposure-eur', title: 'Corridor exposure (EUR at risk) (SYNTHETIC)', kind: 'metric', purpose: 'the certified corridor exposure metric served to the executive view', ownerPrincipalId: owner.principalId })).product['product_id']);
  P_DRAFT = String((await register(owner, { key: 'corridor-exposure-eur-draft', title: 'Corridor exposure (EUR at risk) (draft)', kind: 'metric', purpose: 'an analyst draft of the exposure metric, never certified', ownerPrincipalId: owner.principalId })).product['product_id']);
  P_HSS = String((await register(steward, { key: 'strategic-health-score', title: 'Strategic Health Score (SYNTHETIC)', kind: 'metric', purpose: 'the decomposable health score as a certified metric', ownerPrincipalId: executive.principalId })).product['product_id']);
  P_EVT = String((await register(steward, { key: 'corridor-' + 'warning-stream', title: 'Corridor warning stream (SYNTHETIC)', kind: 'event', purpose: 'an event product, not a semantic model', ownerPrincipalId: owner.principalId })).product['product_id']);
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  await h?.close();
}, 120_000);

describe('B90 §M · (a) the declaration: a declarative definition over a whitelisted measure, versioned and digested', () => {
  it('POSITIVE: the owner declares the exposure metric over measure_observations at grain month (filters on the MSR); the steward declares the draft (avg) and the health score model (grain component); the catalogue names the three measures', async () => {
    const m = (await define(owner, P_EUR, EUR_DEFINITION())).metric;
    expect(m).toMatchObject({ model_id: P_EUR, metric_key: 'corridor-exposure-eur', title: 'Corridor exposure (EUR at risk) (SYNTHETIC)', state: 'declared', version: 1, current_version: 1, certified_version: null,
      measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR }, owner_principal_id: owner.principalId });
    expect(String(m['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(String(m['effective_from'])).toISOString()).toBe(EFF);
    expect(obj(m['measure_spec'])['grains']).toEqual(['measure', 'objective', 'day', 'week', 'month']);
    expect(arr(m['events']).map((e) => e['event'])).toEqual(['metric.declared']);
    const d = (await define(steward, P_DRAFT, EUR_DEFINITION({ aggregation: 'avg', title: 'Corridor exposure (EUR at risk) — draft' }))).metric;
    expect(d).toMatchObject({ metric_key: 'corridor-exposure-eur-draft', state: 'declared', version: 1, aggregation: 'avg', title: 'Corridor exposure (EUR at risk) — draft' });
    expect(d['digest']).not.toBe(m['digest']);
    const s = (await define(steward, P_HSS, { measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component', dimensions: ['definition_id', 'component_key'], filters: {} })).metric;
    expect(s).toMatchObject({ metric_key: 'strategic-health-score', state: 'declared', version: 1, grain: 'component', owner_principal_id: executive.principalId });
    expect((await list(analyst)).metrics.map((x) => x['metric_key']).sort()).toEqual(['corridor-exposure-eur', 'corridor-exposure-eur-draft', 'strategic-health-score']);
    expect(Object.keys((await catalog(analyst)).measures).sort()).toEqual(['exposure_eur_at_risk', 'health_score', 'measure_observations']);
  });
  it('REFUSAL: a measure outside the whitelist, a grain or a dimension the measure does not allow, a filter off the dimensions, an aggregation the measure lacks, a product of another kind, a non-owner analyst (the port), an outsider (the policy), an unknown product; the unchanged definition', async () => {
    await refused(define(owner, P_EUR, EUR_DEFINITION({ measure: 'row_count' })), /^metric rejected \(measure\): row_count is not a whitelisted measure \(one of: exposure_eur_at_risk, health_score, measure_observations\)/, 422);
    await refused(define(owner, P_EUR, EUR_DEFINITION({ grain: 'hour' })), /^metric rejected \(grain\): measure measure_observations allows the grains measure, objective, day, week, month; hour is not among them/, 422);
    await refused(define(owner, P_EUR, EUR_DEFINITION({ dimensions: ['measure_id', 'country'] })), /^metric rejected \(dimension\): .*country is not among them/, 422);
    await refused(define(owner, P_EUR, EUR_DEFINITION({ dimensions: ['measure_id'], filters: { objective_id: w.objectiveId } })), /^metric rejected \(filter\): filter objective_id is not on a declared dimension/, 422);
    await refused(define(steward, P_HSS, { measure: 'health_score', unit: 'points', aggregation: 'sum', grain: 'component' }), /^metric rejected \(aggregation\): measure health_score aggregates by last; sum is not among them/, 422);
    await refused(define(owner, P_EUR, EUR_DEFINITION({ measure: 'value * 2' })), /^metric rejected \(measure\): .*never an expression/, 422);
    await refused(define(steward, P_EVT, EUR_DEFINITION()), /^metric rejected \(kind\): product corridor-warning-stream is of kind event/, 422);
    await refused(define(analyst, P_EUR, EUR_DEFINITION()), /^metric rejected \(authority\)/, 403);
    await refused(define(outsider, P_EUR, EUR_DEFINITION()), /./, 403);
    await refused(define(owner, '0190b1c2-d3e4-7000-8000-0000000000aa', EUR_DEFINITION()), /^metric rejected \(unknown_product\)/, 404);
    await refused(define(owner, P_EUR, EUR_DEFINITION()), /^metric rejected \(unchanged\): the definition of metric corridor-exposure-eur is unchanged from version 1/, 409);
  });
  it('RECOVERY: the read shows the one version with its digest and no certification; an outsider cannot read it', async () => {
    const m = (await get(owner, P_EUR)).metric;
    expect(arr(m['versions']).map((v) => v['version'])).toEqual([1]);
    expect(m['certifications']).toEqual([]);
    expect(m['active_certification']).toBeNull();
    await refused(get(outsider, P_EUR), /./, 403);
  });
});

describe('B90 §M · (b) the certification: the owner\'s act, signed, the MET admitted; a conflict refused', () => {
  it('REFUSAL: a steward certifying (the port: authority — the signature and the object roll back with it), an expiry beyond 366 days or in the past, an undeclared version, an outsider', async () => {
    await refused(certify(steward, P_EUR, 1, await dbAhead('90 days')), /^metric certification rejected \(authority\): metric corridor-exposure-eur is certified by its owner/, 403);
    expect((await rows(sql`select count(*)::int n from executive.signatures where subject_kind = 'metric_certification' and subject_id = ${P_EUR}::uuid`))[0]!['n']).toBe(0);
    expect((await rows(sql`select count(*)::int n from objects.canonical_objects where object_type = 'MET' and object_id = ${P_EUR}::uuid`))[0]!['n']).toBe(0);
    await refused(certify(owner, P_EUR, 1, await dbAhead('400 days')), /^metric certification rejected \(expiry\): a certification expires within 366 days/, 422);
    await refused(certify(owner, P_EUR, 1, await dbInstant('1 hour')), /^metric certification rejected \(expiry\): a certification expires at a future instant/, 422);
    await refused(certify(owner, P_EUR, 2, await dbAhead('90 days')), /^metric certification rejected \(unknown_version\)/, 404);
    await refused(certify(outsider, P_EUR, 1, await dbAhead('90 days')), /./, 403);
  });
  it('POSITIVE: the owner certifies version 1 for 90 days — the certification signed (verifiable with this process\'s public key), the canonical MET@v1 admitted at object version 1, the model certified; a second certification is refused (state)', async () => {
    const expires = await dbAhead('90 days');
    const m = (await certify(owner, P_EUR, 1, expires)).metric;
    expect(m).toMatchObject({ state: 'certified', certified_version: 1, last_valid_version: 1 });
    expect(obj(m['certification'])).toMatchObject({ version: 1, certified_by: owner.principalId, state: 'active', met_object_version: 1 });
    expect(new Date(String(obj(m['certification'])['expires_at'])).toISOString()).toBe(expires);
    expect(obj(m['met'])).toMatchObject({ object_version: 1, schema_ref: 'MET@v1' });
    CERT_EUR_1 = String(obj(m['certification'])['certification_id']);
    const sig = await rows(sql`select signature_id::text, signer::text, key_id, signature, subject_digest, subject_version, bound_action from executive.signatures where subject_kind = 'metric_certification' and subject_id = ${P_EUR}::uuid`);
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ signer: owner.principalId, subject_version: 1, bound_action: 'products.metric.certify', signature_id: String(obj(m['signature'])['signature_id']) });
    expect(String(sig[0]!['subject_digest'])).toBe(String(arr(m['versions'])[0]!['digest']));
    expect(signatures.verify(sig[0] as { key_id: string; signature: string; subject_digest: string }, PUBLIC_PEM)).toBe(true);
    const c = await rows(sql`select object_version, lifecycle_state, schema_ref, payload from objects.canonical_objects where object_id = ${P_EUR}::uuid and object_type = 'MET' order by object_version`);
    expect(c).toHaveLength(1);
    expect(Number(c[0]!['object_version'])).toBe(1);
    expect(c[0]).toMatchObject({ lifecycle_state: 'active', schema_ref: 'MET@v1' });
    expect(obj(c[0]!['payload'])).toMatchObject({ model_id: P_EUR, metric_key: 'corridor-exposure-eur', version: 1, state: 'certified', certification_ordinal: 1 });
    expect(obj(obj(c[0]!['payload'])['certification'])).toMatchObject({ certification_id: CERT_EUR_1, certified_by: owner.principalId });
    const read = (await get(analyst, P_EUR)).metric;
    expect(arr(obj(arr(read['certifications'])[0])['signatures'])).toHaveLength(1);
    expect(arr(read['events']).map((e) => e['event'])).toEqual(['metric.declared', 'metric.certified']);
    await refused(certify(owner, P_EUR, 1, await dbAhead('90 days')), /^metric certification rejected \(state\): metric corridor-exposure-eur is already certified at version 1/, 409);
  });
  it('CONFLICT (RECOVERY of the governance rule): the draft — the same measure, grain and filters under a different definition — is refused certification while the exposure metric is certified, and the holder is named; the draft stays the uncertified model', async () => {
    await refused(certify(owner, P_DRAFT, 1, await dbAhead('90 days')), /^metric certification rejected \(conflict\): metric corridor-exposure-eur-draft conflicts with the certified metric corridor-exposure-eur \(the same measure, grain and filters\) under a different definition — reconcile definitions under semantic governance/, 409);
    expect((await get(owner, P_DRAFT)).metric).toMatchObject({ state: 'declared', certifications: [] });
    expect((await rows(sql`select count(*)::int n from objects.canonical_objects where object_type = 'MET' and object_id = ${P_DRAFT}::uuid`))[0]!['n']).toBe(0);
  });
});

describe('B90 §M · (c) the serving: the executive view (certified only) and the analyst view (marked); grain, version, source revision, freshness', () => {
  it('POSITIVE: the executive view serves the certified metric per month with its grain, unit, version and digest, the source revision and rows; the serving recorded; freshness_seconds observed on the product', async () => {
    const s = (await serve(executive, 'corridor-exposure-eur', { view: 'executive' })).serving;
    expect(s).toMatchObject({ metric_key: 'corridor-exposure-eur', view: 'executive', version: 1, grain: 'month', unit: 'EUR', aggregation: 'last', measure: 'measure_observations', certified: true, certification_standing: 'certified',
      source: 'graph.measure_observations', source_rows: 3, filters: { measure_id: MSR }, last_valid_version: 1 });
    expect(String(s['source_revision'])).toMatch(/^[0-9a-f]{64}$/);
    expect(String(s['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(obj(s['certification'])).toMatchObject({ certification_id: CERT_EUR_1, state: 'active' });
    const values = arr(s['values']);
    expect(values.map((v) => Number(v['value']))).toEqual([420000, 610000, 550000]);
    expect(values.map((v) => String(v['grain_key']))).toEqual([...values.map((v) => String(v['grain_key']))].sort());
    expect(values.every((v) => /^\d{4}-\d{2}$/.test(String(v['grain_key'])))).toBe(true);
    const fresh = Number(s['freshness_seconds']);
    expect(fresh).toBeGreaterThan(9.9 * 86_400); expect(fresh).toBeLessThan(10.1 * 86_400);
    const rec = await rows(sql`select view, grain, version, certified, source_revision, source_rows, served_to::text as served_to, result from products.metric_servings where serving_id = ${String(s['serving_id'])}::uuid`);
    expect(rec[0]).toMatchObject({ view: 'executive', grain: 'month', version: 1, certified: true, source_revision: s['source_revision'], source_rows: 3, served_to: executive.principalId });
    const slo = await rows(sql`select measure, value, met, source, details from products.slo_observations where product_id = ${P_EUR}::uuid order by observed_at`);
    expect(slo).toHaveLength(1);
    expect(slo[0]).toMatchObject({ measure: 'freshness_seconds', met: true, source: 'metric serve (§M)' });
    expect(obj(slo[0]!['details'])['serving_id']).toBe(s['serving_id']);
    // any reader serves the certified metric alike (the analyst, the steward)
    expect((await serve(analyst, 'corridor-exposure-eur', { view: 'executive' })).serving).toMatchObject({ certified: true, source_revision: s['source_revision'] });
  });
  it('REFUSAL: the executive view of the uncertified draft (certification), a view outside the two, an unknown key, a grain the measure lacks, a filter off the dimensions, a future instant, an instant before the definition is effective, an outsider', async () => {
    await refused(serve(executive, 'corridor-exposure-eur-draft', { view: 'executive' }), /^metric rejected \(certification\): metric corridor-exposure-eur-draft is declared — the executive view serves certified metrics only \(dashboards are access modes\); the analyst view serves it marked uncertified/, 409);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'board' }), /^metric rejected \(view\)/, 422);
    await refused(serve(executive, 'no-such-metric', { view: 'executive' }), /^metric rejected \(unknown_metric\)/, 404);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive', grain: 'hour' }), /^metric rejected \(grain\): measure measure_observations allows the grains/, 422);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive', filters: { country: 'DE' } }), /^metric rejected \(filter\): filter country is not a dimension of metric corridor-exposure-eur/, 422);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive', asOf: await dbAhead('1 day') }), /^metric rejected \(as_of\): the instant is not in the future/, 422);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive', asOf: await dbInstant('100 days') }), /^metric rejected \(effective\): no definition of metric corridor-exposure-eur is effective at/, 409);
    await refused(serve(outsider, 'corridor-exposure-eur', { view: 'analyst' }), /./, 403);
  });
  it('RECOVERY: the analyst view serves the draft MARKED uncertified (avg per month, no certification); the grain and the filters may be overridden within the declaration; an instant between readings serves what was known then', async () => {
    const d = (await serve(analyst, 'corridor-exposure-eur-draft', { view: 'analyst' })).serving;
    expect(d).toMatchObject({ view: 'analyst', certified: false, certification_standing: 'declared', certification: null, aggregation: 'avg', last_valid_version: null });
    expect(String(d['note'])).toMatch(/^UNCERTIFIED \(declared\) — served in the analyst view only/);
    expect(arr(d['values']).map((v) => Number(v['value']))).toEqual([420000, 610000, 550000]);
    const byMeasure = (await serve(executive, 'corridor-exposure-eur', { view: 'executive', grain: 'measure', filters: { objective_id: w.objectiveId } })).serving;
    expect(byMeasure).toMatchObject({ grain: 'measure', filters: { measure_id: MSR, objective_id: w.objectiveId } });
    expect(arr(byMeasure['values'])).toEqual([{ grain_key: MSR, value: 550000 }]);
    // BITEMPORAL: the readings were RECORDED today — as of 30 days ago nothing was known: no rows, the empty-set revision, no freshness observed
    const then = (await serve(executive, 'corridor-exposure-eur', { view: 'executive', asOf: await dbInstant('30 days') })).serving;
    expect(then).toMatchObject({ values: [], source_rows: 0, source_revision: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', freshness_seconds: null, source_newest_at: null });
    const byDay = (await serve(executive, 'corridor-exposure-eur', { view: 'executive', grain: 'day' })).serving;
    expect(arr(byDay['values'])).toHaveLength(3);
    expect(arr(byDay['values']).every((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v['grain_key'])))).toBe(true);
    expect(byDay['source_revision']).toBe(byMeasure['source_revision']); // the same rows read, whatever the grain
    expect(arr((await get(owner, P_EUR)).metric['servings']).length).toBeGreaterThanOrEqual(4);
  });
});

describe('B90 §M · (d) continuity: a definition change, the health score, reproducibility, the expiry sweep', () => {
  it('DEFINITION CHANGE: re-declaring the certified metric records the DIFF (aggregation last → avg), withdraws the certification (the servings since exposed, the last valid version frozen), and the executive view refuses it; the owner re-certifies version 2 (MET object version 2) — RECOVERY', async () => {
    AS_OF_EUR = await dbInstant('1 second');
    const s = (await serve(executive, 'corridor-exposure-eur', { view: 'executive', asOf: AS_OF_EUR })).serving;
    SERVING_EUR = String(s['serving_id']);
    expect(new Date(String(s['as_of'])).toISOString()).toBe(AS_OF_EUR);
    const m = (await define(owner, P_EUR, EUR_DEFINITION({ aggregation: 'avg' }))).metric;
    expect(m).toMatchObject({ version: 2, current_version: 2, state: 'withdrawn', certified_version: null, last_valid_version: 1, aggregation: 'avg' });
    expect(m['changed']).toEqual([{ key: 'aggregation', from: 'last', to: 'avg' }]);
    const wd = obj(m['withdrawal']);
    expect(wd).toMatchObject({ certification_id: CERT_EUR_1, version: 1, state: 'withdrawn' });
    expect(String(wd['reason'])).toMatch(/^definition_changed: the certified definition \(version 1\) was re-declared as version 2/);
    expect(arr(wd['servings_exposed']).map((x) => x['serving_id'])).toContain(SERVING_EUR);
    expect(arr(wd['servings_exposed']).every((x) => x['view'] === 'executive' || x['view'] === 'analyst')).toBe(true);
    expect(arr(m['diffs'])).toHaveLength(1);
    expect(arr(m['diffs'])[0]).toMatchObject({ from_version: 1, to_version: 2, changed: [{ key: 'aggregation', from: 'last', to: 'avg' }] });
    expect(arr(m['events']).map((e) => e['event'])).toEqual(['metric.declared', 'metric.certified', 'metric.definition_changed', 'metric.certification_withdrawn', 'metric.declared']);
    expect(arr(m['certifications'])[0]).toMatchObject({ certification_id: CERT_EUR_1, state: 'withdrawn', withdrawn_by: owner.principalId });
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive' }), /^metric rejected \(certification\): metric corridor-exposure-eur is withdrawn — the executive view serves certified metrics only/, 409);
    const marked = (await serve(analyst, 'corridor-exposure-eur', { view: 'analyst' })).serving;
    expect(marked).toMatchObject({ certified: false, certification_standing: 'withdrawn', version: 2, last_valid_version: 1 });
    // the steward may also withdraw — nothing is active now, so the state refuses; the reason is required
    await refused(withdraw(steward, P_EUR, 'a second withdrawal of a withdrawn model'), /^metric certification rejected \(state\): metric corridor-exposure-eur is withdrawn; there is no active certification to withdraw/, 409);
    await refused(withdraw(steward, P_EUR, 'short'), /^metric certification rejected \(reason\)/, 422);
    // RECOVERY: version 2 certified — a new MET object version, a new signature (subject version 2 = the certification's ordinal)
    const re = (await certify(owner, P_EUR, 2, await dbAhead('90 days'))).metric;
    expect(re).toMatchObject({ state: 'certified', certified_version: 2, last_valid_version: 2 });
    expect(obj(re['certification'])).toMatchObject({ version: 2, met_object_version: 2 });
    expect((await rows(sql`select array_agg(object_version::int order by object_version) v from objects.canonical_objects where object_type = 'MET' and object_id = ${P_EUR}::uuid`))[0]!['v']).toEqual([1, 2]);
    const again = (await serve(executive, 'corridor-exposure-eur', { view: 'executive' })).serving;
    expect(again).toMatchObject({ certified: true, version: 2, aggregation: 'avg' });
  });
  it('THE STRATEGIC HEALTH SCORE as a certified metric: the executive (its owner) certifies; the steward cannot; served in the executive view at grain component (the normalised scores) and at grain definition (the aggregate)', async () => {
    await refused(certify(steward, P_HSS, 1, await dbAhead('90 days')), /^metric certification rejected \(authority\)/, 403);
    const m = (await certify(executive, P_HSS, 1, await dbAhead('90 days'))).metric;
    expect(m).toMatchObject({ state: 'certified', certified_version: 1, metric_key: 'strategic-health-score' });
    const s = (await serve(executive, 'strategic-health-score', { view: 'executive' })).serving;
    AS_OF_HSS = new Date(String(s['as_of'])).toISOString();
    expect(s).toMatchObject({ certified: true, grain: 'component', unit: 'points', source: 'executive.health_score_snapshots', source_rows: 1 });
    const keys = arr(s['values']).map((v) => String(v['grain_key'])).sort();
    expect(keys).toEqual(['corridor_indicator_live', 'corridor_risk']);
    for (const v of arr(s['values'])) expect(v['value'] === null || typeof v['value'] === 'number').toBe(true);
    const byDefinition = (await serve(executive, 'strategic-health-score', { view: 'executive', grain: 'definition' })).serving;
    expect(arr(byDefinition['values'])).toHaveLength(1);
    expect(String(arr(byDefinition['values'])[0]!['grain_key'])).toMatch(/^[0-9a-f-]{36}$/);
    const snap = await rows(sql`select aggregate from executive.health_score_snapshots where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and kind = 'current' order by at desc limit 1`);
    expect(arr(byDefinition['values'])[0]!['value']).toBe(snap[0]!['aggregate'] === null ? null : Number(snap[0]!['aggregate']));
  });
  it('REPRODUCIBILITY: the recalculation at the recorded instant reproduces; a stated superuser move changes a source reading — the recalculation no longer reproduces, the certification is withdrawn (reason reproducibility) and the diverged serving named, `reproducible` observed; an instant never served (404), an analyst (403)', async () => {
    const ok = (await recalculate(owner, P_EUR, AS_OF_EUR)).recalculation;
    expect(ok).toMatchObject({ reproduced: true, serving_id: SERVING_EUR, serving_version: 1, version: 2, state: 'certified', withdrawal: null, diverged_serving: null });
    expect(ok['expected_revision']).toBe(ok['observed_revision']);
    // THE FAULT (stated): a reading's value changed under the disabled append-only trigger — the source rows changed without a correction record
    await sql`alter table graph.measure_observations disable trigger append_only`.execute(su);
    await sql`update graph.measure_observations set value = value + 1000 where measure_id = ${MSR}::uuid and observed_at = (select min(observed_at) from graph.measure_observations where measure_id = ${MSR}::uuid)`.execute(su);
    await sql`alter table graph.measure_observations enable trigger append_only`.execute(su);
    const bad = (await recalculate(owner, P_EUR, AS_OF_EUR)).recalculation;
    expect(bad).toMatchObject({ reproduced: false, serving_id: SERVING_EUR, state: 'withdrawn' });
    expect(bad['observed_revision']).not.toBe(bad['expected_revision']);
    expect(obj(bad['diverged_serving'])).toMatchObject({ serving_id: SERVING_EUR, view: 'executive', served_to: executive.principalId });
    expect(String(obj(bad['withdrawal'])['reason'])).toMatch(/^reproducibility: the source revision at .* no longer matches serving /);
    expect(obj(bad['withdrawal'])).toMatchObject({ version: 2, state: 'withdrawn' });
    const slo = await rows(sql`select value::int as value, met, details from products.slo_observations where product_id = ${P_EUR}::uuid and measure = 'reproducible' order by observed_at`);
    expect(slo.map((x) => [x['value'], x['met']])).toEqual([[1, true], [0, false]]);
    expect(obj(slo[1]!['details'])).toMatchObject({ serving_id: SERVING_EUR, expected_revision: bad['expected_revision'], observed_revision: bad['observed_revision'] });
    const m = (await get(owner, P_EUR)).metric;
    expect(m).toMatchObject({ state: 'withdrawn', certified_version: null, last_valid_version: 2 });
    expect(arr(m['events']).filter((e) => e['event'] === 'metric.recalculated').map((e) => obj(e['details'])['reproduced'])).toEqual([true, false]);
    await refused(serve(executive, 'corridor-exposure-eur', { view: 'executive' }), /^metric rejected \(certification\): metric corridor-exposure-eur is withdrawn/, 409);
    await refused(recalculate(owner, P_EUR, await dbInstant('3 days')), /^metric rejected \(unknown_serving\): metric corridor-exposure-eur was never served at/, 404);
    await refused(recalculate(analyst, P_EUR, AS_OF_EUR), /^metric rejected \(authority\)/, 403);
    await refused(recalculate(owner, P_EUR, await dbAhead('1 day')), /^metric rejected \(as_of\)/, 422);
    // RECOVERY: the health score model reproduces at its serving's instant (its source untouched)
    const hss = (await recalculate(steward, P_HSS, AS_OF_HSS)).recalculation;
    expect(hss).toMatchObject({ reproduced: true, state: 'certified', withdrawal: null });
  });
  it('THE EXPIRY SWEEP (the tick step metric-certification, order 65): a stated superuser move puts the health score certification\'s expiry in the past — the tick expires it (the model expired, the last valid version frozen), an attention item of class metric.certification is routed to the owner, the executive view refuses; a second tick sweeps nothing more; the owner re-certifies the same version (RECOVERY)', async () => {
    const before = await rows(sql`select certification_id::text as id from products.metric_certifications where model_id = ${P_HSS}::uuid and state = 'active'`);
    expect(before).toHaveLength(1);
    // THE FAULT (stated): the certification moved two days back and its expiry one day back (the row's own CHECK keeps expiry after certification) under the disabled forward trigger — the trigger allows no other change of a certification row
    await expect(sql`update products.metric_certifications set certified_at = clock_timestamp() - interval '2 days', expires_at = clock_timestamp() - interval '1 day' where certification_id = ${String(before[0]!['id'])}::uuid`.execute(su)).rejects.toThrow(/immutable/);
    await sql`alter table products.metric_certifications disable trigger pmc_forward`.execute(su);
    await sql`update products.metric_certifications set certified_at = clock_timestamp() - interval '2 days', expires_at = clock_timestamp() - interval '1 day' where certification_id = ${String(before[0]!['id'])}::uuid`.execute(su);
    await sql`alter table products.metric_certifications enable trigger pmc_forward`.execute(su);
    await tick(1);
    const c = await rows(sql`select state, withdrawal_reason, withdrawn_by::text as withdrawn_by from products.metric_certifications where certification_id = ${String(before[0]!['id'])}::uuid`);
    expect(c[0]).toMatchObject({ state: 'expired' });
    expect(String(c[0]!['withdrawal_reason'])).toMatch(/^expired: the certification of version 1 passed its expiry/);
    const m = (await get(executive, P_HSS)).metric;
    expect(m).toMatchObject({ state: 'expired', certified_version: null, last_valid_version: 1 });
    const items = await rows(sql`select signal_class, subject_kind, subject_id::text as subject_id, owner_principal_id::text as owner, state, title, cause_event_type from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = 'metric.certification' order by created_at`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ signal_class: 'metric.certification', subject_kind: 'metric', subject_id: P_HSS, owner: executive.principalId, state: 'open', cause_event_type: 'metric.certification_withdrawn' });
    expect(String(items[0]!['title'])).toMatch(/^Metric certification expired: Strategic Health Score \(SYNTHETIC\) \(strategic-health-score\)/);
    await refused(serve(executive, 'strategic-health-score', { view: 'executive' }), /^metric rejected \(certification\): metric strategic-health-score is expired — the executive view serves certified metrics only/, 409);
    expect((await serve(analyst, 'strategic-health-score', { view: 'analyst' })).serving).toMatchObject({ certified: false, certification_standing: 'expired', last_valid_version: 1 });
    await tick(2);
    expect((await rows(sql`select count(*)::int n from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = 'metric.certification'`))[0]!['n']).toBe(1);
    expect((await rows(sql`select count(*)::int n from products.metric_certifications where model_id = ${P_HSS}::uuid and state = 'expired'`))[0]!['n']).toBe(1);
    // RECOVERY: the owner re-certifies version 1 — a second certification of the same definition version (its own ordinal, signature and MET object version)
    const re = (await certify(executive, P_HSS, 1, await dbAhead('30 days'))).metric;
    expect(re).toMatchObject({ state: 'certified', certified_version: 1 });
    expect(obj(re['certification'])).toMatchObject({ version: 1, met_object_version: 2 });
    expect((await rows(sql`select array_agg(subject_version order by subject_version) v from executive.signatures where subject_kind = 'metric_certification' and subject_id = ${P_HSS}::uuid`))[0]!['v']).toEqual([1, 2]);
    expect((await serve(executive, 'strategic-health-score', { view: 'executive' })).serving).toMatchObject({ certified: true, version: 1 });
  });
});

describe('B90 §M · (e) the ledgers', () => {
  it('the versions, the diffs and the servings are append-only; a certification moves one way (an expired one never returns to active); a model is never deleted (superuser moves refused by the triggers)', async () => {
    await expect(sql`update products.metric_versions set definition = '{}'::jsonb where model_id = ${P_EUR}::uuid and version = 1`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.metric_servings where model_id = ${P_EUR}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`update products.metric_definition_diffs set changed = '[]'::jsonb where model_id = ${P_EUR}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`update products.metric_certifications set state = 'active', withdrawn_at = null, withdrawn_by = null, withdrawal_reason = null where model_id = ${P_HSS}::uuid and state = 'expired'`.execute(su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from products.metric_certifications where model_id = ${P_HSS}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.semantic_models where model_id = ${P_DRAFT}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
  });
});
