/**
 * CP-6 B33 part `twin` (migration 0111 §TW; F-P5-03 completes, F-P5-02 and F-P5-04 advance) — THE TWIN PIECES, on a real database through the
 * real routes, ports, triggers and the attention policy, with named humans holding sessions of their own. The world is bootDecisionWorld's (its
 * uploaded records, its strait entity, its corridor scenario, its synthetic transit series); the corridor twin here is the harness's own, owned
 * by T. Nakamura's part. Every figure is SYNTHETIC (NORDWERK's data is the demonstration's; the "PortWatch-shaped" transit series is the
 * Phase 4 fixture source — a synthetic REST double: it demonstrates the software and closes no clause that needs the real PortWatch feed);
 * every instant is the DATABASE's.
 *
 *   TW1 · MERGES BETWEEN NON-ACTUAL BRANCHES: `stress-75` merged into `blockade` — the base the two heads' nearest common version, the diverging
 *         keys reconciled by the owner, a scenario value taken between two scenario branches, the plan admitted ON THE TARGET, the merge's item
 *         CLOSED. Refused: the target the source itself, actual as the source, an unknown target, a duplicate pair, a peer completing, a draft
 *         on the target carrying the source around its merge, a scenario value taken into ACTUAL (B30's rule kept). Recovered: a stale merge
 *         withdrawn (its item closed) and re-opened; a refused merge's item closed; the completion.
 *   TW2 · THE SCENARIO CITATION: a scenario element citing the SCN object (exact version and digest, with its branch) beside the branch's
 *         assumption; alone on a non-material key. Refused: alone on a material key, an unknown SCN version, a branch of another scenario, a
 *         SUSPENDED branch, an unknown branch. Recovered: the branch reinstated; the assumption beside it.
 *   TW3 · THE SCENARIO-ELEMENT FORM'S ROUTE: the form's payload (citeScenario, the days) grounds and reads back the days it names; the server's
 *         refusal in its own words (an assumption not linked); recovered with the scenario basis.
 *   TW4 · THE ESTIMATE CITATION: the approved estimated element cites exactly {kind: estimate, id, version 1, digest: inputs_digest} beside its
 *         evidence; the TWN rests on it (graph.dependencies `estimate`). Refused: an approval whose element lacks it, or carries a forged digest
 *         (estimate rejected (citation) 422, nothing admitted). Recovered: the honest approval.
 *   TW5 · THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH: an upstream twin linked and coupled — certain → approved; the upstream UNVERIFIED →
 *         the proposal ambiguous (the dependency recorded uncertain), the approval refused (dependency 409) and the coupling apply refused
 *         (coupling rejected (dependency) 409, the TS pre-check); recovered by a verified upstream head; a STALE upstream → approved only with
 *         the owner's note.
 *   TW6 · A TOPOLOGY RULE FAILING AN ESTIMATE on a route-bearing head (a SUPPLY-NETWORK twin): satisfied → approved; the steel route cut →
 *         the proposal ambiguous (constraint violated), its approval refused (constraint); the route restored → satisfied and approved.
 *   TW7 · THE ITEMS CLOSED ON DECISION: the routed estimate items closed by approval / supersession / decline; an OUTSIDE run's completion
 *         raises the NEW awaiting-admission item (deprioritized with no policy, routed to the twin owner under a published one), closed by the
 *         exploratory admission; the admission's item closed by the concurrence. Refused acts close nothing; an inside run raises nothing.
 *         Recovered: a retired outside run's item closed by the retirement.
 *   TW8 · open_run's ENVELOPE REFUSAL WORDING: "needs a twin owner's acknowledgement"; "is a twin owner's of this domain; the acting principal
 *         is not one" (a domain administrator holding simulation_operator); the twin owner's acknowledged run opens.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { BranchesController } from '../../src/twin/branches/branches.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { AnatomyController } from '../../src/prediction/scenarios/anatomy/anatomy.controller.js';
import type { ConstraintsController } from '../../src/twin/constraints/constraints.controller.js';
import type { EnvelopeController } from '../../src/twin/envelope/envelope.controller.js';
import type { FabricController } from '../../src/twin/simulations/fabric/fabric.controller.js';
import { EstimationController } from '../../src/twin/estimation/estimation.controller.js';
import { TwinCapability } from '../../src/twin/twin.capabilities.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { cite, completeElements } from './phase5-fixtures.js';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import { threeTier } from '../unit/phase6-supply-network-b29.fixtures.js';
import type { AnyDb } from './helpers.js';

// this file's own vault roots (bootDecisionWorld and the network's evidence upload through the governed paths)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b33tw-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let br: BranchesController; let comp: CompositionController; let anat: AnatomyController; let cons: ConstraintsController; let env: EnvelopeController; let fab: FabricController;
let est: EstimationController;
/** T. Nakamura's part (the corridor twin's and the network's OWN owner, also an operator), a peer twin owner, E. Kovács's part (the upstream
 *  twin's owner), a strategist (links the scenario's assumptions, suspends a branch), A. Hoffmann's part (proposes estimates), S. Lindqvist's
 *  part (constraint steward), H. Petrović's part (method steward), the domain administrator (holding simulation_operator — TW8's probe), the
 *  world's twin owner with a session (the outside runs' twin), an operator. */
let owner: AuthenticatedPrincipal; let peer: AuthenticatedPrincipal; let kovacs: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let methodSteward: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let dadminOp: AuthenticatedPrincipal; let wOwner: AuthenticatedPrincipal; let ownerSteward: AuthenticatedPrincipal;
/** The corridor twin, the upstream twin, the supply network; the blockade assumption; the versions the cases leave one another. */
let C = ''; let U = ''; let N = ''; let ASU_BLOCK = ''; let BASELINE_BRANCH = ''; let SCN_V = 0; let SCN_DIGEST = '';
let V1 = 0; let B1 = 0; let S1 = 0; let V75 = 0;
const CORRIDOR_KEY = 'corridor.capacity_share';
const NET_KEY = 'capacity:bearing-maker.bearing';
const BASELINE = 104;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const rows = async (x: ReturnType<typeof sql>) => (await x.execute(su)).rows as Row[];
const one = async (x: ReturnType<typeof sql>) => (await rows(x))[0] as Row;
const dbNow = async (): Promise<string> => String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))['t']);
const evidenceLog = (id: string, e: Row) => { console.log(`B33-TW EVIDENCE ${id} ${JSON.stringify(e)}`); };

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const raw = e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? '') : (e instanceof Error ? e.message : String(e));
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  return { status: mapped === null ? null : mapped.getStatus(), message: raw };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, id: string | null = null, type = 'TWN') => h.req(as, action, type, id, 'twin');
const open = async (as: AuthenticatedPrincipal, twinId: string, p: Row): Promise<number> =>
  ((await w.twins.openVersion(R(as, 'twin.version', twinId), T(), D(), twinId, { payload: { knownAt: await dbNow(), ...p } })) as { version: { version: number } }).version.version;
const openRaw = async (as: AuthenticatedPrincipal, twinId: string, p: Row) => w.twins.openVersion(R(as, 'twin.version', twinId), T(), D(), twinId, { payload: { knownAt: await dbNow(), ...p } });
const ground = (as: AuthenticatedPrincipal, twinId: string, v: number, elements: unknown[]) => w.twins.ground(R(as, 'twin.ground', twinId), T(), D(), twinId, String(v), { payload: { elements } });
const admit = (as: AuthenticatedPrincipal, twinId: string, v: number, allowIncomplete = false) =>
  w.twins.admit(R(as, 'twin.version.admit', twinId), T(), D(), twinId, String(v), { payload: { allowIncomplete } }) as Promise<{ admitted: Row }>;
const withdraw = (as: AuthenticatedPrincipal, twinId: string, v: number, reason: string) => w.twins.withdraw(R(as, 'twin.version.withdraw', twinId), T(), D(), twinId, String(v), { payload: { reason } });
const assumed = (key: string, value: number, unit: string, confidence: number | null = null) => ({ key, kind: 'assumed', value, unit, citations: [cite(w.records.terms)], ...(confidence === null ? {} : { confidence }) });
const scenario = (as: AuthenticatedPrincipal, twinId: string, v: number, elements: Row[]) =>
  br.scenario(R(as, 'twin.ground', twinId), T(), D(), twinId, String(v), { payload: { elements } }) as Promise<{ grounded: Row[] }>;
