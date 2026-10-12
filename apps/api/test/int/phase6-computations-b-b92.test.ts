/**
 * CP-6 B92 §MCB (migration 0113_b92_x_mcb.sql) — COMPUTATIONS B: the fifteen registered computations of App M MET-006..014, MET-017/018,
 * MET-031/033/036/037 through the PRELUDE's compute port (a definition planted APPROVED by the superuser from definitionsB — §MD's ports are
 * a part's; the compute port only reads definitions), each with a positive determinate case on planted SYNTHETIC records, an EXPLAINED
 * indeterminate case (never 0), and the scope applied (or "scope ignored", said); the eight unsupported contracts served `unsupported`
 * with their carriers; the two human-gated inputs — the temporal requirement (MET-009) and the search review (MET-014) — through their
 * routes (positive, refusal, recovery); replay at the result's own as-of; the traceable bound; the record clock.
 *
 * Every row written here is SYNTHETIC fixture data, planted by the superuser where the records' own ports would need a whole upstream
 * world (canonical records, lineage, vault manifests, coverage, scheduler attempts, health events, corrections, graph edges, memory
 * accesses, agent runs, request audit rows — the latter under a dedicated synthetic partition no chain verifier of this harness walks).
 * Each metric's records live in their OWN calendar month of 2026 so one metric's population never leaks into another's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsComputationsBController } from '../../src/analytics/computations-b/computations-b.controller.js';
import { definitionsB } from '../../src/analytics/computations-b/definitions-b.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: AnalyticsComputeController; let b: AnalyticsComputationsBController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-8);
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agent: AuthenticatedPrincipal; let searcher: AuthenticatedPrincipal;
let s1 = ''; let s2 = ''; let s3 = '';                    // three SYNTHETIC sources: s1 feeds the scope's series, s2 does not, s3 has no freshness contract
let e1 = ''; let e2 = ''; let e3 = '';                    // three SYNTHETIC graph entities (e1 in the scope)
let objX = ''; let objY = '';                             // two SYNTHETIC objectives (X in the scope)
const SCOPE = 'corridor-mcb';
const hex = (seed: string = uuidv7()) => createHash('sha256').update(seed).digest('hex');
const at = (month: number, day: number, hour = 10, minute = 0, second = 0) =>
  `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;
const plus = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const ex = async (q: ReturnType<typeof sql>) => { await q.execute(h.su); };
const rq = (as: AuthenticatedPrincipal, action: string, type = 'AMR', id: string | null = null) => h.req(as, action, type, id, 'intelligence');
const compute = async (payload: Row, as: AuthenticatedPrincipal = analyst) => (await c.compute(rq(as, 'analytics.metric.compute'), T(), D(), { payload }) as { result: Row }).result;
const readResult = async (id: string) => (await c.result(rq(owner, 'analytics.read', 'AMR', id), T(), D(), id, { payload: { recordsLimit: 20000 } }) as { result: Row }).result;
const replay = async (id: string) => (await c.replay(rq(owner, 'analytics.metric.replay', 'AMR', id), T(), D(), id) as { replay: Row }).replay;
const declare = (as: AuthenticatedPrincipal, payload: Row) => b.declareTemporal(rq(as, 'analytics.temporal.declare', 'ATR'), T(), D(), { payload }) as Promise<{ requirement: Row }>;
const review = (as: AuthenticatedPrincipal, payload: Row) => b.reviewSearch(rq(as, 'analytics.search.review', 'ASR'), T(), D(), { payload }) as Promise<{ review: Row }>;
const reasons = (r: Row) => JSON.stringify(r['reasons']);
const records = (r: Row): Row[] => (Array.isArray(r['records']) ? r['records'] as Row[] : []);
const roles = (r: Row) => r['records_by_role'] as Record<string, number>;

/** An APPROVED definition planted by the superuser from a definitionsB contract (the §MD port is a part's). */
async function plantDef(cn: MetricContract, o: { key?: string; params?: Row; clock?: 'record' | 'world' } = {}): Promise<string> {
  const id = uuidv7(); const key = o.key ?? cn.metricKey;
  await ex(sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      exclusions, window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality, cost_allocation,
      computation_key, params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, 1, ${`${cn.title} (SYNTHETIC)`}, ${cn.meaning}, ${cn.kind}, ${cn.unit}, ${cn.direction}, ${JSON.stringify(cn.population)}::jsonb,
      ${cn.numerator}, ${cn.denominator}, ${JSON.stringify(cn.exclusions)}::jsonb, ${JSON.stringify({ kind: cn.window.kind, clock: o.clock ?? cn.window.clock })}::jsonb, ${cn.dimensions}::text[],
      ${cn.privacyClass}, ${cn.kMin}, ${cn.floorN}, ${JSON.stringify(cn.threshold)}::jsonb, ${cn.purposeKey}, ${JSON.stringify(cn.serves)}::jsonb, ${cn.cadence}, ${owner.principalId}::uuid,
      ${cn.action}, ${cn.retirement}, ${JSON.stringify(cn.quality)}::jsonb, ${JSON.stringify(cn.costAllocation)}::jsonb, ${cn.computationKey}, ${JSON.stringify({ ...cn.params, ...(o.params ?? {}) })}::jsonb,
      ${cn.computationKey !== null}, ${cn.unsupportedReason}, ${cn.sourceRefs}::text[], 'approved', analytics.digest(${JSON.stringify(cn)}::jsonb), ${analyst.principalId}::uuid, 'human',
      ${owner.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`);
  return id;
}
const contract = (key: string): MetricContract => { const x = definitionsB.find((d) => d.metricKey === key); if (x === undefined) throw new Error(`no contract ${key}`); return x; };

// ── SYNTHETIC record planters ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function obj(type: string, o: { id?: string; version?: number; at: string; refs?: string[]; sources?: string[]; human?: boolean; truth?: string; lifecycle?: string; synthetic?: boolean;
                                      payload?: Row; correctionOf?: string | null; eventTime?: string | null; observationTime?: string | null; validFrom?: string | null }): Promise<string> {
  const id = o.id ?? uuidv7(); const truth = o.truth ?? (o.synthetic ? 'synthetic' : 'observed');
  const human = o.human ?? ((o.refs ?? []).length === 0 && (o.sources ?? []).length === 0);
  await ex(sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
      event_time, observation_time, valid_from, recorded_at, truth_state, synthetic_state, evidence_refs, provenance_ref, method_ref, human_refs, classification, purpose_scope, schema_ref,
      correction_of, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, ${type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${o.version ?? 1}, ${o.lifecycle ?? 'active'}, 'CP-B92-MCB', 'fixture:b92-mcb', ${JSON.stringify(o.sources ?? [])}::jsonb,
      ${o.eventTime ?? null}::timestamptz, ${o.observationTime === undefined ? o.at : o.observationTime}::timestamptz, ${o.validFrom ?? null}::timestamptz, ${o.at}::timestamptz, ${truth}, ${o.synthetic ?? false},
      ${JSON.stringify(o.refs ?? [])}::jsonb, null, 'fixture-b92-mcb@1.0.0', ${JSON.stringify(human ? [`principal:${owner.principalId}`] : [])}::jsonb, 'internal', 'analytics', ${`${type}@v1`},
      ${o.correctionOf ?? null}, ${uuidv7()}::uuid, ${JSON.stringify(o.payload ?? {})}::jsonb, ${hex()})`);
  return id;
}
async function manifest(createdAt: string, tombstonedAt: string | null = null): Promise<{ id: string; digest: string }> {
  const id = uuidv7(); const digest = hex();
  await ex(sql`insert into observation.blob_manifests (manifest_id, scope, tenant_id, domain_id, vault, locator, content_digest, byte_length, classification, residency, retention_profile, source_id, contract_version,
      acquisition_mode, created_at, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'evidence', ${`${T()}/${D()}/${id}`}, ${digest}, 4096, 'internal', 'EU', 'default', ${s1}::uuid, 1, 'replay', ${createdAt}::timestamptz, ${uuidv7()}::uuid)`);
  if (tombstonedAt !== null) {
    await ex(sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, tombstoned_at, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'SYNTHETIC tombstone for the B92 harness', ${tombstonedAt}::timestamptz, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
  }
  return { id, digest };
}
/** An EVD with stored bytes (and its blob citation); returns the EVD id and its content digest. */
async function evidence(recordedAt: string, tombstonedAt: string | null = null): Promise<{ id: string; digest: string; manifest: string }> {
  const m = await manifest(recordedAt, tombstonedAt);
  const id = await obj('EVD', { at: recordedAt, refs: [`blob:${m.id}`], human: false, payload: { manifest_id: m.id, content_digest: m.digest, byte_length: 4096 } });
  return { id, digest: m.digest, manifest: m.id };
}
async function source(key: string, freshness: number | null): Promise<string> {
  const id = uuidv7();
  await ex(sql`insert into observation.source_contracts_current (source_id, contract_version, scope, tenant_id, domain_id, src_object_id, src_object_version, source_key, name, publisher, authority_class,
      connector_kind, acquisition_mode, data_origin, lifecycle_state, rights_state, registrar_principal_id, approver_principal_id, cadence_seconds, freshness_threshold_seconds, classification_ceiling, residency, contract)
    values (${id}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, 1, ${key}, ${`${key} (SYNTHETIC)`}, 'b92 harness', 'observational', 'rest', 'replay', 'synthetic', 'active', 'confirmed',
      ${analyst.principalId}::uuid, ${owner.principalId}::uuid, 600, ${freshness}, 'internal', 'EU', '{}'::jsonb)`);
  return id;
}
async function healthLoss(src: string, evaluatedAt: string, prior: string | null, next: string): Promise<string> {
  const id = uuidv7();
  await ex(sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, reason, lag_class, correlation_id, recorded_at)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, ${prior}, ${next}, ${evaluatedAt}::timestamptz, 'v1', 'u1', 'SYNTHETIC loss for the B92 harness', 'collection_failure', ${uuidv7()}::uuid, ${evaluatedAt}::timestamptz)`);
  return id;
}
async function marker(src: string, event: string, setAt: string, kind = 'forecast'): Promise<void> {
  await ex(sql`insert into observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, state, set_at, set_by_event, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, ${kind}, ${uuidv7()}::uuid, 'degraded', 'SYNTHETIC marker', 'active', ${setAt}::timestamptz, ${event}::uuid, ${uuidv7()}::uuid)`);
}
async function coverageItem(src: string, event: string, createdAt: string): Promise<void> {
  await ex(sql`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, evaluation, created_at, updated_at, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'source.coverage_loss', 'source', ${src}::uuid, ${event}::uuid, 'source.health', 'SYNTHETIC coverage loss item', 'material', 'open', '{}'::jsonb,
      ${createdAt}::timestamptz, ${createdAt}::timestamptz, ${uuidv7()}::uuid)`);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController);
  b = h.app.get(AnalyticsComputationsBController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92mcb-analyst');
  analyst2 = await h.humanWithSession(['product_analyst'], 'b92mcb-analyst2');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92mcb-owner');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92mcb-outsider');
  searcher = await h.humanWithSession(['domain_analyst'], 'b92mcb-searcher');
  const agentId = uuidv7();
  await ex(sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
    values (${agentId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92mcb-agent-${RUN}`}, ${`b92mcb-ag-${RUN}`}, 'active')`);
  for (const role of ['product_analyst', 'product_analytics_owner', 'attention_agent']) {
    await ex(sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentId}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`);
  }
  agent = await h.openSession({ ...h.manager, principalId: agentId, kind: 'agent', assurance: 'agent_grant', homeScope: 'DOMAIN', homeDomainId: D(),
    bindings: ['product_analyst', 'product_analytics_owner', 'attention_agent'].map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
  s1 = await source(`b92mcb-s1-${RUN}`, 3600); s2 = await source(`b92mcb-s2-${RUN}`, 3600); s3 = await source(`b92mcb-s3-${RUN}`, null);
  for (const [k, n] of [['e1', 'Bab el-Mandeb (SYNTHETIC)'], ['e2', 'Suez (SYNTHETIC)'], ['e3', 'Jeddah (SYNTHETIC)']] as const) {
    const id = uuidv7();
    await ex(sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', ${n}, ${n.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
    if (k === 'e1') e1 = id; else if (k === 'e2') e2 = id; else e3 = id;
  }
  for (const k of ['X', 'Y'] as const) {
    const id = uuidv7();
    await ex(sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'OBJ', 1, ${`objective ${k} (SYNTHETIC)`}, 'a SYNTHETIC objective of the B92 harness', 'active', 'not_applicable', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
    if (k === 'X') objX = id; else objY = id;
  }
  // the scope "the corridor": e1, objective X, the series s1 feeds
  await ex(sql`insert into prediction.series_registry (series_key, scope, tenant_id, domain_id, source_key, parser_ref, value_field, unit, description, registered_by, correlation_id)
    values (${`b92mcb:chokepoint:${RUN}`}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92mcb-s1-${RUN}`}, 'fixture@1', 'n_total', 'count', 'a SYNTHETIC series of the B92 harness', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
  await ex(sql`insert into analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, objective_ids, series_keys, description, state, digest, proposed_by, decided_by, decided_at, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SCOPE}, 1, 'the corridor (SYNTHETIC)', ${[e1]}::uuid[], ${[objX]}::uuid[], ${[`b92mcb:chokepoint:${RUN}`]}::text[],
      'the SYNTHETIC corridor scope of the B92 §MCB harness', 'approved', ${hex()}, ${analyst.principalId}::uuid, ${owner.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`);
  for (const cn of definitionsB) await plantDef(cn);
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('MCB0 · the registry and the contracts', () => {
  it('the fifteen computations are registered with their kind, dimensions, reads and scope rule — never a person dimension', async () => {
    const reg = (await c.registry(rq(analyst, 'analytics.read'), T(), D()) as { computations: Row[] }).computations;
    const mine = reg.filter((r) => String(r['computation_key']).match(/^met0(0[6-9]|1[0-4]|1[78]|3[1367])_/));
    expect(mine.map((r) => r['computation_key']).sort()).toEqual(definitionsB.filter((d) => d.computationKey !== null).map((d) => d.computationKey).sort());
    for (const r of mine) {
      const cn = definitionsB.find((d) => d.computationKey === r['computation_key'])!;
      expect(r['kind']).toBe(cn.kind); expect(r['dimensions']).toEqual(cn.dimensions); expect(String(r['scope_rule']).length).toBeGreaterThan(8);
      expect(r['registered_in']).toBe('0113 §MCB');
    }
  });
  it('the twenty-three contracts plant APPROVED under the table\'s own checks; the eight unsupported are served `unsupported` with their carrier — visible, never a fake value', async () => {
    expect(definitionsB.map((d) => d.metricKey)).toEqual(['MET-006', 'MET-007', 'MET-008', 'MET-009', 'MET-010', 'MET-011', 'MET-012', 'MET-013', 'MET-014', 'MET-015', 'MET-016', 'MET-017', 'MET-018',
      'MET-031', 'MET-032', 'MET-033', 'MET-034', 'MET-035', 'MET-036', 'MET-037', 'MET-038', 'MET-039', 'MET-040']);
    const carriers: Record<string, RegExp> = { 'MET-015': /B55/, 'MET-016': /B52.*H1/, 'MET-032': /H2/, 'MET-034': /B108.*B107\/H3/, 'MET-035': /B106/, 'MET-038': /B64/, 'MET-039': /B94/, 'MET-040': /B76/ };
    for (const [key, re] of Object.entries(carriers)) {
      const r = await compute({ metricKey: key, period: '2026-Q2' });
      expect(r, key).toMatchObject({ state: 'unsupported', value: null, n: null, records_count: 0 });
      expect(reasons(r)).toMatch(re);
    }
  });
});

describe('MCB1 · MET-006 evidence citation resolution (2026-01)', () => {
  let resultId = '';
  beforeAll(async () => {
    const good = [] as Array<{ id: string; digest: string }>;
    for (let i = 0; i < 6; i++) good.push(await evidence(at(1, 3 + i)));                                // 6 EVD → 6 blob citations, all resolving
    const dead = await evidence(at(1, 10), at(1, 20));                                                   // bytes tombstoned on 01-20: its blob citation fails
    for (let i = 0; i < 12; i++) await obj('OBS', { at: at(1, 12 + i), refs: [`EVD:${good[i % 6]!.id}@1`], sources: [`SRC:${uuidv7()}@1`] });   // 12 resolving citations
    await obj('OBS', { at: at(1, 25), refs: [`EVD:${dead.id}@1`] });                                    // the tombstoned bytes: fails
    await obj('OBS', { at: at(1, 26), refs: [`EVD:${uuidv7()}@1`] });                                   // a version that does not exist: fails
    for (let i = 0; i < 4; i++) {                                                                        // 4 claims with lineage + a register reference each
      const claim = await obj('CLM', { at: at(1, 27, 9 + i), refs: [`EVD:${good[i]!.id}`, `call:${uuidv7()}`], truth: 'extracted' });
      await ex(sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
          confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, recorded_at, correlation_id)
        values (${claim}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'replay', ${good[i]!.id}::uuid, ${good[i]!.digest}, 10, ${i === 3 ? 9000 : 200}, 0.9,
          ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${at(1, 27, 9 + i)}::timestamptz, ${uuidv7()}::uuid)`);   // the 4th segment ends past the bytes: fails
    }
  });
  it('positive: 25 citations of January — 21 resolve (blob, explicit version, lineage digest + segment); the tombstoned bytes, the missing version and the segment past the bytes do not; the register references counted outside', async () => {
    const r = await compute({ metricKey: 'MET-006', period: '2026-01' });
    resultId = String(r['result_id']);
    expect(r).toMatchObject({ state: 'determinate', kind: 'rate', n: 25 });
    expect(Number(r['numerator'])).toBe(21);
    expect(Number(r['value'])).toBeCloseTo(21 / 25, 6);
    expect(r['uncertainty']).toMatchObject({ method: 'wilson' });
    expect((r['quality'] as Row)['register_references']).toEqual({ call: 4 });
    expect((r['quality'] as Row)['pinning']).toMatchObject({ explicit: 14, lineage_digest: 4 });
    const rd = await readResult(resultId);
    expect(roles(rd)).toEqual({ numerator: 21, denominator: 4 });
    const failed = records(rd).filter((x) => x['role'] === 'denominator').map((x) => String(x['reason']));
    expect(failed.join(' | ')).toMatch(/tombstoned/); expect(failed.join(' | ')).toMatch(/version 1 of the cited record does not exist/); expect(failed.join(' | ')).toMatch(/beyond the evidence's 4096 bytes/);
  });
  it('indeterminate, explained: the OBS cohort (14 citations) is below the floor 20 — the value NULL, never 0; a dimension outside the computation is refused', async () => {
    const r = await compute({ metricKey: 'MET-006', period: '2026-01', cohort: { object_type: 'OBS' } });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 14 });
    expect(reasons(r)).toMatch(/n = 14 is below the floor 20/);
    await refused(compute({ metricKey: 'MET-006', period: '2026-01', cohort: { source: 'x' } }), /^metric computation rejected \(dimension\)/, 422);
  });
  it('scope ignored, said: computed for the corridor the population is the domain\'s (n 25) and the quality says why', async () => {
    const r = await compute({ metricKey: 'MET-006', period: '2026-01', scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 25, scope_key: SCOPE });
    expect((r['quality'] as Row)['scope_rule']).toMatch(/^ignored: citation integrity is domain-wide/);
  });
  it('the traceable bound and the record clock: over params.max_records no value (said); a world-clock definition is not computed on another clock', async () => {
    await plantDef(contract('MET-006'), { key: 'MET-006.cap', params: { max_records: 5 } });
    const capped = await compute({ metricKey: 'MET-006.cap', period: '2026-01' });
    expect(capped).toMatchObject({ state: 'indeterminate', value: null, records_count: 0 });
    expect(reasons(capped)).toMatch(/holds 33 records, above the traceable bound 5/);
    await plantDef(contract('MET-006'), { key: 'MET-006.world', clock: 'world' });
    const world = await compute({ metricKey: 'MET-006.world', period: '2026-01' });
    expect(world).toMatchObject({ state: 'indeterminate', value: null, clock: 'world' });
    expect(reasons(world)).toMatch(/MET-006 is measured on the record clock only/);
  });
  it('replay at the result\'s own as-of: reproduced', async () => {
    expect(await replay(resultId)).toMatchObject({ replay_verdict: 'reproduced', state: 'determinate' });
  });
});

describe('MCB2 · MET-007 provenance closure (2026-02)', () => {
  beforeAll(async () => {
    const ev = await evidence(at(2, 1));
    const bad = await evidence(at(2, 1), at(2, 2));
    const pkg = async (objective: string, n: number, broken: number) => {
      const p = uuidv7(); const dec = uuidv7();
      await ex(sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${dec}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'DEC', 1, 'a SYNTHETIC decision', 'a SYNTHETIC decision of the B92 harness', 'active', 'not_applicable', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
      await ex(sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, current_version, declared_by, correlation_id)
        values (${p}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${dec}::uuid, 'a SYNTHETIC package', 'a SYNTHETIC package of the B92 harness', ${owner.principalId}::uuid, 'draft', 1, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
      await ex(sql`insert into decision.package_versions (package_id, version, scope, tenant_id, domain_id, state, known_at, objectives, author_principal_id, correlation_id)
        values (${p}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'draft', ${at(2, 3)}::timestamptz, ${JSON.stringify([objective])}::jsonb, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
      const cites: Row[] = [];
      for (let i = 0; i < n; i++) {
        const fct = await obj('FCT', { at: at(2, 4), refs: [`EVD:${(i < broken ? bad : ev).id}@1`], truth: 'inferred' });
        cites.push({ kind: 'forecast', id: fct, version: 1, digest: hex() });
      }
      const asu = await obj('ASU', { at: at(2, 4), refs: [`review-case:${uuidv7()}`], human: true, truth: 'asserted' });   // a named human's declaration: its own origin
      cites.push({ kind: 'assumption', id: asu, version: 1, digest: hex() });
      await ex(sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, set_by, set_at, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${p}::uuid, 1, 'reroute', 'reroute (SYNTHETIC)', 'intervention', ${JSON.stringify(cites)}::jsonb, false,
          'no simulation: a SYNTHETIC option of the harness', ${owner.principalId}::uuid, ${at(2, 5)}::timestamptz, ${uuidv7()}::uuid)`);
      await ex(sql`update decision.packages_current set state = 'proposed' where package_id = ${p}::uuid`);   // live now (the harness stands for the propose act)
    };
    await pkg(objX, 20, 2);   // in scope: 21 outputs, 2 resting on tombstoned bytes
    await pkg(objY, 2, 0);    // outside the scope: 3 outputs
  });
  it('positive: 24 decision-active outputs — 22 with complete lineage (evidence → bytes; the assumption a named human\'s declaration), 2 broken at tombstoned bytes, the walk in each record', async () => {
    const r = await compute({ metricKey: 'MET-007', period: '2026-02' });
    expect(r).toMatchObject({ state: 'determinate', n: 24 });
    expect(Number(r['numerator'])).toBe(22);
    const rd = await readResult(String(r['result_id']));
    const done = records(rd).find((x) => x['role'] === 'numerator' && String(x['record_id']).startsWith('assumption:'))!;
    expect((done['detail'] as Row)['lineage']).toMatchObject({ complete: true, origins: ['human_declaration'] });
    const broken = records(rd).filter((x) => x['role'] === 'denominator');
    expect(broken).toHaveLength(2); expect(String(broken[0]!['reason'])).toMatch(/tombstoned/);
  });
  it('the scope applied: for the corridor only the package naming objective X counts (21) — a package of another objective is outside', async () => {
    const r = await compute({ metricKey: 'MET-007', period: '2026-02', scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 21 });
    expect(Number(r['numerator'])).toBe(19);
  });
  it('indeterminate, explained: the ASU cohort (2 outputs) is below the floor 20', async () => {
    const r = await compute({ metricKey: 'MET-007', period: '2026-02', cohort: { object_type: 'ASU' } });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 2 });
    expect(reasons(r)).toMatch(/below the floor 20/);
  });
});

describe('MCB3 · MET-008 truth-state completeness (2026-03)', () => {
  beforeAll(async () => {
    for (let i = 0; i < 16; i++) await obj('OBS', { at: at(3, 2 + i) });
    const a = await obj('RSK', { at: at(3, 20), truth: 'asserted' }); await obj('RSK', { id: a, version: 2, at: at(3, 21), truth: 'assessed' });                  // valid transition
    const s = await obj('RSK', { at: at(3, 20), synthetic: true }); await obj('RSK', { id: s, version: 2, at: at(3, 21), truth: 'asserted' });                     // synthetic became real
    const w = await obj('RSK', { at: at(3, 20), truth: 'withdrawn', lifecycle: 'withdrawn' }); await obj('RSK', { id: w, version: 2, at: at(3, 21), truth: 'asserted' }); // a withdrawn record changed
    const g = await obj('RSK', { at: at(3, 20), truth: 'asserted' }); await obj('RSK', { id: g, version: 3, at: at(3, 21), truth: 'asserted' });                  // a gap
    for (let i = 0; i < 3; i++) await obj('MSR', { at: at(3, 25 + i), truth: 'asserted' });
  });
  it('positive: 27 versions — the 3 invalid transitions named (synthetic became real, a withdrawn record changed, a gap) and the state complete by construction said', async () => {
    const r = await compute({ metricKey: 'MET-008', period: '2026-03' });
    expect(r).toMatchObject({ state: 'determinate', n: 27 });
    expect(Number(r['numerator'])).toBe(24);
    expect((r['quality'] as Row)['by_construction']).toContain('truth_state NOT NULL');
    const rd = await readResult(String(r['result_id']));
    const why = records(rd).filter((x) => x['role'] === 'denominator').map((x) => String(x['reason'])).join(' | ');
    expect(why).toMatch(/a synthetic record became a real one/); expect(why).toMatch(/a withdrawn record changed without a correction/); expect(why).toMatch(/version 3 follows version 1/);
  });
  it('indeterminate, explained: a cohort of first versions only — the transitions unexercised, a 100 % would be vanity (and n below the floor)', async () => {
    const r = await compute({ metricKey: 'MET-008', period: '2026-03', cohort: { object_type: 'MSR' } });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 3 });
    expect(reasons(r)).toMatch(/transitions are unexercised — a 100 % here would be a vanity number/);
    const sc = await compute({ metricKey: 'MET-008', period: '2026-03', scopeKey: SCOPE });   // scope ignored, said
    expect(sc).toMatchObject({ n: 27, scope_key: SCOPE }); expect((sc['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
  });
});

describe('MCB4 · MET-009 temporal completeness and its requirement (analytics.temporal.declare) (2026-04)', () => {
  beforeAll(async () => {
    for (let i = 0; i < 22; i++) await obj('OBS', { at: at(4, 2 + i), validFrom: i < 18 ? at(4, 1) : null });   // 18 carry valid_from, 4 do not
    for (let i = 0; i < 3; i++) await obj('MSR', { at: at(4, 25 + i), truth: 'asserted', observationTime: null });
  });
  it('indeterminate before any requirement: what "required" means is undeclared', async () => {
    const r = await compute({ metricKey: 'MET-009', period: '2026-04' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(r)).toMatch(/no temporal requirement is in force for any object type/);
  });
  it('refusals: an analyst (PDP), an agent (the human gate), a stale version (409), an unknown type (404), fields outside the four (422), no reason (422)', async () => {
    await refused(declare(analyst, { objectType: 'OBS', requiredFields: ['observation_time'], reason: 'the OBS records carry their observation time', expectedVersion: 0 }), /./, 403);
    await refused(declare(agent, { objectType: 'OBS', requiredFields: ['observation_time'], reason: 'the OBS records carry their observation time', expectedVersion: 0 }), /human/i, 403);
    await refused(declare(owner, { objectType: 'OBS', requiredFields: ['observation_time'], reason: 'the OBS records carry their observation time', expectedVersion: 3 }), /^metric definition rejected \(stale\)/, 409);
    await refused(declare(owner, { objectType: 'ZZZ', requiredFields: ['observation_time'], reason: 'no such type in the schema registry', expectedVersion: 0 }), /^metric definition rejected \(unknown_object_type\)/, 404);
    await refused(declare(owner, { objectType: 'OBS', requiredFields: ['recorded_at'], reason: 'recorded_at is never listed', expectedVersion: 0 }), /^metric definition rejected \(fields\)/, 422);
    await refused(declare(owner, { objectType: 'OBS', requiredFields: ['valid_from'], reason: 'short', expectedVersion: 0 }), /^metric definition rejected \(reason\)/, 422);
  });
  it('positive: the owner declares OBS → observation_time + valid_from (version 1); MET-009 over April: 18 of 22 OBS versions complete, the missing field named; MSR outside the population (counted)', async () => {
    const d = (await declare(owner, { objectType: 'OBS', requiredFields: ['valid_from', 'observation_time', 'valid_from'], reason: 'an observation names when it was observed and from when it holds (SYNTHETIC)', expectedVersion: 0 })).requirement;
    expect(d).toMatchObject({ object_type: 'OBS', version: 1, state: 'approved', required_fields: ['observation_time', 'valid_from'] });
    await refused(declare(owner, { objectType: 'OBS', requiredFields: ['observation_time', 'valid_from'], reason: 'the same requirement again', expectedVersion: 1 }), /^metric definition rejected \(duplicate\)/, 409);
    const r = await compute({ metricKey: 'MET-009', period: '2026-04' });
    expect(r).toMatchObject({ state: 'determinate', n: 22 });
    expect(Number(r['numerator'])).toBe(18);
    expect((r['quality'] as Row)['types_without_requirement']).toMatchObject({ MSR: 3 });
    const sc = await compute({ metricKey: 'MET-009', period: '2026-04', scopeKey: SCOPE });   // scope ignored, said
    expect(sc).toMatchObject({ n: 22 }); expect((sc['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
    const rd = await readResult(String(r['result_id']));
    expect(records(rd).filter((x) => x['role'] === 'denominator').map((x) => x['reason'])).toEqual(['missing valid_from', 'missing valid_from', 'missing valid_from', 'missing valid_from']);
    const list = (await b.temporalRequirements(rq(analyst, 'analytics.read', 'ATR'), T(), D()) as { requirements: Row }).requirements;
    expect((list['current'] as Row[]).map((x) => x['object_type'])).toEqual(['OBS']);
    expect(JSON.stringify(list)).not.toMatch(/declared_by/);
  });
  it('a type with no requirement in force is indeterminate for its cohort; recovery: the owner retires OBS\'s requirement (version 2) — MET-009 is indeterminate again, the history kept', async () => {
    const msr = await compute({ metricKey: 'MET-009', period: '2026-04', cohort: { object_type: 'MSR' } });
    expect(msr).toMatchObject({ state: 'indeterminate' }); expect(reasons(msr)).toMatch(/no temporal requirement is in force for MSR/);
    const ret = (await declare(owner, { objectType: 'OBS', retire: true, reason: 'the observation model is being replaced (SYNTHETIC)', expectedVersion: 1 })).requirement;
    expect(ret).toMatchObject({ version: 2, state: 'retired', required_fields: [] });
    await refused(declare(owner, { objectType: 'OBS', retire: true, reason: 'nothing left in force to retire', expectedVersion: 2 }), /^metric definition rejected \(state\)/, 409);
    const r = await compute({ metricKey: 'MET-009', period: '2026-04' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    const n = await one(sql`select count(*)::int n from analytics.temporal_requirements where tenant_id = ${T()}::uuid and object_type = 'OBS'`);
    expect(n['n']).toBe(2);
  });
});

describe('MCB5 · MET-010 correction propagation time (2026-05, 2026-06)', () => {
  const kase = async (src: string, applied: string, close: { assessedAfter?: number; walkedAfter?: number } | null) => {
    const id = uuidv7();
    await ex(sql`insert into observation.correction_current (case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at, channel, reason, propagation_unresolved, propagation_state)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, 'correction', 'applied', ${applied}::timestamptz, 'upload', 'a SYNTHETIC correction', 'SYNTHETIC',
        ${close === null ? 'pending' : 'complete'})`);
    await ex(sql`insert into observation.correction_events (event_id, scope, tenant_id, domain_id, case_id, event, occurred_at, actor, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'case.applied', ${applied}::timestamptz, 'fixture', ${uuidv7()}::uuid)`);
    if (close?.assessedAfter !== undefined) {
      await ex(sql`insert into graph.invalidations_current (invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id, correction_case_id, opened_at, opened_by, statement, state, assessed_at, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'evidence_correction', ${uuidv7()}::uuid, ${id}::uuid, ${applied}::timestamptz, ${owner.principalId}::uuid, 'a SYNTHETIC assessment',
          'assessed', ${plus(applied, close.assessedAfter)}::timestamptz, ${uuidv7()}::uuid)`);
    }
    if (close?.walkedAfter !== undefined) {
      await ex(sql`insert into graph.propagation_attempts (event_id, scope, tenant_id, domain_id, case_id, state, deliveries, attempts, roots, roots_walked, first_received_at, last_delivered_at, finished_at, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'complete', 1, 1, '[]'::jsonb, '[]'::jsonb, ${applied}::timestamptz, ${applied}::timestamptz,
          ${plus(applied, close.walkedAfter)}::timestamptz, ${uuidv7()}::uuid)`);
    }
    return id;
  };
  beforeAll(async () => {
    await kase(s1, at(5, 2), { assessedAfter: 600 });
    await kase(s1, at(5, 3), { assessedAfter: 300, walkedAfter: 1200 });   // closure = the later: the walk at +1200
    await kase(s2, at(5, 4), { walkedAfter: 60 });
    await kase(s1, at(5, 5), null);                                         // still propagating: censored
    await kase(s1, at(6, 2), { assessedAfter: 100 });
    await kase(s1, at(6, 3), null); await kase(s1, at(6, 4), null);
  });
  it('positive: May — three closed corrections, median 600 s (60, 600, 1200), the censored one excluded and named, the closure instant per record', async () => {
    const r = await compute({ metricKey: 'MET-010', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', kind: 'duration', n: 3 });
    expect(Number(r['value'])).toBe(600);
    expect(r['distribution']).toMatchObject({ min: 60, max: 1200, n: 3 });
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ included: 3, excluded: 1 });
    expect(records(rd).map((x) => (x['detail'] as Row)['closure']).filter(Boolean)).toContain('propagation walk complete');
  });
  it('the scope applied: for the corridor only s1\'s corrections (2 closed — below the floor 3, said)', async () => {
    const r = await compute({ metricKey: 'MET-010', period: '2026-05', scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'indeterminate', n: 2 }); expect(reasons(r)).toMatch(/n = 2 is below the floor 3/);
  });
  it('indeterminate, explained: June — 2 of 3 accepted corrections still propagating: the median would be survivor-biased', async () => {
    const r = await compute({ metricKey: 'MET-010', period: '2026-06' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(r)).toMatch(/2 of 3 accepted corrections are still propagating \(censored\)/);
  });
});

describe('MCB6 · MET-011 coverage attainment (2026-05)', () => {
  beforeAll(async () => {
    const pair = async (src: string, day: number, actual: number | null, expected: number) => {
      const ws = at(5, day, 0); const we = at(5, day, 23);
      await ex(sql`insert into observation.coverage_measurements (measurement_id, scope, tenant_id, domain_id, source_id, dimension, state, value_numeric, evaluated_at, window_start, window_end, coverage_universe_version, calc_method, calc_version, correlation_id, recorded_at)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, 'expected_coverage', 'measured', ${expected}, ${at(5, day, 23, 30)}::timestamptz, ${ws}::timestamptz, ${we}::timestamptz, 'u1', 'fixture', 'v1', ${uuidv7()}::uuid, ${at(5, day, 23, 30)}::timestamptz)`);
      await ex(sql`insert into observation.coverage_measurements (measurement_id, scope, tenant_id, domain_id, source_id, dimension, state, value_numeric, evaluated_at, window_start, window_end, coverage_universe_version, calc_method, calc_version, correlation_id, recorded_at)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, 'actual_coverage', ${actual === null ? 'unknown' : 'measured'}, ${actual}, ${at(5, day, 23, 31)}::timestamptz, ${ws}::timestamptz, ${we}::timestamptz, 'u1', 'fixture', 'v1', ${uuidv7()}::uuid, ${at(5, day, 23, 31)}::timestamptz)`);
    };
    await pair(s1, 2, 100, 100); await pair(s1, 3, 98, 100); await pair(s1, 4, 100, 100); await pair(s2, 5, 100, 90); await pair(s2, 6, 95, 90); await pair(s2, 7, 40, 90);
    await pair(s1, 8, null, 100);   // unmeasured: excluded
  });
  it('indeterminate, explained: the product holds no approved coverage target — the records shown, the value withheld', async () => {
    const r = await compute({ metricKey: 'MET-011', period: '2026-05' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 6 });
    expect(reasons(r)).toMatch(/no approved coverage target exists in the product/);
  });
  it('positive: a definition DECLARING the coverage universe\'s expected coverage its target (approved with the definition, labelled) — 4 of 6 attained', async () => {
    await plantDef(contract('MET-011'), { key: 'MET-011.T', params: { expected_is_target: true } });
    const r = await compute({ metricKey: 'MET-011.T', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 6 });
    expect(Number(r['numerator'])).toBe(4);
    expect((r['quality'] as Row)['target']).toMatch(/declared by the definition/);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ numerator: 4, denominator: 2, excluded: 1 });
  });
  it('the scope applied: for the corridor only s1 (3 measured: 2 attained)', async () => {
    const r = await compute({ metricKey: 'MET-011.T', period: '2026-05', scopeKey: SCOPE });
    expect(r).toMatchObject({ n: 3 }); expect(Number(r['numerator'])).toBe(2);
  });
});

describe('MCB7 · MET-012 freshness attainment (2026-05)', () => {
  beforeAll(async () => {
    const attempt = async (src: string, started: string, finishedAfter: number, outcome: string) => {
      await ex(sql`insert into observation.scheduled_attempts (attempt_id, scope, tenant_id, domain_id, source_id, contract_version, scheduler_id, job_id, trigger, started_at, finished_at, outcome, run_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${src}::uuid, 1, 'b92mcb', ${uuidv7()}, 'scheduler', ${started}::timestamptz, ${plus(started, finishedAfter)}::timestamptz, ${outcome},
          ${outcome === 'refused' ? null : uuidv7()}::uuid)`);
    };
    for (let i = 0; i < 10; i++) await attempt(s1, at(5, 10, i), 60, 'finished');   // hourly: within the 3600 s threshold
    await attempt(s1, at(5, 10, 10), 60, 'failed');                                 // no arrival
    await attempt(s1, at(5, 10, 13), 60, 'finished');                               // after a 3 h gap: freshness was lost
    await attempt(s2, at(5, 11), 60, 'finished'); await attempt(s2, at(5, 11, 11), 60, 'finished');
    await attempt(s3, at(5, 12), 60, 'finished');                                   // no freshness contract: excluded
  });
  it('positive: 14 expected arrivals with a contract — 12 within it; the failure and the late arrival named; the uncontracted source excluded', async () => {
    const r = await compute({ metricKey: 'MET-012', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 14 });
    expect(Number(r['numerator'])).toBe(12);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ numerator: 12, denominator: 2, excluded: 1 });
    expect(records(rd).filter((x) => x['role'] === 'denominator').map((x) => x['reason']).join(' | ')).toMatch(/did not happen \(failed\).*gap beyond the freshness threshold|gap beyond the freshness threshold.*did not happen \(failed\)/);
  });
  it('the scope applied (only s1: 12) and the explained indeterminate of a thin cohort (s2: 2 < floor 10)', async () => {
    const sc = await compute({ metricKey: 'MET-012', period: '2026-05', scopeKey: SCOPE });
    expect(sc).toMatchObject({ n: 12 });
    const thin = await compute({ metricKey: 'MET-012', period: '2026-05', cohort: { source: `b92mcb-s2-${RUN}` } });
    expect(thin).toMatchObject({ state: 'indeterminate', n: 2, value: null }); expect(reasons(thin)).toMatch(/below the floor 10/);
  });
});

describe('MCB8 · MET-013 blind-spot latency and MET-037 degraded declaration latency (2026-05, 2026-06)', () => {
  let r13 = '';
  beforeAll(async () => {
    const l1 = await healthLoss(s1, at(5, 14), 'healthy', 'degraded'); await coverageItem(s1, l1, plus(at(5, 14), 120)); await marker(s1, l1, plus(at(5, 14), 60)); await marker(s1, l1, plus(at(5, 14), 300), 'warning');
    const l2 = await healthLoss(s1, at(5, 15), 'unknown', 'failed'); await coverageItem(s1, l2, plus(at(5, 15), 600)); await marker(s1, l2, plus(at(5, 15), 900));
    const l3 = await healthLoss(s2, at(5, 16), null, 'degraded'); await marker(s2, l3, plus(at(5, 16), 30));
    await healthLoss(s1, at(5, 17), 'degraded', 'failed');                          // not a loss (already lost): outside the population
    await healthLoss(s1, at(6, 14), 'healthy', 'suspended');                        // never declared, no marker
  });
  it('MET-013 positive: three losses — declared after 60 s (the marker before the item), 600 s (the item), 30 s; median 60 s', async () => {
    const r = await compute({ metricKey: 'MET-013', period: '2026-05' });
    r13 = String(r['result_id']);
    expect(r).toMatchObject({ state: 'determinate', kind: 'duration', n: 3 });
    expect(Number(r['value'])).toBe(60);
    const rd = await readResult(r13);
    expect(records(rd).map((x) => (x['detail'] as Row)['declared_by']).sort()).toEqual(['attention item', 'impact marker', 'impact marker']);
  });
  it('MET-013 indeterminate, explained: June\'s loss was never declared — censored, never dropped; the scope applied (s1 only: 2 < floor)', async () => {
    const r = await compute({ metricKey: 'MET-013', period: '2026-06' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(r)).toMatch(/1 coverage loss\(es\) were never declared/);
    const sc = await compute({ metricKey: 'MET-013', period: '2026-05', scopeKey: SCOPE });
    expect(sc).toMatchObject({ n: 2, state: 'indeterminate' });
    expect(await replay(r13)).toMatchObject({ replay_verdict: 'reproduced' });
  });
  it('MET-037 positive: the same conditions to the LAST marker (the accurate user-visible state) — 300, 900, 30 s; median 300 s; a person\'s product degradation counted, not measured', async () => {
    const r = await compute({ metricKey: 'MET-037', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', kind: 'duration', n: 3 });
    expect(Number(r['value'])).toBe(300);
    expect((r['quality'] as Row)['products_degraded_by_a_person']).toBe(0);
  });
  it('MET-037 indeterminate, explained: June\'s condition marked no product — excluded with the reason, nothing to measure (never 0)', async () => {
    const r = await compute({ metricKey: 'MET-037', period: '2026-06' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 0 });
    const rd = await readResult(String(r['result_id']));
    expect(records(rd)[0]).toMatchObject({ role: 'excluded', reason: 'the condition marked no dependent product (no product state to declare)' });
  });
});

describe('MCB9 · MET-014 search usefulness and the search review (analytics.search.review) (2026-05)', () => {
  const searches: string[] = []; let own = '';
  beforeAll(async () => {
    const search = async (who: string, i: number) => {
      const id = uuidv7();
      await ex(sql`insert into executive.search_events (search_id, scope, tenant_id, domain_id, principal_id, query, hits, kinds, searched_at, correlation_id)
        values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${who}::uuid, ${`bab el-mandeb transit delay ${i} (SYNTHETIC)`}, ${3 + i}, '["warning","forecast"]'::jsonb, ${at(5, 20, i)}::timestamptz, ${uuidv7()}::uuid)`);
      return id;
    };
    for (let i = 0; i < 12; i++) searches.push(await search(searcher.principalId, i));
    own = await search(analyst.principalId, 13);
  });
  it('refusals: the searcher reviewing their own search (separation of duties), an agent (human gate), an outsider (PDP), an unknown search (404), a bad verdict / class (422)', async () => {
    await refused(review(analyst, { searchId: own, verdict: 'relevant', queryClass: 'warning', reason: 'my own search was useful' }), /^metric computation rejected \(separation_of_duties\)/, 403);
    await refused(review(agent, { searchId: searches[0], verdict: 'relevant', queryClass: 'warning', reason: 'an agent judging relevance' }), /human/i, 403);
    await refused(review(outsider, { searchId: searches[0], verdict: 'relevant', queryClass: 'warning', reason: 'no analytics role' }), /./, 403);
    await refused(review(analyst2, { searchId: uuidv7(), verdict: 'relevant', queryClass: 'warning', reason: 'a search that never happened' }), /^metric computation rejected \(unknown_search\)/, 404);
    await refused(review(analyst2, { searchId: searches[0], verdict: 'maybe', queryClass: 'warning', reason: 'neither relevant nor not' }), /^metric computation rejected \(verdict\)/, 422);
    await refused(review(analyst2, { searchId: searches[0], verdict: 'relevant', queryClass: 'person', reason: 'a class naming a person' }), /^metric computation rejected \(query_class\)/, 422);
  });
  it('positive: another analyst and the owner review the 12 searches (10 relevant); a second review of one refused (409); MET-014 = 10/12, role-level — no searcher, no reviewer named', async () => {
    for (let i = 0; i < 12; i++) {
      const who = i % 2 === 0 ? analyst2 : owner;
      const r = (await review(who, { searchId: searches[i], verdict: i < 10 ? 'relevant' : 'not_relevant', queryClass: i < 4 ? 'entity' : 'warning', reason: 'the hits answered the corridor question (SYNTHETIC)' })).review;
      expect(r).not.toHaveProperty('reviewed_by');
    }
    await refused(review(owner, { searchId: searches[0], verdict: 'relevant', queryClass: 'entity', reason: 'reviewing it twice' }), /^metric computation rejected \(duplicate\)/, 409);
    const r = await compute({ metricKey: 'MET-014', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 12 });
    expect(Number(r['numerator'])).toBe(10);
    expect((r['quality'] as Row)['unreviewed_searches']).toBe(1);
    const rd = await readResult(String(r['result_id']));
    expect(JSON.stringify(records(rd))).not.toContain(searcher.principalId);
    expect(JSON.stringify(records(rd))).not.toContain(analyst2.principalId);
    const list = (await b.searchReviews(rq(owner, 'analytics.read', 'ASR'), T(), D(), { payload: {} }) as { searches: Row }).searches;
    expect(JSON.stringify(list)).not.toContain(searcher.principalId);
    expect(JSON.stringify(list)).not.toMatch(/principal_id|reviewed_by/);
  });
  it('indeterminate, explained: the entity query class (4 reviewed) is below the floor 10; scope ignored, said', async () => {
    const r = await compute({ metricKey: 'MET-014', period: '2026-05', cohort: { query_class: 'entity' } });
    expect(r).toMatchObject({ state: 'indeterminate', n: 4, value: null });
    const sc = await compute({ metricKey: 'MET-014', period: '2026-05', scopeKey: SCOPE });
    expect(sc).toMatchObject({ n: 12 }); expect((sc['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
  });
});

describe('MCB10 · MET-017 graph provenance validity (2026-05)', () => {
  beforeAll(async () => {
    const ev = await evidence(at(7, 1)); const dead = await evidence(at(7, 1), at(7, 2));
    // the claims sit in July (their own record time) so they never join April's canonical populations
    const rel = await obj('REL', { at: at(5, 1), refs: [`EVD:${ev.id}@1`], truth: 'extracted' });
    const gone = await obj('REL', { at: at(5, 1), refs: [`EVD:${ev.id}@1`], truth: 'extracted' }); await obj('REL', { id: gone, version: 2, at: at(5, 2), truth: 'withdrawn', lifecycle: 'withdrawn', correctionOf: `${gone}@1` });
    const edge = async (s: string, o: string, claim: string, ev2: { id: string; digest: string }, assertedAt: string, retracted: string | null = null) => {
      await ex(sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, asserted_at, retracted_at, state, claim_object_id, claim_version,
          evidence_object_id, evidence_digest, mode, confidence, asserted_by, retracted_by, retraction_reason, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${s}::uuid, ${s === e1 ? 'transits' : 'carries'}, ${o}::uuid, ${assertedAt}::timestamptz, ${assertedAt}::timestamptz, ${retracted}::timestamptz,
          ${retracted === null ? 'asserted' : 'retracted'}, ${claim}::uuid, 1, ${ev2.id}::uuid, ${ev2.digest}, 'replay', 0.8, ${owner.principalId}::uuid, ${retracted === null ? null : owner.principalId}::uuid,
          ${retracted === null ? null : 'a SYNTHETIC retraction of the harness'}, ${uuidv7()}::uuid)`);
    };
    for (let i = 0; i < 20; i++) await edge(i < 12 ? e1 : e2, e3, rel, ev, at(5, 3, i));
    await edge(e2, e3, rel, dead, at(5, 4));                // evidence bytes tombstoned
    await edge(e2, e3, gone, ev, at(5, 4, 1));              // the claim is withdrawn
    await edge(e1, e3, rel, ev, at(5, 4, 2), at(5, 6));     // retracted: not canonical
  });
  it('positive: 22 canonical edges — 20 resolve to their claim version and evidence by digest; a withdrawn claim and tombstoned evidence named; the retracted edge excluded', async () => {
    const r = await compute({ metricKey: 'MET-017', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 22 });
    expect(Number(r['numerator'])).toBe(20);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ numerator: 20, denominator: 2, excluded: 1 });
    const why = records(rd).filter((x) => x['role'] === 'denominator').map((x) => String(x['reason'])).join(' | ');
    expect(why).toMatch(/claim: the cited record is withdrawn/); expect(why).toMatch(/evidence: the evidence's bytes were tombstoned/);
  });
  it('the scope applied (edges touching e1: 12 — below the floor 20, explained) and the relationship class cohort', async () => {
    const sc = await compute({ metricKey: 'MET-017', period: '2026-05', scopeKey: SCOPE });
    expect(sc).toMatchObject({ state: 'indeterminate', n: 12 }); expect(reasons(sc)).toMatch(/below the floor 20/);
    const cls = await compute({ metricKey: 'MET-017', period: '2026-05', cohort: { relationship_class: 'carries' } });
    expect(cls).toMatchObject({ n: 10 });
  });
});

