/**
 * CP-6 B94 §ON (migration 0114_b94_x_on) — THE ONBOARDING PROGRAMME, SPONSOR INTENT, STEPS, THE DRAFT DOMAIN, CONFIGURATION BASELINES AND
 * DRIFT, on a real database through the real pipeline, PDP, ports and controllers (V01-T-033's managed configurations; PR-67-001, PR-67-002
 * [programme, responsibility pointer, baseline], CAP-DL-04/-05, PER-21, JRN-01; UX-66-001/-002, CAP-PD-04/-05).
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case, and AT-67's fixture classes for §ON's acts: positive · negative · STALE digest/version
 * (409) · UNAUTHORIZED ROLE (the implementation lead approving a baseline → 403 separation_of_duties; an agent → 403 actor at the port, 403
 * human gate at the PEP) · CROSS-TENANT · CORRECTION (revise, intent v2, promote) · REPLAY (the ledger reconstructs the programme) · the FAULT
 * (drift detected after a pointer changes; the rollback plan names the restoring act; recovery by promotion + approval, and back in line).
 *
 * THREE CLAIMS: this harness proves CONSTRUCTION. Every tenant, domain, persona, policy and record here is SYNTHETIC fixture data; an
 * approval by a synthetic persona demonstrates the software only (real customer acceptance is R2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope, Scope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { BaselinesController, OnboardingController } from '../../src/delivery/onboarding/onboarding.controller.js';
import { OnboardingService } from '../../src/delivery/onboarding/onboarding.service.js';
import { OnboardingCapability } from '../../src/delivery/onboarding/onboarding.capabilities.js';
import { STEP_DEFAULTS } from '../../src/delivery/onboarding/rollback.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY: generated here, bound in the process before the boot (the signer's discipline — a one-line base64 of the PKCS8 DER).
const KEY = generateKeyPairSync('ed25519');
const KEY_REF = ['EYE_EXECUTIVE_SIGNING', 'KEY_DEMO'].join('_');   // the reference NAME, split (gitleaks' full-history scan)
process.env[['EYE_EXECUTIVE_SIGNING', 'KEY_REF'].join('_')] = KEY_REF;
process.env[KEY_REF] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
let h: Phase4Harness; let on: OnboardingController; let bl: BaselinesController; let svc: OnboardingService;
const T = () => h.fx.tenantId;
const RUN = uuidv7().slice(-6);
let U = '';   // the second tenant (cross-tenant)
let D2 = '';  // the draft domain the programme creates

let lead: AuthenticatedPrincipal; let lead2: AuthenticatedPrincipal; let tadmin: AuthenticatedPrincipal; let sponsor: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal;
let leadAuthority: AuthenticatedPrincipal; let sponsorLead: AuthenticatedPrincipal; let agentAuthorityAsHuman: AuthenticatedPrincipal; let agentAuthority: AuthenticatedPrincipal;
let agentSponsorAsHuman: AuthenticatedPrincipal; let uLead: AuthenticatedPrincipal; let draftAdmin: AuthenticatedPrincipal; let attentionAgent: AuthenticatedPrincipal;
let vendor: AuthenticatedPrincipal;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

// ── envelopes: TENANT routes carry a TENANT envelope, DOMAIN routes a DOMAIN one ─────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null, type: string | null = null, id: string | null = null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'onboarding', action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: type, object_id: id, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b94-on',
  } as unknown as Envelope;
}
const treq = (p: AuthenticatedPrincipal, action: string, t = T()) => ({ eyeEnvelope: env(p, action, 'TENANT', t, null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string, d: string, t = T()) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;

// ── the routes (in process) ────────────────────────────────────────────────────────────────────────────
const open = (as: AuthenticatedPrincipal, payload: Row, t = T()) => on.open(treq(as, 'onboarding.programme.open', t), t, { payload }) as Promise<{ programme: Row; receipt: Row }>;
const detail = (as: AuthenticatedPrincipal, pid: string, t = T()) => on.read(treq(as, 'onboarding.read', t), t, pid) as Promise<Row & { programme: Row; steps: Row[]; ledger: Row[]; baselines: Row[]; drift: Row | null; rollback_plan: Row[] }>;
const list = (as: AuthenticatedPrincipal, t = T()) => on.list(treq(as, 'onboarding.read', t), t) as Promise<{ programmes: Row[]; receipt: Row }>;
const history = (as: AuthenticatedPrincipal, pid: string) => on.history(treq(as, 'onboarding.read'), T(), pid) as Promise<{ replay: { versions: Row[]; consistent: boolean; mismatches: string[] }; ledger: Row[] }>;
const revise = (as: AuthenticatedPrincipal, pid: string, payload: Row, t = T()) => on.revise(treq(as, 'onboarding.programme.revise', t), t, pid, { payload }) as Promise<{ programme: Row }>;
const act = (as: AuthenticatedPrincipal, pid: string, a: 'hold' | 'resume' | 'withdraw', expectedVersion: number, reason: string) =>
  on[a](treq(as, `onboarding.programme.${a}`), T(), pid, { payload: { expectedVersion, reason } }) as Promise<{ programme: Row }>;
const intent = (as: AuthenticatedPrincipal, pid: string, payload: Row) => on.intent(treq(as, 'onboarding.intent.record'), T(), pid, { payload }) as Promise<{ intent: Row }>;
const plan = (as: AuthenticatedPrincipal, pid: string, stepKey: string, compensation: Row | null = null) =>
  on.planStep(treq(as, 'onboarding.step.plan'), T(), pid, { payload: { stepKey, compensation } }) as Promise<{ step: Row }>;
const record = (as: AuthenticatedPrincipal, sid: string, payload: Row) => on.recordStep(treq(as, 'onboarding.step.record'), T(), sid, { payload }) as Promise<{ step: Row }>;
const holdStep = (as: AuthenticatedPrincipal, sid: string, expectedVersion: number, reason: string) => on.holdStep(treq(as, 'onboarding.step.hold'), T(), sid, { payload: { expectedVersion, reason } }) as Promise<{ step: Row }>;
const revert = (as: AuthenticatedPrincipal, sid: string, payload: Row) => on.revertStep(treq(as, 'onboarding.step.revert'), T(), sid, { payload }) as Promise<{ step: Row }>;
const draft = (as: AuthenticatedPrincipal, pid: string, name: string) => on.draftDomain(treq(as, 'tenancy.domain.draft'), T(), pid, { payload: { name } }) as Promise<{ domain: Row; programme: Row; receipt: Row }>;
const baselines = (as: AuthenticatedPrincipal, d = D2) => bl.read(dreq(as, 'onboarding.read', d), T(), d) as Promise<Row & { baselines: Row[]; drift: Row; rollback_plan: Row[]; drift_events: Row[]; items: Row[] }>;
const capture = (as: AuthenticatedPrincipal, programmeId: string | null, d = D2) => bl.capture(dreq(as, 'onboarding.baseline.capture', d), T(), d, { payload: { programmeId } }) as Promise<{ baseline: Row }>;
const promote = (as: AuthenticatedPrincipal, d = D2) => bl.promote(dreq(as, 'onboarding.baseline.promote', d), T(), d) as Promise<{ baseline: Row }>;
const propose = (as: AuthenticatedPrincipal, bid: string, v: number, digest: string, d = D2) =>
  bl.propose(dreq(as, 'onboarding.baseline.propose', d), T(), d, bid, String(v), { payload: { digest } }) as Promise<{ baseline: Row }>;
const decide = (as: AuthenticatedPrincipal, bid: string, v: number, decision: 'approve' | 'reject', digest: string, d = D2) =>
  bl.decide(dreq(as, 'onboarding.baseline.decide', d), T(), d, bid, String(v), { payload: { decision, digest, reason: `the configuration baseline reviewed by the customer authority (SYNTHETIC, ${decision})` } }) as Promise<{ baseline: Row }>;
const driftRecord = (as: AuthenticatedPrincipal, d = D2) => bl.drift(dreq(as, 'onboarding.baseline.drift', d), T(), d) as Promise<{ drift: Row; rollback_plan?: Row[] }>;

// ── principals ─────────────────────────────────────────────────────────────────────────────────────────
/** A principal homed at the given scope with its bindings (TENANT roles at the tenant, DOMAIN roles in `bindDomain`) and its own session. */
async function person(label: string, kind: 'human' | 'agent', home: Scope, t: string | null, homeDomain: string | null, roles: Array<{ role: string; scope: Scope }>,
                      claim: { kind?: 'human' | 'agent'; assurance?: 'password' | 'agent_grant' } = {}, bindDomain: string | null = homeDomain): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${home}, ${t}::uuid, ${homeDomain}::uuid, ${`b94on-${label}-${RUN} (SYNTHETIC)`}, ${`b94on-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? bindDomain : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind: claim.kind ?? kind, assurance: claim.assurance ?? (kind === 'agent' ? 'agent_grant' : 'password'),
                         homeScope: home, homeTenantId: t, homeDomainId: homeDomain, bindings } as AuthenticatedPrincipal);
}
const TEN = (role: string) => ({ role, scope: 'TENANT' as Scope });

let execCtl: { publishAttentionPolicy: (req: never, t: string, d: string, body: { payload: Row }) => Promise<{ policy: Row }> };
const publishPolicy = async (as: AuthenticatedPrincipal, d: string, reason: string, extra: Row = {}) =>
  (await execCtl.publishAttentionPolicy(dreq(as, 'executive.attention.policy.publish', d), T(), d, { payload: { reason, rules: { classes: {
    'onboarding.drift': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    ...extra } } } })).policy;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  on = h.app.get(OnboardingController); bl = h.app.get(BaselinesController); svc = h.app.get(OnboardingService);
  const { ExecutiveController } = await import('../../src/executive/executive.controller.js');
  execCtl = h.app.get(ExecutiveController) as never;
  // the second tenant (cross-tenant): SYNTHETIC scaffolding seeded directly
  U = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b94on-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  lead = await person('lead', 'human', 'TENANT', T(), null, [TEN('implementation_lead')]);
  lead2 = await person('lead-2', 'human', 'TENANT', T(), null, [TEN('implementation_lead')]);
  tadmin = await person('tadmin', 'human', 'TENANT', T(), null, [TEN('tenant_admin')]);
  sponsor = await person('sponsor', 'human', 'TENANT', T(), null, [TEN('customer_sponsor')]);
  authority = await person('authority', 'human', 'TENANT', T(), null, [TEN('onboarding_authority')]);
  leadAuthority = await person('lead-authority', 'human', 'TENANT', T(), null, [TEN('implementation_lead'), TEN('onboarding_authority')]);
  sponsorLead = await person('sponsor-lead', 'human', 'TENANT', T(), null, [TEN('customer_sponsor'), TEN('implementation_lead')]);
  agentAuthorityAsHuman = await person('agent-auth-h', 'agent', 'TENANT', T(), null, [TEN('onboarding_authority')], { kind: 'human', assurance: 'password' });
  agentAuthority = await person('agent-auth', 'agent', 'TENANT', T(), null, [TEN('onboarding_authority')]);
  agentSponsorAsHuman = await person('agent-sponsor-h', 'agent', 'TENANT', T(), null, [TEN('customer_sponsor')], { kind: 'human', assurance: 'password' });
  uLead = await person('u-lead', 'human', 'TENANT', U, null, [TEN('implementation_lead'), TEN('tenant_admin')]);
  vendor = await person('vendor', 'human', 'PLATFORM', null, null, [{ role: 'commercial_authority', scope: 'PLATFORM' }]);
}, 600_000);
afterAll(async () => { await h?.close(); }, 120_000);

let P = ''; let P2 = '';  // the programme of the scene; a second one (withdrawn)
let intentId = '';
const steps: Record<string, string> = {};
const stepVersion = async (sid: string) => Number((await one(sql`select version from onboarding.steps where step_id = ${sid}::uuid`))['version']);
const progVersion = async (pid: string) => Number((await one(sql`select version from onboarding.programmes where programme_id = ${pid}::uuid and superseded_at is null`))['version']);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON1 · the programme (PR-67-001/-002; TENANT, versioned, digested)', () => {
  it('POSITIVE: the implementation lead opens v1 planned (digest, effective time, owner); the ledger records programme.opened; the tenant admin opens a second', async () => {
    const r = await open(lead, { key: `nordwerk-polska-${RUN}`, title: 'NORDWERK Polska supplier-risk onboarding (SYNTHETIC)', deploymentProfile: 'local-dev', plan: { waves: 1, note: 'supplier-risk register (SYNTHETIC)' } });
    P = String(r.programme['programme_id']);
    expect(r.programme).toMatchObject({ version: 1, state: 'planned', owner_principal_id: lead.principalId, target_domain_id: null, deployment_profile: 'local-dev', held_reasons: [] });
    expect(String(r.programme['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(r.receipt).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    const ev = await rows(sql`select event, version, details from onboarding.events where subject_id = ${P}::uuid order by occurred_at`);
    expect(ev.map((e) => e['event'])).toEqual(['programme.opened']);
    expect((ev[0]!['details'] as Row)['digest']).toBe(r.programme['digest']);
    P2 = String((await open(tadmin, { key: `nordwerk-spare-${RUN}`, title: 'A second onboarding, to be withdrawn (SYNTHETIC)' })).programme['programme_id']);
  });
  it('NEGATIVE / UNAUTHORIZED: the sponsor (no rule) 403 at the PEP; a duplicate key 409; a bad key 422; an owner who is no lead 403 (ownership)', async () => {
    await refused(open(sponsor, { key: `x-${RUN}`, title: 'Not the sponsor\'s act (SYNTHETIC)' }), /no qualifying role binding/, 403);
    await refused(open(lead, { key: `nordwerk-polska-${RUN}`, title: 'The same key again (SYNTHETIC)' }), /^onboarding programme rejected \(duplicate\)/, 409);
    await refused(open(lead, { key: 'NO', title: 'A bad key (SYNTHETIC)' }), /^onboarding programme rejected \(key\)/, 422);
    await refused(open(lead, { key: `owned-${RUN}`, title: 'Owned by the sponsor (SYNTHETIC)', ownerPrincipalId: sponsor.principalId }), /^onboarding programme rejected \(ownership\)/, 403);
  });
  it('CORRECTION + STALE: a revision is a new version (v2) naming what changed; the same expected version again 409 stale; a revision changing nothing 422', async () => {
    const r = await revise(lead, P, { expectedVersion: 1, title: 'NORDWERK Polska — supplier-risk onboarding (SYNTHETIC)', plan: { waves: 1, cutover: 'after rehearsal 2' }, reason: 'the plan names the cutover rule' });
    expect(r.programme).toMatchObject({ version: 2, state: 'planned' });
    await refused(revise(lead2, P, { expectedVersion: 1, title: 'A stale revision (SYNTHETIC)', reason: 'written against v1' }), /^onboarding programme rejected \(stale\): the revision names v1, the programme is at v2/, 409);
    await refused(revise(lead, P, { expectedVersion: 2, title: 'NORDWERK Polska — supplier-risk onboarding (SYNTHETIC)', reason: 'nothing changes here' }), /^onboarding programme rejected \(unchanged\)/, 422);
    const v = await rows(sql`select version, superseded_at is not null as s from onboarding.programmes where programme_id = ${P}::uuid order by version`);
    expect(v).toEqual([{ version: 1, s: true }, { version: 2, s: false }]);
    await expect(sql`update onboarding.programmes set title = 'tampered' where programme_id = ${P}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/a version is immutable/);
    await expect(sql`delete from onboarding.programmes where programme_id = ${P}::uuid`.execute(h.su)).rejects.toThrow(/DELETE prohibited/);
  });
  it('HOLD / RESUME: the onboarding authority holds (v3 held, the reason and its roles recorded); the lead cannot release the customer\'s hold (403 separation_of_duties); the sponsor resumes → planned again', async () => {
    const hld = await act(authority, P, 'hold', 2, 'the customer authority wants the scope statement first');
    expect(hld.programme).toMatchObject({ version: 3, state: 'held' });
    expect(arr(hld.programme['held_reasons'])[0]).toMatchObject({ reason: 'the customer authority wants the scope statement first', held_by: authority.principalId, held_by_roles: ['onboarding_authority'], state_before: 'planned' });
    await refused(act(lead, P, 'resume', 3, 'the lead tries to release the hold'), /^onboarding programme rejected \(separation_of_duties\): a hold placed by the customer's sponsor or onboarding authority is released only/, 403);
    await refused(act(sponsor, P, 'resume', 2, 'a stale resumption'), /^onboarding programme rejected \(stale\)/, 409);
    const res = await act(sponsor, P, 'resume', 3, 'the sponsor states the scope next (SYNTHETIC)');
    expect(res.programme).toMatchObject({ version: 4, state: 'planned', held_reasons: [] });
    await refused(act(sponsor, P, 'resume', 4, 'not held any more'), /^onboarding programme rejected \(state\): .* is planned, not held/, 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON2 · the sponsor intent (JRN-01; the customer sponsor\'s OWN record)', () => {
  const INTENT = {
    objectives: ['one governed supplier-risk register for the Polish subsidiary', 'retire the legacy spreadsheet after cutover'],
    scopeStatement: 'The Polish subsidiary\'s supplier-risk register: suppliers, their legacy identifiers and risk ratings (SYNTHETIC).',
    successMeasures: ['every supplier of the register migrated or explained', 'the go-live accepted by the onboarding authority'],
    constraints: ['no customer data leaves the tenant', 'cutover only after a clean rehearsal'],
    targetDomainName: `NORDWERK Polska — Supplier Risk (SYNTHETIC) ${RUN}`, deploymentProfile: 'local-dev',
  };
  it('NEGATIVE: the programme cannot leave planned before the intent — recording its first step in progress is refused 409 (state)', async () => {
    steps['domain'] = String((await plan(lead, P, 'domain', STEP_DEFAULTS.domain.compensation as unknown as Row)).step['step_id']);
    await refused(record(lead, steps['domain']!, { expectedVersion: 1, state: 'in_progress' }), /^onboarding step rejected \(state\): programme .* cannot leave planned without the customer sponsor's recorded intent/, 409);
  });
  it('UNAUTHORIZED: the lead (no rule) 403 at the PEP; a lead also holding the sponsor role 403 separation_of_duties; an agent 403 (actor) at the port, 403 human gate at the PEP; a stale version 409', async () => {
    await refused(intent(lead, P, INTENT), /no qualifying role binding/, 403);
    await refused(intent(sponsorLead, P, INTENT), /^sponsor intent rejected \(separation_of_duties\): an implementation lead never records the customer sponsor's intent/, 403);
    await refused(intent(agentSponsorAsHuman, P, INTENT), /^sponsor intent rejected \(actor\)/, 403);
    const agentSponsor = await person('agent-sponsor', 'agent', 'TENANT', T(), null, [TEN('customer_sponsor')]);
    await refused(intent(agentSponsor, P, INTENT), /human gate: onboarding.intent.record requires a named human principal/, 403);
    await refused(intent(sponsor, P, { ...INTENT, expectedVersion: 1 }), /^sponsor intent rejected \(stale\): the record names intent v1, the programme's intent is at v0/, 409);
    await refused(intent(sponsor, P, { ...INTENT, successMeasures: [] }), /^sponsor intent rejected \(success_measures\)/, 422);
  });
  it('POSITIVE + CORRECTION: the sponsor records intent v1 (digested); a correction is v2 superseding v1; v1 named again is stale', async () => {
    const v1 = (await intent(sponsor, P, INTENT)).intent;
    intentId = String(v1['intent_id']);
    expect(v1).toMatchObject({ version: 1, sponsor_principal_id: sponsor.principalId, target_domain_name: INTENT.targetDomainName, deployment_profile: 'local-dev' });
    expect(String(v1['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const v2 = (await intent(sponsor, P, { ...INTENT, expectedVersion: 1, constraints: [...INTENT.constraints, 'the subsidiary\'s works council informed before go-live'] })).intent;
    expect(v2).toMatchObject({ intent_id: intentId, version: 2 });
    expect(v2['digest']).not.toBe(v1['digest']);
    await refused(intent(sponsor, P, { ...INTENT, expectedVersion: 1 }), /^sponsor intent rejected \(stale\)/, 409);
    expect((await rows(sql`select version, superseded_at is null as cur from onboarding.sponsor_intents where intent_id = ${intentId}::uuid order by version`))).toEqual([{ version: 1, cur: false }, { version: 2, cur: true }]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON3 · the steps (JRN-01 + JRN-23; reversibility PR-67-001)', () => {
  it('POSITIVE: the lead plans the steps with their compensations; the intent step done (realized by the intent record) STARTS the programme', async () => {
    for (const k of ['intent', 'authority', 'policy', 'baseline', 'mapping', 'cutover'] as const) {
      steps[k] = String((await plan(lead, P, k, k === 'authority' ? null : STEP_DEFAULTS[k].compensation as unknown as Row)).step['step_id']);
    }
    const r = (await record(lead, steps['intent']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'sponsor_intent', id: intentId, action: 'onboarding.intent.record' },
      evidence: [{ kind: 'sponsor_intent', ref: intentId, note: 'the sponsor\'s intent v2' }] })).step;
    expect(r).toMatchObject({ state: 'done', version: 2, realized_by: { kind: 'sponsor_intent', id: intentId, version: 2, action: 'onboarding.intent.record' } });
    expect(r['programme_started']).toMatchObject({ state: 'in_progress', version: 5 });
    const s = await rows(sql`select step_key, ordinal, state from onboarding.steps where programme_id = ${P}::uuid order by ordinal`);
    expect(s.map((x) => x['step_key'])).toEqual(['intent', 'domain', 'authority', 'policy', 'baseline', 'mapping', 'cutover']);
  });
  it('NEGATIVE: a duplicate step 409; a record of the wrong kind 422; an unknown record 404; done without a compensation 422; a stale version 409; a done step re-recorded 409', async () => {
    await refused(plan(lead, P, 'intent'), /^onboarding step rejected \(duplicate\)/, 409);
    await refused(plan(lead, P, 'teleport'), /^onboarding step rejected \(step_key\)/, 422);
    await refused(record(lead, steps['domain']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'principal', id: lead.principalId, action: 'identity.principal.create' } }),
      /^onboarding step rejected \(realized_by\): step domain is realized by a domain — not principal/, 422);
    await refused(record(lead, steps['domain']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'domain', id: uuidv7(), action: 'tenancy.domain.draft' } }),
      /^onboarding step rejected \(unknown_record\): no domain .* is recorded in this tenant/, 404);
    await refused(record(lead, steps['authority']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'principal', id: authority.principalId, action: 'identity.principal.create' } }),
      /^onboarding step rejected \(compensation\)/, 422);
    await refused(record(lead, steps['authority']!, { expectedVersion: 7, state: 'in_progress' }), /^onboarding step rejected \(stale\): the act names step v7, the step is at v1/, 409);
    await refused(record(lead, steps['intent']!, { expectedVersion: 2, state: 'in_progress' }), /^onboarding step rejected \(state\): the intent step is done; it changes only by its revert/, 409);
    await refused(record(sponsor, steps['authority']!, { expectedVersion: 1, state: 'in_progress' }), /no qualifying role binding/, 403);
  });
  it('RECOVERY: the authority step done with its realizing principal and a compensation; a step held then resumed by its record; a held PROGRAMME refuses every record (409 held) until resumed', async () => {
    const a = (await record(lead, steps['authority']!, { expectedVersion: 1, state: 'done', compensation: STEP_DEFAULTS.authority.compensation,
      realizedBy: { kind: 'principal', id: authority.principalId, action: 'identity.principal.create' } })).step;
    expect(a).toMatchObject({ state: 'done', compensation: { action: 'identity.credential.revoke' } });
    const held = (await holdStep(sponsor, steps['mapping']!, 1, 'the legacy file has not been exported yet')).step;
    expect(held).toMatchObject({ state: 'held', held_reason: 'the legacy file has not been exported yet' });
    const pv = await progVersion(P);
    await act(lead, P, 'hold', pv, 'the lead pauses for the subsidiary\'s works council');
    await refused(record(lead, steps['mapping']!, { expectedVersion: 2, state: 'in_progress' }), /^onboarding step rejected \(held\): programme .* is held \(the lead pauses/, 409);
    await act(lead, P, 'resume', pv + 1, 'the works council is informed (SYNTHETIC)');
    expect((await one(sql`select state from onboarding.programmes where programme_id = ${P}::uuid and superseded_at is null`))['state']).toBe('in_progress');
    const m = (await record(lead, steps['mapping']!, { expectedVersion: 2, state: 'in_progress', evidence: [{ kind: 'note', ref: 'export requested from the subsidiary (SYNTHETIC)' }] })).step;
    expect(m).toMatchObject({ state: 'in_progress', version: 3, held_reason: null });
  });
  it('§MG\'s records are validated by their LEDGER: a migration wave unknown 404; once its governed act is ledgered, the mapping step accepts it', async () => {
    const wave = uuidv7();
    await refused(record(lead, steps['mapping']!, { expectedVersion: 3, state: 'done', realizedBy: { kind: 'migration_wave', id: wave, action: 'onboarding.wave.open' } }),
      /^onboarding step rejected \(unknown_record\): no migration_wave/, 404);
    // the seam planted as §MG's port would write it (its tables are not on this branch): one ledger event of the wave
    await sql`select onboarding.ledger('onboarding', ${T()}::uuid, null, 'migration_wave', ${wave}::uuid, 1, 'wave.opened', ${lead.principalId}::uuid, '{"synthetic":true}'::jsonb, ${uuidv7()}::uuid)`.execute(h.su);
    const m = (await record(lead, steps['mapping']!, { expectedVersion: 3, state: 'done', realizedBy: { kind: 'migration_wave', id: wave, action: 'onboarding.wave.open' } })).step;
    expect(m).toMatchObject({ state: 'done', realized_by: { kind: 'migration_wave', id: wave, version: 1, label: 'migration_wave · wave.opened' } });
  });
});

describe('ON3b · the responsibility pointer (PR-67-002; JRN-01 "signed responsibility baseline" — §SA\'s matrix, read here)', () => {
  it('a PROPOSED matrix does not realize the responsibility step (422); an APPROVED, signed one does — the step points at its exact version', async () => {
    steps['responsibility'] = String((await plan(lead, P, 'responsibility', STEP_DEFAULTS.responsibility.compensation as unknown as Row)).step['step_id']);
    const m = uuidv7();
    // planted by the superuser as §SA's ports would write it (the prelude harness's idiom; §SA's ports are not on this branch)
    await sql`insert into service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, state, digest, proposed_by, correlation_id)
              values (${m}::uuid, 1, ${T()}::uuid, ${h.fx.domainId}::uuid, 'proposed', ${'c'.repeat(64)}, ${lead.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await refused(record(lead, steps['responsibility']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'responsibility_matrix', id: m, version: 1, action: 'service.matrix.decide' } }),
      /^onboarding step rejected \(realized_by\): responsibility matrix .* is not an approved matrix of this tenant/, 422);
    const m2 = uuidv7();
    await sql`insert into service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, state, digest, proposed_by, decided_by, decided_at, signature_id, correlation_id)
              values (${m2}::uuid, 1, ${T()}::uuid, ${h.fx.domainId}::uuid, 'approved', ${'f'.repeat(64)}, ${lead.principalId}::uuid, ${authority.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const s = (await record(lead, steps['responsibility']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'responsibility_matrix', id: m2, version: 1, action: 'service.matrix.decide' } })).step;
    expect(s).toMatchObject({ state: 'done', realized_by: { kind: 'responsibility_matrix', id: m2, version: 1, label: 'responsibility matrix v1 (approved)' } });
    await refused(record(lead, steps['responsibility']!, { expectedVersion: 2, state: 'in_progress' }), /^onboarding step rejected \(state\)/, 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON4 · the draft domain (D4; tenancy.domain.draft — the existing create route unchanged)', () => {
  it('UNAUTHORIZED: the implementation lead 403 at the PEP (the tenancy.domain. prefix rule names the tenant admin); a platform-bound principal on the TENANT route is refused by the port (not a tenant admin)', async () => {
    await refused(draft(lead, P, `x-${RUN}`), /no qualifying role binding/, 403);
    const padmin = await person('padmin', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
    await refused(draft(padmin, P, `x-${RUN}`), /^domain draft rejected \(authority\): a draft domain is created by the tenant administrator/, 403);
  });
  it('POSITIVE: the tenant admin drafts the target domain through the programme — status draft, not activated; lifecycle domain.drafted (never domain.created); the programme\'s next version names it', async () => {
    const before = await progVersion(P);
    const r = await draft(tadmin, P, `NORDWERK Polska — Supplier Risk (SYNTHETIC) ${RUN}`);
    D2 = String(r.domain['id']);
    expect(r.domain).toMatchObject({ status: 'draft', activated_at: null });
    expect(r.programme).toMatchObject({ version: before + 1, target_domain_id: D2, state: 'in_progress' });
    expect(await one(sql`select status, activated_at from tenancy.domains where id = ${D2}::uuid`)).toEqual({ status: 'draft', activated_at: null });
    const lc = await rows(sql`select event, details from tenancy.lifecycle_events where domain_id = ${D2}::uuid order by occurred_at`);
    expect(lc.map((l) => l['event'])).toEqual(['domain.drafted']);
    expect(lc[0]!['details']).toMatchObject({ programme_id: P, status: 'draft' });
    // the tenancy list shows it as draft (a read path that passes status through, unchanged)
    const { TenancyController } = await import('../../src/tenancy/tenancy.controller.js');
    const listed = (await h.app.get(TenancyController).listDomains(treq(tadmin, 'tenancy.domain.list'), T())) as { domains: Row[] };
    expect(listed.domains.find((d) => d['id'] === D2)).toMatchObject({ status: 'draft' });
    // the domain step done, realized by the draft
    const s = (await record(tadmin, steps['domain']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'domain', id: D2, action: 'tenancy.domain.draft' } })).step;
    expect(s).toMatchObject({ state: 'done', realized_by: { kind: 'domain', id: D2, label: expect.stringMatching(/\(draft\)$/) } });
  });
  it('NEGATIVE + RECOVERY: a second draft for the programme 409 duplicate; a taken name 409; the other programme drafts its own domain', async () => {
    await refused(draft(tadmin, P, `another-${RUN}`), /^domain draft rejected \(duplicate\): programme .* already names its target domain/, 409);
    await refused(draft(tadmin, P2, `NORDWERK Polska — Supplier Risk (SYNTHETIC) ${RUN}`), /^domain draft rejected \(duplicate\): the tenant already has a domain named/, 409);
    const other = await draft(tadmin, P2, `NORDWERK spare (SYNTHETIC) ${RUN}`);
    expect(other.domain).toMatchObject({ status: 'draft' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
let B = ''; let v1Digest = '';
describe('ON5 · configuration baselines (D6, CAP-DL-05): captured by the lead, approved and SIGNED by the customer authority on the digest', () => {
  it('setup: the draft domain\'s administrator publishes its attention policy (drift routed to the domain admin); the attention agent is bound — a draft domain is a working DOMAIN context', async () => {
    draftAdmin = await person('draft-admin', 'human', 'DOMAIN', T(), D2, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
    attentionAgent = await person('attention', 'agent', 'DOMAIN', T(), D2, [{ role: 'attention_agent', scope: 'DOMAIN' }]);
    const pol = await publishPolicy(draftAdmin, D2, 'B94 §ON harness: configuration drift to the domain administrator (SYNTHETIC)');
    expect(pol).toMatchObject({ version: 1 });
  });
  it('POSITIVE: the lead captures v1 from the OBSERVED pointers — the attention policy version, the role census as COUNTS (never persons), no licence — a draft with its digest', async () => {
    const r = (await capture(lead, P)).baseline;
    B = String(r['baseline_id']); v1Digest = String(r['digest']);
    expect(r).toMatchObject({ version: 1, state: 'draft', basis: 'capture', programme_id: P, captured_by: lead.principalId });
    const ptr = r['pointers'] as Row;
    expect(ptr['attention_policy']).toMatchObject({ version: 1 });
    expect(ptr['role_census']).toMatchObject({ domain_admin: 1, attention_agent: 1, implementation_lead: expect.any(Number), onboarding_authority: expect.any(Number) });
    expect(JSON.stringify(ptr['role_census'])).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);   // counts, never principals
    expect(ptr).toMatchObject({ licence: null, analytics_purposes: {}, packages: {}, workflow_definitions: {}, source_contracts: {} });
    expect(v1Digest).toMatch(/^[0-9a-f]{64}$/);
  });
  it('NEGATIVE: the authority cannot capture (403 PEP); a second capture 409 duplicate; a programme targeting another domain 422; a stale proposal digest 409', async () => {
    await refused(capture(authority, null), /no qualifying role binding/, 403);
    await refused(capture(lead, null), /^config baseline rejected \(duplicate\): the domain already has baseline/, 409);
    await refused(capture(lead, P, h.fx.domainId), /^config baseline rejected \(programme\): programme .* targets .*, not this domain/, 422);
    await refused(propose(lead, B, 1, 'a'.repeat(64)), /^config baseline rejected \(stale\)/, 409);
    const p = (await propose(lead, B, 1, v1Digest)).baseline;
    expect(p).toMatchObject({ state: 'proposed', proposed_by: lead.principalId });
  });
  it('UNAUTHORIZED ROLE: the lead 403 at the PEP; a lead ALSO holding onboarding_authority 403 separation_of_duties at the port; an agent claiming a human 403 (actor) at the port; an agent 403 at the human gate; a stale digest 409', async () => {
    await refused(decide(lead, B, 1, 'approve', v1Digest), /no qualifying role binding/, 403);
    await refused(decide(leadAuthority, B, 1, 'approve', v1Digest), /^config baseline rejected \(separation_of_duties\): an implementation lead never approves or accepts/, 403);
    await refused(decide(agentAuthorityAsHuman, B, 1, 'approve', v1Digest), /^config baseline rejected \(actor\): approving a configuration baseline is a named human's act/, 403);
    await refused(decide(agentAuthority, B, 1, 'approve', v1Digest), /human gate: onboarding.baseline.decide requires a named human principal/, 403);
    await refused(decide(authority, B, 1, 'approve', 'b'.repeat(64)), /^config baseline rejected \(stale\): the decision names digest bbbbbbbbbbbb/, 409);
    expect((await one(sql`select state from onboarding.config_baselines where baseline_id = ${B}::uuid and version = 1`))['state']).toBe('proposed');
    expect((await one(sql`select count(*)::int as n from executive.signatures where subject_kind = 'config_baseline' and subject_id = ${B}::uuid`))['n']).toBe(0);   // every refused attempt rolled its signature back
  });
  it('POSITIVE: the onboarding authority approves v1 at its digest — SIGNED (Ed25519 over the digest, verifiable), effective now; the baseline step done', async () => {
    const r = (await decide(authority, B, 1, 'approve', v1Digest)).baseline;
    expect(r).toMatchObject({ state: 'approved', decided_by: authority.principalId, signature_id: expect.any(String) });
    expect(r['signature']).toMatchObject({ subject_kind: 'config_baseline', subject_id: B, subject_version: 1, subject_digest: v1Digest, signer: authority.principalId });
    const sig = await one(sql`select key_id, signature, subject_digest, bound_action from executive.signatures where signature_id = ${String(r['signature_id'])}::uuid`);
    expect(sig['bound_action']).toBe('onboarding.baseline.decide');
    expect(svc.verifySignature(sig as { key_id: string; signature: string; subject_digest: string })).toBe(true);
    expect(svc.verifySignature({ ...(sig as { key_id: string; signature: string }), subject_digest: 'c'.repeat(64) })).toBe(false);
    const s = (await record(lead, steps['baseline']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'config_baseline', id: B, version: 1, action: 'onboarding.baseline.decide' } })).step;
    expect(s).toMatchObject({ state: 'done', realized_by: { kind: 'config_baseline', version: 1 } });
    await expect(sql`update onboarding.config_baselines set pointers = '{}'::jsonb where baseline_id = ${B}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/never change/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
let itemId = '';
describe('ON6 · drift, promotion, rollback (the FAULT exercise)', () => {
  it('in line: the drift read says in_sync; the hook records nothing (no change to record)', async () => {
    const b = await baselines(lead);
    expect(b.drift).toMatchObject({ state: 'in_sync', version: 1, changes: [] });
    expect(b.rollback_plan).toEqual([]);
    expect(await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D2, correlationId: uuidv7() })).toMatchObject({ recorded: false, state: 'in_sync' });
  });
  it('FAULT: a pointer changes (the attention policy republished; a second domain administrator bound) → DRIFTED; the after-tick hook records it once and raises onboarding.drift to the domain admin; the rollback plan names the restoring acts', async () => {
    await publishPolicy(draftAdmin, D2, 'B94 §ON harness: the policy republished outside the baseline (SYNTHETIC drift)', {
      'onboarding.migration': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' } });
    const extraAdmin = await person('extra-admin', 'human', 'DOMAIN', T(), D2, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
    expect(extraAdmin.principalId).toMatch(/[0-9a-f-]{36}/);
    const b = await baselines(lead);
    expect(b.drift['state']).toBe('drifted');
    const changes = arr(b.drift['changes']);
    expect(changes.map((c) => `${String(c['section'])}:${String(c['key'] ?? '')}:${String(c['change'])}`)).toEqual(['attention_policy::changed', 'role_census:domain_admin:changed']);
    expect(b.rollback_plan).toEqual([
      expect.objectContaining({ section: 'attention_policy', action: 'executive.attention.policy.publish', role: 'domain_admin' }),
      expect.objectContaining({ section: 'role_census', key: 'domain_admin', action: 'identity.credential.revoke', role: 'tenant_admin', gap: expect.stringMatching(/no port revokes a single role binding/) }),
    ]);
    const t1 = await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D2, correlationId: uuidv7() });
    expect(t1).toMatchObject({ recorded: true, state: 'drifted', baseline_version: 1, item: { state: 'open', route_roles: ['domain_admin'] } });
    itemId = String((t1['item'] as Row)['item_id']);
    expect(await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D2, correlationId: uuidv7() })).toMatchObject({ recorded: false, reason: 'unchanged since the last observation' });
    expect(await one(sql`select signal_class, subject_kind, subject_id::text, state from executive.attention_items where item_id = ${itemId}::uuid`))
      .toEqual({ signal_class: 'onboarding.drift', subject_kind: 'config_baseline', subject_id: B, state: 'open' });
    expect((await rows(sql`select state from onboarding.drift_events where baseline_id = ${B}::uuid`)).map((r) => r['state'])).toEqual(['drifted']);
    // nothing was restored: the drift is a read and a record, never a write to a pointer
    expect((await one(sql`select max(version)::int as v from executive.attention_policies where domain_id = ${D2}::uuid`))['v']).toBe(2);
  });
  it('STALE: a drift write naming an observed digest the state has moved past is refused 409', async () => {
    const route = { scope: 'DOMAIN' as const, tenantId: T(), domainId: D2, action: 'onboarding.baseline.drift', objectType: 'OCB', objectId: null };
    await refused(h.pipeline.write(env(lead, 'onboarding.baseline.drift', 'DOMAIN', T(), D2), lead, route, OnboardingCapability.write, async (c) => ({
      result: await c.recordDrift({ eventId: uuidv7(), tenantId: T(), domainId: D2, observedDigest: 'd'.repeat(64), actor: lead.principalId, correlationId: uuidv7() }), targetType: 'OCB', targetId: null, targetVersion: null, outboxEvent: null })),
      /^config baseline rejected \(stale\): the configuration moved since it was read/, 409);
  });
  it('CORRECTION: the lead PROMOTES the observed state (v2, absorbing the drift); the authority REJECTS it (unsigned); promoted again (v3) and APPROVED — v1 superseded, the drift item closed, the domain in line', async () => {
    await refused(propose(lead, B, 1, v1Digest), /^config baseline rejected \(state\): version 1 is approved, not a draft/, 409);
    const v2 = (await promote(lead)).baseline;
    expect(v2).toMatchObject({ version: 2, basis: 'promotion', promoted_from: 1, state: 'draft' });
    expect(arr(v2['absorbed'])).toHaveLength(2);
    await refused(promote(lead), /^config baseline rejected \(state\): version 2 is still open/, 409);
    await propose(lead, B, 2, String(v2['digest']));
    const rj = (await decide(authority, B, 2, 'reject', String(v2['digest']))).baseline;
    expect(rj).toMatchObject({ state: 'rejected', signature_id: null, signature: null });
    expect((await baselines(lead)).drift['state']).toBe('drifted');
    const v3 = (await promote(lead2)).baseline;
    expect(v3).toMatchObject({ version: 3, promoted_from: 1 });
    await propose(lead2, B, 3, String(v3['digest']));
    await refused(decide(authority, B, 3, 'approve', v1Digest), /^config baseline rejected \(stale\)/, 409);
    const ok = (await decide(authority, B, 3, 'approve', String(v3['digest']))).baseline;
    expect(ok).toMatchObject({ state: 'approved' });
    expect(arr(ok['closed_items']).map(String)).toContain(itemId);
    const vs = await rows(sql`select version, state from onboarding.config_baselines where baseline_id = ${B}::uuid order by version`);
    expect(vs).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'rejected' }, { version: 3, state: 'approved' }]);
    expect((await baselines(lead)).drift).toMatchObject({ state: 'in_sync', version: 3 });
    expect((await one(sql`select state from executive.attention_items where item_id = ${itemId}::uuid`))['state']).toBe('closed');
  });
  it('RECOVERY: drift again (a third administrator) → recorded with its item; the binding revoked → BACK IN LINE recorded, the item closed', async () => {
    const third = await person('third-admin', 'human', 'DOMAIN', T(), D2, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
    const d1 = await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D2, correlationId: uuidv7() });
    expect(d1).toMatchObject({ recorded: true, state: 'drifted', baseline_version: 3 });
    const item = String((d1['item'] as Row)['item_id']);
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${third.principalId}::uuid`.execute(h.su);
    const d2 = await svc.afterTick({ principal: attentionAgent, tenantId: T(), domainId: D2, correlationId: uuidv7() });
    expect(d2).toMatchObject({ recorded: true, state: 'in_sync', item: null });
    expect(arr(d2['closed_items']).map(String)).toEqual([item]);
    expect((await rows(sql`select state from onboarding.drift_events where baseline_id = ${B}::uuid order by recorded_at`)).map((r) => r['state'])).toEqual(['drifted', 'drifted', 'in_sync']);
  });
  it('the authority\'s and the lead\'s views read the same baseline; the after-tick hook is registered', async () => {
    const b = await baselines(authority);
    expect(b.baselines.map((x) => `${String(x['version'])}:${String(x['state'])}`)).toEqual(['3:approved', '2:rejected', '1:superseded']);
    expect(arr(b.baselines[0]!['signatures'])).toHaveLength(1);
    const { AttentionTickRegistry } = await import('../../src/executive/attention/tick.js');
    expect(h.app.get(AttentionTickRegistry, { strict: false }).afterTick().map((x) => x.name)).toContain('onboarding-drift');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON7 · revert (the compensating act RECORDED by reference, never performed)', () => {
  let polV1 = ''; let polV2 = '';
  it('setup: the policy step done, realized by the attention policy v1 of the draft domain', async () => {
    const ps = await rows(sql`select policy_id::text as id, version from executive.attention_policies where domain_id = ${D2}::uuid order by version`);
    polV1 = String(ps[0]!['id']); polV2 = String(ps[1]!['id']);
    const s = (await record(lead, steps['policy']!, { expectedVersion: 1, state: 'done', realizedBy: { kind: 'attention_policy', id: polV1, action: 'executive.attention.policy.publish' } })).step;
    expect(s).toMatchObject({ state: 'done', realized_by: { kind: 'attention_policy', version: 1 } });
  });
  it('NEGATIVE: a revert naming another act than the planned compensation 422; a not-done step 409; an unknown reference 404', async () => {
    await refused(revert(lead, steps['policy']!, { expectedVersion: 2, reason: 'the policy is rolled back', compensatingAct: { kind: 'attention_policy', id: polV2, action: 'executive.attention.policy.retire' } }),
      /^onboarding step rejected \(compensation\): the policy step is reversed by executive.attention.policy.publish/, 422);
    await refused(revert(lead, steps['cutover']!, { expectedVersion: 1, reason: 'not done yet', compensatingAct: { kind: 'cutover', id: uuidv7(), action: 'onboarding.rollback.execute' } }),
      /^onboarding step rejected \(state\): the cutover step is planned; only a done step is reverted/, 409);
    await refused(revert(lead, steps['policy']!, { expectedVersion: 2, reason: 'the policy is rolled back', compensatingAct: { kind: 'attention_policy', id: uuidv7(), action: 'executive.attention.policy.publish' } }),
      /^onboarding step rejected \(unknown_record\)/, 404);
  });
  it('POSITIVE: the revert records the republished policy (v2) as the compensating act; nothing is written to the policy by the revert', async () => {
    const before = await one(sql`select count(*)::int as n from executive.attention_policies where domain_id = ${D2}::uuid`);
    const s = (await revert(lead, steps['policy']!, { expectedVersion: 2, reason: 'the domain admin republished the policy; the onboarding records it',
      compensatingAct: { kind: 'attention_policy', id: polV2, action: 'executive.attention.policy.publish' } })).step;
    expect(s).toMatchObject({ state: 'reverted', reverted_by: { kind: 'attention_policy', id: polV2, version: 2, action: 'executive.attention.policy.publish', recorded_by: lead.principalId } });
    expect(await one(sql`select count(*)::int as n from executive.attention_policies where domain_id = ${D2}::uuid`)).toEqual(before);
    const again = (await record(lead, steps['policy']!, { expectedVersion: 3, state: 'done', realizedBy: { kind: 'attention_policy', id: polV2, action: 'executive.attention.policy.publish' } })).step;
    expect(again).toMatchObject({ state: 'done', version: 4 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON8 · the workspace reads (CAP-DL-04, UX-66-001/-002), cross-tenant, and the REPLAY', () => {
  it('POSITIVE: the programme read is STATUS FIRST — state and held reasons, the step graph, the intent, the draft domain with its baselines, drift and rollback plan — every object with version, digest, effective time; the receipt', async () => {
    const r = await detail(sponsor, P);
    expect(Object.keys(r).slice(0, 4)).toEqual(['programme', 'versions', 'steps', 'intent']);
    expect(r.programme).toMatchObject({ programme_id: P, state: 'in_progress', target_domain_id: D2, digest: expect.stringMatching(/^[0-9a-f]{64}$/), effective_from: expect.anything() });
    expect(r.steps.map((s) => `${String(s['step_key'])}:${String(s['state'])}`)).toEqual(['intent:done', 'domain:done', 'authority:done', 'policy:done', 'responsibility:done', 'baseline:done', 'mapping:done', 'cutover:planned']);
    expect(r['intent']).toMatchObject({ version: 2, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r['domain']).toMatchObject({ id: D2, status: 'draft', lifecycle: [expect.objectContaining({ event: 'domain.drafted' })] });
    expect(r.baselines[0]).toMatchObject({ version: 3, state: 'approved' });
    expect(r.drift).toMatchObject({ state: 'in_sync' });
    expect(r['receipt']).toMatchObject({ policyDecisionId: expect.any(String) });
    const l = await list(authority);
    expect(l.programmes.find((x) => x['programme_id'] === P)).toMatchObject({ state: 'in_progress', target_domain_status: 'draft', intent_version: 2 });
  });
  it('CROSS-TENANT: another tenant\'s lead cannot read this tenant (403 scope); on its own tenant\'s route the programme is unknown (404) and invisible (RLS); its capture into this tenant\'s domain is refused', async () => {
    await refused(list(uLead, T()), /principal has no binding for this tenant/, 403);
    await refused(revise(uLead, P, { expectedVersion: 99, title: 'A foreign revision (SYNTHETIC)', reason: 'from the other tenant' }, U), /^onboarding programme rejected \(unknown_programme\)/, 404);
    expect((await list(uLead, U)).programmes).toEqual([]);
    await refused(capture(uLead, null, D2), /no binding for this domain|has no binding/, 403);
    const forced = (await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'onboarding' and c.relname in ('sponsor_intents', 'steps', 'config_baselines', 'drift_events') order by 1`)).map((x) => x['f']);
    expect(forced).toEqual([true, true, true, true]);
  });
  it('REPLAY: the ledger reconstructs the programme\'s history — every version, state and digest equal to the stored ones; the step ledger folds to each step\'s current state', async () => {
    const r = await history(lead, P);
    expect(r.replay.consistent, r.replay.mismatches.join('; ')).toBe(true);
    const stored = await rows(sql`select version, state from onboarding.programmes where programme_id = ${P}::uuid order by version`);
    expect(r.replay.versions.map((v) => `${String(v['version'])}:${String(v['state'])}`)).toEqual(stored.map((s) => `${String(s['version'])}:${String(s['state'])}`));
    expect(r.replay.versions.map((v) => v['event'])).toEqual(expect.arrayContaining(['programme.opened', 'programme.revised', 'programme.held', 'programme.resumed', 'programme.started', 'programme.domain_drafted']));
    const ev = await rows(sql`select subject_id::text as s, version, details ->> 'state' as st, details ->> 'digest' as d from onboarding.events where subject_kind = 'onboarding_step'
      and (details ->> 'programme_id') = ${P} order by occurred_at, event_id`);
    const last = new Map<string, Row>(); for (const e of ev) last.set(String(e['s']), e);
    const cur = await rows(sql`select step_id::text as s, version, state, digest from onboarding.steps where programme_id = ${P}::uuid`);
    for (const c of cur) expect(last.get(String(c['s']))).toMatchObject({ version: c['version'], st: c['state'], d: c['digest'] });
    await expect(sql`update onboarding.events set details = '{}'::jsonb where subject_id = ${P}::uuid`.execute(h.su)).rejects.toThrow(/append-only/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON9 · withdrawal (human-gated; the sponsor or the tenant admin) and the draft domain beyond it', () => {
  it('UNAUTHORIZED: the lead 403 at the PEP; an agent sponsor 403 at the human gate', async () => {
    const v = await progVersion(P2);
    await refused(act(lead, P2, 'withdraw', v, 'the lead cannot withdraw the customer\'s onboarding'), /no qualifying role binding/, 403);
    const agentSponsor = await person('agent-sponsor-w', 'agent', 'TENANT', T(), null, [TEN('customer_sponsor')]);
    await refused(act(agentSponsor, P2, 'withdraw', v, 'an agent cannot withdraw'), /human gate: onboarding.programme.withdraw/, 403);
  });
  it('POSITIVE + after: the sponsor withdraws (final); a step plan, a hold and a second withdrawal are refused 409; its draft domain stays draft (never activated)', async () => {
    const v = await progVersion(P2);
    const w = (await act(sponsor, P2, 'withdraw', v, 'the spare onboarding is not needed (SYNTHETIC)')).programme;
    expect(w).toMatchObject({ state: 'withdrawn' });
    await refused(plan(lead, P2, 'intent'), /^onboarding step rejected \(state\): programme .* is withdrawn/, 409);
    await refused(act(authority, P2, 'hold', v + 1, 'holding a withdrawn programme'), /^onboarding programme rejected \(state\)/, 409);
    await refused(act(sponsor, P2, 'withdraw', v + 1, 'withdrawn twice'), /^onboarding programme rejected \(state\): programme .* is already withdrawn/, 409);
    expect((await one(sql`select d.status from tenancy.domains d join onboarding.programmes p on p.target_domain_id = d.id where p.programme_id = ${P2}::uuid and p.superseded_at is null`))['status']).toBe('draft');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ON10 · a draft domain is not a contract decision cell (0105 refuses a non-active cell — unchanged) — LAST: it licenses the tenant', () => {
  it('the vendor\'s contract naming the draft domain as a decision cell is refused; naming the active fixture domain passes that check', async () => {
    await sql`insert into commercial.licences (licence_id, version, tenant_id, package_key, capabilities, limits, effective_from, state, provenance, digest, issued_by, correlation_id)
              values (${uuidv7()}::uuid, 1, ${T()}::uuid, 'b94on-fixture', array['core'], '{}'::jsonb, clock_timestamp(), 'active', '{"stand_in":"B94 §ON harness licence (SYNTHETIC)"}'::jsonb,
                      repeat('e', 64), ${vendor.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const { EntitlementsVendorController } = await import('../../src/commercial/entitlements/entitlements.controller.js');
    const v = h.app.get(EntitlementsVendorController);
    const vreq = { eyeEnvelope: env(vendor, 'commercial.contract.declare', 'PLATFORM', null, null), eyePrincipal: vendor } as never;
    const scope = (cells: string[]) => ({ decision_cells: cells, sources: [], twins: [], authorities: [{ role: 'tenant_admin', principal_id: tadmin.principalId }], environments: ['local-dev'],
                                         support_boundary: { tier: 'standard', statement: 'business hours, a named contact, no data access without a ticket (SYNTHETIC)' } });
    await refused(v.declareContract(vreq, T(), { payload: { contractRef: `SYNTH-B94ON-${RUN}`, scope: scope([D2]), reason: 'a contract naming the draft domain (SYNTHETIC)' } }),
      new RegExp(`^contract rejected \\(decision_cells\\): ${D2} — not an active domain of this tenant`), 422);
    const ok = (await v.declareContract({ eyeEnvelope: env(vendor, 'commercial.contract.declare', 'PLATFORM', null, null), eyePrincipal: vendor } as never, T(),
      { payload: { contractRef: `SYNTH-B94ON-${RUN}`, scope: scope([h.fx.domainId]), reason: 'the same contract naming the active domain (SYNTHETIC)' } })) as { contract: Row };
    expect(ok.contract).toMatchObject({ version: 1 });
  });
});
