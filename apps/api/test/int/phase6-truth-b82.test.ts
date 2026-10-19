/**
 * CP-6 B82 §TS (migration 0121_b82_x_ts) — DISPLAY TRUTH: RECOMMENDED / CORRECTED / INDETERMINATE DERIVED IN A READ, NEVER STORED (F-P7-E-07:
 * TS-06, TS-08, TS-10, HX-02, UX-ADR-005, UX-ADR-009, REL-06, REL-07, UX-06-004, UX-06-005 and UX-06-006's journey fixtures), on a real
 * database with the product's own route (in process) and the world of `bootDecisionWorld`:
 *
 *   TS1 · THE SHAPE: objects.display_truth is one guarded read — STABLE, SECURITY DEFINER, its fixed search path, EXECUTE to eye_app and
 *         eye_commit only; gate22's machine classification reads it as a NON-MUTATOR; a read-only transaction answers it; no table, no header
 *         field, no truth_state value added (the nine stay).
 *   TS2 · RECOMMENDED (TS-06, UX-ADR-009): a recommendation reads RECOMMENDED whoever authored it — the Decision Agent's (agent_authored) and
 *         a named person's — with the constrained use "advisory, not a decision"; never DECIDED; a withdrawn one reads WITHDRAWN; it has one
 *         version (v2 → unknown_version).
 *   TS3 · CORRECTED (TS-08): the correction reads CORRECTED linked to the preserved original; the original keeps its stored state and says
 *         "superseded by correction v2" (corrected_by, constrained use).
 *   TS4 · INDETERMINATE (TS-10, HX-02): an open contradiction and one adjudicated "both stand" (both sides), an UNFIT mark (lifted by a later
 *         fit mark), a declared absence of a value the profile requires, a later WITHDRAWN version, a withdrawn cited input, a DECIDED version
 *         no human stands behind — each with its reason and the constrained use; §0's provenance stub (`unknown`) adds NO reason.
 *   TS5 · THE STATES DISTINCT (UX-ADR-005, REL-07): observed, asserted, extracted, inferred, assessed, synthetic, decided, disputed and
 *         withdrawn read as stored ("as stored") — the display never collapses one into another; lifecycle stays its own dimension.
 *   TS6 · UX-06-006's FIXTURES (ch6: cross-context leakage, stale projection, truth state, lifecycle, policy-filtered scope): an object of
 *         another domain is as unknown as one never recorded; a caller bound elsewhere is refused by the read; the read answers from the
 *         authoritative store (a correction admitted now is read at once — no projection lag); a lifecycle word never becomes a truth state; a
 *         role outside the readers is refused by the policy and the reader's access is audited.
 *   TS7 · THE ROUTE: POST …/display-truth — the order asked kept, malformed and oversized requests refused in the class form (422), the
 *         refusal nouns in the server's words.
 *
 * Every row here is SYNTHETIC fixture data (the analyst, the knowledge owner, the decision owner standing for L. Brandt, the Decision Agent
 * of bootDecisionWorld); the canonical versions, contradictions, fitness marks and recommendations a case needs are STATED superuser inserts
 * standing for their own ports (the B21 / B31 / B50 idiom — those ports are proved by their own harnesses). THREE CLAIMS: this harness is
 * CONSTRUCTION evidence only; the act is demonstrated operation; real acceptance (UX-06-006's signed package) is the shared recording path
 * at B111, then H3 — never claimed. The noun `display truth` is not mapped centrally yet (the integrator maps it): the route maps it itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, TRUTH_STATES, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DisplayTruthController } from '../../src/objects/truth/display-truth.controller.js';
import { B82_READS, DISPLAY_TRUTH_RULE_VERSION, DERIVED_DISPLAY_STATES, type DisplayTruthRow } from '../../src/graph/b82-seams.js';
import { APP_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82-truth-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Truth = DisplayTruthRow & { lifecycle: string; agent_authored: boolean };
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let dt: DisplayTruthController;
let analyst: AuthenticatedPrincipal; let knowledgeOwner: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal;
let D2 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;
const evidence = (caseName: string, e: unknown): void => console.log(`B82 TRUTH EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/** A refusal: the HTTP status (the route's own mapping, else the central one), the RAW message, the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};

/* ───────────── the read: directly (as the superuser — the definer read's own rules) and through the route ───────────── */
type Ref = { type: string; id: string; version: number };
const truthSql = async (refs: Ref[], tenant = T(), domain = D(), db: Db = h.su) =>
  (await sql<{ r: Truth[] }>`select objects.display_truth(${tenant}::uuid, ${domain}::uuid, ${JSON.stringify(refs)}::jsonb) as r`.execute(db)).rows[0]!.r;
