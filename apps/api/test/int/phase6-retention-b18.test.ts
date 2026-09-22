/**
 * CP-6 B18 — correction 1 (Codex B17-F1): a revocation RESUMED after a crash between a record batch and the cleanup owes the EARLIER
 * ATTEMPT'S BYTES. At 2d92385 a record batch of `retention.import.revoke` (W3) committed its tombstone, the withdrawn version and the
 * item outcome before the finish and the filesystem removal; a resumed request started a fresh tally, skipped the settled items,
 * completed the import from the item map, removed only its own (empty) tally and reported `copies_destroyed: true` — the earlier
 * record's bytes still in the vault; only a third request (the retry branch) would have removed them. The correction builds the
 * cleanup and the receipt of every finish and every retry from the ITEM MAP (`durableRevocationOf`), removes every tombstoned
 * record's bytes in both roots (an earlier attempt's named `residual`), VERIFIES the removal against the vault before the receipt says
 * copies_destroyed (a locator still present is `remaining`, the receipt copies_refused with it named, the origin's notice mismatched,
 * the next revoke owes it), and adds no event on a redelivery of a completed revocation (ES-08-004, ES-29-005, AU-COM-0060/-0062,
 * AU-DP-0097) — on a real database with real Redis and the real outbox publisher (EYE_SCHEDULER_ENABLED at module top, the B6 rule),
 * an isolated vault, and a SECOND DOMAIN of the tenant (the mirror, created through the tenancy route) as the importing domain. The
 * fixture is the smallest that reaches the defect: no station, no subscription — the outbox rows are read as the ledger.
 *
 *   F1 (a) THE INTERRUPTION — records A and B with one claim on A exported from the origin (P1) and admitted into the mirror; the
 *   origin's revoke by a domain administrator of the origin (no authority in the mirror) → the importer answered `pending`, the notice
 *   notified; the steward's revoke with the service's test-only fault armed AFTER THE FIRST RECORD BATCH committed → the request
 *   rejected as an infrastructure fault; the import `revoking` at attempt 1 with import.revocation_failed the last event; BOTH record
 *   items `tombstoned` with their locators (one batch of two: the batch committed), the claim item withdrawn, the evidence rows'
 *   latest version withdrawn; the bytes of A and B STILL IN THE EVIDENCE ROOT — the defect's precondition; no import.revoked outbox
 *   row, no receipt event.
 *
 *   F1 (b) THE FIRST RESUMED REQUEST removes the earlier attempt's bytes: `revoked` at attempt 2 with `destroyed` (this attempt) all
 *   zero — nothing pending, everything settled at attempt 1 — and `cumulative` {records 2, claims 1}; `bytes.residual` the two
 *   locators, `bytes.removed` the same two, `failed` and `remaining` empty; the receipt copies_destroyed with `bytes_residual` the two,
 *   `bytes_remaining` empty, `destroyed.records` 2; the bytes gone from BOTH roots; the import `revoked` at attempt 2; the origin's
 *   importer notice acknowledged in place (attempt 1); exactly ONE GraphChanged/import.revoked of the import (both records, the
 *   claim) published; the import's events after the failure: revocation_started (pending 0), revoked, copies_destroyed — once.
 *
 *   F1 (c) A REDELIVERY adds no lifecycle effect: `retried`, every byte list empty, no receipt, the events unchanged, the one
 *   import.revoked row still one, the origin's notices unchanged.
 *
 *   F1 (d) THE REMOVAL FAILS on a resumed request and the residual is EXPLICIT: a second package (record C alone) admitted, the origin
 *   revoked pending, the steward's revoke faulted after the record batch (C tombstoned, its bytes present); the vault's fault hook
 *   armed (`f27.during_quarantine_tombstone`: the removal refused) and the resumed request → `revoked` (the ledger's finish is by the
 *   item map: nothing refused) BUT `bytes.residual` [C], `removed` [], `failed` [C], `remaining` [C]; the receipt copies_destroyed
 *   FALSE with `bytes_remaining` [C] and the statement naming them, the event import.copies_refused, the origin's notice MISMATCHED,
 *   the bytes still present. The THIRD request (the retry branch, the hook disarmed) → `retried` with `removed` [C], `residual` [C],
 *   `remaining` [], the receipt copies_destroyed true and retried, the event import.copies_destroyed, the origin's notice answered by
 *   a NEW attempt row acknowledged (attempt 2), the bytes gone; a FOURTH request → `retried` with no receipt and no new event.
 *
 * THE REFUTERS' FINDINGS on the correction (the three adversarial reviews: the resumed path, the residual path, the regressions on B17),
 * closed in the same correction and pinned here — read against the correction's own statements:
 *
 *   F2 · THE HAND-OFF (regression F1 / resume F-1; C9 completed). Two packages of the mirror share a copy: P2 = {A2, B2} admitted, P3 =
 *   {B2} with B2 REUSED from P2's item (`planned.reuse.item_id` = P2's B2 item, the B17 S3(e) pin); a legal hold on P2's copy of A2. The
 *   origin's revoke of P2 pending, then the steward's → `held`: A2 refused with the hold, B2 `left` with `held_by` [P3] (P3 admitted),
 *   the receipt copies_destroyed FALSE with held_by [P3] and the statement, the origin's notice mismatched, P2 REVOKING, B2's bytes
 *   present. Then the origin's revoke of P3 pending and the steward's revoke of P3 WHILE P2 IS REVOKING: P3's B2 item finds its source
 *   P2 revoking but P2's B2 item SETTLED `left` — the hand-off — and P3 DESTROYS the copy: the item tombstoned with the locator, the
 *   bytes gone from both roots, P3 `revoked`, the receipt copies_destroyed TRUE with no held_by, the origin's P3 notice acknowledged,
 *   `cumulative.records` 1, ONE import.revoked of P3 naming B2's copy. Then the hold lifted and the steward's revoke of P2: A2
 *   tombstoned, B2's item still `left` (settled), P2 `revoked` with `held_by_other` 1 on its counts, the receipt copies_destroyed TRUE
 *   (P3 revoked is not a live holder; nothing remaining), the origin's P2 notice answered ACKNOWLEDGED by a new attempt row; no byte of
 *   A2 or B2 in either root (`vault.exists` and `vault.anyBytesIn` false — no orphan of the mutual hand-off).
 *
 *   F3 · THE CRASH ORDERING (the refuter's second ordering; residual F3 — the ledger's last word). P4 = {A4, B4} admitted, P5 = {B4}
 *   reused from P4. The origin's revoke of P4 pending and the steward's revoke faulted AFTER THE GRAPH WRITE (there is no graph item:
 *   the fault fires before the claim and record batches) → P4 `revoking` at attempt 1 with BOTH record items pending, the bytes
 *   present. The origin's revoke of P5 pending and the steward's revoke of P5: B4's source P4 is revoking AND its B4 item PENDING — P4
 *   still owes the copy — so P5 leaves B4 `held_by` [P4]: P5 `revoked` with the receipt copies_destroyed FALSE, `held_by` [{P4, its
 *   origin action}] and the statement, the origin's P5 notice mismatched, no import.revoked of P5 (nothing destroyed), B4's bytes
 *   present. The steward's revoke of P4 resumed → no live reuser (P5 revoked) → A4 and B4 tombstoned, P4 `revoked` at attempt 2, the
 *   bytes gone, the receipt true, the origin's P4 notice acknowledged in place. Then the steward's revoke of P5 AGAIN (the retry
 *   branch): nothing present, nothing owed, the ledger's last receipt `copies_refused` → ONE `copies_destroyed` receipt (`retried`,
 *   no held_by) answering the origin by a new attempt row acknowledged — the notices [[1, mismatched], [2, acknowledged]] — and the
 *   event tail gains exactly one import.copies_destroyed; a further revoke → `retried` with no receipt and the events unchanged.
 *
 *   F4 · A STAGED-ONLY RESIDUE (residual F1). P6 = {A6} admitted, the origin's revoke pending, the steward's revoke faulted after the
 *   record batch (A6 tombstoned on the ledger, its bytes present). The harness then leaves ONLY A STAGED COPY behind: a file named
 *   `<id>.staging-<uuid>` beside the published copy in the evidence root, the published copy removed — `vault.exists` false while
 *   `vault.anyBytesIn` true. The resumed request finds the locator present by its staged copy: `bytes.residual` [A6], `removed` [A6],
 *   `remaining` and `failed` empty, the staged file GONE (the directory lists no `.staging-` name of the id), the receipt
 *   copies_destroyed with bytes_residual [A6], the origin's notice acknowledged. The unlistable-directory rule (a directory that cannot
 *   be listed counts as bytes present) is NOT pinned here: a chmod on the vault directory is flaky across CI runners and the rule is a
 *   two-line clause of `anyBytesIn`.
 *
 *   F5 · AN UNREACHABLE ROOT (residual F2). P7 = {A7} admitted, the origin's revoke pending, the steward's revoke faulted after the
 *   record batch. The harness then moves the ARCHIVE root's marker (`.eye-vault-root`, written by ensureRoots) aside —
 *   `vault.rootReachable('archive')` false — and resumes: the ledger finishes (`revoked`, attempt 2) but the cleanup proves nothing
 *   for the archive tier: `bytes.roots_unreachable` ['archive'], `remaining` [A7], `failed` [A7], `removed` [], `residual` [A7] (present
 *   in the reachable evidence root); the receipt copies_destroyed FALSE with `roots_unreachable` ['archive'], bytes_remaining [A7] and
 *   the statement "the archive root(s) of the vault could not be reached during the cleanup: nothing was removed and 1 tombstoned
 *   record(s) could not be verified gone …", the event import.copies_refused carrying the roots, the origin's notice mismatched. NOTHING
 *   is removed in ANY root by that attempt (the correction's rule: a half-removal would leave no list exact; the ledger's tombstone
 *   stands meanwhile), so the evidence-root copy is STILL PRESENT and the answer's `removed` [] is exactly true. The marker restored →
 *   `rootReachable` true → the retry finds the copy present in the evidence root, removes it and verifies both roots: `removed` [A7],
 *   `residual` [A7], `remaining` [], `roots_unreachable` [], ONE `copies_destroyed` receipt (`retried`, destroyed.bytes 1) answering the
 *   origin by a new attempt row: the notices [[1, mismatched], [2, acknowledged]], the bytes gone in both roots; a further revoke adds
 *   nothing.
 *
 * Read against the design's own statements, what this harness does NOT claim: the crash is INJECTED IN-PROCESS (the service's
 * test-only hook throws after the record batch's write committed, or after the graph write), not a killed PostgreSQL-backed process —
 * the state it leaves is the one Codex reproduced, the process that leaves it is not the one that dies; the vault's fault hook stands
 * in for an unremovable file (a permission, a mount gone); the STAGED COPY of F4 and the MISSING MARKER of F5 are placed by the harness
 * with the filesystem, not by an interrupted archive or an unmounted volume — the states are the ones the refuters named, the
 * processes that leave them are not exercised; the per-object copy lock's serialisation of two concurrent revocations is proven by
 * ORDERING (F2's two requests run one after the other under the lock's decision rule), not by two concurrent processes; the propagation
 * reaches the tenant's own domains on this installation (the station path and the subscribers' deliveries are the B17 harness's); the
 * legal hold on a first attempt is B17 S3's (F2 exercises it only as the cause of the `revoking` holder).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { canonicalHeaderDigest, type CanonicalHeader, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { TenancyController } from '../../src/tenancy/tenancy.controller.js';
import { ImportService } from '../../src/retention/import.service.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { buildUstar, listedFilesOf } from '../../src/retention/export-archive.js';
import { keyIdOf } from '../../src/retention/export-signing.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing) is enabled BEFORE the boot, at module top — the GraphChanged rows are read published.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b18-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
type KeyPair = { privateKey: KeyObject; publicKey: KeyObject };
/** KEY1 signs every export and every notice of the tenant (bound by reference before the boot) — the mirror's one partner (the B17 S1 idiom). */
const KEY1: KeyPair = generateKeyPairSync('ed25519');
const KEY_REF = 'EYE_EXPORT_SIGNING_KEY_B18';
process.env[KEY_REF] = (KEY1.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
const keyIdOfPair = (k: KeyPair): string => keyIdOf(k.publicKey.export({ type: 'spki', format: 'der' }) as Buffer);
const pemOf = (k: KeyPair): string => `${spkiPem(k.publicKey)}\n`;
const ORIGIN_PARTNER = 'b18-origin'; const ORIGIN_PARTY = 'NORDWERK GmbH (origin domain; harness)';

type Row = Record<string, unknown>;
type Check = { name: string; ok: boolean | null; detail: string | null };
type OpenAnswer = { import: Row; checks: Check[]; items: Row[]; verified: boolean; importReceipt: Row; receipt: Row };
type ImportDetail = { import: Row; partner: Row | null; items: Row[]; events: Row[]; checks: Check[]; importReceipt: Row; receipt: Row };
type AdmitAnswer = { import: Row; batches: Row[]; receipt: Row };
type RevocationSource = { kind: 'origin' } | { kind: 'station'; destinationKey: string };
/** B18: the bytes of a revocation attempt as the design states them — removed, failed, residual (an earlier attempt's), remaining (verified still present), the roots whose marker could not be read. */
type RevocationBytes = { removed: string[]; failed: string[]; residual: string[]; remaining: string[]; roots_unreachable: string[] };
type RevocationFault = 'after_graph_write' | 'after_record_batch';
type RevocationCounts = { records: number; claims: number; entities: number; edges: number };
/** The revocation block of the import revoke route's answer (§3.3 RevokeImportAnswer; B18: `cumulative` and the four byte lists). */
type ImportRevocation = { state: string; attempt: number; source: Row | null; notice: Row | null; destroyed: RevocationCounts; cumulative?: RevocationCounts; left: number; refused: Row[]; bytes: RevocationBytes | null; receipt: Row | null; answered: Row | null; station_receipt: Row | null; reason?: string };
type RevokeImportAnswer = { import: Row; revocation: ImportRevocation; batches: Row[]; receipt: Row };
type Importer = Row & { notice: Row & { notice: Row }; revocation: Partial<ImportRevocation> & { state: string; reason?: string } };
type RevokeAnswer = { revocation: Row; notices: Row[]; importers: Importer[]; bytes: { removed: boolean }; stations: Row[]; receipt: Row };
/** The B16 and B17 routes of the retention controller this harness drives in process, as the B17 harness drives them. */
interface B18Routes {
  declarePartner(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<{ partner: Row; receipt: Row }>;
  openImport(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<OpenAnswer>;
  approveImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { packageDigest?: string; rationale?: string } }): Promise<{ import: Row; receipt: Row }>;
  admitImport(req: never, tenantId: string, domainId: string, importId: string): Promise<AdmitAnswer>;
  getImport(req: never, tenantId: string, domainId: string, importId: string): Promise<ImportDetail>;
  revokeImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { source?: RevocationSource } }): Promise<RevokeImportAnswer>;
  revokeExport(req: never, tenantId: string, domainId: string, actionId: string, body: { payload?: { reason?: string } }): Promise<RevokeAnswer>;
}

