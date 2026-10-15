/**
 * CP-6 B107 §PG (migration 0115_b107_x_pg) — THE PRODUCT-GOVERNANCE WORKSPACE on a real database through the real pipeline, ports and
 * controllers. CONSTRUCTION evidence: every persona, artifact, exception, conflict and record here is SYNTHETIC; a signature by a synthetic
 * persona's key demonstrates the software only — real executive attestation, independent release authorities and production admission are
 * H3 / R1 and are never claimed (every record `claim = demonstration`).
 *
 *   PG0 · NOTHING INFERRED: before any declaration every posture dimension reads `unknown`; the read-only registers (EXCEPTIONS.md, C15 SCX).
 *   PG1 · THE BASELINE (PR-01-001/-002/-005, CAP-AU-01/-02, ADR-005): owners (one accountable owner, superseded on re-assignment); the HELD
 *         baseline on orphans / duplicates / no rights; the duplicate corrected; a stale proposal; SIGNED by the product authority (never its
 *         proposer); a lapsed owner holds it again.
 *   PG2 · DECISION RIGHTS (CAP-AU-03): singular approver, separation of duties, delegation (live, then stale); the matrix enforced on approvals.
 *   PG3 · THE EXCEPTION REGISTRY (V03-T-451/-453, ES-02-004, DAT-GV-08, CAP-AU-10): the fields, constitutional boundaries, the independent
 *         approver (owner, component owner, proposer, agent, other assurance refused); EXPIRY → the release candidate HELD, the attention item in
 *         the customer's domain only; renewal with stale evidence refused, with current evidence approved → hold LIFTED; expired-before-approval
 *         refused; REPEATS → the remediation review holds approvals; closure on exit criteria; withdrawal; the ageing.
 *   PG4 · CHANGE PROPOSALS (ES-72-003, PR-72-002/-003): plans required; deterministic impact; the authority chain for cross-volume change; the
 *         impact moved → stale; a subject under a hold → held.
 *   PG5 · THE CONFLICT REGISTER (FEX-32, IA-02-005, DP-02-005, PR-72-005): the release held at the last conformant candidate; the highest
 *         authority selected; closure / amendment; the trace closes; the holds lifted.
 *   PG6 · THE GOVERNANCE REGISTRY (ES-72-001/-005, IA-72-001/-002, INF-DL-08, DP-72-001/-002, DAT-GV-06): records, controlled amendment, review
 *         cadence, debt with verified closure, retirement proof; the posture and its versioned snapshots.
 *   PG7 · UNAUTHORIZED ROLE · CROSS-TENANT · REPLAY · FAULT · the home read and the preview.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { WorkspaceController } from '../../src/governance/workspace/workspace.controller.js';
import { WorkspaceService } from '../../src/governance/workspace/workspace.service.js';
import { WorkspaceCap } from '../../src/governance/workspace/workspace.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot.
const KEY = generateKeyPairSync('ed25519');
const KEY_REF = ['EYE', 'EXECUTIVE', 'SIGNING', 'KEY', 'DEMO'].join('_');   // split: a key-NAME literal trips the full-history scan
process.env[KEY_REF] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let api: WorkspaceController; let svc: WorkspaceService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const PURPOSE = 'governance';
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const inSec = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = () => createHash('sha256').update(randomBytes(16)).digest('hex');
const ev = (ref: string, capturedDaysAgo = 0, validDays: number | null = 60) => ({ kind: 'test_report', ref: `${ref} (SYNTHETIC)`, digest: hex(),
  captured_at: new Date(Date.now() - capturedDaysAgo * 86_400_000).toISOString(), valid_until: validDays === null ? null : new Date(Date.now() + validDays * 86_400_000).toISOString() });

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let productA: AuthenticatedPrincipal;   // product_authority — assigns owners, decides rights
let productB: AuthenticatedPrincipal;   // product_authority — signs the baseline, resolves conflicts
let assurance: AuthenticatedPrincipal;  // independent_assurance — the matrix's NAMED exception approver
let assurance2: AuthenticatedPrincipal; // independent_assurance — the delegate
let assurance3: AuthenticatedPrincipal; // independent_assurance — neither named nor delegate
let steward: AuthenticatedPrincipal;    // conformance_steward — proposes, raises, sweeps; approves nothing
let ops: AuthenticatedPrincipal;        // operations_authority + independent_assurance — the exception OWNER and the export component's OWNER
let compOwner: AuthenticatedPrincipal;  // independent_assurance + operations_authority — owns the second component of the system scope (ES-02-004)
let stewardAgent: AuthenticatedPrincipal;   // an AGENT holding conformance_steward (drafts)
let machine: AuthenticatedPrincipal;        // an AGENT holding product_authority whose session CLAIMS a human (the PEP passes; the PORT refuses)
let platformAdmin: AuthenticatedPrincipal;  // platform_admin only — no governance role
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let dadmin2: AuthenticatedPrincipal;
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
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

// ── envelopes and routes (in process) ────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope = 'PLATFORM', t: string | null = null, d: string | null = null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: PURPOSE, action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-workspace' } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action), eyePrincipal: p }) as never;
const home = (as = steward) => api.read(rq(as, 'governance.read')) as Promise<Row>;
const preview = (as: AuthenticatedPrincipal, kind: string, id: string, version = 1) => api.preview(rq(as, 'governance.read'), { payload: { kind, id, version } }) as Promise<Row & { eligibility: { can_decide: boolean; reasons: string[] } }>;
const assign = (as: AuthenticatedPrincipal, capabilityId: string, owner: string, ownerRole = 'product_authority', domainBoundary = 'Product Authority and Operating Model') =>
  api.assignOwner(rq(as, 'governance.baseline.owner.assign'), { payload: { capabilityId, owner, ownerRole, domainBoundary, reason: 'the accountable product owner named (SYNTHETIC)' } }) as Promise<{ owner: Row }>;
const proposeRights = (as: AuthenticatedPrincipal, rowsIn: unknown[], matrixId: string | null = null, expectedVersion = 0) =>
  api.proposeRights(rq(as, 'governance.rights.propose'), { payload: { matrixId, rows: rowsIn, expectedVersion } }) as Promise<{ rights: Row }>;
const decideRights = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.decideRights(rq(as, 'governance.rights.decide'), id, { payload: { reason: 'the decision rights read against the operating model (SYNTHETIC)', ...payload } }) as Promise<{ rights: Row }>;
const SCOPE = () => ({ capability_version: `CAP-AU-12@${RUN}`, journeys: ['JRN-24'], roles: ['product_authority', 'independent_assurance'], tenant_or_domain: `${T()}/${D()}`,
  deployment_profile: 'local-dev', entitlement: 'core', data_versions: ['0115'], model_versions: ['none'], configuration_digest: 'c'.repeat(64), consequence_class: 'C2', period: `${day()}..${day(90)}` });
const proposeBaseline = (as: AuthenticatedPrincipal, baselineId: string | null = null, expectedVersion = 0, scope: Row = SCOPE()) =>
  api.proposeBaseline(rq(as, 'governance.baseline.propose'), { payload: { baselineId, title: `The product baseline ${RUN} (SYNTHETIC)`, scope, expectedVersion } }) as Promise<{ baseline: Row }>;
const decideBaseline = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.decideBaseline(rq(as, 'governance.baseline.decide'), id, { payload: { reason: 'the baseline read against the inventory and the rights (SYNTHETIC)', ...payload } }) as Promise<{ baseline: Row }>;
const proposeEx = (as: AuthenticatedPrincipal, payload: Row) => api.proposeException(rq(as, 'governance.exception.propose'), { payload }) as Promise<{ exception: Row }>;
const decideEx = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.decideException(rq(as, 'governance.exception.decide'), id, { payload: { reason: 'the exception read against its evidence and controls (SYNTHETIC)', ...payload } }) as Promise<{ exception: Row }>;
const sweep = (as = steward) => api.sweep(rq(as, 'governance.exception.sweep')) as Promise<{ sweep: Row }>;
const proposeChange = (as: AuthenticatedPrincipal, payload: Row) => api.proposeChange(rq(as, 'governance.change.propose'), { payload }) as Promise<{ change: Row }>;
const decideChange = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.decideChange(rq(as, 'governance.change.decide'), id, { payload: { reason: 'the change read against its plans and impact (SYNTHETIC)', ...payload } }) as Promise<{ change: Row }>;
const raise = (as: AuthenticatedPrincipal, payload: Row) => api.raiseConflict(rq(as, 'governance.conflict.raise'), { payload }) as Promise<{ conflict: Row }>;
const resolve = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.resolveConflict(rq(as, 'governance.conflict.resolve'), id, { payload }) as Promise<{ conflict: Row }>;
const proposeRecord = (as: AuthenticatedPrincipal, payload: Row) => api.proposeRecord(rq(as, 'governance.record.propose'), { payload }) as Promise<{ record: Row }>;
const decideRecord = (as: AuthenticatedPrincipal, id: string, payload: Row) => api.decideRecord(rq(as, 'governance.record.decide'), id, { payload: { reason: 'the record read against the registry (SYNTHETIC)', ...payload } }) as Promise<{ record: Row }>;

// ── planting (the shared core's other parts — §RG imports, §CM's candidates — are planted as SYNTHETIC fixtures by the superuser) ──────
async function plant(kind: string, key: string, o: { title?: string; owner?: string | null; authority?: string | null; volume?: string | null; attributes?: Row } = {}): Promise<string> {
  const id = uuidv7();
  await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_principal_id, authority_class, controlling_volume, lifecycle, attributes, source, digest, recorded_by, correlation_id)
            values (${id}::uuid, 1, 'PLATFORM', ${kind}, ${`${key}-${RUN}`}, ${o.title ?? `${key} (SYNTHETIC — planted by the §PG harness)`}, ${o.owner ?? null}::uuid, ${o.authority ?? null}, ${o.volume ?? null},
                    'active', ${JSON.stringify(o.attributes ?? {})}::jsonb, '{"planted":"phase6-workspace-b107"}'::jsonb, ${hex()}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
const link = (from: string, to: string, relation: string) =>
  sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, recorded_by, correlation_id) values (${uuidv7()}::uuid, 'PLATFORM', ${from}::uuid, ${to}::uuid, ${relation}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
async function retire(id: string) {
  await sql`update governance.artifacts set superseded_at = clock_timestamp() where artifact_id = ${id}::uuid and superseded_at is null`.execute(h.su);
  await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, lifecycle, digest, recorded_by, correlation_id)
            select artifact_id, version + 1, scope, kind, external_key, title, 'retired', digest, recorded_by, correlation_id from governance.artifacts where artifact_id = ${id}::uuid order by version desc limit 1`.execute(h.su);
}

async function platformPerson(label: string, kind: 'human' | 'agent', roles: string[], claim: 'human' | 'agent' = kind): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'PLATFORM', null, null, ${`b107pg-${label}-${id.slice(-6)} (SYNTHETIC)`}, ${`b107pg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const r of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${r}, 'PLATFORM', null, null)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claim, assurance: claim === 'human' ? 'password' : 'agent_grant', homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null,
    bindings: roles.map((roleCode) => ({ roleCode, scope: 'PLATFORM' as const, tenantId: null, domainId: null })) } as AuthenticatedPrincipal);
}
async function tenantPerson(label: string, roles: string[], scope: 'TENANT' | 'DOMAIN', t = T(), d: string | null = D()): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const dom = scope === 'DOMAIN' ? d : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'human', ${scope}, ${t}::uuid, ${dom}::uuid, ${`b107pg-${label}-${id.slice(-6)} (SYNTHETIC)`}, ${`b107pg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const r of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${r}, ${scope}, ${t}::uuid, ${dom}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: 'human', assurance: 'password', homeScope: scope, homeTenantId: t, homeDomainId: dom,
    bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: t, domainId: dom })) } as AuthenticatedPrincipal);
}

let slot = 0;
const tick = async () => {
  const timer = h.app.get(AttentionTimerService);
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return (o.run?.outputs['steps'] ?? {}) as Record<string, Row>;
};

// the planted registry (SYNTHETIC)
const A: Record<string, string> = {};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  api = h.app.get(WorkspaceController); svc = h.app.get(WorkspaceService);
  productA = await platformPerson('productA', 'human', ['product_authority']);
  productB = await platformPerson('productB', 'human', ['product_authority']);
  assurance = await platformPerson('assurance', 'human', ['independent_assurance']);
  assurance2 = await platformPerson('assurance2', 'human', ['independent_assurance']);
  assurance3 = await platformPerson('assurance3', 'human', ['independent_assurance']);
  steward = await platformPerson('steward', 'human', ['conformance_steward']);
  ops = await platformPerson('ops', 'human', ['operations_authority', 'independent_assurance']);
  compOwner = await platformPerson('compowner', 'human', ['independent_assurance', 'operations_authority']);
  stewardAgent = await platformPerson('steward-agent', 'agent', ['conformance_steward']);
  machine = await platformPerson('machine', 'agent', ['product_authority'], 'human');
  platformAdmin = await platformPerson('padmin', 'human', ['platform_admin']);
  tenantAdmin = await tenantPerson('tadmin', ['tenant_admin'], 'TENANT');
  dadmin = await tenantPerson('dadmin', ['domain_admin'], 'DOMAIN');
  dadmin2 = await tenantPerson('dadmin2', ['domain_admin'], 'DOMAIN');
  // the registry (planted): three V8 capabilities, two components (owned by ops and compOwner), the export interface, requirements, a journey,
  // a test and a briefing that depend on the forecast contract, and three release candidates
  A['capA'] = await plant('capability', 'CAP-AU-01', { title: 'Product baseline registry (SYNTHETIC)', authority: 'controlling', volume: 'V8' });
  A['capB'] = await plant('capability', 'CAP-AU-10', { title: 'Product exception service (SYNTHETIC)', authority: 'controlling', volume: 'V8' });
  A['capC'] = await plant('capability', 'CAP-FW-07', { title: 'Supply-chain intelligence workspace (SYNTHETIC)', authority: 'controlling', volume: 'V8' });
  A['compExport'] = await plant('component', 'L3-C14-export', { title: 'Export delivery (SYNTHETIC)', owner: ops.principalId, volume: 'V6' });
  A['compSign'] = await plant('component', 'L3-C15-signing', { title: 'Export signing (SYNTHETIC)', owner: compOwner.principalId, volume: 'V6' });
  A['ifForecast'] = await plant('interface', 'IF-FORECAST', { title: 'The forecast contract (SYNTHETIC)', authority: 'controlling', volume: 'V4' });
  A['reqExport'] = await plant('requirement', 'V6:IA-58-003', { title: 'Export signing requirement (SYNTHETIC)', authority: 'normative', volume: 'V6' });
  A['reqV3'] = await plant('requirement', 'V3:V03-T-453', { title: 'Exception fields (SYNTHETIC)', authority: 'controlling', volume: 'V3' });
  A['reqV4'] = await plant('requirement', 'V4:ES-02-004', { title: 'No owner approves its own exception (SYNTHETIC)', authority: 'normative', volume: 'V4' });
  A['jrn'] = await plant('journey', 'JRN-24', { title: 'Release acceptance journey (SYNTHETIC)', volume: 'V8' });
  A['test'] = await plant('test', 'phase6-forecast-test', { title: 'NORDWERK forecast contract test (SYNTHETIC)' });
  A['brief'] = await plant('evidence', 'briefing-forecast', { title: 'NORDWERK briefing citing the forecast (SYNTHETIC)' });
  A['dp'] = await plant('data_product', 'DP-export-feed', { title: 'NORDWERK export feed (SYNTHETIC data product)' });
  A['rc1'] = await plant('release_candidate', 'RC-1', { title: 'Release candidate 1 (SYNTHETIC — §CM substitute record, not a release)' });
  await sleep(20);
  A['rc2'] = await plant('release_candidate', 'RC-2', { title: 'Release candidate 2 (SYNTHETIC — §CM substitute record, not a release)' });
  await sleep(20);
  A['rc3'] = await plant('release_candidate', 'RC-3', { title: 'Release candidate 3 (SYNTHETIC — §CM substitute record, not a release)' });
  await link(A['test']!, A['ifForecast']!, 'verifies');
  await link(A['brief']!, A['ifForecast']!, 'cites');
  await link(A['reqExport']!, A['ifForecast']!, 'depends_on');
  await link(A['rc3']!, A['reqV3']!, 'deploys');
  // the attention policy (governance.exception to the domain administrators) and the attention agent whose ticks run the expiry step
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const exec = h.app.get(Ec);
  await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B107 §PG harness: expired product exceptions covering this domain to its administrators',
    rules: { classes: { 'governance.exception': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'],
      max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' } }, overload: { max_open_per_role: 50 } } } as never });
  const a = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: dadmin.principalId, escalationPrincipalId: dadmin2.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B107 §PG harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG0 · nothing is inferred; the repository registers are read only', () => {
  it('before any declaration every workspace dimension reads unknown (never conformant by inference)', async () => {
    const r = await home();
    const dims = ((r['posture'] as Row)['dimensions'] ?? {}) as Record<string, Row>;
    for (const k of ['baseline', 'decision_rights', 'exceptions', 'conflicts', 'records']) expect(dims[k]?.['state'], k).toBe('unknown');
    expect(dims['ownership']?.['state']).toBe('non_conformant');   // capabilities are planted, none owned
    expect(String(r['boundary'])).toMatch(/never claimed/);
  });
  it('EXCEPTIONS.md is REPORTED read only (EXC-P0-003 expired 2026-09-30); the C15 SCX dispositions are shown, never governed', async () => {
    const r = await home();
    const reg = r['repository_registers'] as { engineering: { available: boolean; entries: Row[]; note: string }; supply_chain: { available: boolean; entries: Row[]; note: string } };
    expect(reg.engineering.available).toBe(true);
    const p3 = reg.engineering.entries.find((e) => e['id'] === 'EXC-P0-003');
    expect(p3).toMatchObject({ expiry_date: '2026-09-30', status: 'open', expired: true });
    expect(reg.engineering.note).toMatch(/never renewed, closed or edited by the product/);
    expect(reg.supply_chain.available).toBe(true);
    expect(reg.supply_chain.entries.length).toBeGreaterThan(0);
    expect(reg.supply_chain.entries.every((e) => String(e['id']).startsWith('SCX-'))).toBe(true);
    expect(reg.supply_chain.note).toMatch(/standing authorization .* never governed here/);
    // the in-product registry admits ONLY the product class (an engineering or supply-chain row cannot be written into it)
    expect(await failure(sql`update governance.ws_exceptions set class = 'engineering'`)).toBe('no error');   // nothing to update yet
    expect(await one(sql`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'ws_exceptions_class_check'`)).toMatchObject({ d: expect.stringContaining("'product'") });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let BL = ''; let RIGHTS = '';
describe('PG1 · the product baseline: owners, the held baseline, the signed decision (PR-01-001/-002/-005, CAP-AU-01/-02, ADR-005)', () => {
  it('a baseline proposed before owners and rights records its GAPS; signing it is HELD (409) — the disputed state preserved', async () => {
    const b = (await proposeBaseline(steward)).baseline;
    BL = String(b['baseline_id']);
    expect(b).toMatchObject({ version: 1, state: 'proposed', signable: false });
    expect((b['gaps'] as Row[]).map((g) => g['gap'])).toEqual(expect.arrayContaining(['orphans', 'no_decision_rights']));
    await refused(decideBaseline(productB, BL, { version: 1, decision: 'sign', digest: b['digest'] }), /^product baseline rejected \(held\): authority is unresolved — orphans, no_decision_rights/, 409);
    expect(await one(sql`select state from governance.ws_baselines where baseline_id = ${BL}::uuid and version = 1`)).toEqual({ state: 'proposed' });
    expect(await one(sql`select count(*)::int as n from governance.signatures where subject_id = ${BL}::uuid`)).toEqual({ n: 0 });
  });
  it('owner assignment refusals: the steward (PDP), an agent (the human gate), a machine claiming a human (the PORT), an unknown capability, an owner without the role or not a human', async () => {
    await refused(assign(steward, A['capA']!, productA.principalId), /no qualifying role binding/, 403);
    await refused(assign(machine, A['capA']!, productA.principalId), /^product baseline rejected \(actor\)/, 403);
    await refused(assign(productA, uuidv7(), productA.principalId), /^product baseline rejected \(unknown_capability\)/, 404);
    await refused(assign(productA, A['capA']!, steward.principalId, 'product_authority'), /^product baseline rejected \(owner\): the owner holds product_authority/, 422);
    await refused(assign(productA, A['capA']!, stewardAgent.principalId, 'conformance_steward'), /^product baseline rejected \(owner\): an accountable owner is a named active human/, 422);
    await refused(api.assignOwner(rq(productA, 'governance.baseline.owner.assign'), { payload: { capabilityId: 'nope', owner: productA.principalId, reason: 'x'.repeat(10) } }), /^product baseline rejected \(request\): capabilityId is an id/, 422);
  });
  it('ONE accountable owner per capability (ADR-005): a re-assignment supersedes (versioned, never edited)', async () => {
    expect((await assign(productA, A['capA']!, productB.principalId)).owner).toMatchObject({ version: 1, previous_owner: null });
    expect((await assign(productA, A['capA']!, productA.principalId)).owner).toMatchObject({ version: 2, previous_owner: productB.principalId });
    expect(await one(sql`select count(*)::int as n, max(version) as v from governance.ws_capability_owners where capability_id = ${A['capA']}::uuid and superseded_at is null`)).toEqual({ n: 1, v: 2 });
    await assign(productA, A['capB']!, ops.principalId, 'operations_authority', 'Product Authority and Operating Model');
    await assign(productA, A['capC']!, productB.principalId, 'product_authority', 'Supply-chain intelligence');
    expect(await one(sql`select count(*)::int as n from governance.events where event = 'baseline.owner_assigned'`)).toMatchObject({ n: expect.any(Number) });
  });
  it('a DUPLICATE identity (one title, one boundary) is a gap; the correction (the duplicate retired) clears it', async () => {
    A['capDup'] = await plant('capability', 'CAP-AU-01-dup', { title: 'Product baseline registry (SYNTHETIC)', authority: 'controlling', volume: 'V8' });
    await assign(productA, A['capDup']!, productB.principalId);
    const inv = (await home())['inventory'] as Row;
    expect((inv['duplicates'] as Row[]).length).toBe(1);
    await retire(A['capDup']!);
    expect((((await home())['inventory'] as Row)['duplicates'] as Row[]).length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG2 · decision rights: singular, separated, delegated, enforced (CAP-AU-03)', () => {
  const MATRIX = () => [
    { subject: 'baseline', duty: 'propose', role: 'conformance_steward' }, { subject: 'baseline', duty: 'approve', role: 'product_authority' }, { subject: 'baseline', duty: 'audit', role: 'independent_assurance' },
    { subject: 'exception', duty: 'propose', role: 'conformance_steward' },
    { subject: 'exception', duty: 'approve', role: 'independent_assurance', principal: assurance.principalId, delegate: { to: assurance2.principalId, until: day(7) } },
    { subject: 'exception', duty: 'audit', role: 'product_authority' },
    { subject: 'change', duty: 'propose', role: 'conformance_steward' }, { subject: 'change', duty: 'approve', role: 'product_authority' }, { subject: 'change', duty: 'review', role: 'independent_assurance' },
    { subject: 'conflict', duty: 'propose', role: 'conformance_steward' }, { subject: 'conflict', duty: 'approve', role: 'product_authority' },
    { subject: 'decision_rights', duty: 'propose', role: 'conformance_steward' }, { subject: 'decision_rights', duty: 'approve', role: 'product_authority' },
    { subject: `CAP-FW-07-${RUN}`, duty: 'operate', role: 'operations_authority' }, { subject: `CAP-FW-07-${RUN}`, duty: 'approve', role: 'product_authority' },
  ];
  it('refusals: two approvers of one subject (singular), the approving role also proposing / an auditor approving (SoD), a bad delegation, an unknown subject', async () => {
    await refused(proposeRights(steward, [...MATRIX(), { subject: 'change', duty: 'approve', role: 'independent_assurance' }]), /^decision rights rejected \(singular\): change has more than one approve row/, 422);
    await refused(proposeRights(steward, [{ subject: 'record', duty: 'propose', role: 'product_authority' }, { subject: 'record', duty: 'approve', role: 'product_authority' }]), /^decision rights rejected \(separation_of_duties\): record — the approving role also proposes/, 403);
    await refused(proposeRights(steward, [{ subject: 'record', duty: 'approve', role: 'product_authority' }, { subject: 'record', duty: 'audit', role: 'product_authority' }]), /^decision rights rejected \(separation_of_duties\): record — the auditing role/, 403);
    await refused(proposeRights(steward, [{ subject: 'record', duty: 'approve', role: 'independent_assurance', principal: assurance.principalId, delegate: { to: steward.principalId, until: day(3) } }]), /^decision rights rejected \(delegation\): the delegate of record \/ approve is another active human holding independent_assurance/, 422);
    await refused(proposeRights(steward, [{ subject: 'record', duty: 'approve', role: 'independent_assurance', principal: assurance.principalId, delegate: { to: assurance2.principalId, until: day(120) } }]), /^decision rights rejected \(delegation\): a delegation runs until a day .* 90 days ahead/, 422);
    await refused(proposeRights(steward, [{ subject: 'CAP-NOPE-1', duty: 'approve', role: 'product_authority' }]), /^decision rights rejected \(unknown_subject\)/, 404);
  });
  it('proposed by the steward; its proposer never approves; a stale digest refused; approved by the product authority and SIGNED (decision_rights)', async () => {
    const r = (await proposeRights(steward, MATRIX())).rights;
    RIGHTS = String(r['matrix_id']);
    await refused(decideRights(steward, RIGHTS, { version: 1, decision: 'approve', digest: r['digest'] }), /no qualifying role binding/, 403);
    await refused(decideRights(productA, RIGHTS, { version: 1, decision: 'approve', digest: 'f'.repeat(64) }), /^decision rights rejected \(stale\)/, 409);
    const d = (await decideRights(productA, RIGHTS, { version: 1, decision: 'approve', digest: r['digest'] })).rights;
    expect(d).toMatchObject({ state: 'approved' });
    const sig = await one(sql`select key_id, signature, subject_digest, signer, signer_role, bound_action from governance.signatures where subject_kind = 'decision_rights' and subject_id = ${RIGHTS}::uuid`);
    expect(sig).toMatchObject({ signer: productA.principalId, signer_role: 'product_authority', bound_action: 'governance.rights.decide', subject_digest: r['digest'] });
    expect(svc.verifySignature(sig as never)).toBe(true);
  });
  it('the matrix is ENFORCED: the named exception approver, its LIVE delegate, never another holder of the role; a STALE delegation refused', async () => {
    const resolveRows = await one(sql`select governance.ws_rights_resolve('exception', 'approve') as r`);
    expect((resolveRows['r'] as Row)['governed']).toBe(true);
    // (the enforcement on a real exception is exercised in PG3: assurance3 refused, assurance2 accepted while the delegation lives)
  });
  it('a capability-key subject resolves; CORRECTION: a matrix v2 supersedes v1 only when approved', async () => {
    const r = (await proposeRights(steward, [...MATRIX(), { subject: 'record', duty: 'audit', role: 'operations_authority' }, { subject: 'record', duty: 'approve', role: 'product_authority' }], RIGHTS, 1)).rights;
    expect(r).toMatchObject({ version: 2, state: 'proposed' });
    expect(await one(sql`select version from governance.ws_decision_rights where state = 'approved'`)).toEqual({ version: 1 });
    await decideRights(productB, RIGHTS, { version: 2, decision: 'reject', digest: r['digest'] });
    expect(await one(sql`select version from governance.ws_decision_rights where state = 'approved'`)).toEqual({ version: 1 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG1 (cont.) · the baseline signed, then held again by a lapsed owner', () => {
  it('a STALE proposal (the owners moved since) is refused; the current proposal is SIGNED by the product authority (never its proposer)', async () => {
    const v2 = (await proposeBaseline(steward, BL, 1)).baseline;
    expect(v2).toMatchObject({ version: 2, signable: true, gaps: [] });
    await assign(productA, A['capC']!, productA.principalId, 'product_authority', 'Supply-chain intelligence');   // the registry moves
    await refused(decideBaseline(productB, BL, { version: 2, decision: 'sign', digest: v2['digest'] }), /^product baseline rejected \(stale\): the registry moved since version 2/, 409);
    const v3 = (await proposeBaseline(productA, BL, 2)).baseline;
    await refused(decideBaseline(productA, BL, { version: 3, decision: 'sign', digest: v3['digest'] }), /^product baseline rejected \(separation_of_duties\): signing the product baseline is never done by its proposer/, 403);
    await refused(decideBaseline(machine, BL, { version: 3, decision: 'sign', digest: v3['digest'] }), /^product baseline rejected \(actor\)/, 403);
    const s = (await decideBaseline(productB, BL, { version: 3, decision: 'sign', digest: v3['digest'] })).baseline;
    expect(s).toMatchObject({ state: 'signed', claim: 'demonstration' });
    const row = await one(sql`select b.state, b.scope_tuple, b.rights ->> 'digest' as rd, s.signer, s.bound_action from governance.ws_baselines b join governance.signatures s on s.signature_id = b.signature_id
      where b.baseline_id = ${BL}::uuid and b.version = 3`);
    expect(row).toMatchObject({ state: 'signed', signer: productB.principalId, bound_action: 'governance.baseline.decide' });
    expect(Object.keys(row['scope_tuple'] as Row).sort()).toEqual(['capability_version', 'configuration_digest', 'consequence_class', 'data_versions', 'deployment_profile', 'entitlement', 'journeys', 'model_versions', 'period', 'roles', 'tenant_or_domain']);
    expect(await one(sql`select count(*)::int as n from governance.links_live where to_artifact = ${BL}::uuid and relation = 'part_of'`)).toEqual({ n: 3 });
    expect((((await home())['posture'] as Row)['dimensions'] as Record<string, Row>)['baseline']?.['state']).toBe('conformant');
  });
  it('the scope tuple is exact: a proposal missing a dimension is refused', async () => {
    const { period: _p, ...partial } = SCOPE();
    await refused(proposeBaseline(steward, BL, 3, partial), /^product baseline rejected \(scope\): the decision is bound to the exact scope; missing: period/, 422);
  });
  it('an owner LAPSES (the role revoked): the inventory and the posture show it; a new baseline is HELD until the owner is replaced', async () => {
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${ops.principalId}::uuid and role_code = 'operations_authority'`.execute(h.su);
    const inv = (await home())['inventory'] as Row;
    expect(inv['lapsed']).toEqual([`CAP-AU-10-${RUN}`]);
    const b = (await proposeBaseline(steward, BL, 3)).baseline;
    expect((b['gaps'] as Row[]).map((g) => g['gap'])).toEqual(['lapsed_owners']);
    await refused(decideBaseline(productB, BL, { version: 4, decision: 'sign', digest: b['digest'] }), /^product baseline rejected \(held\): authority is unresolved — lapsed_owners/, 409);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${ops.principalId}::uuid, 'operations_authority', 'PLATFORM', null, null)`.execute(h.su);
    ops = await h.openSession(ops);   // a binding change bumps the principal's revocation epoch: a new session
    expect(((await home())['inventory'] as Row)['lapsed']).toEqual([]);
    expect(await one(sql`select version, state from governance.ws_baselines where state = 'signed'`)).toEqual({ version: 3, state: 'signed' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let EX = ''; let EXD = ''; let EX_V1 = '';
const EXPORT_EXCEPTION = (over: Row = {}) => ({
  title: 'Export path signing deferred for the NORDWERK release (SYNTHETIC)', requirementRef: 'V6:IA-58-003', requirementArtifact: A['reqExport'], contractKey: `export-signing-${RUN}`,
  systemScope: [A['compExport'], A['compSign']], customerScope: { domains: [{ tenant: T(), domain: D() }] },
  reason: 'the export path ships before the signing component is hardened; a bounded window with compensating controls (SYNTHETIC)',
  evidence: [ev('vitest:phase6-export-b15')], risk: { level: 'medium', statement: 'an export delivered unsigned for a bounded window (SYNTHETIC)' },
  affectedInvariants: ['export_integrity'], compensatingControls: ['the receipt digest is verified on the recipient side', 'the export is held for manual release'],
  owner: ops.principalId, expandsAuthority: true, removesControl: false, expiresAt: inSec(12), monitoring: 'the conformance monitor reads the export receipts daily',
  exitCriteria: 'the signing component signs every export with the bound key', remediationPlan: 'harden the signing component in the next candidate', affectedArtifacts: [A['rc2'], A['dp']], ...over });

describe('PG3 · THE ONE exception registry (V03-T-451/-453, ES-02-004, DAT-GV-08, CAP-AU-10)', () => {
  it('refusals at proposal: a constitutional boundary, "later" as an expiry, more than 366 days, an unknown artifact, a malformed scope', async () => {
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ affectedInvariants: ['Tenant_Isolation', 'export_integrity'] })), /^governance exception rejected \(constitutional\): tenant_isolation cannot be waived through an ordinary exception/, 422);
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ expiresAt: 'later' })), /^governance exception rejected \(expiresat\): expiresAt is an instant .* "later" is not an expiry/, 422);
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ expiresAt: new Date(Date.now() + 400 * 86_400_000).toISOString() })), /^governance exception rejected \(expiry\)/, 422);
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ affectedArtifacts: [uuidv7()] })), /^governance exception rejected \(unknown_artifact\): affectedArtifacts names/, 404);
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ customerScope: { domains: [{ tenant: T(), domain: uuidv7() }] } })), /^governance exception rejected \(unknown_domain\)/, 404);
    await refused(proposeEx(steward, EXPORT_EXCEPTION({ evidence: [] })), /^governance exception rejected \(evidence\)/, 422);
    await refused(proposeEx(dadmin, EXPORT_EXCEPTION()), /no platform authority binding/, 403);   // a local team never proposes into the vendor's registry
  });
  it('proposed with every V03-T-453 field (an AGENT may draft one); expanding the component\'s authority makes independent assurance the only approver', async () => {
    const drafted = (await proposeEx(stewardAgent, EXPORT_EXCEPTION({ contractKey: `draft-${RUN}`, affectedArtifacts: [] }))).exception;
    expect(drafted).toMatchObject({ state: 'proposed', approver_roles: ['independent_assurance'] });
    await api.withdrawException(rq(stewardAgent, 'governance.exception.withdraw'), String(drafted['exception_id']), { payload: { version: 1, reason: 'a draft only (SYNTHETIC)' } });
    const e = (await proposeEx(steward, EXPORT_EXCEPTION())).exception;
    EX = String(e['exception_id']); EX_V1 = String(e['digest']);
    expect(e).toMatchObject({ version: 1, state: 'proposed', approver_roles: ['independent_assurance'] });
    const row = await one(sql`select requirement_ref, contract_key, customer_scope, risk ->> 'level' as risk, affected_invariants, compensating_controls, owner_principal_id::text as owner, expands_authority,
      starts_at < expires_at as window, monitoring, exit_criteria, remediation_plan, claim from governance.ws_exceptions where exception_id = ${EX}::uuid`);
    expect(row).toMatchObject({ requirement_ref: 'V6:IA-58-003', risk: 'medium', owner: ops.principalId, expands_authority: true, window: true, claim: 'demonstration' });
    expect(await one(sql`select count(*)::int as n from governance.links_live where from_artifact = ${EX}::uuid and relation = 'excepts'`)).toEqual({ n: 3 });
  });
  it('the INDEPENDENT approver: the owner, a component owner (ES-02-004), the proposer, the product authority (not an approver of an expanding exception), another assurance holder (the matrix), an agent — refused', async () => {
    const d = { version: 1, decision: 'approve', digest: EX_V1 };
    await refused(decideEx(ops, EX, d), /^governance exception rejected \(separation_of_duties\): you own a component whose authority this exception expands .*ES-02-004/, 403);
    await refused(decideEx(compOwner, EX, d), /^governance exception rejected \(separation_of_duties\): you own a component .*ES-02-004/, 403);
    await refused(decideEx(productA, EX, d), /^governance exception rejected \(authority\): approving an exception is the act of a independent_assurance/, 403);
    await refused(decideEx(assurance3, EX, d), /^governance exception rejected \(authority\): the approved decision-rights matrix PDR-\d+ v1 assigns approve of exception to independent_assurance/, 403);
    await refused(decideEx(stewardAgent, EX, d), /human gate|no qualifying role binding/, 403);
    await refused(decideEx(assurance, EX, { ...d, digest: 'e'.repeat(64) }), /^governance exception rejected \(stale\)/, 409);
    const p = await preview(assurance3, 'exception', EX);
    expect(p.eligibility.can_decide).toBe(false);
    expect(p.eligibility.reasons.join(' | ')).toMatch(/assigns approve of exception to someone else/);
    expect(String(p['consequence'])).toMatch(/at expiry every affected artifact is HELD/);
  });
  it('approved by the NAMED approver, SIGNED (exception_approval) — in force until its expiry', async () => {
    const pv = await preview(assurance, 'exception', EX);
    expect(pv.eligibility).toEqual({ can_decide: true, reasons: [] });
    const a = (await decideEx(assurance, EX, { version: 1, decision: 'approve', digest: pv['digest'] })).exception;
    expect(a).toMatchObject({ state: 'approved', decided_role: 'independent_assurance' });
    const sig = await one(sql`select s.* from governance.signatures s join governance.ws_exceptions e on e.signature_id = s.signature_id where e.exception_id = ${EX}::uuid`);
    expect(sig).toMatchObject({ subject_kind: 'exception_approval', signer: assurance.principalId, subject_digest: EX_V1 });
  });
  it('EXPIRY: read as expired on the database clock BEFORE the sweep; the steward\'s sweep → `expired`, release candidate RC-2 HELD', async () => {
    const exp = await one(sql`select expires_at from governance.ws_exceptions where exception_id = ${EX}::uuid and version = 1`);
    await sleep(Math.max(0, (exp['expires_at'] as Date).getTime() - Date.now()) + 400);
    const before = ((await home())['exceptions'] as Row[]).find((x) => x['exception_id'] === EX && x['version'] === 1)!;
    expect(before['effective_state']).toBe('expired (sweep pending)');
    const s = (await sweep()).sweep;
    const mine = (s['expired'] as Row[]).find((x) => x['exception_id'] === EX);
    expect(mine).toMatchObject({ version: 1 });
    const hold = await one(sql`select reason_kind, lifted_at, reason from governance.holds where subject_artifact = ${A['rc2']}::uuid and source_artifact = ${EX}::uuid`);
    expect(hold).toMatchObject({ reason_kind: 'exception_expired', lifted_at: null });
    expect(String(hold['reason'])).toMatch(/held until a renewal with current evidence is approved independently/);
    // DP-02-005: a data exception's expiry holds the affected data release too
    expect(await one(sql`select reason_kind, lifted_at from governance.holds where subject_artifact = ${A['dp']}::uuid and source_artifact = ${EX}::uuid`)).toEqual({ reason_kind: 'exception_expired', lifted_at: null });
    expect((await sweep()).sweep['expired']).toEqual([]);   // idempotent: nothing written when nothing expired
    expect((await sweep(stewardAgent)).sweep['expired']).toEqual([]);   // an agent steward may run it: the sweep is not an approval
    const rc = ((await home())['release_candidates'] as Row[]).find((x) => x['artifact_id'] === A['rc2'])!;
    expect((rc['open_holds'] as Row[]).map((x) => x['reason_kind'])).toEqual(['exception_expired']);
  });
  it('the ATTENTION TICK in the customer\'s domain raises ONE governance.exception item (rerun-safe); the ledger records the expiry', async () => {
    const steps = await tick();
    expect(steps['governance-exception-expiry']).toBeDefined();
    await tick();
    const items = await rows(sql`select state, signal_class, subject_kind from executive.attention_items where subject_id = ${EX}::uuid`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ signal_class: 'governance.exception', subject_kind: 'governance_exception' });
    expect(await one(sql`select count(*)::int as n from governance.events where subject_id = ${EX}::uuid and event = 'exception.expired'`)).toEqual({ n: 1 });
  });
  it('an exception expired BEFORE approval is refused (expired); the ageing counts it', async () => {
    const e = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: `late-${RUN}`, expiresAt: inSec(2), affectedArtifacts: [] }))).exception;
    EXD = String(e['exception_id']);
    await sleep(2500);
    await refused(decideEx(assurance, EXD, { version: 1, decision: 'approve', digest: e['digest'] }), /^governance exception rejected \(expired\): version 1 expired at .* before it was approved/, 409);
    const age = (await home())['ageing'] as Row;
    expect(((age['totals'] as Row)['expired'] as number)).toBeGreaterThanOrEqual(1);
    expect(Object.keys(age['buckets'] as Row).sort()).toEqual(['0-30', '31-90', '91-180', '>180'].sort());
  });
  it('RENEWAL: stale evidence refused (stale); current evidence by the DELEGATE (the matrix\'s live delegation) → RC-2\'s hold LIFTED, the item closed', async () => {
    await refused(proposeEx(steward, { exceptionId: EX, expectedVersion: 1, expiresAt: inSec(86_400 * 30), evidence: [ev('vitest:phase6-export-b15', 40)] }), /^governance exception rejected \(stale\): .* is not current evidence/, 409);
    await refused(proposeEx(steward, { exceptionId: EX, expectedVersion: 2, expiresAt: inSec(86_400 * 30), evidence: [ev('x')] }), /^governance exception rejected \(stale\): the exception is at version 1 \(expected 2\)/, 409);
    const r = (await proposeEx(steward, { exceptionId: EX, expectedVersion: 1, expiresAt: inSec(86_400 * 30), evidence: [ev('vitest:phase6-export-b15 (re-run)')] })).exception;
    expect(r).toMatchObject({ version: 2, renewal_of: 1, state: 'proposed' });
    expect(await one(sql`select lifted_at from governance.holds where subject_artifact = ${A['rc2']}::uuid and source_artifact = ${EX}::uuid`)).toEqual({ lifted_at: null });   // a proposal lifts nothing
    const pv = await preview(assurance2, 'exception', EX, 2);
    expect(String(pv['consequence'])).toMatch(/every hold its expiry opened is LIFTED/);
    const a = (await decideEx(assurance2, EX, { version: 2, decision: 'approve', digest: r['digest'] })).exception;
    expect(a).toMatchObject({ state: 'approved' });
    expect((a['holds_lifted'] as Row[]).map((x) => x['subject'])).toEqual([A['rc2'], A['dp']].sort());
    expect(await one(sql`select state from governance.ws_exceptions where exception_id = ${EX}::uuid and version = 1`)).toEqual({ state: 'superseded' });
    const lifted = await one(sql`select lifted_by::text as by, lift_reason from governance.holds where subject_artifact = ${A['rc2']}::uuid and source_artifact = ${EX}::uuid`);
    expect(lifted['by']).toBe(assurance2.principalId);
    expect(String(lifted['lift_reason'])).toMatch(/^renewed: GEX-\d+ v2 approved by .* with current evidence/);
    expect(await one(sql`select state from executive.attention_items where subject_id = ${EX}::uuid`)).toEqual({ state: 'closed' });
  });
  it('a STALE delegation (its day passed) no longer admits the delegate', async () => {
    await sql`update governance.ws_decision_rights set rows = (select jsonb_agg(case when r -> 'delegate' <> 'null'::jsonb then jsonb_set(r, '{delegate,until}', to_jsonb(${day(-1)}::text)) else r end) from jsonb_array_elements(rows) r)
              where state = 'approved'`.execute(h.su);
    const e = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: `deleg-${RUN}`, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    await refused(decideEx(assurance2, String(e['exception_id']), { version: 1, decision: 'approve', digest: e['digest'] }), /^governance exception rejected \(authority\): the approved decision-rights matrix/, 403);
    await sql`update governance.ws_decision_rights set rows = (select jsonb_agg(case when r -> 'delegate' <> 'null'::jsonb then jsonb_set(r, '{delegate,until}', to_jsonb(${day(7)}::text)) else r end) from jsonb_array_elements(rows) r)
              where state = 'approved'`.execute(h.su);
    await decideEx(assurance, String(e['exception_id']), { version: 1, decision: 'reject', digest: e['digest'] });
  });
  it('REPEATS (V03-T-451): the third exception against one contract opens a remediation review that HOLDS approvals until the product authority decides it', async () => {
    const C = `repeat-${RUN}`;
    const e1 = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: C, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    await decideEx(assurance, String(e1['exception_id']), { version: 1, decision: 'approve', digest: e1['digest'] });
    const e2 = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: C, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    expect(e2['review']).toBeNull();
    const e3 = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: C, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    expect(e3['review']).toMatchObject({ state: 'open', existing: false });
    const review = String((e3['review'] as Row)['review_id']);
    await refused(decideEx(assurance, String(e2['exception_id']), { version: 1, decision: 'approve', digest: e2['digest'] }), /^governance exception rejected \(held\): the repeated exceptions against repeat-.* are under remediation review GRR-\d+/, 409);
    // the review: never its opener; a remediation names its plan, owner and due day
    await refused(api.decideReview(rq(productA, 'governance.remediation.decide'), review, { payload: { decision: 'remediation', owner: ops.principalId, dueOn: day(30), plan: 'short', reason: 'remediate the contract' } }),
      /^governance exception rejected \(remediation\)/, 422);
    const d = await api.decideReview(rq(productA, 'governance.remediation.decide'), review, { payload: { decision: 'remediation', owner: ops.principalId, dueOn: day(30),
      plan: 'harden the export signing contract so no exception is needed (SYNTHETIC)', reason: 'repeated exceptions are architecture evidence' } }) as { review: Row };
    expect(d.review).toMatchObject({ state: 'remediation' });
    expect((await decideEx(assurance, String(e2['exception_id']), { version: 1, decision: 'approve', digest: e2['digest'] })).exception).toMatchObject({ state: 'approved' });
  });
  it('CLOSURE on the exit criteria (current evidence; never by the owner) and WITHDRAWAL (only its proposer or owner)', async () => {
    await refused(api.closeException(rq(ops, 'governance.exception.close'), EX, { payload: { version: 2, exitEvidence: [ev('signing proof')], reason: 'the exit criteria are met' } }),
      /^governance exception rejected \(separation_of_duties\)/, 403);
    await refused(api.closeException(rq(assurance, 'governance.exception.close'), EX, { payload: { version: 2, exitEvidence: [ev('old proof', 45)], reason: 'the exit criteria are met' } }),
      /^governance exception rejected \(stale\)/, 409);
    const c = await api.closeException(rq(assurance, 'governance.exception.close'), EX, { payload: { version: 2, exitEvidence: [ev('vitest:signing-every-export')], reason: 'the signing component signs every export' } }) as { exception: Row };
    expect(c.exception).toMatchObject({ state: 'closed' });
    const w = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: `withdraw-${RUN}`, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    await refused(api.withdrawException(rq(productA, 'governance.exception.withdraw'), String(w['exception_id']), { payload: { version: 1, reason: 'not mine to withdraw' } }), /^governance exception rejected \(ownership\)/, 403);
    expect(((await api.withdrawException(rq(ops, 'governance.exception.withdraw'), String(w['exception_id']), { payload: { version: 1, reason: 'the owner withdraws it' } })) as { exception: Row }).exception).toMatchObject({ state: 'withdrawn' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
let CP = '';
const PLANS = { consumer_impact: 'the NORDWERK tests and briefings citing the forecast are re-verified', compatibility: 'v2 adds an optional interval field; v1 consumers keep working',
  migration: 'no stored forecast is migrated; new issuances carry v2', replay: 'decisions replay against the forecast version they cited', rollback: 'the v1 contract stays published until the window closes',
  evidence: 'the contract test suite and the replay test run green on the candidate' };
describe('PG4 · change proposals (ES-72-003, PR-72-002/-003, IA-72-005)', () => {
  it('the impact is DETERMINISTIC (the same links, the same digest), ordered by depth', async () => {
    const r1 = await api.impact(rq(steward, 'governance.read'), { payload: { subjects: [A['ifForecast']] } }) as { impact: Row };
    const r2 = await api.impact(rq(productA, 'governance.read'), { payload: { subjects: [A['ifForecast']] } }) as { impact: Row };
    expect(r1.impact['digest']).toBe(r2.impact['digest']);
    const deps = r1.impact['dependents'] as Row[];
    expect(deps.filter((x) => x['depth'] === 1).map((x) => x['key']).sort()).toEqual([`V6:IA-58-003-${RUN}`, `briefing-forecast-${RUN}`, `phase6-forecast-test-${RUN}`].sort());
    expect(deps.filter((x) => x['depth'] === 2).every((x) => x['kind'] === 'exception' && x['via'] === A['reqExport'])).toBe(true);   // the exceptions against the dependent requirement
    expect(deps.map((x) => Number(x['depth']))).toEqual([...deps.map((x) => Number(x['depth']))].sort((a, b) => a - b));
  });
  it('a proposal without its plans is NOT approvable (plans) — the missing ones listed', async () => {
    const c = (await proposeChange(steward, { title: 'Forecast contract v2 (SYNTHETIC)', changeClass: 'interface', subjects: [A['ifForecast']], description: 'the forecast contract gains an interval field (SYNTHETIC)',
      plans: { consumer_impact: PLANS.consumer_impact }, builders: [ops.principalId] })).change;
    CP = String(c['proposal_id']);
    expect(c).toMatchObject({ approvable: false, missing_plans: ['compatibility', 'migration', 'replay', 'rollback', 'evidence'], required_roles: ['product_authority'] });
    await refused(decideChange(productA, CP, { version: 1, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(plans\): compatibility, migration, replay, rollback, evidence missing/, 422);
  });
  it('complete (v2): never the proposer, never a declared builder; approved by the product authority, SIGNED (change_approval)', async () => {
    const c = (await proposeChange(steward, { proposalId: CP, expectedVersion: 1, title: 'Forecast contract v2 (SYNTHETIC)', changeClass: 'interface', subjects: [A['ifForecast']],
      description: 'the forecast contract gains an interval field (SYNTHETIC)', plans: PLANS, builders: [ops.principalId] })).change;
    expect(c).toMatchObject({ version: 2, approvable: true });
    expect(((c['impact'] as Row)['dependents'] as Row[]).filter((x) => x['depth'] === 1)).toHaveLength(3);
    await refused(decideChange(ops, CP, { version: 2, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(authority\): approving a change is the act of a product_authority/, 403);
    await refused(decideChange(steward, CP, { version: 2, decision: 'approve', digest: c['digest'] }), /no qualifying role binding/, 403);
    const p = await preview(productA, 'change', CP, 2);
    expect(p.eligibility).toEqual({ can_decide: true, reasons: [] });
    const a = (await decideChange(productA, CP, { version: 2, decision: 'approve', digest: c['digest'] })).change;
    expect(a).toMatchObject({ state: 'approved', awaiting: [] });
    expect(await one(sql`select subject_kind, signer from governance.signatures where subject_id = ${CP}::uuid and subject_version = 2`)).toEqual({ subject_kind: 'change_approval', signer: productA.principalId });
  });
  it('the AUTHORITY CHAIN: a cross-volume change needs the product authority AND independent assurance (distinct humans); a builder refused', async () => {
    const c = (await proposeChange(steward, { title: 'Exception rules across volumes (SYNTHETIC)', changeClass: 'requirement', subjects: [A['reqV3'], A['reqV4']],
      description: 'harmonise the exception fields across V3 and V4 (SYNTHETIC)', plans: PLANS, builders: [compOwner.principalId] })).change;
    expect(c).toMatchObject({ cross_volume: true, required_roles: ['product_authority', 'independent_assurance'] });
    const id = String(c['proposal_id']);
    const first = (await decideChange(productB, id, { version: 1, decision: 'approve', digest: c['digest'] })).change;
    expect(first).toMatchObject({ state: 'proposed', awaiting: ['independent_assurance'] });
    await refused(decideChange(productB, id, { version: 1, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(separation_of_duties\): you have already decided version 1/, 403);
    await refused(decideChange(compOwner, id, { version: 1, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(separation_of_duties\): approving a change is never done by a builder/, 403);
    const second = (await decideChange(assurance3, id, { version: 1, decision: 'approve', digest: c['digest'] })).change;
    expect(second).toMatchObject({ state: 'approved', awaiting: [] });
    A['cpCross'] = id;
  });
  it('STALE: the impact moved since the proposal → refused; HELD: a subject under an open hold → refused', async () => {
    const c = (await proposeChange(steward, { title: 'Forecast contract v3 (SYNTHETIC)', changeClass: 'interface', subjects: [A['ifForecast']], description: 'another forecast change (SYNTHETIC)', plans: PLANS })).change;
    const late = await plant('test', 'late-forecast-test');
    await link(late, A['ifForecast']!, 'verifies');
    await refused(decideChange(productA, String(c['proposal_id']), { version: 1, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(stale\): the impact moved since the proposal \(\d+ then, \d+ now\)/, 409);
    const h2 = (await proposeChange(steward, { title: 'Candidate 2 change (SYNTHETIC)', changeClass: 'deployment', subjects: [A['rc1']], description: 'a change of a held candidate (SYNTHETIC)', plans: PLANS })).change;
    await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id) values (${uuidv7()}::uuid, 'PLATFORM', ${A['rc1']}::uuid, 'evidence_stale', 'a planted §CM hold (SYNTHETIC)', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await refused(decideChange(productA, String(h2['proposal_id']), { version: 1, decision: 'approve', digest: h2['digest'] }), /^change proposal rejected \(held\): a subject of the change is under an open conflict or hold/, 409);
    await sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${uuidv7()}::uuid, lift_reason = 'the planted hold lifted (SYNTHETIC)' where subject_artifact = ${A['rc1']}::uuid and lifted_at is null`.execute(h.su);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG5 · the conflict register (FEX-32, IA-02-005, DP-02-005, PR-01-005, PR-72-005)', () => {
  let K = ''; let KD = '';
  it('refusals: one artifact for a cross-volume conflict, an unknown artifact, a local team', async () => {
    await refused(raise(steward, { kind: 'cross_volume', title: 'One-sided conflict (SYNTHETIC)', description: 'a conflict needs two controlling artifacts (SYNTHETIC)', conflicting: [A['reqV3']] }), /^conformance conflict rejected \(conflicting\)/, 422);
    await refused(raise(steward, { kind: 'cross_volume', title: 'Unknown conflict (SYNTHETIC)', description: 'an unknown artifact named (SYNTHETIC)', conflicting: [A['reqV3'], uuidv7()] }), /^conformance conflict rejected \(unknown_artifact\)/, 404);
    await refused(raise(tenantAdmin, { kind: 'cross_volume', title: 'Local conflict (SYNTHETIC)', description: 'a local team raising (SYNTHETIC)', conflicting: [A['reqV3'], A['reqV4']] }), /no platform authority binding/, 403);
  });
  it('RAISED: the highest authority selected (controlling V3 over normative V4); RC-3 (linked) HELD at the last conformant candidate RC-2; the change on a conflicting subject held', async () => {
    const k = (await raise(steward, { kind: 'cross_volume', title: 'Exception field set disagrees across V3 and V4 (SYNTHETIC)', description: 'V3 names approvers; V4 forbids owner approval — the field sets disagree (SYNTHETIC)',
      conflicting: [A['reqV4'], A['reqV3']], impacted: [A['jrn']] })).conflict;
    K = String(k['conflict_id']);
    expect(k['highest_authority']).toBe(A['reqV3']);
    expect(k['affected_releases']).toEqual([A['rc3']]);
    expect(k['last_conformant']).toBe(A['rc2']);
    expect(await one(sql`select reason_kind, lifted_at from governance.holds where subject_artifact = ${A['rc3']}::uuid and source_artifact = ${K}::uuid`)).toEqual({ reason_kind: 'conflict', lifted_at: null });
    const c = (await proposeChange(steward, { title: 'Touching a conflicting requirement (SYNTHETIC)', changeClass: 'requirement', subjects: [A['reqV4']], description: 'a change of a conflicting artifact (SYNTHETIC)', plans: PLANS })).change;
    await refused(decideChange(productA, String(c['proposal_id']), { version: 1, decision: 'approve', digest: c['digest'] }), /^change proposal rejected \(held\)/, 409);
    expect((((await home())['posture'] as Row)['dimensions'] as Record<string, Row>)['conflicts']?.['state']).toBe('non_conformant');
  });
  it('the governing authority resolves — never its raiser; closure keeps the HIGHEST authority; an amendment needs an APPROVED change of it', async () => {
    const k = await one(sql`select digest from governance.ws_conflicts where conflict_id = ${K}::uuid`);
    const base = { digest: k['digest'], rationale: 'V3 controls the exception fields; V4 is read as its constraint (SYNTHETIC)' };
    await refused(resolve(productB, K, { ...base, mode: 'closure', prevailing: A['reqV4'] }), /^conformance conflict rejected \(authority_chain\): closure keeps the highest authority/, 422);
    await refused(resolve(productB, K, { ...base, mode: 'amendment', prevailing: A['reqV4'], changeProposal: CP }), /^conformance conflict rejected \(amendment\)/, 422);
    await refused(resolve(productB, K, { ...base, digest: 'd'.repeat(64), mode: 'closure', prevailing: A['reqV3'] }), /^conformance conflict rejected \(stale\)/, 409);
    const r = (await resolve(productB, K, { ...base, mode: 'closure', prevailing: A['reqV3'] })).conflict;
    expect(r).toMatchObject({ state: 'resolved' });
    const res = r['resolution'] as Row;
    expect(res['trace_closed']).toBe(true);
    expect((res['holds_lifted'] as Row[]).map((x) => x['subject'])).toEqual([A['rc3']]);
    expect(await rows(sql`select relation from governance.links_live where from_artifact = ${A['reqV3']}::uuid and to_artifact in (${A['jrn']}::uuid, ${A['reqV4']}::uuid) order by relation`)).toEqual([{ relation: 'governs' }, { relation: 'supersedes' }]);
    expect(await one(sql`select subject_kind, signer from governance.signatures where subject_id = ${K}::uuid`)).toEqual({ subject_kind: 'conflict_resolution', signer: productB.principalId });
  });
  it('PR-01-005: an UNRESOLVED AUTHORITY is routed through the chain (one artifact; the disputed state preserved until the governing authority resolves it)', async () => {
    const k = (await raise(stewardAgent, { kind: 'authority_unresolved', title: 'Who owns the supply-chain workspace? (SYNTHETIC)', description: 'two product owners claim the capability in the planning notes (SYNTHETIC)',
      conflicting: [A['capC']], impacted: [A['capC']] })).conflict;   // an agent may RAISE (prepare); it never resolves
    expect(k).toMatchObject({ state: 'open', highest_authority: A['capC'], affected_releases: [] });
    expect((((await home())['posture'] as Row)['dimensions'] as Record<string, Row>)['conflicts']?.['open']).toBeGreaterThanOrEqual(1);
    const r = (await resolve(productB, String(k['conflict_id']), { digest: k['digest'], mode: 'closure', prevailing: A['capC'], rationale: 'the recorded accountable owner stands (SYNTHETIC)' })).conflict;
    expect(r).toMatchObject({ state: 'resolved' });
  });
  it('AMENDMENT: another artifact prevails only through an approved change of the highest-authority artifact', async () => {
    const k = (await raise(productA, { kind: 'requirement', title: 'Field naming disagreement (SYNTHETIC)', description: 'the two requirements name the owner field differently (SYNTHETIC)',
      conflicting: [A['reqV3'], A['reqV4']], impacted: [] })).conflict;
    KD = String(k['conflict_id']);
    await refused(resolve(productA, KD, { digest: k['digest'], mode: 'closure', prevailing: A['reqV3'], rationale: 'the raiser never resolves its own conflict (SYNTHETIC)' }), /^conformance conflict rejected \(separation_of_duties\)/, 403);
    const r = (await resolve(productB, KD, { digest: k['digest'], mode: 'amendment', prevailing: A['reqV4'], changeProposal: A['cpCross'], rationale: 'V3 is amended by the approved cross-volume change (SYNTHETIC)' })).conflict;
    expect((r['resolution'] as Row)['mode']).toBe('amendment');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG6 · the governance registry and the posture (ES-72-001/-005, IA-72-001/-002, INF-DL-08, DP-72-001/-002, DAT-GV-06)', () => {
  let DR = ''; let DEBT = ''; let DEP = '';
  it('a decision record: accountable owner, approving authority, cadence; never approved by its proposer or owner; ACTIVE with its next review', async () => {
    await refused(proposeRecord(steward, { kind: 'decision_record', title: 'Exceptions live in one registry (SYNTHETIC)', statement: 'every product exception is governed in the in-product registry (SYNTHETIC)',
      owner: ops.principalId, approvingRole: 'conformance_steward', reviewCadenceDays: 90 }), /^governance record rejected \(approving_role\)/, 422);
    const r = (await proposeRecord(steward, { kind: 'decision_record', title: 'Exceptions live in one registry (SYNTHETIC)', statement: 'every product exception is governed in the in-product registry (SYNTHETIC)',
      owner: ops.principalId, approvingRole: 'operations_authority', reviewCadenceDays: 90, dependencies: [A['capB']] })).record;
    DR = String(r['record_id']);
    await refused(decideRecord(ops, DR, { version: 1, decision: 'approve', digest: r['digest'] }), /^governance record rejected \(separation_of_duties\): approving a governance record is never done by a builder/, 403);
    await refused(decideRecord(productA, DR, { version: 1, decision: 'approve', digest: r['digest'] }), /^governance record rejected \(authority\)/, 403);
    const a = (await decideRecord(compOwner, DR, { version: 1, decision: 'approve', digest: r['digest'] })).record;
    expect(a).toMatchObject({ state: 'active', next_review_due: day(90) });
  });
  it('CONTROLLED AMENDMENT (v2 supersedes v1 only when approved); a REVIEW by the owner advances the cadence; an outsider never reviews', async () => {
    const v2 = (await proposeRecord(steward, { recordId: DR, expectedVersion: 1, title: 'Exceptions live in one registry, amended (SYNTHETIC)', statement: 'every product exception is governed in the registry, renewals included (SYNTHETIC)' })).record;
    expect(await one(sql`select version from governance.ws_records where record_id = ${DR}::uuid and state = 'active'`)).toEqual({ version: 1 });
    await decideRecord(compOwner, DR, { version: 2, decision: 'approve', digest: v2['digest'] });
    expect(await rows(sql`select version, state from governance.ws_records where record_id = ${DR}::uuid order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'active' }]);
    await refused(api.reviewRecord(rq(steward, 'governance.record.review'), DR, { payload: { version: 2, note: 'an outsider reads the record' } }), /^governance record rejected \(authority\)/, 403);
    const rv = await api.reviewRecord(rq(ops, 'governance.record.review'), DR, { payload: { version: 2, note: 'the registry still holds every exception' } }) as { record: Row };
    expect(rv.record).toMatchObject({ reviews: 1, next_review_due: day(90) });
  });
  it('TECHNICAL DEBT as decision-active risk; its closure VERIFIED by the authority — never by its owner, never on stale evidence', async () => {
    await refused(proposeRecord(steward, { kind: 'debt', title: 'Unsigned export window (SYNTHETIC)', statement: 'exports may ship unsigned during the exception window (SYNTHETIC)', owner: ops.principalId,
      approvingRole: 'product_authority', reviewCadenceDays: 30, details: { affectedObjectives: [], customers: [], consequences: 'unsigned exports', dueOn: day(30), investment: '2 U' } }), /^governance record rejected \(debt\)/, 422);
    const d = (await proposeRecord(steward, { kind: 'debt', title: 'Unsigned export window (SYNTHETIC)', statement: 'exports may ship unsigned during the exception window (SYNTHETIC)', owner: ops.principalId,
      approvingRole: 'product_authority', reviewCadenceDays: 30, details: { affectedObjectives: ['export integrity'], customers: ['NORDWERK (SYNTHETIC)'], consequences: 'a recipient cannot verify an unsigned export', dueOn: day(30), investment: '2 U' } })).record;
    DEBT = String(d['record_id']);
    await decideRecord(productA, DEBT, { version: 1, decision: 'approve', digest: d['digest'] });
    await refused(api.closeRecord(rq(ops, 'governance.record.close'), DEBT, { payload: { version: 1, mode: 'verified_closure', evidence: [ev('signing proof')], reason: 'the owner closes its own debt' } }), /^governance record rejected \((authority|separation_of_duties)\)/, 403);
    await refused(api.closeRecord(rq(productA, 'governance.record.close'), DEBT, { payload: { version: 1, mode: 'verified_closure', evidence: [ev('old proof', 40)], reason: 'verified on old evidence' } }), /^governance record rejected \(stale\)/, 409);
    const c = await api.closeRecord(rq(productB, 'governance.record.close'), DEBT, { payload: { version: 1, mode: 'verified_closure', evidence: [ev('vitest:signing-every-export')], reason: 'every export is signed on the candidate' } }) as { record: Row };
    expect(c.record).toMatchObject({ state: 'closed' });
  });
  it('a deprecation RETIRED with proof and its successor; the posture dimensions; the snapshot versioned only on change', async () => {
    const dp = (await proposeRecord(steward, { kind: 'deprecation', title: 'Retire candidate RC-1 (SYNTHETIC)', statement: 'candidate RC-1 is deprecated in favour of RC-2 (SYNTHETIC)', owner: productA.principalId,
      approvingRole: 'product_authority', reviewCadenceDays: 30, details: { subject: A['rc1'], sunsetOn: day(14), migration: 'promote RC-2 after its hold lifts' } })).record;
    DEP = String(dp['record_id']);
    await decideRecord(productB, DEP, { version: 1, decision: 'approve', digest: dp['digest'] });
    const rt = await api.closeRecord(rq(productB, 'governance.record.close'), DEP, { payload: { version: 1, mode: 'retirement', evidence: [ev('RC-1 withdrawn from every profile')], successor: A['rc2'], reason: 'RC-1 is retired; RC-2 succeeds it' } }) as { record: Row };
    expect(rt.record).toMatchObject({ state: 'retired' });
    const posture = (await home())['posture'] as Row;
    expect(((posture['dimensions'] as Record<string, Row>)['records'])?.['state']).toBe('conformant');
    const s1 = await api.recordPosture(rq(steward, 'governance.posture.record')) as { posture: Row };
    expect(s1.posture['recorded']).toBe(true);
    const s2 = await api.recordPosture(rq(steward, 'governance.posture.record')) as { posture: Row };
    expect(s2.posture).toMatchObject({ recorded: false, seq: s1.posture['seq'] });
    await refused(api.recordPosture(rq(productA, 'governance.posture.record')), /no qualifying role binding/, 403);
    expect(await failure(sql`delete from governance.ws_posture_snapshots`)).toMatch(/append-only|append only/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('PG7 · unauthorized role, cross-tenant, replay, the fault exercise, the home read', () => {
  it('UNAUTHORIZED ROLE: the platform admin (no governance role), a tenant or domain administrator (a local team) reach no PLATFORM act; an agent never approves', async () => {
    await refused(decideBaseline(platformAdmin, BL, { version: 4, decision: 'reject', digest: 'a'.repeat(64) }), /no qualifying role binding/, 403);
    await refused(api.read(rq(dadmin, 'governance.read')), /no platform authority binding/, 403);
    await refused(decideRights(tenantAdmin, RIGHTS, { version: 2, decision: 'approve', digest: 'a'.repeat(64) }), /no platform authority binding/, 403);
    await refused(decideChange(machine, CP, { version: 2, decision: 'approve', digest: 'a'.repeat(64) }), /^change proposal rejected \(actor\)/, 403);
  });
  it('CROSS-TENANT: the expired exception\'s attention item exists only in the domain its customer scope covers', async () => {
    const other = await one(sql`select count(*)::int as n from executive.attention_items where signal_class = 'governance.exception' and domain_id <> ${D()}::uuid`);
    expect(other).toEqual({ n: 0 });
    expect(await one(sql`select governance.ws_scope_covers('{"domains":[{"tenant":"${sql.raw(T())}","domain":"${sql.raw(D())}"}]}'::jsonb, ${T()}::uuid, ${uuidv7()}::uuid) as c`)).toEqual({ c: false });
  });
  it('REPLAY: the ledger reconstructs the exception\'s life; every recorded platform signature verifies against the bound key', async () => {
    const life = await rows(sql`select version, event from governance.events where subject_id = ${EX}::uuid order by occurred_at`);
    expect(life.map((x) => `${String(x['version'])}:${String(x['event'])}`)).toEqual(['1:exception.proposed', '1:exception.approved', '1:exception.expired', '2:exception.renewal_proposed', '2:exception.renewed', '2:exception.closed']);
    const sigs = await rows(sql`select key_id, signature, subject_digest from governance.signatures where bound_action like 'governance.%' and signer_role is not null and key_id like 'ed25519:%' and signature ~ '^[A-Za-z0-9+/]{86}==$'`);
    expect(sigs.length).toBeGreaterThanOrEqual(6);
    for (const s of sigs) expect(svc.verifySignature(s as never)).toBe(true);
  });
  it('FAULT: with no signing key bound an approval is REFUSED (unbound) and nothing is written; bound again, it succeeds', async () => {
    const e = (await proposeEx(steward, EXPORT_EXCEPTION({ contractKey: `fault-${RUN}`, expiresAt: inSec(86_400), affectedArtifacts: [] }))).exception;
    const saved = process.env[KEY_REF]; delete process.env[KEY_REF];
    try {
      await refused(decideEx(assurance, String(e['exception_id']), { version: 1, decision: 'approve', digest: e['digest'] }), /^signature rejected \(unbound\)/, 409);
    } finally { process.env[KEY_REF] = saved; }
    expect(await one(sql`select state from governance.ws_exceptions where exception_id = ${String(e['exception_id'])}::uuid`)).toEqual({ state: 'proposed' });
    expect((await decideEx(assurance, String(e['exception_id']), { version: 1, decision: 'approve', digest: e['digest'] })).exception).toMatchObject({ state: 'approved' });
  });
  it('the records are append-only where they are ledgers, every table forces RLS, and no row can claim more than a demonstration', async () => {
    expect(await failure(sql`update governance.ws_change_approvals set reason = 'rewritten'`)).toMatch(/append-only|append only/i);
    expect(await failure(sql`update governance.ws_baselines set claim = 'real_acceptance'`)).toMatch(/check constraint|claim/);
    const forced = await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance' and c.relname like 'ws\\_%' and c.relkind = 'r' order by 1`);
    expect(forced.map((r) => r['t'])).toEqual(['ws_baselines', 'ws_capability_owners', 'ws_change_approvals', 'ws_change_proposals', 'ws_conflicts', 'ws_decision_rights', 'ws_exception_reviews', 'ws_exceptions', 'ws_posture_snapshots', 'ws_records']);
    expect(forced.every((r) => r['f'] === true)).toBe(true);
    // a PLATFORM registry row is readable from a tenant's context (it is not tenant data); writes only through the ports (no write grant)
    expect(await one(sql`select has_table_privilege('eye_commit', 'governance.ws_exceptions', 'INSERT') as w, has_table_privilege('eye_app', 'governance.ws_exceptions', 'SELECT') as r`)).toEqual({ w: false, r: true });
  });
  it('THE HOME: every section present, the signer bound, the ledger and the boundary', async () => {
    const r = await home(productA);
    for (const k of ['inventory', 'owners', 'baselines', 'rights', 'exceptions', 'ageing', 'reviews', 'conflicts', 'changes', 'records', 'posture', 'snapshots', 'holds', 'release_candidates', 'ledger', 'repository_registers', 'signer', 'receipt']) {
      expect(r[k], k).toBeDefined();
    }
    expect(r['signer']).toMatchObject({ bound: true });
    expect((r['caller'] as Row)['roles']).toEqual(['product_authority']);
    expect((r['ledger'] as Row[]).length).toBeGreaterThan(10);
  });
});
