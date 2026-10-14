/**
 * CP-6 B94 §IM+§AD (migration 0114_b94_x_im.sql) — AT-68 on a real database through the real pipeline, PDP, ports and controllers: the
 * implementation programme (PR-68-001/-002, CAP-DL-07), readiness and the go-live gate (PR-68-003/-005, IA-04-005), go-live and its
 * acceptance record (PR-68-006, WS-20), enablement and adoption (CAP-DL-08: accessible training paths, subject-visible training and
 * competence records, cohorts above k), shadow workflows, and MET-039 (the carryover). Per clause: POSITIVE, REFUSAL and RECOVERY cases;
 * AT-68's fixture classes — positive, negative, stale, unauthorized role, cross-tenant, correction, replay — and the FAULT EXERCISE: the gate
 * HELD for an unfilled `risk.ownership` (and an inaccessible path, open shadow work, an unconfirmed item) → a risk owner bound → released →
 * go-live accepted and signed; a measure never releases it (and a measure marked misleading blocks); below-k adoption INDETERMINATE;
 * MET-039 indeterminate before acceptance and a value in days after.
 *
 * CONSTRUCTION ONLY: every principal, programme, path, record, contract and cadence here is SYNTHETIC fixture data; an in-product go-live
 * by a synthetic sponsor demonstrates the software — real customer acceptance (AT-68, PR-68-006) is R2 and never claimed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { ImplementationDomainController, ImplementationTenantController } from '../../src/delivery/implementation/implementation.controller.js';
import { ADOPTION_CONTRACTS } from '../../src/delivery/implementation/adoption-definitions.js';
import { definitionsB } from '../../src/analytics/computations-b/definitions-b.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import type { Db } from '../../src/shared/db.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';

// THE SIGNING KEY: generated here, bound in the process before the boot (the B36 signer's discipline).
const KEY = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
let h: Phase4Harness; let tc: ImplementationTenantController; let dc: ImplementationDomainController; let ac: AnalyticsComputeController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const hex = (seed: string = uuidv7()) => createHash('sha256').update(seed).digest('hex');
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

let lead: AuthenticatedPrincipal; let sponsor: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let leadSponsor: AuthenticatedPrincipal;
let tadmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let assessor: AuthenticatedPrincipal; let agentSponsor: AuthenticatedPrincipal;
let analystReader: AuthenticatedPrincipal; let pao: AuthenticatedPrincipal; let execs: AuthenticatedPrincipal[] = []; let analysts: string[] = [];
let programmeId = ''; let cadenceId = ''; let matrixId = '';

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const ex = async (q: ReturnType<typeof sql>) => { await q.execute(h.su); };

// ── the routes (in process): a TENANT envelope for the tenant acts, a DOMAIN one (the target domain) for the rest ──────────────────
const treq = (as: AuthenticatedPrincipal, action: string, id: string | null = null, tenant: string = T()) =>
  ({ eyeEnvelope: { ...h.env(as, action, 'IMP', id, 'implementation'), scope: 'TENANT', tenant_id: tenant, domain_id: null }, eyePrincipal: as }) as never;
const dreq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'IMP', id, 'implementation');
const P = (payload: Row) => ({ payload });
const open = (as: AuthenticatedPrincipal, payload: Row) => tc.open(treq(as, 'implementation.programme.open'), T(), P(payload)) as Promise<{ programme: Row }>;
const tread = (as: AuthenticatedPrincipal, id: string) => tc.read(treq(as, 'implementation.read', id), T(), id) as Promise<Row & { gate: Row; programme: Row }>;
const dread = (as: AuthenticatedPrincipal, id: string = programmeId) => dc.read(dreq(as, 'implementation.read', id), T(), D(), id) as Promise<Row & { gate: Row; programme: Row; enablement: Row; readiness: Row[] }>;
const act = (as: AuthenticatedPrincipal, a: string, expectedVersion: number, reason: string, id: string = programmeId) =>
  tc.transition(treq(as, `implementation.programme.${a}`, id), T(), id, a, P({ expectedVersion, reason })) as Promise<{ programme: Row }>;
const item = (as: AuthenticatedPrincipal, payload: Row) => tc.recordItem(treq(as, 'implementation.item.record', programmeId), T(), programmeId, P(payload)) as Promise<{ item: Row }>;
const declare = (as: AuthenticatedPrincipal, payload: Row) => dc.declareReadiness(dreq(as, 'implementation.readiness.declare', programmeId), T(), D(), programmeId, P(payload)) as Promise<{ item: Row }>;
const gate = async (as: AuthenticatedPrincipal = lead) => (await dc.evaluate(dreq(as, 'implementation.gate.evaluate', programmeId), T(), D(), programmeId) as { gate: Row }).gate;
const golive = (as: AuthenticatedPrincipal, payload: Row, id: string = programmeId) => dc.golive(dreq(as, 'implementation.golive.approve', id), T(), D(), id, P(payload)) as Promise<{ decision: Row }>;
const path = (as: AuthenticatedPrincipal, payload: Row) => dc.declarePath(dreq(as, 'implementation.training.path.declare'), T(), D(), P(payload)) as Promise<{ path: Row }>;
const attest = (as: AuthenticatedPrincipal, pid: string, payload: Row) => dc.attestPath(dreq(as, 'implementation.training.path.attest', pid), T(), D(), pid, P(payload)) as Promise<{ attestation: Row }>;
const train = (as: AuthenticatedPrincipal, payload: Row) => dc.recordTraining(dreq(as, 'implementation.training.record'), T(), D(), P(payload)) as Promise<{ record: Row }>;
const competence = (as: AuthenticatedPrincipal, payload: Row) => dc.recordCompetence(dreq(as, 'implementation.competence.record'), T(), D(), P(payload)) as Promise<{ record: Row }>;
const blockingKinds = (g: Row) => arr(g['blocking']).map((b) => `${String(b['kind'])}:${String(b['item_key'])}`);
const itemOf = (g: Row, key: string) => arr(g['items']).find((i) => i['item_key'] === key) as Row;
const openItems = async (cls: string) => Number((await one(sql`select count(*)::int as n from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid
  and signal_class = ${cls} and subject_id = ${programmeId}::uuid and state <> 'closed'`))['n']);
const compute = async (as: AuthenticatedPrincipal, payload: Row) => (await ac.compute(h.req(as, 'analytics.metric.compute', 'AMR', null, 'intelligence'), T(), D(), P(payload)) as { result: Row }).result;
const currentQuarter = async () => String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY') || '-Q' || to_char(clock_timestamp() at time zone 'UTC', 'Q') as q`))['q']);
const currentMonth = async () => String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM') as m`))['m']);

/** An APPROVED B92 definition planted by the superuser (the §MD port is B92's; the compute port only reads definitions). */
async function plantDef(cn: MetricContract): Promise<string> {
  const id = uuidv7();
  await ex(sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      exclusions, window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality, cost_allocation,
      computation_key, params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${cn.metricKey}, 1, ${`${cn.title} (SYNTHETIC)`}, ${cn.meaning}, ${cn.kind}, ${cn.unit}, ${cn.direction}, ${JSON.stringify(cn.population)}::jsonb,
      ${cn.numerator}, ${cn.denominator}, ${JSON.stringify(cn.exclusions)}::jsonb, ${JSON.stringify(cn.window)}::jsonb, ${cn.dimensions}::text[], ${cn.privacyClass}, ${cn.kMin}, ${cn.floorN},
      ${JSON.stringify(cn.threshold)}::jsonb, ${cn.purposeKey}, ${JSON.stringify(cn.serves)}::jsonb, ${cn.cadence}, ${pao.principalId}::uuid, ${cn.action}, ${cn.retirement},
      ${JSON.stringify(cn.quality)}::jsonb, ${JSON.stringify(cn.costAllocation)}::jsonb, ${cn.computationKey}, ${JSON.stringify(cn.params)}::jsonb, ${cn.computationKey !== null}, ${cn.unsupportedReason},
      ${cn.sourceRefs}::text[], 'approved', analytics.digest(${JSON.stringify(cn)}::jsonb), ${tadmin.principalId}::uuid, 'human', ${pao.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`);
  return id;
}

/** A TENANT-homed agent holding customer_sponsor, with a session (the PDP's human gate refuses it; the port refuses it too). */
async function agentWith(role: string): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await ex(sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
    values (${id}::uuid, 'agent', 'TENANT', ${T()}::uuid, null, ${`b94im-agent-${RUN} (SYNTHETIC)`}, ${`b94im-ag-${id.slice(-8)}`}, 'active')`);
  await ex(sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'TENANT', ${T()}::uuid, null)`);
  return h.openSession({ ...h.manager, principalId: id, kind: 'agent', assurance: 'agent_grant', homeScope: 'TENANT', homeDomainId: null,
    bindings: [{ roleCode: role, scope: 'TENANT', tenantId: T(), domainId: null }] } as AuthenticatedPrincipal);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  tc = h.app.get(ImplementationTenantController); dc = h.app.get(ImplementationDomainController); ac = h.app.get(AnalyticsComputeController);
  lead = await h.humanWithSession(['implementation_lead'], 'b94im-lead', 'TENANT');
  sponsor = await h.humanWithSession(['customer_sponsor'], 'b94im-sponsor', 'TENANT');
  authority = await h.humanWithSession(['onboarding_authority'], 'b94im-authority', 'TENANT');
  leadSponsor = await h.humanWithSession(['implementation_lead', 'customer_sponsor'], 'b94im-leadsponsor', 'TENANT');
  tadmin = await h.humanWithSession(['tenant_admin'], 'b94im-tadmin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b94im-dadmin');
  assessor = await h.humanWithSession(['enablement_assessor'], 'b94im-assessor');
  analystReader = await h.humanWithSession(['domain_analyst'], 'b94im-analyst-reader');
  pao = await h.humanWithSession(['product_analytics_owner'], 'b94im-pao');
  for (let i = 0; i < 3; i++) execs.push(await h.humanWithSession(['executive'], `b94im-exec-${i}`));
  for (let i = 0; i < 6; i++) analysts.push((await h.principalWith(['domain_analyst'], `b94im-analyst-${i}`)).principalId);
  agentSponsor = await agentWith('customer_sponsor');
  // THE RESPONSIBILITY MATRIX (§SA's ports are another part's): an approved matrix planted by the superuser (the prelude's idiom) — risk.ownership → risk_owner.
  matrixId = uuidv7();
  await ex(sql`insert into service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, state, digest, proposed_by, decided_by, decided_at, signature_id, correlation_id)
    values (${matrixId}::uuid, 1, ${T()}::uuid, ${D()}::uuid, 'approved', ${hex('matrix')}, ${lead.principalId}::uuid, ${authority.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid, ${uuidv7()}::uuid)`);
  await ex(sql`insert into service.responsibility_rows (matrix_id, version, responsibility_key, tenant_id, domain_id, title, owner_role, operator_role, customer_authority, access_path, evidence_producer, escalation_path)
    values (${matrixId}::uuid, 1, 'risk.ownership', ${T()}::uuid, ${D()}::uuid, 'Risk ownership of the domain (SYNTHETIC)', 'risk_owner', 'domain_admin', 'onboarding_authority',
            'the domain workspace', 'the exposure ledger', 'the domain admin, then the customer sponsor')`);
  // THE OPERATING CADENCE of the domain (B36's table; planted — the cadence port is B36's).
  cadenceId = uuidv7();
  await ex(sql`insert into executive.cadences (cadence_id, scope, tenant_id, domain_id, period, sequence, opened_by, correlation_id)
    values (${cadenceId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'weekly', 1, ${dadmin.principalId}::uuid, ${uuidv7()}::uuid)`);
  // THE ATTENTION POLICY of the domain routes the gate's items to the domain admin (the B33-F idiom): a held gate is ROUTED, never silently deprioritized.
  const { ExecutiveController } = await import('../../src/executive/executive.controller.js');
  await h.app.get(ExecutiveController).publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B94 §IM harness: readiness and responsibility gaps to the domain administrator',
    rules: { classes: {
      'implementation.readiness': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
      'responsibility.gap': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  for (const cn of ADOPTION_CONTRACTS) await plantDef(cn);
  await plantDef(definitionsB.find((x) => x.metricKey === 'MET-039')!);
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('IM1 · the implementation programme (PR-68-001/-002, CAP-DL-07) — TENANT acts', () => {
  it('fixture: nobody holds risk_owner in the domain yet (the gap the fault exercise fills)', async () => {
    expect(Number((await one(sql`select count(*)::int as n from identity.role_bindings where role_code = 'risk_owner' and revoked_at is null and tenant_id = ${T()}::uuid`))['n'])).toBe(0);
  });
  it('positive: the implementation lead opens a programme on the target domain (v1, planned, digested); the tenant admin may too', async () => {
    const r = await open(lead, { key: `corridor-golive-${RUN}`, title: 'Corridor workspace go-live (SYNTHETIC)', targetDomainId: D(),
      plan: { objective: 'move the corridor team from the spreadsheet to governed operation (SYNTHETIC)', scope: 'the corridor workspace' } });
    programmeId = String(r.programme['programme_id']);
    expect(r.programme).toMatchObject({ version: 1, state: 'planned', target_domain_id: D(), owner_principal_id: lead.principalId });
    expect(String(r.programme['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const t2 = await open(tadmin, { key: `withhold-demo-${RUN}`, title: 'A second programme (SYNTHETIC)', targetDomainId: D(), plan: { objective: 'a second programme for the withhold case' } });
    expect(t2.programme).toMatchObject({ state: 'planned' });
  });
  it('negative: no objective (422 plan) · an unknown domain (404) · a duplicate key (409) · a DOMAIN role on the TENANT route (403) · the sponsor opening (403)', async () => {
    await refused(open(lead, { key: `x-${RUN}`, title: 'No objective here', targetDomainId: D(), plan: {} }), /^implementation programme rejected \(plan\)/, 422);
    await refused(open(lead, { key: `y-${RUN}`, title: 'Unknown domain', targetDomainId: uuidv7(), plan: { objective: 'an objective of eight characters' } }), /^implementation programme rejected \(unknown_domain\)/, 404);
    await refused(open(lead, { key: `corridor-golive-${RUN}`, title: 'Duplicate', targetDomainId: D(), plan: { objective: 'an objective of eight characters' } }), /^implementation programme rejected \(duplicate\)/, 409);
    await refused(open(dadmin, { key: `z-${RUN}`, title: 'A domain admin', targetDomainId: D(), plan: { objective: 'an objective of eight characters' } }), /./, 403);
    await refused(open(sponsor, { key: `w-${RUN}`, title: 'The sponsor', targetDomainId: D(), plan: { objective: 'an objective of eight characters' } }), /./, 403);
  });
  it('stale + correction: a revision at the wrong version is refused 409; at v1 it writes v2; start, hold (the sponsor), resume', async () => {
    await refused(tc.revise(treq(lead, 'implementation.programme.revise', programmeId), T(), programmeId, P({ expectedVersion: 7, title: 'Corridor workspace go-live v2 (SYNTHETIC)' })), /^implementation programme rejected \(stale\)/, 409);
    const v2 = (await tc.revise(treq(lead, 'implementation.programme.revise', programmeId), T(), programmeId, P({ expectedVersion: 1, title: 'Corridor workspace go-live v2 (SYNTHETIC)' })) as { programme: Row }).programme;
    expect(v2).toMatchObject({ version: 2, state: 'planned', title: 'Corridor workspace go-live v2 (SYNTHETIC)' });
    expect((await act(lead, 'start', 2, 'the programme starts its rollout')).programme).toMatchObject({ version: 3, state: 'in_progress' });
    await refused(act(lead, 'start', 3, 'start again is not a transition'), /^implementation programme rejected \(state\)/, 409);
    expect((await act(sponsor, 'hold', 3, 'the sponsor holds the rollout for the board')).programme).toMatchObject({ version: 4, state: 'held', held_reasons: ['the sponsor holds the rollout for the board'] });
    expect((await act(sponsor, 'resume', 4, 'the board cleared the rollout to continue')).programme).toMatchObject({ version: 5, state: 'in_progress', held_reasons: [] });
    await refused(tc.transition(treq(lead, 'implementation.programme.fly', programmeId), T(), programmeId, 'fly', P({ expectedVersion: 5, reason: 'no such act exists' })), /\(act\)/, 404);
  });
  it('parts (PR-68-002): milestones, a dependency, a stakeholder, a process, journeys (one PRIORITY), a risk, an outcome, feedback BY ROLE, a role requirement, a value measure; corrections are versions', async () => {
    await item(lead, { kind: 'milestone', key: 'm-train', title: 'Executives trained (SYNTHETIC)', attributes: { due_on: '2026-11-15' } });
    await item(lead, { kind: 'milestone', key: 'm-golive', title: 'Go-live (SYNTHETIC)', attributes: { due_on: '2026-12-01' } });
    expect((await item(lead, { kind: 'dependency', key: 'd-train-golive', title: 'Go-live after training', attributes: { from_key: 'm-train', to_key: 'm-golive' } })).item).toMatchObject({ attributes: { relation: 'finish_to_start' } });
    await refused(item(lead, { kind: 'dependency', key: 'd-bad', title: 'A dependency on nothing', attributes: { from_key: 'm-train', to_key: 'm-none' } }), /\(attributes\)/, 422);
    await item(lead, { kind: 'stakeholder', key: 's-sponsor', title: 'The customer sponsor', attributes: { role: 'customer_sponsor', principal_id: sponsor.principalId, interest: 'owns the change' } });
    await refused(item(lead, { kind: 'stakeholder', key: 's-wrong', title: 'A misnamed holder', attributes: { role: 'customer_sponsor', principal_id: lead.principalId, interest: 'not a sponsor' } }), /\(attributes\)/, 422);
    await item(lead, { kind: 'process', key: 'p-risk-review', title: 'Supplier risk review', attributes: { current_practice: 'a spreadsheet emailed weekly', target_workflow: 'the governed exposure review' } });
    await item(lead, { kind: 'journey', key: 'j-briefing', title: 'Executive briefing journey', attributes: { journey_ref: 'JRN-01', priority: true } });
    await item(lead, { kind: 'journey', key: 'j-archive', title: 'Archive browsing journey', attributes: { journey_ref: 'JRN-09', priority: false } });
    await item(lead, { kind: 'risk', key: 'r-adoption', title: 'Executives keep the spreadsheet', attributes: { likelihood: 'medium', owner_role: 'customer_sponsor' } });
    await item(lead, { kind: 'outcome', key: 'o-cycle', title: 'Weekly cadence on governed records', attributes: { statement: 'the weekly review runs on the governed exposure records' } });
    await item(lead, { kind: 'feedback', key: 'f-exec', title: 'Executive feedback', attributes: { statement: 'the briefing needs fewer columns', from_role: 'executive' } });
    await refused(item(lead, { kind: 'feedback', key: 'f-person', title: 'Feedback naming a person', attributes: { statement: 'this person was slow to adopt', principal_id: execs[0]!.principalId } }), /^implementation programme rejected \(person\)/, 403);
    await item(lead, { kind: 'role_requirement', key: 'rr-risk-owner', title: 'A risk owner in the domain', attributes: { role: 'risk_owner' } });
    await item(lead, { kind: 'value_measure', key: 'vm-adp001', title: 'Training completion (ADP-001)', attributes: { metric_key: 'ADP-001', cited_in_readiness: true } });
    await refused(item(lead, { kind: 'milestone', key: 'm-train', title: 'Executives trained (v2)', attributes: { due_on: '2026-11-20' }, expectedVersion: 0 }), /^implementation programme rejected \(stale\)/, 409);
    expect((await item(lead, { kind: 'milestone', key: 'm-train', title: 'Executives trained (v2)', attributes: { due_on: '2026-11-20' }, expectedVersion: 1 })).item).toMatchObject({ version: 2 });
    await refused(item(sponsor, { kind: 'milestone', key: 'm-x', title: 'The sponsor records parts', attributes: { due_on: '2026-11-20' } }), /./, 403);
  });
  it('changes (PR-68-003): proposed by the lead; decided ONLY by the sponsor or the authority on the digest — the lead, a lead holding the sponsor role, an agent refused; stale refused', async () => {
    const c = (await tc.proposeChange(treq(lead, 'implementation.change.propose', programmeId), T(), programmeId, P({ title: 'Move go-live a week (SYNTHETIC)', description: 'training needs one more week' })) as { change: Row }).change;
    const decide = (as: AuthenticatedPrincipal, payload: Row) => tc.decideChange(treq(as, 'implementation.change.approve', String(c['change_id'])), T(), String(c['change_id']), P(payload));
    const ok = { decision: 'approve', digest: String(c['digest']), reason: 'the sponsor accepts the one-week shift' };
    await refused(decide(lead, ok), /./, 403);                                                                         // the PDP: no approving rule for a lead
    await refused(decide(leadSponsor, ok), /^implementation change rejected \(separation_of_duties\): an implementation lead never approves/, 403);   // the port
    await refused(decide(agentSponsor, ok), /./, 403);                                                                  // the human gate
    await refused(decide(sponsor, { ...ok, digest: hex('other') }), /^implementation change rejected \(stale\)/, 409);
    expect(((await decide(sponsor, ok)) as { change: Row }).change).toMatchObject({ state: 'approved', decided_by: sponsor.principalId });
    await refused(decide(authority, ok), /^implementation change rejected \(state\)/, 409);
  });
  it('cross-tenant: another tenant\'s programme is invisible (404) and its routes refuse this tenant\'s principals (403)', async () => {
    const t2 = uuidv7(); const d2 = uuidv7(); const p2 = uuidv7();
    await ex(sql`insert into tenancy.tenants (id, name, status, activated_at) values (${t2}::uuid, ${`b94im-other-${RUN} (SYNTHETIC)`}, 'active', clock_timestamp())`);
    await ex(sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${d2}::uuid, ${t2}::uuid, ${`other domain ${RUN}`}, 'active', clock_timestamp())`);
    await ex(sql`insert into implementation.programmes (programme_id, version, tenant_id, programme_key, title, target_domain_id, owner_principal_id, digest, created_by, correlation_id)
      values (${p2}::uuid, 1, ${t2}::uuid, ${`other-${RUN}`}, 'Another tenant''s programme (SYNTHETIC)', ${d2}::uuid, ${uuidv7()}::uuid, ${hex()}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`);
    await refused(tread(lead, p2), /^implementation programme rejected \(unknown_programme\)/, 404);
    await refused(tc.read(treq(lead, 'implementation.read', p2, t2), t2, p2), /./, 403);
    await refused(dc.declareReadiness({ eyeEnvelope: { ...h.env(lead, 'implementation.readiness.declare', 'IMP', p2, 'implementation'), tenant_id: t2, domain_id: d2 }, eyePrincipal: lead } as never, t2, d2, p2,
      P({ key: 'x-item', kind: 'shadow_review', title: 'Cross-tenant item' })), /./, 403);
  });
});

