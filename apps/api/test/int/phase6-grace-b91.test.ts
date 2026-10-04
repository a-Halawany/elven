/**
 * CP-6 B91 §GR (0105 §GR) — GRACE, CONTINUITY AND THE OFFLINE LICENCE TOKEN (F-P7-F-01 clauses 4–5: FEX-30, PR-66-005/006, AT-66 — renewal
 * and suspension recovery, quota and grace scenarios, offline licensing; UX-67-001..006 — the entitlement surface), through the real database
 * and controllers (the grace routes, the executive attention routes, the audit route, the attention tick by hand).
 *
 *   a THE GRACE POLICY: declared and versioned by the commercial authority; the boundary (read and preserve cannot be removed), the stale
 *     version, the unknown tenant, the tenant administrator (the policy), the port's own actor check; a version immutable and never deleted.
 *   b UNCONTRACTED: no licence → the tick step does nothing (default-off), the rules say the gate does not apply.
 *   c THE ROUTING (the B90 lesson): the renewal notice under a policy WITHOUT the class abstains (deprioritized — seen by nobody); under the
 *     PUBLISHED class it is routed to the tenant administrator (owned by the commercial authority); the tenant administrator reads it.
 *   d RENEWAL: the commercial authority renews (the term extended, active); refusals (the tenant administrator, an agent holding the role —
 *     the human gate —, a term in the past, an unknown version); the recovery.
 *   e SUSPENSION: suspended with the last valid entitlement kept; every existing record still readable (the audit, the queue, the standing);
 *     refusals (twice, a renewal while suspended, a token while suspended); reinstated.
 *   f THE LAPSE: the term ended → GRACE with the last valid entitlement and the declared grace; the grace passed → LAPSED; refusals
 *     (reinstating an ended term, a lapsed licence); the renewal recovers.
 *   g INDETERMINATE (FEX-30): conflicting live versions → grace with the last valid entitlement; unreadable → grace with the last readable
 *     version; refusals while indeterminate; the recovery when §EN supersedes the stray version.
 *   h THE OFFLINE TOKEN: issued, signed, verified offline by scripts/commercial/verify-licence.mjs; refusals (an unbound key reference, an
 *     expiry past the term, a forged payload at the port, the tenant administrator); re-served exactly; another profile.
 *   i THE SURFACE: the tenant's standing (current entitlement, included capabilities, limits and usage, renewal and continuity, grace), the
 *     banner's explanation; refusals (an outsider, a domain role on the tenant's route); the auditor reads it.
 *   j PRESERVED WORK: no tenant row deleted across every transition; a version's content never edited; the ledgers append-only.
 *
 * FIXTURES, stated: the licence VERSIONS are §EN's (commercial.issue_licence does not exist in this worktree) — they are seeded through the
 * superuser as §EN would issue and supersede them (a new version supersedes the previous); the USAGE records are §ME's — seeded the same way.
 * Every transition is made through this part's real ports. Every figure is SYNTHETIC. The signing key is generated here, bound to an env
 * reference in this process only, never printed. Times are the DATABASE's (windows seeded relative to clock_timestamp()); no clock is moved.
 * Without §EN's gate in this worktree, "readable in grace and suspension" is proven by reading through the real routes and by the row
 * counts; the integrator's combined run re-proves it with the gate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraceController } from '../../src/commercial/grace/grace.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { AdminControllers } from '../../src/pipeline/admin.controllers.js';
import { GraceCapability } from '../../src/commercial/grace/grace.capabilities.js';
import { verifyToken, canonicalPayload, sha256Hex, type TokenPayload } from '../../src/commercial/grace/licence-token.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let grace: GraceController; let exec: ExecutiveController; let admin: AdminControllers; let scheduler: SchedulerService; let timer: AttentionTimerService;
/** The vendor's commercial authority (PLATFORM); an AGENT holding the same role (the human gate); the tenant administrator; the auditor; the
 *  domain administrator; the simulation operator; the executive (publishes the attention policy); an outsider. */
let ca: AuthenticatedPrincipal; let caAgent: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let operator: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentId = '';
const L = uuidv7(); const L2 = uuidv7();
const KEY_REF = 'EYE_LICENCE_SIGNING_KEY_B91_GRACE_HARNESS';
let vendorPublicPem = '';
let dir = '';
let tickDay = 1;
let BASELINE: Record<string, number> = {};
let V1_CONTENT: Row = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const VERIFIER = resolve(__dirname, '../../../../scripts/commercial/verify-licence.mjs');

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
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
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const obj = (v: unknown): Row => (v ?? {}) as Row;
/** An instant in ms, from a pg Date or a jsonb text (microseconds truncated to the ms). */
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : Math.floor(Date.parse(String(v))));

/* ───────────── envelopes ───────────── */
function envelopeOf(as: AuthenticatedPrincipal, action: string, scope: 'PLATFORM' | 'TENANT', type: string, id: string | null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: scope === 'TENANT' ? T() : null, domain_id: null, principal_id: `principal:${as.principalId}`, purpose_id: 'commercial', action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: type, object_id: id, schema_version: 'v1', issued_at: new Date().toISOString(),
    clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b91-grace' } as unknown as Envelope;
}
function envOf(as: AuthenticatedPrincipal, action: string, scope: 'PLATFORM' | 'TENANT', type: string, id: string | null) {
  return { eyeEnvelope: envelopeOf(as, action, scope, type, id), eyePrincipal: as } as never;
}
const P = (as: AuthenticatedPrincipal, action: string, type = 'LIC', id: string | null = null) => envOf(as, action, 'PLATFORM', type, id);
const TN = (as: AuthenticatedPrincipal, action: string) => envOf(as, action, 'TENANT', 'LIC', null);
const DM = (as: AuthenticatedPrincipal, action: string, type = 'LIC', id: string | null = null) => h.req(as, action, type, id, 'commercial');

