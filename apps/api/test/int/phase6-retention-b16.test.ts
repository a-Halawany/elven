/**
 * CP-6 B16 (migration 0076) — the GOVERNED IMPORT (retention.imports / import_items / import_events; the exchange partner; quarantine →
 * verification → approval → admission under NEW ids), the NORDWERK export → import → re-export ROUND TRIP (DP-47-001/-002/-003/-006,
 * DZ-17, ES-53-004), the VERSIONED CLOSURE (Codex B15-F1: `eye-customer-export-links/2`, every exact claim version by the
 * (object_id, object_version) pair, the evidence pair rule) and HELD RECIPIENTS (Codex B14-F1: `retention.export_delivery_held` —
 * confirmed / possible / nothing known to have reached the destination) — on a real database, an isolated vault, an isolated transfer
 * station, a SECOND DOMAIN of the tenant (the mirror domain, created through the tenancy route) and the synthetic https recipient of B14
 * (spawned; a real TLS server on a loopback port).
 *
 * THE ONE SUBSTITUTION, STATED (as the B14 and B15 harnesses state it): the product's delivery egress (http-client.ts `deliver`) refuses
 * every loopback, private, link-local and reserved address before it connects, so a recipient on this host is unreachable through
 * `deliver` by design. This file replaces the DeliveryEgress provider's transport with the client's own `deliverPinned(req, '127.0.0.1')`
 * — the SAME function `deliver` calls once the address is settled (the TLS handshake against the declared anchor, the POST, the headers,
 * the credential on the one hop, the redirect refused, the answer's limits) — so that everything but the address vetting is the
 * product's code on a real socket; R1(e) restores the production egress for one delivery to show the vetting refuse (dns_failure).
 *
 *   V1 · THE VERSIONED CLOSURE (B15-F1) — on record A: a REL claim C@1 (seeded as the extraction admits it, its lineage on A's BYTES),
 *   an edge asserted on C@1, then C@2 seeded raw with its own lineage row; the export of A → links.json `/2` carries TWO entries for C
 *   (versions 1 and 2, one lineage row each, `referenced_by`), the edge naming {C, 1}, no exclusion; the customer's verifier passes the
 *   pair check; links.json hand-tampered to the B15-F1 counterexample (entry C@1 removed, the edge still resting on version 1, the
 *   counts adjusted, the manifest re-signed with the harness key) → the verifier FAILS the pair check ("never rebased onto another
 *   version"); links.json altered in place → the product's stream route refuses it before any byte (the links digest); then a fresh
 *   pair on record R — CR@1 RESTRICTED, CR@2 internal, the edge on CR@1 — exported under the internal ceiling → CR@1 EXCLUDED (redaction)
 *   WITH its edge excluded (dependency), both entries carrying the pair, CR@2 included; a `/1` closure hand-built from it → the verifier
 *   passes by id and SAYS so ("versions unvalidated").
 *
 *   P1 · THE EXCHANGE PARTNER — the mirror domain's intake source (an active upload contract with confirmed rights, registered through the
 *   real route, approved and activated by the mirror's own operators); the partner declared with the harness key's PEM → the key id the
 *   export's own signing derives, Ed25519, the intake contract named, state active; a second declaration of the same key → refused
 *   (already declared); the same partner key under another key → refused; an intake contract that is not active, one that is not an
 *   upload contract, one whose rights are withdrawn, one that does not exist → refused with the port's words; a malformed PEM and a bad
 *   partner key → 422; retired with a reason → the list shows it retired; a package signed by the retired partner's key opened in the
 *   mirror → QUARANTINED (no partner holds the key); the partner declared again → the key resolves.
 *
 *   I1 · THE ROUND TRIP — the origin export E1 (records A and B: V1's versioned closure, an ENT claim on B with an identifier under an
 *   authoritative identifier system, the edge) streamed through the real route; the mirror opens the import INLINE with the exchange
 *   statement → VERIFIED, every check named; the opener does not approve (the port's rule, on a principal who holds both roles; the PDP
 *   for the plain steward); a wrong digest refused; approved on the digest; the approver does not admit (the port's rule; the PDP for the
 *   authority); the steward admits → ADMITTED: every origin id → a NEW id with the version numbers preserved (C'@1 and C'@2 under ONE new
 *   id), `payload.imported_from` complete, `source_object_ids` naming the import, the manifests under the intake contract with
 *   custody.imported, the record downloadable in the mirror (the bytes' sha256 = the origin's bytes digest; custody.retrieved naming the
 *   intake contract — N1), the lineage rows for both versions naming the new record id and the bytes digest, the edge on (C', 1), the
 *   entities, the identifier system and the identifier, the projections rebuilt without drift, the quarantine copies of the admitted
 *   records tombstoned (manifest.json and links.json kept), the events, the import receipt; then the mirror's RE-EXPORT E2 of the imported
 *   manifests → the customer's compare tool (scripts/retention/compare-round-trip.mjs) proves the round trip from the two packages and
 *   the import's item map; E2's links.json carries C'@1 and C'@2 with the edge on version 1.
 *
 *   I2 · REFUSALS WITH THE EVIDENCE PRESERVED (DP-47-005; C2, C3, C4, C5) — (a) a package signed by a key no partner holds → quarantined
 *   (check 8), the manifest's copy kept, the record entries DRAINED (nothing stored: C5); the partner declared → opened again → verified;
 *   (b) a `.bin` flipped in the tar → the integrity check fails; (c) links.json tampered → the closure's digest check fails; (d) a `/1`
 *   (digest-chain-only) package → the scheme check fails; (e) a confidential record under an internal intake → verified with the
 *   exclusion counted, admitted with that item EXCLUDED (ceiling), the rest admitted or reused; (f) NEVER REBASED — a closure tampered so
 *   that the edge rests on a version the closure does not carry (re-signed) → the pair check fails at verification (quarantined); a
 *   package whose closure carries CF@1 (confidential) and CF@2 with the edge on CF@1, under the internal intake → verified, admitted with
 *   CF@1 excluded (ceiling), the edge REFUSED (dependency), CF@2 admitted; (g) the same package opened again → the duplicate check fails;
 *   (h) the origin package revoked before the import → the revocation check fails; an origin unknown here (the action id rewritten and
 *   re-signed) → the check is a NOTE, not a pass (C2b), with the exchange's expiry or "no expiry stated"; (i) the STATION intake: a package
 *   delivered to the station and acknowledged, imported from the station with delivery.json as the exchange → admitted; a revocation.json
 *   at the station naming the package → the revocation check fails (C2c); a symlinked package.tar at the station → refused before any
 *   byte, nothing stored (C4); a record whose header the PORT refuses (valid_to before valid_from, re-digested and re-signed) → that item
 *   refused (header), the rest admitted, the import admitted (C3); (j) a withdrawn import keeps its ledger, its quarantine copies
 *   tombstoned after the commit (C5); admit or approve on a withdrawn or quarantined import → refused.
 *
 *   I3 · A LARGE PACKAGE BY THE STATION — seventeen uploads of 16,000,000 bytes (above EXPORT_ARCHIVE_MAX_BYTES) exported, delivered to
 *   the station, imported into the mirror from the station entry by entry, approved and admitted; the process's memory SAMPLED on the
 *   event loop every 50 ms across the open and the admission (phase6-memory-sampler.ts: heapUsed + external (which counts the ArrayBuffer backing stores) above the
 *   baseline, not RSS; a synchronous peak between two samples is not observed) stays under 256 MiB above the baseline — a sampled
 *   high-water mark, reported as such.
 *
 *   R1 · HELD RECIPIENTS (B14-F1; ES-08-004) — one package delivered to five https destinations on the same recipient: `wrong-digest` →
 *   MISMATCHED (held confirmed); an unbound credential → failed credential_unbound (nothing left the process); mode `error` → failed
 *   transport 500 after the body (held possible); mode `redirect` → failed egress_refused redirect_not_followed AFTER the body
 *   (request_sent: true — held possible, C1); the production egress → failed transport dns_failure (nothing sent). The revoke act's
 *   recipients carry `held`; the mismatched, the answered-500 and the redirected destinations are notified (acknowledged by the recipient,
 *   the mismatched delivery's stored tar destroyed, its receipt still on the row and in export.mismatched); the unbound and the
 *   unresolved are absent, and the notify route refuses them ("nothing is known to have reached it"). (b) a second package delivered
 *   mismatched, revoked while the recipient answers 500 → the revoke act's notice failed transport; the recipient back → the notify
 *   route → acknowledged.
 *
 * Read against the design's own statements, three things this harness does NOT claim: the inline intake over the real listener is
 * bounded by the JSON body limit (the harness drives the controller in process; the act imports from the station); the https positive
 * exchange rests on the substitution above; the memory bound is a sampled one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpsRequest } from 'node:https';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { PassThrough } from 'node:stream';
import { canonicalHeaderDigest, type CanonicalHeader, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { TenancyController } from '../../src/tenancy/tenancy.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { DeliveryEgress } from '../../src/retention/export-delivery.service.js';
import { deliver, deliverPinned, type DeliveryRequest } from '../../src/observation/connectors/http-client.js';
import { EXPORT_ARCHIVE_MAX_BYTES, LINKS_FILE, buildUstar, listedFilesOf } from '../../src/retention/export-archive.js';
import { SIGNATURE_SCHEME, objectsDigestOf, packageDigestOf, type ExportManifestShape } from '../../src/retention/export-package.js';
import { KEY_SIGNATURE_SCHEME, keyIdOf } from '../../src/retention/export-signing.js';
import { IMPORT_FORMS, remapUuids } from '../../src/retention/import-package.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { fixtureContract } from './phase1-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';
import { describeSampledPeak, sampledPeak } from './phase6-memory-sampler.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b16-vault-')));
const STATION_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b16-station-')));
const SCRATCH_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b16-scratch-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
type KeyPair = { privateKey: KeyObject; publicKey: KeyObject };
/** KEY1 signs every export of the tenant (bound by reference before the boot); KEY2 is a key NO partner of the mirror holds until I2(a) declares one. */
const KEY1: KeyPair = generateKeyPairSync('ed25519');
const KEY2: KeyPair = generateKeyPairSync('ed25519');
const KEY_REF = 'EYE_EXPORT_SIGNING_KEY_B16';
process.env[KEY_REF] = (KEY1.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
const keyIdOfPair = (k: KeyPair): string => keyIdOf(k.publicKey.export({ type: 'spki', format: 'der' }) as Buffer);
const KEY1_PEM = `${spkiPem(KEY1.publicKey)}\n`; const KEY2_PEM = `${spkiPem(KEY2.publicKey)}\n`;
const KEY1_PEM_FILE = join(SCRATCH_DIR, 'b16-key1.pub.pem');
writeFileSync(KEY1_PEM_FILE, KEY1_PEM);
const DST_REF = 'EYE_DST_B16';
const DST_TOKEN = `b16-${createHash('sha256').update(String(process.pid) + String(Date.now())).digest('hex').slice(0, 24)}`;
process.env[DST_REF] = DST_TOKEN;
/** R1(c): a destination whose credential reference this deployment does NOT bind — nothing may leave the process for it. */
const UNBOUND_REF = 'EYE_DST_B16_UNBOUND';
delete process.env[UNBOUND_REF];

const execFile = promisify(execFileCb);
const VERIFIER = resolvePath(__dirname, '../../../../scripts/retention/verify-export.mjs');
const COMPARE = resolvePath(__dirname, '../../../../scripts/retention/compare-round-trip.mjs');
const RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/https-recipient.mjs');
const STATION_RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/transfer-station-recipient.mjs');
const RECIPIENT_HOST = 'recipient.b16.invalid';
const HTTPS_KEY = 'b16-https'; const STATION_KEY = 'b16-station'; const STATION_KEY_D2 = 'b16-station-mirror';
const UNBOUND_KEY = 'b16-https-unbound'; const POSSIBLE_KEY = 'b16-https-answered-500'; const REDIRECT_KEY = 'b16-https-redirect'; const DNS_KEY = 'b16-https-unresolved';
const LINKS_2 = 'eye-customer-export-links/2'; const LINKS_1 = 'eye-customer-export-links/1';

type Row = Record<string, unknown>;
type Check = { name: string; ok: boolean | null; detail: string | null };
type OpenAnswer = { import: Row; checks: Check[]; items: Row[]; verified: boolean; importReceipt: Row; receipt: Row };
type ImportDetail = { import: Row; partner: Row | null; items: Row[]; events: Row[]; checks: Check[]; importReceipt: Row; receipt: Row };
type AdmitAnswer = { import: Row; batches: Row[]; receipt: Row };
/** The B16 routes of the retention controller as the design states them (§5); the harness calls them in process, as the B14/B15 harnesses call theirs. */
interface B16Routes {
  declarePartner(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<{ partner: Row; receipt: Row }>;
  retirePartner(req: never, tenantId: string, domainId: string, partnerId: string, body: { payload?: { reason?: string } }): Promise<{ partner: Row; receipt: Row }>;
  listPartners(req: never, tenantId: string, domainId: string): Promise<{ partners: Row[]; receipt: Row }>;
  openImport(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<OpenAnswer>;
  approveImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { packageDigest?: string; rationale?: string } }): Promise<{ import: Row; receipt: Row }>;
  admitImport(req: never, tenantId: string, domainId: string, importId: string): Promise<AdmitAnswer>;
  withdrawImport(req: never, tenantId: string, domainId: string, importId: string, body: { payload?: { reason?: string } }): Promise<{ import: Row; quarantine: Row; receipt: Row }>;
  getImport(req: never, tenantId: string, domainId: string, importId: string): Promise<ImportDetail>;
  listImports(req: never, tenantId: string, domainId: string): Promise<{ imports: Row[]; receipt: Row }>;
}

let h: Phase4Harness; let retention: RetentionController; let b16: B16Routes; let observation: ObservationController; let vault: VaultService; let su: AnyDb; let egressProvider: DeliveryEgress;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal;
/** The mirror domain (D2) and its people: the steward, the administrator, the registrar (domain_analyst) and the manager (collection_manager) of the intake source; two dual-role principals for the ports' own two-person rules. */
let D2 = ''; let steward2: AuthenticatedPrincipal; let domainAdmin2: AuthenticatedPrincipal; let registrar2: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal; let dualOpener: AuthenticatedPrincipal; let dualAdmin: AuthenticatedPrincipal;
let intake = { sourceId: '', version: 1, sourceKey: '' };
let recipient: ChildProcess | null = null; let recipientPort = 0; let recipientCert = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v)) as V;
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const E1 = uuidv7(); const E2 = uuidv7();
const LEI = '5299000NORDWERK00001';

