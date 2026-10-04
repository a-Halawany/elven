/**
 * CP-6 B91 §LE (0105 §LE) — THE COST AND RESOURCE LEDGER (F-P7-F-02, themes g/h/i: IA-70-001/-002/-003/-005, DP-70-001/-002/-003/-005,
 * DQM-040, DAT-DL-07, V10-T-016), on a real database through the real controllers, ports and the attention tick, with named humans holding
 * sessions of their own. Every figure is SYNTHETIC (NORDWERK's data is the demonstration's).
 *
 * FIXTURE STATED: commercial.usage_records is §ME's (the meters part writes it from its recording points; §ME does not exist in this part's
 * worktree). The usage priced here is SEEDED through the superuser as a fixture — and priced only by the REAL tick step commercial-ledger
 * (commercial.ledger_tick under executive.attention.tick, driven by the timer's tickNow). The rate cards are platform-wide, so this file
 * prices units of its OWN (a per-run suffix) — a shared hosted database's other files cannot collide with them. Every count is scoped to
 * this file's tenant. The invoices are SYNTHETIC: a real billing account is the external prerequisite; reconciling a synthetic invoice
 * demonstrates the software and closes NO clause that needs the real integration.
 *
 *   L1 · RATE CARDS (IA-70-002 rate; IA-70-001 energy): versioned with effective time; the energy coefficient an ESTIMATE with its basis.
 *   L2 · PRICING BY THE TICK (DP-70-002 cost ledger; DAT-DL-07): usage × the rate IN FORCE AT occurred_at (the rate changes AT an instant),
 *        kept with its rate-card version; IDEMPOTENT per usage record; a tenant-level usage ALLOCATED by the key in force (IA-70-002
 *        allocation key) or kept unallocated; usage with no rate UNPRICED — counted, never zero; no retroactive repricing (`priced`).
 *   L3 · BUDGETS, VARIANCE, FORECAST, THRESHOLDS (IA-70-005, DP-70-005): a tenant budget owned by a named human, its variance and run-rate
 *        forecast (= ledger-math), 80 % then 100 % raised ONCE each to the owner (commercial.usage); declared by the tenant administrator,
 *        revised by the owner; an agent never sets one; a budget never stops work.
 *   L4 · ANOMALY (IA-70-002 anomaly): cle-anomaly@1 on a domain budget — today > k × the trailing mean → raised once; with no baseline, not
 *        applied (never inferred).
 *   L5 · UNIT DATA COST AND ENERGY (DQM-040; IA-70-001/DP-70-001 visibility): per asset + tenant + profile + product + consumer + window;
 *        the energy ESTIMATE with the uncovered entries counted; a domain reader sees its domain, never the sibling's allocation.
 *   L6 · OPTIMISATION — THE BOUNDARY HARNESS (IA-70-003, DP-70-003, IA-70-005 trade-offs): an optimisation changing residency, isolation,
 *        retention or recovery (or one disguised inside an adjustable change) REFUSED, nothing recorded, the tenant's residency untouched;
 *        trade-offs required; the safe restatement recorded.
 *   L7 · INVOICE RECONCILIATION (V10-T-016 — SYNTHETIC; IA-70-002 reconcile): matched within tolerance; the differences per dimension;
 *        unpriced usage never matched until priced (a new reconciliation version; the earlier stands).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { LedgerDomainController, LedgerPlatformController, LedgerTenantController } from '../../src/commercial/ledger/ledger.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { IDENTITY_DB } from '../../src/shared/shared.module.js';
import { anomaly as anomalyRule, energyEstimate, priceUsage, variance as varianceRule, type AllocationVersion, type RateVersion } from '../../src/commercial/ledger/ledger-math.js';
import { Phase4Harness } from './phase4-helpers.js';
import { createPrincipalWithSession, seedDomain, seedTenant, type AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb;
let platformApi: LedgerPlatformController; let tenantApi: LedgerTenantController; let domainApi: LedgerDomainController; let exec: ExecutiveController;
let scheduler: SchedulerService; let timer: AttentionTimerService;
let vendor: AuthenticatedPrincipal; let platformAdmin: AuthenticatedPrincipal; let tadmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let exec2: AuthenticatedPrincipal;
let dadmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let outsiderAdmin: AuthenticatedPrincipal;
let agentId = ''; let agentPrincipalId = '';
let D2 = ''; let T2 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const TAG = `h${uuidv7().slice(-6)}`;
const U = { wall: `wall_s.${TAG}`, calls: `calls.${TAG}`, tokens: `tokens.${TAG}`, gb: `gb_day.${TAG}`, reads: `reads.${TAG}` };
let day = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── refusals ───────────── */
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
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const one = async (q: ReturnType<typeof sql>) => (await rows(q))[0] as Row;
const num = (v: unknown) => Number(v);

/* ───────────── the routes (in process) ───────────── */
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null, scope: Scope, domainId: string = D()) => {
  const env = { ...h.env(as, action, type, id, 'commercial'), scope, tenant_id: scope === 'PLATFORM' ? null : T(), domain_id: scope === 'DOMAIN' ? domainId : null };
  return { eyeEnvelope: env, eyePrincipal: as } as never;
};
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => E(as, action, type, id, 'PLATFORM');
const setRate = (as: AuthenticatedPrincipal, payload: Row) => platformApi.setRateCard(P(as, 'commercial.rate.set', 'CRC'), { payload }) as Promise<{ rateCard: Row }>;
const setKey = (as: AuthenticatedPrincipal, payload: Row) => platformApi.setAllocationKey(P(as, 'commercial.allocation.set', 'CAK'), { payload }) as Promise<{ allocationKey: Row }>;
const importInvoice = (as: AuthenticatedPrincipal, payload: Row) => platformApi.importInvoice(P(as, 'commercial.invoice.import', 'CIN'), { payload }) as Promise<{ invoice: Row }>;
const reconcile = (as: AuthenticatedPrincipal, invoiceId: string, payload: Row = {}) => platformApi.reconcile(P(as, 'commercial.invoice.reconcile', 'CIN', invoiceId), invoiceId, { payload }) as Promise<{ reconciliation: Row }>;
const optimise = (as: AuthenticatedPrincipal, payload: Row) => platformApi.recordOptimisation(P(as, 'commercial.optimisation.record', 'COP'), { payload }) as Promise<{ optimisation: Row }>;
const platformRead = (as: AuthenticatedPrincipal, payload: Row = {}) => platformApi.read(P(as, 'commercial.ledger.read', 'CLG'), { payload }) as Promise<{ ledger: Row }>;
const setBudget = (as: AuthenticatedPrincipal, payload: Row) => tenantApi.setBudget(E(as, 'commercial.budget.set', 'CBG', (payload['budgetId'] as string | undefined) ?? null, 'TENANT'), T(), { payload }) as Promise<{ budget: Row }>;
const setBudgetD = (as: AuthenticatedPrincipal, payload: Row) => domainApi.setBudget(E(as, 'commercial.budget.set', 'CBG', (payload['budgetId'] as string | undefined) ?? null, 'DOMAIN'), T(), D(), { payload }) as Promise<{ budget: Row }>;
const readBudget = (as: AuthenticatedPrincipal, budgetId: string) => tenantApi.readBudget(E(as, 'commercial.ledger.read', 'CBG', budgetId, 'TENANT'), T(), budgetId) as Promise<{ budget: Row }>;
const readBudgetD = (as: AuthenticatedPrincipal, budgetId: string) => domainApi.readBudget(E(as, 'commercial.ledger.read', 'CBG', budgetId, 'DOMAIN'), T(), D(), budgetId) as Promise<{ budget: Row }>;
const tenantRead = (as: AuthenticatedPrincipal, payload: Row = {}) => tenantApi.read(E(as, 'commercial.ledger.read', 'CLG', null, 'TENANT'), T(), { payload }) as Promise<{ ledger: Row }>;
const tenantEntries = (as: AuthenticatedPrincipal, payload: Row = {}) => tenantApi.entries(E(as, 'commercial.ledger.read', 'CLG', null, 'TENANT'), T(), { payload }) as Promise<{ entries: Row[] }>;
const domainEntries = (as: AuthenticatedPrincipal, payload: Row = {}) => domainApi.entries(E(as, 'commercial.ledger.read', 'CLG', null, 'DOMAIN'), T(), D(), { payload }) as Promise<{ entries: Row[] }>;

