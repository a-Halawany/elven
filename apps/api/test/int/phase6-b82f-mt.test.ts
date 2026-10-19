/**
 * B82-F mt (the B80–B82 integration pass; B92 §MD/§OR × B50 §CL) — MET-010's DEFINITION AND COMPUTATION VERSIONS TOGETHER, through the real
 * pipeline, PDP, ports and controllers. B50 §CL re-declared MET-010's COMPUTATION (analytics.mc_met010_correction_propagation, registered again as
 * version 2 in '0120 §CL': the end instant is the closure record's closed_at — material consumer closure) while B92's APPROVED MET-010 DEFINITION
 * still states v1's meaning (the walk). The reads showed the definition version and, at best, the computation KEY — never the version that
 * computes it now, nor (beside the definition) the version a stored result ran. Every persona, purpose, definition, item and result here is
 * SYNTHETIC; the harness proves the SOFTWARE.
 *
 *   MT1 · the definition's reads say the computation version that computes it NOW (the registry's version, registered_in, registered_at, body
 *         digest) beside the definition version: the contract card (every version), the catalog, the definitions list, the registry list; and
 *         each stored result says the computation version and digest it RECORDED (card results, catalog results by period, results/list, uses).
 *   MT2 · the drill-down (results/:id/read): the result's recorded computation beside the registry's now — a result computed before the
 *         computation was re-registered keeps its v1 and digest; one computed after it names v2 = the registry's.
 *   MT3 · the operating review read and the series route: per metric the registry's computation now; per computed period the computation the
 *         result ran; two versions in one series are listed and said (the series' `comparable` flag — definition versions — unchanged).
 *   MT4 · MET-010 itself (the coordinator's act rehearsed on harness rows): the registry holds met010_correction_propagation v2 registered in
 *         '0120 §CL'; definition v1 (B92's contract) computed by computation v2 shows BOTH; v2 of the DEFINITION proposed through the governed
 *         port by the analyst (the proposer's own approval refused 403), approved at its digest by the owner — the diff is exactly meaning,
 *         population (its closure_instant) and exclusions; k_min 5 and floor_n 3 unchanged; v1 superseded and its result still readable on v1;
 *         a fresh computation names definition v2 and computation v2; an n below the floor stays INDETERMINATE.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsDefinitionsController } from '../../src/analytics/definitions/definitions.controller.js';
import { AnalyticsReviewController } from '../../src/analytics/review/review.controller.js';
import { definitionsB } from '../../src/analytics/computations-b/definitions-b.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: AnalyticsDefinitionsController; let cc: AnalyticsComputeController; let rv: AnalyticsReviewController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().replace(/-/g, '').slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v ?? {}) as Row;

let analyst: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let privacy: AuthenticatedPrincipal; let chair: AuthenticatedPrincipal;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;

/* ───────────── the routes (in process) ───────────── */
const rq = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'intelligence') as never;
const proposePurpose = (as: AuthenticatedPrincipal, payload: Row) => c.proposePurpose(rq(as, 'analytics.purpose.propose', 'APU'), T(), D(), { payload }) as Promise<{ purpose: Row }>;
const decidePurpose = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decidePurpose(rq(as, 'analytics.purpose.decide', 'APU', id), T(), D(), id, { payload }) as Promise<{ purpose: Row }>;
const propose = (as: AuthenticatedPrincipal, contract: unknown) =>
  c.propose(rq(as, 'analytics.definition.propose', 'AMD'), T(), D(), { payload: { contract, ownerPrincipalId: owner.principalId } }) as Promise<{ definition: Row }>;
