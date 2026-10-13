/**
 * CP-6 B94 §SA (migration 0114_b94_x_sa) — RESPONSIBILITY, OWNERSHIP, SUPPORT ACCESS, THE CONTROL CENTER, ADMISSION — on a real database
 * through the real pipeline, ports and controllers. CONSTRUCTION evidence: every persona, case and record here is SYNTHETIC (the vendor
 * engineer, the customer authority, the domain administrators); an approval by a synthetic persona demonstrates the software only;
 * production admission (IA-04-006) and profile parity (IA-04-004) are R1/B111 and are never claimed.
 *
 *   SA1 · THE MATRIX (IA-04-001/-003): proposed by the lead (rows validated), decided by the onboarding authority on the digest and SIGNED;
 *         refusals: the vocabulary, a vendor owner, an open proposal, a stale expected version, the lead (PDP), a lead holding the authority
 *         (SoD), an agent (port), a stale digest; a support engineer never writes it (PDP).
 *   SA2 · SUPPORT ACCESS (PR-69-003): requested by the engineer (refusals: an agent, a member engineer, a closed case, a foreign source, a
 *         duplicate); the approval HELD on an owner gap (IA-04-005 — the gap item raised, the grant untouched); CORRECTION: matrix v2 names the
 *         owner → released; refusals: the engineer approving its own grant (PDP), another administrator (not the accountable owner), an agent,
 *         a stale digest; approved → the expiry timer, the task resolved, the items closed.
 *   SA3 · THE DIAGNOSTIC READS (PER-20): live grant FIRST, every attempt logged; another source, an action outside the scope refused and
 *         logged; an engineer's WRITE refused by the PDP; the engineer reads no service record.
 *   SA4 · THE LAPSE IN THREE LAYERS: expired → refused BEFORE the sweep; the sweep (the tick step) marks it lapsed and the identity
 *         authority revokes the engineer's session after the tick (the old session refused); the expiry TIMER lapses another; an early revoke; withdraw; deny.
 *   SA5 · CUSTOMER-CONTROL DRILLS (CAP-TR-12): revoke a live grant and prove the next read refused; an expired grant refused; refusals.
 *   SA6 · RECONCILIATION (IA-04-002/-005): findings recorded on change only; a responsibility gap RAISED, then CLOSED when filled; the
 *         after-tick hook; a stale observation refused.
 *   SA7 · THE JOINT EXERCISE AND THE ADMISSION RECORD (IA-04-006): held without a signed matrix; proposed, signed; refusals; R1 stated.
 *   SA8 · CROSS-TENANT · SA9 · REPLAY (the ledger reconstructs every grant and matrix) · SA10 · THE CONTROL CENTER READ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { SupportController } from '../../src/delivery/support/support.controller.js';
import { SupportService } from '../../src/delivery/support/support.service.js';
import { SupportCap } from '../../src/delivery/support/support.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot.
const KEY = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
let h: Phase4Harness; let sc: SupportController; let svc: SupportService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const PURPOSE = 'service';

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let tenantAdmin: AuthenticatedPrincipal; let lead: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let authority2: AuthenticatedPrincipal;
let leadAuthority: AuthenticatedPrincipal;   // holds BOTH implementation_lead and onboarding_authority (the SoD probe)
let richter: AuthenticatedPrincipal;         // domain_admin — named the accountable owner of support.access in matrix v2 (T. Richter's role)
let dadmin2: AuthenticatedPrincipal;         // a second domain_admin (the ambiguity, and "not the accountable owner")
let engineer: AuthenticatedPrincipal;        // the SYNTHETIC vendor support engineer (support_engineer only)
let memberEngineer: AuthenticatedPrincipal;  // support_engineer + data_steward (a member: refused support access)
let agentEngineer: AuthenticatedPrincipal;   // an AGENT holding support_engineer
let machineAuthority: AuthenticatedPrincipal;// an AGENT holding onboarding_authority whose session claims a human (the PEP passes; the PORT refuses)
let machineAdmin: AuthenticatedPrincipal;    // an AGENT holding domain_admin whose session claims a human
let analyst: AuthenticatedPrincipal;
let agentId = '';

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

// ── routes (in process) ──────────────────────────────────────────────────────────────────────────
const rq = (as: AuthenticatedPrincipal, action: string, type = 'SGR', id: string | null = null) => h.req(as, action, type, id, PURPOSE);
const VOCAB_ROWS = (over: Record<string, Row> = {}): Row[] => [
  { key: 'domain.operation', title: 'Operating the corridor domain (SYNTHETIC)', ownerRole: 'domain_admin', operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority' },
  { key: 'risk.ownership', title: 'Owning the domain\'s risks (SYNTHETIC)', ownerRole: 'risk_owner', operatorRole: 'domain_analyst', customerAuthority: 'onboarding_authority' },
  { key: 'support.access', title: 'Approving vendor support access (SYNTHETIC)', ownerRole: 'domain_admin', operatorRole: 'support_engineer', customerAuthority: 'onboarding_authority' },
  { key: 'evidence.custody', title: 'Custody of the domain\'s evidence (SYNTHETIC)', ownerRole: 'data_steward', operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority' },
].map((r) => ({ accessPath: 'the domain workspace and the control center', evidenceProducer: 'the audit chain and the service ledger', escalationPath: 'the domain admin, then the onboarding authority',
                ...r, ...(over[String(r['key'])] ?? {}) }));
const propose = (as: AuthenticatedPrincipal, payload: Row) => sc.proposeMatrix(rq(as, 'service.matrix.propose', 'RSM'), T(), D(), { payload }) as Promise<{ matrix: Row }>;
const decideM = (as: AuthenticatedPrincipal, id: string, payload: Row) => sc.decideMatrix(rq(as, 'service.matrix.decide', 'RSM', id), T(), D(), id, { payload: { reason: 'the responsibilities read against the operating model (SYNTHETIC)', ...payload } }) as Promise<{ matrix: Row }>;
const request = (as: AuthenticatedPrincipal, payload: Row) => sc.requestGrant(rq(as, 'service.grant.request'), T(), D(), { payload }) as Promise<{ grant: Row }>;
const preview = (as: AuthenticatedPrincipal, id: string) => sc.preview(rq(as, 'service.read', 'SGR', id), T(), D(), id) as Promise<Row & { grant: Row; owner: Row; eligibility: { can_decide: boolean; reasons: string[] } }>;
const decideG = (as: AuthenticatedPrincipal, id: string, payload: Row) => sc.decideGrant(rq(as, 'service.grant.decide', 'SGR', id), T(), D(), id, { payload: { reason: 'the access is needed for the stalled feed (SYNTHETIC)', ...payload } }) as Promise<{ grant: Row }>;
const revoke = (as: AuthenticatedPrincipal, id: string) => sc.revokeGrant(rq(as, 'service.grant.revoke', 'SGR', id), T(), D(), id, { payload: { reason: 'the diagnosis is complete; access ends now' } }) as Promise<{ grant: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string) => sc.withdrawGrant(rq(as, 'service.grant.withdraw', 'SGR', id), T(), D(), id, { payload: { reason: 'the customer found the cause itself' } }) as Promise<{ grant: Row }>;
const diagnose = (as: AuthenticatedPrincipal, what: string, sourceId: string, caseId: string | null) => sc.diagnose(rq(as, `support.diagnose.${what}`, 'SRC', sourceId), T(), D(), what, { payload: { sourceId, caseId } }) as Promise<{ diagnosis: Row }>;
const drill = (as: AuthenticatedPrincipal, kind: string, grantId: string) => sc.runDrill(rq(as, 'service.drill.run', 'SGR', grantId), T(), D(), { payload: { kind, grantId, reason: 'the customer exercises its own control (SYNTHETIC drill)' } }) as Promise<{ drill: Row }>;
const reconcile = (as: AuthenticatedPrincipal) => sc.reconcile(rq(as, 'service.responsibility.reconcile', 'RSM'), T(), D(), { payload: {} }) as Promise<{ reconciliation: Row }>;
const control = (as: AuthenticatedPrincipal) => sc.controlCenter(rq(as, 'service.read', 'RSM'), T(), D(), { payload: {} }) as Promise<Row>;

let slot = 0;
const tick = async () => {
  const timer = h.app.get(AttentionTimerService);
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return { steps: (o.run?.outputs['steps'] ?? {}) as Record<string, Row>, after: (o.run?.outputs['after'] ?? {}) as Record<string, Row> };
};

async function plantCase(label: string, state = 'open'): Promise<string> {
  const id = uuidv7();
  await sql`insert into service.cases (case_id, tenant_id, domain_id, case_ref, title, severity, affected_capability, object_refs, description, state, routing, opened_by, correlation_id, closed_at)
            values (${id}::uuid, ${T()}::uuid, ${D()}::uuid, ${`CASE-${String(Date.now()).slice(-6)}${String(slot++).padStart(2, '0')}`}, ${`${label} (SYNTHETIC case planted by the §SA harness — §SV's port opens real ones)`},
                    'S2', 'observation', ${JSON.stringify([{ kind: 'source', id: h.fx.sourceId }])}::jsonb, 'the corridor feed has not delivered since the morning (SYNTHETIC)', ${state},
                    '{"tier":"premium"}'::jsonb, ${richter.principalId}::uuid, ${uuidv7()}::uuid, ${state === 'closed' ? new Date().toISOString() : null}::timestamptz)`.execute(h.su);
  return id;
}
async function tenantPrincipal(kind: 'human' | 'agent', roles: string[], label: string, claim: 'human' | 'agent', assurance: 'password' | 'agent_grant', scope: 'TENANT' | 'DOMAIN'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const dom = scope === 'DOMAIN' ? D() : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${T()}::uuid, ${dom}::uuid, ${`b94sa-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b94sa-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, ${scope}, ${T()}::uuid, ${dom}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claim, assurance, homeScope: scope, homeDomainId: dom, bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: T(), domainId: dom })) } as AuthenticatedPrincipal);
}
const events = async (subject: string) => (await rows(sql`select event from service.events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));
const itemsOf = async (cls: string, subject: string) => rows(sql`select item_id::text, state, title from executive.attention_items where signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);
const gapSubject = async (key: string) => String((await one(sql`select service.gap_subject(${T()}::uuid, ${D()}::uuid, ${key})::text as s`))['s']);

let SRC = ''; let SRC2 = ''; let CASE1 = ''; let MATRIX = ''; let V1DIGEST = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  sc = h.app.get(SupportController); svc = h.app.get(SupportService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b94sa-tenant-admin', 'TENANT');
  lead = await h.humanWithSession(['implementation_lead'], 'b94sa-lead', 'TENANT');
  authority = await h.humanWithSession(['onboarding_authority'], 'b94sa-authority', 'TENANT');
  authority2 = await h.humanWithSession(['onboarding_authority'], 'b94sa-authority-2', 'TENANT');
  leadAuthority = await h.humanWithSession(['implementation_lead', 'onboarding_authority'], 'b94sa-lead-authority', 'TENANT');
  richter = await h.humanWithSession(['domain_admin'], 'b94sa-richter');
  dadmin2 = await h.humanWithSession(['domain_admin'], 'b94sa-dadmin-2');
  engineer = await h.humanWithSession(['support_engineer'], 'b94sa-vendor-engineer');
  memberEngineer = await h.humanWithSession(['support_engineer', 'data_steward'], 'b94sa-member-engineer');
  analyst = await h.humanWithSession(['domain_analyst'], 'b94sa-analyst');
  agentEngineer = await tenantPrincipal('agent', ['support_engineer'], 'agent-engineer', 'agent', 'agent_grant', 'DOMAIN');
  machineAuthority = await tenantPrincipal('agent', ['onboarding_authority'], 'machine-authority', 'human', 'password', 'TENANT');
  machineAdmin = await tenantPrincipal('agent', ['domain_admin'], 'machine-admin', 'human', 'password', 'DOMAIN');
  SRC = h.fx.sourceId;
  SRC2 = await h.uploadSource('internal', `b94sa-${RUN}`);
  CASE1 = await plantCase('The corridor feed stalled');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const exec = h.app.get(Ec);
  // the published attention policy: support access and responsibility gaps to the domain administrators (SYNTHETIC)
  await exec.publishAttentionPolicy(h.req(richter, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B94 §SA harness: support access and responsibility gaps to the domain administrators',
    rules: { classes: {
      'support.access': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
      'responsibility.gap': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  // the attention agent whose ticks fire the support_access.expiry timers and run the hooks
  const a = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: richter.principalId, escalationPrincipalId: dadmin2.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B94 §SA harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

describe('SA1 · the shared-responsibility matrix (IA-04-001/-003)', () => {
  it('refusals before any version: the vocabulary, a vendor owner, a support engineer (PDP), the shape', async () => {
    await refused(propose(lead, { rows: VOCAB_ROWS({ 'risk.ownership': { ownerRole: 'domain_admin' } }), expectedVersion: 0 }), /^responsibility matrix rejected \(vocabulary\): risk.ownership is owned by risk_owner/, 422);
    await refused(propose(lead, { rows: [...VOCAB_ROWS(), { key: 'vendor.ops', title: 'Vendor operations', ownerRole: 'support_engineer', operatorRole: 'support_engineer', customerAuthority: 'onboarding_authority',
      accessPath: 'the vendor console', evidenceProducer: 'the access log', escalationPath: 'the vendor, then the domain admin' }], expectedVersion: 0 }), /^responsibility matrix rejected \(row\): vendor.ops — a vendor support engineer never owns/, 422);
    await refused(propose(engineer, { rows: VOCAB_ROWS(), expectedVersion: 0 }), /no qualifying role binding/, 403);
    await refused(propose(lead, { rows: [], expectedVersion: 0 }), /^responsibility matrix rejected \(rows\)/, 422);
    await refused(propose(lead, { rows: VOCAB_ROWS({ 'support.access': { escalationPath: 'no' } }), expectedVersion: 0 }), /states its escalation_path/, 422);
  });
  it('positive: the lead proposes v1 (digested, the authority\'s review task opened); a second open proposal and a stale version are refused', async () => {
    const m = (await propose(lead, { rows: VOCAB_ROWS(), expectedVersion: 0 })).matrix;
    expect(m).toMatchObject({ version: 1, state: 'proposed', profile: 'local-dev' });
    expect(String(m['digest'])).toMatch(/^[0-9a-f]{64}$/);
    MATRIX = String(m['matrix_id']); V1DIGEST = String(m['digest']);
    expect(await one(sql`select kind, state, candidate_roles from executive.human_tasks where subject ->> 'id' = ${MATRIX}`)).toMatchObject({ kind: 'onboarding.approve', state: 'open', candidate_roles: ['onboarding_authority'] });
    await refused(propose(lead, { rows: VOCAB_ROWS(), expectedVersion: 1 }), /^responsibility matrix rejected \(state\): version 1 is proposed/, 409);
    await refused(propose(lead, { rows: VOCAB_ROWS(), expectedVersion: 0 }), /^responsibility matrix rejected \(stale\)/, 409);
  });
  it('the decision: the lead (PDP) · a lead holding the authority (SoD) · an agent (port) · a stale digest · then the authority approves and SIGNS', async () => {
    await refused(decideM(lead, MATRIX, { version: 1, decision: 'approve', digest: V1DIGEST }), /no qualifying role binding/, 403);
    await refused(decideM(leadAuthority, MATRIX, { version: 1, decision: 'approve', digest: V1DIGEST }), /^responsibility matrix rejected \(separation_of_duties\): an implementation lead never approves/, 403);
    await refused(decideM(machineAuthority, MATRIX, { version: 1, decision: 'approve', digest: V1DIGEST }), /^responsibility matrix rejected \(actor\)/, 403);
    await refused(decideM(authority, MATRIX, { version: 1, decision: 'approve', digest: 'f'.repeat(64) }), /^responsibility matrix rejected \(stale\)/, 409);
    expect(await one(sql`select count(*)::int n from executive.signatures where subject_id = ${MATRIX}::uuid`)).toEqual({ n: 0 });   // a refused approval left no signature
    const m = (await decideM(authority, MATRIX, { version: 1, decision: 'approve', digest: V1DIGEST })).matrix;
    expect(m).toMatchObject({ state: 'approved', version: 1, digest: V1DIGEST, supersedes: null });
    const sig = await one(sql`select key_id, signature, subject_digest, signer::text, bound_action from executive.signatures where signature_id = ${String(m['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_digest: V1DIGEST, signer: authority.principalId, bound_action: 'service.matrix.decide' });
    expect(new SignatureService().verify(sig as never)).toBe(true);
    expect(await one(sql`select state from executive.human_tasks where subject ->> 'id' = ${MATRIX}`)).toEqual({ state: 'completed' });
    await refused(decideM(authority2, MATRIX, { version: 1, decision: 'approve', digest: V1DIGEST }), /^responsibility matrix rejected \(state\): version 1 is approved/, 409);
  });
});

let G1 = ''; let G1DIGEST = '';
describe('SA2 · support access: request, the owner-gap hold, the correction (matrix v2), the approval (PR-69-003, IA-04-005)', () => {
  it('request refusals: an agent (port) · a member engineer (access) · a closed case · a foreign source · a bad duration (route) · the PDP for a non-engineer', async () => {
    const base = { caseId: CASE1, purpose: 'diagnose the stalled corridor feed for the case', sources: [SRC], actions: ['diagnose.source', 'diagnose.runs', 'diagnose.health'], durationMinutes: 240 };
    await refused(request(agentEngineer, base), /^support grant rejected \(actor\): support access is requested by a named human/, 403);
    await refused(request(memberEngineer, base), /^support grant rejected \(access\): a support engineer holds no customer role \(this principal also holds data_steward\)/, 403);
    await refused(request(engineer, { ...base, caseId: await plantCase('A closed case', 'closed') }), /^support grant rejected \(state\): case .* is closed/, 409);
    await refused(request(engineer, { ...base, sources: [uuidv7()] }), /^support grant rejected \(unknown_source\)/, 404);
    await refused(request(engineer, { ...base, durationMinutes: 5 }), /^support grant rejected \(duration\)/, 422);
    await refused(request(engineer, { ...base, actions: ['observation.source.transition'] }), /^support grant rejected \(actions\)/, 422);
    await refused(request(analyst, base), /no qualifying role binding/, 403);
  });
  it('positive: the engineer requests 4 h (digest, the review task, the support.access item); a duplicate is refused', async () => {
    const g = (await request(engineer, { caseId: CASE1, purpose: 'diagnose the stalled corridor feed for the case', sources: [SRC], actions: ['diagnose.source', 'diagnose.runs', 'diagnose.health'] })).grant;
    expect(g).toMatchObject({ state: 'requested', duration_minutes: 240, action_scope: ['diagnose.health', 'diagnose.runs', 'diagnose.source'] });
    G1 = String(g['grant_id']); G1DIGEST = String(g['request_digest']);
    expect(await one(sql`select kind, state from executive.human_tasks where task_id = ${String((g['task'] as Row)['task_id'])}::uuid`)).toEqual({ kind: 'support.access_review', state: 'open' });
    expect((await itemsOf('support.access', G1)).map((i) => i['state'])).toEqual(['open']);
    await refused(request(engineer, { caseId: CASE1, purpose: 'diagnose the stalled corridor feed again', sources: [SRC], actions: ['diagnose.source'] }), /^support grant rejected \(duplicate\)/, 409);
  });
  it('FAULT · the owner gap HOLDS the approval: two domain admins and v1 names none → 409 held, the gap raised and visible, the grant untouched', async () => {
    const pv = await preview(richter, G1);
    expect(pv.eligibility.can_decide).toBe(false);
    expect(pv.eligibility.reasons.join(' ')).toMatch(/HELD: the accountable owner of support.access is ambiguous/);
    const r = await refused(decideG(richter, G1, { decision: 'approve', digest: G1DIGEST }), /^support grant rejected \(held\): support access cannot be approved — support.access is ambiguous/, 409);
    expect((r.body['held'] as Row)['blocking']).toEqual([expect.objectContaining({ responsibility: 'support.access', state: 'ambiguous' })]);
    expect(await one(sql`select state from service.support_grants where grant_id = ${G1}::uuid`)).toEqual({ state: 'requested' });
    expect((await itemsOf('responsibility.gap', await gapSubject('support.access'))).map((i) => i['state'])).toEqual(['open']);
    expect(await events(G1)).toEqual(['grant.requested', 'grant.held']);
    // a second held attempt keeps ONE visible gap item
    await refused(decideG(richter, G1, { decision: 'approve', digest: G1DIGEST }), /\(held\)/, 409);
    expect((await itemsOf('responsibility.gap', await gapSubject('support.access'))).length).toBe(1);
  });
  it('CORRECTION · matrix v2 (the domain admin proposes; another authority approves) names T. Richter the owner of support.access → v1 superseded', async () => {
    const v2 = (await propose(richter, { rows: VOCAB_ROWS({ 'support.access': { ownerPrincipalId: richter.principalId }, 'domain.operation': { ownerPrincipalId: richter.principalId } }), expectedVersion: 1 })).matrix;
    expect(v2).toMatchObject({ matrix_id: MATRIX, version: 2, state: 'proposed' });
    await refused(decideM(richter, MATRIX, { version: 2, decision: 'approve', digest: String(v2['digest']) }), /no qualifying role binding/, 403);
    expect((await decideM(authority2, MATRIX, { version: 2, decision: 'approve', digest: String(v2['digest']) })).matrix).toMatchObject({ state: 'approved', version: 2, supersedes: 1 });
    expect((await rows(sql`select version, state from service.responsibility_matrices where matrix_id = ${MATRIX}::uuid order by version`))).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'approved' }]);
  });
  it('released: refusals (the engineer approving its own grant — PDP; another admin — not the owner; an agent; a stale digest), then the accountable owner approves', async () => {
    await refused(decideG(engineer, G1, { decision: 'approve', digest: G1DIGEST }), /no qualifying role binding/, 403);
    await refused(decideG(dadmin2, G1, { decision: 'approve', digest: G1DIGEST }), /^support grant rejected \(authority\): support access is approved by the accountable owner of support.access/, 403);
    await refused(decideG(machineAdmin, G1, { decision: 'approve', digest: G1DIGEST }), /^support grant rejected \(actor\)/, 403);
    await refused(decideG(richter, G1, { decision: 'approve', digest: 'a'.repeat(64) }), /^support grant rejected \(stale\)/, 409);
    const pv = await preview(richter, G1);
    expect(pv.eligibility).toEqual({ can_decide: true, reasons: [] });
    const g = (await decideG(richter, G1, { decision: 'approve', digest: G1DIGEST })).grant;
    expect(g).toMatchObject({ state: 'approved', held: false });
    expect(Date.parse(String(g['expires_at'])) - Date.parse(String(g['starts_at']))).toBe(240 * 60_000);
    expect(await one(sql`select kind, owner_kind, owner_id::text, fired_at, cancelled_at from executive.workflow_timers where timer_id = ${String(g['expiry_timer_id'])}::uuid`))
      .toMatchObject({ kind: 'support_access.expiry', owner_kind: 'grant', owner_id: G1, fired_at: null, cancelled_at: null });
    expect((await itemsOf('support.access', G1)).map((i) => i['state'])).toEqual(['closed']);
    expect((await itemsOf('responsibility.gap', await gapSubject('support.access'))).map((i) => i['state'])).toEqual(['closed']);
    await refused(decideG(richter, G1, { decision: 'approve', digest: G1DIGEST }), /^support grant rejected \(state\): the grant is approved/, 409);
  });
});

describe('SA3 · the diagnostic reads (PER-20): live grant first, every attempt logged, read-only', () => {
  it('positive: source, runs and health of the NAMED source — each logged with the grant id; never the contract body', async () => {
    for (const what of ['source', 'runs', 'health']) {
      const d = (await diagnose(engineer, what, SRC, CASE1)).diagnosis;
      expect(d).toMatchObject({ refused: false, grant_id: G1, action: `support.diagnose.${what}`, source_id: SRC });
    }
    const src = (await diagnose(engineer, 'source', SRC, CASE1)).diagnosis['data'] as Row;
    expect(src['source_id']).toBe(SRC);
    expect(Object.keys(src)).not.toContain('contract'); expect(Object.keys(src)).not.toContain('endpoints');
    expect(await one(sql`select count(*)::int n from service.access_log where grant_id = ${G1}::uuid and outcome = 'allowed'`)).toEqual({ n: 4 });
  });
  it('refused AND logged: another source (object scope), an action outside the scope (schedule), another case', async () => {
    await refused(diagnose(engineer, 'source', SRC2, CASE1), /^support access rejected \(access\): source .* is outside grant .* object scope/, 403);
    await refused(diagnose(engineer, 'schedule', SRC, CASE1), /^support access rejected \(access\): diagnose.schedule is outside grant/, 403);
    await refused(diagnose(engineer, 'source', SRC, uuidv7()), /^support access rejected \(access\): no support grant for this engineer and case/, 403);
    const log = await rows(sql`select action, object_id, outcome, detail ->> 'why' as why from service.access_log where principal_id = ${engineer.principalId}::uuid and outcome = 'refused' order by at`);
    expect(log.map((l) => l['action'])).toEqual(['support.diagnose.source', 'support.diagnose.schedule', 'support.diagnose.source']);
    // the audit of a refused read reads failure (the attempt itself is the evidence)
    expect(await one(sql`select count(*)::int n from audit.audit_events where event_jcs::jsonb ->> 'action' = 'support.diagnose.schedule' and event_jcs::jsonb ->> 'outcome' = 'failure'`)).toEqual({ n: 1 });
  });
  it('the engineer cannot write customer state: a source transition is refused by the PDP; it reads no service record; it reads its OWN grants', async () => {
    const write = h.pipeline.write(h.env(engineer, 'observation.source.transition', 'SRC', SRC), engineer, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.transition', objectType: 'SRC', objectId: SRC },
      ObservationCapability.registry, async () => ({ result: {}, targetType: 'SRC', targetId: SRC, targetVersion: '1', outboxEvent: null }));
    await refused(write, /no qualifying role binding/, 403);
    await refused(control(engineer), /no qualifying role binding/, 403);
    await refused(sc.proposeMatrix(rq(engineer, 'service.matrix.propose', 'RSM'), T(), D(), { payload: { rows: VOCAB_ROWS(), expectedVersion: 2 } }), /no qualifying role binding/, 403);
    const mine = await sc.mine(rq(engineer, 'support.grant.read'), T(), D()) as { grants: Row[] };
    expect(mine.grants.map((g) => g['grant_id'])).toEqual([G1]);
  });
});

describe('SA4 · the lapse in three layers', () => {
  it('LAYER 2 · expired → the next read is refused BEFORE any sweep (the grant still reads approved)', async () => {
    await sql`update service.support_grants set starts_at = clock_timestamp() - interval '241 minutes', expires_at = clock_timestamp() - interval '1 second' where grant_id = ${G1}::uuid`.execute(h.su);   // time travel (fixture): 4 h elapsed
    await refused(diagnose(engineer, 'source', SRC, CASE1), /^support access rejected \(access\): grant .* expired at/, 403);
    expect(await one(sql`select state from service.support_grants where grant_id = ${G1}::uuid`)).toEqual({ state: 'approved' });
  });
  it('LAYER 3b + 1 · the sweep (the tick step support-grant-expiry) marks it lapsed; the after-tick hook support-access has the identity authority revoke the engineer\'s session; the old session is refused', async () => {
    const { steps, after } = await tick();
    expect(((steps['support-grant-expiry'] as Row)['lapsed'] as Row[]).map((g) => [g['grant_id'], g['via']])).toEqual([[G1, 'sweep']]);
    const s = after['support-access'] as Row;
    expect((s['revoked'] as Row[]).map((r) => r['principal'])).toContain(engineer.principalId);
    expect(await one(sql`select state, end_reason from service.support_grants where grant_id = ${G1}::uuid`)).toEqual({ state: 'lapsed', end_reason: 'the grant expired (sweep)' });
    expect(await one(sql`select status from identity.sessions where id = ${engineer.sessionId}::uuid`)).toEqual({ status: 'revoked' });
    expect((await refusal(diagnose(engineer, 'source', SRC, CASE1))).status).toBeGreaterThanOrEqual(401);
    expect(await events(G1)).toEqual(['grant.requested', 'grant.held', 'grant.held', 'grant.approved', 'grant.lapsed']);
    engineer = await h.openSession(engineer);   // the engineer signs in again: no grant is live for it
    await refused(diagnose(engineer, 'source', SRC, CASE1), /^support access rejected \(access\): grant .* is lapsed/, 403);
    const again = await tick();
    expect((again.after['support-access'] as Row)['pending']).toBe(0);   // a session opened after the end is not revoked
  });
  it('LAYER 3a · the support_access.expiry TIMER fired by the tick lapses a grant (the timer planted due now — fixture time travel)', async () => {
    const c = await plantCase('Timer lapse');
    const g = (await request(engineer, { caseId: c, purpose: 'diagnose the scheduler of the feed', sources: [SRC], actions: ['diagnose.schedule'], durationMinutes: 15 })).grant;
    const id = String(g['grant_id']);
    await decideG(richter, id, { decision: 'approve', digest: String(g['request_digest']) });
    await sql`update service.support_grants set starts_at = clock_timestamp() - interval '16 minutes', expires_at = clock_timestamp() - interval '1 second' where grant_id = ${id}::uuid`.execute(h.su);
    const timer = String((await one(sql`select executive._schedule_timer(gen_random_uuid(), ${T()}::uuid, ${D()}::uuid, 'grant', ${id}::uuid, 'support_access.expiry', clock_timestamp() - interval '1 second', '{}'::jsonb, ${richter.principalId}::uuid, ${uuidv7()}::uuid)::text as t`))['t']);
    const { steps } = await tick();
    const fired = ((steps['workflow-timers'] as Row)['timers'] as Row[]).find((x) => x['timer_id'] === timer) as Row;
    expect(fired).toMatchObject({ kind: 'support_access.expiry', outcome: 'fired' });
    expect(fired['result']).toMatchObject({ state: 'lapsed', via: 'timer', grant_id: id });
    expect(await one(sql`select state, end_reason from service.support_grants where grant_id = ${id}::uuid`)).toEqual({ state: 'lapsed', end_reason: 'the grant expired (support_access.expiry timer)' });
    engineer = await h.openSession(engineer);
  });
  it('LAYER 1 deferred while ANOTHER grant is live (act-found on eye_demo): a lapsed grant\'s sessions are kept while the engineer holds a live approved grant, and revoked when the last grant ends', async () => {
    const c1 = await plantCase('Short grant'); const c2 = await plantCase('Four-hour grant');
    const a = (await request(engineer, { caseId: c1, purpose: 'a short look at the stalled feed', sources: [SRC], actions: ['diagnose.source'], durationMinutes: 15 })).grant;
    await decideG(richter, String(a['grant_id']), { decision: 'approve', digest: String(a['request_digest']) });
    const b = (await request(engineer, { caseId: c2, purpose: 'the four-hour diagnosis of the stalled feed', sources: [SRC], actions: ['diagnose.source'], durationMinutes: 240 })).grant;
    await decideG(richter, String(b['grant_id']), { decision: 'approve', digest: String(b['request_digest']) });
    const session = engineer.sessionId;
    await sql`update service.support_grants set starts_at = clock_timestamp() - interval '16 minutes', expires_at = clock_timestamp() - interval '1 second' where grant_id = ${String(a['grant_id'])}::uuid`.execute(h.su);
    const first = await tick();
    const sweep = first.steps['support-grant-expiry'] as Row;
    expect((sweep['lapsed'] as Row[]).map((g) => g['grant_id'])).toContain(String(a['grant_id']));
    expect((sweep['access_kept'] as Row[]).find((k) => k['principal'] === engineer.principalId)).toMatchObject({ kept_for_live_grant: String(b['grant_id']) });
    expect(((first.after['support-access'] as Row)['revoked'] as Row[] | undefined ?? []).map((r) => r['principal'])).not.toContain(engineer.principalId);
    expect(await one(sql`select status from identity.sessions where id = ${session}::uuid`)).toEqual({ status: 'active' });
    expect((await diagnose(engineer, 'source', SRC, c2)).diagnosis['refused']).toBe(false);                 // the live grant still serves the same session
    await refused(diagnose(engineer, 'source', SRC, c1), /grant .* is lapsed/, 403);                          // the ended grant reads nothing (layer 2)
    await sql`update service.support_grants set starts_at = clock_timestamp() - interval '241 minutes', expires_at = clock_timestamp() - interval '1 second' where grant_id = ${String(b['grant_id'])}::uuid`.execute(h.su);
    const last = await tick();
    expect(((last.after['support-access'] as Row)['revoked'] as Row[]).map((r) => r['principal'])).toContain(engineer.principalId);
    expect(await one(sql`select status from identity.sessions where id = ${session}::uuid`)).toEqual({ status: 'revoked' });
    engineer = await h.openSession(engineer);
  });
  it('an EARLY REVOKE by the domain admin: immediate (the next read refused), the timer cancelled, the sessions revoked; the engineer cannot revoke (PDP); withdraw and deny', async () => {
    const c = await plantCase('Early revoke');
    const g = (await request(engineer, { caseId: c, purpose: 'diagnose the stalled feed, early revoke', sources: [SRC], actions: ['diagnose.source'] })).grant;
    const id = String(g['grant_id']);
    const ok = (await decideG(richter, id, { decision: 'approve', digest: String(g['request_digest']) })).grant;
    expect((await diagnose(engineer, 'source', SRC, c)).diagnosis['refused']).toBe(false);
    await refused(revoke(engineer, id), /no qualifying role binding/, 403);
    const r = (await revoke(dadmin2, id)).grant;   // any named human domain admin revokes (the customer's control); approval is the owner's
    expect(r).toMatchObject({ state: 'revoked', prior_state: 'approved' });
    expect((r['access'] as Row)['sessions_revoked']).toBeGreaterThanOrEqual(1);
    expect(await one(sql`select cancelled_at is not null as cancelled from executive.workflow_timers where timer_id = ${String(ok['expiry_timer_id'])}::uuid`)).toEqual({ cancelled: true });
    engineer = await h.openSession(engineer);
    await refused(diagnose(engineer, 'source', SRC, c), /grant .* is revoked/, 403);
    await refused(revoke(richter, id), /^support grant rejected \(state\): only an approved grant is revoked/, 409);
    // withdraw (the engineer) and deny (the owner)
    const w = (await request(engineer, { caseId: c, purpose: 'a second look at the stalled feed', sources: [SRC], actions: ['diagnose.runs'] })).grant;
    await refused(sc.withdrawGrant(rq(memberEngineer, 'service.grant.withdraw', 'SGR', String(w['grant_id'])), T(), D(), String(w['grant_id']), { payload: { reason: 'not mine to withdraw at all' } }), /^support grant rejected \(ownership\)/, 403);
    expect((await withdraw(engineer, String(w['grant_id']))).grant).toMatchObject({ state: 'withdrawn' });
    expect(await one(sql`select state from executive.human_tasks where subject ->> 'id' = ${String(w['grant_id'])}`)).toEqual({ state: 'cancelled' });
    const dn = (await request(engineer, { caseId: c, purpose: 'a third look at the stalled feed', sources: [SRC], actions: ['diagnose.runs'] })).grant;
    expect((await decideG(dadmin2, String(dn['grant_id']), { decision: 'deny', digest: String(dn['request_digest']) })).grant).toMatchObject({ state: 'denied' });   // deny needs no resolved owner
  });
});

describe('SA5 · customer-control drills (CAP-TR-12)', () => {
  it('revoke_live_grant: the drill revokes a LIVE grant and proves every probe refused; the next real read is refused and logged; the engineer runs no drill', async () => {
    const c = await plantCase('Control drill');
    const g = (await request(engineer, { caseId: c, purpose: 'diagnose the feed under a control drill', sources: [SRC, SRC2], actions: ['diagnose.source', 'case.note'] })).grant;
    const id = String(g['grant_id']);
    await decideG(richter, id, { decision: 'approve', digest: String(g['request_digest']) });
    await refused(drill(engineer, 'revoke_live_grant', id), /no qualifying role binding/, 403);
    await refused(drill(machineAdmin, 'revoke_live_grant', id), /^control drill rejected \(actor\)/, 403);
    const d = (await drill(richter, 'revoke_live_grant', id)).drill;
    expect(d).toMatchObject({ kind: 'revoke_live_grant', outcome: 'passed' });
    expect((d['probes'] as Row[]).map((p) => [p['action'], p['live_grant']])).toEqual([['case.note', null], ['diagnose.source', null], ['diagnose.source', null]]);
    engineer = await h.openSession(engineer);
    await refused(diagnose(engineer, 'source', SRC, c), /grant .* is revoked/, 403);
    expect(await one(sql`select count(*)::int n from service.access_log where grant_id = ${id}::uuid and outcome = 'refused' and detail ? 'drill'`)).toEqual({ n: 3 });
    await refused(drill(richter, 'revoke_live_grant', id), /^control drill rejected \(state\): revoke_live_grant needs a LIVE grant \(the grant is revoked\)/, 409);
  });
  it('expired_grant_refused: a grant past its expiry (the lapsed G1) probes refused', async () => {
    expect((await drill(richter, 'expired_grant_refused', G1)).drill).toMatchObject({ outcome: 'passed' });
  });
});

describe('SA6 · reconciliation and the responsibility gap (IA-04-002/-005)', () => {
  it('positive: findings recorded (the risk.ownership gap, the member engineer\'s privilege drift); the gap item raised; unchanged → not recorded again', async () => {
    // the ticks above (SA4) already ran the after-tick hook: this call records only if the observed state changed since — either way the
    // latest recorded reconciliation is the one that stands
    const r = (await reconcile(richter)).reconciliation;
    expect(typeof r['recorded']).toBe('boolean');
    const last = await one(sql`select matrix_version, findings, gaps from service.reconciliation_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by recorded_at desc limit 1`);
    expect(last).toMatchObject({ matrix_version: 2, gaps: 1 });
    const findings = last['findings'] as Row[];
    expect(findings.filter((f) => f['class'] === 'gap').map((f) => [f['kind'], f['key']])).toEqual([['owner_unfilled', 'risk.ownership']]);
    expect(findings.map((f) => f['kind'])).toEqual(expect.arrayContaining(['support_privilege', 'responsibility_undeclared']));
    expect((await itemsOf('responsibility.gap', await gapSubject('risk.ownership'))).map((i) => i['state'])).toEqual(['open']);
    expect((await reconcile(lead)).reconciliation).toMatchObject({ recorded: false, unchanged: true });
    await refused(reconcile(engineer), /no qualifying role binding/, 403);
  });
  it('a stale observation (matrix v1 after v2 approved) is refused', async () => {
    const observed = (await h.pipeline.consequentialRead(h.env(richter, 'service.read', 'RSM', null, PURPOSE), richter, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'service.read', objectType: 'RSM', objectId: null },
      SupportCap, async (cap) => cap.observe(T(), D(), 'local-dev'))).result;
    const stale = { ...observed, matrix: { ...(observed['matrix'] as Row), version: 1 } };
    await refused(h.pipeline.write(h.env(richter, 'service.responsibility.reconcile', 'RSM', null, PURPOSE), richter, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'service.responsibility.reconcile', objectType: 'RSM', objectId: null },
      SupportCap, async (cap) => ({ result: await cap.recordReconciliation({ eventId: uuidv7(), t: T(), d: D(), profile: 'local-dev', observed: stale, findings: [], actor: richter.principalId, correlationId: uuidv7() }), targetType: 'RSM', targetId: null, targetVersion: null, outboxEvent: null })),
      /^accountable owner rejected \(stale\)/, 409);
  });
  it('FAULT · the gap is CLOSED when filled: a risk owner bound → the after-tick hook records the change and closes the item', async () => {
    await h.humanWithSession(['risk_owner'], 'b94sa-risk-owner');
    const { after } = await tick();
    expect(after['responsibility-reconcile']).toMatchObject({ recorded: true, gaps: 0 });
    expect((await itemsOf('responsibility.gap', await gapSubject('risk.ownership'))).map((i) => i['state'])).toEqual(['closed']);
    // the next tick sees nothing changed: the hook writes nothing (the step's look answered due: false)
    const again = await tick();
    expect(again.steps['responsibility-observe']).toMatchObject({ declared: true, due: false });
    expect(again.after['responsibility-reconcile']).toEqual({ skipped: 'the observed state is unchanged since the last reconciliation' });
    const owners = await sc.owners(rq(richter, 'service.read', 'RSM'), T(), D(), { payload: {} }) as { owners: Row[] };
    expect(owners.owners.map((o) => [o['key'], (o['resolution'] as Row)['state']])).toEqual([['domain.operation', 'resolved'], ['evidence.custody', 'resolved'], ['risk.ownership', 'resolved'], ['support.access', 'resolved']]);
  });
});

let EXERCISE = ''; let ADM = '';
describe('SA7 · the joint exercise and the admission record (IA-04-006; production admission is R1)', () => {
  it('the joint exercise: customer and vendor participants; refusals: the engineer (PDP), a vendor who is not an engineer, the lead', async () => {
    const today = String((await one(sql`select (clock_timestamp() at time zone 'UTC')::date::text d`))['d']);
    const payload = { title: 'Joint support-access exercise (SYNTHETIC)', scenario: 'the vendor diagnoses a stalled feed under a 4-hour grant; the customer revokes early', heldOn: today,
      customerParticipants: [richter.principalId, authority.principalId], vendorParticipants: [engineer.principalId], outcome: 'completed', evidenceRefs: [{ kind: 'drill' }] };
    const ex = (a: AuthenticatedPrincipal, p: Row) => sc.recordExercise(rq(a, 'service.exercise.record', 'SJX'), T(), D(), { payload: p }) as Promise<{ exercise: Row }>;
    await refused(ex(engineer, payload), /no qualifying role binding/, 403);
    await refused(ex(richter, { ...payload, vendorParticipants: [analyst.principalId] }), /^admission record rejected \(exercise\): vendor participant .* is not a support engineer/, 422);
    await refused(ex(leadAuthority, payload), /^admission record rejected \(separation_of_duties\)/, 403);
    const e = (await ex(richter, payload)).exercise;
    expect(e).toMatchObject({ outcome: 'completed', claim: 'demonstration' });
    EXERCISE = String(e['exercise_id']);
  });
  it('held without a signed matrix for the profile; proposed (the grant ledger, the drills, the exercise, the baseline digest bound); signed by the authority', async () => {
    const today = String((await one(sql`select (clock_timestamp() at time zone 'UTC')::date::text d`))['d']);
    const prop = (a: AuthenticatedPrincipal, p: Row) => sc.proposeAdmission(rq(a, 'service.admission.propose', 'SAR'), T(), D(), { payload: p }) as Promise<{ admission: Row }>;
    const base = { periodFrom: today, periodTo: today, baselineDigest: 'c'.repeat(64), exercises: [EXERCISE] };
    await refused(prop(lead, { ...base, profile: 'saas' }), /^admission record rejected \(held\): no signed responsibility matrix for saas/, 409);
    await refused(prop(engineer, base), /no qualifying role binding/, 403);
    const a = (await prop(lead, base)).admission;
    expect(a).toMatchObject({ version: 1, state: 'proposed' });
    ADM = String(a['admission_id']);
    expect((a['matrix'] as Row)['version']).toBe(2);
    expect(((a['grant_ledger'] as Row)['grants'] as Row[]).length).toBeGreaterThanOrEqual(6);
    expect(((a['drills'] as Row[]).filter((d) => d['outcome'] === 'passed')).length).toBe(2);
    expect(String(a['production_admission'])).toMatch(/^R1/);
    const dec = (as: AuthenticatedPrincipal, p: Row) => sc.decideAdmission(rq(as, 'service.admission.decide', 'SAR', ADM), T(), D(), ADM, { payload: { reason: 'the evidence of the period reviewed (SYNTHETIC)', ...p } }) as Promise<{ admission: Row }>;
    await refused(dec(lead, { version: 1, decision: 'sign', digest: String(a['digest']) }), /no qualifying role binding/, 403);
    await refused(dec(leadAuthority, { version: 1, decision: 'sign', digest: String(a['digest']) }), /^admission record rejected \(separation_of_duties\)/, 403);
    await refused(dec(authority, { version: 1, decision: 'sign', digest: 'b'.repeat(64) }), /^admission record rejected \(stale\)/, 409);
    const s = (await dec(authority, { version: 1, decision: 'sign', digest: String(a['digest']) })).admission;
    expect(s).toMatchObject({ state: 'signed', digest: a['digest'] });
    const sig = await one(sql`select key_id, signature, subject_digest from executive.signatures where signature_id = ${String(s['signature_id'])}::uuid`);
    expect(new SignatureService().verify(sig as never)).toBe(true);
  });
});

describe('SA8 · cross-tenant', () => {
  it('another tenant\'s administrator cannot reach this domain (scope 403) and its own context finds no grant of this one (404)', async () => {
    const U = uuidv7(); const DU = uuidv7();
    await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b94sa-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
    await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b94sa-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
    const id = uuidv7();
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, 'human', 'DOMAIN', ${U}::uuid, ${DU}::uuid, ${`b94sa-other-admin-${RUN} (SYNTHETIC)`}, ${`b94sa-oa-${id.slice(-8)}`}, 'active')`.execute(h.su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, 'domain_admin', 'DOMAIN', ${U}::uuid, ${DU}::uuid)`.execute(h.su);
    const other = await h.openSession({ ...h.manager, principalId: id, kind: 'human', homeScope: 'DOMAIN', homeTenantId: U, homeDomainId: DU,
      bindings: [{ roleCode: 'domain_admin', scope: 'DOMAIN', tenantId: U, domainId: DU }] } as AuthenticatedPrincipal);
    const own = (action: string, gid: string) => ({ eyeEnvelope: { ...(h.env(other, action, 'SGR', gid, PURPOSE) as unknown as Row), tenant_id: U, domain_id: DU }, eyePrincipal: other }) as never;
    await refused(sc.revokeGrant(rq(other, 'service.grant.revoke', 'SGR', G1), T(), D(), G1, { payload: { reason: 'reaching into another tenant' } }), /./, 403);
    await refused(sc.revokeGrant(own('service.grant.revoke', G1), U, DU, G1, { payload: { reason: 'reaching into another tenant' } }), /^support grant rejected \(unknown_grant\)/, 404);
    await refused(sc.preview(own('service.read', G1), U, DU, G1), /^support grant rejected \(unknown_grant\)/, 404);
    const cc = await sc.controlCenter(own('service.read', ''), U, DU, { payload: {} }) as Row;
    expect(cc['grants']).toEqual([]); expect(cc['matrices']).toEqual([]);
  });
});

describe('SA9 · replay: the ledger reconstructs every grant and the matrix', () => {
  it('each grant\'s last ledger event names its state; the matrix\'s history reads proposed → approved → proposed → approved', async () => {
    const grants = await rows(sql`select grant_id::text, state from service.support_grants where tenant_id = ${T()}::uuid`);
    expect(grants.length).toBeGreaterThanOrEqual(6);
    for (const g of grants) {
      const ev = await events(String(g['grant_id']));
      expect(ev[0]).toBe('grant.requested');
      const last = ev.filter((e) => e !== 'grant.held').at(-1);
      expect(last, `${String(g['grant_id'])}: ${ev.join(' → ')}`).toBe(g['state'] === 'requested' ? 'grant.requested' : `grant.${String(g['state'])}`);
    }
    expect(await events(MATRIX)).toEqual(['matrix.proposed', 'matrix.approved', 'matrix.proposed', 'matrix.approved']);
    // the access log is append-only
    await expect(sql`delete from service.access_log where grant_id = ${G1}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
  });
});

describe('SA10 · the customer control center (CAP-TR-12)', () => {
  it('the matrix and its owners (gaps visible), grants, the access log, drills, exercises, admissions, residency and the links — read by the owner', async () => {
    const cc = await control(richter);
    expect((cc['approved'] as Row)['version']).toBe(2);
    expect((cc['owners'] as Row[]).map((o) => [o['responsibility_key'], (o['resolution'] as Row)['state']])).toEqual([['domain.operation', 'resolved'], ['evidence.custody', 'resolved'], ['risk.ownership', 'resolved'], ['support.access', 'resolved']]);
    expect(cc['support_access_owner']).toMatchObject({ state: 'resolved', owner_principal_id: richter.principalId });
    expect((cc['grants'] as Row[]).map((g) => g['state'])).toEqual(expect.arrayContaining(['lapsed', 'revoked', 'withdrawn', 'denied']));
    expect((cc['access_log'] as Row[]).length).toBeGreaterThan(0);
    expect((cc['drills'] as Row[]).length).toBe(2);
    expect((cc['admissions'] as Row[])[0]).toMatchObject({ state: 'signed' });
    expect(cc['residency']).toMatchObject({ domain_status: 'active' });
    expect((cc['links'] as Row)['exports']).toMatchObject({ action: 'retention.read' });
    expect(String(cc['boundary'])).toMatch(/R1/);
    expect(svc.verifySignature({ key_id: 'ed25519:0000000000000000', signature: 'x', subject_digest: 'y' })).toBe(false);
  });
});
