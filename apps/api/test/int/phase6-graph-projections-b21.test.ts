/**
 * CP-6 B21.1 — CODEX B20-F1 REPRODUCED THEN CORRECTED: the withdrawn-mode memory reader's canonical statements under the content-tier
 * boundary (no SQL; the B20 harness untouched — the brief's (e)).
 *
 * Codex's finding (audit/reviews/The_Eye_1f6d04c_B20_Review_C15_Unblock_and_B21_Delivery.md:86-103): while memory_items_current is
 * WITHDRAWN a retrieval of a row the log has and the projection lacks issued its canonical lookup BEFORE any content-tier boundary, and a
 * cancelled statement there escaped raw — a 500 EYE_INT_001 with a failure audit row EYE-INT-001, no declared answer. The withdrawn path
 * issues THREE canonical statements: S1 memory.expected_items (the derivation, whose policy columns join the canonical table — on EVERY
 * withdrawn read), M the projection read (the metadata tier; between them; outside the boundary), S2 the absent rows' versions (only when
 * the log names a row the projection lacks), and V the retrieval's own versions read (memory.service.ts, B20's point). /memory/list,
 * /memory/:id/get and the briefing composer share the reader (fallback.ts memoryItemsFromLog).
 *
 * THE RULE this file pins: withdrawn AND the content tier does not answer → 503 EYE-DEG-001 — for a present row as for a missing one, on
 * /memory/:id/retrieve, /memory/list and /memory/:id/get alike, ONE sentence (B20's, with the failed statement in a trailing parenthesis),
 * the pipeline's failure audit row EYE-DEG-001 (never EYE-INT-001), no ledger row and no access row, the point consumed (the next read
 * served from the log-built row with its access row — the recovery the B20 harness never exercised); a refused reader on a withdrawn
 * partition with the tier down receives the same 503 (the fallback precedes every gate; the partition's state is not secret, the item's
 * content is — D1.9). THE BRIEFING composes WITHOUT its memory items as a DEGRADED SOURCE: degraded, the omission declared in the stored
 * content (watermark.projection.memory_content 'unavailable' on that composition only) and in the answer's memorySource block with the
 * reason; an agent with on_degraded STOPS naming the reason (stopped, never faulted); an agent without it finishes with degraded true and
 * memory_source 'unavailable'. The fault registry's ORDINAL (armNth) reaches the second statement exactly — Codex's row.
 *
 *   F1 · Codex's four rows through HTTP: serving + the tier down → 200 metadata-only (B20's point, re-pinned briefly; the B21 point is
 *   never reached on the serving path); withdrawn + a PRESENT row → 503 at V, at S1, served past S2 (never issued); withdrawn + a MISSING
 *   row → served from the log (S2 answered), 503 at S2 (Codex's row) and at S1, the refused reader's 503, list and get 503 at S1 and S2,
 *   the audit rows EYE-DEG-001 and never EYE-INT-001; the briefing composed without its memory items and declared, the on_degraded agent
 *   stopped with the reason, the plain agent finished; the rebuild (inserted 1) and the return to serving.
 *
 * The world: a fresh database; NO scheduler line at module top and NO subscription (the B19 idiom, phase6-memory-derived.test.ts): the
 * operator's withdrawal (graph.projection.withdraw) plus a superuser `delete from memory.items_current` give Codex's state directly; every
 * block reads `unverified` while serving (the honest condition — B20 C1) and `withdrawn` while withdrawn. The automatic withdrawal by a
 * failed check is B20's P4/P6 path and is not re-exercised: the reader does not know who withdrew (a.projection.withdrawn is all it reads).
 * The vault roots are this file's own temporary directory (B21 C5 / Nit 8: bootDecisionWorld uploads through h.uploadSource()).
 *
 * EACH CASE LOGS THE SIX THINGS V04-T-024/026 DEMAND (the fault trace, the affected-product watermark, the consumer behaviour, the
 * operator action, the recovery, the reconciliation) as one `B21.1 EVIDENCE` line (C7).
 *
 * Read against the design's own statements, what this file does NOT claim (design-p1-records.md §3): the fault point stands in for a
 * statement's failure (a real 57014 is shown in shape by the unit test's double, never injected at the statement); the uncorrected tree
 * cannot be exercised through HTTP (the point does not exist there — the refute step is the unit double); the composer's own canonical
 * read of the candidates' versions stays outside the boundary (no metadata-only briefing exists); the strategy fallback's absent-row read
 * has the same shape and no content-tier promise (named, not corrected); an agent's stop is recorded by the pipeline as the handler's
 * failure (B10's shape) — the run record carries the declared reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ProjectionsController } from '../../src/graph/projections/projections.controller.js';
import { ROUTE_PARTITIONS, type ProjectionBlock, type ProjectionName } from '../../src/graph/projections/projection-state.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// B21 C5 / Nit 8: this file's own vault roots (the B18 idiom) — an upload under the workspace default would land in .eye-local/vault.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b21-1-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type OutboxRow = { id: string; status: string; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
type RouteName = keyof typeof ROUTE_PARTITIONS;
/** The three memory routes (the twelve of B20 reduced to the reader's callers). */
const MEMORY_ROUTES: RouteName[] = ['memoryList', 'memoryGet', 'memoryRetrieve'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The labels, as literals (the B20 harness :131, :134; copied, never retyped). */
const LABEL_NO_SUBSCRIPTION = 'no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown';
const CONTENT_UNAVAILABLE_LABEL = 'the content tier did not answer; this is the item\'s metadata (its state, versions and audience) — the statement is not served; retry or contact the operator';
/** The B21 fault point (design-p1.md §2) and the withdrawal's reason (the regex below names it). */
const P = 'b21.memory_fallback_content_unavailable' as const;
const REASON = 'B21 F1: a planned review (harness)';
/** A read refused by the withdrawn rule: the ONE sentence (the B20 P6(d) regex, :918, its prefix byte for byte) with the trailing detail naming the statement (D1.3). */
const REFUSED_503 = /^the memory_items_current projection of this domain is withdrawn \(since .*: B21 F1: a planned review \(harness\)\) and the content tier did not answer; nothing verified remains to gate a metadata answer on — retry when the content tier answers, or after the rebuild \(graph\.projection\.rebuild\) \((memory\.expected_items|canonical_versions|injected fault at b20\.memory_content_unavailable)/;
/** The briefing's declared reason (design-p1.md §2) and the on_degraded stop (D1.6). */
const BRIEFING_REASON = /^the memory_items_current projection of this domain is withdrawn \(since .*: B21 F1: a planned review \(harness\)\) and the content tier did not answer at (memory\.expected_items|canonical_versions) \(injected fault at b21\.memory_fallback_content_unavailable\); the memory items are omitted from this briefing — nothing verified remains to compose them from; retry when the content tier answers, or after the rebuild \(graph\.projection\.rebuild\)$/;
const STOP_SENTENCE = (statement: string) => `stop condition on_degraded: the memory projection of this domain is withdrawn and its memory items could not be read from the log (the content tier did not answer at ${statement}); the briefing would omit every memory item`;

let h: Phase4Harness; let su: AnyDb;
let graph: GraphController; let projections: ProjectionsController;
let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let reader: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let M1 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
/** A marker on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
/** A refusal as the caller sees it: the HttpException's status and the dashed catalogue code, or a port's raw SQLSTATE and text (the B20 harness :176-181). */
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) { const r = e.getResponse() as { code?: string; message?: string }; return { status: e.getStatus(), code: r.code ?? null, message: String(r.message ?? '') }; }
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};

