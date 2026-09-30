/**
 * CP-6 B90 §K (0095 §K) — THE METADATA CATALOG AND DATA DISCOVERY (F-P7-F-11; V7 ch49 DP-49-001..006; DAT-TR-01), through the real
 * database and controllers (the prelude's products routes, the catalog routes, the attention tick by hand).
 *
 *   a THE CATALOG ENTRY: a staging asset registered by the steward without an owner (unowned), an external asset registered by its owner,
 *     the fixture source catalogued by reference (its registry's state and observation copied); the refusals (an outsider, a non-steward
 *     registering for someone else, a duplicate, a ref no registry knows, a kind outside the six, an unknown owner, a classification
 *     outside the four); the owner set by the steward (unowned cleared), the owner's own recertification, the not-owner refused.
 *   c1 THE FIRST RECONCILIATION: the registries walked — the schemas, the canonical fields, the source, the two products — the missing
 *     entries created (a product's owner learnt from the registry, the rest unowned), the released product flagged lineage_missing, the
 *     staging asset with no owner and no lineage flagged ORPHAN and undiscoverable, and the catalog.coverage item routed to the
 *     data_steward role under the published policy; a second run raises nothing twice.
 *   b LINEAGE AND THE GLOSSARY: source → product → product declared (lineage_missing cleared; the read shows both directions with the
 *     neighbours' titles); a term defined and redefined (the prior kept in the ledger; the asset bound by name); the refusals (a self
 *     edge, a duplicate, a non-owner, an unknown asset, a kind outside the four; a term by an analyst, a short definition, an unknown
 *     owner, the same definition twice); an edge retired by a stated superuser move once and immutable after, never deleted.
 *   c2 THE CONTINUITY RULE: stale (a stated superuser move on last_observed_at — the trust read judges it at once, the run records it, the
 *     next run clears it), ownership lapsed (a stated move on recertify_by — the item routed to the OWNER; the owner's recertification
 *     recovers), a duplicate title, a flag set and cleared by the steward's hand; the tick step catalog-reconcile runs the same port under
 *     executive.attention.tick; the coverage debt read.
 *   d DISCOVERY: the search finds the source by its title, an asset by its owner's name and by a glossary term, with lineage and owner on
 *     the hit; an undiscoverable entry is counted, not served; a confidential entry is hidden from an internal-cleared reader and served
 *     to a confidential-cleared one (the read by id refused the same way); the trust read answers the stop of new consumption.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser
 * moves (the DB clock): last_observed_at moved back past the staleness period; recertify_by moved into the past; an edge retired.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { CatalogController } from '../../src/products/catalog/catalog.controller.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let cat: CatalogController; let products: ProductsController; let exec: ExecutiveController; let scheduler: SchedulerService; let timer: AttentionTimerService;
/** The data steward; the owner of the products (domain_analyst); a second owner; the reviewer (executive — the confidential-cleared reader); an analyst (the internal-cleared reader); the administrators; an outsider. */
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let owner2: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentId = ''; let agentPrincipalId = '';
let P1 = ''; let P2 = ''; let SRC_KEY = ''; let SRC_NAME = ''; let SCHEMA_TYPE = 'OBS'; let SCHEMA_VERSION = 'v1';
let A_STG = ''; let A_EXT = ''; let A_SRC = ''; let A_P1 = ''; let A_P2 = ''; let A_CONF = ''; let A_DUP = ''; let EDGE1 = ''; let ITEM_ORPHAN = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
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
const flagsOf = (a: Row): string[] => (a['flags'] as Row[]).map((f) => String(f['kind'])).sort();

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type = 'CAT', id: string | null = null) => h.req(as, action, type, id, 'executive');
const register = (as: AuthenticatedPrincipal, payload: Row) => cat.register(E(as, 'products.catalog.asset.register'), T(), D(), { payload }) as Promise<{ asset: Row }>;
const setOwner = (as: AuthenticatedPrincipal, id: string, ownerPrincipalId: string) => cat.setOwner(E(as, 'products.catalog.owner.set', 'CAT', id), T(), D(), id, { payload: { ownerPrincipalId } }) as Promise<{ asset: Row }>;
const recertify = (as: AuthenticatedPrincipal, id: string) => cat.recertify(E(as, 'products.catalog.recertify', 'CAT', id), T(), D(), id) as Promise<{ asset: Row }>;
const flag = (as: AuthenticatedPrincipal, id: string, kind: string, reason: string, clear = false) => cat.flag(E(as, 'products.catalog.flag', 'CAT', id), T(), D(), id, { payload: { kind, reason, clear } }) as Promise<{ asset: Row }>;
const lineage = (as: AuthenticatedPrincipal, fromAssetId: string, toAssetId: string, kind: string, evidence: Row = {}) => cat.declareLineage(E(as, 'products.catalog.lineage.declare', 'CAT', fromAssetId), T(), D(), { payload: { fromAssetId, toAssetId, kind, evidence } }) as Promise<{ edge: Row }>;
const defineTerm = (as: AuthenticatedPrincipal, term: string, definition: string, ownerPrincipalId: string) => cat.defineTerm(E(as, 'products.catalog.term.define'), T(), D(), { payload: { term, definition, ownerPrincipalId } }) as Promise<{ term: Row }>;
const reconcile = (as: AuthenticatedPrincipal) => cat.reconcile(E(as, 'products.catalog.reconcile'), T(), D()) as Promise<{ run: Row }>;
const search = (as: AuthenticatedPrincipal, q: string, kinds: string[] | null = null) => cat.search(E(as, 'products.catalog.search'), T(), D(), { payload: { q, kinds } }) as Promise<{ search: Row }>;
const coverage = (as: AuthenticatedPrincipal) => cat.coverage(E(as, 'products.catalog.read'), T(), D()) as Promise<{ coverage: Row; runs: Row[] }>;
const list = (as: AuthenticatedPrincipal, payload: Row = {}) => cat.list(E(as, 'products.catalog.read'), T(), D(), { payload }) as Promise<{ assets: Row[] }>;
const read = (as: AuthenticatedPrincipal, id: string) => cat.read(E(as, 'products.catalog.read', 'CAT', id), T(), D(), id) as Promise<{ asset: Row }>;
const trust = (as: AuthenticatedPrincipal, kind: string, ref: string) => cat.trust(E(as, 'products.catalog.read'), T(), D(), { payload: { kind, ref } }) as Promise<{ trust: Row }>;
const terms = (as: AuthenticatedPrincipal) => cat.terms(E(as, 'products.catalog.read'), T(), D(), { payload: {} }) as Promise<{ terms: Row[] }>;
const registerProduct = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declare = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(E(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } as Row }) as Promise<{ product: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(E(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(E(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const tick = async () => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, 1)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const items = async () => rows(sql`select item_id::text, subject_kind, subject_id::text, owner_principal_id::text as owner, route_roles, state, title, details from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = 'catalog.coverage' order by created_at`);
const assetOf = async (kind: string, ref: string): Promise<Row> => (await rows(sql`select asset_id::text, kind, ref, title, owner_principal_id::text, lifecycle_state, trusted, discoverable, flags, last_observed_at, recertify_by, release from products.catalog_assets where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and kind = ${kind} and ref = ${ref}`))[0]!;

/** A SYNTHETIC declaration: a contract by registered schema, the fixture source as input, one authoritative output. */
const DECL = (over: Row = {}): Row => ({
  contract: { schema: [{ object_type: SCHEMA_TYPE, schema_version: SCHEMA_VERSION }] },
  serving_modes: ['api'],
  inputs: [{ kind: 'source', ref: SRC_KEY }],
  outputs: [{ kind: 'object_type', ref: 'WRN', authority: true }],
  slo: { freshness_seconds: 3600 },
  policy: { purposes: ['executive'], data_classes: ['internal'] },
  cost: { basis: 'compute-minutes' },
  quality: { completeness: 'declared' },
  ...over,
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { CatalogController: CC } = await import('../../src/products/catalog/catalog.controller.js');
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  cat = h.app.get(CC); products = h.app.get(PC); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  steward = await h.humanWithSession(['data_steward'], 'b90k-steward');
  owner = await h.humanWithSession(['domain_analyst'], 'b90k-owner');
  owner2 = await h.humanWithSession(['forecast_owner'], 'b90k-owner-two');
  reviewer = await h.humanWithSession(['executive'], 'b90k-reviewer');
  analyst = await h.humanWithSession(['domain_analyst'], 'b90k-analyst');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b90k-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b90k-dadmin');
  outsider = await h.humanWithSession(['collection_manager'], 'b90k-outsider');
  // the registries this domain already has: the newest OBS schema, the fixture source
  const reg = await rows(sql`select object_type, schema_version from objects.schema_registry where object_type = 'OBS' order by created_at desc, schema_version desc limit 1`);
  if (reg[0] !== undefined) { SCHEMA_TYPE = String(reg[0]['object_type']); SCHEMA_VERSION = String(reg[0]['schema_version']); }
  const src = await rows(sql`select source_key, name from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid order by contract_version desc limit 1`);
  SRC_KEY = String(src[0]!['source_key']); SRC_NAME = String(src[0]!['name']);
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string; principalId: string } };
  agentId = r.agent.agentId; agentPrincipalId = r.agent.principalId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // THE ATTENTION POLICY names the class: catalog.coverage routes to the data steward role when no owner is a human
  await exec.publishAttentionPolicy(h.req(reviewer, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the catalog coverage class for the catalog harness', rules: { classes: {
    'catalog.coverage': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['data_steward'], ack_within_minutes: 240 } } } } as never });
  // TWO PRODUCTS through the prelude's routes (SYNTHETIC): the corridor forecasts released at v1; the corridor warning stream registered only
  P1 = String((await registerProduct(steward, { key: 'corridor-forecasts', title: 'Corridor transit forecasts (SYNTHETIC)', kind: 'forecast', purpose: 'the corridor transit forecasts served to the executive view', ownerPrincipalId: owner.principalId })).product['product_id']);
  await declare(owner, P1, DECL());
  await review(reviewer, P1, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the forecast product reviewed for the domain (B90 catalog harness)' });
  await release(owner, P1, 1);
  P2 = String((await registerProduct(steward, { key: 'corridor-warning-' + 'stream', title: 'Corridor warning stream (SYNTHETIC)', kind: 'event', purpose: 'the early warnings of the corridor as a subscribable event product', ownerPrincipalId: owner.principalId })).product['product_id']);
}, 400_000);

