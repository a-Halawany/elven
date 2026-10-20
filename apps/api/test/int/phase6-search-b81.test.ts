/**
 * CP-6 B81 §SI (migration 0119_b81_x_si) — SEARCH, THE PALETTE AND INTENT: the person's own SAVED SEARCHES and INTENT RECORDS, on a real
 * database through the real pipeline, PDP, ports and controllers — over the REAL federated governed reads (graph search with B20
 * completeness, the strategy list, the catalog search, the exposures list, the decision packages list), whose receipts the save port
 * verifies (F-P7-E-02: UX-13-002, UX-13-004, UX-13-005, PAT-15; the harness evidence of the acceptance rows UX-13-006 / CAP-OB-04 — their
 * non-demonstration recording path is B111, then H3).
 *
 * UX-13-006's fixtures: MODE CONFUSION (the mode is recorded, never inferred; a command typed in Search is searched, not run), AMBIGUOUS
 * INTENT ("Bab el-Mandeb exposure Regensburg": "Regensburg" names an objective, a capability and a stakeholder — the clarification is asked,
 * nothing preselected, the original input kept), PERMISSION TRIMMING (a collection manager's catalog / exposures / packages legs are refused
 * at the PEP and kept as declared refusals; a result can come only from a verified leg), INTERPRETER DISAGREEMENT (two interpreter versions
 * read the same words differently — both recorded, the reconciliation asks), PREVIEW (the interpretation recorded before any result or
 * review), CANCELLATION (a clarification cancelled — no choice, nothing navigated). Plus: POSITIVE (save → read exact → supersede), STALE
 * (an older version; a read older than the window; two policy versions), NEGATIVE (preselection, a silent guess, a foreign choice, a command
 * outside its Command Review, an unknown leg, another principal's receipt, a receipt of another read), UNAUTHORIZED (an agent, a principal
 * without a role, another principal — refused at the port and invisible under RLS; on another's behalf), CROSS-TENANT, NOTHING EXECUTES (a
 * command hand-off writes no decision record), REPLAY (append-only, grants, definer, ledger, the audited path).
 *
 * Every tenant, persona, object, query and record is SYNTHETIC. This proves CONSTRUCTION; demonstrated operation is the act's palette scene;
 * real acceptance (H3) is never claimed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { SearchController } from '../../src/shell/search/search.controller.js';
import { GraphController } from '../../src/graph/graph.controller.js';
import { CatalogController } from '../../src/products/catalog/catalog.controller.js';
import { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import { DecisionController } from '../../src/decision/decision.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let sc: SearchController; let gc: GraphController; let cc: CatalogController; let ec: ExposuresController; let dc: DecisionController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let analyst: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal; let nobody: AuthenticatedPrincipal;
let entityId = ''; const ids: Record<string, string> = {};

function env(p: AuthenticatedPrincipal, action: string, objectType: string, t: string = T, d: string = D, purpose = 'navigation'): Envelope {
  return {
    message_id: uuidv7(), scope: 'DOMAIN', tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.endsWith('read') || action.endsWith('search') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b81-si',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, objectType: string, t: string = T, d: string = D, purpose = 'navigation') =>
  ({ eyeEnvelope: env(p, action, objectType, t, d, purpose), eyePrincipal: p }) as never;
type Refusal = { status: number | null; message: string };
const refusal = async (p: Promise<unknown>): Promise<Refusal> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as Row)['message'] ?? e.message) };
  return { status: null, message: e instanceof Error ? e.message : String(e) };
};
const refused = async (p: Promise<unknown>, re: RegExp) => { const r = await refusal(p); expect(r.message).toMatch(re); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

/* ── the five governed reads the web federates (each its own audited read, under its own action) ── */
type Leg = { leg: string; receipt: string | null; state: string; note: string | null };
type Hit = { leg: string; kind: string; id: string; version: number | null; label: string };
/* the interpretation's PHRASES (lib/intent-b81 splits the input at its kind words): the graph search matches one phrase per read; a list leg is filtered by every phrase */
const matches = (label: string, phrases: readonly string[]) => phrases.some((p) => label.toLowerCase().includes(p.toLowerCase()));
async function legGraph(as: AuthenticatedPrincipal, q: string): Promise<{ leg: Leg; hits: Hit[] }> {
  const out = await gc.searchAll(rq(as, 'graph.read', 'SRC', T, D, 'graph'), T, D, { payload: { query: q } }) as { search: Row; receipt: Row };
  const s = out.search as { entities: Array<Row>; complete: { entities: boolean; objects: boolean }; note: string | null };
  return { leg: { leg: 'graph', receipt: String(out.receipt['policyDecisionId']), state: s.complete.entities && s.complete.objects ? 'complete' : 'bounded', note: s.note },
           hits: s.entities.map((e) => ({ leg: 'graph', kind: 'entity', id: String(e['id']), version: null, label: String(e['label']) })) };
}
async function legStrategy(as: AuthenticatedPrincipal, phrases: readonly string[]): Promise<{ leg: Leg; hits: Hit[] }> {
  const out = await gc.listStrategy(rq(as, 'graph.read', 'OBJ', T, D, 'graph'), T, D, { payload: { limit: 300 } }) as { strategy: Row[]; projection: Row; receipt: Row };
  const hits = out.strategy.filter((s) => matches(String(s['title']), phrases))
    .map((s) => ({ leg: 'strategy', kind: String(s['object_type']).toLowerCase(), id: String(s['strategy_object_id']), version: Number(s['object_version']), label: String(s['title']) }));
  return { leg: { leg: 'strategy', receipt: String(out.receipt['policyDecisionId']), state: out.projection['condition'] === 'current' ? 'complete' : 'partial', note: null }, hits };
}
async function legRefusable(as: AuthenticatedPrincipal, leg: 'catalog' | 'exposures' | 'packages', q: string): Promise<{ leg: Leg; hits: Hit[] }> {
  const call = leg === 'catalog' ? cc.search(rq(as, 'products.catalog.search', 'CAT', T, D, 'products'), T, D, { payload: { q } })
    : leg === 'exposures' ? ec.list(rq(as, 'prediction.exposure.read', 'RSK', T, D, 'prediction'), T, D)
    : dc.list(rq(as, 'decision.read', 'DPK', T, D, 'decision'), T, D);
  try {
    const out = await call as Row & { receipt: Row };
    return { leg: { leg, receipt: String(out.receipt['policyDecisionId']), state: 'complete', note: null }, hits: [] };
  } catch (e) {
    const words = e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? e.message) : String(e);
    return { leg: { leg, receipt: null, state: e instanceof HttpException && e.getStatus() === 403 ? 'refused' : 'failed', note: words }, hits: [] };
  }
}
async function federate(as: AuthenticatedPrincipal, phrases: readonly string[]) {
  const graphs = []; for (const p of phrases) graphs.push(await legGraph(as, p));
  const parts = [...graphs, await legStrategy(as, phrases), await legRefusable(as, 'catalog', phrases.join(' ')), await legRefusable(as, 'exposures', phrases.join(' ')), await legRefusable(as, 'packages', phrases.join(' '))];
  return { legs: parts.map((p) => p.leg), hits: parts.flatMap((p) => p.hits) };
}

