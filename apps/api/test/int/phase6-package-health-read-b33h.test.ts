/**
 * CP-6 B33-H — AN INCOMPLETE READ IS NOT AN ABSENCE: the package-health incident of 2026-10-09/10, on a real database through the real
 * pipeline, ports, controllers and after-tick hook.
 *
 * The incident (eye_demo): four after-tick health runs by agent:attention@1.0.0 (2026-10-09 22:43:06, 2026-10-10 11:16:22, 15:34:37 and
 * 22:50:16 UTC) recorded the geopolitical and competitor packages CONFLICTED ("the domain has no risk taxonomy in force", "source … has no
 * contract in this domain"); the runs 10–17 s later passed. The audit chain dates each facts read: its transaction began 274–2 092 s
 * before its facts were read, across host sleeps in the power log — the reads were SUSPENDED MID-STATEMENT. A commit context expires on
 * the database's wall clock (public.eye_ctx3, 60 s) and every RLS policy reads it, so the rest of domain.package_facts ran with the
 * tenant gone: the taxonomy and contracts read as ABSENT, and the next (fresh, live) write recorded those absences as faults.
 *
 * Here the suspension is CONTROLLED: a test-only wrapper delays prediction.risk_taxonomy_current (called inside package_facts) past the
 * context's lifetime — the same statement, the same point, the same consequence. The lifetime is not shortened or extended; RLS is not
 * touched.
 *
 *   H0 · the baseline: the package is sound; health passes.
 *   H1 · the health ROUTE, its facts read delayed past the context: the read fails closed (503 EYE-DEP-001, a handler failure audited);
 *        no run is recorded — nothing disabled, no conflict exposed, nothing declared healthy.
 *   H2 · the AFTER-TICK hook (the incident's path), delayed: the package reported UNAVAILABLE (recorded: false), nothing changed; the
 *        next tick, undelayed, reads it sound.
 *   H3 · a GENUINE rights withdrawal still disables the functions; an incomplete read while it stands neither clears nor confirms it;
 *        recovery stays governed (re-enable refused before the repair, then the specialist re-enables after a passing run).
 *   H4 · a GENUINELY missing required fact (the required package retired) still exposes the dependent's conflict.
 *
 * Every figure, source, record, entity and persona here is SYNTHETIC fixture data.
 *
 * REPRODUCTION: `B33H_REPRO=1` asserts the DEFECT on main's code (0d5622f — run this file from a tree WITHOUT the B33-H pipeline guard):
 * H1/H2 show the false conflict recorded. Without it the harness asserts the CORRECTION.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { Db } from '../../src/shared/db.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { PackagesController } from '../../src/domains/packages/packages.controller.js';
import { PackagesService } from '../../src/domains/packages/packages.service.js';
import { geopoliticalPackage, type PackageDefinition } from '../../src/domains/packages/definitions.js';
import type { Manifest } from '../../src/domains/packages/manifest.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
const REPRO = process.env['B33H_REPRO'] === '1';
/** past the 60-second commit context (pipeline.service.ts establishCommitContext) */
const DELAY_S = 62;
let h: Phase4Harness; let w: DecisionWorld; let pk: PackagesController; let svc: PackagesService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

let owner: AuthenticatedPrincipal; let spec: AuthenticatedPrincipal; let spec2: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let attentionAgent: AuthenticatedPrincipal;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), code: null };
  const r = mapped.getResponse() as { message?: string; code?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')), code: r.code ?? null };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const today = async () => String((await one(sql`select (clock_timestamp() at time zone 'UTC')::date::text as d`))['d']);

// ── the routes (in process) ──────────────────────────────────────────────────────────────────────
const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'DPG', id, 'intelligence');
const declare = (as: AuthenticatedPrincipal, def: PackageDefinition) =>
  pk.declare(rq(as, 'domain.package.declare'), T(), D(), { payload: { key: def.key, kind: def.kind, title: def.title, owner: as.principalId } }) as Promise<{ package: Row }>;
