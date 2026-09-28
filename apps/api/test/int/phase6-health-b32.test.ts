/**
 * CP-6 B32 (migration 0089 §H, part `health`) — THE DECOMPOSABLE STRATEGIC HEALTH SCORE (F-P6-08; C-034, V00-T-099, V01-T-025,
 * V02-T-220/-221, V03-T-186, AI-56-004, ADR-018, PR-43-001..006, CAP-EO-05, AT-43, UX-43-001..006) — on a real database through the real
 * routes (the PDP, the pipeline, the ports), with the humans holding sessions of their own (the ports compare the acting principal).
 *
 * THE INPUTS are the INDICATOR BRANCH of the health input contract (executive.health_measure_inputs, 0089 §0) — the only input the score
 * reads. Three NORDWERK indicators are defined through the real route; their evaluations are PLANTED by the superuser (stated: the value,
 * the observation date and the instant it became known are the fixture — the evaluation route computes values from a series, and the
 * scene needs 52 → 42.72 transits and a supplier measure 9 days old); the decision world's corridor indicator is evaluated through the
 * REAL route (the branch end to end). The measure, risk and opportunity kinds (the graph and exposure parts' branches, unioned by the
 * integrator) are proven on the PURE composition (U1: executive.health_compose, no table read). Instants are the DATABASE clock's.
 *
 *   D1 · TWO PEOPLE: the executive proposes v1; the proposer approving their own (403, separation), a strategy owner approving (403 PDP),
 *        an agent-kind principal (403 human gate, the denial recorded), a person holding nothing (403), a second proposal while pending
 *        (409), a model whose weights do not sum to 1 (422), an unknown objective (404), a malformed intake (422); compute before any
 *        active definition (409) — the RECOVERY: the domain administrator approves, compute succeeds; again (409), unknown (404), the
 *        same model again (409).
 *   C1 · THE SCENE: NORDWERK's supply resilience 71 → 58 — drilling down shows the corridor component, its evidence and that the
 *        supplier measure is 9 days STALE (excluded, declared, its missing-data bounds); a MISSING measure declared; the execution
 *        dimension indeterminate at the first instant (the corridor indicator not yet known there) and the aggregate WITHHELD — then
 *        determinate; the decision links (the DEC resting on the objective); the changes raised (the band crossing and the move, the two
 *        determinacy changes); a restated corridor reading → 70.5 with the anti-gaming flags (restated_input, on_threshold) shown,
 *        gating nothing; the AS_OF replay at the first instant REPRODUCES it (the same inputs and result digests) and raises nothing.
 *   CH · THE CHANGES: acknowledge (a receipt; again 409; a person holding nothing 403); challenge (again 409); the challenger deciding
 *        (403, separation), the definition's approver deciding (403, separation), a strategy owner deciding (403 PDP), malformed (422),
 *        unknown (404); a third person dismisses; a withdrawal by another (403) and by the challenger; decided after (409); the restated
 *        change challenged and UPHELD — the snapshot stands as recorded.
 *   D2 · A SECOND VERSION: the weights and a band moved beyond the anti-gaming policy → flagged; approved without the review (422) and
 *        with it; the corridor's floor raised above its score → a CRITICAL FAILURE forces partial and the lowest band though the value
 *        clears the healthy floor; the comparison across versions REFUSED (409); the same-definition comparison with the indeterminate
 *        side withheld and the peer declared absent; unknown (404), malformed (422).
 *   D3 · REFUSAL OF A PROPOSAL: the proposer refusing their own (403), the administrator refuses it; the active version untouched; the
 *        next proposal takes the next number (the refused version stays visible).
 *   U1 · THE PURE COMPOSITION over the four input kinds: exact arithmetic, a lower_better risk, low confidence, a critical failure, an
 *        inconsistent direction, a missing opportunity making a dimension indeterminate and the aggregate NULL, a declared cadence
 *        stricter than the component's bound, the sensitivity at ±10 % weight.
 *
 * EACH CASE LOGS ONE `B32 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b32h-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let exec: ExecutiveController;
let executive: AuthenticatedPrincipal; let exec2: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal;
/** The three NORDWERK indicators (SYNTHETIC fixture values): corridor transits, days of inventory cover, supplier on-time %. */
let I1 = ''; let I2 = ''; let I3 = '';
/** A measure no branch provides on this branch — the component reads it and is declared MISSING. */
const MISSING_MEASURE = uuidv7();
let V1 = ''; let S1: Row = {}; let S2: Row = {}; let S3: Row = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B32 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20/B22 idiom). */
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
const dimOf = (snapshot: Row, key: string): Row => arr(obj(snapshot['result'])['dimensions']).find((d) => d['key'] === key) ?? {};
const compOf = (snapshot: Row, key: string): Row => arr(snapshot['components']).find((c) => c['key'] === key) ?? arr(obj(snapshot['result'])['components']).find((c) => c['key'] === key) ?? {};

