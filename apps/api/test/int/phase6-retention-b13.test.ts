/**
 * CP-6 B13 (migration 0073) — the governed SCHEDULE RETIREMENT and the customer export's DELIVERY: the package DOWNLOAD, the
 * DESTINATION and its RECEIPT, the KEY-BASED SIGNATURE — on a real database, an ISOLATED vault and an isolated TRANSFER STATION
 * (the B12 harness's discipline: the four vault roots under one temporary directory set before the application boots, and the
 * station's root under a SECOND temporary directory outside every vault root — the containment rule D1 proves; the `phase6-*`
 * name puts the file in `test:int:all`, as the CI rule requires). Two Ed25519 pairs are generated here and their PRIVATE halves
 * bound as EYE_EXPORT_SIGNING_KEY_TEST and _TEST2 before the boot (the credential store reads the process environment at use and
 * records a reference, never a value); nothing of a private value is written to disk or into a record — the PUBLIC halves are what
 * the file compares, and H1 scans the rows for the destination's bearer value.
 *
 *   S0–S1 · SETUP and the SCHEDULE RETIREMENT (0073 §1; D1, C10) — an export built and verified BEFORE any key is declared (scheme
 *   /1, the archive digest recorded all the same); a schedule declared (schedule.declared on the new ledger) and evaluated once,
 *   retired by the domain admin with a reason — the row, its last evaluation, the actions it opened and their events untouched,
 *   schedule.retired on the ledger, a second retirement and an unknown id refused by the port, the steward refused by the PDP, a
 *   short reason by the route; the evaluation opens nothing from it; the list and tier/state serve the columns.
 *
 *   K1 · THE SIGNING KEY (0073 §2; D3, C1) — declared by the tenant's administrator from a bound reference: the key id derived
 *   from the SPKI, the public PEM recorded, listed under retention.read without the value; the same key again refused; a second
 *   key the new active one; an unbound reference, a value that is not an Ed25519 key, a malformed reference refused by the route;
 *   the second retired → the first active again (the latest non-retired); a retired key re-declared refused; the steward and the
 *   domain admin refused by the PDP.
 *
 *   E1 · THE SIGNED EXPORT (D3, D4; C3, C5, C14) — the package built with the active key: signing_key_id, archive_digest, expires_at
 *   = built_at + 30 days, the manifest's signature block /2 with a 64-byte Ed25519 signature over the package digest (verified here
 *   with node's own API against the public half), the read route's key; the customer's verifier on the directory (verified with
 *   --public-key, null without), a flipped signature byte FAILED; expiresAfter '2 hours' honoured, '1 minute' refused below the
 *   floor; the active key's reference removed from the environment → the execution refused BEFORE the state moves (paused
 *   infrastructure/retry, attempts 0, the message naming the key and the reference, nothing built).
 *
 *   A1 · THE ARCHIVE (D2, D7; C4, C12) — buildUstar deterministic and parseable; the download route's tar = the recorded archive
 *   digest, rebuilt here from the manifest's own built_at and listed files in the fixed order, its entries the package files byte
 *   for byte; export.downloaded on the action; the verifier --tar passes; a package file tampered on disk → the download refused
 *   (integrity) and the tampered directory fails the verifier; an expired package's download refused (expires_at moved back through
 *   the owner connection, the revoke-only trigger disabled around the update — C3); the revoked package's download is T2's.
 *
 *   D1 · DESTINATIONS (0073 §3; D5, C13) — a transfer station declared on the station root; one inside the vault's export root, a
 *   symlink into a vault root, a relative path, a missing directory, a duplicate key, a credential on a station, a non-https URL
 *   refused; an https destination with an unbound credential reference listed blocked-credential; retired once; the steward refused.
 *
 *   T1–T2 · THE TRANSFER-STATION DELIVERY and its GATES (0073 §4; D6, D9; C6–C8) — delivered (attempt 1): package.tar, package.sig,
 *   delivery.json under <root>/<tenant>/<domain>/<action>/, export.delivered, custody.delivered per manifest; the DEMONSTRATION
 *   RECIPIENT (the script, spawned) verifies with the public key and writes receipt.json; collected → acknowledged with the receipt
 *   and its digest; a stale receipt of an earlier attempt refused (it names its delivery); a receipt naming another archive →
 *   mismatched with both digests on record; a receipt that is not a JSON object refused, the row delivered; the acknowledge route
 *   with an out-of-band receipt; a differing package.tar at the station → failed write_failed. THE GATES: an unsigned package while a
 *   key is active, an executed (unverified) export, a revoked package (its earlier delivery kept), an expired package, a retired
 *   destination, an unknown destination, a source's rights withdrawn since the build (rights_changed), the steward (PDP); a package
 *   signed by a key retired since IS deliverable, the key's state told to the recipient in delivery.json; no receipt yet.
 *
 *   H1 · THE HTTPS DELIVERY (D8, C15) — the unbound credential → failed credential_unbound before any egress; bound → the .invalid
 *   host does not resolve → failed transport; a loopback endpoint → failed egress_refused (address_not_public); every row, event and
 *   answer free of the credential's value.
 *
 *   P1 · THE PDP and the reads (D7, D10, C19) — the deliveries list, the export read's new fields, the download by the analyst
 *   refused and by the auditor admitted, the keys list under the auditor free of private material.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { EXPORT_ARCHIVE_MAX_BYTES, buildUstar, listedFilesOf, parseUstar } from '../../src/retention/export-archive.js';
import { contentDigest } from '@eye/contracts';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The ISOLATED vault of this run and the TRANSFER STATION of this run: two temporary directories, neither inside the other, plus a
// scratch directory for what the customer's side writes (a public key file, downloaded tars, copies to tamper with). Each is resolved
// to its REAL path before it is configured: macOS's temporary root is a symlink (/var → /private/var) and the station discipline
// compares real paths against the roots as configured (C13), so the roots must be configured as real paths for the comparison to mean
// what it says. Set before the application reads its configuration.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b13-vault-')));
const STATION_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b13-station-')));
const SCRATCH_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b13-scratch-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

// The signing keys of this run (D3, C1): two Ed25519 pairs generated here, their PRIVATE halves bound BY REFERENCE in the process
// environment before the boot — the store resolves a reference at use and never records the value — and, for K1's refusals, a
// value that is a key of another algorithm (P-256) and one that is no key at all. A fifth reference is left unbound on purpose.
const KEY1 = generateKeyPairSync('ed25519'); const KEY2 = generateKeyPairSync('ed25519');
const pkcs8b64 = (k: KeyObject): string => (k.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
process.env['EYE_EXPORT_SIGNING_KEY_TEST'] = pkcs8b64(KEY1.privateKey);
process.env['EYE_EXPORT_SIGNING_KEY_TEST2'] = pkcs8b64(KEY2.privateKey);
process.env['EYE_EXPORT_SIGNING_KEY_NOT_ED25519'] = pkcs8b64(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey);
process.env['EYE_EXPORT_SIGNING_KEY_MALFORMED'] = Buffer.from('not a private key at all').toString('base64');
delete process.env['EYE_EXPORT_SIGNING_KEY_UNBOUND'];
delete process.env['EYE_DST_TEST_NORDWERK'];
const KEY1_REF = 'EYE_EXPORT_SIGNING_KEY_TEST'; const KEY2_REF = 'EYE_EXPORT_SIGNING_KEY_TEST2';
const DST_REF = 'EYE_DST_TEST_NORDWERK'; const DST_TOKEN = 'demo-token';
const spkiDer = (k: KeyObject): Buffer => k.export({ type: 'spki', format: 'der' }) as Buffer;
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
/** The key id as D3 derives it: ed25519:<the first 16 hex of sha256(SPKI DER)>. */
const keyIdOf = (k: KeyObject): string => `ed25519:${createHash('sha256').update(spkiDer(k)).digest('hex').slice(0, 16)}`;
const KEY1_ID = keyIdOf(KEY1.publicKey); const KEY2_ID = keyIdOf(KEY2.publicKey);
const KEY1_PEM = spkiPem(KEY1.publicKey); const KEY2_PEM = spkiPem(KEY2.publicKey);
/** The customer's copy of the public key (what the verifier and the demonstration recipient are given). */
const KEY1_PEM_FILE = join(SCRATCH_DIR, 'b13-key1.pub.pem');
writeFileSync(KEY1_PEM_FILE, `${KEY1_PEM}\n`);

const execFile = promisify(execFileCb);
const VERIFIER = resolvePath(__dirname, '../../../../scripts/retention/verify-export.mjs');
const RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/transfer-station-recipient.mjs');
const SIGNED_SCHEME = 'eye-customer-export/2';
const STATION_KEY = 'b13-station'; const STATION_RECIPIENT = 'NORDWERK GmbH — harness transfer station'; const STATION_PURPOSE = 'the customer\'s periodic export of its internal records (harness)';
const HTTPS_KEY = 'b13-https'; const LOOPBACK_KEY = 'b13-loopback';

let h: Phase4Harness; let observation: ObservationController; let retention: RetentionController; let vault: VaultService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const B64_64 = /^[A-Za-z0-9+/]{86}==$/;
type Row = Record<string, unknown>;
/** Whether a string value equal to (or containing) `s` occurs anywhere inside a JSON value — the shape-independent test for a credential's value (must not) and a public key (must). */
const containsString = (v: unknown, s: string, exact = false): boolean =>
  typeof v === 'string' ? (exact ? v.trim() === s : v.includes(s)) : Array.isArray(v) ? v.some((x) => containsString(x, s, exact)) : v !== null && typeof v === 'object' ? Object.values(v as Row).some((x) => containsString(x, s, exact)) : false;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;

