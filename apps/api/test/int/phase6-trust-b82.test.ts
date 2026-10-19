/**
 * CP-6 B82 §PX (migration 0121_b82_x_px) — PROVENANCE STRENGTH, THE TRUST ENVELOPE, VERIFY / ATTEST / INVESTIGATE (F-P7-E-07 ch27 + ch57:
 * UX-27-004/005/006, UX-57-001…006, CMP-022, CMP-029, WS-18; F-P7-E-01: C-047) on a real database through the real pipeline, the PDP, the
 * ports and the controller. CONSTRUCTION evidence only: every persona, product, signature and statement here is SYNTHETIC.
 *
 *   PX1 · THE STRENGTH (§0's stub replaced whole): the same signature, volatility, security, search path and grants; strong on a clean
 *         path; WEAK on an unfit mark or an unresolved citation; BROKEN on an integrity gap (an evidence version with no manifest and no
 *         custody); PARTIAL on a withdrawn input (a run whose later version is withdrawn); a correction's own original is not an input
 *         change; truncation, an undigested model call and an unsigned approval read PARTIAL (the rule over a stated explanation); the
 *         malformed subject 422, an unknown object 404, another domain's object 404, an unbound caller refused. §TS's display truth now
 *         carries `weak_provenance` for weak and broken, and BROKEN reads INDETERMINATE (the integration of the two reads).
 *   PX2 · THE ENVELOPE (UX-57-001/002/005, CMP-022): eight facets, never a score (no numeric trust field anywhere in the answer); every
 *         facet's outcome in words; TRUST INDETERMINATE with the reasons and the constrained use when a facet failed or could not be
 *         verified; the digest stable across reads and moved by an attestation; the route audited under graph.trust.read; a role outside
 *         the readers refused.
 *   PX3 · VERIFY (UX-57-003/005/006 — signature, lineage, custody, correction, evaluation, policy, tamper, unavailable verification): the
 *         signature facet verified with the deployment's key per recorded signature — VERIFIED, FAILED (a tampered signature under the key
 *         on file) and UNAVAILABLE (a key not on file — never failed); the server computes every other facet; recorded append-only;
 *         replayed; an agent refused by the human gate; the port outside the pipeline refused.
 *   PX4 · ATTEST (UX-57-004, DESIGN D11): a person's statement bound to the envelope digest — the owner and a producer refused
 *         (separation_of_duties), an agent refused, a reader outside the attesters refused, a stale digest refused (409), a duplicate refused,
 *         the replay answered; withdrawal by its maker only, once; an attestation changes no facet and enables no command.
 *   PX5 · INVESTIGATE: an attention item of the class `trust_investigation` to the product's owner; a repeat answers it; the class list
 *         and the CHECK widened by union (earlier classes kept); an unknown subject 404.
 *   PX6 · THE OVERVIEW (WS-18): products with their strength, models, agents, rights, denials, exceptions, contest, investigations,
 *         attestations, verifications; its scope validated.
 *   PX7 · UX-27's HUMAN-AUTHORITY BOUNDARY (UX-27-004/005): confidence never promotes a display state (a high-confidence claim reads as
 *         stored, never DECIDED); conflicting labels (an open contradiction) read INDETERMINATE with the weak provenance kept as a reason;
 *         RLS, grants and append-only on the three ledgers.
 *
 * THREE CLAIMS: this harness is CONSTRUCTION evidence; the act is demonstrated operation; UX-27-006 / UX-57-006's signed package is B111's
 * shared recording path, then H3 — never claimed. The canonical versions, fitness marks, signatures and policy decisions a case needs are
 * STATED superuser inserts standing for their own ports (the B21 / B31 / B50 / §TS idiom — those ports are proved by their own harnesses).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync, sign as cryptoSign, createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { TrustController } from '../../src/graph/trust/trust.controller.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { B82_READS, PROVENANCE_STRENGTH_RULE_VERSION, TRUST_ENVELOPE_RULE_VERSION, TRUST_FACETS } from '../../src/graph/b82-seams.js';
import { APP_DB, COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82-px-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
// THE DEPLOYMENT'S SIGNING KEY for this harness (SYNTHETIC; generated here, never stored)
const KEYS = generateKeyPairSync('ed25519');
process.env[new SignatureService().ref()] = KEYS.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const KEY_ID = `ed25519:${createHash('sha256').update(KEYS.publicKey.export({ format: 'der', type: 'spki' })).digest('hex').slice(0, 16)}`;

type Row = Record<string, unknown>;
type Ref = { type: string; id: string; version: number };
let h: Phase4Harness; let tc: TrustController;
let T = ''; let D = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let auditor: AuthenticatedPrincipal;   // E. Lindqvist's role in the act (auditor at TENANT) — here a SYNTHETIC fixture person
let steward: AuthenticatedPrincipal;   // data_steward — verifies, attests
let owner: AuthenticatedPrincipal;     // decision_owner — L. Brandt's role: the products' accountable owner (never attests his own)
let producer: AuthenticatedPrincipal;  // domain_analyst named on a product (human_refs) — never attests it
let outsider: AuthenticatedPrincipal;  // collection_manager — reads trust, never attests
let agent: AuthenticatedPrincipal;     // an AGENT holding auditor-like roles (the PEP's human gate refuses it)
const evidence = (caseName: string, e: unknown): void => console.log(`B82 TRUST EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as Row)['message'] ?? e.message) };
  const m = asObservationRefusal(e, 'harness');
  return { status: m?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const rq = (p: AuthenticatedPrincipal, action: string, type = 'TRS', id: string | null = null) => h.req(p, action, type, id, 'graph');

/* ── the routes ── */
const envelope = (as: AuthenticatedPrincipal, r: Ref) => tc.envelope(rq(as, 'graph.trust.read', r.type, r.id), T, D, { payload: { ...r } }) as unknown as Promise<{ envelope: Row & { facets: Row[]; digest: string; provenance: Row; attestations: Row[]; reasons: Row[]; indeterminate: boolean }; receipt: Row }>;
const strengthRoute = (as: AuthenticatedPrincipal, r: Ref) => tc.strength(rq(as, 'graph.trust.read', r.type, r.id), T, D, { payload: { ...r } }) as unknown as Promise<{ strength: Row; receipt: Row }>;
const overview = (as: AuthenticatedPrincipal, payload: Row = {}) => tc.overview(rq(as, 'graph.trust.read'), T, D, { payload }) as unknown as Promise<{ overview: Row; receipt: Row }>;
const verify = (as: AuthenticatedPrincipal, r: Ref, facet: string, requestId = uuidv7()) =>
  tc.verify(rq(as, 'graph.trust.verify', r.type, r.id), T, D, { payload: { ...r, facet, requestId } }) as unknown as Promise<{ verification: Row; receipt: Row }>;