/* ───────────── the routes (in process) ───────────── */
const setPolicy = (as: AuthenticatedPrincipal, payload: Row) => grace.setPolicy(P(as, 'commercial.grace.set', 'GRP'), { payload }) as Promise<{ policy: Row }>;
const renew = (as: AuthenticatedPrincipal, licenceId: string, payload: Row) => grace.renew(P(as, 'commercial.licence.renew', 'LIC', licenceId), licenceId, { payload }) as Promise<{ transition: Row }>;
const suspend = (as: AuthenticatedPrincipal, licenceId: string, payload: Row) => grace.suspend(P(as, 'commercial.licence.suspend', 'LIC', licenceId), licenceId, { payload }) as Promise<{ transition: Row }>;
const reinstate = (as: AuthenticatedPrincipal, licenceId: string, payload: Row) => grace.reinstate(P(as, 'commercial.licence.reinstate', 'LIC', licenceId), licenceId, { payload }) as Promise<{ transition: Row }>;
const issueToken = (as: AuthenticatedPrincipal, licenceId: string, payload: Row) => grace.issueToken(P(as, 'commercial.offline_token.issue', 'LTK'), licenceId, { payload }) as Promise<{ record: Row; token: Row }>;
const readToken = (as: AuthenticatedPrincipal, tokenId: string) => grace.readToken(P(as, 'commercial.grace.read', 'LTK', tokenId), tokenId) as Promise<{ record: Row; token: Row }>;
const standing = (as: AuthenticatedPrincipal) => grace.standing(TN(as, 'commercial.grace.read'), T()) as Promise<{ standing: Row }>;
const platformStanding = (as: AuthenticatedPrincipal) => grace.platformStanding(P(as, 'commercial.grace.read'), { payload: { tenantId: T() } }) as Promise<{ standing: Row }>;
const listLicences = (as: AuthenticatedPrincipal) => grace.listLicences(P(as, 'commercial.grace.read'), { payload: { tenantId: T() } }) as Promise<{ licences: Row[] }>;
const rulesOf = async (as: AuthenticatedPrincipal = tenantAdmin) => (await grace.rules(TN(as, 'commercial.grace.read'), T()) as { rules: Row }).rules;
const explain = (as: AuthenticatedPrincipal, capability = 'simulation') => grace.explanation(DM(as, 'commercial.grace.read'), T(), D(), { payload: { capability } }) as Promise<{ explanation: Row }>;
const queue = async (as: AuthenticatedPrincipal) => (await exec.listAttentionItems(h.req(as, 'executive.attention.read', 'ATI', null, 'executive'), T(), D(), { payload: { signalClass: 'commercial.entitlement', limit: 200 } }) as unknown as Row);
const auditQuery = (as: AuthenticatedPrincipal) => admin.auditQueryTenant(envOf(as, 'audit.read', 'TENANT', 'AUD', null), T(), { payload: { limit: 5 } }) as Promise<{ events: unknown[] }>;
const tick = async (): Promise<Row> => {
  tickDay += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, tickDay)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = obj(t.run?.outputs); const steps = obj(outputs['steps'] ?? outputs);
  return obj(steps['commercial-licence-lapse']);
};
const licenceRow = async (licenceId: string, version: number): Promise<Row> =>
  (await rows(sql`select licence_id::text, version, state, capabilities, limits, package_key, effective_from, effective_to, provenance, digest, grace_until, last_valid, state_changed_at from commercial.licences where licence_id = ${licenceId}::uuid and version = ${version}`))[0]!;
const transitions = async (licenceId: string, version: number) => rows(sql`select kind, cause, from_state, to_state, actor_kind, actor_principal_id::text as actor, grace_until, last_valid, renewed_until, term_end_before, term_end_after, attention_items, reason
  from commercial.licence_transitions where licence_id = ${licenceId}::uuid and version = ${version} order by occurred_at, transition_id`);
const itemsOf = async () => rows(sql`select item_id::text, state, outcome, owner_principal_id::text as owner, route_roles, policy_version, title, details, cause_event_id::text
  from executive.attention_items where tenant_id = ${T()}::uuid and signal_class = 'commercial.entitlement' order by created_at`);