/* ───────────── the routes (in process) ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'executive');
const propose = (as: AuthenticatedPrincipal, model: unknown, reason: string) => exec.proposeHealthDefinition(R(as, 'executive.health.definition.propose', 'HSD', null), T(), D(), { payload: { model, reason } as never }) as unknown as Promise<{ definition: Row }>;
const approve = (as: AuthenticatedPrincipal, id: string, payload: Row) => exec.approveHealthDefinition(R(as, 'executive.health.definition.approve', 'HSD', id), T(), D(), id, { payload }) as unknown as Promise<{ definition: Row }>;
const refuse = (as: AuthenticatedPrincipal, id: string, reason: string) => exec.refuseHealthDefinition(R(as, 'executive.health.definition.approve', 'HSD', id), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ definition: Row }>;
const definitions = (as: AuthenticatedPrincipal) => exec.listHealthDefinitions(R(as, 'executive.health.read', 'HSD', null), T(), D(), { payload: {} }) as unknown as Promise<{ definitions: Row[]; active: Row | null; pending: Row | null }>;
const compute = (as: AuthenticatedPrincipal, at?: string) => exec.computeHealthScore(R(as, 'executive.health.compute', 'HSS', null), T(), D(), { payload: at === undefined ? {} : { at } }) as unknown as Promise<{ snapshot: Row }>;
const snapshot = (as: AuthenticatedPrincipal, id: string) => exec.getHealthSnapshot(R(as, 'executive.health.read', 'HSS', id), T(), D(), id) as unknown as Promise<{ snapshot: Row }>;
const snapshots = (as: AuthenticatedPrincipal, payload: Row = {}) => exec.listHealthSnapshots(R(as, 'executive.health.read', 'HSS', null), T(), D(), { payload: payload as never }) as unknown as Promise<{ snapshots: Row[] }>;
const compare = (as: AuthenticatedPrincipal, payload: Row) => exec.compareHealthSnapshots(R(as, 'executive.health.read', 'HSS', null), T(), D(), { payload: payload as never }) as unknown as Promise<{ comparison: Row }>;
const changes = (as: AuthenticatedPrincipal, payload: Row = {}) => exec.listHealthChanges(R(as, 'executive.health.read', 'HSC', null), T(), D(), { payload: payload as never }) as unknown as Promise<{ changes: Row[] }>;
const acknowledge = (as: AuthenticatedPrincipal, id: string, note?: string) => exec.acknowledgeHealthChange(R(as, 'executive.health.change.acknowledge', 'HSC', id), T(), D(), id, { payload: note === undefined ? {} : { note } }) as unknown as Promise<{ change: Row }>;
const challenge = (as: AuthenticatedPrincipal, id: string, kind: string, statement: string) => exec.challengeHealthChange(R(as, 'executive.health.change.challenge', 'HSC', id), T(), D(), id, { payload: { kind, statement } }) as unknown as Promise<{ change: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason: string) => exec.withdrawHealthChallenge(R(as, 'executive.health.change.challenge', 'HSC', id), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ change: Row }>;
const decideChange = (as: AuthenticatedPrincipal, id: string, decision: string, note: string) => exec.decideHealthChange(R(as, 'executive.health.change.decide', 'HSC', id), T(), D(), id, { payload: { decision, note } }) as unknown as Promise<{ change: Row }>;

/** An indicator evaluation PLANTED (stated): the value, the observation date (the database's current_date − n) and when it became known. */
const plantEvaluation = async (indicatorId: string, value: number, observedDaysAgo: number, knownAgo: string) =>
  sql`insert into prediction.indicator_evaluations (evaluation_id, scope, tenant_id, domain_id, indicator_id, evaluated_at, known_at, observation_at, value, evidence_object_id, evidence_version, satisfied, streak, breached, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${indicatorId}::uuid, clock_timestamp(), clock_timestamp() - ${knownAgo}::interval, current_date - ${observedDaysAgo}::int, ${value},
              ${w.evd.id}::uuid, ${w.evd.version}, true, 0, false, ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(su)).rows[0]!.t.toISOString();
const deniedCount = async (action: string) => Number((await sql<{ n: string }>`select count(*)::text n from audit.audit_events where tenant_id = ${T()}::uuid and action = ${action} and outcome = 'denied'`.execute(su)).rows[0]!.n);

const BANDS = [{ key: 'healthy', min: 70 }, { key: 'watch', min: 50 }, { key: 'critical', min: 0 }];
/** v1: NORDWERK's supply resilience (corridor, inventory, supplier) and execution (the live corridor indicator, a commitment measure). */
const MODEL_V1 = (): Row => ({
  min_coverage: 0.7, change_points: 10, min_confidence: 0.5,
  dimensions: [
    { key: 'supply_resilience', label: 'Supply resilience', weight: 0.7, objective_ids: [w.objectiveId], bands: BANDS },
    { key: 'execution', label: 'Execution', weight: 0.3, objective_ids: [w.objectiveId], bands: BANDS },
  ],
  components: [
    { key: 'corridor_risk', label: 'Corridor transits (Bab el-Mandeb)', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I1, weight: 0.5, direction: 'higher_better', normalisation: { worst: 20, best: 60 }, stale_after_days: 14, critical: true, critical_below: 40 },
    { key: 'inventory_cover', label: 'Days of magnet inventory cover', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I2, weight: 0.3, direction: 'higher_better', normalisation: { worst: 0, best: 30 }, stale_after_days: 30 },
    { key: 'supplier_on_time', label: 'Supplier on-time delivery', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I3, weight: 0.2, direction: 'higher_better', normalisation: { worst: 50, best: 100 }, stale_after_days: 7 },
    { key: 'corridor_indicator_live', label: 'Corridor collapse indicator', dimension: 'execution', input_kind: 'indicator', input_id: w.indicatorId, weight: 0.7, direction: 'higher_better', normalisation: { worst: 20, best: 80 }, stale_after_days: 3650 },
    { key: 'commitment_delivery', label: 'Commitments delivered on time', dimension: 'execution', input_kind: 'measure', input_id: MISSING_MEASURE, weight: 0.3, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 30 },
  ],
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  exec = w.exec;
  executive = w.executive;
  exec2 = await h.humanWithSession(['executive'], 'b32h-executive-2');
  dadmin = await h.humanWithSession(['domain_admin'], 'b32h-domain-admin');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b32h-strategy-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b32h-analyst');
  roleless = await h.principalWith([], 'b32h-roleless');
  const define = async (description: string) => ((await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
    { payload: { seriesKey: w.seriesKey, description, comparator: '<', threshold: 30, consecutiveDays: 1, owner: w.twinOwner.principalId } })) as { indicator: { indicatorId: string } }).indicator.indicatorId;
  I1 = await define('SYNTHETIC NORDWERK corridor transits per day (Bab el-Mandeb)');
  I2 = await define('SYNTHETIC NORDWERK days of magnet inventory cover at Regensburg');
  I3 = await define('SYNTHETIC NORDWERK supplier on-time delivery percentage');
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B32 · the decomposable Strategic Health Score (0089 §H)', () => {
  it('D1 · TWO PEOPLE: proposed by one, refused to the proposer, the PDP and the human gate; the model validated whole; approved by another — compute recovers', async () => {
    // compute before any definition is active: the record's state (409) — the recovery follows the approval below
    await refused(compute(analyst), /^health score rejected \(no_definition\)/, 409, 'EYE-STA-002');
    // the model validated whole (the port, 422) and the objectives real (404); the intake (422)
    const bad = MODEL_V1(); (bad['dimensions'] as Row[])[1]!['weight'] = 0.2;
    await refused(propose(executive, bad, 'weights that do not sum to one'), /^health definition rejected: the dimension weights sum to 0\.9/, 422, 'EYE-REQ-001');
    const ghost = MODEL_V1(); (ghost['dimensions'] as Row[])[0]!['objective_ids'] = [uuidv7()];
    await refused(propose(executive, ghost, 'an objective that does not exist'), /^health definition rejected: no such objective /, 404, 'EYE-STA-001');
    await refused(propose(executive, [], 'a list is not a model'), /payload\.model is the score model/, 422, 'EYE-REQ-001');
    // the PDP: a person holding nothing; an agent-kind principal holding the role meets the human gate before any port (and the denial is recorded)
    expect((await refusal(propose(roleless, MODEL_V1(), 'a person holding no role'))).status).toBe(403);
    const deniedBefore = await deniedCount('executive.health.definition.propose');
    await refused(propose({ ...executive, kind: 'agent' } as AuthenticatedPrincipal, MODEL_V1(), 'an agent proposing weights'), /human gate: executive\.health\.definition\.propose requires a named human principal/, 403, 'EYE-WFL-002');
    expect(await deniedCount('executive.health.definition.propose'), 'the agent\'s attempt is recorded').toBe(deniedBefore + 1);
    // the proposal
    const p = (await propose(executive, MODEL_V1(), 'the first NORDWERK health model: supply resilience and execution')).definition;
    V1 = String(p['definition_id']);
    expect(p).toMatchObject({ version: 1, state: 'proposed', proposed_by: executive.principalId, basis_version: null, gaming_review_required: false, formula_version: 'shs-weighted-coverage@1' });
    expect(p['changed_sections']).toEqual(['dimensions', 'components', 'weights', 'thresholds']);
    expect(String(p['model_digest'])).toMatch(/^[0-9a-f]{64}$/);
    await refused(propose(strategyOwner, MODEL_V1(), 'a second proposal while one is pending'), /^health definition rejected \(pending\): proposal .* \(version 1\) awaits a decision/, 409, 'EYE-STA-002');
    // SEPARATION: the proposer holds the approver's role and is refused by the port; a strategy owner is refused by the PDP; an agent by the gate
    await refused(approve(executive, V1, { note: 'approving my own proposal' }), /^health definition rejected \(separation\): the proposer does not approve their own definition/, 403, 'EYE-AUT-001');
    expect((await refusal(approve(strategyOwner, V1, { note: 'a strategy owner approving' }))).status).toBe(403);
    await refused(approve({ ...dadmin, kind: 'agent' } as AuthenticatedPrincipal, V1, { note: 'an agent approving weights' }), /human gate: executive\.health\.definition\.approve/, 403, 'EYE-WFL-002');
    await refused(approve(dadmin, V1, { note: 'ok' }), /payload\.note says why/, 422, 'EYE-REQ-001');
    const a = (await approve(dadmin, V1, { note: 'reviewed with the supply chain lead: the weights and bands stand' })).definition;
    expect(a).toMatchObject({ definition_id: V1, state: 'active', approved_by: dadmin.principalId, proposed_by: executive.principalId, supersedes: null, superseded_definition_id: null });
    await refused(approve(exec2, V1, { note: 'approving an active version again' }), /^health definition rejected \(not_proposed\): definition .* is active/, 409, 'EYE-STA-002');
    await refused(approve(dadmin, uuidv7(), { note: 'an id that names no definition' }), /^health definition rejected: no such definition in this domain/, 404, 'EYE-STA-001');
    await refused(propose(strategyOwner, MODEL_V1(), 'the same model proposed again'), /^health definition rejected \(unchanged\): the model is unchanged from the active version 1/, 409, 'EYE-STA-002');
    const listed = await definitions(analyst);
    expect(listed.active).toMatchObject({ definition_id: V1, version: 1 });
    expect(listed.pending).toBeNull();
    // the record itself keeps the two people apart
    const sep = await refusal(sql`update executive.health_score_definitions set approved_by = proposed_by where definition_id = ${V1}::uuid`.execute(su));
    expect(sep.message).toMatch(/immutable|xhsd_separation/);
    sixEvidence('D1', { fault_trace: { no_definition: 409, weights: 422, objective: 404, own_approval: 403, pdp: 403, human_gate: 403, pending: 409, again: 409, unknown: 404, unchanged: 409 },
      watermark: { definition: V1, version: 1, model_digest: a['model_digest'] }, consumer_behaviour: { state: 'proposed → active', approved_by: 'domain_admin (not the proposer)' },
      operator_action: 'the executive proposes; the domain administrator approves', recovery: 'compute refused until a definition is active; recovers once approved (C1)', reconciliation: { active: 1, pending: 0 } });
  }, 300_000);

  it('C1 · THE SCENE: supply resilience 71 → 58 — the corridor component, its evidence, the supplier measure 9 days stale; the missing measure; the aggregate withheld then shown; changes raised; the replay reproduces', async () => {
    // the first instant's inputs (known four days ago): corridor 52 → 80, inventory 18 → 60, supplier 82.5 → 65 (observed nine days ago)
    await plantEvaluation(I1, 52, 4, '4 days');
    await plantEvaluation(I2, 18, 4, '4 days');
    await plantEvaluation(I3, 82.5, 9, '4 days');
    // the decision world's corridor indicator evaluated through the REAL route — known NOW (not at the first instant)
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId, 'prediction'), T(), D(), w.indicatorId, { payload: { knownAt: await dbInstant('1 second') } });
    const at1 = await dbInstant('3 days');
    S1 = (await compute(analyst, at1)).snapshot;
    expect(S1).toMatchObject({ kind: 'current', definition_id: V1, definition_version: 1, status: 'indeterminate', aggregate: null, prior_snapshot_id: null, replay_of: null, reproduced: null, changes: [] });
    const sup1 = dimOf(S1, 'supply_resilience');
    expect(sup1).toMatchObject({ value: 71, band: 'healthy', status: 'complete', coverage: 1 });
    // the execution dimension: the live indicator was not yet known at the first instant, the commitment measure has no input at all
    const exe1 = dimOf(S1, 'execution');
    expect(exe1).toMatchObject({ value: null, band: null, status: 'indeterminate', coverage: 0 });
    expect(compOf(S1, 'corridor_indicator_live')).toMatchObject({ state: 'missing', reason: 'the input has no value at or before the instant (never observed)' });
    expect(String(compOf(S1, 'commitment_delivery')['reason'])).toMatch(/^no measure input .* in the contract at the instant/);
    expect(arr(obj(S1['result'])['reasons']).map(String)).toContain('the aggregate is withheld: a dimension is indeterminate');
    // the second instant (now): the corridor falls to 42.72 (→ 56.8); the supplier measure is now 9 days old — STALE, excluded, declared
    await plantEvaluation(I1, 42.72, 0, '1 minute');
    S2 = (await compute(analyst)).snapshot;
    expect(S2).toMatchObject({ kind: 'current', prior_snapshot_id: S1['snapshot_id'], status: 'partial' });
    expect(typeof S2['aggregate']).toBe('number');
    const sup2 = dimOf(S2, 'supply_resilience');
    expect(sup2).toMatchObject({ value: 58, band: 'watch', status: 'partial', coverage: 0.8, trend: { prior_value: 71, delta: -13 } });
    expect(sup2['bounds']).toEqual({ if_excluded_at_0: 46.4, if_excluded_at_100: 66.4 });
    // DRILL DOWN (the decomposed read): the corridor component, its evidence; the supplier 9 days stale; the missing commitment measure
    const d2 = (await snapshot(strategyOwner, String(S2['snapshot_id']))).snapshot;
    expect(d2['status']).toBe('partial');
    const corridor = compOf(d2, 'corridor_risk');
    expect(corridor).toMatchObject({ state: 'included', value: 42.72, normalised: 56.8, weight: 0.5, contribution: 35.5, trend: -23.2, critical: true, critical_failure: false, input_id: I1, stale: false });
    expect(arr(corridor['evidence'])[0]).toMatchObject({ object_id: w.evd.id, version: w.evd.version });
    expect(arr(corridor['decision_links']).map((l) => l['decision_id'])).toContain(w.decisionId);
    expect(obj(corridor['lineage'])).toMatchObject({ input_kind: 'indicator', input_id: I1 });
    expect(compOf(d2, 'inventory_cover')).toMatchObject({ state: 'included', normalised: 60, contribution: 22.5 });
    const supplier = compOf(d2, 'supplier_on_time');
    expect(supplier).toMatchObject({ state: 'stale', stale: true, missing: false, normalised: null, contribution: null, reason: 'observed 9 days before the instant; stale after 7 days' });
    expect(Math.floor(Number(supplier['freshness_days']))).toBe(9);
    // the missing-data analysis on the stale component: where the dimension could lie had it been current
    expect(obj(supplier['sensitivity'])).toMatchObject({ if_0: 46.4, if_100: 66.4 });
    expect(compOf(d2, 'commitment_delivery')).toMatchObject({ state: 'missing', missing: true, normalised: null });
    expect(compOf(d2, 'corridor_indicator_live')).toMatchObject({ state: 'included', stale: false });
    expect(obj(obj(d2['result'])['counts'])).toMatchObject({ components: 5, included: 3, stale: 1, missing: 1, inconsistent: 0, no_confidence_input: 5 });
    expect(d2['peer']).toEqual({ peer: null, reason: 'no peer input in this product' });
    // the indicator branch END TO END: the live indicator's row read from the contract, as the snapshot recorded it
    expect(arr(d2['inputs']).map((i) => i['input_id'])).toEqual(expect.arrayContaining([I1, I2, I3, w.indicatorId]));
    expect(arr(d2['inputs']).find((i) => i['input_id'] === w.indicatorId)).toMatchObject({ input_kind: 'indicator', direction: 'higher_better', evidence: [expect.objectContaining({ object_id: expect.any(String) })] });
    // THE CHANGES: the aggregate and the execution dimension become determinate; supply resilience crosses healthy → watch and moves 13 points
    const raised = arr(S2['changes']);
    expect(raised.map((c) => c['subject']).sort()).toEqual(['aggregate', 'dimension:execution', 'dimension:supply_resilience']);
    expect(raised.find((c) => c['subject'] === 'dimension:supply_resilience')).toMatchObject({ from_value: 71, to_value: 58, delta: -13, from_band: 'healthy', to_band: 'watch', triggers: ['band_crossing', 'move'],
      direction: 'unfavourable', gaming_flags: [], state: 'raised', definition_approved_by: dadmin.principalId, authorizes_action: false });
    expect(raised.find((c) => c['subject'] === 'aggregate')).toMatchObject({ from_value: null, triggers: ['determinacy'], direction: 'determinacy' });
    // a RESTATED corridor reading (the same observation date, another value, known after the second instant) → 70.5: favourable, flagged
    await plantEvaluation(I1, 50.72, 0, '0 seconds');
    S3 = (await compute(executive)).snapshot;
    expect(dimOf(S3, 'supply_resilience')).toMatchObject({ value: 70.5, band: 'healthy' });
    const fav = arr(S3['changes']);
    expect(fav.map((c) => c['subject'])).toEqual(['dimension:supply_resilience']);
    expect(fav[0]).toMatchObject({ from_value: 58, to_value: 70.5, direction: 'favourable', triggers: ['band_crossing', 'move'] });
    const flags = arr(fav[0]!['gaming_flags']);
    expect(flags.map((f) => f['flag']).sort()).toEqual(['on_threshold', 'restated_input']);
    expect(flags.find((f) => f['flag'] === 'restated_input')).toMatchObject({ component: 'corridor_risk', from_value: 42.72, to_value: 50.72 });
    expect(flags.find((f) => f['flag'] === 'on_threshold')).toMatchObject({ band: 'healthy', floor: 70, value: 70.5 });
    // TEMPORAL REPLAY at the first instant: an as_of snapshot that REPRODUCES the first (the same inputs and result digests) and raises nothing
    const replay = (await compute(analyst, String(S1['at']))).snapshot;
    expect(replay).toMatchObject({ kind: 'as_of', replay_of: S1['snapshot_id'], reproduced: true, inputs_digest: S1['inputs_digest'], result_digest: S1['result_digest'], changes: [], status: 'indeterminate', aggregate: null });
    // a future instant is the caller's error; the PDP (a person holding nothing)
    await refused(compute(analyst, new Date(Date.now() + 86_400_000).toISOString()), /^health score rejected: the instant .* is after now/, 422, 'EYE-REQ-001');
    expect((await refusal(compute(roleless))).status).toBe(403);
    // the snapshots are append-only; the indeterminate one carries no number in the record itself
    expect((await refusal(sql`update executive.health_score_snapshots set aggregate = 50 where snapshot_id = ${String(S1['snapshot_id'])}::uuid`.execute(su))).message).toMatch(/append-only/);
    const listed = (await snapshots(analyst, { definitionId: V1 })).snapshots;
    // newest instant first: the restated, the second, then the first instant's replay (computed later) before the first itself
    expect(listed.map((s) => s['snapshot_id'])).toEqual([S3['snapshot_id'], S2['snapshot_id'], replay['snapshot_id'], S1['snapshot_id']]);
    expect(listed.map((s) => s['kind'])).toEqual(['current', 'current', 'as_of', 'current']);
    expect(listed.find((s) => s['snapshot_id'] === S1['snapshot_id'])).toMatchObject({ status: 'indeterminate', aggregate: null });
    sixEvidence('C1', { fault_trace: { stale: 'supplier_on_time 9 d (bound 7)', missing: 'commitment_delivery (no measure input)', future_instant: 422, pdp: 403 },
      watermark: { s1: S1['snapshot_id'], s2: S2['snapshot_id'], s3: S3['snapshot_id'], s2_inputs_digest: S2['inputs_digest'] },
      consumer_behaviour: { supply_resilience: '71 → 58 → 70.5', aggregate: ['withheld', S2['aggregate'], S3['aggregate']], flags: flags.map((f) => f['flag']) },
      operator_action: 'the analyst and the executive compute; the strategy owner drills down', recovery: 'the as_of replay at the first instant reproduces it (digests equal)',
      reconciliation: { changes_s2: raised.length, changes_s3: fav.length, replay: replay['snapshot_id'] } });
  }, 300_000);

  it('CH · THE CHANGES: acknowledged (a receipt), challenged, decided by neither the challenger nor the approver; a withdrawal; the restated change upheld — the snapshot stands', async () => {
    const all = (await changes(analyst, { snapshotId: S2['snapshot_id'] })).changes;
    const supply = String(all.find((c) => c['subject'] === 'dimension:supply_resilience')!['change_id']);
    const aggregate = String(all.find((c) => c['subject'] === 'aggregate')!['change_id']);
    expect(arr(all.find((c) => c['change_id'] === supply)!['events']).map((e) => e['event'])).toEqual(['change.raised']);
    // ACKNOWLEDGE: a receipt; again 409; a person holding nothing 403; unknown 404
    const ack = (await acknowledge(strategyOwner, supply, 'seen: the corridor reading drives it')).change;
    expect(ack).toMatchObject({ state: 'acknowledged', acknowledged_by: strategyOwner.principalId, authorizes_action: false });
    await refused(acknowledge(executive, supply), /^health change rejected \(not_raised\): change .* is acknowledged/, 409, 'EYE-STA-002');
    expect((await refusal(acknowledge(roleless, aggregate))).status).toBe(403);
    await refused(acknowledge(strategyOwner, uuidv7()), /^health change rejected: no such change in this domain/, 404, 'EYE-STA-001');
    // CHALLENGE by the second executive; a second challenge 409; malformed 422
    await refused(challenge(exec2, supply, 'mood', 'not a kind of challenge'), /payload\.kind is one of/, 422, 'EYE-REQ-001');
    const ch = (await challenge(exec2, supply, 'input', 'the corridor reading comes from a single AIS feed; one-sided evidence')).change;
    expect(ch).toMatchObject({ state: 'challenged', challenged_by: exec2.principalId, challenge_kind: 'input', acknowledged_by: strategyOwner.principalId });
    await refused(challenge(analyst, supply, 'weight', 'a second challenge on the same change'), /^health change rejected \(not_open\): change .* is challenged; a change carries one challenge/, 409, 'EYE-STA-002');
    // SEPARATION: the challenger (403) and the definition's approver (403) are refused by the port; a strategy owner by the PDP
    await refused(decideChange(exec2, supply, 'upheld', 'deciding my own challenge'), /^health change rejected \(separation\): the challenger does not decide their own challenge/, 403, 'EYE-AUT-001');
    await refused(decideChange(dadmin, supply, 'dismissed', 'the approver deciding on the scores'), /^health change rejected \(separation\): the approver of definition version 1 does not decide/, 403, 'EYE-AUT-001');
    expect((await refusal(decideChange(strategyOwner, supply, 'dismissed', 'a strategy owner deciding'))).status).toBe(403);
    await refused(decideChange(executive, supply, 'maybe', 'neither upheld nor dismissed'), /payload\.decision is upheld or dismissed/, 422, 'EYE-REQ-001');
    await refused(decideChange(executive, uuidv7(), 'dismissed', 'an id that names no change'), /^health change rejected: no such change in this domain/, 404, 'EYE-STA-001');
    const dismissed = (await decideChange(executive, supply, 'dismissed', 'the AIS feed is corroborated by the port calls; the fall stands')).change;
    expect(dismissed).toMatchObject({ state: 'dismissed', decided_by: executive.principalId, challenged_by: exec2.principalId, what_follows: 'the change stands as recorded' });
    await refused(decideChange(executive, supply, 'upheld', 'deciding again'), /^health change rejected \(not_challenged\): change .* is dismissed/, 409, 'EYE-STA-002');
    // the record itself refuses the challenger as decider
    expect((await refusal(sql`update executive.health_score_changes set decided_by = challenged_by where change_id = ${supply}::uuid`.execute(su))).message).toMatch(/never rewritten|xhsc_separation/);
    // WITHDRAWAL: the aggregate's determinacy change challenged by the analyst; another person may not withdraw it; the analyst does
    await challenge(analyst, aggregate, 'interpretation', 'the aggregate should not be shown while the commitment measure is missing');
    await refused(withdraw(strategyOwner, aggregate, 'withdrawing someone else\'s challenge'), /^health change rejected: a challenge is withdrawn by its challenger/, 403, 'EYE-AUT-001');
    const wd = (await withdraw(analyst, aggregate, 'the coverage and the missing measure are shown beside it')).change;
    expect(wd).toMatchObject({ state: 'withdrawn', challenged_by: analyst.principalId });
    await refused(decideChange(executive, aggregate, 'upheld', 'deciding a withdrawn challenge'), /^health change rejected \(not_challenged\)/, 409, 'EYE-STA-002');
    // THE RESTATED CHANGE: challenged and UPHELD by a third person — the snapshot stands as recorded (append-only)
    const restated = String(arr(S3['changes'])[0]!['change_id']);
    await challenge(exec2, restated, 'input', 'the corridor reading was restated for the same day without a stated reason');
    const upheld = (await decideChange(executive, restated, 'upheld', 'the restatement is unexplained; the measure owner corrects it')).change;
    expect(upheld).toMatchObject({ state: 'upheld', gaming_flags: expect.arrayContaining([expect.objectContaining({ flag: 'restated_input' })]) });
    expect(String(upheld['what_follows'])).toMatch(/the snapshot stands as recorded .* a new definition version/);
    expect((await snapshot(analyst, String(S3['snapshot_id']))).snapshot).toMatchObject({ aggregate: S3['aggregate'], status: S3['status'] });
    const log = (await changes(analyst, { snapshotId: S2['snapshot_id'] })).changes.find((c) => c['change_id'] === supply)!;
    expect(arr(log['events']).map((e) => e['event'])).toEqual(['change.raised', 'change.acknowledged', 'change.challenged', 'change.dismissed']);
    sixEvidence('CH', { fault_trace: { again: 409, pdp: 403, unknown: 404, challenger_decides: 403, approver_decides: 403, withdraw_by_other: 403, decided_after_withdrawal: 409 },
      watermark: { supply, aggregate, restated }, consumer_behaviour: { supply: 'raised → acknowledged → challenged → dismissed', aggregate: 'challenged → withdrawn', restated: 'challenged → upheld' },
      operator_action: 'the strategy owner acknowledges; the second executive and the analyst challenge; the executive decides', recovery: 'an upheld challenge routes to a corrected input or a new version; the snapshot is never rewritten',
      reconciliation: { events: arr(log['events']).length } });
  }, 300_000);

  it('D2 · A SECOND VERSION: flagged for anti-gaming review; a critical failure forces partial and the lowest band; comparison across versions refused, within one allowed with the indeterminate side withheld', async () => {
    const m = MODEL_V1();
    const dims = m['dimensions'] as Row[];
    dims[0]!['bands'] = [{ key: 'healthy', min: 55 }, { key: 'watch', min: 50 }, { key: 'critical', min: 0 }];
    m['components'] = [
      { key: 'corridor_risk', label: 'Corridor transits (Bab el-Mandeb)', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I1, weight: 0.8, direction: 'higher_better', normalisation: { worst: 20, best: 60 }, stale_after_days: 14, critical: true, critical_below: 80 },
      { key: 'inventory_cover', label: 'Days of magnet inventory cover', dimension: 'supply_resilience', input_kind: 'indicator', input_id: I2, weight: 0.2, direction: 'higher_better', normalisation: { worst: 0, best: 30 }, stale_after_days: 30 },
      { key: 'corridor_indicator_live', label: 'Corridor collapse indicator', dimension: 'execution', input_kind: 'indicator', input_id: w.indicatorId, weight: 1, direction: 'higher_better', normalisation: { worst: 20, best: 80 }, stale_after_days: 3650 },
    ];
    const p = (await propose(executive, m, 'v2: the corridor weighted up, the stale supplier and the missing measure removed')).definition;
    const V2 = String(p['definition_id']);
    expect(p).toMatchObject({ version: 2, basis_version: 1, gaming_review_required: true });
    expect(p['changed_sections']).toEqual(expect.arrayContaining(['components', 'weights', 'thresholds']));
    const reasons = arr(p['gaming_reasons']);
    expect(reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'weight_move', key: 'corridor_risk', from: 0.5, to: 0.8 }),
      expect.objectContaining({ rule: 'weight_move', key: 'corridor_indicator_live', from: 0.7, to: 1 }),
      expect.objectContaining({ rule: 'threshold_move', key: 'supply_resilience', threshold: 'healthy', from: 70, to: 55 }),
    ]));
    expect(reasons.some((r) => r['key'] === 'inventory_cover'), 'a 0.1 move is inside the policy').toBe(false);
    await refused(approve(dadmin, V2, { note: 'approving without the anti-gaming review' }), /^health definition rejected \(gaming_review\): version 2 moves .*corridor_risk weight_move/, 422, 'EYE-REQ-001');
    const a = (await approve(dadmin, V2, { note: 'the corridor dominates the chain; approved', gaming_review: 'the healthy floor moved 15 points: checked against the 2024 disruption — not a cosmetic move' })).definition;
    expect(a).toMatchObject({ state: 'active', version: 2, supersedes: 1, superseded_definition_id: V1 });
    expect((await definitions(analyst)).definitions.find((d) => d['definition_id'] === V1)).toMatchObject({ state: 'superseded' });
    // the critical failure: the corridor scores 76.8, below its new floor 80 → the dimension PARTIAL and in the LOWEST band although 73.44 clears 55
    const S4 = (await compute(analyst)).snapshot;
    expect(S4).toMatchObject({ definition_version: 2, kind: 'current', prior_snapshot_id: null, status: 'partial', changes: [] });
    const sup = dimOf(S4, 'supply_resilience');
    expect(sup).toMatchObject({ value: 73.44, coverage: 1, status: 'partial', band: 'critical', critical_failures: ['corridor_risk'] });
    expect(String(sup['band_basis'])).toMatch(/never averaged away/);
    expect(dimOf(S4, 'execution')).toMatchObject({ status: 'complete', coverage: 1 });
    // COMPARISON: across versions refused (409); within v1 the indeterminate side withheld; the peer declared absent
    await refused(compare(analyst, { snapshot_id: S4['snapshot_id'], baseline_id: S1['snapshot_id'] }), /^health comparison rejected \(definition\): the snapshot was computed under definition version 2, the baseline under version 1/, 409, 'EYE-STA-002');
    const cmp = (await compare(analyst, { snapshot_id: S2['snapshot_id'] })).comparison;
    expect(obj(cmp['baseline'])['snapshot_id'], 'the default baseline: the first current snapshot of the definition').toBe(S1['snapshot_id']);
    expect(cmp['aggregate']).toMatchObject({ delta: null, withheld: 'the baseline is indeterminate here — not compared' });
    expect(arr(cmp['dimensions']).find((d) => d['key'] === 'supply_resilience')).toMatchObject({ from: 71, to: 58, delta: -13, from_band: 'healthy', to_band: 'watch' });
    expect(cmp['peer']).toEqual({ peer: null, reason: 'no peer input in this product' });
    const cmp2 = (await compare(analyst, { snapshot_id: S3['snapshot_id'], baseline_id: S2['snapshot_id'] })).comparison;
    expect(cmp2['aggregate']).toMatchObject({ qualified: expect.stringMatching(/^partial on the snapshot/) });
    await refused(compare(analyst, { snapshot_id: uuidv7() }), /^health comparison rejected: no such compared snapshot in this domain/, 404, 'EYE-STA-001');
    await refused(compare(analyst, { snapshot_id: 'nope' }), /payload\.snapshot_id names the snapshot compared/, 422, 'EYE-REQ-001');
    sixEvidence('D2', { fault_trace: { unreviewed: 422, across_versions: 409, unknown: 404, malformed: 422 }, watermark: { v2: V2, s4: S4['snapshot_id'] },
      consumer_behaviour: { gaming_reasons: reasons.map((r) => `${String(r['key'])} ${String(r['rule'])}`), supply: 'value 73.44, band critical (critical failure)' },
      operator_action: 'the executive proposes v2; the domain administrator records the anti-gaming review and approves', recovery: 'the unreviewed approval refused; approved with the review',
      reconciliation: { comparison_within_v1: cmp['dimensions'], peer: cmp['peer'] } });
  }, 300_000);

  it('D3 · A PROPOSAL REFUSED by a second person; the proposer cannot refuse their own; the active version untouched; the refused number stays taken', async () => {
    const m = MODEL_V1(); (m['dimensions'] as Row[])[0]!['label'] = 'Supply resilience (NORDWERK)';
    const p = (await propose(executive, m, 'v3: back to the v1 weights with a clearer label')).definition;
    const V3 = String(p['definition_id']);
    expect(p).toMatchObject({ version: 3, basis_version: 2 });
    await refused(refuse(executive, V3, 'refusing my own proposal'), /^health definition rejected \(separation\): the proposer does not refuse their own definition/, 403, 'EYE-AUT-001');
    await refused(refuse(dadmin, V3, 'no'), /payload\.reason says why the definition is refused/, 422, 'EYE-REQ-001');
    const r = (await refuse(dadmin, V3, 'v2 was approved yesterday; revisit after the quarter')).definition;
    expect(r).toMatchObject({ state: 'refused', refused_by: dadmin.principalId, version: 3 });
    const listed = await definitions(analyst);
    expect(listed.active).toMatchObject({ version: 2 });
    expect(listed.pending).toBeNull();
    expect(listed.definitions.map((d) => [d['version'], d['state']])).toEqual([[3, 'refused'], [2, 'active'], [1, 'superseded']]);
    const next = (await propose(strategyOwner, m, 'v4: the clearer label, proposed again by the strategy owner')).definition;
    expect(next).toMatchObject({ version: 4, basis_version: 2, proposed_by: strategyOwner.principalId });
    sixEvidence('D3', { fault_trace: { own_refusal: 403, reason: 422 }, watermark: { v3: V3, v4: next['definition_id'] }, consumer_behaviour: { v3: 'refused', active: 2 },
      operator_action: 'the domain administrator refuses v3', recovery: 'a new proposal after the refusal (v4)', reconciliation: { versions: listed.definitions.length } });
  }, 120_000);

  it('U1 · THE PURE COMPOSITION over the four input kinds (indicator, measure, risk, opportunity): exact arithmetic, direction, confidence, criticality, missing and inconsistent inputs, a declared cadence, sensitivity', async () => {
    const O = uuidv7(); const id = { ind: uuidv7(), msr: uuidv7(), rsk: uuidv7(), opp: uuidv7(), g1: uuidv7(), g2: uuidv7() };
    const model = {
      min_coverage: 0.7, change_points: 10, min_confidence: 0.5,
      dimensions: [{ key: 'resilience', label: 'Resilience', weight: 0.6, objective_ids: [O], bands: BANDS }, { key: 'growth', label: 'Growth', weight: 0.4, objective_ids: [O], bands: BANDS }],
      components: [
        { key: 'ind', label: 'An indicator', dimension: 'resilience', input_kind: 'indicator', input_id: id.ind, weight: 0.25, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 30 },
        { key: 'msr', label: 'A measure', dimension: 'resilience', input_kind: 'measure', input_id: id.msr, weight: 0.25, direction: 'higher_better', normalisation: { worst: 0, best: 50 }, stale_after_days: 30 },
        { key: 'rsk', label: 'A risk', dimension: 'resilience', input_kind: 'risk', input_id: id.rsk, weight: 0.25, direction: 'lower_better', normalisation: { worst: 100, best: 0 }, stale_after_days: 30, critical: true, critical_below: 30 },
        { key: 'opp', label: 'An opportunity', dimension: 'resilience', input_kind: 'opportunity', input_id: id.opp, weight: 0.25, direction: 'higher_better', normalisation: { worst: 0, best: 10 }, stale_after_days: 30 },
        { key: 'g1', label: 'A growth measure', dimension: 'growth', input_kind: 'measure', input_id: id.g1, weight: 0.5, direction: 'higher_better', normalisation: { worst: 0, best: 50 }, stale_after_days: 30 },
        { key: 'g2', label: 'A growth opportunity', dimension: 'growth', input_kind: 'opportunity', input_id: id.g2, weight: 0.5, direction: 'higher_better', normalisation: { worst: 0, best: 10 }, stale_after_days: 30 },
      ],
    };
    const AT = '2026-09-28T12:00:00.000Z'; const day = (n: number) => new Date(Date.parse(AT) - n * 86_400_000).toISOString();
    const row = (kind: string, inputId: string, value: number, direction: string, observedDaysAgo: number, extra: Row = {}) => ({ input_kind: kind, input_id: inputId, input_version: 1, label: kind, value, unit: null, direction,
      observed_at: day(observedDaysAgo), expected_every_days: null, confidence: null, evidence: [{ object_id: uuidv7(), version: 1 }], objective_ids: [], exposure: kind === 'risk' || kind === 'opportunity' ? { kind, id: inputId, amount: 1_000_000, unit: 'EUR', basis: 'SYNTHETIC' } : null, basis: 'SYNTHETIC unit input', ...extra });
    const base = [row('indicator', id.ind, 80, 'higher_better', 1), row('measure', id.msr, 40, 'higher_better', 1, { confidence: 0.4 }), row('risk', id.rsk, 20, 'lower_better', 1), row('opportunity', id.opp, 5, 'higher_better', 1),
      row('measure', id.g1, 25, 'higher_better', 1)];
    const compose = async (inputs: unknown[]): Promise<Row> => (await sql<{ r: Row }>`select executive.health_compose(${JSON.stringify(model)}::jsonb, ${JSON.stringify(inputs)}::jsonb, ${AT}::timestamptz, null) r`.execute(su)).rows[0]!.r;
    const pick = (r: Row, k: string, key: string) => arr(r[k]).find((x) => x['key'] === key)!;
    // (a) the opportunity of growth is MISSING → growth coverage 0.5 < 0.7: indeterminate, the aggregate NULL
    const a = await compose(base);
    expect(pick(a, 'components', 'rsk')).toMatchObject({ normalised: 80, state: 'included', critical_failure: false });
    expect(pick(a, 'components', 'msr')).toMatchObject({ normalised: 80, low_confidence: true, confidence: 0.4 });
    expect(pick(a, 'dimensions', 'resilience')).toMatchObject({ value: 72.5, status: 'partial', low_confidence: ['msr'], coverage: 1 });
    expect(pick(a, 'dimensions', 'growth')).toMatchObject({ value: null, status: 'indeterminate', coverage: 0.5 });
    expect(a).toMatchObject({ status: 'indeterminate', aggregate: null });
    expect(pick(a, 'components', 'g2')).toMatchObject({ state: 'missing', missing: true });
    // (b) the opportunity in the WRONG direction: inconsistent — still excluded, still indeterminate
    const b = await compose([...base, row('opportunity', id.g2, 8, 'lower_better', 1)]);
    expect(pick(b, 'components', 'g2')).toMatchObject({ state: 'inconsistent', reason: expect.stringMatching(/the input says lower_better, the definition higher_better/) });
    expect(b['aggregate']).toBeNull();
    // (c) all four kinds present and consistent: growth 65 complete; the aggregate 0.6 × 72.5 + 0.4 × 65 = 69.5, partial (low confidence)
    const c = await compose([...base, row('opportunity', id.g2, 8, 'higher_better', 1)]);
    expect(pick(c, 'dimensions', 'growth')).toMatchObject({ value: 65, status: 'complete' });
    expect(c).toMatchObject({ status: 'partial', aggregate: 69.5, coverage: 1 });
    const sens = obj(pick(c, 'components', 'ind')['sensitivity']);
    expect(Number(sens['weight_plus_10pct'])).toBeCloseTo(72.75, 2);
    expect(Number(sens['weight_minus_10pct'])).toBeCloseTo(72.25, 2);
    expect(Number(sens['swing'])).toBeCloseTo(0.5, 2);
    expect(arr(obj(pick(c, 'components', 'rsk')['lineage'])['evidence'])).toHaveLength(1);
    expect(obj(obj(pick(c, 'components', 'opp')['lineage'])['exposure'])).toMatchObject({ kind: 'opportunity', amount: 1_000_000 });
    // (d) the risk worsens to 75 → 25, below its floor 30: a CRITICAL FAILURE — partial, the lowest band, never averaged away (58.75 would be "watch")
    const d = await compose([...base.filter((x) => x.input_id !== id.rsk), row('risk', id.rsk, 75, 'lower_better', 1), row('opportunity', id.g2, 8, 'higher_better', 1)]);
    expect(pick(d, 'dimensions', 'resilience')).toMatchObject({ value: 58.75, band: 'critical', critical_failures: ['rsk'], status: 'partial' });
    // (e) a declared cadence stricter than the component's bound: the measure expected daily, observed 2 days ago → STALE
    const e = await compose([...base.filter((x) => x.input_id !== id.msr), row('measure', id.msr, 40, 'higher_better', 2, { expected_every_days: 1 }), row('opportunity', id.g2, 8, 'higher_better', 1)]);
    expect(pick(e, 'components', 'msr')).toMatchObject({ state: 'stale', stale_after_days: 1, reason: 'observed 2 days before the instant; stale after 1 days' });
    expect(pick(e, 'dimensions', 'resilience')).toMatchObject({ coverage: 0.75, value: 70 });
    // (f) an observation after the instant is inconsistent, never used
    const f = await compose([...base.filter((x) => x.input_id !== id.ind), row('indicator', id.ind, 80, 'higher_better', -1), row('opportunity', id.g2, 8, 'higher_better', 1)]);
    expect(pick(f, 'components', 'ind')).toMatchObject({ state: 'inconsistent' });
    sixEvidence('U1', { fault_trace: { missing: 'g2 → growth indeterminate → aggregate NULL', inconsistent: 'direction', critical: 'rsk 25 < 30', stale: 'declared cadence 1 d' },
      watermark: { at: AT }, consumer_behaviour: { aggregate_all_present: c['aggregate'], resilience_critical: pick(d, 'dimensions', 'resilience')['band'] }, operator_action: 'none — the pure function',
      recovery: 'the corrected input restores the determinate aggregate (c)', reconciliation: { kinds: ['indicator', 'measure', 'risk', 'opportunity'] } });
  }, 60_000);
});
