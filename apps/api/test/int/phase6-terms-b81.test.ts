/**
 * CP-6 B81 §CT (migration 0119_b81_x_ct; F-P7-E-18: UX-69-001…006, UX-ADR-021, GLB-20 (V8, V9), CNT-01…07/10/14/15/16) — THE GOVERNED
 * PRODUCT LANGUAGE on a real database through the real routes, pipeline and ports, with named humans holding sessions of their own (the ports
 * compare the acting principal). CONSTRUCTION evidence: every persona and term here is SYNTHETIC (labels carry the run's tag so a re-run on a
 * shared database never meets an earlier run's published term); an approval by a synthetic Design System Authority demonstrates the software
 * only (`claim = demonstration`); audience comprehension evidence and the independent conformance package are B111's shared path, then H3.
 *
 *   TR0 · THE CHECKS: the SQL reading grade, syllables and no-dilution rule EQUAL the shared fixtures (the TS copies assert the same); the
 *         SQL entry shape equals entryProblem message for message.
 *   TR1 · PROPOSE (UX-69-003/-004): a contributor's v1; refusals — dilution, implied certainty, the shape at the route, an honest agent (the
 *         human gate), an agent claiming a human session (the port), a principal without a contributor role (PDP), a stale version, an
 *         unknown cited term, a translation without provenance.
 *   TR2 · REVIEW (GLB-20): the proposer's self-review (separation of duties); an explanation above its audience's reading ceiling cannot be
 *         reviewed ready (reading_level) and is returned; a stale digest; the steward's ready review records the automated checks.
 *   TR3 · APPROVE: before review (state); the proposer (separation of duties); an agent claiming a human (actor); a contributor who is not the
 *         Design System Authority (PDP); the DSA approves.
 *   TR4 · PUBLISH (UX-69-005): a term citing an unpublished term is HELD; the citer published after; a conflicting label refused; the
 *         catalogue on PLATFORM, TENANT and DOMAIN routes; the artifact on B107's core (kind terminology, active).
 *   TR5 · CORRECT (CNT-14): propose on a published key refused; the correction (original / replacement / impact / action) reviewed, approved,
 *         published; the predecessor superseded and still readable; `design.term_corrected` ledgered.
 *   TR6 · TRANSLATION PROVENANCE (UX-69-005; a SYNTHETIC en-GB adaptation — no locale is added): published with provenance → `translated`;
 *         the English source corrected → `source_corrected`, the canonical English shown (the verified fallback); an untranslated key.
 *   TR7 · RETIRE: a term cited by a published term is HELD; retired; a retired key never re-proposed.
 *   TR8 · THE DOMAIN GLOSSARY (B90): linked by key and read BESIDE the term in a DOMAIN context — never merged (the glossary row unchanged).
 *   TR9 · dg-lint-3: the principle declared by the Design System Authority (B107's registry); planted sources NONCONFORMANT with regressions;
 *         the REAL web source within the committed ratchet; recorded under rules dg-lint-3.
 *   TR10 · BOUNDARIES: FORCE RLS, SELECT only, reviews append-only, versions never deleted and content-immutable, the no-dilution and claim
 *         CHECKs, drafts invisible to a tenant context; the ledger REPLAYS a term's history.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DesignPlatformController } from '../../src/governance/design/design.controller.js';
import { repoRoot } from '../../src/governance/design/design-source.js';
import { TermsDomainController, TermsPlatformController, TermsTenantController } from '../../src/governance/design/terms/terms.controller.js';
import { CONTENT_PRINCIPLE, CONTENT_PRINCIPLE_STATEMENT } from '../../src/governance/design/terms/content-lint.js';
import { entryProblem } from '../../src/governance/design/terms/terms-logic.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let pc: TermsPlatformController; let tc: TermsTenantController; let dc: TermsDomainController; let dgc: DesignPlatformController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const TAG = `T${RUN.toUpperCase()}`;
const K = (k: string) => `b81ct-${RUN}.${k}`;
const fx = JSON.parse(readFileSync(join(repoRoot()!, 'apps/web/lib/content-b81.fixtures.json'), 'utf8')) as Record<string, Array<Record<string, unknown>>>;

let author: AuthenticatedPrincipal;      // a contributor (product_authority) — proposes and corrects
let author2: AuthenticatedPrincipal;     // a second contributor (operations_authority)
let dsa: AuthenticatedPrincipal;         // the Design System Authority — approves, publishes, retires
let dsa2: AuthenticatedPrincipal;        // a second Design System Authority (proposes once: the separation-of-duties probe)
let steward: AuthenticatedPrincipal;     // the conformance steward — reviews
let machine: AuthenticatedPrincipal;     // an AGENT holding the design authority whose session claims a human (the PEP passes; the PORT refuses)
let agentAuthor: AuthenticatedPrincipal; // an honest AGENT holding product_authority (the human gate refuses)
let admin: AuthenticatedPrincipal;       // the platform administrator (no contributor role)
let tenantAdmin: AuthenticatedPrincipal; // a tenant's administrator (reads the published catalogue)
let collector: AuthenticatedPrincipal;   // a domain collection manager (reads the catalogue with the domain glossary)

async function person(label: string, kind: 'human' | 'agent', scope: Scope, roles: Array<{ role: string; scope: Scope }>, o: { claim?: 'human' | 'agent' } = {}): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : T(); const d = scope === 'DOMAIN' ? D() : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b81ct-${label}-${RUN} (SYNTHETIC)`}, ${`b81ct-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : T(), domainId: r.scope === 'DOMAIN' ? D() : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  const claim = o.claim ?? kind;
  return h.openSession({ ...h.manager, principalId: id, kind: claim === 'agent' ? 'agent' : 'human', assurance: claim === 'agent' ? 'agent_grant' : 'password', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}
const P = (role: string) => ({ role, scope: 'PLATFORM' as Scope });

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'governance', action,
           side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: 'TRM', object_id: null, schema_version: 'v1',
           issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b81-terms' } as unknown as Envelope;
}
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const treq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'TENANT', T(), null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'DOMAIN', T(), D()), eyePrincipal: p }) as never;
const W = async (p: Promise<unknown>) => (await p) as Row;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')) };
};
const DENIED = /no qualifying role binding|has no binding for this|no platform authority binding|human gate/;
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const n = async (q: ReturnType<typeof sql>) => Number((await one(q))['n'] ?? 0);
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

/** A SYNTHETIC entry: the label carries the run's tag; every explanation keeps the label and the protected word. */
const entry = (label: string, o: Row = {}): Row => ({
  category: 'truth_state', label, definition: 'Reviewed analytical judgment with uncertainty',
  explanations: { executive: `${label} means a reviewer has judged the evidence. The judgment can still be wrong. Read the uncertainty before you act.`,
                  analyst: `${label}: a reviewed analytical judgment. It states its uncertainty and its method.`,
                  operator: `${label} means a person checked it. There is still uncertainty.` },
  example: `A corridor claim marked ${label} (SYNTHETIC)`, protected: ['uncertainty'], synonyms: [], conditions: ['A named reviewer has reviewed the claim.'], cites: [], glossary_keys: [], ...o });

