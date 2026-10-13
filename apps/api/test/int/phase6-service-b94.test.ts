/**
 * CP-6 B94 §SV (migration 0114_b94_x_sv) — THE SERVICE PORTAL, on a real database through the real pipeline, ports, controllers and
 * attention ticks (F-P7-F-06: PR-69-001, PR-69-002, PR-69-005, PR-69-006, CAP-DL-09, CAP-DL-10, AT-69; carryover a — premium support routed
 * from the tenant's LIVE licence, case opening never licence-gated).
 *
 * AT-69's fixture classes: POSITIVE (the case lifecycle, the bundle, the workaround the customer executes, the closure the customer
 * confirms, the problem / known error / change, the value review), NEGATIVE (bad inputs, wrong states), STALE (a version or a digest the act
 * did not read → 409), UNAUTHORIZED ROLE (support closing a case or executing a workaround; an agent opening one; the proposer deciding a
 * change; the recorder acknowledging a review), CROSS-TENANT (another tenant's principal and route), CORRECTION (a re-grade, a reopen, a
 * new bundle), REPLAY (the ledger reconstructs the case), and THE FAULT EXERCISE: an SLA breach DRILL escalated by a real tick; a real
 * response breach escalated BY SEVERITY (S2 routed, S4 deprioritized); a missed commitment swept by the after-tick hook `service-sla`; a
 * regression reopening a closed case; known-error reuse on a new case; a support engineer's act without a live grant REFUSED AND LOGGED
 * (the log committed); premium vs standard routing from the live licence, and a case opened on a tenant without premium_support (and on
 * one in grace) still admitted.
 *
 * Support grants are §SA's (another part): this harness PLANTS approved grants by the superuser (stated), as phase6-prelude-b94 does. Time
 * travel is planted the same way (an objective's due instant moved into the past and its timer scheduled at it — stated where used).
 * Every tenant, persona, source, case, licence and figure here is SYNTHETIC. This proves CONSTRUCTION; demonstrated operation is the act's;
 * real customer acceptance (AT-69, PR-69-006, joint value review) is R2.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { ServicePortalController } from '../../src/delivery/service/service.controller.js';
import { SLA_HOOK } from '../../src/delivery/service/service.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import type { EntitlementsVendorController } from '../../src/commercial/entitlements/entitlements.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let sv: ServicePortalController; let exec: ExecutiveController; let vapi: EntitlementsVendorController; let timer: AttentionTimerService;
let T = ''; let D = ''; let P = ''; let DP = '';
const RUN = uuidv7().slice(-6);

let manager: AuthenticatedPrincipal;   // the collection manager (the M. Dvorak of the scene): opens, executes the workaround, confirms closure
let dadmin: AuthenticatedPrincipal; let dadmin2: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let engineer: AuthenticatedPrincipal; let engineer2: AuthenticatedPrincipal; let agentCustomer: AuthenticatedPrincipal;
let plain: AuthenticatedPrincipal; let manager2: AuthenticatedPrincipal; let dualRole: AuthenticatedPrincipal; let vendor: AuthenticatedPrincipal; let pManager: AuthenticatedPrincipal; let pAdmin: AuthenticatedPrincipal;
let agentId = '';
let SRC = ''; let SRC2 = ''; let SRCR = '';

// ── envelopes and refusals ───────────────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null, purpose = 'service'): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: 'service_case', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b94-sv',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, t = T, d = D) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;
const vreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null, 'commercial'), eyePrincipal: p }) as never;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const raw = e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? '') : (e instanceof Error ? e.message : String(e));
  return { status: mapped.getStatus(), message: raw };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

// ── the routes (in process) ──────────────────────────────────────────────────────────────────────
type CaseOut = { case: Row; routing?: Row; item?: Row; grant_id?: string | null; closure_task?: Row | null; receipt: Row };
const open = (as: AuthenticatedPrincipal, payload: Row, t = T, d = D) => sv.open(rq(as, 'service.case.open', t, d), t, d, { payload }) as unknown as Promise<CaseOut>;
const read = (as: AuthenticatedPrincipal, id: string, t = T, d = D) => sv.read(rq(as, 'service.read', t, d), t, d, id) as unknown as Promise<Row & { case: Row; sla: Row[]; ledger: Row[]; bundles: Row[]; timers: Row[]; tasks: Row[]; items: Row[]; access_log: Row[]; breaches: Row[]; notes: Row[] }>;
const triage = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.triage(rq(as, 'service.case.triage'), T, D, id, { payload }) as unknown as Promise<CaseOut>;
const note = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.note(rq(as, 'service.case.note'), T, D, id, { payload }) as unknown as Promise<{ note: Row; grant_id: string | null }>;
const progress = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.progress(rq(as, 'service.case.progress'), T, D, id, { payload }) as unknown as Promise<CaseOut>;
const propose = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.proposeWorkaround(rq(as, 'service.case.workaround.propose'), T, D, id, { payload }) as unknown as Promise<CaseOut>;
const execute = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.executeWorkaround(rq(as, 'service.case.workaround.execute'), T, D, id, { payload }) as unknown as Promise<CaseOut>;
const reuse = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.reuse(rq(as, 'service.case.known_error.reuse'), T, D, id, { payload }) as unknown as Promise<CaseOut & { known_error: Row }>;
const bundle = (as: AuthenticatedPrincipal, id: string) => sv.bundle(rq(as, 'service.case.bundle'), T, D, id) as unknown as Promise<{ bundle: Row & { items: Row[]; counts: Row }; grant_id: string | null }>;
const close = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.close(rq(as, 'service.case.close'), T, D, id, { payload }) as unknown as Promise<CaseOut & { tasks: Row; items_closed: string[] }>;
const reopen = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.reopen(rq(as, 'service.case.reopen'), T, D, id, { payload }) as unknown as Promise<CaseOut>;
const supportRead = (as: AuthenticatedPrincipal, id: string) => sv.supportRead(rq(as, 'service.case.support_read'), T, D, id) as unknown as Promise<Row & { case: Row; grant_id: string }>;
const commit = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.commit(rq(as, 'service.commitment.record'), T, D, id, { payload }) as unknown as Promise<{ commitment: Row }>;
const settle = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.settle(rq(as, 'service.commitment.settle'), T, D, id, { payload }) as unknown as Promise<{ commitment: Row }>;
const drill = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.drill(rq(as, 'service.sla.drill'), T, D, id, { payload }) as unknown as Promise<{ drill: Row }>;
const openProblem = (as: AuthenticatedPrincipal, payload: Row) => sv.openProblem(rq(as, 'service.problem.open'), T, D, { payload }) as unknown as Promise<{ problem: Row }>;
const linkProblem = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.link(rq(as, 'service.problem.link'), T, D, id, { payload }) as unknown as Promise<{ problem: Row }>;
const publishKe = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.publish(rq(as, 'service.problem.known_error'), T, D, id, { payload }) as unknown as Promise<{ known_error: Row }>;
const closeProblem = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.closeProblem(rq(as, 'service.problem.close'), T, D, id, { payload }) as unknown as Promise<{ problem: Row; known_errors_retired: number }>;
const proposeChange = (as: AuthenticatedPrincipal, payload: Row) => sv.proposeChange(rq(as, 'service.change.propose'), T, D, { payload }) as unknown as Promise<{ change: Row }>;
const decideChange = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.decideChange(rq(as, 'service.change.decide'), T, D, id, { payload }) as unknown as Promise<{ change: Row }>;
const recordChange = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.recordChange(rq(as, 'service.change.record'), T, D, id, { payload }) as unknown as Promise<{ change: Row }>;
const success = (as: AuthenticatedPrincipal) => sv.success(rq(as, 'service.read'), T, D) as unknown as Promise<{ success: Row; inputs_digest: string; inputs: Row }>;
const recordReview = (as: AuthenticatedPrincipal, payload: Row) => sv.recordReview(rq(as, 'service.value_review.record'), T, D, { payload }) as unknown as Promise<{ review: Row }>;
const decideReview = (as: AuthenticatedPrincipal, id: string, payload: Row) => sv.decideReview(rq(as, 'service.value_review.acknowledge'), T, D, id, { payload }) as unknown as Promise<{ review: Row }>;

/** One tick of the domain's attention agent (the timer host's own path), standing for its own instant. */
let slot = 0;
const tick = async () => {
  const o = await timer.tickNow({ tenantId: T, domainId: D, agentId, scheduledAt: new Date(Date.UTC(2035, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return { steps: (o.run?.outputs['steps'] ?? {}) as Record<string, Row>, after: (o.run?.outputs['after'] ?? {}) as Record<string, Row> };
};

// ── fixtures (SYNTHETIC; the superuser plants what another part's ports would write — stated) ──────
async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope; domain?: string | null }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b94-sv-${label}-${RUN} (SYNTHETIC)`}, ${`b94sv-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? (r.domain ?? d) : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}
/** An APPROVED support grant as §SA's grant.decide would write it (planted by the superuser — §SA's ports are another part's). */
async function plantGrant(eng: AuthenticatedPrincipal, caseId: string, sources: string[], actions: string[], minutes = 240): Promise<string> {
  const id = uuidv7();
  await sql`insert into service.support_grants (grant_id, tenant_id, domain_id, case_id, engineer_principal_id, purpose, object_scope, action_scope, duration_minutes, state, decided_by, decided_at,
              starts_at, expires_at, correlation_id)
            values (${id}::uuid, ${T}::uuid, ${D}::uuid, ${caseId}::uuid, ${eng.principalId}::uuid, 'diagnose the stalled corridor feed for the case (SYNTHETIC)', ${JSON.stringify({ sources })}::jsonb,
                    ${actions}::text[], ${minutes}, 'approved', ${dadmin.principalId}::uuid, clock_timestamp(), clock_timestamp() - interval '1 minute',
                    clock_timestamp() + make_interval(mins => ${minutes}), ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
/** A governed act of the customer on their own domain (the source transition the workaround names) — its receipt's policy decision. */
async function customerTransition(as: AuthenticatedPrincipal, sourceId: string, target: 'suspended' | 'active'): Promise<string> {
  const action = 'observation.source.transition';
  const out = await h.pipeline.write(h.env(as, action, 'SRC', sourceId), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
    async (cap) => {
      await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T, domainId: D, target, reason: `B94 §SV workaround: the customer's own transition to ${target} (SYNTHETIC)`, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
    });
  return out.policyDecisionId;
}
const caseOf = async (id: string) => one(sql`select * from service.cases where case_id = ${id}::uuid`);
const logOf = async (principal: string, outcome: 'allowed' | 'refused') =>
  rows(sql`select action, object_kind, object_id, outcome, grant_id::text, detail from service.access_log where principal_id = ${principal}::uuid and outcome = ${outcome} order by at`);
