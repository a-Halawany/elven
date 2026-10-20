/**
 * CP-6 B81 §DG (migration 0119_b81_x_dg) — THE DEGRADED-STATE, FAILURE AND RECOVERY EXPERIENCE (F-P7-E-19: HX-16, REL-12, UX-ADR-018, PAT-20,
 * PAT-30, PAT-32, CNT-12, REL-11) on a real database through the real pipeline, the PDP, the ports and the controllers. CONSTRUCTION
 * evidence: every persona, contract and signal here is SYNTHETIC; a contract declared here demonstrates the software only.
 *
 *   DG1 · DECLARE: the domain administrator declares a source's contract (version 1; the owner a named analyst); the request id replayed
 *         answers the recorded version (PAT-20 — no second version); version 2 supersedes the version read; a stale declaration refused;
 *         the operations authority (PLATFORM) declares a domain dependency in the domain's context.
 *   DG2 · WHO AND WHAT: an agent refused by the PEP's human gate; an analyst refused by the PDP; an unknown dependency (404); a platform
 *         kind in a domain context (422 scope); an agent as owner, the same function both available and unavailable, no limitation (422);
 *         a request id reused by another person (409 duplicate); the platform's dependency declared by the domain administrator refused.
 *   DG3 · THE SOURCE BY THE CLOCK (PAT-32): fresh now (normal); evaluated past its freshness threshold (7 days) STALE — the watermark (activation, then
 *         the arrival), the age, the threshold, the refresh path, the contract ACTIVE with its unavailable functions in force and OVERDUE
 *         past its maximum duration; nothing planted (the evaluator's clock moved, never a record's).
 *   DG4 · PERSISTENT UNTIL VERIFIED RECOVERY (UX-ADR-018, HX-16, REL-11): the edges partition withdrawn by the operator (B20's real port) →
 *         ACTIVE; the exit refused while degraded (state), by a non-owner (authority), at a stale version (stale); rebuilt (B20's port) →
 *         AWAITING_EXIT (still in force); the owner's exit → NORMAL; a second exit refused (nothing to exit); the exit's request id replayed.
 *   DG5 · THE OTHER KINDS (REL-12): a quarantined method and a faulted agent (SYNTHETIC rows, stated) listed UNDECLARED until declared,
 *         then ACTIVE; the audit journal (PLATFORM) — the journal can only ADD degradation (an open incident inside a rolled-back
 *         transaction reads degraded even with a healthy journal); a model contract reads UNKNOWN and its exit is refused.
 *   DG6 · THE READ'S GUARD, RLS, GRANTS, THE LEDGER: another tenant's domain refused; an unbound runtime role reads nothing; no write grant;
 *         append-only; the ports are eye_commit's; every declaration and exit in shell.events.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DegradedDomainController, DegradedPlatformController } from '../../src/shell/degraded/degraded.controller.js';
import { asDegradedRefusal } from '../../src/shell/degraded/degraded.service.js';
import type { ProjectionsController } from '../../src/graph/projections/projections.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b81-dg-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'DOMAIN';
let h: Phase4Harness; let dc: DegradedDomainController; let pc: DegradedPlatformController; let projections: ProjectionsController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let admin: AuthenticatedPrincipal;     // domain_admin — declares the domain's contracts
let owner: AuthenticatedPrincipal;     // domain_analyst — the named owner (the "catalog owner" of the source)
let analyst: AuthenticatedPrincipal;   // another domain_analyst — neither declarer nor owner
let ops: AuthenticatedPrincipal;       // operations_authority (PLATFORM) — the platform's contracts
let agent: AuthenticatedPrincipal;     // an AGENT holding domain_admin (the PEP's human gate refuses it)
let SOURCE_KEY = ''; let SOURCE_ID = '';

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'observation', action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: 'SDG', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b81-dg',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, t: string | null = T, d: string | null = D) =>
  ({ eyeEnvelope: env(p, action, t === null ? 'PLATFORM' : 'DOMAIN', t, d), eyePrincipal: p }) as never;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const m1 = asDegradedRefusal(e, 'harness');
  const m = m1 instanceof HttpException ? m1 : asObservationRefusal(e, 'harness');
  if (m instanceof HttpException) return { status: m.getStatus(), message: String((m.getResponse() as Row)['message'] ?? m.message) };
  return { status: null, message: e instanceof Error ? e.message : String(e) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

type Out = { contract: Row; receipt: Row };
const declare = (as: AuthenticatedPrincipal, payload: Row, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.declare(rq(as, 'shell.degraded.contract.declare', null, null), { payload }) : dc.declare(rq(as, 'shell.degraded.contract.declare', t, d), t, d as string, { payload })) as unknown as Promise<Out>;
const state = (as: AuthenticatedPrincipal, payload: Row = {}, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.state(rq(as, 'shell.degraded.read', null, null), { payload }) : dc.state(rq(as, 'shell.degraded.read', t, d), t, d as string, { payload })) as unknown as Promise<{ degraded: Row; receipt: Row }>;
const exit = (as: AuthenticatedPrincipal, contractId: string, payload: Row, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.exit(rq(as, 'shell.degraded.exit', null, null), contractId, { payload }) : dc.exit(rq(as, 'shell.degraded.exit', t, d), t, d as string, contractId, { payload })) as unknown as Promise<{ exit: Row; receipt: Row }>;
const history = (as: AuthenticatedPrincipal, contractId: string) => dc.history(rq(as, 'shell.degraded.read'), T, D, contractId) as unknown as Promise<{ contract: Row }>;
/** The evaluator at an instant (internal; the superuser's) — the clock moved, no record touched. */
const stateAt = async (at: string, journal: Row | null = null, t: string | null = T, d: string | null = D, kind: string | null = null, key: string | null = null) =>
  (await one(sql`select shell.dg_state_at(${t}::uuid, ${d}::uuid, ${at}::timestamptz, ${journal === null ? null : JSON.stringify(journal)}::jsonb, ${kind}, ${key}) as r`))['r'] as Row;
