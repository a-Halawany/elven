/**
 * CP-6 B92 §MD (migration 0113_b92_x_md) — METRIC DEFINITIONS, PURPOSES, SCOPES, USES AND THE CATALOG, through the real pipeline, ports and
 * controllers (rows PR-70-002, PR-70-003, CAP-DL-11, V01-T-040; the residual DP-44-005; ES-40-008's governance). Every purpose, scope,
 * definition, fixture item, briefing, publication and metric here is SYNTHETIC — the harness proves the SOFTWARE; a synthetic demonstration never
 * closes a clause that needs the real integration, and the signed acceptance (PR-70-006 / AT-70) is R2's.
 *
 *   MD1 · purposes — proposed by a named human analyst, approved at the digest by a named privacy officer (never the proposer, never an agent);
 *         a performance / employee-scoring purpose refused 403 (a disclaimer passes); a stale digest 409; version 2 supersedes; retire, re-propose.
 *   MD2 · scopes — unknown entity / objective / series refused 404, an empty scope 422; approved by a product analytics owner ≠ proposer;
 *         version 2 supersedes; a retired scope is no longer computable (the prelude's port answers unknown_scope).
 *   MD3 · definitions — the whole contract validated; propose (a MetricContract) → approve at the digest → compute through the PRELUDE's port
 *         with a FIXTURE computation; stale digest 409; the proposer approving 403; an agent 403 (at the port proposing, at the PEP deciding);
 *         a person dimension 403; empty serves 422; a dimension outside the computation 422; an unapproved purpose 422; an unsupported definition
 *         approved and computed `unsupported`; version 2 supersedes (the diff read); the routed approval item raised and closed.
 *   MD4 · uses — a result cited in a decision package; a preview, a replay and a superseded definition's result refused 409; ES-40-008: an
 *         indeterminate result in a briefing / publication refused 409 unless qualified (the note naming the state), and the use records the
 *         state; an unknown citing object 404; retire (MD3) LISTS the uses and refuses nothing; recovery: version 3 computes again.
 *   MD5 · DP-44-005 — a decision package and a briefing citing a B90 metric SERVING; the withdrawal lists the uses beside the servings; an
 *         uncertified serving cited in a briefing only with a note saying so.
 *   MD6 · the reads — the catalog (CAP-DL-11: latest results per period, uses, the B90 catalog entry a steward made), the contract card, the
 *         lists, RLS (another domain sees nothing).
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
import type { MetricContract } from '../../src/analytics/contract.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsDefinitionsController } from '../../src/analytics/definitions/definitions.controller.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { MetricsController } from '../../src/products/metrics/metrics.controller.js';
import type { CatalogController } from '../../src/products/catalog/catalog.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

// THE SIGNING KEY (B90's certification signs): this process's own pair, by reference, set before the harness boots; this file's own vault roots.
const PAIR = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = PAIR.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b92md-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: AnalyticsDefinitionsController; let cc: AnalyticsComputeController;
let products: ProductsController; let metrics: MetricsController; let cat: CatalogController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v ?? {}) as Row;

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let owner2: AuthenticatedPrincipal;
let privacy: AuthenticatedPrincipal; let analystPrivacy: AuthenticatedPrincipal; let analystOwner: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentAnalyst: AuthenticatedPrincipal; let agentOwner: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let metricOwner: AuthenticatedPrincipal;
let otherDomain = '';

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(h.su)).rows[0]!.t.toISOString();
const dbAhead = async (ahead: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() + ${ahead}::interval t`.execute(h.su)).rows[0]!.t.toISOString();

/* ───────────── the routes (in process) ───────────── */
const rq = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null, domainId?: string) => {
  const r = h.req(as, action, type, id, 'intelligence') as { eyeEnvelope: Row };
  if (domainId !== undefined) r.eyeEnvelope['domain_id'] = domainId;
  return r as never;
};
const proposePurpose = (as: AuthenticatedPrincipal, payload: Row) => c.proposePurpose(rq(as, 'analytics.purpose.propose', 'APU'), T(), D(), { payload }) as Promise<{ purpose: Row }>;
const decidePurpose = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decidePurpose(rq(as, 'analytics.purpose.decide', 'APU', id), T(), D(), id, { payload }) as Promise<{ purpose: Row }>;
const retirePurpose = (as: AuthenticatedPrincipal, id: string, reason: string) => c.retirePurpose(rq(as, 'analytics.purpose.retire', 'APU', id), T(), D(), id, { payload: { reason } }) as Promise<{ purpose: Row }>;
const purposes = (as: AuthenticatedPrincipal) => c.purposes(rq(as, 'analytics.read', 'APU'), T(), D()) as Promise<{ purposes: Row[] }>;
const proposeScope = (as: AuthenticatedPrincipal, payload: Row) => c.proposeScope(rq(as, 'analytics.scope.propose', 'ASC'), T(), D(), { payload }) as Promise<{ scope: Row }>;
const decideScope = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decideScope(rq(as, 'analytics.scope.decide', 'ASC', id), T(), D(), id, { payload }) as Promise<{ scope: Row }>;
const retireScope = (as: AuthenticatedPrincipal, id: string, reason: string) => c.retireScope(rq(as, 'analytics.scope.retire', 'ASC', id), T(), D(), id, { payload: { reason } }) as Promise<{ scope: Row }>;
const scopes = (as: AuthenticatedPrincipal) => c.scopes(rq(as, 'analytics.read', 'ASC'), T(), D()) as Promise<{ scopes: Row[] }>;
const propose = (as: AuthenticatedPrincipal, contract: unknown, ownerPrincipalId: string | null = owner.principalId) =>
  c.propose(rq(as, 'analytics.definition.propose', 'AMD'), T(), D(), { payload: { contract, ownerPrincipalId } }) as Promise<{ definition: Row }>;
