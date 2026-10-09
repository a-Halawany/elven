/**
 * CP-6 B33 §CI (0111_b33_x_competitor.sql) — COMPETITOR INTELLIGENCE (F-P4-15 ch.29: PR-29-001/-002/-003/-005/-006, CAP-FW-06, AT-29, JRN-10;
 * F-P5-01's "families populated": the competitor and market twins), on a real database through the real pipeline, routes and ports, with
 * named humans holding sessions of their own (the ports compare the acting principal). Every figure is SYNTHETIC (NORDWERK's world; the
 * competitors "Atlas Getriebemotoren AG", "Kessler Antriebe GmbH", "Lindqvist Motoren AB" are fictional). What this harness proves is the
 * SOFTWARE; the signed acceptance record (AT-29 / PR-29-006) is R2's, and a real competitor-intelligence acceptance needs licensed
 * registries, filings and newswires (external) — a public feed never closes that clause.
 *
 * FIXTURES (said): the competitor PACKAGE is set ACTIVE by rows written directly to the prelude's tables domain.packages / package_versions
 * (its manifest is §CI's competitorManifest()) — §PK owns the package ports; the integrator re-proves the scene through them after the fold.
 * The extracted CLAIMS (ENT mentions, EVT events) are planted as canonical objects with their lineage to REAL uploaded evidence (the
 * extraction pipeline is Phase 2's, proven elsewhere); their RESOLUTION to graph entities runs through the graph's real resolve / decide /
 * split routes. A decision package is declared through the decision layer's real route. One open contradiction is planted
 * (intelligence.contradictions — the detector is Phase 2's). One stale evidence object is planted with a recorded_at 40 days before the
 * database's now (the coverage read is what is tested).
 *
 *   CI1 · temporal profiles: declare (bound to the graph's organization), propose, approve → versions with effective time and CPF objects
 *   CI2 · identity through the graph's resolution: identifier → auto-resolved; a name-only mention proposed and decided by a person
 *   CI3 · the Domain Intelligence Agent's real domain_scan proposes; the named analyst approves (digest-bound, never the proposer, never the agent)
 *   CI4 · comparisons on a declared, versioned basis; incompatible definitions refused; a moved basis suspends; source diversity measured
 *   CI5 · the alert under the published policy to the strategy lead (the watchlist's owner named)
 *   CI6 · the continuity contract: mistaken identity, correlated sources, conflicting evidence, stale coverage → limited, routed, recovered
 *   CI7 · the entity-resolution corpus, as-of replay, analyst challenge, decision-use evidence
 *   CI8 · the competitor and market twins linked (dependency completeness 1/1); a capacity change proposed to the twin's owner, who decides
 *   CI-R · the B25 lessons on the new kind: the after-tick hook STARTED (bounded, one in flight), a budget stop, a lapsed run closed stopped
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { Db } from '../../src/shared/db.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { inCommitContext } from './phase1-helpers.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import type { CompetitorController } from '../../src/domains/competitor/competitor.controller.js';
import type { CompetitorService } from '../../src/domains/competitor/competitor.service.js';
import { competitorManifest } from '../../src/domains/competitor/competitor-logic.js';
import { DOMAIN_INTELLIGENCE_AGENT_DIGEST, DOMAIN_INTELLIGENCE_AGENT_VERSION } from '../../src/domains/domain-intelligence-agent.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';

// this file's own vault roots (the press releases are uploaded through the real route)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b33-ci-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { filename: string; id: string; version: number; digest: string; bytesDigest: string };
type Claim = { id: string; version: number; digest: string };
const RUN = uuidv7().slice(-6);
const PKG = 'competitor';
const REGISTER = `b33ci-register-${RUN}`; const GEO = `b33ci-geo-${RUN}`;

let h: Phase4Harness; let T: string; let D: string;
let cc: CompetitorController; let svc: CompetitorService; let exec: ExecutiveController; let graph: GraphController; let twins: TwinController; let comp: CompositionController;
let hoffmann: AuthenticatedPrincipal; let hweber: AuthenticatedPrincipal; let jweber: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let tadmin: AuthenticatedPrincipal;
let resman: AuthenticatedPrincipal; let resman2: AuthenticatedPrincipal; let nakamura: AuthenticatedPrincipal; let kovacs: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal;
let executive: AuthenticatedPrincipal;
/** the world the cases share */
const W: Record<string, string> = {};
const E: Record<string, Evd> = {};

// ── refusals, reads ─────────────────────────────────────────────────────────────────────────────
async function refusal(p: Promise<unknown>): Promise<{ status: number | null; message: string }> {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const raw = e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? '') : (e instanceof Error ? e.message : String(e));
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) throw e;
  return { status: mapped.getStatus(), message: raw };
}
async function refused(p: Promise<unknown>, re: RegExp, status: number): Promise<string> {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r.message;
}
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const r = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(p, action, type, id, 'intelligence');
const dbNow = async () => String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as n`))['n']);
const evidenceCite = (e: Evd) => ({ kind: 'evidence', id: e.id, version: e.version, digest: e.digest });
const claimCite = (c: Claim) => ({ kind: 'claim', id: c.id, version: c.version, digest: c.digest });

// ── the routes, in process ─────────────────────────────────────────────────────────────────────────
const declareCompetitor = (as: AuthenticatedPrincipal, entityId: string, name: string, owner: string) =>
  cc.declare(r(as, 'domain.competitor.declare', 'DCI', null), T, D, { payload: { packageKey: PKG, entityId, name, ownerPrincipalId: owner } }) as Promise<{ competitor: Row }>;
const propose = (as: AuthenticatedPrincipal, competitorId: string, content: Row) =>
  cc.propose(r(as, 'domain.competitor.propose', 'DCP', null), T, D, { payload: { competitorId, content } }) as Promise<{ proposal: Row }>;
const decide = async (as: AuthenticatedPrincipal, proposalId: string, decision: 'approved' | 'declined', digest: string, reason: string | null = null, competitorId?: string) => {
  const competitor = competitorId ?? String((await proposalOf(proposalId))['competitor_id'] ?? uuidv7());
  return cc.decide(r(as, 'domain.competitor.assessment.approve', 'DCI', competitor), T, D, proposalId, { payload: { decision, digest, reason, competitorId: competitor } }) as Promise<{ decision: Row }>;
};
const readCompetitor = (as: AuthenticatedPrincipal, id: string) => cc.read(r(as, 'domain.competitor.read', 'DCI', id), T, D, id).then((x) => (x as { competitor: Row }).competitor);
const overview = (as: AuthenticatedPrincipal) => cc.overview(r(as, 'domain.competitor.read', 'DCI', null), T, D).then((x) => (x as { overview: Row }).overview);
const revalidate = (as: AuthenticatedPrincipal, id: string) => cc.revalidate(r(as, 'domain.competitor.revalidate', 'DCI', id), T, D, id).then((x) => (x as { revalidation: Row }).revalidation);
const basis = (as: AuthenticatedPrincipal, basisKey: string, metrics: unknown[], title = 'Gear-motor capacity (SYNTHETIC basis)') =>
  cc.basis(r(as, 'domain.competitor.compare', 'DCB', null), T, D, { payload: { packageKey: PKG, basisKey, title, metrics } }).then((x) => (x as { basis: Row }).basis);
const compare = (as: AuthenticatedPrincipal, basisKey: string, competitorIds: string[]) =>
  cc.compare(r(as, 'domain.competitor.compare', 'DCC', null), T, D, { payload: { basisKey, competitorIds } }).then((x) => (x as { comparison: Row }).comparison);
const watchlist = (as: AuthenticatedPrincipal, payload: Row) => cc.declareWatchlist(r(as, 'domain.competitor.watchlist', 'DCW', null), T, D, { payload: { packageKey: PKG, ...payload } }).then((x) => (x as { watchlist: Row }).watchlist);
const proposalOf = async (id: string): Promise<Row> => one(sql`select * from domain.competitor_proposals where proposal_id = ${id}::uuid`);
/** propose as a person, then approve as the analyst (the digest read back from the proposal) */
async function proposeAndApprove(by: AuthenticatedPrincipal, approver: AuthenticatedPrincipal, competitorId: string, content: Row): Promise<Row> {
  const p = (await propose(by, competitorId, content)).proposal;
  return (await decide(approver, String(p['proposal_id']), 'approved', String(p['content_digest']))).decision;
}

// ── evidence through the real upload route, from sources of NAMED publishers ─────────────────────────
/** An upload source whose contract names its PUBLISHER (the source diversity is counted over publishers); registered, approved, activated
 *  and given its upload agent through the real ports (phase4-helpers' uploadSource with the publisher named). */
async function publisherSource(label: string, publisher: string): Promise<void> {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const controller = h.app.get(ObservationController);
  const sourceKey = `b33ci-${label}-${RUN}`;
  const contract = { ...uploadContract(sourceKey, 'internal'), publisher, name: `${publisher} uploads (SYNTHETIC)` };
  const res = await controller.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T, D, { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = res.source.sourceId;
  for (const [action, fn] of [['observation.source.approve', 'approve'], ['observation.source.transition', 'transition']] as const) {
    await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'SRC', objectId: sourceId },
      ObservationCapability.registry, async (cap) => {
        if (fn === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T, domainId: D, decision: 'approve', reason: 'b33 competitor fixture source', eventId: uuidv7(), correlationId: uuidv7() });
        else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T, domainId: D, target: 'active', reason: 'b33 competitor fixture source: active', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
      });
  }
  const connector = new UploadConnector([]);
  const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T}::uuid, ${D}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T}::uuid, ${D}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T, domainId: D }, 'observation.agent.register', agentId, async (tx) => {
    await sql`select observation.register_agent(${agentId}::uuid, ${T}::uuid, ${D}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
      ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb,
      ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
  });
  (h as unknown as { uploadSourceIds: Map<string, string> }).uploadSourceIds.set(`internal:${label}`, sourceId);
}
const doc = (lines: string[]) => ['synthetic,record_id,text', ...lines.map((l, i) => `true,SYN-DOC-${i + 1},"${l.replace(/"/g, '""')}"`)].join('\n') + '\n';
async function evidence(label: string, filename: string, lines: string[]): Promise<Evd> {
  const [e] = await h.upload([{ filename: `${filename}-${RUN}.csv`, text: doc(lines) }], 'internal', label);
  return e as Evd;
}