const one1 = async (ref: Ref) => (await truthSql([ref]))[0]!;
const route = (as: AuthenticatedPrincipal, refs: unknown, domain = D()) => {
  const env = { ...h.env(as, 'objects.display_truth.read', 'OBJ', null, 'analysis'), domain_id: domain };
  return dt.read({ eyeEnvelope: env, eyePrincipal: as } as never, T(), domain, { payload: { refs } }) as Promise<{ truth: Truth[]; receipt: { policyDecisionId: string; auditSeq: number } }>;
};

/* ───────────── the planted world: canonical versions as their ports admit them (stated inserts) ───────────── */
interface Plant {
  type?: string; id?: string; version?: number; truth?: string; lifecycle?: string; correctionOf?: string | null; owner?: string; humanRefs?: string[];
  evidenceRefs?: string[]; sourceIds?: string[]; confidence?: unknown; uncertainty?: unknown; domain?: string; withdrawalReason?: string | null; synthetic?: boolean;
}
async function plant(o: Plant = {}): Promise<Ref> {
  const type = o.type ?? 'CLM'; const id = o.id ?? uuidv7(); const version = o.version ?? 1; const now = new Date().toISOString(); const truth = o.truth ?? 'asserted';
  const domain = o.domain ?? D();
  const payload: Row = { subject: 'Bab el-Mandeb transits (SYNTHETIC)', predicate: 'is', object_value: `v${version} (SYNTHETIC)` };
  const header: CanonicalHeader = {
    object_id: id, object_type: type, tenant_id: T(), domain_id: domain, scope: 'DOMAIN', object_version: String(version), lifecycle_state: (o.lifecycle ?? 'active') as CanonicalHeader['lifecycle_state'],
    owning_component: 'CP-INT-01', accountable_owner: o.owner ?? `principal:${analyst.principalId}`, source_object_ids: o.sourceIds ?? [], event_time: null, observation_time: now, valid_from: null,
    valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: truth as CanonicalHeader['truth_state'], synthetic_state: o.synthetic ?? truth === 'synthetic',
    confidence: (o.confidence ?? null) as CanonicalHeader['confidence'], uncertainty: (o.uncertainty ?? null) as CanonicalHeader['uncertainty'], evidence_refs: o.evidenceRefs ?? [],
    provenance_ref: null, method_ref: 'fixture-b82-ts@1', contradiction_refs: [], corroboration_refs: [], human_refs: o.humanRefs ?? [], classification: 'internal', purpose_scope: 'intelligence',
    rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`,
    ontology_ref: null, correction_of: o.correctionOf ?? null, supersedes: null, withdrawal_reason: o.withdrawalReason ?? null, audit_correlation_id: uuidv7(), content_ref: null,
  } as unknown as CanonicalHeader;
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
      observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, method_ref, contradiction_refs, corroboration_refs,
      human_refs, classification, purpose_scope, schema_ref, correction_of, withdrawal_reason, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, ${type}, ${T()}::uuid, ${domain}::uuid, 'DOMAIN', ${version}, ${header.lifecycle_state}, 'CP-INT-01', ${header.accountable_owner}, ${JSON.stringify(header.source_object_ids)}::jsonb,
            ${now}::timestamptz, clock_timestamp(), 'exact', 'trusted', ${truth}, ${header.synthetic_state}, ${o.confidence === undefined ? null : JSON.stringify(o.confidence)}::jsonb,
            ${o.uncertainty === undefined ? null : JSON.stringify(o.uncertainty)}::jsonb, ${JSON.stringify(header.evidence_refs)}::jsonb, 'fixture-b82-ts@1', '[]'::jsonb, '[]'::jsonb,
            ${JSON.stringify(header.human_refs)}::jsonb, 'internal', 'intelligence', ${`${type}@v1`}, ${header.correction_of}, ${header.withdrawal_reason}, ${header.audit_correlation_id}::uuid,
            ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  return { type, id, version };
}
const contradiction = async (a: Ref, b: Ref, state: 'open' | 'adjudicated', adjudication: string | null = null) =>
  sql`insert into intelligence.contradictions (contradiction_id, scope, tenant_id, domain_id, kind, a_object_id, a_version, b_object_id, b_version, subject, predicate, a_value, b_value, state,
        detected_by, adjudicated_by, adjudicated_at, adjudication, adjudication_reason, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'claim.value', ${a.id}::uuid, ${a.version}, ${b.id}::uuid, ${b.version}, 'Bab el-Mandeb transits', 'is', 'reduced', 'normal', ${state},
              ${analyst.principalId}::uuid, ${state === 'open' ? null : knowledgeOwner.principalId}::uuid, ${state === 'open' ? null : new Date().toISOString()}::timestamptz, ${adjudication},
              ${state === 'open' ? null : 'adjudicated on the fixture evidence (SYNTHETIC)'}, ${uuidv7()}::uuid)`.execute(h.su);
const fitnessMark = async (r: Ref, verdict: 'fit' | 'unfit') =>
  sql`insert into graph.product_fitness_marks (mark_id, scope, tenant_id, domain_id, object_type, object_id, object_version, object_digest, verdict, reasons, gaps, examined, truncated, rule_version,
        route, routed_to, note, marked_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${r.type}, ${r.id}::uuid, ${r.version}, ${'e'.repeat(64)}, ${verdict},
              ${verdict === 'unfit' ? ['incomplete_lineage'] : []}::text[], '[]'::jsonb, 3, false, 'b50-pv-fitness-1', ${verdict === 'unfit' ? 'recompute' : null},
              ${verdict === 'unfit' ? knowledgeOwner.principalId : null}::uuid, 'the fixture mark of the B82 truth harness (SYNTHETIC)', ${knowledgeOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
async function recommendation(pkg: string, v: number, authorKind: 'human' | 'agent', author: string, state: 'proposed' | 'withdrawn' = 'proposed'): Promise<string> {
  const id = uuidv7();
  await sql`insert into decision.recommendations (recommendation_id, scope, tenant_id, domain_id, package_id, version, option_key, what, for_whom, by_when, what_could_make_it_wrong,
        author_kind, author_principal_id, digest, state, withdrawn_by, withdrawn_at, withdrawal_reason, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${pkg}::uuid, ${v}, 'reroute', 'Reroute the magnets via the Cape (SYNTHETIC)', 'the Regensburg line (SYNTHETIC)', '2026-11-16',
              ${JSON.stringify([{ statement: 'the Cape transit takes longer than modelled (synthetic)' }])}::jsonb, ${authorKind}, ${author}::uuid, ${'f'.repeat(64)}, ${state},
              ${state === 'withdrawn' ? author : null}::uuid, ${state === 'withdrawn' ? new Date().toISOString() : null}::timestamptz, ${state === 'withdrawn' ? 'superseded by the owner\'s own (synthetic)' : null},
              ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
const codes = (t: Truth) => t.reasons.map((r) => r.code);
/* B82 integration: §PX's computed strength adds weak_provenance to a fixture with no recorded lineage — the reasons UNDER TEST, without it */
const own = (t: Parameters<typeof codes>[0]) => codes(t).filter((c) => c !== 'weak_provenance');
const reason = (t: { reasons: Array<{ code: string; detail?: string; ref?: string }> }, code: string) => t.reasons.find((x) => x.code === code);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  dt = h.app.get(DisplayTruthController);
  analyst = await h.humanWithSession(['domain_analyst'], 'b82-ts-analyst');
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b82-ts-k-mueller');
  brandt = await h.humanWithSession(['decision_owner', 'decision_authority'], 'b82-ts-l-brandt');
  outsider = await h.humanWithSession(['collection_agent'], 'b82-ts-outsider');
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T()}::uuid, ${`b82-ts-other-${D2.slice(-8)} (SYNTHETIC)`}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['domain_analyst'], 'b82-ts-foreign', 'DOMAIN', { domainId: D2 });
}, 900_000);

afterAll(async () => {
  await h?.close();
  rmSync(VAULT_DIR, { recursive: true, force: true });
}, 120_000);

describe('TS1 · the shape — one guarded read, nothing stored', () => {
  it('objects.display_truth: STABLE, SECURITY DEFINER, its fixed search path, jsonb; EXECUTE to eye_app and eye_commit, not PUBLIC; a non-mutator', async () => {
    const r = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_function_result(p.oid) res, pg_get_function_identity_arguments(p.oid) args,
      has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt,
      (p.prosrc ~* '(insert into|update |delete from|truncate |alter table|set_config|alter role)') as mutates
      from pg_proc p where p.oid = ${B82_READS.displayTruth.fn}::regprocedure`);
    expect(r).toMatchObject({ v: 's', d: true, cfg: 'search_path=objects, intelligence, graph, decision, identity, observation, pg_catalog, pg_temp', res: 'jsonb', pub: false, app: true, cmt: true, mutates: false });
    expect(r['args']).toBe('p_tenant uuid, p_domain uuid, p_refs jsonb');
  });
  it('no truth_state value, header field or table added: the CHECK keeps the nine stored states; the derived three are display states only', async () => {
    const chk = String((await one(sql`select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'objects' and t.relname = 'canonical_objects' and pg_get_constraintdef(c.oid) like '%truth_state%' and pg_get_constraintdef(c.oid) like '%observed%'`))['d']);
    for (const s of TRUTH_STATES) expect(chk).toContain(`'${s}'`);
    for (const s of DERIVED_DISPLAY_STATES) expect(chk).not.toContain(`'${s}'`);
    const cols = await one(sql`select count(*)::int n from information_schema.columns where table_schema = 'objects' and table_name = 'canonical_objects'`);
    expect(cols['n']).toBe(43 + 2);   // the 43 header fields + payload + content_digest — unchanged by B82
  });
  it('a read-only transaction answers it (it writes nothing)', async () => {
    const r = await plant();
    const out = await h.su.transaction().setAccessMode('read only').execute(async (tx) =>
      (await sql<{ r: Truth[] }>`select objects.display_truth(${T()}::uuid, ${D()}::uuid, ${JSON.stringify([r])}::jsonb) as r`.execute(tx)).rows[0]!.r);
    expect(out[0]).toMatchObject({ ref: `CLM:${r.id}@1`, stored: 'asserted', display: 'asserted', basis: 'as stored', rule_version: DISPLAY_TRUTH_RULE_VERSION, reasons: [] });
  });
});

