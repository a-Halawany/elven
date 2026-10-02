/**
 * CP-6 B34 (migration 0090, part `exposures`) — THE REMAINDER OF RISK AND OPPORTUNITY INTELLIGENCE (F-P4-13), on a real database: the
 * world of `bootDecisionWorld` and B34's own humans with sessions of their own (the ports compare the acting principal): the Regensburg
 * RISK OWNER (risk_owner, strategy_owner, decision_owner), a second risk owner, the sourcing risk owner, L. BRANDT (opportunity_sponsor,
 * strategy_owner, decision_owner), a domain analyst, the executive (publishes the taxonomy, contests), a domain administrator (activates the
 * taxonomy — the second named human — and resolves an owner), a collection manager (403). Pronoun-neutral personas; the amounts are
 * SYNTHETIC fixtures (EUR), stated as such.
 *
 *   E1 · ExposureChanged@v1 INTO THE OUTBOX from the exposure routes' own governed writes — accept (assessment_accepted), the chained route
 *        (appetite_breached), contest (contested), hypothesis (hypothesis_declared), sponsor (sponsored), close (closed): the payload's
 *        contract per port; a refused act writes NO outbox row; a repeated routing (idempotent on the residual) writes none either.
 *   E2 · THE TAXONOMY'S ACTIVATION: v2 published by the executive is NOT in force (registration still files under v1); the publisher's own
 *        activation 403 (separation); the analyst 403 (PDP); an unknown version 404; the domain administrator activates v2 → in force (a
 *        category only v2 has now registers); again 409 (already_active); v1 409 (superseded); the ledger append-only.
 *   E3 · THE POLARITY ON THE CANONICAL RSK and the SCENARIOS: an RSK declared `polarity: opportunity` refuses registration as a risk (422)
 *        and registers as an opportunity (polarity_source canonical); a polarity on an OBJ 422; the corridor linked to the world's corridor
 *        scenario (materializes_in) — 404 an unknown scenario, 409 twice, 403 the collector, 422 an unknown relation; the link on the read.
 *   E4 · THE OUTCOME LOOP (demo scene B34: "the corridor mitigation's outcome is recorded against the exposure and its residual reviewed"):
 *        the mitigation opened (a DEC resting on the RSK + its package + the link), driven to COMMITTED by the decision module's own routes;
 *        the monitor says `monitoring`; a review before any outcome 409 (no_outcome); the plant's outcome recorded under decision.outcome
 *        (the twin's observed element reconciled — the decision harness's path); the detection `outcome_unreviewed`; the review — 403 the
 *        analyst (PDP), 403 another risk owner (the port), 404 an unknown response, 422 a short lesson — then THE OWNER's: the effect, the
 *        residual computed again (cause outcome_review) with its verdict, the lesson, ExposureChanged(outcome_recorded), the breach still
 *        outside appetite routed again; a second review 409 (already_reviewed); the monitor says `reviewed`.
 *   E5 · THE DETECTIONS: FALSE PRECISION (a 0.02-wide bracket on one evidence object) flagged, not refused; an INVALIDATED DEPENDENCY (the
 *        world's ASU) HOLDS the exposure — its acceptance 409 — and the revalidated ASU releases it (recovery; the SIGNATURE on the
 *        acceptance); a DUPLICATE opportunity (same category, a shared driver) flagged on both; a TIME-EXPIRED opportunity flagged (detected,
 *        not refused — the sponsor decides), a new window clears it; the OWNER RESOLUTION — a suspended owner flagged with the named resolvers, 403 the
 *        analyst, 422 a non-risk-owner, 404, the domain administrator re-owns it, again 409 (not_needed), an active owner 409.
 *
 * EACH CASE LOGS ONE `B34 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let ex: ExposuresController;
let regOwner: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let sourcingOwner: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B34 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
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

/* ───────────── the routes (in process) ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'RSK', id, 'prediction');
const publishTaxonomy = (as: AuthenticatedPrincipal, payload: Row) => ex.publishTaxonomy(req(as, 'prediction.exposure.taxonomy.publish'), T(), D(), { payload }) as Promise<{ taxonomy: Row }>;
const approveAppetite = (as: AuthenticatedPrincipal, payload: Row) => ex.approveAppetite(req(as, 'prediction.exposure.appetite.approve'), T(), D(), { payload }) as Promise<{ appetite: Row }>;
const register = (as: AuthenticatedPrincipal, payload: Row) => ex.register(req(as, 'prediction.exposure.register', String(payload['strategyObjectId'] ?? '')), T(), D(), { payload }) as Promise<{ exposure: Row }>;
const assess = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.assess(req(as, 'prediction.exposure.assess', id), T(), D(), id, { payload }) as Promise<{ assessment: Row }>;
const accept = (as: AuthenticatedPrincipal, id: string, v: number, payload: Row) => ex.accept(req(as, 'prediction.exposure.accept', id), T(), D(), id, String(v), { payload }) as Promise<{ acceptance: Row; routing: Row }>;
const contest = (as: AuthenticatedPrincipal, id: string, v: number, reason: string) => ex.contest(req(as, 'prediction.exposure.contest', id), T(), D(), id, String(v), { payload: { reason } }) as Promise<{ contest: Row }>;
const route = (as: AuthenticatedPrincipal, id: string) => ex.route_(req(as, 'prediction.exposure.route', id), T(), D(), id) as Promise<{ routing: Row }>;
const hypothesis = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.declareHypothesis(req(as, 'prediction.exposure.hypothesis.declare', id), T(), D(), id, { payload }) as Promise<{ hypothesis: Row }>;
const sponsor = (as: AuthenticatedPrincipal, id: string, v: number, payload: Row) => ex.sponsor(req(as, 'prediction.exposure.sponsor', id), T(), D(), id, String(v), { payload }) as Promise<{ sponsorship: Row; evaluation: Row }>;
const closeExposure = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.close(req(as, 'prediction.exposure.close', id), T(), D(), id, { payload }) as Promise<{ closure: Row }>;
const activateTaxonomy = (as: AuthenticatedPrincipal, payload: Row) => ex.activateTaxonomy(req(as, 'prediction.exposure.taxonomy.activate'), T(), D(), { payload }) as Promise<{ activation: Row }>;
const linkScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.linkScenario(req(as, 'prediction.exposure.scenario.link', id), T(), D(), id, { payload }) as Promise<{ link: Row }>;
const getExposure = (as: AuthenticatedPrincipal, id: string) => ex.get(req(as, 'prediction.exposure.read', id), T(), D(), id) as Promise<Row>;
const list = (as: AuthenticatedPrincipal) => ex.list(req(as, 'prediction.exposure.read'), T(), D()) as Promise<Row>;
const openDecision = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.openResponse(req(as, 'prediction.exposure.respond', id), T(), D(), id, { payload }) as Promise<{ response: Row }>;
const reviewOutcome = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.reviewOutcome(req(as, 'prediction.exposure.outcome.review', id), T(), D(), id, { payload }) as Promise<{ review: Row; routing: Row }>;
const resolveOwner = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.resolveOwner(req(as, 'prediction.exposure.owner.resolve', id), T(), D(), id, { payload }) as Promise<{ resolution: Row }>;
const getTaxonomy =(as: AuthenticatedPrincipal) => ex.getTaxonomy(req(as, 'prediction.exposure.read'), T(), D()) as Promise<{ taxonomy: Row }>;
const declareStrategy = (as: AuthenticatedPrincipal, payload: Row) => w.graph.declare(h.req(as, 'graph.strategy.declare', String(payload['objectType']), null, 'graph'), T(), D(), { payload }) as Promise<{ strategy: { objectId: string } }>;

/* ───────────── the rows ───────────── */
const exposureRow = async (id: string): Promise<Row> => (await sql<Row>`select * from prediction.exposure_current where exposure_id = ${id}::uuid`.execute(su)).rows[0]!;
const eventRow = async (id: string, event: string): Promise<Row[]> => (await sql<Row>`select event_id::text, event, details from prediction.exposure_events where exposure_id = ${id}::uuid and event = ${event} order by occurred_at, event_id`.execute(su)).rows;
/** The ExposureChanged rows of one exposure, oldest first (the pipeline's outbox). */
const changedRows = async (id: string, kind?: string): Promise<Row[]> => (await sql<{ payload: Row }>`select payload from objects.object_outbox where event_type = 'ExposureChanged' and payload ->> 'exposure_id' = ${id}
  and (${kind ?? null}::text is null or payload #>> '{change,kind}' = ${kind ?? null}::text) order by created_at, id`.execute(su)).rows.map((r) => r.payload);