describe('AD1 · enablement: accessible paths, subject-visible training and competence (CAP-DL-08, PR-68-005)', () => {
  let pathId = ''; let v1Digest = '';
  it('a path declared by the lead; attested INACCESSIBLE by the domain admin (a named human ≠ declarer); the lead never attests (403)', async () => {
    const p = (await path(lead, { programmeId, key: 'exec-onboarding', title: 'Executive onboarding (SYNTHETIC)', roles: ['executive'], contentRef: 'kb://enablement/exec-onboarding/v1' })).path;
    pathId = String(p['path_id']); v1Digest = String(p['digest']);
    expect(p).toMatchObject({ version: 1, roles: ['executive'], state: 'active' });
    await refused(attest(lead, pathId, { version: 1, digest: v1Digest, verdict: 'accessible', statement: 'the lead checked it' }), /./, 403);
    const a = (await attest(dadmin, pathId, { version: 1, digest: v1Digest, verdict: 'inaccessible', statement: 'the video has no captions; the slides fail contrast' })).attestation;
    expect(a).toMatchObject({ verdict: 'inaccessible', attested_by: dadmin.principalId });
  });
  it('remediation is a NEW version; the old digest is stale (409); the new version attested accessible', async () => {
    const v2 = (await path(lead, { programmeId, key: 'exec-onboarding', title: 'Executive onboarding — captioned (SYNTHETIC)', roles: ['executive'], contentRef: 'kb://enablement/exec-onboarding/v2', expectedVersion: 1 })).path;
    expect(v2).toMatchObject({ version: 2 });
    await refused(attest(dadmin, pathId, { version: 2, digest: v1Digest, verdict: 'accessible', statement: 'captions added and contrast fixed' }), /^training path rejected \(stale\)/, 409);
    expect((await attest(dadmin, pathId, { version: 2, digest: String(v2['digest']), verdict: 'accessible', statement: 'captions added and contrast fixed' })).attestation).toMatchObject({ verdict: 'accessible' });
  });
  it('training records: the lead records completion for each executive; a score, a performance purpose, the lead\'s own record and a non-holder are refused', async () => {
    await refused(train(lead, { pathId, version: 2, subject: execs[0]!.principalId, state: 'complete', score: 92 }), /^training record rejected \(person\)/, 403);
    await refused(train(lead, { pathId, version: 2, subject: execs[0]!.principalId, state: 'complete', purpose: 'performance_review' }), /^training record rejected \(purpose\)/, 422);
    await refused(train(lead, { pathId, version: 2, subject: lead.principalId, state: 'complete' }), /^training record rejected \(separation_of_duties\)/, 403);
    await refused(train(lead, { pathId, version: 2, subject: dadmin.principalId, state: 'complete' }), /^training record rejected \(subject\)/, 422);
    await refused(train(lead, { pathId, version: 1, subject: execs[0]!.principalId, state: 'complete' }), /^training record rejected \(state\)/, 409);
    await refused(train(execs[1]!, { pathId, version: 2, subject: execs[0]!.principalId, state: 'complete' }), /./, 403);
    for (const e of execs.slice(0, 2)) expect((await train(lead, { pathId, version: 2, subject: e.principalId, state: 'complete' })).record).toMatchObject({ state: 'complete', purpose: 'enablement_readiness' });
  });
  it('competence: a named enablement assessor records complete | not_yet (correction by a new record); the lead and the subject never do', async () => {
    await refused(competence(lead, { competenceKey: 'decision-briefing', role: 'executive', subject: execs[0]!.principalId, outcome: 'complete' }), /./, 403);
    await refused(competence(assessor, { competenceKey: 'decision-briefing', role: 'executive', subject: execs[0]!.principalId, outcome: 'complete', rank: 1 }), /^competence record rejected \(person\)/, 403);
    await refused(competence(assessor, { competenceKey: 'decision-briefing', role: 'executive', subject: assessor.principalId, outcome: 'complete' }), /^competence record rejected \(separation_of_duties\)/, 403);
    expect((await competence(assessor, { competenceKey: 'decision-briefing', role: 'executive', subject: execs[0]!.principalId, outcome: 'not_yet' })).record).toMatchObject({ outcome: 'not_yet' });
    for (const e of execs) await competence(assessor, { competenceKey: 'decision-briefing', role: 'executive', subject: e.principalId, outcome: 'complete', note: 'briefed the corridor review (SYNTHETIC)' });
  });
  it('subject-visible, never a directory: an executive reads its OWN records; another reader sees no one else\'s; the sponsor (an authority) sees them all', async () => {
    const mine = await dc.myRecords(dreq(execs[0]!, 'implementation.self.read', execs[0]!.principalId), T(), D()) as { training: Row[]; competence: Row[] };
    expect(mine.training.map((r) => r['state'])).toEqual(['complete']);
    expect(mine.competence.map((r) => r['outcome'])).toEqual(['complete', 'not_yet']);
    const other = await dread(analystReader);
    expect(arr((other.enablement['records'] as Row)['training'])).toEqual([]);
    expect(arr((other.enablement['records'] as Row)['competence'])).toEqual([]);
    const all = await dread(sponsor);
    expect(arr((all.enablement['records'] as Row)['training']).length).toBe(2);
    const cov = arr((other.enablement['coverage'] as Row)['paths']).find((x) => x['path_key'] === 'exec-onboarding') as Row;
    expect(arr(cov['by_role'])).toEqual([{ role: 'executive', holders: 3, complete: 2 }]);   // counts per role, never a name
  });
});