const decide = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decide(rq(as, 'analytics.definition.decide', 'AMD', id), T(), D(), id, { payload }) as Promise<{ definition: Row }>;
const retire = (as: AuthenticatedPrincipal, id: string, reason: string) => c.retire(rq(as, 'analytics.definition.retire', 'AMD', id), T(), D(), id, { payload: { reason } }) as Promise<{ definition: Row }>;
const card = (as: AuthenticatedPrincipal, key: string, domainId = D()) => c.definition(rq(as, 'analytics.read', 'AMD', null, domainId), T(), domainId, key) as Promise<Row>;
const definitions = (as: AuthenticatedPrincipal) => c.definitions(rq(as, 'analytics.read', 'AMD'), T(), D()) as Promise<{ definitions: Row[]; computations: Row[]; owner_roles: Row }>;
const diff = (as: AuthenticatedPrincipal, from: string, to: string) => c.diff(rq(as, 'analytics.read', 'AMD'), T(), D(), { payload: { from, to } }) as Promise<{ diff: Row }>;
const recordUse = (as: AuthenticatedPrincipal, payload: Row) => c.recordUse(rq(as, 'analytics.use.record', 'AMU'), T(), D(), { payload }) as Promise<{ use: Row }>;
const uses = (as: AuthenticatedPrincipal, payload: Row = {}) => c.uses(rq(as, 'analytics.read', 'AMU'), T(), D(), { payload }) as Promise<{ uses: Row[] }>;
const recordServingUse = (as: AuthenticatedPrincipal, payload: Row) => c.recordServingUse(rq(as, 'products.metric.use', 'MET', String(payload['servingId'] ?? '')), T(), D(), { payload }) as Promise<{ use: Row }>;
const servingUses = (as: AuthenticatedPrincipal, payload: Row = {}) => c.servingUses(rq(as, 'analytics.read', 'MET'), T(), D(), { payload }) as Promise<{ uses: Row[] }>;
const catalog = (as: AuthenticatedPrincipal) => c.catalog(rq(as, 'analytics.read', 'AMD'), T(), D()) as Promise<{ catalog: Row[]; service: Row; catalog_note: string }>;
const compute = (as: AuthenticatedPrincipal, payload: Row) => cc.compute(rq(as, 'analytics.metric.compute', 'AMR'), T(), D(), { payload }) as Promise<{ result: Row }>;
const replay = (as: AuthenticatedPrincipal, id: string) => cc.replay(rq(as, 'analytics.metric.replay', 'AMR', id), T(), D(), id) as Promise<{ replay: Row }>;

/** An AGENT principal (kind agent) holding the roles, with a session — its claim kind and assurance as given (the B33 idiom). */
async function machine(roles: string[], label: string, claimKind: 'human' | 'agent', assurance: 'password' | 'agent_grant'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92md-${label}-${id.slice(-8)}`}, ${`b92md-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claimKind, assurance, homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}