/* ───────────── the tick, the clock, the fixture usage ───────────── */
const tick = async (): Promise<Row> => {
  day += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const steps = (t.run?.outputs?.['steps'] ?? {}) as Row;
  return (steps['commercial-ledger'] ?? {}) as Row;
};
/** The DATABASE's instant (never the host's), as ISO text; and an instant `seconds` before it. */
const dbNow = async (): Promise<string> => String((await one(sql`select to_json(clock_timestamp()) #>> '{}' as t`))['t']);
const dbAgo = async (seconds: number): Promise<string> => String((await one(sql`select to_json(clock_timestamp() - make_interval(secs => ${seconds}::float8)) #>> '{}' as t`))['t']);
const dbDayNoon = async (daysAgo: number): Promise<string> => String((await one(sql`select to_json((((clock_timestamp() at time zone 'UTC')::date - ${daysAgo}::int)::timestamp + interval '12 hours') at time zone 'UTC') #>> '{}' as t`))['t']);
const DAY = 86_400;
/** FIXTURE (§ME's table, seeded through the superuser): one usage record. */
const usage = async (o: { domain: string | null; cap: string; dim: string; unit: string; qty: number; at: string; details?: Row }): Promise<string> => {
  const id = uuidv7();
  await sql`insert into commercial.usage_records (usage_id, scope, tenant_id, domain_id, capability_key, dimension, unit, quantity, profile, source_kind, source_ref, details, occurred_at)
            values (${id}::uuid, ${o.domain === null ? 'TENANT' : 'DOMAIN'}, ${T()}::uuid, ${o.domain}::uuid, ${o.cap}, ${o.dim}, ${o.unit}, ${o.qty}::numeric, 'local-dev',
                    'b91-ledger-fixture', ${id}, ${JSON.stringify({ synthetic: true, fixture: 'B91 ledger harness (§ME writes this table in the integrated build)', ...(o.details ?? {}) })}::jsonb,
                    ${o.at}::timestamptz)`.execute(su);
  return id;
};
const entriesOf = (usageId: string) => rows(sql`select line, scope, domain_id::text, product_id::text, consumer_principal_id::text, allocation, allocation_version, share::float8 as share,
  quantity::float8 as quantity, rate_key, rate_version, price_per_unit::float8 as price, currency, amount::float8 as amount, energy_kwh::float8 as energy_kwh, energy_label, asset_ref
  from commercial.cost_entries where usage_id = ${usageId}::uuid order by line`);
const entryCount = async () => num((await one(sql`select count(*)::int n from commercial.cost_entries where tenant_id = ${T()}::uuid`))['n']);
const ratesOf = async (dim: string, unit: string): Promise<RateVersion[]> => (await rows(sql`select version, effective_from, price_per_unit::float8 as p, currency, energy_kwh_per_unit::float8 as e
  from commercial.rate_cards where rate_key = ${dim + ':' + unit}`)).map((r) => ({ version: num(r['version']), effectiveFrom: r['effective_from'] as Date, pricePerUnit: num(r['p']), currency: String(r['currency']),
  energyKwhPerUnit: r['e'] === null ? null : num(r['e']) }));
const keysOf = async (dim: string): Promise<AllocationVersion[]> => (await rows(sql`select version, effective_from, shares from commercial.allocation_keys where tenant_id = ${T()}::uuid and dimension = ${dim}`))
  .map((k) => ({ version: num(k['version']), effectiveFrom: k['effective_from'] as Date, shares: (k['shares'] as Row[]).map((s) => ({ domainId: String(s['domain_id']), weight: num(s['weight']),
    productId: (s['product_id'] as string | null) ?? null, consumerPrincipalId: (s['consumer_principal_id'] as string | null) ?? null })) }));
/** The database's entries for a usage record EQUAL the pure rule's (ledger-math.priceUsage) over the stored rate and allocation versions. */
const expectPricedAsMath = async (usageId: string) => {
  const u = await one(sql`select domain_id::text, dimension, unit, quantity::float8 as q, occurred_at from commercial.usage_records where usage_id = ${usageId}::uuid`);
  const math = priceUsage({ quantity: num(u['q']), domainId: (u['domain_id'] as string | null) ?? null, occurredAt: u['occurred_at'] as Date },
    await ratesOf(String(u['dimension']), String(u['unit'])), await keysOf(String(u['dimension'])));
  const db = await entriesOf(usageId);
  expect(math.priced, `usage ${usageId}`).toBe(true);
  if (!math.priced) return db;
  expect(db.map((e) => [e['line'], e['domain_id'], e['allocation'], e['rate_version'], e['allocation_version']]))
    .toEqual(math.lines.map((l) => [l.line, l.domainId, l.allocation, l.rateVersion, l.allocationVersion]));
  db.forEach((e, i) => {
    expect(num(e['amount'])).toBeCloseTo(math.lines[i]!.amount, 9);
    expect(num(e['quantity'])).toBeCloseTo(math.lines[i]!.quantity, 9);
    if (math.lines[i]!.energyKwh === null) expect(e['energy_kwh']).toBeNull(); else expect(num(e['energy_kwh'])).toBeCloseTo(math.lines[i]!.energyKwh as number, 9);
  });
  return db;
};
const items = (budgetId: string) => rows(sql`select item_id::text, signal_class, subject_kind, subject_id::text, cause_event_type, owner_principal_id::text as owner, state, title, details, domain_id::text
  from executive.attention_items where tenant_id = ${T()}::uuid and signal_class = 'commercial.usage' and subject_id = ${budgetId}::uuid order by created_at`);
const budgetEvents = (budgetId: string) => rows(sql`select event, budget_version, threshold, period_start, day, attention_item_id::text, details from commercial.budget_events where budget_id = ${budgetId}::uuid order by recorded_at, event_id`);

/** A PLATFORM principal (fixture scaffolding) with a session of its own, holding `role`. */
const platformHuman = async (role: string, label: string): Promise<AuthenticatedPrincipal> => {
  const p = await createPrincipalWithSession(h.app.get(IDENTITY_DB), su, { scope: 'PLATFORM', roleCode: role, label });
  return { ...h.manager, principalId: p.principalId, sessionId: p.sessionId, contextKey: p.contextKey, kind: 'human', assurance: 'password', homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null,
    bindings: [{ roleCode: role, scope: 'PLATFORM', tenantId: null, domainId: null }] };
};

/* the state the clauses share */
let SIM_V2_FROM = ''; let RATE_SIM_V2 = '';
const uid: Record<string, string> = {};
let BUDGET = ''; let BUDGET_AMOUNT = 0; let INFER_BUDGET = ''; let CATALOGUE_BUDGET = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { LedgerPlatformController: LP, LedgerTenantController: LT, LedgerDomainController: LD } = await import('../../src/commercial/ledger/ledger.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  platformApi = h.app.get(LP); tenantApi = h.app.get(LT); domainApi = h.app.get(LD); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  D2 = await seedDomain(su, T(), 'b91-ledger-d2');
  T2 = await seedTenant(su, 'b91-ledger-outsider');
  vendor = await platformHuman('commercial_authority', 'b91l-vendor');
  platformAdmin = await platformHuman('platform_admin', 'b91l-padmin');
  tadmin = await h.humanWithSession(['tenant_admin'], 'b91l-tadmin', 'TENANT');
  owner = await h.humanWithSession(['executive'], 'b91l-owner');                    // the budget's named owner (the corridor domain's executive)
  exec2 = await h.humanWithSession(['executive'], 'b91l-exec2');                    // another executive of the domain: not the owner
  dadmin = await h.humanWithSession(['domain_admin'], 'b91l-dadmin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b91l-analyst');
  auditor = await h.humanWithSession(['auditor'], 'b91l-auditor', 'TENANT');
  // a tenant administrator of ANOTHER tenant
  const oa = await createPrincipalWithSession(h.app.get(IDENTITY_DB), su, { scope: 'TENANT', tenantId: T2, roleCode: 'tenant_admin', label: 'b91l-outsider' });
  outsiderAdmin = { ...h.manager, principalId: oa.principalId, sessionId: oa.sessionId, contextKey: oa.contextKey, kind: 'human', assurance: 'password', homeScope: 'TENANT', homeTenantId: T2, homeDomainId: null,
    bindings: [{ roleCode: 'tenant_admin', scope: 'TENANT', tenantId: T2, domainId: null }] };
  // the attention agent: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tadmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: owner.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string; principalId: string } };
  agentId = r.agent.agentId; agentPrincipalId = r.agent.principalId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
}, 400_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  await h?.close();
});