/* ───────────── the ledgers (the B20 harness :197-222, copied) ───────────── */
type PartitionRow = { projection: string; state: string; withdrawn_at: Date | null; withdrawn_by: string | null; withdrawn_reason: string | null; withdrawn_by_check: string | null; representation_version: string; last_rebuild_id: string | null; rebuilt_at: Date | null };
const partition = async (projection: ProjectionName): Promise<PartitionRow | undefined> =>
  (await sql<PartitionRow>`select projection, state, withdrawn_at, withdrawn_by::text, withdrawn_reason, withdrawn_by_check::text, representation_version, last_rebuild_id::text, rebuilt_at from graph.projection_partitions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and projection = ${projection}`.execute(su)).rows[0];
type ProjectionEvent = { event_id: string; event: string; actor_principal_id: string; details: Row };
const pevents = async (projection: ProjectionName): Promise<ProjectionEvent[]> =>
  (await sql<ProjectionEvent>`select event_id::text, event, actor_principal_id::text, details from graph.projection_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and projection = ${projection} order by occurred_at, event_id`.execute(su)).rows;
const outboxRows = async (eventType: string, where: (p: Row) => boolean = () => true, after: Date | null = null): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox
     where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and (${after}::timestamptz is null or created_at >= ${after}::timestamptz) order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
