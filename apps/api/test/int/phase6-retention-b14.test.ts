/**
 * CP-6 B14 (migration 0074) — the HTTPS EXCHANGE proven end to end, the RECEIPT bound to its delivery at the initial record (Codex
 * B13-F1), the destination's TRUST ANCHOR, and the REVOCATION NOTICE to every destination that received a package — on a real database,
 * an ISOLATED vault, an isolated TRANSFER STATION and a SYNTHETIC HTTPS RECIPIENT (scripts/retention/https-recipient.mjs, spawned:
 * a real TLS server on a loopback port with a self-signed certificate generated for `recipient.b14.invalid`, requiring the bearer bound
 * as EYE_DST_B14, verifying every package with the customer's verifier and the public key, answering receipts and — by a control mode —
 * the wrong answers a real endpoint could give). The B13 harness's discipline otherwise (the vault roots and the station under temporary
 * directories set before the boot; the signing key bound by reference; nothing of a private value on disk or in a record).
 *
 * THE ONE SUBSTITUTION, STATED: the product's delivery egress (http-client.ts `deliver`) resolves the destination's host and REFUSES every
 * loopback, private, link-local and reserved address before it connects — the vetting the B13 harness (H1) and this file's H3 prove.
 * A recipient on this host is therefore unreachable through `deliver` by design. This file replaces the DeliveryEgress provider's
 * transport with the client's own `deliverPinned(req, '127.0.0.1')` — the SAME function `deliver` calls once the address is settled:
 * the TLS handshake against the declared anchor with the hostname's identity, the POST, the headers, the credential on the one hop, the
 * redirect refused, the answer's limits — so that everything but the address vetting is the product's code on a real socket. What
 * this proves and what it does not: the exchange over TLS with a real recipient, yes; the address vetting's ADMISSION of a public
 * address, no — that needs a recipient on a public address (the demonstration's production activation step).
 *
 *   S0 · SETUP — two uploads; the key declared; the station declared; the recipient spawned; the https destination declared WITH the
 *   recipient's certificate as its trust anchor (the answer shows the anchor by fingerprint, never the credential); a garbage anchor, an
 *   anchor on a station refused; a second https destination on the same endpoint WITHOUT an anchor (H3's control).
 *
 *   H1 · THE POSITIVE EXCHANGE (D8; B14) — an export delivered to the https destination → ACKNOWLEDGED in one act: the recipient received
 *   the tar (its sha256 the recorded archive digest), verified it with the public key and answered a receipt naming THIS delivery and both
 *   digests with verified: true; the row, export.acknowledged, custody.delivered per manifest; the egress recorded (200, TLS verified, the
 *   pinned address, the credential carried on the one hop); the bearer's value in no row, event or answer.
 *
 *   H2 · THE RECEIPT'S BINDING and the CONTROLS through the route and the record port (D1; Codex B13-F1) — the recipient in mode `stale`
 *   answers attempt 2 with attempt 1's receipt (the digests right, verified true): recorded DELIVERED, not acknowledged, the answer kept
 *   as evidence on the row and in the event (receipt_binding names_other_delivery), then the proper receipt presented out of band →
 *   acknowledged; `wrong-digest` → mismatched (both sides on the event); `deny` → mismatched; `unverified` → delivered with the answer
 *   kept (receipt_binding unverified); `not-json` → failed receipt_invalid; `error` → failed transport (500); `redirect` → failed
 *   egress_refused (redirect_not_followed); `unauthorized` → failed transport (401); the attempts numbered 1..9 and every outcome a row.
 *
 *   H3 · THE TRUST and the VETTING — the destination WITHOUT the anchor on the same endpoint → failed transport, the TLS failure named
 *   (verification is never disabled; the self-signed certificate is trusted only where declared); the PRODUCTION egress restored — the
 *   recipient by its .invalid name → failed transport (dns_failure), by its loopback address literal → failed egress_refused
 *   address_not_public (the vetting this file substitutes, proven to refuse); nothing reached the recipient either way.
 *
 *   R1 · THE REVOCATION NOTICE (0074 §3; D3) — a second export delivered to the station (the demonstration recipient's receipt collected →
 *   acknowledged) and to the https recipient (acknowledged); REVOKED by the authority → the answer's notices: the https destination
 *   ACKNOWLEDGED in the same act (the recipient destroyed its copy — its record says revoked), the station NOTIFIED (revocation.json
 *   beside delivery.json); after the commit the product's package.tar and package.sig removed from the station (the answer says which);
 *   export.revocation_notified / export.revocation_acknowledged, custody.revocation_notified per manifest; the demonstration recipient in
 *   --revocation mode writes revocation-receipt.json (the copies already gone) → collected → ACKNOWLEDGED; a further notice to the station
 *   (the notify act) → attempt 2, the recipient with --refuse → collected → MISMATCHED (copies_destroyed false, both sides on the event);
 *   the https recipient in mode `error` → a further notice failed transport, in mode `normal` → the next acknowledged; a receipt naming
 *   another notice refused; a notice of an unrevoked package refused; a revoked package nobody received → no notices, the notify act
 *   refused (nothing to notify); the steward refused by the PDP; the notices list and the export read.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpsRequest } from 'node:https';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { DeliveryEgress } from '../../src/retention/export-delivery.service.js';
import { deliver, deliverPinned, type DeliveryRequest } from '../../src/observation/connectors/http-client.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b14-vault-')));
const STATION_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b14-station-')));
const SCRATCH_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b14-scratch-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

const KEY1 = generateKeyPairSync('ed25519');
const pkcs8b64 = (k: KeyObject): string => (k.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
const KEY_REF = 'EYE_EXPORT_SIGNING_KEY_B14';
process.env[KEY_REF] = pkcs8b64(KEY1.privateKey);
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
const KEY1_PEM_FILE = join(SCRATCH_DIR, 'b14-key1.pub.pem');
writeFileSync(KEY1_PEM_FILE, `${spkiPem(KEY1.publicKey)}\n`);
// The destination's bearer: a value built at run time (never a literal that looks like a secret), bound by reference before the boot.
const DST_REF = 'EYE_DST_B14';
const DST_TOKEN = `b14-${createHash('sha256').update(String(process.pid) + String(Date.now())).digest('hex').slice(0, 24)}`;
process.env[DST_REF] = DST_TOKEN;

const execFile = promisify(execFileCb);
const RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/https-recipient.mjs');
const STATION_RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/transfer-station-recipient.mjs');
const RECIPIENT_HOST = 'recipient.b14.invalid';
const HTTPS_KEY = 'b14-https'; const UNTRUSTED_KEY = 'b14-https-untrusted'; const STATION_KEY = 'b14-station';

let h: Phase4Harness; let observation: ObservationController; let retention: RetentionController; let vault: VaultService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
let egressProvider: DeliveryEgress;
let recipient: ChildProcess | null = null; let recipientUrl = ''; let recipientPort = 0; let recipientCert = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
type Row = Record<string, unknown>;
const containsString = (v: unknown, s: string): boolean =>
  typeof v === 'string' ? v.includes(s) : Array.isArray(v) ? v.some((x) => containsString(x, s)) : v !== null && typeof v === 'object' ? Object.values(v as Row).some((x) => containsString(x, s)) : false;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;

/* ───────────── the rows ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; source_id: string; retention_profile: string }>`select manifest_id::text, source_id::text, retention_profile from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Row }>`select event, details from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string }>`select event from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);
const eventRows = async (id: string, event: string) => (await sql<{ details: Row }>`select details from retention.action_events where action_id = ${id}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
type ExportRow = { signing_key_id: string | null; archive_digest: string | null; package_digest: string; revoked_at: Date | null };
const exportRow = async (id: string): Promise<ExportRow | undefined> => (await sql<ExportRow>`select signing_key_id, archive_digest, package_digest, revoked_at from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0];
type DeliveryRow = { delivery_id: string; destination_id: string; attempt: number; state: string; archive_digest: string; package_digest: string; receipt: Row | null; receipt_digest: string | null; failure_class: string | null; acknowledged_at: Date | null };
const deliveryRow = async (deliveryId: string): Promise<DeliveryRow> => (await sql<DeliveryRow>`select delivery_id::text, destination_id::text, attempt::int, state, archive_digest, package_digest, receipt, receipt_digest, failure_class, acknowledged_at from retention.export_deliveries where delivery_id = ${deliveryId}::uuid`.execute(su)).rows[0]!;
type NoticeRow = { notice_id: string; destination_id: string; delivery_id: string; attempt: number; state: string; package_digest: string; notice: Row; receipt: Row | null; failure_class: string | null; acknowledged_at: Date | null };
const noticeRows = async (actionId: string): Promise<NoticeRow[]> => (await sql<NoticeRow>`select notice_id::text, destination_id::text, delivery_id::text, attempt::int, state, package_digest, notice, receipt, failure_class, acknowledged_at from retention.export_revocation_notices where action_id = ${actionId}::uuid order by notified_at, attempt`.execute(su)).rows;
const tenantRowsJson = async (actionIds: string[]): Promise<unknown[]> => [
  ...(await sql<{ j: unknown }>`select to_jsonb(d) j from retention.export_deliveries d where d.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(n) j from retention.export_revocation_notices n where n.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(x) j from retention.export_destinations x where x.tenant_id = ${T()}::uuid`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(e) j from retention.action_events e where e.action_id = any(${actionIds}::uuid[])`.execute(su)).rows.map((r) => r.j),
  ...(await sql<{ j: unknown }>`select to_jsonb(c) j from observation.custody_events c where c.tenant_id = ${T()}::uuid and c.event in ('custody.delivered', 'custody.revocation_notified')`.execute(su)).rows.map((r) => r.j),
];

/* ───────────── the routes ───────────── */
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved' } }) as Promise<{ approval: { approvalId: string } }>;
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: { executed: number; held: number; refused: number } }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
type ExportRead = { package: Row; deliveries: Row[]; revocation_notices: Row[] };
const getExport = (p: AuthenticatedPrincipal, id: string) => retention.getExport(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as unknown as Promise<ExportRead>;
type Revocation = { revocation: Row; notices: Row[]; bytes: { removed: boolean }; stations: Row[] };
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } }) as unknown as Promise<Revocation>;
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string) => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose: 'demonstration' } }) as Promise<{ key: Row }>;
const declareDestination = (p: AuthenticatedPrincipal, payload: Row) => retention.declareDestination(h.req(p, 'retention.destination.declare', 'RDS', null, 'retention'), T(), D(), { payload }) as Promise<{ destination: Row }>;
const listDestinations = (p: AuthenticatedPrincipal) => retention.listDestinations(h.req(p, 'retention.read', 'RDS', null, 'retention'), T(), D()) as Promise<{ destinations: Row[] }>;
type Delivery = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; egress: Row | null; archive_digest?: string; package_digest?: string };
const deliverTo = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.deliverExport(h.req(p, 'retention.export.deliver', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ delivery: Delivery }>;
const collect = (p: AuthenticatedPrincipal, id: string, deliveryId: string) => retention.collectReceipt(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId) as unknown as Promise<{ delivery: Delivery }>;
const acknowledge = (p: AuthenticatedPrincipal, id: string, deliveryId: string, receipt: unknown) => retention.acknowledgeDelivery(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId, { payload: { receipt } }) as unknown as Promise<{ delivery: Delivery }>;
type Notice = { notice_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; station: Row | null; egress: Row | null; destination: Row; delivery: Row };
const notify = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.notifyRevocation(h.req(p, 'retention.export.notify', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ notice: Notice }>;
const listNotices = (p: AuthenticatedPrincipal, id: string) => retention.listRevocationNotices(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as unknown as Promise<{ notices: Row[] }>;
const collectNotice = (p: AuthenticatedPrincipal, id: string, noticeId: string) => retention.collectRevocationReceipt(h.req(p, 'retention.export.acknowledge', 'RXN', noticeId, 'retention'), T(), D(), id, noticeId) as unknown as Promise<{ notice: Notice }>;
const acknowledgeNotice = (p: AuthenticatedPrincipal, id: string, noticeId: string, receipt: unknown) => retention.acknowledgeRevocationNotice(h.req(p, 'retention.export.acknowledge', 'RXN', noticeId, 'retention'), T(), D(), id, noticeId, { payload: { receipt } }) as unknown as Promise<{ notice: Notice }>;
const upload = async (names: string[]) =>
  h.upload(names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' })), 'internal') as Promise<Array<{ id: string; version: number; digest: string }>>;
const exported = async (manifestIds: string[]): Promise<{ id: string; packageDigest: string; archiveDigest: string }> => {
  const o = await open(steward, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal' } });
  const id = o.action.actionId;
  const r = await resolve(steward, id);
  await approve(authority, id, String(r.scope['scope_digest']));
  const ex = await execute(steward, id);
  expect(ex.execution).toMatchObject({ executed: manifestIds.length, refused: 0, held: 0 });
  expect((await verify(steward, id)).verification).toMatchObject({ verified: true });
  const row = (await exportRow(id))!;
  expect(row.archive_digest).toMatch(HEX64);
  return { id, packageDigest: row.package_digest, archiveDigest: row.archive_digest! };
};
const stationDir = (id: string) => join(STATION_DIR, T(), D(), id);
const failing = (p: Promise<unknown>) => p.then(() => { throw new Error('the call should have been refused'); }, (e: unknown) => e as { status?: number; message?: string });

/* ───────────── the recipient's side ───────────── */
const run = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try { const r = await execFile(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { code: 0, stdout: r.stdout, stderr: r.stderr }; }
  catch (e) { const err = e as { code?: number; stdout?: string; stderr?: string }; return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }; }
};
const stationRecipient = (actionId: string, ...extra: string[]) => run([STATION_RECIPIENT, STATION_DIR, T(), D(), actionId, ...extra]);
/** The harness's own client of the recipient's control and inspection routes: TLS against the recipient's certificate, the bearer. */
const recipientCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Row }> => new Promise((res, rej) => {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const req = httpsRequest({ host: '127.0.0.1', port: recipientPort, servername: RECIPIENT_HOST, path, method, ca: recipientCert, rejectUnauthorized: true,
                             headers: { authorization: `Bearer ${DST_TOKEN}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row }); } catch (e) { rej(e); } });
  });
  req.on('error', rej);
  if (payload !== null) req.write(payload);
  req.end();
});
const setMode = async (mode: string) => { expect((await recipientCall('POST', '/_control', { mode })).status).toBe(200); };
const receivedAtRecipient = async () => (await recipientCall('GET', '/_received')).body as { received: Row[]; notices: Row[] };
/** The harness's egress: the product's pinned transport on the recipient's loopback address — the one substitution, stated above. */
const harnessEgress = (req: DeliveryRequest) => deliverPinned(req, '127.0.0.1');
const productionEgress = (req: DeliveryRequest) => deliver(req);

let mA = { manifest_id: '', source_id: '', retention_profile: '' }; let mB = { manifest_id: '', source_id: '', retention_profile: '' };
let httpsId = ''; let stationId = '';
let EXP1 = { id: '', packageDigest: '', archiveDigest: '' }; let EXP2 = { id: '', packageDigest: '', archiveDigest: '' };
let d1: Delivery; let d2: Delivery;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  observation = h.app.get(O); retention = h.app.get(R); vault = h.app.get(VaultService); egressProvider = h.app.get(DeliveryEgress);
  void observation;
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b14-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b14-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b14-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b14-tenant-admin', 'TENANT');
  manager = await h.principalWith(['collection_manager'], 'b14-collection-manager');
  void manager;
  // The recipient: a real TLS server on a loopback port, its self-signed certificate for recipient.b14.invalid the destination's anchor.
  recipient = spawn(process.execPath, [RECIPIENT, '--self-signed', RECIPIENT_HOST, '--listen', '127.0.0.1:0', '--bearer-env', DST_REF, '--public-key', KEY1_PEM_FILE, '--recipient', 'NORDWERK GmbH — harness https endpoint', '--store', join(SCRATCH_DIR, 'recipient-store')], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`the recipient did not start: ${out.join('')}`)), 20_000);
    recipient!.stdout!.on('data', (c: Buffer) => {
      out.push(c.toString('utf8'));
      const all = out.join('');
      const cert = /^certificate (.+)$/m.exec(all); const listening = /^listening (https:\/\/[^\s]+)$/m.exec(all);
      if (cert !== null && listening !== null) { recipientCert = readFileSync(cert[1]!, 'utf8'); recipientUrl = listening[1]!; recipientPort = Number(new URL(recipientUrl).port); clearTimeout(timer); res(); }
    });
    recipient!.stderr!.on('data', (c: Buffer) => out.push(c.toString('utf8')));
    recipient!.on('exit', (code) => { clearTimeout(timer); rej(new Error(`the recipient exited ${code}: ${out.join('')}`)); });
  });
  egressProvider.deliver = harnessEgress;
}, 300_000);

afterAll(async () => {
  delete process.env[KEY_REF]; delete process.env[DST_REF];
  if (recipient !== null) recipient.kill('SIGTERM');
  await h?.close();
  await su?.destroy();
  for (const dir of [VAULT_DIR, STATION_DIR, SCRATCH_DIR]) rmSync(dir, { recursive: true, force: true });
}, 120_000);

describe('S · SETUP (D2: the trust anchor)', () => {
  it('S0 · two internal uploads; the key declared; the station declared; the https destination declared WITH the recipient\'s certificate as its trust anchor (shown by fingerprint; the endpoint the recipient\'s hostname); a garbage anchor and an anchor on a station refused; a second https destination on the same endpoint WITHOUT an anchor; the list', async () => {
    const up = await upload(['b14-a', 'b14-b']);
    mA = await manifestRow((await manifestOf(up[0]!.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(up[1]!.id, 1)).manifest_id);
    expect((await declareKey(tenantAdmin, KEY_REF)).key['key_id']).toMatch(/^ed25519:/);
    const st = await declareDestination(domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'NORDWERK GmbH — harness transfer station', purpose: 'the periodic export (harness)' });
    stationId = String(st.destination['destination_id']);
    expect(st.destination['trust_anchor']).toBeNull();
    const endpoint = `https://${RECIPIENT_HOST}:${recipientPort}/receive`;
    const hs = await declareDestination(domainAdmin, { destinationKey: HTTPS_KEY, kind: 'https', endpoint, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'NORDWERK GmbH — harness https endpoint', purpose: 'the production kind, exercised against the synthetic recipient' });
    httpsId = String(hs.destination['destination_id']);
    expect(hs.destination).toMatchObject({ kind: 'https', endpoint, credential_ref: DST_REF, readiness: 'active' });
    const anchor = hs.destination['trust_anchor'] as { declared: boolean; certificates: Row[] };
    expect(anchor.declared).toBe(true);
    expect(anchor.certificates).toHaveLength(1);
    expect(String(anchor.certificates[0]!['subject'])).toContain(RECIPIENT_HOST);
    expect(String(anchor.certificates[0]!['fingerprint256'])).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(containsString(hs.destination, DST_TOKEN)).toBe(false);
    await expect(declareDestination(domainAdmin, { destinationKey: 'b14-bad-anchor', kind: 'https', endpoint, trustAnchorPem: '-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----', recipient: 'x', purpose: 'y' })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/trust anchor/) });
    await expect(declareDestination(domainAdmin, { destinationKey: 'b14-anchor-on-station', kind: 'transfer_station', endpoint: STATION_DIR, trustAnchorPem: recipientCert, recipient: 'x', purpose: 'y' })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/trust anchor/) });
    const un = await declareDestination(domainAdmin, { destinationKey: UNTRUSTED_KEY, kind: 'https', endpoint, credentialRef: DST_REF, recipient: 'the same endpoint without an anchor (harness)', purpose: 'H3: the deployment\'s trust store alone' });
    expect(un.destination['trust_anchor']).toBeNull();
    const list = await listDestinations(domainAdmin);
    expect(list.destinations.map((d) => d['destination_key']).sort()).toEqual([HTTPS_KEY, UNTRUSTED_KEY, STATION_KEY].sort());
    expect(containsString(list.destinations, DST_TOKEN)).toBe(false);
  }, 180_000);
});