const propose = (as: AuthenticatedPrincipal, pkg: string, semver: string, manifest: unknown) =>
  pk.propose(rq(as, 'domain.package.version', pkg), T(), D(), pkg, { payload: { semver, manifest: manifest as Row } }) as Promise<{ version: Row }>;
const view = (pkg: string) => pk.read(rq(owner, 'domain.package.read', pkg), T(), D(), pkg) as Promise<Row & { versions: Row[]; sections: Record<string, Record<string, Row>> }>;
const approve = (as: AuthenticatedPrincipal, pkg: string, version: number, section: string, digest: string) =>
  pk.approve(rq(as, 'domain.package.approve', pkg), T(), D(), pkg, { payload: { version, section, digest, decision: 'approved', reason: `the ${section} section reviewed by the specialist (SYNTHETIC)`, validDays: 365 } });
const conform = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.conformance(rq(as, 'domain.package.conformance', pkg), T(), D(), pkg, { payload: { version, mode: 'certification' } }) as Promise<{ run: Row & { checks: Row[] } }>;
const certify = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.certify(rq(as, 'domain.package.certify', pkg), T(), D(), pkg, String(version), { payload: { reason: 'every section approved and the suite passed (SYNTHETIC review)' } }) as Promise<{ version: Row }>;
const activate = (as: AuthenticatedPrincipal, pkg: string, version: number) => pk.activate(rq(as, 'domain.package.activate', pkg), T(), D(), pkg, String(version)) as Promise<{ version: Row }>;
const retire = (as: AuthenticatedPrincipal, pkg: string) => pk.retire(rq(as, 'domain.package.retire', pkg), T(), D(), pkg, { payload: { reason: 'the package is retired by its owner (SYNTHETIC)' } }) as Promise<{ package: Row }>;
const health = (as: AuthenticatedPrincipal, pkg: string) => pk.health(rq(as, 'domain.package.health', pkg), T(), D(), pkg) as Promise<{ health: Row }>;
const enable = (as: AuthenticatedPrincipal, pkg: string, version: number, payload: Row) =>
  pk.enable(rq(as, 'domain.package.enable', pkg), T(), D(), pkg, String(version), { payload: { reason: 'the cause is repaired and the health re-run passed', ...payload } }) as Promise<{ enabled: Row }>;
const gate = (key: string, fn: string | null) => pk.gate(rq(owner, 'domain.package.read'), T(), D(), { payload: { packageKey: key, function: fn } }) as Promise<{ gate: Row }>;

// ── the controlled suspension: a test-only wrapper that sleeps inside package_facts' statement ───────────────────────────────
async function installDelay() {
  await sql`create table if not exists public.b33h_delay (seconds float8 not null)`.execute(h.su);
  await sql`grant select on public.b33h_delay to public`.execute(h.su);
  await sql`delete from public.b33h_delay`.execute(h.su);
  await sql`insert into public.b33h_delay values (0)`.execute(h.su);
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'risk_taxonomy_current_b33h'`))['n'];
  if (wrapped === 0) await sql.raw(`
    ALTER FUNCTION prediction.risk_taxonomy_current(uuid, uuid) RENAME TO risk_taxonomy_current_b33h;
    CREATE FUNCTION prediction.risk_taxonomy_current(p_tenant uuid, p_domain uuid) RETURNS prediction.risk_taxonomy
    LANGUAGE plpgsql STABLE AS $$
    DECLARE d float8;
    BEGIN
      SELECT seconds INTO d FROM public.b33h_delay LIMIT 1;
      IF coalesce(d, 0) > 0 THEN PERFORM pg_sleep(d); END IF;
      RETURN prediction.risk_taxonomy_current_b33h(p_tenant, p_domain);
    END $$;
    GRANT EXECUTE ON FUNCTION prediction.risk_taxonomy_current(uuid, uuid) TO PUBLIC;`).execute(h.su);
}
async function removeDelay() {
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'risk_taxonomy_current_b33h'`))['n'];
  if (wrapped !== 0) await sql.raw(`
    DROP FUNCTION prediction.risk_taxonomy_current(uuid, uuid);
    ALTER FUNCTION prediction.risk_taxonomy_current_b33h(uuid, uuid) RENAME TO risk_taxonomy_current;`).execute(h.su);
  await sql`drop table if exists public.b33h_delay`.execute(h.su);
}
const delay = async (seconds: number) => { await sql`update public.b33h_delay set seconds = ${seconds}`.execute(h.su); };