type ItemRow = { object_version: number; state: string; title: string; statement: string; classification: string; audience_purposes: string[]; derivation: Row | null; recorded_by: string; attention_state: string };
const itemRow = async (itemId: string): Promise<ItemRow | undefined> => (await sql<ItemRow>`select object_version::int, state, title, statement, classification, audience_purposes, derivation, recorded_by::text, attention_state from memory.items_current where item_id = ${itemId}::uuid`.execute(su)).rows[0];
const itemEvents = async (itemId: string) => (await sql<{ event: string; object_version: number; details: Row }>`select event, object_version::int, details from memory.item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const accessRows = async (itemId: string) => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string }>`select object_version::int, purpose_id, reader_principal_id::text from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;
/* ───────────── NEW (design-p1-harness.md §1) ───────────── */
/** The tenant's audit high-water mark before a call, so the rows the call wrote are exactly those above it. */
const auditMark = async (): Promise<number> => (await sql<{ s: number }>`select coalesce(max(audit_seq), 0)::int s from audit.audit_events where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.s;
/** The audit rows an action wrote above a mark — the pipeline's failure row (recordHandlerFailure: outcome failure, the HttpException's dashed code, stage handler) beside any success row (Nit 6: the `event` jsonb column carries `metadata`, as the B20 auditRowOf reads it). */
const auditRowsSince = async (seq: number, action: string) => (await sql<{ result_code: string; outcome: string; stage: string | null }>`select result_code, outcome, event -> 'metadata' ->> 'stage' as stage from audit.audit_events where tenant_id = ${T()}::uuid and audit_seq > ${seq} and action = ${action} order by audit_seq`.execute(su)).rows;
/** The stored composition's watermark projection object (the content — what BRF@v1's watermark carries). */
const storedProjection = async (briefingId: string): Promise<Row> => (await sql<{ p: Row }>`select payload -> 'watermark' -> 'projection' as p from objects.canonical_objects where object_id = ${briefingId}::uuid and object_type = 'BRF'`.execute(su)).rows[0]!.p;
const briefingDegraded = async (briefingId: string): Promise<boolean> => (await sql<{ degraded: boolean }>`select degraded from executive.briefings where briefing_id = ${briefingId}::uuid`.execute(su)).rows[0]!.degraded;
/** The SIX things V04-T-024/026 demand, logged per case (the B20 C16 idiom; the B21 C7 prefix). */
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B21.1 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
/** The item's memory.retrieval_degraded ledger rows so far (none is owed for a withdrawn 503 — the B20 P6(d) pin, :921). */
const ledgerCount = async (itemId: string): Promise<number> => (await itemEvents(itemId)).filter((e) => e.event === 'memory.retrieval_degraded').length;
/** The withdrawn 503: the status, the code, the ONE sentence and the statement the trailing detail names. */
async function expect503(p: Promise<unknown>, statement: 'memory.expected_items' | 'canonical_versions' | 'b20'): Promise<void> {
  const r = await failure(p);
  expect(r, r.message).toMatchObject({ status: 503, code: 'EYE-DEG-001' });
  expect(r.message).toMatch(REFUSED_503);
  expect(r.message).toContain(statement === 'b20' ? '(injected fault at b20.memory_content_unavailable)' : `(${statement}: injected fault at b21.memory_fallback_content_unavailable)`);
}

/* ───────────── the routes (the B20 harness :243-288, reduced to one domain and the three memory routes) ───────────── */
const withdraw = (who: AuthenticatedPrincipal, projection: string, reason: string) =>
  projections.withdraw(h.req(who, 'graph.projection.withdraw', 'PRJ', null, 'graph'), T(), D(), projection, { payload: { reason } }) as unknown as Promise<{ projection: Row; receipt: Row }>;
const rebuild = (who: AuthenticatedPrincipal, projection: string, reason: string) =>
  projections.rebuild(h.req(who, 'graph.projection.rebuild', 'PRJ', null, 'graph'), T(), D(), projection, { payload: { reason } }) as unknown as Promise<{ rebuild: Row; receipt: Row }>;
/** The three memory reads by route name; the answer and its projection block (the retrieval's rides inside `memory`). */
async function read(who: AuthenticatedPrincipal, route: RouteName, payload: Row = {}): Promise<{ answer: Row; projection: ProjectionBlock }> {
  const g = (objectType: string, objectId: string | null = null, action = 'graph.read', purpose = 'graph') => h.req(who, action, objectType, objectId, purpose);
  let answer: Row;
  switch (route) {
    case 'memoryList': answer = await graph.listMemoryItems(g('MEM'), T(), D(), { payload: {} }) as unknown as Row; break;
    case 'memoryGet': answer = await graph.getMemoryItem(g('MEM', String(payload['itemId'] ?? M1)), T(), D(), String(payload['itemId'] ?? M1)) as unknown as Row; break;
    case 'memoryRetrieve': answer = await graph.retrieveMemoryItem(g('MEM', String(payload['itemId'] ?? M1), 'memory.item.retrieve', String(payload['purpose'] ?? 'memory')), T(), D(), String(payload['itemId'] ?? M1), { payload: {} }) as unknown as Row; break;
    default: throw new Error(`no such route ${String(route)}`);
  }
  const projection = (route === 'memoryRetrieve' ? obj(answer['memory'])['projection'] : answer['projection']) as ProjectionBlock;
  expect(projection, `${route}: the answer carries no projection block`).toBeDefined();
  return { answer, projection };
}
/** The reader of a route: the memory retrieval is the knowledge owner's; the rest the analyst's. */
const readerOf = (route: RouteName): AuthenticatedPrincipal => (route === 'memoryRetrieve' ? reader : analyst);
const retrieveAs = (p: AuthenticatedPrincipal, itemId: string, purpose: string) =>
  graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', itemId, purpose), T(), D(), itemId, { payload: {} }) as unknown as Promise<{ memory: Row; receipt: { policyDecisionId: string; auditSeq: number } }>;
/** A person's own record (source kind human); the audience purposes are the case's (the B20 harness :278-286, the literal kept). */
const memoryItem = (over: Row = {}): Row => ({
  recordClass: 'strategic', title: 'B20 memory item',
  statement: 'The corridor transit level the routing decision relied on was read from the PortWatch series; the hold stands until the strait reopens (B20 harness).',
  source: { kind: 'human', ref: 'decision room, 2024-01-17' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] },
  validity: { from: '2024-01-17T00:00:00Z', to: null },
  retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
  cites: [], related: { decisionId: null, objectiveId: null }, ...over,
});
const recordAs = (p: AuthenticatedPrincipal, payload: Row, purpose = 'memory') =>
  graph.recordMemoryItem(h.req(p, 'memory.item.record', 'MEM', null, purpose), T(), D(), { payload }) as Promise<{ memory: { itemId: string; version: number; cites: number } }>;
/** The compose answer as B21 shapes it (the B20 fields plus memorySource — D1.6); the receipt beside it. */
type Composed = { briefing: Row & { briefingId: string; contentDigest: string; items: Row[]; degraded: boolean; memoryAccesses: Row[]; projection: ProjectionBlock; memorySource: Row }; receipt: { policyDecisionId: string; auditSeq: number } };
const compose = () => c.compose({ roomId: null, knownAt: new Date().toISOString(), priorBriefingId: null }) as unknown as Promise<Composed>;
/** The three routes' blocks, each pinned to the same shape. */
async function pinBlocks(expected: Row, note: string): Promise<void> {
  for (const route of MEMORY_ROUTES) {
    const { projection } = await read(readerOf(route), route);
    expect(projection, `${route}: ${note}`).toMatchObject(expected);
  }
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ProjectionsController: Pc } = await import('../../src/graph/projections/projections.controller.js');
  graph = h.app.get(Gc); projections = h.app.get(Pc);
  // THE PEOPLE (each with a session of its own: the ports compare the acting principal).
  reader = await h.humanWithSession(['knowledge_owner'], 'b21-knowledge-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b21-analyst');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b21-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b21-tenant-admin', 'TENANT');
  // THE DECISION WORLD (the agent's room — a briefing task names a room) and the ONE memory item the reader records.
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  M1 = (await recordAs(reader, memoryItem())).memory.itemId;
}, 300_000);

afterAll(async () => {
  fault.disarm();
  await h?.close();
}, 120_000);

describe('B21.1 · Codex B20-F1 reproduced then corrected: the withdrawn-mode memory reader\'s canonical statements under the content-tier boundary (AU-MEM-0067; V03-T-097)', () => {
  it('F1 · CODEX B20-F1: serving + the tier down → metadata-only (B20); withdrawn + a present row → 503 at V, at S1, served past S2 (never issued); withdrawn + a missing row → served from the log (S2 answered), 503 at S2 (Codex\'s row) and at S1, the refused reader\'s 503, list and get 503, the audit rows EYE-DEG-001 and never EYE-INT-001; the briefing composed without its memory items and declared, the on_degraded agent stopped with the reason, the plain agent finished; the rebuild', async () => {
    /* F1.0 THE CONTROL: the room and the two agents BEFORE any withdrawal (the B20 P6 idiom). */
    const pkg = await c.committed();
    const roomId = (await c.openRoom({ packageId: pkg.pkg, title: 'B21 corridor room (harness)', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    const agentSpec = (codeDigest: string, stopConditions: Row[]): Row => ({ kind: 'briefing', version: '1.0.0', codeDigest, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions });
    const agentStop = (await c.registerAgent(agentSpec('a'.repeat(64), [{ kind: 'on_degraded' }]), tenantAdmin)).agent;
    const agentPlain = (await c.registerAgent(agentSpec('b'.repeat(64), []), tenantAdmin)).agent;
    const control0 = (await c.runAgent(agentStop.agentId, { task: 'briefing', roomId })).run;
    expect(control0.outcome, String(control0.stopReason)).toBe('finished');
    expect(await briefingDegraded(String(control0.outputs['briefing_id']))).toBe(false);
    expect(control0.outputs['memory_source']).toBe('served');
    // a domain created after 0080 has no partition row until the first check or act writes one (graph.projection_state answers serving by default) — the row is read after the withdrawal below
    expect((await partition('memory_items_current'))?.state ?? 'serving').toBe('serving');
    await pinBlocks({ condition: 'unverified', degraded: false, code: null, label: LABEL_NO_SUBSCRIPTION, withdrawn: [] }, 'serving with no subscription reads unverified (C1)');

    /* F1.1 CODEX ROW 1 — serving + the tier down: B20's point answers metadata-only; the B21 point is never reached on the serving path. */
    const ledger0 = await ledgerCount(M1); const access0 = (await accessRows(M1)).length;
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const d = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(d).toMatchObject({ content: 'unavailable', version: null, versionServed: null, accessId: null, degraded: { kind: 'content_unavailable', code: 'EYE-DEG-001', label: CONTENT_UNAVAILABLE_LABEL, detail: 'injected fault at b20.memory_content_unavailable' } });
    expect(obj(d['projection'])['condition']).toBe('unverified');
    expect(await ledgerCount(M1)).toBe(ledger0 + 1);
    expect((await accessRows(M1)).length).toBe(access0);
    fault.arm([P], 'test');
    const s = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(s['versionServed']).toBe(1); expect(s['content']).toBeUndefined(); expect(String(s['accessId'])).toMatch(UUID);
    expect((await accessRows(M1)).length).toBe(access0 + 1);
    expect(fault.isArmed(P), 'the fallback never runs on the serving path: the point is not reached').toBe(true);
    fault.disarm();

    /* F1.2 THE OPERATOR'S WITHDRAWAL (no drift): every block withdrawn. */
    const wc = (await withdraw(domainAdmin, 'memory_items_current', REASON)).projection;
    expect(wc).toMatchObject({ changed: true, reason: REASON });
    expect(await partition('memory_items_current')).toMatchObject({ state: 'withdrawn', withdrawn_by_check: null });
    await pinBlocks({ condition: 'withdrawn', degraded: true, code: 'EYE-DEG-001', withdrawn: ['memory_items_current'] }, 'withdrawn by the operator');

    /* F1.3 CODEX ROW 2 — withdrawn + a PRESENT row + the tier down, at each statement. */
    // (a) V: the retrieval's own versions read (B20's point) — the trailing detail is new (D1.3); the B20 regex's prefix stands.
    fault.arm(['b20.memory_content_unavailable'], 'test');
    await expect503(retrieveAs(reader, M1, 'memory'), 'b20');
    expect(fault.isArmed('b20.memory_content_unavailable')).toBe(false);
    // (b) S1: the derivation's policy columns — the 503, the point consumed, no ledger row, no access row, ONE failure audit row EYE-DEG-001 (never EYE-INT-001).
    const ledger1 = await ledgerCount(M1); const access1 = (await accessRows(M1)).length;
    let m = await auditMark();
    fault.arm([P], 'test');
    await expect503(retrieveAs(reader, M1, 'memory'), 'memory.expected_items');
    expect(fault.isArmed(P)).toBe(false);
    expect(await ledgerCount(M1)).toBe(ledger1); expect((await accessRows(M1)).length).toBe(access1);
    const auditS1 = await auditRowsSince(m, 'memory.item.retrieve');
    expect(auditS1.map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    expect(auditS1[0]!.stage).toBe('handler');
    // (c) S2 is NEVER issued for a present row: armed for the second arrival, the read is served and the point stays armed.
    fault.armNth(P, 2, 'test');
    const r2 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(r2['versionServed']).toBe(1);
    expect(obj(r2['availability'])).toMatchObject({ index_state: 'stale', projected: true, drift: null });
    expect(String(r2['accessId'])).toMatch(UUID);
    expect((await accessRows(M1)).length).toBe(access1 + 1);
    expect(fault.isArmed(P), 'S2 is not issued for a present row; the second arrival never came').toBe(true);
    fault.disarm();
    // (d) list and get with S1 armed: the same 503 and the graph.read failure row; unarmed, the projected row.
    m = await auditMark();
    fault.arm([P], 'test');
    await expect503(read(analyst, 'memoryList'), 'memory.expected_items');
    expect((await auditRowsSince(m, 'graph.read')).map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    m = await auditMark();
    fault.arm([P], 'test');
    await expect503(read(analyst, 'memoryGet', { itemId: M1 }), 'memory.expected_items');
    expect((await auditRowsSince(m, 'graph.read')).map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    expect(fault.isArmed(P)).toBe(false);
    const listPresent = await read(analyst, 'memoryList');
    expect((listPresent.answer['memory'] as Row[]).find((x) => x['item_id'] === M1)).toMatchObject({ item_id: M1, projected: true, index_state: 'stale', state: 'active', object_version: 1 });
    expect(obj((await read(analyst, 'memoryGet', { itemId: M1 })).answer['item'])['projected']).toBe(true);

    /* F1.4 CODEX ROW 3 — withdrawn + a MISSING row + the content available: served from the log (the recovery the B20 harness never exercised). */
    const seeded = (await itemRow(M1))!;
    await sql`delete from memory.items_current where item_id = ${M1}::uuid`.execute(su);
    const access3 = (await accessRows(M1)).length;
    const r3 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(r3['versionServed']).toBe(1);
    expect(obj(obj(r3['version'])['payload'])['statement']).toBe(memoryItem()['statement']);
    expect(obj(r3['availability'])).toMatchObject({ index_state: 'stale', projected: false, drift: null, current_version: 1, state: 'active' });
    expect(obj(r3['projection'])['condition']).toBe('withdrawn');
    expect(String(r3['accessId'])).toMatch(UUID);
    expect((await accessRows(M1)).length).toBe(access3 + 1);
    const listMissing = await read(analyst, 'memoryList');
    expect((listMissing.answer['memory'] as Row[]).find((x) => x['item_id'] === M1)).toMatchObject({ item_id: M1, projected: false, index_state: 'stale', state: 'active', object_version: 1, title: 'B20 memory item', from: 'log' });
    expect(obj((await read(analyst, 'memoryGet', { itemId: M1 })).answer['item'])).toMatchObject({ projected: false, index_state: 'stale', from: 'log' });

    /* F1.5 CODEX ROW 4 — withdrawn + a MISSING row + the tier down. */
    // (a) at S2 — CODEX'S ROW EXACTLY (S1 answered, "the actual lookup" failed): the 503, no rows, ONE failure audit row; then the recovery.
    m = await auditMark();
    const ledger5 = await ledgerCount(M1); const access5 = (await accessRows(M1)).length;
    fault.armNth(P, 2, 'test');
    await expect503(retrieveAs(reader, M1, 'memory'), 'canonical_versions');
    expect(fault.isArmed(P)).toBe(false);
    expect(await ledgerCount(M1)).toBe(ledger5); expect((await accessRows(M1)).length).toBe(access5);
    const auditS2 = await auditRowsSince(m, 'memory.item.retrieve');
    expect(auditS2.map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    expect(auditS2[0]!.stage).toBe('handler');
    const r5 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(r5['versionServed']).toBe(1); expect(obj(r5['availability'])['projected']).toBe(false);
    expect((await accessRows(M1)).length).toBe(access5 + 1);
    // (b) at S1.
    fault.arm([P], 'test');
    await expect503(retrieveAs(reader, M1, 'memory'), 'memory.expected_items');
    expect(fault.isArmed(P)).toBe(false);
    expect(await ledgerCount(M1)).toBe(ledger5); expect((await accessRows(M1)).length).toBe(access5 + 1);
    // (c) THE REFUSED READER receives the 503, not the 403 (D1.9): the fallback precedes every gate; a missing row has no audience to gate on.
    fault.armNth(P, 2, 'test');
    await expect503(retrieveAs(analyst, M1, 'decision'), 'canonical_versions');
    expect(fault.isArmed(P)).toBe(false);
    expect(await ledgerCount(M1)).toBe(ledger5); expect((await accessRows(M1)).length).toBe(access5 + 1);
    expect(await failure(retrieveAs(analyst, M1, 'decision'))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    // (d) list and get at S2: the graph.read failure row, exactly one; unarmed, the log-built rows again.
    m = await auditMark();
    fault.armNth(P, 2, 'test');
    await expect503(read(analyst, 'memoryList'), 'canonical_versions');
    expect((await auditRowsSince(m, 'graph.read')).map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    m = await auditMark();
    fault.armNth(P, 2, 'test');
    await expect503(read(analyst, 'memoryGet', { itemId: M1 }), 'canonical_versions');
    expect((await auditRowsSince(m, 'graph.read')).map((r) => [r.result_code, r.outcome])).toEqual([['EYE-DEG-001', 'failure']]);
    expect(fault.isArmed(P)).toBe(false);
    expect((await read(analyst, 'memoryList')).answer['memory'] as Row[]).toEqual(expect.arrayContaining([expect.objectContaining({ item_id: M1, projected: false, from: 'log' })]));
    expect(obj((await read(analyst, 'memoryGet', { itemId: M1 })).answer['item'])).toMatchObject({ projected: false, from: 'log' });

    /* F1.6 THE BRIEFING (D1.6/D1.7) AND THE AGENTS. */
    // (a) withdrawn, the missing row, the content available: composed from the log, labelled; the stored watermark carries the STATE only.
    const c1 = (await compose()).briefing;
    expect(c1.degraded).toBe(true);
    expect(c1.memorySource).toMatchObject({ state: 'withdrawn', code: 'EYE-DEG-001', statement: null, detail: null });
    expect(Number(c1.memorySource['items'])).toBeGreaterThanOrEqual(1);
    const m1 = c1.items.find((i) => i['kind'] === 'memory' && i['id'] === M1);
    expect(m1).toBeDefined(); expect(obj(m1!['details'])['basis_state']).toBeNull(); expect(m1!['title']).toBe('memory: B20 memory item');
    expect(await storedProjection(c1.briefingId)).toEqual({ memory: 'withdrawn' });
    expect(c1.projection.condition).toBe('withdrawn');
    // (b) at S2: composed WITHOUT its memory items, degraded, the omission declared in the answer and in the stored content; the write's audit row a success.
    const composeAt = async (statement: 'memory.expected_items' | 'canonical_versions'): Promise<Composed> => {
      const accessBefore = (await accessRows(M1)).length;
      const seq = await auditMark();
      if (statement === 'canonical_versions') fault.armNth(P, 2, 'test'); else fault.arm([P], 'test');
      const out = await compose();
      const b = out.briefing;
      expect(b.degraded).toBe(true);
      expect(b.memorySource).toEqual({ state: 'unavailable', code: 'EYE-DEG-001', statement, detail: 'injected fault at b21.memory_fallback_content_unavailable', items: 0, reason: expect.stringMatching(BRIEFING_REASON) });
      expect(String(b.memorySource['reason'])).toContain(`did not answer at ${statement} (`);
      expect(b.items.some((i) => i['kind'] === 'memory')).toBe(false);
      expect(b.memoryAccesses).toEqual([]);
      expect((await accessRows(M1)).length).toBe(accessBefore);
      expect(await storedProjection(b.briefingId)).toEqual({ memory: 'withdrawn', memory_content: 'unavailable' });
      expect(await briefingDegraded(b.briefingId)).toBe(true);
      expect(fault.isArmed(P)).toBe(false);
      const rows = await auditRowsSince(seq, 'briefing.compose');
      expect(rows.some((r) => r.outcome === 'success')).toBe(true);
      expect(rows.some((r) => r.outcome === 'failure')).toBe(false);
      expect(b.contentDigest).not.toBe(c1.contentDigest);
      return out;
    };
    const c2 = await composeAt('canonical_versions');
    // (c) at S1: the same, the statement named.
    const c3 = await composeAt('memory.expected_items');
    expect(c3.briefing.contentDigest, 'the omission is content: a composition without its memory items differs from the one that carried them').not.toBe(c1.contentDigest);
    // (d) the agent WITH on_degraded at S2: STOPPED with the declared reason; nothing admitted; no access row.
    const access6 = (await accessRows(M1)).length;
    fault.armNth(P, 2, 'test');
    const stopped = (await c.runAgent(agentStop.agentId, { task: 'briefing', roomId })).run;
    expect(stopped.outcome).toBe('stopped');
    expect(String(stopped.stopReason)).toBe(STOP_SENTENCE('canonical_versions'));
    expect(stopped.outputs['briefing_id']).toBeUndefined();
    expect(fault.isArmed(P)).toBe(false);
    expect((await accessRows(M1)).length).toBe(access6);
    // (e) the agent WITHOUT it at S2: FINISHED (never faulted), degraded, memory_source unavailable, the token in its stored content.
    fault.armNth(P, 2, 'test');
    const plain = (await c.runAgent(agentPlain.agentId, { task: 'briefing', roomId })).run;
    expect(plain.outcome, String(plain.stopReason)).toBe('finished');
    expect(plain.outputs).toMatchObject({ degraded: true, memory_source: 'unavailable' });
    expect(await briefingDegraded(String(plain.outputs['briefing_id']))).toBe(true);
    expect(await storedProjection(String(plain.outputs['briefing_id']))).toEqual({ memory: 'withdrawn', memory_content: 'unavailable' });
    expect(fault.isArmed(P)).toBe(false);
    // (f) the precedence control, unarmed: the third branch speaks only when the tier is down — B20's sentence otherwise.
    const stoppedPlainly = (await c.runAgent(agentStop.agentId, { task: 'briefing', roomId })).run;
    expect(stoppedPlainly.outcome).toBe('stopped');
    expect(String(stoppedPlainly.stopReason)).toMatch(/^stop condition on_degraded: the memory projection of this domain is withdrawn \(the memory items are served from their log, labelled\)/);

    /* F1.7 THE REBUILD and the return to serving: the item the log has re-inserted from its canonical version; the blocks unverified again. */
    const since = await mark();
    const rb = (await rebuild(domainAdmin, 'memory_items_current', 'the item the log has is re-inserted from its canonical version (B21 F1, harness)')).rebuild;
    expect(rb).toMatchObject({ outcome: 'rebuilt', projection: 'memory_items_current', state: 'serving', representation_version: '1', updated: 0, inserted: 1, removed: 0, restored: [{ id: M1, change: 'inserted', to: 'active@1' }] });
    expect((await itemRow(M1))!).toMatchObject({ object_version: 1, state: 'active', title: seeded.title, statement: seeded.statement, classification: seeded.classification, audience_purposes: seeded.audience_purposes, recorded_by: reader.principalId });
    expect(await partition('memory_items_current')).toMatchObject({ state: 'serving', withdrawn_at: null, last_rebuild_id: String(rb['rebuild_id']) });
    expect((await pevents('memory_items_current')).map((e) => e.event).slice(-2)).toEqual(['projection.withdrawn', 'projection.rebuilt']);
    const rebuilt = await outboxRows('GraphChanged', (p) => obj(p['change'])['kind'] === 'projection.rebuilt' && obj(p['projection'])['rebuild_id'] === rb['rebuild_id'], since);
    expect(rebuilt).toHaveLength(1);   // its status is not pinned: no publisher runs here
    await pinBlocks({ condition: 'unverified', withdrawn: [], degraded: false }, 'serving again with no subscription');
    const r7 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(obj(r7['availability'])).toMatchObject({ index_state: 'projected', projected: true });
    fault.arm([P], 'test');
    expect((await retrieveAs(reader, M1, 'memory')).memory['versionServed']).toBe(1);
    expect(fault.isArmed(P), 'serving: the fallback never runs').toBe(true);
    fault.disarm();
    const after = (await c.runAgent(agentPlain.agentId, { task: 'briefing', roomId })).run;
    expect(after.outcome).toBe('finished');
    expect(after.outputs['memory_source']).toBe('served');
    expect(await briefingDegraded(String(after.outputs['briefing_id']))).toBe(false);

    /* F1.8 THE SIX ITEMS. */
    sixEvidence('F1', {
      fault_trace: { withdrawal: wc['event_id'], superuser_delete: `memory.items_current ${M1}`, points: { b20: 'V (the versions read)', b21: P }, armed: { S1: 'arm', S2: 'armNth 2' } },
      watermark: { condition: 'withdrawn', missing_row: true, no_subscription: 'unverified while serving' },
      consumer_behaviour: { retrieve: '503 EYE-DEG-001 at V, S1, S2 (present row: S2 never issued → served; missing row: served from the log when S2 answers)', refused_reader: '503, the point consumed, no rows', list_get: '503 at S1 and S2', briefing: 'composed without memory items, degraded, memory_content unavailable in the watermark, memorySource.reason', agent_on_degraded: 'stopped with the reason', agent_plain: 'finished, degraded, memory_source unavailable' },
      operator_action: { rebuild_id: rb['rebuild_id'], inserted: 1 },
      recovery: { after_503: 'the next retrieval served from the log-built row with an access row', after_rebuild: 'projected, unverified (no subscription)' },
      reconciliation: { ledger_rows_added_for_503s: 0, audit_result_codes: 'EYE-DEG-001 failure, stage handler; no EYE-INT-001 on memory.item.retrieve or graph.read', compose_audit: 'success', compositions: [c1.briefingId, c2.briefing.briefingId, c3.briefing.briefingId] },
    });
    fault.disarm();
  }, 300_000);
});