type SaveOut = { savedSearch: Row; receipt: Row };
const save = (as: AuthenticatedPrincipal, payload: Row, t = T, d = D) => sc.save(rq(as, 'shell.search.save', 'SRH', t, d), t, d, { payload }) as unknown as Promise<SaveOut>;
const read = (as: AuthenticatedPrincipal, payload: Row = {}, t = T, d = D) => sc.read(rq(as, 'shell.search.read', 'SRH', t, d), t, d, { payload }) as unknown as Promise<{ searches: Row; receipt: Row }>;
const record = (as: AuthenticatedPrincipal, payload: Row, t = T, d = D) => sc.record(rq(as, 'shell.intent.record', 'ITN', t, d), t, d, { payload }) as unknown as Promise<{ intent: Row; receipt: Row }>;
const countSaved = async (p: AuthenticatedPrincipal) => (await one(sql`select count(*)::int n from shell.saved_searches where principal_id = ${p.principalId}::uuid`))['n'] as number;
const countIntents = async (p: AuthenticatedPrincipal) => (await one(sql`select count(*)::int n from shell.intent_records where principal_id = ${p.principalId}::uuid`))['n'] as number;

/** A raw call under the PIPELINE's established context of `as` (the commit role, its bound principal) — the port and RLS as the runtime sees them. */
async function underWrite(as: AuthenticatedPrincipal, action: string, fn: (tx: Parameters<Parameters<typeof h.pipeline.consequentialRead>[3]>[0]) => Promise<unknown>): Promise<string> {
  return h.pipeline.write(env(as, action, 'SRH'), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'SRH', objectId: null }, (tx) => tx,
    async (tx) => { await fn(tx); return { result: {}, targetType: 'SRH', targetId: null, targetVersion: null, outboxEvent: null }; })
    .then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
}
async function underRead<R>(as: AuthenticatedPrincipal, fn: (tx: Parameters<Parameters<typeof h.pipeline.consequentialRead>[3]>[0]) => Promise<R>): Promise<R> {
  const action = 'shell.search.read';
  const out = await h.pipeline.consequentialRead(env(as, action, 'SRH'), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'SRH', objectId: null }, (tx) => tx, async (tx) => fn(tx));
  return out.result;
}
async function person(label: string, kind: 'human' | 'agent', roles: string[]): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${`b81-si-${label}-${RUN} (SYNTHETIC)`}, ${`b81si-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r, scope: 'DOMAIN' as const, tenantId: T, domainId: D }));
  for (const b of bindings) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, 'DOMAIN', ${T}::uuid, ${D}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: 'DOMAIN', homeTenantId: T, homeDomainId: D, bindings });
}

const QUERY = 'Bab el-Mandeb exposure Regensburg';
const PHRASES = ['Bab el-Mandeb', 'Regensburg'] as const;
const INTERPRETER = 'b81-si-intent-1';
const alt = (key: string, label: string, kind: string, target: string) => ({ key, label, kind, target });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  sc = h.app.get(SearchController); gc = h.app.get(GraphController); cc = h.app.get(CatalogController); ec = h.app.get(ExposuresController); dc = h.app.get(DecisionController);
  analyst = await h.humanWithSession(['domain_analyst'], 'si-analyst');
  collector = await h.humanWithSession(['collection_manager'], 'si-collector');
  strategist = await h.humanWithSession(['strategy_owner'], 'si-strategist');
  nobody = await h.humanWithSession([], 'si-nobody');
  agent = await person('agent', 'agent', ['domain_analyst']);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b81-si-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b81-si-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  // THE NORDWERK-LIKE GRAPH (SYNTHETIC): the strait as an entity (the honest fixture: the event beside the projection row), and three
  // strategy objects that each name "Regensburg" — the natural ambiguity of the palette scene.
  entityId = uuidv7(); const corr = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${strategist.principalId}::uuid, ${corr}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${entityId}::uuid, 'entity.created', ${strategist.principalId}::uuid,
            ${JSON.stringify({ entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', normalized_name: 'bab el-mandeb strait', split_from: null })}::jsonb, ${corr}::uuid)`.execute(h.su);
  for (const [type, title] of [['OBJ', 'Keep the Regensburg line supplied through Q1'], ['CAP', 'Regensburg assembly'], ['STK', 'Regensburg line workforce']] as const) {
    const out = await gc.declare(h.req(strategist, 'graph.strategy.declare', type, null, 'graph'), T, D, { payload: { objectType: type, title, statement: `${title} (B81 §SI harness, SYNTHETIC)`,
      restsOn: [{ kind: 'entity', id: entityId, rationale: 'about the corridor through this strait (B81 §SI harness)' }] } }) as { strategy: { objectId: string } };
    ids[type] = out.strategy.objectId;
  }
}, 600_000);
afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('§SI · THE FEDERATED READS — each leg its own governed, audited read (no executive.search, no write)', () => {
  it('the analyst\'s five legs: graph search finds the strait (with B20 completeness), the strategy list the three "Regensburg" objects; catalog, exposures and packages answer', async () => {
    const f = await federate(analyst, PHRASES);
    expect(f.legs.map((l) => [l.leg, l.state === 'refused' ? 'refused' : 'read'])).toEqual([['graph', 'read'], ['graph', 'read'], ['strategy', 'read'], ['catalog', 'read'], ['exposures', 'read'], ['packages', 'read']]);
    expect(f.hits.filter((x) => x.leg === 'graph').map((x) => x.label)).toContain('Bab el-Mandeb Strait');
    expect(f.hits.filter((x) => x.leg === 'strategy').map((x) => x.kind).sort()).toEqual(['cap', 'obj', 'stk']);
    const audited = await rows(sql`select action from audit.audit_events where tenant_id = ${T}::uuid and actor = ${`principal:${analyst.principalId}`} group by action order by action`);
    expect(audited.map((x) => x['action'])).toEqual(['decision.read', 'graph.read', 'prediction.exposure.read', 'products.catalog.search']);
  });
});

