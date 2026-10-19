/**
 * CP-6 B82 §EV (migration 0121_b82_x_ev) — EVIDENCE, CITATION, CUSTODY, RIGHTS, VERIFICATION (F-P7-E-07 chapter 26; CAP-UM-02's chapter-26
 * half), on a real database with the product's own routes (in process) and an ISOLATED vault (the four roots under one temporary directory,
 * set before the boot):
 *
 *   EV1 · THE RIGHTS TERMS (CMP-031, UX-26-002, DESIGN D10): a separate, versioned record per source contract version — declared by a data
 *         steward (v1, no expiry declared), replayed by its request id, revised with an expiry (expired is DERIVED at read time), withdrawn by
 *         a collection manager; the stale, state, duplicate, unknown-source and both-permitted-and-prohibited refusals; the PDP (a domain
 *         analyst refused; an agent refused at the human gate); the read with the contract's own rights statement and the ledger.
 *   EV2 · THE CITATION RESOLUTION (UX-26-001/003, REL-08, CMP-026): evidence cited by its canonical digest (binds the version) and by its
 *         bytes digest (binds the bytes, as a twin's element carries it); a stale digest; an unknown id (inaccessible — denied and absent read
 *         the same); a claim → its evidence with the BYTE SPAN of its lineage; a span outside the bytes; a claim reaching no evidence; a
 *         corrected version (corrected_by) and the correction itself; a withdrawn version; rights expired; an integrity failure (unverifiable);
 *         the request's refusals; the route under the EXISTING graph.provenance.read (a decision owner resolves; a collection agent is refused).
 *   EV3 · THE CITED SPAN (UX-26-003, CMP-028, DESIGN D9): the segment route under the EXISTING observation.evidence.retrieve — a domain analyst
 *         reads bytes [s, e) with context, the FULL digest re-verified and the custody entry written (its span named); a decision owner, the
 *         executive and the approver are REFUSED by the PDP (no widening: every decision role still denied observation.read and .retrieve; no
 *         `observation.evidence.segment` action exists) while the resolution still answers them short of the bytes; an oversize span and a
 *         span outside the bytes refused; a CORRUPT blob → one 409 EYE-INT-001 with its custody row; an UNREACHABLE root → the degraded block,
 *         no bytes (EYE-DEG-001).
 *   EV4 · THE HOOK (UX-26-004/005): objects._lineage_usable re-declared whole — a use resting on evidence whose integrity failed, whose root was
 *         unreachable at the last read, or whose rights expired / were withdrawn is REFUSED at every decision-active use (through
 *         decision.derive_option too); a later verified custody, a later served read, rights declared again lift each; B50's checks kept.
 *   EV5 · THE SHAPE: the tables FORCE RLS with SELECT only; append-only; the ports definer with their grants; the hook STABLE invoker, no grant.
 *
 * Every row here is SYNTHETIC fixture data (personas: F. Aydın — data steward; the collection manager; D. Ivanova — domain analyst, who reads
 * evidence today; L. Brandt — decision owner, who does not). THREE CLAIMS: this harness is CONSTRUCTION evidence only; the act is
 * demonstrated operation; real acceptance is never claimed here. The §EV refusal nouns (`rights terms`, `citation resolution`, `evidence
 * segment`) and the three new `object use` classes are NOT mapped centrally yet (the integrator maps them): their class, SQLSTATE and the
 * status their class takes under the convention are asserted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import type { CitationsController } from '../../src/graph/citations/citations.controller.js';
import type { EvidenceB82Controller } from '../../src/observation/evidence-b82/evidence-b82.controller.js';
import { CITATION_RESOLUTION_METHOD, type CitationResolutionRow } from '../../src/graph/b82-seams.js';
import { APP_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';

// The ISOLATED vault of this run (uploads write evidence bytes; the segment reads them back).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82-ev-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
const MARKER = '.eye-vault-root';

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string; text: string };
type Leaf = Row & { path: string[]; evidence: Row | null; outcome: string; reasons: string[]; detail: string | null; rights: Row | null; digest_ok: boolean | null; custody: Row | null; correction: Row };
type Resolution = CitationResolutionRow & { own: Row & { outcome: string; digest_binds: string; detail: string | null }; leaves: Leaf[] };

let h: Phase4Harness; let vault: VaultService; let pdp: PdpService;
let cites: CitationsController; let ev: EvidenceB82Controller;
let aydin: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal; let ivanova: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal;
let executive: AuthenticatedPrincipal; let approver: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal; let tenantAuditor: AuthenticatedPrincipal;
let E1: Evd; let E2: Evd; let E3: Evd; let E4: Evd; let E5: Evd; let R1: Evd; let rightsSource = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;

/** The status a class-form refusal takes under the central convention (403 actor|authority|separation_of_duties|access · 404 unknown_* ·
 *  409 state|stale|duplicate|held|expired · 422 the rest) — what the integrator maps for the §EV nouns; the object-use classes are 409. */
