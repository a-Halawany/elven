/**
 * CP-6 B34-F2 (migration 0091 section `execution`; F-P6-05) — THE POSITIVE SYNTHETIC ERP SCENE THROUGH THE PRODUCT, on a real database, the
 * real pipeline and a SYNTHETIC ERP (scripts/execution/synthetic-erp.mjs, spawned: a real TLS server on a free loopback port with a
 * self-signed certificate for the LITERAL 127.0.0.1, requiring the bearer bound by reference as EYE_DST_B34F).
 *
 * NO SUBSTITUTION: unlike phase6-commitments-b34 (whose harness replaces ExecutionEgress.deliver with a pinned loopback transport), this file
 * never touches the egress. The API is booted with the deployment switch EYE_EXECUTION_SYNTHETIC_LOOPBACK=on and the target is declared on
 * the loopback literal: the product's own synthetic loopback path carries the handoff (the declared anchor verified, the bearer by
 * reference), and every attempt records the path (decision.execution_attempts.transport). The switch's OFF state is the deployment
 * configuration's value set to `off` in this process (stated: the config object the egress reads at each attempt), then restored.
 *
 * Stated superuser moves: a handoff's next attempt moved into the past to run the tick's retry now (the DB clock); one FORGED attempt row
 * inserted to prove the database's guard refuses the synthetic label on a non-loopback target (it is refused — nothing is written).
 *
 *   P1 · THE SCENE — the dual-sourcing handoff to the synthetic ERP on 127.0.0.1 in `partial`: issued by the execution authority, carried by
 *        the synthetic loopback path; the real receipt bound (handoff id, attempt, payload digest) — HALF effected, the residual per line,
 *        a partial_effect exception; the residual to a named compensation owner (reissue_residual); the compensating handoff issued and
 *        effected; both reconciled; the get route and the issue route name the path
 *   R1 · THE REFUSALS — a non-synthetic target refused at declaration (the owner decision, unchanged); the switch ON but a synthetic target
 *        on a NAME (localhost) or a private literal (10.20.30.40) → the production vetting refuses (nothing reaches the ERP); the switch OFF →
 *        the same loopback target refused by the production vetting; the database refuses a forged synthetic-loopback attempt on a
 *        non-loopback target
 *   T1 · THE RETRY — `error` (500) on the synthetic path; the tick's execution-deliveries step retries it on the SAME path (0091 §X3: the
 *        work list carries `synthetic`) → effected at attempt 2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { CommitmentController } from '../../src/decision/commitments/commitment.controller.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import type { EyeConfig } from '../../src/config/config.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_EXECUTION_SYNTHETIC_LOOPBACK'] = 'on'; // THE DEPLOYMENT SWITCH (default off), set before the boot
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b34f-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
// The target's bearer: built at run time (never a literal that looks like a secret), bound by reference before the boot.
const DST_REF = 'EYE_DST_B34F';
const DST_TOKEN = `b34f-${createHash('sha256').update(String(process.pid) + String(Date.now())).digest('hex').slice(0, 24)}`;
process.env[DST_REF] = DST_TOKEN;
const ERP = resolvePath(__dirname, '../../../../scripts/execution/synthetic-erp.mjs');
const ERP_HOST = '127.0.0.1'; // the loopback LITERAL: the certificate's IP SAN, the endpoint's host, the pinned address

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let exec: ExecutiveController; let cm: CommitmentController; let cfg: EyeConfig;
let scheduler: SchedulerService; let timer: AttentionTimerService;
let dadmin: AuthenticatedPrincipal; let issuer: AuthenticatedPrincipal; let buyer: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
let erp: ChildProcess | null = null; let erpPort = 0; let erpCert = ''; let agentId = '';
let P = { pkg: '', v: 0, digest: '', approvalId: '', commitmentId: '' }; let HAND = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const evidence = (caseName: string, e: Row): void => console.log(`B34F EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<void> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
};

/* ───────────── the routes ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'decision');
const getC = (as: AuthenticatedPrincipal, id: string) => cm.get(R(as, 'decision.commitment.read', 'CMT', id), T(), D(), id, { payload: {} }) as Promise<{ commitment: Row & { handoffs: Array<Row & { attempts: Row[] }> } }>;
const declareItem = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.declareItem(R(as, 'decision.commitment.item.declare', 'CMT', id), T(), D(), id, { payload }) as Promise<{ item: Row }>;
const accept = (as: AuthenticatedPrincipal, id: string) => cm.accept(R(as, 'decision.commitment.item.accept', 'CMI', id), T(), D(), id, { payload: { note: 'accepted (harness)' } }) as Promise<{ item: Row }>;
const declareTarget = (as: AuthenticatedPrincipal, payload: Row) => cm.declareTarget(R(as, 'decision.execution.target.declare', 'EXT', null), T(), D(), { payload }) as Promise<{ target: Row }>;
const draft = (as: AuthenticatedPrincipal, itemId: string, payload: Row) => cm.draft(R(as, 'decision.execution.draft', 'EXH', null), T(), D(), itemId, { payload }) as Promise<{ handoff: Row }>;
const issue = (as: AuthenticatedPrincipal, id: string, payloadDigest: string) => cm.issue(R(as, 'decision.execution.issue', 'EXH', id), T(), D(), id, { payload: { payloadDigest } }) as Promise<{ handoff: Row & { attempt: Row; transport: string | null; egress: Row | null; receipt: Row | null } }>;
const compensate = (as: AuthenticatedPrincipal, id: string, payload: Row) => cm.compensate(R(as, 'decision.execution.compensation.assign', 'EXH', id), T(), D(), id, { payload }) as Promise<{ compensation: Row }>;
const reconcile = (as: AuthenticatedPrincipal, id: string) => cm.reconcile(R(as, 'decision.execution.reconcile', 'EXH', id), T(), D(), id) as Promise<{ handoff: Row }>;

/* ───────────── the rows ───────────── */
const itemRow = async (id: string) => (await sql<Row>`select * from decision.commitment_items where item_id = ${id}::uuid`.execute(su)).rows[0]!;
const handoffRow = async (id: string) => (await sql<Row>`select * from decision.execution_handoffs where handoff_id = ${id}::uuid`.execute(su)).rows[0]!;
const effects = async (id: string) => (await sql<Row>`select line_key, requested_quantity::float8 req, effected_quantity::float8 eff, status from decision.execution_effects where handoff_id = ${id}::uuid order by line_key`.execute(su)).rows;
const attempts = async (id: string) => (await sql<Row>`select attempt, outcome, http_status, by_tick, transport, receipt ->> 'handoff_id' r_handoff, receipt ->> 'attempt' r_attempt, receipt ->> 'payload_digest' r_digest,
                                                              receipt_digest is not null has_receipt_digest, egress ->> 'synthetic_loopback_switch' switch, egress ->> 'refused' refused, egress ->> 'pinned_address' pinned
                                                         from decision.execution_attempts where handoff_id = ${id}::uuid order by attempt`.execute(su)).rows;
