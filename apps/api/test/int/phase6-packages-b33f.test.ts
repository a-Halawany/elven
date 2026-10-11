/**
 * CP-6 B33-F (migration 0112) — THE PACKAGE VALIDATION-TO-EFFECT BOUNDARY, on a real database through the real pipeline, ports and
 * controllers. The review of 059a314 found three defects of the §PK framework (0111):
 *
 *   F1 · contract compatibility omitted the REQUIREMENTS OTHER ACTIVE PACKAGES impose: with a consumer active that requires geopolitical
 *        ^1.0.0, geopolitical 2.0.0 (with a migration description) passed contract compatibility and every blocking check, was certified
 *        and activated — the consumer's requirement silently broken.
 *   F2 · certify_package_version and activate_package_version rested on the SAVED conformance run and section approvals: a source's
 *        rights withdrawn, or a model quarantined, after the run passed did not stop certification or activation.
 *   F3 · the same at activation for a REQUIRED package changed (a major version activated) or retired after the dependent's run passed.
 *   F4 · enable_package_function rested on the SAVED passing health run: the cause recurring after it (a source suspended again, the
 *        ontology superseded again) did not stop the re-enablement.
 *   F5 · the boundary under CONCURRENCY (two sessions): two activations whose dependency checks read each other (write skew), and a rights
 *        withdrawal in flight while an activation validates.
 *
 * Every figure, source, record, entity and persona here is SYNTHETIC fixture data.
 *
 * REPRODUCTION: `B33F_REPRO=1` asserts the DEFECTS on a database through 0111 (each case shows the effect admitted where it must be
 * refused); without it the harness asserts the CORRECTION (0112): the refusal, no admitted replacement or downstream effect, the prior
 * active state preserved, and the recovery once the cause is repaired. The cross-checks fail each way.
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
import { contractCompatibility, type PackageFacts } from '../../src/domains/packages/conformance.js';
import { satisfies } from '../../src/domains/packages/semver.js';
import { geopoliticalPackage, type PackageDefinition } from '../../src/domains/packages/definitions.js';
import type { Manifest } from '../../src/domains/packages/manifest.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
const REPRO = process.env['B33F_REPRO'] === '1';
let h: Phase4Harness; let w: DecisionWorld; let pk: PackagesController; let svc: PackagesService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

let owner: AuthenticatedPrincipal; let spec: AuthenticatedPrincipal; let spec2: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let methodSteward: AuthenticatedPrincipal;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
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
const view = (pkg: string) => pk.read(rq(owner, 'domain.package.read', pkg), T(), D(), pkg) as Promise<Row & { versions: Row[]; sections: Record<string, Record<string, Row>>; migrations: Row[]; ledger: Row[]; items: Row[] }>;
const approve = (as: AuthenticatedPrincipal, pkg: string, version: number, section: string, digest: string) =>
  pk.approve(rq(as, 'domain.package.approve', pkg), T(), D(), pkg, { payload: { version, section, digest, decision: 'approved', reason: `the ${section} section reviewed by the specialist (SYNTHETIC)`, validDays: 365 } });
const conform = (as: AuthenticatedPrincipal, pkg: string, version: number, mode = 'certification') =>
  pk.conformance(rq(as, 'domain.package.conformance', pkg), T(), D(), pkg, { payload: { version, mode } }) as Promise<{ run: Row & { checks: Row[] } }>;
const certify = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.certify(rq(as, 'domain.package.certify', pkg), T(), D(), pkg, String(version), { payload: { reason: 'every section approved and the suite passed (SYNTHETIC review)' } }) as Promise<{ version: Row }>;
const activate = (as: AuthenticatedPrincipal, pkg: string, version: number) => pk.activate(rq(as, 'domain.package.activate', pkg), T(), D(), pkg, String(version)) as Promise<{ version: Row }>;
const withdraw = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.withdrawVersion(rq(as, 'domain.package.withdraw', pkg), T(), D(), pkg, String(version), { payload: { reason: 'the requirement cannot be met; a version without it follows' } }) as Promise<{ version: Row }>;
const retire = (as: AuthenticatedPrincipal, pkg: string) => pk.retire(rq(as, 'domain.package.retire', pkg), T(), D(), pkg, { payload: { reason: 'the package is retired by its owner (SYNTHETIC)' } }) as Promise<{ package: Row }>;
const health = (as: AuthenticatedPrincipal, pkg: string) => pk.health(rq(as, 'domain.package.health', pkg), T(), D(), pkg) as Promise<{ health: Row }>;
const enable = (as: AuthenticatedPrincipal, pkg: string, version: number, payload: Row) =>
  pk.enable(rq(as, 'domain.package.enable', pkg), T(), D(), pkg, String(version), { payload: { reason: 'the cause is repaired and the health re-run passed', ...payload } }) as Promise<{ enabled: Row }>;
const gate = (key: string, fn: string | null) => pk.gate(rq(owner, 'domain.package.read'), T(), D(), { payload: { packageKey: key, function: fn } }) as Promise<{ gate: Row }>;

// ── fixtures: sources (SYNTHETIC upload contracts) with evidence ───────────────────────────────────────
const PURPOSES = ['observation', 'corridor monitoring', 'discovery'];
const SRC: Record<string, { sourceId: string; key: string }> = {};
async function source(label: string, publisher: string): Promise<{ sourceId: string; key: string }> {
  const key = `b33f-${label}-${RUN}`;
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
async function transition(sourceId: string, act: 'approve' | 'active' | 'suspended') {
  const action = act === 'approve' ? 'observation.source.approve' : 'observation.source.transition';
  await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
    async (cap) => {
      if (act === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B33-F fixture source', eventId: uuidv7(), correlationId: uuidv7() });
      else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: act, reason: `B33-F fixture source: ${act}`, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
    });
}
async function rights(sourceId: string, rightsState: 'withdrawn' | 'confirmed') {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  await h.app.get(ObservationController).setRights(h.req(h.manager, 'observation.source.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId,
    { payload: { contractVersion: 1, rightsState, evidence: `B33-F: the publisher's reuse terms ${rightsState} (SYNTHETIC)` } });
}
async function methodAct(act: 'quarantine' | 'reinstate', methodRef: string) {
  const { RegistryController } = await import('../../src/prediction/registry/registry.controller.js');
  const c = h.app.get(RegistryController);
  const req = h.req(methodSteward, `prediction.registry.method.${act}`, 'FMR', null, 'prediction');
  if (act === 'quarantine') await c.quarantine(req, T(), D(), { payload: { methodRef, reason: 'B33-F: the method is under review (SYNTHETIC)' } });
  else await c.reinstate(req, T(), D(), { payload: { methodRef, note: 'B33-F: the review closed; the method is sound (SYNTHETIC)' } });
}

// ── the certification cycle ──────────────────────────────────────────────────────────────────────
async function ontologyFor(m: Manifest): Promise<string> {
  const ns = m.ontology_extension.namespace;
  const types = [...new Set(m.ontology_extension.mappings.map((x) => x.maps_to))];
  const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(),
    { payload: { namespace: ns, entityTypes: types, predicates: m.ontology_extension.predicates as never, rationale: `the ${ns} extension of the package (SYNTHETIC)` } }) as { ontology: { version_id: string } };
  await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id,
    { payload: { decision: 'approve', reason: 'the extension maps onto the core types; no core predicate is redefined', reviews: { compatibility: 'passed', migration: 'passed', domain: 'passed' } } });
  return p.ontology.version_id;
}
/** propose → (ontology) → five sections → a PASSING certification run; returns the version. */
async function passRun(def: PackageDefinition, pkg: string, opts: { ontology?: boolean } = {}): Promise<number> {
  const v = Number((await propose(owner, pkg, def.semver, def.manifest)).version['version']);
  if (opts.ontology !== false) await ontologyFor(def.manifest);
  const s = (await view(pkg)).sections[String(v)] as Record<string, Row>;
  for (const section of ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary']) await approve(spec, pkg, v, section, String((s[section] as Row)['digest']));
  const run = (await conform(owner, pkg, v)).run;
  expect(run['passed'], JSON.stringify(run['checks'])).toBe(true);
  return v;
}
async function certifyCycle(def: PackageDefinition, pkg: string | null, opts: { ontology?: boolean } = {}): Promise<{ pkg: string; version: number }> {
  const id = pkg ?? String((await declare(owner, def)).package['package_id']);
  const v = await passRun(def, id, opts);
  await certify(spec2, id, v);
  await activate(owner, id, v);
  return { pkg: id, version: v };
}
const geoDef = (key: string, o: { sanctions?: string; method?: string } = {}): PackageDefinition =>
  geopoliticalPackage({ key, portwatch: SRC['transits']!.key, sanctions: o.sanctions ?? SRC['sanctions']!.key, gdelt: SRC['discovery']!.key, ais: SRC['ais']!.key, chokepointSeries: `fixture:b33f-transits-${RUN}`, method: o.method });
/** a dependent package (the supply-chain kind) requiring other packages — its own namespace and template */
const dependent = (key: string, requires: Array<{ package_key: string; range: string }>, semver = '1.0.0'): PackageDefinition => {
  const base = geoDef(key);
  const m = structuredClone(base.manifest);
  m.ontology_extension = { namespace: `pkg:${key}`, mappings: [{ type: 'supplier', maps_to: 'organization' }, { type: 'site', maps_to: 'place' }], predicates: [{ predicate: 'supplies' }], event_kinds: ['supplier_disruption'] };
  m.assessment_templates = [{ key: 'supplier-exposure', min_publishers: 1, material: true }];
  m.release = { ...m.release, semver, requires, migration: semver === '1.0.0' ? null : 'the requirement range is widened; nothing is removed' };
  return { ...base, key, kind: 'supply_chain' as never, title: 'supply-chain package (B33-F, SYNTHETIC)', semver, manifest: m };
};
const bump = (def: PackageDefinition, semver: string, migration: string | null = null): PackageDefinition =>
  ({ ...def, semver, manifest: { ...def.manifest, release: { ...def.manifest.release, semver, migration } } });

/** What a refused effect must leave untouched: the package's versions, its DPG objects, its ledger, its migrations and items. */
async function footprint(pkg: string): Promise<Row> {
  return one(sql`select (select jsonb_agg(jsonb_build_object('v', version, 's', state, 'd', disabled_functions, 'c', conflict) order by version) from domain.package_versions where package_id = ${pkg}::uuid) as versions,
                        (select count(*)::int from objects.canonical_objects where object_type = 'DPG' and object_id = ${pkg}::uuid) as dpg,
                        (select count(*)::int from domain.package_events where package_id = ${pkg}::uuid) as events,
                        (select jsonb_agg(jsonb_build_object('m', migration_id, 's', state) order by opened_at) from domain.package_migrations where package_id = ${pkg}::uuid) as migrations,
                        (select count(*)::int from executive.attention_items where subject_id = ${pkg}::uuid and state = 'open') as open_items`);
}
const activeOf = async (pkg: string) => Number((await one(sql`select version from domain.package_versions where package_id = ${pkg}::uuid and state = 'active'`))['version'] ?? 0);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  pk = h.app.get(PackagesController); svc = h.app.get(PackagesService);
  owner = await h.humanWithSession(['strategy_owner'], 'b33f-owner');
  spec = await h.humanWithSession(['domain_specialist'], 'b33f-specialist');
  spec2 = await h.humanWithSession(['domain_specialist'], 'b33f-specialist-2');
  steward = await h.humanWithSession(['ontology_steward'], 'b33f-steward');
  analyst = await h.humanWithSession(['domain_analyst'], 'b33f-analyst');
  dadmin = await h.humanWithSession(['domain_admin'], 'b33f-dadmin');
  executive = await h.humanWithSession(['executive'], 'b33f-executive');
  methodSteward = await h.humanWithSession(['method_steward'], 'b33f-method-steward');
  await w.exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B33-F harness: package governance to the domain specialists and the administrator',
    rules: { classes: {
      'domain.alert': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
      'domain.package': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_specialist', 'domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  { const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: ['organization', 'place', 'asset', 'product', 'vessel', 'route'],
      predicates: [{ predicate: 'transits' }, { predicate: 'carries' }, { predicate: 'depends_on' }], rationale: 'the domain core vocabulary (B33-F fixture)' } }) as { ontology: { version_id: string } };
    await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id, { payload: { decision: 'approve', reason: 'the core vocabulary of the domain (fixture)' } }); }
  const { ExposuresController } = await import('../../src/prediction/exposures/exposures.controller.js');
  const ex = h.app.get(ExposuresController);
  await ex.publishTaxonomy(h.req(executive, 'prediction.exposure.taxonomy.publish', 'RSK', null, 'prediction'), T(), D(), { payload: { expectedVersion: 0, reason: 'the domain taxonomy (B33-F fixture)',
    categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'market', label: 'Market', polarity: 'both' }] } });
  await ex.activateTaxonomy(h.req(dadmin, 'prediction.exposure.taxonomy.activate', 'RSK', null, 'prediction'), T(), D(), { payload: { version: 1, reason: 'the taxonomy reviewed (B33-F fixture)' } });
  for (const [label, publisher] of [['transits', 'Fixture transit publisher (SYNTHETIC)'], ['sanctions', 'Fixture sanctions publisher (SYNTHETIC)'], ['discovery', 'Fixture news discovery (SYNTHETIC)'],
                                    ['ais', 'Fixture AIS aggregator (SYNTHETIC)'], ['sanc2', 'Fixture sanctions publisher B (SYNTHETIC)'], ['sanc4', 'Fixture sanctions publisher D (SYNTHETIC)'],
                                    ['sanc5', 'Fixture sanctions publisher E (SYNTHETIC)']] as const) {
    SRC[label] = await source(label, publisher);
  }
}, 900_000);

