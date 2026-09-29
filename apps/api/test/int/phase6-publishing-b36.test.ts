/**
 * CP-6 B36 §D (0094 part `publishing`) — THE PUBLISHING AND DISTRIBUTION CENTER (F-P6-13) on the real database and controllers.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case:
 *   d1 the publication object binding EXACT BYTES (under the vault export root, by sha256) to audience, classification and channel;
 *   d2 approve-digest (signed) and deliver with receipts (in_app + the SYNTHETIC email / teams adapters to THIS file's own local sinks —
 *      scripts/attention/local-sinks.mjs on loopback; never :2525/:3446; no real provider — closes no real-provider clause), acknowledge;
 *   d3 correction versioning with recipient notification (attention items of class publication.correction + the channel notices) and
 *      withdrawal (bytes retained; the PUB's withdrawn version);
 *   d4 an external communication draft under review (TC-12) — the external delivery SYNTHETIC;
 *   d5 archive under the source's controls; export refused under a legal hold or a residency restriction.
 * Personas: a drafter (executive_operator), an approver (executive), a second executive (the external reviewer), three recipients
 * (board_member x2, the decision owner), a domain administrator (the legal hold), an external audience (SYNTHETIC: the partner firm).
 * The signing key is this file's own Ed25519 pair. Every figure is SYNTHETIC (the NORDWERK fixture world of phase6-fixtures.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import type { PublishingController } from '../../src/executive/publishing/publishing.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

// This file's own vault roots (the bytes under the export root) and its own signing key (the §0 signer reads it by reference).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b36-publishing-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
const KEYS = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEYS.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const PUBLIC_PEM = createPublicKey(KEYS.privateKey).export({ format: 'pem', type: 'spki' }).toString();
const SINKS = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/attention/local-sinks.mjs');

type Row = Record<string, unknown>;
type AnyDb = Phase4Harness['su'];
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let pubs: PublishingController; let obs: ObservationController;
let drafter: AuthenticatedPrincipal; let approver: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let board1: AuthenticatedPrincipal; let board2: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let sinks: ChildProcess | null = null; let httpPort = 0; let smtpPort = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const sinkReceived = async (): Promise<Row[]> => ((await (await fetch(`http://127.0.0.1:${httpPort}/_received`)).json()) as { received: Row[] }).received;
const sinkMode = async (channel: string, mode: 'ok' | 'fail') => { await fetch(`http://127.0.0.1:${httpPort}/_control`, { method: 'POST', body: JSON.stringify({ channel, mode }) }); };
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const P = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'PUB', id, 'decision');
const draft = (as: AuthenticatedPrincipal, payload: Row) => pubs.draft(P(as, 'executive.publication.draft'), T(), D(), { payload }) as unknown as Promise<{ publication: Row }>;
const get = (as: AuthenticatedPrincipal, id: string) => pubs.get(P(as, 'executive.publication.read', id), T(), D(), id) as unknown as Promise<{ publication: Row & { versions: Row[]; deliveries: Row[]; external_drafts: Row[]; events: Row[] } }>;
const list = (as: AuthenticatedPrincipal) => pubs.list(P(as, 'executive.publication.read'), T(), D()) as unknown as Promise<{ publications: Row[] }>;
const bytesOf = (as: AuthenticatedPrincipal, id: string, v: number) => pubs.bytes(P(as, 'executive.publication.read', id), T(), D(), id, String(v)) as unknown as Promise<{ bytes: Row }>;
const approve = (as: AuthenticatedPrincipal, id: string, v: number, digest: string) => pubs.approve(P(as, 'executive.publication.approve', id), T(), D(), id, String(v), { payload: { digest } }) as unknown as Promise<{ approval: Row }>;
const deliver = (as: AuthenticatedPrincipal, id: string, v: number) => pubs.deliver(P(as, 'executive.publication.deliver', id), T(), D(), id, String(v)) as unknown as Promise<{ delivery: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, deliveryId: string) => pubs.acknowledge(P(as, 'executive.publication.acknowledge', deliveryId), T(), D(), deliveryId, { payload: { note: 'read (B36 harness)' } }) as unknown as Promise<{ acknowledgement: Row }>;
const correct = (as: AuthenticatedPrincipal, id: string, payload: Row) => pubs.correct(P(as, 'executive.publication.correct', id), T(), D(), id, { payload }) as unknown as Promise<{ correction: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason: string) => pubs.withdraw(P(as, 'executive.publication.withdraw', id), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ withdrawal: Row }>;
const archive = (as: AuthenticatedPrincipal, id: string) => pubs.archive(P(as, 'executive.publication.archive', id), T(), D(), id) as unknown as Promise<{ archive: Row }>;
const exportGet = (as: AuthenticatedPrincipal, id: string) => pubs.exportGet(P(as, 'executive.publication.export', id), T(), D(), id) as unknown as Promise<{ export: Row }>;
const review = (as: AuthenticatedPrincipal, draftId: string, payload: Row) => pubs.review(P(as, 'executive.external_draft.review', draftId), T(), D(), draftId, { payload }) as unknown as Promise<{ review: Row }>;
const placeHold = (evdId: string, reason: string) => obs.placeLegalHold(h.req(dadmin, 'observation.legal_hold.place', 'LGH', null, 'platform.administration'), T(), D(), evdId, { payload: { reason } }) as unknown as Promise<{ hold: Row }>;
const liftHold = (holdId: string, reason: string) => obs.liftLegalHold(h.req(dadmin, 'observation.legal_hold.lift', 'LGH', holdId, 'platform.administration'), T(), D(), holdId, { payload: { reason } }) as unknown as Promise<unknown>;

/* ───────────── the rows ───────────── */
const dbNow = async (): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t.toISOString();
const dpkDigest = async (pkg: string, v: number): Promise<string> => (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_type = 'DPK' and object_id = ${pkg}::uuid and object_version = ${v}`.execute(su)).rows[0]!.d;
const pubObjects = async (id: string) => (await sql<Row>`select object_version::int object_version, lifecycle_state, truth_state, classification, residency_profile, retention_profile, rights_profile, withdrawal_reason, supersedes, content_ref, payload, content_digest from objects.canonical_objects where object_type = 'PUB' and object_id = ${id}::uuid order by object_version`.execute(su)).rows;
const attentionItems = async (id: string) => (await sql<Row>`select item_id::text, signal_class, subject_kind, subject_id::text, state, owner_principal_id::text, title, details, cause_event_type from executive.attention_items where subject_id = ${id}::uuid order by created_at`.execute(su)).rows;
const signatures = async (id: string, v: number) => (await sql<Row>`select signature_id::text, signer::text, key_id, signature, subject_digest, bound_action from executive.signatures where subject_kind = 'publication' and subject_id = ${id}::uuid and subject_version = ${v}`.execute(su)).rows;
const composeBriefing = async (as: AuthenticatedPrincipal, prior: string | null) => {
  const knownAt = await dbNow();
  const r = await w.exec.compose(h.req(as, 'briefing.compose', 'BRF', null, 'briefing'), T(), D(), { payload: { roomId: null, knownAt, priorBriefingId: prior } }) as unknown as { briefing: { briefingId: string; contentDigest: string } };
  return { id: r.briefing.briefingId, digest: r.briefing.contentDigest };
};
const exportFile = (pubId: string, vaultRef: string) => join(VAULT_DIR, 'export', T(), D(), vaultRef);

/** What the cases leave one another. */
let dc: ReturnType<typeof decisionCalls>;
let report = { pkg: '', v: 0, digest: '' };
let reportPub = ''; let reportDigest = ''; let reportBlob = '';
let briefing1 = { id: '', digest: '' }; let briefing2 = { id: '', digest: '' };
let briefingPub = ''; let briefingV1Digest = '';
let externalPub = ''; let externalDraftId = ''; let externalDigest = '';
let boardDeliveryId = '';

const AUDIENCE = () => ({ roles: ['board_member'], recipients: [w.owner.principalId] });
const DRAFT = (over: Row = {}): Row => ({ title: 'Board pack — the corridor decision (SYNTHETIC)', sourceKind: 'report', sourceId: report.pkg, sourceVersion: report.v, sourceDigest: report.digest, audience: AUDIENCE(),
  classification: 'internal', channels: ['in_app', 'email', 'teams'], format: 'html', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: null, ...over });

beforeAll(async () => {
  // THE LOCAL SINKS first (loopback, free ports), then the API configured with them — the adapters never reach anything else.
  sinks = spawn(process.execPath, [SINKS, '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  await new Promise<void>((resolve, reject) => { sinks!.stdout!.on('data', (c: Buffer) => { out += c.toString(); if (out.includes('ready')) resolve(); }); sinks!.once('exit', () => reject(new Error(`the sinks exited: ${out}`))); });
  smtpPort = Number(/smtp (\d+)/.exec(out)![1]); httpPort = Number(/http (\d+)/.exec(out)![1]);
  process.env['EYE_ATTENTION_SINK_HOST'] = '127.0.0.1';
  process.env['EYE_ATTENTION_SMTP_PORT'] = String(smtpPort);
  process.env['EYE_ATTENTION_SMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/sms`;
  process.env['EYE_ATTENTION_TEAMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/teams`;
  h = await Phase4Harness.boot();
  su = h.su;
  const { PublishingController: Pc } = await import('../../src/executive/publishing/publishing.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  pubs = h.app.get(Pc); obs = h.app.get(Oc);
  w = await bootDecisionWorld(h);
  dc = decisionCalls(h, w);
  drafter = await h.humanWithSession(['executive_operator'], 'b36p-operator');
  approver = w.executive;
  reviewer = await h.humanWithSession(['executive'], 'b36p-executive-2');
  board1 = await h.humanWithSession(['board_member'], 'b36p-board-1');
  board2 = await h.humanWithSession(['board_member'], 'b36p-board-2');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36p-domain-admin');
  const p = await dc.proposed();
  report = { pkg: p.pkg, v: p.v, digest: await dpkDigest(p.pkg, p.v) };
  briefing1 = await composeBriefing(approver, null);
}, 600_000);

afterAll(async () => {
  await h?.close();
  sinks?.kill();
}, 120_000);

describe('B36 · the publishing and distribution center (0094 part publishing; F-P6-13)', () => {
  it('d1 · POSITIVE: a report publication drafted — the exact bytes under the export root by sha256, the DPK snapshot bound by digest, the audience resolved, in_app + the synthetic channels, html, board-pack@1', async () => {
    const r = (await draft(drafter, DRAFT())).publication;
    reportPub = String(r['publication_id']); reportDigest = String(r['bytes_digest']); reportBlob = String(r['vault_ref']);
    expect(r).toMatchObject({ version: 1, state: 'drafted', classification: 'internal', channels: ['in_app', 'email', 'teams'], format: 'html', external_draft_id: null });
    expect(String(r['vault_ref'])).toMatch(new RegExp(`^${reportPub}/[0-9a-f-]{36}\\.bin$`));
    expect(arr(r['recipients']).map((x) => String(x['principal_id'])).sort()).toEqual([board1.principalId, board2.principalId, w.owner.principalId].sort());
    // the bytes on disk ARE the bytes recorded
    const file = exportFile(reportPub, reportBlob);
    expect(existsSync(file)).toBe(true);
    const onDisk = readFileSync(file);
    expect(sha256(onDisk)).toBe(reportDigest);
    expect(onDisk.toString('utf8')).toMatch(/<!doctype html>/);
    expect(onDisk.toString('utf8')).toContain(`content="${reportPub}@1"`);
    expect(onDisk.toString('utf8')).toContain(report.digest); // the snapshot digest inside the bytes
    // the read-back verifies against the recorded digest
    const b = (await bytesOf(drafter, reportPub, 1)).bytes;
    expect(b).toMatchObject({ verified: true, bytes_digest: reportDigest, format: 'html' });
    const g = (await get(drafter, reportPub)).publication;
    expect(g['state']).toBe('drafted');
    expect(g.versions[0]).toMatchObject({ version: 1, state: 'drafted', source_kind: 'report', source_id: report.pkg, source_version: report.v, source_digest: report.digest, bytes_digest: reportDigest, byte_length: onDisk.byteLength });
  });

  it('d1 · REFUSAL: a wider classification of an internal source (public) refused; pdf-a refused as unsupported in words; a stale snapshot digest refused; an audience of nobody refused; an unknown recipient refused', async () => {
    await refused(draft(drafter, DRAFT({ classification: 'public' })), /^publication rejected \(classification\): the source is classified internal; a publication classified public would widen it/, 422, 'EYE-REQ-001');
    await refused(draft(drafter, DRAFT({ format: 'pdf-a' })), /^publication rejected \(intake\): format pdf-a is not renderable in this codebase today/, 422, 'EYE-REQ-001');
    await refused(draft(drafter, DRAFT({ sourceDigest: 'f'.repeat(64) })), /^publication rejected \(stale_source\)/, 409, 'EYE-STA-002');
    await refused(draft(drafter, DRAFT({ audience: { roles: ['ontology_steward'], recipients: [] } })), /^publication rejected \(audience\): the audience resolves to nobody/, 422, 'EYE-REQ-001');
    await refused(draft(drafter, DRAFT({ audience: { roles: [], recipients: [uuidv7()] } })), /^publication rejected \(unknown_recipient\)/, 404, 'EYE-STA-001');
    await refused(draft(drafter, DRAFT({ sourceId: uuidv7() })), /^publication rejected \(unknown_source\)/, 404, 'EYE-STA-001');
    // a board member cannot draft (the PDP): the port is never reached
    await refused(draft(board1, DRAFT()), /no qualifying role binding/, 403);
    // the refused drafts left NO file under the export root (the file is written after the port)
    const g = await list(drafter);
    expect(g.publications.map((p) => String(p['publication_id']))).toEqual([reportPub]);
  });

  it('d1 · RECOVERY: a confidential publication of the internal source accepted (narrower is allowed); a briefing edition drafted as markdown, bound by the edition\'s content digest', async () => {
    const c = (await draft(drafter, DRAFT({ classification: 'confidential', title: 'Board pack — confidential cut (SYNTHETIC)' }))).publication;
    expect(c['classification']).toBe('confidential');
    const b = (await draft(drafter, DRAFT({ title: 'Domain briefing — edition 1 (SYNTHETIC)', sourceKind: 'briefing', sourceId: briefing1.id, sourceVersion: 1, sourceDigest: briefing1.digest, format: 'md', channels: ['in_app', 'email'] }))).publication;
    briefingPub = String(b['publication_id']); briefingV1Digest = String(b['bytes_digest']);
    const onDisk = readFileSync(exportFile(briefingPub, String(b['vault_ref'])));
    expect(sha256(onDisk)).toBe(briefingV1Digest);
    expect(onDisk.toString('utf8')).toMatch(/^# Domain briefing — edition 1 \(SYNTHETIC\)/);
    expect(onDisk.toString('utf8')).toContain(briefing1.digest);
    expect((b['source'] as Row)['object_type']).toBe('BRF');
  });

  it('d2 · POSITIVE: the executive approves by digest — the signature (kind publication) verifies with the public key, PUB@1 admitted with the bytes\' sha256; delivered — in_app receipts for the three, email + teams receipts matching what the sinks received; a board member acknowledges', async () => {
    const a = (await approve(approver, reportPub, 1, reportDigest)).approval;
    expect(a).toMatchObject({ version: 1, state: 'approved', approved_by: approver.principalId, approval_digest: reportDigest, pub_object_version: 1 });
    const sigs = await signatures(reportPub, 1);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ signer: approver.principalId, subject_digest: reportDigest, bound_action: 'executive.publication.approve' });
    expect(new SignatureService().verify(sigs[0] as { key_id: string; signature: string; subject_digest: string }, PUBLIC_PEM)).toBe(true);
    const objs = await pubObjects(reportPub);
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ object_version: 1, lifecycle_state: 'active', truth_state: 'asserted', classification: 'internal' });
    expect((objs[0]!['payload'] as Row)['bytes']).toMatchObject({ sha256: reportDigest, vault_ref: reportBlob });
    expect(String(objs[0]!['content_ref'])).toBe(`vault:export/${reportBlob}#sha256:${reportDigest}`);
    // an approved version is immutable: a superuser update of its bytes is refused by the forward trigger (stated)
    await expect(sql`update executive.publication_versions set bytes_digest = ${'0'.repeat(64)} where publication_id = ${reportPub}::uuid and version = 1`.execute(su)).rejects.toThrow(/binds its snapshot and bytes/);
    // DELIVER
    const before = (await sinkReceived()).length;
    const d = (await deliver(drafter, reportPub, 1)).delivery;
    expect(d['state']).toBe('delivered');
    expect(arr(d['in_app'])).toHaveLength(3);
    const ch = arr(d['channel_deliveries']);
    expect(ch).toHaveLength(6); // 3 recipients x (email, teams)
    expect(ch.every((x) => x['state'] === 'delivered' && x['synthetic_state'] === true)).toBe(true);
    const received = await sinkReceived();
    expect(received.length).toBe(before + 6);
    for (const x of ch) {
      const rc = x['receipt'] as Row;
      expect(received.find((r) => r['message_id'] === rc['sink_message_id'])).toMatchObject({ channel: x['channel'] });
      expect(String(x['provider_ref'])).toBe(`${String(x['channel'])}:${String(rc['sink_message_id'])}`);
    }
    expect(String(ch.find((x) => x['channel'] === 'email')!['receipt'] !== null && (ch.find((x) => x['channel'] === 'email')!['receipt'] as Row)['sink'])).toBe(`smtp://127.0.0.1:${smtpPort}`);
    const g = (await get(approver, reportPub)).publication;
    expect(g['state']).toBe('delivered');
    expect(g.deliveries.filter((x) => x['kind'] === 'publication')).toHaveLength(9);
    // the board member reads its OWN deliveries (the recipient's view) and acknowledges the in_app one
    const mine = (await get(board1, reportPub)).publication;
    expect(mine['reader']).toBe('recipient');
    expect(mine.deliveries.every((x) => x['recipient_principal_id'] === board1.principalId)).toBe(true);
    boardDeliveryId = String(mine.deliveries.find((x) => x['channel'] === 'in_app')!['delivery_id']);
    const ack = (await acknowledge(board1, boardDeliveryId)).acknowledgement;
    expect(ack).toMatchObject({ delivery_id: boardDeliveryId, acknowledged_by: board1.principalId });
    expect(String(ack['note'])).toMatch(/receipt, not agreement/);
    // the bytes are readable by a recipient too, verified
    expect((await bytesOf(board2, reportPub, 1)).bytes['verified']).toBe(true);
  });

  it('d2 · REFUSAL: the drafter approving (separation); the operator approving (the PDP); a stale digest refused and its signature rolled back; delivery of an unapproved version (state); acknowledging another\'s delivery (not_recipient); a second acknowledgement (state)', async () => {
    const b = (await draft(approver, DRAFT({ title: 'Board pack — drafted by the executive (SYNTHETIC)' }))).publication; // the executive drafts, so the executive cannot approve it
    const id = String(b['publication_id']); const digest = String(b['bytes_digest']);
    await refused(approve(approver, id, 1, digest), /^publication rejected \(separation\): the drafter of version 1 does not approve it/, 403, 'EYE-AUT-001');
    await refused(approve(drafter, id, 1, digest), /no qualifying role binding/, 403);
    await refused(approve(reviewer, id, 1, 'e'.repeat(64)), /^publication rejected \(stale_digest\)/, 409, 'EYE-STA-002');
    expect(await signatures(id, 1)).toHaveLength(0); // the signature over the stale digest did not survive the refusal
    expect(await pubObjects(id)).toHaveLength(0);
    await refused(deliver(drafter, id, 1), /^publication rejected \(state\): version 1 is drafted; only an approved version is delivered/, 409, 'EYE-STA-002');
    await refused(acknowledge(board2, boardDeliveryId), /^publication rejected \(not_recipient\)/, 403, 'EYE-AUT-001');
    await refused(acknowledge(board1, boardDeliveryId), /^publication rejected \(state\): delivery .* was acknowledged at/, 409, 'EYE-STA-002');
    await refused(approve(reviewer, id, 1, 'not-a-digest'), /^publication rejected \(digest\)/, 422, 'EYE-REQ-001');
  });

  it('d2 · RECOVERY: the teams sink failing → the teams deliveries recorded FAILED with the sink\'s answer; the sink restored → a re-delivery places them (the in_app rows idempotent)', async () => {
    const a = (await approve(reviewer, briefingPub, 1, briefingV1Digest)).approval;
    expect(a['state']).toBe('approved');
    // the briefing publication carries email only; a teams-carrying one is the executive's draft of the refusal case — approve it here and fail its teams sink
    const g = (await list(drafter)).publications.find((p) => String(p['title']).startsWith('Board pack — drafted by the executive'))!;
    const id = String(g['publication_id']);
    const v = (await get(drafter, id)).publication.versions[0]!;
    await approve(reviewer, id, 1, String(v['bytes_digest']));
    await sinkMode('teams', 'fail');
    const d1 = (await deliver(drafter, id, 1)).delivery;
    const failed = arr(d1['channel_deliveries']).filter((x) => x['channel'] === 'teams');
    expect(failed).toHaveLength(3);
    expect(failed.every((x) => x['state'] === 'failed' && /^teams: the sink answered HTTP 503/.test(String(x['error'])))).toBe(true);
    expect(arr(d1['channel_deliveries']).filter((x) => x['channel'] === 'email').every((x) => x['state'] === 'delivered')).toBe(true);
    await sinkMode('teams', 'ok');
    const d2 = (await deliver(drafter, id, 1)).delivery;
    expect(arr(d2['in_app'])).toHaveLength(0); // already placed
    const again = arr(d2['channel_deliveries']);
    expect(again.filter((x) => x['channel'] === 'teams').every((x) => x['state'] === 'delivered')).toBe(true);
    expect(again.filter((x) => x['channel'] === 'email').every((x) => x['repeated'] === true)).toBe(true); // the placed email rows answer themselves
    const rows = (await get(drafter, id)).publication.deliveries;
    expect(rows.filter((x) => x['channel'] === 'teams' && x['state'] === 'failed')).toHaveLength(3);
    expect(rows.filter((x) => x['channel'] === 'teams' && x['state'] === 'delivered')).toHaveLength(3);
  });

  it('d3 · POSITIVE: the briefing publication corrected to a NEW EDITION — version 2 bound to edition 2\'s digest, the digest diff named, version 1 reads corrected_by_version 2; every recipient of version 1 gets an attention item (publication.correction) and an email notice; version 2 approved and delivered', async () => {
    await deliver(drafter, briefingPub, 1);
    briefing2 = await composeBriefing(approver, briefing1.id);
    expect(briefing2.digest).not.toBe(briefing1.digest);
    const c = (await correct(drafter, briefingPub, { reason: 'Edition 2 supersedes edition 1: the corridor figure was restated (SYNTHETIC)', sourceId: briefing2.id, sourceDigest: briefing2.digest })).correction;
    expect(c).toMatchObject({ version: 2, state: 'drafted', correction_of: 1 });
    expect(c['changed']).toMatchObject({ prior_version: 1, prior_source_digest: briefing1.digest, source_digest: briefing2.digest, prior_source_id: briefing1.id, source_id: briefing2.id, bytes_changed: true, snapshot_changed: true });
    expect(String(c['bytes_digest'])).not.toBe(briefingV1Digest);
    expect(sha256(readFileSync(exportFile(briefingPub, String(c['vault_ref']))))).toBe(String(c['bytes_digest']));
    const notified = arr(c['notified']).map((x) => String(x['recipient'])).sort();
    expect(notified).toEqual([board1.principalId, board2.principalId, w.owner.principalId].sort());
    const items = await attentionItems(briefingPub);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i['signal_class'] === 'publication.correction' && i['subject_kind'] === 'publication' && i['state'] === 'open' && i['cause_event_type'] === 'publication.corrected')).toBe(true);
    expect(items.map((i) => String(i['owner_principal_id'])).sort()).toEqual(notified);
    expect(String(items[0]!['title'])).toMatch(/^Correction of a publication you received: Domain briefing — edition 1/);
    const notices = arr(c['notices']);
    expect(notices).toHaveLength(3);
    expect(notices.every((n) => n['kind'] === 'correction_notice' && n['channel'] === 'email' && n['state'] === 'delivered')).toBe(true);
    const g = (await get(drafter, briefingPub)).publication;
    expect(g['state']).toBe('corrected');
    expect(g.versions[0]).toMatchObject({ version: 1, state: 'corrected', corrected_by_version: 2 });
    expect(g.versions[1]).toMatchObject({ version: 2, state: 'drafted', source_id: briefing2.id, source_digest: briefing2.digest, correction_of: 1 });
    // the corrected version is approved by digest and delivered like the first; PUB@2 supersedes PUB@1
    const a = (await approve(approver, briefingPub, 2, String(c['bytes_digest']))).approval;
    expect(a['pub_object_version']).toBe(2);
    const objs = await pubObjects(briefingPub);
    expect(objs.map((o) => o['supersedes'])).toEqual([null, `PUB:${briefingPub}@1`]);
    const d = (await deliver(drafter, briefingPub, 2)).delivery;
    expect(arr(d['in_app'])).toHaveLength(3);
    expect((await get(drafter, briefingPub)).publication['state']).toBe('delivered');
  });

  it('d3 · REFUSAL: a correction binding the same snapshot (unchanged); a report publication corrected to another package (source); a board member correcting (the PDP); a correction while a corrected draft is pending (state)', async () => {
    await refused(correct(drafter, briefingPub, { reason: 'the same edition again (SYNTHETIC)', sourceId: briefing2.id, sourceDigest: briefing2.digest }), /^publication rejected \(unchanged\): the correction binds the same snapshot/, 409, 'EYE-STA-002');
    await refused(correct(drafter, reportPub, { reason: 'another package entirely (SYNTHETIC)', sourceId: uuidv7(), sourceDigest: report.digest }), /^publication rejected \(source\): a report publication corrects to another version of the same package/, 422, 'EYE-REQ-001');
    await refused(correct(board1, briefingPub, { reason: 'a board member cannot (SYNTHETIC)', sourceId: briefing1.id, sourceDigest: briefing1.digest }), /no qualifying role binding/, 403);
    await refused(correct(drafter, reportPub, { reason: 'short', sourceDigest: report.digest }), /names its reason/, 422);
    // a pending corrected draft: correct the report publication to itself is refused as unchanged; so open a fresh corrected draft on the briefing publication and try a second one
    const c = (await correct(drafter, briefingPub, { reason: 'back to edition 1 for the refusal case (SYNTHETIC)', sourceId: briefing1.id, sourceDigest: briefing1.digest })).correction;
    expect(c['version']).toBe(3);
    await refused(correct(drafter, briefingPub, { reason: 'a second correction while version 3 is drafted (SYNTHETIC)', sourceId: briefing2.id, sourceDigest: briefing2.digest }), /^publication rejected \(state\): version 3 is drafted; a correction follows an approved or delivered version/, 409, 'EYE-STA-002');
  });

  it('d3 · RECOVERY / WITHDRAWAL: the report publication withdrawn with a reason — the bytes retained on disk, the read says withdrawn, PUB@2 admitted withdrawn (0078\'s lifecycle), the recipients notified; a second correction of the withdrawn publication refused; a withdrawal of the withdrawn refused', async () => {
    const before = (await attentionItems(reportPub)).length;
    const r = (await withdraw(approver, reportPub, 'The corridor figure in the pack was superseded by the restated edition (SYNTHETIC)')).withdrawal;
    expect(r).toMatchObject({ version: 1, state: 'withdrawn', withdrawn_by: approver.principalId, pub_object_version: 2, bytes_retained: true });
    expect(existsSync(exportFile(reportPub, reportBlob))).toBe(true);
    expect(sha256(readFileSync(exportFile(reportPub, reportBlob)))).toBe(reportDigest);
    const g = (await get(drafter, reportPub)).publication;
    expect(g['state']).toBe('withdrawn');
    expect(String(g['withdrawal_reason'])).toMatch(/superseded by the restated edition/);
    expect(g.versions[0]!['state']).toBe('withdrawn');
    const objs = await pubObjects(reportPub);
    expect(objs).toHaveLength(2);
    expect(objs[1]).toMatchObject({ object_version: 2, lifecycle_state: 'withdrawn', truth_state: 'withdrawn', supersedes: `PUB:${reportPub}@1` });
    expect(String(objs[1]!['withdrawal_reason'])).toMatch(/superseded by the restated edition/);
    expect((objs[1]!['payload'] as Row)['state']).toBe('withdrawn');
    const items = await attentionItems(reportPub);
    expect(items.length - before).toBe(3);
    expect(items.slice(before).every((i) => i['cause_event_type'] === 'publication.withdrawn' && i['signal_class'] === 'publication.correction')).toBe(true);
    expect(arr(r['notices']).filter((n) => n['kind'] === 'withdrawal_notice' && n['state'] === 'delivered')).toHaveLength(6);
    await refused(correct(drafter, reportPub, { reason: 'a correction after the withdrawal (SYNTHETIC)', sourceDigest: report.digest }), /^publication rejected \(withdrawn\): publication .* was withdrawn at .*; a withdrawn publication is not corrected/, 409, 'EYE-STA-002');
    await refused(withdraw(approver, reportPub, 'withdrawn again (SYNTHETIC)'), /^publication rejected \(withdrawn\)/, 409, 'EYE-STA-002');
    await refused(deliver(drafter, reportPub, 1), /^publication rejected \(state\): publication .* is withdrawn/, 409, 'EYE-STA-002');
  });

  it('d4 · POSITIVE: an external draft to the partner firm (SYNTHETIC) enters review_requested; an executive who is not the drafter reviews it approved — digest and signature recorded; then approved by digest and delivered: the internal recipients and the external audience\'s SYNTHETIC delivery at the sink', async () => {
    const b = (await draft(drafter, DRAFT({ title: 'Partner letter — the corridor decision (SYNTHETIC)', classification: 'internal', channels: ['in_app', 'email'], audience: { roles: [], recipients: [w.owner.principalId] }, external: { kind: 'partner', name: 'Partner firm (SYNTHETIC)' } }))).publication;
    externalPub = String(b['publication_id']); externalDraftId = String(b['external_draft_id']); externalDigest = String(b['bytes_digest']);
    expect(externalDraftId).toMatch(/^[0-9a-f-]{36}$/);
    const g0 = (await get(drafter, externalPub)).publication;
    expect(g0.external_drafts[0]).toMatchObject({ draft_id: externalDraftId, version: 1, audience_kind: 'partner', gate_state: 'review_requested', drafted_by: drafter.principalId });
    expect(readFileSync(exportFile(externalPub, String(b['vault_ref']))).toString('utf8')).toContain('EXTERNAL — partner: Partner firm (SYNTHETIC)');
    const rv = (await review(reviewer, externalDraftId, { verdict: 'approved', note: 'Reviewed for release to the partner: nothing beyond internal (SYNTHETIC).', digest: externalDigest })).review;
    expect(rv).toMatchObject({ draft_id: externalDraftId, gate_state: 'approved', reviewed_by: reviewer.principalId, review_digest: externalDigest });
    const sigs = await signatures(externalDraftId, 1);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ signer: reviewer.principalId, bound_action: 'executive.external_draft.review', subject_digest: externalDigest });
    const a = (await approve(approver, externalPub, 1, externalDigest)).approval;
    expect((a['event_id'] as string)).toMatch(/^[0-9a-f-]{36}$/);
    const before = (await sinkReceived()).length;
    const d = (await deliver(drafter, externalPub, 1)).delivery;
    expect(d['external_recipient']).toBe('external:partner:Partner firm (SYNTHETIC)');
    const ch = arr(d['channel_deliveries']);
    expect(ch.filter((x) => x['external_recipient'] !== null)).toHaveLength(1);
    const ext = ch.find((x) => x['external_recipient'] !== null)!;
    expect(ext).toMatchObject({ channel: 'email', state: 'delivered', synthetic_state: true, external_recipient: 'external:partner:Partner firm (SYNTHETIC)' });
    expect(String((ext['receipt'] as Row)['to'])).toMatch(/^principal-external-partner-partner-firm-synthetic@synthetic\.eye\.invalid$/);
    expect((await sinkReceived()).length).toBe(before + 2);
    expect(d['external_delivery']).toMatchObject({ synthetic: true });
    const rows = (await get(drafter, externalPub)).publication.deliveries;
    expect(rows.find((x) => x['external_recipient'] !== null)).toMatchObject({ recipient_principal_id: null, external_recipient: 'external:partner:Partner firm (SYNTHETIC)', channel: 'email', kind: 'publication', state: 'delivered' });
  });

  it('d4 · REFUSAL: a confidential external draft refused at draft; approval before the review (external_review); the drafter reviewing its own draft (separation); the operator reviewing (the PDP); a stale digest at review; delivery of an unreviewed external publication; an external synthetic delivery cannot be acknowledged', async () => {
    await refused(draft(drafter, DRAFT({ classification: 'confidential', external: { kind: 'regulator', name: 'The regulator (SYNTHETIC)' }, audience: { roles: [], recipients: [w.owner.principalId] } })), /^publication rejected \(intake\): an external communication is at most internal/, 422, 'EYE-REQ-001');
    const b = (await draft(reviewer, DRAFT({ title: 'Press note — the corridor decision (SYNTHETIC)', channels: ['in_app', 'email'], audience: { roles: [], recipients: [w.owner.principalId] }, external: { kind: 'press', name: 'The press (SYNTHETIC)' } }))).publication;
    const id = String(b['publication_id']); const draftId = String(b['external_draft_id']); const digest = String(b['bytes_digest']);
    await refused(approve(approver, id, 1, digest), /^publication rejected \(external_review\): the external communication draft is review_requested/, 409, 'EYE-STA-002');
    await refused(review(reviewer, draftId, { verdict: 'approved', note: 'my own', digest }), /^external draft rejected \(separation\): the drafter does not review its own external communication/, 403, 'EYE-AUT-001');
    await refused(review(drafter, draftId, { verdict: 'approved', note: 'not an executive', digest }), /no qualifying role binding/, 403);
    await refused(review(approver, draftId, { verdict: 'approved', note: 'stale', digest: 'd'.repeat(64) }), /^external draft rejected \(stale_digest\)/, 409, 'EYE-STA-002');
    expect(await signatures(draftId, 1)).toHaveLength(0);
    await refused(review(approver, draftId, { verdict: 'maybe', note: 'x', digest }), /^external draft rejected \(verdict\)/, 422, 'EYE-REQ-001');
    // delivery of an unreviewed external publication: the version is not approved (state), and the review is not approved either — the state answers first
    await refused(deliver(drafter, id, 1), /^publication rejected \(state\): version 1 is drafted/, 409, 'EYE-STA-002');
    const ext = (await get(drafter, externalPub)).publication.deliveries.find((x) => x['external_recipient'] !== null)!;
    await refused(acknowledge(w.owner, String(ext['delivery_id'])), /^publication rejected \(not_recipient\)/, 403, 'EYE-AUT-001');
    // RECOVERY within the clause: information requested, then approved on a second review (the gate state moves review_requested → information_requested → approved)
    const r1 = (await review(approver, draftId, { verdict: 'information_requested', note: 'Name the partner contact before release (SYNTHETIC).', digest })).review;
    expect(r1['gate_state']).toBe('information_requested');
    const r2 = (await review(approver, draftId, { verdict: 'approved', note: 'The contact is named; released (SYNTHETIC).', digest })).review;
    expect(r2['gate_state']).toBe('approved');
    await refused(review(approver, draftId, { verdict: 'rejected', note: 'closed', digest }), /^external draft rejected \(state\): draft .* is approved; its review is closed/, 409, 'EYE-STA-002');
    const a = (await approve(approver, id, 1, digest)).approval;
    expect(a['state']).toBe('approved');
  });

  it('d5 · POSITIVE: the withdrawn report publication archived — the archive record carries every version, receipt, signature and event; PUB@3 archived carries the source\'s controls; the export writes manifest.json beside the bytes with every receipt, in the export path\'s digest discipline', async () => {
    const a = (await archive(approver, reportPub)).archive;
    expect(a['state']).toBe('archived');
    const ref = a['archive_ref'] as Row;
    expect(ref).toMatchObject({ pub_object_version: 3, versions: 1, signatures: 1 });
    expect(Number(ref['deliveries'])).toBeGreaterThanOrEqual(15); // 9 publication rows + 6 withdrawal notices
    expect(ref['controls']).toMatchObject({ classification: 'internal' });
    expect(arr(ref['holds'])).toHaveLength(0);
    const record = a['record'] as Row;
    expect(arr(record['versions'])).toHaveLength(1);
    expect(arr((arr(record['versions'])[0]!['signatures']) as unknown)).toHaveLength(1);
    expect(arr(record['deliveries']).filter((d) => d['kind'] === 'publication' && d['channel'] === 'email').every((d) => typeof (d['receipt'] as Row)['sink_message_id'] === 'string')).toBe(true);
    const objs = await pubObjects(reportPub);
    expect(objs[2]).toMatchObject({ object_version: 3, lifecycle_state: 'archived', truth_state: 'withdrawn', classification: 'internal', supersedes: `PUB:${reportPub}@2` });
    const dpk = (await sql<Row>`select residency_profile, retention_profile, rights_profile from objects.canonical_objects where object_type = 'DPK' and object_id = ${report.pkg}::uuid and object_version = ${report.v}`.execute(su)).rows[0]!;
    expect(objs[2]).toMatchObject({ residency_profile: dpk['residency_profile'], retention_profile: dpk['retention_profile'], rights_profile: dpk['rights_profile'] }); // the source's controls carried (the fixture world's evidence is residency EU)
    expect(String(dpk['residency_profile'])).toBe('EU');
    expect(((objs[2]!['payload'] as Row)['archive'] as Row)['deliveries']).toBeDefined();
    const g = (await get(drafter, reportPub)).publication;
    expect(g['state']).toBe('archived');
    // a superuser update of an archived publication is refused by the forward trigger (stated)
    await expect(sql`update executive.publications set state = 'delivered' where publication_id = ${reportPub}::uuid`.execute(su)).rejects.toThrow(/is archived; nothing of it moves/);
    // EXPORT
    const e = (await exportGet(approver, reportPub)).export;
    const m = e['export'] as Row;
    expect(m['format']).toBe('eye-publication-export/1');
    expect(arr(m['objects'])[0]).toMatchObject({ object: `PUB:${reportPub}@1`, version: 1, state: 'withdrawn', sha256: reportDigest, file: reportBlob.split('/')[1] });
    expect(arr(m['deliveries']).length).toBe(Number(ref['deliveries']));
    expect(String(m['manifest_digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(String((m['gates'] as Row)['residency'])).toMatch(/stays in the vault's residency/);
    expect(((m['gates'] as Row)['controls'] as Row)['residency_profile']).toBe('EU');
    const file = e['file'] as Row;
    expect(file).toMatchObject({ name: 'manifest.json', repeated: false });
    const onDisk = readFileSync(join(VAULT_DIR, 'export', T(), D(), reportPub, 'manifest.json'));
    expect(sha256(onDisk)).toBe(String(file['contentDigest']));
    expect((JSON.parse(onDisk.toString('utf8')) as Row)['manifest_digest']).toBe(m['manifest_digest']);
    // a second export answers the same manifest (repeated)
    const e2 = (await exportGet(approver, reportPub)).export;
    expect((e2['file'] as Row)['repeated']).toBe(true);
    expect((e2['file'] as Row)['contentDigest']).toBe(String(file['contentDigest']));
  });

  it('d5 · REFUSAL: the export of a publication whose source is under a LEGAL HOLD refused (legal_hold); a residency-restricted source refused (residency); archive of a delivered-then-corrected publication (state); export before the archive (state); a board member archiving (the PDP)', async () => {
    // the executive's report publication (delivered in the d2 recovery case) cites the fixture evidence w.evd through its DPK: a hold placed on it by the domain administrator
    const g = (await list(drafter)).publications.find((p) => String(p['title']).startsWith('Board pack — drafted by the executive'))!;
    const id = String(g['publication_id']);
    await refused(exportGet(approver, id), /^publication rejected \(state\): publication .* is delivered; an archived publication is exported/, 409, 'EYE-STA-002');
    await refused(archive(board1, id), /no qualifying role binding/, 403);
    const hold = await placeHold(w.evd.id, 'Litigation hold on the corridor evidence (B36 harness; SYNTHETIC)');
    const holdId = String(hold.hold['holdId']);
    const a = (await archive(drafter, id)).archive;
    expect(arr((a['archive_ref'] as Row)['holds'])).toHaveLength(1); // the archive PRESERVES under a hold and records it
    await refused(exportGet(approver, id), /^publication rejected \(legal_hold\): 1 active legal hold\(s\) rest on the source's evidence/, 409, 'EYE-STA-002');
    expect(existsSync(join(VAULT_DIR, 'export', T(), D(), id, 'manifest.json'))).toBe(false);
    // RECOVERY: the hold lifted → the export proceeds
    await liftHold(holdId, 'The hold is lifted (B36 harness; SYNTHETIC)');
    const e = (await exportGet(approver, id)).export;
    expect((e['file'] as Row)['repeated']).toBe(false);
    // a RESIDENCY RESTRICTION: the partner letter (an EXTERNAL publication) of the residency-EU source — its export would carry the bytes out of
    // the residency; refused. The internal board pack of the same source exported above (the export namespace is inside the residency).
    await archive(approver, externalPub);
    await refused(exportGet(approver, externalPub), /^publication rejected \(residency\): the source carries the residency profile EU and this publication is addressed outside the tenant \(partner: Partner firm \(SYNTHETIC\)\); its bytes stay in the vault's residency/, 409, 'EYE-STA-002');
    expect(existsSync(join(VAULT_DIR, 'export', T(), D(), externalPub, 'manifest.json'))).toBe(false);
    // the briefing publication: withdrawn while its version 3 is drafted, archived, exported (internal: in residency)
    await withdraw(approver, briefingPub, 'The edition-1 draft is superseded; withdrawn before the archive (B36 harness; SYNTHETIC)');
    await archive(approver, briefingPub);
    const e2 = (await exportGet(approver, briefingPub)).export;
    expect((e2['file'] as Row)['repeated']).toBe(false);
    expect(arr((e2['export'] as Row)['objects'])).toHaveLength(3); // the three versions of the briefing publication, each with its digest
  });

  it('d5 · RECOVERY: the archived publication reads whole after the export — the versions, the receipts with the sinks\' ids, the signatures; the archived PUB\'s controls are the current version\'s source\'s (residency, retention and rights profiles carried)', async () => {
    const g = (await get(approver, briefingPub)).publication;
    expect(g['state']).toBe('archived');
    expect(g.versions).toHaveLength(3);
    expect(g.versions.map((v) => v['state'])).toEqual(['corrected', 'corrected', 'withdrawn']);
    expect(g.versions[0]!['signatures']).toHaveLength(1);
    expect(g.versions[1]!['signatures']).toHaveLength(1);
    expect(g.versions[2]!['signatures']).toHaveLength(0); // version 3 was withdrawn while drafted: never approved, never signed
    expect(g.deliveries.filter((d) => d['kind'] === 'correction_notice')).toHaveLength(6); // two corrections (v1→v2, v2→v3) x three recipients, each on email
    const objs = await pubObjects(briefingPub);
    const last = objs[objs.length - 1]!;
    expect(last).toMatchObject({ lifecycle_state: 'archived' });
    // the controls are the CURRENT version's source's (version 3 binds edition 1 again)
    const src = (await sql<Row>`select residency_profile, retention_profile, rights_profile from objects.canonical_objects where object_type = 'BRF' and object_id = ${briefing1.id}::uuid`.execute(su)).rows[0]!;
    expect(last['residency_profile']).toBe(src['residency_profile']);
    expect(last['retention_profile']).toBe(src['retention_profile']);
    expect(last['rights_profile']).toBe(src['rights_profile']);
    expect(g.events.map((e) => String(e['event'])).filter((e) => e === 'publication.exported')).toHaveLength(1);
  });
});