// ── fixtures: sources (SYNTHETIC upload contracts) with evidence ───────────────────────────────────────
const PURPOSES = ['observation', 'corridor monitoring', 'discovery'];
const SRC: Record<string, { sourceId: string; key: string }> = {};
async function source(label: string, publisher: string): Promise<{ sourceId: string; key: string }> {
  const key = `b33h-${label}-${RUN}`;
  const c = uploadContract(key) as Row;
  const contract = { ...c, name: `${label} records (SYNTHETIC)`, publisher, authority_and_rights: { ...(c['authority_and_rights'] as Row), purposes: PURPOSES } };
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const r = await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(), { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  await transition(sourceId, 'approve'); await transition(sourceId, 'active');
  const connector = new UploadConnector([]); const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() }, 'observation.agent.register', agentId, async (tx) => {
    await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
      ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
  });
  const day = await today();
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const files = [1, 2].map((n) => ({ filename: `${label}-${n}-${RUN}.csv`, text: `record,value\n${label} ${n} (SYNTHETIC),${RUN}\n` }));
  await h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
    { payload: { sourceId, contractVersion: 1, files: files.map((f) => ({ filename: f.filename, mediaType: 'text/csv', base64: Buffer.from(f.text, 'utf8').toString('base64'), documentTime: `${day}T00:00:00Z` })) } });
  return { sourceId, key };
}
async function transition(sourceId: string, act: 'approve' | 'active') {
  const action = act === 'approve' ? 'observation.source.approve' : 'observation.source.transition';
  await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
    async (cap) => {
      if (act === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B33-H fixture source', eventId: uuidv7(), correlationId: uuidv7() });
      else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: act, reason: `B33-H fixture source: ${act}`, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
    });
}
async function rights(sourceId: string, rightsState: 'withdrawn' | 'confirmed') {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  await h.app.get(ObservationController).setRights(h.req(h.manager, 'observation.source.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId,
    { payload: { contractVersion: 1, rightsState, evidence: `B33-H: the publisher's reuse terms ${rightsState} (SYNTHETIC)` } });
}
async function machine(roles: string[], label: string): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b33h-${label}-${id.slice(-8)}`}, ${`b33h-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: 'agent', assurance: 'agent_grant', homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}