const attest = (as: AuthenticatedPrincipal, r: Ref, digest: string, over: Row = {}) =>
  tc.attest(rq(as, 'graph.trust.attest', r.type, r.id), T, D, { payload: { ...r, requestId: uuidv7(), facets: ['lineage', 'custody'], envelopeDigest: digest,
    statement: 'I inspected the backward path and the custody of each evidence version (SYNTHETIC harness)', ...over } }) as unknown as Promise<{ attestation: Row; receipt: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason = 'the inspection is to be repeated on the corrected version (SYNTHETIC)', requestId = uuidv7()) =>
  tc.withdraw(rq(as, 'graph.trust.withdraw', 'TAT', id), T, D, id, { payload: { requestId, reason } }) as unknown as Promise<{ attestation: Row; receipt: Row }>;
const investigate = (as: AuthenticatedPrincipal, r: Ref, facet: string | null, itemId = uuidv7()) =>
  tc.investigate(rq(as, 'graph.trust.investigate', r.type, r.id), T, D, { payload: { ...r, itemId, facet, note: 'the run this rests on was withdrawn since (SYNTHETIC harness)' } }) as unknown as Promise<{ investigation: Row; receipt: Row }>;
const strengthSql = async (r: Ref, domain = D) => (await one(sql`select graph.provenance_strength(${T}::uuid, ${domain}::uuid, ${r.type}, ${r.id}::uuid, ${r.version}::int) as s`))['s'] as Row & { strength: string; reasons: Array<{ code: string; detail: string }> };
const truth = async (r: Ref) => ((await one(sql`select objects.display_truth(${T}::uuid, ${D}::uuid, ${JSON.stringify([r])}::jsonb) as t`))['t'] as Array<Row & { display: string; reasons: Array<{ code: string; detail: string }> }>)[0]!;
const codes = (x: { reasons: Array<{ code: string }> }) => x.reasons.map((r) => r.code);

/* ── the planted world (stated inserts standing for their ports) ── */
interface Plant { type?: string; id?: string; version?: number; truth?: string; lifecycle?: string; correctionOf?: string | null; owner?: string; humanRefs?: string[];
  evidenceRefs?: string[]; sourceIds?: string[]; confidence?: unknown; payload?: Row; domain?: string; freshness?: Row | null }