const classStatus = (message: string): number | null => {
  const m = /^(rights terms|citation resolution|evidence segment|object use) rejected \(([a-z_]+)\)/.exec(message);
  if (m === null) return null;
  const cls = m[2]!;
  if (m[1] === 'object use' && ['integrity_failed', 'inaccessible', 'rights_expired', 'unfit', 'incomplete_header'].includes(cls)) return 409;
  if (['actor', 'authority', 'separation_of_duties', 'access'].includes(cls)) return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls)) return 409;
  return 422;
};
/** A refusal: the HTTP status (the route's own, or the central mapping's — null while a noun is unmapped), the RAW message, the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string; code?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: r.code ?? null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};

/* ───────────── the routes (in process) ───────────── */
const resolve = async (as: AuthenticatedPrincipal, refs: Row[], depth?: number) =>
  (await cites.resolve(h.req(as, 'graph.provenance.read', 'CIT', null, 'graph'), T(), D(), { payload: { refs, ...(depth === undefined ? {} : { depth }) } })).resolutions as unknown as Resolution[];
const segment = (as: AuthenticatedPrincipal, evdId: string, payload: Row) =>
  ev.segment(h.req(as, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId, { payload }) as Promise<{ segment: Row & { base64: string | null; served: { start: number; end: number } | null; highlight: { start: number; end: number } | null }; receipt: Row }>;
const readRights = (as: AuthenticatedPrincipal, sourceId: string) =>
  ev.readRights(h.req(as, 'observation.read.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId) as Promise<{ rights: Row & { versions: Array<Row & { current: Row | null; history: Row[]; events: Row[]; statement: string; contract_rights: Row }> } }>;
const declare = (as: AuthenticatedPrincipal, payload: Row) =>
  ev.declareRights(h.req(as, 'observation.rights.declare', 'SRC', String(payload['sourceId'] ?? ''), 'observation'), T(), D(), { payload }) as Promise<{ terms: Row; receipt: Row }>;
const withdraw = (as: AuthenticatedPrincipal, termsId: string, payload: Row) =>
  ev.withdrawRights(h.req(as, 'observation.rights.withdraw', 'RTT', termsId, 'observation'), T(), D(), termsId, { payload }) as Promise<{ terms: Row }>;
const evidenceRef = (e: Evd, digest: string | null = e.digest) => ({ kind: 'evidence', id: e.id, version: e.version, digest });
const usable = (type: string, id: string, version: number, use: string) => sql`select objects.assert_usable(${type}, ${id}::uuid, ${version}::int, ${use})`.execute(h.su);
const manifestOf = async (e: { id: string; version: number }) => (await one(sql`select payload ->> 'manifest_id' m, payload ->> 'locator' l from objects.canonical_objects where object_id = ${e.id}::uuid and object_version = ${e.version}`)) as { m: string; l: string };
const custodyRows = async (evdId: string) => (await sql<{ event: string; details: Row; digest_verified: boolean | null }>`select event, details, digest_verified from observation.custody_events where evd_object_id = ${evdId}::uuid order by occurred_at, event_id`.execute(h.su)).rows;
const custodyEvent = (e: Evd, event: string, verified: boolean | null) => sql`insert into observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, source_id, contract_version, event, actor, content_digest, digest_verified, details, correlation_id)
  select gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, bm.manifest_id, ${e.id}::uuid, bm.source_id, bm.contract_version, ${event}, 'principal:' || ${ivanova.principalId}, bm.content_digest, ${verified}, '{"fixture":"B82 §EV (SYNTHETIC)"}'::jsonb, gen_random_uuid()
    from observation.blob_manifests bm where bm.manifest_id = (select (payload ->> 'manifest_id')::uuid from objects.canonical_objects where object_id = ${e.id}::uuid and object_version = ${e.version})`.execute(h.su);

/** A later version of an evidence object as the correction intake records one (the B50 idiom: the row copied, the version and its state set). */
async function laterVersion(e: Evd, lifecycle: 'corrected' | 'withdrawn', correctionOf: string | null): Promise<number> {
  const v = Number((await one(sql`select max(object_version)::int v from objects.canonical_objects where object_id = ${e.id}::uuid`))['v']) + 1;
  await sql`insert into objects.canonical_objects select (jsonb_populate_record(null::objects.canonical_objects, to_jsonb(o) || jsonb_build_object('object_version', ${v}::int, 'lifecycle_state', ${lifecycle}::text,
      'correction_of', ${correctionOf}::text, 'recorded_at', clock_timestamp(), 'withdrawal_reason', ${lifecycle === 'withdrawn' ? 'the publisher withdrew the item (SYNTHETIC)' : null}::text))).*
    from objects.canonical_objects o where o.object_id = ${e.id}::uuid and o.object_version = ${e.version}`.execute(h.su);
  return v;
}

/** A claim version as the extraction admits it (the B50 §PV idiom): the canonical object; the lineage row with its byte span, unless none. */
async function plantClaim(evidence: Evd | null, o: { span?: [number, number]; lineage?: boolean; refs?: boolean } = {}): Promise<{ id: string; version: number; digest: string }> {
  const id = uuidv7(); const version = 1; const now = new Date().toISOString();
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb transit delay', predicate: 'is', object_value: 'eleven days via the Cape (SYNTHETIC)', confidence: 0.9, review: { state: 'approved', reason: 'fixture', decider: null } };
  const refs = evidence === null || o.refs === false ? [] : [`EVD:${evidence.id}@${evidence.version}`];
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture-extraction',
    source_object_ids: evidence === null ? [] : [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: true, confidence: 0.9 as unknown as CanonicalHeader['confidence'], uncertainty: null, evidence_refs: refs, provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, evidence_refs, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, schema_ref, correction_of, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture-extraction', ${JSON.stringify(header.source_object_ids)}::jsonb, ${now}::timestamptz, ${now}::timestamptz, 'exact', 'trusted', 'extracted', true, '0.9'::jsonb,
            ${JSON.stringify(refs)}::jsonb, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', 'CLM@v1', null, ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  if (evidence !== null && o.lineage !== false) {
    const [s, e] = o.span ?? [2, 9];
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${id}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, ${s}, ${e}, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  }
  return { id, version, digest };
}

const upload = async (names: string[], label = ''): Promise<Evd[]> => {
  const files = names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' }));
  return (await h.upload(files, 'internal', label)).map((u, i) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest, text: files[i]!.text }));
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  vault = h.app.get(VaultService); await vault.ensureRoots();
  pdp = h.app.get(PdpService);
  const { CitationsController: C } = await import('../../src/graph/citations/citations.controller.js');
  const { EvidenceB82Controller: E } = await import('../../src/observation/evidence-b82/evidence-b82.controller.js');
  cites = h.app.get(C); ev = h.app.get(E);
  aydin = await h.humanWithSession(['data_steward'], 'b82-f-aydin');
  manager2 = await h.humanWithSession(['collection_manager'], 'b82-coll-mgr');
  ivanova = await h.humanWithSession(['domain_analyst'], 'b82-d-ivanova');
  brandt = await h.humanWithSession(['decision_owner'], 'b82-l-brandt');
  executive = await h.humanWithSession(['executive'], 'b82-executive');
  approver = await h.humanWithSession(['decision_approver'], 'b82-approver');
  collector = await h.principalWith(['collection_agent'], 'b82-collector');
  tenantAuditor = await h.humanWithSession(['auditor'], 'b82-auditor', 'TENANT');
  [E1, E2, E3, E4, E5] = (await upload(['b82-ev-e1', 'b82-ev-e2', 'b82-ev-e3', 'b82-ev-e4', 'b82-ev-e5'])) as [Evd, Evd, Evd, Evd, Evd];
  [R1] = (await upload(['b82-ev-r1'], 'rights')) as [Evd];
  rightsSource = await h.uploadSource('internal', 'rights');
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('EV1 · THE RIGHTS TERMS — a separate, versioned record per source contract version (D10)', () => {
  let termsId = '';
  it('declared by the data steward (v1, no expiry declared); the request id replays; the read states the contract\'s own rights beside it, and the ledger', async () => {
    const requestId = uuidv7();
    const payload = { sourceId: rightsSource, contractVersion: 1, expectedVersion: 0, expiresAt: null, purposes: ['decision support', 'internal briefings'], prohibitedUses: ['redistribution'],
      attribution: 'Source: fixture carrier advisories (SYNTHETIC).', reason: 'The carrier advisory licence of 2026-09 (SYNTHETIC fixture).', requestId };
    const d = await declare(aydin, payload);
    expect(d.terms).toMatchObject({ version: 1, state: 'in_force', recorded_state: 'in_force', expires_at: null, expiry_statement: 'no expiry declared', purposes: ['decision support', 'internal briefings'],
      prohibited_uses: ['redistribution'], declared_by: aydin.principalId, supersedes: null, replayed: false });
    expect(d.receipt).toMatchObject({ policyDecisionId: expect.any(String) });
    termsId = String(d.terms['terms_id']);
    expect((await declare(aydin, payload)).terms).toMatchObject({ terms_id: termsId, version: 1, replayed: true });
    const r = (await readRights(ivanova, rightsSource)).rights;
    const v1 = r.versions.find((x) => x['contract_version'] === 1)!;
    expect(v1.current).toMatchObject({ terms_id: termsId, version: 1, state: 'in_force' });
    expect(v1.statement).toBe('in_force · no expiry declared');
    expect(v1.contract_rights).toMatchObject({ rights_state: expect.any(String) });
    expect(v1.events.map((e) => e['event'])).toEqual(['rights.declared']);
  });
  it('a request id reused for another act, a stale read, an unknown source, a use both permitted and prohibited — each refused in the class form', async () => {
    const used = String((await one(sql`select request_id from observation.rights_terms where terms_id = ${termsId}::uuid and version = 1`))['request_id']);
    const dup = await refusal(declare(manager2, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, purposes: ['decision support'], reason: 'another person, the same request id', requestId: used }));
    expect(dup.message).toMatch(/^rights terms rejected \(duplicate\)/); expect(dup.code).toBe('23505'); expect(classStatus(dup.message)).toBe(409);
    const stale = await refusal(declare(aydin, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 0, purposes: ['decision support'], reason: 'declared again without reading v1' }));
    expect(stale.message).toMatch(/^rights terms rejected \(stale\): the rights terms of source .* are at version 1; this declaration read 0/); expect(stale.code).toBe('23514'); expect(classStatus(stale.message)).toBe(409);
    const unknown = await refusal(declare(aydin, { sourceId: uuidv7(), contractVersion: 1, expectedVersion: 0, purposes: ['decision support'], reason: 'a source nobody registered' }));
    expect(unknown.message).toMatch(/^rights terms rejected \(unknown_source\)/); expect(unknown.code).toBe('23503'); expect(classStatus(unknown.message)).toBe(404);
    const both = await refusal(declare(aydin, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, purposes: ['Redistribution'], prohibitedUses: ['redistribution'], reason: 'contradictory terms (fixture)' }));
    expect(both.message).toMatch(/^rights terms rejected \(prohibited_uses\): a use is either permitted or prohibited, never both/); expect(classStatus(both.message)).toBe(422);
    const none = await refusal(declare(aydin, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, purposes: [], reason: 'no purpose at all (fixture)' }));
    expect(none.message).toMatch(/^rights terms rejected \(purposes\)/);
  });
  it('the PDP: a domain analyst is refused (403); an agent is refused at the human gate; the tenant auditor reads', async () => {
    const r = await refusal(declare(ivanova, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, purposes: ['x1'], reason: 'an analyst declaring (fixture)' }));
    expect(r.status).toBe(403);
    const agentLike = { ...aydin, kind: 'agent' } as AuthenticatedPrincipal;
    const g = await refusal(declare(agentLike, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, purposes: ['x1'], reason: 'an agent declaring (fixture)' }));
    expect(g.status).toBe(403); expect(g.message).toMatch(/human gate: observation\.rights\.declare requires a named human principal/);
    expect((await readRights(tenantAuditor, rightsSource)).rights.versions.length).toBeGreaterThanOrEqual(1);
  });
  it('revised with an expiry already passed (v2): EXPIRED is derived at read time, never stored; withdrawn by the collection manager (v3); a second withdrawal refused (state)', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const v2 = (await declare(aydin, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 1, expiresAt: past, purposes: ['decision support'], prohibitedUses: [], reason: 'The licence ended yesterday (SYNTHETIC fixture).' })).terms;
    expect(v2).toMatchObject({ terms_id: termsId, version: 2, supersedes: 1, state: 'expired', recorded_state: 'in_force', expiry_statement: expect.stringMatching(/^expired at /) });
    expect((await one(sql`select state from observation.rights_terms where terms_id = ${termsId}::uuid and version = 2`))['state']).toBe('in_force');
    const v3 = (await withdraw(manager2, termsId, { expectedVersion: 2, reason: 'The publisher revoked the licence (SYNTHETIC fixture).' })).terms;
    expect(v3).toMatchObject({ version: 3, state: 'withdrawn', recorded_state: 'withdrawn', supersedes: 2, declared_by: manager2.principalId });
    const again = await refusal(withdraw(manager2, termsId, { expectedVersion: 3, reason: 'withdrawn twice (fixture)' }));
    expect(again.message).toMatch(/^rights terms rejected \(state\): rights terms .* are withdrawn since version 3/); expect(classStatus(again.message)).toBe(409);
    const ghost = await refusal(withdraw(manager2, uuidv7(), { expectedVersion: 1, reason: 'terms nobody declared (fixture)' }));
    expect(ghost.message).toMatch(/^rights terms rejected \(unknown_terms\)/); expect(classStatus(ghost.message)).toBe(404);
    const read = (await readRights(ivanova, rightsSource)).rights.versions.find((x) => x['contract_version'] === 1)!;
    expect(read.history.map((x) => [x['version'], x['state']])).toEqual([[1, 'in_force'], [2, 'expired'], [3, 'withdrawn']]);
    expect(read.events.map((e) => e['event'])).toEqual(['rights.declared', 'rights.revised', 'rights.withdrawn']);
  });
});

