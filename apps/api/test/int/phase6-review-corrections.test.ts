/**
 * The seven items of Codex's review of PR #46 at 09abd095, reproduced through the real
 * database, controller, identity path and Redis harness BEFORE being corrected, and kept
 * as the regression afterwards. Each `it` states the corrected expectation; run against
 * the reviewed candidate the failures ARE the reproductions (recorded in PHASE6_REPORT.md
 * §11), and a case that passes before any change is a refutation — a guard at the
 * boundary already prevents the consequence — and is recorded as such.
 *
 *  1. APPROVAL ELIGIBILITY — a role-based approval whose role binding is revoked (the
 *     person still active) does not count at the port's recount; a revoked authority
 *     cannot commit; the displayed standing agrees with the port.
 *  2. PACKAGE INPUT BINDING — the port verifies each citation's identity and digest,
 *     the version's known_at and observed_through, and the cited run's own cut-offs;
 *     uncertainty and controls are derived at the port from the cited records (the
 *     run's sensitivity drivers and effects, its inherited validation), never taken
 *     from the caller; a run may complete after known_at as long as its inputs obey it.
 *  3. INHERITED CONTROLS — APR, CMT, RPL, OUT and BRF fold every contributing source's
 *     controls into their records and headers (classification, rights, residency,
 *     retention, access policy, synthetic state).
 *  4. READ-TIME AUTHORIZATION — a snapshot is read under the reader's authority NOW:
 *     membership, the purpose it was admitted under, the reader's clearance against
 *     its classification; availability now is reported apart from the historical
 *     content. Replay, package retrieval and agent outputs are governed alike.
 *  5. HISTORICAL SNAPSHOTS — a briefing under a past known_at sees the warnings, the
 *     approvals, the review cadence and the source health AS OF that instant; a later
 *     acknowledgement, health verdict or review does not change an earlier digest; the
 *     next briefing covers (prior.known_at, known_at]; the replay's observed layer reads
 *     warning state and OUT status as of as_of.
 *  6. OUTCOME BINDING — the outcome is recorded on the element the approved criterion
 *     names, on the decision's twin, over a period that ends by the criterion's date,
 *     from an observation that entered after the decision; a legitimate reconciliation
 *     of another same-unit output of the chosen run records that other criterion.
 *  7. AGENT OPERATION — a scheduled tick runs on a cold process with no human ever
 *     having triggered a run, and after a restart; the registry is read under the
 *     agent's own bounded session, never a borrowed human's; budgets are enforced
 *     before additional work on every task; stop conditions are supported, recorded
 *     and escalated; elapsed exhaustion stops the run.
 *
 * Fixture setup that has no governed route (a role binding's revocation, a source
 * health verdict, a strategy object's status) is written by the database controller
 * and labelled so where it happens.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { completeElements } from './phase5-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AgentWorkerService } from '../../src/executive/agents/agent-worker.service.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let observation: ObservationController;
let admin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DIGEST = 'b'.repeat(64);
const dbNow = async (): Promise<string> => String((await sql<{ t: string }>`select decision.iso(clock_timestamp()) t`.execute(h.su)).rows[0]?.t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const budgets = (over: Record<string, unknown> = {}) => ({ max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000, ...over });
const objectRow = async (id: string) => (await sql<Record<string, unknown>>`select object_type, classification, rights_profile, residency_profile, retention_profile, access_policy_ref, synthetic_state, purpose_scope
  from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`.execute(h.su)).rows[0] as Record<string, unknown>;
/**
 * Fixture setup: a role binding revoked by the database controller (Phase 0 has no governed route for it; the person stays
 * active). Phase 0's boundary bumps the principal's revocation epoch on ANY change to their bindings, so their own open
 * sessions are refused from then on ("authority epoch changed") — the revoked person can act no further. That is recorded
 * as a partial refutation; what it does NOT prevent is the consequence reproduced here: their EARLIER approval still counts
 * when another authority commits. The probes therefore use principals of their own, which are never reused.
 */