const decide = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decide(rq(as, 'analytics.definition.decide', 'AMD', id), T(), D(), id, { payload }) as Promise<{ definition: Row }>;
const card = (as: AuthenticatedPrincipal, key: string) => c.definition(rq(as, 'analytics.read', 'AMD'), T(), D(), key) as Promise<Row>;
const definitions = (as: AuthenticatedPrincipal) => c.definitions(rq(as, 'analytics.read', 'AMD'), T(), D()) as Promise<{ definitions: Row[]; computations: Row[] }>;
const catalog = (as: AuthenticatedPrincipal) => c.catalog(rq(as, 'analytics.read', 'AMD'), T(), D()) as Promise<{ catalog: Row[] }>;
const diff = (as: AuthenticatedPrincipal, from: string, to: string) => c.diff(rq(as, 'analytics.read', 'AMD'), T(), D(), { payload: { from, to } }) as Promise<{ diff: Row }>;
const uses = (as: AuthenticatedPrincipal, payload: Row) => c.uses(rq(as, 'analytics.read', 'AMU'), T(), D(), { payload }) as Promise<{ uses: Row[] }>;
const compute = async (as: AuthenticatedPrincipal, payload: Row) => (await cc.compute(rq(as, 'analytics.metric.compute', 'AMR'), T(), D(), { payload }) as { result: Row }).result;
const resultRead = async (as: AuthenticatedPrincipal, id: string) => (await cc.result(rq(as, 'analytics.read', 'AMR', id), T(), D(), id, { payload: { recordsLimit: 50 } }) as { result: Row }).result;
const resultsList = async (as: AuthenticatedPrincipal, payload: Row) => (await cc.results(rq(as, 'analytics.read', 'AMR'), T(), D(), { payload }) as { results: Row[] }).results;
const registry = async (as: AuthenticatedPrincipal) => (await cc.registry(rq(as, 'analytics.read', 'AMR'), T(), D()) as { computations: Row[] }).computations;
const open = async (as: AuthenticatedPrincipal, payload: Row) => (await rv.open(rq(as, 'analytics.review.open', 'AOR'), T(), D(), { payload }) as { review: Row }).review;
const assemble = async (as: AuthenticatedPrincipal, id: string) => (await rv.assemble(rq(as, 'analytics.review.assemble', 'AOR', id), T(), D(), id, { payload: {} }) as { assembly: Row }).assembly;
const reviewRead = async (as: AuthenticatedPrincipal, id: string) => (await rv.read(rq(as, 'analytics.read', 'AOR', id), T(), D(), id) as { review: Row }).review;
const series = async (as: AuthenticatedPrincipal, payload: Row) => (await rv.series(rq(as, 'analytics.read', 'AOR'), T(), D(), { payload }) as { series: Row }).series;

/* ───────────── the fixture computation (registered by the superuser as a part's migration would) ───────────── */
const FXC = `mt_fixture_rate_${RUN}`;
const K = `FXM-${RUN}`;
const Q3 = '2026-Q3'; const Q2 = '2026-Q2';
/** The fixture rate's body; `variant` changes the body text only (a re-declared computation: a new body digest, a new registry version). */
const declareFixture = (variant: string) => sql.raw(`create or replace function analytics.mc_${FXC}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      -- the B82-F mt fixture, body ${variant}
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B82-F mt fixture items');
      return jsonb_build_object('kind', 'rate',
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'mt_item', 'id', i.id, 'role', case when i.ok then 'numerator' else 'denominator' end) order by i.id)
                  from public.mt_items_${RUN} i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock', 'body', '${variant}'));
    end $f$`);
const register = (registeredIn: string) => sql`select analytics.register_computation(${FXC}, ${`analytics.mc_${FXC}`}, 'rate', array[]::text[], array[${`public.mt_items_${RUN}`}],
  'the fixture ignores the scope (domain-wide, stated)', 'the B82-F mt harness fixture rate (SYNTHETIC)', ${registeredIn})`;
