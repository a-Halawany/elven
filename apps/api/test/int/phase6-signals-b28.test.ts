/**
 * CP-6 B28 (migration 0088 §S, part `signals`) — WEAK-SIGNAL DETECTION AND THE INDICATOR WORKBENCH (F-P4-10) and the NOVELTY input of the
 * attention engine (F-P6-07), on a real database: the world of `bootDecisionWorld` (the IMF-shaped fixture source with its evaluated
 * corridor indicator, the SYNTHETIC upload source), one more upload source standing in for a REAL-ORIGIN publisher (a harness double —
 * its contract says data_origin real and names another publisher; it exists only to give the independence test a second real source),
 * relationships planted with their events (the B20/B22 idiom), and B28's own humans with sessions of their own (the ports compare the
 * acting principal): A. Hoffmann (a domain analyst: tests independence, disposes, escalates), a second analyst (runs the detectors and
 * nominates — so the nominator is never the one who disposes), a strategy owner (governs the registry), the executive (triggers the agent),
 * the tenant administrator (registers the agent).
 *
 *   S1 · the DETECTORS: the registry (available with digests equal to the code as it stands; cross-domain convergence ABSENT with its
 *        reason) and the false-positive CONTROLS on the SYNTHETIC fixtures (seeded / null / drift / source gap) — every one as expected.
 *   S2 · the SCAN by a person (nominator `detector`), in EVENT TIME (as of 2023-11-24, inside the fixture's disruption): novelty and
 *        change point fire and nominate TENTATIVE signals with their observation, baseline, novelty basis and the IMF evidence as the first
 *        counted source; a rescan answers `repeated`; a reading with too few points is HELD and exposed; 403 (the executive), 422 (a
 *        wall-clock as-of), 404 (an unknown signal).
 *   S3 · RELATIONSHIP CHANGE and DIFFUSION on planted relationships (world time): both fire on an entity whose relationships and real
 *        sources jump; diffusion HOLDS an entity whose recent sources are all synthetic.
 *   S4 · THE DEMO: a second analyst nominates "Red Sea insurers withdrawing war-risk cover" from three low-confidence SYNTHETIC reports
 *        (none counted: synthetic evidence corroborates nothing); A. Hoffmann TESTS SOURCE INDEPENDENCE (the pairs: dependent, unknown)
 *        and marks it MONITOR with a falsify condition; the nominator's own disposition 403, `monitor` without a falsify condition 422, the
 *        same disposition again `repeated`.
 *   S5 · CORROBORATION and THE MATURITY GATE: a second IMF evidence version is DEPENDENT (the same source and publisher), the maturity
 *        refuses a direct change (the gate, 409), a stale version 409 then the retry, the real-origin publisher's report is INDEPENDENT →
 *        CORROBORATED by a `signal.corroborated` event naming the row; the disposition kept; a duplicate 409; a signal made INVALID by two
 *        independent contradicting sources — its confirmation and escalation 409.
 *   S6 · the CONDITIONS: strengthen and falsify stated; an unknown indicator 404, a malformed condition 422, a monitored signal kept with a
 *        falsify condition 422.
 *   S7 · ESCALATION submits a WARNING CANDIDATE through the intake (origin weak_signal, key signal:id:version, the evidence with stances);
 *        no warning is raised here; again → `repeated` with the same candidate.
 *   S8 · THE WEAK SIGNAL AGENT: registered with this runtime's scan (a foreign digest 422); its run (an operator's trigger) scans as of an
 *        observation day under its own session — nominator `agent`, max_items bounding the nominations (the rest WAITING), the rank
 *        recorded, its attempt at a disposition REFUSED at the PDP and recorded on the run; a second run nominates what waited; a drifted
 *        registration's run is refused and recorded.
 *   S9 · INDICATOR GOVERNANCE: the lineage set at definition, the steward's classification / expiry / cadence (403 the analyst, 422 a past
 *        expiry, 404), an EXPIRED indicator NOT EVALUATED (409) and not scanned, renewed and evaluated again, a RETIRED one not evaluated nor
 *        renewed (409), the ledger; a restricted indicator withheld from the analyst.
 *   S10 · NOVELTY in the attention engine: `min_novelty` validated (422 out of range); the warning's dimensions carry the novelty detector's
 *        measure of its indicator (and a weak signal's own, where the warning names one); a class that sets min_novelty JUDGES it through the
 *        real consumer; a class that does not leaves every reason as it was; a threshold with no input says "novelty: no input, not judged".
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
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { SignalsController } from '../../src/prediction/signals/signals.controller.js';
import { ExecutiveCapability } from '../../src/executive/executive.capabilities.js';
import { AttentionConsumer } from '../../src/executive/attention/attention.consumers.js';
import type { FlatEvent } from '../../src/graph/subscriptions/graph-change.js';
import { WEAK_SIGNAL_AGENT_DIGEST, WEAK_SIGNAL_AGENT_VERSION } from '../../src/prediction/signals/signal-agent-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (the uploads go through the real file path).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b28s-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; bytesDigest: string };
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let sig: SignalsController; let prediction: PredictionController; let exec: ExecutiveController; let consumer: AttentionConsumer;
let hoffmann: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** gitleaks: a key-like literal is built, never written whole. */
const note = (...parts: string[]): string => parts.join(' ');
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B28 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
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

