/**
 * CP-6 B36 (migration 0094 §A, part `attention`; F-P6-07 COMPLETES — V8 PR-44-005, CAP-EO-06; V9 UX-44-002, UX-44-005; V01-T-028) — on a
 * real database and the real controllers (the Phase4Harness precedent, the world of `bootDecisionWorld`, B36's own humans with sessions of
 * their own), the attention agent registered and ticked by hand (no Redis: the timer's tickNow), the SYNTHETIC sms adapter against a LOCAL
 * SINK process on loopback (scripts/attention/local-sinks.mjs — no real provider; owner decision D6), the executive signing key GENERATED
 * here and bound in the process (EYE_EXECUTIVE_SIGNING_KEY_DEMO) before the boot. Per clause a POSITIVE, a REFUSAL and a RECOVERY case.
 * EVERY FIGURE IS SYNTHETIC.
 *
 *   C1 · THE CONTEXT ON THE QUEUE (o4): the default context (no row) — the horizon filters, unknown linkage served and said; L. Brandt's
 *        executive context (PLANTED — the switcher is §H's) narrows to the objective and 30 days: the items outside are FILTERED and COUNTED,
 *        never dropped; an effective instant filters what came after it; a context change changes the digest the ranking names; a roleless
 *        read refused (403).
 *   A1 · ACCEPT-PRIORITY (o1): an agent refused at the gate (403); a person who is not the item's accountable person refused by the port
 *        (403); L. Brandt accepts — the digest of the evaluation, the consequence preview, the SIGNATURE (kind queue_transition) verified
 *        against the bound key, item.priority_accepted; twice (409); unknown item (404); RECOVERY — with no signing key bound the act is
 *        refused (409 unbound) and NOTHING is recorded; the key restored, the act stands.
 *   R1 · THE RESUME (n): the SYNTHETIC settle fault armed (the fixture route); L. Brandt's acknowledge_warning act — its governed action
 *        COMMITS (the warning acknowledged, one audit row), the settle fails → settle_failed with the failure and the receipt; a second act
 *        in flight refused (409); a resume by the wrong person refused (403); the executive operator resumes → acted from the audit chain,
 *        re_executed false, the target's audit sequence UNCHANGED, item.acted (resumed) and item.act_resumed; again (409); unknown (404);
 *        an act whose action did not commit (a refused act; a planted launched act) refused (409 state).
 *   RC · THE RECOVERY ROUTES (o3): tick_stalled (no tick yet) → re-tick by the executive operator → recovered; delivery_sink_down (the sms
 *        sink failing: attempts 1–3 abandoned) → the sink restored → re-deliver re-queues (attempt 4/4) → the tick delivers; evaluation_stale
 *        → re-evaluate by the operator refused at the evaluation's own PDP (403) → by the executive → recovered; policy_invalid (a PLANTED
 *        active version naming a role that does not exist) → re-validate → still_degraded → the executive publishes the next version →
 *        re-validate → recovered; the hold state's route refused (422 route); an unknown state (422); an analyst (403).
 *   H1 · THE HOLD (o2; PR-44-005): the governance fields validated (422 ×4); the policy with fairness_floor 0.7; a SYNTHETIC SKEW (three C4
 *        items of one class, three C1 items of another) → the evaluation HOLDS the queue (fairness below the floor) and routes a
 *        queue.governance item to the executive; a held queue is READ-ONLY (acknowledge 409, accept-priority 409); evaluated again: already
 *        held; the release — short reason 422, unknown 404, the executive releases (a recovery route row), again 409; the transitions serve
 *        again; the staleness cause (ceiling 24 h, an item 100 h old) holds and is released.
 *   F1 · FORUMS (o5): the executive operator convenes two forums (an objective's and the whole domain's); TWO FORUMS SEE ONE ITEM AND ONE
 *        ACCEPTANCE (the same acceptance id); a non-member refused (403); an agent (403); an unknown member (422); an unknown forum (404).
 *
 * EACH CASE LOGS ONE `B36 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { AttentionB36Controller } from '../../src/executive/attention/attention-b36.controller.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// THE SIGNING KEY: generated here, bound in the process before the boot (a one-line base64 of the PKCS8 DER — the signer's discipline).
const KEY = generateKeyPairSync('ed25519');
const KEY_B64 = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY_B64;
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const SINKS = resolvePath(__dirname, '../../../../scripts/attention/local-sinks.mjs');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let exec: ExecutiveController; let b36: AttentionB36Controller; let timer: AttentionTimerService; let signer: SignatureService;
let tenantAdmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let brandt: AuthenticatedPrincipal; let stratOnly: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal; let decisionOnly: AuthenticatedPrincipal;
let sinks: ChildProcess | null = null; let httpPort = 0;
let agentId = '';
let policy: { policy_id: string; version: number } = { policy_id: '', version: 0 };
/** What the cases leave one another. */
let warningA = ''; let I1 = ''; let I2 = ''; let I3 = ''; let I4 = ''; let I6 = ''; let acceptanceId = ''; let failedActId = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  console.log(`B36 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const asAgent = (p: AuthenticatedPrincipal): AuthenticatedPrincipal => ({ ...p, kind: 'agent' } as AuthenticatedPrincipal);

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'executive');
const publish = (rules: unknown, reason: string, as = executive) => exec.publishAttentionPolicy(E(as, 'executive.attention.policy.publish', 'ATP', null), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const act = (as: AuthenticatedPrincipal, itemId: string, payload: Row) => exec.actOnAttentionItem(E(as, 'executive.attention.item.act', 'ATI', itemId), T(), D(), itemId, { payload }) as unknown as Promise<{ act: Row; receipts: Row; settle?: Row; note?: string; effect_ref?: string }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string) => exec.acknowledgeAttentionItem(E(as, 'executive.attention.item.acknowledge', 'ATI', itemId), T(), D(), itemId, { payload: { note: 'seen (B36 harness)' } }) as unknown as Promise<{ item: Row }>;
const evaluate = (payload: Row, as = executive) => exec.evaluateAttentionQueue(E(as, 'executive.attention.queue.evaluate', 'ATE', null), T(), D(), { payload }) as unknown as Promise<{ evaluation: Row; governance: Row }>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string } }>;
const queue = (as: AuthenticatedPrincipal, limit = 500) => b36.queue(E(as, 'executive.attention.queue.read', 'ATI', null), T(), D(), { payload: { limit } }) as unknown as Promise<Row>;
const accept = (as: AuthenticatedPrincipal, itemId: string, note?: string) => b36.acceptPriority(E(as, 'executive.attention.item.accept_priority', 'ATI', itemId), T(), D(), itemId, { payload: note === undefined ? {} : { note } }) as unknown as Promise<{ acceptance: Row; signature: Row; receipt: Row }>;
const acceptanceOf = (as: AuthenticatedPrincipal, itemId: string) => b36.acceptance(E(as, 'executive.attention.queue.read', 'ATI', itemId), T(), D(), itemId) as unknown as Promise<{ acceptance: Row | null; signatures: Row[]; acts: Row[]; resumptions: Row[]; signing: Row }>;
const resume = (as: AuthenticatedPrincipal, actId: string) => b36.resume(E(as, 'executive.attention.item.act.resume', 'ATI', actId), T(), D(), actId) as unknown as Promise<{ act: Row; resumption: Row; re_executed: boolean }>;
const arm = (as = dadmin) => b36.armFixture(E(as, 'executive.attention.fixture.arm', 'ATI', null), T(), D(), { payload: { fixture: 'settle_fault' } }) as unknown as Promise<{ fixture: Row }>;
const states = (as = operator) => b36.degradedStates(E(as, 'executive.attention.queue.read', 'ATR', null), T(), D()) as unknown as Promise<{ states: Row[]; degraded: number; routes: Row[]; fixtures: Row }>;
const stateOf = async (name: string, as = operator): Promise<Row> => (await states(as)).states.find((s) => s['state'] === name)!;
const recover = (as: AuthenticatedPrincipal, state: string, note?: string) => b36.recover(E(as, 'executive.attention.queue.recover', 'ATR', null), T(), D(), { payload: note === undefined ? { state } : { state, note } }) as unknown as Promise<{ recovery: Row; mechanics: Row }>;
const release = (as: AuthenticatedPrincipal, holdId: string, reason: string) => b36.release(E(as, 'executive.attention.queue.release', 'ATH', holdId), T(), D(), holdId, { payload: { reason } }) as unknown as Promise<{ hold: Row }>;
const holds = (as = executive) => b36.holds(E(as, 'executive.attention.queue.read', 'ATH', null), T(), D(), { payload: {} }) as unknown as Promise<{ holds: Row[] }>;
const convene = (as: AuthenticatedPrincipal, payload: Row) => b36.convene(E(as, 'executive.forum.convene', 'ROOM', null), T(), D(), { payload }) as unknown as Promise<{ forum: Row }>;
const forums = (as = operator) => b36.forums(E(as, 'executive.attention.queue.read', 'ROOM', null), T(), D()) as unknown as Promise<{ forums: Row[] }>;
const forumQueue = (as: AuthenticatedPrincipal, roomId: string) => b36.forumQueue(E(as, 'executive.attention.queue.read', 'ROOM', roomId), T(), D(), roomId, { payload: {} }) as unknown as Promise<Row>;

/* ───────────── the rows ───────────── */
const itemEvents = async (itemId: string) => (await sql<{ event: string; actor: string; details: Row }>`select event, actor_principal_id::text actor, details from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const actRow = async (actId: string) => (await sql<Row>`select act_id::text, state, effect_ref, effect, refusal, settle_failure, action_receipt, resumed_by::text, resumed_at, settled_at from executive.attention_item_acts where act_id = ${actId}::uuid`.execute(su)).rows[0]!;
const auditCount = async (action: string, targetId: string) => Number((await sql<{ n: string }>`select count(*) n from audit.audit_events where tenant_id = ${T()}::uuid and action = ${action} and outcome = 'success' and event ->> 'target_id' = ${targetId}`.execute(su)).rows[0]!.n);
const dbNow = async (): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t.toISOString();
const dbAgo = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(su)).rows[0]!.t.toISOString();
const evalDigest = async (itemId: string) => (await sql<{ d: string }>`select encode(digest(evaluation::text, 'sha256'), 'hex') d from executive.attention_items where item_id = ${itemId}::uuid`.execute(su)).rows[0]!.d;
type Delivery = { delivery_id: string; item_id: string; channel: string; attempt: number; max_attempts: number; state: string; error: string | null };
const deliveries = async (channel: string) => (await sql<Delivery>`select delivery_id::text, item_id::text, channel, attempt, max_attempts, state, error from executive.attention_deliveries where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and channel = ${channel} order by created_at, attempt`.execute(su)).rows;
const retryDue = async () => { await sql`update executive.attention_deliveries set next_attempt_at = clock_timestamp() - interval '1 second' where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'queued'`.execute(su); };
const sinkMode = async (channel: string, mode: 'ok' | 'fail') => { await fetch(`http://127.0.0.1:${httpPort}/_control`, { method: 'POST', body: JSON.stringify({ channel, mode }) }); };
let slot = 0;
const tick = () => timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2034, 0, 1) + (slot++) * 60_000) });

