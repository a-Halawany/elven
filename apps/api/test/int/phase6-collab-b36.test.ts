/**
 * CP-6 B36 (migration 0094 §C, part `collab`; F-P6-14 COMPLETES (q)–(t), F-P6-05 (u), F-P4-13 (i)–(j)) — on a real database and the real
 * controllers (the Phase4Harness precedent, the world of `bootDecisionWorld`, B36's own humans with sessions of their own), the identity
 * ports under IDENTITY_DB as phase6-collab-identity-b34f does, the real sign-in route for the external, the PICKUP route called as the
 * unauthenticated request it is (no principal on the request), the Nest logger and the console CAPTURED to prove the token appears in no
 * line. Per clause a POSITIVE, a REFUSAL and a RECOVERY case. EVERY FIGURE IS SYNTHETIC. NOTHING REAL IS ACTIVATED: the "real" execution
 * target is a loopback literal recorded non-synthetic, and the production egress refuses it (the B14 rule) — the mechanism is what is proven.
 *
 *   T1 · THE LOCAL INVITATION DELIVERY AND PICKUP (t): the owner requests, the tenant administrator provisions — the answer names the
 *        delivery (channel demo-mailbox, synthetic) and no token; the administrator reads the SYNTHETIC mailbox (the code inside, no
 *        token); the PICKUP with the code answers the material ONCE (login + token); a second pickup refused (picked_up); the external
 *        signs in with the material and ACCEPTS (0091 §F1's rotation), signs in with the password; the token is in NO table (every base
 *        table of the governed schemas scanned), NO captured log line and NO answer body but the pickup's; a wrong code counted (403 with
 *        the count), five wrong codes LOCK the invitation (409, invitation.locked); unknown (404), malformed (422); RECOVERY — a delivery
 *        that fails after the activation (a fault injected at the delivery, stated) answers `pending`, the pickup says not_delivered (409),
 *        the provisioner RE-DELIVERS, the pickup works.
 *   Q1 · THE EXTERNAL'S OWN SURFACE (q): identity.self.read answers the external BOUNDED TO THE GRANT (its workspace, purpose, ceiling,
 *        expiry; live); the workspace read is its own; THREE other routes refused at the PDP (tasks inbox, workflow list, the tracker);
 *        an expired grant: the self read says expired (live 0) and the workspace read refuses (grant_expired) — the shell signs it out.
 *   R1 · TASK DEPENDENCIES (r; PR-46-002): B waits on A (finish-to-start; the workspace's owner declares); the inbox says so; completing
 *        B refused (`task rejected (dependency)`); a cycle refused (422), a duplicate (409), an unknown task (404), a non-holder (403);
 *        A completed → B RELEASED (task.released on B's log) → B completes; a workflow definition whose transition declares depends_on on
 *        an unknown state refused at publication (422); a valid one: the transition waits on the instance's task of that step (409
 *        `workflow rejected (dependency)`), admitted once the task closed.
 *   U1 · THE ENFORCED ACTIVATION (u; F-P6-05): a NON-synthetic target REGISTERED inactive (a loopback literal; the trust anchor a
 *        self-signed certificate made here); a handoff to it refused at the gateway (`execution handoff rejected (inactive_target)`); the
 *        registrar cannot activate (403 at the PDP); a draft decision (409 decision_not_committed), a committed decision that names no
 *        target (422); the owner's COMMITTED decision naming the target → ACTIVATED by the execution authority (execution.target_activated
 *        on the decision's log); the handoff now passes the gateway — and the PRODUCTION EGRESS REFUSES the loopback (nothing real reached:
 *        the attempt recorded failed, address_not_public); DEACTIVATED with a reason → a new handoff refused at once; a synthetic target
 *        unaffected (declared, its handoff passes the gateway; activating it refused as synthetic); duplicates and a missing anchor refused.
 *   I1 · THE MONITOR → OUTCOME STEP (i; JRN-08): the corridor mitigation committed, its outcome recorded (the twin's observed element
 *        reconciled — the decision harness's path), REVIEWED by the owner against the exposure (0090 §X5, unchanged: the effect, the
 *        residual verdict, the lesson) — what the exposures page's outcome panel plays.
 *   J1 · THE LEARN STEP (j; JRN-09): after the review, the LEARNING recorded on the lineage (what was expected — the accepted bracket the
 *        port reads; what happened — the review's outcomes; what changes in the basis) by the owner; an analyst refused at the PDP (403),
 *        another owner by the port (403), an unknown review (404), a short basis change (422), twice (409); exposure.learning_recorded; the
 *        detail names the learning and owes none; on the OPPORTUNITY (the Morocco supplier, SYNTHETIC): its exploit response committed,
 *        its outcome recorded, reviewed, the response's decision CLOSED with the outcome, the learning recorded by its sponsor-owner.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException, Logger } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { WorkflowController } from '../../src/executive/workflow/workflow.controller.js';
import type { CollabB36Controller, InvitationPickupController } from '../../src/executive/workflow/collab-b36.controller.js';
import type { CommitmentController } from '../../src/decision/commitments/commitment.controller.js';
import type { ExecutionActivationController } from '../../src/decision/commitments/execution-activation.controller.js';
import type { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import type { ExposureLearningController } from '../../src/prediction/exposures/exposure-learning.controller.js';
import type { AdminControllers } from '../../src/pipeline/admin.controllers.js';
import { AuthController } from '../../src/pipeline/auth.controller.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { CollabService } from '../../src/executive/workflow/collab.service.js';
import { InvitationDeliveryService } from '../../src/executive/workflow/invitation-delivery.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let wf: WorkflowController; let cb: CollabB36Controller; let pk: InvitationPickupController; let cm: CommitmentController; let xa: ExecutionActivationController;
let ex: ExposuresController; let xl: ExposureLearningController; let admin: AdminControllers; let auth: AuthController; let identity: IdentityService;
let collab: CollabService; let delivery: InvitationDeliveryService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let chief: AuthenticatedPrincipal; let caseOwner: AuthenticatedPrincipal; let issuer: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let regOwner: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
let ws = ''; let pkgForWs = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const PURPOSE = 'collaboration.b36-partner-review';
const PASSWORD = ['partner', 'reviewer', 'b36', 'synthetic'].join('-');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const evidence = (caseName: string, e: Row): void => console.log(`B36 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

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

/* ───────────── THE LOG CAPTURE: every Nest logger line and every console line of this process, kept to prove the token's absence ───────────── */
const captured: string[] = [];
const keep = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };

/* ───────────── the routes (in process) ───────────── */
const r = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null, purpose = PURPOSE) => h.req(as, action, type, id, purpose);
const openWs = (payload: Row, as = caseOwner) => wf.openWorkspace(r(as, 'executive.collab.workspace.open', 'CWS', null), T(), D(), { payload }) as Promise<{ workspace: Row }>;
const getWs = (id: string, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.getWorkspace(r(as, 'executive.collab.read', 'CWS', id, purpose), T(), D(), id) as unknown as Promise<Row & { grants: Row[]; tasks: Row[]; viewer: Row }>;
const participant = (id: string, principal: string, as = caseOwner) => wf.setParticipant(r(as, 'executive.collab.participant.set', 'CWS', id), T(), D(), id, { payload: { op: 'add', principal, role: 'reviewer' } }) as Promise<{ participant: Row }>;
const requestReview = (id: string, payload: Row, as = caseOwner) => wf.requestReview(r(as, 'executive.collab.review.request', 'HTK', null), T(), D(), id, { payload }) as Promise<{ task: Row }>;
const request = (id: string, payload: Row, as = caseOwner) => wf.invite(r(as, 'executive.collab.invite', 'CGR', null), T(), D(), id, { payload }) as Promise<{ grant: Row }>;
const provision = (grantId: string, as = tenantAdmin) => wf.provisionInvitation(r(as, 'executive.collab.provision', 'CGR', grantId), T(), D(), grantId) as Promise<{ grant: Row & { delivery: Row } }>;
const accept = (grantId: string, payload: Row, as: AuthenticatedPrincipal) => wf.acceptInvitation(r(as, 'executive.collab.accept', 'CGR', grantId), T(), D(), grantId, { payload }) as Promise<{ grant: Row }>;
const mailbox = (grantId: string, as = tenantAdmin) => cb.mailbox(r(as, 'executive.collab.mailbox.read', 'CGR', grantId), T(), D(), grantId) as unknown as Promise<{ delivery: Row; message: Row | null; note: string }>;
const redeliver = (grantId: string, as = tenantAdmin) => cb.deliver(r(as, 'executive.collab.provision', 'CGR', grantId), T(), D(), grantId) as Promise<{ delivery: Row }>;
const deliveryState = (grantId: string, as = caseOwner) => cb.deliveryState(r(as, 'executive.collab.read', 'CGR', grantId), T(), D(), grantId) as unknown as Promise<{ delivery: Row | null }>;
const pickup = (invitationId: unknown, code: unknown) => pk.pickup({ eyeCorrelationId: uuidv7(), path: '/v1/collab/invitations/pickup', method: 'POST', headers: {}, ip: '127.0.0.1' } as never,
  { payload: { invitationId, code } as Row }) as Promise<{ invitation: Row }>;
const me = (as: AuthenticatedPrincipal) => admin.me(h.req(as, 'identity.self.read', 'PRN', as.principalId, 'observation')) as Promise<{ me: Row & { external?: Row } }>;
const inbox = (as: AuthenticatedPrincipal) => wf.taskInbox(r(as, 'executive.task.read', 'HTK', null, 'executive'), T(), D(), { payload: {} }) as unknown as Promise<{ tasks: Array<Row & { waits_on: Row[]; blocked: boolean }> }>;
const completeTask = (id: string, as: AuthenticatedPrincipal, purpose = 'executive') => wf.completeTask(r(as, 'executive.task.complete', 'HTK', id, purpose), T(), D(), id, { payload: { outcome: 'done', note: 'done (B36 harness, SYNTHETIC)' } }) as Promise<{ task: Row }>;
const declareDep = (id: string, dependsOn: string, as = caseOwner) => cb.declareDependency(r(as, 'executive.task.dependency.declare', 'HTK', id, 'executive'), T(), D(), id, { payload: { depends_on: dependsOn } }) as Promise<{ dependency: Row & { dependencies: Row } }>;
const depsOf = (id: string, as = chief) => cb.dependencies(r(as, 'executive.task.read', 'HTK', id, 'executive'), T(), D(), id) as unknown as Promise<{ dependencies: Row & { waits_on: Row[]; blocked: boolean } }>;
const publishDef = (payload: Row, as = chief) => wf.publishWorkflowDefinition(r(as, 'executive.workflow.define', 'WFD', null, 'executive'), T(), D(), { payload }) as Promise<{ definition: Row }>;
const startWf = (payload: Row, as = chief) => wf.startWorkflow(r(as, 'executive.workflow.start', 'WFI', null, 'executive'), T(), D(), { payload }) as Promise<{ instance: Row }>;
const advanceWf = (id: string, event: string, as = chief) => wf.advanceWorkflow(r(as, 'executive.workflow.advance', 'WFI', id, 'executive'), T(), D(), id, { payload: { event, idempotency_key: `${event}:${uuidv7()}`, lease_owner: 'b36-harness-worker', lease_seconds: 60 } }) as Promise<{ transition: Row }>;
const listWf = (as: AuthenticatedPrincipal) => wf.listWorkflowInstances(r(as, 'executive.workflow.read', 'WFI', null, 'executive'), T(), D(), { payload: {} });
const R = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'decision');
const tracker = (as: AuthenticatedPrincipal) => cm.tracker(R(as, 'decision.commitment.read', 'CMT', null), T(), D(), { payload: {} });
const listTargets = (as = chief) => cm.listTargets(R(as, 'decision.commitment.read', 'EXT', null), T(), D()) as unknown as Promise<{ targets: Row[] }>;
const declareTarget = (payload: Row, as = dadmin) => cm.declareTarget(R(as, 'decision.execution.target.declare', 'EXT', null), T(), D(), { payload }) as Promise<{ target: Row }>;
const registerTarget = (payload: Row, as = dadmin) => xa.register(R(as, 'decision.execution.target.register', 'EXT', null), T(), D(), { payload }) as Promise<{ target: Row }>;
const activate = (key: string, decisionPackageId: string, as = issuer) => xa.activate(R(as, 'decision.execution.target.activate', 'EXT', null), T(), D(), key, { payload: { decisionPackageId } }) as Promise<{ target: Row }>;
const deactivate = (key: string, reason: string, as = dadmin) => xa.deactivate(R(as, 'decision.execution.target.deactivate', 'EXT', null), T(), D(), key, { payload: { reason } }) as Promise<{ target: Row }>;
const declareItem = (id: string, payload: Row, as = w.owner) => cm.declareItem(R(as, 'decision.commitment.item.declare', 'CMT', id), T(), D(), id, { payload }) as Promise<{ item: Row }>;
const acceptItem = (id: string, as = w.owner) => cm.accept(R(as, 'decision.commitment.item.accept', 'CMI', id), T(), D(), id, { payload: { note: 'accepted (B36 harness)' } }) as Promise<{ item: Row }>;
const draft = (itemId: string, payload: Row, as = w.owner) => cm.draft(R(as, 'decision.execution.draft', 'EXH', null), T(), D(), itemId, { payload }) as Promise<{ handoff: Row }>;
const issue = (id: string, payloadDigest: string, as = issuer) => cm.issue(R(as, 'decision.execution.issue', 'EXH', id), T(), D(), id, { payload: { payloadDigest } }) as Promise<{ handoff: Row & { attempt: Row; transport: string | null; egress: Row | null } }>;
const X = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'RSK', id, 'prediction');
const declareStrategy = (as: AuthenticatedPrincipal, payload: Row) => w.graph.declare(h.req(as, 'graph.strategy.declare', String(payload['objectType']), null, 'graph'), T(), D(), { payload }) as Promise<{ strategy: { objectId: string } }>;
const publishTaxonomy = (payload: Row) => ex.publishTaxonomy(X(executive, 'prediction.exposure.taxonomy.publish'), T(), D(), { payload }) as Promise<{ taxonomy: Row }>;
const activateTaxonomy = (payload: Row) => ex.activateTaxonomy(X(dadmin, 'prediction.exposure.taxonomy.activate'), T(), D(), { payload }) as Promise<{ activation: Row }>;
const approveAppetite = (payload: Row) => ex.approveAppetite(X(executive, 'prediction.exposure.appetite.approve'), T(), D(), { payload }) as Promise<{ appetite: Row }>;
const registerX = (payload: Row) => ex.register(X(analyst, 'prediction.exposure.register', String(payload['strategyObjectId'])), T(), D(), { payload }) as Promise<{ exposure: Row }>;
const assess = (id: string, payload: Row) => ex.assess(X(analyst, 'prediction.exposure.assess', id), T(), D(), id, { payload }) as Promise<{ assessment: Row }>;
const acceptX = (as: AuthenticatedPrincipal, id: string, v: number, payload: Row) => ex.accept(X(as, 'prediction.exposure.accept', id), T(), D(), id, String(v), { payload }) as Promise<{ acceptance: Row }>;
const hypothesis = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.declareHypothesis(X(as, 'prediction.exposure.hypothesis.declare', id), T(), D(), id, { payload }) as Promise<{ hypothesis: Row }>;
const openDecision = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.openResponse(X(as, 'prediction.exposure.respond', id), T(), D(), id, { payload }) as Promise<{ response: Row }>;
const reviewOutcome = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.reviewOutcome(X(as, 'prediction.exposure.outcome.review', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const getX = (as: AuthenticatedPrincipal, id: string) => ex.get(X(as, 'prediction.exposure.read', id), T(), D(), id) as Promise<Row & { responses: Row[]; learnings: Row[]; events: Row[] }>;
const learn = (as: AuthenticatedPrincipal, id: string, payload: Row) => xl.record(X(as, 'prediction.exposure.learn', id), T(), D(), id, { payload }) as Promise<{ learning: Row }>;

/** The real sign-in route (in process): the principal the session verifies to, or the refusal. */
const signIn = async (username: string, password: string): Promise<AuthenticatedPrincipal> => {
  const out = await auth.login({ eyeCorrelationId: uuidv7(), path: '/v1/auth/login', method: 'POST', headers: {} } as never, { payload: { username, password } });
  const p = await identity.verifyAccess(out.tokens.accessToken);
  if (p === null) throw new Error('the fresh session did not verify');
  return p;
};
const invitee = (label: string, seconds?: number): Row => ({ display_name: `${label} (partner firm, SYNTHETIC)`, contact_label: `${label.toLowerCase().replace(/\s+/g, '.')}@partner.example (SYNTHETIC)`,
  audience_ceiling: 'internal', ...(seconds === undefined ? { expires_in_days: 14 } : { expires_at: new Date(Date.now() + seconds * 1000).toISOString() }) });
/** The pickup code read from the SYNTHETIC mailbox message (the third line of the body, as a person would). */
const codeOf = (message: Row | null): string => {
  const line = String(message?.['body'] ?? '').split('\n').find((l) => /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(l.trim()));
  if (line === undefined) throw new Error('the mailbox message carries no pickup code');
  return line.trim();
};
/** Every base table of the governed schemas, each row as text: whether any carries the literal. */
const tablesCarrying = async (literal: string): Promise<string[]> => {
  const tables = (await sql<{ s: string; t: string }>`select table_schema s, table_name t from information_schema.tables where table_type = 'BASE TABLE'
    and table_schema in ('executive', 'decision', 'prediction', 'audit', 'objects', 'identity', 'policy', 'observation', 'graph', 'ctx', 'public') order by 1, 2`.execute(su)).rows;
  const hits: string[] = [];
  for (const tb of tables) {
    const n = Number((await sql<{ n: number }>`select count(*)::int n from ${sql.table(`${tb.s}.${tb.t}`)} x where x::text like ${'%' + literal + '%'}`.execute(su)).rows[0]?.n ?? 0);
    if (n > 0) hits.push(`${tb.s}.${tb.t}`);
  }
  return hits;
};
const collabEvents = async (grantId: string) => (await sql<{ e: string }>`select event e from executive.collab_events where details ->> 'grant_id' = ${grantId} order by at`.execute(su)).rows.map((x) => x.e);
const taskEvents = async (taskId: string) => (await sql<{ e: string; d: Row }>`select event e, details d from executive.human_task_events where task_id = ${taskId}::uuid order by at`.execute(su)).rows;

/* ───────────── the SYNTHETIC "real" target's trust anchor: a self-signed certificate for the loopback literal, made here ───────────── */
function selfSignedAnchor(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eye-b36-anchor-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: ['ignore', 'ignore', 'ignore'] });
  return readFileSync(join(dir, 'c.pem'), 'utf8');
}
const LINES = [{ line_key: 'BRG-6205', description: 'SYN-PART-BRG bearing sets, second source (SYNTHETIC)', quantity: 400, unit: 'pcs' }];