const dbNow = async (): Promise<Date> => new Date(String((await rows(sql`select clock_timestamp() as t`))[0]!['t']));
const dbPlusDays = async (days: number): Promise<string> => String((await rows(sql`select to_char((clock_timestamp() + make_interval(days => ${days}::int)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))[0]!['t']);

/** §EN's ISSUE, as a stated fixture: version v+1 of the licence (the previous live version superseded), the window relative to the DB instant. */
async function issueFixture(licenceId: string, caps: string[], fromDays: number, toDays: number | null, opts: { supersede?: boolean; limits?: Row; provenance?: Row } = {}): Promise<number> {
  if (opts.supersede !== false) {
    await sql`update commercial.licences set state = 'superseded', state_changed_at = clock_timestamp() where licence_id = ${licenceId}::uuid and state <> 'superseded'`.execute(su);
  }
  const v = Number((await rows(sql`select coalesce(max(version), 0) + 1 as v from commercial.licences where licence_id = ${licenceId}::uuid`))[0]!['v']);
  const provenance = opts.provenance ?? { sku: 'SKU-FD-12M (SYNTHETIC)', order_ref: `ORD-B91-${v}`, issued_by: 'the §EN fixture (commercial.issue_licence is not in this worktree)' };
  await sql`insert into commercial.licences (licence_id, version, tenant_id, package_key, capabilities, limits, effective_from, effective_to, state, provenance, digest, issued_by, correlation_id)
            values (${licenceId}::uuid, ${v}::int, ${T()}::uuid, 'foresight-decision', ${caps}::text[], ${JSON.stringify(opts.limits ?? { model_inference: 5000, simulation_compute: 0 })}::jsonb,
                    clock_timestamp() + make_interval(days => ${fromDays}::int),
                    case when ${toDays}::int is null then null else clock_timestamp() + make_interval(days => ${toDays ?? 0}::int) end,
                    'active', ${JSON.stringify(provenance)}::jsonb,
                    encode(sha256(convert_to(${`${licenceId}:${v}:${caps.join(',')}`}, 'UTF8')), 'hex'), ${ca.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return v;
}

/** A PLATFORM principal with a session (the commercial authority is the vendor's: no tenant). */
async function platformPrincipal(roles: string[], label: string, kind: 'human' | 'agent' = 'human'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const run = id.slice(-8);
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'PLATFORM', null, null, ${`fixture-${label}-${run}`}, ${`fx-${label.slice(0, 4)}-${run}`}, 'active')`.execute(su);
  for (const role of roles) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'PLATFORM', null, null)`.execute(su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null,
    bindings: roles.map((roleCode) => ({ roleCode, scope: 'PLATFORM' as const, tenantId: null, domainId: null })) });
}

/** Every tenant row in every governed schema: the PRESERVED-WORK count (nothing deleted). */
async function tenantCounts(): Promise<Record<string, number>> {
  const tables = await rows(sql`select c.table_schema as s, c.table_name as t from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
    where c.column_name = 'tenant_id' and x.table_type = 'BASE TABLE' and c.table_schema in ('observation','intelligence','graph','prediction','twin','simulation','decision','executive','memory','retention','products','objects','audit','policy','commercial')
    order by 1, 2`);
  const out: Record<string, number> = {};
  for (const r of tables) {
    const n = (await rows(sql`select count(*)::int as n from ${sql.table(`${String(r['s'])}.${String(r['t'])}`)} where tenant_id = ${T()}::uuid`))[0]!['n'];
    out[`${String(r['s'])}.${String(r['t'])}`] = Number(n);
  }
  return out;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraceController: GC } = await import('../../src/commercial/grace/grace.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { AdminControllers: Ac } = await import('../../src/pipeline/admin.controllers.js');
  grace = h.app.get(GC); exec = h.app.get(Ec); admin = h.app.get(Ac);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  // the harness's own signing key (SYNTHETIC), bound to the reference in this process only — never printed
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env[KEY_REF] = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  vendorPublicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  dir = mkdtempSync(join(tmpdir(), 'b91-grace-int-'));
  ca = await platformPrincipal(['commercial_authority'], 'b91g-commercial');
  caAgent = await platformPrincipal(['commercial_authority'], 'b91g-agent', 'agent');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b91g-tenant-admin', 'TENANT');
  auditor = await h.humanWithSession(['auditor'], 'b91g-auditor', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b91g-dadmin');
  operator = await h.humanWithSession(['simulation_operator'], 'b91g-operator');
  reviewer = await h.humanWithSession(['executive'], 'b91g-reviewer');
  outsider = await h.humanWithSession(['collection_manager'], 'b91g-outsider');
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await new Promise((res) => setTimeout(res, 1500));
  await scheduler.unscheduleAttentionTick(T(), D());
  // THE ATTENTION POLICY v1 — WITHOUT the commercial classes (the B90 lesson is proven before the class is routed)
  await exec.publishAttentionPolicy(h.req(reviewer, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the harness policy before the commercial class is routed', rules: { classes: {
    'catalog.coverage': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['data_steward'], ack_within_minutes: 240 } } } } as never });
  BASELINE = await tenantCounts();
}, 400_000);

afterAll(async () => {
  delete process.env[KEY_REF];
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  await h?.close();
});