async function plant(o: Plant = {}): Promise<Ref> {
  const type = o.type ?? 'CLM'; const id = o.id ?? uuidv7(); const version = o.version ?? 1; const now = new Date().toISOString(); const truthState = o.truth ?? 'asserted';
  const domain = o.domain ?? D;
  const payload: Row = o.payload ?? { title: `${type} v${version} (SYNTHETIC harness ${RUN})`, subject: 'Bab el-Mandeb transits (SYNTHETIC)' };
  const header = {
    object_id: id, object_type: type, tenant_id: T, domain_id: domain, scope: 'DOMAIN', object_version: String(version), lifecycle_state: o.lifecycle ?? 'active',
    owning_component: 'CP-INT-01', accountable_owner: o.owner ?? `principal:${owner.principalId}`, source_object_ids: o.sourceIds ?? [], event_time: null, observation_time: now, valid_from: null,
    valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: truthState, synthetic_state: true,
    confidence: o.confidence ?? null, uncertainty: null, evidence_refs: o.evidenceRefs ?? [], provenance_ref: null, method_ref: 'fixture-b82-px@1', contradiction_refs: [], corroboration_refs: [],
    human_refs: o.humanRefs ?? [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: o.freshness ?? null, schema_ref: `${type}@v1`, ontology_ref: null, correction_of: o.correctionOf ?? null, supersedes: null,
    withdrawal_reason: o.lifecycle === 'withdrawn' ? 'withdrawn by its owner (SYNTHETIC)' : null, audit_correlation_id: uuidv7(), content_ref: null,
  } as unknown as CanonicalHeader;
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
      observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, evidence_refs, method_ref, contradiction_refs, corroboration_refs,
      human_refs, classification, purpose_scope, schema_ref, correction_of, withdrawal_reason, audit_correlation_id, payload, content_digest, freshness_state)
    values (${id}::uuid, ${type}, ${T}::uuid, ${domain}::uuid, 'DOMAIN', ${version}, ${header.lifecycle_state}, 'CP-INT-01', ${header.accountable_owner}, ${JSON.stringify(header.source_object_ids)}::jsonb,
            ${now}::timestamptz, clock_timestamp(), 'exact', 'trusted', ${truthState}, true, ${o.confidence === undefined ? null : JSON.stringify(o.confidence)}::jsonb,
            ${JSON.stringify(header.evidence_refs)}::jsonb, 'fixture-b82-px@1', '[]'::jsonb, '[]'::jsonb, ${JSON.stringify(header.human_refs)}::jsonb, 'internal', 'intelligence', ${`${type}@v1`},
            ${header.correction_of}, ${header.withdrawal_reason}, ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${digest},
            ${o.freshness === undefined || o.freshness === null ? null : JSON.stringify(o.freshness)}::jsonb)`.execute(h.su);
  return { type, id, version };
}
const key = (r: Ref) => `${r.type}:${r.id}@${r.version}`;
const fitnessMark = async (r: Ref, verdict: 'fit' | 'unfit') =>
  sql`insert into graph.product_fitness_marks (mark_id, scope, tenant_id, domain_id, object_type, object_id, object_version, object_digest, verdict, reasons, gaps, examined, truncated, rule_version,
        route, routed_to, note, marked_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${r.type}, ${r.id}::uuid, ${r.version}, ${'e'.repeat(64)}, ${verdict},
              ${verdict === 'unfit' ? ['incomplete_lineage'] : []}::text[], '[]'::jsonb, 3, false, 'b50-pv-fitness-1', ${verdict === 'unfit' ? 'recompute' : null},
              ${verdict === 'unfit' ? steward.principalId : null}::uuid, 'the fixture mark of the B82 trust harness (SYNTHETIC)', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
async function signature(r: Ref, how: 'good' | 'tampered' | 'foreign_key', signer: string): Promise<string> {
  const id = uuidv7(); const digest = createHash('sha256').update(`${key(r)}|${how}|${RUN}`).digest('hex');
  const sig = how === 'tampered' ? cryptoSign(null, Buffer.from('another subject digest', 'utf8'), KEYS.privateKey).toString('base64')
    : cryptoSign(null, Buffer.from(digest, 'utf8'), KEYS.privateKey).toString('base64');
  await sql`insert into executive.signatures (signature_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_digest, signer, key_id, algorithm, signature, bound_action, signed_at, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'decision', ${r.id}::uuid, ${r.version}, ${digest}, ${signer}::uuid, ${how === 'foreign_key' ? 'ed25519:0123456789abcdef' : KEY_ID}, 'Ed25519', ${sig},
            'decision.package.commit', clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
/** Every key of an answer, recursively (no numeric trust score may hide anywhere). */
const keysOf = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v as Row)) { out.push(k); keysOf(x, out); }
  return out;
};

let EVD: Ref; let CLEAN: Ref; let UNFIT: Ref; let UNRESOLVED: Ref; let BAD_EVD: Ref; let BROKEN: Ref; let RUN_V1: Ref; let RECO: Ref; let CORR_V1: Ref; let CORR_V2: Ref; let SIGNED: Ref; let FOREIGN: Ref;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  tc = h.app.get(TrustController);
  auditor = await h.humanWithSession(['auditor'], 'b82px-auditor', 'TENANT');
  steward = await h.humanWithSession(['data_steward'], 'b82px-steward');
  owner = await h.humanWithSession(['decision_owner'], 'b82px-owner');
  producer = await h.humanWithSession(['domain_analyst'], 'b82px-producer');
  outsider = await h.humanWithSession(['collection_manager'], 'b82px-outsider');
  const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentId}::uuid, 'agent', 'DOMAIN', ${T}::uuid, ${D}::uuid, ${`b82-px-agent-${RUN} (SYNTHETIC)`}, ${`b82px-agent-${agentId.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of ['data_steward', 'domain_analyst']) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentId}::uuid, ${role}, 'DOMAIN', ${T}::uuid, ${D}::uuid)`.execute(h.su);
  }
  agent = await h.openSession({ ...h.manager, principalId: agentId, kind: 'agent', homeScope: 'DOMAIN', homeTenantId: T, homeDomainId: D,
    bindings: [{ roleCode: 'data_steward', scope: 'DOMAIN', tenantId: T, domainId: D }, { roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: T, domainId: D }] } as AuthenticatedPrincipal);
  // THE WORLD (SYNTHETIC): one governed upload (custody established), a clean claim on it, an unfit claim, a claim citing nothing recorded,
  // an evidence version with no manifest (an integrity gap) and a product on it, a run whose v2 is withdrawn and a recommendation-like
  // product citing v1, a correction pair, a signed product and one signed under a key not on file.
  const [up] = await h.upload([{ filename: `b82-px-transits-${RUN}.csv`, text: `day,transits\n2026-10-01,41\n2026-10-02,39 (SYNTHETIC ${RUN})\n` }]);
  EVD = { type: 'EVD', id: up!.id, version: up!.version };
  CLEAN = await plant({ evidenceRefs: [key(EVD)], freshness: { state: 'assessed', method: 'header-age@1', as_of: new Date().toISOString() } });
  UNFIT = await plant({ evidenceRefs: [key(EVD)] }); await fitnessMark(UNFIT, 'unfit');
  UNRESOLVED = await plant({ evidenceRefs: [`EVD:${uuidv7()}@1`] });
  BAD_EVD = await plant({ type: 'EVD', payload: { title: 'an evidence version with no manifest (SYNTHETIC)', content_digest: 'a'.repeat(64) } });
  BROKEN = await plant({ evidenceRefs: [key(BAD_EVD)] });
  RUN_V1 = await plant({ type: 'SIM' }); await plant({ type: 'SIM', id: RUN_V1.id, version: 2, truth: 'withdrawn', lifecycle: 'withdrawn' });
  RECO = await plant({ type: 'DPK', sourceIds: [key(RUN_V1)], humanRefs: [`principal:${producer.principalId}`] });
  CORR_V1 = await plant({ evidenceRefs: [key(EVD)] }); CORR_V2 = await plant({ id: CORR_V1.id, version: 2, correctionOf: `${CORR_V1.id}@1`, evidenceRefs: [key(EVD)] });
  SIGNED = await plant({ evidenceRefs: [key(EVD)] });
  await signature(SIGNED, 'good', steward.principalId); await signature(SIGNED, 'tampered', producer.principalId); await signature(SIGNED, 'foreign_key', outsider.principalId);
  FOREIGN = await plant({ evidenceRefs: [key(EVD)] }); await signature(FOREIGN, 'foreign_key', steward.principalId);
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T}::uuid, ${'b82-px-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('PX1 · the provenance strength (§0\'s stub replaced whole)', () => {
  it('one function, the seams\' signature: STABLE, SECURITY DEFINER, the SAME search path, jsonb; EXECUTE to eye_app and eye_commit, not PUBLIC; the envelope declared beside it', async () => {
    const r = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_function_result(p.oid) res,
      has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt
      from pg_proc p where p.oid = ${B82_READS.provenanceStrength.fn}::regprocedure`);
    expect(r).toMatchObject({ v: 's', d: true, cfg: 'search_path=graph, objects, observation, pg_catalog, pg_temp', res: 'jsonb', pub: false, app: true, cmt: true });
    expect((await one(sql`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'graph' and p.proname = 'provenance_strength'`))['n']).toBe(1);
    expect((await one(sql`select to_regprocedure(${B82_READS.trustEnvelope.fn}) is not null as present`))['present']).toBe(true);
  });
  it('a clean path reads STRONG under b82-px-strength-1, with its basis; the shape the stub kept (ref, strength, reasons, rule_version, as_of)', async () => {
    const s = await strengthSql(CLEAN);
    expect(s).toMatchObject({ ref: key(CLEAN), strength: 'strong', reasons: [], rule_version: PROVENANCE_STRENGTH_RULE_VERSION });
    expect(String(s['basis'])).toMatch(/^graph\.explain \(b50-pv-explain-1\)/);
    expect(Number.isFinite(Date.parse(String(s['as_of'])))).toBe(true);
    evidence('PX1 strong', s);
  });
  it('WEAK: an UNFIT mark; an unresolved citation — each reason kept in words', async () => {
    const u = await strengthSql(UNFIT);
    expect(u.strength).toBe('weak'); expect(codes(u)).toContain('unfit'); expect(u.reasons.find((x) => x.code === 'unfit')!.detail).toMatch(/is marked UNFIT \(incomplete_lineage\)/);
    const n = await strengthSql(UNRESOLVED);
    expect(n.strength).toBe('weak'); expect(codes(n)).toEqual(['unresolved_citation']); expect(n.reasons[0]!.detail).toMatch(/does not resolve to a recorded object/);
    evidence('PX1 weak', { unfit: u, unresolved: n });
  });
  it('BROKEN: an integrity gap (an evidence version with no manifest and no custody); PARTIAL: a withdrawn input; a correction\'s own original is not an input change', async () => {
    const b = await strengthSql(BROKEN);
    expect(b.strength).toBe('broken'); expect(b.reasons.filter((x) => x.code === 'gap').map((x) => x.detail).join(' | ')).toMatch(/BROKEN — (unverifiable artifact|broken custody)/);
    const p = await strengthSql(RECO);
    expect(p.strength).toBe('partial'); expect(codes(p)).toEqual(['withdrawn_input']);
    expect(p.reasons[0]!.detail).toMatch(new RegExp(`the input SIM:${RUN_V1.id}@1 was withdrawn since \\(v2`));
    expect((await strengthSql(CORR_V2)).strength).toBe('strong');
    evidence('PX1 broken/partial', { broken: b, partial: p });
  });
  it('PARTIAL by the rule over a stated explanation: truncated, an undigested model call, an unsigned approval (each its own reason)', async () => {
    const x = { ref: key(CLEAN), method: 'b50-pv-explain-1', gaps: [], truncated: true, examined: 400, bounds: { max_depth: 12, max_nodes: 400 },
      nodes: [{ node_id: 'model:x', kind: 'model_call', ref: `gateway:${uuidv7()}`, label: 'model call (not recorded)', outcome: 'unresolved' },
              { node_id: 'approval:x', kind: 'approval', ref: `approval:${uuidv7()}`, label: 'approve by authority', outcome: 'ok' }] };
    const s = (await one(sql`select graph.px_strength_of(${T}::uuid, ${D}::uuid, ${JSON.stringify(x)}::jsonb) as s`))['s'] as { strength: string; reasons: Array<{ code: string; node_id: string | null }> };
    expect(s.strength).toBe('partial');
    expect(s.reasons.map((r) => r.code)).toEqual(['truncated', 'undigested_model_call', 'unsigned_human_step']);
    expect(s.reasons.map((r) => r.node_id)).toEqual([null, 'model:x', 'approval:x']);
  });
  it('refusals: a malformed subject (422), an unknown object (404), another domain\'s object as unknown (404), an unbound caller (scope)', async () => {
    await refused(sql`select graph.provenance_strength(${T}::uuid, ${D}::uuid, 'evd', ${uuidv7()}::uuid, 1)`.execute(h.su), /^provenance rejected \(subject\)/, 422);
    await refused(sql`select graph.provenance_strength(${T}::uuid, ${D}::uuid, 'EVD', ${uuidv7()}::uuid, 1)`.execute(h.su), /^provenance rejected \(unknown_object\): EVD .* v1 is not recorded in this domain/, 404);
    await refused(sql`select graph.provenance_strength(${T}::uuid, ${D2}::uuid, ${CLEAN.type}, ${CLEAN.id}::uuid, 1)`.execute(h.su), /^provenance rejected \(unknown_object\)/, 404);
    const app = h.app.get<Db>(APP_DB);
    const r = await refusal(sql`select graph.provenance_strength(${T}::uuid, ${D}::uuid, ${CLEAN.type}, ${CLEAN.id}::uuid, 1)`.execute(app));
    expect(r.message).toMatch(/^read rejected \(scope\)/);
  });
  it('§TS\'s display truth now reads it: weak and broken add `weak_provenance`; BROKEN reads INDETERMINATE; strong adds nothing', async () => {
    expect(codes(await truth(CLEAN))).not.toContain('weak_provenance');
    const w = await truth(UNRESOLVED);
    expect(codes(w)).toContain('weak_provenance'); expect(w.display).toBe('asserted');
    const b = await truth(BROKEN);
    expect(b.display).toBe('indeterminate'); expect(b.reasons.find((x) => x.code === 'weak_provenance')!.detail).toMatch(/^provenance strength BROKEN/);
  });
  it('the strength route (graph.trust.read) answers the read, audited; a role outside the readers refused by the policy', async () => {
    const r = await strengthRoute(auditor, UNFIT);
    expect(r.strength['strength']).toBe('weak'); expect(r.receipt['auditSeq']).toEqual(expect.any(Number));
    const stranger = await h.humanWithSession(['domain_specialist'], 'b82px-stranger');
    await refused(strengthRoute(stranger, UNFIT), /graph\.trust\.read|no rule|role/i, 403);
  });
});