describe('TS2 · RECOMMENDED — derived from the type, never decided (TS-06, UX-ADR-009, REL-06)', () => {
  let pkg = ''; let v = 0; let agentRec = ''; let humanRec = ''; let gone = '';
  it('the Decision Agent\'s recommendation and a named person\'s both read RECOMMENDED — advisory, not a decision; the agent\'s is marked agent-authored', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Regensburg routing (B82 truth harness, SYNTHETIC)', statement: 'reroute the magnets via the Cape, or not (synthetic)', owner: w.owner.principalId });
    pkg = d.package.packageId; v = (await c.open(pkg, {})).version.version;
    agentRec = await recommendation(pkg, v, 'agent', w.agent.principalId);
    humanRec = await recommendation(pkg, v, 'human', brandt.principalId);
    gone = await recommendation(pkg, v, 'human', brandt.principalId, 'withdrawn');
    const [a, hm, g] = await truthSql([{ type: 'REC', id: agentRec, version: 1 }, { type: 'REC', id: humanRec, version: 1 }, { type: 'REC', id: gone, version: 1 }]);
    expect(a).toMatchObject({ stored: 'asserted', display: 'recommended', agent_authored: true, lifecycle: 'proposed', correction_of: null, corrected_by: null });
    expect(a!.constrained_use).toMatch(/^advisory, not a decision/);
    expect(a!.reasons[0]).toMatchObject({ code: 'recommendation_type' });
    expect(a!.reasons[0]!.detail).toMatch(/the Decision Agent \(AI\)/);
    expect(hm).toMatchObject({ display: 'recommended', agent_authored: false });
    expect(hm!.reasons[0]!.detail).toMatch(/a named person/);
    expect(g).toMatchObject({ display: 'withdrawn', lifecycle: 'withdrawn' });
    evidence('TS2 recommended', { agent: a, human: hm, withdrawn: g });
  });
  it('a recommendation never reads DECIDED, even after it is accepted for consideration (the decision is the package\'s own record)', async () => {
    await sql`update decision.recommendations set state = 'accepted_for_consideration', decided_by = ${brandt.principalId}::uuid, decided_at = clock_timestamp() where recommendation_id = ${agentRec}::uuid`.execute(h.su);
    const a = await one1({ type: 'REC', id: agentRec, version: 1 });
    expect(a.display).toBe('recommended');
    expect(a.constrained_use).toMatch(/accepted FOR CONSIDERATION/);
  });
  it('a recommendation has one version; another tenant\'s or domain\'s is unknown', async () => {
    const r2 = await refusal(truthSql([{ type: 'REC', id: humanRec, version: 2 }]));
    expect(r2.message).toMatch(/^display truth rejected \(unknown_version\): a recommendation's content is immutable/); expect(r2.code).toBe('23503');
    const r3 = await refusal(truthSql([{ type: 'REC', id: humanRec, version: 1 }], T(), D2));
    expect(r3.message).toMatch(/^display truth rejected \(unknown_object\)/);
  });
});