const propose = (as: AuthenticatedPrincipal, payload: Row) => W(pc.propose(preq(as, 'governance.design.term.propose'), { payload: { expectedVersion: 0, ...payload } }));
const preview = async (as: AuthenticatedPrincipal, id: string, version: number) => ((await W(pc.preview(preq(as, 'governance.design.term.read'), id, { payload: { version } })))['preview']) as Row;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.review(preq(as, 'governance.design.term.review'), id, { payload: { outcome: 'ready', notes: 'read against the checks (SYNTHETIC)', ...payload } }));
const approve = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.approve(preq(as, 'governance.design.term.approve'), id, { payload: { reason: 'the canonical term is right (SYNTHETIC)', ...payload } }));
const publish = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.publish(preq(as, 'governance.design.term.publish'), id, { payload: { reason: 'the canonical term goes into use (SYNTHETIC)', ...payload } }));
const correct = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.correct(preq(as, 'governance.design.term.correct'), id, { payload: { impact: 'claims marked with it are re-read (SYNTHETIC)', action: 'read the corrected definition (SYNTHETIC)', ...payload } }));
const retire = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.retire(preq(as, 'governance.design.term.retire'), id, { payload: { reason: 'the concept is no longer used (SYNTHETIC)', ...payload } }));
const digestOf = async (id: string, version: number) => String((await one(sql`select digest from governance.terms where term_id = ${id}::uuid and version = ${version}::int`))['digest']);
const stateOf = async (id: string, version: number) => String((await one(sql`select state from governance.terms where term_id = ${id}::uuid and version = ${version}::int`))['state']);
/** propose → review ready (steward) → approve → publish (dsa): the full governed path of one version. */
async function throughPublication(id: string, version: number) {
  await review(steward, id, { version, digest: await digestOf(id, version) });
  await approve(dsa, id, { version, digest: await digestOf(id, version) });
  return publish(dsa, id, { version, digest: await digestOf(id, version) });
}
const events = async (subject: string) => (await rows(sql`select event, version from governance.events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => `${String(r['event'])}@${String(r['version'])}`);
const catalogueP = async (locale = 'en') => W(pc.catalogue(preq(admin, 'governance.design.term.catalogue.read'), { payload: { locale } }));
const inCat = (cat: Row, key: string) => ((cat['terms'] ?? []) as Row[]).find((x) => x['key'] === key) ?? null;

let ASSESSED = ''; let ASSESSED_V = 1; let BASIS = ''; let CITER = ''; let GB = '';
const L_ASSESSED = `ASSESSED ${TAG}`;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  pc = h.app.get(TermsPlatformController); tc = h.app.get(TermsTenantController); dc = h.app.get(TermsDomainController); dgc = h.app.get(DesignPlatformController);
  author = await person('author', 'human', 'PLATFORM', [P('product_authority')]);
  author2 = await person('author2', 'human', 'PLATFORM', [P('operations_authority')]);
  dsa = await person('dsa', 'human', 'PLATFORM', [P('design_system_authority')]);
  dsa2 = await person('dsa2', 'human', 'PLATFORM', [P('design_system_authority')]);
  steward = await person('steward', 'human', 'PLATFORM', [P('conformance_steward')]);
  machine = await person('machine', 'agent', 'PLATFORM', [P('design_system_authority')], { claim: 'human' });
  agentAuthor = await person('agent-author', 'agent', 'PLATFORM', [P('product_authority')]);
  admin = await person('admin', 'human', 'PLATFORM', [P('platform_admin')]);
  tenantAdmin = await person('tadmin', 'human', 'TENANT', [{ role: 'tenant_admin', scope: 'TENANT' }]);
  collector = await person('collector', 'human', 'DOMAIN', [{ role: 'collection_manager', scope: 'DOMAIN' }]);
}, 600_000);
afterAll(async () => { await h?.close(); }, 120_000);

describe('TR0 · the checks: the SQL equals the shared fixtures and the TS entry shape', () => {
  it('the reading grade, the syllables and the no-dilution rule, value for value', async () => {
    for (const r of fx['readingGrade']!) expect(Number((await one(sql`select governance.term_reading_grade(${String(r['text'])})::float8 as g`))['g']), String(r['text'])).toBe(r['grade']);
    for (const s of fx['syllables']!) expect(Number((await one(sql`select governance.term_syllables(${String(s['word'])}) as n`))['n']), String(s['word'])).toBe(s['n']);
    for (const c of fx['dilution']!) {
      const v = (await one(sql`select governance.term_dilution_problem(${String(c['label'])}, ${String(c['definition'])}, ${c['protected'] as string[]}::text[], ${JSON.stringify(c['explanations'])}::jsonb) as p`))['p'];
      expect(v ?? null).toBe(c['problem']);
    }
    expect(await one(sql`select governance.term_reading_levels(${JSON.stringify({ operator: 'Go.', executive: String(fx['readingGrade']![0]!['text']) })}::jsonb) as l`)).toEqual({ l: { executive: 5.9, operator: 0 } });
  });
  it('the entry shape: governance.term_entry_problem equals entryProblem message for message', async () => {
    const base = entry(L_ASSESSED);
    const cases: unknown[] = [base, { ...base, category: 'x' }, { ...base, label: 'A' }, { ...base, definition: 'short' }, { ...base, explanations: { executive: (base['explanations'] as Row)['executive'] } },
      { ...base, explanations: { ...(base['explanations'] as Row), board: 'for the board, uncertainty' } }, { ...base, example: '' }, { ...base, protected: ['x'] },
      { ...base, synonyms: [L_ASSESSED.toLowerCase()] }, { ...base, conditions: ['short'] }, { ...base, cites: ['Bad Key'] }, { ...base, glossary_keys: ['AIS Position'] },
      { ...base, synonyms: Array.from({ length: 13 }, (_, i) => `syn ${i}`) }, 'not an object'];
    for (const c of cases) {
      const s = (await one(sql`select governance.term_entry_problem(${JSON.stringify(c)}::jsonb) as p`))['p'] ?? null;
      expect(s, JSON.stringify(c).slice(0, 80)).toBe(entryProblem(c));
    }
  });
});

describe('TR1 · propose (UX-69-003/-004): a contributor\'s v1; the refusals', () => {
  it('refusals before anything is written: dilution, implied certainty, the route\'s shape, the human gate, the port\'s actor check, the PDP, an unknown cite, a translation without provenance', async () => {
    const e = entry(L_ASSESSED);
    await refused(propose(author, { key: K('assessed'), entry: { ...e, explanations: { ...(e['explanations'] as Row), operator: `${L_ASSESSED} means a person checked it.` } } }), /\(dilution\): the operator explanation drops "uncertainty"/, 422);
    await refused(propose(author, { key: K('assessed'), entry: { ...e, explanations: { ...(e['explanations'] as Row), executive: `${L_ASSESSED} is final; uncertainty is gone.` } } }), /\(certainty\): the executive explanation implies certainty or authority \("final"\)/, 422);
    await refused(propose(author, { key: K('assessed'), entry: { ...e, example: '' } }), /design term rejected \(example\)/, 422);
    await refused(propose(agentAuthor, { key: K('assessed'), entry: e }), DENIED, 403);
    await refused(propose(machine, { key: K('assessed'), entry: e }), /design term rejected \(actor\)/, 403);
    await refused(propose(admin, { key: K('assessed'), entry: e }), DENIED, 403);
    await refused(propose(author, { key: K('assessed'), entry: { ...e, cites: [K('nothing')] } }), /\(unknown_term\): the cited term .* is not in the registry/, 404);
    await refused(propose(author, { key: K('assessed'), locale: 'en-GB', entry: e }), /\(translation\): a translation states its provenance/, 422);
    expect(await n(sql`select count(*)::int n from governance.terms where term_key = ${K('assessed')}`)).toBe(0);
  });
  it('v1 proposed: the reading grades measured IN THE PORT; a stale re-proposal refused; v2 supersedes the still-proposed v1', async () => {
    const r = (await propose(author, { key: K('assessed'), entry: entry(L_ASSESSED, { synonyms: [`judged ${TAG}`] }) }))['term'] as Row;
    ASSESSED = String(r['term_id']);
    expect(r).toMatchObject({ version: 1, state: 'proposed', claim: 'demonstration' });
    expect(Number((r['reading_levels'] as Row)['executive'])).toBe(Number((await one(sql`select governance.term_reading_grade(${String((entry(L_ASSESSED)['explanations'] as Row)['executive'])})::float8 as g`))['g']));
    await refused(propose(author, { key: K('assessed'), entry: entry(L_ASSESSED) }), /\(stale\): the term .* is at version 1, not 0/, 409);
    const v2 = (await propose(author2, { key: K('assessed'), expectedVersion: 1, entry: entry(L_ASSESSED, { synonyms: [`judged ${TAG}`] }) }))['term'] as Row;
    expect(v2).toMatchObject({ term_id: ASSESSED, version: 2 });
    ASSESSED_V = 2;
    expect(await stateOf(ASSESSED, 1)).toBe('superseded');
  });
});

describe('TR2 · review (GLB-20): the reading ceilings, separation of duties, the recorded checks', () => {
  it('the proposer never reviews; a stale digest is refused; a principal without the reviewer roles is refused by the PDP', async () => {
    await refused(review(author2, ASSESSED, { version: 2, digest: await digestOf(ASSESSED, 2) }), DENIED, 403);
    const own = (await propose(steward, { key: K('own-review'), entry: entry(`OWNREVIEW ${TAG}`) }))['term'] as Row;
    await refused(review(steward, String(own['term_id']), { version: 1, digest: await digestOf(String(own['term_id']), 1) }), /\(separation_of_duties\): reviewing a term is never done by its proposer/, 403);
    await refused(review(steward, ASSESSED, { version: 2, digest: 'f'.repeat(64) }), /\(stale\)/, 409);
  });
  it('an operator explanation above its ceiling is never reviewed ready; it is returned with the checks recorded', async () => {
    const hard = entry(`HARDREAD ${TAG}`, { explanations: { ...(entry(`HARDREAD ${TAG}`)['explanations'] as Row),
      operator: `HARDREAD ${TAG} denotes an institutionalised interdisciplinary determination incorporating considerable uncertainty and methodological qualification.` } });
    const t = (await propose(author, { key: K('hard-read'), entry: hard }))['term'] as Row;
    const id = String(t['term_id']);
    expect(Number((t['reading_levels'] as Row)['operator'])).toBeGreaterThan(8);
    await refused(review(steward, id, { version: 1, digest: await digestOf(id, 1) }), /\(reading_level\): operator grade [0-9.]+ > 8/, 422);
    const back = (await review(steward, id, { version: 1, digest: await digestOf(id, 1), outcome: 'changes_requested', notes: 'the operator explanation is too hard to read (SYNTHETIC)' }))['review'] as Row;
    expect(back).toMatchObject({ outcome: 'changes_requested', state: 'returned' });
    expect(((back['checks'] as Row)['reading'] as Row)['operator']).toMatchObject({ ceiling: 8, pass: false });
    await refused(approve(dsa, id, { version: 1, digest: await digestOf(id, 1) }), /\(state\): .* is returned, not reviewed ready/, 409);
  });
  it('the steward reviews v2 ready: the checks (no dilution, every grade within its ceiling, no unpublished cite) recorded on the review', async () => {
    const r = (await review(steward, ASSESSED, { version: 2, digest: await digestOf(ASSESSED, 2) }))['review'] as Row;
    expect(r).toMatchObject({ outcome: 'ready', state: 'reviewed' });
    expect(r['checks']).toMatchObject({ dilution: null, reading_pass: true, unpublished_cites: [], rules_version: 'b81-ct-terms-1' });
    expect(await one(sql`select reviewer_role from governance.term_reviews where term_id = ${ASSESSED}::uuid and term_version = 2`)).toEqual({ reviewer_role: 'conformance_steward' });
  });
});

describe('TR3 · approve: the Design System Authority — never the proposer, never an agent', () => {
  it('refusals: a DSA proposer approving its own term, an agent claiming a human, a contributor who is not the DSA (PDP); then the DSA approves', async () => {
    const own = (await propose(dsa2, { key: K('own-approval'), entry: entry(`OWNAPPROVE ${TAG}`) }))['term'] as Row;
    const oid = String(own['term_id']);
    await review(steward, oid, { version: 1, digest: await digestOf(oid, 1) });
    await refused(approve(dsa2, oid, { version: 1, digest: await digestOf(oid, 1) }), /\(separation_of_duties\): approving a canonical term is never done by its proposer/, 403);
    await refused(approve(machine, ASSESSED, { version: 2, digest: await digestOf(ASSESSED, 2) }), /design term rejected \(actor\)/, 403);
    await refused(approve(author, ASSESSED, { version: 2, digest: await digestOf(ASSESSED, 2) }), DENIED, 403);
    const p = await preview(dsa, ASSESSED, 2);
    expect((p['eligibility'] as Row)['approve']).toEqual([]);
    expect((await preview(author2, ASSESSED, 2) as Row)['eligibility']).toMatchObject({ approve: ['you do not hold design_system_authority', 'you proposed it — no self-approval'] });
    expect((await approve(dsa, ASSESSED, { version: 2, digest: String(p['digest']) }))['term']).toMatchObject({ state: 'approved' });
  });
});

describe('TR4 · publish (UX-69-005): held while a cited term is unpublished; the catalogue everywhere; the artifact', () => {
  it('BASIS cites the not-yet-published ASSESSED: HELD; ASSESSED published; then BASIS published', async () => {
    const b = (await propose(author, { key: K('basis'), entry: entry(`BASIS ${TAG}`, { category: 'concept', cites: [K('assessed')] }) }))['term'] as Row;
    BASIS = String(b['term_id']);
    await review(steward, BASIS, { version: 1, digest: await digestOf(BASIS, 1) });
    await approve(dsa, BASIS, { version: 1, digest: await digestOf(BASIS, 1) });
    await refused(publish(dsa, BASIS, { version: 1, digest: await digestOf(BASIS, 1) }), /\(held\): .* cites .*assessed — a publication citing an unpublished term is held/, 409);
    const pub = (await publish(dsa, ASSESSED, { version: 2, digest: await digestOf(ASSESSED, 2) }))['term'] as Row;
    expect(pub).toMatchObject({ state: 'published', supersedes: null, claim: 'demonstration' });
    expect((await publish(dsa, BASIS, { version: 1, digest: await digestOf(BASIS, 1) }))['term']).toMatchObject({ state: 'published' });
    CITER = BASIS;
  });
  it('a conflicting label (or a label that is another term\'s synonym) is refused — one canonical term per concept', async () => {
    await refused(propose(author, { key: K('assessed-dup'), entry: entry(L_ASSESSED) }), /\(conflict\): the label or a synonym .* is already the published term/, 409);
    await refused(propose(author, { key: K('judged'), entry: entry(`judged ${TAG}`, { protected: [] }) }), /\(conflict\)/, 409);
  });
  it('the catalogue on a PLATFORM, a TENANT and a DOMAIN route; drafts never in it; the content version; the artifact active on B107\'s core', async () => {
    const cat = await catalogueP();
    expect(inCat(cat, K('assessed'))).toMatchObject({ mark: 'canonical', fallback: false, entry: { label: L_ASSESSED, version: 2, state: 'published' } });
    expect(inCat(cat, K('hard-read'))).toBeNull();
    expect((cat['content_version'] as Row)['value']).toMatch(/^[0-9a-f]{64}$/);
    const tcat = await W(tc.catalogue(treq(tenantAdmin, 'governance.design.term.catalogue.read'), T(), { payload: {} }));
    expect(inCat(tcat, K('assessed'))).toMatchObject({ mark: 'canonical' });
    const dcat = await W(dc.catalogue(dreq(collector, 'governance.design.term.catalogue.read'), T(), D(), { payload: {} }));
    expect(inCat(dcat, K('basis'))).toMatchObject({ entry: { cites: [K('assessed')] } });
    expect(await one(sql`select kind, lifecycle, external_key, scope from governance.artifacts where artifact_id = ${ASSESSED}::uuid and superseded_at is null`))
      .toEqual({ kind: 'terminology', lifecycle: 'active', external_key: `TERM:${K('assessed')}@en`, scope: 'PLATFORM' });
    const reg = await W(pc.read(preq(dsa, 'governance.design.term.read')));
    expect((reg['terms'] as Row[]).some((x) => x['term_key'] === K('hard-read') && x['state'] === 'returned')).toBe(true);
    await refused(W(pc.read(preq(tenantAdmin, 'governance.design.term.read'))), DENIED, 403);
  });
});

describe('TR5 · correct (CNT-14): original / replacement / impact / action', () => {
  it('a published key is never re-proposed; the correction runs the governed path; the original is superseded and stays readable', async () => {
    await refused(propose(author, { key: K('assessed'), expectedVersion: 2, entry: entry(L_ASSESSED) }), /\(state\): .* is published — a published term changes only through a correction/, 409);
    await refused(correct(author, ASSESSED, { expectedVersion: 2, entry: entry(L_ASSESSED, { synonyms: [`judged ${TAG}`] }) }), /\(correction\): the replacement changes nothing/, 422);
    const fixed = entry(L_ASSESSED, { definition: 'Reviewed analytical judgment with stated uncertainty and a named method', synonyms: [`judged ${TAG}`] });
    const c = (await correct(author, ASSESSED, { expectedVersion: 2, entry: fixed }))['term'] as Row;
    expect(c).toMatchObject({ version: 3, corrects_version: 2, correction: { original: { version: 2, label: L_ASSESSED, definition: 'Reviewed analytical judgment with uncertainty' },
      replacement: { definition: 'Reviewed analytical judgment with stated uncertainty and a named method' }, impact: 'claims marked with it are re-read (SYNTHETIC)' } });
    expect(inCat(await catalogueP(), K('assessed'))).toMatchObject({ entry: { version: 2 } });   // the original stays in force until the correction is published
    ASSESSED_V = 3;
  });
});

describe('TR6 · translation provenance (UX-69-005): translated, source_corrected, untranslated', () => {
  it('a SYNTHETIC en-GB adaptation of v2 with provenance is published → `translated`; the en correction published → `source_corrected` (the canonical English shown)', async () => {
    await refused(propose(author, { key: K('assessed'), locale: 'en-GB', entry: { ...entry(L_ASSESSED), translation: { from_term: ASSESSED, from_version: 1, method: 'human' } } }), /\(stale\): .* v1 is superseded, not the published English term/, 409);
    const g = (await propose(author, { key: K('assessed'), locale: 'en-GB', entry: { ...entry(L_ASSESSED, { example: `A corridor claim marked ${L_ASSESSED} — en-GB (SYNTHETIC)` }), translation: { from_term: ASSESSED, from_version: 2, method: 'human' } } }))['term'] as Row;
    GB = String(g['term_id']);
    await throughPublication(GB, 1);
    expect(inCat(await catalogueP('en-GB'), K('assessed'))).toMatchObject({ mark: 'translated', fallback: false, entry: { locale: 'en-GB' }, translation: { from_version: 2, method: 'human' } });
    expect(inCat(await catalogueP('en-GB'), K('basis'))).toMatchObject({ mark: 'untranslated', fallback: true, entry: { locale: 'en' } });
    const pub = (await throughPublication(ASSESSED, 3))['term'] as Row;
    expect(pub).toMatchObject({ version: 3, supersedes: 2, stale_translations: [{ term_id: GB, version: 1, locale: 'en-GB' }] });
    expect(inCat(await catalogueP('en-GB'), K('assessed'))).toMatchObject({ mark: 'source_corrected', fallback: true, entry: { locale: 'en', version: 3 } });
    expect(await stateOf(ASSESSED, 2)).toBe('superseded');
    const ev = await one(sql`select details from governance.events where subject_id = ${ASSESSED}::uuid and event = 'design.term_corrected'`);
    expect((ev['details'] as Row)['correction']).toMatchObject({ original: { version: 2 }, action: 'read the corrected definition (SYNTHETIC)' });
  });
});

describe('TR7 · retire: held while cited; never re-proposed', () => {
  it('ASSESSED is cited by BASIS: held; BASIS retired (by the DSA; an agent and a contributor refused); a retired key is never re-proposed', async () => {
    await refused(retire(dsa, ASSESSED, { version: 3 }), /\(held\): .* is cited by the published term\(s\) .*basis/, 409);
    await refused(retire(author, BASIS, { version: 1 }), DENIED, 403);
    await refused(retire(machine, BASIS, { version: 1 }), /\(actor\)/, 403);
    expect((await retire(dsa, BASIS, { version: 1 }))['term']).toMatchObject({ state: 'retired', was: 'published' });
    await refused(retire(dsa, BASIS, { version: 1 }), /\(state\): .* is already retired/, 409);
    await refused(propose(author, { key: K('basis'), expectedVersion: 1, entry: entry(`BASIS ${TAG}`, { category: 'concept' }) }), /\(state\): the term .* is retired — a retired term is never re-proposed/, 409);
    expect(inCat(await catalogueP(), K('basis'))).toBeNull();
  });
});

describe('TR8 · the domain glossary (B90): linked by key, read beside, never merged', () => {
  it('a term linking the domain\'s glossary key shows the domain entry beside it in a DOMAIN context; nothing outside one; the glossary row unchanged', async () => {
    const gid = uuidv7(); const gkey = `ais position ${RUN}`;
    await sql`insert into products.glossary_terms (term_id, scope, tenant_id, domain_id, term, term_key, definition, owner_principal_id, defined_by, correlation_id)
      values (${gid}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`AIS position ${RUN}`}, ${gkey}, 'A vessel position report from the AIS feed (SYNTHETIC)', ${collector.principalId}::uuid, ${collector.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const before = await one(sql`select to_jsonb(g) as g from products.glossary_terms g where term_id = ${gid}::uuid`);
    const t = (await propose(author, { key: K('position'), entry: entry(`POSITION ${TAG}`, { category: 'object', glossary_keys: [gkey] }) }))['term'] as Row;
    await throughPublication(String(t['term_id']), 1);
    const dcat = await W(dc.catalogue(dreq(collector, 'governance.design.term.catalogue.read'), T(), D(), { payload: {} }));
    const row = inCat(dcat, K('position'))!;
    expect(row['domain_glossary']).toEqual([expect.objectContaining({ term_id: gid, term_key: gkey, definition: 'A vessel position report from the AIS feed (SYNTHETIC)' })]);
    expect((row['entry'] as Row)['definition']).toBe('Reviewed analytical judgment with uncertainty');
    expect(inCat(await catalogueP(), K('position'))!['domain_glossary']).toBeNull();
    expect(await one(sql`select to_jsonb(g) as g from products.glossary_terms g where term_id = ${gid}::uuid`)).toEqual(before);
  });
});

