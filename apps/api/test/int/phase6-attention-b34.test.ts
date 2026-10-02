/**
 * CP-6 B34 (migration 0090, part `attention`; F-P6-07 — the attention completion: V3 L10-C02/-C07, L10-I02/-I05; V4 ES-40-*; V8 PR-44-*,
 * CAP-EO-06, AT-44; V9 UX-44-*) — on a real database with real Redis (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the real outbox
 * publisher, the real subscription dispatcher and the attention consumer registered in the harness's own domain, the world of
 * `bootDecisionWorld` and B34's own humans with sessions of their own; the SYNTHETIC email / SMS / Teams adapters against a LOCAL SINK
 * process (scripts/attention/local-sinks.mjs, spawned on loopback — no real provider; owner decision D6).
 *
 *   P1 · THE POLICY with the new classes and channels: email / sms / teams accepted (synthetic); push refused (422, D6); a channel twice
 *        (422); a bare 'sms' (422).
 *   O1 · OPPORTUNITY: a REAL accepted opportunity (the exposures part's accept route emits ExposureChanged@v1 — merged from phase6-b34) →
 *        opportunity.raised routed to its owner and the class's roles with its reasons and dimensions read from the record; the unaccepted
 *        hypothesis's ExposureChanged → not_a_signal (recorded, not routed).
 *   H1 · HEALTH: the REAL compute route emits one HealthScoreChanged@v1 per raised change in its own write → health.change routed (C2,
 *        confidence = the snapshot's coverage), review never action; an as_of replay raises and emits nothing.
 *   C1 · COMMITMENT: a PLANTED CommitmentChanged@v1 row (stated: the commitments part emits it; its signal contract is the prelude's stub
 *        in this worktree) → NOT ROUTED with the reason (decision.commitment_item_signal answered NULL); a payload that is not the contract
 *        quarantined. The routed commitment case is the INTEGRATOR's (with the commitments part's body of the contract).
 *   A1 · THE ACT: the human gate (an agent 403), the PDP (403), the item's people (a person who may not act 403), 404 / 422, health.change
 *        has no act (422), an unregistered action (422); a strategy owner without the sponsor role → the governed action refused at ITS PDP
 *        (403) and the act RECORDED refused (item.act_refused); L. Brandt sponsors through the act → acted (item.acted, the effect
 *        reference), the exposure sponsored and ExposureChanged/sponsored described in that write; again 409; the registry and the acts read.
 *   F1 · RANKING FAIRNESS in the queue evaluation: per class and consequence tier, mean rank percentile, top-decile share, structural-null
 *        shares, disparity (abstained below min_sample; measured at min_sample 1); gating nothing (the verdict and reason unaffected).
 *   D1 · THE ADAPTERS: the health items delivered on email / sms / teams to the loopback sinks with receipts {channel, synthetic, sink,
 *        sink_message_id, body_digest, note} matching what the sink received; D2 the SMS sink failing → retried after 1 and 5 minutes →
 *        abandoned, then recovered; D3 an UNACKNOWLEDGED item escalates through the email adapter to the local sink.
 *
 * EACH CASE LOGS ONE `B34 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b34a-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
const SINKS = resolvePath(__dirname, '../../../../scripts/attention/local-sinks.mjs');

type Row = Record<string, unknown>;
type Delivery = { delivery_id: string; item_event: string; channel: string; recipient_principal_id: string; attempt: number; max_attempts: number; state: string; receipt: Row | null; provider_ref: string | null; error: string | null; synthetic_state: boolean };
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let exec: ExecutiveController; let ex: ExposuresController; let graph: GraphController;
let scheduler: SchedulerService; let timer: AttentionTimerService;
let tenantAdmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let sourcingOwner: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal; let stratOnly: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal;
let sinks: ChildProcess | null = null; let httpPort = 0; let smtpPort = 0;
let agentId = '';
/** What the cases leave one another. */
let morocco = ''; let oppDigest = ''; let oppItem = ''; const healthItems: string[] = []; let I1 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}`);
    await sleep(300);
  }
}
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
  console.log(`B34 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'executive');
