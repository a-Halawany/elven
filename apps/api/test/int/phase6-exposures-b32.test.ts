/**
 * CP-6 B32 (migration 0089 §R, part `exposures`) — RISK AND OPPORTUNITY INTELLIGENCE (F-P4-13), on a real database: the world of
 * `bootDecisionWorld` (the Bab el-Mandeb entity, the "Keep the Regensburg line running through Q1" objective owned by the twin owner), a
 * second entity planted with its event (the B20 idiom), and B32's own humans with sessions of their own (the ports compare the acting
 * principal): the Regensburg RISK OWNER (risk_owner, strategy_owner, decision_owner — declares the RSK, accepts, opens the mitigation), a
 * second risk owner (holds the role, owns none of these), the sourcing risk owner (owns the opportunity), L. BRANDT (opportunity_sponsor,
 * strategy_owner, decision_owner), a domain analyst (identifies and assesses), the executive (taxonomy, appetite, the challenge, triggers the
 * agents), a forecast owner (processes the warning intake), the tenant administrator (registers the agents), a collection manager (403).
 * Pronoun-neutral personas; the amounts are SYNTHETIC fixtures (EUR), stated as such.
 *
 *   X1 · the TAXONOMY and the APPETITE: v1 published by the executive (403 the analyst; 422 a key named twice; 409 a stale version); the
 *        supply-chain appetite approved on residual exposure (404 an unknown category; 422 an opportunity category; 409 stale).
 *   X2 · REGISTER: the corridor-closure RSK declared through the Strategy Graph (its rests_on = its drivers) and registered as a RISK owned by
 *        the Regensburg risk owner — the drivers seeded; 404 an unknown RSK and a non-RSK; 422 an owner who is no risk owner; 409 twice; 403.
 *   X3 · ASSESS → PREVIEW → ACCEPT (demo scene 1): a bracket assessment (422 a point probability; 409 a stale version); the consequence preview
 *        (residual, appetite breach, what it supersedes); acceptance by another risk owner 403 (the port), by the analyst 403 (the PDP), with a
 *        stale digest 409; by THE OWNER — the residual stored with its computation, the breach recorded and ROUTED; a second acceptance 409.
 *   X4 · THE WARNING (the §W path): the candidate (origin `exposure`, C3, the objective affected); the processing RAISES it, routed to the
 *        EXPOSURE'S OWNER (not the objective's); a second routing answers `repeated` (recovery: idempotent on the residual).
 *   X5 · CONTROLS and the RESIDUAL: a control lowers the residual but it still breaches — a new candidate CLUSTERS into the open warning; a
 *        second control brings it within appetite — nothing routed; a control on an opportunity 422; an unowned control 422.
 *   X6 · THE MITIGATION DECISION (demo scene 1): a DEC resting on the RSK, its package, the response link — three governed writes; a response
 *        of the wrong kind refused AFTER the DEC and the package committed → 409 naming them; RESUMED with their ids (recovery).
 *   X7 · THE CHALLENGE: the assessor does not contest their own version (403); the executive contests the accepted one — the exposure CONTESTED.
 *   X8 · THE OPPORTUNITY (demo scene 2): "alternative supplier in Morocco" declared resting on the SAME corridor (a shared driver) and a CAP;
 *        registered; a hypothesis (falsifier, value range, timing, the capability; 404 an unknown CAP; 422 a single-number value); assessed.
 *   X9 · THE AGENTS: the Risk and Opportunity Agents registered with this runtime's estimate (422 a foreign digest); their runs PROPOSE
 *        (the likelihood moved up by the open warning, the correlation of the risks sharing the corridor) and are REFUSED accept / sponsor at
 *        the PDP — recorded on the run; nothing they wrote is accepted; a second run proposes nothing new.
 *   X10 · SPONSORSHIP (demo scene 2): L. Brandt cannot sponsor the agent's estimate (409) nor a stale digest (409); sponsors the human
 *        assessment — the evaluation OPENED (a DEC + a package + the exploit response); again 409; the risk owner (no sponsor role) 403.
 *   X11 · AGGREGATION without double counting: two risks sharing the corridor driver → ONE cluster, the MAX (not the sum); a third on another
 *        driver → BOUNDED [max, sum] until a human declares independence → SUM; the agent's estimate listed, never used; REFUSED with every
 *        reason (contested, unaccepted, stale) — 409; mixed polarity 422; then the owner resolves the challenge and the roll-up is admitted.
 *   X12 · THE REGISTER and the PRIORITY: both polarities side by side with their gaps; lexicographic within polarity and unit, words beside,
 *        no input last.
 *   X13 · THE HEALTH BRANCH: prediction.health_inputs has EXACTLY executive.health_measure_inputs' columns; one row per accepted exposure (the
 *        residual as the value, lower_better / higher_better, the cadence, the confidence, the evidence, the objectives, the exposure block);
 *        as of before the acceptance: none.
 *   X14 · CLOSURE: the owner closes with a criterion (403 the analyst; 409 again; an assessment after it 409).
 *
 * EACH CASE LOGS ONE `B32 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import { OPPORTUNITY_AGENT_DIGEST, OPPORTUNITY_AGENT_VERSION, RISK_AGENT_DIGEST, RISK_AGENT_VERSION } from '../../src/prediction/exposures/exposure-agent-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let ex: ExposuresController; let exec: ExecutiveController; let prediction: PredictionController;
let regOwner: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let sourcingOwner: AuthenticatedPrincipal; let brandt: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B32 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
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
const preview = (as: AuthenticatedPrincipal, id: string, v: number) => ex.preview(req(as, 'prediction.exposure.read', id), T(), D(), id, String(v)) as Promise<{ preview: Row }>;
const accept = (as: AuthenticatedPrincipal, id: string, v: number, payload: Row) => ex.accept(req(as, 'prediction.exposure.accept', id), T(), D(), id, String(v), { payload }) as Promise<{ acceptance: Row; routing: Row }>;
const contest = (as: AuthenticatedPrincipal, id: string, v: number, reason: string) => ex.contest(req(as, 'prediction.exposure.contest', id), T(), D(), id, String(v), { payload: { reason } }) as Promise<{ contest: Row }>;
const addControl = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.addControl(req(as, 'prediction.exposure.control.add', id), T(), D(), id, { payload }) as Promise<{ control: Row; routing: Row }>;
const route = (as: AuthenticatedPrincipal, id: string) => ex.route_(req(as, 'prediction.exposure.route', id), T(), D(), id) as Promise<{ routing: Row }>;
const hypothesis = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.declareHypothesis(req(as, 'prediction.exposure.hypothesis.declare', id), T(), D(), id, { payload }) as Promise<{ hypothesis: Row }>;
const sponsor = (as: AuthenticatedPrincipal, id: string, v: number, payload: Row) => ex.sponsor(req(as, 'prediction.exposure.sponsor', id), T(), D(), id, String(v), { payload }) as Promise<{ sponsorship: Row; evaluation: Row }>;
const openDecision = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.openResponse(req(as, 'prediction.exposure.respond', id), T(), D(), id, { payload }) as Promise<{ response: Row }>;
const closeExposure = (as: AuthenticatedPrincipal, id: string, payload: Row) => ex.close(req(as, 'prediction.exposure.close', id), T(), D(), id, { payload }) as Promise<{ closure: Row }>;
const declareCorrelation = (as: AuthenticatedPrincipal, payload: Row) => ex.declareCorrelation(req(as, 'prediction.exposure.correlation.declare'), T(), D(), { payload }) as Promise<{ correlation: Row }>;
const aggregate = (as: AuthenticatedPrincipal, members: string[]) => ex.aggregate(req(as, 'prediction.exposure.aggregate'), T(), D(), { payload: { members } }) as Promise<{ aggregation: Row }>;
const getExposure = (as: AuthenticatedPrincipal, id: string) => ex.get(req(as, 'prediction.exposure.read', id), T(), D(), id) as Promise<Row>;
const list = (as: AuthenticatedPrincipal) => ex.list(req(as, 'prediction.exposure.read'), T(), D()) as Promise<Row>;
const priority = (as: AuthenticatedPrincipal) => ex.priority(req(as, 'prediction.exposure.read'), T(), D()) as Promise<{ priority: Row }>;
const healthInputs = (as: AuthenticatedPrincipal, at?: string) => ex.healthInputs(req(as, 'prediction.exposure.read'), T(), D(), { payload: at === undefined ? {} : { at } }) as Promise<{ health: { inputs: Row[] } }>;
const declareStrategy = (as: AuthenticatedPrincipal, payload: Row) => w.graph.declare(h.req(as, 'graph.strategy.declare', String(payload['objectType']), null, 'graph'), T(), D(), { payload }) as Promise<{ strategy: { objectId: string } }>;
type Processing = { processing: { passes: Row[]; raised: Row[] } };
const processCandidates = () => prediction.processWarningCandidates(h.req(forecastOwner, 'prediction.warning.candidates.process', 'WRN', null), T(), D(), { payload: {} } as never) as unknown as Promise<Processing>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string; kind: string; role: string } }>;
const runAgent = (agentId: string, payload: Row) => exec.runAgent(h.req(executive, 'agent.trigger', 'AGT', agentId, 'prediction'), T(), D(), agentId, { payload: payload as never }) as Promise<{ run: { runId: string; outcome: string; stopReason: string | null; refusals: Row[]; outputs: Row } }>;

/* ───────────── the rows ───────────── */
const exposureRow = async (id: string): Promise<Row> => (await sql<Row>`select * from prediction.exposure_current where exposure_id = ${id}::uuid`.execute(su)).rows[0]!;
const versionRows = async (id: string) => (await sql<Row>`select * from prediction.exposure_versions where exposure_id = ${id}::uuid order by version`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from prediction.exposure_events where exposure_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const candidate = async (id: string) => (await sql<Row>`select * from prediction.warning_candidates where candidate_id = ${id}::uuid`.execute(su)).rows[0]!;
const warning = async (id: string) => (await sql<Row>`select * from prediction.warnings_current where warning_id = ${id}::uuid`.execute(su)).rows[0]!;
async function seedEntity(name: string): Promise<string> {
  const id = uuidv7(); const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', ${name}, ${name.toLowerCase()}, 'active', ${w.twinOwner.principalId}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${w.twinOwner.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
  return id;
}

/** A synthetic assessment (EUR amounts are fixtures). */
const riskAssessment = (over: Row = {}): Row => ({
  mechanism: 'A closure of the Bab el-Mandeb corridor delays the magnet shipments; the Regensburg line stops when the buffer runs out',
  probability: { low: 0.3, high: 0.6 }, impact: { low: 400_000, high: 900_000, unit: 'EUR' }, horizon: '2024-Q1', response_window_hours: 72, velocity: 'weeks',
  reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
  options: [{ key: 'dual-source', label: 'Qualify a second magnet source', kind: 'mitigate', cost: 120_000 }, { key: 'insure', label: 'Contingent business-interruption cover', kind: 'transfer' },
            { key: 'hold', label: 'Accept and watch the corridor', kind: 'accept' }],
  evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B32 harness)', ...over,
});