// ── the extraction's output, planted (SYNTHETIC), with its lineage to the real evidence ─────────────────
async function plantClaim(type: 'ENT' | 'EVT' | 'CLM', evd: Evd, payload: Row, recordedAt?: string): Promise<Claim> {
  const id = uuidv7(); const now = recordedAt ?? new Date().toISOString();
  const body: Row = { claim_kind: type === 'ENT' ? 'entity' : type === 'EVT' ? 'event' : 'claim', confidence: 0.9, ...payload,
    lineage: { method_key: 'b33ci-fixture-extraction', method_id: uuidv7(), model_id: 'fixture', model_weights_digest: 'a'.repeat(64), runtime_version: 'fixture', prompt_version: 'v1',
               decoding_digest: 'b'.repeat(64), mode: 'replay', evidence_object_id: evd.id, evidence_digest: evd.bytesDigest, byte_start: 0, byte_end: 10, extraction_identity: 'c'.repeat(64),
               retrieval_decision_id: uuidv7() } };
  const header: CanonicalHeader = {
    object_id: id, object_type: type, tenant_id: T, domain_id: D, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evd.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evd.id}`], provenance_ref: null, method_ref: 'b33ci-fixture-extraction@1',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null,
    access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, body);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, ${type}, ${T}::uuid, ${D}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify([evd.id])}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify([`EVD:${evd.id}`])}::jsonb, null, 'b33ci-fixture-extraction@1', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, ${`${type}@v1`}, null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(body)}::jsonb, ${digest})`.execute(h.su);
  return { id, version: 1, digest };
}
/** A STALE evidence object, planted with a recorded_at `daysAgo` before the database's now (no observation chain: its origin is unknown) —
 *  the coverage read is what is tested; an upload's recorded_at is always now. */