const FX: MetricContract = {
  metricKey: K, title: `Fixture ok share ${K} (SYNTHETIC)`, meaning: 'the share of fixture items recorded as ok (a SYNTHETIC harness reading)', kind: 'rate', unit: 'share', direction: 'higher',
  population: { subject: 'fixture item', inclusion: 'recorded inside the window', scope_rule: 'the fixture ignores the scope (stated)' },
  numerator: 'items that are ok', denominator: 'every item recorded in the window', exclusions: [{ rule: 'none', reason: 'the fixture excludes nothing' }],
  window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3, threshold: {},
  purposeKey: 'product-quality', serves: { decision_classes: ['fixture decisions (SYNTHETIC)'] }, cadence: 'quarterly', ownerRole: 'product_analytics_owner',
  action: 'a review by the product analytics owner — never an automatic or punitive decision', retirement: 'retired when the fixture computation is withdrawn',
  quality: {}, costAllocation: { pool: 'analytics' }, computationKey: FXC, params: {}, unsupportedReason: null, sourceRefs: ['FIXTURE-B82F-MT'],
};

/* ───────────── MET-010 v2 — the contract the coordinator's act proposes (the scratchpad's met010-v2-contract.json is this object) ───────────── */
const MET010_V1 = definitionsB.find((x) => x.metricKey === 'MET-010')!;
const MET010_V2: MetricContract = {
  ...MET010_V1,
  meaning: 'Time from accepted correction to material consumer closure: every material consumer of the affected products acknowledged, recomputed or under a bounded exception, and the projections reconciled (the closure record\'s closed_at)',
  population: { ...MET010_V1.population,
    closure_instant: 'the closure record\'s closed_at (graph.correction_closures): the instant every material consumer was acknowledged, recomputed or under a bounded exception and the projections reconciled — not the end of the propagation walk' },
  exclusions: [{ rule: 'a correction whose closure is open or stalled at the as-of, or one applied before B50 and not adopted (no closure record)',
                 reason: 'censored (no closure instant yet), said per record and never estimated; when more than half are censored the median is indeterminate' }],
};

let defId = ''; let r1Q2 = ''; let r1Q3 = ''; let r2Q3 = ''; let digestV1 = ''; let digestV2 = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsDefinitionsController); cc = h.app.get(AnalyticsComputeController); rv = h.app.get(AnalyticsReviewController);
  analyst = await h.humanWithSession(['product_analyst'], 'b82fmt-analyst');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b82fmt-owner');
  privacy = await h.humanWithSession(['privacy_officer'], 'b82fmt-privacy');
  chair = await h.humanWithSession(['executive'], 'b82fmt-chair');
  // the purposes, through the governed register (a named privacy officer approves)
  for (const [key, kind] of [['product-quality', 'product_improvement'], ['governance-assurance', 'governance']] as const) {
    const p = (await proposePurpose(analyst, { key, title: `${key} (SYNTHETIC)`, kind, retentionDays: 365, description: `the ${key} purpose of the B82-F mt harness register (SYNTHETIC)` })).purpose;
    await decidePurpose(privacy, String(p['purpose_id']), { decision: 'approve', digest: p['digest'], reason: 'approved for the B82-F mt harness register (SYNTHETIC)' });
  }
  await sql.raw(`create table if not exists public.mt_items_${RUN} (id uuid primary key, tenant_id uuid, domain_id uuid, recorded_at timestamptz, ok boolean)`).execute(h.su);
  await declareFixture('v1').execute(h.su);
  await register('phase6-b82f-mt (v1)').execute(h.su);
  for (let i = 1; i <= 5; i++) await sql`insert into public.mt_items_${sql.raw(RUN)} values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${`2026-05-0${i}T10:00:00Z`}::timestamptz, ${i <= 4})`.execute(h.su);
  for (let i = 1; i <= 6; i++) await sql`insert into public.mt_items_${sql.raw(RUN)} values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${`2026-08-0${i}T10:00:00Z`}::timestamptz, ${i <= 3})`.execute(h.su);
}, 900_000);