describe('EV2 · THE CITATION RESOLUTION — each citation to its exact evidence, short of the bytes', () => {
  it('evidence cited by its canonical digest binds the VERSION; by its bytes digest binds the BYTES; a resolved leaf states digest, custody, tier and no rights terms', async () => {
    const [byVersion, byBytes] = await resolve(brandt, [evidenceRef(E1), evidenceRef(E1, E1.bytesDigest)]);
    expect(byVersion!.method).toBe(CITATION_RESOLUTION_METHOD);
    expect(byVersion).toMatchObject({ outcome: 'resolved', own: { outcome: 'resolved', digest_binds: 'version' }, truncated: false });
    expect(byBytes).toMatchObject({ outcome: 'resolved', own: { digest_binds: 'bytes' } });
    const leaf = byVersion!.leaves[0]!;
    expect(leaf.path).toEqual([`EVD:${E1.id}@${E1.version}`]);
    expect(leaf).toMatchObject({ outcome: 'resolved', digest_ok: true, tier: 'hot', rights: null, custody: { state: 'intact' } });
    expect(leaf.evidence).toMatchObject({ id: E1.id, version: E1.version, digest: E1.bytesDigest, byte_start: 0, byte_end: Buffer.byteLength(E1.text) });
  });
  it('a stale digest, an unknown id (inaccessible: denied and absent read the same), a digest not carried (named, not bound)', async () => {
    const [stale, unknown, none] = await resolve(brandt, [evidenceRef(E1, 'f'.repeat(64)), { kind: 'claim', id: uuidv7(), version: 1, digest: null }, evidenceRef(E1, null)]);
    expect(stale).toMatchObject({ outcome: 'stale_citation', own: { outcome: 'stale_citation', detail: expect.stringMatching(/carries digest ffffffffffff…/) } });
    expect(unknown).toMatchObject({ outcome: 'inaccessible', leaves: [], own: { detail: expect.stringMatching(/is not recorded in this domain \(or is not visible to this reader\)/) } });
    expect(none).toMatchObject({ outcome: 'resolved', own: { digest_binds: 'none', detail: expect.stringMatching(/carried no digest/) } });
  });
  it('a claim resolves to the evidence BYTE SPAN its lineage records (path claim → evidence); a span outside the bytes is unverifiable; a claim reaching no evidence says so', async () => {
    const c = await plantClaim(E1, { span: [2, 9] });
    const out = await plantClaim(E1, { span: [5, 999_999] });
    const bare = await plantClaim(null);
    const [r, o, b] = await resolve(brandt, [{ kind: 'claim', id: c.id, version: 1, digest: c.digest }, { kind: 'claim', id: out.id, version: 1, digest: out.digest }, { kind: 'claim', id: bare.id, version: 1, digest: bare.digest }]);
    expect(r).toMatchObject({ outcome: 'resolved', own: { digest_binds: 'version', object: { type: 'CLM', truth_state: 'extracted' } } });
    expect(r!.leaves).toHaveLength(1);
    expect(r!.leaves[0]).toMatchObject({ path: [`CLM:${c.id}@1`, `EVD:${E1.id}@${E1.version}`], span_basis: 'claim_lineage', evidence: { byte_start: 2, byte_end: 9 }, outcome: 'resolved' });
    expect(o!.outcome).toBe('unverifiable');
    expect(o!.leaves[0]).toMatchObject({ outcome: 'unverifiable', reasons: expect.arrayContaining(['span_out_of_range']), detail: expect.stringMatching(/the cited span 5–999999 does not lie within/) });
    expect(b).toMatchObject({ outcome: 'unverifiable', leaves: [{ evidence: null, outcome: 'unverifiable', reasons: ['no_evidence'], detail: expect.stringMatching(/reaches no evidence bytes within 4 steps/) }] });
  });
  it('REL-08 · every citing kind resolves to its exact evidence through the recorded lineage (the header\'s evidence_refs) — entity, forecast, assumption, run, twin, scenario, warning', async () => {
    const base = await plantClaim(E3, { lineage: false });
    const kinds: Array<[string, string]> = [['entity', 'ENT'], ['forecast', 'FCT'], ['assumption', 'ASU'], ['run', 'SIM'], ['twin', 'TWN'], ['scenario', 'SCN'], ['warning', 'WRN']];
    const made: Array<{ kind: string; type: string; id: string }> = [];
    for (const [kind, type] of kinds) {
      const id = uuidv7();
      await sql`insert into objects.canonical_objects select (jsonb_populate_record(null::objects.canonical_objects, to_jsonb(o) || jsonb_build_object('object_id', ${id}::text, 'object_type', ${type}::text, 'schema_ref', ${`${type}@v1`}::text))).*
        from objects.canonical_objects o where o.object_id = ${base.id}::uuid`.execute(h.su);
      made.push({ kind, type, id });
    }
    const rs = await resolve(brandt, made.map((m) => ({ kind: m.kind, id: m.id, version: 1, digest: null })));
    rs.forEach((r, i) => {
      const m = made[i]!;
      expect(r, m.kind).toMatchObject({ outcome: 'resolved', own: { digest_binds: 'none', object: { type: m.type } } });
      expect(r.leaves.map((l) => l.path), m.kind).toEqual([[`${m.type}:${m.id}@1`, `EVD:${E3.id}@${E3.version}`]]);
      expect(r.leaves[0], m.kind).toMatchObject({ span_basis: 'whole_object', outcome: 'resolved', evidence: { id: E3.id, byte_start: 0 } });
    });
  });
  it('a TRANSFORMATION is stated on its leaf: a fragment version names its parent\'s span and its framing method; the route answers the digest of what it resolved', async () => {
    await sql`insert into objects.canonical_objects select (jsonb_populate_record(null::objects.canonical_objects, to_jsonb(o) || jsonb_build_object('object_version', 2, 'recorded_at', clock_timestamp(),
        'payload', o.payload || jsonb_build_object('fragment', jsonb_build_object('byte_start', 4, 'byte_end', 40, 'method_ref', 'json-array-framing@1.2.0'), 'parent_evd_id', ${E1.id}::text)))).*
      from objects.canonical_objects o where o.object_id = ${E5.id}::uuid and o.object_version = ${E5.version}`.execute(h.su);
    const raw = await cites.resolve(h.req(brandt, 'graph.provenance.read', 'CIT', null, 'graph'), T(), D(), { payload: { refs: [{ kind: 'evidence', id: E5.id, version: 2, digest: null }] } }) as unknown as { resolutions: Resolution[]; digest: string };
    expect(raw.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.resolutions[0]!.leaves[0]!.evidence).toMatchObject({ id: E5.id, version: 2, fragment: { byte_start: 4, byte_end: 40, method_ref: 'json-array-framing@1.2.0', parent_evd_id: E1.id } });
  });
  it('a corrected version reads CORRECTED with what corrected it; the correction itself resolves and names what it corrects; a withdrawn version reads WITHDRAWN', async () => {
    const v2 = await laterVersion(E2, 'corrected', `${E2.id}@${E2.version}`);
    const [orig, corr] = await resolve(brandt, [evidenceRef(E2), { kind: 'evidence', id: E2.id, version: v2, digest: null }]);
    expect(orig).toMatchObject({ outcome: 'corrected', own: { outcome: 'corrected', detail: expect.stringMatching(new RegExp(`corrected since by EVD:${E2.id}@${v2}`)) } });
    expect(orig!.leaves[0]!.correction).toEqual({ correction_of: null, corrected_by: `EVD:${E2.id}@${v2}` });
    expect(corr).toMatchObject({ outcome: 'resolved' });
    expect(corr!.leaves[0]!.correction).toEqual({ correction_of: `EVD:${E2.id}@${E2.version}`, corrected_by: null });
    const v3 = await laterVersion(E2, 'withdrawn', null);
    const [w] = await resolve(brandt, [evidenceRef(E2)]);
    expect(w).toMatchObject({ outcome: 'withdrawn', own: { detail: expect.stringMatching(new RegExp(`withdrawn since v${v3}`)) } });
  });
  it('RIGHTS EXPIRED: the evidence of a source whose rights terms are withdrawn (EV1) reads rights_expired, the terms stated on the leaf', async () => {
    const [r] = await resolve(brandt, [evidenceRef(R1)]);
    expect(r!.outcome).toBe('rights_expired');
    expect(r!.leaves[0]).toMatchObject({ outcome: 'rights_expired', rights: { state: 'withdrawn', version: 3 }, reasons: expect.arrayContaining(['rights_withdrawn']) });
  });
  it('the request\'s own refusals at the route (422, class form); the route under the EXISTING graph.provenance.read — the tenant auditor resolves, a collection agent is refused (403)', async () => {
    const bad = await refusal(resolve(brandt, [{ kind: 'gossip', id: E1.id, version: 1, digest: null }]));
    expect(bad).toMatchObject({ status: 422, message: expect.stringMatching(/^citation resolution rejected \(citation\)/) });
    const deep = await refusal(resolve(brandt, [evidenceRef(E1)], 9));
    expect(deep).toMatchObject({ status: 422, message: expect.stringMatching(/^citation resolution rejected \(depth\)/) });
    const many = await refusal(resolve(brandt, Array.from({ length: 51 }, () => evidenceRef(E1))));
    expect(many.message).toMatch(/^citation resolution rejected \(citations\)/);
    expect((await resolve(tenantAuditor, [evidenceRef(E1)]))[0]!.outcome).toBe('resolved');
    expect((await refusal(resolve(collector, [evidenceRef(E1)]))).status).toBe(403);
    // the port refuses a caller outside its bound scope before it answers anything (the 0102 idiom)
    const sc = await refusal(sql`select graph.resolve_citation(${T()}::uuid, ${D()}::uuid, ${JSON.stringify([evidenceRef(E1)])}::jsonb, 4)`.execute(h.app.get<Db>(APP_DB)));
    expect(sc.message).toMatch(/^read rejected \(scope\): the resolution of a citation is read only within the caller's bound tenant and domain/);
  });
});

describe('EV3 · THE CITED SPAN — the EXISTING evidence-read authority only (D9)', () => {
  it('a domain analyst (who reads evidence today) reads bytes [2, 9) with 2 bytes of context: the full digest re-verified, only the window served, the span\'s offsets in it, custody written naming the span', async () => {
    const r = await segment(ivanova, E3.id, { byteStart: 2, byteEnd: 9, context: 2 });
    expect(r.segment).toMatchObject({ evdId: E3.id, version: E3.version, integrity: 'verified', contentDigest: E3.bytesDigest, byteLength: Buffer.byteLength(E3.text),
      cited: { start: 2, end: 9 }, served: { start: 0, end: 11 }, highlight: { start: 2, end: 9 } });
    const served = Buffer.from(r.segment.base64!, 'base64');
    expect(served.toString('utf8')).toBe(Buffer.from(E3.text).subarray(0, 11).toString('utf8'));
    expect(served.subarray(2, 9).toString('utf8')).toBe(Buffer.from(E3.text).subarray(2, 9).toString('utf8'));
    const last = (await custodyRows(E3.id)).at(-1)!;
    expect(last).toMatchObject({ event: 'custody.retrieved', digest_verified: true, details: expect.objectContaining({ purpose: 'evidence_segment', segment: '2-9', verified_on_read: true }) });
  });
  it('a decision owner, the executive and a decision approver are REFUSED by the PDP (no new grant); the resolution still answers them, short of the bytes', async () => {
    for (const p of [brandt, executive, approver]) {
      const r = await refusal(segment(p, E3.id, { byteStart: 0, byteEnd: 4 }));
      expect(r.status).toBe(403);
      expect((await resolve(p, [evidenceRef(E3)]))[0]!.outcome).toBe('resolved');
    }
    // NO WIDENING: every decision role is still denied the evidence reads; no segment action exists in the bundle
    const ctx = { scope: 'DOMAIN' as const, tenantId: T(), domainId: D() };
    for (const role of ['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator']) {
      for (const action of ['observation.evidence.retrieve', 'observation.read.evidence', 'observation.read.rights', 'observation.evidence.segment']) {
        const d = pdp.evaluate({ principal: { principalId: uuidv7(), kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T(), domainId: D() }] },
          delegationId: null, action, objectType: 'EVD', objectId: null, purposeId: 'observation', context: ctx as never, consequenceClass: 'C1', environment: { deployment: 'local-dev', clockQuality: 'trusted' } });
        expect(['deny', 'indeterminate'], `${role} ${action}`).toContain(d.decision);
      }
    }
  });
  it('an oversize span and a span outside the bytes are refused (422) — the latter after the verified read is in custody, nothing served', async () => {
    const big = await refusal(segment(ivanova, E3.id, { byteStart: 0, byteEnd: 70_000 }));
    expect(big).toMatchObject({ status: 422, message: expect.stringMatching(/^evidence segment rejected \(oversize\)/) });
    const before = (await custodyRows(E3.id)).length;
    const out = await refusal(segment(ivanova, E3.id, { byteStart: 50_000, byteEnd: 50_010 }));
    expect(out).toMatchObject({ status: 422, message: expect.stringMatching(/^evidence segment rejected \(span\): the cited span 50000–50010 does not lie within/) });
    expect((await custodyRows(E3.id)).length).toBe(before + 1);
  });
  it('a CORRUPT blob answers ONE 409 (EYE-INT-001) with its custody.integrity_failed row committed; restored, it is served again', async () => {
    const m = await manifestOf(E4);
    const path = join(vault.rootFor('evidence'), m.l);
    const good = readFileSync(path);
    writeFileSync(path, Buffer.concat([good.subarray(0, 4), Buffer.from('XX'), good.subarray(6)]));
    try {
      const r = await refusal(segment(ivanova, E4.id, { byteStart: 0, byteEnd: 4 }));
      expect(r.status).toBe(409);
      expect(r.message).toBe('evidence bytes failed integrity verification and were not served');
      expect((await custodyRows(E4.id)).at(-1)).toMatchObject({ event: 'custody.integrity_failed', digest_verified: false });
    } finally { writeFileSync(path, good); }
  });
  it('an UNREACHABLE root answers the declared degraded block — no bytes, nothing verified or refuted (EYE-DEG-001)', async () => {
    const marker = join(vault.rootFor('evidence'), MARKER); const aside = join(VAULT_DIR, `${MARKER}.evidence-aside`);
    renameSync(marker, aside);
    try {
      const r = await segment(ivanova, E1.id, { byteStart: 0, byteEnd: 4 });
      expect(r.segment).toMatchObject({ integrity: 'unavailable', availability: 'unreachable', base64: null, served: null, degraded: { code: 'EYE-DEG-001', root: 'evidence' } });
      expect((await custodyRows(E1.id)).at(-1)).toMatchObject({ event: 'custody.retrieval_degraded', digest_verified: null });
    } finally { renameSync(aside, marker); }
  });
});

