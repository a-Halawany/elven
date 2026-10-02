/**
 * CP-6 B24 (migration 0086 §M) — THE MATERIALITY COMPLETION: the five further dimensions (probability, exposure, strategic relevance,
 * information value, irreversibility) judged only where a class's policy sets their thresholds, the REQUIRED dimension that abstains,
 * the ENFORCED OVERLOAD RULE (an owner at the cap receives a non-exempt material item as deprioritized — waiting, visible, with its
 * overload record; C3 and C4 never held for capacity, whatever the policy says), the transparent RANK, the REBALANCE (the operator's
 * route and the attention tick's step) and the DEPRIORITIZED VIEW with its elevation explanations — on a real database, the world of
 * `bootDecisionWorld` and B24's own humans with sessions of their own (the ports compare the acting principal).
 *
 * How the queue is fed here: M1–M4 drive executive.route_attention_item AS THE ATTENTION SUBSCRIBER DRIVES IT (inCommitContext bound to
 * executive.attention.subscription.apply) with the dimensions stated in each case — the engine, the route and the rebalance are under
 * test, not a producer. M5 drives the REAL consumer (AttentionConsumer.applyItem, the same capability the dispatcher hands it) on real
 * records — a real package version's terms, a real forecast cited by a real option and a scenario, a real warning raised by a real
 * indicator evaluation — and reads executive.attention_dimensions (the function the consumers call) for the classes whose signal this
 * file does not produce (an unfit verdict needs the B21 assessment path, covered by the B22 harness A3). No timer is awaited: the tick
 * step is run through the registry directly (the timer host is another part's).
 *
 *   M1 · a dimension with no threshold → every B22 reason unchanged (the engine on B22's own pinned dims; the real warning's reasons).
 *   M2 · REQUIRE: a required dimension with no input → abstained (deprioritized, the reason said); present → judged (material / below).
 *   M3 · OVERLOAD: the cap → C1 and C2 items held (item.overload_deprioritized, the record); C3 exempt under a policy that says C4; the
 *        refusals (409, 403, 404); the rebalance elevates in rank order (item.elevated, the explanation), idempotent; a policy change never
 *        routes a waiting item afresh (awaiting_rebalance); the tick step elevates it; the deprioritized view; BRF@v2's stateAsOf.
 *   M4 · RANK: the order and the explanation, deterministic (the SQL key, the view's order, the same dims → the same rank).
 *   M5 · REAL INPUTS: material_change irreversibility / information value / strategic relevance from the package version, forecast
 *        exposure and strategic relevance, the warning's probability bracket and database-clock window; the null ones declared.
 *
 * EACH CASE LOGS ONE `B24 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import { ExecutiveCapability } from '../../src/executive/executive.capabilities.js';
import { AttentionConsumer } from '../../src/executive/attention/attention.consumers.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { stateAsOf } from '../../src/executive/briefings/attention-section.js';
import type { FlatEvent } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b24m-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Item = { item_id: string; signal_class: string; outcome: string; state: string; owner_principal_id: string | null; route_roles: string[]; policy_version: number | null; evaluation: Row; due_at: Date | null; escalations: number; created_at: Date; updated_at: Date };

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let exec: ExecutiveController; let prediction: PredictionController; let consumer: AttentionConsumer; let registry: AttentionTickRegistry;
let executive: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let capOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B24 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
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

/* ───────────── the rows ───────────── */
const itemRow = async (itemId: string): Promise<Item> => (await sql<Item>`select item_id::text, signal_class, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, escalations, created_at, updated_at from executive.attention_items where item_id = ${itemId}::uuid`.execute(su)).rows[0]!;
const itemEvents = async (itemId: string) => (await sql<{ event: string; actor: string; details: Row; occurred_at: Date }>`select event, actor_principal_id::text actor, details, occurred_at from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const itemsOf = async (signalClass: string, subjectId: string): Promise<Item[]> => (await sql<Item>`select item_id::text, signal_class, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, escalations, created_at, updated_at from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${signalClass} and subject_id = ${subjectId}::uuid order by created_at`.execute(su)).rows;
const evaluate = async (rules: unknown, cls: string, dims: Row): Promise<Row> => (await sql<{ r: Row }>`select executive.evaluate_attention(${rules === null ? null : JSON.stringify(rules)}::jsonb, ${cls}, ${JSON.stringify(dims)}::jsonb) r`.execute(su)).rows[0]!.r;

/* ───────────── the ports, driven as their drivers drive them ───────────── */
const commitDb = () => h.app.get<Db>(COMMIT_DB);
/** A transaction bound to an action under the executive's session (the port reads the bound action and the acting principal). */
const bound = <X>(action: string, body: (tx: never) => Promise<X>, as: AuthenticatedPrincipal = executive): Promise<X> =>
  inCommitContext(commitDb(), { sessionId: as.sessionId, contextKey: as.contextKey }, { tenantId: T(), domainId: D() }, action, uuidv7(), body);
const SUB = 'executive.attention.subscription.apply';
/** executive.route_attention_item as the attention subscriber calls it: one new item per (class, subject, cause). */
const routeItem = (cls: string, subjectKind: string, owner: string | null, dims: Row, title: string, subjectId = uuidv7(), causeId = uuidv7()): Promise<Row> => bound(SUB, async (tx) =>
  (await sql<{ r: Row }>`select executive.route_attention_item(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${cls}, ${subjectKind}, ${subjectId}::uuid, ${causeId}::uuid, 'B24Harness',
    ${owner}::uuid, ${JSON.stringify(dims)}::jsonb, ${title}, '{}'::jsonb, ${executive.principalId}::uuid, ${uuidv7()}::uuid) r`.execute(tx)).rows[0]!.r);
const reevaluate = (itemId: string): Promise<Row> => bound(SUB, async (tx) =>
  (await sql<{ r: Row }>`select executive.reevaluate_attention_item(${itemId}::uuid, ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, ${executive.principalId}::uuid, ${uuidv7()}::uuid) r`.execute(tx)).rows[0]!.r);
const dimensionsOf = (cls: string, subjectId: string, hint: Row = {}): Promise<Row> => bound(SUB, async (tx) =>
  (await sql<{ r: Row }>`select executive.attention_dimensions(${T()}::uuid, ${D()}::uuid, ${cls}, ${subjectId}::uuid, ${JSON.stringify(hint)}::jsonb) r`.execute(tx)).rows[0]!.r);
/** The REAL attention consumer on one item of a flat event, with the capability the dispatcher hands it. */
const applyAttention = (event: FlatEvent, item: string): Promise<{ effect: string; effectRef: string | null; details: Row }> => bound(SUB, async (tx) =>
  consumer.applyItem(ExecutiveCapability.attentionSubscriber(tx, SUB), { tenantId: T(), domainId: D() }, event, item, executive.principalId, uuidv7(), uuidv7()) as Promise<{ effect: string; effectRef: string | null; details: Row }>);
/** The attention tick's `rebalance` step, run as the timer host runs it (a transaction bound to executive.attention.tick). */
const tickRebalance = (): Promise<Row> => {
  const step = registry.steps().find((s) => s.name === 'rebalance')!;
  return bound('executive.attention.tick', async (tx) => step.run({ tx, tenantId: T(), domainId: D(), agentPrincipalId: executive.principalId, tickKey: Math.floor(Date.now() / 60_000), correlationId: uuidv7() }));
};

/* ───────────── the routes (in process) ───────────── */
const publish = (as: AuthenticatedPrincipal, rules: unknown, reason: string) => exec.publishAttentionPolicy(h.req(as, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const rebalance = (as = executive) => exec.rebalanceAttention(h.req(as, 'executive.attention.rebalance', 'ATI', null, 'executive'), T(), D()) as unknown as Promise<{ rebalance: { elevated: Array<{ item_id: string; to_state: string; explanation: string }>; waiting: string[]; at: string } }>;
const deprioritized = (as = executive) => exec.deprioritizedAttention(h.req(as, 'executive.attention.read', 'ATI', null, 'executive'), T(), D()) as unknown as Promise<{ waiting: Row[]; below: Row[]; elevated: Row[]; overload: Row | null }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string) => exec.acknowledgeAttentionItem(h.req(as, 'executive.attention.item.acknowledge', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: {} }) as unknown as Promise<{ item: Row }>;
const close = (as: AuthenticatedPrincipal, itemId: string, note: string) => exec.closeAttentionItem(h.req(as, 'executive.attention.item.close', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: { note } }) as unknown as Promise<{ item: Row }>;
const getItem = (itemId: string) => exec.getAttentionItem(h.req(executive, 'executive.attention.read', 'ATI', itemId, 'executive'), T(), D(), itemId) as unknown as Promise<{ item: Row }>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ warnings: Array<{ warningId: string; branchId: string }> }>;

/* ───────────── the policy ───────────── */
/** B22's own pinned rules (phase6-attention-b22 RULES_V1/V2): the reasons they produce must not move by a byte. */
const B22_FORECAST = { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 2, suppression: { allowed: false }, notify: 'in_app' };
const B22_WARNING_V2 = { materiality: { min_consequence: 'C2', min_confidence: 0.6, max_hours_to_window: 120 }, route_roles: ['strategy_owner', 'executive'], ack_within_minutes: 60, escalate_to_roles: ['executive', 'domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' };
const RULES = (cap = 2, exempt = 'C4'): Row => ({
  classes: {
    // no further threshold: the B22 reasons exactly (M1, M5's warning)
    'warning.raised': B22_WARNING_V2,
    // a REQUIRED probability (M2)
    'forecast.unfit': { ...B22_FORECAST, materiality: { min_consequence: 'C1', min_confidence: 0.5, min_probability: 0.5, require: ['probability'] } },
    // the package's terms judged (M5)
    'decision.material_change': { materiality: { min_consequence: 'C1', min_confidence: 0.5, min_strategic_relevance: 0.5, min_information_value: 0.1, min_irreversibility: 'costly' }, route_roles: ['decision_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
    // every signal material (the overload's subject, M3)
    'source.coverage_loss': { materiality: { min_consequence: 'C0', min_confidence: 0 }, route_roles: ['collection_manager'], ack_within_minutes: 120, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 48 }, notify: 'in_app' },
    // every signal below the threshold (the ranked below-threshold view, M4)
    'proposal.review': { materiality: { min_consequence: 'C4', min_confidence: 0.5 }, route_roles: ['knowledge_owner'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
  },
  // the enforced rule; exempt C4 in the policy — the port still exempts C3 (PR-44-005)
  overload: { max_open_per_owner: cap, window_hours: 24, exempt_min_consequence: exempt },
});

/** What the cases leave one another. */
let a1 = ''; let a2 = ''; let a3 = ''; let a4 = ''; let a5 = ''; let a6 = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  exec = h.app.get(Ec); prediction = h.app.get(Pc); consumer = h.app.get(AttentionConsumer); registry = h.app.get(AttentionTickRegistry);
  executive = await h.humanWithSession(['executive'], 'b24m-executive');
  dadmin = await h.humanWithSession(['domain_admin'], 'b24m-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b24m-analyst');
  capOwner = await h.humanWithSession(['collection_manager'], 'b24m-cap-owner');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b24m-forecast-owner');
  await h.humanWithSession(['knowledge_owner'], 'b24m-knowledge-owner');
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B24 · materiality: the further dimensions, the enforced overload rule, the rank, the deprioritized view (0086 §M; F-P6-07)', () => {
  it('M1 · a further dimension with NO threshold changes no B22 reason: the engine on B22\'s pinned dims (A3, A5) with the new dims present; the policy validation of the new keys (422) and the PDP (403)', async () => {
    const b22 = { classes: { 'forecast.unfit': B22_FORECAST, 'warning.raised': B22_WARNING_V2 }, overload: { max_open_per_role: 50 } };
    const further = { probability: 0.3, exposure: 4, strategic_relevance: 1, information_value: 0.2, irreversibility: 'irreversible' };
    // A3's pin: ['consequence C1 at or above C1', 'confidence 1 at or above 0.5'] — with and without the further dims
    const a3Plain = await evaluate(b22, 'forecast.unfit', { consequence: 'C1', confidence: 1, hours_to_window: null, fitness_class: 'data_shift', scenarios: 0, packages: 0 });
    const a3More = await evaluate(b22, 'forecast.unfit', { consequence: 'C1', confidence: 1, hours_to_window: null, fitness_class: 'data_shift', scenarios: 0, packages: 0, ...further });
    expect(a3Plain['reasons']).toEqual(['consequence C1 at or above C1', 'confidence 1 at or above 0.5']);
    expect(a3More['reasons']).toEqual(a3Plain['reasons']);
    expect(a3More['outcome']).toBe('material');
    // A5's pins: the window reason last, within and beyond
    const a5 = await evaluate(b22, 'warning.raised', { consequence: 'C2', confidence: 0.8, hours_to_window: 47.9, level: 'L2', ...further });
    expect(a5['reasons']).toEqual(['consequence C2 at or above C2', 'confidence 0.8 at or above 0.6', '47.9 hours to the response window, within 120']);
    const slow = await evaluate(b22, 'warning.raised', { consequence: 'C2', confidence: 0.8, hours_to_window: 399.5, ...further });
    expect((slow['reasons'] as string[]).at(-1)).toBe('399.5 hours to the response window, beyond 120');
    expect(slow['outcome']).toBe('below_threshold');
    // the abstentions keep their words
    expect((await evaluate(null, 'warning.raised', further))['reasons']).toEqual(['no attention policy is published for this domain']);
    expect((await evaluate(b22, 'forecast.unfit', { confidence: 1, ...further }))['reasons']).toEqual(['the signal carries no consequence class to judge']);
    // every evaluation carries the rank (no weighted score)
    expect(obj(a5['rank'])['explanation']).toBe('consequence C2 · 47.9 h to the window · confidence 0.8 · exposure 4 · strategic relevance 1');
    expect(Object.keys(obj(obj(a5['rank'])['tuple']))).toEqual(['exposure', 'confidence', 'consequence', 'hours_to_window', 'strategic_relevance']);

    /* THE POLICY: the new keys validated (the prelude's port), the PDP refuses an analyst, the version published. */
    const withMat = (k: string, v: unknown): Row => { const r = RULES(); const cl = r['classes'] as Record<string, Row>; cl['forecast.unfit'] = { ...cl['forecast.unfit'], materiality: { min_consequence: 'C1', min_confidence: 0.5, [k]: v } }; return r; };
    await refused(publish(executive, withMat('min_exposure', -1), 'a negative exposure floor (harness)'), /^attention policy rejected: class forecast\.unfit materiality\.min_exposure is a number ≥ 0/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withMat('min_irreversibility', 'maybe'), 'an irreversibility outside the vocabulary (harness)'), /^attention policy rejected: class forecast\.unfit materiality\.min_irreversibility is reversible \| costly \| irreversible/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withMat('require', ['novelty']), 'a required dimension that does not exist (harness)'), /^attention policy rejected: class forecast\.unfit materiality\.require lists dimensions among/, 422, 'EYE-REQ-001');
    await refused(publish(executive, { ...RULES(), overload: { max_open_per_owner: 2, exempt_min_consequence: 'C0' } }, 'an exemption that exempts nothing (harness)'), /^attention policy rejected: overload\.exempt_min_consequence is C1\.\.C4/, 422, 'EYE-REQ-001');
    expect((await refusal(publish(analyst, RULES(), 'the analyst may not set the policy (harness)'))).status).toBe(403);
    const p1 = (await publish(executive, RULES(), 'B24: the further dimensions and the enforced overload rule (harness)')).policy;
    expect(p1['version']).toBe(1);
    sixEvidence('M1', { fault_trace: { refused: ['422 min_exposure', '422 min_irreversibility', '422 require', '422 exempt C0', '403 analyst'] }, watermark: { a3: a3More['reasons'], a5: a5['reasons'] },
      consumer_behaviour: 'no threshold → not judged, no reason added', operator_action: 'the executive publishes v1', recovery: 'none needed', reconciliation: { policy_version: p1['version'] } });
  }, 300_000);

  it('M2 · REQUIRE: forecast.unfit requires probability — no input → ABSTAINED (deprioritized, "probability: no input, not judged" and the abstention said); 0.9 → material; 0.2 → below the threshold', async () => {
    const none = await routeItem('forecast.unfit', 'forecast', null, { consequence: 'C2', confidence: 1, hours_to_window: null }, 'B24 M2: an unfit forecast with no probability');
    expect(none).toMatchObject({ outcome: 'abstained', state: 'deprioritized', policy_version: 1 });
    expect(obj(none['evaluation'])['reasons']).toEqual(['consequence C2 at or above C1', 'confidence 1 at or above 0.5', 'probability: no input, not judged', 'abstained: the class requires probability, which the signal does not carry']);
    const hi = await routeItem('forecast.unfit', 'forecast', null, { consequence: 'C2', confidence: 1, hours_to_window: null, probability: 0.9 }, 'B24 M2: an unfit forecast, probability 0.9');
    expect(hi).toMatchObject({ outcome: 'material', state: 'open' });
    expect(obj(hi['evaluation'])['reasons']).toEqual(['consequence C2 at or above C1', 'confidence 1 at or above 0.5', 'probability 0.9 at or above 0.5']);
    const lo = await routeItem('forecast.unfit', 'forecast', null, { consequence: 'C2', confidence: 1, hours_to_window: null, probability: 0.2 }, 'B24 M2: an unfit forecast, probability 0.2');
    expect(lo).toMatchObject({ outcome: 'below_threshold', state: 'deprioritized' });
    expect((obj(lo['evaluation'])['reasons'] as string[]).at(-1)).toBe('probability 0.2 below the threshold 0.5');
    // a threshold on a missing dimension that is NOT required: said, judged no further, not an abstention
    const notReq = await evaluate({ classes: { 'forecast.unfit': { ...B22_FORECAST, materiality: { min_consequence: 'C1', min_confidence: 0.5, min_exposure: 1 } } } }, 'forecast.unfit', { consequence: 'C2', confidence: 1 });
    expect(notReq).toMatchObject({ outcome: 'material', reasons: ['consequence C2 at or above C1', 'confidence 1 at or above 0.5', 'exposure: no input, not judged'] });
    // RECOVERY: the same signal again (a redelivery) answers the item it made — no second item
    const key = (await sql<{ s: string; c: string }>`select subject_id::text s, cause_event_id::text c from executive.attention_items where item_id = ${String(none['item_id'])}::uuid`.execute(su)).rows[0]!;
    const again = await routeItem('forecast.unfit', 'forecast', null, { consequence: 'C2', confidence: 1, probability: 0.9 }, 'B24 M2: the same signal again', key.s, key.c);
    expect(again).toMatchObject({ item_id: none['item_id'], repeated: true, outcome: 'abstained' });
    sixEvidence('M2', { fault_trace: { required: 'probability', missing: none['item_id'] }, watermark: { abstained: none['item_id'], material: hi['item_id'], below: lo['item_id'] },
      consumer_behaviour: obj(none['evaluation'])['reasons'], operator_action: 'none: the abstention is visible in the deprioritized view', recovery: { redelivery: 'repeated, no second item' }, reconciliation: { states: [none['state'], hi['state'], lo['state']] } });
  }, 120_000);

  it('M3 · OVERLOAD: the cap (2 per owner in 24 h) → a C1 and a C2 item HELD (item.overload_deprioritized, the record); C3 and C4 exempt although the policy says C4; the refusals; the rebalance elevates in RANK order (item.elevated, the explanation) and is idempotent; a policy change never routes a waiting item afresh; the tick step elevates it; the view; BRF@v2 reads the log', async () => {
    const O = capOwner.principalId;
    const cov = (cons: string, title: string) => routeItem('source.coverage_loss', 'source', O, { consequence: cons, confidence: 0.8, hours_to_window: null, exposure: 1 }, title);
    a1 = String((await cov('C1', 'B24 M3: coverage loss a1')).item_id);
    a2 = String((await cov('C1', 'B24 M3: coverage loss a2')).item_id);
    expect([(await itemRow(a1)).state, (await itemRow(a2)).state]).toEqual(['open', 'open']);
    /* HELD: the owner is at the cap — a C1 and a C2 item wait, material, with the record. */
    const r3 = await cov('C1', 'B24 M3: coverage loss a3 (held)'); a3 = String(r3.item_id);
    const r4 = await cov('C2', 'B24 M3: coverage loss a4 (held)'); a4 = String(r4.item_id);
    for (const [r, id] of [[r3, a3], [r4, a4]] as const) {
      expect(r).toMatchObject({ outcome: 'material', state: 'deprioritized', due_at: null });
      const x = await itemRow(id);
      expect(x).toMatchObject({ outcome: 'material', state: 'deprioritized', owner_principal_id: O, route_roles: ['collection_manager'], due_at: null });
      expect(obj(x.evaluation['overload'])).toMatchObject({ cap: 2, open: 2, window_hours: 24, owner: O, exempt_min_consequence: 'C3', policy_exempt_min_consequence: 'C4' });
      expect(obj(x.evaluation['overload'])['displaced_by']).toEqual([a1, a2]);
      expect(String(obj(x.evaluation['overload'])['rule'])).toMatch(/^the owner holds 2 open or escalated item\(s\) moved into the queue within 24 h, at the cap 2; a C[12] item \(below the exemption C3\) waits/);
      // the engine's reasons are untouched by the overload (it is the route's verdict, recorded beside them)
      expect(x.evaluation['reasons']).toEqual([`consequence ${String(obj(x.evaluation['dimensions'])['consequence'])} at or above C0`, 'confidence 0.8 at or above 0']);
      const evs = await itemEvents(id);
      expect(evs.map((e) => e.event)).toEqual(['item.overload_deprioritized']);
      expect(evs[0]!.details).toMatchObject({ outcome: 'material', policy_version: 1, overload: { cap: 2, open: 2 } });
    }
    /* EXEMPT: C3 and C4 are never held for capacity, whatever the policy says (it says C4). */
    a5 = String((await cov('C3', 'B24 M3: coverage loss a5 (C3, exempt)')).item_id);
    a6 = String((await cov('C4', 'B24 M3: coverage loss a6 (C4, exempt)')).item_id);
    expect([(await itemRow(a5)).state, (await itemRow(a6)).state]).toEqual(['open', 'open']);
    expect((await itemEvents(a5)).map((e) => e.event)).toEqual(['item.routed']);
    expect((await sql<{ c3: boolean; c2: boolean }>`select executive.attention_overload_exempt('{"overload":{"max_open_per_owner":1,"exempt_min_consequence":"C4"}}', '{"consequence":"C3"}') c3,
      executive.attention_overload_exempt('{"overload":{"max_open_per_owner":1,"exempt_min_consequence":"C4"}}', '{"consequence":"C2"}') c2`.execute(su)).rows[0]).toEqual({ c3: true, c2: false });
    /* REFUSALS: a held item is not acknowledged (409 — it is not routed yet); the PDP refuses the analyst the rebalance (403); an unknown item (404). */
    await refused(acknowledge(capOwner, a3), /^attention item rejected: item .* is deprioritized; only an open, escalated or unrouted item is acknowledged/, 409, 'EYE-STA-002');
    expect(await refusal(rebalance(analyst))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(await refusal(getItem(uuidv7()))).toMatchObject({ status: 404 });
    // the port compares the acting principal (a route is always its own principal; the port says so for anyone else)
    await refused(bound('executive.attention.rebalance', async (tx) => sql`select executive.rebalance_attention(${T()}::uuid, ${D()}::uuid, ${dadmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx)),
      /^attention rebalance rejected: rebalanced by the acting principal/, 403, 'EYE-AUT-001');
    /* NO CAPACITY: nothing elevated, both wait (rank order: the C2 first). */
    const r0 = (await rebalance()).rebalance;
    expect(r0.elevated).toEqual([]);
    expect(r0.waiting).toEqual([a4, a3]);
    /* CAPACITY FREES: a1, a2, a5 closed → the owner holds a6 alone → ONE place: the C2 (a4) is elevated, the C1 (a3) waits. */
    for (const id of [a1, a2, a5]) await close(capOwner, id, 'handled (harness)');
    const r1 = (await rebalance()).rebalance;
    expect(r1.elevated.map((e) => e.item_id)).toEqual([a4]);
    expect(r1.waiting).toEqual([a3]);
    expect(r1.elevated[0]!.explanation).toBe('capacity freed: the owner holds 1 of 2 open or escalated item(s) moved into the queue within 24 h; elevated as the highest-ranked item waiting — consequence C2 · no response window · confidence 0.8 · exposure 1 · strategic relevance: no input');
    const x4 = await itemRow(a4);
    expect(x4).toMatchObject({ state: 'open', outcome: 'material', route_roles: ['collection_manager'] });
    expect(x4.due_at).not.toBeNull();
    const dbNow = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    expect(x4.due_at!.getTime()).toBeGreaterThan(dbNow.getTime() + 110 * 60_000);
    expect(obj(x4.evaluation['elevation'])).toMatchObject({ exempt: false, capacity: { cap: 2, open: 1 } });
    const e4 = await itemEvents(a4);
    expect(e4.map((e) => e.event)).toEqual(['item.overload_deprioritized', 'item.elevated']);
    expect(e4[1]!.details).toMatchObject({ from_state: 'deprioritized', to_state: 'open', policy_version: 1, exempt: false, explanation: r1.elevated[0]!.explanation });
    expect(e4[1]!.actor).toBe(executive.principalId);
    // RECOVERY: a second rebalance elevates nothing more (the owner is at the cap again: a6 + a4)
    const r2 = (await rebalance()).rebalance;
    expect(r2.elevated).toEqual([]);
    expect(r2.waiting).toEqual([a3]);
    /* A POLICY CHANGE (cap 3) and its re-evaluation: the waiting item is NOT routed afresh past the queue — it keeps its place, awaiting the rebalance. */
    const p2 = (await publish(executive, RULES(3), 'B24: the cap raised to three per owner (harness)')).policy;
    expect(p2['version']).toBe(2);
    const re = await reevaluate(a3);
    expect(re).toMatchObject({ changed: true, from_version: 1, to_version: 2, from_state: 'deprioritized', to_state: 'deprioritized', to_outcome: 'material' });
    const x3 = await itemRow(a3);
    expect(x3).toMatchObject({ state: 'deprioritized', policy_version: 2, due_at: null });
    expect(obj(x3.evaluation['overload'])).toMatchObject({ awaiting_rebalance: true, cap: 2 });
    expect(String(obj(x3.evaluation['overload'])['note'])).toBe('policy version 2 frees this item from the overload rule; the rebalance elevates the waiting items in rank order');
    expect((await itemEvents(a3)).at(-1)!.details).toMatchObject({ from_state: 'deprioritized', to_state: 'deprioritized', overload: { awaiting_rebalance: true } });
    /* THE DEPRIORITIZED VIEW before the tick: a3 waits with its record and rank; a4's elevation explained. */
    const v1 = await deprioritized();
    const w3 = v1.waiting.find((r) => r['item_id'] === a3)!;
    expect(w3).toMatchObject({ outcome: 'material', owner_principal_id: O, policy_version: 2, overload: { awaiting_rebalance: true } });
    expect(obj(w3['rank'])['explanation']).toBe('consequence C1 · no response window · confidence 0.8 · exposure 1 · strategic relevance: no input');
    expect(v1.elevated.find((r) => r['item_id'] === a4)).toMatchObject({ to_state: 'open', state_now: 'open', exempt: false, explanation: r1.elevated[0]!.explanation });
    expect(v1.overload).toMatchObject({ policy_version: 2, max_open_per_owner: 3, window_hours: 24, exempt_min_consequence: 'C4', enforced: true, legacy_max_open_per_role: null });
    /* THE TICK'S STEP (order 20, run as the timer host runs it): a3 elevated under version 2 (the owner holds 2 of 3); a second tick elevates nothing. */
    const step = registry.steps().find((s) => s.name === 'rebalance')!;
    expect(step.order).toBe(20);
    const t1 = await tickRebalance();
    expect(t1).toMatchObject({ elevated: 1, waiting: 0, items: [a3] });
    expect(await tickRebalance()).toMatchObject({ elevated: 0, waiting: 0, items: [] });
    const e3 = await itemEvents(a3);
    expect(e3.map((e) => e.event)).toEqual(['item.overload_deprioritized', 'item.reevaluated', 'item.elevated']);
    expect(String(e3[2]!.details['explanation'])).toMatch(/^capacity freed: the owner holds 2 of 3 open or escalated item\(s\) moved into the queue within 24 h; elevated as the highest-ranked item waiting — consequence C1/);
    expect((await itemRow(a3))).toMatchObject({ state: 'open', policy_version: 2 });
    /* BRF@v2: the edition's state as of an instant reads the two new events (held → elevated). */
    const at0 = e3[0]!.occurred_at.toISOString(); const at2 = e3[2]!.occurred_at.toISOString();
    expect(stateAsOf(e3, at0)).toEqual({ state: 'deprioritized', policy_version: 1, acknowledged: false });
    expect(stateAsOf(e3, at2)).toEqual({ state: 'open', policy_version: 2, acknowledged: false });
    sixEvidence('M3', { fault_trace: { cap: 2, held: [a3, a4], exempt: [a5, a6], refused: ['409 acknowledge held', '403 analyst rebalance', '403 port actor', '404 unknown item'] },
      watermark: { elevated_by_route: r1.elevated.map((e) => e.item_id), elevated_by_tick: t1['items'] }, consumer_behaviour: { reevaluated: re },
      operator_action: 'the owner closes three items; the executive rebalances; the executive raises the cap (v2)', recovery: { second_rebalance: r2.elevated.length, second_tick: 0 },
      reconciliation: { a3: e3.map((e) => e.event), a4: e4.map((e) => e.event) } });
  }, 180_000);

  it('M4 · RANK: lexicographic and explained — consequence, then the window (sooner first), then confidence, exposure, strategic relevance; no input ranks last; the view\'s order is the key\'s; the same dims give the same rank', async () => {
    const dims: Array<[string, Row]> = [
      ['C2 · 10 h', { consequence: 'C2', confidence: 0.9, hours_to_window: 10 }],
      ['C2 · 5 h', { consequence: 'C2', confidence: 0.5, hours_to_window: 5 }],
      ['C3 · no window', { consequence: 'C3', confidence: 0.1, hours_to_window: null }],
      ['C2 · 5 h · exposure 3', { consequence: 'C2', confidence: 0.5, hours_to_window: 5, exposure: 3 }],
      ['C2 · 5 h · exposure 3 · relevance 1', { consequence: 'C2', confidence: 0.5, hours_to_window: 5, exposure: 3, strategic_relevance: 1 }],
    ];
    const ids: Record<string, string> = {};
    for (const [label, d] of dims) {
      const r = await routeItem('proposal.review', 'claim', null, d, `B24 M4: ${label}`);
      expect(r).toMatchObject({ outcome: 'below_threshold', state: 'deprioritized' });
      ids[label] = String(r['item_id']);
    }
    const expected = ['C3 · no window', 'C2 · 5 h · exposure 3 · relevance 1', 'C2 · 5 h · exposure 3', 'C2 · 5 h', 'C2 · 10 h'].map((l) => ids[l]);
    const view = await deprioritized();
    const order = view.below.map((r) => String(r['item_id'])).filter((id) => Object.values(ids).includes(id));
    expect(order).toEqual(expected);
    // the SQL key is the same order (ascending = first in the queue)
    const keyed = (await sql<{ item_id: string }>`select item_id::text from executive.attention_items where item_id = any(${Object.values(ids)}::uuid[]) order by executive.attention_rank_key(evaluation -> 'dimensions'), created_at, item_id`.execute(su)).rows.map((r) => r.item_id);
    expect(keyed).toEqual(expected);
    const top = view.below.find((r) => r['item_id'] === ids['C2 · 5 h · exposure 3 · relevance 1'])!;
    expect(obj(top['rank'])).toMatchObject({ explanation: 'consequence C2 · 5.0 h to the window · confidence 0.5 · exposure 3 · strategic relevance 1',
      tuple: { consequence: 'C2', hours_to_window: 5, confidence: 0.5, exposure: 3, strategic_relevance: 1 } });
    expect(String(obj(top['rank'])['rule'])).toMatch(/^lexicographic: the first dimension that differs decides; a dimension with no input ranks after one with; no weighted score$/);
    expect(top['reasons']).toEqual(['consequence C2 below the threshold C4', 'confidence 0.5 at or above 0.5']);
    // DETERMINISTIC: the same dims, the same rank (the stored one and a fresh evaluation), byte for byte
    const again = await evaluate(RULES(), 'proposal.review', dims[4]![1]);
    expect(JSON.stringify(again['rank'])).toBe(JSON.stringify(obj((await itemRow(ids['C2 · 5 h · exposure 3 · relevance 1']!)).evaluation)['rank']));
    sixEvidence('M4', { fault_trace: { items: Object.keys(ids) }, watermark: { order: expected }, consumer_behaviour: 'no score: the first differing dimension decides',
      operator_action: 'none', recovery: 'a re-evaluation of the same dims gives the same rank', reconciliation: { view_equals_key: true } });
  }, 120_000);

  it('M5 · REAL INPUTS: a package version\'s terms (irreversibility, information value, strategic relevance, exposure) through the real consumer; a forecast\'s exposure and strategic relevance; a real warning\'s probability bracket and database-clock window; the null ones declared', async () => {
    /* THE PACKAGE: the fixture's terms — "reversible within one sailing", "a week of observation would not change the ranking", the objective. */
    const d1 = await c.fullDraft();
    await c.option(d1.pkg, d1.v, { key: 'on-forecast', title: 'Act on the transit forecast (B24)', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: w.forecastId, version: 1 }] });
    const d2 = await c.fullDraft({ terms: { reversibility: 'Irreversible: the booking cannot be undone', informationValue: 'High: the next sailing report would change the ranking' } });
    const mcr = (pkg: string, v: number): FlatEvent => ({ event_id: uuidv7(), event_type: 'MaterialChangeRaised', payload: {
      schema: 'MaterialChangeRaised', schema_version: 'v1', package_id: pkg, version: v, title: 'B24 M5', owner: w.owner.principalId, executed: false, disposition: 'human_review',
      trigger: { event_id: uuidv7(), change_kind: 'forecast.withdrawn', note_id: null }, dims: { consequence: 'C2', confidence: 1, hours_to_window: null, basis: 'categorical' }, policy_version: 2 } });
    const m1 = await applyAttention(mcr(d1.pkg, d1.v), `package:${d1.pkg}`);
    expect(m1.effect).toBe('attention.routed');
    const [i1] = await itemsOf('decision.material_change', d1.pkg);
    const dm1 = obj(i1!.evaluation['dimensions']);
    expect(dm1).toMatchObject({ consequence: 'C2', confidence: 1, irreversibility: 'reversible', information_value: 0.2, strategic_relevance: 1, exposure: 0, probability: null });
    expect(obj(dm1['dimension_basis'])).toMatchObject({ version: d1.v, reversibility_text: 'reversible within one sailing', information_value_word: 'low',
      strategic_relevance: { objectives_named: 1, objectives_live: 1, decision_links_to_objectives: 1 } });
    expect(i1).toMatchObject({ outcome: 'below_threshold', state: 'deprioritized' });
    expect(i1!.evaluation['reasons']).toEqual(['consequence C2 at or above C1', 'confidence 1 at or above 0.5', 'strategic_relevance 1 at or above 0.5', 'information_value 0.2 at or above 0.1', 'irreversibility reversible below the threshold costly']);
    await applyAttention(mcr(d2.pkg, d2.v), `package:${d2.pkg}`);
    const [i2] = await itemsOf('decision.material_change', d2.pkg);
    expect(obj(i2!.evaluation['dimensions'])).toMatchObject({ irreversibility: 'irreversible', information_value: 0.8, strategic_relevance: 1 });
    expect(i2).toMatchObject({ outcome: 'material', state: 'open', owner_principal_id: w.owner.principalId });
    expect((i2!.evaluation['reasons'] as string[]).at(-1)).toBe('irreversibility irreversible at or above costly');
    /* THE FORECAST: exposure = the scenario on it + the package whose option cites it; strategic relevance from that package's objectives. */
    const fd = await dimensionsOf('forecast.unfit', w.forecastId);
    expect(fd).toMatchObject({ exposure: 2, strategic_relevance: 1, probability: null, information_value: null, irreversibility: null });
    expect(obj(obj(fd['dimension_basis'])['exposure'])).toEqual({ scenarios: 1, citing_packages: 1 });
    expect(obj(obj(fd['dimension_basis'])['strategic_relevance'])).toMatchObject({ package_id: d1.pkg, score: 1 });
    /* THE WARNING: a real indicator evaluation raises it; the real consumer routes it with the probability BRACKET and the window on the DB clock. */
    const ev = await evaluateIndicator(w.indicatorId);
    const warningId = ev.warnings.find((x) => x.branchId === w.branchId)!.warningId;
    const t0 = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    const m3 = await applyAttention({ event_id: uuidv7(), event_type: 'EarlyWarningRaised', payload: { warning_id: warningId } }, `warning:${warningId}`);
    expect(m3.effect).toBe('attention.routed');
    const [iw] = await itemsOf('warning.raised', warningId);
    const dw = obj(iw!.evaluation['dimensions']);
    const f = (await sql<{ q: Row; closes: Date }>`select f.quantiles q, (select response_window_closes_at from prediction.warnings_current where warning_id = ${warningId}::uuid) closes from prediction.forecasts_current f where f.forecast_id = ${w.forecastId}::uuid`.execute(su)).rows[0]!;
    const [q10, q50, q90] = ['q10', 'q50', 'q90'].map((k) => Number(f.q[k]));
    const bracket = 40 > q90! ? [0.9, 1] : 40 > q50! ? [0.5, 0.9] : 40 > q10! ? [0.1, 0.5] : [0, 0.1];
    expect(dw['probability']).toBe(bracket[0]);
    expect(obj(obj(dw['dimension_basis'])['probability'])).toMatchObject({ bracket, judged: 'the lower bound', comparator: '<', threshold: 40, forecast_id: w.forecastId, indicator_id: w.indicatorId });
    const expectedHours = (f.closes.getTime() - t0.getTime()) / 3_600_000;
    expect(Math.abs(Number(dw['hours_to_window']) - expectedHours)).toBeLessThan(0.2);
    expect(dw).toMatchObject({ exposure: null, strategic_relevance: null, information_value: null, irreversibility: null });
    // M1 on the real signal: no threshold on the further dims → exactly the B22 reasons
    expect(iw).toMatchObject({ outcome: 'material', state: 'open', owner_principal_id: w.twinOwner.principalId });
    expect((iw!.evaluation['reasons'] as string[]).slice(0, 2)).toEqual(['consequence C2 at or above C2', 'confidence 0.8 at or above 0.6']);
    expect(iw!.evaluation['reasons'] as string[]).toHaveLength(3);
    expect((iw!.evaluation['reasons'] as string[])[2]).toMatch(/^4[78](\.\d)? hours to the response window, within 120$/);
    /* THE NULL ONES, DECLARED: a held claim has none; a source with no marker is a real zero; the incoherent scenario's runs a real zero. */
    const pr = await dimensionsOf('proposal.review', uuidv7());
    expect(pr).toMatchObject({ probability: null, exposure: null, strategic_relevance: null, information_value: null, irreversibility: null, dimension_basis: { note: 'no further input exists for proposal.review' } });
    expect(await dimensionsOf('source.coverage_loss', h.fx.sourceId)).toMatchObject({ exposure: 0, probability: null, strategic_relevance: null });
    expect(await dimensionsOf('scenario.incoherent', w.scenarioId)).toMatchObject({ exposure: 0, dimension_basis: { exposure: { runs: 0, packages_citing_the_runs: 0 } } });
    sixEvidence('M5', { fault_trace: { packages: [d1.pkg, d2.pkg], forecast: w.forecastId, warning: warningId }, watermark: { package: dm1, forecast: fd, warning_probability: dw['probability'] },
      consumer_behaviour: { package: i1!.evaluation['reasons'], warning: iw!.evaluation['reasons'] }, operator_action: 'none: the dimensions come from the records',
      recovery: 'a re-read of the same records gives the same dimensions', reconciliation: { hours_db_clock: dw['hours_to_window'] } });
  }, 240_000);
});