const contractsOf = (s: Row) => s['contracts'] as Row[];
const find = (s: Row, kind: string, key: string) => contractsOf(s).find((c) => (c['dependency'] as Row)['kind'] === kind && (c['dependency'] as Row)['key'] === key);
const undeclared = (s: Row, kind: string, key: string) => (s['undeclared'] as Row[]).find((c) => (c['dependency'] as Row)['kind'] === kind && (c['dependency'] as Row)['key'] === key);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const SOURCE_CONTRACT = (over: Row = {}) => ({
  requestId: uuidv7(), kind: 'source', key: SOURCE_KEY, expectedVersion: 0,
  available: [{ action: 'observation.read', label: 'Read the last verified observations, labelled with their age' }, { action: 'prediction.read', label: 'Read the corridor warnings and forecasts already made' }],
  unavailable: [{ action: 'prediction.forecast.run', label: 'Run a new corridor forecast from this source' }, { action: 'decision.package.commit', label: 'Commit a decision that cites a fresh position' }],
  limitations: ['Positions are as old as the watermark says; nothing after it is known', 'Transit counts after the watermark are not observed'],
  maxDurationSeconds: 86_400, ownerPrincipalId: owner.principalId,
  exitEvidence: 'A fresh upload admitted within the cadence and the source health evaluated healthy',
  reason: 'the corridor views depend on this feed (SYNTHETIC harness)', ...over,
});

