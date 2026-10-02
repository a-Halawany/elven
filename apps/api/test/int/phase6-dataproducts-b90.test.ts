/**
 * CP-6 B90 §0 (0095) — THE DATA PRODUCT REGISTRY CORE, through the real database and controllers: register → declare → review → release
 * (the canonical DPR admitted in the same write; the PUBLICATION DENIAL rules of DP-05-005 — no accepted admission review, a duplicate
 * canonical authority), the one SLO ledger, the reads, the append-only ledgers. The parts' harnesses (phase6-{products,events,metrics,
 * catalog}-b90) build on this file's ports; this file proves the prelude alone. SYNTHETIC throughout (NORDWERK's data is the demonstration's).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let products: ProductsController;
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let other: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let P1 = ''; let P2 = ''; let SCHEMA_TYPE = 'OBS'; let SCHEMA_VERSION = 'v1';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

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

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const register = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declare = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(E(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } as Row }) as Promise<{ product: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(E(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(E(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const observe = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.observe(E(as, 'products.slo.observe', 'DPR', id), T(), D(), id, { payload }) as Promise<{ observation: Row }>;
const read = (as: AuthenticatedPrincipal, id: string) => products.read(E(as, 'products.product.read', 'DPR', id), T(), D(), id) as Promise<{ product: Row }>;
const list = (as: AuthenticatedPrincipal, payload: Row = {}) => products.list(E(as, 'products.product.read', 'DPR'), T(), D(), { payload }) as Promise<{ products: Row[] }>;

/** A SYNTHETIC declaration: a contract by registered schema, two serving modes, one input relation, one authoritative output, an SLO, a policy, a cost, a quality. */
const DECL = (over: Row = {}): Row => ({
  contract: { schema: [{ object_type: SCHEMA_TYPE, schema_version: SCHEMA_VERSION }] },
  serving_modes: ['event', 'api'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }],
  outputs: [{ kind: 'object_type', ref: 'WRN', authority: true }],
  slo: { freshness_seconds: 3600, lag_events: 2 },
  policy: { purposes: ['executive'], data_classes: ['internal'] },
  cost: { basis: 'compute-minutes', monthly_estimate: 12 },
  quality: { completeness: 'declared' },
  ...over,
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  products = h.app.get(PC);
  // a registered schema the contract can reference (the newest OBS row of the registry)
  const reg = await rows(sql`select object_type, schema_version from objects.schema_registry where object_type = 'OBS' order by created_at desc, schema_version desc limit 1`);
  if (reg[0] !== undefined) { SCHEMA_TYPE = String(reg[0]['object_type']); SCHEMA_VERSION = String(reg[0]['schema_version']); }
  steward = await h.humanWithSession(['data_steward'], 'b90p-steward');
  owner = await h.humanWithSession(['domain_analyst', 'data_steward'], 'b90p-owner'); // an owner who also holds the review role: the port's SEPARATION rule is reachable
  reviewer = await h.humanWithSession(['executive'], 'b90p-reviewer');
  other = await h.humanWithSession(['domain_analyst'], 'b90p-other');
  outsider = await h.humanWithSession(['collection_manager'], 'b90p-outsider');
}, 240_000);

afterAll(async () => { await h?.close(); });