let h: Phase4Harness; let retention: RetentionController; let b18: B18Routes; let observation: ObservationController;
let imports: ImportService; let vault: VaultService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal;
/** The mirror domain (D2) and its people: the steward who resumes the revocation, the administrator who declares the partner, the registrar and the manager of the intake source. */
let D2 = ''; let steward2: AuthenticatedPrincipal; let domainAdmin2: AuthenticatedPrincipal; let registrar2: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal;
let intake = { sourceId: '', version: 1, sourceKey: '' };
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const ZERO: RevocationCounts = { records: 0, claims: 0, entities: 0, edges: 0 };

/* ───────────── the rows ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
type ManifestRow = { manifest_id: string; source_id: string; contract_version: number; content_digest: string; byte_length: number; locator: string; classification: string; domain_id: string };
const manifestRow = async (manifestId: string): Promise<ManifestRow> => (await sql<ManifestRow>`select manifest_id::text, source_id::text, contract_version::int, content_digest, byte_length::int, locator, classification, domain_id::text from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const tombstonesOf = async (manifestId: string) => (await sql<{ tombstone_id: string; reason: string }>`select tombstone_id::text, reason from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows;
type ExportRow = { package_digest: string; archive_digest: string | null; byte_total: number; expires_at: Date | null; revoked_at: Date | null; manifest_digest: string; signing_key_id: string | null };
const exportRow = async (id: string): Promise<ExportRow> => (await sql<ExportRow>`select package_digest, archive_digest, byte_total::int, expires_at, revoked_at, manifest_digest, signing_key_id from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const actionEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
type NoticeRow = { notice_id: string; attempt: number; state: string; destination_id: string | null; delivery_id: string | null; importer: Row | null; notice: Row; receipt: Row | null; acknowledged_at: Date | null };
const noticeRows = async (actionId: string): Promise<NoticeRow[]> => (await sql<NoticeRow>`select notice_id::text, attempt::int, state, destination_id::text, delivery_id::text, importer, notice, receipt, acknowledged_at from retention.export_revocation_notices where action_id = ${actionId}::uuid order by notified_at, attempt`.execute(su)).rows;
const importerNotices = async (actionId: string, importId: string): Promise<NoticeRow[]> => (await noticeRows(actionId)).filter((n) => n.importer !== null && String(n.importer['import_id']) === importId);
type ImportRow = { import_id: string; state: string; verified: boolean; partner_id: string | null; package_digest: string | null; origin: Row; counts: Row; admitted_by: string | null; attempts: number; revoked_by: string | null; revoked_at: Date | null; revocation: Row | null; revocation_attempts: number };
const importRow = async (importId: string): Promise<ImportRow | undefined> => (await sql<ImportRow>`select import_id::text, state, verified, partner_id::text, package_digest, origin, counts, admitted_by::text, attempts::int, revoked_by::text, revoked_at, revocation, revocation_attempts::int from retention.imports where import_id = ${importId}::uuid`.execute(su)).rows[0];
const importEvents = async (importId: string) => (await sql<{ event: string; details: Row; actor_principal_id: string | null; correlation_id: string; occurred_at: Date }>`select event, details, actor_principal_id::text, correlation_id::text, occurred_at from retention.import_events where import_id = ${importId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const eventsAfterFinalized = async (importId: string): Promise<string[]> => { const ev = (await importEvents(importId)).map((e) => e.event); return ev.slice(ev.lastIndexOf('import.finalized') + 1); };
type ItemRow = { item_id: string; kind: string; origin_ref: string; disposition: string; admitted: Row | null; dependency_order: number; revocation: Row | null; revoked_at: Date | null };
const importItems = async (importId: string): Promise<ItemRow[]> => (await sql<ItemRow>`select item_id::text, kind, origin_ref, disposition, admitted, dependency_order::int, revocation, revoked_at from retention.import_items where import_id = ${importId}::uuid order by dependency_order`.execute(su)).rows;
type ObjectRow = { object_id: string; object_version: number; object_type: string; lifecycle_state: string; truth_state: string; withdrawal_reason: string | null; method_ref: string | null; payload: Row; domain_id: string };
const objectRows = async (objectId: string): Promise<ObjectRow[]> => (await sql<ObjectRow>`select object_id::text, object_version::int, object_type, lifecycle_state, truth_state, withdrawal_reason, method_ref, payload, domain_id::text from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const blobExists = (vaultName: 'quarantine' | 'evidence' | 'archive', domainId: string, locator: string) => vault.exists(vaultName, { tenantId: T(), domainId }, locator);
/** A record's locator as the ITEM MAP records it after a revocation attempt (`revocation.locator`) — the admitted locator, restated on the outcome. */
const locatorOf = (item: ItemRow): string => {
  const admitted = String((item.admitted ?? {})['locator']);
  const rev = item.revocation ?? {};
  expect(rev['outcome'], `${item.kind} ${item.origin_ref}: the item settled`).toBe('tombstoned');
  expect(rev['locator'], `${item.kind} ${item.origin_ref}: the outcome restates the admitted locator`).toBe(admitted);
  return String(rev['locator']);
};

/* ───────────── the outbox (the B6 idioms, in the mirror; no subscription: the rows are the ledger) ───────────── */
type OutboxRow = { id: string; status: string; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
const outboxRowsIn = async (domainId: string, eventType: string, after: Date): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows;
/** A marker on the DATABASE clock (outbox created_at is the write transaction's now(); both come back at millisecond precision, so the match is >=). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
/** The GraphChanged rows of a kind of one import in the domain since the mark, without waiting — whatever their status (the case asserts how many). */
const changeRowsOf = (domainId: string, kind: string, after: Date, importId: string): Promise<OutboxRow[]> =>
  outboxRowsIn(domainId, 'GraphChanged', after).then((rows) => rows.filter((r) => (r.payload['change'] as Row)['kind'] === kind && (r.payload['cause'] as Row)['target_id'] === importId));
/** The GraphChanged rows of a kind of one import since the mark, every one published by the real outbox tick. */
const publishedIn = (domainId: string, kind: string, after: Date, importId: string): Promise<OutboxRow[]> =>
  waitFor(`the GraphChanged/${kind} row of import ${importId} published`, () => changeRowsOf(domainId, kind, after, importId), (rows) => rows.length > 0 && rows.every((r) => r.status === 'published'));
const payloadOf = (r: OutboxRow) => r.payload as unknown as { schema: string; change: Row; identities: Row[]; relationships: { edges: Row[] }; objects: Row & { claims: string[]; evidence: string[] }; cause: Row; import: Row };

/* ───────────── the routes (D1 as the B16 harness; the mirror by `reqIn`) ───────────── */
const reqIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  ({ eyeEnvelope: { ...(h.req(as, action, objectType, objectId, purpose) as { eyeEnvelope: Row }).eyeEnvelope, domain_id: domainId }, eyePrincipal: as }) as never;
const envIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string): Envelope => ({ ...h.env(as, action, objectType, objectId, purpose), domain_id: domainId } as Envelope);
const routeIn = (domainId: string, action: string, objectType: string, objectId: string | null) => ({ scope: 'DOMAIN' as const, tenantId: T(), domainId, action, objectType, objectId });
type Exported = { id: string; domainId: string; packageDigest: string; archiveDigest: string; manifestDigest: string; expiresAt: string | null; dir: string };
/** A customer export in the origin domain: opened, resolved and executed by the domain's steward, approved by the tenant's retention authority, verified (the B16/B17 idiom). */
const exported = async (manifestIds: string[], ceiling = 'internal'): Promise<Exported> => {
  const domainId = D(); const opener = steward;
  const o = await retention.openAction(reqIn(opener, domainId, 'retention.action.open', 'RTA', null, 'retention'), T(), domainId, { payload: { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: ceiling } } }) as { action: { actionId: string } };
  const id = o.action.actionId;
  const r = await retention.resolveScope(reqIn(opener, domainId, 'retention.action.resolve', 'RTA', id, 'retention'), T(), domainId, id) as { scope: Row };
  await retention.approve(reqIn(authority, domainId, 'retention.action.approve', 'RTA', id, 'retention'), T(), domainId, id, { payload: { scopeDigest: String(r.scope['scope_digest']), rationale: 'the scope as resolved' } });
  const ex = await retention.execute(reqIn(opener, domainId, 'retention.action.execute', 'RTA', id, 'retention'), T(), domainId, id) as { execution: { executed: number; held: number; refused: number } };
  expect(ex.execution).toMatchObject({ executed: manifestIds.length, refused: 0, held: 0 });
  expect((await retention.verify(reqIn(opener, domainId, 'retention.action.verify', 'RTA', id, 'retention'), T(), domainId, id) as { verification: Row }).verification).toMatchObject({ verified: true });
  const row = await exportRow(id);
  expect(row.archive_digest).toMatch(HEX64);
  return { id, domainId, packageDigest: row.package_digest, archiveDigest: row.archive_digest!, manifestDigest: row.manifest_digest, expiresAt: instantOf(row.expires_at), dir: join(vault.rootFor('export'), T(), domainId, id) };
};
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string) => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose: 'demonstration' } }) as Promise<{ key: Row }>;
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => b18.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
// The B16 routes in the mirror domain, and the B17 revoke act.
const openImport = (p: AuthenticatedPrincipal, source: Row, domainId = D2) => b18.openImport(reqIn(p, domainId, 'retention.import.open', 'RIM', null, 'retention'), T(), domainId, { payload: { source } });
const openInline = (p: AuthenticatedPrincipal, tar: Buffer) => openImport(p, { kind: 'inline', base64: tar.toString('base64') });
const approveImport = (p: AuthenticatedPrincipal, importId: string, packageDigest: string, rationale = 'the package as verified (harness)') => b18.approveImport(reqIn(p, D2, 'retention.import.approve', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { packageDigest, rationale } });
const admitImport = (p: AuthenticatedPrincipal, importId: string) => b18.admitImport(reqIn(p, D2, 'retention.import.admit', 'RIM', importId, 'retention'), T(), D2, importId);
const getImport = (p: AuthenticatedPrincipal, importId: string) => b18.getImport(reqIn(p, D2, 'retention.read', 'RIM', importId, 'retention'), T(), D2, importId);
const revokeImport = (p: AuthenticatedPrincipal, importId: string, source: RevocationSource = { kind: 'origin' }) => b18.revokeImport(reqIn(p, D2, 'retention.import.revoke', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { source } });
const declarePartner = (p: AuthenticatedPrincipal, payload: Row) => b18.declarePartner(reqIn(p, D2, 'retention.partner.declare', 'RXP', null, 'retention'), T(), D2, { payload });
const declarePartnerFor = (key: KeyPair, partnerKey: string, party: string) => declarePartner(domainAdmin2, { partnerKey, party, purpose: `the exchange of ${party}'s records into the mirror (harness)`, publicKeyPem: pemOf(key), intakeSourceId: intake.sourceId, intakeContractVersion: intake.version });
/** The whole import as the steward sees it: opened (verified), approved by the authority on the digest, admitted by the steward; the item map by origin reference. */
type Imported = { importId: string; admitted: AdmitAnswer; detail: ImportDetail; map: Map<string, string>; itemOf: (kind: string, originRef: string) => Row; adm: (kind: string, originRef: string) => Row };
const imported = async (open: OpenAnswer): Promise<Imported> => {
  const importId = String(open.import['import_id']);
  expect(open.verified, failedChecks(open.checks).join(' | ')).toBe(true);
  await approveImport(authority, importId, String(open.import['package_digest']));
  const admitted = await admitImport(steward2, importId);
  expect(admitted.import['state']).toBe('admitted');
  const detail = await getImport(steward2, importId);
  const itemOf = (kind: string, originRef: string): Row => { const i = detail.items.find((x) => x['kind'] === kind && x['origin_ref'] === originRef); expect(i, `${kind} ${originRef} among the items of ${importId}`).toBeDefined(); return i!; };
  const adm = (kind: string, originRef: string): Row => { const a = itemOf(kind, originRef)['admitted']; expect(a, `${kind} ${originRef} admitted or reused`).not.toBeNull(); return a as Row; };
  return { importId, admitted, detail, map: mapOfItems(detail.items), itemOf, adm };
};
/** THE MAP of an import: every origin id → the mirror's id (records and claims by object id), as the B16 harness builds it. */
const mapOfItems = (items: Row[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const i of items) {
    const a = i['admitted'] as Row | null | undefined; if (a === null || a === undefined) continue;
    const kind = String(i['kind']); const ref = String(i['origin_ref']);
    if (kind === 'record' || kind === 'claim') map.set(ref.split('@')[0]!, String(a['object_id']));
    else if (kind === 'entity') map.set(ref.replace(/^entity:/, ''), String(a['entity_id']));
    else if (kind === 'edge') map.set(ref.replace(/^edge:/, ''), String(a['edge_id']));
  }
  return map;
};

