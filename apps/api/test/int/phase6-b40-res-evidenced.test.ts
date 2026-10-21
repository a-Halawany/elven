/**
 * CP-6 B40 alongside (R2) — THE EVIDENCED READ'S EXPIRY, on a real database through the real pipeline, the PDP, the graph controller and
 * the graph module's exception filter.
 *
 * The source finding: B82-F §TR gave `PipelineService.consequentialRead` a savepoint around its handler, so a handler that THROWS after
 * its 60-second commit context expired answers the existing 503 EYE-DEP-001 (the incomplete result discarded, the failure audited). The
 * sibling `consequentialReadEvidenced` (the reads whose AUD row is DERIVED FROM THE RESULT — audit.verify, the evidence download and
 * segment, memory.item.retrieve, memory.context.retrieve, the support read) still called its handler directly and ran
 * `assertReadComplete` only after a handler that RETURNED. A handler that throws once the context is gone (any port that asserts the
 * bound action or scope — observation.assert_authority → ctx.assert_business_authority) escaped the B33-H rule.
 *
 * The route held here: `POST …/graph/memory/context` (memory.context.retrieve, consequentialReadEvidenced). Its handler reads the
 * projection state FIRST (graph.projection_state(), which asserts the bound action). The suspension is CONTROLLED (the B33-H / §TR
 * idiom): a test-only wrapper sleeps at the start of graph.projection_state() past the context's lifetime, then calls the original — the
 * same statement, the same assertion, the same consequence as a host suspended mid-read. The lifetime is not shortened or extended; RLS
 * and the policy are not touched.
 *
 *   E0 · the baseline: the context reads sound, and its AUD row is derived from the result (the product state's code and metadata).
 *   E1 · held past its context: 503 EYE-DEP-001, the incomplete output discarded, EXACTLY ONE audited failure (EYE-DEP-001, stage
 *        handler) and no success, no access row for the request.
 *   E2 · recovery: a FRESH request after the 503 reads sound — the same product state, its AUD row derived from the result again.
 *   E3 · nothing else became a retry (the delay ARMED): a role without memory.context.retrieve (403), another domain (403) — each the
 *        denial it was; a port refusal raised inside the handler while the context is LIVE keeps its own answer (422) and its own evidence.
 *
 * Every subject, persona and purpose here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { ArgumentsHost } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { ObservationExceptionFilter } from '../../src/observation/observation.filter.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
/** past the 60-second commit context (pipeline.service.ts establishCommitContext) — the B33-H figure */
const DELAY_S = 62;
const PURPOSE = 'intelligence';
let h: Phase4Harness; let graph: GraphController;
let T = ''; let D = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
const SUBJECT = { kind: 'entity', id: uuidv7() };   // a SYNTHETIC subject: the context answers what it holds about it (nothing)
let analyst: AuthenticatedPrincipal;   // domain_analyst — a reader of memory.context.retrieve
let stranger: AuthenticatedPrincipal;  // domain_specialist — outside the readers
const evidence = (caseName: string, e: unknown): void => console.log(`B40 RES R2 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;

/** THE HTTP ANSWER the graph module gives (its APP_FILTER, ObservationExceptionFilter), for a route call that throws. */
async function answer(p: Promise<unknown>): Promise<{ status: number; body: Row }> {
  let status = 200; let body: Row = {};
  try { body = (await p) as Row; } catch (e) {
    const res = { status(s: number) { status = s; return this; }, json(b: Row) { body = b; return this; } };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ eyeCorrelationId: 'b40-res-harness' }) }) } as unknown as ArgumentsHost;
    const quiet = console.error; console.error = () => undefined;
    try { new ObservationExceptionFilter().catch(e, host); } finally { console.error = quiet; }
  }
  return { status, body };
}
/** The context route, with the request's correlation id (the audit chain is read by it). */
function context(as: AuthenticatedPrincipal, payload: Row = { subject: SUBJECT }, domain = D) {
  const req = h.req(as, 'memory.context.retrieve', 'MEM', null, PURPOSE) as unknown as { eyeEnvelope: { correlation_id: string } };
  const cid = req.eyeEnvelope.correlation_id;
  return { cid, call: () => graph.memoryContext(req as never, T, domain, { payload: payload as never }) as unknown as Promise<{ context: Row; receipt: Row }> };
}
/** The audit chain's record of ONE request (by its correlation id), with the result-derived metadata the evidenced path writes. */
const auditOf = async (cid: string) => (await sql<Row>`select action, outcome, result_code, event -> 'metadata' ->> 'stage' as stage,
    event -> 'metadata' ->> 'product_state' as product_state from audit.audit_events
  where tenant_id = ${T}::uuid and correlation_id = ${cid}::uuid order by audit_seq`.execute(h.su)).rows;
/** the audited handler failures of an incomplete context read (result code EYE-DEP-001) */
const incompleteReads = async () => Number((await one(sql`select count(*)::int as n from audit.audit_events
  where tenant_id = ${T}::uuid and action = 'memory.context.retrieve' and outcome = 'failure' and result_code = 'EYE-DEP-001'`))['n']);
const accessRowsOf = async (cid: string) => Number((await one(sql`select count(*)::int as n from memory.item_access where correlation_id = ${cid}::uuid`))['n']);
/** what consequentialReadEvidenced's evidenceOf for this route derives from a result (graph.controller.ts memoryContext) */
const derivedCode = (productState: unknown) => (productState === 'complete' ? 'OK' : 'EYE-DEG-001');

// ── the controlled suspension: a test-only wrapper that sleeps at the start of graph.projection_state() ─────────────────────────
const COLUMNS = `projection text, state text, condition text, revision_seq bigint, verified_seq bigint, verified_at timestamptz, verified_check_id uuid, checkpoint_seq bigint,
  lag_events bigint, unresolved_deliveries bigint, subscription_id uuid, subscription_status text,
  withdrawn_at timestamptz, withdrawn_by uuid, withdrawn_reason text, withdrawn_by_check uuid,
  representation_version text, representation_current text, representation_ok boolean, last_rebuild_id uuid, rebuilt_at timestamptz,
  last_check_id uuid, last_check_at timestamptz, last_check jsonb`;
async function installDelay() {
  await sql`create table if not exists public.b40res_delay (seconds float8 not null)`.execute(h.su);
  await sql`grant select on public.b40res_delay to public`.execute(h.su);
  await sql`delete from public.b40res_delay`.execute(h.su);
  await sql`insert into public.b40res_delay values (0)`.execute(h.su);
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'projection_state_b40res'`))['n'];
  if (wrapped === 0) await sql.raw(`
    ALTER FUNCTION graph.projection_state() RENAME TO projection_state_b40res;
    CREATE FUNCTION graph.projection_state() RETURNS TABLE (${COLUMNS})
    LANGUAGE plpgsql AS $$
    DECLARE d float8;
    BEGIN
      SELECT seconds INTO d FROM public.b40res_delay LIMIT 1;
      IF coalesce(d, 0) > 0 THEN PERFORM pg_sleep(d); END IF;
      RETURN QUERY SELECT * FROM graph.projection_state_b40res();
    END $$;
    GRANT EXECUTE ON FUNCTION graph.projection_state() TO PUBLIC;`).execute(h.su);
}
async function removeDelay() {
  const wrapped = (await one(sql`select count(*)::int as n from pg_proc where proname = 'projection_state_b40res'`))['n'];
  if (wrapped !== 0) await sql.raw(`
    DROP FUNCTION graph.projection_state();
    ALTER FUNCTION graph.projection_state_b40res() RENAME TO projection_state;`).execute(h.su);
  await sql`drop table if exists public.b40res_delay`.execute(h.su);
}
const delay = async (seconds: number) => { await sql`update public.b40res_delay set seconds = ${seconds}`.execute(h.su); };