/* ───────────── the rows ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
type ManifestRow = { manifest_id: string; source_id: string; contract_version: number; content_digest: string; byte_length: number; locator: string; classification: string; domain_id: string };
const manifestRow = async (manifestId: string): Promise<ManifestRow> => (await sql<ManifestRow>`select manifest_id::text, source_id::text, contract_version::int, content_digest, byte_length::int, locator, classification, domain_id::text from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Row; source_id: string; contract_version: number; content_digest: string; actor: string }>`select event, details, source_id::text, contract_version::int, content_digest, actor from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
type ExportRow = { package_digest: string; archive_digest: string | null; byte_total: number; expires_at: Date | null; revoked_at: Date | null; manifest_digest: string };
const exportRow = async (id: string): Promise<ExportRow> => (await sql<ExportRow>`select package_digest, archive_digest, byte_total::int, expires_at, revoked_at, manifest_digest from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const actionEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
type DeliveryRow = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null };
const deliveryRow = async (deliveryId: string): Promise<DeliveryRow> => (await sql<DeliveryRow>`select delivery_id::text, state, attempt::int, receipt, failure_class from retention.export_deliveries where delivery_id = ${deliveryId}::uuid`.execute(su)).rows[0]!;
type ImportRow = { import_id: string; state: string; verified: boolean; partner_id: string | null; package_digest: string | null; archive_digest: string; archive_size: number; manifest_locator: string | null; links_locator: string | null; intake: Row; origin: Row; exchange: Row | null; checks: Check[]; counts: Row; opened_by: string; approved_by: string | null; admitted_by: string | null; withdrawn_by: string | null; attempts: number };
const importRow = async (importId: string): Promise<ImportRow | undefined> => (await sql<ImportRow>`select import_id::text, state, verified, partner_id::text, package_digest, archive_digest, archive_size::int, manifest_locator, links_locator, intake, origin, exchange, checks, counts, opened_by::text, approved_by::text, admitted_by::text, withdrawn_by::text, attempts::int from retention.imports where import_id = ${importId}::uuid`.execute(su)).rows[0];
const importEvents = async (importId: string) => (await sql<{ event: string; details: Row; actor_principal_id: string | null }>`select event, details, actor_principal_id::text from retention.import_events where import_id = ${importId}::uuid order by occurred_at, event_id`.execute(su)).rows;
type ItemRow = { item_id: string; kind: string; origin_ref: string; origin: Row; staged: Row | null; planned: Row; disposition: string; gate: string | null; reason: string | null; admitted: Row | null; dependency_order: number };
const importItems = async (importId: string): Promise<ItemRow[]> => (await sql<ItemRow>`select item_id::text, kind, origin_ref, origin, staged, planned, disposition, gate, reason, admitted, dependency_order::int from retention.import_items where import_id = ${importId}::uuid order by dependency_order`.execute(su)).rows;
const importsOfOrigin = async (domainId: string, originActionId: string) => (await sql<{ import_id: string; state: string }>`select import_id::text, state from retention.imports where domain_id = ${domainId}::uuid and origin ->> 'action_id' = ${originActionId}`.execute(su)).rows;
type ObjectRow = { object_id: string; object_version: number; object_type: string; schema_ref: string; content_digest: string; provenance_ref: string | null; source_object_ids: string[]; evidence_refs: string[]; classification: string; correction_of: string | null; supersedes: string | null; payload: Row; domain_id: string; lifecycle_state: string; method_ref: string | null; accountable_owner: string; audit_correlation_id: string };
const objectRows = async (objectId: string): Promise<ObjectRow[]> => (await sql<ObjectRow>`select object_id::text, object_version::int, object_type, schema_ref, content_digest, provenance_ref, source_object_ids, evidence_refs, classification, correction_of, supersedes, payload, domain_id::text, lifecycle_state, method_ref, accountable_owner, audit_correlation_id::text from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const lineageRows = async (claimId: string) => (await sql<{ claim_version: number; evidence_object_id: string; evidence_digest: string; byte_start: number; byte_end: number; mode: string; confidence: string; domain_id: string; run_id: string; method_id: string }>`select claim_version::int, evidence_object_id::text, evidence_digest, byte_start::int, byte_end::int, mode, confidence::text, domain_id::text, run_id::text, method_id::text from intelligence.claim_lineage where claim_object_id = ${claimId}::uuid order by claim_version`.execute(su)).rows;
const edgesIn = async (domainId: string) => (await sql<{ edge_id: string; subject_entity_id: string; object_entity_id: string; predicate: string; claim_object_id: string; claim_version: number; evidence_object_id: string; evidence_digest: string; state: string; confidence: string; mode: string; asserted_at: Date }>`select edge_id::text, subject_entity_id::text, object_entity_id::text, predicate, claim_object_id::text, claim_version::int, evidence_object_id::text, evidence_digest, state, confidence::text, mode, asserted_at from graph.edges_current where domain_id = ${domainId}::uuid order by asserted_at`.execute(su)).rows;
const entitiesIn = async (domainId: string) => (await sql<{ entity_id: string; entity_type: string; canonical_name: string; lifecycle_state: string }>`select entity_id::text, entity_type, canonical_name, lifecycle_state from graph.entities_current where domain_id = ${domainId}::uuid order by canonical_name`.execute(su)).rows;
const identifiersIn = async (domainId: string) => (await sql<{ entity_id: string; system_key: string; identifier_value: string; source_claim_object_id: string; source_evidence_object_id: string }>`select entity_id::text, system_key, identifier_value, source_claim_object_id::text, source_evidence_object_id::text from graph.entity_identifiers where domain_id = ${domainId}::uuid order by system_key, identifier_value`.execute(su)).rows;
const identifierSystemsIn = async (domainId: string) => (await sql<{ system_key: string; authority: string; is_authoritative: boolean }>`select system_key, authority, is_authoritative from graph.identifier_systems where domain_id = ${domainId}::uuid order by system_key`.execute(su)).rows;
const quarantineDir = (domainId: string) => join(vault.rootFor('quarantine'), T(), domainId);
const quarantineCount = (domainId: string): number => (existsSync(quarantineDir(domainId)) ? readdirSync(quarantineDir(domainId)).filter((n) => UUID.test(n)).length : 0);
const blobExists = (vaultName: 'quarantine' | 'evidence', domainId: string, locator: string) => vault.exists(vaultName, { tenantId: T(), domainId }, locator);

/* ───────────── the routes (D1 as the B15 harness; the mirror by `reqIn`, the residual-corrections harness's idiom) ───────────── */
const reqIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  ({ eyeEnvelope: { ...(h.req(as, action, objectType, objectId, purpose) as { eyeEnvelope: Row }).eyeEnvelope, domain_id: domainId }, eyePrincipal: as }) as never;
const envIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string): Envelope => ({ ...h.env(as, action, objectType, objectId, purpose), domain_id: domainId } as Envelope);
const routeIn = (domainId: string, action: string, objectType: string, objectId: string | null) => ({ scope: 'DOMAIN' as const, tenantId: T(), domainId, action, objectType, objectId });
type Exported = { id: string; domainId: string; packageDigest: string; archiveDigest: string; manifestDigest: string; byteTotal: number; expiresAt: string | null; dir: string };
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
  return { id, domainId, packageDigest: row.package_digest, archiveDigest: row.archive_digest!, manifestDigest: row.manifest_digest, byteTotal: row.byte_total, expiresAt: instantOf(row.expires_at), dir: join(vault.rootFor('export'), T(), domainId, id) };
};
const exported = (manifestIds: string[], ceiling = 'internal') => exportedIn(D(), steward, manifestIds, ceiling);
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string) => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose: 'demonstration' } }) as Promise<{ key: Row }>;
const declareDestinationIn = (domainId: string, p: AuthenticatedPrincipal, payload: Row) => retention.declareDestination(reqIn(p, domainId, 'retention.destination.declare', 'RDS', null, 'retention'), T(), domainId, { payload }) as Promise<{ destination: Row }>;
type Delivery = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; egress: Row | null };
const deliverTo = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.deliverExport(h.req(p, 'retention.export.deliver', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ delivery: Delivery }>;
const collect = (p: AuthenticatedPrincipal, id: string, deliveryId: string) => retention.collectReceipt(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId) as unknown as Promise<{ delivery: Delivery }>;
type Revocation = { revocation: Row; notices: Row[]; bytes: { removed: boolean }; stations: Row[] };
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } }) as unknown as Promise<Revocation>;
type Notice = { notice_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; notice: Row; delivery: Row; destination: Row; egress: Row | null };
const notify = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.notifyRevocation(h.req(p, 'retention.export.notify', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ notice: Notice }>;
/** The stream route driven in process (the B15 harness's double): the bytes piped to a file and hashed as they arrive; a refusal before the first byte is the route's HttpException. */
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
const downloadIn = (domainId: string, p: AuthenticatedPrincipal, evdId: string) => observation.downloadEvidence(reqIn(p, domainId, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), domainId, evdId) as Promise<{ download: { contentDigest: string; byteLength: number; base64: string; integrity: string } }>;
// The B16 routes, in the mirror domain unless a domain is named.
const openImport = (p: AuthenticatedPrincipal, source: Row, domainId = D2) => b16.openImport(reqIn(p, domainId, 'retention.import.open', 'RIM', null, 'retention'), T(), domainId, { payload: { source } });
const openInline = (p: AuthenticatedPrincipal, tar: Buffer, exchange: Row | null = null) => openImport(p, { kind: 'inline', base64: tar.toString('base64'), ...(exchange === null ? {} : { exchange }) });
const openStation = (p: AuthenticatedPrincipal, originActionId: string, destinationKey = STATION_KEY_D2) => openImport(p, { kind: 'station', destinationKey, origin: { tenantId: T(), domainId: D(), actionId: originActionId } });
const approveImport = (p: AuthenticatedPrincipal, importId: string, packageDigest: string, rationale = 'the package as verified (harness)') => b16.approveImport(reqIn(p, D2, 'retention.import.approve', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { packageDigest, rationale } });
const admitImport = (p: AuthenticatedPrincipal, importId: string) => b16.admitImport(reqIn(p, D2, 'retention.import.admit', 'RIM', importId, 'retention'), T(), D2, importId);
const withdrawImport = (p: AuthenticatedPrincipal, importId: string, reason: string) => b16.withdrawImport(reqIn(p, D2, 'retention.import.withdraw', 'RIM', importId, 'retention'), T(), D2, importId, { payload: { reason } });
const getImport = (p: AuthenticatedPrincipal, importId: string) => b16.getImport(reqIn(p, D2, 'retention.read', 'RIM', importId, 'retention'), T(), D2, importId);
const listImports = (p: AuthenticatedPrincipal) => b16.listImports(reqIn(p, D2, 'retention.read', 'RIM', null, 'retention'), T(), D2);
const declarePartner = (p: AuthenticatedPrincipal, payload: Row) => b16.declarePartner(reqIn(p, D2, 'retention.partner.declare', 'RXP', null, 'retention'), T(), D2, { payload });
const retirePartner = (p: AuthenticatedPrincipal, partnerId: string, reason: string) => b16.retirePartner(reqIn(p, D2, 'retention.partner.retire', 'RXP', partnerId, 'retention'), T(), D2, partnerId, { payload: { reason } });
const listPartners = (p: AuthenticatedPrincipal) => b16.listPartners(reqIn(p, D2, 'retention.read', 'RXP', null, 'retention'), T(), D2);
/** The whole import as the steward sees it: opened, approved by the authority on the digest, admitted by the steward. */
const imported = async (open: OpenAnswer): Promise<{ importId: string; admitted: AdmitAnswer; detail: ImportDetail }> => {
  const importId = String(open.import['import_id']);
  expect(open.verified, failedChecks(open.checks).join(' | ')).toBe(true);
  await approveImport(authority, importId, String(open.import['package_digest']));
  const admitted = await admitImport(steward2, importId);
  expect(admitted.import['state']).toBe('admitted');
  return { importId, admitted, detail: await getImport(steward2, importId) };
};
const declarePartnerFor = (key: KeyPair, partnerKey: string, over: Row = {}) => declarePartner(domainAdmin2, { partnerKey, party: 'NORDWERK GmbH (origin domain; harness)', purpose: 'the exchange of the origin domain\'s records into the mirror (harness)', publicKeyPem: key === KEY1 ? KEY1_PEM : KEY2_PEM, intakeSourceId: intake.sourceId, intakeContractVersion: intake.version, ...over });

/* ───────────── refusals, checks, the tools ───────────── */
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
type VerifierJson = { code: number; ok: boolean; failed: number; closure_format?: string | null; checks: Check[] };
const parseVerifier = (r: { code: number; stdout: string; stderr: string }): VerifierJson => { try { return { code: r.code, ...(JSON.parse(r.stdout) as Omit<VerifierJson, 'code'>) }; } catch { throw new Error(`the verifier did not answer JSON (exit ${r.code}): ${r.stdout.slice(0, 400)} ${r.stderr.slice(0, 400)}`); } };
const verifyDir = async (dir: string, ...extra: string[]) => parseVerifier(await run([VERIFIER, dir, '--json', '--public-key', KEY1_PEM_FILE, ...extra]));
const linksChecks = (v: VerifierJson) => v.checks.filter((c) => c.name.startsWith('links:'));
const stationRecipient = (actionId: string, ...extra: string[]) => run([STATION_RECIPIENT, STATION_DIR, T(), D(), actionId, '--public-key', KEY1_PEM_FILE, ...extra]);
const stationDir = (id: string) => join(STATION_DIR, T(), D(), id);
const recipientCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Row }> => new Promise((res, rej) => {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const req = httpsRequest({ host: '127.0.0.1', port: recipientPort, servername: RECIPIENT_HOST, path, method, ca: recipientCert, rejectUnauthorized: true,
                             headers: { authorization: `Bearer ${DST_TOKEN}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
    const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row }); } catch (e) { rej(e); } });
  });
  req.on('error', rej); if (payload !== null) req.write(payload); req.end();
});
const setMode = async (mode: string) => { expect((await recipientCall('POST', '/_control', { mode })).status).toBe(200); };
const receivedAtRecipient = async () => (await recipientCall('GET', '/_received')).body as { received: Row[]; notices: Row[] };
const harnessEgress = (req: DeliveryRequest) => deliverPinned(req, '127.0.0.1');
const productionEgress = (req: DeliveryRequest) => deliver(req);

/* ───────────── packages in the harness's hands: read from an export directory, altered, re-signed, written back or built into a tar ───────────── */
type Pkg = { manifest: Row; files: Map<string, Buffer> };
const manifestBytesOf = (m: Row): Buffer => Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8');
const packageOf = (dir: string): Pkg => { const manifest = readJson(join(dir, 'manifest.json')); const files = new Map<string, Buffer>(); for (const f of listedFilesOf(manifest['objects'], manifest as never)) files.set(f, readFileSync(join(dir, f))); return { manifest, files }; };
const clonePkg = (p: Pkg): Pkg => ({ manifest: clone(p.manifest), files: new Map(p.files) });
const linksOfPkg = (p: Pkg): Row => JSON.parse(p.files.get(LINKS_FILE)!.toString('utf8')) as Row;
/** The package's tar as the product builds it (manifest.json first, then the listed files by name, at the manifest's built_at) — the B15 harness proved buildUstar = the product's archive. */
const tarOfPkg = (p: Pkg): Buffer => { const m = p.manifest; const mtime = Math.floor(Date.parse(String((m['package'] as Row)['built_at'])) / 1000); return buildUstar([{ name: 'manifest.json', bytes: manifestBytesOf(m) }, ...listedFilesOf(m['objects'], m as never).map((name) => ({ name, bytes: p.files.get(name)! }))], mtime); };
const tarOfDir = (dir: string): Buffer => tarOfPkg(packageOf(dir));
const writePkg = (p: Pkg, dir: string): string => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'manifest.json'), manifestBytesOf(p.manifest)); for (const [name, bytes] of p.files) writeFileSync(join(dir, name), bytes); return dir; };
/** The chain recomputed over the manifest as altered and signed by the given key — what a sender's product does; the harness holds KEY1's private key in process (and KEY2's, which no partner holds). */
const resign = (m: Row, key: KeyPair = KEY1): void => {
  const sig = (m['signature'] ?? {}) as Row; const shape = m as unknown as ExportManifestShape;
  const packageDigest = packageDigestOf({ format: shape.format, package: shape.package, authorization: shape.authorization, gates: shape.gates, objects: shape.objects, excluded: shape.excluded, signature: { bound_to: sig['bound_to'] ?? null, statement: sig['statement'] ?? null } });
  m['signature'] = { ...sig, scheme: KEY_SIGNATURE_SCHEME, objects_digest: objectsDigestOf(shape.objects), package_digest: packageDigest, key_id: keyIdOfPair(key), algorithm: 'Ed25519', signature: cryptoSign(null, Buffer.from(packageDigest, 'utf8'), key.privateKey).toString('base64') };
};
/** The manifest's signature block reduced to the digest chain alone (scheme /1): the package digest is unchanged, so no re-signing is involved. */
const chainOnly = (m: Row): void => { const sig = (m['signature'] ?? {}) as Row; m['signature'] = { scheme: SIGNATURE_SCHEME, objects_digest: sig['objects_digest'], package_digest: sig['package_digest'], bound_to: sig['bound_to'], statement: sig['statement'] }; };
/** links.json replaced and the manifest's package.links restated (the digest, the size, the format, the counts) — the caller re-signs. */
const setLinks = (p: Pkg, links: Row): void => {
  const bytes = Buffer.from(`${JSON.stringify(links, null, 2)}\n`, 'utf8'); p.files.set(LINKS_FILE, bytes);
  const pk = p.manifest['package'] as Row; const counts = links['counts'] as Row;
  pk['links'] = { ...(pk['links'] as Row), links_digest: sha256(bytes), byte_length: bytes.byteLength, format: links['format'], claims: counts['claims'], edges: counts['edges'], entities: counts['entities'], excluded: counts['excluded'] };
};

/* ───────────── the origin's derived knowledge, seeded as the extraction admits it ───────────── */
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
const REL_PAYLOAD = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait' };
const ENT_PAYLOAD = { claim_kind: 'entity', subject: 'NORDWERK Magnet GmbH', predicate: 'is_a', object_value: 'organization' };
/**
 * A claim version as the extraction would have admitted it: the complete 43-field header (its canonical digest recomputed over the
 * header and payload, as the port would), the payload the claim schema admits, its lineage row naming the evidence BYTES (evidence_digest
 * = the bytes' sha256, the evidence pair rule of the closure), a run row. A second version of the same id names the first as its
 * correction. Written by the superuser: the fixture, not a governed write.
 */
async function seedClaim(a: { claimId?: string; version?: number; type: 'REL' | 'ENT' | 'CLM'; evidence: Evd; classification: 'internal' | 'confidential' | 'restricted'; payload: Row }): Promise<{ claimId: string; version: number; runId: string; methodId: string; contentDigest: string; header: CanonicalHeader; payload: Row }> {
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
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${a.type}@v${a.type === 'CLM' ? 2 : 1}`, ontology_ref: null, correction_of: prior, supersedes: prior, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${a.classification}, 'intelligence', null, null, null, null, null, null, null, ${header.schema_ref}, null, ${prior}, ${prior}, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.evidence.bytesDigest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, version, runId, methodId, contentDigest, header, payload };
}
/** An edge asserted through the governed port on the given claim VERSION, its evidence the record's bytes. */
const assertEdge = async (a: { predicate: string; claimId: string; claimVersion: number; evidence: Evd }): Promise<string> => {
  const edgeId = uuidv7();
  await h.pipeline.write(h.env(owner, 'graph.edge.assert', 'EDG', edgeId, 'graph'), owner, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
    async (cap) => {
      await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: E2, predicate: a.predicate, object: E1, validFrom: '2024-01-01T00:00:00.000Z', validTo: null, claimObjectId: a.claimId, claimVersion: a.claimVersion, evidenceObjectId: a.evidence.id, evidenceDigest: a.evidence.bytesDigest, methodId: null, runId: null, mode: 'replay', confidence: 0.7, actor: owner.principalId, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: { edgeId }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
    });
  return edgeId;
};
const upload = async (files: Array<{ name: string; text: string }>, ceiling: 'internal' | 'confidential' = 'internal', label = ''): Promise<Evd[]> =>
  (await h.upload(files.map((f) => ({ filename: `${f.name}.csv`, text: f.text, documentTime: '2024-01-14T00:00:00Z' })), ceiling, label)).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest }));
