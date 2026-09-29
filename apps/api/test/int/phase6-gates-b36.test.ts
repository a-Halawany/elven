/**
 * CP-6 B36 · part G — THE HUMAN GATE COMPLETED (F-P6-04 completes; 0094 §G), through the real database and controllers.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case: k1 the SIGNATURE beyond the audit chain on the approval and on the decision, with
 * its verification (a stale digest refused; a tampered digest fails verification; an unbound key refused); k2 the DISTRIBUTION of the
 * decision record after commitment to the room and the named recipients — in_app always, email / sms / teams SYNTHETIC to LOCAL sinks
 * (scripts/attention/local-sinks.mjs on loopback; a real provider is owner decision D6 — this closes no real-provider clause), receipts
 * recorded, a failing sink a FAILED row, an external collaborator never a recipient; l1 RECUSAL (the approval voided, the quorum lost, the
 * recused approver refused later); l2 CHALLENGE as a transition (a member before the commitment: the commit HELD at the service and at the
 * row; dismissed → the state returns; the auditor after the commitment: upheld → reopen required, the commitment standing; upheld before
 * → the withdrawal chain's effects); l3 the VALIDATED FIELDS (set on a draft, refused naming the field, validated at the proposal);
 * l4 the BOARD (a board member decides a board-class package only through decision.board.*; a standard package refused by the port; the
 * standard route refused at the PDP); l5 the PDP DENIAL as a versioned object (recorded by the pipeline's denial path under the evidence
 * context, listed in the replay and the gate record; a direct call under an authority context refused); l6 ONE uniform gate state for a
 * decision, the fixture source contract and a merge. The hosted browser case (m) is e2e/phase6-b36-gates.demo.spec.ts (not run here).
 * SYNTHETIC world (bootDecisionWorld); the signing key is generated here and bound in this process (EYE_EXECUTIVE_SIGNING_KEY_DEMO).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { DecisionCapability } from '../../src/decision/decision.capabilities.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SINKS = resolvePath(__dirname, '../../../../scripts/attention/local-sinks.mjs');
type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let pipeline: PipelineService; let signer: SignatureService;
let board1: AuthenticatedPrincipal; let board2: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let member: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let external: AuthenticatedPrincipal;
let sinks: ChildProcess | null = null; let httpPort = 0; let smtpPort = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B24/B34 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};
const evidence = (caseName: string, e: Row): void => console.log(`B36 GATES EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the calls ───────────── */
const dc = () => w.decisions;
const sign = (as: AuthenticatedPrincipal, pkg: string, v: number, kind: 'approval' | 'decision', digest: string, approvalId: string | null = null) =>
  dc().sign(h.req(as, `decision.sign.${kind}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: approvalId === null ? { kind, digest } : { kind, digest, approvalId } }) as Promise<{ signature: Row }>;
const recuse = (as: AuthenticatedPrincipal, pkg: string, v: number, reason: string) => dc().recuse(h.req(as, 'decision.recuse', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { reason } }) as Promise<{ recusal: Row }>;
const challenge = (as: AuthenticatedPrincipal, pkg: string, v: number, reason: string) => dc().challenge(h.req(as, 'decision.challenge', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { reason } }) as Promise<{ challenge: Row }>;
const resolve = (as: AuthenticatedPrincipal, pkg: string, v: number, challengeId: string, resolution: string, note: string) =>
  dc().resolveChallenge(h.req(as, 'decision.challenge.resolve', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { challengeId, resolution, note } }) as Promise<{ resolution: Row }>;
const distribute = (as: AuthenticatedPrincipal, pkg: string, v: number, channels: string[], recipients: string[] = []) =>
  dc().distribute(h.req(as, 'decision.distribute', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { channels, recipients } }) as Promise<{ distribution: Row & { rows: Row[]; record_digest: string; recipients: Row[] } }>;
const setFields = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) => dc().setFields(h.req(as, 'decision.package.terms', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ fields: Row }>;
const record = (pkg: string, v: number, as = w.executive) => (dc().gateRecord(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v)) as Promise<{ record: Row & { approvals: Row[]; decision_signatures: Row[]; recusals: Row[]; challenges: Row[]; denials: Row[]; distributions: Row[]; gate: Row } }>).then((r) => r.record);
const gateState = (payload: Row, as = w.executive) => (dc().gateState(h.req(as, 'decision.read', 'DPK', typeof payload['id'] === 'string' ? payload['id'] : null, 'decision'), T(), D(), { payload }) as Promise<{ gate: Row }>).then((r) => r.gate);
const boardList = (as: AuthenticatedPrincipal) => (dc().boardList(h.req(as, 'decision.board.read', 'DPK', null, 'decision'), T(), D()) as Promise<{ board: Row[] }>).then((r) => r.board);
const boardAct = (as: AuthenticatedPrincipal, pkg: string, v: number, act: 'approve' | 'reject' | 'defer', payload: Row) =>
  dc().boardAct(h.req(as, `decision.board.${act}`, act === 'defer' ? 'DPK' : 'APR', act === 'defer' ? pkg : null, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ board: Row }>;
const GATE_ACTION: Record<string, string> = { 'request-information': 'decision.gate.request_information' };
const gate = (as: AuthenticatedPrincipal, pkg: string, v: number, act: string, payload: Row = {}) =>
  dc().gateAct(h.req(as, GATE_ACTION[act] ?? `decision.gate.${act}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ gate: Row }>;
const approveAs = (pkg: string, v: number, digest: string, as: AuthenticatedPrincipal) => c.approve(pkg, v, { decision: 'approve', versionDigest: digest, rationale: 'The reroute keeps the line running (B36 harness).' }, as);
/** A room on the package: the owner's, with the named members (observers). */
const roomWith = async (pkg: string, members: AuthenticatedPrincipal[]): Promise<string> => {
  const r = await c.openRoom({ packageId: pkg, title: 'Dual-sourcing decision room (SYNTHETIC)', reviewEveryDays: 7 }, w.owner);
  for (const m of members) await c.membership(r.room.roomId, { principal: m.principalId, role: 'observer', op: 'add' }, w.owner);
  return r.room.roomId;
};

/* ───────────── the record ───────────── */
const events = async (pkg: string, event: string) => (await sql<{ details: Row; actor: string }>`select details, actor_principal_id::text actor from decision.package_events
  where package_id = ${pkg}::uuid and event = ${event} order by occurred_at, event_id`.execute(su)).rows;
const versionState = async (pkg: string, v: number) => (await sql<{ s: string }>`select state s from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(su)).rows[0]?.s;
const pkgState = async (pkg: string) => (await sql<{ s: string }>`select state s from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]?.s;
const approvalRow = async (id: string) => (await sql<{ header_digest: string; revoked_at: Date | null; revoked_reason: string | null }>`select header_digest, revoked_at, revoked_reason from decision.approvals where approval_id = ${id}::uuid`.execute(su)).rows[0]!;
const headerDigest = async (pkg: string, v: number) => (await sql<{ d: string }>`select header_digest d from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(su)).rows[0]!.d;
const signatures = async (kind: string, id: string, v: number) => (await sql<{ signature_id: string; signer: string; key_id: string; signature: string; subject_digest: string; bound_action: string }>`
  select signature_id::text, signer::text, key_id, signature, subject_digest, bound_action from executive.signatures where subject_kind = ${kind} and subject_id = ${id}::uuid and subject_version = ${v} order by signed_at`.execute(su)).rows;
const commitments = async (pkg: string) => Number((await sql<{ n: number }>`select count(*)::int n from decision.commitments where package_id = ${pkg}::uuid`.execute(su)).rows[0]!.n);
const denials = async (pkg: string) => (await sql<{ principal_id: string; action: string; package_version: number | null; decision: string; policy_decision_id: string }>`
  select principal_id::text, action, package_version, decision, policy_decision_id::text from decision.pdp_denials where package_id = ${pkg}::uuid order by denied_at`.execute(su)).rows;
const tasks = async (pkg: string, kind: string) => (await sql<{ state: string }>`select state from executive.human_tasks where kind = ${kind} and (subject ->> 'id' = ${pkg} or subject ->> 'package_id' = ${pkg}) order by opened_at`.execute(su)).rows;
const sinkReceived = async (): Promise<Row[]> => ((await (await fetch(`http://127.0.0.1:${httpPort}/_received`)).json()) as { received: Row[] }).received;
const sinkMode = async (channel: string, mode: 'ok' | 'fail') => { await fetch(`http://127.0.0.1:${httpPort}/_control`, { method: 'POST', body: JSON.stringify({ channel, mode }) }); };
/** A DIRECT call of the commit port under the C3 context (the B34 G1 idiom): the row's own trigger is what refuses it. */
const directCommit = async (pkg: string, v: number, digest: string, previewDigest: string) => {
  const cmt = uuidv7();
  return pipeline.write(h.env(w.authority, 'decision.commit', 'CMT', null, 'decision'), w.authority,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'decision.commit', objectType: 'CMT', objectId: cmt, consequenceClass: 'C3', writableTargets: [cmt] }, DecisionCapability.commit,
    async (cap) => ({ result: await cap.commitPackage({ commitmentId: cmt, tenantId: T(), domainId: D(), packageId: pkg, version: v, committer: w.authority.principalId, versionDigest: digest,
      headerDigest: 'a'.repeat(64), title: 'direct', statement: 'direct', eventId: uuidv7(), correlationId: uuidv7(), previewDigest }), targetType: 'CMT', targetId: cmt, targetVersion: '1', outboxEvent: null }));
};

beforeAll(async () => {
  // THE SIGNING KEY: an Ed25519 pair of this process, bound by reference before the API boots (the demo binds its own in .eye-local/env).
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  delete process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'];
  // THE LOCAL SINKS (loopback, free ports), then the API configured with them — the adapters never reach anything else.
  sinks = spawn(process.execPath, [SINKS, '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  await new Promise<void>((res, rej) => { sinks!.stdout!.on('data', (b: Buffer) => { out += b.toString(); if (out.includes('ready')) res(); }); sinks!.once('exit', () => rej(new Error(`the sinks exited: ${out}`))); });
  smtpPort = Number(/smtp (\d+)/.exec(out)![1]); httpPort = Number(/http (\d+)/.exec(out)![1]);
  process.env['EYE_ATTENTION_SINK_HOST'] = '127.0.0.1';
  process.env['EYE_ATTENTION_SMTP_PORT'] = String(smtpPort);
  process.env['EYE_ATTENTION_SMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/sms`;
  process.env['EYE_ATTENTION_TEAMS_WEBHOOK_URL'] = `http://127.0.0.1:${httpPort}/teams`;
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  pipeline = h.app.get(PipelineService);
  signer = h.app.get(SignatureService);
  board1 = await h.humanWithSession(['board_member'], 'b36-board-1');
  board2 = await h.humanWithSession(['board_member'], 'b36-board-2');
  auditor = await h.humanWithSession(['auditor'], 'b36-auditor', 'TENANT');
  member = await h.humanWithSession(['domain_analyst'], 'b36-member');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36-analyst');
  // an EXTERNAL collaborator (B34: a human of affiliation external — never a member, never a recipient)
  external = await h.principalWith(['external_collaborator'], 'b36-external');
  await sql`insert into executive.external_principals (principal_id, scope, tenant_id, domain_id, invited_by, reason, correlation_id)
            values (${external.principalId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${w.owner.principalId}::uuid, 'B36 harness: the partner firm''s customs broker (SYNTHETIC)', ${uuidv7()}::uuid)`.execute(su);
}, 300_000);
afterAll(async () => { await h?.close(); sinks?.kill(); });

describe('k1 · THE SIGNATURE beyond the audit chain — the approval by its approver, the decision by its owner after commitment, verified', () => {
  let P: { pkg: string; v: number; digest: string }; let approvalId = '';
  it('k1 · POSITIVE: the approver signs the approval\'s header digest; the owner and the committer sign the committed version\'s; every signature verifies', async () => {
    P = await c.proposed();
    const a = await approveAs(P.pkg, P.v, P.digest, w.approver);
    approvalId = a.approval.approvalId;
    const ad = (await approvalRow(approvalId)).header_digest;
    const s1 = (await sign(w.approver, P.pkg, P.v, 'approval', ad, approvalId)).signature;
    expect(s1).toMatchObject({ kind: 'approval', approval_id: approvalId, signer: w.approver.principalId, subject_digest: ad, verified: true });
    expect(String(s1['key_id'])).toMatch(/^ed25519:[0-9a-f]{16}$/);
    expect(String(s1['key_id'])).toBe(signer.publicKey()!.keyId);
    const rows = await signatures('approval', approvalId, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ signer: w.approver.principalId, bound_action: 'decision.sign.approval', subject_digest: ad });
    expect(signer.verify(rows[0]!)).toBe(true);
    expect((await events(P.pkg, 'gate.signed')).map((e) => [e.details['kind'], e.details['signature_id']])).toEqual([['approval', s1['signature_id']]]);
    /* the decision: after its commitment, by the owner and by the committing authority */
    await refused(sign(w.owner, P.pkg, P.v, 'decision', await headerDigest(P.pkg, P.v)), /^signature rejected \(state\): version 1 is approved, not committed/, 409);
    await c.commit(P.pkg, P.v, P.digest);
    const hd = await headerDigest(P.pkg, P.v);
    const s2 = (await sign(w.owner, P.pkg, P.v, 'decision', hd)).signature;
    const s3 = (await sign(w.authority, P.pkg, P.v, 'decision', hd)).signature;
    expect([s2, s3].map((s) => [s['kind'], s['signer'], s['verified']])).toEqual([['decision', w.owner.principalId, true], ['decision', w.authority.principalId, true]]);
    /* the read verifies each one and names the deployment's key */
    const r = await record(P.pkg, P.v);
    expect(r.approvals[0]!['signatures']).toHaveLength(1);
    expect(((r.approvals[0]!['signatures'] as Row[])[0]!)['verified']).toBe(true);
    expect(r.decision_signatures.map((s) => s['verified'])).toEqual([true, true]);
    expect((r['signing_key'] as Row)['keyId']).toBe(signer.publicKey()!.keyId);
    evidence('k1 positive', { approval: s1['signature_id'], decision: [s2['signature_id'], s3['signature_id']], key: s1['key_id'] });
  });
  it('k1 · REFUSAL: a stale digest (409, nothing signed), another principal signing the approval (403), a second signing by the same signer (409), a tampered digest failing verification, an unbound key (409)', async () => {
    const Q = await c.proposed();
    const a = await approveAs(Q.pkg, Q.v, Q.digest, w.approver);
    const stale = sha256('stale');
    await refused(sign(w.approver, Q.pkg, Q.v, 'approval', stale, a.approval.approvalId), /^signature rejected \(stale_digest\): the digest read \(/, 409);
    expect(await signatures('approval', a.approval.approvalId, 1), 'a refused signing leaves no row').toHaveLength(0);
    const ad = (await approvalRow(a.approval.approvalId)).header_digest;
    await refused(sign(w.approver2, Q.pkg, Q.v, 'approval', ad, a.approval.approvalId), /^signature rejected \(actor\): an approval is signed by its approver/, 403);
    await sign(w.approver, Q.pkg, Q.v, 'approval', ad, a.approval.approvalId);
    await refused(sign(w.approver, Q.pkg, Q.v, 'approval', ad, a.approval.approvalId), /^signature rejected \(state\): approval .* is already signed by this principal/, 409);
    const row = (await signatures('approval', a.approval.approvalId, 1))[0]!;
    expect(signer.verify({ ...row, subject_digest: sha256('tampered') }), 'a signature over another digest does not verify').toBe(false);
    expect(signer.verify({ ...row, signature: `${row.signature.slice(0, 10)}A${row.signature.slice(11)}` }), 'an altered signature does not verify').toBe(false);
    /* the unbound key: the deployment signs nothing, said as a refusal */
    const bound = process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO']!;
    delete process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'];
    try {
      await c.commit(Q.pkg, Q.v, Q.digest);
      await refused(sign(w.owner, Q.pkg, Q.v, 'decision', await headerDigest(Q.pkg, Q.v)), /^signature rejected \(unbound\): this deployment binds no executive signing key/, 409);
    } finally { process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = bound; }
    /* a decision signed by neither its owner nor its committer */
    await refused(sign(w.executive, Q.pkg, Q.v, 'decision', await headerDigest(Q.pkg, Q.v)), /./, 403);
    evidence('k1 refusal', { stale: 409, other_signer: 403, twice: 409, tampered: false, unbound: 409 });
  });
  it('k1 · RECOVERY: after the stale refusal the digest is read again and the signature stands; the key rebound signs the decision', async () => {
    const R = await c.proposed();
    const a = await approveAs(R.pkg, R.v, R.digest, w.approver);
    await refused(sign(w.approver, R.pkg, R.v, 'approval', sha256('old'), a.approval.approvalId), /stale_digest/, 409);
    const subject = (await sql<{ s: Row }>`select decision.signature_subject('approval', ${R.pkg}::uuid, ${R.v}::int, ${a.approval.approvalId}::uuid) s`.execute(su)).rows[0]!.s;
    const s = (await sign(w.approver, R.pkg, R.v, 'approval', String(subject['digest']), a.approval.approvalId)).signature;
    expect(s['verified']).toBe(true);
    await c.commit(R.pkg, R.v, R.digest);
    expect(((await sign(w.owner, R.pkg, R.v, 'decision', await headerDigest(R.pkg, R.v))).signature)['verified']).toBe(true);
    evidence('k1 recovery', { approval: s['signature_id'] });
  });
});

describe('k2 · THE DISTRIBUTION of the decision record after commitment — in_app, and the SYNTHETIC channels to the local sinks', () => {
  it('k2 · POSITIVE: the owner distributes to the room (owner, members) and a named recipient on in_app + email / sms / teams; every receipt recorded; the sinks received the messages', async () => {
    const P = await c.proposed();
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await roomWith(P.pkg, [member, w.approver]);
    await c.commit(P.pkg, P.v, P.digest);
    await sign(w.owner, P.pkg, P.v, 'decision', await headerDigest(P.pkg, P.v));
    const before = (await sinkReceived()).length;
    const d = (await distribute(w.owner, P.pkg, P.v, ['email', 'sms', 'teams'], [analyst.principalId])).distribution;
    const recipients = (d.recipients as Row[]).map((r) => [r['principal_id'], r['basis']]);
    expect(recipients).toEqual(expect.arrayContaining([[w.owner.principalId, 'room_owner'], [member.principalId, 'room_member'], [w.approver.principalId, 'room_member'], [analyst.principalId, 'named']]));
    expect(d.rows).toHaveLength(4 * 4);
    expect(d.rows.filter((r) => r['channel'] === 'in_app').every((r) => r['state'] === 'delivered')).toBe(true);
    for (const ch of ['email', 'sms', 'teams']) expect(d.rows.filter((r) => r['channel'] === ch).map((r) => [r['state'], r['synthetic']]), ch).toEqual([['delivered', true], ['delivered', true], ['delivered', true], ['delivered', true]]);
    expect(String(d['synthetic_note'])).toMatch(/SYNTHETIC/);
    const received = await sinkReceived();
    expect(received.length - before).toBe(12);
    const stored = (await record(P.pkg, P.v)).distributions;
    expect(stored).toHaveLength(16);
    for (const s of stored.filter((x) => x['channel'] !== 'in_app')) {
      const got = received.find((r) => r['message_id'] === (s['receipt'] as Row)['sink_message_id']);
      expect(got, `${String(s['channel'])} reached the sink`).toMatchObject({ channel: s['channel'], delivery_id: s['delivery_id'] });
      expect(String(s['provider_ref'])).toBe(`${String(s['channel'])}:${String((s['receipt'] as Row)['sink_message_id'])}`);
      expect((s['receipt'] as Row)['synthetic']).toBe(true);
    }
    expect(stored.filter((x) => x['channel'] === 'in_app').every((x) => x['synthetic_state'] === false && (x['receipt'] as Row)['proof'] !== undefined)).toBe(true);
    const ev = (await events(P.pkg, 'decision.distributed'))[0]!.details;
    expect(ev).toMatchObject({ version: P.v, record_digest: d.record_digest, rows: 16, synthetic_channels: ['email', 'sms', 'teams'] });
    expect((d['record'] as Row)['signatures']).toMatchObject({ decision: expect.arrayContaining([expect.objectContaining({ signer: w.owner.principalId })]) });
    evidence('k2 positive', { distribution: d['distribution_id'], rows: 16, received: received.length - before, digest: d.record_digest });
  });
  it('k2 · REFUSAL: an uncommitted version (409), the approver distributing (403), an external collaborator named (422) and never a member, an unknown channel (422)', async () => {
    const Q = await c.proposed();
    await approveAs(Q.pkg, Q.v, Q.digest, w.approver);
    const room = await roomWith(Q.pkg, [member]);
    await refused(distribute(w.owner, Q.pkg, Q.v, []), /^distribution rejected \(state\): version 1 is approved, not committed/, 409);
    expect((await refusal(c.membership(room, { principal: external.principalId, role: 'observer', op: 'add' }, w.owner))).message, 'an external is never a room member (the room port\'s own sentence, unmapped)').toMatch(/members are named, active human principals/);
    await c.commit(Q.pkg, Q.v, Q.digest);
    await refused(distribute(w.approver, Q.pkg, Q.v, []), /no qualifying role binding/, 403); // the PDP: an approver holds no decision.distribute
    await refused(distribute(w.authorApprover, Q.pkg, Q.v, []), /^distribution rejected \(authority\): the package owner or a decision authority distributes/, 403); // the port: a decision owner who is not THIS package's owner
    await refused(distribute(w.owner, Q.pkg, Q.v, [], [external.principalId]), /^distribution rejected \(recipient\): .* is not a named, active member of this tenant \(an external collaborator is never a recipient\)/, 422);
    await refused(distribute(w.owner, Q.pkg, Q.v, ['carrier-pigeon']), /^distribution rejected \(channel\): carrier-pigeon is not a channel/, 422);
    expect((await record(Q.pkg, Q.v)).distributions, 'a refused distribution leaves no row').toHaveLength(0);
    evidence('k2 refusal', { uncommitted: 409, approver: 403, external: 422, channel: 422 });
  });
  it('k2 · RECOVERY: the sms sink failing → the sms rows FAILED with the reason, the others delivered; the sink restored → a second distribution delivers', async () => {
    const R = await c.proposed();
    await approveAs(R.pkg, R.v, R.digest, w.approver);
    await roomWith(R.pkg, [member]);
    await c.commit(R.pkg, R.v, R.digest);
    await sinkMode('sms', 'fail');
    let d: Row & { rows: Row[] };
    try { d = (await distribute(w.authority, R.pkg, R.v, ['email', 'sms'])).distribution; } finally { await sinkMode('sms', 'ok'); }
    expect(d.rows.filter((r) => r['channel'] === 'sms').map((r) => r['state'])).toEqual(['failed', 'failed']);
    expect(String(d.rows.find((r) => r['channel'] === 'sms')!['error'])).toMatch(/^sms: the sink answered HTTP 503/);
    expect(d.rows.filter((r) => r['channel'] !== 'sms').every((r) => r['state'] === 'delivered')).toBe(true);
    const d2 = (await distribute(w.authority, R.pkg, R.v, ['sms'])).distribution;
    expect(d2.rows.filter((r) => r['channel'] === 'sms').map((r) => r['state'])).toEqual(['delivered', 'delivered']);
    const stored = (await record(R.pkg, R.v)).distributions;
    expect(stored.filter((x) => x['channel'] === 'sms').map((x) => x['state']).sort()).toEqual(['delivered', 'delivered', 'failed', 'failed']);
    evidence('k2 recovery', { failed: 2, recovered: 2 });
  });
});

describe('l1 · RECUSAL — the approver\'s own act: the approval voided, the quorum re-evaluated, the recused approver refused later', () => {
  it('l1 · POSITIVE: the approver recuses from an approved version → the approval voided, the version back to review (gate: recused); another approver restores the quorum', async () => {
    const P = await c.proposed();
    const a = await approveAs(P.pkg, P.v, P.digest, w.approver);
    expect(await versionState(P.pkg, P.v)).toBe('approved');
    const r = (await recuse(w.approver, P.pkg, P.v, 'A family member works for the second source (B36 harness).')).recusal;
    expect(r).toMatchObject({ voided_approval_id: a.approval.approvalId, quorum: 1, live_before: 1, live_after: 0, from_state: 'approved', to_state: 'under_review', quorum_lost: true });
    expect(await approvalRow(a.approval.approvalId)).toMatchObject({ revoked_reason: 'recused: A family member works for the second source (B36 harness).' });
    expect(await versionState(P.pkg, P.v)).toBe('under_review');
    expect(await pkgState(P.pkg)).toBe('under_review');
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))).toMatchObject({ kind: 'decision', state: 'recused', by: w.approver.principalId });
    expect((await events(P.pkg, 'gate.recused'))[0]!.details).toMatchObject({ recusal_id: r['recusal_id'], quorum_lost: true });
    const rec = await record(P.pkg, P.v);
    expect(rec.approvals.map((x) => [x['approver'], x['recused']])).toEqual([[w.approver.principalId, true]]);
    expect(rec.recusals).toHaveLength(1);
    /* the quorum restored by another approver (the policy names one principal; approver2 holds the role — the terms admit the role too) */
    const Q = await c.proposed({ terms: { approverPolicy: { quorum: 1, roles: ['decision_approver'], expires_after_days: 14 } } });
    await approveAs(Q.pkg, Q.v, Q.digest, w.approver);
    await recuse(w.approver, Q.pkg, Q.v, 'Recused: a conflict declared (B36 harness).');
    expect(await versionState(Q.pkg, Q.v)).toBe('under_review');
    await approveAs(Q.pkg, Q.v, Q.digest, w.approver2);
    expect(await versionState(Q.pkg, Q.v)).toBe('approved');
    expect((await gateState({ kind: 'decision', id: Q.pkg, version: Q.v }))['state']).toBe('approved');
    evidence('l1 positive', { recusal: r['recusal_id'], restored: Q.pkg });
  });
  it('l1 · REFUSAL: the recused approver approving again (403), recusing twice (409), a non-approver recusing (403), recusing a committed version (409)', async () => {
    const P = await c.proposed({ terms: { approverPolicy: { quorum: 1, roles: ['decision_approver'], expires_after_days: 14 } } });
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await recuse(w.approver, P.pkg, P.v, 'Recused on a declared conflict (B36 harness).');
    await refused(approveAs(P.pkg, P.v, P.digest, w.approver), /^approval rejected \(recused\): principal .* recused from version 1/, 403);
    await refused(recuse(w.approver, P.pkg, P.v, 'Recusing twice (B36 harness).'), /^recusal rejected \(state\): principal .* is already recused/, 409);
    await refused(recuse(w.executive, P.pkg, P.v, 'The executive is not an approver (B36 harness).'), /./, 403);
    await approveAs(P.pkg, P.v, P.digest, w.approver2);
    await c.commit(P.pkg, P.v, P.digest);
    await refused(recuse(w.approver2, P.pkg, P.v, 'Too late to recuse (B36 harness).'), /^recusal rejected \(state\): version 1 is committed/, 409);
    evidence('l1 refusal', { again: 403, twice: 409, non_approver: 403, committed: 409 });
  });
  it('l1 · RECOVERY: a version that lost its quorum to a recusal is approved by the other approver and commits', async () => {
    const P = await c.proposed({ terms: { approverPolicy: { quorum: 1, roles: ['decision_approver'], expires_after_days: 14 } } });
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await recuse(w.approver, P.pkg, P.v, 'Recused (B36 harness recovery).');
    await approveAs(P.pkg, P.v, P.digest, w.approver2);
    const cm = await c.commit(P.pkg, P.v, P.digest);
    expect(cm.commitment.approvals.map((a) => a.approver)).toEqual([w.approver2.principalId]);
    evidence('l1 recovery', { commitment: cm.commitment.commitmentId });
  });
});

describe('l2 · CHALLENGE as an explicit transition — a member or the auditor; the commitment held; resolved by the owner', () => {
  it('l2 · POSITIVE: a room member challenges before the commitment → gate `challenged`, the commit HELD (the service and the row); dismissed → approved and committed; the auditor challenges after → upheld → reopen required, the commitment standing', async () => {
    const P = await c.proposed();
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await roomWith(P.pkg, [member]);
    const ch = (await challenge(member, P.pkg, P.v, 'The second source was never audited (B36 harness).')).challenge;
    expect(ch).toMatchObject({ standing: 'member', after_commitment: false, gate_state: 'challenged' });
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))).toMatchObject({ state: 'challenged', by: member.principalId });
    const pv = (await c.preview(P.pkg, P.v, P.digest)).preview;
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv.preview_digest), /^commitment rejected \(challenged\): challenge .* is open on version 1/, 409);
    await refused(directCommit(P.pkg, P.v, P.digest, pv.preview_digest), /^commitment rejected \(challenged\): challenge .* is open on version 1/, 409);
    expect(await commitments(P.pkg)).toBe(0);
    await refused(resolve(w.owner, P.pkg, P.v, String(ch['challenge_id']), 'sideways', 'neither'), /^challenge resolution rejected \(resolution\)/, 422);
    const rs = (await resolve(w.owner, P.pkg, P.v, String(ch['challenge_id']), 'dismissed', 'The audit report is on file (B36 harness).')).resolution;
    expect(rs).toMatchObject({ resolution: 'dismissed', effect: { kind: 'none', version_state: 'approved' } });
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))['state']).toBe('approved');
    await c.commit(P.pkg, P.v, P.digest);
    /* after the commitment: the tenant's auditor */
    const ch2 = (await challenge(auditor, P.pkg, P.v, 'The commitment cites a run whose baseline was invalidated (B36 harness).')).challenge;
    expect(ch2).toMatchObject({ standing: 'auditor', after_commitment: true });
    const rs2 = (await resolve(w.owner, P.pkg, P.v, String(ch2['challenge_id']), 'upheld', 'Upheld; the package is reopened on the recorded cause (B36 harness).')).resolution;
    expect(rs2['effect']).toMatchObject({ kind: 'reopen_required', committed_version: P.v });
    expect(await versionState(P.pkg, P.v), 'the commitment stands (D5)').toBe('committed');
    expect(await commitments(P.pkg)).toBe(1);
    expect((await events(P.pkg, 'gate.challenge_resolved')).map((e) => e.details['resolution'])).toEqual(['dismissed', 'upheld']);
    const rec = await record(P.pkg, P.v);
    expect(rec.challenges.map((x) => [x['standing'], x['resolution']])).toEqual([['member', 'dismissed'], ['auditor', 'upheld']]);
    evidence('l2 positive', { challenges: [ch['challenge_id'], ch2['challenge_id']] });
  });
  it('l2 · REFUSAL: a non-member (403), the challenger resolving (403), a second open challenge (409), a non-owner resolving (403), a draft challenged (409)', async () => {
    const P = await c.proposed();
    await roomWith(P.pkg, [member]);
    await refused(challenge(w.approver2, P.pkg, P.v, 'Not a member of the room (B36 harness).'), /^decision challenge rejected \(authority\): principal .* is neither a member of the package's room nor the tenant's auditor/, 403);
    const ch = (await challenge(w.owner, P.pkg, P.v, 'The owner challenges their own version (B36 harness).')).challenge;
    await refused(challenge(member, P.pkg, P.v, 'A second challenge while one is open (B36 harness).'), /^decision challenge rejected \(state\): challenge .* is already open/, 409);
    await refused(resolve(w.owner, P.pkg, P.v, String(ch['challenge_id']), 'dismissed', 'Resolving my own challenge (B36 harness).'), /^challenge resolution rejected \(separation\): the challenger never resolves their own challenge/, 403);
    await refused(resolve(w.authority, P.pkg, P.v, String(ch['challenge_id']), 'dismissed', 'Not the owner (B36 harness).'), /./, 403);
    const { pkg: draft, v: dv } = await c.fullDraft();
    await refused(challenge(auditor, draft, dv, 'A draft is not at the gate (B36 harness).'), /^decision challenge rejected \(state\): version 1 is draft/, 409);
    evidence('l2 refusal', { non_member: 403, self_resolve: 403, second: 409, draft: 409 });
  });
  it('l2 · RECOVERY: a challenge upheld BEFORE the commitment leaves the gate through the withdrawal chain — the version superseded, its gate tasks cancelled, the package withdrawn; the gate reads withdrawn', async () => {
    const P = await c.proposed();
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await roomWith(P.pkg, [member]);
    const ch = (await challenge(member, P.pkg, P.v, 'The premium cap was exceeded (B36 harness).')).challenge;
    const rs = (await resolve(w.owner, P.pkg, P.v, String(ch['challenge_id']), 'upheld', 'Upheld: the version is withdrawn; a new one follows (B36 harness).')).resolution;
    expect(rs['effect']).toMatchObject({ kind: 'withdrawn', package_state: 'withdrawn' });
    expect(await versionState(P.pkg, P.v)).toBe('superseded');
    expect(await pkgState(P.pkg)).toBe('withdrawn');
    expect((await tasks(P.pkg, 'gate.approve')).map((t) => t.state), 'no gate task stays open (the approval completed it; the chain cancels what is open)').not.toContain('open');
    expect((await events(P.pkg, 'package.withdrawn'))[0]!.details).toMatchObject({ challenge_id: ch['challenge_id'] });
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))).toMatchObject({ state: 'withdrawn', terminal: true });
    evidence('l2 recovery', { withdrawn: P.pkg });
  });
});