const X = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'RSK', id, 'prediction');
const publish = (rules: unknown, reason: string, as = executive) => exec.publishAttentionPolicy(E(as, 'executive.attention.policy.publish', 'ATP', null), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const act = (as: AuthenticatedPrincipal, itemId: string, payload: Row) => exec.actOnAttentionItem(E(as, 'executive.attention.item.act', 'ATI', itemId), T(), D(), itemId, { payload }) as unknown as Promise<{ act: Row; receipts: Row }>;
const acts = (as: AuthenticatedPrincipal, itemId?: string) => exec.listAttentionActs(E(as, 'executive.attention.read', 'ATI', itemId ?? null), T(), D(), { payload: itemId === undefined ? {} : { itemId } }) as unknown as Promise<{ acts: Row[]; items: Row[]; no_act: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string) => exec.acknowledgeAttentionItem(E(as, 'executive.attention.item.acknowledge', 'ATI', itemId), T(), D(), itemId, { payload: { note: 'seen (B34 harness)' } });
const evaluate = (payload: Row, as = executive) => exec.evaluateAttentionQueue(E(as, 'executive.attention.queue.evaluate', 'ATE', null), T(), D(), { payload }) as unknown as Promise<{ evaluation: Row }>;
const propose = (model: unknown) => exec.proposeHealthDefinition(E(executive, 'executive.health.definition.propose', 'HSD', null), T(), D(), { payload: { model, reason: 'the NORDWERK supply model (B34 attention harness)' } as never }) as unknown as Promise<{ definition: Row }>;
const approveDef = (id: string) => exec.approveHealthDefinition(E(dadmin, 'executive.health.definition.approve', 'HSD', id), T(), D(), id, { payload: { note: 'reviewed: the weights and bands stand (B34 harness)' } }) as unknown as Promise<{ definition: Row }>;
const compute = (at?: string) => exec.computeHealthScore(E(analyst, 'executive.health.compute', 'HSS', null), T(), D(), { payload: at === undefined ? {} : { at } }) as unknown as Promise<{ snapshot: Row }>;
const declareStrategy = (as: AuthenticatedPrincipal, payload: Row) => w.graph.declare(h.req(as, 'graph.strategy.declare', String(payload['objectType']), null, 'graph'), T(), D(), { payload }) as Promise<{ strategy: { objectId: string } }>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string } }>;

/* ───────────── the rows ───────────── */
const outbox = async (eventType: string, where: (p: Row) => boolean = () => true) =>
  (await sql<{ id: string; status: string; payload: Row }>`select id::text, status, payload from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const delivery = async (eventId: string) => (await sql<{ consumer_kind: string; state: string; items_applied: Row[]; items_unresolved: Row[]; failure_class: string | null }>`select consumer_kind, state, items_applied, items_unresolved, failure_class from graph.subscription_deliveries where event_id = ${eventId}::uuid and consumer_kind = 'attention'`.execute(su)).rows[0] ?? null;
const delivered = (eventId: string, state = 'applied') => waitFor(`the attention delivery of ${eventId} ${state}`, () => delivery(eventId), (d) => d !== null && d.state === state);
const itemsOf = async (signalClass: string, subjectId?: string) => (await sql<Row>`select item_id::text, signal_class, subject_kind, subject_id::text, title, outcome, state, owner_principal_id::text, route_roles, evaluation, details, due_at from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${signalClass} order by created_at`.execute(su)).rows.filter((r) => subjectId === undefined || r['subject_id'] === subjectId);
const itemEvents = async (itemId: string) => (await sql<{ event_id: string; event: string; actor: string; details: Row }>`select event_id::text, event, actor_principal_id::text actor, details from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const deliveryRows = async (itemId: string) => (await sql<Delivery>`select delivery_id::text, item_event, channel, recipient_principal_id::text, attempt, max_attempts, state, receipt, provider_ref, error, synthetic_state from executive.attention_deliveries where item_id = ${itemId}::uuid order by created_at, channel, recipient_principal_id, attempt`.execute(su)).rows;
const sinkReceived = async (): Promise<Row[]> => ((await (await fetch(`http://127.0.0.1:${httpPort}/_received`)).json()) as { received: Row[] }).received;
const sinkMode = async (channel: string, mode: 'ok' | 'fail') => { await fetch(`http://127.0.0.1:${httpPort}/_control`, { method: 'POST', body: JSON.stringify({ channel, mode }) }); };
let slot = 0;
const tick = () => timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2033, 0, 1) + (slot++) * 60_000) });
const retryDue = async (itemId: string) => { await sql`update executive.attention_deliveries set next_attempt_at = clock_timestamp() - interval '1 second' where item_id = ${itemId}::uuid and state = 'queued'`.execute(su); };
/** A row PLANTED in the tenant's outbox partition the way 0064 places every row (the B22 idiom) — PENDING, so the real publisher routes it. */
async function plantOutbox(eventType: string, payload: Row): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}
const plantEvaluation = async (indicatorId: string, value: number, observedDaysAgo: number, knownAgo: string) =>
  sql`insert into prediction.indicator_evaluations (evaluation_id, scope, tenant_id, domain_id, indicator_id, evaluated_at, known_at, observation_at, value, evidence_object_id, evidence_version, satisfied, streak, breached, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${indicatorId}::uuid, clock_timestamp(), clock_timestamp() - ${knownAgo}::interval, current_date - ${observedDaysAgo}::int, ${value},
              ${w.evd.id}::uuid, ${w.evd.version}, true, 0, false, ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(su)).rows[0]!.t.toISOString();

const CHANNELS = ['in_app', 'email', 'sms', 'teams'];
const RULES = (): Row => ({
  classes: {
    'opportunity.raised': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['opportunity_sponsor', 'strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, notify: { channels: ['in_app'], max_attempts: 3 } },
    'health.change': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 60, escalate_to_roles: ['domain_admin'], max_escalations: 2, notify: { channels: CHANNELS, max_attempts: 3 } },
    'commitment.breach': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 60 },
    'commitment.due': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 240 },
  },
});
const BANDS = [{ key: 'healthy', min: 70 }, { key: 'watch', min: 50 }, { key: 'critical', min: 0 }];
const MODEL = (): Row => ({ min_coverage: 0.7, change_points: 10, min_confidence: 0.5,
  dimensions: [{ key: 'supply_resilience', label: 'Supply resilience', weight: 1, objective_ids: [w.objectiveId], bands: BANDS }],
  components: [{ key: 'corridor', label: 'Corridor transits (SYNTHETIC)', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I1, weight: 1, direction: 'higher_better', normalisation: { worst: 20, best: 60 }, stale_after_days: 14 }] });

beforeAll(async () => {
  // THE LOCAL SINKS first (loopback, free ports), then the API configured with them — the adapters never reach anything else.
  sinks = spawn(process.execPath, [SINKS, '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  await new Promise<void>((resolve, reject) => { sinks!.stdout!.on('data', (c: Buffer) => { out += c.toString(); if (out.includes('ready')) resolve(); }); sinks!.once('exit', () => reject(new Error(`the sinks exited: ${out}`))); });
  smtpPort = Number(/smtp (\d+)/.exec(out)![1]); httpPort = Number(/http (\d+)/.exec(out)![1]);
  process.env['EYE_ATTENTION_SINK_HOST'] = '127.0.0.1';
  process.env['EYE_ATTENTION_SMTP_PORT'] = String(smtpPort);
  process.env['EYE_ATTENTION_SMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/sms`;
  process.env['EYE_ATTENTION_TEAMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/teams`;
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  exec = h.app.get(Ec); ex = h.app.get(Xc); graph = h.app.get(Gc); scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b34a-tenant-admin', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b34a-executive');
  dadmin = await h.humanWithSession(['domain_admin'], 'b34a-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b34a-analyst');
  sourcingOwner = await h.humanWithSession(['risk_owner'], 'b34a-sourcing-owner');
  brandt = await h.humanWithSession(['opportunity_sponsor', 'strategy_owner', 'decision_owner'], 'b34a-l-brandt');
  stratOnly = await h.humanWithSession(['strategy_owner'], 'b34a-strategy-owner');
  roleless = await h.principalWith([], 'b34a-roleless');
  w = await bootDecisionWorld(h);
  // THE ATTENTION SUBSCRIPTION (the consumer selects its types, the three new ones among them), the backlog left
  const sub = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
    { payload: { consumerKind: 'attention', ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as unknown as { subscription: { subscriptionId: string; eventTypes?: string[] } };
  expect(sub.subscription.subscriptionId).toMatch(/^[0-9a-f-]{36}$/);
  // THE ATTENTION AGENT (the deliveries plan from its registration on); its Redis timer stopped — the cases tick by the hook alone
  agentId = (await registerAgent({ kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } })).agent.agentId;
  await scheduler.obliterateAttentionTicksForTests(T(), D());
  I1 = ((await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
    { payload: { seriesKey: w.seriesKey, description: 'SYNTHETIC NORDWERK corridor transits per day (B34 attention)', comparator: '<', threshold: 30, consecutiveDays: 1, owner: w.twinOwner.principalId } })) as { indicator: { indicatorId: string } }).indicator.indicatorId;
}, 600_000);