describe('§SI.2 · INTENT — the deterministic interpreter\'s readings recorded (UX-13-005, PAT-15): nothing preselected, no silent guess, nothing executes', () => {
  let asked: Row;
  it('PREVIEW + AMBIGUOUS INTENT: "Regensburg" names three objects — the clarification is recorded with the original input and every alternative, none preselected; the person chooses the objective', async () => {
    const alternatives = [alt(`OBJ:${ids['OBJ']}`, 'Keep the Regensburg line supplied through Q1', 'objective', `/graph/strategy?object=${ids['OBJ']}`),
      alt(`CAP:${ids['CAP']}`, 'Regensburg assembly', 'capability', `/graph/strategy?object=${ids['CAP']}`), alt(`STK:${ids['STK']}`, 'Regensburg line workforce', 'stakeholder', `/graph/strategy?object=${ids['STK']}`)];
    asked = (await record(analyst, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'chosen', choice: `OBJ:${ids['OBJ']}`,
      interpretation: { kind: 'ambiguous', scoped_query: 'Bab el-Mandeb', kinds: ['exposure'], terms: ['bab', 'el-mandeb', 'regensburg'], uncertainty: ['"regensburg" matches 3 objects of 3 kinds'], reason: null },
      alternatives, clarification: 'Which "Regensburg" do you mean — the objective, the capability or the stakeholder?' })).intent;
    expect(asked).toMatchObject({ mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'chosen', choice: `OBJ:${ids['OBJ']}`, executed: false, command_action: null });
    expect((asked['alternatives'] as Row[]).map((a) => Object.keys(a).sort().join(','))).toEqual(['key,kind,label,target', 'key,kind,label,target', 'key,kind,label,target']);
    expect(String(asked['claim'])).toMatch(/executes nothing/);
  });
  it('CANCELLATION: the clarification cancelled — recorded with no choice; MODE CONFUSION: a command typed in Search mode is recorded as a literal search, never run', async () => {
    const c = (await record(analyst, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'cancelled', clarification: 'Which "Regensburg" do you mean?',
      interpretation: { kind: 'ambiguous', scoped_query: 'Bab el-Mandeb', kinds: ['exposure'], terms: [] },
      alternatives: [alt('a', 'the objective', 'objective', '/graph/strategy'), alt('b', 'the capability', 'capability', '/graph/strategy')] })).intent;
    expect(c).toMatchObject({ outcome: 'cancelled', choice: null });
    const m = (await record(analyst, { mode: 'search', input: 'approve corridor reroute', interpreter: INTERPRETER, outcome: 'literal',
      interpretation: { kind: 'search', scoped_query: 'approve corridor reroute', kinds: [], terms: ['approve', 'corridor', 'reroute'], uncertainty: ['these words read like a command — Command mode opens its review; Search only searches'] } })).intent;
    expect(m).toMatchObject({ mode: 'search', outcome: 'literal', command_action: null, executed: false });
  });
  it('COMMAND → REVIEW: "approve corridor reroute" in Command mode is recorded ONLY as the hand-off to the package page\'s Command Review — no decision record is written', async () => {
    const before = await one(sql`select (select count(*)::int from audit.audit_events where tenant_id = ${T}::uuid and action like 'decision.%' and action <> 'decision.read') as a`);
    const r = (await record(analyst, { mode: 'command', input: 'approve corridor reroute', interpreter: INTERPRETER, outcome: 'command_review', commandAction: 'decision.approve', choice: 'pkg-1',
      interpretation: { kind: 'command', scoped_query: 'corridor reroute', kinds: ['package'], terms: ['corridor', 'reroute'], command: 'decision.approve' },
      alternatives: [alt('pkg-1', 'Approve a decision package version — Corridor reroute (SYNTHETIC)', 'command', '/decisions?package=00000000-0000-4000-8000-000000000001&review=decision.approve')] })).intent;
    expect(r).toMatchObject({ outcome: 'command_review', command_action: 'decision.approve', executed: false });
    const after = await one(sql`select (select count(*)::int from audit.audit_events where tenant_id = ${T}::uuid and action like 'decision.%' and action <> 'decision.read') as a`);
    expect(after).toEqual(before);
  });
  it('INTERPRETER DISAGREEMENT: two interpreter versions read the same words differently — both recorded; the reconciliation answers them as an ambiguity it asks about', async () => {
    const v0 = (await record(analyst, { mode: 'ask', input: QUERY, interpreter: 'b81-si-literal-1', outcome: 'literal', interpretation: { kind: 'search', scoped_query: QUERY, kinds: [], terms: [] } })).intent;
    const v1 = (await record(analyst, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'literal', interpretation: { kind: 'search', scoped_query: 'Bab el-Mandeb', kinds: ['exposure'], terms: [] } })).intent;
    const rec = (await record(analyst, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'chosen', choice: 'scoped', respondsTo: v1['intent_id'],
      clarification: 'Two readings differ: search the words as typed, or search exposures of Bab el-Mandeb?',
      interpretation: { kind: 'ambiguous', scoped_query: null, kinds: [], terms: [], uncertainty: ['b81-si-literal-1 and b81-si-intent-1 disagree'] },
      alternatives: [alt('literal', `Search "${QUERY}" as typed`, 'search', `/graph/search/all?q=${encodeURIComponent(QUERY)}`), alt('scoped', 'Exposures of Bab el-Mandeb', 'search', '/graph/search/all?q=Bab%20el-Mandeb&kinds=exposure')] })).intent;
    expect([v0['interpreter'], v1['interpreter']]).toEqual(['b81-si-literal-1', 'b81-si-intent-1']);
    expect(rec).toMatchObject({ responds_to: v1['intent_id'], choice: 'scoped', outcome: 'chosen' });
  });
  it('NEGATIVE: a preselected alternative, an ambiguous reading without its clarification, a choice not offered, a command outside its review, an ambiguous hand-off with no choice — each refused, nothing written', async () => {
    const n0 = await countIntents(analyst);
    const base = { mode: 'ask', input: QUERY, interpreter: INTERPRETER };
    const two = [alt('a', 'the objective', 'objective', '/graph/strategy'), alt('b', 'the capability', 'capability', '/graph/strategy')];
    await refused(record(analyst, { ...base, outcome: 'chosen', choice: 'a', clarification: 'which?', interpretation: { kind: 'ambiguous' }, alternatives: [{ ...two[0], preselected: true }, two[1]] }),
      /^intent record rejected \(preselected\): alternative 1 carries preselected — an alternative is offered, never preselected/);
    await refused(record(analyst, { ...base, outcome: 'chosen', choice: 'a', interpretation: { kind: 'ambiguous' }, alternatives: two }),
      /^intent record rejected \(clarification\): an ambiguous reading offers at least two alternatives and states the clarification it asks — never a silent guess/);
    await refused(record(analyst, { ...base, outcome: 'chosen', choice: 'a', clarification: 'which?', interpretation: { kind: 'ambiguous' }, alternatives: [two[0]] }),
      /^intent record rejected \(clarification\)/);
    await refused(record(analyst, { ...base, outcome: 'chosen', choice: 'z', clarification: 'which?', interpretation: { kind: 'ambiguous' }, alternatives: two }),
      /^intent record rejected \(choice\): the choice is one of the alternatives offered \(a, b\)/);
    await refused(record(analyst, { ...base, mode: 'command', outcome: 'chosen', choice: 'a', commandAction: 'decision.approve', interpretation: { kind: 'command' }, alternatives: two }),
      /^intent record rejected \(command\): a command is recorded only as the hand-off to its page's Command Review/);
    await refused(record(analyst, { ...base, mode: 'command', outcome: 'command_review', interpretation: { kind: 'command' } }), /^intent record rejected \(command\)/);
    await refused(record(analyst, { ...base, mode: 'command', outcome: 'command_review', commandAction: 'decision.approve', clarification: 'which package?', interpretation: { kind: 'ambiguous' }, alternatives: two }),
      /^intent record rejected \(choice\): an ambiguous reading leads nowhere until the person chooses — no silent guess/);
    await refused(record(analyst, { ...base, outcome: 'chosen', choice: 'a', interpretation: { kind: 'search' }, alternatives: [alt('a', 'elsewhere', 'search', 'https://example.test/x')] }),
      /^intent record rejected \(alternatives\): alternative 1 leads to a page of this product/);
    await refused(record(analyst, { ...base, outcome: 'literal', interpretation: { kind: 'search', model: 'gpt' } }), /^intent record rejected \(interpretation\): the interpretation carries no key model/);
    await refused(record(analyst, { ...base, outcome: 'literal', respondsTo: uuidv7(), interpretation: { kind: 'search' } }), /^intent record rejected \(unknown_intent\)/);
    // the route refuses the caller's own malformed request before any port (422)
    expect((await refused(record(analyst, { ...base, mode: 'chat', outcome: 'literal', interpretation: { kind: 'search' } }), /^intent record rejected \(mode\)/)).status).toBe(422);
    expect((await refused(record(analyst, { ...base, outcome: 'executed', interpretation: { kind: 'command' } }), /^intent record rejected \(outcome\): .*nothing is ever recorded as executed/)).status).toBe(422);
    expect(await countIntents(analyst)).toBe(n0);
    // the table refuses a silent guess even to the superuser
    await expect(sql`insert into shell.intent_records (intent_id, principal_id, tenant_id, domain_id, mode, input, interpreter, interpretation, alternatives, outcome, correlation_id)
      values (${uuidv7()}::uuid, ${analyst.principalId}::uuid, ${T}::uuid, ${D}::uuid, 'ask', 'x', ${INTERPRETER}, '{"kind":"ambiguous"}'::jsonb, '[]'::jsonb, 'literal', ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/check constraint/i);
  });
  it('an AGENT is refused at the port `(actor)`; a principal with no role at the PEP (403)', async () => {
    await refused(record(agent, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'literal', interpretation: { kind: 'search' } }), /^intent record rejected \(actor\): it is a named, active human's own/);
    expect((await refusal(record(nobody, { mode: 'ask', input: QUERY, interpreter: INTERPRETER, outcome: 'literal', interpretation: { kind: 'search' } }))).status).toBe(403);
  });
});

describe('§SI.1 · SAVED SEARCHES (UX-13-002, D10): the exact result set, its digest, the policy version and the cutoff — derived from the reads\' receipts', () => {
  let v1: Row; let v2: Row; let f: Awaited<ReturnType<typeof federate>>;
  it('POSITIVE: v1 keeps the federated result set; the port verified each leg\'s receipt and derived the policy version and the cutoff from the policy record', async () => {
    f = await federate(analyst, PHRASES);
    const intentId = (await rows(sql`select intent_id::text id from shell.intent_records where principal_id = ${analyst.principalId}::uuid and outcome = 'chosen' order by recorded_at limit 1`))[0]!['id'];
    const out = await save(analyst, { name: 'Bab el-Mandeb exposure — Regensburg objective', expectedVersion: 0, query: QUERY, legs: f.legs, results: f.hits, intentRecordId: intentId,
      intent: { mode: 'ask', interpreter: INTERPRETER, kind: 'ambiguous', scoped_query: 'Bab el-Mandeb', kinds: ['exposure'], choice: `OBJ:${ids['OBJ']}` }, filters: { kinds: ['exposure'] } });
    v1 = out.savedSearch;
    expect(v1).toMatchObject({ version: 1, supersedes: null, query: QUERY, result_count: f.hits.length, policy_version: 'bundle-v1', intent_record_id: intentId });
    expect(String(v1['result_digest'])).toMatch(/^[0-9a-f]{64}$/);
    const legs = v1['legs'] as Row[];
    expect(legs.map((l) => [l['leg'], l['basis']])).toEqual(f.legs.map((l) => [l.leg, expect.stringMatching(/^verified: the read's policy decision/)]));
    const decided = await one(sql`select max(created_at) as at from policy.policy_decisions where id = any(${f.legs.map((l) => l.receipt)}::uuid[])`);
    expect(new Date(String(v1['cutoff'])).getTime()).toBe((decided['at'] as Date).getTime());
    expect(new Date(String(v1['read_from'])).getTime()).toBeLessThanOrEqual(new Date(String(v1['cutoff'])).getTime());
  });
  it('READ EXACT: the version reopens EXACTLY as saved (results, legs, digest checked, cutoff, policy version) — the live re-run is the web\'s, beside it', async () => {
    const r = (await read(analyst, { savedSearchId: v1['saved_search_id'] })).searches;
    const exact = r['exact'] as Row;
    expect(exact).toMatchObject({ saved_search_id: v1['saved_search_id'], version: 1, result_digest: v1['result_digest'], digest_ok: true, policy_version: 'bundle-v1', latest_version: 1 });
    expect(exact['results']).toEqual(f.hits);
    expect(String(r['claim'])).toMatch(/a live re-run is shown beside it, never as it/);
    const saved = r['saved'] as Array<{ name: string; versions: number; current: Row }>;
    expect(saved.map((s) => [s.name, s.versions])).toEqual([['Bab el-Mandeb exposure — Regensburg objective', 1]]);
    expect((r['intents'] as Row[]).length).toBeGreaterThanOrEqual(5);
  });
  it('SUPERSEDE: v2 (a later run, the same name in another case) supersedes v1; v1 stays exactly as it was', async () => {
    const g = await federate(analyst, ['Regensburg']);
    v2 = (await save(analyst, { name: 'BAB EL-MANDEB exposure — Regensburg objective', expectedVersion: 1, query: 'Regensburg', legs: g.legs, results: g.hits })).savedSearch;
    expect(v2).toMatchObject({ version: 2, supersedes: v1['saved_search_id'] });
    const again = ((await read(analyst, { savedSearchId: v1['saved_search_id'] })).searches['exact']) as Row;
    expect(again).toMatchObject({ version: 1, result_digest: v1['result_digest'], latest_version: 2 });
  });
  it('STALE: a save that read version 1 after v2 exists — refused, nothing overwritten; a leg read more than an hour ago — refused; two policy versions — refused', async () => {
    const n0 = await countSaved(analyst);
    await refused(save(analyst, { name: 'Bab el-Mandeb exposure — Regensburg objective', expectedVersion: 1, query: QUERY, legs: f.legs, results: [] }),
      /^saved search rejected \(stale\): your saved search "Bab el-Mandeb exposure — Regensburg objective" is at version 2; this save read version 1/);
    // a planted, OLD allowed read of the analyst's (SYNTHETIC): the receipt is real but its read is older than the window
    const old = uuidv7(); const other = uuidv7();
    await sql`insert into policy.policy_bundles (version, digest, description) values ('bundle-b81-si-test', 'synthetic', 'B81 §SI harness: a second bundle version (SYNTHETIC)') on conflict do nothing`.execute(h.su);
    for (const [id, bundle, at] of [[old, 'bundle-v1', "clock_timestamp() - interval '2 hours'"], [other, 'bundle-b81-si-test', 'clock_timestamp()']] as const) {
      await sql`insert into policy.policy_decisions (id, scope, tenant_id, domain_id, decision, principal_id, action, object_type, consequence_class, input_digest, bundle_version, reason, correlation_id, created_at)
        values (${id}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'allow', ${`principal:${analyst.principalId}`}, 'graph.read', 'OBJ', 'C1', 'synthetic', ${bundle}, 'B81 §SI harness (SYNTHETIC)', ${uuidv7()}::uuid, ${sql.raw(at)})`.execute(h.su);
    }
    await refused(save(analyst, { name: 'old read', expectedVersion: 0, query: QUERY, legs: [{ leg: 'strategy', receipt: old, state: 'complete', note: null }], results: [] }),
      /^saved search rejected \(stale\): the strategy leg was read at .*, more than 01:00:00 ago — run the search again/);
    await refused(save(analyst, { name: 'two policies', expectedVersion: 0, query: QUERY, legs: [f.legs[0], { leg: 'strategy', receipt: other, state: 'complete', note: null }], results: [] }),
      /^saved search rejected \(stale\): the legs were read under different policy versions/);
    expect(await countSaved(analyst)).toBe(n0);
  });
});

describe('§SI.1 · PERMISSION TRIMMING and the receipts — a result comes only from a verified read of the saver\'s own', () => {
  it('a collection manager\'s catalog, exposures and packages legs are REFUSED at the PEP — saved as declared refusals in the server\'s words; graph and strategy verified', async () => {
    const f = await federate(collector, PHRASES);
    expect(f.legs.map((l) => [l.leg, l.state === 'refused' ? 'refused' : 'read'])).toEqual([['graph', 'read'], ['graph', 'read'], ['strategy', 'read'], ['catalog', 'refused'], ['exposures', 'refused'], ['packages', 'refused']]);
    const out = (await save(collector, { name: 'corridor (trimmed)', expectedVersion: 0, query: QUERY, legs: f.legs, results: f.hits })).savedSearch;
    expect((out['legs'] as Row[]).map((l) => [l['leg'], String(l['basis']).split(':')[0]])).toEqual([
      ['graph', 'verified'], ['graph', 'verified'], ['strategy', 'verified'], ['catalog', 'declared by the reader'], ['exposures', 'declared by the reader'], ['packages', 'declared by the reader']]);
    expect((out['legs'] as Row[]).filter((l) => l['state'] === 'refused').every((l) => typeof l['note'] === 'string' && (l['note'] as string).length > 0)).toBe(true);
  });
  it('a result claimed from a REFUSED leg, a refused leg carrying a receipt, another principal\'s receipt, a receipt of another read, an unknown leg, no read at all — each refused', async () => {
    const mine = await legGraph(collector, 'Bab'); const theirs = await legGraph(analyst, 'Bab'); const strat = await legStrategy(collector, ['Regensburg']);
    const refusedLeg = { leg: 'catalog', receipt: null, state: 'refused', note: 'EYE-AUT-001 (SYNTHETIC words)' };
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [mine.leg, refusedLeg], results: [{ leg: 'catalog', kind: 'product', id: 'p-1', version: 1, label: 'a planted product' }] }),
      /^saved search rejected \(results\): result 1 comes from catalog, which is not a leg of this search with a verified read \(graph\)/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [mine.leg, { ...refusedLeg, receipt: mine.leg.receipt }], results: [] }),
      /^saved search rejected \(legs\): a refused leg has no receipt — nothing was read from it/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [mine.leg, mine.leg], results: [] }), /^saved search rejected \(legs\): the receipt .* is named twice/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [theirs.leg], results: [] }),
      /^saved search rejected \(unknown_receipt\): the graph leg's receipt is not an allowed read of yours in this domain/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [{ ...strat.leg, leg: 'graph' }], results: [] }),
      /^saved search rejected \(receipt\): the graph leg's receipt is of graph.read\/OBJ — the leg is read by graph.read\/SRC/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [{ leg: 'executive', receipt: mine.leg.receipt, state: 'complete', note: null }], results: [] }),
      /^saved search rejected \(legs\): executive is not a leg of the federated search/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [refusedLeg], results: [] }),
      /^saved search rejected \(receipt\): no leg was read/);
    await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [mine.leg], results: [{ leg: 'graph', kind: 'entity', id: 'e1', version: null, label: 'a', score: 0.9 }] }),
      /^saved search rejected \(results\): result 1 carries no key score/);
    // the route's own intake (422 before any port)
    expect((await refused(save(collector, { name: '', expectedVersion: 0, query: 'Bab', legs: [mine.leg] }), /^saved search rejected \(name\)/)).status).toBe(422);
    expect((await refused(save(collector, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [] }), /^saved search rejected \(legs\)/)).status).toBe(422);
    expect(await countSaved(collector)).toBe(1);
    // the table refuses a digest that is not the result set's own, even to the superuser
    await expect(sql`insert into shell.saved_searches (saved_search_id, principal_id, tenant_id, domain_id, name, name_key, version, query, legs, results, result_count, result_digest, policy_version, cutoff, read_from, correlation_id)
      values (${uuidv7()}::uuid, ${collector.principalId}::uuid, ${T}::uuid, ${D}::uuid, 'planted', 'planted', 1, 'q', '[{"leg":"graph"}]'::jsonb, '[]'::jsonb, 0, ${'0'.repeat(64)}, 'bundle-v1', clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/check constraint/i);
  });
});