describe('TR9 · dg-lint-3 through B107\'s principle registry and evaluation port', () => {
  it('the content principle declared by the Design System Authority; planted sources NONCONFORMANT with regressions; the real source within the ratchet', async () => {
    const cur = Number((await one(sql`select coalesce(max(version), 0)::int as v from governance.design_principles where principle_key = ${CONTENT_PRINCIPLE}`))['v']);
    if (cur === 0) {
      await W(dgc.declarePrinciple(preq(dsa, 'governance.design.principle.declare'), { payload: { key: CONTENT_PRINCIPLE, expectedVersion: 0, kind: 'principle', statement: CONTENT_PRINCIPLE_STATEMENT,
        patterns: [], remediation: 'correct the label, the error text, the explanation or the title; else record a narrow, expiring design exception',
        reason: 'B81 §CT: dg-lint-3 evidences this principle (SYNTHETIC harness)' } }));
    }
    const files = [{ path: 'apps/web/app/demo/page.tsx', text: "<GovernedButton label=\"Continue\" pendingLabel=\"x\" onRun={go} />\n<h1>Manage things</h1>\n" }];
    const r = await W(pc.lint(preq(dsa, 'governance.design.evaluate'), { payload: { files } }));
    expect(r['evaluation']).toMatchObject({ verdict: 'nonconformant', open: 2, counts: { 'verb-object': 1, 'title-noun-phrase': 1 } });
    expect((r['ratchet'] as Row)).toMatchObject({ holds: false, current: 2 });
    await refused(W(pc.lint(preq(tenantAdmin, 'governance.design.evaluate'), { payload: { files } })), DENIED, 403);
    const real = await W(pc.lint(preq(steward, 'governance.design.evaluate'), {}));
    expect(real['ratchet']).toMatchObject({ holds: true, regressions: [] });
    expect(Number((real['evaluation'] as Row)['files'])).toBeGreaterThan(100);
    expect(await one(sql`select rules_version, source from governance.design_evaluations where evaluation_id = ${(real['evaluation'] as Row)['evaluation_id']}::uuid`)).toEqual({ rules_version: 'dg-lint-3', source: 'lint' });
  });
});

