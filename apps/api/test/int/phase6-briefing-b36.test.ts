/**
 * CP-6 B36 (0094 §B) part `briefing` — THE LIVE BRIEFING STUDIO v2 COMPLETED: BRF@v3 (F-P6-12 completes), on the real database and
 * the real controllers (the Phase4Harness precedent; phase6-briefings' world: the corridor twin, the runs, the DEC, the named humans).
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case:
 *   b1 uncertainty per displayed conclusion — every item of a v3 edition carries its band and basis, computed by the composer (an
 *      evidence record with no recorded confidence rests on its truth state; nothing is invented); the port refuses an item without
 *      its band; the same instant recomposes to the same digest (the bands are content).
 *   b2 unavailable dependencies and omissions — a degraded source (planted through the source-health path, 0044's source_states →
 *      degraded) is declared as an omission naming the source; the port refuses an edition that met an unavailable dependency and
 *      declares none (`briefing rejected (undeclared_omission)`, 409); a healthy verdict recovers.
 *   b3 the audience contract, purpose, expiry — validated at composition; a member outside the audience's roles is refused the
 *      edition (403 `briefing rejected (audience)`); a malformed contract / expiry / purpose is 422; an expired edition reads
 *      `expired: true` and the tick step briefing-expiry (order 60, executive.attention.tick) records briefing.expired exactly once.
 *   b4 the suppression rule — a policy published by a named human (briefing.policy.set); a single-source STALE evidence item is
 *      withheld (suppressed with the rule and the measure, declared as an omission, briefing.suppressed on the ledger); the narrative
 *      cannot cite it; an approver cannot publish (403), malformed rules 422, unchanged rules 409; a relaxed version recovers.
 *   b5 disputed assessments and emerging indicators — a standing dissent is a `disputed` item with its as-of; a weak signal (planted
 *      as an analyst's nomination) is an `indicator` item with the band from its recorded confidence; a board audience carries disputed
 *      items only with the owner's note; the contract may exclude a section; a reader outside the audience is refused.
 *   b6 urgent-state retention during outage — under degraded sources the prior edition's warning still inside its response window is
 *      RETAINED with its original as-of and retained_from, the outage declared; a healthy verdict recovers.
 *   + the briefing agent composes through the same port and produces a v3 edition with the defaults (agents.service untouched).
 * Every figure is SYNTHETIC (the fixture world's); the demonstration is not touched. Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';

// The B6 rule: the scheduler (the attention timer's worker) is enabled BEFORE the boot, at module top; the verification Redis (:6392), never the demonstration's.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_REDIS_PORT'] = process.env['EYE_REDIS_PORT'] ?? '6392';

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let P: { pkg: string; v: number; digest: string };
let roomId = '';
let outsider: AuthenticatedPrincipal; let board: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let timer: AttentionTimerService; let scheduler: SchedulerService; let attentionAgentId = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dbNow = async (): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t.toISOString();
const plantHealth = (state: 'healthy' | 'degraded', reason: string) => sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, evidence_refs, reason, lag_class, correlation_id)
  values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${h.fx.sourceId}::uuid, null, ${state}, clock_timestamp(), 'fixture', 'fixture', '[]'::jsonb, ${reason}, 'none', ${uuidv7()}::uuid)`.execute(h.su);
const events = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from executive.briefing_events where briefing_id = ${id}::uuid order by occurred_at, event_id`.execute(h.su)).rows;
const setPolicy = (rules: unknown, reason: string, as = w.executive) => w.exec.setBriefingPolicy(h.req(as, 'briefing.policy.set', 'BRP', null, 'briefing'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const getPolicy = (as = w.executive) => w.exec.getBriefingPolicy(h.req(as, 'briefing.read', 'BRP', null, 'briefing'), T(), D(), { payload: {} }) as unknown as Promise<{ policy: Row | null; history: Row[] }>;
const compose = (payload: Row, as = w.executive) => c.compose(payload, as) as unknown as Promise<{ briefing: Row & { briefingId: string; contentDigest: string; items: Row[]; windows: Row[]; sourceStates: Row[]; degraded: boolean; omissions: Row[]; suppressed: Row[]; disputed: Row[]; indicators: Row[]; audience: Row; purpose: string; expiresAt: string; policyVersion: number | null; schemaVersion: string; knownAt: string } }>;
/** The port called DIRECTLY under a bound commit context (the composer's own session): the harness proves the port's own refusals. */
const portCompose = (as: AuthenticatedPrincipal, over: Row) => inCommitContext(h.app.get(COMMIT_DB), { sessionId: as.sessionId, contextKey: as.contextKey }, { tenantId: T(), domainId: D() }, 'briefing.compose', uuidv7(), async (tx) => {
  const knownAt = String(over['knownAt'] ?? new Date().toISOString());
  const a = { items: [] as unknown[], sourceStates: [] as unknown[], degraded: false, omissions: [] as unknown[], suppressed: [] as unknown[], disputed: [] as unknown[],
              audience: { roles: ['executive'], locale: 'en', accessibility: { plain_language: false, screen_reader: false }, channels: ['in-app'] }, purpose: 'a port-level probe of the v3 contract (SYNTHETIC)', expiresAt: new Date(new Date(knownAt).getTime() + 3_600_000).toISOString(), ...over };
  const attention = { as_of: knownAt, since: null, policy_version: null, items: [], counts: {}, material_changes_since_prior: [] };
  const watermark = { prior_briefing_id: null, prior_known_at: null, prior_composed_at: null, known_at: knownAt, projection: { memory: 'serving' } };
  return sql`select executive.compose_briefing(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, null::uuid, null::uuid, ${as.principalId}::uuid, 'human', null::uuid, ${knownAt}::timestamptz,
    null::uuid, ${JSON.stringify(watermark)}::jsonb, '[]'::jsonb, ${JSON.stringify(a.items)}::jsonb, '[]'::jsonb, ${JSON.stringify(a.sourceStates)}::jsonb, ${a.degraded},
    null, '[]'::jsonb, ${'a'.repeat(64)}, ${'b'.repeat(64)}, '{}'::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, '[]'::jsonb, 'v3', ${JSON.stringify(attention)}::jsonb,
    ${JSON.stringify(a.audience)}::jsonb, ${a.purpose}, ${a.expiresAt}::timestamptz, ${JSON.stringify(a.omissions)}::jsonb, ${JSON.stringify(a.suppressed)}::jsonb, ${JSON.stringify(a.disputed)}::jsonb, null::int) as r`.execute(tx as never);
});
const refused = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try { await p; return { status: 0, message: '' }; }
  catch (e) { const m = asObservationRefusal(e, uuidv7()); return m === null ? { status: -1, message: (e as Error).message } : { status: m.getStatus(), message: String((m.getResponse() as { message?: string }).message ?? '') }; }
};
const item = (b: { items: Row[] }, kind: string, pred: (i: Row) => boolean = () => true): Row | undefined => b.items.find((i) => i['kind'] === kind && pred(i));
const ITEM_AT = (i: Row) => ({ at: String(i['at']), item_id: String(i['item_id']), age: Number(obj(i['freshness'])['age_hours']) });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  timer = h.app.get(AttentionTimerService); scheduler = h.app.get(SchedulerService);
  outsider = await h.humanWithSession(['executive'], 'b36-executive-outside');
  board = await h.humanWithSession(['board_member'], 'b36-board-member');
  operator = await h.humanWithSession(['executive_operator'], 'b36-executive-operator');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36-tenant-admin', 'TENANT');
  P = await c.proposed();
  roomId = (await c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line (B36, SYNTHETIC)', reviewEveryDays: 7 })).room.roomId;
  await c.membership(roomId, { principal: w.approver.principalId, role: 'approver', op: 'add' });
  await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
  await c.membership(roomId, { principal: w.approver2.principalId, role: 'dissenter', op: 'add' });
  await c.membership(roomId, { principal: board.principalId, role: 'observer', op: 'add' });
  await c.membership(roomId, { principal: operator.principalId, role: 'observer', op: 'add' });
  // the attention agent whose tick runs the step briefing-expiry (B24's registration; the tenant administrator's act)
  const a = await c.registerAgent({ kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: w.executive.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } }, tenantAdmin);
  attentionAgentId = a.agent.agentId;
}, 300_000);