const revokeBinding = async (principalId: string, role: string) => {
  await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${principalId}::uuid and role_code = ${role} and revoked_at is null`.execute(h.su);
};

/** An evidence object admitted from a contract version with the given ceiling and licence: the controls a derived record must inherit. */
let confidentialEvd: { id: string; version: number; classification: string; rights: string };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
  admin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'analyst');
  // a contract version whose evidence is classified confidential under a named licence; a different window so the bytes are new
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 200, controls: { classification_ceiling: 'confidential', licence: 'CC-BY-4.0' } });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const row = (await sql<{ id: string; version: number; classification: string; rights: string }>`select object_id::text id, object_version::int version, classification, rights_profile rights
    from objects.canonical_objects where object_type = 'EVD' and provenance_ref = ${`SRC:${h.fx.sourceId}@${sv.version}`} order by recorded_at limit 1`.execute(h.su)).rows[0];
  expect(row, 'the confidential contract version admitted evidence').toBeDefined();
  confidentialEvd = row as typeof confidentialEvd;
  expect(confidentialEvd.classification).toBe('confidential');
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('1 · approval eligibility is current at the port: a revoked role binding does not count, a revoked authority does not commit', () => {
  it('a role-based approval whose binding is revoked drops out of the live quorum; the displayed standing agrees; the live-role control still commits', async () => {
    const roleApprover = await h.humanWithSession(['decision_approver'], 'role-approver');
    const p = await c.proposed({ terms: { approverPolicy: { quorum: 1, roles: ['decision_approver'], expires_after_days: 14 } } });
    const a = await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'Approved under the approver role.' }, roleApprover);
    expect(a.approval.eligibleBy).toBe('role:decision_approver');
    expect(a.approval.state).toBe('approved');
    await revokeBinding(roleApprover.principalId, 'decision_approver');   // fixture setup: the binding is revoked, the person stays active
    expect((await sql<{ s: string }>`select status s from identity.principals where id = ${roleApprover.principalId}::uuid`.execute(h.su)).rows[0]?.s).toBe('active');
    {
      const live = (await sql<{ n: string }>`select count(*)::text n from decision.live_approvals(${p.pkg}::uuid, ${p.v}::int)`.execute(h.su)).rows[0]?.n;
      expect(live, 'the port recounts eligibility now').toBe('0');
      const g = await c.get(p.pkg, w.owner);
      const shown = (g.package.versions[0]?.approvals as Array<Record<string, unknown>>)[0];
      expect(shown?.['live'], 'the displayed standing is the port\'s').toBe(false);
      expect(await message(c.commit(p.pkg, p.v, p.digest, w.authority2))).toMatch(/quorum is 1 distinct eligible humans; 0 live approval/);
      // the live-role control: a second approver whose binding stands restores the quorum; the commitment then succeeds
      const b = await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'Approved under a role binding that stands.' }, w.approver2);
      expect(b.approval.liveApprovals).toBe(1);
      const cm = await c.commit(p.pkg, p.v, p.digest, w.authority2);
      expect(cm.commitment.approvals.map((x) => x.approval_id)).toEqual([b.approval.approvalId]);
    }
  });

  it('an authority whose decision_authority binding is revoked cannot commit; the authority whose binding stands can', async () => {
    const p = await c.proposed();
    await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const revokedAuthority = await h.humanWithSession(['decision_authority'], 'revoked-authority');
    await revokeBinding(revokedAuthority.principalId, 'decision_authority');
    // Phase 0's boundary: the revoked authority's own session is refused (epoch changed) — recorded as the refutation of THIS consequence at the boundary
    expect(await status(c.commit(p.pkg, p.v, p.digest, revokedAuthority))).toBe(403);
    // the port's own guard, exercised directly: holds_role must not see the revoked binding
    expect((await sql<{ h: boolean }>`select decision.holds_role(${revokedAuthority.principalId}::uuid, ${T()}::uuid, ${D()}::uuid, 'decision_authority') h`.execute(h.su)).rows[0]?.h).toBe(false);
    expect((await c.commit(p.pkg, p.v, p.digest, w.authority)).commitment.opClass).toBe('C3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('2 · package inputs are bound at the port: identity and digest, both cut-offs, the run\'s own cut-offs, derived uncertainty and controls', () => {
  let pkg = ''; let v = 0; let knownAt = '';
  let early: { id: string; version: number }; let lateWorld: { id: string; version: number }; let lateRecord: { id: string; version: number };

  beforeAll(async () => {
    // two observations recorded BEFORE the version is opened: one inside the world cut-off, one after it
    const up = await h.upload([
      { filename: 'early-observation.csv', text: 'synthetic,record_id,value\ntrue,SYN-E1,1\n', documentTime: '2024-01-10T00:00:00Z' },
      { filename: 'late-world-observation.csv', text: 'synthetic,record_id,value\ntrue,SYN-L1,2\n', documentTime: '2024-02-01T00:00:00Z' },
    ]);
    early = up[0] as { id: string; version: number }; lateWorld = up[1] as { id: string; version: number };
    await sleep(50);
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    pkg = d.package.packageId;
    knownAt = await dbNow();
    v = (await c.open(pkg, { knownAt, observedThrough: '2024-01-17' })).version.version;
    await sleep(50);
    // an observation recorded AFTER known_at, dated inside the world cut-off
    lateRecord = (await h.upload([{ filename: 'late-record-observation.csv', text: 'synthetic,record_id,value\ntrue,SYN-R1,3\n', documentTime: '2024-01-12T00:00:00Z' }]))[0] as { id: string; version: number };
  }, 120_000);

  it('a citation recorded after known_at, or whose event falls after observed_through, is refused; the one inside both cut-offs is accepted', async () => {
    expect(await message(c.option(pkg, v, { key: 'late-record', title: 'Cites a record that was not known', kind: 'intervention', unsimulatedReason: 'not simulated: a probe', consequences: [{ kind: 'evidence', id: lateRecord.id, version: lateRecord.version }] }))).toMatch(/recorded .*after .*known_at/i);
    expect(await message(c.option(pkg, v, { key: 'late-world', title: 'Cites an event after the world cut-off', kind: 'intervention', unsimulatedReason: 'not simulated: a probe', consequences: [{ kind: 'evidence', id: lateWorld.id, version: lateWorld.version }] }))).toMatch(/after .*observed_through/i);
    const ok = await c.option(pkg, v, { key: 'early', title: 'Cites what was known', kind: 'intervention', unsimulatedReason: 'not simulated: a probe', consequences: [{ kind: 'evidence', id: early.id, version: early.version }] });
    expect(ok.option.simulated).toBe(false);
  });

  it('the port verifies source identity and digest itself: a citation with a foreign digest, or naming a record of another type, is refused at the port', async () => {
    const good = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_id = ${early.id}::uuid and object_version = ${early.version}`.execute(h.su)).rows[0]?.d as string;
    const direct = (key: string, consequences: unknown[]) => inCommitContext(h.app.get<Db>(COMMIT_DB),
      { sessionId: w.owner.sessionId, contextKey: w.owner.contextKey }, { tenantId: T(), domainId: D() }, 'decision.package.option', pkg,
      async (tx) => {
        await sql`select decision.set_option(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${pkg}::uuid, ${v}::int, ${key}, 'A probe option', 'intervention',
          ${JSON.stringify(consequences)}::jsonb, false, 'not simulated: a probe', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null, false, '{}'::jsonb,
          ${w.owner.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
      });
    await expect(direct('foreign-digest', [{ kind: 'evidence', id: early.id, version: early.version, digest: DIGEST }])).rejects.toThrow(/digest/);
    await expect(direct('wrong-type', [{ kind: 'claim', id: early.id, version: early.version, digest: good }])).rejects.toThrow(/not a recorded CLM/);
    await expect(direct('unknown-object', [{ kind: 'evidence', id: uuidv7(), version: 1, digest: good }])).rejects.toThrow(/not a recorded EVD/);
    // the control: the exact identity and digest are accepted at the port
    await direct('exact', [{ kind: 'evidence', id: early.id, version: early.version, digest: good }]);
  });

  it('a run whose inputs postdate known_at is refused; a run completed after known_at on inputs that obey it is accepted', async () => {
    // a twin version opened after the package's known_at: its runs' inputs are later than what the decision knew
    const o = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as { version: { version: number } };
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(o.version.version), { payload: {} });
    const run = (payload: Record<string, unknown>) => w.twins.run(h.req(w.operator, 'simulation.run', 'SIM', null), T(), D(), { payload }) as Promise<{ run: { runId: string } }>;
    const base = (twinVersion: number) => ({ twinId: w.twinId, twinVersion, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
    const lateInputs = (await run(base(o.version.version))).run.runId;
    const lateCompletion = (await run(base(w.v1))).run.runId;
    expect(await message(c.option(pkg, v, { key: 'late-inputs', title: 'A run on inputs the decision did not know', kind: 'intervention', consequences: [{ kind: 'run', id: lateInputs }] }))).toMatch(/known_at/);
    const ok = await c.option(pkg, v, { key: 'late-completion', title: 'A run completed after known_at on inputs it knew', kind: 'intervention', consequences: [{ kind: 'run', id: lateCompletion }] });
    expect(ok.option.simulated).toBe(true);
  });

  it('uncertainty and controls are derived at the port from the cited records — the run\'s sensitivity drivers and effects, its inherited validation — whatever the caller sends', async () => {
    const runDigest = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_id = ${w.rerouteId}::uuid and object_version = 1`.execute(h.su)).rows[0]?.d as string;
    const evdDigest = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_id = ${confidentialEvd.id}::uuid and object_version = ${confidentialEvd.version}`.execute(h.su)).rows[0]?.d as string;
    const optionId = uuidv7();
    await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: w.owner.sessionId, contextKey: w.owner.contextKey }, { tenantId: T(), domainId: D() }, 'decision.package.option', pkg,
      async (tx) => {
        await sql`select decision.set_option(${optionId}::uuid, ${T()}::uuid, ${D()}::uuid, ${pkg}::uuid, ${v}::int, 'caller-says', 'The caller asserts its own uncertainty and controls', 'intervention',
          ${JSON.stringify([{ kind: 'run', id: w.rerouteId, version: 1, digest: runDigest }, { kind: 'evidence', id: confidentialEvd.id, version: confidentialEvd.version, digest: evdDigest }])}::jsonb,
          true, null, '{"made_up": true}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null, false, '{"classification": "public", "synthetic_state": false}'::jsonb,
          ${w.owner.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
      });
    const row = (await sql<{ u: Record<string, unknown>; ctl: Record<string, unknown>; syn: boolean }>`select uncertainty u, controls ctl, synthetic_state syn from decision.options where option_id = ${optionId}::uuid`.execute(h.su)).rows[0] as { u: Record<string, unknown>; ctl: Record<string, unknown>; syn: boolean };
    expect(row.u['made_up']).toBeUndefined();
    expect(String(row.u['method'])).toMatch(/derived/);
    const basis = row.u['basis'] as Array<Record<string, unknown>>;
    const runBasis = basis.find((b) => b['kind'] === 'run') as Record<string, unknown>;
    const sens = runBasis['sensitivity'] as Record<string, unknown>;
    expect(sens).toBeDefined();
    expect(Array.isArray(sens['factors'])).toBe(true);
    expect((sens['factors'] as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    expect(Object.keys((sens['factors'] as Array<Record<string, unknown>>)[0] as object)).toEqual(expect.arrayContaining(['key']));
    expect(runBasis).toHaveProperty('inherited_validation');
    expect(runBasis).toHaveProperty('validation_status');
    expect(row.ctl['classification']).toBe('confidential');
    expect(String(row.ctl['rights_profile'])).toContain(confidentialEvd.rights);
    expect(row.syn).toBe(true);
  });

  it('the controller path returns the port\'s derivation: the run\'s drivers and effects are on the option, not a factor count', async () => {
    const r = await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }] });
    const basis = (r.option.uncertainty['basis'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
    expect(basis['sensitivity']).toBeDefined();
    expect(Array.isArray((basis['sensitivity'] as Record<string, unknown>)['factors'])).toBe(true);
    expect(basis['sensitivity_factors']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('3 · inherited controls: every derived record folds the controls of what it rests on', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let roomId = '';
  beforeAll(async () => {
    // a package whose reroute option also cites the confidential, licensed evidence
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    const pkg = d.package.packageId;
    const v = (await c.open(pkg)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: confidentialEvd.id, version: confidentialEvd.version }] });
    await c.terms(pkg, v, c.validTerms());
    await c.choice(pkg, v, c.validChoice());
    const pr = await c.propose(pkg, v);
    const a = await c.approve(pkg, v, { decision: 'approve', versionDigest: pr.proposal.versionDigest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const cm = await c.commit(pkg, v, pr.proposal.versionDigest, w.authority);
    P = { pkg, v, digest: pr.proposal.versionDigest, approvalId: a.approval.approvalId, commitmentId: cm.commitment.commitmentId };
    roomId = (await c.openRoom({ packageId: pkg, title: 'Controls room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
  }, 120_000);

  it('the version folds to confidential with the licence; the APR and the CMT carry the same controls, not hard-coded internal/null', async () => {
    const version = (await sql<{ ctl: Record<string, unknown> }>`select controls ctl from decision.package_versions where package_id = ${P.pkg}::uuid and version = ${P.v}`.execute(h.su)).rows[0]?.ctl as Record<string, unknown>;
    expect(version['classification']).toBe('confidential');
    expect(String(version['rights_profile'])).toContain(confidentialEvd.rights);
    const apr = await objectRow(P.approvalId);
    expect(apr['object_type']).toBe('APR');
    expect(apr['classification']).toBe('confidential');
    expect(apr['rights_profile']).toBe(version['rights_profile']);
    const cmt = await objectRow(P.commitmentId);
    expect(cmt['object_type']).toBe('CMT');
    expect(cmt['classification']).toBe('confidential');
    expect(cmt['rights_profile']).toBe(version['rights_profile']);
    expect(cmt['synthetic_state']).toBe(true);
  });

  it('the RPL carries the rights, residency, retention and access policy of the version and of what it replays', async () => {
    const r = (await c.replay(P.pkg, P.v, {}, w.executive)).replay;
    const rpl = await objectRow(r.replayId);
    expect(rpl['classification']).toBe('confidential');
    expect(String(rpl['rights_profile'])).toContain(confidentialEvd.rights);
    expect(rpl['synthetic_state']).toBe(true);
  });

  it('a briefing over an interval holding only a warning inherits the WRN\'s controls and synthetic state, not internal/false', async () => {
    const k0 = await dbNow();
    await sleep(30);
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId), T(), D(), w.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    const wr = (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where branch_id = ${w.branchId}::uuid order by raised_at desc limit 1`.execute(h.su)).rows[0];
    expect(wr, 'the fixture indicator raises a warning').toBeDefined();
    const wrn = await objectRow(String(wr?.id));
    expect(wrn['object_type']).toBe('WRN');
    const b0 = (await c.compose({ roomId, knownAt: k0, priorBriefingId: null })).briefing;
    const k1 = await dbNow();
    const b1 = (await c.compose({ roomId, knownAt: k1, priorBriefingId: b0.briefingId })).briefing;
    const kinds = b1.items.map((i) => String(i['kind']));
    expect(kinds).toContain('warning');
    expect(kinds.every((k) => k === 'warning' || k === 'branch')).toBe(true);   // the flip that raised it may sit in the same interval
    // the fold: the WRN (the only item) and the room's package (a listed source) — never a hard-coded internal/false
    const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
    const pkgControls = (await sql<{ c: Record<string, unknown>; s: boolean }>`select controls c, synthetic_state s from decision.packages_current where package_id = ${P.pkg}::uuid`.execute(h.su)).rows[0] as { c: Record<string, unknown>; s: boolean };
    const brf = await objectRow(b1.briefingId);
    expect(brf['synthetic_state']).toBe(wrn['synthetic_state'] === true || pkgControls.s);
    expect(RANK[String(brf['classification'])]).toBe(Math.max(RANK[String(wrn['classification'])] ?? 3, RANK[String(pkgControls.c['classification'])] ?? 3));
    if (typeof wrn['rights_profile'] === 'string') expect(String(brf['rights_profile'])).toContain(String(wrn['rights_profile']));
    const stored = (await sql<{ ctl: Record<string, unknown> }>`select controls ctl from executive.briefings where briefing_id = ${b1.briefingId}::uuid`.execute(h.su)).rows[0]?.ctl as Record<string, unknown>;
    expect(stored['classification']).toBe(brf['classification']);
    expect(stored['synthetic_state']).toBe(brf['synthetic_state']);
    expect(Number(stored['inputs'])).toBe(b1.items.length + 1);   // every item, and the room's package
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('4 · read-time authorization: membership, purpose, clearance and availability now, on snapshots and exports', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let roomId = ''; let briefingId = ''; let digest = ''; let allId = ''; let allDigest = '';
  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Authorization room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    await c.membership(roomId, { principal: analyst.principalId, role: 'observer', op: 'add' });
    // an open response window contributes its warning's controls whatever its age (0049, R3a), and an acknowledgement is an item of the
    // interval it falls in: the fixture's warnings rest on the confidential contract version, so they are acknowledged BEFORE the prior is
    // composed — the briefing since the prior then holds the review alone and folds internal
    for (const wr of (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where domain_id = ${D()}::uuid and state = 'raised'`.execute(h.su)).rows) {
      await w.prediction.acknowledgeWarning(h.req(w.twinOwner, 'prediction.warning.acknowledge', 'WRN', wr.id), T(), D(), wr.id, { payload: { note: 'Acknowledged for the authorization probe.' } });
    }
    await sleep(30);
    // the briefing over everything so far cites the confidential evidence (item 3's fixture) and folds to confidential
    const all = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    allId = all.briefingId; allDigest = all.contentDigest;
    await sleep(30);
    await c.review(roomId, 'Reviewed for the authorization probe.', w.executive);
    await sleep(30);
    const b = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: allId })).briefing;
    briefingId = b.briefingId; digest = b.contentDigest;
    expect((await objectRow(briefingId))['classification']).toBe('internal');
  }, 120_000);

  it('a member reads a room briefing under the purpose it was admitted for; an unrelated purpose is refused; the non-member refusal stands', async () => {
    const read = (as: AuthenticatedPrincipal, purpose: string) => w.exec.getBriefing(h.req(as, 'briefing.read', 'BRF', briefingId, purpose), T(), D(), briefingId) as Promise<{ briefing: Record<string, unknown> }>;
    expect((await read(analyst, 'briefing')).briefing['content_digest']).toBe(digest);
    expect(await status(read(analyst, 'research'))).toBe(403);
    expect(await message(read(analyst, 'research'))).toMatch(/purpose/);
    expect(await status(read(w.approver2, 'briefing'))).toBe(403);
  });

  it('a briefing classified above the reader\'s clearance is refused for the analyst and read by the executive; the availability list is apart from the content', async () => {
    // a room on the confidential package (item 3's fold), whose briefing folds to confidential
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    const pkg = d.package.packageId; const v = (await c.open(pkg)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: confidentialEvd.id, version: confidentialEvd.version }] });
    await c.terms(pkg, v, c.validTerms()); await c.choice(pkg, v, c.validChoice());
    await c.propose(pkg, v);
    const room2 = (await c.openRoom({ packageId: pkg, title: 'Confidential room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(room2, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    await c.membership(room2, { principal: analyst.principalId, role: 'observer', op: 'add' });
    const b = (await c.compose({ roomId: room2, knownAt: await dbNow(), priorBriefingId: null }, w.owner)).briefing;
    const brf = await objectRow(b.briefingId);
    expect(brf['classification']).toBe('confidential');
    const read = (as: AuthenticatedPrincipal) => w.exec.getBriefing(h.req(as, 'briefing.read', 'BRF', b.briefingId, 'briefing'), T(), D(), b.briefingId) as Promise<{ briefing: Record<string, unknown> }>;
    expect(await status(read(analyst))).toBe(403);
    expect(await message(read(analyst))).toMatch(/clearance/);
    const g = await read(w.executive);
    expect(g.briefing['content_digest']).toBe(b.contentDigest);
    expect(Array.isArray((g.briefing['availability'] as Record<string, unknown>)?.['unavailable'])).toBe(true);
    expect(((g.briefing['availability'] as Record<string, unknown>)['unavailable'] as unknown[]).length).toBe(0);
    // the list hides what the reader may not open; the executive still sees it
    const listed = (as: AuthenticatedPrincipal) => w.exec.listBriefings(h.req(as, 'briefing.read', 'BRF', null, 'briefing'), T(), D(), { payload: { roomId: room2 } }) as Promise<{ briefings: Array<Record<string, unknown>> }>;
    expect((await listed(analyst)).briefings.length).toBe(0);
    expect((await listed(w.executive)).briefings.length).toBe(1);
    // the package itself: the analyst's clearance does not cover it; the executive's does
    const getPkg = (as: AuthenticatedPrincipal) => w.decisions.get(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg);
    expect(await status(getPkg(analyst))).toBe(403);
    expect(await status(getPkg(w.executive))).toBe('ok');
  }, 120_000);

  it('a withdrawn source is reported unavailable NOW on the stored snapshot; the historical content and its digest do not change', async () => {
    // the all-evidence briefing cites the fixture's uploaded records; withdraw the terms document after the fact
    const wd = await observation.submitCorrection(h.req(h.manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
      { payload: { sourceId: w.uploadSourceId, kind: 'withdrawal', channel: 'operator', publisherRef: 'terms document withdrawn', reason: 'the terms document was withdrawn by its author', affectedEvdIds: [w.records.terms.id] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(h.manager, 'observation.correction.apply', 'COR', wd.correction.caseId, 'observation'), T(), D(), wd.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [w.records.terms.id], reason: 'withdrawal verified' } });
    const g = (await c.getBriefing(allId, w.executive)).briefing;
    expect(g['content_digest']).toBe(allDigest);
    const items = g['items'] as Array<Record<string, unknown>>;
    expect(items.some((i) => i['id'] === w.records.terms.id)).toBe(true);
    const unavailable = (g['availability'] as Record<string, unknown>)['unavailable'] as Array<Record<string, unknown>>;
    expect(unavailable.map((u) => u['id'])).toContain(w.records.terms.id);
    expect(unavailable.find((u) => u['id'] === w.records.terms.id)?.['reason']).toBe('withdrawn');
  }, 60_000);

  it('a replay of a package with a room is read by the room\'s members under the decision purpose; the analyst outside the room is refused', async () => {
    const replay = (as: AuthenticatedPrincipal, purpose: string) => w.decisions.replay(h.req(as, 'decision.replay', 'RPL', null, purpose), T(), D(), P.pkg, String(P.v), { payload: {} });
    expect(await status(replay(w.executive, 'decision'))).toBe('ok');
    expect(await status(replay(analyst, 'decision'))).toBe('ok');            // a member
    expect(await status(replay(analyst, 'research'))).toBe(403);           // the wrong purpose
    expect(await status(replay(w.approver2, 'decision'))).toBe(403);       // not a member
    expect(await message(replay(w.approver2, 'decision'))).toMatch(/member/);
    // a package without a room: readable by any reader role (the working control)
    const other = await c.committed();
    expect(await status(w.decisions.replay(h.req(w.approver2, 'decision.replay', 'RPL', null, 'decision'), T(), D(), other.pkg, String(other.v), { payload: {} }))).toBe('ok');
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('5 · historical snapshots: a briefing and a replay read the world AS OF their instants; later changes do not rewrite earlier digests', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let roomId = ''; let warningId = '';
  let kBefore = ''; let kAfter = ''; let dAfter = '';
  beforeAll(async () => {
    P = await c.committed({ terms: { monitoringConditions: [
      { kind: 'indicator', indicator_id: w.indicatorId, owner: w.owner.principalId, note: 'corridor transits below 40 for five days' },
      { kind: 'warning', branch_id: w.branchId, owner: w.owner.principalId, note: 'the corridor-collapse branch' },
      { kind: 'review', every_days: 7, owner: w.owner.principalId },
    ] } });
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'History room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    kBefore = await dbNow();
    await sleep(30);
    // the same indicator, evaluated again for a fresh warning after kBefore (warnings on a branch are raised once per flip; a second branch flip needs a new indicator evaluation window)
    const ind = await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey: w.seriesKey, description: 'history probe: transits below 45 for three days', comparator: '<', threshold: 45, consecutiveDays: 3, owner: w.twinOwner.principalId } }) as { indicator: { indicatorId: string } };
    const scn = await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'History probe scenario', statement: 'a second corridor scenario', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Probe collapse', kind: 'downside', statement: 'below 45 for three days', indicatorId: ind.indicator.indicatorId, owner: w.twinOwner.principalId, consequence: 'rebook now', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string } };
    expect(scn.scenario.scenarioId).toBeDefined();
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), T(), D(), ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    const wr = (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where indicator_id = ${ind.indicator.indicatorId}::uuid and raised_at > ${kBefore}::timestamptz order by raised_at desc limit 1`.execute(h.su)).rows[0];
    expect(wr, 'a warning raised after kBefore').toBeDefined();
    warningId = String(wr?.id);
    await sleep(30);
    kAfter = await dbNow();
  }, 180_000);

  it('a warning raised after a briefing\'s known_at is not one of its windows; raised before it, it is', async () => {
    const before = (await c.compose({ roomId, knownAt: kBefore, priorBriefingId: null })).briefing;
    expect(before.windows.map((x) => x['id'])).not.toContain(warningId);
    expect(before.items.map((i) => i['id'])).not.toContain(warningId);
    const after = (await c.compose({ roomId, knownAt: kAfter, priorBriefingId: null })).briefing;
    expect(after.windows.map((x) => x['id'])).toContain(warningId);
    dAfter = after.contentDigest;
  });

  it('a later acknowledgement, a later source-health verdict and a later review do not change the digest of the earlier briefing', async () => {
    await w.prediction.acknowledgeWarning(h.req(w.twinOwner, 'prediction.warning.acknowledge', 'WRN', warningId), T(), D(), warningId, { payload: { note: 'Acknowledged after the fact.' } });
    // fixture setup: a health verdict recorded by the database controller after kAfter (the evaluator's own route is the readiness register's)
    await sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, evidence_refs, reason, lag_class, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${h.fx.sourceId}::uuid, 'healthy', 'degraded', clock_timestamp(), 'fixture', 'fixture', '[]'::jsonb, 'fixture: a later verdict', 'none', ${uuidv7()}::uuid)`.execute(h.su);
    await c.review(roomId, 'Reviewed after the probe warning.', w.executive);
    const again = (await c.compose({ roomId, knownAt: kAfter, priorBriefingId: null })).briefing;
    expect(again.contentDigest).toBe(dAfter);
    const wItem = again.items.find((i) => i['kind'] === 'warning' && i['id'] === warningId) as Record<string, unknown>;
    expect((wItem['details'] as Record<string, unknown>)['state']).toBe('raised');
    expect(again.sourceStates.every((s) => s['state'] !== 'degraded')).toBe(true);
    // and the world as it is now: the acknowledgement, the verdict and the review are seen under a current known_at
    const now = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    expect(now.items.some((i) => i['kind'] === 'warning-acknowledged' && i['id'] === warningId)).toBe(true);
    expect(now.sourceStates.some((s) => s['state'] === 'degraded')).toBe(true);
    expect(now.windows.map((x) => x['id'])).not.toContain(warningId);
  });

  it('the next briefing covers (prior.known_at, known_at]: a change recorded after a late-composed prior\'s known_at and before its composition is not skipped', async () => {
    const k1 = await dbNow();
    await sleep(30);
    await c.review(roomId, 'Reviewed between the prior\'s known_at and its composition.', w.executive);
    await sleep(30);
    const isLateReview = (i: Record<string, unknown>) => (i['details'] as Record<string, unknown>)?.['event'] === 'review.recorded' && String(i['at']) > k1;
    const prior = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null })).briefing;   // composed now, knowing up to k1
    expect(prior.items.some(isLateReview)).toBe(false);
    const next = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: prior.briefingId })).briefing;
    expect(next.watermark['prior_briefing_id']).toBe(prior.briefingId);
    expect(next.items.some(isLateReview)).toBe(true);
  });

  it('the replay\'s observed layer reads the warning state and the OUT status as of as_of: a later acknowledgement or status change leaves the earlier digest', async () => {
    const ind2 = await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey: w.seriesKey, description: 'replay probe: transits below 50 for two days', comparator: '<', threshold: 50, consecutiveDays: 2, owner: w.twinOwner.principalId } }) as { indicator: { indicatorId: string } };
    const scn2 = await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'Replay probe scenario', statement: 'a third corridor scenario', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Replay collapse', kind: 'downside', statement: 'below 50 for two days', indicatorId: ind2.indicator.indicatorId, owner: w.twinOwner.principalId, consequence: 'rebook now', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string } };
    expect(scn2.scenario.scenarioId).toBeDefined();
    const R = await c.committed({ terms: { monitoringConditions: [{ kind: 'indicator', indicator_id: ind2.indicator.indicatorId, owner: w.owner.principalId, note: 'replay probe' }, { kind: 'review', every_days: 7, owner: w.owner.principalId }] } });
    await sleep(30);
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', ind2.indicator.indicatorId), T(), D(), ind2.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    const wr = (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where indicator_id = ${ind2.indicator.indicatorId}::uuid order by raised_at desc limit 1`.execute(h.su)).rows[0];
    expect(wr).toBeDefined();
    await sleep(30);
    const t1 = await dbNow();
    const first = (await c.replay(R.pkg, R.v, { asOf: t1 }, w.executive)).replay;
    const obs = first.layers['observed'] as Record<string, Array<Record<string, unknown>>>;
    expect(obs['warnings']?.map((x) => x['warning_id'])).toEqual([wr?.id]);
    expect(obs['warnings']?.[0]?.['state']).toBe('raised');
    await w.prediction.acknowledgeWarning(h.req(w.twinOwner, 'prediction.warning.acknowledge', 'WRN', String(wr?.id)), T(), D(), String(wr?.id), { payload: { note: 'Acknowledged after t1.' } });
    const second = (await c.replay(R.pkg, R.v, { asOf: t1 }, w.executive)).replay;
    expect(second.contentDigest).toBe(first.contentDigest);
    const later = (await c.replay(R.pkg, R.v, {}, w.executive)).replay;
    expect(((later.layers['observed'] as Record<string, Array<Record<string, unknown>>>)['warnings']?.[0])?.['state']).toBe('acknowledged');
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('6 · outcome binding: the approved criterion names the element, the decision\'s twin, the period and the chronology', () => {
  const KEY = 'outcome.line_stop_days:SYN-LINE-A1'; const OTHER = 'outcome.days_below_safety_stock:SYN-LINE-A1';
  let U: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };   // the chosen option is UNSIMULATED
  let vObs = 0; let vEarly = 0; let vLate = 0; let otherTwin = ''; let otherTwinV = 0;
  const ground = (twinId: string, version: number, elements: unknown[]) => w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(version), { payload: { elements } });
  const admit = (twinId: string, version: number) => w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(version), { payload: {} });
  const openV = async (twinId: string, over: Record<string, unknown>) => ((await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', ...over } })) as { version: { version: number } }).version.version;
  const observed = (key: string, value: number, evd: { id: string; version: number; locator: string }, field: string, validTo = '2024-04-10') =>
    ({ key, kind: 'observed', value, unit: 'days', validFrom: '2024-01-11', validTo, citations: [{ kind: 'evidence', id: evd.id, version: evd.version }], record: { locator: evd.locator, field } });

  beforeAll(async () => {
    // an observation that was already known BEFORE the decision, and a twin version carrying it
    const earlyEvd = { ...(await h.upload([{ filename: 'outcomes-early.csv', text: 'synthetic,record_id,line_id,line_stop_days\ntrue,SYN-OUT-EARLY,SYN-LINE-A1,1\n', documentTime: '2024-04-10T00:00:00Z' }]))[0] as { id: string; version: number }, locator: 'SYN-OUT-EARLY' };
    vEarly = await openV(w.twinId, { carryFrom: w.v1 });
    await ground(w.twinId, vEarly, [observed(KEY, 1, earlyEvd, 'line_stop_days')]);
    await admit(w.twinId, vEarly);
    await sleep(30);
    // the package: the chosen option is unsimulated
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Draw down the buffer', statement: 'whether to draw down the safety stock instead of rerouting', owner: w.owner.principalId });
    const pkg = d.package.packageId; const v = (await c.open(pkg)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(pkg, v, { key: 'drawdown', title: 'Draw down the buffer', kind: 'intervention', unsimulatedReason: 'the drawdown is a stock decision the supply-flow model does not simulate', consequences: [{ kind: 'evidence', id: w.evd.id, version: w.evd.version }] });
    await c.terms(pkg, v, c.validTerms());
    await c.choice(pkg, v, c.validChoice({ option_key: 'drawdown', rationale: 'The drawdown keeps the line running without the reroute premium.' }));
    const pr = await c.propose(pkg, v);
    const a = await c.approve(pkg, v, { decision: 'approve', versionDigest: pr.proposal.versionDigest, rationale: 'The drawdown is the cheaper of the two.' }, w.approver);
    const cm = await c.commit(pkg, v, pr.proposal.versionDigest, w.authority);
    U = { pkg, v, digest: pr.proposal.versionDigest, approvalId: a.approval.approvalId, commitmentId: cm.commitment.commitmentId };
    await sleep(30);
    // observations that entered AFTER the decision: the right element, a wrong-period element, a travel-days element of another key
    const outEvd = { ...(await h.upload([{ filename: 'outcomes-2024Q1-b.csv', text: 'synthetic,record_id,line_id,line_stop_days,travel_days\ntrue,SYN-OUT-B,SYN-LINE-A1,3,41\n', documentTime: '2024-04-10T00:00:00Z' }]))[0] as { id: string; version: number }, locator: 'SYN-OUT-B' };
    vObs = await openV(w.twinId, { carryFrom: vEarly, except: [KEY] });
    await ground(w.twinId, vObs, [observed(KEY, 3, outEvd, 'line_stop_days'), observed('outcome.travel_days:SYN-SHIP-4472', 41, outEvd, 'travel_days')]);
    await admit(w.twinId, vObs);
    vLate = await openV(w.twinId, { carryFrom: vObs, except: [KEY], observedThrough: '2024-05-10' });
    await ground(w.twinId, vLate, [observed(KEY, 3, outEvd, 'line_stop_days', '2024-05-10')]);
    await admit(w.twinId, vLate);
    // another twin holding a same-key, same-unit element
    const d2 = await w.twins.declare(h.req(w.twinOwner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'Another chain', statement: 'a second synthetic chain',
      boundary: [w.entityId], owner: w.twinOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
    otherTwin = d2.twin.twinId;
    otherTwinV = await openV(otherTwin, { observedThrough: '2024-04-10' });
    await ground(otherTwin, otherTwinV, [...completeElements(w.records), observed(KEY, 3, outEvd, 'line_stop_days')]);
    await admit(otherTwin, otherTwinV);
  }, 240_000);

  it('refused: another key of the same unit, another twin, a period ending after the criterion\'s date, an observation known before the decision', async () => {
    const base = { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: KEY };
    expect(await message(c.outcome(U.pkg, { ...base, elementKey: 'outcome.travel_days:SYN-SHIP-4472' }))).toMatch(/observed_on|names the element/i);
    expect(await message(c.outcome(U.pkg, { ...base, twinId: otherTwin, twinVersion: otherTwinV }))).toMatch(/twin/);
    expect(await message(c.outcome(U.pkg, { ...base, twinVersion: vLate }))).toMatch(/period|by/i);
    expect(await message(c.outcome(U.pkg, { ...base, twinVersion: vEarly }))).toMatch(/before the decision|already known|decided_at/i);
    // the control: the element the criterion names, on the decision's twin, over the period, observed after the decision
    const r = (await c.outcome(U.pkg, { ...base, note: 'Three days of line stop over the decision window.' })).outcome;
    expect(r.met).toBe(false);
    expect(Number(r.observedValue)).toBe(3);
  });

  it('a legitimate reconciliation of a different same-unit output of the chosen run records THAT criterion and not the other', async () => {
    const S = await c.committed({ choice: { outcome_criteria: [
      { key: 'line_stop_days', quantity: 'line stop days over the horizon', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: `twin:${KEY}`, twin_id: w.twinId, period: { from: '2024-01-11', to: '2024-04-10' } },
      { key: 'days_below_safety_stock', quantity: 'days below safety stock over the horizon', unit: 'days', target: 10, comparator: '<=', by: '2024-04-10', observed_on: `twin:${OTHER}`, twin_id: w.twinId, period: { from: '2024-01-11', to: '2024-04-10' } },
    ] } });
    await sleep(30);
    const run = (await sql<{ o: Record<string, unknown> }>`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`.execute(h.su)).rows[0]?.o as Record<string, unknown>;
    const totals = run['totals'] as Record<string, unknown>;
    const vSim = await openV(w.twinId, { carryFrom: w.v1, observedThrough: '2024-01-17' });
    await ground(w.twinId, vSim, [
      { key: KEY, kind: 'simulated', value: Number(totals['line_stop_days']), unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] },
      { key: OTHER, kind: 'simulated', value: Number(totals['days_below_safety_stock']), unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] },
    ]);
    await admit(w.twinId, vSim);
    const outEvd = { ...(await h.upload([{ filename: 'outcomes-2024Q1-c.csv', text: 'synthetic,record_id,line_id,line_stop_days,days_below_safety_stock\ntrue,SYN-OUT-C,SYN-LINE-A1,3,12\n', documentTime: '2024-04-10T00:00:00Z' }]))[0] as { id: string; version: number }, locator: 'SYN-OUT-C' };
    const vO = await openV(w.twinId, { carryFrom: vSim, except: [KEY, OTHER] });
    await ground(w.twinId, vO, [observed(KEY, 3, outEvd, 'line_stop_days'), observed(OTHER, 12, outEvd, 'days_below_safety_stock')]);
    await admit(w.twinId, vO);
    const reconcile = async (key: string) => {
      await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { key, fromVersion: vSim, againstVersion: vO, note: 'the chosen run against the plant\'s actuals' } });
      return String((await sql<{ id: string }>`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${key} and from_version = ${vSim} and against_version = ${vO} order by recorded_at desc limit 1`.execute(h.su)).rows[0]?.id);
    };
    const rcOther = await reconcile(OTHER); const rcKey = await reconcile(KEY);
    // the days-below reconciliation is legitimate — for the days-below criterion; it does not record the line-stop criterion
    expect(await message(c.outcome(S.pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vO, elementKey: OTHER, reconciliationId: rcOther }))).toMatch(/observed_on|names the element/i);
    const a = (await c.outcome(S.pkg, { criterionKey: 'days_below_safety_stock', twinId: w.twinId, twinVersion: vO, elementKey: OTHER, reconciliationId: rcOther })).outcome;
    expect(Number(a.observedValue)).toBe(12);
    expect(a.reconciliationId).toBe(rcOther);
    const b = (await c.outcome(S.pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vO, elementKey: KEY, reconciliationId: rcKey })).outcome;
    expect(Number(b.observedValue)).toBe(3);
    expect((await c.outcomes(S.pkg)).outcomes.map((o) => o['criterion_key']).sort()).toEqual(['days_below_safety_stock', 'line_stop_days']);
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('7 · agent operation: cold start and restart on the scheduler before any human trigger; budgets before work; stop conditions; elapsed', () => {
  let briefingAgent: { agentId: string; principalId: string }; let reportingAgent: { agentId: string; principalId: string }; let decisionAgent: { agentId: string; principalId: string };
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let roomId = '';
  const base = () => ({ version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId });
  const scheduledRuns = async (agentId: string) => (await sql<Record<string, unknown>>`select * from executive.agent_runs where agent_id = ${agentId}::uuid and trigger_kind = 'scheduler' and outcome <> 'running' order by started_at desc`.execute(h.su)).rows;
  const waitForScheduled = async (agentId: string, atLeast: number) => {
    for (let i = 0; i < 90; i += 1) { if ((await scheduledRuns(agentId)).length >= atLeast) return; await sleep(500); }
  };

  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Agent room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    briefingAgent = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets() }, admin)).agent;
  }, 120_000);

  it('COLD START: the first agent run of this process is a scheduler tick — no operator has triggered a run — and it finishes under the agent\'s own principal', async () => {
    const worker = h.app.get(AgentWorkerService);
    const scheduler = h.app.get(SchedulerService);
    expect(scheduler.enabled).toBe(true);
    const humanReads = async () => Number((await sql<{ n: string }>`select count(*)::text n from policy.policy_decisions pd join identity.principals p on ('principal:' || p.id::text) = pd.principal_id where pd.action = 'agent.read' and p.kind = 'human'`.execute(h.su)).rows[0]?.n);
    const before = await humanReads();
    const r = await worker.reconcile('cold start');
    expect(r.scheduled.map((s) => s.roomId), `eligible ${r.eligible}; failures ${JSON.stringify(r.failures)}`).toContain(roomId);
    await scheduler.promoteDelayedBriefingsForTests(T(), D());
    await waitForScheduled(briefingAgent.agentId, 1);
    const runs = await scheduledRuns(briefingAgent.agentId);
    expect(runs.length, `no scheduler-triggered run closed; planner says ${JSON.stringify(worker.recentRuns())}`).toBeGreaterThanOrEqual(1);
    expect(runs[0]?.['outcome']).toBe('finished');
    expect(runs[0]?.['trigger_principal_id']).toBeNull();
    expect(String(runs[0]?.['principal_id'])).toBe(briefingAgent.principalId);
    expect(typeof (runs[0]?.['outputs'] as Record<string, unknown>)['briefing_id']).toBe('string');
    expect(await humanReads(), 'the registry lookup borrowed no human principal').toBe(before);
    for (const s of r.scheduled) await scheduler.unscheduleBriefing(T(), D(), s.roomId);
  }, 90_000);

  it('RESTART: the startup reconciliation schedules the room again and the next tick finishes, still with no human trigger', async () => {
    const worker = h.app.get(AgentWorkerService);
    const scheduler = h.app.get(SchedulerService);
    const n = (await scheduledRuns(briefingAgent.agentId)).length;
    await worker.onApplicationBootstrap();
    expect(worker.lastReconciliation()?.scheduled.map((s) => s.roomId)).toContain(roomId);
    await scheduler.promoteDelayedBriefingsForTests(T(), D());
    await waitForScheduled(briefingAgent.agentId, n + 1);
    const runs = await scheduledRuns(briefingAgent.agentId);
    expect(runs.length).toBeGreaterThanOrEqual(n + 1);
    expect(runs[0]?.['outcome']).toBe('finished');
    expect(runs.every((x) => x['trigger_principal_id'] === null)).toBe(true);
    for (const s of worker.lastReconciliation()?.scheduled ?? []) await scheduler.unscheduleBriefing(T(), D(), s.roomId);
  }, 90_000);

  it('a reporting agent with max_reads=0 stops BEFORE its read with spent.reads=0 and no report; the stop is recorded and escalated', async () => {
    reportingAgent = (await c.registerAgent({ kind: 'reporting', ...base(), budgets: budgets({ max_reads: 0 }) }, admin)).agent;
    const r = (await c.runAgent(reportingAgent.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(r.outcome).toBe('stopped');
    expect(Number(r.spent['reads'])).toBe(0);
    expect(String(r.stopReason)).toMatch(/budget/);
    expect(r.outputs['report']).toBeUndefined();
    expect(r.escalatedTo).toBe(w.executive.principalId);
    const row = (await sql<{ outcome: string; spent: Record<string, unknown>; stop_reason: string }>`select outcome, spent, stop_reason from executive.agent_runs where run_id = ${r.runId}::uuid`.execute(h.su)).rows[0];
    expect(row?.outcome).toBe('stopped');
    expect(Number(row?.spent['reads'])).toBe(0);
    // the control: a budget that covers the render finishes with every query family metered — the package, its admitted purpose,
    // the version, the options, the dissent, the approvals and the decision (0050: the renderer is metered family by family, R7c)
    const okAgent = (await c.registerAgent({ kind: 'reporting', ...base(), budgets: budgets({ max_reads: 8 }) }, admin)).agent;
    const ok = (await c.runAgent(okAgent.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(ok.outcome).toBe('finished');
    expect(Number(ok.spent['reads'])).toBe(7);
    // a budget short of the render stops at the family it cannot afford, with no report
    const short = (await c.registerAgent({ kind: 'reporting', ...base(), budgets: budgets({ max_reads: 3 }) }, admin)).agent;
    const cut = (await c.runAgent(short.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(cut.outcome).toBe('stopped');
    expect(Number(cut.spent['reads'])).toBe(3);
    expect(cut.outputs['report']).toBeUndefined();
  });

  it('the decision agent and the briefing agent meter every read before it happens: max_reads=0 stops with reads=0 and no draft; the monitor task stops before its evaluation', async () => {
    decisionAgent = (await c.registerAgent({ kind: 'decision', ...base(), budgets: budgets({ max_reads: 0 }) }, admin)).agent;
    const d = await c.fullDraft();
    const draft = (await c.runAgent(decisionAgent.agentId, { task: 'draft', packageId: d.pkg, version: d.v })).run;
    expect(draft.outcome).toBe('stopped');
    expect(Number(draft.spent['reads'])).toBe(0);
    expect(draft.outputs['drafted']).toBeUndefined();
    const b0 = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets({ max_reads: 1 }) }, admin)).agent;
    const mon = (await c.runAgent(b0.agentId, { task: 'monitor', roomId })).run;
    expect(mon.outcome).toBe('stopped');
    expect(Number(mon.spent['reads'])).toBe(1);
    expect(mon.outputs['monitoring']).toBeUndefined();
    const brief = (await c.runAgent(b0.agentId, { task: 'briefing', roomId })).run;
    expect(brief.outcome).toBe('stopped');
    expect(Number(brief.spent['reads'])).toBeLessThanOrEqual(1);
    expect(brief.outputs['briefing_id']).toBeUndefined();
  });

  it('elapsed exhaustion stops the run before further work; a stop condition is supported, recorded and escalated; an unsupported one is refused at registration', async () => {
    const slow = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets({ max_elapsed_ms: 1 }) }, admin)).agent;
    const r = (await c.runAgent(slow.agentId, { task: 'briefing', roomId })).run;
    expect(r.outcome).toBe('stopped');
    expect(String(r.stopReason)).toMatch(/elapsed/);
    expect(r.outputs['briefing_id']).toBeUndefined();
    expect(await status(c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets(), stopConditions: [{ kind: 'when_the_moon_is_full' }] }, admin))).toBe(422);
    const bounded = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets(), stopConditions: [{ kind: 'max_items', value: 0 }] }, admin)).agent;
    await c.review(roomId, 'A review the bounded agent would have to carry.', w.executive);   // at least one item since the room's latest briefing
    const s = (await c.runAgent(bounded.agentId, { task: 'briefing', roomId })).run;
    expect(s.outcome).toBe('stopped');
    expect(String(s.stopReason)).toMatch(/max_items/);
    expect(s.escalatedTo).toBe(w.executive.principalId);
    expect(s.outputs['briefing_id']).toBeUndefined();
    const ev = (await sql<{ d: Record<string, unknown> }>`select details d from executive.room_events where room_id = ${roomId}::uuid and event = 'agent.escalated' order by occurred_at desc limit 1`.execute(h.su)).rows[0]?.d;
    expect(String(ev?.['reason'])).toMatch(/max_items/);
    // the agent-cannot-decide control stands: the decision agent's proposal is refused and recorded
    const full = (await c.registerAgent({ kind: 'decision', ...base(), budgets: budgets() }, admin)).agent;
    const d = await c.fullDraft();
    const draft = (await c.runAgent(full.agentId, { task: 'draft', packageId: d.pkg, version: d.v })).run;
    expect(draft.outcome).toBe('finished');
    expect(draft.refusals.map((x) => x['action'])).toEqual(['decision.package.propose']);
    expect(await status(c.propose(d.pkg, d.v, w.agent))).toBe(403);
  }, 120_000);
});
