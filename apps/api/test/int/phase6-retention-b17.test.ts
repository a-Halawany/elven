/**
 * CP-6 B17 (migration 0077) — IMPORTED KNOWLEDGE PUBLISHED to the importing domain's subscribers (GraphChanged/import.admitted from the
 * admission's graph write, ObservationRecorded per admitted record), the ORIGIN'S REVOCATION PROPAGATED into the importing domains of
 * the tenant (the importer as a recipient on the origin's ledger, the SIGNED notice `eye-revocation-notice/1`, `retention.import.revoke`:
 * the imported edges retracted, the entities retired, every imported version withdrawn, the bytes tombstoned, the ONE
 * GraphChanged/import.revoked with the walk to what rests on the copies, the receipt answered), a LEGAL HOLD holding the revocation
 * until lifted, a FOREIGN ORIGIN'S signed notice from the station verified against the partner's key (the same party's rotated key
 * admitted), and imported claims NOT REVIEWABLE here (ES-08-004, ES-29-005, DP-47-005, AU-COM-0060/-0062, AU-DP-0097, AU-MEM-0030) — on a
 * real database with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED set at module
 * top, the B6 rule), an isolated vault, an isolated transfer station and a SECOND DOMAIN of the tenant (the mirror, created through the
 * tenancy route) holding the seven subscriptions.
 *
 * NO SUBSTITUTION: B17 drives no https egress — the notices of this file reach a transfer station and the tenant's own importing domain;
 * nothing of the product is replaced, the controllers are driven in process as the B14–B16 harnesses drive theirs.
 *
 *   S1 · import.admitted — the origin's records A and B (a REL claim C@1 on B, an edge X on it, the entities and an authoritative
 *   identifier) exported and admitted into the mirror: exactly ONE GraphChanged/import.admitted from the graph write (the created
 *   identities, the edge as recorded, the admitted claim and records, the import block, the six subscriptions, the correlation of the
 *   import.admitted event), TWO ObservationRecorded rows (acquisition_mode import, the intake contract's source and authority class,
 *   imported {import_id, partner_key, origin}) ahead of it in the tenant partition, all published; the six deliveries applied — the
 *   four selectors empty (nothing of the mirror rests on the new ids), retrieval verified on the imported rows, memory mappings nothing
 *   to propose; the imported claim CHALLENGED in the mirror → refused (an imported claim version is corrected at its origin and
 *   re-imported); the native claim still challengeable at the origin. (6) THE TRUNCATION CONTROL (C11): 300 entities and 150 edges on
 *   one claim seeded at the origin, exported and admitted → identities cut at IMPORT_EVENT_LIST_MAX with `truncated` said, the 150
 *   edges carried, the six deliveries applied, no projection drift; the item map holds every entity.
 *
 *   S2 · import.revoked — the mirror builds on the import (a twin bounded by the imported entity with one estimated element citing the
 *   imported RECORD (a twin's claim citation resolves CLM objects; the seeded claim is a REL) — C12; an assumption, a decision, a forecast on the imported entity, a scenario and a decision package resting on the
 *   imported claim, seeded as the B6 harness seeds them); the origin REVOKES E1 → the answer names the importer with its SIGNED notice
 *   (verified here against the origin's key) and the revocation executed in the mirror by the same act: the edge retracted with the
 *   reason, the entities retired (the identifier kept), the claim and both records withdrawn by a new version each (the lineage carried
 *   onto the withdrawn claim version), the records tombstoned and their bytes gone, the custody rows, the import `revoked` with its
 *   counts, the receipt ACKNOWLEDGED on the origin's ledger (the importer notice, the custody.revocation_notified rows, the export read's
 *   importers before the revocation); ONE GraphChanged/import.revoked with the walk (the assumption, the decision, the forecast, the
 *   scenario, the dependencies) and the six deliveries: the twin version unverified, the forecast and the scenario marked, the package's
 *   input invalidated, the identifier of the retired entity PROPOSED (no edge item: the retracted edge is not proposed), retrieval
 *   verified after the retire and the retract; the retry a no-op (C5); the origin's second revoke refused.
 *
 *   S3 · the legal hold — records C and D with a claim C2@1 on D and an edge between a fresh entity E3 and E2 (reused in the mirror by its
 *   authoritative identifier — the retired entity of S2, as C2 states: role reached, lifecycle retired); a hold on the mirror's copy of C
 *   → the origin's revoke answers `held`: D destroyed, C refused with the hold, the receipt copies_destroyed false, the notice
 *   MISMATCHED, the import `revoking` with the event import.revocation_held; the steward's retry while the hold stands → held again (a
 *   second notice attempt mismatched; no second GraphChanged — C4); the hold lifted → the steward completes it: revoked, acknowledged
 *   (attempt 3), a second import.revoked for C alone. (d) THE PENDING PATH: a further export revoked by a domain administrator of the
 *   origin (no authority in the mirror) → `pending` with the reason, the notice notified, the mirror untouched; the steward's first
 *   attempt FAULTS after the graph write (C4's hook) → the import stays revoking with import.revocation_failed; the second attempt
 *   finishes → ONE import.revoked naming the edge and the entity of attempt 1 AND the claim and records of attempt 2, the notice
 *   acknowledged in place. (e) C2 and C9: a package carrying S1's records re-imported after their revocation → admitted AFRESH under
 *   new ids (never a destroyed copy reused), E2 reused retired; a third package reusing that import's record → the first import's
 *   revocation LEAVES the shared record (held_by the other import), the receipt copies_destroyed false, the notice mismatched, the state
 *   revoked all the same; the other import's revocation destroys it.
 *
 *   S4 · the foreign origin — a package rewritten to a foreign tenant and domain (C8) and re-signed with the foreign partner's key,
 *   placed at the station under its foreign path and admitted; `revoke` from the origin's record refused (not a domain of this tenant);
 *   an UNSIGNED revocation.json → refused, nothing destroyed, the refusal recorded; one signed by another party's key → refused; one
 *   naming another package → the port's refusal; the foreign partner's signed notice → revoked from the station, the receipt written
 *   beside the notice, the origin not answered here (the station receipt is the answer), import.revoked with the station source;
 *   check 14's three wordings on a second foreign package (signed and verified; unsigned — the digest match alone; another key); (f)
 *   the SAME party's ROTATED key (C7): a third partner of the foreign party → its signed notice verifies, `rotated_from` names the first.
 *
 *   S5 · the demonstration recipient — a package delivered to the origin's station, acknowledged and revoked → the SIGNED notice at the
 *   station; the recipient with `--revocation --public-key` VERIFIES the signature, destroys and answers (collected → acknowledged); the
 *   notice hand-replaced by an unsigned copy → the recipient KEEPS the copies and says so (collected → mismatched); the acknowledge
 *   route on an importer notice already answered → refused; the notify route for an import that holds no copy → refused.
 *
 * Read against the design's own statements, what this harness does NOT claim: the propagation reaches the tenant's own domains (a
 * foreign installation is the station path of S4); the https positive exchange is the B14/B16 harnesses'; the memory-mappings method
 * changed (every subscription registers fresh here).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { PassThrough } from 'node:stream';
import { canonicalHeaderDigest, type CanonicalHeader, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { TenancyController } from '../../src/tenancy/tenancy.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import { ImportService } from '../../src/retention/import.service.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { IMPORT_EVENT_LIST_MAX } from '../../src/graph/subscriptions/change-events.js';
import { LINKS_FILE, buildUstar, listedFilesOf } from '../../src/retention/export-archive.js';
import { objectsDigestOf, packageDigestOf, type ExportManifestShape } from '../../src/retention/export-package.js';
import { KEY_SIGNATURE_SCHEME, keyIdOf } from '../../src/retention/export-signing.js';
import { NOTICE_SIGNATURE_SCHEME, noticeDigestOf, verifyNotice } from '../../src/retention/revocation-notice.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b17-vault-')));
const STATION_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b17-station-')));
const SCRATCH_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b17-scratch-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
type KeyPair = { privateKey: KeyObject; publicKey: KeyObject };
/** KEY1 signs every export and every notice of the tenant (bound by reference before the boot); KEY2 is the FOREIGN partner's key (S4); KEY3 the same foreign party's rotated key (S4 f, C7). */
const KEY1: KeyPair = generateKeyPairSync('ed25519');
const KEY2: KeyPair = generateKeyPairSync('ed25519');
const KEY3: KeyPair = generateKeyPairSync('ed25519');
const KEY_REF = 'EYE_EXPORT_SIGNING_KEY_B17';
process.env[KEY_REF] = (KEY1.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
const keyIdOfPair = (k: KeyPair): string => keyIdOf(k.publicKey.export({ type: 'spki', format: 'der' }) as Buffer);
const pemOf = (k: KeyPair): string => `${spkiPem(k.publicKey)}\n`;
const KEY1_PEM = pemOf(KEY1); const KEY2_PEM = pemOf(KEY2); const KEY3_PEM = pemOf(KEY3);
const KEY1_PEM_FILE = join(SCRATCH_DIR, 'b17-key1.pub.pem');
writeFileSync(KEY1_PEM_FILE, KEY1_PEM);

const execFile = promisify(execFileCb);
const STATION_RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/transfer-station-recipient.mjs');
const STATION_KEY = 'b17-station'; const STATION_KEY_D2 = 'b17-station-mirror';
const ORIGIN_PARTNER = 'b17-origin'; const FOREIGN_PARTNER = 'b17-foreign'; const ROTATED_PARTNER = 'b17-foreign-rotated';
const ORIGIN_PARTY = 'NORDWERK GmbH (origin domain; harness)'; const FOREIGN_PARTY = 'FOREIGN INSTALLATION (another party; harness)';
/** The scheme as the SPECIFICATION names it — the foreign origin's product (S4) signs by the specification, not by this tree's symbol; S5 pins the two equal on the product's own notice. */
const NOTICE_SCHEME = 'eye-revocation-notice/1';

type Row = Record<string, unknown>;
type Check = { name: string; ok: boolean | null; detail: string | null };
type OpenAnswer = { import: Row; checks: Check[]; items: Row[]; verified: boolean; importReceipt: Row; receipt: Row };
type ImportDetail = { import: Row; partner: Row | null; items: Row[]; events: Row[]; checks: Check[]; importReceipt: Row; receipt: Row };
type AdmitAnswer = { import: Row; batches: Row[]; receipt: Row };
/** The source of an import's revocation as the route takes it (§3.3): the origin's record here, or the origin's signed notice at a station declared in this domain. */
type RevocationSource = { kind: 'origin' } | { kind: 'station'; destinationKey: string };
/** The revocation block of the import revoke route's answer and of the revoke act's `importers[].revocation` (§3.3 RevokeImportAnswer; §5.1). */
type ImportRevocation = { state: string; attempt: number; source: Row | null; notice: Row | null; destroyed: Row; left: number; refused: Row[]; bytes: Row | null; receipt: Row | null; answered: Row | null; station_receipt: Row | null; reason?: string };
type RevokeImportAnswer = { import: Row; revocation: ImportRevocation; batches: Row[]; receipt: Row };
/** An importer as the revoke act answers it (§5.1): the importer row of the origin's ledger, its notice and the revocation executed there — or pending with the reason. */
type Importer = Row & { notice: Row & { notice: Row }; revocation: Partial<ImportRevocation> & { state: string; reason?: string } };
type RevokeAnswer = { revocation: Row; notices: Row[]; importers: Importer[]; bytes: { removed: boolean }; stations: Row[]; receipt: Row };
/** The B16 and B17 routes of the retention controller as the design states them (§5); the harness calls them in process, as the B14–B16 harnesses call theirs. */
interface B17Routes {
  declarePartner(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<{ partner: Row; receipt: Row }>;
  openImport(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<OpenAnswer>;
  approveImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { packageDigest?: string; rationale?: string } }): Promise<{ import: Row; receipt: Row }>;
  admitImport(req: never, tenantId: string, domainId: string, importId: string): Promise<AdmitAnswer>;
  getImport(req: never, tenantId: string, domainId: string, importId: string): Promise<ImportDetail>;
  revokeImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { source?: RevocationSource } }): Promise<RevokeImportAnswer>;
  revokeExport(req: never, tenantId: string, domainId: string, actionId: string, body: { payload?: { reason?: string } }): Promise<RevokeAnswer>;
  notifyRevocation(req: never, tenantId: string, domainId: string, actionId: string, body: { payload?: { destinationKey?: string; importer?: { domainId: string; importId: string } } }): Promise<{ notice: Row; importer?: Row; receipt: Row }>;
  getExport(req: never, tenantId: string, domainId: string, actionId: string): Promise<{ package: Row; importers?: Row[]; revocation_notices?: Row[]; receipt: Row }>;
  listRevocationNotices(req: never, tenantId: string, domainId: string, actionId: string): Promise<{ notices: Row[]; receipt: Row }>;
}
/** C4's test-only hook on the import service: an infrastructure fault thrown once, after the graph write of a revocation attempt committed. */
interface RevocationFaultHook { armRevocationFaultForTests(kind: 'after_graph_write'): void }

let h: Phase4Harness; let retention: RetentionController; let b17: B17Routes; let observation: ObservationController; let graph: GraphController; let twins: TwinController; let intelligence: IntelligenceController;
let imports: ImportService; let vault: VaultService; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal;
/** The mirror domain (D2) and its people: the steward, the administrator, the registrar and the manager of the intake source, and the builder who rests the mirror's own work on the imported knowledge. */
let D2 = ''; let steward2: AuthenticatedPrincipal; let domainAdmin2: AuthenticatedPrincipal; let registrar2: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal; let builder2: AuthenticatedPrincipal;
let intake = { sourceId: '', version: 1, sourceKey: '' };
let originPartnerId = ''; let foreignPartnerId = '';
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;
const writeJson = (p: string, v: unknown): void => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v)) as V;
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const E1 = uuidv7(); const E2 = uuidv7();
const LEI = '5299000NORDWERK00001';
/** The six consumer kinds a GraphChanged reaches; the seventh (`relationships`) selects MemoryCorrected/claim.corrected alone (B9) and is registered too, so its absence from every GraphChanged delivery is a fact of the registry, not of this file. */
const GRAPH_KINDS = CONSUMER_KINDS.filter((k) => k !== 'relationships');