const exceptionsOf = async (itemId: string) => (await sql<Row>`select kind, state from decision.commitment_exceptions where item_id = ${itemId}::uuid order by raised_at`.execute(su)).rows;

/* ───────────── the ERP's side ───────────── */
const erpCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Row }> => new Promise((res, rej) => {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const req = httpsRequest({ host: ERP_HOST, port: erpPort, path, method, ca: erpCert, rejectUnauthorized: true,
    headers: { authorization: `Bearer ${DST_TOKEN}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
    const chunks: Buffer[] = [];
    r.on('data', (x: Buffer) => chunks.push(x));
    r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row }); } catch (e) { rej(e); } });
  });
  req.on('error', rej);
  if (payload !== null) req.write(payload);
  req.end();
});
const setMode = async (mode: string) => { expect((await erpCall('POST', '/_control', { mode })).status).toBe(200); };
const received = async () => (await erpCall('GET', '/_received')).body['received'] as Row[];
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const LINES = [
  { line_key: 'NDFEB-N52', description: 'NdFeB N52 magnet blocks from the second source (SYNTHETIC)', quantity: 1000, unit: 'kg' },
  { line_key: 'QUAL-LOT', description: 'Qualification lots for the second source (SYNTHETIC)', quantity: 4, unit: 'lot' },
];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { CommitmentController: Cc } = await import('../../src/decision/commitments/commitment.controller.js');
  exec = h.app.get(Ec); cm = h.app.get(Cc); cfg = h.app.get(EYE_CONFIG);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  expect(cfg['eye.execution.synthetic_loopback'], 'the deployment switch is ON in this boot').toBe('on');
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  dadmin = await h.humanWithSession(['domain_admin', 'strategy_owner'], 'b34f-dadmin');
  issuer = await h.humanWithSession(['execution_authority'], 'b34f-issuer');
  buyer = await h.humanWithSession(['decision_owner'], 'b34f-buyer');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b34f-tenant-admin', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b34f-executive');
  // The synthetic ERP on a FREE loopback port (the OS picks it; never the demo's :3444), its self-signed certificate for the literal the anchor.
  erp = spawn(process.execPath, [ERP, '--self-signed', ERP_HOST, '--listen', `${ERP_HOST}:0`, '--bearer-env', DST_REF, '--name', 'NORDWERK purchasing (SYNTHETIC, B34-F2)'], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`the ERP did not start: ${out.join('')}`)), 20_000);
    erp!.stdout!.on('data', (x: Buffer) => {
      out.push(x.toString('utf8'));
      const all = out.join(''); const cert = /^certificate (.+)$/m.exec(all); const l = /^listening (https:\/\/[^\s]+)$/m.exec(all);
      if (cert !== null && l !== null) { erpCert = readFileSync(cert[1]!, 'utf8'); erpPort = Number(new URL(l[1]!).port); clearTimeout(t); res(); }
    });
    erp!.stderr!.on('data', (x: Buffer) => out.push(x.toString('utf8')));
    erp!.on('exit', (code) => { clearTimeout(t); rej(new Error(`the ERP exited ${code}: ${out.join('')}`)); });
  });
  expect(erpPort).not.toBe(3444);
  // the attention agent: the tick's host (T1); its first scheduled tick waited for, then the timer unscheduled (the ticks below are the hook's)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // the commitment and its handoff item (the root seeded by the commit; the handoff item declared and accepted by the owner)
  P = await c.committed();
  const root = String((await sql<Row>`select item_id::text from decision.commitment_items where commitment_id = ${P.commitmentId}::uuid and parent_item_id is null`.execute(su)).rows[0]!['item_id']);
  await accept(w.owner, root);
  HAND = String((await declareItem(w.owner, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request to the ERP (B34-F2)', owner: w.owner.principalId, dueAt: inDays(10) })).item['item_id']);
  await accept(w.owner, HAND);
}, 300_000);

afterAll(async () => {
  delete process.env[DST_REF];
  delete process.env['EYE_EXECUTION_SYNTHETIC_LOOPBACK'];
  if (erp !== null) erp.kill('SIGTERM');
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  await h?.close();
}, 120_000);

describe('B34-F2 · the positive synthetic ERP scene through the product (0091 section execution; F-P6-05)', () => {
  it('P1 · THE SCENE: the handoff carried by the synthetic loopback path (no substitution); the real receipt bound; half effected → the residual → a named compensation owner → the compensating handoff effected → both reconciled', async () => {
    const endpoint = `https://${ERP_HOST}:${erpPort}/purchase-requests`;
    const t = await declareTarget(dadmin, { targetKey: 'nordwerk-erp-loopback', label: 'NORDWERK purchasing (SYNTHETIC, loopback literal)', endpoint, credentialRef: DST_REF, trustAnchorPem: erpCert, synthetic: true });
    expect(t.target).toMatchObject({ target_key: 'nordwerk-erp-loopback', synthetic: true, state: 'active', trust_anchor_declared: true, credential_ref: DST_REF, endpoint });
    expect(JSON.stringify(t)).not.toContain(DST_TOKEN);
    await setMode('partial');
    const before = (await received()).length;
    const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp-loopback', lines: LINES })).handoff;
    const H1 = String(d['handoff_id']); const digest = String(d['payload_digest']);
    // the ISSUE (C3, the execution authority): the answer names the path, the pinned literal, the verified TLS and the bearer carried on the one hop
    const r = await issue(issuer, H1, digest);
    expect(r.handoff).toMatchObject({ state: 'issuing', transport: 'synthetic-loopback', attempt: { attempt: 1, outcome: 'partial', state: 'partially_effected' } });
    expect(r.handoff.egress).toMatchObject({ transport: 'synthetic-loopback', synthetic_loopback_switch: 'on', pinned_address: ERP_HOST, tls_verified: true, status: 200, request_sent: true,
      hops: [{ status: 200, credentialsCarried: true }] });
    expect(r.handoff.receipt).toMatchObject({ handoff_id: H1, attempt: 1, payload_digest: digest, status: 'partial', synthetic: true });
    expect(JSON.stringify(r)).not.toContain(DST_TOKEN);
    // the ERP received exactly this handoff, attempt and digest (the real transport, not a harness's)
    const got = (await received()).slice(before);
    expect(got).toEqual([expect.objectContaining({ handoff_id: H1, attempt: 1, payload_digest: digest, answered: 'partial' })]);
    // the receipt BOUND by the database (handoff id, attempt, payload digest) and the path recorded on the attempt
    expect(await attempts(H1)).toEqual([{ attempt: 1, outcome: 'partial', http_status: 200, by_tick: false, transport: 'synthetic-loopback', r_handoff: H1, r_attempt: '1', r_digest: digest,
      has_receipt_digest: true, switch: 'on', refused: null, pinned: ERP_HOST }]);
    // HALF effected: the residual per line, the partial_effect exception
    expect(await effects(H1)).toEqual([{ line_key: 'NDFEB-N52', req: 1000, eff: 500, status: 'partial' }, { line_key: 'QUAL-LOT', req: 4, eff: 2, status: 'partial' }]);
    expect(await handoffRow(H1)).toMatchObject({ state: 'partially_effected', attempts: 1, issued_by: issuer.principalId });
    expect((await exceptionsOf(HAND)).map((e) => `${String(e['kind'])}:${String(e['state'])}`)).toEqual(['partial_effect:open']);
    expect((await itemRow(HAND))['state']).toBe('exception');
    await refused(reconcile(w.owner, H1), /execution reconcile rejected \(residual_undisposed\)/, 409);
    // the residual to a NAMED compensation owner: reissue_residual, owned by the buyer
    const comp = (await compensate(w.owner, H1, { kind: 'reissue_residual', owner: buyer.principalId, dueAt: inDays(3), note: 'reissue the residual half to the second source (B34-F2 harness)' })).compensation;
    expect(comp).toMatchObject({ state: 'assigned', owner_principal_id: buyer.principalId, residual: [{ line_key: 'NDFEB-N52', residual: 500 }, { line_key: 'QUAL-LOT', residual: 2 }] });
    // the compensating handoff: drafted by the compensation's owner, issued by the authority, effected in full on the same path → the compensation done
    await setMode('normal');
    const d2 = (await draft(buyer, HAND, { targetKey: 'nordwerk-erp-loopback', compensationId: comp['compensation_id'], lines: [{ ...LINES[0], quantity: 500 }, { ...LINES[1], quantity: 2 }] })).handoff;
    const H2 = String(d2['handoff_id']);
    const r2 = await issue(issuer, H2, String(d2['payload_digest']));
    expect(r2.handoff).toMatchObject({ transport: 'synthetic-loopback', attempt: { outcome: 'effected', state: 'effected' } });
    expect(r2.handoff.receipt).toMatchObject({ handoff_id: H2, attempt: 1, payload_digest: String(d2['payload_digest']), status: 'accepted' });
    expect(await effects(H2)).toEqual([{ line_key: 'NDFEB-N52', req: 500, eff: 500, status: 'effected' }, { line_key: 'QUAL-LOT', req: 2, eff: 2, status: 'effected' }]);
    expect((await sql<Row>`select state from decision.execution_compensations where compensation_id = ${String(comp['compensation_id'])}::uuid`.execute(su)).rows[0]!['state']).toBe('done');
    // both reconciled: the exception resolved, the item back in progress
    expect((await reconcile(w.owner, H1)).handoff).toMatchObject({ state: 'reconciled', from: 'partially_effected' });
    expect((await reconcile(w.owner, H2)).handoff).toMatchObject({ state: 'reconciled', from: 'effected' });
    expect((await exceptionsOf(HAND)).map((e) => e['state'])).toEqual(['resolved']);
    expect((await itemRow(HAND))['state']).toBe('in_progress');
    // the get route (the commitments page's read) names the path of every attempt
    const g = await getC(executive, P.commitmentId);
    const seen = g.commitment.handoffs.filter((x) => [H1, H2].includes(String(x['handoff_id'])));
    expect(seen.flatMap((x) => x.attempts.map((a) => a['transport']))).toEqual(['synthetic-loopback', 'synthetic-loopback']);
    evidence('P1', { handoffs: [H1, H2], attempts: [...(await attempts(H1)), ...(await attempts(H2))].map((a) => ({ ...a })), effects: { [H1]: await effects(H1), [H2]: await effects(H2) },
      compensation: { id: comp['compensation_id'], kind: 'reissue_residual', owner: buyer.principalId }, erp_received: got.length + 1 });
  }, 240_000);

  it('R1 · THE REFUSALS: not synthetic (declare 422); switch ON with a synthetic target on a name or a private literal → the production vetting; switch OFF → the loopback target refused; the forged synthetic label refused by the database', async () => {
    // a real ERP remains an owner decision: the declaration is refused (unchanged by 0091)
    await refused(declareTarget(dadmin, { targetKey: 'real-erp', label: 'A real ERP', endpoint: `https://${ERP_HOST}:${erpPort}/x`, synthetic: false, trustAnchorPem: erpCert }), /execution target rejected \(not_synthetic\)/, 422);
    await setMode('normal');
    const tryTarget = async (targetKey: string, endpoint: string) => {
      await declareTarget(dadmin, { targetKey, label: `SYNTHETIC probe ${targetKey}`, endpoint, credentialRef: DST_REF, trustAnchorPem: erpCert, synthetic: true });
      const d = (await draft(w.owner, HAND, { targetKey, lines: [LINES[1]] })).handoff;
      const before = (await received()).length;
      const r = await issue(issuer, String(d['handoff_id']), String(d['payload_digest']));
      expect(((await received()).length), `nothing reached the ERP (${targetKey})`).toBe(before);
      return { id: String(d['handoff_id']), r };
    };
    // switch ON, a synthetic target on a NAME that resolves to loopback: not a literal → the production vetting → address_not_public
    const byName = await tryTarget('probe-localhost', `https://localhost:${erpPort}/purchase-requests`);
    expect(byName.r.handoff).toMatchObject({ transport: 'production', attempt: { attempt: 1, outcome: 'transport', state: 'issuing' } });
    expect(byName.r.handoff.egress).toMatchObject({ transport: 'production', synthetic_loopback_switch: 'on', transport_basis: 'the endpoint host is not an IPv4 loopback literal', refused: 'address_not_public', request_sent: null });
    // switch ON, a synthetic target on a PRIVATE literal → the production vetting → address_not_public (no connection)
    const priv = await tryTarget('probe-private', `https://10.20.30.40:${erpPort}/purchase-requests`);
    expect(priv.r.handoff.egress).toMatchObject({ transport: 'production', refused: 'address_not_public', request_sent: null });
    // switch OFF (the deployment configuration's value in this process): the SAME loopback-literal target → the production vetting → refused
    cfg['eye.execution.synthetic_loopback'] = 'off';
    let off: { id: string; r: Awaited<ReturnType<typeof issue>> };
    try {
      const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp-loopback', lines: [LINES[1]] })).handoff;
      const before = (await received()).length;
      off = { id: String(d['handoff_id']), r: await issue(issuer, String(d['handoff_id']), String(d['payload_digest'])) };
      expect((await received()).length, 'nothing reached the ERP (switch off)').toBe(before);
    } finally { cfg['eye.execution.synthetic_loopback'] = 'on'; }
    expect(off.r.handoff).toMatchObject({ transport: 'production', attempt: { outcome: 'transport', state: 'issuing' } });
    expect(off.r.handoff.egress).toMatchObject({ transport: 'production', synthetic_loopback_switch: 'off', transport_basis: 'the synthetic loopback switch is off', refused: 'address_not_public' });
    for (const x of [byName, priv, off]) expect((await attempts(x.id)).map((a) => `${String(a['transport'])}:${String(a['outcome'])}:${String(a['refused'])}`)).toEqual(['production:transport:address_not_public']);
    // the DATABASE refuses the synthetic label where it cannot be true (a forged attempt on the localhost target's handoff; nothing written)
    const forged = await sql`insert into decision.execution_attempts (attempt_id, scope, tenant_id, domain_id, handoff_id, attempt, outcome, http_status, egress, by_tick, actor_principal_id, correlation_id)
                             values (gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${byName.id}::uuid, 2, 'transport', null, ${JSON.stringify({ transport: 'synthetic-loopback' })}::jsonb, false, ${issuer.principalId}::uuid, gen_random_uuid())`
      .execute(su).then(() => null, (e: unknown) => (e as Error).message);
    expect(forged).toMatch(/execution attempt rejected \(transport\)/);
    const unknownPath = await sql`insert into decision.execution_attempts (attempt_id, scope, tenant_id, domain_id, handoff_id, attempt, outcome, http_status, egress, by_tick, actor_principal_id, correlation_id)
                                  values (gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${byName.id}::uuid, 2, 'transport', null, ${JSON.stringify({ transport: 'harness' })}::jsonb, false, ${issuer.principalId}::uuid, gen_random_uuid())`
      .execute(su).then(() => null, (e: unknown) => (e as Error).message);
    expect(unknownPath).toMatch(/dea_transport/);
    expect(await attempts(byName.id)).toHaveLength(1);
    evidence('R1', { refused: { declare_not_synthetic: 422, localhost: byName.r.handoff.egress, private_literal: priv.r.handoff.egress, switch_off: off.r.handoff.egress, forged_label: forged, unknown_path: unknownPath } });
  }, 240_000);

  it('T1 · THE RETRY: a 500 on the synthetic loopback path; the tick\'s execution-deliveries step retries it on the same path → effected at attempt 2', async () => {
    await setMode('error');
    const d = (await draft(w.owner, HAND, { targetKey: 'nordwerk-erp-loopback', lines: [LINES[1]] })).handoff;
    const id = String(d['handoff_id']);
    expect((await issue(issuer, id, String(d['payload_digest']))).handoff).toMatchObject({ transport: 'synthetic-loopback', attempt: { outcome: 'transport', state: 'issuing' } });
    await setMode('normal');
    await sql`update decision.execution_handoffs set next_attempt_at = clock_timestamp() - interval '1 second' where handoff_id = ${id}::uuid`.execute(su); // stated: the DB clock
    await tick(1);
    expect((await attempts(id)).map((a) => ({ attempt: a['attempt'], outcome: a['outcome'], http_status: a['http_status'], by_tick: a['by_tick'], transport: a['transport'] }))).toEqual([
      { attempt: 1, outcome: 'transport', http_status: 500, by_tick: false, transport: 'synthetic-loopback' },
      { attempt: 2, outcome: 'effected', http_status: 200, by_tick: true, transport: 'synthetic-loopback' }]);
    expect(await handoffRow(id)).toMatchObject({ state: 'effected', attempts: 2 });
    expect((await reconcile(w.owner, id)).handoff).toMatchObject({ state: 'reconciled' });
    evidence('T1', { handoff: id, attempts: await attempts(id) });
  }, 240_000);

  it('C1 · THE COMPENSATION CHAIN (0091 §F3): a reissue itself half effected, its residual reissued again and effected → reconciled newest first; the first compensation completed by its reconcile; the original reconciles', async () => {
    const ITEM = String((await declareItem(w.owner, P.commitmentId, { kind: 'handoff', title: 'Dual-source purchase request, the chain (B34-F2 §F3)', owner: w.owner.principalId, dueAt: inDays(10) })).item['item_id']);
    await accept(w.owner, ITEM);
    await setMode('partial');
    const d1 = (await draft(w.owner, ITEM, { targetKey: 'nordwerk-erp-loopback', lines: LINES })).handoff; const H1 = String(d1['handoff_id']);
    expect((await issue(issuer, H1, String(d1['payload_digest']))).handoff).toMatchObject({ transport: 'synthetic-loopback', attempt: { outcome: 'partial' } });
    // the first compensation: the residual (500 kg, 2 lots) reissued — and HALF effected again
    const c1 = (await compensate(w.owner, H1, { kind: 'reissue_residual', owner: buyer.principalId, dueAt: inDays(3), note: 'reissue the residual half (the chain, first link)' })).compensation;
    const d2 = (await draft(buyer, ITEM, { targetKey: 'nordwerk-erp-loopback', compensationId: c1['compensation_id'], lines: [{ ...LINES[0], quantity: 500 }, { ...LINES[1], quantity: 2 }] })).handoff; const H2 = String(d2['handoff_id']);
    expect((await issue(issuer, H2, String(d2['payload_digest']))).handoff).toMatchObject({ attempt: { outcome: 'partial', state: 'partially_effected' } });
    expect(await effects(H2)).toEqual([{ line_key: 'NDFEB-N52', req: 500, eff: 250, status: 'partial' }, { line_key: 'QUAL-LOT', req: 2, eff: 1, status: 'partial' }]);
    const compState = async (id: unknown) => String((await sql<Row>`select state from decision.execution_compensations where compensation_id = ${String(id)}::uuid`.execute(su)).rows[0]!['state']);
    expect(await compState(c1['compensation_id'])).toBe('in_progress');
    await refused(reconcile(w.owner, H1), /residual_undisposed.*1 live/, 409);
    // the second compensation: the second residual reissued and effected in full
    const c2 = (await compensate(w.owner, H2, { kind: 'reissue_residual', owner: buyer.principalId, dueAt: inDays(3), note: 'reissue the remaining residual (the chain, second link)' })).compensation;
    await setMode('normal');
    const d3 = (await draft(buyer, ITEM, { targetKey: 'nordwerk-erp-loopback', compensationId: c2['compensation_id'], lines: [{ ...LINES[0], quantity: 250 }, { ...LINES[1], quantity: 1 }] })).handoff; const H3 = String(d3['handoff_id']);
    expect((await issue(issuer, H3, String(d3['payload_digest']))).handoff).toMatchObject({ attempt: { outcome: 'effected', state: 'effected' } });
    expect(await compState(c2['compensation_id'])).toBe('done');
    // reconciled newest first: H3 (effected); H2 (partially effected, its residual disposed by c2) → c1 DONE by the reconcile (§F3); then H1
    expect((await reconcile(w.owner, H3)).handoff).toMatchObject({ state: 'reconciled', from: 'effected' });
    expect(await compState(c1['compensation_id'])).toBe('in_progress');
    expect((await reconcile(w.owner, H2)).handoff).toMatchObject({ state: 'reconciled', from: 'partially_effected' });
    expect(await compState(c1['compensation_id'])).toBe('done');
    const done = (await sql<Row>`select details from decision.commitment_events where item_id = ${ITEM}::uuid and event = 'compensation.done' order by occurred_at`.execute(su)).rows.map((r) => r['details'] as Row);
    expect(done).toEqual([expect.objectContaining({ compensation_id: c2['compensation_id'], handoff_id: H3 }), expect.objectContaining({ compensation_id: c1['compensation_id'], handoff_id: H2, by: 'reconcile' })]);
    expect((await reconcile(w.owner, H1)).handoff).toMatchObject({ state: 'reconciled', from: 'partially_effected' });
    expect((await exceptionsOf(ITEM)).map((e) => e['state'])).toEqual(['resolved', 'resolved']);
    expect((await itemRow(ITEM))['state']).toBe('in_progress');
    evidence('C1', { handoffs: [H1, H2, H3], compensations: [c1['compensation_id'], c2['compensation_id']], effects: { [H1]: await effects(H1), [H2]: await effects(H2), [H3]: await effects(H3) } });
  }, 240_000);
});