describe('§SI · UNAUTHORIZED — another principal never reads it; an agent keeps none; another tenant is denied', () => {
  it('another principal\'s read lists only its OWN saved searches; the port refuses reading another\'s `(actor)`; RLS shows the runtime none of its rows', async () => {
    expect(((await read(collector)).searches['saved'] as Row[]).map((s) => s['name'])).toEqual(['corridor (trimmed)']);
    const v1 = (await one(sql`select saved_search_id::text id from shell.saved_searches where principal_id = ${analyst.principalId}::uuid and version = 1`))['id'] as string;
    await refused(read(collector, { savedSearchId: v1 }), /^saved search rejected \(unknown_saved_search\): no saved search of yours in this domain matches this link/);
    const msg = await underRead(collector, async (tx) => {
      await sql`savepoint other`.execute(tx);
      return sql`select shell.searches_of(${analyst.principalId}::uuid, ${T}::uuid, ${D}::uuid, null, 5) as r`.execute(tx).then(() => 'no error',
        async (e: unknown) => { await sql`rollback to savepoint other`.execute(tx); return e instanceof Error ? e.message : String(e); });
    });
    expect(msg).toMatch(/^saved search rejected \(actor\): a principal reads only its own saved searches and intent records/);
    const seen = await underRead(collector, async (tx) => (await sql<{ s: number; i: number }>`select (select count(*)::int from shell.saved_searches where principal_id = ${analyst.principalId}::uuid) as s,
      (select count(*)::int from shell.intent_records where principal_id = ${analyst.principalId}::uuid) as i`.execute(tx)).rows[0]);
    expect(seen).toEqual({ s: 0, i: 0 });
  });
  it('saving or recording ON ANOTHER\'S BEHALF is refused `(actor)` (the actor is the bound principal)', async () => {
    const m1 = await underWrite(collector, 'shell.intent.record', (tx) => sql`select shell.record_intent(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'ask', 'x', ${INTERPRETER}, '{"kind":"search"}'::jsonb, '[]'::jsonb,
      null, null, 'literal', null, null, ${analyst.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx));
    expect(m1).toMatch(/^intent record rejected \(actor\): it is recorded by its own principal, never on another's behalf/);
    const m2 = await underWrite(collector, 'shell.search.save', (tx) => sql`select shell.save_search(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'x', 0, 'q', null, null, '[]'::jsonb, '[]'::jsonb, null,
      ${analyst.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx));
    expect(m2).toMatch(/^saved search rejected \(actor\)/);
  });
  it('an AGENT is refused at the port; a principal with no role, another tenant\'s domain — denied at the PEP', async () => {
    const g = await legGraph(agent, 'Bab');
    await refused(save(agent, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [g.leg] }), /^saved search rejected \(actor\): it is a named, active human's own/);
    expect((await refusal(save(nobody, { name: 'x', expectedVersion: 0, query: 'Bab', legs: [g.leg] }))).status).toBe(403);
    expect((await refusal(read(nobody))).status).toBe(403);
    expect((await refusal(read(analyst, {}, T2, D2))).status).toBe(403);
    expect((await refusal(record(analyst, { mode: 'ask', input: 'x', interpreter: INTERPRETER, outcome: 'literal', interpretation: { kind: 'search' } }, T2, D2))).status).toBe(403);
    expect(await one(sql`select (select count(*)::int from shell.saved_searches where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid)) +
      (select count(*)::int from shell.intent_records where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid)) as n`)).toEqual({ n: 0 });
  });
});

describe('§SI · REPLAY — append-only, the grants, the definer, the ledger, the audited path', () => {
  it('neither table is ever updated or deleted; FORCE RLS; no write grant; the write ports are eye_commit\'s alone', async () => {
    for (const t of ['saved_searches', 'intent_records']) {
      await expect(sql`update ${sql.raw(`shell.${t}`)} set principal_id = principal_id`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
      await expect(sql`delete from ${sql.raw(`shell.${t}`)}`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
      const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force, has_table_privilege('eye_app', ${`shell.${t}`}, 'INSERT') as app_ins,
        has_table_privilege('eye_commit', ${`shell.${t}`}, 'INSERT') as cmt_ins, has_table_privilege('eye_commit', ${`shell.${t}`}, 'UPDATE') as cmt_upd
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = ${t}`);
      expect(r, t).toEqual({ rls: true, force: true, app_ins: false, cmt_ins: false, cmt_upd: false });
    }
    const f = await one(sql`select
      has_function_privilege('eye_app', 'shell.save_search(uuid, uuid, uuid, text, int, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid)', 'EXECUTE') as app_save,
      has_function_privilege('eye_commit', 'shell.save_search(uuid, uuid, uuid, text, int, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid)', 'EXECUTE') as cmt_save,
      has_function_privilege('public', 'shell.save_search(uuid, uuid, uuid, text, int, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid)', 'EXECUTE') as pub_save,
      has_function_privilege('eye_app', 'shell.record_intent(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, uuid, uuid, uuid)', 'EXECUTE') as app_rec,
      has_function_privilege('eye_commit', 'shell.record_intent(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, uuid, uuid, uuid)', 'EXECUTE') as cmt_rec,
      has_function_privilege('eye_app', 'shell.searches_of(uuid, uuid, uuid, uuid, int)', 'EXECUTE') as app_read`);
    expect(f).toEqual({ app_save: false, cmt_save: true, pub_save: false, app_rec: false, cmt_rec: true, app_read: true });
    const definer = await rows(sql`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'shell' and p.proname in ('save_search', 'record_intent', 'searches_of', 'assert_search_actor') order by p.proname`);
    expect(definer).toHaveLength(4);
    for (const d of definer) { expect(d['prosecdef'], String(d['proname'])).toBe(true); expect(String(d['proconfig'])).toMatch(/search_path=.*pg_catalog, pg_temp/); }
  });
  it('the ledger: one `shell.search.saved` per version (naming the digest, the policy version and the cutoff) and one `shell.intent.recorded` per record', async () => {
    const ev = await rows(sql`select e.version, e.details ->> 'result_digest' = s.result_digest as digest_ok, e.details ->> 'policy_version' as pv
      from shell.events e join shell.saved_searches s on s.saved_search_id = e.subject_id
      where e.principal_id = ${analyst.principalId}::uuid and e.event = 'shell.search.saved' and e.subject_kind = 'saved_search' order by e.occurred_at`);
    expect(ev).toEqual([{ version: 1, digest_ok: true, pv: 'bundle-v1' }, { version: 2, digest_ok: true, pv: 'bundle-v1' }]);
    const n = await one(sql`select (select count(*)::int from shell.events where principal_id = ${analyst.principalId}::uuid and event = 'shell.intent.recorded') as e,
      (select count(*)::int from shell.intent_records where principal_id = ${analyst.principalId}::uuid) as r`);
    expect(n['e']).toBe(n['r']);
  });
  it('the governed path: every save and record an audited write under its own action; every read an audited read', async () => {
    const a = await rows(sql`select action from audit.audit_events where action in ('shell.search.save', 'shell.search.read', 'shell.intent.record') and tenant_id = ${T}::uuid group by action order by action`);
    expect(a.map((x) => x['action'])).toEqual(['shell.intent.record', 'shell.search.read', 'shell.search.save']);
  });
});