/* ───────────── the routes (in process) ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'prediction');
const scan = (as: AuthenticatedPrincipal, payload: Row) => sig.scan(req(as, 'prediction.signal.nominate', 'SIG', null), T(), D(), { payload }) as Promise<{ scan: Row }>;
const nominate = (as: AuthenticatedPrincipal, payload: Row) => sig.nominate(req(as, 'prediction.signal.nominate', 'SIG', null), T(), D(), { payload }) as Promise<{ signal: Row }>;
const rank = (as: AuthenticatedPrincipal) => sig.rank(req(as, 'prediction.signal.rank', 'SIG', null), T(), D()) as Promise<{ ranking: Row }>;
const addEvidence = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.addEvidence(req(as, 'prediction.signal.evidence.add', 'SIG', id), T(), D(), id, { payload }) as Promise<{ corroboration: Row }>;
const independence = (as: AuthenticatedPrincipal, id: string) => sig.testIndependence(req(as, 'prediction.signal.independence.test', 'SIG', id), T(), D(), id) as Promise<{ independence: Row }>;
const dispose = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.dispose(req(as, 'prediction.signal.dispose', 'SIG', id), T(), D(), id, { payload }) as Promise<{ signal: Row }>;
const conditions = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.setConditions(req(as, 'prediction.signal.conditions.set', 'SIG', id), T(), D(), id, { payload }) as Promise<{ signal: Row }>;
const escalate = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.escalate(req(as, 'prediction.signal.escalate', 'SIG', id), T(), D(), id, { payload }) as Promise<{ escalation: Row }>;
const getSignal = (as: AuthenticatedPrincipal, id: string) => sig.getSignal(req(as, 'prediction.read', 'SIG', id), T(), D(), id) as Promise<{ signal: Row }>;
const listSignals = (as: AuthenticatedPrincipal) => sig.listSignals(req(as, 'prediction.read', 'SIG', null), T(), D()) as Promise<Row>;
const detectors = (as: AuthenticatedPrincipal) => sig.listDetectors(req(as, 'prediction.read', 'DET', null), T(), D()) as Promise<Row>;
const governance = (as: AuthenticatedPrincipal) => sig.listIndicatorGovernance(req(as, 'prediction.read', 'IND', null), T(), D()) as Promise<Row>;
const govern = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.governIndicator(req(as, 'prediction.indicator.govern', 'IND', id), T(), D(), id, { payload }) as Promise<{ indicator: Row }>;
const retire = (as: AuthenticatedPrincipal, id: string, reason: string) => sig.retireIndicator(req(as, 'prediction.indicator.retire', 'IND', id), T(), D(), id, { payload: { reason } }) as Promise<{ indicator: Row }>;
const renew = (as: AuthenticatedPrincipal, id: string, payload: Row) => sig.renewIndicator(req(as, 'prediction.indicator.renew', 'IND', id), T(), D(), id, { payload }) as Promise<{ indicator: Row }>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ warningId: string; branchId: string }> }>;
const defineIndicator = (description: string) => prediction.defineIndicator(req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
  { payload: { seriesKey: w.seriesKey, description, comparator: '<', threshold: 40, consecutiveDays: 5, owner: w.twinOwner.principalId } }) as Promise<{ indicator: { indicatorId: string } }>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string; kind: string; role: string } }>;
const runAgent = (agentId: string, payload: Row) => exec.runAgent(h.req(executive, 'agent.trigger', 'AGT', agentId, 'prediction'), T(), D(), agentId, { payload: payload as never }) as Promise<{ run: { runId: string; outcome: string; stopReason: string | null; refusals: Row[]; outputs: Row } }>;
const publishPolicy = (rules: Row, reason: string) => exec.publishAttentionPolicy(h.req(executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;

/* ───────────── the rows ───────────── */
const signalRow = async (id: string): Promise<Row> => (await sql<Row>`select * from prediction.signals_current where signal_id = ${id}::uuid`.execute(su)).rows[0]!;
const signalEvents = async (id: string) => (await sql<{ event: string; signal_version: number; details: Row; actor: string }>`select event, signal_version, details, actor_principal_id::text actor from prediction.signal_events where signal_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const commitDb = () => h.app.get<Db>(COMMIT_DB);
const bound = <X>(as: AuthenticatedPrincipal, action: string, body: (tx: never) => Promise<X>): Promise<X> =>
  inCommitContext(commitDb(), { sessionId: as.sessionId, contextKey: as.contextKey }, { tenantId: T(), domainId: D() }, action, uuidv7(), body);
const dimensionsOf = (cls: string, subjectId: string): Promise<Row> => bound(executive, 'executive.attention.subscription.apply', async (tx) =>
  (await sql<{ r: Row }>`select executive.attention_dimensions(${T()}::uuid, ${D()}::uuid, ${cls}, ${subjectId}::uuid, '{}'::jsonb) r`.execute(tx)).rows[0]!.r);
const evaluate = async (rules: unknown, cls: string, dims: Row): Promise<Row> => (await sql<{ r: Row }>`select executive.evaluate_attention(${JSON.stringify(rules)}::jsonb, ${cls}, ${JSON.stringify(dims)}::jsonb) r`.execute(su)).rows[0]!.r;
const applyAttention = (event: FlatEvent, item: string): Promise<{ effect: string }> => bound(executive, 'executive.attention.subscription.apply', async (tx) =>
  consumer.applyItem(ExecutiveCapability.attentionSubscriber(tx, 'executive.attention.subscription.apply'), { tenantId: T(), domainId: D() }, event, item, executive.principalId, uuidv7(), uuidv7()) as Promise<{ effect: string }>);

/**
 * THE REAL-ORIGIN DOUBLE: an upload source whose contract names another publisher and data_origin `real` — registered, approved and
 * activated through the real route and ports, with its upload agent (the Phase4Harness.uploadSource steps, the contract overridden). A
 * HARNESS DOUBLE: it exists to give the independence test a second non-synthetic source; nothing presents it as a feed.
 */
async function realOriginUploads(publisher: string, files: Array<{ filename: string; text: string }>): Promise<Evd[]> {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const sourceKey = `harness-real-origin-double-${uuidv7().slice(-8)}`;
  const contract = { ...uploadContract(sourceKey), name: 'Harness double of a real-origin publisher (test only)', publisher, data_origin: 'real' };
  const r = await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(), { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  const route = (action: string) => ({ scope: 'DOMAIN' as const, tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId });
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', sourceId), h.manager, route('observation.source.approve'), ObservationCapability.registry, async (cap) => {
    await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B28 real-origin harness double', eventId: uuidv7(), correlationId: uuidv7() });
    return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
  });
  await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', sourceId), h.manager, route('observation.source.transition'), ObservationCapability.registry, async (cap) => {
    await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: 'active', reason: 'B28 real-origin harness double: active', eventId: uuidv7(), correlationId: uuidv7() });
    return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
  });
  const connector = new UploadConnector([]);
  const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  await inCommitContext(commitDb(), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() }, 'observation.agent.register', agentId, async (tx) => {
    await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
      ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
  });
  await h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
    { payload: { sourceId, contractVersion: 1, files: files.map((f) => ({ filename: f.filename, mediaType: 'text/csv', base64: Buffer.from(f.text, 'utf8').toString('base64'), documentTime: '2024-01-11T00:00:00Z' })) } });
  const out: Evd[] = [];
  for (const f of files) {
    const itemKey = `upload:${f.filename}@${sha256(f.text).slice(0, 16)}`;
    const row = (await sql<{ id: string; version: number; bytes_digest: string }>`
      select e.object_id::text id, e.object_version::int version, (e.payload ->> 'content_digest') bytes_digest from objects.canonical_objects e
        join objects.canonical_objects o on o.object_type = 'OBS' and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
       where e.object_type = 'EVD' and e.tenant_id = ${T()}::uuid and o.tenant_id = ${T()}::uuid and o.payload ->> 'item_key' = ${itemKey}
       order by e.recorded_at desc limit 1`.execute(su)).rows[0];
    if (row === undefined) throw new Error(`the upload of ${f.filename} admitted no evidence`);
    out.push({ id: row.id, version: row.version, bytesDigest: row.bytes_digest });
  }
  return out;
}
/** SYNTHETIC reports through the harness's own upload source (data_origin synthetic). */
async function syntheticReports(files: Array<{ filename: string; text: string }>): Promise<Evd[]> {
  return (await h.upload(files.map((f) => ({ ...f, documentTime: '2024-01-11T00:00:00Z' })))).map((u) => ({ id: u.id, version: u.version, bytesDigest: u.bytesDigest }));
}
const csv = (lines: string[]): string => ['date,report', ...lines].join('\n') + '\n';

/* ───────────── the relationships planted WITH their events (the B20/B22 idiom), world time stated ───────────── */
async function seedEntity(name: string): Promise<string> {
  const id = uuidv7(); const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'organization', ${name}, ${name.toLowerCase()}, 'active', ${w.twinOwner.principalId}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${w.twinOwner.principalId}::uuid, ${JSON.stringify({ entity_type: 'organization', canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
  return id;
}
async function seedEdge(subject: string, object: string, validFrom: string, evidence: Evd): Promise<void> {
  const edgeId = uuidv7(); const claimId = uuidv7(); const methodId = uuidv7(); const runId = uuidv7(); const correlationId = uuidv7(); const actor = w.twinOwner.principalId;
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${subject}::uuid, 'insures', ${object}::uuid, ${validFrom}::timestamptz, null, 'asserted', ${claimId}::uuid, 1, ${evidence.id}::uuid, ${evidence.bytesDigest}, ${methodId}::uuid, ${runId}::uuid, 'replay', 0.6, ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${edgeId}::uuid, 'edge.asserted', ${actor}::uuid, jsonb_build_object('predicate', 'insures', 'subject', ${subject}::uuid, 'object', ${object}::uuid, 'valid_from', ${validFrom}::timestamptz, 'valid_to', null, 'mode', 'replay', 'claim_object_id', ${claimId}::uuid, 'claim_version', 1, 'review_state', 'approved'), ${correlationId}::uuid)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.6, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
}

/** What the cases leave one another. */
let imf: Evd; let imf2: Evd; let lloyds: Evd[] = []; let reports: Evd[] = [];
let detectorSignal = ''; let demoSignal = ''; let invalidSignal = ''; let warningId = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { SignalsController: Sc } = await import('../../src/prediction/signals/signals.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  sig = h.app.get(Sc); prediction = h.app.get(Pc); exec = h.app.get(Ec); consumer = h.app.get(AttentionConsumer);
  hoffmann = await h.humanWithSession(['domain_analyst'], 'a-hoffmann');
  analyst2 = await h.humanWithSession(['domain_analyst'], 'b28-analyst-2');
  steward = await h.humanWithSession(['strategy_owner'], 'b28-steward');
  executive = await h.humanWithSession(['executive'], 'b28-executive');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b28-tenant-admin', 'TENANT');
  w = await bootDecisionWorld(h);
  // the corridor indicator evaluated over the fixture's whole series (its observations are the series detectors' input); the flip raises the warning
  const ev = await evaluateIndicator(w.indicatorId);
  warningId = ev.warnings.find((x) => x.branchId === w.branchId)!.warningId;
  const evds = (await sql<{ id: string; version: number; bytes_digest: string }>`select object_id::text id, object_version::int version, payload ->> 'content_digest' bytes_digest from objects.canonical_objects
     where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`.execute(su)).rows;
  imf = { id: evds[0]!.id, version: evds[0]!.version, bytesDigest: evds[0]!.bytes_digest };
  imf2 = { id: evds[1]!.id, version: evds[1]!.version, bytesDigest: evds[1]!.bytes_digest };
  reports = await syntheticReports([
    { filename: 'b28-report-insurer-a.csv', text: csv(['2024-01-09,insurer A said to withdraw war-risk cover for Red Sea transits (unconfirmed)']) },
    { filename: 'b28-report-insurer-b.csv', text: csv(['2024-01-10,second-hand: a Lloyd\'s syndicate pausing Red Sea quotes']) },
    { filename: 'b28-report-insurer-c.csv', text: csv(['2024-01-10,broker chatter: premiums suspended for Bab el-Mandeb']) },
  ]);
  lloyds = await realOriginUploads('Lloyd\'s List Intelligence (harness double)', [
    { filename: 'b28-lloyds-notice-1.csv', text: csv(['2024-01-11,market notice: two war-risk underwriters withdraw Red Sea cover']) },
    { filename: 'b28-lloyds-notice-2.csv', text: csv(['2024-01-12,market notice: cover restored by one underwriter']) },
  ]);
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B28 · weak-signal detection and the indicator workbench (0088 §S; F-P4-10) and the novelty input (F-P6-07)', () => {
  it('S1 · the DETECTORS: available ones with their code digests as registered, cross-domain convergence ABSENT with its reason, and the false-positive controls on the SYNTHETIC fixtures', async () => {
    const d = await detectors(hoffmann);
    const reg = arr(d['detectors']);
    expect(reg.map((r) => r['detector_key']).sort()).toEqual(['acceleration', 'change_point', 'cross_domain_convergence', 'diffusion', 'novelty', 'relationship_change']);
    for (const r of reg.filter((x) => x['status'] === 'available')) {
      expect(r['code_digest'], String(r['detector_key'])).toMatch(/^[0-9a-f]{64}$/);
      expect(r['current_digest'], String(r['detector_key'])).toBe(r['code_digest']);
      expect(r['code_state']).toBe('as registered');
      expect(r['model_class']).toBe('weak_signal_anomaly');
    }
    const absent = arr(d['absent']);
    expect(absent).toHaveLength(1);
    expect(absent[0]).toMatchObject({ detector: 'cross_domain_convergence' });
    expect(String(absent[0]!['reason'])).toMatch(/cross-domain read.*row-level security/);
    const controls = arr(d['controls']);
    expect(controls).toHaveLength(12);
    for (const c of controls) expect(c['passed'], `${String(c['fixture'])} × ${String(c['detector'])}: expected ${String(c['expected'])}, got ${String(c['got'])}`).toBe(true);
    expect(controls.every((c) => c['data_provenance'] === 'synthetic')).toBe(true);
    expect(controls.filter((c) => c['fixture'] === 'null').every((c) => c['got'] === 'quiet')).toBe(true);
    expect(controls.filter((c) => c['fixture'] === 'source_gap').every((c) => c['got'] === 'held:source_gap')).toBe(true);
    sixEvidence('S1', { fault_trace: { absent: absent.map((a) => a['detector']) }, watermark: { digests: reg.map((r) => [r['detector_key'], String(r['code_digest'] ?? '').slice(0, 12)]) },
      consumer_behaviour: controls.map((c) => `${String(c['fixture'])}/${String(c['detector'])}=${String(c['got'])}`), operator_action: 'none: a read', recovery: 'a drifted function shows DRIFTED', reconciliation: { passed: controls.length } });
  }, 120_000);

  it('S2 · the SCAN in event time (as of 2023-11-24): novelty and change point nominate TENTATIVE signals with their basis; a rescan is repeated; a thin series is HELD; 403, 422, 404', async () => {
    await refused(scan(executive, { asOf: '2023-11-24' }), /./, 403);
    await refused(scan(analyst2, { asOf: '2023-11-24T10:00:00Z' }), /event time/, 422);
    const s = (await scan(analyst2, { asOf: '2023-11-24' })).scan;
    expect(s['nominator_kind']).toBe('detector');
    const onIndicator = arr(s['detections']).filter((x) => x['subject_id'] === w.indicatorId);
    expect(onIndicator.map((x) => x['detector']).sort()).toEqual(['acceleration', 'change_point', 'novelty']);
    const nov = onIndicator.find((x) => x['detector'] === 'novelty')!;
    expect(nov).toMatchObject({ fired: true, held: null, as_of: '2023-11-24' });
    expect(Number(nov['measure'])).toBeGreaterThanOrEqual(0.95);
    const nominated = arr(s['nominated']).filter((x) => x['subject_id'] === w.indicatorId);
    expect(nominated.map((x) => x['detector']).sort()).toEqual(expect.arrayContaining(['change_point', 'novelty']));
    detectorSignal = String(nominated.find((x) => x['detector'] === 'novelty')!['signal_id']);
    const row = await signalRow(detectorSignal);
    expect(row).toMatchObject({ nominator_kind: 'detector', nominated_by: analyst2.principalId, maturity: 'tentative', version: 1, subject_kind: 'indicator', subject_id: w.indicatorId, independent_sources: 1, synthetic_state: false });
    expect(obj(row['observation'])).toMatchObject({ from: '2023-11-20', to: '2023-11-24', points: 5 });
    expect(obj(row['baseline'])).toMatchObject({ points: 60 });
    expect(String(obj(row['novelty_basis'])['rule'])).toMatch(/share of the baseline's own deviations/);
    const basis = (await sql<Row>`select * from prediction.signal_evidence where signal_id = ${detectorSignal}::uuid`.execute(su)).rows;
    expect(basis).toHaveLength(1);
    expect(basis[0]).toMatchObject({ role: 'basis', stance: 'supporting', independence: 'independent', data_origin: 'real', synthetic: false, source_id: h.fx.sourceId });
    // a rescan of the same day: every reading recorded once, nothing nominated twice
    const again = (await scan(analyst2, { asOf: '2023-11-24' })).scan;
    expect(arr(again['nominated']).filter((x) => x['subject_id'] === w.indicatorId)).toHaveLength(0);
    expect(arr(again['repeated']).map((x) => x['signal_id'])).toContain(detectorSignal);
    expect(arr(again['detections']).filter((x) => x['subject_id'] === w.indicatorId).every((x) => x['repeated'] === true)).toBe(true);
    // a thin series (three weeks in): HELD, exposed with its reason, never nominated
    const thin = (await scan(analyst2, { asOf: '2021-01-20' })).scan;
    const held = arr(thin['held']).filter((x) => x['subject_id'] === w.indicatorId);
    expect(held.map((x) => x['held'])).toEqual(expect.arrayContaining(['insufficient_evidence']));
    expect(arr(thin['nominated']).filter((x) => x['subject_id'] === w.indicatorId)).toHaveLength(0);
    const q = await listSignals(hoffmann);
    expect(arr(q['held']).some((x) => x['subject_id'] === w.indicatorId && x['held_reason'] === 'insufficient_evidence')).toBe(true);
    expect(arr(q['signals']).some((x) => x['signal_id'] === detectorSignal)).toBe(true);
    await refused(getSignal(hoffmann, uuidv7()), /no such signal/, 404);
    await refused(getSignal(hoffmann, 'not-an-id'), /no such signal/, 404);
    // THE NOVELTY INPUT (F-P6-07): the corridor warning's dimensions carry its indicator's latest novelty reading — this one
    const dw = await dimensionsOf('warning.raised', warningId);
    expect(Number(dw['novelty'])).toBeGreaterThanOrEqual(0.95);
    expect(obj(obj(dw['dimension_basis'])['novelty'])).toMatchObject({ indicator_id: w.indicatorId, as_of: '2023-11-24', fired: true, detection_id: nov['detection_id'] });
    const events = await signalEvents(detectorSignal);
    expect(events.map((e) => e.event)).toEqual(['signal.nominated']);
    expect(obj(events[0]!.details)).toMatchObject({ nominator_kind: 'detector', detector: 'novelty' });
    sixEvidence('S2', { fault_trace: { refused: ['403 executive', '422 wall-clock as-of', '404 unknown', '404 malformed id'] }, watermark: { as_of: '2023-11-24', novelty: nov['measure'] },
      consumer_behaviour: { nominated: nominated.map((x) => x['detector']), held: held.map((x) => `${String(x['detector'])}:${String(x['held'])}`) }, operator_action: 'the second analyst runs the detectors',
      recovery: 'a rescan answers repeated', reconciliation: { signal: detectorSignal, independent_sources: row['independent_sources'] } });
  }, 240_000);

  it('S3 · RELATIONSHIP CHANGE and DIFFUSION in world time: both fire where the relationships and the real sources jump; diffusion HOLDS a window of synthetic sources only', async () => {
    const insurer = await seedEntity('Red Sea War-Risk Syndicate (B28 fixture)');
    const partners = await Promise.all(['Carrier A', 'Carrier B', 'Carrier C', 'Carrier D', 'Carrier E', 'Carrier F'].map((n) => seedEntity(`${n} (B28 fixture)`)));
    // the baseline: one relationship every few weeks (real source, IMF), the recent week: four, citing two real publishers
    await seedEdge(insurer, partners[0]!, '2023-10-02T00:00:00Z', imf);
    await seedEdge(insurer, partners[1]!, '2023-11-06T00:00:00Z', imf);
    await seedEdge(insurer, partners[2]!, '2024-01-08T00:00:00Z', imf);
    await seedEdge(insurer, partners[3]!, '2024-01-09T00:00:00Z', lloyds[0]!);
    await seedEdge(insurer, partners[4]!, '2024-01-10T00:00:00Z', imf2);
    await seedEdge(insurer, partners[5]!, '2024-01-11T00:00:00Z', lloyds[1]!);
    // an entity whose recent relationships cite SYNTHETIC reports only
    const rumour = await seedEntity('Rumoured Insurer (B28 fixture)');
    const others = await Promise.all(['X', 'Y', 'Z'].map((n) => seedEntity(`Counterparty ${n} (B28 fixture)`)));
    await seedEdge(rumour, others[0]!, '2024-01-09T00:00:00Z', reports[0]!);
    await seedEdge(rumour, others[1]!, '2024-01-10T00:00:00Z', reports[1]!);
    await seedEdge(rumour, others[2]!, '2024-01-11T00:00:00Z', reports[2]!);
    const s = (await scan(analyst2, { asOf: '2024-01-11' })).scan;
    const on = (id: string, det: string) => arr(s['detections']).find((x) => x['subject_id'] === id && x['detector'] === det)!;
    expect(on(insurer, 'relationship_change')).toMatchObject({ fired: true, held: null, measure: 1 });
    expect(on(insurer, 'diffusion')).toMatchObject({ fired: true, held: null });
    expect(on(rumour, 'diffusion')).toMatchObject({ fired: false, held: 'synthetic_only' });
    const rc = arr(s['nominated']).find((x) => x['subject_id'] === insurer && x['detector'] === 'relationship_change')!;
    const rcRow = await signalRow(String(rc['signal_id']));
    expect(obj(rcRow['observation'])).toMatchObject({ changes: 4 });
    expect(rcRow['novelty']).toBeNull(); // only the novelty detector carries a novelty measure
    const diffusionReading = (await sql<{ reading: Row }>`select reading from prediction.signal_detections where subject_id = ${insurer}::uuid and detector_key = 'diffusion'`.execute(su)).rows[0]!.reading;
    expect(obj(diffusionReading['observation'])).toMatchObject({ real_sources: 2 });
    sixEvidence('S3', { fault_trace: { held: 'synthetic_only on the rumoured insurer' }, watermark: { as_of: '2024-01-11', world_time: 'valid_from' },
      consumer_behaviour: { relationship_change: on(insurer, 'relationship_change')['measure'], diffusion: obj(diffusionReading['observation'])['real_sources'] }, operator_action: 'the second analyst runs the detectors',
      recovery: 'none needed', reconciliation: { nominated: arr(s['nominated']).length } });
  }, 120_000);

  it('S4 · THE DEMO: an analyst\'s nomination from three low-confidence SYNTHETIC reports (none counted); A. Hoffmann tests source independence and marks it MONITOR with a falsify condition; 403 the nominator, 422 without a falsify condition, repeated', async () => {
    await refused(nominate(analyst2, { title: 'Red Sea insurers withdrawing war-risk cover', statement: 'Low-confidence reports that war-risk insurers are withdrawing Red Sea cover.', evidence: [], observation: {}, baseline: {}, noveltyBasis: { basis: 'no withdrawal reported in the prior quarter' } }), /1\.\.50 items/, 422);
    await refused(nominate(analyst2, { title: 'Red Sea insurers withdrawing war-risk cover', statement: 'Low-confidence reports that war-risk insurers are withdrawing Red Sea cover.', evidence: [{ object_id: uuidv7() }],
      observation: { reports: 1 }, baseline: { reports_per_quarter: 0 }, noveltyBasis: { basis: 'no withdrawal reported in the prior quarter' } }), /^signal rejected \(evidence\): no evidence or claim/, 404);
    await refused(nominate(analyst2, { title: 'Red Sea insurers withdrawing war-risk cover', statement: 'Low-confidence reports that war-risk insurers are withdrawing Red Sea cover.', subjectKind: 'indicator', subjectId: uuidv7(),
      evidence: [{ object_id: reports[0]!.id }], observation: { reports: 1 }, baseline: { reports_per_quarter: 0 }, noveltyBasis: { basis: 'no withdrawal reported in the prior quarter' } }), /^signal rejected \(subject\)/, 404);
    const n = (await nominate(analyst2, { title: 'Red Sea insurers withdrawing war-risk cover', statement: 'Three low-confidence reports that war-risk insurers are withdrawing cover for Red Sea transits.',
      evidence: reports.map((r) => ({ object_id: r.id, version: r.version })), observation: { reports: 3, window: '2024-01-09..2024-01-10' }, baseline: { reports_per_quarter: 0 },
      noveltyBasis: { basis: 'no insurer withdrawal was reported for the corridor in the prior quarter' }, confidence: 0.3 })).signal;
    demoSignal = String(n['signal_id']);
    expect(n).toMatchObject({ maturity: 'tentative', nominator_kind: 'analyst', independent_sources: 0 });
    expect(arr(n['basis']).map((b) => b['independence'])).toEqual(['unknown', 'unknown', 'unknown']);
    // A. Hoffmann tests source independence: every pair from the records — the same (synthetic) source and publisher: dependent
    const t = (await independence(hoffmann, demoSignal)).independence;
    expect(obj(t['summary'])).toMatchObject({ independent: 0, dependent: 3, unknown: 0 });
    expect(arr(t['pairs']).every((p) => (p['reasons'] as string[]).some((r) => /synthetic evidence corroborates nothing/.test(r)))).toBe(true);
    // the nominator never disposes; monitor needs a falsify condition; the agent-only… the executive holds no workbench role
    await refused(dispose(analyst2, demoSignal, { disposition: 'monitor', note: 'watch for more reports', falsify: [{ text: 'no insurer confirms a withdrawal within 30 days', kind: 'observation' }] }), /^signal rejected: the nominator of signal .* does not dispose of it/, 403);
    await refused(dispose(hoffmann, demoSignal, { disposition: 'monitor', note: 'watching for a confirmation' }), /names what would falsify the signal/, 422);
    await refused(dispose(executive, demoSignal, { disposition: 'dismiss', note: 'not relevant to us' }), /./, 403);
    await refused(dispose(hoffmann, uuidv7(), { disposition: 'dismiss', note: 'not relevant to us' }), /no such signal/, 404);
    const falsify = [{ text: 'no insurer or broker confirms a withdrawal of Red Sea war-risk cover within 30 days', kind: 'observation', by: '2024-02-10' }];
    const m = (await dispose(hoffmann, demoSignal, { disposition: 'monitor', note: 'Low confidence, but material if confirmed; watch for an independent confirmation.', falsify })).signal;
    expect(m).toMatchObject({ disposition: 'monitor', maturity: 'tentative', version: 2, repeated: false });
    expect(arr(m['falsify_conditions'])).toHaveLength(1);
    const again = (await dispose(hoffmann, demoSignal, { disposition: 'monitor', note: 'Low confidence, but material if confirmed; watch for an independent confirmation.' })).signal;
    expect(again).toMatchObject({ repeated: true, version: 2 });
    const row = await signalRow(demoSignal);
    expect(row).toMatchObject({ disposition: 'monitor', disposition_by: hoffmann.principalId, maturity: 'tentative' });
    sixEvidence('S4', { fault_trace: { refused: ['422 no evidence', '404 unknown evidence', '404 unknown subject', '403 nominator', '422 monitor without falsify', '403 executive', '404 unknown signal'] },
      watermark: { version: row['version'] }, consumer_behaviour: { independence: t['summary'] }, operator_action: 'A. Hoffmann tests independence and marks it monitor with a falsify condition',
      recovery: 'the same disposition again is repeated', reconciliation: { maturity: row['maturity'], independent_sources: row['independent_sources'] } });
  }, 180_000);

  it('S5 · CORROBORATION and the MATURITY GATE: dependent, unknown, a refused direct change, a stale version then the retry, an independent publisher → CORROBORATED by the event naming the row; INVALID by two independent contradicting sources', async () => {
    // the demo signal: IMF is the first counted source (independent); a second IMF version is DEPENDENT on it
    const a1 = (await addEvidence(hoffmann, demoSignal, { objectId: imf.id, objectVersion: imf.version, stance: 'supporting', expectedVersion: 2 })).corroboration;
    expect(a1).toMatchObject({ maturity: 'tentative', maturity_changed: false, independent_sources: 1, version: 3 });
    expect(obj(a1['evidence'])).toMatchObject({ independence: 'independent', role: 'corroboration' });
    const a2 = (await addEvidence(hoffmann, demoSignal, { objectId: imf2.id, objectVersion: imf2.version })).corroboration;
    expect(obj(a2['evidence'])).toMatchObject({ independence: 'dependent' });
    expect((obj(a2['evidence'])['reasons'] as string[]).join(' ')).toMatch(/the same source .* the same publisher/);
    expect(a2).toMatchObject({ independent_sources: 1, maturity: 'tentative' });
    // THE GATE: no one changes the maturity but a corroborated event naming an independent row of the same version
    const gate = await refusal(sql`update prediction.signals_current set maturity = 'corroborated', version = version + 1 where signal_id = ${demoSignal}::uuid`.execute(su));
    expect(gate.message).toMatch(/^signal rejected \(maturity_gate\)/);
    expect(gate.status).toBe(409);
    const gate2 = await refusal(sql`update prediction.signals_current set disposition = 'confirm', disposition_by = ${hoffmann.principalId}::uuid, disposition_at = clock_timestamp(), maturity = 'corroborated', version = version + 1 where signal_id = ${demoSignal}::uuid`.execute(su));
    expect(gate2.message).toMatch(/a disposition never changes the maturity/);
    // a stale version, then the retry with the version read again
    await refused(addEvidence(hoffmann, demoSignal, { objectId: lloyds[0]!.id, objectVersion: lloyds[0]!.version, expectedVersion: 2 }), /^signal rejected \(stale_version\)/, 409);
    const current = Number((await signalRow(demoSignal))['version']);
    const c = (await addEvidence(hoffmann, demoSignal, { objectId: lloyds[0]!.id, objectVersion: lloyds[0]!.version, expectedVersion: current })).corroboration;
    expect(obj(c['evidence'])).toMatchObject({ independence: 'independent', data_origin: 'real', publisher: 'Lloyd\'s List Intelligence (harness double)' });
    expect(c).toMatchObject({ maturity: 'corroborated', maturity_changed: true, independent_sources: 2, threshold: 2 });
    const events = await signalEvents(demoSignal);
    const corroborated = events.find((e) => e.event === 'signal.corroborated')!;
    expect(obj(corroborated.details)).toMatchObject({ from: 'tentative', to: 'corroborated', evidence_id: obj(c['evidence'])['evidence_id'] });
    expect(corroborated.signal_version).toBe(Number(c['version']));
    const row = await signalRow(demoSignal);
    expect(row).toMatchObject({ maturity: 'corroborated', disposition: 'monitor' });
    await refused(addEvidence(hoffmann, demoSignal, { objectId: lloyds[0]!.id, objectVersion: lloyds[0]!.version }), /^signal rejected \(duplicate_evidence\)/, 409);
    // INVALID: a signal whose only basis is synthetic, contradicted by two independent real sources
    const z = (await nominate(analyst2, { title: 'All Red Sea war-risk cover withdrawn', statement: 'A synthetic report claims every war-risk insurer has withdrawn Red Sea cover.',
      evidence: [{ object_id: reports[2]!.id }], observation: { reports: 1 }, baseline: { reports_per_quarter: 0 }, noveltyBasis: { basis: 'a total withdrawal has never been reported' } })).signal;
    invalidSignal = String(z['signal_id']);
    await addEvidence(hoffmann, invalidSignal, { objectId: imf.id, objectVersion: imf.version, stance: 'contradicting' });
    const inv = (await addEvidence(hoffmann, invalidSignal, { objectId: lloyds[1]!.id, objectVersion: lloyds[1]!.version, stance: 'contradicting' })).corroboration;
    expect(inv).toMatchObject({ maturity: 'invalid', maturity_changed: true, contradicting_sources: 2, independent_sources: 0 });
    await refused(dispose(hoffmann, invalidSignal, { disposition: 'confirm', note: 'confirming the total withdrawal' }), /^signal rejected \(maturity\): .* is invalid/, 409);
    const dismissed = (await dispose(hoffmann, invalidSignal, { disposition: 'dismiss', note: 'contradicted by two independent sources' })).signal;
    expect(dismissed).toMatchObject({ disposition: 'dismiss', maturity: 'invalid' });
    sixEvidence('S5', { fault_trace: { refused: ['409 maturity gate (direct)', '409 gate with a disposition', '409 stale version', '409 duplicate', '409 confirm invalid'] },
      watermark: { versions: events.map((e) => e.signal_version) }, consumer_behaviour: { verdicts: ['independent (IMF)', 'dependent (IMF again)', 'independent (the second publisher)'] },
      operator_action: 'A. Hoffmann adds evidence', recovery: 'the stale version read again and retried', reconciliation: { maturity: row['maturity'], invalid: invalidSignal } });
  }, 180_000);

  it('S6 · the CONDITIONS: strengthen and falsify stated by a person; an unknown indicator 404, a malformed condition 422, a monitored signal keeps a falsify condition 422', async () => {
    const v = Number((await signalRow(demoSignal))['version']);
    await refused(conditions(hoffmann, demoSignal, { strengthen: [{ text: 'the corridor indicator breaches again within 30 days', kind: 'indicator', indicator_id: uuidv7() }] }), /^signal rejected \(condition\): no indicator/, 404);
    await refused(conditions(hoffmann, demoSignal, { strengthen: [{ text: 'short', kind: 'observation' }] }), /each strengthen condition|8\.\.500/, 422);
    await refused(conditions(hoffmann, demoSignal, { falsify: [] }), /keeps at least one falsify condition/, 422);
    const r = (await conditions(hoffmann, demoSignal, { strengthen: [{ text: 'the corridor indicator breaches again within 30 days', kind: 'indicator', indicator_id: w.indicatorId }], expectedVersion: v })).signal;
    expect(arr(r['strengthen_conditions'])).toHaveLength(1);
    expect(arr(r['falsify_conditions'])).toHaveLength(1);
    expect(r).toMatchObject({ version: v + 1, maturity: 'corroborated' });
    sixEvidence('S6', { fault_trace: { refused: ['404 unknown indicator', '422 malformed', '422 monitored without falsify'] }, watermark: { version: r['version'] }, consumer_behaviour: 'declared, shown, never evaluated into the maturity',
      operator_action: 'A. Hoffmann states the conditions', recovery: 'none needed', reconciliation: { strengthen: 1, falsify: 1 } });
  }, 120_000);

  it('S7 · ESCALATION submits a WARNING CANDIDATE through the intake (origin weak_signal, key signal:id:version); no warning raised here; again → repeated', async () => {
    const warningsBefore = Number((await sql<{ n: string }>`select count(*) n from prediction.warnings_current where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n);
    await refused(escalate(hoffmann, demoSignal, { note: 'corroborated by an independent publisher', consequence: 'C9' }), /C1\.\.C4/, 422);
    await refused(escalate(analyst2, demoSignal, { note: 'I nominated it and want it escalated', consequence: 'C3' }), /does not dispose of it/, 403);
    await refused(escalate(hoffmann, invalidSignal, { note: 'escalating the invalid one', consequence: 'C3' }), /^signal rejected \(maturity\): .* is invalid/, 409);
    const before = await signalRow(demoSignal);
    const e = (await escalate(hoffmann, demoSignal, { note: 'Corroborated by an independent publisher; the corridor objective is exposed.', consequence: 'C3', windowHours: 48, affected: { objectives: [w.objectiveId] } })).escalation;
    expect(e).toMatchObject({ disposition: 'escalate', repeated: false, maturity: 'corroborated' });
    const cand = obj(e['candidate']);
    expect(cand).toMatchObject({ state: 'pending', repeated: false });
    const c = (await sql<Row>`select * from prediction.warning_candidates where candidate_id = ${String(cand['candidate_id'])}::uuid`.execute(su)).rows[0]!;
    expect(c).toMatchObject({ origin_kind: 'weak_signal', origin_key: `signal:${demoSignal}:${String(before['version'])}`, consequence_class: 'C3', response_window_hours: 48, state: 'pending' });
    expect(obj(c['origin_ref'])).toMatchObject({ signal_id: demoSignal, maturity: 'corroborated', independent_sources: 2 });
    expect(arr(c['evidence']).map((x) => x['stance'])).toContain('supporting');
    expect(String(c['cause_key'])).toBe(`signal-subject:none:${demoSignal}`);
    const warningsAfter = Number((await sql<{ n: string }>`select count(*) n from prediction.warnings_current where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n);
    expect(warningsAfter).toBe(warningsBefore);
    const again = (await escalate(hoffmann, demoSignal, { note: 'Corroborated by an independent publisher; the corridor objective is exposed.', consequence: 'C3' })).escalation;
    expect(again).toMatchObject({ repeated: true });
    expect(obj(again['candidate'])['candidate_id']).toBe(cand['candidate_id']);
    const got = (await getSignal(hoffmann, demoSignal)).signal;
    expect(obj(got['candidate'])).toMatchObject({ candidate_id: cand['candidate_id'], state: 'pending' });
    expect(arr(got['events']).map((x) => x['event'])).toContain('signal.escalated');
    sixEvidence('S7', { fault_trace: { refused: ['422 class', '403 nominator', '409 invalid'] }, watermark: { origin_key: c['origin_key'] }, consumer_behaviour: 'a candidate submitted; the lifecycle part raises or clusters it',
      operator_action: 'A. Hoffmann escalates', recovery: 'again → repeated, the same candidate', reconciliation: { warnings_unchanged: warningsAfter === warningsBefore } });
  }, 120_000);

  it('S8 · THE WEAK SIGNAL AGENT: registered with this runtime\'s scan; its run nominates (agent) within max_items and ranks; its disposition REFUSED and recorded; the waiting nominated by the next run; a drifted run refused', async () => {
    const base = { kind: 'weak_signal', version: WEAK_SIGNAL_AGENT_VERSION, codeDigest: WEAK_SIGNAL_AGENT_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: hoffmann.principalId,
                   budgets: { max_reads: 20, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions: [{ kind: 'max_items', value: 1 }] };
    await refused(registerAgent({ ...base, codeDigest: 'a'.repeat(64) }), /registered with this runtime's scan/, 422);
    const agent = (await registerAgent(base)).agent;
    expect(agent).toMatchObject({ kind: 'weak_signal', role: 'weak_signal_agent' });
    const r1 = (await runAgent(agent.agentId, { task: 'signal_scan', asOf: '2023-11-25' })).run;
    expect(r1.outcome, String(r1.stopReason)).toBe('finished');
    expect(r1.outputs).toMatchObject({ nominator_kind: 'agent', max_items: 1, marked: 'agent-produced' });
    expect(arr(r1.outputs['nominated'])).toHaveLength(1);
    expect(arr(r1.outputs['waiting']).length).toBeGreaterThanOrEqual(1);
    expect(r1.refusals.map((x) => x['action'])).toEqual(['prediction.signal.dispose']);
    expect(String(r1.refusals[0]!['reason'])).toMatch(/no qualifying role binding/);
    const agentSignal = String(arr(r1.outputs['nominated'])[0]!['signal_id']);
    expect(await signalRow(agentSignal)).toMatchObject({ nominator_kind: 'agent', nominated_by: agent.principalId, nominated_run_id: r1.runId, maturity: 'tentative', disposition: null });
    const ranking = (await sql<Row>`select * from prediction.signal_rankings where run_id = ${r1.runId}::uuid`.execute(su)).rows[0]!;
    expect(ranking).toMatchObject({ ranker_kind: 'agent', ranked_by: agent.principalId });
    const ordering = arr(ranking['ordering']);
    expect(ordering[0]).toMatchObject({ signal_id: demoSignal, position: 1 });
    expect(String(ordering[0]!['explanation'])).toMatch(/^corroborated · 2 independent source\(s\)/);
    expect(ordering.some((x) => x['signal_id'] === invalidSignal)).toBe(false);
    // the next run of the same day nominates what waited (resume), and nominates nothing twice
    const r2 = (await runAgent(agent.agentId, { task: 'signal_scan', asOf: '2023-11-25' })).run;
    expect(r2.outcome).toBe('finished');
    expect(arr(r2.outputs['nominated'])).toHaveLength(1);
    expect(String(arr(r2.outputs['nominated'])[0]!['signal_id'])).not.toBe(agentSignal);
    // the analyst ranks too (the same port), and the agent never disposes: a person does
    expect((await rank(hoffmann)).ranking).toMatchObject({ ranker_kind: 'analyst' });
    const d = (await dispose(hoffmann, agentSignal, { disposition: 'confirm', note: 'the disruption is visible in the corridor transits' })).signal;
    expect(d).toMatchObject({ disposition: 'confirm', maturity: 'tentative' });
    // a DRIFTED registration: its run is refused and recorded, never run under a stale identity
    await sql`update executive.agents set code_digest = ${'b'.repeat(64)} where agent_id = ${agent.agentId}::uuid`.execute(su);
    const r3 = (await runAgent(agent.agentId, { task: 'signal_scan', asOf: '2023-11-26' })).run;
    expect(r3.outcome).toBe('refused');
    expect(String(r3.stopReason)).toMatch(/^signal scan refused \(drift\)/);
    expect((await sql<{ n: string }>`select count(*) n from prediction.signal_detections where as_of = '2023-11-26' and tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n).toBe('0');
    await sql`update executive.agents set code_digest = ${WEAK_SIGNAL_AGENT_DIGEST} where agent_id = ${agent.agentId}::uuid`.execute(su);
    sixEvidence('S8', { fault_trace: { refused: ['422 foreign digest', 'the disposition (PDP, recorded on the run)', 'the drifted run'] }, watermark: { as_of: '2023-11-25', runs: [r1.runId, r2.runId, r3.runId] },
      consumer_behaviour: { nominated: [agentSignal], waiting: arr(r1.outputs['waiting']).length }, operator_action: 'the executive triggers the agent; A. Hoffmann confirms',
      recovery: 'the second run nominates what waited', reconciliation: { ranking_top: ordering[0]!['signal_id'] } });
  }, 240_000);

  it('S9 · INDICATOR GOVERNANCE: lineage at definition; classification, expiry, cadence by a steward; an EXPIRED indicator not evaluated or scanned, renewed; a RETIRED one not evaluated or renewed; withheld above clearance', async () => {
    const g0 = await governance(hoffmann);
    const corridor = arr(g0['indicators']).find((i) => i['indicator_id'] === w.indicatorId)!;
    expect(obj(corridor['lineage'])).toMatchObject({ series_key: w.seriesKey, derived_from: 'series' });
    expect(obj(corridor['lineage'])['publisher']).toBeTruthy();
    expect(arr(corridor['events']).map((e) => e['event'])).toContain('indicator.defined');
    expect(corridor).toMatchObject({ governance_state: 'active', review_every_days: 90, classification: 'internal' });
    const fresh = (await defineIndicator('B28 governance probe: transits below 40 for five days')).indicator.indicatorId;
    await refused(govern(hoffmann, fresh, { reviewEveryDays: 30 }), /./, 403);
    await refused(govern(steward, fresh, { expiresAt: '2020-01-01T00:00:00Z' }), /an expiry is a future instant/, 422);
    await refused(govern(steward, uuidv7(), { reviewEveryDays: 30 }), /no such indicator/, 404);
    // an expiry a moment ahead on the DATABASE clock, then waited out on the same clock (never an equality at the threshold)
    const soon = (await sql<{ t: Date }>`select clock_timestamp() + interval '1500 milliseconds' t`.execute(su)).rows[0]!.t.toISOString();
    const gov = (await govern(steward, fresh, { expiresAt: soon, reviewEveryDays: 30, lineageNote: 'the corridor watch for the Q1 routing decision' })).indicator;
    expect(gov).toMatchObject({ review_every_days: 30 });
    expect(obj(gov['lineage'])).toMatchObject({ note: 'the corridor watch for the Q1 routing decision' });
    for (let i = 0; i < 40; i += 1) {
      const past = (await sql<{ p: boolean }>`select expires_at <= clock_timestamp() p from prediction.indicators_current where indicator_id = ${fresh}::uuid`.execute(su)).rows[0]!.p;
      if (past) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await refused(evaluateIndicator(fresh), /^indicator governance rejected \(expired\)/, 409);
    expect(arr((await governance(hoffmann))['indicators']).find((i) => i['indicator_id'] === fresh)).toMatchObject({ expired: true, governance_state: 'expired — not evaluated until renewed' });
    await refused(renew(steward, fresh, { expiresAt: '2020-01-01T00:00:00Z', reason: 'renewing for the Q1 review' }), /./, 422);
    const future = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const rn = (await renew(steward, fresh, { expiresAt: future, reason: 'renewing for the Q1 review' })).indicator;
    expect(rn).toMatchObject({ was_expired: true, state: 'active' });
    const ev = await evaluateIndicator(fresh);
    expect(Number(obj(ev.evaluation)['evaluated'])).toBeGreaterThan(0);
    // now EVALUATED, it expires again: the detectors do not scan it (the corridor indicator beside it is scanned)
    const soon2 = (await sql<{ t: Date }>`select clock_timestamp() + interval '1500 milliseconds' t`.execute(su)).rows[0]!.t.toISOString();
    await govern(steward, fresh, { expiresAt: soon2 });
    for (let i = 0; i < 40; i += 1) {
      const past = (await sql<{ p: boolean }>`select expires_at <= clock_timestamp() p from prediction.indicators_current where indicator_id = ${fresh}::uuid`.execute(su)).rows[0]!.p;
      if (past) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const sc = (await scan(analyst2, { asOf: '2023-11-23' })).scan;
    expect(arr(sc['detections']).some((x) => x['subject_id'] === fresh)).toBe(false);
    expect(arr(sc['detections']).some((x) => x['subject_id'] === w.indicatorId)).toBe(true);
    await renew(steward, fresh, { expiresAt: new Date(Date.now() + 120 * 86_400_000).toISOString(), reason: 'renewed before the retirement' });
    // RETIRE: named branches (none open on this one), not evaluated, not renewed, not retired twice
    const rt = (await retire(steward, fresh, note('superseded by', 'the corridor watch v2'))).indicator;
    expect(rt).toMatchObject({ state: 'retired' });
    expect(Array.isArray(rt['open_branches_watching'])).toBe(true);
    // (the evaluate route calls the port for each observation newer than the last evaluated — this one has none left, so the guard is
    // proven on an indicator retired before its first evaluation)
    const probe = (await defineIndicator('B28 retirement probe: transits below 40 for five days')).indicator.indicatorId;
    await retire(steward, probe, 'retired before its first evaluation');
    await refused(evaluateIndicator(probe), /^indicator governance rejected \(retired\)/, 409);
    await refused(renew(steward, fresh, { expiresAt: future, reason: 'renewing for the Q1 review' }), /^indicator governance rejected \(retired\)/, 409);
    await refused(retire(steward, fresh, 'retiring it a second time'), /^indicator governance rejected \(retired\)/, 409);
    const ledger = (await sql<{ event: string }>`select event from prediction.indicator_events where indicator_id = ${fresh}::uuid order by occurred_at`.execute(su)).rows.map((r) => r.event);
    expect(ledger).toEqual(['indicator.defined', 'indicator.governed', 'indicator.renewed', 'indicator.governed', 'indicator.renewed', 'indicator.retired']);
    // a RESTRICTED indicator is withheld from the analyst (their clearance in this domain is internal)
    const secret = (await defineIndicator('B28 restricted probe: transits below 40 for five days')).indicator.indicatorId;
    await govern(steward, secret, { classification: 'restricted' });
    expect(arr((await governance(hoffmann))['indicators']).find((i) => i['indicator_id'] === secret)).toMatchObject({ classification: 'restricted', withheld: expect.stringMatching(/^withheld: the indicator is classified restricted/) });
    sixEvidence('S9', { fault_trace: { refused: ['403 analyst', '422 past expiry', '404', '409 expired', '422 past renewal', '409 retired ×3'] }, watermark: { expiry_on: 'the database clock' },
      consumer_behaviour: { scanned_expired: false, ledger }, operator_action: 'the steward governs, renews and retires', recovery: 'renewed → evaluated again', reconciliation: { withheld: secret } });
  }, 600_000);

  it('S10 · NOVELTY in the attention engine: min_novelty validated; the warning carries its indicator\'s novelty reading (or its weak signal\'s); judged where a class sets it, the B22/B24 reasons untouched where it does not; no input said', async () => {
    const warningClass = (m: Row): Row => ({ materiality: { min_consequence: 'C1', min_confidence: 0.5, ...m }, route_roles: ['forecast_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' });
    await refused(publishPolicy({ classes: { 'warning.raised': warningClass({ min_novelty: 1.5 }) } }, 'a novelty floor out of range (harness)'), /materiality\.min_novelty is a number in \[0, 1\]/, 422);
    await refused(publishPolicy({ classes: { 'warning.raised': warningClass({ require: ['novelty'] }) } }, 'novelty is not requirable (harness)'), /require lists dimensions among/, 422);
    // the corridor warning: its indicator's LATEST reading by event time is S3's (as of 2024-01-11), HELD for a source gap (the series stops
    // on 2023-12-31) — a held reading is no input (S2 showed the number it carried while the 2023-11-24 reading was the latest)
    const dw = await dimensionsOf('warning.raised', warningId);
    expect(dw['novelty']).toBeNull();
    expect(String(obj(dw['dimension_basis'])['novelty'])).toMatch(/^no input: the latest novelty reading of the warning's indicator \(as of 2024-01-11\) is held — source_gap$/);
    // another class: no input, declared
    const df = await dimensionsOf('forecast.unfit', w.forecastId);
    expect(df['novelty']).toBeNull();
    expect(obj(df['dimension_basis'])['novelty']).toBe('no input: no novelty detector reads a forecast.unfit');
    // THE ENGINE: judged where set, "no input, not judged" where the signal has none, nothing added where the class sets none
    const rules = { classes: { 'warning.raised': warningClass({ min_novelty: 0.9 }) } };
    const judged = await evaluate(rules, 'warning.raised', { consequence: 'C2', confidence: 0.8, novelty: 1 });
    expect((judged['reasons'] as string[]).at(-1)).toBe('novelty 1 at or above 0.9');
    expect(judged['outcome']).toBe('material');
    const low = await evaluate(rules, 'warning.raised', { consequence: 'C2', confidence: 0.8, novelty: 0.4 });
    expect(low).toMatchObject({ outcome: 'below_threshold' });
    expect((low['reasons'] as string[]).at(-1)).toBe('novelty 0.4 below the threshold 0.9');
    const none = await evaluate(rules, 'warning.raised', { consequence: 'C2', confidence: 0.8 });
    expect(none['outcome']).toBe('material');
    expect((none['reasons'] as string[]).at(-1)).toBe('novelty: no input, not judged');
    const unset = await evaluate({ classes: { 'warning.raised': warningClass({}) } }, 'warning.raised', { consequence: 'C2', confidence: 0.8, novelty: 1 });
    expect(unset['reasons']).toEqual(['consequence C2 at or above C1', 'confidence 0.8 at or above 0.5']);
    // A WARNING FROM A WEAK SIGNAL (the lifecycle part §W writes origin_kind/origin_ref when it raises from a candidate; PLANTED here — the
    // warning's own origin columns, 0088 §0): the signal's own novelty is carried
    await sql`update prediction.warnings_current set origin_kind = 'weak_signal', origin_ref = ${JSON.stringify({ signal_id: detectorSignal, version: 1 })}::jsonb where warning_id = ${warningId}::uuid`.execute(su);
    const ds = await dimensionsOf('warning.raised', warningId);
    expect(obj(obj(ds['dimension_basis'])['novelty'])).toMatchObject({ source: 'the weak signal the warning was escalated from', signal_id: detectorSignal, detector: 'novelty' });
    expect(Number(ds['novelty'])).toBe(Number((await signalRow(detectorSignal))['novelty']));
    // THROUGH THE REAL CONSUMER: the policy sets min_novelty; the routed item carries the novelty and the engine's reason
    const p = (await publishPolicy(rules, 'B28: the novelty floor on warnings (harness)')).policy;
    expect(Number(p['version'])).toBeGreaterThanOrEqual(1);
    const routed = await applyAttention({ event_id: uuidv7(), event_type: 'EarlyWarningRaised', payload: { warning_id: warningId } }, `warning:${warningId}`);
    expect(routed.effect).toBe('attention.routed');
    const item = (await sql<{ evaluation: Row }>`select evaluation from executive.attention_items where subject_id = ${warningId}::uuid and signal_class = 'warning.raised' order by created_at desc limit 1`.execute(su)).rows[0]!;
    expect(Number(obj(item.evaluation['dimensions'])['novelty'])).toBeGreaterThanOrEqual(0.95);
    expect((item.evaluation['reasons'] as string[]).at(-1)).toMatch(/^novelty 1(\.0+)? at or above 0\.9$/);
    await sql`update prediction.warnings_current set origin_kind = 'indicator_breach', origin_ref = '{}'::jsonb where warning_id = ${warningId}::uuid`.execute(su);
    sixEvidence('S10', { fault_trace: { refused: ['422 min_novelty 1.5', '422 require novelty'] }, watermark: { novelty: dw['novelty'], basis: obj(dw['dimension_basis'])['novelty'] },
      consumer_behaviour: { item_reasons: item.evaluation['reasons'] }, operator_action: 'the executive publishes the novelty floor', recovery: 'none needed',
      reconciliation: { judged: judged['reasons'], none: none['reasons'] } });
  }, 180_000);
});