const uploadOne = async (name: string, ceiling: 'internal' | 'confidential' = 'internal', label = ''): Promise<{ evd: Evd; m: ManifestRow }> => {
  const evd = (await upload([{ name, text: TERMS_CSV.replace('assumption', `assumption (${name})`) }], ceiling, label))[0]!;
  const m = await manifestRow((await manifestOf(evd.id, 1)).manifest_id);
  expect(evd.bytesDigest).toBe(m.content_digest);
  return { evd, m };
};
/** CSV-shaped ASCII of the given size (the B15 S2 fixture; the upload contract admits 16 MiB per object). */
const bigText = (salt: string, bytes: number): string => { const line = `${salt},row,${'x'.repeat(200)}\n`; return `key,kind,value\n${line.repeat(Math.floor(bytes / line.length))}`; };

/* ───────────── the mirror's intake source: an upload contract registered through the real route, approved and activated by the mirror's operators ───────────── */
const registryWriteIn = (domainId: string, p: AuthenticatedPrincipal, action: string, sourceId: string, fn: (cap: ReturnType<typeof ObservationCapability.registry>) => Promise<void>) =>
  h.pipeline.write(envIn(p, domainId, action, 'SRC', sourceId, 'observation'), p, routeIn(domainId, action, 'SRC', sourceId), ObservationCapability.registry,
    async (cap) => { await fn(cap); return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null }; });
const registerIn = async (domainId: string, contract: Row): Promise<string> =>
  ((await observation.registerSource(reqIn(registrar2, domainId, 'observation.source.register', 'SRC', null, 'observation'), T(), domainId, { payload: { contract } })) as { source: { sourceId: string } }).source.sourceId;
const approveIn = (domainId: string, sourceId: string) => registryWriteIn(domainId, manager2, 'observation.source.approve', sourceId, async (cap) => { await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId, decision: 'approve', reason: 'the mirror\'s intake (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
const activateIn = (domainId: string, sourceId: string) => registryWriteIn(domainId, manager2, 'observation.source.transition', sourceId, async (cap) => { await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId, target: 'active', reason: 'the mirror\'s intake: active (harness)', eventId: uuidv7(), correlationId: uuidv7() }); });
const intakeSourceIn = async (domainId: string, ceiling: 'internal' | 'confidential' = 'internal', label = 'intake'): Promise<{ sourceId: string; version: number; sourceKey: string }> => {
  const sourceKey = `b16-exchange-${label}-${uuidv7().slice(-8)}`;
  const sourceId = await registerIn(domainId, uploadContract(sourceKey, ceiling));
  await approveIn(domainId, sourceId); await activateIn(domainId, sourceId);
  return { sourceId, version: 1, sourceKey };
};
const setRightsIn = (domainId: string, sourceId: string, rightsState: 'confirmed' | 'withdrawn') =>
  observation.setRights(reqIn(manager2, domainId, 'observation.source.rights', 'SRC', sourceId, 'observation'), T(), domainId, sourceId, { payload: { contractVersion: 1, rightsState, evidence: `publisher notice (harness): ${rightsState}` } });

/* ───────────── the fixtures the cases share ───────────── */
let A: Evd; let B: Evd; let R: Evd; let mA: ManifestRow; let mB: ManifestRow; let mR: ManifestRow;
let C = ''; let edgeOnC = ''; let CR = ''; let edgeOnCR = ''; let ENT = '';
let EV1: Exported; let ER: Exported; let EX1: Exported;
let partnerId = ''; let i1 = { importId: '', map: new Map<string, string>(), manifests: [] as string[] };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { TenancyController: Tc } = await import('../../src/tenancy/tenancy.controller.js');
  retention = h.app.get(Rc); b16 = retention as unknown as B16Routes; observation = h.app.get(Oc); vault = h.app.get(VaultService); egressProvider = h.app.get(DeliveryEgress);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b16-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b16-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b16-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b16-tenant-admin', 'TENANT');
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'resolution_manager'], 'b16-owner');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
  await sql`insert into graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
    values ('DOMAIN', ${T()}::uuid, ${D()}::uuid, 'lei', 'GLEIF', 'Legal Entity Identifier', true, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  // THE MIRROR DOMAIN: a second domain of the tenant through the tenancy route (the tenant administrator's act), with its own people.
  const tenancy = h.app.get(Tc) as TenancyController;
  const envT = { ...(h.req(tenantAdmin, 'tenancy.domain.create', 'CID', null, 'platform.administration') as { eyeEnvelope: Row }).eyeEnvelope, scope: 'TENANT', domain_id: null };
  D2 = ((await tenancy.createDomain({ eyeEnvelope: envT, eyePrincipal: tenantAdmin } as never, T(), { payload: { name: `NORDWERK Exchange Mirror (SYNTHETIC) ${uuidv7().slice(-6)}` } })) as { domain: { id: string } }).domain.id;
  steward2 = await h.humanWithSession(['retention_steward'], 'b16-mirror-steward', 'DOMAIN', { domainId: D2 });
  domainAdmin2 = await h.humanWithSession(['domain_admin'], 'b16-mirror-admin', 'DOMAIN', { domainId: D2 });
  registrar2 = await h.humanWithSession(['domain_analyst'], 'b16-mirror-registrar', 'DOMAIN', { domainId: D2 });
  manager2 = await h.humanWithSession(['collection_manager'], 'b16-mirror-manager', 'DOMAIN', { domainId: D2 });
  // The ports' two-person rules need a principal who HOLDS both acts: one who may open (the mirror's steward) and approve (the tenant's
  // authority); one who may approve (the tenant's administrator) and admit (the mirror's administrator).
  dualOpener = await h.humanWithSession(['retention_authority'], 'b16-dual-opener', 'TENANT', { extraBindings: [{ roleCode: 'retention_steward', domainId: D2 }] });
  dualAdmin = await h.humanWithSession(['tenant_admin'], 'b16-dual-admin', 'TENANT', { extraBindings: [{ roleCode: 'domain_admin', domainId: D2 }] });
  // The recipient: a real TLS server on a loopback port, its self-signed certificate for recipient.b16.invalid the destinations' anchor.
  recipient = spawn(process.execPath, [RECIPIENT, '--self-signed', RECIPIENT_HOST, '--listen', '127.0.0.1:0', '--bearer-env', DST_REF, '--public-key', KEY1_PEM_FILE, '--recipient', 'NORDWERK GmbH — harness https endpoint (B16)', '--store', join(SCRATCH_DIR, 'recipient-store')], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`the recipient did not start: ${out.join('')}`)), 20_000);
    recipient!.stdout!.on('data', (c: Buffer) => {
      out.push(c.toString('utf8'));
      const all = out.join('');
      const cert = /^certificate (.+)$/m.exec(all); const listening = /^listening (https:\/\/[^\s]+)$/m.exec(all);
      if (cert !== null && listening !== null) { recipientCert = readFileSync(cert[1]!, 'utf8'); recipientPort = Number(new URL(listening[1]!).port); clearTimeout(timer); res(); }
    });
    recipient!.stderr!.on('data', (c: Buffer) => out.push(c.toString('utf8')));
    recipient!.on('exit', (code) => { clearTimeout(timer); rej(new Error(`the recipient exited ${code}: ${out.join('')}`)); });
  });
  egressProvider.deliver = harnessEgress;
  await declareKey(tenantAdmin, KEY_REF);
  const endpoint = `https://${RECIPIENT_HOST}:${recipientPort}/receive`;
  await declareDestinationIn(D(), domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'NORDWERK GmbH — harness transfer station (B16)', purpose: 'the disconnected exchange (harness)' });
  await declareDestinationIn(D(), domainAdmin, { destinationKey: HTTPS_KEY, kind: 'https', endpoint, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'NORDWERK GmbH — harness https endpoint (B16)', purpose: 'the https exchange' });
  await declareDestinationIn(D(), domainAdmin, { destinationKey: UNBOUND_KEY, kind: 'https', endpoint, credentialRef: UNBOUND_REF, trustAnchorPem: recipientCert, recipient: 'the same endpoint under a credential this deployment does not bind (harness)', purpose: 'R1(c): nothing leaves the process' });
  await declareDestinationIn(D(), domainAdmin, { destinationKey: POSSIBLE_KEY, kind: 'https', endpoint, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'the same endpoint answering 500 (harness)', purpose: 'R1(d): a failure after the body left' });
  await declareDestinationIn(D(), domainAdmin, { destinationKey: REDIRECT_KEY, kind: 'https', endpoint, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'the same endpoint redirecting after the body (harness)', purpose: 'C1: a redirect after the body left' });
  await declareDestinationIn(D(), domainAdmin, { destinationKey: DNS_KEY, kind: 'https', endpoint, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'the recipient by its .invalid name under the production egress (harness)', purpose: 'R1(e): the name unresolved' });
  // The mirror reads the SAME station directory the origin delivers to: the disconnected import path.
  await declareDestinationIn(D2, domainAdmin2, { destinationKey: STATION_KEY_D2, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'the mirror domain reads the station (harness)', purpose: 'the disconnected import path' });
  intake = await intakeSourceIn(D2);
}, 300_000);

afterAll(async () => {
  delete process.env[KEY_REF]; delete process.env[DST_REF];
  if (recipient !== null) recipient.kill('SIGTERM');
  await h?.close();
  await su?.destroy();
  for (const dir of [VAULT_DIR, STATION_DIR, SCRATCH_DIR]) rmSync(dir, { recursive: true, force: true });
}, 120_000);