// ── the certification cycle ──────────────────────────────────────────────────────────────────────
async function ontologyFor(m: Manifest): Promise<void> {
  const ns = m.ontology_extension.namespace;
  const types = [...new Set(m.ontology_extension.mappings.map((x) => x.maps_to))];
  const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(),
    { payload: { namespace: ns, entityTypes: types, predicates: m.ontology_extension.predicates as never, rationale: `the ${ns} extension of the package (SYNTHETIC)` } }) as { ontology: { version_id: string } };
  await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id,
    { payload: { decision: 'approve', reason: 'the extension maps onto the core types; no core predicate is redefined', reviews: { compatibility: 'passed', migration: 'passed', domain: 'passed' } } });
}
async function certifyCycle(def: PackageDefinition): Promise<string> {
  const id = String((await declare(owner, def)).package['package_id']);
  const v = Number((await propose(owner, id, def.semver, def.manifest)).version['version']);
  await ontologyFor(def.manifest);
  const s = (await view(id)).sections[String(v)] as Record<string, Row>;
  for (const section of ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary']) await approve(spec, id, v, section, String((s[section] as Row)['digest']));
  const run = (await conform(owner, id, v)).run;
  expect(run['passed'], JSON.stringify(run['checks'])).toBe(true);
  await certify(spec2, id, v);
  await activate(owner, id, v);
  return id;
}
const geoDef = (key: string): PackageDefinition =>
  geopoliticalPackage({ key, portwatch: SRC['transits']!.key, sanctions: SRC['sanctions']!.key, gdelt: SRC['discovery']!.key, ais: SRC['ais']!.key, chokepointSeries: `fixture:b33h-transits-${RUN}` });
const dependent = (key: string, requires: Array<{ package_key: string; range: string }>): PackageDefinition => {
  const base = geoDef(key);
  const m = structuredClone(base.manifest);
  m.ontology_extension = { namespace: `pkg:${key}`, mappings: [{ type: 'supplier', maps_to: 'organization' }, { type: 'site', maps_to: 'place' }], predicates: [{ predicate: 'supplies' }], event_kinds: ['supplier_disruption'] };
  m.assessment_templates = [{ key: 'supplier-exposure', min_publishers: 1, material: true }];
  m.release = { ...m.release, semver: '1.0.0', requires, migration: null };
  return { ...base, key, kind: 'supply_chain' as never, title: 'supply-chain package (B33-H, SYNTHETIC)', semver: '1.0.0', manifest: m };
};

/** What an incomplete read must leave untouched: the versions (state, disabled functions, conflict), the runs, the events, the migrations, the items. */
async function footprint(pkg: string): Promise<Row> {
  return one(sql`select (select jsonb_agg(jsonb_build_object('v', version, 's', state, 'd', disabled_functions, 'c', conflict) order by version) from domain.package_versions where package_id = ${pkg}::uuid) as versions,
                        (select count(*)::int from domain.package_conformance_runs where package_id = ${pkg}::uuid) as runs,
                        (select count(*)::int from domain.package_events where package_id = ${pkg}::uuid) as events,
                        (select count(*)::int from domain.package_migrations where package_id = ${pkg}::uuid) as migrations,
                        (select count(*)::int from executive.attention_items where subject_id = ${pkg}::uuid and state = 'open') as open_items`);
}
/** the audited handler failures of an incomplete read (result code EYE-DEP-001) */
const incompleteReads = async () => Number((await one(sql`select count(*)::int as n from audit.audit_events
  where tenant_id = ${T()}::uuid and action = 'domain.package.read' and outcome = 'failure' and result_code = 'EYE-DEP-001'`))['n']);

const GEO_KEY = `geo-${RUN}`; const SUP_KEY = `sup-${RUN}`;
let geo = ''; let sup = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  pk = h.app.get(PackagesController); svc = h.app.get(PackagesService);
  owner = await h.humanWithSession(['strategy_owner'], 'b33h-owner');
  spec = await h.humanWithSession(['domain_specialist'], 'b33h-specialist');
  spec2 = await h.humanWithSession(['domain_specialist'], 'b33h-specialist-2');
  steward = await h.humanWithSession(['ontology_steward'], 'b33h-steward');
  analyst = await h.humanWithSession(['domain_analyst'], 'b33h-analyst');
  dadmin = await h.humanWithSession(['domain_admin'], 'b33h-dadmin');
  executive = await h.humanWithSession(['executive'], 'b33h-executive');
  attentionAgent = await machine(['attention_agent'], 'attention');
  await w.exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B33-H harness: package governance to the domain specialists and the administrator',
    rules: { classes: {
      'domain.alert': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
      'domain.package': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_specialist', 'domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  { const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: ['organization', 'place', 'asset', 'product', 'vessel', 'route'],
      predicates: [{ predicate: 'transits' }, { predicate: 'carries' }, { predicate: 'depends_on' }], rationale: 'the domain core vocabulary (B33-H fixture)' } }) as { ontology: { version_id: string } };
    await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id, { payload: { decision: 'approve', reason: 'the core vocabulary of the domain (fixture)' } }); }
  const { ExposuresController } = await import('../../src/prediction/exposures/exposures.controller.js');
  const ex = h.app.get(ExposuresController);
  await ex.publishTaxonomy(h.req(executive, 'prediction.exposure.taxonomy.publish', 'RSK', null, 'prediction'), T(), D(), { payload: { expectedVersion: 0, reason: 'the domain taxonomy (B33-H fixture)',
    categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'market', label: 'Market', polarity: 'both' }] } });
  await ex.activateTaxonomy(h.req(dadmin, 'prediction.exposure.taxonomy.activate', 'RSK', null, 'prediction'), T(), D(), { payload: { version: 1, reason: 'the taxonomy reviewed (B33-H fixture)' } });
  for (const [label, publisher] of [['transits', 'Fixture transit publisher (SYNTHETIC)'], ['sanctions', 'Fixture sanctions publisher (SYNTHETIC)'], ['discovery', 'Fixture news discovery (SYNTHETIC)'],
                                    ['ais', 'Fixture AIS aggregator (SYNTHETIC)']] as const) {
    SRC[label] = await source(label, publisher);
  }
  geo = await certifyCycle(geoDef(GEO_KEY));
  await installDelay();
}, 900_000);