describe('IM2 · readiness items and the gate, evaluated LIVE (PR-68-003/-005, IA-04-005) — the fault exercise', () => {
  it('the lead declares the readiness items on the target domain; an executive cannot (403); a custom item confirmable by a lead is refused', async () => {
    const items: Row[] = [
      { key: 'role-risk-owner', kind: 'role_filled', title: 'A risk owner holds the domain', spec: { role: 'risk_owner' } },
      { key: 'owner-risk', kind: 'owner_resolved', title: 'Risk ownership resolves', spec: { responsibility: 'risk.ownership' } },
      { key: 'exec-training', kind: 'training_coverage', title: 'Executives trained', spec: { path_key: 'exec-onboarding', roles: ['executive'] } },
      { key: 'exec-access', kind: 'accessibility_attested', title: 'The executive path is accessible', spec: { path_key: 'exec-onboarding' } },
      { key: 'exec-competence', kind: 'competence_coverage', title: 'Executives competent in decision briefing', spec: { competence_key: 'decision-briefing', roles: ['executive'] } },
      { key: 'shadow-review', kind: 'shadow_review', title: 'No shadow spreadsheet practice', spec: {} },
      { key: 'ops-briefing', kind: 'custom', title: 'Operations briefed on the cutover', spec: { statement: 'operations were briefed on the cutover runbook', confirm_role: 'domain_admin' } },
      { key: 'retention-note', kind: 'custom', title: 'Retention note circulated', spec: { statement: 'the retention note was circulated to the team', confirm_role: 'domain_admin' } },
    ];
    for (const i of items) expect((await declare(lead, i)).item).toMatchObject({ version: 1, blocking: true });
    await refused(declare(execs[0]!, { key: 'exec-item', kind: 'shadow_review', title: 'An executive declares' }), /./, 403);
    await refused(declare(lead, { key: 'lead-confirms', kind: 'custom', title: 'Confirmed by the lead', spec: { statement: 'the lead confirms itself', confirm_role: 'implementation_lead' } }), /\(separation_of_duties\)/, 403);
  });
  it('HELD: the risk owner unfilled (not overridable), the owner unresolved, training incomplete, the item unconfirmed, the shadow review undeclared — `implementation.readiness` and `responsibility.gap` raised', async () => {
    const g = await gate(lead);
    expect(g['state']).toBe('held');
    expect(blockingKinds(g)).toEqual(expect.arrayContaining(['role_filled:role-risk-owner', 'owner_resolved:owner-risk', 'training_coverage:exec-training', 'shadow_review:shadow-review',
      'custom:ops-briefing', 'custom:retention-note']));
    expect(itemOf(g, 'exec-access')['state']).toBe('satisfied');
    expect(itemOf(g, 'exec-competence')['state']).toBe('satisfied');
    expect(String(itemOf(g, 'role-risk-owner')['reason'])).toMatch(/nobody holds risk_owner in the domain — an unfilled accountable role is not overridable/);
    expect(itemOf(g, 'owner-risk')['facts']).toMatchObject({ state: 'unfilled', owner_role: 'risk_owner' });
    expect(itemOf(g, 'exec-training')['facts']).toMatchObject({ holders: 3, complete: 2, accessibility: 'accessible' });
    expect(g['owner_gap']).toBe(true);
    expect(await openItems('implementation.readiness')).toBe(1);
    expect(await openItems('responsibility.gap')).toBe(1);
    expect(arr(g['raised']).map((x) => [x['class'], x['state']])).toEqual([['implementation.readiness', 'open'], ['responsibility.gap', 'open']]);   // ROUTED to the domain admin
    await gate(sponsor);                                                                                               // re-evaluation never duplicates an open item
    expect(await openItems('implementation.readiness')).toBe(1);
  });
  it('an inaccessible path BLOCKS: a new version attested inaccessible makes exec-access and exec-training unsatisfied; attested accessible again, they recover', async () => {
    const pth = (await one(sql`select path_id::text as id, version, digest from implementation.training_paths where domain_id = ${D()}::uuid and path_key = 'exec-onboarding' and superseded_at is null`));
    await attest(assessor, String(pth['id']), { version: Number(pth['version']), digest: String(pth['digest']), verdict: 'inaccessible', statement: 'a screen-reader check failed on module 3' });
    const g = await gate(lead);
    expect(itemOf(g, 'exec-access')).toMatchObject({ state: 'unsatisfied', overridable: false });
    expect(String(itemOf(g, 'exec-training')['reason'])).toMatch(/inaccessible or unattested path does not count/);
    await attest(dadmin, String(pth['id']), { version: Number(pth['version']), digest: String(pth['digest']), verdict: 'accessible', statement: 'module 3 fixed and re-checked with a screen reader' });
    expect(itemOf(await gate(lead), 'exec-access')['state']).toBe('satisfied');
  });
  it('GO-LIVE REFUSED while held: the sponsor 409 held (the blocking list answered); the lead 403; a lead holding the sponsor role 403 (separation of duties); an agent 403', async () => {
    const g = await gate(lead);
    const body = { decision: 'approve', gateDigest: String(g['digest']), cadenceId, journeys: [String((await one(sql`select item_id::text as id from implementation.programme_items where programme_id = ${programmeId}::uuid and item_key = 'j-briefing' and superseded_at is null`))['id'])], reason: 'the sponsor accepts go-live' };
    const r = await refused(golive(sponsor, body), /^go-live gate rejected \(held\): the gate is held — .*nobody holds risk_owner/, 409);
    expect(arr((r.body['gate'] as Row)['blocking']).length).toBeGreaterThan(0);
    await refused(golive(lead, body), /./, 403);
    await refused(golive(leadSponsor, body), /^go-live gate rejected \(separation_of_duties\): an implementation lead never approves/, 403);
    await refused(golive(agentSponsor, body), /./, 403);
    expect(Number((await one(sql`select count(*)::int as n from implementation.golive_decisions where programme_id = ${programmeId}::uuid`))['n'])).toBe(0);
  });
  it('NOT OVERRIDABLE: the authority cannot accept the unfilled role as residual risk, cannot retire it, cannot make it non-blocking', async () => {
    const it0 = (await one(sql`select item_id::text as id, version, digest from implementation.readiness_items where programme_id = ${programmeId}::uuid and item_key = 'role-risk-owner' and superseded_at is null`));
    await refused(dc.acceptResidual(dreq(authority, 'implementation.readiness.accept_residual', String(it0['id'])), T(), D(), String(it0['id']),
      P({ version: Number(it0['version']), digest: String(it0['digest']), reason: 'we accept running without a risk owner' })), /^readiness item rejected \(held\): a role_filled item is not overridable/, 409);
    await refused(dc.retireReadiness(dreq(authority, 'implementation.readiness.retire', String(it0['id'])), T(), D(), String(it0['id']),
      P({ expectedVersion: Number(it0['version']), reason: 'retiring the risk owner requirement' })), /^readiness item rejected \(held\): role-risk-owner is unsatisfied/, 409);
    await refused(declare(authority, { key: 'role-risk-owner', kind: 'role_filled', title: 'A risk owner holds the domain', spec: { role: 'risk_owner' }, blocking: false, expectedVersion: 1 }),
      /^readiness item rejected \(held\): role-risk-owner is unsatisfied/, 409);
    await refused(declare(lead, { key: 'role-risk-owner', kind: 'role_filled', title: 'A risk owner holds the domain', spec: { role: 'risk_owner' }, blocking: false, expectedVersion: 1 }),
      /^readiness item rejected \((authority|separation_of_duties)\)/, 403);
  });
  it('A MEASURE NEVER RELEASES THE GATE; a measure marked MISLEADING (an approved B92 exception) blocks its readiness use until the exception ends', async () => {
    const r = await compute(pao, { metricKey: 'ADP-001', period: await currentMonth() });
    expect(r['state']).not.toBe('determinate');                                                                         // no cohort yet, an open month: said, never a value
    expect(arr(r['reasons']).length).toBeGreaterThan(0);
    expect((await gate(lead))['state']).toBe('held');                                                                   // the measure changed nothing
    const exc = uuidv7();
    await ex(sql`insert into analytics.metric_exceptions (exception_id, scope, tenant_id, domain_id, metric_key, kind, period_key, cohort, reason, expires_at, state, digest, proposed_by, decided_by, decided_at, correlation_id)
      values (${exc}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'ADP-001', 'threshold_exemption', ${await currentMonth()}, '{}'::jsonb, 'the completion feed double-counts a re-run (SYNTHETIC)',
              clock_timestamp() + interval '30 days', 'approved', ${hex('exc')}, ${analystReader.principalId}::uuid, ${pao.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`);
    const g = await gate(lead);
    expect(blockingKinds(g)).toContain('measure_use:vm-adp001');
    expect(arr(g['measures'])[0]).toMatchObject({ metric_key: 'ADP-001', usable: false, state: 'marked_misleading' });
    await ex(sql`update analytics.metric_exceptions set state = 'revoked', revoked_by = ${pao.principalId}::uuid, revoked_at = clock_timestamp() where exception_id = ${exc}::uuid`);
    expect(blockingKinds(await gate(lead))).not.toContain('measure_use:vm-adp001');
  });
  it('WITHHOLD (WS-20): the sponsor withholds acceptance at the gate\'s digest — recorded; the programme, the domain and every prior state unchanged', async () => {
    const g = await gate(lead);
    const before = await one(sql`select version, state from implementation.programmes where programme_id = ${programmeId}::uuid and superseded_at is null`);
    const domainBefore = await one(sql`select status from tenancy.domains where id = ${D()}::uuid`);
    const w = (await golive(sponsor, { decision: 'withhold', gateDigest: String(g['digest']), reason: 'not until the risk owner is named' })).decision;
    expect(w).toMatchObject({ decision: 'withhold', signature_id: null, claim: 'demonstration' });
    expect(await one(sql`select version, state from implementation.programmes where programme_id = ${programmeId}::uuid and superseded_at is null`)).toEqual(before);
    expect(await one(sql`select status from tenancy.domains where id = ${D()}::uuid`)).toEqual(domainBefore);
  });
  it('MET-039 BEFORE acceptance: the programme is excluded "not yet accepted" — the computation and the compute port say so, never a value', async () => {
    const out = (await one(sql`select analytics.mc_met039_time_to_accepted_operation(${T()}::uuid, ${D()}::uuid, '2026-01-01T00:00:00Z', clock_timestamp() + interval '1 day', clock_timestamp(),
      null, '{}'::jsonb, '{"clock":"record"}'::jsonb) as r`))['r'] as Row;
    expect(arr(out['records']).filter((x) => x['role'] === 'included')).toEqual([]);
    expect(arr(out['records']).find((x) => x['id'] === programmeId)).toMatchObject({ role: 'excluded', reason: 'not yet accepted' });
    expect(JSON.stringify(out['reasons'])).toMatch(/not yet accepted: 2 implementation programme/);
    const r = await compute(pao, { metricKey: 'MET-039', period: await currentQuarter() });
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(JSON.stringify(r['reasons'])).toMatch(/not yet accepted/);
  });
});