/* ───────────── the rows ───────────── */
type Action = { action_id: string; state: string; kind: string; failure_class: string | null; disposition: string | null; failure_reason: string | null; attempts: number; selector: Row };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, failure_class, disposition, failure_reason, attempts::int, selector from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; locator: string; content_digest: string; byte_length: number; source_id: string; retention_profile: string }>`select manifest_id::text, locator, content_digest, byte_length::int, source_id::text, retention_profile from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Row }>`select event, details from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const executions = async (id: string) => (await sql<{ port: string; outcome: string; evidence: Row }>`select port, outcome, evidence from retention.executions where action_id = ${id}::uuid order by executed_at`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string }>`select event from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);
const eventRows = async (id: string, event: string) => (await sql<{ actor: string | null; details: Row }>`select actor_principal_id::text actor, details from retention.action_events where action_id = ${id}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const approvalsLive = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is null`.execute(su)).rows[0]!.n;
const scheduleRow = async (id: string) => (await sql<{ state: string; last_evaluation: Row; last_evaluated_at: Date | null; retired_at: Date | null; retired_by: string | null; retire_reason: string | null }>`select state, last_evaluation, last_evaluated_at, retired_at, retired_by::text, retire_reason from retention.schedules where schedule_id = ${id}::uuid`.execute(su)).rows[0]!;
const scheduleEvents = async (id: string) => (await sql<{ event: string; actor: string | null; details: Row }>`select event, actor_principal_id::text actor, details from retention.schedule_events where schedule_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
type ExportRow = { signing_key_id: string | null; archive_digest: string | null; package_digest: string; manifest_digest: string; byte_total: number; revoked_at: Date | null; expires_at: Date | null; built_at: Date };
const exportRow = async (id: string): Promise<ExportRow | undefined> => (await sql<ExportRow>`select signing_key_id, archive_digest, package_digest, manifest_digest, byte_total::int, revoked_at, expires_at, built_at from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0];
/** Whether the package expires exactly the given interval after it was built — compared in SQL (C5: one variable for both instants). */
const expiresAfterIs = async (id: string, interval: string) => (await sql<{ same: boolean | null }>`select (expires_at = built_at + ${interval}::interval) as same from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0]!.same;
type KeyRow = { key_id: string; algorithm: string; purpose: string; credential_ref: string; public_key_pem: string; retired_at: Date | null; declared_by: string };
const keyRows = async (): Promise<KeyRow[]> => (await sql<KeyRow>`select key_id, algorithm, purpose, credential_ref, public_key_pem, retired_at, declared_by::text from retention.export_signing_keys where tenant_id = ${T()}::uuid order by declared_at`.execute(su)).rows;
/** The ACTIVE key as D3/C1 define it: the tenant's latest non-retired key by declared_at. */
const activeKeyId = async (): Promise<string | null> => (await keyRows()).filter((k) => k.retired_at === null).at(-1)?.key_id ?? null;
type DeliveryRow = { delivery_id: string; destination_id: string; attempt: number; state: string; archive_digest: string; package_digest: string; signing_key_id: string | null; receipt: Row | null; receipt_digest: string | null; failure_class: string | null; acknowledged_at: Date | null; delivered_by: string };
const deliveryRows = async (actionId: string): Promise<DeliveryRow[]> => (await sql<DeliveryRow>`select delivery_id::text, destination_id::text, attempt::int, state, archive_digest, package_digest, signing_key_id, receipt, receipt_digest, failure_class, acknowledged_at, delivered_by::text from retention.export_deliveries where action_id = ${actionId}::uuid order by delivered_at, attempt`.execute(su)).rows;
const deliveryRow = async (deliveryId: string): Promise<DeliveryRow> => (await sql<DeliveryRow>`select delivery_id::text, destination_id::text, attempt::int, state, archive_digest, package_digest, signing_key_id, receipt, receipt_digest, failure_class, acknowledged_at, delivered_by::text from retention.export_deliveries where delivery_id = ${deliveryId}::uuid`.execute(su)).rows[0]!;
/** Every B13 row of the tenant as JSON (the deliveries, the destinations, the keys, the action events of the given actions): what H1 scans for a credential's value. */
const tenantRowsJson = async (actionIds: string[]): Promise<unknown[]> => [
  ...(await sql<{ j: unknown }>`select to_jsonb(d) j from retention.export_deliveries d where d.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(x) j from retention.export_destinations x where x.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(k) j from retention.export_signing_keys k where k.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(e) j from retention.action_events e where e.action_id = any(${actionIds}::uuid[])`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(c) j from observation.custody_events c where c.tenant_id = ${T()}::uuid and c.event = 'custody.delivered'`.execute(su)).rows.map((r) => r.j),
];

/* ───────────── the routes (the B11/B12 helpers, and B13's) ───────────── */
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; kind: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved; the held items stay') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
type Execution = { executed: number; held: number; refused: number; package: Row | null; bytes: { removed: string[]; failed: string[] } };
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Execution }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
const withdraw = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.withdraw(h.req(p, 'retention.action.withdraw', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
type ExportRead = { package: Row; manifest: Row | null; files: string[]; signing_key: Row | null; expires_at: string | Date | null; expired: boolean; archive_digest: string | null; deliveries: Row[] };
const getExport = (p: AuthenticatedPrincipal, id: string) => retention.getExport(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as Promise<ExportRead>;
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } }) as Promise<{ revocation: Row; bytes: { removed: boolean; error?: string } }>;
const declareSchedule = (p: AuthenticatedPrincipal, payload: Row) => retention.declareSchedule(h.req(p, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(), { payload }) as Promise<{ schedule: { scheduleId: string } }>;
const evaluate = () => retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as Promise<{ evaluation: { opened: Row[]; escalated: Row[]; deferred: number } }>;
const listSchedules = (p: AuthenticatedPrincipal) => retention.listSchedules(h.req(p, 'retention.read', 'RTS', null, 'retention'), T(), D()) as Promise<{ schedules: Row[] }>;
const tierState = (p: AuthenticatedPrincipal) => retention.tierState(h.req(p, 'retention.read', 'RTP', null, 'retention'), T(), D()) as unknown as Promise<{ state: { schedules: Row[] } }>;
// B13 (0073 §1): the schedule's own governed retirement.
const retireSchedule = (p: AuthenticatedPrincipal, scheduleId: string, reason: string) => retention.retireSchedule(h.req(p, 'retention.schedule.retire', 'RTS', scheduleId, 'retention'), T(), D(), scheduleId, { payload: { reason } }) as Promise<{ schedule: Row }>;
// B13 (0073 §2): the tenant's signing keys — declared and retired by the tenant's administrator, listed under retention.read.
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string, purpose = 'demonstration') => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose } }) as Promise<{ key: Row }>;
const listKeys = (p: AuthenticatedPrincipal) => retention.listSigningKeys(h.req(p, 'retention.read', 'RSK', null, 'retention'), T(), D()) as Promise<{ keys: Row[] }>;
const retireKey = (p: AuthenticatedPrincipal, keyId: string, reason: string) => retention.retireSigningKey(h.req(p, 'retention.signing_key.retire', 'RSK', null, 'retention'), T(), D(), keyId, { payload: { reason } }) as Promise<{ key: Row }>;
// B13 (0073 §3): the destinations — declared and retired by the domain's administrator.
const declareDestination = (p: AuthenticatedPrincipal, payload: Row) => retention.declareDestination(h.req(p, 'retention.destination.declare', 'RDS', null, 'retention'), T(), D(), { payload }) as Promise<{ destination: Row }>;
const listDestinations = (p: AuthenticatedPrincipal) => retention.listDestinations(h.req(p, 'retention.read', 'RDS', null, 'retention'), T(), D()) as Promise<{ destinations: Row[] }>;
const retireDestination = (p: AuthenticatedPrincipal, destinationId: string, reason: string) => retention.retireDestination(h.req(p, 'retention.destination.retire', 'RDS', destinationId, 'retention'), T(), D(), destinationId, { payload: { reason } }) as Promise<{ destination: Row }>;
// B13 (0073 §2, §4): the download, the delivery, its receipt.
type Download = { filename: string; byteLength: number; archiveDigest: string; packageDigest: string; manifestDigest: string; signature: Row; expiresAt: string | Date | null; base64: string };
const downloadExport = (p: AuthenticatedPrincipal, id: string) => retention.downloadExport(h.req(p, 'retention.export.download', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ download: Download }>;
type Delivery = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; archive_digest?: string; package_digest?: string; signing_key_id?: string | null };
const deliver = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.deliverExport(h.req(p, 'retention.export.deliver', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ delivery: Delivery }>;
const listDeliveries = (p: AuthenticatedPrincipal, id: string) => retention.listDeliveries(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ deliveries: Row[] }>;
const collect = (p: AuthenticatedPrincipal, id: string, deliveryId: string) => retention.collectReceipt(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId) as unknown as Promise<{ delivery: Delivery }>;
const acknowledge = (p: AuthenticatedPrincipal, id: string, deliveryId: string, receipt: unknown) => retention.acknowledgeDelivery(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId, { payload: { receipt } }) as unknown as Promise<{ delivery: Delivery }>;
const setRights = (sourceId: string, rightsState: 'confirmed' | 'pending' | 'withdrawn') =>
  observation.setRights(h.req(manager, 'observation.source.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId, { payload: { contractVersion: 1, rightsState, evidence: `publisher notice (fixture): ${rightsState}` } });
/** Uploads with the default label share ONE source (the harness keeps one per ceiling); a label names a second source of the same ceiling. */
const upload = async (names: string[], label = '') =>
  h.upload(names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' })), 'internal', label) as Promise<Array<{ id: string; version: number; digest: string }>>;
/** OPEN → RESOLVE in one go; returns the action id and its digest. */
const opened = async (payload: Row): Promise<{ id: string; digest: string; scope: Row }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  return { id: o.action.actionId, digest: String(r.scope['scope_digest']), scope: r.scope };
};
/** OPEN → RESOLVE → APPROVE. */
const approved = async (payload: Row): Promise<{ id: string; digest: string; scope: Row; approvalId: string }> => {
  const a = await opened(payload);
  const ap = await approve(authority, a.id, a.digest);
  return { ...a, approvalId: ap.approval.approvalId };
};
const exportOf = (manifestIds: string[], extra: Row = {}): Row => ({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal', ...extra } });
/** A customer export of the given manifests taken through to VERIFIED (the only state a delivery admits); returns the ids and the digests the product recorded. */
const exported = async (manifestIds: string[], extra: Row = {}): Promise<{ id: string; digest: string; approvalId: string; packageDigest: string; archiveDigest: string }> => {
  const a = await approved(exportOf(manifestIds, extra));
  const ex = await execute(steward, a.id);
  expect(ex.execution).toMatchObject({ executed: manifestIds.length, refused: 0, held: 0 });
  expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true, state: 'verified' });
  const row = (await exportRow(a.id))!;
  expect(row.archive_digest).toMatch(HEX64);
  return { ...a, packageDigest: row.package_digest, archiveDigest: row.archive_digest! };
};
const exportDir = (id: string) => join(vault.rootFor('export'), T(), D(), id);
const stationDir = (id: string) => join(STATION_DIR, T(), D(), id);
/** The failing call's outcome, as a value: the HttpException of the route or the raw error of the port, never a resolved promise. */
const failing = (p: Promise<unknown>) => p.then(() => { throw new Error('the call should have been refused'); }, (e: unknown) => e as { status?: number; message?: string });

/* ───────────── the customer's side: the verifier and the demonstration recipient, spawned ───────────── */
const run = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const r = await execFile(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
};
type VerifierJson = { code: number; ok: boolean; complete: boolean; failed: number; checks: Array<{ name: string; ok: boolean | null; detail: string | null }>; signature?: { scheme: string | null; key_id: string | null; verified: boolean | null } };
const parseVerifier = (r: { code: number; stdout: string; stderr: string }): VerifierJson => {
  try { return { code: r.code, ...(JSON.parse(r.stdout) as Omit<VerifierJson, 'code'>) }; }
  catch { throw new Error(`the verifier did not answer JSON (exit ${r.code}): ${r.stdout.slice(0, 600)} ${r.stderr.slice(0, 600)}`); }
};
const verifyDir = async (dir: string, ...extra: string[]): Promise<VerifierJson> => parseVerifier(await run([VERIFIER, dir, '--json', ...extra]));
const verifyTar = async (file: string, ...extra: string[]): Promise<VerifierJson> => parseVerifier(await run([VERIFIER, '--tar', file, '--json', ...extra]));
const recipient = (actionId: string, ...extra: string[]) => run([RECIPIENT, STATION_DIR, T(), D(), actionId, ...extra]);
const failedChecks = (v: VerifierJson) => v.checks.filter((c) => c.ok === false).map((c) => `${c.name}${c.detail === null ? '' : ` — ${c.detail}`}`);

/* ───────────── the fixtures the cases share ───────────── */
type Manifest = Awaited<ReturnType<typeof manifestRow>>;
let mA: Manifest; let mB: Manifest; let mC: Manifest;
let sourceId = ''; let rightsSourceId = '';
let EXP0 = ''; let EXP1 = ''; let EXP2 = ''; let EXP4 = ''; let EXP5 = ''; let EXP6 = '';
let exp1 = { packageDigest: '', archiveDigest: '', manifestDigest: '' };
let scheduleId = ''; let stationId = ''; let stationRetiredId = ''; let httpsId = '';
let d1: Delivery; let d2: Delivery; let d3: Delivery; let d4: Delivery; let d6: Delivery;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  observation = h.app.get(O); retention = h.app.get(R); vault = h.app.get(VaultService);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b13-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b13-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b13-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b13-tenant-admin', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'b13-analyst');
  auditor = await h.humanWithSession(['auditor'], 'b13-auditor', 'TENANT');
  manager = await h.principalWith(['collection_manager'], 'b13-collection-manager');
}, 300_000);

afterAll(async () => {
  for (const ref of [KEY1_REF, KEY2_REF, 'EYE_EXPORT_SIGNING_KEY_NOT_ED25519', 'EYE_EXPORT_SIGNING_KEY_MALFORMED', DST_REF]) delete process.env[ref];
  await h?.close();
  await su?.destroy();
  for (const dir of [VAULT_DIR, STATION_DIR, SCRATCH_DIR]) rmSync(dir, { recursive: true, force: true });
}, 120_000);

describe('S · SETUP and the SCHEDULE RETIREMENT (0073 §1; D1, C10)', () => {
  it('S0 · SETUP: two internal uploads A and B from one source, a third C from a second source (its rights withdrawn later); an export of A built and VERIFIED before any key is declared — scheme eye-digest-chain/1, no signing key, the archive digest recorded all the same, expires_at = built_at + 30 days', async () => {
    const up = await upload(['b13-a', 'b13-b']);
    mA = await manifestRow((await manifestOf(up[0]!.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(up[1]!.id, 1)).manifest_id);
    sourceId = mA.source_id;
    expect(mB.source_id).toBe(sourceId);
    mC = await manifestRow((await manifestOf((await upload(['b13-c'], 'b13-rights'))[0]!.id, 1)).manifest_id);
    rightsSourceId = mC.source_id;
    expect(rightsSourceId).not.toBe(sourceId);
    expect(await activeKeyId()).toBeNull();
    const e0 = await exported([mA.manifest_id]);
    EXP0 = e0.id;
    const row = (await exportRow(EXP0))!;
    expect(row).toMatchObject({ signing_key_id: null, archive_digest: expect.stringMatching(HEX64) });
    expect(await expiresAfterIs(EXP0, '30 days')).toBe(true);
    const manifest = readJson(join(exportDir(EXP0), 'manifest.json'));
    expect(manifest['signature']).toMatchObject({ scheme: 'eye-digest-chain/1', package_digest: row.package_digest });
    expect((manifest['signature'] as Row)['key_id']).toBeUndefined();
    // The read route already says the package's expiry and carries no key (the fields of the read are P1's; the null key is this case's).
    const rd = await getExport(steward, EXP0);
    expect(rd).toMatchObject({ expired: false, archive_digest: row.archive_digest, deliveries: [] });
    expect(rd.signing_key ?? null).toBeNull();
    expect(rd.expires_at).not.toBeNull();
  }, 180_000);

  it('S1 · SCHEDULE RETIREMENT: an archive schedule declared (schedule.declared on the ledger, the actor and the selector) and evaluated once — A and B opened; retired by the domain admin with a reason → state retired, retired_at/by/reason, schedule.retired with the reason; the row and its last_evaluation kept, the opened actions untouched (state, events); a second retirement and an unknown id refused by the port; the steward refused by the PDP; a short reason 422; the evaluation opens nothing from it; the list and tier/state serve the columns', async () => {
    const s = await declareSchedule(domainAdmin, { retentionProfile: mA.retention_profile, targetKind: 'evidence', actionKind: 'archive', dueAfter: '0 seconds', selector: { sourceId } });
    scheduleId = s.schedule.scheduleId;
    const declared = await scheduleEvents(scheduleId);
    expect(declared.map((e) => [e.event, e.actor])).toEqual([['schedule.declared', domainAdmin.principalId]]);
    expect(containsString(declared[0]!.details, sourceId)).toBe(true);
    const e1 = await evaluate();
    const openedIds = e1.evaluation.opened.map((o) => String(o['action_id']));
    expect(e1.evaluation.opened.map((o) => String((o['selector'] as Row)['manifest_id'])).sort()).toEqual([mA.manifest_id, mB.manifest_id].sort());
    expect(e1.evaluation.opened.every((o) => o['schedule_id'] === scheduleId && o['kind'] === 'archive')).toBe(true);
    const before = await scheduleRow(scheduleId);
    expect(before).toMatchObject({ state: 'active', retired_at: null, retired_by: null, retire_reason: null });
    expect(before.last_evaluation).toMatchObject({ opened: 2, deferred: 0 });
    expect(before.last_evaluated_at).not.toBeNull();
    const eventsBefore = await Promise.all(openedIds.map((id) => events(id)));
    // The route's own validation (a reason of 8+ characters) and the PDP (the declare rule's holders; the steward is not one).
    await expect(retireSchedule(domainAdmin, scheduleId, 'short')).rejects.toMatchObject({ status: 422 });
    await expect(retireSchedule(steward, scheduleId, 'the steward may not retire a schedule')).rejects.toMatchObject({ status: 403 });
    expect((await scheduleRow(scheduleId)).state).toBe('active');
    const reason = 'declared for the B13 harness; retired, its history kept';
    const r = await retireSchedule(domainAdmin, scheduleId, reason);
    expect(r.schedule).toMatchObject({ state: 'retired', retire_reason: reason });
    const after = await scheduleRow(scheduleId);
    expect(after).toMatchObject({ state: 'retired', retired_by: domainAdmin.principalId, retire_reason: reason });
    expect(after.retired_at).not.toBeNull();
    // The history kept: the last evaluation as it was, the opened actions in their state with their events as they were.
    expect(after.last_evaluation).toEqual(before.last_evaluation);
    expect(after.last_evaluated_at?.getTime()).toBe(before.last_evaluated_at?.getTime());
    for (const [i, id] of openedIds.entries()) {
      expect((await actionRow(id)).state).toBe('opened');
      expect(await events(id)).toEqual(eventsBefore[i]);
    }
    const ledger = await scheduleEvents(scheduleId);
    expect(ledger.map((e) => [e.event, e.actor])).toEqual([['schedule.declared', domainAdmin.principalId], ['schedule.retired', domainAdmin.principalId]]);
    expect(containsString(ledger[1]!.details, reason)).toBe(true);
    // Once (C10): a retired schedule is not retired again; an id that names no schedule of the domain is refused as such (the port's own errors reach the harness raw — C2).
    await expect(retireSchedule(domainAdmin, scheduleId, 'retired a second time (fixture)')).rejects.toThrow(/retention schedule rejected: .* is retired/);
    await expect(retireSchedule(domainAdmin, uuidv7(), 'an unknown schedule (fixture)')).rejects.toThrow(/retention schedule rejected: .* is not a schedule of this domain/);
    expect(await scheduleEvents(scheduleId)).toHaveLength(2);
    // A retired schedule opens nothing: the evaluation reads the active ones alone.
    const e2 = await evaluate();
    expect(e2.evaluation.opened.filter((o) => o['schedule_id'] === scheduleId)).toEqual([]);
    expect(e2.evaluation).toMatchObject({ opened: [], deferred: 0 });
    expect((await scheduleRow(scheduleId)).last_evaluation).toEqual(before.last_evaluation);
    // The reads serve the columns: the list (retention.read) and the cold tier's state.
    const listed = (await listSchedules(steward)).schedules.find((x) => x['schedule_id'] === scheduleId)!;
    expect(listed).toMatchObject({ state: 'retired', retired_by: domainAdmin.principalId, retire_reason: reason });
    expect(listed['retired_at']).not.toBeNull();
    const ts = (await tierState(steward)).state.schedules.find((x) => x['schedule_id'] === scheduleId)!;
    expect(ts).toMatchObject({ state: 'retired' });
    expect(ts['retired_at']).not.toBeNull();
    for (const id of openedIds) await withdraw(steward, id, 'the schedule fixture of the retirement case is withdrawn');
  }, 180_000);
});

describe('K · THE SIGNING KEY (0073 §2; D3, C1)', () => {
  it('K1 · declared by the tenant admin from the bound reference (purpose demonstration) → key_id ed25519:<sha256(SPKI)[0:16]>, the public PEM recorded, Ed25519; listed under retention.read with the reference NAME and no value; the same key again refused; a second key → the new active one, the first still listed; an unbound reference, a P-256 value, a malformed reference and a bad purpose refused 422; the second retired with a reason → the first active again; a retired key re-declared refused; the steward and the domain admin refused by the PDP', async () => {
    const k1 = await declareKey(tenantAdmin, KEY1_REF);
    expect(k1.key).toMatchObject({ key_id: KEY1_ID, algorithm: 'Ed25519', purpose: 'demonstration', credential_ref: KEY1_REF });
    expect(String(k1.key['public_key_pem']).trim()).toBe(KEY1_PEM);
    expect(await keyRows()).toMatchObject([{ key_id: KEY1_ID, algorithm: 'Ed25519', purpose: 'demonstration', credential_ref: KEY1_REF, retired_at: null, declared_by: tenantAdmin.principalId }]);
    expect((await keyRows())[0]!.public_key_pem.trim()).toBe(KEY1_PEM);
    expect(await activeKeyId()).toBe(KEY1_ID);
    // The list (retention.read; C19): the reference's NAME and its readiness, never its value — the private material appears nowhere in the answer.
    const listed = await listKeys(steward);
    expect(listed.keys.map((k) => k['key_id'])).toEqual([KEY1_ID]);
    expect(listed.keys[0]).toMatchObject({ credential_ref: KEY1_REF, purpose: 'demonstration', readiness: 'bound' });
    expect(containsString(listed, process.env[KEY1_REF]!)).toBe(false);
    expect(containsString(listed, KEY1_PEM, true)).toBe(true);
    // The same key again: one declaration per key id (C1).
    await expect(declareKey(tenantAdmin, KEY1_REF)).rejects.toThrow(/export signing key rejected: .* is already declared/);
    // A purpose that is neither demonstration nor production, on a reference that resolves: refused with the purpose named, nothing declared.
    expect(String((await failing(declareKey(tenantAdmin, KEY2_REF, 'testing'))).message)).toMatch(/purpose/i);
    expect((await keyRows()).map((k) => k.key_id)).toEqual([KEY1_ID]);
    // A second key: the latest non-retired is the active one; the first stays listed.
    const k2 = await declareKey(tenantAdmin, KEY2_REF);
    expect(k2.key).toMatchObject({ key_id: KEY2_ID, purpose: 'demonstration', credential_ref: KEY2_REF });
    expect(String(k2.key['public_key_pem']).trim()).toBe(KEY2_PEM);
    expect(await activeKeyId()).toBe(KEY2_ID);
    expect((await listKeys(steward)).keys.map((k) => k['key_id'])).toEqual([KEY1_ID, KEY2_ID]);
    // The route's refusals (422): a reference the deployment does not bind, a value that is not an Ed25519 private key (P-256), a value that is no key at all; a reference of another shape is refused whichever side names it.
    await expect(declareKey(tenantAdmin, 'EYE_EXPORT_SIGNING_KEY_UNBOUND')).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/binds no/) });
    await expect(declareKey(tenantAdmin, 'EYE_EXPORT_SIGNING_KEY_NOT_ED25519')).rejects.toMatchObject({ status: 422 });
    await expect(declareKey(tenantAdmin, 'EYE_EXPORT_SIGNING_KEY_MALFORMED')).rejects.toMatchObject({ status: 422 });
    expect(String((await failing(declareKey(tenantAdmin, 'EYE_SRC_NOT_A_SIGNING_KEY'))).message)).toMatch(/credential|reference|binds no/i);
    expect((await keyRows()).map((k) => k.key_id)).toEqual([KEY1_ID, KEY2_ID]);
    // Retired with a reason: the row kept, the first key active again (the latest NON-RETIRED); once.
    const rt = await retireKey(tenantAdmin, KEY2_ID, 'the second key is retired (fixture)');
    expect(rt.key).toMatchObject({ key_id: KEY2_ID });
    expect(rt.key['retired_at']).not.toBeNull();
    expect((await keyRows()).map((k) => [k.key_id, k.retired_at === null])).toEqual([[KEY1_ID, true], [KEY2_ID, false]]);
    expect(await activeKeyId()).toBe(KEY1_ID);
    await expect(retireKey(tenantAdmin, KEY2_ID, 'retired a second time (fixture)')).rejects.toThrow(/export signing key rejected: .* is retired/);
    await expect(retireKey(tenantAdmin, 'ed25519:0000000000000000', 'an unknown key (fixture)')).rejects.toThrow(/export signing key rejected: no such/);
    // A retired key stays retired: a new key is a new declaration, and the same key id is not declared twice.
    await expect(declareKey(tenantAdmin, KEY2_REF)).rejects.toThrow(/export signing key rejected: .* is already declared/);
    const keys = (await listKeys(analyst)).keys;
    expect(keys.find((k) => k['key_id'] === KEY2_ID)!['retired_at']).not.toBeNull();
    expect(keys.find((k) => k['key_id'] === KEY1_ID)!['retired_at']).toBeNull();
    // The PDP: the key is the TENANT's — its administrator (or the platform's) declares it; the steward and the domain admin do not.
    await expect(declareKey(steward, KEY2_REF)).rejects.toMatchObject({ status: 403 });
    await expect(declareKey(domainAdmin, KEY2_REF)).rejects.toMatchObject({ status: 403 });
    await expect(retireKey(steward, KEY1_ID, 'the steward may not retire a key')).rejects.toMatchObject({ status: 403 });
    expect(await activeKeyId()).toBe(KEY1_ID);
  }, 180_000);
});

describe('E · THE SIGNED EXPORT (D3, D4; C3, C5, C14)', () => {
  it('E1 · an export of A and B executed with the active key → signing_key_id, archive_digest, expires_at = built_at + 30 days; the signature block eye-customer-export/2 with the key id, Ed25519 and a 64-byte signature over the package digest that verifies here against the public half; the three execution rows as B11 pins them, the record row\'s evidence carrying the archive digest and the key; the read route\'s key; the verifier on the directory (verified with --public-key, null without); a flipped signature byte FAILED; expiresAfter 2 hours honoured; 1 minute and a non-interval refused 422; the key\'s reference removed from the environment → the execution refused before the state moves', async () => {
    const e1 = await exported([mA.manifest_id, mB.manifest_id]);
    EXP1 = e1.id;
    const row = (await exportRow(EXP1))!;
    exp1 = { packageDigest: row.package_digest, archiveDigest: row.archive_digest!, manifestDigest: row.manifest_digest };
    expect(row).toMatchObject({ signing_key_id: KEY1_ID, byte_total: mA.byte_length + mB.byte_length, revoked_at: null });
    expect(await expiresAfterIs(EXP1, '30 days')).toBe(true);
    const dir = exportDir(EXP1);
    expect(readdirSync(dir).sort()).toEqual(['manifest.json', 'links.json', `${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`].sort()); // B15: links.json beside the manifest and the object files
    const manifestBytes = readFileSync(join(dir, 'manifest.json'));
    expect(sha256(manifestBytes)).toBe(row.manifest_digest);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Row & { signature: Row; objects: Row[] };
    expect(manifest.signature).toMatchObject({ scheme: SIGNED_SCHEME, key_id: KEY1_ID, algorithm: 'Ed25519', package_digest: row.package_digest, bound_to: { action_id: EXP1, scope_digest: e1.digest, approval_id: e1.approvalId } });
    expect(String(manifest.signature['objects_digest'])).toMatch(HEX64);
    const sig = String(manifest.signature['signature']);
    expect(sig).toMatch(B64_64);
    expect(Buffer.from(sig, 'base64')).toHaveLength(64);
    // The signature is over the ASCII hex of the package digest (D3): node's own verify against the public half generated here.
    expect(cryptoVerify(null, Buffer.from(row.package_digest, 'utf8'), KEY1.publicKey, Buffer.from(sig, 'base64'))).toBe(true);
    expect(cryptoVerify(null, Buffer.from(row.package_digest, 'utf8'), KEY2.publicKey, Buffer.from(sig, 'base64'))).toBe(false);
    // B11's B4/B5 pin the directory's files and the execution rows (B15: the closure's row retention.export_links before the record's): the archive digest and the key travel in the record row's evidence (C4), no extra row.
    const execs = await executions(EXP1);
    expect(execs.map((e) => [e.port, e.outcome])).toEqual([['vault.export', 'done'], ['vault.export', 'done'], ['retention.export_links', 'done'], ['retention.record_export_package', 'done']]);
    expect(execs[3]!.evidence).toMatchObject({ archive_digest: row.archive_digest, signing_key_id: KEY1_ID });
    expect(execs[3]!.evidence['expires_at']).toBeDefined();
    expect(await events(EXP1)).toContain('export.built');
    // The read route carries the key a customer fetches: its public PEM, its purpose and its state.
    const rd = await getExport(steward, EXP1);
    expect(rd.signing_key).toMatchObject({ key_id: KEY1_ID, purpose: 'demonstration', state: 'active' });
    expect(containsString(rd.signing_key, KEY1_PEM, true)).toBe(true);
    expect(rd).toMatchObject({ expired: false, archive_digest: row.archive_digest, deliveries: [] });
    // The customer's verifier on the directory: the /2 signature verified with the public key; without it, reported (null), never failed.
    const withKey = await verifyDir(dir, '--public-key', KEY1_PEM_FILE, '--expect-package-digest', row.package_digest);
    expect(failedChecks(withKey)).toEqual([]);
    expect(withKey).toMatchObject({ code: 0, ok: true, complete: true, signature: { scheme: SIGNED_SCHEME, key_id: KEY1_ID, verified: true } });
    const withoutKey = await verifyDir(dir);
    expect(withoutKey).toMatchObject({ code: 0, ok: true, signature: { scheme: SIGNED_SCHEME, key_id: KEY1_ID, verified: null } });
    // A flipped signature byte: the chain still holds (the signature is outside the package digest), the SIGNATURE check fails.
    const flipped = join(SCRATCH_DIR, `${EXP1}-flipped-signature`);
    cpSync(dir, flipped, { recursive: true });
    const raw = Buffer.from(sig, 'base64'); raw[0] = raw[0]! ^ 0x01;
    const mm = readJson(join(flipped, 'manifest.json')); (mm['signature'] as Row)['signature'] = raw.toString('base64');
    writeFileSync(join(flipped, 'manifest.json'), `${JSON.stringify(mm, null, 2)}\n`);
    const bad = await verifyDir(flipped, '--public-key', KEY1_PEM_FILE);
    expect(bad).toMatchObject({ code: 1, ok: false, signature: { key_id: KEY1_ID, verified: false } });
    expect(failedChecks(bad).join('\n')).toMatch(/signature/i);
    // The expiry (D4, C3): the selector's expires_after spelled as an interval, stored by the intake, applied by the port from the ACTION's selector.
    const e2 = await exported([mA.manifest_id], { expiresAfter: '2 hours' });
    EXP2 = e2.id;
    expect((await actionRow(EXP2)).selector).toEqual({ manifest_ids: [mA.manifest_id], classification_ceiling: 'internal', destination: 'export', expires_after: '2 hours' });
    expect(await expiresAfterIs(EXP2, '2 hours')).toBe(true);
    expect(await expiresAfterIs(EXP2, '30 days')).toBe(false);
    await expect(open(steward, exportOf([mA.manifest_id], { expiresAfter: '1 minute' }))).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/expires/i) });
    await expect(open(steward, exportOf([mA.manifest_id], { expiresAfter: '2 years' }))).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/expires/i) });
    await expect(open(steward, exportOf([mA.manifest_id], { expiresAfter: 'soon' }))).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/expires/i) });
    // The unbound key (C14): the tenant's active key is declared but its reference no longer resolves in this process — refused BEFORE the state
    // moves (no attempt counted), paused infrastructure/retry with the message naming the key and the reference, nothing built, the approvals revoked.
    const a3 = await approved(exportOf([mA.manifest_id]));
    const bound = process.env[KEY1_REF]!;
    delete process.env[KEY1_REF];
    try {
      const err = await failing(execute(steward, a3.id));
      expect(err).toMatchObject({ status: 409 });
      expect(String(err.message)).toMatch(new RegExp(`the execution was rolled back and the action paused: retention execution rejected \\(signing_key_unbound\\): the tenant's active export signing key ${KEY1_ID} is not bound in this deployment \\(${KEY1_REF}\\); the package was not built`));
    } finally {
      process.env[KEY1_REF] = bound;
    }
    const paused = await actionRow(a3.id);
    expect(paused).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry', attempts: 0 });
    expect(String(paused.failure_reason)).toMatch(/^retention execution rejected \(signing_key_unbound\): the tenant's active export signing key ed25519:[0-9a-f]{16} is not bound in this deployment \(EYE_EXPORT_SIGNING_KEY_TEST\); the package was not built/);
    expect((await eventRows(a3.id, 'action.paused')).at(-1)!.details).toMatchObject({ failure_class: 'infrastructure', attempted: false, attempts: 0 });
    expect(await approvalsLive(a3.id)).toBe(0);
    expect(await executions(a3.id)).toEqual([]);
    expect(await exportRow(a3.id)).toBeUndefined();
    expect(existsSync(exportDir(a3.id))).toBe(false);
    // Bound again, the same action is re-resolved, re-approved and builds with the key.
    const again = await resolve(steward, a3.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await approve(authority, a3.id, String(again.scope['scope_digest']));
    expect((await execute(steward, a3.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    expect((await exportRow(a3.id))!.signing_key_id).toBe(KEY1_ID);
    expect((await verify(steward, a3.id)).verification).toMatchObject({ verified: true, state: 'verified' });
  }, 300_000);
});

describe('A · THE ARCHIVE (D2, D7; C4, C12)', () => {
  it('A1 · buildUstar is deterministic (two builds byte-equal; the entries in the order given; ustar magic, typeflag 0, two zero blocks; the mtime inside the header) and parseUstar returns the entries byte for byte; the download route returns the tar whose sha256 = archive_digest — rebuilt here from the manifest\'s own built_at and the files it lists, manifest.json first then the .bin files by name — with the record\'s digests, the signature block carrying the public key and the purpose, export.downloaded on the action with the reader and the digest; the verifier --tar passes (verified with the key); a byte flipped inside the tar fails it; a package file tampered on disk → the download refused as an integrity failure and the tampered directory fails the verifier, the file restored serves again; an expired package\'s download refused (expires_at moved back through the owner connection)', async () => {
    // The download ceiling (C12): a package above it cannot be built in a test; the constant is what the download and the delivery refuse from.
    expect(EXPORT_ARCHIVE_MAX_BYTES).toBe(256 * 1024 * 1024);
    // (i) the archive format, on synthetic entries.
    const entries = [{ name: 'manifest.json', bytes: Buffer.from('{"a":1}\n', 'utf8') }, { name: 'b.bin', bytes: Buffer.alloc(513, 7) }, { name: 'a.bin', bytes: Buffer.alloc(0) }];
    const t1 = buildUstar(entries, 1_700_000_000); const t2 = buildUstar(entries, 1_700_000_000);
    expect(t1.equals(t2)).toBe(true);
    expect(t1.length % 512).toBe(0);
    expect(t1.subarray(0, 13).toString('utf8')).toBe('manifest.json'); expect(t1[13]).toBe(0);
    expect(t1.subarray(257, 262).toString('utf8')).toBe('ustar');
    expect(t1[156]).toBe(0x30);
    expect(t1.subarray(t1.length - 1024).every((b) => b === 0)).toBe(true);
    expect(buildUstar(entries, 1_700_000_001).equals(t1)).toBe(false);
    const parsed = parseUstar(t1);
    expect(parsed.map((e) => e.name)).toEqual(['manifest.json', 'b.bin', 'a.bin']);
    expect(parsed.every((e, i) => Buffer.from(e.bytes).equals(entries[i]!.bytes))).toBe(true);
    // (ii) the package's archive, recomputed here as C4 fixes it: the manifest's own package.built_at (seconds), manifest.json first, the listed files by name.
    const dir = exportDir(EXP1);
    const manifestBytes = readFileSync(join(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as { package: { built_at: string; links?: unknown }; objects: Array<{ bytes: { file: string } }> };
    expect(manifest.objects.map((o) => o.bytes.file).sort()).toEqual([`${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`].sort());
    // B15: the files the manifest LISTS are the object files and the links file it names (package.links.file), sorted by name.
    const listed = listedFilesOf(manifest.objects, manifest);
    expect(listed).toEqual([`${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`, 'links.json'].sort());
    const mtime = Math.floor(Date.parse(manifest.package.built_at) / 1000);
    const rebuilt = buildUstar([{ name: 'manifest.json', bytes: manifestBytes }, ...listed.map((f) => ({ name: f, bytes: readFileSync(join(dir, f)) }))], mtime);
    expect(sha256(rebuilt)).toBe(exp1.archiveDigest);
    // (iii) the download: the tar, the record's digests, the signature block with the public key; the event on the action.
    const dl = await downloadExport(steward, EXP1);
    expect(dl.download).toMatchObject({ filename: `${EXP1}.tar`, byteLength: rebuilt.length, archiveDigest: exp1.archiveDigest, packageDigest: exp1.packageDigest, manifestDigest: exp1.manifestDigest });
    expect(dl.download.expiresAt).not.toBeNull();
    const tar = Buffer.from(dl.download.base64, 'base64');
    expect(tar.equals(rebuilt)).toBe(true);
    expect(sha256(tar)).toBe(exp1.archiveDigest);
    const got = parseUstar(tar);
    expect(got.map((e) => e.name)).toEqual(['manifest.json', ...listed]);
    expect(Buffer.from(got[0]!.bytes).equals(manifestBytes)).toBe(true);
    for (const f of listed) expect(Buffer.from(got.find((e) => e.name === f)!.bytes).equals(readFileSync(join(dir, f)))).toBe(true);
    expect(dl.download.signature).toMatchObject({ scheme: SIGNED_SCHEME, key_id: KEY1_ID });
    expect(containsString(dl.download.signature, KEY1_PEM, true)).toBe(true);
    expect(containsString(dl.download.signature, 'demonstration')).toBe(true);
    const downloaded = await eventRows(EXP1, 'export.downloaded');
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]!.actor).toBe(steward.principalId);
    expect(downloaded[0]!.details).toMatchObject({ archive_digest: exp1.archiveDigest });
    // (iv) the customer's verifier on the tar — what a download hands over is verified as a whole; a byte flipped inside fails it.
    const tarFile = join(SCRATCH_DIR, `${EXP1}.tar`);
    writeFileSync(tarFile, tar);
    const ok = await verifyTar(tarFile, '--public-key', KEY1_PEM_FILE, '--expect-package-digest', exp1.packageDigest);
    expect(failedChecks(ok)).toEqual([]);
    expect(ok).toMatchObject({ code: 0, ok: true, complete: true, signature: { scheme: SIGNED_SCHEME, key_id: KEY1_ID, verified: true } });
    const flippedTar = Buffer.from(tar);
    // The first byte of the first .bin entry's data: header 0 (manifest.json) + its data rounded to 512 + header 1.
    const dataOffset = 512 + Math.ceil(manifestBytes.length / 512) * 512 + 512;
    flippedTar[dataOffset] = flippedTar[dataOffset]! ^ 0x01;
    const flippedFile = join(SCRATCH_DIR, `${EXP1}-flipped.tar`);
    writeFileSync(flippedFile, flippedTar);
    const flippedRun = await verifyTar(flippedFile, '--public-key', KEY1_PEM_FILE);
    expect(flippedRun).toMatchObject({ code: 1, ok: false });
    expect(failedChecks(flippedRun).join('\n')).toMatch(/integrity/i);
    // (v) a package file tampered ON DISK: the tar rebuilt at the download no longer digests to the record — refused, nothing served, the event not written; the verifier on the tampered directory fails.
    const binPath = join(dir, `${mA.manifest_id}.bin`); const original = readFileSync(binPath);
    const tampered = Buffer.from(original); tampered[0] = tampered[0]! ^ 0x01;
    writeFileSync(binPath, tampered);
    try {
      await expect(downloadExport(steward, EXP1)).rejects.toThrow(/does not rebuild to its recorded digest/);
      expect(await eventRows(EXP1, 'export.downloaded')).toHaveLength(1);
      const onDisk = await verifyDir(dir, '--public-key', KEY1_PEM_FILE);
      expect(onDisk).toMatchObject({ code: 1, ok: false });
      expect(failedChecks(onDisk).join('\n')).toMatch(/integrity/i);
    } finally {
      writeFileSync(binPath, original);
    }
    expect((await downloadExport(steward, EXP1)).download.archiveDigest).toBe(exp1.archiveDigest);
    expect(await eventRows(EXP1, 'export.downloaded')).toHaveLength(2);
    // (vi) an EXPIRED package (C3): the floor is one hour in SQL and TS alike, so the refusal is proven by moving expires_at back through the owner
    // connection (su = the migrate user, the tables' owner) with the revoke-only trigger disabled around the one update and enabled again after.
    expect((await getExport(steward, EXP2)).expired).toBe(false);
    await sql`alter table retention.export_packages disable trigger rxp_revoke_only`.execute(su);
    try { await sql`update retention.export_packages set expires_at = clock_timestamp() - interval '1 second' where action_id = ${EXP2}::uuid`.execute(su); }
    finally { await sql`alter table retention.export_packages enable trigger rxp_revoke_only`.execute(su); }
    // The trigger stands again: the revocation is still the one change a row takes.
    await expect(sql`update retention.export_packages set byte_total = byte_total + 1 where action_id = ${EXP2}::uuid`.execute(su)).rejects.toThrow(/revoked once; nothing else about it changes/);
    const expired = await getExport(steward, EXP2);
    expect(expired.expired).toBe(true);
    await expect(downloadExport(steward, EXP2)).rejects.toThrow(/expired at/);
    expect(await eventRows(EXP2, 'export.downloaded')).toEqual([]);
    // A package that is not there: 404 by the route.
    await expect(downloadExport(steward, uuidv7())).rejects.toMatchObject({ status: 404 });
  }, 300_000);
});

describe('D · DESTINATIONS (0073 §3; D5, C13)', () => {
  it('D1 · a transfer station declared by the domain admin on the station root (absolute, existing, outside every vault root) → listed, not retired, no credential; a station inside the vault\'s export root, a symlink into a vault root, a relative path, a missing directory refused; a duplicate key, a credential reference on a station, a non-https URL, a malformed key refused; an https destination with an unbound credential reference → readiness blocked-credential, the reference by NAME; a second station retired once with a reason; the steward refused by the PDP', async () => {
    const s = await declareDestination(domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: STATION_RECIPIENT, purpose: STATION_PURPOSE });
    expect(s.destination).toMatchObject({ destination_key: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: STATION_RECIPIENT, purpose: STATION_PURPOSE, credential_ref: null, retired_at: null });
    stationId = String(s.destination['destination_id']);
    expect(stationId).toMatch(UUID_RE);
    // Containment (C13): the station may neither be, nor lie inside, nor contain a vault root — checked on the REAL path, so a symlink into a root is refused too.
    const inside = join(vault.rootFor('export'), 'b13-inside-the-export-root'); mkdirSync(inside, { recursive: true });
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-inside', kind: 'transfer_station', endpoint: inside, recipient: 'nobody', purpose: 'a station inside the vault' })).rejects.toThrow(/vault/i);
    rmSync(inside, { recursive: true, force: true });
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-root', kind: 'transfer_station', endpoint: vault.rootFor('archive'), recipient: 'nobody', purpose: 'a vault root as a station' })).rejects.toThrow(/vault/i);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-above', kind: 'transfer_station', endpoint: VAULT_DIR, recipient: 'nobody', purpose: 'the directory containing the roots' })).rejects.toThrow(/vault/i);
    const link = join(STATION_DIR, 'b13-link-into-the-vault'); symlinkSync(vault.rootFor('export'), link);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-link', kind: 'transfer_station', endpoint: link, recipient: 'nobody', purpose: 'a symlink into the vault' })).rejects.toThrow(/vault/i);
    unlinkSync(link); // the LINK is removed, never what it points at (rmSync follows a symlink to a directory and refuses)
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-relative', kind: 'transfer_station', endpoint: 'relative/station', recipient: 'nobody', purpose: 'a relative path' })).rejects.toThrow(/absolute|not an existing directory/);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-missing', kind: 'transfer_station', endpoint: join(STATION_DIR, 'does-not-exist'), recipient: 'nobody', purpose: 'a missing directory' })).rejects.toThrow(/not an existing directory/);
    // The shape: one active destination per key, a credential on an https destination alone, an https URL for the https kind, the key's spelling.
    await expect(declareDestination(domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'nobody', purpose: 'the same key again' })).rejects.toThrow(/already/);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-station-cred', kind: 'transfer_station', endpoint: STATION_DIR, credentialRef: DST_REF, recipient: 'nobody', purpose: 'a credential on a station' })).rejects.toThrow(/credential|https/);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-http', kind: 'https', endpoint: 'http://exports.nordwerk.invalid/receive', recipient: 'nobody', purpose: 'a plain http URL' })).rejects.toThrow(/https/);
    await expect(declareDestination(domainAdmin, { destinationKey: 'Bad Key', kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'nobody', purpose: 'a malformed key' })).rejects.toThrow(/key/i);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b13-kind', kind: 'sftp', endpoint: STATION_DIR, recipient: 'nobody', purpose: 'an unknown kind' })).rejects.toThrow(/kind/i);
    // The https kind (the production kind; D8, C15): declared with a credential reference this process does not bind → blocked-credential; the value never asked for.
    const hs = await declareDestination(domainAdmin, { destinationKey: HTTPS_KEY, kind: 'https', endpoint: 'https://exports.nordwerk.invalid/receive', credentialRef: DST_REF, recipient: 'NORDWERK GmbH — export endpoint (harness; unresolvable host)', purpose: 'the production path\'s gate' });
    expect(hs.destination).toMatchObject({ destination_key: HTTPS_KEY, kind: 'https', endpoint: 'https://exports.nordwerk.invalid/receive', credential_ref: DST_REF });
    httpsId = String(hs.destination['destination_id']);
    const lb = await declareDestination(domainAdmin, { destinationKey: LOOPBACK_KEY, kind: 'https', endpoint: 'https://127.0.0.1:1/receive', recipient: 'a loopback endpoint (harness)', purpose: 'the egress refusal' });
    expect(lb.destination).toMatchObject({ destination_key: LOOPBACK_KEY, kind: 'https', credential_ref: null });
    const listed = (await listDestinations(steward)).destinations;
    expect(listed.map((d) => d['destination_key']).sort()).toEqual([HTTPS_KEY, LOOPBACK_KEY, STATION_KEY].sort());
    expect(listed.find((d) => d['destination_key'] === HTTPS_KEY)).toMatchObject({ readiness: 'blocked-credential', credential_ref: DST_REF, retired_at: null });
    expect(listed.find((d) => d['destination_key'] === STATION_KEY)).toMatchObject({ endpoint: STATION_DIR, credential_ref: null, retired_at: null });
    expect(listed.find((d) => d['destination_key'] === STATION_KEY)!['readiness']).not.toBe('blocked-credential');
    // A second station, retired once with a reason (T2 delivers to it and is refused).
    const second = join(STATION_DIR, 'second-station'); mkdirSync(second);
    const s2 = await declareDestination(domainAdmin, { destinationKey: 'b13-station-retired', kind: 'transfer_station', endpoint: second, recipient: 'a station retired before any delivery', purpose: 'the retired-destination gate' });
    stationRetiredId = String(s2.destination['destination_id']);
    await expect(retireDestination(steward, stationRetiredId, 'the steward may not retire a destination')).rejects.toMatchObject({ status: 403 });
    const rt = await retireDestination(domainAdmin, stationRetiredId, 'retired before any delivery (fixture)');
    expect(rt.destination).toMatchObject({ destination_id: stationRetiredId });
    expect(rt.destination['retired_at']).not.toBeNull();
    await expect(retireDestination(domainAdmin, stationRetiredId, 'retired a second time (fixture)')).rejects.toThrow(/export destination rejected: .* is retired/);
    await expect(retireDestination(domainAdmin, uuidv7(), 'an unknown destination (fixture)')).rejects.toThrow(/export destination rejected: no such/);
    expect((await listDestinations(analyst)).destinations.find((d) => d['destination_key'] === 'b13-station-retired')!['retired_at']).not.toBeNull();
    // A retired destination's key is free for a new declaration (uniqueness is among the ACTIVE ones).
    const s3 = await declareDestination(domainAdmin, { destinationKey: 'b13-station-retired', kind: 'transfer_station', endpoint: second, recipient: 'the key declared again after its retirement', purpose: 'the uniqueness rule' });
    await retireDestination(domainAdmin, String(s3.destination['destination_id']), 'retired again at once (fixture)');
    // The PDP: the domain's administrator declares (as the schedule declare); the steward does not.
    await expect(declareDestination(steward, { destinationKey: 'b13-steward', kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'nobody', purpose: 'the steward may not declare' })).rejects.toMatchObject({ status: 403 });
    expect((await listDestinations(steward)).destinations.filter((d) => d['retired_at'] === null).map((d) => d['destination_key']).sort()).toEqual([HTTPS_KEY, LOOPBACK_KEY, STATION_KEY].sort());
  }, 180_000);
});

