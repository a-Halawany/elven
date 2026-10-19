/**
 * CP-6 B82-F §RT (migration 0122_b82f_x_rt) — THE RIGHTS TERMS FOR THEIR DECLARERS (B82 §EV's follow-up). A data steward (or a collection
 * manager) at DOMAIN may DECLARE and WITHDRAW a source's rights terms (observation.rights.declare / .withdraw — exact rules), but could not
 * READ them: `observation.read.rights` rides the `observation.read` prefix rule, whose roles exclude the steward, and the form sat on the
 * evidence page, which needs evidence read. The correction: ONE narrowly scoped exact action, `observation.rights.terms.read`, for exactly
 * the declare rule's roles at DOMAIN, served by its own port (observation.rights_terms_register) and route (POST …/observation/rights-terms/read)
 * — the domain's sources with their rights METADATA only (source name, contract version, the contract's own rights statement, the terms'
 * state and version, purposes, prohibited uses, attribution, expiry, history, the ledger). Never evidence content, bytes, segments or
 * observation payloads; no evidence or general observation read is granted.
 *
 *   RT1 · THE DECLARERS READ AND ACT: the steward reads its own domain's terms, declares through the EXISTING route, reads the new version,
 *         withdraws, reads the history; the collection manager reads; the answer carries rights metadata only (no evidence id, text, digest,
 *         locator or payload anywhere in it).
 *   RT2 · NOTHING ELSE MOVES: the steward is still refused the evidence bytes (the segment, the download) and every observation read it
 *         was refused before (the evidence list and detail, the source list, the per-source rights read); the PDP still denies the steward
 *         every observation read action; the new action is exact (no prefix of it, nothing under it, is granted).
 *   RT3 · WHO IS REFUSED: a role outside the declare rule (the domain analyst — an existing reader of the per-source read —, the executive,
 *         the collection agent, the tenant auditor) is refused the new read; the existing readers keep the per-source read.
 *   RT4 · CROSS-DOMAIN: a steward of another domain is refused this domain's terms; this domain's steward is refused the other domain's;
 *         the PORT itself refuses a domain other than the bound context's (access) and a principal who does not hold a declarer role in the
 *         domain (authority), whatever the PDP was told; the port outside the pipeline (no bound action) is refused.
 *   RT5 · THE SHAPE: the port is SECURITY DEFINER with a pinned search_path, EXECUTE to eye_commit only (never PUBLIC, never eye_app).
 *
 * Every row here is SYNTHETIC fixture data (personas: F. Aydın — data steward; the collection manager; D. Ivanova — domain analyst).
 * THREE CLAIMS: this harness is CONSTRUCTION evidence only; demonstrated operation and real acceptance are never claimed here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import type { EvidenceB82Controller } from '../../src/observation/evidence-b82/evidence-b82.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82f-rt-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Series = Row & { source_id: string; source_name: string; contract_version: number; current: Row | null; history: Row[]; events: Row[]; statement: string; contract_rights: Row };
type Register = { as_of: string; series: Series[]; truncated: boolean };

let h: Phase4Harness; let pdp: PdpService; let ev: EvidenceB82Controller; let obs: ObservationController;
let steward: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal; let ivanova: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
let collector: AuthenticatedPrincipal; let tenantAuditor: AuthenticatedPrincipal; let otherSteward: AuthenticatedPrincipal;
let source = ''; let evd: { id: string; version: number; digest: string; bytesDigest: string; text: string };
let otherDomain = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string; code?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: r.code ?? null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};

/* ───────────── the routes (in process) ───────────── */
const reqIn = (as: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, domainId: string) =>
  ({ eyeEnvelope: { ...h.env(as, action, objectType, objectId, 'observation'), domain_id: domainId }, eyePrincipal: as }) as never;