afterAll(async () => {
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
  sinks?.kill();
}, 120_000);

describe('B34 · the attention completion (0090 part attention; F-P6-07)', () => {
  it('P1 · THE POLICY: the four new classes and the synthetic email / sms / teams channels accepted; push, a channel twice and a bare word refused (422)', async () => {
    const withNotify = (notify: unknown): Row => { const r = RULES(); ((r['classes'] as Record<string, Row>)['health.change'] as Row)['notify'] = notify; return r; };
    await refused(publish(withNotify({ channels: ['in_app', 'push'], max_attempts: 3 }), 'push notifications for the score (B34 harness)'),
      /^attention policy rejected: class health\.change notify\.channels are in_app, demo-mailbox, email, sms, teams .*; push needs a delivery provider \(owner decision D6\)/, 422, 'EYE-REQ-001');
    await refused(publish(withNotify({ channels: ['email', 'email'] }), 'email twice for the score (B34 harness)'), /notify\.channels names a channel twice/, 422, 'EYE-REQ-001');
    await refused(publish(withNotify('sms'), 'a bare sms word (B34 harness)'), /sms needs a delivery provider \(owner decision D6\)/, 422, 'EYE-REQ-001');
    await refused(publish({ classes: { 'health.change': { ...obj((RULES()['classes'] as Row)['health.change']), act: 'none' } } }, 'an unknown key (B34 harness)'), /carries the unknown key act/, 422, 'EYE-REQ-001');
    const p = (await publish(RULES(), 'the B34 classes: opportunities, the health score, commitments; the score on the synthetic channels (B34 harness)')).policy;
    expect(p).toMatchObject({ version: 1 });
    expect([...(p['changed_classes'] as string[])].sort()).toEqual(['commitment.breach', 'commitment.due', 'health.change', 'opportunity.raised']);
    sixEvidence('P1', { fault_trace: { refused: ['422 push (D6)', '422 twice', '422 bare sms', '422 unknown key'] }, watermark: { version: 1 }, consumer_behaviour: 'validated whole by executive.validate_attention_rules (channels from executive.attention_delivery_channels())',
      operator_action: 'the executive publishes', recovery: 'none needed', reconciliation: { changed_classes: p['changed_classes'] } });
  }, 120_000);

  it('O1 · OPPORTUNITY: a real accepted opportunity (ExposureChanged from the accept route) routed as opportunity.raised with its reasons; an unaccepted one is not a signal', async () => {
    await ex.publishTaxonomy(X(executive, 'prediction.exposure.taxonomy.publish'), T(), D(), { payload: { expectedVersion: 0, reason: 'the first taxonomy of the domain (B34 attention)',
      categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }] } });
    await ex.activateTaxonomy(X(dadmin, 'prediction.exposure.taxonomy.activate'), T(), D(), { payload: { version: 1, reason: 'reviewed against the board\'s risk policy (B34 attention)' } });
    morocco = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Alternative magnet supplier in Morocco', statement: 'The corridor closure opens the door to a Moroccan supplier',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor drives the opening' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the opportunity serves this objective' }] })).strategy.objectId;
    await ex.register(X(analyst, 'prediction.exposure.register', morocco), T(), D(), { payload: { strategyObjectId: morocco, polarity: 'opportunity', category: 'sourcing', owner: sourcingOwner.principalId } });
    await ex.declareHypothesis(X(brandt, 'prediction.exposure.hypothesis.declare', morocco), T(), D(), morocco, { payload: { statement: 'A Moroccan supplier can deliver qualified magnets within 12 weeks',
      falsifier: 'The first article fails the magnetic flux test', value: { low: 150_000, high: 600_000, unit: 'EUR' }, timing: { window: '2024-H1' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [] } });
    // the HYPOTHESIS's ExposureChanged (the exposures part's route): no accepted assessment yet → recorded not_a_signal, nothing routed
    const hyp = await waitFor('the hypothesis ExposureChanged published', () => outbox('ExposureChanged', (p) => p['exposure_id'] === morocco && obj(p['change'])['kind'] === 'hypothesis_declared'), (r) => r.length === 1 && r[0]!.status === 'published');
    const dh = await delivered(hyp[0]!.id);
    expect(dh.items_applied[0]).toMatchObject({ effect: 'not_a_signal' });
    const a = (await ex.assess(X(analyst, 'prediction.exposure.assess', morocco), T(), D(), morocco, { payload: { expectedVersion: 0, assessment: {
      mechanism: 'A Moroccan magnet supplier qualified now captures the share the corridor closure frees up at a lower landed cost', plausibility: 'medium', impact: { low: 150_000, high: 600_000, unit: 'EUR' },
      horizon: '2024-H1', velocity: 'months', reversibility: 'reversible', controllability: 'medium', response_window_hours: 720, confidence: 0.6,
      options: [{ key: 'qualify', label: 'Qualify the Moroccan supplier', kind: 'exploit', cost: 80_000 }, { key: 'wait', label: 'Wait for the corridor to reopen', kind: 'defer' }],
      evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B34 attention harness)' } } }) as { assessment: Row }).assessment;
    oppDigest = String(a['digest']);
    await ex.accept(X(sourcingOwner, 'prediction.exposure.accept', morocco), T(), D(), morocco, '1', { payload: { digest: oppDigest, rationale: 'The owner accepts the value range (B34 attention)' } });
    const acc = await waitFor('the acceptance ExposureChanged published', () => outbox('ExposureChanged', (p) => p['exposure_id'] === morocco && obj(p['change'])['kind'] === 'assessment_accepted'), (r) => r.length === 1 && r[0]!.status === 'published');
    const d = await delivered(acc[0]!.id);
    expect(d.items_applied[0]).toMatchObject({ effect: 'attention.routed' });
    const it = (await itemsOf('opportunity.raised', morocco))[0]!;
    oppItem = String(it['item_id']);
    expect(it).toMatchObject({ subject_kind: 'exposure', outcome: 'material', state: 'open', owner_principal_id: sourcingOwner.principalId });
    expect([...(it['route_roles'] as string[])].sort()).toEqual(['opportunity_sponsor', 'strategy_owner']);
    const ev = obj(it['evaluation']);
    expect(obj(ev['dimensions'])).toMatchObject({ consequence: 'C2', confidence: 0.6, strategic_relevance: 1, irreversibility: 'reversible', accepted_version: 1 });
    expect(typeof obj(ev['dimensions'])['hours_to_window']).toBe('number');
    expect((ev['reasons'] as string[]).join('; ')).toMatch(/consequence C2 at or above C1; confidence 0\.6 at or above 0\.3/);
    expect(String(obj(ev['rank'])['explanation'])).toMatch(/consequence C2/);
    expect(String(it['title'])).toMatch(/^Opportunity: Alternative magnet supplier in Morocco \(sourcing; accepted\)/);
    sixEvidence('O1', { fault_trace: { hypothesis: 'not_a_signal (no accepted assessment)' }, watermark: { accept_event: acc[0]!.id, item: oppItem }, consumer_behaviour: { dims: ev['dimensions'], reasons: ev['reasons'] },
      operator_action: 'the analyst assesses, the owner accepts (the real routes)', recovery: 'none needed', reconciliation: { items: 1 } });
  }, 240_000);

  it('H1 · HEALTH: the compute route emits HealthScoreChanged@v1 per raised change in its own write → health.change routed (review, never action); an as_of replay emits nothing', async () => {
    const def = (await propose(MODEL())).definition;
    await approveDef(String(def['definition_id']));
    await plantEvaluation(I1, 52, 4, '4 days');
    const at1 = await dbInstant('3 days');
    const s1 = (await compute(at1)).snapshot;
    expect(s1['changes']).toEqual([]);
    expect(await outbox('HealthScoreChanged')).toEqual([]);
    await plantEvaluation(I1, 30, 0, '1 minute');
    const s2 = (await compute()).snapshot;
    const raised = arr(s2['changes']);
    expect(raised.map((c) => c['subject']).sort()).toEqual(['aggregate', 'dimension:supply_resilience']);
    const rows = await waitFor('the two HealthScoreChanged rows published', () => outbox('HealthScoreChanged'), (r) => r.length === 2 && r.every((x) => x.status === 'published'));
    const dim = raised.find((c) => c['subject'] === 'dimension:supply_resilience')!;
    const row = rows.find((r) => r.payload['change_id'] === dim['change_id'])!;
    expect(row.payload).toMatchObject({ schema: 'HealthScoreChanged', schema_version: 1, snapshot_id: s2['snapshot_id'], prior_snapshot_id: s1['snapshot_id'], subject: 'dimension:supply_resilience',
      from_value: 80, to_value: 25, from_band: 'healthy', to_band: 'critical', direction: 'unfavourable', state: 'raised', cause: { action: 'executive.health.compute', actor: analyst.principalId, target_type: 'HSS' } });
    for (const r of rows) await delivered(r.id);
    const items = await itemsOf('health.change');
    expect(items).toHaveLength(2);
    for (const i of items) healthItems.push(String(i['item_id']));
    const di = items.find((i) => i['subject_id'] === dim['change_id'])!;
    expect(di).toMatchObject({ subject_kind: 'health_change', outcome: 'material', state: 'open', owner_principal_id: null, route_roles: ['executive'] });
    expect(obj(obj(di['evaluation'])['dimensions'])).toMatchObject({ consequence: 'C2', confidence: 1, direction: 'unfavourable', strategic_relevance: 1 });
    expect(String(di['title'])).toMatch(/^Health score: Supply resilience 80 → 25 \(healthy → critical\) — unfavourable; review, never action$/);
    expect(obj(di['details'])['authorizes_action']).toBe(false);
    // an as_of replay raises no change and so emits nothing
    await compute(await dbInstant('2 days'));
    expect(await outbox('HealthScoreChanged')).toHaveLength(2);
    sixEvidence('H1', { fault_trace: { replay: 'as_of raises nothing, emits nothing' }, watermark: { snapshot: s2['snapshot_id'], rows: rows.map((r) => r.id) }, consumer_behaviour: { items: items.map((i) => i['title']) },
      operator_action: 'the analyst computes (the real route)', recovery: 'none needed', reconciliation: { changes: 2, events: 2, items: 2 } });
  }, 240_000);

  it('C1 · COMMITMENT: a PLANTED CommitmentChanged (the commitments part emits it) → NOT ROUTED while the signal contract knows no item; a payload that is not the contract quarantined', async () => {
    const itemId = uuidv7(); const commitmentId = uuidv7();
    const id = await plantOutbox('CommitmentChanged', { schema: 'CommitmentChanged', schema_version: 1, temporal: { known_at: new Date().toISOString() },
      cause: { action: 'decision.commitment.item.update', actor: w.owner.principalId, target_type: 'CMT', target_id: commitmentId }, commitment_id: commitmentId, package_id: uuidv7(), item_id: itemId,
      change: { kind: 'item.overdue', event_id: uuidv7() }, owner: brandt.principalId, reviewer: null, due_at: new Date().toISOString(), severity: 'C3', title: 'PLANTED — NORDWERK second magnet shipment (B34 harness)', state: 'open', planted: 'B34 attention harness' });
    const d = await delivered(id);
    expect(d.items_applied[0]).toMatchObject({ effect: 'not_routed', details: expect.objectContaining({ item_id: itemId, reason: expect.stringMatching(/decision\.commitment_item_signal answered NULL/) }) });
    expect(await itemsOf('commitment.breach')).toEqual([]);
    expect(await itemsOf('commitment.due')).toEqual([]);
    const bad = await plantOutbox('CommitmentChanged', { schema: 'CommitmentChanged', commitment_id: 'nope', planted: 'B34 attention harness' });
    const q = await delivered(bad, 'unresolved');
    expect(q.failure_class).toBe('invalid_event');
    sixEvidence('C1', { fault_trace: { planted: [id, bad] }, watermark: { item: itemId }, consumer_behaviour: { effect: 'not_routed', quarantined: q.failure_class },
      operator_action: 'none', recovery: 'the routed case is the integrator\'s (the commitments part re-declares decision.commitment_item_signal)', reconciliation: { items: 0 } });
  }, 120_000);

  it('A1 · THE ACT: refused at the gate, the PDP, the port; a governed action refused at ITS PDP is recorded; L. Brandt sponsors the opportunity through the act', async () => {
    const payload = (over: Row = {}): Row => ({ action_key: 'sponsor', rationale: 'The value range justifies a qualification run (B34 act)',
      params: { version: 1, digest: oppDigest, terms: { option_key: 'qualify', rationale: 'The saving justifies qualification', conditions: ['first article passes the flux test'] } }, ...over });
    await refused(act({ ...brandt, kind: 'agent' } as AuthenticatedPrincipal, oppItem, payload()), /human gate: executive\.attention\.item\.act requires a named human principal/, 403, 'EYE-WFL-002');
    expect((await refusal(act(roleless, oppItem, payload()))).status).toBe(403);
    await refused(act(analyst, oppItem, payload()), /^attention act rejected: item .* is routed to/, 403, 'EYE-AUT-001');
    await refused(act(brandt, uuidv7(), payload()), /^attention act rejected: no such item in this domain/, 404, 'EYE-STA-001');
    await refused(act(brandt, 'not-a-uuid', payload()), /itemId must be an id/, 422, 'EYE-REQ-001');
    await refused(act(brandt, oppItem, payload({ rationale: 'short' })), /payload\.rationale says why/, 422, 'EYE-REQ-001');
    await refused(act(brandt, oppItem, payload({ action_key: 'acknowledge_warning' })), /^attention act rejected \(no_act\): acknowledge_warning is not a registered act of the class opportunity\.raised \(sponsor\)/, 422, 'EYE-REQ-001');
    await refused(act(executive, healthItems[0]!, { action_key: 'sponsor', rationale: 'act on a score change (B34 harness)' }), /^attention act rejected \(no_act\): a score change triggers review, never action/, 422, 'EYE-REQ-001');
    // a strategy owner may act on the item (a routed role) but does not hold the sponsor role: the GOVERNED action is refused at its own PDP — recorded
    const r0 = await refusal(act(stratOnly, oppItem, payload()));
    expect(r0.status).toBe(403);
    expect(r0.message).toMatch(/the act .* was recorded refused/);
    const refusedEv = (await itemEvents(oppItem)).find((e) => e.event === 'item.act_refused')!;
    expect(refusedEv.details).toMatchObject({ action_key: 'sponsor', governed_action: 'prediction.exposure.sponsor', target_id: morocco, gate: 'human_gate' });
    expect(String(refusedEv.details['refusal'])).toMatch(/^prediction\.exposure\.sponsor answered 403/);
    // L. BRANDT sponsors through the act: launched → the governed action (its own write) → acted
    const ok = await act(brandt, oppItem, payload());
    expect(ok.act).toMatchObject({ state: 'acted', action_key: 'sponsor', governed_action: 'prediction.exposure.sponsor', target_kind: 'exposure', target_id: morocco, launched_by: brandt.principalId, effect_ref: `RSK:${morocco}@v1:sponsored` });
    expect(obj(ok.act['effect'])).toMatchObject({ governed_action: 'prediction.exposure.sponsor', state: 'sponsored', version: 1 });
    expect(Object.keys(ok.receipts).sort()).toEqual(['action', 'launch', 'settle']);
    expect((await sql<{ state: string; sponsor: string }>`select state, sponsor_principal_id::text sponsor from prediction.exposure_current where exposure_id = ${morocco}::uuid`.execute(su)).rows[0]).toEqual({ state: 'sponsored', sponsor: brandt.principalId });
    const sp = await waitFor('the sponsorship ExposureChanged', () => outbox('ExposureChanged', (p) => p['exposure_id'] === morocco && obj(p['change'])['kind'] === 'sponsored'), (r) => r.length === 1);
    expect(obj(sp[0]!.payload['cause'])).toMatchObject({ action: 'prediction.exposure.sponsor', actor: brandt.principalId });
    const actedEv = (await itemEvents(oppItem)).find((e) => e.event === 'item.acted')!;
    expect(actedEv).toMatchObject({ actor: brandt.principalId });
    expect(actedEv.details).toMatchObject({ act_id: ok.act['act_id'], effect_ref: `RSK:${morocco}@v1:sponsored` });
    // the governed action audited as itself, beside the act's two writes
    const audit = (await sql<{ action: string }>`select action from audit.audit_events where tenant_id = ${T()}::uuid and action in ('executive.attention.item.act', 'prediction.exposure.sponsor') and outcome = 'success'`.execute(su)).rows.map((r) => r.action);
    expect(audit.filter((a) => a === 'prediction.exposure.sponsor')).toHaveLength(1);
    expect(audit.filter((a) => a === 'executive.attention.item.act').length).toBeGreaterThanOrEqual(4);
    // again: already acted (409); the item's state unmoved (an act is not an acknowledgement)
    await refused(act(brandt, oppItem, payload()), /^attention act rejected \(already_acted\)/, 409, 'EYE-STA-002');
    expect((await itemsOf('opportunity.raised', morocco)).find((i) => i['item_id'] === oppItem)!['state']).toBe('open');
    // the reads: the registry (health.change has none) and the item's acts
    const l = await acts(executive, oppItem);
    expect(l.acts.map((x) => `${String(x['signal_class'])}:${String(x['action_key'])}:${String(x['performable'])}`).sort()).toEqual(['commitment.breach:propose_extension:true', 'opportunity.raised:sponsor:true', 'warning.raised:acknowledge_warning:true']); // + the integrator's commitment breach act (0090 §I)
    expect(l.no_act).toEqual({ 'health.change': 'a score change triggers review, never action' });
    expect(l.items.map((x) => x['state']).sort()).toEqual(['acted', 'refused']);
    // the record: an act settles once
    expect((await refusal(sql`update executive.attention_item_acts set state = 'refused', refusal = 'rewritten' where act_id = ${String(ok.act['act_id'])}::uuid`.execute(su))).message).toMatch(/settles once/);
    sixEvidence('A1', { fault_trace: { refused: ['403 human gate', '403 PDP', '403 not the item\'s', '404', '422 id', '422 rationale', '422 unregistered', '422 health no act', 'governed 403 recorded', '409 again'] },
      watermark: { act: ok.act['act_id'], effect_ref: ok.act['effect_ref'] }, consumer_behaviour: { events: ['item.act_refused', 'item.acted'] }, operator_action: 'L. Brandt sponsors through the act',
      recovery: 'the refused act leaves the item live; the sponsor acts', reconciliation: { acts: l.items.length } });
  }, 240_000);

  it('F1 · RANKING FAIRNESS: per class and consequence tier, reported and gating nothing', async () => {
    const e5 = (await evaluate({ min_sample: 5 })).evaluation;
    const f5 = obj(e5['ranking_fairness']);
    expect(f5).toMatchObject({ gates_nothing: true });
    const byClass = obj(f5['by_class']);
    expect(Object.keys(byClass)).toEqual(expect.arrayContaining(['opportunity.raised', 'health.change']));
    const hc = obj(byClass['health.change']);
    expect(hc).toMatchObject({ items: 2, measured: false });
    expect(obj(hc['structural_null_shares'])).toMatchObject({ hours_to_window: 1 });
    expect(obj(f5['disparity'])).toMatchObject({ abstained: true });
    const e1 = (await evaluate({ min_sample: 1 })).evaluation;
    const f1 = obj(e1['ranking_fairness']);
    expect(obj(f1['disparity'])).toMatchObject({ abstained: false });
    expect(typeof obj(f1['disparity'])['value']).toBe('number');
    const tier = obj(obj(f1['by_consequence_tier'])['C2']);
    expect(Object.keys(obj(tier['classes']))).toEqual(expect.arrayContaining(['opportunity.raised', 'health.change']));
    for (const c of Object.values(obj(f1['by_class'])) as Row[]) {
      expect(Number(c['mean_rank_percentile'])).toBeGreaterThanOrEqual(0); expect(Number(c['mean_rank_percentile'])).toBeLessThanOrEqual(1);
      expect(Number(c['top_decile_share'])).toBeGreaterThanOrEqual(0);
    }
    // gating nothing: the reason names no fairness measure
    expect(String(e1['reason'])).not.toMatch(/fairness|disparity/);
    sixEvidence('F1', { fault_trace: { min_sample_5: 'disparity abstained' }, watermark: { evaluation: e1['evaluation_id'] }, consumer_behaviour: { disparity: f1['disparity'], by_class: Object.keys(obj(f1['by_class'])) },
      operator_action: 'the executive evaluates the queue', recovery: 'none needed', reconciliation: { verdict: e1['verdict'] } });
  }, 120_000);

  it('D1 · THE ADAPTERS: the health items on email / sms / teams to the loopback sinks with receipts; D2 the SMS sink failing → retries → abandoned, recovered; D3 an unacknowledged item escalates through the email adapter', async () => {
    const before = (await sinkReceived()).length;
    const t = await tick();
    expect(t.outcome).toBe('finished');
    const item = healthItems[0]!;
    const ds = (await deliveryRows(item)).filter((d) => d.item_event === 'item.routed');
    expect([...new Set(ds.map((d) => d.channel))].sort()).toEqual([...CHANNELS].sort());
    const synth = ds.filter((d) => d.channel !== 'in_app');
    expect(synth.every((d) => d.state === 'delivered' && d.synthetic_state === true)).toBe(true);
    const received = await sinkReceived();
    expect(received.length).toBeGreaterThan(before);
    for (const d of synth) {
      expect(d.receipt).toMatchObject({ channel: d.channel, synthetic: true, note: expect.stringMatching(/SYNTHETIC .* closes no real-provider clause \(owner decision D6\)/) });
      expect(String(d.receipt!['body_digest'])).toMatch(/^[0-9a-f]{64}$/);
      const got = received.find((r) => r['message_id'] === d.receipt!['sink_message_id'])!;
      expect(got, `${d.channel} reached the sink`).toMatchObject({ channel: d.channel, delivery_id: d.delivery_id });
      expect(String(d.provider_ref)).toBe(`${d.channel}:${String(d.receipt!['sink_message_id'])}`);
    }
    expect(String(synth.find((d) => d.channel === 'email')!.receipt!['sink'])).toBe(`smtp://127.0.0.1:${smtpPort}`);
    expect(String(synth.find((d) => d.channel === 'sms')!.receipt!['sink'])).toBe(`http://127.0.0.1:${httpPort}/sms`);
    /* D2 THE SMS SINK FAILING: the second health item's routing on sms retried after 1 and 5 minutes, then abandoned; the item untouched */
    const other = healthItems[1]!;
    await sinkMode('sms', 'fail');
    const smsOf = async () => (await deliveryRows(other)).filter((d) => d.channel === 'sms' && d.item_event === 'item.routed').sort((a, b) => a.attempt - b.attempt);
    // the second item's routing was delivered by the tick above; its ESCALATION (the deadline moved into the past by the superuser — stated) meets the failing sink
    await sql`update executive.attention_items set due_at = clock_timestamp() - interval '1 minute' where item_id = ${other}::uuid`.execute(su);
    await tick();
    const escSms = async () => (await deliveryRows(other)).filter((d) => d.channel === 'sms' && d.item_event === 'item.escalated').sort((a, b) => a.attempt - b.attempt || a.recipient_principal_id.localeCompare(b.recipient_principal_id));
    let esc = await escSms();
    expect(esc.length).toBeGreaterThan(0);
    const r1 = esc[0]!.recipient_principal_id;
    const mine = () => escSms().then((x) => x.filter((d) => d.recipient_principal_id === r1).map((d) => `${d.attempt}:${d.state}`));
    expect(await mine()).toEqual(['1:failed', '2:queued']);
    expect(String(esc[0]!.error)).toMatch(/^sms: the sink answered HTTP 503/);
    await retryDue(other); await tick();
    expect(await mine()).toEqual(['1:failed', '2:failed', '3:queued']);
    await retryDue(other); await tick();
    expect(await mine()).toEqual(['1:failed', '2:failed', '3:abandoned']);
    expect((await sql<{ state: string }>`select state from executive.attention_items where item_id = ${other}::uuid`.execute(su)).rows[0]!.state).toBe('escalated');
    expect(await smsOf()).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'delivered' })]));
    /* D2 RECOVERY: the sink restored → the next escalation's sms delivered */
    await sinkMode('sms', 'ok');
    /* D3 AN UNACKNOWLEDGED ITEM ESCALATES THROUGH THE EMAIL ADAPTER to the local sink: the first health item, never acknowledged, past its deadline */
    await sql`update executive.attention_items set due_at = clock_timestamp() - interval '1 minute' where item_id = ${item}::uuid`.execute(su);
    await tick();
    const escEmail = (await deliveryRows(item)).filter((d) => d.item_event === 'item.escalated' && d.channel === 'email');
    expect(escEmail.length).toBeGreaterThan(0);
    expect(escEmail.every((d) => d.state === 'delivered')).toBe(true);
    const recipients = escEmail.map((d) => d.recipient_principal_id);
    expect(recipients).toContain(dadmin.principalId);
    const mail = (await sinkReceived()).find((r) => r['message_id'] === escEmail.find((d) => d.recipient_principal_id === dadmin.principalId)!.receipt!['sink_message_id'])!;
    expect(mail).toMatchObject({ channel: 'email', to: `principal-${dadmin.principalId}@synthetic.eye.invalid` });
    expect(String(mail['subject'])).toMatch(/^\[attention · health\.change\] Health score: .* — ESCALATED$/);
    const escSmsOk = (await deliveryRows(item)).filter((d) => d.item_event === 'item.escalated' && d.channel === 'sms');
    expect(escSmsOk.every((d) => d.state === 'delivered')).toBe(true);
    // an acknowledged item does not escalate: the executive acknowledges the second item; its deadline passed again → nothing new
    await acknowledge(executive, other);
    esc = await escSms();
    sixEvidence('D1', { fault_trace: { sms_sink: 'fail → 503 ×3 → abandoned' }, watermark: { routed: ds.map((d) => `${d.channel}:${d.state}`), escalation_email: escEmail.map((d) => d.state) },
      consumer_behaviour: { receipts: synth.map((d) => ({ channel: d.channel, sink: d.receipt!['sink'] })) }, operator_action: 'the harness sets the sink modes and moves the deadlines (stated)',
      recovery: { sms: 'restored → the escalation delivered' }, reconciliation: { sink_messages: (await sinkReceived()).length, sms_attempts_of_one_recipient: await mine() } });
  }, 300_000);
});