describe('T · THE TRANSFER-STATION DELIVERY and its GATES (0073 §4; D6, D9; C6–C8)', () => {
  it('T1 · the verified signed export delivered by the retention authority → delivered, attempt 1: package.tar (= the archive digest), package.sig (the block, the public key, the purpose), delivery.json (the exchange identity, naming the delivery and its attempt) under <root>/<tenant>/<domain>/<action>/; export.delivered; custody.delivered per manifest; the DEMONSTRATION RECIPIENT verifies with the public key and writes receipt.json (verified true, the delivery named); collected → acknowledged with the receipt and its digest, export.acknowledged; collected again refused; a second delivery → attempt 2, the tar unchanged, delivery.json rewritten; the STALE receipt of attempt 1 refused (it names its delivery), the row delivered; the recipient again → acknowledged; attempt 3 with a receipt naming another archive → mismatched, both digests on record; attempt 4 with a receipt that is not a JSON object refused (the row delivered), then acknowledged through the route with an out-of-band receipt; a differing package.tar at the station → attempt 5 failed write_failed', async () => {
    // (i) attempt 1.
    const r1 = await deliver(authority, EXP1, STATION_KEY);
    d1 = r1.delivery;
    expect(d1).toMatchObject({ state: 'delivered', attempt: 1, receipt: null, failure_class: null });
    expect(d1.delivery_id).toMatch(UUID_RE);
    let row = await deliveryRow(d1.delivery_id);
    expect(row).toMatchObject({ destination_id: stationId, attempt: 1, state: 'delivered', archive_digest: exp1.archiveDigest, package_digest: exp1.packageDigest, signing_key_id: KEY1_ID, receipt: null, receipt_digest: null, failure_class: null, acknowledged_at: null, delivered_by: authority.principalId });
    const dir = stationDir(EXP1);
    expect(readdirSync(dir).sort()).toEqual(['delivery.json', 'package.sig', 'package.tar']);
    const tar1 = readFileSync(join(dir, 'package.tar'));
    expect(sha256(tar1)).toBe(exp1.archiveDigest);
    expect(parseUstar(tar1).map((e) => e.name)).toEqual(['manifest.json', ...[`${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`, 'links.json'].sort()]); // B15: links.json among the listed files
    const manifest = readJson(join(exportDir(EXP1), 'manifest.json'));
    const sig = readJson(join(dir, 'package.sig'));
    expect(containsString(sig, KEY1_ID)).toBe(true);
    expect(containsString(sig, String((manifest['signature'] as Row)['signature']), true)).toBe(true);
    expect(containsString(sig, KEY1_PEM, true)).toBe(true);
    expect(containsString(sig, 'demonstration')).toBe(true);
    // The key's state NOW travels in delivery.json (C8) — package.sig is content-addressed (C7), so it carries the stable facts alone and the same bytes on every attempt.
    const dj = readJson(join(dir, 'delivery.json'));
    expect(dj).toMatchObject({ delivery_id: d1.delivery_id, action_id: EXP1, destination_key: STATION_KEY, recipient: STATION_RECIPIENT, purpose: STATION_PURPOSE, package_digest: exp1.packageDigest, archive_digest: exp1.archiveDigest, manifest_digest: exp1.manifestDigest, attempt: 1, signing_key: { key_id: KEY1_ID, state: 'active' } });
    expect(containsString(dj, 'verify-export.mjs')).toBe(true);
    expect(containsString(dj, 'receipt.json')).toBe(true);
    expect(await events(EXP1)).toContain('export.delivered');
    expect(containsString((await eventRows(EXP1, 'export.delivered')).at(-1)!.details, d1.delivery_id)).toBe(true);
    for (const m of [mA, mB]) {
      const c = await custody(m.manifest_id, 'custody.delivered');
      expect(c).toHaveLength(1);
      expect(c[0]!.details).toMatchObject({ delivery_id: d1.delivery_id, destination_key: STATION_KEY, recipient: STATION_RECIPIENT, state: 'delivered' });
    }
    // (ii) the demonstration recipient — a script that never talks to the product: it reads delivery.json, runs the customer's verifier on the tar with the public key, writes receipt.json.
    expect(existsSync(join(dir, 'receipt.json'))).toBe(false);
    const rec1 = await recipient(EXP1, '--public-key', KEY1_PEM_FILE);
    expect(rec1.code, `${rec1.stdout}\n${rec1.stderr}`).toBe(0);
    const receipt1 = readJson(join(dir, 'receipt.json'));
    expect(receipt1).toMatchObject({ verified: true, archive_digest: exp1.archiveDigest, package_digest: exp1.packageDigest, delivery_id: d1.delivery_id, attempt: 1 });
    expect(String(receipt1['receipt_id'])).toMatch(UUID_RE);
    expect(typeof receipt1['recipient']).toBe('string');
    expect(Number.isNaN(Date.parse(String(receipt1['received_at'])))).toBe(false);
    // (iii) the PDP first, on a valid receipt in place (so nothing before the decision can refuse instead): the steward and the analyst hold neither the collect nor the acknowledge act.
    await expect(collect(steward, EXP1, d1.delivery_id)).rejects.toMatchObject({ status: 403 });
    await expect(acknowledge(analyst, EXP1, d1.delivery_id, receipt1)).rejects.toMatchObject({ status: 403 });
    expect(await deliveryRow(d1.delivery_id)).toMatchObject({ state: 'delivered', receipt: null });
    // Collected → acknowledged: the receipt as received, its canonical digest, the instant, the event; once.
    const c1 = await collect(authority, EXP1, d1.delivery_id);
    expect(c1.delivery).toMatchObject({ delivery_id: d1.delivery_id, state: 'acknowledged', attempt: 1 });
    row = await deliveryRow(d1.delivery_id);
    expect(row).toMatchObject({ state: 'acknowledged', receipt: receipt1, receipt_digest: contentDigest(receipt1), failure_class: null });
    expect(row.acknowledged_at).not.toBeNull();
    expect(await events(EXP1)).toContain('export.acknowledged');
    await expect(collect(authority, EXP1, d1.delivery_id)).rejects.toThrow(/is not delivered/);
    expect((await deliveryRow(d1.delivery_id)).state).toBe('acknowledged');
    // (iv) attempt 2: the same content — an identical package.tar is accepted, delivery.json names the new delivery; the STALE receipt of attempt 1 is refused by its own binding (C7).
    const r2 = await deliver(authority, EXP1, STATION_KEY);
    d2 = r2.delivery;
    expect(d2).toMatchObject({ state: 'delivered', attempt: 2, receipt: null });
    expect(readFileSync(join(dir, 'package.tar')).equals(tar1)).toBe(true);
    expect(readJson(join(dir, 'delivery.json'))).toMatchObject({ delivery_id: d2.delivery_id, attempt: 2 });
    expect(readJson(join(dir, 'receipt.json'))['delivery_id']).toBe(d1.delivery_id);
    await expect(collect(authority, EXP1, d2.delivery_id)).rejects.toThrow(/the receipt names delivery/);
    expect((await deliveryRow(d2.delivery_id))).toMatchObject({ state: 'delivered', receipt: null, receipt_digest: null });
    expect(await deliveryRows(EXP1)).toHaveLength(2);
    const rec2 = await recipient(EXP1, '--public-key', KEY1_PEM_FILE);
    expect(rec2.code, `${rec2.stdout}\n${rec2.stderr}`).toBe(0);
    expect(readJson(join(dir, 'receipt.json'))).toMatchObject({ delivery_id: d2.delivery_id, attempt: 2, verified: true });
    expect((await collect(authority, EXP1, d2.delivery_id)).delivery).toMatchObject({ state: 'acknowledged', attempt: 2 });
    for (const m of [mA, mB]) expect(await custody(m.manifest_id, 'custody.delivered')).toHaveLength(2);
    // (v) attempt 3: a receipt naming ANOTHER archive digest — the exchange denied, the request and the evidence preserved (DP-47-005): mismatched, the event with both sides.
    d3 = (await deliver(authority, EXP1, STATION_KEY)).delivery;
    expect(d3).toMatchObject({ state: 'delivered', attempt: 3 });
    const otherDigest = 'f'.repeat(64);
    const receipt3 = { receipt_id: uuidv7(), recipient: 'the harness (a receipt naming another archive)', received_at: new Date().toISOString(), archive_digest: otherDigest, package_digest: exp1.packageDigest, verified: true, delivery_id: d3.delivery_id, attempt: 3 };
    writeFileSync(join(dir, 'receipt.json'), `${JSON.stringify(receipt3, null, 2)}\n`);
    const c3 = await collect(authority, EXP1, d3.delivery_id);
    expect(c3.delivery).toMatchObject({ state: 'mismatched', attempt: 3 });
    row = await deliveryRow(d3.delivery_id);
    expect(row).toMatchObject({ state: 'mismatched', receipt: receipt3, receipt_digest: contentDigest(receipt3) });
    expect(await events(EXP1)).toContain('export.mismatched');
    const mismatched = (await eventRows(EXP1, 'export.mismatched')).at(-1)!.details;
    expect(containsString(mismatched, otherDigest)).toBe(true);
    expect(containsString(mismatched, exp1.archiveDigest)).toBe(true);
    await expect(collect(authority, EXP1, d3.delivery_id)).rejects.toThrow(/is not delivered/);
    // (vi) attempt 4: a receipt that is not a JSON object is refused by the collect act and the row stays delivered; the acknowledge route takes an out-of-band receipt (no delivery id).
    d4 = (await deliver(authority, EXP1, STATION_KEY)).delivery;
    expect(d4).toMatchObject({ state: 'delivered', attempt: 4 });
    writeFileSync(join(dir, 'receipt.json'), 'this is not JSON at all\n');
    await expect(collect(authority, EXP1, d4.delivery_id)).rejects.toThrow(/receipt/i);
    writeFileSync(join(dir, 'receipt.json'), '[1, 2, 3]\n');
    await expect(collect(authority, EXP1, d4.delivery_id)).rejects.toThrow(/receipt/i);
    expect(await deliveryRow(d4.delivery_id)).toMatchObject({ state: 'delivered', receipt: null });
    expect(await deliveryRows(EXP1)).toHaveLength(4);
    const outOfBand = { receipt_id: uuidv7(), recipient: 'NORDWERK GmbH (a receipt carried by hand)', received_at: new Date().toISOString(), archive_digest: exp1.archiveDigest, package_digest: exp1.packageDigest, verified: true, verifier: 'the customer\'s own run of verify-export.mjs' };
    const a4 = await acknowledge(authority, EXP1, d4.delivery_id, outOfBand);
    expect(a4.delivery).toMatchObject({ state: 'acknowledged', attempt: 4 });
    expect(await deliveryRow(d4.delivery_id)).toMatchObject({ state: 'acknowledged', receipt: outOfBand, receipt_digest: contentDigest(outOfBand) });
    await expect(acknowledge(authority, EXP1, d4.delivery_id, outOfBand)).rejects.toThrow(/is not delivered/);
    // (vii) a DIFFERING package.tar at the station (C7): content-addressed files are never overwritten — the delivery fails as write_failed, recorded; the file removed, the next attempt writes afresh (T2).
    writeFileSync(join(dir, 'package.tar'), Buffer.concat([tar1, Buffer.from('trailing bytes the station did not receive from the product')]));
    const r5 = await deliver(authority, EXP1, STATION_KEY);
    expect(r5.delivery).toMatchObject({ state: 'failed', attempt: 5, failure_class: 'write_failed' });
    expect(containsString(r5.delivery.receipt, 'package.tar')).toBe(true);
    expect(await deliveryRow(r5.delivery.delivery_id)).toMatchObject({ state: 'failed', failure_class: 'write_failed', acknowledged_at: null });
    expect(await events(EXP1)).toContain('export.delivery_failed');
    for (const m of [mA, mB]) expect(await custody(m.manifest_id, 'custody.delivered')).toHaveLength(4);
    rmSync(join(dir, 'package.tar'));
    expect((await deliveryRows(EXP1)).map((d) => [d.attempt, d.state])).toEqual([[1, 'acknowledged'], [2, 'acknowledged'], [3, 'mismatched'], [4, 'acknowledged'], [5, 'failed']]);
  }, 300_000);

  it('T2 · THE GATES: the unsigned package while a key is active; an executed (unverified) export; a revoked package — its earlier delivery kept, its download refused; the expired package; a retired destination; an unknown destination; a source\'s rights withdrawn since the build (rights_changed); the steward (PDP); then the key retired → the package signed by it IS deliverable (attempt 6, delivery.json naming the key retired; package.sig content-addressed, unchanged) and the unsigned package too (no active key); no receipt yet; a receipt naming another delivery through the acknowledge route', async () => {
    // The package built before the key (S0) carries no key-based signature while the tenant now has an active key: refused — build the export again (C8).
    expect(await activeKeyId()).toBe(KEY1_ID);
    await expect(deliver(authority, EXP0, STATION_KEY)).rejects.toThrow(/retention delivery rejected: the package carries no key-based signature and the tenant now has an active key/);
    expect(await deliveryRows(EXP0)).toEqual([]);
    // Executed, not verified: a delivery is on the product's own verification.
    const a5 = await approved(exportOf([mA.manifest_id]));
    EXP5 = a5.id;
    expect((await execute(steward, EXP5)).execution).toMatchObject({ executed: 1 });
    await expect(deliver(authority, EXP5, STATION_KEY)).rejects.toThrow(/retention delivery rejected: .* is executed, not verified/);
    // Revoked: delivered once first (the row stays — the recipient's copy is out of the product's custody), then revoked → no download, no further delivery.
    const e4 = await exported([mA.manifest_id]);
    EXP4 = e4.id;
    const r4 = await deliver(authority, EXP4, STATION_KEY);
    expect(r4.delivery).toMatchObject({ state: 'delivered', attempt: 1 });
    expect(sha256(readFileSync(join(stationDir(EXP4), 'package.tar')))).toBe(e4.archiveDigest);
    const rv = await revokeExport(authority, EXP4, 'the customer asked for the package to be withdrawn (fixture)');
    expect(rv.bytes).toEqual({ removed: true });
    await expect(downloadExport(steward, EXP4)).rejects.toThrow(/was revoked at/);
    await expect(deliver(authority, EXP4, STATION_KEY)).rejects.toThrow(/retention delivery rejected: .* was revoked at/);
    expect((await deliveryRows(EXP4)).map((d) => [d.attempt, d.state])).toEqual([[1, 'delivered']]);
    expect(await events(EXP4)).toContain('export.revoked');
    // Expired (A1 moved EXP2's expiry back): refused; the revocation of an expired package still records.
    await expect(deliver(authority, EXP2, STATION_KEY)).rejects.toThrow(/retention delivery rejected: .* expired at/);
    expect(await deliveryRows(EXP2)).toEqual([]);
    // A retired destination; an unknown one.
    await expect(deliver(authority, EXP1, 'b13-station-retired')).rejects.toThrow(/retention delivery rejected: .* is retired/);
    await expect(deliver(authority, EXP1, 'b13-no-such-destination')).rejects.toThrow(/retention delivery rejected: no such destination/);
    // The rights re-checked at delivery (V03-T-047 "data rights"): C's source withdrawn since the build → rights_changed, the same prefix the execute route maps.
    const e6 = await exported([mC.manifest_id]);
    EXP6 = e6.id;
    await setRights(rightsSourceId, 'withdrawn');
    try {
      await expect(deliver(authority, EXP6, STATION_KEY)).rejects.toThrow(/retention delivery rejected \(rights_changed\)/);
    } finally {
      await setRights(rightsSourceId, 'confirmed');
    }
    expect(await deliveryRows(EXP6)).toEqual([]);
    expect((await deliver(authority, EXP6, STATION_KEY)).delivery).toMatchObject({ state: 'delivered', attempt: 1 });
    // The PDP: the delivery is the retention authority's, the tenant admin's or the domain admin's — the steward's and the analyst's are refused (the collect and acknowledge acts: T1).
    await expect(deliver(steward, EXP1, STATION_KEY)).rejects.toMatchObject({ status: 403 });
    await expect(deliver(analyst, EXP1, STATION_KEY)).rejects.toMatchObject({ status: 403 });
    expect((await deliver(domainAdmin, EXP6, STATION_KEY)).delivery).toMatchObject({ state: 'delivered', attempt: 2 });
    expect((await deliver(tenantAdmin, EXP6, STATION_KEY)).delivery).toMatchObject({ state: 'delivered', attempt: 3 });
    // The key retired since the build (C8): the package it signed IS deliverable — the key's state is written to package.sig — and, no key active now, the unsigned package is too.
    await retireKey(tenantAdmin, KEY1_ID, 'the first key is retired (fixture); a production key is a new declaration');
    expect(await activeKeyId()).toBeNull();
    const r6 = await deliver(authority, EXP1, STATION_KEY);
    d6 = r6.delivery;
    expect(d6).toMatchObject({ state: 'delivered', attempt: 6 });
    const dir = stationDir(EXP1);
    expect(sha256(readFileSync(join(dir, 'package.tar')))).toBe(exp1.archiveDigest);
    const sig = readJson(join(dir, 'package.sig'));
    expect(containsString(sig, KEY1_ID)).toBe(true);
    expect(containsString(sig, KEY1_PEM, true)).toBe(true);
    const dj6 = readJson(join(dir, 'delivery.json'));
    expect(dj6).toMatchObject({ delivery_id: d6.delivery_id, attempt: 6, signing_key: { key_id: KEY1_ID, state: 'retired' } });
    expect((dj6['signing_key'] as Row)['retired_at']).not.toBeNull();
    expect((await deliveryRow(d6.delivery_id)).signing_key_id).toBe(KEY1_ID);
    const r0 = await deliver(authority, EXP0, STATION_KEY);
    expect(r0.delivery).toMatchObject({ state: 'delivered', attempt: 1, signing_key_id: null });
    expect(sha256(readFileSync(join(stationDir(EXP0), 'package.tar')))).toBe((await exportRow(EXP0))!.archive_digest);
    // No receipt yet; a receipt naming another delivery through the acknowledge route: both leave the row delivered.
    rmSync(join(dir, 'receipt.json'), { force: true });
    await expect(collect(authority, EXP1, d6.delivery_id)).rejects.toThrow(/no receipt yet/);
    await expect(acknowledge(authority, EXP1, d6.delivery_id, { receipt_id: uuidv7(), recipient: 'x', received_at: new Date().toISOString(), archive_digest: exp1.archiveDigest, package_digest: exp1.packageDigest, verified: true, delivery_id: d1.delivery_id })).rejects.toThrow(/the receipt names delivery/);
    expect(await deliveryRow(d6.delivery_id)).toMatchObject({ state: 'delivered', receipt: null });
    // A verified: false receipt (the recipient could not verify) through the route → mismatched, preserved.
    const unverified = { receipt_id: uuidv7(), recipient: 'NORDWERK GmbH (could not verify)', received_at: new Date().toISOString(), archive_digest: exp1.archiveDigest, package_digest: exp1.packageDigest, verified: false, notes: 'the verifier on our side failed' };
    expect((await acknowledge(authority, EXP1, d6.delivery_id, unverified)).delivery).toMatchObject({ state: 'mismatched', attempt: 6 });
    expect(await deliveryRow(d6.delivery_id)).toMatchObject({ state: 'mismatched', receipt: unverified });
    expect((await deliveryRows(EXP1)).map((d) => [d.attempt, d.state])).toEqual([[1, 'acknowledged'], [2, 'acknowledged'], [3, 'mismatched'], [4, 'acknowledged'], [5, 'failed'], [6, 'mismatched']]);
  }, 300_000);
});