afterAll(async () => {
  await sql.raw(`drop table if exists public.mt_items_${RUN}`).execute(h.su).catch(() => undefined);
  await h?.close();
}, 120_000);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('MT1 · the definition and the computation versions together (card, catalog, lists, results)', () => {
  it('the fixture definition approved on computation v1; Q2 and Q3 computed on v1; the computation re-declared → the registry holds v2', async () => {
    const p = (await propose(analyst, FX)).definition; defId = String(p['definition_id']);
    await decide(owner, defId, { decision: 'approve', digest: p['digest'], reason: 'the fixture contract read whole (SYNTHETIC harness)' });
    const a = await compute(analyst, { metricKey: K, period: Q2 }); r1Q2 = String(a['result_id']);
    const b = await compute(analyst, { metricKey: K, period: Q3 }); r1Q3 = String(b['result_id']);
    expect(a).toMatchObject({ definition_version: 1, computation_key: FXC, computation_version: 1 });
    expect(b).toMatchObject({ definition_version: 1, computation_key: FXC, computation_version: 1 });
    digestV1 = String(b['computation_digest']);
    await declareFixture('v2').execute(h.su);
    await register('phase6-b82f-mt (v2)').execute(h.su);
    const reg = await one(sql`select version, registered_in, body_digest from analytics.computation_registry where computation_key = ${FXC}`);
    expect(reg).toMatchObject({ version: 2, registered_in: 'phase6-b82f-mt (v2)' });
    digestV2 = String(reg['body_digest']);
    expect(digestV2).not.toBe(digestV1);
  });

  it('the contract card: every version carries the registry\'s computation NOW (v2, registered_in, registered_at, digest); each result its RECORDED computation (v1, its digest)', async () => {
    const k = await card(analyst, K);
    const v = arr(k['versions'])[0]!;
    expect(v).toMatchObject({ version: 1, state: 'approved' });
    expect(obj(v['computation'])).toMatchObject({ computation_key: FXC, version: 2, registered_in: 'phase6-b82f-mt (v2)', body_digest: digestV2, kind: 'rate' });
    expect(String(obj(v['computation'])['registered_at'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const res = arr(k['results']).find((x) => x['result_id'] === r1Q3)!;
    expect(res).toMatchObject({ definition_version: 1, computation_key: FXC, computation_version: 1, computation_digest: digestV1 });
  });

  it('the catalog: the definition row carries the registry computation (v2); its results by period carry the computation each ran (v1)', async () => {
    const row = (await catalog(analyst)).catalog.find((x) => x['metric_key'] === K)!;
    expect(row).toMatchObject({ version: 1, computation_key: FXC });
    expect(obj(row['computation'])).toMatchObject({ computation_key: FXC, version: 2, registered_in: 'phase6-b82f-mt (v2)' });
    const byPeriod = arr(row['results_by_period']);
    expect(byPeriod.map((x) => [x['period_key'], x['definition_version'], x['computation_version'], x['computation_digest']]))
      .toEqual([[Q3, 1, 1, digestV1], [Q2, 1, 1, digestV1]]);
  });

  it('the definitions list, the registry lists and results/list: the computation version and where it was registered', async () => {
    const ls = await definitions(analyst);
    expect(obj(ls.definitions.find((x) => x['metric_key'] === K)!['computation'])).toMatchObject({ version: 2, registered_in: 'phase6-b82f-mt (v2)' });
    expect(ls.computations.find((x) => x['computation_key'] === FXC)).toMatchObject({ version: 2, registered_in: 'phase6-b82f-mt (v2)', body_digest: digestV2 });
    expect((await registry(analyst)).find((x) => x['computation_key'] === FXC)).toMatchObject({ version: 2, registered_in: 'phase6-b82f-mt (v2)' });
    const rl = await resultsList(analyst, { metricKey: K });
    expect(rl.find((x) => x['result_id'] === r1Q3)).toMatchObject({ computation_key: FXC, computation_version: 1, computation_digest: digestV1 });
  });
});

describe('MT2 · the drill-down: the recorded computation beside the registry\'s now', () => {
  it('a result computed BEFORE the re-registration keeps v1 and its digest; computation_now names v2 (registered_in, digest)', async () => {
    const r = await resultRead(analyst, r1Q3);
    expect(r).toMatchObject({ computation_key: FXC, computation_version: 1, computation_digest: digestV1 });
    expect(obj(r['computation_now'])).toMatchObject({ computation_key: FXC, version: 2, registered_in: 'phase6-b82f-mt (v2)', body_digest: digestV2 });
  });
  it('a result computed AFTER it runs v2 — the version and digest the registry holds now', async () => {
    const b = await compute(analyst, { metricKey: K, period: Q3 }); r2Q3 = String(b['result_id']);
    const r = await resultRead(analyst, r2Q3);
    expect(r).toMatchObject({ definition_version: 1, computation_version: 2, computation_digest: digestV2 });
    expect(obj(r['computation_now'])).toMatchObject({ version: 2, body_digest: digestV2 });
  });
});

describe('MT3 · the operating review: the computation now per metric, the computation each period ran', () => {
  it('the review read: computation_now (v2) per metric; the series says Q2 ran v1 and Q3 ran v2 (listed and said; `comparable` stays the definition-version flag); the citation\'s use carries its computation', async () => {
    const r = await open(analyst, { title: `B82-F mt review ${Q3} (SYNTHETIC ${RUN})`, period: Q3, metricKeys: [K], chair: chair.principalId, participantRoles: ['product_analyst', 'executive'] });
    const id = String(r['review_id']);
    expect(await assemble(analyst, id)).toMatchObject({ assembly: 1, cited: 1 });
    const v = await reviewRead(analyst, id);
    const m = arr(v['metrics'])[0]!;
    expect(obj(m['result'])).toMatchObject({ result_id: r2Q3, computation_version: 2 });
    expect(obj(m['computation_now'])).toMatchObject({ computation_key: FXC, version: 2, registered_in: 'phase6-b82f-mt (v2)' });
    const s = obj(m['series']);
    const periods = arr(s['periods']);
    expect(periods.find((p) => p['period'] === Q2)).toMatchObject({ status: 'computed', result_id: r1Q2, computation_version: 1, computation_digest: digestV1 });
    expect(periods.find((p) => p['period'] === Q3)).toMatchObject({ status: 'computed', result_id: r2Q3, computation_version: 2, computation_digest: digestV2 });
    expect(s).toMatchObject({ comparable: true, computation_versions: [1, 2] });
    expect(String(s['computation_note'])).toMatch(/different computation versions \(v1, v2\)/);
    const u = (await uses(analyst, { metricKey: K })).uses.find((x) => x['result_id'] === r2Q3)!;
    expect(u).toMatchObject({ used_in_kind: 'operating_review', definition_version: 1, computation_key: FXC, computation_version: 2 });
  });
  it('the series route says the same', async () => {
    const s = await series(analyst, { metricKey: K, through: Q3, count: 2 });
    expect(arr(s['periods']).map((p) => [p['period'], p['computation_version']])).toEqual([[Q2, 1], [Q3, 2]]);
    expect(s).toMatchObject({ computation_versions: [1, 2] });
  });
});

describe('MT4 · MET-010: definition v2 through the governed path, with computation v2 shown beside it', () => {
  let v1Id = ''; let v2Id = ''; let rOnV1 = '';
  it('the registry: met010_correction_propagation v2, registered in 0120 §CL (material consumer closure)', async () => {
    const reg = (await registry(analyst)).find((x) => x['computation_key'] === 'met010_correction_propagation')!;
    expect(reg).toMatchObject({ function_name: 'analytics.mc_met010_correction_propagation', registered_in: '0120 §CL', kind: 'duration' });
    expect(Number(reg['version'])).toBeGreaterThanOrEqual(2);
    expect(String(reg['description'])).toMatch(/MATERIAL CONSUMER CLOSURE/);
  });
  it('definition v1 (B92\'s contract, the walk) computed by computation v2 — the card and the result say BOTH', async () => {
    const p = (await propose(analyst, MET010_V1)).definition; v1Id = String(p['definition_id']);
    await decide(owner, v1Id, { decision: 'approve', digest: p['digest'], reason: 'B92\'s MET-010 contract as approved on the demonstration (SYNTHETIC harness)' });
    const r = await compute(analyst, { metricKey: 'MET-010', period: Q3 }); rOnV1 = String(r['result_id']);
    expect(r).toMatchObject({ definition_version: 1, computation_key: 'met010_correction_propagation' });
    expect(Number(r['computation_version'])).toBeGreaterThanOrEqual(2);
    const k = await card(analyst, 'MET-010');
    const v = arr(k['versions'])[0]!;
    expect(obj(v['contract'])['meaning']).toBe('Time from accepted correction to all affected products reconciled or constrained');
    expect(obj(v['computation'])).toMatchObject({ computation_key: 'met010_correction_propagation', registered_in: '0120 §CL' });
  });
  it('REFUSAL then the governed path: the analyst proposes v2 (the meaning of computation v2); the analyst approving it 403; the owner approves it at its digest — v1 superseded', async () => {
    const p = (await propose(analyst, MET010_V2)).definition; v2Id = String(p['definition_id']);
    expect(p).toMatchObject({ metric_key: 'MET-010', version: 2, state: 'proposed', proposed_by: analyst.principalId, k_min: 5, floor_n: 3, computation_key: 'met010_correction_propagation' });
    await refused(decide(analyst, v2Id, { decision: 'approve', digest: p['digest'], reason: 'the proposer approving her own version' }), /./, 403);
    const d = (await decide(owner, v2Id, { decision: 'approve', digest: p['digest'], reason: 'the definition now states what computation v2 measures: material consumer closure (SYNTHETIC harness)' })).definition;
    expect(d).toMatchObject({ state: 'approved', decided_by: owner.principalId, superseded: v1Id });
    const x = (await diff(analyst, v1Id, v2Id)).diff;
    expect(arr(x['changed']).map((f) => f['field']).sort()).toEqual(['exclusions', 'meaning', 'population']);
    const pop = arr(x['changed']).find((f) => f['field'] === 'population')!;
    const keysChanged = Object.keys(obj(pop['to'])).filter((kk) => JSON.stringify(obj(pop['to'])[kk]) !== JSON.stringify(obj(pop['from'])[kk]));
    expect(keysChanged).toEqual(['closure_instant']);
  });
  it('after: the card shows definition v2 with computation v2 together; v1 superseded; v1\'s result still readable on v1; a fresh result names both v2s; the floor is unchanged and n below it stays INDETERMINATE', async () => {
    const k = await card(analyst, 'MET-010');
    const [v2, v1] = arr(k['versions']);
    expect(v2).toMatchObject({ version: 2, state: 'approved', k_min: 5, floor_n: 3 });
    expect(v1).toMatchObject({ version: 1, state: 'superseded' });
    expect(obj(v2!['computation'])).toMatchObject({ computation_key: 'met010_correction_propagation', registered_in: '0120 §CL' });
    const old = await resultRead(analyst, rOnV1);
    expect(old).toMatchObject({ definition_version: 1 });
    expect(obj(old['definition'])).toMatchObject({ version: 1, state: 'superseded' });
    expect(obj(old['computation_now'])).toMatchObject({ registered_in: '0120 §CL' });
    const r = await compute(analyst, { metricKey: 'MET-010', period: Q3 });
    expect(r).toMatchObject({ definition_version: 2, computation_key: 'met010_correction_propagation' });
    expect(Number(r['computation_version'])).toBe(Number(obj(old['computation_now'])['version']));
    if (Number(r['n'] ?? 0) < 3) expect(r['state']).toBe('indeterminate');
  });
});
