/**
 * CP-6 B28 (migration 0088 §S, part `streams`) — F-P4-11: EVENT-TIME STREAM PROCESSING AND COMPLEX EVENT RULES (DP-31-001/-002/-003/-005/-006).
 * On a real database with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top,
 * the B6 rule), the REAL stream form of Acquire (0084 §B) over the committed SYNTHETIC late set
 * `fixtures/phase1/replay/red-sea-corridor-stream-late` (DEF-L1..L7, labelled), the stream-rules consumer registered in the harness's own
 * domain, the attention tick driven through its test hook, and B28's own humans with sessions of their own (the ports compare the acting
 * principal).
 *
 *   S1 · RULES: define (a draft), the PDP (403), the route's and the port's validation (422), an unknown series (404), an open draft and an
 *        unchanged definition (409), activation (a reason; not a draft twice, 409).
 *   S2 · PROCESSORS: start (403 for an analyst; 404 no rule; 409 a draft rule; 409 a second live processor), the start checkpoint.
 *   S3 · THE LATE STREAM: eight segments of the late set arrive through the subscription; every input stored and LABELLED (on time, late within
 *        the allowance, beyond it; new, duplicate, revision) and none dropped; the windows fire on EVENT time; the late page's window REVISED
 *        and labelled late_window with how late; the publisher gap's window PARTIAL over the explicit incomplete range; a window with no
 *        observation fired as the gap it is; the duplicate row emits nothing (output.duplicate_suppressed); the row beyond the allowance
 *        excluded from a closed window and counted; the framed rows COVERED by their page; every read in custody. The DIFFERENTIAL CHECK:
 *        the arrivals replayed through the pure rules (stream-windows.ts `simulate`) give exactly the signals and labels the database emitted.
 *   S4 · AT-LEAST-ONCE: a subscription replay re-delivers every event — repeated, audited no-ops, no input, no signal, no candidate twice
 *        (each holding window's candidate submitted ONCE); the port refuses a different value under a held key (409), an unknown processor
 *        (404), a malformed row (422).
 *   S5 · RULE VERSIONING: version 2 activated → version 1 superseded and its processor retired (outputs no longer current); the consumer
 *        resolves nothing for it; the port refuses it (409); a superseded rule starts nothing (409).
 *   R1 · STALL → RECOVER: the tick's stream-sweep step finds the quiet processor STALLED (outputs suspended, no signal current); a running
 *        processor is not recovered (409); an analyst may not (403); the forecast owner recovers from the newest compatible checkpoint — the
 *        replay's recomputed windows equal their standing signals: every one SUPPRESSED, nothing emitted twice.
 *   R2 · CORRUPT STATE → RECOVER: a window row TAMPERED (the superuser, stated) → the sweep's verification finds the digest mismatch → CORRUPT,
 *        the signals after the last good checkpoint RETRACTED; two FORGED newer checkpoints (a snapshot that does not verify; a foreign rule
 *        digest — planted, stated) are skipped with their reasons; recovery restores the compatible one and re-derives exactly what was
 *        retracted (label recovered); a holding re-derived signal is OWED (the recovery's action is not one the intake admits).
 *   R3 · OFFSETS DIVERGENCE: the subscription paused, the last page streamed — the reconciliation names the gap (stream, seq, range) and
 *        SUSPENDS the outputs; resumed, the page is ingested into the suspended processors (stored, nothing emitted); reconciled; recovered
 *        (the replay fires the new window, labelled recovered); the owed candidate submitted by the consumer's next item, once.
 *   R4 · RETRACTION by a person (403 / 404 / 409 twice / 409 a retraction / 422), the page's reads (list, get, 404).
 *   L1 · A BOUNDED LOAD RUN (DP-31-006 names load tests; this is NOT a production load test): two years of daily points in 146 arrival
 *        batches, a tenth of them out of order, through the port on one processor (a FIXTURE path under the consumer's action — stated);
 *        the elapsed time recorded, the state digest verified, and the model agreeing with every emission.
 *
 * EACH CASE LOGS ONE `B28 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DAY_MS, simulate, type RuleGeometry, type SimInput } from '../../src/prediction/streams/stream-windows.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { fixtureContract, inCommitContext } from './phase1-helpers.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// The committed replay sets (the late set is fixtures/phase1/replay/red-sea-corridor-stream-late), by absolute path.
process.env['EYE_CONNECTOR_REPLAY_ROOT'] = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'phase1', 'replay');
// C5 / Nit 8: this file's own vault roots.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b28-streams-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const LATE_SET = 'red-sea-corridor-stream-late';
const LATE_BASE = 'https://corridor-stream-late.synthetic.example/red-sea/chokepoint4';
const SERIES = 'corridor-transits-b28';
/** The corridor rule's geometry (the unit test's CORRIDOR): five-day tumbling windows from 2024-02-01, lag one day, ten days' allowance, ≥ 3 days < 30. */
const GEOMETRY: RuleGeometry = { windowKind: 'tumbling', windowDays: 5, slideDays: 5, windowOrigin: '2024-02-01', allowedLatenessMs: 10 * DAY_MS, watermarkLagMs: DAY_MS,
                                 predicate: { comparator: 'lt', threshold: 30, min_hits: 3 } };
const RULE = (over: Row = {}): Row => ({
  ruleKey: 'corridor-collapse', title: 'Bab el-Mandeb corridor collapse (B28 harness)', seriesKey: SERIES, windowKind: 'tumbling', windowDays: 5, windowOrigin: '2024-02-01',
  allowedLatenessHours: 240, watermarkLagHours: 24, stallAfterSeconds: 3, predicate: { comparator: 'lt', threshold: 30, min_hits: 3 }, consequenceClass: 'C3',
  responseWindowHours: 48, checkpointEvery: 3, ...over,
});