describe('H · THE HTTPS DELIVERY (D8, C15)', () => {
  it('H1 · to the https destination whose credential reference is UNBOUND → failed credential_unbound before any egress (recorded, export.delivery_failed, attempt 1); bound in the process → the .invalid host does not resolve → failed transport (the egress class named), attempt 2; the loopback endpoint → failed egress_refused (address_not_public); the destination\'s readiness follows the binding; NOTHING of the credential\'s value in any row, event, custody row or answer', async () => {
    expect(process.env[DST_REF]).toBeUndefined();
    const custodyBefore = { a: (await custody(mA.manifest_id, 'custody.delivered')).length, b: (await custody(mB.manifest_id, 'custody.delivered')).length };
    const u = await deliver(authority, EXP1, HTTPS_KEY);
    expect(u.delivery).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'credential_unbound' });
    expect(containsString(u.delivery.receipt, DST_REF)).toBe(true);
    expect(await deliveryRow(u.delivery.delivery_id)).toMatchObject({ destination_id: httpsId, state: 'failed', failure_class: 'credential_unbound', signing_key_id: KEY1_ID });
    expect((await eventRows(EXP1, 'export.delivery_failed')).some((e) => containsString(e.details, u.delivery.delivery_id))).toBe(true);
    process.env[DST_REF] = DST_TOKEN;
    try {
      expect((await listDestinations(steward)).destinations.find((d) => d['destination_key'] === HTTPS_KEY)!['readiness']).not.toBe('blocked-credential');
      // The egress path (C15): the host of the .invalid domain resolves to nothing — dns_failure expected, any egress class accepted — recorded as a transport failure.
      const b = await deliver(authority, EXP1, HTTPS_KEY);
      expect(b.delivery).toMatchObject({ state: 'failed', attempt: 2, failure_class: 'transport' });
      expect(containsString(b.delivery.receipt, 'failure')).toBe(true);
      expect(JSON.stringify(b.delivery.receipt)).toMatch(/dns_failure|address_not_public|connect|timeout|tls|egress/i);
      // A loopback endpoint is refused before any connection (address_not_public): the egress's own refusal class.
      const l = await deliver(authority, EXP1, LOOPBACK_KEY);
      expect(l.delivery).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'egress_refused' });
      expect(containsString(l.delivery.receipt, 'address_not_public')).toBe(true);
      // The value is carried to the egress alone (never on a record): every B13 row of the tenant, the events of the exports, the custody rows and the answers are free of it.
      for (const j of await tenantRowsJson([EXP0, EXP1, EXP2, EXP4, EXP5, EXP6])) expect(containsString(j, DST_TOKEN)).toBe(false);
      for (const answer of [u, b, l]) expect(containsString(answer, DST_TOKEN)).toBe(false);
      expect(containsString(await listDeliveries(steward, EXP1), DST_TOKEN)).toBe(false);
      expect(containsString(await listDestinations(steward), DST_TOKEN)).toBe(false);
    } finally {
      delete process.env[DST_REF];
    }
    expect((await listDestinations(steward)).destinations.find((d) => d['destination_key'] === HTTPS_KEY)!['readiness']).toBe('blocked-credential');
    expect((await deliveryRows(EXP1)).filter((d) => d.destination_id === httpsId).map((d) => [d.attempt, d.state, d.failure_class])).toEqual([[1, 'failed', 'credential_unbound'], [2, 'failed', 'transport']]);
    // No custody row for a failed delivery: custody.delivered records what reached a destination.
    expect((await custody(mA.manifest_id, 'custody.delivered')).length).toBe(custodyBefore.a);
    expect((await custody(mB.manifest_id, 'custody.delivered')).length).toBe(custodyBefore.b);
  }, 180_000);
});