const openMerge = (as: AuthenticatedPrincipal, payload: Row, twinId: string = C) => br.openMerge(R(as, 'twin.branch.merge', twinId), T(), D(), twinId, { payload } as never) as Promise<{ merge: Row }>;
const resolve = (as: AuthenticatedPrincipal, mergeId: string, payload: Row) => br.resolve(R(as, 'twin.branch.reconcile'), T(), D(), mergeId, { payload }) as Promise<{ merge: Row }>;
const complete = (as: AuthenticatedPrincipal, mergeId: string) => br.complete(R(as, 'twin.branch.merge'), T(), D(), mergeId, { payload: {} }) as Promise<{ merge: Row; admitted: Row; receipts: Row[] }>;
const closeMerge = (as: AuthenticatedPrincipal, mergeId: string, outcome: string, reason: string) => br.close(R(as, 'twin.branch.merge'), T(), D(), mergeId, { payload: { outcome, reason } }) as Promise<{ merge: Row }>;
const explorer = (as: AuthenticatedPrincipal, twinId: string = C) => br.explorer(R(as, 'twin.read', twinId), T(), D(), twinId) as Promise<{ explorer: Row & { branches: Row[]; merges: Row[]; versions: Row[] } }>;
const elementMap = async (twinId: string, v: number): Promise<Record<string, Row>> =>
  Object.fromEntries((await rows(sql`select key, kind, value, unit, confidence, citations, valid_from::text as valid_from, valid_to::text as valid_to from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v}::int order by key`)).map((r) => [String(r['key']), r]));
const head = async (twinId: string, branch: string): Promise<number> => Number((await one(sql`select max(version)::int v from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = ${branch} and state = 'admitted'`))['v']);
const versionCount = async (twinId: string) => Number((await one(sql`select count(*)::int n from twin.twin_versions where twin_id = ${twinId}::uuid`))['n']);
const ledger = async (subject: string) => (await rows(sql`select event, details from twin.branch_events where subject_id = ${subject}::uuid order by occurred_at, event_id`));
/** The attention items of a subject, scoped to this harness's tenant (the hosted run shares one database across files — the #72 rule). */
const items = async (cls: string, subject: string) => rows(sql`select item_id::text, signal_class, subject_kind, state, owner_principal_id::text as owner, route_roles, title, policy_version,
                                                                      cause_event_type, closed_by::text as closed_by, details
                                                                 from executive.attention_items where tenant_id = ${T()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at, item_id`);
const closure = async (itemId: string) => (await rows(sql`select event, details from executive.attention_item_events where item_id = ${itemId}::uuid and event = 'item.closed'`))[0] ?? null;
/* the estimation routes */
const E = (as: AuthenticatedPrincipal, action: string, type = 'TWN', id: string | null = null) => h.req(as, action, type, id, 'twin');
const declareEstimator = (payload: Row, as = owner) => est.declare(E(as, 'twin.estimator.declare', 'TWN', String(payload['twinId'])), T(), D(), { payload }) as Promise<{ estimator: Row }>;
const propose = (twinId: string, key: string, as = analyst) => est.propose(E(as, 'twin.estimate.propose', 'TWE'), T(), D(), { payload: { twinId, key } }).then((r) => (r as { estimate: Row }).estimate);
const decide = (id: string, decision: 'approved' | 'declined', note?: string, as = owner, allowIncomplete = false) =>
  est.decide(E(as, 'twin.estimate.decide', 'TWE', id), T(), D(), id, { payload: { decision, ...(note === undefined ? {} : { note }), allowIncomplete } }) as Promise<{ decision: Row; snapshot: Row | null }>;
