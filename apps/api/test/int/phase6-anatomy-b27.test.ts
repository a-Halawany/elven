/**
 * CP-6 B27 (migration 0097 §A, part `anatomy`) — F-P4-07 SCENARIO ANATOMY on a real database, through the product's own routes (the anatomy
 * controller …/prediction/scenarios/anatomy/*, the graph's strategy declare and assumption verify, the prediction declare and indicator
 * evaluation, the twin run), the world of `bootDecisionWorld` and B27's own humans with sessions of their own (the ports compare the acting
 * principal). EVERY FIGURE IS SYNTHETIC (the fixture's transits series, the harness's names).
 *
 *   A · ELEMENTS (a): drivers, actors, mechanisms — declared per scenario and per branch, REVISED (the version read named), RETIRED (reasoned,
 *       refused while another element rests on it), never deleted; the dependencies and graph references validated.
 *   B · INTERVENTIONS AND IMPACTS (b): the scenario-level intervention → mechanism → impact MAP per branch, an unmapped intervention named.
 *   C · THE ASSUMPTION REGISTER (c): links to live ASUs of the Knowledge Graph, critical or not, each with its invalidation condition
 *       (state, claim, indicator); revise, unlink, relink — versioned; the read shows the ASU's current verification state.
 *   D · THE SUSPENSION (d): the strategy owner INVALIDATES the critical ASU through the graph's route → the disruption branch SUSPENDED in
 *       the same act (branch.suspended, cause assumption), its OWNER tasked (scenario.suspension, subject kind branch); a non-critical link
 *       only noted; the suspended branch does not flip, a run on it is refused (run rejected (branch_suspended)), it is not decision-active;
 *       reinstatement refused (PDP, ownership, still invalidated) until the ASU is verified again — then reinstated by the branch owner to
 *       the state it was suspended from, the item closed, the run admitted. A person's suspension of a FLIPPED branch returns it to flipped;
 *       a scenario-wide critical link suspends every live branch; an unlink (reasoned) lets a branch be reinstated.
 *   E · RECORDS (e): narrative, implication and option records with validated citations; a revision supersedes once; append-only.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. The scheduler is NOT enabled; nothing here is a real external integration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { AnatomyController } from '../../src/prediction/scenarios/anatomy/anatomy.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b27-anatomy-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let prediction: PredictionController; let twins: TwinController; let anatomy: AnatomyController;
let strategyOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal;
/** What the cases leave one another. */
let S = ''; let BASE = ''; let DISRUPT = ''; let DOWN = ''; let vTwin = 0;
let HOUTHI = ''; let INSURER = ''; let CARRIERS = ''; let PREMIUM = ''; let ESCORT = ''; let LINESTOP = ''; let TALKS = '';
let ASU_COVER = ''; let ASU_FREIGHT = ''; let ASU_CANAL = ''; let CLAIM = '';
let LINK_COVER = ''; let LINK_FREIGHT = ''; let LINK_CANAL = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B21/B22 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<string> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r.message;
};
const evidence = (caseName: string, e: Row): void => console.log(`B27 ANATOMY EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
const branchRow = async (id: string) => (await sql<{ state: string; suspended_from: string | null; suspended_by: string | null; suspension_reason: string | null; suspension_cause: Row | null;
  reinstated_by: string | null; reinstatement_note: string | null; flipped_at: Date | null }>`select state, suspended_from, suspended_by::text, suspension_reason, suspension_cause, reinstated_by::text, reinstatement_note, flipped_at
  from prediction.branches_current where branch_id = ${id}::uuid`.execute(su)).rows[0]!;
const eventsOf = async (event: string, branch?: string) => (await sql<{ branch_id: string | null; actor_principal_id: string; details: Row }>`select branch_id::text, actor_principal_id::text, details
  from prediction.scenario_events where scenario_id = ${S}::uuid and event = ${event} and (${branch ?? null}::uuid is null or branch_id = ${branch ?? null}::uuid) order by occurred_at`.execute(su)).rows;
const itemsOf = async (branch: string) => (await sql<{ item_id: string; state: string; owner_principal_id: string; subject_kind: string; cause_event_type: string; details: Row; closed_by: string | null }>`
  select item_id::text, state, owner_principal_id::text, subject_kind, cause_event_type, details, closed_by::text from executive.attention_items
   where signal_class = 'scenario.suspension' and subject_id = ${branch}::uuid order by created_at`.execute(su)).rows;
const elementVersions = async (id: string) => (await sql<{ version: number; change: string; name: string; reason: string | null }>`select version, change, name, reason from prediction.scenario_element_versions where element_id = ${id}::uuid order by version`.execute(su)).rows;

/* ───────────── the routes ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'SCN', id, 'prediction');
const read = async (as: AuthenticatedPrincipal = forecastOwner) => ((await anatomy.read(req(as, 'prediction.scenario.anatomy.read', S), T(), D(), S)) as unknown as { at: string; anatomy: Row }).anatomy;
const declareEl = (as: AuthenticatedPrincipal, payload: Row) => anatomy.declareElement(req(as, 'prediction.scenario.anatomy.element', S), T(), D(), S, { payload }) as unknown as Promise<{ element: Row & { element_id: string; version: number } }>;
const reviseEl = (as: AuthenticatedPrincipal, id: string, payload: Row) => anatomy.reviseElement(req(as, 'prediction.scenario.anatomy.element', S), T(), D(), S, id, { payload }) as unknown as Promise<{ element: Row & { version: number } }>;
const retireEl = (as: AuthenticatedPrincipal, id: string, reason: string) => anatomy.retireElement(req(as, 'prediction.scenario.anatomy.retire', S), T(), D(), S, id, { payload: { reason } }) as unknown as Promise<{ element: Row }>;
const link = (as: AuthenticatedPrincipal, payload: Row) => anatomy.link(req(as, 'prediction.scenario.anatomy.assumption', S), T(), D(), S, { payload }) as unknown as Promise<{ link: Row & { link_id: string; version: number } }>;
const unlink = (as: AuthenticatedPrincipal, id: string, reason: string) => anatomy.unlink(req(as, 'prediction.scenario.anatomy.assumption', S), T(), D(), S, id, { payload: { reason } }) as unknown as Promise<{ link: Row & { version: number } }>;
const addRecord = (as: AuthenticatedPrincipal, payload: Row) => anatomy.addRecord(req(as, 'prediction.scenario.anatomy.record', S), T(), D(), S, { payload }) as unknown as Promise<{ record: Row & { record_id: string; version: number } }>;
const suspend = (as: AuthenticatedPrincipal, branch: string, payload: Row) => anatomy.suspend(req(as, 'prediction.scenario.anatomy.suspend', branch), T(), D(), branch, { payload }) as unknown as Promise<{ suspension: Row }>;
const reinstate = (as: AuthenticatedPrincipal, branch: string, note: string) => anatomy.reinstate(req(as, 'prediction.scenario.anatomy.reinstate', branch), T(), D(), branch, { payload: { note } }) as unknown as Promise<{ reinstatement: Row }>;
const apply = (as: AuthenticatedPrincipal, asu: string) => anatomy.apply(req(as, 'prediction.scenario.anatomy.suspend', asu), T(), D(), asu) as unknown as Promise<{ application: Row & { suspended: Row[] } }>;
/** An ASU through the graph's strategy port (declared UNVERIFIED — the strategy service's rule). */
const declareAssumption = async (title: string, statement: string): Promise<string> =>
  ((await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title, statement,
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about the corridor (B27 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
/** A PERSON verifies or invalidates the ASU through the integrator's route (0090 §I, graph.assumption.verify) — the strategy owner. */
const verify = (asu: string, state: 'verified' | 'invalidated', reason: string, as: AuthenticatedPrincipal = strategyOwner) =>
  w.graph.verifyAssumption(h.req(as, 'graph.assumption.verify', 'ASU', asu, 'graph'), T(), D(), asu, { payload: { state, reason } });
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ warningId: string; branchId: string }> }>;
const openVersion = () => twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as unknown as Promise<{ version: { version: number } }>;
const admit = (version: number) => twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(version), { payload: {} }) as unknown as Promise<{ admitted: { completeness: string } }>;
const run = (branch: string, shock = false) => twins.run(h.req(w.operator, 'simulation.run', 'SIM', null, 'simulation'), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: vTwin, runKind: 'control', controlRunId: null, shock, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: S, scenarioBranchId: branch } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;

/** A claim as the extraction would have admitted it (the B21 seedClaim idiom), at version 1 active; version 2 DISPUTED when asked. SYNTHETIC. */
async function seedClaim(ev: { id: string; version: number }): Promise<{ id: string; dispute: () => Promise<void> }> {
  const claimId = uuidv7();
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'freight_rate', object_value: 'freight rates hold (synthetic)', confidence: 0.8,
    review: { state: 'approved', reason: 'fixture', decider: null } };
  const insert = async (version: number, lifecycle: string): Promise<void> => {
    const now = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: claimId, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: lifecycle, owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
      source_object_ids: [ev.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${ev.id}@${ev.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
    };
    const contentDigest = canonicalHeaderDigest(header, payload);
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
      values (${claimId}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${lifecycle}, 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  };
  await insert(1, 'active');
  // the harness itself stands for the review that disputes it (0006's lifecycle; the read's condition checks the latest version)
  return { id: claimId, dispute: () => insert(2, 'disputed') };
}

let claimDispute: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { AnatomyController: Ac } = await import('../../src/prediction/scenarios/anatomy/anatomy.controller.js');
  prediction = h.app.get(Pc); twins = h.app.get(Tc); anatomy = h.app.get(Ac);
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b27-strategy-owner');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b27-forecast-owner');
  otherOwner = await h.humanWithSession(['strategy_owner'], 'b27-other-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b27-analyst');
  executive = await h.humanWithSession(['executive'], 'b27-executive');
  w = await bootDecisionWorld(h);
  const s = (await prediction.declareScenario(h.req(strategyOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload: {
    title: 'Bab el-Mandeb closure (B27 harness, synthetic)', statement: 'the corridor stays open, or insurers withdraw and carriers reroute (B27 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Insurer withdrawal', kind: 'disruption', statement: 'war-risk cover is withdrawn and sailings stop', divergence: 'insurers withdraw war-risk cover, so carriers stop sailing whatever the transits say',
        indicatorId: w.indicatorId, owner: forecastOwner.principalId, consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: w.indicatorId, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }>; coherence: Row } };
  S = s.scenario.scenarioId;
  BASE = s.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  DISRUPT = s.scenario.branches.find((b) => b.kind === 'disruption')!.branchId;
  DOWN = s.scenario.branches.find((b) => b.kind === 'downside')!.branchId;
  ASU_COVER = await declareAssumption('Insurers keep war-risk cover', 'hull and cargo insurers keep writing war-risk cover for the corridor (synthetic)');
  ASU_FREIGHT = await declareAssumption('Freight rates hold', 'container freight rates on the corridor stay within their recent regime (synthetic)');
  ASU_CANAL = await declareAssumption('The canal stays open', 'the canal at the corridor\'s northern end stays open to transits (synthetic)');
  const c = await seedClaim(w.evd); CLAIM = c.id; claimDispute = c.dispute;
  // the twin version the runs bind: admitted AFTER the declaration, so its known_at binds the tree as declared
  vTwin = (await openVersion()).version.version;
  expect((await admit(vTwin)).admitted.completeness).toBe('complete');
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B27 anatomy · A · the actor / driver / mechanism model (a)', () => {
  it('A1 · POSITIVE: drivers (scenario-wide exogenous, branch endogenous), an actor with its agency, a mechanism resting on both drivers — declared, versioned, the actor revised to v2; the graph reference labelled', async () => {
    const houthi = await declareEl(strategyOwner, { kind: 'driver', name: 'Houthi activity', description: 'attacks on shipping in the southern Red Sea (synthetic)', attributes: { exogenous: true, timing: { start: '2026-10-01', end: '2026-12-31' } },
      graphRefs: [{ kind: 'entity', id: w.entityId }] });
    HOUTHI = houthi.element.element_id;
    expect(houthi.element).toMatchObject({ kind: 'driver', branch_id: null, version: 1, state: 'active', change: 'declared', attributes: { exogenous: true, timing: { start: '2026-10-01', end: '2026-12-31' } } });
    expect((houthi.element['graph_refs'] as Row[])[0]).toMatchObject({ kind: 'entity', id: w.entityId, label: 'Bab el-Mandeb Strait' });
    INSURER = (await declareEl(forecastOwner, { kind: 'driver', name: 'Insurer withdrawal', branchId: DISRUPT, description: 'war-risk underwriters withdraw cover for the corridor', attributes: { exogenous: false } })).element.element_id;
    CARRIERS = (await declareEl(strategyOwner, { kind: 'actor', name: 'Carriers', description: 'the container lines that route through the corridor', attributes: { agency: 'medium' } })).element.element_id;
    PREMIUM = (await declareEl(forecastOwner, { kind: 'mechanism', name: 'War-risk premium → rerouting', branchId: DISRUPT, description: 'the premium makes the corridor uneconomic, so carriers reroute via the Cape',
      attributes: { cause: 'war-risk premium rises', effect: 'carriers reroute via the Cape', dependencies: [HOUTHI, INSURER] } })).element.element_id;
    const v2 = await reviseEl(strategyOwner, CARRIERS, { kind: 'actor', name: 'Carriers', description: 'the container lines that route through the corridor', attributes: { agency: 'high', interest: 'keep schedules' }, expectedVersion: 1 });
    expect(v2.element).toMatchObject({ version: 2, change: 'revised', attributes: { agency: 'high', interest: 'keep schedules' } });
    expect((await elementVersions(CARRIERS)).map((v) => [v.version, v.change])).toEqual([[1, 'declared'], [2, 'revised']]);
    expect((await eventsOf('scenario.element_declared')).map((e) => e.details['name'])).toEqual(['Houthi activity', 'Insurer withdrawal', 'Carriers', 'War-risk premium → rerouting', 'Carriers']);
    const a = await read();
    const disrupt = (a['branches'] as Row[]).find((b) => b['branch_id'] === DISRUPT)!;
    expect(((disrupt['elements_by_kind'] as Row)['driver'] as Row[]).map((e) => e['name'])).toEqual(['Insurer withdrawal']);
    expect(((disrupt['elements_by_kind'] as Row)['mechanism'] as Row[]).map((e) => e['name'])).toEqual(['War-risk premium → rerouting']);
    expect((((a['scenario_wide'] as Row)['elements_by_kind'] as Row)['actor'] as Row[]).map((e) => [e['name'], e['version']])).toEqual([['Carriers', 2]]);
    evidence('A1', { elements: [HOUTHI, INSURER, CARRIERS, PREMIUM], carriers_versions: 2 });
  });

  it('A2 · REFUSAL: the PDP (an analyst), the kind, a driver without exogenous, an actor without agency, an unknown dependency, another branch\'s element, an unknown graph ref, a duplicate, a stale revision', async () => {
    await refused(declareEl(analyst, { kind: 'driver', name: 'X driver', description: 'an analyst may not declare', attributes: { exogenous: true } }), /./, 403);
    await refused(declareEl(strategyOwner, { kind: 'shock', name: 'X', description: 'not an element kind' }), /^scenario element rejected \(kind\)/, 422);
    await refused(declareEl(strategyOwner, { kind: 'driver', name: 'Fuel price', description: 'bunker fuel prices (synthetic)', attributes: {} }), /^scenario element rejected \(attributes\): a driver says whether it is exogenous/, 422);
    await refused(declareEl(strategyOwner, { kind: 'actor', name: 'Navies', description: 'coalition navies (synthetic)', attributes: { agency: 'total' } }), /^scenario element rejected \(attributes\): an actor states its agency/, 422);
    await refused(declareEl(strategyOwner, { kind: 'mechanism', name: 'Ghost', description: 'rests on nothing real', attributes: { cause: 'nothing', effect: 'nothing', dependencies: [uuidv7()] } }), /^scenario element rejected \(unknown_dependency\)/, 404);
    // a scenario-wide element cannot rest on the disruption branch's own driver
    await refused(declareEl(strategyOwner, { kind: 'mechanism', name: 'Leak', description: 'a whole-scenario mechanism on a branch driver', attributes: { cause: 'a b c d', effect: 'e f g h', dependencies: [INSURER] } }), /^scenario element rejected \(unknown_dependency\)/, 404);
    await refused(declareEl(strategyOwner, { kind: 'driver', name: 'Phantom', description: 'names an entity that is not here', attributes: { exogenous: true }, graphRefs: [{ kind: 'entity', id: uuidv7() }] }), /^scenario element rejected \(unknown_ref\)/, 404);
    await refused(declareEl(strategyOwner, { kind: 'driver', name: 'houthi ACTIVITY', description: 'the same driver again', attributes: { exogenous: true } }), /^scenario element rejected \(duplicate\)/, 409);
    await refused(reviseEl(strategyOwner, CARRIERS, { kind: 'actor', name: 'Carriers', description: 'the container lines, stale', attributes: { agency: 'low' }, expectedVersion: 1 }), /^scenario element rejected \(stale\): element "Carriers" stands at version 2/, 409);
    await refused(reviseEl(strategyOwner, CARRIERS, { kind: 'driver', name: 'Carriers', description: 'a kind change', attributes: { exogenous: true }, expectedVersion: 2 }), /^scenario element rejected \(fixed\)/, 422);
    expect((await elementVersions(CARRIERS)).length).toBe(2);
    evidence('A2', { refused: 10 });
  });

  it('A3 · RECOVERY: a retirement refused while another element rests on it (in_use); the dependent revised off it, then retired; a retired element is not revised; its name is free again', async () => {
    const tmp = (await declareEl(strategyOwner, { kind: 'driver', name: 'Monsoon season', description: 'seasonal weather on the corridor (synthetic)', attributes: { exogenous: true } })).element.element_id;
    const dep = (await declareEl(strategyOwner, { kind: 'mechanism', name: 'Weather delays', description: 'weather slows transits (synthetic)', attributes: { cause: 'monsoon', effect: 'slower transits', dependencies: [tmp] } })).element.element_id;
    await refused(retireEl(strategyOwner, tmp, 'the monsoon is out of the horizon'), /^scenario element rejected \(in_use\): mechanism "Weather delays" rests on "Monsoon season"/, 409);
    await reviseEl(strategyOwner, dep, { kind: 'mechanism', name: 'Weather delays', description: 'weather slows transits (synthetic)', attributes: { cause: 'weather', effect: 'slower transits' }, expectedVersion: 1 });
    const r = await retireEl(strategyOwner, tmp, 'the monsoon is out of the horizon');
    expect(r.element).toMatchObject({ state: 'retired', version: 2, retirement_reason: 'the monsoon is out of the horizon' });
    await refused(reviseEl(strategyOwner, tmp, { kind: 'driver', name: 'Monsoon season', description: 'revived (synthetic)', attributes: { exogenous: true }, expectedVersion: 2 }), /^scenario element rejected \(state\)/, 409);
    await refused(retireEl(strategyOwner, tmp, 'retire it once more please'), /^scenario element rejected \(state\)/, 409);
    const again = await declareEl(strategyOwner, { kind: 'driver', name: 'Monsoon season', description: 'the monsoon, declared again (synthetic)', attributes: { exogenous: true } });
    expect(again.element).toMatchObject({ version: 1, state: 'active' });
    await retireEl(strategyOwner, dep, 'weather is not a driver of this tree');
    expect((await elementVersions(tmp)).map((v) => v.change)).toEqual(['declared', 'retired']);
    expect((await eventsOf('scenario.element_retired')).length).toBe(2);
    // never deleted
    await expect(sql`delete from prediction.scenario_element_versions where element_id = ${tmp}::uuid`.execute(su)).rejects.toThrow();
    evidence('A3', { retired: [tmp, dep] });
  });
});

describe('B27 anatomy · B · the intervention and impact mapper (b)', () => {
  it('B1 · POSITIVE: an intervention on a driver, an impact on the objective resting on the mechanism — the branch\'s map runs intervention → driver → mechanism → impact; a scenario-wide intervention with no impact is named unmapped', async () => {
    ESCORT = (await declareEl(forecastOwner, { kind: 'intervention', name: 'Naval escort', branchId: DISRUPT, description: 'coalition navies escort convoys through the strait',
      attributes: { by: 'coalition navies', expected_effect: 'fewer attacks, lower premium', targets: [HOUTHI] } })).element.element_id;
    LINESTOP = (await declareEl(forecastOwner, { kind: 'impact', name: 'Regensburg line stop', branchId: DISRUPT, description: 'magnets arrive late and the line stops (synthetic)',
      attributes: { on: { kind: 'strategy', id: w.objectiveId }, direction: 'adverse', magnitude: 'severe', horizon: '30d', dependencies: [PREMIUM] } })).element.element_id;
    TALKS = (await declareEl(strategyOwner, { kind: 'intervention', name: 'Diplomatic talks', description: 'talks between the parties (synthetic)', attributes: { by: 'mediators', expected_effect: 'a ceasefire', targets: [HOUTHI] } })).element.element_id;
    const a = await read();
    const disrupt = (a['branches'] as Row[]).find((b) => b['branch_id'] === DISRUPT)!;
    const map = disrupt['map'] as Row[];
    const escort = map.find((p) => (p['intervention'] as Row)['name'] === 'Naval escort')!;
    expect((escort['targets'] as Row[]).map((x) => x['name'])).toEqual(['Houthi activity']);
    expect((escort['mechanisms'] as Row[]).map((x) => x['name'])).toEqual(['War-risk premium → rerouting']);
    expect((escort['impacts'] as Row[]).map((x) => [x['name'], x['direction'], x['magnitude'], x['horizon']])).toEqual([['Regensburg line stop', 'adverse', 'severe', '30d']]);
    expect(escort['unmapped']).toBe(false);
    // the scenario-wide talks reach the branch's impact through the branch's mechanism — but from the whole scenario, nothing
    expect((map.find((p) => (p['intervention'] as Row)['name'] === 'Diplomatic talks')!['impacts'] as Row[]).map((x) => x['name'])).toEqual(['Regensburg line stop']);
    const whole = (a['scenario_wide'] as Row)['map'] as Row[];
    expect(whole.map((p) => [(p['intervention'] as Row)['name'], p['unmapped']])).toEqual([['Diplomatic talks', true]]);
    // the baseline sees only the scenario-wide ones
    expect(((a['branches'] as Row[]).find((b) => b['branch_id'] === BASE)!['map'] as Row[]).map((p) => p['unmapped'])).toEqual([true]);
    evidence('B1', { escort: ESCORT, impact: LINESTOP, talks: TALKS });
  });

  it('B2 · REFUSAL: an intervention on an actor, an intervention with no target, an impact on an unknown entity, an impact without a magnitude band', async () => {
    await refused(declareEl(strategyOwner, { kind: 'intervention', name: 'Lobby carriers', description: 'lobby the carriers (synthetic)', attributes: { by: 'the ministry', expected_effect: 'carriers stay', targets: [CARRIERS] } }),
      /^scenario element rejected \(attributes\): an intervention acts on a driver or a mechanism; "Carriers" is an actor/, 422);
    await refused(declareEl(strategyOwner, { kind: 'intervention', name: 'Nothing', description: 'acts on nothing (synthetic)', attributes: { by: 'nobody', expected_effect: 'none at all' } }), /^scenario element rejected \(attributes\): an intervention acts on at least one/, 422);
    await refused(declareEl(strategyOwner, { kind: 'impact', name: 'Ghost impact', description: 'falls on nothing here', attributes: { on: { kind: 'entity', id: uuidv7() }, direction: 'adverse', magnitude: 'high', horizon: '30d' } }), /^scenario element rejected \(unknown_ref\)/, 404);
    await refused(declareEl(strategyOwner, { kind: 'impact', name: 'Vague impact', description: 'no band (synthetic)', attributes: { on: { kind: 'entity', id: w.entityId }, direction: 'adverse', horizon: '30d' } }), /^scenario element rejected \(attributes\): an impact states its direction/, 422);
    evidence('B2', { refused: 4 });
  });

  it('B3 · RECOVERY: a scenario-wide impact resting on the talks maps them; the talks revised to v2 keep their map', async () => {
    await declareEl(strategyOwner, { kind: 'impact', name: 'Transits resume', description: 'transits return towards their seasonal level (synthetic)', attributes: { on: { kind: 'entity', id: w.entityId }, direction: 'favourable', magnitude: 'moderate', horizon: '90d', dependencies: [TALKS] } });
    await reviseEl(strategyOwner, TALKS, { kind: 'intervention', name: 'Diplomatic talks', description: 'talks between the parties, mediated (synthetic)', attributes: { by: 'mediators', expected_effect: 'a ceasefire holds', targets: [HOUTHI] }, expectedVersion: 1 });
    const whole = ((await read())['scenario_wide'] as Row)['map'] as Row[];
    expect(whole.map((p) => [(p['intervention'] as Row)['expected_effect'], p['unmapped'], (p['impacts'] as Row[]).map((x) => x['name'])])).toEqual([['a ceasefire holds', false, ['Transits resume']]]);
    evidence('B3', { talks_version: 2 });
  });
});

describe('B27 anatomy · C · the assumption register (c)', () => {
  it('C1 · POSITIVE: the critical "insurers keep war-risk cover" on the disruption branch (state condition), "freight rates hold" non-critical on the baseline (a claim condition), "the canal stays open" non-critical scenario-wide (an indicator condition); the read shows each ASU\'s state', async () => {
    const cover = await link(forecastOwner, { assumptionId: ASU_COVER, branchId: DISRUPT, critical: true, condition: { kind: 'state', text: 'the war-risk cover assumption is invalidated' }, rationale: 'the disruption branch exists because cover may go' });
    LINK_COVER = cover.link.link_id;
    expect(cover.link).toMatchObject({ critical: true, version: 1, state: 'linked', change: 'linked', invalidation_condition: { kind: 'state' }, assumption: { verification_state: 'unverified' } });
    LINK_FREIGHT = (await link(strategyOwner, { assumptionId: ASU_FREIGHT, branchId: BASE, critical: false, condition: { kind: 'claim', claimId: CLAIM, text: 'the freight-rate claim is disputed' }, rationale: 'the baseline assumes rates hold' })).link.link_id;
    LINK_CANAL = (await link(strategyOwner, { assumptionId: ASU_CANAL, critical: false, condition: { kind: 'indicator', indicatorId: w.indicatorId, text: 'transits stay below 40 for five days' }, rationale: 'every branch assumes the canal is open' })).link.link_id;
    const reg = (await read())['assumptions'] as Row[];
    expect(reg.map((l) => [(l['assumption'] as Row)['title'], l['critical'], l['branch_id'], (l['assumption'] as Row)['verification_state'], l['condition_met']])).toEqual([
      ['Insurers keep war-risk cover', true, DISRUPT, 'unverified', false],
      ['Freight rates hold', false, BASE, 'unverified', false],
      ['The canal stays open', false, null, 'unverified', false],
    ]);
    // the claim condition is read live: the claim disputed → condition met (a non-critical link changes no branch)
    await claimDispute();
    expect(((await read())['assumptions'] as Row[]).find((l) => l['link_id'] === LINK_FREIGHT)!['condition_met']).toBe(true);
    expect((await branchRow(BASE)).state).toBe('open');
    expect((await eventsOf('scenario.assumption_linked')).length).toBe(3);
    evidence('C1', { links: [LINK_COVER, LINK_FREIGHT, LINK_CANAL] });
  });

  it('C2 · REFUSAL: an unknown ASU, an objective (not an ASU), an unknown claim, a short rationale, a second link without the version (duplicate), a stale revision, the PDP', async () => {
    await refused(link(strategyOwner, { assumptionId: uuidv7(), critical: true, condition: { kind: 'state', text: 'the assumption is invalidated' }, rationale: 'rests on a ghost' }), /^scenario assumption rejected \(unknown_assumption\)/, 404);
    await refused(link(strategyOwner, { assumptionId: w.objectiveId, critical: true, condition: { kind: 'state', text: 'the assumption is invalidated' }, rationale: 'an objective is not an assumption' }), /^scenario assumption rejected \(unknown_assumption\)/, 404);
    await refused(link(strategyOwner, { assumptionId: ASU_FREIGHT, branchId: DISRUPT, critical: false, condition: { kind: 'claim', claimId: uuidv7(), text: 'the claim is disputed' }, rationale: 'a claim that is not here' }), /^scenario assumption rejected \(unknown_claim\)/, 404);
    await refused(link(strategyOwner, { assumptionId: ASU_FREIGHT, branchId: DISRUPT, critical: false, rationale: 'short' }), /^scenario assumption rejected \(rationale\)/, 422);
    await refused(link(strategyOwner, { assumptionId: ASU_COVER, branchId: DISRUPT, critical: true, condition: { kind: 'state', text: 'the war-risk cover assumption is invalidated' }, rationale: 'linked twice without the version' }), /^scenario assumption rejected \(duplicate\)/, 409);
    await refused(link(analyst, { assumptionId: ASU_FREIGHT, critical: false, condition: { kind: 'state', text: 'the assumption is invalidated' }, rationale: 'an analyst may not link' }), /./, 403);
    evidence('C2', { refused: 6 });
  });

  it('C3 · RECOVERY: the canal link revised (v2, now critical scenario-wide), unlinked with a reason (v3), relinked non-critical (v4) — each on the ledger; a stale version refused', async () => {
    const v2 = await link(strategyOwner, { assumptionId: ASU_CANAL, critical: true, condition: { kind: 'state', text: 'the canal assumption is invalidated' }, rationale: 'on reflection the canal is critical to every branch', expectedVersion: 1 });
    expect(v2.link).toMatchObject({ link_id: LINK_CANAL, version: 2, critical: true, change: 'revised' });
    await refused(unlink(strategyOwner, LINK_CANAL, 'short'), /^scenario assumption rejected \(reason\)/, 422);
    const v3 = await unlink(strategyOwner, LINK_CANAL, 'the canal is outside this tree\'s corridor after all');
    expect(v3.link).toMatchObject({ version: 3, state: 'unlinked' });
    await refused(unlink(strategyOwner, LINK_CANAL, 'the canal is outside this tree\'s corridor after all'), /^scenario assumption rejected \(state\)/, 409);
    await refused(link(strategyOwner, { assumptionId: ASU_CANAL, critical: false, condition: { kind: 'state', text: 'the canal assumption is invalidated' }, rationale: 'relinked as context', expectedVersion: 2 }), /^scenario assumption rejected \(stale\)/, 409);
    const v4 = await link(strategyOwner, { assumptionId: ASU_CANAL, critical: false, condition: { kind: 'state', text: 'the canal assumption is invalidated' }, rationale: 'relinked as context only', expectedVersion: 3 });
    expect(v4.link).toMatchObject({ version: 4, state: 'linked', critical: false, change: 'relinked' });
    expect((await eventsOf('scenario.assumption_linked')).map((e) => e.details['change'])).toEqual(['linked', 'linked', 'linked', 'revised', 'relinked']);
    expect((await eventsOf('scenario.assumption_unlinked')).length).toBe(1);
    evidence('C3', { canal_link_versions: 4 });
  });
});

describe('B27 anatomy · D · the suspension (d)', () => {
  it('D1 · POSITIVE: the strategy owner INVALIDATES the critical ASU through the graph route → the disruption branch SUSPENDED in the same act; branch.suspended; the BRANCH OWNER tasked; the non-critical invalidation only noted', async () => {
    const run0 = await run(DISRUPT); // before: a run on the live branch is admitted
    expect(run0.run.state).toBe('completed');
    await verify(ASU_COVER, 'invalidated', 'the Joint War Committee listed the corridor and underwriters withdrew cover (synthetic)');
    const b = await branchRow(DISRUPT);
    expect(b).toMatchObject({ state: 'suspended', suspended_from: 'open', suspended_by: strategyOwner.principalId });
    expect(b.suspension_reason).toMatch(/^the critical assumption "Insurers keep war-risk cover" was invalidated: the Joint War Committee/);
    expect(b.suspension_cause).toMatchObject({ kind: 'assumption', id: ASU_COVER, title: 'Insurers keep war-risk cover', link_ids: [LINK_COVER], via: 'graph.assumption.verify' });
    const ev = await eventsOf('branch.suspended', DISRUPT);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.actor_principal_id).toBe(strategyOwner.principalId);
    const items = await itemsOf(DISRUPT);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: 'open', owner_principal_id: forecastOwner.principalId, subject_kind: 'branch', cause_event_type: 'branch.suspended' });
    // the other branches untouched; the non-critical freight assumption invalidated → the baseline stays open, the read notes it
    expect((await branchRow(BASE)).state).toBe('open');
    expect((await branchRow(DOWN)).state).toBe('open');
    await verify(ASU_FREIGHT, 'invalidated', 'freight rates tripled on the corridor this week (synthetic)');
    expect((await branchRow(BASE)).state).toBe('open');
    expect(await eventsOf('branch.suspended', BASE)).toHaveLength(0);
    const a = await read();
    const reg = a['assumptions'] as Row[];
    expect(reg.find((l) => l['link_id'] === LINK_FREIGHT)!['note']).toMatch(/^a non-critical assumption is invalidated: the branch stays live/);
    expect(reg.find((l) => l['link_id'] === LINK_COVER)!).toMatchObject({ invalidated: true, condition_met: true });
    const d = (a['branches'] as Row[]).find((x) => x['branch_id'] === DISRUPT)!;
    expect(d).toMatchObject({ state: 'suspended', live: false, decision_active: false });
    expect(d['suspension']).toMatchObject({ current: true, suspended_from: 'open', reason: b.suspension_reason });
    expect((d['open_items'] as Row[]).length).toBe(1);
    evidence('D1', { branch: DISRUPT, item: items[0]!.item_id, cause: b.suspension_cause });
  });

  it('D2 · POSITIVE: a suspended branch does not flip (the indicator flips the open downside only) and a run on it is refused 409 run rejected (branch_suspended)', async () => {
    const ev = await evaluateIndicator(w.indicatorId);
    expect((await branchRow(DOWN)).state).toBe('flipped');
    expect((await branchRow(DISRUPT)).state).toBe('suspended');
    expect(ev.warnings.map((x) => x.branchId)).not.toContain(DISRUPT);
    await refused(run(DISRUPT), /^run rejected \(branch_suspended\): branch "Insurer withdrawal" of scenario .* is suspended since/, 409);
    evidence('D2', { flipped: DOWN, suspended: DISRUPT });
  });

  it('D3 · REFUSAL: reinstatement by the PDP (an analyst), by a strategy owner who owns neither, by the owner while the critical ASU is still invalidated, with a short note; a second suspension; an apply on a live ASU', async () => {
    await refused(reinstate(analyst, DISRUPT, 'the analyst would reinstate it now'), /./, 403);
    await refused(reinstate(otherOwner, DISRUPT, 'another owner would reinstate it now'), /^branch suspension rejected \(ownership\)/, 403);
    await refused(reinstate(forecastOwner, DISRUPT, 'the owner would reinstate it now'), /^branch suspension rejected \(invalidated\): the critical assumption "Insurers keep war-risk cover" is still invalidated/, 409);
    await refused(reinstate(forecastOwner, DISRUPT, 'too short'), /^branch suspension rejected \(note\)/, 422);
    await refused(suspend(strategyOwner, DISRUPT, { reason: 'suspend it a second time please' }), /^branch suspension rejected \(state\)/, 409);
    await refused(apply(strategyOwner, ASU_CANAL), /^branch suspension rejected \(state\): assumption "The canal stays open" is unverified/, 409);
    await refused(link(forecastOwner, { assumptionId: ASU_COVER, branchId: BASE, critical: true, condition: { kind: 'state', text: 'the cover assumption is invalidated' }, rationale: 'a new critical link on an invalidated ASU' }), /^scenario assumption rejected \(invalidated\)/, 409);
    // the executive reads the anatomy (the read's roles), the suspension shown
    const a = await read(executive);
    expect(((a['branches'] as Row[]).find((x) => x['branch_id'] === DISRUPT)!['suspension'] as Row)['current']).toBe(true);
    expect((await branchRow(DISRUPT)).state).toBe('suspended');
    evidence('D3', { refused: 7 });
  });

  it('D4 · RECOVERY: the ASU verified again (the strategy owner) → the branch owner reinstates with a note → open (its suspended_from), branch.reinstated, the item closed, a run admitted; the apply on the verified ASU refused', async () => {
    await verify(ASU_COVER, 'verified', 'underwriters reinstated war-risk cover after the escort began (synthetic)');
    expect((await branchRow(DISRUPT)).state).toBe('suspended'); // verification alone does not reinstate: the owner's word does
    const r = await reinstate(forecastOwner, DISRUPT, 'cover is written again; the branch holds as declared');
    expect(r.reinstatement).toMatchObject({ state: 'open', reinstated_by: forecastOwner.principalId });
    const b = await branchRow(DISRUPT);
    expect(b).toMatchObject({ state: 'open', reinstated_by: forecastOwner.principalId, reinstatement_note: 'cover is written again; the branch holds as declared' });
    expect(await eventsOf('branch.reinstated', DISRUPT)).toHaveLength(1);
    const items = await itemsOf(DISRUPT);
    expect(items[0]).toMatchObject({ state: 'closed', closed_by: forecastOwner.principalId });
    expect((await run(DISRUPT)).run.state).toBe('completed');
    await refused(apply(strategyOwner, ASU_COVER), /^branch suspension rejected \(state\)/, 409);
    const a = await read();
    const d = (a['branches'] as Row[]).find((x) => x['branch_id'] === DISRUPT)!;
    expect(d).toMatchObject({ live: true, decision_active: true, open_items: [] });
    expect(d['suspension']).toMatchObject({ current: false, reinstatement_note: 'cover is written again; the branch holds as declared' });
    evidence('D4', { reinstated: DISRUPT, item_closed: items[0]!.item_id });
  });

  it('D5 · RECOVERY (a person\'s suspension of a FLIPPED branch, cause element): suspended from flipped; the scenario owner reinstates it back to flipped', async () => {
    const s = await suspend(strategyOwner, DOWN, { reason: 'the diplomatic talks change what this collapse would mean', elementId: TALKS });
    expect(s.suspension).toMatchObject({ suspended_from: 'flipped', owner_principal_id: strategyOwner.principalId });
    const b = await branchRow(DOWN);
    expect(b).toMatchObject({ state: 'suspended', suspended_from: 'flipped' });
    expect(b.suspension_cause).toMatchObject({ kind: 'element', id: TALKS, element_kind: 'intervention', name: 'Diplomatic talks' });
    await refused(suspend(strategyOwner, BASE, { reason: 'an element of another branch here', elementId: PREMIUM }), /^branch suspension rejected \(unknown_element\)/, 404);
    const r = await reinstate(strategyOwner, DOWN, 'the escort is only partial; the collapse reading stands');
    expect(r.reinstatement).toMatchObject({ state: 'flipped' });
    expect((await branchRow(DOWN)).flipped_at).not.toBeNull();
    evidence('D5', { branch: DOWN, returned_to: 'flipped' });
  });

  it('D6 · RECOVERY (scenario-wide critical link): its invalidation suspends EVERY live branch; the apply re-run suspends nothing more (idempotent); an unlink (reasoned) lets the baseline be reinstated', async () => {
    const wide = await declareAssumption('The corridor stays insurable', 'the corridor as a whole stays insurable at any premium (synthetic)');
    const l = await link(strategyOwner, { assumptionId: wide, critical: true, condition: { kind: 'state', text: 'the corridor is declared uninsurable' }, rationale: 'every branch of the tree presumes an insurable corridor' });
    await verify(wide, 'invalidated', 'the market declared the corridor uninsurable for a week (synthetic)');
    expect([(await branchRow(BASE)).state, (await branchRow(DISRUPT)).state, (await branchRow(DOWN)).state]).toEqual(['suspended', 'suspended', 'suspended']);
    expect([(await branchRow(BASE)).suspended_from, (await branchRow(DOWN)).suspended_from]).toEqual(['open', 'flipped']);
    const again = await apply(strategyOwner, wide);
    expect(again.application.suspended).toEqual([]);
    await refused(reinstate(strategyOwner, BASE, 'the baseline holds without this assumption'), /^branch suspension rejected \(invalidated\)/, 409);
    await unlink(strategyOwner, l.link.link_id, 'the baseline does not in fact rest on insurability');
    expect((await reinstate(strategyOwner, BASE, 'the baseline holds without this assumption')).reinstatement).toMatchObject({ state: 'open' });
    expect((await reinstate(forecastOwner, DISRUPT, 'the disruption branch holds without the wide link')).reinstatement).toMatchObject({ state: 'open' });
    expect((await reinstate(strategyOwner, DOWN, 'the collapse branch holds without the wide link')).reinstatement).toMatchObject({ state: 'flipped' });
    expect((await itemsOf(BASE)).map((i) => i.state)).toEqual(['closed']);
    evidence('D6', { suspended_then_reinstated: [BASE, DISRUPT, DOWN] });
  });
});

describe('B27 anatomy · E · narrative, implication and option records (e)', () => {
  let NARR = '';
  it('E1 · POSITIVE: a narrative (scenario-wide, citing evidence and the entity), an implication on the disruption branch (citing the claim), an option (citing the objective) — each with its author', async () => {
    const n = await addRecord(strategyOwner, { kind: 'narrative', title: 'How the corridor closes', body: 'attacks rise, insurers withdraw, carriers reroute via the Cape (synthetic)',
      cites: [{ kind: 'evidence', id: w.evd.id }, { kind: 'entity', id: w.entityId }] });
    NARR = n.record.record_id;
    expect(n.record).toMatchObject({ kind: 'narrative', version: 1, supersedes: null, author_principal_id: strategyOwner.principalId, branch_id: null });
    await addRecord(forecastOwner, { kind: 'implication', branchId: DISRUPT, title: 'Magnets arrive three weeks late', body: 'the Cape adds about three weeks (synthetic)', cites: [{ kind: 'claim', id: CLAIM }] });
    await addRecord(strategyOwner, { kind: 'option', title: 'Air-bridge the first lot', body: 'fly the first magnet lot to keep the line running (synthetic)', cites: [{ kind: 'strategy', id: w.objectiveId }] });
    const recs = (await read())['records'] as Row[];
    expect(recs.map((r) => [r['kind'], r['title'], r['latest']])).toEqual([['narrative', 'How the corridor closes', true], ['implication', 'Magnets arrive three weeks late', true], ['option', 'Air-bridge the first lot', true]]);
    expect((await eventsOf('scenario.record_added')).length).toBe(3);
    evidence('E1', { narrative: NARR });
  });

  it('E2 · REFUSAL: an unknown citation, a bad kind, a short body, a revision that changes the kind, the PDP; the ledger is append-only', async () => {
    await refused(addRecord(strategyOwner, { kind: 'narrative', title: 'Ghost', body: 'cites a claim that is not here', cites: [{ kind: 'claim', id: uuidv7() }] }), /^scenario record rejected \(unknown_citation\)/, 404);
    await refused(addRecord(strategyOwner, { kind: 'memo', title: 'Memo', body: 'not a record kind at all' }), /^scenario record rejected \(kind\)/, 422);
    await refused(addRecord(strategyOwner, { kind: 'option', title: 'Short', body: 'short' }), /^scenario record rejected \(body\)/, 422);
    await refused(addRecord(strategyOwner, { kind: 'option', title: 'Kind change', body: 'a revision into another kind', supersedes: NARR }), /^scenario record rejected \(fixed\)/, 422);
    await refused(addRecord(analyst, { kind: 'narrative', title: 'Analyst', body: 'an analyst may not record' }), /./, 403);
    await expect(sql`update prediction.scenario_records set body = 'rewritten' where record_id = ${NARR}::uuid`.execute(su)).rejects.toThrow();
    evidence('E2', { refused: 6 });
  });

  it('E3 · RECOVERY: the narrative revised (v2 supersedes v1; the read marks only v2 latest); superseding v1 again refused (state); v2 revised to v3', async () => {
    const v2 = await addRecord(strategyOwner, { kind: 'narrative', title: 'How the corridor closes', body: 'attacks rise, insurers withdraw, carriers reroute; the escort slows it (synthetic)', supersedes: NARR });
    expect(v2.record).toMatchObject({ version: 2, supersedes: NARR });
    await refused(addRecord(strategyOwner, { kind: 'narrative', title: 'Fork', body: 'a second revision of v1', supersedes: NARR }), /^scenario record rejected \(state\)/, 409);
    const v3 = await addRecord(strategyOwner, { kind: 'narrative', title: 'How the corridor closes', body: 'the third telling of it (synthetic)', supersedes: v2.record.record_id });
    expect(v3.record).toMatchObject({ version: 3 });
    const recs = ((await read())['records'] as Row[]).filter((r) => r['kind'] === 'narrative');
    expect(recs.map((r) => [r['version'], r['latest']])).toEqual([[1, false], [2, false], [3, true]]);
    expect(String(v3.record.record_id)).toMatch(UUID);
    evidence('E3', { narrative_versions: 3 });
  });
});