/* ───────────── refusals, checks ───────────── */
/** A refused call: the message matched whatever the carrier — the port's raw text in process, or an HttpException with its status (asserted when both are given). */
const refused = async (p: Promise<unknown>, re: RegExp, status?: number): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error(`the call should have been refused (${re})`); }, (err: unknown) => err as { status?: unknown; message?: unknown });
  const message = String(e.message ?? ''); const s = typeof e.status === 'number' ? e.status : null;
  expect(message).toMatch(re);
  if (status !== undefined && s !== null) expect(s).toBe(status);
  return { status: s, message };
};
const failedChecks = (checks: Check[]) => checks.filter((c) => c.ok === false).map((c) => `${c.name}${c.detail === null ? '' : ` — ${c.detail}`}`);

/* ───────────── the package as a tar in the harness's hands (the B16 idiom): read from the export directory, built into the product's own archive ───────────── */
type Pkg = { manifest: Row; files: Map<string, Buffer> };
const manifestBytesOf = (m: Row): Buffer => Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8');
const packageOf = (dir: string): Pkg => { const manifest = readJson(join(dir, 'manifest.json')); const files = new Map<string, Buffer>(); for (const f of listedFilesOf(manifest['objects'], manifest as never)) files.set(f, readFileSync(join(dir, f))); return { manifest, files }; };
/** The package's tar as the product builds it (manifest.json first, then the listed files by name, at the manifest's built_at) — the B15 harness proved buildUstar = the product's archive. */
const tarOfPkg = (p: Pkg): Buffer => { const m = p.manifest; const mtime = Math.floor(Date.parse(String((m['package'] as Row)['built_at'])) / 1000); return buildUstar([{ name: 'manifest.json', bytes: manifestBytesOf(m) }, ...listedFilesOf(m['objects'], m as never).map((name) => ({ name, bytes: p.files.get(name)! }))], mtime); };
const tarOfDir = (dir: string): Buffer => tarOfPkg(packageOf(dir));

/* ───────────── the origin's derived knowledge, seeded as the extraction admits it (the B16 idiom) ───────────── */
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
const REL_PAYLOAD = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait' };
/** A claim version as the extraction would have admitted it: the complete header, the payload the claim schema admits, its lineage row on the evidence BYTES, a run row; truth state `extracted`. Written by the superuser. */
async function seedClaim(a: { type: 'REL' | 'ENT'; evidence: Evd; classification: 'internal' | 'confidential'; payload: Row }): Promise<{ claimId: string; version: number; runId: string; methodId: string }> {
  const claimId = uuidv7(); const version = 1; const runId = uuidv7(); const methodId = uuidv7(); const now = new Date().toISOString();
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: a.evidence.bytesDigest, byte_start: 0, byte_end: 4, extraction_identity: sha256(`${claimId}@${version}`), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload: Row = { ...a.payload, confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: claimId, object_type: a.type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [a.evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${a.evidence.id}@${a.evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: a.classification, purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${a.type}@v1`, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${a.classification}, 'intelligence', null, null, null, null, null, null, null, ${header.schema_ref}, null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.evidence.bytesDigest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, version, runId, methodId };
}
const upload = async (files: Array<{ name: string; text: string }>, ceiling: 'internal' | 'confidential' = 'internal', label = ''): Promise<Evd[]> =>
  (await h.upload(files.map((f) => ({ filename: `${f.name}.csv`, text: f.text, documentTime: '2024-01-14T00:00:00Z' })), ceiling, label)).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest }));
const uploadOne = async (name: string): Promise<{ evd: Evd; m: ManifestRow }> => {
  const evd = (await upload([{ name, text: TERMS_CSV.replace('assumption', `assumption (${name})`) }]))[0]!;
  const m = await manifestRow((await manifestOf(evd.id, 1)).manifest_id);
  expect(evd.bytesDigest).toBe(m.content_digest);
  return { evd, m };
};

/* ───────────── the mirror's intake source (the B16 idiom): an upload contract registered through the real route, approved and activated by the mirror's operators ───────────── */
const registryWriteIn = (domainId: string, p: AuthenticatedPrincipal, action: string, sourceId: string, fn: (cap: ReturnType<typeof ObservationCapability.registry>) => Promise<void>) =>
  h.pipeline.write(envIn(p, domainId, action, 'SRC', sourceId, 'observation'), p, routeIn(domainId, action, 'SRC', sourceId), ObservationCapability.registry,
    async (cap) => { await fn(cap); return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null }; });
const intakeSourceIn = async (domainId: string): Promise<{ sourceId: string; version: number; sourceKey: string }> => {
  const sourceKey = `b18-exchange-intake-${uuidv7().slice(-8)}`;
  const sourceId = ((await observation.registerSource(reqIn(registrar2, domainId, 'observation.source.register', 'SRC', null, 'observation'), T(), domainId, { payload: { contract: uploadContract(sourceKey, 'internal') } })) as { source: { sourceId: string } }).source.sourceId;
  await registryWriteIn(domainId, manager2, 'observation.source.approve', sourceId, async (cap) => { await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId, decision: 'approve', reason: 'the mirror\'s intake (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
  await registryWriteIn(domainId, manager2, 'observation.source.transition', sourceId, async (cap) => { await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId, target: 'active', reason: 'the mirror\'s intake: active (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
  return { sourceId, version: 1, sourceKey };
};

/* ───────────── the interruption driver (the B17 S3(d) idiom, moved one boundary later) ───────────── */
/**
 * The origin's revoke by a DOMAIN ADMINISTRATOR of the origin — no authority in the mirror — so the importer is answered `pending` with
 * the notice notified and the mirror untouched (B17 D7); then the mirror's steward's own revoke with the service's test-only fault armed
 * AFTER THE FIRST RECORD BATCH committed: the request rejected as an infrastructure fault, the import left `revoking` at attempt 1 —
 * the state Codex reproduced. Returns the pending notice's id.
 */
const interruptedRevocationOf = async (pkg: Exported, importId: string, label: string, kind: RevocationFault = 'after_record_batch'): Promise<{ noticeId: string }> => {
  const { noticeId } = await originRevokedPending(pkg, importId, label);
  await faultedRevokeOf(importId, kind);
  return { noticeId };
};
/** The origin's revoke by a domain administrator of the origin: the importer answered `pending`, the notice notified, the import untouched. Returns the notice's id. */
const originRevokedPending = async (pkg: Exported, importId: string, label: string): Promise<{ noticeId: string }> => {
  const rd = await revokeExport(domainAdmin, pkg.id, `the origin's domain administrator revokes ${label} (harness)`);
  expect(rd.importers).toHaveLength(1);
  expect(rd.importers[0]!.revocation.state).toBe('pending');
  expect(rd.importers[0]!.revocation.reason).toMatch(/no authority in the importing domain/);
  expect(rd.importers[0]!.notice).toMatchObject({ state: 'notified', attempt: 1, importer: expect.objectContaining({ import_id: importId }) });
  const noticeId = String(rd.importers[0]!.notice['notice_id']);
  expect((await importRow(importId))!).toMatchObject({ state: 'admitted', revocation_attempts: 0 });
  expect(await eventsAfterFinalized(importId)).toEqual(['import.revocation_notified']);
  return { noticeId };
};
/** The steward's revoke with the service's test-only fault armed at the kind given (fires once): the request rejected, the import `revoking` at attempt 1 with the failure recorded. */
const FAULT_TEXT: Record<RevocationFault, RegExp> = { after_record_batch: /injected infrastructure fault after a record batch committed/, after_graph_write: /injected infrastructure fault after the graph write/ };
const faultedRevokeOf = async (importId: string, kind: RevocationFault): Promise<void> => {
  imports.armRevocationFaultForTests(kind);
  try { await refused(revokeImport(steward2, importId), FAULT_TEXT[kind]); }
  finally { imports.armRevocationFaultForTests(null); }
  expect((await importRow(importId))!).toMatchObject({ state: 'revoking', revocation_attempts: 1, revoked_at: null, revocation: null });
  const failed = (await importEvents(importId)).at(-1)!;
  expect(failed.event).toBe('import.revocation_failed');
  expect(failed.details).toMatchObject({ attempt: 1, infrastructure: true, reason: expect.stringMatching(FAULT_TEXT[kind]) });
};

/* ───────────── the legal hold (the B17 S3(a)/(c) idiom), the vault on disk (F4, F5) ───────────── */
const placeHold = async (evdId: string, reason: string): Promise<string> => {
  const hold = await observation.placeLegalHold(reqIn(domainAdmin2, D2, 'observation.legal_hold.place', 'LGH', evdId, 'observation'), T(), D2, evdId, { payload: { reason } }) as { hold: { holdId: string; manifestId: string } };
  return hold.hold.holdId;
};
const liftHold = (holdId: string) => observation.liftLegalHold(reqIn(domainAdmin2, D2, 'observation.legal_hold.lift', 'LGH', holdId, 'observation'), T(), D2, holdId, { payload: { reason: 'the litigation concluded (harness)' } });
/** The published copy's path of a locator in a root (the locator's three segments under the root — the vault's own layout). */
const pathOfLocator = (vaultName: 'evidence' | 'archive', locator: string): string => { const [tenant, domain, id] = locator.split('/') as [string, string, string]; return join(vault.rootFor(vaultName), tenant, domain, id); };
/** The staged-copy names of a locator in a root, as the vault lists them (`<id>.staging-<uuid>` exactly). */
const stagedNamesOf = (vaultName: 'evidence' | 'archive', locator: string): string[] => { const p = pathOfLocator(vaultName, locator); const re = new RegExp(`^${basename(p)}\\.staging-[0-9a-f-]{36}$`); return existsSync(dirname(p)) ? readdirSync(dirname(p)).filter((n) => re.test(n)).sort() : []; };
/** No byte of a locator in either root — the published copy AND any staged copy (the vault's own `anyBytesIn`, and `exists` beside it). */
const noBytesOf = async (locator: string): Promise<void> => {
  for (const v of ['evidence', 'archive'] as const) {
    expect(await blobExists(v, D2, locator), `${v}: the published copy of ${locator} gone`).toBe(false);
    expect(await vault.anyBytesIn(v, { tenantId: T(), domainId: D2 }, locator), `${v}: no byte of ${locator} — published or staged`).toBe(false);
  }
};
const MARKER = '.eye-vault-root';

/* ───────────── the fixtures the cases share ───────────── */
let A: Evd; let B: Evd; let mA: ManifestRow; let mB: ManifestRow;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { TenancyController: Tc } = await import('../../src/tenancy/tenancy.controller.js');
  retention = h.app.get(Rc); b18 = retention as unknown as B18Routes; observation = h.app.get(Oc);
  imports = h.app.get(ImportService); vault = h.app.get(VaultService);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b18-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b18-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b18-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b18-tenant-admin', 'TENANT');
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'resolution_manager'], 'b18-owner');
  // THE MIRROR DOMAIN: a second domain of the tenant through the tenancy route (the tenant administrator's act), with its own people.
  const tenancy = h.app.get(Tc) as TenancyController;
  const envT = { ...(h.req(tenantAdmin, 'tenancy.domain.create', 'CID', null, 'platform.administration') as { eyeEnvelope: Row }).eyeEnvelope, scope: 'TENANT', domain_id: null };
  D2 = ((await tenancy.createDomain({ eyeEnvelope: envT, eyePrincipal: tenantAdmin } as never, T(), { payload: { name: `NORDWERK Exchange Mirror (SYNTHETIC) ${uuidv7().slice(-6)}` } })) as { domain: { id: string } }).domain.id;
  steward2 = await h.humanWithSession(['retention_steward'], 'b18-mirror-steward', 'DOMAIN', { domainId: D2 });
  domainAdmin2 = await h.humanWithSession(['domain_admin'], 'b18-mirror-admin', 'DOMAIN', { domainId: D2 });
  registrar2 = await h.humanWithSession(['domain_analyst'], 'b18-mirror-registrar', 'DOMAIN', { domainId: D2 });
  manager2 = await h.humanWithSession(['collection_manager'], 'b18-mirror-manager', 'DOMAIN', { domainId: D2 });
  intake = await intakeSourceIn(D2);
  await declareKey(tenantAdmin, KEY_REF);
  // The mirror's one partner: the origin (KEY1, the tenant's own key).
  const partner = (await declarePartnerFor(KEY1, ORIGIN_PARTNER, ORIGIN_PARTY)).partner;
  expect(partner).toMatchObject({ partner_key: ORIGIN_PARTNER, key_id: keyIdOfPair(KEY1), state: 'active' });
  // THE ORIGIN'S RECORDS: A and B, one claim on A (no entity, no edge: the graph write of a revocation has nothing to do — the fixture is the record batch's).
  ({ evd: A, m: mA } = await uploadOne('b18-a')); ({ evd: B, m: mB } = await uploadOne('b18-b'));
  await seedClaim({ type: 'REL', evidence: A, classification: 'internal', payload: REL_PAYLOAD });
}, 300_000);