afterAll(async () => { await h?.close(); });

describe('B90 §K · a THE CATALOG ENTRY', () => {
  it('POSITIVE: the steward registers a staging asset without an owner (unowned); an owner registers an external asset as their own; the steward catalogues the fixture source by reference (its registry state copied, observed now)', async () => {
    const stg = (await register(steward, { kind: 'staging', ref: 'ais_staging_w40', title: 'AIS staging week 40 (SYNTHETIC)', description: 'an intermediate extract of AIS positions before admission', classification: 'internal', locations: ['relation:staging.ais_w40'] })).asset;
    A_STG = String(stg['asset_id']);
    expect(stg).toMatchObject({ kind: 'staging', ref: 'ais_staging_w40', owner_principal_id: null, recertify_by: null, lifecycle_state: 'unknown', trusted: true, discoverable: true, last_observed_at: null });
    expect(flagsOf(stg)).toEqual(['unowned']);
    const ext = (await register(owner, { kind: 'external', ref: 'partner:portwatch/chokepoints', title: 'Partner chokepoint feed (SYNTHETIC)', ownerPrincipalId: owner.principalId, classification: 'internal', glossaryTerms: ['Transit'] })).asset;
    A_EXT = String(ext['asset_id']);
    expect(ext).toMatchObject({ kind: 'external', owner_principal_id: owner.principalId, registered_by: owner.principalId, flags: [] });
    expect(ext['recertify_by']).not.toBeNull();
    const src = (await register(steward, { kind: 'source', ref: SRC_KEY, title: SRC_NAME, description: 'the fixture source, catalogued by reference', glossaryTerms: ['Transit'] })).asset;
    A_SRC = String(src['asset_id']);
    expect(src).toMatchObject({ kind: 'source', ref: SRC_KEY, title: SRC_NAME, lifecycle_state: 'active', owner_principal_id: null });
    expect(src['last_observed_at']).not.toBeNull();
    expect((src['contracts'] as Row)['source_id']).toBe(h.fx.sourceId);
    expect(flagsOf(src)).toEqual(['unowned']);
    const ev = await rows(sql`select event, details from products.catalog_events where asset_id = ${A_STG}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['asset.catalogued', 'asset.flagged']);
  });
  it('REFUSAL: an outsider (the policy); an analyst registering for someone else (the port); a duplicate kind+ref; a ref no registry knows; a kind outside the six; an unknown owner; a classification outside the four', async () => {
    await refused(register(outsider, { kind: 'staging', ref: 'x', title: 'outsider asset' }), /./, 403);
    await refused(register(analyst, { kind: 'staging', ref: 'x_other', title: 'for the owner', ownerPrincipalId: owner.principalId }), /catalog asset rejected \(authority\)/, 403);
    await refused(register(steward, { kind: 'staging', ref: 'ais_staging_w40', title: 'again' }), /catalog asset rejected \(duplicate\)/, 409);
    await refused(register(steward, { kind: 'source', ref: 'no-such-source', title: 'a source nobody registered' }), /catalog asset rejected \(unknown_ref\)/, 404);
    await refused(register(steward, { kind: 'schema', ref: 'ZZZ@v9', title: 'a schema nobody registered' }), /catalog asset rejected \(unknown_ref\)/, 404);
    await refused(register(steward, { kind: 'table', ref: 'x', title: 'a table' }), /catalog asset rejected \(kind\)/, 422);
    await refused(register(steward, { kind: 'staging', ref: 'x_owner', title: 'an unknown owner', ownerPrincipalId: '0190b1c2-d3e4-7000-8000-0000000000aa' }), /catalog asset rejected \(unknown_owner\)/, 404);
    await refused(register(steward, { kind: 'staging', ref: 'x_class', title: 'a secret', classification: 'secret' }), /catalog asset rejected \(classification\)/, 422);
  });
  it('RECOVERY: the steward sets the source\'s owner (unowned cleared, the recertification date set); an analyst cannot; the same owner again is a state refusal; the owner recertifies (the date moves forward); a non-owner is refused; the unowned staging asset has nothing to recertify', async () => {
    const a = (await setOwner(steward, A_SRC, owner2.principalId)).asset;
    expect(a).toMatchObject({ owner_principal_id: owner2.principalId, flags: [], trusted: true });
    expect(a['recertify_by']).not.toBeNull();
    await refused(setOwner(analyst, A_SRC, owner.principalId), /./, 403);
    await refused(setOwner(steward, A_SRC, owner2.principalId), /catalog asset rejected \(state\)/, 409);
    await refused(setOwner(steward, '0190b1c2-d3e4-7000-8000-0000000000bb', owner.principalId), /catalog asset rejected \(unknown_asset\)/, 404);
    await refused(setOwner(steward, A_SRC, '0190b1c2-d3e4-7000-8000-0000000000aa'), /catalog asset rejected \(unknown_owner\)/, 404);
    const before = String(a['recertify_by']);
    await sleep(20);
    const r = (await recertify(owner2, A_SRC)).asset;
    expect(new Date(String(r['recertify_by'])).getTime()).toBeGreaterThan(new Date(before).getTime());
    await refused(recertify(owner, A_SRC), /catalog asset rejected \(not_owner\)/, 403);
    await refused(recertify(steward, A_STG), /catalog asset rejected \(state\)/, 409);
    const ev = await rows(sql`select event from products.catalog_events where asset_id = ${A_SRC}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['asset.catalogued', 'asset.flagged', 'asset.flag_cleared', 'asset.owner_set', 'asset.recertified']);
  });
});

