/**
 * CP-6 B30 part `branches` (migration 0103 §BR; F-P5-03 complete) — THE BRANCH-AWARE TWIN STATE STORE, on a real database through the real
 * routes, ports, triggers and the attention tick, with named humans holding sessions of their own (the ports compare the acting principal and
 * the twin's own owner). The world is bootDecisionWorld's (its uploaded records, its strait entity, its corridor scenario and downside branch);
 * the corridor twin here is the harness's own, owned by a human with a session. Every figure is SYNTHETIC (NORDWERK's data is the
 * demonstration's); every instant is the DATABASE's (no clock is moved; the one wait is a real wait for a freeze's expiry).
 *
 *   BR1 · THE BRANCH STORE AND CHECKPOINT RESTORE: the corridor twin branched for a blockade (`blockade`, forked from actual's head) with a
 *         SCENARIO element (ADR-0011 V4) citing the scenario branch's linked assumption; a checkpoint restored with its reason. Refused: a peer
 *         twin owner restoring, a checkpoint not earlier than the head, an unknown checkpoint, a non-owner role, a scenario element citing an
 *         unlinked assumption / into an admitted version / through the generic ground route. Recovered: the assumption linked, the element grounds.
 *   BR2 · THE MERGE REQUIRES RECONCILIATION: the diverging keys computed by the server (a key only actual changed is not the branch's); the
 *         completion REFUSED until every key is reconciled; a scenario value never taken into actual; the owner's resolutions; the merge
 *         completed through the existing open/ground/admit — merged in the admission's own transaction. Refused: the PDP, a peer resolving and
 *         completing, an unknown key, a duplicate merge, a draft on actual carrying the branch around its merge. Recovered: a stale merge
 *         withdrawn and re-opened, a value reconciled with evidence, an open draft on actual withdrawn, the merge completed.
 *   BR3 · STALENESS BY AGE AND BY DEPENDENCY: the owner's freshness SLO; the head 5 days stale (age by the database's day); per-element
 *         staleness by a key's max age; the tick step `twin-freshness` raises twin.freshness once; an upstream twin stale against its own
 *         policy makes the dependency UNCERTAIN. Refused: a peer setting the policy, a malformed policy, an unknown twin, a reader's role, an
 *         unknown version. Recovered: fresh versions — fresh, certain, nothing raised again.
 *   BR4 · THE FROZEN VALIDATED SNAPSHOT (FEX-14): nothing validated → refused; the last FIT version frozen as the served state with its warning
 *         and expiry; a run on it before the expiry opens; after the expiry a run on it is REFUSED and the tick raises freeze.expired. Refused:
 *         a peer freezing, a past expiry, a second freeze, a version that is not the last validated. Recovered: the freeze lifted, the run opens.
 *   BR5 · COMPONENT-LEVEL CONFIDENCE: per component and per kind, the weakest link and the mean of the STATED confidences, coverage, nothing
 *         imputed. Refused: a role that reads no twin, an unknown version. Recovered: a stated confidence raises the coverage.
 *   BR6 · THE ONTOLOGY/POLICY REVISION ON COMMITS (V03-T-196) AND THE SCENARIO BASIS IN THE DATABASE: the TWN header's ontology_ref and
 *         freshness_state (schema_ref stays TWN@v1). Refused: a scenario element with no assumption, whatever the path (tbr_scenario_basis).
 *         Recovered: the same element citing its assumption is admitted by the rule.
 *   BR7 · THE EXPLORER WITH TIME TRAVEL: the branch tree, the merges, the freezes, the policy, the served state, the head's freshness and
 *         confidence, the ledger; the existing as-of route; the diff against actual. Refused: a role that reads no twin, an unknown twin.
 *         Recovered: an analyst reads it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { BranchesController } from '../../src/twin/branches/branches.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { AnatomyController } from '../../src/prediction/scenarios/anatomy/anatomy.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { completeElements, cite } from './phase5-fixtures.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b30br-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let twins: TwinController; let br: BranchesController; let comp: CompositionController; let anat: AnatomyController; let exec: ExecutiveController;
let scheduler: SchedulerService; let timer: AttentionTimerService; let agentId = '';
/** The corridor twin's owner, a peer twin owner (the validator, the non-owner probe), the upstream twin's owner, a strategist (links the
 *  scenario's assumptions), an analyst (reads), an outsider (reads no twin), the simulation operator, the attention hosts. */
let owner: AuthenticatedPrincipal; let peer: AuthenticatedPrincipal; let upOwner: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal;
/** The corridor twin, the upstream twin, the blockade assumption (ASU), and the versions as the suite makes them. */
let C = ''; let U = ''; let ASU_BLOCK = '';
let V1 = 0; let B4a = 0; let B1 = 0; let B2 = 0; let B3 = 0; let B4 = 0; let A2 = 0; let A3 = 0; let A5 = 0; let A6 = 0; let A7 = 0;
let M1 = ''; let M3 = ''; let F1 = '';

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rows = async (x: ReturnType<typeof sql>) => (await x.execute(su)).rows as Row[];
const one = async (x: ReturnType<typeof sql>) => (await rows(x))[0] as Row;
const dbNow = async (): Promise<string> => String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))['t']);
const dbDay = async (minus = 0): Promise<string> => String((await one(sql`select to_char((clock_timestamp() at time zone 'UTC')::date - ${minus}::int, 'YYYY-MM-DD') as d`))['d']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const raw = e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? '') : (e instanceof Error ? e.message : String(e));
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: raw };
  return { status: mapped.getStatus(), message: raw };
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
  ((await twins.openVersion(R(as, 'twin.version', twinId), T(), D(), twinId, { payload: { knownAt: await dbNow(), ...p } })) as { version: { version: number } }).version.version;
const openRaw = async (as: AuthenticatedPrincipal, twinId: string, p: Row) => twins.openVersion(R(as, 'twin.version', twinId), T(), D(), twinId, { payload: { knownAt: await dbNow(), ...p } });
const ground = (as: AuthenticatedPrincipal, twinId: string, v: number, elements: unknown[]) => twins.ground(R(as, 'twin.ground', twinId), T(), D(), twinId, String(v), { payload: { elements } });
const admit = (as: AuthenticatedPrincipal, twinId: string, v: number, allowIncomplete = false) =>
  twins.admit(R(as, 'twin.version.admit', twinId), T(), D(), twinId, String(v), { payload: { allowIncomplete } }) as Promise<{ admitted: Row }>;