describe('B91 §GR · a THE GRACE POLICY (versioned; read and preserve cannot be removed)', () => {
  it('POSITIVE: the commercial authority declares v1 and v2 (v1 superseded, kept); the rules read the declared version; with none, the DEFAULT was stated', async () => {
    const before = await rulesOf();
    expect(obj(before['policy'])).toMatchObject({ source: 'default', version: null, grace_days: 14, allows: ['read_and_preserve', 'finish_running_work'], renewal_notice_days: 30 });
    const v1 = (await setPolicy(ca, { tenantId: T(), expectedVersion: 0, graceDays: 14, allows: ['read_and_preserve', 'finish_running_work'], renewalNoticeDays: 30, reason: 'the standard grace for the tenant (SYNTHETIC)' })).policy;
    expect(v1).toMatchObject({ version: 1, supersedes: null, grace_days: 14, allows: ['finish_running_work', 'read_and_preserve'] });
    const v2 = (await setPolicy(ca, { tenantId: T(), expectedVersion: 1, graceDays: 10, allows: ['read_and_preserve', 'finish_running_work'], renewalNoticeDays: 30, reason: 'a ten-day grace agreed in the contract (SYNTHETIC)' })).policy;
    expect(v2).toMatchObject({ version: 2, supersedes: 1, grace_days: 10 });
    expect(obj((await rulesOf())['policy'])).toMatchObject({ source: 'declared', version: 2, grace_days: 10 });
    expect((await rows(sql`select version, state from commercial.grace_policies where tenant_id = ${T()}::uuid order by version`)).map((x) => [x['version'], x['state']])).toEqual([[1, 'superseded'], [2, 'active']]);
  });
  it('REFUSAL: the BOUNDARY (no read and preserve) at the port; a stale version; an unknown tenant; 0 days; the tenant administrator (the policy); an agent holding the role (the human gate); the port\'s own actor check', async () => {
    await refused(setPolicy(ca, { tenantId: T(), expectedVersion: 2, graceDays: 10, allows: ['finish_running_work', 'new_work'], renewalNoticeDays: 30, reason: 'a grace that drops the customer\'s reads' }),
      /^grace policy rejected \(boundary\): read and preserve cannot be removed/, 422);
    await refused(setPolicy(ca, { tenantId: T(), expectedVersion: 1, graceDays: 10, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'naming a version that is no longer current' }), /^grace policy rejected \(stale\)/, 409);
    await refused(setPolicy(ca, { tenantId: uuidv7(), expectedVersion: 0, graceDays: 10, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'a tenant that does not exist' }), /^grace policy rejected \(unknown_tenant\)/, 404);
    await refused(setPolicy(ca, { tenantId: T(), expectedVersion: 2, graceDays: 0, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'a grace of no days at all' }), /^grace policy rejected \(grace_days\)/, 422);
    await refused(setPolicy(tenantAdmin, { tenantId: T(), expectedVersion: 2, graceDays: 90, allows: ['read_and_preserve', 'new_work'], renewalNoticeDays: 30, reason: 'the tenant grants itself a long grace' }), /no platform authority binding|no qualifying role/, 403);
    const g = await refusal(setPolicy(caAgent, { tenantId: T(), expectedVersion: 2, graceDays: 10, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'an agent setting a grace policy' }));
    expect(g.status).toBe(403); expect(g.code).toBe('EYE-WFL-002'); expect(g.message).toMatch(/human gate/);
    // the PDP passes the commercial authority; the PORT refuses a write recorded under another principal's name
    const forged = await refusal(h.pipeline.write(envelopeOf(ca, 'commercial.grace.set', 'PLATFORM', 'GRP', null), ca, { scope: 'PLATFORM', tenantId: null, domainId: null, action: 'commercial.grace.set', objectType: 'GRP', objectId: null },
      GraceCapability.policy, async (cap) => ({ result: await cap.setPolicy({ policyId: uuidv7(), tenantId: T(), expectedVersion: 2, graceDays: 10, allows: ['read_and_preserve'], renewalNoticeDays: 30,
        reason: 'recorded under the tenant administrator\'s name', actor: tenantAdmin.principalId, correlationId: uuidv7() }), targetType: 'GRP', targetId: null, targetVersion: null, outboxEvent: null })));
    expect(forged.message).toMatch(/^grace policy rejected \(actor\)/); expect(forged.status).toBe(403);
    expect((await rows(sql`select count(*)::int as n from commercial.grace_policies where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(2);
  });
  it('RECOVERY: v3 on the current version; a version is immutable and never deleted (stated superuser attempts refused)', async () => {
    const v3 = (await setPolicy(ca, { tenantId: T(), expectedVersion: 2, graceDays: 10, allows: ['read_and_preserve', 'finish_running_work'], renewalNoticeDays: 30, reason: 'restated after the refused drafts (SYNTHETIC)' })).policy;
    expect(v3).toMatchObject({ version: 3, supersedes: 2 });
    await expect(sql`update commercial.grace_policies set grace_days = 90 where tenant_id = ${T()}::uuid and version = 3`.execute(su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from commercial.grace_policies where tenant_id = ${T()}::uuid and version = 1`.execute(su)).rejects.toThrow(/never deleted/);
  });
});

describe('B91 §GR · b UNCONTRACTED (default-off)', () => {
  it('POSITIVE: no licence → the tick step runs and does nothing; the rules say UNCONTRACTED — the gate does not apply', async () => {
    const reg = h.app.get(AttentionTickRegistry);
    expect(reg.steps().map((s) => [s.name, s.order])).toEqual(expect.arrayContaining([['commercial-licence-lapse', 80]]));
    expect(await tick()).toEqual({ contracted: false, transitions: [] });
    expect(await rulesOf()).toMatchObject({ contracted: false, state: 'uncontracted', rules: { read_and_preserve: true, gate_applies: false } });
  });
  it('REFUSAL: there is nothing to renew, suspend or tokenise (unknown licence)', async () => {
    await refused(suspend(ca, L, { version: 1, reason: 'suspending a licence never issued' }), /^licence transition rejected \(unknown_licence\)/, 404);
    await refused(issueToken(ca, L, { version: 1, expiresAt: await dbPlusDays(30), keyRef: KEY_REF, reason: 'a token for a licence never issued' }), /^offline token rejected \(unknown_licence\)/, 404);
  });
  it('RECOVERY: §EN issues v1 (the fixture) — Foresight and Decision, the term ending in five days — and the rules turn ACTIVE', async () => {
    expect(await issueFixture(L, ['foresight', 'decision'], -30, 5)).toBe(1);
    V1_CONTENT = await licenceRow(L, 1);
    const r = await rulesOf();
    expect(r).toMatchObject({ contracted: true, state: 'active', determinate: true, rules: { capabilities: ['decision', 'foresight'], new_work: true, finish_running_work: true, read_and_preserve: true } });
  });
});

describe('B91 §GR · c THE ROUTING of commercial.entitlement (an unrouted class is seen by nobody)', () => {
  it('REFUSAL: under a policy WITHOUT the class the renewal notice ABSTAINS — deprioritized, routed to nobody', async () => {
    const step = await tick();
    expect((step['transitions'] as Row[]).map((x) => [x['kind'], x['from_state'], x['to_state']])).toEqual([['renewal_notice', 'active', 'active']]);
    const it0 = await itemsOf();
    expect(it0).toHaveLength(1);
    expect(it0[0]).toMatchObject({ state: 'deprioritized', outcome: 'abstained', owner: ca.principalId, route_roles: [] });
    expect(String(obj(it0[0]!['details'])['kind'])).toBe('renewal_notice');
    // once per term end: a second tick adds nothing
    expect((await tick())['transitions']).toEqual([]);
  });
  it('POSITIVE: the executive publishes the class (to the tenant administrator); the next transition is ROUTED — open, owned by the commercial authority, the policy version recorded', async () => {
    await exec.publishAttentionPolicy(h.req(reviewer, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the commercial entitlement class routed to the tenant administrator', rules: { classes: {
      'catalog.coverage': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['data_steward'], ack_within_minutes: 240 },
      'commercial.entitlement': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['tenant_admin'], ack_within_minutes: 1440 } } } } as never });
    const until = await dbPlusDays(365);
    const t = (await renew(ca, L, { version: 1, renewedUntil: until, reason: 'renewed for twelve months — order ORD-B91-R1 (SYNTHETIC)', evidence: { order_ref: 'ORD-B91-R1' } })).transition;
    expect(t).toMatchObject({ kind: 'renewed', from_state: 'active', to_state: 'active' });
    const items = await itemsOf();
    const routed = items.find((x) => x['cause_event_id'] === t['transition_id'])!;
    expect(routed).toMatchObject({ state: 'open', outcome: 'material', owner: ca.principalId, route_roles: ['tenant_admin'], policy_version: 2 });
    expect(String(routed['title'])).toMatch(/^Licence RENEWED: foresight-decision v1 until /);
  });
  it('RECOVERY: the tenant administrator reads the routed item in the domain\'s queue (the deprioritized notice listed too, never hidden)', async () => {
    const q = await queue(tenantAdmin);
    const all = JSON.stringify(q);
    expect(all).toContain('Licence RENEWED');
    expect(all).toContain('Licence renewal due');
  });
});