describe('B90 §K · c1 THE FIRST RECONCILIATION', () => {
  it('POSITIVE: the run walks the registries — the schemas, the canonical fields, the source, the two products — creates the missing entries, learns a product\'s owner, flags the released product lineage_missing and the ownerless staging asset ORPHAN; the catalog.coverage item is routed to the data_steward role', async () => {
    const schemas = Number((await rows(sql`select count(*)::int as n from objects.schema_registry`))[0]!['n']);
    const fields = Number((await rows(sql`select count(*)::int as n from objects.canonical_field_registry`))[0]!['n']);
    const run = (await reconcile(steward)).run;
    const counts = run['counts'] as Row;
    expect(run['trigger']).toBe('steward');
    expect(Number(counts['seen'])).toBe(schemas + fields + 1 + 2);
    expect(Number(counts['created'])).toBe(schemas + fields + 2);   // the source was catalogued by the steward already
    expect((counts['flagged_by_kind'] as Row)['orphan']).toBe(1);
    expect((counts['flagged_by_kind'] as Row)['lineage_missing']).toBe(1);
    expect(Number((counts['flagged_by_kind'] as Row)['unowned'])).toBe(schemas + fields);   // the products carry their owner; the source has one now
    expect(Number(counts['attention_items'])).toBe(1);
    const p1 = await assetOf('product', P1); const p2 = await assetOf('product', P2);
    A_P1 = String(p1['asset_id']); A_P2 = String(p2['asset_id']);
    expect(p1).toMatchObject({ title: 'Corridor transit forecasts (SYNTHETIC)', owner_principal_id: owner.principalId, lifecycle_state: 'released', trusted: true, discoverable: true });
    expect((p1['release'] as Row)['released_version']).toBe(1);
    expect(flagsOf(p1)).toEqual(['lineage_missing']);
    expect(p2).toMatchObject({ lifecycle_state: 'registered', owner_principal_id: owner.principalId, flags: [] });
    const sch = await assetOf('schema', `${SCHEMA_TYPE}@${SCHEMA_VERSION}`);
    expect(sch).toMatchObject({ lifecycle_state: 'unknown', owner_principal_id: null });
    expect(flagsOf(sch)).toEqual(['unowned']);
    const stg = await assetOf('staging', 'ais_staging_w40');
    expect(flagsOf(stg)).toEqual(['orphan', 'unowned']);
    expect(stg).toMatchObject({ discoverable: false, trusted: true });
    const its = await items();
    expect(its.length).toBe(1);
    ITEM_ORPHAN = String(its[0]!['item_id']);
    expect(its[0]).toMatchObject({ subject_kind: 'asset', subject_id: A_STG, owner: null, route_roles: ['data_steward'], state: 'open' });
    expect(String(its[0]!['title'])).toMatch(/catalog coverage: staging AIS staging week 40 \(SYNTHETIC\) \(ais_staging_w40\) flagged orphan/);
    const src = await assetOf('source', SRC_KEY);
    expect(src['owner_principal_id']).toBe(owner2.principalId);
  });
  it('REFUSAL: an analyst cannot run the reconciliation (the policy); a second run raises nothing twice (the orphan stands, no new item, nothing created)', async () => {
    await refused(reconcile(analyst), /./, 403);
    const run = (await reconcile(dadmin)).run;
    const counts = run['counts'] as Row;
    expect(Number(counts['created'])).toBe(0);
    expect(counts['flagged_by_kind']).toEqual({});
    expect(Number(counts['attention_items'])).toBe(0);
    expect((await items()).length).toBe(1);
  });
});