describe('AD2 · cohorts and adoption measures (k ≥ 5; role × wave — never a person)', () => {
  it('cohorts declared by the lead; a person dimension refused 403; a duplicate 409', async () => {
    const dc2 = (dims: Row) => dc.declareCohort(dreq(lead, 'implementation.cohort.declare'), T(), D(), programmeId, P({ dimensions: dims }));
    expect(((await dc2({ role: 'executive', wave: 'wave-1' })) as { cohort: Row }).cohort).toMatchObject({ role_code: 'executive', wave_key: 'wave-1' });
    expect(((await dc2({ role: 'domain_analyst', wave: 'wave-1' })) as { cohort: Row }).cohort).toMatchObject({ role_code: 'domain_analyst' });
    await refused(dc2({ role: 'executive', wave: 'wave-2', principal: execs[0]!.principalId }), /^adoption cohort rejected \(person\)/, 403);
    await refused(dc2({ role: 'executive', wave: 'wave-1' }), /^adoption cohort rejected \(duplicate\)/, 409);
  });
  it('below k: ADP-001 and ADP-002 for the executives are INDETERMINATE (three people), said; a person-grained cohort is refused by the compute port', async () => {
    for (const k of ['ADP-001', 'ADP-002']) {
      const r = await compute(pao, { metricKey: k, period: await currentMonth(), cohort: { role: 'executive' } });
      expect(r, k).toMatchObject({ state: 'indeterminate', value: null });
      expect(JSON.stringify(r['reasons'])).toMatch(/3 distinct principals, below k = 5/);
    }
    await refused(compute(pao, { metricKey: 'ADP-001', period: await currentMonth(), cohort: { principal: execs[0]!.principalId } }), /\(person\)/, 403);
  });
  it('at or above k: six analysts (five trained on an accessible path) — the computation answers 5 of 6 with six distinct principals and records that name bindings, never people', async () => {
    const p = (await path(lead, { programmeId, key: 'analyst-basics', title: 'Analyst basics (SYNTHETIC)', roles: ['domain_analyst'], contentRef: 'kb://enablement/analyst-basics/v1' })).path;
    await attest(dadmin, String(p['path_id']), { version: 1, digest: String(p['digest']), verdict: 'accessible', statement: 'captioned, keyboard-navigable, contrast checked' });
    for (const a of analysts.slice(0, 5)) await train(lead, { pathId: String(p['path_id']), version: 1, subject: a, state: 'complete' });
    const out = (await one(sql`select analytics.mc_adp001_training_completion(${T()}::uuid, ${D()}::uuid, clock_timestamp() - interval '1 day', clock_timestamp() + interval '1 minute', clock_timestamp(),
      null, '{"role":"domain_analyst"}'::jsonb, '{"clock":"record"}'::jsonb) as r`))['r'] as Row;
    const n = Number((await one(sql`select count(distinct b.principal_id)::int as n from identity.role_bindings b join identity.principals p on p.id = b.principal_id
      where b.role_code = 'domain_analyst' and b.revoked_at is null and p.status = 'active' and b.tenant_id = ${T()}::uuid and (b.scope = 'TENANT' or b.domain_id = ${D()}::uuid)`))['n']);
    expect(n).toBeGreaterThanOrEqual(6);                                                                                // the six analysts, the reader and the fixture registrar
    expect(out).toMatchObject({ kind: 'rate', numerator: 5, denominator: n, distinct_actors: n });
    expect(arr(out['records']).every((x) => x['kind'] === 'role_binding' && !analysts.includes(String(x['id'])))).toBe(true);
    const out2 = (await one(sql`select analytics.mc_adp002_competence_completion(${T()}::uuid, ${D()}::uuid, clock_timestamp() - interval '1 day', clock_timestamp() + interval '1 minute', clock_timestamp(),
      null, '{"role":"domain_analyst"}'::jsonb, '{"clock":"record"}'::jsonb) as r`))['r'] as Row;
    expect(out2).toMatchObject({ numerator: 0, denominator: n, distinct_actors: n });                                  // never assessed: not yet, never inferred
    expect(JSON.stringify(out2['records'])).toMatch(/not yet assessed/);
  });
});