async function person(label: string, kind: 'human' | 'agent', scope: Scope, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : T; const d = scope === 'PLATFORM' ? null : D;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b81-dg-${label}-${RUN} (SYNTHETIC)`}, ${`b81dg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : T, domainId: r.scope === 'DOMAIN' ? D : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  dc = h.app.get(DegradedDomainController); pc = h.app.get(DegradedPlatformController);
  const { ProjectionsController: Pc } = await import('../../src/graph/projections/projections.controller.js');
  projections = h.app.get(Pc);
  admin = await h.humanWithSession(['domain_admin'], 'b81dg-admin');
  owner = await h.humanWithSession(['domain_analyst'], 'b81dg-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b81dg-analyst');
  ops = await person('ops', 'human', 'PLATFORM', [{ role: 'operations_authority', scope: 'PLATFORM' }]);
  agent = await person('agent', 'agent', 'DOMAIN', [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  // THE SOURCE (SYNTHETIC): an upload source registered, approved and activated through the real routes, cadence one day; no arrival yet
  SOURCE_ID = await h.uploadSource('internal', `dg${RUN}`);
  SOURCE_KEY = String((await one(sql`select source_key from observation.source_contracts_current where source_id = ${SOURCE_ID}::uuid limit 1`))['source_key']);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b81-dg-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b81-dg-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

let SRC_CONTRACT = '';
describe('DG1 · declare', () => {
  it('the domain administrator declares the source\'s contract: version 1, the owner named; the state reads it with its live signal', async () => {
    const payload = SOURCE_CONTRACT();
    const r = await declare(admin, payload);
    expect(r.contract).toMatchObject({ version: 1, supersedes: null, replayed: false, owner_principal_id: owner.principalId, dependency: { kind: 'source', key: SOURCE_KEY } });
    expect(r.receipt['policyDecisionId']).toEqual(expect.any(String));
    SRC_CONTRACT = String(r.contract['contract_id']);
    // PAT-20: the same request id replayed (a retry after an unknown outcome) answers the recorded version — no second version
    const again = await declare(admin, payload);
    expect(again.contract).toMatchObject({ contract_id: SRC_CONTRACT, version: 1, replayed: true });
    expect((await one(sql`select count(*)::int n from shell.degraded_contracts where contract_id = ${SRC_CONTRACT}::uuid`))['n']).toBe(1);
    const s = (await state(analyst, { kind: 'source', key: SOURCE_KEY })).degraded;
    const c = find(s, 'source', SOURCE_KEY)!;
    expect(c).toMatchObject({ version: 1, mode: 'normal', in_force: false, owner: { principal_id: owner.principalId }, max_duration_seconds: 86_400 });
    expect(c['signal']).toMatchObject({ state: 'healthy' });
    expect(((c['signal'] as Row)['details'] as Row)).toMatchObject({ source_revision: 1, connector_kind: 'upload', threshold_seconds: 604_800, freshness_threshold_seconds: 604_800, reference_basis: 'activation (no arrival since)', watermark: null });
    expect(s['unavailable_functions']).toEqual([]);
  });
  it('version 2 supersedes the version read; a declaration that read version 1 again is refused (stale)', async () => {
    const r = await declare(admin, SOURCE_CONTRACT({ expectedVersion: 1, maxDurationSeconds: 43_200, reason: 'a twelve-hour ceiling agreed with the owner (SYNTHETIC)' }));
    expect(r.contract).toMatchObject({ contract_id: SRC_CONTRACT, version: 2, supersedes: 1 });
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 1 })), /^degraded contract rejected \(stale\): the contract of source .+ is at version 2; this declaration read 1/, 409);
    const hist = (await history(owner, SRC_CONTRACT)).contract;
    expect((hist['versions'] as Row[]).map((v) => [v['version'], v['max_duration_seconds']])).toEqual([[1, 86_400], [2, 43_200]]);
  });
  it('the operations authority (PLATFORM) declares a domain dependency in the domain\'s context', async () => {
    const r = await declare(ops, { ...SOURCE_CONTRACT(), kind: 'partition', key: 'resolutions_current', unavailable: [{ action: 'graph.resolution.*', label: 'Resolve or merge entities' }], available: [],
      exitEvidence: 'The resolutions partition serving after a rebuild whose check passed' });
    expect(r.contract).toMatchObject({ version: 1, dependency: { kind: 'partition', key: 'resolutions_current' } });
  });
});

describe('DG2 · who declares, and what a contract must say', () => {
  it('an agent is refused by the human gate; an analyst by the PDP; the platform\'s journal by the domain administrator', async () => {
    const a = await refusal(declare(agent, SOURCE_CONTRACT({ expectedVersion: 2 })));
    expect(a.status).toBe(403);
    const b = await refusal(declare(analyst, SOURCE_CONTRACT({ expectedVersion: 2 })));
    expect(b.status).toBe(403);
    await refused(declare(admin, { ...SOURCE_CONTRACT(), kind: 'audit', key: 'journal' }), /^degraded contract rejected \(scope\): a audit dependency is the platform's/, 422);
  });
  it('the dependency must exist; the owner is a person of the scope; a function is available or unavailable, never both; a limitation is said', async () => {
    await refused(declare(admin, SOURCE_CONTRACT({ key: `no-such-source-${RUN}` })), /^degraded contract rejected \(unknown_dependency\): no source dependency/, 404);
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 2, ownerPrincipalId: agent.principalId })), /^degraded contract rejected \(owner\)/, 422);
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 2, available: [{ action: 'prediction.forecast.run', label: 'Run a forecast' }] })), /never both/, 422);
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 2, limitations: [] })), /^degraded contract rejected \(limitations\)/, 422);
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 2, unavailable: [{ action: 'Not An Action', label: 'x' }] })), /^degraded contract rejected \(functions\)/, 422);
    await refused(declare(admin, SOURCE_CONTRACT({ expectedVersion: 2, maxDurationSeconds: 10 })), /^degraded contract rejected \(max_duration\)/, 422);
  });
  it('a request id reused by another person, or for another dependency, is refused (duplicate)', async () => {
    const id = String((await one(sql`select request_id::text r from shell.degraded_contracts where contract_id = ${SRC_CONTRACT}::uuid and version = 2`))['r']);
    await refused(declare(ops, SOURCE_CONTRACT({ requestId: id, expectedVersion: 2 })), /^degraded contract rejected \(duplicate\)/, 409);
  });
});