describe('B90 §0 · the registry: register', () => {
  it('POSITIVE: a steward registers a product for a named owner; an owner registers their own', async () => {
    const p = (await register(steward, { key: 'corridor-warning-stream', title: 'Corridor warning stream (SYNTHETIC)', kind: 'event', purpose: 'the early warnings of the corridor as a subscribable event product', ownerPrincipalId: owner.principalId })).product;
    P1 = String(p['product_id']);
    expect(p).toMatchObject({ product_key: 'corridor-warning-stream', kind: 'event', state: 'registered', current_version: 0, owner_principal_id: owner.principalId, registered_by: steward.principalId });
    const q = (await register(owner, { key: 'corridor-exposure-eur', title: 'Corridor exposure (EUR at risk) (SYNTHETIC)', kind: 'metric', purpose: 'the certified exposure metric served to the executive view', ownerPrincipalId: owner.principalId })).product;
    P2 = String(q['product_id']);
    expect(q).toMatchObject({ product_key: 'corridor-exposure-eur', kind: 'metric', state: 'registered', owner_principal_id: owner.principalId });
    const ev = await rows(sql`select event, details from products.product_events where product_id = ${P1}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['product.registered']);
  });
  it('REFUSAL: an outsider (the policy), a non-owner analyst (the port), a duplicate key, an unknown owner, a kind outside App G', async () => {
    await refused(register(outsider, { key: 'x-outsider', title: 'An outsider product', kind: 'event', purpose: 'an outsider registers', ownerPrincipalId: owner.principalId }), /./, 403);
    await refused(register(other, { key: 'x-other', title: 'x other', kind: 'event', purpose: 'another analyst registers for the owner', ownerPrincipalId: owner.principalId }), /data product rejected \(authority\)/, 403);
    await refused(register(steward, { key: 'corridor-warning-stream', title: 'again', kind: 'event', purpose: 'the same key twice', ownerPrincipalId: owner.principalId }), /data product rejected \(duplicate\)/, 409);
    await refused(register(steward, { key: 'x-unknown-owner', title: 'An unknown owner product', kind: 'event', purpose: 'an owner nobody knows', ownerPrincipalId: '0190b1c2-d3e4-7000-8000-0000000000aa' }), /data product rejected \(unknown_owner\)/, 404);
    await refused(register(steward, { key: 'x-kind', title: 'A spreadsheet product', kind: 'spreadsheet', purpose: 'a kind outside the twenty', ownerPrincipalId: owner.principalId }), /data product rejected \(kind\)/, 422);
  });
});

describe('B90 §0 · the registry: declare, review, release (the publication denial)', () => {
  it('POSITIVE: the owner declares v1, the steward v2 (each digested); the reviewer records an accepted admission review of v2', async () => {
    const v1 = (await declare(owner, P1, DECL())).product;
    expect(v1).toMatchObject({ version: 1, current_version: 1, state: 'registered' });
    expect(String(v1['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const v2 = (await declare(steward, P1, DECL({ slo: { freshness_seconds: 1800, lag_events: 2 } }))).product;
    expect(v2).toMatchObject({ version: 2, current_version: 2 });
    expect(v2['digest']).not.toBe(v1['digest']);
    const r = (await review(reviewer, P1, { version: 2, kind: 'admission', outcome: 'accepted', notes: 'the contract, the SLO and the policy reviewed for the domain (B90 harness)', evidence: { checklist: 'DP-41-006' } })).review;
    expect(r).toMatchObject({ product_id: P1, version: 2, kind: 'admission', outcome: 'accepted', reviewer_principal_id: reviewer.principalId });
  });
  it('REFUSAL: a declaration without a contract, one naming an unregistered schema, a non-owner\'s declaration; the owner reviewing their own product, an analyst reviewing, an unknown version', async () => {
    await refused(declare(owner, P1, { ...DECL(), contract: {} }), /data product rejected \(declaration\): a contract references/, 422);
    await refused(declare(owner, P1, DECL({ contract: { schema: [{ object_type: 'ZZZ', schema_version: 'v9' }] } })), /data product rejected \(declaration\): contract schema ZZZ@v9/, 422);
    await refused(declare(other, P1, DECL()), /data product rejected \(authority\)/, 403);
    await refused(review(owner, P1, { version: 2, kind: 'admission', outcome: 'accepted', notes: 'the owner reviews their own product' }), /data product rejected \(separation\)/, 403);
    await refused(review(other, P1, { version: 2, kind: 'admission', outcome: 'accepted', notes: 'an analyst without the review roles' }), /./, 403); // the policy: no review role (a PDP-refused act reaches no port)
    await refused(review(reviewer, P1, { version: 9, kind: 'admission', outcome: 'accepted', notes: 'a version that was never declared' }), /data product rejected \(unknown_version\)/, 404);
  });
  it('RELEASE: v1 (no accepted review) denied; v2 released by the owner with the DPR admitted; a non-owner denied; v2 again denied (not newer)', async () => {
    await refused(release(owner, P1, 1), /data product rejected \(review\): publication denied/, 409);
    await refused(release(other, P1, 2), /data product rejected \(not_owner\)/, 403);
    const p = (await release(owner, P1, 2)).product;
    expect(p).toMatchObject({ state: 'released', released_version: 2, current_version: 2 });
    expect(p['dpr']).toMatchObject({ object_version: 2, schema_ref: 'DPR@v1' });
    const c = await rows(sql`select object_type, object_version, lifecycle_state, schema_ref from objects.canonical_objects where object_id = ${P1}::uuid and object_type = 'DPR' order by object_version`);
    expect(c).toEqual([{ object_type: 'DPR', object_version: expect.anything(), lifecycle_state: 'active', schema_ref: 'DPR@v1' }]);
    expect(Number(c[0]!['object_version'])).toBe(2);
    const v = await rows(sql`select version, released_by::text as released_by, released_at from products.product_versions where product_id = ${P1}::uuid order by version`);
    expect(v[0]).toMatchObject({ version: 1, released_by: null, released_at: null });
    expect(v[1]).toMatchObject({ version: 2, released_by: owner.principalId });
    expect(v[1]!['released_at']).not.toBeNull();
    await refused(release(owner, P1, 2), /data product rejected \(state\): version 2 .* not newer/, 409);
  });
  it('DUPLICATE CANONICAL AUTHORITY: a second product claiming authority over the same output is denied and the holder NAMED; without the claim it releases', async () => {
    await declare(owner, P2, DECL({ serving_modes: ['query'], inputs: [{ kind: 'product', ref: P1 }] }));
    await review(reviewer, P2, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the metric product reviewed (B90 harness)' });
    await refused(release(owner, P2, 1), /data product rejected \(duplicate_authority\): publication denied — product corridor-warning-stream already holds canonical authority over object_type:WRN/, 409);
    await declare(owner, P2, DECL({ serving_modes: ['query'], inputs: [{ kind: 'product', ref: P1 }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }] }));
    await review(reviewer, P2, { version: 2, kind: 'admission', outcome: 'accepted', notes: 'the metric product reviewed again (B90 harness)' });
    const p = (await release(owner, P2, 2)).product;
    expect(p).toMatchObject({ state: 'released', released_version: 2 });
  });
});

describe('B90 §0 · the SLO ledger and the reads', () => {
  it('POSITIVE: an observation lands in the one ledger and the read serves the latest per measure', async () => {
    const o = (await observe(steward, P1, { measure: 'lag_events', value: 3, threshold: 2, met: false, source: 'harness probe', details: { subscription: 'procurement' } })).observation;
    expect(o).toMatchObject({ product_id: P1, measure: 'lag_events', met: false, source: 'harness probe' });
    await observe(steward, P1, { measure: 'lag_events', value: 1, threshold: 2, met: true, source: 'harness probe' });
    await observe(steward, P1, { measure: 'freshness_seconds', value: 120, threshold: 3600, met: true, source: 'harness probe' });
    const p = (await read(owner, P1)).product;
    expect(p['slo']).toMatchObject({ lag_events: { met: true, source: 'harness probe' }, freshness_seconds: { met: true } });
    expect(Number((p['slo'] as Row)['lag_events'] !== undefined ? ((p['slo'] as Row)['lag_events'] as Row)['value'] : NaN)).toBe(1);
    expect((p['versions'] as Row[]).map((v) => v['version'])).toEqual([1, 2]);
    expect((p['reviews'] as Row[]).length).toBe(1);
    const l = (await list(steward, { kind: 'event' })).products;
    expect(l.map((x) => x['product_key'])).toEqual(['corridor-warning-stream']);
    expect((await list(reviewer)).products.length).toBe(2);
  });
  it('REFUSAL: an unknown product, an outsider observing, an outsider reading, a measure that is not an identifier', async () => {
    await refused(observe(steward, '0190b1c2-d3e4-7000-8000-0000000000bb', { measure: 'lag_events', value: 1, met: true, source: 'harness probe' }), /data product rejected \(unknown_product\)/, 404);
    await refused(observe(outsider, P1, { measure: 'lag_events', value: 1, met: true, source: 'harness probe' }), /./, 403);
    await refused(read(outsider, P1), /./, 403);
    await refused(observe(steward, P1, { measure: 'Lag Events', value: 1, met: true, source: 'harness probe' }), /data product rejected \(measure\)/, 422);
  });
  it('the ledgers are append-only and the registry row is never deleted (superuser moves refused by the triggers)', async () => {
    await expect(sql`update products.product_reviews set outcome = 'rejected' where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.slo_observations where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`update products.product_versions set declaration = '{}'::jsonb where product_id = ${P1}::uuid and version = 1`.execute(su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from products.products_current where product_id = ${P2}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
  });
});
