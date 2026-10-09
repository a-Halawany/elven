/**
 * CP-6 B33 §PK (migration 0111 §PK) — THE DOMAIN-PACKAGE FRAMEWORK, THE FOUR PACKAGES, WS-10, on a real database through the real pipeline,
 * ports and controllers. Every figure, source, record, entity and persona here is SYNTHETIC fixture data (the sources are upload fixtures
 * named after the roles real feeds play; their contracts say `synthetic`) — the harness proves the SOFTWARE; a public feed would
 * demonstrate it on eye_demo, and a licensed provider is what a real-provider acceptance needs (said per package by the definitions).
 *
 *   PK1 · declare / version: the manifest's form, the DPG object per version, the certification-pending item routed (refusals: duplicate,
 *         ownership, manifest, semver, an open version; recovery: the open version withdrawn, the next proposed).
 *   PK2 · per-section specialist certification (the ontology section through the graph's own gate — two keys), certify, activate
 *         (refusals: SoD, the agent at the PEP and at the port, a stale digest, the ontology before the steward, open sections, no run,
 *         activation by a non-owner; recovery: a rejected section re-approved, certified, activated, the item closed).
 *   PK3 · the conformance suite: measured checks; a non-conforming manifest fails and certification is refused; the agent's run is
 *         diagnostic (its certification run refused); recovery: withdrawn, a conforming version certified.
 *   PK4 · health: the fault exercise — a source suspended → the INCOMPATIBLE FUNCTION disabled (reads keep working), the migration routed;
 *         the ontology namespace superseded → the conflict exposed; refusals: re-enable before the cause is repaired, by a non-specialist;
 *         recovery: repaired, the re-run passes, the specialist re-enables, the migration completes, the items close; the after-tick hook
 *         started and bounded, one in flight.
 *   PK5 · assessments (versioned, source diversity measured, approved / limited, DAS, as-of replay), watchlists, events, alerts (raised
 *         `domain.alert` under the published policy, adjudicated, resolved), links to exposures / forecasts / scenarios / indicators; every
 *         write consults the PACKAGE_GATE seam.
 *   PK6 · the four packages, each with its acceptance focus MEASURED (geopolitical indicator set; technology evidence diversity and horizon
 *         evaluation; cyber security scope and false-positive analysis; financial entitlement, timing, calculation) — refusal and recovery.
 *   PK7 · the workspace's reads: the package list, the package view (scope, portfolio, evidence and assessments, options and monitoring),
 *         the gate per function (a disabled extension shown disabled with its reason).
 *   PKJ · the cross-domain journey: competitor + supply_chain + geopolitical packages; the supply package REQUIRES the geopolitical one —
 *         the geopolitical package retired → the supply package's conflict exposed by health (every function conflicted).
 *   PKE · the `domain.` entitlement on a CONTRACTED tenant (runs LAST: it contracts the harness tenant).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { Db } from '../../src/shared/db.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { PackagesController } from '../../src/domains/packages/packages.controller.js';
import { PackagesService } from '../../src/domains/packages/packages.service.js';
import { cyberPackage, financialPackage, geopoliticalPackage, technologyPackage, type PackageDefinition } from '../../src/domains/packages/definitions.js';
import type { Manifest } from '../../src/domains/packages/manifest.js';
import type { EntitlementsVendorController } from '../../src/commercial/entitlements/entitlements.controller.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let pk: PackagesController; let svc: PackagesService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let owner: AuthenticatedPrincipal;      // strategy_owner — the packages' owner (J. Weber's role)
let otherOwner: AuthenticatedPrincipal; // strategy_owner — not the owner
let riskOwner: AuthenticatedPrincipal;  // risk_owner
let spec: AuthenticatedPrincipal; let spec2: AuthenticatedPrincipal;   // domain_specialist ×2
let steward: AuthenticatedPrincipal;    // ontology_steward
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal;   // domain_analyst
let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
let agent: AuthenticatedPrincipal;      // the Domain Intelligence Agent's role, an agent in the database
let machineSpec: AuthenticatedPrincipal;// an AGENT in the database holding domain_specialist + domain_analyst whose session claims a human (the PEP passes, the PORT refuses)
let attentionAgent: AuthenticatedPrincipal;
let outsider: AuthenticatedPrincipal;   // no domain role

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const dbNow = async () => String((await one(sql`select clock_timestamp()::text as n`))['n']);
const today = async () => String((await one(sql`select (clock_timestamp() at time zone 'UTC')::date::text as d`))['d']);

// ── the routes (in process) ──────────────────────────────────────────────────────────────────────
const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'DPG', id, 'intelligence');
const declare = (as: AuthenticatedPrincipal, def: PackageDefinition, key = def.key) =>
  pk.declare(rq(as, 'domain.package.declare'), T(), D(), { payload: { key, kind: def.kind, title: def.title, owner: as.principalId } }) as Promise<{ package: Row }>;
const propose = (as: AuthenticatedPrincipal, pkg: string, semver: string, manifest: unknown) =>
  pk.propose(rq(as, 'domain.package.version', pkg), T(), D(), pkg, { payload: { semver, manifest: manifest as Row } }) as Promise<{ version: Row }>;
const view = (pkg: string, as: AuthenticatedPrincipal = owner) => pk.read(rq(as, 'domain.package.read', pkg), T(), D(), pkg) as Promise<Row & { versions: Row[]; sections: Record<string, Record<string, Row>>; gates: Record<string, Row>; runs: Row[]; migrations: Row[]; items: Row[]; alerts: Row[]; assessments: Row[]; watchlists: Row[]; links: Row[]; ledger: Row[] }>;
const approve = (as: AuthenticatedPrincipal, pkg: string, version: number, section: string, digest: string, decision = 'approved', validDays = 365) =>
  pk.approve(rq(as, 'domain.package.approve', pkg), T(), D(), pkg, { payload: { version, section, digest, decision, reason: `the ${section} section reviewed by the specialist (SYNTHETIC)`, validDays } }) as Promise<{ approval: Row }>;
const conform = (as: AuthenticatedPrincipal, pkg: string, version: number, mode = 'certification') =>
  pk.conformance(rq(as, 'domain.package.conformance', pkg), T(), D(), pkg, { payload: { version, mode } }) as Promise<{ run: Row & { checks: Row[] } }>;
const certify = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.certify(rq(as, 'domain.package.certify', pkg), T(), D(), pkg, String(version), { payload: { reason: 'every section approved and the suite passed (SYNTHETIC review)' } }) as Promise<{ version: Row }>;
const activate = (as: AuthenticatedPrincipal, pkg: string, version: number) => pk.activate(rq(as, 'domain.package.activate', pkg), T(), D(), pkg, String(version)) as Promise<{ version: Row }>;
const withdraw = (as: AuthenticatedPrincipal, pkg: string, version: number) =>
  pk.withdrawVersion(rq(as, 'domain.package.withdraw', pkg), T(), D(), pkg, String(version), { payload: { reason: 'the version does not conform; a corrected one follows' } }) as Promise<{ version: Row }>;
const health = (as: AuthenticatedPrincipal, pkg: string) => pk.health(rq(as, 'domain.package.health', pkg), T(), D(), pkg) as Promise<{ health: Row }>;
const enable = (as: AuthenticatedPrincipal, pkg: string, version: number, payload: Row) =>
  pk.enable(rq(as, 'domain.package.enable', pkg), T(), D(), pkg, String(version), { payload: { reason: 'the cause is repaired and the health re-run passed', ...payload } }) as Promise<{ enabled: Row }>;
const acceptance = (as: AuthenticatedPrincipal, pkg: string) => pk.acceptance(rq(as, 'domain.package.acceptance', pkg), T(), D(), pkg) as Promise<{ run: Row & { checks: Row[] } }>;
const proposeA = (as: AuthenticatedPrincipal, payload: Row) => pk.proposeAssessment(rq(as, 'domain.assessment.propose'), T(), D(), { payload }) as Promise<{ assessment: Row }>;
const decideA = (as: AuthenticatedPrincipal, id: string, version: number, decision = 'approve') =>
  pk.decideAssessment(h.req(as, 'domain.assessment.approve', 'DAS', id, 'intelligence'), T(), D(), id, { payload: { version, decision, note: `the ${decision} of version ${version}, read against its evidence` } }) as Promise<{ assessment: Row }>;
const limitA = (as: AuthenticatedPrincipal, id: string) => pk.limitAssessment(h.req(as, 'domain.assessment.limit', 'DAS', id, 'intelligence'), T(), D(), id, { payload: { reason: 'an analyst challenge: one publisher is correlated with another' } }) as Promise<{ assessment: Row }>;
const readA = (as: AuthenticatedPrincipal, id: string, asOf?: string) => pk.readAssessment(h.req(as, 'domain.package.read', 'DAS', id, 'intelligence'), T(), D(), id, { payload: asOf === undefined ? {} : { asOf } }) as Promise<{ versions: Row[]; as_of: Row | null }>;
const watch = (as: AuthenticatedPrincipal, payload: Row) => pk.declareWatchlist(rq(as, 'domain.watchlist.declare'), T(), D(), { payload }) as Promise<{ watchlist: Row }>;
const retireW = (as: AuthenticatedPrincipal, id: string) => pk.retireWatchlist(rq(as, 'domain.watchlist.retire'), T(), D(), id, { payload: { reason: 'the watchlist is no longer needed (SYNTHETIC)' } }) as Promise<{ watchlist: Row }>;
const resolveW = (as: AuthenticatedPrincipal, id: string) => pk.resolveAlerts(rq(as, 'domain.alert.resolve'), T(), D(), id, { payload: { reason: 'seen; the response is decided in the decision layer' } }) as Promise<{ resolution: Row }>;
const recordE = (as: AuthenticatedPrincipal, payload: Row) => pk.recordEvent(rq(as, 'domain.event.record'), T(), D(), { payload }) as Promise<{ event: Row }>;
const confirmE = (as: AuthenticatedPrincipal, id: string, decision = 'confirm') => pk.confirmEvent(rq(as, 'domain.event.confirm'), T(), D(), id, { payload: { decision, note: `the event ${decision}ed against its evidence` } }) as Promise<{ event: Row & { alerts: Row[] } }>;
const adjudicate = (as: AuthenticatedPrincipal, id: string, adjudication: string) => pk.adjudicate(rq(as, 'domain.alert.adjudicate'), T(), D(), id, { payload: { adjudication, note: `adjudicated ${adjudication} after review` } }) as Promise<{ alert: Row }>;
const link = (as: AuthenticatedPrincipal, payload: Row) => pk.declareLink(rq(as, 'domain.link.declare'), T(), D(), { payload: { note: 'the package references this object of the core', ...payload } }) as Promise<{ link: Row }>;
const unlink = (as: AuthenticatedPrincipal, id: string) => pk.withdrawLink(rq(as, 'domain.link.withdraw'), T(), D(), id, { payload: { reason: 'the reference is no longer relevant' } }) as Promise<{ link: Row }>;
const gate = (key: string, fn: string | null) => pk.gate(rq(owner, 'domain.package.read'), T(), D(), { payload: { packageKey: key, function: fn } }) as Promise<{ gate: Row }>;

// ── fixtures: sources with distinct publishers (SYNTHETIC upload contracts), evidence, entities ─────────────
const PURPOSES = ['observation', 'corridor monitoring', 'discovery', 'cost exposure', 'structural context'];
const SRC: Record<string, { sourceId: string; key: string }> = {};
async function source(label: string, publisher: string, purposes = PURPOSES): Promise<{ sourceId: string; key: string }> {
  const key = `b33pk-${label}-${RUN}`;
  const c = uploadContract(key) as Row;
  const contract = { ...c, name: `${label} records (SYNTHETIC)`, publisher, authority_and_rights: { ...(c['authority_and_rights'] as Row), purposes } };
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const r = await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(), { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  for (const [action, act] of [['observation.source.approve', 'approve'], ['observation.source.transition', 'active']] as const) {
    await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => {
        if (act === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B33 §PK fixture source', eventId: uuidv7(), correlationId: uuidv7() });
        else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: 'active', reason: 'B33 §PK fixture source: active', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
      });
  }
  const connector = new UploadConnector([]); const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() }, 'observation.agent.register', agentId, async (tx) => {
    await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
      ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
  });
  return { sourceId, key };
}
type Cite = { kind: 'evidence'; id: string; version: number; digest: string };
async function upload(s: { sourceId: string }, files: Array<{ filename: string; text: string; documentTime?: string | null }>): Promise<Cite[]> {
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  await h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
    { payload: { sourceId: s.sourceId, contractVersion: 1, files: files.map((f) => ({ filename: f.filename, mediaType: 'text/csv', base64: Buffer.from(f.text, 'utf8').toString('base64'), documentTime: f.documentTime ?? null })) } });
  const out: Cite[] = [];
  for (const f of files) {
    const itemKey = `upload:${f.filename}@${createHash('sha256').update(Buffer.from(f.text, 'utf8')).digest('hex').slice(0, 16)}`;
    const r = (await sql<{ id: string; version: number; digest: string }>`select e.object_id::text id, e.object_version::int version, e.content_digest digest
        from objects.canonical_objects e join objects.canonical_objects o on o.object_type = 'OBS' and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
       where e.object_type = 'EVD' and e.tenant_id = ${T()}::uuid and o.tenant_id = ${T()}::uuid and o.payload ->> 'item_key' = ${itemKey}
       order by e.recorded_at desc limit 1`.execute(h.su)).rows[0];
    if (r === undefined) throw new Error(`upload of ${f.filename} admitted no evidence`);
    out.push({ kind: 'evidence', id: r.id, version: r.version, digest: r.digest });
  }
  return out;
}
const EV: Record<string, Cite[]> = {};
const E: Record<string, string> = {};
async function entity(name: string, type: string): Promise<string> {
  const id = uuidv7(); const c = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${c}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${owner.principalId}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${c}::uuid)`.execute(h.su);
  return id;
}
async function machine(roles: string[], label: string, claimKind: 'human' | 'agent', assurance: 'password' | 'agent_grant'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b33pk-${label}-${id.slice(-8)}`}, ${`b33pk-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claimKind, assurance, homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}

// ── the certification cycle (the act's path, the harness's helper) ───────────────────────────────────────
async function ontologyFor(m: Manifest): Promise<string> {
  const ns = m.ontology_extension.namespace;
  const types = [...new Set(m.ontology_extension.mappings.map((x) => x.maps_to))];
  const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(),
    { payload: { namespace: ns, entityTypes: types, predicates: m.ontology_extension.predicates as never, rationale: `the ${ns} extension of the package (SYNTHETIC)` } }) as { ontology: { version_id: string } };
  await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id,
    { payload: { decision: 'approve', reason: 'the extension maps onto the core types; no core predicate is redefined', reviews: { compatibility: 'passed', migration: 'passed', domain: 'passed' } } });
  return p.ontology.version_id;
}
async function sectionsOf(pkg: string, version: number): Promise<Record<string, Row>> { return (await view(pkg)).sections[String(version)] as Record<string, Row>; }
async function certifyCycle(def: PackageDefinition, pkg: string | null, opts: { ontology?: boolean } = {}): Promise<{ pkg: string; version: number }> {
  const id = pkg ?? String((await declare(owner, def)).package['package_id']);
  const v = Number((await propose(owner, id, def.semver, def.manifest)).version['version']);
  if (opts.ontology !== false) await ontologyFor(def.manifest);
  const s = await sectionsOf(id, v);
  for (const section of ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary']) await approve(spec, id, v, section, String((s[section] as Row)['digest']));
  const run = (await conform(owner, id, v)).run;
  expect(run['passed'], JSON.stringify(run['checks'])).toBe(true);
  await certify(spec2, id, v);
  await activate(owner, id, v);
  return { pkg: id, version: v };
}

let GEO: PackageDefinition; let TECH: PackageDefinition; let CYBER: PackageDefinition; let FIN: PackageDefinition;
let geo = ''; let tech = ''; let cyber = ''; let fin = '';
let fxSeries = ''; let fxIndicator = ''; let transitsSeries = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  pk = h.app.get(PackagesController); svc = h.app.get(PackagesService);
  owner = await h.humanWithSession(['strategy_owner'], 'b33pk-owner');
  otherOwner = await h.humanWithSession(['strategy_owner'], 'b33pk-other-owner');
  riskOwner = await h.humanWithSession(['risk_owner'], 'b33pk-risk-owner');
  spec = await h.humanWithSession(['domain_specialist'], 'b33pk-specialist');
  spec2 = await h.humanWithSession(['domain_specialist'], 'b33pk-specialist-2');
  steward = await h.humanWithSession(['ontology_steward'], 'b33pk-steward');
  analyst = await h.humanWithSession(['domain_analyst'], 'b33pk-analyst');
  analyst2 = await h.humanWithSession(['domain_analyst'], 'b33pk-analyst-2');
  dadmin = await h.humanWithSession(['domain_admin'], 'b33pk-dadmin');
  executive = await h.humanWithSession(['executive'], 'b33pk-executive');
  outsider = await h.humanWithSession(['simulation_operator'], 'b33pk-outsider');
  agent = await machine(['domain_intelligence_agent'], 'dia-agent', 'agent', 'agent_grant');
  machineSpec = await machine(['domain_specialist', 'domain_analyst'], 'machine-spec', 'human', 'password');
  attentionAgent = await machine(['attention_agent'], 'attention', 'agent', 'agent_grant');
  // the published attention policy: domain alerts to the strategy owner, package governance to the specialists and the administrator (SYNTHETIC)
  await w.exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B33 §PK harness: domain alerts to the strategy owner; package governance to the domain specialists and the administrator',
    rules: { classes: {
      'domain.alert': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
      'domain.package': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_specialist', 'domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  // the domain's CORE ontology (namespace `domain`): the core types and predicates a package may not redefine (proposed by an analyst, decided by the steward)
  { const p = await w.graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: ['organization', 'place', 'asset', 'product', 'vessel', 'route'],
      predicates: [{ predicate: 'transits' }, { predicate: 'carries' }, { predicate: 'depends_on' }], rationale: 'the domain core vocabulary (B33 §PK fixture)' } }) as { ontology: { version_id: string } };
    await w.graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', p.ontology.version_id, 'graph'), T(), D(), p.ontology.version_id, { payload: { decision: 'approve', reason: 'the core vocabulary of the domain (fixture)' } }); }
  // the risk taxonomy in force (published by the executive, activated by the administrator — B32/B34)
  const { ExposuresController } = await import('../../src/prediction/exposures/exposures.controller.js');
  const ex = h.app.get(ExposuresController);
  await ex.publishTaxonomy(h.req(executive, 'prediction.exposure.taxonomy.publish', 'RSK', null, 'prediction'), T(), D(), { payload: { expectedVersion: 0, reason: 'the domain taxonomy (B33 §PK fixture)',
    categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'market', label: 'Market', polarity: 'both' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }] } });
  await ex.activateTaxonomy(h.req(dadmin, 'prediction.exposure.taxonomy.activate', 'RSK', null, 'prediction'), T(), D(), { payload: { version: 1, reason: 'the taxonomy reviewed (B33 §PK fixture)' } });
  // the sources (distinct publishers; two contracts of one publisher — correlated) and their evidence
  const day = await today();
  for (const [label, publisher] of [['transits', 'Fixture transit publisher (SYNTHETIC)'], ['transits-mirror', 'Fixture transit publisher (SYNTHETIC)'], ['sanctions', 'Fixture sanctions publisher (SYNTHETIC)'],
                                    ['discovery', 'Fixture news discovery (SYNTHETIC)'], ['ais', 'Fixture AIS aggregator (SYNTHETIC)'], ['patents', 'Fixture patent office (SYNTHETIC)'],
                                    ['research', 'Fixture research index (SYNTHETIC)'], ['cti', 'Fixture CTI vendor (SYNTHETIC)'], ['assets', 'Fixture asset inventory (SYNTHETIC)'],
                                    ['fx', 'Fixture central bank (SYNTHETIC)'], ['macro', 'Fixture development bank (SYNTHETIC)'], ['filings', 'Fixture filings registry (SYNTHETIC)']] as const) {
    SRC[label] = await source(label, publisher);
    EV[label] = await upload(SRC[label] as { sourceId: string }, [
      { filename: `${label}-1-${RUN}.csv`, text: `record,value\n${label} one (SYNTHETIC),${RUN}\n`, documentTime: `${day}T00:00:00Z` },
      { filename: `${label}-2-${RUN}.csv`, text: `record,value\n${label} two (SYNTHETIC),${RUN}\n`, documentTime: `${day}T00:00:00Z` },
    ]);
  }
  // entities (SYNTHETIC)
  E['chokepoint'] = w.entityId;
  E['armed'] = await entity('Armed group in the southern Red Sea (SYNTHETIC)', 'organization');
  E['lab'] = await entity('Drive-train research lab (SYNTHETIC)', 'organization');
  E['plantA'] = await entity('Regensburg plant network (SYNTHETIC)', 'asset');
  E['plantB'] = await entity('Brno plant network (SYNTHETIC)', 'asset');
  E['office'] = await entity('Sales office laptop fleet (SYNTHETIC)', 'asset');
  E['issuer'] = await entity('Supplier holding AG (SYNTHETIC)', 'organization');
  // series on the fixture sources (registered through the prediction route) and an indicator on the fx series
  transitsSeries = `fixture:b33pk-transits-${RUN}`; fxSeries = `fixture:b33pk-fx-${RUN}`;
  for (const [key, src, unit] of [[transitsSeries, SRC['transits']!.key, 'transits/day'], [fxSeries, SRC['fx']!.key, 'USD per EUR']] as const) {
    await w.prediction.registerSeries(h.req(w.twinOwner, 'prediction.series.register', 'SER', null, 'prediction'), T(), D(),
      { payload: { seriesKey: key, sourceKey: src, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit, seasonalityDays: 7, attribution: 'Source: fixture (SYNTHETIC).', description: `the ${key} series of the B33 §PK harness (SYNTHETIC)` } });
  }
  fxIndicator = ((await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(),
    { payload: { seriesKey: fxSeries, description: 'EUR/USD below 1.00 for five days (SYNTHETIC)', comparator: '<', threshold: 1, consecutiveDays: 5, owner: w.twinOwner.principalId } })) as { indicator: { indicatorId: string } }).indicator.indicatorId;
  // the four definitions bound to this harness's sources (the defaults name eye_demo's registry)
  GEO = geopoliticalPackage({ key: `geo-${RUN}`, portwatch: SRC['transits']!.key, sanctions: SRC['sanctions']!.key, gdelt: SRC['discovery']!.key, ais: SRC['ais']!.key, chokepointSeries: transitsSeries });
  TECH = technologyPackage({ key: `tech-${RUN}`, patents: SRC['patents']!.key, research: SRC['research']!.key, adoptionSeries: w.seriesKey, claim: 'validated' });
  CYBER = cyberPackage({ key: `cyber-${RUN}`, cti: SRC['cti']!.key, assets: SRC['assets']!.key, scopeEntities: [E['plantA']!, E['plantB']!] });
  FIN = financialPackage({ key: `fin-${RUN}`, ecb: SRC['fx']!.key, worldbank: SRC['macro']!.key, filings: SRC['filings']!.key, eurusdSeries: fxSeries, tamperCalculation: true });
}, 900_000);

afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK1 · declare and version: the manifest, the DPG object, the certification pending routed', () => {
  it('positive: the owner declares the geopolitical package and proposes 1.0.0 — DPG v1 (state proposed), the digests the port computed, the item routed to the specialists', async () => {
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'not_installed' });
    const d = (await declare(owner, GEO)).package;
    geo = String(d['package_id']);
    expect(d).toMatchObject({ package_key: GEO.key, domain_kind: 'geopolitical', owner_principal_id: owner.principalId, state: 'declared' });
    const v = (await propose(owner, geo, '1.0.0', GEO.manifest)).version;
    expect(v).toMatchObject({ version: 1, semver: '1.0.0', state: 'proposed', object_version: 1, dpg: { object_version: 1, schema_ref: 'DPG@v1' } });
    expect(v['manifest_digest']).toMatch(/^[0-9a-f]{64}$/);
    const dpg = await one(sql`select object_version, payload ->> 'state' as state, payload ->> 'manifest_digest' as md, jsonb_array_length(payload -> 'sections') as n, schema_ref
                              from objects.canonical_objects where object_type = 'DPG' and object_id = ${geo}::uuid`);
    expect(dpg).toMatchObject({ object_version: '1', state: 'proposed', md: v['manifest_digest'], n: 5, schema_ref: 'DPG@v1' });
    expect((v['item'] as Row)).toMatchObject({ state: 'open', route_roles: ['domain_specialist', 'domain_admin'], owner: owner.principalId, existing: false });
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'uncertified', reason: expect.stringMatching(/v1, is proposed/) });
  });

  it('refusal: a duplicate key (409), a version by a non-owner (403), a manifest outside its namespace (422), a semver that is not the release\'s (422), a second open version (409), an agent declaring (PDP 403)', async () => {
    await refused(declare(owner, GEO), /^domain package rejected \(duplicate\): package .* is already declared/, 409);
    await refused(propose(otherOwner, geo, '1.0.1', GEO.manifest), /^domain package rejected \(ownership\)/, 403);
    const bad = structuredClone(GEO.manifest); bad.ontology_extension.namespace = 'pkg:somebody-else';
    await refused(propose(owner, geo, '1.0.0', { ...bad, release: { ...bad.release, semver: '1.0.0' } }), /^domain package rejected \(manifest\): ontology_extension\.namespace is pkg:/, 422);
    await refused(propose(owner, geo, '1.0.1', GEO.manifest), /^domain package rejected \(manifest\): release\.semver names the version's semver \(1\.0\.1\)/, 422);
    await refused(propose(owner, geo, '1.1.0', { ...GEO.manifest, release: { ...GEO.manifest.release, semver: '1.1.0' } }), /^domain package rejected \(state\): version 1 \(proposed\) .* is still open/, 409);
    await refused(declare(agent, TECH), /./, 403);
    expect((await one(sql`select count(*)::int as n from domain.package_versions where package_id = ${geo}::uuid`))['n']).toBe(1);
  });

  it('recovery: the ledger records the declaration and the proposal; the package reads as declared with its open version', async () => {
    const vw = await view(geo);
    expect(vw.package).toMatchObject({ package_key: GEO.key, state: 'declared' });
    expect(vw.versions.map((x) => x['state'])).toEqual(['proposed']);
    expect(vw.ledger.map((x) => x['event']).sort()).toEqual(['package.declared', 'version.proposed']);
    expect(vw.boundary).toMatch(/B77.*B78.*B112.*B111.*R2/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK2 · per-section specialist certification (the ontology through the graph\'s own gate), certify, activate', () => {
  let s: Record<string, Row> = {};
  it('refusal: the proposer, a non-specialist (PDP), an agent (PEP), an agent holding the role (PORT), a stale digest, the ontology before the steward, certification with open sections', async () => {
    s = await sectionsOf(geo, 1);
    const dg = (x: string) => String((s[x] as Row)['digest']);
    expect(Object.keys(s).sort()).toEqual(['assessment', 'escalation', 'methodology', 'ontology', 'use_boundary']);
    expect(Object.values(s).every((x) => x['state'] === 'open')).toBe(true);
    const ownerSpec = await h.humanWithSession(['strategy_owner', 'domain_specialist'], 'b33pk-owner-spec');
    const d2 = (await declare(ownerSpec, TECH, `sod-${RUN}`)).package; const sod = String(d2['package_id']);
    await propose(ownerSpec, sod, TECH.semver, { ...TECH.manifest, ontology_extension: { ...TECH.manifest.ontology_extension, namespace: `pkg:sod-${RUN}` } });
    const sodDigest = String(((await sectionsOf(sod, 1))['methodology'] as Row)['digest']);
    await refused(approve(ownerSpec, sod, 1, 'methodology', sodDigest), /^domain package rejected \(separation_of_duties\): the proposer of version 1 does not certify its sections/, 403);
    await withdraw(ownerSpec, sod, 1);
    await refused(approve(analyst, geo, 1, 'methodology', dg('methodology')), /./, 403);
    await refused(approve({ ...spec, kind: 'agent', assurance: 'agent_grant' } as AuthenticatedPrincipal, geo, 1, 'methodology', dg('methodology')), /human gate: domain\.package\.approve requires a named human principal/, 403);
    await refused(approve(machineSpec, geo, 1, 'methodology', dg('methodology')), /^domain package rejected \(actor\): a section is certified by a named human domain specialist; an agent or a system never certifies/, 403);
    await refused(approve(spec, geo, 1, 'methodology', 'f'.repeat(64)), /^domain package rejected \(stale\): the methodology section of version 1 is at digest/, 409);
    await refused(approve(spec, geo, 1, 'ontology', dg('ontology')), /^domain package rejected \(ontology\): namespace pkg:geo-.* has no active ontology version — the ontology steward decides its proposal/, 422);
    await refused(certify(spec2, geo, 1), /^domain package rejected \(sections\): every section is approved/, 422);
  });

  it('positive: the steward decides the namespace\'s ontology (the second key), the specialist approves the five sections at their digests, the suite passes, a second specialist certifies, the owner activates (DPG v2 active)', async () => {
    const dg = (x: string) => String((s[x] as Row)['digest']);
    const ontId = await ontologyFor(GEO.manifest);
    const ont = await approve(spec, geo, 1, 'ontology', dg('ontology'));
    expect(ont.approval).toMatchObject({ section: 'ontology', decision: 'approved', ontology_version_id: ontId, approver_principal_id: spec.principalId });
    await approve(spec, geo, 1, 'methodology', dg('methodology'));
    await approve(spec, geo, 1, 'assessment', dg('assessment'), 'rejected');
    await refused(certify(spec2, geo, 1), /^domain package rejected \(sections\): .*assessment=rejected/, 422);
    await approve(spec2, geo, 1, 'assessment', dg('assessment'));   // the rejection answered: approved again at the same digest
    await approve(spec, geo, 1, 'escalation', dg('escalation'));
    await refused(certify(spec2, geo, 1), /^domain package rejected \(sections\): .*use_boundary=open/, 422);
    await approve(spec, geo, 1, 'use_boundary', dg('use_boundary'), 'approved', 180);
    await refused(certify(spec2, geo, 1), /^domain package rejected \(conformance\): version 1 has no certification run/, 422);
    const run = (await conform(owner, geo, 1)).run;
    expect(run).toMatchObject({ mode: 'certification', passed: true, suite_version: 'conformance/1', run_by_kind: 'human' });
    await refused(activate(owner, geo, 1), /^domain package rejected \(state\): version 1 is proposed; a certified version is activated/, 409);
    const c = (await certify(spec2, geo, 1)).version;
    expect(c).toMatchObject({ state: 'certified', certified_by: spec2.principalId, closed_items: [expect.any(String)] });
    await refused(activate(otherOwner, geo, 1), /^domain package rejected \(ownership\)/, 403);
    const a = (await activate(owner, geo, 1)).version;
    expect(a).toMatchObject({ state: 'active', activated_by: owner.principalId, object_version: 2, dpg: { object_version: 2 } });
    const dpg = await one(sql`select payload from objects.canonical_objects where object_type = 'DPG' and object_id = ${geo}::uuid and object_version = 2`);
    expect(dpg['payload']).toMatchObject({ state: 'active', version: 1, conformance: { run_id: run['run_id'], passed: true }, certified_by: spec2.principalId });
    expect(arr((dpg['payload'] as Row)['sections']).every((x) => x['state'] === 'approved')).toBe(true);
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'active', package_version: 1, semver: '1.0.0' });
  });

  it('recovery: the certification item closed by the act; the sections show who approved what, with the expiry; the ledger in order', async () => {
    const vw = await view(geo);
    expect(vw.items.filter((i) => i['subject_id'] === geo).map((i) => i['state'])).toEqual(['closed']);
    const sec = vw.sections['1'] as Record<string, Row>;
    expect(sec['assessment']).toMatchObject({ state: 'approved', approver: spec2.principalId });
    expect(new Date(String(sec['use_boundary']!['expires_at'])).getTime() - Date.now()).toBeLessThan(181 * 86_400_000);
    expect(vw.ledger.map((x) => x['event'])).toEqual(expect.arrayContaining(['section.rejected', 'section.approved', 'run.certification', 'version.certified', 'version.activated']));
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK3 · the conformance suite (canonical mapping, compatibility, source and model approval, risk meaning, purpose, coverage)', () => {
  it('positive: the geopolitical certification run measured every check (the inputs statement says the declared real feeds are synthetic HERE)', async () => {
    const run = (await view(geo)).runs.find((r) => r['mode'] === 'certification') as Row;
    const checks = arr(run['checks']);
    expect(checks.map((c) => c['check'])).toEqual(['canonical_mapping', 'namespace_ontology', 'contract_compatibility', 'source_approval', 'model_approval', 'risk_meaning', 'purpose', 'source_coverage', 'source_coverage_optional', 'inputs_statement']);
    expect(checks.filter((c) => c['severity'] === 'blocking').every((c) => c['passed'] === true)).toBe(true);
    const inputs = checks.find((c) => c['check'] === 'inputs_statement') as Row;
    expect(inputs).toMatchObject({ severity: 'advisory', passed: false });
    expect(arr(inputs['findings']).join(' ')).toMatch(/is declared a real public feed; in this deployment its contract is synthetic/);
  });

  it('refusal: a non-conforming technology manifest (a type mapped off the core, a purpose the contract forbids, an unknown method, an unknown taxonomy category) fails; certification refused; the agent\'s certification run refused, its diagnostic run recorded', async () => {
    const d = (await declare(owner, TECH)).package; tech = String(d['package_id']);
    const bad = structuredClone(TECH.manifest);
    bad.ontology_extension.mappings.push({ type: 'vessel_class', maps_to: 'ship' });
    bad.ontology_extension.predicates.push({ predicate: 'transits', subject_types: ['vessel'], object_types: ['place'] });
    (bad.source_set[0] as { purposes: string[] }).purposes = ['observation', 'marketing'];
    bad.models.push({ kind: 'forecast', ref: 'oracle@9', series_key: w.seriesKey, horizons: ['30d'], claim: 'unvalidated' });
    bad.risk_meaning.push({ category_key: 'piracy', meaning: 'not in the taxonomy' });
    await propose(owner, tech, '1.0.0', bad);
    const run = (await conform(owner, tech, 1)).run;
    expect(run['passed']).toBe(false);
    const failed = Object.fromEntries(arr(run['checks']).filter((c) => !c['passed'] && c['severity'] === 'blocking').map((c) => [c['check'], arr(c['findings']).join(' | ')]));
    expect(Object.keys(failed).sort()).toEqual(['canonical_mapping', 'model_approval', 'namespace_ontology', 'purpose', 'risk_meaning']);
    expect(failed['canonical_mapping']).toMatch(/type vessel_class maps onto ship, which is not a core entity type/);
    expect(failed['canonical_mapping']).toMatch(/predicate transits redefines the core's predicate of that name \(the core ontology v1\)/);
    expect(failed['purpose']).toMatch(/is used for "marketing", which its contract does not permit/);
    expect(failed['model_approval']).toMatch(/forecast method oracle@9 is not in this domain's registry/);
    expect(failed['risk_meaning']).toMatch(/risk meaning piracy is not a category of the taxonomy v1/);
    const s = await sectionsOf(tech, 1);
    for (const section of ['methodology', 'assessment', 'escalation', 'use_boundary']) await approve(spec, tech, 1, section, String((s[section] as Row)['digest']));
    await refused(conform(agent, tech, 1, 'certification'), /^package conformance rejected \(actor\): an agent's run is diagnostic/, 403);
    const diag = (await conform(agent, tech, 1, 'diagnostic')).run;
    expect(diag).toMatchObject({ mode: 'diagnostic', passed: false, run_by_kind: 'agent' });
    await refused(certify(spec2, tech, 1), /^domain package rejected \(sections\): .*ontology=open/, 422);
  });

  it('recovery: the owner withdraws 1.0.0; the conforming 1.0.1 is certified and activated (its certification run passed; the diagnostic run certified nothing)', async () => {
    await refused(withdraw(otherOwner, tech, 1), /^domain package rejected \(ownership\)/, 403);
    expect((await withdraw(owner, tech, 1)).version).toMatchObject({ state: 'retired' });
    const def = { ...TECH, semver: '1.0.1', manifest: { ...TECH.manifest, release: { ...TECH.manifest.release, semver: '1.0.1' } } };
    const r = await certifyCycle(def, tech);
    expect(r.version).toBe(2);
    expect((await gate(TECH.key, 'forecast')).gate).toMatchObject({ state: 'active', semver: '1.0.1' });
    const runs = (await view(tech)).runs;
    expect(runs.filter((x) => x['mode'] === 'diagnostic').every((x) => Number(x['version']) === 1)).toBe(true);
    // a breaking change (an assessment template removed) without a migration plan, as a minor version: the suite says both
    const breaking = structuredClone(def.manifest); breaking.assessment_templates = [{ key: 'other-template', min_publishers: 1, material: true }]; breaking.release.semver = '1.1.0';
    await propose(owner, tech, '1.1.0', breaking);
    const cc = arr((await conform(owner, tech, 3, 'diagnostic')).run['checks']).find((c) => c['check'] === 'contract_compatibility') as Row;
    expect(cc['passed']).toBe(false);
    expect(arr(cc['findings']).join(' | ')).toMatch(/a breaking change \(removes assessment template technology-maturity\) is a major version, not a minor one.*carries no migration plan/);
    await withdraw(owner, tech, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK5 · assessments, watchlists, events, alerts and links — every write through the PACKAGE_GATE seam', () => {
  let watchlistId = ''; let a1 = ''; let a2 = ''; let t1Approved = '';
  it('positive: a watchlist; an analyst\'s assessment on two publishers approved by the specialist (DAS, diversity met) raises the domain.alert to the watchlist owner under the policy; the agent proposes, an analyst approves', async () => {
    watchlistId = String((await watch(owner, { packageKey: GEO.key, title: 'Red Sea corridor security (SYNTHETIC)', entities: [E['chokepoint'], E['armed']], freshnessDays: 14,
      rules: [{ rule_key: 'situation-assessed', on: 'assessment', templates: ['red-sea-security'] }, { rule_key: 'security-incident', on: 'event', kinds: ['security_incident'] }] })).watchlist['watchlist_id']);
    const p = (await proposeA(analyst, { packageKey: GEO.key, template: 'red-sea-security', subjects: [E['chokepoint'], E['armed']], statement: 'Attacks on shipping near Bab el-Mandeb continue; transits stay depressed (SYNTHETIC)',
      confidence: 0.7, evidence: [...EV['transits']!, EV['sanctions']![0]], material: true })).assessment;
    a1 = String(p['assessment_id']);
    expect(p).toMatchObject({ version: 1, state: 'proposed', proposed_by_kind: 'human', source_diversity: { publishers: 2, contracts: 2, meets: true, threshold: 2 } });
    const ap = (await decideA(spec, a1, 1)).assessment;
    expect(ap).toMatchObject({ state: 'approved', decided_by: spec.principalId, object_version: 1, alerts: [expect.objectContaining({ state: 'raised', watchlist_id: watchlistId })] });
    const das = await one(sql`select payload ->> 'state' as state, (payload -> 'source_diversity' ->> 'publishers')::int as p from objects.canonical_objects where object_type = 'DAS' and object_id = ${a1}::uuid`);
    expect(das).toMatchObject({ state: 'approved', p: 2 });
    const item = arr(ap['alerts'])[0]!['item'] as Row;
    expect(item).toMatchObject({ state: 'open', owner: owner.principalId, route_roles: ['strategy_owner'], policy_version: 1 });
    const itm = await one(sql`select signal_class, subject_kind, subject_id::text as s, details from executive.attention_items where item_id = ${String(item['item_id'])}::uuid`);
    expect(itm).toMatchObject({ signal_class: 'domain.alert', subject_kind: 'watchlist', s: watchlistId });
    expect(itm['details']).toMatchObject({ watchlist_id: watchlistId, rule_key: 'situation-assessed', cause: { kind: 'assessment', id: a1, version: 1 } });
    // the agent PROPOSES (an interpretation), a named analyst approves it
    const ag = (await proposeA(agent, { packageKey: TECH.key, template: 'technology-maturity', subjects: [E['lab']], statement: 'The lab\'s axial-flux patents suggest a 3-year adoption path (SYNTHETIC)',
      confidence: 0.55, evidence: [EV['patents']![0], EV['research']![0]], material: true })).assessment;
    expect(ag).toMatchObject({ proposed_by_kind: 'agent', state: 'proposed' });
    t1Approved = String(ag['assessment_id']);
    expect((await decideA(analyst, t1Approved, 1)).assessment).toMatchObject({ state: 'approved' });
  });

  it('refusal: the agent approving (PEP), an agent holding the analyst role (PORT), the proposer approving, a template the package lacks, a retired entity, unknown evidence, the uncertified package (the gate)', async () => {
    const p = (await proposeA(analyst, { packageKey: GEO.key, template: 'red-sea-security', subjects: [E['armed']], statement: 'A second reading of the situation (SYNTHETIC)', confidence: 0.6, evidence: EV['transits'], material: true })).assessment;
    a2 = String(p['assessment_id']);
    await refused(decideA({ ...spec, kind: 'agent', assurance: 'agent_grant' } as AuthenticatedPrincipal, a2, 1), /human gate: domain\.assessment\.approve requires a named human principal/, 403);
    await refused(decideA(machineSpec, a2, 1), /^domain assessment rejected \(actor\): an assessment is approved by a named human; an agent proposes, it never approves/, 403);
    await refused(decideA(analyst, a2, 1), /^domain assessment rejected \(separation_of_duties\)/, 403);
    await refused(proposeA(analyst, { packageKey: GEO.key, template: 'no-such', subjects: [E['armed']], statement: 'a template the package lacks', confidence: 0.5, evidence: EV['transits'] }), /^domain assessment rejected \(template\): no-such is not a template of package/, 422);
    await refused(proposeA(analyst, { packageKey: GEO.key, template: 'red-sea-security', subjects: [uuidv7()], statement: 'an entity that does not exist', confidence: 0.5, evidence: EV['transits'] }), /^domain assessment rejected \(unknown_entity\)/, 404);
    await refused(proposeA(analyst, { packageKey: GEO.key, template: 'red-sea-security', subjects: [E['armed']], statement: 'evidence that does not exist', confidence: 0.5, evidence: [{ kind: 'evidence', id: uuidv7(), version: 1, digest: 'a'.repeat(64) }] }), /^domain assessment rejected \(unknown_evidence\)/, 404);
    await refused(proposeA(analyst, { packageKey: CYBER.key, template: 'strategic-exposure', subjects: [E['plantA']], statement: 'the cyber package is not installed yet', confidence: 0.5, evidence: EV['cti'] }), /^domain assessment rejected \(package\): no package cyber-.* is installed in this domain/, 422);
    await refused(watch(owner, { packageKey: GEO.key, title: 'bad rule', rules: [{ rule_key: 'xx', on: 'assessment', templates: ['no-such'] }] }), /^watchlist rejected \(rules\): rule xx names a template the package does not declare/, 422);
    await refused(watch(owner, { watchlistId, expectedVersion: 7, packageKey: GEO.key, title: 'stale revision', rules: [{ rule_key: 'xx', on: 'event', kinds: ['security_incident'] }] }), /^watchlist rejected \(stale\): watchlist .* stands at version 1, not 7/, 409);
    await refused(retireW(otherOwner, watchlistId), /^watchlist rejected \(ownership\)/, 403);
  });

  it('recovery: a single-origin assessment is LIMITED (correlated publisher flagged); an analyst\'s limitation and a new version; the as-of replay answers what stood at each instant', async () => {
    const before = await dbNow();
    // two contracts of ONE publisher: correlated, single origin → approved as LIMITED
    const lim = (await decideA(spec, a2, 1)).assessment;
    expect(lim).toMatchObject({ state: 'limited', limited_reason: expect.stringMatching(/source diversity below the template's threshold: 1 distinct publisher\(s\), 2 required/) });
    const p2 = (await proposeA(analyst, { assessmentId: a2, packageKey: GEO.key, template: 'red-sea-security', subjects: [E['armed']], statement: 'The second reading, on correlated sources (SYNTHETIC)', confidence: 0.6,
      evidence: [EV['transits']![0], EV['transits-mirror']![0]], material: true })).assessment;
    expect(p2).toMatchObject({ version: 2, source_diversity: { publishers: 1, contracts: 2, single_origin: true, correlated_publishers: ['Fixture transit publisher (SYNTHETIC)'], meets: false } });
    const mid = await dbNow();
    const p3 = (await decideA(spec2, a2, 2)).assessment;
    expect(p3).toMatchObject({ state: 'limited', version: 2 });
    expect((await one(sql`select state from domain.assessments where assessment_id = ${a2}::uuid and version = 1`))['state']).toBe('superseded');
    // the analyst limits the approved a1 (a challenge); the replay before and after
    const beforeLimit = await dbNow();
    await limitA(analyst2, a1);
    await refused(limitA(analyst2, a1), /^domain assessment rejected \(unknown_assessment\)|^domain assessment rejected \(state\)/, 409);
    const r1 = await readA(owner, a1, beforeLimit);
    expect(r1.as_of).toMatchObject({ version: 1, state_then: 'approved', state_now: 'limited' });
    expect((await readA(owner, a1, await dbNow())).as_of).toMatchObject({ state_then: 'limited' });
    expect((await readA(owner, a2, before)).as_of).toBeNull();
    expect((await readA(owner, a2, mid)).as_of).toMatchObject({ version: 1, state_then: 'limited' });
    expect((await readA(owner, a2, await dbNow())).as_of).toMatchObject({ version: 2 });
  });

  it('events and alerts: the agent proposes a security incident, an analyst confirms (the event rule raises); adjudicated; resolved by the owner (items closed); a stranger cannot resolve', async () => {
    const ev = (await recordE(agent, { packageKey: GEO.key, kind: 'security_incident', title: 'Drone strike reported on a bulk carrier (SYNTHETIC)', subjects: [E['chokepoint']], occurredOn: await today(), evidence: EV['discovery'] })).event;
    expect(ev).toMatchObject({ state: 'proposed', proposed_by_kind: 'agent' });
    await refused(recordE(agent, { packageKey: GEO.key, kind: 'weather', title: 'a kind the package lacks', subjects: [E['chokepoint']], occurredOn: await today(), evidence: EV['discovery'] }), /^domain event rejected \(kind\)/, 422);
    await refused(confirmE({ ...analyst, kind: 'agent', assurance: 'agent_grant' } as AuthenticatedPrincipal, String(ev['event_id'])), /human gate/, 403);
    const c = (await confirmE(analyst, String(ev['event_id']))).event;
    expect(c).toMatchObject({ state: 'confirmed', alerts: [expect.objectContaining({ state: 'raised', watchlist_id: watchlistId })] });
    const alerts = (await view(geo)).alerts;
    expect(alerts.map((a) => `${a['cause_kind']}:${a['rule_key']}:${a['state']}`).sort()).toEqual(['assessment:situation-assessed:raised', 'event:security-incident:raised']);
    await adjudicate(analyst, String(alerts.find((a) => a['cause_kind'] === 'event')!['alert_id']), 'true_positive');
    await refused(adjudicate(analyst, String(alerts.find((a) => a['cause_kind'] === 'event')!['alert_id']), 'false_positive'), /^watchlist rejected \(duplicate\)/, 409);
    await refused(resolveW(otherOwner, watchlistId), /^watchlist rejected \(ownership\)/, 403);
    const r = (await resolveW(owner, watchlistId)).resolution;
    expect(arr(r['resolved'])).toHaveLength(2);
    const items = await rows(sql`select state from executive.attention_items where subject_id = ${watchlistId}::uuid and signal_class = 'domain.alert'`);
    expect(items.every((i) => i['state'] === 'closed')).toBe(true);
    await refused(resolveW(owner, watchlistId), /^watchlist rejected \(state\): watchlist .* has no raised alert to resolve/, 409);
  });

  it('links: a scenario and an exposure on the geopolitical package, a forecast on the technology package, an indicator on the financial one; refused: an unknown target, an exposure outside the risk meaning, a duplicate; withdrawn by its declarer', async () => {
    const sc = (await link(owner, { packageKey: GEO.key, kind: 'scenario', targetId: w.scenarioId })).link;
    expect(sc).toMatchObject({ link_kind: 'scenario', state: 'active' });
    await refused(link(owner, { packageKey: GEO.key, kind: 'scenario', targetId: w.scenarioId }), /^domain package rejected \(duplicate\)/, 409);
    await refused(link(owner, { packageKey: GEO.key, kind: 'scenario', targetId: uuidv7() }), /^domain package rejected \(unknown_target\)/, 404);
    // the exposure: an RSK declared through the Strategy Graph, registered by the analyst (owned by the risk owner)
    const rsk = (await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'RSK', null, 'graph'), T(), D(), { payload: { objectType: 'RSK', title: 'Red Sea corridor closure (SYNTHETIC)',
      statement: 'A closure of Bab el-Mandeb stops the inbound bearings', restsOn: [{ kind: 'entity', id: E['chokepoint'], rationale: 'the corridor is the driver' }] } }) as { strategy: { objectId: string } }).strategy.objectId;
    const { ExposuresController } = await import('../../src/prediction/exposures/exposures.controller.js');
    await h.app.get(ExposuresController).register(h.req(analyst, 'prediction.exposure.register', 'RSK', rsk, 'prediction'), T(), D(), { payload: { strategyObjectId: rsk, polarity: 'risk', category: 'supply_chain', owner: riskOwner.principalId } });
    expect((await link(owner, { packageKey: GEO.key, kind: 'exposure', targetId: rsk })).link).toMatchObject({ link_kind: 'exposure' });
    await refused(link(owner, { packageKey: TECH.key, kind: 'exposure', targetId: rsk }), /^domain package rejected \(risk\): exposure .* is in category supply_chain, which the package's risk meaning does not map/, 422);
    const fc = (await link(analyst, { packageKey: TECH.key, kind: 'forecast', targetId: w.forecastId, assessmentId: t1Approved })).link;
    expect(fc).toMatchObject({ link_kind: 'forecast', assessment_id: t1Approved });
    await refused(link(owner, { packageKey: GEO.key, kind: 'forecast', targetId: w.forecastId }), /^domain package rejected \(target\): forecast .* is not on a series or target the package's models declare/, 422);
    await refused(unlink(otherOwner, String(fc['link_id'])), /^domain package rejected \(ownership\)/, 403);
    expect((await unlink(analyst, String(fc['link_id']))).link).toMatchObject({ state: 'withdrawn' });
    await refused(unlink(analyst, String(fc['link_id'])), /^domain package rejected \(state\)/, 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK6 · the four packages, each with its acceptance focus MEASURED', () => {
  it('geopolitical (CAP-FW-08): the Red Sea indicator set fresh, the scenario link, conformance and authority — PASSED, measured; the inputs statement honest', async () => {
    const run = (await acceptance(owner, geo)).run;
    expect(run).toMatchObject({ mode: 'acceptance', suite_version: 'acceptance/1:geopolitical', passed: true });
    const ind = arr(run['checks']).find((c) => c['check'] === 'indicator_set') as Row;
    expect(ind['measured']).toMatchObject({ fresh: 1, total: 1, indicators: [expect.objectContaining({ key: 'chokepoint4_transits', registered: true, fresh: true, data_origin: 'synthetic', age_days: 0 })] });
    expect(arr(run['checks']).find((c) => c['check'] === 'authority')!['measured']).toMatchObject({ note: expect.stringMatching(/SIGNED acceptance record .* is R2/) });
    await refused(acceptance(owner, uuidv7()), /^package conformance rejected \(unknown_package\)/, 404);
  });

  it('technology (CAP-FW-09): evidence diversity measured; the HORIZON EVALUATION refuses the 3y "validated" claim (no passing B25 validation) — recovery: 1.2.0 states it in scenario language and passes', async () => {
    const run = (await acceptance(owner, tech)).run;
    expect(run['passed']).toBe(false);
    const hz = arr(run['checks']).find((c) => c['check'] === 'horizon_evaluation') as Row;
    expect(hz['passed']).toBe(false);
    expect(arr(hz['findings']).join(' | ')).toMatch(/seasonal_naive@1 on .* at 3y claims validation; the B25 registry holds 0 record\(s\) and none passed — a long-horizon claim is refused, or issued in scenario_language/);
    expect(arr(run['checks']).find((c) => c['check'] === 'evidence_diversity')!['measured']).toMatchObject({ total: 1, meeting: 1, share: 1 });
    const next = technologyPackage({ key: TECH.key, semver: '1.2.0', patents: SRC['patents']!.key, research: SRC['research']!.key, adoptionSeries: w.seriesKey, claim: 'scenario_language' });
    await certifyCycle(next, tech, { ontology: false });
    const ok = (await acceptance(owner, tech)).run;
    expect(ok['passed'], JSON.stringify(ok['checks'])).toBe(true);
    expect((arr(ok['checks']).find((c) => c['check'] === 'horizon_evaluation')!['measured'] as Row)['claims']).toEqual(expect.arrayContaining([expect.objectContaining({ horizon: '3y', claim: 'scenario_language', validated: false, verdict: 'ok' })]));
  });

  it('cyber (CAP-FW-10): the security scope and the FALSE-POSITIVE analysis — refused with too few adjudications (n stated), passed once five are adjudicated (precision 0.8); an out-of-scope event rejected is not counted', async () => {
    cyber = (await certifyCycle(CYBER, null)).pkg;
    const wl = String((await watch(owner, { packageKey: CYBER.key, title: 'Campaigns against our plants (SYNTHETIC)', entities: [E['plantA'], E['plantB']], rules: [{ rule_key: 'campaign', on: 'event', kinds: ['campaign_observed'] }] })).watchlist['watchlist_id']);
    const alertIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const ev = (await recordE(agent, { packageKey: CYBER.key, kind: 'campaign_observed', title: `Credential phishing wave ${i + 1} against the plant network (SYNTHETIC)`, subjects: [i % 2 === 0 ? E['plantA'] : E['plantB']], occurredOn: await today(), evidence: [EV['cti']![i % 2]!] })).event;
      alertIds.push(String(arr((await confirmE(analyst, String(ev['event_id']))).event['alerts'])[0]!['alert_id']));
    }
    const out = (await recordE(agent, { packageKey: CYBER.key, kind: 'campaign_observed', title: 'A campaign against the sales laptops (out of scope, SYNTHETIC)', subjects: [E['office']], occurredOn: await today(), evidence: EV['cti'] })).event;
    await confirmE(analyst, String(out['event_id']), 'reject');
    const first = (await acceptance(owner, cyber)).run;
    expect(first['passed']).toBe(false);
    expect(arr(first['checks']).find((c) => c['check'] === 'false_positive')).toMatchObject({ passed: false, measured: expect.objectContaining({ n: 0, unadjudicated: 5, min_n: 5 }) });
    expect(arr(first['checks']).find((c) => c['check'] === 'security_scope')).toMatchObject({ passed: true, measured: expect.objectContaining({ in_scope: 2, outside: [] }) });
    for (const [i, id] of alertIds.entries()) await adjudicate(analyst, id, i === 4 ? 'false_positive' : 'true_positive');
    const ok = (await acceptance(owner, cyber)).run;
    expect(ok['passed'], JSON.stringify(ok['checks'])).toBe(true);
    expect(arr(ok['checks']).find((c) => c['check'] === 'false_positive')!['measured']).toMatchObject({ true_positive: 4, false_positive: 1, n: 5, precision: 0.8, false_positive_rate: 0.2 });
    await resolveW(owner, wl);
  });

  it('financial (CAP-FW-11): entitlement and timing measured; the CALCULATION evidence refuses a digest that does not reproduce — recovery: 1.1.0 with the reproducible declaration passes; the indicator link', async () => {
    fin = (await certifyCycle(FIN, null)).pkg;
    const run = (await acceptance(owner, fin)).run;
    expect(run['passed']).toBe(false);
    const calc = arr(run['checks']).find((c) => c['check'] === 'calculation') as Row;
    expect(arr(calc['findings']).join(' ')).toMatch(/indicator eurusd: the declared calculation digest does not reproduce/);
    expect(arr(run['checks']).find((c) => c['check'] === 'entitlement')).toMatchObject({ passed: true });
    const timing = arr(run['checks']).find((c) => c['check'] === 'timing') as Row;
    expect(timing).toMatchObject({ passed: true });
    expect(arr((timing['measured'] as Row)['sources'])[0]).toMatchObject({ publication_lag_days: expect.any(Number) });
    const fixed = financialPackage({ key: FIN.key, semver: '1.1.0', ecb: SRC['fx']!.key, worldbank: SRC['macro']!.key, filings: SRC['filings']!.key, eurusdSeries: fxSeries });
    await certifyCycle(fixed, fin, { ontology: false });
    const ok = (await acceptance(owner, fin)).run;
    expect(ok['passed'], JSON.stringify(ok['checks'])).toBe(true);
    expect(arr((arr(ok['checks']).find((c) => c['check'] === 'calculation')!['measured'] as Row)['calculations'])[0]).toMatchObject({ reproducible: true, missing_inputs: [] });
    expect((await link(owner, { packageKey: FIN.key, kind: 'indicator', targetId: fxIndicator })).link).toMatchObject({ link_kind: 'indicator' });
    await refused(acceptance(agent, fin), /./, 403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK4 · health: the incompatible function disabled, the conflict exposed, the migration routed — the fault exercise', () => {
  let migration = '';
  it('positive: the re-check of a sound package passes and records nothing new; the same facts again write nothing', async () => {
    const r = (await health(owner, geo)).health;
    expect(r).toMatchObject({ recorded: true, passed: true, newly_disabled: [], conflict_exposed: false });
    expect((await health(owner, geo)).health).toMatchObject({ recorded: false });
  });

  it('refusal (the fault): the sanctions source SUSPENDED → assess and event disabled (watch stays active, reads keep working), the migration opened and routed; re-enable refused before the repair, by a non-specialist', async () => {
    await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', SRC['sanctions']!.sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.transition', objectType: 'SRC', objectId: SRC['sanctions']!.sourceId },
      ObservationCapability.registry, async (cap) => { await cap.transitionContract({ sourceId: SRC['sanctions']!.sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: 'suspended', reason: 'B33 §PK fault exercise: the publisher\'s rights are under review', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: SRC['sanctions']!.sourceId, targetVersion: '1', outboxEvent: null }; });
    const r = (await health(spec, geo)).health;
    expect(r).toMatchObject({ recorded: true, passed: false, newly_disabled: ['assess', 'event'], conflict_exposed: false });
    migration = String(r['migration_id']);
    expect(r['item']).toMatchObject({ state: 'open', route_roles: ['domain_specialist', 'domain_admin'], owner: owner.principalId });
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'disabled', reason: expect.stringMatching(/function assess of package geo-.* v1 is disabled: source b33pk-sanctions-.* is suspended/) });
    expect((await gate(GEO.key, 'watch')).gate).toMatchObject({ state: 'active' });
    await refused(proposeA(analyst, { packageKey: GEO.key, template: 'red-sea-security', subjects: [E['armed']], statement: 'proposed while the function is disabled', confidence: 0.5, evidence: EV['transits'] }),
      /^domain assessment rejected \(package\): function assess of package .* is disabled: source .* is suspended/, 422);
    await refused(recordE(agent, { packageKey: GEO.key, kind: 'security_incident', title: 'an event while disabled', subjects: [E['chokepoint']], occurredOn: await today(), evidence: EV['discovery'] }), /^domain event rejected \(package\)/, 422);
    expect((await watch(owner, { packageKey: GEO.key, title: 'Still watching the corridor (SYNTHETIC)', rules: [{ rule_key: 'incident', on: 'event', kinds: ['security_incident'] }] })).watchlist).toMatchObject({ state: 'active' });
    expect((await readA(owner, String((await view(geo)).assessments[0]!['assessment_id']))).versions.length).toBeGreaterThan(0);   // preserve accessible state
    await refused(enable(spec, geo, 1, { functions: ['assess', 'event'] }), /^domain package rejected \(health\): the last health run .* still finds function assess incompatible/, 422);
    await refused(enable(analyst, geo, 1, { functions: ['assess'] }), /./, 403);
    await refused(enable(machineSpec, geo, 1, { functions: ['assess'] }), /^domain package rejected \(authority\)/, 403);
    const vw = await view(geo);
    expect(vw.migrations[0]).toMatchObject({ migration_id: migration, state: 'open', functions: ['assess', 'event'] });
    expect((vw.gates['assess'] as Row)['state']).toBe('disabled');
  });

  it('the conflict: the steward supersedes the namespace\'s ontology with another extension → the conflict EXPOSED on assess and event (the package reads conflicted), its own migration', async () => {
    const m = structuredClone(GEO.manifest); m.ontology_extension.predicates.push({ predicate: 'escorts', subject_types: ['state_actor'], object_types: ['maritime_corridor'] });
    await ontologyFor(m);
    const r = (await health(spec, geo)).health;
    expect(r).toMatchObject({ recorded: true, conflict_exposed: true });
    expect((r['conflict'] as Row)).toMatchObject({ functions: ['assess', 'event'], reason: expect.stringMatching(/the ontology namespace no longer carries the package's extension/) });
    expect((await gate(GEO.key, null)).gate).toMatchObject({ state: 'conflicted' });
    expect(arr((await view(geo)).migrations).filter((x) => x['state'] === 'open')).toHaveLength(2);
  });

  it('recovery: the source re-activated and the ontology restored; the re-run passes; the specialist re-enables and clears the conflict — the migrations complete, their items close; the after-tick hook re-checks (started, bounded, one in flight)', async () => {
    await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', SRC['sanctions']!.sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.transition', objectType: 'SRC', objectId: SRC['sanctions']!.sourceId },
      ObservationCapability.registry, async (cap) => { await cap.transitionContract({ sourceId: SRC['sanctions']!.sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: 'active', reason: 'B33 §PK fault exercise: rights confirmed again', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: SRC['sanctions']!.sourceId, targetVersion: '1', outboxEvent: null }; });
    await ontologyFor(GEO.manifest);
    const r = (await health(spec, geo)).health;
    expect(r).toMatchObject({ recorded: true, passed: true, newly_disabled: [] });
    const e = (await enable(spec, geo, 1, { functions: ['assess', 'event'], clearConflict: true })).enabled;
    expect(e).toMatchObject({ disabled_functions: {}, conflict: null });
    expect(arr(e['closed_items'])).toHaveLength(2);
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'active' });
    expect(arr((await view(geo)).migrations).every((x) => x['state'] === 'completed')).toBe(true);
    await refused(enable(spec, geo, 1, { functions: ['assess'] }), /^domain package rejected \(state\): function assess of version 1 is not disabled/, 409);
    // the hook: run under the attention agent; a second while the first is in flight answers "skipped"
    svc.healthAwaitMs = 60_000;
    const a = { principal: attentionAgent, tenantId: T(), domainId: D(), correlationId: uuidv7() };
    const [x, y] = await Promise.all([svc.afterTick(a), svc.afterTick(a)]);
    const both = [x, y];
    expect(both.some((o) => String(o['skipped'] ?? '').match(/in flight since/))).toBe(true);
    const done = both.find((o) => o['results'] !== undefined) as Row;
    expect(arr(done['results']).map((o) => o['package_key']).sort()).toEqual([CYBER.key, FIN.key, GEO.key, TECH.key].sort());
    expect(arr(done['results']).every((o) => o['error'] === undefined)).toBe(true);
    svc.healthAwaitMs = 1;
    const bounded = await svc.afterTick({ ...a, correlationId: uuidv7() });
    expect(bounded['in_flight'] === true || bounded['results'] !== undefined).toBe(true);
    await svc.settled();
    svc.healthAwaitMs = 5_000;
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PK7 · the workspace\'s reads (WS-10): the list, the package view, the gate per function', () => {
  it('positive: the list shows each package\'s state, active version, last conformance and health; the view carries scope, portfolio, evidence and assessments, options and monitoring', async () => {
    const l = await pk.list(rq(owner, 'domain.package.read'), T(), D()) as { packages: Row[]; definitions: Row[]; boundary: string };
    const keys = l.packages.map((p) => p['package_key']);
    expect(keys).toEqual(expect.arrayContaining([GEO.key, TECH.key, CYBER.key, FIN.key]));
    const g = l.packages.find((p) => p['package_key'] === GEO.key) as Row;
    expect(g).toMatchObject({ state: 'declared', active: expect.objectContaining({ version: 1, state: 'active' }), health: expect.objectContaining({ passed: true }), open_migrations: 0 });
    expect(l.definitions.map((d) => d['kind'])).toEqual(['geopolitical', 'technology', 'cyber', 'financial']);
    expect((l.definitions[0]!['inputs'] as Row)).toMatchObject({ real_public: ['imf-portwatch-chokepoints', 'eu-sanctions-rss', 'gdelt-discovery'], synthetic: ['red-sea-ais-positions'] });
    const vw = await view(geo, analyst);
    const m = (vw.versions[0]!['manifest'] as Row);
    expect((m['controls'] as Row)['scope']).toMatchObject({ geography: ['Red Sea', 'Bab el-Mandeb', 'Gulf of Aden'], horizon: '90d' });
    expect(vw.assessments.length).toBeGreaterThan(0);
    expect(vw.watchlists.length).toBeGreaterThan(0);
    expect(vw.links.map((x) => x['link_kind']).sort()).toEqual(['exposure', 'scenario']);
    expect(Object.keys(vw.gates).sort()).toEqual(['alert', 'assess', 'event', 'exposure', 'forecast', 'indicator', 'package', 'scenario', 'watch']);
  });

  it('refusal: an unknown package (404), a reader outside the domain\'s roles (PDP 403); the gate asserted for a noun answers in the class form', async () => {
    await refused(view(uuidv7()), /^domain package rejected \(unknown_package\)/, 404);
    await refused(view(geo, outsider), /./, 403);
    await refused(pk.gate(rq(owner, 'domain.package.read'), T(), D(), { payload: { packageKey: 'nope-pkg', function: 'assess', assertFor: 'domain assessment' } }), /^domain assessment rejected \(package\): no package nope-pkg is installed/, 422);
  });

  it('recovery: the facts route reads what the suite reads (the database\'s instant, the sources with their origin)', async () => {
    const f = await pk.facts(rq(owner, 'domain.package.read', geo), T(), D(), geo, { payload: { version: 1 } }) as { facts: Row; acceptance: Row };
    expect(arr(f.facts['sources']).map((s) => s['data_origin'])).toEqual(['synthetic', 'synthetic', 'synthetic', 'synthetic']);
    expect(f.acceptance).toMatchObject({ certification: expect.objectContaining({ passed: true }) });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PKJ · the cross-domain journey: competitor + supply_chain + geopolitical packages', () => {
  let supply = ''; const SUP = `supply-${RUN}`; const COMP = `competitor-${RUN}`;
  const minimal = (key: string, kind: 'competitor' | 'supply_chain', requires: Array<{ package_key: string; range: string }>): PackageDefinition => {
    const base = geopoliticalPackage({ key, portwatch: SRC['transits']!.key, sanctions: SRC['sanctions']!.key, gdelt: SRC['discovery']!.key, ais: SRC['ais']!.key, chokepointSeries: transitsSeries });
    const m = structuredClone(base.manifest);
    m.ontology_extension = { namespace: `pkg:${key}`, mappings: kind === 'competitor' ? [{ type: 'competitor', maps_to: 'organization' }, { type: 'facility', maps_to: 'place' }] : [{ type: 'supplier', maps_to: 'organization' }, { type: 'site', maps_to: 'place' }],
                             predicates: [{ predicate: kind === 'competitor' ? 'operates' : 'supplies' }], event_kinds: kind === 'competitor' ? ['facility_opened'] : ['supplier_disruption'] };
    m.assessment_templates = [{ key: kind === 'competitor' ? 'competitor-move' : 'supplier-exposure', min_publishers: 1, material: true }];
    m.release = { ...m.release, requires };
    return { ...base, key, kind: kind as never, title: `${kind} package (journey, SYNTHETIC)`, manifest: m };
  };
  it('positive: a competitor package and a supply-chain package REQUIRING the active geopolitical ^1.0.0 are certified; an assessment on each, the same evidence and entity, each gated by its own package', async () => {
    await certifyCycle(minimal(COMP, 'competitor', []), null);
    supply = (await certifyCycle(minimal(SUP, 'supply_chain', [{ package_key: GEO.key, range: '^1.0.0' }]), null)).pkg;
    for (const [key, tpl] of [[COMP, 'competitor-move'], [SUP, 'supplier-exposure'], [GEO.key, 'red-sea-security']] as const) {
      const a = (await proposeA(analyst, { packageKey: key, template: tpl, subjects: [E['chokepoint']], statement: `The corridor seen from the ${key} package (SYNTHETIC)`, confidence: 0.5, evidence: [EV['sanctions']![1], EV['ais']![0]] })).assessment;
      expect((await decideA(spec, String(a['assessment_id']), 1)).assessment).toMatchObject({ state: 'approved', package_key: key });
    }
  });

  it('refusal (the fault across domains): the geopolitical package RETIRED → the supply package\'s health exposes the conflict (its requirement unmet): every function conflicted; the competitor package untouched', async () => {
    await refused(pk.retire(rq(otherOwner, 'domain.package.retire', geo), T(), D(), geo, { payload: { reason: 'not the owner' } }), /^domain package rejected \(ownership\)/, 403);
    const r = await pk.retire(rq(owner, 'domain.package.retire', geo), T(), D(), geo, { payload: { reason: 'the journey retires the geopolitical package' } }) as { package: Row };
    expect(r.package).toMatchObject({ state: 'retired' });
    expect((await gate(GEO.key, 'assess')).gate).toMatchObject({ state: 'not_installed', reason: expect.stringMatching(/is retired in this domain/) });
    const hr = (await health(owner, supply)).health;
    expect(hr).toMatchObject({ conflict_exposed: true, conflict: expect.objectContaining({ reason: expect.stringMatching(/the required package geo-.* is no longer active/) }) });
    expect((hr['conflict'] as Row)['functions']).toBeUndefined();
    expect((await gate(SUP, 'watch')).gate).toMatchObject({ state: 'conflicted' });
    expect((await gate(COMP, 'assess')).gate).toMatchObject({ state: 'active' });
    expect((await view(geo)).assessments.length).toBeGreaterThan(0);   // the retired package's records stay readable
  });

  it('recovery: the supply owner proposes 1.1.0 without the requirement (a migration), certified and activated — the migration completes, the conflict is gone with the superseded version', async () => {
    const def = minimal(SUP, 'supply_chain', []);
    const next = { ...def, semver: '1.1.0', manifest: { ...def.manifest, release: { ...def.manifest.release, semver: '1.1.0', migration: 'the geopolitical requirement is dropped; the corridor context comes from the supply package\'s own sources' } } };
    await certifyCycle(next, supply, { ontology: false });
    expect((await gate(SUP, 'watch')).gate).toMatchObject({ state: 'active', semver: '1.1.0' });
    expect(arr((await view(supply)).migrations).every((m) => m['state'] === 'completed')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('PKE · the `domain.` entitlement on a CONTRACTED tenant (runs LAST: it contracts the harness tenant)', () => {
  const PK = { core: `b33pk-core-${RUN}`, dom: `b33pk-domain-${RUN}` };
  const SKU = { core: `EYE-B33PK-CORE-${RUN}`.toUpperCase(), dom: `EYE-B33PK-DOM-${RUN}`.toUpperCase() };
  let vapi: EntitlementsVendorController; let vendor: AuthenticatedPrincipal;
  const vreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: { ...h.env(p, action, 'LIC', null, 'commercial'), scope: 'PLATFORM', tenant_id: null, domain_id: null }, eyePrincipal: p }) as never;

  it('positive: uncontracted, the owner declares a package; the catalogue claims domain. under domain_package v2', async () => {
    const { EntitlementsVendorController: V } = await import('../../src/commercial/entitlements/entitlements.controller.js');
    vapi = h.app.get(V);
    const id = uuidv7();
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status) values (${id}::uuid, 'human', 'PLATFORM', null, null, ${`b33pk-vendor-${RUN} (SYNTHETIC)`}, ${`b33pk-vendor-${id.slice(-8)}`}, 'active')`.execute(h.su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, 'commercial_authority', 'PLATFORM', null, null)`.execute(h.su);
    vendor = await h.openSession({ ...h.manager, principalId: id, homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null, bindings: [{ roleCode: 'commercial_authority', scope: 'PLATFORM', tenantId: null, domainId: null }] } as AuthenticatedPrincipal);
    expect((await declare(owner, TECH, `ent-a-${RUN}`)).package).toMatchObject({ state: 'declared' });
    expect(await one(sql`select (commercial.cen_action_capability('domain.package.declare')).capability_key as k`)).toMatchObject({ k: 'domain_package' });
  });

  it('refusal: contracted without domain_package — the owner\'s declare and the agent\'s proposal answer EYE-ENT-001 / 403; a human-gated approval and a read pass the gate', async () => {
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.core, expectedVersion: 0, title: 'Core only (SYNTHETIC)', capabilities: [], tier: 'foundation', reason: 'the core package of the B33 §PK harness' } });
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.dom, expectedVersion: 0, title: 'Domain packages (SYNTHETIC)', capabilities: ['domain_package'], tier: 'strategic_cell', reason: 'the domain-package capability for the B33 §PK harness' } });
    for (const [code, pkg] of [[SKU.core, PK.core], [SKU.dom, PK.dom]] as const) {
      await vapi.declareSku(vreq(vendor, 'commercial.offer.sku'), { payload: { code, expectedVersion: 0, title: `${pkg} 12 months`, packageKey: pkg, termMonths: 12, reason: 'a twelve-month synthetic term' } });
    }
    await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T(), { payload: { skuCode: SKU.core, orderRef: `SYNTH-B33PK-${RUN}-1`, reason: 'the core licence of the harness tenant' } });
    const r = await refused(declare(owner, TECH, `ent-b-${RUN}`), /^capability unavailable \(entitlement\): domain_package is not licensed/, 403);
    expect(r.code).toBe('EYE-ENT-001');
    await refused(proposeA(agent, { packageKey: COMP_KEY(), template: 'competitor-move', subjects: [E['chokepoint']], statement: 'the agent proposes under a lapsed entitlement', confidence: 0.5, evidence: EV['ais'] }), /^capability unavailable \(entitlement\)/, 403);
    // human-gated: past the entitlement gate, answered by the port on its own terms
    const s = await sectionsOf(tech, 4);
    expect(s).toBeDefined();
    await refused(approve(spec, tech, 4, 'methodology', 'f'.repeat(64)), /^domain package rejected \(state\): version 4 is active|^domain package rejected \(unknown_version\)|^domain package rejected \(stale\)/, 409);
    expect((await pk.list(rq(owner, 'domain.package.read'), T(), D()) as { packages: Row[] }).packages.length).toBeGreaterThan(0);
  });

  it('recovery: the licence reissued with domain_package — the same declare passes', async () => {
    await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T(), { payload: { skuCode: SKU.dom, orderRef: `SYNTH-B33PK-${RUN}-2`, reason: 'the tenant adds the domain-package capability' } });
    expect((await declare(owner, TECH, `ent-b-${RUN}`)).package).toMatchObject({ state: 'declared' });
  });
});
const COMP_KEY = () => `competitor-${RUN}`;