describe('B91 §GR · d RENEWAL', () => {
  it('POSITIVE: the term end is the renewal\'s; the version\'s own window is untouched; the transition records before and after', async () => {
    const tr = await transitions(L, 1);
    const renewed = tr.find((x) => x['kind'] === 'renewed')!;
    expect(renewed).toMatchObject({ actor_kind: 'human', actor: ca.principalId, from_state: 'active', to_state: 'active' });
    expect(ms(renewed['term_end_after'])).toBeGreaterThan(ms(renewed['term_end_before']));
    const row = await licenceRow(L, 1);
    expect(ms(row['effective_to'])).toBe(ms(V1_CONTENT['effective_to']));
    const r = await rulesOf();
    expect(ms(obj(r['licence'])['term_end'])).toBe(ms(renewed['renewed_until']));
  });
  it('REFUSAL: the tenant administrator (the policy); an AGENT holding the commercial authority (the human gate); a term in the past; an unknown version', async () => {
    const until = await dbPlusDays(400);
    await refused(renew(tenantAdmin, L, { version: 1, renewedUntil: until, reason: 'the tenant renews itself' }), /no platform authority binding|no qualifying role/, 403);
    const g = await refusal(renew(caAgent, L, { version: 1, renewedUntil: until, reason: 'an agent renewing a licence' }));
    expect(g.status).toBe(403); expect(g.code).toBe('EYE-WFL-002');
    await refused(renew(ca, L, { version: 1, renewedUntil: '2020-01-01T00:00:00Z', reason: 'a renewal into the past' }), /^licence transition rejected \(term\)/, 422);
    await refused(renew(ca, L, { version: 9, renewedUntil: until, reason: 'a version that does not exist' }), /^licence transition rejected \(unknown_licence\)/, 404);
    expect((await transitions(L, 1)).filter((x) => x['kind'] === 'renewed')).toHaveLength(1);
  });
  it('RECOVERY: a second renewal extends the term further; the tick raises no notice (the term is beyond the notice)', async () => {
    const t = (await renew(ca, L, { version: 1, renewedUntil: await dbPlusDays(400), reason: 'extended to the fiscal year end (SYNTHETIC)', evidence: {} })).transition;
    expect(t).toMatchObject({ kind: 'renewed', to_state: 'active' });
    expect((await tick())['transitions']).toEqual([]);
  });
});

describe('B91 §GR · e SUSPENSION and reinstatement (nothing deleted; every record readable)', () => {
  it('POSITIVE: suspended with the last valid entitlement kept; the rules make nothing licensed available but read and preserve; the audit, the queue and the standing still read', async () => {
    const t = (await suspend(ca, L, { version: 1, reason: 'payment overdue sixty days (SYNTHETIC)', evidence: { ticket: 'COM-B91-7' } })).transition;
    expect(t).toMatchObject({ kind: 'suspended', from_state: 'active', to_state: 'suspended' });
    expect(obj(t['last_valid'])).toMatchObject({ licence_id: L, version: 1, capabilities: ['decision', 'foresight'], state_at_snapshot: 'active' });
    const r = await rulesOf();
    expect(r).toMatchObject({ state: 'suspended', rules: { read_and_preserve: true, capabilities: [], new_work: false, finish_running_work: false } });
    expect(JSON.stringify(obj(r['rules'])['mandatory_controls'])).toContain('warnings and their acknowledgement');
    expect(String(r['explanation'])).toMatch(/^SUSPENDED: .* every record stays readable and exportable/);
    expect((await auditQuery(auditor)).events.length).toBeGreaterThan(0);
    expect(JSON.stringify(await queue(tenantAdmin))).toContain('Licence SUSPENDED');
    expect(obj((await standing(tenantAdmin)).standing['current'])).toMatchObject({ state: 'suspended' });
  });
  it('REFUSAL: suspended twice; a renewal while suspended; a token while suspended; a reinstatement by the tenant administrator', async () => {
    await refused(suspend(ca, L, { version: 1, reason: 'suspending it once more' }), /^licence transition rejected \(state\)/, 409);
    await refused(renew(ca, L, { version: 1, renewedUntil: await dbPlusDays(500), reason: 'a renewal of a suspended licence' }), /^licence transition rejected \(state\): .* reinstates it before a renewal/, 409);
    await refused(issueToken(ca, L, { version: 1, expiresAt: await dbPlusDays(30), keyRef: KEY_REF, reason: 'a token for a suspended licence' }), /^offline token rejected \(state\)/, 409);
    await refused(reinstate(tenantAdmin, L, { version: 1, reason: 'the tenant lifts its own suspension' }), /no platform authority binding|no qualifying role/, 403);
  });
  it('RECOVERY: reinstated → active, the last valid cleared; the tick changes nothing', async () => {
    const t = (await reinstate(ca, L, { version: 1, reason: 'payment received (SYNTHETIC)', evidence: { ticket: 'COM-B91-7' } })).transition;
    expect(t).toMatchObject({ kind: 'reinstated', from_state: 'suspended', to_state: 'active' });
    expect(await licenceRow(L, 1)).toMatchObject({ state: 'active', last_valid: null, grace_until: null });
    expect((await tick())['transitions']).toEqual([]);
  });
});