afterAll(async () => {
  await removeDelay().catch(() => undefined);
  await h?.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('H0 · the baseline', () => {
  it('the package is sound: health passes and records the passing run', async () => {
    const r = (await health(owner, geo)).health;
    expect(r).toMatchObject({ recorded: true, passed: true, newly_disabled: [], conflict_exposed: false });
    expect((await gate(GEO_KEY, null)).gate).toMatchObject({ state: 'active' });
  });
});

describe('H1 · the health ROUTE, its facts read suspended past the context (the incident\'s mechanism, controlled)', () => {
  it(`${REPRO ? 'DEFECT' : 'correction'}: ${REPRO ? 'the taxonomy reads as absent and the write records the FALSE conflict' : 'the read fails closed (503 EYE-DEP-001, audited) — no run, no disablement, no conflict, nothing declared healthy'}`, async () => {
    const before = await footprint(geo); const failures = await incompleteReads();
    await delay(DELAY_S);
    try {
      if (REPRO) {
        const r = (await health(owner, geo)).health;
        expect(r).toMatchObject({ recorded: true, passed: false, conflict_exposed: true });
        expect(String((r['conflict'] as Row)['reason'])).toMatch(/the domain has no risk taxonomy in force/);
        expect((await gate(GEO_KEY, null)).gate).toMatchObject({ state: 'conflicted' });
        return;
      }
      const e = await refused(health(owner, geo), /outlived its authorization context .* the result is incomplete and was discarded/, 503);
      expect(e.code).toBe('EYE-DEP-001');
    } finally { await delay(0); }
    expect(await footprint(geo)).toEqual(before);
    expect(await incompleteReads()).toBe(failures + 1);
    expect((await gate(GEO_KEY, null)).gate).toMatchObject({ state: 'active' });
  }, 240_000);
  it('the same read, undelayed: the package reads sound (the facts were never absent)', async () => {
    if (REPRO) {   // the false conflict is recovered the governed way: a passing run, then the specialist clears it
      expect((await health(owner, geo)).health).toMatchObject({ recorded: true, passed: true });
      expect((await enable(spec, geo, 1, { functions: [], clearConflict: true })).enabled).toMatchObject({ conflict: null });
      return;
    }
    expect((await health(owner, geo)).health).toMatchObject({ passed: true, conflict: null });
  });
});

describe('H2 · the AFTER-TICK hook (the incident\'s path) under the attention agent, suspended past the context', () => {
  it(`${REPRO ? 'DEFECT' : 'correction'}: ${REPRO ? 'the hook records the FALSE conflict' : 'the package is reported UNAVAILABLE (recorded: false); nothing changed; the next tick reads it sound'}`, async () => {
    const before = await footprint(geo); const failures = await incompleteReads();
    svc.healthAwaitMs = 200_000;
    await delay(DELAY_S);
    let r: Row;
    try { r = await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D(), correlationId: uuidv7() }); } finally { await delay(0); await svc.settled(); }
    const mine = arr(r['results']).find((o) => o['package_key'] === GEO_KEY) as Row;
    if (REPRO) {
      expect(mine).toMatchObject({ recorded: true, conflict_exposed: true });
      expect((await gate(GEO_KEY, null)).gate).toMatchObject({ state: 'conflicted' });
      expect((await health(owner, geo)).health).toMatchObject({ recorded: true, passed: true });
      await enable(spec, geo, 1, { functions: [], clearConflict: true });
      return;
    }
    expect(mine).toMatchObject({ unavailable: true, recorded: false, error: expect.stringMatching(/outlived its authorization context/) });
    expect(await footprint(geo)).toEqual(before);
    expect(await incompleteReads()).toBe(failures + 1);
    const next = await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D(), correlationId: uuidv7() });
    expect(arr(next['results']).find((o) => o['package_key'] === GEO_KEY)).toMatchObject({ conflict_exposed: false, newly_disabled: [] });
    expect((arr(next['results']).find((o) => o['package_key'] === GEO_KEY) as Row)['error']).toBeUndefined();
    expect((await gate(GEO_KEY, null)).gate).toMatchObject({ state: 'active' });
    svc.healthAwaitMs = 5_000;
  }, 300_000);
});