describe('H · THE HTTPS EXCHANGE (D8; B14 D1–D2)', () => {
  it('H1 · THE POSITIVE EXCHANGE: the export delivered over TLS to the synthetic recipient → ACKNOWLEDGED in one act — the recipient received the tar (sha256 = the recorded archive digest), verified it with the public key, answered a receipt naming THIS delivery, both digests and verified: true; export.acknowledged; custody.delivered per manifest; the egress recorded (200, TLS verified, 127.0.0.1 pinned, the credential carried on the one hop); the bearer\'s value nowhere', async () => {
    EXP1 = await exported([mA.manifest_id, mB.manifest_id]);
    await setMode('normal');
    d1 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d1).toMatchObject({ state: 'acknowledged', attempt: 1, failure_class: null });
    expect(d1.receipt).toMatchObject({ delivery_id: d1.delivery_id, attempt: 1, action_id: EXP1.id, archive_digest: EXP1.archiveDigest, package_digest: EXP1.packageDigest, verified: true });
    expect(d1.egress).toMatchObject({ status: 200, tls_verified: true, pinned_address: '127.0.0.1' });
    expect((d1.egress!['hops'] as Row[])[0]).toMatchObject({ status: 200, credentialsCarried: true });
    const row = await deliveryRow(d1.delivery_id);
    expect(row).toMatchObject({ state: 'acknowledged', attempt: 1, archive_digest: EXP1.archiveDigest, package_digest: EXP1.packageDigest, failure_class: null });
    expect(row.acknowledged_at).not.toBeNull();
    expect(row.receipt).toMatchObject({ delivery_id: d1.delivery_id, verified: true });
    expect(await events(EXP1.id)).toContain('export.acknowledged');
    expect((await eventRows(EXP1.id, 'export.acknowledged'))[0]!.details).toMatchObject({ delivery_id: d1.delivery_id, kind: 'https', state: 'acknowledged', attempt: 1 });
    for (const m of [mA, mB]) expect((await custody(m.manifest_id, 'custody.delivered')).map((c) => c.details['delivery_id'])).toContain(d1.delivery_id);
    const seen = await receivedAtRecipient();
    expect(seen.received).toHaveLength(1);
    expect(seen.received[0]).toMatchObject({ delivery_id: d1.delivery_id, attempt: 1, action_id: EXP1.id, archive_digest: EXP1.archiveDigest, package_digest: EXP1.packageDigest, verified: true, revoked_at: null });
    expect(containsString(await tenantRowsJson([EXP1.id]), DST_TOKEN)).toBe(false);
  }, 120_000);

  it('H2 · THE RECEIPT\'S BINDING (Codex B13-F1) and the controls through the route and the record port: `stale` (attempt 1\'s receipt for attempt 2) → DELIVERED, not acknowledged, the answer kept on the row and in the event (receipt_binding names_other_delivery), then the proper receipt out of band → acknowledged; `wrong-digest` → mismatched; `deny` → mismatched; `unverified` → delivered (receipt_binding unverified); `not-json` → failed receipt_invalid; `error` → failed transport 500; `redirect` → failed egress_refused; `unauthorized` → failed transport 401; the attempts 1..9', async () => {
    await setMode('stale');
    d2 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d2).toMatchObject({ state: 'delivered', attempt: 2, failure_class: null });
    expect(d2.receipt).toMatchObject({ delivery_id: d1.delivery_id, attempt: 1, archive_digest: EXP1.archiveDigest, package_digest: EXP1.packageDigest, verified: true });
    const row2 = await deliveryRow(d2.delivery_id);
    expect(row2).toMatchObject({ state: 'delivered', attempt: 2, receipt: expect.objectContaining({ delivery_id: d1.delivery_id }), failure_class: null });
    expect(row2.acknowledged_at).toBeNull();
    expect(row2.receipt_digest).toMatch(HEX64);
    const delivered = (await eventRows(EXP1.id, 'export.delivered')).map((e) => e.details).filter((d) => d['delivery_id'] === d2.delivery_id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ receipt_binding: 'names_other_delivery', receipt_names_delivery: d1.delivery_id, received: expect.objectContaining({ delivery_id: d1.delivery_id, verified: true }) });
    expect(await events(EXP1.id)).not.toContain('export.mismatched');
    // The recipient's proper receipt for attempt 2, presented out of band (what its record holds), closes the exchange.
    const held = (await receivedAtRecipient()).received.find((r) => r['delivery_id'] === d2.delivery_id)!;
    expect(held).toMatchObject({ attempt: 2, verified: true });
    const ack = (await acknowledge(authority, EXP1.id, d2.delivery_id, { receipt_id: 'out-of-band-1', delivery_id: d2.delivery_id, attempt: 2, archive_digest: held['archive_digest'], package_digest: held['package_digest'], verified: true, recipient: 'NORDWERK GmbH' })).delivery;
    expect(ack.state).toBe('acknowledged');
    expect((await deliveryRow(d2.delivery_id)).state).toBe('acknowledged');
    // A receipt naming another delivery is refused by the acknowledge port too (the binding B13 had; the initial record now shares it).
    await setMode('normal');
    const d3 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d3).toMatchObject({ state: 'acknowledged', attempt: 3 });
    await setMode('wrong-digest');
    const d4 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d4).toMatchObject({ state: 'mismatched', attempt: 4, failure_class: null });
    expect(String(d4.receipt!['archive_digest'])).not.toBe(EXP1.archiveDigest);
    const mism = (await eventRows(EXP1.id, 'export.mismatched')).map((e) => e.details).filter((d) => d['delivery_id'] === d4.delivery_id);
    expect(mism[0]).toMatchObject({ expected: { archive_digest: EXP1.archiveDigest, package_digest: EXP1.packageDigest }, received: expect.objectContaining({ verified: true }) });
    await setMode('deny');
    const d5 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d5).toMatchObject({ state: 'mismatched', attempt: 5 });
    expect(d5.receipt).toMatchObject({ verified: false, delivery_id: d5.delivery_id });
    await setMode('unverified');
    const d6 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d6).toMatchObject({ state: 'delivered', attempt: 6 });
    expect(d6.receipt!['verified']).toBeUndefined();
    const del6 = (await eventRows(EXP1.id, 'export.delivered')).map((e) => e.details).filter((d) => d['delivery_id'] === d6.delivery_id);
    expect(del6[0]).toMatchObject({ receipt_binding: 'unverified' });
    expect(del6[0]!['receipt_names_delivery'] ?? null).toBeNull();
    await setMode('not-json');
    const d7 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d7).toMatchObject({ state: 'failed', attempt: 7, failure_class: 'receipt_invalid' });
    expect(d7.egress).toMatchObject({ status: 200 });
    await setMode('error');
    const d8 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d8).toMatchObject({ state: 'failed', attempt: 8, failure_class: 'transport' });
    expect((d8.receipt!['failure'] as Row)['status']).toBe(500);
    await setMode('redirect');
    const d9 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d9).toMatchObject({ state: 'failed', attempt: 9, failure_class: 'egress_refused' });
    expect((d9.receipt!['failure'] as Row)['egress']).toBe('redirect_not_followed');
    await setMode('unauthorized');
    const d10 = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(d10).toMatchObject({ state: 'failed', attempt: 10, failure_class: 'transport' });
    expect((d10.receipt!['failure'] as Row)['status']).toBe(401);
    await setMode('normal');
    const read = await getExport(steward, EXP1.id);
    expect(read.deliveries.map((d) => [d['attempt'], d['state']])).toEqual([[1, 'acknowledged'], [2, 'acknowledged'], [3, 'acknowledged'], [4, 'mismatched'], [5, 'mismatched'], [6, 'delivered'], [7, 'failed'], [8, 'failed'], [9, 'failed'], [10, 'failed']]);
    expect(containsString(await tenantRowsJson([EXP1.id]), DST_TOKEN)).toBe(false);
  }, 180_000);

  it('H3 · THE TRUST and the VETTING: the destination WITHOUT the anchor on the same endpoint → failed transport, the TLS failure named (verification never disabled; the self-signed certificate trusted only where declared); the PRODUCTION egress for one delivery to the same recipient → failed egress_refused address_not_public (the vetting this file substitutes, proven to refuse)', async () => {
    const un = (await deliverTo(authority, EXP1.id, UNTRUSTED_KEY)).delivery;
    expect(un).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'transport' });
    expect(JSON.stringify(un.receipt)).toMatch(/tls|certificate|self.signed|unable to verify/i);
    expect((await receivedAtRecipient()).received.filter((r) => r['action_id'] === EXP1.id)).toHaveLength(6); // nothing more reached the recipient
    // The production egress: the recipient's hostname does not resolve on any network (.invalid) → dns_failure, a transport failure; the
    // recipient by its loopback address literal → address_not_public, the vetting's own refusal — nothing reaches the recipient either way.
    const lb = await declareDestination(domainAdmin, { destinationKey: 'b14-loopback-literal', kind: 'https', endpoint: `https://127.0.0.1:${recipientPort}/receive`, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'the recipient by its loopback address (harness)', purpose: 'H3: the production vetting' });
    expect(lb.destination['readiness']).toBe('active');
    egressProvider.deliver = productionEgress;
    try {
      const byName = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
      expect(byName).toMatchObject({ state: 'failed', attempt: 11, failure_class: 'transport' });
      expect((byName.receipt!['failure'] as Row)['egress']).toBe('dns_failure');
      const byAddress = (await deliverTo(authority, EXP1.id, 'b14-loopback-literal')).delivery;
      expect(byAddress).toMatchObject({ state: 'failed', attempt: 1, failure_class: 'egress_refused' });
      expect((byAddress.receipt!['failure'] as Row)['egress']).toBe('address_not_public');
    } finally {
      egressProvider.deliver = harnessEgress;
    }
    expect((await receivedAtRecipient()).received.filter((r) => r['action_id'] === EXP1.id)).toHaveLength(6);
  }, 120_000);
});

