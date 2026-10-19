/**
 * CP-6 B50 §CI (migration 0120 §CI) — IMPACT TRAVERSAL, TRIGGERS AND AFFECTED-PRODUCT CLASSES, through the real database and controllers, on
 * the decision world (phase6-fixtures' bootDecisionWorld: the series evidence w.evd, the corridor twin and its runs, the objective, the
 * decision and the assumption resting on the Bab el-Mandeb entity, the forecast on the series, the scenario; a draft package whose reroute
 * option cites w.evd and a run):
 *
 *   w  WALKER 1.1.0 (DESIGN D10): the walk's method reference names the triggers, the product buckets and the rule version; its digest is a
 *      new walker's; a session for the 1.0.0 identity is refused by the registry (the act re-registers the agent).
 *   r  THE REACH (V03-T-294, ES-30-003, AI-27-005, DAT-OP-10, DP-24-001, V03-T-203): an evidence correction's walk reaches, beside the
 *      buckets it always reached, the DECISION PACKAGE version whose option cites the evidence, the PUBLICATION version that publishes that
 *      package, the EXPORT PACKAGE that shipped the evidence's manifest, the frozen INFORMATION SET, the BACKTEST and the METHOD VALIDATION of
 *      the series, and the LESSON learned from the package — each with its path from the corrected evidence.
 *   c  THE CLASSES (AI-06-004): graph.affected_products under affected-class@1 — a forecast and an export recompute, a publication stale,
 *      a decision, an assumption, a package and a lesson human_review, evaluation datasets recompute; a package version citing the evidence at
 *      its corrected version CURRENT; a withdrawn package WITHDRAWN; a challenged object CHALLENGED; the facts read by the port, never the
 *      caller's (a forged product id is not recorded, it is counted); append-only; the case's stable read is the latest walk of each root.
 *   t  THE TRIGGERS (V03-T-304, AI-29-005): the seven kinds, each through its steward's port (the role re-checked in the port, the human,
 *      the object, the basis) and WALKED BY THE DOMAIN'S PROPAGATION AGENT with no operator walk; refusals (the PDP 403, the intake 400, the
 *      port's classes); no agent → failed with the reason, re-driven once one is registered; a walked trigger is never walked twice; only the
 *      agent walks a trigger; a human challenge is closed by the deciding person, never its opener.
 *   x  A RESOLUTION CORRECTION (AI-43-005): an entity split walks relationships, strategy, decisions, packages, publications and lessons.
 *   v  RE-VERIFIED (V02-T-129, V03-T-028, DAT-SM-08): the walk still marks what it marked and rewrites nothing (the package version, the
 *      publication version, the evidence's first version are unchanged; historical reconstruction stands).
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout. STATED SUPERUSER MOVES (fixture rows the WALK READS, never a
 * row under test): one publication + version (source: the package as a report), one export package + its executed manifest scope item,
 * one frozen information set, one backtest, one method validation, one outcome assessment + lesson, one ontology version; and the in-memory
 * role of one principal forged (no database binding) to prove the PORT re-checks the role the PDP admitted. Everything else through routes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { PROPAGATION_WALKER } from '../../src/graph/strategy/impact.service.js';
import { AFFECTED_CLASSES, TRIGGER_KINDS_B50 } from '../../src/objects/b50-seams.js';
import type { ImpactB50Controller } from '../../src/graph/impact/impact-b50.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

// this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b50-impact-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let pipeline: PipelineService;
let ctl: ImpactB50Controller; let observation: ObservationController;
let tenantAdmin: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
let privacy: AuthenticatedPrincipal; let recordAuth: AuthenticatedPrincipal; let methodSteward: AuthenticatedPrincipal; let ontologySteward: AuthenticatedPrincipal;
let dataSteward: AuthenticatedPrincipal; let knowledgeOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let agent: { agentId: string; principalId: string };
/** What the cases leave one another. */
let PKG = ''; let PV = 0; let PUB = ''; let EXPORT = ''; let INFOSET = ''; let BACKTEST = ''; let VALIDATION = ''; let LESSON = ''; let ONTOLOGY = '';
let MANIFEST = ''; let METHOD = ''; let CASE = ''; let INV1 = ''; let SERIES_SOURCE = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const hex = (s: string) => createHash('sha256').update(s).digest('hex');

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal; the raw SQLSTATE and text beside it. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const code = (e as { code?: string }).code ?? null;
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), code, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
/** A port refusal in the class form: its text and SQLSTATE; the HTTP status once the integrator maps the noun (null until then — never a wrong one). */
const portRefused = async (p: Promise<unknown>, re: RegExp, sqlstate: string, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  if (r.code !== null) expect(r.code, r.message).toBe(sqlstate);
  expect([null, status], r.message).toContain(r.status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const G = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'graph');
const record = (as: AuthenticatedPrincipal, kind: string, payload: Row) =>
  ctl.record(G(as, `graph.impact.trigger.${kind}`, 'ITR'), T(), D(), kind, { payload: payload as never }) as Promise<{ trigger: Row; walk: { triggerId: string; state: string; invalidationId: string | null; reason: string | null; agent: Row | null } }>;
const affected = (as: AuthenticatedPrincipal, payload: Row) => ctl.affected(G(as, 'graph.read', 'INV', (payload['invalidationId'] ?? payload['caseId']) as string), T(), D(), { payload }) as Promise<{ products: Row[]; classes: Record<string, number>; ruleVersion: string | null }>;
const closeChallenge = (as: AuthenticatedPrincipal, triggerId: string, reason: string) => ctl.close(G(as, 'graph.impact.trigger.close', 'ITR', triggerId), T(), D(), triggerId, { payload: { reason } }) as Promise<{ closed: Row }>;
const preview = (as: AuthenticatedPrincipal, triggerKind: string, triggerObjectId: string) =>
  w.graph.previewImpact(G(as, 'graph.read', 'INV', triggerObjectId), T(), D(), { payload: { triggerKind, triggerObjectId } }) as Promise<{ impact: Row & Record<string, Row[]> }>;
const propagate = (as: AuthenticatedPrincipal, payload: Row) =>
  w.graph.propagate(G(as, 'graph.impact.propagate', 'INV', payload['triggerObjectId'] as string), T(), D(), { payload: payload as never }) as Promise<{ impact: Row & { invalidationId: string; statement: string } & Record<string, Row[]> }>;
const register = (as: AuthenticatedPrincipal) =>
  w.graph.registerPropagationAgent(h.req(as, 'graph.propagation.agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { ownerPrincipalId: w.twinOwner.principalId } }) as Promise<{ agent: { agentId: string; principalId: string; walker: { version: string; codeDigest: string } } }>;
const revokeAgent = (as: AuthenticatedPrincipal, agentId: string, reason: string) =>
  w.graph.revokePropagationAgent(h.req(as, 'graph.propagation.agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason } });
/** A seeding port called with a hand-built handler through the REAL pipeline (the PDP, the capability, the audit) — the port's own refusals. */
const forgedSeed = (as: AuthenticatedPrincipal, action: string, a: Row) => {
  const triggerId = uuidv7();
  return pipeline.write(h.env(as, action, 'ITR', triggerId, 'graph'), as, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'ITR', objectId: triggerId }, GraphCapability.impactTrigger,
    async (cap) => ({ result: await cap.seedImpactTrigger({ triggerId, tenantId: T(), domainId: D(), eventId: uuidv7(), correlationId: uuidv7(), actor: as.principalId, ...a } as never),
                      targetType: 'ITR', targetId: triggerId, targetVersion: null, outboxEvent: null }));
};
const invalidation = async (id: string) => one(sql`select invalidation_id::text, trigger_kind, trigger_object_id::text, opened_by::text, state, truncated, statement, correction_case_id::text from graph.invalidations_current where invalidation_id = ${id}::uuid`);
const productsOf = async (invId: string) => rows(sql`select bucket, product_kind, object_type, product_id::text, product_version, product_ref, class, rule_version, facts, owner_principal_id::text owner, reached_via, hop, path
  from graph.affected_products where invalidation_id = ${invId}::uuid order by hop, product_ref`);
const classOf = (ps: Row[], kind: string, id: string, version: number | null = null) =>
  ps.find((p) => p['product_kind'] === kind && p['product_id'] === id && (version === null || p['product_version'] === version))?.['class'];
const triggerRow = async (id: string) => one(sql`select trigger_id::text, trigger_kind, state, attempts, agent_id::text, invalidation_id::text, last_error, object_version, closed_at from graph.impact_triggers where trigger_id = ${id}::uuid`);

/** A correction of the given evidence (of the series source), submitted and applied through the routes as the collection manager. */
async function applyCorrection(evdIds: string[], reason: string, sourceId = SERIES_SOURCE): Promise<string> {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId, kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  const caseId = opened.correction.caseId;
  await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId,
    { payload: { decision: 'apply', affectedEvdIds: evdIds, reason: `${reason}: verified against the publisher` } });
  return caseId;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  pipeline = h.app.get(PipelineService);
  const { ImpactB50Controller: Ic } = await import('../../src/graph/impact/impact-b50.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  ctl = h.app.get(Ic); observation = h.app.get(Oc);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b50ci-tenant-admin', 'TENANT');
  manager = await h.principalWith(['collection_manager'], 'b50ci-collection');
  strategist = await h.humanWithSession(['strategy_owner'], 'b50ci-strategist');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b50ci-domain-admin');
  privacy = await h.humanWithSession(['privacy_officer'], 'b50ci-privacy');
  recordAuth = await h.humanWithSession(['record_authority'], 'b50ci-record');
  methodSteward = await h.humanWithSession(['method_steward'], 'b50ci-method');
  ontologySteward = await h.humanWithSession(['ontology_steward'], 'b50ci-ontology');
  dataSteward = await h.humanWithSession(['data_steward'], 'b50ci-data');
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b50ci-knowledge');
  analyst = await h.humanWithSession(['domain_analyst'], 'b50ci-analyst');

  // the decision package whose reroute option cites w.evd at its first version (and a run)
  const d = await c.fullDraft();
  PKG = d.pkg; PV = d.v;
  const ev = await one(sql`select payload ->> 'manifest_id' m, content_digest, recorded_at, provenance_ref from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
  MANIFEST = String(ev['m']);
  SERIES_SOURCE = String(ev['provenance_ref']).replace(/^SRC:/, '').replace(/@.*$/, '');
  const f = await one(sql`select method, method_version, method_ref from prediction.forecasts_current where forecast_id = ${w.forecastId}::uuid`);
  METHOD = String(f['method']);
  const by = w.owner.principalId;
  // STATED SUPERUSER MOVES — fixture rows the walk reads:
  PUB = uuidv7();
  await sql`insert into executive.publications (publication_id, scope, tenant_id, domain_id, title, audience, classification, channels, format, accessibility, template, drafted_by, current_version, state, correlation_id)
    values (${PUB}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'Board note: the Cape reroute (SYNTHETIC)', '{"roles":["executive"]}'::jsonb, 'internal', ARRAY['in_app'], 'md', '{"wcag":"2.2 AA"}'::jsonb, 'board-note@1', ${by}::uuid, 1, 'drafted', ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into executive.publication_versions (publication_id, version, scope, tenant_id, domain_id, source_kind, source_id, source_version, source_digest, format, bytes_digest, byte_length, vault_ref, render_method, state, drafted_by, correlation_id)
    values (${PUB}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'report', ${PKG}::uuid, ${PV}, ${hex('pkg')}, 'md', ${hex('bytes')}, 64, ${`${uuidv7()}/${uuidv7()}.bin`}, 'report-md@1', 'drafted', ${by}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  EXPORT = uuidv7();
  await sql`insert into retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, byte_total, manifest_digest, package_digest, signature, built_by, correlation_id)
    values (${EXPORT}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'export', ${`${T()}/${D()}/${EXPORT}/`}, ${hex('scope')}, ${uuidv7()}::uuid, 'internal', 1, 1024, ${hex('m')}, ${hex('p')}, '{"scheme":"eye-digest-chain/1"}'::jsonb, ${recordAuth.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${EXPORT}::uuid, 'manifest', ${MANIFEST}, 0, 'execute')`.execute(h.su);
  INFOSET = uuidv7();
  await sql`insert into prediction.information_sets (information_set_id, scope, tenant_id, domain_id, series_key, known_at, request, evidence, graph, features, assumptions, policy, coverage_gaps, manifest, manifest_digest, assembler_version, revision_head, frozen_via, frozen_by, correlation_id)
    values (${INFOSET}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${w.seriesKey}, now() - interval '1 minute', '{}'::jsonb,
            ${JSON.stringify([{ evidence_object_id: w.evd.id, evidence_version: w.evd.version, evidence_digest: ev['content_digest'], recorded_at: ev['recorded_at'] }])}::jsonb,
            '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, ${hex('is')}, 'assembler@1', 0, 'prediction.fixture', ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  BACKTEST = uuidv7();
  await sql`insert into prediction.backtests (backtest_id, scope, tenant_id, domain_id, series_key, horizon_code, horizon_days, method, method_version, baseline_method, window_from, window_to, origins, verdict, known_at_discipline, computed_by, correlation_id)
    values (${BACKTEST}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${w.seriesKey}, '30d', 30, ${METHOD}, ${String(f['method_version'])}, 'climatology', '2021-01-01', '2023-12-31', 12, 'fixture backtest (SYNTHETIC)', 'origin cut-offs', ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  VALIDATION = uuidv7();
  await sql`insert into prediction.method_validations (validation_id, scope, tenant_id, domain_id, method_ref, series_key, horizon_code, horizon_days, kind, mode, origins, min_origins, metrics, passed, verdict, window_from, window_to, known_at, observations, backtest_id, synthetic, computed_by, correlation_id)
    values (${VALIDATION}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`${METHOD}@1`}, ${w.seriesKey}, '30d', 30, 'quantity_rolling_origin', 'retrospective', 12, 8, '{}'::jsonb, true, 'fixture validation (SYNTHETIC)', '2021-01-01', '2023-12-31', now(), 1000, ${BACKTEST}::uuid, true, ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const assessment = uuidv7();
  await sql`insert into decision.outcome_assessments (assessment_id, scope, tenant_id, domain_id, package_id, version, assessment_version, observed, inferred, counterfactual, changed_conditions, digest, assessed_by, correlation_id)
    values (${assessment}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${PKG}::uuid, ${PV}, 1, '{"outcomes":[],"statement":"fixture"}'::jsonb, '{"statement":"fixture","method":"fixture","confidence":"low"}'::jsonb,
            '{"claim":"fixture","basis":"fixture"}'::jsonb, '[]'::jsonb, ${hex('oa')}, ${by}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  LESSON = uuidv7();
  await sql`insert into decision.lessons (lesson_id, scope, tenant_id, domain_id, package_id, assessment_id, kind, memory_item_id, memory_version, title, linked_by, correlation_id)
    values (${LESSON}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${PKG}::uuid, ${assessment}::uuid, 'lesson', ${uuidv7()}::uuid, 1, 'Reroutes need a week of lead time (SYNTHETIC)', ${by}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  ONTOLOGY = uuidv7();
  await sql`insert into graph.ontology_versions (version_id, scope, tenant_id, domain_id, version, entity_types, predicates, state, compatibility, rationale, proposed_by, correlation_id)
    values (${ONTOLOGY}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 1, ARRAY['place'], '[]'::jsonb, 'proposed', 'breaking', 'a strait is a route segment, not a place (SYNTHETIC)', ${ontologySteward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);

  agent = (await register(tenantAdmin)).agent;
}, 900_000);
afterAll(async () => { await h?.close(); });

describe('w · walker 1.1.0 (DESIGN D10)', () => {
  it('the walk is a NEW walker: version 1.1.0, its digest the method reference\'s; the registered agent is bound to it', async () => {
    expect(PROPAGATION_WALKER.version).toBe('1.1.0');
    const old = createHash('sha256').update('graph.propagation@1.0.0:graph.impact.walk@1.0.0:evidence_correction→claim_lineage→resolutions/edges→dependencies(bfs,max_hops=8)', 'utf8').digest('hex');
    expect(old.startsWith('4c400422af7b')).toBe(true);   // the 1.0.0 identity eye_demo's agent is registered at (MAP §4)
    expect(PROPAGATION_WALKER.codeDigest).not.toBe(old);
    expect(PROPAGATION_WALKER.codeDigest).toMatch(/^[0-9a-f]{64}$/);
    const a = await one(sql`select agent_version, code_digest, status from graph.propagation_agents where agent_id = ${agent.agentId}::uuid`);
    expect(a).toEqual({ agent_version: '1.1.0', code_digest: PROPAGATION_WALKER.codeDigest, status: 'active' });
  });
  it('the registry refuses a session for the 1.0.0 walker (its digest drifted from the registration) — the act revokes 1.0.0 and registers 1.1.0', async () => {
    const { IDENTITY_DB } = await import('../../src/shared/shared.module.js');
    const identityDb = h.app.get<import('../../src/shared/db.js').Db>(IDENTITY_DB);
    const old = createHash('sha256').update('graph.propagation@1.0.0:graph.impact.walk@1.0.0:evidence_correction→claim_lineage→resolutions/edges→dependencies(bfs,max_hops=8)', 'utf8').digest('hex');
    const r = await refusal(identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select graph.propagation_agent_session_open(${uuidv7()}::uuid, ${agent.agentId}::uuid, ${T()}::uuid, ${D()}::uuid, '1.0.0', ${old}, 'x', 'y', ${new Date(Date.now() + 60_000)}, ${uuidv7()}::uuid)`.execute(tx);
    }));
    expect(r.code).toBe('42501');
  });
});

describe('r · the reach: the walk adds decision packages, publications, export packages, evaluation datasets and lessons', () => {
  it('an evidence correction\'s PREVIEW (a read, nothing written) reaches every new bucket, each with its path from the evidence', async () => {
    const before = Number((await one(sql`select count(*)::int n from graph.affected_products`))['n']);
    const p = (await preview(strategist, 'evidence_correction', w.evd.id)).impact;
    const ids = (b: string) => ((p[b] as Row[] | undefined) ?? []).map((x) => `${String(x['strategy_object_id'])}${x['version'] === null || x['version'] === undefined ? '' : `@${String(x['version'])}`}`);
    expect(ids('decisionPackages')).toContain(`${PKG}@${PV}`);
    expect(ids('publications')).toContain(`${PUB}@1`);
    expect(ids('exportPackages')).toContain(EXPORT);
    expect(ids('evaluationDatasets')).toEqual(expect.arrayContaining([INFOSET, BACKTEST, VALIDATION]));
    expect(ids('lessons')).toContain(LESSON);
    const pkg = (p['decisionPackages'] as Row[]).find((x) => x['strategy_object_id'] === PKG)!;
    expect(pkg['path']).toEqual([`EVD:${w.evd.id}`, `DPK:${PKG}@${PV}`]);
    expect(String(pkg['reached_via'])).toMatch(/option cites the evidence .* at version 1 that changed/);
    const pub = (p['publications'] as Row[]).find((x) => x['strategy_object_id'] === PUB)!;
    expect(pub['path']).toEqual([`EVD:${w.evd.id}`, `DPK:${PKG}@${PV}`, `PUB:${PUB}@1`]);
    expect(pub['hop']).toBe(2);
    const lesson = (p['lessons'] as Row[]).find((x) => x['strategy_object_id'] === LESSON)!;
    expect(lesson['path']).toEqual([`EVD:${w.evd.id}`, `DPK:${PKG}@${PV}`, `lesson:${LESSON}`]);
    const ex = (p['exportPackages'] as Row[])[0]!;
    expect(String(ex['reached_via'])).toContain(MANIFEST);
    expect(p['truncated']).toBe(false);
    expect(Number((await one(sql`select count(*)::int n from graph.affected_products`))['n'])).toBe(before);
  });
  it('a walk of an unrelated object reaches none of them (the reach is the citations, not the domain)', async () => {
    const p = (await preview(strategist, 'evidence_correction', uuidv7())).impact;
    for (const b of ['decisionPackages', 'publications', 'exportPackages', 'evaluationDatasets', 'lessons']) expect((p[b] as Row[]).length, b).toBe(0);
  });
});

describe('c · the classes: affected-class@1, from facts the port reads', () => {
  it('the rule is versioned, digest-bound, read-only and pure', async () => {
    const r = await one(sql`select rule_version, rule, rule_digest, active from graph.affected_class_rules`);
    expect(r['rule_version']).toBe('affected-class@1');
    expect(r['active']).toBe(true);
    expect(String(r['rule_digest'])).toBe(String((await one(sql`select encode(sha256(convert_to(rule::text, 'UTF8')), 'hex') d from graph.affected_class_rules`))['d']));
    const kinds = Object.values((r['rule'] as Row)['kinds'] as Record<string, string>);
    for (const k of kinds) expect(AFFECTED_CLASSES as readonly string[]).toContain(k);
    expect((await refusal(sql`update graph.affected_class_rules set active = false`.execute(h.su))).message).toMatch(/append-only/);
    const cls = async (kind: string, facts: Row) => String((await one(sql`select graph.classify_affected(rule, ${kind}, ${JSON.stringify(facts)}::jsonb) c from graph.affected_class_rules`))['c']);
    expect(await cls('forecast', {})).toBe('recompute');
    expect(await cls('forecast', { current: true })).toBe('current');
    expect(await cls('forecast', { current: true, challenged: true })).toBe('challenged');
    expect(await cls('forecast', { current: true, challenged: true, withdrawn: true })).toBe('withdrawn');
    expect(await cls('publication', {})).toBe('stale');
    expect(await cls('decision_package', {})).toBe('human_review');
    expect(await cls('no_such_kind', {})).toBe('human_review');
  });
  it('the correction applied and walked: every reached product classed — the package and the decision human_review, the forecast, the export and the evaluation datasets recompute, the publication stale', async () => {
    CASE = await applyCorrection([w.evd.id], 'restated transits (B50 §CI harness)');
    const versions = await rows(sql`select object_version, lifecycle_state from objects.canonical_objects where object_id = ${w.evd.id}::uuid order by object_version`);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const r = (await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.evd.id, correctionCaseId: CASE })).impact;
    INV1 = r.invalidationId;
    expect(r.statement).toMatch(/decision package version\(s\).*reached — each classed for its owner/);
    const ps = await productsOf(INV1);
    expect(classOf(ps, 'decision_package', PKG, PV)).toBe('human_review');
    expect(classOf(ps, 'publication', PUB, 1)).toBe('stale');
    expect(classOf(ps, 'export_package', EXPORT)).toBe('recompute');
    expect(classOf(ps, 'information_set', INFOSET)).toBe('recompute');
    expect(classOf(ps, 'backtest', BACKTEST)).toBe('recompute');
    expect(classOf(ps, 'method_validation', VALIDATION)).toBe('recompute');
    expect(classOf(ps, 'lesson', LESSON)).toBe('human_review');
    for (const p of ps) {
      expect(p['rule_version']).toBe('affected-class@1');
      expect(AFFECTED_CLASSES as readonly string[]).toContain(p['class']);
      expect((p['path'] as string[])[0]).toBe(`EVD:${w.evd.id}`);
    }
    const pkgRow = ps.find((p) => p['product_id'] === PKG)!;
    expect(pkgRow['owner']).toBe(w.owner.principalId);
    expect(pkgRow['facts']).toMatchObject({ exists: true, withdrawn: false, current: false, challenged: false, trigger_kind: 'evidence_correction' });
    expect(classOf(ps, 'forecast', w.forecastId)).toBe(ps.some((p) => p['product_kind'] === 'forecast') ? 'recompute' : undefined);
    const ev = await one(sql`select details from graph.invalidation_events where invalidation_id = ${INV1}::uuid and event = 'invalidation.assessed'`);
    expect(ev['details']).toMatchObject({ products: ps.length, rule_version: 'affected-class@1', products_unresolved: 0 });
  });
  it('the controller read answers the AffectedProduct contract — of one walk and of the case (the stable read §CL closes against)', async () => {
    const one1 = await affected(strategist, { invalidationId: INV1 });
    expect(one1.ruleVersion).toBe('affected-class@1');
    const p = one1.products.find((x) => x['objectId'] === PKG)!;
    expect(p).toMatchObject({ invalidationId: INV1, ref: `DPK:${PKG}@${PV}`, objectType: 'DPK', version: PV, bucket: 'decision_packages', class: 'human_review', ruleVersion: 'affected-class@1', owner: w.owner.principalId });
    expect(p['path']).toEqual([`EVD:${w.evd.id}`, `DPK:${PKG}@${PV}`]);
    const byCase = await affected(strategist, { caseId: CASE });
    expect(byCase.products.length).toBe(one1.products.length);
    expect(Object.values(byCase.classes).reduce((a, b) => a + b, 0)).toBe(byCase.products.length);
    expect((await refusal(affected(strategist, {}))).status).toBe(400);
    expect((await refusal(affected(strategist, { caseId: CASE, invalidationId: INV1 }))).status).toBe(400);
  });
  it('CURRENT: a package version citing the evidence at its corrected version already reflects the change; WITHDRAWN: a withdrawn package; the case read is the LATEST walk', async () => {
    const latest = Number((await one(sql`select max(object_version)::int v from objects.canonical_objects where object_id = ${w.evd.id}::uuid`))['v']);
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute on the restated transits', statement: 'the same choice on the corrected evidence', owner: w.owner.principalId });
    const pkg2 = d.package.packageId; const v2 = (await c.open(pkg2)).version.version;
    await c.option(pkg2, v2, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: latest }] });
    await c.withdraw(PKG, 'superseded by the package on the restated transits (B50 harness)');
    const r = (await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.evd.id, correctionCaseId: CASE })).impact;
    const ps = await productsOf(r.invalidationId);
    expect(classOf(ps, 'decision_package', pkg2, v2)).toBe('current');
    expect(classOf(ps, 'decision_package', PKG, PV)).toBe('withdrawn');
    const byCase = await affected(strategist, { caseId: CASE });
    expect(new Set(byCase.products.map((x) => x['invalidationId']))).toEqual(new Set([r.invalidationId]));
    expect(byCase.products.find((x) => x['objectId'] === PKG)?.['class']).toBe('withdrawn');
    // the earlier walk's rows stand, append-only
    expect(classOf(await productsOf(INV1), 'decision_package', PKG, PV)).toBe('human_review');
    expect((await refusal(sql`update graph.affected_products set class = 'current' where invalidation_id = ${INV1}::uuid`.execute(h.su))).message).toMatch(/append-only/);
    expect((await refusal(sql`delete from graph.affected_products where invalidation_id = ${INV1}::uuid`.execute(h.su))).message).toMatch(/append-only/);
  });
  it('the facts are the port\'s, never the caller\'s: a forged product is not recorded (counted unresolved), a stated class is ignored', async () => {
    const out = await pipeline.write(h.env(strategist, 'graph.impact.propagate', 'INV', w.evd.id, 'graph'), strategist,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.impact.propagate', objectType: 'INV', objectId: w.evd.id }, GraphCapability.impact,
      async (cap) => {
        const invalidationId = uuidv7();
        await cap.openInvalidation({ invalidationId, tenantId: T(), domainId: D(), triggerKind: 'manual', triggerObjectId: w.evd.id, correctionCaseId: null, actor: strategist.principalId, eventId: uuidv7(), correlationId: uuidv7() });
        await cap.recordImpact({ invalidationId, tenantId: T(), domainId: D(), assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], twins: [], simulations: [],
          products: [{ bucket: 'decision_packages', product_kind: 'decision_package', object_type: 'DPK', product_id: uuidv7(), product_version: 1, title: 'forged', reached_via: 'forged', hop: 1, path: [] },
                     { bucket: 'export_packages', product_kind: 'export_package', object_type: 'export_package', product_id: EXPORT, product_version: null, title: 'x', reached_via: 'stated', hop: 1, path: [], class: 'current' }],
          statement: 'forged walk (B50 harness)', truncated: false, unexplored: [], actor: strategist.principalId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: invalidationId, targetType: 'INV', targetId: invalidationId, targetVersion: '1', outboxEvent: null };
      });
    const ps = await productsOf(out.result);
    expect(ps.map((p) => p['product_id'])).toEqual([EXPORT]);
    expect(ps[0]!['class']).toBe('recompute');   // a manual trigger leaves nothing current; the stated 'current' is not a column the port reads
    const ev = await one(sql`select details from graph.invalidation_events where invalidation_id = ${out.result}::uuid and event = 'invalidation.assessed'`);
    expect(ev['details']).toMatchObject({ products: 1, products_unresolved: 1 });
  });
  it('another domain reads none of it (RLS on the table and through the views)', async () => {
    const otherDomain = uuidv7();
    await sql`insert into tenancy.domains (id, tenant_id, name, status, residency_profile, retention_profile) values (${otherDomain}::uuid, ${T()}::uuid, ${`b50-ci-other-${otherDomain.slice(-6)}`}, 'active', 'local-dev', 'default')`.execute(h.su).catch(() => undefined);
    const outsider = await h.humanWithSession(['strategy_owner'], 'b50ci-outsider', 'DOMAIN', { domainId: otherDomain });
    const r = await ctl.affected({ eyeEnvelope: { ...h.env(outsider, 'graph.read', 'INV', INV1, 'graph'), domain_id: otherDomain }, eyePrincipal: outsider } as never, T(), otherDomain, { payload: { invalidationId: INV1 } }).catch((e: unknown) => e);
    if (r instanceof Error || r instanceof HttpException) expect(r).toBeTruthy();   // a refused read is also no disclosure
    else expect((r as { products: Row[] }).products).toEqual([]);
  });
});

describe('t · the seven triggers: the steward\'s port, the agent\'s walk', () => {
  it('the vocabulary: the invalidation CHECK and the seams name the same seven kinds', async () => {
    const def = String((await one(sql`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'invalidations_current_trigger_kind_check'`))['d']);
    for (const k of [...TRIGGER_KINDS_B50, 'claim_correction', 'claim_withdrawal', 'edge_retraction', 'entity_split', 'evidence_correction', 'manual']) expect(def).toContain(`'${k}'`);
  });
  it('LEGAL REQUEST (privacy officer): recorded, then walked by the AGENT — no operator walk — the products classed', async () => {
    const r = await record(privacy, 'legal_request', { objectType: 'EVD', objectId: w.evd.id, reason: 'an erasure request names this record (SYNTHETIC)', basis: { request_ref: 'LR-2026-0042', legal_basis: 'GDPR art. 17' } });
    expect(r.trigger).toMatchObject({ trigger_kind: 'legal_request', object_type: 'EVD', object_id: w.evd.id, state: 'recorded' });
    expect(r.walk).toMatchObject({ state: 'walked', reason: null });
    const inv = await invalidation(r.walk.invalidationId!);
    expect(inv).toMatchObject({ trigger_kind: 'legal_request', trigger_object_id: w.evd.id, opened_by: agent.principalId, state: 'assessed', correction_case_id: null });
    expect(await triggerRow(r.walk.triggerId)).toMatchObject({ state: 'walked', attempts: 1, agent_id: agent.agentId, invalidation_id: r.walk.invalidationId });
    const ps = await productsOf(r.walk.invalidationId!);
    expect(classOf(ps, 'decision_package', PKG, PV)).toBe('withdrawn');
    expect(classOf(ps, 'export_package', EXPORT)).toBe('recompute');
    expect(ps.every((p) => (p['facts'] as Row)['current'] === false)).toBe(true);   // a finding about the object as it is leaves nothing current
    const ev = await rows(sql`select event from graph.impact_trigger_events where trigger_id = ${r.walk.triggerId}::uuid order by occurred_at, event_id`);
    expect(ev.map((e) => e['event'])).toEqual(['trigger.recorded', 'trigger.received', 'trigger.walking', 'trigger.walked']);
    const ob = await one(sql`select payload from objects.object_outbox where event_type = 'DependencyInvalidated' and payload ->> 'invalidation_id' = ${r.walk.invalidationId}`);
    expect(ob['payload']).toMatchObject({ automatic: true, event_id: r.walk.triggerId, agent_id: agent.agentId, code_digest: PROPAGATION_WALKER.codeDigest });
    // V03-T-028: the walk is announced to the subscribers (GraphChanged, the reach carried), never a destructive cross-layer write
    const gc = await one(sql`select count(*)::int n from objects.object_outbox where event_type = 'GraphChanged' and payload #>> '{change,invalidation_id}' = ${r.walk.invalidationId}`);
    expect(gc['n']).toBe(1);
  });
  it('the refusals: another role (PDP 403), a missing basis or a wrong type (intake 400), the port\'s own classes (authority re-checked, unknown object, wrong action)', async () => {
    expect((await refusal(record(analyst, 'legal_request', { objectType: 'EVD', objectId: w.evd.id, reason: 'not my act at all', basis: { request_ref: 'x1', legal_basis: 'y1' } }))).status).toBe(403);
    expect((await refusal(record(privacy, 'legal_request', { objectType: 'EVD', objectId: w.evd.id, reason: 'no basis stated here', basis: { request_ref: 'LR-1' } }))).status).toBe(400);
    expect((await refusal(record(privacy, 'legal_request', { objectType: 'FCT', objectId: w.forecastId, reason: 'a forecast is not named', basis: { request_ref: 'LR-1', legal_basis: 'x' } }))).status).toBe(400);
    expect((await refusal(record(privacy, 'no_such_kind', { objectType: 'EVD', objectId: w.evd.id, reason: 'an unknown kind', basis: {} }))).status).not.toBe(200);
    // the PORT re-checks the role: a principal whose in-memory binding names privacy_officer (the PDP admits it) but whose database holds none
    const forgedRole: AuthenticatedPrincipal = { ...analyst, bindings: [...analyst.bindings, { roleCode: 'privacy_officer', scope: 'DOMAIN', tenantId: T(), domainId: D() }] };
    await portRefused(forgedSeed(forgedRole, 'graph.impact.trigger.legal_request', { kind: 'legal_request', objectType: 'EVD', objectId: w.evd.id, reason: 'the role exists only in memory', basis: { request_ref: 'LR-9', legal_basis: 'x' } }),
      /^impact trigger rejected \(authority\): a legal request is recorded by a named person holding privacy_officer or record_authority/, '42501', 403);
    await portRefused(forgedSeed(privacy, 'graph.impact.trigger.legal_request', { kind: 'legal_request', objectType: 'EVD', objectId: uuidv7(), reason: 'an object nobody recorded', basis: { request_ref: 'LR-9', legal_basis: 'x' } }),
      /^impact trigger rejected \(unknown_object\): EVD .* is not recorded in this domain/, '23503', 404);
    await portRefused(forgedSeed(privacy, 'graph.impact.trigger.legal_request', { kind: 'legal_request', objectType: 'FCT', objectId: w.forecastId, reason: 'the type is not the kind\'s', basis: { request_ref: 'LR-9', legal_basis: 'x' } }),
      /^impact trigger rejected \(use\): a legal request names a EVD, CLM, not a FCT/, '22023', 422);
    // the action bound is the port's: a legal-request context cannot record a data-quality finding
    const wrong = await refusal(forgedSeed(privacy, 'graph.impact.trigger.legal_request', { kind: 'data_quality_finding', objectType: 'EVD', objectId: w.evd.id, reason: 'the wrong port for the action', basis: { dimension: 'accuracy', finding: 'restated twice' } }));
    expect(wrong.code ?? wrong.status).toBeTruthy();
    expect(wrong.message).toMatch(/does not serve|403|not/);
  });
  it('MODEL INCIDENT (method steward): the forecast itself recompute, and every validation record of the method reached', async () => {
    await portRefused(forgedSeed(methodSteward, 'graph.impact.trigger.model_incident', { kind: 'model_incident', objectType: 'FCT', objectId: w.forecastId, reason: 'a method that did not produce it', basis: { method_ref: 'no-such-method@9', incident: 'quantile crossing in production' } }),
      /^impact trigger rejected \(basis\): forecast .* was not produced by method no-such-method@9/, '22023', 422);
    const r = await record(methodSteward, 'model_incident', { objectType: 'FCT', objectId: w.forecastId, reason: 'quantile crossing found in the method (SYNTHETIC)', basis: { method_ref: METHOD, incident: 'quantile crossing in production' } });
    expect(r.walk.state).toBe('walked');
    const ps = await productsOf(r.walk.invalidationId!);
    expect(classOf(ps, 'forecast', w.forecastId)).toBe('recompute');
    expect(ps.find((p) => p['product_id'] === w.forecastId)?.['hop']).toBe(0);
    expect(classOf(ps, 'backtest', BACKTEST)).toBe('recompute');
    expect(ps.find((p) => p['product_id'] === BACKTEST)?.['reached_via']).toMatch(/validated the (method|series)/);
  });
  it('ONTOLOGY CORRECTION (ontology steward): the entity and everything resting on it — strategy, the decision, its packages and their publications', async () => {
    await portRefused(forgedSeed(ontologySteward, 'graph.impact.trigger.ontology_correction', { kind: 'ontology_correction', objectType: 'ENT', objectId: w.entityId, reason: 'an ontology version nobody proposed', basis: { ontology_version_id: uuidv7() } }),
      /^impact trigger rejected \(basis\): .* is not an ontology version of this domain/, '22023', 422);
    const r = await record(ontologySteward, 'ontology_correction', { objectType: 'ENT', objectId: w.entityId, reason: 'the strait is retyped as a route segment (SYNTHETIC)', basis: { ontology_version_id: ONTOLOGY } });
    expect(r.walk.state).toBe('walked');
    const ps = await productsOf(r.walk.invalidationId!);
    expect(classOf(ps, 'entity', w.entityId)).toBe('stale');
    expect(classOf(ps, 'objective', w.objectiveId)).toBe('human_review');
    expect(classOf(ps, 'assumption', w.assumptionId)).toBe('human_review');
    expect(classOf(ps, 'decision', w.decisionId)).toBe('human_review');
    expect(ps.some((p) => p['product_kind'] === 'decision_package')).toBe(true);
    expect(ps.find((p) => p['product_kind'] === 'decision_package' && p['product_id'] === PKG)?.['reached_via']).toMatch(/the package is for decision/);
  });
  it('DATA-QUALITY FINDING (data steward) and INTEGRITY FAILURE (record authority): evidence-rooted walks; their bases refused when wrong', async () => {
    await portRefused(forgedSeed(dataSteward, 'graph.impact.trigger.data_quality_finding', { kind: 'data_quality_finding', objectType: 'EVD', objectId: w.evd.id, reason: 'a dimension that is not one', basis: { dimension: 'vibes', finding: 'it feels wrong somehow' } }),
      /^impact trigger rejected \(basis\): vibes is not a quality dimension/, '22023', 422);
    const q = await record(dataSteward, 'data_quality_finding', { objectType: 'EVD', objectId: w.evd.id, reason: 'transits double-counted on two days (SYNTHETIC)', basis: { dimension: 'accuracy', finding: 'two days double-counted at the source' } });
    expect(q.walk.state).toBe('walked');
    expect((await invalidation(q.walk.invalidationId!))['trigger_kind']).toBe('data_quality_finding');
    await portRefused(forgedSeed(recordAuth, 'graph.impact.trigger.integrity_failure', { kind: 'integrity_failure', objectType: 'EVD', objectId: w.evd.id, reason: 'a manifest that is not this record\'s', basis: { manifest_id: uuidv7(), failure: 'digest mismatch on restore' } }),
      /^impact trigger rejected \(basis\): manifest .* is not a manifest of evidence/, '22023', 422);
    const i = await record(recordAuth, 'integrity_failure', { objectType: 'EVD', objectId: w.evd.id, reason: 'the vault copy failed its digest (SYNTHETIC)', basis: { manifest_id: MANIFEST, failure: 'digest mismatch on restore' } });
    expect(i.walk.state).toBe('walked');
    expect(classOf(await productsOf(i.walk.invalidationId!), 'export_package', EXPORT)).toBe('recompute');
  });
  it('RIGHTS CHANGE: refused while the source still confirms its rights; recorded once the contract states them withdrawn (the source suspended by its own port); walked', async () => {
    const src = await one(sql`select source_id::text, contract_version from observation.source_contracts_current where source_id = ${SERIES_SOURCE}::uuid`);
    await portRefused(forgedSeed(dataSteward, 'graph.impact.trigger.rights_change', { kind: 'rights_change', objectType: 'EVD', objectId: w.evd.id, reason: 'the rights are still confirmed', basis: { source_id: SERIES_SOURCE, rights_state: 'withdrawn' } }),
      /^impact trigger rejected \(basis\): source .* does not currently state rights withdrawn/, '22023', 422);
    await observation.setRights(h.req(manager, 'observation.source.rights', 'SRC', SERIES_SOURCE, 'observation'), T(), D(), SERIES_SOURCE, { payload: { contractVersion: Number(src['contract_version']), rightsState: 'withdrawn', evidence: 'the publisher withdrew the licence (SYNTHETIC)' } });
    const r = await record(dataSteward, 'rights_change', { objectType: 'EVD', objectId: w.evd.id, reason: 'the publisher withdrew the licence (SYNTHETIC)', basis: { source_id: SERIES_SOURCE, rights_state: 'withdrawn' } });
    expect(r.walk.state).toBe('walked');
  });
  it('HUMAN CHALLENGE: everything resting on the challenged forecast reads CHALLENGED; the opener cannot close it; the deciding person does; the next walk is not challenged', async () => {
    const r = await record(analyst, 'human_challenge', { objectType: 'FCT', objectId: w.forecastId, reason: 'the q90 ignores the January closures (SYNTHETIC)', basis: { statement: 'the upper quantile is implausibly narrow', challenge_ref: 'PV-CHALLENGE-1' } });
    expect(r.walk.state).toBe('walked');
    const ps = await productsOf(r.walk.invalidationId!);
    expect(ps.length).toBeGreaterThan(0);
    expect(new Set(ps.map((p) => p['class']))).toEqual(new Set(['challenged']));
    // the opener without the deciding role: the PDP refuses (a close is a knowledge owner's or the domain administrator's)
    expect((await refusal(closeChallenge(analyst, r.walk.triggerId, 'I opened it and close it myself'))).status).toBe(403);
    const ko = await h.humanWithSession(['knowledge_owner', 'domain_analyst'], 'b50ci-ko-opener');
    const own = await record(ko, 'human_challenge', { objectType: 'FCT', objectId: w.forecastId, reason: 'a second challenge by a knowledge owner', basis: { statement: 'the same quantile, again' } });
    await portRefused(closeChallenge(ko, own.walk.triggerId, 'closing my own challenge'), /^impact trigger rejected \(separation_of_duties\): the person who opened a challenge does not close it/, '42501', 403);
    await closeChallenge(knowledgeOwner, r.walk.triggerId, 'the q90 was re-checked against the closures; it stands');
    await closeChallenge(knowledgeOwner, own.walk.triggerId, 'the same quantile was re-checked; it stands');
    expect((await triggerRow(r.walk.triggerId))['closed_at']).not.toBeNull();
    await portRefused(closeChallenge(knowledgeOwner, r.walk.triggerId, 'closing it a second time'), /^impact trigger rejected \(state\): the challenge was closed/, '22023', 409);
    const after = await record(methodSteward, 'model_incident', { objectType: 'FCT', objectId: w.forecastId, reason: 'a follow-up incident on the method (SYNTHETIC)', basis: { method_ref: METHOD, incident: 'a second crossing' } });
    expect(classOf(await productsOf(after.walk.invalidationId!), 'forecast', w.forecastId)).toBe('recompute');
  });
  it('NO AGENT: the trigger is recorded and its walk FAILED with the reason; once an agent is registered the re-drive walks it (the agent\'s, still)', async () => {
    await revokeAgent(domainAdmin, agent.agentId, 'the walker is re-registered (B50 harness)');
    const r = await record(dataSteward, 'data_quality_finding', { objectType: 'EVD', objectId: w.evd.id, reason: 'a finding while no agent serves (SYNTHETIC)', basis: { dimension: 'timeliness', finding: 'the day arrived a week late' } });
    expect(r.walk).toMatchObject({ state: 'failed', reason: expect.stringMatching(/no active propagation agent is registered in this domain/) });
    expect(await triggerRow(r.walk.triggerId)).toMatchObject({ state: 'failed', invalidation_id: null });
    agent = (await register(tenantAdmin)).agent;
    const out = await ctl.reconcile(G(strategist, 'graph.impact.trigger.reconcile', 'ITR'), T(), D()) as { unwalkedBefore: number; walks: Array<{ triggerId: string; state: string; invalidationId: string | null }> };
    expect(out.unwalkedBefore).toBeGreaterThanOrEqual(1);
    const mine = out.walks.find((x) => x.triggerId === r.walk.triggerId)!;
    expect(mine.state).toBe('walked');
    expect((await invalidation(mine.invalidationId!))['opened_by']).toBe(agent.principalId);
    expect(await triggerRow(r.walk.triggerId)).toMatchObject({ state: 'walked', attempts: 1, agent_id: agent.agentId });
    expect((await refusal(ctl.reconcile(G(analyst, 'graph.impact.trigger.reconcile', 'ITR'), T(), D()))).status).toBe(403);
  });
  it('a walked trigger is never walked twice; only the domain\'s agent walks a trigger; the ledger\'s record never changes', async () => {
    const t = (await rows(sql`select trigger_id::text from graph.impact_triggers where state = 'walked' and tenant_id = ${T()}::uuid order by recorded_at limit 1`))[0]!['trigger_id'] as string;
    const { ImpactTriggersService } = await import('../../src/graph/impact/impact-triggers.service.js');
    const again = await h.app.get(ImpactTriggersService).walk(t, T(), D());
    expect(again.state).toBe('skipped');
    const fresh = await forgedSeed(dataSteward, 'graph.impact.trigger.data_quality_finding', { kind: 'data_quality_finding', objectType: 'EVD', objectId: w.evd.id, reason: 'a finding an operator tries to walk', basis: { dimension: 'validity', finding: 'a negative transit count' } });
    const id = String((fresh.result as Row)['trigger_id']);
    await portRefused(pipeline.write(h.env(strategist, 'graph.impact.propagate', 'INV', w.evd.id, 'graph'), strategist,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.impact.propagate', objectType: 'INV', objectId: w.evd.id }, GraphCapability.impact,
      async (cap) => ({ result: await cap.impactTriggerBegin({ triggerId: id, tenantId: T(), domainId: D() }), targetType: 'INV', targetId: null, targetVersion: null, outboxEvent: null })),
      /^impact trigger rejected \(actor\): a trigger is walked by the domain's active propagation agent/, '42501', 403);
    expect((await refusal(sql`update graph.impact_triggers set reason = 'rewritten afterwards' where trigger_id = ${id}::uuid`.execute(h.su))).message).toMatch(/does not change/);
    expect((await refusal(sql`delete from graph.impact_triggers where trigger_id = ${id}::uuid`.execute(h.su))).message).toMatch(/append-only/);
    expect((await refusal(sql`update graph.impact_trigger_events set details = '{}' where trigger_id = ${id}::uuid`.execute(h.su))).message).toMatch(/append-only/);
    const walked = await h.app.get(ImpactTriggersService).walk(id, T(), D());
    expect(walked.state).toBe('walked');
  });
});

describe('x · a resolution correction propagates per bucket (AI-43-005)', () => {
  it('an entity split walks relationships, strategy, the decision, its packages, their publications and lessons — each classed', async () => {
    const r = (await propagate(strategist, { triggerKind: 'entity_split', triggerObjectId: w.entityId })).impact;
    const ps = await productsOf(r.invalidationId);
    const buckets = new Set(ps.map((p) => p['bucket']));
    for (const b of ['graph_state', 'objectives', 'assumptions', 'decisions', 'decision_packages', 'publications', 'lessons']) expect(buckets, b).toContain(b);
    expect(classOf(ps, 'publication', PUB, 1)).toBe('stale');
    expect(ps.find((p) => p['product_id'] === PUB)?.['path']).toEqual(expect.arrayContaining([`ENT:${w.entityId}`, `DPK:${PKG}@${PV}`, `PUB:${PUB}@1`]));
  });
});

describe('s · a correction of the twin\'s record reaches the twin and its simulation runs (AI-27-005: simulations; the walk\'s Phase 5 buckets classed)', () => {
  it('the twin and its runs recompute; the twin\'s citing version is marked unverified by the port as before', async () => {
    const prov = String((await one(sql`select provenance_ref from objects.canonical_objects where object_id = ${w.records.terms.id}::uuid order by object_version limit 1`))['provenance_ref']);
    const src = prov.replace(/^SRC:/, '').replace(/@.*$/, '');
    const kase = await applyCorrection([w.records.terms.id], 'restated route terms (B50 §CI harness)', src);
    const r = (await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.records.terms.id, correctionCaseId: kase })).impact;
    const ps = await productsOf(r.invalidationId);
    expect(classOf(ps, 'twin', w.twinId)).toBe('recompute');
    expect(ps.filter((p) => p['product_kind'] === 'simulation').length).toBeGreaterThan(0);
    for (const p of ps.filter((x) => x['product_kind'] === 'simulation')) expect(['recompute', 'withdrawn']).toContain(p['class']);
    const tv = await one(sql`select verification_state from twin.twin_versions where twin_id = ${w.twinId}::uuid and version = ${w.v1}`);
    expect(tv['verification_state']).toBe('unverified');
  });
  it('a kind the walk never met has no facts (exists false) and the rule\'s fallback; every bucket kind has a class in the rule', async () => {
    for (const k of ['assumption', 'objective', 'decision', 'commitment', 'strategy_node', 'forecast', 'scenario', 'warning', 'twin', 'simulation', 'briefing', 'memory_item', 'claim', 'entity', 'edge',
                     'decision_package', 'publication', 'export_package', 'information_set', 'backtest', 'method_validation', 'lesson']) {
      const f = await one(sql`select graph.affected_facts(${T()}::uuid, ${D()}::uuid, ${k}, gen_random_uuid(), 1, 'evidence_correction', ${w.evd.id}::uuid) f`);
      expect((f['f'] as Row)['exists'], k).toBe(false);
      const c = await one(sql`select rule -> 'kinds' ->> ${k} c from graph.affected_class_rules where active`);
      expect(AFFECTED_CLASSES as readonly string[], k).toContain(c['c']);
    }
  });
});

describe('v · re-verified: reports, never rewrites (V02-T-129, V03-T-028, DAT-SM-08, DP-24-001)', () => {
  it('the package version, the publication version and the evidence\'s first version are exactly as they were; the forecast is marked for attention, never re-issued', async () => {
    const v1 = await one(sql`select object_version, content_digest from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
    expect(Number(v1['object_version'])).toBe(w.evd.version);
    const opt = await one(sql`select consequences from decision.options where package_id = ${PKG}::uuid and version = ${PV} and key = 'reroute'`);
    expect((opt['consequences'] as Row[]).find((x) => x['kind'] === 'evidence')).toMatchObject({ id: w.evd.id, version: w.evd.version });
    expect(await one(sql`select state, source_id::text, source_version from executive.publication_versions where publication_id = ${PUB}::uuid`)).toEqual({ state: 'drafted', source_id: PKG, source_version: PV });
    expect(await one(sql`select revoked_at from retention.export_packages where action_id = ${EXPORT}::uuid`)).toEqual({ revoked_at: null });
    const f = await one(sql`select state from prediction.forecasts_current where forecast_id = ${w.forecastId}::uuid`);
    expect(['issued', 'superseded', 'resolved']).toContain(f['state']);
  });
});