/**
 * An item PLANTED in the queue (stated): the row under the active policy version with its evaluation (the dimensions carry the consequence and,
 * when given, the hours to the window and the objective ids the context reads), its first queue event as 0083 records a routing.
 */
async function plantItem(o: { cls?: string; subjectKind?: string; subjectId?: string; owner?: string | null; roles?: string[]; consequence?: string; hoursToWindow?: number | null; objectiveIds?: string[]; title?: string; createdAgo?: string; dueMinutes?: number }): Promise<string> {
  const id = uuidv7(); const cls = o.cls ?? 'warning.raised'; const owner = o.owner === undefined ? brandt.principalId : o.owner; const roles = o.roles ?? ['strategy_owner'];
  const dims: Row = { consequence: o.consequence ?? 'C2', confidence: 0.9 };
  if (o.hoursToWindow !== undefined && o.hoursToWindow !== null) dims['hours_to_window'] = o.hoursToWindow;
  const evaluation = { outcome: 'material', reasons: [`planted by the B36 attention harness (${cls})`], dimensions: dims, thresholds: null, policy_version: policy.version,
                       rank: { explanation: `consequence ${String(dims['consequence'])}: planted rank (B36 harness)` } };
  const details: Row = { planted: 'b36-attention' }; if (o.objectiveIds !== undefined) details['objective_ids'] = o.objectiveIds;
  const created = o.createdAgo === undefined ? await dbNow() : await dbAgo(o.createdAgo);
  const due = (await sql<{ t: Date }>`select ${created}::timestamptz + make_interval(mins => ${o.dueMinutes ?? 60}::int) t`.execute(su)).rows[0]!.t;
  await sql`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, created_at, updated_at, correlation_id)
            values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${cls}, ${o.subjectKind ?? 'warning'}, ${o.subjectId ?? uuidv7()}::uuid, ${uuidv7()}::uuid, 'EarlyWarningRaised', ${o.title ?? `B36 item (${cls}, ${String(dims['consequence'])})`}, 'material', 'open',
                    ${owner}::uuid, ${roles}::text[], ${policy.policy_id}::uuid, ${policy.version}, ${JSON.stringify(evaluation)}::jsonb, ${JSON.stringify(details)}::jsonb, ${due}, 0, ${created}::timestamptz, ${created}::timestamptz, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, occurred_at, correlation_id)
            values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'item.routed', ${executive.principalId}::uuid, ${JSON.stringify({ outcome: 'material', reasons: evaluation.reasons, policy_version: policy.version, owner, route_roles: roles, due_at: due.toISOString(), planted: true })}::jsonb, ${created}::timestamptz, ${uuidv7()}::uuid)`.execute(su);
  return id;
}
/** A CONTEXT PLANTED for a principal (stated: the switcher is §H's route on §0's port) — the prior one superseded, the digest as set_context computes it. */
async function plantContext(principal: string, c: { objective: string | null; horizon: string; scenario: string | null; classification: string; effectiveAt: string | null }): Promise<string> {
  const id = uuidv7();
  await sql`update executive.contexts set superseded_at = clock_timestamp() where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and principal_id = ${principal}::uuid and superseded_at is null`.execute(su);
  await sql`insert into executive.contexts (context_id, scope, tenant_id, domain_id, principal_id, objective_id, horizon, scenario_id, classification, effective_at, digest, correlation_id)
            values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${principal}::uuid, ${c.objective}::uuid, ${c.horizon}, ${c.scenario}::uuid, ${c.classification}, ${c.effectiveAt}::timestamptz,
                    encode(digest(concat_ws('|', ${T()}::text, ${D()}::text, coalesce(${c.objective}::text, ''), ${c.horizon}::text, coalesce(${c.scenario}::text, ''), ${c.classification}::text, coalesce(${c.effectiveAt}::timestamptz::text, '')), 'sha256'), 'hex'), ${uuidv7()}::uuid)`.execute(su);
  return (await sql<{ d: string }>`select digest d from executive.contexts where context_id = ${id}::uuid`.execute(su)).rows[0]!.d;
}
const RULES = (governance?: Row): Row => ({
  classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 1, notify: { channels: ['in_app', 'sms'], max_attempts: 3 } },
    'opportunity.raised': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['opportunity_sponsor', 'strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, notify: 'in_app' },
    'source.coverage_loss': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' },
    'proposal.review': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' },
    'queue.governance': { materiality: { min_consequence: 'C3', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 1440, notify: 'in_app' },
  },
  ...(governance === undefined ? {} : { governance }),
});