describe('DG3 · the source by the clock (PAT-32)', () => {
  it('past its freshness threshold (seven days) the source is STALE by the clock: the watermark, the age, the threshold, the refresh path; the contract ACTIVE, in force, OVERDUE', async () => {
    const s = await stateAt(inDays(8.5));
    const c = find(s, 'source', SOURCE_KEY)!;
    expect(c).toMatchObject({ mode: 'active', in_force: true, overdue: true });
    const sig = c['signal'] as Row; const det = sig['details'] as Row;
    expect(sig['state']).toBe('degraded');
    expect(String(sig['reason'])).toMatch(/STALE by the clock: the last activation \(no arrival since\) was .+ beyond its 604800 s freshness threshold/);
    expect(det).toMatchObject({ stale: true, threshold_seconds: 604_800, reference_basis: 'activation (no arrival since)', source_revision: 1 });
    expect(Number(det['age_seconds'])).toBeGreaterThan(8 * 86_400);
    expect(String(det['refresh_path'])).toMatch(/a new upload under source contract v1/);
    expect(Number(c['elapsed_seconds'])).toBeGreaterThan(43_200);
    // the unavailable functions in force: what the web disables (PAT-30)
    expect((s['unavailable_functions'] as Row[]).map((f) => f['action']).sort()).toEqual(['decision.package.commit', 'prediction.forecast.run']);
    expect(s['degraded']).toBe(true);
    // nothing was written by evaluating: the live read is still fresh
    const live = find((await state(owner, { kind: 'source', key: SOURCE_KEY })).degraded, 'source', SOURCE_KEY)!;
    expect(live['mode']).toBe('normal');
  });
  it('an arrival moves the watermark: the record uploaded now is fresh, and stale again past the threshold', async () => {
    await h.upload([{ filename: `dg-${RUN}.csv`, text: 'mmsi,at,lat,lon\n0,2026-10-18T00:00:00Z,12.6,43.3\n' }], 'internal', `dg${RUN}`);
    const now = find(await stateAt(new Date().toISOString()), 'source', SOURCE_KEY)!;
    expect(((now['signal'] as Row)['details'] as Row)).toMatchObject({ reference_basis: 'last arrival', stale: false });
    expect(((now['signal'] as Row)['details'] as Row)['watermark']).not.toBeNull();
    const later = find(await stateAt(inDays(7.5)), 'source', SOURCE_KEY)!;
    expect(later['mode']).toBe('active');
    expect(String((later['signal'] as Row)['reason'])).toMatch(/the last arrival was/);
  });
});