const estimateRow = async (id: string) => one(sql`select estimate_id::text, state, ambiguous, ambiguity_reasons, constraint_check, constraint_outcome, inputs_digest, attention_item_id::text, applied_version from twin.estimates where estimate_id = ${id}::uuid`);
/* the envelope and the runs (the world's corridor twin) */
const sim = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'simulation');
const run = (as: AuthenticatedPrincipal, payload: Row = {}) => w.twins.run(sim(as, 'simulation.run', 'SIM', null), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...payload } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
const admitRun = (as: AuthenticatedPrincipal, runId: string, reason: string) => env.admit(sim(as, 'twin.envelope.admit', 'SIM', runId), T(), D(), runId, { payload: { reason } }) as Promise<{ admission: Row }>;
const concur = (as: AuthenticatedPrincipal, runId: string, note: string) => env.concur(sim(as, 'twin.envelope.concur', 'SIM', runId), T(), D(), runId, { payload: { note } }) as Promise<{ concurrence: Row }>;
const retireRun = (as: AuthenticatedPrincipal, runId: string, reason: string) => fab.retireRun(sim(as, 'simulation.retirement.run', 'SIM', runId), T(), D(), runId, { payload: { reason } } as never) as Promise<{ retirement: Row }>;
const ACK = { acknowledge: true, reason: 'the 75-day closure is the stress case (B33 harness, SYNTHETIC)' };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as unknown as AnyDb;
  const { BranchesController: Bc } = await import('../../src/twin/branches/branches.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { AnatomyController: Ac } = await import('../../src/prediction/scenarios/anatomy/anatomy.controller.js');
  const { ConstraintsController: Kc } = await import('../../src/twin/constraints/constraints.controller.js');
  const { EnvelopeController: Ec } = await import('../../src/twin/envelope/envelope.controller.js');
  const { FabricController: Fc } = await import('../../src/twin/simulations/fabric/fabric.controller.js');
  br = h.app.get(Bc); comp = h.app.get(Cc); anat = h.app.get(Ac); cons = h.app.get(Kc); env = h.app.get(Ec); fab = h.app.get(Fc); est = h.app.get(EstimationController);
  owner = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b33tw-nakamura');
  peer = await h.humanWithSession(['twin_owner'], 'b33tw-peer');
  kovacs = await h.humanWithSession(['twin_owner'], 'b33tw-kovacs');
  strategist = await h.humanWithSession(['strategy_owner'], 'b33tw-strategist');
  analyst = await h.humanWithSession(['domain_analyst'], 'b33tw-hoffmann');
  steward = await h.humanWithSession(['constraint_steward'], 'b33tw-lindqvist');
  methodSteward = await h.humanWithSession(['method_steward'], 'b33tw-petrovic');
  dadmin = await h.humanWithSession(['domain_admin'], 'b33tw-richter');
  dadminOp = await h.humanWithSession(['domain_admin', 'simulation_operator'], 'b33tw-richter-operator');
  ownerSteward = await h.humanWithSession(['twin_owner', 'method_steward'], 'b33tw-owner-steward');
  w = await bootDecisionWorld(h);
  wOwner = await h.openSession(w.twinOwner);
  // THE TELEMETRY (SYNTHETIC): the world's transit series extended through 2024-01-17 (a new contract version, one governed collection)
  await h.newVersion({ from: '2024-01-01', to: '2024-01-18', windowDays: 40 });
  const col = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(col.state, col.reason).toBe('finished');
  // THE CORRIDOR TWIN (the harness's own; T. Nakamura's part owns it): v1 on actual, observed through 2024-01-17
  const d = await w.twins.declare(R(owner, 'twin.declare'), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain (B33 twin harness, SYNTHETIC)',
    statement: 'the magnet chain the Regensburg line depends on', boundary: [w.entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  C = d.twin.twinId;
  V1 = await open(owner, C, { branchId: 'actual', observedThrough: '2024-01-17' });
  await ground(owner, C, V1, completeElements(w.records));
  await admit(owner, C, V1);
  // THE BLOCKADE ASSUMPTION (an ASU) linked to the corridor scenario's downside branch — through the real routes
  const asu = await w.graph.declare(h.req(strategist, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'The corridor is blockaded for 45 days (SYNTHETIC)',
    statement: 'no transit through Bab el-Mandeb for 45 days', restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about this strait' }] } }) as { strategy: { objectId: string } };
  ASU_BLOCK = asu.strategy.objectId;
  await anat.link(h.req(strategist, 'prediction.scenario.anatomy.assumption', 'SCN', w.scenarioId, 'prediction'), T(), D(), w.scenarioId,
    { payload: { assumptionId: ASU_BLOCK, branchId: w.branchId, critical: false, condition: { kind: 'state', text: 'transits resume through the strait (SYNTHETIC)' }, rationale: 'the blockade branches rest on a closure (SYNTHETIC)' } } as never);
  const scn = await one(sql`select object_version::int as v, content_digest from objects.canonical_objects where object_type = 'SCN' and object_id = ${w.scenarioId}::uuid order by object_version desc limit 1`);
  SCN_V = Number(scn['v']); SCN_DIGEST = String(scn['content_digest']);
  BASELINE_BRANCH = String((await one(sql`select branch_id::text from prediction.branches_current where scenario_id = ${w.scenarioId}::uuid and kind = 'baseline'`))['branch_id']);
}, 900_000);

afterAll(async () => { vi.restoreAllMocks(); await h?.close(); }, 120_000);

/* ═══════════════════════════════════════ TW1 ═══════════════════════════════════════ */
describe('TW1 · merges between non-actual branches (F-P5-03; V03-T-121 note)', () => {
  let M1 = ''; let M2 = ''; let DEEP = 0;
  it('positive: stress-75 merged INTO blockade — the base their nearest common version, the keys reconciled by the owner, a scenario value taken between scenario branches, the plan admitted on the target, the item closed', async () => {
    // two scenario branches forked from actual v1: the blockade (45 days, reroute 21) and the stress case (75 days, reroute 26)
    B1 = await open(owner, C, { branchId: 'blockade', forkedFromVersion: V1, carryFrom: V1, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days', 'route.reroute_delay_days'] });
    await ground(owner, C, B1, [assumed('route.reroute_delay_days', 21, 'days', 0.6)]);
    await scenario(owner, C, B1, [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: ASU_BLOCK } }]);
    await admit(owner, C, B1);
    S1 = await open(owner, C, { branchId: 'stress-75', forkedFromVersion: V1, carryFrom: V1, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days', 'route.reroute_delay_days'] });
    await ground(owner, C, S1, [assumed('route.reroute_delay_days', 26, 'days', 0.5)]);
    await scenario(owner, C, S1, [{ key: 'shock.corridor_delay_days', value: 75, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: ASU_BLOCK } }]);
    await admit(owner, C, S1);
    // a branch forked from the BLOCKADE (not from actual): the common base walks the forks
    DEEP = await open(owner, C, { branchId: 'deep', forkedFromVersion: B1, carryFrom: B1, observedThrough: '2024-01-17', except: ['terms.air_lead_days'] });
    await ground(owner, C, DEEP, [assumed('terms.air_lead_days', 12, 'days')]);
    await admit(owner, C, DEEP);
    const base = async (a: string, b: string) => Number((await one(sql`select twin.twx_common_base(${C}::uuid, ${a}, ${b}) as v`))['v']);
    expect(await base('stress-75', 'blockade')).toBe(V1);
    expect(await base('deep', 'blockade')).toBe(B1);
    expect(await base('deep', 'stress-75')).toBe(V1);
    // a twin owner (the peer) asks to merge the stress case into the blockade
    const m = await openMerge(peer, { sourceBranch: 'stress-75', targetBranch: 'blockade', reason: 'fold the stress figures into the blockade plan (SYNTHETIC)' });
    M1 = String(m.merge['merge_id']);
    expect(m.merge).toMatchObject({ state: 'open', source_branch: 'stress-75', target_branch: 'blockade', source_version: S1, target_version: B1, base_version: V1, opened_by: peer.principalId });
    expect((m.merge['diverging'] as Row[]).map((k) => [k['key'], k['change'], k['conflict']])).toEqual([['route.reroute_delay_days', 'changed', true], ['shock.corridor_delay_days', 'changed', true]]);
    const it1 = await items('twin.reconciliation', M1);
    expect(it1).toEqual([expect.objectContaining({ subject_kind: 'twin_branch', owner: owner.principalId, state: 'open', title: expect.stringMatching(/^Merge of branch stress-75 into blockade awaits reconciliation of 2 diverging key/) })]);
    // the completion refused until reconciliation — the target named
    await refused(complete(owner, M1), /^branch merge rejected \(unreconciled\): merging branch stress-75 into blockade is refused until reconciliation — 2 of 2 diverging key\(s\) unresolved/, 409);
    // a SCENARIO value moves between scenario branches (never into actual — B30's rule, kept: see the refusal case)
    await resolve(owner, M1, { key: 'shock.corridor_delay_days', resolution: 'take_branch', note: 'the blockade plan stresses the 75-day closure (SYNTHETIC)' });
    await resolve(owner, M1, { key: 'route.reroute_delay_days', resolution: 'reconciled', kind: 'assumed', value: 24, unit: 'days',
      citations: [{ kind: 'evidence', id: w.records.terms.id, version: w.records.terms.version }], note: 'between the 21 and 26 days, per the terms (SYNTHETIC)' });
    const c = await complete(owner, M1);
    expect(c.receipts.map((x) => x['step'])).toEqual(['plan', 'draft', 'ground', 'admit']);
    expect(c.merge).toMatchObject({ state: 'merged', target_branch: 'blockade', completing_by: owner.principalId });
    expect(c.admitted).toMatchObject({ branchId: 'blockade', supersedes: B1 });
    const merged = Number(c.merge['merged_version']);
    expect(await head(C, 'blockade')).toBe(merged);
    expect(await head(C, 'actual')).toBe(V1);   // actual untouched
    const e = await elementMap(C, merged);
    expect([e['shock.corridor_delay_days']?.['kind'], e['shock.corridor_delay_days']?.['value']]).toEqual(['scenario', 75]);
    expect([e['route.reroute_delay_days']?.['kind'], e['route.reroute_delay_days']?.['value']]).toEqual(['assumed', 24]);
    expect(Object.keys(e)).toHaveLength(16);
    // the merge's item CLOSED by the merge (the TW1 recommendation), with the outcome as the reason
    const closed = await items('twin.reconciliation', M1);
    expect(closed).toEqual([expect.objectContaining({ state: 'closed', closed_by: owner.principalId })]);
    expect(obj((await closure(String(closed[0]?.['item_id'])))?.['details'])).toMatchObject({ closed_by: 'b33', reason: expect.stringMatching(/merge .* of branch stress-75 into blockade merged as v\d+/) });
    const lg = await ledger(M1);
    expect(lg.map((x) => x['event'])).toEqual(['merge.opened', 'merge.key_resolved', 'merge.key_resolved', 'merge.reconciled', 'merge.completing', 'merge.merged']);
    expect(obj(lg[0]?.['details'])).toMatchObject({ target_branch: 'blockade', base: 'common_version' });
    expect(obj(lg[5]?.['details'])).toMatchObject({ target_branch: 'blockade', merged_version: merged });
    const x = await explorer(owner);
    expect(x.explorer.merges.find((mm) => mm['merge_id'] === M1)).toMatchObject({ target_branch: 'blockade', state: 'merged' });
    evidenceLog('TW1', { merge: M1, base: V1, merged_version: merged, item: closed[0]?.['state'] });
  });

  it('refusal: the target the source itself, actual as the source, an unknown target, a duplicate pair, a peer completing, a draft on the target around the merge, a scenario value taken into ACTUAL — nothing merged', async () => {
    // the stress case moves on, so there is something to merge again
    const s2 = await open(owner, C, { branchId: 'stress-75', carryFrom: S1, observedThrough: '2024-01-17', except: ['route.reroute_delay_days'] });
    await ground(owner, C, s2, [assumed('route.reroute_delay_days', 28, 'days', 0.5)]);
    await admit(owner, C, s2);
    await refused(openMerge(owner, { sourceBranch: 'stress-75', targetBranch: 'stress-75', reason: 'a branch into itself (B33 harness)' }), /^branch merge rejected \(branch\): targetBranch names actual or another branch/, 422);
    await refused(openMerge(owner, { sourceBranch: 'actual', targetBranch: 'blockade', reason: 'actual into a branch (B33 harness)' }), /^branch merge rejected \(branch\): sourceBranch names a branch other than actual/, 422);
    await refused(openMerge(owner, { sourceBranch: 'stress-75', targetBranch: 'nowhere', reason: 'an unknown target (B33 harness)' }), /^branch merge rejected \(unknown_branch\): branch nowhere of this twin has no admitted version to merge into/, 404);
    const m = await openMerge(owner, { sourceBranch: 'stress-75', targetBranch: 'blockade', reason: 'the new reroute figure into the blockade (SYNTHETIC)' });
    M2 = String(m.merge['merge_id']);
    expect(m.merge['base_version']).toBe(V1);
    await refused(openMerge(peer, { sourceBranch: 'stress-75', targetBranch: 'blockade', reason: 'the same pair again (B33 harness)' }), /^branch merge rejected \(duplicate\): branch stress-75 already has merge .* into blockade in progress/, 409);
    // the same source into ANOTHER target is its own merge (one live merge per pair)
    const toActual = await openMerge(peer, { sourceBranch: 'stress-75', reason: 'the stress case into actual (B33 harness)' });
    expect(toActual.merge).toMatchObject({ target_branch: 'actual', base_version: V1 });
    // a scenario value is never taken into ACTUAL (B30's rule, kept for the actual target)
    await refused(resolve(owner, String(toActual.merge['merge_id']), { key: 'shock.corridor_delay_days', resolution: 'take_branch', note: 'take the stress closure into actual' }), /^branch merge rejected \(scenario\)/, 422);
    await closeMerge(owner, String(toActual.merge['merge_id']), 'refused', 'the stress case is a scenario, not the actual corridor');
    // a peer twin owner completing another owner's merge
    await refused(complete(peer, M2), /^branch merge rejected \(ownership\)/, 403);
    // around the merge: a draft on the TARGET carrying the source's head is refused while the merge is in progress
    await refused(openRaw(owner, C, { branchId: 'blockade', carryFrom: s2, observedThrough: '2024-01-17' }), /^branch merge rejected \(unreconciled\): branch stress-75 has merge .* in progress \(open\); merging it into blockade goes through the merge/, 409);
    expect(Number((await one(sql`select count(*)::int n from twin.twin_versions where twin_id = ${C}::uuid and branch_id = 'blockade' and state = 'draft'`))['n'])).toBe(0);
    // the refused merge's item is CLOSED (refused), the open one's stays open
    expect(await items('twin.reconciliation', String(toActual.merge['merge_id']))).toEqual([expect.objectContaining({ state: 'closed', closed_by: owner.principalId })]);
    expect(await items('twin.reconciliation', M2)).toEqual([expect.objectContaining({ state: 'open' })]);
  });

  it('recovery: the target moves (stale) — the merge withdrawn (its item closed) and re-opened against the new head; an open draft on the target held, withdrawn; the merge completed', async () => {
    const bh = await head(C, 'blockade');
    const b3 = await open(owner, C, { branchId: 'blockade', carryFrom: bh, observedThrough: '2024-01-17', except: ['terms.air_cost_per_kg'] });
    await ground(owner, C, b3, [assumed('terms.air_cost_per_kg', 23, 'EUR')]);
    await admit(owner, C, b3);
    await resolve(owner, M2, { key: 'route.reroute_delay_days', resolution: 'take_branch', note: 'take the 28-day reroute (SYNTHETIC)' });
    await refused(complete(owner, M2), /^branch merge rejected \(stale\): the heads moved since merge .* \(branch stress-75 v\d+ → v\d+, blockade v\d+ → v\d+\)/, 409);
    await closeMerge(owner, M2, 'withdrawn', 'the blockade moved on; re-open against its new head');
    expect(await items('twin.reconciliation', M2)).toEqual([expect.objectContaining({ state: 'closed' })]);
    const m = await openMerge(owner, { sourceBranch: 'stress-75', targetBranch: 'blockade', reason: 'the reroute figure against the current blockade (SYNTHETIC)' });
    const M3 = String(m.merge['merge_id']);
    expect((m.merge['diverging'] as Row[]).map((k) => k['key'])).toEqual(['route.reroute_delay_days']);
    await resolve(owner, M3, { key: 'route.reroute_delay_days', resolution: 'take_branch', note: 'take the 28-day reroute (SYNTHETIC)' });
    // an open draft on the TARGET holds the completion until it is admitted or withdrawn
    const stray = await open(owner, C, { branchId: 'blockade', carryFrom: b3, observedThrough: '2024-01-17' });
    await refused(complete(owner, M3), /^branch merge rejected \(state\): blockade has an open draft v\d+/, 409);
    await withdraw(owner, C, stray, 'a stray draft held the merge');
    const c = await complete(owner, M3);
    expect(c.merge).toMatchObject({ state: 'merged', target_branch: 'blockade' });
    const e = await elementMap(C, Number(c.merge['merged_version']));
    expect([e['route.reroute_delay_days']?.['value'], e['terms.air_cost_per_kg']?.['value'], e['shock.corridor_delay_days']?.['kind']]).toEqual([28, 23, 'scenario']);
    expect(await items('twin.reconciliation', M3)).toEqual([expect.objectContaining({ state: 'closed' })]);
  });
});

/* ═══════════════════════════════════════ TW2 ═══════════════════════════════════════ */
describe('TW2 · the SCENARIO citation kind (F-P5-03)', () => {
  let other = { scenarioId: '', branchId: '' };
  it('positive: a scenario element cites the SCN object (exact version and digest, with its branch) beside the branch\'s assumption; alone on a non-material key; admitted', async () => {
    const bh = await head(C, 'blockade');
    const d = await open(owner, C, { branchId: 'blockade', carryFrom: bh, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days'] });
    const g = await scenario(owner, C, d, [
      { key: 'shock.corridor_delay_days', value: 60, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: ASU_BLOCK }, citeScenario: true },
      { key: 'corridor.closure_share', value: 100, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true, scenarioVersion: SCN_V },
    ]);
    expect(g.grounded[0]).toMatchObject({ key: 'shock.corridor_delay_days', kind: 'scenario', material: true,
      scenario: { kind: 'scenario', id: w.scenarioId, version: SCN_V, digest: SCN_DIGEST, branch: w.branchId }, assumption: expect.objectContaining({ kind: 'assumption', id: ASU_BLOCK }) });
    expect(g.grounded[1]).toMatchObject({ key: 'corridor.closure_share', kind: 'scenario', material: false, assumption: null, link_id: null,
      scenario: { kind: 'scenario', id: w.scenarioId, version: SCN_V, branch: w.branchId } });
    await admit(owner, C, d);
    const e = await elementMap(C, d);
    expect(arr(e['shock.corridor_delay_days']?.['citations']).map((c) => c['kind']).sort()).toEqual(['assumption', 'scenario']);
    expect(arr(e['corridor.closure_share']?.['citations'])).toEqual([{ kind: 'scenario', id: w.scenarioId, version: SCN_V, digest: SCN_DIGEST, branch: w.branchId }]);
    // the version RESTS ON the scenario (the 0065 reach convention: a `strategy` dependency on the scenario id)
    expect((await rows(sql`select depends_on_kind from graph.dependencies where dependent_object_id = ${C}::uuid and depends_on_id = ${w.scenarioId}::uuid`)).map((r) => r['depends_on_kind'])).toContain('strategy');
    evidenceLog('TW2', { version: d, citation: arr(e['corridor.closure_share']?.['citations'])[0] });
  });

  it('refusal: the scenario alone on a MATERIAL key, an unknown SCN version, a branch of another scenario, a SUSPENDED branch, an unknown branch — nothing grounded', async () => {
    // a second scenario (the strategist's part) — its branch is not a branch of the corridor scenario
    const scn2 = await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'Suez over the next 30 days (B33 harness, SYNTHETIC)', statement: 'the canal stays open or closes', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
                   branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string }> } };
    other = { scenarioId: scn2.scenario.scenarioId, branchId: scn2.scenario.branches[0]?.branchId as string };
    const bh = await head(C, 'blockade');
    const d = await open(owner, C, { branchId: 'blockade', carryFrom: bh, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days'] });
    const el = (over: Row) => ({ key: 'shock.corridor_delay_days', value: 50, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true, ...over });
    await refused(scenario(owner, C, d, [el({})]), /^scenario element rejected \(basis\): shock\.corridor_delay_days is material for this twin — the scenario citation alone does not substantiate it at admission/, 422);
    // the scenario citation is judged before the materiality: an unknown version, a branch of ANOTHER scenario, an unknown branch
    await refused(scenario(owner, C, d, [el({ scenarioVersion: 99 })]), /^scenario element rejected \(unknown_scenario\): scenario .*@99 is not an authorized SCN object of this domain/, 404);
    await refused(scenario(owner, C, d, [el({ scenarioBranchId: other.branchId })]), /^scenario element rejected \(basis\): branch .* \(Baseline\) is a branch of scenario .*, not of /, 422);
    await refused(scenario(owner, C, d, [el({ scenarioBranchId: '0190b1c2-d3e4-7000-8000-00000000b33f' })]), /^scenario element rejected \(unknown_scenario_branch\)/, 404);
    // a SUSPENDED branch of the scenario (the strategist suspends the baseline with a reason)
    await anat.suspend(h.req(strategist, 'prediction.scenario.anatomy.suspend', 'SCN', BASELINE_BRANCH, 'prediction'), T(), D(), BASELINE_BRANCH,
      { payload: { reason: 'the baseline is under review for the closure (B33 harness, SYNTHETIC)' } } as never);
    await refused(scenario(owner, C, d, [el({ key: 'corridor.closure_share', value: 90, unit: '%', scenarioBranchId: BASELINE_BRANCH })]), /^scenario element rejected \(state\): scenario branch Baseline is suspended; a scenario element cites an OPEN branch of its scenario/, 409);
    expect(Object.keys(await elementMap(C, d))).not.toContain('shock.corridor_delay_days');
    await withdraw(owner, C, d, 'the refusal probes leave nothing');
  });

  it('recovery: the baseline reinstated by its owner — the element cites it; the material key grounded with the assumption beside the scenario', async () => {
    await anat.reinstate(h.req(wOwner, 'prediction.scenario.anatomy.reinstate', 'SCN', BASELINE_BRANCH, 'prediction'), T(), D(), BASELINE_BRANCH,
      { payload: { note: 'the review is closed: the baseline stands again (B33 harness, SYNTHETIC)' } } as never);
    const bh = await head(C, 'blockade');
    const d = await open(owner, C, { branchId: 'blockade', carryFrom: bh, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days', 'corridor.closure_share'] });
    const g = await scenario(owner, C, d, [
      { key: 'corridor.closure_share', value: 90, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: BASELINE_BRANCH, citeScenario: true },
      { key: 'shock.corridor_delay_days', value: 50, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true, assumption: { id: ASU_BLOCK } },
    ]);
    expect(g.grounded.map((x) => [x['key'], obj(x['scenario'])['branch']])).toEqual([['corridor.closure_share', BASELINE_BRANCH], ['shock.corridor_delay_days', w.branchId]]);
    await admit(owner, C, d);
    expect(other.scenarioId).not.toBe('');
  });
});

/* ═══════════════════════════════════════ TW3 ═══════════════════════════════════════ */
describe('TW3 · the scenario-element form\'s route (F-P5-03; the web form posts this payload)', () => {
  it('positive: the form\'s payload (the scenario basis, the days) grounds; the DATEs read back as the days they name', async () => {
    const bh = await head(C, 'stress-75');
    const d = await open(owner, C, { branchId: 'stress-75', carryFrom: bh, observedThrough: '2024-01-17' });
    // the payload exactly as apps/web/lib/branches-b30.ts scenarioElementPayload builds it
    const g = await scenario(owner, C, d, [{ key: 'corridor.closure_share', value: 75, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true,
                                             validFrom: '2024-01-10', validTo: '2024-02-24', confidence: 0.3 }]);
    expect(g.grounded[0]).toMatchObject({ key: 'corridor.closure_share', kind: 'scenario' });
    await admit(owner, C, d);
    const e = (await elementMap(C, d))['corridor.closure_share'] as Row;
    expect(e).toMatchObject({ kind: 'scenario', valid_from: '2024-01-10', valid_to: '2024-02-24' });
    const x = await explorer(owner);
    expect(arr(x.explorer.branches).find((b) => b['branch_id'] === 'stress-75')).toMatchObject({ head: d });
  });
  it('refusal: the server\'s own words — the form\'s "both" basis naming an assumption NOT linked to the branch; an admitted version', async () => {
    const bh = await head(C, 'stress-75');
    const d = await open(owner, C, { branchId: 'stress-75', carryFrom: bh, observedThrough: '2024-01-17', except: ['corridor.closure_share'] });
    await refused(scenario(owner, C, d, [{ key: 'corridor.closure_share', value: 80, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true, assumption: { id: w.assumptionId } }]),
      /^scenario element rejected \(basis\): assumption .* is not linked to scenario .* branch .*; a scenario element cites its scenario branch's assumption/, 422);
    await refused(scenario(owner, C, bh, [{ key: 'corridor.closure_share', value: 80, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true }]),
      /^scenario element rejected \(state\): version \d+ is admitted; a scenario element goes into an open draft/, 409);
    await refused(scenario(owner, C, d, [{ key: 'corridor.closure_share', value: 80, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, scenarioVersion: 1 }]),
      /^scenario element rejected \(basis\): scenarioVersion names the cited SCN version — set citeScenario/, 422);
    await withdraw(owner, C, d, 'the form probes leave nothing');
  });
  it('recovery: the form corrected — the scenario basis alone on the non-material key', async () => {
    const bh = await head(C, 'stress-75');
    const d = await open(owner, C, { branchId: 'stress-75', carryFrom: bh, observedThrough: '2024-01-17', except: ['corridor.closure_share'] });
    const g = await scenario(owner, C, d, [{ key: 'corridor.closure_share', value: 80, unit: '%', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, citeScenario: true }]);
    expect(g.grounded[0]).toMatchObject({ kind: 'scenario', scenario: expect.objectContaining({ kind: 'scenario', version: SCN_V }) });
    await admit(owner, C, d);
  });
});

/* ═══════════════════════════════════════ TW4 ═══════════════════════════════════════ */
let E4a = '';
describe('TW4 · the ESTIMATE citation kind (F-P5-02)', () => {
  const primary = (over: Row = {}): Row => ({ twinId: C, key: CORRIDOR_KEY, name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline', parameters: { baseline: BASELINE, scale: 100 },
    inputs: [{ kind: 'series', series_key: w.seriesKey, unit: 'transits/day', cadence_days: 1 }], unit: '%', bounds: { min: 0, max: 200 }, materiality: 0.05, ambiguity: 0.5,
    constraintSets: ['corridor-share-rule'], note: 'corridor capacity from the latest transit count against the baseline (SYNTHETIC)', ...over });
  it('positive: the approved estimated element cites exactly {kind: estimate, id, version 1, digest: inputs_digest} beside its evidence; the TWN rests on it', async () => {
    await cons.declare(h.req(steward, 'simulation.constraint.declare', 'CST', null, 'twin'), T(), D(), { payload: { setKey: 'corridor-share-rule', title: 'Corridor share at most 200 % (SYNTHETIC)',
      constraints: [{ key: 'share-bounded', kind: 'business_rule', quantity: CORRIDOR_KEY, op: '<=', value: 200, unit: '%', per: 'day', applies_to: ['run_input'] }], note: 'the corridor estimate is checked before it is published' } });
    await declareEstimator(primary());
    const a = await propose(C, CORRIDOR_KEY);
    E4a = String(a['estimate_id']);
    expect(a).toMatchObject({ state: 'proposed', constraint: 'satisfied', material: true, routed: true });
    const ok = await decide(E4a, 'approved', 'the transit count is in; the capacity share is accepted (SYNTHETIC)');
    const v = Number(obj(ok.snapshot)['version']);
    const row = await estimateRow(E4a);
    const el = (await elementMap(C, v))[CORRIDOR_KEY] as Row;
    expect(el['kind']).toBe('estimated');
    const cites = arr(el['citations']);
    expect(cites.filter((c) => c['kind'] === 'estimate')).toEqual([{ kind: 'estimate', id: E4a, version: 1, digest: row['inputs_digest'] }]);
    expect(cites.filter((c) => c['kind'] === 'evidence').length).toBeGreaterThan(0);
    expect((await rows(sql`select depends_on_kind from graph.dependencies where dependent_object_id = ${C}::uuid and depends_on_id = ${E4a}::uuid`)).map((r) => r['depends_on_kind'])).toEqual(['estimate']);
    const twn = await one(sql`select source_object_ids from objects.canonical_objects where object_type = 'TWN' and object_id = ${C}::uuid and object_version = ${v}::int`);
    expect(arr(twn['source_object_ids']).map(String)).toContain(`estimate:${E4a}@1`);
    evidenceLog('TW4', { estimate: E4a, version: v, citation: cites.find((c) => c['kind'] === 'estimate') });
  });
  it('refusal: an approval whose element LACKS the estimate citation, or carries a forged digest — estimate rejected (citation) 422, rolled back whole', async () => {
    const b = await propose(C, CORRIDOR_KEY);
    const before = await versionCount(C);
    const strip = (mutate: (c: Row[]) => Row[]) => {
      const real = TwinCapability.ground.bind(TwinCapability);
      return vi.spyOn(TwinCapability, 'ground').mockImplementation((tx, action) => {
        const cap = real(tx, action);
        const orig = cap.groundElement.bind(cap);
        const ground = (a: Parameters<typeof cap.groundElement>[0]) => orig({ ...a, citations: mutate(a.citations as unknown as Row[]) as never });
        return new Proxy(cap, { get(target, prop) {
          if (prop === 'groundElement') return ground;
          const v = Reflect.get(target, prop, target) as unknown;
          return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(target) : v;
        } });
      });
    };
    const s1 = strip((cs) => cs.filter((c) => c['kind'] !== 'estimate'));
    await refused(decide(String(b['estimate_id']), 'approved', 'an approval without the estimate citation'), /^estimate rejected \(citation\): version \d+ carries corridor\.capacity_share without exactly this estimate's citation/, 422);
    s1.mockRestore();
    const s2 = strip((cs) => cs.map((c) => (c['kind'] === 'estimate' ? { ...c, digest: 'f'.repeat(64) } : c)));
    await refused(decide(String(b['estimate_id']), 'approved', 'an approval with a forged estimate digest'), /^estimate rejected \(citation\)/, 422);
    s2.mockRestore();
    expect(await versionCount(C)).toBe(before);   // no draft, no version: rolled back with the refusal
    expect((await estimateRow(String(b['estimate_id'])))['state']).toBe('proposed');
  });
  it('recovery: the honest approval publishes it, citing the estimate', async () => {
    const open0 = await one(sql`select estimate_id::text from twin.estimates where twin_id = ${C}::uuid and state = 'proposed'`);
    const ok = await decide(String(open0['estimate_id']), 'approved', 'the same count, published honestly (SYNTHETIC)');
    const el = (await elementMap(C, Number(obj(ok.snapshot)['version'])))[CORRIDOR_KEY] as Row;
    expect(arr(el['citations']).filter((c) => c['kind'] === 'estimate').map((c) => c['id'])).toEqual([open0['estimate_id']]);
  });
});

/* ═══════════════════════════════════════ TW5 ═══════════════════════════════════════ */
let E5b = ''; let E5b2 = '';
describe('TW5 · the CROSS-TWIN DEPENDENCY check before publish (V03-T-308; V03-T-315; V02-T-121 coupled state)', () => {
  let uo2 = 0; let uo3 = 0; let P2 = '';
  const proposals = async (state = 'proposed') => rows(sql`select proposal_id::text, upstream_version from twin.coupling_proposals where downstream_twin_id = ${C}::uuid and state = ${state} order by proposed_at`);
  const applyCoupling = (id: string, as = owner) => comp.applyCoupling(R(as, 'twin.coupling.apply', id, 'CPL'), T(), D(), id) as Promise<{ applied: Row }>;
  /** the coupling applied, then its draft admitted by the downstream owner (the apply grounds into a draft; the admission is the owner's own act) */
  const couple = async (id: string) => { const a = await applyCoupling(id); await admit(owner, C, Number(a.applied['version'])); return Number(a.applied['version']); };
  it('positive: an upstream twin linked and coupled, its head verified — the dependency CERTAIN, recorded; the estimate approved', async () => {
    const ud = await w.twins.declare(R(kovacs, 'twin.declare'), T(), D(), { payload: { kind: 'supply-chain', title: 'Upstream port twin (B33 twin harness, SYNTHETIC)', statement: 'the upstream port',
      boundary: [w.entityId], owner: kovacs.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    U = ud.twin.twinId;
    const u1 = await open(kovacs, U, { branchId: 'actual', observedThrough: '2024-01-17' });
    await ground(kovacs, U, u1, completeElements(w.records));
    await admit(kovacs, U, u1);
    await comp.publishContract(R(kovacs, 'twin.contract.publish', U), T(), D(), U, { payload: { exposed: { 'inventory.on_hand:SYN-PART-MAG': { unit: 'sets', cadence: 'on-admission' } },
      approvedUses: { methodFamilies: ['flow'], decisionClasses: ['capacity-planning'] } } });
    await comp.declareLink(R(owner, 'twin.link.declare', C), T(), D(), { payload: { upstreamTwinId: U, downstreamTwinId: C,
      mapping: [{ from: 'inventory.on_hand:SYN-PART-MAG', to: 'upstream.inventory.on_hand:SYN-PART-MAG' }], use: 'capacity-planning' } });
    uo2 = await open(kovacs, U, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: u1 });
    await admit(kovacs, U, uo2);
    const p1 = (await proposals())[0] as Row;
    expect(Number(p1['upstream_version'])).toBe(uo2);
    await couple(String(p1['proposal_id']));   // the pre-check passes: the upstream version and head verified
    const a = await propose(C, CORRIDOR_KEY);
    const row = await estimateRow(String(a['estimate_id']));
    expect(obj(obj(row['constraint_check'])['dependency'])).toMatchObject({ state: 'certain', upstream: [expect.objectContaining({ twin_id: U, head_version: uo2, cited_version: uo2, behind: false })] });
    expect(arr(row['ambiguity_reasons']).join(' ')).not.toMatch(/cross-twin dependency/);
    await decide(String(a['estimate_id']), 'approved', 'the coupled corridor estimate is accepted (SYNTHETIC)');
  });
  it('refusal: the upstream UNVERIFIED — the proposal ambiguous (dependency uncertain, recorded), its approval refused (dependency 409, nothing admitted); the coupling apply refused (the TS pre-check)', async () => {
    uo3 = await open(kovacs, U, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: uo2 });
    await admit(kovacs, U, uo3);
    P2 = String(((await proposals())[0] as Row)['proposal_id']);
    // a cited input of the upstream's head was corrected: twin.mark_unverified's effect (the Phase 3 propagation's port, proven in its own suites)
    await sql`update twin.twin_versions set verification_state = 'unverified' where twin_id = ${U}::uuid and version = ${uo3}::int`.execute(su);
    const b = await propose(C, CORRIDOR_KEY);
    E5b = String(b['estimate_id']);
    expect(b).toMatchObject({ ambiguous: true, routed: true });
    expect(arr(b['ambiguity_reasons']).join(' ')).toMatch(/the cross-twin dependency on Upstream port twin .* is uncertain: unverified \(a cited input of its head was corrected\), behind \(this head cites v\d+, the upstream head is v\d+\)/);
    expect(obj(obj((await estimateRow(E5b))['constraint_check'])['dependency'])).toMatchObject({ state: 'uncertain' });
    const before = await versionCount(C);
    await refused(decide(E5b, 'approved', 'approving on an unverified upstream'), /^estimate rejected \(dependency\): estimate .* rests on twin .* whose upstream twin dependency is unavailable — Upstream port twin .*: unverified; publish once the upstream has a verified admitted head/, 409);
    expect(await versionCount(C)).toBe(before);
    expect((await estimateRow(E5b))['state']).toBe('proposed');
    await refused(applyCoupling(P2), /^coupling rejected \(dependency\): proposal .* rests on an unavailable cross-twin dependency — upstream twin .*: its version v\d+ the proposal carries is UNVERIFIED/, 409);
    expect((await proposals()).map((p) => p['proposal_id'])).toContain(P2);   // nothing written: still proposed
    // TW7's supersession and decline: a second proposal supersedes E5b; then the owner declines it
    const b2 = await propose(C, CORRIDOR_KEY);
    E5b2 = String(b2['estimate_id']);
    await decide(E5b2, 'declined', 'the upstream is unverified; a new proposal follows its verified head');
  });
  it('recovery: a verified upstream head — coupled again, the dependency certain, approved; a STALE upstream approved only with the owner\'s note', async () => {
    const uo4 = await open(kovacs, U, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: uo2 });
    await admit(kovacs, U, uo4);
    const p3 = (await proposals()).find((p) => Number(p['upstream_version']) === uo4) as Row;
    await couple(String(p3['proposal_id']));
    const c = await propose(C, CORRIDOR_KEY);
    expect(obj(obj((await estimateRow(String(c['estimate_id'])))['constraint_check'])['dependency'])).toMatchObject({ state: 'certain' });
    await decide(String(c['estimate_id']), 'approved', 'the verified upstream is coupled; accepted (SYNTHETIC)');
    // the upstream goes STALE against its own policy (0 days): the soft rule — the owner's note
    await br.policy(R(kovacs, 'twin.freshness.policy', U), T(), D(), U, { payload: { maxAgeDays: 0, note: 'the port must be fresh every day (SYNTHETIC)' } });
    const s = await propose(C, CORRIDOR_KEY);
    expect(s).toMatchObject({ ambiguous: true });
    expect(arr(s['ambiguity_reasons']).join(' ')).toMatch(/is uncertain: stale \(\d+ days, against its own policy\)/);
    await refused(decide(String(s['estimate_id']), 'approved', ''), /^estimate rejected \(note\)/, 422);
    const ok = await decide(String(s['estimate_id']), 'approved', 'the port twin is stale but its inventory has not moved (SYNTHETIC)');
    expect(ok.decision).toMatchObject({ state: 'approved' });
    evidenceLog('TW5', { refused_estimate: E5b, coupling_refused: P2, stale_approved: s['estimate_id'] });
  });
});

/* ═══════════════════════════════════════ TW6 ═══════════════════════════════════════ */
describe('TW6 · a TOPOLOGY rule failing an estimate on a route-bearing head (F-P5-02; a supply-network twin)', () => {
  let base: { id: string; version: number } = { id: '', version: 0 };
  const asEl = (e: { key: string; value: unknown; unit: string | null }) => ({ key: e.key, kind: 'assumed', value: e.value, unit: e.unit, citations: [cite(base)] });
  it('positive: the network\'s routes reach Regensburg from the steel mill — the topology rule satisfied, the capacity estimate approved into a new snapshot', async () => {
    const up = await h.upload([{ filename: 'b33-network.csv', text: 'synthetic,record_id,key,value,unit\ntrue,SYN-NET-B33,capacity:bearing-maker.bearing,1800,pcs/day\n' }]);
    base = up[0] as { id: string; version: number };
    const nd = await w.twins.declare(R(owner, 'twin.declare'), T(), D(), { payload: { kind: 'supply-network', title: 'Hub-module supply network (B33 twin harness, SYNTHETIC)', statement: 'three tiers to Regensburg',
      boundary: [w.entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    N = nd.twin.twinId;
    const n1 = await open(owner, N, { branchId: 'actual', observedThrough: '2024-01-17' });
    await ground(owner, N, n1, threeTier().map(asEl));
    await admit(owner, N, n1, true);
    await cons.declare(h.req(steward, 'simulation.constraint.declare', 'CST', null, 'twin'), T(), D(), { payload: { setKey: 'network-reach', title: 'Regensburg reachable (SYNTHETIC)',
      constraints: [{ key: 'regensburg-reachable', kind: 'topology', sources: { nodes: ['steel-mill'] }, targets: { nodes: ['regensburg'] }, avoid: ['old-mill'], applies_to: ['run_input'],
                      title: 'steel reaches the Regensburg line' }], note: 'the network estimate is checked against its own routes' } });
    await declareEstimator({ twinId: N, key: NET_KEY, name: 'bearing-throughput', role: 'primary', method: 'last_observation', parameters: { scale: 28 },
      inputs: [{ kind: 'series', series_key: w.seriesKey, unit: 'transits/day', cadence_days: 1 }], unit: 'pcs/day', bounds: { min: 0, max: 10000 }, materiality: 0.05, ambiguity: 0.5,
      constraintSets: ['network-reach'], note: 'the bearing maker\'s daily capacity read from a synthetic throughput series (SYNTHETIC)' });
    const a = await propose(N, NET_KEY);
    expect(a).toMatchObject({ constraint: 'satisfied', state: 'proposed' });
    const row = await estimateRow(String(a['estimate_id']));
    expect(obj(row['constraint_check'])).toMatchObject({ outcome: 'satisfied', pins: [expect.objectContaining({ set_key: 'network-reach', version: 1 })] });
    const ok = await decide(String(a['estimate_id']), 'approved', 'the throughput reading is accepted (SYNTHETIC)', owner, true);
    expect(ok.decision).toMatchObject({ state: 'approved' });
    evidenceLog('TW6', { satisfied: a['estimate_id'], snapshot: obj(ok.snapshot)['version'] });
  });
  it('refusal: the steel route cut — the proposal ambiguous (the topology rule violated), its approval refused (constraint)', async () => {
    const h0 = await head(N, 'actual');
    const cut = await open(owner, N, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: h0, except: ['route:r1'] });
    await admit(owner, N, cut, true);
    const b = await propose(N, NET_KEY);
    expect(b).toMatchObject({ constraint: 'violated', ambiguous: true });
    expect(arr(obj((await estimateRow(String(b['estimate_id'])))['constraint_check'])['violations']).map((v) => v['message']).join(' ')).toMatch(/regensburg cannot be reached from any source/);
    await refused(decide(String(b['estimate_id']), 'approved', 'approving on a cut network', owner, true), /^estimate rejected \(constraint\): the constraint check before publish is violated \(.*regensburg cannot be reached/, 422);
  });
  it('recovery: the route restored — a new proposal satisfied and approved', async () => {
    const h0 = await head(N, 'actual');
    const fix = await open(owner, N, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: h0 });
    await ground(owner, N, fix, [asEl({ key: 'route:r1', value: { from: 'steel-mill', to: 'bearing-maker', material: 'steel' }, unit: null })]);
    await admit(owner, N, fix, true);
    const c = await propose(N, NET_KEY);
    expect(c).toMatchObject({ constraint: 'satisfied' });
    expect((await decide(String(c['estimate_id']), 'approved', 'the steel route is back (SYNTHETIC)', owner, true)).decision).toMatchObject({ state: 'approved' });
  });
});

/* ═══════════════════════════════════════ TW7 ═══════════════════════════════════════ */
describe('TW7 · the routed items CLOSED on decision; the outside run\'s awaiting-admission item (F-P5-02, F-P5-04; V03-T-309 note)', () => {
  let R_OUT = ''; let R_OUT2 = '';
  it('positive: the estimate items closed by approval, supersession and decline; an outside run raises the awaiting-admission item, closed by the admission; the admission\'s item closed by the concurrence', async () => {
    // the ESTIMATE items (TW4/TW5's proposals): approved, superseded, declined — each closed with the decision as the reason
    const ia = await items('twin.reconciliation', E4a);
    expect(ia).toEqual([expect.objectContaining({ subject_kind: 'twin_estimate', state: 'closed', closed_by: owner.principalId })]);
    expect(obj((await closure(String(ia[0]?.['item_id'])))?.['details'])).toMatchObject({ reason: expect.stringMatching(/^estimate .* approved by the twin's owner into v\d+/), closed_by: 'b33' });
    const ib = await items('twin.reconciliation', E5b);
    expect(ib).toEqual([expect.objectContaining({ state: 'closed' })]);
    expect(obj((await closure(String(ib[0]?.['item_id'])))?.['details'])).toMatchObject({ reason: expect.stringMatching(/superseded by estimate/) });
    const ic = await items('twin.reconciliation', E5b2);
    expect(ic).toEqual([expect.objectContaining({ state: 'closed', closed_by: owner.principalId })]);
    expect(obj((await closure(String(ic[0]?.['item_id'])))?.['details'])).toMatchObject({ reason: expect.stringMatching(/declined by the twin's owner: the upstream is unverified/) });
    // THE STRESS VERSION of the world's corridor twin (SYNTHETIC): 75 corridor days — supply-flow@1 declares corridor_delay_days in [0, 60]
    const o = await open(wOwner, w.twinId, { branchId: 'actual', observedThrough: '2024-01-17', carryFrom: w.v1, except: ['shock.corridor_delay_days'] });
    await ground(wOwner, w.twinId, o, [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 75, unit: 'days', citations: [cite(w.records.terms)] }]);
    await admit(wOwner, w.twinId, o);
    V75 = o;
    // no policy yet: the outside run's item is DEPRIORITIZED — listed, never hidden — with the twin's owner named
    const r1 = (await run(owner, { twinVersion: V75, envelope: ACK })).run;
    expect(r1.state).toBe('completed');
    R_OUT = r1.runId;
    const i1 = await items('twin.envelope', R_OUT);
    expect(i1).toEqual([expect.objectContaining({ subject_kind: 'run', state: 'deprioritized', owner: w.twinOwner.principalId, policy_version: null, cause_event_type: 'simulation.run.finished_outside_envelope',
      title: expect.stringMatching(/^Outside-envelope run on .* \(completed\) — awaiting a twin owner's exploratory admission$/) })]);
    expect(obj(i1[0]?.['details'])).toMatchObject({ awaiting: 'exploratory_admission', run_id: R_OUT, outside: expect.stringMatching(/corridor_delay_days = 75 outside \[0, 60\]/) });
    // the domain administrator publishes a policy naming twin.envelope → the twin owners (the act's policy v11 does the same)
    await w.exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules: { classes: {
      'twin.envelope': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['twin_owner'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
      'twin.reconciliation': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['twin_owner'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' } },
      overload: { max_open_per_role: 50 } }, reason: 'B33 twin harness: twin items to the twin owners (SYNTHETIC)' } as never });
    const r2 = (await run(owner, { twinVersion: V75, envelope: ACK })).run;
    R_OUT2 = r2.runId;
    expect(await items('twin.envelope', R_OUT2)).toEqual([expect.objectContaining({ state: 'open', owner: w.twinOwner.principalId, route_roles: ['twin_owner'], policy_version: expect.any(Number) })]);
    // the twin's owner ADMITS R_OUT as exploratory → the awaiting item CLOSED; the admission's own item (the stewards) raised
    await admitRun(wOwner, R_OUT, 'explore the 75-day closure as a stress case, never as a plan');
    const i2 = await items('twin.envelope', R_OUT);
    expect(i2.map((x) => [x['cause_event_type'], x['state']])).toEqual([['simulation.run.finished_outside_envelope', 'closed'], ['twin.envelope_event', 'open']]);
    expect(i2[0]?.['closed_by']).toBe(w.twinOwner.principalId);
    expect(obj((await closure(String(i2[0]?.['item_id'])))?.['details'])).toMatchObject({ reason: expect.stringMatching(/admitted as exploratory by a twin owner/) });
    // the method steward CONCURS → the admission's item CLOSED
    await concur(methodSteward, R_OUT, 'the stress case is worth exploring; not for a decision');
    expect((await items('twin.envelope', R_OUT)).map((x) => x['state'])).toEqual(['closed', 'closed']);
    expect((await items('twin.envelope', R_OUT))[1]?.['closed_by']).toBe(methodSteward.principalId);
    evidenceLog('TW7', { r_out: R_OUT, items: (await items('twin.envelope', R_OUT)).map((x) => [x['cause_event_type'], x['state']]) });
  });
  it('refusal: refused acts close nothing — the domain administrator\'s admission (403), the admitter\'s own concurrence (403); an inside run raises nothing', async () => {
    await refused(admitRun(dadmin, R_OUT2, 'the administrator admits the stress case (B33 harness)'), /^exploratory admission rejected \(ownership\)/, 403);
    expect((await items('twin.envelope', R_OUT2)).map((x) => x['state'])).toEqual(['open']);
    await admitRun(ownerSteward, R_OUT2, 'a second stress case to explore (B33 harness)');
    await refused(concur(ownerSteward, R_OUT2, 'the admitter concurs with itself (B33 harness)'), /^exploratory admission rejected \(separation_of_duties\)/, 403);
    expect((await items('twin.envelope', R_OUT2)).map((x) => [x['cause_event_type'], x['state']])).toEqual([['simulation.run.finished_outside_envelope', 'closed'], ['twin.envelope_event', 'open']]);
    const inside = (await run(owner, { twinVersion: w.v1 })).run;
    expect(inside.state).toBe('completed');
    expect(await items('twin.envelope', inside.runId)).toEqual([]);
  });
  it('recovery: an outside run RETIRED by the twin\'s owner — its awaiting item closed by the retirement; the second admission concurred by the steward — closed', async () => {
    const r3 = (await run(owner, { twinVersion: V75, envelope: ACK })).run;
    expect((await items('twin.envelope', r3.runId)).map((x) => x['state'])).toEqual(['open']);
    await retireRun(wOwner, r3.runId, 'the stress run is superseded by the admitted one (B33 harness)');
    const i = await items('twin.envelope', r3.runId);
    expect(i).toEqual([expect.objectContaining({ state: 'closed', closed_by: w.twinOwner.principalId })]);
    expect(obj((await closure(String(i[0]?.['item_id'])))?.['details'])).toMatchObject({ reason: expect.stringMatching(/retired: the stress run is superseded/) });
    await concur(methodSteward, R_OUT2, 'the second stress case may be explored');
    expect((await items('twin.envelope', R_OUT2)).map((x) => x['state'])).toEqual(['closed', 'closed']);
  });
});

/* ═══════════════════════════════════════ TW8 ═══════════════════════════════════════ */
describe('TW8 · simulation.open_run\'s envelope refusal wording (F-P5-04)', () => {
  it('refusal: no acknowledgement → "needs a twin owner\'s acknowledgement"; a domain administrator holding simulation_operator → "a twin owner\'s of this domain; the acting principal is not one"', async () => {
    const r1 = await refused(run(owner, { twinVersion: V75 }), /^run rejected \(envelope\): outside the operating envelope of supply-flow@1 \(corridor_delay_days = 75 outside \[0, 60\]\); a run outside the envelope needs a twin owner's acknowledgement \(envelope\.acknowledge true with a reason of 8\+ characters\)$/, 422);
    const r2 = await refused(run(dadminOp, { twinVersion: V75, envelope: ACK }), /^run rejected \(envelope_ack\): the acknowledgement of an envelope breach is a twin owner's of this domain; the acting principal is not one \(corridor_delay_days = 75 outside \[0, 60\]\)$/, 403);
    expect(`${r1.message} ${r2.message}`).not.toMatch(/domain administrator/);
  });
  it('positive: the re-declared port answers every other path as before — the twin owner\'s acknowledged run opens and completes OUTSIDE, an inside run needs no acknowledgement', async () => {
    const r = (await run(owner, { twinVersion: V75, envelope: ACK })).run;
    expect(r.state).toBe('completed');
    expect(r).toMatchObject({ envelopeAck: expect.objectContaining({ acknowledged_by: owner.principalId }) });
    expect((await run(owner, { twinVersion: w.v1 })).run.state).toBe('completed');
    const src = String((await one(sql`select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'simulation' and p.proname = 'open_run'`))['prosrc']);
    expect(src).not.toMatch(/'run rejected \(envelope[^']*domain administrator/);   // no refusal TEXT names it (the B33 comment beside it says why)
    expect(src).toContain("needs a twin owner''s acknowledgement");
  });
  it('recovery: the refused operator\'s run opens once a twin owner acknowledges it (the same contract)', async () => {
    const r = (await run(owner, { twinVersion: V75, envelope: { acknowledge: true, reason: 'the twin owner acknowledges the administrator\'s stress case (B33 harness)' } })).run;
    expect(r.state).toBe('completed');
  });
});