beforeAll(async () => {
  sinks = spawn(process.execPath, [SINKS, '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  await new Promise<void>((resolve, reject) => { sinks!.stdout!.on('data', (c: Buffer) => { out += c.toString(); if (out.includes('ready')) resolve(); }); sinks!.once('exit', () => reject(new Error(`the sinks exited: ${out}`))); });
  httpPort = Number(/http (\d+)/.exec(out)![1]);
  process.env['EYE_ATTENTION_SINK_HOST'] = '127.0.0.1';
  process.env['EYE_ATTENTION_SMTP_PORT'] = String(Number(/smtp (\d+)/.exec(out)![1]));
  process.env['EYE_ATTENTION_SMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/sms`;
  process.env['EYE_ATTENTION_TEAMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/teams`;
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { AttentionB36Controller: Bc } = await import('../../src/executive/attention/attention-b36.controller.js');
  exec = h.app.get(Ec); b36 = h.app.get(Bc); timer = h.app.get(AttentionTimerService); signer = h.app.get(SignatureService);
  expect(signer.bound()).toBe(true);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36a-tenant-admin', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b36a-executive');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36a-domain-admin');
  operator = await h.humanWithSession(['executive_operator'], 'b36a-chief-of-staff');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36a-analyst');
  brandt = await h.humanWithSession(['opportunity_sponsor', 'strategy_owner', 'decision_owner'], 'b36a-l-brandt');
  stratOnly = await h.humanWithSession(['strategy_owner'], 'b36a-strategy-owner');
  decisionOnly = await h.humanWithSession(['decision_owner'], 'b36a-decision-owner');
  roleless = await h.principalWith([], 'b36a-roleless');
  w = await bootDecisionWorld(h);
  // THE ATTENTION AGENT (the deliveries plan from its registration on; ticked by hand — no Redis timer)
  agentId = (await registerAgent({ kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } })).agent.agentId;
  // THE POLICY v1 (no governance fields: the evaluation reports, gating nothing — 0090's behaviour)
  const p = (await publish(RULES(), 'the B36 classes; the warning on in_app + the SYNTHETIC sms sink (B36 harness)')).policy;
  policy = { policy_id: String(p['policy_id']), version: Number(p['version']) };
  // A REAL WARNING (the corridor scenario's downside branch on the transit indicator): the act's governed action acknowledges it
  const ev = (await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId, 'prediction'), T(), D(), w.indicatorId, { payload: { knownAt: await dbNow() } })) as unknown as { warnings: Array<{ warningId: string }> };
  expect(ev.warnings.length).toBeGreaterThanOrEqual(1);
  warningA = ev.warnings[0]!.warningId;
}, 600_000);

afterAll(async () => {
  await h?.close();
  sinks?.kill();
}, 120_000);