let PART_CONTRACT = '';
describe('DG4 · persistent until verified recovery (UX-ADR-018, HX-16, REL-11)', () => {
  const withdraw = (reason: string) => projections.withdraw(h.req(admin, 'graph.projection.withdraw', 'PRJ', null, 'graph'), T, D, 'edges_current', { payload: { reason } });
  const rebuild = (reason: string) => projections.rebuild(h.req(admin, 'graph.projection.rebuild', 'PRJ', null, 'graph'), T, D, 'edges_current', { payload: { reason } });
  it('the edges partition withdrawn by the operator (B20\'s port) → the contract ACTIVE; the exit refused while degraded, by a non-owner, at a stale version', async () => {
    const r = await declare(admin, { ...SOURCE_CONTRACT(), kind: 'partition', key: 'edges_current', available: [{ action: 'graph.read', label: 'Read the graph from the event log, labelled' }],
      unavailable: [{ action: 'retention.execute', label: 'Execute a deletion (the safe scope reads the edges)' }], exitEvidence: 'The edges partition serving after a rebuild whose check passed' });
    PART_CONTRACT = String(r.contract['contract_id']);
    await withdraw('a suspected drift under review (SYNTHETIC harness)');
    const s = (await state(owner, { kind: 'partition' })).degraded;
    const c = find(s, 'partition', 'edges_current')!;
    expect(c).toMatchObject({ mode: 'active', in_force: true });
    expect(String((c['signal'] as Row)['reason'])).toMatch(/the edges_current partition is WITHDRAWN/);
    expect((s['unavailable_functions'] as Row[]).map((f) => f['action'])).toContain('retention.execute');
    await refused(exit(owner, PART_CONTRACT, { requestId: uuidv7(), contractVersion: 1, evidence: 'the partition looks fine to me' }), /^degraded contract rejected \(state\): partition edges_current still reads DEGRADED/, 409);
  });
  it('rebuilt (B20\'s port) → AWAITING_EXIT, still in force; the non-owner and a stale version refused; the owner\'s exit → NORMAL', async () => {
    await rebuild('the rebuild after the drift review (SYNTHETIC harness)');
    const s = (await state(analyst, { kind: 'partition', key: 'edges_current' })).degraded;
    const c = find(s, 'partition', 'edges_current')!;
    expect(c).toMatchObject({ mode: 'awaiting_exit', in_force: true });
    expect((c['signal'] as Row)['state']).toBe('healthy');
    expect((s['unavailable_functions'] as Row[]).map((f) => f['action'])).toEqual(['retention.execute']);
    await refused(exit(analyst, PART_CONTRACT, { requestId: uuidv7(), contractVersion: 1, evidence: 'the rebuild report passed' }), /^degraded contract rejected \(authority\): the exit evidence is recorded by the contract's owner/, 403);
    await refused(exit(owner, PART_CONTRACT, { requestId: uuidv7(), contractVersion: 2, evidence: 'the rebuild report passed' }), /^degraded contract rejected \(stale\)/, 409);
    await refused(exit(owner, PART_CONTRACT, { requestId: uuidv7(), contractVersion: 1, evidence: 'ok' }), /^degraded contract rejected \(evidence\)/, 422);
    const req = uuidv7();
    const x = await exit(owner, PART_CONTRACT, { requestId: req, contractVersion: 1, evidence: 'The rebuild restored the partition and its check passed (SYNTHETIC)', evidenceRefs: ['projection.restored'] });
    expect(x.exit).toMatchObject({ contract_id: PART_CONTRACT, contract_version: 1, replayed: false });
    expect(((x.exit['state'] as Row)['mode'])).toBe('normal');
    // the retry reuses the request id → the recorded exit, no second one (PAT-20)
    const again = await exit(owner, PART_CONTRACT, { requestId: req, contractVersion: 1, evidence: 'The rebuild restored the partition and its check passed (SYNTHETIC)' });
    expect(again.exit).toMatchObject({ exit_id: x.exit['exit_id'], replayed: true });
    await refused(exit(owner, PART_CONTRACT, { requestId: uuidv7(), contractVersion: 1, evidence: 'a second verification of the same recovery' }), /^degraded contract rejected \(state\): .+ there is nothing to exit/, 409);
    const after = find((await state(owner, { kind: 'partition', key: 'edges_current' })).degraded, 'partition', 'edges_current')!;
    expect(after).toMatchObject({ mode: 'normal', in_force: false, last_exit: { recorded_by: { principal_id: owner.principalId } } });
    const hist = (await history(owner, PART_CONTRACT)).contract;
    expect((hist['exits'] as Row[])).toHaveLength(1);
    expect((hist['exits'] as Row[])[0]).toMatchObject({ signal_state: 'healthy' });
  });
});

describe('DG5 · the other kinds (REL-12)', () => {
  it('a quarantined method (SYNTHETIC row, stated) is UNDECLARED until its contract is declared, then ACTIVE', async () => {
    await sql`insert into simulation.adapter_health (scope, tenant_id, domain_id, model_ref, state, consecutive_faults, total_faults, last_fault, last_fault_at, quarantined_at)
      values ('DOMAIN', ${T}::uuid, ${D}::uuid, 'discrete-event@1', 'quarantined', 3, 3, '{"kind":"timeout","message":"SYNTHETIC harness fault"}'::jsonb, clock_timestamp(), clock_timestamp())`.execute(h.su);
    const before = (await state(owner)).degraded;
    expect(undeclared(before, 'method', 'discrete-event@1')).toMatchObject({ scope: 'DOMAIN', signal: { state: 'degraded' } });
    expect(String(((undeclared(before, 'method', 'discrete-event@1')!['signal']) as Row)['reason'])).toMatch(/QUARANTINED in this domain after 3 consecutive fault/);
    await declare(admin, { ...SOURCE_CONTRACT(), kind: 'method', key: 'discrete-event@1', available: [{ action: 'simulation.run.read', label: 'Read the runs already made' }],
      unavailable: [{ action: 'simulation.run.open', label: 'Open a new discrete-event run' }], exitEvidence: 'A passing probe and the method steward\'s reinstatement' });
    const after = (await state(owner)).degraded;
    expect(undeclared(after, 'method', 'discrete-event@1')).toBeUndefined();
    expect(find(after, 'method', 'discrete-event@1')).toMatchObject({ mode: 'active', in_force: true });
  });
  it('a faulted agent (SYNTHETIC rows, stated): its latest run FAULTED reads degraded, with its sessions', async () => {
    const ap = uuidv7(); const ag = uuidv7();
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status) values (${ap}::uuid, 'agent', 'DOMAIN', ${T}::uuid, ${D}::uuid, ${'b81-dg-decision-agent (SYNTHETIC)'}, null, 'active')`.execute(h.su);
    await sql`insert into executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, created_by, correlation_id)
      values (${ag}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${ap}::uuid, 'decision', '1.0.0', ${'a'.repeat(64)}, ${admin.principalId}::uuid, ${admin.principalId}::uuid, '{}'::jsonb, ${admin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, budget, outcome, stop_reason, finished_at, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${ag}::uuid, ${ap}::uuid, 'decision', '1.0.0', ${'a'.repeat(64)}, 'draft', 'scheduler', '{}'::jsonb, 'faulted', 'SYNTHETIC harness fault', clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
    const s = (await state(owner, { kind: 'agent', key: ag })).degraded;
    const u = undeclared(s, 'agent', ag)!;
    expect((u['signal'] as Row)).toMatchObject({ state: 'degraded', details: { registry: 'executive.agents', live_sessions: 0, last_run: { outcome: 'faulted' } } });
    expect(String((u['signal'] as Row)['reason'])).toMatch(/latest run FAULTED/);
  });
  it('the audit journal (PLATFORM): declared by the operations authority; the journal only ADDS degradation; an open incident reads degraded with a healthy journal', async () => {
    const cur = (await state(ops, { kind: 'audit' }, null, null)).degraded;
    const existing = find(cur, 'audit', 'journal');
    const r = await declare(ops, { ...SOURCE_CONTRACT(), kind: 'audit', key: 'journal', expectedVersion: existing === undefined ? 0 : Number(existing['version']),
      available: [{ action: 'observation.read', label: 'Read what is recorded' }], unavailable: [{ action: 'decision.package.commit', label: 'Commit a decision (its evidence cannot be recorded)' }],
      ownerPrincipalId: ops.principalId, exitEvidence: 'Every availability incident reconciled and /readyz ok' }, null, null);
    expect(r.contract).toMatchObject({ dependency: { kind: 'audit', key: 'journal' } });
    // a domain principal reads the platform's contract too
    expect(find((await state(owner, { kind: 'audit' })).degraded, 'audit', 'journal')).toMatchObject({ scope: 'PLATFORM' });
    // the process journal reporting degraded → active
    const j = find(await stateAt(new Date().toISOString(), { degraded: true, incidents: 2, since: new Date(Date.now() - 60_000).toISOString() }, null, null), 'audit', 'journal')!;
    expect(j).toMatchObject({ mode: 'active', signal: { state: 'degraded' } });
    // an open incident in the ledger with a HEALTHY journal → still degraded (inside a transaction rolled back: the platform's ledger untouched)
    const inside = await h.su.transaction().execute(async (tx) => {
      await sql`insert into audit.availability_incidents (id, kind, details) values (${uuidv7()}::uuid, 'audit_unavailable', '{"synthetic":true}'::jsonb)`.execute(tx);
      const v = (await sql<{ r: Row }>`select shell.dg_signal('audit', 'journal', null, null, clock_timestamp(), ${JSON.stringify({ degraded: false, incidents: 0, since: null })}::jsonb) as r`.execute(tx)).rows[0]!.r;
      throw Object.assign(new Error('rollback'), { v });
    }).catch((e: { v?: Row }) => e.v);
    expect(inside).toMatchObject({ state: 'degraded' });
  });
  it('a model contract reads UNKNOWN (no read evaluates it — said) and its exit is refused', async () => {
    const cur = find((await state(ops, { kind: 'model' }, null, null)).degraded, 'model', 'forecast-ensemble');
    const r = await declare(ops, { ...SOURCE_CONTRACT(), kind: 'model', key: 'forecast-ensemble', expectedVersion: cur === undefined ? 0 : Number(cur['version']),
      available: [], unavailable: [{ action: 'prediction.ensemble.run', label: 'Run the forecast ensemble' }], ownerPrincipalId: ops.principalId, exitEvidence: 'The model registry reports the ensemble available' }, null, null);
    const c = find((await state(ops, { kind: 'model' }, null, null)).degraded, 'model', 'forecast-ensemble')!;
    expect(c).toMatchObject({ mode: 'unknown', in_force: false, signal: { state: 'unknown', basis: 'none' } });
    await refused(exit(ops, String(r.contract['contract_id']), { requestId: uuidv7(), contractVersion: Number(r.contract['version']), evidence: 'the ensemble answered a probe' }, null, null),
      /^degraded contract rejected \(state\): no read evaluates a model dependency here/, 409);
  });
});

describe('DG6 · the read\'s guard, RLS, grants, the ledger', () => {
  it('another tenant\'s domain is refused; an unknown kind refused at the route', async () => {
    const r = await refusal(state(owner, {}, T2, D2));
    expect(r.status).toBe(403);
    await refused(state(owner, { kind: 'weather' }), /^degraded contract rejected \(kind\)/, 422);
  });
  it('FORCE RLS, the policy names the scope; an unbound runtime role reads no domain contract; no write grant; append-only; the ports eye_commit\'s', async () => {
    const t = await rows(sql`select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'shell'::regnamespace and relname in ('degraded_contracts', 'degraded_exits') order by relname`);
    expect(t).toEqual([{ relname: 'degraded_contracts', relrowsecurity: true, relforcerowsecurity: true }, { relname: 'degraded_exits', relrowsecurity: true, relforcerowsecurity: true }]);
    const g = await rows(sql`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'shell' and table_name in ('degraded_contracts', 'degraded_exits') and grantee in ('eye_app', 'eye_commit') order by 1, 2`);
    expect(new Set(g.map((x) => x['privilege_type']))).toEqual(new Set(['SELECT']));
    const seen = await h.su.transaction().execute(async (tx) => {
      await sql`set local role eye_app`.execute(tx);
      return (await sql<{ n: number }>`select count(*)::int n from shell.degraded_contracts where scope = 'DOMAIN'`.execute(tx)).rows[0]!.n;
    });
    expect(seen).toBe(0);
    await expect(sql`update shell.degraded_contracts set reason = 'rewritten' where contract_id = ${SRC_CONTRACT}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
    const fx = await rows(sql`select p.proname, has_function_privilege('eye_commit', p.oid, 'EXECUTE') c, has_function_privilege('eye_app', p.oid, 'EXECUTE') a
      from pg_proc p where p.pronamespace = 'shell'::regnamespace and p.proname in ('degraded_contract_declare', 'degraded_exit', 'degraded_state', 'dg_state_at', 'dg_signal') order by p.proname`);
    expect(fx).toEqual([
      { proname: 'degraded_contract_declare', c: true, a: false }, { proname: 'degraded_exit', c: true, a: false }, { proname: 'degraded_state', c: true, a: true },
      { proname: 'dg_signal', c: false, a: false }, { proname: 'dg_state_at', c: false, a: false },
    ]);
  });
  it('every declaration and exit is in the actor\'s shell ledger, in order', async () => {
    const l = await rows(sql`select event, version from shell.events where subject_id = ${PART_CONTRACT}::uuid order by occurred_at, event_id`);
    expect(l.map((x) => x['event'])).toEqual(['shell.degraded.declared', 'shell.degraded.exited']);
    const s = await rows(sql`select event, version from shell.events where subject_id = ${SRC_CONTRACT}::uuid order by occurred_at, event_id`);
    expect(s.map((x) => [x['event'], x['version']])).toEqual([['shell.degraded.declared', 1], ['shell.degraded.declared', 2]]);
  });
});