describe('V · THE VERSIONED CLOSURE (D8; Codex B15-F1; DP-47-003)', () => {
  it('V1 · C@1 on record A with an edge on it, then C@2 raw → links.json /2 carries BOTH versions, the edge on {C, 1}; the verifier\'s pair check passes; the closure tampered to the B15-F1 counterexample (C@1 removed, the edge still on version 1, re-signed) → the pair check FAILS ("never rebased"); links.json altered in place → the stream route refuses (links digest); a restricted CR@1 with its edge and an internal CR@2 → CR@1 excluded (redaction) WITH the edge excluded (dependency), CR@2 included; a /1 closure hand-built from it → the verifier passes by id and says versions are unvalidated', async () => {
    ({ evd: A, m: mA } = await uploadOne('b16-a')); ({ evd: B, m: mB } = await uploadOne('b16-b')); ({ evd: R, m: mR } = await uploadOne('b16-r'));
    expect(A.digest).not.toBe(A.bytesDigest); // the canonical digest of the row is not the digest of the bytes: the closure resolves by the latter
    const c1 = await seedClaim({ type: 'REL', evidence: A, classification: 'internal', payload: REL_PAYLOAD });
    C = c1.claimId;
    edgeOnC = await assertEdge({ predicate: 'ships_through', claimId: C, claimVersion: 1, evidence: A });
    await seedClaim({ claimId: C, version: 2, type: 'REL', evidence: A, classification: 'internal', payload: { ...REL_PAYLOAD, object_value: 'Bab el-Mandeb Strait (corrected)' } });
    EV1 = await exported([mA.manifest_id]);
    const pkg = packageOf(EV1.dir); const links = linksOfPkg(pkg);
    expect((pkg.manifest['package'] as Row)['links']).toMatchObject({ file: LINKS_FILE, format: LINKS_2, claims: 2, edges: 1, entities: 2, excluded: 0 });
    expect(links).toMatchObject({ format: LINKS_2, package: { action_id: EV1.id }, evidence: [A.id], excluded: [], identifier_systems: [], counts: { claims: 2, edges: 1, entities: 2, excluded: 0 } });
    const claims = links['claims'] as Row[];
    expect(claims.map((c) => [c['object_id'], c['object_version']])).toEqual([[C, 1], [C, 2]]);
    for (const c of claims) {
      expect(c).toMatchObject({ object_type: 'REL', schema_ref: 'REL@v1' });
      expect(c['lineage']).toEqual([expect.objectContaining({ claim_version: c['object_version'], evidence_object_id: A.id, evidence_digest: A.bytesDigest, byte_start: 0, byte_end: 4, mode: 'replay' })]);
      expect(c['referenced_by']).toEqual({ lineage: true, edges: c['object_version'] === 1 ? 1 : 0 });
    }
    expect(links['edges']).toEqual([expect.objectContaining({ edge_id: edgeOnC, predicate: 'ships_through', subject_entity_id: E2, object_entity_id: E1, state: 'asserted', claim: { object_id: C, object_version: 1 }, evidence: { object_id: A.id, digest: A.bytesDigest } })]);
    expect((links['entities'] as Row[]).map((e) => e['entity_id']).sort()).toEqual([E1, E2].sort());
    const vd = await verifyDir(EV1.dir);
    expect(failedChecks(vd.checks)).toEqual([]); expect(vd.ok).toBe(true); expect(vd.closure_format).toBe(LINKS_2);
    expect(linksChecks(vd).map((c) => c.ok)).toEqual([true, true, true]);
    expect(linksChecks(vd)[1]!.detail).toMatch(/2 claim\(s\), 1 edge\(s\), 2 entities, 0 excluded/);
    expect(linksChecks(vd)[2]!.detail).toMatch(/consistent by \(object_id, object_version\)/);
    // THE COUNTEREXAMPLE (B15-F1): a closure that carries one version per id — the latest — while the edge rests on the first. Under /1 this
    // was consistent "by id"; under /2 the edge names a pair the closure does not carry. The manifest is re-signed by the harness key (the
    // sender's own key), so nothing but the pair rule stands between the reader and a rebased edge.
    const bad = clonePkg(pkg); const badLinks = clone(links);
    badLinks['claims'] = (badLinks['claims'] as Row[]).filter((c) => c['object_version'] === 2);
    (badLinks['counts'] as Row)['claims'] = 1;
    setLinks(bad, badLinks); resign(bad.manifest);
    const badDir = writePkg(bad, join(SCRATCH_DIR, 'v1-counterexample'));
    const vb = await verifyDir(badDir);
    expect(vb.ok).toBe(false);
    expect(checkNamed(vb.checks, /^links: every claim version/)).toMatchObject({ ok: false, detail: expect.stringMatching(/never rebased onto another version/) });
    expect(vb.checks.filter((c) => c.ok === false)).toHaveLength(1); // the chain and the signature stand: the pair rule alone caught it
    // links.json altered IN PLACE (the manifest untouched): the product's stream route refuses before any byte — the closure's digest is in the chain.
    const linksBytes = pkg.files.get(LINKS_FILE)!;
    writeFileSync(join(EV1.dir, LINKS_FILE), bad.files.get(LINKS_FILE)!);
    await refused(streamExport(steward, EV1.id, join(SCRATCH_DIR, 'never-v1.tar')), /does not rebuild to its recorded digest/, 409);
    writeFileSync(join(EV1.dir, LINKS_FILE), linksBytes);
    expect((await streamExport(steward, EV1.id, join(SCRATCH_DIR, 'ev1.tar'))).digest).toBe(EV1.archiveDigest);
    // A REQUIRED version above the ceiling: CR@1 restricted with the edge on it, CR@2 internal — the pair is excluded WITH its dependent edge.
    const r1 = await seedClaim({ type: 'REL', evidence: R, classification: 'restricted', payload: REL_PAYLOAD });
    CR = r1.claimId;
    edgeOnCR = await assertEdge({ predicate: 'ships_through', claimId: CR, claimVersion: 1, evidence: R });
    await seedClaim({ claimId: CR, version: 2, type: 'REL', evidence: R, classification: 'internal', payload: { ...REL_PAYLOAD, object_value: 'Bab el-Mandeb Strait (v2)' } });
    ER = await exported([mR.manifest_id]);
    const rp = packageOf(ER.dir); const rl = linksOfPkg(rp);
    expect(rl['counts']).toEqual({ claims: 1, edges: 0, entities: 0, excluded: 2 });
    expect((rl['claims'] as Row[]).map((c) => [c['object_id'], c['object_version']])).toEqual([[CR, 2]]);
    expect(rl['edges']).toEqual([]); expect(rl['entities']).toEqual([]);
    expect(rl['excluded']).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'claim', object_id: CR, object_version: 1, gate: 'redaction' }),
      expect.objectContaining({ kind: 'edge', edge_id: edgeOnCR, claim: { object_id: CR, object_version: 1 }, gate: 'dependency', reason: expect.stringMatching(/excluded \(redaction\)/) }),
    ]));
    const vr = await verifyDir(ER.dir);
    expect(failedChecks(vr.checks)).toEqual([]); expect(linksChecks(vr)[1]!.detail).toMatch(/1 claim\(s\), 0 edge\(s\), 0 entities, 2 excluded/);
    // A /1 closure hand-built from it (one version per id, as B15 wrote it), the manifest restated and re-signed: the verifier passes it BY ID
    // and says so in the check's own name — which exact version an edge rests on is not validated for that format.
    const one = clonePkg(rp);
    const l1: Row = { format: LINKS_1, package: rl['package'], evidence: rl['evidence'], claims: (rl['claims'] as Row[]).map(({ referenced_by: _r, ...c }) => c), edges: [], entities: [], excluded: rl['excluded'], counts: rl['counts'] };
    setLinks(one, l1); resign(one.manifest);
    const v1 = await verifyDir(writePkg(one, join(SCRATCH_DIR, 'v1-format1')));
    expect(failedChecks(v1.checks)).toEqual([]); expect(v1.ok).toBe(true); expect(v1.closure_format).toBe(LINKS_1);
    expect(linksChecks(v1)).toHaveLength(3);
    expect(linksChecks(v1)[2]).toMatchObject({ ok: true, name: expect.stringMatching(/closure format 1/), detail: 'the closure is consistent by id; versions unvalidated' });
  }, 240_000);
});