/* ───────────── the rows ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
type ManifestRow = { manifest_id: string; source_id: string; contract_version: number; content_digest: string; byte_length: number; locator: string; classification: string; domain_id: string };
const manifestRow = async (manifestId: string): Promise<ManifestRow> => (await sql<ManifestRow>`select manifest_id::text, source_id::text, contract_version::int, content_digest, byte_length::int, locator, classification, domain_id::text from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Row; actor: string }>`select event, details, actor from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const tombstonesOf = async (manifestId: string) => (await sql<{ tombstone_id: string; reason: string }>`select tombstone_id::text, reason from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows;
type ExportRow = { package_digest: string; archive_digest: string | null; byte_total: number; expires_at: Date | null; revoked_at: Date | null; manifest_digest: string; signing_key_id: string | null };
const exportRow = async (id: string): Promise<ExportRow> => (await sql<ExportRow>`select package_digest, archive_digest, byte_total::int, expires_at, revoked_at, manifest_digest, signing_key_id from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const actionEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
type NoticeRow = { notice_id: string; attempt: number; state: string; destination_id: string | null; delivery_id: string | null; importer: Row | null; notice: Row; receipt: Row | null; acknowledged_at: Date | null };
const noticeRows = async (actionId: string): Promise<NoticeRow[]> => (await sql<NoticeRow>`select notice_id::text, attempt::int, state, destination_id::text, delivery_id::text, importer, notice, receipt, acknowledged_at from retention.export_revocation_notices where action_id = ${actionId}::uuid order by notified_at, attempt`.execute(su)).rows;
const importerNotices = async (actionId: string, importId: string): Promise<NoticeRow[]> => (await noticeRows(actionId)).filter((n) => n.importer !== null && String(n.importer['import_id']) === importId);
type ImportRow = { import_id: string; state: string; verified: boolean; partner_id: string | null; package_digest: string | null; manifest_locator: string | null; links_locator: string | null; origin: Row; counts: Row; admitted_by: string | null; attempts: number; revoked_by: string | null; revoked_at: Date | null; revocation: Row | null; revocation_attempts: number };
const importRow = async (importId: string): Promise<ImportRow | undefined> => (await sql<ImportRow>`select import_id::text, state, verified, partner_id::text, package_digest, manifest_locator, links_locator, origin, counts, admitted_by::text, attempts::int, revoked_by::text, revoked_at, revocation, revocation_attempts::int from retention.imports where import_id = ${importId}::uuid`.execute(su)).rows[0];
const importEvents = async (importId: string) => (await sql<{ event: string; details: Row; actor_principal_id: string | null; correlation_id: string; occurred_at: Date }>`select event, details, actor_principal_id::text, correlation_id::text, occurred_at from retention.import_events where import_id = ${importId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const eventsAfterFinalized = async (importId: string): Promise<string[]> => { const ev = (await importEvents(importId)).map((e) => e.event); return ev.slice(ev.lastIndexOf('import.finalized') + 1); };
type ItemRow = { item_id: string; kind: string; origin_ref: string; origin: Row; staged: Row | null; planned: Row; disposition: string; gate: string | null; reason: string | null; admitted: Row | null; dependency_order: number; revocation: Row | null; revoked_at: Date | null };
const importItems = async (importId: string): Promise<ItemRow[]> => (await sql<ItemRow>`select item_id::text, kind, origin_ref, origin, staged, planned, disposition, gate, reason, admitted, dependency_order::int, revocation, revoked_at from retention.import_items where import_id = ${importId}::uuid order by dependency_order`.execute(su)).rows;
type ObjectRow = { object_id: string; object_version: number; object_type: string; lifecycle_state: string; truth_state: string; correction_of: string | null; supersedes: string | null; withdrawal_reason: string | null; method_ref: string | null; accountable_owner: string; payload: Row; domain_id: string };
const objectRows = async (objectId: string): Promise<ObjectRow[]> => (await sql<ObjectRow>`select object_id::text, object_version::int, object_type, lifecycle_state, truth_state, correction_of, supersedes, withdrawal_reason, method_ref, accountable_owner, payload, domain_id::text from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const lineageRows = async (claimId: string) => (await sql<{ claim_version: number; evidence_object_id: string; evidence_digest: string; run_id: string; method_id: string }>`select claim_version::int, evidence_object_id::text, evidence_digest, run_id::text, method_id::text from intelligence.claim_lineage where claim_object_id = ${claimId}::uuid order by claim_version`.execute(su)).rows;
type EdgeRow = { edge_id: string; subject_entity_id: string; object_entity_id: string; predicate: string; claim_object_id: string; claim_version: number; state: string; retracted_by: string | null; retraction_reason: string | null; retracted_at: Date | null };
const edgeRow = async (edgeId: string): Promise<EdgeRow | undefined> => (await sql<EdgeRow>`select edge_id::text, subject_entity_id::text, object_entity_id::text, predicate, claim_object_id::text, claim_version::int, state, retracted_by::text, retraction_reason, retracted_at from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0];
const edgeEvents = async (edgeId: string) => (await sql<{ event: string; details: Row }>`select event, details from graph.edge_events where edge_id = ${edgeId}::uuid order by occurred_at, event_id`.execute(su)).rows;
type EntityRow = { entity_id: string; entity_type: string; canonical_name: string; lifecycle_state: string };
const entityRow = async (entityId: string): Promise<EntityRow | undefined> => (await sql<EntityRow>`select entity_id::text, entity_type, canonical_name, lifecycle_state from graph.entities_current where entity_id = ${entityId}::uuid`.execute(su)).rows[0];
const entityEvents = async (entityId: string) => (await sql<{ event: string; details: Row }>`select event, details from graph.entity_events where entity_id = ${entityId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const identifiersIn = async (domainId: string) => (await sql<{ identifier_id: string; entity_id: string; system_key: string; identifier_value: string }>`select identifier_id::text, entity_id::text, system_key, identifier_value from graph.entity_identifiers where domain_id = ${domainId}::uuid order by system_key, identifier_value`.execute(su)).rows;
const blobExists = (vaultName: 'quarantine' | 'evidence' | 'archive', domainId: string, locator: string) => vault.exists(vaultName, { tenantId: T(), domainId }, locator);
const contractAuthorityClass = async (sourceId: string, version: number): Promise<string> => (await sql<{ authority_class: string }>`select authority_class from observation.source_contracts_current where source_id = ${sourceId}::uuid and contract_version = ${version}`.execute(su)).rows[0]!.authority_class;
// The mirror's own world (S2), as the B6 harness reads it after a delivery.
const twinVerification = async (twinId: string, version: number) => (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(su)).rows[0]?.verification_state;
const twinUnverifiedEvents = async (twinId: string, version: number) => (await sql<{ details: Row }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified' and (details ->> 'version')::int = ${version} order by occurred_at`.execute(su)).rows;
const forecastRow = async (id: string) => (await sql<{ attention_state: string; state: string; attention_reason: string | null }>`select attention_state, state, attention_reason from prediction.forecasts_current where forecast_id = ${id}::uuid`.execute(su)).rows[0];
const scenarioRow = async (id: string) => (await sql<{ attention_state: string; state: string }>`select attention_state, state from prediction.scenarios_current where scenario_id = ${id}::uuid`.execute(su)).rows[0];
const packageEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from decision.package_events where package_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
const mappingProposals = async (eventId: string) => (await sql<{ reconciliation_id: string; subject_kind: string; subject_id: string; from_entity_id: string | null; to_entity_id: string | null; state: string; basis: string }>`select reconciliation_id::text, subject_kind, subject_id::text, from_entity_id::text, to_entity_id::text, state, basis from graph.mapping_reconciliations where cause_event_id = ${eventId}::uuid order by subject_kind, subject_id`.execute(su)).rows;
const retrievalChecks = async (eventId: string) => (await sql<{ mismatched: number; touched: Row; projections: unknown[] }>`select mismatched::int, touched, projections from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid`.execute(su)).rows;
const applyActionsSince = async (since: Date) => (await sql<{ actor: string; action: string }>`select distinct actor, action from audit.audit_events where action like '%.subscription.apply' and tenant_id = ${T()}::uuid and occurred_at::timestamptz >= ${since}`.execute(su)).rows;

/* ───────────── the outbox and the deliveries (the B6 idioms, in the mirror) ───────────── */
type OutboxRow = { id: string; status: string; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
const outboxRowsIn = async (domainId: string, eventType: string, after: Date): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows;
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>; last_error: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const deliveryEvents = async (eventId: string, kind: string): Promise<string[]> =>
  (await sql<{ event: string }>`select e.event from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id where e.outbox_event_id = ${eventId}::uuid and s.consumer_kind = ${kind} order by e.occurred_at, e.event_id`.execute(su)).rows.map((r) => r.event);
/** A marker on the DATABASE clock (outbox created_at is the write transaction's now(); both come back at millisecond precision, so the match is >=). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const settleIn = async (domainId: string, ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.subscriptionQueueCountsForTests(T(), domainId);
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`the subscription queue of ${domainId} did not settle: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};
/** The GraphChanged rows of a kind in the domain since the mark — of one import when named — every one published by the real outbox tick; the case asserts how many. */
const publishedIn = (domainId: string, kind: string, after: Date, importId?: string): Promise<OutboxRow[]> =>
  waitFor(`the GraphChanged/${kind} row${importId === undefined ? '' : ` of import ${importId}`} published`,
    () => outboxRowsIn(domainId, 'GraphChanged', after).then((rows) => rows.filter((r) => (r.payload['change'] as Row)['kind'] === kind && (importId === undefined || (r.payload['cause'] as Row)['target_id'] === importId))),
    (rows) => rows.length > 0 && rows.every((r) => r.status === 'published'));
/** The six deliveries of an event applied, the queue settled, the rows by kind. */
const sixApplied = async (eventId: string): Promise<Record<string, Delivery>> => {
  const ds = await waitFor(`the six deliveries of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.length === 6 && rows.every((d) => d.state === 'applied'), 120_000);
  await settleIn(D2);
  for (const d of ds) expect(d, d.consumer_kind).toMatchObject({ deliveries: 1, attempts: d.items.length > 0 ? 1 : 0, last_error: null });
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted([...GRAPH_KINDS]));
  return Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
};
const payloadOf = (r: OutboxRow) => r.payload as unknown as { schema: string; schema_version: string; change: Row; identities: Row[]; relationships: { edges: Row[]; resolutions: Row[]; dependencies: Row[] }; objects: Row & { claims: string[]; evidence: string[] }; temporal: Row; subscriptions: Array<{ subscription_id: string; consumer_kind: string }>; cause: Row; import: Row };

/* ───────────── the routes (D1 as the B16 harness; the mirror by `reqIn`) ───────────── */
const reqIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  ({ eyeEnvelope: { ...(h.req(as, action, objectType, objectId, purpose) as { eyeEnvelope: Row }).eyeEnvelope, domain_id: domainId }, eyePrincipal: as }) as never;
const envIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string): Envelope => ({ ...h.env(as, action, objectType, objectId, purpose), domain_id: domainId } as Envelope);
const routeIn = (domainId: string, action: string, objectType: string, objectId: string | null) => ({ scope: 'DOMAIN' as const, tenantId: T(), domainId, action, objectType, objectId });
type Exported = { id: string; domainId: string; packageDigest: string; archiveDigest: string; manifestDigest: string; expiresAt: string | null; dir: string };
/** A customer export in a domain of the tenant: opened, resolved and executed by the domain's steward, approved by the tenant's retention authority, verified. */
const exportedIn = async (domainId: string, opener: AuthenticatedPrincipal, manifestIds: string[], ceiling = 'internal'): Promise<Exported> => {
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
const exported = (manifestIds: string[], ceiling = 'internal') => exportedIn(D(), steward, manifestIds, ceiling);
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string) => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose: 'demonstration' } }) as Promise<{ key: Row }>;
const declareDestinationIn = (domainId: string, p: AuthenticatedPrincipal, payload: Row) => retention.declareDestination(reqIn(p, domainId, 'retention.destination.declare', 'RDS', null, 'retention'), T(), domainId, { payload }) as Promise<{ destination: Row }>;
type DeliveryAnswer = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null };
const deliverTo = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.deliverExport(h.req(p, 'retention.export.deliver', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ delivery: DeliveryAnswer }>;
const collect = (p: AuthenticatedPrincipal, id: string, deliveryId: string) => retention.collectReceipt(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId) as unknown as Promise<{ delivery: DeliveryAnswer }>;
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => b17.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
const collectNotice = (p: AuthenticatedPrincipal, id: string, noticeId: string) => retention.collectRevocationReceipt(h.req(p, 'retention.export.acknowledge', 'RXN', noticeId, 'retention'), T(), D(), id, noticeId) as unknown as Promise<{ notice: Row }>;
const acknowledgeNotice = (p: AuthenticatedPrincipal, id: string, noticeId: string, receipt: Row) => retention.acknowledgeRevocationNotice(h.req(p, 'retention.export.acknowledge', 'RXN', noticeId, 'retention'), T(), D(), id, noticeId, { payload: { receipt } }) as unknown as Promise<{ notice: Row }>;
const notifyImporter = (p: AuthenticatedPrincipal, id: string, importer: { domainId: string; importId: string }) => b17.notifyRevocation(h.req(p, 'retention.export.notify', 'RTA', id, 'retention'), T(), D(), id, { payload: { importer } });
const getExport = (p: AuthenticatedPrincipal, id: string) => b17.getExport(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id);
const listNotices = (p: AuthenticatedPrincipal, id: string) => b17.listRevocationNotices(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id);
/** The stream route driven in process (the B15 harness's double): the bytes piped to a file and hashed as they arrive. */
const streamExport = async (p: AuthenticatedPrincipal, id: string, toFile: string): Promise<{ status: number; digest: string; size: number }> => {
  const sink = new PassThrough(); const out = createWriteStream(toFile);
  const hash = createHash('sha256'); let size = 0; let status = 0;
  sink.on('data', (c: Buffer) => { hash.update(c); size += c.byteLength; });
  sink.pipe(out);
  const res = Object.assign(sink, { writeHead: (s: number) => { status = s; return res; }, status: (s: number) => { status = s; return res; }, json: (_b: unknown) => res });
  await retention.streamExport(h.req(p, 'retention.export.download', 'RTA', id, 'retention'), res as never, T(), D(), id);
  await new Promise<void>((r) => { if (out.closed) r(); else out.on('close', () => r()); });
  return { status, digest: hash.digest('hex'), size };
};
// The B16 routes in the mirror domain, and the B17 revoke act.
const openImport = (p: AuthenticatedPrincipal, source: Row, domainId = D2) => b17.openImport(reqIn(p, domainId, 'retention.import.open', 'RIM', null, 'retention'), T(), domainId, { payload: { source } });
const openInline = (p: AuthenticatedPrincipal, tar: Buffer, exchange: Row | null = null) => openImport(p, { kind: 'inline', base64: tar.toString('base64'), ...(exchange === null ? {} : { exchange }) });
/** C8: the station path is the ORIGIN's `<tenant>/<domain>/<action>` — this installation's origin domain by default, a foreign tenant and domain when given. */
const openStation = (p: AuthenticatedPrincipal, originActionId: string, destinationKey = STATION_KEY_D2, origin: { tenantId: string; domainId: string } = { tenantId: T(), domainId: D() }) => openImport(p, { kind: 'station', destinationKey, origin: { ...origin, actionId: originActionId } });
const approveImport = (p: AuthenticatedPrincipal, importId: string, packageDigest: string, rationale = 'the package as verified (harness)') => b17.approveImport(reqIn(p, D2, 'retention.import.approve', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { packageDigest, rationale } });
const admitImport = (p: AuthenticatedPrincipal, importId: string) => b17.admitImport(reqIn(p, D2, 'retention.import.admit', 'RIM', importId, 'retention'), T(), D2, importId);
const getImport = (p: AuthenticatedPrincipal, importId: string) => b17.getImport(reqIn(p, D2, 'retention.read', 'RIM', importId, 'retention'), T(), D2, importId);
const revokeImport = (p: AuthenticatedPrincipal, importId: string, source: RevocationSource) => b17.revokeImport(reqIn(p, D2, 'retention.import.revoke', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { source } });
const declarePartner = (p: AuthenticatedPrincipal, payload: Row) => b17.declarePartner(reqIn(p, D2, 'retention.partner.declare', 'RXP', null, 'retention'), T(), D2, { payload });
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
/** THE MAP of an import: every origin id → the mirror's id (records and claims by object id, entities and edges by their reference), as the B16 harness builds it — admitted or reused rows alike. */
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
const register = (kind: ConsumerKind) => graph.registerSubscription(reqIn(tenantAdmin, D2, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D2,
  { payload: { consumerKind: kind, ownerPrincipalId: builder2.principalId, backlog: 'leave', ...(kind === 'relationships' ? { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } : {}) } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;

/* ───────────── refusals, checks, the recipient ───────────── */
/** A refused call: the message matched whatever the carrier — the port's raw text in process, or an HttpException with its status (asserted when both are given). */
const refused = async (p: Promise<unknown>, re: RegExp, status?: number): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error(`the call should have been refused (${re})`); }, (err: unknown) => err as { status?: unknown; message?: unknown });
  const message = String(e.message ?? ''); const s = typeof e.status === 'number' ? e.status : null;
  expect(message).toMatch(re);
  if (status !== undefined && s !== null) expect(s).toBe(status);
  return { status: s, message };
};
const checkNamed = (checks: Check[], re: RegExp): Check => { const c = checks.find((x) => re.test(x.name)); expect(c, `a check named ${re} among: ${checks.map((x) => x.name).join(' / ')}`).toBeDefined(); return c!; };
const failedChecks = (checks: Check[]) => checks.filter((c) => c.ok === false).map((c) => `${c.name}${c.detail === null ? '' : ` — ${c.detail}`}`);
const run = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try { const r = await execFile(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { code: 0, stdout: r.stdout, stderr: r.stderr }; }
  catch (e) { const err = e as { code?: number; stdout?: string; stderr?: string }; return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }; }
};
const stationRecipient = (actionId: string, ...extra: string[]) => run([STATION_RECIPIENT, STATION_DIR, T(), D(), actionId, '--public-key', KEY1_PEM_FILE, ...extra]);
const stationDir = (id: string) => join(STATION_DIR, T(), D(), id);

/* ───────────── packages in the harness's hands (the B16 idioms): read from an export directory, rewritten, re-signed, built into a tar ───────────── */
type Pkg = { manifest: Row; files: Map<string, Buffer> };
const manifestBytesOf = (m: Row): Buffer => Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8');
const packageOf = (dir: string): Pkg => { const manifest = readJson(join(dir, 'manifest.json')); const files = new Map<string, Buffer>(); for (const f of listedFilesOf(manifest['objects'], manifest as never)) files.set(f, readFileSync(join(dir, f))); return { manifest, files }; };
const clonePkg = (p: Pkg): Pkg => ({ manifest: clone(p.manifest), files: new Map(p.files) });
const linksOfPkg = (p: Pkg): Row => JSON.parse(p.files.get(LINKS_FILE)!.toString('utf8')) as Row;
/** The package's tar as the product builds it (manifest.json first, then the listed files by name, at the manifest's built_at) — the B15 harness proved buildUstar = the product's archive. */
const tarOfPkg = (p: Pkg): Buffer => { const m = p.manifest; const mtime = Math.floor(Date.parse(String((m['package'] as Row)['built_at'])) / 1000); return buildUstar([{ name: 'manifest.json', bytes: manifestBytesOf(m) }, ...listedFilesOf(m['objects'], m as never).map((name) => ({ name, bytes: p.files.get(name)! }))], mtime); };
const tarOfDir = (dir: string): Buffer => tarOfPkg(packageOf(dir));
/** The chain recomputed over the manifest as altered and signed by the given key — what a sender's product does. */
const resign = (m: Row, key: KeyPair): void => {
  const sig = (m['signature'] ?? {}) as Row; const shape = m as unknown as ExportManifestShape;
  const packageDigest = packageDigestOf({ format: shape.format, package: shape.package, authorization: shape.authorization, gates: shape.gates, objects: shape.objects, excluded: shape.excluded, signature: { bound_to: sig['bound_to'] ?? null, statement: sig['statement'] ?? null } });
  m['signature'] = { ...sig, scheme: KEY_SIGNATURE_SCHEME, objects_digest: objectsDigestOf(shape.objects), package_digest: packageDigest, key_id: keyIdOfPair(key), algorithm: 'Ed25519', signature: cryptoSign(null, Buffer.from(packageDigest, 'utf8'), key.privateKey).toString('base64') };
};
/** links.json replaced and the manifest's package.links restated — the caller re-signs. */
const setLinks = (p: Pkg, links: Row): void => {
  const bytes = Buffer.from(`${JSON.stringify(links, null, 2)}\n`, 'utf8'); p.files.set(LINKS_FILE, bytes);
  const pk = p.manifest['package'] as Row; const counts = links['counts'] as Row;
  pk['links'] = { ...(pk['links'] as Row), links_digest: sha256(bytes), byte_length: bytes.byteLength, format: links['format'], claims: counts['claims'], edges: counts['edges'], entities: counts['entities'], excluded: counts['excluded'] };
};
/**
 * C8: a package this installation never built — the action id AND the origin tenant and domain rewritten (the manifest's package block,
 * the binding's action, the closure's package block) to fresh uuids and the chain re-signed with the given key: a foreign installation's
 * package, whose origin no record here knows. The station path of such a package is the foreign `<tenant>/<domain>/<action>`.
 */
type Foreign = { pkg: Pkg; digest: string; archiveDigest: string; tar: Buffer; tenantId: string; domainId: string; actionId: string; deliveryId: string; dir: string };
const foreignOf = (base: Pkg, key: KeyPair): Foreign => {
  const f = clonePkg(base); const fid = uuidv7(); const ft = uuidv7(); const fd = uuidv7();
  const pk = f.manifest['package'] as Row; pk['action_id'] = fid; pk['tenant_id'] = ft; pk['domain_id'] = fd;
  ((f.manifest['signature'] as Row)['bound_to'] as Row)['action_id'] = fid;
  const links = linksOfPkg(f); const lp = links['package'] as Row; lp['action_id'] = fid; lp['tenant_id'] = ft; lp['domain_id'] = fd; setLinks(f, links);
  resign(f.manifest, key);
  const tar = tarOfPkg(f);
  return { pkg: f, digest: String((f.manifest['signature'] as Row)['package_digest']), archiveDigest: sha256(tar), tar, tenantId: ft, domainId: fd, actionId: fid, deliveryId: uuidv7(), dir: join(STATION_DIR, ft, fd, fid) };
};
/** The foreign package placed at the station under its foreign path, with an unsigned delivery.json naming the exchange (the expiry among it). */
const placeForeign = (f: Foreign): string => {
  mkdirSync(f.dir, { recursive: true });
  writeFileSync(join(f.dir, 'package.tar'), f.tar);
  writeJson(join(f.dir, 'delivery.json'), { delivery_id: f.deliveryId, attempt: 1, action_id: f.actionId, tenant_id: f.tenantId, domain_id: f.domainId, destination_key: STATION_KEY_D2, recipient: 'the mirror domain reads the station (harness)', package_digest: f.digest, archive_digest: f.archiveDigest, delivered_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  return f.dir;
};
/** The foreign origin's revocation notice in the product's own shape (export-delivery.service.ts noticeOf), naming the package it revokes. */
const foreignNotice = (f: Foreign, over: Row = {}): Row => ({
  notice: 'revocation', notice_id: uuidv7(), attempt: 1, action_id: f.actionId, tenant_id: f.tenantId, domain_id: f.domainId, destination_key: STATION_KEY_D2, recipient: 'the mirror domain reads the station (harness)',
  delivery: { delivery_id: f.deliveryId, attempt: 1, state: 'acknowledged', held: 'confirmed' },
  package_digest: f.digest, archive_digest: f.archiveDigest, signing_key_id: keyIdOfPair(KEY2), revoked_at: new Date().toISOString(), reason: 'the foreign origin revokes its package (harness)', notified_at: new Date().toISOString(),
  obligation: 'the package is revoked: destroy every copy of package.tar and of its contents held from this delivery, and confirm', statement: 'a notice placed at the station by the harness, as the foreign origin\'s product would place it', ...over,
});
/** The notice SIGNED as the product signs one (D8): Ed25519 over the ASCII hex of sha256(JCS(notice without signature/unsigned)), by the given key. */
const signedNotice = (notice: Row, key: KeyPair): Row => {
  const { signature: _s, unsigned: _u, ...body } = notice; void _s; void _u;
  return { ...body, signature: { scheme: NOTICE_SCHEME, key_id: keyIdOfPair(key), algorithm: 'Ed25519', signature: cryptoSign(null, Buffer.from(noticeDigestOf(body), 'utf8'), key.privateKey).toString('base64') } };
};
const unsignedOf = (notice: Row): Row => { const { signature: _s, unsigned: _u, ...body } = notice; void _s; void _u; return body; };

/* ───────────── the origin's derived knowledge, seeded as the extraction admits it (the B16 idiom) ───────────── */
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
const REL_PAYLOAD = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait' };
/** A claim version as the extraction would have admitted it: the complete header, the payload the claim schema admits, its lineage row on the evidence BYTES, a run row; truth state `extracted` (what grounds an estimated twin element, C12). Written by the superuser. */
async function seedClaim(a: { claimId?: string; version?: number; type: 'REL' | 'ENT'; evidence: Evd; classification: 'internal' | 'confidential'; payload: Row }): Promise<{ claimId: string; version: number; runId: string; methodId: string }> {
  const claimId = a.claimId ?? uuidv7(); const version = a.version ?? 1; const runId = uuidv7(); const methodId = uuidv7(); const now = new Date().toISOString();
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: a.evidence.bytesDigest, byte_start: 0, byte_end: 4, extraction_identity: sha256(`${claimId}@${version}`), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload: Row = { ...a.payload, confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null } };
  const prior = version > 1 ? `${claimId}@${version - 1}` : null;
  const header: CanonicalHeader = {
    object_id: claimId, object_type: a.type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [a.evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${a.evidence.id}@${a.evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: a.classification, purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${a.type}@v1`, ontology_ref: null, correction_of: prior, supersedes: prior, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${a.classification}, 'intelligence', null, null, null, null, null, null, null, ${header.schema_ref}, null, ${prior}, ${prior}, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.evidence.bytesDigest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, version, runId, methodId };
}
/** An entity of the origin domain, by SQL (the B6 idiom). */
const seedEntity = async (id: string, type: string, name: string): Promise<void> => {
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
};
/** An edge asserted through the governed port on the given claim VERSION, its evidence the record's bytes; the ends given (E2 → E1 by default). */
const assertEdge = async (a: { predicate: string; claimId: string; claimVersion: number; evidence: Evd; subject?: string; object?: string }): Promise<string> => {
  const edgeId = uuidv7();
  await h.pipeline.write(h.env(owner, 'graph.edge.assert', 'EDG', edgeId, 'graph'), owner, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
    async (cap) => {
      await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: a.subject ?? E2, predicate: a.predicate, object: a.object ?? E1, validFrom: '2024-01-01T00:00:00.000Z', validTo: null, claimObjectId: a.claimId, claimVersion: a.claimVersion, evidenceObjectId: a.evidence.id, evidenceDigest: a.evidence.bytesDigest, methodId: null, runId: null, mode: 'replay', confidence: 0.7, actor: owner.principalId, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: { edgeId }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
    });
  return edgeId;
};
/** An edge of the origin domain by SQL (the B6 idiom; S1's truncation control seeds 150 of them). */
const seedEdge = async (edgeId: string, subject: string, object: string, claimId: string, evidence: Evd): Promise<void> => {
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${subject}::uuid, 'ships_through', ${object}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidence.id}::uuid, ${evidence.bytesDigest}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
};
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
  const sourceKey = `b17-exchange-intake-${uuidv7().slice(-8)}`;
  const sourceId = ((await observation.registerSource(reqIn(registrar2, domainId, 'observation.source.register', 'SRC', null, 'observation'), T(), domainId, { payload: { contract: uploadContract(sourceKey, 'internal') } })) as { source: { sourceId: string } }).source.sourceId;
  await registryWriteIn(domainId, manager2, 'observation.source.approve', sourceId, async (cap) => { await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId, decision: 'approve', reason: 'the mirror\'s intake (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
  await registryWriteIn(domainId, manager2, 'observation.source.transition', sourceId, async (cap) => { await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId, target: 'active', reason: 'the mirror\'s intake: active (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
  return { sourceId, version: 1, sourceKey };
};
/** The mirror's projections rebuilt from their event logs — no drift after the graph changed (the B16 idiom; B20: the SYMMETRIC check — nothing missing, nothing unexpected, the representation current — over the six partitions). */
const noDrift = async (): Promise<void> => {
  const proj = (await h.pipeline.consequentialRead(envIn(domainAdmin2, D2, 'graph.read', 'ENT', null, 'graph'), domainAdmin2, routeIn(D2, 'graph.read', 'ENT', null), GraphCapability.read, async (cap) => cap.rebuildProjections())).result;
  expect(proj.map((r) => r.projection)).toEqual(['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current']);
  for (const r of proj) {
    expect(Number(r.mismatched), `${r.projection} drifted from its event log`).toBe(0);
    expect(Number(r.missing), `${r.projection}: a row its log has is missing from the projection`).toBe(0);
    expect(Number(r.unexpected), `${r.projection}: a projection row its log does not know (poisoned)`).toBe(0);
    expect(r.representation_ok, `${r.projection}: the partition was verified under an outdated representation version`).toBe(true);
  }
};

/* ───────────── the fixtures the cases share ───────────── */
let A: Evd; let B: Evd; let mA: ManifestRow; let mB: ManifestRow;
let C = ''; let edgeX = ''; let I1 = '';
let E1x: Exported; let s1: Imported;
let twinId = ''; let E3bx: Exported; let pendingNoticeId = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { TenancyController: Tc } = await import('../../src/tenancy/tenancy.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { IntelligenceController: Ic } = await import('../../src/intelligence/intelligence.controller.js');
  retention = h.app.get(Rc); b17 = retention as unknown as B17Routes; observation = h.app.get(Oc); graph = h.app.get(Gc); twins = h.app.get(Tw); intelligence = h.app.get(Ic);
  imports = h.app.get(ImportService); vault = h.app.get(VaultService); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b17-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b17-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b17-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b17-tenant-admin', 'TENANT');
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'resolution_manager'], 'b17-owner');
  // THE ORIGIN'S WORLD: two entities, the authoritative identifier system (the B6 idiom).
  await seedEntity(E1, 'place', 'Bab el-Mandeb Strait'); await seedEntity(E2, 'organization', 'NORDWERK Magnet GmbH');
  await sql`insert into graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
    values ('DOMAIN', ${T()}::uuid, ${D()}::uuid, 'lei', 'GLEIF', 'Legal Entity Identifier', true, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  // THE MIRROR DOMAIN: a second domain of the tenant through the tenancy route (the tenant administrator's act), with its own people.
  const tenancy = h.app.get(Tc) as TenancyController;
  const envT = { ...(h.req(tenantAdmin, 'tenancy.domain.create', 'CID', null, 'platform.administration') as { eyeEnvelope: Row }).eyeEnvelope, scope: 'TENANT', domain_id: null };
  D2 = ((await tenancy.createDomain({ eyeEnvelope: envT, eyePrincipal: tenantAdmin } as never, T(), { payload: { name: `NORDWERK Exchange Mirror (SYNTHETIC) ${uuidv7().slice(-6)}` } })) as { domain: { id: string } }).domain.id;
  steward2 = await h.humanWithSession(['retention_steward'], 'b17-mirror-steward', 'DOMAIN', { domainId: D2 });
  domainAdmin2 = await h.humanWithSession(['domain_admin'], 'b17-mirror-admin', 'DOMAIN', { domainId: D2 });
  registrar2 = await h.humanWithSession(['domain_analyst'], 'b17-mirror-registrar', 'DOMAIN', { domainId: D2 });
  manager2 = await h.humanWithSession(['collection_manager'], 'b17-mirror-manager', 'DOMAIN', { domainId: D2 });
  builder2 = await h.humanWithSession(['twin_owner', 'strategy_owner', 'forecast_owner', 'decision_owner'], 'b17-builder', 'DOMAIN', { domainId: D2 });
  intake = await intakeSourceIn(D2);
  await declareKey(tenantAdmin, KEY_REF);
  // The stations: the origin delivers to one directory (S5); the mirror reads the SAME directory (the disconnected import path, and S4's foreign path under it).
  await declareDestinationIn(D(), domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'NORDWERK GmbH — harness transfer station (B17)', purpose: 'the disconnected exchange (harness)' });
  await declareDestinationIn(D2, domainAdmin2, { destinationKey: STATION_KEY_D2, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'the mirror domain reads the station (harness)', purpose: 'the disconnected import path' });
  // The partners of the mirror: the origin (KEY1, the tenant's own key) and a FOREIGN party (KEY2) — two parties, so a notice signed by the one is refused for the other (S4 b).
  originPartnerId = String((await declarePartnerFor(KEY1, ORIGIN_PARTNER, ORIGIN_PARTY)).partner['partner_id']);
  foreignPartnerId = String((await declarePartnerFor(KEY2, FOREIGN_PARTNER, FOREIGN_PARTY)).partner['partner_id']);
  // THE SUBSCRIPTIONS in the mirror: the seven kinds, registered by the tenant administrator (the B6 idiom), the domain's worker serving from registration.
  for (const kind of CONSUMER_KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the mirror's queue is served from registration`).toBe(true);
  }
}, 300_000);