describe('B91 §LE · L1 RATE CARDS: versioned with effective time; the energy coefficient an ESTIMATE (IA-70-001/-002)', () => {
  it('POSITIVE: the commercial authority sets the SYNTHETIC rate cards — simulation compute v1 (with an energy ESTIMATE) and v2 from an instant, inference, storage, product reads', async () => {
    const v1 = (await setRate(vendor, { dimension: 'simulation_compute', unit: U.wall, pricePerUnit: '0.05', currency: 'EUR', energyKwhPerUnit: '0.0000833',
      energyBasis: 'SYNTHETIC: 300 W per compute second-equivalent, an engineering estimate, not metered', effectiveFrom: await dbAgo(30 * DAY), synthetic: true, reason: 'B91 ledger harness — the corridor sweep compute price (SYNTHETIC)' })).rateCard;
    expect(v1).toMatchObject({ version: 1, rate_key: `simulation_compute:${U.wall}`, currency: 'EUR', energy_label: 'ESTIMATE', synthetic: true, prior_version: null });
    SIM_V2_FROM = await dbAgo(5 * DAY);
    const v2 = (await setRate(vendor, { dimension: 'simulation_compute', unit: U.wall, pricePerUnit: '0.08', currency: 'EUR', effectiveFrom: SIM_V2_FROM, synthetic: true,
      reason: 'B91 ledger harness — the compute price rises from an instant (SYNTHETIC)' })).rateCard;
    expect(v2).toMatchObject({ version: 2, prior_version: 1, energy_kwh_per_unit: null, energy_label: null });
    RATE_SIM_V2 = String(v2['rate_card_id']);
    await setRate(vendor, { dimension: 'model_inference', unit: U.calls, pricePerUnit: '0.02', currency: 'EUR', effectiveFrom: await dbAgo(30 * DAY), synthetic: true, reason: 'B91 ledger harness — inference per call (SYNTHETIC)' });
    await setRate(vendor, { dimension: 'storage', unit: U.gb, pricePerUnit: '0.001', currency: 'EUR', energyKwhPerUnit: '0.0002', energyBasis: 'SYNTHETIC: storage array draw per GB-day, an estimate',
      effectiveFrom: await dbAgo(30 * DAY), synthetic: true, reason: 'B91 ledger harness — storage per GB-day (SYNTHETIC)' });
    await setRate(vendor, { dimension: 'product_consumption', unit: U.reads, pricePerUnit: '0.001', currency: 'EUR', effectiveFrom: await dbAgo(30 * DAY), synthetic: true, reason: 'B91 ledger harness — product reads (SYNTHETIC)' });
    const view = (await platformRead(vendor)).ledger;
    const sim = ((view['rate_cards'] as Row)['current'] as Row[]).find((c) => c['rate_key'] === `simulation_compute:${U.wall}`)!;
    expect((sim['in_force'] as Row)['version']).toBe(2);
    expect(sim['scheduled']).toEqual([]);
  });

  it('REFUSAL: the platform administrator and a tenant administrator (the PDP, 403); a version that does not follow the last (stale 409); an energy coefficient without its basis, another currency, an unknown dimension, no synthetic flag (422)', async () => {
    const ok = { dimension: 'simulation_compute', unit: U.wall, pricePerUnit: '0.09', currency: 'EUR', effectiveFrom: await dbAgo(DAY), synthetic: true, reason: 'B91 ledger harness — a refused attempt' };
    await refused(setRate(platformAdmin, ok), /no qualifying role binding/, 403);
    await refused(platformApi.setRateCard(E(tadmin, 'commercial.rate.set', 'CRC', null, 'TENANT'), { payload: ok }) as Promise<unknown>, /scope|tenant|binding/i, 403);
    await refused(setRate(vendor, { ...ok, effectiveFrom: await dbAgo(6 * DAY) }), /^rate card rejected \(stale\): version 2 of simulation_compute/, 409);
    await refused(setRate(vendor, { ...ok, energyKwhPerUnit: '0.001', energyBasis: 'short' }), /^rate card rejected \(energy\)/, 422);
    await refused(setRate(vendor, { ...ok, currency: 'USD' }), /^rate card rejected \(currency\): .* is priced in EUR/, 422);
    await refused(setRate(vendor, { ...ok, dimension: 'satellite_minutes' }), /^rate card rejected \(dimension\)/, 422);
    await refused(setRate(vendor, { ...ok, synthetic: undefined }), /^rate card rejected \(synthetic\)/, 422);
    expect(num((await one(sql`select count(*)::int n from commercial.rate_cards where rate_key = ${'simulation_compute:' + U.wall}`))['n'])).toBe(2); // nothing written
  });

  it('RECOVERY: a version scheduled AFTER the last takes its place (v3 from tomorrow, at the same price: shown as scheduled, not in force)', async () => {
    const tomorrow = String((await one(sql`select to_json(clock_timestamp() + interval '1 day') #>> '{}' as t`))['t']);
    const v3 = (await setRate(vendor, { dimension: 'simulation_compute', unit: U.wall, pricePerUnit: '0.08', currency: 'EUR', effectiveFrom: tomorrow, synthetic: true, reason: 'B91 ledger harness — scheduled renewal (SYNTHETIC)' })).rateCard;
    expect(v3).toMatchObject({ version: 3, prior_version: 2 });
    const sim = ((((await platformRead(vendor)).ledger['rate_cards'] as Row)['current']) as Row[]).find((c) => c['rate_key'] === `simulation_compute:${U.wall}`)!;
    expect((sim['in_force'] as Row)['version']).toBe(2);
    expect((sim['scheduled'] as Row[]).map((s) => s['version'])).toEqual([3]);
  });
});

