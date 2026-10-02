/**
 * CP-6 B28 part `remediation` (migration 0088 §R) — THE TWO B24 CARRYOVERS, B28 completion conditions (a) and (b).
 *
 * (a) THE REMEDIATION WORKFLOW ON SOURCE COVERAGE LOSS. A source.coverage_loss attention item (0083 §6) is answered by a REMEDIATION —
 *     opened by the item's owner or a collection manager, owned by a named collection manager (M. Dvořák in the scene), carrying the gap
 *     (the loss window, the blind-spot / degraded-region measurements or their declared absence), the steps (a fallback source — the
 *     corridor stream; a named re-collection run; the gap accepted by a SECOND person) and the closure (recovered only while the source is
 *     healthy — AUTOMATICALLY when the source-health subscriber applies the recovery — or gap accepted only through the accepted step).
 * (b) SOURCE-IMPACT MARKERS REACH PACKAGES THROUGH ASSUMPTIONS: an assumption resting on a claim extracted from the source's evidence
 *     (depth 1), or on such an assumption (to depth 4), is marked; a package whose current version's options cite it is marked; the marker
 *     on a cited assumption BEARS on the version, so the commitment (L. Brandt's) is refused until it is acknowledged for that version.
 *
 * On a real database with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top,
 * the B6 rule), the SOURCE-HEALTH subscription registered in the harness's own domain, the world of `bootDecisionWorld` (its forecast rests
 * on the fixture REST source — the scene's Regensburg supplier-portal source; the corridor stream is a second, active upload source).
 * The coverage evaluation's SourceHealthChanged is PLANTED in the tenant's outbox as the evaluation writes it (the B22/B24 plantOutbox
 * idiom — no cheap coverage evaluation reaches `degraded` here); the suspension and the reactivation go through the real lifecycle route.
 * THE CLAIMS are PLANTED with their lineage (the B21/B22 idiom: no cheap real extraction run in this world); the assumptions resting on
 * them are declared through the real strategy route.
 *
 *   R1 · THE WORKFLOW (scene B28-R): degraded → the coverage-loss item → the refusals of the opening (403 PDP / human gate / borrowed
 *        session / not the owner; 404; 422 not a coverage loss / owner / reason) → M. Dvořák opens it (the gap, the health at opening) →
 *        409 a second opening → the steps (the corridor fallback, a re-collection run) with their refusals (404 / 409 / 422 / 403 separation
 *        of duties on accept_gap) → close refused while degraded (409) and without an accepted gap (409) → the warnings' read → RECOVERY:
 *        the subscriber closes it `closed_recovered` automatically, naming the health event → nothing acts on it any more (409), and the
 *        item no longer opens one (409 source_healthy).
 *   R2 · THE OTHER CLOSURES: the item's OWNER (not a collection manager) opens one; the gap accepted by a second person closes it
 *        `closed_gap_accepted`; a withdrawal (422 / 403 / 409); a recovery the subscriber has not applied (a coverage evaluation recorded
 *        healthy) lets a person close it `closed_recovered`.
 *   R3 · THE ASSUMPTION REACH (scene B28-A): SUSPENDED through the route → markers on the assumptions to depth 4 (not 5, not another
 *        source's) and on the package citing one; the markers read names them; the bearing; L. Brandt's commitment refused 409 until the
 *        bearing markers are acknowledged for that version → committed; a later draft citing the depth-4 assumption is borne on.
 *   R4 · RECOVERY: reactivated through the route → every marker cleared, the assumptions' included → the later draft commits with no
 *        acknowledgement.
 *
 * EACH CASE LOGS ONE `B28 EVIDENCE` LINE with the six things V04-T-024/026 demand.
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
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { DecisionController } from '../../src/decision/decision.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { CoverageRemediationCapability } from '../../src/observation/impact/coverage-remediation.capabilities.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, syntheticEgress, uploadContract } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b28-remediation-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Delivery = { event_id: string; consumer_kind: string; state: string; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>; last_error: string | null };
type Marker = { marker_id: string; subject_kind: string; subject_id: string; health_state: string; state: string; cleared_state: string | null; set_by_event: string; cleared_by_event: string | null };
type Remediation = { remediation_id: string; source_id: string; item_id: string; owner_principal_id: string; opened_by: string; state: string; health_at_opening: Row; gap_from: Date; gap_to: Date | null; gap: Row; steps: Row[]; closure: Row | null; closed_at: Date | null };
type Answer = Row & { remediation_id: string; state: string };
type Bearing = { marker_id: string; subject_kind: string; subject_id: string; health_state: string; acknowledged: boolean; subject_title: string; bearing: string | null };
type PackageBearing = { package_id: string; version: number; markers: Bearing[]; outstanding: number; gate: 'clear' | 'blocked' };
type SourceGroup = { source_id: string; worst_state: string; markers: Array<{ marker_id: string; subject_kind: string; subject_id: string; subject_title: string; state: string }>; counts: Record<string, number> };

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let observation: ObservationController; let decisions: DecisionController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let tenantAdmin: AuthenticatedPrincipal;
/** M. Dvořák (the owner in the scene), a second collection manager, a domain administrator, an analyst, an executive. */
let dvorak: AuthenticatedPrincipal; let second: AuthenticatedPrincipal; let admin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
/** What the cases leave one another (each named where it is made). */
let sourceId = ''; let corridorId = ''; let draftSourceId = ''; let bootRunId = '';
let claimId = ''; let otherClaimId = ''; const A: string[] = []; let otherAssumption = ''; let PA = ''; let PAv = 0;
let PB: { pkg: string; v: number } | null = null;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** An instant on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    const pending = Number((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'pending'`.execute(su)).rows[0]!.n);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0 && pending === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}; pending outbox rows ${pending}`);
    await sleep(300);
  }
};
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B28 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the outbox and the deliveries ───────────── */
/** A coverage-shaped SourceHealthChanged PLANTED in the tenant's outbox partition the way 0064 places every row (the B22/B24 idiom) — PENDING. */
async function plantHealth(prior: string, next: string, reason: string): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  const payload = { schema_version: 'v1', source_id: sourceId, prior_state: prior, new_state: next, evaluated_at: new Date().toISOString(), reason, lag_class: 'fixture',
                    decision_use_constraint: next === 'healthy' ? 'none' : 'flag', calc_version: 'coverage-calc@1.1.0', coverage_universe_version: 1, evidence_refs: [] };
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'SourceHealthChanged', ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, consumer_kind, state, items_applied, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const healthApplied = async (eventId: string): Promise<Delivery> => {
  const ds = await waitFor(`the source-health delivery of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === 'source-health' && d.state === 'applied'), 120_000);
  return ds.find((d) => d.consumer_kind === 'source-health')!;
};
const outboxEvent = async (eventType: string, after: Date, where: (p: Row) => boolean): Promise<{ id: string; payload: Row }> => {
  const rows = await waitFor(`the ${eventType} row published`, async () => (await sql<{ id: string; status: string; payload: Row }>`select id::text, status, payload from objects.object_outbox
      where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload)),
    (rs) => rs.length >= 1 && rs.every((r) => r.status === 'published'));
  return rows.at(-1)!;
};