describe('PX2 · the envelope: facets, never a score', () => {
  it('eight facets in the seam\'s order, each with an outcome and words; no numeric trust field anywhere; the rule, the digest, the as-of', async () => {
    const e = (await envelope(auditor, CLEAN)).envelope;
    expect(e.facets.map((f) => f['facet'])).toEqual([...TRUST_FACETS]);
    for (const f of e.facets) { expect(['verified', 'failed', 'unavailable', 'not_checked']).toContain(f['outcome']); expect(String(f['detail']).length).toBeGreaterThan(8); }
    expect(keysOf(e).filter((k) => /score|rating|trust_level|percent/i.test(k))).toEqual([]);
    expect(e).toMatchObject({ subject: key(CLEAN), rule_version: TRUST_ENVELOPE_RULE_VERSION, indeterminate: false, reasons: [] });
    expect(e.digest).toMatch(/^[0-9a-f]{64}$/);
    const byFacet = Object.fromEntries(e.facets.map((f) => [f['facet'], f]));
    expect(byFacet['lineage']).toMatchObject({ outcome: 'verified', basis: 'computed' });
    expect(byFacet['custody']).toMatchObject({ outcome: 'verified' });
    expect(byFacet['freshness']).toMatchObject({ outcome: 'verified' });
    expect(byFacet['signature']).toMatchObject({ outcome: 'not_checked', basis: 'recorded', detail: 'no signature is recorded on this version' });
    expect(byFacet['evaluation']).toMatchObject({ outcome: 'not_checked' });
    expect((await envelope(auditor, CLEAN)).envelope.digest).toBe(e.digest);   // stable across reads
    evidence('PX2 envelope', e);
  });
  it('TRUST INDETERMINATE when a facet failed: the reasons, the constrained use; failing evidence kept as recorded (UX-57-005: provenance broken, artifact mismatch)', async () => {
    const b = (await envelope(auditor, BROKEN)).envelope;
    expect(b.indeterminate).toBe(true);
    expect(b.reasons.map((r) => r['facet'])).toEqual(expect.arrayContaining(['lineage', 'custody', 'provenance']));
    expect(String(b['constrained_use'])).toMatch(/^TRUST INDETERMINATE — not for a decision-active use/);
    expect(b.provenance['strength']).toBe('broken');
    const u = (await envelope(auditor, UNFIT)).envelope;
    expect(u.facets.find((f) => f['facet'] === 'evaluation')).toMatchObject({ outcome: 'failed' });
    const c = (await envelope(auditor, CORR_V1)).envelope;   // the original, corrected since
    expect(c.facets.find((f) => f['facet'] === 'correction')).toMatchObject({ outcome: 'failed', detail: expect.stringMatching(/^this version is corrected by v2/) });
    const p = (await envelope(auditor, RECO)).envelope;
    expect(p.facets.find((f) => f['facet'] === 'correction')!['detail']).toMatch(/1 input\(s\) changed since: the input SIM/);
  });
  it('the route is audited under graph.trust.read; a role outside the readers is refused; an unknown subject is 404', async () => {
    const r = await envelope(steward, CLEAN);
    expect((await one(sql`select action from audit.audit_events where audit_seq = ${Number(r.receipt['auditSeq'])} and tenant_id = ${T}::uuid order by occurred_at desc limit 1`))['action']).toBe('graph.trust.read');
    const stranger = await h.humanWithSession(['domain_specialist'], 'b82px-stranger2');
    await refused(envelope(stranger, CLEAN), /./, 403);
    await refused(envelope(auditor, { type: 'CLM', id: uuidv7(), version: 1 }), /^provenance rejected \(unknown_object\)/, 404);
  });
});