describe('R · THE REVOCATION NOTICE (0074 §3; D3)', () => {
  it('R1 · a second export delivered to the station (receipt collected → acknowledged) and to the https recipient (acknowledged); REVOKED → notices: https ACKNOWLEDGED in the same act (the recipient destroyed its copy), the station NOTIFIED (revocation.json), the product\'s package.tar/package.sig removed from the station after the commit; the events and custody rows; the station recipient --revocation → collected → ACKNOWLEDGED; a further notice → attempt 2, --refuse → MISMATCHED; the https recipient in mode error → failed transport, then acknowledged; a receipt naming another notice refused; an unrevoked package refused; a revoked package nobody received → no notices, the notify act refused; the steward refused; the list and the read', async () => {
    EXP2 = await exported([mA.manifest_id]);
    const s1 = (await deliverTo(authority, EXP2.id, STATION_KEY)).delivery;
    expect(s1.state).toBe('delivered');
    expect((await stationRecipient(EXP2.id, '--public-key', KEY1_PEM_FILE)).code).toBe(0);
    expect((await collect(authority, EXP2.id, s1.delivery_id)).delivery.state).toBe('acknowledged');
    await setMode('normal');
    const h1 = (await deliverTo(authority, EXP2.id, HTTPS_KEY)).delivery;
    expect(h1.state).toBe('acknowledged');
    expect(existsSync(join(stationDir(EXP2.id), 'package.tar'))).toBe(true);
    // An unrevoked package: nothing to notify.
    await expect(notify(authority, EXP2.id, HTTPS_KEY)).rejects.toThrow(/retention notice rejected: the package of .* is not revoked/);
    const rv = await revokeExport(authority, EXP2.id, 'the customer withdrew; every copy is to be destroyed (harness)');
    expect(rv.revocation['recipients']).toHaveLength(2);
    expect(rv.bytes.removed).toBe(true);
    const byKey = new Map(rv.notices.map((n) => [String((n['destination'] as Row)['destination_key']), n]));
    const nh = byKey.get(HTTPS_KEY)! as unknown as Notice; const ns = byKey.get(STATION_KEY)! as unknown as Notice;
    expect(nh).toMatchObject({ state: 'acknowledged', attempt: 1, failure_class: null });
    expect(nh.receipt).toMatchObject({ notice_id: nh.notice_id, delivery_id: h1.delivery_id, package_digest: EXP2.packageDigest, copies_destroyed: true });
    expect(nh.egress).toMatchObject({ status: 200, tls_verified: true });
    expect(ns).toMatchObject({ state: 'notified', attempt: 1, failure_class: null, receipt: null });
    expect(ns.station).toMatchObject({ file: 'revocation.json' });
    expect(ns.delivery).toMatchObject({ delivery_id: s1.delivery_id, attempt: 1, state: 'acknowledged' });
    const dir = stationDir(EXP2.id);
    const written = readJson(join(dir, 'revocation.json'));
    expect(written).toMatchObject({ notice: 'revocation', notice_id: ns.notice_id, action_id: EXP2.id, package_digest: EXP2.packageDigest, archive_digest: EXP2.archiveDigest, delivery: { delivery_id: s1.delivery_id }, reason: 'the customer withdrew; every copy is to be destroyed (harness)' });
    expect(typeof written['revoked_at']).toBe('string');
    expect(String(written['obligation'])).toMatch(/destroy every copy/);
    // The product's copies at the station are gone after the commit; the record (delivery.json, receipt.json, revocation.json) stays.
    expect(rv.stations).toEqual([{ destination_key: STATION_KEY, removed: ['package.tar', 'package.sig'], absent: [], failed: [] }]);
    expect(existsSync(join(dir, 'package.tar'))).toBe(false); expect(existsSync(join(dir, 'package.sig'))).toBe(false);
    expect(existsSync(join(dir, 'delivery.json'))).toBe(true); expect(existsSync(join(dir, 'receipt.json'))).toBe(true);
    // The https recipient's record: the copy destroyed.
    const seen = await receivedAtRecipient();
    expect(seen.received.find((r) => r['delivery_id'] === h1.delivery_id)!['revoked_at']).not.toBeNull();
    expect(seen.notices.at(-1)).toMatchObject({ notice_id: nh.notice_id, package_digest: EXP2.packageDigest, copies_destroyed: true });
    // The rows, the events, the custody.
    const rows = await noticeRows(EXP2.id);
    expect(rows.map((r) => [r.destination_id, r.attempt, r.state])).toEqual(expect.arrayContaining([[httpsId, 1, 'acknowledged'], [stationId, 1, 'notified']]));
    expect(rows.every((r) => r.package_digest === EXP2.packageDigest && r.notice['notice_id'] === r.notice_id)).toBe(true);
    const ev = await events(EXP2.id);
    expect(ev).toContain('export.revoked'); expect(ev).toContain('export.revocation_notified'); expect(ev).toContain('export.revocation_acknowledged');
    expect((await custody(mA.manifest_id, 'custody.revocation_notified')).map((c) => c.details['notice_id']).sort()).toEqual([nh.notice_id, ns.notice_id].sort());
    // The station's recipient answers the notice: the copies already gone; the receipt collected → acknowledged.
    const answered = await stationRecipient(EXP2.id, '--revocation');
    expect(answered.code).toBe(0);
    expect(answered.stdout).toMatch(/already gone/);
    const rr = readJson(join(dir, 'revocation-receipt.json'));
    expect(rr).toMatchObject({ notice_id: ns.notice_id, delivery_id: s1.delivery_id, package_digest: EXP2.packageDigest, copies_destroyed: true, destroyed: [] });
    const c1 = (await collectNotice(authority, EXP2.id, ns.notice_id)).notice;
    expect(c1.state).toBe('acknowledged');
    expect((await noticeRows(EXP2.id)).find((r) => r.notice_id === ns.notice_id)).toMatchObject({ state: 'acknowledged', receipt: expect.objectContaining({ receipt_id: rr['receipt_id'] }) });
    await expect(collectNotice(authority, EXP2.id, ns.notice_id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/is not notified/) });
    // A further notice to the station (the notify act): attempt 2; the recipient refuses → mismatched with both sides on the event.
    const n2 = (await notify(authority, EXP2.id, STATION_KEY)).notice;
    expect(n2).toMatchObject({ state: 'notified', attempt: 2 });
    expect(readJson(join(dir, 'revocation.json'))['notice_id']).toBe(n2.notice_id);
    // A stale receipt (the first notice's) refused by the collect act: it names another notice.
    await expect(collectNotice(authority, EXP2.id, n2.notice_id)).rejects.toThrow(/retention notice rejected: the receipt names notice/);
    expect((await stationRecipient(EXP2.id, '--revocation', '--refuse')).code).toBe(0);
    const c2 = (await collectNotice(authority, EXP2.id, n2.notice_id)).notice;
    expect(c2.state).toBe('mismatched');
    const mm = (await eventRows(EXP2.id, 'export.revocation_mismatched')).map((e) => e.details).filter((d) => d['notice_id'] === n2.notice_id);
    expect(mm[0]).toMatchObject({ expected: { package_digest: EXP2.packageDigest, copies_destroyed: true }, received: { package_digest: EXP2.packageDigest, copies_destroyed: false } });
    // The https recipient down (mode error) → a further notice failed transport; up → acknowledged; a stale https answer → notified with the binding.
    await setMode('error');
    const n3 = (await notify(authority, EXP2.id, HTTPS_KEY)).notice;
    expect(n3).toMatchObject({ state: 'failed', attempt: 2, failure_class: 'transport' });
    await setMode('stale');
    const n4 = (await notify(authority, EXP2.id, HTTPS_KEY)).notice;
    expect(n4).toMatchObject({ state: 'notified', attempt: 3 });
    expect(String(n4.receipt!['notice_id'])).not.toBe(n4.notice_id);
    expect((await eventRows(EXP2.id, 'export.revocation_notified')).map((e) => e.details).find((d) => d['notice_id'] === n4.notice_id)).toMatchObject({ receipt_binding: 'names_other_notice' });
    await expect(acknowledgeNotice(authority, EXP2.id, n4.notice_id, { notice_id: nh.notice_id, package_digest: EXP2.packageDigest, copies_destroyed: true })).rejects.toThrow(/retention notice rejected: the receipt names notice/);
    expect((await acknowledgeNotice(authority, EXP2.id, n4.notice_id, { notice_id: n4.notice_id, package_digest: EXP2.packageDigest, copies_destroyed: true, recipient: 'NORDWERK GmbH' })).notice.state).toBe('acknowledged');
    await setMode('normal');
    const n5 = (await notify(authority, EXP2.id, HTTPS_KEY)).notice;
    expect(n5).toMatchObject({ state: 'acknowledged', attempt: 4 });
    // The PDP: the steward is not among the notify holders; an unknown destination 404; a destination that never received the package 409.
    await expect(notify(steward, EXP2.id, HTTPS_KEY)).rejects.toMatchObject({ status: 403 });
    await expect(notify(authority, EXP2.id, 'b14-nowhere')).rejects.toMatchObject({ status: 404 });
    await expect(notify(authority, EXP2.id, UNTRUSTED_KEY)).rejects.toThrow(/retention notice rejected: destination .* never received the package/);
    // A revoked package nobody received: no notices, nothing to notify.
    const EXP3 = await exported([mB.manifest_id]);
    const rv3 = await revokeExport(authority, EXP3.id, 'revoked before any delivery (harness)');
    expect(rv3.notices).toEqual([]); expect(rv3.stations).toEqual([]); expect(rv3.revocation['recipients']).toEqual([]);
    await expect(notify(authority, EXP3.id, HTTPS_KEY)).rejects.toThrow(/never received the package/);
    // The list and the read.
    const list = await listNotices(steward, EXP2.id);
    expect(list.notices.map((n) => [n['destination_key'], n['attempt'], n['state']])).toEqual([[HTTPS_KEY, 1, 'acknowledged'], [STATION_KEY, 1, 'acknowledged'], [STATION_KEY, 2, 'mismatched'], [HTTPS_KEY, 2, 'failed'], [HTTPS_KEY, 3, 'acknowledged'], [HTTPS_KEY, 4, 'acknowledged']]);
    // The export read refuses a revoked package as B11 left it (its bytes are gone); the notices are the list route's and the row's. An unrevoked package reads its (empty) notices.
    await expect(getExport(steward, EXP2.id)).rejects.toMatchObject({ status: 409 });
    expect((await getExport(steward, EXP1.id)).revocation_notices).toEqual([]);
    expect((await exportRow(EXP2.id))!.revoked_at).not.toBeNull();
    expect(containsString(await tenantRowsJson([EXP1.id, EXP2.id, EXP3.id]), DST_TOKEN)).toBe(false);
  }, 240_000);
});