let h: Phase4Harness; let su: AnyDb;
let prediction: PredictionController; let graph: GraphController; let observation: ObservationController; let exec: ExecutiveController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let timer: AttentionTimerService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId; const S = () => h.fx.sourceId;
/** What the cases leave one another (each named where it is made). */
let sourceKey = ''; let PK = ''; let replayVersion = 0; let subscriptionId = ''; let agentId = ''; let streamId = '';
let ruleP = ''; let ruleQ = ''; let ruleV1 = ''; let P = ''; let Q = ''; let V1 = '';
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await (q as ReturnType<typeof sql<Row>>).execute(su)).rows as Row[];
const ts = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString().slice(0, 10);
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await sleep(300);
  }
}
const settle = async (ms = 120_000): Promise<void> => {
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
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  // eslint-disable-next-line no-console
  console.log(`B28 EVIDENCE streams ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (in process) ───────────── */
const defineRule = (as: AuthenticatedPrincipal, payload: Row) => prediction.defineStreamRule(h.req(as, 'prediction.stream.rule.define', 'SPR', null), T(), D(), { payload }) as Promise<{ rule: Row }>;
const activateRule = (as: AuthenticatedPrincipal, ruleId: string, reason: string) => prediction.activateStreamRule(h.req(as, 'prediction.stream.rule.activate', 'SPR', ruleId), T(), D(), { payload: { ruleId, reason } }) as Promise<{ rule: Row }>;
const startProcessor = (as: AuthenticatedPrincipal, ruleId: string) => prediction.startStreamProcessor(h.req(as, 'prediction.stream.processor.start', 'SPR', null), T(), D(), { payload: { ruleId } }) as Promise<{ processor: Row }>;
const listProcessors = (as = forecastOwner) => prediction.listStreamProcessors(h.req(as, 'prediction.read', 'SPR', null), T(), D()) as Promise<{ processors: Row[]; rules: Row[] }>;
type Detail = { processor: Row; rule: Row; windows: Row[]; signals: Row[]; checkpoints: Row[]; events: Row[]; inputs: Row[]; candidates: Row[] };
const getProcessor = async (id: string, as = forecastOwner) => (await prediction.getStreamProcessor(h.req(as, 'prediction.read', 'SPR', id), T(), D(), id) as { stream: Detail }).stream;
const recover = (as: AuthenticatedPrincipal, id: string, reason: string) => prediction.recoverStreamProcessor(h.req(as, 'prediction.stream.processor.recover', 'SPR', id), T(), D(), id, { payload: { reason } }) as Promise<{ recovery: Row }>;
const reconcile = (as: AuthenticatedPrincipal, id: string) => prediction.reconcileStreamProcessor(h.req(as, 'prediction.stream.processor.reconcile', 'SPR', id), T(), D(), id) as Promise<{ reconciliation: Row }>;
const retract = (as: AuthenticatedPrincipal, signalId: string, reason: string) => prediction.retractStreamSignal(h.req(as, 'prediction.stream.signal.retract', 'SPR', signalId), T(), D(), signalId, { payload: { reason } }) as Promise<{ retraction: Row }>;
const openStream = (payload: Row) => observation.openStream(h.req(h.manager, 'observation.stream.open', 'AQS', null, 'observation'), T(), D(), S(), { payload } as never) as Promise<{ stream: Row; run: Row }>;
const resumeStream = (id: string, payload: Row) => observation.resumeStream(h.req(h.manager, 'observation.stream.resume', 'AQS', id, 'observation'), T(), D(), id, { payload } as never) as Promise<{ stream: Row; run: Row }>;
const subscriptionControl = (to: 'pause' | 'resume', reason: string) => (to === 'pause' ? graph.pauseSubscription : graph.resumeSubscription).call(graph,
  h.req(dadmin, 'graph.subscription.control', 'SUB', subscriptionId, 'platform.administration'), T(), D(), subscriptionId, { payload: { reason } });
const replaySubscription = (fromSeq: number, reason: string) => graph.replaySubscription(h.req(dadmin, 'graph.subscription.replay', 'SUB', subscriptionId, 'platform.administration'), T(), D(), subscriptionId,
  { payload: { fromSeq, reason } }) as unknown as Promise<{ replayed: number; events: string[] }>;
let slot = 0;
const tick = () => timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2033, 0, 1) + (slot++) * 60_000) });
/** The port itself, under the consumer's action, as a named human (a FIXTURE path: the consumer cannot produce a value conflict by construction). */
const portIngest = (as: AuthenticatedPrincipal, a: { processor: string; evd: string; version: number; rows: unknown; unreadable?: string | null }) =>
  inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: as.sessionId as string, contextKey: as.contextKey as string }, { tenantId: T(), domainId: D() }, 'prediction.stream.subscription.apply', uuidv7(),
    async (tx) => (await sql<{ r: Row }>`select prediction.ingest_stream_input(${a.processor}::uuid, ${T()}::uuid, ${D()}::uuid, ${a.evd}::uuid, ${a.version}::int, false, null::uuid, null,
      ${JSON.stringify(a.rows)}::jsonb, ${a.unreadable ?? null}, null::uuid, ${as.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never)).rows[0]!.r);

/* ───────────── the rows ───────────── */
const inputsOf = async (processor: string) => rows(sql`select input_seq::int, event_key, evd_object_id::text, evd_version, to_char(event_time at time zone 'UTC', 'YYYY-MM-DD') as day, value::float8 as value,
  lateness, lateness_by::text, disposition, prior_value::float8 prior_value from prediction.stream_inputs where processor_id = ${processor}::uuid order by input_seq`);
const signalsOf = async (processor: string) => rows(sql`select signal_id::text, signal_seq::int, to_char(window_start at time zone 'UTC', 'YYYY-MM-DD') as ws, revision, emission, label, holds, completeness,
  (value ->> 'n')::int n, (value ->> 'hits')::int hits, lateness, retracts::text, retraction_kind, reason, incomplete_range_ids from prediction.stream_signals where processor_id = ${processor}::uuid order by signal_seq`);
const windowsOf = async (processor: string) => rows(sql`select to_char(window_start at time zone 'UTC', 'YYYY-MM-DD') as ws, status, completeness, holds, late_inputs, late_excluded, revision,
  (value ->> 'n')::int n, incomplete_range_ids from prediction.stream_windows where processor_id = ${processor}::uuid order by window_start`);
const eventsOf = async (processor: string, event?: string) => rows(sql`select event, details, actor::text from prediction.stream_processor_events where processor_id = ${processor}::uuid
  and (${event ?? null}::text is null or event = ${event ?? null}) order by ledger_seq`);
const candidatesOf = async (processor: string) => rows(sql`select candidate_id::text, origin_key, state, title, cause_key, consequence_class, confidence::float8 confidence, evidence
  from prediction.warning_candidates where origin_kind = 'stream_rule' and origin_key like ${`${processor}:%`} order by submitted_at`);
const processorRow = async (processor: string) => (await rows(sql`select state, state_reason, watermark, max_event_time, state_digest, input_seq::int, last_checkpoint_id::text,
  prediction.stream_state_digest(processor_id) as found_digest from prediction.stream_processors where processor_id = ${processor}::uuid`))[0]!;
const checkpointsOf = async (processor: string) => rows(sql`select checkpoint_id::text, checkpoint_seq::int, reason, input_seq::int, signal_hw::int, state_digest, rule_digest,
  topology_version from prediction.stream_checkpoints where processor_id = ${processor}::uuid order by checkpoint_seq`);
const deliveriesOf = async () => rows(sql`select d.event_id::text, d.state, d.items, d.items_applied, d.items_unresolved from graph.subscription_deliveries d
  where d.subscription_id = ${subscriptionId}::uuid order by d.event_id`);
/** The arrival batches of a processor as the ledger recorded them (evidence.ingested rows that recorded inputs), for the differential check. */
async function batchesOf(processor: string): Promise<SimInput[][]> {
  const ins = await inputsOf(processor);
  const evs = (await eventsOf(processor, 'evidence.ingested')).map((e) => obj(e['details'])).filter((d) => d['batch_to_seq'] !== null && d['batch_to_seq'] !== undefined);
  return evs.map((d) => ins.filter((i) => Number(i['input_seq']) >= Number(d['batch_from_seq']) && Number(i['input_seq']) <= Number(d['batch_to_seq']))
    .map((i) => ({ key: String(i['event_key']), day: String(i['day']), value: Number(i['value']) })));
}

/** The replay contract version that reads the SYNTHETIC late set, through the real register route and the two operators (the B23 idiom). */
async function newLateStreamVersion(): Promise<number> {
  const version = h.version + 1;
  const c = fixtureContract(sourceKey) as Row;
  const so = c['security_and_operations'] as Row;
  const contract = {
    ...c, data_origin: 'synthetic',
    identity: { ...(c['identity'] as Row), endpoints: [LATE_BASE] },
    security_and_operations: {
      ...so, replay_set: LATE_SET,
      expected_schema: { ...(so['expected_schema'] as Row), required_fields: ['features.[].attributes.date', 'features.[].attributes.n_total'] },
    },
    lifecycle: { contract_version: version, effective_from: '2026-09-05T00:00:00Z', supersedes_version: h.version },
  };
  await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', S(), 'observation'), T(), D(), { payload: { contract, sourceId: S() } });
  await h.pipeline.write(
    h.env(h.manager, 'observation.source.approve', 'SRC', S()), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.approve', objectType: 'SRC', objectId: S() },
    ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: S(), contractVersion: version, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B28 streams suite', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: S(), targetVersion: String(version), outboxEvent: null };
    });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  return version;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  prediction = h.app.get(Pc); graph = h.app.get(Gc); observation = h.app.get(Oc); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); timer = h.app.get(AttentionTimerService);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b28s-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b28s-domain-admin');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b28s-forecast-owner');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b28s-strategy-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b28s-analyst');
  executive = await h.humanWithSession(['executive'], 'b28s-executive');
  sourceKey = String((await rows(sql`select source_key from observation.source_contracts_current where source_id = ${S()}::uuid limit 1`))[0]?.['source_key']);
  PK = `${sourceKey}:chokepoint4`;
  replayVersion = await newLateStreamVersion();
  // THE SERIES the rules read: the late set's daily transits (the PortWatch framing: n_total of portid chokepoint4) — synthetic, labelled.
  await prediction.registerSeries(h.req(forecastOwner, 'prediction.series.register', 'SER', null), T(), D(), { payload: {
    seriesKey: SERIES, sourceKey, parserRef: 'arcgis-feature-attribute@1', valueField: 'n_total', selector: 'chokepoint4', unit: 'transits/day', seasonalityDays: 7,
    attribution: 'SYNTHETIC stream fixture — not PortWatch figures.', description: 'Bab el-Mandeb daily transits, the SYNTHETIC late / out-of-order set (B28 harness)' } });
  // THE ATTENTION TICK's host: an attention agent (the timer pointed at it, then unscheduled — the harness ticks through the hook only).
  await exec.publishAttentionPolicy(h.req(executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules: { classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.6 }, route_roles: ['strategy_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 1,
                        suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' } } }, reason: 'the attention tick of the B28 streams harness' } as never });
  const agent = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = agent.agent.agentId;
  await scheduler.unscheduleAttentionTick(T(), D());
}, 300_000);

afterAll(async () => {
  try { await exec.revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the harness is done (B28 streams)' } }); } catch { /* already revoked */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B28 · F-P4-11 — event-time stream processing and complex event rules (0088 §S)', () => {
  it('S1 · RULES: a versioned definition — the PDP, the validation, the absent series, the open draft, the unchanged definition, the activation', async () => {
    await refused(defineRule(analyst, RULE({ ownerPrincipalId: forecastOwner.principalId })), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: forecastOwner.principalId, predicate: { comparator: 'lt', threshold: 30, min_hits: 9 } })), /predicate is/, 422, 'EYE-REQ-001');
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: forecastOwner.principalId, windowKind: 'tumbling', slideDays: 2 })), /tumbling window slides by its own length/, 422);
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: forecastOwner.principalId, seriesKey: 'no-such-series' })), /no series no-such-series is registered/, 404, 'EYE-STA-001');
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: uuidv7() })), /is not an active named human/, 422, 'EYE-REQ-001');
    const p = (await defineRule(forecastOwner, RULE({ ownerPrincipalId: strategyOwner.principalId }))).rule;
    ruleP = String(p['rule_id']);
    expect(p).toMatchObject({ rule_key: 'corridor-collapse', version: 1, state: 'draft', series_key: SERIES, source_key: sourceKey, partition: 'chokepoint4', window_days: 5, slide_days: 5, checkpoint_every: 3 });
    expect(p['rule_digest']).toMatch(/^[0-9a-f]{64}$/);
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: strategyOwner.principalId, title: 'another title, the same key' })), /\(unchanged\)|\(open_draft\)/, 409, 'EYE-STA-002');
    await refused(activateRule(forecastOwner, ruleP, 'short'), /reason of at least 8 characters/, 422);
    await refused(activateRule(analyst, ruleP, 'the analyst may not activate a rule'), /no qualifying role binding/, 403);
    const active = (await activateRule(forecastOwner, ruleP, 'the corridor collapse is watched on event time (B28 harness)')).rule;
    expect(active).toMatchObject({ state: 'active', version: 1, superseded: null });
    await refused(activateRule(forecastOwner, ruleP, 'activating it twice is refused'), /\(not_draft\)/, 409, 'EYE-STA-002');
    await refused(defineRule(forecastOwner, RULE({ ownerPrincipalId: strategyOwner.principalId })), /\(unchanged\): version 1 of corridor-collapse \(active\)/, 409, 'EYE-STA-002');
    // Q: the same watch under its own key (the corruption scenario's processor); a stall threshold of an hour.
    ruleQ = String((await defineRule(strategyOwner, RULE({ ruleKey: 'corridor-collapse-q', title: 'Corridor collapse — the recovery twin (B28 harness)', stallAfterSeconds: 3600, ownerPrincipalId: strategyOwner.principalId }))).rule['rule_id']);
    await activateRule(strategyOwner, ruleQ, 'the recovery twin of the corridor watch (B28 harness)');
    // V: the versioning scenario's rule, version 1.
    ruleV1 = String((await defineRule(forecastOwner, RULE({ ruleKey: 'corridor-versioned', title: 'Corridor watch, versioned (B28 harness)', stallAfterSeconds: 3600, ownerPrincipalId: forecastOwner.principalId }))).rule['rule_id']);
    const ledger = await rows(sql`select event from prediction.stream_processor_events where rule_id = ${ruleP}::uuid order by ledger_seq`);
    expect(ledger.map((e) => e['event'])).toEqual(['rule.defined', 'rule.activated']);
    sixEvidence('S1', {
      fault_trace: { refused: ['403 analyst', '422 min_hits', '422 slide', '404 series', '422 owner', '409 unchanged', '409 not_draft'] },
      watermark: null, consumer_behaviour: null,
      operator_action: { defined: { rule_id: ruleP, digest: p['rule_digest'] }, activated: active['activated_at'], q: ruleQ, v1: ruleV1 },
      recovery: null, reconciliation: { ledger: ledger.map((e) => e['event']) },
    });
  }, 120_000);

  it('S2 · PROCESSORS: start (the PDP, the absent rule, the draft rule, one live per rule), the baseline and the start checkpoint', async () => {
    await refused(startProcessor(analyst, ruleP), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(startProcessor(forecastOwner, uuidv7()), /\(no_rule\)/, 404, 'EYE-STA-001');
    await refused(startProcessor(forecastOwner, ruleV1), /\(rule_not_active\)/, 409, 'EYE-STA-002');
    const p = (await startProcessor(forecastOwner, ruleP)).processor;
    P = String(p['processor_id']);
    expect(p).toMatchObject({ state: 'running', source_id: S(), partition_key: PK, topology_version: 'stream-topology@1.0.0', watermark: null, inputs: 0 });
    expect(String(p['processor_identity'])).toBe(`corridor-collapse@v1/chokepoint4#${P}`);
    await refused(startProcessor(forecastOwner, ruleP), /\(already_running\)/, 409, 'EYE-STA-002');
    Q = String((await startProcessor(strategyOwner, ruleQ)).processor['processor_id']);
    await activateRule(forecastOwner, ruleV1, 'the versioned corridor watch, version 1 (B28 harness)');
    V1 = String((await startProcessor(forecastOwner, ruleV1)).processor['processor_id']);
    const cps = await checkpointsOf(P);
    expect(cps).toEqual([expect.objectContaining({ reason: 'start', input_seq: 0, signal_hw: 0, topology_version: 'stream-topology@1.0.0' })]);
    sixEvidence('S2', {
      fault_trace: { refused: ['403 analyst', '404 no_rule', '409 rule_not_active', '409 already_running'] },
      watermark: { P: null }, consumer_behaviour: null, operator_action: { started: [P, Q, V1] }, recovery: { start_checkpoint: cps[0] }, reconciliation: { baseline: p['baseline'] },
    });
  }, 120_000);

  it('S3 · THE LATE STREAM: every input stored and labelled, windows on EVENT time, the late window labelled, the gap partial, the duplicate silent, the model agrees', async () => {
    await settle();
    const reg = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
      { payload: { consumerKind: 'stream-rules', ownerPrincipalId: forecastOwner.principalId, backlog: 'leave' } as never }) as { subscription: { subscriptionId: string; principalId: string } };
    subscriptionId = reg.subscription.subscriptionId;
    const sub = (await rows(sql`select consumer_kind, event_types, code_digest from graph.subscriptions where subscription_id = ${subscriptionId}::uuid`))[0]!;
    expect(sub['consumer_kind']).toBe('stream-rules');
    // THE STREAM: the late set's first eight pages (A, B ahead, C late, D the gap, E, F with the duplicate, G with the revision and the row beyond, A again).
    const opened = await openStream({ contractVersion: replayVersion, partitionKey: PK, credit: 2, range: { from: '2024-02-01', to: '2024-03-11' }, maxSegments: 8 });
    streamId = String(opened.stream['stream_id']);
    expect(opened.run).toMatchObject({ state: 'finished', segments: 8 });
    expect(opened.stream).toMatchObject({ state: 'open', next_seq: 8 });
    const gap = (await rows(sql`select range_id::text, range_from, range_to, reason_class from observation.acquisition_incomplete_ranges where stream_id = ${streamId}::uuid`));
    expect(gap).toEqual([expect.objectContaining({ range_from: '2024-02-16', range_to: '2024-02-21', reason_class: 'publisher_gap' })]);
    const redelivered = (await rows(sql`select seq, admitted, noop from observation.acquisition_segments where stream_id = ${streamId}::uuid and seq = 7`))[0]!;
    expect(redelivered).toMatchObject({ admitted: 0, noop: 6 });   // DEF-L7: the page served again admits nothing twice
    await settle();
    const ds = await waitFor('every stream-rules delivery applied', deliveriesOf, (d) => d.length >= 38 && d.every((x) => x['state'] === 'applied'));

    /* EVERY INPUT STORED AND LABELLED: 32 parent rows (6 pages), the 32 framed rows COVERED by their page, none dropped. */
    const ins = await inputsOf(P);
    expect(ins).toHaveLength(32);
    const byKey = (day: string, n = 0) => ins.filter((i) => i['day'] === day)[n]!;
    expect(byKey('2024-02-11')).toMatchObject({ lateness: 'on_time', disposition: 'new' });                               // DEF-L1: ahead, on time
    expect(byKey('2024-02-06')).toMatchObject({ lateness: 'late_within_allowance', disposition: 'new', lateness_by: '8 days' }); // DEF-L2
    expect(byKey('2024-02-13', 1)).toMatchObject({ lateness: 'late_within_allowance', disposition: 'duplicate' });          // DEF-L4
    expect(byKey('2024-02-23', 1)).toMatchObject({ lateness: 'late_within_allowance', disposition: 'revision', value: 28, prior_value: 35 }); // DEF-L5
    expect(byKey('2024-02-02', 1)).toMatchObject({ lateness: 'late_beyond_allowance', disposition: 'revision', value: 19, prior_value: 41, lateness_by: '26 days' }); // DEF-L6
    const ingested = await eventsOf(P, 'evidence.ingested');
    expect(ingested).toHaveLength(38);
    expect(ingested.reduce((n, e) => n + Number(obj(e['details'])['covered']), 0)).toBe(32);
    expect(ingested.filter((e) => obj(e['details'])['is_fragment'] === true)).toHaveLength(32);

    /* THE SIGNALS: on event time, labelled — and exactly what the pure rules say for the same arrivals (the differential check). */
    const sig = await signalsOf(P);
    const model = simulate(GEOMETRY, await batchesOf(P), [{ from: '2024-02-16', to: '2024-02-21' }]);
    expect(sig.map((s) => [s['ws'], s['emission'], s['revision'], s['label'], s['n'], s['hits'], s['holds']]))
      .toEqual(model.emissions.map((e) => [e.windowStart, e.emission, e.revision, e.label, e.n, e.hits, e.holds]));
    expect(sig.map((s) => [s['ws'], s['emission'], s['label'], s['holds']])).toEqual([
      ['2024-02-01', 'fired', 'on_time', false], ['2024-02-06', 'fired', 'partial_window', null], ['2024-02-06', 'revised', 'late_window', true],
      ['2024-02-11', 'fired', 'on_time', true], ['2024-02-16', 'fired', 'partial_window', null], ['2024-02-21', 'fired', 'on_time', false],
      ['2024-02-21', 'revised', 'late_window', false], ['2024-02-26', 'fired', 'on_time', true],
    ]);
    expect(model.inputs.map((i) => [i.key, i.lateness, i.disposition])).toEqual(ins.map((i) => [i['event_key'], i['lateness'], i['disposition']]));
    const lateWindow = sig[2]!;
    expect(obj(lateWindow['lateness'])).toMatchObject({ late_inputs: 5, max_lateness: '8 days' });
    expect(lateWindow['completeness']).toBe('late_revised');
    const partial = sig[4]!;
    expect(partial['completeness']).toBe('partial_incomplete_range');
    expect(partial['incomplete_range_ids']).toEqual([gap[0]!['range_id']]);
    /* THE WINDOWS: the late row excluded from the closed window and counted; the open window shown. */
    const ws = await windowsOf(P);
    expect(ws.find((w) => w['ws'] === '2024-02-01')).toMatchObject({ status: 'closed', completeness: 'late_excluded', late_excluded: 1 });
    expect(ws.find((w) => w['ws'] === '2024-02-16')).toMatchObject({ status: 'closed', completeness: 'partial_incomplete_range' });
    expect(ws.find((w) => w['ws'] === '2024-03-02')).toMatchObject({ status: 'open', n: 4 });
    const pr = await processorRow(P);
    expect(ts(pr['watermark'])).toBe('2024-03-04');
    expect(pr['found_digest']).toBe(pr['state_digest']);
    /* THE DUPLICATE ROW emits nothing: its window recomputed equal to its standing signal. */
    const suppressed = await eventsOf(P, 'output.duplicate_suppressed');
    expect(suppressed.map((e) => obj(e['details'])['window_start'])).toContain('2024-02-11T00:00:00Z');
    /* THE CANDIDATES: one per holding emission, through the intake — the late window's among them, labelled. */
    const cands = await candidatesOf(P);
    expect(cands.map((c) => c['origin_key'])).toEqual([`${P}:2024-02-06T00:00:00Z:1`, `${P}:2024-02-11T00:00:00Z:0`, `${P}:2024-02-26T00:00:00Z:0`]);
    expect(cands[0]).toMatchObject({ state: 'pending', consequence_class: 'C3', cause_key: 'stream:corridor-collapse:chokepoint4:2024-02-06T00:00:00Z' });
    expect(String(cands[0]!['title'])).toMatch(/\(LATE window\)$/);
    expect((cands[1]!['evidence'] as Row[]).every((e) => e['stance'] === 'supporting')).toBe(true);
    /* EVERY READ IN CUSTODY, under the stream's own port. */
    const custody = await rows(sql`select count(*)::int n from observation.custody_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid
      and event = 'custody.retrieved' and details ->> 'read_for' = 'prediction.stream' and details ->> 'processor_id' = ${P}`);
    expect(custody[0]!['n']).toBe(38);
    // Q saw the same arrivals and emitted the same signals under its own identity; V1 too.
    expect((await signalsOf(Q)).map((s) => [s['ws'], s['emission'], s['label']])).toEqual(sig.map((s) => [s['ws'], s['emission'], s['label']]));
    expect(ds.every((d) => (d['items'] as string[]).length === 3)).toBe(true);
    sixEvidence('S3', {
      fault_trace: { planted: ['DEF-L1 out of order', 'DEF-L2 late page', 'DEF-L3 publisher gap', 'DEF-L4 duplicate row', 'DEF-L5 revised value', 'DEF-L6 beyond allowance', 'DEF-L7 redelivered page'] },
      watermark: { P: pr['watermark'], max_event_time: pr['max_event_time'] },
      consumer_behaviour: { deliveries: ds.length, inputs: ins.length, covered: 32, labels: ins.reduce<Row>((a, i) => ({ ...a, [String(i['lateness'])]: Number(a[String(i['lateness'])] ?? 0) + 1 }), {}) },
      operator_action: { stream: streamId, segments: 8 },
      recovery: { suppressed: suppressed.length },
      reconciliation: { signals: sig.length, model_emissions: model.emissions.length, candidates: cands.length, custody: custody[0]!['n'] },
    });
  }, 300_000);

  it('S4 · AT-LEAST-ONCE: a replay re-delivers every event — repeated no-ops, no candidate twice; the port refuses a changed value, an unknown processor, a malformed row', async () => {
    const before = { inputs: (await inputsOf(P)).length, signals: (await signalsOf(P)).length, candidates: (await candidatesOf(P)).length };
    const first = (await rows(sql`select min(partition_seq)::int s from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type = 'ObservationRecorded'
      and payload ->> 'source_id' = ${S()} and created_at >= (select opened_at from observation.acquisition_streams where stream_id = ${streamId}::uuid)`))[0]!['s'] as number;
    const replayed = await replaySubscription(Math.max(0, first - 1), 'at-least-once: every event of the late stream delivered again (B28 harness)');
    expect(replayed.replayed).toBeGreaterThanOrEqual(38);
    await settle();
    await waitFor('the replay applied (every evidence consumed again)', async () => (await eventsOf(P, 'evidence.ingested')).length, (n) => n >= 76);
    expect((await eventsOf(P, 'input.repeated')).length).toBe(6);                                  // the six pages repeated; their framed rows covered again
    expect((await inputsOf(P)).length).toBe(before.inputs);
    expect((await signalsOf(P)).length).toBe(before.signals);
    expect((await candidatesOf(P)).length).toBe(before.candidates);
    // The port: the same key with ANOTHER value is refused (a FIXTURE call under the consumer's action, as a named human — stated).
    const held = (await inputsOf(P))[0]!;
    await refused(portIngest(forecastOwner, { processor: P, evd: String(held['evd_object_id']), version: Number(held['evd_version']), rows: [{ day: held['day'], value: Number(held['value']) + 1 }] }),
      /^stream input rejected \(value_conflict\)/, 409, 'EYE-STA-002');
    const same = await portIngest(forecastOwner, { processor: P, evd: String(held['evd_object_id']), version: Number(held['evd_version']), rows: [{ day: held['day'], value: Number(held['value']) }] });
    expect(same).toMatchObject({ recorded: 0, repeated: 1 });
    await refused(portIngest(forecastOwner, { processor: uuidv7(), evd: uuidv7(), version: 1, rows: [] }), /\(no_processor\)/, 404, 'EYE-STA-001');
    await refused(portIngest(forecastOwner, { processor: P, evd: uuidv7(), version: 1, rows: [{ day: '2024-02-01', value: 1 }] }), /is not an admitted evidence version of the processor's source/, 404, 'EYE-STA-001');
    await refused(portIngest(forecastOwner, { processor: P, evd: String(held['evd_object_id']), version: Number(held['evd_version']), rows: [{ day: '2024-2-1', value: 1 }] }), /each row is/, 422, 'EYE-REQ-001');
    sixEvidence('S4', {
      fault_trace: { replayed: replayed.replayed, value_conflict: 409 }, watermark: null,
      consumer_behaviour: { repeated_events: (await eventsOf(P, 'input.repeated')).length, inputs_after: (await inputsOf(P)).length },
      operator_action: { replay_from_seq: first - 1 }, recovery: null, reconciliation: { signals: before.signals, candidates: before.candidates },
    });
  }, 300_000);

  it('S5 · RULE VERSIONING: version 2 supersedes version 1 and retires its processor; nothing is ingested into a retired processor', async () => {
    const v2 = (await defineRule(forecastOwner, RULE({ ruleKey: 'corridor-versioned', title: 'Corridor watch, versioned (B28 harness)', stallAfterSeconds: 3600, ownerPrincipalId: forecastOwner.principalId,
                                                       predicate: { comparator: 'lt', threshold: 32, min_hits: 3 } }))).rule;
    expect(v2).toMatchObject({ version: 2, state: 'draft', supersedes: ruleV1 });
    const act = (await activateRule(forecastOwner, String(v2['rule_id']), 'the threshold raised to 32 transits a day (B28 harness)')).rule;
    expect(act).toMatchObject({ state: 'active', superseded: ruleV1, retired_processors: [V1] });
    expect(await processorRow(V1)).toMatchObject({ state: 'retired' });
    expect((await rows(sql`select state from prediction.stream_rules where rule_id = ${ruleV1}::uuid`))[0]).toEqual({ state: 'superseded' });
    await refused(portIngest(forecastOwner, { processor: V1, evd: uuidv7(), version: 1, rows: [] }), /\(retired\)/, 409, 'EYE-STA-002');
    await refused(startProcessor(forecastOwner, ruleV1), /\(rule_not_active\)/, 409);
    const listed = (await listProcessors()).processors.find((p) => p['processor_id'] === V1)!;
    expect(listed).toMatchObject({ state: 'retired', outputs_current: false });
    sixEvidence('S5', {
      fault_trace: null, watermark: null, consumer_behaviour: { retired_processor_refused: 409 },
      operator_action: { v2: v2['rule_id'], superseded: ruleV1, retired: V1 }, recovery: null, reconciliation: { rule_v1: 'superseded' },
    });
  }, 120_000);

  it('R1 · STALL → RECOVER: the sweep stalls the quiet processor (outputs suspended); the recovery replays from the compatible checkpoint and suppresses every duplicate', async () => {
    await refused(recover(forecastOwner, P, 'the processor is running and is not recovered'), /\(not_recoverable\)/, 409, 'EYE-STA-002');
    const before = await signalsOf(P);
    // THE STALL: no input for stall_after (3 s) — on the DATABASE clock.
    await waitFor('three seconds without an input (the DB clock)', async () => (await rows(sql`select clock_timestamp() - last_input_at > interval '3 seconds' as quiet from prediction.stream_processors where processor_id = ${P}::uuid`))[0]!['quiet'], (q) => q === true, 20_000);
    const t = await tick();
    expect(t.outcome).toBe('finished');
    const steps = obj(obj(t.run?.outputs)['steps']);
    expect(obj(steps['stream-sweep'])['stalled']).toEqual([expect.objectContaining({ processor_id: P })]);
    expect(await processorRow(P)).toMatchObject({ state: 'stalled' });
    expect((await processorRow(Q))['state']).toBe('running');
    const shown = await getProcessor(P);
    expect(shown.processor['outputs_current']).toBe(false);
    expect(new Set(shown.signals.map((s) => s['presented_as']))).toEqual(new Set(['suspended (processor stalled)', 'superseded']));
    await refused(recover(analyst, P, 'an analyst may not recover a processor'), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(recover(forecastOwner, P, 'short'), /reason of at least 8 characters/, 422);
    const r = (await recover(forecastOwner, P, 'the corridor feed resumed; recover from the newest compatible checkpoint (B28 harness)')).recovery;
    expect(r).toMatchObject({ recovered: true, state: 'running', from: 'stalled', emitted: 0 });
    expect(Number(r['suppressed'])).toBeGreaterThan(0);
    expect(await signalsOf(P)).toEqual(before);                        // nothing emitted twice
    const pr = await processorRow(P);
    expect(pr['found_digest']).toBe(pr['state_digest']);
    expect((await checkpointsOf(P)).at(-1)).toMatchObject({ reason: 'recovered' });
    expect((await getProcessor(P)).signals.filter((s) => s['presented_as'] === 'current').length).toBe(6);
    sixEvidence('R1', {
      fault_trace: { stalled_by: 'stream-sweep', reason: (await eventsOf(P, 'processor.stalled')).at(-1)?.['details'] }, watermark: { P: pr['watermark'] },
      consumer_behaviour: { signals_before: before.length, signals_after: (await signalsOf(P)).length },
      operator_action: { recover: 'forecast owner', refused: ['409 running', '403 analyst', '422 reason'] },
      recovery: { checkpoint: r['checkpoint_id'], emitted: r['emitted'], suppressed: r['suppressed'] }, reconciliation: r['offsets'],
    });
  }, 180_000);

  it('R2 · CORRUPT STATE → RECOVER: a tampered window found by the sweep, the signals after the last good checkpoint retracted; forged checkpoints skipped; re-derived, the holding one owed', async () => {
    const cps = await checkpointsOf(Q);
    const lastGood = cps.at(-1)!;
    expect(lastGood).toMatchObject({ reason: 'cadence', signal_hw: expect.any(Number) });
    const qSignals = await signalsOf(Q);
    const after = qSignals.filter((s) => Number(s['signal_seq']) > Number(lastGood['signal_hw']) && s['emission'] !== 'retracted');
    expect(after.length).toBeGreaterThan(0);
    // THE TAMPERING (the superuser, stated): one window's value altered behind the ports.
    await sql`update prediction.stream_windows set value = jsonb_set(value, '{mean}', '0'::jsonb) where processor_id = ${Q}::uuid and window_start = '2024-02-06T00:00:00Z'`.execute(su);
    const t = await tick();
    expect(obj(obj(obj(t.run?.outputs)['steps'])['stream-sweep'])['corrupt']).toEqual([expect.objectContaining({ processor_id: Q })]);
    expect(await processorRow(Q)).toMatchObject({ state: 'corrupt' });
    const retractions = (await signalsOf(Q)).filter((s) => s['emission'] === 'retracted');
    expect(retractions.map((s) => s['retracts']).sort()).toEqual(after.map((s) => s['signal_id']).sort());
    expect(retractions.every((s) => s['retraction_kind'] === 'state_corrupt' && /state corrupt/.test(String(s['reason'])))).toBe(true);
    expect((await getProcessor(Q)).signals.filter((s) => s['presented_as'] === 'retracted')).toHaveLength(after.length);
    // TWO FORGED NEWER CHECKPOINTS (planted, stated): a snapshot that does not verify; a verifying snapshot under a foreign rule digest.
    const good = (await rows(sql`select * from prediction.stream_checkpoints where checkpoint_id = ${lastGood['checkpoint_id']}::uuid`))[0]!;
    const forge = async (digest: string, ruleDigest: string) => sql`insert into prediction.stream_checkpoints (checkpoint_id, scope, tenant_id, domain_id, processor_id, watermark, max_event_time, input_seq,
      signal_hw, source_offsets, windows, state_digest, rule_id, rule_digest, topology_version, reason, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${Q}::uuid, ${good['watermark']}, ${good['max_event_time']}, ${good['input_seq']}, ${good['signal_hw']},
              ${JSON.stringify(good['source_offsets'])}::jsonb, ${JSON.stringify(good['windows'])}::jsonb, ${digest}, ${ruleQ}::uuid, ${ruleDigest}, 'stream-topology@1.0.0', 'cadence', ${uuidv7()}::uuid)`.execute(su);
    await forge('0'.repeat(64), String(good['rule_digest']));
    await forge(String(good['state_digest']), 'f'.repeat(64));
    const r = (await recover(strategyOwner, Q, 'the state digest failed; restore the last verified checkpoint (B28 harness)')).recovery;
    expect(r).toMatchObject({ recovered: true, state: 'running', from: 'corrupt', checkpoint_id: lastGood['checkpoint_id'] });
    expect((r['skipped'] as Row[]).map((s) => s['why'])).toEqual([expect.stringMatching(/rule digest f{12} is not the processor's/), expect.stringMatching(/does not verify against its own digest/)]);
    const now = await signalsOf(Q);
    const reDerived = now.filter((s) => s['label'] === 'recovered');
    expect(reDerived.map((s) => s['ws']).sort()).toEqual(after.map((s) => s['ws']).sort());
    expect(reDerived.map((s) => [s['n'], s['hits'], s['holds']])).toEqual(after.map((s) => [s['n'], s['hits'], s['holds']]));
    const pr = await processorRow(Q);
    expect(pr['found_digest']).toBe(pr['state_digest']);
    // The holding re-derived signal is OWED: the recovery's action is not one the intake admits for a stream.
    const owed = await eventsOf(Q, 'candidate.owed');
    expect(owed.length).toBe(reDerived.filter((s) => s['holds'] === true).length);
    expect(owed.length).toBeGreaterThan(0);
    sixEvidence('R2', {
      fault_trace: { tampered: 'stream_windows 2024-02-06 (superuser, stated)', forged_checkpoints: 2 },
      watermark: { Q: pr['watermark'] }, consumer_behaviour: { retracted: retractions.length, re_derived: reDerived.length },
      operator_action: { recover: 'strategy owner' }, recovery: { checkpoint: r['checkpoint_id'], skipped: r['skipped'], emitted: r['emitted'] },
      reconciliation: { owed: owed.length, digest_verified: pr['found_digest'] === pr['state_digest'] },
    });
  }, 180_000);

  it('R3 · OFFSETS DIVERGENCE: a page missed while the subscription was paused is named, the outputs suspended; resumed, reconciled and recovered; the owed candidate submitted once', async () => {
    const qCandidatesBefore = (await candidatesOf(Q)).length;
    await subscriptionControl('pause', 'the stream consumer paused for the divergence scenario (B28 harness)');
    const last = await resumeStream(streamId, { credit: 1, maxSegments: 1 });
    expect(last.run).toMatchObject({ state: 'finished', admitted: 6, segments: 1 });
    await settle();
    const gapP = (await reconcile(forecastOwner, P)).reconciliation;
    expect(gapP).toMatchObject({ state: 'suspended' });
    expect(obj(gapP['offsets'])['missing']).toEqual([expect.objectContaining({ stream_id: streamId, seq: 8, range_from: '2024-03-06', range_to: '2024-03-11', evidence: 6 })]);
    expect(String(gapP['state_reason'])).toMatch(/offsets diverged: 1 segment\(s\)/);
    await reconcile(strategyOwner, Q);
    expect((await processorRow(Q))['state']).toBe('suspended');
    await refused(reconcile(analyst, P), /no qualifying role binding/, 403);
    await refused(reconcile(forecastOwner, V1), /\(retired\)/, 409);
    // RESUMED: the refused deliveries re-driven; the page ingested into the SUSPENDED processors — stored and labelled, nothing emitted.
    const pSignals = (await signalsOf(P)).length;
    await subscriptionControl('resume', 'the stream consumer resumed after the divergence scenario (B28 harness)');
    await settle();
    await waitFor('the missed page ingested into P', async () => (await inputsOf(P)).filter((i) => String(i['day']) >= '2024-03-06').length, (n) => n === 5);
    expect((await signalsOf(P)).length).toBe(pSignals);
    expect((await eventsOf(P, 'output.suspended')).length).toBeGreaterThan(0);
    const again = (await reconcile(forecastOwner, P)).reconciliation;
    expect(obj(again['offsets'])).toMatchObject({ diverged: false, missing: [] });
    expect(again['state']).toBe('suspended');                          // reconciled — still a person's recovery to run again
    const r = (await recover(forecastOwner, P, 'the missed page consumed; recover and resume the outputs (B28 harness)')).recovery;
    expect(r).toMatchObject({ recovered: true, state: 'running', from: 'suspended' });
    const fired = (await signalsOf(P)).filter((s) => s['ws'] === '2024-03-02');
    expect(fired).toEqual([expect.objectContaining({ emission: 'fired', label: 'recovered' })]);
    await reconcile(strategyOwner, Q);
    const rq = (await recover(strategyOwner, Q, 'the missed page consumed; recover the recovery twin (B28 harness)')).recovery;
    expect(rq).toMatchObject({ recovered: true, state: 'running' });
    // THE OWED CANDIDATE: submitted by the consumer's next item (a replay of the last page's events), ONCE.
    const lastSeq = (await rows(sql`select min(partition_seq)::int s from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type = 'ObservationRecorded'
      and payload ->> 'run_id' = ${String(last.run.runId)}`))[0]!['s'] as number;
    await replaySubscription(Math.max(0, lastSeq - 1), 'a consumer item for the owed candidate (B28 harness)');
    await settle();
    const qc = await waitFor('the owed candidate submitted', () => candidatesOf(Q), (c) => c.length === qCandidatesBefore + 1);
    const owedKey = String(qc.at(-1)!['origin_key']);
    expect(owedKey).toMatch(/:1$/);
    await replaySubscription(Math.max(0, lastSeq - 1), 'the same item again: nothing submitted twice (B28 harness)');
    await settle();
    await sleep(1500);
    expect((await candidatesOf(Q)).length).toBe(qCandidatesBefore + 1);
    sixEvidence('R3', {
      fault_trace: { paused: subscriptionId, missed_segment: { stream: streamId, seq: 8 } }, watermark: { P: (await processorRow(P))['watermark'] },
      consumer_behaviour: { ingested_while_suspended: 5, output_suspended: (await eventsOf(P, 'output.suspended')).length },
      operator_action: { reconcile: ['P suspended', 'Q suspended', 'P reconciled'], recover: ['P', 'Q'] },
      recovery: { P: { emitted: r['emitted'], suppressed: r['suppressed'] }, Q: { emitted: rq['emitted'] } },
      reconciliation: { gap: obj(gapP['offsets'])['missing'], after: obj(again['offsets'])['streams'], owed_submitted: owedKey },
    });
  }, 300_000);

  it('R4 · RETRACTION by a person and the page\'s reads: 403 / 404 / 409 twice / 409 a retraction / 422; list and get', async () => {
    const target = (await getProcessor(P)).signals.find((s) => s['presented_as'] === 'current' && s['holds'] === true)!;
    const candidatesBefore = (await candidatesOf(P)).length;
    await refused(retract(analyst, String(target['signal_id']), 'an analyst may not retract a signal'), /no qualifying role binding/, 403);
    await refused(retract(forecastOwner, uuidv7(), 'no such signal exists here'), /no such signal/, 404, 'EYE-STA-001');
    await refused(retract(forecastOwner, String(target['signal_id']), 'short'), /reason of at least 8 characters/, 422);
    const t = (await retract(forecastOwner, String(target['signal_id']), 'the rule\'s threshold was mis-set for this window (B28 harness)')).retraction;
    expect(t).toMatchObject({ emission: 'retracted', retracts: target['signal_id'], retraction_kind: 'operator' });
    await refused(retract(forecastOwner, String(target['signal_id']), 'retracting it twice is refused'), /\(already_retracted\)/, 409, 'EYE-STA-002');
    await refused(retract(forecastOwner, String(t['signal_id']), 'a retraction is not retracted'), /\(not_an_emission\)/, 409);
    expect((await candidatesOf(P)).length).toBe(candidatesBefore);    // a retraction submits nothing
    const shown = await getProcessor(P);
    const s = shown.signals.find((x) => x['signal_id'] === target['signal_id'])!;
    expect(s).toMatchObject({ presented_as: 'retracted', retraction: expect.objectContaining({ kind: 'operator' }) });
    // B28 (0088 §I): the candidate is decided by §W when the attention tick runs (never refused: the stream's affected block keeps the
    // intake's contract — every stream-rule candidate passes §W's check); a retraction does not withdraw it (stated).
    expect(['pending', 'raised', 'clustered']).toContain(String(obj(s['candidate'])['state']));
    const contract = (await sql<{ problem: string | null }>`select prediction.warning_affected_problem(affected) problem from prediction.warning_candidates where origin_kind = 'stream_rule'`.execute(su)).rows;
    expect(contract.length).toBeGreaterThan(0);
    expect(contract.every((c) => c.problem === null), JSON.stringify(contract)).toBe(true);
    // B28 §I (found by the act): a stream-rule warning the attention agent raised after its tick is routed to a NAMED, ACTIVE HUMAN (the
    // stream rule's owner when no affected objective has one) — never to the agent's principal.
    const routed = (await sql<{ kind: string; status: string }>`select p.kind, p.status from prediction.warnings_current w join identity.principals p on p.id = w.routed_to where w.origin_kind = 'stream_rule'`.execute(su)).rows;
    expect(routed.every((r) => r.kind === 'human' && r.status === 'active'), JSON.stringify(routed)).toBe(true);
    expect(shown.windows.some((w) => w['completeness'] === 'partial_incomplete_range')).toBe(true);
    expect(shown.inputs.some((i) => i['lateness'] === 'late_beyond_allowance')).toBe(true);
    const list = await listProcessors();
    expect(list.processors.find((p) => p['processor_id'] === P)).toMatchObject({ state: 'running', outputs_current: true });
    await refused(getProcessor(uuidv7()), /no authorized stream processor matches/, 404);
    sixEvidence('R4', {
      fault_trace: null, watermark: { P: shown.processor['watermark'] }, consumer_behaviour: null,
      operator_action: { retracted: target['signal_id'], refused: ['403', '404', '422', '409 twice', '409 retraction'] },
      recovery: null, reconciliation: { candidates: candidatesBefore, presented: s['presented_as'] },
    });
  }, 120_000);
  it('L1 · A BOUNDED LOAD RUN: two years of daily points in 146 batches (a tenth out of order) through the port — elapsed recorded, the model agrees', async () => {
    const ruleL = String((await defineRule(forecastOwner, RULE({ ruleKey: 'corridor-load', title: 'Corridor watch — the bounded load run (B28 harness)', windowDays: 7, windowOrigin: '2019-01-07',
      allowedLatenessHours: 336, stallAfterSeconds: 3600, checkpointEvery: 10, ownerPrincipalId: forecastOwner.principalId }))).rule['rule_id']);
    await activateRule(forecastOwner, ruleL, 'the bounded load run of the stream engine (B28 harness)');
    const L = String((await startProcessor(forecastOwner, ruleL)).processor['processor_id']);
    const held = (await inputsOf(P))[0]!;
    const evd = String(held['evd_object_id']); const version = Number(held['evd_version']);
    const day0 = Date.UTC(2019, 0, 7);
    const days = Array.from({ length: 730 }, (_, i) => ({ day: new Date(day0 + i * DAY_MS).toISOString().slice(0, 10), value: Math.round(33 + 6 * Math.sin(i / 5) + ((i * 7919) % 7) - 3) }));
    const batches: Array<Array<{ day: string; value: number }>> = [];
    for (let i = 0; i < days.length; i += 5) batches.push(days.slice(i, i + 5));
    for (let b = 9; b < batches.length; b += 10) { const t = batches[b - 1]!; batches[b - 1] = batches[b]!; batches[b] = t; }   // every tenth pair arrives swapped
    const started = Date.now();
    for (const b of batches) await portIngest(forecastOwner, { processor: L, evd, version, rows: b });
    const elapsedMs = Date.now() - started;
    const pr = await processorRow(L);
    expect(pr['found_digest']).toBe(pr['state_digest']);
    const sig = await signalsOf(L);
    const geometry: RuleGeometry = { ...GEOMETRY, windowDays: 7, slideDays: 7, windowOrigin: '2019-01-07', allowedLatenessMs: 14 * DAY_MS };
    const model = simulate(geometry, batches.map((b) => b.map((r) => ({ key: `evd:${evd}@${version}:${r.day}`, day: r.day, value: r.value }))));
    expect(sig.map((s) => [s['ws'], s['emission'], s['revision'], s['label'], s['n'], s['hits'], s['holds']]))
      .toEqual(model.emissions.map((e) => [e.windowStart, e.emission, e.revision, e.label, e.n, e.hits, e.holds]));
    expect((await inputsOf(L)).length).toBe(730);
    expect(elapsedMs).toBeLessThan(240_000);
    sixEvidence('L1', {
      fault_trace: { batches: batches.length, swapped_pairs: Math.floor(batches.length / 10) }, watermark: { L: pr['watermark'] },
      consumer_behaviour: { inputs: 730, signals: sig.length, late: (await inputsOf(L)).filter((i) => i['lateness'] !== 'on_time').length },
      operator_action: { fixture_path: 'the port under prediction.stream.subscription.apply, as a named human (stated)' },
      recovery: { checkpoints: (await checkpointsOf(L)).length },
      reconciliation: { elapsed_ms: elapsedMs, per_batch_ms: Math.round(elapsedMs / batches.length), model_emissions: model.emissions.length },
    });
  }, 300_000);
});