describe('AD3 · shadow workflows: a legacy upload after cutover refused and recorded; the declared review (PR-68-005)', () => {
  let sourceId = ''; let findingId = ''; let refusalText = '';
  it('the legacy upload contract worked before cutover; RETIRED at cutover, a later legacy upload is REFUSED by the observation port', async () => {
    const key = `b94im-legacy-${RUN}`;
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const r = await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(),
      { payload: { contract: { ...uploadContract(key), name: 'Legacy supplier-risk spreadsheet (SYNTHETIC)' } } }) as { source: { sourceId: string } };
    sourceId = r.source.sourceId;
    const move = async (target: 'approve' | 'active' | 'retired') => {
      const action = target === 'approve' ? 'observation.source.approve' : 'observation.source.transition';
      await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
        async (cap) => {
          if (target === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'the legacy spreadsheet (B94 fixture)', eventId: uuidv7(), correlationId: uuidv7() });
          else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target, reason: `B94 fixture: ${target} at cutover`, eventId: uuidv7(), correlationId: uuidv7() });
          return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
        });
    };
    await move('approve'); await move('active');
    // the upload agent of the legacy contract (the B33-F fixture idiom)
    const connector = new UploadConnector([]); const agentPrincipalId = uuidv7(); const agentId = uuidv7();
    await ex(sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
      values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`);
    await ex(sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`);
    await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() }, 'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
        ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
    const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
    const upload = (n: number) => h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
      { payload: { sourceId, contractVersion: 1, files: [{ filename: `legacy-${n}-${RUN}.csv`, mediaType: 'text/csv', base64: Buffer.from(`supplier,rating\nACME ${n} (SYNTHETIC),high\n`).toString('base64') }] } } as never)
      .then((v) => ({ ok: true as const, run: (v as { run: Row }).run }), (e: unknown) => ({ ok: false as const, error: e }));
    const before = await upload(1);
    expect(before.ok && before.run['state']).toBe('finished');                                                         // the legacy practice, while it was the practice
    await move('retired');
    const after = await upload(2);
    if (after.ok) {
      expect(after.run['state']).not.toBe('finished');
      refusalText = String(after.run['reason'] ?? JSON.stringify(after.run));
    } else {
      const m = after.error instanceof HttpException ? after.error : asObservationRefusal(after.error, 'harness');
      refusalText = m === null ? String((after.error as Error).message) : String((m.getResponse() as Row)['message']);
    }
    expect(refusalText).toMatch(/retired|not active|active|authorized/i);
  });
  it('recorded as a SHADOW FINDING (citing the refusal); a live contract is not a shadow workflow (409); the review with a finding open does not satisfy; resolved + reviewed → satisfied', async () => {
    const rec = (as: AuthenticatedPrincipal, sid: string) => dc.recordShadow(dreq(as, 'implementation.shadow.record'), T(), D(), P({ sourceId: sid, attempt: { refusal: refusalText, filename: `legacy-${RUN}.csv` } })) as Promise<{ finding: Row }>;
    await refused(rec(dadmin, h.fx.sourceId), /^shadow finding rejected \(state\)/, 409);
    findingId = String((await rec(dadmin, sourceId)).finding['finding_id']);
    const review = (as: AuthenticatedPrincipal) => dc.reviewShadow(dreq(as, 'implementation.shadow.review'), T(), D(), programmeId, P({ statement: 'the corridor team was asked about spreadsheet use (SYNTHETIC)' })) as Promise<{ review: Row }>;
    expect((await review(dadmin)).review).toMatchObject({ open_findings: 1 });
    expect(itemOf(await gate(lead), 'shadow-review')).toMatchObject({ state: 'unsatisfied' });
    await refused(dc.resolveShadow(dreq(lead, 'implementation.shadow.resolve', findingId), T(), D(), findingId, P({ remediation: 'the lead resolves it' })), /./, 403);
    await dc.resolveShadow(dreq(dadmin, 'implementation.shadow.resolve', findingId), T(), D(), findingId, P({ remediation: 'the spreadsheet owner was retrained and the share revoked' }));
    expect(itemOf(await gate(lead), 'shadow-review')['reason']).toMatch(/predates the latest finding|declared again/);
    expect((await review(authority)).review).toMatchObject({ open_findings: 0 });
    expect(itemOf(await gate(lead), 'shadow-review')['state']).toBe('satisfied');
  });
});