describe('TS3 · CORRECTED — linked to the preserved original (TS-08)', () => {
  it('v2 corrects v1: v2 reads CORRECTED (correction_of v1); v1 keeps its stored state, superseded by correction v2', async () => {
    const id = uuidv7();
    const v1 = await plant({ id, version: 1, truth: 'extracted' });
    const v2 = await plant({ id, version: 2, truth: 'extracted', lifecycle: 'corrected', correctionOf: `${id}@1` });
    const [a, b] = await truthSql([v1, v2]);
    expect(b).toMatchObject({ stored: 'extracted', display: 'corrected', correction_of: `CLM:${id}@1`, corrected_by: null, lifecycle: 'corrected' });
    expect(b!.basis).toMatch(/correction of CLM:.*@1 \(linked; the original preserved\)/);
    expect(own(b!)).toEqual(['correction_of']);
    expect(a).toMatchObject({ stored: 'extracted', display: 'extracted', correction_of: null, corrected_by: `CLM:${id}@2` });
    expect(a!.constrained_use).toMatch(/^superseded by correction v2 — the preserved original/);
    evidence('TS3 corrected', { original: a, correction: b });
  });
});

describe('TS4 · INDETERMINATE — a required state that cannot be resolved (TS-10, HX-02)', () => {
  it('an OPEN contradiction makes both sides INDETERMINATE; "both stand" too; a withdrawn side resolves it', async () => {
    const a = await plant(); const b = await plant(); const x = await plant(); const y = await plant(); const p = await plant(); const q = await plant();
    await contradiction(a, b, 'open');
    await contradiction(x, y, 'adjudicated', 'both_stand');
    await contradiction(p, q, 'adjudicated', 'a_withdrawn');
    const [ta, tb, tx, ty, tp, tq] = await truthSql([a, b, x, y, p, q]);
    for (const t of [ta, tb, tx, ty]) { expect(t!.display).toBe('indeterminate'); expect(codes(t!)).toEqual(['contradiction']); expect(t!.constrained_use).toMatch(/^not for a decision-active use/); }
    expect(ta!.reasons[0]!.detail).toMatch(/is open — contradicted by CLM:/);
    expect(tx!.reasons[0]!.detail).toMatch(/adjudicated "both stand"/);
    expect(ta!.basis).toBe('stored ASSERTED; a required state cannot be resolved (contradiction) — shown INDETERMINATE');
    expect([tp!.display, tq!.display]).toEqual(['asserted', 'asserted']);
    evidence('TS4 contradiction', { open: ta, bothStand: tx });
  });
  it('an UNFIT mark makes the version INDETERMINATE; a later fit mark lifts it', async () => {
    const r = await plant({ truth: 'inferred' });
    await fitnessMark(r, 'unfit');
    const t = await one1(r);
    expect(t).toMatchObject({ stored: 'inferred', display: 'indeterminate' });
    expect(own(t)).toEqual(['unfit']);
    expect(reason(t, 'unfit')!.detail).toMatch(/^marked UNFIT \(incomplete_lineage\)/);
    await new Promise((res) => setTimeout(res, 5));
    await fitnessMark(r, 'fit');
    expect((await one1(r)).display).toBe('inferred');
  });
  it('a declared absence of a value the header profile requires (a claim\'s confidence, a forecast\'s uncertainty) reads INDETERMINATE', async () => {
    const clm = await plant({ confidence: { state: 'not_assessed', reason: 'the extraction did not assess it (synthetic)' } });
    const fct = await plant({ type: 'FCT', truth: 'inferred', uncertainty: { state: 'unknown', reason: 'no calibration recorded (synthetic)' } });
    const ok = await plant({ confidence: 0.8 });
    const [a, b, o] = await truthSql([clm, fct, ok]);
    expect(a).toMatchObject({ display: 'indeterminate' }); expect(codes(a!)).toEqual(['declared_absence']);
    expect(a!.reasons[0]!.detail).toMatch(/^confidence is a declared absence \(not_assessed: /);
    expect(b).toMatchObject({ display: 'indeterminate' }); expect(b!.reasons[0]!.detail).toMatch(/^uncertainty is a declared absence \(unknown: /);
    expect(o!.display).toBe('asserted');
  });
  it('a run whose v2 is WITHDRAWN: v1 reads INDETERMINATE (withdrawn since), v2 reads WITHDRAWN; a claim citing a withdrawn evidence version too', async () => {
    const id = uuidv7();
    const v1 = await plant({ type: 'SIM', id, version: 1, truth: 'synthetic' });
    const v2 = await plant({ type: 'SIM', id, version: 2, truth: 'withdrawn', lifecycle: 'withdrawn', withdrawalReason: 'the run rested on a superseded twin version (synthetic)' });
    const evd = await plant({ type: 'EVD', truth: 'withdrawn', lifecycle: 'withdrawn', withdrawalReason: 'withdrawn by its source (synthetic)' });
    const cites = await plant({ evidenceRefs: [`EVD:${evd.id}@1`] });
    const citesCurrent = await plant({ evidenceRefs: [`EVD:${evd.id}`] });
    const [a, b, cl, cc] = await truthSql([v1, v2, cites, citesCurrent]);
    expect(a).toMatchObject({ stored: 'synthetic', display: 'indeterminate' });
    expect(a!.reasons).toEqual([expect.objectContaining({ code: 'withdrawn_input', ref: `SIM:${id}@2` })]);
    expect(a!.reasons[0]!.detail).toMatch(/^the object was withdrawn at v2 .*: the run rested on a superseded twin version/);
    expect(b).toMatchObject({ stored: 'withdrawn', display: 'withdrawn' });
    expect(b!.constrained_use).toMatch(/^withdrawn: the run rested on/);
    expect(cl!.display).toBe('indeterminate'); expect(reason(cl!, 'withdrawn_input')).toMatchObject({ code: 'withdrawn_input', ref: `EVD:${evd.id}@1` });
    expect(cc!.display).toBe('indeterminate'); expect(cc!.reasons.find((x) => /\(its current version\) is WITHDRAWN/.test(x.detail ?? ''))).toBeTruthy();
    evidence('TS4 withdrawn', { v1: a, v2: b, citing: cl });
  });
  it('DECIDED with no recorded human behind it reads INDETERMINATE — an agent never decides; a person\'s decision reads DECIDED', async () => {
    const byAgent = await plant({ type: 'DEC', truth: 'decided', owner: `principal:${w.machinePrincipalId}`, humanRefs: [w.machinePrincipalId] });
    const byPerson = await plant({ type: 'DEC', truth: 'decided', owner: `principal:${brandt.principalId}`, humanRefs: [`principal:${brandt.principalId}`] });
    const [a, p] = await truthSql([byAgent, byPerson]);
    expect(a).toMatchObject({ stored: 'decided', display: 'indeterminate', agent_authored: true });
    expect(a!.reasons[0]).toMatchObject({ code: 'unresolvable' });
    expect(a!.reasons[0]!.detail).toMatch(/an agent never decides/);
    expect(p).toMatchObject({ stored: 'decided', display: 'decided', agent_authored: false, basis: 'as stored' });
  });
  /* B82 integration: §PX replaced §0's stub — the strength is COMPUTED; a planted claim with no recorded lineage reads weak or broken and
     the display truth carries weak_provenance as a REASON only (it never changes the displayed state by itself) */
  it('§PX\'s computed strength: a claim with no recorded lineage is weak or broken — weak_provenance is a reason, never a state', async () => {
    const r = await plant();
    const s = await one(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'CLM', ${r.id}::uuid, 1) ->> 'strength' as s`);
    expect(['weak', 'broken']).toContain(s['s']);
    const t = await one1(r);
    expect(codes(t)).toContain('weak_provenance');
  });
  it('precedence: a stored WITHDRAWN version stays WITHDRAWN even with an open contradiction (the reason kept for the record)', async () => {
    const a = await plant({ truth: 'withdrawn', lifecycle: 'withdrawn' }); const b = await plant();
    await contradiction(a, b, 'open');
    const t = await one1(a);
    expect(t.display).toBe('withdrawn'); expect(codes(t)).toEqual(['contradiction']);
    expect(t.basis).toMatch(/^stored WITHDRAWN stays withdrawn/);
  });
});

describe('TS5 · the states distinct — never collapsed (UX-ADR-005, REL-07)', () => {
  it('each of the nine stored states reads as itself ("as stored"); the display never turns observed / inferred / synthetic / decided into one another', async () => {
    const refs: Ref[] = [];
    for (const s of TRUTH_STATES) refs.push(await plant({ truth: s, ...(s === 'decided' ? { humanRefs: [`principal:${brandt.principalId}`] } : {}), lifecycle: s === 'withdrawn' ? 'withdrawn' : 'active' }));
    const out = await truthSql(refs);
    expect(out.map((t) => t.display)).toEqual([...TRUTH_STATES]);
    expect(out.map((t) => t.stored)).toEqual([...TRUTH_STATES]);
    expect(new Set(out.map((t) => t.display)).size).toBe(TRUTH_STATES.length);
    for (const t of out.filter((x) => x.stored !== 'withdrawn')) expect(t.basis).toBe('as stored');
  });
});

describe('TS6 · UX-06-006 — cross-context leakage, stale projection, truth state, lifecycle, policy-filtered scope (ch6 fixtures)', () => {
  it('CROSS-CONTEXT: an object of another domain named here is as unknown as one never recorded (no existence oracle)', async () => {
    const there = await plant({ domain: D2 });
    const a = await refusal(truthSql([there]));
    const b = await refusal(truthSql([{ type: 'CLM', id: uuidv7(), version: 1 }]));
    expect(a.message.replace(there.id, 'X')).toBe(b.message.replace(/CLM:[0-9a-f-]+@1/, `CLM:X@1`));
    expect(a.message).toMatch(/^display truth rejected \(unknown_object\)/);
    // the foreign domain's own analyst reads it there — and only there
    expect((await route(foreign, [there], D2)).truth[0]!.display).toBe('asserted');
    const r = await refusal(route(foreign, [there], D()));
    expect(r.status).toBe(403);
  });
  it('CROSS-CONTEXT: the runtime role bound to no scope (or another one) is refused by the read itself — read rejected (scope)', async () => {
    const app = h.app.get<Db>(APP_DB);
    const r = await refusal(sql`select objects.display_truth(${T()}::uuid, ${D()}::uuid, ${JSON.stringify([{ type: 'CLM', id: uuidv7(), version: 1 }])}::jsonb)`.execute(app));
    expect(r.message).toMatch(/^read rejected \(scope\): the display truth of a product is read only within the caller's bound tenant and domain/);
  });
  it('STALE PROJECTION: the read answers from the authoritative store — a correction admitted now is read at once (no projection watermark to lag)', async () => {
    const id = uuidv7();
    const v1 = await plant({ id, version: 1 });
    expect((await route(analyst, [v1])).truth[0]!.corrected_by).toBeNull();
    await plant({ id, version: 2, lifecycle: 'corrected', correctionOf: `${id}@1` });
    const now = (await route(analyst, [v1, { ...v1, version: 2 }])).truth;
    expect(now[0]!.corrected_by).toBe(`CLM:${id}@2`);
    expect(now[1]!.display).toBe('corrected');
  });
  it('LIFECYCLE: a lifecycle word never becomes a truth state — a lifecycle "corrected" with no correction_of reads as stored; lifecycle rides beside it', async () => {
    const r = await plant({ truth: 'observed', lifecycle: 'corrected' });
    const t = await one1(r);
    expect(t).toMatchObject({ stored: 'observed', display: 'observed', lifecycle: 'corrected', basis: 'as stored' });
  });
  it('POLICY-FILTERED SCOPE: a role outside the readers is refused by the policy (403, the server\'s words); the reader\'s access is audited', async () => {
    const r = await refusal(route(outsider, [{ type: 'CLM', id: uuidv7(), version: 1 }]));
    expect(r.status).toBe(403);
    const ok = await route(brandt, [await plant()]);
    expect(ok.truth[0]!.display).toBe('asserted');
    const aud = await one(sql`select action, outcome from audit.audit_events where audit_seq = ${ok.receipt.auditSeq} and tenant_id = ${T()}::uuid and action = 'objects.display_truth.read' limit 1`);
    expect(aud).toMatchObject({ action: 'objects.display_truth.read', outcome: 'success' });
    evidence('TS6 policy', { refused: r, receipt: ok.receipt });
  });
});

describe('TS7 · the route — order kept, refusals in the class form', () => {
  it('one row per ref, in the order asked', async () => {
    const a = await plant({ truth: 'observed' }); const b = await plant({ truth: 'inferred' }); const x = await plant({ truth: 'assessed' });
    const out = (await route(analyst, [x, a, b])).truth;
    expect(out.map((t) => t.ref)).toEqual([`CLM:${x.id}@1`, `CLM:${a.id}@1`, `CLM:${b.id}@1`]);
  });
  it('malformed, empty and oversized requests are refused (display truth rejected (refs) → 422) before any port runs', async () => {
    for (const bad of [[], [{ type: 'clm', id: uuidv7(), version: 1 }], [{ type: 'CLM', id: 'x', version: 1 }], [{ type: 'CLM', id: uuidv7(), version: 0 }], 'refs',
                       Array.from({ length: 201 }, () => ({ type: 'CLM', id: uuidv7(), version: 1 }))]) {
      const r = await refusal(route(analyst, bad));
      expect(r.status).toBe(422);
      expect(r.message).toMatch(/^display truth rejected \(refs\): /);
    }
    const s = await refusal(truthSql([{ type: 'CLM', id: uuidv7(), version: 1 }, { type: 'CLM', id: 'nope', version: 1 } as Ref]));
    expect(s.message).toMatch(/^display truth rejected \(refs\): ref 2 /); expect(s.code).toBe('22023');
  });
  it('an unknown object through the route is 404 in the server\'s words; an unknown version of a recorded object says so', async () => {
    const r = await refusal(route(analyst, [{ type: 'CLM', id: uuidv7(), version: 1 }]));
    expect(r.status).toBe(404); expect(r.message).toMatch(/^display truth rejected \(unknown_object\): CLM:/);
    const p = await plant();
    const v = await refusal(route(analyst, [{ ...p, version: 3 }]));
    expect(v.status).toBe(404); expect(v.message).toMatch(/^display truth rejected \(unknown_version\): .* that version is not/);
  });
});