afterAll(async () => {
  await sql`drop trigger if exists b33f_hold on domain.package_events`.execute(h.su).catch(() => undefined);
  await sql`drop trigger if exists b33f_hold on observation.source_contract_events`.execute(h.su).catch(() => undefined);
  await sql`drop function if exists public.b33f_hold()`.execute(h.su).catch(() => undefined);
  await h?.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('F0 · the port judges requirements itself: domain.dpk_satisfies agrees with semver.ts on every case', () => {
  it('parity over well-formed, alternative, malformed and edge ranges', async () => {
    if (REPRO) return;   // 0111 has no SQL semver
    const versions = ['0.0.0', '1.0.0', '1.2.3', '1.10.0', '2.0.0', '2.0.1', '10.0.0', 'x.y.z', '1.0'];
    const ranges = ['*', '', '1.2.3', '=1.2.3', '>1.0.0', '>=1.0.0', '<2.0.0', '<=2.0.0', '^1.0.0', '^1.2.0', '~1.2.0', '>=1.0.0 <2.0.0', '^1.0.0 || ^2.0.0', '  ^2.0.0  ', '^1.x', '>= 1.0.0', '1.0.0 || bad', '||'];
    for (const v of versions) for (const r of ranges) {
      const sqlAnswer = (await one(sql`select domain.dpk_satisfies(${v}, ${r}) as ok`))['ok'];
      expect(sqlAnswer ?? null, `${v} in "${r}"`).toBe(satisfies(v, r));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('F1 · contract compatibility and the requirements other active packages impose (the reviewer\'s reproduction)', () => {
  const GK = `f1geo-${RUN}`; const KK = `f1sup-${RUN}`;
  let g = ''; let k = '';
  it(`${REPRO ? 'DEFECT' : 'refusal'}: a consumer active on ${GK} ^1.0.0 — ${GK} 2.0.0 with a migration description ${REPRO ? 'passes compatibility, is certified and activated' : 'fails contract compatibility (the consumer\'s requirement), its certification refused'}`, async () => {
    g = (await certifyCycle(geoDef(GK), null)).pkg;
    k = (await certifyCycle(dependent(KK, [{ package_key: GK, range: '^1.0.0' }]), null)).pkg;
    const next = bump(geoDef(GK), '2.0.0', 'the 2.0 line restates the corridor extension; consumers move to ^2.0.0 (SYNTHETIC)');
    const v = Number((await propose(owner, g, '2.0.0', next.manifest)).version['version']);
    const s = (await view(g)).sections[String(v)] as Record<string, Row>;
    for (const section of ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary']) await approve(spec, g, v, section, String((s[section] as Row)['digest']));
    // the actual function on the actual facts (the reviewer's method)
    const facts = (await pk.facts(rq(owner, 'domain.package.read', g), T(), D(), g, { payload: { version: v } }) as { facts: PackageFacts }).facts;
    const cc = contractCompatibility(facts);
    const run = (await conform(owner, g, v)).run;
    const ccRun = run.checks.find((c) => c['check'] === 'contract_compatibility') as Row;
    if (REPRO) {
      expect(cc.passed, cc.findings.join('; ')).toBe(true);
      expect(run['passed'], JSON.stringify(run.checks)).toBe(true);
      await certify(spec2, g, v);
      await activate(owner, g, v);
      expect(await activeOf(g)).toBe(2);
      expect(await activeOf(k)).toBe(1);   // the consumer still requires ^1.0.0 — its requirement silently broken
      return;
    }
    expect(cc.passed).toBe(false);
    expect(cc.findings.join('; ')).toMatch(new RegExp(`the active ${KK} 1\\.0\\.0 requires ${GK} \\^1\\.0\\.0; 2\\.0\\.0 does not satisfy it`));
    expect(run['passed']).toBe(false);
    expect(ccRun['passed']).toBe(false);
    const before = await footprint(g);
    await refused(certify(spec2, g, v), /^domain package rejected \(conformance\): the last certification run of version 2 .* did not pass \(failed: contract_compatibility\)/, 422);
    expect(await footprint(g)).toEqual(before);
    expect(await activeOf(g)).toBe(1);
  });

  it('refusal at the port (the SQL boundary, independent of the TypeScript suite): a run recorded as passing on facts that omit the requirement is still refused at certification', async () => {
    if (REPRO) return;
    // the run the 0111 suite would have recorded: every check passed — the port re-validates the facts at the effect and refuses
    const checks = [{ check: 'contract_compatibility', passed: true, severity: 'blocking', findings: [] }];
    const runId = uuidv7();
    await svc['write'](h.env(owner, 'domain.package.conformance', 'DPG', g, 'intelligence'), owner, T(), D(), 'domain.package.conformance', 'DPG', g, async (cap: never) => ({
      result: await (cap as { recordRun: (a: Row) => Promise<Row> }).recordRun({ runId, packageId: g, tenantId: T(), domainId: D(), version: 2, mode: 'certification', suiteVersion: 'conformance/1', checks,
        factsDigest: 'a'.repeat(64), factsReadAt: new Date(Date.now() - 1000).toISOString(), actor: owner.principalId, correlationId: uuidv7() }) }));
    const before = await footprint(g);
    await refused(certify(spec2, g, 2), new RegExp(`^domain package rejected \\(stale\\): .*the active ${KK} 1\\.0\\.0 requires ${GK} \\^1\\.0\\.0; 2\\.0\\.0 does not satisfy it`), 409);
    expect(await footprint(g)).toEqual(before);
  });

  it('recovery: the consumer widens its range (^1.0.0 || ^2.0.0, certified and activated against 1.0.0); the re-run of 2.0.0 passes, it is certified and activated — 1.0.0 superseded, the consumer\'s requirement holds', async () => {
    if (REPRO) return;
    await certifyCycle(dependent(KK, [{ package_key: GK, range: '^1.0.0 || ^2.0.0' }], '1.1.0'), k, { ontology: false });
    expect(await activeOf(k)).toBe(2);
    expect((await conform(owner, g, 2)).run['passed']).toBe(true);
    await certify(spec2, g, 2);
    expect((await activate(owner, g, 2)).version).toMatchObject({ state: 'active', supersedes: 1 });
    expect((await gate(KK, 'watch')).gate).toMatchObject({ state: 'active' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('F2 · the validation-to-effect boundary at certification and activation (rights withdrawn, a model quarantined); the prior active version preserved', () => {
  const PK = `f2geo-${RUN}`;
  let p = ''; let def: PackageDefinition;
  it(`${REPRO ? 'DEFECT' : 'refusal'}: the run passes, then the sanctions source's rights are WITHDRAWN — certification ${REPRO ? 'admitted on the saved run' : 'refused (stale), nothing changed'}`, async () => {
    def = geoDef(PK, { sanctions: SRC['sanc2']!.key, method: 'holt_winters@1' });
    p = (await certifyCycle(def, null)).pkg;
    const v = await passRun(bump(def, '1.1.0'), p, { ontology: false });
    expect(v).toBe(2);
    await rights(SRC['sanc2']!.sourceId, 'withdrawn');
    if (REPRO) { await certify(spec2, p, 2); expect((await one(sql`select state from domain.package_versions where package_id = ${p}::uuid and version = 2`))['state']).toBe('certified'); return; }
    const ec = (await pk.facts(rq(owner, 'domain.package.read', p), T(), D(), p, { payload: { version: 2 } }) as { effect_check: Row[] }).effect_check;
    expect(ec.map((x) => x['finding'])).toEqual([expect.stringMatching(/contract v1 is suspended, not active/), expect.stringMatching(/rights are withdrawn, not confirmed/)]);
    expect(ec.every((x) => x['kind'] === 'source' && JSON.stringify(x['functions']) === '["assess","event"]')).toBe(true);
    const before = await footprint(p);
    await refused(certify(spec2, p, 2), new RegExp(`^domain package rejected \\(stale\\): the facts the certification run .* measured no longer hold — source b33f-sanc2-${RUN} contract v1 is suspended, not active; source b33f-sanc2-${RUN} rights are withdrawn, not confirmed`), 409);
    expect(await footprint(p)).toEqual(before);
  });

  it('recovery: the rights confirmed again and the contract re-activated — the same passing run certifies', async () => {
    if (REPRO) return;
    await rights(SRC['sanc2']!.sourceId, 'confirmed'); await transition(SRC['sanc2']!.sourceId, 'active');
    expect((await certify(spec2, p, 2)).version).toMatchObject({ state: 'certified' });
  });

  it(`${REPRO ? 'DEFECT' : 'refusal'}: certified, then the forecast method holt_winters@1 QUARANTINED — activation ${REPRO ? 'admitted (DPG active, v1 superseded)' : 'refused (stale): no DPG admitted, v1 stays active, v2 stays certified, no migration or item touched'}`, async () => {
    await methodAct('quarantine', 'holt_winters@1');
    if (REPRO) { await activate(owner, p, 2); expect(await activeOf(p)).toBe(2); return; }
    const before = await footprint(p);
    await refused(activate(owner, p, 2), /^domain package rejected \(stale\): .*forecast method holt_winters@1 is quarantined \(B33-F: the method is under review/, 409);
    expect(await footprint(p)).toEqual(before);
    expect(await activeOf(p)).toBe(1);
    expect((await gate(PK, 'assess')).gate).toMatchObject({ state: 'active', package_version: 1 });
  });

  it('recovery: the method reinstated by its steward — the owner activates 2: v1 superseded, the DPG active object admitted', async () => {
    if (REPRO) return;
    await methodAct('reinstate', 'holt_winters@1');
    const before = Number((await footprint(p))['dpg']);
    expect((await activate(owner, p, 2)).version).toMatchObject({ state: 'active', supersedes: 1 });
    expect(Number((await footprint(p))['dpg'])).toBe(before + 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('F3 · a REQUIRED package changed or retired between the dependent\'s run and its activation', () => {
  const GK = `f3geo-${RUN}`; const KK = `f3sup-${RUN}`; const KK2 = `f3sup2-${RUN}`;
  let g = ''; let k = ''; let k2 = '';
  it(`${REPRO ? 'DEFECT' : 'refusal'}: the dependent (requires ${GK} ^1.0.0) passes and is certified; ${GK} 2.0.0 is activated — the dependent's activation ${REPRO ? 'admitted' : 'refused (stale)'}`, async () => {
    g = (await certifyCycle(geoDef(GK), null)).pkg;
    k = String((await declare(owner, dependent(KK, []))).package['package_id']);
    await passRun(dependent(KK, [{ package_key: GK, range: '^1.0.0' }]), k);
    await certify(spec2, k, 1);
    await certifyCycle(bump(geoDef(GK), '2.0.0', 'the 2.0 line restates the corridor extension (SYNTHETIC)'), g, { ontology: false });
    if (REPRO) { await activate(owner, k, 1); expect(await activeOf(k)).toBe(1); return; }
    const before = await footprint(k);
    await refused(activate(owner, k, 1), new RegExp(`^domain package rejected \\(stale\\): .*requires ${GK} \\^1\\.0\\.0; the active version is 2\\.0\\.0`), 409);
    expect(await footprint(k)).toEqual(before);
  });

  it(`${REPRO ? 'DEFECT' : 'refusal'}: a second dependent (requires ${GK} ^2.0.0) certified; ${GK} RETIRED — its activation ${REPRO ? 'admitted' : 'refused (stale)'}`, async () => {
    k2 = String((await declare(owner, dependent(KK2, []))).package['package_id']);
    await passRun(dependent(KK2, [{ package_key: GK, range: '^2.0.0' }]), k2);
    await certify(spec2, k2, 1);
    await retire(owner, g);
    if (REPRO) { await activate(owner, k2, 1); expect(await activeOf(k2)).toBe(1); return; }
    const before = await footprint(k2);
    await refused(activate(owner, k2, 1), new RegExp(`^domain package rejected \\(stale\\): .*requires ${GK} \\^2\\.0\\.0, which is not active in this domain`), 409);
    expect(await footprint(k2)).toEqual(before);
  });

  it('recovery: the dependent withdraws the version and activates one without the requirement (a governed migration)', async () => {
    if (REPRO) return;
    await withdraw(owner, k, 1);
    await certifyCycle(dependent(KK, [], '1.1.0'), k, { ontology: false });
    expect(await activeOf(k)).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('F4 · re-enablement re-validates the current facts, not only the saved passing health run', () => {
  const PK = `f4geo-${RUN}`;
  let p = ''; let def: PackageDefinition;
  it(`${REPRO ? 'DEFECT' : 'refusal'}: assess/event disabled (source suspended), repaired, the health re-run passes — the source SUSPENDED AGAIN; re-enablement ${REPRO ? 'admitted on the saved run' : 'refused, the functions stay disabled, the migration stays open'}`, async () => {
    def = geoDef(PK, { sanctions: SRC['sanc4']!.key });
    p = (await certifyCycle(def, null)).pkg;
    await transition(SRC['sanc4']!.sourceId, 'suspended');
    expect((await health(spec, p)).health).toMatchObject({ recorded: true, newly_disabled: ['assess', 'event'] });
    await transition(SRC['sanc4']!.sourceId, 'active');
    expect((await health(spec, p)).health).toMatchObject({ recorded: true, passed: true });
    await transition(SRC['sanc4']!.sourceId, 'suspended');
    if (REPRO) { expect((await enable(spec, p, 1, { functions: ['assess', 'event'] })).enabled).toMatchObject({ disabled_functions: {} }); return; }
    const before = await footprint(p);
    await refused(enable(spec, p, 1, { functions: ['assess', 'event'] }), new RegExp(`^domain package rejected \\(health\\): the current facts still find function assess incompatible: source b33f-sanc4-${RUN} contract v1 is suspended, not active`), 422);
    expect(await footprint(p)).toEqual(before);
    expect((await gate(PK, 'assess')).gate).toMatchObject({ state: 'disabled' });
  });

  it('recovery: the source re-activated — the specialist re-enables on the passing run, the migration completes', async () => {
    if (REPRO) return;
    await transition(SRC['sanc4']!.sourceId, 'active');
    const e = (await enable(spec, p, 1, { functions: ['assess', 'event'] })).enabled;
    expect(e).toMatchObject({ disabled_functions: {} });
    expect(arr((await view(p)).migrations).every((m) => m['state'] === 'completed')).toBe(true);
  });

  it(`${REPRO ? 'DEFECT' : 'refusal'}: the namespace's ontology superseded (conflict exposed), restored (the re-run passes), superseded AGAIN — clearing the conflict ${REPRO ? 'admitted' : 'refused; recovery: restored, cleared'}`, async () => {
    if (REPRO) await transition(SRC['sanc4']!.sourceId, 'active');   // the repro left the source suspended (re-enabled on the saved run)
    const other = structuredClone(def.manifest); other.ontology_extension.predicates.push({ predicate: 'escorts', subject_types: ['state_actor'], object_types: ['maritime_corridor'] });
    await ontologyFor(other);
    expect((await health(spec, p)).health).toMatchObject({ conflict_exposed: true });
    await ontologyFor(def.manifest);
    expect((await health(spec, p)).health).toMatchObject({ recorded: true, passed: true });
    await ontologyFor(other);
    if (REPRO) { expect((await enable(spec, p, 1, { clearConflict: true })).enabled).toMatchObject({ conflict: null }); return; }
    const before = await footprint(p);
    await refused(enable(spec, p, 1, { clearConflict: true }), /^domain package rejected \(health\): the current facts still find the conflict: namespace pkg:f4geo-.* — the active ontology v\d+ holds predicates/, 422);
    expect(await footprint(p)).toEqual(before);
    await ontologyFor(def.manifest);
    expect((await enable(spec, p, 1, { clearConflict: true })).enabled).toMatchObject({ conflict: null, disabled_functions: {} });
    expect((await gate(PK, null)).gate).toMatchObject({ state: 'active' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
const HOLD_MS = 2500;
async function hold(table: 'domain.package_events' | 'observation.source_contract_events', when: string) {
  await sql.raw(`create or replace function public.b33f_hold() returns trigger language plpgsql as $f$ begin perform pg_sleep(${HOLD_MS / 1000}); return null; end $f$`).execute(h.su);
  await sql.raw(`drop trigger if exists b33f_hold on ${table}`).execute(h.su);
  await sql.raw(`create trigger b33f_hold after insert on ${table} for each row when (${when}) execute function public.b33f_hold()`).execute(h.su);
}
async function unhold(table: string) { await sql.raw(`drop trigger if exists b33f_hold on ${table}`).execute(h.su); }
/** waits until a backend is inside the hold (pg_sleep), so the first session holds its locks when the second starts */
async function sleeping(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (Number((await one(sql`select count(*)::int as n from pg_stat_activity where state = 'active' and wait_event = 'PgSleep'`))['n']) > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the first session never reached the hold');
}
const timed = async <T>(p: Promise<T>): Promise<{ ok: boolean; value: T | null; error: unknown; at: number }> =>
  p.then((value) => ({ ok: true, value, error: null, at: Date.now() }), (error: unknown) => ({ ok: false, value: null, error, at: Date.now() }));

describe('F5 · two sessions: the boundary holds under concurrency', () => {
  it(`${REPRO ? 'DEFECT' : 'serialized'}: session A activates the consumer (requires ^1.0.0) and holds its transaction; session B activates the provider 2.0.0 — ${REPRO ? 'B commits while A is open: both active, the requirement broken' : 'B waits for A, then is refused (the consumer now active requires ^1.0.0)'}`, async () => {
    const GK = `f5geo-${RUN}`; const KK = `f5sup-${RUN}`;
    const g = (await certifyCycle(geoDef(GK), null)).pkg;
    const k = String((await declare(owner, dependent(KK, []))).package['package_id']);
    await passRun(dependent(KK, [{ package_key: GK, range: '^1.0.0' }]), k); await certify(spec2, k, 1);
    await passRun(bump(geoDef(GK), '2.0.0', 'the 2.0 line restates the corridor extension (SYNTHETIC)'), g, { ontology: false }); await certify(spec2, g, 2);
    await hold('domain.package_events', `NEW.package_id = '${k}'::uuid AND NEW.event = 'version.activated'`);
    try {
      const a = timed(activate(owner, k, 1));
      await sleeping();
      const started = Date.now();
      const b = await timed(activate(owner, g, 2));
      const ar = await a;
      expect(ar.ok, String(ar.error)).toBe(true);
      if (REPRO) {
        expect(b.ok, String(b.error)).toBe(true);
        expect(b.at).toBeLessThan(ar.at);   // B never waited for A
        expect([await activeOf(g), await activeOf(k)]).toEqual([2, 1]);
        return;
      }
      expect(b.ok).toBe(false);
      expect(b.at).toBeGreaterThanOrEqual(ar.at);   // B waited for A's commit
      expect(b.at - started).toBeGreaterThan(HOLD_MS / 2);
      const r = await refusal(Promise.reject(b.error));
      expect(r.message).toMatch(new RegExp(`^domain package rejected \\(stale\\): .*the active ${KK} 1\\.0\\.0 requires ${GK} \\^1\\.0\\.0; 2\\.0\\.0 does not satisfy it`));
      expect([await activeOf(g), await activeOf(k)]).toEqual([1, 1]);
      expect(Number((await one(sql`select count(*)::int as n from objects.canonical_objects where object_type = 'DPG' and object_id = ${g}::uuid and payload ->> 'state' = 'active' and (payload ->> 'version')::int = 2`))['n'])).toBe(0);
    } finally { await unhold('domain.package_events'); }
  });

  it(`${REPRO ? 'DEFECT' : 'serialized'}: session W withdraws a source's rights and holds its transaction; session A activates the package that names the source — ${REPRO ? 'A commits on the old rights while W is open' : 'A waits for W, then is refused on the withdrawn rights'}`, async () => {
    const PK = `f5geo2-${RUN}`;
    const def = geoDef(PK, { sanctions: SRC['sanc5']!.key });
    const p = (await certifyCycle(def, null)).pkg;
    await passRun(bump(def, '1.1.0'), p, { ontology: false }); await certify(spec2, p, 2);
    const sid = SRC['sanc5']!.sourceId;
    await hold('observation.source_contract_events', `NEW.source_id = '${sid}'::uuid AND NEW.details ->> 'rights_state' = 'withdrawn'`);
    try {
      const wr = timed(rights(sid, 'withdrawn'));
      await sleeping();
      const a = await timed(activate(owner, p, 2));
      const wres = await wr;
      expect(wres.ok, String(wres.error)).toBe(true);
      if (REPRO) {
        expect(a.ok, String(a.error)).toBe(true);
        expect(a.at).toBeLessThan(wres.at);
        expect(await activeOf(p)).toBe(2);
        return;
      }
      expect(a.ok).toBe(false);
      expect(a.at).toBeGreaterThanOrEqual(wres.at);
      const r = await refusal(Promise.reject(a.error));
      expect(r.message).toMatch(new RegExp(`^domain package rejected \\(stale\\): .*source b33f-sanc5-${RUN} rights are withdrawn, not confirmed`));
      expect(await activeOf(p)).toBe(1);
    } finally { await unhold('observation.source_contract_events'); }
    if (!REPRO) {
      // recovery: the rights confirmed and the contract re-activated — the activation goes through
      await rights(sid, 'confirmed'); await transition(sid, 'active');
      expect((await activate(owner, p, 2)).version).toMatchObject({ state: 'active', supersedes: 1 });
    }
  });

  it('unchanged facts: the ordinary path is unaffected — a package with nothing changed certifies and activates (positive control)', async () => {
    const PK = `f5ok-${RUN}`;
    const { pkg } = await certifyCycle(geoDef(PK), null);
    expect(await activeOf(pkg)).toBe(1);
    expect((await gate(PK, 'assess')).gate).toMatchObject({ state: 'active' });
  });
});