async function plantEvidence(label: string, daysAgo: number): Promise<Evd & { recordedAt: string }> {
  const id = uuidv7();
  const at = String((await one(sql`select to_char((clock_timestamp() - make_interval(days => ${daysAgo}::int)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))['t']);
  const bytes = createHash('sha256').update(`${label}-${RUN}`).digest('hex');
  const payload: Row = { content_digest: bytes, byte_length: 64, media_type_sniffed: 'text/csv', locator: `b33ci:${label}`, synthetic: true };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'EVD', tenant_id: T, domain_id: D, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-OBS-01', accountable_owner: 'agent:fixture',
    source_object_ids: [], event_time: null, observation_time: at, valid_from: null, valid_to: null, recorded_at: at, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'observed', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [], provenance_ref: null, method_ref: 'b33ci-fixture@1',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null,
    access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'EVD@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, 'EVD', ${T}::uuid, ${D}::uuid, 'DOMAIN', 1, 'active', 'CP-OBS-01', 'agent:fixture', '[]'::jsonb, null, ${at}::timestamptz, null, null, ${at}::timestamptz, 'exact', 'trusted', 'observed', false, null, null, '[]'::jsonb, null, 'b33ci-fixture@1', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'EVD@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  return { filename: label, id, version: 1, digest, bytesDigest: bytes, recordedAt: at };
}
/** an ENT mention of an organization (with the register's identifier when given) or a place (with the geo identifier) */
const mention = (evd: Evd, subject: string, entityType: 'organization' | 'place', identifier: string | null) =>
  plantClaim('ENT', evd, { subject, predicate: 'is_a', object_value: entityType === 'place' ? 'plant site' : 'gear-motor maker', confidence: 0.95,
    qualifiers: { entity_type: entityType, ...(identifier === null ? {} : { identifiers: { [entityType === 'place' ? GEO : REGISTER]: identifier } }) } });
/** THE GRAPH'S OWN RESOLUTION (the real route): a resolution manager runs the resolver over the planted mentions */
const resolveRun = async (as = resman) => (await graph.resolve(r(as, 'graph.resolution.propose', 'RES', null), T, D, { payload: { limit: 500 } }) as { resolution: Row }).resolution;
const entityOf = async (claimId: string): Promise<Row> => one(sql`select r.entity_id::text, r.state, r.method, r.resolution_id::text from graph.resolutions_current r where r.claim_object_id = ${claimId}::uuid order by r.proposed_at desc limit 1`);

// ── the agent ───────────────────────────────────────────────────────────────────────────────────
const registerAgent = (over: Row = {}) => exec.registerAgent(h.req(tadmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload: {
  kind: 'domain_intelligence', version: DOMAIN_INTELLIGENCE_AGENT_VERSION, codeDigest: DOMAIN_INTELLIGENCE_AGENT_DIGEST, ownerPrincipalId: jweber.principalId,
  escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 20, max_gateway_calls: 0, max_elapsed_ms: 300_000 }, stopConditions: [{ kind: 'max_items', value: 5 }], ...over } } as never) as unknown as Promise<{ agent: Row }>;
const runScan = (agentId: string) => exec.runAgent(h.req(dadmin, 'agent.trigger', 'AGT', agentId, 'intelligence'), T, D, agentId, { payload: { task: 'domain_scan' } } as never) as unknown as Promise<{ run: Row }>;

// ═════════════════════════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { CompetitorController: Cc } = await import('../../src/domains/competitor/competitor.controller.js');
  const { CompetitorService: Cs } = await import('../../src/domains/competitor/competitor.service.js');
  const { ExecutiveController: Ex } = await import('../../src/executive/executive.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { CompositionController: Co } = await import('../../src/twin/composition/composition.controller.js');
  cc = h.app.get(Cc); svc = h.app.get(Cs); exec = h.app.get(Ex); graph = h.app.get(Gc); twins = h.app.get(Tw); comp = h.app.get(Co);
  hoffmann = await h.humanWithSession(['domain_analyst'], 'hoffmann');
  hweber = await h.humanWithSession(['domain_analyst'], 'hweber');
  jweber = await h.humanWithSession(['strategy_owner'], 'jweber');
  dadmin = await h.humanWithSession(['domain_admin'], 'dadmin');
  tadmin = await h.humanWithSession(['tenant_admin'], 'tadmin', 'TENANT');
  resman = await h.humanWithSession(['resolution_manager'], 'resman');
  resman2 = await h.humanWithSession(['resolution_manager'], 'resman2');
  nakamura = await h.humanWithSession(['twin_owner'], 'nakamura');
  kovacs = await h.humanWithSession(['twin_owner'], 'kovacs');
  brandt = await h.humanWithSession(['decision_owner', 'strategy_owner'], 'brandt');
  executive = await h.humanWithSession(['executive'], 'executive');
  // THE PACKAGE (fixture on the prelude's tables — §PK owns the ports): `competitor` v1 active with §CI's manifest
  W['pkg'] = uuidv7();
  const manifest = competitorManifest('1.0.0', [`b33ci-atlas-press-${RUN}`, `b33ci-trade-press-${RUN}`, `b33ci-kessler-press-${RUN}`]);
  await sql`insert into domain.packages (package_id, scope, tenant_id, domain_id, package_key, domain_kind, title, owner_principal_id, created_by, correlation_id)
            values (${W['pkg']}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${PKG}, 'competitor', 'Competitor intelligence (SYNTHETIC)', ${jweber.principalId}::uuid, ${jweber.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into domain.package_versions (package_id, version, scope, tenant_id, domain_id, semver, manifest, manifest_digest, state, proposed_by, certified_by, certified_at, activated_by, activated_at, correlation_id)
            values (${W['pkg']}::uuid, 1, 'DOMAIN', ${T}::uuid, ${D}::uuid, '1.0.0', ${JSON.stringify(manifest)}::jsonb, ${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}, 'active',
                    ${jweber.principalId}::uuid, ${dadmin.principalId}::uuid, clock_timestamp(), ${jweber.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
  // THE PUBLISHED ATTENTION POLICY (the act's v11 shape): domain.alert → strategy_owner
  await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T, D, { payload: { reason: 'B33 competitor harness: domain alerts to the strategy owner (SYNTHETIC)', rules: {
    classes: { 'domain.alert': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1,
                                 suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' } }, overload: { max_open_per_role: 50 } } } } as never);
  // the identifier systems the resolver may match on (rule 1: an authoritative register)
  for (const [key, authority] of [[REGISTER, 'Synthetic company register (SYNTHETIC)'], [GEO, 'Synthetic place gazetteer (SYNTHETIC)']]) {
    await graph.registerSystem(r(dadmin, 'graph.entity.create', 'IDS', null), T, D, { payload: { systemKey: key, authority, description: 'B33 competitor harness (SYNTHETIC)', isAuthoritative: true } });
  }
  await publisherSource('atlas-press', 'Atlas Getriebemotoren AG press office (SYNTHETIC)');
  await publisherSource('trade-press', 'Antriebstechnik trade press (SYNTHETIC)');
  await publisherSource('kessler-press', 'Kessler Antriebe GmbH press office (SYNTHETIC)');
}, 600_000);

afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI1 + CI2 · a temporal competitor profile, its identity the graph\'s', () => {
  it('positive: mentions resolved by the graph (identifier → the organization created and auto-resolved); the competitor declared on it; profile v1 proposed by one analyst and approved by another → a CPF object, effective from its day', async () => {
    E['profile'] = await evidence('atlas-press', 'atlas-company-profile', ['Atlas Getriebemotoren AG (SYNTHETIC) builds gear motors 0.1-5 kW for the German market; capacity 40000 units per month.']);
    E['profile2'] = await evidence('trade-press', 'trade-atlas-portrait', ['Trade press portrait: Atlas Getriebemotoren AG (SYNTHETIC), Izmir plant, 40000 gear motors a month.']);
    const m1 = await mention(E['profile']!, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'organization', 'SYN-ATLAS-001');
    const m2 = await mention(E['profile2']!, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'organization', 'SYN-ATLAS-001');
    const run = await resolveRun();
    expect(Number(run['entitiesCreated'])).toBeGreaterThanOrEqual(1);
    const a1 = await entityOf(m1.id); const a2 = await entityOf(m2.id);
    expect(a1).toMatchObject({ state: 'accepted', method: 'deterministic_identifier' });
    expect(a2).toMatchObject({ state: 'accepted', entity_id: a1['entity_id'] });
    W['atlasEntity'] = String(a1['entity_id']);
    const d = (await declareCompetitor(hweber, W['atlasEntity'], 'Atlas Getriebemotoren AG (SYNTHETIC)', hweber.principalId)).competitor;
    expect(d).toMatchObject({ entity_id: W['atlasEntity'], package: expect.objectContaining({ state: 'active', package_version: 1 }) });
    W['atlas'] = String(d['competitor_id']);
    const both = [evidenceCite(E['profile']!), evidenceCite(E['profile2']!)];
    const v1 = await proposeAndApprove(hweber, hoffmann, W['atlas'], { effective_from: '2026-01-01', events: [], interpretation: null, changes: [
      { op: 'add', fact: { key: 'product:gear-motors', kind: 'product', value: { name: 'gear motors 0.1–5 kW' }, citations: both, confidence: 0.9 } },
      { op: 'add', fact: { key: 'market:germany', kind: 'market', value: { name: 'Germany' }, citations: both, confidence: 0.9 } },
      { op: 'add', fact: { key: 'facility:izmir', kind: 'facility', value: { place: 'Izmir', status: 'operating' }, citations: [evidenceCite(E['profile2']!)], confidence: 0.8 } },
      { op: 'add', fact: { key: 'capability:capacity', kind: 'capability', value: { amount: 40000, unit: 'units/month', period: 'month', population: 'gear motors 0.1–5 kW' }, citations: both, confidence: 0.85 } },
    ] });
    expect(v1).toMatchObject({ state: 'approved', version: 1, profile_state: 'approved', effective_from: '2026-01-01', limited_reasons: [], object: expect.objectContaining({ object_type: 'CPF', object_version: 1 }) });
    expect(v1['source_diversity']).toMatchObject({ publishers: 2, independent_publishers: 2, below_threshold: false });
    expect(v1['identity']).toMatchObject({ state: 'resolved', resolved: 2 });
    const cpf = await one(sql`select object_version::int, payload, content_digest from objects.canonical_objects where object_type = 'CPF' and object_id = ${W['atlas']}::uuid`);
    expect(cpf).toMatchObject({ object_version: 1, payload: expect.objectContaining({ name: 'Atlas Getriebemotoren AG (SYNTHETIC)', version: 1, effective_from: '2026-01-01', state: 'approved' }) });
    expect((await one(sql`select cpf_digest from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid and version = 1`))['cpf_digest']).toBe(cpf['content_digest']);
    const read = await readCompetitor(jweber, W['atlas']);
    expect(read['head']).toMatchObject({ version: 1, state: 'approved', effective_from: '2026-01-01' });   // a DATE as the day it names
    expect(read['presented']).toMatchObject({ state: 'current', reasons: [] });
  });

  it('refusal: a place entity is not a competitor; the same organization twice; a role outside the rule; a citation not as cited; an unknown citation; a change to a fact not held', async () => {
    const pm = await mention(E['profile']!, 'Izmir (SYNTHETIC)', 'place', 'SYN-GEO-IZMIR');
    await resolveRun();
    const place = String((await entityOf(pm.id))['entity_id']);
    await refused(declareCompetitor(hweber, place, 'Izmir as a competitor', hweber.principalId), /^competitor profile rejected \(identity\): entity .* is a place, not an organization/, 422);
    await refused(declareCompetitor(hweber, W['atlasEntity']!, 'Atlas again', hweber.principalId), /^competitor profile rejected \(duplicate\): entity .* is already a competitor/, 409);
    await refused(declareCompetitor(executive, W['atlasEntity']!, 'Atlas by the executive', hweber.principalId), /no qualifying role binding/, 403);
    await refused(declareCompetitor(hweber, uuidv7(), 'Nobody', hweber.principalId), /^competitor profile rejected \(unknown_entity\)/, 404);
    const bad = { ...evidenceCite(E['profile']!), digest: 'f'.repeat(64) };
    await refused(propose(hweber, W['atlas']!, { effective_from: '2026-02-01', events: [], changes: [{ op: 'add', fact: { key: 'market:france', kind: 'market', value: { name: 'France' }, citations: [bad], confidence: 0.7 } }] }),
      /^competitor profile rejected \(citation\): evidence .* has digest/, 422);
    await refused(propose(hweber, W['atlas']!, { effective_from: '2026-02-01', events: [], changes: [{ op: 'add', fact: { key: 'market:france', kind: 'market', value: { name: 'France' }, citations: [{ kind: 'evidence', id: uuidv7(), version: 1, digest: 'a'.repeat(64) }], confidence: 0.7 } }] }),
      /^competitor profile rejected \(unknown_citation\)/, 404);
    await refused(propose(hweber, W['atlas']!, { effective_from: '2026-02-01', events: [], changes: [{ op: 'replace', fact: { key: 'market:france', kind: 'market', value: { name: 'France' }, citations: [evidenceCite(E['profile']!)], confidence: 0.7 } }] }),
      /^competitor profile rejected \(stale\): the profile holds no fact market:france/, 409);
    expect((await one(sql`select count(*)::int n from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid`))['n']).toBe(1);
  });

  it('recovery: the corrected change proposed and approved → v2 (v1 superseded and still replayable); the ledger records every step', async () => {
    const v2 = await proposeAndApprove(hweber, hoffmann, W['atlas']!, { effective_from: '2026-03-01', events: [], changes: [
      { op: 'add', fact: { key: 'market:france', kind: 'market', value: { name: 'France' }, citations: [evidenceCite(E['profile']!), evidenceCite(E['profile2']!)], confidence: 0.7 } }] });
    expect(v2).toMatchObject({ version: 2, supersedes: 1, profile_state: 'approved' });
    const versions = await rows(sql`select version, state, effective_from::text from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid order by version`);
    expect(versions).toEqual([{ version: 1, state: 'superseded', effective_from: '2026-01-01' }, { version: 2, state: 'approved', effective_from: '2026-03-01' }]);
    const ledger = (await rows(sql`select event from domain.competitor_ledger where competitor_id = ${W['atlas']}::uuid order by occurred_at`)).map((x) => x['event']);
    expect(ledger).toEqual(['competitor.declared', 'proposal.proposed', 'proposal.approved', 'profile.versioned', 'proposal.proposed', 'proposal.approved', 'profile.versioned']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI3 + CI5 · the Domain Intelligence Agent proposes; the named analyst approves the material assessment; the alert reaches the strategy lead', () => {
  beforeAll(async () => {
    W['agent'] = String((await registerAgent()).agent['agentId']);
    W['watch'] = String((await watchlist(jweber, { title: 'New capacity in our markets (SYNTHETIC)', ownerPrincipalId: jweber.principalId, freshnessDays: 30,
      rules: [{ rule_key: 'new-capacity', title: 'new capacity in our markets', event_kinds: ['plant_opened', 'capacity_change'], markets: ['Morocco', 'Germany', 'Poland'] }] }))['watchlist_id']);
  });

  it('positive: a press release and the trade press report a Moroccan plant → the agent\'s scan proposes ONE event and profile update (both sources cited); A. Hoffmann approves → profile v3; the alert is routed under the policy to the strategy owner, J. Weber named', async () => {
    E['plant'] = await evidence('atlas-press', 'atlas-tangier-release', ['Atlas Getriebemotoren AG (SYNTHETIC) opens a gear-motor plant in Tangier, Morocco, on 1 October 2026; capacity 12000 units per month.']);
    E['plantTrade'] = await evidence('trade-press', 'trade-tangier-report', ['Trade press: Atlas (SYNTHETIC) starts production in Tangier this October, 12000 motors a month.']);
    for (const ev of [E['plant']!, E['plantTrade']!]) {
      await mention(ev, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'organization', 'SYN-ATLAS-001');
      await mention(ev, 'Tangier, Morocco (SYNTHETIC)', 'place', 'SYN-GEO-TNG');
    }
    W['evt1'] = (await plantClaim('EVT', E['plant']!, { subject: 'Atlas Getriebemotoren AG (SYNTHETIC)', predicate: 'opens_plant', object_value: 'Tangier, Morocco', confidence: 0.9,
      qualifiers: { effective_date: '2026-10-01', capacity_per_month: 12000, product: 'gear motors', market: 'Morocco' } })).id;
    W['evt2'] = (await plantClaim('EVT', E['plantTrade']!, { subject: 'Atlas Getriebemotoren AG (SYNTHETIC)', predicate: 'opens_plant', object_value: 'Tangier, Morocco', confidence: 0.86,
      qualifiers: { effective_date: '2026-10-01', capacity_per_month: 12000, product: 'gear motors', market: 'Morocco' } })).id;
    await resolveRun();
    W['tangier'] = String((await one(sql`select entity_id::text from graph.entities_current where tenant_id = ${T}::uuid and domain_id = ${D}::uuid and entity_type = 'place' and canonical_name = 'Tangier, Morocco (SYNTHETIC)'`))['entity_id']);
    W['beforeAgent'] = await dbNow();
    const run = (await runScan(W['agent']!)).run;
    expect(run, JSON.stringify(run).slice(0, 800)).toMatchObject({ outcome: 'finished' });
    const out = run['outputs'] as Row;
    expect(out['proposed']).toHaveLength(1);
    const p0 = (out['proposed'] as Row[])[0]!;
    expect(p0).toMatchObject({ competitor_id: W['atlas'], material: true, source_diversity: expect.objectContaining({ independent_publishers: 2, below_threshold: false }) });
    expect((p0['evidence'] as string[]).sort()).toEqual([E['plant']!.id, E['plantTrade']!.id].sort());
    expect(out['marks']).toEqual([expect.objectContaining({ competitor_id: W['atlas'], proposed: 1 })]);
    // the boundary exercised: the agent's attempt to approve its own proposal refused at the PDP, recorded on the run
    expect((run['refusals'] as Row[]).map((x) => x['action'])).toContain('domain.competitor.assessment.approve');
    W['agentProposal'] = String(p0['proposal_id']);
    const prop = await proposalOf(W['agentProposal']);
    expect(prop).toMatchObject({ proposed_via: 'agent', agent_id: W['agent'], run_id: run['runId'] ?? expect.any(String), base_version: 2, state: 'proposed', material: true });
    const content = prop['content'] as Row;
    expect(content['events']).toEqual([expect.objectContaining({ kind: 'plant_opened', effective_date: '2026-10-01', place_entity_id: W['tangier'], market: 'Morocco',
      details: expect.objectContaining({ capacity_per_month: 12000 }) })]);
    expect((content['changes'] as Row[]).map((c) => `${String(c['op'])} ${String((c['fact'] as Row)['key'])}`)).toEqual(['add facility:tangier-morocco-synthetic']);
    expect(content['interpretation']).toMatchObject({ confidence: 0.86, confidence_basis: expect.stringMatching(/lowest extraction confidence/) });
    // THE NAMED ANALYST APPROVES (digest-bound)
    const v3 = (await decide(hoffmann, W['agentProposal'], 'approved', String(prop['content_digest']))).decision;
    expect(v3).toMatchObject({ version: 3, profile_state: 'approved', effective_from: '2026-10-01', object: expect.objectContaining({ object_type: 'CPF', object_version: 3 }) });
    W['afterAgent'] = await dbNow();
    W['assessment'] = String(v3['assessment_id']);
    expect(v3['alerts']).toEqual([expect.objectContaining({ watchlist_id: W['watch'], rule_key: 'new-capacity', item: expect.objectContaining({ state: 'open', owner: jweber.principalId, route_roles: ['strategy_owner'], policy_version: 1 }) })]);
    const item = await one(sql`select signal_class, subject_kind, subject_id::text, state, owner_principal_id::text owner, route_roles, title, details from executive.attention_items
                                where tenant_id = ${T}::uuid and subject_id = ${W['atlas']}::uuid and signal_class = 'domain.alert'`);
    expect(item).toMatchObject({ signal_class: 'domain.alert', subject_kind: 'competitor_profile', state: 'open', owner: jweber.principalId, route_roles: ['strategy_owner'] });
    expect(String(item['title'])).toMatch(/^Atlas Getriebemotoren AG \(SYNTHETIC\): new capacity in our markets \(Tangier, Morocco \(SYNTHETIC\)\) — profile v3$/);
    expect(item['details']).toMatchObject({ response: expect.stringMatching(/decision layer/), profile_version: 3 });
    const events = await rows(sql`select kind, place_entity_id::text, effective_date::text, state from domain.competitor_events where competitor_id = ${W['atlas']}::uuid`);
    expect(events).toEqual([{ kind: 'plant_opened', place_entity_id: W['tangier'], effective_date: '2026-10-01', state: 'recorded' }]);
    const asmt = await one(sql`select version, state, material, confidence::float from domain.competitor_assessments where assessment_id = ${W['assessment']}::uuid`);
    expect(asmt).toMatchObject({ version: 1, state: 'approved', material: true, confidence: 0.86 });
    // a second scan reads nothing new (the marks moved): nothing proposed
    const again = (await runScan(W['agent']!)).run;
    expect(again).toMatchObject({ outcome: 'finished' });
    expect((again['outputs'] as Row)['proposed']).toEqual([]);
    expect((again['outputs'] as Row)['scanned']).toBe(0);
  });

  it('refusal: the proposer never approves its own change; a stale digest; a strategy owner is not the analyst; a watchlist owned by a principal outside the roles; a proposal identical to an open one', async () => {
    const p = (await propose(hweber, W['atlas']!, { effective_from: '2026-10-05', events: [], changes: [
      { op: 'add', fact: { key: 'market:morocco', kind: 'market', value: { name: 'Morocco' }, citations: [evidenceCite(E['plant']!), evidenceCite(E['plantTrade']!)], confidence: 0.9 } }] })).proposal;
    W['moroccoProposal'] = String(p['proposal_id']); W['moroccoDigest'] = String(p['content_digest']);
    await refused(decide(hweber, W['moroccoProposal'], 'approved', W['moroccoDigest']), /^competitor assessment rejected \(separation_of_duties\): the analyst who proposed a change does not approve it/, 403);
    await refused(decide(hoffmann, W['moroccoProposal'], 'approved', 'e'.repeat(64)), /^competitor assessment rejected \(stale\): the decision names digest/, 409);
    await refused(decide(jweber, W['moroccoProposal'], 'approved', W['moroccoDigest']), /no qualifying role binding/, 403);
    await refused(decide(hoffmann, W['moroccoProposal'], 'declined', W['moroccoDigest'], 'no'), /^competitor assessment rejected \(reason\)/, 422);
    await refused(propose(hweber, W['atlas']!, (await proposalOf(W['moroccoProposal']))['content'] as Row), /^competitor profile rejected \(duplicate\)/, 409);
    await refused(watchlist(jweber, { title: 'Owned by the executive', ownerPrincipalId: executive.principalId, rules: [{ rule_key: 'x-rule', event_kinds: ['plant_opened'] }] }), /^competitor watchlist rejected \(owner\)/, 422);
    await refused(watchlist(jweber, { title: 'No kinds', ownerPrincipalId: jweber.principalId, rules: [{ rule_key: 'empty' }] }), /^competitor watchlist rejected \(request\)/, 422);
    await refused(watchlist(executive, { title: 'By the executive', ownerPrincipalId: jweber.principalId, rules: [{ rule_key: 'x-rule', event_kinds: ['plant_opened'] }] }), /no qualifying role binding/, 403);
    expect((await proposalOf(W['moroccoProposal']))['state']).toBe('proposed');
  });

  it('recovery: a declined proposal is recorded with its reason; the watchlist retired → an approved material change raises nothing; declared anew → the next one raises again', async () => {
    const declined = (await decide(hoffmann, W['moroccoProposal']!, 'declined', W['moroccoDigest']!, 'the Moroccan market entry is not yet evidenced by sales')).decision;
    expect(declined).toMatchObject({ state: 'declined' });
    await cc.retireWatchlist(r(jweber, 'domain.competitor.watchlist', 'DCW', W['watch']!), T, D, W['watch']!, { payload: { reason: 'superseded by the market-entry watchlist' } });
    const before = (await rows(sql`select item_id from executive.attention_items where tenant_id = ${T}::uuid and subject_id = ${W['atlas']}::uuid and signal_class = 'domain.alert'`)).length;
    const quiet = await proposeAndApprove(hweber, hoffmann, W['atlas']!, { effective_from: '2026-10-06', events: [], changes: [
      { op: 'add', fact: { key: 'market:morocco', kind: 'market', value: { name: 'Morocco', since: '2026-10-06' }, citations: [evidenceCite(E['plant']!), evidenceCite(E['plantTrade']!)], confidence: 0.9 } }] });
    expect(quiet).toMatchObject({ version: 4, profile_state: 'approved', alerts: [] });
    expect((await rows(sql`select item_id from executive.attention_items where tenant_id = ${T}::uuid and subject_id = ${W['atlas']}::uuid and signal_class = 'domain.alert'`)).length).toBe(before);
    W['watch2'] = String((await watchlist(jweber, { title: 'Market entries and capacity (SYNTHETIC)', ownerPrincipalId: jweber.principalId, freshnessDays: 30,
      rules: [{ rule_key: 'market-entry', title: 'a competitor enters our markets', fact_kinds: ['market', 'facility'], event_kinds: ['plant_opened', 'capacity_change', 'market_entry'], markets: ['Poland', 'Morocco', 'Germany'] }] }))['watchlist_id']);
    const loud = await proposeAndApprove(hweber, hoffmann, W['atlas']!, { effective_from: '2026-10-07', events: [], changes: [
      { op: 'replace', fact: { key: 'market:morocco', kind: 'market', value: { name: 'Morocco', since: '2026-10-07', note: 'distribution opened' }, citations: [evidenceCite(E['plant']!), evidenceCite(E['plantTrade']!)], confidence: 0.9 } }] });
    expect(loud).toMatchObject({ version: 5, alerts: [expect.objectContaining({ watchlist_id: W['watch2'], rule_key: 'market-entry', item: expect.objectContaining({ state: 'open', owner: jweber.principalId }) })] });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI4 · comparisons on a declared, versioned basis; source diversity measured', () => {
  const METRIC = { key: 'capacity', fact_kind: 'capability', definition: 'nameplate gear-motor output per month across all plants', unit: 'units/month', period: 'month', population: 'gear motors 0.1–5 kW' };
  beforeAll(async () => {
    // Kessler: two independent publishers; Lindqvist: one (its capacity reported per YEAR — an incompatible definition)
    E['kessler'] = await evidence('kessler-press', 'kessler-profile', ['Kessler Antriebe GmbH (SYNTHETIC) makes 30000 gear motors 0.1-5 kW a month.']);
    E['kesslerTrade'] = await evidence('trade-press', 'trade-kessler-portrait', ['Trade press: Kessler Antriebe GmbH (SYNTHETIC), 30000 units a month.']);
    E['lindqvist'] = await evidence('trade-press', 'trade-lindqvist-portrait', ['Trade press: Lindqvist Motoren AB (SYNTHETIC) builds 200000 gear motors a year.']);
    const k1 = await mention(E['kessler']!, 'Kessler Antriebe GmbH (SYNTHETIC)', 'organization', 'SYN-KESSLER-001');
    await mention(E['kesslerTrade']!, 'Kessler Antriebe GmbH (SYNTHETIC)', 'organization', 'SYN-KESSLER-001');
    const l1 = await mention(E['lindqvist']!, 'Lindqvist Motoren AB (SYNTHETIC)', 'organization', 'SYN-LINDQVIST-001');
    await resolveRun();
    W['kessler'] = String((await declareCompetitor(hweber, String((await entityOf(k1.id))['entity_id']), 'Kessler Antriebe GmbH (SYNTHETIC)', hweber.principalId)).competitor['competitor_id']);
    W['lindqvist'] = String((await declareCompetitor(hweber, String((await entityOf(l1.id))['entity_id']), 'Lindqvist Motoren AB (SYNTHETIC)', hweber.principalId)).competitor['competitor_id']);
    await proposeAndApprove(hweber, hoffmann, W['kessler'], { effective_from: '2026-01-01', events: [], changes: [
      { op: 'add', fact: { key: 'capability:capacity', kind: 'capability', value: { amount: 30000, unit: 'units/month', period: 'month', population: 'gear motors 0.1–5 kW' },
                          citations: [evidenceCite(E['kessler']!), evidenceCite(E['kesslerTrade']!)], confidence: 0.85 } }] });
    const lq = await proposeAndApprove(hweber, hoffmann, W['lindqvist'], { effective_from: '2026-01-01', events: [], changes: [
      { op: 'add', fact: { key: 'capability:capacity', kind: 'capability', value: { amount: 200000, unit: 'units/year', period: 'year', population: 'gear motors 0.1–5 kW' },
                          citations: [evidenceCite(E['lindqvist']!)], confidence: 0.7 } }] });
    // one publisher: approved by the analyst, LIMITED by the measure (single origin)
    expect(lq).toMatchObject({ profile_state: 'limited', limited_reasons: [expect.objectContaining({ class: 'source_diversity' })] });
  });

  it('positive: basis v1 declared; Atlas and Kessler compared on it → current, three independent publishers, every row citing its profile version', async () => {
    expect(await basis(hoffmann, 'gear-motor-capacity', [METRIC])).toMatchObject({ version: 1, supersedes: null });
    const c = await compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['kessler']!]);
    expect(c).toMatchObject({ basis_version: 1, state: 'current', limited_reasons: [], source_diversity: expect.objectContaining({ independent_publishers: 3, below_threshold: false }) });
    expect((c['rows'] as Row[]).map((x) => [x['name'], x['value'], x['unit']])).toEqual([['Atlas Getriebemotoren AG (SYNTHETIC)', 40000, 'units/month'], ['Kessler Antriebe GmbH (SYNTHETIC)', 30000, 'units/month']]);
    W['comparison1'] = String(c['comparison_id']);
  });

  it('refusal: incompatible definitions (per year against per month) are never compared; one competitor; an unknown basis; a republished release counts once (correlated → below the threshold, said)', async () => {
    await refused(compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['lindqvist']!]),
      /^competitor comparison rejected \(basis\): Lindqvist Motoren AB \(SYNTHETIC\) reports capacity in units\/year per year .* incompatible definitions are not compared/, 422);
    await refused(compare(hoffmann, 'gear-motor-capacity', [W['atlas']!]), /^competitor comparison rejected \(request\)/, 422);
    await refused(compare(hoffmann, 'no-such-basis', [W['atlas']!, W['kessler']!]), /^competitor comparison rejected \(unknown_basis\)/, 404);
    await refused(basis(hoffmann, 'gear-motor-capacity', [{ ...METRIC, unit: '' }]), /^competitor comparison rejected \(basis\): metric capacity declares/, 422);
    await refused(basis(hoffmann, 'gear-motor-capacity', [METRIC]), /^competitor comparison rejected \(duplicate\)/, 409);
    // the same bytes republished through another source: two publishers on paper, ONE independent origin
    const text = ['Atlas Getriebemotoren AG (SYNTHETIC) opens a showroom in Casablanca (republished release).'];
    E['repost1'] = await evidence('atlas-press', 'atlas-casablanca', text);
    E['repost2'] = await evidence('trade-press', 'atlas-casablanca', text);
    for (const ev of [E['repost1']!, E['repost2']!]) await mention(ev, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'organization', 'SYN-ATLAS-001');
    await resolveRun();
    const p = (await propose(hweber, W['atlas']!, { effective_from: '2026-10-08', events: [], changes: [
      { op: 'add', fact: { key: 'facility:casablanca', kind: 'facility', value: { place: 'Casablanca', status: 'showroom' }, citations: [evidenceCite(E['repost1']!), evidenceCite(E['repost2']!)], confidence: 0.8 } }] })).proposal;
    expect(p['source_diversity']).toMatchObject({ publishers: 2, independent_publishers: 1, single_origin: true, below_threshold: true,
      correlated: [expect.objectContaining({ kind: 'same_bytes', evidence: [E['repost1']!.id, E['repost2']!.id].sort() })] });
    W['repostProposal'] = String(p['proposal_id']); W['repostDigest'] = String(p['content_digest']);
  });

  it('recovery: the correlated proposal declined; basis v2 redefines the metric → the v1 comparison SUSPENDED (never silently re-read); compared again on v2 → current', async () => {
    await decide(hoffmann, W['repostProposal']!, 'declined', W['repostDigest']!, 'a single release republished — not independent corroboration');
    const v2 = await basis(hoffmann, 'gear-motor-capacity', [{ ...METRIC, definition: 'shipped gear-motor output per month across all plants (not nameplate)' }]);
    expect(v2).toMatchObject({ version: 2, supersedes: 1, incompatible_change: true, suspended: [W['comparison1']] });
    expect(await one(sql`select state, suspended_reason from domain.competitor_comparisons where comparison_id = ${W['comparison1']}::uuid`))
      .toMatchObject({ state: 'suspended', suspended_reason: expect.stringMatching(/superseded by version 2 with changed definitions/) });
    const c2 = await compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['kessler']!]);
    expect(c2).toMatchObject({ basis_version: 2, state: 'current' });
    W['comparison2'] = String(c2['comparison_id']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI6 · THE CONTINUITY CONTRACT (the AT-29 fault exercise): mistaken identity, conflicting evidence, stale coverage → limited, preserved, suspended, routed; recovered', () => {
  it('fault: a mention the graph resolved to Atlas by name (accepted by a person) is SPLIT off as another firm → the fact resting on it is LIMITED in a new version, the comparison SUSPENDED, revalidation ROUTED to the profile\'s owner', async () => {
    E['poland'] = await evidence('trade-press', 'trade-atlas-poland', ['Trade press: "Atlas Getriebemotoren AG" opens a sales office in Poland (in fact Atlas Getriebe GmbH, another firm).']);
    const wrong = await mention(E['poland']!, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'organization', null);   // a name-only mention
    await resolveRun(resman);
    const proposed = await entityOf(wrong.id);
    expect(proposed).toMatchObject({ state: 'proposed', method: 'deterministic_name', entity_id: W['atlasEntity'] });   // never auto-accepted on a name (rule 1)
    await graph.decide(r(resman2, 'graph.resolution.decide', 'RES', String(proposed['resolution_id'])), T, D, String(proposed['resolution_id']),
      { payload: { decision: 'accept', reason: 'same name as the competitor (a mistaken identity, found later)' } });
    expect(await entityOf(wrong.id)).toMatchObject({ state: 'accepted', entity_id: W['atlasEntity'] });
    const v6 = await proposeAndApprove(hweber, hoffmann, W['atlas']!, { effective_from: '2026-10-08', events: [], changes: [
      { op: 'add', fact: { key: 'market:poland', kind: 'market', value: { name: 'Poland' }, citations: [evidenceCite(E['poland']!), evidenceCite(E['profile']!)], confidence: 0.7 } }] });
    expect(v6).toMatchObject({ version: 6, profile_state: 'approved' });
    // the identity is found mistaken: the resolution manager splits the mention off (the graph's own port)
    await graph.split(r(resman, 'graph.entity.split', 'ENT', W['atlasEntity']!), T, D, W['atlasEntity']!,
      { payload: { resolutionIds: [String(proposed['resolution_id'])], canonicalName: 'Atlas Getriebe GmbH (SYNTHETIC)', entityType: 'organization', reason: 'a different firm with a similar name (B33 fault exercise)' } });
    expect((await rows(sql`select competitor_id::text from domain.dci_needs_revalidation(${T}::uuid, ${D}::uuid)`)).map((x) => x['competitor_id'])).toContain(W['atlas']);
    const rv = await revalidate(hoffmann, W['atlas']!);
    expect(rv).toMatchObject({ head_version: 6, version: 7, limited_facts: [expect.objectContaining({ key: 'market:poland' })], object: expect.objectContaining({ object_type: 'CPF', object_version: 7 }) });
    expect(rv['suspended_comparisons']).toContain(W['comparison2']);
    expect(rv['routed']).toEqual([expect.objectContaining({ existing: false })]);
    const v7 = await one(sql`select state, limited_reasons, facts from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid and version = 7`);
    expect(v7).toMatchObject({ state: 'limited' });
    const poland = (v7['facts'] as Row[]).find((f) => f['key'] === 'market:poland')!;
    expect(poland).toMatchObject({ limited: true, limited_reasons: [expect.objectContaining({ class: 'identity', state: 'mistaken' })] });
    expect((v7['facts'] as Row[]).filter((f) => f['limited'] === true)).toHaveLength(1);   // only the fact resting on the mistaken identity
    const item = await one(sql`select i.state, i.owner_principal_id::text owner, i.signal_class, i.subject_kind from executive.attention_items i join domain.competitor_revalidations v on v.item_id = i.item_id
                                where v.competitor_id = ${W['atlas']}::uuid and v.reason_class = 'identity'`);
    expect(item).toMatchObject({ signal_class: 'domain.alert', subject_kind: 'competitor_profile', state: 'open', owner: hweber.principalId });
    const shown = await readCompetitor(jweber, W['atlas']!);
    expect(shown['presented']).toMatchObject({ state: 'limited' });
    expect((shown['presented'] as Row)['reasons']).toEqual(expect.arrayContaining([expect.stringMatching(/no longer resolved to Atlas/), 'revalidation open (identity)']));
    // the prior version is untouched and replayable
    expect(await one(sql`select state, facts from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid and version = 6`)).toMatchObject({ state: 'superseded' });
  });

  it('fault: conflicting evidence on the plant (an open contradiction) → the facility fact and the event LIMITED, both sides PRESERVED; a revalidation routed; stale coverage of a competitor routes one too', async () => {
    const conflicting = await plantClaim('CLM', E['plantTrade']!, { subject: 'Atlas Getriebemotoren AG (SYNTHETIC)', predicate: 'opens_plant', object_value: 'Tangier opening postponed to 2027', confidence: 0.6 });
    await sql`insert into intelligence.contradictions (contradiction_id, scope, tenant_id, domain_id, kind, a_object_id, a_version, b_object_id, b_version, subject, predicate, a_value, b_value, detected_by, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'claim.value', ${W['evt1']!}::uuid, 1, ${conflicting.id}::uuid, 1, 'Atlas Getriebemotoren AG (SYNTHETIC)', 'opens_plant',
                      'Tangier, Morocco', 'Tangier opening postponed to 2027', ${hoffmann.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    W['contraClaim'] = conflicting.id;
    const rv = await revalidate(hoffmann, W['atlas']!);
    expect(rv).toMatchObject({ version: 8 });
    const v8 = await one(sql`select state, facts from domain.competitor_profile_versions where competitor_id = ${W['atlas']}::uuid and version = 8`);
    const facility = (v8['facts'] as Row[]).find((f) => f['key'] === 'facility:tangier-morocco-synthetic')!;
    expect(facility).toMatchObject({ limited: true, limited_reasons: [expect.objectContaining({ class: 'contradiction', contradictions: [expect.objectContaining({ a: expect.objectContaining({ value: 'Tangier, Morocco' }), b: expect.objectContaining({ value: 'Tangier opening postponed to 2027' }) })] })] });
    expect(await one(sql`select state, limited_reason from domain.competitor_events where competitor_id = ${W['atlas']}::uuid and kind = 'plant_opened'`)).toMatchObject({ state: 'limited' });
    expect(await one(sql`select state, version from domain.competitor_assessments where assessment_id = ${W['assessment']!}::uuid and state <> 'superseded'`)).toMatchObject({ state: 'limited', version: 2 });
    expect((await rows(sql`select reason_class from domain.competitor_revalidations where competitor_id = ${W['atlas']}::uuid and state = 'open' order by reason_class`)).map((x) => x['reason_class']))
      .toEqual(['contradiction', 'identity']);
    // STALE COVERAGE: Nordmark's only evidence is 40 days old (planted EVD: its recorded_at is what the coverage reads)
    const old = await plantEvidence('nordmark-catalogue', 40);
    const nm = await plantClaim('ENT', old, { subject: 'Nordmark Antriebe AG (SYNTHETIC)', predicate: 'is_a', object_value: 'gear-motor maker', confidence: 0.95,
      qualifiers: { entity_type: 'organization', identifiers: { [REGISTER]: 'SYN-NORDMARK-001' } } }, old.recordedAt);
    await resolveRun();
    W['nordmark'] = String((await declareCompetitor(hweber, String((await entityOf(nm.id))['entity_id']), 'Nordmark Antriebe AG (SYNTHETIC)', hweber.principalId)).competitor['competitor_id']);
    const nv1 = await proposeAndApprove(hweber, hoffmann, W['nordmark'], { effective_from: '2026-08-01', events: [], changes: [
      { op: 'add', fact: { key: 'product:servo-gear-motors', kind: 'product', value: { name: 'servo gear motors' }, citations: [evidenceCite(old)], confidence: 0.7 } }] });
    expect(nv1).toMatchObject({ profile_state: 'limited', source_diversity: expect.objectContaining({ unknown_origin: 1, independent_publishers: 0 }) });
    const nrv = await revalidate(hoffmann, W['nordmark']);
    expect(nrv).toMatchObject({ version: null, coverage: expect.objectContaining({ state: 'stale', freshness_days: 30 }), routed: [expect.objectContaining({ existing: false })] });
    expect((await readCompetitor(jweber, W['nordmark'])).presented).toMatchObject({ state: 'limited', reasons: expect.arrayContaining([expect.stringMatching(/^coverage stale/)]) });
    // a second revalidation finds the same and routes nothing new (one open revalidation per competitor and reason)
    expect(await revalidate(hoffmann, W['nordmark'])).toMatchObject({ version: null, routed: [expect.objectContaining({ existing: true })] });
  });

  it('refusal: revalidation is an analyst\'s or the agent\'s; an unknown competitor; the guards keep every version as written', async () => {
    await refused(revalidate(jweber, W['atlas']!), /no qualifying role binding/, 403);
    await refused(revalidate(hoffmann, uuidv7()), /^competitor profile rejected \(unknown_competitor\)/, 404);
    const raised = async (q: ReturnType<typeof sql>) => { try { await q.execute(h.su); return ''; } catch (e) { return (e as Error).message; } };
    expect(await raised(sql`update domain.competitor_profile_versions set facts = '[]'::jsonb where competitor_id = ${W['atlas']}::uuid and version = 6`)).toMatch(/^competitor profile rejected \(state\): column facts/);
    expect(await raised(sql`delete from domain.competitor_events where competitor_id = ${W['atlas']}::uuid`)).toMatch(/never deleted/);
    expect(await raised(sql`update domain.competitor_ledger set event = 'proposal.approved' where competitor_id = ${W['atlas']}::uuid`)).toMatch(/append-only|append only/i);
  });

  it('recovery: the contradiction adjudicated; the analyst ends the mistaken fact and restates the plant on its evidence → a version approved IN FULL; the revalidations RESOLVED and their items CLOSED; fresh coverage resolves the stale one', async () => {
    await sql`update intelligence.contradictions set state = 'adjudicated', adjudicated_by = ${hoffmann.principalId}::uuid, adjudicated_at = clock_timestamp(), adjudication = 'b_withdrawn',
              adjudication_reason = 'the postponement report was withdrawn by its publisher' where a_object_id = ${W['evt1']!}::uuid and b_object_id = ${W['contraClaim']!}::uuid`.execute(h.su);
    const v9 = await proposeAndApprove(hweber, hoffmann, W['atlas']!, { effective_from: '2026-10-09', events: [], changes: [
      { op: 'end', fact: { key: 'market:poland', kind: 'market' } },
      { op: 'replace', fact: { key: 'facility:tangier-morocco-synthetic', kind: 'facility', value: { place: 'Tangier, Morocco (SYNTHETIC)', status: 'operating', since: '2026-10-01', capacity_per_month: 12000 },
                              citations: [evidenceCite(E['plant']!), evidenceCite(E['plantTrade']!)], confidence: 0.86 } }] });
    expect(v9).toMatchObject({ version: 9, profile_state: 'approved', limited_reasons: [] });
    expect(v9['revalidations_resolved']).toHaveLength(2);
    expect((v9['revalidations_resolved'] as Row[]).every((x) => (x['closed_items'] as unknown[]).length === 1)).toBe(true);
    const closed = await rows(sql`select i.state, e.details from executive.attention_items i join domain.competitor_revalidations v on v.item_id = i.item_id
                                   join executive.attention_item_events e on e.item_id = i.item_id and e.event = 'item.closed' where v.competitor_id = ${W['atlas']}::uuid`);
    expect(closed).toHaveLength(2);
    expect(closed.every((x) => x['state'] === 'closed' && /revalidated: profile version 9 approved in full/.test(String((x['details'] as Row)['reason'])))).toBe(true);
    expect((await readCompetitor(jweber, W['atlas']!)).presented).toMatchObject({ state: 'current' });
    // Nordmark: fresh, independent evidence → its coverage fresh; the product restated on two publishers → approved; the coverage revalidation resolved
    const f1 = await evidence('trade-press', 'trade-nordmark-servo', ['Trade press: Nordmark Antriebe AG (SYNTHETIC) launches servo gear motors.']);
    const f2 = await evidence('kessler-press', 'kessler-nordmark-partner', ['Kessler (SYNTHETIC) names Nordmark Antriebe AG (SYNTHETIC) a servo gear-motor supplier.']);
    for (const ev of [f1, f2]) await mention(ev, 'Nordmark Antriebe AG (SYNTHETIC)', 'organization', 'SYN-NORDMARK-001');
    await resolveRun();
    const nv = await proposeAndApprove(hweber, hoffmann, W['nordmark']!, { effective_from: '2026-10-09', events: [], changes: [
      { op: 'replace', fact: { key: 'product:servo-gear-motors', kind: 'product', value: { name: 'servo gear motors', confirmed: true }, citations: [evidenceCite(f1), evidenceCite(f2)], confidence: 0.85 } }] });
    expect(nv).toMatchObject({ profile_state: 'approved', revalidations_resolved: [expect.objectContaining({ closed_items: [expect.any(String)] })] });
    expect((await readCompetitor(jweber, W['nordmark']!)).presented).toMatchObject({ state: 'current' });
    // the suspended comparison stays suspended; a fresh one on the recovered profiles is current
    expect((await one(sql`select state from domain.competitor_comparisons where comparison_id = ${W['comparison2']!}::uuid`))['state']).toBe('suspended');
    expect(await compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['kessler']!])).toMatchObject({ state: 'current', basis_version: 2 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI7 · the entity-resolution corpus, as-of replay, analyst challenge and decision-use evidence (AT-29 / PR-29-006 — the software part; the signed record is R2\'s)', () => {
  it('positive: the CORPUS (synthetic) — identifier mentions resolve to their organization automatically, a name-only mention is never auto-accepted, a different firm\'s identifier never lands on the competitor; measured', async () => {
    const ev = await evidence('trade-press', 'trade-corpus', ['Corpus: Atlas, ATLAS, Atlas Getriebe GmbH, Kessler — synthetic mentions for the entity-resolution corpus.']);
    const corpus = [
      { text: 'Atlas Getriebemotoren AG (SYNTHETIC)', id: 'SYN-ATLAS-001', expect: 'atlas-auto' },
      { text: 'ATLAS GETRIEBEMOTOREN AG (SYNTHETIC)', id: null, expect: 'not-auto' },
      { text: 'Atlas Getriebe GmbH (SYNTHETIC)', id: 'SYN-ATLAS-GMBH-001', expect: 'not-atlas' },
      { text: 'Kessler Antriebe GmbH (SYNTHETIC)', id: 'SYN-KESSLER-001', expect: 'kessler-auto' },
    ] as const;
    const planted = [];
    for (const c of corpus) planted.push({ ...c, claim: await mention(ev, c.text, 'organization', c.id) });
    await resolveRun();
    const kesslerEntity = String((await one(sql`select entity_id::text from domain.competitors where competitor_id = ${W['kessler']!}::uuid`))['entity_id']);
    const results = [];
    for (const p of planted) {
      const res = await entityOf(p.claim.id);
      const ok = p.expect === 'atlas-auto' ? res['state'] === 'accepted' && res['entity_id'] === W['atlasEntity']
        : p.expect === 'kessler-auto' ? res['state'] === 'accepted' && res['entity_id'] === kesslerEntity
        : p.expect === 'not-auto' ? res['state'] !== 'accepted'
        : !(res['state'] === 'accepted' && res['entity_id'] === W['atlasEntity']);
      results.push({ text: p.text, expect: p.expect, state: res['state'] ?? 'unresolved', method: res['method'] ?? null, ok });
    }
    expect(results.filter((x) => !x.ok), JSON.stringify(results)).toEqual([]);
    const accepted = results.filter((x) => x.state === 'accepted');
    console.log(`B33-CI CORPUS ${JSON.stringify({ mentions: results.length, accepted: accepted.length, correct: results.filter((x) => x.ok).length, results })}`);
  });

  it('positive: AS-OF REPLAY — what was believed before the agent\'s proposal was approved (v2, no Tangier plant), and which facts held on 30 September (the plant effective 1 October not yet)', async () => {
    const before = (await cc.asOf(r(jweber, 'domain.competitor.read', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { knownAt: W['beforeAgent'] } }) as { replay: Row }).replay;
    expect(before['believed']).toMatchObject({ version: 2, state_then: 'approved' });
    expect(((before['believed'] as Row)['facts'] as Row[]).map((f) => f['key'])).not.toContain('facility:tangier-morocco-synthetic');
    expect(before['events']).toEqual([]);
    const held = (await cc.asOf(r(jweber, 'domain.competitor.read', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { knownAt: W['afterAgent'], effectiveOn: '2026-09-30' } }) as { replay: Row }).replay;
    expect(held['believed']).toMatchObject({ version: 3, effective_from: '2026-10-01', state_then: 'approved' });
    expect(held['held']).toMatchObject({ version: 2, effective_from: '2026-03-01' });
    expect(held['events']).toEqual([]);
    const now = (await cc.asOf(r(jweber, 'domain.competitor.read', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: {} }) as { replay: Row }).replay;
    expect(now['believed']).toMatchObject({ version: 9 });
    await refused(cc.asOf(r(jweber, 'domain.competitor.read', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { effectiveOn: '30/09/2026' } }), /effectiveOn is a day/, 422);
  });

  it('positive + refusal + recovery: an ANALYST CHALLENGE — the challenger never decides it; one open challenge per assessment; upheld → a superseding version recorded with the challenge; a later challenge dismissed with its reason', async () => {
    const current = await one(sql`select version, confidence::float from domain.competitor_assessments where assessment_id = ${W['assessment']!}::uuid and state <> 'superseded'`);
    const ch = (await cc.challenge(r(hweber, 'domain.competitor.challenge', 'DCH', null), T, D, W['assessment']!, { payload: {
      reason: 'the trade report is a rewrite of the release: the confidence overstates corroboration', proposed: { confidence: 0.6 } } }) as { challenge: Row }).challenge;
    expect(ch).toMatchObject({ state: 'open', assessment_version: current['version'] });
    await refused(cc.challenge(r(hoffmann, 'domain.competitor.challenge', 'DCH', null), T, D, W['assessment']!, { payload: { reason: 'a second challenge while one is open', proposed: { limit: true } } }),
      /^competitor assessment rejected \(duplicate\)/, 409);
    const decideCh = (as: AuthenticatedPrincipal, id: string, decision: string, reason: string) =>
      cc.decideChallenge(r(as, 'domain.competitor.challenge.decide', 'DCH', id), T, D, id, { payload: { decision, reason } }) as Promise<{ challenge: Row }>;
    await refused(decideCh(hweber, String(ch['challenge_id']), 'upheld', 'my own challenge, upheld by me'), /^competitor assessment rejected \(separation_of_duties\)/, 403);
    await refused(decideCh(jweber, String(ch['challenge_id']), 'upheld', 'the strategy owner decides'), /no qualifying role binding/, 403);
    const up = (await decideCh(hoffmann, String(ch['challenge_id']), 'upheld', 'agreed: one origin rewritten; confidence lowered')).challenge;
    expect(up).toMatchObject({ state: 'upheld', version: Number(current['version']) + 1 });
    const next = await one(sql`select version, confidence::float, challenge_id::text, state from domain.competitor_assessments where assessment_id = ${W['assessment']!}::uuid and state <> 'superseded'`);
    expect(next).toMatchObject({ version: Number(current['version']) + 1, confidence: 0.6, challenge_id: ch['challenge_id'] });
    const ch2 = (await cc.challenge(r(hoffmann, 'domain.competitor.challenge', 'DCH', null), T, D, W['assessment']!, { payload: { reason: 'the plant may still slip to 2027', proposed: { limit: true } } }) as { challenge: Row }).challenge;
    expect((await decideCh(hweber, String(ch2['challenge_id']), 'dismissed', 'the postponement report was withdrawn; nothing new')).challenge).toMatchObject({ state: 'dismissed' });
    expect((await rows(sql`select event from domain.competitor_ledger where subject_id = any(${[String(ch['challenge_id']), String(ch2['challenge_id'])]}::uuid[]) order by occurred_at`)).map((x) => x['event']))
      .toEqual(['challenge.opened', 'challenge.upheld', 'challenge.opened', 'challenge.dismissed']);
  });

  it('positive + refusal: DECISION-USE EVIDENCE — a decision package (declared in the decision layer) cites profile v3; the response is the decision layer\'s, recorded here as a use', async () => {
    const { DecisionController } = await import('../../src/decision/decision.controller.js');
    const dc = h.app.get(DecisionController);
    const dec = await graph.declare(h.req(brandt, 'graph.strategy.declare', 'DEC', null, 'graph'), T, D, { payload: { objectType: 'DEC', title: 'Response to the Atlas Tangier plant (SYNTHETIC)',
      statement: 'price, capacity or channel response to a competitor\'s Moroccan plant', restsOn: [{ kind: 'entity', id: W['atlasEntity'], rationale: 'the decision is about this competitor' }] } }) as { strategy: { objectId: string } };
    const pkg = await dc.declare(h.req(brandt, 'decision.package.declare', 'DPK', null, 'decision'), T, D, { payload: { decisionObjectId: dec.strategy.objectId, title: 'Atlas Tangier response (SYNTHETIC)',
      statement: 'the executives decide the response', owner: brandt.principalId } }) as { package: { packageId: string } };
    const cite = (as: AuthenticatedPrincipal, version: number, packageId = pkg.package.packageId) =>
      cc.cite(r(as, 'domain.competitor.decision.cite', 'DCU', null), T, D, W['atlas']!, { payload: { packageId, version, note: 'the response package rests on the profile with the Tangier plant' } }) as Promise<{ use: Row }>;
    expect((await cite(brandt, 3)).use).toMatchObject({ profile_version: 3, profile_state: 'superseded' });
    await refused(cite(brandt, 3), /^competitor profile rejected \(duplicate\)/, 409);
    await refused(cite(hoffmann, 9), /no qualifying role binding/, 403);
    await refused(cite(brandt, 9, uuidv7()), /^competitor profile rejected \(unknown_package\)/, 404);
    await refused(cite(brandt, 99), /^competitor profile rejected \(unknown_version\)/, 404);
    const shown = await readCompetitor(jweber, W['atlas']!);
    expect(shown['decision_uses']).toEqual([expect.objectContaining({ package_id: pkg.package.packageId, profile_version: 3 })]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI8 · the families populated: a competitor twin and a market twin, linked; a capacity change PROPOSED to the twin\'s owner, who decides', () => {
  const tw = (p: AuthenticatedPrincipal, action: string, id: string | null) => h.req(p, action, 'TWN', id, 'twin');
  const declareTwin = async (kind: string, title: string, entity: string) => ((await twins.declare(tw(nakamura, 'twin.declare', null), T, D, { payload: { kind, title, statement: `${title} (B33 competitor harness)`,
    boundary: [entity], owner: nakamura.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } })) as { twin: { twinId: string } }).twin.twinId;
  async function admitVersion(twinId: string, elements: unknown[], carryFrom: number | null = null): Promise<number> {
    const o = await twins.openVersion(tw(nakamura, 'twin.version', twinId), T, D, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), carryFrom, except: carryFrom === null ? [] : ['capacity.per_month'] } }) as { version: { version: number } };
    const v = o.version.version;
    await twins.ground(tw(nakamura, 'twin.ground', twinId), T, D, twinId, String(v), { payload: { elements } });
    await twins.admit(tw(nakamura, 'twin.version.admit', twinId), T, D, twinId, String(v), { payload: { allowIncomplete: true } });
    return v;
  }
  const el = (key: string, value: number, unit: string, e: Evd) => ({ key, kind: 'assumed', value, unit, citations: [{ kind: 'evidence', id: e.id, version: e.version }] });
  const decideTwin = (as: AuthenticatedPrincipal, id: string, decision: string, version: number | null, note: string | null = null) =>
    cc.decideTwin(r(as, 'domain.competitor.twin.decide', 'DCT', id), T, D, id, { payload: { decision, version, note } }) as Promise<{ proposal: Row }>;

  it('positive: the market twin (price level) and Kessler\'s competitor twin, linked market → competitor (dependency completeness 1/1); bound by the twin owner; an approved capacity change PROPOSED (30000 → 35000); applied by the owner through the twin\'s own routes and recorded applied', async () => {
    const kesslerEntity = String((await one(sql`select entity_id::text from domain.competitors where competitor_id = ${W['kessler']!}::uuid`))['entity_id']);
    W['market'] = await declareTwin('market', 'EU gear-motor market (SYNTHETIC)', kesslerEntity);
    W['ctwin'] = await declareTwin('competitor', 'Kessler Antriebe — competitor twin (SYNTHETIC)', kesslerEntity);
    expect(await admitVersion(W['market'], [el('demand.volume_per_month', 400000, 'units/month', E['kesslerTrade']!), el('price.index', 100, 'index', E['kesslerTrade']!)])).toBe(1);
    expect(await admitVersion(W['ctwin'], [el('capacity.per_month', 30000, 'units/month', E['kessler']!)])).toBe(1);
    await comp.publishContract(tw(nakamura, 'twin.contract.publish', W['market']), T, D, W['market'], { payload: { exposed: { 'price.index': { unit: 'index', cadence: 'on-admission' } },
      approvedUses: { methodFamilies: ['agent-based'], decisionClasses: ['competitive-response'] } } });
    await comp.declareLink(tw(nakamura, 'twin.link.declare', W['ctwin']), T, D, { payload: { upstreamTwinId: W['market'], downstreamTwinId: W['ctwin'], mapping: [{ from: 'price.index', to: 'price.index' }], use: 'competitive-response' } });
    const bound = (await cc.bindTwin(r(nakamura, 'domain.competitor.twin.bind', 'DCI', W['kessler']!), T, D, W['kessler']!, { payload: { twinId: W['ctwin'] } }) as { binding: Row }).binding;
    expect(bound['dependencies']).toMatchObject({ required: ['market'], linked: ['market'] });
    E['kesslerExp'] = await evidence('kessler-press', 'kessler-expansion', ['Kessler Antriebe GmbH (SYNTHETIC) adds 5000 gear motors a month at its Brno line from 1 November 2026.']);
    E['kesslerExpTrade'] = await evidence('trade-press', 'trade-kessler-expansion', ['Trade press: Kessler (SYNTHETIC) expands by 5000 units a month.']);
    for (const ev of [E['kesslerExp']!, E['kesslerExpTrade']!]) await mention(ev, 'Kessler Antriebe GmbH (SYNTHETIC)', 'organization', 'SYN-KESSLER-001');
    await resolveRun();
    const cites = [evidenceCite(E['kesslerExp']!), evidenceCite(E['kesslerExpTrade']!)];
    const v = await proposeAndApprove(hweber, hoffmann, W['kessler']!, { effective_from: '2026-11-01', changes: [
      { op: 'replace', fact: { key: 'capability:capacity', kind: 'capability', value: { amount: 35000, unit: 'units/month', period: 'month', population: 'gear motors 0.1–5 kW' }, citations: cites, confidence: 0.8 } }],
      events: [{ kind: 'capacity_change', effective_date: '2026-11-01', place: 'Brno', market: 'Germany', details: { capacity_per_month: 5000 }, citations: cites }] });
    expect(v['twin_proposal']).toMatchObject({ twin_id: W['ctwin'], key: 'capacity.per_month', current_value: 30000, delta: 5000, proposed_value: 35000 });
    W['tp'] = String((v['twin_proposal'] as Row)['proposal_id']);
    // the owner's own act through the twin's routes, then the record
    W['tv2'] = String(await admitVersion(W['ctwin'], [el('capacity.per_month', 35000, 'units/month', E['kesslerExp']!)], 1));
    expect((await decideTwin(nakamura, W['tp'], 'applied', Number(W['tv2']))).proposal).toMatchObject({ state: 'applied', applied_version: 2, value: 35000 });
  });

  it('refusal: another twin owner binds or decides nothing; a market twin is not a competitor twin; an applied claim against a version without the value; a decline without a reason', async () => {
    await refused(cc.bindTwin(r(kovacs, 'domain.competitor.twin.bind', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { twinId: W['ctwin'] } }), /^competitor profile rejected \(ownership\)/, 403);
    await refused(cc.bindTwin(r(nakamura, 'domain.competitor.twin.bind', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { twinId: W['market'] } }), /^competitor profile rejected \(twin\): twin .* is of family market/, 422);
    await refused(cc.bindTwin(r(hoffmann, 'domain.competitor.twin.bind', 'DCI', W['atlas']!), T, D, W['atlas']!, { payload: { twinId: W['ctwin'] } }), /no qualifying role binding/, 403);
    // a second capacity change → a second proposal (the first applied)
    const cites = [evidenceCite(E['kesslerExp']!), evidenceCite(E['kesslerExpTrade']!)];
    const v = await proposeAndApprove(hweber, hoffmann, W['kessler']!, { effective_from: '2026-12-01', changes: [], events: [{ kind: 'capacity_change', effective_date: '2026-12-01', place: 'Brno shift 3', market: 'Germany', details: { capacity_per_month: 2000 }, citations: cites }] });
    W['tp2'] = String((v['twin_proposal'] as Row)['proposal_id']);
    expect(v['twin_proposal']).toMatchObject({ current_value: 35000, proposed_value: 37000 });
    await refused(decideTwin(kovacs, W['tp2'], 'applied', 2), /^competitor profile rejected \(ownership\)/, 403);
    await refused(decideTwin(nakamura, W['tp2'], 'applied', 2), /^competitor profile rejected \(twin\): version 2 of twin .* holds capacity.per_month = 35000, not the proposed 37000/, 422);
    await refused(decideTwin(nakamura, W['tp2'], 'declined', null, 'no'), /^competitor profile rejected \(reason\)/, 422);
    await refused(decideTwin(nakamura, W['tp'], 'declined', null, 'already applied — a second decision'), /^competitor profile rejected \(state\)/, 409);
  });

  it('recovery: the owner declines the second change with a reason (the twin is the owner\'s); recorded on the ledger', async () => {
    expect((await decideTwin(nakamura, W['tp2']!, 'declined', null, 'the third shift is a temporary measure; the twin keeps 35000')).proposal).toMatchObject({ state: 'declined' });
    expect((await rows(sql`select event from domain.competitor_ledger where subject_kind = 'twin_proposal' and competitor_id = ${W['kessler']!}::uuid order by occurred_at`)).map((x) => x['event']))
      .toEqual(['twin.proposed', 'twin.applied', 'twin.proposed', 'twin.declined']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI-R · the B25 lessons on the new kind: the after-tick hook STARTED (bounded, one in flight); a budget stop; a lapsed run ENDS stopped', () => {
  let attention: AuthenticatedPrincipal;
  beforeAll(async () => { attention = await h.humanWithSession(['attention_agent'], 'attention-hook'); });
  const tick = () => svc.afterTick({ principal: attention, tenantId: T, domainId: D, correlationId: uuidv7() });

  it('positive: nothing pending → the hook starts nothing; new claims on a watched competitor → the scan STARTED and the tick returns (bounded); a second tick meanwhile starts no second scan; the scan finishes on its own', async () => {
    await runScan(W['agent']!);   // drain what the earlier cases left (the corpus, the withdrawn side of the adjudicated contradiction is not read)
    expect(await tick()).toMatchObject({ scan: null, reason: expect.stringMatching(/^nothing pending/) });
    const ev = await evidence('kessler-press', 'kessler-launch', ['Kessler Antriebe GmbH (SYNTHETIC) launches a hygienic gear motor line on 15 November 2026.']);
    const ev2 = await evidence('trade-press', 'trade-kessler-launch', ['Trade press: Kessler (SYNTHETIC) hygienic gear motors from mid-November.']);
    for (const e of [ev, ev2]) {
      await mention(e, 'Kessler Antriebe GmbH (SYNTHETIC)', 'organization', 'SYN-KESSLER-001');
      await plantClaim('EVT', e, { subject: 'Kessler Antriebe GmbH (SYNTHETIC)', predicate: 'launches_product', object_value: 'hygienic gear motors', confidence: 0.75, qualifiers: { effective_date: '2026-11-15' } });
    }
    await resolveRun();
    svc.scanAwaitMs = 0;
    try {
      const first = await tick();
      expect(first['scan']).toMatchObject({ in_flight: true, agent_id: W['agent'] });
      const second = await tick();
      expect(String((second['scan'] as Row)['skipped'])).toMatch(/^a domain scan of agent .* is in flight since /);
      const done = await svc.inFlightOf(W['agent']!);
      expect(done).toMatchObject({ outcome: 'finished' });
    } finally { svc.scanAwaitMs = 30_000; }
    const run = await one(sql`select outcome, trigger_kind, trigger_ref, outputs from executive.agent_runs where agent_id = ${W['agent']!}::uuid order by started_at desc limit 1`);
    expect(run).toMatchObject({ outcome: 'finished', trigger_kind: 'scheduler', trigger_ref: 'domain-competitor-scan' });
    expect((run['outputs'] as Row)['proposed']).toEqual([expect.objectContaining({ competitor_id: W['kessler'], material: false })]);
  });

  it('refusal: a run whose budget is spent STOPS before its next unit (never past its session) and says so; the hook never waits on it', async () => {
    const tight = String((await registerAgent({ budgets: { max_reads: 0, max_gateway_calls: 0, max_elapsed_ms: 300_000 } })).agent['agentId']);
    const run = (await runScan(tight)).run;
    expect(run).toMatchObject({ outcome: 'stopped' });
    expect(String(run['stopReason'] ?? run['stop_reason'])).toMatch(/^budget: read budget of 0 reached before the watched competitors' backlog/);
    await sql`update executive.agents set status = 'revoked', revoked_at = clock_timestamp() where agent_id = ${tight}::uuid`.execute(h.su).catch(() => undefined);
  });

  it('recovery: a run left RUNNING past its session\'s lifetime (fixture: the shape a lapsed session leaves) is closed STOPPED with the reason by the agent\'s next run, which finishes', async () => {
    const id = uuidv7();
    await sql`insert into executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_ref, budget, started_at, correlation_id)
      select ${id}::uuid, 'DOMAIN', tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, 'domain_scan', 'scheduler', 'ci-r-fixture', budgets,
             clock_timestamp() - interval '2 hours', ${uuidv7()}::uuid from executive.agents where agent_id = ${W['agent']!}::uuid`.execute(h.su);
    const run = (await runScan(W['agent']!)).run;
    expect(run).toMatchObject({ outcome: 'finished' });
    const closed = await one(sql`select outcome, stop_reason from executive.agent_runs where run_id = ${id}::uuid`);
    expect(closed['outcome']).toBe('stopped');
    expect(String(closed['stop_reason'])).toMatch(/^session lapsed: the run started at .* and was still running a session's lifetime/);
    expect((await one(sql`select count(*)::int n from executive.agent_runs where agent_id = ${W['agent']!}::uuid and outcome = 'running'`))['n']).toBe(0);
  });

  it('every run of the harness\'s agents has ended (none left running); every CPF version is bound to its profile version', async () => {
    expect((await one(sql`select count(*)::int n from executive.agent_runs where tenant_id = ${T}::uuid and agent_kind = 'domain_intelligence' and outcome = 'running'`))['n']).toBe(0);
    expect((await one(sql`select count(*)::int n from domain.competitor_profile_versions where tenant_id = ${T}::uuid and cpf_digest is null`))['n']).toBe(0);
    const err = (m: string) => asObservationRefusal(Object.assign(new Error(m), { code: '22023' }), 'c')?.getStatus() ?? null;
    expect([err('competitor profile rejected (actor): x'), err('competitor assessment rejected (separation_of_duties): x'), err('competitor watchlist rejected (ownership): x')]).toEqual([403, 403, 403]);
    expect([err('competitor comparison rejected (unknown_basis): x'), err('competitor profile rejected (unknown_citation): x')]).toEqual([404, 404]);
    expect([err('competitor profile rejected (duplicate): x'), err('competitor assessment rejected (stale): x'), err('competitor comparison rejected (state): x')]).toEqual([409, 409, 409]);
    expect([err('competitor profile rejected (package): x'), err('competitor comparison rejected (basis): x'), err('competitor profile rejected (identity): x')]).toEqual([422, 422, 422]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI-P · every competitor write consults the PACKAGE_GATE (fixture: the function states set on the prelude\'s package version, as §PK\'s health port would)', () => {
  const setDisabled = (fns: Row) => sql`update domain.package_versions set disabled_functions = ${JSON.stringify(fns)}::jsonb where package_id = ${W['pkg']!}::uuid and version = 1`.execute(h.su);
  it('refusal: the `assess` function disabled → an approval refused in the class form with the package\'s reason; `compare` disabled → a comparison refused; `collect` disabled → the agent\'s backlog empty', async () => {
    const p = (await propose(hweber, W['kessler']!, { effective_from: '2026-12-15', events: [], changes: [
      { op: 'add', fact: { key: 'market:austria', kind: 'market', value: { name: 'Austria' }, citations: [evidenceCite(E['kessler']!), evidenceCite(E['kesslerTrade']!)], confidence: 0.8 } }] })).proposal;
    W['gateProposal'] = String(p['proposal_id']); W['gateDigest'] = String(p['content_digest']);
    await setDisabled({ assess: { reason: 'the source contract kessler-press lost its rights (B33 fixture)' }, compare: { reason: 'the basis registry is migrating (B33 fixture)' }, collect: { reason: 'collection paused (B33 fixture)' } });
    await refused(decide(hoffmann, W['gateProposal'], 'approved', W['gateDigest']), /^competitor assessment rejected \(package\): function assess of package competitor v1 is disabled: the source contract kessler-press lost its rights/, 422);
    await refused(compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['kessler']!]), /^competitor comparison rejected \(package\): function compare of package competitor v1 is disabled/, 422);
    expect(await rows(sql`select 1 from domain.dci_scan_backlog(${T}::uuid, ${D}::uuid, 10)`)).toEqual([]);
    const shown = await overview(jweber);
    expect(((shown['packages'] as Row)[PKG] as Row)['assess']).toMatchObject({ state: 'disabled' });
    expect((await proposalOf(W['gateProposal']))['state']).toBe('proposed');   // nothing decided, the proposal waits
  });
  it('recovery: the functions re-enabled → the same approval passes and the comparison runs', async () => {
    await setDisabled({});
    expect((await decide(hoffmann, W['gateProposal']!, 'approved', W['gateDigest']!)).decision).toMatchObject({ state: 'approved', profile_state: 'approved' });
    expect(await compare(hoffmann, 'gear-motor-capacity', [W['atlas']!, W['kessler']!])).toMatchObject({ state: 'current' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('CI-X · max_items enforced by the scan; another tenant sees nothing (AT-29 control fixtures: cross-tenant, unauthorized role)', () => {
  it('max_items: an agent registered with max_items 0 proposes nothing — the competitor WAITS, its scan mark unmoved; the regular agent then proposes it', async () => {
    const ev = await evidence('kessler-press', 'kessler-austria', ['Kessler Antriebe GmbH (SYNTHETIC) enters the Austrian market.']);
    const ev2 = await evidence('trade-press', 'trade-kessler-austria', ['Trade press: Kessler (SYNTHETIC) now sells in Austria.']);
    for (const e of [ev, ev2]) {
      await mention(e, 'Kessler Antriebe GmbH (SYNTHETIC)', 'organization', 'SYN-KESSLER-001');
      await plantClaim('EVT', e, { subject: 'Kessler Antriebe GmbH (SYNTHETIC)', predicate: 'enters_market', object_value: 'Austria (retail)', confidence: 0.7, qualifiers: { effective_date: '2026-12-20', market: 'Austria' } });
    }
    await resolveRun();
    const zero = String((await registerAgent({ stopConditions: [{ kind: 'max_items', value: 0 }] })).agent['agentId']);
    const marksBefore = (await one(sql`select count(*)::int n from domain.competitor_scan_marks where competitor_id = ${W['kessler']!}::uuid`))['n'];
    const held = (await runScan(zero)).run;
    expect(held).toMatchObject({ outcome: 'finished' });
    expect((held['outputs'] as Row)).toMatchObject({ proposed: [], max_items: 0, waiting: [expect.objectContaining({ competitor_id: W['kessler'], reason: expect.stringMatching(/^max_items reached/) })] });
    expect((await one(sql`select count(*)::int n from domain.competitor_scan_marks where competitor_id = ${W['kessler']!}::uuid`))['n']).toBe(marksBefore);
    const go = (await runScan(W['agent']!)).run;
    expect((go['outputs'] as Row)['proposed']).toEqual([expect.objectContaining({ competitor_id: W['kessler'] })]);
  });

  it('cross-tenant: a principal of another tenant reads no competitor of this one (its RLS answers nothing: 404), and its own context cannot name this one\'s', async () => {
    const U = uuidv7(); const DU = uuidv7();
    await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b33ci-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
    await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b33ci-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
    const id = uuidv7();
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, 'human', 'DOMAIN', ${U}::uuid, ${DU}::uuid, ${`b33ci-other-analyst-${RUN} (SYNTHETIC)`}, ${`b33ci-oa-${id.slice(-8)}`}, 'active')`.execute(h.su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, 'domain_analyst', 'DOMAIN', ${U}::uuid, ${DU}::uuid)`.execute(h.su);
    const other = await h.openSession({ ...h.manager, principalId: id, kind: 'human', homeScope: 'DOMAIN', homeTenantId: U, homeDomainId: DU,
      bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: U, domainId: DU }] } as AuthenticatedPrincipal);
    const req = (action: string) => ({ eyeEnvelope: { ...(h.env(other, action, 'DCI', W['atlas']!, 'intelligence') as unknown as Row), tenant_id: U, domain_id: DU }, eyePrincipal: other }) as never;
    await refused(cc.read(req('domain.competitor.read'), U, DU, W['atlas']!), /no authorized competitor matches/, 404);
    const ov = (await cc.overview(req('domain.competitor.read'), U, DU) as { overview: Row }).overview;
    expect(ov['competitors']).toEqual([]);
    await refused(cc.read(r(other, 'domain.competitor.read', 'DCI', W['atlas']!), T, D, W['atlas']!), /./, 403);
  });
});