describe('B91 §LE · L2 PRICING BY THE TICK: the rate in force at occurred_at, idempotent, allocated, unpriced never zero (DP-70-002, DAT-DL-07)', () => {
  it('POSITIVE: the tick step commercial-ledger prices the usage — the rate CHANGES AT ITS INSTANT, each entry keeps its rate-card version, a tenant-level usage is allocated by the key in force, an earlier one stays unallocated', async () => {
    await setKey(vendor, { tenantId: T(), dimension: 'storage', basis: 'SYNTHETIC: evidence bytes per domain, sampled monthly', shares: [{ domainId: D(), weight: 0.75 }, { domainId: D2, weight: 0.25 }],
      effectiveFrom: await dbAgo(3 * DAY), reason: 'B91 ledger harness — storage shared 3:1 between the corridor and the second domain' });
    uid['u1'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: 1200, at: await dbAgo(10 * DAY) });
    uid['u4'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: 300, at: new Date(Date.parse(SIM_V2_FROM) - 1).toISOString() }); // 1 ms before v2
    uid['u3'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: 300, at: SIM_V2_FROM });                                     // AT v2's instant
    uid['u2'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: 600, at: await dbAgo(1) });
    uid['u5'] = await usage({ domain: null, cap: 'core', dim: 'storage', unit: U.gb, qty: 100, at: await dbAgo(2 * DAY) });                                               // allocated 3:1
    uid['u7'] = await usage({ domain: null, cap: 'core', dim: 'storage', unit: U.gb, qty: 40, at: await dbAgo(4 * DAY) });                                                // before the key: unallocated
    uid['u6'] = await usage({ domain: D(), cap: 'inference', dim: 'model_inference', unit: U.tokens, qty: 5000, at: await dbAgo(1) });                                    // NO rate card: unpriced
    const before = await entryCount();
    const r = await tick();
    expect(r).toMatchObject({ priced_usage: 6, cost_lines: 7, unpriced: { [`model_inference:${U.tokens}`]: 1 } });
    expect(await entryCount()).toBe(before + 7);
    const e4 = await expectPricedAsMath(uid['u4']!); const e3 = await expectPricedAsMath(uid['u3']!);
    expect(e4[0]).toMatchObject({ rate_version: 1, allocation: 'direct', energy_label: 'ESTIMATE' });
    expect(num(e4[0]!['amount'])).toBeCloseTo(15, 9);   // 300 s × 0.05
    expect(e3[0]).toMatchObject({ rate_version: 2, energy_kwh: null });
    expect(num(e3[0]!['amount'])).toBeCloseTo(24, 9);   // 300 s × 0.08 — the same usage one millisecond later costs the new rate
    expect((await expectPricedAsMath(uid['u1']!))[0]).toMatchObject({ rate_version: 1 });
    expect(num((await expectPricedAsMath(uid['u2']!))[0]!['amount'])).toBeCloseTo(48, 9);
    const e5 = await expectPricedAsMath(uid['u5']!);
    expect(e5.map((e) => [e['domain_id'], e['allocation'], e['share']])).toEqual([[D(), 'allocated', 0.75], [D2, 'allocated', 0.25]]);
    expect(e5.reduce((a, e) => a + num(e['amount']), 0)).toBeCloseTo(0.1, 9);
    expect((await expectPricedAsMath(uid['u7']!)).map((e) => [e['domain_id'], e['allocation'], e['scope']])).toEqual([[null, 'unallocated', 'TENANT']]);
    expect(await entriesOf(uid['u6']!)).toEqual([]);
  });

  it('REFUSAL: usage with no rate in force is UNPRICED — counted by every tick, shown, the view not complete — never a zero entry; a rate or a key that would take effect under an already-priced entry is refused (priced 409); an unreliable allocation (weights ≠ 1), a domain of another tenant', async () => {
    const r = await tick();
    expect(r).toMatchObject({ priced_usage: 0, cost_lines: 0, unpriced: { [`model_inference:${U.tokens}`]: 1 } });
    const v = (await tenantRead(tadmin)).ledger;
    expect(v['complete']).toBe(false);
    expect(v['unpriced']).toEqual(expect.arrayContaining([{ dimension: 'model_inference', unit: U.tokens, usage_records: 1 }]));
    // the commercial authority's view of the tenant says the same — through the guarded counts (the usage rows are not the vendor's to read)
    const pv = (await platformRead(vendor, { tenantId: T() })).ledger['tenant'] as Row;
    expect(pv['complete']).toBe(false);
    expect(pv['unpriced']).toEqual(expect.arrayContaining([{ dimension: 'model_inference', unit: U.tokens, usage_records: 1 }]));
    await refused(setRate(vendor, { dimension: 'storage', unit: U.gb, pricePerUnit: '0.002', currency: 'EUR', effectiveFrom: await dbAgo(3 * DAY), synthetic: true, reason: 'B91 ledger harness — a retroactive price' }),
      /^rate card rejected \(priced\): usage of storage:.* is already priced; a price never changes under a priced entry/, 409);
    await refused(setKey(vendor, { tenantId: T(), dimension: 'storage', basis: 'SYNTHETIC: a retroactive re-split', shares: [{ domainId: D(), weight: 1 }], effectiveFrom: await dbAgo(2.5 * DAY), reason: 'B91 ledger harness — refused' }),
      /^allocation key rejected \(priced\)/, 409);
    await refused(setKey(vendor, { tenantId: T(), dimension: 'model_inference', basis: 'SYNTHETIC: an incomplete split', shares: [{ domainId: D(), weight: 0.5 }, { domainId: D2, weight: 0.4 }], effectiveFrom: await dbNow(), reason: 'B91 ledger harness — refused' }),
      /^allocation key rejected \(weights\): the weights sum to 0.9/, 422);
    const otherDomain = await seedDomain(su, T2, 'b91-ledger-outsider-d');
    await refused(setKey(vendor, { tenantId: T(), dimension: 'model_inference', basis: 'SYNTHETIC: a foreign domain', shares: [{ domainId: otherDomain, weight: 1 }], effectiveFrom: await dbNow(), reason: 'B91 ledger harness — refused' }),
      /^allocation key rejected \(unknown_domain\)/, 404);
    expect(num((await one(sql`select count(*)::int n from commercial.rate_cards where rate_key = ${'storage:' + U.gb}`))['n'])).toBe(1);
  });

  it('RECOVERY: IDEMPOTENT — a third tick prices nothing twice; a storage price taking effect after the last priced usage is accepted and prices the NEXT usage only; the append-only ledger refuses an edit even from the superuser', async () => {
    const before = await entryCount();
    expect(await tick()).toMatchObject({ priced_usage: 0, cost_lines: 0 });
    expect(await entryCount()).toBe(before);
    expect(num((await one(sql`select count(*)::int n from (select usage_id from commercial.cost_entries where tenant_id = ${T()}::uuid group by usage_id, line having count(*) > 1) x`))['n'])).toBe(0);
    const v2 = (await setRate(vendor, { dimension: 'storage', unit: U.gb, pricePerUnit: '0.0015', currency: 'EUR', effectiveFrom: await dbNow(), synthetic: true, reason: 'B91 ledger harness — storage repriced from now on (SYNTHETIC)' })).rateCard;
    expect(v2['version']).toBe(2);
    uid['u8'] = await usage({ domain: D(), cap: 'core', dim: 'storage', unit: U.gb, qty: 10, at: await dbNow() });
    expect(await tick()).toMatchObject({ priced_usage: 1, cost_lines: 1 });
    expect((await expectPricedAsMath(uid['u8']!))[0]).toMatchObject({ rate_version: 2 });
    expect((await entriesOf(uid['u5']!)).every((e) => e['rate_version'] === 1)).toBe(true);   // the earlier entries keep their version
    await expect(sql`update commercial.cost_entries set amount = 0 where usage_id = ${uid['u5']!}::uuid`.execute(su)).rejects.toThrow(/append-only|append only|immutable/i);
  });
});

