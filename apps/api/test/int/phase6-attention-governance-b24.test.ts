/**
 * CP-6 B24 (migration 0086 §G, part `governance`) — THE ATTENTION QUEUE'S GOVERNANCE: a suppression a SECOND person approves (V03-T-263,
 * V03-T-171), an item DELEGATED to another person for a while (V00-T-069 "delegate review"), the DISPOSITION of an item, and the queue
 * EVALUATED from its ledgers (PR-44-006, CAP-EO-06, AT-44) — on a real database through the real routes (the PDP, the pipeline, the
 * ports), with B24's own humans holding sessions of their own (the ports compare the acting principal).
 *
 * The ITEMS are PLANTED by the superuser (stated): an item of the queue with its first queue event, under the ACTIVE policy version the
 * executive published through the route — the routing itself is B22's and B23's, proven in their harnesses; every act ON the items here
 * goes through the routes. Instants are compared on the DATABASE clock; deadlines and a request's instant are MOVED by the superuser
 * (stated), never waited for.
 *
 *   S1 · SUPPRESSION APPROVAL: the class's rule says approval_required → the owner's suppression is a REQUEST, the item STAYS LIVE (open)
 *   and KEEPS ESCALATING (its deadline moved into the past; escalate-due escalates it); a second request refused (409); the requester
 *   deciding their own request refused (403, separation of duties); a holder of none of the approver roles refused (403); the executive
 *   (an approver) approves → suppressed until the requested instant (≤ the decision + max_hours), item.suppression_decided and
 *   item.suppressed; decided again → 409; an unknown request 404; a malformed decision 422.
 *   S1b · EXPIRY: a request whose instant has passed (moved by the superuser — stated) cannot be approved (409), is listed `lapsed`, and
 *   the approvers' sweep records it EXPIRED (item.suppression_decided {expired}); the item stays live; the sweep again → nothing.
 *   S1c · WITHOUT approval_required the 0083 act is unchanged: suppressed at once, the same answer keys, no request.
 *   S2 · DELEGATION: an analyst cannot act on the owner's item (403); the owner delegates it to the analyst → the analyst acknowledges it
 *   (the owner stays the owner); the same key and content → the same delegation (repeated); the same key, another reason → 409; the
 *   delegate does not delegate further (403); an agent (422), a human holding no acknowledgement role (422), oneself (422), a window
 *   beyond 720 h (422), an unknown item (404), a second standing delegation to the same person (409); a stranger's end refused (403); the
 *   owner ends it (item.delegation_ended), again → 409; the ended delegate can no longer act (403) — the owner records instead.
 *   E1 · EVALUATION: planted dispositions → precision 0.5 / recall 0.6 for warning.raised (3 positives, 3 false alarms — not_material,
 *   duplicate, closed without acknowledgement —, 2 misses — `missed` on a below-threshold item and an item re-evaluated to material; one
 *   `late` counted apart); forecast.unfit (one item) ABSTAINS below min_sample 3; the verdict partial; `missed` on a material item 409;
 *   the same disposition again → repeated; the severe items (C3/C4): one acknowledged in time, a C4 unacknowledged past its deadline and a
 *   C3 deprioritized for overload (the event PLANTED — another section's) both named as BREACHES; the delivery not measurable (no delivery
 *   ledger on this branch — stated); the escalation latency measured from the real escalation; stability ABSTAINS (no rank); min_sample
 *   100 → the verdict abstained; the PDP (an analyst, a forecast owner: 403) and the intake (422).
 *   E2 · STABILITY: three items whose events carry a rank (PLANTED — the rank is another section's) at the window's start (1, 2, 3) and
 *   end (1, 3, 2) → Kendall tau-b 1/3 (2 concordant, 1 discordant).
 *
 * EACH CASE LOGS ONE `B24 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let exec: ExecutiveController;
let executive: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal;
let policy: { policy_id: string; version: number } = { policy_id: '', version: 0 };
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
/** A marker on the DATABASE clock (the B20 harness idiom). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
/** An instant read back from a row (a Date from the driver, or an ISO string from a jsonb answer) in milliseconds. */
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
/**
 * A window bound on the DATABASE clock, clear of the writes on both sides: a JS Date keeps milliseconds while the database keeps
 * microseconds, so the bound is taken 25 ms after the last write before it and 25 ms before the first write after it.
 */