describe('B36 · the attention completion (0094 §A; F-P6-07 completes)', () => {
  it('C1 · THE CONTEXT ON THE QUEUE (o4): the default context; L. Brandt\'s context filters and counts, never drops; an effective instant; the digest the ranking names; a roleless read refused', async () => {
    I1 = await plantItem({ subjectId: warningA, title: 'B36 corridor warning (the act\'s item)', hoursToWindow: 24 });
    I2 = await plantItem({ cls: 'opportunity.raised', subjectKind: 'exposure', consequence: 'C3', objectiveIds: [w.objectiveId], roles: ['opportunity_sponsor', 'strategy_owner'], title: 'B36 opportunity inside the objective', hoursToWindow: 100 });
    I3 = await plantItem({ cls: 'opportunity.raised', subjectKind: 'exposure', consequence: 'C1', objectiveIds: [uuidv7()], roles: ['opportunity_sponsor', 'strategy_owner'], title: 'B36 opportunity outside the objective', hoursToWindow: 100 });
    I4 = await plantItem({ title: 'B36 warning far beyond the horizon', hoursToWindow: 5000 });
    // THE DEFAULT (no context set): the whole domain, 90d — I4's window (5000 h) is beyond 2160 h: filtered by horizon and COUNTED; unknown linkage served and said
    const q0 = await queue(brandt);
    expect(obj(q0['context'])).toMatchObject({ source: 'default', horizon: '90d', objective_id: null, digest: null });
    expect(obj(q0['policy'])).toMatchObject({ version: policy.version });
    expect(obj(q0['policy'])['governance']).toBeNull();
    expect(q0['hold']).toBeNull();
    const c0 = obj(q0['counts']);
    expect(obj(c0['by'])).toMatchObject({ objective: 0, horizon: 1, effective_at: 0 });
    expect(arr(q0['filtered']).map((f) => f['item_id'])).toEqual([I4]);
    const served0 = arr(q0['items']);
    expect(served0.map((i) => i['item_id']).sort()).toEqual([I1, I2, I3].sort());
    expect(served0.find((i) => i['item_id'] === I1)).toMatchObject({ linkage: 'unknown' });
    expect(served0.find((i) => i['item_id'] === I2)).toMatchObject({ linkage: 'known', objectives: [w.objectiveId] });
    expect(served0[0]).toMatchObject({ item_id: I2, rank_position: 1 }); // C3 ranks first
    expect(obj(q0['ranking'])).toMatchObject({ context_digest: null, horizon_hours: 2160 });
    // L. BRANDT'S CONTEXT: the objective and 30 days → I3 (another objective) and I4 (beyond 720 h) filtered and counted; I1's linkage unknown → served, said
    const d1 = await plantContext(brandt.principalId, { objective: w.objectiveId, horizon: '30d', scenario: null, classification: 'internal', effectiveAt: null });
    const q1 = await queue(brandt);
    expect(obj(q1['context'])).toMatchObject({ source: 'executive.contexts', objective_id: w.objectiveId, horizon: '30d', digest: d1 });
    expect(obj(obj(q1['counts'])['by'])).toMatchObject({ objective: 1, horizon: 1, effective_at: 0 });
    expect(arr(q1['filtered']).map((f) => `${String(f['item_id'])}:${(f['filtered_by'] as string[]).join('+')}`).sort()).toEqual([`${I3}:objective`, `${I4}:horizon`].sort());
    expect(arr(q1['items']).map((i) => `${String(i['item_id'])}:${String(i['linkage'])}`).sort()).toEqual([`${I1}:unknown`, `${I2}:in context`].sort());
    expect(obj(q1['ranking'])['context_digest']).toBe(d1);
    // AN EFFECTIVE INSTANT an hour ago: every item (created now) is after it → filtered by effective_at, counted; nothing served
    const d2 = await plantContext(brandt.principalId, { objective: null, horizon: '36m', scenario: null, classification: 'internal', effectiveAt: await dbAgo('1 hour') });
    const q2 = await queue(brandt);
    expect(obj(obj(q2['counts'])['by'])).toMatchObject({ effective_at: 4, objective: 0, horizon: 0 });
    expect(arr(q2['items'])).toEqual([]);
    expect(obj(q2['ranking'])['context_digest']).toBe(d2);
    expect(d2).not.toBe(d1);
    // the context the rest of the run reads under: the objective, 90 days, effective now
    const d3 = await plantContext(brandt.principalId, { objective: w.objectiveId, horizon: '90d', scenario: null, classification: 'internal', effectiveAt: null });
    expect(obj((await queue(brandt))['ranking'])['context_digest']).toBe(d3);
    // the executive reads under HIS context (none → the default): the same items, his own filtering
    expect(obj((await queue(executive))['context'])).toMatchObject({ source: 'default' });
    // REFUSED: a roleless principal at the PDP
    expect((await refusal(queue(roleless))).status).toBe(403);
    sixEvidence('C1', { fault_trace: { refused: ['403 roleless'] }, watermark: { digests: [d1, d2, d3] }, consumer_behaviour: { default: obj(q0['counts']), objective_30d: obj(q1['counts']), effective_1h_ago: obj(q2['counts']) },
      operator_action: 'the context PLANTED (the switcher is §H\'s)', recovery: 'the default context when none is set', reconciliation: { items: 4 } });
  }, 120_000);

  it('A1 · ACCEPT-PRIORITY (o1): an agent refused at the gate; not the accountable person refused by the port; L. Brandt accepts — the digest, the consequence, the SIGNATURE; twice; unknown; no key bound → refused, nothing recorded', async () => {
    await refused(accept(asAgent(brandt), I1), /human gate: executive\.attention\.item\.accept_priority requires a named human principal/, 403, 'EYE-WFL-002');
    await refused(accept(analyst, I1), /^priority acceptance rejected \(accountable\): item .* is accountable to its owner/, 403, 'EYE-AUT-001');
    await refused(accept(brandt, uuidv7()), /^priority acceptance rejected \(unknown_item\)/, 404, 'EYE-STA-001');
    // RECOVERY FIRST: with no signing key bound the whole act is REFUSED (409 unbound) — never silently unsigned; nothing recorded
    const bound = process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO']!;
    process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = '';
    await refused(accept(brandt, I1), /^signature rejected \(unbound\): this deployment binds no executive signing key/, 409, 'EYE-STA-002');
    expect((await acceptanceOf(brandt, I1)).acceptance).toBeNull();
    process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = bound;
    // L. BRANDT ACCEPTS the corridor item's priority: the digest of its evaluation, the consequence preview, the signature in the same write
    const a = await accept(brandt, I1, 'I take the corridor warning (B36 harness)');
    acceptanceId = String(a.acceptance['acceptance_id']);
    expect(a.acceptance).toMatchObject({ item_id: I1, accepted_by: brandt.principalId, evaluation_digest: await evalDigest(I1), note: 'I take the corridor warning (B36 harness)' });
    const conseq = obj(a.acceptance['consequence']);
    expect(String(conseq['commits_to'])).toMatch(/^the accountable person answers for item .* within its response window .*: acknowledges, acts on or disposes it before the deadline; an overdue item escalates to executive/);
    expect(obj(conseq['response_window'])['due_at']).toBeTruthy();
    expect(obj(conseq['escalation'])).toMatchObject({ roles: ['executive'], max_escalations: 1, so_far: 0 });
    expect(String(conseq['rank'])).toMatch(/^consequence C2/);
    expect(a.signature).toMatchObject({ subject_kind: 'queue_transition', subject_id: acceptanceId, subject_version: 1, subject_digest: a.acceptance['evaluation_digest'], signer: brandt.principalId, key_id: signer.publicKey()!.keyId });
    const read = await acceptanceOf(executive, I1);
    expect(read.signatures).toHaveLength(1);
    expect(read.signatures[0]).toMatchObject({ signer: brandt.principalId, bound_action: 'executive.attention.item.accept_priority', algorithm: 'Ed25519', verified: true });
    expect(signer.verify(read.signatures[0] as never)).toBe(true);
    expect(signer.verify({ ...(read.signatures[0] as never), subject_digest: 'f'.repeat(64) } as never)).toBe(false);
    const ev = (await itemEvents(I1)).find((e) => e.event === 'item.priority_accepted')!;
    expect(ev).toMatchObject({ actor: brandt.principalId });
    expect(ev.details).toMatchObject({ acceptance_id: acceptanceId, evaluation_digest: a.acceptance['evaluation_digest'] });
    // the queue serves the acceptance on the item
    expect(obj(arr((await queue(brandt))['items']).find((i) => i['item_id'] === I1)!['priority_accepted'])).toMatchObject({ acceptance_id: acceptanceId, accepted_by: brandt.principalId });
    // twice: 409
    await refused(accept(brandt, I1), /^priority acceptance rejected \(state\): the priority of item .* was accepted by/, 409, 'EYE-STA-002');
    // the record is append-only
    expect((await refusal(sql`update executive.attention_priority_acceptances set note = 'rewritten' where acceptance_id = ${acceptanceId}::uuid`.execute(su))).message).toMatch(/append-only|prohibited/i);
    sixEvidence('A1', { fault_trace: { refused: ['403 gate', '403 accountable', '404', '409 unbound key (nothing recorded)', '409 twice'] }, watermark: { acceptance: acceptanceId, digest: a.acceptance['evaluation_digest'], key: signer.publicKey()!.keyId },
      consumer_behaviour: { consequence: conseq['commits_to'], signature_verified: true }, operator_action: 'L. Brandt accepts the priority', recovery: 'the key restored, the act stands', reconciliation: { signatures: read.signatures.length } });
  }, 120_000);

  it('R1 · THE RESUME (n): the synthetic settle fault; the governed action COMMITS and the settle fails → settle_failed; the operator resumes from the audit chain — never re-executed; the refusals', async () => {
    const before = await auditCount('prediction.warning.acknowledge', warningA);
    expect(before).toBe(0);
    // the fixture: an agent refused at the gate; the analyst at the PDP; the domain administrator arms it (audited)
    await refused(arm(asAgent(dadmin)), /human gate: executive\.attention\.fixture\.arm requires a named human principal/, 403, 'EYE-WFL-002');
    expect((await refusal(arm(analyst))).status).toBe(403);
    expect((await arm(dadmin)).fixture).toMatchObject({ armed: true, synthetic: true, by: dadmin.principalId });
    expect(obj((await states()).fixtures)['settle_fault']).toMatchObject({ by: dadmin.principalId });
    // L. BRANDT ACTS: launched → the governed action COMMITS (the warning acknowledged, one audit row) → the settle FAILS → settle_failed recorded
    const r = await act(brandt, I1, { action_key: 'acknowledge_warning', rationale: 'the corridor warning is answered for (B36 harness)', params: { note: 'answered by L. Brandt (B36)' } });
    failedActId = String(r.act['act_id']);
    expect(r.act).toMatchObject({ state: 'settle_failed', action_key: 'acknowledge_warning', governed_action: 'prediction.warning.acknowledge', target_id: warningA, launched_by: brandt.principalId });
    expect(obj(r.settle)).toMatchObject({ state: 'failed', recorded: true, record_failure: null });
    expect(String(obj(r.settle)['reason'])).toMatch(/^SYNTHETIC settle fault \(armed by/);
    expect(obj(r.act['settle_failure'])).toMatchObject({ effect_ref: `WRN:${warningA}:acknowledged` });
    expect(obj(r.act['action_receipt'])['auditSeq']).toEqual(expect.any(Number));
    expect(obj((await states()).fixtures)['settle_fault']).toBeNull();
    expect((await sql<{ state: string; by: string }>`select state, acknowledged_by::text by from prediction.warnings_current where warning_id = ${warningA}::uuid`.execute(su)).rows[0]).toEqual({ state: 'acknowledged', by: brandt.principalId });
    expect(await auditCount('prediction.warning.acknowledge', warningA)).toBe(1);
    const failedEv = (await itemEvents(I1)).find((e) => e.event === 'item.settle_failed')!;
    expect(failedEv.details).toMatchObject({ act_id: failedActId, effect_ref: `WRN:${warningA}:acknowledged` });
    // a repeat of the act id performs nothing; a NEW act on the item is refused: one act in flight (settle_failed counts)
    expect((await act(brandt, I1, { action_key: 'acknowledge_warning', rationale: 'the corridor warning is answered for (B36 harness)', act_id: failedActId })).note).toMatch(/whose settle failed: nothing performed again/);
    await refused(act(brandt, I1, { action_key: 'acknowledge_warning', rationale: 'a second act while one is in flight (B36)' }), /^attention act rejected \(in_flight\)/, 409, 'EYE-STA-002');
    expect(await auditCount('prediction.warning.acknowledge', warningA)).toBe(1);
    // THE RESUME refused: an agent at the gate; the analyst (a domain_analyst passes the PDP; the port: not the launcher, not the operator) 403; unknown 404
    await refused(resume(asAgent(operator), failedActId), /human gate: executive\.attention\.item\.act\.resume requires a named human principal/, 403, 'EYE-WFL-002');
    await refused(resume(analyst, failedActId), /^act resumption rejected \(actor\): act .* is resumed by the member who launched it or by the executive operator/, 403, 'EYE-AUT-001');
    await refused(resume(operator, uuidv7()), /^act resumption rejected \(unknown_act\)/, 404, 'EYE-STA-001');
    // THE EXECUTIVE OPERATOR RESUMES: the settle re-run from the audit chain's record — acted; the governed action NOT performed again
    const res = await resume(operator, failedActId);
    expect(res.re_executed).toBe(false);
    expect(res.act).toMatchObject({ state: 'acted', effect_ref: `WRN:${warningA}:acknowledged`, resumed_by: operator.principalId, launched_by: brandt.principalId });
    expect(obj(res.resumption)).toMatchObject({ from_state: 'settle_failed', re_executed: false });
    expect(obj(obj(res.resumption)['action_receipt'])).toMatchObject({ action: 'prediction.warning.acknowledge', source: 'audit.audit_events', auditSeq: obj(r.act['action_receipt'])['auditSeq'] });
    expect(await auditCount('prediction.warning.acknowledge', warningA)).toBe(1); // the target's audit sequence UNCHANGED
    const row = await actRow(failedActId);
    expect(row).toMatchObject({ state: 'acted', resumed_by: operator.principalId });
    expect(obj(row['effect'])).toMatchObject({ governed_action: 'prediction.warning.acknowledge', resumed: true });
    const evs = await itemEvents(I1);
    expect(evs.filter((e) => e.event === 'item.acted').map((e) => e.details['resumed'])).toEqual([true]);
    const resumedEv = evs.find((e) => e.event === 'item.act_resumed')!;
    expect(resumedEv).toMatchObject({ actor: operator.principalId });
    expect(resumedEv.details).toMatchObject({ act_id: failedActId, from_state: 'settle_failed', re_executed: false });
    expect((await acceptanceOf(operator, I1)).resumptions).toHaveLength(1);
    // again: already acted (409)
    await refused(resume(operator, failedActId), /^act resumption rejected \(state\): act .* is already acted/, 409, 'EYE-STA-002');
    // AN ACT WHOSE ACTION DID NOT COMMIT: the item's owner may act on it (decision_owner) but may not acknowledge a warning at the governed
    // action's OWN PDP → the governed action refused (403), the act recorded refused → a resume refused (state)
    I6 = await plantItem({ subjectId: warningA, owner: decisionOnly.principalId, roles: ['decision_owner'], title: 'B36 item whose owner cannot acknowledge the warning' });
    const rr = await refusal(act(decisionOnly, I6, { action_key: 'acknowledge_warning', rationale: 'acknowledge the corridor warning without the right (B36)' }));
    expect(rr.status).toBe(403);
    expect(rr.message).toMatch(/the act .* was recorded refused/);
    expect(await auditCount('prediction.warning.acknowledge', warningA)).toBe(1);
    const refusedAct = (await sql<{ act_id: string; state: string }>`select act_id::text, state from executive.attention_item_acts where item_id = ${I6}::uuid`.execute(su)).rows[0]!;
    expect(refusedAct.state).toBe('refused');
    await refused(resume(decisionOnly, refusedAct.act_id), /^act resumption rejected \(state\): act .* is already refused/, 409, 'EYE-STA-002');
    // a PLANTED launched act (stated) whose governed action never committed: nothing in the audit chain → refused (state), never settled by a resume
    const planted = uuidv7();
    await sql`insert into executive.attention_item_acts (act_id, scope, tenant_id, domain_id, item_id, signal_class, action_key, governed_action, target_kind, target_id, rationale, launched_by, correlation_id)
              values (${planted}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${I6}::uuid, 'warning.raised', 'acknowledge_warning', 'prediction.warning.acknowledge', 'warning', ${uuidv7()}::uuid, 'planted launched act (B36 harness)', ${brandt.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await refused(resume(operator, planted), /^act resumption rejected \(state\): the governed action prediction\.warning\.acknowledge of act .* did not commit/, 409, 'EYE-STA-002');
    expect((await actRow(planted))['state']).toBe('launched');
    sixEvidence('R1', { fault_trace: { settle: 'SYNTHETIC fault after the commit', refused: ['403 gate', '403 not the launcher/operator', '404', '409 in flight', '409 again', '409 refused act', '409 never committed'] },
      watermark: { act: failedActId, action_audit_seq: obj(r.act['action_receipt'])['auditSeq'] }, consumer_behaviour: { audit_rows_for_the_target: { before_resume: 1, after_resume: 1 }, events: ['item.settle_failed', 'item.acted (resumed)', 'item.act_resumed'] },
      operator_action: 'the chief of staff resumes the settle', recovery: 'the settle re-run from the audit chain; the governed action never re-executed', reconciliation: { resumptions: 1 } });
  }, 180_000);

  it('RC · THE RECOVERY ROUTES (o3): tick_stalled → re-tick; delivery_sink_down → re-deliver; evaluation_stale → re-evaluate (the operator refused at the evaluation\'s PDP; the executive recovers); policy_invalid → re-validate; the refusals', async () => {
    // BEFORE ANY TICK: tick_stalled active (an agent, no tick), evaluation_stale active (no evaluation), the others nominal; the sms sink set to FAIL for the deliveries the first ticks attempt
    await sinkMode('sms', 'fail');
    const s0 = await states();
    const active0 = s0.states.filter((s) => s['active'] === true).map((s) => s['state']).sort();
    expect(active0).toEqual(['evaluation_stale', 'tick_stalled']);
    expect(s0.states.every((s) => typeof s['meaning'] === 'string' && typeof s['route'] === 'string' && typeof s['route_does'] === 'string')).toBe(true);
    // REFUSED: an analyst at the PDP; an unknown state; the hold's route (the release)
    expect((await refusal(recover(analyst, 'tick_stalled'))).status).toBe(403);
    await refused(recover(operator, 'sink_down'), /payload\.state is a degraded state/, 422, 'EYE-REQ-001');
    await refused(recover(operator, 'hold'), /^queue recovery rejected \(route\): the hold's route is the executive's release/, 422, 'EYE-REQ-001');
    // RE-TICK by the chief of staff: the timer reconciled and one tick now (the test runtime) → recovered; the tick's deliveries attempt the failing sms sink
    const rt = await recover(operator, 'tick_stalled', 'the timer has not ticked (B36 harness)');
    expect(obj(rt.mechanics['tick'])).toMatchObject({ outcome: 'finished' });
    expect(rt.recovery).toMatchObject({ degraded_state: 'tick_stalled', route: 're-tick', outcome: 'recovered', run_by: operator.principalId });
    expect(obj(rt.recovery['before'])).toMatchObject({ active: true });
    expect(obj(rt.recovery['after'])).toMatchObject({ active: false });
    expect((await stateOf('tick_stalled'))['active']).toBe(false);
    // DELIVERY_SINK_DOWN: the sms attempts 1..3 fail (1 and 5 minutes apart — the deadlines moved by the harness, stated) → abandoned → the state active
    await retryDue(); await tick(); await retryDue(); await tick();
    const abandoned = (await deliveries('sms')).filter((d) => d.state === 'abandoned');
    expect(abandoned.length).toBeGreaterThan(0);
    expect(abandoned.every((d) => d.attempt === 3 && d.max_attempts === 3 && /HTTP 503/.test(String(d.error)))).toBe(true);
    const sd = await stateOf('delivery_sink_down');
    expect(sd['active']).toBe(true);
    expect(obj(sd['detail'])).toMatchObject({ abandoned: abandoned.length, channels: 'sms' });
    // the sink RESTORED; re-deliver by the executive: the abandoned deliveries re-queued as attempt 4 of 4; the next tick delivers them
    await sinkMode('sms', 'ok');
    const rd = await recover(executive, 'delivery_sink_down', 'the sms sink is back (B36 harness)');
    expect(rd.recovery).toMatchObject({ degraded_state: 'delivery_sink_down', route: 're-deliver', outcome: 'requeued' });
    expect(obj(rd.recovery['after'])).toMatchObject({ requeued: abandoned.length, exhausted: 0 });
    expect((await stateOf('delivery_sink_down'))['active']).toBe(false);
    await tick();
    const fourth = (await deliveries('sms')).filter((d) => d.attempt === 4);
    expect(fourth.length).toBe(abandoned.length);
    expect(fourth.every((d) => d.state === 'delivered' && d.max_attempts === 4)).toBe(true);
    // re-deliver with nothing abandoned: unchanged
    expect((await recover(executive, 'delivery_sink_down')).recovery).toMatchObject({ outcome: 'unchanged' });
    // EVALUATION_STALE: the operator's re-evaluate runs the evaluation under ITS OWN action — refused at its PDP (executive_operator is not an evaluator); the executive recovers
    expect((await refusal(recover(operator, 'evaluation_stale'))).status).toBe(403);
    expect((await stateOf('evaluation_stale'))['active']).toBe(true);
    const re = await recover(executive, 'evaluation_stale', 'the queue has not been evaluated (B36 harness)');
    expect(re.recovery).toMatchObject({ degraded_state: 'evaluation_stale', route: 're-evaluate', outcome: 'recovered' });
    expect(obj(obj(re.mechanics['evaluation'])['governance'])).toMatchObject({ held: false });
    expect((await stateOf('evaluation_stale'))['active']).toBe(false);
    // POLICY_INVALID: a PLANTED active version (stated) naming a role that does not exist → active; re-validate says so (still degraded); the executive publishes the next version → re-validate recovered
    const bad = uuidv7();
    await sql`update executive.attention_policies set state = 'superseded', superseded_at = clock_timestamp() where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'active'`.execute(su);
    const badRules = RULES(); (badRules['classes'] as Row)['warning.raised'] = { ...obj((badRules['classes'] as Row)['warning.raised']), route_roles: ['no_such_role_b36'] };
    await sql`insert into executive.attention_policies (policy_id, scope, tenant_id, domain_id, version, state, rules, rules_digest, supersedes, changed_sections, changed_classes, reason, set_by, correlation_id)
              values (${bad}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${policy.version + 1}, 'active', ${JSON.stringify(badRules)}::jsonb, encode(digest(${JSON.stringify(badRules)}, 'sha256'), 'hex'), ${policy.version}, '{classes}', '{warning.raised}', 'PLANTED invalid version (B36 harness)', ${executive.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const pi = await stateOf('policy_invalid');
    expect(pi['active']).toBe(true);
    expect(String(obj(pi['detail'])['defect'])).toMatch(/names a role that is not a human role of this product/);
    const rv1 = await recover(operator, 'policy_invalid', 're-run the validator on the active version (B36 harness)');
    expect(rv1.recovery).toMatchObject({ route: 're-validate', outcome: 'still_degraded' });
    const next = (await publish(RULES(), 'the corrected version after the planted defect (B36 harness)')).policy;
    policy = { policy_id: String(next['policy_id']), version: Number(next['version']) };
    expect(policy.version).toBe(Number(pi['detail'] === null ? 0 : obj(pi['detail'])['policy_version']) + 1);
    const rv2 = await recover(operator, 'policy_invalid');
    expect(rv2.recovery).toMatchObject({ route: 're-validate', outcome: 'recovered' });
    expect((await stateOf('policy_invalid'))['active']).toBe(false);
    // the ledger: every run recorded with before / after; the last route of each state served
    const all = await states();
    expect(all.routes.map((r) => `${String(r['degraded_state'])}:${String(r['outcome'])}`)).toEqual(expect.arrayContaining(['tick_stalled:recovered', 'delivery_sink_down:requeued', 'delivery_sink_down:unchanged', 'evaluation_stale:recovered', 'policy_invalid:still_degraded', 'policy_invalid:recovered']));
    expect(obj(all.states.find((s) => s['state'] === 'policy_invalid')!['last_route'])).toMatchObject({ outcome: 'recovered' });
    expect(all.degraded).toBe(0);
    sixEvidence('RC', { fault_trace: { fixtures: ['no tick', 'sms sink fail ×3', 'no evaluation', 'planted invalid policy'], refused: ['403 analyst', '422 unknown state', '422 hold route', '403 operator at the evaluation PDP'] },
      watermark: { routes: all.routes.length }, consumer_behaviour: { requeued: abandoned.length, delivered_on_attempt_4: fourth.length }, operator_action: 'the chief of staff re-ticks and re-validates; the executive re-delivers and re-evaluates',
      recovery: 'each state nominal after its route; the policy corrected by a published version', reconciliation: { degraded: all.degraded } });
  }, 300_000);

  it('H1 · THE HOLD (o2; PR-44-005): the governance fields validated; a synthetic skew drives fairness below the floor → held, routed to the executive, read-only; released by the executive; the staleness cause', async () => {
    // THE VALIDATOR: the one change — governance {fairness_floor, staleness_ceiling_hours}
    await refused(publish(RULES({ fairness_floor: 1.5, staleness_ceiling_hours: 168 }), 'a floor above one (B36)'), /governance\.fairness_floor is a number in \[0, 1\]/, 422, 'EYE-REQ-001');
    await refused(publish(RULES({ fairness_floor: 0.7, staleness_ceiling_hours: 0 }), 'a ceiling of zero (B36)'), /governance\.staleness_ceiling_hours is a number in \[1, 8760\]/, 422, 'EYE-REQ-001');
    await refused(publish(RULES({ fairness_floor: 0.7 }), 'a ceiling missing (B36)'), /governance names both fairness_floor and staleness_ceiling_hours/, 422, 'EYE-REQ-001');
    await refused(publish(RULES({ fairness_floor: 0.7, staleness_ceiling_hours: 168, gate: true }), 'an unknown key (B36)'), /governance carries the unknown key gate/, 422, 'EYE-REQ-001');
    const p2 = (await publish(RULES({ fairness_floor: 0.7, staleness_ceiling_hours: 168 }), 'the governance floor and ceiling (B36 harness)')).policy;
    policy = { policy_id: String(p2['policy_id']), version: Number(p2['version']) };
    expect(obj((await queue(executive))['policy'])).toMatchObject({ version: policy.version, governance: { fairness_floor: 0.7, staleness_ceiling_hours: 168 } });
    // THE SYNTHETIC SKEW: three C4 items of one class rank first, three C1 items of another rank last → the disparity between the classes near 1 → fairness below 0.7
    for (let i = 0; i < 3; i++) { await plantItem({ cls: 'source.coverage_loss', subjectKind: 'source', consequence: 'C4', owner: analyst.principalId, roles: ['domain_analyst'], title: `B36 skew C4 #${i}` }); }
    for (let i = 0; i < 3; i++) { await plantItem({ cls: 'proposal.review', subjectKind: 'claim', consequence: 'C1', owner: analyst.principalId, roles: ['domain_analyst'], title: `B36 skew C1 #${i}` }); }
    const e1 = await evaluate({ min_sample: 3 });
    const g1 = e1.governance;
    expect(g1).toMatchObject({ held: true, cause: 'fairness_below_floor', threshold: 0.7, policy_version: policy.version, held_by: executive.principalId });
    expect(Number(g1['measure'])).toBeLessThan(0.7);
    expect(obj(obj(g1['measures'])['fairness'])).toMatchObject({ abstained: false });
    const holdId = String(g1['hold_id']); const govItem = String(g1['governance_item_id']);
    const hold = (await holds()).holds.find((x) => x['hold_id'] === holdId)!;
    expect(hold).toMatchObject({ state: 'held', cause: 'fairness_below_floor', evaluation_id: e1.evaluation['evaluation_id'], governance_item_id: govItem });
    // THE ROUTE TO AUTHORITY: a queue.governance item for the executive, material by construction, C3, open (the executive holds the role)
    const gi = (await sql<Row>`select signal_class, subject_kind, subject_id::text, state, outcome, route_roles, title, evaluation from executive.attention_items where item_id = ${govItem}::uuid`.execute(su)).rows[0]!;
    expect(gi).toMatchObject({ signal_class: 'queue.governance', subject_kind: 'queue', subject_id: holdId, state: 'open', outcome: 'material', route_roles: ['executive'] });
    expect(String(gi['title'])).toMatch(/^Queue held: the ranking fairness .* fell below the policy's floor 0\.7/);
    expect(obj(obj(gi['evaluation'])['dimensions'])).toMatchObject({ consequence: 'C3' });
    // the queue read says HELD; the context strip's data
    expect(obj((await queue(brandt))['hold'])).toMatchObject({ hold_id: holdId, cause: 'fairness_below_floor', read_only: true, governance_item_id: govItem });
    // READ-ONLY: every human transition refused at the item log — acknowledge (0083's port), accept-priority (this section's)
    await refused(acknowledge(brandt, I2), /^queue transition rejected \(held\): the queue is held \(hold .*, fairness_below_floor\) since .*; its items are served read-only until the executive releases the hold/, 409, 'EYE-STA-002');
    await refused(accept(brandt, I2), /^queue transition rejected \(held\)/, 409, 'EYE-STA-002');
    expect((await sql<{ state: string }>`select state from executive.attention_items where item_id = ${I2}::uuid`.execute(su)).rows[0]!.state).toBe('open');
    expect((await sql<{ n: string }>`select count(*) n from executive.attention_priority_acceptances where item_id = ${I2}::uuid`.execute(su)).rows[0]!.n).toBe('0');
    // evaluated again while held: measured, not held twice
    expect((await evaluate({ min_sample: 3 })).governance).toMatchObject({ held: false, reason: 'the queue is already held', hold_id: holdId });
    expect((await stateOf('hold', executive))['active']).toBe(true);
    // THE RELEASE refused: the analyst / the operator at the PDP; an agent at the gate; a short reason; unknown hold
    expect((await refusal(release(analyst, holdId, 'the analyst releases (B36)'))).status).toBe(403);
    expect((await refusal(release(operator, holdId, 'the chief of staff releases (B36)'))).status).toBe(403);
    await refused(release(asAgent(executive), holdId, 'an agent releases (B36)'), /human gate: executive\.attention\.queue\.release requires a named human principal/, 403, 'EYE-WFL-002');
    await refused(release(executive, holdId, 'short'), /payload\.reason says why the hold is released/, 422, 'EYE-REQ-001');
    await refused(release(executive, uuidv7(), 'a hold that does not exist (B36)'), /^queue hold rejected \(unknown_hold\)/, 404, 'EYE-STA-001');
    // THE EXECUTIVE RELEASES with a reason: released, a recovery route row (state hold, route release); the transitions serve again
    const rel = await release(executive, holdId, 'the skew is a harness fixture; the ranking reviewed (B36 harness)');
    expect(rel.hold).toMatchObject({ hold_id: holdId, state: 'released', released_by: executive.principalId, release_reason: 'the skew is a harness fixture; the ranking reviewed (B36 harness)' });
    expect(obj((await states(executive)).states.find((s) => s['state'] === 'hold')!['last_route'])).toMatchObject({ route: 'release', outcome: 'recovered', run_by: executive.principalId });
    expect((await queue(brandt))['hold']).toBeNull();
    expect((await acknowledge(brandt, I2)).item).toMatchObject({ state: 'acknowledged' });
    await refused(release(executive, holdId, 'released once more (B36)'), /^queue hold rejected \(state\): hold .* was released by/, 409, 'EYE-STA-002');
    expect((await refusal(sql`update executive.attention_queue_holds set cause = 'staleness_above_ceiling' where hold_id = ${holdId}::uuid`.execute(su))).message).toMatch(/moves once/);
    // THE STALENESS CAUSE: floor 0 (fairness gates nothing), ceiling 24 h; an item PLANTED 100 h ago and never re-evaluated → held (staleness above the ceiling); released
    const p3 = (await publish(RULES({ fairness_floor: 0, staleness_ceiling_hours: 24 }), 'the staleness ceiling of a day (B36 harness)')).policy;
    policy = { policy_id: String(p3['policy_id']), version: Number(p3['version']) };
    const old = await plantItem({ title: 'B36 stale item (100 h, never re-evaluated)', createdAgo: '100 hours', dueMinutes: 200 * 60 });
    const e2 = await evaluate({ min_sample: 3 });
    expect(e2.governance).toMatchObject({ held: true, cause: 'staleness_above_ceiling', threshold: 24 });
    expect(Number(e2.governance['measure'])).toBeGreaterThanOrEqual(100);
    expect(obj(obj(obj(e2.governance['measures'])['staleness_hours']))).toMatchObject({ oldest_item: old });
    await release(executive, String(e2.governance['hold_id']), 'the stale item is a harness fixture (B36 harness)');
    expect((await queue(brandt))['hold']).toBeNull();
    sixEvidence('H1', { fault_trace: { refused: ['422 ×4 validator', '409 acknowledge while held', '409 accept while held', '403 ×2 PDP', '403 gate', '422 reason', '404', '409 released twice'] },
      watermark: { hold: holdId, governance_item: govItem, fairness: g1['measure'], staleness: e2.governance['measure'] }, consumer_behaviour: { held_by_evaluation: true, routed_to: ['executive'], read_only: true },
      operator_action: 'the executive evaluates, then releases with a reason', recovery: 'the release; the transitions serve again', reconciliation: { holds: (await holds()).holds.length } });
  }, 180_000);

  it('F1 · FORUMS (o5; V01-T-028): the chief of staff convenes two forums; two forums see ONE item and ONE acceptance; the refusals', async () => {
    const F = (over: Row = {}): Row => ({ title: 'Supply resilience forum (B36)', members: [brandt.principalId, executive.principalId], period: 'monthly', context: { objective_id: w.objectiveId, horizon: '90d', classification: 'internal' }, ...over });
    await refused(convene(asAgent(operator), F()), /human gate: executive\.forum\.convene requires a named human principal/, 403, 'EYE-WFL-002');
    expect((await refusal(convene(stratOnly, F()))).status).toBe(403);
    await refused(convene(operator, F({ members: [brandt.principalId, uuidv7()] })), /^forum rejected \(members\): member .* is not a named, active human of this tenant/, 422, 'EYE-REQ-001');
    await refused(convene(operator, F({ period: 'daily' })), /payload\.period is the cadence/, 422, 'EYE-REQ-001');
    await refused(convene(operator, F({ context: { objective_id: uuidv7(), horizon: '90d' } })), /^forum rejected \(context\): objective .* is not a live strategy object/, 422, 'EYE-REQ-001');
    await refused(convene(operator, F({ members: [] })), /payload\.members is a non-empty list/, 422, 'EYE-REQ-001');
    const f1 = (await convene(operator, F())).forum;
    expect(f1).toMatchObject({ kind: 'forum', period: 'monthly', review_every_days: 30, owner: operator.principalId, members: [brandt.principalId, executive.principalId] });
    expect(obj(f1['forum_context'])).toMatchObject({ objective_id: w.objectiveId, horizon: '90d', classification: 'internal', period: 'monthly' });
    const f2 = (await convene(operator, F({ title: 'The whole-domain weekly forum (B36)', members: [executive.principalId, analyst.principalId], period: 'weekly', context: { horizon: '12m' } }))).forum;
    expect(f2).toMatchObject({ review_every_days: 7 });
    expect(obj(f2['forum_context'])).toMatchObject({ objective_id: null, horizon: '12m', classification: 'internal' });
    const room = (await sql<Row>`select kind, package_id, subject_id::text, forum_context from executive.rooms_current where room_id = ${String(f1['room_id'])}::uuid`.execute(su)).rows[0]!;
    expect(room).toMatchObject({ kind: 'forum', package_id: null, subject_id: w.objectiveId });
    // TWO FORUMS SEE ONE ITEM AND ONE ACCEPTANCE: I1 (accepted by L. Brandt) read from both, the same acceptance id — no copy
    const q1 = await forumQueue(brandt, String(f1['room_id']));
    const q2 = await forumQueue(executive, String(f2['room_id']));
    expect(obj(q1['forum'])).toMatchObject({ room_id: f1['room_id'], period: 'monthly' });
    expect(obj(q1['context'])).toMatchObject({ objective_id: w.objectiveId, horizon: '90d' });
    expect(obj(q2['context'])).toMatchObject({ objective_id: null, horizon: '12m' });
    const in1 = arr(q1['items']).find((i) => i['item_id'] === I1)!; const in2 = arr(q2['items']).find((i) => i['item_id'] === I1)!;
    expect(obj(in1['priority_accepted'])).toMatchObject({ acceptance_id: acceptanceId, accepted_by: brandt.principalId });
    expect(obj(in2['priority_accepted'])).toEqual(obj(in1['priority_accepted']));
    // the forum's context filters as the queue's does: the objective's forum filters I3 (another objective); the whole-domain forum serves it
    expect(arr(q1['filtered']).map((f) => f['item_id'])).toContain(I3);
    expect(arr(q2['items']).map((i) => i['item_id'])).toContain(I3);
    expect(String(obj(q1['ranking'])['context_digest'])).toBe(String(obj(f1['forum_context'])['digest']));
    // REFUSED: a non-member (403); an unknown forum (404); a decision room is not a forum (404)
    await refused(forumQueue(analyst, String(f1['room_id'])), /^forum rejected \(membership\)/, 403, 'EYE-AUT-001');
    await refused(forumQueue(operator, uuidv7()), /^forum rejected \(unknown_forum\)/, 404, 'EYE-STA-001');
    const listed = (await forums()).forums;
    expect(listed.map((f) => f['room_id']).sort()).toEqual([f1['room_id'], f2['room_id']].sort());
    expect(arr(listed.find((f) => f['room_id'] === f1['room_id'])!['members']).map((m) => `${String(m['principal_id'])}:${String(m['role'])}`).sort()).toEqual([`${brandt.principalId}:observer`, `${executive.principalId}:observer`, `${operator.principalId}:owner`].sort());
    sixEvidence('F1', { fault_trace: { refused: ['403 gate', '403 PDP', '422 member', '422 period', '422 objective', '422 members empty', '403 non-member', '404 unknown forum'] },
      watermark: { forums: [f1['room_id'], f2['room_id']], acceptance: acceptanceId }, consumer_behaviour: { one_item_one_acceptance: true, forum_context_filters: true },
      operator_action: 'the chief of staff convenes; the members read', recovery: 'none needed', reconciliation: { forums: listed.length } });
  }, 120_000);
});