/** What the cases leave one another. */
let corridor = ''; let priceRisk = ''; let floodRisk = ''; let unassessed = ''; let morocco = ''; let capability = ''; let otherEntity = '';
let v1Digest = ''; let firstCandidate = ''; let warningId = ''; let oppV1Digest = ''; let riskAgent = ''; let oppAgent = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  ex = h.app.get(Xc); exec = h.app.get(Ec); prediction = h.app.get(Pc);
  regOwner = await h.humanWithSession(['risk_owner', 'strategy_owner', 'decision_owner'], 'b32-regensburg-risk-owner');
  otherOwner = await h.humanWithSession(['risk_owner'], 'b32-other-risk-owner');
  sourcingOwner = await h.humanWithSession(['risk_owner'], 'b32-sourcing-owner');
  brandt = await h.humanWithSession(['opportunity_sponsor', 'strategy_owner', 'decision_owner'], 'b32-l-brandt');
  analyst = await h.humanWithSession(['domain_analyst'], 'b32-analyst');
  executive = await h.humanWithSession(['executive'], 'b32-executive');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b32-forecast-owner');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b32-tenant-admin', 'TENANT');
  outsider = await h.humanWithSession(['collection_manager'], 'b32-collector');
  w = await bootDecisionWorld(h);
  otherEntity = await seedEntity('Regensburg Danube floodplain (B32 fixture)');
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B32 · risk and opportunity intelligence (0089 §R; F-P4-13)', () => {
  it('X1 · the TAXONOMY and the APPETITE: versioned, a named human\'s; 403, 422, 409, 404', async () => {
    const categories = [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' },
                        { key: 'market', label: 'Market', polarity: 'both' }, { key: 'supply_chain.logistics', label: 'Logistics', polarity: 'risk', parent: 'supply_chain' }];
    await refused(publishTaxonomy(analyst, { expectedVersion: 0, categories, reason: 'the first taxonomy of the domain' }), /./, 403);
    await refused(publishTaxonomy(executive, { expectedVersion: 0, categories: [...categories, { key: 'market', label: 'Market again', polarity: 'risk' }], reason: 'the first taxonomy of the domain' }), /risk taxonomy rejected: the category key market is named twice/, 422);
    const t = (await publishTaxonomy(executive, { expectedVersion: 0, categories, reason: 'the first taxonomy of the domain (B32 fixture)' })).taxonomy;
    expect(t).toMatchObject({ version: 1, supersedes: null });
    await refused(publishTaxonomy(executive, { expectedVersion: 0, categories, reason: 'a second publication on a stale read' }), /risk taxonomy rejected \(stale_version\)/, 409);
    await refused(approveAppetite(executive, { category: 'unknown', expectedVersion: 0, threshold: 1, unit: 'EUR', statement: 'no such category exists', reason: 'the first appetite' }), /no category unknown/, 404);
    await refused(approveAppetite(executive, { category: 'sourcing', expectedVersion: 0, threshold: 1, unit: 'EUR', statement: 'an opportunity category', reason: 'the first appetite' }), /files opportunities/, 422);
    const a = (await approveAppetite(executive, { category: 'supply_chain', expectedVersion: 0, threshold: 250_000, unit: 'EUR', statement: 'no single supply-chain exposure above EUR 250k residual', reason: 'the board\'s Q1 appetite (SYNTHETIC)' })).appetite;
    expect(a).toMatchObject({ category_key: 'supply_chain', version: 1, taxonomy_version: 1, unit: 'EUR', approved_by: executive.principalId });
    expect(Number(a['threshold'])).toBe(250_000);
    await refused(approveAppetite(executive, { category: 'supply_chain', expectedVersion: 0, threshold: 1, unit: 'EUR', statement: 'a stale second approval', reason: 'the stale read' }), /risk appetite rejected \(stale_version\)/, 409);
    const upd = await refusal(sql`update prediction.risk_appetites set threshold = 1`.execute(su));
    expect(upd.message).toMatch(/append/i);
    sixEvidence('X1', { fault_trace: { refused: ['403 analyst', '422 key twice', '409 stale taxonomy', '404 category', '422 opportunity category', '409 stale appetite'] }, watermark: { taxonomy: 1, appetite: 1 },
      consumer_behaviour: 'none: governance records', operator_action: 'the executive publishes and approves', recovery: 'the next version at the version read', reconciliation: { threshold: 250_000, unit: 'EUR' } });
  }, 120_000);

  it('X2 · REGISTER the corridor-closure RSK (declared through the Strategy Graph) as a risk owned by the Regensburg risk owner; 404, 422, 409, 403', async () => {
    corridor = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Corridor closure — Regensburg line', statement: 'A Bab el-Mandeb closure stops the magnet supply to the Regensburg line',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor is the driver of this exposure' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] })).strategy.objectId;
    await refused(register(outsider, { strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId }), /./, 403);
    await refused(register(analyst, { strategyObjectId: uuidv7(), polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId }), /no such RSK/, 404);
    await refused(register(analyst, { strategyObjectId: w.objectiveId, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId }), /no such RSK/, 404);
    await refused(register(analyst, { strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: analyst.principalId }), /exposure rejected \(owner\).*never left unowned/, 422);
    await refused(register(analyst, { strategyObjectId: corridor, polarity: 'risk', category: 'sourcing', owner: regOwner.principalId }), /files the polarity opportunity/, 422);
    const r = (await register(analyst, { strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId, reviewEveryDays: 30 })).exposure;
    expect(r).toMatchObject({ exposure_id: corridor, polarity: 'risk', category: 'supply_chain', taxonomy_version: 1, owner: regOwner.principalId, state: 'identified', drivers: 2 });
    await refused(register(analyst, { strategyObjectId: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId }), /exposure rejected \(duplicate\)/, 409);
    const drivers = (await sql<Row>`select driver_kind, driver_id::text, source from prediction.exposure_drivers where exposure_id = ${corridor}::uuid order by driver_kind`.execute(su)).rows;
    expect(drivers).toEqual([{ driver_kind: 'entity', driver_id: w.entityId, source: 'rests_on' }, { driver_kind: 'strategy', driver_id: w.objectiveId, source: 'rests_on' }]);
    expect((await events(corridor)).map((e) => e.event)).toEqual(['exposure.registered']);
    await refused(getExposure(analyst, uuidv7()), /no such exposure/, 404);
    await refused(getExposure(analyst, 'not-an-id'), /no such exposure/, 404);
    sixEvidence('X2', { fault_trace: { refused: ['403 collector', '404 unknown RSK', '404 an OBJ', '422 owner not a risk owner', '422 polarity/category', '409 twice'] }, watermark: { rsk: corridor },
      consumer_behaviour: { drivers: drivers.length }, operator_action: 'the risk owner declares the RSK; the analyst registers it', recovery: 'none needed', reconciliation: { state: 'identified' } });
  }, 120_000);

  it('X3 · ASSESS → PREVIEW → ACCEPT by THE OWNER (OBJ-22): the exact version, the residual with its computation, the appetite breach routed', async () => {
    await refused(assess(analyst, corridor, { expectedVersion: 0, assessment: riskAssessment({ probability: 0.4 }) }), /a point estimate is false precision/, 422);
    await refused(assess(analyst, corridor, { expectedVersion: 0, assessment: { ...riskAssessment(), probability: null, plausibility: undefined } }), /the likelihood is never left out/, 422);
    await refused(assess(analyst, corridor, { expectedVersion: 0, assessment: riskAssessment({ evidence: [{ object_id: uuidv7() }] }) }), /no such evidence object/, 404);
    const a = (await assess(analyst, corridor, { expectedVersion: 0, assessment: riskAssessment() })).assessment;
    expect(a).toMatchObject({ version: 1, state: 'proposed', assessed_kind: 'human' });
    v1Digest = String(a['digest']);
    await refused(assess(analyst, corridor, { expectedVersion: 0, assessment: riskAssessment() }), /exposure assessment rejected \(stale_version\)/, 409);
    const p = (await preview(regOwner, corridor, 1)).preview;
    expect(p).toMatchObject({ version: 1, digest: v1Digest, acceptable: true, would_supersede: [] });
    const res = obj(p['residual']);
    expect(Number(res['residual_low'])).toBe(120_000);
    expect(Number(res['residual_high'])).toBe(540_000);
    expect(res['breach']).toBe(true);
    expect(String(res['computation'])).toMatch(/probability \[0\.3, 0\.6\] × impact \[400000, 900000\] EUR.*no control declared.*exceeds the threshold 250000/);
    expect(String(p['consequence'])).toMatch(/exceeds the appetite of supply_chain: accepting records the breach and routes a warning candidate to the owner/);
    await refused(accept(otherOwner, corridor, 1, { digest: v1Digest, rationale: 'another risk owner tries to accept' }), /accepted by the exposure's owner/, 403);
    await refused(accept(analyst, corridor, 1, { digest: v1Digest, rationale: 'the analyst tries to accept' }), /./, 403);
    await refused(accept(regOwner, corridor, 1, { digest: 'f'.repeat(64), rationale: 'accepting a digest never previewed' }), /exposure acceptance rejected \(stale_digest\)/, 409);
    await refused(accept(regOwner, corridor, 1, { digest: v1Digest, rationale: 'short' }), /rationale is 8\.\.2000 characters/, 422);
    const acc = await accept(regOwner, corridor, 1, { digest: v1Digest, rationale: 'The assessment matches the corridor evidence; accepted as the current exposure model.' });
    expect(acc.acceptance).toMatchObject({ version: 1, state: 'accepted', route_due: true });
    expect(obj(acc.acceptance['residual'])).toMatchObject({ breach: true, cause: 'acceptance' });
    expect(acc.routing).toMatchObject({ state: 'routed', routed_to: regOwner.principalId });
    firstCandidate = String(obj(acc.routing['candidate'])['candidate_id']);
    expect(obj(acc.routing['candidate'])).toMatchObject({ repeated: false, state: 'pending' });
    await refused(accept(regOwner, corridor, 1, { digest: v1Digest, rationale: 'accepting the same version twice' }), /exposure acceptance rejected \(already_accepted\)/, 409);
    const x = await exposureRow(corridor);
    expect(x).toMatchObject({ state: 'accepted', accepted_version: 1, accepted_by: regOwner.principalId, routed_candidate_id: firstCandidate });
    expect((await events(corridor)).map((e) => e.event)).toEqual(['exposure.registered', 'exposure.assessed', 'exposure.assessment_accepted', 'exposure.residual_computed', 'exposure.appetite_breached', 'exposure.routed']);
    // the version is immutable but for its state
    const imm = await refusal(sql`update prediction.exposure_versions set mechanism = 'rewritten after the fact' where exposure_id = ${corridor}::uuid and version = 1`.execute(su));
    expect(imm.message).toMatch(/is immutable; only its state changes/);
    sixEvidence('X3', { fault_trace: { refused: ['422 point probability', '422 no likelihood', '404 evidence', '409 stale version', '403 another owner (port)', '403 analyst (PDP)', '409 stale digest', '409 twice'] },
      watermark: { version: 1, digest: v1Digest.slice(0, 12) }, consumer_behaviour: { residual: [res['residual_low'], res['residual_high']], breach: true },
      operator_action: 'the analyst assesses; the owner previews and accepts', recovery: 'a stale digest is previewed again', reconciliation: { candidate: firstCandidate } });
  }, 180_000);

  it('X4 · the breach becomes a WARNING by the §W path — origin exposure, routed to the EXPOSURE\'S OWNER; a second routing is `repeated`', async () => {
    const c = await candidate(firstCandidate);
    expect(c).toMatchObject({ origin_kind: 'exposure', consequence_class: 'C3', cause_key: `exposure:${corridor}`, state: 'pending' });
    expect(obj(c['affected'])['objectives']).toEqual([w.objectiveId]);
    expect(obj(c['origin_ref'])).toMatchObject({ exposure_id: corridor, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId, unit: 'EUR' });
    const p = await processCandidates();
    const raised = p.processing.raised.find((r) => r['candidate_id'] === firstCandidate)!;
    expect(raised['decision']).toBe('raised');
    warningId = String(raised['warning_id']);
    const wr = await warning(warningId);
    // the objective's owner is the twin owner; the exposure's owner is the Regensburg risk owner — the warning goes to the EXPOSURE'S owner
    expect(wr).toMatchObject({ origin_kind: 'exposure', routed_to: regOwner.principalId, state: 'raised' });
    expect(obj(wr['origin_ref'])).toMatchObject({ exposure_id: corridor, candidate_id: firstCandidate });
    const again = (await route(regOwner, corridor)).routing;
    expect(obj(again['candidate'])).toMatchObject({ candidate_id: firstCandidate, repeated: true, state: 'raised', warning_id: warningId });
    await refused(route(analyst, corridor), /./, 403);
    const g = await getExposure(regOwner, corridor);
    expect(obj(g['candidate'])).toMatchObject({ candidate_id: firstCandidate, state: 'raised' });
    expect(obj(g['warning'])).toMatchObject({ warning_id: warningId, routed_to: regOwner.principalId, origin_kind: 'exposure' });
    sixEvidence('X4', { fault_trace: { refused: ['403 analyst routes'] }, watermark: { candidate: firstCandidate, warning: warningId }, consumer_behaviour: { routed_to: 'the exposure owner', objective_owner: 'the twin owner' },
      operator_action: 'the forecast owner processes the intake', recovery: 'a second routing answers repeated', reconciliation: { origin_kind: wr['origin_kind'] } });
  }, 180_000);

  it('X5 · CONTROLS reduce the residual (the conservative end stays conservative): still outside → a new candidate CLUSTERS; within → nothing routed', async () => {
    await refused(addControl(regOwner, corridor, { title: 'Dual sourcing contract', kind: 'preventive', effectiveness: { low: 0.7, high: 0.5 }, owner: regOwner.principalId }), /effectiveness is a bracket/, 422);
    await refused(addControl(regOwner, corridor, { title: 'Dual sourcing contract', kind: 'preventive', effectiveness: { low: 0.5, high: 0.7 }, owner: w.machinePrincipalId }), /exposure control rejected \(owner\)/, 422);
    const c1 = await addControl(regOwner, corridor, { title: 'Dual sourcing contract (framework)', kind: 'preventive', effectiveness: { low: 0.5, high: 0.7 }, owner: regOwner.principalId });
    const r1 = obj(c1.control['residual']);
    expect(Number(r1['residual_low'])).toBeCloseTo(36_000, 3);     // 120000 × (1 − 0.7)
    expect(Number(r1['residual_high'])).toBeCloseTo(270_000, 3);   // 540000 × (1 − 0.5)
    expect(r1['breach']).toBe(true);
    expect(c1.routing).toMatchObject({ state: 'routed' });
    const second = String(obj(c1.routing['candidate'])['candidate_id']);
    expect(second).not.toBe(firstCandidate);
    const p = await processCandidates();
    expect(p.processing.passes.flatMap((x) => arr(x['clustered'])).map((x) => x['candidate_id'])).toContain(second);
    expect(await candidate(second)).toMatchObject({ state: 'clustered', warning_id: warningId });
    const c2 = await addControl(regOwner, corridor, { title: 'Four-week magnet buffer', kind: 'corrective', effectiveness: { low: 0.2, high: 0.3 }, owner: regOwner.principalId });
    const r2 = obj(c2.control['residual']);
    expect(Number(r2['residual_high'])).toBeCloseTo(216_000, 3);   // 900000 × 0.6 × 0.5 × 0.8
    expect(r2['breach']).toBe(false);
    expect(c2.routing).toMatchObject({ state: 'not_due' });
    await refused(route(regOwner, corridor), /exposure routing rejected \(no_breach\).*within appetite/, 409);
    sixEvidence('X5', { fault_trace: { refused: ['422 inverted bracket', '422 an agent owns a control', '409 route within appetite'] }, watermark: { residuals: [r1['residual_high'], r2['residual_high']] },
      consumer_behaviour: { clustered: second }, operator_action: 'the owner adds two controls', recovery: 'none needed', reconciliation: { breach: [r1['breach'], r2['breach']] } });
  }, 180_000);

  it('X6 · THE MITIGATION DECISION: DEC resting on the RSK + package + link; a refused link after two commits answers 409 naming them; RESUMED', async () => {
    const opened = (await openDecision(regOwner, corridor, { kind: 'mitigate', decision: { title: 'Mitigate the corridor closure', statement: 'dual-source the magnets or buffer the line' } })).response;
    expect(opened).toMatchObject({ kind: 'mitigate', repeated: false });
    const dec = String(opened['decision_object_id']); const pkg = String(opened['package_id']);
    const dep = (await sql<Row>`select depends_on_kind, depends_on_id::text from graph.dependencies where dependent_object_id = ${dec}::uuid and state = 'active'`.execute(su)).rows;
    expect(dep).toEqual([{ depends_on_kind: 'strategy', depends_on_id: corridor }]);
    expect((await sql<Row>`select object_type, owner_principal_id::text owner from graph.strategy_current where strategy_object_id = ${dec}::uuid`.execute(su)).rows[0]).toEqual({ object_type: 'DEC', owner: regOwner.principalId });
    expect((await sql<Row>`select decision_object_id::text dec, state from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]).toEqual({ dec, state: 'draft' });
    // a response of the wrong kind: the DEC and the package commit, the link is refused — 409 naming what stands
    const r = await refused(openDecision(regOwner, corridor, { kind: 'exploit', decision: { title: 'Exploit a risk (wrong kind)', statement: 'refused at the link' } }), /partly opened \(decisionObjectId .*, packageId .* stand\).*exploit is not a response to this risk/, 409);
    const ids = /decisionObjectId ([0-9a-f-]{36}), packageId ([0-9a-f-]{36})/.exec(r.message)!;
    const resumed = (await openDecision(regOwner, corridor, { kind: 'transfer', decision: { decisionObjectId: ids[1], packageId: ids[2] } })).response;
    expect(resumed).toMatchObject({ kind: 'transfer', decision_object_id: ids[1], package_id: ids[2], repeated: false });
    const again = (await openDecision(regOwner, corridor, { kind: 'transfer', decision: { decisionObjectId: ids[1], packageId: ids[2] } })).response;
    expect(again).toMatchObject({ repeated: true });
    await refused(openDecision(analyst, corridor, { kind: 'mitigate' }), /./, 403);
    const g = await getExposure(regOwner, corridor);
    const responses = arr(g['responses']);
    expect(responses.map((x) => x['response_kind']).sort()).toEqual(['mitigate', 'transfer']);
    expect(obj(responses[0]!['package'])).toMatchObject({ state: 'draft' });
    expect(arr(responses[0]!['outcomes'])).toEqual([]);   // the outcome is the decision's own (0045 record_outcome): read beside, never copied
    sixEvidence('X6', { fault_trace: { refused: ['409 exploit on a risk after two commits', '403 analyst'] }, watermark: { dec, pkg }, consumer_behaviour: { responses: responses.length },
      operator_action: 'the risk owner opens the mitigation decision', recovery: 'resumed with the committed DEC and package', reconciliation: { repeated: again['repeated'] } });
  }, 180_000);

  it('X7 · THE CHALLENGE: the assessor does not contest their own version; the executive contests the ACCEPTED one — contested', async () => {
    await refused(contest(analyst, corridor, 1, 'the assessor challenges their own work'), /the assessor of version 1 does not contest it/, 403);
    await refused(contest(executive, corridor, 1, 'short'), /8\.\.2000 characters/, 422);
    await refused(contest(executive, corridor, 9, 'no such version to challenge'), /no such version 9/, 404);
    const c = (await contest(executive, corridor, 1, 'The probability bracket ignores the reopened Cape route; challenged')).contest;
    expect(c).toMatchObject({ version: 1, state: 'contested', was: 'accepted', exposure_state: 'contested' });
    expect(await exposureRow(corridor)).toMatchObject({ state: 'contested', accepted_version: 1 });
    sixEvidence('X7', { fault_trace: { refused: ['403 self-challenge', '422 no reason', '404 version'] }, watermark: { version: 1 }, consumer_behaviour: { exposure_state: 'contested' },
      operator_action: 'the executive challenges', recovery: 'the owner accepts again (X11)', reconciliation: c });
  }, 60_000);

  it('X8 · THE OPPORTUNITY: the Morocco supplier on the SAME corridor (a shared driver) and a capability; a hypothesis; an assessment', async () => {
    capability = (await declareStrategy(regOwner, { objectType: 'CAP', title: 'Regensburg magnet assembly', statement: 'the line\'s capability to assemble the magnet sub-assembly',
      restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the capability serves the objective' }] })).strategy.objectId;
    morocco = (await declareStrategy(brandt, { objectType: 'RSK', title: 'Alternative supplier in Morocco', statement: 'The corridor change opens a qualified magnet supplier in Morocco',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the same corridor change drives the opportunity' }, { kind: 'strategy', id: w.objectiveId, rationale: 'the supplier serves the objective' }] })).strategy.objectId;
    const r = (await register(brandt, { strategyObjectId: morocco, polarity: 'opportunity', category: 'sourcing', owner: sourcingOwner.principalId, reviewEveryDays: 60 })).exposure;
    expect(r).toMatchObject({ polarity: 'opportunity', owner: sourcingOwner.principalId, drivers: 2 });
    const hyp = { statement: 'A Moroccan magnet supplier can be qualified before Q2 and shortens the chain by three weeks',
                  falsifier: 'The supplier fails the magnet grade test or cannot ship 20 t per month', value: { low: 150_000, high: 400_000, unit: 'EUR' },
                  timing: { window: '2024-Q2', from: '2024-04-01', to: '2024-06-30' }, options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: [capability] };
    await refused(hypothesis(brandt, morocco, { ...hyp, capabilities: [uuidv7()] }), /no such capability/, 404);
    await refused(hypothesis(brandt, morocco, { ...hyp, value: { low: 400_000, high: 150_000, unit: 'EUR' } }), /a single number is an unsupported value claim/, 422);
    await refused(hypothesis(brandt, corridor, hyp), /a hypothesis states an opportunity/, 422);
    expect((await hypothesis(brandt, morocco, hyp)).hypothesis).toMatchObject({ version: 1 });
    const a = (await assess(analyst, morocco, { expectedVersion: 0, assessment: {
      mechanism: 'The corridor change makes the Moroccan route faster than the Cape; qualifying the supplier captures the saving',
      plausibility: 'medium', impact: { low: 150_000, high: 400_000, unit: 'EUR' }, horizon: '2024-Q2', response_window_hours: 336, reversibility: 'reversible', controllability: 'high',
      options: [{ key: 'qualify', label: 'Qualify the Moroccan supplier', kind: 'exploit', cost: 60_000 }, { key: 'wait', label: 'Wait a quarter', kind: 'defer' }], confidence: 0.4 } })).assessment;
    oppV1Digest = String(a['digest']);
    sixEvidence('X8', { fault_trace: { refused: ['404 capability', '422 inverted value', '422 hypothesis on a risk'] }, watermark: { opportunity: morocco, cap: capability }, consumer_behaviour: { shared_driver: w.entityId },
      operator_action: 'L. Brandt declares and registers; the analyst assesses', recovery: 'none needed', reconciliation: { version: a['version'] } });
  }, 120_000);

  it('X9 · THE RISK AND OPPORTUNITY AGENTS propose only: an estimate and a correlation, their acceptance and sponsorship REFUSED and recorded', async () => {
    // a second risk on the same corridor (the correlation the agent estimates) and a third on another driver (X11)
    priceRisk = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Magnet price spike', statement: 'A corridor closure drives the magnet spot price up',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor drives the price' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: priceRisk, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId });
    const base = { ownerPrincipalId: regOwner.principalId, escalationPrincipalId: executive.principalId, budgets: { max_reads: 10, max_gateway_calls: 0, max_elapsed_ms: 60_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] };
    await refused(registerAgent({ ...base, kind: 'risk', version: RISK_AGENT_VERSION, codeDigest: 'a'.repeat(64) }), /registered with this runtime's estimate/, 422);
    riskAgent = (await registerAgent({ ...base, kind: 'risk', version: RISK_AGENT_VERSION, codeDigest: RISK_AGENT_DIGEST })).agent.agentId;
    oppAgent = (await registerAgent({ ...base, kind: 'opportunity', version: OPPORTUNITY_AGENT_VERSION, codeDigest: OPPORTUNITY_AGENT_DIGEST })).agent.agentId;
    await refused(runAgent(riskAgent, { task: 'opportunity_assess' }), /does not run this task/, 403);   // a risk agent does not run the opportunity estimate
    const r1 = (await runAgent(riskAgent, { task: 'risk_assess' })).run;
    expect(r1.outcome).toBe('finished');
    const est = arr(r1.outputs['estimated']);
    expect(est.map((x) => x['exposure_id'])).toEqual([corridor]);     // the price risk has no human assessment: it WAITS
    expect(arr(r1.outputs['waiting']).map((x) => x['exposure_id'])).toContain(priceRisk);
    expect(arr(r1.outputs['correlations']).map((x) => [x['exposure_a'], x['exposure_b']].sort())).toEqual([[corridor, priceRisk].sort()]);
    expect(arr(r1.outputs['correlations'])[0]).toMatchObject({ relation: 'correlated', estimated_kind: 'agent' });
    expect(r1.refusals.map((x) => x['action'])).toContain('prediction.exposure.accept');
    const v2 = (await versionRows(corridor)).find((v) => v['version'] === 2)!;
    expect(v2).toMatchObject({ assessed_kind: 'agent', state: 'proposed', based_on_version: 1, agent_run_id: r1.runId, estimate_rule: 'exposure-estimate@1' });
    expect(Number(v2['probability_high'])).toBeCloseTo(0.8, 4);        // 0.6 moved halfway to 1 by the open exposure warning
    expect(arr(v2['evidence']).map((e) => e['object_id'])).toContain(warningId);
    expect(await exposureRow(corridor)).toMatchObject({ accepted_version: 1 });   // nothing the agent wrote is accepted
    const r2 = (await runAgent(riskAgent, { task: 'risk_assess' })).run;
    expect(arr(r2.outputs['estimated'])).toEqual([]);
    expect(arr(r2.outputs['unchanged']).map((x) => x['exposure_id'])).toContain(corridor);
    const o1 = (await runAgent(oppAgent, { task: 'opportunity_assess' })).run;
    expect(o1.outcome).toBe('finished');
    expect(arr(o1.outputs['estimated']).map((x) => x['exposure_id'])).toEqual([morocco]);
    expect(o1.refusals.map((x) => x['action'])).toContain('prediction.exposure.sponsor');
    const ov2 = (await versionRows(morocco)).find((v) => v['version'] === 2)!;
    expect(ov2).toMatchObject({ assessed_kind: 'agent', plausibility: 'high', state: 'proposed' });
    const runs = (await sql<{ refusals: Row[]; outcome: string }>`select refusals, outcome from executive.agent_runs where run_id = any(${[r1.runId, o1.runId]}::uuid[])`.execute(su)).rows;
    expect(runs.flatMap((x) => x.refusals.map((y) => y['action'])).sort()).toEqual(['prediction.exposure.accept', 'prediction.exposure.sponsor']);
    // a human assessment is a human's port: the agent's principal is refused there too (the PDP names no agent)
    sixEvidence('X9', { fault_trace: { refused: ['422 foreign digest', 'accept (PDP, recorded)', 'sponsor (PDP, recorded)'] }, watermark: { runs: [r1.runId, r2.runId, o1.runId] },
      consumer_behaviour: { estimated: est.length, correlations: arr(r1.outputs['correlations']).length }, operator_action: 'the executive triggers the agents',
      recovery: 'a second run proposes nothing new', reconciliation: { probability_high: v2['probability_high'] } });
  }, 180_000);

  it('X10 · SPONSORSHIP (OBJ-23): never the agent\'s estimate nor a stale digest; L. Brandt sponsors the human assessment — the evaluation OPENED', async () => {
    const agentDigest = String((await versionRows(morocco)).find((v) => v['version'] === 2)!['digest']);
    const terms = { option_key: 'qualify', rationale: 'The saving justifies a qualification budget this quarter', conditions: ['the grade test passes', 'the supplier signs a 20 t/month frame'],
                    budget: { amount: 60_000, unit: 'EUR' }, objective_id: w.objectiveId };
    await refused(sponsor(regOwner, morocco, 1, { digest: oppV1Digest, terms }), /./, 403);
    await refused(sponsor(brandt, morocco, 2, { digest: agentDigest, terms }), /exposure sponsorship rejected \(agent_estimate\)/, 409);
    await refused(sponsor(brandt, morocco, 1, { digest: 'e'.repeat(64), terms }), /exposure sponsorship rejected \(stale_digest\)/, 409);
    await refused(sponsor(brandt, morocco, 1, { digest: oppV1Digest, terms: { ...terms, option_key: 'nope' } }), /not one of version 1's options/, 422);
    await refused(sponsor(brandt, priceRisk, 1, { digest: oppV1Digest, terms }), /is a risk; a risk is accepted by its owner, not sponsored/, 422);
    const s = await sponsor(brandt, morocco, 1, { digest: oppV1Digest, terms, decision: { title: 'Evaluate the Moroccan supplier', statement: 'qualify, defer or abandon the supplier' } });
    expect(s.sponsorship).toMatchObject({ sponsor: brandt.principalId, version: 1, state: 'sponsored', evaluation_owed: true });
    expect(s.evaluation).toMatchObject({ state: 'opened', kind: 'exploit', repeated: false });
    const dec = String(s.evaluation['decision_object_id']);
    const deps = (await sql<{ id: string }>`select depends_on_id::text id from graph.dependencies where dependent_object_id = ${dec}::uuid and state = 'active' order by 1`.execute(su)).rows.map((x) => x.id);
    expect(deps).toEqual([morocco, w.objectiveId].sort());
    expect(await exposureRow(morocco)).toMatchObject({ state: 'sponsored', sponsor_principal_id: brandt.principalId, sponsored_version: 1 });
    await refused(sponsor(brandt, morocco, 1, { digest: oppV1Digest, terms }), /exposure sponsorship rejected \(already_sponsored\)/, 409);
    sixEvidence('X10', { fault_trace: { refused: ['403 risk owner (no sponsor role)', '409 agent estimate', '409 stale digest', '422 unknown option', '409 twice'] }, watermark: { dec, pkg: s.evaluation['package_id'] },
      consumer_behaviour: { evaluation: 'opened' }, operator_action: 'L. Brandt sponsors', recovery: 'an unopened evaluation answers owed with the resume ids', reconciliation: s.sponsorship['terms'] });
  }, 180_000);

  it('X11 · AGGREGATION without double counting: MAX over a shared driver, BOUNDED until independence is declared, then SUM; refused members 409', async () => {
    // the price risk assessed and accepted (EUR); the flood risk on ANOTHER driver
    await assess(analyst, priceRisk, { expectedVersion: 0, assessment: riskAssessment({ mechanism: 'A corridor closure spikes the magnet spot price for the quarter', probability: { low: 0.2, high: 0.5 }, impact: { low: 100_000, high: 300_000, unit: 'EUR' } }) });
    const pv = await versionRows(priceRisk);
    await accept(regOwner, priceRisk, 1, { digest: String(pv[0]!['digest']), rationale: 'Accepted: the price effect is bounded by the frame contract.' });
    floodRisk = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Danube flood at Regensburg', statement: 'A flood closes the plant access roads',
      restsOn: [{ kind: 'entity', id: otherEntity, rationale: 'the floodplain drives this exposure' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: floodRisk, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId, reviewEveryDays: 1 });
    await assess(analyst, floodRisk, { expectedVersion: 0, assessment: riskAssessment({ mechanism: 'A spring flood closes the access roads for up to two weeks', probability: { low: 0.1, high: 0.2 }, impact: { low: 200_000, high: 500_000, unit: 'EUR' } }) });
    await accept(regOwner, floodRisk, 1, { digest: String((await versionRows(floodRisk))[0]!['digest']), rationale: 'Accepted: seasonal, insured in part.' });
    unassessed = (await declareStrategy(regOwner, { objectType: 'RSK', title: 'Supplier insolvency', statement: 'A tier-2 supplier fails', restsOn: [{ kind: 'entity', id: otherEntity, rationale: 'placeholder driver for the fixture' }] })).strategy.objectId;
    await register(analyst, { strategyObjectId: unassessed, polarity: 'risk', category: 'supply_chain', owner: regOwner.principalId });
    // REFUSED: the corridor is contested (X7), the insolvency unassessed — every reason named
    const bad = await refused(aggregate(analyst, [corridor, priceRisk, unassessed]), /exposure aggregation rejected \(invalid_members\)/, 409);
    expect(bad.message).toMatch(new RegExp(`${corridor} contested`));
    expect(bad.message).toMatch(new RegExp(`${unassessed} unaccepted \\(never assessed\\)`));
    await refused(aggregate(analyst, [corridor, morocco]), /risks and opportunities are not rolled up together/, 422);
    await refused(aggregate(outsider, [corridor, priceRisk]), /./, 403);
    // the owner resolves the challenge: v2 is the agent's estimate — the OWNER may accept it (a human's act on an agent's recommendation)
    const v2 = (await versionRows(corridor)).find((v) => v['version'] === 2)!;
    const acc = await accept(regOwner, corridor, 2, { digest: String(v2['digest']), rationale: 'The owner accepts the re-estimate after the challenge.' });
    expect(acc.acceptance).toMatchObject({ version: 2, superseded: [1] });
    expect(await exposureRow(corridor)).toMatchObject({ state: 'accepted', accepted_version: 2 });
    const cr = obj(acc.acceptance['residual']);          // 0.8 × 900000 × 0.5 × 0.8 = 288000 > 250000
    expect(Number(cr['residual_high'])).toBeCloseTo(288_000, 3);
    // ONE CLUSTER over the shared corridor driver: the MAX, never the sum
    const one = (await aggregate(analyst, [corridor, priceRisk])).aggregation;
    expect(one['method']).toBe('max');
    expect(Number(obj(one['total'])['high'])).toBeCloseTo(288_000, 3);
    expect(Number(one['naive_sum_high'])).toBeCloseTo(288_000 + 150_000, 3);
    expect(arr(arr(one['clusters'])[0]!['shared_drivers'])).toEqual([{ kind: 'entity', id: w.entityId }]);
    expect(arr(one['agent_estimates_not_used']).length).toBe(1);   // the agent's correlation estimate is listed, never used
    // another driver, dependence undeclared: BOUNDED
    const two = (await aggregate(analyst, [corridor, floodRisk])).aggregation;
    expect(two['method']).toBe('bounded');
    expect(Number(obj(two['total'])['low'])).toBeCloseTo(Math.max(Number(cr['residual_low']), 20_000), 3);
    expect(Number(obj(two['total'])['high'])).toBeCloseTo(288_000 + 100_000, 3);
    await refused(declareCorrelation(analyst, { a: corridor, b: corridor, relation: 'independent', basis: 'a pair of one' }), /two different exposures/, 422);
    await declareCorrelation(analyst, { a: floodRisk, b: corridor, relation: 'independent', basis: 'A flood and a corridor closure share no driver (hydrology vs geopolitics)' });
    const three = (await aggregate(analyst, [corridor, floodRisk])).aggregation;
    expect(three['method']).toBe('sum');
    expect(Number(obj(three['total'])['high'])).toBeCloseTo(388_000, 3);
    // a STALE member (its review cadence lapsed — the acceptance instant moved back by the superuser, a stated fixture)
    await sql`update prediction.exposure_current set accepted_at = accepted_at - interval '3 days' where exposure_id = ${floodRisk}::uuid`.execute(su);
    await refused(aggregate(analyst, [corridor, floodRisk]), new RegExp(`${floodRisk} stale \\(accepted .* review every 1 days\\)`), 409);
    sixEvidence('X11', { fault_trace: { refused: ['409 contested + unaccepted', '422 mixed polarity', '403 collector', '422 a pair of one', '409 stale'] },
      watermark: { methods: [one['method'], two['method'], three['method']] }, consumer_behaviour: { max: obj(one['total'])['high'], naive: one['naive_sum_high'] },
      operator_action: 'the analyst rolls up; the owner resolves the challenge; a human declares independence', recovery: 'the owner accepts again → admitted',
      reconciliation: { bounded: obj(two['total']), sum: obj(three['total']) } });
  }, 240_000);

  it('X12 · THE REGISTER and THE PRIORITY: symmetric, gaps shown, lexicographic within polarity and unit, no input last', async () => {
    const l = await list(regOwner);
    const risks = arr(l['risks']); const opps = arr(l['opportunities']);
    expect(risks.map((x) => x['exposure_id'])).toEqual(expect.arrayContaining([corridor, priceRisk, floodRisk, unassessed]));
    expect(opps.map((x) => x['exposure_id'])).toEqual([morocco]);
    expect(risks.find((x) => x['exposure_id'] === unassessed)!['gaps']).toEqual(['unassessed']);
    expect(String(arr(risks.find((x) => x['exposure_id'] === floodRisk)!['gaps'])[0])).toMatch(/^stale/);
    expect(risks.find((x) => x['exposure_id'] === corridor)!['breach']).toBe(true);
    expect(opps[0]!['gaps']).toEqual(['unaccepted (an agent\'s estimate is a recommendation)']);
    expect(obj(l['counts'])).toMatchObject({ risks: 4, opportunities: 1, outside_appetite: 1 });
    const p = (await priority(analyst)).priority;
    const eur = arr(p['groups']).find((g) => g['group'] === 'risk · EUR')!;
    const order = arr(eur['items']).map((x) => x['exposure_id']);
    expect(order[0]).toBe(corridor);                                  // outside appetite first
    expect(String(obj(arr(eur['items'])[0]!['priority'])['explanation'])).toMatch(/^outside appetite · 72(\.0)? h response window · probability up to 0\.8/);
    expect(String(obj(p)['rule'])).toMatch(/no weighted score/);
    const noInput = arr(p['groups']).flatMap((g) => arr(g['items'])).find((x) => x['exposure_id'] === unassessed)!;
    expect(String(obj(noInput['priority'])['explanation'])).toMatch(/appetite: not judged · response window: no input · likelihood: no input/);
    // the IMMUTABLE key: breach first, then no input after an input
    const k = (await sql<{ a: string[]; b: string[] }>`select prediction.exposure_priority_key('{"breach": true, "hours_to_window": 72}'::jsonb)::text[] a, prediction.exposure_priority_key('{}'::jsonb)::text[] b`.execute(su)).rows[0]!;
    expect(k.a.slice(0, 2)).toEqual(['0', '72']);
    expect(k.b.every((x) => x === null)).toBe(true);
    sixEvidence('X12', { fault_trace: { gaps: risks.map((x) => x['gaps']) }, watermark: { groups: arr(p['groups']).map((g) => g['group']) }, consumer_behaviour: { order },
      operator_action: 'a read', recovery: 'none needed', reconciliation: obj(l['counts']) });
  }, 120_000);

  it('X13 · THE HEALTH BRANCH: exactly the contract\'s columns; one row per accepted exposure, as of the instant', async () => {
    const sig = (await sql<{ a: string; b: string }>`select pg_get_function_result('prediction.health_inputs(uuid,uuid,timestamptz)'::regprocedure) a, pg_get_function_result('executive.health_measure_inputs(uuid,uuid,timestamptz)'::regprocedure) b`.execute(su)).rows[0]!;
    expect(sig.a).toBe(sig.b);
    // the opportunity's owner accepts the human assessment, so it enters the branch
    await accept(sourcingOwner, morocco, 1, { digest: oppV1Digest, rationale: 'The owner accepts the value range the sponsor sponsored.' });
    const rows = (await healthInputs(analyst)).health.inputs;
    const byId = new Map(rows.map((r) => [String(r['input_id']), r]));
    expect([...byId.keys()].sort()).toEqual([corridor, priceRisk, floodRisk, morocco].sort());
    const c = byId.get(corridor)!;
    expect(c).toMatchObject({ input_kind: 'risk', input_version: '2', label: 'Corridor closure — Regensburg line', unit: 'EUR', direction: 'lower_better', objective_ids: [w.objectiveId] });
    expect(Number(c['value'])).toBeCloseTo(288_000, 3);
    expect(Number(c['expected_every_days'])).toBe(30);
    expect(Number(c['confidence'])).toBeCloseTo(0.6, 4);
    expect(obj(c['exposure'])).toMatchObject({ kind: 'risk', id: corridor, unit: 'EUR' });
    expect(String(c['basis'])).toMatch(/outside appetite/);
    const m = byId.get(morocco)!;
    expect(m).toMatchObject({ input_kind: 'opportunity', direction: 'higher_better', expected_every_days: '60' });
    expect(Number(m['value'])).toBe(400_000);
    const before = (await healthInputs(analyst, '2020-01-01T00:00:00Z')).health.inputs;
    expect(before).toEqual([]);
    sixEvidence('X13', { fault_trace: { none: true }, watermark: { at: 'now', rows: rows.length }, consumer_behaviour: { kinds: rows.map((r) => r['input_kind']) }, operator_action: 'a read',
      recovery: 'as of before any acceptance: no row', reconciliation: { signature_equal: sig.a === sig.b } });
  }, 120_000);

  it('X14 · CLOSURE with a criterion: the owner; 403 the analyst; 409 twice; nothing assessed after', async () => {
    await refused(closeExposure(analyst, unassessed, { criterion: 'withdrawn', reason: 'the analyst tries to close' }), /./, 403);
    await refused(closeExposure(regOwner, unassessed, { criterion: 'forgotten', reason: 'not a criterion' }), /criterion is/, 422);
    const c = (await closeExposure(regOwner, unassessed, { criterion: 'withdrawn', reason: 'The tier-2 supplier was replaced; the exposure no longer exists.' })).closure;
    expect(c).toMatchObject({ state: 'closed' });
    await refused(closeExposure(regOwner, unassessed, { criterion: 'withdrawn', reason: 'closing it a second time' }), /exposure closure rejected \(closed\)/, 409);
    await refused(assess(analyst, unassessed, { expectedVersion: 0, assessment: riskAssessment() }), /exposure assessment rejected \(closed\)/, 409);
    sixEvidence('X14', { fault_trace: { refused: ['403 analyst', '422 criterion', '409 twice', '409 assess after'] }, watermark: { closed: unassessed }, consumer_behaviour: c,
      operator_action: 'the owner closes', recovery: 'none needed', reconciliation: { state: 'closed' } });
  }, 60_000);
});