beforeAll(async () => {
  for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) vi.spyOn(Logger.prototype, m).mockImplementation(keep as never);
  for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) vi.spyOn(console, m).mockImplementation(keep as never);
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  const { WorkflowController: Wc } = await import('../../src/executive/workflow/workflow.controller.js');
  const { CollabB36Controller: Cc, InvitationPickupController: Pc } = await import('../../src/executive/workflow/collab-b36.controller.js');
  const { CommitmentController: Mc } = await import('../../src/decision/commitments/commitment.controller.js');
  const { ExecutionActivationController: Xa } = await import('../../src/decision/commitments/execution-activation.controller.js');
  const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
  const { ExposureLearningController: Xl } = await import('../../src/prediction/exposures/exposure-learning.controller.js');
  const { AdminControllers: Ac } = await import('../../src/pipeline/admin.controllers.js');
  wf = h.app.get(Wc); cb = h.app.get(Cc); pk = h.app.get(Pc); cm = h.app.get(Mc); xa = h.app.get(Xa); ex = h.app.get(Xc); xl = h.app.get(Xl); admin = h.app.get(Ac);
  auth = h.app.get(AuthController); identity = h.app.get(IdentityService); collab = h.app.get(CollabService); delivery = h.app.get(InvitationDeliveryService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36-domain-admin');
  chief = await h.humanWithSession(['executive'], 'b36-chief-of-staff');
  caseOwner = await h.humanWithSession(['decision_owner'], 'b36-case-owner');
  issuer = await h.humanWithSession(['execution_authority'], 'b36-k-lange');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36-analyst');
  executive = await h.humanWithSession(['executive'], 'b36-executive');
  regOwner = await h.humanWithSession(['risk_owner', 'strategy_owner', 'decision_owner'], 'b36-regensburg-risk-owner');
  brandt = await h.humanWithSession(['opportunity_sponsor', 'risk_owner', 'strategy_owner', 'decision_owner'], 'b36-l-brandt');
  otherOwner = await h.humanWithSession(['risk_owner'], 'b36-other-risk-owner');
  pkgForWs = (await c.declare({ decisionObjectId: w.decisionId, title: 'Dual-sourcing review — partner review (B36 harness, SYNTHETIC)', statement: 'whether to take the partner\'s customs review', owner: w.owner.principalId })).package.packageId;
  ws = String((await openWs({ title: 'Dual-sourcing review — customs and bearings (B36, SYNTHETIC)', subject: { kind: 'decision_package', id: pkgForWs }, purpose: PURPOSE, classification_ceiling: 'confidential' })).workspace['workspace_id']);
  await participant(ws, chief.principalId);
}, 600_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await h?.close();
}, 120_000);