describe('MCB11 · MET-018 memory retrieval validity (2026-05)', () => {
  beforeAll(async () => {
    const item = async (o: { cls: string; objective: string | null; purposes: string[]; retainUntil?: string; versions: string[]; withdrawnAt?: string }) => {
      const id = uuidv7();
      for (let v = 0; v < o.versions.length; v++) await obj('MEM', { id, version: v + 1, at: o.versions[v]!, truth: 'asserted', human: true });
      await ex(sql`insert into memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, owner_principal_id, classification, audience_purposes,
          valid_from, retention_profile, retain_until, related_objective_id, state, recorded_by, correlation_id)
        values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${o.versions.length}, ${o.cls}, 'a SYNTHETIC lesson', 'a SYNTHETIC memory item of the B92 harness', 'human', ${owner.principalId}::uuid, 'internal',
          ${o.purposes}::text[], ${at(4, 1)}::timestamptz, 'default', ${o.retainUntil ?? null}::timestamptz, ${o.objective}::uuid, ${o.withdrawnAt === undefined ? 'active' : 'withdrawn'}, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
      if (o.withdrawnAt !== undefined) {
        await ex(sql`insert into memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, occurred_at, correlation_id)
          values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'memory.withdrawn', ${o.versions.length}, ${owner.principalId}::uuid, '{}'::jsonb, ${o.withdrawnAt}::timestamptz, ${uuidv7()}::uuid)`);
      }
      return id;
    };
    const access = async (itemId: string, version: number, purpose: string, accessedAt: string, readAsOf: string | null = null, policy = true) => {
      await ex(sql`insert into memory.item_access (access_id, scope, tenant_id, domain_id, item_id, object_version, reader_principal_id, purpose_id, policy_decision_id, read_as_of, accessed_at, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${itemId}::uuid, ${version}, ${analyst.principalId}::uuid, ${purpose}, ${policy ? uuidv7() : null}::uuid, ${readAsOf}::timestamptz, ${accessedAt}::timestamptz, ${uuidv7()}::uuid)`);
    };
    const good = await item({ cls: 'institutional', objective: objX, purposes: ['memory', 'decision'], versions: [at(4, 2), at(5, 10)] });
    for (let i = 0; i < 18; i++) await access(good, i < 9 ? 1 : 2, 'decision', at(5, 12, i), i < 9 ? at(5, 1) : null);   // v1 as of May 1 (current then), v2 now
    await access(good, 1, 'memory', at(5, 13));                                                    // v1 served when v2 was current
    const strategic = await item({ cls: 'strategic', objective: objY, purposes: ['decision'], versions: [at(4, 3)] });
    await access(strategic, 1, 'decision', at(5, 13, 1)); await access(strategic, 1, 'decision', at(5, 13, 2));
    await access(strategic, 1, 'graph', at(5, 13, 3));                                             // a purpose outside the audience
    await access(strategic, 1, 'decision', at(5, 13, 4), null, false);                             // no authorising policy decision
    const expired = await item({ cls: 'institutional', objective: objX, purposes: [], retainUntil: at(5, 1), versions: [at(4, 4)] });
    await access(expired, 1, 'decision', at(5, 14));                                               // past retention
    const withdrawn = await item({ cls: 'institutional', objective: objX, purposes: [], versions: [at(4, 5)], withdrawnAt: at(5, 2) });
    await access(withdrawn, 1, 'decision', at(5, 14, 1)); await access(withdrawn, 1, 'decision', at(5, 14, 2), at(5, 1));   // after the withdrawal; as of before it (valid replay)
  });
  it('positive: 26 accesses re-judged — 21 valid (incl. a replay as of before a withdrawal), 5 named: a superseded version served, a purpose outside the audience, no policy decision, past retention, withdrawn', async () => {
    const r = await compute({ metricKey: 'MET-018', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 26 });
    expect(Number(r['numerator'])).toBe(21);
    const rd = await readResult(String(r['result_id']));
    const why = records(rd).filter((x) => x['role'] === 'denominator').map((x) => String(x['reason'])).join(' | ');
    expect(why).toMatch(/version 1 was served; version 2 was current/); expect(why).toMatch(/outside the item's audience/); expect(why).toMatch(/no authorising policy decision/);
    expect(why).toMatch(/served past its retention/); expect(why).toMatch(/was withdrawn at/);
  });
  it('the scope applied (items of objective X: 22 accesses) and the memory class cohort (strategic: 4 < floor, explained)', async () => {
    const sc = await compute({ metricKey: 'MET-018', period: '2026-05', scopeKey: SCOPE });
    expect(sc).toMatchObject({ n: 22, state: 'determinate' });
    const st = await compute({ metricKey: 'MET-018', period: '2026-05', cohort: { memory_class: 'strategic' } });
    expect(st).toMatchObject({ n: 4, state: 'indeterminate', value: null });
  });
});

describe('MCB12 · MET-031 agent task success and MET-033 agent trace closure (2026-05)', () => {
  beforeAll(async () => {
    const agentId = uuidv7();
    await ex(sql`insert into executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, created_by, correlation_id)
      values (${agentId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, 'attention', '1.0.0', ${hex()}, ${owner.principalId}::uuid, ${owner.principalId}::uuid, '{}'::jsonb, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`);
    const run = async (task: string, outcome: string, finishedAt: string, o: { refusals?: number; outputs?: Row; triggerRef?: string | null } = {}) => {
      await ex(sql`insert into executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_ref, budget, outcome, refusals, outputs,
          started_at, finished_at, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${agentId}::uuid, ${uuidv7()}::uuid, 'attention', '1.0.0', ${hex()}, ${task}, 'scheduler', ${o.triggerRef === undefined ? 'tick' : o.triggerRef},
          '{}'::jsonb, ${outcome}, ${JSON.stringify(Array.from({ length: o.refusals ?? 0 }, () => ({ action: 'x', reason: 'SYNTHETIC refusal' })))}::jsonb, ${JSON.stringify(o.outputs ?? { tick_id: uuidv7() })}::jsonb,
          ${plus(finishedAt, -30)}::timestamptz, ${finishedAt}::timestamptz, ${uuidv7()}::uuid)`);
    };
    for (let i = 0; i < 6; i++) await run('attention_tick', 'finished', at(5, 22, i));
    await run('attention_tick', 'faulted', at(5, 22, 7)); await run('attention_tick', 'faulted', at(5, 22, 8));
    await run('attention_tick', 'finished', at(5, 22, 9), { refusals: 2 });
    await run('briefing', 'finished', at(5, 22, 10), { triggerRef: null, outputs: {} });   // trace: no context, no action recorded
  });
  it('MET-031 indeterminate, explained: acceptance is not recorded uniformly — 7 clean runs cannot be told; the failures (2 faults, 1 refused act) shown', async () => {
    const r = await compute({ metricKey: 'MET-031', period: '2026-05' });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(r)).toMatch(/acceptance cannot be told for 7 clean run\(s\) \(tasks: attention_tick, briefing\)/);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ denominator: 3, excluded: 7 });
  });
  it('MET-031 positive: a definition declaring attention_tick self-accepting (approved, labelled per record), cohort attention_tick — 6 of 9', async () => {
    await plantDef(contract('MET-031'), { key: 'MET-031.T', params: { self_accepting_tasks: ['attention_tick'] } });
    await plantDef({ ...contract('MET-031'), floorN: 5 }, { key: 'MET-031.T2', params: { self_accepting_tasks: ['attention_tick'] } });
    const r = await compute({ metricKey: 'MET-031.T', period: '2026-05', cohort: { task: 'attention_tick' } });
    expect(r).toMatchObject({ state: 'determinate', n: 9 });
    expect(Number(r['numerator'])).toBe(6);
    const rd = await readResult(String(r['result_id']));
    expect((records(rd).find((x) => x['role'] === 'numerator')!['detail'] as Row)['acceptance']).toMatch(/declared by the definition/);
    const all = await compute({ metricKey: 'MET-031.T2', period: '2026-05', scopeKey: SCOPE });   // the briefing run still cannot be told: indeterminate; scope ignored, said
    expect(all).toMatchObject({ state: 'indeterminate', n: 9 }); expect((all['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
  });
  it('MET-033 indeterminate, explained (never 0): model, tool and checkpoint are not recorded; each run shows its recorded fields (the briefing run misses context and action); scope ignored, said', async () => {
    const r = await compute({ metricKey: 'MET-033', period: '2026-05', scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 10 });
    expect(reasons(r)).toMatch(/records no model, tool-call or checkpoint trace/);
    expect((r['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ numerator: 9, denominator: 1 });
    expect(records(rd).find((x) => x['role'] === 'denominator')!['reason']).toBe('missing context, action');
  });
});

describe('MCB13 · MET-036 product availability (2026-05)', () => {
  beforeAll(async () => {
    const partition = `b92mcb-synthetic-${RUN}`; let seq = 0;
    const req = async (action: string, outcome: string, code: string, i: number) => {
      seq += 1;
      const occurred = at(5, 24, Math.floor(i / 60), i % 60);
      const jcs = JSON.stringify({ action, actor: 'principal:synthetic-b92-mcb', correlation_id: uuidv7(), domain_id: D(), event_type: 'api.request', occurred_at: occurred, outcome,
        result_code: code, scope: 'DOMAIN', synthetic: true, tenant_id: T() });
      await ex(sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash, hash_alg_version, created_at)
        values (${partition}, ${seq}, ${jcs}, ${hex()}, ${hex()}, 'eye-audit-v1', ${occurred}::timestamptz)`);
    };
    let i = 0;
    for (let k = 0; k < 48; k++) await req(k < 40 ? 'decision.package.read' : 'prediction.forecast.read', 'success', 'OK', i++);
    await req('decision.package.read', 'success', 'EYE-DEG-001', i++); await req('decision.package.read', 'success', 'EYE-DEG-001', i++);
    for (let k = 0; k < 3; k++) await req('decision.package.commit', 'failure', 'EYE-INT-001', i++);
    await req('decision.package.commit', 'failure', 'EYE-STA-002', i++); await req('decision.package.commit', 'failure', 'EYE-REQ-001', i++);
    for (let k = 0; k < 4; k++) await req('decision.package.commit', 'denied', 'EYE-AUT-001', i++);
  });
  it('positive: 53 eligible requests — 50 served (2 degraded, flagged), 3 failed by the product; 2 governed refusals excluded; 4 denied not eligible; no actor in any record', async () => {
    const r = await compute({ metricKey: 'MET-036', period: '2026-05' });
    expect(r).toMatchObject({ state: 'determinate', n: 53 });
    expect(Number(r['numerator'])).toBe(50);
    expect((r['quality'] as Row)['denied_not_eligible']).toBe(4);
    const rd = await readResult(String(r['result_id']));
    expect(roles(rd)).toEqual({ numerator: 50, denominator: 3, excluded: 2 });
    expect(records(rd).filter((x) => (x['detail'] as Row)['degraded'] === true)).toHaveLength(2);
    expect(JSON.stringify(records(rd))).not.toMatch(/principal/);
  });
  it('indeterminate, explained: the prediction capability (8 requests) is below the floor 50; scope ignored, said', async () => {
    const r = await compute({ metricKey: 'MET-036', period: '2026-05', cohort: { capability: 'prediction' }, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'indeterminate', n: 8, value: null });
    expect(reasons(r)).toMatch(/below the floor 50/); expect((r['quality'] as Row)['scope_rule']).toMatch(/^ignored/);
  });
});