describe('PX3 · verify again (signature, lineage, custody, correction, evaluation, policy, tamper, unavailable)', () => {
  it('the signature facet: VERIFIED, FAILED (tampered under the key on file), UNAVAILABLE (a key not on file) per signature — the worst is FAILED', async () => {
    const v = (await verify(auditor, SIGNED, 'signature')).verification;
    expect(v).toMatchObject({ facet: 'signature', outcome: 'failed', verifier: auditor.principalId, replayed: false });
    const per = ((v['examined'] as Row)['signatures'] as Row[]).map((s) => s['outcome']).sort();
    expect(per).toEqual(['failed', 'unavailable', 'verified']);
    expect(String(v['detail'])).toMatch(/3 signature\(s\):/);
    const e = (await envelope(auditor, SIGNED)).envelope;
    expect(e.facets.find((f) => f['facet'] === 'signature')).toMatchObject({ outcome: 'failed', basis: 'recorded', checked_by: auditor.principalId });
    expect(e.indeterminate).toBe(true);
    evidence('PX3 signature', v);
  });
  it('a key not on file is UNAVAILABLE — never FAILED; no signature at all is unavailable ("nothing to verify")', async () => {
    const f = (await verify(steward, FOREIGN, 'signature')).verification;
    expect(f).toMatchObject({ outcome: 'unavailable' }); expect(String(f['detail'])).toMatch(/UNAVAILABLE — no key is on file for ed25519:0123456789abcdef/);
    const n = (await verify(steward, CLEAN, 'signature')).verification;
    expect(n).toMatchObject({ outcome: 'unavailable', detail: 'no signature is recorded on this version — nothing to verify' });
  });
  it('the server computes the other facets (lineage verified, custody failed on the tampered artifact, correction failed on the original, evaluation failed on unfit); a not-checkable facet records UNAVAILABLE', async () => {
    expect((await verify(auditor, CLEAN, 'lineage')).verification).toMatchObject({ outcome: 'verified', facet: 'lineage' });
    expect((await verify(auditor, BROKEN, 'custody')).verification).toMatchObject({ outcome: 'failed' });
    expect((await verify(auditor, CORR_V1, 'correction')).verification).toMatchObject({ outcome: 'failed' });
    expect((await verify(auditor, UNFIT, 'evaluation')).verification).toMatchObject({ outcome: 'failed' });
    const pol = (await verify(auditor, CLEAN, 'policy')).verification;
    expect(pol).toMatchObject({ outcome: 'unavailable' }); expect(String(pol['detail'])).toMatch(/^nothing to verify — no policy decision is recorded on the production path/);
  });
  it('the policy facet: an EXPIRED policy decision on the production path fails (the rule over a stated explanation)', async () => {
    const pid = uuidv7();
    await sql`insert into policy.policy_decisions (id, scope, tenant_id, domain_id, decision, obligations, principal_id, action, object_type, object_id, purpose_id, consequence_class, environment,
        input_digest, bundle_version, reason, correlation_id, created_at, expires_at)
      values (${pid}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'allow', '[]'::jsonb, ${`principal:${steward.principalId}`}, 'intelligence.claim.admit', 'CLM', ${CLEAN.id}::uuid, 'intelligence', 'C1', '{}'::jsonb,
              ${'b'.repeat(64)}, (select b.version from policy.policy_bundles b order by b.version desc limit 1), 'admitted (SYNTHETIC)', ${uuidv7()}::uuid, clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day')`.execute(h.su);
    const x = { ref: key(CLEAN), gaps: [], truncated: false, nodes: [{ node_id: `policy:${pid}`, kind: 'policy_decision', ref: `policy:${pid}`, label: 'policy intelligence.claim.admit: allow', outcome: 'ok' }] };
    const f = (await one(sql`select graph.px_facet(${T}::uuid, ${D}::uuid, o, ${JSON.stringify(x)}::jsonb, 'policy', clock_timestamp()) as f from objects.canonical_objects o
                            where o.object_id = ${CLEAN.id}::uuid and o.object_version = 1`))['f'] as Row;
    expect(f).toMatchObject({ facet: 'policy', outcome: 'failed' }); expect(String(f['detail'])).toMatch(/allowed, EXPIRED at/);
  });
  it('recorded append-only; the request id replayed by the same person answers the recorded verification; by another person refused (duplicate)', async () => {
    const id = uuidv7();
    const a = (await verify(auditor, CLEAN, 'custody', id)).verification;
    const b = (await verify(auditor, CLEAN, 'custody', id)).verification;
    expect(b).toMatchObject({ verification_id: a['verification_id'], replayed: true });
    await refused(verify(steward, CLEAN, 'custody', id), /^trust verification rejected \(duplicate\)/, 409);
    const u = await refusal(sql`update graph.trust_verifications set outcome = 'verified' where verification_id = ${String(a['verification_id'])}::uuid`.execute(h.su));
    expect(u.message).toMatch(/append/i);
    const d = await refusal(sql`delete from graph.trust_verifications where verification_id = ${String(a['verification_id'])}::uuid`.execute(h.su));
    expect(d.message).toMatch(/append/i);
  });
  it('WHO: an agent refused by the human gate; a reader outside the verifiers refused by the policy; a bad facet 422; the port outside the pipeline refused', async () => {
    await refused(verify(agent, CLEAN, 'lineage'), /human gate/, 403);
    await refused(verify(outsider, CLEAN, 'lineage'), /./, 403);
    await refused(verify(auditor, CLEAN, 'score'), /^trust verification rejected \(facet\)/, 422);
    const r = await refusal(sql`select graph.verify_trust(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'CLM', ${CLEAN.id}::uuid, 1, 'lineage', null, ${auditor.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
    expect(r.message).toMatch(/authority|action|bound/i);
  });
});

describe('PX4 · attest: a person\'s recorded statement, never an approval', () => {
  let ATT = '';
  it('the auditor attests what she inspected, bound to the digest she read; the envelope lists it and its digest moves; no facet changes', async () => {
    const before = (await envelope(auditor, CLEAN)).envelope;
    const a = (await attest(auditor, CLEAN, before.digest)).attestation;
    expect(a).toMatchObject({ subject: key(CLEAN), facets: ['custody', 'lineage'], attested_by: auditor.principalId, state: 'standing', envelope_digest: before.digest, replayed: false });
    expect(String(a['kind'])).toMatch(/not an approval, not a release; it enables no command/);
    ATT = String(a['attestation_id']);
    const after = (await envelope(auditor, CLEAN)).envelope;
    expect(after.attestations.map((x) => x['attestation_id'])).toContain(ATT);
    expect(after.digest).not.toBe(before.digest);
    expect(after.facets.map((f) => [f['facet'], f['outcome']])).toEqual(before.facets.map((f) => [f['facet'], f['outcome']]));
    evidence('PX4 attestation', a);
  });
  it('the OWNER and a PRODUCER are refused (separation_of_duties); an agent (human gate); a role outside the attesters (policy)', async () => {
    const d = (await envelope(auditor, RECO)).envelope.digest;
    const ownerAtt = await h.humanWithSession(['domain_analyst'], 'b82px-owner-analyst');
    const OWNED = await plant({ evidenceRefs: [key(EVD)], owner: `principal:${ownerAtt.principalId}` });
    await refused(attest(ownerAtt, OWNED, (await envelope(auditor, OWNED)).envelope.digest), /^trust attestation rejected \(separation_of_duties\): an attestation is never made by the product's producer or owner/, 403);
    await refused(attest(producer, RECO, d), /^trust attestation rejected \(separation_of_duties\)/, 403);
    await refused(attest(agent, RECO, d), /human gate/, 403);
    await refused(attest(outsider, RECO, d), /./, 403);
  });
  it('a stale digest (409), a duplicate (409), a statement too short (422), facets outside the list (422); the replay answered', async () => {
    await refused(attest(steward, CLEAN, 'f'.repeat(64)), /^trust attestation rejected \(stale\): the trust envelope of CLM:.* changed since it was read/, 409);
    await refused(attest(auditor, CLEAN, (await envelope(auditor, CLEAN)).envelope.digest), /^trust attestation rejected \(duplicate\)/, 409);
    await refused(attest(steward, CLEAN, (await envelope(auditor, CLEAN)).envelope.digest, { statement: 'too short' }), /^trust attestation rejected \(statement\)/, 422);
    await refused(attest(steward, CLEAN, (await envelope(auditor, CLEAN)).envelope.digest, { facets: ['trustworthiness'] }), /^trust attestation rejected \(facets\)/, 422);
    const requestId = uuidv7(); const d = (await envelope(auditor, CORR_V2)).envelope.digest;
    const first = (await attest(steward, CORR_V2, d, { requestId })).attestation;
    const again = (await attest(steward, CORR_V2, d, { requestId })).attestation;
    expect(again).toMatchObject({ attestation_id: first['attestation_id'], replayed: true });
  });
  it('withdrawal: by its maker only, with a reason, once — the attestation stays on record, marked withdrawn', async () => {
    await refused(withdraw(steward, ATT), /^trust attestation rejected \(actor\): an attestation is withdrawn only by the person who made it/, 403);
    const w = (await withdraw(auditor, ATT)).attestation;
    expect(w).toMatchObject({ attestation_id: ATT, state: 'withdrawn', withdrawn_by: auditor.principalId });
    await refused(withdraw(auditor, ATT), /^trust attestation rejected \(state\)/, 409);
    await refused(withdraw(auditor, uuidv7()), /^trust attestation rejected \(unknown_attestation\)/, 404);
    expect((await one(sql`select count(*)::int n from graph.trust_attestations where attestation_id = ${ATT}::uuid`))['n']).toBe(1);
  });
  it('no command reads an attestation: no port or PDP rule names graph.trust_attestations except §PX\'s own', async () => {
    const r = await one(sql`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where p.prosrc ilike '%trust_attestations%' and p.proname not in ('px_attestation_row', 'trust_envelope', 'attest_trust', 'withdraw_trust_attestation', 'trust_overview', 'px_strength_of')`);
    expect(r['n']).toBe(0);
  });
});

describe('PX5 · investigate: an attention item to the owner', () => {
  it('the auditor opens an investigation on the withdrawn run\'s citing product: class trust_investigation, owned by its accountable owner, the envelope kept; a repeat answers it', async () => {
    const itemId = uuidv7();
    const r = (await investigate(auditor, RECO, 'correction', itemId)).investigation;
    expect(r).toMatchObject({ item_id: itemId, repeated: false, owner: owner.principalId, ref: key(RECO), facet: 'correction' });
    const item = await one(sql`select signal_class, subject_kind, subject_id::text, owner_principal_id::text owner, details from executive.attention_items where item_id = ${itemId}::uuid`);
    expect(item).toMatchObject({ signal_class: 'trust_investigation', subject_kind: 'canonical_object', subject_id: RECO.id, owner: owner.principalId });
    expect((item['details'] as Row)['strength']).toBe('partial');
    const again = (await investigate(steward, RECO, 'correction')).investigation;
    expect(again).toMatchObject({ item_id: itemId, repeated: true });
    const e = (await envelope(auditor, RECO)).envelope;
    expect((e['investigations'] as Row[]).map((i) => i['item_id'])).toContain(itemId);
    evidence('PX5 investigation', r);
  });
  it('the class list and the CHECK widened by union (B50\'s classes kept); an agent refused; an unknown subject 404; a bad facet 422', async () => {
    const c = await one(sql`select executive.attention_signal_classes() as c`);
    expect(c['c']).toEqual(expect.arrayContaining(['trust_investigation', 'knowledge.trace_reconciliation', 'forecast.unfit']));
    await refused(investigate(agent, RECO, null), /human gate/, 403);
    await refused(investigate(auditor, { type: 'SIM', id: uuidv7(), version: 1 }, null), /^trust investigation rejected \(unknown_object\)/, 404);
    await refused(investigate(auditor, RECO, 'vibes'), /^trust investigation rejected \(facet\)/, 422);
  });
});

describe('PX6 · the Trust and Governance overview (WS-18)', () => {
  it('products with their strength and reasons; models, agents, rights, denials, exceptions, contest, investigations, attestations, verifications; never a score', async () => {
    const o = (await overview(auditor, { types: ['CLM', 'DPK'], limit: 25 })).overview;
    const products = o['products'] as Array<Row & { ref: string; strength: string }>;
    const byRef = new Map(products.map((p) => [p.ref, p.strength]));
    expect(byRef.get(key(RECO))).toBe('partial');
    for (const k of ['models', 'agents', 'rights', 'policy_denials', 'exceptions', 'contest', 'investigations', 'attestations', 'verifications']) expect(o).toHaveProperty(k);
    expect((o['investigations'] as Row[]).length).toBeGreaterThan(0);
    expect((o['verifications'] as Row[]).length).toBeGreaterThan(0);
    expect(keysOf(o).filter((k) => /score|rating|trust_level/i.test(k))).toEqual([]);
    expect(String(o['statement'])).toMatch(/never a trust score/);
    evidence('PX6 overview', { products: products.length, strengths: [...byRef.values()] });
  });
  it('its scope validated in the class form (422)', async () => {
    await refused(overview(auditor, { colour: 'green' }), /^provenance rejected \(overview_scope\)/, 422);
    await refused(sql`select graph.trust_overview(${T}::uuid, ${D}::uuid, '{"limit": 99}'::jsonb)`.execute(h.su), /^provenance rejected \(overview_scope\): limit is 1 to 25/, 422);
  });
});

describe('PX7 · UX-27\'s boundary; the ledgers\' guards', () => {
  it('confidence never promotes a display state: a high-confidence claim reads as stored (never DECIDED); conflicting labels read INDETERMINATE with weak provenance kept', async () => {
    const hi = await plant({ evidenceRefs: [key(EVD)], confidence: { value: 0.99, kind: 'probability', basis: 'model (SYNTHETIC)' } });
    const t = await truth(hi);
    expect(t.display).toBe('asserted'); expect(t.display).not.toBe('decided');
    const other = await plant();
    await sql`insert into intelligence.contradictions (contradiction_id, scope, tenant_id, domain_id, kind, a_object_id, a_version, b_object_id, b_version, subject, predicate, a_value, b_value, state,
        detected_by, correlation_id) values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'claim.value', ${UNRESOLVED.id}::uuid, 1, ${other.id}::uuid, 1, 'Bab el-Mandeb transits', 'is',
        'reduced', 'normal', 'open', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const c = await truth(UNRESOLVED);
    expect(c.display).toBe('indeterminate'); expect(codes(c)).toEqual(expect.arrayContaining(['contradiction', 'weak_provenance']));
  });
  it('RLS forced, SELECT only to the runtime roles, no write grant; the ports eye_commit\'s only, the reads eye_app\'s and eye_commit\'s', async () => {
    for (const t of ['trust_verifications', 'trust_attestations', 'trust_attestation_events']) {
      const r = await one(sql`select c.relrowsecurity rls, c.relforcerowsecurity force, has_table_privilege('eye_app', c.oid, 'SELECT') sel, has_table_privilege('eye_commit', c.oid, 'INSERT') ins,
        has_table_privilege('eye_app', c.oid, 'UPDATE') upd from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'graph' and c.relname = ${t}`);
      expect(r, t).toMatchObject({ rls: true, force: true, sel: true, ins: false, upd: false });
    }
    for (const [fn, app, cmt] of [['graph.verify_trust(uuid,uuid,uuid,text,uuid,integer,text,jsonb,uuid,uuid)', false, true], ['graph.attest_trust(uuid,uuid,uuid,text,uuid,integer,text[],text,text,uuid,uuid)', false, true],
      ['graph.withdraw_trust_attestation(uuid,uuid,uuid,uuid,text,uuid,uuid)', false, true], ['graph.open_trust_investigation(uuid,uuid,uuid,text,uuid,integer,text,text,uuid,uuid)', false, true],
      ['graph.trust_envelope(uuid,uuid,text,uuid,integer)', true, true], ['graph.trust_overview(uuid,uuid,jsonb)', true, true]] as const) {
      const r = await one(sql`select has_function_privilege('eye_app', ${fn}::regprocedure, 'EXECUTE') app, has_function_privilege('eye_commit', ${fn}::regprocedure, 'EXECUTE') cmt,
        has_function_privilege('public', ${fn}::regprocedure, 'EXECUTE') pub`);
      expect(r, fn).toEqual({ app, cmt, pub: false });
    }
  });
  it('N-01: the definer reads assert the caller\'s bound scope — an unbound runtime role is refused by the envelope, the overview and the signatures read', async () => {
    const app = h.app.get<Db>(APP_DB);
    for (const q of [sql`select graph.trust_envelope(${T}::uuid, ${D}::uuid, 'CLM', ${CLEAN.id}::uuid, 1)`, sql`select graph.trust_overview(${T}::uuid, ${D}::uuid, '{}'::jsonb)`]) {
      expect((await refusal(q.execute(app))).message).toMatch(/^read rejected \(scope\)/);
    }
    const commit = h.app.get<Db>(COMMIT_DB);
    expect((await refusal(sql`select graph.px_signatures(${T}::uuid, ${D}::uuid, 'CLM', ${SIGNED.id}::uuid, 1)`.execute(commit))).message).toMatch(/^read rejected \(scope\): the signatures of a product/);
  });
  it('the ledgers record each act (the governance ledger names every verification)', async () => {
    const n = await one(sql`select count(*)::int n from governance.events where event = 'trust.verified' and tenant_id = ${T}::uuid`);
    expect(Number(n['n'])).toBeGreaterThan(5);
    const e = await one(sql`select count(*) filter (where event = 'trust.attested')::int a, count(*) filter (where event = 'trust.attestation_withdrawn')::int w from graph.trust_attestation_events where tenant_id = ${T}::uuid`);
    expect(Number(e['a'])).toBeGreaterThanOrEqual(2); expect(Number(e['w'])).toBe(1);
  });
});