const caseBody = (title: string, severity: string, objects: Row[] = [{ kind: 'source', id: SRC }]) =>
  ({ title: `${title} (SYNTHETIC)`, severity, capability: 'observation', objects, description: `${title}: the feed stopped delivering after the morning run (SYNTHETIC stall)` });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId; SRC = h.fx.sourceId;
  sv = h.app.get(ServicePortalController); timer = h.app.get(AttentionTimerService);
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { EntitlementsVendorController: V } = await import('../../src/commercial/entitlements/entitlements.controller.js');
  exec = h.app.get(Ec); vapi = h.app.get(V);
  manager = h.manager;
  dadmin = await h.humanWithSession(['domain_admin'], 'sv-dadmin');
  dadmin2 = await h.humanWithSession(['domain_admin'], 'sv-dadmin-2');
  executive = await h.humanWithSession(['executive'], 'sv-executive');
  steward = await h.humanWithSession(['data_steward'], 'sv-steward');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'sv-tadmin', 'TENANT');
  engineer = await h.humanWithSession(['support_engineer'], 'sv-engineer');
  engineer2 = await h.humanWithSession(['support_engineer'], 'sv-engineer-2');
  plain = await h.humanWithSession([], 'sv-plain');
  manager2 = await h.humanWithSession(['collection_manager'], 'sv-manager-2');
  dualRole = await h.humanWithSession(['support_engineer', 'collection_manager'], 'sv-dual-role');
  agentCustomer = await person('agent', 'agent', 'DOMAIN', T, D, [{ role: 'collection_manager', scope: 'DOMAIN' }]);
  vendor = await person('vendor', 'human', 'PLATFORM', null, null, [{ role: 'commercial_authority', scope: 'PLATFORM' }]);
  SRC2 = await h.uploadSource('internal', 'sv-workaround');
  SRCR = await h.uploadSource('restricted', 'sv-restricted');
  // THE PREMIUM TENANT P (fixture scaffolding, seeded directly): its own domain and customers — licensed below through the vendor's routes
  P = uuidv7(); DP = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${P}::uuid, ${'b94-sv-premium-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DP}::uuid, ${P}::uuid, ${'b94-sv-premium-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  pManager = await person('pmgr', 'human', 'DOMAIN', P, DP, [{ role: 'collection_manager', scope: 'DOMAIN' }]);
  pAdmin = await person('padmin', 'human', 'DOMAIN', P, DP, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  // the attention policy of T for the service class: routed to the domain admin, material from C2 (an S4 signal is C1 — deprioritized, listed)
  await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T, D, { payload: {
    reason: 'B94 §SV harness: service cases to the domain admin, escalated to the executive',
    rules: { classes: {
      'service.case': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 100 } } } as never });
  // THE ATTENTION AGENT whose ticks fire the SLA timers and run the after-tick hook (the B24 timer host; the ticks are tickNow's)
  const a = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try { if (agentId !== '') await exec.revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T, D, agentId, { payload: { reason: 'the B94 service harness is done' } }); } catch { /* revoked */ }
  await h?.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('R · carryover a — premium support ROUTED from the live licence; case opening NEVER licence-gated', () => {
  const PKG = { plain: `sv-core-${RUN}`, premium: `sv-premium-${RUN}` };
  const SKU = { plain: `EYE-SVC-${RUN}`.toUpperCase(), premium: `EYE-SVP-${RUN}`.toUpperCase() };
  const issue = (sku: string, n: string) => vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), P, { payload: { skuCode: sku, orderRef: `SYNTH-ORDER-${RUN}-${n}`, reason: 'the synthetic licence of the service harness' } }) as Promise<{ licence: Row }>;
  const openP = (sev: string) => open(pManager, { title: `Premium tenant stall ${sev} (SYNTHETIC)`, severity: sev, capability: 'observation', objects: [], description: 'the corridor feed of the premium tenant stalled (SYNTHETIC)' }, P, DP);

  it('premium_support v2 is built with NO action prefix; `service.case.open` is uncatalogued — no licence can make it unavailable', async () => {
    const cap = await one(sql`select version, built, action_prefixes, status from commercial.capabilities where capability_key = 'premium_support' and status = 'active'`);
    expect(cap).toMatchObject({ built: true, action_prefixes: [], status: 'active' });
    const g = (await one(sql`select commercial.capability_available(${P}::uuid, 'service.case.open') as a`))['a'] as Row;
    expect(g).toMatchObject({ available: true, capability: null });
  });
  it('POSITIVE (uncontracted): a case opens with STANDARD routing, the reason stated, standard S2 objectives (240 / 2880 min)', async () => {
    const r = await openP('S2');
    expect(r.case).toMatchObject({ state: 'open', severity: 'S2', version: 1, case_ref: expect.stringMatching(/^CASE-\d{4}$/) });
    expect(r.routing).toMatchObject({ tier: 'standard', licence: null, named_support: null, objectives: { response_minutes: 240, resolution_minutes: 2880 }, reason: expect.stringMatching(/^uncontracted/) });
  });
  it('a licence WITHOUT premium_support → standard, the licence version recorded; opening still admitted', async () => {
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PKG.plain, expectedVersion: 0, title: 'Service harness core (SYNTHETIC)', capabilities: [], tier: 'foundation', reason: 'a package without premium support' } });
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PKG.premium, expectedVersion: 0, title: 'Service harness premium (SYNTHETIC)', capabilities: ['premium_support'], tier: 'foundation', reason: 'a package with premium support' } });
    await vapi.declareSku(vreq(vendor, 'commercial.offer.sku'), { payload: { code: SKU.plain, expectedVersion: 0, title: 'Core 12 months', packageKey: PKG.plain, termMonths: 12, reason: 'a twelve-month synthetic term' } });
    await vapi.declareSku(vreq(vendor, 'commercial.offer.sku'), { payload: { code: SKU.premium, expectedVersion: 0, title: 'Premium 12 months', packageKey: PKG.premium, termMonths: 12, reason: 'a twelve-month synthetic term' } });
    const l = await issue(SKU.plain, '1');
    const r = await openP('S2');
    expect(r.routing).toMatchObject({ tier: 'standard', licence: { version: l.licence['version'], premium_listed: false }, reason: expect.stringMatching(/premium_support is not in licence v\d+/) });
  });
  it('POSITIVE (premium): the licence reissued WITH premium_support → premium: named support (the contract\'s named contact), premium S2 objectives (30 / 480 min)', async () => {
    const l = await issue(SKU.premium, '2');
    await vapi.declareContract(vreq(vendor, 'commercial.contract.declare'), P, { payload: { contractRef: `SYNTH-SV-CONTRACT-${RUN}`, reason: 'the synthetic contract of the service harness', scope: {
      decision_cells: [DP], sources: [], twins: [], authorities: [{ role: 'domain_admin', principal_id: pAdmin.principalId }], environments: ['local-dev'],
      support_boundary: { tier: 'premium', statement: 'Premium support, named contact (SYNTHETIC).', named_contact: 'SYNTHETIC premium desk — the named support engineer of the account' } } } });
    const r = await openP('S2');
    expect(r.routing).toMatchObject({ tier: 'premium', licence: { version: l.licence['version'], state: 'active', premium_listed: true }, capability: { key: 'premium_support', built: true, prefixes: [] },
      objectives: { response_minutes: 30, resolution_minutes: 480 }, named_support: 'SYNTHETIC premium desk — the named support engineer of the account', contract: { support_tier: 'premium', descriptive: true } });
    const c = await one(sql`select extract(epoch from response_due_at - opened_at)::int as r, extract(epoch from resolution_due_at - opened_at)::int as s from service.cases where case_id = ${String(r.case['case_id'])}::uuid`);
    expect(c).toEqual({ r: 30 * 60, s: 480 * 60 });
    const s1 = await openP('S1');
    expect(s1.routing).toMatchObject({ tier: 'premium', objectives: { response_minutes: 15, resolution_minutes: 240 } });
  });
  it('NEGATIVE: the licence in GRACE (stand-in for §GR\'s transition, written directly) → standard ("never inferred"), the case still opened; premium never buys a gate', async () => {
    await sql`update commercial.licences set state = 'grace', grace_until = clock_timestamp() + interval '7 days', state_changed_at = clock_timestamp() where tenant_id = ${P}::uuid and state = 'active'`.execute(h.su);
    const r = await openP('S3');
    expect(r.routing).toMatchObject({ tier: 'standard', reason: expect.stringMatching(/lists premium_support but is grace — premium routing is never inferred/) });
    await sql`update commercial.licences set state = 'suspended', state_changed_at = clock_timestamp() where tenant_id = ${P}::uuid and state = 'grace'`.execute(h.su);
    expect((await openP('S4')).routing).toMatchObject({ tier: 'standard' });
    await sql`update commercial.licences set state = 'active', grace_until = null, state_changed_at = clock_timestamp() where tenant_id = ${P}::uuid and state = 'suspended'`.execute(h.su);
    expect((await openP('S2')).routing).toMatchObject({ tier: 'premium' });
  });
  it('the routing preview reads the same live licence for every severity', async () => {
    const r = await sv.policies(rq(pAdmin, 'service.read', P, DP), P, DP) as { routing: Record<string, Row>; policies: Row[]; governance: string };
    expect(Object.keys(r.routing).sort()).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(r.routing['S4']).toMatchObject({ tier: 'premium', objectives: { response_minutes: 480 } });
    expect(r.policies).toHaveLength(8);
    expect(r.governance).toMatch(/never licence-gated/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('L · the case lifecycle (PR-69-001/002/005): open → triage → support under a grant → bundle → workaround the CUSTOMER executes → resolve → the CUSTOMER confirms closure', () => {
  let C = ''; let G = ''; let bundleDigest = '';
  it('POSITIVE: the collection manager opens an S2 case on the corridor source — routed (standard: T is uncontracted), both SLA timers scheduled, a `service.case` item routed to the domain admin', async () => {
    const r = await open(manager, caseBody('Stalled corridor feed', 'S2', [{ kind: 'source', id: SRC }, { kind: 'source', id: SRCR }]));
    C = String(r.case['case_id']);
    expect(r.case).toMatchObject({ state: 'open', version: 1, opened_by: manager.principalId, routing: { tier: 'standard' } });
    expect((r.case['object_refs'] as Row[]).map((o) => o['kind'])).toEqual(['source', 'source']);
    const timers = await rows(sql`select kind, owner_kind, fired_at, cancelled_at from executive.workflow_timers where owner_id = ${C}::uuid order by kind`);
    expect(timers).toEqual([{ kind: 'sla.resolution', owner_kind: 'service_case', fired_at: null, cancelled_at: null }, { kind: 'sla.response', owner_kind: 'service_case', fired_at: null, cancelled_at: null }]);
    expect(r.item).toMatchObject({ state: 'open', outcome: 'material', route_roles: ['domain_admin'], existing: false });
    const v = await read(dadmin, C);
    expect(v.sla).toEqual([expect.objectContaining({ objective: 'response', state: 'running' }), expect.objectContaining({ objective: 'resolution', state: 'running' })]);
    expect(v.ledger.map((e) => e['event'])).toEqual(['case.opened']);
  });
  it('NEGATIVE: bad inputs are refused in the class form (severity, objects of another domain, a description)', async () => {
    await refused(open(manager, { ...caseBody('Bad severity', 'S9') }), /^service case rejected \(severity\)/, 422);
    await refused(open(manager, caseBody('Unknown source', 'S2', [{ kind: 'source', id: uuidv7() }])), /^service case rejected \(unknown_object\)/, 404);
    await refused(open(manager, { ...caseBody('Short', 'S2'), description: 'x' }), /^service case rejected \(description\)/, 422);
  });
  it('UNAUTHORIZED: an agent holding a customer role (actor) · a human without a role (PDP) · a support engineer (PDP: support never opens the customer\'s case)', async () => {
    await refused(open(agentCustomer, caseBody('Agent case', 'S3')), /^service case rejected \(actor\): opening a case is a named human's act/, 403);
    expect((await refusal(open(plain, caseBody('Plain', 'S3')))).status).toBe(403);
    expect((await refusal(open(engineer, caseBody('Engineer case', 'S3')))).status).toBe(403);
  });
  it('POSITIVE: the domain admin triages (the response objective met; its timer cancelled); STALE: an act naming version 1 after it → 409', async () => {
    const r = await triage(dadmin, C, { expectedVersion: 1, note: 'assessed: the morning run failed; support access will be needed (SYNTHETIC)' });
    expect(r.case).toMatchObject({ state: 'triaged', version: 2, triaged_by: dadmin.principalId });
    expect((await one(sql`select cancelled_at is not null as c from executive.workflow_timers where owner_id = ${C}::uuid and kind = 'sla.response'`))['c']).toBe(true);
    await refused(progress(dadmin, C, { expectedVersion: 1, to: 'awaiting_access', statement: 'support needs access to the source (SYNTHETIC)' }), /^service case rejected \(stale\): case CASE-\d+ is at version 2/, 409);
    expect((await read(dadmin, C)).sla).toEqual(expect.arrayContaining([expect.objectContaining({ objective: 'response', state: 'met' })]));
  });
  it('THE FAULT — support WITHOUT a live grant: the support read, a note, a bundle are REFUSED (access) AND LOGGED — the log rows committed with the refusal', async () => {
    const before = (await logOf(engineer.principalId, 'refused')).length;
    await refused(supportRead(engineer, C), /^support access rejected \(access\): reading a case needs a live support grant for case CASE-\d+ covering case\.note — no grant was ever requested for it \(the attempt is logged\)/, 403);
    await refused(note(engineer, C, { kind: 'diagnosis', body: 'looking at the runs (SYNTHETIC)' }), /^service case rejected \(access\)/, 403);
    await refused(bundle(engineer, C), /^evidence bundle rejected \(access\)/, 403);
    const after = await logOf(engineer.principalId, 'refused');
    expect(after.length - before).toBe(3);
    expect(after.slice(-3).map((l) => l['action'])).toEqual(['case.note', 'case.note', 'case.bundle']);
    expect(after.every((l) => l['grant_id'] === null)).toBe(true);
    // the pipeline's audit of the refused write is a FAILURE (not a success)
    const aud = await one(sql`select count(*)::int n from audit.audit_events where action = 'service.case.bundle' and outcome = 'failure' and actor like ${`%${engineer.principalId}`}`);
    expect(Number(aud['n'])).toBeGreaterThanOrEqual(1);
  });
  it('the domain admin marks the case awaiting access; then a grant (planted — §SA approves it) admits support: the support read and a diagnosis note, each LOGGED with the grant', async () => {
    await progress(dadmin, C, { expectedVersion: 2, to: 'awaiting_access', statement: 'support needs read access to the corridor source (SYNTHETIC)' });
    G = await plantGrant(engineer, C, [SRC], ['diagnose.source', 'diagnose.runs', 'case.note', 'case.bundle', 'case.workaround']);
    const s = await supportRead(engineer, C);
    expect(s).toMatchObject({ grant_id: G, case: { case_ref: expect.any(String), state: 'awaiting_access' } });
    expect(JSON.stringify(s['case'])).not.toMatch(/opened_by/);
    const n = await note(engineer, C, { kind: 'diagnosis', body: 'the scheduler skipped the morning slot after a publisher timeout (SYNTHETIC)' });
    expect(n).toMatchObject({ grant_id: G, note: { side: 'support', kind: 'diagnosis', grant_id: G } });
    const allowed = await logOf(engineer.principalId, 'allowed');
    expect(allowed.map((l) => [l['action'], l['grant_id']])).toEqual([['case.note', G], ['case.note', G]]);
    const r = await progress(engineer, C, { expectedVersion: 3, to: 'diagnosing', statement: 'diagnosing the scheduler under the grant (SYNTHETIC)' });
    expect(r).toMatchObject({ grant_id: G, case: { state: 'diagnosing', version: 4 } });
  });
  it('THE EVIDENCE BUNDLE: support\'s is limited to the grant\'s object scope (the restricted source WITHHELD and logged), evidence content always WITHHELD, persons and endpoints REDACTED; digested', async () => {
    const b = await bundle(engineer, C);
    expect(b.bundle).toMatchObject({ side: 'support', grant_id: G, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const items = b.bundle.items;
    const kinds = items.map((i) => `${String(i['kind'])}:${String(i['disposition'])}`);
    expect(kinds).toEqual(expect.arrayContaining(['case:included', 'notes:included', 'source.contract:redacted', 'source.runs:redacted', 'source.health:included', 'source.evidence:withheld', 'source:withheld']));
    expect(items.find((i) => i['kind'] === 'source' && i['id'] === SRCR)).toMatchObject({ disposition: 'withheld', reason: expect.stringMatching(/outside the support grant's object scope/) });
    expect(items.find((i) => i['kind'] === 'source.evidence')).toMatchObject({ reason: expect.stringMatching(/never in a support bundle/) });
    expect(JSON.stringify(items)).not.toMatch(new RegExp(manager.principalId));
    expect(b.bundle.counts).toMatchObject({ withheld: 2 });
    expect((await logOf(engineer.principalId, 'refused')).at(-1)).toMatchObject({ action: 'case.bundle', object_id: SRCR });
    bundleDigest = String(b.bundle['digest']);
    // the customer's bundle (the domain admin): the whole case scope — the restricted source's name REDACTED, never withheld for scope
    const cb = await bundle(dadmin, C);
    expect(cb.bundle).toMatchObject({ side: 'customer', grant_id: null });
    const restricted = cb.bundle.items.find((i) => i['kind'] === 'source.contract' && i['id'] === SRCR) as Row;
    expect(restricted['content']).toMatchObject({ name: '[redacted: restricted classification]', classification_ceiling: 'restricted' });
    expect(cb.bundle['digest']).not.toBe(bundleDigest);
  });
  it('THE WORKAROUND: support proposes the customer\'s act; support can never record its execution (actor); the CUSTOMER performs the governed act and links its receipt', async () => {
    const w = await propose(engineer, C, { expectedVersion: 4, steps: 'suspend the stalled upload source and re-activate it to reset the schedule (SYNTHETIC)',
      act: { action: 'observation.source.transition', object_type: 'SRC', object_id: SRC2 }, risk: 'collection pauses for a minute' });
    expect(w.case).toMatchObject({ state: 'workaround_offered', version: 5, workaround: { source: 'proposal', side: 'support', act: { action: 'observation.source.transition' }, executor: "the customer's own role" } });
    await refused(propose(dadmin, C, { expectedVersion: 5, steps: 'a service act as a workaround (SYNTHETIC)', act: { action: 'service.case.close' } }), /^service case rejected \(state\)/, 409);
    const decision = await customerTransition(manager, SRC2, 'suspended');
    await customerTransition(manager, SRC2, 'active');
    expect((await refusal(execute(engineer, C, { expectedVersion: 5, policyDecisionId: decision }))).status).toBe(403);   // the PDP: support holds no customer role
    // the PORT re-checks: a support engineer who ALSO holds a customer role is still support (the stricter reading)
    await refused(execute(dualRole, C, { expectedVersion: 5, policyDecisionId: decision }), /^service case rejected \(actor\): executing a workaround is the customer's own act/, 403);
    const other = await customerTransition(manager2, SRC2, 'suspended'); await customerTransition(manager2, SRC2, 'active');
    await refused(execute(manager, C, { expectedVersion: 5, policyDecisionId: other }), /^service case rejected \(ownership\)/, 403);
    await refused(execute(manager, C, { expectedVersion: 5, policyDecisionId: uuidv7() }), /^service case rejected \(unknown_decision\)/, 404);
    const x = await execute(manager, C, { expectedVersion: 5, policyDecisionId: decision, note: 'the feed delivered again after the reset (SYNTHETIC)' });
    expect(x.case).toMatchObject({ version: 6, workaround_executed: { policy_decision_id: decision, action: 'observation.source.transition', executed_by: manager.principalId } });
  });
  it('a COMMITMENT (support, under the grant): open commitments hold the closure (409) until settled', async () => {
    const m = await commit(engineer, C, { kind: 'fix', statement: 'a scheduler fix is delivered within the week (SYNTHETIC)', dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect(m.commitment).toMatchObject({ state: 'open', side: 'support', kind: 'fix' });
    const r = await progress(engineer, C, { expectedVersion: 6, to: 'resolved', statement: 'the schedule was reset and the feed delivers; a permanent fix is committed (SYNTHETIC)' });
    expect(r.case).toMatchObject({ state: 'resolved', version: 7, resolved_by: engineer.principalId });
    expect(r.closure_task).toMatchObject({ state: 'open', repeated: false });
    const task = await one(sql`select assignee_principal_id::text a, kind, state from executive.human_tasks where task_id = ${String((r.closure_task as Row)['task_id'])}::uuid`);
    expect(task).toEqual({ a: manager.principalId, kind: 'service.closure_confirm', state: 'open' });
    await refused(close(manager, C, { expectedVersion: 7, outcome: 'resolved', note: 'the feed delivers again (SYNTHETIC)' }), /^service case rejected \(state\): case CASE-\d+ has unsettled commitments — fix \(open/, 409);
    await settle(engineer, String(m.commitment['commitment_id']), { outcome: 'met', note: 'the scheduler fix is deployed and verified (SYNTHETIC)' });
  });
  it('CLOSURE is the CUSTOMER\'s confirmation: support (PDP) and an agent are refused; the opener confirms — the task completed, the case\'s items closed, no timer left pending', async () => {
    expect((await refusal(close(engineer, C, { expectedVersion: 7, outcome: 'resolved', note: 'support closes it (SYNTHETIC)' }))).status).toBe(403);
    expect((await refusal(close(agentCustomer, C, { expectedVersion: 7, outcome: 'resolved', note: 'an agent closes it (SYNTHETIC)' }))).status).toBe(403);
    await refused(close(manager, C, { expectedVersion: 7, outcome: 'not_reproduced', note: 'wrong outcome (SYNTHETIC)' }), /^service case rejected \(state\)/, 409);
    const r = await close(manager, C, { expectedVersion: 7, outcome: 'resolved', note: 'verified: the feed delivered three runs in a row (SYNTHETIC)' });
    expect(r.case).toMatchObject({ state: 'closed', version: 8, closed_by: manager.principalId, closure: { outcome: 'resolved', confirmation: "the customer's", resolution_met: true } });
    expect(r.tasks).toMatchObject({ resolved: 1 });
    expect(r.items_closed.length).toBeGreaterThanOrEqual(1);
    expect((await one(sql`select count(*)::int n from executive.workflow_timers where owner_id = ${C}::uuid and fired_at is null and cancelled_at is null`))['n']).toBe(0);
    await refused(note(manager, C, { body: 'a note on a closed case (SYNTHETIC)' }), /^service case rejected \(state\): case CASE-\d+ is closed/, 409);
  });
  it('THE FAULT — a REGRESSION reopens the closed case: triaged again, counted, the resolution objective restarted (a new timer), a regression item raised', async () => {
    await refused(reopen(manager, C, { expectedVersion: 8, regression: 'short' }), /^service case rejected \(regression\)/, 422);
    const r = await reopen(manager, C, { expectedVersion: 8, regression: 'the feed stalled again the next morning (SYNTHETIC regression)' });
    expect(r.case).toMatchObject({ state: 'triaged', version: 9, reopen_count: 1, closed_at: null });
    expect(r.item).toMatchObject({ existing: false, state: 'open' });
    const pending = await rows(sql`select kind from executive.workflow_timers where owner_id = ${C}::uuid and fired_at is null and cancelled_at is null`);
    expect(pending).toEqual([{ kind: 'sla.resolution' }]);
  });
  it('REPLAY: the ledger reconstructs the case — every act in order, each version recorded once', async () => {
    const v = await read(dadmin, C);
    const caseEvents = v.ledger.filter((e) => e['subject_kind'] === 'service_case');
    expect(v.ledger.filter((e) => e['subject_kind'] === 'commitment').map((e) => e['event'])).toEqual(['commitment.recorded', 'commitment.met']);
    expect(caseEvents.map((e) => e['event'])).toEqual(['case.opened', 'case.triaged', 'case.awaiting_access', 'case.noted', 'case.diagnosing', 'case.bundle_assembled', 'case.bundle_assembled',
      'case.workaround_offered', 'case.workaround_executed', 'case.resolved', 'case.closed', 'case.reopened']);
    const versions = caseEvents.filter((e) => !['case.noted', 'case.bundle_assembled'].includes(String(e['event']))).map((e) => Number(e['version']));
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(v.bundles).toHaveLength(2);
    expect(v.access_log.length).toBeGreaterThanOrEqual(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('K · problems, KNOWN-ERROR REUSE on a new case, changes linked to problems (PR-69-005/006)', () => {
  let C1 = ''; let C2 = ''; let PRB = ''; let KE = ''; let CHG = '';
  it('POSITIVE: a problem explains a case; its known error published (digested)', async () => {
    C1 = String((await open(manager, caseBody('Scheduler skip after timeout', 'S3'))).case['case_id']);
    const p = await openProblem(dadmin, { title: 'Scheduler skips a slot after a publisher timeout (SYNTHETIC)', statement: 'a timeout leaves the slot marked done without a run (SYNTHETIC)', cases: [C1] });
    PRB = String(p.problem['problem_id']);
    expect(p.problem).toMatchObject({ state: 'open', problem_ref: expect.stringMatching(/^PRB-\d{4}$/) });
    const k = await publishKe(dadmin, PRB, { title: 'Skipped slot after a timeout (SYNTHETIC)', symptom: 'no run recorded for the morning slot; the scheduler shows it done',
      workaround: 'suspend and re-activate the source to reset the schedule', act: { action: 'observation.source.transition', object_type: 'SRC' } });
    KE = String(k.known_error['known_error_id']);
    expect(k.known_error).toMatchObject({ state: 'published', ke_ref: expect.stringMatching(/^KE-\d{4}$/), digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await refused(publishKe(dadmin, PRB, { title: 'A support act as workaround', symptom: 'the symptom is stated here', workaround: 'close the case for the customer', act: { action: 'support.diagnose.source' } }),
      /^known error rejected \(act\)/, 422);
    await refused(openProblem(engineer, { title: 'Support opens a problem', statement: 'support opens a customer problem here', cases: [C1] }), /./, 403);
  });
  it('THE FAULT — KNOWN-ERROR REUSE: a NEW case gets the known workaround (support under a grant), the reuse recorded, the case linked to the problem; a second reuse → 409', async () => {
    C2 = String((await open(manager, caseBody('The same skip, another morning', 'S3'))).case['case_id']);
    await refused(reuse(engineer2, C2, { expectedVersion: 1, knownErrorId: KE }), /^known error rejected \(access\)/, 403);
    await plantGrant(engineer2, C2, [SRC], ['case.workaround', 'case.note']);
    const r = await reuse(engineer2, C2, { expectedVersion: 1, knownErrorId: KE });
    expect(r.case).toMatchObject({ state: 'workaround_offered', known_error_id: KE, problem_id: PRB, workaround: { source: 'known_error', known_error_id: KE } });
    await refused(reuse(dadmin, C2, { expectedVersion: 2, knownErrorId: KE }), /^known error rejected \(state\)/, 409);
    const uses = await one(sql`select count(*)::int n from service.known_error_uses where known_error_id = ${KE}::uuid`);
    expect(uses['n']).toBe(1);
    const linked = await rows(sql`select case_id::text from service.problem_cases where problem_id = ${PRB}::uuid order by linked_at`);
    expect(linked.map((x) => x['case_id'])).toEqual([C1, C2]);
  });
  it('CHANGES linked to the problem: proposed; the proposer never decides (separation_of_duties); a stale version → 409; approved, implemented, verified; the problem RESOLVED only with a verified change — its known error retired', async () => {
    const c = await proposeChange(dadmin, { problemId: PRB, title: 'Scheduler retries a timed-out slot (SYNTHETIC)', description: 'a timed-out slot is retried once before it is marked done', expectedEffect: 'no skipped slot after a timeout' });
    CHG = String(c.change['change_id']);
    await refused(decideChange(dadmin, CHG, { expectedVersion: 1, decision: 'approve', reason: 'self-approval attempt (SYNTHETIC)' }), /^service change rejected \(separation_of_duties\)/, 403);
    await refused(decideChange(dadmin2, CHG, { expectedVersion: 7, decision: 'approve', reason: 'a stale decision (SYNTHETIC)' }), /^service change rejected \(stale\)/, 409);
    await refused(closeProblem(dadmin, PRB, { outcome: 'resolved', reason: 'not yet verified (SYNTHETIC)' }), /^service problem rejected \(state\): problem PRB-\d+ is resolved only by a verified change/, 409);
    await decideChange(dadmin2, CHG, { expectedVersion: 1, decision: 'approve', reason: 'the retry is safe and reversible (SYNTHETIC)' });
    await refused(recordChange(dadmin, CHG, { outcome: 'verified', evidence: 'verified before implementation (SYNTHETIC)' }), /^service change rejected \(state\)/, 409);
    await recordChange(dadmin, CHG, { outcome: 'implemented', evidence: 'deployed to the scheduler (SYNTHETIC)' });
    const v = await recordChange(dadmin2, CHG, { outcome: 'verified', evidence: 'a forced timeout was retried and the slot ran (SYNTHETIC)' });
    expect(v.change).toMatchObject({ state: 'verified', decided_by: dadmin2.principalId });
    const p = await closeProblem(dadmin, PRB, { outcome: 'resolved', rootCause: 'the slot was marked done on timeout', reason: 'the change is verified (SYNTHETIC)' });
    expect(p).toMatchObject({ problem: { state: 'resolved' }, known_errors_retired: 1 });
    await refused(reuse(dadmin, C1, { expectedVersion: 1, knownErrorId: KE }), /^known error rejected \(state\): KE-\d+ is retired/, 409);
    const list = await sv.problems(rq(dadmin, 'service.read'), T, D) as { problems: Row[]; known_errors: Row[]; changes: Row[]; ledger: Row[] };
    expect(list.ledger.map((e) => e['event'])).toEqual(expect.arrayContaining(['problem.opened', 'problem.resolved']));
    expect(list.known_errors.find((k) => k['known_error_id'] === KE)).toMatchObject({ state: 'retired', uses: 1 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('S · THE SLA FAULT EXERCISE (PR-69-005/006): the drill, a real breach escalated BY SEVERITY, a missed commitment swept by `service-sla`', () => {
  it('THE DRILL (sla_escalation, human-gated): a timer due now, fired by the next REAL tick — the escalation recorded as a drill, the case\'s real SLA facts untouched', async () => {
    const c = String((await open(manager, caseBody('Drill case', 'S2'))).case['case_id']);
    await refused(drill(engineer, c, { objective: 'response', reason: 'support runs a drill (SYNTHETIC)' }), /./, 403);
    const d = await drill(dadmin, c, { objective: 'response', reason: 'the quarterly SLA escalation drill (SYNTHETIC)' });
    expect(d.drill).toMatchObject({ kind: 'sla_escalation', objective: 'response' });
    const { steps } = await tick();
    const fired = ((steps['workflow-timers']?.['timers'] ?? []) as Row[]).filter((x) => x['owner_id'] === c);
    expect(fired).toEqual([expect.objectContaining({ kind: 'sla.response', outcome: 'fired' })]);
    const b = await rows(sql`select objective, found_by, drill, item from service.sla_breaches where case_id = ${c}::uuid`);
    expect(b).toEqual([expect.objectContaining({ objective: 'response', found_by: 'drill', drill: true })]);
    expect((b[0]!['item'] as Row)['state']).toBe('open');
    const item = await one(sql`select title from executive.attention_items where item_id = ${String((b[0]!['item'] as Row)['item_id'])}::uuid`);
    expect(String(item['title'])).toMatch(/^DRILL — /);
    expect((await caseOf(c))['response_breached_at']).toBeNull();
  });
  it('A REAL BREACH, BY SEVERITY: two cases\' response objectives moved into the past (time travel, planted) and their timers due — the tick escalates the S2 (routed) and lists the S4 (deprioritized, never hidden)', async () => {
    const s2 = String((await open(manager, caseBody('Real breach S2', 'S2'))).case['case_id']);
    const s4 = String((await open(manager, caseBody('Real breach S4', 'S4'))).case['case_id']);
    for (const c of [s2, s4]) {
      // TIME TRAVEL (stated): the objective's due instant moved 5 minutes into the past and its timer scheduled at it, as the open port would have with that objective
      await sql`update service.cases set response_due_at = clock_timestamp() - interval '5 minutes' where case_id = ${c}::uuid`.execute(h.su);
      await sql`select executive._schedule_timer(gen_random_uuid(), ${T}::uuid, ${D}::uuid, 'service_case', ${c}::uuid, 'sla.response', (select response_due_at from service.cases where case_id = ${c}::uuid),
                  jsonb_build_object('objective', 'response', 'drill', false, 'planted', 'b94-sv time travel'), ${dadmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    }
    await tick();
    const b2 = await one(sql`select found_by, drill, item from service.sla_breaches where case_id = ${s2}::uuid and objective = 'response'`);
    const b4 = await one(sql`select found_by, drill, item from service.sla_breaches where case_id = ${s4}::uuid and objective = 'response'`);
    expect(b2).toMatchObject({ found_by: 'timer', drill: false, item: { outcome: 'material', state: 'open', route_roles: ['domain_admin'] } });
    expect(b4).toMatchObject({ found_by: 'timer', drill: false, item: { outcome: 'below_threshold', state: 'deprioritized' } });
    expect((await caseOf(s2))['response_breached_at']).not.toBeNull();
    const v = await read(dadmin, s2);
    expect(v.sla.find((x) => x['objective'] === 'response')).toMatchObject({ state: 'breached' });
    expect(v.ledger.map((e) => e['event'])).toContain('sla.response_breached');
    // RECOVERY: a late response is recorded as met late; the original (later) timer, when it fires, is SKIPPED (superseded)
    await triage(dadmin, s2, { expectedVersion: 1, note: 'responded late — the breach stands on the record (SYNTHETIC)' });
    expect((await read(dadmin, s2)).sla.find((x) => x['objective'] === 'response')).toMatchObject({ state: 'met_late' });
  });
  it('a MET objective\'s timer is SKIPPED (the case responded): no breach recorded', async () => {
    const c = String((await open(manager, caseBody('Responded in time', 'S2'))).case['case_id']);
    await triage(dadmin, c, { expectedVersion: 1, note: 'triaged in time (SYNTHETIC)' });
    await sql`update service.cases set response_due_at = clock_timestamp() - interval '1 minute' where case_id = ${c}::uuid`.execute(h.su);
    await sql`select executive._schedule_timer(gen_random_uuid(), ${T}::uuid, ${D}::uuid, 'service_case', ${c}::uuid, 'sla.response', (select response_due_at from service.cases where case_id = ${c}::uuid),
                '{"objective":"response","drill":false}'::jsonb, ${dadmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const { steps } = await tick();
    expect(((steps['workflow-timers']?.['timers'] ?? []) as Row[]).filter((x) => x['owner_id'] === c)).toEqual([expect.objectContaining({ outcome: 'skipped' })]);
    expect((await one(sql`select count(*)::int n from service.sla_breaches where case_id = ${c}::uuid`))['n']).toBe(0);
  });
  it('A MISSED COMMITMENT: swept by the after-tick hook `service-sla` (its read first, its write after) — breached and escalated; settling it later records it met LATE', async () => {
    const c = String((await open(manager, caseBody('Commitment case', 'S2'))).case['case_id']);
    const m = await commit(dadmin, c, { kind: 'update', statement: 'support updates the customer by noon (SYNTHETIC)', dueAt: new Date(Date.now() + 3_600_000).toISOString() });
    const mid = String(m.commitment['commitment_id']);
    await sql`update service.commitments set due_at = clock_timestamp() - interval '2 minutes' where commitment_id = ${mid}::uuid`.execute(h.su);   // TIME TRAVEL (stated)
    const { after } = await tick();
    expect(after[SLA_HOOK]).toMatchObject({ swept: expect.any(Number) });
    expect(Number(after[SLA_HOOK]?.['swept'])).toBeGreaterThanOrEqual(1);
    expect(await one(sql`select state, breached_at is not null as b from service.commitments where commitment_id = ${mid}::uuid`)).toEqual({ state: 'breached', b: true });
    expect(await one(sql`select objective, found_by from service.sla_breaches where commitment_id = ${mid}::uuid`)).toEqual({ objective: 'commitment', found_by: 'sweep' });
    const s = await settle(dadmin, mid, { outcome: 'met', note: 'the update was sent at one o\'clock (SYNTHETIC)' });
    expect(s.commitment).toMatchObject({ state: 'met', late: true });
    const { after: again } = await tick();
    expect(again[SLA_HOOK]).toMatchObject({ swept: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('G · the grant boundary, cross-tenant, correction', () => {
  it('a grant is for ONE case and lapses on the database clock: another case refused; an expired grant refused before any sweep (logged with the reason)', async () => {
    const a = String((await open(manager, caseBody('Grant case A', 'S3'))).case['case_id']);
    const b = String((await open(manager, caseBody('Grant case B', 'S3'))).case['case_id']);
    const g = await plantGrant(engineer2, a, [SRC], ['case.note']);
    await note(engineer2, a, { body: 'looking at case A under its grant (SYNTHETIC)' });
    await refused(note(engineer2, b, { body: 'case B is not this grant\'s (SYNTHETIC)' }), /^service case rejected \(access\)/, 403);
    await sql`update service.support_grants set starts_at = clock_timestamp() - interval '2 hours', expires_at = clock_timestamp() - interval '1 second' where grant_id = ${g}::uuid`.execute(h.su);
    await refused(note(engineer2, a, { body: 'after the expiry (SYNTHETIC)' }), /^service case rejected \(access\): a support note needs a live support grant .* — the grant expired at/, 403);
    const last = (await logOf(engineer2.principalId, 'refused')).at(-1) as Row;
    expect(last['detail']).toMatchObject({ reason: 'no live support grant', latest_grant_state: 'approved' });
  });
  it('support may never act outside its rules: an attempted source transition by the engineer is refused by the PDP', async () => {
    const r = await refusal(h.pipeline.write(h.env(engineer, 'observation.source.transition', 'SRC', SRC2), engineer,
      { scope: 'DOMAIN', tenantId: T, domainId: D, action: 'observation.source.transition', objectType: 'SRC', objectId: SRC2 }, ObservationCapability.registry, async () => { throw new Error('reached'); }));
    expect(r.status).toBe(403);
  });
  it('CROSS-TENANT: the premium tenant\'s admin cannot reach this tenant\'s case (its route: unknown_case; this tenant\'s route: no binding)', async () => {
    const c = String((await open(manager, caseBody('Cross-tenant probe', 'S3'))).case['case_id']);
    await refused(read(pAdmin, c, P, DP), /^service case rejected \(unknown_case\)/, 404);
    expect((await refusal(read(pAdmin, c, T, D))).status).toBe(403);
    expect((await refusal(open(pManager, caseBody('Into another tenant', 'S3'), T, D))).status).toBe(403);
  });
  it('CORRECTION: the customer RE-GRADES at triage (S3 → S1; objectives re-read, the resolution timer re-scheduled); support may not re-grade (422)', async () => {
    const c = String((await open(manager, caseBody('Regrade', 'S3'))).case['case_id']);
    await plantGrant(engineer2, c, [SRC], ['case.note']);
    await refused(triage(engineer2, c, { expectedVersion: 1, severity: 'S1', note: 'support re-grades (SYNTHETIC)' }), /^service case rejected \(severity\): the severity is the customer's statement/, 422);
    const r = await triage(dadmin, c, { expectedVersion: 1, severity: 'S1', note: 'the whole corridor is blind: re-graded S1 (SYNTHETIC)' });
    expect(r.case).toMatchObject({ severity: 'S1', routing: { severity: 'S1', regraded_from: 'S3', objectives: { resolution_minutes: 1440 } } });
    const t = await rows(sql`select kind, (payload ->> 'regraded') as rg from executive.workflow_timers where owner_id = ${c}::uuid and fired_at is null and cancelled_at is null`);
    expect(t).toEqual([{ kind: 'sla.resolution', rg: 'true' }]);
    await refused(propose(dadmin, c, { expectedVersion: 2, steps: 'close the case on the customer\'s behalf (SYNTHETIC)', act: { action: 'service.case.close' } }),
      /^service case rejected \(act\): a workaround is the customer's own governed act/, 422);
  });
  it('degraded guidance and cannot_reproduce: the safe guidance stated (the resolution clock keeps running); an unreproduced case closes only as not_reproduced', async () => {
    const c = String((await open(manager, caseBody('Intermittent stall', 'S3'))).case['case_id']);
    await triage(dadmin, c, { expectedVersion: 1, note: 'intermittent; support will look (SYNTHETIC)' });
    await refused(progress(dadmin, c, { expectedVersion: 2, to: 'degraded_guidance', statement: 'short' }), /^service case rejected \(statement\): degraded_guidance states the safe guidance/, 422);
    const g = await progress(dadmin, c, { expectedVersion: 2, to: 'degraded_guidance', statement: 'use the late stream meanwhile; the morning slot is NOT recovered (SYNTHETIC)' });
    expect(g.case).toMatchObject({ state: 'degraded_guidance', guidance: expect.stringMatching(/NOT recovered/) });
    expect((await read(dadmin, c)).sla.find((x) => x['objective'] === 'resolution')).toMatchObject({ state: 'running' });
    await progress(dadmin, c, { expectedVersion: 3, to: 'diagnosing', statement: 'diagnosing the intermittent stall again (SYNTHETIC)' });
    const n = await progress(dadmin, c, { expectedVersion: 4, to: 'cannot_reproduce', statement: 'three forced runs all delivered; the stall did not recur (SYNTHETIC)' });
    expect(n.closure_task).toMatchObject({ state: 'open' });
    await refused(close(manager, c, { expectedVersion: 5, outcome: 'resolved', note: 'resolved? (SYNTHETIC)' }), /^service case rejected \(state\)/, 409);
    expect((await close(manager, c, { expectedVersion: 5, outcome: 'not_reproduced', note: 'accepted: not reproduced (SYNTHETIC)' })).case).toMatchObject({ state: 'closed', closure: { outcome: 'not_reproduced' } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('V · customer success and the value review (CAP-DL-10) — MET-040 stays unsupported (B76); the record\'s claim is always `demonstration` (R2)', () => {
  let R = ''; let digest = '';
  it('the customer-success read model: health, adoption, outcomes, value (unsupported, B76), the licence as recorded (no renewal-risk score), the cases', async () => {
    const s = await success(dadmin);
    expect(s.success).toMatchObject({
      value: { metric_key: 'MET-040', state: 'unsupported', carrier: 'B76' },
      health: { state: expect.any(String) }, adoption: { note: expect.any(String) },
      licence: { note: expect.stringMatching(/no renewal-risk score is inferred/) },
      cases: { open: expect.any(Number), breaches: expect.any(Number), drills: expect.any(Number) },
    });
    expect(Number((s.success['cases'] as Row)['drills'])).toBeGreaterThanOrEqual(1);
    expect(s.inputs_digest).toMatch(/^[0-9a-f]{64}$/);
    digest = s.inputs_digest;
  });
  it('RECORD on the view read (stale digest → 409); the claim is `demonstration`; the recorder never acknowledges (separation_of_duties); a stale review digest → 409; an executive acknowledges', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await refused(recordReview(dadmin, { periodFrom: '2026-07-01', periodTo: today, outcomes: 'the corridor feed recovered within its objective (SYNTHETIC)', inputsDigest: 'a'.repeat(64) }),
      /^value review rejected \(stale\)/, 409);
    await refused(recordReview(dadmin, { periodFrom: '2026-07-01', periodTo: '2099-01-01', outcomes: 'a future period (SYNTHETIC)', inputsDigest: digest }), /^value review rejected \(period\)/, 422);
    const r = await recordReview(dadmin, { periodFrom: '2026-07-01', periodTo: today, outcomes: 'the corridor feed recovered within its objective (SYNTHETIC)', inputsDigest: digest });
    R = String(r.review['review_id']);
    expect(r.review).toMatchObject({ state: 'recorded', claim: 'demonstration', value_status: { state: 'unsupported', carrier: 'B76' }, period_from: '2026-07-01' });
    await refused(decideReview(dadmin, R, { digest: String(r.review['digest']), decision: 'acknowledged', note: 'self-acknowledgement (SYNTHETIC)' }), /^value review rejected \(separation_of_duties\)/, 403);
    await refused(decideReview(executive, R, { digest: 'b'.repeat(64), decision: 'acknowledged', note: 'a stale digest (SYNTHETIC)' }), /^value review rejected \(stale\)/, 409);
    const a = await decideReview(executive, R, { digest: String(r.review['digest']), decision: 'acknowledged', note: 'acknowledged in the product — a demonstration, not the joint acceptance (SYNTHETIC)' });
    expect(a.review).toMatchObject({ state: 'acknowledged', claim: 'demonstration', decided_by: executive.principalId });
    expect((await one(sql`select count(*)::int n from service.value_reviews where claim <> 'demonstration'`))['n']).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('RLS and the append-only ledgers of §SV', () => {
  it('every §SV table forces RLS; the notes, bundles, breaches and drills are append-only', async () => {
    const forced = await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'service' and c.relkind = 'r' and c.relname in ('sla_policies','case_notes','evidence_bundles','problems','problem_cases','known_errors','known_error_uses','changes','commitments','sla_breaches','sla_drills','value_reviews')`);
    expect(forced).toHaveLength(12);
    expect(forced.every((r) => r['f'] === true)).toBe(true);
    const b = await one(sql`select bundle_id::text id from service.evidence_bundles limit 1`);
    const e = await refusal(sql`update service.evidence_bundles set digest = ${'c'.repeat(64)} where bundle_id = ${String(b['id'])}::uuid`.execute(h.su));
    expect(e.message).toMatch(/append-only|append only/i);
  });
});