describe('IM3 · release, residual risk, go-live signed and its acceptance record (PR-68-006, WS-20)', () => {
  let decision: Row = {};
  it('custom confirmation by the named role on the digest (stale 409); residual risk by the authority — SIGNED; without a bound key it is refused and nothing is kept', async () => {
    const ops = await one(sql`select item_id::text as id, version, digest from implementation.readiness_items where programme_id = ${programmeId}::uuid and item_key = 'ops-briefing' and superseded_at is null`);
    const confirm = (as: AuthenticatedPrincipal, digest: string) => dc.confirmReadiness(dreq(as, 'implementation.readiness.confirm', String(ops['id'])), T(), D(), String(ops['id']),
      P({ version: Number(ops['version']), digest, statement: 'operations walked through the cutover runbook' }));
    await refused(confirm(execs[0]!, String(ops['digest'])), /^readiness item rejected \(authority\)/, 403);
    await refused(confirm(dadmin, hex('stale')), /^readiness item rejected \(stale\)/, 409);
    await confirm(dadmin, String(ops['digest']));
    const ret = await one(sql`select item_id::text as id, version, digest from implementation.readiness_items where programme_id = ${programmeId}::uuid and item_key = 'retention-note' and superseded_at is null`);
    const accept = (as: AuthenticatedPrincipal) => dc.acceptResidual(dreq(as, 'implementation.readiness.accept_residual', String(ret['id'])), T(), D(), String(ret['id']),
      P({ version: Number(ret['version']), digest: String(ret['digest']), reason: 'the retention note follows in the first operating month' })) as Promise<{ acceptance: Row }>;
    await refused(accept(lead), /./, 403);
    const bound = process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO']!;
    process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = '';
    try { await refused(accept(authority), /^signature rejected \(unbound\)/, 409); } finally { process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = bound; }
    expect(Number((await one(sql`select count(*)::int as n from implementation.residual_acceptances where item_id = ${String(ret['id'])}::uuid`))['n'])).toBe(0);
    const a = (await accept(authority)).acceptance;
    expect(a['signature']).toMatchObject({ signature_id: expect.any(String) });
    expect(itemOf(await gate(lead), 'retention-note')).toMatchObject({ state: 'accepted_residual' });
  });
  it('the risk owner is BOUND (a named human) → owner resolved, role filled → the gap closed; the third executive trained → READY; the sponsor\'s review task opened', async () => {
    await h.humanWithSession(['risk_owner'], 'b94im-risk-owner');
    await train(lead, { pathId: String((await one(sql`select path_id::text as id from implementation.training_paths where domain_id = ${D()}::uuid and path_key = 'exec-onboarding' and superseded_at is null`))['id']),
                        version: 2, subject: execs[2]!.principalId, state: 'complete' });
    const g = await gate(sponsor);
    expect(g['state']).toBe('ready');
    expect(g['blocking']).toEqual([]);
    expect(itemOf(g, 'owner-risk')['facts']).toMatchObject({ state: 'resolved' });
    expect(await openItems('implementation.readiness')).toBe(0);
    expect(await openItems('responsibility.gap')).toBe(0);
    expect(g['task']).toMatchObject({ state: 'open' });
  });
  it('go-live: a stale gate digest 409; a non-priority journey 422; then APPROVED by the sponsor — signed (verifies), the programme accepted, the acceptance record exact, the task completed', async () => {
    const g = await gate(sponsor);
    const ji = async (k: string) => String((await one(sql`select item_id::text as id from implementation.programme_items where programme_id = ${programmeId}::uuid and item_key = ${k} and superseded_at is null`))['id']);
    const body = { decision: 'approve', gateDigest: String(g['digest']), cadenceId, journeys: [await ji('j-briefing')], reason: 'the corridor workspace is ready; the weekly cadence is accepted' };
    await refused(golive(sponsor, { ...body, gateDigest: hex('old') }), /^go-live gate rejected \(stale\)/, 409);
    await refused(golive(sponsor, { ...body, journeys: [await ji('j-archive')] }), /^go-live gate rejected \(journeys\)/, 422);
    await refused(golive(sponsor, { ...body, cadenceId: uuidv7() }), /^go-live gate rejected \(cadence\)/, 422);
    decision = (await golive(sponsor, body)).decision;
    expect(decision).toMatchObject({ decision: 'approve', decided_by: sponsor.principalId, decided_role: 'customer_sponsor', claim: 'demonstration', cadence_id: cadenceId });
    const sig = (await one(sql`select signature_id::text as id, key_id, signature, subject_digest, bound_action from executive.signatures where subject_kind = 'readiness' and subject_id = ${String(decision['decision_id'])}::uuid`));
    expect(sig).toMatchObject({ bound_action: 'implementation.golive.approve', subject_digest: decision['digest'] });
    expect(new SignatureService().verify({ key_id: String(sig['key_id']), signature: String(sig['signature']), subject_digest: String(sig['subject_digest']) })).toBe(true);
    const acc = decision['acceptance'] as Row;
    expect(acc).toMatchObject({ claim: 'demonstration', deployment_profile: 'local-dev', consequence_class: 'C2' });
    expect(acc['programme']).toMatchObject({ programme_id: programmeId });
    expect(arr(acc['journeys']).map((j) => j['journey_ref'])).toEqual(['JRN-01']);
    expect(acc['cadence']).toMatchObject({ cadence_id: cadenceId, period: 'weekly' });
    expect(arr(acc['training_paths']).map((p) => [p['path_key'], p['accessibility']])).toEqual(expect.arrayContaining([['exec-onboarding', 'accessible']]));
    expect(acc['roles']).toEqual(expect.arrayContaining(['executive', 'risk_owner']));
    expect(String(acc['boundary'])).toMatch(/R2/);
    expect((await tread(sponsor, programmeId)).programme).toMatchObject({ state: 'accepted' });
    expect(Number((await one(sql`select count(*)::int as n from executive.human_tasks where subject @> ${JSON.stringify({ kind: 'readiness_gate', id: programmeId })}::jsonb and state = 'open'`))['n'])).toBe(0);
    await refused(golive(authority, body), /^go-live gate rejected \(state\)/, 409);
    await refused(declare(lead, { key: 'late-item', kind: 'shadow_review', title: 'A late item' }), /^readiness item rejected \(state\)/, 409);
  });
  it('a signed act is never left unsigned: an approval row without its seal is refused at commit (the deferred constraint)', async () => {
    const r = await (async () => {
      try {
        await h.su.transaction().execute(async (tx) => {
          await sql`insert into implementation.golive_decisions (decision_id, tenant_id, domain_id, programme_id, programme_version, decision, gate_digest, cadence_id, journeys, acceptance, reason, digest, decided_by, decided_role, correlation_id)
            values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${uuidv7()}::uuid, 1, 'approve', ${hex('g')}, ${cadenceId}::uuid, ${JSON.stringify([uuidv7()])}::jsonb, '{}'::jsonb, 'an unsigned approval attempt',
                    ${hex('d')}, ${sponsor.principalId}::uuid, 'customer_sponsor', ${uuidv7()}::uuid)`.execute(tx);
        });
        return 'committed';
      } catch (e) { return e instanceof Error ? e.message : String(e); }
    })();
    expect(r).toMatch(/go-live gate rejected \(unsigned\)/);
  });
});