describe('B90 §K · b LINEAGE AND THE GLOSSARY', () => {
  it('POSITIVE: the steward declares source → forecasts (feeds); the owner declares forecasts → warning stream on their own products; lineage_missing clears; the read shows both directions with the neighbours\' titles; a term defined, bound by name, then redefined with the prior kept', async () => {
    const e1 = (await lineage(steward, A_SRC, A_P1, 'feeds', { basis: 'the product declaration names the source as its input' })).edge;
    EDGE1 = String(e1['edge_id']);
    expect(e1).toMatchObject({ from_asset_id: A_SRC, to_asset_id: A_P1, kind: 'feeds', from_title: SRC_NAME, to_title: 'Corridor transit forecasts (SYNTHETIC)', declared_by: steward.principalId });
    const e2 = (await lineage(owner, A_P1, A_P2, 'feeds')).edge;
    expect(e2).toMatchObject({ from_asset_id: A_P1, to_asset_id: A_P2, declared_by: owner.principalId });
    const p1 = (await read(steward, A_P1)).asset;
    expect(p1['flags']).toEqual([]);
    expect((p1['upstream'] as Row[]).map((n) => [n['title'], n['kind']])).toEqual([[SRC_NAME, 'feeds']]);
    expect((p1['downstream'] as Row[]).map((n) => [n['title'], n['kind']])).toEqual([['Corridor warning stream (SYNTHETIC)', 'feeds']]);
    expect((p1['product'] as Row)['released_version']).toBe(1);
    const t1 = (await defineTerm(steward, 'Transit', 'A vessel passage through the corridor counted once per direction (SYNTHETIC glossary)', owner2.principalId)).term;
    expect(t1).toMatchObject({ term: 'Transit', version: 1, owner_principal_id: owner2.principalId });
    expect((t1['assets'] as Row[]).map((a) => a['asset_id']).sort()).toEqual([A_EXT, A_SRC].sort());
    const t2 = (await defineTerm(steward, 'transit', 'A vessel passage through the corridor, counted once per direction and per day (SYNTHETIC glossary)', owner2.principalId)).term;
    expect(t2).toMatchObject({ term_id: t1['term_id'], version: 2 });
    const ev = await rows(sql`select event, details from products.catalog_events where event in ('term.defined', 'term.redefined') and tenant_id = ${T()}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['term.defined', 'term.redefined']);
    expect(((ev[1]!['details'] as Row)['prior'] as Row)['definition']).toMatch(/counted once per direction \(SYNTHETIC glossary\)$/);
    const src = (await read(steward, A_SRC)).asset;
    expect((src['terms'] as Row[]).map((t) => [t['term'], t['version']])).toEqual([['transit', 2]]);
    expect((await terms(analyst)).terms.length).toBe(1);
  });
  it('REFUSAL: a self edge; a duplicate live edge; an analyst who owns neither end; an unknown asset; a kind outside the four; a term by an analyst; a short definition; an unknown term owner; the same definition twice', async () => {
    await refused(lineage(steward, A_SRC, A_SRC, 'feeds'), /lineage rejected \(self\)/, 422);
    await refused(lineage(steward, A_SRC, A_P1, 'feeds'), /lineage rejected \(duplicate\)/, 409);
    await refused(lineage(analyst, A_SRC, A_P1, 'serves'), /lineage rejected \(authority\)/, 403);
    await refused(lineage(steward, A_SRC, '0190b1c2-d3e4-7000-8000-0000000000bb', 'feeds'), /lineage rejected \(unknown_asset\)/, 404);
    await refused(lineage(steward, A_SRC, A_P1, 'uses'), /lineage rejected \(kind\)/, 422);
    await refused(defineTerm(analyst, 'Corridor', 'the sea lane between two chokepoints', owner.principalId), /./, 403);
    await refused(defineTerm(steward, 'Corridor', 'short', owner.principalId), /glossary term rejected \(definition\)/, 422);
    await refused(defineTerm(steward, 'Corridor', 'the sea lane between two chokepoints', '0190b1c2-d3e4-7000-8000-0000000000aa'), /glossary term rejected \(unknown_owner\)/, 404);
    await refused(defineTerm(steward, 'Transit', 'A vessel passage through the corridor, counted once per direction and per day (SYNTHETIC glossary)', owner2.principalId), /glossary term rejected \(state\)/, 409);
  });
  it('RECOVERY: an edge is retired by a stated superuser move ONCE (the forward trigger: immutable after, never deleted); the same edge can be declared again as a new live row', async () => {
    await sql`update products.lineage_edges set retired_at = clock_timestamp(), retired_by = ${steward.principalId}::uuid, retirement_reason = 'stated superuser move: the edge retired' where edge_id = ${EDGE1}::uuid`.execute(su);
    await expect(sql`update products.lineage_edges set retirement_reason = 'again' where edge_id = ${EDGE1}::uuid`.execute(su)).rejects.toThrow(/immutable/);
    await expect(sql`update products.lineage_edges set kind = 'serves' where edge_id = ${EDGE1}::uuid`.execute(su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from products.lineage_edges where edge_id = ${EDGE1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    const e = (await lineage(steward, A_SRC, A_P1, 'feeds', { basis: 'declared again after the retirement' })).edge;
    expect(e['edge_id']).not.toBe(EDGE1);
    expect((await rows(sql`select count(*)::int as n from products.lineage_edges where from_asset_id = ${A_SRC}::uuid and to_asset_id = ${A_P1}::uuid`))[0]!['n']).toBe(2);
    const p1 = (await read(steward, A_P1)).asset;
    expect((p1['upstream'] as Row[]).length).toBe(1);   // the live one only
  });
});

describe('B90 §K · c2 THE CONTINUITY RULE', () => {
  it('STALE — POSITIVE: a stated superuser move sets the source\'s observation back 8 days; the trust read judges it untrusted at once; the run records the stale flag; the next run clears it', async () => {
    await sql`update products.catalog_assets set last_observed_at = clock_timestamp() - interval '8 days' where asset_id = ${A_SRC}::uuid`.execute(su);
    const t = (await trust(analyst, 'source', SRC_KEY)).trust;
    expect(t).toMatchObject({ known: true, asset_id: A_SRC, trusted: false, discoverable: true });
    expect((t['flags'] as Row[]).map((f) => f['kind'])).toEqual(['stale']);
    const run = (await reconcile(steward)).run;
    expect(((run['counts'] as Row)['flagged_by_kind'] as Row)['stale']).toBe(1);
    const a = await assetOf('source', SRC_KEY);
    expect(flagsOf(a)).toEqual(['stale']);
    expect(a['trusted']).toBe(false);
    expect(new Date(String(a['last_observed_at'])).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const run2 = (await reconcile(steward)).run;
    expect(Number((run2['counts'] as Row)['cleared'])).toBeGreaterThanOrEqual(1);
    const b = await assetOf('source', SRC_KEY);
    expect(b['flags']).toEqual([]);
    expect(b['trusted']).toBe(true);
    expect((await trust(analyst, 'source', SRC_KEY)).trust['trusted']).toBe(true);
  });
  it('OWNERSHIP LAPSED — REFUSAL and RECOVERY: a stated move puts the external asset\'s recertification in the past; the run flags it (untrusted) and routes the item to its OWNER; the owner recertifies and the flag clears; the next run raises nothing', async () => {
    await sql`update products.catalog_assets set recertify_by = clock_timestamp() - interval '1 day' where asset_id = ${A_EXT}::uuid`.execute(su);
    const run = (await reconcile(steward)).run;
    expect(((run['counts'] as Row)['flagged_by_kind'] as Row)['ownership_lapsed']).toBe(1);
    const a = await assetOf('external', 'partner:portwatch/chokepoints');
    expect(flagsOf(a)).toEqual(['ownership_lapsed']);
    expect(a['trusted']).toBe(false);
    const its = await items();
    expect(its.length).toBe(2);
    expect(its[1]).toMatchObject({ subject_id: A_EXT, owner: owner.principalId, state: 'open' });
    expect(String(its[1]!['title'])).toMatch(/flagged ownership_lapsed$/);
    const r = (await recertify(owner, A_EXT)).asset;
    expect(r).toMatchObject({ flags: [], trusted: true });
    const run2 = (await reconcile(steward)).run;
    expect((run2['counts'] as Row)['flagged_by_kind']).toEqual({});
    expect((await items()).length).toBe(2);
  });
  it('DUPLICATE and the STEWARD\'S HAND: a second external entry with the same title is flagged duplicate on both by the run; the steward flags an inconsistency by hand (untrusted) and clears it; a flag already there and an absent flag are state refusals; an analyst cannot flag', async () => {
    A_DUP = String((await register(steward, { kind: 'external', ref: 'partner:portwatch/chokepoints-copy', title: 'partner chokepoint feed (synthetic)', ownerPrincipalId: owner2.principalId })).asset['asset_id']);
    const run = (await reconcile(steward)).run;
    expect(((run['counts'] as Row)['flagged_by_kind'] as Row)['duplicate']).toBe(2);
    expect(flagsOf(await assetOf('external', 'partner:portwatch/chokepoints'))).toEqual(['duplicate']);
    const f = (await flag(steward, A_DUP, 'inconsistent', 'the copy disagrees with the partner feed on the transit count (B90 harness)')).asset;
    expect(flagsOf(f)).toEqual(['duplicate', 'inconsistent']);
    expect(f['trusted']).toBe(false);
    await refused(flag(steward, A_DUP, 'inconsistent', 'the same flag a second time'), /catalog asset rejected \(state\)/, 409);
    await refused(flag(steward, A_DUP, 'orphan', 'clearing a flag that is not there', true), /catalog asset rejected \(state\)/, 409);
    await refused(flag(steward, A_DUP, 'bogus', 'a flag kind outside the seven'), /catalog asset rejected \(flag\)/, 422);
    await refused(flag(analyst, A_DUP, 'inconsistent', 'an analyst flagging by hand'), /./, 403);
    const c = (await flag(steward, A_DUP, 'inconsistent', 'the partner corrected the copy (B90 harness)', true)).asset;
    expect(flagsOf(c)).toEqual(['duplicate']);
    expect(c['trusted']).toBe(true);
  });
  it('THE TICK: the step catalog-reconcile runs the same port under executive.attention.tick (the run recorded with trigger tick and the agent as actor); the coverage read exposes the debt per kind', async () => {
    const registry = h.app.get(AttentionTickRegistry);
    expect(registry.steps().map((s) => [s.name, s.order])).toContainEqual(['catalog-reconcile', 66]);
    await tick();
    const runs = await rows(sql`select trigger, actor_principal_id::text as actor, counts from products.catalog_reconciliations where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by finished_at desc limit 1`);
    expect(runs[0]).toMatchObject({ trigger: 'tick', actor: agentPrincipalId });
    expect(Number((runs[0]!['counts'] as Row)['created'])).toBe(0);
    const c = (await coverage(analyst)).coverage;
    const kinds = c['kinds'] as Row;
    expect((kinds['product'] as Row)).toMatchObject({ total: 2, owned: 2, trusted: 2, discoverable: 2, lineage_covered: 2 });
    expect((kinds['staging'] as Row)).toMatchObject({ total: 1, owned: 0, discoverable: 0 });
    expect(((kinds['staging'] as Row)['flagged'] as Row)).toEqual({ orphan: 1, unowned: 1 });
    expect((kinds['external'] as Row)).toMatchObject({ total: 2, owned: 2, flagged: { duplicate: 2 } });
    expect(Number((kinds['schema'] as Row)['total'])).toBeGreaterThan(40);
    expect((c['totals'] as Row)['undiscoverable']).toBe(1);
    expect(c['open_items']).toBe(2);
    expect((c['last_reconciliation'] as Row)['trigger']).toBe('tick');
    expect(c['staleness_period']).toBe('7 days');
    expect(c['recertification_period']).toBe('180 days');
  });
});

describe('B90 §K · d DISCOVERY', () => {
  it('POSITIVE: the source found by its title with its owner and lineage on the hit; assets found by the owner\'s display name and by a glossary term; the orphan staging asset is counted as hidden, never served; a kind filter narrows', async () => {
    const word = SRC_NAME.split(' ')[1] ?? SRC_NAME;   // "Fixture PortWatch <key>" → PortWatch
    const s = (await search(analyst, word)).search;
    const hits = s['hits'] as Row[];
    const src = hits.find((x) => x['asset_id'] === A_SRC);
    expect(src, JSON.stringify(hits.map((x) => x['title']))).toBeDefined();
    expect(src!['owner_name']).toMatch(/b90k-owner-two/);
    expect((src!['downstream'] as Row[]).map((n) => n['title'])).toEqual(['Corridor transit forecasts (SYNTHETIC)']);
    expect(s['clearance']).toBe('internal');
    const byOwner = (await search(analyst, 'b90k-owner-two')).search;
    expect((byOwner['hits'] as Row[]).map((x) => x['asset_id'])).toContain(A_SRC);
    // the glossary term binds the external asset and the source; the forecasts product says "transit" in its title — a hit by the word, not the term
    const byTerm = (await search(analyst, 'Transit')).search;
    expect((byTerm['hits'] as Row[]).map((x) => x['asset_id']).sort()).toEqual([A_EXT, A_SRC, A_P1].sort());
    expect((byTerm['hits'] as Row[]).filter((x) => (x['terms'] as Row[]).length > 0).map((x) => x['asset_id']).sort()).toEqual([A_EXT, A_SRC].sort());
    const ais = (await search(analyst, 'ais_staging')).search;
    expect(ais).toMatchObject({ total: 1, hidden: 1, hidden_by: { undiscoverable: 1, clearance: 0 }, hits: [] });
    const onlyProducts = (await search(analyst, 'corridor', ['product'])).search;
    expect((onlyProducts['hits'] as Row[]).map((x) => x['kind'])).toEqual(['product', 'product']);
    const all = (await search(analyst, '')).search;
    expect(Number(all['total'])).toBeGreaterThan(40);
    expect((await list(analyst, { flag: 'orphan' })).assets.map((a) => a['asset_id'])).toEqual([A_STG]);
  });
  it('REFUSAL / CLEARANCE: a confidential entry is hidden from an internal-cleared reader and served to a confidential-cleared one; the read by id is refused the same way; an outsider is refused; a query too long and a kind outside the six are refused', async () => {
    A_CONF = String((await register(steward, { kind: 'external', ref: 'partner:insurer/manifest', title: 'Insurer manifest of the corridor (SYNTHETIC)', classification: 'confidential', ownerPrincipalId: owner.principalId })).asset['asset_id']);
    const low = (await search(analyst, 'insurer manifest')).search;
    expect(low).toMatchObject({ total: 1, hidden: 1, hidden_by: { undiscoverable: 0, clearance: 1 }, hits: [] });
    const high = (await search(reviewer, 'insurer manifest')).search;
    expect(high['clearance']).toBe('confidential');
    expect((high['hits'] as Row[]).map((x) => x['asset_id'])).toEqual([A_CONF]);
    await refused(read(analyst, A_CONF), /classified confidential; the reader's clearance in this domain is internal/, 403);
    expect((await read(reviewer, A_CONF)).asset['asset_id']).toBe(A_CONF);
    await refused(search(outsider, 'corridor'), /./, 403);
    await refused(read(outsider, A_SRC), /./, 403);
    await refused(search(analyst, 'x'.repeat(201)), /catalog rejected \(query\)/, 422);
    await refused(search(analyst, 'corridor', ['table']), /catalog rejected \(kinds\)/, 422);
    await refused(read(analyst, '0190b1c2-d3e4-7000-8000-0000000000bb'), /catalog asset rejected \(unknown_asset\)/, 404);
  });
  it('RECOVERY / THE STOP OF NEW CONSUMPTION: the trust read answers trusted for the source, undiscoverable for the orphan, not trusted for what the catalog does not know; the ledgers are append-only and an entry is never deleted', async () => {
    expect((await trust(analyst, 'source', SRC_KEY)).trust).toMatchObject({ known: true, trusted: true, discoverable: true, flags: [] });
    expect((await trust(analyst, 'staging', 'ais_staging_w40')).trust).toMatchObject({ known: true, trusted: true, discoverable: false });
    expect((await trust(analyst, 'product', P1)).trust).toMatchObject({ known: true, asset_id: A_P1, trusted: true });
    expect((await trust(analyst, 'source', 'no-such-source')).trust).toMatchObject({ known: false, trusted: false, discoverable: false });
    await expect(sql`update products.catalog_events set event = 'asset.reconciled' where asset_id = ${A_STG}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.catalog_reconciliations where tenant_id = ${T()}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.catalog_assets where asset_id = ${A_DUP}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
    // the orphan's item still stands for the steward: the scene's "flagged orphaned staging asset"
    expect((await rows(sql`select state from executive.attention_items where item_id = ${ITEM_ORPHAN}::uuid`))[0]!['state']).toBe('open');
  });
});