let BASELINE = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(Gc);
  await installDelay();   // before ANY context read runs, so no cached plan names the unwrapped function
  analyst = await h.humanWithSession(['domain_analyst'], 'b40res-analyst');
  stranger = await h.humanWithSession(['domain_specialist'], 'b40res-stranger');
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T}::uuid, ${'b40-res-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => {
  await removeDelay().catch(() => undefined);
  await h?.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('E0 · the baseline', () => {
  it('the context reads sound; its AUD row is DERIVED FROM THE RESULT (the product state\'s code and metadata)', async () => {
    const r = context(analyst);
    const out = await r.call();
    BASELINE = String(out.context['product_state']);
    expect(['complete', 'stale', 'partial']).toContain(BASELINE);
    expect(out.receipt['auditSeq']).toEqual(expect.any(Number));
    expect(await auditOf(r.cid)).toEqual([{ action: 'memory.context.retrieve', outcome: 'success', result_code: derivedCode(BASELINE), stage: null, product_state: BASELINE }]);
    evidence('E0 baseline', { product_state: BASELINE, audit: await auditOf(r.cid) });
  });
});

describe('E1 · the context held past its authorization (the expired evidenced read, controlled)', () => {
  it('fails closed: 503 EYE-DEP-001, the incomplete output discarded, exactly ONE audited failure — no success, no access row', async () => {
    const failures = await incompleteReads();
    const r = context(analyst);
    await delay(DELAY_S);
    let a: Awaited<ReturnType<typeof answer>>;
    try { a = await answer(r.call()); } finally { await delay(0); }
    evidence('E1 answer', { status: a.status, body: a.body });
    const chain = await auditOf(r.cid);
    evidence('E1 audit', chain);
    expect(a.status, JSON.stringify(a.body)).toBe(503);
    expect(a.body['code']).toBe('EYE-DEP-001');
    expect(String(a.body['message'])).toMatch(/^the read \(memory\.context\.retrieve\) outlived its authorization context .* the result is incomplete and was discarded, nothing was concluded from it — retry$/);
    expect(a.body['context']).toBeUndefined();
    expect(chain).toEqual([{ action: 'memory.context.retrieve', outcome: 'failure', result_code: 'EYE-DEP-001', stage: 'handler', product_state: null }]);
    expect(await incompleteReads()).toBe(failures + 1);
    expect(await accessRowsOf(r.cid)).toBe(0);
  }, 240_000);
});

describe('E2 · recovery', () => {
  it('a FRESH request after the 503 reads sound: the same product state as the baseline, its AUD row derived from the result', async () => {
    const r = context(analyst);
    const out = await r.call();
    expect(String(out.context['product_state'])).toBe(BASELINE);
    expect(await auditOf(r.cid)).toEqual([{ action: 'memory.context.retrieve', outcome: 'success', result_code: derivedCode(BASELINE), stage: null, product_state: BASELINE }]);
  });
});

describe('E3 · nothing else became a retry (the delay ARMED throughout — a denial never reaches the read)', () => {
  it('a role without memory.context.retrieve: 403 EYE-AUT-001, recorded as a denial; another domain: 403 EYE-TEN-001, never a failure', async () => {
    await delay(DELAY_S);
    try {
      const n = context(stranger);
      const a = await answer(n.call());
      expect(a.status, JSON.stringify(a.body)).toBe(403);
      expect(a.body['code']).toBe('EYE-AUT-001');
      expect((await auditOf(n.cid)).map((x) => [x['action'], x['outcome'], x['result_code']])).toEqual([['memory.context.retrieve', 'denied', 'EYE-AUT-001']]);
      const o = context(analyst, { subject: SUBJECT }, D2);
      const b = await answer(o.call());
      expect(b.status, JSON.stringify(b.body)).toBe(403);
      expect(b.body['code']).toBe('EYE-TEN-001');
      const chain = await auditOf(o.cid);
      expect(chain.map((x) => x['outcome'])).not.toContain('failure');
      expect(chain.map((x) => x['result_code'])).not.toContain('EYE-DEP-001');
      evidence('E3 denials', { role: { status: a.status, code: a.body['code'] }, domain: { status: b.status, code: b.body['code'], audit: chain } });
    } finally { await delay(0); }
  });
  it('a port refusal inside the handler while the context is LIVE keeps its own answer (422) and its own evidence (EYE-INT-001, never EYE-DEP-001)', async () => {
    const failures = await incompleteReads();
    const r = context(analyst, { subject: { kind: 'planet', id: SUBJECT.id } });
    const a = await answer(r.call());
    const chain = await auditOf(r.cid);
    evidence('E3 live refusal', { status: a.status, body: a.body, audit: chain });
    expect(a.status, JSON.stringify(a.body)).toBe(422);
    expect(a.body['code']).toBe('EYE-REQ-001');
    expect(String(a.body['message'])).toMatch(/^memory context rejected: the subject names \{kind, id\}/);
    expect(chain).toEqual([{ action: 'memory.context.retrieve', outcome: 'failure', result_code: 'EYE-INT-001', stage: 'handler', product_state: null }]);   // the handler-failure code, as before
    expect(await incompleteReads()).toBe(failures);
  });
});
