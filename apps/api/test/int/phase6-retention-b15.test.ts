/**
 * CP-6 B15 (migration 0075) — the RELATIONSHIP CLOSURE in the customer export (graph links: DP-47-002/-003, AU-COM-0058) and the
 * STREAMED ARCHIVE for larger packages (DP-47-006 "large-scale export") — on a real database, an isolated vault, an isolated transfer
 * station and the synthetic https recipient of B14 (spawned; the DeliveryEgress transport substituted as the B14 harness states —
 * the product's own pinned transport on a loopback socket, the address vetting the one substituted step).
 *
 *   L1 · THE CLOSURE — two uploads A and B; on A: a REL claim (internal) and an ENT claim (internal) whose lineage names A, a CLM claim
 *   classified RESTRICTED (above the export's internal ceiling), an edge asserted on the REL claim between two entities (one with an
 *   identifier); on B: nothing. The export of A and B → links.json beside the manifest and the object files, named by the manifest's
 *   package.links (file, links_digest = sha256 of the file, byte_length, format, the counts) INSIDE the package digest chain; the
 *   execution ledger's retention.export_links row; links.json: the two included claims with their lineage rows, the restricted claim
 *   EXCLUDED with the redaction gate, the edge with its provenance and both entities with the identifier; the product's verification
 *   counts the closure (files_present 4 incl. links.json, links_present, links_digest_ok); the customer's verifier on the directory and
 *   on the tar passes the links checks (the digest and size, the counts, the consistency); links.json tampered on disk → the product's
 *   verification fails on links_digest_ok and the verifier fails "links: sha256"; restored → verified again; an export of B alone → an
 *   empty closure (counts 0), still listed and verified.
 *
 *   S1 · THE STREAMED ARCHIVE — the stream route (POST …/export/stream) answers the raw tar with its length and the digests in headers,
 *   byte-equal to the in-memory build (buildUstar over the same entries and instant), export.downloaded on the action; ustarStream ===
 *   buildUstar for the package's entries; an object file tampered on disk → 409 before any byte (the disk pass), the file restored →
 *   served again; the station delivery's package.tar streamed = the archive digest; the https delivery streamed → the recipient's
 *   store holds the tar with the archive digest → ACKNOWLEDGED.
 *
 *   S2 · A PACKAGE ABOVE THE IN-MEMORY CEILING — seventeen uploads of 16,000,000 bytes (272 MB of records, above EXPORT_ARCHIVE_MAX_BYTES;
 *   the upload fixture's contract admits 16 MiB per object and one object per run here) exported
 *   (the build's digest by streaming, no in-memory file set); the JSON download refused (409, the ceiling named); the stream route serves
 *   the 270 MiB tar (written to disk here, hashed as it arrives: the archive digest); the customer's verifier scans it in constant
 *   memory (PACKAGE OK, the links check on the empty closure); the transfer-station delivery streams it (package.tar = the digest); the
 *   https delivery streams it to the recipient → ACKNOWLEDGED (its store holds the tar with the digest); the process's heap stays
 *   under 256 MiB throughout (measured before and after).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpsRequest } from 'node:https';
import { createWriteStream, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { DeliveryEgress } from '../../src/retention/export-delivery.service.js';
import { deliverPinned, type DeliveryRequest } from '../../src/observation/connectors/http-client.js';
import { EXPORT_ARCHIVE_MAX_BYTES, LINKS_FILE, buildUstar, listedFilesOf, ustarStream } from '../../src/retention/export-archive.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b15-vault-')));
const STATION_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b15-station-')));
const SCRATCH_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b15-scratch-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
const KEY1 = generateKeyPairSync('ed25519');
const KEY_REF = 'EYE_EXPORT_SIGNING_KEY_B15';
process.env[KEY_REF] = (KEY1.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
const spkiPem = (k: KeyObject): string => String(k.export({ type: 'spki', format: 'pem' })).trim();
const KEY1_PEM_FILE = join(SCRATCH_DIR, 'b15-key1.pub.pem');
writeFileSync(KEY1_PEM_FILE, `${spkiPem(KEY1.publicKey)}\n`);
const DST_REF = 'EYE_DST_B15';
const DST_TOKEN = `b15-${createHash('sha256').update(String(process.pid) + String(Date.now())).digest('hex').slice(0, 24)}`;
process.env[DST_REF] = DST_TOKEN;

const execFile = promisify(execFileCb);
const VERIFIER = resolvePath(__dirname, '../../../../scripts/retention/verify-export.mjs');
const RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/https-recipient.mjs');
const STATION_RECIPIENT = resolvePath(__dirname, '../../../../scripts/retention/transfer-station-recipient.mjs');
const RECIPIENT_HOST = 'recipient.b15.invalid';
const HTTPS_KEY = 'b15-https'; const STATION_KEY = 'b15-station';

let h: Phase4Harness; let retention: RetentionController; let vault: VaultService; let su: AnyDb; let egressProvider: DeliveryEgress;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal;
let recipient: ChildProcess | null = null; let recipientPort = 0; let recipientCert = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
type Row = Record<string, unknown>;
const readJson = (p: string): Row => JSON.parse(readFileSync(p, 'utf8')) as Row;
const E1 = uuidv7(); const E2 = uuidv7();

/* ───────────── the rows ───────────── */
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; source_id: string; content_digest: string; byte_length: number }>`select manifest_id::text, source_id::text, content_digest, byte_length::int from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
type ExportRow = { package_digest: string; archive_digest: string | null; byte_total: number; object_count: number };
const exportRow = async (id: string): Promise<ExportRow> => (await sql<ExportRow>`select package_digest, archive_digest, byte_total::int, object_count::int from retention.export_packages where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const executions = async (id: string) => (await sql<{ port: string; outcome: string; evidence: Row }>`select port, outcome, evidence from retention.executions where action_id = ${id}::uuid order by executed_at`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
const verifications = async (id: string) => (await sql<{ check_name: string; passed: boolean; observed: Row; expected: Row }>`select check_name, passed, observed, expected from retention.verifications where action_id = ${id}::uuid order by verified_at, check_name`.execute(su)).rows;

/* ───────────── the routes ───────────── */
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved' } }) as Promise<{ approval: { approvalId: string } }>;
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: { executed: number; held: number; refused: number; package: Row | null } }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
const getExport = (p: AuthenticatedPrincipal, id: string) => retention.getExport(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as unknown as Promise<{ package: Row; manifest: Row | null; files: string[] }>;
const declareKey = (p: AuthenticatedPrincipal, credentialRef: string) => retention.declareSigningKey(h.req(p, 'retention.signing_key.declare', 'RSK', null, 'retention'), T(), D(), { payload: { credentialRef, purpose: 'demonstration' } }) as Promise<{ key: Row }>;
const declareDestination = (p: AuthenticatedPrincipal, payload: Row) => retention.declareDestination(h.req(p, 'retention.destination.declare', 'RDS', null, 'retention'), T(), D(), { payload }) as Promise<{ destination: Row }>;
type Download = { filename: string; byteLength: number; archiveDigest: string; base64: string };
const downloadExport = (p: AuthenticatedPrincipal, id: string) => retention.downloadExport(h.req(p, 'retention.export.download', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ download: Download }>;
type Delivery = { delivery_id: string; state: string; attempt: number; receipt: Row | null; failure_class: string | null; egress: Row | null };
const deliverTo = (p: AuthenticatedPrincipal, id: string, destinationKey: string) => retention.deliverExport(h.req(p, 'retention.export.deliver', 'RTA', id, 'retention'), T(), D(), id, { payload: { destinationKey } }) as unknown as Promise<{ delivery: Delivery }>;
const collect = (p: AuthenticatedPrincipal, id: string, deliveryId: string) => retention.collectReceipt(h.req(p, 'retention.export.acknowledge', 'RDL', deliveryId, 'retention'), T(), D(), id, deliveryId) as unknown as Promise<{ delivery: Delivery }>;
/**
 * The stream route driven in process: a response double that is a real writable stream — `writeHead` records the status and headers,
 * the bytes are piped to a file and hashed as they arrive (never held whole), `finish`/`close` end it. A refusal before the first byte
 * is the route's HttpException (no headers written).
 */
const streamExport = async (p: AuthenticatedPrincipal, id: string, toFile: string): Promise<{ status: number; headers: Record<string, string>; digest: string; size: number; destroyed: boolean }> => {
  const sink = new PassThrough();
  const out = createWriteStream(toFile);
  const hash = createHash('sha256'); let size = 0; let status = 0; let headers: Record<string, string> = {}; let destroyed = false; let finished = false;
  sink.on('data', (c: Buffer) => { hash.update(c); size += c.byteLength; });
  sink.on('finish', () => { finished = true; });
  sink.pipe(out);
  const res = Object.assign(sink, {
    writeHead: (s: number, hd: Record<string, string>) => { status = s; headers = hd; return res; },
    status: (s: number) => { status = s; return res; },
    json: (_b: unknown) => res,
  });
  const origDestroy = sink.destroy.bind(sink);
  // A destroy BEFORE the answer finished is the route's abort (a digest that did not verify); the stream's own auto-destroy after 'finish' is not.
  (res as unknown as { destroy: (e?: Error) => void }).destroy = () => { if (!finished) destroyed = true; origDestroy(); };
  await retention.streamExport(h.req(p, 'retention.export.download', 'RTA', id, 'retention'), res as never, T(), D(), id);
  await new Promise<void>((r) => { if (out.closed) r(); else out.on('close', () => r()); });
  return { status, headers, digest: hash.digest('hex'), size, destroyed };
};
const upload = async (files: Array<{ name: string; text: string }>, label = '') =>
  h.upload(files.map((f) => ({ filename: `${f.name}.csv`, text: f.text, documentTime: '2024-01-14T00:00:00Z' })), 'internal', label) as Promise<Array<{ id: string; version: number; digest: string }>>;
const exported = async (manifestIds: string[]): Promise<{ id: string; packageDigest: string; archiveDigest: string; byteTotal: number }> => {
  const o = await open(steward, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal' } });
  const id = o.action.actionId;
  const r = await resolve(steward, id);
  await approve(authority, id, String(r.scope['scope_digest']));
  const ex = await execute(steward, id);
  expect(ex.execution).toMatchObject({ executed: manifestIds.length, refused: 0, held: 0 });
  expect((await verify(steward, id)).verification).toMatchObject({ verified: true });
  const row = await exportRow(id);
  expect(row.archive_digest).toMatch(HEX64);
  return { id, packageDigest: row.package_digest, archiveDigest: row.archive_digest!, byteTotal: row.byte_total };
};
const exportDir = (id: string) => join(vault.rootFor('export'), T(), D(), id);
const stationDir = (id: string) => join(STATION_DIR, T(), D(), id);
const run = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try { const r = await execFile(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { code: 0, stdout: r.stdout, stderr: r.stderr }; }
  catch (e) { const err = e as { code?: number; stdout?: string; stderr?: string }; return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }; }
};
type VerifierJson = { code: number; ok: boolean; failed: number; checks: Array<{ name: string; ok: boolean | null; detail: string | null }> };
const parseVerifier = (r: { code: number; stdout: string; stderr: string }): VerifierJson => { try { return { code: r.code, ...(JSON.parse(r.stdout) as Omit<VerifierJson, 'code'>) }; } catch { throw new Error(`the verifier did not answer JSON (exit ${r.code}): ${r.stdout.slice(0, 400)} ${r.stderr.slice(0, 400)}`); } };
const verifyDir = async (dir: string, ...extra: string[]) => parseVerifier(await run([VERIFIER, dir, '--json', ...extra]));
const verifyTar = async (file: string, ...extra: string[]) => parseVerifier(await run([VERIFIER, '--tar', file, '--json', ...extra]));
const failedChecks = (v: VerifierJson) => v.checks.filter((c) => c.ok === false).map((c) => `${c.name}${c.detail === null ? '' : ` — ${c.detail}`}`);
const linksChecks = (v: VerifierJson) => v.checks.filter((c) => c.name.startsWith('links:'));
const recipientCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Row }> => new Promise((res, rej) => {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const req = httpsRequest({ host: '127.0.0.1', port: recipientPort, servername: RECIPIENT_HOST, path, method, ca: recipientCert, rejectUnauthorized: true,
                             headers: { authorization: `Bearer ${DST_TOKEN}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
    const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row }); } catch (e) { rej(e); } });
  });
  req.on('error', rej); if (payload !== null) req.write(payload); req.end();
});
const receivedAtRecipient = async () => (await recipientCall('GET', '/_received')).body as { received: Row[] };

/** A claim as the extraction would have admitted it, its lineage naming the given evidence bytes; the header classification as given. */
async function seedClaim(a: { type: 'REL' | 'ENT' | 'CLM'; evidence: { id: string; version: number }; digest: string; classification: 'internal' | 'restricted'; payload: Row }): Promise<{ claimId: string; runId: string; methodId: string }> {
  const claimId = uuidv7(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: a.digest, byte_start: 0, byte_end: 4, extraction_identity: sha256(claimId), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload = { ...a.payload, confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null } };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, observation_time, time_precision, source_clock_quality, source_object_ids, evidence_refs, payload)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', 'extracted', false, ${a.classification}, 'intelligence', ${`${a.type}@v1`}, ${uuidv7()}::uuid, ${sha256(claimId)}, 'fixture-extraction@1.0.0', clock_timestamp(), clock_timestamp(), 'exact', 'trusted',
            ${JSON.stringify([a.evidence.id])}::jsonb, ${JSON.stringify([`EVD:${a.evidence.id}@${a.evidence.version}`])}::jsonb, ${JSON.stringify(payload)}::jsonb)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.digest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, runId, methodId };
}
const assertEdgeGoverned = async (a: { predicate: string; claimId: string; evidenceId: string; evidenceDigest: string }): Promise<string> => {
  const edgeId = uuidv7();
  await h.pipeline.write(h.env(owner, 'graph.edge.assert', 'EDG', edgeId, 'graph'), owner, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
    async (cap) => {
      await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: E2, predicate: a.predicate, object: E1, validFrom: '2024-01-01T00:00:00.000Z', validTo: null, claimObjectId: a.claimId, claimVersion: 1, evidenceObjectId: a.evidenceId, evidenceDigest: a.evidenceDigest, methodId: null, runId: null, mode: 'replay', confidence: 0.7, actor: owner.principalId, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: { edgeId }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
    });
  return edgeId;
};
/** CSV-shaped ASCII of the given size (the upload fixture's contract admits 16 MiB per object and 32 MiB per run), each file different: a salt in every line. */
const bigText = (salt: string, bytes: number): string => {
  const line = `${salt},row,${'x'.repeat(200)}\n`;
  const lines = Math.floor(bytes / line.length);
  return `key,kind,value\n${line.repeat(lines)}`;
};

let evdA = { id: '', version: 1, digest: '' }; let evdB = { id: '', version: 1, digest: '' };
let mA = { manifest_id: '', source_id: '', content_digest: '', byte_length: 0 }; let mB = { manifest_id: '', source_id: '', content_digest: '', byte_length: 0 };
let relClaim = ''; let entClaim = ''; let restrictedClaim = ''; let edgeId = '';
let EXP1 = { id: '', packageDigest: '', archiveDigest: '', byteTotal: 0 };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  retention = h.app.get(R); vault = h.app.get(VaultService); egressProvider = h.app.get(DeliveryEgress);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b15-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b15-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b15-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b15-tenant-admin', 'TENANT');
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'resolution_manager'], 'b15-owner');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
  recipient = spawn(process.execPath, [RECIPIENT, '--self-signed', RECIPIENT_HOST, '--listen', '127.0.0.1:0', '--bearer-env', DST_REF, '--public-key', KEY1_PEM_FILE, '--recipient', 'NORDWERK GmbH — harness https endpoint (B15)', '--store', join(SCRATCH_DIR, 'recipient-store')], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  egressProvider.deliver = (req: DeliveryRequest) => deliverPinned(req, '127.0.0.1');
  await declareKey(tenantAdmin, KEY_REF);
  await declareDestination(domainAdmin, { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION_DIR, recipient: 'NORDWERK GmbH — harness transfer station (B15)', purpose: 'the periodic export (harness)' });
  await declareDestination(domainAdmin, { destinationKey: HTTPS_KEY, kind: 'https', endpoint: `https://${RECIPIENT_HOST}:${recipientPort}/receive`, credentialRef: DST_REF, trustAnchorPem: recipientCert, recipient: 'NORDWERK GmbH — harness https endpoint (B15)', purpose: 'the streamed https delivery' });
}, 300_000);

afterAll(async () => {
  delete process.env[KEY_REF]; delete process.env[DST_REF];
  if (recipient !== null) recipient.kill('SIGTERM');
  await h?.close();
  await su?.destroy();
  for (const dir of [VAULT_DIR, STATION_DIR, SCRATCH_DIR]) rmSync(dir, { recursive: true, force: true });
}, 120_000);

describe('L · THE RELATIONSHIP CLOSURE (D1; DP-47-002/-003)', () => {
  it('L1 · two uploads; on A a REL claim, an ENT claim, a RESTRICTED claim and an edge on the REL claim between two entities (one with an identifier); the export of A and B → links.json named by package.links inside the digest chain, the retention.export_links row; the closure: the two claims with their lineage, the restricted one EXCLUDED (redaction), the edge with its provenance, both entities with the identifier; the product\'s verification counts it; the verifier on the directory and the tar passes the links checks; links.json tampered → the product fails links_digest_ok and the verifier fails the digest; restored → verified; an export of B alone → an empty closure, listed and verified', async () => {
    const up = await upload([{ name: 'b15-a', text: TERMS_CSV }, { name: 'b15-b', text: TERMS_CSV.replace('assumption', 'assumption (b)') }]);
    evdA = { id: up[0]!.id, version: up[0]!.version, digest: up[0]!.digest }; evdB = { id: up[1]!.id, version: up[1]!.version, digest: up[1]!.digest };
    mA = await manifestRow((await manifestOf(evdA.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(evdB.id, 1)).manifest_id);
    relClaim = (await seedClaim({ type: 'REL', evidence: evdA, digest: evdA.digest, classification: 'internal', payload: { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait' } })).claimId;
    entClaim = (await seedClaim({ type: 'ENT', evidence: evdA, digest: evdA.digest, classification: 'internal', payload: { claim_kind: 'entity', name: 'NORDWERK Magnet GmbH', entity_type: 'organization' } })).claimId;
    restrictedClaim = (await seedClaim({ type: 'CLM', evidence: evdA, digest: evdA.digest, classification: 'restricted', payload: { claim_kind: 'assertion', statement: 'a restricted finding' } })).claimId;
    edgeId = await assertEdgeGoverned({ predicate: 'ships_through', claimId: relClaim, evidenceId: evdA.id, evidenceDigest: evdA.digest });
    await sql`insert into graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
      values ('DOMAIN', ${T()}::uuid, ${D()}::uuid, 'lei', 'GLEIF', 'Legal Entity Identifier', true, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', '5299000NORDWERK00001', ${entClaim}::uuid, ${evdA.id}::uuid, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    EXP1 = await exported([mA.manifest_id, mB.manifest_id]);
    const dir = exportDir(EXP1.id);
    expect(existsSync(join(dir, LINKS_FILE))).toBe(true);
    const manifest = readJson(join(dir, 'manifest.json'));
    const linksBlock = (manifest['package'] as Row)['links'] as Row;
    const linksBytes = readFileSync(join(dir, LINKS_FILE));
    expect(linksBlock).toMatchObject({ file: LINKS_FILE, links_digest: sha256(linksBytes), byte_length: linksBytes.byteLength, format: 'eye-customer-export-links/1', claims: 2, edges: 1, entities: 2, excluded: 1 });
    // The closure is INSIDE the chain: the manifest's package block is covered by the package digest (the verifier recomputes it below).
    const links = JSON.parse(linksBytes.toString('utf8')) as Row;
    expect(links).toMatchObject({ format: 'eye-customer-export-links/1', package: { action_id: EXP1.id }, evidence: expect.arrayContaining([evdA.id, evdB.id]), counts: { claims: 2, edges: 1, entities: 2, excluded: 1 } });
    const claims = links['claims'] as Row[];
    expect(claims.map((c) => [c['object_id'], c['object_type']]).sort()).toEqual([[relClaim, 'REL'], [entClaim, 'ENT']].sort());
    for (const c of claims) {
      expect(c).toMatchObject({ object_version: 1, content_digest: sha256(String(c['object_id'])) });
      expect((c['lineage'] as Row[])).toEqual([expect.objectContaining({ claim_version: 1, evidence_object_id: evdA.id, evidence_digest: evdA.digest, byte_start: 0, byte_end: 4, mode: 'replay' })]);
      expect(((c['header'] as Row)['classification'])).toBe('internal');
    }
    expect(links['excluded']).toEqual([expect.objectContaining({ kind: 'claim', object_id: restrictedClaim, gate: 'redaction' })]);
    const edges = links['edges'] as Row[];
    expect(edges).toEqual([expect.objectContaining({ edge_id: edgeId, predicate: 'ships_through', subject_entity_id: E2, object_entity_id: E1, state: 'asserted', claim: { object_id: relClaim, object_version: 1 }, evidence: { object_id: evdA.id, digest: evdA.digest }, confidence: 0.7 })]);
    const entities = links['entities'] as Row[];
    expect(entities.map((e) => e['entity_id']).sort()).toEqual([E1, E2].sort());
    expect(entities.find((e) => e['entity_id'] === E2)).toMatchObject({ entity_type: 'organization', canonical_name: 'NORDWERK Magnet GmbH', identifiers: [expect.objectContaining({ system_key: 'lei', value: '5299000NORDWERK00001', source_claim_object_id: entClaim })] });
    expect(entities.find((e) => e['entity_id'] === E1)).toMatchObject({ entity_type: 'place', identifiers: [] });
    // The execution ledger: the closure's row before the record's, with the digest and the counts.
    const ex = await executions(EXP1.id);
    expect(ex.map((e) => e.port)).toEqual(['vault.export', 'vault.export', 'retention.export_links', 'retention.record_export_package']);
    expect(ex[2]!.evidence).toMatchObject({ file: LINKS_FILE, links_digest: sha256(linksBytes), byte_length: linksBytes.byteLength, claims: 2, edges: 1, entities: 2, excluded: 1 });
    // The product's verification counts the closure; the read lists the file.
    const pkgCheck = (await verifications(EXP1.id)).find((c) => /the export package/.test(c.check_name))!;
    expect(pkgCheck.passed).toBe(true);
    expect(pkgCheck.observed).toMatchObject({ files_present: 4, objects_listed: 2, links_named: true, links_present: true, links_digest_ok: true });
    expect((await getExport(steward, EXP1.id)).files.sort()).toEqual(['manifest.json', LINKS_FILE, `${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`].sort());
    // The customer's verifier: the links checks on the directory and on the tar.
    const vd = await verifyDir(dir, '--public-key', KEY1_PEM_FILE);
    expect(failedChecks(vd)).toEqual([]); expect(vd.ok).toBe(true);
    expect(linksChecks(vd).map((c) => c.ok)).toEqual([true, true, true]);
    expect(linksChecks(vd)[1]!.detail).toMatch(/2 claim\(s\), 1 edge\(s\), 2 entities, 1 excluded/);
    const tarFile = join(SCRATCH_DIR, `${EXP1.id}.tar`);
    const st = await streamExport(steward, EXP1.id, tarFile);
    expect(st.status).toBe(200);
    const vt = await verifyTar(tarFile, '--public-key', KEY1_PEM_FILE);
    expect(failedChecks(vt)).toEqual([]); expect(linksChecks(vt).map((c) => c.ok)).toEqual([true, true, true]);
    // links.json tampered on disk (a verified action is not verified again; the download's disk pass is the product's check from here): the stream
    // route refuses as an integrity failure before any byte; the verifier fails the closure's digest check; restored → served and verified again.
    writeFileSync(join(dir, LINKS_FILE), linksBytes.toString('utf8').replace('"claims"', '"claims_"'));
    await expect(streamExport(steward, EXP1.id, join(SCRATCH_DIR, 'never-l1.tar'))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/does not rebuild to its recorded digest/) });
    const vBad = await verifyDir(dir, '--public-key', KEY1_PEM_FILE);
    expect(vBad.ok).toBe(false); expect(failedChecks(vBad).join(' | ')).toMatch(/links: links\.json sha256 and size/);
    writeFileSync(join(dir, LINKS_FILE), linksBytes);
    expect((await streamExport(steward, EXP1.id, join(SCRATCH_DIR, `${EXP1.id}.l1b.tar`))).digest).toBe(EXP1.archiveDigest);
    expect(failedChecks(await verifyDir(dir, '--public-key', KEY1_PEM_FILE))).toEqual([]);
    // An export of B alone: nothing derived from B → an empty closure, listed and verified all the same.
    const e2 = await exported([mB.manifest_id]);
    const m2 = readJson(join(exportDir(e2.id), 'manifest.json'));
    expect((m2['package'] as Row)['links']).toMatchObject({ file: LINKS_FILE, claims: 0, edges: 0, entities: 0, excluded: 0 });
    const l2 = readJson(join(exportDir(e2.id), LINKS_FILE));
    expect(l2).toMatchObject({ claims: [], edges: [], entities: [], excluded: [], evidence: [evdB.id] });
    const v2 = await verifyDir(exportDir(e2.id), '--public-key', KEY1_PEM_FILE);
    expect(failedChecks(v2)).toEqual([]); expect(linksChecks(v2)[1]!.detail).toMatch(/0 claim\(s\), 0 edge\(s\), 0 entities, 0 excluded/);
  }, 240_000);
});

describe('S · THE STREAMED ARCHIVE (D2; DP-47-006)', () => {
  it('S1 · the stream route answers the raw tar with its length and the digests in headers, byte-equal to the in-memory build; ustarStream = buildUstar; export.downloaded; an object file tampered → 409 before any byte, restored → served; the station delivery streamed = the digest; the https delivery streamed → the recipient holds the tar → ACKNOWLEDGED', async () => {
    const dir = exportDir(EXP1.id);
    const manifestBytes = readFileSync(join(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as { package: { built_at: string }; objects: unknown };
    const listed = listedFilesOf(manifest.objects, manifest as { package: { links?: unknown } });
    const mtime = Math.floor(Date.parse(manifest.package.built_at) / 1000);
    const entries = [{ name: 'manifest.json', bytes: manifestBytes }, ...listed.map((f) => ({ name: f, bytes: readFileSync(join(dir, f)) }))];
    const inMemory = buildUstar(entries, mtime);
    expect(sha256(inMemory)).toBe(EXP1.archiveDigest);
    // ustarStream produces the same bytes as buildUstar for the same entries and instant; its size is announced ahead; its digest known at the end.
    const streamed = ustarStream(entries.map((e) => ({ name: e.name, size: e.bytes.byteLength, open: () => Readable.from([e.bytes]) })), mtime);
    expect(streamed.size).toBe(inMemory.byteLength);
    const chunks: Buffer[] = []; for await (const c of streamed.stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(inMemory)).toBe(true);
    expect(await streamed.digest()).toBe(EXP1.archiveDigest);
    // The stream route.
    const tarFile = join(SCRATCH_DIR, `${EXP1.id}.s1.tar`);
    const st = await streamExport(steward, EXP1.id, tarFile);
    expect(st).toMatchObject({ status: 200, digest: EXP1.archiveDigest, size: inMemory.byteLength, destroyed: false });
    expect(st.headers).toMatchObject({ 'content-type': 'application/x-tar', 'content-length': String(inMemory.byteLength), 'x-eye-archive-digest': EXP1.archiveDigest, 'x-eye-package-digest': EXP1.packageDigest, 'x-eye-signature-scheme': 'eye-customer-export/2' });
    expect(st.headers['x-eye-key-id']).toMatch(/^ed25519:/); expect(st.headers['x-eye-signature']).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(readFileSync(tarFile).equals(inMemory)).toBe(true);
    const downloaded = (await events(EXP1.id)).filter((e) => e.event === 'export.downloaded');
    expect(downloaded.length).toBeGreaterThanOrEqual(2); // L1's stream and this one
    expect(downloaded.at(-1)!.details).toMatchObject({ archive_digest: EXP1.archiveDigest });
    // An object file tampered on disk: the disk pass refuses before any byte; restored → served again.
    const binName = `${mA.manifest_id}.bin`; const original = readFileSync(join(dir, binName));
    writeFileSync(join(dir, binName), Buffer.concat([original.subarray(0, 1), Buffer.from([original[1]! ^ 0x01]), original.subarray(2)]));
    await expect(streamExport(steward, EXP1.id, join(SCRATCH_DIR, 'never.tar'))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/does not rebuild to its recorded digest/) });
    writeFileSync(join(dir, binName), original);
    expect((await streamExport(steward, EXP1.id, join(SCRATCH_DIR, `${EXP1.id}.s1b.tar`))).digest).toBe(EXP1.archiveDigest);
    // The station delivery streams the tar; the https delivery streams it to the recipient.
    const ds = (await deliverTo(authority, EXP1.id, STATION_KEY)).delivery;
    expect(ds.state).toBe('delivered');
    expect(sha256(readFileSync(join(stationDir(EXP1.id), 'package.tar')))).toBe(EXP1.archiveDigest);
    expect((await run([STATION_RECIPIENT, STATION_DIR, T(), D(), EXP1.id, '--public-key', KEY1_PEM_FILE])).code).toBe(0);
    expect((await collect(authority, EXP1.id, ds.delivery_id)).delivery.state).toBe('acknowledged');
    const dh = (await deliverTo(authority, EXP1.id, HTTPS_KEY)).delivery;
    expect(dh).toMatchObject({ state: 'acknowledged', attempt: 1 });
    expect(dh.receipt).toMatchObject({ delivery_id: dh.delivery_id, archive_digest: EXP1.archiveDigest, verified: true });
    const held = (await receivedAtRecipient()).received.find((r) => r['delivery_id'] === dh.delivery_id)!;
    expect(held).toMatchObject({ archive_digest: EXP1.archiveDigest, byte_length: inMemory.byteLength, verified: true });
  }, 240_000);

  it('S2 · a package ABOVE the in-memory ceiling (seventeen uploads of 16,000,000 bytes): built by streaming; the JSON download refused with the ceiling named; the stream route serves the 270 MiB tar (hashed as it arrives = the archive digest); the verifier scans it in constant memory; the station delivery streams it; the https delivery streams it to the recipient → ACKNOWLEDGED; the heap stays under 256 MiB', async () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const ids: string[] = [];
    const PER_FILE = 16_000_000; const FILES = 17;
    for (let i = 0; i < FILES; i += 1) {
      const up = await upload([{ name: `b15-big-${i}`, text: bigText(`b15-big-${i}`, PER_FILE) }], 'b15-big');
      ids.push((await manifestOf(up[0]!.id, 1)).manifest_id);
    }
    const big = await exported(ids);
    expect(big.byteTotal).toBeGreaterThan(EXPORT_ARCHIVE_MAX_BYTES);
    // The JSON download (the in-memory archive) refuses above its ceiling, naming it; the stream route serves it.
    await expect(downloadExport(steward, big.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/above the archive ceiling/) });
    const tarFile = join(SCRATCH_DIR, `${big.id}.tar`);
    const st = await streamExport(steward, big.id, tarFile);
    expect(st).toMatchObject({ status: 200, digest: big.archiveDigest, destroyed: false });
    expect(Number(st.headers['content-length'])).toBe(st.size);
    expect(statSync(tarFile).size).toBe(st.size);
    expect(st.size).toBeGreaterThan(big.byteTotal);
    // The customer's verifier scans the tar (constant memory: the manifest and the links file kept, every entry hashed as it passes).
    const vt = await verifyTar(tarFile, '--public-key', KEY1_PEM_FILE);
    expect(failedChecks(vt)).toEqual([]); expect(vt.ok).toBe(true);
    expect(vt.checks.find((c) => c.name.startsWith('archive readable'))!.detail).toMatch(new RegExp(`${st.size} bytes, ${FILES + 2} entries, archive digest ${big.archiveDigest}`));
    // The station delivery streams the tar to the station (its temp file, fsync, rename); the recipient verifies it and answers.
    const ds = (await deliverTo(authority, big.id, STATION_KEY)).delivery;
    expect(ds.state).toBe('delivered');
    const stationTar = join(stationDir(big.id), 'package.tar');
    expect(statSync(stationTar).size).toBe(st.size);
    const stationHash = createHash('sha256'); for await (const c of (await import('node:fs')).createReadStream(stationTar)) stationHash.update(c as Buffer);
    expect(stationHash.digest('hex')).toBe(big.archiveDigest);
    expect((await run([STATION_RECIPIENT, STATION_DIR, T(), D(), big.id, '--public-key', KEY1_PEM_FILE])).code).toBe(0);
    expect((await collect(authority, big.id, ds.delivery_id)).delivery.state).toBe('acknowledged');
    // The https delivery streams the tar to the recipient, which streams it to its store, verifies and answers.
    const dh = (await deliverTo(authority, big.id, HTTPS_KEY)).delivery;
    expect(dh).toMatchObject({ state: 'acknowledged', attempt: 1 });
    expect(dh.receipt).toMatchObject({ delivery_id: dh.delivery_id, archive_digest: big.archiveDigest, verified: true });
    const held = (await receivedAtRecipient()).received.find((r) => r['delivery_id'] === dh.delivery_id)!;
    expect(held).toMatchObject({ archive_digest: big.archiveDigest, byte_length: st.size, verified: true });
    // The process never held the archive: the heap's high-water mark after all of this stays under the in-memory ceiling.
    if (typeof global.gc === 'function') global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    expect(heapAfter - heapBefore).toBeLessThan(EXPORT_ARCHIVE_MAX_BYTES);
  }, 600_000);
});