/** THE NEW READ — `observation.rights.terms.read` (POST …/observation/rights-terms/read). Before the correction no route serves it. */
const readTerms = (as: AuthenticatedPrincipal, domainId: string = D()): Promise<{ terms: Register; receipt: Row }> => {
  const route = (ev as unknown as Record<string, unknown>)['readRightsTerms'];
  if (typeof route !== 'function') return Promise.reject(new Error('no route serves observation.rights.terms.read (POST …/observation/rights-terms/read): the declarers cannot read the rights terms they declare'));
  return (route as (r: never, t: string, d: string) => Promise<{ terms: Register; receipt: Row }>).call(ev, reqIn(as, 'observation.rights.terms.read', 'RTT', null, domainId), T(), domainId);
};
const readRights = (as: AuthenticatedPrincipal, sourceId: string) =>
  ev.readRights(h.req(as, 'observation.read.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId) as Promise<{ rights: Row & { versions: Row[] } }>;
const declare = (as: AuthenticatedPrincipal, payload: Row) =>
  ev.declareRights(h.req(as, 'observation.rights.declare', 'SRC', String(payload['sourceId'] ?? ''), 'observation'), T(), D(), { payload }) as Promise<{ terms: Row; receipt: Row }>;
const withdraw = (as: AuthenticatedPrincipal, termsId: string, payload: Row) =>
  ev.withdrawRights(h.req(as, 'observation.rights.withdraw', 'RTT', termsId, 'observation'), T(), D(), termsId, { payload }) as Promise<{ terms: Row }>;
const seriesOf = (r: Register, sourceId: string, cv = 1) => r.series.find((s) => s.source_id === sourceId && s.contract_version === cv);
const decide = (role: string, action: string, objectType = 'SRC', atDomain: string = D()) => pdp.evaluate({
  principal: { principalId: uuidv7(), kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T(), domainId: atDomain }] },
  delegationId: null, action, objectType, objectId: null, purposeId: 'observation', context: { scope: 'DOMAIN', tenantId: T(), domainId: D() } as never, consequenceClass: 'C1',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as never).decision;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await h.app.get(VaultService).ensureRoots();
  pdp = h.app.get(PdpService);
  const { EvidenceB82Controller: E } = await import('../../src/observation/evidence-b82/evidence-b82.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  ev = h.app.get(E); obs = h.app.get(O);
  steward = await h.humanWithSession(['data_steward'], 'b82f-f-aydin');
  manager2 = await h.humanWithSession(['collection_manager'], 'b82f-coll-mgr');
  ivanova = await h.humanWithSession(['domain_analyst'], 'b82f-d-ivanova');
  executive = await h.humanWithSession(['executive'], 'b82f-executive');
  collector = await h.principalWith(['collection_agent'], 'b82f-collector');
  tenantAuditor = await h.humanWithSession(['auditor'], 'b82f-auditor', 'TENANT');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, residency_profile, retention_profile) values (${otherDomain}::uuid, ${T()}::uuid, ${`b82f-rt-other-${otherDomain.slice(-6)}`}, 'active', 'local-dev', 'default')`.execute(h.su);
  otherSteward = await h.humanWithSession(['data_steward'], 'b82f-other-steward', 'DOMAIN', { domainId: otherDomain });
  const text = TERMS_CSV.replace('assumption', 'assumption (b82f-rt — SYNTHETIC)');
  const [u] = await h.upload([{ filename: 'b82f-rt-r1.csv', text, documentTime: '2024-01-14T00:00:00Z' }], 'internal', 'b82f-rt');
  evd = { id: u!.id, version: u!.version, digest: u!.digest, bytesDigest: u!.bytesDigest, text };
  source = await h.uploadSource('internal', 'b82f-rt');
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('RT1 · the declarers read the rights terms they declare (observation.rights.terms.read), and act through the existing routes', () => {
  let termsId = '';
  it('the data steward reads its own domain\'s sources with their rights terms — none declared yet, said so', async () => {
    const r = await readTerms(steward);
    expect(r.receipt).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    const s = seriesOf(r.terms, source)!;
    expect(s).toMatchObject({ source_name: 'Fixture uploaded records (SYNTHETIC)', contract_version: 1, current: null, history: [], events: [],
      statement: 'no rights terms declared for this contract version — no expiry declared', contract_rights: { rights_state: 'confirmed', licence: 'internal', retention: '24 months' } });
    expect(r.terms.truncated).toBe(false);
    // the read is audited under the new action (POL + AUD durable before the data left)
    const pol = await one(sql`select action, decision from policy.policy_decisions where id = ${String(r.receipt['policyDecisionId'])}::uuid`);
    expect(pol).toMatchObject({ action: 'observation.rights.terms.read', decision: 'allow_with_obligations' });
  });
  it('the steward declares through the EXISTING route (v1), reads it back on the new read, withdraws it (v2), and reads the history and the ledger', async () => {
    const d = await declare(steward, { sourceId: source, contractVersion: 1, expectedVersion: 0, expiresAt: null, purposes: ['decision support'], prohibitedUses: ['redistribution'],
      attribution: 'Source: fixture plant records (SYNTHETIC).', reason: 'The fixture plant data agreement of 2026-10 (SYNTHETIC).' });
    termsId = String(d.terms['terms_id']);
    const v1 = seriesOf((await readTerms(steward)).terms, source)!;
    expect(v1.current).toMatchObject({ terms_id: termsId, version: 1, state: 'in_force', expires_at: null, expiry_statement: 'no expiry declared', purposes: ['decision support'],
      prohibited_uses: ['redistribution'], attribution: 'Source: fixture plant records (SYNTHETIC).', declared_by: steward.principalId });
    expect(v1.statement).toBe('in_force · no expiry declared');
    await withdraw(steward, termsId, { expectedVersion: 1, reason: 'The fixture agreement ended (SYNTHETIC).' });
    const v2 = seriesOf((await readTerms(steward)).terms, source)!;
    expect(v2.current).toMatchObject({ version: 2, state: 'withdrawn' });
    expect(v2.history.map((x) => [x['version'], x['state']])).toEqual([[1, 'in_force'], [2, 'withdrawn']]);
    expect(v2.events.map((e) => e['event'])).toEqual(['rights.declared', 'rights.withdrawn']);
  });
  it('the collection manager (the declare rule\'s other role) reads the same register, and declares the rights again (v3)', async () => {
    const r = seriesOf((await readTerms(manager2)).terms, source)!;
    expect(r.current).toMatchObject({ terms_id: termsId, version: 2 });
    const v3 = (await declare(manager2, { sourceId: source, contractVersion: 1, expectedVersion: 2, purposes: ['decision support'], reason: 'The fixture agreement renewed (SYNTHETIC).' })).terms;
    expect(v3).toMatchObject({ version: 3, state: 'in_force' });
  });
  it('the answer is rights METADATA only: no evidence id, bytes digest, canonical digest, text, locator, manifest or payload anywhere in it', async () => {
    const r = (await readTerms(steward)).terms;
    const json = JSON.stringify(r);
    for (const needle of [evd.id, evd.bytesDigest, evd.digest, 'b82f-rt — SYNTHETIC', 'locator', 'manifest', 'payload', 'base64', 'byte_', 'endpoints', 'credential']) {
      expect(json, needle).not.toContain(needle);
    }
    const allowed = ['source_id', 'source_name', 'contract_version', 'contract_state', 'contract_rights', 'current', 'statement', 'history', 'events'];
    for (const s of r.series) expect(Object.keys(s).sort()).toEqual([...allowed].sort());
    expect(Object.keys(r).sort()).toEqual(['as_of', 'series', 'truncated']);
  });
});

describe('RT2 · nothing else moves: the steward is still refused evidence and the observation reads it was refused before', () => {
  it('the evidence BYTES: the cited span (segment) and the download are refused by the PDP (403)', async () => {
    const seg = await refusal(ev.segment(h.req(steward, 'observation.evidence.retrieve', 'EVD', evd.id, 'observation'), T(), D(), evd.id, { payload: { byteStart: 0, byteEnd: 4 } }));
    expect(seg.status).toBe(403);
    const dl = await refusal(obs.downloadEvidence(h.req(steward, 'observation.evidence.retrieve', 'EVD', evd.id, 'observation'), T(), D(), evd.id));
    expect(dl.status).toBe(403);
  });
  it('the observation reads: the evidence list and detail, the source list, the per-source rights read — each 403 as before', async () => {
    expect((await refusal(obs.listEvidence(h.req(steward, 'observation.read.evidence', 'EVD', null, 'observation'), T(), D(), { payload: {} }))).status).toBe(403);
    expect((await refusal(obs.getEvidence(h.req(steward, 'observation.read.evidence', 'EVD', evd.id, 'observation'), T(), D(), evd.id, { payload: {} }))).status).toBe(403);
    expect((await refusal(obs.listSources(h.req(steward, 'observation.read.sources', 'SRC', null, 'observation'), T(), D(), { payload: {} }))).status).toBe(403);
    expect((await refusal(readRights(steward, source))).status).toBe(403);
  });
  it('the PDP: the declarer roles are still denied every observation read and evidence action; the new action is EXACT (nothing beside or under it)', () => {
    for (const role of ['data_steward']) {
      for (const action of ['observation.read', 'observation.read.evidence', 'observation.read.sources', 'observation.read.rights', 'observation.evidence.retrieve', 'observation.evidence.segment']) {
        expect(['deny', 'indeterminate'], `${role} ${action}`).toContain(decide(role, action, 'EVD'));
      }
    }
    for (const role of ['data_steward', 'collection_manager']) expect(decide(role, 'observation.rights.terms.read', 'RTT'), role).toBe('allow_with_obligations');
    // the steward specifically gains nothing beyond the one exact read (the collection manager's existing `observation.` prefix rule is unchanged)
    for (const action of ['observation.rights.terms', 'observation.rights.terms.read.evidence', 'observation.rights.terms.readx', 'observation.rights.read']) {
      expect(['deny', 'indeterminate'], action).toContain(decide('data_steward', action, 'RTT'));
    }
  });
});

describe('RT3 · a role outside the declare rule is refused the new read; the existing readers keep theirs', () => {
  it('the domain analyst, the executive, the collection agent and the tenant auditor are refused observation.rights.terms.read (403)', async () => {
    for (const p of [ivanova, executive, collector, tenantAuditor]) {
      const r = await refusal(readTerms(p));
      expect(r.status, p.principalId).toBe(403);
    }
    for (const role of ['domain_analyst', 'domain_admin', 'executive', 'decision_owner', 'collection_agent', 'auditor']) expect(['deny', 'indeterminate'], role).toContain(decide(role, 'observation.rights.terms.read', 'RTT'));
  });
  it('the existing readers keep the per-source read (observation.read.rights): the domain analyst and the tenant auditor', async () => {
    const a = (await readRights(ivanova, source)).rights.versions;
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect((await readRights(tenantAuditor, source)).rights.versions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('RT4 · cross-domain: the read is this domain\'s declarers\' only — at the PDP and in the port', () => {
  it('a steward of another domain is refused this domain\'s terms; this domain\'s steward is refused the other domain\'s (403)', async () => {
    expect((await refusal(readTerms(otherSteward, D()))).status).toBe(403);
    expect((await refusal(readTerms(steward, otherDomain))).status).toBe(403);
    // the other domain's steward reads its OWN domain — where this domain's source is not listed
    const own = (await readTerms(otherSteward, otherDomain)).terms;
    expect(own.series.find((s) => s.source_id === source)).toBeUndefined();
  });
  it('the PORT refuses a domain other than the bound context\'s (access, 403), whatever the handler asks', async () => {
    const { RightsCapability } = await import('../../src/observation/evidence-b82/rights.capabilities.js');
    const e = await refusal(h.pipeline.consequentialRead(h.env(steward, 'observation.rights.terms.read', 'RTT', null), steward,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.rights.terms.read', objectType: 'RTT', objectId: null },
      RightsCapability.terms, async (cap) => cap.register({ tenantId: T(), domainId: otherDomain })));
    expect(e.message).toMatch(/^rights terms rejected \(access\): the rights terms are read only within the caller's bound domain/);
    expect(e).toMatchObject({ code: '42501', status: 403 });
  });
  it('the PORT re-checks the acting principal: a principal the PDP was told holds data_steward, but who holds no declarer role here, is refused (authority)', async () => {
    const claimed = { ...ivanova, bindings: [...ivanova.bindings, { roleCode: 'data_steward', scope: 'DOMAIN' as const, tenantId: T(), domainId: D() }] } as AuthenticatedPrincipal;
    const e = await refusal(readTerms(claimed));
    expect(e.message).toMatch(/^rights terms rejected \(authority\): reading the rights terms of this domain's sources is the act of a data_steward or collection_manager here/);
    expect(e).toMatchObject({ code: '42501', status: 403 });
  });
  it('the port outside the pipeline (no bound action) is refused; its shape: definer, pinned search_path, EXECUTE to eye_commit only', async () => {
    const out = await sql`select observation.rights_terms_register(${T()}::uuid, ${D()}::uuid)`.execute(h.su).then(() => null, (x: unknown) => x as Error);
    expect(out?.message ?? '').toMatch(/rejected/);
    const f = await one(sql`select p.prosecdef, p.proconfig::text cfg, has_function_privilege('eye_commit', p.oid, 'EXECUTE') c, has_function_privilege('eye_app', p.oid, 'EXECUTE') a,
      coalesce((select bool_or(acl.grantee = 0) from aclexplode(p.proacl) acl), false) pub
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'observation' and p.proname = 'rights_terms_register'`);
    expect(f).toMatchObject({ prosecdef: true, c: true, a: false, pub: false });
    expect(String(f['cfg'])).toMatch(/search_path=.*pg_catalog, ?pg_temp/);
  });
});