afterAll(async () => {
  delete process.env[KEY_REF];
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D2); await scheduler.obliterateSubscriptionsForTests(T(), D2); } catch { /* the queue may not exist */ }
  await h?.close();
  await su?.destroy();
  for (const dir of [VAULT_DIR, STATION_DIR, SCRATCH_DIR]) rmSync(dir, { recursive: true, force: true });
}, 120_000);

describe('S1 · import.admitted (0077 D1, D20; L1-I03; AU-MEM-0030; ES-19-001)', () => {
  it('S1 · records A and B (C@1 on B, the edge X, the entities and the identifier) admitted into the mirror → ONE GraphChanged/import.admitted from the graph write with the pinned payload, TWO ObservationRecorded rows ahead of it in the partition, the six deliveries applied (the selectors empty, retrieval verified, mappings nothing), the imported claim not reviewable here and the native one still challengeable; (6) the truncation control: 300 entities and 150 edges → identities cut at IMPORT_EVENT_LIST_MAX, truncated said, the item map whole', async () => {
    ({ evd: A, m: mA } = await uploadOne('b17-a')); ({ evd: B, m: mB } = await uploadOne('b17-b'));
    C = (await seedClaim({ type: 'REL', evidence: B, classification: 'internal', payload: REL_PAYLOAD })).claimId;
    edgeX = await assertEdge({ predicate: 'ships_through', claimId: C, claimVersion: 1, evidence: B });
    I1 = uuidv7();
    await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
      values (${I1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', ${LEI}, ${C}::uuid, ${B.id}::uuid, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    E1x = await exported([mA.manifest_id, mB.manifest_id]);
    const tarFile = join(SCRATCH_DIR, `${E1x.id}.tar`);
    expect(await streamExport(steward, E1x.id, tarFile)).toMatchObject({ status: 200, digest: E1x.archiveDigest });
    const open = await openInline(steward2, readFileSync(tarFile), { delivery_id: uuidv7(), attempt: 1, expires_at: new Date(Date.now() + 86_400_000).toISOString(), package_digest: E1x.packageDigest, archive_digest: E1x.archiveDigest });
    expect(open.verified, failedChecks(open.checks).join(' | ')).toBe(true);
    const importId = String(open.import['import_id']);
    await approveImport(authority, importId, E1x.packageDigest);
    // The admission itself (not through `imported`: the mark must sit between the approval and the admit, so the outbox rows of the admission alone are read).
    const t0 = await mark();
    const admit = await admitImport(steward2, importId);
    expect(admit.import['state']).toBe('admitted');
    const detail = await getImport(steward2, importId);
    const itemOf = (kind: string, ref: string): Row => { const i = detail.items.find((x) => x['kind'] === kind && x['origin_ref'] === ref); expect(i, `${kind} ${ref}`).toBeDefined(); return i!; };
    const adm = (kind: string, ref: string): Row => itemOf(kind, ref)['admitted'] as Row;
    const map = mapOfItems(detail.items);
    s1 = { importId, admitted: admit, detail, map, itemOf, adm };
    for (const id of [A.id, B.id, C, E1, E2, edgeX]) { expect(map.get(id), `the mirror's id of ${id}`).toMatch(UUID); expect(map.get(id)).not.toBe(id); }
    expect(detail.items.every((i) => i['disposition'] === 'admitted')).toBe(true);
    // (1) Exactly ONE GraphChanged/import.admitted of this import, published, with the correlation of the ledger's import.admitted event.
    const rows = await publishedIn(D2, 'import.admitted', t0, importId);
    expect(rows).toHaveLength(1);
    const gc = rows[0]!; const p = payloadOf(gc);
    expect(gc.partition_key).toBe(`tenant:${T()}`);
    expect(gc.correlation_id).toBe((await importEvents(importId)).find((e) => e.event === 'import.admitted')!.correlation_id);
    // (2) The payload pinned: the created identities, the edge as recorded, the admitted claim and records, the import block, the cause, the six subscriptions.
    expect(p.schema).toBe('GraphChanged'); expect(p.schema_version).toBe('v1');
    expect(p.change).toMatchObject({ kind: 'import.admitted', graph_event_id: null, invalidation_id: null, correction_case_id: null });
    expect(p.identities).toHaveLength(2);
    expect(p.identities).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_id: map.get(E1), role: 'created', canonical_name: 'Bab el-Mandeb Strait', lifecycle_state: 'active', split_from: null }),
      expect.objectContaining({ entity_id: map.get(E2), role: 'created', canonical_name: 'NORDWERK Magnet GmbH', lifecycle_state: 'active', split_from: null }),
    ]));
    expect(p.relationships.edges).toHaveLength(1);
    expect(p.relationships.edges[0]).toMatchObject({ edge_id: map.get(edgeX), state: 'asserted', predicate: 'ships_through', subject_entity_id: map.get(E2), object_entity_id: map.get(E1), claim_object_id: map.get(C), valid_from: '2024-01-01T00:00:00.000Z', valid_to: null });
    expect(typeof p.relationships.edges[0]!['asserted_at']).toBe('string');
    expect(p.relationships.resolutions).toEqual([]); expect(p.relationships.dependencies).toEqual([]);
    expect(p.objects).toMatchObject({ walked: false, truncated: false, claims: [map.get(C)], assumptions: [], decisions: [], forecasts: [], scenarios: [], twins: [] });
    expect(sorted(p.objects.evidence)).toEqual(sorted([map.get(A.id), map.get(B.id)]));
    expect(p.import).toMatchObject({ import_id: importId, partner_key: ORIGIN_PARTNER, origin: { tenant_id: T(), domain_id: D(), action_id: E1x.id, package_digest: E1x.packageDigest }, counts: expect.objectContaining({ admitted: expect.any(Number) }) });
    expect(p.cause).toEqual({ action: 'retention.import.admit', actor: steward2.principalId, target_type: 'RIM', target_id: importId });
    expect(typeof p.temporal['known_at']).toBe('string');
    expect(sorted(p.subscriptions.map((s) => s.consumer_kind))).toEqual(['decisions', 'forecasts', 'memory-mappings', 'retrieval', 'scenarios', 'twins']);
    // (3) ObservationRecorded per admitted record (D20): the lifecycle's shape with acquisition_mode import, the intake contract's source and authority class (C10), the import's provenance; ahead of the graph change in the partition; published.
    const obs = await waitFor('the two ObservationRecorded rows published', () => outboxRowsIn(D2, 'ObservationRecorded', t0).then((xs) => xs.filter((x) => (x.payload['imported'] as Row | undefined)?.['import_id'] === importId)), (xs) => xs.length === 2 && xs.every((x) => x.status === 'published'));
    const authorityClass = await contractAuthorityClass(intake.sourceId, intake.version);
    for (const o of obs) {
      expect(o.payload).toMatchObject({ schema_version: 'v1', obs_object_id: null, run_id: null, revision: false, acquisition_mode: 'import', source_id: intake.sourceId, contract_version: intake.version, authority_class: authorityClass, evd_version: 1, imported: { import_id: importId, partner_key: ORIGIN_PARTNER, origin: { tenant_id: T(), domain_id: D(), action_id: E1x.id, package_digest: E1x.packageDigest } } });
      expect(o.partition_seq).toBeLessThan(gc.partition_seq);
    }
    expect(sorted(obs.map((o) => o.payload['evd_object_id']))).toEqual(sorted([map.get(A.id), map.get(B.id)]));
    expect(sorted(obs.map((o) => o.payload['content_digest']))).toEqual(sorted([A.bytesDigest, B.bytesDigest]));
    // (4) The six deliveries: nothing of the mirror rests on the new ids (the four selectors empty), retrieval verified on the imported rows, mappings nothing to propose; no relationships row.
    const by = await sixApplied(gc.id);
    for (const kind of ['twins', 'forecasts', 'scenarios', 'decisions']) expect(by[kind], kind).toMatchObject({ items: [], items_applied: [], attempts: 0 });
    expect(by['retrieval']).toMatchObject({ items: ['projections'] });
    expect(by['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect(by['memory-mappings']).toMatchObject({ items: [], items_applied: [] });
    const rc = await retrievalChecks(gc.id);
    expect(rc).toHaveLength(1);
    expect(rc[0]).toMatchObject({ mismatched: 0, touched: { change_kind: 'import.admitted' } });
    expect(rc[0]!.touched['entities']).toEqual(expect.arrayContaining([map.get(E1), map.get(E2)]));
    expect(await deliveryEvents(gc.id, 'retrieval')).toEqual(['received', 'applying', 'item.applied', 'applied']);
    // (5) FEATURE 3 (D15): the imported claim is not reviewed here — corrected at its origin and re-imported; the native claim at the origin is still challengeable.
    await refused(intelligence.requestReview(reqIn(domainAdmin2, D2, 'intelligence.review.request', 'REV', null, 'intelligence'), T(), D2, { payload: { claimObjectId: map.get(C)!, claimVersion: 1, reason: 'a challenge of an imported claim (harness)' } }),
      /challenge rejected: claim .* is imported .* corrected at its origin and re-imported/, 409);
    const native = await intelligence.requestReview(h.req(domainAdmin, 'intelligence.review.request', 'REV', null, 'intelligence'), T(), D(), { payload: { claimObjectId: C, claimVersion: 1, reason: 'a challenge of the native claim at its origin (harness)' } }) as { review: { state: string; reason: string } };
    expect(native.review).toMatchObject({ state: 'queued', reason: 'challenged' });
    // (6) THE TRUNCATION CONTROL (C11): one claim on record F, 150 edges between 300 fresh entities on it (SQL, the B6 idiom); exported and admitted → the identities cut, truncated said, every edge carried; six deliveries; no drift; the item map whole.
    const { evd: F, m: mF } = await uploadOne('b17-f');
    const C6 = (await seedClaim({ type: 'REL', evidence: F, classification: 'internal', payload: { ...REL_PAYLOAD, subject: 'NORDWERK corridor (many)' } })).claimId;
    const many: string[] = [];
    for (let i = 0; i < 300; i += 1) { const id = uuidv7(); many.push(id); await seedEntity(id, i % 2 === 0 ? 'organization' : 'place', `b17 many ${i}`); }
    for (let i = 0; i < 150; i += 1) await seedEdge(uuidv7(), many[2 * i]!, many[2 * i + 1]!, C6, F);
    const EF = await exported([mF.manifest_id]);
    expect(linksOfPkg(packageOf(EF.dir))['counts']).toEqual({ claims: 1, edges: 150, entities: 300, excluded: 0 });
    const t6 = await mark();
    const big = await imported(await openInline(steward2, tarOfDir(EF.dir)));
    expect(big.detail.items.filter((i) => i['kind'] === 'entity')).toHaveLength(300);
    expect(big.detail.items.filter((i) => i['kind'] === 'entity' && i['disposition'] === 'admitted')).toHaveLength(300);
    expect(big.detail.items.filter((i) => i['kind'] === 'edge' && i['disposition'] === 'admitted')).toHaveLength(150);
    const bigRows = await publishedIn(D2, 'import.admitted', t6, big.importId);
    expect(bigRows).toHaveLength(1);
    const bp = payloadOf(bigRows[0]!);
    expect(bp.identities).toHaveLength(IMPORT_EVENT_LIST_MAX);
    expect(bp.identities.every((i) => i['role'] === 'created')).toBe(true);
    expect(bp.relationships.edges).toHaveLength(150);
    expect(bp.objects).toMatchObject({ truncated: true, walked: false, claims: [big.map.get(C6)], evidence: [big.map.get(F.id)] });
    const bigBy = await sixApplied(bigRows[0]!.id);
    expect(bigBy['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect((await retrievalChecks(bigRows[0]!.id))[0]).toMatchObject({ mismatched: 0 });
    await noDrift();
    await settleIn(D2);
  }, 600_000);
});

describe('S2 · import.revoked (0077 D2–D8, D12, D19; ES-08-004, ES-29-005, DP-47-005)', () => {
  it('S2 · the mirror builds on the import (a twin bounded by the imported entity citing the imported record — C12 (a twin cites CLM claims; the seeded claim is a REL); an assumption, a decision, a forecast, a scenario, a package resting on it); the origin revokes E1 → the importer notified with a SIGNED notice and its copies destroyed by the same act: the edge retracted, the entities retired (the identifier kept), the claim and the records withdrawn with the lineage carried, the bytes gone, the custody, the import revoked, the receipt acknowledged on the origin ledger; ONE import.revoked with the walk; the six deliveries (the twin unverified, the forecast and scenario marked, the package invalidated, the identifier proposed, retrieval verified); the retry a no-op; the origin\'s second revoke refused', async () => {
    const { importId, map } = s1;
    const mapOf = (id: string): string => { const v = map.get(id); expect(v, `the mirror's id of ${id}`).toBeDefined(); return v!; };
    // (a) THE TWIN, through the twin routes: bounded by the imported E1, ONE estimated element citing the imported RECORD A (a twin's claim citation resolves CLM objects only — twin.service.ts:33-35 — and the seeded claim is a REL; the record is reached by the revocation's walk as tombstoned evidence), no world cut-off, admitted as incomplete (the supply-chain kind's required inputs are not this fixture's), verified.
    const declared = await twins.declare(reqIn(builder2, D2, 'twin.declare', 'TWN', null, 'twin'), T(), D2, { payload: { kind: 'supply-chain', title: 'NORDWERK — the imported corridor (mirror)', statement: 'the mirror\'s twin of the corridor, grounded on imported knowledge alone',
      boundary: [mapOf(E1)], owner: builder2.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (imported grounding)', limitations: ['calendar days', 'one estimated element'] } } }) as { twin: { twinId: string } };
    twinId = declared.twin.twinId;
    const opened = await twins.openVersion(reqIn(builder2, D2, 'twin.version', 'TWN', twinId, 'twin'), T(), D2, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: null } }) as { version: { version: number } };
    const v1 = opened.version.version;
    const grounded = await twins.ground(reqIn(builder2, D2, 'twin.ground', 'TWN', twinId, 'twin'), T(), D2, twinId, String(v1), { payload: { elements: [{ key: 'route.reroute_delay_days', kind: 'estimated', value: 11, unit: 'days', citations: [{ kind: 'evidence', id: mapOf(A.id), version: 1 }] }] } }) as { grounded: Array<{ key: string; health: string }> };
    expect(grounded.grounded).toEqual([expect.objectContaining({ key: 'route.reroute_delay_days', health: 'complete' })]);
    const admittedTwin = await twins.admit(reqIn(builder2, D2, 'twin.version.admit', 'TWN', twinId, 'twin'), T(), D2, twinId, String(v1), { payload: { allowIncomplete: true } }) as { admitted: { completeness: string } };
    expect(admittedTwin.admitted.completeness).toBe('incomplete');
    expect(await twinVerification(twinId, v1)).toBe('verified');
    // (b) THE REST OF THE MIRROR'S WORLD by SQL (the B6 idiom): an assumption resting on the imported claim, a decision on it, a forecast for the imported entity on it, a scenario on the forecast, a decision package on the decision.
    const ASU = uuidv7(); const DEC = uuidv7(); const F1 = uuidv7(); const S1 = uuidv7(); const P1 = uuidv7();
    // B20 (0080): the mirror's seven subscribers run — the symmetric retrieval check calls a planted row with no log event POISONED and
    // withdraws the partition, so each strategy row carries its strategy.declared event (the ASU its assumption.verified beside it).
    for (const [id, type, title] of [[ASU, 'ASU', 'The imported corridor stays open'], [DEC, 'DEC', 'Keep the imported routing']] as const) {
      await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, ${type}, 1, ${title}, 'fixture strategy object of the mirror', 'active', ${type === 'ASU' ? 'verified' : 'not_applicable'}, ${builder2.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
      await sql`insert into graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, ${id}::uuid, 'strategy.declared', ${builder2.principalId}::uuid, jsonb_build_object('object_type', ${type}::text, 'title', ${title}::text, 'version', 1, 'status', 'active'), ${uuidv7()}::uuid)`.execute(su);
      if (type === 'ASU') await sql`insert into graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, ${id}::uuid, 'assumption.verified', ${builder2.principalId}::uuid, jsonb_build_object('state', 'verified', 'reason', 'fixture'), ${uuidv7()}::uuid)`.execute(su);
    }
    await sql`insert into prediction.forecasts_current (forecast_id, scope, tenant_id, domain_id, series_key, subject_entity_id, horizon_code, horizon_days, origin_at, known_at, target_at, method, method_version, baseline_method, quantiles, drivers, assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, statement, state, issued_by, correlation_id)
      values (${F1}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, 'transit.days', ${mapOf(E1)}::uuid, '90d', 90, '2024-01-17', now(), '2024-04-16', 'seasonal-naive', '1.0.0', 'naive', '{"q10": 30, "q50": 34, "q90": 41}'::jsonb, '["transit days"]'::jsonb, ${sql`ARRAY[${ASU}::uuid]`}, ${JSON.stringify([`EVD:${mapOf(A.id)}@1`])}::jsonb, 'weekly', 'unvalidated', 'fixture forecast of the mirror: not validated', 'replay demonstration', 'fixture forecast statement', 'issued', ${builder2.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into prediction.scenarios_current (scenario_id, scope, tenant_id, domain_id, title, statement, forecast_id, subject_entity_id, owner_principal_id, review_cadence, state, correlation_id)
      values (${S1}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, 'Transit disruption (mirror)', 'fixture scenario tree on the mirror''s forecast', ${F1}::uuid, ${mapOf(E1)}::uuid, ${builder2.principalId}::uuid, 'weekly', 'active', ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, declared_by, correlation_id)
      values (${P1}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, ${DEC}::uuid, 'Routing decision (mirror)', 'fixture decision package of the mirror', ${builder2.principalId}::uuid, 'draft', ${builder2.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    for (const [dep, type, kind, on] of [[ASU, 'ASU', 'claim', mapOf(C)], [DEC, 'DEC', 'strategy', ASU], [F1, 'FCT', 'strategy', ASU], [S1, 'SCN', 'forecast', F1]] as const) {
      await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D2}::uuid, ${dep}::uuid, ${type}, ${kind}, ${on}::uuid, 'fixture dependency: rests on it directly', 'active', ${builder2.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    }
    const identifierBefore = (await identifiersIn(D2)).find((i) => i.entity_id === mapOf(E2) && i.system_key === 'lei');
    expect(identifierBefore).toBeDefined();
    // The export read BEFORE the revocation names its importer (the read route refuses a revoked package by its own rule: the notices are read by their list after).
    const before = await getExport(steward, E1x.id);
    expect(before.importers).toEqual([expect.objectContaining({ import_id: importId, domain_id: D2, state: 'admitted', partner_key: ORIGIN_PARTNER })]);
    // (c) THE ORIGIN REVOKES E1 (the tenant's retention authority: her authority reaches the mirror, D7).
    const t1 = await mark();
    const rv = await revokeExport(authority, E1x.id, 'the origin revokes E1 after its admission into the mirror (harness)');
    expect(rv.revocation['recipients']).toEqual([]);
    expect(rv.notices).toEqual([]);
    expect(rv.importers).toHaveLength(1);
    const im = rv.importers[0]!;
    expect(im).toMatchObject({ tenant_id: T(), domain_id: D2, import_id: importId });
    expect(im.notice).toMatchObject({ state: 'notified', attempt: 1, importer: expect.objectContaining({ partner_key: ORIGIN_PARTNER, import_id: importId }) });
    expect(im.notice.notice).toMatchObject({ notice: 'revocation', action_id: E1x.id, recipient: `import:${T()}/${D2}/${importId}`, delivery: { import_id: importId, state: 'admitted', held: 'confirmed' }, package_digest: E1x.packageDigest, signature: { scheme: NOTICE_SIGNATURE_SCHEME, key_id: keyIdOfPair(KEY1), algorithm: 'Ed25519' } });
    expect(verifyNotice(im.notice.notice, KEY1_PEM)).toMatchObject({ ok: true, keyId: keyIdOfPair(KEY1) });
    const noticeId = String(im.notice['notice_id']);
    expect(im.revocation).toMatchObject({ state: 'revoked', attempt: 1, destroyed: { records: 2, claims: 1, entities: 2, edges: 1 }, left: 2, refused: [], receipt: expect.objectContaining({ copies_destroyed: true, package_digest: E1x.packageDigest, recipient: `import:${T()}/${D2}/${importId}` }), answered: expect.objectContaining({ answered: true, state: 'acknowledged', attempt: 1 }) });
    // THE MIRROR'S LEDGERS: the edge retracted with the reason naming the revocation; the entities retired with their identifiers kept; the claim and the records withdrawn by a version each; the lineage carried; the tombstones, the custody, the bytes gone; the import row and its events; the items' outcomes.
    const edge = (await edgeRow(mapOf(edgeX)))!;
    expect(edge).toMatchObject({ state: 'retracted', retracted_by: authority.principalId });
    expect(edge.retraction_reason).toMatch(/the origin revoked the package this edge was imported from/);
    const xe = await edgeEvents(mapOf(edgeX));
    expect(xe.map((e) => e.event)).toEqual(['edge.asserted', 'edge.retracted']);
    expect(xe.at(-1)!.details).toMatchObject({ imported: true, import_id: importId, revoked: expect.objectContaining({ action_id: E1x.id, notice_id: noticeId }) });
    for (const e of [E1, E2]) {
      expect((await entityRow(mapOf(e)))!.lifecycle_state).toBe('retired');
      const ev = await entityEvents(mapOf(e));
      expect(ev.at(-1)).toMatchObject({ event: 'entity.retired', details: expect.objectContaining({ imported: true, import_id: importId, identifiers_kept: true }) });
    }
    expect((await identifiersIn(D2)).find((i) => i.entity_id === mapOf(E2) && i.system_key === 'lei')).toEqual(identifierBefore);
    const cRows = await objectRows(mapOf(C));
    expect(cRows.map((r) => r.object_version)).toEqual([1, 2]);
    expect(cRows[1]).toMatchObject({ lifecycle_state: 'withdrawn', truth_state: 'withdrawn', correction_of: `${mapOf(C)}@1`, supersedes: `${mapOf(C)}@1`, method_ref: 'retention.import.revoke@1.0.0', accountable_owner: `principal:${authority.principalId}`, domain_id: D2 });
    expect(cRows[1]!.withdrawal_reason).toMatch(new RegExp(`revoked the package .*action ${E1x.id}`));
    expect((cRows[1]!.payload['imported_from'] as Row)['import_id']).toBe(importId);
    const cl = await lineageRows(mapOf(C));
    expect(cl.map((l) => l.claim_version)).toEqual([1, 2]);
    expect([cl[0]!.run_id, cl[0]!.method_id, cl[0]!.evidence_object_id, cl[0]!.evidence_digest]).toEqual([cl[1]!.run_id, cl[1]!.method_id, cl[1]!.evidence_object_id, cl[1]!.evidence_digest]);
    for (const evd of [A, B]) {
      const rows = await objectRows(mapOf(evd.id));
      expect(rows.map((r) => [r.object_version, r.lifecycle_state])).toEqual([[1, 'admitted'], [2, 'withdrawn']]); // an evidence record's lifecycle is `admitted` (the upload's), a claim's `active`
      const a = s1.adm('record', `${evd.id}@1`);
      const manifestId = String(a['manifest_id']);
      expect(await tombstonesOf(manifestId)).toHaveLength(1);
      const tomb = await custody(manifestId, 'custody.tombstoned');
      expect(tomb).toHaveLength(1); expect(tomb[0]!.details).toMatchObject({ import_id: importId });
      expect(await blobExists('evidence', D2, String(a['locator']))).toBe(false);
    }
    const row = (await importRow(importId))!;
    expect(row).toMatchObject({ state: 'revoked', revoked_by: authority.principalId, revocation_attempts: 1 });
    expect(row.revoked_at).not.toBeNull();
    expect(row.revocation).toMatchObject({ kind: 'origin', action_id: E1x.id, notice_id: noticeId, counts: expect.objectContaining({ retracted: 1, retired: 2, withdrawn: 1, tombstoned: 2, left: 2 }) });
    const tail = await eventsAfterFinalized(importId);
    expect(tail).toEqual(['import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.batch_revoked', 'import.batch_revoked', 'import.revoked', 'import.copies_destroyed']);
    const items = await importItems(importId);
    const outcomeOf = (kind: string, ref: string) => String(items.find((i) => i.kind === kind && i.origin_ref === ref)!.revocation!['outcome']);
    expect(outcomeOf('edge', `edge:${edgeX}`)).toBe('retracted'); expect(outcomeOf('entity', `entity:${E1}`)).toBe('retired'); expect(outcomeOf('entity', `entity:${E2}`)).toBe('retired');
    expect(outcomeOf('claim', `${C}@1`)).toBe('withdrawn'); expect(outcomeOf('record', `${A.id}@1`)).toBe('tombstoned'); expect(outcomeOf('record', `${B.id}@1`)).toBe('tombstoned');
    expect(outcomeOf('identifier_system', 'system:lei')).toBe('left'); expect(outcomeOf('identifier', `identifier:lei:${LEI}`)).toBe('left');
    expect(items.every((i) => i.revoked_at !== null)).toBe(true);
    // THE ORIGIN'S LEDGER: the importer notice acknowledged in place, the events, the custody rows of the notice, the notices read.
    const notices = await noticeRows(E1x.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ notice_id: noticeId, importer: { tenant_id: T(), domain_id: D2, import_id: importId }, destination_id: null, delivery_id: null, state: 'acknowledged', attempt: 1, receipt: expect.objectContaining({ copies_destroyed: true, package_digest: E1x.packageDigest }) });
    const ae = await actionEvents(E1x.id);
    expect(ae.find((e) => e.event === 'export.revocation_notified')?.details).toMatchObject({ kind: 'importer', notice_id: noticeId, importer: { import_id: importId } });
    expect(ae.find((e) => e.event === 'export.revocation_acknowledged')?.details).toMatchObject({ notice_id: noticeId, answered_by: expect.stringMatching(/importing domain/) });
    const cn = await custody(mA.manifest_id, 'custody.revocation_notified');
    expect(cn.length).toBeGreaterThanOrEqual(1);
    expect(cn.at(-1)!.details).toMatchObject({ action_id: E1x.id, notice_id: noticeId, importer: { import_id: importId } });
    await refused(getExport(steward, E1x.id), /was revoked at/, 409);
    const listed = (await listNotices(steward, E1x.id)).notices;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ notice_id: noticeId, kind: 'importer', recipient: `import:${T()}/${D2}/${importId}`, state: 'acknowledged' });
    // THE EVENT: exactly one GraphChanged/import.revoked of this import, with the retired identities, the retracted edge, the dependencies, the walk, the import block with the notice.
    const rows = await publishedIn(D2, 'import.revoked', t1, importId);
    expect(rows).toHaveLength(1);
    const gr = rows[0]!; const p = payloadOf(gr);
    expect(p.identities).toEqual(expect.arrayContaining([expect.objectContaining({ entity_id: mapOf(E1), role: 'retired', lifecycle_state: 'retired' }), expect.objectContaining({ entity_id: mapOf(E2), role: 'retired', lifecycle_state: 'retired' })]));
    expect(p.relationships.edges[0]).toMatchObject({ edge_id: mapOf(edgeX), state: 'retracted', predicate: 'ships_through', subject_entity_id: mapOf(E2), object_entity_id: mapOf(E1), claim_object_id: mapOf(C) });
    expect(p.relationships.edges[0]!['retracted_at']).not.toBeNull();
    expect(p.relationships.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ dependent_object_id: ASU, depends_on_kind: 'claim', depends_on_id: mapOf(C) })]));
    expect(p.objects).toMatchObject({ walked: true, truncated: false, claims: [mapOf(C)], assumptions: [ASU], decisions: [DEC], forecasts: [F1], scenarios: [S1] });
    expect(sorted(p.objects.evidence)).toEqual(sorted([mapOf(A.id), mapOf(B.id)]));
    expect(p.import).toMatchObject({ import_id: importId, partner_key: ORIGIN_PARTNER, origin: { action_id: E1x.id }, notice: { notice_id: noticeId, source: 'origin' } });
    expect(p.cause).toEqual({ action: 'retention.import.revoke', actor: authority.principalId, target_type: 'RIM', target_id: importId });
    expect(sorted(p.subscriptions.map((s) => s.consumer_kind))).toEqual(['decisions', 'forecasts', 'memory-mappings', 'retrieval', 'scenarios', 'twins']);
    // THE DELIVERIES: the twin unverified, the forecast and the scenario marked, the package's input invalidated, the identifier of the retired entity PROPOSED (no edge item), retrieval verified.
    const by = await sixApplied(gr.id);
    expect(by['twins']!.items).toEqual([`${twinId}@${v1}`]);
    expect(by['twins']!.items_applied.map((x) => x.effect)).toEqual(['version.unverified']);
    expect(await twinVerification(twinId, v1)).toBe('unverified');
    expect((await twinUnverifiedEvents(twinId, v1))[0]!.details).toMatchObject({ outbox_event_id: gr.id, subscription_id: subs.twins!.subscriptionId, automatic: true });
    expect(by['forecasts']!.items).toEqual([F1]);
    expect(await forecastRow(F1)).toMatchObject({ attention_state: 'assumption_unverified', state: 'issued' });
    expect((await forecastRow(F1))!.attention_reason).toMatch(/GraphChanged\/import\.revoked/);
    expect(by['scenarios']!.items).toEqual([S1]);
    expect(await scenarioRow(S1)).toEqual({ attention_state: 'input_unverified', state: 'active' });
    expect(by['decisions']!.items).toEqual([P1]);
    expect((await packageEvents(P1)).map((e) => e.event)).toEqual(['input.invalidated']);
    expect(by['memory-mappings']!.items).toEqual([`identifier:${identifierBefore!.identifier_id}`]);
    const props = await mappingProposals(gr.id);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ subject_kind: 'identifier', subject_id: identifierBefore!.identifier_id, from_entity_id: mapOf(E2), to_entity_id: null, state: 'proposed' });
    expect(props[0]!.basis).toMatch(/retired under the origin's revocation/);
    expect(by['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect((await retrievalChecks(gr.id))[0]).toMatchObject({ mismatched: 0, touched: { change_kind: 'import.revoked' } });
    const aud = await applyActionsSince(t1);
    expect(new Set(aud.map((a) => a.action))).toEqual(new Set(['twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply', 'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply']));
    await noDrift();
    // THE RETRY (C5): a revoked import answers `retried` — no new batch, at most one further receipt, the notice count unchanged (none was pending).
    const eventsBefore = await importEvents(importId);
    const retried = await revokeImport(steward2, importId, { kind: 'origin' });
    expect(retried.revocation.state).toBe('retried');
    const eventsAfter = await importEvents(importId);
    expect(eventsAfter.filter((e) => e.event === 'import.batch_revoked')).toHaveLength(eventsBefore.filter((e) => e.event === 'import.batch_revoked').length);
    expect(eventsAfter.filter((e) => e.event === 'import.copies_destroyed').length).toBeLessThanOrEqual(eventsBefore.filter((e) => e.event === 'import.copies_destroyed').length + 1);
    expect(await noticeRows(E1x.id)).toHaveLength(1);
    // The origin's second revoke: the port's own rule (the package directory is gone).
    await refused(revokeExport(authority, E1x.id, 'revoked twice (harness)'), /was revoked at/, 409);
    await settleIn(D2);
  }, 300_000);
});

describe('S3 · the legal hold, the pending path, the fault, a destroyed copy never reused, a copy another import holds (0077 D4, D6, D7; C2, C4, C9; AU-MEM-0060)', () => {
  it('S3 · (a) a hold on the mirror\'s copy of C → the origin\'s revoke answers held (D destroyed, C refused, the receipt false, the notice mismatched, the import revoking); (b) the steward\'s retry held again (a second notice attempt, no second event); (c) the hold lifted → revoked, acknowledged at attempt 3, a second import.revoked for C alone; (d) the pending path (a domain administrator of the origin) then the fault after the graph write and the second attempt\'s ONE event; (e) C2 and C9 — a revoked copy never reused, E2 reused retired, the shared record left held_by the other import and destroyed by its revocation', async () => {
    const mapOf = (m: Map<string, string>, id: string): string => { const v = m.get(id); expect(v, `the mirror's id of ${id}`).toBeDefined(); return v!; };
    // The fixture: records C and D; a fresh entity E3; C2@1 on D with an edge Y from E3 to E2 (the entity with the identifier — retired in the mirror since S2).
    const { evd: Cr, m: mC } = await uploadOne('b17-c'); const { evd: Dr, m: mD } = await uploadOne('b17-d');
    const E3 = uuidv7(); await seedEntity(E3, 'organization', 'NORDWERK Antriebstechnik GmbH');
    const C2 = (await seedClaim({ type: 'REL', evidence: Dr, classification: 'internal', payload: { ...REL_PAYLOAD, subject: 'NORDWERK Antriebstechnik GmbH', predicate: 'procures_from', object_value: 'NORDWERK Magnet GmbH' } })).claimId;
    const edgeY = await assertEdge({ predicate: 'procures_from', claimId: C2, claimVersion: 1, evidence: Dr, subject: E3, object: E2 });
    const E3x = await exported([mC.manifest_id, mD.manifest_id]);
    const t3 = await mark();
    const i3 = await imported(await openInline(steward2, tarOfDir(E3x.dir)));
    // N5 / C2: E3 minted anew; E2 REUSED by its authoritative identifier — the retired entity of S2, as it is; the admission's event says so (reached, retired).
    expect(i3.itemOf('entity', `entity:${E3}`)['disposition']).toBe('admitted');
    expect(i3.itemOf('entity', `entity:${E2}`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ entity_id: s1.map.get(E2) }) });
    expect((await entityRow(mapOf(i3.map, E2)))!.lifecycle_state).toBe('retired');
    const adm3 = payloadOf((await publishedIn(D2, 'import.admitted', t3, i3.importId))[0]!);
    expect(adm3.identities).toEqual(expect.arrayContaining([expect.objectContaining({ entity_id: mapOf(i3.map, E3), role: 'created', lifecycle_state: 'active' }), expect.objectContaining({ entity_id: mapOf(i3.map, E2), role: 'reached', lifecycle_state: 'retired' })]));
    expect(adm3.import).toMatchObject({ counts: expect.objectContaining({ reused: expect.any(Number) }) });
    await sixApplied((await publishedIn(D2, 'import.admitted', t3, i3.importId))[0]!.id);
    const cCopy = i3.adm('record', `${Cr.id}@1`); const dCopy = i3.adm('record', `${Dr.id}@1`);
    const evdC2 = String(cCopy['object_id']); const evdD2 = String(dCopy['object_id']);
    const hold = await observation.placeLegalHold(reqIn(domainAdmin2, D2, 'observation.legal_hold.place', 'LGH', evdC2, 'observation'), T(), D2, evdC2, { payload: { reason: 'litigation hold on the imported record (harness)' } }) as { hold: { holdId: string; manifestId: string } };
    const holdId = hold.hold.holdId;
    // (a) THE ORIGIN'S REVOKE with the hold standing: held — D destroyed, C refused with the hold, the receipt says copies_destroyed false, the origin's ledger records the answer MISMATCHED; the import stays revoking.
    const ta = await mark();
    const rv = await revokeExport(authority, E3x.id, 'the origin revokes E3x while the mirror holds one of its records under a legal hold (harness)');
    expect(rv.importers).toHaveLength(1);
    const ra = rv.importers[0]!.revocation;
    expect(ra).toMatchObject({ state: 'held', attempt: 1, destroyed: expect.objectContaining({ records: 1, claims: 1, edges: 1 }), receipt: expect.objectContaining({ copies_destroyed: false }), answered: expect.objectContaining({ answered: true, state: 'mismatched', attempt: 1 }) });
    expect(ra.refused).toHaveLength(1);
    const r0 = ra.refused![0]!;
    expect(r0['origin_ref'] ?? r0['ref']).toBe(`${Cr.id}@1`);
    expect(r0).toMatchObject({ hold_id: holdId, manifest_id: String(cCopy['manifest_id']), reason: expect.stringMatching(/legal hold/) });
    const rowA = (await importRow(i3.importId))!;
    expect(rowA).toMatchObject({ state: 'revoking', revocation_attempts: 1, revoked_at: null, revocation: null });
    expect((await objectRows(evdC2)).map((r) => r.lifecycle_state)).toEqual(['admitted']);
    expect(await tombstonesOf(String(cCopy['manifest_id']))).toEqual([]);
    expect(await blobExists('evidence', D2, String(cCopy['locator']))).toBe(true);
    expect((await objectRows(evdD2)).map((r) => r.lifecycle_state)).toEqual(['admitted', 'withdrawn']);
    expect(await tombstonesOf(String(dCopy['manifest_id']))).toHaveLength(1);
    expect(await blobExists('evidence', D2, String(dCopy['locator']))).toBe(false);
    expect((await objectRows(mapOf(i3.map, C2))).map((r) => r.lifecycle_state)).toEqual(['active', 'withdrawn']);
    expect((await edgeRow(mapOf(i3.map, edgeY)))!.state).toBe('retracted');
    expect((await eventsAfterFinalized(i3.importId)).slice(-3)).toEqual(['import.batch_revoked', 'import.revocation_held', 'import.copies_refused']);
    const itemsA = await importItems(i3.importId);
    expect(itemsA.find((i) => i.kind === 'record' && i.origin_ref === `${Cr.id}@1`)!.revocation).toMatchObject({ outcome: 'refused', hold_id: holdId });
    const na = await importerNotices(E3x.id, i3.importId);
    expect(na).toHaveLength(1);
    expect(na[0]).toMatchObject({ state: 'mismatched', attempt: 1 });
    expect((na[0]!.receipt!['refused'] as Row[])[0]).toMatchObject({ hold_id: holdId });
    const heldRows = await publishedIn(D2, 'import.revoked', ta, i3.importId);
    expect(heldRows).toHaveLength(1);
    const hp = payloadOf(heldRows[0]!);
    expect(hp.objects.evidence).toEqual([evdD2]); expect(hp.objects.claims).toEqual([mapOf(i3.map, C2)]);
    expect(hp.relationships.edges[0]).toMatchObject({ edge_id: mapOf(i3.map, edgeY), state: 'retracted' });
    expect(hp.import).toMatchObject({ notice: { notice_id: na[0]!.notice_id, source: 'origin' } });
    await sixApplied(heldRows[0]!.id);
    // (b) THE STEWARD'S RETRY while the hold stands: held again, attempt 2, the same refusal, a SECOND notice attempt mismatched on the origin ledger (recorded by the importing domain's answer); no second GraphChanged (C4: nothing was destroyed).
    const tb = await mark();
    const rb = await revokeImport(steward2, i3.importId, { kind: 'origin' });
    expect(rb.revocation).toMatchObject({ state: 'held', attempt: 2, destroyed: expect.objectContaining({ records: 0 }), answered: expect.objectContaining({ answered: true, state: 'mismatched', attempt: 2 }) });
    expect(rb.revocation.refused).toHaveLength(1);
    expect((await importRow(i3.importId))!).toMatchObject({ state: 'revoking', revocation_attempts: 2 });
    const nb = await importerNotices(E3x.id, i3.importId);
    expect(nb.map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'mismatched']]);
    expect(nb[1]!.notice).toMatchObject({ answered_by_importer: true });
    await new Promise((r) => setTimeout(r, 2_500));
    expect((await outboxRowsIn(D2, 'GraphChanged', tb)).filter((r) => (r.payload['cause'] as Row)['target_id'] === i3.importId)).toEqual([]);
    // (c) THE HOLD LIFTED → the steward completes it: revoked, C withdrawn, tombstoned and gone, the receipt true, acknowledged at attempt 3; three notice rows; a second import.revoked for C alone.
    await observation.liftLegalHold(reqIn(domainAdmin2, D2, 'observation.legal_hold.lift', 'LGH', holdId, 'observation'), T(), D2, holdId, { payload: { reason: 'the litigation concluded (harness)' } });
    const tc = await mark();
    const rc = await revokeImport(steward2, i3.importId, { kind: 'origin' });
    expect(rc.revocation).toMatchObject({ state: 'revoked', attempt: 3, destroyed: expect.objectContaining({ records: 1 }), refused: [], receipt: expect.objectContaining({ copies_destroyed: true }), answered: expect.objectContaining({ answered: true, state: 'acknowledged', attempt: 3 }) });
    expect((await importRow(i3.importId))!).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation_attempts: 3 });
    expect((await objectRows(evdC2)).map((r) => r.lifecycle_state)).toEqual(['admitted', 'withdrawn']);
    expect(await tombstonesOf(String(cCopy['manifest_id']))).toHaveLength(1);
    expect(await blobExists('evidence', D2, String(cCopy['locator']))).toBe(false);
    expect((await importerNotices(E3x.id, i3.importId)).map((n) => [n.attempt, n.state])).toEqual([[1, 'mismatched'], [2, 'mismatched'], [3, 'acknowledged']]);
    const cRows = await publishedIn(D2, 'import.revoked', tc, i3.importId);
    expect(cRows).toHaveLength(1);
    const cp = payloadOf(cRows[0]!);
    expect(cp.objects.evidence).toEqual([evdC2]); expect(cp.relationships.edges).toEqual([]);
    expect(cp.identities.filter((i) => i['role'] === 'retired')).toEqual([]);
    await sixApplied(cRows[0]!.id);
    // (d) THE PENDING PATH: C and D exported again (their copies revoked: admitted AFRESH under new ids, C2) and revoked by a domain ADMINISTRATOR of the origin, who holds no authority in the mirror → pending with the reason, the notice notified, the mirror untouched.
    E3bx = await exported([mC.manifest_id, mD.manifest_id]);
    const td0 = await mark();
    const i3b = await imported(await openInline(steward2, tarOfDir(E3bx.dir)));
    expect(i3b.itemOf('record', `${Cr.id}@1`)['disposition']).toBe('admitted'); expect(mapOf(i3b.map, Cr.id)).not.toBe(evdC2);
    expect(i3b.itemOf('entity', `entity:${E3}`)['disposition']).toBe('admitted'); expect(mapOf(i3b.map, E3)).not.toBe(mapOf(i3.map, E3));
    expect(i3b.itemOf('entity', `entity:${E2}`)['disposition']).toBe('reused');
    await sixApplied((await publishedIn(D2, 'import.admitted', td0, i3b.importId))[0]!.id);
    const rd = await revokeExport(domainAdmin, E3bx.id, 'the origin\'s domain administrator revokes E3b (harness)');
    expect(rd.importers).toHaveLength(1);
    expect(rd.importers[0]!.revocation.state).toBe('pending');
    expect(rd.importers[0]!.revocation.reason).toMatch(/no authority in the importing domain/);
    expect(rd.importers[0]!.notice).toMatchObject({ state: 'notified', attempt: 1 });
    pendingNoticeId = String(rd.importers[0]!.notice['notice_id']);
    expect((await importRow(i3b.importId))!).toMatchObject({ state: 'admitted', revocation_attempts: 0 });
    expect((await importerNotices(E3bx.id, i3b.importId)).map((n) => [n.attempt, n.state])).toEqual([[1, 'notified']]);
    expect((await eventsAfterFinalized(i3b.importId))).toEqual(['import.revocation_notified']);
    // THE FAULT (C4): the steward's first attempt faults after the graph write committed — the import stays revoking with import.revocation_failed, the edge retracted and the entity retired, nothing withdrawn yet; the second attempt finishes and its ONE event names the graph items of attempt 1 AND the claim and records of attempt 2; the notice answered in place.
    const td = await mark();
    (imports as unknown as RevocationFaultHook).armRevocationFaultForTests('after_graph_write');
    await refused(revokeImport(steward2, i3b.importId, { kind: 'origin' }), /./);
    expect((await importRow(i3b.importId))!).toMatchObject({ state: 'revoking', revocation_attempts: 1 });
    expect((await importEvents(i3b.importId)).at(-1)!.event).toBe('import.revocation_failed');
    expect((await edgeRow(mapOf(i3b.map, edgeY)))!.state).toBe('retracted');
    expect((await entityRow(mapOf(i3b.map, E3)))!.lifecycle_state).toBe('retired');
    expect((await objectRows(mapOf(i3b.map, C2))).map((r) => r.lifecycle_state)).toEqual(['active']);
    expect((await outboxRowsIn(D2, 'GraphChanged', td)).filter((r) => (r.payload['cause'] as Row)['target_id'] === i3b.importId)).toEqual([]);
    const r2 = await revokeImport(steward2, i3b.importId, { kind: 'origin' });
    expect(r2.revocation).toMatchObject({ state: 'revoked', attempt: 2, destroyed: expect.objectContaining({ records: 2, claims: 1 }), refused: [], receipt: expect.objectContaining({ copies_destroyed: true }), answered: expect.objectContaining({ answered: true, state: 'acknowledged', attempt: 1, notice_id: pendingNoticeId }) });
    expect((await importRow(i3b.importId))!).toMatchObject({ state: 'revoked', revocation_attempts: 2 });
    expect((await importerNotices(E3bx.id, i3b.importId)).map((n) => [n.notice_id, n.attempt, n.state])).toEqual([[pendingNoticeId, 1, 'acknowledged']]);
    const dRows = await publishedIn(D2, 'import.revoked', td, i3b.importId);
    expect(dRows).toHaveLength(1);
    const dp = payloadOf(dRows[0]!);
    expect(dp.relationships.edges.map((e) => e['edge_id'])).toEqual([mapOf(i3b.map, edgeY)]);
    expect(dp.identities).toEqual(expect.arrayContaining([expect.objectContaining({ entity_id: mapOf(i3b.map, E3), role: 'retired' })]));
    expect(dp.objects.claims).toEqual([mapOf(i3b.map, C2)]);
    expect(sorted(dp.objects.evidence)).toEqual(sorted([mapOf(i3b.map, Cr.id), mapOf(i3b.map, Dr.id)]));
    await sixApplied(dRows[0]!.id);
    // (e) C2 and C9: S1's records re-exported (P2) after their revocation → A admitted under a NEW id (never the destroyed copy), E2 reused retired; a third package (P3) of B alone REUSES P2's record item; P2's revocation LEAVES the shared record (held_by P3), the receipt copies_destroyed false, the notice mismatched, the state revoked all the same; P3's revocation destroys it.
    const P2 = await exported([mA.manifest_id, mB.manifest_id]);
    const te = await mark();
    const p2 = await imported(await openInline(steward2, tarOfDir(P2.dir)));
    expect(p2.itemOf('record', `${A.id}@1`)['disposition']).toBe('admitted'); expect(mapOf(p2.map, A.id)).not.toBe(mapOf(s1.map, A.id));
    expect(p2.itemOf('record', `${B.id}@1`)['disposition']).toBe('admitted'); expect(p2.itemOf('claim', `${C}@1`)['disposition']).toBe('admitted');
    expect(p2.itemOf('entity', `entity:${E1}`)['disposition']).toBe('admitted'); expect(mapOf(p2.map, E1)).not.toBe(mapOf(s1.map, E1));
    expect(p2.itemOf('entity', `entity:${E2}`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ entity_id: mapOf(s1.map, E2) }) });
    const p2Event = payloadOf((await publishedIn(D2, 'import.admitted', te, p2.importId))[0]!);
    expect(p2Event.identities).toEqual(expect.arrayContaining([expect.objectContaining({ entity_id: mapOf(p2.map, E1), role: 'created' }), expect.objectContaining({ entity_id: mapOf(s1.map, E2), role: 'reached', lifecycle_state: 'retired' })]));
    await sixApplied((await publishedIn(D2, 'import.admitted', te, p2.importId))[0]!.id);
    const P3 = await exported([mB.manifest_id]);
    const tf = await mark();
    const p3 = await imported(await openInline(steward2, tarOfDir(P3.dir)));
    const p3b = p3.itemOf('record', `${B.id}@1`);
    expect(p3b).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: mapOf(p2.map, B.id) }) });
    expect(String(((p3b['planned'] as Row)['reuse'] as Row)['item_id'])).toBe(String(p2.itemOf('record', `${B.id}@1`)['item_id']));
    const p3Event = payloadOf((await publishedIn(D2, 'import.admitted', tf, p3.importId))[0]!);
    expect(p3Event.objects).toMatchObject({ claims: [], evidence: [] });
    expect(p3Event.import).toMatchObject({ counts: expect.objectContaining({ reused: expect.any(Number) }) });
    await sixApplied((await publishedIn(D2, 'import.admitted', tf, p3.importId))[0]!.id);
    const tg = await mark();
    const rp2 = await revokeExport(authority, P2.id, 'the origin revokes P2 while P3 still holds one of its records (harness)');
    const rr2 = rp2.importers[0]!.revocation;
    expect(rr2).toMatchObject({ state: 'revoked', destroyed: expect.objectContaining({ records: 1 }), receipt: expect.objectContaining({ copies_destroyed: false, held_by: [expect.objectContaining({ import_id: p3.importId })], statement: expect.stringMatching(/remain under import/) }), answered: expect.objectContaining({ answered: true, state: 'mismatched' }) });
    expect((await importRow(p2.importId))!.state).toBe('revoked');
    const p2b = (await importItems(p2.importId)).find((i) => i.kind === 'record' && i.origin_ref === `${B.id}@1`)!;
    expect(p2b.revocation).toMatchObject({ outcome: 'left', held_by: [p3.importId] });
    expect(String(p2b.revocation!['reason'])).toMatch(/held under import/);
    expect(await blobExists('evidence', D2, String(p2.adm('record', `${B.id}@1`)['locator']))).toBe(true);
    expect(await blobExists('evidence', D2, String(p2.adm('record', `${A.id}@1`)['locator']))).toBe(false);
    expect((await importerNotices(P2.id, p2.importId)).map((n) => n.state)).toEqual(['mismatched']);
    await sixApplied((await publishedIn(D2, 'import.revoked', tg, p2.importId))[0]!.id);
    const th = await mark();
    const rp3 = await revokeExport(authority, P3.id, 'the origin revokes P3: the last holder of the shared record (harness)');
    expect(rp3.importers[0]!.revocation).toMatchObject({ state: 'revoked', destroyed: expect.objectContaining({ records: 1 }), receipt: expect.objectContaining({ copies_destroyed: true }), answered: expect.objectContaining({ answered: true, state: 'acknowledged' }) });
    expect((await importItems(p3.importId)).find((i) => i.kind === 'record' && i.origin_ref === `${B.id}@1`)!.revocation).toMatchObject({ outcome: 'tombstoned' });
    expect(await blobExists('evidence', D2, String(p2.adm('record', `${B.id}@1`)['locator']))).toBe(false);
    expect((await objectRows(mapOf(p2.map, B.id))).map((r) => r.lifecycle_state)).toEqual(['admitted', 'withdrawn']);
    await sixApplied((await publishedIn(D2, 'import.revoked', th, p3.importId))[0]!.id);
    await noDrift();
    await settleIn(D2);
  }, 900_000);
});

