/**
 * CP-6 B82-F tr (the B80–B82 integration pass, §TR — B82 §PX) — THE TRUST OVERVIEW'S EXPIRED READ, on a real database through the real
 * pipeline, the PDP, the trust controller and the graph module's exception filter.
 *
 * The finding: `POST …/graph/trust/overview` answered 500 when its read context expired while it ran. The overview (graph.trust_overview)
 * explains each listed product in a loop (graph.explain per product), and every graph.explain asserts the caller's bound scope
 * (observation.assert_read_scope — N-01). A context EXPIRES on the database's wall clock (public.eye_ctx3, 60 s), so when it dies part-way,
 * the NEXT product's assert raises `read rejected (scope)` (42501, bound NONE) INSIDE the handler: the handler throws, the pipeline's B33-H
 * completeness check (which ran only after a handler RETURNED) never ran, and the graph filter knows no rule for that refusal → 500.
 * The platform's answer for exactly this is B33-H's: 503 EYE-DEP-001, the incomplete result discarded, the failure audited.
 *
 * Here the suspension is CONTROLLED (the B33-H idiom): a test-only wrapper delays graph.px_strength_of (called inside the overview's
 * product loop, after the first product's explanation) past the context's lifetime. The lifetime is not shortened or extended; RLS and
 * the policy are not touched.
 *
 *   TR0 · the baseline: the overview reads sound (three products with their strength), audited.
 *   TR1 · the overview, held past its context: 503 EYE-DEP-001 (never 500), the incomplete result discarded, the failure audited under
 *         graph.trust.read with EYE-DEP-001 and no success recorded for the request.
 *   TR2 · recovery: a FRESH request after the 503 reads sound — the same products, the same strengths as the baseline.
 *   TR3 · nothing else became a retry: a role without graph.trust.read (403), another domain (403) — each recorded as the denial it was;
 *         a port refusal raised inside the handler while the context is LIVE keeps its own answer (422) and its own evidence.
 *
 * Every product, persona and statement here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { ArgumentsHost } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { TrustController } from '../../src/graph/trust/trust.controller.js';
import { ObservationExceptionFilter } from '../../src/observation/observation.filter.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Ref = { type: string; id: string; version: number };
/** past the 60-second commit context (pipeline.service.ts establishCommitContext) — the B33-H figure */
const DELAY_S = 62;
let h: Phase4Harness; let tc: TrustController;
let T = ''; let D = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let auditor: AuthenticatedPrincipal;   // auditor at TENANT — a reader of graph.trust.read
let steward: AuthenticatedPrincipal;   // data_steward at DOMAIN — a reader of graph.trust.read in its own domain
let stranger: AuthenticatedPrincipal;  // domain_specialist — outside the readers
const evidence = (caseName: string, e: unknown): void => console.log(`B82-F TR EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;

/** THE HTTP ANSWER the graph module gives (its APP_FILTER, ObservationExceptionFilter), for a route call that throws. */
async function answer(p: Promise<unknown>): Promise<{ status: number; body: Row; correlationId: string }> {
  let status = 200; let body: Row = {};
  try { body = (await p) as Row; } catch (e) {
    const res = { status(s: number) { status = s; return this; }, json(b: Row) { body = b; return this; } };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ eyeCorrelationId: 'b82f-tr-harness' }) }) } as unknown as ArgumentsHost;
    const quiet = console.error; console.error = () => undefined;
    try { new ObservationExceptionFilter().catch(e, host); } finally { console.error = quiet; }
  }
  return { status, body, correlationId: '' };
}
/** The overview route, with the request's correlation id (the audit chain is read by it). */
function overview(as: AuthenticatedPrincipal, payload: Row = {}, domain = D) {
  const req = h.req(as, 'graph.trust.read', 'TRS', null, 'graph') as unknown as { eyeEnvelope: { correlation_id: string } };
  const cid = req.eyeEnvelope.correlation_id;
  return { cid, call: () => tc.overview(req as never, T, domain, { payload }) as unknown as Promise<{ overview: Row & { products: Row[] }; receipt: Row }> };
}
/** The audit chain's record of ONE request (by its correlation id). */
const auditOf = async (cid: string) => (await sql<Row>`select action, outcome, result_code, event -> 'metadata' ->> 'stage' as stage from audit.audit_events
  where tenant_id = ${T}::uuid and correlation_id = ${cid}::uuid order by audit_seq`.execute(h.su)).rows;
/** the audited handler failures of an incomplete trust read (result code EYE-DEP-001) */
const incompleteReads = async () => Number((await one(sql`select count(*)::int as n from audit.audit_events
  where tenant_id = ${T}::uuid and action = 'graph.trust.read' and outcome = 'failure' and result_code = 'EYE-DEP-001'`))['n']);

// ── the controlled suspension: a test-only wrapper that sleeps inside the overview's product loop ─────────────────────────────
async function installDelay() {
  await sql`create table if not exists public.b82ftr_delay (seconds float8 not null)`.execute(h.su);
  await sql`grant select on public.b82ftr_delay to public`.execute(h.su);
  await sql`delete from public.b82ftr_delay`.execute(h.su);
  await sql`insert into public.b82ftr_delay values (0)`.execute(h.su);
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'px_strength_of_b82ftr'`))['n'];
  if (wrapped === 0) await sql.raw(`
    ALTER FUNCTION graph.px_strength_of(uuid, uuid, jsonb) RENAME TO px_strength_of_b82ftr;
    CREATE FUNCTION graph.px_strength_of(p_tenant uuid, p_domain uuid, x jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE AS $$
    DECLARE d float8;
    BEGIN
      SELECT seconds INTO d FROM public.b82ftr_delay LIMIT 1;
      IF coalesce(d, 0) > 0 THEN PERFORM pg_sleep(d); END IF;
      RETURN graph.px_strength_of_b82ftr(p_tenant, p_domain, x);
    END $$;
    GRANT EXECUTE ON FUNCTION graph.px_strength_of(uuid, uuid, jsonb) TO PUBLIC;`).execute(h.su);
}
async function removeDelay() {
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'px_strength_of_b82ftr'`))['n'];
  if (wrapped !== 0) await sql.raw(`
    DROP FUNCTION graph.px_strength_of(uuid, uuid, jsonb);
    ALTER FUNCTION graph.px_strength_of_b82ftr(uuid, uuid, jsonb) RENAME TO px_strength_of;`).execute(h.su);
  await sql`drop table if exists public.b82ftr_delay`.execute(h.su);
}
const delay = async (seconds: number) => { await sql`update public.b82ftr_delay set seconds = ${seconds}`.execute(h.su); };

/* ── the planted products (stated inserts standing for their ports — the phase6-trust-b82 idiom) ── */
async function plant(n: number): Promise<Ref> {
  const type = 'CLM'; const id = uuidv7(); const version = 1; const now = new Date().toISOString();
  const payload: Row = { title: `B82-F tr product ${n} (SYNTHETIC harness ${RUN})`, subject: 'Bab el-Mandeb transits (SYNTHETIC)' };
  const header = {
    object_id: id, object_type: type, tenant_id: T, domain_id: D, scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active',
    owning_component: 'CP-INT-01', accountable_owner: `principal:${steward.principalId}`, source_object_ids: [], event_time: null, observation_time: now, valid_from: null,
    valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: true,
    confidence: null, uncertainty: null, evidence_refs: [], provenance_ref: null, method_ref: 'fixture-b82f-tr@1', contradiction_refs: [], corroboration_refs: [],
    human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`, ontology_ref: null, correction_of: null, supersedes: null,
    withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  } as unknown as CanonicalHeader;
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
      observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, evidence_refs, method_ref, contradiction_refs, corroboration_refs,
      human_refs, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, ${type}, ${T}::uuid, ${D}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', ${header.accountable_owner}, '[]'::jsonb,
            ${now}::timestamptz, clock_timestamp(), 'exact', 'trusted', 'asserted', true, '[]'::jsonb, 'fixture-b82f-tr@1', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            'internal', 'intelligence', ${`${type}@v1`}, ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  return { type, id, version };
}
const SCOPE = { types: ['CLM'], limit: 3 };
const strengths = (o: { products: Row[] }) => o.products.map((p) => `${String(p['ref'])}=${String(p['strength'])}`).sort();
let PRODUCTS: Ref[] = []; let BASELINE: string[] = [];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  tc = h.app.get(TrustController);
  await installDelay();   // before ANY overview runs, so no cached plan names the unwrapped function
  auditor = await h.humanWithSession(['auditor'], 'b82ftr-auditor', 'TENANT');
  steward = await h.humanWithSession(['data_steward'], 'b82ftr-steward');
  stranger = await h.humanWithSession(['domain_specialist'], 'b82ftr-stranger');
  for (const n of [1, 2, 3]) PRODUCTS.push(await plant(n));
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T}::uuid, ${'b82f-tr-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => {
  await removeDelay().catch(() => undefined);
  await h?.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('TR0 · the baseline', () => {
  it('the overview reads sound: the three planted products with their strength, audited under graph.trust.read', async () => {
    const r = overview(auditor, SCOPE);
    const out = await r.call();
    expect(out.overview.products.map((p) => String(p['id'])).sort()).toEqual(PRODUCTS.map((p) => p.id).sort());
    for (const p of out.overview.products) expect(['strong', 'partial', 'weak', 'broken']).toContain(String(p['strength']));
    expect(out.receipt['auditSeq']).toEqual(expect.any(Number));
    expect(await auditOf(r.cid)).toEqual([{ action: 'graph.trust.read', outcome: 'success', result_code: 'OK', stage: null }]);
    BASELINE = strengths(out.overview);
    evidence('TR0 baseline', BASELINE);
  });
});

describe('TR1 · the overview held past its context (the expired read, controlled)', () => {
  it('fails closed: 503 EYE-DEP-001 (never 500), the incomplete result discarded, the failure audited — no success recorded for the request', async () => {
    const failures = await incompleteReads();
    const r = overview(auditor, SCOPE);
    await delay(DELAY_S);
    let a: Awaited<ReturnType<typeof answer>>;
    try { a = await answer(r.call()); } finally { await delay(0); }
    evidence('TR1 answer', { status: a.status, body: a.body });
    expect(a.status, JSON.stringify(a.body)).toBe(503);
    expect(a.body['code']).toBe('EYE-DEP-001');
    expect(String(a.body['message'])).toMatch(/^the read \(graph\.trust\.read\) outlived its authorization context .* the result is incomplete and was discarded, nothing was concluded from it — retry$/);
    expect(a.body['overview']).toBeUndefined();
    const chain = await auditOf(r.cid);
    evidence('TR1 audit', chain);
    expect(chain).toEqual([{ action: 'graph.trust.read', outcome: 'failure', result_code: 'EYE-DEP-001', stage: 'handler' }]);
    expect(await incompleteReads()).toBe(failures + 1);
  }, 240_000);
});

describe('TR2 · recovery', () => {
  it('a FRESH request after the 503 reads sound: the same products, the same strengths as the baseline, audited success', async () => {
    const r = overview(auditor, SCOPE);
    const out = await r.call();
    expect(strengths(out.overview)).toEqual(BASELINE);
    expect(await auditOf(r.cid)).toEqual([{ action: 'graph.trust.read', outcome: 'success', result_code: 'OK', stage: null }]);
    const s = overview(steward, SCOPE);
    expect(strengths((await s.call()).overview)).toEqual(BASELINE);
  });
});

describe('TR3 · nothing else became a retry (the delay ARMED throughout — a denial never reaches the read)', () => {
  it('a role without graph.trust.read: 403 EYE-AUT-001, recorded as a denial; another domain: 403, recorded as a denial', async () => {
    await delay(DELAY_S);
    try {
      const n = overview(stranger, SCOPE);
      const a = await answer(n.call());
      expect(a.status, JSON.stringify(a.body)).toBe(403);
      expect(a.body['code']).toBe('EYE-AUT-001');
      expect(await auditOf(n.cid)).toEqual([{ action: 'graph.trust.read', outcome: 'denied', result_code: 'EYE-AUT-001', stage: null }]);
      const o = overview(steward, SCOPE, D2);
      const b = await answer(o.call());
      expect(b.status, JSON.stringify(b.body)).toBe(403);
      expect(b.body['code']).toBe('EYE-TEN-001');   // the scope refusal, as it was before B82-F tr
      const chain = await auditOf(o.cid);
      expect(chain.map((x) => x['outcome'])).not.toContain('failure');
      expect(chain.map((x) => x['result_code'])).not.toContain('EYE-DEP-001');
      evidence('TR3 denials', { role: { status: a.status, code: a.body['code'] }, domain: { status: b.status, code: b.body['code'], audit: chain } });
    } finally { await delay(0); }
  });
  it('a port refusal inside the handler while the context is LIVE keeps its own answer (422 overview_scope) and its own evidence (EYE-INT-001, never EYE-DEP-001)', async () => {
    const failures = await incompleteReads();
    const r = overview(auditor, { limit: 99 });
    const a = await answer(r.call());
    expect(a.status, JSON.stringify(a.body)).toBe(422);
    expect(String(a.body['message'])).toMatch(/limit/);
    expect(await auditOf(r.cid)).toEqual([{ action: 'graph.trust.read', outcome: 'failure', result_code: 'EYE-INT-001', stage: 'handler' }]);
    expect(await incompleteReads()).toBe(failures);
  });
});