/** A synthetic assessment (EUR amounts are fixtures). */
const riskAssessment = (over: Row = {}): Row => ({
  mechanism: 'A closure of the Bab el-Mandeb corridor delays the magnet shipments; the Regensburg line stops when the buffer runs out',
  probability: { low: 0.3, high: 0.6 }, impact: { low: 400_000, high: 900_000, unit: 'EUR' }, horizon: '2024-Q1', response_window_hours: 72, velocity: 'weeks',
  reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
  options: [{ key: 'dual-source', label: 'Qualify a second magnet source', kind: 'mitigate', cost: 120_000 }, { key: 'hold', label: 'Accept and watch the corridor', kind: 'accept' }],
  evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B34 harness)', ...over,
});
const oppAssessment = (over: Row = {}): Row => ({
  mechanism: 'A Moroccan magnet supplier qualified now captures the share the corridor closure frees up at a lower landed cost',
  plausibility: 'medium', impact: { low: 150_000, high: 600_000, unit: 'EUR' }, horizon: '2024-H1', velocity: 'months', reversibility: 'reversible', controllability: 'medium',
  options: [{ key: 'qualify', label: 'Qualify the Moroccan supplier', kind: 'exploit', cost: 80_000 }, { key: 'wait', label: 'Wait for the corridor to reopen', kind: 'defer' }],
  evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B34 harness)', ...over,
});
const taxonomy = [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' },
                  { key: 'market', label: 'Market', polarity: 'both' }];

/** The synthetic outcomes upload (the phase6-monitoring fixture's shape): the plant's line-stop days over the horizon. */
const OUTCOMES_CSV = ['synthetic,record_id,line_id,line_stop_days,window_from,window_to,note',
  'true,SYN-OUT-2024Q1-A1,SYN-LINE-A1,3,2024-01-11,2024-04-10,three days of line stop while the rerouted shipment cleared the Cape'].join('\n') + '\n';
const ELEMENT_KEY = 'outcome.line_stop_days:SYN-LINE-A1';
const kinds = (d: unknown): string[] => (Array.isArray(d) ? (d as Row[]).map((x) => String(x['kind'])) : []);
const monitorOf = (g: Row, responseId: string): Row => obj((g['responses'] as Row[]).find((r) => r['response_id'] === responseId)?.['monitor']);

