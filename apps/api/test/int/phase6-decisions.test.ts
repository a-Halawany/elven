/**
 * PHASE 6 · P6-M1 — decision packages, through the real database and controller.
 *
 * F1 (a package is complete or refused: two options, one explicit status quo, one
 * common baseline, consequences that cite completed runs with version and digest,
 * derived uncertainty, the choice with its owner and measurable outcomes, an
 * approver policy that cannot be satisfied by the author alone, monitoring
 * conditions), the dissent half of F3 (humans only, append-only, never removed), the
 * DPK admission boundaries (schema DPK@v1, the version digest an approval will sign,
 * immutability once proposed, a new choice is a new version, dependencies reach the
 * DEC), and the role boundary (an approver, an authority, an executive and the
 * decision agent hold no owner write; the agent's one write is an option card into a
 * draft; nothing here reaches C3). Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { DecisionController } from '../../src/decision/decision.controller.js';
import { RECORD_FILES, completeElements } from './phase5-fixtures.js';

let h: Phase4Harness;
let twins: TwinController; let graph: GraphController; let prediction: PredictionController; let decisions: DecisionController;
let twinOwner: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal;
let owner: AuthenticatedPrincipal; let approver: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal;
let twinId = ''; let v1 = 0;
let controlId = ''; let rerouteId = ''; let airId = ''; let control2Id = '';
let objectiveId = ''; let decisionId = ''; let indicatorId = '';
let evd: { id: string; version: number };
let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
let packageId = '';

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const status = async (p: Promise<unknown>): Promise<number | string> => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : (e instanceof Error ? e.message : String(e)); } };
const message = async (p: Promise<unknown>): Promise<string> => { try { await p; return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e)); } };
const run = (payload: Record<string, unknown>) => twins.run(h.req(operator, 'simulation.run', 'SIM', null), T(), D(), { payload }) as Promise<{ run: { runId: string; state: string } }>;
const base = (over: Record<string, unknown> = {}) => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over });

const declare = (payload: Record<string, unknown>, as = owner) => decisions.declare(h.req(as, 'decision.package.declare', 'DPK', null, 'decision'), T(), D(), { payload }) as Promise<{ package: { packageId: string } }>;
const open = (pkg: string, payload: Record<string, unknown> = {}, as = owner) => decisions.openVersion(h.req(as, 'decision.package.version', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { knownAt: new Date().toISOString(), observedThrough: '2024-01-17', ...payload } }) as Promise<{ version: { version: number } }>;
const option = (pkg: string, v: number, payload: Record<string, unknown>, as = owner) => decisions.setOption(h.req(as, 'decision.package.option', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ option: { optionId: string; simulated: boolean; uncertainty: Record<string, unknown>; syntheticState: boolean } }>;
const terms = (pkg: string, v: number, payload: Record<string, unknown>, as = owner) => decisions.setTerms(h.req(as, 'decision.package.terms', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload });
const choice = (pkg: string, v: number, payload: Record<string, unknown>, as = owner) => decisions.setChoice(h.req(as, 'decision.package.choice', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload });
const propose = (pkg: string, v: number, as = owner) => decisions.propose(h.req(as, 'decision.package.propose', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v)) as Promise<{ proposal: { versionDigest: string; baselineRunId: string | null; syntheticState: boolean } }>;
const dissent = (pkg: string, v: number, payload: Record<string, unknown>, as = approver) => decisions.dissent(h.req(as, 'decision.dissent', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ dissent: { dissentId: string } }>;
const get = (pkg: string, as = owner) => decisions.get(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ package: Record<string, unknown> & { versions: Array<Record<string, unknown> & { options: Array<Record<string, unknown>>; dissent: unknown[] }> } }>;

const validTerms = (over: Record<string, unknown> = {}) => ({
  objectives: [objectiveId], constraints: ['no air freight above 60 t/week'],
  approverPolicy: { quorum: 1, principals: [approver.principalId], expires_after_days: 14 },
  monitoringConditions: [
    { kind: 'indicator', indicator_id: indicatorId, owner: owner.principalId, note: 'corridor transits below 40 for five days' },
    { kind: 'review', every_days: 7, owner: owner.principalId },
  ],
  reversibility: 'reversible within one sailing', informationValue: 'a week of observation would not change the ranking', ...over,
});
const validChoice = (over: Record<string, unknown> = {}) => ({
  option_key: 'reroute', rationale: 'The reroute is the only option that keeps the line running without the air-bridge premium.',
  decision_deadline: '2024-01-19', accepted_trade_offs: ['+14 days of transit', '+48,100 reroute cost'], action_owner: owner.principalId,
  outcome_criteria: [{ key: 'line_stop_days', quantity: 'line stop days over the horizon', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:inventory.line_stop_days' }],
  ...over,
});

async function admitTwin(elements: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(twinOwner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(twinOwner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements } });
  await twins.admit(h.req(twinOwner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}
/** A full draft on a fresh package: two options on the common control, terms, the choice. Returns the draft's identifiers. */
async function fullDraft(): Promise<{ pkg: string; v: number }> {
  const d = await declare({ decisionObjectId: decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: owner.principalId });
  const pkg = d.package.packageId;
  const v = (await open(pkg)).version.version;
  await option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: controlId }] });
  await option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteId }, { kind: 'evidence', id: evd.id, version: evd.version }] });
  await terms(pkg, v, validTerms());
  await choice(pkg, v, validChoice());
  return { pkg, v };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { DecisionController: Dc } = await import('../../src/decision/decision.controller.js');
  twins = h.app.get(Tc); graph = h.app.get(Gc); prediction = h.app.get(Pc); decisions = h.app.get(Dc);
  twinOwner = await h.principalWith(['twin_owner', 'forecast_owner', 'strategy_owner'], 'twin-owner');
  operator = await h.principalWith(['simulation_operator'], 'sim-operator');
  owner = await h.humanWithSession(['decision_owner'], 'decision-owner');
  approver = await h.humanWithSession(['decision_approver'], 'approver');
  authority = await h.humanWithSession(['decision_authority'], 'authority');
  executive = await h.humanWithSession(['executive'], 'executive');
  agent = await h.humanWithSession(['decision_agent'], 'decision-agent');
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  evd = (await sql<{ id: string; version: number }>`select object_id::text id, object_version::int version from objects.canonical_objects
    where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at limit 1`.execute(h.su)).rows[0] as { id: string; version: number };
  const up = await h.upload(RECORD_FILES());
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(twinOwner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: twinOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(completeElements(records), 'actual');
  // The runs a package will cite: one control (the common baseline), two interventions on it, and a SECOND control (a different baseline).
  controlId = (await run(base())).run.runId;
  rerouteId = (await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] }))).run.runId;
  airId = (await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }] }))).run.runId;
  control2Id = (await run(base({ shock: false }))).run.runId;
  // The strategy objects, through Phase 3's own port: an OBJ, and the DEC the package will bind to.
  const obj = await graph.declare(h.req(twinOwner, 'graph.strategy.declare', 'OBJ', null, 'graph'), T(), D(), { payload: { objectType: 'OBJ', title: 'Keep the Regensburg line running through Q1', statement: 'no line stop attributable to the magnet chain',
    restsOn: [{ kind: 'entity', id: entityId, rationale: 'the objective is about the chain through this strait' }] } }) as { strategy: { objectId: string } };
  objectiveId = obj.strategy.objectId;
  const dec = await graph.declare(h.req(twinOwner, 'graph.strategy.declare', 'DEC', null, 'graph'), T(), D(), { payload: { objectType: 'DEC', title: 'Routing of SYN-SHIP-4472', statement: 'reroute, air-bridge, draw down, or wait',
    restsOn: [{ kind: 'strategy', id: objectiveId, rationale: 'the decision serves the objective' }] } }) as { strategy: { objectId: string } };
  decisionId = dec.strategy.objectId;
  const seriesKey = `fixture:${sv.sourceKey}:value`;
  await prediction.registerSeries(h.req(twinOwner, 'prediction.series.register', 'SER', null), T(), D(),
    { payload: { seriesKey, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
  const ind = await prediction.defineIndicator(h.req(twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
    { payload: { seriesKey, description: 'corridor collapse: transits below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: twinOwner.principalId } }) as { indicator: { indicatorId: string } };
  indicatorId = ind.indicator.indicatorId;
}, 300_000);

afterAll(async () => { await h?.close(); });

/* ═════════ declare ═════════ */
describe('P6-M1 · a package binds to a DEC a strategy owner declared; it never declares one', () => {
  it('refuses an OBJ, an unknown object, a non-uuid, and an approver as caller; the owner declares', async () => {
    expect(await message(declare({ decisionObjectId: objectiveId, title: 'On an objective', statement: 'a package on an OBJ', owner: owner.principalId }))).toMatch(/is a OBJ, not a DEC/);
    expect(await status(declare({ decisionObjectId: uuidv7(), title: 'On nothing', statement: 'a package on nothing', owner: owner.principalId }))).toBe(404);
    expect(await status(declare({ decisionObjectId: 'not-a-uuid', title: 'x', statement: 'y', owner: owner.principalId }))).toBe(422);
    expect(await status(declare({ decisionObjectId: decisionId, title: 'Probe', statement: 'an approver cannot declare', owner: owner.principalId }, approver))).toBe(403);
    expect(await status(declare({ decisionObjectId: decisionId, title: 'Probe', statement: 'an authority cannot declare', owner: owner.principalId }, authority))).toBe(403);
    expect(await status(declare({ decisionObjectId: decisionId, title: 'Probe', statement: 'an executive cannot declare', owner: owner.principalId }, executive))).toBe(403);
    expect(await status(declare({ decisionObjectId: decisionId, title: 'Probe', statement: 'the agent cannot declare', owner: owner.principalId }, agent))).toBe(403);
    // the owner must be a named human of this tenant
    expect(await message(declare({ decisionObjectId: decisionId, title: 'Probe', statement: 'owner is nobody', owner: uuidv7() }))).toMatch(/named, active human/);
    const r = await declare({ decisionObjectId: decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: owner.principalId });
    packageId = r.package.packageId;
    const row = (await sql<Record<string, unknown>>`select * from decision.packages_current where package_id = ${packageId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(row['state']).toBe('draft');
    expect(String(row['decision_object_id'])).toBe(decisionId);
    expect((await sql<{ e: string }>`select event e from decision.package_events where package_id = ${packageId}::uuid`.execute(h.su)).rows.map((x) => x.e)).toEqual(['package.declared']);
    // nothing was written into the strategy graph
    expect((await sql<{ n: string }>`select count(*)::text n from graph.strategy_current where tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]?.n).toBe('2');
  });

  it('a consequence class above C2 is refused before any port runs — no rule here reaches C3', async () => {
    const env = { ...h.env(owner, 'decision.package.declare', 'DPK', null, 'decision'), consequence_class: 'C3' };
    const req = { eyeEnvelope: env, eyePrincipal: owner } as never;
    const r = decisions.declare(req, T(), D(), { payload: { decisionObjectId: decisionId, title: 'C3 probe', statement: 'must not reach the port', owner: owner.principalId } });
    expect(await status(r)).toBe(403);
    expect(await message(r)).toMatch(/exceeds C2/);
  });
});

/* ═════════ versions and options ═════════ */
describe('P6-M1 · F1 — options cite completed runs by exact version and digest; uncertainty is derived, not declared', () => {
  let v = 0;
  it('opens one draft at a time; a second open is refused until it is proposed or withdrawn', async () => {
    v = (await open(packageId)).version.version;
    expect(v).toBe(1);
    expect(await message(open(packageId))).toMatch(/already has an open draft/);
    expect(await status(open(packageId, {}, executive))).toBe(403);
  });

  it('refuses a citation that names nothing readable, a non-run consequence without an unsimulated reason, and a run that is not completed', async () => {
    expect(await message(option(packageId, v, { key: 'ghost', title: 'Cites a ghost', kind: 'intervention', consequences: [{ kind: 'run', id: uuidv7() }] }))).toMatch(/not a readable SIM/);
    expect(await message(option(packageId, v, { key: 'unsimulated', title: 'Wait a week', kind: 'intervention', consequences: [{ kind: 'evidence', id: evd.id }] }))).toMatch(/say why the option is unsimulated/);
    expect(await message(option(packageId, v, { key: 'bad-kind', title: 'Cites an entity', kind: 'intervention', consequences: [{ kind: 'entity', id: evd.id }] }))).toMatch(/consequence kind must be one of/);
    // a run row whose state is not completed — planted, then cited: refused by the service before the port
    const planted = uuidv7();
    await sql`insert into simulation.runs_current (run_id, scope, tenant_id, domain_id, twin_id, twin_version, run_kind, control_run_id, contract, contract_digest, known_at, state, opened_by, correlation_id)
      select ${planted}::uuid, scope, tenant_id, domain_id, twin_id, twin_version, run_kind, control_run_id, contract, contract_digest, known_at, 'opened', opened_by, ${uuidv7()}::uuid
        from simulation.runs_current where run_id = ${controlId}::uuid`.execute(h.su).catch(() => { /* the column set differs across migrations; the assertion below tolerates an absent plant */ });
    const plantedRow = (await sql<{ n: string }>`select count(*)::text n from simulation.runs_current where run_id = ${planted}::uuid`.execute(h.su)).rows[0]?.n;
    if (plantedRow === '1') {
      expect(await message(option(packageId, v, { key: 'opened', title: 'Cites an opened run', kind: 'intervention', consequences: [{ kind: 'run', id: planted }] }))).toMatch(/not a readable SIM|not completed/);
      await sql`delete from simulation.runs_current where run_id = ${planted}::uuid`.execute(h.su).catch(() => undefined);
    }
  });

  it('an option on a completed run binds version and digest, is SIMULATED, and carries uncertainty derived from the run and the evidence', async () => {
    const r = await option(packageId, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention',
      consequences: [{ kind: 'run', id: rerouteId }, { kind: 'evidence', id: evd.id, version: evd.version }],
      risks: ['the Cape adds 14 days'], opportunities: ['no air-bridge premium'], reversibility: 'reversible until the vessel passes Suez' });
    expect(r.option.simulated).toBe(true);
    expect(r.option.syntheticState).toBe(true);
    const u = r.option.uncertainty as { method: string; citations: number; synthetic_inputs: number; unvalidated_runs: number; outside_envelope_runs: number; truth_states: string[]; basis: Array<Record<string, unknown>> };
    expect(u.method).toBe('derived-from-citations@1');
    expect(u.citations).toBe(2);
    expect(u.synthetic_inputs).toBeGreaterThanOrEqual(1);
    expect(u.unvalidated_runs).toBe(1);
    expect(u.basis[0]?.['run_kind']).toBe('intervention');
    expect(u.basis[0]?.['truth_state']).toBe('synthetic');
    const row = (await sql<Record<string, unknown>>`select * from decision.options where package_id = ${packageId}::uuid and version = ${v} and key = 'reroute'`.execute(h.su)).rows[0] as Record<string, unknown>;
    const cites = row['consequences'] as Array<{ kind: string; id: string; version: number; digest: string }>;
    expect(cites[0]).toMatchObject({ kind: 'run', id: rerouteId, version: 1 });
    expect(cites[0]?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(cites[1]).toMatchObject({ kind: 'evidence', id: evd.id, version: evd.version });
    // the uncertainty the caller offers is ignored: it is derived
    const r2 = await option(packageId, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: controlId }], uncertainty: { made_up: true } });
    expect((r2.option.uncertainty as Record<string, unknown>)['made_up']).toBeUndefined();
    expect(await message(option(packageId, v, { key: 'status-quo', title: 'Again', kind: 'status_quo', consequences: [{ kind: 'run', id: controlId }] }))).toMatch(/duplicate key|dop_unique_key/);
  });

  it('the decision agent holds exactly ONE write — an option card into a draft — and none of the owner writes', async () => {
    const r = await option(packageId, v, { key: 'wait', title: 'Wait a week for the corridor', kind: 'intervention', consequences: [{ kind: 'evidence', id: evd.id }], unsimulatedReason: 'no run models waiting; the twin has no wait intervention' }, agent);
    expect(r.option.simulated).toBe(false);
    expect(await status(terms(packageId, v, validTerms(), agent))).toBe(403);
    expect(await status(choice(packageId, v, validChoice(), agent))).toBe(403);
    expect(await status(propose(packageId, v, agent))).toBe(403);
    expect(await status(dissent(packageId, v, { position: 'against', rationale: 'an agent cannot dissent' }, agent))).toBe(403);
    for (const p of [approver, authority, executive]) {
      expect(await status(option(packageId, v, { key: `probe-${p.principalId.slice(-4)}`, title: 'Probe option', kind: 'intervention', consequences: [], unsimulatedReason: 'probe only' }, p))).toBe(403);
      expect(await status(terms(packageId, v, validTerms(), p))).toBe(403);
      expect(await status(propose(packageId, v, p))).toBe(403);
    }
  });

  it('terms: objectives are OBJs, approvers are named humans or registered roles, conditions name what exists', async () => {
    expect(await message(terms(packageId, v, validTerms({ objectives: [decisionId] })))).toMatch(/is not an OBJ/);
    expect(await message(terms(packageId, v, validTerms({ approverPolicy: { quorum: 1 } })))).toMatch(/at least one human principal or one role/);
    expect(await message(terms(packageId, v, validTerms({ approverPolicy: { quorum: 1, principals: [uuidv7()] } })))).toMatch(/not an active human principal/);
    expect(await message(terms(packageId, v, validTerms({ approverPolicy: { quorum: 1, roles: ['no_such_role'] } })))).toMatch(/not a registered role/);
    expect(await message(terms(packageId, v, validTerms({ approverPolicy: { quorum: 0, principals: [approver.principalId] } })))).toMatch(/quorum must be a positive integer/);
    expect(await message(terms(packageId, v, validTerms({ monitoringConditions: [{ kind: 'indicator', indicator_id: uuidv7(), owner: owner.principalId }] })))).toMatch(/does not exist in this domain/);
    expect(await message(terms(packageId, v, validTerms({ monitoringConditions: [{ kind: 'indicator', indicator_id: indicatorId, owner: uuidv7() }] })))).toMatch(/owner .* is not an active human/);
    expect(await message(terms(packageId, v, validTerms({ monitoringConditions: [{ kind: 'vibe', owner: owner.principalId }] })))).toMatch(/not indicator, warning or review/);
    await terms(packageId, v, validTerms());
    const row = (await sql<Record<string, unknown>>`select * from decision.package_versions where package_id = ${packageId}::uuid and version = ${v}`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect((row['objectives'] as string[])).toEqual([objectiveId]);
    expect((row['monitoring_conditions'] as unknown[]).length).toBe(2);
  });

  it('the proposal is refused while the choice is missing; the choice names an option, a human owner, a deadline and measurable outcomes', async () => {
    expect(await status(propose(packageId, v))).toBe(409);
    expect(await message(propose(packageId, v))).toMatch(/the choice is what is proposed/);
    expect(await message(choice(packageId, v, validChoice({ option_key: 'draw-down' })))).toMatch(/is not an option of this version/);
    expect(await message(choice(packageId, v, validChoice({ action_owner: uuidv7() })))).toMatch(/action_owner must be a named, active human/);
    expect(await status(choice(packageId, v, validChoice({ outcome_criteria: [] })))).toBe(422);
    expect(await message(choice(packageId, v, validChoice({ outcome_criteria: [{ key: 'k', quantity: 'q', unit: 'u', target: 'zero', comparator: '<=', by: '2024-04-10', observed_on: 'x' }] })))).toMatch(/outcome target is a number/);
    expect(await message(choice(packageId, v, validChoice({ outcome_criteria: [{ key: 'k', quantity: 'q', unit: 'u', target: 0, comparator: '~', by: '2024-04-10', observed_on: 'x' }] })))).toMatch(/comparator must be one of/);
    expect(await message(choice(packageId, v, validChoice({ rationale: 'short' })))).toMatch(/at least eight characters/);
    expect(await message(choice(packageId, v, validChoice({ decision_deadline: 'soon' })))).toMatch(/decision_deadline must be a date/);
    await choice(packageId, v, validChoice());
    const events = (await sql<{ e: string }>`select event e from decision.package_events where package_id = ${packageId}::uuid order by occurred_at`.execute(h.su)).rows.map((x) => x.e);
    expect(events).toEqual(['package.declared', 'version.opened', 'option.set', 'option.set', 'option.set', 'terms.set', 'choice.set']);
  });

  it('the author cannot be the only approver the policy names', async () => {
    await terms(packageId, v, validTerms({ approverPolicy: { quorum: 1, principals: [owner.principalId] } }));
    expect(await message(propose(packageId, v))).toMatch(/author cannot be the only approver/);
    await terms(packageId, v, validTerms());
  });

  it('PROPOSE binds the version: DPK@v1 admitted, the digest an approval will sign, dependencies reaching the DEC, immutability', async () => {
    const r = await propose(packageId, v);
    expect(r.proposal.versionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.proposal.baselineRunId).toBe(controlId);
    expect(r.proposal.syntheticState).toBe(true);
    const row = (await sql<Record<string, unknown>>`select * from decision.package_versions where package_id = ${packageId}::uuid and version = ${v}`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(row['state']).toBe('proposed');
    expect(row['version_digest']).toBe(r.proposal.versionDigest);
    expect((await sql<{ d: string }>`select decision.version_digest(${packageId}::uuid, ${v}) d`.execute(h.su)).rows[0]?.d).toBe(r.proposal.versionDigest);
    expect((await sql<{ s: string }>`select state s from decision.packages_current where package_id = ${packageId}::uuid`.execute(h.su)).rows[0]?.s).toBe('proposed');
    const obj = (await sql<Record<string, unknown>>`select object_type, object_version, schema_ref, truth_state, synthetic_state, owning_component, method_ref, source_object_ids, content_digest
      from objects.canonical_objects where object_id = ${packageId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(obj['object_type']).toBe('DPK');
    expect(Number(obj['object_version'])).toBe(v);
    expect(obj['schema_ref']).toBe('DPK@v1');
    expect(obj['truth_state']).toBe('asserted');
    expect(obj['synthetic_state']).toBe(true);
    expect(obj['owning_component']).toBe('CP-DEC-01');
    expect(obj['method_ref']).toBe('decision-package@1.0.0');
    expect(obj['content_digest']).toBe(row['header_digest']);
    expect((obj['source_object_ids'] as string[])).toContain(`DEC:${decisionId}@1`);
    expect((obj['source_object_ids'] as string[])).toContain(`SIM:${rerouteId}@1`);
    // the DEC now rests on the runs and the evidence the options cite — in Phase 3's own table
    // (the 'strategy' row is the DEC's own rests_on from Phase 3's declaration — the OBJ)
    const deps = (await sql<{ k: string; id: string }>`select depends_on_kind k, depends_on_id::text id from graph.dependencies where dependent_object_id = ${decisionId}::uuid and dependent_type = 'DEC' and depends_on_kind <> 'strategy' order by 1, 2`.execute(h.su)).rows;
    expect(deps.map((d) => d.k).sort()).toEqual(['evidence', 'run', 'run'].sort());
    expect(deps.filter((d) => d.k === 'run').map((d) => d.id).sort()).toEqual([controlId, rerouteId].sort());
    // immutable: no option, no terms, no choice into a proposed version; no direct UPDATE or DELETE of its content
    expect(await status(option(packageId, v, { key: 'late', title: 'Too late', kind: 'intervention', consequences: [], unsimulatedReason: 'proposed already' }))).toBe(409);
    expect(await message(terms(packageId, v, validTerms()))).toMatch(/immutable/);
    expect(await message(choice(packageId, v, validChoice({ rationale: 'A different choice after proposal must be a new version.' })))).toMatch(/immutable/);
    expect(await status(propose(packageId, v))).toBe(409);
    await expect(sql`update decision.package_versions set choice = '{}'::jsonb where package_id = ${packageId}::uuid and version = ${v}`.execute(h.su)).rejects.toThrow(/proposed and immutable/);
    await expect(sql`update decision.package_versions set state = 'committed' where package_id = ${packageId}::uuid and version = ${v}`.execute(h.su)).rejects.toThrow(/not a workflow transition/);
    await expect(sql`delete from decision.package_versions where package_id = ${packageId}::uuid and version = ${v}`.execute(h.su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from decision.options where package_id = ${packageId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
    await expect(sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, set_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${packageId}::uuid, ${v}, 'smuggled', 'Smuggled in', 'intervention', '[]'::jsonb, false, 'smuggled after proposal', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su)).rejects.toThrow(/not an open draft/);
  });

  it('one common baseline: options whose simulated consequences rest on different control runs are refused at proposal', async () => {
    const d = await declare({ decisionObjectId: decisionId, title: 'Mixed baselines', statement: 'a package whose options rest on two controls', owner: owner.principalId });
    const pkg = d.package.packageId;
    const v2 = (await open(pkg)).version.version;
    await option(pkg, v2, { key: 'status-quo', title: 'Do nothing (no shock)', kind: 'status_quo', consequences: [{ kind: 'run', id: control2Id }] });
    await option(pkg, v2, { key: 'reroute', title: 'Reroute (shocked control)', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteId }] });
    await terms(pkg, v2, validTerms());
    await choice(pkg, v2, validChoice());
    expect(await message(propose(pkg, v2))).toMatch(/2 different baselines/);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_id = ${pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
    expect((await sql<{ s: string }>`select state s from decision.package_versions where package_id = ${pkg}::uuid and version = ${v2}`.execute(h.su)).rows[0]?.s).toBe('draft');
    // a package compares at least two options, exactly one of them the status quo
    const d2 = await declare({ decisionObjectId: decisionId, title: 'One option', statement: 'a menu of one', owner: owner.principalId });
    const v3 = (await open(d2.package.packageId)).version.version;
    await option(d2.package.packageId, v3, { key: 'reroute', title: 'Reroute', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteId }] });
    await terms(d2.package.packageId, v3, validTerms());
    await choice(d2.package.packageId, v3, validChoice());
    expect(await message(propose(d2.package.packageId, v3))).toMatch(/at least two options/);
    await option(d2.package.packageId, v3, { key: 'air', title: 'Air bridge', kind: 'intervention', consequences: [{ kind: 'run', id: airId }] });
    expect(await message(propose(d2.package.packageId, v3))).toMatch(/exactly one option is the explicit status quo/);
    await decisions.withdraw(h.req(owner, 'decision.package.withdraw', 'DPK', d2.package.packageId, 'decision'), T(), D(), d2.package.packageId, { payload: { reason: 'fixture probe' } });
    expect((await sql<{ s: string }>`select state s from decision.packages_current where package_id = ${d2.package.packageId}::uuid`.execute(h.su)).rows[0]?.s).toBe('withdrawn');
    expect(await message(open(d2.package.packageId))).toMatch(/package is withdrawn/);
  });
});

/* ═════════ dissent, new versions, reads ═════════ */
describe('P6-M1 · F3 (dissent) and the version lineage — a different choice is a new version', () => {
  it('a named human dissents on their own behalf, before commitment; the record is append-only and survives everything after', async () => {
    const r = await dissent(packageId, 1, { position: 'against the reroute', rationale: 'The Cape adds fourteen days we do not have before the February build.', citation: { kind: 'run', id: airId } });
    expect(r.dissent.dissentId).toMatch(/^[0-9a-f-]{36}$/);
    const rows = (await sql<Record<string, unknown>>`select * from decision.dissent where package_id = ${packageId}::uuid`.execute(h.su)).rows;
    expect(rows.length).toBe(1);
    expect(String(rows[0]?.['principal_id'])).toBe(approver.principalId);
    expect((rows[0]?.['citation'] as { id: string; digest: string }).id).toBe(airId);
    await expect(sql`delete from decision.dissent where package_id = ${packageId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
    await expect(sql`update decision.dissent set position = 'for' where package_id = ${packageId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
    // the executive and the authority may dissent; the owner may too; the agent may not (asserted above)
    await dissent(packageId, 1, { position: 'reservation', rationale: 'The rationale does not mention the air-bridge premium explicitly.' }, executive);
    await dissent(packageId, 1, { position: 'reservation', rationale: 'The deadline leaves no margin for a second review before commitment.' }, authority);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.dissent where package_id = ${packageId}::uuid`.execute(h.su)).rows[0]?.n).toBe('3');
  });

  it('a new version carries the terms and options forward but NEVER the choice; proposing it supersedes the earlier proposal', async () => {
    const o = await open(packageId, { carryFrom: 1 });
    expect(o.version.version).toBe(2);
    const v2 = (await sql<Record<string, unknown>>`select * from decision.package_versions where package_id = ${packageId}::uuid and version = 2`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(v2['state']).toBe('draft');
    expect(v2['supersedes']).toBe(1);
    expect(v2['choice']).toBeNull();
    expect((v2['objectives'] as string[])).toEqual([objectiveId]);
    expect((await sql<{ k: string }>`select key k from decision.options where package_id = ${packageId}::uuid and version = 2 order by 1`.execute(h.su)).rows.map((x) => x.k)).toEqual(['reroute', 'status-quo', 'wait']);
    expect(await message(propose(packageId, 2))).toMatch(/the choice is what is proposed/);
    await choice(packageId, 2, validChoice({ option_key: 'status-quo', rationale: 'On reflection, waiting one sailing costs less than the reroute premium.' }));
    const r = await propose(packageId, 2);
    const v1row = (await sql<{ s: string; d: string }>`select state s, version_digest d from decision.package_versions where package_id = ${packageId}::uuid and version = 1`.execute(h.su)).rows[0];
    expect(v1row?.s).toBe('superseded');
    expect(v1row?.d).not.toBe(r.proposal.versionDigest);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_id = ${packageId}::uuid`.execute(h.su)).rows[0]?.n).toBe('2');
    expect((await sql<{ s: string }>`select supersedes s from objects.canonical_objects where object_id = ${packageId}::uuid and object_version = '2'`.execute(h.su)).rows[0]?.s).toBe(`DPK:${packageId}@1`);
    // v1's dissent is still there
    expect((await sql<{ n: string }>`select count(*)::text n from decision.dissent where package_id = ${packageId}::uuid and version = 1`.execute(h.su)).rows[0]?.n).toBe('3');
  });

  it('reads: the owner, approver, authority, executive and agent read; the simulation operator does not; projections rebuild clean', async () => {
    for (const p of [owner, approver, authority, executive, agent]) {
      const g = await get(packageId, p);
      expect(g.package['state']).toBe('proposed');
      expect(g.package.versions.length).toBe(2);
      expect(g.package.versions[0]?.options.length).toBe(3);
      expect(g.package.versions[0]?.dissent.length).toBe(3);
      expect((g.package['decision'] as Record<string, unknown>)['object_type']).toBe('DEC');
    }
    expect(await status(get(packageId, operator))).toBe(403);
    const list = await decisions.list(h.req(executive, 'decision.read', 'DPK', null, 'decision'), T(), D()) as { packages: Array<Record<string, unknown>> };
    expect(list.packages.length).toBe(3);
    const rb = await decisions.rebuild(h.req(owner, 'decision.read', 'DPK', null, 'decision'), T(), D()) as { projections: Array<{ projection: string; mismatched: string }> };
    expect(rb.projections.map((p) => p.mismatched)).toEqual(['0', '0']);
  });

  it('the canonical write action binds DPK to decision.package.propose and nothing else; the seven roles and DPK@v1 are registered', async () => {
    expect((await sql<{ t: string[] }>`select object_types t from observation.canonical_write_actions where action = 'decision.package.propose'`.execute(h.su)).rows[0]?.t).toEqual(['DPK']);
    const roles = (await sql<{ c: string }>`select code c from identity.roles where code in ('decision_owner','decision_approver','decision_authority','executive','decision_agent','briefing_agent','reporting_agent') order by 1`.execute(h.su)).rows.map((r) => r.c);
    expect(roles).toEqual(['briefing_agent', 'decision_agent', 'decision_approver', 'decision_authority', 'decision_owner', 'executive', 'reporting_agent']);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.schema_registry where object_type = 'DPK' and schema_version = 'v1'`.execute(h.su)).rows[0]?.n).toBe('1');
    // the strategy graph's own port still admits nothing but OBJ/ASU/DEC/CMT/OUT — DPK is not among them
    expect((await sql<{ t: string[] }>`select object_types t from observation.canonical_write_actions where action = 'graph.strategy.declare'`.execute(h.su)).rows[0]?.t).not.toContain('DPK');
  });
});
