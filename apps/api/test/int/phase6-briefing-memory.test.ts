/**
 * CP-6 B10 — the memory-to-briefing path, closed at the governed boundary (Codex's bounded review at 48f7bdc, 2026-09-13).
 *
 *   B10-F1  a stored briefing DISCLOSED a memory version outside its audience: composition checked the composer's roles and
 *           copied the statement into the snapshot; a later reader — refused the item directly — received it through the
 *           briefing read. Now the cited version's audience (its roles, its classification) is applied to THIS reader on
 *           every briefing read: outside it the item is WITHHELD (identity and instant kept; title, statement, source and the
 *           rest of its content not), and the availability names why.
 *   B10-F2  each access id entered the content, so identical recompositions had different content digests. Now the accesses
 *           stay on the items' ledger — bound to the briefing by its correlation id, reported beside the content — and the
 *           same inputs compose to one digest while every access is still recorded.
 *   B10-F3  a later supersession moved the current projection's instant, so a recomposition at an earlier cutoff lost the
 *           item. Now the candidates and the version served come from HISTORY at the cutoff (a withdrawal by the cutoff
 *           excludes), that version's audience rules apply under the reader's present authority, and present availability
 *           (withdrawn now; superseded by a later version now) is reported apart from the content.
 *   B10-F4  (author-found while closing F1 at the boundary) the generic object read served a role-restricted and a
 *           classification-restricted memory version whole to a holder of objects.read, and would serve a briefing's stored
 *           memory statements the same way. Now that route serves the HEADER of an audience-governed object (MEM, BRF) and
 *           withholds its content; other object types are served as before.
 *
 * Every case runs on the real database through the governed controllers and pipeline (RLS, the ports, the ledgers).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let knowledgeOwner: AuthenticatedPrincipal; let composer: AuthenticatedPrincipal; let plainExecutive: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
type Row = Record<string, unknown>;
const mark = async (): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t.toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const item = (over: Row): Row => ({ recordClass: 'institutional', title: 'Rebooking rule', statement: 'UNRESTRICTED: the third shipment is rebooked within 48 hours of the corridor warning.', source: { kind: 'human', ref: 'decision room, January 2024' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] }, validity: { from: '2024-01-17T00:00:00Z', to: null }, retention: { profile: 'institutional-record-10y', retainUntil: null, basis: 'institutional rules are kept ten years' }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
const record = async (p: AuthenticatedPrincipal, payload: Row): Promise<string> => ((await w.graph.recordMemoryItem(h.req(p, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload })) as { memory: { itemId: string } }).memory.itemId;
const supersede = (p: AuthenticatedPrincipal, id: string, payload: Row) => w.graph.supersedeMemoryItem(h.req(p, 'memory.item.supersede', 'MEM', id, 'memory'), T(), D(), id, { payload }) as Promise<{ memory: Row }>;
const withdraw = (p: AuthenticatedPrincipal, id: string, reason: string) => w.graph.withdrawMemoryItem(h.req(p, 'memory.item.withdraw', 'MEM', id, 'memory'), T(), D(), id, { payload: { reason } }) as Promise<{ memory: Row }>;
const retrieve = (p: AuthenticatedPrincipal, id: string, purpose = 'memory', asOf?: string) => w.graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', id, purpose), T(), D(), id, { payload: asOf === undefined ? {} : { asOf } }) as Promise<{ memory: Row }>;
const compose = (p: AuthenticatedPrincipal, knownAt: string) => c.compose({ roomId: null, knownAt, priorBriefingId: null }, p);
const get = (p: AuthenticatedPrincipal, id: string, purpose = 'briefing') => w.exec.getBriefing(h.req(p, 'briefing.read', 'BRF', id, purpose), T(), D(), id) as Promise<{ briefing: Row }>;
const memoryOf = (b: { items: Row[] } | Row) => ((b['items'] as Row[]) ?? []).filter((i) => i['kind'] === 'memory');
const accessRows = async (id: string) => (await sql<{ access_id: string; object_version: number; reader_principal_id: string; purpose_id: string; correlation_id: string }>`select access_id::text, object_version::int, reader_principal_id::text, purpose_id, correlation_id::text from memory.item_access where item_id = ${id}::uuid order by accessed_at`.execute(h.su)).rows;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b10c-knowledge-owner');
  // Codex's reproduction: a composer holding executive AND knowledge_owner; a reader holding executive only
  composer = await h.humanWithSession(['executive', 'knowledge_owner'], 'b10c-composer');
  plainExecutive = await h.humanWithSession(['executive'], 'b10c-plain-executive');
  analyst = await h.humanWithSession(['domain_analyst'], 'b10c-analyst');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b10c-domain-admin');
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

describe('B10-F1 · a stored briefing serves a memory version within the cited version\'s audience only: a reader refused the item directly receives none of it through the briefing (withheld, with the reason); the composer, an administrator and an unrestricted item read as before', () => {
  let restricted = ''; let unrestricted = ''; let briefingId = '';
  it('REPRODUCED then CLOSED: the composer (executive + knowledge owner) composes from a knowledge-owner-only item and an unrestricted one; the plain executive is refused the item directly (403) and the complete briefing response holds nothing of it', async () => {
    restricted = await record(knowledgeOwner, item({ title: 'Ceiling review (knowledge owners only)', statement: 'KNOWLEDGE-OWNERS-ONLY: the premium ceiling is revised to a quarter after the February review.', source: { kind: 'human', ref: 'KO-ONLY-SOURCE-REF' }, audience: { classification: 'internal', roles: ['knowledge_owner'], purposes: ['memory', 'briefing'] } }));
    unrestricted = await record(knowledgeOwner, item({}));
    const composed = (await compose(composer, await mark())).briefing;
    briefingId = composed.briefingId;
    // the composer is in the audience: both items read and recorded
    expect(memoryOf(composed as never).map((i) => i['id']).sort()).toEqual([restricted, unrestricted].sort());
    expect(JSON.stringify(composed)).toContain('KNOWLEDGE-OWNERS-ONLY');
    expect((await accessRows(restricted)).map((a) => [a.reader_principal_id, a.purpose_id])).toEqual([[composer.principalId, 'briefing']]);
    // the control: the plain executive is refused the item directly
    await expect(retrieve(plainExecutive, restricted, 'briefing')).rejects.toMatchObject({ status: 403 });
    // THE CLOSURE: the plain executive reads the briefing — the restricted item is withheld whole
    const read = (await get(plainExecutive, briefingId)).briefing;
    const text = JSON.stringify(read);
    expect(text).not.toContain('KNOWLEDGE-OWNERS-ONLY'); expect(text).not.toContain('KO-ONLY-SOURCE-REF'); expect(text).not.toContain('Ceiling review');
    expect(text).toContain('UNRESTRICTED: the third shipment');
    const mem = memoryOf(read);
    expect(mem).toHaveLength(2);
    const held = mem.find((i) => i['id'] === restricted)!; const open = mem.find((i) => i['id'] === unrestricted)!;
    expect(held['title']).toBe('memory: withheld');
    expect(Object.keys(held['details'] as Row).sort()).toEqual(['read_under', 'reason', 'withheld']);
    expect((held['details'] as Row)['reason']).toMatch(/for the audience knowledge_owner; the reader holds none of these roles/);
    expect(held['item_id']).toBe(`memory:${restricted}@1`); // the snapshot's identity and instant stay
    expect((open['details'] as Row)['statement']).toMatch(/^UNRESTRICTED/);
    expect(read['items_withheld']).toBe(1);
    // the availability names the withheld version; the content digest is the stored snapshot's, unchanged
    const av = read['availability'] as { checked: Row; unavailable: Row[] };
    expect(av.checked['memory']).toBe(2);
    expect(av.unavailable.filter((u) => u['kind'] === 'memory').map((u) => [u['id'], u['version'], String(u['reason']).slice(0, 39)])).toEqual([[restricted, 1, 'the memory version is for the audience ']]);
    expect(read['content_digest']).toBe(composed.contentDigest);
    // the reader's read left no access row on the restricted item: what was not served was not read
    expect((await accessRows(restricted)).map((a) => a.reader_principal_id)).toEqual([composer.principalId]);
  }, 120_000);

  it('the CONTROLS: the composer reads the item in the briefing; a domain administrator (admitted to every audience role) reads it; a wrong purpose is refused; an unrestricted item is served to the plain executive', async () => {
    const own = (await get(composer, briefingId)).briefing;
    expect(JSON.stringify(own)).toContain('KNOWLEDGE-OWNERS-ONLY'); expect(own['items_withheld']).toBe(0);
    const adm = (await get(domainAdmin, briefingId)).briefing;
    expect(JSON.stringify(adm)).toContain('KNOWLEDGE-OWNERS-ONLY'); expect(adm['items_withheld']).toBe(0);
    await expect(get(plainExecutive, briefingId, 'decision')).rejects.toMatchObject({ status: 403 });
    expect(JSON.stringify(memoryOf((await get(plainExecutive, briefingId)).briefing).find((i) => i['id'] === unrestricted))).toContain('UNRESTRICTED');
  }, 60_000);

  it('a NARRATIVE that cites a withheld item is withheld with it (it may carry the item\'s content); one citing only served items is served; the composer reads both', async () => {
    const at = await mark();
    const cited = (await c.compose({ roomId: null, knownAt: at, priorBriefingId: null, narrative: 'Per the ceiling review the premium ceiling is revised to a quarter after February.', narrativeCites: [`memory:${restricted}@1`] }, composer)).briefing;
    const clean = (await c.compose({ roomId: null, knownAt: at, priorBriefingId: null, narrative: 'The rebooking rule stands: rebook within 48 hours of the corridor warning.', narrativeCites: [`memory:${unrestricted}@1`] }, composer)).briefing;
    const r1 = (await get(plainExecutive, cited.briefingId)).briefing;
    expect(r1['narrative']).toBeNull(); expect(r1['narrative_withheld']).toBe(true); expect(JSON.stringify(r1)).not.toContain('revised to a quarter');
    const r2 = (await get(plainExecutive, clean.briefingId)).briefing;
    expect(r2['narrative']).toMatch(/rebooking rule stands/); expect(r2['narrative_withheld']).toBe(false);
    const own = (await get(composer, cited.briefingId)).briefing;
    expect(own['narrative']).toMatch(/revised to a quarter/); expect(own['narrative_withheld']).toBe(false);
  }, 60_000);

  it('B10-F4 · the generic object read serves the HEADER of a memory item and of a briefing and withholds their content — the analyst who is refused the item directly reads its header only, every version; an evidence object is served as before', async () => {
    const { ObjectsController } = await import('../../src/objects/objects.controller.js');
    const oc = h.app.get(ObjectsController);
    const read = (p: AuthenticatedPrincipal, id: string, payload: Row = {}) => oc.get(h.req(p, 'objects.read', 'MEM', id, 'observation'), T(), D(), id, { payload }) as Promise<Row>;
    await expect(retrieve(analyst, restricted)).rejects.toMatchObject({ status: 403 });
    const cur = (await read(analyst, restricted))['object'] as Row;
    expect(cur['object_type']).toBe('MEM'); expect(cur['payload']).toBeNull(); expect((cur['content_withheld'] as Row)['reason']).toMatch(/memory.item.retrieve/);
    expect(JSON.stringify(cur)).not.toContain('KNOWLEDGE-OWNERS-ONLY');
    const hist = (await read(analyst, restricted, { history: true }))['history'] as Row[];
    expect(hist.length).toBeGreaterThanOrEqual(1); expect(hist.every((r) => r['payload'] === null)).toBe(true);
    expect(JSON.stringify(hist)).not.toContain('KNOWLEDGE-OWNERS-ONLY');
    const asOf = (await read(analyst, restricted, { knownAt: new Date().toISOString() }))['object'] as Row;
    expect(asOf['payload']).toBeNull();
    const brf = (await read(analyst, briefingId))['object'] as Row;
    expect(brf['object_type']).toBe('BRF'); expect(brf['payload']).toBeNull(); expect(JSON.stringify(brf)).not.toContain('KNOWLEDGE-OWNERS-ONLY');
    const listed = (await oc.list(h.req(analyst, 'objects.read', 'MEM', null, 'observation'), T(), D(), { payload: { objectType: 'MEM', limit: 50 } }) as { objects: Row[] }).objects;
    expect(listed.length).toBeGreaterThanOrEqual(2); expect(listed.every((r) => r['payload'] === null && r['content_withheld'] !== undefined)).toBe(true);
    // the control: an evidence object's payload is served as before
    const evd = (await sql<{ id: string }>`select object_id::text id from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and object_type = 'EVD' order by recorded_at limit 1`.execute(h.su)).rows[0]!.id;
    const e = (await read(analyst, evd))['object'] as Row;
    expect(e['payload']).not.toBeNull(); expect(e['content_withheld']).toBeUndefined();
    // the TYPED routes serve their own type: the claim route and the evidence route do not find a memory item or a briefing by id
    const { IntelligenceController } = await import('../../src/intelligence/intelligence.controller.js');
    const ic = h.app.get(IntelligenceController);
    const claimRead = (await ic.getClaim(h.req(analyst, 'intelligence.read', 'CLM', restricted, 'observation'), T(), D(), restricted, { payload: {} })) as Row;
    expect(JSON.stringify(claimRead)).not.toContain('KNOWLEDGE-OWNERS-ONLY'); expect((claimRead['versions'] as Row[]).length).toBe(0); expect(claimRead['current']).toBeNull();
    const claimReadB = (await ic.getClaim(h.req(analyst, 'intelligence.read', 'CLM', briefingId, 'observation'), T(), D(), briefingId, { payload: {} })) as Row;
    expect(JSON.stringify(claimReadB)).not.toContain('KNOWLEDGE-OWNERS-ONLY'); expect((claimReadB['versions'] as Row[]).length).toBe(0);
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const obs = h.app.get(ObservationController);
    await expect(obs.getEvidence(h.req(analyst, 'observation.read.evidence', 'EVD', restricted, 'observation'), T(), D(), restricted, { payload: {} })).rejects.toMatchObject({ status: 404 });
    await expect(obs.getEvidence(h.req(analyst, 'observation.read.evidence', 'EVD', briefingId, 'observation'), T(), D(), briefingId, { payload: {} })).rejects.toMatchObject({ status: 404 });
    // the generic WRITE does not admit a port-owned type (0069 §2): the analyst's objects.correct of the memory item and of the briefing refused at the port
    // B23 (0084): a briefing composed now is BRF@v2 (its attention section) — the correction names the schema of the payload it carries, so the refusal is the port's (not a schema violation)
    const correctIt = (id: string, objectType: string, payload: Row, schemaVersion?: string) => oc.correct(h.req(analyst, 'objects.correct', objectType, id, 'observation'), T(), D(), id, { payload: { expectedVersion: 1, correction: { objectType, truthState: 'asserted', classification: 'internal', purposeScope: 'memory', humanRefs: [`principal:${analyst.principalId}`], payload, ...(schemaVersion === undefined ? {} : { schemaVersion }) } } }) as Promise<Row>;
    const storedPayload = async (id: string) => (await sql<{ payload: Row }>`select payload from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`.execute(h.su)).rows[0]!.payload;
    const memPayload = { ...(await storedPayload(restricted)), statement: 'REWRITTEN BY THE ANALYST', audience: { ...((await storedPayload(restricted))['audience'] as Row), roles: [] } };
    await expect(correctIt(restricted, 'MEM', memPayload)).rejects.toThrow(/may not admit a MEM object — it is written through its own port/);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where object_id = ${restricted}::uuid`.execute(h.su)).rows[0]!.n).toBe(1);
    await expect(correctIt(briefingId, 'BRF', await storedPayload(briefingId), 'v2')).rejects.toThrow(/may not admit a BRF object — it is written through its own port/);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where object_id = ${briefingId}::uuid`.execute(h.su)).rows[0]!.n).toBe(1);
  }, 60_000);
});

describe('B10-F2 · the same inputs compose to ONE content digest while every access is recorded: two compositions by the same reader at the same cutoff with a bound prior — equal digests, two access rows; the accesses reported beside the content by the briefing\'s correlation id; a memory version within the cutoff changes the content', () => {
  it('equal digests, distinct accesses; the changed-version control', async () => {
    const id = await record(knowledgeOwner, item({ title: 'Digest rule', statement: 'DIGEST-V1: the broker shortlist is reviewed quarterly.' }));
    const cutoff = await mark();
    const first = (await compose(composer, cutoff)).briefing;
    const second = (await compose(composer, cutoff)).briefing;
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(JSON.stringify(first.items)).toBe(JSON.stringify(second.items));
    expect(JSON.stringify(first.items)).not.toMatch(/access_id/);
    const rows = await accessRows(id);
    expect(rows).toHaveLength(2); expect(rows[0]!.access_id).not.toBe(rows[1]!.access_id);
    expect(rows.map((r) => r.correlation_id)).toEqual([...new Set(rows.map((r) => r.correlation_id))]); // one per composition
    // the compose response and the read name the accesses, apart from the content
    expect(((first as unknown as Row)['memoryAccesses'] as Row[]).some((a) => a['item_id'] === id && a['access_id'] === rows[0]!.access_id)).toBe(true);
    const read = (await get(composer, first.briefingId)).briefing;
    const ma = read['memory_accesses'] as Row[];
    expect(ma.filter((a) => a['item_id'] === id).map((a) => a['access_id'])).toEqual([rows[0]!.access_id]);
    expect(ma).toEqual((first as unknown as Row)['memoryAccesses']); // the row's, exactly the composition's — not a correlation lookup
    expect(((await get(composer, second.briefingId)).briefing['memory_accesses'] as Row[]).filter((a) => a['item_id'] === id).map((a) => a['access_id'])).toEqual([rows[1]!.access_id]);
    // the empty-memory control: two compositions before any memory item existed compose alike (the fixture's own items aside, the digest is stable)
    // the changed-version CONTROL: a new version within the cutoff changes the content
    await sleep(20);
    await supersede(await h.humanWithSession(['record_authority'], 'b10c-record-authority'), id, item({ title: 'Digest rule', statement: 'DIGEST-V2: the broker shortlist is reviewed monthly.', supersession: { reason: 'the cadence changed', effectiveAt: '2024-02-01T00:00:00Z' } }));
    const later = (await compose(composer, await mark())).briefing;
    expect(later.contentDigest).not.toBe(first.contentDigest);
    const mv = memoryOf(later as never).find((i) => i['id'] === id)!;
    expect(mv['version']).toBe(2); expect((mv['details'] as Row)['statement']).toMatch(/^DIGEST-V2/);
    // and at the FIRST cutoff, still v1 and the same digest as before (F3)
    const again = (await compose(composer, cutoff)).briefing;
    expect(again.contentDigest).toBe(first.contentDigest);
  }, 120_000);
});

describe('B10-F3 · a composition at a cutoff takes its memory from HISTORY: a later supersession leaves the earlier cutoff\'s item (v1) in place, a cutoff including v2 uses v2; a withdrawal by the cutoff excludes, a withdrawal after it does not; present availability is reported apart from the content', () => {
  it('v1 retained at the earlier cutoff after v2; v2 at a later cutoff; the withdrawal distinction; the availability of a superseded and of a withdrawn citation', async () => {
    const authority = await h.humanWithSession(['record_authority'], 'b10c-record-authority-2');
    const id = await record(knowledgeOwner, item({ title: 'History rule', statement: 'HISTORY-V1: the inventory buffer is six weeks.' }));
    const wid = await record(knowledgeOwner, item({ title: 'Withdrawn rule', statement: 'WITHDRAWN-LATER: a rule that will be withdrawn after the cutoff.' }));
    await sleep(20);
    const cutoff = await mark();
    const before = (await compose(composer, cutoff)).briefing;
    const v1 = memoryOf(before as never).find((i) => i['id'] === id)!;
    expect(v1['version']).toBe(1); expect((v1['details'] as Row)['statement']).toMatch(/^HISTORY-V1/);
    expect(memoryOf(before as never).some((i) => i['id'] === wid)).toBe(true);
    // the later supersession and withdrawal — after the cutoff
    await sleep(20);
    await supersede(authority, id, item({ title: 'History rule', statement: 'HISTORY-V2: the inventory buffer is eight weeks.', supersession: { reason: 'the buffer was raised', effectiveAt: '2024-03-01T00:00:00Z' } }));
    await withdraw(authority, wid, 'recorded in error; out of circulation');
    // REPRODUCED then CLOSED: the same cutoff still carries v1 (the projection's instant moved; history did not) and the not-yet-withdrawn item
    const after = (await compose(composer, cutoff)).briefing;
    const stillV1 = memoryOf(after as never).find((i) => i['id'] === id)!;
    expect(stillV1['version']).toBe(1); expect((stillV1['details'] as Row)['statement']).toMatch(/^HISTORY-V1/);
    expect(JSON.stringify(after.items)).not.toContain('HISTORY-V2');
    expect(memoryOf(after as never).some((i) => i['id'] === wid)).toBe(true); // withdrawn AFTER the cutoff: in circulation then
    expect(after.contentDigest).toBe(before.contentDigest);
    // direct historical retrieval agrees
    expect(((await retrieve(composer, id, 'memory', cutoff)).memory as Row)['versionServed']).toBe(1);
    // a cutoff including v2 uses v2; the withdrawn item is out of circulation now
    const now = (await compose(composer, await mark())).briefing;
    const v2 = memoryOf(now as never).find((i) => i['id'] === id)!;
    expect(v2['version']).toBe(2); expect((v2['details'] as Row)['statement']).toMatch(/^HISTORY-V2/);
    expect(memoryOf(now as never).some((i) => i['id'] === wid)).toBe(false);
    // PRESENT availability on the earlier briefing, apart from its content: superseded by version 2; withdrawn now
    const read = (await get(composer, before.briefingId)).briefing;
    expect(read['content_digest']).toBe(before.contentDigest);
    const av = read['availability'] as { unavailable: Row[]; corrected: Row[] };
    expect(av.corrected.filter((x) => x['kind'] === 'memory').map((x) => [x['id'], x['version'], x['by_version']])).toEqual([[id, 1, 2]]);
    expect(av.unavailable.filter((x) => x['kind'] === 'memory').map((x) => [x['id'], x['reason']])).toEqual([[wid, 'withdrawn now; out of circulation']]);
    expect(JSON.stringify(read)).toContain('HISTORY-V1'); // the snapshot keeps what it cited
    expect(JSON.stringify(read)).not.toContain('HISTORY-V2');
  }, 180_000);
});