const Q = '2026-Q3';
const inQ = (d: number) => `2026-08-${String(d).padStart(2, '0')}T10:00:00Z`;
const COMPUTATION = `md_fixture_rate_${RUN}`;
/** A contract (the TS MetricContract §MCA / §MCB export) over the fixture computation — every value SYNTHETIC. */
const FX = (key: string, over: Partial<MetricContract> = {}): MetricContract => ({
  metricKey: key, title: `Fixture ok share ${key} (SYNTHETIC)`, meaning: 'the share of fixture items recorded as ok (a SYNTHETIC harness reading)', kind: 'rate', unit: 'share', direction: 'higher',
  population: { subject: 'fixture item', inclusion: 'recorded inside the window', scope_rule: 'the fixture ignores the scope (stated)' },
  numerator: 'items that are ok', denominator: 'every item recorded in the window', exclusions: [{ rule: 'none', reason: 'the fixture excludes nothing' }],
  window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['severity'], privacyClass: 'aggregate', kMin: 5, floorN: 3, threshold: { target: 0.6 },
  purposeKey: 'product-quality', serves: { objective_ids: [w.objectiveId], decision_classes: ['corridor routing'] }, cadence: 'quarterly', ownerRole: 'Chief Product Officer',
  action: 'a review by the product analytics owner — never an automatic or punitive decision', retirement: 'retired when the fixture computation is withdrawn',
  quality: {}, costAllocation: { pool: 'analytics' }, computationKey: COMPUTATION, params: {}, unsupportedReason: null, sourceRefs: ['FIXTURE-B92-MD'], ...over,
});
/** Propose + approve (the act's path). */
async function approved(key: string, over: Partial<MetricContract> = {}, by = analyst, approver = owner): Promise<Row> {
  const p = (await propose(by, FX(key, over))).definition;
  return (await decide(approver, String(p['definition_id']), { decision: 'approve', digest: p['digest'], reason: 'the contract reads App M faithfully (SYNTHETIC harness)' })).definition;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = h.app.get(AnalyticsDefinitionsController); cc = h.app.get(AnalyticsComputeController);
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { MetricsController: MC } = await import('../../src/products/metrics/metrics.controller.js');
  const { CatalogController: KC } = await import('../../src/products/catalog/catalog.controller.js');
  products = h.app.get(PC); metrics = h.app.get(MC); cat = h.app.get(KC);
  analyst = await h.humanWithSession(['product_analyst'], 'b92md-analyst');
  analyst2 = await h.humanWithSession(['product_analyst'], 'b92md-analyst-2');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92md-owner');
  owner2 = await h.humanWithSession(['product_analytics_owner'], 'b92md-owner-2');
  privacy = await h.humanWithSession(['privacy_officer'], 'b92md-privacy');
  analystPrivacy = await h.humanWithSession(['product_analyst', 'privacy_officer'], 'b92md-analyst-privacy');
  analystOwner = await h.humanWithSession(['product_analyst', 'product_analytics_owner'], 'b92md-analyst-owner');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92md-outsider');
  steward = await h.humanWithSession(['data_steward'], 'b92md-steward');
  metricOwner = await h.humanWithSession(['strategy_owner', 'data_steward'], 'b92md-metric-owner');
  agentAnalyst = await machine(['product_analyst'], 'agent-analyst', 'agent', 'agent_grant');
  agentOwner = await machine(['product_analytics_owner'], 'agent-owner', 'agent', 'agent_grant');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${otherDomain}::uuid, ${T()}::uuid, ${'b92md-other-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['product_analyst'], 'b92md-foreign', 'DOMAIN', { domainId: otherDomain });
  // THE FIXTURE COMPUTATION (the prelude harness's idiom; registered by the superuser as a part's migration would): 8 items in 2026-Q3, 6 ok
  await sql.raw(`create table if not exists public.b92md_items (id uuid primary key, tenant_id uuid, domain_id uuid, recorded_at timestamptz, ok boolean, severity text, actor uuid)`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_${COMPUTATION}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B92 §MD fixture items');
      return jsonb_build_object('kind', 'rate',
        'distinct_actors', (select count(distinct actor) from public.b92md_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of and (p_cohort ->> 'severity' is null or i.severity = p_cohort ->> 'severity')),
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', case when i.ok then 'numerator' else 'denominator' end, 'detail', jsonb_build_object('severity', i.severity)) order by i.id)
                  from public.b92md_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of
                   and (p_cohort ->> 'severity' is null or i.severity = p_cohort ->> 'severity')), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock'));
    end $f$`).execute(h.su);
  await sql`select analytics.register_computation(${COMPUTATION}, ${`analytics.mc_${COMPUTATION}`}, 'rate', array['severity'], array['public.b92md_items'], 'the fixture ignores the scope (domain-wide, stated)', 'the B92 §MD harness fixture rate (SYNTHETIC)', 'phase6-definitions-b92')`.execute(h.su);
  const actors = Array.from({ length: 8 }, () => uuidv7());
  for (let i = 0; i < 8; i++) {
    await sql`insert into public.b92md_items values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${inQ(i + 1)}::timestamptz, ${i < 6}, ${i < 5 ? 'high' : 'low'}, ${actors[i]}::uuid)`.execute(h.su);
  }
}, 900_000);

afterAll(async () => {
  await sql.raw(`drop table if exists public.b92md_items`).execute(h.su).catch(() => undefined);
  await h?.close();
}, 120_000);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('MD1 · the purpose register (a named privacy officer approves; no performance purpose)', () => {
  let pq = '';
  it('POSITIVE: an analyst proposes product-quality (product_improvement, 365 days) — digested; a privacy officer approves it at that digest with a reason; a disclaimer of employee performance passes', async () => {
    const p = (await proposePurpose(analyst, { key: 'product-quality', title: 'Product quality (SYNTHETIC)', kind: 'product_improvement', retentionDays: 365,
      description: 'improving the product\'s decision support and its operating reviews — never for employee performance, ranking or surveillance' })).purpose;
    pq = String(p['purpose_id']);
    expect(p).toMatchObject({ purpose_key: 'product-quality', version: 1, state: 'proposed', purpose_kind: 'product_improvement', retention_days: 365 });
    expect(String(p['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const a = (await decidePurpose(privacy, pq, { decision: 'approve', digest: p['digest'], reason: 'a product-improvement purpose; minimal; no person-level use (SYNTHETIC)' })).purpose;
    expect(a).toMatchObject({ state: 'approved', decided_by: privacy.principalId });
    for (const [key, kind] of [['mission-outcomes', 'mission_outcome'], ['governance-assurance', 'governance']] as const) {
      const x = (await proposePurpose(analyst, { key, title: `${key} (SYNTHETIC)`, kind, retentionDays: 365, description: `the ${key} purpose of the harness register (SYNTHETIC)` })).purpose;
      await decidePurpose(privacy, String(x['purpose_id']), { decision: 'approve', digest: x['digest'], reason: 'approved for the harness register (SYNTHETIC)' });
    }
    const ev = await rows(sql`select event from analytics.definition_events where subject_id = ${pq}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['purpose.proposed', 'purpose.approved']);
  });
  it('REFUSAL: a performance purpose 403 (person) — by description and by kind; the privacy officer deciding their own proposal 403; a stale digest 409; an agent at the gate 403; an owner (not a privacy officer) 403; a bad kind 422', async () => {
    await refused(proposePurpose(analyst, { key: 'warehouse-review', title: 'Warehouse throughput', kind: 'product_improvement', retentionDays: 90,
      description: 'the annual employee performance review of the warehouse team, ranking staff by acknowledgement speed' }), /^analytics purpose rejected \(person\): the purpose states "(employee performance|ranking staff)"/, 403);
    await refused(proposePurpose(analyst, { key: 'productivity', title: 'Productivity', kind: 'employee_scoring', retentionDays: 90, description: 'scoring the analysts of the domain week by week' }),
      /^analytics purpose rejected \(person\): employee_scoring is a purpose of evaluating people/, 403);
    await refused(proposePurpose(analyst, { key: 'misc-purpose', title: 'Misc', kind: 'marketing', retentionDays: 90, description: 'a purpose of a kind outside the register' }), /^analytics purpose rejected \(kind\)/, 422);
    const own = (await proposePurpose(analystPrivacy, { key: 'service-reliability', title: 'Service reliability (SYNTHETIC)', kind: 'reliability', retentionDays: 180, description: 'the reliability of the product\'s services and deliveries (SYNTHETIC)' })).purpose;
    await refused(decidePurpose(analystPrivacy, String(own['purpose_id']), { decision: 'approve', digest: own['digest'], reason: 'my own proposal, approved by me' }), /^analytics purpose rejected \(separation_of_duties\)/, 403);
    await refused(decidePurpose(privacy, String(own['purpose_id']), { decision: 'approve', digest: 'f'.repeat(64), reason: 'approved at a digest I never read' }), /^analytics purpose rejected \(stale\)/, 409);
    await refused(decidePurpose(owner, String(own['purpose_id']), { decision: 'approve', digest: own['digest'], reason: 'an owner is not the privacy officer' }), /./, 403);
    const agentPrivacy = await machine(['privacy_officer'], 'agent-privacy', 'agent', 'agent_grant');
    await refused(decidePurpose(agentPrivacy, String(own['purpose_id']), { decision: 'approve', digest: own['digest'], reason: 'an agent approving a purpose' }), /human gate: analytics\.purpose\.decide requires a named human principal/, 403);
    await refused(decidePurpose(privacy, String(own['purpose_id']), { decision: 'approve', digest: own['digest'], reason: 'short' }), /^analytics purpose rejected \(reason\)/, 422);
    // recovery: the other privacy officer approves it at its digest
    expect((await decidePurpose(privacy, String(own['purpose_id']), { decision: 'approve', digest: own['digest'], reason: 'reliability is a product purpose; no person-level use' })).purpose).toMatchObject({ state: 'approved' });
  });
  it('VERSION 2 SUPERSEDES; RETIRE and RE-PROPOSE: experience-telemetry v1 approved → retired (the definitions naming it listed) → v2 proposed and approved; product-quality v2 supersedes v1', async () => {
    const e1 = (await proposePurpose(analyst, { key: 'experience-telemetry', title: 'Experience telemetry (SYNTHETIC)', kind: 'product_improvement', retentionDays: 180, description: 'the UX telemetry collected under consent to improve journeys (SYNTHETIC)' })).purpose;
    await decidePurpose(privacy, String(e1['purpose_id']), { decision: 'approve', digest: e1['digest'], reason: 'consent-bound, minimised telemetry (SYNTHETIC)' });
    await refused(retirePurpose(privacy, String(e1['purpose_id']), 'no'), /^analytics purpose rejected \(reason\)/, 422);
    await refused(retirePurpose(analyst, String(e1['purpose_id']), 'an analyst retiring a purpose'), /./, 403);
    const r = (await retirePurpose(privacy, String(e1['purpose_id']), 'the telemetry purpose is re-scoped (SYNTHETIC)')).purpose;
    expect(r).toMatchObject({ state: 'retired', definitions_naming_it: [] });
    await refused(retirePurpose(privacy, String(e1['purpose_id']), 'retired twice is refused'), /^analytics purpose rejected \(state\)/, 409);
    const e2 = (await proposePurpose(analyst, { key: 'experience-telemetry', title: 'Experience telemetry v2 (SYNTHETIC)', kind: 'product_improvement', retentionDays: 120, description: 'the UX telemetry collected under consent, shorter retention (SYNTHETIC)' })).purpose;
    expect(e2).toMatchObject({ version: 2 });
    expect((await decidePurpose(privacy, String(e2['purpose_id']), { decision: 'approve', digest: e2['digest'], reason: 'shorter retention, same minimisation' })).purpose).toMatchObject({ state: 'approved' });
    const v2 = (await proposePurpose(analyst, { key: 'product-quality', title: 'Product quality (SYNTHETIC)', kind: 'product_improvement', retentionDays: 400,
      description: 'improving the product\'s decision support and its operating reviews — never for employee performance, ranking or surveillance' })).purpose;
    await refused(proposePurpose(analyst, { key: 'product-quality', title: 'Product quality again', kind: 'product_improvement', retentionDays: 400, description: 'a second open proposal of the same key' }), /^analytics purpose rejected \(state\): version 2 of product-quality is proposed/, 409);
    await decidePurpose(privacy, String(v2['purpose_id']), { decision: 'approve', digest: v2['digest'], reason: 'retention extended for quarterly reviews' });
    const list = (await purposes(owner)).purposes.filter((x) => x['purpose_key'] === 'product-quality');
    expect(list.map((x) => [x['version'], x['state']])).toEqual([[2, 'approved'], [1, 'superseded']]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let corridor = ''; let corridorV2 = '';
describe('MD2 · the scope register ("the corridor")', () => {
  it('REFUSAL: an unknown entity / objective / series 404; an empty scope 422; an outsider 403', async () => {
    const base = { key: 'red-sea-corridor', title: 'The Red Sea corridor (SYNTHETIC)', description: 'the Bab el-Mandeb corridor: its entity, its objective and its transit series' };
    await refused(proposeScope(analyst, { ...base, entityIds: [uuidv7()] }), /^analytics scope rejected \(unknown_entity\)/, 404);
    await refused(proposeScope(analyst, { ...base, objectiveIds: [w.decisionId] }), /^analytics scope rejected \(unknown_objective\)/, 404);   // a DEC is not an objective
    await refused(proposeScope(analyst, { ...base, seriesKeys: ['portwatch:nowhere:value'] }), /^analytics scope rejected \(unknown_series\)/, 404);
    await refused(proposeScope(analyst, { ...base }), /^analytics scope rejected \(empty\)/, 422);
    await refused(proposeScope(outsider, { ...base, entityIds: [w.entityId] }), /./, 403);
  });
  it('POSITIVE: the corridor proposed (entity, objective, series, geography) and approved by an owner at its digest; the proposer deciding refused 403; a stale digest 409', async () => {
    const s = (await proposeScope(analyst, { key: 'red-sea-corridor', title: 'The Red Sea corridor (SYNTHETIC)', description: 'the Bab el-Mandeb corridor: its entity, its objective and its transit series',
      entityIds: [w.entityId], objectiveIds: [w.objectiveId], seriesKeys: [w.seriesKey], geographies: ['Bab el-Mandeb'] })).scope;
    corridor = String(s['scope_id']);
    expect(s).toMatchObject({ scope_key: 'red-sea-corridor', version: 1, state: 'proposed', entity_ids: [w.entityId], objective_ids: [w.objectiveId], series_keys: [w.seriesKey] });
    await refused(decideScope(owner, corridor, { decision: 'approve', digest: '0'.repeat(64), reason: 'a digest never read' }), /^analytics scope rejected \(stale\)/, 409);
    await refused(decideScope(analyst, corridor, { decision: 'approve', digest: s['digest'], reason: 'an analyst approving' }), /./, 403);
    const own = (await proposeScope(analystOwner, { key: 'own-scope', title: 'A scope of my own', description: 'proposed and decided by the same person', geographies: ['Suez'] })).scope;
    await refused(decideScope(analystOwner, String(own['scope_id']), { decision: 'approve', digest: own['digest'], reason: 'approving my own proposal' }), /^analytics scope rejected \(separation_of_duties\)/, 403);
    expect((await decideScope(owner, corridor, { decision: 'approve', digest: s['digest'], reason: 'the corridor as the operating review reads it (SYNTHETIC)' })).scope).toMatchObject({ state: 'approved', decided_by: owner.principalId });
    expect((await decideScope(owner, String(own['scope_id']), { decision: 'reject', digest: own['digest'], reason: 'a scope nobody asked for' })).scope).toMatchObject({ state: 'rejected' });
  });
  it('VERSION 2 SUPERSEDES; a RETIRED scope is no longer computable (the prelude port answers unknown_scope) while its results stay readable', async () => {
    const s2 = (await proposeScope(analyst, { key: 'red-sea-corridor', title: 'The Red Sea corridor (SYNTHETIC)', description: 'the Bab el-Mandeb corridor with the Suez approach',
      entityIds: [w.entityId], objectiveIds: [w.objectiveId], seriesKeys: [w.seriesKey], geographies: ['Bab el-Mandeb', 'Suez'] })).scope;
    corridorV2 = String(s2['scope_id']);
    await decideScope(owner2, corridorV2, { decision: 'approve', digest: s2['digest'], reason: 'the approach is part of the corridor (SYNTHETIC)' });
    const list = (await scopes(analyst)).scopes.filter((x) => x['scope_key'] === 'red-sea-corridor');
    expect(list.map((x) => [x['version'], x['state']])).toEqual([[2, 'approved'], [1, 'superseded']]);
    expect(arr(list[0]!['entities']).map((e) => e['name'])).toEqual(['Bab el-Mandeb Strait']);
    const t = (await proposeScope(analyst, { key: 'temporary-scope', title: 'A temporary scope', description: 'retired after one use', geographies: ['Hormuz'] })).scope;
    await decideScope(owner, String(t['scope_id']), { decision: 'approve', digest: t['digest'], reason: 'a scope for one review (SYNTHETIC)' });
    await refused(retireScope(owner, String(t['scope_id']), 'x'), /^analytics scope rejected \(reason\)/, 422);
    expect((await retireScope(owner, String(t['scope_id']), 'the review it served is closed (SYNTHETIC)')).scope).toMatchObject({ state: 'retired', results_under_it: 0 });
    await refused(retireScope(owner, String(t['scope_id']), 'retired twice'), /^analytics scope rejected \(state\)/, 409);
    await refused(retireScope(owner, corridor, 'v1 is superseded, not approved'), /^analytics scope rejected \(state\)/, 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let K = ''; let v1 = ''; let v2 = ''; let r1 = ''; let r2 = ''; let rIndet = ''; let rUnsupported = '';
describe('MD3 · definitions: the contract validated, proposed by a human, approved at the digest by the owner, computed through the prelude port', () => {
  it('POSITIVE: an analyst proposes the contract (a MetricContract) — digested over the canonical contract, the approval routed; the owner approves at that digest — the item closed; the prelude port computes it: 6 of 8 = 0.75, determinate', async () => {
    K = `FX-rate-${RUN}`;
    const p = (await propose(analyst, FX(K))).definition;
    v1 = String(p['definition_id']);
    expect(p).toMatchObject({ metric_key: K, version: 1, state: 'proposed', proposed_by: analyst.principalId, proposed_by_kind: 'human', supported: true, computation_key: COMPUTATION,
      purpose_key: 'product-quality', owner_principal_id: owner.principalId, dimensions: ['severity'], floor_n: 3 });
    expect(obj(p['quality'])['owner_role']).toBe('Chief Product Officer');
    expect((await one(sql`select analytics.digest(analytics.definition_contract(to_jsonb(d))) = d.digest as ok from analytics.metric_definitions d where d.definition_id = ${v1}::uuid`))['ok']).toBe(true);
    const item = obj(p['item']);
    expect(item).toMatchObject({ existing: false });
    expect((await one(sql`select signal_class, subject_kind, state from executive.attention_items where item_id = ${String(item['item_id'])}::uuid`))).toMatchObject({ signal_class: 'analytics.metric', subject_kind: 'metric_definition' });
    await refused(compute(analyst, { metricKey: K, period: Q }), /^metric computation rejected \(unknown_metric\): .* has no approved definition/, 404);
    const a = (await decide(owner, v1, { decision: 'approve', digest: p['digest'], reason: 'the contract reads the fixture faithfully (SYNTHETIC)' })).definition;
    expect(a).toMatchObject({ state: 'approved', decided_by: owner.principalId });
    expect(a['effective_from']).not.toBeNull();
    expect(arr(a['items_closed']).length).toBe(1);
    expect((await one(sql`select state from executive.attention_items where item_id = ${String(item['item_id'])}::uuid`))['state']).toBe('closed');
    const r = (await compute(analyst, { metricKey: K, period: Q })).result;
    r1 = String(r['result_id']);
    expect(r).toMatchObject({ state: 'determinate', definition_version: 1, definition_digest: p['digest'], n: 8, threshold_eval: { breach: false } });
    expect(Number(r['value'])).toBeCloseTo(0.75, 6);
  });
  it('REFUSAL (the contract, at the port): a person dimension 403; an empty serves 422; a dimension outside the computation 422; an unapproved purpose 422; a performance meaning 403; a malformed threshold 422; an automatic action 422; an owner without the role 422; an unknown objective 404; a second open proposal 409', async () => {
    const k = `FX-bad-${RUN}`;
    await refused(propose(analyst, FX(k, { dimensions: ['acknowledged_by'] })), /^metric definition rejected \(person\): the dimension\(s\) acknowledged_by name a person/, 403);
    await refused(propose(analyst, FX(k, { dimensions: ['reviewer_role'] })), /^metric definition rejected \(person\)/, 403);
    await refused(propose(analyst, FX(k, { serves: {} })), /^metric definition rejected \(serves\)/, 422);
    await refused(propose(analyst, FX(k, { dimensions: ['region'] })), /^metric definition rejected \(dimension\): the dimension\(s\) region are outside the computation's \(severity\)/, 422);
    await refused(propose(analyst, FX(k, { purposeKey: 'no-such-purpose' })), /^metric definition rejected \(purpose\): no-such-purpose is not an approved purpose/, 422);
    await refused(propose(analyst, FX(k, { meaning: 'used for the employee performance review of each analyst' })), /^metric definition rejected \(person\)/, 403);
    await refused(propose(analyst, FX(k, { threshold: { band: [0.9, 0.1] } as never, direction: 'band' })), /^metric definition rejected \(threshold\)/, 422);
    await refused(propose(analyst, FX(k, { threshold: { target: 7 } })), /^metric definition rejected \(threshold\): a rate's threshold lies between 0 and 1/, 422);
    await refused(propose(analyst, FX(k, { action: 'automatically demote the team that misses it' })), /^metric definition rejected \(action\)/, 422);
    await refused(propose(analyst, FX(k, { ownerRole: 'Chief Product Officer' }), analyst.principalId), /^metric definition rejected \(owner\)/, 422);
    await refused(propose(analyst, FX(k, { ownerRole: 'Head of Vibes' })), /^metric definition rejected \(owner\): App M's owner "Head of Vibes" maps to no role/, 422);
    await refused(propose(analyst, FX(k, { serves: { objective_ids: [uuidv7()] } })), /^metric definition rejected \(unknown_objective\)/, 404);
    await refused(propose(analyst, FX(k, { computationKey: 'no_such_computation' })), /^metric definition rejected \(unknown_computation\)/, 404);
    await refused(propose(analyst, FX(k, { kind: 'duration', numerator: null, denominator: null })), /^metric definition rejected \(kind\): the definition is a duration, the computation .* computes a rate/, 422);
    await refused(propose(analyst, FX(k, { window: { kind: 'rolling_days', clock: 'record' } })), /^metric definition rejected \(contract\): a rolling window states its days/, 422);
    await refused(propose(analyst, { metricKey: k }), /^metric definition rejected \(request\)/, 422);
    await refused(propose(outsider, FX(k)), /./, 403);
    await propose(analyst, FX(k));
    await refused(propose(analyst2, FX(k, { floorN: 4 })), /^metric definition rejected \(state\): version 1 of .* is proposed/, 409);
  });
  it('REFUSAL (the authority): the proposer approving 403; an agent proposing 403 AT THE PORT; an agent deciding 403 at the PEP; an analyst deciding 403 (PDP); a stale digest 409; a decided version 409', async () => {
    const k = `FX-own-${RUN}`;
    const own = (await propose(analystOwner, FX(k))).definition;
    await refused(decide(analystOwner, String(own['definition_id']), { decision: 'approve', digest: own['digest'], reason: 'approving my own proposal' }), /^metric definition rejected \(separation_of_duties\): the proposer of .* does not decide it/, 403);
    await refused(propose(agentAnalyst, FX(`FX-agent-${RUN}`)), /^metric definition rejected \(actor\): a definition proposal is a named human's act; an agent or a system never performs it/, 403);
    await refused(decide(agentOwner, String(own['definition_id']), { decision: 'approve', digest: own['digest'], reason: 'an agent approving a definition' }), /human gate: analytics\.definition\.decide requires a named human principal/, 403);
    await refused(decide(analyst, String(own['definition_id']), { decision: 'approve', digest: own['digest'], reason: 'an analyst approving' }), /./, 403);
    await refused(decide(owner, String(own['definition_id']), { decision: 'approve', digest: 'a'.repeat(64), reason: 'approved at a digest never read' }), /^metric definition rejected \(stale\)/, 409);
    await decide(owner, String(own['definition_id']), { decision: 'reject', digest: own['digest'], reason: 'the fixture already has a definition (SYNTHETIC)' });
    await refused(decide(owner2, String(own['definition_id']), { decision: 'approve', digest: own['digest'], reason: 'deciding a decided version' }), /^metric definition rejected \(state\)/, 409);
  });
  it('UNSUPPORTED: a definition with no computation (its reason and carrier) is approved and computed `unsupported` — visible, never silently missing; an unsupported contract with a dimension or no reason 422', async () => {
    const k = `FX-unsup-${RUN}`;
    await refused(propose(analyst, FX(k, { computationKey: null, unsupportedReason: null, dimensions: [] })), /^metric definition rejected \(unsupported\)/, 422);
    await refused(propose(analyst, FX(k, { computationKey: null, unsupportedReason: 'no source: accessibility journey results arrive with B107/H3' })), /^metric definition rejected \(dimension\): an unsupported definition has no computation/, 422);
    const d = await approved(k, { computationKey: null, unsupportedReason: 'no source in the product: accessibility journey results arrive with B107/H3', dimensions: [], threshold: {} });
    expect(d).toMatchObject({ state: 'approved', supported: false, computation_key: null });
    const r = (await compute(owner, { metricKey: k, period: Q })).result;
    rUnsupported = String(r['result_id']);
    expect(r).toMatchObject({ state: 'unsupported', value: null });
    expect(JSON.stringify(r['reasons'])).toMatch(/unsupported: no source in the product: accessibility journey results arrive with B107\/H3/);
  });
  it('VERSION 2 SUPERSEDES: the target raised to 0.8 — proposed, approved by another owner; v1 superseded (its diff in the ledger), the diff read names the field; the next result names version 2 and breaches (a REVIEW, never a decision)', async () => {
    const p = (await propose(analyst2, FX(K, { threshold: { target: 0.8 } }))).definition;
    v2 = String(p['definition_id']);
    expect(p).toMatchObject({ version: 2, state: 'proposed' });
    await refused(decide(owner, v2, { decision: 'approve', digest: (await one(sql`select digest from analytics.metric_definitions where definition_id = ${v1}::uuid`))['digest'], reason: 'the digest of version 1' }), /^metric definition rejected \(stale\)/, 409);
    const a = (await decide(owner2, v2, { decision: 'approve', digest: p['digest'], reason: 'the target follows the reviewed band (SYNTHETIC)' })).definition;
    expect(a).toMatchObject({ state: 'approved', superseded: v1 });
    expect(await one(sql`select state, superseded_at is not null as s from analytics.metric_definitions where definition_id = ${v1}::uuid`)).toMatchObject({ state: 'superseded', s: true });
    const dd = (await diff(analyst, v1, v2)).diff;
    expect(arr(dd['changed']).map((x) => x['field'])).toEqual(['threshold']);
    expect(arr(dd['changed'])[0]).toMatchObject({ from: { target: 0.6 }, to: { target: 0.8 } });
    const sup = await one(sql`select details from analytics.definition_events where subject_id = ${v1}::uuid and event = 'definition.superseded'`);
    expect(arr(obj(sup['details'])['diff']).map((x) => x['field'])).toEqual(['threshold']);
    const r = (await compute(analyst, { metricKey: K, period: Q, scopeKey: 'red-sea-corridor' })).result;
    r2 = String(r['result_id']);
    expect(r).toMatchObject({ state: 'determinate', definition_version: 2, scope_key: 'red-sea-corridor', scope_version: 2, threshold_eval: { breach: true, threshold: { target: 0.8 } } });
    expect(String(obj(r['threshold_eval'])['action'])).toMatch(/review/);
    const ind = (await compute(analyst, { metricKey: K, period: '2026-Q2' })).result;
    rIndet = String(ind['result_id']);
    expect(ind).toMatchObject({ state: 'indeterminate', value: null, n: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let pkg = ''; let briefing = ''; let publication = '';
describe('MD4 · the uses ledger and ES-40-008 (an indeterminate result constrains downstream use)', () => {
  beforeAll(async () => {
    pkg = (await decisionCalls(h, w).fullDraft()).pkg;
    briefing = uuidv7(); publication = uuidv7();
    // a briefing and a publication PLANTED by the superuser (their composition ports are B36's; only their existence is read here) — SYNTHETIC
    await sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, composed_by, composed_via, known_at, watermark, sources, items, windows, content_digest, header_digest, correlation_id)
      values (${briefing}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${w.executive.principalId}::uuid, 'human', clock_timestamp(), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${'a'.repeat(64)}, ${'b'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into executive.publications (publication_id, scope, tenant_id, domain_id, title, audience, classification, channels, format, accessibility, template, drafted_by, current_version, state, correlation_id)
      values (${publication}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'Q3 operating note (SYNTHETIC)', '{}'::jsonb, 'internal', array['in_app'], 'md', '{}'::jsonb, 'operating-note@1', ${w.executive.principalId}::uuid, 1, 'drafted', ${uuidv7()}::uuid)`.execute(h.su);
  });
  it('POSITIVE: the current determinate result cited in a decision package (the executive); a duplicate 409; the uses list shows the result state', async () => {
    const u = (await recordUse(w.executive, { resultId: r2, usedInKind: 'decision_package', usedInId: pkg })).use;
    expect(u).toMatchObject({ result_id: r2, used_in_kind: 'decision_package', used_in_id: pkg, result_state: 'determinate', qualified: false, definition_version: 2 });
    await refused(recordUse(w.executive, { resultId: r2, usedInKind: 'decision_package', usedInId: pkg }), /^metric use rejected \(duplicate\)/, 409);
    expect((await uses(analyst, { metricKey: K })).uses.map((x) => [x['used_in_kind'], x['result_state']])).toEqual([['decision_package', 'determinate']]);
  });
  it('REFUSAL: a PREVIEW, a REPLAY and a SUPERSEDED definition\'s result 409 (state); an unknown citing object 404; an operating review (no table on this branch) 404; an outsider 403; a bad kind 422', async () => {
    const pk = `FX-preview-${RUN}`;
    await propose(analyst, FX(pk));
    const pr = (await compute(analyst, { metricKey: pk, period: Q, preview: true })).result;
    expect(pr).toMatchObject({ preview: true });
    await refused(recordUse(w.executive, { resultId: pr['result_id'], usedInKind: 'decision_package', usedInId: pkg }), /^metric use rejected \(state\): result .* is a PREVIEW/, 409);
    const rp = (await replay(owner, r2)).replay;
    expect(rp).toMatchObject({ replay_verdict: 'reproduced' });
    await refused(recordUse(w.executive, { resultId: rp['result_id'], usedInKind: 'decision_package', usedInId: pkg }), /^metric use rejected \(state\): result .* is a replay/, 409);
    await refused(recordUse(w.executive, { resultId: r1, usedInKind: 'decision_package', usedInId: pkg }), /^metric use rejected \(state\): result .* was computed on .* v1, which is now superseded/, 409);
    await refused(recordUse(w.executive, { resultId: r2, usedInKind: 'briefing', usedInId: uuidv7() }), /^metric use rejected \(unknown_briefing\)/, 404);
    await refused(recordUse(w.executive, { resultId: r2, usedInKind: 'operating_review', usedInId: uuidv7() }), /^metric use rejected \(unknown_operating_review\)/, 404);
    await refused(recordUse(w.executive, { resultId: uuidv7(), usedInKind: 'decision_package', usedInId: pkg }), /^metric use rejected \(unknown_result\)/, 404);
    await refused(recordUse(w.executive, { resultId: r2, usedInKind: 'tweet', usedInId: pkg }), /^metric use rejected \(kind\)/, 422);
    await refused(recordUse(outsider, { resultId: r2, usedInKind: 'decision_package', usedInId: pkg }), /./, 403);
  });
  it('ES-40-008: an INDETERMINATE result in a briefing or a publication refused 409 unless QUALIFIED (the note naming the state, else 422); qualified it is recorded with its state; in a decision package it may be cited (the use records the state); an UNSUPPORTED result likewise', async () => {
    await refused(recordUse(w.executive, { resultId: rIndet, usedInKind: 'briefing', usedInId: briefing }), /^metric use rejected \(state\): result .* is indeterminate .* cites it only QUALIFIED/, 409);
    await refused(recordUse(w.executive, { resultId: rIndet, usedInKind: 'publication', usedInId: publication, qualified: true, note: 'see the appendix' }), /^metric use rejected \(qualification\): the qualification note states that the result is indeterminate/, 422);
    const q = (await recordUse(w.executive, { resultId: rIndet, usedInKind: 'briefing', usedInId: briefing, qualified: true, note: 'INDETERMINATE: n = 0 below the floor of 3 — shown as not measured (SYNTHETIC)' })).use;
    expect(q).toMatchObject({ result_state: 'indeterminate', qualified: true });
    const ev = await one(sql`select details from analytics.definition_events where subject_id = ${String(q['use_id'])}::uuid and event = 'use.recorded'`);
    expect(obj(ev['details'])).toMatchObject({ result_state: 'indeterminate', qualified: true, used_in_kind: 'briefing' });
    expect((await recordUse(w.executive, { resultId: rIndet, usedInKind: 'decision_package', usedInId: pkg })).use).toMatchObject({ result_state: 'indeterminate', qualified: false });
    await refused(recordUse(w.executive, { resultId: rUnsupported, usedInKind: 'publication', usedInId: publication }), /^metric use rejected \(state\): result .* is unsupported/, 409);
    expect((await recordUse(w.executive, { resultId: rUnsupported, usedInKind: 'publication', usedInId: publication, qualified: true, note: 'UNSUPPORTED in this product until B107/H3 (SYNTHETIC)' })).use).toMatchObject({ result_state: 'unsupported', qualified: true });
    expect((await recordUse(w.executive, { resultId: r2, usedInKind: 'briefing', usedInId: briefing })).use).toMatchObject({ result_state: 'determinate' });
  });
  it('RETIRE (MD3): the owner retires the approved version — the answer and the event LIST every use of the key\'s results; nothing refused; computation stops (404); recovery: version 3 approved computes again', async () => {
    await refused(retire(analyst, v2, 'an analyst retiring'), /./, 403);
    await refused(retire(owner, v2, 'short'), /^metric definition rejected \(reason\)/, 422);
    await refused(retire(owner, v1, 'v1 is superseded'), /^metric definition rejected \(state\)/, 409);
    const r = (await retire(owner, v2, 'the fixture computation is withdrawn (SYNTHETIC)')).definition;
    expect(r).toMatchObject({ state: 'retired', retired_by: owner.principalId });
    const listed = arr(r['uses']).map((u) => `${u['used_in_kind']}:${u['result_state']}`).sort();
    expect(listed).toEqual(['briefing:determinate', 'briefing:indeterminate', 'decision_package:determinate', 'decision_package:indeterminate']);
    const ev = await one(sql`select details from analytics.definition_events where subject_id = ${v2}::uuid and event = 'definition.retired'`);
    expect(arr(obj(ev['details'])['uses']).length).toBe(4);
    await refused(compute(analyst, { metricKey: K, period: Q }), /^metric computation rejected \(unknown_metric\)/, 404);
    expect((await uses(owner, { metricKey: K })).uses.length).toBe(4);   // the uses stay readable
    const v3 = await approved(K, { threshold: { target: 0.7 } }, analyst2, owner);
    expect(v3).toMatchObject({ version: 3, state: 'approved' });
    expect((await compute(analyst, { metricKey: K, period: Q })).result).toMatchObject({ state: 'determinate', definition_version: 3 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('MD5 · DP-44-005: the uses of a B90 metric serving; the withdrawal lists them', () => {
  let model = ''; let serving = ''; let MSR = '';
  const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
  beforeAll(async () => {
    MSR = ((await w.graph.declare(h.req(metricOwner, 'graph.strategy.declare', 'MSR', null, 'graph'), T(), D(), { payload: { objectType: 'MSR', title: 'Corridor exposure (EUR at risk)', statement: 'Corridor exposure (EUR at risk) (B92 §MD harness, SYNTHETIC)', status: 'active',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the measure is about the corridor (B92 §MD harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
    await w.graph.defineMeasure(h.req(metricOwner, 'graph.measure.define', 'MSR', MSR, 'graph'), T(), D(), MSR, { payload: { objectiveId: w.objectiveId, unit: 'EUR', direction: 'lower_better', targetValue: 500000, targetDate: '2027-06-30', freshnessDays: 60 } });
    await w.graph.observeMeasure(h.req(metricOwner, 'graph.measure.observe', 'MSR', MSR, 'graph'), T(), D(), MSR, { payload: { value: 550000, observedAt: await dbInstant('10 days'), source: { kind: 'evidence', id: w.evd.id } } });
    const eff = await dbInstant('80 days');
    model = String(((await products.register(E(steward, 'products.product.register', 'DPR'), T(), D(), { payload: { key: `corridor-exposure-${RUN}`, title: 'Corridor exposure (EUR at risk) (SYNTHETIC)', kind: 'metric',
      purpose: 'the certified corridor exposure metric served to the executive view', ownerPrincipalId: metricOwner.principalId } })) as { product: Row }).product['product_id']);
    await metrics.define(E(metricOwner, 'products.metric.declare', 'MET', model), T(), D(), model, { payload: { measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR }, effectiveFrom: eff } });
    await metrics.certify(E(metricOwner, 'products.metric.certify', 'MET', model), T(), D(), model, { payload: { version: 1, expiresAt: await dbAhead('90 days') } });
    serving = String(((await metrics.serve(E(w.executive, 'products.metric.serve', 'MET'), T(), D(), `corridor-exposure-${RUN}`, { payload: { view: 'executive' } })) as { serving: Row }).serving['serving_id']);
  });
  it('POSITIVE: the executive cites the serving in a decision package and a briefing; the uses list them with the serving\'s standing; a duplicate 409; an unknown serving 404; an unknown package 404; an outsider 403', async () => {
    const u = (await recordServingUse(w.executive, { servingId: serving, usedInKind: 'decision_package', usedInId: pkg })).use;
    expect(u).toMatchObject({ serving_id: serving, model_id: model, used_in_kind: 'decision_package', certified: true, view: 'executive', version: 1 });
    await recordServingUse(w.executive, { servingId: serving, usedInKind: 'briefing', usedInId: briefing, note: 'the Q3 exposure reading' });
    await refused(recordServingUse(w.executive, { servingId: serving, usedInKind: 'briefing', usedInId: briefing }), /^metric use rejected \(duplicate\)/, 409);
    await refused(recordServingUse(w.executive, { servingId: uuidv7(), usedInKind: 'briefing', usedInId: briefing }), /^metric use rejected \(unknown_serving\)/, 404);
    await refused(recordServingUse(w.executive, { servingId: serving, usedInKind: 'decision_package', usedInId: uuidv7() }), /^metric use rejected \(unknown_decision_package\)/, 404);
    await refused(recordServingUse(w.executive, { servingId: serving, usedInKind: 'operating_review', usedInId: pkg }), /^metric use rejected \(kind\)/, 422);
    await refused(recordServingUse(outsider, { servingId: serving, usedInKind: 'briefing', usedInId: briefing }), /./, 403);
    expect((await servingUses(analyst, { modelId: model })).uses.map((x) => x['used_in_kind']).sort()).toEqual(['briefing', 'decision_package']);
  });
  it('THE WITHDRAWAL lists the uses beside the servings (answer and event); afterwards an UNCERTIFIED analyst-view serving is cited in a briefing only with a note saying so', async () => {
    const m = ((await metrics.withdraw(E(metricOwner, 'products.metric.withdraw_certification', 'MET', model), T(), D(), model, { payload: { reason: 'the exposure model is re-specified (SYNTHETIC)' } })) as { metric: Row }).metric;
    const wd = obj(m['withdrawal']);
    expect(arr(wd['servings_exposed']).map((s) => s['serving_id'])).toEqual([serving]);
    expect(arr(wd['uses_exposed']).map((u) => `${u['used_in_kind']}:${u['used_in_id']}`).sort()).toEqual([`briefing:${briefing}`, `decision_package:${pkg}`].sort());
    const ev = await one(sql`select details from products.product_events where product_id = ${model}::uuid and event = 'metric.certification_withdrawn' order by occurred_at desc limit 1`);
    expect(arr(obj(ev['details'])['uses_exposed']).length).toBe(2);
    const s2 = String(((await metrics.serve(E(w.executive, 'products.metric.serve', 'MET'), T(), D(), `corridor-exposure-${RUN}`, { payload: { view: 'analyst' } })) as { serving: Row }).serving['serving_id']);
    await refused(recordServingUse(w.executive, { servingId: s2, usedInKind: 'publication', usedInId: publication }), /^metric use rejected \(state\): serving .* was UNCERTIFIED/, 409);
    expect((await recordServingUse(w.executive, { servingId: s2, usedInKind: 'publication', usedInId: publication, note: 'UNCERTIFIED analyst-view reading — not an executive basis (SYNTHETIC)' })).use).toMatchObject({ certified: false });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('MD6 · the reads: the catalog (CAP-DL-11), the contract card, the lists, RLS', () => {
  it('THE CATALOG: every key with its current definition; the latest non-preview, non-replay results per period and scope; the uses; the B90 catalog entry a data steward made (kind external, ref analytics:<key>)', async () => {
    await cat.register(h.req(steward, 'products.catalog.asset.register', 'CAT', null, 'executive'), T(), D(), { payload: { kind: 'external', ref: `analytics:${K}`, title: `Product metric ${K} (SYNTHETIC)`, ownerPrincipalId: owner.principalId, classification: 'internal' } });
    const cg = await catalog(analyst);
    expect(cg.service).toMatchObject({ owner_role: 'product_analytics_owner' });
    expect(cg.catalog_note).toMatch(/not catalogued by its approval/);
    const row = cg.catalog.find((x) => x['metric_key'] === K)!;
    expect(row).toMatchObject({ version: 3, state: 'approved', supported: true, uses: 4 });
    expect(obj(row['b90_catalog_entry'])).toMatchObject({ kind: 'external', ref: `analytics:${K}` });
    const periods = arr(row['results_by_period']).map((x) => `${x['period_key']}|${x['scope_key'] ?? ''}|${x['state']}|v${x['definition_version']}`);
    expect(periods).toEqual([`${Q}||determinate|v3`, `${Q}|red-sea-corridor|determinate|v2`, '2026-Q2||indeterminate|v2']);
    const un = cg.catalog.find((x) => x['metric_key'] === `FX-unsup-${RUN}`)!;
    expect(un).toMatchObject({ supported: false });
    expect(arr(un['results_by_period'])[0]).toMatchObject({ state: 'unsupported', value: null });
  });
  it('THE CONTRACT CARD: every version with its contract and who decided it, the diff of the latest two, the results (preview and replay marked), the uses, the ledger, the items; the lists; another domain sees nothing (404)', async () => {
    const cd = await card(owner, K);
    expect(arr(cd['versions']).map((v) => [v['version'], v['state']])).toEqual([[3, 'approved'], [2, 'retired'], [1, 'superseded']]);
    expect(obj(arr(cd['versions'])[0]!['contract'])['metric_key']).toBe(K);
    expect(arr(cd['versions'])[0]!['decided_by_name']).toMatch(/b92md-owner/);
    expect(arr(obj(cd['diff'])['changed']).map((x) => x['field'])).toEqual(['threshold']);
    expect(arr(cd['results']).some((r) => r['replay_of'] !== null && r['replay_verdict'] === 'reproduced')).toBe(true);
    expect(arr(cd['uses']).length).toBe(4);
    expect(arr(cd['ledger']).map((e) => e['event'])).toEqual(expect.arrayContaining(['definition.proposed', 'definition.approved', 'definition.superseded', 'definition.retired']));
    expect(arr(cd['items']).every((i) => i['state'] === 'closed')).toBe(true);
    const ls = await definitions(analyst);
    expect(ls.definitions.find((x) => x['metric_key'] === K)).toMatchObject({ version: 3, approved_version: 3, versions: 3 });
    expect(ls.computations.some((x) => x['computation_key'] === COMPUTATION)).toBe(true);
    expect(obj(ls.owner_roles)['chief product officer']).toBe('product_analytics_owner');
    await refused(card(foreign, K, otherDomain), /^metric definition rejected \(unknown_metric\)/, 404);
    await refused(card(outsider, K), /./, 403);
    await refused(c.definition(rq(owner, 'analytics.read', 'AMD'), T(), D(), 'not a key'), /^metric definition rejected \(request\)/, 422);
  });
  it('the ledgers are append-only; a definition cannot be deleted by a runtime role (no write grant)', async () => {
    await expect(sql`update analytics.definition_events set event = 'x.y' where subject_id = ${v1}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
    await expect(sql`delete from products.metric_serving_uses`.execute(h.su)).rejects.toThrow(/append/i);
    expect((await one(sql`select has_table_privilege('eye_commit', 'analytics.metric_definitions', 'INSERT') as w, has_table_privilege('eye_commit', 'products.metric_serving_uses', 'INSERT') as u`))).toMatchObject({ w: false, u: false });
  });
});