describe('H3 · a GENUINE rights withdrawal still restricts; an incomplete read neither clears nor confirms it; recovery stays governed', () => {
  it('the sanctions source\'s rights WITHDRAWN (the withdrawal suspends its contract) → health disables assess and event (the gate reads disabled)', async () => {
    await rights(SRC['sanctions']!.sourceId, 'withdrawn');
    const r = (await health(spec, geo)).health;
    expect(r).toMatchObject({ recorded: true, passed: false, newly_disabled: ['assess', 'event'] });
    expect((await gate(GEO_KEY, 'assess')).gate).toMatchObject({ state: 'disabled', reason: expect.stringMatching(/source b33h-sanctions-.* is suspended/) });
  });
  it(`an incomplete read while the withdrawal stands: ${REPRO ? '(not exercised under REPRO)' : 'refused 503; the disablement stands, no passing (or failing) run is recorded'}`, async () => {
    if (REPRO) return;
    const before = await footprint(geo);
    await delay(DELAY_S);
    try { await refused(health(spec, geo), /outlived its authorization context/, 503); } finally { await delay(0); }
    expect(await footprint(geo)).toEqual(before);
    expect((await gate(GEO_KEY, 'assess')).gate).toMatchObject({ state: 'disabled' });
  }, 240_000);
  it('recovery: re-enable refused before the repair; the rights confirmed and the contract re-activated, the run passes, the specialist re-enables', async () => {
    await refused(enable(spec, geo, 1, { functions: ['assess', 'event'] }), /^domain package rejected \(health\)/, 422);
    await rights(SRC['sanctions']!.sourceId, 'confirmed');
    await transition(SRC['sanctions']!.sourceId, 'active');
    expect((await health(spec, geo)).health).toMatchObject({ recorded: true, passed: true, newly_disabled: [] });
    expect((await enable(spec, geo, 1, { functions: ['assess', 'event'] })).enabled).toMatchObject({ disabled_functions: {} });
    expect((await gate(GEO_KEY, 'assess')).gate).toMatchObject({ state: 'active' });
  });
});

describe('H4 · a GENUINELY missing required fact still exposes the conflict', () => {
  it('a supply package requiring the geopolitical package; the geopolitical package RETIRED → the supply package\'s health exposes the conflict (every function)', async () => {
    sup = await certifyCycle(dependent(SUP_KEY, [{ package_key: GEO_KEY, range: '^1.0.0' }]));
    expect((await health(owner, sup)).health).toMatchObject({ passed: true, conflict_exposed: false });
    await retire(owner, geo);
    const r = (await health(owner, sup)).health;
    expect(r).toMatchObject({ recorded: true, conflict_exposed: true, conflict: expect.objectContaining({ reason: expect.stringMatching(/the required package geo-.* is no longer active/) }) });
    expect((await gate(SUP_KEY, 'watch')).gate).toMatchObject({ state: 'conflicted' });
  });
});