const withdraw = (as: AuthenticatedPrincipal, twinId: string, v: number, reason: string) => twins.withdraw(R(as, 'twin.version.withdraw', twinId), T(), D(), twinId, String(v), { payload: { reason } });
const assumed = (key: string, value: number, unit: string, confidence: number | null = null) => ({ key, kind: 'assumed', value, unit, citations: [cite(w.records.terms)], ...(confidence === null ? {} : { confidence }) });
const scenario = (as: AuthenticatedPrincipal, twinId: string, v: number, elements: Row[]) =>
  br.scenario(R(as, 'twin.ground', twinId), T(), D(), twinId, String(v), { payload: { elements } }) as Promise<{ grounded: Row[] }>;
const explorer = (as: AuthenticatedPrincipal, twinId: string = C) => br.explorer(R(as, 'twin.read', twinId), T(), D(), twinId) as Promise<{ explorer: Row & { branches: Row[]; merges: Row[]; freezes: Row[]; events: Row[] } }>;
const freshness = (as: AuthenticatedPrincipal, twinId: string, v: number) => br.freshness(R(as, 'twin.read', twinId), T(), D(), twinId, String(v)) as Promise<{ freshness: Row }>;
const confidence = (as: AuthenticatedPrincipal, twinId: string, v: number) => br.confidence(R(as, 'twin.read', twinId), T(), D(), twinId, String(v)) as Promise<{ confidence: Row }>;
const served = (as: AuthenticatedPrincipal, twinId: string = C, asOf?: string) => br.served(R(as, 'twin.read', twinId), T(), D(), twinId, { payload: asOf === undefined ? {} : { asOf } }) as Promise<{ served: Row }>;
const policy = (as: AuthenticatedPrincipal, twinId: string, payload: Row) => br.policy(R(as, 'twin.freshness.policy', twinId), T(), D(), twinId, { payload }) as Promise<{ policy: Row }>;
const openMerge = (as: AuthenticatedPrincipal, payload: Row, twinId: string = C) => br.openMerge(R(as, 'twin.branch.merge', twinId), T(), D(), twinId, { payload } as never) as Promise<{ merge: Row }>;
const resolve = (as: AuthenticatedPrincipal, mergeId: string, payload: Row) => br.resolve(R(as, 'twin.branch.reconcile'), T(), D(), mergeId, { payload }) as Promise<{ merge: Row }>;
const complete = (as: AuthenticatedPrincipal, mergeId: string) => br.complete(R(as, 'twin.branch.merge'), T(), D(), mergeId, { payload: {} }) as Promise<{ merge: Row; admitted: Row; receipts: Row[] }>;
const closeMerge = (as: AuthenticatedPrincipal, mergeId: string, outcome: string, reason: string) => br.close(R(as, 'twin.branch.merge'), T(), D(), mergeId, { payload: { outcome, reason } }) as Promise<{ merge: Row }>;
const readMerge = (as: AuthenticatedPrincipal, mergeId: string) => br.readMerge(R(as, 'twin.read'), T(), D(), mergeId) as Promise<{ merge: Row }>;
const restore = (as: AuthenticatedPrincipal, payload: Row, twinId: string = C) => br.restore(R(as, 'twin.version', twinId), T(), D(), twinId, { payload } as never) as Promise<{ restore: Row; receipts: Row[] }>;
const freeze = (as: AuthenticatedPrincipal, payload: Row, twinId: string = C) => br.freeze(R(as, 'twin.snapshot.freeze', twinId), T(), D(), twinId, { payload }) as Promise<{ freeze: Row }>;
const lift = (as: AuthenticatedPrincipal, freezeId: string, reason: string) => br.lift(R(as, 'twin.snapshot.freeze'), T(), D(), freezeId, { payload: { reason } }) as Promise<{ freeze: Row }>;
const run = (twinId: string, twinVersion: number) => twins.run(h.req(operator, 'simulation.run', 'SIM', null, 'twin'), T(), D(), { payload: {
  twinId, twinVersion, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } } }) as Promise<{ run: Row & { runId: string; state: string } }>;
const elementMap = async (twinId: string, v: number): Promise<Record<string, Row>> =>
  Object.fromEntries((await rows(sql`select key, kind, value, unit, confidence, citations from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v}::int order by key`)).map((r) => [String(r['key']), r]));
