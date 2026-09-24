/**
 * CP-6 B21.2 (migration 0081 §1.C) — AU-MEM-0067's VAULT CLAUSE, CLASS B: the PRIMARY blob root the tier ledger names is UNREACHABLE
 * (its B18 marker `.eye-vault-root` unreadable — vault.service.ts rootReachable, the product's own definition of a mounted root), so no
 * per-object read is attempted and a retrieval answers 200 METADATA-ONLY under the same gate (observation.evidence.retrieve): base64 null,
 * integrity 'unavailable', availability 'unreachable', the manifest's digest and byte length, the tier, a `degraded { tier_unreachable,
 * EYE-DEG-001, root, label }` block, ONE custody.retrieval_degraded row per read (digest_verified NULL — the bytes were neither verified nor
 * refuted; the sixteenth custody kind), the audit row success/EYE-DEG-001 (B20's D9 shape). CLASS A — a per-object failure under a
 * REACHABLE root (missing, corrupt, scope, oversize) — keeps phase 1's A7: one 409 EYE-INT-001, one custody.integrity_failed row, no
 * disclosure — and that row now COMMITS with the route's audit row success/EYE-INT-001 (D2.6: before B21 the thrown 409 rolled it back;
 * the map's "one custody row" was never true on the route; the outcome is SUCCESS because the custody row is a stamped business effect
 * and 0013's closure admits it only beside one success audit row — the reconcile of D2.6's "failure" row, which could never commit). The class is decided BEFORE the read by the primary root's marker alone; a fallback
 * root's state never re-classifies (the rejected variant would tell a missing primary copy from a corrupt one for the outage's window).
 * The other readers see the flag, not the bytes: the series reader discloses the degraded window as a tombstone is disclosed
 * (unreadable, complete false, INCOMPLETE; V4(a)); the extraction skips with EYE-DEG-001 and no receipt (phase2-acceptance, B21.2); the
 * retention verifier never concludes "bytes gone" from a root it could not read (bytes_present NULL → verified false, infrastructure/retry;
 * V5); the lifecycle poll confirms by the record's digest and admits no duplicate (availability 'unverifiable'; phase6-retention-b11-archive-poll,
 * B21.2); /retention/tier/state says `reachable` per root. The marker is moved aside by the harness (the B18 F5 idiom) and restored in
 * `finally` whatever the outcome; the vault roots are this file's own temporary directory (C5).
 *
 *   V7 · THE GATE AND THE CANONICAL REFUSALS precede the root check (FIRST): a denied caller's 403 is the same with the root unreachable
 *   and writes no custody row; a withdrawn object's 409 and a tombstoned object's 409 are the same both ways.
 *   V1 · CLASS A PINNED THROUGH THE ROUTE: a missing blob and a corrupt blob answer ONE shape (the two bodies equal but for the
 *   correlation id), each with its custody.integrity_failed row COMMITTED (failure missing / corrupt on the ledger, never to the caller),
 *   the audit row success/EYE-INT-001 under the REAL decision (not evidence_only — C10); the corrupt blob restored is served again; the
 *   detail route serves the metadata tier throughout.
 *   V2 · CLASS B ON THE ARCHIVE ROOT: the archived manifest metadata-only with its custody row and audit row (twice: one row per read),
 *   the hot manifest served beside it, the detail unaffected, tier/state naming the root; the marker restored → served again.
 *   V3 · CLASS B ON THE EVIDENCE ROOT: the roles swapped; no false integrity incident in the window.
 *   V4(a) · THE SERIES READER: an archived window under an unreachable archive root → complete false, the window unreadable with the
 *   degraded reason, the forecast and the backtest refused, one custody row (read_for prediction.series); complete again after.
 *   V5 · THE VERIFIER: a deletion executed, then verified under an unreachable evidence root → bytes_present NULL, verified false, the
 *   action executed with infrastructure/retry, no DeletionVerified; verified after the mount.
 *
 * EACH CASE LOGS THE SIX THINGS V04-T-024/026 DEMAND as one `B21.2 EVIDENCE` line (C7). Stated (design-p2-records.md §9): no metadata-only
 * answer for Class A, ever (A7); the quarantine root has no marker; reachability is the marker's readability (an unmounted volume, a
 * permission fault and a moved marker read alike); the twin's disclosure is the series' `refused` string verbatim (not exercised here);
 * `retrieval_degraded` rows are one per read; the deletion's selector is `manifestId` (a deletion takes no chosen object set — B11 A1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

// This file's own vault roots (the B18 idiom; C5): the markers this file moves are its own, never the workspace's.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b21-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
const MARKER = '.eye-vault-root';

type Row = Record<string, unknown>;
type Root = 'evidence' | 'archive';
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type Manifest = { manifest_id: string; locator: string; content_digest: string; byte_length: number };
/** The literals the product declares (design-p2-api.md §2.1; copied, never retyped — a pin on the text, not on the product's own constant). */
const TIER_UNREACHABLE_LABEL = (root: Root): string =>
  `the ${root} root of the vault could not be reached; this evidence's record — its manifest, digest, tier and custody — is served; its bytes are not, and nothing about them was verified or refuted; retry when the tier is mounted (retention/tier/state names the roots)`;