describe('B91 §GR · f THE LAPSE: the term ends → GRACE with the last valid entitlement → LAPSED; the renewal recovers', () => {
  it('POSITIVE: §EN\'s v2 ended a day ago → the tick moves it to GRACE (term_ended; grace = the term end + the declared 10 days; the last valid = v2); running work may finish, no new work', async () => {
    expect(await issueFixture(L, ['foresight', 'decision'], -60, -1)).toBe(2);
    const step = await tick();
    const moves = (step['transitions'] as Row[]).map((x) => [x['kind'], x['cause'], x['to_state']]);
    expect(moves).toEqual([['grace_entered', 'term_ended', 'grace']]);
    const row = await licenceRow(L, 2);
    expect(row['state']).toBe('grace');
    expect(obj(row['last_valid'])).toMatchObject({ licence_id: L, version: 2, capabilities: ['decision', 'foresight'], limits: { model_inference: 5000, simulation_compute: 0 } });
    expect(ms(row['grace_until']) - ms(row['effective_to'])).toBe(10 * 86_400_000);
    const r = await rulesOf();
    expect(r).toMatchObject({ state: 'grace', rules: { capabilities: ['decision', 'foresight'], finish_running_work: true, new_work: false, read_and_preserve: true } });
    expect(String(r['explanation'])).toMatch(/^GRACE until .*: the last valid entitlement \(decision, foresight\) stays available .* running work may finish, no new work starts/);
    const item = (await itemsOf()).find((x) => String(x['title']).startsWith('Licence in GRACE'))!;
    expect(item).toMatchObject({ state: 'open', route_roles: ['tenant_admin'], owner: ca.principalId });
    expect((await tick())['transitions']).toEqual([]);
  });
  it('REFUSAL: a reinstatement cannot restore an ENDED term (renew instead); a token cannot outlive the grace', async () => {
    await refused(reinstate(ca, L, { version: 2, reason: 'reinstating an ended term' }), /^licence transition rejected \(state\): the term .* ended .* a renewal restores it/, 409);
    await refused(issueToken(ca, L, { version: 2, expiresAt: await dbPlusDays(60), keyRef: KEY_REF, reason: 'a token beyond the grace end' }), /^offline token rejected \(expiry\)/, 422);
  });
  it('POSITIVE: §EN\'s v3 ended thirty days ago (beyond the 10-day grace) → GRACE and LAPSED in one tick; LAPSED makes nothing licensed available — every record stays readable and exportable', async () => {
    expect(await issueFixture(L, ['foresight', 'decision'], -90, -30)).toBe(3);
    const step = await tick();
    expect((step['transitions'] as Row[]).map((x) => [x['kind'], x['cause'], x['to_state']])).toEqual([['grace_entered', 'term_ended', 'grace'], ['lapsed', 'grace_ended', 'lapsed']]);
    const r = await rulesOf();
    expect(r).toMatchObject({ state: 'lapsed', rules: { capabilities: [], new_work: false, read_and_preserve: true } });
    expect(String(r['explanation'])).toMatch(/^LAPSED: .* every record stays readable and exportable; a renewal restores it/);
    expect(obj((await licenceRow(L, 3))['last_valid'])).toMatchObject({ version: 3, capabilities: ['decision', 'foresight'] });
    expect((await auditQuery(auditor)).events.length).toBeGreaterThan(0);
  });
  it('REFUSAL: a lapsed licence is not reinstated, not suspended and gets no token', async () => {
    await refused(reinstate(ca, L, { version: 3, reason: 'reinstating a lapsed licence' }), /^licence transition rejected \(state\)/, 409);
    await refused(suspend(ca, L, { version: 3, reason: 'suspending a lapsed licence' }), /^licence transition rejected \(state\)/, 409);
    await refused(issueToken(ca, L, { version: 3, expiresAt: await dbPlusDays(5), keyRef: KEY_REF, reason: 'a token for a lapsed licence' }), /^offline token rejected \(state\)/, 409);
  });
  it('RECOVERY: the commercial authority renews v3 → ACTIVE (the grace and the last valid cleared); the version\'s content untouched', async () => {
    const t = (await renew(ca, L, { version: 3, renewedUntil: await dbPlusDays(365), reason: 'the lapsed licence renewed — order ORD-B91-R2 (SYNTHETIC)', evidence: { order_ref: 'ORD-B91-R2' } })).transition;
    expect(t).toMatchObject({ kind: 'renewed', from_state: 'lapsed', to_state: 'active' });
    expect(await licenceRow(L, 3)).toMatchObject({ state: 'active', grace_until: null, last_valid: null });
    expect(await rulesOf()).toMatchObject({ state: 'active', rules: { capabilities: ['decision', 'foresight'], new_work: true } });
  });
});

describe('B91 §GR · g INDETERMINATE (FEX-30): grace with the last valid entitlement', () => {
  it('POSITIVE (conflict): a second live licence appears beside v3 → the rules say INDETERMINATE; the tick moves both to GRACE with the last valid = v3 (the oldest readable)', async () => {
    await issueFixture(L2, ['foresight', 'decision', 'simulation'], -1, 365, { supersede: true });
    const r0 = await rulesOf();
    expect(r0).toMatchObject({ determinate: false, indeterminate: { cause: 'indeterminate_conflict' } });
    const step = await tick();
    const moves = (step['transitions'] as Row[]).map((x) => [x['licence_id'], x['cause'], x['to_state']]);
    expect(moves).toEqual([[L, 'indeterminate_conflict', 'grace'], [L2, 'indeterminate_conflict', 'grace']]);
    for (const [id, v] of [[L, 3], [L2, 1]] as const) {
      expect(obj((await licenceRow(id, v))['last_valid'])).toMatchObject({ licence_id: L, version: 3, capabilities: ['decision', 'foresight'] });
    }
    const r = await rulesOf();
    expect(r).toMatchObject({ state: 'grace', determinate: false, rules: { capabilities: ['decision', 'foresight'] } });
    expect(String(r['explanation'])).toMatch(/INDETERMINATE: 2 live licence versions conflict/);
  });
  it('REFUSAL: while indeterminate, neither a reinstatement nor a renewal lifts it', async () => {
    await refused(reinstate(ca, L, { version: 3, reason: 'lifting the grace while two licences conflict' }), /^licence transition rejected \(indeterminate\): 2 live licence versions conflict/, 409);
    await refused(renew(ca, L, { version: 3, renewedUntil: await dbPlusDays(500), reason: 'renewing while two licences conflict' }), /^licence transition rejected \(indeterminate\)/, 409);
  });
  it('RECOVERY: §EN supersedes the stray licence (the fixture) → the commercial authority reinstates v3 → ACTIVE', async () => {
    await sql`update commercial.licences set state = 'superseded', state_changed_at = clock_timestamp() where licence_id = ${L2}::uuid`.execute(su);
    expect(await rulesOf()).toMatchObject({ determinate: true, state: 'grace' });
    const t = (await reinstate(ca, L, { version: 3, reason: 'the stray licence withdrawn by the vendor; the entitlement is determinate (SYNTHETIC)' })).transition;
    expect(t).toMatchObject({ kind: 'reinstated', from_state: 'grace', to_state: 'active' });
  });
  it('POSITIVE (unreadable) → RECOVERY: §EN\'s v4 names no capability → GRACE with the last valid = v3; §EN\'s readable v5 restores ACTIVE', async () => {
    expect(await issueFixture(L, [], -1, 365)).toBe(4);
    expect(await rulesOf()).toMatchObject({ determinate: false, indeterminate: { cause: 'indeterminate_unreadable' } });
    const step = await tick();
    expect((step['transitions'] as Row[]).map((x) => [x['version'], x['cause'], x['to_state']])).toEqual([[4, 'indeterminate_unreadable', 'grace']]);
    expect(obj((await licenceRow(L, 4))['last_valid'])).toMatchObject({ version: 3, capabilities: ['decision', 'foresight'] });
    expect(obj((await rulesOf())['rules'])['capabilities']).toEqual(['decision', 'foresight']);
    expect(await issueFixture(L, ['foresight', 'decision'], -1, 365, { limits: { model_inference: 5000, simulation_compute: 0, source_consumption: 200 } })).toBe(5);
    expect(await rulesOf()).toMatchObject({ state: 'active', determinate: true, licence: { version: 5 } });
    expect((await tick())['transitions']).toEqual([]);
  });
});