describe('MC · MET-039 customer time to accepted operation (the carryover) and replay', () => {
  it('a contract planted (SYNTHETIC vendor; effective 2026-02-01, declared before the programme opened): the accepted programme answers a value in DAYS; a programme not accepted is "not yet accepted"', async () => {
    const lic = uuidv7(); const ctr = uuidv7();
    await ex(sql`insert into commercial.licences (licence_id, version, tenant_id, package_key, capabilities, effective_from, state, provenance, digest, issued_by, issued_at, correlation_id)
      values (${lic}::uuid, 1, ${T()}::uuid, 'full-platform', ARRAY['analytics'], '2026-02-01T00:00:00Z', 'superseded', '{"synthetic":true,"fixture":"b94-im"}'::jsonb, ${hex('lic')}, ${tadmin.principalId}::uuid,
              '2026-01-15T00:00:00Z', ${uuidv7()}::uuid)`);
    await ex(sql`insert into commercial.contracts (contract_id, version, tenant_id, contract_ref, licence_id, licence_version, decision_cells, authorities, environments, support_boundary, effective_from, status, declared_by,
        declared_at, reason, provenance, digest, correlation_id)
      values (${ctr}::uuid, 1, ${T()}::uuid, ${`B94-IM-${RUN}`}, ${lic}::uuid, 1, ${JSON.stringify([{ domain_id: D() }])}::jsonb, ${JSON.stringify([{ role: 'onboarding_authority' }])}::jsonb, ARRAY['local-dev'],
              '{"tier":"standard"}'::jsonb, '2026-02-01T00:00:00Z', 'active', ${tadmin.principalId}::uuid, '2026-01-15T00:00:00Z', 'the SYNTHETIC vendor contract of the B94 harness', '{"synthetic":true}'::jsonb, ${hex('ctr')}, ${uuidv7()}::uuid)`);
    const out = (await one(sql`select analytics.mc_met039_time_to_accepted_operation(${T()}::uuid, ${D()}::uuid, '2026-01-01T00:00:00Z', clock_timestamp() + interval '1 day', clock_timestamp(),
      null, '{}'::jsonb, '{"clock":"record"}'::jsonb) as r`))['r'] as Row;
    const included = arr(out['records']).filter((x) => x['role'] === 'included');
    expect(included.map((x) => x['id'])).toEqual([programmeId]);
    const d = included[0]!['detail'] as Row;
    const at = new Date(String((await one(sql`select decided_at from implementation.golive_decisions where programme_id = ${programmeId}::uuid and decision = 'approve'`))['decided_at'])).toISOString();
    const expected = (Date.parse(at) - Date.parse('2026-02-01T00:00:00Z')) / 86400000;
    expect(Number(d['value'])).toBeCloseTo(expected, 1);
    expect(d['unit']).toBe('days');
    expect(arr(out['records']).filter((x) => x['role'] === 'excluded').map((x) => x['reason'])).toContain('not yet accepted');   // the second programme
  });
  it('through the compute port: the open quarter is INDETERMINATE (said); a closed quarter with an accepted programme is a determinate value in days (n = 1, floor 1) and its replay reproduces', async () => {
    const q = await currentQuarter();
    const open = await compute(pao, { metricKey: 'MET-039', period: q });
    expect(open).toMatchObject({ state: 'indeterminate', value: null, unit: 'days' });
    expect(JSON.stringify(open['reasons'])).toMatch(/is open until/);
    // a programme accepted in 2026-Q2 (SYNTHETIC history, planted): opened 2026-03-01, signed go-live 2026-05-10T10:00Z
    const p0 = uuidv7();
    await ex(sql`insert into implementation.programmes (programme_id, version, tenant_id, programme_key, title, target_domain_id, owner_principal_id, state, digest, effective_from, created_by, created_at, correlation_id)
      values (${p0}::uuid, 1, ${T()}::uuid, ${`history-${RUN}`}, 'A programme accepted in the second quarter (SYNTHETIC)', ${D()}::uuid, ${lead.principalId}::uuid, 'accepted', ${hex('p0')},
              '2026-03-01T00:00:00Z', ${lead.principalId}::uuid, '2026-03-01T00:00:00Z', ${uuidv7()}::uuid)`);
    await ex(sql`insert into implementation.golive_decisions (decision_id, tenant_id, domain_id, programme_id, programme_version, decision, gate_digest, cadence_id, journeys, acceptance, reason, digest, decided_by,
        decided_role, decided_at, signature_id, correlation_id)
      values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${p0}::uuid, 1, 'approve', ${hex('g0')}, ${cadenceId}::uuid, ${JSON.stringify([uuidv7()])}::jsonb, '{"claim":"demonstration"}'::jsonb,
              'the second-quarter go-live (SYNTHETIC history)', ${hex('d0')}, ${sponsor.principalId}::uuid, 'customer_sponsor', '2026-05-10T10:00:00Z', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`);
    const r = await compute(pao, { metricKey: 'MET-039', period: '2026-Q2' });
    expect(r).toMatchObject({ state: 'determinate', kind: 'duration', n: 1, unit: 'days' });
    expect(Number(r['value'])).toBeCloseTo(98.417, 2);
    const rp = (await ac.replay(h.req(pao, 'analytics.metric.replay', 'AMR', String(r['result_id']), 'intelligence'), T(), D(), String(r['result_id'])) as { replay: Row }).replay;
    expect(rp['replay_verdict']).toBe('reproduced');
  });
});