const bound = async (): Promise<Date> => { await sleep(25); const t = await mark(); await sleep(25); return t; };
/** gitleaks: a key is built, never written as one literal. */
const key = (s: string) => ['b24', 'gov', s, uuidv7().slice(-8)].join('-');
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20/B22 idiom). */
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
  console.log(`B24 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
type Item = { item_id: string; state: string; outcome: string; owner_principal_id: string | null; escalations: number; due_at: Date | null; suppressed_until: Date | null; acknowledged_by: string | null };
const itemRow = async (id: string): Promise<Item> => (await sql<Item>`select item_id::text, state, outcome, owner_principal_id::text, escalations, due_at, suppressed_until, acknowledged_by::text from executive.attention_items where item_id = ${id}::uuid`.execute(su)).rows[0]!;
const itemEvents = async (id: string) => (await sql<{ event: string; actor: string; details: Row }>`select event, actor_principal_id::text actor, details from executive.attention_item_events where item_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const requestRow = async (id: string) => (await sql<Row>`select request_id::text, item_id::text, state, requested_by::text, until, decided_by::text, decided_at, decision_reason, approved_until, capped, approver_roles, policy_version from executive.attention_suppression_requests where request_id = ${id}::uuid`.execute(su)).rows[0]!;

/**
 * An item PLANTED in the queue (stated): the row under the ACTIVE policy version with its evaluation (the dimensions carry the consequence),
 * and its first queue event as 0083 records a routing (the outcome, the version, the owner, the roles, the deadline).
 */
async function plantItem(o: { cls?: string; outcome?: 'material' | 'below_threshold' | 'abstained'; owner?: string | null; roles?: string[]; consequence?: string; dueMinutes?: number | null; rankEvent?: number; title?: string }): Promise<string> {
  const id = uuidv7(); const cls = o.cls ?? 'warning.raised'; const outcome = o.outcome ?? 'material';
  const state = outcome === 'material' ? 'open' : 'deprioritized';
  const roles = outcome === 'material' ? (o.roles ?? ['forecast_owner']) : [];
  const due = outcome === 'material' && o.dueMinutes !== null ? (await sql<{ t: Date }>`select clock_timestamp() + make_interval(mins => ${o.dueMinutes ?? 60}::int) t`.execute(su)).rows[0]!.t : null;
  const evaluation = { outcome, reasons: [`planted by the B24 governance harness (${outcome})`], dimensions: { consequence: o.consequence ?? 'C2', confidence: 0.9 }, thresholds: null, policy_version: policy.version };
  const owner = o.owner === undefined ? forecastOwner.principalId : o.owner;
  await sql`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
            values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${cls}, ${cls === 'forecast.unfit' ? 'forecast' : 'warning'}, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${cls === 'forecast.unfit' ? 'ForecastFitnessChanged' : 'EarlyWarningRaised'},
                    ${o.title ?? `B24 governance item (${cls}, ${outcome})`}, ${outcome}, ${state}, ${owner}::uuid, ${roles}::text[], ${policy.policy_id}::uuid, ${policy.version}, ${JSON.stringify(evaluation)}::jsonb, '{"planted":"b24-governance"}'::jsonb, ${due}, 0, ${uuidv7()}::uuid)`.execute(su);
  const details: Row = { outcome, reasons: evaluation.reasons, policy_version: policy.version, owner, route_roles: roles, due_at: due === null ? null : due.toISOString(), planted: true };
  if (o.rankEvent !== undefined) details['rank'] = o.rankEvent;
  await sql`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, correlation_id)
            values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, ${outcome === 'material' ? 'item.routed' : 'item.deprioritized'}, ${executive.principalId}::uuid, ${JSON.stringify(details)}::jsonb, ${uuidv7()}::uuid)`.execute(su);
  return id;
}
/** An item event PLANTED (stated) — another section's event the evaluation reads (item.overload_deprioritized, a re-evaluation carrying a rank). */
const plantEvent = async (itemId: string, event: string, details: Row) =>
  sql`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${itemId}::uuid, ${event}, ${executive.principalId}::uuid, ${JSON.stringify(details)}::jsonb, ${uuidv7()}::uuid)`.execute(su);

/* ───────────── the routes (in process) ───────────── */
const publish = (as: AuthenticatedPrincipal, rules: unknown, reason: string) => exec.publishAttentionPolicy(h.req(as, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string) => exec.acknowledgeAttentionItem(h.req(as, 'executive.attention.item.acknowledge', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: {} }) as unknown as Promise<{ item: Row }>;
const suppress = (as: AuthenticatedPrincipal, itemId: string, until: Date, reason: string) => exec.suppressAttentionItem(h.req(as, 'executive.attention.item.suppress', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: { until: until.toISOString(), reason } }) as unknown as Promise<{ item: Row }>;
const close = (as: AuthenticatedPrincipal, itemId: string, note: string) => exec.closeAttentionItem(h.req(as, 'executive.attention.item.close', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: { note } }) as unknown as Promise<{ item: Row }>;
const escalateDue = (as = executive) => exec.escalateAttentionDue(h.req(as, 'executive.attention.escalate', 'ATI', null, 'executive'), T(), D()) as unknown as Promise<{ escalation: { escalated: string[]; lapsed: string[]; exhausted: string[] } }>;
const decide = (as: AuthenticatedPrincipal, requestId: string, decision: string, reason: string) => exec.decideSuppression(h.req(as, 'executive.attention.suppression.decide', 'ATS', requestId, 'executive'), T(), D(), requestId, { payload: { decision, reason } }) as unknown as Promise<{ request: Row }>;
const expire = (as = executive) => exec.expireSuppressions(h.req(as, 'executive.attention.suppression.decide', 'ATS', null, 'executive'), T(), D()) as unknown as Promise<{ expiry: { expired: Row[]; at: string } }>;
const listRequests = (as: AuthenticatedPrincipal, payload: Row = {}) => exec.listSuppressionRequests(h.req(as, 'executive.attention.read', 'ATS', null, 'executive'), T(), D(), { payload: payload as never }) as unknown as Promise<{ requests: Row[] }>;
const delegate = (as: AuthenticatedPrincipal, itemId: string, payload: Row) => exec.delegateAttentionItem(h.req(as, 'executive.attention.item.delegate', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload }) as unknown as Promise<{ delegation: Row }>;
const endDelegation = (as: AuthenticatedPrincipal, id: string, reason: string) => exec.endItemDelegation(h.req(as, 'executive.attention.item.delegate', 'ATD', id, 'executive'), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ delegation: Row }>;
const listDelegations = (as: AuthenticatedPrincipal, payload: Row = {}) => exec.listItemDelegations(h.req(as, 'executive.attention.read', 'ATD', null, 'executive'), T(), D(), { payload: payload as never }) as unknown as Promise<{ delegations: Row[] }>;
const dispose = (as: AuthenticatedPrincipal, itemId: string, disposition: string, note?: string) => exec.recordAttentionDisposition(h.req(as, 'executive.attention.disposition.record', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: note === undefined ? { disposition } : { disposition, note } }) as unknown as Promise<{ disposition: Row }>;
const evaluate = (as: AuthenticatedPrincipal, payload: Row) => exec.evaluateAttentionQueue(h.req(as, 'executive.attention.queue.evaluate', 'ATE', null, 'executive'), T(), D(), { payload }) as unknown as Promise<{ evaluation: Row & { measures?: never } }>;
const listEvaluations = (as: AuthenticatedPrincipal) => exec.listAttentionEvaluations(h.req(as, 'executive.attention.read', 'ATE', null, 'executive'), T(), D(), { payload: {} }) as unknown as Promise<{ evaluations: Row[] }>;

/* ───────────── the policy ───────────── */
const RULES = (): Row => ({
  classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 2,
                        suppression: { allowed: true, max_hours: 24, approval_required: true, approver_roles: ['executive'] }, notify: 'in_app' },
    'forecast.unfit': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 1,
                        suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' },
  },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  exec = h.app.get(Ec);
  executive = await h.humanWithSession(['executive'], 'b24g-executive');
  dadmin = await h.humanWithSession(['domain_admin'], 'b24g-domain-admin');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b24g-forecast-owner');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b24g-strategy-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b24g-analyst');
  roleless = await h.principalWith([], 'b24g-roleless');
  const p = (await publish(executive, RULES(), 'the B24 governance harness: approval-required warnings, direct forecast suppression')).policy;
  policy = { policy_id: String(p['policy_id']), version: Number(p['version']) };
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B24 · the attention queue\'s governance (0086 §G): suppression approval, delegation, disposition, evaluation', () => {
  let W1 = ''; let R1 = '';
  it('S1 · SUPPRESSION APPROVAL: a request, the item live and escalating; the requester (403) and a non-approver (403) refused; the executive approves → suppressed; again 409, unknown 404, malformed 422', async () => {
    W1 = await plantItem({ title: 'B24 S1 warning — approval required' });
    const until = new Date((await mark()).getTime() + 2 * 3600_000);
    const asked = (await suppress(forecastOwner, W1, until, 'the owner asks to mute the warning while the vendor answers')).item;
    expect(asked).toMatchObject({ item_id: W1, state: 'open', from_state: 'open', approval_required: true, request_state: 'pending', approver_roles: ['executive'], by: forecastOwner.principalId });
    R1 = String(asked['request_id']);
    expect(await itemRow(W1)).toMatchObject({ state: 'open', suppressed_until: null });
    expect((await itemEvents(W1)).map((e) => e.event)).toEqual(['item.routed', 'item.suppression_requested']);
    expect((await itemEvents(W1))[1]!.details).toMatchObject({ request_id: R1, item_stays_live: true, policy_version: policy.version, approver_roles: ['executive'] });
    // one pending request per item
    await refused(suppress(forecastOwner, W1, until, 'a second request while the first is pending'), /^attention suppression rejected: item .* already has a pending suppression request/, 409, 'EYE-STA-002');
    // SEPARATION OF DUTIES: the requester passes the PDP (forecast_owner may decide) and is refused by the port
    await refused(decide(forecastOwner, R1, 'approve', 'approving my own request should never pass'), /^attention suppression rejected: the requester does not decide their own request \(separation of duties\)/, 403, 'EYE-AUT-001');
    await refused(decide(strategyOwner, R1, 'approve', 'a strategy owner is not an approver here'), /^attention suppression rejected: the decider holds none of the approver roles executive/, 403, 'EYE-AUT-001');
    // THE ITEM KEEPS ESCALATING while the request is pending (the deadline moved into the past by the superuser — stated)
    await sql`update executive.attention_items set due_at = clock_timestamp() - interval '5 minutes' where item_id = ${W1}::uuid`.execute(su);
    const esc = (await escalateDue()).escalation;
    expect(esc.escalated).toContain(W1);
    expect(await itemRow(W1)).toMatchObject({ state: 'escalated', escalations: 1 });
    expect(await requestRow(R1)).toMatchObject({ state: 'pending' });
    // the approver decides
    const before = await mark();
    const ok = (await decide(executive, R1, 'approve', 'the vendor answer is due tomorrow; muting is reasonable')).request;
    const after = await mark();
    expect(ok).toMatchObject({ request_id: R1, state: 'approved', decided_by: executive.principalId, item_state: 'suppressed', capped: false, requested_by: forecastOwner.principalId });
    const rq = await requestRow(R1);
    expect(ms(rq['approved_until'])).toBe(until.getTime());
    expect(ms(rq['approved_until'])).toBeLessThanOrEqual(ms(rq['decided_at']) + 24 * 3600_000);
    expect(ms(rq['decided_at'])).toBeGreaterThanOrEqual(before.getTime());
    expect(ms(rq['decided_at'])).toBeLessThanOrEqual(after.getTime());
    const it1 = await itemRow(W1);
    expect(it1.state).toBe('suppressed');
    expect(it1.suppressed_until!.getTime()).toBe(until.getTime());
    const ev = await itemEvents(W1);
    expect(ev.map((e) => e.event).slice(-2)).toEqual(['item.suppression_decided', 'item.suppressed']);
    expect(ev.at(-2)!.details).toMatchObject({ decision: 'approve', request_id: R1, requested_by: forecastOwner.principalId, capped: false });
    expect(ev.at(-1)!.details).toMatchObject({ request_id: R1, approved_by: executive.principalId, requested_by: forecastOwner.principalId, from_state: 'escalated' });
    // the record's state, an absence, the caller's own request
    await refused(decide(executive, R1, 'refuse', 'deciding an approved request again'), /^attention suppression rejected: request .* is approved; only a pending request is decided/, 409, 'EYE-STA-002');
    await refused(decide(executive, uuidv7(), 'approve', 'an id that names no request'), /^attention suppression rejected: no such suppression request in this domain/, 404, 'EYE-STA-001');
    await refused(decide(executive, R1, 'maybe', 'neither approve nor refuse'), /payload\.decision is approve or refuse/, 422, 'EYE-REQ-001');
    await refused(decide(executive, R1, 'refuse', 'short'.slice(0, 4)), /payload\.reason says why/, 422, 'EYE-REQ-001');
    // the PDP: an agent-free human without a decide role (the roleless human holds nothing)
    expect((await refusal(decide(roleless, R1, 'approve', 'a person holding no role at all'))).status).toBe(403);
    // the refusal row of a port text the intake never lets through (the mapper, anchored)
    expect(asObservationRefusal(Object.assign(new Error('attention suppression rejected: a decision carries a reason of at least 8 characters'), { code: '22023' }), 'h')?.getStatus()).toBe(422);
    const listed = (await listRequests(forecastOwner, { itemId: W1 })).requests;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ request_id: R1, state: 'approved', lapsed: false });
    sixEvidence('S1', { fault_trace: { own_request: 403, non_approver: 403, second_request: 409, again: 409, unknown: 404, malformed: 422 }, watermark: { request: R1, approved_until: rq['approved_until'] },
      consumer_behaviour: { item_while_pending: 'open → escalated (escalations 1)', item_after: it1.state }, operator_action: 'the owner requests; the executive approves',
      recovery: 'the request stays pending until a second person decides it', reconciliation: { events: ev.map((e) => e.event) } });
  }, 120_000);

  it('S1b · EXPIRY: a request past its instant (moved by the superuser — stated) is not approved (409), is listed lapsed, and the sweep records it EXPIRED; the item stays live', async () => {
    const W2 = await plantItem({ title: 'B24 S1b warning — the request lapses' });
    const until = new Date((await mark()).getTime() + 3600_000);
    const R2 = String((await suppress(forecastOwner, W2, until, 'mute until the planned maintenance window ends')).item['request_id']);
    // the instant moved into the past — the decided-once trigger bypassed for the superuser's fixture move (session_replication_role, stated)
    await su.transaction().execute(async (tx) => {
      await sql`set local session_replication_role = replica`.execute(tx);
      await sql`update executive.attention_suppression_requests set requested_at = clock_timestamp() - interval '10 minutes', until = clock_timestamp() - interval '1 minute' where request_id = ${R2}::uuid`.execute(tx);
    });
    await refused(decide(executive, R2, 'approve', 'approving a request that has lapsed'), /^attention suppression rejected: request .* lapsed at .*, before it was decided/, 409, 'EYE-STA-002');
    expect((await listRequests(executive, { itemId: W2 })).requests[0]).toMatchObject({ request_id: R2, state: 'pending', lapsed: true });
    // the PDP on the sweep: a person holding no decide role
    expect((await refusal(expire(roleless))).status).toBe(403);
    const swept = (await expire()).expiry;
    expect(swept.expired.map((x) => x['request_id'])).toEqual([R2]);
    expect(await requestRow(R2)).toMatchObject({ state: 'expired', decided_by: null, approved_until: null });
    expect(await itemRow(W2)).toMatchObject({ state: 'open', suppressed_until: null });
    const last = (await itemEvents(W2)).at(-1)!;
    expect(last).toMatchObject({ event: 'item.suppression_decided', actor: executive.principalId });
    expect(last.details).toMatchObject({ request_id: R2, decision: 'expired', item_stays_live: true });
    expect((await expire()).expiry.expired).toEqual([]);
    // RECOVERY: a new request after the expiry is admitted
    const again = (await suppress(forecastOwner, W2, new Date((await mark()).getTime() + 3600_000), 'asking again after the first request lapsed')).item;
    expect(again).toMatchObject({ approval_required: true, request_state: 'pending' });
    expect(String(again['request_id'])).not.toBe(R2);
    // an expired request is never rewritten (the decided-once trigger)
    const rewrite = await su.transaction().execute(async (tx) => sql`update executive.attention_suppression_requests set state = 'approved' where request_id = ${R2}::uuid`.execute(tx)).then(() => null, (e: { code?: string }) => e.code ?? 'unknown');
    expect(rewrite).toBe('55000');
    sixEvidence('S1b', { fault_trace: { lapsed_decide: 409 }, watermark: { request: R2, until: 'moved into the past (superuser, stated)' }, consumer_behaviour: { swept: swept.expired.length, item: 'open' },
      operator_action: 'the executive sweeps', recovery: 'a new request is admitted after the expiry', reconciliation: { second_sweep: 0, rewrite: '55000' } });
  }, 120_000);

  it('S1c · WITHOUT approval_required the 0083 suppression is unchanged: suppressed at once, the same answer, no request', async () => {
    const F1 = await plantItem({ cls: 'forecast.unfit', title: 'B24 S1c forecast unfit — no approval' });
    const until = new Date((await mark()).getTime() + 3600_000);
    const r = (await suppress(forecastOwner, F1, until, 'the forecast is being re-fitted this afternoon')).item;
    expect(Object.keys(r).sort()).toEqual(['by', 'from_state', 'item_id', 'reason', 'state', 'until']);
    expect(r).toMatchObject({ item_id: F1, state: 'suppressed', from_state: 'open', by: forecastOwner.principalId });
    expect((await sql<{ n: number }>`select count(*)::int n from executive.attention_suppression_requests where item_id = ${F1}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect((await itemEvents(F1)).map((e) => e.event)).toEqual(['item.routed', 'item.suppressed']);
    // the B22 bound, unchanged
    await refused(suppress(forecastOwner, await plantItem({ cls: 'forecast.unfit' }), new Date(until.getTime() + 24 * 3600_000), 'beyond the class maximum of twelve hours'), /^attention item rejected: a suppression expires after now and within 12 hours/, 422, 'EYE-REQ-001');
    sixEvidence('S1c', { fault_trace: { beyond_max: 422 }, watermark: { item: F1 }, consumer_behaviour: { state: r['state'] }, operator_action: 'the owner suppresses directly', recovery: 'none needed', reconciliation: { requests: 0 } });
  }, 120_000);

  it('S2 · DELEGATION: the delegate acts (the owner stays the owner); same key → same record; the refusals; the end', async () => {
    const W3 = await plantItem({ title: 'B24 S2 warning — delegated review' });
    await refused(acknowledge(analyst, W3), /^attention item rejected: item .* is routed to forecast_owner/, 403, 'EYE-AUT-001');
    const until = new Date((await mark()).getTime() + 4 * 3600_000).toISOString();
    const k1 = key('s2');
    const d1 = (await delegate(forecastOwner, W3, { to: analyst.principalId, reason: 'the analyst covers my queue this afternoon', until, request_key: k1 })).delegation;
    expect(d1).toMatchObject({ repeated: false, item_id: W3, from: forecastOwner.principalId, to: analyst.principalId, owner: forecastOwner.principalId, owner_stays_accountable: true, state: 'active' });
    const D1 = String(d1['delegation_id']);
    // exactly once on the key
    const d1b = (await delegate(forecastOwner, W3, { to: analyst.principalId, reason: 'the analyst covers my queue this afternoon', until, request_key: k1 })).delegation;
    expect(d1b).toMatchObject({ delegation_id: D1, repeated: true });
    expect((await sql<{ n: number }>`select count(*)::int n from executive.attention_delegations where item_id = ${W3}::uuid`.execute(su)).rows[0]!.n).toBe(1);
    await refused(delegate(forecastOwner, W3, { to: analyst.principalId, reason: 'another reason under the same key', until, request_key: k1 }),
      /^attention delegation rejected: request key .* was already used by this principal for a different delegation/, 409, 'EYE-STA-002');
    // the delegate acts
    const ack = (await acknowledge(analyst, W3)).item;
    expect(ack).toMatchObject({ state: 'acknowledged', acknowledged_by: analyst.principalId });
    expect(await itemRow(W3)).toMatchObject({ owner_principal_id: forecastOwner.principalId, acknowledged_by: analyst.principalId });
    // the refusals
    await refused(delegate(analyst, W3, { to: dadmin.principalId, reason: 'passing the item further along', until, request_key: key('s2-further') }), /^attention delegation rejected: item .* is routed to .*; the delegator acts on it in their own right/, 403, 'EYE-AUT-001');
    await refused(delegate(forecastOwner, W3, { to: h.fx.agentPrincipalId, reason: 'an agent is never a delegate', until, request_key: key('s2-agent') }), /^attention delegation rejected: the delegate must be an active human principal/, 422, 'EYE-REQ-001');
    await refused(delegate(forecastOwner, W3, { to: roleless.principalId, reason: 'a person holding no acknowledgement role', until, request_key: key('s2-roleless') }), /^attention delegation rejected: the delegate holds none of the acknowledgement roles/, 422, 'EYE-REQ-001');
    await refused(delegate(forecastOwner, W3, { to: forecastOwner.principalId, reason: 'delegating to oneself', until, request_key: key('s2-self') }), /^attention delegation rejected: the delegate is another person/, 422, 'EYE-REQ-001');
    await refused(delegate(forecastOwner, W3, { to: dadmin.principalId, reason: 'a month is too long for a delegation', until: new Date(Date.parse(until) + 40 * 24 * 3600_000).toISOString(), request_key: key('s2-long') }), /^attention delegation rejected: a delegation ends after now and within 720 hours/, 422, 'EYE-REQ-001');
    await refused(delegate(forecastOwner, uuidv7(), { to: analyst.principalId, reason: 'an item that does not exist', until, request_key: key('s2-none') }), /^attention delegation rejected: no such item in this domain/, 404, 'EYE-STA-001');
    await refused(delegate(forecastOwner, W3, { to: analyst.principalId, reason: 'a second standing delegation to the analyst', until, request_key: key('s2-twice') }), /^attention delegation rejected: item .* is already delegated to/, 409, 'EYE-STA-002');
    await refused(delegate(forecastOwner, W3, { to: 'nobody', reason: 'an id that is not an id', until, request_key: key('s2-bad') }), /payload\.to is the principal id/, 422, 'EYE-REQ-001');
    expect((await refusal(delegate(roleless, W3, { to: analyst.principalId, reason: 'no role, no delegation', until, request_key: key('s2-pdp') }))).status).toBe(403);
    // the delegate records a disposition while the delegation stands
    expect((await dispose(analyst, W3, 'actioned', 'the vendor was called')).disposition).toMatchObject({ disposition: 'actioned', repeated: false, recorded_by: analyst.principalId });
    // the end
    await refused(endDelegation(strategyOwner, D1, 'a stranger ends the delegation'), /^attention delegation rejected: a delegation is ended by its delegator/, 403, 'EYE-AUT-001');
    const ended = (await endDelegation(forecastOwner, D1, 'I am back and take the queue again')).delegation;
    expect(ended).toMatchObject({ delegation_id: D1, state: 'ended', ended_by: forecastOwner.principalId });
    await refused(endDelegation(forecastOwner, D1, 'ending the ended delegation'), /^attention delegation rejected: delegation .* already ended at/, 409, 'EYE-STA-002');
    await refused(endDelegation(forecastOwner, uuidv7(), 'a delegation that does not exist'), /^attention delegation rejected: no such delegation in this domain/, 404, 'EYE-STA-001');
    // the ended delegate no longer acts; the owner does (recovery)
    await refused(dispose(analyst, W3, 'late', 'after the delegation ended'), /^attention disposition rejected: item .* is routed to .*nor its delegate/, 403, 'EYE-AUT-001');
    expect((await dispose(forecastOwner, W3, 'actioned', 'confirmed on my return')).disposition).toMatchObject({ repeated: false, previous: 'actioned', recorded_by: forecastOwner.principalId });
    const ev = await itemEvents(W3);
    expect(ev.map((e) => e.event)).toEqual(['item.routed', 'item.delegated', 'item.acknowledged', 'item.disposition', 'item.delegation_ended', 'item.disposition']);
    expect(ev[1]!.details).toMatchObject({ delegation_id: D1, owner_stays_accountable: true, to: analyst.principalId });
    const listed = (await listDelegations(executive, { itemId: W3 })).delegations;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ delegation_id: D1, state: 'ended', in_force: false, owner: forecastOwner.principalId });
    sixEvidence('S2', { fault_trace: { before: 403, key_conflict: 409, further: 403, agent: 422, roleless: 422, stranger_end: 403, ended_delegate: 403 }, watermark: { delegation: D1, until },
      consumer_behaviour: { acknowledged_by: 'the delegate', owner: 'unchanged' }, operator_action: 'the owner delegates, then ends the delegation', recovery: 'the owner records the disposition himself',
      reconciliation: { events: ev.map((e) => e.event), repeated: true } });
  }, 120_000);

  it('E1 · EVALUATION: precision 0.5 / recall 0.6 for warning.raised; forecast.unfit abstains; the severe breaches visible; delivery measured (0 of 3 planted); escalation latency measured; stability abstains; min_sample 100 → abstained', async () => {
    const W0 = await bound();
    const fo = forecastOwner;
    // three positives (A1 a C3 acknowledged in time), one late, three false alarms, two misses, one C3 deprioritized for overload
    const A = [await plantItem({ consequence: 'C3' }), await plantItem({}), await plantItem({})];
    const L1 = await plantItem({});
    const N1 = await plantItem({}); const N2 = await plantItem({}); const N3 = await plantItem({ consequence: 'C4', dueMinutes: -5 });
    const M1 = await plantItem({ outcome: 'below_threshold' }); const M2 = await plantItem({});
    const O1 = await plantItem({ consequence: 'C3' });
    const F2 = await plantItem({ cls: 'forecast.unfit' });
    for (const x of [...A, L1, F2]) await acknowledge(fo, x);
    for (const x of A) await dispose(fo, x, 'actioned');
    await dispose(fo, L1, 'late', 'seen after the window had passed');
    await dispose(fo, F2, 'actioned');
    await dispose(fo, N1, 'not_material', 'the threshold was too low for this corridor');
    await dispose(fo, N2, 'duplicate', 'the same warning as the item before');
    await dispose(fo, M1, 'missed', 'the engine judged it below threshold; it mattered');
    // M2: re-evaluated to material after arriving below the threshold (the event PLANTED — the re-evaluation is B22's, proven there)
    await plantEvent(M2, 'item.reevaluated', { from_version: policy.version, to_version: policy.version, from_outcome: 'below_threshold', to_outcome: 'material', from_state: 'deprioritized', to_state: 'open', planted: true });
    // O1: deprioritized for overload (the event PLANTED — the overload rule is another section's)
    await plantEvent(O1, 'item.overload_deprioritized', { reason: 'planted by the B24 governance harness', planted: true });
    // N3 (C4): planted with its deadline already passed, unacknowledged → a real escalation, then closed without acknowledgement
    expect((await escalateDue()).escalation.escalated).toContain(N3);
    await close(fo, N3, 'closed without acknowledgement');
    // the disposition's own rules
    await refused(dispose(fo, A[1]!, 'missed', 'this one was routed as material'), /^attention disposition rejected: item .* was judged material when it arrived/, 409, 'EYE-STA-002');
    expect((await dispose(fo, A[0]!, 'actioned')).disposition).toMatchObject({ repeated: true });
    await refused(dispose(fo, A[0]!, 'forgotten'), /payload\.disposition is one of actioned, not_material, duplicate, late, missed/, 422, 'EYE-REQ-001');
    await refused(dispose(fo, uuidv7(), 'actioned'), /^attention disposition rejected: no such item in this domain/, 404, 'EYE-STA-001');
    await refused(dispose(analyst, A[2]!, 'duplicate'), /^attention disposition rejected: item .* is routed to/, 403, 'EYE-AUT-001');
    const W1e = await bound();
    // the PDP and the intake
    await refused(evaluate(analyst, { window_from: W0.toISOString(), window_to: W1e.toISOString(), min_sample: 3 }), /.*/, 403);
    await refused(evaluate(fo, { window_from: W0.toISOString(), window_to: W1e.toISOString(), min_sample: 3 }), /.*/, 403);
    await refused(evaluate(executive, { window_from: W1e.toISOString(), window_to: W0.toISOString() }), /window_to is at or after window_from/, 422, 'EYE-REQ-001');
    await refused(evaluate(executive, { min_sample: 0 }), /min_sample is a whole number/, 422, 'EYE-REQ-001');

    const ev = (await evaluate(executive, { window_from: W0.toISOString(), window_to: W1e.toISOString(), min_sample: 3 })).evaluation as Row;
    const cls = ev['classes'] as Record<string, Row>;
    expect(ev['items']).toBe(11);
    expect(cls['warning.raised']).toMatchObject({ items: 10, true_positive: 3, false_positive: 3, missed: 2, late: 1, undisposed: 3,
      precision: { abstained: false, sample: 6, value: 0.5 }, recall: { abstained: false, sample: 5, value: 0.6 } });
    expect(cls['forecast.unfit']).toMatchObject({ items: 1, true_positive: 1, precision: { abstained: true, sample: 1 }, recall: { abstained: true, sample: 1 } });
    expect(String((cls['forecast.unfit']!['precision'] as Row)['reason'])).toMatch(/below min_sample 3/);
    expect(ev['overall']).toMatchObject({ true_positive: 4, false_positive: 3, missed: 2, precision: { value: 0.5714 }, recall: { value: 0.6667 } });
    expect(ev['verdict']).toBe('partial');
    expect(String(ev['reason'])).toMatch(/^11 item\(s\) in the window; pooled precision 0\.5714, recall 0\.6667; 2 class measure\(s\) measured, 2 abstained below min_sample 3/);
    // the severe items
    const sev = ev['severe'] as Row;
    expect(sev).toMatchObject({ items: 3, routed: 3, acknowledged: 1, acknowledged_before_deadline: 1, overload_deprioritized: 1, never_overload_deprioritized: false });
    expect((sev['time_to_acknowledge_seconds'] as Row)['p50']).not.toBeNull();
    // the delivery ledger (0086 §T) is present: the planted items were never routed through a delivery, so none was delivered before its deadline
    expect(sev['delivered_before_deadline']).toMatchObject({ measurable: true, delivered_before_deadline: 0, of: 3, source: 'executive.attention_deliveries (item_id, state delivered, attempted_at)' });
    const breaches = sev['breaches'] as Row[];
    expect(breaches.map((b) => [b['item_id'], b['breach']]).sort()).toEqual([[N3, 'unacknowledged_past_deadline'], [O1, 'overload_deprioritized']].sort());
    // the escalation latency, from the real escalation of N3; the stability abstains (no rank)
    expect(ev['escalation_latency']).toMatchObject({ abstained: false });
    expect(Number((ev['escalation_latency'] as Row)['escalations'])).toBeGreaterThanOrEqual(1);
    expect(Number((ev['escalation_latency'] as Row)['p50_seconds'])).toBeGreaterThan(0);
    expect(ev['ranking_stability']).toMatchObject({ abstained: true, ranked: 0 });
    expect(String((ev['ranking_stability'] as Row)['reason'])).toMatch(/^no rank exists/);
    // the record: append-only, what the route answered
    const rec = (await sql<{ verdict: string; reason: string; measures: Row; evaluated_by: string; min_sample: number }>`select verdict, reason, measures, evaluated_by::text, min_sample from executive.attention_queue_evaluations where evaluation_id = ${String(ev['evaluation_id'])}::uuid`.execute(su)).rows[0]!;
    expect(rec).toMatchObject({ verdict: 'partial', reason: ev['reason'], evaluated_by: executive.principalId, min_sample: 3 });
    expect((rec.measures['classes'] as Row)['warning.raised']).toEqual(cls['warning.raised']);
    expect(await sql`delete from executive.attention_queue_evaluations where evaluation_id = ${String(ev['evaluation_id'])}::uuid`.execute(su).then(() => null, (e: { code?: string }) => e.code)).not.toBeNull();
    // too small a sample overall → the verdict abstains (a domain administrator evaluates too)
    const ab = (await evaluate(dadmin, { window_from: W0.toISOString(), window_to: W1e.toISOString(), min_sample: 100 })).evaluation as Row;
    expect(ab).toMatchObject({ verdict: 'abstained', overall: { precision: { abstained: true, sample: 7 }, recall: { abstained: true, sample: 6 } } });
    const listed = (await listEvaluations(analyst)).evaluations;
    expect(listed.slice(0, 2).map((x) => x['verdict'])).toEqual(['abstained', 'partial']);
    sixEvidence('E1', { fault_trace: { pdp: [403, 403], intake: [422, 422], missed_on_material: 409 }, watermark: { window: [W0.toISOString(), W1e.toISOString()], evaluation: ev['evaluation_id'] },
      consumer_behaviour: { warning: { precision: 0.5, recall: 0.6 }, forecast_unfit: 'abstained', severe_breaches: breaches.length }, operator_action: 'the executive evaluates the queue over the window',
      recovery: 'min_sample 100 → the verdict abstains rather than fabricating a measure', reconciliation: { verdict: ev['verdict'], stability: 'abstained (no rank)', delivery: 'not measurable (no ledger)' } });
  }, 180_000);

  it('E2 · STABILITY: ranks carried by the items\' events (PLANTED — the rank is another section\'s) 1,2,3 at the start and 1,3,2 at the end → Kendall tau-b 1/3', async () => {
    const R = [await plantItem({ rankEvent: 1 }), await plantItem({ rankEvent: 2 }), await plantItem({ rankEvent: 3 })];
    const W0 = await bound();
    const ends = [1, 3, 2];
    for (let i = 0; i < 3; i += 1) await plantEvent(R[i]!, 'item.reevaluated', { from_outcome: 'material', to_outcome: 'material', rank: ends[i], planted: true });
    const W1 = await bound();
    const ev = (await evaluate(executive, { window_from: W0.toISOString(), window_to: W1.toISOString(), min_sample: 3 })).evaluation as Row;
    expect(ev['ranking_stability']).toMatchObject({ abstained: false, ranked: 3, method: 'kendall_tau_b', concordant: 2, discordant: 1, value: 0.3333 });
    // no item was created in this window: precision and recall abstain; the verdict says so
    expect(ev['verdict']).toBe('abstained');
    expect(String(ev['reason'])).toMatch(/ranking stability tau-b 0\.3333/);
    sixEvidence('E2', { fault_trace: null, watermark: { window: [W0.toISOString(), W1.toISOString()] }, consumer_behaviour: { tau_b: 0.3333 }, operator_action: 'the executive evaluates the window',
      recovery: 'none needed', reconciliation: { ranked: 3, concordant: 2, discordant: 1 } });
  }, 120_000);
});