describe('TR10 · boundaries: RLS, grants, append-only, immutability, the CHECKs, the ledger (REPLAY)', () => {
  it('FORCE RLS on both tables; SELECT only; the ports executable by eye_commit alone, the catalogue by both runtime roles', async () => {
    expect(await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'governance'
      and c.relname in ('terms', 'term_reviews') order by 1`)).toEqual([{ t: 'term_reviews', f: true }, { t: 'terms', f: true }]);
    expect(await n(sql`select count(*)::int n from information_schema.role_table_grants where table_schema = 'governance' and table_name in ('terms', 'term_reviews')
      and grantee in ('eye_app', 'eye_commit') and privilege_type <> 'SELECT'`)).toBe(0);
    expect(await one(sql`select has_function_privilege('eye_app', 'governance.term_publish(uuid, int, text, text, uuid, uuid)', 'EXECUTE') as app,
      has_function_privilege('eye_commit', 'governance.term_publish(uuid, int, text, text, uuid, uuid)', 'EXECUTE') as cmt,
      has_function_privilege('eye_app', 'governance.term_catalogue(text)', 'EXECUTE') as cat`)).toEqual({ app: false, cmt: true, cat: true });
  });
  it('a TENANT context sees published history only — never a draft, a return or a review', async () => {
    const seen = await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() },
      'governance.design.term.catalogue.read', uuidv7(), async (tx) =>
        (await sql<{ s: string }>`select distinct state as s from governance.terms where term_key like ${`b81ct-${RUN}.%`} order by 1`.execute(tx as never)).rows.map((x) => x.s));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => ['published', 'superseded', 'retired'].includes(x)), seen.join(',')).toBe(true);
    expect(await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() },
      'governance.design.term.catalogue.read', uuidv7(), async (tx) => (await sql<{ n: number }>`select count(*)::int as n from governance.term_reviews`.execute(tx as never)).rows[0]!.n)).toBe(0);
    expect(await n(sql`select count(*)::int n from governance.terms where term_key like ${`b81ct-${RUN}.%`} and state in ('proposed', 'returned', 'reviewed', 'approved')`)).toBeGreaterThan(0);
  });
  it('reviews are append-only; a version is never deleted and its content never changes; the CHECKs hold', async () => {
    expect(await failure(sql`update governance.term_reviews set outcome = 'ready' where term_id = ${ASSESSED}::uuid`)).toMatch(/append-only|not permitted|immutable/i);
    expect(await failure(sql`delete from governance.terms where term_id = ${ASSESSED}::uuid`)).toMatch(/never deleted/);
    expect(await failure(sql`update governance.terms set definition = 'Planted definition (SYNTHETIC)' where term_id = ${ASSESSED}::uuid and version = 3`)).toMatch(/content is immutable/);
    expect(await failure(sql`insert into governance.terms (term_id, version, term_key, category, label, definition, explanations, example, reading_levels, rules_version, digest, proposed_by, correlation_id)
      values (${uuidv7()}::uuid, 1, ${K('planted')}, 'concept', 'PLANTED', 'A planted term (SYNTHETIC)', '{"analyst":"no label here at all","executive":"PLANTED fine","operator":"PLANTED fine"}'::jsonb,
              'An example (SYNTHETIC)', '{}'::jsonb, 'x', ${'0'.repeat(64)}, ${author.principalId}::uuid, ${uuidv7()}::uuid)`)).toMatch(/gtm_no_dilution|gtm_entry/);
    expect(await failure(sql`insert into governance.terms (term_id, version, term_key, category, label, definition, explanations, example, reading_levels, rules_version, digest, proposed_by, correlation_id, claim)
      values (${uuidv7()}::uuid, 1, ${K('planted2')}, 'concept', 'PLANTED', 'A planted term (SYNTHETIC)', '{"analyst":"PLANTED fine","executive":"PLANTED fine","operator":"PLANTED fine"}'::jsonb,
              'An example (SYNTHETIC)', '{}'::jsonb, 'x', ${'0'.repeat(64)}, ${author.principalId}::uuid, ${uuidv7()}::uuid, 'accepted')`)).toMatch(/claim_check|violates check/);
  });
  it('REPLAY: the ledger reconstructs the term\'s history in order', async () => {
    expect(await events(ASSESSED)).toEqual(['design.term_proposed@1', 'design.term_proposed@2', 'design.term_reviewed@2', 'design.term_approved@2', 'design.term_published@2',
      'design.term_correction_proposed@3', 'design.term_reviewed@3', 'design.term_approved@3', 'design.term_published@3', 'design.term_corrected@3']);
  });
});