afterAll(async () => {
  try { if (attentionAgentId !== '') await c.revokeAgent(attentionAgentId, 'the harness is done (B36 briefing)', tenantAdmin); } catch { /* already revoked */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

let E0: Awaited<ReturnType<typeof compose>>['briefing']; let E1: typeof E0; let E3: typeof E0; let E6: typeof E0; let E7: typeof E0;

describe('B36 briefing · b1 UNCERTAINTY per displayed conclusion (BRF@v3)', () => {
  it('POSITIVE: every item carries its band and basis, computed — evidence with no recorded confidence rests on its truth state; the record is BRF@v3, valid against v3 and not v2; the defaults fill the contract', async () => {
    const k0 = await dbNow();
    E0 = (await compose({ roomId, knownAt: k0, priorBriefingId: null })).briefing;
    expect(E0.schemaVersion).toBe('v3');
    expect(E0.items.length).toBeGreaterThan(0);
    for (const i of E0.items) {
      const u = obj(i['uncertainty']);
      expect(['high', 'medium', 'low', 'unknown']).toContain(u['band']);
      expect(Array.isArray(obj(u['basis'])['rules_applied'])).toBe(true);
    }
    const ev = item(E0, 'evidence') as Row;
    expect(obj(obj(ev['uncertainty'])['basis'])['confidence']).toBeNull();
    expect(obj(obj(ev['uncertainty'])['basis'])['confidence_source']).toBe('none');
    expect(String(obj(ev['uncertainty'])['band'])).toMatch(/^(medium|high)$/);   // observed / asserted evidence, live or uploaded, fresh
    const run = item(E0, 'run') as Row;
    expect(obj(run['uncertainty'])['band']).toBe('low');                          // synthetic, no recorded confidence
    // the defaults: every reader role, in-app, plain; the cadence's expiry; the room's standing purpose; no policy in force
    expect((E0.audience['roles'] as string[])).toEqual(expect.arrayContaining(['executive', 'board_member', 'executive_operator', 'decision_owner']));
    expect(E0.expiresAt).toBe(new Date(new Date(k0).getTime() + 7 * 86_400_000).toISOString());
    expect(E0.purpose).toMatch(/standing briefing of the room/);
    expect(E0.policyVersion).toBeNull();
    expect(E0.omissions).toEqual([]); expect(E0.suppressed).toEqual([]);
    // THE RECORD: v3 on the row, BRF@v3 on the header, the payload valid against v3 and not v2 (v2 forbids the new keys)
    const row = (await sql<{ schema_version: string; audience: Row; purpose: string; expires_at: Date; policy_version: number | null }>`select schema_version, audience, purpose, expires_at, policy_version from executive.briefings where briefing_id = ${E0.briefingId}::uuid`.execute(h.su)).rows[0]!;
    expect(row.schema_version).toBe('v3'); expect(row.audience).toEqual(E0.audience); expect(row.expires_at.toISOString()).toBe(E0.expiresAt);
    const canon = (await sql<{ schema_ref: string; payload: Row; method_ref: string }>`select schema_ref, payload, method_ref from objects.canonical_objects where object_id = ${E0.briefingId}::uuid`.execute(h.su)).rows[0]!;
    expect(canon.schema_ref).toBe('BRF@v3'); expect(canon.method_ref).toMatch(/^briefing-composer@1\.2\.0/);
    const schemas = Object.fromEntries((await sql<{ schema_version: string; json_schema: object }>`select schema_version, json_schema from objects.schema_registry where object_type = 'BRF'`.execute(h.su)).rows.map((r) => [r.schema_version, r.json_schema]));
    const ajv = new Ajv2020({ strict: false });
    const v3 = ajv.compile(schemas['v3']!); const v2 = ajv.compile(schemas['v2']!);
    expect(v3(canon.payload), JSON.stringify(v3.errors)).toBe(true);
    expect(v2(canon.payload), 'BRF@v2 forbids the v3 keys (additionalProperties false)').toBe(false);
  });
  it('REFUSAL: the port refuses an item without its band (briefing rejected (uncertainty), 422) — a band is computed, never omitted or asserted', async () => {
    const r = await refused(portCompose(w.executive, { items: [{ item_id: 'evidence:probe@1', kind: 'evidence', id: 'probe', version: 1, title: 'probe', at: new Date().toISOString(), truth_state: 'observed', source_state: 'live', synthetic_state: true }] }));
    expect(r.status).toBe(422); expect(r.message).toMatch(/^briefing rejected \(uncertainty\): item evidence:probe@1 carries no uncertainty band/);
  });
  it('RECOVERY: the bands are content — the same instant and the same (no) prior recompose to the same digest, whoever composes', async () => {
    const again = (await compose({ roomId, knownAt: E0.knownAt, priorBriefingId: null }, w.owner)).briefing;
    expect(again.contentDigest).toBe(E0.contentDigest);
    expect(again.items.map((i) => obj(i['uncertainty'])['band'])).toEqual(E0.items.map((i) => obj(i['uncertainty'])['band']));
  });
});

describe('B36 briefing · b3 the AUDIENCE contract, PURPOSE and EXPIRY', () => {
  it('POSITIVE: composed with the contract; a member within the audience reads it; the row carries it; not yet expired', async () => {
    const k1 = await dbNow();
    const expiresAt = new Date(new Date(k1).getTime() + 4_000).toISOString();
    E1 = (await compose({ roomId, knownAt: k1, priorBriefingId: E0.briefingId, audience: { roles: ['executive', 'decision_owner'], locale: 'de-DE', accessibility: { plain_language: true, screen_reader: true }, channels: ['in-app', 'demo-mailbox'] },
      purpose: 'Weekly corridor briefing for the executive and the owner (SYNTHETIC)', expiresAt })).briefing;
    expect(E1.audience).toEqual({ roles: ['executive', 'decision_owner'], locale: 'de-DE', accessibility: { plain_language: true, screen_reader: true }, channels: ['in-app', 'demo-mailbox'] });
    expect(E1.expiresAt).toBe(expiresAt);
    const g = (await c.getBriefing(E1.briefingId, w.owner)).briefing;
    expect(g['schema_version']).toBe('v3'); expect(g['expired']).toBe(false); expect(g['expired_at']).toBeNull(); expect(g['purpose']).toMatch(/^Weekly corridor briefing/);
    expect((await c.listBriefings(roomId, w.owner)).briefings.some((b) => b['briefing_id'] === E1.briefingId)).toBe(true);
  });
  it('REFUSAL: a member outside the audience roles is refused the edition (403 briefing rejected (audience)) and does not see it listed; membership is asked first; a malformed contract, an expiry before known_at and a purpose that says nothing are 422', async () => {
    expect(await status(c.getBriefing(E1.briefingId, w.approver))).toBe(403);
    expect(await message(c.getBriefing(E1.briefingId, w.approver))).toMatch(/^briefing rejected \(audience\): the edition is for the audience executive, decision_owner/);
    expect((await c.listBriefings(roomId, w.approver)).briefings.some((b) => b['briefing_id'] === E1.briefingId)).toBe(false);
    expect((await c.listBriefings(roomId, w.approver)).briefings.some((b) => b['briefing_id'] === E0.briefingId)).toBe(true);
    expect(await message(c.getBriefing(E1.briefingId, outsider))).toMatch(/read by the room's members/);
    const k = await dbNow();
    expect(await message(compose({ roomId, knownAt: k, priorBriefingId: E1.briefingId, audience: { roles: [], locale: 'en', accessibility: { plain_language: false, screen_reader: false }, channels: ['in-app'] } }))).toMatch(/^briefing rejected \(audience\): audience.roles/);
    expect(await status(compose({ roomId, knownAt: k, priorBriefingId: E1.briefingId, audience: { roles: ['executive'], locale: 'english', accessibility: { plain_language: false, screen_reader: false }, channels: ['in-app'] } }))).toBe(422);
    expect(await message(compose({ roomId, knownAt: k, priorBriefingId: E1.briefingId, expiresAt: new Date(new Date(k).getTime() - 60_000).toISOString() }))).toMatch(/^briefing rejected \(expiry\)/);
    expect(await message(compose({ roomId, knownAt: k, priorBriefingId: E1.briefingId, purpose: 'x' }))).toMatch(/^briefing rejected \(purpose\)/);
    // the PORT refuses the contract too (a caller that bypassed the composer's words)
    const r = await refused(portCompose(w.executive, { audience: { roles: ['executive'], locale: 'en', accessibility: { plain_language: 'yes' }, channels: ['in-app'] } }));
    expect(r.status).toBe(422); expect(r.message).toMatch(/^briefing rejected \(audience\)/);
    const r2 = await refused(portCompose(w.executive, { expiresAt: new Date(Date.now() - 86_400_000).toISOString() }));
    expect(r2.status).toBe(422); expect(r2.message).toMatch(/^briefing rejected \(expiry\)/);
  });
  it('EXPIRY: past expires_at the edition reads expired (the database\'s clock); the tick step briefing-expiry records briefing.expired exactly once (order 60, under the attention agent)', async () => {
    const left = new Date(E1.expiresAt).getTime() - Date.now();
    if (left > 0) await sleep(left + 300);
    let g = (await c.getBriefing(E1.briefingId, w.owner)).briefing;
    expect(g['expired']).toBe(true); expect(g['expired_at']).toBeNull();
    let slot = 0;
    const tick = () => timer.tickNow({ tenantId: T(), domainId: D(), agentId: attentionAgentId, scheduledAt: new Date(Date.UTC(2036, 0, 1) + (slot++) * 60_000) });
    const o = await tick();
    expect(o.outcome, o.stopReason ?? '').not.toBe('refused');
    const ev = await events(E1.briefingId);
    expect(ev.filter((e) => e.event === 'briefing.expired')).toHaveLength(1);
    expect(ev.find((e) => e.event === 'briefing.expired')!.details).toMatchObject({ by: 'tick:briefing-expiry', expires_at: expect.any(String) });
    g = (await c.getBriefing(E1.briefingId, w.owner)).briefing;
    expect(g['expired']).toBe(true); expect(String(g['expired_at']).length).toBeGreaterThan(0);
    await tick();
    expect((await events(E1.briefingId)).filter((e) => e.event === 'briefing.expired')).toHaveLength(1);
    // E0 (the cadence's expiry, a week away) is not expired
    expect((await c.getBriefing(E0.briefingId, w.owner)).briefing['expired']).toBe(false);
  });
});

describe('B36 briefing · b2 UNAVAILABLE DEPENDENCIES and OMISSIONS declared', () => {
  it('POSITIVE: a degraded source (the source-health path) is declared as an omission naming the source; the ledger records each declaration; the evidence from it reads unknown', async () => {
    await plantHealth('degraded', 'fixture: the collector faulted (B36 briefing, SYNTHETIC)');
    const k2 = await dbNow();
    const E2 = (await compose({ roomId, knownAt: k2, priorBriefingId: E1.briefingId })).briefing;
    expect(E2.degraded).toBe(true);
    const om = E2.omissions.filter((o) => o['kind'] === 'source_degraded');
    expect(om).toHaveLength(1);
    expect(String(om[0]!['source'])).toMatch(new RegExp(`^SRC:${h.fx.sourceId}@\\d+$`));
    expect(String(om[0]!['reason'])).toMatch(/is degraded as of known_at/);
    expect(E2.sourceStates.some((s) => s['state'] === 'degraded')).toBe(true);
    const ev = await events(E2.briefingId);
    expect(ev.filter((e) => e.event === 'briefing.omission_declared')).toHaveLength(E2.omissions.length);
    const g = (await c.getBriefing(E2.briefingId, w.approver)).briefing;
    expect((g['omissions'] as Row[]).length).toBe(E2.omissions.length);
    expect(E2.omissions.some((o) => o['kind'] === 'outage')).toBe(true);   // b6: an outage under a prior — proven in detail below
  });
  it('REFUSAL: the port refuses an edition that met an unavailable dependency and declares no omission (briefing rejected (undeclared_omission), 409) — and one whose suppressed items are not declared', async () => {
    const r = await refused(portCompose(w.executive, { degraded: true, sourceStates: [{ source_id: h.fx.sourceId, contract_version: 1, state: 'degraded', reason: 'probe' }], omissions: [] }));
    expect(r.status).toBe(409); expect(r.message).toMatch(/^briefing rejected \(undeclared_omission\): the composition met an unavailable dependency/);
    const r2 = await refused(portCompose(w.executive, { suppressed: [{ item_id: 'claim:x@1', kind: 'claim', rule: {}, measure: {} }], omissions: [{ kind: 'outage', reason: 'a probe omission of another kind' }] }));
    expect(r2.status).toBe(409); expect(r2.message).toMatch(/^briefing rejected \(undeclared_omission\): 1 item\(s\) suppressed under policy but 0 declared/);
    // an omission is named by its kind and reason
    const r3 = await refused(portCompose(w.executive, { degraded: true, omissions: [{ kind: 'weather', reason: 'a probe' }] }));
    expect(r3.status).toBe(422); expect(r3.message).toMatch(/^briefing rejected \(omission\)/);
  });
  it('RECOVERY: a healthy verdict recomposes without the omission', async () => {
    await plantHealth('healthy', 'fixture: the collector recovered (B36 briefing, SYNTHETIC)');
    const k3 = await dbNow();
    E3 = (await compose({ roomId, knownAt: k3, priorBriefingId: undefined })).briefing;
    expect(E3.degraded).toBe(false);
    expect(E3.omissions.filter((o) => o['kind'] === 'source_degraded' || o['kind'] === 'outage')).toEqual([]);
  });
});

describe('B36 briefing · b4 the unsafe-product SUPPRESSION rule — prefer silence over false certainty', () => {
  const RULES_V1 = { default: { min_sources: 1, max_staleness_hours: 8760, min_confidence: null }, classes: { evidence: { min_sources: 2, max_staleness_hours: 24 } } };
  let kFuture = ''; let dFirst = '';
  it('POSITIVE: the policy published by the executive; a single-source STALE evidence item is not rendered — suppressed with the rule and the measure, declared as an omission, briefing.suppressed on the ledger; the narrative cannot cite it', async () => {
    const p = await setPolicy(RULES_V1, 'Evidence rests on two independent sources and a day of freshness; otherwise silence (B36 harness).');
    expect(p.policy).toMatchObject({ version: 1, supersedes: null });
    expect(obj((await getPolicy()).policy)['version']).toBe(1);
    // a DOMAIN briefing read under an instant two days on: every evidence record is then older than the class allows, and single-sourced
    kFuture = new Date(new Date(await dbNow()).getTime() + 48 * 3_600_000).toISOString();
    const dom = (await compose({ roomId: null, knownAt: kFuture, priorBriefingId: null })).briefing;
    dFirst = dom.contentDigest;
    expect(dom.policyVersion).toBe(1);
    expect(dom.suppressed.length).toBeGreaterThan(0);
    expect(dom.items.filter((i) => i['kind'] === 'evidence')).toEqual([]);
    for (const s of dom.suppressed) {
      expect(s['kind']).toBe('evidence');
      expect(s['rule']).toEqual({ min_sources: 2, max_staleness_hours: 24, min_confidence: null, class: 'evidence', policy_version: 1 });
      expect(Number(obj(s['measure'])['independent_sources'])).toBe(1);
      expect(Number(obj(s['measure'])['freshness_hours'])).toBeGreaterThan(24);
      expect((s['because'] as string[]).join(' ')).toMatch(/1 independent source\(s\), the policy asks 2/);
      expect((s['because'] as string[]).join(' ')).toMatch(/h old, the policy allows 24 h/);
    }
    const declared = dom.omissions.filter((o) => o['kind'] === 'suppressed');
    expect(declared).toHaveLength(dom.suppressed.length);
    expect(declared.map((o) => o['object']).sort()).toEqual(dom.suppressed.map((s) => s['item_id']).sort());
    const ev = await events(dom.briefingId);
    expect(ev.filter((e) => e.event === 'briefing.suppressed')).toHaveLength(dom.suppressed.length);
    expect(ev.filter((e) => e.event === 'briefing.omission_declared').length).toBeGreaterThanOrEqual(dom.suppressed.length);
    // no weaker conclusion fills the gap: a narrative that cites a suppressed item is refused; the run items (default rule) stand
    const cited = String(dom.suppressed[0]!['item_id']);
    expect(await status(compose({ roomId: null, knownAt: kFuture, priorBriefingId: null, narrative: 'The evidence says the corridor holds.', narrativeCites: [cited] }))).toBe(422);
    expect(dom.items.some((i) => i['kind'] === 'run')).toBe(true);
    // the same instant and policy recompose to the same digest
    expect((await compose({ roomId: null, knownAt: kFuture, priorBriefingId: null })).briefing.contentDigest).toBe(dFirst);
  });
  it('REFUSAL: an approver cannot publish (the PDP, 403); malformed rules are 422; the unchanged rules are 409', async () => {
    expect(await status(setPolicy(RULES_V1, 'an approver publishing (B36 harness)', w.approver))).toBe(403);
    expect(await message(setPolicy({ default: { min_sources: 0, max_staleness_hours: 24, min_confidence: null } }, 'zero sources (B36 harness)'))).toMatch(/^briefing policy rejected \(rules\)/);
    expect(await message(setPolicy({ default: { min_sources: 1, max_staleness_hours: 24, min_confidence: null }, classes: { weather: { min_sources: 2 } } }, 'an unknown class (B36 harness)'))).toMatch(/^briefing policy rejected \(rules\)/);
    expect(await message(setPolicy(RULES_V1, 'the same rules again (B36 harness)'))).toMatch(/^briefing policy rejected \(state\): the rules are unchanged from version 1/);
    expect(await status(setPolicy(RULES_V1, 'short'))).toBe(422);
    await expect(sql`update executive.briefing_policies set rules = '{}'::jsonb where version = 1`.execute(h.su)).rejects.toThrow(/immutable|append-only/i);
  });
  it('RECOVERY: a relaxed version supersedes; the same instant recomposes with nothing withheld and a different digest; the history keeps both', async () => {
    const p = await setPolicy({ default: { min_sources: 1, max_staleness_hours: 8760, min_confidence: null } }, 'The evidence class stands on one fresh-enough source again (B36 harness).');
    expect(p.policy).toMatchObject({ version: 2, supersedes: 1 });
    const dom = (await compose({ roomId: null, knownAt: kFuture, priorBriefingId: null })).briefing;
    expect(dom.policyVersion).toBe(2); expect(dom.suppressed).toEqual([]); expect(dom.items.some((i) => i['kind'] === 'evidence')).toBe(true);
    expect(dom.contentDigest).not.toBe(dFirst);
    const pol = await getPolicy(w.approver);
    expect(obj(pol.policy)['version']).toBe(2); expect(pol.history.map((r) => r['version'])).toEqual([2, 1]);
  });
});

describe('B36 briefing · b5 DISPUTED assessments and EMERGING indicators as items', () => {
  let signalId = '';
  it('POSITIVE: a standing dissent is a disputed item with its as-of (the section and the ledger); a weak signal nominated in the window is an indicator with the band from its recorded confidence', async () => {
    await c.dissent(P.pkg, P.v, { position: 'against the reroute', rationale: 'The Cape adds fourteen days we do not have before the February build (SYNTHETIC).' }, w.approver2);
    signalId = uuidv7();
    await sql`insert into prediction.signals_current (signal_id, scope, tenant_id, domain_id, version, title, statement, subject_kind, subject_id, nominator_kind, nominated_by, observation, baseline, novelty_basis, novelty, confidence, maturity, classification, synthetic_state, correlation_id)
      values (${signalId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 1, 'Bab el-Mandeb transit chatter rising (SYNTHETIC)', 'A weak signal nominated by an analyst for the harness: transit chatter above its baseline for a week.', 'none', null, 'analyst', ${w.twinOwner.principalId}::uuid,
              '{"metric":"chatter","value":1.4}'::jsonb, '{"metric":"chatter","value":1.0}'::jsonb, '{"method":"fixture"}'::jsonb, 0.7, 0.55, 'tentative', 'internal', true, ${uuidv7()}::uuid)`.execute(h.su);
    const k4 = await dbNow();
    const E4 = (await compose({ roomId, knownAt: k4, priorBriefingId: E3.briefingId })).briefing;
    const dis = item(E4, 'disputed', (i) => obj(i['details'])['basis'] === 'dissent') as Row;
    expect(dis).toBeDefined();
    expect(obj(dis['details'])).toMatchObject({ basis: 'dissent', position: 'against the reroute', subject: `DPK:${P.pkg}@${P.v}`, owner_note: null });
    expect(dis['truth_state']).toBe('disputed');
    expect(E4.disputed).toEqual([expect.objectContaining({ item_id: dis['item_id'], basis: 'dissent', as_of: dis['at'], subject: `DPK:${P.pkg}@${P.v}`, owner_note: null })]);
    expect(item(E4, 'dissent')).toBeDefined();   // what changed: the dissent event in the window, as before
    const ind = item(E4, 'indicator', (i) => i['id'] === signalId) as Row;
    expect(ind).toBeDefined();
    expect(obj(ind['details'])).toMatchObject({ indicator: 'weak_signal', maturity: 'tentative', confidence: '0.55' });
    expect(obj(ind['uncertainty'])['band']).toBe('medium');
    expect(obj(obj(ind['uncertainty'])['basis'])['confidence']).toBe(0.55);
    expect(E4.indicators).toEqual([expect.objectContaining({ item_id: ind['item_id'], indicator: 'weak_signal', as_of: ind['at'] })]);
    const ev = await events(E4.briefingId);
    expect(ev.filter((e) => e.event === 'briefing.disputed_item')).toHaveLength(1);
    // a challenge (G's decision.challenges) is feature-detected: none while the table does not exist in this database
    expect(E4.items.filter((i) => i['kind'] === 'disputed' && obj(i['details'])['basis'] === 'challenge')).toEqual([]);
  });
  it('REFUSAL: a BOARD audience carries no disputed item without the owner\'s note and none excluded by the contract; the board member (a room member) reads it; the executive, outside the audience, is refused', async () => {
    const k5 = await dbNow();
    const boardAudience = { roles: ['board_member'], locale: 'en', accessibility: { plain_language: true, screen_reader: false }, channels: ['in-app'], exclude: ['indicator'] };
    const E5 = (await compose({ roomId, knownAt: k5, priorBriefingId: E3.briefingId, audience: boardAudience, purpose: 'The board\'s corridor summary without the owner\'s note (SYNTHETIC)' })).briefing;
    expect(E5.items.filter((i) => i['kind'] === 'disputed')).toEqual([]); expect(E5.disputed).toEqual([]);
    expect(E5.items.filter((i) => i['kind'] === 'indicator')).toEqual([]); expect(E5.indicators).toEqual([]);
    expect((await c.getBriefing(E5.briefingId, board)).briefing['schema_version']).toBe('v3');
    expect(await message(c.getBriefing(E5.briefingId, w.executive))).toMatch(/^briefing rejected \(audience\): the edition is for the audience board_member/);
    expect(await status(c.getBriefing(E5.briefingId, operator))).toBe(403);
    // the domain administrator is admitted to every audience (0066 §3's rule) — but a room briefing still asks membership first
    expect(await message(c.getBriefing(E5.briefingId, dadmin))).toMatch(/read by the room's members/);
  });
  it('RECOVERY: with the owner\'s note the board edition carries the disputed item, the note on it; the executive operator reads within an audience that names the role', async () => {
    const k6 = await dbNow();
    E6 = (await compose({ roomId, knownAt: k6, priorBriefingId: E3.briefingId, audience: { roles: ['board_member', 'executive_operator', 'executive'], locale: 'en', accessibility: { plain_language: true, screen_reader: false }, channels: ['in-app'] },
      purpose: 'The board\'s corridor summary with the owner\'s note (SYNTHETIC)', disputedNote: 'The owner notes: the dissent is recorded and is answered in the room\'s next review.' })).briefing;
    // this audience is not a pure board audience (the operator and the executive are in it): the note rides the item all the same
    const dis = item(E6, 'disputed') as Row;
    expect(dis).toBeDefined(); expect(obj(dis['details'])['owner_note']).toMatch(/^The owner notes/);
    expect(obj(E6.disputed[0])['owner_note']).toMatch(/^The owner notes/);
    const pureBoard = (await compose({ roomId, knownAt: k6, priorBriefingId: E3.briefingId, audience: { roles: ['board_member'], locale: 'en', accessibility: { plain_language: true, screen_reader: false }, channels: ['in-app'] },
      purpose: 'The board\'s corridor summary with the owner\'s note (SYNTHETIC)', disputedNote: 'The owner notes: the dissent is recorded and is answered in the room\'s next review.' })).briefing;
    expect(pureBoard.items.filter((i) => i['kind'] === 'disputed')).toHaveLength(1);
    expect((await c.getBriefing(E6.briefingId, operator)).briefing['schema_version']).toBe('v3');
    expect((await c.getBriefing(pureBoard.briefingId, board)).briefing['schema_version']).toBe('v3');
  });
});

describe('B36 briefing · b6 URGENT-STATE retention during an outage', () => {
  let warningId = '';
  it('POSITIVE: a warning raised (its response window open) is an item of the healthy edition; under a degraded source the next edition RETAINS it with its original as-of and retained_from, and declares the outage', async () => {
    await plantHealth('healthy', 'fixture: healthy before the outage probe (B36 briefing, SYNTHETIC)');
    const kBefore = await dbNow();
    await sleep(30);
    const ind = await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey: w.seriesKey, description: 'B36 outage probe: transits below 45 for three days', comparator: '<', threshold: 45, consecutiveDays: 3, owner: w.twinOwner.principalId } }) as { indicator: { indicatorId: string } };
    await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'B36 outage probe scenario (SYNTHETIC)', statement: 'a corridor scenario for the retention probe', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Probe collapse', kind: 'downside', statement: 'below 45 for three days', indicatorId: ind.indicator.indicatorId, owner: w.twinOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
                   ] } });
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), T(), D(), ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    const wr = (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where indicator_id = ${ind.indicator.indicatorId}::uuid and raised_at > ${kBefore}::timestamptz order by raised_at desc limit 1`.execute(h.su)).rows[0];
    expect(wr, 'a warning raised after kBefore').toBeDefined();
    warningId = String(wr?.id);
    await sleep(30);
    const k7 = await dbNow();
    E7 = (await compose({ roomId, knownAt: k7, priorBriefingId: E6.briefingId })).briefing;
    expect(E7.degraded).toBe(false);
    const fresh = item(E7, 'warning', (i) => i['id'] === warningId) as Row;
    expect(fresh, 'the warning raised in the interval is an item').toBeDefined();
    expect(obj(fresh['details'])['state']).toBe('raised');
    expect(String(obj(fresh['details'])['response_window_closes_at']) > k7).toBe(true);
    expect(fresh['retained_from']).toBeUndefined();
    // THE OUTAGE: the source degraded; the warning is before the new interval, so it is not composed afresh — it is RETAINED
    await plantHealth('degraded', 'fixture: the outage (B36 briefing, SYNTHETIC)');
    await sleep(30);
    const k8 = await dbNow();
    const E8 = (await compose({ roomId, knownAt: k8, priorBriefingId: E7.briefingId })).briefing;
    expect(E8.degraded).toBe(true);
    const kept = item(E8, 'warning', (i) => i['id'] === warningId) as Row;
    expect(kept, 'the urgent warning retained').toBeDefined();
    expect(kept['retained_from']).toBe(E7.briefingId);
    expect(kept['retained_as_of']).toBe(E7.knownAt);
    expect(ITEM_AT(kept)).toEqual(ITEM_AT(fresh));   // the ORIGINAL as-of and freshness: never re-derived
    expect(obj(kept['uncertainty'])).toEqual(obj(fresh['uncertainty']));
    const outage = E8.omissions.find((o) => o['kind'] === 'outage') as Row;
    expect(outage).toBeDefined();
    expect(String(outage['reason'])).toMatch(/1 urgent item\(s\) of the prior edition retained with their original as-of/);
    expect(outage['object']).toBe(`BRF:${E7.briefingId}`);
    expect(E8.omissions.some((o) => o['kind'] === 'source_degraded')).toBe(true);
    const g = (await c.getBriefing(E8.briefingId, w.approver)).briefing;
    expect((g['items'] as Row[]).find((i) => i['item_id'] === kept['item_id'])!['retained_from']).toBe(E7.briefingId);
  });
  it('REFUSAL: an outage edition that declares no omission is refused by the port (b2\'s rule holds the retention too)', async () => {
    const r = await refused(portCompose(w.executive, { degraded: true, items: [{ item_id: `warning:${warningId}`, kind: 'warning', id: warningId, version: null, title: 'retained probe', at: E7.knownAt, truth_state: 'inferred', source_state: 'internal', synthetic_state: true, retained_from: E7.briefingId, uncertainty: { band: 'low', basis: {} } }], omissions: [] }));
    expect(r.status).toBe(409); expect(r.message).toMatch(/^briefing rejected \(undeclared_omission\)/);
  });
  it('RECOVERY: a healthy verdict recomposes without a retained item; the warning keeps its open window among the windows', async () => {
    await plantHealth('healthy', 'fixture: the outage over (B36 briefing, SYNTHETIC)');
    await sleep(30);
    const k9 = await dbNow();
    const E9 = (await compose({ roomId, knownAt: k9, priorBriefingId: undefined })).briefing;
    expect(E9.degraded).toBe(false);
    expect(E9.items.some((i) => i['retained_from'] !== undefined && i['retained_from'] !== null)).toBe(false);
    expect(E9.omissions.filter((o) => o['kind'] === 'outage')).toEqual([]);
    expect(E9.windows.some((x) => x['kind'] === 'warning-response' && x['id'] === warningId)).toBe(true);
  });
});

describe('B36 briefing · the briefing agent composes through the same port (agents.service untouched)', () => {
  it('an agent run of the briefing task produces a BRF@v3 edition with the defaults; the edition reads within its audience', async () => {
    const b = await c.registerAgent({ kind: 'briefing', version: '1.0.0', codeDigest: 'a'.repeat(64), ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 } }, tenantAdmin);
    const run = await c.runAgent(b.agent.agentId, { task: 'briefing', roomId }, w.owner);
    const briefingId = String(obj(run.run.outputs)['briefing_id'] ?? '');
    expect(briefingId, JSON.stringify(run.run)).toMatch(/^[0-9a-f-]{36}$/);
    const row = (await sql<{ schema_version: string; composed_via: string; audience: Row; policy_version: number | null }>`select schema_version, composed_via, audience, policy_version from executive.briefings where briefing_id = ${briefingId}::uuid`.execute(h.su)).rows[0]!;
    expect(row).toMatchObject({ schema_version: 'v3', composed_via: 'agent', policy_version: 2 });
    expect(row.audience['roles']).toEqual(expect.arrayContaining(['executive', 'board_member']));
    const g = (await c.getBriefing(briefingId, w.approver)).briefing;
    expect(g['schema_version']).toBe('v3'); expect(g['expired']).toBe(false);
    for (const i of g['items'] as Row[]) expect(['high', 'medium', 'low', 'unknown']).toContain(obj(i['uncertainty'])['band']);
    // a v2 edition composed before this migration would read as before: the read names each edition's version (E0..E9 are v3; the shape stays)
    expect((await c.listBriefings(roomId, w.approver)).briefings.every((x) => typeof x['schema_version'] === 'string')).toBe(true);
  });
});