describe('EV4 · THE HOOK — no decision-active use rests on evidence that is unverifiable, inaccessible or not licensed (UX-26-004)', () => {
  it('E4\'s bytes failed integrity (EV3): every use of it — and of a claim resting on it — is REFUSED (integrity_failed); a later verified read lifts it', async () => {
    const c = await plantClaim(E4, { span: [0, 4] });
    for (const use of ['decision_option', 'publication', 'export', 'gate']) {
      const r = await refusal(usable('EVD', E4.id, E4.version, use));
      expect(r.message, use).toMatch(new RegExp(`^object use rejected \\(integrity_failed\\): EVD ${E4.id} v${E4.version} rests on EVD ${E4.id} v${E4.version}, whose bytes failed integrity .* not used for ${use}`));
      expect(classStatus(r.message)).toBe(409);
    }
    expect((await refusal(usable('CLM', c.id, 1, 'decision_option'))).message).toMatch(/^object use rejected \(integrity_failed\): CLM .* rests on EVD/);
    await segment(ivanova, E4.id, { byteStart: 0, byteEnd: 4 });   // the restored bytes, verified on this read (custody.retrieved, digest_verified)
    await usable('EVD', E4.id, E4.version, 'decision_option');
    await usable('CLM', c.id, 1, 'gate');
  });
  it('E1\'s last read found the root unreachable (EV3): its use is REFUSED (inaccessible); a served read lifts it', async () => {
    const r = await refusal(usable('EVD', E1.id, E1.version, 'export'));
    expect(r.message).toMatch(/^object use rejected \(inaccessible\): EVD .* whose bytes cannot be reached \(the last retrieval found the tier's root unreachable/);
    await segment(ivanova, E1.id, { byteStart: 0, byteEnd: 4 });
    await usable('EVD', E1.id, E1.version, 'export');
  });
  it('RIGHTS: R1\'s source rights are withdrawn — refused at an option derived by decision.derive_option itself (rights_expired); declared again in force, the option derives', async () => {
    const cons = JSON.stringify([{ kind: 'evidence', id: R1.id, version: R1.version, digest: R1.digest }]);
    const derive = () => sql`select decision.derive_option(${T()}::uuid, ${D()}::uuid, clock_timestamp(), null, ${cons}::jsonb, 'evidence only (fixture)', 'b82 option')`.execute(h.su);
    const r = await refusal(derive());
    expect(r.message).toMatch(new RegExp(`object use rejected \\(rights_expired\\): EVD ${R1.id} v${R1.version} rests on EVD .* whose source's rights terms are withdrawn .* not used for decision_option`));
    const termsId = String((await one(sql`select terms_id from observation.rights_terms where source_id = ${rightsSource}::uuid limit 1`))['terms_id']);
    expect(termsId).toMatch(/^[0-9a-f-]{36}$/);
    await declare(aydin, { sourceId: rightsSource, contractVersion: 1, expectedVersion: 3, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), purposes: ['decision support'],
      reason: 'The licence was renewed for thirty days (SYNTHETIC fixture).' });
    await derive();
    expect((await resolve(brandt, [evidenceRef(R1)]))[0]!.outcome).toBe('resolved');
  });
  it('B50\'s checks are kept and come first (an unfit mark still answers `unfit`); a use outside the vocabulary still 422; evidence nobody recorded is not this hook\'s question', async () => {
    const r = await refusal(usable('EVD', E3.id, E3.version, 'briefing'));
    expect(r.message).toMatch(/^object use rejected \(use\)/);
    await usable('EVD', uuidv7(), 1, 'gate');
    const def = String((await one(sql`select pg_get_functiondef('objects._lineage_usable(text, uuid, integer, text)'::regprocedure) d`))['d']);
    expect(def.indexOf('B50 pv')).toBeGreaterThan(-1);
    expect(def.indexOf('object use rejected (unfit)')).toBeLessThan(def.indexOf('object use rejected (integrity_failed)'));
  });
});

describe('EV5 · THE SHAPE', () => {
  it('the two ledgers FORCE RLS, SELECT to eye_app / eye_commit, no write grant; append-only', async () => {
    for (const t of ['rights_terms', 'rights_terms_events']) {
      const r = await one(sql`select c.relrowsecurity rls, c.relforcerowsecurity frc, has_table_privilege('eye_app', c.oid, 'SELECT') app_sel, has_table_privilege('eye_commit', c.oid, 'SELECT') cmt_sel,
        has_table_privilege('eye_commit', c.oid, 'INSERT') ins, has_table_privilege('eye_commit', c.oid, 'UPDATE') upd, has_table_privilege('eye_app', c.oid, 'INSERT') app_ins
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'observation' and c.relname = ${t}`);
      expect(r, t).toEqual({ rls: true, frc: true, app_sel: true, cmt_sel: true, ins: false, upd: false, app_ins: false });
    }
    expect((await refusal(sql`update observation.rights_terms set reason = 'rewritten reason' where true`.execute(h.su))).message).toMatch(/append-only/i);
    expect((await refusal(sql`delete from observation.rights_terms_events where true`.execute(h.su))).message).toMatch(/append-only/i);
  });
  it('the ports: SECURITY DEFINER with a fixed search path; the writes to eye_commit only; the reads to eye_app and eye_commit; the internals with no grant; none PUBLIC', async () => {
    const want: Record<string, { app: boolean; cmt: boolean }> = {
      'observation.declare_rights_terms(uuid, uuid, uuid, uuid, integer, integer, timestamp with time zone, jsonb, jsonb, text, text, uuid, uuid)': { app: false, cmt: true },
      'observation.withdraw_rights_terms(uuid, uuid, uuid, uuid, integer, text, uuid, uuid)': { app: false, cmt: true },
      'observation.rights_terms_read(uuid, uuid, uuid)': { app: true, cmt: true },
      'graph.resolve_citation(uuid, uuid, jsonb, integer)': { app: true, cmt: true },
      'graph.ev_evidence_state(uuid, uuid, uuid, integer, integer, integer, timestamp with time zone)': { app: false, cmt: false },
      'observation.rt_current(uuid, uuid, uuid, integer)': { app: false, cmt: false },
    };
    for (const [fn, g] of Object.entries(want)) {
      const r = await one(sql`select p.prosecdef d, array_to_string(p.proconfig, ',') cfg, has_function_privilege('public', p.oid, 'EXECUTE') pub,
        has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt from pg_proc p where p.oid = ${fn}::regprocedure`);
      expect(r, fn).toMatchObject({ d: true, cfg: expect.stringMatching(/^search_path=.*pg_catalog, pg_temp$/), pub: false, app: g.app, cmt: g.cmt });
    }
    const hook = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_functiondef(p.oid) def,
      has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt from pg_proc p where p.oid = 'objects._lineage_usable(text, uuid, integer, text)'::regprocedure`);
    expect(hook).toMatchObject({ v: 's', d: false, cfg: 'search_path=objects, pg_catalog, pg_temp', app: false, cmt: false });
    expect(String(hook['def'])).toContain('B82 ev');
    // the source contract is unchanged (D10): no column was added to the contract table
    const cols = await one(sql`select count(*)::int n from information_schema.columns where table_schema = 'observation' and table_name = 'source_contracts_current' and column_name ilike '%expir%'`);
    expect(cols['n']).toBe(0);
  });
});