describe('P · THE PDP and the reads (D7, D10, C19)', () => {
  it('P1 · the deliveries list (retention.read: the analyst) serves every delivery of the action by attempt with its state and class, no credential value; the export read carries the key (retired now), the expiry, the archive digest and the deliveries; the download by the analyst refused 403, by the auditor admitted (the event names the auditor); the keys list under the auditor is free of private material', async () => {
    const rows = await deliveryRows(EXP1);
    const list = (await listDeliveries(analyst, EXP1)).deliveries;
    expect(list).toHaveLength(rows.length);
    expect(list.map((d) => [d['delivery_id'], d['attempt'], d['state'], d['failure_class']])).toEqual(expect.arrayContaining(rows.map((d) => [d.delivery_id, d.attempt, d.state, d.failure_class])));
    expect(containsString(list, DST_TOKEN)).toBe(false);
    const rd = await getExport(steward, EXP1);
    expect(rd.signing_key).toMatchObject({ key_id: KEY1_ID, purpose: 'demonstration', state: 'retired' });
    expect(rd.signing_key!['retired_at']).not.toBeNull();
    expect(containsString(rd.signing_key, KEY1_PEM, true)).toBe(true);
    expect(rd).toMatchObject({ expired: false, archive_digest: exp1.archiveDigest });
    expect(rd.expires_at).not.toBeNull();
    expect(rd.deliveries).toHaveLength(rows.length);
    expect(rd.files).toHaveLength(4); // B15: manifest.json, links.json and the two object files
    expect(containsString(rd, process.env[KEY1_REF]!)).toBe(false);
    // The download's holders (D7): the steward, the authority, the domain and tenant admins and the AUDITOR — not the analyst.
    await expect(downloadExport(analyst, EXP1)).rejects.toMatchObject({ status: 403 });
    const dl = await downloadExport(auditor, EXP1);
    expect(dl.download).toMatchObject({ archiveDigest: exp1.archiveDigest, packageDigest: exp1.packageDigest });
    expect(sha256(Buffer.from(dl.download.base64, 'base64'))).toBe(exp1.archiveDigest);
    const downloads = await eventRows(EXP1, 'export.downloaded');
    expect(downloads.map((e) => e.actor)).toEqual([steward.principalId, steward.principalId, auditor.principalId]);
    expect((await downloadExport(tenantAdmin, EXP1)).download.archiveDigest).toBe(exp1.archiveDigest);
    // The keys under the auditor (retention.read): both keys retired now, the references by name, nothing private.
    const keys = (await listKeys(auditor)).keys;
    expect(keys.map((k) => [k['key_id'], k['retired_at'] !== null])).toEqual([[KEY1_ID, true], [KEY2_ID, true]]);
    expect(containsString(keys, process.env[KEY1_REF]!)).toBe(false);
    expect(containsString(keys, process.env[KEY2_REF]!)).toBe(false);
    expect(containsString(keys, KEY1_PEM, true)).toBe(true);
    expect(containsString(keys, KEY2_PEM, true)).toBe(true);
    // The retired schedule stays in the list with its columns (S1's row, read once more at the end).
    expect((await listSchedules(auditor)).schedules.find((x) => x['schedule_id'] === scheduleId)).toMatchObject({ state: 'retired' });
  }, 120_000);
});