describe('P · THE EXCHANGE PARTNER (0076 §3; D6, D7; ES-53-004)', () => {
  it('P1 · declared with the harness key\'s PEM and the mirror\'s intake contract → the key id the export\'s signing derives, Ed25519, active; the same key again → refused; the same partner key under another key → refused; an intake contract not active / not an upload contract / rights withdrawn / absent → the port\'s words; a malformed PEM and a bad partner key → 422; retired → listed retired, a second retirement refused; the retired partner\'s key no longer resolves a package (quarantined: no partner holds the key); declared again → it does', async () => {
    const declared = (await declarePartnerFor(KEY1, 'nordwerk-origin')).partner;
    partnerId = String(declared['partner_id']);
    expect(declared).toMatchObject({ partner_key: 'nordwerk-origin', party: 'NORDWERK GmbH (origin domain; harness)', key_id: keyIdOfPair(KEY1), algorithm: 'Ed25519', intake_source_id: intake.sourceId, intake_contract_version: intake.version, state: 'active', retired_at: null, declared_by: domainAdmin2.principalId });
    expect(String(declared['public_key_pem'])).toContain('-----BEGIN PUBLIC KEY-----');
    expect(declared['key_id']).toMatch(/^ed25519:[0-9a-f]{16}$/);
    // The uniqueness among the domain's ACTIVE partners: the key, then the partner key.
    await refused(declarePartnerFor(KEY1, 'nordwerk-origin-again'), /exchange partner rejected: key ed25519:[0-9a-f]{16} is already declared by partner nordwerk-origin/, 409);
    await refused(declarePartnerFor(KEY2, 'nordwerk-origin'), /exchange partner rejected: nordwerk-origin is already declared in this domain/, 409);
    // The intake contract must be an ACTIVE UPLOAD contract with CONFIRMED rights — the contract the imported records are held under.
    const approvedOnly = await registerIn(D2, uploadContract(`b16-intake-approved-${uuidv7().slice(-8)}`, 'internal'));
    await approveIn(D2, approvedOnly);
    await refused(declarePartnerFor(KEY2, 'p1-not-active', { intakeSourceId: approvedOnly }), /exchange partner rejected: the intake source .* is not an active upload contract with confirmed rights \(it is upload, approved, rights confirmed\)/);
    const rest = await registerIn(D2, fixtureContract(`b16-intake-rest-${uuidv7().slice(-8)}`));
    await approveIn(D2, rest); await activateIn(D2, rest);
    await refused(declarePartnerFor(KEY2, 'p1-not-upload', { intakeSourceId: rest }), /exchange partner rejected: the intake source .* is not an active upload contract with confirmed rights \(it is rest, active, rights confirmed\)/);
    const withdrawn = await intakeSourceIn(D2, 'internal', 'withdrawn');
    await setRightsIn(D2, withdrawn.sourceId, 'withdrawn');
    await refused(declarePartnerFor(KEY2, 'p1-rights-withdrawn', { intakeSourceId: withdrawn.sourceId }), /exchange partner rejected: the intake source .* is not an active upload contract with confirmed rights \(it is upload, (active|suspended), rights withdrawn\)/); // withdrawing the rights suspends the contract
    await refused(declarePartnerFor(KEY2, 'p1-no-such-source', { intakeSourceId: uuidv7() }), /exchange partner rejected: no such intake source .* in this domain/, 404);
    // The controller's own shape checks, before any write.
    await refused(declarePartnerFor(KEY2, 'p1-bad-pem', { publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----' }), /publicKeyPem/, 422);
    await refused(declarePartnerFor(KEY2, 'p1-bad-pem-2', { publicKeyPem: 'ssh-ed25519 AAAA' }), /publicKeyPem/, 422);
    await refused(declarePartnerFor(KEY2, 'P1 Not A Key'), /partnerKey/, 422);
    await refused(declarePartnerFor(KEY2, 'p1-no-source', { intakeSourceId: 'not-a-uuid' }), /intakeSourceId/, 422);
    // The list, then the retirement: the row kept with the reason; a second retirement refused; the key no longer resolves a package.
    const before = (await listPartners(steward2)).partners;
    expect(before.map((p) => [p['partner_key'], p['state']])).toEqual([['nordwerk-origin', 'active']]);
    expect(before[0]!['intake']).toMatchObject({ source_id: intake.sourceId, contract_version: 1, source_key: intake.sourceKey, connector_kind: 'upload', lifecycle_state: 'active', rights_state: 'confirmed', classification_ceiling: 'internal' });
    await refused(retirePartner(domainAdmin2, partnerId, 'short'), /reason is at least 8 characters/, 422);
    const retired = (await retirePartner(domainAdmin2, partnerId, 'the key is rotated (harness)')).partner;
    expect(retired).toMatchObject({ partner_id: partnerId, state: 'retired', retire_reason: 'the key is rotated (harness)', retired_by: domainAdmin2.principalId });
    expect(retired['retired_at']).not.toBeNull();
    await refused(retirePartner(domainAdmin2, partnerId, 'retired twice (harness)'), /exchange partner rejected: .* is retired/, 409);
    await refused(retirePartner(domainAdmin2, uuidv7(), 'no such partner (harness)'), /exchange partner rejected: no such partner/, 404);
    expect((await listPartners(steward2)).partners.map((p) => [p['partner_key'], p['state']])).toEqual([['nordwerk-origin', 'retired']]);
    // A package signed by KEY1 opened in the mirror while no ACTIVE partner holds KEY1: quarantined on the partner check.
    const quarantined = await openInline(steward2, tarOfDir(EV1.dir));
    expect(quarantined.verified).toBe(false); expect(quarantined.import['state']).toBe('quarantined');
    expect(checkNamed(quarantined.checks, /^partner/)).toMatchObject({ ok: false, detail: expect.stringMatching(new RegExp(`no exchange partner of this domain holds key ${keyIdOfPair(KEY1)}`)) });
    expect(checkNamed(quarantined.checks, /^signature: the scheme/).ok).toBe(true);
    expect(quarantined.import['partner_id']).toBeNull();
    // Declared again (the retired row stays; the key is free among the active partners): the key resolves.
    const again = (await declarePartnerFor(KEY1, 'nordwerk-origin')).partner;
    partnerId = String(again['partner_id']);
    expect(again).toMatchObject({ partner_key: 'nordwerk-origin', key_id: keyIdOfPair(KEY1), state: 'active' });
    expect((await listPartners(steward2)).partners.map((p) => [p['partner_key'], p['state']])).toEqual([['nordwerk-origin', 'retired'], ['nordwerk-origin', 'active']]);
    // The steward may not declare (the schedule declare's holders: the administrators); the PDP refuses before any write.
    expect((await refused(declarePartner(steward2, { partnerKey: 'p1-declared-by-steward', party: 'x', purpose: 'y', publicKeyPem: KEY2_PEM, intakeSourceId: intake.sourceId, intakeContractVersion: 1 }), /./)).status).toBe(403);
    // THE BINDING MUST DERIVE THE DECLARED KEY: the reference re-bound to KEY2's private half while KEY1 stays the tenant's active key — the
    // build is refused BEFORE the state moves (paused infrastructure/retry, no attempt counted, nothing built), the message naming both key
    // ids; bound back to KEY1, the same action re-resolves and builds. (A package signed by a key the declaration does not record would not
    // verify against the recorded public key — nor against a partner's declaration of it.)
    const mm = await retention.openAction(reqIn(steward, D(), 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload: { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id], classificationCeiling: 'internal' } } }) as { action: { actionId: string } };
    const mmId = mm.action.actionId;
    const mmScope = await retention.resolveScope(reqIn(steward, D(), 'retention.action.resolve', 'RTA', mmId, 'retention'), T(), D(), mmId) as { scope: Row };
    await retention.approve(reqIn(authority, D(), 'retention.action.approve', 'RTA', mmId, 'retention'), T(), D(), mmId, { payload: { scopeDigest: String(mmScope.scope['scope_digest']), rationale: 'the mismatch control approved (harness)' } });
    const boundKey1 = process.env[KEY_REF]!;
    process.env[KEY_REF] = (KEY2.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
    try {
      await refused(retention.execute(reqIn(steward, D(), 'retention.action.execute', 'RTA', mmId, 'retention'), T(), D(), mmId), new RegExp(`retention execution rejected \\(signing_key_mismatch\\): the reference ${KEY_REF} bound in this deployment derives ${keyIdOfPair(KEY2)}, not the tenant's active export signing key ${keyIdOfPair(KEY1)}; the package was not built`), 409);
    } finally {
      process.env[KEY_REF] = boundKey1;
    }
    const mmRow = (await sql<{ state: string; failure_class: string | null; disposition: string | null; attempts: number; failure_reason: string | null }>`select state, failure_class, disposition, attempts::int, failure_reason from retention.actions_current where action_id = ${mmId}::uuid`.execute(su)).rows[0]!;
    expect(mmRow).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry', attempts: 0 });
    expect(String(mmRow.failure_reason)).toMatch(/^retention execution rejected \(signing_key_mismatch\)/);
    expect(await exportRow(mmId)).toBeUndefined();
    const mmAgain = await retention.resolveScope(reqIn(steward, D(), 'retention.action.resolve', 'RTA', mmId, 'retention'), T(), D(), mmId) as { scope: Row };
    await retention.approve(reqIn(authority, D(), 'retention.action.approve', 'RTA', mmId, 'retention'), T(), D(), mmId, { payload: { scopeDigest: String(mmAgain.scope['scope_digest']), rationale: 'the mismatch control re-approved (harness)' } });
    expect(((await retention.execute(reqIn(steward, D(), 'retention.action.execute', 'RTA', mmId, 'retention'), T(), D(), mmId)) as { execution: Row }).execution).toMatchObject({ executed: 1, refused: 0, held: 0 });
    expect((await exportRow(mmId)).package_digest).toMatch(HEX64);
  }, 240_000);
});

describe('I · THE GOVERNED IMPORT (0076 §4; D1–D5; DP-47-001/-002/-003/-006, DZ-17, ES-53-004)', () => {
  it('I1 · THE ROUND TRIP: the origin export E1 (A and B: the versioned closure, an ENT claim on B with an authoritative identifier, the edge) streamed through the real route → the mirror opens it inline with the exchange → VERIFIED; the opener does not approve (the port; the PDP for the steward), a wrong digest refused, approved on the digest; the approver does not admit (the port; the PDP for the authority); the steward admits → ADMITTED under NEW ids with the versions preserved, imported_from complete, the manifests under the intake contract, custody.imported, the bytes downloadable in the mirror (custody.retrieved naming the intake), the lineage rows, the edge on (C\', 1), the entities, the identifier system and the identifier, no projection drift, the quarantine copies tombstoned, the receipt; the mirror\'s re-export E2 → the compare tool proves the round trip', async () => {
    const ent = await seedClaim({ type: 'ENT', evidence: B, classification: 'internal', payload: ENT_PAYLOAD });
    ENT = ent.claimId;
    await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', ${LEI}, ${ENT}::uuid, ${B.id}::uuid, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    EX1 = await exported([mA.manifest_id, mB.manifest_id]);
    const originLinks = linksOfPkg(packageOf(EX1.dir));
    expect(originLinks['counts']).toEqual({ claims: 3, edges: 1, entities: 2, excluded: 0 });
    expect(originLinks['identifier_systems']).toEqual([{ system_key: 'lei', authority: 'GLEIF', description: 'Legal Entity Identifier', is_authoritative: true }]);
    expect((originLinks['entities'] as Row[]).find((e) => e['entity_id'] === E2)).toMatchObject({ identifiers: [{ system_key: 'lei', value: LEI, source_claim_object_id: ENT, source_evidence_object_id: B.id }] });
    // The tar through the real route (the bytes the customer receives), then the mirror's OPEN act, inline, with the exchange statement.
    const tarFile = join(SCRATCH_DIR, `${EX1.id}.tar`);
    expect(await streamExport(steward, EX1.id, tarFile)).toMatchObject({ status: 200, digest: EX1.archiveDigest });
    const tar = readFileSync(tarFile);
    const exchange = { action_id: EX1.id, package_digest: EX1.packageDigest, archive_digest: EX1.archiveDigest, expires_at: EX1.expiresAt };
    const opened = await openInline(dualOpener, tar, exchange);
    const importId = String(opened.import['import_id']);
    expect(failedChecks(opened.checks)).toEqual([]);
    expect(opened.verified).toBe(true); expect(opened.import['state']).toBe('verified');
    expect(opened.checks.length).toBeGreaterThanOrEqual(15);
    for (const re of [/^archive/, /^manifest/, /^integrity/, /^re-import/, /^completeness/, /^chain/, /^signature: the scheme/, /^partner/, /^signature: the Ed25519/, /^links: links\.json/, /^links: every/, /^policy/, /^duplicate/, /^revocation/, /^origin exclusions/]) expect(checkNamed(opened.checks, re).ok, String(re)).not.toBe(false);
    // The origin is THIS installation: the revocation check is a fact here (neither revoked nor expired), not a note.
    expect(checkNamed(opened.checks, /^revocation/).ok).toBe(true);
    const policy = checkNamed(opened.checks, /^policy/);
    expect(`${policy.name} ${policy.detail ?? ''}`).toMatch(/2 records? and 3 claim versions? within it, 0 above it/);
    const row = (await importRow(importId))!;
    expect(row).toMatchObject({ state: 'verified', verified: true, partner_id: partnerId, package_digest: EX1.packageDigest, archive_digest: EX1.archiveDigest, archive_size: tar.byteLength, intake: { kind: 'inline' }, opened_by: dualOpener.principalId, approved_by: null, admitted_by: null });
    expect(row.origin).toMatchObject({ tenant_id: T(), domain_id: D(), action_id: EX1.id, package_digest: EX1.packageDigest, key_id: keyIdOfPair(KEY1) }); // what the MANIFEST states; the archive digest is the row's own (computed here)
    expect(row.exchange).toMatchObject(exchange);
    expect(await blobExists('quarantine', D2, String(row.manifest_locator))).toBe(true); expect(await blobExists('quarantine', D2, String(row.links_locator))).toBe(true);
    const staged = await importItems(importId);
    expect(staged.every((i) => i.disposition === 'staged' && i.admitted === null)).toBe(true);
    expect(staged.filter((i) => i.kind === 'record').map((i) => i.origin_ref).sort()).toEqual([`${A.id}@1`, `${B.id}@1`].sort());
    expect(staged.filter((i) => i.kind === 'claim').map((i) => i.origin_ref).sort()).toEqual([`${C}@1`, `${C}@2`, `${ENT}@1`].sort());
    expect(staged.filter((i) => i.kind === 'entity').map((i) => i.origin_ref).sort()).toEqual([`entity:${E1}`, `entity:${E2}`].sort());
    expect(staged.filter((i) => i.kind === 'edge').map((i) => i.origin_ref)).toEqual([`edge:${edgeOnC}`]);
    expect(staged.filter((i) => i.kind === 'identifier_system').map((i) => i.origin_ref)).toEqual(['system:lei']);
    expect(staged.filter((i) => i.kind === 'identifier').map((i) => i.origin_ref)).toEqual([`identifier:lei:${LEI}`]);
    for (const i of staged.filter((x) => x.kind === 'record')) { expect(String(i.planned['object_id'])).toMatch(UUID); expect(i.planned['object_id']).not.toBe(i.origin_ref.split('@')[0]); expect(String(i.staged?.['quarantine_locator'])).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/); }
    expect((await importEvents(importId)).map((e) => e.event)).toEqual(['import.opened', 'import.verified']);
    // THE APPROVAL: never the opener (the port, on a principal who holds both acts; the PDP for the plain steward), on the package digest, verified imports only.
    await refused(approveImport(dualOpener, importId, EX1.packageDigest), /retention import rejected: the opener of an import does not approve it/, 403);
    expect((await refused(approveImport(steward2, importId, EX1.packageDigest), /./)).status).toBe(403);
    await refused(approveImport(authority, importId, 'f'.repeat(64)), /retention import rejected: the digest approved \(f{64}\) is not the package's/, 409);
    await refused(approveImport(authority, importId, EX1.packageDigest, 'short'), /rationale is at least 8 characters/, 422);
    await refused(admitImport(steward2, importId), /retention import rejected: import .* is verified, not approved/, 409);
    const approved = (await approveImport(dualAdmin, importId, EX1.packageDigest, 'the package digest as read (harness)')).import;
    expect(approved).toMatchObject({ state: 'approved', approved_by: dualAdmin.principalId, approval_rationale: 'the package digest as read (harness)' });
    await refused(approveImport(authority, importId, EX1.packageDigest), /retention import rejected: import .* is approved, not verified/, 409);
    // THE ADMISSION: never the approver (the port; the PDP for the authority); the steward admits.
    await refused(admitImport(dualAdmin, importId), /retention import rejected: the approver of an import does not admit it/, 403);
    expect((await refused(admitImport(authority, importId), /./)).status).toBe(403);
    const admitted = await admitImport(steward2, importId);
    expect(admitted.import).toMatchObject({ state: 'admitted', admitted_by: steward2.principalId });
    expect(admitted.batches.length).toBeGreaterThanOrEqual(3);
    for (const b of admitted.batches) expect(b).toMatchObject({ kind: expect.any(String), count: expect.any(Number), policyDecisionId: expect.stringMatching(UUID), auditSeq: expect.any(Number) });
    const detail = await getImport(steward2, importId);
    expect(detail.import['state']).toBe('admitted');
    const items = detail.items;
    const itemOf = (kind: string, originRef: string): Row => { const i = items.find((x) => x['kind'] === kind && x['origin_ref'] === originRef); expect(i, `${kind} ${originRef}`).toBeDefined(); return i!; };
    expect(items.every((i) => i['disposition'] !== 'staged')).toBe(true);
    expect(items.filter((i) => i['disposition'] === 'admitted')).toHaveLength(items.length);
    // THE MAP: every origin id → a NEW id of the mirror; the version numbers preserved. The records first.
    const map = new Map<string, string>(); const manifests: string[] = [];
    for (const [evd, m] of [[A, mA], [B, mB]] as const) {
      const adm = itemOf('record', `${evd.id}@1`)['admitted'] as Row;
      const newId = String(adm['object_id']); const newManifest = String(adm['manifest_id']);
      expect(newId).toMatch(UUID); expect(newId).not.toBe(evd.id); expect(newManifest).toMatch(UUID); expect(newManifest).not.toBe(m.manifest_id);
      expect(adm).toMatchObject({ object_version: 1, locator: expect.stringMatching(new RegExp(`^${T()}/${D2}/`)) });
      map.set(evd.id, newId); map.set(m.manifest_id, newManifest); manifests.push(newManifest);
      const rows = await objectRows(newId); expect(rows).toHaveLength(1);
      const r = rows[0]!; const origin = (await objectRows(evd.id))[0]!;
      expect(r).toMatchObject({ object_type: 'EVD', object_version: 1, domain_id: D2, schema_ref: IMPORT_FORMS[origin.schema_ref], classification: 'internal', provenance_ref: `SRC:${intake.sourceId}@${intake.version}`, lifecycle_state: origin.lifecycle_state, accountable_owner: `principal:${steward2.principalId}` });
      expect(r.source_object_ids).toContain(`import:${importId}`);
      expect(r.content_digest).not.toBe(origin.content_digest); // a new header, a new canonical digest — the origin's travels in imported_from
      const from = r.payload['imported_from'] as Row;
      expect(from).toMatchObject({ format: 'eye-import-provenance/1', import_id: importId, partner_key: 'nordwerk-origin',
        package: { tenant_id: T(), domain_id: D(), action_id: EX1.id, package_digest: EX1.packageDigest, archive_digest: EX1.archiveDigest, manifest_digest: EX1.manifestDigest, signature: { scheme: KEY_SIGNATURE_SCHEME, key_id: keyIdOfPair(KEY1) } },
        object: { object_id: evd.id, object_version: 1, object_type: 'EVD', schema_ref: origin.schema_ref, content_digest: origin.content_digest } });
      expect(typeof from['imported_at']).toBe('string');
      expect(from['header']).toMatchObject({ object_id: evd.id, object_version: '1', tenant_id: T(), domain_id: D(), provenance_ref: origin.provenance_ref, recorded_at: expect.any(String) });
      expect(from['payload']).toEqual(origin.payload);
      // The payload: the origin's, its uuids remapped, the manifest and the locator the mirror's own.
      const { imported_from: _from, ...rest } = r.payload; void _from;
      const remapped = remapUuids(origin.payload, map);
      expect(rest['manifest_id']).toBe(newManifest); expect(String(rest['locator'])).toMatch(new RegExp(`^${T()}/${D2}/`));
      for (const k of Object.keys(origin.payload)) if (k !== 'manifest_id' && k !== 'locator') expect(rest[k], k).toEqual(remapped[k]);
      expect(rest['content_digest']).toBe(evd.bytesDigest);
      // The manifest under the INTAKE contract; custody.imported; the bytes downloadable in the mirror through the evidence route — custody.retrieved naming the intake (N1).
      expect(await manifestRow(newManifest)).toMatchObject({ source_id: intake.sourceId, contract_version: intake.version, content_digest: evd.bytesDigest, byte_length: m.byte_length, domain_id: D2, classification: 'internal' });
      const imp = await custody(newManifest, 'custody.imported');
      expect(imp).toHaveLength(1);
      expect(imp[0]).toMatchObject({ source_id: intake.sourceId, contract_version: intake.version, content_digest: evd.bytesDigest, actor: `principal:${steward2.principalId}` });
      expect(imp[0]!.details).toMatchObject({ import_id: importId, partner_key: 'nordwerk-origin', origin: expect.objectContaining({ object_id: evd.id, object_version: 1, action_id: EX1.id, package_digest: EX1.packageDigest }) });
      const dl = (await downloadIn(D2, steward2, newId)).download;
      expect(dl.integrity).toBe('verified'); expect(dl.byteLength).toBe(m.byte_length);
      expect(sha256(Buffer.from(dl.base64, 'base64'))).toBe(evd.bytesDigest);
      const ret = await custody(newManifest, 'custody.retrieved');
      expect(ret).toHaveLength(1); expect(ret[0]).toMatchObject({ source_id: intake.sourceId, contract_version: intake.version });
      expect(await blobExists('evidence', D2, String(adm['locator']))).toBe(true);
    }
    // The claims: C'@1 and C'@2 under ONE new id, ENT'@1; their lineage rows naming the NEW record id and the bytes digest.
    const c1 = itemOf('claim', `${C}@1`)['admitted'] as Row; const c2 = itemOf('claim', `${C}@2`)['admitted'] as Row; const en = itemOf('claim', `${ENT}@1`)['admitted'] as Row;
    const Cn = String(c1['object_id']); const ENTn = String(en['object_id']);
    expect(Cn).toMatch(UUID); expect(Cn).not.toBe(C); expect(c2['object_id']).toBe(Cn); expect([c1['object_version'], c2['object_version']]).toEqual([1, 2]);
    expect(ENTn).toMatch(UUID); expect(ENTn).not.toBe(ENT); expect(ENTn).not.toBe(Cn);
    map.set(C, Cn); map.set(ENT, ENTn);
    const cRows = await objectRows(Cn);
    expect(cRows.map((r) => r.object_version)).toEqual([1, 2]);
    for (const r of cRows) {
      const origin = (await objectRows(C)).find((o) => o.object_version === r.object_version)!;
      expect(r).toMatchObject({ object_type: 'REL', domain_id: D2, schema_ref: IMPORT_FORMS['REL@v1'], classification: 'internal', evidence_refs: [`EVD:${map.get(A.id)}@1`], correction_of: r.object_version === 2 ? `${Cn}@1` : null });
      expect(r.source_object_ids).toEqual(expect.arrayContaining([map.get(A.id), `import:${importId}`]));
      expect(r.payload['imported_from']).toMatchObject({ object: { object_id: C, object_version: r.object_version, object_type: 'REL', schema_ref: 'REL@v1', content_digest: origin.content_digest }, header: expect.objectContaining({ object_id: C }), payload: origin.payload });
      expect(r.payload['lineage']).toMatchObject({ evidence_object_id: map.get(A.id), evidence_digest: A.bytesDigest });
      expect(r.payload['subject']).toBe(REL_PAYLOAD.subject);
    }
    expect((await lineageRows(Cn)).map((l) => [l.claim_version, l.evidence_object_id, l.evidence_digest, l.domain_id, l.byte_start, l.byte_end, l.mode])).toEqual([[1, map.get(A.id), A.bytesDigest, D2, 0, 4, 'replay'], [2, map.get(A.id), A.bytesDigest, D2, 0, 4, 'replay']]);
    expect((await lineageRows(ENTn)).map((l) => [l.claim_version, l.evidence_object_id, l.evidence_digest, l.domain_id])).toEqual([[1, map.get(B.id), B.bytesDigest, D2]]);
    // The graph: the entities, the identifier system, the identifier and the edge on (C', 1) — never rebased; the projections rebuilt without drift.
    const e1n = String((itemOf('entity', `entity:${E1}`)['admitted'] as Row)['entity_id']); const e2n = String((itemOf('entity', `entity:${E2}`)['admitted'] as Row)['entity_id']);
    expect(e1n).toMatch(UUID); expect(e2n).toMatch(UUID); expect(e1n).not.toBe(E1); expect(e2n).not.toBe(E2);
    map.set(E1, e1n); map.set(E2, e2n);
    expect((await entitiesIn(D2)).map((e) => [e.entity_id, e.entity_type, e.canonical_name, e.lifecycle_state]).sort()).toEqual([[e1n, 'place', 'Bab el-Mandeb Strait', 'active'], [e2n, 'organization', 'NORDWERK Magnet GmbH', 'active']].sort());
    expect(await identifierSystemsIn(D2)).toEqual([{ system_key: 'lei', authority: 'GLEIF', is_authoritative: true }]);
    expect(await identifiersIn(D2)).toEqual([{ entity_id: e2n, system_key: 'lei', identifier_value: LEI, source_claim_object_id: ENTn, source_evidence_object_id: map.get(B.id) }]);
    expect(['admitted', 'reused']).toContain(String(itemOf('identifier_system', 'system:lei')['disposition']));
    expect(String((itemOf('identifier', `identifier:lei:${LEI}`)['admitted'] as Row)['identifier_id'])).toMatch(UUID);
    const edgeN = String((itemOf('edge', `edge:${edgeOnC}`)['admitted'] as Row)['edge_id']);
    expect(edgeN).toMatch(UUID); expect(edgeN).not.toBe(edgeOnC);
    map.set(edgeOnC, edgeN);
    const edges = await edgesIn(D2);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ edge_id: edgeN, subject_entity_id: e2n, object_entity_id: e1n, predicate: 'ships_through', claim_object_id: Cn, claim_version: 1, evidence_object_id: map.get(A.id), evidence_digest: A.bytesDigest, state: 'asserted', mode: 'replay' });
    const proj = (await h.pipeline.consequentialRead(envIn(domainAdmin2, D2, 'graph.read', 'ENT', null, 'graph'), domainAdmin2, routeIn(D2, 'graph.read', 'ENT', null), GraphCapability.read, async (cap) => cap.rebuildProjections())).result;
    expect(proj.length).toBeGreaterThan(0);
    for (const r of proj) expect(Number(r.mismatched), `${r.projection} drifted from its event log`).toBe(0);
    // The quarantine copies of the ADMITTED records tombstoned after the commit; manifest.json and links.json kept; the events; the receipt.
    for (const i of items.filter((x) => x['kind'] === 'record')) expect(await blobExists('quarantine', D2, String((i['staged'] as Row)['quarantine_locator']))).toBe(false);
    const after = (await importRow(importId))!;
    expect(after).toMatchObject({ state: 'admitted', admitted_by: steward2.principalId, attempts: 1 });
    expect(await blobExists('quarantine', D2, String(after.manifest_locator))).toBe(true); expect(await blobExists('quarantine', D2, String(after.links_locator))).toBe(true);
    const ev = (await importEvents(importId)).map((e) => e.event);
    expect(ev.slice(0, 4)).toEqual(['import.opened', 'import.verified', 'import.approved', 'import.admission_started']);
    expect(ev.filter((e) => e === 'import.batch_admitted').length).toBeGreaterThanOrEqual(3);
    expect(ev.slice(-2)).toEqual(['import.admitted', 'import.finalized']);
    expect((await importEvents(importId)).at(-1)!.details).toMatchObject({ tombstoned: 2 });
    expect(detail.importReceipt).toMatchObject({ receipt_id: importId, action_id: EX1.id, recipient: `import:${T()}/${D2}`, archive_digest: EX1.archiveDigest, package_digest: EX1.packageDigest, verified: true, import_id: importId, state: 'admitted' });
    expect(detail.partner).toMatchObject({ partner_id: partnerId, partner_key: 'nordwerk-origin' });
    expect((await listImports(steward2)).imports.map((i) => i['import_id'])).toContain(importId);
    i1 = { importId, map, manifests };
    // THE RE-EXPORT from the mirror: the ordinary customer export of the imported manifests; the customer's compare tool proves the round trip.
    const E2x = await exportedIn(D2, steward2, manifests);
    const reLinks = linksOfPkg(packageOf(E2x.dir));
    expect(reLinks['counts']).toEqual({ claims: 3, edges: 1, entities: 2, excluded: 0 });
    expect((reLinks['claims'] as Row[]).map((c) => [c['object_id'], c['object_version']]).sort()).toEqual([[Cn, 1], [Cn, 2], [ENTn, 1]].sort());
    expect(reLinks['edges']).toEqual([expect.objectContaining({ edge_id: edgeN, claim: { object_id: Cn, object_version: 1 }, evidence: { object_id: map.get(A.id), digest: A.bytesDigest } })]);
    expect(reLinks['identifier_systems']).toEqual([expect.objectContaining({ system_key: 'lei', authority: 'GLEIF', is_authoritative: true })]);
    expect(failedChecks((await verifyDir(E2x.dir)).checks)).toEqual([]);
    const mapFile = join(SCRATCH_DIR, `${importId}.import.json`);
    writeFileSync(mapFile, JSON.stringify(detail));
    const cmp = await run([COMPARE, '--origin', EX1.dir, '--reexport', E2x.dir, '--map', mapFile, '--origin-public-key', KEY1_PEM_FILE, '--reexport-public-key', KEY1_PEM_FILE]);
    expect(cmp.code, `${cmp.stdout}\n${cmp.stderr}`).toBe(0);
    expect(cmp.stdout).toMatch(/ROUND TRIP OK: 2 records, 3 claim versions, 1 edges?, 2 entities/);
  }, 300_000);

  it('I2 · REFUSALS WITH THE EVIDENCE PRESERVED: (a) a key no partner holds → quarantined, the manifest kept, the records drained, then the partner declared → verified; (b) a flipped .bin; (c) links.json tampered; (d) a /1 package; (e) a confidential record under the internal intake → excluded (ceiling) at admission; (f) NEVER REBASED at verification (the pair check) and at admission (the edge refused, dependency); (g) the same package again (duplicate); (h) the origin package revoked, and an origin unknown here (a note, C2b); (i) the station intake with delivery.json, a revocation.json at the station (C2c), a symlinked package.tar (C4), a header the port refuses (C3); (j) the withdrawal (the ledger kept, the copies tombstoned — C5), admit and approve refused on withdrawn and quarantined imports', async () => {
    // (a) A package signed by KEY2, which no partner of the mirror holds: quarantined on the partner check; the manifest's quarantine copy kept
    // as the evidence of the refusal; the record entries DRAINED — their digests and sizes recorded, nothing stored (C5: a package no partner
    // vouches for does not fill the quarantine). The same package digest as the KEY1-signed package: the signature is outside the chain.
    const EA = await exported([mB.manifest_id]);
    const byKey2 = clonePkg(packageOf(EA.dir)); resign(byKey2.manifest, KEY2);
    expect((byKey2.manifest['signature'] as Row)['package_digest']).toBe(EA.packageDigest);
    const qBefore = quarantineCount(D2);
    const qa = await openInline(steward2, tarOfPkg(byKey2));
    const qaId = String(qa.import['import_id']);
    expect(qa.verified).toBe(false); expect(qa.import['state']).toBe('quarantined');
    expect(checkNamed(qa.checks, /^partner/)).toMatchObject({ ok: false, detail: expect.stringMatching(new RegExp(`no exchange partner of this domain holds key ${keyIdOfPair(KEY2)}`)) });
    expect(checkNamed(qa.checks, /^chain/).ok).toBe(true); expect(checkNamed(qa.checks, /^signature: the scheme/).ok).toBe(true);
    // C5: the closure arrived AFTER the manifest checks failed — drained, not read; the check says so rather than calling the closure unparsable.
    expect(checkNamed(qa.checks, /^links: links\.json is present/)).toMatchObject({ ok: null, detail: expect.stringMatching(/not checked: links\.json arrived after the manifest checks failed and was drained/) });
    expect(checkNamed(qa.checks, /^links: every claim version/)).toMatchObject({ ok: null, detail: expect.stringMatching(/not checked: links\.json was drained after the manifest checks failed/) });
    const qaRow = (await importRow(qaId))!;
    expect(qaRow).toMatchObject({ state: 'quarantined', verified: false, partner_id: null, package_digest: EA.packageDigest, archive_digest: sha256(tarOfPkg(byKey2)) });
    expect(await blobExists('quarantine', D2, String(qaRow.manifest_locator))).toBe(true);
    const qaRecords = (await importItems(qaId)).filter((i) => i.kind === 'record');
    expect(qaRecords).toHaveLength(1);
    for (const i of qaRecords) {
      expect(i.staged === null || i.staged['quarantine_locator'] === null, 'a drained entry stores nothing').toBe(true);
      if (i.staged !== null) expect(i.staged).toMatchObject({ digest: mB.content_digest, size: mB.byte_length, file: `${mB.manifest_id}.bin` });
    }
    expect(quarantineCount(D2) - qBefore).toBeLessThanOrEqual(2);
    expect((await importEvents(qaId)).map((e) => e.event)).toEqual(['import.opened', 'import.quarantined']);
    expect((await importEvents(qaId))[1]!.details).toMatchObject({ failed: expect.arrayContaining([expect.objectContaining({ ok: false })]) });
    // (b) A .bin flipped in the tar: the integrity check names the file; (c) links.json tampered (the manifest untouched): the closure's digest
    // check; (d) a /1 package (the digest chain alone): the scheme check — an import admits key-signed packages only.
    const flipped = clonePkg(packageOf(EA.dir)); const bin = `${mB.manifest_id}.bin`; const orig = flipped.files.get(bin)!;
    flipped.files.set(bin, Buffer.concat([orig.subarray(0, 1), Buffer.from([orig[1]! ^ 0x01]), orig.subarray(2)]));
    const qb = await openInline(steward2, tarOfPkg(flipped));
    expect(qb.import['state']).toBe('quarantined');
    expect(checkNamed(qb.checks, /^integrity/)).toMatchObject({ ok: false, detail: expect.stringContaining(bin) });
    const tl = clonePkg(packageOf(EA.dir));
    tl.files.set(LINKS_FILE, Buffer.from(tl.files.get(LINKS_FILE)!.toString('utf8').replace('"claims"', '"claims_"'), 'utf8'));
    const qc = await openInline(steward2, tarOfPkg(tl));
    expect(qc.import['state']).toBe('quarantined');
    expect(checkNamed(qc.checks, /^links: links\.json/).ok).toBe(false);
    const one = clonePkg(packageOf(EA.dir)); chainOnly(one.manifest);
    const qd = await openInline(steward2, tarOfPkg(one));
    expect(qd.import['state']).toBe('quarantined');
    expect(checkNamed(qd.checks, /^signature: the scheme/)).toMatchObject({ ok: false, detail: expect.stringMatching(/digest chain alone|key-signed packages only/) });
    // (a, continued) The partner for KEY2 declared: the same package opened again → verified, under that partner.
    const second = (await declarePartnerFor(KEY2, 'second-party')).partner;
    const va = await openInline(steward2, tarOfPkg(byKey2));
    expect(va.verified, failedChecks(va.checks).join(' | ')).toBe(true);
    expect(va.import).toMatchObject({ state: 'verified', partner_id: second['partner_id'], package_digest: EA.packageDigest });
    const secondPartyImport = String(va.import['import_id']);
    // (e) A CONFIDENTIAL record (E) beside A, exported under the confidential ceiling; the mirror's intake ceiling is internal → verified with the
    // exclusion counted; admitted with E EXCLUDED (ceiling), A and its closure REUSED (already admitted from E1: the same origin ids and digests).
    const { evd: Ec, m: mE } = await uploadOne('b16-e', 'confidential');
    expect(mE.classification).toBe('confidential');
    const EE = await exported([mA.manifest_id, mE.manifest_id], 'confidential');
    const oe = await openInline(steward2, tarOfDir(EE.dir));
    expect(oe.verified, failedChecks(oe.checks).join(' | ')).toBe(true);
    const pe = checkNamed(oe.checks, /^policy/);
    expect(`${pe.name} ${pe.detail ?? ''}`).toMatch(/1 records? and 2 claim versions? within it, 1 above it/);
    const { detail: de } = await imported(oe);
    const ie = (kind: string, ref: string): Row => { const i = de.items.find((x) => x['kind'] === kind && x['origin_ref'] === ref); expect(i, `${kind} ${ref}`).toBeDefined(); return i!; };
    expect(ie('record', `${Ec.id}@1`)).toMatchObject({ disposition: 'excluded', gate: 'ceiling', reason: expect.stringMatching(/confidential/) });
    expect(ie('record', `${A.id}@1`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: i1.map.get(A.id), object_version: 1 }) });
    expect(ie('claim', `${C}@1`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: i1.map.get(C), object_version: 1 }) });
    expect(ie('claim', `${C}@2`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: i1.map.get(C), object_version: 2 }) });
    expect(ie('edge', `edge:${edgeOnC}`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ edge_id: i1.map.get(edgeOnC) }) });
    expect(ie('entity', `entity:${E2}`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ entity_id: i1.map.get(E2) }) });
    expect(de.items.filter((i) => i['disposition'] === 'excluded')).toHaveLength(1);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where domain_id = ${D2}::uuid and payload -> 'imported_from' -> 'object' ->> 'object_id' = ${Ec.id}`.execute(su)).rows[0]!.n).toBe('0');
    expect(await blobExists('quarantine', D2, String((ie('record', `${Ec.id}@1`)['staged'] as Row)['quarantine_locator']))).toBe(true); // the excluded record's copy stays: the evidence
    expect(await edgesIn(D2)).toHaveLength(1);
    // (f) NEVER REBASED. At verification: the closure of EV1 tampered so that the edge rests on a version the closure does not carry (C@1's
    // entry removed, the edge still on version 1, re-signed by the sender's key) → the pair check fails, the offender named; quarantined.
    const rebased = clonePkg(packageOf(EV1.dir)); const rl = linksOfPkg(rebased);
    rl['claims'] = (rl['claims'] as Row[]).filter((c) => c['object_version'] === 2); (rl['counts'] as Row)['claims'] = 1;
    setLinks(rebased, rl); resign(rebased.manifest);
    const qf = await openInline(steward2, tarOfPkg(rebased));
    expect(qf.import['state']).toBe('quarantined');
    expect(checkNamed(qf.checks, /^links: every/)).toMatchObject({ ok: false, detail: expect.stringContaining(C) });
    expect(checkNamed(qf.checks, /^links: links\.json/).ok).toBe(true); // the tampered closure is the one the re-signed manifest names: only the pair rule catches it
    // At admission: CF@1 CONFIDENTIAL with the edge on it, CF@2 internal, exported under the confidential ceiling (both carried, the edge on
    // version 1); under the internal intake CF@1 is excluded (ceiling) and the edge is REFUSED (dependency) — never rebased onto CF@2, which is admitted.
    const { evd: F, m: mF } = await uploadOne('b16-f');
    const cf = await seedClaim({ type: 'REL', evidence: F, classification: 'confidential', payload: REL_PAYLOAD });
    const CF = cf.claimId;
    const edgeOnCF = await assertEdge({ predicate: 'ships_through', claimId: CF, claimVersion: 1, evidence: F });
    await seedClaim({ claimId: CF, version: 2, type: 'REL', evidence: F, classification: 'internal', payload: { ...REL_PAYLOAD, object_value: 'Bab el-Mandeb Strait (v2)' } });
    const EF = await exported([mF.manifest_id], 'confidential');
    expect(linksOfPkg(packageOf(EF.dir))['counts']).toEqual({ claims: 2, edges: 1, entities: 2, excluded: 0 });
    const of = await openInline(steward2, tarOfDir(EF.dir));
    expect(of.verified, failedChecks(of.checks).join(' | ')).toBe(true);
    const pf = checkNamed(of.checks, /^policy/);
    expect(`${pf.name} ${pf.detail ?? ''}`).toMatch(/1 records? and 1 claim versions? within it, 1 above it/);
    const { detail: df } = await imported(of);
    const fi = (kind: string, ref: string): Row => { const i = df.items.find((x) => x['kind'] === kind && x['origin_ref'] === ref); expect(i, `${kind} ${ref}`).toBeDefined(); return i!; };
    expect(fi('record', `${F.id}@1`)['disposition']).toBe('admitted');
    expect(fi('claim', `${CF}@1`)).toMatchObject({ disposition: 'excluded', gate: 'ceiling' });
    expect(fi('claim', `${CF}@2`)).toMatchObject({ disposition: 'admitted', admitted: expect.objectContaining({ object_version: 2 }) });
    const CFn = String((fi('claim', `${CF}@2`)['admitted'] as Row)['object_id']);
    expect(CFn).toMatch(UUID); expect(CFn).not.toBe(CF);
    expect((await objectRows(CFn)).map((r) => [r.object_version, r.domain_id])).toEqual([[2, D2]]);
    expect(fi('edge', `edge:${edgeOnCF}`)).toMatchObject({ disposition: 'refused', gate: 'dependency', reason: expect.stringMatching(/not admitted|excluded|never rebased/) });
    expect(await edgesIn(D2)).toHaveLength(1); // I1's edge alone: the edge on CF@1 was not rebased onto CF'@2
    expect((await lineageRows(CFn)).map((l) => [l.claim_version, l.evidence_object_id])).toEqual([[2, String((fi('record', `${F.id}@1`)['admitted'] as Row)['object_id'])]]);
    // (g) The same package (E1) opened again: the duplicate check names the live import.
    const og = await openInline(steward2, readFileSync(join(SCRATCH_DIR, `${EX1.id}.tar`)));
    expect(og.import['state']).toBe('quarantined');
    expect(checkNamed(og.checks, /^duplicate/)).toMatchObject({ ok: false, detail: expect.stringContaining(i1.importId) });
    // (h) The origin package REVOKED before the import (the tar captured before its bytes went): the revocation check fails on the origin's own record.
    const EH = await exported([mB.manifest_id]); const tarH = tarOfDir(EH.dir);
    expect((await revokeExport(authority, EH.id, 'revoked before any import (harness)')).revocation['recipients']).toEqual([]);
    const oh = await openInline(steward2, tarH);
    expect(oh.import['state']).toBe('quarantined');
    expect(checkNamed(oh.checks, /^revocation/)).toMatchObject({ ok: false, detail: expect.stringMatching(/revoked this package at/) });
    // An origin UNKNOWN here (C2b): the action id rewritten in the package block and in bound_to, re-signed — a package this installation never
    // built. The revocation check is a NOTE (ok null), never a pass on unsigned data: the exchange's expiry named when one is presented,
    // "no expiry stated" when none is; the import is verified all the same and says so.
    const foreignOf = (): { pkg: Pkg; digest: string } => {
      const f = clonePkg(packageOf(EA.dir)); const fid = uuidv7();
      (f.manifest['package'] as Row)['action_id'] = fid; ((f.manifest['signature'] as Row)['bound_to'] as Row)['action_id'] = fid;
      // The closure names its action too (check 10 holds them equal): rewritten with the manifest and restated in package.links before the re-signing.
      const links = JSON.parse(f.files.get(LINKS_FILE)!.toString('utf8')) as Row; (links['package'] as Row)['action_id'] = fid; setLinks(f, links);
      resign(f.manifest);
      return { pkg: f, digest: String((f.manifest['signature'] as Row)['package_digest']) };
    };
    const f1 = foreignOf(); const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const ou = await openInline(steward2, tarOfPkg(f1.pkg), { delivery_id: uuidv7(), attempt: 1, expires_at: expiresAt, package_digest: f1.digest, archive_digest: sha256(tarOfPkg(f1.pkg)) });
    expect(ou.verified, failedChecks(ou.checks).join(' | ')).toBe(true);
    expect(checkNamed(ou.checks, /^revocation/)).toMatchObject({ ok: null, detail: expect.stringMatching(/not verifiable here/) });
    expect(checkNamed(ou.checks, /^revocation/).detail).toMatch(/expiry/);
    expect((await withdrawImport(steward2, String(ou.import['import_id']), 'the foreign-origin probe with an exchange (harness)')).import['state']).toBe('withdrawn');
    const f2 = foreignOf();
    const ou2 = await openInline(steward2, tarOfPkg(f2.pkg));
    expect(ou2.verified, failedChecks(ou2.checks).join(' | ')).toBe(true);
    expect(checkNamed(ou2.checks, /^revocation/)).toMatchObject({ ok: null, detail: expect.stringMatching(/no expiry stated/) });
    expect((await withdrawImport(steward2, String(ou2.import['import_id']), 'the foreign-origin probe without an exchange (harness)')).import['state']).toBe('withdrawn');
    // (i) THE STATION INTAKE: the package delivered to the station (delivered; the demonstration recipient verifies and answers; acknowledged), then
    // imported into the mirror FROM the station, delivery.json the exchange → verified, admitted.
    const ES = await exported([mB.manifest_id]);
    const ds = (await deliverTo(authority, ES.id, STATION_KEY)).delivery;
    expect(ds.state).toBe('delivered');
    expect((await stationRecipient(ES.id)).code).toBe(0);
    expect((await collect(authority, ES.id, ds.delivery_id)).delivery.state).toBe('acknowledged');
    const os = await openStation(steward2, ES.id);
    expect(os.verified, failedChecks(os.checks).join(' | ')).toBe(true);
    expect(os.import['intake']).toMatchObject({ kind: 'station', destination_key: STATION_KEY_D2 });
    expect(os.import['exchange']).toMatchObject({ delivery_id: ds.delivery_id, attempt: 1, action_id: ES.id, package_digest: ES.packageDigest, archive_digest: ES.archiveDigest });
    expect(os.import).toMatchObject({ archive_digest: ES.archiveDigest, package_digest: ES.packageDigest, partner_id: partnerId });
    const { detail: dsx } = await imported(os);
    expect(dsx.items.find((i) => i['kind'] === 'record' && i['origin_ref'] === `${B.id}@1`)).toMatchObject({ disposition: 'reused', admitted: expect.objectContaining({ object_id: i1.map.get(B.id) }) });
    expect(dsx.importReceipt).toMatchObject({ delivery_id: ds.delivery_id, attempt: 1, action_id: ES.id, verified: true, state: 'admitted' });
    // (C2c) A revocation.json at the station naming the package — what a disconnected recipient finds beside the package: the revocation check
    // fails on it even though the origin's own record here says the package stands.
    const noticeFile = join(stationDir(ES.id), 'revocation.json');
    writeFileSync(noticeFile, `${JSON.stringify({ notice: 'revocation', notice_id: uuidv7(), attempt: 1, action_id: ES.id, tenant_id: T(), domain_id: D(), package_digest: ES.packageDigest, archive_digest: ES.archiveDigest, delivery: { delivery_id: ds.delivery_id, attempt: 1, state: 'acknowledged' }, revoked_at: new Date().toISOString(), reason: 'a notice placed at the station (harness)', obligation: 'destroy every copy' }, null, 2)}\n`);
    const oc = await openStation(steward2, ES.id);
    expect(oc.import['state']).toBe('quarantined');
    expect(checkNamed(oc.checks, /^revocation/)).toMatchObject({ ok: false, detail: expect.stringMatching(/revocation\.json/) });
    rmSync(noticeFile);
    // (C4) A symlinked package.tar at the station: refused before any byte — nothing stored, no row; no package at all → refused by name.
    const fake = uuidv7();
    mkdirSync(stationDir(fake), { recursive: true });
    symlinkSync(join(SCRATCH_DIR, `${EX1.id}.tar`), join(stationDir(fake), 'package.tar'));
    const qBeforeLink = quarantineCount(D2);
    await refused(openStation(steward2, fake), /the station file package\.tar is not a regular file/);
    expect(quarantineCount(D2)).toBe(qBeforeLink);
    expect(await importsOfOrigin(D2, fake)).toEqual([]);
    await refused(openStation(steward2, uuidv7()), /no package\.tar at/);
    await refused(openStation(steward2, ES.id, 'b16-no-such-station'), /no such destination|b16-no-such-station/, 404);
    // (C3) A record whose header the PORT refuses — valid_to before valid_from in G's header, the entry's canonical digest recomputed (the
    // re-import check passes: the manifest is self-consistent) and the manifest re-signed: at admission the port's own words mark G REFUSED
    // (gate header) under its savepoint; H is admitted; the import is admitted — never stuck in admitting.
    const { evd: G } = await uploadOne('b16-g'); const { evd: Hh, m: mH } = await uploadOne('b16-h');
    const mG = await manifestRow((await manifestOf(G.id, 1)).manifest_id);
    const EG = await exported([mG.manifest_id, mH.manifest_id]);
    const badHeader = clonePkg(packageOf(EG.dir));
    const gEntry = (badHeader.manifest['objects'] as Row[]).find((o) => o['object_id'] === G.id)!;
    const gHeader = gEntry['header'] as Row;
    gHeader['valid_from'] = '2024-01-02T00:00:00.000Z'; gHeader['valid_to'] = '2024-01-01T00:00:00.000Z';
    gEntry['content_digest'] = canonicalHeaderDigest(gHeader as unknown as CanonicalHeader, gEntry['payload'] as Row);
    resign(badHeader.manifest);
    const ob = await openInline(steward2, tarOfPkg(badHeader));
    expect(ob.verified, failedChecks(ob.checks).join(' | ')).toBe(true);
    expect(checkNamed(ob.checks, /^re-import/).ok).toBe(true);
    const { detail: dbx } = await imported(ob);
    const gi = dbx.items.find((i) => i['kind'] === 'record' && i['origin_ref'] === `${G.id}@1`)!;
    expect(gi).toMatchObject({ disposition: 'refused', gate: 'header', reason: expect.stringMatching(/header semantics: valid_to must be after valid_from/) });
    expect(dbx.items.find((i) => i['kind'] === 'record' && i['origin_ref'] === `${Hh.id}@1`)).toMatchObject({ disposition: 'admitted' });
    expect(dbx.import['state']).toBe('admitted');
    expect(await blobExists('quarantine', D2, String((gi['staged'] as Row)['quarantine_locator']))).toBe(true); // the refused record's copy stays
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where domain_id = ${D2}::uuid and payload -> 'imported_from' -> 'object' ->> 'object_id' = ${G.id}`.execute(su)).rows[0]!.n).toBe('0');
    expect((await importEvents(String(ob.import['import_id']))).map((e) => e.event).slice(-2)).toEqual(['import.admitted', 'import.finalized']);
    // (j) THE WITHDRAWAL of the second party's verified import: the ledger stays (the row, its items, its checks), the quarantine copies are
    // tombstoned after the commit and the tombstoning recorded (C5); admit and approve refused on a withdrawn and on a quarantined import;
    // an admitted import is never withdrawn (its canonical rows stand; append-only).
    const wRow0 = (await importRow(secondPartyImport))!;
    expect(wRow0.state).toBe('verified');
    const wItems = await importItems(secondPartyImport);
    const wLocators = [...wItems.filter((i) => i.staged !== null && typeof i.staged['quarantine_locator'] === 'string').map((i) => String(i.staged!['quarantine_locator'])), String(wRow0.manifest_locator), String(wRow0.links_locator)];
    expect(wLocators.length).toBeGreaterThanOrEqual(3);
    for (const l of wLocators) expect(await blobExists('quarantine', D2, l)).toBe(true);
    await refused(withdrawImport(steward2, secondPartyImport, 'short'), /reason is at least 8 characters/, 422);
    const w = await withdrawImport(steward2, secondPartyImport, 'the second party\'s package is not wanted (harness)');
    expect(w.import).toMatchObject({ state: 'withdrawn', withdrawn_by: steward2.principalId, withdraw_reason: 'the second party\'s package is not wanted (harness)' });
    for (const l of wLocators) expect(await blobExists('quarantine', D2, l)).toBe(false);
    const wev = await importEvents(secondPartyImport);
    expect(wev.map((e) => e.event)).toEqual(['import.opened', 'import.verified', 'import.withdrawn', 'import.evidence_tombstoned']);
    expect(wev.at(-1)!.details).toMatchObject({ locators: wLocators.length });
    expect(await importItems(secondPartyImport)).toHaveLength(wItems.length);
    const wd = await getImport(steward2, secondPartyImport);
    expect(wd.import['state']).toBe('withdrawn'); expect(wd.checks.length).toBeGreaterThanOrEqual(15);
    expect(wd.importReceipt).toMatchObject({ verified: false, state: 'withdrawn' });
    await refused(admitImport(steward2, secondPartyImport), /retention import rejected: import .* is withdrawn, not approved/, 409);
    await refused(approveImport(authority, secondPartyImport, EA.packageDigest), /retention import rejected: import .* is withdrawn, not verified/, 409);
    await refused(withdrawImport(steward2, secondPartyImport, 'withdrawn twice (harness)'), /retention import rejected/, 409);
    await refused(admitImport(steward2, qaId), /retention import rejected: import .* is quarantined, not approved/, 409);
    await refused(approveImport(authority, qaId, EA.packageDigest), /retention import rejected: import .* is quarantined, not verified/, 409);
    await refused(withdrawImport(steward2, i1.importId, 'an admitted import is not withdrawn (harness)'), /retention import rejected/, 409);
    await refused(getImport(steward2, uuidv7()), /no authorized import matches/, 404);
    expect((await getImport(steward2, qaId)).import['state']).toBe('quarantined');
  }, 600_000);

  it('I3 · A LARGE PACKAGE BY THE STATION: seventeen uploads of 16,000,000 bytes exported (above the in-memory ceiling), delivered to the station, imported into the mirror from the station entry by entry, approved and admitted; the memory SAMPLED every 50 ms across the open and the admission (heapUsed + external (which counts the ArrayBuffer backing stores) above the baseline, not RSS; synchronous peaks between samples unobserved) stays under 256 MiB above the baseline', async () => {
    const ids: string[] = []; const PER_FILE = 16_000_000; const FILES = 17;
    for (let i = 0; i < FILES; i += 1) {
      const up = await upload([{ name: `b16-big-${i}`, text: bigText(`b16-big-${i}`, PER_FILE) }], 'internal', 'b16-big');
      ids.push((await manifestOf(up[0]!.id, 1)).manifest_id);
    }
    const big = await exported(ids);
    expect(big.byteTotal).toBeGreaterThan(EXPORT_ARCHIVE_MAX_BYTES);
    const ds = (await deliverTo(authority, big.id, STATION_KEY)).delivery;
    expect(ds.state).toBe('delivered');
    const stationTar = join(stationDir(big.id), 'package.tar');
    expect(statSync(stationTar).size).toBeGreaterThan(EXPORT_ARCHIVE_MAX_BYTES);
    // The sampler runs from before the open to after the admission: the package read from the station one entry at a time (each record
    // buffered, stored to the quarantine and released), then the records copied to the evidence vault ONE AT A TIME and released before the next.
    const { result, measured } = await sampledPeak(async () => {
      const os = await openStation(steward2, big.id);
      expect(os.verified, failedChecks(os.checks).join(' | ')).toBe(true);
      expect(os.items.filter((i) => i['kind'] === 'record')).toHaveLength(FILES);
      const importId = String(os.import['import_id']);
      await approveImport(authority, importId, big.packageDigest);
      const adm = await admitImport(steward2, importId);
      expect(adm.import['state']).toBe('admitted');
      return importId;
    });
    console.log(describeSampledPeak(measured, 'I3 (the station import of 272 MB: open, approve, admit)'));
    expect(measured.samples).toBeGreaterThan(20);
    expect(measured.above, describeSampledPeak(measured)).toBeLessThan(EXPORT_ARCHIVE_MAX_BYTES);
    const d = await getImport(steward2, result);
    const records = d.items.filter((i) => i['kind'] === 'record');
    expect(records.filter((i) => i['disposition'] === 'admitted')).toHaveLength(FILES);
    expect(Number((await importRow(result))!.archive_size)).toBe(statSync(stationTar).size);
    for (const i of records) expect(await blobExists('quarantine', D2, String((i['staged'] as Row)['quarantine_locator']))).toBe(false);
    // One record downloadable in the mirror: the bytes' sha256 the origin's bytes digest (the mirror's manifest records it).
    const adm = records[0]!['admitted'] as Row;
    const m2 = await manifestRow(String(adm['manifest_id']));
    expect(m2).toMatchObject({ domain_id: D2, source_id: intake.sourceId });
    const dl = (await downloadIn(D2, steward2, String(adm['object_id']))).download;
    expect(dl.integrity).toBe('verified'); expect(dl.byteLength).toBe(m2.byte_length);
    expect(sha256(Buffer.from(dl.base64, 'base64'))).toBe(m2.content_digest);
  }, 900_000);
});