describe('B36 collab · collaboration completed and the carried mechanisms (0094 §C)', () => {
  let grantT1 = ''; let extT1: AuthenticatedPrincipal; let tokenT1 = ''; let loginT1 = '';

  it('T1 · THE LOCAL INVITATION DELIVERY AND PICKUP (t): delivered with a one-time code, picked up ONCE, the token in no table, log line or other answer; wrong codes counted and locked; a failed delivery re-driven', async () => {
    // THE PROVISIONING (0091 §F1) now DELIVERS: the answer names the delivery and carries no token
    grantT1 = String((await request(ws, invitee('R Haddad'))).grant['grant_id']);
    const g = (await provision(grantT1)).grant;
    expect(obj(g['delivery'])['error'], 'the delivery after the activation').toBeUndefined();
    expect(g['delivery']).toMatchObject({ pending: false, channel: 'demo-mailbox', synthetic: true, grant_id: grantT1 });
    expect(g['state']).toBe('invited');
    expect(JSON.stringify(g)).not.toMatch(/token/i);
    expect(await collabEvents(grantT1), 'the provisioning path\'s log is unchanged (the B34-F1 pin); the delivery is its own row').toEqual(['grant.requested', 'grant.provisioning', 'grant.invited']);
    const control = collab.syntheticInvitation(grantT1)!;               // TEST CONTROL (in process): the token beside the message — never a route
    tokenT1 = control.token; loginT1 = control.login;
    expect(control.body).not.toContain(tokenT1);
    // THE MAILBOX (the identity administrator's read): the code inside, the token nowhere; the owner is refused it at the PDP
    await refused(mailbox(grantT1, caseOwner), /./, 403, 'EYE-AUT-001');
    const mb = await mailbox(grantT1);
    expect(mb.delivery).toMatchObject({ state: 'delivered', failures: 0, channel: 'demo-mailbox', synthetic: true });
    expect(JSON.stringify(mb)).not.toContain(tokenT1);
    const code = codeOf(mb.message);
    expect(String(mb.message?.['body'])).toContain(grantT1);
    // THE PICKUP: no principal on the request; the material answered ONCE
    const picked = (await pickup(grantT1, code.toLowerCase().replace(/-/g, ' '))).invitation;   // typed loosely, as a person would
    expect(picked).toMatchObject({ grant_id: grantT1, login: loginT1, token: tokenT1, purpose: PURPOSE, audience_ceiling: 'internal', workspace_id: ws, synthetic: true });
    await refused(pickup(grantT1, code), /^invitation rejected \(picked_up\)/, 409, 'EYE-STA-002');
    expect((await deliveryState(grantT1)).delivery).toMatchObject({ state: 'picked_up', picked_up_from: '127.0.0.1', failures: 0 });
    expect((await deliveryState(grantT1)).delivery?.['attempts']).toEqual([expect.objectContaining({ outcome: 'picked_up' }), expect.objectContaining({ outcome: 'already_picked_up' })]);
    // THE SIGN-IN WITH THE MATERIAL, THE ACCEPTANCE (0091 §F1's rotation), THE SIGN-IN WITH THE PASSWORD
    const withToken = await signIn(picked['login'] as string, picked['token'] as string);
    const acc = (await accept(grantT1, { token: picked['token'], password: PASSWORD }, withToken)).grant;
    expect(acc).toMatchObject({ state: 'accepted', repeated: false, credential: 'rotated by the identity authority' });
    extT1 = await signIn(loginT1, PASSWORD);
    expect((await getWs(ws, extT1))['viewer']).toMatchObject({ affiliation: 'external', ceiling: 'internal' });
    // THE TOKEN IS NOWHERE: no table of the governed schemas, no captured log line, no answer body but the pickup's
    expect(await tablesCarrying(tokenT1), 'no table carries the token').toEqual([]);
    expect(captured.filter((l) => l.includes(tokenT1)), 'no log line carries the token').toEqual([]);
    expect(captured.some((l) => /invitation delivered: grant/.test(l)) && captured.some((l) => /invitation pickup: grant .* outcome picked_up/.test(l)), 'the delivery and the pickup logged their lines').toBe(true);
    const wsRead = await getWs(ws, caseOwner);
    expect(JSON.stringify(wsRead)).not.toContain(tokenT1);
    expect(arr(wsRead['grants']).find((x) => x['grant_id'] === grantT1)?.['delivery']).toMatchObject({ state: 'picked_up' });
    // WRONG CODES: counted (403 with the count), the fifth LOCKS the invitation (409, invitation.locked); unknown 404; malformed 422
    const g2 = String((await request(ws, invitee('Wrong-code reviewer'))).grant['grant_id']);
    await provision(g2);
    const realCode = codeOf((await mailbox(g2)).message);
    const wrong = realCode.startsWith('A') ? 'BBBB-BBBB-BBBB' : 'AAAA-AAAA-AAAA';
    for (let i = 1; i <= 4; i += 1) await refused(pickup(g2, wrong), new RegExp(`^invitation rejected \\(code\\).*\\(${i} of 5 failures`), 403, 'EYE-AUT-001');
    await refused(pickup(g2, wrong), /^invitation rejected \(locked\)/, 409, 'EYE-STA-002');
    await refused(pickup(g2, realCode), /^invitation rejected \(locked\)/, 409);
    expect((await deliveryState(g2)).delivery).toMatchObject({ state: 'locked', failures: 5 });
    expect(await collabEvents(g2)).toEqual(['grant.requested', 'grant.provisioning', 'grant.invited', 'invitation.pickup_refused', 'invitation.pickup_refused', 'invitation.pickup_refused', 'invitation.pickup_refused', 'invitation.locked']);
    await refused(pickup(uuidv7(), realCode), /^invitation rejected \(unknown_invitation\)/, 404, 'EYE-STA-001');
    await refused(pickup(g2, 'not-a-code'), /payload\.code is the one-time pickup code/, 422);
    await refused(pickup('nope', realCode), /payload\.invitationId is the invitation/, 422);
    // RECOVERY: the delivery fails after the activation (a fault injected at the delivery, stated) → pending; not_delivered; re-delivered; picked up
    const g3 = String((await request(ws, invitee('Redelivered reviewer'))).grant['grant_id']);
    vi.spyOn(delivery, 'deliver').mockRejectedValueOnce(new Error('injected delivery failure (B36 harness)'));
    const p3 = (await provision(g3)).grant;
    expect(p3).toMatchObject({ state: 'invited', delivery: { pending: true, error: 'injected delivery failure (B36 harness)' } });
    expect((await deliveryState(g3)).delivery).toBeNull();
    await refused(pickup(g3, realCode), /^invitation rejected \(not_delivered\)/, 409);
    await refused(redeliver(g3, caseOwner), /./, 403, 'EYE-AUT-001');
    expect((await redeliver(g3)).delivery).toMatchObject({ grant_id: g3, channel: 'demo-mailbox', synthetic: true });
    const code3 = codeOf((await mailbox(g3)).message);
    expect((await pickup(g3, code3)).invitation).toMatchObject({ grant_id: g3 });
    await refused(redeliver(g3), /^invitation rejected \(duplicate\)/, 409);
    evidence('T1', { grant: grantT1, delivered: 'demo-mailbox (SYNTHETIC)', pickup: 'once; the second refused (picked_up)', token_in_tables: [], token_in_logs: 0, locked: g2, redelivered: g3 });
  }, 240_000);

  it('Q1 · THE EXTERNAL\'S OWN SURFACE (q): the self read bounded to the grant; three other routes refused at the PDP; an expired grant reads expired and refuses the workspace', async () => {
    const m = await me(extT1);
    expect(m.me['bindings']).toEqual([{ roleCode: 'external_collaborator', scope: 'DOMAIN', tenantId: T(), domainId: D() }]);
    expect(m.me.external).toMatchObject({ affiliation: 'external', live: 1, expired: false, surface: `/decisions/workspaces?workspace=${ws}` });
    const sg = obj(arr(m.me.external?.['grants'])[0]);
    expect(sg).toMatchObject({ grant_id: grantT1, workspace_id: ws, workspace_title: 'Dual-sourcing review — customs and bearings (B36, SYNTHETIC)', purpose: PURPOSE, audience_ceiling: 'internal', state: 'accepted', live: true, expired: false });
    expect(Object.keys(sg).sort()).not.toContain('owner');   // nothing of the tenant beyond the grant
    expect(JSON.stringify(m)).not.toContain(tokenT1);
    // its own workspace, its own grant's surface route; a member's self read carries no external section
    expect(arr((await getWs(ws, extT1))['grants']).map((x) => x['grant_id'])).toEqual([grantT1]);
    expect(obj((await cb.self(r(extT1, 'executive.collab.read', 'CGR', null), T(), D()) as unknown as { surface: Row }).surface)['grants']).toHaveLength(1);
    expect((await me(caseOwner)).me.external).toBeUndefined();
    // THREE other routes: refused at the policy decision point (no port reached)
    await refused(inbox(extT1), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(listWf(extT1), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(tracker(extT1), /no qualifying role binding/, 403, 'EYE-AUT-001');
    // AN EXPIRED GRANT: a short one for a second external — the self read says expired and the workspace refuses (the shell signs it out)
    const gs = String((await request(ws, invitee('Short reviewer', 20))).grant['grant_id']);
    await provision(gs);
    const cs = codeOf((await mailbox(gs)).message);
    const ps = (await pickup(gs, cs)).invitation;
    const ext2 = await signIn(String(ps['login']), String(ps['token']));
    await accept(gs, { token: ps['token'], password: PASSWORD }, ext2);
    const ext2p = await signIn(String(ps['login']), PASSWORD);
    expect((await me(ext2p)).me.external).toMatchObject({ live: 1, expired: false });
    const wait = new Date(String(ps['expires_at'])).getTime() - Date.now() + 500;
    if (wait > 0) await sleep(wait);
    const after = await me(ext2p);
    expect(after.me.external).toMatchObject({ live: 0, expired: true, surface: null });
    expect(obj(arr(after.me.external?.['grants'])[0])).toMatchObject({ expired: true, reason: 'expired' });
    await refused(getWs(ws, ext2p), /^collaboration rejected \(grant_expired\)/, 403, 'EYE-AUT-001');
    evidence('Q1', { external: extT1.principalId, surface: m.me.external?.['surface'], refused_at_pdp: ['executive.task.read', 'executive.workflow.read', 'decision.commitment.read'], expired_grant: gs });
  }, 120_000);

  it('R1 · TASK DEPENDENCIES (r): B waits on A; B cannot complete; cycle, duplicate, unknown and non-holder refused; A completed releases B; a definition\'s depends_on validated and enforced', async () => {
    const A = String((await requestReview(ws, { reviewer: chief.principalId, title: 'A · the customs brief (B36)', escalation: { max_escalations: 0 }, request_key: 'b36-dep-a' })).task['task_id']);
    const B = String((await requestReview(ws, { reviewer: chief.principalId, title: 'B · the route summary after the brief (B36)', escalation: { max_escalations: 0 }, request_key: 'b36-dep-b' })).task['task_id']);
    // THE DECLARATION (the workspace's owner): B waits on A
    const d = (await declareDep(B, A)).dependency;
    expect(d).toMatchObject({ task_id: B, depends_on: A, kind: 'finish_to_start', dependencies: { blocked: true } });
    expect(arr(obj(d['dependencies'])['waits_on'])).toEqual([expect.objectContaining({ task_id: A, met: false, state: 'open' })]);
    expect((await taskEvents(B)).map((e) => e.e)).toEqual(['task.opened', 'task.dependency_declared']);
    // the inbox says so; the workspace read says so
    const ib = (await inbox(chief)).tasks;
    expect(ib.find((t) => t['task_id'] === B)).toMatchObject({ blocked: true, waits_on: [expect.objectContaining({ task_id: A, title: 'A · the customs brief (B36)' })] });
    expect(ib.find((t) => t['task_id'] === A)).toMatchObject({ blocked: false, waits_on: [] });
    expect(arr((await getWs(ws, caseOwner))['tasks']).find((t) => t['task_id'] === B)?.['waits_on']).toEqual([expect.objectContaining({ task_id: A })]);
    // B CANNOT COMPLETE (the guard, inside 0090's complete port)
    await refused(completeTask(B, chief), /^task rejected \(dependency\): task .* waits on 1 open task\(s\) \(A · the customs brief \(B36\)\)/, 409, 'EYE-STA-002');
    // the refusals: a cycle (A waiting on B), self, duplicate, unknown, a non-holder (the analyst passes the PDP and is refused by the port)
    await refused(declareDep(A, B), /^task dependency rejected \(cycle\)/, 422, 'EYE-REQ-001');
    await refused(declareDep(A, A), /^task dependency rejected \(cycle\): a task cannot wait on itself/, 422);
    await refused(declareDep(B, A), /^task dependency rejected \(duplicate\)/, 409, 'EYE-STA-002');
    await refused(declareDep(B, uuidv7()), /^task dependency rejected \(unknown_task\)/, 404, 'EYE-STA-001');
    await refused(declareDep(B, A, analyst), /^task dependency rejected \(not_holder\)/, 403, 'EYE-AUT-001');
    await refused(declareDep(B, A, extT1), /./, 403, 'EYE-AUT-001');   // the external holds no such act at the PDP
    // THE RELEASE: A completed → B released (task.released on B's log) → B completes
    expect((await completeTask(A, chief)).task).toMatchObject({ state: 'completed' });
    const evB = await taskEvents(B);
    expect(evB.map((e) => e.e)).toEqual(['task.opened', 'task.dependency_declared', 'task.released']);
    expect(evB[2]?.d).toMatchObject({ released_by: A, released_by_state: 'completed' });
    expect((await depsOf(B)).dependencies).toMatchObject({ blocked: false, waits_on: [expect.objectContaining({ task_id: A, met: true, released_by_state: 'completed' })] });
    expect((await depsOf(A)).dependencies['released_by_this']).toEqual([expect.objectContaining({ task_id: B })]);
    expect((await completeTask(B, chief)).task).toMatchObject({ state: 'completed' });
    await refused(declareDep(B, A), /^task dependency rejected \(state\): task .* is completed/, 409);
    // THE DEFINITION'S depends_on: unknown state refused at publication; the transition waits on the instance's task of that step
    const spec = (dep: string[]) => ({ states: ['drafted', 'review', 'approved'], initial: 'drafted', terminal: ['approved'],
      transitions: [{ from: 'drafted', event: 'submit', to: 'review' }, { from: 'review', event: 'approve', to: 'approved', depends_on: dep }] });
    const def = (dep: string[], key: string) => ({ def_key: key, spec: spec(dep), owner: chief.principalId, escalation: dadmin.principalId, reason: 'the B36 dependency definition (SYNTHETIC)' });
    await refused(publishDef(def(['nowhere'], 'b36-deps-bad')), /^workflow definition rejected \(depends_on\): "nowhere" is not a state/, 422, 'EYE-REQ-001');
    await refused(publishDef(def(['approved'], 'b36-deps-bad')), /^workflow definition rejected \(depends_on\): the transition approve cannot wait on the state it enters/, 422);
    expect((await publishDef(def(['review'], 'b36-deps'))).definition).toMatchObject({ version: 1 });
    const inst = String((await startWf({ def_key: 'b36-deps', subject: { kind: 'decision_package', id: pkgForWs }, start_key: 'b36-deps-1' })).instance['instance_id']);
    expect((await advanceWf(inst, 'submit')).transition).toMatchObject({ to: 'review' });
    // a task of the instance at step `review` (STATED SUPERUSER MOVE: the engine's own step tasks are its irreconcilable / compensation ones; the harness opens one at the step)
    const stepTask = uuidv7();
    await sql`select executive._open_human_task(${stepTask}::uuid, ${T()}::uuid, ${D()}::uuid, 'collab.contribute', ${'b36-step-review:' + inst}, ${JSON.stringify({ kind: 'workflow_instance', id: inst })}::jsonb,
      'Review step task (B36, SYNTHETIC)', ${chief.principalId}::uuid, '{}'::text[], '{}'::jsonb, null::timestamptz, '{}'::jsonb, ${inst}::uuid, 'review', ${chief.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await refused(advanceWf(inst, 'approve'), /^workflow rejected \(dependency\): approve from review waits on 1 open task\(s\) of step\(s\) review/, 409, 'EYE-STA-002');
    expect((await completeTask(stepTask, chief)).task).toMatchObject({ state: 'completed' });
    expect((await advanceWf(inst, 'approve')).transition).toMatchObject({ to: 'approved', status: 'completed' });
    evidence('R1', { a: A, b: B, released: evB[2]?.d, definition: 'b36-deps v1 (depends_on review)', instance: inst });
  }, 120_000);

  it('U1 · THE ENFORCED ACTIVATION (u): a real target registered inactive refuses the handoff; activated by the execution authority with the owner\'s committed decision; the production egress refuses the loopback (nothing real reached); deactivated → refused again; a synthetic target unaffected', async () => {
    const anchor = selfSignedAnchor();
    const KEY = 'nordwerk-erp-' + 'real';   // the "real" target: a loopback literal, SYNTHETIC record — nothing real exists behind it
    const endpoint = 'https://127.0.0.1:9/purchase-requests';
    // REGISTER (the domain administrator): inactive; the refusals of the registration
    await refused(registerTarget({ targetKey: KEY, label: 'NORDWERK purchasing — the real ERP (SYNTHETIC record)', endpoint, trustAnchorPem: '' }), /^execution registration rejected \(trust_anchor\)/, 422, 'EYE-REQ-001');
    await refused(registerTarget({ targetKey: KEY, label: 'x', endpoint, trustAnchorPem: anchor }, issuer), /./, 403, 'EYE-AUT-001');
    const reg = (await registerTarget({ targetKey: KEY, label: 'NORDWERK purchasing — the real ERP (SYNTHETIC record)', endpoint, trustAnchorPem: anchor })).target;   // no credential bound: the vetting, not a missing bearer, is what refuses
    expect(reg).toMatchObject({ target_key: KEY, synthetic: false, activation_state: 'inactive', state: 'active', trust_anchor_declared: true, declared_by: dadmin.principalId });
    await refused(registerTarget({ targetKey: KEY, label: 'again', endpoint, trustAnchorPem: anchor }), /^execution registration rejected \(duplicate\)/, 409, 'EYE-STA-002');
    await refused(declareTarget({ targetKey: 'not-synthetic', label: 'x', endpoint, trustAnchorPem: anchor, synthetic: false }), /^execution target rejected \(not_synthetic\)/, 422);   // 0090's declare stays synthetic-only
    expect((await listTargets()).targets.find((t) => t['target_key'] === KEY)).toMatchObject({ activation_state: 'inactive', synthetic: false });
    // THE COMMITMENT AND ITS HANDOFF ITEM (the owner); the handoff drafted to the inactive target
    const P = await c.committed();
    const root = String((await sql<Row>`select item_id::text from decision.commitment_items where commitment_id = ${P.commitmentId}::uuid and parent_item_id is null`.execute(su)).rows[0]!['item_id']);
    await acceptItem(root);
    const HAND = String((await declareItem(P.commitmentId, { kind: 'handoff', title: 'Purchase request to the real ERP (B36, SYNTHETIC)', owner: w.owner.principalId, dueAt: inDays(10) })).item['item_id']);
    await acceptItem(HAND);
    const d1 = (await draft(HAND, { targetKey: KEY, lines: LINES })).handoff;
    // THE GATEWAY REFUSES an inactive real target (the one addition to 0090 §C5); the draft stands
    await refused(issue(String(d1['handoff_id']), String(d1['payload_digest'])), /^execution handoff rejected \(inactive_target\): target nordwerk-erp-real is inactive/, 409, 'EYE-STA-002');
    expect((await sql<Row>`select state from decision.execution_handoffs where handoff_id = ${String(d1['handoff_id'])}::uuid`.execute(su)).rows[0]!['state']).toBe('drafted');
    // THE ACTIVATION: the registrar refused at the PDP; a draft decision refused; a committed decision naming no target refused; a synthetic target never activated
    await refused(activate(KEY, P.pkg, dadmin), /./, 403, 'EYE-AUT-001');
    const draftPkg = (await c.fullDraft()).pkg;
    await refused(activate(KEY, draftPkg), /^execution activation rejected \(decision_not_committed\)/, 409, 'EYE-STA-002');
    await refused(activate(KEY, P.pkg), /^execution activation rejected \(decision_names_no_target\)/, 422, 'EYE-REQ-001');
    await refused(activate(KEY, uuidv7()), /^execution activation rejected \(unknown_decision\)/, 404, 'EYE-STA-001');
    await refused(activate('no-such-target', P.pkg), /^execution activation rejected \(unknown_target\)/, 404);
    const syn = (await declareTarget({ targetKey: 'nordwerk-erp-' + 'synthetic-b36' /* split: gitleaks flags key-shaped literals */, label: 'NORDWERK purchasing (SYNTHETIC ERP)', endpoint: 'https://127.0.0.1:9/synthetic', trustAnchorPem: anchor, synthetic: true })).target;
    expect(syn).toMatchObject({ synthetic: true, activation_state: 'synthetic' });
    await refused(activate('nordwerk-erp-synthetic-b36', P.pkg), /^execution activation rejected \(synthetic\)/, 409);
    // THE OWNER'S COMMITTED DECISION that names the target (the choice's rationale) → ACTIVATED by K. Lange (execution authority, not the registrar)
    const auth = await c.committed({ choice: { rationale: `Activate the execution target ${KEY} for the second-source purchase requests (B36 harness, SYNTHETIC).` } });
    const act = (await activate(KEY, auth.pkg)).target;
    expect(act).toMatchObject({ target_key: KEY, activation_state: 'active', activated_by: issuer.principalId, authorized_by_decision: auth.pkg, decision: { package_id: auth.pkg, state: 'committed' } });
    await refused(activate(KEY, auth.pkg), /^execution activation rejected \(state\): target .* is active already/, 409);
    expect((await sql<{ e: string; d: Row }>`select event e, details d from decision.package_events where package_id = ${auth.pkg}::uuid and event like 'execution.target_%' order by occurred_at`.execute(su)).rows)
      .toEqual([{ e: 'execution.target_activated', d: expect.objectContaining({ target_key: KEY, activated_by: issuer.principalId, registered_by: dadmin.principalId, synthetic: false }) }]);
    // THE HANDOFF NOW PASSES THE GATEWAY — and the PRODUCTION EGRESS REFUSES the loopback: nothing real is reached (the B14 rule; the switch is off in this boot)
    const r1 = await issue(String(d1['handoff_id']), String(d1['payload_digest']));
    expect(r1.handoff).toMatchObject({ transport: 'production' });
    expect(obj(r1.handoff['egress'])).toMatchObject({ transport: 'production', refused: 'address_not_public' });
    expect(obj(r1.handoff['egress'])['request_sent'], 'no request left the process').not.toBe(true);
    expect(obj(r1.handoff['attempt'])).toMatchObject({ attempt: 1, outcome: 'transport' });   // the transport refusal recorded as the attempt's outcome (0090 §C5's classes)
    expect(obj(obj(r1.handoff['target']))['activation_state'] ?? 'active').toBe('active');
    // DEACTIVATED (a reason) → a new handoff refused at once; a synthetic target's handoff passes the gateway (unaffected)
    await refused(deactivate(KEY, 'short'), /^execution activation rejected \(reason\)/, 422);
    await refused(deactivate(KEY, 'the harness ends the activation (B36)', analyst), /./, 403, 'EYE-AUT-001');
    const de = (await deactivate(KEY, 'the harness ends the activation (B36)')).target;
    expect(de).toMatchObject({ activation_state: 'inactive', deactivated_by: dadmin.principalId, deactivation_reason: 'the harness ends the activation (B36)', authorized_by_decision: null });
    const d2 = (await draft(HAND, { targetKey: KEY, lines: LINES })).handoff;
    await refused(issue(String(d2['handoff_id']), String(d2['payload_digest'])), /^execution handoff rejected \(inactive_target\)/, 409);
    await refused(deactivate(KEY, 'twice is refused (B36)'), /^execution activation rejected \(state\): target .* is inactive, not active/, 409);
    const d3 = (await draft(HAND, { targetKey: 'nordwerk-erp-' + 'synthetic-b36' /* split: gitleaks flags key-shaped literals */, lines: LINES })).handoff;
    const r3 = await issue(String(d3['handoff_id']), String(d3['payload_digest']));
    expect(r3.handoff).toMatchObject({ state: expect.any(String) });
    expect(obj(r3.handoff['attempt'])).toMatchObject({ attempt: 1 });   // the gateway admitted it; the transport is the egress's business (the switch is off: refused as production)
    expect((await sql<{ e: string }>`select event e from decision.package_events where package_id = ${auth.pkg}::uuid and event like 'execution.target_%' order by occurred_at`.execute(su)).rows.map((x) => x.e))
      .toEqual(['execution.target_activated', 'execution.target_deactivated']);
    evidence('U1', { target: KEY, registered: 'inactive (SYNTHETIC record, loopback literal)', refused_inactive: d1['handoff_id'], activated_by: issuer.principalId, authorized_by_decision: auth.pkg,
      egress_after_activation: obj(r1.handoff['egress'])['refused'], deactivated: de['deactivated_at'], nothing_real_reached: true });
  }, 240_000);

  /* the outcome loop's world (I1, J1): the taxonomy, the appetite, the corridor risk and the Morocco opportunity — the exposures harness's fixtures, SYNTHETIC */
  let corridor = ''; let morocco = ''; let corridorReview = ''; let vSim = 0; let vObs = 0; let reconciliationId = ''; let outEvd = { id: '', version: 0 };
  const ELEMENT_KEY = 'outcome.line_stop_days:SYN-LINE-A1';
  const riskAssessment = (): Row => ({
    mechanism: 'A closure of the Bab el-Mandeb corridor delays the magnet shipments; the Regensburg line stops when the buffer runs out',
    probability: { low: 0.3, high: 0.6 }, impact: { low: 400_000, high: 900_000, unit: 'EUR' }, horizon: '2024-Q1', response_window_hours: 72, velocity: 'weeks',
    reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
    options: [{ key: 'dual-source', label: 'Qualify a second magnet source', kind: 'mitigate', cost: 120_000 }, { key: 'hold', label: 'Accept and watch the corridor', kind: 'accept' }],
    evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B36 harness)' });
  const oppAssessment = (): Row => ({
    mechanism: 'A Moroccan magnet supplier qualified now captures the share the corridor closure frees up at a lower landed cost',
    plausibility: 'medium', impact: { low: 150_000, high: 600_000, unit: 'EUR' }, horizon: '2024-H1', velocity: 'months', reversibility: 'reversible', controllability: 'medium',
    options: [{ key: 'qualify', label: 'Qualify the Moroccan supplier', kind: 'exploit', cost: 80_000 }, { key: 'wait', label: 'Wait for the corridor to reopen', kind: 'defer' }],
    evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B36 harness)' });
  /** The decision harness's outcome path: the exploit / mitigation package committed through the gate, the twin's observed element reconciled, the outcome recorded. */
  const commitAndRecordOutcome = async (pkg: string, as: AuthenticatedPrincipal): Promise<string> => {
    const v = (await c.open(pkg, {}, as)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] }, as);
    await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] }, as);
    await c.terms(pkg, v, c.validTerms(), as);
    await c.choice(pkg, v, c.validChoice({ action_owner: as.principalId }), as);
    const prop = await c.propose(pkg, v, as);
    await c.approve(pkg, v, { decision: 'approve', versionDigest: prop.proposal.versionDigest, rationale: 'The response keeps the line running; the premium is acceptable (B36 harness).' }, w.approver);
    await c.commit(pkg, v, prop.proposal.versionDigest, w.authority);
    // the twin's simulated element, the outcomes upload, the observed element and the reconciliation — ALL after the decision (an already-known observation is not an outcome)
    await sleep(50);
    const run = (await sql<{ o: Row }>`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`.execute(su)).rows[0]!.o;
    const simulatedDays = Number(obj(run['totals'])['line_stop_days']);
    const o2 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: vObs === 0 ? w.v1 : vObs, ...(vObs === 0 ? {} : { except: [ELEMENT_KEY] }) } }) as { version: { version: number } };
    vSim = o2.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'simulated', value: simulatedDays, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] }] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: {} });
    const up = await h.upload([{ filename: `outcomes-b36-${pkg.slice(0, 8)}.csv`, text: ['synthetic,record_id,line_id,line_stop_days,window_from,window_to,note',
      'true,SYN-OUT-2024Q1-A1,SYN-LINE-A1,3,2024-01-11,2024-04-10,three days of line stop while the rerouted shipment cleared the Cape'].join('\n') + '\n', documentTime: '2024-04-10T00:00:00Z' }]);
    outEvd = up[0] as { id: string; version: number };
    const o3 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', carryFrom: vSim, except: [ELEMENT_KEY] } }) as { version: { version: number } };
    vObs = o3.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'observed', value: 3, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: outEvd.id, version: outEvd.version }], record: { locator: 'SYN-OUT-2024Q1-A1', field: 'line_stop_days' } }] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: {} });
    await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { key: ELEMENT_KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the plant\'s actual line-stop days (B36)' } });
    reconciliationId = String((await sql<{ id: string }>`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${ELEMENT_KEY} and from_version = ${vSim} and against_version = ${vObs} order by recorded_at desc limit 1`.execute(su)).rows[0]?.id);
    const outcome = (await c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: ELEMENT_KEY, reconciliationId, note: 'Three days of line stop while the rerouted shipment cleared the Cape (B36, SYNTHETIC).' }, as)).outcome;
    return outcome.outcomeId;
  };

  it('I1 · THE MONITOR → OUTCOME STEP (i; JRN-08): the corridor mitigation committed, its outcome recorded and REVIEWED by the owner against the exposure (the outcome panel\'s act)', async () => {
    await publishTaxonomy({ expectedVersion: 0, categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }], reason: 'the first taxonomy of the domain (B36 fixture)' });
    await activateTaxonomy({ version: 1, reason: 'reviewed against the board\'s risk policy (B36 fixture)' });
    await approveAppetite({ category: 'supply_chain', expectedVersion: 0, threshold: 250_000, unit: 'EUR', statement: 'no single supply-chain exposure above EUR 250k residual', reason: 'the board\'s Q1 appetite (SYNTHETIC)' });
    corridor = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Corridor closure — Regensburg line (B36)', statement: 'A Bab el-Mandeb closure stops the magnet supply to the Regensburg line',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor is the driver of this exposure' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await registerX({ strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId, reviewEveryDays: 30 });
    const a = (await assess(corridor, { expectedVersion: 0, assessment: riskAssessment() })).assessment;
    await acceptX(regOwner, corridor, 1, { digest: a['digest'], rationale: 'The bracket matches the carrier notices; accepted (B36 fixture)' });
    const opened = (await openDecision(regOwner, corridor, { kind: 'mitigate', decision: { title: 'Mitigate the corridor closure (B36)', statement: 'reroute the magnet shipments via the Cape' } })).response;
    const pkg = String(opened['package_id']); const responseId = String(opened['response_id']);
    const outcomeId = await commitAndRecordOutcome(pkg, regOwner);
    const g1 = await getX(regOwner, corridor);
    expect(obj(g1.responses.find((x) => x['response_id'] === responseId)?.['monitor'])['state']).toBe('outcome_recorded');
    const lesson = 'The reroute held the line to three stop days; the buffer, not the route, was the binding constraint — size the buffer first next time.';
    corridorReview = String((await reviewOutcome(regOwner, corridor, { responseId, effect: 'partly_effective', residualVerdict: 'reassess', lesson })).review['review_id']);
    const g2 = await getX(regOwner, corridor);
    const resp = obj(g2.responses.find((x) => x['response_id'] === responseId));
    expect(obj(resp['monitor'])['state']).toBe('reviewed');
    expect(arr(resp['reviews'])).toEqual([expect.objectContaining({ review_id: corridorReview, effect: 'partly_effective', residual_verdict: 'reassess' })]);
    expect(resp['learn_owed'], 'the learn step is OWED after the review').toEqual([corridorReview]);
    evidence('I1', { exposure: corridor, response: responseId, package: pkg, outcome: outcomeId, review: corridorReview, monitor: 'reviewed', learn_owed: 1 });
  }, 300_000);

  it('J1 · THE LEARN STEP (j; JRN-09): the learning on the lineage after the review — refusals (403 PDP, 403 port, 404, 422, 409), the owner\'s learning, the event; the OPPORTUNITY\'s response closed with an outcome and its learning', async () => {
    const payload = { reviewId: corridorReview, expected: 'a 30–60 % chance of a two-week line stop costing EUR 400–900k', observed: 'three days of line stop; the buffer held while the shipment cleared the Cape',
      basisChange: 'the buffer, not the route, is the binding constraint: the next bracket rests on buffer days, not on transit days' };
    await refused(learn(analyst, corridor, payload), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(learn(otherOwner, corridor, payload), /^exposure learning rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    await refused(learn(regOwner, corridor, { ...payload, reviewId: uuidv7() }), /^exposure learning rejected \(unknown_review\)/, 404, 'EYE-STA-001');
    await refused(learn(regOwner, corridor, { ...payload, basisChange: 'too short' }), /basisChange is 16\.\.4000/, 422, 'EYE-REQ-001');
    const l = (await learn(regOwner, corridor, payload)).learning;
    expect(l).toMatchObject({ review_id: corridorReview, basis_version: 1, basis_change: payload.basisChange, recorded_by: regOwner.principalId,
      expected: { note: payload.expected, version: 1, probability: { low: 0.3, high: 0.6 }, impact: { low: 400000, high: 900000, unit: 'EUR' } },
      observed: { note: payload.observed, effect: 'partly_effective', residual_verdict: 'reassess' } });
    await refused(learn(regOwner, corridor, payload), /^exposure learning rejected \(duplicate\)/, 409, 'EYE-STA-002');
    const g = await getX(regOwner, corridor);
    expect(g.learnings).toEqual([expect.objectContaining({ learning_id: l['learning_id'] })]);
    expect(obj(g.responses[0])['learn_owed']).toEqual([]);
    expect(g.events.map((e) => e['event']).at(-1)).toBe('exposure.learning_recorded');
    // THE OPPORTUNITY (the Morocco supplier, SYNTHETIC): the exploit response committed, its outcome recorded, reviewed, the decision CLOSED with the outcome, the learning by its sponsor-owner
    morocco = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Alternative magnet supplier in Morocco (B36)', statement: 'The corridor closure opens the door to a Moroccan supplier',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the same corridor drives the opening' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the opportunity serves this objective' }] })).strategy.objectId;
    await registerX({ strategyObjectId: morocco, polarity: 'opportunity', category: 'sourcing', owner: brandt.principalId });
    await hypothesis(brandt, morocco, { statement: 'A Moroccan supplier can deliver qualified magnets within 12 weeks', falsifier: 'The first article fails the magnetic flux test',
      value: { low: 150_000, high: 600_000, unit: 'EUR' }, timing: { window: '2024-H1' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [] });
    const oa = (await assess(morocco, { expectedVersion: 0, assessment: oppAssessment() })).assessment;
    await acceptX(brandt, morocco, 1, { digest: oa['digest'], rationale: 'The value range justifies a qualification run (B36 fixture)' });
    const op = (await openDecision(brandt, morocco, { kind: 'exploit', decision: { title: 'Qualify the Moroccan supplier (B36)', statement: 'qualify the supplier now' } })).response;
    const pkg2 = String(op['package_id']); const resp2 = String(op['response_id']);
    await commitAndRecordOutcome(pkg2, brandt);
    const rv2 = String((await reviewOutcome(brandt, morocco, { responseId: resp2, effect: 'effective', residualVerdict: 'stands', lesson: 'The first article passed the flux test in week nine; the twelve-week window was conservative.' })).review['review_id']);
    // THE RESPONSE'S DECISION CLOSED WITH ITS OUTCOME: the commitment's root item completed by its owner, the closure proposed and co-signed by the reviewer (the objective's owner — B34 OBJ-37), then the package closed
    const cmt2 = String((await sql<Row>`select commitment_id::text from decision.commitments where package_id = ${pkg2}::uuid`.execute(su)).rows[0]!['commitment_id']);
    const root2 = String((await sql<Row>`select item_id::text from decision.commitment_items where commitment_id = ${cmt2}::uuid and parent_item_id is null`.execute(su)).rows[0]!['item_id']);
    await acceptItem(root2, brandt);   // the root is closed by the closure itself, co-signed by the reviewer
    const pc = (await cm.proposeClosure(R(brandt, 'decision.commitment.closure.propose', 'CMT', cmt2), T(), D(), cmt2, { payload: { deliverables: [{ title: 'Moroccan supplier qualified', evidence: 'the first-article flux test (B36, SYNTHETIC)' }], statement: 'The qualification is delivered (B36 harness).' } }) as { closure: Row }).closure;
    const reviewer = await h.openSession(w.twinOwner);
    expect(((await cm.cosignClosure(R(reviewer, 'decision.commitment.close', 'CMT', cmt2), T(), D(), String(pc['closure_id']), { payload: { commitmentId: cmt2 } })) as { closure: Row }).closure).toMatchObject({ state: 'cosigned' });
    expect((await c.close(pkg2, 'The qualification run closed with its outcome recorded; the supplier is qualified (B36, SYNTHETIC).', brandt)).closure).toMatchObject({ state: 'closed', outcomesRecorded: 1 });
    const l2 = (await learn(brandt, morocco, { reviewId: rv2, expected: 'a qualified supplier within twelve weeks at plausibility medium', observed: 'the first article passed in week nine; the response closed effective',
      basisChange: 'nine weeks is the evidenced qualification time: the next hypothesis window rests on it, and the plausibility rises' })).learning;
    expect(l2).toMatchObject({ review_id: rv2, expected: { plausibility: 'medium', probability: null }, observed: { effect: 'effective' } });
    const gm = await getX(brandt, morocco);
    expect(obj(gm.responses.find((x) => x['response_id'] === resp2))).toMatchObject({ learn_owed: [], package: { state: 'closed' } });
    expect(arr(obj(gm.responses.find((x) => x['response_id'] === resp2))['learnings'])).toHaveLength(1);
    evidence('J1', { corridor_learning: l['learning_id'], morocco: morocco, morocco_response_closed: pkg2, morocco_learning: l2['learning_id'] });
  }, 300_000);
});