describe('RP · replay: the ledger reconstructs the programme\'s history; every ledger row is append-only', () => {
  it('the programme\'s events in order — opened, revised, started, held, resumed, … accepted; readiness declared, gate evaluated, go-live withheld then approved, the signature sealed', async () => {
    const ev = (await sql<{ event: string }>`select e.event from implementation.events e where e.subject_id = ${programmeId}::uuid and e.subject_kind = 'implementation_programme' order by e.occurred_at, e.event_id`.execute(h.su)).rows.map((r) => r.event);
    expect(ev).toEqual(['programme.opened', 'programme.revised', 'programme.started', 'programme.held', 'programme.resumed', 'programme.accepted']);
    const all = (await sql<{ event: string }>`select distinct e.event from implementation.events e where e.tenant_id = ${T()}::uuid`.execute(h.su)).rows.map((r) => r.event);
    expect(all).toEqual(expect.arrayContaining(['readiness.declared', 'gate.evaluated', 'golive.withheld', 'golive.approved', 'signature.sealed', 'residual.accepted', 'path.attested',
      'training.recorded', 'competence.recorded', 'cohort.declared', 'shadow.recorded', 'shadow.resolved', 'shadow.reviewed', 'change.approved', 'item.recorded']));
    const leaked = (await one(sql`select count(*)::int as n from implementation.events e where e.event in ('training.recorded', 'competence.recorded') and (e.details ? 'subject' or e.details ? 'outcome' or e.details ? 'state')`))['n'];
    expect(leaked).toBe(0);                                                                                            // the ledger never names a person's outcome
    const states = (await sql<{ version: number; state: string }>`select version, state from implementation.programmes where programme_id = ${programmeId}::uuid order by version`.execute(h.su)).rows.map((r) => r.state);
    expect(states).toEqual(['planned', 'planned', 'in_progress', 'held', 'in_progress', 'accepted']);
  });
  it('append-only and versioned: a ledger row, a training record and a superseded programme version refuse change', async () => {
    const fail = async (q: ReturnType<typeof sql>) => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(await fail(sql`update implementation.events set details = '{}'::jsonb where subject_id = ${programmeId}::uuid`)).toMatch(/append-only|append only/i);
    expect(await fail(sql`update implementation.training_records set state = 'not_yet' where domain_id = ${D()}::uuid`)).toMatch(/append-only|append only/i);
    expect(await fail(sql`update implementation.programmes set title = 'rewritten history' where programme_id = ${programmeId}::uuid and version = 1`)).toMatch(/versioned/);
  });
});