describe('l3 · MISSING INFORMATION and EXPECTED EFFECTS as first-class validated fields of the version', () => {
  const owner = () => w.owner.principalId;
  it('l3 · POSITIVE: the owner sets the fields on the draft; the proposal validates them again and records version.fields_validated; the record and the board surface carry them', async () => {
    const { pkg, v } = await c.fullDraft();
    const f = (await setFields(w.owner, pkg, v, { missingInformation: [{ what: 'the customs broker\'s pre-clearance quote', owner: owner(), needed_by: '2026-10-15' }],
      expectedEffects: [{ effect: 'fewer line-stop days at SYN-LINE-A1', measure: 'line_stop_days', direction: 'down', horizon: '90d', basis: 'the intervention run against the control (SYNTHETIC)' }] })).fields;
    expect(f).toMatchObject({ missing_information: [{ what: 'the customs broker\'s pre-clearance quote', owner: owner(), needed_by: '2026-10-15' }], expected_effects: [{ direction: 'down', horizon: '90d' }] });
    const pr = (await c.propose(pkg, v)).proposal as Row;
    expect(pr['fieldsValidated']).toMatchObject({ version: v, missing_information: 1, expected_effects: 1 });
    expect((await events(pkg, 'version.fields_validated'))[0]!.details).toMatchObject({ version: v, missing_information: 1, expected_effects: 1 });
    const rec = await record(pkg, v);
    expect(rec['missing_information']).toHaveLength(1);
    expect((rec['expected_effects'] as Row[])[0]).toMatchObject({ measure: 'line_stop_days' });
    evidence('l3 positive', { pkg, digest: (pr['fieldsValidated'] as Row)['fields_digest'] });
  });
  it('l3 · REFUSAL: a malformed field refused NAMING it (422); the fields of a proposed version immutable (409); another principal (403)', async () => {
    const { pkg, v } = await c.fullDraft();
    await refused(setFields(w.owner, pkg, v, { missingInformation: [{ what: 'x', owner: owner(), needed_by: '2026-10-15' }] }), /^version fields rejected \(missing_information\[0\]\.what\): says what is missing/, 422);
    await refused(setFields(w.owner, pkg, v, { missingInformation: [{ what: 'the quote', owner: 'nobody', needed_by: '2026-10-15' }] }), /^version fields rejected \(missing_information\[0\]\.owner\)/, 422);
    await refused(setFields(w.owner, pkg, v, { expectedEffects: [{ effect: 'fewer stops', measure: 'line_stop_days', direction: 'sideways', horizon: '90d', basis: 'the run' }] }), /^version fields rejected \(expected_effects\[0\]\.direction\): up, down or flat/, 422);
    await refused(setFields(w.owner, pkg, v, { expectedEffects: [{ effect: 'fewer stops', measure: 'line_stop_days', direction: 'down', horizon: '2y', basis: 'the run' }] }), /^version fields rejected \(expected_effects\[0\]\.horizon\)/, 422);
    await refused(setFields(w.approver, pkg, v, { missingInformation: [] }), /./, 403);
    expect((await sql<{ m: unknown[] }>`select missing_information m from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(su)).rows[0]!.m, 'a refused set writes nothing').toEqual([]);
    await c.propose(pkg, v);
    await refused(setFields(w.owner, pkg, v, { missingInformation: [] }), /^version fields rejected \(state\): version 1 is proposed; the fields of a proposed version are immutable/, 409);
    evidence('l3 refusal', { named: ['missing_information[0].what', 'missing_information[0].owner', 'expected_effects[0].direction', 'expected_effects[0].horizon'], proposed: 409 });
  });
  it('l3 · RECOVERY: the corrected fields set after the refusal; the proposal succeeds and validates them', async () => {
    const { pkg, v } = await c.fullDraft();
    await refused(setFields(w.owner, pkg, v, { expectedEffects: [{ effect: 'x', measure: 'm', direction: 'up', horizon: '30d', basis: 'b' }] }), /expected_effects\[0\]\.effect/, 422);
    await setFields(w.owner, pkg, v, { expectedEffects: [{ effect: 'higher on-time delivery', measure: 'on_time_share', direction: 'up', horizon: '12m', basis: 'the second source\'s lead time (SYNTHETIC)' }] });
    const pr = (await c.propose(pkg, v)).proposal as Row;
    expect(pr['fieldsValidated']).toMatchObject({ missing_information: 0, expected_effects: 1 });
    evidence('l3 recovery', { pkg });
  });
});

describe('l4 · THE BOARD (PER-01): a board member decides a board-class package only through the gate — approve, reject, defer', () => {
  it('l4 · POSITIVE: the executive reserves a draft for the board; two board members approve through decision.board.approve (one defers first); the board surface shows the gate state, the approvals and the signatures; committed at the board quorum', async () => {
    const { pkg, v } = await c.fullDraft({ terms: { approverPolicy: { quorum: 2, roles: ['board_member'], expires_after_days: 14 } } });
    await dc().reserveBoard(h.req(w.executive, 'decision.board.reserve', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { board: { charter: 'The supervisory board of NORDWERK (SYNTHETIC)', quorum: 2 }, rationale: 'A second source above the premium cap is the board\'s (B36 harness).' } });
    const digest = (await c.propose(pkg, v)).proposal.versionDigest;
    let surface = await boardList(board1);
    const row = surface.find((p) => p['package_id'] === pkg)!;
    expect(row).toMatchObject({ decision_class: 'board', quorum: 2, live_approvals: 0, own_approval: null, own_recusal: false });
    expect((row['gate'] as Row)['state']).toBe('review_requested');
    /* board member 2 DEFERS with a next review (a gate act under decision.board.defer); the owner resumes */
    const df = (await boardAct(board2, pkg, v, 'defer', { rationale: 'The board meets next week (B36 harness).', nextReviewAt: inDays(7) })).board;
    expect(df).toMatchObject({ action: 'defer', to_state: 'deferred', standing: 'approver' });
    expect((await gateState({ kind: 'decision', id: pkg, version: v }))['state']).toBe('deferred');
    await gate(w.owner, pkg, v, 'resume', { rationale: 'The board met (B36 harness).' });
    /* the approvals through the board's own action, on the digest read */
    const a1 = (await boardAct(board1, pkg, v, 'approve', { versionDigest: digest, rationale: 'The board approves the second source (B36 harness).' })).board;
    expect(a1).toMatchObject({ decision: 'approve', state: 'under_review', liveApprovals: 1, quorum: 2, eligibleBy: 'role:board_member' });
    const a2 = (await boardAct(board2, pkg, v, 'approve', { versionDigest: digest, rationale: 'The board approves (B36 harness).' })).board;
    expect(a2).toMatchObject({ state: 'approved', liveApprovals: 2 });
    /* the board member signs their own approval (decision.sign.approval admits the role) */
    const ad = (await approvalRow(String(a1['approvalId']))).header_digest;
    expect(((await sign(board1, pkg, v, 'approval', ad, String(a1['approvalId']))).signature)['verified']).toBe(true);
    surface = await boardList(board1);
    const row2 = surface.find((p) => p['package_id'] === pkg)!;
    expect(row2).toMatchObject({ live_approvals: 2, own_approval: 'approve' });
    expect((row2['gate'] as Row)['state']).toBe('approved');
    expect((row2['approvals'] as Row[]).map((a) => [a['live'], (a['signatures'] as Row[]).length])).toEqual([[true, 1], [true, 0]]);
    expect(((row2['approvals'] as Row[])[0]!['signatures'] as Row[])[0]!['verified']).toBe(true);
    /* the independent decision-ready (a board decision requires it), then the commitment at the board quorum */
    const ip = String(((await dc().gateStatus(h.req(w.executive, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v))) as { gate: Row }).gate['information_package_digest']);
    await gate(analyst, pkg, v, 'ready', { rationale: 'The board pack is complete (B36 harness).', informationPackageDigest: ip });
    await c.commit(pkg, v, digest);
    expect((await events(pkg, 'package.committed'))[0]!.details['decision_class']).toBe('board');
    evidence('l4 positive', { pkg, approvals: [a1['approvalId'], a2['approvalId']] });
  });
  it('l4 · REFUSAL: a board member on a STANDARD package through the board route (403 at the port: class); the standard approve route (403 at the PDP, the denial recorded); an approver on the board route (403 at the PDP); the executive reading the board is fine, the analyst is not', async () => {
    const P = await c.proposed();
    await refused(boardAct(board1, P.pkg, P.v, 'approve', { versionDigest: P.digest, rationale: 'A board member on a standard package (B36 harness).' }), /^board decision rejected \(class\): package .* is a standard decision; a board member decides a board-class package only/, 403);
    await refused(boardAct(board1, P.pkg, P.v, 'defer', { rationale: 'Deferring a standard package (B36 harness).', nextReviewAt: inDays(3) }), /^board decision rejected \(class\)/, 403);
    const pdp = await refused(approveAs(P.pkg, P.v, P.digest, board1), /no qualifying role binding/, 403);
    expect(pdp.code).toBe('EYE-AUT-001');
    await refused(boardAct(w.approver, P.pkg, P.v, 'approve', { versionDigest: P.digest, rationale: 'An approver on the board route (B36 harness).' }), /no qualifying role binding/, 403);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.approvals where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]!.n, 'nothing approved').toBe(0);
    await boardList(w.executive);
    await refused(boardList(analyst), /no qualifying role binding/, 403);
    evidence('l4 refusal', { class: 403, pdp_standard: 403, approver_on_board: 403 });
  });
  it('l4 · RECOVERY: after the refusal on the standard package, the same board member\'s act on a board-class package succeeds; a board member may recuse through the gate', async () => {
    const { pkg, v } = await c.fullDraft({ terms: { approverPolicy: { quorum: 2, roles: ['board_member'], expires_after_days: 14 } } });
    await dc().reserveBoard(h.req(w.executive, 'decision.board.reserve', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { board: { charter: 'The supervisory board (SYNTHETIC)', quorum: 2 }, rationale: 'Reserved for the board (B36 harness).' } });
    const digest = (await c.propose(pkg, v)).proposal.versionDigest;
    const a = (await boardAct(board1, pkg, v, 'approve', { versionDigest: digest, rationale: 'The board member approves the board package (B36 harness).' })).board;
    expect(a).toMatchObject({ decision: 'approve', eligibleBy: 'role:board_member' });
    const r = (await recuse(board1, pkg, v, 'A conflict of interest declared at the board (B36 harness).')).recusal;
    expect(r).toMatchObject({ voided_approval_id: a['approvalId'], live_after: 0 });
    expect((await boardList(board1)).find((p) => p['package_id'] === pkg)).toMatchObject({ own_recusal: true, live_approvals: 0 });
    evidence('l4 recovery', { pkg, recusal: r['recusal_id'] });
  });
});

describe('l5 · A PDP DENIAL as a versioned object linked to the replay — recorded by the pipeline\'s denial path', () => {
  it('l5 · POSITIVE: a denied gate act (the executive deferring: no rule admits it) is recorded with the package version at the time and the policy decision; gate.denied on the package; the replay and the record list it', async () => {
    const P = await c.proposed();
    const r = await refused(gate(w.executive, P.pkg, P.v, 'defer', { rationale: 'The executive tries to defer (B36 harness).', nextReviewAt: inDays(3) }), /no qualifying role binding/, 403);
    expect(r.code).toBe('EYE-AUT-001');
    const rows = await denials(P.pkg);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ principal_id: w.executive.principalId, action: 'decision.gate.defer', package_version: P.v, decision: 'deny' });
    const pol = (await sql<{ decision: string; action: string }>`select decision, action from policy.policy_decisions where id = ${rows[0]!.policy_decision_id}::uuid`.execute(su)).rows[0];
    expect(pol, 'linked to the policy decision the denial path wrote').toMatchObject({ decision: 'deny', action: 'decision.gate.defer' });
    expect((await events(P.pkg, 'gate.denied'))[0]!.details).toMatchObject({ denial_id: expect.any(String), action: 'decision.gate.defer', version: P.v });
    /* a human-gate denial (an agent principal at the gate) is a denial too */
    await refused(gate(w.agent, P.pkg, P.v, 'review', { rationale: 'An agent reads the gate (B36 harness).' }), /./, 403);
    expect((await denials(P.pkg)).map((d) => d.action)).toEqual(['decision.gate.defer', 'decision.gate.review']);
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await c.commit(P.pkg, P.v, P.digest);
    const rp = (await c.replay(P.pkg, P.v)).replay as unknown as { denials: Row[]; contentDigest: string };
    expect(rp.denials.map((d) => [d['action'], d['principal_id']])).toEqual([['decision.gate.defer', w.executive.principalId], ['decision.gate.review', w.agent.principalId]]);
    const rec = await record(P.pkg, P.v);
    expect(rec.denials).toHaveLength(2);
    evidence('l5 positive', { denials: rows.length + 1, policy_decision: rows[0]!.policy_decision_id });
  });
  it('l5 · REFUSAL: a direct call of the port under an AUTHORITY context is refused (403: the evidence context alone records a denial); a denial outside decision.* records nothing', async () => {
    const P = await c.proposed();
    const direct = pipeline.write(h.env(w.owner, 'decision.package.terms', 'DPK', P.pkg, 'decision'), w.owner,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'decision.package.terms', objectType: 'DPK', objectId: P.pkg }, (tx: unknown) => tx,
      async (tx) => {
        await sql`select decision.record_pdp_denial(${uuidv7()}::uuid, 'decision.package.terms', 'DPK', ${P.pkg}::uuid, ${uuidv7()}::uuid, 'deny', 'forged', 'bundle-v1', ${uuidv7()}::uuid)`.execute(tx as never);
        return { result: null, targetType: 'DPK', targetId: P.pkg, targetVersion: '1', outboxEvent: null };
      });
    await refused(direct, /^pdp denial rejected \(context\): a denial is recorded under the evidence context of the refused request \(mode authority\)/, 403);
    expect(await denials(P.pkg)).toHaveLength(0);
    /* a refused act outside decision.* (the approver declaring a strategy object: no planning authority) leaves the decision ledger untouched */
    await refused(w.graph.declare(h.req(w.approver, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'not the approver\'s assumption', statement: 'the approver has no planning authority (B36 harness)',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about the rerouted chain' }] } }), /no qualifying role binding/, 403);
    expect(Number((await sql<{ n: number }>`select count(*)::int n from decision.pdp_denials where action not like 'decision.%'`.execute(su)).rows[0]!.n)).toBe(0);
    evidence('l5 refusal', { direct: 403 });
  });
  it('l5 · RECOVERY: the denied act is done by the person who holds it; the denial stays in the record (append-only)', async () => {
    const P = await c.proposed();
    await refused(gate(w.executive, P.pkg, P.v, 'defer', { rationale: 'Denied first (B36 harness).', nextReviewAt: inDays(3) }), /./, 403);
    await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'The owner defers (B36 harness).', nextReviewAt: inDays(3) });
    expect(await versionState(P.pkg, P.v)).toBe('deferred');
    const d = (await denials(P.pkg))[0]!;
    await expect(sql`delete from decision.pdp_denials where policy_decision_id = ${d.policy_decision_id}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    expect(await denials(P.pkg)).toHaveLength(1);
    evidence('l5 recovery', { deferred_by_owner: true });
  });
});

describe('l6 · ONE uniform human-gate state (ADR-003) — a decision version, a source contract, a merge', () => {
  it('l6 · POSITIVE: the three kinds answer the same shape from the same vocabulary — the decision through its life, the fixture source (active → approved), a merge (proposed → review_requested)', async () => {
    const { pkg, v } = await c.fullDraft();
    expect(await gateState({ kind: 'decision', id: pkg, version: v })).toMatchObject({ kind: 'decision', state: 'drafted', by: w.owner.principalId });
    const digest = (await c.propose(pkg, v)).proposal.versionDigest;
    expect((await gateState({ kind: 'decision', id: pkg, version: v }))['state']).toBe('review_requested');
    await gate(w.owner, pkg, v, 'request-information', { rationale: 'The quote is missing (B36 harness).', infoRequest: 'the reroute quote', nextReviewAt: inDays(4) });
    expect((await gateState({ kind: 'decision', id: pkg, version: v }))['state']).toBe('information_requested');
    await gate(w.owner, pkg, v, 'resume', { rationale: 'The quote arrived (B36 harness).' });
    await approveAs(pkg, v, digest, w.approver);
    expect((await gateState({ kind: 'decision', id: pkg, version: v }))).toMatchObject({ state: 'approved', terminal: false });
    await c.commit(pkg, v, digest);
    expect((await gateState({ kind: 'decision', id: pkg, version: v }))['state']).toBe('approved');
    /* the source contract (0022): the fixture's active contract */
    const src = await gateState({ kind: 'source', id: h.fx.sourceId });
    expect(src).toMatchObject({ kind: 'source', id: h.fx.sourceId, state: 'approved' });
    expect(String(src['basis'])).toMatch(/^lifecycle active, rights confirmed/);
    /* a merge (0024 graph.resolutions_current): a SYNTHETIC human resolution row, proposed */
    const res = uuidv7();
    await sql`insert into graph.resolutions_current (resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version, mention_text, entity_id, method, rule_id, rule_version, score, match_evidence, candidate_set, state, proposer_principal_id, evidence_object_id, evidence_digest, correlation_id)
              values (${res}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, 1, 'NORDWERK GmbH (SYNTHETIC)', ${w.entityId}::uuid, 'human', 'b36-harness', '1', 1, '{"basis": "a person read the mention (SYNTHETIC)"}'::jsonb, '[]'::jsonb, 'proposed', ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid, ${sha256('b36 merge')}, ${uuidv7()}::uuid)`.execute(su);
    expect(await gateState({ kind: 'merge', id: res })).toMatchObject({ kind: 'merge', id: res, state: 'review_requested', by: w.twinOwner.principalId });
    evidence('l6 positive', { decision: pkg, source: h.fx.sourceId, merge: res });
  });
  it('l6 · REFUSAL: an unknown kind (422), an unknown subject (404), a malformed version (422)', async () => {
    await refused(gateState({ kind: 'publication', id: uuidv7() }), /^gate state rejected \(kind\): a decision, a source or a merge/, 422);
    await refused(gateState({ kind: 'decision', id: uuidv7(), version: 1 }), /^gate state rejected \(unknown_subject\)/, 404);
    await refused(gateState({ kind: 'source', id: uuidv7() }), /unknown_subject/, 404);
    await refused(gateState({ kind: 'merge', id: uuidv7() }), /unknown_subject/, 404);
    await refused(gateState({ kind: 'decision', id: uuidv7(), version: 0 }), /^gate state rejected \(version\)/, 422);
    evidence('l6 refusal', { kind: 422, unknown: 404 });
  });
  it('l6 · RECOVERY: the badge follows the record — a merge accepted reads approved; a decision challenged then dismissed reads approved again', async () => {
    const res = uuidv7();
    await sql`insert into graph.resolutions_current (resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version, mention_text, entity_id, method, rule_id, rule_version, score, match_evidence, candidate_set, state, proposer_principal_id, decided_by, decided_at, decision_reason, accepted_at, evidence_object_id, evidence_digest, correlation_id)
              values (${res}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, 1, 'NORDWERK GmbH (SYNTHETIC)', ${w.entityId}::uuid, 'human', 'b36-harness', '1', 1, '{"basis": "accepted (SYNTHETIC)"}'::jsonb, '[]'::jsonb, 'accepted', ${w.twinOwner.principalId}::uuid, ${w.operator.principalId}::uuid, clock_timestamp(), 'accepted by a person (SYNTHETIC)', clock_timestamp(), ${uuidv7()}::uuid, ${sha256('b36 merge accepted')}, ${uuidv7()}::uuid)`.execute(su);
    expect(await gateState({ kind: 'merge', id: res })).toMatchObject({ state: 'approved', by: w.operator.principalId });
    const P = await c.proposed();
    await approveAs(P.pkg, P.v, P.digest, w.approver);
    await roomWith(P.pkg, [member]);
    const ch = (await challenge(member, P.pkg, P.v, 'Challenged for the badge (B36 harness).')).challenge;
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))['state']).toBe('challenged');
    await resolve(w.owner, P.pkg, P.v, String(ch['challenge_id']), 'dismissed', 'Dismissed for the badge (B36 harness).');
    expect((await gateState({ kind: 'decision', id: P.pkg, version: P.v }))['state']).toBe('approved');
    evidence('l6 recovery', { merge: res, decision: P.pkg });
  });
});