const ledger = async (subject: string) => (await rows(sql`select event from twin.branch_events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));
const items = async (cls: string, subject: string) => rows(sql`select signal_class, subject_kind, owner_principal_id::text as owner, state, title, details from executive.attention_items
                                                               where tenant_id = ${T()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);
const drafts = async (twinId: string, branch: string) => Number((await one(sql`select count(*)::int n from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = ${branch} and state = 'draft'`))['n']);
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2038, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = (t.run?.outputs ?? {}) as Row;
  return ((outputs['steps'] ?? outputs) as Row)['twin-freshness'] as Row;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as unknown as AnyDb;
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { BranchesController: Bc } = await import('../../src/twin/branches/branches.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { AnatomyController: Ac } = await import('../../src/prediction/scenarios/anatomy/anatomy.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  twins = h.app.get(Tc); br = h.app.get(Bc); comp = h.app.get(Cc); anat = h.app.get(Ac); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  owner = await h.humanWithSession(['twin_owner'], 'b30br-owner');
  peer = await h.humanWithSession(['twin_owner'], 'b30br-peer');
  upOwner = await h.humanWithSession(['twin_owner'], 'b30br-upstream');
  strategist = await h.humanWithSession(['strategy_owner'], 'b30br-strategist');
  analyst = await h.humanWithSession(['domain_analyst'], 'b30br-analyst');
  outsider = await h.humanWithSession(['decision_approver'], 'b30br-outsider');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b30br-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b30br-dadmin');
  reviewer = await h.humanWithSession(['executive'], 'b30br-reviewer');
  operator = await h.principalWith(['simulation_operator'], 'b30br-operator');
  w = await bootDecisionWorld(h);
  // THE CORRIDOR TWIN (the harness's own, owned by a human with a session): v1 on actual, the 16 elements the demonstration grounds
  const d = await twins.declare(R(owner, 'twin.declare'), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain (B30 branches harness, SYNTHETIC)',
    statement: 'the magnet chain the Regensburg line depends on', boundary: [w.entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  C = d.twin.twinId;
  V1 = await open(owner, C, { branchId: 'actual', observedThrough: '2024-01-17' });
  await ground(owner, C, V1, completeElements(w.records));
  await admit(owner, C, V1);
  // THE BLOCKADE ASSUMPTION (an ASU of the Knowledge Graph) linked to the corridor scenario's downside branch — through the real routes
  const asu = await w.graph.declare(h.req(strategist, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'The corridor is blockaded for 45 days (SYNTHETIC)',
    statement: 'no transit through Bab el-Mandeb for 45 days', restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about this strait' }] } }) as { strategy: { objectId: string } };
  ASU_BLOCK = asu.strategy.objectId;
  await anat.link(h.req(strategist, 'prediction.scenario.anatomy.assumption', 'SCN', w.scenarioId, 'prediction'), T(), D(), w.scenarioId,
    { payload: { assumptionId: ASU_BLOCK, branchId: w.branchId, critical: false, rationale: 'the blockade branch rests on a 45-day closure (SYNTHETIC)' } } as never);
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('BR1 · the branch-aware store: a blockade branch with a SCENARIO element; checkpoint restore', () => {
  it('positive: the corridor twin branched for a blockade (forked from actual), a scenario element citing the branch\'s linked assumption, a checkpoint restored with its reason', async () => {
    B1 = await open(owner, C, { branchId: 'blockade', forkedFromVersion: V1, carryFrom: V1, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days', 'route.reroute_delay_days'] });
    await ground(owner, C, B1, [assumed('route.reroute_delay_days', 21, 'days', 0.6)]);
    const g = await scenario(owner, C, B1, [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: ASU_BLOCK }, confidence: 0.4 }]);
    expect(g.grounded).toEqual([expect.objectContaining({ key: 'shock.corridor_delay_days', kind: 'scenario', scenario_branch_id: w.branchId, assumption: expect.objectContaining({ kind: 'assumption', id: ASU_BLOCK }) })]);
    await admit(owner, C, B1);
    const e1 = await elementMap(C, B1);
    expect(e1['shock.corridor_delay_days']).toMatchObject({ kind: 'scenario', value: 45 });
    expect(e1['route.reroute_delay_days']).toMatchObject({ kind: 'assumed', value: 21 });
    expect(Object.keys(e1)).toHaveLength(16);
    // a later blockade version, then the checkpoint restored: back to B1's state, with its reason
    B2 = await open(owner, C, { branchId: 'blockade', carryFrom: B1, observedThrough: '2024-01-17', except: ['route.reroute_delay_days'] });
    await ground(owner, C, B2, [assumed('route.reroute_delay_days', 24, 'days', 0.6)]);
    await admit(owner, C, B2);
    const rs = await restore(owner, { branchId: 'blockade', fromVersion: B1, reason: 'the 24-day reroute estimate was withdrawn by the forwarder (SYNTHETIC)' });
    B3 = Number(rs.restore['draft_version']);
    expect(rs.restore).toMatchObject({ branch_id: 'blockade', from_version: B1, head_version: B2, from_branch: 'blockade' });
    expect(rs.receipts.map((x) => x['step'])).toEqual(['draft', 'restore']);
    await admit(owner, C, B3);
    const e3 = await elementMap(C, B3);
    expect(Object.fromEntries(Object.entries(e3).map(([k, v]) => [k, [v['kind'], v['value']]]))).toEqual(Object.fromEntries(Object.entries(e1).map(([k, v]) => [k, [v['kind'], v['value']]])));
    const ev = await rows(sql`select details from twin.branch_events where twin_id = ${C}::uuid and event = 'checkpoint.restored'`);
    expect(ev).toHaveLength(1);
    expect(ev[0]!['details']).toMatchObject({ branch_id: 'blockade', from_version: B1, draft_version: B3, reason: expect.stringMatching(/withdrawn by the forwarder/) });
    const x = await explorer(owner);
    expect(x.explorer.branches.map((b) => [b['branch_id'], b['forked_from'], b['head']])).toEqual([['actual', null, V1], ['blockade', V1, B3]]);
  });

  it('refusal: a peer twin owner restoring, a checkpoint not earlier than the head, an unknown checkpoint, a reader\'s role; a scenario element on an unlinked assumption, into an admitted version, through the generic route — nothing written', async () => {
    await refused(restore(peer, { branchId: 'blockade', fromVersion: B1, reason: 'a peer restoring another owner\'s twin' }), /^checkpoint restore rejected \(ownership\)/, 403);
    await refused(restore(owner, { branchId: 'blockade', fromVersion: B3, reason: 'the head is no earlier checkpoint' }), /^checkpoint restore rejected \(checkpoint\): v\d+ is not earlier than the head/, 422);
    await refused(restore(owner, { branchId: 'blockade', fromVersion: 999, reason: 'a version that does not exist' }), /^checkpoint restore rejected \(unknown_checkpoint\)/, 404);
    expect((await refusal(restore(analyst, { branchId: 'blockade', fromVersion: B1, reason: 'an analyst holds no twin.version' }))).status).toBe(403);
    expect(await drafts(C, 'blockade')).toBe(0);
    const d = await open(owner, C, { branchId: 'blockade', carryFrom: B3, observedThrough: '2024-01-17', except: ['shock.corridor_delay_days'] });
    await refused(scenario(owner, C, d, [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: w.assumptionId } }]),
      /^scenario element rejected \(basis\): assumption .* is not linked to scenario/, 422);
    await refused(scenario(owner, C, B3, [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: ASU_BLOCK } }]),
      /^scenario element rejected \(state\)/, 409);
    const generic = await refusal(ground(owner, C, d, [{ key: 'shock.corridor_delay_days', kind: 'scenario', value: 45, unit: 'days', citations: [{ kind: 'assumption', id: ASU_BLOCK }] }]));
    expect(generic).toMatchObject({ status: 422, message: expect.stringMatching(/kind must be one of observed, estimated, assumed, predicted, simulated/) });
    expect(Object.keys(await elementMap(C, d))).not.toContain('shock.corridor_delay_days');
    B4 = d;
  });

  it('recovery: the strategist links the corridor assumption to the blockade branch; the scenario element grounds and the draft is admitted', async () => {
    await anat.link(h.req(strategist, 'prediction.scenario.anatomy.assumption', 'SCN', w.scenarioId, 'prediction'), T(), D(), w.scenarioId,
      { payload: { assumptionId: w.assumptionId, branchId: w.branchId, critical: false, rationale: 'the blockade branch also rests on the corridor assumption (SYNTHETIC)' } } as never);
    const g = await scenario(owner, C, B4, [{ key: 'shock.corridor_delay_days', value: 45, unit: 'days', scenarioId: w.scenarioId, scenarioBranchId: w.branchId, assumption: { id: w.assumptionId }, confidence: 0.4 }]);
    expect(g.grounded[0]).toMatchObject({ kind: 'scenario', key: 'shock.corridor_delay_days' });
    await admit(owner, C, B4);
    B4a = B4;
    expect((await elementMap(C, B4))['shock.corridor_delay_days']).toMatchObject({ kind: 'scenario', value: 45 });
  });
});

describe('BR2 · merging the blockade back is refused until reconciliation', () => {
  it('positive: the server\'s diverging keys; the completion refused until every key is reconciled; the owner\'s resolutions; merged through the existing open/ground/admit', async () => {
    // actual moves on a key the branch never touched (not the branch's to merge)
    A2 = await open(owner, C, { branchId: 'actual', carryFrom: V1, observedThrough: '2024-01-17', except: ['terms.air_cost_per_kg'] });
    await ground(owner, C, A2, [assumed('terms.air_cost_per_kg', 22, 'EUR')]);
    await admit(owner, C, A2);
    // a twin owner (the peer) asks to merge the blockade back
    const m = await openMerge(peer, { sourceBranch: 'blockade', reason: 'take the blockade planning assumptions into actual (SYNTHETIC)' });
    M1 = String(m.merge['merge_id']);
    expect(m.merge).toMatchObject({ state: 'open', source_branch: 'blockade', source_version: B4, target_version: A2, base_version: V1, opened_by: peer.principalId });
    expect((m.merge['diverging'] as Row[]).map((k) => [k['key'], k['change'], k['conflict']])).toEqual([['route.reroute_delay_days', 'changed', false], ['shock.corridor_delay_days', 'changed', false]]);
    expect(m.merge['unresolved']).toEqual(['route.reroute_delay_days', 'shock.corridor_delay_days']);
    const it1 = await items('twin.reconciliation', M1);
    expect(it1).toEqual([expect.objectContaining({ subject_kind: 'twin_branch', owner: owner.principalId, state: 'open', title: expect.stringMatching(/Merge of branch blockade into actual awaits reconciliation of 2 diverging key/) })]);
    // MERGING THE BRANCH BACK IS REFUSED UNTIL RECONCILIATION
    await refused(complete(owner, M1), /^branch merge rejected \(unreconciled\): merging branch blockade back into actual is refused until reconciliation — 2 of 2 diverging key\(s\) unresolved: route.reroute_delay_days, shock.corridor_delay_days/, 409);
    // a scenario value never becomes actual state
    await refused(resolve(owner, M1, { key: 'shock.corridor_delay_days', resolution: 'take_branch', note: 'take the blockade shock' }), /^branch merge rejected \(scenario\)/, 422);
    await resolve(owner, M1, { key: 'shock.corridor_delay_days', resolution: 'keep_target', note: 'the blockade is a scenario, not the actual corridor' });
    await refused(complete(owner, M1), /refused until reconciliation — 1 of 2 diverging key\(s\) unresolved: route.reroute_delay_days$/, 409);
    const r2 = await resolve(owner, M1, { key: 'route.reroute_delay_days', resolution: 'take_branch', note: 'the forwarder confirmed the 21-day reroute (SYNTHETIC)' });
    expect(r2.merge).toMatchObject({ state: 'reconciled', unresolved: [] });
    // completed: four governed writes; merged in the admission's transaction
    const c = await complete(owner, M1);
    expect(c.receipts.map((x) => x['step'])).toEqual(['plan', 'draft', 'ground', 'admit']);
    A3 = Number(c.merge['merged_version']);
    expect(c.merge).toMatchObject({ state: 'merged', completing_by: owner.principalId });
    expect(c.admitted).toMatchObject({ branchId: 'actual', supersedes: A2, completeness: 'complete' });
    const e = await elementMap(C, A3);
    expect([e['route.reroute_delay_days']?.['kind'], e['route.reroute_delay_days']?.['value']]).toEqual(['assumed', 21]);
    expect([e['shock.corridor_delay_days']?.['kind'], e['shock.corridor_delay_days']?.['value']]).toEqual(['assumed', 14]);
    expect(e['terms.air_cost_per_kg']?.['value']).toBe(22);
    expect(Object.keys(e)).toHaveLength(16);
    expect(await ledger(M1)).toEqual(['merge.opened', 'merge.key_resolved', 'merge.key_resolved', 'merge.reconciled', 'merge.completing', 'merge.merged']);
    // the twin's own ledger carries only its existing vocabulary on the merge's version
    const te = (await rows(sql`select event from twin.twin_events where twin_id = ${C}::uuid and (details ->> 'version')::int = ${A3}::int order by occurred_at`)).map((r) => r['event']);
    expect([...new Set(te)].sort()).toEqual(['element.grounded', 'version.admitted', 'version.opened']);
  });

  it('refusal: the PDP (an operator), a peer resolving and completing, an unknown key, a duplicate merge, a draft on actual carrying the branch around its merge', async () => {
    // the blockade moves again (a new route figure), so a second merge has something to merge
    const b = await open(owner, C, { branchId: 'blockade', carryFrom: B4, observedThrough: '2024-01-17', except: ['route.reroute_delay_days'] });
    await ground(owner, C, b, [assumed('route.reroute_delay_days', 26, 'days', 0.6)]);
    await admit(owner, C, b);
    B4 = b;
    expect((await refusal(openMerge(operator, { sourceBranch: 'blockade', reason: 'an operator holds no merge' }))).status).toBe(403);
    const m = await openMerge(owner, { sourceBranch: 'blockade', reason: 'the reroute figure moved again (SYNTHETIC)' });
    const M2 = String(m.merge['merge_id']);
    await refused(openMerge(peer, { sourceBranch: 'blockade', reason: 'a second merge of the same branch' }), /^branch merge rejected \(duplicate\)/, 409);
    await refused(resolve(peer, M2, { key: 'route.reroute_delay_days', resolution: 'take_branch', note: 'a peer resolving another owner\'s merge' }), /^branch merge rejected \(ownership\)/, 403);
    await refused(resolve(owner, M2, { key: 'inventory.on_hand:SYN-PART-MAG', resolution: 'keep_target', note: 'not a diverging key of this merge' }), /^branch merge rejected \(unknown_key\)/, 404);
    await refused(resolve(owner, M2, { key: 'route.reroute_delay_days', resolution: 'reconciled', kind: 'assumed', value: 20, note: 'no citation given' }), /^branch merge rejected \(citations\)/, 422);
    await refused(complete(peer, M2), /^branch merge rejected \(ownership\)/, 403);
    // around the merge: a draft on actual carrying the branch's head is refused while its merge is in progress
    await refused(openRaw(owner, C, { branchId: 'actual', carryFrom: B4, observedThrough: '2024-01-17' }), /^branch merge rejected \(unreconciled\): branch blockade has merge .* in progress/, 409);
    expect(await drafts(C, 'actual')).toBe(0);
    expect((await readMerge(owner, M2)).merge).toMatchObject({ state: 'open', unresolved: ['route.reroute_delay_days', 'shock.corridor_delay_days'] });
    // left open for the recovery (a stale merge)
    M3 = M2;
  });

  it('recovery: a stale merge withdrawn and re-opened; a value reconciled with evidence; an open draft on actual withdrawn; the merge completed', async () => {
    // actual moves while M2 is open → its completion is stale
    const a = await open(owner, C, { branchId: 'actual', carryFrom: A3, observedThrough: '2024-01-17', except: ['terms.air_lead_days'] });
    await ground(owner, C, a, [assumed('terms.air_lead_days', 9, 'days')]);
    await admit(owner, C, a);
    await resolve(owner, M3, { key: 'route.reroute_delay_days', resolution: 'take_branch', note: 'take the 26-day reroute (SYNTHETIC)' });
    await resolve(owner, M3, { key: 'shock.corridor_delay_days', resolution: 'keep_target', note: 'the blockade stays a scenario' });
    await refused(complete(owner, M3), /^branch merge rejected \(stale\): the heads moved since merge/, 409);
    expect((await closeMerge(owner, M3, 'withdrawn', 'actual moved on; re-open against the new head')).merge).toMatchObject({ state: 'withdrawn' });
    const m = await openMerge(owner, { sourceBranch: 'blockade', reason: 'the reroute figure against the current actual (SYNTHETIC)' });
    const M4 = String(m.merge['merge_id']);
    expect((m.merge['diverging'] as Row[]).map((k) => k['key'])).toEqual(['route.reroute_delay_days', 'shock.corridor_delay_days']);
    await resolve(owner, M4, { key: 'route.reroute_delay_days', resolution: 'reconciled', kind: 'assumed', value: 23, unit: 'days',
      citations: [{ kind: 'evidence', id: w.records.terms.id, version: w.records.terms.version }], note: 'between the forwarder\'s 21 and 26 days, per the terms (SYNTHETIC)' });
    await resolve(owner, M4, { key: 'shock.corridor_delay_days', resolution: 'keep_target', note: 'the blockade stays a scenario' });
    // an open draft on actual holds the completion until it is admitted or withdrawn
    const stray = await open(owner, C, { branchId: 'actual', carryFrom: a, observedThrough: '2024-01-17' });
    await refused(complete(owner, M4), /^branch merge rejected \(state\): actual has an open draft/, 409);
    await withdraw(owner, C, stray, 'a stray draft held the merge');
    const c = await complete(owner, M4);
    expect(c.merge).toMatchObject({ state: 'merged' });
    A3 = Number(c.merge['merged_version']);
    const e = await elementMap(C, A3);
    expect([e['route.reroute_delay_days']?.['kind'], e['route.reroute_delay_days']?.['value']]).toEqual(['assumed', 23]);
    expect(e['terms.air_lead_days']?.['value']).toBe(9);
    expect((e['route.reroute_delay_days']?.['citations'] as Row[])[0]).toMatchObject({ kind: 'evidence', id: w.records.terms.id });
    const merges = await rows(sql`select state from twin.branch_merges where twin_id = ${C}::uuid order by opened_at`);
    expect(merges.map((r) => r['state'])).toEqual(['merged', 'withdrawn', 'merged']);
  });
});

describe('BR3 · staleness by age and by dependency uncertainty', () => {
  it('positive: the SLO; the head 5 days stale; a key past its max age; the tick raises twin.freshness once; an upstream twin stale against its own policy makes the dependency uncertain', async () => {
    const p = await policy(owner, C, { maxAgeDays: 2, keyMaxAge: { shock: 1 }, nearExpiryHours: 48, note: 'the corridor state is refreshed every two days (SYNTHETIC)' });
    expect(p.policy).toMatchObject({ version: 1, max_age_days: 2, key_max_age: { shock: 1 }, near_expiry_hours: 48, set_by: owner.principalId });
    A5 = await open(owner, C, { branchId: 'actual', carryFrom: A3, observedThrough: await dbDay(5) });
    await admit(owner, C, A5);
    const f = (await freshness(analyst, C, A5)).freshness;
    expect(f).toMatchObject({ version: A5, basis: 'observed_through', age_days: 5, state: 'stale', stale_by_days: 3, policy: { version: 1, max_age_days: 2 }, stale_elements: 1 });
    const els = f['elements'] as Row[];
    expect(els.find((e) => e['key'] === 'shock.corridor_delay_days')).toMatchObject({ state: 'stale', max_age_days: 1, age_days: 5 });
    expect(els.find((e) => e['key'] === 'inventory.on_hand:SYN-PART-MAG')).toMatchObject({ state: 'unbounded' });
    // the commit recorded the freshness it was admitted with (V03-T-196)
    const hdr = await one(sql`select freshness_state, ontology_ref, schema_ref from objects.canonical_objects where object_id = ${C}::uuid and object_version = ${A5}::int`);
    expect(hdr).toMatchObject({ schema_ref: 'TWN@v1', ontology_ref: null, freshness_state: { state: 'stale', age_days: 5, revisions: { freshness_policy: { version: 1, max_age_days: 2 }, ontology: null } } });
    // the tick step twin-freshness: once per (head, policy)
    const t1 = await tick(1);
    expect(t1).toMatchObject({ breaches: 1 });
    const fi = await items('twin.freshness', C);
    expect(fi).toEqual([expect.objectContaining({ subject_kind: 'twin', owner: owner.principalId, state: 'open', title: expect.stringMatching(new RegExp(`v${A5} is 5 days stale \\(freshness SLO 2 days\\)`)) })]);
    expect((await tick(2))).toMatchObject({ breaches: 0 });
    expect(await items('twin.freshness', C)).toHaveLength(1);
    // DEPENDENCY: an upstream twin linked into the corridor twin, stale against its own policy
    const ud = await twins.declare(R(upOwner, 'twin.declare'), T(), D(), { payload: { kind: 'supply-chain', title: 'Ningbo port throughput (B30 branches harness, SYNTHETIC)', statement: 'the port feeding the corridor',
      boundary: [w.entityId], owner: upOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    U = ud.twin.twinId;
    const u1 = await open(upOwner, U, { branchId: 'actual', observedThrough: await dbDay(3) });
    await ground(upOwner, U, u1, [assumed('supply.capacity_per_day', 1000, 'units/day')]);
    await admit(upOwner, U, u1, true);
    await comp.publishContract(R(upOwner, 'twin.contract.publish', U), T(), D(), U, { payload: { exposed: { 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } },
      approvedUses: { methodFamilies: ['flow'], decisionClasses: ['capacity-planning'] } } });
    await comp.declareLink(R(owner, 'twin.link.declare', C), T(), D(), { payload: { upstreamTwinId: U, downstreamTwinId: C, mapping: [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }], use: 'capacity-planning' } });
    await policy(upOwner, U, { maxAgeDays: 1, keyMaxAge: {}, note: 'the port figure is refreshed daily (SYNTHETIC)' });
    const fd = (await freshness(owner, C, A5)).freshness;
    expect(fd['dependency']).toMatchObject({ state: 'uncertain', upstream: [expect.objectContaining({ twin_id: U, head_version: u1, freshness: 'stale', age_days: 3, verification_state: 'verified', behind: false })] });
  });

  it('refusal: a peer setting the owner\'s policy, a malformed policy, an unknown twin, a reader\'s role, an unknown version', async () => {
    await refused(policy(peer, C, { maxAgeDays: 30, note: 'a peer loosening another owner\'s SLO' }), /^freshness policy rejected \(ownership\)/, 403);
    await refused(policy(owner, C, { maxAgeDays: -1, note: 'a negative age' }), /^freshness policy rejected \(max_age\)/, 422);
    await refused(policy(owner, C, { maxAgeDays: 2, keyMaxAge: { 'Not A Key': 1 }, note: 'a malformed key prefix' }), /^freshness policy rejected \(key_max_age\)/, 422);
    await refused(policy(owner, uuidv7(), { maxAgeDays: 2, note: 'a twin that does not exist' }), /^freshness policy rejected \(unknown_twin\)/, 404);
    expect((await refusal(policy(analyst, C, { maxAgeDays: 2, note: 'an analyst holds no policy' }))).status).toBe(403);
    expect((await refusal(freshness(owner, C, 999))).status).toBe(404);
    expect(Number((await one(sql`select count(*)::int n from twin.freshness_policies where twin_id = ${C}::uuid`))['n'])).toBe(1);
  });

  it('recovery: a fresh head (observed today) is fresh; the upstream refreshed makes the dependency certain; the tick raises nothing again', async () => {
    A6 = await open(owner, C, { branchId: 'actual', carryFrom: A5, observedThrough: await dbDay(0) });
    await admit(owner, C, A6);
    expect((await freshness(owner, C, A6)).freshness).toMatchObject({ age_days: 0, state: 'fresh', stale_by_days: 0 });
    const u2 = await open(upOwner, U, { branchId: 'actual', carryFrom: null, observedThrough: await dbDay(0) });
    await ground(upOwner, U, u2, [assumed('supply.capacity_per_day', 1000, 'units/day')]);
    await admit(upOwner, U, u2, true);
    expect(((await freshness(owner, C, A6)).freshness['dependency'] as Row)['state']).toBe('certain');
    expect(await tick(3)).toMatchObject({ breaches: 0 });
    expect(await items('twin.freshness', C)).toHaveLength(1);
  });
});

describe('BR4 · the last validated snapshot frozen, with its warning and its expiry (FEX-14)', () => {
  it('refusal: nothing validated; then (validated) a peer freezing, a past expiry, a version that is not the last validated, a second freeze', async () => {
    await refused(freeze(owner, { warning: 'serve the validated snapshot', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      /^snapshot rejected \(state\): branch actual has no admitted version validated fit/, 409);
    await twins.validate(R(peer, 'twin.version.validate', C), T(), D(), C, String(A6), { payload: { verdict: 'fit', reason: 'a peer validation of the corridor state (SYNTHETIC)', limitations: ['synthetic'] } });
    A7 = await open(owner, C, { branchId: 'actual', carryFrom: A6, observedThrough: await dbDay(0) });
    await admit(owner, C, A7);
    await refused(freeze(peer, { warning: 'a peer freezing another owner\'s twin', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }), /^snapshot rejected \(ownership\)/, 403);
    await refused(freeze(owner, { warning: 'an expiry in the past', expiresAt: '2020-01-01T00:00:00Z' }), /^snapshot rejected \(expiry\)/, 422);
    await refused(freeze(owner, { version: A7, warning: 'the unvalidated head', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }), /^snapshot rejected \(state\): v\d+ is not the last validated snapshot/, 409);
    expect(Number((await one(sql`select count(*)::int n from twin.snapshot_freezes where twin_id = ${C}::uuid`))['n'])).toBe(0);
  });

  it('positive: the last FIT version frozen as the served state; a run on it before the expiry opens; after the expiry the run is refused and the tick raises freeze.expired', async () => {
    const until = String((await one(sql`select to_char((clock_timestamp() + interval '8 seconds') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))['t']);
    const f = await freeze(owner, { warning: `Serving the validated snapshot: the head is not validated (SYNTHETIC)`, expiresAt: until });
    F1 = String(f.freeze['freeze_id']);
    expect(f.freeze).toMatchObject({ version: A6, branch_id: 'actual', frozen_by: owner.principalId });
    await refused(freeze(owner, { warning: 'a second freeze', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }), /^snapshot rejected \(duplicate\)/, 409);
    const s = (await served(analyst)).served;
    expect(s).toMatchObject({ mode: 'frozen', version: A6, head_version: A7, expired: false, runs_allowed: true, warning: expect.stringMatching(/head is not validated/) });
    const ok = await run(C, A6);
    expect(ok.run['state']).toBe('completed');
    // wait (a real wait — no clock moved) until the database's instant passes the expiry
    for (let i = 0; i < 40 && (await one(sql`select clock_timestamp() > ${until}::timestamptz as past`))['past'] !== true; i += 1) await sleep(500);
    await refused(run(C, A6), /^snapshot rejected \(stale\): v\d+ is the frozen snapshot of freeze .* which expired at/, 409);
    expect((await served(analyst)).served).toMatchObject({ mode: 'frozen', expired: true, runs_allowed: false });
    const t = await tick(4);
    expect(t).toMatchObject({ freezes: 1 });
    expect((await items('twin.freshness', C)).map((x) => (x['details'] as Row)['freeze_id'])).toContain(F1);
    expect(await ledger(F1)).toEqual(['snapshot.frozen', 'freeze.expired']);
  });

  it('recovery: the owner lifts the freeze with a reason; the head is served; a run on the formerly frozen version opens again', async () => {
    const l = await lift(owner, F1, 'the head is validated next; the frozen snapshot is no longer served');
    expect(l.freeze).toMatchObject({ lifted_by: owner.principalId, lift_reason: expect.stringMatching(/no longer served/) });
    await refused(lift(owner, F1, 'lifted twice'), /^snapshot rejected \(state\): freeze .* was lifted/, 409);
    expect((await served(analyst)).served).toMatchObject({ mode: 'head', version: A7 });
    expect((await run(C, A6)).run['state']).toBe('completed');
    expect(await ledger(F1)).toEqual(['snapshot.frozen', 'freeze.expired', 'snapshot.lifted']);
  });
});

describe('BR5 · component-level confidence aggregation', () => {
  it('positive: per component and per kind, the weakest link and the mean of the stated confidences, the coverage; nothing imputed', async () => {
    const r = (await confidence(analyst, C, B4)).confidence;
    expect(r['overall']).toMatchObject({ elements: 16, stated: 2, weakest: 0.4, mean: 0.5, coverage: 0.125, unhealthy: 0 });
    const comps = Object.fromEntries((r['components'] as Row[]).map((c) => [c['component'], c]));
    expect(Object.keys(comps).sort()).toEqual(['consumption', 'inventory', 'production', 'route', 'shipment', 'shock', 'terms']);
    expect(comps['route']).toMatchObject({ elements: 2, stated: 1, weakest: 0.6, mean: 0.6, coverage: 0.5 });
    expect(comps['shock']).toMatchObject({ elements: 1, stated: 1, weakest: 0.4, coverage: 1, kinds: ['scenario'] });
    expect(comps['inventory']).toMatchObject({ elements: 2, stated: 0, weakest: null, coverage: 0 });
    const kinds = Object.fromEntries((r['kinds'] as Row[]).map((c) => [c['kind'], c]));
    expect(kinds['scenario']).toMatchObject({ elements: 1, stated: 1, weakest: 0.4 });
    expect(kinds['observed']).toMatchObject({ elements: 6, stated: 0 });
    expect(String(r['method'])).toMatch(/never imputed/);
  });
  it('refusal: a role that reads no twin; an unknown version', async () => {
    expect((await refusal(confidence(outsider, C, B4))).status).toBe(403);
    expect((await refusal(confidence(analyst, C, 999))).status).toBe(404);
  });
  it('recovery: a stated confidence on a terms element raises the coverage and names the terms component\'s weakest link', async () => {
    const b = await open(owner, C, { branchId: 'blockade', carryFrom: B4, observedThrough: '2024-01-17', except: ['terms.air_lead_days'] });
    await ground(owner, C, b, [assumed('terms.air_lead_days', 7, 'days', 0.9)]);
    await admit(owner, C, b);
    const r = (await confidence(analyst, C, b)).confidence;
    expect(r['overall']).toMatchObject({ stated: 3, coverage: 0.1875, weakest: 0.4 });
    expect((r['components'] as Row[]).find((c) => c['component'] === 'terms')).toMatchObject({ elements: 6, stated: 1, weakest: 0.9 });
    B4 = b;
  });
});

describe('BR6 · the ontology/policy revision on commits; the scenario basis in the database', () => {
  it('positive: with an active ontology version in the domain, an admission records ontology_ref and the policy revisions; schema_ref stays TWN@v1', async () => {
    // FIXTURE: the domain's active ontology version (the ontology's own proposal/decision routes are B9's; the row is what they would leave)
    const ont = uuidv7();
    await sql`insert into graph.ontology_versions (version_id, scope, tenant_id, domain_id, namespace, version, entity_types, predicates, state, compatibility, rationale, proposed_by, decided_by, decided_at, activated_at, correlation_id)
              values (${ont}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'domain', 1, ARRAY['place']::text[], '[]'::jsonb, 'active', 'additive', 'the harness domain ontology (SYNTHETIC)',
                      ${strategist.principalId}::uuid, ${dadmin.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`.execute(su);
    const v = await open(owner, C, { branchId: 'actual', carryFrom: A7, observedThrough: await dbDay(0) });
    await admit(owner, C, v);
    const hdr = await one(sql`select freshness_state, ontology_ref, schema_ref from objects.canonical_objects where object_id = ${C}::uuid and object_version = ${v}::int`);
    expect(hdr).toMatchObject({ schema_ref: 'TWN@v1', ontology_ref: `ONT:${ont}@1`,
      freshness_state: { method: 'freshness@1', state: 'fresh', age_days: 0, dependency: 'certain', revisions: { ontology: { version_id: ont, version: 1 }, freshness_policy: { version: 1 }, decision_use_policy: null } } });
    A7 = v;
  });
  it('refusal: a scenario element with no assumption citation is refused by the database, whatever the path (tbr_scenario_basis)', async () => {
    const d = await open(owner, C, { branchId: 'scratch', forkedFromVersion: A7, observedThrough: await dbDay(0) });
    const e = await sql`insert into twin.state_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, value, unit, material, citations, health, grounded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${C}::uuid, ${d}::int, 'shock.corridor_delay_days', 'scenario', '45'::jsonb, 'days', false,
              ${JSON.stringify([{ kind: 'evidence', id: w.records.terms.id, version: w.records.terms.version, digest: 'a'.repeat(64) }])}::jsonb, 'complete', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su).then(() => null, (x: unknown) => x as Error);
    expect(String(e?.message)).toMatch(/tbr_scenario_basis/);
    await withdraw(owner, C, d, 'the scratch draft of the basis probe');
  });
  it('recovery: the same element citing its assumption satisfies the rule', async () => {
    const d = await open(owner, C, { branchId: 'scratch', observedThrough: await dbDay(0) });
    await sql`insert into twin.state_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, value, unit, material, citations, health, grounded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${C}::uuid, ${d}::int, 'shock.corridor_delay_days', 'scenario', '45'::jsonb, 'days', false,
              ${JSON.stringify([{ kind: 'assumption', id: ASU_BLOCK, version: 1, digest: 'a'.repeat(64) }])}::jsonb, 'complete', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    expect(Number((await one(sql`select count(*)::int n from twin.state_elements where twin_id = ${C}::uuid and version = ${d}::int and kind = 'scenario'`))['n'])).toBe(1);
    await withdraw(owner, C, d, 'the scratch draft of the basis probe');
  });
});

describe('BR7 · the explorer with time travel', () => {
  it('positive: the branch tree, the merges, the freezes, the policy, the served state, the head\'s freshness and confidence, the ledger; the existing as-of route; the diff against actual', async () => {
    const x = (await explorer(owner)).explorer;
    expect((x['branches'] as Row[]).map((b) => b['branch_id'])).toEqual(['actual', 'blockade', 'scratch']);
    expect((x['branches'] as Row[]).find((b) => b['branch_id'] === 'actual')).toMatchObject({ head: A7, forked_from: null, draft: null });
    expect((x['branches'] as Row[]).find((b) => b['branch_id'] === 'scratch')).toMatchObject({ head: null, withdrawn: expect.arrayContaining([expect.any(Number)]) });
    expect((x['merges'] as Row[]).map((m) => m['state'])).toEqual(['merged', 'withdrawn', 'merged']);
    expect((x['merges'] as Row[])[0]).toMatchObject({ unresolved: [], resolutions: expect.arrayContaining([expect.objectContaining({ key: 'route.reroute_delay_days', resolution: 'reconciled' })]) });
    expect((x['freezes'] as Row[])[0]).toMatchObject({ freeze_id: F1, version: A6 });
    expect(x['policy']).toMatchObject({ version: 1, max_age_days: 2 });
    expect(x['served']).toMatchObject({ mode: 'head', version: A7 });
    expect(x['head_freshness']).toMatchObject({ version: A7, state: 'fresh' });
    expect((x['head_confidence'] as Row)['overall']).toMatchObject({ elements: 16 });
    expect(new Set((x['events'] as Row[]).map((e) => e['event']))).toEqual(new Set(['checkpoint.restored', 'merge.opened', 'merge.key_resolved', 'merge.reconciled', 'merge.completing', 'merge.merged',
      'merge.withdrawn', 'freshness.policy_set', 'freshness.breached', 'snapshot.frozen', 'freeze.expired', 'snapshot.lifted']));
    // TIME TRAVEL (the existing as-of route): actual as admitted before the first merge was admitted
    const a2At = String((await one(sql`select to_char(admitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t from twin.twin_versions where twin_id = ${C}::uuid and version = ${A2}::int`))['t']);
    const asOf = await twins.asOf(R(analyst, 'twin.read', C), T(), D(), C, { payload: { branchId: 'actual', instant: a2At } }) as { version: Row | null };
    expect(asOf.version).toMatchObject({ version: A2 });
    const blockadeAsOf = await twins.asOf(R(analyst, 'twin.read', C), T(), D(), C, { payload: { branchId: 'blockade', instant: a2At } }) as { version: Row | null };
    expect(blockadeAsOf.version).toMatchObject({ version: B4a });
    // the diff of the blockade's head against actual's head
    const diff = await br.diff(R(analyst, 'twin.read', C), T(), D(), C, String(B4), { payload: {} }) as { diff: { against: number; keys: Row[] } };
    expect(diff.diff.against).toBe(A7);
    expect(diff.diff.keys.map((k) => k['key'])).toEqual(expect.arrayContaining(['shock.corridor_delay_days']));
    expect(diff.diff.keys.find((k) => k['key'] === 'shock.corridor_delay_days')).toMatchObject({ source: { kind: 'scenario', value: 45 }, target: { kind: 'assumed', value: 14 } });
  });
  it('refusal: a role that reads no twin; an unknown twin', async () => {
    expect((await refusal(explorer(outsider))).status).toBe(403);
    expect((await refusal(explorer(owner, uuidv7()))).status).toBe(404);
  });
  it('recovery: an analyst reads the explorer and the served state as of the freeze', async () => {
    const x = (await explorer(analyst)).explorer;
    expect((x['branches'] as Row[])[0]).toMatchObject({ branch_id: 'actual' });
    const frozenAt = String((await one(sql`select to_char(frozen_at at time zone 'UTC' + interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t from twin.snapshot_freezes where freeze_id = ${F1}::uuid`))['t']);
    expect((await served(analyst, C, frozenAt)).served).toMatchObject({ mode: 'frozen', version: A6, expired: false });
  });
});