/** What the cases leave one another. */
let corridor = ''; let morocco = ''; let flood = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
  ex = h.app.get(Xc);
  regOwner = await h.humanWithSession(['risk_owner', 'strategy_owner', 'decision_owner'], 'b34-regensburg-risk-owner');
  otherOwner = await h.humanWithSession(['risk_owner'], 'b34-other-risk-owner');
  sourcingOwner = await h.humanWithSession(['risk_owner'], 'b34-sourcing-owner');
  brandt = await h.humanWithSession(['opportunity_sponsor', 'strategy_owner', 'decision_owner'], 'b34-l-brandt');
  analyst = await h.humanWithSession(['domain_analyst'], 'b34-analyst');
  executive = await h.humanWithSession(['executive'], 'b34-executive');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b34-domain-admin');
  outsider = await h.humanWithSession(['collection_manager'], 'b34-collector');
  w = await bootDecisionWorld(h);
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B34 · the remainder of risk and opportunity intelligence (0090 part exposures; F-P4-13)', () => {
  it('E1 · ExposureChanged@v1 from the exposure routes\' own writes: accept, route, contest, hypothesis, sponsor, close; none on a refusal or a repeat', async () => {
    await publishTaxonomy(executive, { expectedVersion: 0, categories: taxonomy, reason: 'the first taxonomy of the domain (B34 fixture)' });
    await activateTaxonomy(domainAdmin, { version: 1, reason: 'reviewed against the board\'s risk policy (B34 fixture)' });
    await approveAppetite(executive, { category: 'supply_chain', expectedVersion: 0, threshold: 250_000, unit: 'EUR', statement: 'no single supply-chain exposure above EUR 250k residual', reason: 'the board\'s Q1 appetite (SYNTHETIC)' });
    corridor = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Corridor closure — Regensburg line', statement: 'A Bab el-Mandeb closure stops the magnet supply to the Regensburg line',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor is the driver of this exposure' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId, reviewEveryDays: 30 });
    const a = (await assess(analyst, corridor, { expectedVersion: 0, assessment: riskAssessment() })).assessment;
    // a REFUSED act writes no outbox row (the port refuses; the transaction rolls back whole)
    await refused(accept(otherOwner, corridor, 1, { digest: a['digest'], rationale: 'another risk owner tries to accept' }), /accepted by the exposure's owner/, 403);
    expect(await changedRows(corridor)).toEqual([]);
    const acc = await accept(regOwner, corridor, 1, { digest: a['digest'], rationale: 'The bracket matches the carrier notices; accepted (B34 fixture)' });
    expect(acc.routing['state']).toBe('routed');
    const accepted = await changedRows(corridor, 'assessment_accepted');
    expect(accepted).toHaveLength(1);
    const ev = (await eventRow(corridor, 'exposure.assessment_accepted'))[0]!;
    expect(accepted[0]).toMatchObject({ schema: 'ExposureChanged', schema_version: 1, exposure_id: corridor, polarity: 'risk', category_key: 'supply_chain', version: 1,
      change: { kind: 'assessment_accepted', event_id: ev['event_id'] }, owner: regOwner.principalId, sponsor: null, state: 'accepted', objectives: [w.objectiveId],
      cause: { action: 'prediction.exposure.accept', actor: regOwner.principalId, target_type: 'RSK', target_id: corridor } });
    expect(Number.isNaN(Date.parse(String(obj(accepted[0]!['temporal'])['known_at'])))).toBe(false);
    const breached = await changedRows(corridor, 'appetite_breached');
    expect(breached).toHaveLength(1);
    expect(breached[0]).toMatchObject({ change: { kind: 'appetite_breached', event_id: (await eventRow(corridor, 'exposure.routed'))[0]!['event_id'] }, cause: { action: 'prediction.exposure.route' } });
    // RECOVERY: routing again is idempotent on the residual — `repeated`, no second event
    const again = (await route(regOwner, corridor)).routing;
    expect(obj(again['candidate'])['repeated']).toBe(true);
    expect(await changedRows(corridor, 'appetite_breached')).toHaveLength(1);
    // contest: another person's challenge of the accepted version
    await contest(executive, corridor, 1, 'The bracket ignores the reopened Cape route; challenged (B34 fixture)');
    expect(await changedRows(corridor, 'contested')).toEqual([expect.objectContaining({ state: 'contested', version: 1, change: expect.objectContaining({ kind: 'contested' }) })]);
    // the OPPORTUNITY: hypothesis → sponsor
    morocco = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Alternative magnet supplier in Morocco', statement: 'The corridor closure opens the door to a Moroccan supplier',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the same corridor drives the opening' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the opportunity serves this objective' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: morocco, polarity: 'opportunity', category: 'sourcing', owner: sourcingOwner.principalId });
    await hypothesis(brandt, morocco, { statement: 'A Moroccan supplier can deliver qualified magnets within 12 weeks', falsifier: 'The first article fails the magnetic flux test',
      value: { low: 150_000, high: 600_000, unit: 'EUR' }, timing: { window: '2024-H1' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [] });
    expect(await changedRows(morocco, 'hypothesis_declared')).toEqual([expect.objectContaining({ polarity: 'opportunity', category_key: 'sourcing', owner: sourcingOwner.principalId, state: 'identified' })]);
    const oa = (await assess(analyst, morocco, { expectedVersion: 0, assessment: oppAssessment() })).assessment;
    await refused(sponsor(regOwner, morocco, 1, { digest: oa['digest'], terms: { option_key: 'qualify', rationale: 'no sponsor role', conditions: ['first article passes'] } }), /./, 403);
    expect(await changedRows(morocco, 'sponsored')).toEqual([]);
    const sp = await sponsor(brandt, morocco, 1, { digest: oa['digest'], terms: { option_key: 'qualify', rationale: 'The value range justifies a qualification run', conditions: ['first article passes the flux test'] },
      decision: { title: 'Evaluate the Moroccan supplier', statement: 'qualify the supplier or wait' } });
    expect(sp.sponsorship['state']).toBe('sponsored');
    expect(await changedRows(morocco, 'sponsored')).toEqual([expect.objectContaining({ sponsor: brandt.principalId, state: 'sponsored', version: 1 })]);
    // close: a third exposure registered and closed by its owner
    flood = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Danube flood — Regensburg plant', statement: 'A Danube flood closes the plant access roads',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: flood, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId });
    await refused(closeExposure(analyst, flood, { criterion: 'withdrawn', reason: 'the analyst cannot close it' }), /./, 403);
    await closeExposure(regOwner, flood, { criterion: 'withdrawn', reason: 'registered twice by mistake (B34 fixture)' });
    expect(await changedRows(flood)).toEqual([expect.objectContaining({ state: 'closed', change: expect.objectContaining({ kind: 'closed' }), version: null })]);
    const all = (await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'ExposureChanged' and tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n;
    expect(all).toBe(6);
    expect((await exposureRow(corridor))['state']).toBe('contested');
    sixEvidence('E1', { fault_trace: { refused: ['403 another owner accepts — no outbox row', '403 no sponsor role — no outbox row'], repeated: 'a second routing — no second event' },
      watermark: { events: all }, consumer_behaviour: 'the attention consumer reads the record the event names (not this part)', operator_action: 'accept, route, contest, hypothesis, sponsor, close',
      recovery: 'the routing is idempotent on the residual', reconciliation: { kinds: ['assessment_accepted', 'appetite_breached', 'contested', 'hypothesis_declared', 'sponsored', 'closed'] } });
  }, 180_000);

  it('E2 · THE TAXONOMY\'S ACTIVATION: published is not in force; a SECOND named member activates; 403 the publisher, 404, 409', async () => {
    const v2 = [...taxonomy, { key: 'regulatory', label: 'Regulatory', polarity: 'both' }];
    const pub = (await publishTaxonomy(executive, { expectedVersion: 1, categories: v2, reason: 'regulatory exposures filed apart (B34 fixture)' })).taxonomy;
    expect(pub).toMatchObject({ version: 2, supersedes: 1 });
    const t0 = (await getTaxonomy(analyst)).taxonomy;
    expect(obj(t0['current'])['version']).toBe(1);
    expect(obj(t0['pending'])['version']).toBe(2);
    // not in force: a v2-only category is not yet a category
    const reg = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Customs rule change — magnets', statement: 'A new customs rule adds a week to every magnet import',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await refused(register(analyst, { strategyObjectId: reg, polarity: 'risk', category: 'regulatory', owner: regOwner.principalId }), /no category regulatory in taxonomy version 1/, 404);
    await refused(activateTaxonomy(executive, { version: 2, reason: 'the publisher activates their own version' }), /risk taxonomy activation rejected \(separation\)/, 403);
    await refused(activateTaxonomy(analyst, { version: 2, reason: 'the analyst holds no activation role' }), /./, 403);
    await refused(activateTaxonomy(domainAdmin, { version: 9, reason: 'no such version exists here' }), /no such taxonomy version 9/, 404);
    await refused(activateTaxonomy(domainAdmin, { version: 2, reason: 'short' }), /8\.\.2000 characters/, 422);
    const act = (await activateTaxonomy(domainAdmin, { version: 2, reason: 'reviewed: the regulatory category is needed now (B34 fixture)' })).activation;
    expect(act).toMatchObject({ version: 2, supersedes: 1, activated_by: domainAdmin.principalId, published_by: executive.principalId, in_force: true });
    await refused(activateTaxonomy(domainAdmin, { version: 2, reason: 'a second activation of the same version' }), /risk taxonomy activation rejected \(already_active\)/, 409);
    await refused(activateTaxonomy(domainAdmin, { version: 1, reason: 'going back to the first version' }), /risk taxonomy activation rejected \(superseded\)/, 409);
    const r = (await register(analyst, { strategyObjectId: reg, polarity: 'risk', category: 'regulatory', owner: regOwner.principalId })).exposure;
    expect(r).toMatchObject({ taxonomy_version: 2, polarity_source: 'register' });
    const t1 = (await getTaxonomy(analyst)).taxonomy;
    expect(obj(t1['current'])['version']).toBe(2);
    expect(t1['pending']).toBeNull();
    expect(obj(t1['activation'])['activated_by']).toBe(domainAdmin.principalId);
    const upd = await refusal(sql`update prediction.risk_taxonomy_activations set reason = 'rewritten afterwards'`.execute(su));
    expect(upd.message).toMatch(/append/i);
    sixEvidence('E2', { fault_trace: { refused: ['404 a v2 category before activation', '403 the publisher (separation)', '403 analyst (PDP)', '404 version 9', '422 reason', '409 already_active', '409 superseded'] },
      watermark: { in_force: 2 }, consumer_behaviour: 'the register files under the version in force', operator_action: 'the executive publishes; the domain administrator activates',
      recovery: 'a version waits, published, until its activation', reconciliation: { activated_by: domainAdmin.principalId, published_by: executive.principalId } });
  }, 120_000);

  it('E3 · THE POLARITY ON THE CANONICAL RSK; SCENARIOS linked to an exposure; 422, 404, 409, 403', async () => {
    await refused(declareStrategy(regOwner, { objectType: 'OBJ', title: 'An objective with a polarity', statement: 'refused: only an RSK states a polarity', polarity: 'risk',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'a parent objective for the probe' }] }), /polarity is stated on an RSK only/, 422);
    const opp = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Recycled magnet feedstock', statement: 'Recycled feedstock lowers the magnet cost', polarity: 'opportunity',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the opportunity serves this objective' }] })).strategy.objectId;
    const canon = (await sql<{ p: string | null }>`select payload ->> 'polarity' p from objects.canonical_objects where object_id = ${opp}::uuid`.execute(su)).rows[0]!;
    expect(canon.p).toBe('opportunity');
    await refused(register(analyst, { strategyObjectId: opp, polarity: 'risk', category: 'market', owner: sourcingOwner.principalId }), /exposure rejected \(polarity\).*declared a opportunity/, 422);
    const r = (await register(analyst, { strategyObjectId: opp, polarity: 'opportunity', category: 'market', owner: sourcingOwner.principalId })).exposure;
    expect(r['polarity_source']).toBe('canonical');
    // SCENARIOS
    await refused(linkScenario(outsider, corridor, { scenarioId: w.scenarioId, relation: 'materializes_in', rationale: 'the collector has no standing here' }), /./, 403);
    await refused(linkScenario(analyst, corridor, { scenarioId: uuidv7(), relation: 'materializes_in', rationale: 'no such scenario exists here' }), /exposure scenario link rejected: no such scenario/, 404);
    await refused(linkScenario(analyst, corridor, { scenarioId: w.scenarioId, relation: 'causes', rationale: 'an unknown relation' }), /relation is materializes_in/, 422);
    const l = (await linkScenario(analyst, corridor, { scenarioId: w.scenarioId, relation: 'materializes_in', rationale: 'the downside branch is the corridor closure itself' })).link;
    expect(l).toMatchObject({ exposure_id: corridor, scenario_id: w.scenarioId, relation: 'materializes_in' });
    await refused(linkScenario(analyst, corridor, { scenarioId: w.scenarioId, relation: 'stresses', rationale: 'a second link of the same pair' }), /exposure scenario link rejected \(duplicate\)/, 409);
    await refused(linkScenario(analyst, flood, { scenarioId: w.scenarioId, relation: 'stresses', rationale: 'the flood exposure is closed' }), /exposure scenario link rejected \(closed\)/, 409);
    const g = await getExposure(analyst, corridor);
    expect((g['scenarios'] as Row[]).map((x) => [x['scenario_id'], x['relation'], typeof x['scenario_title']])).toEqual([[w.scenarioId, 'materializes_in', 'string']]);
    expect((await eventRow(corridor, 'exposure.scenario_linked'))).toHaveLength(1);
    sixEvidence('E3', { fault_trace: { refused: ['422 polarity on an OBJ', '422 canonical opportunity registered as a risk', '403 collector', '404 scenario', '422 relation', '409 duplicate', '409 closed'] },
      watermark: { canonical_polarity: 'opportunity' }, consumer_behaviour: { scenarios: 1 }, operator_action: 'the analyst registers and links',
      recovery: 'none needed', reconciliation: { polarity_source: 'canonical' } });
  }, 120_000);

  it('E4 · THE OUTCOME LOOP: the mitigation committed, its outcome recorded, reviewed against the exposure — the residual reviewed, the lesson; 403, 404, 409, 422', async () => {
    const c = decisionCalls(h, w);
    const opened = (await openDecision(regOwner, corridor, { kind: 'mitigate', decision: { title: 'Mitigate the corridor closure', statement: 'reroute the magnet shipments via the Cape' } })).response;
    const pkg = String(opened['package_id']); const responseId = String(opened['response_id']);
    // before the decision commits: the monitor says what is owed
    expect(monitorOf(await getExposure(regOwner, corridor), responseId)['state']).toBe('decision_open');
    const v = (await c.open(pkg, {}, regOwner)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] }, regOwner);
    await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] }, regOwner);
    await c.terms(pkg, v, c.validTerms(), regOwner);
    await c.choice(pkg, v, c.validChoice({ action_owner: regOwner.principalId }), regOwner);
    const prop = await c.propose(pkg, v, regOwner);
    await c.approve(pkg, v, { decision: 'approve', versionDigest: prop.proposal.versionDigest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    await c.commit(pkg, v, prop.proposal.versionDigest, w.authority);
    expect(monitorOf(await getExposure(regOwner, corridor), responseId)['state']).toBe('monitoring');
    await refused(reviewOutcome(regOwner, corridor, { responseId, effect: 'effective', residualVerdict: 'stands', lesson: 'nothing observed yet — refused before any outcome' }), /exposure outcome review rejected \(no_outcome\)/, 409);
    // THE OUTCOME, recorded by the decision module (the twin's observed element reconciled against the chosen run — the decision harness's path)
    const run = (await sql<{ o: Row }>`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`.execute(su)).rows[0]!.o;
    const simulatedDays = Number(obj(run['totals'])['line_stop_days']);
    const o2 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as { version: { version: number } };
    const vSim = o2.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'simulated', value: simulatedDays, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] }] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: {} });
    const up = await h.upload([{ filename: 'outcomes-b34-2024Q1.csv', text: OUTCOMES_CSV, documentTime: '2024-04-10T00:00:00Z' }]);
    const outEvd = up[0] as { id: string; version: number };
    const o3 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', carryFrom: vSim, except: [ELEMENT_KEY] } }) as { version: { version: number } };
    const vObs = o3.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'observed', value: 3, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: outEvd.id, version: outEvd.version }], record: { locator: 'SYN-OUT-2024Q1-A1', field: 'line_stop_days' } }] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: {} });
    await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { key: ELEMENT_KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the plant\'s actual line-stop days' } });
    const reconciliationId = String((await sql<{ id: string }>`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${ELEMENT_KEY} and from_version = ${vSim} and against_version = ${vObs} order by recorded_at desc limit 1`.execute(su)).rows[0]?.id);
    const outcome = (await c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: ELEMENT_KEY, reconciliationId, note: 'Three days of line stop while the rerouted shipment cleared the Cape.' }, regOwner)).outcome;
    expect(outcome.met).toBe(false);
    // MONITORED against the exposure: the detection, the gap and the monitor
    const g1 = await getExposure(regOwner, corridor);
    expect(kinds(g1['detections'])).toContain('outcome_unreviewed');
    expect(obj(g1['exposure'])['gaps']).toContain('an outcome recorded, not yet reviewed');
    expect(monitorOf(g1, responseId)['state']).toBe('outcome_recorded');
    // THE REVIEW: refusals, then the owner's
    const lesson = 'The reroute held the line to three stop days; the buffer, not the route, was the binding constraint — size the buffer first next time.';
    await refused(reviewOutcome(analyst, corridor, { responseId, effect: 'effective', residualVerdict: 'stands', lesson }), /./, 403);
    await refused(reviewOutcome(otherOwner, corridor, { responseId, effect: 'effective', residualVerdict: 'stands', lesson }), /an outcome is reviewed by the exposure's owner/, 403);
    await refused(reviewOutcome(regOwner, corridor, { responseId: uuidv7(), effect: 'effective', residualVerdict: 'stands', lesson }), /no such response/, 404);
    await refused(reviewOutcome(regOwner, corridor, { responseId, effect: 'effective', residualVerdict: 'stands', lesson: 'too short' }), /lesson is 16\.\.4000 characters/, 422);
    await refused(reviewOutcome(regOwner, corridor, { responseId, effect: 'great', residualVerdict: 'stands', lesson }), /effect is effective/, 422);
    const before = (await changedRows(corridor, 'appetite_breached')).length;
    const rv = await reviewOutcome(regOwner, corridor, { responseId, effect: 'partly_effective', residualVerdict: 'reassess', lesson });
    expect(rv.review).toMatchObject({ response_id: responseId, package_id: pkg, effect: 'partly_effective', residual_verdict: 'reassess', lesson, route_due: true });
    expect((rv.review['outcomes'] as Row[]).map((o) => [o['criterion_key'], o['met']])).toEqual([['line_stop_days', false]]);
    const residual = obj(rv.review['residual']);
    expect(residual['cause']).toBe('outcome_review');
    expect(rv.review['residual_before']).not.toBe(residual['residual_id']);
    expect(rv.routing['state']).toBe('routed');
    const changed = await changedRows(corridor, 'outcome_recorded');
    expect(changed).toEqual([expect.objectContaining({ exposure_id: corridor, version: 1, owner: regOwner.principalId, cause: expect.objectContaining({ action: 'prediction.exposure.outcome.review' }),
      change: expect.objectContaining({ kind: 'outcome_recorded', event_id: (await eventRow(corridor, 'exposure.outcome_recorded'))[0]!['event_id'] }) })]);
    expect((await changedRows(corridor, 'appetite_breached')).length).toBe(before + 1);
    const resRow = (await sql<Row>`select cause from prediction.exposure_residuals where residual_id = ${String(residual['residual_id'])}::uuid`.execute(su)).rows[0]!;
    expect(resRow['cause']).toBe('outcome_review');
    await refused(reviewOutcome(regOwner, corridor, { responseId, effect: 'effective', residualVerdict: 'stands', lesson }), /exposure outcome review rejected \(already_reviewed\)/, 409);
    const g2 = await getExposure(regOwner, corridor);
    expect(kinds(g2['detections'])).not.toContain('outcome_unreviewed');
    expect(monitorOf(g2, responseId)['state']).toBe('reviewed');
    expect((g2['reviews'] as Row[]).map((k) => k['lesson'])).toEqual([lesson]);
    const upd = await refusal(sql`update prediction.exposure_outcome_reviews set lesson = 'rewritten afterwards, not allowed'`.execute(su));
    expect(upd.message).toMatch(/append/i);
    sixEvidence('E4', { fault_trace: { refused: ['409 no_outcome', '403 analyst (PDP)', '403 another risk owner (port)', '404 response', '422 lesson', '422 effect', '409 already_reviewed'] },
      watermark: { package: pkg, outcome: outcome.outcomeId, residual_after: residual['residual_id'] }, consumer_behaviour: 'ExposureChanged(outcome_recorded) and the re-routed breach',
      operator_action: 'the risk owner records the outcome (decision.outcome) and reviews it against the exposure', recovery: 'a later outcome is reviewed when recorded',
      reconciliation: { effect: 'partly_effective', residual_verdict: 'reassess', observed_line_stop_days: 3 } });
  }, 240_000);

  it('E5 · THE DETECTIONS: false precision, the invalidated-dependency HOLD, duplicate and time-expired opportunities, the owner resolution', async () => {
    // FALSE PRECISION: a 0.02-wide bracket on one evidence object — flagged, not refused (a point probability is refused at intake)
    const narrow = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Magnet price spike', statement: 'The magnet spot price rises above the hedge',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: narrow, polarity: 'risk', category: 'market', owner: otherOwner.principalId });
    await assess(analyst, narrow, { expectedVersion: 0, assessment: riskAssessment({ probability: { low: 0.4, high: 0.42 } }) });
    const fp = ((await getExposure(analyst, narrow))['detections'] as Row[]).find((d) => d['kind'] === 'false_precision');
    expect(String(fp?.['detail'])).toMatch(/\[0\.4, 0\.42\].*on 1 evidence object/);
    // THE HOLD: an RSK resting on the world's ASU; the ASU invalidated (planted — the propagation from a withdrawn claim is the graph harness's)
    const strike = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Port strike — Hamburg', statement: 'A port strike blocks the rerouted shipments',
      restsOn: [{ kind: 'strategy', id: w.assumptionId, rationale: 'the exposure is assessed on the assumption the corridor stays open' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: strike, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId });
    const sa = (await assess(analyst, strike, { expectedVersion: 0, assessment: riskAssessment() })).assessment;
    await sql`update graph.strategy_current set verification_state = 'invalidated', verification_reason = 'the corridor closed (B34 fixture)' where strategy_object_id = ${w.assumptionId}::uuid`.execute(su);
    const held = await getExposure(regOwner, strike);
    expect(kinds(held['detections'])).toContain('held');
    expect(obj(held['exposure'])['gaps']).toContain('held (an invalidated dependency)');
    await refused(accept(regOwner, strike, 1, { digest: sa['digest'], rationale: 'accepted while its basis is invalidated' }), /exposure acceptance rejected \(state\).*is HELD.*invalidated/, 409);
    expect(await changedRows(strike)).toEqual([]);
    // RECOVERY: the ASU revalidated → the hold released → the acceptance stands, with its SIGNATURE (digest and signer)
    await sql`update graph.strategy_current set verification_state = 'unverified', verification_reason = null where strategy_object_id = ${w.assumptionId}::uuid`.execute(su);
    const acc = await accept(regOwner, strike, 1, { digest: sa['digest'], rationale: 'the assumption stands again; accepted (B34 fixture)' });
    expect(obj(acc.acceptance['signature'])).toMatchObject({ digest: sa['digest'], signer: regOwner.principalId, act: 'accept' });
    expect(obj(obj((await getExposure(regOwner, strike))['signatures'])['accepted'])).toMatchObject({ digest: sa['digest'], signer: regOwner.principalId });
    // DUPLICATE: a second sourcing opportunity on the same corridor driver as Morocco — flagged on both
    const tangier = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Magnet supplier in Tangier', statement: 'A Tangier supplier replaces the corridor-bound one', polarity: 'opportunity',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the same corridor drives the opening' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: tangier, polarity: 'opportunity', category: 'sourcing', owner: sourcingOwner.principalId });
    const dupT = ((await getExposure(analyst, tangier))['detections'] as Row[]).find((d) => d['kind'] === 'possible_duplicate');
    expect(dupT).toMatchObject({ other: morocco, shared_drivers: 1 });
    expect(((await getExposure(analyst, morocco))['detections'] as Row[]).find((d) => d['kind'] === 'possible_duplicate')).toMatchObject({ other: tangier });
    // TIME-EXPIRED: a hypothesis whose window closed — flagged (detected, not refused: the sponsor decides); a new window clears it (recovery)
    await hypothesis(brandt, tangier, { statement: 'A Tangier supplier could deliver in the second half of 2023', falsifier: 'No qualified capacity before year end',
      value: { low: 50_000, high: 200_000, unit: 'EUR' }, timing: { window: '2023-H2', to: '2023-12-31' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [] });
    expect(((await getExposure(analyst, tangier))['detections'] as Row[]).find((d) => d['kind'] === 'time_expired')).toMatchObject({ window_end: '2023-12-31' });
    expect(obj((await getExposure(analyst, tangier))['exposure'])['gaps']).not.toContain('time_expired');   // detected, not a gap: the sponsor decides
    await hypothesis(brandt, tangier, { statement: 'A Tangier supplier can deliver within the next planning window', falsifier: 'No qualified capacity within the window',
      value: { low: 50_000, high: 200_000, unit: 'EUR' }, timing: { window: 'next planning window', to: '2099-06-30' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [] });
    expect(kinds((await getExposure(analyst, tangier))['detections'])).not.toContain('time_expired');
    // THE OWNER RESOLUTION: the owner of `narrow` suspended → flagged with the named resolvers; re-owned by the domain administrator
    await refused(resolveOwner(domainAdmin, corridor, { owner: otherOwner.principalId, reason: 'the corridor owner is active' }), /exposure owner resolution rejected \(not_needed\)/, 409);
    await sql`update identity.principals set status = 'suspended' where id = ${otherOwner.principalId}::uuid`.execute(su);
    try {
      const un = ((await getExposure(analyst, narrow))['detections'] as Row[]).find((d) => d['kind'] === 'owner_unresolved');
      expect(un).toMatchObject({ owner: otherOwner.principalId, resolver_role: 'domain_admin' });
      expect((un!['resolvers'] as Row[]).map((r) => r['principal_id'])).toContain(domainAdmin.principalId);
      await refused(resolveOwner(analyst, narrow, { owner: regOwner.principalId, reason: 'the analyst is no resolver' }), /./, 403);
      await refused(resolveOwner(domainAdmin, narrow, { owner: analyst.principalId, reason: 'the analyst is no risk owner' }), /exposure owner resolution rejected \(owner\)/, 422);
      await refused(resolveOwner(domainAdmin, uuidv7(), { owner: regOwner.principalId, reason: 'no such exposure here' }), /no such exposure/, 404);
      const res = (await resolveOwner(domainAdmin, narrow, { owner: regOwner.principalId, reason: 'the market-risk owner left; the Regensburg owner takes it (B34 fixture)' })).resolution;
      expect(res).toMatchObject({ from: otherOwner.principalId, to: regOwner.principalId, resolver: domainAdmin.principalId });
      expect((await exposureRow(narrow))['owner_principal_id']).toBe(regOwner.principalId);
      expect(kinds((await getExposure(analyst, narrow))['detections'])).not.toContain('owner_unresolved');
      await refused(resolveOwner(domainAdmin, narrow, { owner: sourcingOwner.principalId, reason: 'a second resolution around an active owner' }), /\(not_needed\)/, 409);
    } finally {
      await sql`update identity.principals set status = 'active' where id = ${otherOwner.principalId}::uuid`.execute(su);
    }
    sixEvidence('E5', { fault_trace: { flagged: ['false_precision', 'held', 'possible_duplicate ×2', 'time_expired', 'owner_unresolved'], refused: ['409 accept while held',
      '409 resolve an active owner', '403 analyst resolves', '422 a non-risk-owner', '404 exposure'] }, watermark: { narrow, strike, tangier },
      consumer_behaviour: 'the register shows each detection in words; a hold and an unresolved owner are gaps', operator_action: 'the owner, the sponsor and the domain administrator act on them',
      recovery: 'the revalidated ASU releases the hold; a new window clears the expiry; the resolver re-owns', reconciliation: { owner_after: regOwner.principalId } });
  }, 240_000);

  it('E6 · THE FURTHER DIMENSIONS: persistence, option and information value, the likelihood as a distribution, indicators, second-order effects, the trade-off, the option classes; the concentration', async () => {
    const energy = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Energy price shock — Regensburg', statement: 'A gas price shock raises the plant\'s energy cost', polarity: 'risk',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor carries the LNG as well' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: energy, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId });
    const full = riskAssessment({
      mechanism: 'A corridor closure lifts the LNG price; the plant\'s energy cost rises for as long as the corridor stays shut',
      persistence: 'structural', option_value: { low: 10_000, high: 40_000, unit: 'EUR' }, information_value: { low: 5_000, high: 15_000, unit: 'EUR' },
      likelihood: { shape: 'triangular', params: { min: 0.2, mode: 0.45, max: 0.7 } },
      indicators: [{ key: 'transits', label: 'Weekly corridor transits', signal: 'Suez transits per week (the world\'s corridor indicator)', threshold: 40, direction: 'falling' },
                   { key: 'ttf', label: 'TTF front month', signal: 'the Dutch gas front-month price', direction: 'rising' }],
      second_order: [{ effect: 'the energy shock compounds the corridor closure\'s line stop', sign: 'amplifies', on_exposure: corridor }],
      trade_off: { statement: 'Hedging now costs less than the capture a later spot purchase could make', favours: 'mitigation', mitigation_cost: 120_000, capture_value: 60_000, unit: 'EUR' },
      options: [{ key: 'hedge', label: 'Hedge the Q1 volume', kind: 'mitigate', class: 'no_regret', cost: 120_000 },
                { key: 'switch', label: 'Switch the kiln to electric', kind: 'avoid', class: 'irreversible' },
                { key: 'watch', label: 'Buy spot if transits stay above 40', kind: 'accept', class: 'contingent', trigger: 'transits above 40 for two weeks' }] });
    const bad = async (over: Row, re: RegExp, status = 422) => refused(assess(analyst, energy, { expectedVersion: 0, assessment: { ...full, ...over } }), re, status);
    await bad({ option_value: 25_000 }, /option_value is a range \{low, high, unit\}/);
    await bad({ information_value: { low: 9, high: 3, unit: 'EUR' } }, /information_value is a range/);
    await bad({ persistence: 'forever' }, /persistence is transient, persistent or structural/);
    await bad({ probability: null, plausibility: 'medium' }, /a likelihood distribution is declared beside a probability bracket/);
    await bad({ likelihood: { shape: 'triangular', params: { min: 0.35, mode: 0.45, max: 0.7 } } }, /the triangular likelihood contradicts the bracket/);
    await bad({ likelihood: { shape: 'beta', params: { alpha: 2 } } }, /a beta likelihood states exactly the numbers alpha, beta/);
    await bad({ likelihood: { shape: 'cauchy', params: {} } }, /the likelihood is \{shape: uniform/);
    await bad({ options: [{ key: 'watch', label: 'Buy spot later', kind: 'accept', class: 'contingent' }] }, /a contingent option's, 4\.\.512/);
    await bad({ options: [{ key: 'watch', label: 'Buy spot later', kind: 'accept', class: 'maybe' }] }, /class\?: no_regret\|reversible\|contingent\|irreversible/);
    await bad({ indicators: [{ key: 'ttf', label: 'TTF', signal: 'the gas price' }, { key: 'ttf', label: 'TTF again', signal: 'the gas price' }] }, /the indicator key ttf is named twice/);
    await bad({ second_order: [{ effect: 'names an exposure that does not exist', sign: 'amplifies', on_exposure: uuidv7() }] }, /no such exposure .* \(a second-order effect names another exposure\)/, 404);
    await bad({ trade_off: { statement: 'favours nothing we know', favours: 'neither' } }, /the trade-off is \{statement/);
    const a = (await assess(analyst, energy, { expectedVersion: 0, assessment: full })).assessment;
    expect(a).toMatchObject({ version: 1, state: 'proposed' });
    const stored = obj((await sql<{ assessment: Row }>`select assessment from prediction.exposure_versions where exposure_id = ${energy}::uuid and version = 1`.execute(su)).rows[0]!.assessment);
    expect(stored).toMatchObject({ persistence: 'structural', likelihood: { shape: 'triangular' }, trade_off: { favours: 'mitigation' } });
    expect((stored['options'] as Row[]).map((o) => o['class'])).toEqual(['no_regret', 'irreversible', 'contingent']);
    expect(kinds((await getExposure(analyst, energy))['detections'])).not.toContain('options_unclassified');
    expect(kinds((await getExposure(analyst, corridor))['detections'])).toContain('options_unclassified');   // B32's shape: admitted, flagged
    await accept(regOwner, energy, 1, { digest: a['digest'], rationale: 'the hedge is no-regret; accepted (B34 fixture)' });
    // THE CONCENTRATION: the supply-chain category and the corridor entity carry the accepted, open EUR risks
    const reg = await list(analyst);
    const conc = reg['concentration'] as Row[];
    const cat = conc.find((k) => k['dimension'] === 'category' && k['key'] === 'supply_chain' && k['unit'] === 'EUR' && k['polarity'] === 'risk');
    expect(cat).toMatchObject({ concentrated: true });
    expect(Number(cat!['members'])).toBeGreaterThanOrEqual(2);
    const drv = conc.find((k) => k['dimension'] === 'driver' && k['key'] === w.entityId && k['polarity'] === 'risk');
    expect((drv!['exposures'] as string[]).sort()).toEqual([corridor, energy].sort());
    expect(String(cat!['rule'])).toMatch(/concentrated at ≥ 0\.5 over ≥ 2 exposures/);
    sixEvidence('E6', { fault_trace: { refused: ['422 ×10 (value ranges, persistence, distribution without bracket, contradicting shape, parameter set, unknown shape, contingent without trigger, unknown class, indicator twice, trade-off)', '404 second-order on an unknown exposure'] },
      watermark: { energy, digest: a['digest'] }, consumer_behaviour: { concentration_rows: conc.length }, operator_action: 'the analyst assesses the further dimensions; the owner accepts',
      recovery: 'a B32-shape assessment is admitted and flagged options_unclassified', reconciliation: { category_share: cat!['share'] } });
  }, 180_000);
});