const INTEGRITY_REFUSED_MESSAGE = 'evidence bytes failed integrity verification and were not served';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let h: Phase4Harness; let su: AnyDb; let vault: VaultService;
let observation: ObservationController; let retention: RetentionController; let prediction: PredictionController;
let analyst: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
let evdCold: Evd; let evdHot: Evd; let evdMissing: Evd; let evdCorrupt: Evd; let evdWd: Evd; let evdTomb: Evd; let evdDel: Evd;
let mCold: Manifest; let mHot: Manifest; let mMissing: Manifest; let mCorrupt: Manifest; let mTomb: Manifest; let mDel: Manifest;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
const obj = (v: unknown): Row => (v ?? {}) as Row;
/** A refusal as the caller sees it (the B20 idiom). */
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string; body: Row }> => {
  try { await p; return { status: null, code: null, message: '', body: {} }; } catch (e) {
    if (e instanceof HttpException) { const r = e.getResponse() as Row; return { status: e.getStatus(), code: (r['code'] as string) ?? null, message: String(r['message'] ?? ''), body: r }; }
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message, body: {} };
  }
};

/* ───────────── the rows (the B11 helpers :62-139, copied; custody gains digest_verified) ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string; locator: string }>`select (payload ->> 'manifest_id') as manifest_id, (select locator from observation.blob_manifests m where m.manifest_id = (o.payload ->> 'manifest_id')::uuid) as locator from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string): Promise<Manifest> => (await sql<Manifest>`select manifest_id::text, locator, content_digest, byte_length::int from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const tierOf = async (manifestId: string) => (await sql<{ t: string }>`select observation.manifest_tier(${manifestId}::uuid) t`.execute(su)).rows[0]!.t;
type CustodyRow = { event: string; details: Row; digest_verified: boolean | null; content_digest: string; occurred_at: Date };
const custody = async (manifestId: string, event: string): Promise<CustodyRow[]> => (await sql<CustodyRow>`select event, details, digest_verified, content_digest, occurred_at from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at desc, event_id desc`.execute(su)).rows;
const custodyChain = async (manifestId: string): Promise<string[]> => (await sql<{ event: string }>`select event from observation.custody_events where manifest_id = ${manifestId}::uuid order by occurred_at, event_id`.execute(su)).rows.map((r) => r.event);
const integrityRows = (manifestId: string) => custody(manifestId, 'custody.integrity_failed');
const degradedRows = (manifestId: string) => custody(manifestId, 'custody.retrieval_degraded');
const integrityFailedSince = async (since: Date): Promise<number> => (await sql<{ n: number }>`select count(*)::int n from observation.custody_events where tenant_id = ${T()}::uuid and event = 'custody.integrity_failed' and occurred_at >= ${since}`.execute(su)).rows[0]!.n;
const tombstones = async (manifestId: string) => (await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!.n;
const verifications = async (id: string) => (await sql<{ check_name: string; passed: boolean; expected: Row; observed: Row }>`select check_name, passed, expected, observed from retention.verifications where action_id = ${id}::uuid order by verified_at, check_name`.execute(su)).rows;
const actionRow = async (id: string) => (await sql<{ state: string; failure_class: string | null; disposition: string | null; failure_reason: string | null }>`select state, failure_class, disposition, failure_reason from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const actionEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const deletionVerifiedCount = async (since: Date, actionId: string) => (await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${since} and payload ->> 'action_id' = ${actionId}`.execute(su)).rows[0]!.n;
/** The audit rows an action wrote above a mark, with the decision each names (the B21.1 idiom; the B20 auditRowOf reads `event -> 'metadata'`). */
const auditMark = async (): Promise<number> => (await sql<{ s: number }>`select coalesce(max(audit_seq), 0)::int s from audit.audit_events where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.s;
type AuditRow = { result_code: string; outcome: string; metadata: Row; policy_decision_id: string | null };
const auditRowsSince = async (seq: number, action: string): Promise<AuditRow[]> => (await sql<AuditRow>`select result_code, outcome, event -> 'metadata' as metadata, event ->> 'policy_decision_id' as policy_decision_id from audit.audit_events where tenant_id = ${T()}::uuid and audit_seq > ${seq} and action = ${action} order by audit_seq`.execute(su)).rows;
const auditRowOf = async (auditSeq: number, action: string): Promise<AuditRow | undefined> => (await sql<AuditRow>`select result_code, outcome, event -> 'metadata' as metadata, event ->> 'policy_decision_id' as policy_decision_id from audit.audit_events where audit_seq = ${auditSeq} and tenant_id = ${T()}::uuid and action = ${action} and event_type = 'api.request'`.execute(su)).rows[0];
const decisionEvidenceOnly = async (id: string): Promise<boolean | undefined> => (await sql<{ evidence_only: boolean }>`select evidence_only from policy.policy_decisions where id = ${id}::uuid`.execute(su)).rows[0]?.evidence_only;
/** The SIX things V04-T-024/026 demand, logged per case (C7's prefix). */
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B21.2 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (the B11 helpers; the B12 tier/state) ───────────── */
type Download = { download: { filename: string; contentType: string; contentDisposition: string; contentDigest: string; byteLength: number; base64: string | null; integrity: string; tier: string; availability: string; degraded?: { kind: string; code: string; root: string; label: string } }; receipt: { policyDecisionId: string; auditSeq: number } };
const download = (p: AuthenticatedPrincipal, evdId: string) => observation.downloadEvidence(h.req(p, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId) as unknown as Promise<Download>;
const getEvidence = (p: AuthenticatedPrincipal, evdId: string) => observation.getEvidence(h.req(p, 'observation.read.evidence', 'EVD', evdId, 'observation'), T(), D(), evdId, { payload: {} }) as unknown as Promise<{ manifest: Row | null; availability: { tier: string; state: string }; custody: Row[] }>;
const tierState = (p: AuthenticatedPrincipal) => retention.tierState(h.req(p, 'retention.read', 'RTP', null, 'retention'), T(), D()) as unknown as Promise<{ state: Row & { vault: { evidence: Row; archive: Row } } }>;
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved; nothing else') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Row & { executed: number; held: number; refused: number } }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
/** OPEN → RESOLVE → APPROVE in one go (the B11 idiom). */
const approved = async (payload: Row): Promise<{ id: string; digest: string; scope: Row }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  const digest = String(r.scope['scope_digest']);
  await approve(authority, o.action.actionId, digest);
  return { id: o.action.actionId, digest, scope: r.scope };
};
const submitCorrection = async (evdIds: string[], reason: string, kind: 'correction' | 'withdrawal'): Promise<string> => {
  const o = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind, channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return o.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Row }>;
const upload = async (names: string[]): Promise<Evd[]> =>
  (await h.upload(names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' })))).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest }));
/** The blob's path under a root: `<root>/<tenant>/<domain>/<id>` — the locator IS the three segments (vault.service.ts pathFor). */
const blobPath = (root: Root, locator: string): string => join(vault.rootFor(root), locator);
/* ───────────── the marker (the B18 F5 idiom, :930-957): moved OUT of the root, restored in `finally` whatever the outcome ───────────── */
const markerOf = (root: Root) => join(vault.rootFor(root), MARKER);
const asideOf = (root: Root) => join(VAULT_DIR, `${MARKER}.${root}-aside`);
async function withRootUnreachable<X>(root: Root, body: () => Promise<X>): Promise<X> {
  expect(readFileSync(markerOf(root), 'utf8').trim()).toBe(root);
  expect(await vault.rootReachable(root)).toBe(true);
  renameSync(markerOf(root), asideOf(root));
  try { expect(await vault.rootReachable(root)).toBe(false); return await body(); }
  finally { renameSync(asideOf(root), markerOf(root)); }
}
/** The ARCHIVE of a manifest by the B11 flow (open → resolve → approve → execute; the hot copy removed after the commit, the retry route otherwise). */
async function archived(m: Manifest): Promise<string> {
  const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [m.manifest_id] } });
  const ex = await execute(steward, a.id);
  expect(ex.execution).toMatchObject({ executed: 1, refused: 0, held: 0 });
  if (await vault.exists('evidence', scope(), m.locator)) {
    // the post-commit removal pending: the designed operator step (the B11 A5 idiom, :461) removes the hot copy because the archive copy verifies
    const retry = await execute(steward, a.id);
    expect(obj(retry.execution)['retried']).toBe(true);
  }
  expect(await tierOf(m.manifest_id)).toBe('archive');
  expect(await vault.exists('evidence', scope(), m.locator)).toBe(false);
  expect(await vault.exists('archive', scope(), m.locator)).toBe(true);
  return a.id;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  observation = h.app.get(Oc); retention = h.app.get(Rc); prediction = h.app.get(Pc); vault = h.app.get(VaultService);
  await vault.ensureRoots();
  // THE PEOPLE: the downloader, the steward and the authority (sessions of their own), the series owner, the collection manager, an outsider (a decision owner) who holds no observation.evidence.retrieve.
  analyst = await h.humanWithSession(['domain_analyst'], 'b21-analyst');
  steward = await h.humanWithSession(['retention_steward'], 'b21-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b21-retention-authority', 'TENANT');
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'b21-forecast-owner');
  outsider = await h.humanWithSession(['decision_owner'], 'b21-outsider');   // a decision owner holds no observation.evidence.retrieve (pdp.service.ts: the holders are the administrators, the analyst, the collection and extraction roles, the forecast/twin/simulation roles, the knowledge owner, the record authority and the retention roles)
  manager = await h.principalWith(['collection_manager'], 'b21-collection-manager');
  // THE WORLD: seven uploads (distinct bytes each); the cold one archived by the B11 flow so V2 reads the PUBLISHED archive copy, never a fallback.
  [evdCold, evdHot, evdMissing, evdCorrupt, evdWd, evdTomb, evdDel] = (await upload(['v21-cold', 'v21-hot', 'v21-missing', 'v21-corrupt', 'v21-wd', 'v21-tomb', 'v21-del'])) as [Evd, Evd, Evd, Evd, Evd, Evd, Evd];
  mCold = await manifestRow((await manifestOf(evdCold.id, 1)).manifest_id);
  mHot = await manifestRow((await manifestOf(evdHot.id, 1)).manifest_id);
  mMissing = await manifestRow((await manifestOf(evdMissing.id, 1)).manifest_id);
  mCorrupt = await manifestRow((await manifestOf(evdCorrupt.id, 1)).manifest_id);
  mTomb = await manifestRow((await manifestOf(evdTomb.id, 1)).manifest_id);
  mDel = await manifestRow((await manifestOf(evdDel.id, 1)).manifest_id);
  await archived(mCold);
  for (const r of ['evidence', 'archive'] as Root[]) { expect(readFileSync(markerOf(r), 'utf8').trim()).toBe(r); expect(await vault.rootReachable(r)).toBe(true); }
}, 300_000);

afterAll(async () => {
  // both markers back in place whatever happened — the file's one filesystem promise
  for (const r of ['evidence', 'archive'] as Root[]) { if (existsSync(asideOf(r)) && !existsSync(markerOf(r))) renameSync(asideOf(r), markerOf(r)); expect(readFileSync(markerOf(r), 'utf8').trim()).toBe(r); }
  await h?.close();
}, 120_000);

describe('B21.2 · the vault clause of AU-MEM-0067: an unreachable root declared metadata-only (Class B); a per-object failure one 409 with its custody row durable (Class A); the readers, the verifier, the poll (0081 §1.C; V03-T-097; DP-28-005; ES-33-009)', () => {
  it('V7 · THE GATE AND THE CANONICAL REFUSALS precede the root check: a denied caller\'s 403, a withdrawn object\'s 409 and a tombstoned object\'s 409 are the same with the root reachable and unreachable, and none writes a custody row', async () => {
    const mWd = await manifestRow((await manifestOf(evdWd.id, 1)).manifest_id);
    // THE OUTSIDER (a knowledge owner holds no observation.evidence.retrieve — the PDP): 403 both ways, nothing on the ledger.
    const denied = await failure(download(outsider, evdCold.id));
    expect(denied).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const chainCold = await custodyChain(mCold.manifest_id);
    await withRootUnreachable('archive', async () => {
      expect(await failure(download(outsider, evdCold.id))).toMatchObject({ status: 403, code: 'EYE-AUT-001', message: denied.message });
      expect(await custodyChain(mCold.manifest_id)).toEqual(chainCold);
    });
    // A WITHDRAWN object (the B20 P7 idiom: withdrawn by a correction case): the canonical refusal, both ways, no custody row.
    await applyCase(await submitCorrection([evdWd.id], 'withdrawn by its publisher (B21 harness)', 'withdrawal'), [evdWd.id], 'withdrawal verified against the publisher');
    const withdrawnRefusal = { status: 409, code: 'EYE-STA-001', message: 'this evidence has been withdrawn and its bytes are no longer served' };
    expect(await failure(download(analyst, evdWd.id))).toMatchObject(withdrawnRefusal);
    const chainWd = await custodyChain(mWd.manifest_id);
    await withRootUnreachable('evidence', async () => { expect(await failure(download(analyst, evdWd.id))).toMatchObject(withdrawnRefusal); });
    expect(await custodyChain(mWd.manifest_id)).toEqual(chainWd);
    // A TOMBSTONED object (a superuser tombstone, the phase4-corrections F1 idiom): governed-deleted, both ways, no custody row.
    await sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${mTomb.manifest_id}::uuid, 'B21 V7: governed deletion (harness)', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const deletedRefusal = { status: 409, code: 'EYE-STA-001', message: 'the bytes for this evidence have been governed-deleted' };
    expect(await failure(download(analyst, evdTomb.id))).toMatchObject(deletedRefusal);
    const chainTomb = await custodyChain(mTomb.manifest_id);
    await withRootUnreachable('evidence', async () => { expect(await failure(download(analyst, evdTomb.id))).toMatchObject(deletedRefusal); });
    expect(await custodyChain(mTomb.manifest_id)).toEqual(chainTomb);
    expect(await degradedRows(mCold.manifest_id)).toEqual([]); expect(await degradedRows(mWd.manifest_id)).toEqual([]); expect(await degradedRows(mTomb.manifest_id)).toEqual([]);
    sixEvidence('V7', { fault_trace: 'the marker moved aside behind a denied, a withdrawn and a tombstoned read', watermark: 'none: refused before the tier is consulted', consumer_behaviour: { outsider: '403 EYE-AUT-001 both ways', withdrawn: '409 EYE-STA-001 both ways', tombstoned: '409 EYE-STA-001 both ways' }, operator_action: 'none', recovery: 'none', reconciliation: 'no custody row on any of the three manifests' });
  }, 180_000);

  it('V1 · CLASS A PINNED THROUGH THE ROUTE: a missing and a corrupt blob under a REACHABLE root answer ONE 409 shape, each with its custody.integrity_failed row COMMITTED beside the audit row success/EYE-INT-001 under the real decision (D2.6, reconciled with 0013\'s closure); the corrupt blob restored is served again; the detail serves the metadata tier throughout', async () => {
    const warm = await download(analyst, evdCorrupt.id);
    expect(warm.download).toMatchObject({ integrity: 'verified', tier: 'hot', availability: 'verified' });
    // (a) MISSING: the blob removed under the root; the refusal, the row, the audit row.
    rmSync(blobPath('evidence', mMissing.locator));
    expect(await vault.exists('evidence', scope(), mMissing.locator)).toBe(false);
    const seqA = await auditMark();
    const missing = await failure(download(analyst, evdMissing.id));
    expect(missing).toMatchObject({ status: 409, code: 'EYE-INT-001', message: INTEGRITY_REFUSED_MESSAGE });
    expect(Object.keys(missing.body).some((k) => /locator|path|root|vault/i.test(k))).toBe(false);
    expect(JSON.stringify(missing.body)).not.toContain(mMissing.locator);
    const failedMissing = await integrityRows(mMissing.manifest_id);
    expect(failedMissing).toHaveLength(1);
    expect(failedMissing[0]).toMatchObject({ digest_verified: false, content_digest: mMissing.content_digest, details: { failure: 'missing', disclosure: 'none', tier: 'hot' } });
    expect(await degradedRows(mMissing.manifest_id)).toEqual([]);
    const auditMissing = await auditRowsSince(seqA, 'observation.evidence.retrieve');
    // RECONCILED (D2.6 vs 0013): the custody row is a stamped business effect (0022 §13) and ctx.assert_operation_closed (0013) admits one only
    // beside EXACTLY ONE success audit row under the real decision — so the refused read's audit row is success/EYE-INT-001 (B20's D9 shape,
    // as the degraded read's success/EYE-DEG-001), never a failure row (that commit raised 23514 and rolled the custody row back with it).
    expect(auditMissing.map((r) => [r.outcome, r.result_code])).toEqual([['success', 'EYE-INT-001']]);
    expect(auditMissing[0]!.metadata).toMatchObject({ integrity: 'failed', digest_verified: false });
    expect(auditMissing[0]!.policy_decision_id).toMatch(UUID);
    expect(await decisionEvidenceOnly(String(auditMissing[0]!.policy_decision_id)), 'the audit row stands under the REAL decision (C10), not an evidence_only re-record').toBe(false);
    // (b) CORRUPT: the bytes overwritten (the A7 hook); the SAME shape (the two bodies equal but for the correlation id); the ledger knows why, the caller does not.
    const path = blobPath('evidence', mCorrupt.locator);
    const original = readFileSync(path);
    let corrupt: Awaited<ReturnType<typeof failure>>;
    try {
      await vault.overwriteForIntegrityTest('evidence', scope(), mCorrupt.locator, Buffer.from('tampered'));
      corrupt = await failure(download(analyst, evdCorrupt.id));
    } finally { writeFileSync(path, original); }
    expect(corrupt).toMatchObject({ status: 409, code: 'EYE-INT-001', message: INTEGRITY_REFUSED_MESSAGE });
    const strip = (b: Row): string => JSON.stringify(Object.fromEntries(Object.entries(b).filter(([k]) => !/correlation/i.test(k)).sort()));
    expect(strip(corrupt.body)).toBe(strip(missing.body));
    const failedCorrupt = await integrityRows(mCorrupt.manifest_id);
    expect(failedCorrupt).toHaveLength(1);
    expect(failedCorrupt[0]).toMatchObject({ digest_verified: false, details: { failure: 'corrupt', disclosure: 'none', tier: 'hot' } });
    // (c) THE RECOVERY of the corrupt one: the original bytes back, served; the chain durable [retrieved, integrity_failed, retrieved].
    const served = await download(analyst, evdCorrupt.id);
    expect(served.download).toMatchObject({ integrity: 'verified', availability: 'verified', contentDigest: mCorrupt.content_digest });
    expect(sha256(Buffer.from(String(served.download.base64), 'base64'))).toBe(mCorrupt.content_digest);
    expect((await custodyChain(mCorrupt.manifest_id)).slice(-3)).toEqual(['custody.retrieved', 'custody.integrity_failed', 'custody.retrieved']);
    // (d) THE DETAIL ROUTE serves the metadata tier for both throughout: the record stays (A7), the failure on its chain.
    const detail = await getEvidence(analyst, evdMissing.id);
    expect(detail.manifest).not.toBeNull();
    expect(detail.availability).toEqual({ tier: 'hot', state: 'hot' });
    expect(detail.custody.some((x) => x['event'] === 'custody.integrity_failed')).toBe(true);
    expect((await getEvidence(analyst, evdCorrupt.id)).custody.filter((x) => x['event'] === 'custody.integrity_failed')).toHaveLength(1);
    sixEvidence('V1', { fault_trace: { missing: `rm ${mMissing.manifest_id}`, corrupt: `overwrite ${mCorrupt.manifest_id} (restored)` }, watermark: 'the tier ledger hot; the roots reachable', consumer_behaviour: 'one 409 EYE-INT-001 shape for missing and corrupt (the bodies equal); the detail serves the record', operator_action: 'the corrupt blob restored from the kept bytes (a governed recover-from-verified-copies act is not built — stated); v21-missing stays refused (nothing can re-create bytes the vault lost)', recovery: 'the corrupt blob served again', reconciliation: 'custody.integrity_failed DURABLE beside the audit row success/EYE-INT-001 under the real decision (before B21 the row was rolled back with the thrown 409; a failure outcome cannot commit beside a business effect — 0013)' });
  }, 180_000);

  it('V2 · CLASS B ON THE ARCHIVE ROOT: the archived manifest answers 200 metadata-only with its custody.retrieval_degraded row (one per read) and the audit row success/EYE-DEG-001, the hot manifest is served beside it, the detail is unaffected, tier/state names the root; the marker restored → served again', async () => {
    const warm = await download(analyst, evdCold.id);
    expect(warm.download).toMatchObject({ contentDigest: mCold.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect(warm.download.degraded).toBeUndefined();
    expect((await custody(mCold.manifest_id, 'custody.retrieved'))[0]!.details).toMatchObject({ tier: 'archive', served_from: 'published' });
    const out = await withRootUnreachable('archive', async () => {
      const d = await download(analyst, evdCold.id);
      expect(d.download).toEqual({ filename: `${evdCold.id}.bin`, contentType: 'application/octet-stream', contentDisposition: 'attachment', contentDigest: mCold.content_digest, byteLength: Number(mCold.byte_length), base64: null, integrity: 'unavailable', tier: 'archive', availability: 'unreachable',
        degraded: { kind: 'tier_unreachable', code: 'EYE-DEG-001', root: 'archive', label: TIER_UNREACHABLE_LABEL('archive') } });
      const rows = await degradedRows(mCold.manifest_id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ digest_verified: null, content_digest: mCold.content_digest });
      expect(rows[0]!.details).toEqual({ failure: 'root_unreachable', root: 'archive', tier: 'archive', disclosure: 'none' });
      expect(await integrityRows(mCold.manifest_id)).toEqual([]);
      const audit = (await auditRowOf(d.receipt.auditSeq, 'observation.evidence.retrieve'))!;
      expect(audit).toMatchObject({ outcome: 'success', result_code: 'EYE-DEG-001' });
      expect(audit.metadata).toMatchObject({ integrity: 'unavailable', byte_length: null, digest_verified: null, tier: 'archive', root_unreachable: 'archive' });
      // a second read in the window: a second row (a read is evidence too), still no integrity incident
      const d2 = await download(analyst, evdCold.id);
      expect(d2.download.availability).toBe('unreachable');
      expect(await degradedRows(mCold.manifest_id)).toHaveLength(2);
      expect(await integrityRows(mCold.manifest_id)).toEqual([]);
      // THE HOT MANIFEST unaffected
      const hot = await download(analyst, evdHot.id);
      expect(hot.download).toMatchObject({ integrity: 'verified', availability: 'verified', tier: 'hot' });
      expect(sha256(Buffer.from(String(hot.download.base64), 'base64'))).toBe(mHot.content_digest);
      expect(await degradedRows(mHot.manifest_id)).toEqual([]);
      // THE DETAIL unaffected: the metadata tier serves the degraded reads' own record
      const detail = await getEvidence(analyst, evdCold.id);
      expect(detail.availability).toEqual({ tier: 'archive', state: 'archived' });
      expect(detail.custody.filter((x) => x['event'] === 'custody.retrieval_degraded')).toHaveLength(2);
      const st = (await tierState(analyst)).state;
      expect(st.vault.archive['reachable']).toBe(false); expect(st.vault.evidence['reachable']).toBe(true);
      return { auditSeq: d.receipt.auditSeq, label: d.download.degraded!.label };
    });
    const after = await download(analyst, evdCold.id);
    expect(after.download).toMatchObject({ integrity: 'verified', tier: 'archive', availability: 'archived' });
    expect(sha256(Buffer.from(String(after.download.base64), 'base64'))).toBe(mCold.content_digest);
    expect((await custodyChain(mCold.manifest_id)).slice(-4)).toEqual(['custody.retrieved', 'custody.retrieval_degraded', 'custody.retrieval_degraded', 'custody.retrieved']);
    expect((await tierState(analyst)).state.vault.archive['reachable']).toBe(true);
    sixEvidence('V2', { fault_trace: { marker: `${MARKER} of the archive root moved aside (the product's own definition of reachability, B18)` }, watermark: { tier: 'archive', availability: 'unreachable', label: out.label }, consumer_behaviour: '200 metadata-only with the degraded block (twice); the hot manifest served; the detail served', operator_action: 'the tier mounted (the marker restored); tier/state names the root', recovery: 'served again, the digest equal', reconciliation: { chain: '[retrieved, retrieval_degraded ×2, retrieved]', audit_seq: out.auditSeq, integrity_failed: 0 } });
  }, 180_000);

  it('V3 · CLASS B ON THE EVIDENCE ROOT: the hot manifests answer metadata-only (root evidence, tier hot), the archived one is served from its own reachable root, no integrity incident is recorded in the window; restored → served', async () => {
    const t0 = await mark();
    await withRootUnreachable('evidence', async () => {
      const d = await download(analyst, evdHot.id);
      expect(d.download).toMatchObject({ integrity: 'unavailable', availability: 'unreachable', tier: 'hot', base64: null, degraded: { kind: 'tier_unreachable', code: 'EYE-DEG-001', root: 'evidence', label: TIER_UNREACHABLE_LABEL('evidence') } });
      const rows = await degradedRows(mHot.manifest_id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.details).toEqual({ failure: 'root_unreachable', root: 'evidence', tier: 'hot', disclosure: 'none' });
      const cold = await download(analyst, evdCold.id);
      expect(cold.download).toMatchObject({ integrity: 'verified', tier: 'archive', availability: 'archived' });
      expect(await integrityFailedSince(t0), 'the class is never collapsed into missing').toBe(0);
    });
    const after = await download(analyst, evdHot.id);
    expect(after.download).toMatchObject({ integrity: 'verified', availability: 'verified' });
    expect((await custodyChain(mHot.manifest_id)).slice(-2)).toEqual(['custody.retrieval_degraded', 'custody.retrieved']);
    sixEvidence('V3', { fault_trace: { marker: `${MARKER} of the evidence root moved aside` }, watermark: { tier: 'hot', availability: 'unreachable' }, consumer_behaviour: 'the hot manifest metadata-only; the archived one served from the archive root (the fallback never consulted)', operator_action: 'the marker restored', recovery: 'served again', reconciliation: 'one retrieval_degraded row; zero integrity_failed rows in the window' });
  }, 180_000);

  it('V4(a) · THE SERIES READER discloses an archived window under an unreachable archive root as a tombstone is disclosed: unreadable with the degraded reason, complete false, INCOMPLETE, the forecast and the backtest refused, one custody row (read_for prediction.series); complete again after', async () => {
    // THE SERIES WORLD (the phase4-corrections idiom): three replayed windows, the series registered, an assumption to issue on.
    const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
    const run = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
    expect(run.state, run.reason).toBe('finished'); expect(run.admitted).toBe(3);
    const seriesKey = `fixture:${v.sourceKey}:value`;
    await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), T(), D(),
      { payload: { seriesKey, sourceKey: v.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
    const assumptionId = uuidv7();
    await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${assumptionId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    type Points = { total: number; evidence: number; unreadable: Array<{ evidence_object_id: string; evidence_version: number; reason: string }>; complete: boolean; note: string | null };
    const points = (as: AuthenticatedPrincipal) => prediction.seriesPoints(h.req(as, 'prediction.read', 'SER', null), T(), D(), seriesKey, { payload: { knownAt: new Date().toISOString(), limit: 5000 } }) as unknown as Promise<Points>;
    const whole = await points(owner);
    expect(whole).toMatchObject({ complete: true, unreadable: [] });
    // THE NEWEST WINDOW'S EVIDENCE archived by the B11 flow; still complete (the B11 pin: archived evidence stays served).
    const newest = (await sql<{ id: string; manifest_id: string }>`select e.object_id::text id, (e.payload ->> 'manifest_id') manifest_id from objects.canonical_objects e where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by e.recorded_at desc limit 1`.execute(su)).rows[0]!;
    const mSer = await manifestRow(newest.manifest_id);
    await archived(mSer);
    expect((await points(owner)).complete).toBe(true);
    const seq = await auditMark();
    const degraded = await withRootUnreachable('archive', async () => {
      const p = await points(owner);
      expect(p.complete).toBe(false);
      expect(p.unreadable).toHaveLength(1);
      expect(p.unreadable[0]).toMatchObject({ evidence_object_id: newest.id, reason: expect.stringMatching(/^degraded \(EYE-DEG-001\): the archive root of the vault could not be reached/) });
      expect(String(p.note)).toMatch(/INCOMPLETE/);
      expect(p.total).toBeLessThan(whole.total);
      const rows = await degradedRows(mSer.manifest_id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.details).toMatchObject({ failure: 'root_unreachable', root: 'archive', tier: 'archive', disclosure: 'none', read_for: 'prediction.series' });
      const audit = await auditRowsSince(seq, 'observation.evidence.retrieve');
      expect(audit.some((r) => r.outcome === 'success' && r.result_code === 'EYE-DEG-001'), JSON.stringify(audit)).toBe(true);
      expect(audit.some((r) => r.result_code === 'EYE-INT-001')).toBe(false);
      // the derivations refuse to build on an incomplete history (the phase4-corrections F1 loop)
      let refused = 0;
      for (const call of [
        () => prediction.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), T(), D(), { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-10-31', assumptions: [assumptionId], label: 'replay demonstration' } }),
        () => prediction.runBacktest(h.req(owner, 'prediction.backtest.record', 'BKT', null), T(), D(), { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), origins: 8 } }),
      ]) { try { await call(); } catch (e) { if (e instanceof HttpException && e.getStatus() >= 400 && e.getStatus() < 500) refused += 1; } }
      expect(refused, 'a forecast or backtest was built on an incomplete history').toBe(2);
      return p;
    });
    const again = await points(owner);
    expect(again).toMatchObject({ complete: true, unreadable: [], total: whole.total });
    sixEvidence('V4(a)', { fault_trace: { marker: 'the archive root', archived_window: newest.id }, watermark: { complete: false, note: degraded.note, total_without_the_window: degraded.total, total_whole: whole.total }, consumer_behaviour: 'the series incomplete with the degraded reason on the window; the forecast and the backtest refused; the twin reports the series\' refused string verbatim (stated, not exercised)', operator_action: 'the mount', recovery: 'complete again', reconciliation: 'one custody.retrieval_degraded row per read (read_for prediction.series); the audit row success/EYE-DEG-001' });
  }, 300_000);

  it('V5 · THE VERIFIER never concludes "bytes gone" from a root it could not read: a deletion executed, then verified under an unreachable evidence root → bytes_present NULL, the check failed, verified false, the action executed with infrastructure/retry, no DeletionVerified; verified after the mount', async () => {
    // THE DELETABLE MANIFEST (the B20 P7 idiom): the upload withdrawn by a correction case; its version-1 manifest deleted through the governed flow.
    await applyCase(await submitCorrection([evdDel.id], 'withdrawn by its publisher (B21 V5 harness)', 'withdrawal'), [evdDel.id], 'withdrawal verified against the publisher');
    const o = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mDel.manifest_id } });
    const id = o.action.actionId;
    const rs = await resolve(steward, id);
    expect(rs.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await approve(authority, id, String(rs.scope['scope_digest']));
    expect((await execute(steward, id)).execution).toMatchObject({ executed: 1, refused: 0, held: 0 });
    expect(await tombstones(mDel.manifest_id)).toBe(1);
    expect(await vault.exists('evidence', scope(), mDel.locator)).toBe(false);
    const since = await mark();
    await withRootUnreachable('evidence', async () => {
      const v = await verify(steward, id);
      expect(v.verification).toMatchObject({ verified: false, state: 'executed' });
      const check = (await verifications(id)).find((c) => /tombstoned and its bytes gone/.test(c.check_name));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(false);
      expect(check!.observed).toMatchObject({ tombstone: true, bytes_present: null });
      expect(await actionRow(id)).toMatchObject({ state: 'executed', failure_class: 'infrastructure', disposition: 'retry' });
      expect(await deletionVerifiedCount(since, id)).toBe(0);
      expect((await actionEvents(id)).some((e) => e.event === 'action.failed' && e.details['verification'] === 'failed')).toBe(true);
    });
    const v2 = await verify(steward, id);
    expect(v2.verification).toMatchObject({ verified: true, state: 'verified' });
    const passed = (await verifications(id)).filter((c) => /tombstoned and its bytes gone/.test(c.check_name));
    expect(passed.map((c) => c.passed)).toEqual([false, true]);
    expect(passed.at(-1)!.observed).toMatchObject({ tombstone: true, bytes_present: false });
    expect(await deletionVerifiedCount(since, id)).toBe(1);
    sixEvidence('V5', { fault_trace: { marker: 'the evidence root', action: id }, watermark: { bytes_present: null }, consumer_behaviour: 'verified false, the action executed with infrastructure/retry, no DeletionVerified', operator_action: 'the mount and a re-verify', recovery: 'verified; ONE DeletionVerified', reconciliation: 'retention.verifications keeps the failed check beside the passed one' });
  }, 300_000);
});