afterAll(async () => {
  delete process.env[KEY_REF];
  fault.disarm();
  try { imports?.armRevocationFaultForTests(null); } catch { /* the service may not have booted */ }
  await h?.close();
  await su?.destroy();
  rmSync(VAULT_DIR, { recursive: true, force: true });
}, 120_000);

describe('F1 · Codex B17-F1 — a revocation resumed after a crash between a record batch and the cleanup (B18 correction 1)', () => {
  it('F1 · (a) the interruption after the first record batch: revoking at attempt 1, both records tombstoned on the ledger, their bytes STILL in the vault, no import.revoked, no receipt; (b) the first resumed request removes the earlier attempt\'s bytes as `residual`, verifies both roots, says copies_destroyed with the cumulative counts, acknowledges the origin\'s pending notice, ONE import.revoked; (c) a redelivery moves nothing and adds no event', async () => {
    const P1 = await exported([mA.manifest_id, mB.manifest_id]);
    const t0 = await mark();
    const i1 = await imported(await openInline(steward2, tarOfDir(P1.dir)));
    const { importId, map } = i1;
    for (const id of [A.id, B.id]) { expect(map.get(id), `the mirror's id of ${id}`).toMatch(UUID); expect(map.get(id)).not.toBe(id); }
    expect(i1.detail.items.map((i) => i['kind']).sort()).toEqual(['claim', 'record', 'record']);
    expect(i1.detail.items.every((i) => i['disposition'] === 'admitted')).toBe(true);
    const claimRef = String(i1.detail.items.find((i) => i['kind'] === 'claim')!['origin_ref']);
    const claimCopy = String(i1.adm('claim', claimRef)['object_id']);
    // The admission's ONE import.admitted published (the outbox publisher runs: the same tick publishes the revocation's row in (b)).
    expect(await publishedIn(D2, 'import.admitted', t0, importId)).toHaveLength(1);
    const locA0 = String(i1.adm('record', `${A.id}@1`)['locator']); const locB0 = String(i1.adm('record', `${B.id}@1`)['locator']);
    expect(await blobExists('evidence', D2, locA0)).toBe(true); expect(await blobExists('evidence', D2, locB0)).toBe(true);

    // (a) THE INTERRUPTION: the origin's revoke pending (a domain administrator of the origin), the steward's revoke faulted after the record batch committed.
    const ta = await mark();
    const { noticeId } = await interruptedRevocationOf(P1, importId, 'P1');
    // The ledger after the crash: the claim batch and the record batch committed (one batch of two records), the finish never reached.
    const tailA = await eventsAfterFinalized(importId);
    expect(tailA).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.batch_revoked', 'import.revocation_failed']);
    const evA = await importEvents(importId);
    expect(evA.find((e) => e.event === 'import.revocation_started')!.details).toMatchObject({ attempt: 1, pending: 3, source: expect.objectContaining({ kind: 'origin', action_id: P1.id, notice_id: noticeId }) });
    const batchesA = evA.filter((e) => e.event === 'import.batch_revoked');
    expect(batchesA[0]!.details).toMatchObject({ kind: 'claim', batch: 1, count: 1, withdrawn: 1, refused: 0, left: 0, skipped: 0 });
    expect(batchesA[1]!.details).toMatchObject({ kind: 'record', batch: 1, count: 2, tombstoned: 2, refused: 0, left: 0, skipped: 0 });
    // BOTH record items tombstoned with their locators; the claim item withdrawn; every item settled (nothing pending for a resumed attempt).
    const itemsA = await importItems(importId);
    const recA = itemsA.find((i) => i.kind === 'record' && i.origin_ref === `${A.id}@1`)!; const recB = itemsA.find((i) => i.kind === 'record' && i.origin_ref === `${B.id}@1`)!;
    const locA = locatorOf(recA); const locB = locatorOf(recB);
    expect([locA, locB]).toEqual([locA0, locB0]);
    expect(recA.revocation).toMatchObject({ outcome: 'tombstoned', object_id: map.get(A.id), manifest_id: String(recA.admitted!['manifest_id']), from_version: 1, to_version: 2, notice_id: noticeId });
    expect(itemsA.find((i) => i.kind === 'claim')!.revocation).toMatchObject({ outcome: 'withdrawn', object_id: claimCopy });
    expect(itemsA.every((i) => i.revoked_at !== null)).toBe(true);
    // The withdrawn versions and the tombstone rows stand; the BYTES are behind — the defect's precondition — in the evidence root (the archive root never held them).
    for (const [evd, rec] of [[A, recA], [B, recB]] as const) {
      expect((await objectRows(map.get(evd.id)!)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]);
      expect(await tombstonesOf(String(rec.admitted!['manifest_id']))).toHaveLength(1);
    }
    expect((await objectRows(claimCopy)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'active'], [2, 'withdrawn']]);
    expect(await blobExists('evidence', D2, locA)).toBe(true); expect(await blobExists('evidence', D2, locB)).toBe(true);
    expect(await blobExists('archive', D2, locA)).toBe(false); expect(await blobExists('archive', D2, locB)).toBe(false);
    // No finish: no import.revoked row of this import in the outbox (the rows are written in the finish's transaction), no receipt event; the origin's notice still notified.
    expect(await changeRowsOf(D2, 'import.revoked', ta, importId)).toEqual([]);
    expect(evA.filter((e) => e.event === 'import.copies_destroyed' || e.event === 'import.copies_refused')).toEqual([]);
    expect((await importerNotices(P1.id, importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[noticeId, 1, 'notified']]);

    // (b) THE FIRST RESUMED REQUEST: nothing pending — this attempt settles nothing — and the item map owes the two locators: removed as residual, verified gone, the receipt true.
    const rb = await revokeImport(steward2, importId);
    expect(rb.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: ZERO, cumulative: { records: 2, claims: 1, entities: 0, edges: 0 }, left: 0, refused: [], station_receipt: null });
    expect(rb.revocation.source).toMatchObject({ kind: 'origin', action_id: P1.id, notice_id: noticeId, package_digest: P1.packageDigest });
    expect(rb.batches.map((b) => b['kind'])).toEqual(['finish']);
    const bytesB = rb.revocation.bytes!;
    expect(sorted(bytesB.residual)).toEqual(sorted([locA, locB]));
    expect(sorted(bytesB.removed)).toEqual(sorted([locA, locB]));
    expect(bytesB.failed).toEqual([]); expect(bytesB.remaining).toEqual([]);
    const receiptB = rb.revocation.receipt!;
    expect(receiptB).toMatchObject({ copies_destroyed: true, notice_id: noticeId, action_id: P1.id, package_digest: P1.packageDigest, destroyed: { records: 2, claims: 1, entities: 0, edges: 0, bytes: 2 }, refused: [], bytes_failed: [], bytes_remaining: [], recipient: `import:${T()}/${D2}/${importId}`, import_id: importId });
    expect(sorted(receiptB['bytes_residual'] as string[])).toEqual(sorted([locA, locB]));
    expect(receiptB['held_by']).toBeUndefined(); expect(receiptB['statement']).toBeUndefined(); expect(receiptB['retried']).toBeUndefined();
    expect(rb.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 1, notice_id: noticeId, action_id: P1.id });
    // The bytes gone from BOTH roots; the import revoked at attempt 2 with the item map's counts; the origin's notice acknowledged in place.
    for (const l of [locA, locB]) { expect(await blobExists('evidence', D2, l)).toBe(false); expect(await blobExists('archive', D2, l)).toBe(false); }
    const rowB = (await importRow(importId))!;
    expect(rowB).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 2 });
    expect(rowB.revoked_at).not.toBeNull();
    expect(rowB.revocation).toMatchObject({ kind: 'origin', action_id: P1.id, notice_id: noticeId, attempts: 2, counts: expect.objectContaining({ tombstoned: 2, withdrawn: 1, held_by_other: 0 }) });
    expect((await importerNotices(P1.id, importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[noticeId, 1, 'acknowledged']]);
    const nB = (await importerNotices(P1.id, importId))[0]!;
    expect(nB.receipt).toMatchObject({ copies_destroyed: true, receipt_id: receiptB['receipt_id'] });
    expect((await actionEvents(P1.id)).find((e) => e.event === 'export.revocation_acknowledged')?.details).toMatchObject({ notice_id: noticeId, attempt: 1, state: 'acknowledged', copies_destroyed: true, answered_by: expect.stringMatching(/importing domain/) });
    // The import's events after the failure: the resumed attempt began with NOTHING pending, finished, and recorded ONE receipt — copies_destroyed once, carrying the four byte lists.
    const tailB = await eventsAfterFinalized(importId);
    expect(tailB).toEqual([...tailA, 'import.revocation_started', 'import.revoked', 'import.copies_destroyed']);
    const evB = await importEvents(importId);
    expect(evB.filter((e) => e.event === 'import.revocation_started').at(-1)!.details).toMatchObject({ attempt: 2, pending: 0 });
    expect(evB.filter((e) => e.event === 'import.revoked')).toHaveLength(1);
    expect(evB.find((e) => e.event === 'import.revoked')!.details).toMatchObject({ attempts: 2, counts: expect.objectContaining({ tombstoned: 2, withdrawn: 1 }) });
    const cdB = evB.filter((e) => e.event === 'import.copies_destroyed');
    expect(cdB).toHaveLength(1);
    expect(cdB[0]!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptB['receipt_id'], copies_destroyed: true }), bytes: { removed: bytesB.removed, failed: [], residual: bytesB.residual, remaining: [], roots_unreachable: [] } });
    expect(evB.filter((e) => e.event === 'import.copies_refused')).toEqual([]);
    // Exactly ONE GraphChanged/import.revoked of this import, published: both records and the claim, the notice, the cause.
    const rows = await publishedIn(D2, 'import.revoked', ta, importId);
    expect(rows).toHaveLength(1);
    const p = payloadOf(rows[0]!);
    expect(p.change).toMatchObject({ kind: 'import.revoked' });
    expect(sorted(p.objects.evidence)).toEqual(sorted([map.get(A.id), map.get(B.id)]));
    expect(p.objects.claims).toEqual([claimCopy]);
    expect(p.identities).toEqual([]); expect(p.relationships.edges).toEqual([]);
    expect(p.import).toMatchObject({ import_id: importId, partner_key: ORIGIN_PARTNER, origin: { action_id: P1.id, package_digest: P1.packageDigest }, notice: { notice_id: noticeId, source: 'origin' } });
    expect(p.cause).toEqual({ action: 'retention.import.revoke', actor: steward2.principalId, target_type: 'RIM', target_id: importId });

    // (c) A REDELIVERY: the retry branch finds nothing present, a receipt event standing for attempt 2 and no pending notice — nothing moves, nothing is recorded.
    const eventsBefore = evB.length; const noticesBefore = await noticeRows(P1.id);
    const rc = await revokeImport(steward2, importId);
    expect(rc.revocation).toMatchObject({ state: 'retried', attempt: 2, destroyed: { records: 2, claims: 1, entities: 0, edges: 0 }, cumulative: { records: 2, claims: 1, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null, notice: null, station_receipt: null });
    expect(rc.batches).toEqual([]);
    expect((await importEvents(importId)).length).toBe(eventsBefore);
    expect((await importRow(importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect(await noticeRows(P1.id)).toEqual(noticesBefore);
    expect(await changeRowsOf(D2, 'import.revoked', ta, importId)).toHaveLength(1);
    for (const l of [locA, locB]) expect(await blobExists('evidence', D2, l)).toBe(false);
  }, 300_000);

  it('F1 · (d) the removal fails on the resumed request: revoked by the item map BUT bytes.remaining names the record, the receipt copies_refused with the statement, the origin\'s notice mismatched, the bytes present; the third request (the retry branch) removes them, records copies_destroyed and answers the origin by a new attempt row; a fourth adds nothing', async () => {
    // The second package: record C alone; admitted into the mirror; the origin's revoke pending; the steward's revoke faulted after the record batch.
    const { evd: C, m: mC } = await uploadOne('b18-c');
    const P2 = await exported([mC.manifest_id]);
    const td = await mark();
    const i2 = await imported(await openInline(steward2, tarOfDir(P2.dir)));
    const importId = i2.importId;
    expect(i2.detail.items.map((i) => i['kind'])).toEqual(['record']);
    expect(await publishedIn(D2, 'import.admitted', td, importId)).toHaveLength(1);
    const { noticeId } = await interruptedRevocationOf(P2, importId, 'P2');
    expect(await eventsAfterFinalized(importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_failed']);
    const recC = (await importItems(importId)).find((i) => i.kind === 'record')!;
    const locC = locatorOf(recC);
    expect(await blobExists('evidence', D2, locC)).toBe(true);
    expect(await changeRowsOf(D2, 'import.revoked', td, importId)).toEqual([]);

    // THE RESUMED REQUEST with the vault's removal REFUSED (the fault hook fires once, on the evidence root's removal): the ledger finishes — nothing refused on the item map — but the bytes are said to remain.
    fault.arm(['f27.during_quarantine_tombstone'], 'test');
    const rr = await revokeImport(steward2, importId).finally(() => fault.disarm());
    expect(rr.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: ZERO, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { residual: [locC], removed: [], failed: [locC], remaining: [locC], roots_unreachable: [] } });
    const receiptR = rr.revocation.receipt!;
    expect(receiptR).toMatchObject({ copies_destroyed: false, notice_id: noticeId, package_digest: P2.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 0 }, refused: [], bytes_failed: [locC], bytes_residual: [locC], bytes_remaining: [locC] });
    // The statement counts (the receipt travels under a station ceiling; the locators are the lists', cut at 200 with bytes_truncated said).
    expect(String(receiptR['statement'])).toMatch(/^the bytes of 1 tombstoned record\(s\) remain in the vault after the removal; the ledger's revocation stands and the next revoke of this import removes them$/);
    expect(receiptR['bytes_truncated']).toBeUndefined(); expect(receiptR['roots_unreachable']).toBeUndefined();
    expect(receiptR['held_by']).toBeUndefined(); expect(receiptR['retried']).toBeUndefined();
    expect(rr.revocation.answered).toMatchObject({ answered: true, state: 'mismatched', attempt: 1, notice_id: noticeId });
    expect(await blobExists('evidence', D2, locC)).toBe(true);
    const rowR = (await importRow(importId))!;
    expect(rowR).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 2 });
    expect(rowR.revocation).toMatchObject({ counts: expect.objectContaining({ tombstoned: 1, held_by_other: 0 }), attempts: 2 });
    const tailR = await eventsAfterFinalized(importId);
    expect(tailR).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_failed', 'import.revocation_started', 'import.revoked', 'import.copies_refused']);
    const evR = await importEvents(importId);
    expect(evR.at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptR['receipt_id'], copies_destroyed: false }), bytes: { removed: [], failed: [locC], residual: [locC], remaining: [locC], roots_unreachable: [] } });
    expect((await importerNotices(P2.id, importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[noticeId, 1, 'mismatched']]);
    expect((await importerNotices(P2.id, importId))[0]!.receipt).toMatchObject({ copies_destroyed: false, bytes_remaining: [locC] });
    expect((await actionEvents(P2.id)).find((e) => e.event === 'export.revocation_mismatched')?.details).toMatchObject({ notice_id: noticeId, attempt: 1, state: 'mismatched', copies_destroyed: false, expected: { package_digest: P2.packageDigest, copies_destroyed: true }, received: { package_digest: P2.packageDigest, copies_destroyed: false } });
    const rowsR = await publishedIn(D2, 'import.revoked', td, importId);
    expect(rowsR).toHaveLength(1);
    expect(payloadOf(rowsR[0]!).objects).toMatchObject({ evidence: [i2.map.get(C.id)], claims: [] });

    // THE THIRD REQUEST — the retry branch, the hook disarmed: the owed locator found present (residual), removed, verified gone; a fresh receipt copies_destroyed, retried; the origin answered by a NEW attempt row.
    const r3 = await revokeImport(steward2, importId);
    expect(r3.revocation).toMatchObject({ state: 'retried', attempt: 2, destroyed: { records: 1, claims: 0, entities: 0, edges: 0 }, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, refused: [], bytes: { removed: [locC], failed: [], residual: [locC], remaining: [], roots_unreachable: [] }, station_receipt: null });
    const receipt3 = r3.revocation.receipt!;
    expect(receipt3).toMatchObject({ copies_destroyed: true, retried: true, notice_id: noticeId, package_digest: P2.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 1 }, refused: [], bytes_failed: [], bytes_residual: [locC], bytes_remaining: [] });
    expect(receipt3['statement']).toBeUndefined();
    expect(r3.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 2, action_id: P2.id });
    expect(String(r3.revocation.answered!['notice_id'])).not.toBe(noticeId);
    expect(r3.batches).toEqual([]);
    expect(await blobExists('evidence', D2, locC)).toBe(false); expect(await blobExists('archive', D2, locC)).toBe(false);
    expect((await importRow(importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect(await eventsAfterFinalized(importId)).toEqual([...tailR, 'import.copies_destroyed']);
    const ev3 = await importEvents(importId);
    expect(ev3.at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receipt3['receipt_id'], copies_destroyed: true, retried: true }), bytes: { removed: [locC], failed: [], residual: [locC], remaining: [], roots_unreachable: [] } });
    const n3 = await importerNotices(P2.id, importId);
    expect(n3.map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
    expect(n3[1]!.notice).toMatchObject({ answered_by_importer: true, attempt: 2 });
    expect(n3[1]!.receipt).toMatchObject({ receipt_id: receipt3['receipt_id'], copies_destroyed: true });
    expect((await actionEvents(P2.id)).filter((e) => e.event === 'export.revocation_acknowledged').map((e) => e.details['attempt'])).toEqual([2]);
    expect(await changeRowsOf(D2, 'import.revoked', td, importId)).toHaveLength(1);

    // A FOURTH REQUEST: nothing present, a receipt event standing for the latest attempt, no pending notice — retried with no receipt, no new event, the notices unchanged.
    const eventsBefore = ev3.length;
    const r4 = await revokeImport(steward2, importId);
    expect(r4.revocation).toMatchObject({ state: 'retried', attempt: 2, bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null });
    expect((await importEvents(importId)).length).toBe(eventsBefore);
    expect((await importerNotices(P2.id, importId)).map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
    expect(await changeRowsOf(D2, 'import.revoked', td, importId)).toHaveLength(1);
  }, 300_000);
});