describe('S4 · the foreign origin — the signed notice from the station (0077 D8, D9, D13, D14; C7, C8; ES-53-004)', () => {
  it('S4 · a package of a foreign tenant and domain, signed by the foreign partner, admitted from its foreign station path; revoke from the origin\'s record refused (not a domain of this tenant); an unsigned notice, another party\'s key, another package → refused with nothing destroyed; the foreign partner\'s signed notice → revoked from the station, the receipt written beside it, the origin not answered here, import.revoked with the station source; check 14\'s three wordings; (f) the same party\'s rotated key verifies with rotated_from', async () => {
    // The base: record G with a claim C4@1 and an edge Z between two fresh entities, exported by the origin — then rewritten to a FOREIGN tenant and domain and re-signed with KEY2 (C8).
    const { evd: G, m: mG } = await uploadOne('b17-g');
    const E5 = uuidv7(); const E6 = uuidv7(); await seedEntity(E5, 'place', 'Port of Rotterdam (foreign)'); await seedEntity(E6, 'organization', 'FOREIGN Logistics AG');
    const C4 = (await seedClaim({ type: 'REL', evidence: G, classification: 'internal', payload: { ...REL_PAYLOAD, subject: 'FOREIGN Logistics AG', object_value: 'Port of Rotterdam (foreign)' } })).claimId;
    const edgeZ = await assertEdge({ predicate: 'ships_through', claimId: C4, claimVersion: 1, evidence: G, subject: E6, object: E5 });
    const EG = await exported([mG.manifest_id]);
    const base = packageOf(EG.dir);
    const f = foreignOf(base, KEY2); placeForeign(f);
    const open = await openStation(steward2, f.actionId, STATION_KEY_D2, { tenantId: f.tenantId, domainId: f.domainId });
    expect(open.verified, failedChecks(open.checks).join(' | ')).toBe(true);
    expect(open.import).toMatchObject({ partner_id: foreignPartnerId, package_digest: f.digest });
    expect(open.import['origin']).toMatchObject({ tenant_id: f.tenantId, domain_id: f.domainId, action_id: f.actionId });
    expect(checkNamed(open.checks, /^revocation/)).toMatchObject({ ok: null, detail: expect.stringMatching(/not verifiable here/) });
    const fi = await imported(open);
    const importId = fi.importId;
    const zCopy = fi.map.get(edgeZ)!; const gCopy = fi.adm('record', `${G.id}@1`);
    // C8: the origin is not a domain of this tenant on this installation — its record cannot be the source; the station notice is.
    await refused(revokeImport(steward2, importId, { kind: 'origin' }), /is not a domain of this tenant on this installation; present the origin's signed notice/, 409);
    // (a) An UNSIGNED revocation.json at the foreign path: refused before anything is destroyed; the refusal recorded on the import.
    const notice = foreignNotice(f);
    writeJson(join(f.dir, 'revocation.json'), notice);
    await refused(revokeImport(steward2, importId, { kind: 'station', destinationKey: STATION_KEY_D2 }), /retention import rejected \(notice\): the notice carries no signature/, 409);
    expect((await importRow(importId))!).toMatchObject({ state: 'admitted', revocation_attempts: 0 });
    let last = (await importEvents(importId)).at(-1)!;
    expect(last.event).toBe('import.revocation_refused'); expect(String(last.details['reason'])).toMatch(/carries no signature/);
    expect((await edgeRow(zCopy))!.state).toBe('asserted');
    expect((await objectRows(String(gCopy['object_id']))).map((r) => r.lifecycle_state)).toEqual(['admitted']);
    // (b) The notice signed by KEY1 — the ORIGIN partner's key, another party's: refused (the same-party retry of C7 finds no partner of the foreign party holding it).
    writeJson(join(f.dir, 'revocation.json'), signedNotice(notice, KEY1));
    await refused(revokeImport(steward2, importId, { kind: 'station', destinationKey: STATION_KEY_D2 }), /retention import rejected \(notice\): .*is signed by key .*, not the partner's/, 409);
    last = (await importEvents(importId)).at(-1)!;
    expect(last.event).toBe('import.revocation_refused'); expect(last.details).toMatchObject({ key_id: keyIdOfPair(KEY1) });
    expect((await importRow(importId))!.state).toBe('admitted');
    // (c) A KEY2-signed notice naming ANOTHER package: the port's refusal inside the write (no import.revocation_refused row for this one — stated).
    const eventsBeforeC = (await importEvents(importId)).length;
    writeJson(join(f.dir, 'revocation.json'), signedNotice(foreignNotice(f, { package_digest: 'e'.repeat(64) }), KEY2));
    await refused(revokeImport(steward2, importId, { kind: 'station', destinationKey: STATION_KEY_D2 }), /names package .*, not the import's/, 409);
    expect((await importEvents(importId)).length).toBe(eventsBeforeC);
    expect((await importRow(importId))!.state).toBe('admitted');
    // (d) THE FOREIGN PARTNER'S SIGNED NOTICE naming the package: revoked from the station; the receipt written beside the notice; the origin not answered here; the mirror's copies gone; import.revoked with the station source.
    const signed = signedNotice(notice, KEY2);
    expect(verifyNotice(signed, KEY2_PEM).ok).toBe(true);
    writeJson(join(f.dir, 'revocation.json'), signed);
    const td = await mark();
    const rd = await revokeImport(steward2, importId, { kind: 'station', destinationKey: STATION_KEY_D2 });
    expect(rd.revocation).toMatchObject({ state: 'revoked', attempt: 1, refused: [], receipt: expect.objectContaining({ copies_destroyed: true, package_digest: f.digest }), answered: { answered: false, reason: expect.stringMatching(/not a domain of this tenant/) }, station_receipt: { path: join(f.dir, 'revocation-receipt.json') } });
    expect(rd.revocation.source).toMatchObject({ kind: 'station', destination_key: STATION_KEY_D2, action_id: f.actionId, package_digest: f.digest, verification: expect.objectContaining({ verified: true, key_id: keyIdOfPair(KEY2), partner_id: foreignPartnerId }) });
    expect(rd.revocation.notice).toMatchObject({ notice_id: notice['notice_id'] });
    expect(existsSync(join(f.dir, 'revocation-receipt.json'))).toBe(true);
    const receipt = readJson(join(f.dir, 'revocation-receipt.json'));
    expect(receipt).toMatchObject({ notice_id: notice['notice_id'], delivery_id: f.deliveryId, action_id: f.actionId, package_digest: f.digest, copies_destroyed: true, destroyed: expect.objectContaining({ records: 1, claims: 1, entities: 2, edges: 1 }), refused: [], recipient: `import:${T()}/${D2}/${importId}`, import_id: importId });
    expect(String(receipt['verifier'])).toMatch(/retention\.import\.revoke/);
    expect(String(receipt['receipt_id'])).toMatch(UUID);
    expect((await importRow(importId))!).toMatchObject({ state: 'revoked', revoked_by: steward2.principalId, revocation: expect.objectContaining({ kind: 'station' }) });
    expect((await edgeRow(zCopy))!.state).toBe('retracted');
    for (const e of [E5, E6]) expect((await entityRow(fi.map.get(e)!))!.lifecycle_state).toBe('retired');
    expect((await objectRows(String(gCopy['object_id']))).map((r) => r.lifecycle_state)).toEqual(['admitted', 'withdrawn']);
    expect(await blobExists('evidence', D2, String(gCopy['locator']))).toBe(false);
    const rows = await publishedIn(D2, 'import.revoked', td, importId);
    expect(rows).toHaveLength(1);
    expect(payloadOf(rows[0]!).import).toMatchObject({ partner_key: FOREIGN_PARTNER, notice: { notice_id: notice['notice_id'], source: 'station' } });
    await sixApplied(rows[0]!.id);
    // (e) CHECK 14's wordings (D9): a second foreign package at the station with a KEY2-signed revocation.json beside it → quarantined, the detail says signed and verified; unsigned → the digest match alone; KEY1-signed → does not verify against the partner's key.
    const f2 = foreignOf(base, KEY2); placeForeign(f2);
    writeJson(join(f2.dir, 'revocation.json'), signedNotice(foreignNotice(f2), KEY2));
    const q1 = await openStation(steward2, f2.actionId, STATION_KEY_D2, { tenantId: f2.tenantId, domainId: f2.domainId });
    expect(q1.import['state']).toBe('quarantined');
    expect(checkNamed(q1.checks, /^revocation/)).toMatchObject({ ok: false, detail: expect.stringMatching(/signed by the partner .* \(verified\)/) });
    writeJson(join(f2.dir, 'revocation.json'), foreignNotice(f2));
    const q2 = await openStation(steward2, f2.actionId, STATION_KEY_D2, { tenantId: f2.tenantId, domainId: f2.domainId });
    expect(checkNamed(q2.checks, /^revocation/)).toMatchObject({ ok: false, detail: expect.stringMatching(/revocation\.json.*unsigned — the digest match alone/) });
    writeJson(join(f2.dir, 'revocation.json'), signedNotice(foreignNotice(f2), KEY1));
    const q3 = await openStation(steward2, f2.actionId, STATION_KEY_D2, { tenantId: f2.tenantId, domainId: f2.domainId });
    expect(checkNamed(q3.checks, /^revocation/)).toMatchObject({ ok: false, detail: expect.stringMatching(/does not verify against the partner's key/) });
    // (f) THE SAME PARTY'S ROTATED KEY (C7): a third partner — KEY3, the foreign party — declared; a fresh foreign package admitted; its notice signed by KEY3 → verified against the rotated partner, `rotated_from` naming the KEY2 partner.
    const rotated = (await declarePartnerFor(KEY3, ROTATED_PARTNER, FOREIGN_PARTY)).partner;
    const rotatedPartnerId = String(rotated['partner_id']);
    expect(rotated).toMatchObject({ party: FOREIGN_PARTY, key_id: keyIdOfPair(KEY3), state: 'active' });
    const f3 = foreignOf(base, KEY2); placeForeign(f3);
    const o3 = await openStation(steward2, f3.actionId, STATION_KEY_D2, { tenantId: f3.tenantId, domainId: f3.domainId });
    expect(o3.import['partner_id']).toBe(foreignPartnerId);
    const fi3 = await imported(o3);
    const notice3 = foreignNotice(f3, { signing_key_id: keyIdOfPair(KEY3) });
    writeJson(join(f3.dir, 'revocation.json'), signedNotice(notice3, KEY3));
    const t3 = await mark();
    const r3 = await revokeImport(steward2, fi3.importId, { kind: 'station', destinationKey: STATION_KEY_D2 });
    expect(r3.revocation).toMatchObject({ state: 'revoked', receipt: expect.objectContaining({ copies_destroyed: true }) });
    const verification = (r3.revocation.source as Row)['verification'] as Row;
    expect(verification).toMatchObject({ verified: true, key_id: keyIdOfPair(KEY3), partner_id: rotatedPartnerId });
    expect([foreignPartnerId, FOREIGN_PARTNER]).toContain(String(verification['rotated_from']));
    await sixApplied((await publishedIn(D2, 'import.revoked', t3, fi3.importId))[0]!.id);
    await noDrift();
    await settleIn(D2);
  }, 600_000);
});

describe('S5 · the notice as the demonstration recipient sees it; the origin\'s acts on an importer notice (0077 D8; the B14 collect act)', () => {
  it('S5 · (a) a package delivered to the origin\'s station, acknowledged and revoked → the SIGNED notice; the recipient with --revocation --public-key verifies it, destroys and answers (collected → acknowledged); (b) the notice hand-replaced by an unsigned copy → the recipient keeps its copies and says so (collected → mismatched); (c) the acknowledge route on the importer notice already answered → refused; (d) the notify route for an import that holds no copy → refused', async () => {
    // (a) THE SIGNED NOTICE AT THE STATION: delivered, acknowledged by the recipient, revoked → revocation.json signed by KEY1 (the package's key); the recipient verifies the signature before it obeys.
    const E5x = await exported([mA.manifest_id]);
    const d5 = (await deliverTo(authority, E5x.id, STATION_KEY)).delivery;
    expect(d5.state).toBe('delivered');
    expect((await stationRecipient(E5x.id)).code).toBe(0);
    expect((await collect(authority, E5x.id, d5.delivery_id)).delivery.state).toBe('acknowledged');
    const rv5 = await revokeExport(authority, E5x.id, 'the origin revokes E5 at the station (harness)');
    expect(rv5.importers).toEqual([]);
    expect(rv5.notices).toHaveLength(1);
    const n5 = rv5.notices[0]! as Row & { notice: Row; destination: Row };
    expect(n5).toMatchObject({ state: 'notified', attempt: 1, destination: expect.objectContaining({ destination_key: STATION_KEY }) });
    expect(NOTICE_SIGNATURE_SCHEME).toBe(NOTICE_SCHEME);
    expect(n5.notice['signature']).toMatchObject({ scheme: NOTICE_SIGNATURE_SCHEME, key_id: keyIdOfPair(KEY1), algorithm: 'Ed25519' });
    const fileNotice = readJson(join(stationDir(E5x.id), 'revocation.json'));
    expect(fileNotice['signature']).toEqual(n5.notice['signature']);
    expect(verifyNotice(fileNotice, KEY1_PEM)).toMatchObject({ ok: true, keyId: keyIdOfPair(KEY1) });
    const ra = await stationRecipient(E5x.id, '--revocation');
    expect(ra.code, `${ra.stdout}\n${ra.stderr}`).toBe(0);
    expect(ra.stdout).toMatch(new RegExp(`notice signature: VERIFIED by key ${keyIdOfPair(KEY1)}`));
    const receipt5 = readJson(join(stationDir(E5x.id), 'revocation-receipt.json'));
    expect(receipt5).toMatchObject({ notice_id: n5['notice_id'], package_digest: E5x.packageDigest, copies_destroyed: true, signature: { verified: true, key_id: keyIdOfPair(KEY1) } });
    expect((await collectNotice(authority, E5x.id, String(n5['notice_id']))).notice).toMatchObject({ state: 'acknowledged' });
    // (b) THE NOTICE REPLACED BY AN UNSIGNED COPY before the recipient runs: the recipient KEEPS its copies, the receipt says so, the collect act records the mismatch — the honest answer.
    const E6x = await exported([mB.manifest_id]);
    const d6 = (await deliverTo(authority, E6x.id, STATION_KEY)).delivery;
    expect((await stationRecipient(E6x.id)).code).toBe(0);
    expect((await collect(authority, E6x.id, d6.delivery_id)).delivery.state).toBe('acknowledged');
    const rv6 = await revokeExport(authority, E6x.id, 'the origin revokes E6 at the station; the notice is stripped in transit (harness)');
    const n6 = rv6.notices[0]! as Row & { notice: Row };
    expect(n6['state']).toBe('notified');
    const stripped = unsignedOf(readJson(join(stationDir(E6x.id), 'revocation.json')));
    expect(stripped['signature']).toBeUndefined();
    writeJson(join(stationDir(E6x.id), 'revocation.json'), stripped);
    const rb = await stationRecipient(E6x.id, '--revocation');
    expect(rb.code, `${rb.stdout}\n${rb.stderr}`).toBe(0);
    expect(rb.stdout).toMatch(/notice signature: (NOT VERIFIED|unsigned)/);
    const receipt6 = readJson(join(stationDir(E6x.id), 'revocation-receipt.json'));
    expect(receipt6).toMatchObject({ notice_id: n6['notice_id'], copies_destroyed: false, signature: expect.objectContaining({ verified: false }) });
    expect((await collectNotice(authority, E6x.id, String(n6['notice_id']))).notice).toMatchObject({ state: 'mismatched' });
    // (c) The ACKNOWLEDGE route on the S3(d) importer notice, answered in place by the mirror's steward: an importer notice IS a notice of the ledger, and an answered one is not answered twice.
    await refused(acknowledgeNotice(authority, E3bx.id, pendingNoticeId, { notice_id: pendingNoticeId, package_digest: E3bx.packageDigest, copies_destroyed: true }), /is not notified — it is acknowledged/, 409);
    // (d) The NOTIFY route for an importer: E5 was never imported — the port's refusal; a positive further notice to an importer is S3(b)'s path (the import's own revoke act answers the origin) — stated.
    await refused(notifyImporter(authority, E5x.id, { domainId: D2, importId: uuidv7() }), /holds no admitted copy/, 409);
    await settleIn(D2);
  }, 240_000);
});