/* ───────────── the rows ───────────── */
const markers = async () => (await sql<Marker>`select marker_id::text, subject_kind, subject_id::text, health_state, state, cleared_state, set_by_event::text, cleared_by_event::text
  from observation.source_impact_markers where source_id = ${sourceId}::uuid order by set_at, subject_kind, subject_id`.execute(su)).rows;
const active = async () => (await markers()).filter((m) => m.state === 'active');
const remediation = async (id: string) => (await sql<Remediation>`select remediation_id::text, source_id::text, item_id::text, owner_principal_id::text, opened_by::text, state, health_at_opening,
  gap_from, gap_to, gap, steps, closure, closed_at from observation.coverage_remediations where remediation_id = ${id}::uuid`.execute(su)).rows[0]!;
const remediationEvents = async (id: string) => (await sql<{ event: string; actor: string; details: Row }>`select event, actor_principal_id::text actor, details from observation.coverage_remediation_events
  where remediation_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const remediationCount = async () => (await sql<{ n: number }>`select count(*)::int n from observation.coverage_remediations where source_id = ${sourceId}::uuid`.execute(su)).rows[0]!.n;
/** The coverage-loss item the source-health subscriber routed for one health event. */
const lossItem = async (eventId: string) => (await sql<{ item_id: string; state: string; owner_principal_id: string | null; created_at: Date }>`select item_id::text, state, owner_principal_id::text, created_at
  from executive.attention_items where signal_class = 'source.coverage_loss' and subject_id = ${sourceId}::uuid and cause_event_id = ${eventId}::uuid`.execute(su)).rows[0]!;
const ackEvents = async (pkg: string) => (await sql<{ event_id: string }>`select event_id::text from decision.package_events where package_id = ${pkg}::uuid and event = 'source_impact.acknowledged'`.execute(su)).rows;
const commitments = async (pkg: string) => (await sql<{ version: number }>`select version from decision.commitments where package_id = ${pkg}::uuid order by version`.execute(su)).rows.map((r) => r.version);

/* ───────────── the routes (in process) ───────────── */
const register = (kind: string) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as Promise<{ subscription: { subscriptionId: string }; served: { workerRunning: boolean } }>;
const openR = (as: AuthenticatedPrincipal, payload: Row, src = sourceId) => observation.openRemediation(h.req(as, 'observation.coverage_remediation.open', 'SRC', src, 'observation'), T(), D(), src, { payload: payload as never }) as unknown as Promise<{ remediation: Answer; receipt: Row }>;
const stepR = (as: AuthenticatedPrincipal, rid: string, payload: Row, src = sourceId) => observation.remediationStep(h.req(as, 'observation.coverage_remediation.step', 'SRC', src, 'observation'), T(), D(), src, rid, { payload: payload as never }) as unknown as Promise<{ remediation: Answer; receipt: Row }>;
const closeR = (as: AuthenticatedPrincipal, rid: string, payload: Row) => observation.closeRemediation(h.req(as, 'observation.coverage_remediation.close', 'SRC', sourceId, 'observation'), T(), D(), sourceId, rid, { payload: payload as never }) as unknown as Promise<{ remediation: Answer; receipt: Row }>;
const withdrawR = (as: AuthenticatedPrincipal, rid: string, payload: Row) => observation.withdrawRemediation(h.req(as, 'observation.coverage_remediation.withdraw', 'SRC', sourceId, 'observation'), T(), D(), sourceId, rid, { payload: payload as never }) as unknown as Promise<{ remediation: Answer; receipt: Row }>;
const listR = (as: AuthenticatedPrincipal, payload: Row = {}, src = sourceId) => observation.listRemediations(h.req(as, 'observation.coverage_remediation.read', 'SRC', src, 'observation'), T(), D(), src, { payload: payload as never }) as unknown as Promise<{ source_id: string; health_now: Row; remediations: Array<Row & { remediation_id: string; state: string; events: Row[] }>; receipt: Row }>;
const readMarkers = (as: AuthenticatedPrincipal, payload: Row = {}) => observation.sourceImpactMarkers(h.req(as, 'observation.source_impact.read', 'SRC', null, 'decision'), T(), D(), { payload: payload as never }) as unknown as Promise<{ sources?: SourceGroup[]; package?: PackageBearing; receipt: Row }>;
const bearing = async (pkg: string, version?: number): Promise<PackageBearing> => (await readMarkers(w.authority, version === undefined ? { packageId: pkg } : { packageId: pkg, version })).package!;
const ack = (as: AuthenticatedPrincipal, pkg: string, payload: Row) => decisions.acknowledgeSourceImpact(h.req(as, 'decision.source_impact.acknowledge', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload }) as unknown as Promise<{ acknowledgement: Row }>;
/** The warnings part's read (observation.source_remediations), through the pipeline under the reader's own context. */
const sourceRemediations = async (as: AuthenticatedPrincipal, ids: string[]) => (await h.pipeline.consequentialRead(h.env(as, 'observation.coverage_remediation.read', 'SRC', null, 'observation'), as,
  { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.coverage_remediation.read', objectType: 'SRC', objectId: null },
  CoverageRemediationCapability.read, async (cap) => cap.sourceRemediations({ tenantId: T(), domainId: D(), sourceIds: ids }))).result;
const transition = async (target: 'suspended' | 'active', reason: string): Promise<string> => {
  await settle();
  const t0 = await mark();
  await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', sourceId, 'observation'), T(), D(), sourceId, { payload: { contractVersion: h.version, target, reason } });
  if (target === 'active') await scheduler.unschedule(T(), D(), sourceId);
  const shc = await outboxEvent('SourceHealthChanged', t0, (p) => p['source_id'] === sourceId && p['state'] === target);
  await healthApplied(shc.id);
  return shc.id;
};

/* ───────────── the planted claims and the declared assumptions ───────────── */
/** A CLM claim as the extraction would have admitted it (the B21/B22 seedClaim idiom) WITH its lineage row naming the evidence it came from. */
async function plantClaim(evidence: { id: string; version: number }, evidenceDigest: string, label: string): Promise<string> {
  const id = uuidv7(); const now = new Date().toISOString(); const runId = uuidv7(); const methodId = uuidv7();
  const payload: Row = { claim_kind: 'claim', subject: 'Regensburg supplier portal', predicate: 'forecast_basis', object_value: `${label} (B28 harness)`, confidence: 0.9,
    lineage: { method_id: methodId, run_id: runId, mode: 'replay', evidence_object_id: evidence.id, evidence_digest: evidenceDigest, byte_start: 0, byte_end: 4 }, review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${id}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidenceDigest}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return id;
}
const declareAssumption = async (title: string, restsOn: Row): Promise<string> =>
  ((await graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title, statement: `${title} (B28 harness)`, restsOn: [restsOn] } })) as { strategy: { objectId: string } }).strategy.objectId;
/** A draft whose reroute option cites an assumption beside its run (and the status quo the common control, optionally with another assumption). */
async function draftOnAssumption(title: string, assumption: string, statusQuoAssumption: string | null = null): Promise<{ pkg: string; v: number }> {
  const pkg = (await c.declare({ decisionObjectId: w.decisionId, title, statement: 'whether to reroute while the supplier portal is suspended (B28 harness)', owner: w.owner.principalId })).package.packageId;
  const v = (await c.open(pkg)).version.version;
  await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }, ...(statusQuoAssumption === null ? [] : [{ kind: 'assumption', id: statusQuoAssumption }])] });
  await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'assumption', id: assumption }] });
  await c.terms(pkg, v, c.validTerms());
  await c.choice(pkg, v, c.validChoice());
  return { pkg, v };
}
const proposeApprove = async (pkg: string, v: number): Promise<string> => {
  const digest = (await c.propose(pkg, v)).proposal.versionDigest;
  await c.approve(pkg, v, { decision: 'approve', versionDigest: digest, rationale: 'The reroute keeps the line running; the premium is acceptable (B28 harness).' }, w.approver);
  return digest;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { DecisionController: Dc } = await import('../../src/decision/decision.controller.js');
  graph = h.app.get(Gc); observation = h.app.get(Oc); decisions = h.app.get(Dc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // R3/R4 suspend and reactivate the fixture's REST source through the route (its schedule is materialized): the collection a tick would
  // run reads the synthetic publisher (no network), and the harness unschedules it at once.
  h.app.get(CollectionOrchestrator).useEgressForTests(syntheticEgress().egress);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b28r-tenant-admin', 'TENANT');
  dvorak = await h.humanWithSession(['collection_manager'], 'b28r-dvorak');
  second = await h.humanWithSession(['collection_manager'], 'b28r-second');
  admin = await h.humanWithSession(['domain_admin'], 'b28r-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b28r-analyst');
  executive = await h.humanWithSession(['executive'], 'b28r-executive');
  // THE WORLD (booted BEFORE the subscription: its own events are left behind by the 'leave' backlog).
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  sourceId = h.fx.sourceId;
  bootRunId = (await sql<{ run_id: string }>`select run_id::text from observation.collection_runs_current where source_id = ${sourceId}::uuid order by started_at desc limit 1`.execute(su)).rows[0]!.run_id;
  // THE CORRIDOR STREAM (the fallback: a second, active source) and a source registered but never approved (an inactive fallback).
  corridorId = await h.uploadSource('internal', 'corridor');
  draftSourceId = ((await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(),
    { payload: { contract: uploadContract(`fixture-uploads-draft-${uuidv7().slice(-8)}`) } })) as { source: { sourceId: string } }).source.sourceId;
  // THE CLAIMS: one extracted from the supplier portal's evidence (w.evd: provenance SRC:<source>@…), one from the upload source's (a control).
  const evdBytes = (await sql<{ d: string }>`select payload ->> 'content_digest' d from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`.execute(su)).rows[0]!.d;
  claimId = await plantClaim(w.evd, evdBytes, 'the 90-day forecast basis');
  otherClaimId = await plantClaim(w.records.inv, sha256('the upload control'), 'an invoice line');
  // THE ASSUMPTIONS: A1 rests on the claim; A2 on A1; … A5 on A4 (depth 5 — beyond the bound); another on the control claim.
  A.push(await declareAssumption('The supplier portal keeps publishing the 90-day forecast', { kind: 'claim', id: claimId, rationale: 'the assumption is the extracted forecast basis' }));
  for (let i = 2; i <= 5; i += 1) A.push(await declareAssumption(`Level ${i}: the plan built on level ${i - 1} holds`, { kind: 'strategy', id: A[i - 2]!, rationale: `the level ${i} assumption rests on level ${i - 1}` }));
  otherAssumption = await declareAssumption('The invoice terms stand', { kind: 'claim', id: otherClaimId, rationale: 'the assumption is the invoice line' });
  // THE PACKAGE (declared before the degradation, so its package marker is set): the reroute option cites A2; approved.
  const a = await draftOnAssumption('B28 PA: reroute on the portal forecast assumption (harness)', A[1]!); PA = a.pkg; PAv = a.v;
  await proposeApprove(PA, PAv);
  await settle();
  // THE SUBSCRIPTION: the source-health kind, registered by the tenant administrator with the backlog left.
  const r = await register('source-health');
  expect(r.served.workerRunning, 'the domain\'s queue is served from registration').toBe(true);
  await settle();
}, 480_000);

afterAll(async () => {
  try { await scheduler.unschedule(T(), D(), h.fx.sourceId); } catch { /* nothing scheduled */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B28 · the remediation workflow on coverage loss and the source impact through assumptions (0088 §R)', () => {
  it('R1 · THE WORKFLOW: the coverage-loss item opens a remediation owned by M. Dvořák (fallback: the corridor stream; a re-collection) — refused where it must be — and the recovery closes it', async () => {
    /* R1.1 THE LOSS: degraded (planted) → the coverage-loss item. */
    const degraded = await plantHealth('healthy', 'degraded', 'B28 R1: the supplier portal stopped refreshing (harness)');
    const d = await healthApplied(degraded);
    expect(d.items_applied[0]).toMatchObject({ effect: 'markers.set', details: { state: 'degraded' } });
    const item = await lossItem(degraded);
    expect(item.item_id).toMatch(/^[0-9a-f-]{36}$/);
    const payload = { itemId: item.item_id, owner: dvorak.principalId, reason: 'the portal stopped refreshing; fall back to the corridor stream and re-collect (B28)' };
    /* R1.2 THE OPENING'S REFUSALS — nothing recorded. */
    await refused(openR(w.owner, payload), /./, 403, 'EYE-AUT-001');
    await refused(openR({ ...dvorak, kind: 'agent' } as AuthenticatedPrincipal, payload), /human gate: observation\.coverage_remediation\.open requires a named human principal/, 403, 'EYE-WFL-002');
    const borrowed = await h.principalWith(['collection_manager'], 'b28r-borrowed');
    await refused(openR(borrowed, payload), /^coverage remediation rejected: recorded by the acting principal, never on behalf of another/, 403, 'EYE-AUT-001');
    await refused(openR(analyst, payload), /^coverage remediation rejected \(not_owner\): principal .* is neither the owner of item .* nor a collection_manager/, 403, 'EYE-AUT-001');
    await refused(openR(admin, payload), /^coverage remediation rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    await refused(openR(dvorak, { ...payload, itemId: uuidv7() }), /^coverage remediation rejected \(unknown_item\): no attention item .* in this domain/, 404, 'EYE-STA-001');
    await refused(openR(dvorak, payload, corridorId), /^coverage remediation rejected \(not_coverage_loss\): item .* is the coverage loss of source .*, not of source/, 422, 'EYE-REQ-001');
    const otherItem = uuidv7();
    await sql`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, evaluation, correlation_id)
      values (${otherItem}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'forecast.unfit', 'forecast', ${w.forecastId}::uuid, ${uuidv7()}::uuid, 'ForecastFitnessChanged', 'B28 harness: a forecast judged unfit (planted)', 'abstained', 'deprioritized', '{}'::jsonb, ${uuidv7()}::uuid)`.execute(su);
    await refused(openR(dvorak, { ...payload, itemId: otherItem }), /^coverage remediation rejected \(not_coverage_loss\): item .* is a forecast\.unfit item on a forecast/, 422, 'EYE-REQ-001');
    await refused(openR(dvorak, { ...payload, owner: executive.principalId }), /^coverage remediation rejected \(owner\): the owner .* is not an active human holding collection_manager or domain_admin/, 422, 'EYE-REQ-001');
    await refused(openR(dvorak, { ...payload, reason: 'short' }), /^coverage remediation rejected \(reason\)/, 422, 'EYE-REQ-001');
    await refused(openR(dvorak, { ...payload, itemId: 'not-an-id' }), /itemId is the source\.coverage_loss attention item/, 422, 'EYE-REQ-001');
    expect(await remediationCount(), 'no refused opening was recorded').toBe(0);
    /* R1.3 M. DVOŘÁK OPENS IT — the gap (the loss window from the item's arrival; the two dimensions measured or declared absent) and the health at opening. */
    const opened = (await openR(dvorak, payload)).remediation;
    expect(opened).toMatchObject({ state: 'open', source_id: sourceId, item_id: item.item_id, owner: dvorak.principalId, opened_by: dvorak.principalId, health: { state: 'degraded', basis: 'SourceHealthChanged', ref: degraded } });
    const R = opened.remediation_id;
    const row = await remediation(R);
    expect(row.gap_from.toISOString()).toBe(item.created_at.toISOString());
    expect(row.gap_to).toBeNull();
    const meas = row.gap['measurements'] as Record<string, Row>;
    expect(Object.keys(meas).sort()).toEqual(['blind_spots', 'degraded_regions']);
    for (const m of Object.values(meas)) expect(['unknown', 'measured', 'indeterminate', 'insufficient_evidence', 'not_applicable', 'absent']).toContain(m['state']);
    for (const m of Object.values(meas)) if (m['state'] === 'absent') expect(m['reason']).toMatch(/^no (blind_spots|degraded_regions) measurement is recorded for this source$/);
    expect(await remediationEvents(R)).toEqual([expect.objectContaining({ event: 'remediation.opened', actor: dvorak.principalId })]);
    await refused(openR(second, payload), /^coverage remediation rejected \(already_open\): remediation .* of source .* is open/, 409, 'EYE-STA-002');
    /* R1.4 THE READ: the source's remediations and its health now. */
    const listed = await listR(executive);
    expect(listed.receipt).toMatchObject({ policyDecisionId: expect.any(String) });
    expect(listed.health_now).toMatchObject({ state: 'degraded', basis: 'SourceHealthChanged' });
    expect(listed.remediations[0]).toMatchObject({ remediation_id: R, state: 'open' });
    await refused(listR(dvorak, {}, uuidv7()), /no authorized source matches/, 404, 'EYE-STA-001');
    /* R1.5 THE STEPS' REFUSALS — nothing recorded. */
    await refused(stepR(dvorak, R, { kind: 'retry', reason: 'not a kind (B28 harness)' }), /kind is one of fallback_source, recollect, accept_gap/, 422, 'EYE-REQ-001');
    await refused(stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: uuidv7(), reason: 'a source that does not exist (B28)' }), /^coverage remediation rejected \(unknown_source\)/, 404, 'EYE-STA-001');
    await refused(stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: sourceId, reason: 'the source itself (B28 harness)' }), /^coverage remediation rejected \(step\): source .* cannot be its own fallback/, 422, 'EYE-REQ-001');
    await refused(stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: draftSourceId, reason: 'a source never approved (B28)' }), /^coverage remediation rejected \(fallback_inactive\): fallback source .* has no active contract \(its latest is draft\)/, 409, 'EYE-STA-002');
    await refused(stepR(analyst, R, { kind: 'fallback_source', fallbackSourceId: corridorId, reason: 'the analyst is not the owner (B28)' }), /^coverage remediation rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    await refused(stepR(dvorak, R, { kind: 'recollect', runId: uuidv7(), reason: 'a run that does not exist (B28)' }), /^coverage remediation rejected \(unknown_run\)/, 404, 'EYE-STA-001');
    await refused(stepR(dvorak, R, { kind: 'recollect', runId: bootRunId, reason: 'the run from before the loss (B28)' }), /^coverage remediation rejected \(stale_run\): run .* started at .*, before remediation/, 409, 'EYE-STA-002');
    await refused(stepR(dvorak, R, { kind: 'accept_gap', reason: 'the owner accepts their own gap (B28)' }), /^coverage remediation rejected \(separation\): the owner of remediation .* does not accept its own gap/, 403, 'EYE-AUT-001');
    await refused(stepR(analyst, R, { kind: 'accept_gap', reason: 'an analyst accepts the gap (B28 harness)' }), /^coverage remediation rejected \(separation\): principal .* holds neither collection_manager nor domain_admin/, 403, 'EYE-AUT-001');
    await refused(stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: corridorId, reason: 'the path names another source (B28)' }, corridorId), /unknown_remediation/, 404, 'EYE-STA-001');
    expect((await remediation(R)).steps, 'no refused step was recorded').toEqual([]);
    /* R1.6 THE STEPS: the corridor stream (the owner), a re-collection run triggered through the collection path (a second collection manager). */
    const s1 = (await stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: corridorId, reason: 'the corridor stream carries the same transits while the portal is down' })).remediation;
    expect(s1).toMatchObject({ from_state: 'open', state: 'in_progress', step: { step: 1, kind: 'fallback_source', fallback_source_id: corridorId, by: dvorak.principalId, fallback_health: { state: 'healthy' } } });
    // B28 §I (found by the act): a recollect step WITHOUT a run is recorded as PLANNED — a suspended source records no run
    const planned = (await stepR(dvorak, R, { kind: 'recollect', reason: 'the portal is re-collected once it answers again' })).remediation;
    expect(planned).toMatchObject({ state: 'in_progress', step: { step: 2, kind: 'recollect', planned: true, run_id: null, by: dvorak.principalId } });
    const run = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
    expect(run.opened).not.toBe(false);
    const s2 = (await stepR(second, R, { kind: 'recollect', runId: run.runId, reason: 're-collect the gap window from the portal once it answers' })).remediation;
    expect(s2).toMatchObject({ from_state: 'in_progress', state: 'in_progress', step: { step: 3, kind: 'recollect', run_id: run.runId, run_state: run.state, by: second.principalId } });
    /* R1.7 THE CLOSURE'S REFUSALS: not recovered (the source is degraded), no accepted gap, not a closure kind. */
    await refused(closeR(dvorak, R, { kind: 'recovered' }), /^coverage remediation rejected \(not_recovered\): source .* is degraded now \(SourceHealthChanged at/, 409, 'EYE-STA-002');
    await refused(closeR(dvorak, R, { kind: 'gap_accepted' }), /^coverage remediation rejected \(no_accepted_gap\)/, 409, 'EYE-STA-002');
    await refused(closeR(dvorak, R, { kind: 'resolved' }), /kind is one of recovered, gap_accepted/, 422, 'EYE-REQ-001');
    await refused(closeR(analyst, R, { kind: 'recovered' }), /^coverage remediation rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    /* R1.8 THE WARNINGS' READ (observation.source_remediations): the open one with its steps, under the reader's context; nothing without one. */
    const forWarnings = await sourceRemediations(executive, [sourceId, corridorId]);
    expect(forWarnings).toEqual([expect.objectContaining({ source_id: sourceId, remediation_id: R, state: 'in_progress', item_id: item.item_id })]);
    expect((forWarnings[0]!['steps'] as Row[]).map((s) => s['kind'])).toEqual(['fallback_source', 'recollect', 'recollect']);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.source_remediations(${T()}::uuid, ${D()}::uuid, array[${sourceId}::uuid])`.execute(su)).rows[0]!.n, 'no context, no rows').toBe(0);
    /* R1.9 RECOVERY: the subscriber applies healthy → the remediation closes `closed_recovered` automatically, naming the health event. */
    await settle();
    const healthy = await plantHealth('degraded', 'healthy', 'B28 R1: the portal answers again (harness)');
    const dh = await healthApplied(healthy);
    expect(dh.items_applied[0]).toMatchObject({ effect: 'markers.cleared' });
    const closed = await remediation(R);
    expect(closed).toMatchObject({ state: 'closed_recovered', closure: { kind: 'recovered', automatic: true, health_event: healthy, health: { state: 'healthy' } } });
    expect(closed.gap_to).not.toBeNull();
    expect((closed.gap['window'] as Row)['to']).not.toBeNull();
    const evs = await remediationEvents(R);
    expect(evs.map((e) => e.event)).toEqual(['remediation.opened', 'remediation.step_added', 'remediation.step_added', 'remediation.step_added', 'remediation.closed']);
    expect(evs.at(-1)!.details).toMatchObject({ from_state: 'in_progress', state: 'closed_recovered', closure: { automatic: true } });
    expect(await active()).toEqual([]);
    /* R1.10 NOTHING ACTS ON IT ANY MORE; the item no longer opens one (the source is healthy). */
    await refused(stepR(dvorak, R, { kind: 'fallback_source', fallbackSourceId: corridorId, reason: 'after the closure (B28 harness)' }), /^coverage remediation rejected \(not_open\): remediation .* is closed_recovered/, 409, 'EYE-STA-002');
    await refused(withdrawR(dvorak, R, { reason: 'after the closure (B28 harness)' }), /^coverage remediation rejected \(not_open\)/, 409, 'EYE-STA-002');
    await refused(openR(dvorak, payload), /^coverage remediation rejected \(source_healthy\): source .* is healthy now \(SourceHealthChanged at/, 409, 'EYE-STA-002');
    sixEvidence('R1', { fault_trace: { degraded_event: degraded, item: item.item_id }, watermark: { remediation: R, steps: 2 },
      consumer_behaviour: 'source-health routed the coverage loss; on the recovery it cleared the markers and closed the remediation (automatic)', operator_action: 'M. Dvořák opened it with the corridor fallback; a second manager named the re-collection run',
      recovery: { healthy_event: healthy, closure: closed.closure }, reconciliation: { events: evs.length, active_markers: 0 } });
  }, 360_000);

  it('R2 · THE OTHER CLOSURES: opened by the item\'s owner; the gap accepted by a second person; a withdrawal; a recovery the subscriber has not applied closed by a person', async () => {
    await settle();
    const degraded = await plantHealth('healthy', 'degraded', 'B28 R2: the portal lags again (harness)');
    await healthApplied(degraded);
    const item = await lossItem(degraded);
    // the owner an item carries after a delegation (planted: the analyst — neither a collection manager nor a domain administrator)
    await sql`update executive.attention_items set owner_principal_id = ${analyst.principalId}::uuid where item_id = ${item.item_id}::uuid`.execute(su);
    /* R2.1 THE ITEM'S OWNER OPENS IT, naming M. Dvořák; the gap is accepted by a second person; the owner closes on it. */
    const R = (await openR(analyst, { itemId: item.item_id, owner: dvorak.principalId, reason: 'the owner of the item opens the remediation (B28 harness)' })).remediation.remediation_id;
    expect(await remediation(R)).toMatchObject({ state: 'open', opened_by: analyst.principalId, owner_principal_id: dvorak.principalId });
    const g = (await stepR(second, R, { kind: 'accept_gap', reason: 'two days of portal data are not recoverable; the corridor stream covers the decision' })).remediation;
    expect(g).toMatchObject({ state: 'in_progress', step: { kind: 'accept_gap', by: second.principalId, owner: dvorak.principalId } });
    const c1 = (await closeR(dvorak, R, { kind: 'gap_accepted', note: 'closed on the accepted gap' })).remediation;
    expect(c1).toMatchObject({ state: 'closed_gap_accepted', closure: { kind: 'gap_accepted', by: dvorak.principalId, accepted_by: second.principalId, automatic: false } });
    expect((await remediation(R)).gap_to).not.toBeNull();
    /* R2.2 A WITHDRAWAL: 422 reason, 403 not the owner, the owner withdraws; 409 again. The gap's window stays open. */
    const W = (await openR(dvorak, { itemId: item.item_id, reason: 'a second attempt, withdrawn (B28 harness)' })).remediation.remediation_id;
    expect((await remediation(W)).owner_principal_id, 'the owner defaults to the opener').toBe(dvorak.principalId);
    await refused(withdrawR(dvorak, W, { reason: 'short' }), /^coverage remediation rejected \(reason\): a withdrawal carries a reason/, 422, 'EYE-REQ-001');
    await refused(withdrawR(admin, W, { reason: 'the administrator is not the owner (B28)' }), /^coverage remediation rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    const wd = (await withdrawR(dvorak, W, { reason: 'opened twice by mistake (B28 harness)' })).remediation;
    expect(wd).toMatchObject({ state: 'withdrawn', closure: { kind: 'withdrawn', by: dvorak.principalId } });
    expect((await remediation(W)).gap_to, 'a withdrawal does not say the loss ended').toBeNull();
    await refused(withdrawR(dvorak, W, { reason: 'withdrawn again (B28 harness)' }), /^coverage remediation rejected \(not_open\): remediation .* is withdrawn/, 409, 'EYE-STA-002');
    /* R2.3 A RECOVERY THE SUBSCRIBER HAS NOT APPLIED: a coverage evaluation records healthy (planted without its announcement) → a person closes it recovered. */
    const M = (await openR(dvorak, { itemId: item.item_id, reason: 'the third remediation, closed by hand (B28 harness)' })).remediation.remediation_id;
    const healthEvent = uuidv7();
    await sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, evidence_refs, reason, lag_class, correlation_id)
      values (${healthEvent}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${sourceId}::uuid, 'degraded', 'healthy', clock_timestamp(), 'coverage-calc@1.1.0', '1', '[]'::jsonb, 'B28 R2: coverage restored (planted evaluation)', 'none', ${uuidv7()}::uuid)`.execute(su);
    const c2 = (await closeR(second, M, { kind: 'recovered' })).remediation;
    expect(c2).toMatchObject({ state: 'closed_recovered', closure: { kind: 'recovered', automatic: false, by: second.principalId, health: { state: 'healthy', basis: 'coverage evaluation', ref: healthEvent } } });
    /* the subscriber's recovery then clears the markers and finds no open remediation: nothing more is closed */
    const before = (await sql<{ n: number }>`select count(*)::int n from observation.coverage_remediation_events e join observation.coverage_remediations r using (remediation_id) where r.source_id = ${sourceId}::uuid`.execute(su)).rows[0]!.n;
    await settle();
    await healthApplied(await plantHealth('degraded', 'healthy', 'B28 R2: the announcement follows (harness)'));
    expect(await active()).toEqual([]);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.coverage_remediation_events e join observation.coverage_remediations r using (remediation_id) where r.source_id = ${sourceId}::uuid`.execute(su)).rows[0]!.n).toBe(before);
    sixEvidence('R2', { fault_trace: { degraded_event: degraded, item: item.item_id }, watermark: { gap_accepted: R, withdrawn: W, closed_by_hand: M },
      consumer_behaviour: 'the recovery applied after a manual closure closes nothing more', operator_action: 'the item owner opened; a second manager accepted the gap; the owner withdrew one; a manager closed one on a recorded recovery',
      recovery: { closure: c2.closure }, reconciliation: { remediations: await remediationCount() } });
  }, 240_000);

  it('R3 · THE ASSUMPTION REACH: the suspended portal marks the assumptions resting on its extracted claim (to depth 4) and the package citing one; L. Brandt\'s commitment is refused until the bearing marker is acknowledged for that version', async () => {
    expect(await active()).toEqual([]);
    /* R3.1 SUSPENDED through the route → the markers: the assumptions A1..A4 (depth 1..4), not A5 (depth 5), not another source's; the package through A2. */
    const suspended = await transition('suspended', 'B28 R3: the supplier portal is suspended (harness)');
    const m = (await active()).filter((x) => x.set_by_event === suspended);
    const onA = m.filter((x) => x.subject_kind === 'assumption');
    expect(sorted(onA.map((x) => x.subject_id)), 'depth 1..4 reached; depth 5 and the other source\'s assumption are not').toEqual(sorted(A.slice(0, 4)));
    for (const x of onA) expect(x.health_state).toBe('suspended');
    expect(m.filter((x) => x.subject_kind === 'package').map((x) => x.subject_id)).toEqual([PA]);
    const set = ((await deliveriesFor(suspended)).find((x) => x.consumer_kind === 'source-health')!.items_applied[0]!.details!['set'] as Row[]);
    expect(set.find((x) => x['id'] === A[0])?.['via']).toBe(`rests on claim ${claimId}`);
    expect(set.find((x) => x['id'] === A[1])?.['via']).toBe(`rests on assumption ${A[0]} (depth 2)`);
    expect(set.find((x) => x['id'] === A[3])?.['via']).toBe(`rests on assumption ${A[2]} (depth 4)`);
    expect(set.find((x) => x['id'] === PA)?.['via']).toBe(`option reroute cites assumption ${A[1]}`);
    expect(set.some((x) => x['id'] === A[4] || x['id'] === otherAssumption)).toBe(false);
    /* R3.2 THE MARKERS READ names the assumptions. */
    const g = (await readMarkers(w.owner)).sources!.find((x) => x.source_id === sourceId)!;
    expect(g).toMatchObject({ worst_state: 'suspended' });
    expect(g.counts['assumption']).toBe(4);
    expect(g.markers.find((x) => x.subject_id === A[0])?.subject_title).toMatch(/^assumption: The supplier portal keeps publishing the 90-day forecast \(active, \w+\)$/);
    /* R3.3 THE BEARING of PA's version: the package and the cited assumption, unacknowledged — the gate blocked. */
    const b = await bearing(PA, PAv);
    expect(sorted(b.markers.map((x) => `${x.subject_kind}:${x.subject_id}`))).toEqual(sorted([`package:${PA}`, `assumption:${A[1]}`]));
    expect(b).toMatchObject({ outstanding: 2, gate: 'blocked' });
    expect(b.markers.find((x) => x.subject_kind === 'assumption')?.bearing).toBe('option reroute cites it');
    /* R3.4 L. BRANDT'S COMMITMENT REFUSED (409, naming the assumption) — nothing committed. */
    const digest = String((await sql<{ d: string }>`select version_digest d from decision.package_versions where package_id = ${PA}::uuid and version = ${PAv}`.execute(su)).rows[0]!.d);
    const r = await refused(c.commit(PA, PAv, digest, w.authority), /^commitment rejected \(source_impact\): 2 active source-impact marker\(s\) bear on version 1 of package .* and are not acknowledged for this version — /, 409, 'EYE-STA-002');
    expect(r.message).toContain(`assumption ${A[1]!} (source ${sourceId} suspended`);
    expect(await commitments(PA)).toEqual([]);
    /* R3.5 ACKNOWLEDGED for that version → committed. */
    const ackd = (await ack(w.authority, PA, { version: PAv, markerIds: b.markers.map((x) => x.marker_id), reason: 'the portal forecast is suspended; the corridor stream covers the reroute decision (B28)' })).acknowledgement;
    expect(ackd).toMatchObject({ repeated: false, outstanding: [] });
    expect((await bearing(PA, PAv)).gate).toBe('clear');
    await c.commit(PA, PAv, digest, w.authority);
    expect(await commitments(PA)).toEqual([PAv]);
    /* R3.6 A LATER DRAFT citing the depth-4 assumption (and the depth-5 one) is borne on through A4 only. */
    const pb = await draftOnAssumption('B28 PB: a draft on the depth-4 assumption (harness)', A[3]!, A[4]!);
    const bb = await bearing(pb.pkg, pb.v);
    expect(bb.markers.map((x) => `${x.subject_kind}:${x.subject_id}`)).toEqual([`assumption:${A[3]}`]);
    sixEvidence('R3', { fault_trace: { suspended_event: suspended, refused: r.message.slice(0, 160) }, watermark: { assumptions: onA.length, package: PA },
      consumer_behaviour: 'source-health set markers on the assumptions to depth 4 and on the package citing one', operator_action: 'L. Brandt acknowledges the bearing markers for the version',
      recovery: 'the commitment retried after the acknowledgement', reconciliation: { committed: await commitments(PA), acks: (await ackEvents(PA)).length, later_draft: pb.pkg } });
    PB = pb;
  }, 300_000);

  it('R4 · RECOVERY: reactivated through the route → every marker cleared, the assumptions\' included → the later draft commits with no acknowledgement', async () => {
    const before = await active();
    expect(before.some((x) => x.subject_kind === 'assumption')).toBe(true);
    const back = await transition('active', 'B28 R4: the supplier portal answers again (harness)');
    expect(await active()).toEqual([]);
    for (const x of (await markers()).filter((y) => before.some((b) => b.marker_id === y.marker_id))) expect(x).toMatchObject({ state: 'cleared', cleared_state: 'healthy', cleared_by_event: back });
    expect(await bearing(PB!.pkg, PB!.v)).toMatchObject({ outstanding: 0, gate: 'clear', markers: [] });
    const digest = await proposeApprove(PB!.pkg, PB!.v);
    await c.commit(PB!.pkg, PB!.v, digest, w.authority);
    expect(await commitments(PB!.pkg)).toEqual([PB!.v]);
    expect(await ackEvents(PB!.pkg)).toEqual([]);
    sixEvidence('R4', { fault_trace: { active_event: back }, watermark: { cleared: before.length }, consumer_behaviour: 'source-health cleared every marker of the source, the assumptions\' included',
      operator_action: 'a commitment after the recovery', recovery: 'no acknowledgement needed', reconciliation: { committed: PB!.pkg } });
  }, 240_000);
});