describe('R · HELD RECIPIENTS (0076 §1; Codex B14-F1; ES-08-004, DP-47-005)', () => {
  it('R1 · one package to five https destinations on the recipient: wrong-digest → MISMATCHED (held confirmed); an unbound credential → credential_unbound (nothing left); mode error → transport 500 after the body (held possible); mode redirect → egress_refused redirect_not_followed AFTER the body (request_sent, held possible — C1); the production egress → dns_failure (nothing sent); the revoke act\'s recipients carry held, the three notified and acknowledged, the mismatched delivery\'s copy destroyed and its receipt kept; the unbound and the unresolved absent, the notify route refusing them; (b) a second package mismatched, revoked while the recipient answers 500 → the notice failed transport, then the notify route → acknowledged', async () => {
    const EA = await exported([mA.manifest_id]);
    await setMode('wrong-digest');
    const da = (await deliverTo(authority, EA.id, HTTPS_KEY)).delivery;
    expect(da).toMatchObject({ state: 'mismatched', attempt: 1, failure_class: null });
    expect(String(da.receipt!['archive_digest'])).not.toBe(EA.archiveDigest);
    await setMode('normal'); // N10: the recipient answers its notices honestly from here
    const du = (await deliverTo(authority, EA.id, UNBOUND_KEY)).delivery;
    expect(du).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'credential_unbound' });
    expect((du.receipt!['failure'] as Row)['request_sent'] ?? false).toBe(false);
    await setMode('error');
    const dp = (await deliverTo(authority, EA.id, POSSIBLE_KEY)).delivery;
    expect(dp).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'transport' });
    expect(dp.receipt!['failure']).toMatchObject({ status: 500, request_sent: true });
    await setMode('redirect');
    const dr = (await deliverTo(authority, EA.id, REDIRECT_KEY)).delivery;
    expect(dr).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'egress_refused' });
    expect(dr.receipt!['failure']).toMatchObject({ egress: 'redirect_not_followed', request_sent: true, status: 302 });
    await setMode('normal');
    egressProvider.deliver = productionEgress;
    let dd: Delivery;
    try { dd = (await deliverTo(authority, EA.id, DNS_KEY)).delivery; } finally { egressProvider.deliver = harnessEgress; }
    expect(dd).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'transport' });
    expect(dd.receipt!['failure']).toMatchObject({ egress: 'dns_failure' });
    expect((dd.receipt!['failure'] as Row)['request_sent'] ?? false).toBe(false);
    expect((await receivedAtRecipient()).received.filter((r) => r['action_id'] === EA.id)).toHaveLength(1); // the mismatched delivery alone was stored
    // THE REVOCATION: the recipients by what is PROVEN — confirmed (the mismatched delivery: the endpoint answered a receipt), possible (the
    // body left before the 500; the body left before the 302), nothing for the unbound credential and the unresolved name.
    const rv = await revokeExport(authority, EA.id, 'held recipients: the package is withdrawn (harness)');
    const recipients = new Map((rv.revocation['recipients'] as Row[]).map((r) => [String(r['destination_key']), r]));
    expect([...recipients.keys()].sort()).toEqual([HTTPS_KEY, POSSIBLE_KEY, REDIRECT_KEY].sort());
    expect(recipients.get(HTTPS_KEY)).toMatchObject({ held: 'confirmed', delivery_id: da.delivery_id, delivery_state: 'mismatched', kind: 'https' });
    expect(recipients.get(POSSIBLE_KEY)).toMatchObject({ held: 'possible', delivery_id: dp.delivery_id, delivery_state: 'failed' });
    expect(recipients.get(REDIRECT_KEY)).toMatchObject({ held: 'possible', delivery_id: dr.delivery_id, delivery_state: 'failed' });
    const notices = new Map((rv.notices as unknown as Notice[]).map((n) => [String(n.destination['destination_key']), n]));
    expect([...notices.keys()].sort()).toEqual([HTTPS_KEY, POSSIBLE_KEY, REDIRECT_KEY].sort());
    for (const [key, held, deliveryId] of [[HTTPS_KEY, 'confirmed', da.delivery_id], [POSSIBLE_KEY, 'possible', dp.delivery_id], [REDIRECT_KEY, 'possible', dr.delivery_id]] as const) {
      const n = notices.get(key)!;
      expect(n).toMatchObject({ state: 'acknowledged', attempt: 1, failure_class: null });
      expect(n.delivery).toMatchObject({ delivery_id: deliveryId, held });
      expect(n.notice['delivery']).toMatchObject({ delivery_id: deliveryId, held });
      expect(n.receipt).toMatchObject({ notice_id: n.notice_id, package_digest: EA.packageDigest, copies_destroyed: true });
    }
    // The recipient destroyed the mismatched delivery's stored tar; the mismatched receipt still stands on the row and in export.mismatched.
    expect((await receivedAtRecipient()).received.find((r) => r['delivery_id'] === da.delivery_id)!['revoked_at']).not.toBeNull();
    const daRow = await deliveryRow(da.delivery_id);
    expect(daRow).toMatchObject({ state: 'mismatched', receipt: expect.objectContaining({ delivery_id: da.delivery_id }) });
    expect(String(daRow.receipt!['archive_digest'])).not.toBe(EA.archiveDigest);
    expect((await actionEvents(EA.id)).filter((e) => e.event === 'export.mismatched').map((e) => e.details['delivery_id'])).toContain(da.delivery_id);
    expect((await actionEvents(EA.id)).filter((e) => e.event === 'export.revocation_acknowledged')).toHaveLength(3);
    // Nothing is known to have reached the unbound and the unresolved: the notify route refuses them in the port's words.
    for (const key of [UNBOUND_KEY, DNS_KEY]) await refused(notify(authority, EA.id, key), /retention notice rejected: destination .* never received the package of .* — nothing is known to have reached it \(credential unbound, the egress refused before connecting, the name unresolved or the TLS handshake failed\); nothing to notify/, 409);
    // (b) A second package delivered MISMATCHED; revoked while the recipient answers 500 → the revoke act's notice failed transport (the
    // revocation stands, held confirmed); the recipient back → the notify route → acknowledged.
    const EB = await exported([mB.manifest_id]);
    await setMode('wrong-digest');
    const db = (await deliverTo(authority, EB.id, HTTPS_KEY)).delivery;
    expect(db.state).toBe('mismatched');
    await setMode('error');
    const rvb = await revokeExport(authority, EB.id, 'revoked while the recipient is down (harness)');
    expect((rvb.revocation['recipients'] as Row[]).map((r) => [r['destination_key'], r['held']])).toEqual([[HTTPS_KEY, 'confirmed']]);
    expect(rvb.notices).toHaveLength(1);
    const nb = rvb.notices[0] as unknown as Notice;
    expect(nb).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'transport' });
    expect(nb.receipt!['failure']).toMatchObject({ status: 500 });
    expect(nb.delivery).toMatchObject({ delivery_id: db.delivery_id, held: 'confirmed' });
    await setMode('normal');
    const n2 = (await notify(authority, EB.id, HTTPS_KEY)).notice;
    expect(n2).toMatchObject({ state: 'acknowledged', attempt: 2, failure_class: null });
    expect(n2.delivery).toMatchObject({ delivery_id: db.delivery_id, state: 'mismatched', held: 'confirmed' });
    expect(n2.notice['delivery']).toMatchObject({ held: 'confirmed' });
    expect(n2.receipt).toMatchObject({ notice_id: n2.notice_id, copies_destroyed: true });
    expect((await receivedAtRecipient()).received.find((r) => r['delivery_id'] === db.delivery_id)!['revoked_at']).not.toBeNull();
  }, 300_000);
});