describe('F2–F5 · the refuters\' findings on the correction closed: the hand-off, the crash ordering and the ledger\'s last word, a staged-only residue, an unreachable root', () => {
  it('F2 · THE HAND-OFF: P3 reuses P2\'s copy of B2; a hold on P2\'s A2 → P2 held (A2 refused, B2 left held_by P3, revoking); P3 revoked WHILE P2 is revoking → P2\'s B2 item is settled `left`, so P3 destroys the copy (tombstoned, the bytes gone, copies_destroyed true, acknowledged); the hold lifted → P2 revoked with A2 tombstoned, B2 still left, copies_destroyed true (P3 is not a live holder), acknowledged; no orphan in either root', async () => {
    // THE STATE: P2 = {A2, B2} admitted; P3 = {B2} with B2 reused from P2's item (the B17 S3(e) pin), the same copy and locator.
    const { evd: A2, m: mA2 } = await uploadOne('b18-f2-a'); const { evd: B2, m: mB2 } = await uploadOne('b18-f2-b');
    const P2 = await exported([mA2.manifest_id, mB2.manifest_id]);
    const t2 = await mark();
    const p2 = await imported(await openInline(steward2, tarOfDir(P2.dir)));
    expect(p2.detail.items.map((i) => i['kind'])).toEqual(['record', 'record']);
    expect(p2.detail.items.every((i) => i['disposition'] === 'admitted')).toBe(true);
    expect(await publishedIn(D2, 'import.admitted', t2, p2.importId)).toHaveLength(1);
    const a2Copy = p2.adm('record', `${A2.id}@1`); const b2Copy = p2.adm('record', `${B2.id}@1`);
    const evdA2 = String(a2Copy['object_id']); const evdB2 = String(b2Copy['object_id']);
    const locA2 = String(a2Copy['locator']); const locB2 = String(b2Copy['locator']);
    const P3 = await exported([mB2.manifest_id]);
    const t3 = await mark();
    const p3 = await imported(await openInline(steward2, tarOfDir(P3.dir)));
    const p3b = p3.itemOf('record', `${B2.id}@1`);
    expect(p3b).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: evdB2, locator: locB2 }) });
    expect((p3b['planned'] as Row)['reuse']).toMatchObject({ import_id: p2.importId, item_id: String(p2.itemOf('record', `${B2.id}@1`)['item_id']) });
    expect(payloadOf((await publishedIn(D2, 'import.admitted', t3, p3.importId))[0]!).objects).toMatchObject({ claims: [], evidence: [] });
    for (const l of [locA2, locB2]) { expect(await blobExists('evidence', D2, l)).toBe(true); expect(await blobExists('archive', D2, l)).toBe(false); }
    const holdId = await placeHold(evdA2, 'litigation hold on the imported record A2 (harness)');

    // (a) THE ORIGIN'S REVOKE OF P2 pending, the steward's → HELD: A2 refused with the hold, B2 left held_by P3 (admitted), the receipt false with held_by, the notice mismatched, P2 revoking.
    const { noticeId: n2 } = await originRevokedPending(P2, p2.importId, 'P2');
    const ta = await mark();
    const ra = await revokeImport(steward2, p2.importId);
    expect(ra.revocation).toMatchObject({ state: 'held', attempt: 1, destroyed: ZERO, cumulative: ZERO, left: 1, bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, station_receipt: null });
    expect(ra.revocation.refused).toHaveLength(1);
    expect(ra.revocation.refused[0]).toMatchObject({ kind: 'record', origin_ref: `${A2.id}@1`, hold_id: holdId, manifest_id: String(a2Copy['manifest_id']), reason: expect.stringMatching(/legal hold/) });
    expect(ra.batches.map((b) => b['kind'])).toEqual(['record', 'finish']);
    expect(ra.batches[0]).toMatchObject({ kind: 'record', count: 2, tombstoned: 0, refused: 1, left: 1, skipped: 0 });
    expect(ra.batches[1]).toMatchObject({ kind: 'finish', complete: false });
    const receiptA = ra.revocation.receipt!;
    expect(receiptA).toMatchObject({ copies_destroyed: false, notice_id: n2, package_digest: P2.packageDigest, destroyed: { records: 0, claims: 0, entities: 0, edges: 0, bytes: 0 }, held_by: [{ import_id: p3.importId, origin_action_id: P3.id }], bytes_failed: [], bytes_residual: [], bytes_remaining: [] });
    expect(receiptA['refused']).toEqual([{ manifest_id: String(a2Copy['manifest_id']), ref: `${A2.id}@1`, reason: expect.stringMatching(/legal hold/), hold_id: holdId }]);
    expect(String(receiptA['statement'])).toMatch(new RegExp(`^the copies remain under import\\(s\\) ${p3.importId} of this domain, admitted from the origin's other package\\(s\\); revoking those packages destroys them$`));
    expect(receiptA['roots_unreachable']).toBeUndefined(); expect(receiptA['retried']).toBeUndefined();
    expect(ra.revocation.answered).toMatchObject({ answered: true, state: 'mismatched', attempt: 1, notice_id: n2 });
    expect((await importRow(p2.importId))!).toMatchObject({ state: 'revoking', revocation_attempts: 1, revoked_at: null, revocation: null });
    const itemsA = await importItems(p2.importId);
    expect(itemsA.find((i) => i.origin_ref === `${A2.id}@1`)!.revocation).toMatchObject({ outcome: 'refused', gate: 'legal_hold', hold_id: holdId, locator: locA2 });
    expect(itemsA.find((i) => i.origin_ref === `${B2.id}@1`)!.revocation).toMatchObject({ outcome: 'left', kind: 'record', held_by: [p3.importId], reason: expect.stringMatching(/held under import/) });
    expect(await eventsAfterFinalized(p2.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_held', 'import.copies_refused']);
    expect((await objectRows(evdA2)).map((r) => r.lifecycle_state)).toEqual(['admitted']); expect((await objectRows(evdB2)).map((r) => r.lifecycle_state)).toEqual(['admitted']);
    expect(await tombstonesOf(String(a2Copy['manifest_id']))).toEqual([]); expect(await tombstonesOf(String(b2Copy['manifest_id']))).toEqual([]);
    expect(await blobExists('evidence', D2, locA2)).toBe(true); expect(await blobExists('evidence', D2, locB2)).toBe(true);
    expect((await importerNotices(P2.id, p2.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n2, 1, 'mismatched']]);
    expect(await changeRowsOf(D2, 'import.revoked', ta, p2.importId)).toEqual([]);

    // (b) THE ORIGIN'S REVOKE OF P3 pending, the steward's revoke of P3 WHILE P2 IS REVOKING: P2's B2 item is settled `left` — the hand-off — so P3 destroys the copy.
    const { noticeId: n3 } = await originRevokedPending(P3, p3.importId, 'P3');
    expect((await importRow(p2.importId))!.state).toBe('revoking');
    const tb = await mark();
    const rb = await revokeImport(steward2, p3.importId);
    expect(rb.revocation).toMatchObject({ state: 'revoked', attempt: 1, destroyed: { records: 1, claims: 0, entities: 0, edges: 0 }, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { removed: [locB2], failed: [], residual: [], remaining: [], roots_unreachable: [] }, station_receipt: null });
    expect(rb.revocation.source).toMatchObject({ kind: 'origin', action_id: P3.id, notice_id: n3, package_digest: P3.packageDigest });
    expect(rb.batches.map((b) => b['kind'])).toEqual(['record', 'finish']);
    expect(rb.batches[0]).toMatchObject({ kind: 'record', count: 1, tombstoned: 1, refused: 0, left: 0, skipped: 0 });
    const receiptB = rb.revocation.receipt!;
    expect(receiptB).toMatchObject({ copies_destroyed: true, notice_id: n3, action_id: P3.id, package_digest: P3.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 1 }, refused: [], bytes_failed: [], bytes_residual: [], bytes_remaining: [], import_id: p3.importId });
    expect(receiptB['held_by']).toBeUndefined(); expect(receiptB['statement']).toBeUndefined(); expect(receiptB['retried']).toBeUndefined();
    expect(rb.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 1, notice_id: n3, action_id: P3.id });
    const p3Item = (await importItems(p3.importId)).find((i) => i.kind === 'record')!;
    expect(locatorOf(p3Item)).toBe(locB2);
    expect(p3Item.revocation).toMatchObject({ outcome: 'tombstoned', object_id: evdB2, manifest_id: String(b2Copy['manifest_id']), from_version: 1, to_version: 2, notice_id: n3 });
    expect((await objectRows(evdB2)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]);
    expect(await tombstonesOf(String(b2Copy['manifest_id']))).toHaveLength(1);
    await noBytesOf(locB2);
    const rowB = (await importRow(p3.importId))!;
    expect(rowB).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 1 });
    expect(rowB.revocation).toMatchObject({ kind: 'origin', action_id: P3.id, notice_id: n3, attempts: 1, counts: { tombstoned: 1, held_by_other: 0 } });
    expect(await eventsAfterFinalized(p3.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revoked', 'import.copies_destroyed']);
    expect((await importerNotices(P3.id, p3.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n3, 1, 'acknowledged']]);
    expect((await importerNotices(P3.id, p3.importId))[0]!.receipt).toMatchObject({ copies_destroyed: true, receipt_id: receiptB['receipt_id'] });
    const rowsB = await publishedIn(D2, 'import.revoked', tb, p3.importId);
    expect(rowsB).toHaveLength(1);
    expect(payloadOf(rowsB[0]!).objects).toMatchObject({ evidence: [evdB2], claims: [] });
    expect(payloadOf(rowsB[0]!).import).toMatchObject({ import_id: p3.importId, notice: { notice_id: n3, source: 'origin' } });
    // P2's B2 item is still `left` under P3 (settled at attempt 1 — the hand-off is the item map's fact, not rewritten); P2 still revoking; A2's bytes present under the hold.
    expect((await importItems(p2.importId)).find((i) => i.origin_ref === `${B2.id}@1`)!.revocation).toMatchObject({ outcome: 'left', held_by: [p3.importId] });
    expect((await importRow(p2.importId))!).toMatchObject({ state: 'revoking', revocation_attempts: 1 });
    expect(await blobExists('evidence', D2, locA2)).toBe(true);

    // (c) THE HOLD LIFTED and the steward's revoke of P2: A2 tombstoned, B2's item left as settled, P2 revoked; the receipt TRUE (P3 revoked is no live holder, nothing remaining); the origin answered acknowledged by a new attempt row.
    await liftHold(holdId);
    const tc = await mark();
    const rc = await revokeImport(steward2, p2.importId);
    expect(rc.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: { records: 1, claims: 0, entities: 0, edges: 0 }, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { removed: [locA2], failed: [], residual: [], remaining: [], roots_unreachable: [] }, station_receipt: null });
    expect(rc.batches.map((b) => b['kind'])).toEqual(['record', 'finish']);
    expect(rc.batches[0]).toMatchObject({ kind: 'record', count: 1, tombstoned: 1, refused: 0, left: 0, skipped: 0 });
    expect(rc.batches[1]).toMatchObject({ kind: 'finish', complete: true });
    const receiptC = rc.revocation.receipt!;
    // The resumed attempt's source names NO notice (the begin port references only a NOTIFIED notice; P2's was answered mismatched at attempt 1): the receipt's notice_id null, the origin answered by a NEW attempt row.
    expect(rc.revocation.source).toMatchObject({ kind: 'origin', action_id: P2.id, notice_id: null, package_digest: P2.packageDigest });
    expect(receiptC).toMatchObject({ copies_destroyed: true, notice_id: null, action_id: P2.id, package_digest: P2.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 1 }, refused: [], bytes_failed: [], bytes_residual: [], bytes_remaining: [], import_id: p2.importId });
    expect(receiptC['held_by']).toBeUndefined(); expect(receiptC['statement']).toBeUndefined(); expect(receiptC['retried']).toBeUndefined();
    expect(rc.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 2, action_id: P2.id });
    expect(String(rc.revocation.answered!['notice_id'])).not.toBe(n2);
    const itemsC = await importItems(p2.importId);
    const a2Item = itemsC.find((i) => i.origin_ref === `${A2.id}@1`)!;
    expect(locatorOf(a2Item)).toBe(locA2);
    expect(a2Item.revocation).toMatchObject({ outcome: 'tombstoned', object_id: evdA2, from_version: 1, to_version: 2, notice_id: null });
    expect(itemsC.find((i) => i.origin_ref === `${B2.id}@1`)!.revocation).toMatchObject({ outcome: 'left', held_by: [p3.importId] });
    expect((await objectRows(evdA2)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]);
    expect(await tombstonesOf(String(a2Copy['manifest_id']))).toHaveLength(1);
    const rowC = (await importRow(p2.importId))!;
    expect(rowC).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 2 });
    expect(rowC.revocation).toMatchObject({ kind: 'origin', action_id: P2.id, notice_id: null, attempts: 2, counts: { tombstoned: 1, left: 1, held_by_other: 1 } });
    expect(await eventsAfterFinalized(p2.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_held', 'import.copies_refused', 'import.revocation_started', 'import.batch_revoked', 'import.revoked', 'import.copies_destroyed']);
    const evC = await importEvents(p2.importId);
    expect(evC.filter((e) => e.event === 'import.revocation_started').at(-1)!.details).toMatchObject({ attempt: 2, pending: 1 });
    expect(evC.at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptC['receipt_id'], copies_destroyed: true }), bytes: { removed: [locA2], failed: [], residual: [], remaining: [], roots_unreachable: [] } });
    const nC = await importerNotices(P2.id, p2.importId);
    expect(nC.map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
    expect(nC[1]!.notice).toMatchObject({ answered_by_importer: true, attempt: 2 });
    expect(nC[1]!.receipt).toMatchObject({ receipt_id: receiptC['receipt_id'], copies_destroyed: true });
    const rowsC = await publishedIn(D2, 'import.revoked', tc, p2.importId);
    expect(rowsC).toHaveLength(1);
    expect(payloadOf(rowsC[0]!).objects).toMatchObject({ evidence: [evdA2], claims: [] });
    // NO ORPHAN: nothing of A2 or B2 in either root — published or staged.
    await noBytesOf(locA2); await noBytesOf(locB2);
    // A redelivery of either: retried, nothing moved, no receipt.
    for (const id of [p2.importId, p3.importId]) {
      const before = (await importEvents(id)).length;
      expect((await revokeImport(steward2, id)).revocation).toMatchObject({ state: 'retried', bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null });
      expect((await importEvents(id)).length).toBe(before);
    }
  }, 300_000);

  it('F3 · THE CRASH ORDERING: P4 faulted after the graph write (both records pending, revoking); P5 revoked while P4 still owes B4 → B4 left held_by P4, copies_destroyed false, mismatched; P4 resumed destroys A4 and B4 (no live reuser); P5 revoked AGAIN → the ledger\'s last word copies_refused with nothing owed → ONE copies_destroyed receipt (retried), the origin acknowledged by a new attempt; a further revoke adds nothing', async () => {
    const { evd: A4, m: mA4 } = await uploadOne('b18-f3-a'); const { evd: B4, m: mB4 } = await uploadOne('b18-f3-b');
    const P4 = await exported([mA4.manifest_id, mB4.manifest_id]);
    const t4 = await mark();
    const p4 = await imported(await openInline(steward2, tarOfDir(P4.dir)));
    expect(await publishedIn(D2, 'import.admitted', t4, p4.importId)).toHaveLength(1);
    const a4Copy = p4.adm('record', `${A4.id}@1`); const b4Copy = p4.adm('record', `${B4.id}@1`);
    const evdA4 = String(a4Copy['object_id']); const evdB4 = String(b4Copy['object_id']);
    const locA4 = String(a4Copy['locator']); const locB4 = String(b4Copy['locator']);
    const P5 = await exported([mB4.manifest_id]);
    const t5 = await mark();
    const p5 = await imported(await openInline(steward2, tarOfDir(P5.dir)));
    const p5b = p5.itemOf('record', `${B4.id}@1`);
    expect(p5b).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: evdB4, locator: locB4 }) });
    expect((p5b['planned'] as Row)['reuse']).toMatchObject({ import_id: p4.importId, item_id: String(p4.itemOf('record', `${B4.id}@1`)['item_id']) });
    expect(await publishedIn(D2, 'import.admitted', t5, p5.importId)).toHaveLength(1);

    // (a) P4's revocation faulted AFTER THE GRAPH WRITE — no graph item: the fault fires before any claim or record batch; both record items PENDING, the bytes present.
    const ta = await mark();
    const { noticeId: n4 } = await interruptedRevocationOf(P4, p4.importId, 'P4', 'after_graph_write');
    expect(await eventsAfterFinalized(p4.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.revocation_failed']);
    const itemsA = await importItems(p4.importId);
    expect(itemsA.map((i) => [i.kind, i.revoked_at, i.revocation])).toEqual([['record', null, null], ['record', null, null]]);
    expect(await blobExists('evidence', D2, locA4)).toBe(true); expect(await blobExists('evidence', D2, locB4)).toBe(true);
    expect((await objectRows(evdB4)).map((r) => r.lifecycle_state)).toEqual(['admitted']);
    expect(await changeRowsOf(D2, 'import.revoked', ta, p4.importId)).toEqual([]);

    // (b) P5 revoked while P4 is REVOKING with its B4 item PENDING: P4 still owes the copy → P5 leaves B4 held_by P4; revoked with the receipt false, held_by P4 and the statement; the notice mismatched; no import.revoked (nothing destroyed).
    const { noticeId: n5 } = await originRevokedPending(P5, p5.importId, 'P5');
    const tb = await mark();
    const rb = await revokeImport(steward2, p5.importId);
    expect(rb.revocation).toMatchObject({ state: 'revoked', attempt: 1, destroyed: ZERO, cumulative: ZERO, left: 1, refused: [], bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, station_receipt: null });
    expect(rb.batches.map((b) => b['kind'])).toEqual(['record', 'finish']);
    expect(rb.batches[0]).toMatchObject({ kind: 'record', count: 1, tombstoned: 0, refused: 0, left: 1, skipped: 0 });
    expect(rb.batches[1]).toMatchObject({ kind: 'finish', complete: true });
    const receiptB = rb.revocation.receipt!;
    expect(receiptB).toMatchObject({ copies_destroyed: false, notice_id: n5, action_id: P5.id, package_digest: P5.packageDigest, destroyed: { records: 0, claims: 0, entities: 0, edges: 0, bytes: 0 }, refused: [], held_by: [{ import_id: p4.importId, origin_action_id: P4.id }], bytes_failed: [], bytes_residual: [], bytes_remaining: [] });
    expect(String(receiptB['statement'])).toMatch(/^the copies remain under import\(s\) /);
    expect(String(receiptB['statement'])).toContain(p4.importId);
    expect(receiptB['roots_unreachable']).toBeUndefined(); expect(receiptB['retried']).toBeUndefined();
    expect(rb.revocation.answered).toMatchObject({ answered: true, state: 'mismatched', attempt: 1, notice_id: n5 });
    const rowB = (await importRow(p5.importId))!;
    expect(rowB).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 1 });
    expect(rowB.revocation).toMatchObject({ attempts: 1, counts: { left: 1, held_by_other: 1 } });
    expect((await importItems(p5.importId))[0]!.revocation).toMatchObject({ outcome: 'left', kind: 'record', held_by: [p4.importId], reason: expect.stringMatching(/held under import/) });
    expect(await eventsAfterFinalized(p5.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revoked', 'import.copies_refused']);
    expect((await importEvents(p5.importId)).find((e) => e.event === 'import.revoked')!.details).toMatchObject({ statement: expect.stringMatching(/accounted for by another live import/) });
    expect((await importerNotices(P5.id, p5.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n5, 1, 'mismatched']]);
    expect((await importerNotices(P5.id, p5.importId))[0]!.receipt).toMatchObject({ copies_destroyed: false, held_by: [expect.objectContaining({ import_id: p4.importId })] });
    expect((await actionEvents(P5.id)).find((e) => e.event === 'export.revocation_mismatched')?.details).toMatchObject({ notice_id: n5, attempt: 1, copies_destroyed: false, held_by: [expect.objectContaining({ import_id: p4.importId })] });
    expect(await changeRowsOf(D2, 'import.revoked', tb, p5.importId)).toEqual([]);
    expect(await blobExists('evidence', D2, locB4)).toBe(true);
    expect((await objectRows(evdB4)).map((r) => r.lifecycle_state)).toEqual(['admitted']);

    // (c) P4 RESUMED: no live reuser of B4 (P5 revoked) → A4 and B4 tombstoned; revoked at attempt 2, the bytes gone, the receipt true, the origin's notice acknowledged in place.
    const tc = await mark();
    const rc = await revokeImport(steward2, p4.importId);
    expect(rc.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: { records: 2, claims: 0, entities: 0, edges: 0 }, cumulative: { records: 2, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], station_receipt: null });
    expect(rc.batches.map((b) => b['kind'])).toEqual(['record', 'finish']);
    expect(rc.batches[0]).toMatchObject({ kind: 'record', count: 2, tombstoned: 2, refused: 0, left: 0, skipped: 0 });
    const bytesC = rc.revocation.bytes!;
    expect(sorted(bytesC.removed)).toEqual(sorted([locA4, locB4]));
    expect(bytesC).toMatchObject({ failed: [], residual: [], remaining: [], roots_unreachable: [] });
    const receiptC = rc.revocation.receipt!;
    expect(receiptC).toMatchObject({ copies_destroyed: true, notice_id: n4, action_id: P4.id, destroyed: { records: 2, claims: 0, entities: 0, edges: 0, bytes: 2 }, refused: [], bytes_failed: [], bytes_residual: [], bytes_remaining: [] });
    expect(receiptC['held_by']).toBeUndefined(); expect(receiptC['statement']).toBeUndefined();
    expect(rc.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 1, notice_id: n4 });
    const itemsC = await importItems(p4.importId);
    expect(sorted(itemsC.map((i) => locatorOf(i)))).toEqual(sorted([locA4, locB4]));
    expect((await objectRows(evdB4)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]);
    expect((await objectRows(evdA4)).map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]);
    await noBytesOf(locA4); await noBytesOf(locB4);
    expect((await importRow(p4.importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect(await eventsAfterFinalized(p4.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.revocation_failed', 'import.revocation_started', 'import.batch_revoked', 'import.revoked', 'import.copies_destroyed']);
    expect((await importerNotices(P4.id, p4.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n4, 1, 'acknowledged']]);
    const rowsC = await publishedIn(D2, 'import.revoked', tc, p4.importId);
    expect(rowsC).toHaveLength(1);
    expect(sorted(payloadOf(rowsC[0]!).objects.evidence)).toEqual(sorted([evdA4, evdB4]));

    // (d) P5 REVOKED AGAIN — the retry branch: nothing present, nothing owed (no locator of its own, P4 no longer a live holder), the ledger's last word copies_refused → ONE copies_destroyed receipt, retried, answering the origin by a new acknowledged attempt.
    const tailBefore = await eventsAfterFinalized(p5.importId);
    const rd = await revokeImport(steward2, p5.importId);
    expect(rd.revocation).toMatchObject({ state: 'retried', attempt: 1, destroyed: ZERO, cumulative: ZERO, left: 1, refused: [], bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, notice: null, station_receipt: null });
    expect(rd.batches).toEqual([]);
    const receiptD = rd.revocation.receipt!;
    expect(receiptD).toMatchObject({ copies_destroyed: true, retried: true, notice_id: n5, action_id: P5.id, package_digest: P5.packageDigest, destroyed: { records: 0, claims: 0, entities: 0, edges: 0, bytes: 0 }, refused: [], bytes_failed: [], bytes_residual: [], bytes_remaining: [] });
    expect(receiptD['held_by']).toBeUndefined(); expect(receiptD['statement']).toBeUndefined(); expect(receiptD['roots_unreachable']).toBeUndefined();
    expect(rd.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 2, action_id: P5.id });
    expect(String(rd.revocation.answered!['notice_id'])).not.toBe(n5);
    expect(await eventsAfterFinalized(p5.importId)).toEqual([...tailBefore, 'import.copies_destroyed']);
    const evD = await importEvents(p5.importId);
    expect(evD.filter((e) => e.event === 'import.copies_destroyed')).toHaveLength(1);
    expect(evD.at(-1)!.details).toMatchObject({ attempt: 1, receipt: expect.objectContaining({ receipt_id: receiptD['receipt_id'], copies_destroyed: true, retried: true }), bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] } });
    const nD = await importerNotices(P5.id, p5.importId);
    expect(nD.map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
    expect(nD[1]!.notice).toMatchObject({ answered_by_importer: true, attempt: 2 });
    expect(nD[1]!.receipt).toMatchObject({ receipt_id: receiptD['receipt_id'], copies_destroyed: true, retried: true });
    expect((await actionEvents(P5.id)).filter((e) => e.event === 'export.revocation_acknowledged').map((e) => e.details['attempt'])).toEqual([2]);
    expect((await importRow(p5.importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 1 });
    expect(await changeRowsOf(D2, 'import.revoked', tb, p5.importId)).toEqual([]);
    // A FURTHER revoke: the last word is copies_destroyed — retried, no receipt, the events and the notices unchanged.
    const eventsBefore = evD.length;
    const re = await revokeImport(steward2, p5.importId);
    expect(re.revocation).toMatchObject({ state: 'retried', attempt: 1, bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null });
    expect((await importEvents(p5.importId)).length).toBe(eventsBefore);
    expect((await importerNotices(P5.id, p5.importId)).map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
  }, 300_000);

  it('F4 · A STAGED-ONLY RESIDUE: P6 faulted after the record batch (A6 tombstoned, present); the published copy removed and a `<id>.staging-<uuid>` left beside it → the resumed request finds the locator present by its staged copy (residual), removes it, verifies the directory clean, says copies_destroyed and is acknowledged', async () => {
    const { evd: A6, m: mA6 } = await uploadOne('b18-f4-a');
    const P6 = await exported([mA6.manifest_id]);
    const t6 = await mark();
    const p6 = await imported(await openInline(steward2, tarOfDir(P6.dir)));
    expect(await publishedIn(D2, 'import.admitted', t6, p6.importId)).toHaveLength(1);
    const { noticeId: n6 } = await interruptedRevocationOf(P6, p6.importId, 'P6');
    const recA6 = (await importItems(p6.importId)).find((i) => i.kind === 'record')!;
    const locA6 = locatorOf(recA6);
    expect(await blobExists('evidence', D2, locA6)).toBe(true);
    expect(await changeRowsOf(D2, 'import.revoked', t6, p6.importId)).toEqual([]);

    // THE STAGED-ONLY RESIDUE, placed by the harness: a staged copy of a fresh attempt beside the published copy; the published copy gone. `exists` says nothing; `anyBytesIn` says present.
    const published = pathOfLocator('evidence', locA6);
    const stagedName = `${basename(published)}.staging-${randomUUID()}`;
    writeFileSync(join(dirname(published), stagedName), readFileSync(published), { mode: 0o600 });
    rmSync(published);
    expect(existsSync(published)).toBe(false);
    expect(stagedNamesOf('evidence', locA6)).toEqual([stagedName]);
    expect(await blobExists('evidence', D2, locA6)).toBe(false);
    expect(await vault.anyBytesIn('evidence', { tenantId: T(), domainId: D2 }, locA6)).toBe(true);
    expect(await vault.anyBytesIn('archive', { tenantId: T(), domainId: D2 }, locA6)).toBe(false);

    // THE RESUMED REQUEST: the locator present by its staged copy → residual and removed (the staged copy retired with the published path); verified gone; the receipt true.
    const rr = await revokeImport(steward2, p6.importId);
    expect(rr.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: ZERO, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { residual: [locA6], removed: [locA6], remaining: [], failed: [], roots_unreachable: [] }, station_receipt: null });
    expect(rr.batches.map((b) => b['kind'])).toEqual(['finish']);
    const receiptR = rr.revocation.receipt!;
    expect(receiptR).toMatchObject({ copies_destroyed: true, notice_id: n6, package_digest: P6.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 1 }, refused: [], bytes_failed: [], bytes_residual: [locA6], bytes_remaining: [] });
    expect(receiptR['statement']).toBeUndefined(); expect(receiptR['roots_unreachable']).toBeUndefined(); expect(receiptR['held_by']).toBeUndefined(); expect(receiptR['retried']).toBeUndefined();
    expect(rr.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 1, notice_id: n6 });
    // The staged file GONE: the directory lists no `.staging-` name of the id; nothing of the locator in either root.
    expect(stagedNamesOf('evidence', locA6)).toEqual([]);
    expect(readdirSync(dirname(published)).filter((n) => n.startsWith(basename(published)))).toEqual([]);
    await noBytesOf(locA6);
    expect((await importRow(p6.importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect(await eventsAfterFinalized(p6.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_failed', 'import.revocation_started', 'import.revoked', 'import.copies_destroyed']);
    expect((await importEvents(p6.importId)).at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptR['receipt_id'], copies_destroyed: true }), bytes: { removed: [locA6], failed: [], residual: [locA6], remaining: [], roots_unreachable: [] } });
    expect((await importerNotices(P6.id, p6.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n6, 1, 'acknowledged']]);
    expect(await publishedIn(D2, 'import.revoked', t6, p6.importId)).toHaveLength(1);
    // A redelivery: nothing present, the receipt standing — retried, no receipt.
    const eventsBefore = (await importEvents(p6.importId)).length;
    expect((await revokeImport(steward2, p6.importId)).revocation).toMatchObject({ state: 'retried', attempt: 2, bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null });
    expect((await importEvents(p6.importId)).length).toBe(eventsBefore);
  }, 300_000);

  it('F5 · AN UNREACHABLE ROOT: P7 faulted after the record batch (A7 tombstoned, present); the archive root\'s marker moved aside → the resumed request finishes on the ledger but names the root, says every owed locator remaining, copies_destroyed false with the statement, the origin mismatched (the reachable evidence copy removed all the same); the marker restored → the retry verifies both roots, records ONE copies_destroyed receipt (retried) and the origin is acknowledged by a new attempt; a further revoke adds nothing', async () => {
    const { evd: A7, m: mA7 } = await uploadOne('b18-f5-a');
    const P7 = await exported([mA7.manifest_id]);
    const t7 = await mark();
    const p7 = await imported(await openInline(steward2, tarOfDir(P7.dir)));
    expect(await publishedIn(D2, 'import.admitted', t7, p7.importId)).toHaveLength(1);
    const { noticeId: n7 } = await interruptedRevocationOf(P7, p7.importId, 'P7');
    const recA7 = (await importItems(p7.importId)).find((i) => i.kind === 'record')!;
    const locA7 = locatorOf(recA7);
    expect(await blobExists('evidence', D2, locA7)).toBe(true);
    expect(await changeRowsOf(D2, 'import.revoked', t7, p7.importId)).toEqual([]);

    // THE ARCHIVE ROOT UNREACHABLE (its marker moved aside by the harness); restored in `finally` whatever the outcome.
    const marker = join(vault.rootFor('archive'), MARKER); const aside = join(VAULT_DIR, `${MARKER}.archive-aside`);
    expect(readFileSync(marker, 'utf8').trim()).toBe('archive');
    expect(await vault.rootReachable('archive')).toBe(true); expect(await vault.rootReachable('evidence')).toBe(true);
    renameSync(marker, aside);
    try {
      expect(await vault.rootReachable('archive')).toBe(false); expect(await vault.rootReachable('evidence')).toBe(true);
      // THE RESUMED REQUEST: the ledger finishes; the cleanup names the root, proves nothing for it — every owed locator remaining (and failed), the residual found in the reachable root; the receipt false with the roots and the statement; the origin mismatched.
      const ru = await revokeImport(steward2, p7.importId);
      expect(ru.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: ZERO, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, left: 0, refused: [], bytes: { roots_unreachable: ['archive'], remaining: [locA7], failed: [locA7], removed: [], residual: [locA7] }, station_receipt: null });
      expect(ru.batches.map((b) => b['kind'])).toEqual(['finish']);
      const receiptU = ru.revocation.receipt!;
      expect(receiptU).toMatchObject({ copies_destroyed: false, notice_id: n7, package_digest: P7.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 0 }, refused: [], roots_unreachable: ['archive'], bytes_failed: [locA7], bytes_residual: [locA7], bytes_remaining: [locA7] });
      expect(String(receiptU['statement'])).toMatch(/^the archive root\(s\) of the vault could not be reached during the cleanup: nothing was removed and 1 tombstoned record\(s\) could not be verified gone; the ledger's revocation stands and the next revoke of this import removes and verifies them$/);
      expect(receiptU['held_by']).toBeUndefined(); expect(receiptU['retried']).toBeUndefined(); expect(receiptU['bytes_truncated']).toBeUndefined();
      expect(ru.revocation.answered).toMatchObject({ answered: true, state: 'mismatched', attempt: 1, notice_id: n7 });
      expect((await importRow(p7.importId))!).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 2 });
      expect(await eventsAfterFinalized(p7.importId)).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_failed', 'import.revocation_started', 'import.revoked', 'import.copies_refused']);
      expect((await importEvents(p7.importId)).at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptU['receipt_id'], copies_destroyed: false, roots_unreachable: ['archive'] }), bytes: { removed: [], failed: [locA7], residual: [locA7], remaining: [locA7], roots_unreachable: ['archive'] } });
      expect((await importerNotices(P7.id, p7.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[n7, 1, 'mismatched']]);
      expect((await importerNotices(P7.id, p7.importId))[0]!.receipt).toMatchObject({ copies_destroyed: false, roots_unreachable: ['archive'], bytes_remaining: [locA7] });
      expect((await actionEvents(P7.id)).find((e) => e.event === 'export.revocation_mismatched')?.details).toMatchObject({ notice_id: n7, attempt: 1, copies_destroyed: false });
      // NOTHING WENT in any root (the correction's rule: a half-removal would leave no list exact) — the evidence-root copy is still present; `removed` [] is exactly true.
      expect(await blobExists('evidence', D2, locA7)).toBe(true);
      expect(await vault.anyBytesIn('evidence', { tenantId: T(), domainId: D2 }, locA7)).toBe(true);
      expect(await publishedIn(D2, 'import.revoked', t7, p7.importId)).toHaveLength(1);
    } finally {
      renameSync(aside, marker);
    }
    expect(await vault.rootReachable('archive')).toBe(true);

    // THE MARKER RESTORED — the retry branch: both roots reachable, the copy present in the evidence root → removed (residual: an earlier attempt's) and verified gone in both roots; ONE copies_destroyed receipt (retried), the origin acknowledged by a new attempt row.
    const tailBefore = await eventsAfterFinalized(p7.importId);
    const rr = await revokeImport(steward2, p7.importId);
    expect(rr.revocation).toMatchObject({ state: 'retried', attempt: 2, destroyed: { records: 1, claims: 0, entities: 0, edges: 0 }, cumulative: { records: 1, claims: 0, entities: 0, edges: 0 }, refused: [], bytes: { removed: [locA7], failed: [], residual: [locA7], remaining: [], roots_unreachable: [] }, station_receipt: null });
    expect(rr.batches).toEqual([]);
    const receiptR = rr.revocation.receipt!;
    expect(receiptR).toMatchObject({ copies_destroyed: true, retried: true, notice_id: n7, package_digest: P7.packageDigest, destroyed: { records: 1, claims: 0, entities: 0, edges: 0, bytes: 1 }, refused: [], bytes_failed: [], bytes_residual: [locA7], bytes_remaining: [] });
    expect(receiptR['statement']).toBeUndefined(); expect(receiptR['roots_unreachable']).toBeUndefined(); expect(receiptR['held_by']).toBeUndefined();
    expect(rr.revocation.answered).toMatchObject({ answered: true, state: 'acknowledged', attempt: 2, action_id: P7.id });
    expect(String(rr.revocation.answered!['notice_id'])).not.toBe(n7);
    await noBytesOf(locA7);
    expect(await eventsAfterFinalized(p7.importId)).toEqual([...tailBefore, 'import.copies_destroyed']);
    const evR = await importEvents(p7.importId);
    expect(evR.filter((e) => e.event === 'import.copies_destroyed')).toHaveLength(1);
    expect(evR.at(-1)!.details).toMatchObject({ attempt: 2, receipt: expect.objectContaining({ receipt_id: receiptR['receipt_id'], copies_destroyed: true, retried: true }), bytes: { removed: [locA7], failed: [], residual: [locA7], remaining: [], roots_unreachable: [] } });
    const nR = await importerNotices(P7.id, p7.importId);
    expect(nR.map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
    expect(nR[1]!.notice).toMatchObject({ answered_by_importer: true, attempt: 2 });
    expect(nR[1]!.receipt).toMatchObject({ receipt_id: receiptR['receipt_id'], copies_destroyed: true });
    expect((await actionEvents(P7.id)).filter((e) => e.event === 'export.revocation_acknowledged').map((e) => e.details['attempt'])).toEqual([2]);
    expect((await importRow(p7.importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect(await changeRowsOf(D2, 'import.revoked', t7, p7.importId)).toHaveLength(1);
    // A FURTHER revoke: retried, no receipt, nothing new.
    const eventsBefore = evR.length;
    expect((await revokeImport(steward2, p7.importId)).revocation).toMatchObject({ state: 'retried', attempt: 2, bytes: { removed: [], failed: [], residual: [], remaining: [], roots_unreachable: [] }, receipt: null, answered: null });
    expect((await importEvents(p7.importId)).length).toBe(eventsBefore);
    expect((await importerNotices(P7.id, p7.importId)).map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'acknowledged']]);
  }, 300_000);
});
