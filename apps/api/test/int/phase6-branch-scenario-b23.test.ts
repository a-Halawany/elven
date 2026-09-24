/**
 * CP-6 B23 (migration 0084, part `branch`) — L7-I02 BranchScenario: a VERSIONED upside, downside, disruption or user-defined branch
 * ADDED to a declared scenario after its declaration — idempotent acceptance with one authoritative effect, conflicts rejected, a
 * retry only under the same idempotency boundary — on a real database, through the product's own routes (POST
 * …/prediction/scenarios/:id/branches, the get, the twin run), the world of `bootDecisionWorld` and B23's own humans with sessions of
 * their own (the port compares the acting principal).
 *
 *   B1 · v1 → v2: a user-defined branch (`user_defined` → the vocabulary's `user-defined`) on a second indicator; the SCN v2 admitted
 *   (the v1 branches plus the new one, superseding v1) and v1 byte for byte unchanged; current_version 2, added_in_version 2, the
 *   request row, scenario.branched, ScenarioBranched@v1, the coherence check on v2 with trigger `branch`; the get's version history.
 *   B2 · REPEAT: the same key and body → the first result (same branch id and version, repeated true); no second version, branch,
 *   request, check or ScenarioBranched; scenario.branch_repeated logged.
 *   B3 · IDEMPOTENCY CONFLICT: the same key with a different body → 409 (the port's text); nothing changes.
 *   B4 · STALE: a new key naming version 1 → 409 stale_version before anything is admitted; the retry with the current version → v3.
 *   B5 · THE CALLER'S REQUEST: the PDP (a domain analyst 403), an unknown scenario 404, baseline / stress / an unknown kind 422 with the
 *   reason, a missing key, a zero version, a user-defined branch without its label 422.
 *   B6 · DUPLICATES REFUSED, never admitted as a failing branch (409): the same name, the same user-defined label (the demonstration's
 *   case: a second branch of an existing user-defined kind), a branch the coherence rule would pair as duplicate_branch (same kind and
 *   indicator; same kind and statement); the version, the branches and the coherence state unchanged.
 *   B7 · COHERENCE ON THE NEW VERSION: a disruption branch whose decision falls before its indicator observes → ADMITTED failed
 *   (temporal_order), ScenarioCoherenceFailed@v1 with trigger `branch` and the branching action as its cause.
 *   B8 · CONCURRENCY: two branchings on the same version under different keys — one accepted, the other 409 stale_version (the
 *   canonical key); the loser's key is not recorded.
 *   B9 · THE RUN'S CUT-OFF: a twin version admitted BETWEEN v1 and the branching binds v1 — a run on the new branch refused 422
 *   (branch_added_later), a run on a v1 branch admitted; a twin version admitted after binds the new version and the run is admitted.
 *   B10 · THE WARNING'S SOURCE: a flip on the branched scenario raises a warning whose source ids name SCN:<id>@<current version>.
 *   B11 · THE REGISTER: L7-I02 bound in 0084 (the row only; the integrator asserts the counts).
 *
 * EACH CASE LOGS ONE `B23 EVIDENCE` LINE with the six things V04-T-024/026 demand. The scheduler is NOT enabled (the outbox rows are
 * asserted as written by the write, not as delivered: ScenarioBranched@v1 is not subscribable).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b23-branch-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let prediction: PredictionController; let twins: TwinController;
let strategyOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal;
/** What the cases leave one another. */
let S = ''; let I2 = ''; let I3 = ''; let UD = ''; let UP = ''; let vMid = 0; let downsideV1 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B21/B22 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
/** The SIX things V04-T-024/026 demand, logged per case. */
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B23 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
type Version = { object_version: number; supersedes: string | null; content_digest: string; payload: Row; audit_correlation_id: string };
const versionsOf = async (id: string): Promise<Version[]> => (await sql<Version>`select object_version::int, supersedes, content_digest, payload, audit_correlation_id::text from objects.canonical_objects where object_type = 'SCN' and object_id = ${id}::uuid order by object_version`.execute(su)).rows;
const scenarioRow = async (id: string) => (await sql<{ state: string; current_version: number; coherence_state: string; coherence_check_id: string | null }>`select state, current_version, coherence_state, coherence_check_id::text from prediction.scenarios_current where scenario_id = ${id}::uuid`.execute(su)).rows[0]!;
const branchRows = async (id: string) => (await sql<{ branch_id: string; name: string; kind: string; kind_label: string | null; added_in_version: number; state: string }>`select branch_id::text, name, kind, kind_label, added_in_version, state from prediction.branches_current where scenario_id = ${id}::uuid order by added_at, name`.execute(su)).rows;
const requestsOf = async (id: string) => (await sql<{ request_id: string; idempotency_key: string; base_version: number; result_version: number; branch_id: string; requester_principal_id: string; request_digest: string }>`select request_id::text, idempotency_key, base_version, result_version, branch_id::text, requester_principal_id::text, request_digest from prediction.scenario_branch_requests where scenario_id = ${id}::uuid order by requested_at`.execute(su)).rows;
const eventsOf = async (id: string, event: string) => (await sql<{ branch_id: string | null; details: Row }>`select branch_id::text, details from prediction.scenario_events where scenario_id = ${id}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const checksOf = async (id: string) => (await sql<{ check_id: string; trigger: string; outcome: string; changed: boolean; scenario_version: number; findings: Row[] }>`select check_id::text, trigger, outcome, changed, scenario_version, findings from prediction.scenario_coherence_checks where scenario_id = ${id}::uuid order by checked_at`.execute(su)).rows;
const outboxRows = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true) =>
  (await sql<{ id: string; event_type: string; schema_version: string | null; payload: Row }>`select id::text, event_type, schema_version, payload from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
/** A snapshot of everything a refused branching must leave as it was. */
const snapshot = async (id: string) => ({ versions: (await versionsOf(id)).map((v) => [v.object_version, v.content_digest]), row: await scenarioRow(id),
  branches: (await branchRows(id)).map((b) => b.branch_id), requests: (await requestsOf(id)).length, checks: (await checksOf(id)).length });

/* ───────────── the routes ───────────── */
type Branching = { branching: Row & { branch_id: string; version: number; base_version: number; repeated: boolean; coherence: Row | null }; receipt: Row };
const branch = (as: AuthenticatedPrincipal, scenarioId: string, payload: Row) =>
  prediction.branchScenario(h.req(as, 'prediction.scenario.branch', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId, { payload }) as unknown as Promise<Branching>;
type Declared = { scenario: Row & { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }>; coherence: Row } };
const declareScenario = (as: AuthenticatedPrincipal, payload: Row) => prediction.declareScenario(h.req(as, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload }) as unknown as Promise<Declared>;
const getScenario = (scenarioId: string) => prediction.getScenario(h.req(forecastOwner, 'prediction.read', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId) as unknown as Promise<{ scenario: Row }>;
const defineIndicator = (payload: Row) => prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(), { payload: { seriesKey: w.seriesKey, comparator: '<', consecutiveDays: 5, owner: w.twinOwner.principalId, ...payload } }) as unknown as Promise<{ indicator: { indicatorId: string } }>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ warningId: string; branchId: string }> }>;
const openVersion = (payload: Row = {}) => twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1, ...payload } }) as unknown as Promise<{ version: { version: number } }>;
const admit = (version: number) => twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(version), { payload: {} }) as unknown as Promise<{ admitted: { completeness: string } }>;
const run = (payload: Row) => twins.run(h.req(operator, 'simulation.run', 'SIM', null, 'simulation'), T(), D(),
  { payload: { twinId: w.twinId, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...payload } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;

const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
const downside = (name: string, statement: string, over: Row = {}): Row => ({ name, kind: 'downside', statement, indicatorId: w.indicatorId, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48, ...over });
/** The branch the demonstration adds (a user-defined kind on another indicator), as the page sends it. */
const insurer = (over: Row = {}): Row => ({ name: 'Insurer withdrawal', kind: 'user_defined', kindLabel: 'insurer withdrawal', statement: 'war-risk cover is withdrawn for the corridor',
  divergence: 'hull and cargo insurers withdraw war-risk cover, so sailings stop whatever the transits say', indicatorId: I2, owner: strategyOwner.principalId,
  consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24,
  assumptions: [{ statement: 'the Joint War Committee lists the corridor' }], ...over });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  prediction = h.app.get(Pc); twins = h.app.get(Tc);
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b23-strategy-owner');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b23-forecast-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b23-analyst');
  w = await bootDecisionWorld(h);
  operator = w.operator;
  I2 = (await defineIndicator({ description: 'B23: transits below 25 for five days (insurer signal)', threshold: 25 })).indicator.indicatorId;
  I3 = (await defineIndicator({ description: 'B23: transits below 10, watched from 2030', threshold: 10, observesFrom: '2030-01-01' })).indicator.indicatorId;
  const s = (await declareScenario(strategyOwner, { title: 'B23 corridor tree (harness)', statement: 'the corridor stays open, or collapses (B23 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [baseline(), downside('Corridor collapse', 'below 40 for five days')] })).scenario;
  S = s.scenarioId; downsideV1 = s.branches.find((b) => b.kind === 'downside')!.branchId;
  expect(obj(s.coherence)['outcome']).toBe('passed');
  // B9's middle twin version: admitted AFTER the declaration and BEFORE the branching, so its known_at binds SCN v1.
  vMid = (await openVersion()).version.version;
  expect((await admit(vMid)).admitted.completeness).toBe('complete');
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B23 · BranchScenario (0084; L7-I02)', () => {
  it('B1 · v1 → v2: the user-defined branch admitted as SCN v2 (v1 unchanged), the version on the rows, the request, scenario.branched, ScenarioBranched@v1, the check on v2 with trigger branch, the history on the get', async () => {
    const before = await versionsOf(S);
    expect(before.map((v) => v.object_version)).toEqual([1]);
    expect(await scenarioRow(S)).toMatchObject({ current_version: 1, coherence_state: 'passed' });
    expect(obj((await getScenario(S)).scenario)).toMatchObject({ current_version: 1, versions: [expect.objectContaining({ version: 1, supersedes: null })] });
    const t0 = await mark();
    const r = (await branch(strategyOwner, S, { expected_version: 1, idempotency_key: 'b23-insurer-1', branch: insurer() })).branching;
    expect(r).toMatchObject({ scenario_id: S, base_version: 1, version: 2, repeated: false, name: 'Insurer withdrawal', kind: 'user-defined', kind_label: 'insurer withdrawal' });
    expect(r.branch_id).toMatch(UUID); UD = r.branch_id;
    expect(obj(r.coherence)).toMatchObject({ outcome: 'passed', scenario_version: 2 });
    // THE VERSIONS: v1 byte for byte as it was; v2 = v1's branches + the new one, superseding v1, under the operation's correlation.
    const after = await versionsOf(S);
    expect(after.map((v) => v.object_version)).toEqual([1, 2]);
    expect(after[0]).toEqual(before[0]);
    const v2 = after[1]!;
    expect(v2.supersedes).toBe(`${S}@1`);
    const v1Branches = (before[0]!.payload['branches'] as Row[]); const v2Branches = (v2.payload['branches'] as Row[]);
    expect(v2Branches.slice(0, v1Branches.length)).toEqual(v1Branches);
    expect(v2Branches.at(-1)).toMatchObject({ branch_id: UD, kind: 'user-defined', kind_label: 'insurer withdrawal', indicator: { indicator_id: I2 }, owner: `principal:${strategyOwner.principalId}`, review_cadence: 'weekly', consequence_class: 'C3' });
    expect({ ...v2.payload, branches: null }).toEqual({ ...before[0]!.payload, branches: null });
    // THE ROWS.
    expect(await scenarioRow(S)).toMatchObject({ current_version: 2, state: 'active', coherence_state: 'passed' });
    const bs = await branchRows(S);
    expect(bs.map((b) => [b.name, b.added_in_version])).toEqual([['Baseline', 1], ['Corridor collapse', 1], ['Insurer withdrawal', 2]]);
    const reqs = await requestsOf(S);
    expect(reqs).toEqual([expect.objectContaining({ idempotency_key: 'b23-insurer-1', base_version: 1, result_version: 2, branch_id: UD, requester_principal_id: strategyOwner.principalId })]);
    expect(reqs[0]!.request_digest).toMatch(/^[0-9a-f]{64}$/);
    expect((await eventsOf(S, 'scenario.branched')).map((e) => [e.branch_id, e.details['version'], e.details['base_version']])).toEqual([[UD, 2, 1]]);
    expect((await eventsOf(S, 'branch.added')).filter((e) => e.branch_id === UD)).toHaveLength(1);
    // THE CHECK on the new version, trigger `branch`.
    expect((await checksOf(S)).at(-1)).toMatchObject({ trigger: 'branch', outcome: 'passed', scenario_version: 2 });
    // THE EVENT: ScenarioBranched@v1 (once), no coherence failure.
    const sb = await outboxRows('ScenarioBranched', t0, (p) => p['scenario_id'] === S);
    expect(sb).toHaveLength(1);
    expect(sb[0]!.payload).toMatchObject({ schema: 'ScenarioBranched', schema_version: 'v1', scenario_id: S, base_version: 1, version: 2,
      branch: { branch_id: UD, name: 'Insurer withdrawal', kind: 'user-defined', kind_label: 'insurer withdrawal', indicator_id: I2 },
      request: { idempotency_key: 'b23-insurer-1', request_digest: reqs[0]!.request_digest }, coherence: { outcome: 'passed' },
      cause: { action: 'prediction.scenario.branch', actor: strategyOwner.principalId, target_type: 'SCN', target_id: S } });
    expect(await outboxRows('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === S)).toHaveLength(0);
    // THE GET: current_version and the history.
    const got = obj((await getScenario(S)).scenario);
    expect(got['current_version']).toBe(2);
    expect(got['versions']).toEqual([expect.objectContaining({ version: 1, supersedes: null }), expect.objectContaining({ version: 2, supersedes: `${S}@1`, branch_ids: expect.arrayContaining([UD]) })]);
    expect((got['branches'] as Row[]).find((b) => b['branch_id'] === UD)).toMatchObject({ added_in_version: 2, kind: 'user-defined' });
    sixEvidence('B1', { fault_trace: null, watermark: { versions: [1, 2], current_version: 2 }, consumer_behaviour: { ScenarioBranched: sb.length, subscribable: false },
      operator_action: 'strategy owner branches v1 (user_defined on a second indicator)', recovery: null, reconciliation: { v1_unchanged: true, request: reqs[0]!.request_id } });
  });

  it('B2 · REPEAT: the same key and body answer the first result (same branch, same version, repeated) — no second version, branch, request, check or event; scenario.branch_repeated logged', async () => {
    const before = await snapshot(S); const t0 = await mark();
    const r = (await branch(strategyOwner, S, { expected_version: 1, idempotency_key: 'b23-insurer-1', branch: insurer() })).branching;
    expect(r).toMatchObject({ branch_id: UD, version: 2, base_version: 1, repeated: true, coherence: null });
    expect(await snapshot(S)).toEqual(before);
    expect(await outboxRows('ScenarioBranched', t0)).toHaveLength(0);
    expect((await eventsOf(S, 'scenario.branch_repeated')).map((e) => [e.branch_id, e.details['version']])).toEqual([[UD, 2]]);
    // a third time, the same (the effect stays one)
    expect((await branch(strategyOwner, S, { expected_version: 1, idempotency_key: 'b23-insurer-1', branch: insurer() })).branching).toMatchObject({ branch_id: UD, version: 2, repeated: true });
    expect(await snapshot(S)).toEqual(before);
    sixEvidence('B2', { fault_trace: 'a retried request (the client did not see the first answer)', watermark: { current_version: before.row.current_version }, consumer_behaviour: { ScenarioBranched: 0 },
      operator_action: 'the same key and body sent twice more', recovery: 'the first result answered (repeated: true)', reconciliation: { versions: before.versions.length, requests: before.requests } });
  });

  it('B3 · IDEMPOTENCY CONFLICT: the same key with a different body is refused 409 by the port; nothing changes', async () => {
    const before = await snapshot(S);
    await refused(branch(strategyOwner, S, { expected_version: 1, idempotency_key: 'b23-insurer-1', branch: insurer({ name: 'Insurer withdrawal (restated)' }) }),
      /^branch rejected \(idempotency_conflict\): idempotency key b23-insurer-1 was already used by this requester for a different branching/, 409, 'EYE-STA-002');
    // the key is the REQUESTER's: another person's same key is a new request (refused here only because it is stale — B4's rule)
    await refused(branch(forecastOwner, S, { expected_version: 1, idempotency_key: 'b23-insurer-1', branch: insurer({ name: 'Insurer withdrawal (restated)' }) }), /^branch rejected \(stale_version\)/, 409, 'EYE-STA-002');
    expect(await snapshot(S)).toEqual(before);
    sixEvidence('B3', { fault_trace: 'idempotency_conflict', watermark: { current_version: 2 }, consumer_behaviour: null, operator_action: 'a different branch under a used key',
      recovery: 'refused; a new branching takes a new key', reconciliation: before.versions });
  });

  it('B4 · STALE: a new key naming version 1 is refused 409 before anything is admitted; the retry on the current version is accepted as v3 (an upside)', async () => {
    const before = await snapshot(S); const t0 = await mark();
    const up = { name: 'Corridor recovery', kind: 'upside', statement: 'transits recover above 25 for five days', indicatorId: I2, owner: strategyOwner.principalId, consequence: 'release the held bookings', responseWindowHours: 72 };
    await refused(branch(strategyOwner, S, { expected_version: 1, idempotency_key: 'b23-upside-1', branch: up }), /^branch rejected \(stale_version\): scenario .* stands at version 2, the request names version 1/, 409, 'EYE-STA-002');
    expect(await snapshot(S)).toEqual(before);
    expect(await outboxRows('ScenarioBranched', t0)).toHaveLength(0);
    // THE RECOVERY: reload (the get's current_version) and branch that version — a new body, so a new key.
    const current = Number(obj((await getScenario(S)).scenario)['current_version']);
    const r = (await branch(strategyOwner, S, { expected_version: current, idempotency_key: 'b23-upside-2', branch: up })).branching;
    expect(r).toMatchObject({ base_version: 2, version: 3, kind: 'upside', repeated: false });
    UP = r.branch_id;
    expect((await versionsOf(S)).map((v) => [v.object_version, v.supersedes])).toEqual([[1, null], [2, `${S}@1`], [3, `${S}@2`]]);
    expect((await checksOf(S)).at(-1)).toMatchObject({ trigger: 'branch', scenario_version: 3 });
    sixEvidence('B4', { fault_trace: 'stale_version (read v1, v2 stood)', watermark: { before: 2, after: 3 }, consumer_behaviour: { ScenarioBranched: (await outboxRows('ScenarioBranched', t0)).length },
      operator_action: 'reload and branch the current version', recovery: 'accepted as v3', reconciliation: { branch: UP } });
  });

  it('B5 · THE CALLER\'S REQUEST: the PDP 403, an unknown scenario 404, baseline / stress / an unknown kind 422 with the reason, a missing key, a zero version, an unlabelled user-defined branch 422', async () => {
    const before = await snapshot(S);
    const ok = { expected_version: 3, idempotency_key: 'b23-caller', branch: insurer({ name: 'Canal closure', kindLabel: 'canal closure', statement: 'the canal closes', indicatorId: I3 }) };
    expect((await refusal(branch(analyst, S, ok)))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect((await refusal(branch(strategyOwner, uuidv7(), ok))).status).toBe(404);
    await refused(branch(strategyOwner, S, { ...ok, branch: { ...baseline(), name: 'Second baseline' } }), /kind "baseline" is not one of them \(a scenario has one baseline, declared with the tree\)/, 422, 'EYE-REQ-001');
    await refused(branch(strategyOwner, S, { ...ok, branch: insurer({ kind: 'stress', kindLabel: null }) }), /kind "stress" is not one of them \(declare it with the scenario tree\)/, 422);
    await refused(branch(strategyOwner, S, { ...ok, branch: insurer({ kind: 'wildcard' }) }), /BranchScenario adds an upside, downside, disruption or user-defined branch; kind "wildcard"/, 422);
    await refused(branch(strategyOwner, S, { ...ok, idempotency_key: '' }), /idempotency_key is 1-200 characters/, 422);
    await refused(branch(strategyOwner, S, { ...ok, idempotency_key: 'k'.repeat(201) }), /idempotency_key is 1-200 characters/, 422);
    await refused(branch(strategyOwner, S, { ...ok, expected_version: 0 }), /expected_version/, 422);
    await refused(branch(strategyOwner, S, { ...ok, branch: insurer({ kindLabel: null }) }), /is user-defined and must name its kind/, 422);
    await refused(branch(strategyOwner, 'not-a-uuid', ok), /scenarioId must be a scenario id/, 422);
    expect(await snapshot(S)).toEqual(before);
    sixEvidence('B5', { fault_trace: '403/404/422', watermark: { current_version: 3 }, consumer_behaviour: null, operator_action: 'malformed or unauthorised branchings', recovery: 'refused; nothing recorded', reconciliation: before.versions });
  });

  it('B6 · DUPLICATES are refused 409, never admitted as a failing branch: the same name, the same user-defined label (the demonstration\'s case), the coherence rule\'s duplicate_branch (same kind + indicator; same kind + statement)', async () => {
    const before = await snapshot(S); const t0 = await mark();
    expect(before.row.coherence_state).toBe('passed');
    await refused(branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-dup-name', branch: { ...downside('corridor COLLAPSE ', 'a different statement of a collapse'), indicatorId: I3 } }),
      /^branch rejected \(duplicate\): scenario .* already has a live branch named "Corridor collapse"/, 409, 'EYE-STA-002');
    await refused(branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-dup-label', branch: insurer({ name: 'Underwriters leave', kindLabel: 'Insurer Withdrawal', statement: 'underwriters leave the market', indicatorId: I3 }) }),
      /^branch rejected \(duplicate\): scenario .* already has a live user-defined branch "Insurer withdrawal" of the kind "insurer withdrawal"/, 409);
    await refused(branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-' + 'dup-indicator', branch: downside('Corridor collapse, restated', 'the corridor collapses (a second statement of the same signal)') }),
      /^branch rejected \(duplicate\): the live downside branch "Corridor collapse" \(.*\) shares the same indicator; a second one does not cover distinct uncertainty/, 409);
    await refused(branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-dup-statement', branch: { name: 'Recovery again', kind: 'upside', statement: '  Transits recover above 25 for five days ', indicatorId: I3, owner: strategyOwner.principalId, consequence: 'release the held bookings', responseWindowHours: 72 } }),
      /^branch rejected \(duplicate\): the live upside branch "Corridor recovery" \(.*\) shares the same statement/, 409);
    expect(await snapshot(S)).toEqual(before);
    expect(await outboxRows('ScenarioBranched', t0)).toHaveLength(0);
    expect((await scenarioRow(S)).coherence_state).toBe('passed');
    sixEvidence('B6', { fault_trace: 'duplicate (name, label, indicator, statement)', watermark: { current_version: 3 }, consumer_behaviour: { ScenarioBranched: 0 },
      operator_action: 'four branchings that duplicate live branches', recovery: 'refused; the tree and its coherence unchanged', reconciliation: before.versions });
  });

  it('B7 · COHERENCE ON THE NEW VERSION: a disruption branch due before its indicator observes is ADMITTED failed (temporal_order); ScenarioCoherenceFailed@v1 names trigger branch and the branching action', async () => {
    const s2 = (await declareScenario(strategyOwner, { title: 'B23 second tree (harness)', statement: 'the corridor recovers, or is disrupted (B23 harness)', forecastId: w.forecastId,
      owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [baseline(), { name: 'Recovery', kind: 'upside', statement: 'transits recover', indicatorId: I2, owner: strategyOwner.principalId, consequence: 'release the held bookings', responseWindowHours: 72 }] })).scenario;
    const S2 = s2.scenarioId; const t0 = await mark();
    const r = (await branch(strategyOwner, S2, { expected_version: 1, idempotency_key: 'b23-' + 's2-disruption', branch: { name: 'Canal closure', kind: 'disruption', statement: 'the canal closes to transits',
      divergence: 'a closure stops every transit whatever the demand', indicatorId: I3, owner: strategyOwner.principalId, consequence: 'hold every departure now', responseWindowHours: 24, decisionDeadline: '2026-01-01T00:00:00Z' } })).branching;
    expect(r).toMatchObject({ version: 2, kind: 'disruption', repeated: false });
    expect(obj(r.coherence)).toMatchObject({ outcome: 'failed', changed: true, prior_state: 'passed', scenario_version: 2 });
    expect(((obj(r.coherence)['findings'] as Row[]).filter((f) => f['severity'] === 'fail')).map((f) => f['rule'])).toEqual(['temporal_order']);
    expect(await scenarioRow(S2)).toMatchObject({ current_version: 2, coherence_state: 'failed' });
    expect((await checksOf(S2)).map((c) => [c.trigger, c.outcome])).toEqual([['declare', 'passed'], ['branch', 'failed']]);
    const scf = await outboxRows('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === S2);
    expect(scf).toHaveLength(1);
    expect(scf[0]!.payload).toMatchObject({ trigger: 'branch', scenario_version: 2, cause: { action: 'prediction.scenario.branch', actor: strategyOwner.principalId, target_type: 'SCN', target_id: S2 } });
    const sb = await outboxRows('ScenarioBranched', t0, (p) => p['scenario_id'] === S2);
    expect(sb.map((x) => obj(x.payload['coherence'])['outcome'])).toEqual(['failed']);
    sixEvidence('B7', { fault_trace: 'temporal_order on the new version', watermark: { current_version: 2 }, consumer_behaviour: { ScenarioCoherenceFailed: scf.length, ScenarioBranched: sb.length },
      operator_action: 'a disruption branch due 2026-01-01 on an indicator watched from 2030', recovery: 'admitted failed (the review resolves it)', reconciliation: { checks: 2 } });
  });

  it('B8 · CONCURRENCY: two branchings of the same version under different keys — one accepted, the other 409 stale_version (the canonical key); the loser\'s key is not recorded', async () => {
    const before = await snapshot(S);
    const a = { name: 'Port strike', kind: 'user-defined', kindLabel: 'port strike', statement: 'the discharge port strikes', divergence: 'a strike stops discharge whatever the transits say', indicatorId: I3, owner: strategyOwner.principalId, consequence: 'divert to the secondary port', responseWindowHours: 48 };
    const b = { ...a, name: 'Canal toll shock', kindLabel: 'canal toll shock', statement: 'canal tolls triple overnight', divergence: 'the toll makes the corridor uneconomic whatever the transits say' };
    const results = await Promise.allSettled([branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-race-a', branch: a }), branch(strategyOwner, S, { expected_version: 3, idempotency_key: 'b23-race-b', branch: b })]);
    const won = results.filter((x) => x.status === 'fulfilled'); const lost = results.filter((x) => x.status === 'rejected');
    expect(won).toHaveLength(1); expect(lost).toHaveLength(1);
    const lr = await refusal(Promise.reject((lost[0] as PromiseRejectedResult).reason));
    expect(lr).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(lr.message).toMatch(/^branch rejected \(stale_version\)/);
    expect((await versionsOf(S)).map((v) => v.object_version)).toEqual([1, 2, 3, 4]);
    const reqs = await requestsOf(S);
    expect(reqs.length).toBe(before.requests + 1);
    const winnerKey = reqs.at(-1)!.idempotency_key; const loserKey = winnerKey === 'b23-race-a' ? 'b23-race-b' : 'b23-race-a';
    expect(reqs.map((q) => q.idempotency_key)).not.toContain(loserKey);
    sixEvidence('B8', { fault_trace: lr.message.slice(0, 120), watermark: { before: 3, after: 4 }, consumer_behaviour: null, operator_action: 'two concurrent branchings of v3',
      recovery: 'one accepted; the other refused stale and unrecorded', reconciliation: { winner: winnerKey } });
  });

  it('B9 · THE RUN\'S CUT-OFF: a twin version admitted between v1 and the branching binds v1 — the new branch refused 422 (branch_added_later), a v1 branch admitted; a later twin version binds the current version and admits the new branch', async () => {
    await refused(run({ twinVersion: vMid, scenarioId: S, scenarioBranchId: UD }), /^run rejected \(branch_added_later\): branch "Insurer withdrawal" was added in version 2 of scenario .*, after version 1 that this twin version's known_at/, 422, 'EYE-REQ-001');
    const onV1 = await run({ twinVersion: vMid, scenarioId: S, scenarioBranchId: downsideV1 });
    expect(onV1.run.state).toBe('completed');
    const bound = (await sql<{ scenario_version: number }>`select scenario_version from simulation.runs_current where run_id = ${onV1.run.runId}::uuid`.execute(su)).rows[0]!;
    expect(bound.scenario_version).toBe(1);
    const vAfter = (await openVersion()).version.version;
    expect((await admit(vAfter)).admitted.completeness).toBe('complete');
    const onNew = await run({ twinVersion: vAfter, scenarioId: S, scenarioBranchId: UD });
    expect(onNew.run.state).toBe('completed');
    const current = (await scenarioRow(S)).current_version;
    expect((await sql<{ scenario_version: number }>`select scenario_version from simulation.runs_current where run_id = ${onNew.run.runId}::uuid`.execute(su)).rows[0]!.scenario_version).toBe(current);
    sixEvidence('B9', { fault_trace: 'branch_added_later', watermark: { twin_mid: vMid, twin_after: vAfter, scenario_version: current }, consumer_behaviour: null,
      operator_action: 'runs on the new branch before and after its version', recovery: 'the later twin version binds the current tree', reconciliation: { runs: [onV1.run.runId, onNew.run.runId] } });
  });

  it('B10 · THE WARNING\'S SOURCE: a flip on the branched scenario raises a warning whose canonical source ids name SCN:<id>@<current version>', async () => {
    const current = (await scenarioRow(S)).current_version;
    expect(current).toBeGreaterThan(1);
    const ev = await evaluateIndicator(w.indicatorId);
    const mine = ev.warnings.find((x) => x.branchId === downsideV1);
    expect(mine, JSON.stringify(ev.warnings)).toBeDefined();
    const wrn = (await sql<{ source_object_ids: string[] }>`select source_object_ids from objects.canonical_objects where object_type = 'WRN' and object_id = ${mine!.warningId}::uuid`.execute(su)).rows[0]!;
    expect(wrn.source_object_ids).toContain(`SCN:${S}@${current}`);
    expect(wrn.source_object_ids).not.toContain(`SCN:${S}@1`);
    sixEvidence('B10', { fault_trace: null, watermark: { current_version: current }, consumer_behaviour: null, operator_action: 'an indicator evaluation flips the v1 downside',
      recovery: null, reconciliation: { warning: mine!.warningId, source_object_ids: wrn.source_object_ids } });
  });

  it('B11 · THE REGISTER: L7-I02 bound in 0084 (this row only)', async () => {
    const row = (await sql<{ binding_state: string; bound_in: string; schema_version: string; bound_to: string }>`select binding_state, bound_in, schema_version, bound_to from objects.interface_register where interface_id = 'L7-I02'`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ binding_state: 'bound', bound_in: '0084', schema_version: 'v1' });
    expect(row.bound_to).toMatch(/^ScenarioBranched@v1 from POST …\/prediction\/scenarios\/:scenarioId\/branches/);
    sixEvidence('B11', { fault_trace: null, watermark: null, consumer_behaviour: null, operator_action: null, recovery: null, reconciliation: { L7_I02: row.binding_state } });
  });
});