describe('B91 §GR · h THE OFFLINE LICENCE TOKEN (the disconnected profile itself is P7-D / B106)', () => {
  let TOKEN: Row = {}; let TOKEN_ID = '';
  it('POSITIVE: issued for v5 — the canonical payload over the version\'s basis, signed with the key the reference names; verified OFFLINE (pinned) by scripts/commercial/verify-licence.mjs', async () => {
    const out = await issueToken(ca, L, { version: 5, profile: 'disconnected', expiresAt: await dbPlusDays(30), keyRef: KEY_REF, reason: 'the plant\'s disconnected field kit (SYNTHETIC)' });
    TOKEN = out.token; TOKEN_ID = String(out.record['token_id']);
    expect(out.record).toMatchObject({ licence_id: L, version: 5, profile: 'disconnected', state: 'active' });
    const payload = JSON.parse(String(TOKEN['payload'])) as TokenPayload;
    expect(payload.licence).toMatchObject({ licence_id: L, version: 5, tenant_id: T(), capabilities: ['decision', 'foresight'], state: 'active' });
    expect(JSON.stringify(out)).not.toContain(process.env[KEY_REF] as string);
    expect(verifyToken(TOKEN, { at: await dbNow(), tenantId: T(), publicKeyPem: vendorPublicPem })).toMatchObject({ ok: true, pinned: true });
    writeFileSync(join(dir, 'token.json'), JSON.stringify(out));
    writeFileSync(join(dir, 'vendor.pem'), vendorPublicPem);
    const stdout = execFileSync(process.execPath, [VERIFIER, join(dir, 'token.json'), '--public-key', join(dir, 'vendor.pem'), '--tenant', T()], { encoding: 'utf8' });
    expect(stdout).toMatch(/TOKEN OK\n$/);
  });
  it('REFUSAL: an unbound key reference; an expiry past the term; a FORGED payload at the port (the capabilities widened); the tenant administrator', async () => {
    await refused(issueToken(ca, L, { version: 5, expiresAt: await dbPlusDays(30), keyRef: 'EYE_LICENCE_SIGNING_KEY_NOT_BOUND_HERE', reason: 'a key this deployment does not bind' }), /^offline token rejected \(key\): .* \(unbound\)/, 422);
    await refused(issueToken(ca, L, { version: 5, expiresAt: await dbPlusDays(380), keyRef: KEY_REF, reason: 'a token outliving the licence' }), /^offline token rejected \(expiry\)/, 422);
    await refused(issueToken(tenantAdmin, L, { version: 5, expiresAt: await dbPlusDays(30), keyRef: KEY_REF, reason: 'the tenant tokenises itself' }), /no platform authority binding|no qualifying role/, 403);
    // the forged payload: a correct digest over a WIDENED basis — the port binds the payload to the version as it stands
    const tokenId = uuidv7();
    const forged = await refusal(h.pipeline.write(envelopeOf(ca, 'commercial.offline_token.issue', 'PLATFORM', 'LTK', tokenId), ca,
      { scope: 'PLATFORM', tenantId: null, domainId: null, action: 'commercial.offline_token.issue', objectType: 'LTK', objectId: tokenId }, GraceCapability.token, async (cap) => {
        const basis = (await cap.tokenBasis(L, 5))!;
        const payload = { format: 'eye-licence-token/1', token_id: tokenId, tenant_id: T(), profile: 'disconnected', issued_at: await cap.dbInstant(), expires_at: (await cap.instantText(await dbPlusDays(10)))!,
          issuer: { principal_id: ca.principalId, key_id: String(TOKEN['key_id']) }, licence: { ...basis, capabilities: ['decision', 'foresight', 'simulation'] } } as unknown as TokenPayload;
        const text = canonicalPayload(payload);
        return { result: await cap.issueToken({ tokenId, licenceId: L, version: 5, profile: 'disconnected', payloadText: text, payloadDigest: sha256Hex(text), signature: String(TOKEN['signature']),
          keyRef: KEY_REF, keyId: String(TOKEN['key_id']), publicKeyPem: vendorPublicPem, expiresAt: payload.expires_at, reason: 'a token widened to Simulation', actor: ca.principalId, correlationId: uuidv7() }),
          targetType: 'LTK', targetId: tokenId, targetVersion: '1', outboxEvent: null };
      }));
    expect(forged.message).toMatch(/^offline token rejected \(payload\)/); expect(forged.status).toBe(422);
    expect((await rows(sql`select count(*)::int as n from commercial.offline_tokens where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(1);
  });
  it('RECOVERY: the token re-served EXACTLY as issued; an air-gapped token issues; the ledger is append-only', async () => {
    const again = await readToken(ca, TOKEN_ID);
    expect(again.token).toEqual(TOKEN);
    const ag = await issueToken(ca, L, { version: 5, profile: 'air-gapped', expiresAt: await dbPlusDays(7), keyRef: KEY_REF, reason: 'the air-gapped review copy (SYNTHETIC)' });
    expect(verifyToken(ag.token, { at: await dbNow(), tenantId: T(), publicKeyPem: vendorPublicPem }).ok).toBe(true);
    await expect(sql`delete from commercial.offline_tokens where token_id = ${TOKEN_ID}::uuid`.execute(su)).rejects.toThrow();
  });
});

describe('B91 §GR · i THE SURFACE (UX-67-001) and the banner', () => {
  it('POSITIVE: the tenant administrator\'s standing — current, included, limits and usage (§ME\'s records this month, SYNTHETIC), renewal and continuity, grace — in that order; the banner explains Simulation is not licensed', async () => {
    // §ME's usage records, as a stated fixture (SYNTHETIC)
    for (const [dim, unit, q] of [['model_inference', 'calls', 1200], ['model_inference', 'calls', 300], ['source_consumption', 'requests', 40]] as const) {
      await sql`insert into commercial.usage_records (usage_id, scope, tenant_id, domain_id, capability_key, dimension, unit, quantity, source_kind, source_ref, occurred_at)
                values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'foresight', ${dim}, ${unit}, ${q}, 'fixture', ${uuidv7()}, clock_timestamp())`.execute(su);
    }
    const s = (await standing(tenantAdmin)).standing;
    expect(Object.keys(s)).toEqual(['tenant_id', 'current', 'included', 'limits_and_usage', 'renewal_and_continuity', 'grace', 'as_of']);
    expect(obj(s['current'])).toMatchObject({ state: 'active', contracted: true, determinate: true });
    expect(obj(s['included'])).toMatchObject({ capabilities: ['decision', 'foresight'], available_now: ['decision', 'foresight'] });
    const lu = obj(s['limits_and_usage']);
    const mi = (lu['usage'] as Row[]).find((u) => u['dimension'] === 'model_inference')!;
    expect(mi).toMatchObject({ unit: 'calls', quantity: '1500', records: 2, limit: 5000 });
    expect(mi['share']).toBeCloseTo(0.3, 6);
    expect(obj(lu['caps'])).toMatchObject({ available: false });
    expect(obj(lu['budgets'])).toMatchObject({ available: false });
    const rc = obj(s['renewal_and_continuity']);
    expect((rc['versions'] as Row[]).map((v) => [v['version'], v['state']]).filter(([, st]) => st !== undefined).length).toBeGreaterThanOrEqual(6);
    expect((rc['transitions'] as Row[]).length).toBeGreaterThanOrEqual(10);
    expect((rc['tokens'] as Row[]).length).toBe(2);
    expect(JSON.stringify(rc['tokens'])).not.toContain('payload_text');
    expect(obj(obj(s['grace'])['policy'])).toMatchObject({ version: 3, grace_days: 10 });
    const e = (await explain(operator)).explanation;
    expect(e).toMatchObject({ capability: 'simulation', contracted: true, licensed: false, available: false, licence: { version: 5, package_key: 'foresight-decision' } });
    expect(String(e['reason'])).toBe('capability unavailable (entitlement): simulation is not licensed for this tenant (active; licence v5)');
    expect(e['always_available']).toEqual(expect.arrayContaining(['warnings and their acknowledgement', 'the audit read and verification']));
    expect((await explain(operator, 'foresight')).explanation).toMatchObject({ licensed: true, available: true, reason: null });
  });
  it('REFUSAL: an outsider in the domain (the policy); a domain role on the tenant\'s route (no tenant binding); the platform administrator', async () => {
    await refused(explain(outsider), /no qualifying role/, 403);
    await refused(standing(operator), /no binding for this tenant/, 403);
    const pa = await platformPrincipal(['platform_admin'], 'b91g-padmin');
    await refused(platformStanding(pa), /no qualifying role/, 403);
  });
  it('RECOVERY: the auditor reads the standing; the commercial authority reads it and the licences list from the PLATFORM', async () => {
    expect(obj((await standing(auditor)).standing['current'])).toMatchObject({ state: 'active' });
    expect(obj((await platformStanding(ca)).standing['current'])).toMatchObject({ state: 'active' });
    const list = (await listLicences(ca)).licences;
    expect(list.map((x) => [x['licence_id'], x['version'], x['state']])).toEqual([[L, 5, 'active']]);
  });
});

describe('B91 §GR · j PRESERVED WORK (nothing deleted; content never edited; ledgers append-only)', () => {
  it('POSITIVE: no tenant table lost a row across every transition (grace, lapse, suspension, indeterminacy, renewal)', async () => {
    const now = await tenantCounts();
    const shrunk = Object.entries(BASELINE).filter(([k, n]) => (now[k] ?? 0) < n);
    expect(shrunk).toEqual([]);
    expect(Object.keys(BASELINE).length).toBeGreaterThan(20);
  });
  it('REFUSAL: the transitions ledger and the usage records refuse an edit and a deletion (stated superuser attempts)', async () => {
    await expect(sql`delete from commercial.licence_transitions where tenant_id = ${T()}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`update commercial.licence_transitions set reason = 'rewritten history' where tenant_id = ${T()}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`delete from commercial.usage_records where tenant_id = ${T()}::uuid`.execute(su)).rejects.toThrow();
  });
  it('RECOVERY: v1\'s content is exactly as §EN issued it — only its state columns ever moved; every version still reads', async () => {
    const v1 = await licenceRow(L, 1);
    for (const k of ['capabilities', 'limits', 'package_key', 'effective_from', 'effective_to', 'provenance', 'digest']) expect(JSON.stringify(v1[k]), k).toBe(JSON.stringify(V1_CONTENT[k]));
    expect((await rows(sql`select version from commercial.licences where licence_id = ${L}::uuid order by version`)).map((x) => x['version'])).toEqual([1, 2, 3, 4, 5]);
    const kinds = (await rows(sql`select kind from commercial.licence_transitions where tenant_id = ${T()}::uuid`)).map((x) => String(x['kind']));
    for (const k of ['renewal_notice', 'renewed', 'suspended', 'reinstated', 'grace_entered', 'lapsed']) expect(kinds, k).toContain(k);
  });
});