describe('B91 §LE · L3 BUDGETS: owner, variance, run-rate forecast, thresholds 80 % / 100 % raised once (IA-70-005, DP-70-005)', () => {
  it('POSITIVE: the tenant administrator declares the month\'s simulation budget, owned by a named executive; its variance and forecast equal cle-variance@1; the tick raises 80 % ONCE to the owner (commercial.usage), not 100 %', async () => {
    // the amount is set from what the ledger holds this month so that 80 % — and only 80 % — is reached on any day of the month
    const spentNow = num((await one(sql`select coalesce(sum(amount), 0)::float8 s from commercial.cost_entries where tenant_id = ${T()}::uuid and capability_key = 'simulation' and currency = 'EUR'
      and occurred_at >= date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC'`))['s']);
    expect(spentNow).toBeGreaterThan(0);
    BUDGET_AMOUNT = Math.ceil((spentNow / 0.9) * 100) / 100;
    const b = (await setBudget(tadmin, { label: 'Corridor simulation compute — monthly (SYNTHETIC)', capabilityKey: 'simulation', periodKind: 'month', amount: BUDGET_AMOUNT.toFixed(2), currency: 'EUR',
      ownerPrincipalId: owner.principalId, anomaly: { k: 100, window_days: 7 }, reason: 'B91 ledger harness — the tenant\'s simulation spend this month' })).budget;
    BUDGET = String(b['budget_id']);
    expect(b).toMatchObject({ version: 1, scope: 'TENANT', domain_id: null, owner_principal_id: owner.principalId, thresholds: [80, 100], anomaly_rule: { rule: 'cle-anomaly@1', k: 100, window_days: 7 } });
    const read = (await readBudget(auditor, BUDGET)).budget;
    const v = read['variance'] as Row;
    const math = varianceRule({ spent: spentNow, amount: BUDGET_AMOUNT, periodKind: 'month', at: String(v['as_of']) });
    expect(num(v['spent'])).toBeCloseTo(spentNow, 6);
    expect(num(v['pct'])).toBeCloseTo(math.pct, 2);
    expect(num(v['variance'])).toBeCloseTo(math.variance, 6);
    expect(num(v['forecast'])).toBeCloseTo(math.forecast as number, 3);
    expect(v).toMatchObject({ period_start: math.periodStart, period_end: math.periodEnd, rule: 'cle-variance@1', complete: true });
    expect(((read['events'] as Row[]).map((e) => e['event']))).toEqual(['declared']);
    const t = await tick();
    expect((t['thresholds'] as Row[]).map((x) => [x['budget_id'], x['threshold']])).toEqual([[BUDGET, 80]]);
    const it1 = await items(BUDGET);
    expect(it1).toHaveLength(1);
    expect(it1[0]).toMatchObject({ signal_class: 'commercial.usage', subject_kind: 'budget', cause_event_type: 'budget.threshold', owner: owner.principalId, state: 'open', domain_id: D() });
    expect(String(it1[0]!['title'])).toMatch(/^Budget 80% reached: Corridor simulation compute — monthly \(SYNTHETIC\) — /);
    await tick();
    expect(await items(BUDGET)).toHaveLength(1);   // once per budget version, period and threshold
  });

  it('REFUSAL: an executive who is not the administrator declares (authority 403); an analyst (the PDP); an AGENT (the human gate); an agent as owner (422); a duplicate (409); a stale revision (409); another executive revising (403); a domain context revising ANOTHER domain\'s budget (403); a domain reader of the tenant route (the PDP)', async () => {
    const decl = { label: 'Another simulation budget', capabilityKey: 'simulation', periodKind: 'month', amount: '50', currency: 'EUR', ownerPrincipalId: owner.principalId, reason: 'B91 ledger harness — refused' };
    await refused(setBudgetD(exec2, { ...decl, capabilityKey: 'twins' }), /^budget rejected \(authority\): a budget is declared by the tenant administrator/, 403);
    await refused(setBudgetD(analyst, decl), /no qualifying role binding/, 403);
    await refused(setBudget({ ...tadmin, kind: 'agent' }, decl), /human gate/, 403);
    await refused(setBudget(tadmin, { ...decl, capabilityKey: 'twins', ownerPrincipalId: agentPrincipalId }), /^budget rejected \(owner\): the owner is a named, active human/, 422);
    await refused(setBudget(tadmin, decl), /^budget rejected \(duplicate\)/, 409);
    await refused(setBudgetD(owner, { budgetId: BUDGET, expectedVersion: 2, label: 'x-revised', amount: '999', currency: 'EUR', ownerPrincipalId: owner.principalId, reason: 'B91 ledger harness — stale' }), /^budget rejected \(stale\)/, 409);
    // another executive of the domain: the tenant-level budget is not its to revise from a domain context (only its owner's)
    await refused(setBudgetD(exec2, { budgetId: BUDGET, expectedVersion: 1, label: 'Corridor simulation compute — monthly', amount: '999', currency: 'EUR', ownerPrincipalId: exec2.principalId, reason: 'B91 ledger harness — not the owner' }),
      /^budget rejected \(authority\): a domain context sets its own domain's record only/, 403);
    // the second domain's budget (the administrator's, on the tenant route) is not revised from the corridor domain's context — not even by its owner
    const d2b = (await setBudget(tadmin, { ...decl, domainId: D2, label: 'Second domain simulation — monthly', capabilityKey: 'simulation' })).budget;
    expect(d2b).toMatchObject({ scope: 'DOMAIN', domain_id: D2 });
    await refused(setBudgetD(owner, { budgetId: String(d2b['budget_id']), expectedVersion: 1, label: 'Second domain simulation — monthly', amount: '1', currency: 'EUR', ownerPrincipalId: owner.principalId, reason: 'B91 ledger harness — another domain' }),
      /^budget rejected \(authority\): a domain context sets its own domain's record only/, 403);
    await refused(readBudget(owner, BUDGET), /no qualifying role binding|binding for this tenant/, 403);
    expect((await budgetEvents(BUDGET)).filter((e) => e['event'] !== 'threshold').map((e) => e['event'])).toEqual(['declared']);
  });

  it('RECOVERY: the OWNER revises the budget (v2); 100 % is reached by further usage — raised ONCE more; a budget raises and NEVER stops work: the usage after it is still priced, nothing deleted', async () => {
    // the owner (a domain executive) revises the TENANT-level budget it owns from its own domain's context
    const v2 = (await setBudgetD(owner, { budgetId: BUDGET, expectedVersion: 1, label: 'Corridor simulation compute — monthly (SYNTHETIC)', amount: BUDGET_AMOUNT.toFixed(2), currency: 'EUR',
      ownerPrincipalId: owner.principalId, thresholds: [80, 100], anomaly: { k: 100, window_days: 7 }, reason: 'B91 ledger harness — the owner confirms the month\'s amount' })).budget;
    expect(v2).toMatchObject({ version: 2, set_by: owner.principalId });
    // v2's thresholds are evaluated afresh: 80 % is raised again for the NEW version, once
    const t1 = await tick();
    expect((t1['thresholds'] as Row[]).map((x) => x['threshold'])).toEqual([80]);
    // push the month past 100 %: 0.3 × the amount more, at v2's price (0.08 / s)
    uid['u9'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: Math.ceil((BUDGET_AMOUNT * 0.3) / 0.08), at: await dbAgo(1) });
    const t2 = await tick();
    expect(t2).toMatchObject({ priced_usage: 1 });
    expect((t2['thresholds'] as Row[]).map((x) => x['threshold'])).toEqual([100]);
    const its = await items(BUDGET);
    expect(its.map((i) => String(i['title']).slice(0, 19))).toEqual(['Budget 80% reached:', 'Budget 80% reached:', 'Budget 100% reached']);
    expect((await budgetEvents(BUDGET)).map((e) => [e['event'], e['budget_version'], e['threshold']])).toEqual([['declared', 1, null], ['threshold', 1, 80], ['revised', 2, null], ['threshold', 2, 80], ['threshold', 2, 100]]);
    // NEVER STOPS WORK: usage after the 100 % breach is priced like any other
    uid['u10'] = await usage({ domain: D(), cap: 'simulation', dim: 'simulation_compute', unit: U.wall, qty: 10, at: await dbAgo(1) });
    expect(await tick()).toMatchObject({ priced_usage: 1, thresholds: [] });
    const v = (await readBudgetD(owner, BUDGET)).budget['variance'] as Row;
    expect(num(v['pct'])).toBeGreaterThan(100);
    expect(num(v['variance'])).toBeGreaterThan(0);
  });
});

describe('B91 §LE · L4 ANOMALY: cle-anomaly@1 on a domain budget (IA-70-002 anomaly)', () => {
  it('POSITIVE: today\'s inference spend above 3 × the trailing 3-day mean is an ANOMALY — recorded and raised to the owner, its figures equal the pure rule\'s', async () => {
    const b = (await setBudgetD(tadmin, { label: 'Corridor model inference — monthly (SYNTHETIC)', capabilityKey: 'inference', periodKind: 'month', amount: '1000', currency: 'EUR',
      ownerPrincipalId: owner.principalId, anomaly: { k: 3, window_days: 3 }, reason: 'B91 ledger harness — the corridor\'s inference' })).budget;
    INFER_BUDGET = String(b['budget_id']);
    expect(b).toMatchObject({ scope: 'DOMAIN', domain_id: D(), anomaly_rule: { k: 3, window_days: 3 } });
    // the domain's own budget, revised by an executive of the domain who is NOT its owner: ownership (403)
    await refused(setBudgetD(exec2, { budgetId: INFER_BUDGET, expectedVersion: 1, label: 'Corridor model inference — monthly (SYNTHETIC)', amount: '1', currency: 'EUR', ownerPrincipalId: exec2.principalId,
      reason: 'B91 ledger harness — not the owner' }), /^budget rejected \(ownership\): a budget is revised by the tenant administrator or its owner/, 403);
    for (const d of [3, 2, 1]) await usage({ domain: D(), cap: 'inference', dim: 'model_inference', unit: U.calls, qty: 10, at: await dbDayNoon(d) });   // 0.20 EUR a day
    await usage({ domain: D(), cap: 'inference', dim: 'model_inference', unit: U.calls, qty: 100, at: await dbAgo(1) });                                   // 2.00 EUR today
    const t = await tick();
    const an = (t['anomalies'] as Row[]).filter((a) => a['budget_id'] === INFER_BUDGET);
    expect(an).toHaveLength(1);
    const math = anomalyRule({ todaySpend: 2, trailingDaily: [0.2, 0.2, 0.2], k: 3 });
    expect(math.anomalous).toBe(true);
    expect(num(an[0]!['today_spend'])).toBeCloseTo(math.todaySpend, 6);
    expect(num(an[0]!['trailing_mean'])).toBeCloseTo(math.trailingMean, 6);
    const its = await items(INFER_BUDGET);
    expect(its).toHaveLength(1);
    expect(its[0]).toMatchObject({ cause_event_type: 'budget.anomaly', owner: owner.principalId, state: 'open' });
    expect(String(its[0]!['title'])).toMatch(/^Spend anomaly: Corridor model inference — monthly \(SYNTHETIC\) — 2\.00 EUR today, 10\.0× the 3-day mean of 0\.20 EUR$/);
  });

  it('REFUSAL: with NO baseline (no spend in the window) the rule is not applied — noted, never an anomaly nor an all-clear; an anomaly rule with k ≤ 1 or a 2-day window is refused (422)', async () => {
    const b = (await setBudget(tadmin, { label: 'Catalogue reads — monthly (SYNTHETIC)', capabilityKey: 'catalogue', periodKind: 'month', amount: '500', currency: 'EUR', ownerPrincipalId: owner.principalId,
      anomaly: { k: 2, window_days: 3 }, reason: 'B91 ledger harness — product reads' })).budget;
    CATALOGUE_BUDGET = String(b['budget_id']);
    await usage({ domain: D(), cap: 'catalogue', dim: 'product_consumption', unit: U.reads, qty: 4000, at: await dbAgo(1),
      details: { asset: 'corridor-warning-' + 'stream', product_id: '0193a3d0-0000-7000-8000-00000000b91a', consumer_principal_id: owner.principalId } });
    const t = await tick();
    expect((t['anomalies'] as Row[]).filter((a) => a['budget_id'] === CATALOGUE_BUDGET)).toEqual([]);
    expect((t['notes'] as Row[]).find((n) => n['budget_id'] === CATALOGUE_BUDGET)).toMatchObject({ anomaly: 'no_baseline' });
    expect(anomalyRule({ todaySpend: 4, trailingDaily: [0, 0, 0], k: 2 }).basis).toBe('no_baseline');
    const bad = { label: 'Bad rule', capabilityKey: 'twins', periodKind: 'month', amount: '10', currency: 'EUR', ownerPrincipalId: owner.principalId, reason: 'B91 ledger harness — refused' };
    await refused(setBudget(tadmin, { ...bad, anomaly: { k: 1, window_days: 7 } }), /^budget rejected \(anomaly\)/, 422);
    await refused(setBudget(tadmin, { ...bad, anomaly: { k: 3, window_days: 2 } }), /^budget rejected \(anomaly\)/, 422);
  });

  it('RECOVERY: the anomaly is raised ONCE per budget and day — the next tick adds nothing; the budget events hold it with its rule', async () => {
    const t = await tick();
    expect((t['anomalies'] as Row[]).filter((a) => a['budget_id'] === INFER_BUDGET)).toEqual([]);
    expect(await items(INFER_BUDGET)).toHaveLength(1);
    const ev = (await budgetEvents(INFER_BUDGET)).filter((e) => e['event'] === 'anomaly');
    expect(ev).toHaveLength(1);
    expect(ev[0]!['details']).toMatchObject({ rule: 'cle-anomaly@1', k: 3, window_days: 3, by: 'tick' });
  });
});

describe('B91 §LE · L5 UNIT DATA COST (DQM-040) AND THE ENERGY ESTIMATE (IA-70-001, DP-70-001)', () => {
  const window = async () => ({ from: String((await one(sql`select to_json(clock_timestamp() - interval '60 days') #>> '{}' as t`))['t']), to: String((await one(sql`select to_json(clock_timestamp() + interval '1 day') #>> '{}' as t`))['t']) });

  it('POSITIVE: the unit data cost per asset + tenant + profile + product + consumer + window; the energy ESTIMATE equals Σ quantity × coefficient, the entries priced without a coefficient COUNTED, not zero', async () => {
    const w = await window();
    const v = (await tenantRead(tadmin, w)).ledger;
    const uc = v['unit_cost'] as Row[];
    const reads = uc.find((r) => r['dimension'] === 'product_consumption')!;
    expect(reads).toMatchObject({ asset_ref: 'corridor-warning-' + 'stream', tenant_id: T(), profile: 'local-dev', product_id: '0193a3d0-0000-7000-8000-00000000b91a', consumer_principal_id: owner.principalId, unit: U.reads, currency: 'EUR', entries: 1 });
    expect(num(reads['unit_cost'])).toBeCloseTo(0.001, 8);
    expect(num(reads['amount'])).toBeCloseTo(4, 6);
    const sim = uc.find((r) => r['dimension'] === 'simulation_compute')!;
    expect(sim).toMatchObject({ asset_ref: 'b91-ledger-fixture', product_id: null });
    expect(num(sim['unit_cost'])).toBeCloseTo(num(sim['amount']) / num(sim['quantity']), 8);
    const energy = ((v['energy'] as Row)['rows'] as Row[]);
    expect((v['energy'] as Row)['label']).toBe('ESTIMATE');
    const simE = energy.find((e) => e['dimension'] === 'simulation_compute')!;
    const lines = await rows(sql`select c.quantity::float8 q, r.energy_kwh_per_unit::float8 k from commercial.cost_entries c join commercial.rate_cards r using (rate_card_id)
      where c.tenant_id = ${T()}::uuid and c.dimension = 'simulation_compute' and c.occurred_at >= ${w.from}::timestamptz and c.occurred_at < ${w.to}::timestamptz`);
    const math = energyEstimate(lines.map((l) => ({ quantity: num(l['q']), kwhPerUnit: l['k'] === null ? null : num(l['k']) })));
    expect(num(simE['energy_kwh'])).toBeCloseTo(math.kwh, 6);
    expect(simE).toMatchObject({ entries_estimated: math.estimated, entries_not_estimated: math.notEstimated, label: 'ESTIMATE' });
    expect(math.estimated).toBeGreaterThan(0); expect(math.notEstimated).toBeGreaterThan(0);
    expect((simE['bases'] as string[])[0]).toMatch(/^SYNTHETIC: 300 W/);
    expect(energy.find((e) => e['dimension'] === 'model_inference')).toMatchObject({ energy_kwh: null, entries_estimated: 0 });   // no coefficient: not estimated, never 0 kWh
  });

  it('REFUSAL: an analyst (no read role) and another tenant\'s administrator are refused (403); the platform administrator is not a reader of cost governance', async () => {
    await refused(domainApi.read(E(analyst, 'commercial.ledger.read', 'CLG', null, 'DOMAIN'), T(), D(), { payload: {} }) as Promise<unknown>, /no qualifying role binding/, 403);
    await refused(tenantRead(outsiderAdmin), /binding for this tenant|scope/i, 403);
    await refused(platformRead(platformAdmin), /no qualifying role binding/, 403);
  });

  it('RECOVERY: a DOMAIN reader (the domain administrator) sees its own domain\'s entries and the tenant-level ones — never the sibling domain\'s allocated share; the tenant reader sees all', async () => {
    const w = await window();
    const mine = (await domainEntries(dadmin, { ...w, limit: 500 })).entries;
    const all = (await tenantEntries(tadmin, { ...w, limit: 500 })).entries;
    expect(all.some((e) => e['domain_id'] === D2)).toBe(true);
    expect(mine.some((e) => e['domain_id'] === D2)).toBe(false);
    expect(mine.some((e) => e['domain_id'] === null)).toBe(true);
    expect(mine.length).toBe(all.filter((e) => e['domain_id'] !== D2).length);
  });
});

describe('B91 §LE · L6 OPTIMISATION — THE BOUNDARY HARNESS: never residency, isolation, retention or recovery (IA-70-003, DP-70-003, IA-70-005)', () => {
  const decisions = async () => num((await one(sql`select count(*)::int n from commercial.optimisation_decisions where tenant_id = ${T()}::uuid`))['n']);
  const tradeoffs = [{ dimension: 'latency', effect: 'sweeps finish up to 6 hours later (off-peak only)' }, { dimension: 'cost', effect: 'about 30 % less compute spend (SYNTHETIC estimate)' }];

  it('POSITIVE: the commercial authority ADOPTS an off-peak compute schedule with its trade-offs stated; the boundary check is recorded as passed', async () => {
    const o = (await optimise(vendor, { tenantId: T(), title: 'Run corridor sweeps off-peak', decision: 'adopt', changes: [{ control: 'compute_schedule', from: 'any time', to: 'off-peak 22:00–06:00 UTC' }],
      tradeoffs, expectedSaving: { amount: 120, currency: 'EUR' }, rationale: 'B91 ledger harness — the sweep is not time-critical (SYNTHETIC)' })).optimisation;
    expect(o).toMatchObject({ scope: 'TENANT', tenant_id: T(), decision: 'adopt', boundary_check: { rule: 'cle-boundary@1', passed: true, changed_controls: ['compute_schedule'] } });
    expect((o['tradeoffs'] as Row[]).length).toBe(2);
  });

  it('REFUSAL: residency, isolation, retention and recovery — each refused (`optimisation rejected (boundary)`), also when hidden as a key inside an adjustable change; nothing recorded; the tenant\'s residency untouched; an unknown control, no trade-offs, the tenant administrator (the PDP)', async () => {
    const before = await decisions();
    const residency = String((await one(sql`select residency_profile from tenancy.tenants where id = ${T()}::uuid`))['residency_profile']);
    const attempts: Array<[string, Row]> = [
      ['residency', { control: 'residency', from: residency, to: 'cheapest-region' }],
      ['isolation', { control: 'isolation', from: 'dedicated', to: 'shared-pool' }],
      ['retention', { control: 'retention', from: 'P7Y', to: 'P1Y' }],
      ['recovery', { control: 'recovery', from: { rpo: 'PT15M' }, to: { rpo: 'PT24H' } }],
      ['region', { control: 'instance_size', from: { size: 'm' }, to: { size: 's', placement: { region: 'outside-eu' } } }],   // a residency move dressed as a resize
      ['backup', { control: 'storage_compression', from: 'none', to: { codec: 'zstd', backup: 'disabled' } }],
    ];
    for (const [hit, change] of attempts) {
      const r = await refused(optimise(vendor, { tenantId: T(), title: `Cheaper by changing ${hit}`, decision: 'adopt', changes: [change], tradeoffs, rationale: 'B91 ledger harness — the boundary harness' }),
        /^optimisation rejected \(boundary\): /, 422);
      expect(r.message).toContain(hit);
      expect(r.message).toMatch(/never weakens residency, isolation, retention or recovery/);
      expect(r.message).toMatch(/latency: sweeps finish up to 6 hours later/);   // the trade-offs exposed in the refusal
      expect(r.message).toMatch(/nothing is adopted or applied$/);
    }
    // a DEFER of a boundary-crossing optimisation is refused the same way
    await refused(optimise(vendor, { tenantId: T(), title: 'Shared isolation, later', decision: 'defer', changes: [{ control: 'isolation', to: 'shared' }], tradeoffs, rationale: 'B91 ledger harness — refused' }), /^optimisation rejected \(boundary\)/, 422);
    await refused(optimise(vendor, { tenantId: T(), title: 'Turbo', decision: 'adopt', changes: [{ control: 'turbo_mode', to: true }], tradeoffs, rationale: 'B91 ledger harness — refused' }), /^optimisation rejected \(control\): turbo_mode/, 422);
    await refused(optimise(vendor, { tenantId: T(), title: 'No trade-offs', decision: 'adopt', changes: [{ control: 'batch_window', to: 'PT1H' }], tradeoffs: [], rationale: 'B91 ledger harness — refused' }), /^optimisation rejected \(tradeoffs\)/, 422);
    await refused(platformApi.recordOptimisation(E(tadmin, 'commercial.optimisation.record', 'COP', null, 'TENANT'), { payload: { tenantId: T(), title: 'x', changes: [], tradeoffs: [] } }) as Promise<unknown>, /no qualifying|scope|binding/i, 403);
    expect(await decisions()).toBe(before);
    expect(String((await one(sql`select residency_profile from tenancy.tenants where id = ${T()}::uuid`))['residency_profile'])).toBe(residency);
  });

  it('RECOVERY: the same saving restated WITHOUT the protected change (a batch window and a cache tier) is recorded, with its trade-offs', async () => {
    const o = (await optimise(vendor, { tenantId: T(), title: 'Batch the corridor sweeps hourly and cool the cache', decision: 'defer',
      changes: [{ control: 'batch_window', from: 'PT0S', to: 'PT1H' }, { control: 'cache_tier', from: 'hot', to: 'warm' }], tradeoffs, rationale: 'B91 ledger harness — the safe restatement' })).optimisation;
    expect(o).toMatchObject({ decision: 'defer', boundary_check: { passed: true, changed_controls: ['batch_window', 'cache_tier'] } });
    const listed = (await tenantRead(tadmin)).ledger['optimisations'] as Row[];
    expect(listed.filter((x) => x['tenant_id'] === T()).map((x) => x['title'])).toEqual(['Batch the corridor sweeps hourly and cool the cache', 'Run corridor sweeps off-peak']);
  });
});

describe('B91 §LE · L7 INVOICE RECONCILIATION — SYNTHETIC invoices (V10-T-016; a real billing account is the external prerequisite and closes the clause)', () => {
  const ledgerLines = async (fromDate: string, toDate: string) => rows(sql`select dimension, min(unit) as unit, sum(quantity)::float8 as quantity, round(sum(amount), 2)::float8 as amount
    from commercial.cost_entries where tenant_id = ${T()}::uuid and currency = 'EUR' and occurred_at >= (${fromDate}::date)::timestamp at time zone 'UTC'
      and occurred_at < ((${toDate}::date) + 1)::timestamp at time zone 'UTC' group by dimension order by dimension`);
  const day0 = async (offset: number) => String((await one(sql`select ((clock_timestamp() at time zone 'UTC')::date + ${offset}::int)::text as d`))['d']);
  let INV1 = ''; let INV2 = ''; let INV3 = ''; let TOKENS_AMOUNT = 0;
  const lineOf = (l: Row, over: Row = {}) => ({ dimension: l['dimension'], unit: l['unit'], quantity: num(l['quantity']), amount: num(l['amount']), description: 'SYNTHETIC invoice line', ...over });
  const totalOf = (ls: Array<{ amount: number }>) => (Math.round(ls.reduce((a, l) => a + l.amount * 100, 0)) / 100).toFixed(2);

  it('POSITIVE: an invoice whose lines are the ledger\'s totals for the period reconciles MATCHED within a cent; a second whose lines differ shows the differences PER DIMENSION', async () => {
    const from = await day0(-40); const to = await day0(-1);
    const ls = (await ledgerLines(from, to)).map((l) => lineOf(l));
    expect(ls.length).toBeGreaterThan(0);
    INV1 = String((await importInvoice(vendor, { tenantId: T(), invoiceRef: `SYN-${TAG}-1`, periodStart: from, periodEnd: to, currency: 'EUR', total: totalOf(ls), issuer: 'THE EYE vendor (SYNTHETIC)', synthetic: true, lines: ls })).invoice['invoice_id']);
    const r1 = (await reconcile(vendor, INV1, { tolerance: '0.01' })).reconciliation;
    expect(r1).toMatchObject({ version: 1, outcome: 'matched', totals: { synthetic_invoice: true, rule: 'cle-reconcile@1', other_currency_entries: 0 } });
    // the second: compute 5.00 more on the invoice, storage missing, a product line the ledger has not got in the period
    const sim = ls.find((l) => l.dimension === 'simulation_compute')!;
    const ls2 = [{ ...sim, amount: Math.round((sim.amount + 5) * 100) / 100 }, ...ls.filter((l) => l.dimension !== 'simulation_compute' && l.dimension !== 'storage'),
                 { dimension: 'product_consumption', unit: U.reads, quantity: 1000, amount: 1, description: 'SYNTHETIC' }];
    INV2 = String((await importInvoice(vendor, { tenantId: T(), invoiceRef: `SYN-${TAG}-2`, periodStart: from, periodEnd: to, currency: 'EUR', total: totalOf(ls2), issuer: 'THE EYE vendor (SYNTHETIC)', synthetic: true, lines: ls2 })).invoice['invoice_id']);
    const r2 = (await reconcile(vendor, INV2)).reconciliation;
    expect(r2['outcome']).toBe('differences');
    const by = Object.fromEntries((r2['lines'] as Row[]).map((l) => [String(l['dimension']), l]));
    expect(num(by['simulation_compute']!['amount_difference'])).toBeCloseTo(5, 2);
    expect(by['storage']).toMatchObject({ on_invoice: false, in_ledger: true, within_tolerance: false });
    expect(by['product_consumption']).toMatchObject({ on_invoice: true, in_ledger: false, within_tolerance: false });
    expect(by['model_inference']).toMatchObject({ within_tolerance: true });
  });

  it('REFUSAL: a non-synthetic invoice (422 — the real billing account is the external prerequisite), lines that do not sum to the total, a duplicate reference (409), an unknown invoice (404), the tenant administrator importing (the PDP); unpriced usage in the period is NEVER matched', async () => {
    const d = await day0(-1);
    const base = { tenantId: T(), periodStart: d, periodEnd: d, currency: 'EUR', issuer: 'THE EYE vendor (SYNTHETIC)', lines: [{ dimension: 'storage', unit: U.gb, quantity: 1, amount: 1 }] };
    await refused(importInvoice(vendor, { ...base, invoiceRef: `REAL-${TAG}`, total: '1.00', synthetic: false }), /^invoice rejected \(synthetic\): this build imports SYNTHETIC invoices only/, 422);
    await refused(importInvoice(vendor, { ...base, invoiceRef: `SYN-${TAG}-X`, total: '2.00', synthetic: true }), /^invoice rejected \(total\): the lines sum to 1/, 422);
    await refused(importInvoice(vendor, { ...base, invoiceRef: `SYN-${TAG}-1`, total: '1.00', synthetic: true }), /^invoice rejected \(duplicate\)/, 409);
    await refused(reconcile(vendor, uuidv7()), /^reconciliation rejected \(unknown_invoice\)/, 404);
    await refused(platformApi.importInvoice(E(tadmin, 'commercial.invoice.import', 'CIN', null, 'TENANT'), { payload: { ...base, invoiceRef: 'x', total: '1', synthetic: true } }) as Promise<unknown>, /no qualifying|scope|binding/i, 403);
    // today's invoice expects the tokens at 0.0004 EUR each; the tokens are still UNPRICED (no rate card) — so the reconciliation is differences, never matched
    const today = await day0(0);
    TOKENS_AMOUNT = 5000 * 0.0004;
    const ls = (await ledgerLines(today, today)).map((l) => lineOf(l));
    const inf = ls.find((l) => l.dimension === 'model_inference');
    const ls3 = inf ? ls.map((l) => (l.dimension === 'model_inference' ? { ...l, quantity: l.quantity + 5000, amount: Math.round((l.amount + TOKENS_AMOUNT) * 100) / 100 } : l))
      : [...ls, { dimension: 'model_inference', unit: U.tokens, quantity: 5000, amount: TOKENS_AMOUNT, description: 'SYNTHETIC' }];
    INV3 = String((await importInvoice(vendor, { tenantId: T(), invoiceRef: `SYN-${TAG}-3`, periodStart: today, periodEnd: today, currency: 'EUR', total: totalOf(ls3), issuer: 'THE EYE vendor (SYNTHETIC)', synthetic: true, lines: ls3 })).invoice['invoice_id']);
    const r3 = (await reconcile(vendor, INV3)).reconciliation;
    expect(r3['outcome']).toBe('differences');
    const mi = (r3['lines'] as Row[]).find((l) => l['dimension'] === 'model_inference')!;
    expect(mi).toMatchObject({ unpriced_usage: 1, within_tolerance: false });
  });

  it('RECOVERY: the vendor prices the tokens (a card from before their use — nothing priced under it), the tick prices them, and the SECOND reconciliation of today\'s invoice is MATCHED; the first stands', async () => {
    await setRate(vendor, { dimension: 'model_inference', unit: U.tokens, pricePerUnit: '0.0004', currency: 'EUR', effectiveFrom: await dbAgo(2 * DAY), synthetic: true, reason: 'B91 ledger harness — the token price, at last (SYNTHETIC)' });
    const t = await tick();
    expect(t).toMatchObject({ priced_usage: 1, unpriced: {} });
    expect(num((await expectPricedAsMath(uid['u6']!))[0]!['amount'])).toBeCloseTo(TOKENS_AMOUNT, 9);
    const r = (await reconcile(vendor, INV3)).reconciliation;
    // integrated (§ME): the attention tick's REAL storage sampler records this domain's evidence bytes (unit bytes) — this harness sets
    // no rate card for bytes (rate cards are platform-wide; its units are its own), so those samples stay UNPRICED and, by the rule,
    // unpriced usage is never matched. The tokens' recovery is proven per dimension; the whole invoice matches only when nothing else
    // in the period is unpriced (POSITIVE proves a whole MATCHED reconciliation).
    const sampled = Number((await one(sql`select count(*)::int as n from commercial.usage_records u where u.tenant_id = ${T()}::uuid and u.dimension = 'storage'
      and u.source_kind = 'storage_sample' and (u.occurred_at at time zone 'UTC')::date = ${await day0(0)}::date and not exists (select 1 from commercial.cost_entries c where c.usage_id = u.usage_id)`))['n']);
    const unpricedAll = Number((await one(sql`select count(*)::int as n from commercial.usage_records u where u.tenant_id = ${T()}::uuid
      and not exists (select 1 from commercial.cost_entries c where c.usage_id = u.usage_id)`))['n']);
    const lines = r['lines'] as Row[];
    expect(lines.find((l) => l['dimension'] === 'model_inference'), JSON.stringify(lines)).toMatchObject({ unpriced_usage: 0, within_tolerance: true, quantity_difference: 0 });
    for (const l of lines.filter((x) => x['dimension'] !== 'storage')) expect(l, JSON.stringify(l)).toMatchObject({ unpriced_usage: 0, within_tolerance: true });
    expect(lines.find((l) => l['dimension'] === 'storage')?.['unpriced_usage'] ?? 0).toBe(sampled);
    const outcome = sampled > 0 ? 'differences' : 'matched';
    expect(r).toMatchObject({ version: 2, outcome });
    const view = (await tenantRead(auditor)).ledger;
    const inv = (view['invoices'] as Row[]).find((i) => i['invoice_id'] === INV3)!;
    expect((inv['reconciliations'] as Row[]).map((x) => [x['version'], x['outcome']])).toEqual([[2, outcome], [1, 'differences']]);
    expect(inv).toMatchObject({ synthetic: true });
    expect(view['complete']).toBe(unpricedAll === 0);
    expect(RATE_SIM_V2).toMatch(/^[0-9a-f-]{36}$/);
  });
});
