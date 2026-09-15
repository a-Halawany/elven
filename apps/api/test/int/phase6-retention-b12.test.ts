/**
 * CP-6 B12 (migration 0072) — the governed RESTORE-TO-HOT port and the COLD-TIER MANAGER, on a real database and an ISOLATED
 * vault (the closure harness's discipline: the four roots under one temporary directory, set before the application boots, so
 * the moves, the staged copies and the sweeper's removals of these cases touch this run's bytes alone; the `phase6-*` name puts
 * the file in `test:int:all`, as the CI rule requires):
 *
 *   R0–R5 · RESTORE (0072 §2–§5; D1–D3, D5) — a restore is a MOVE back recorded in the same ledger (archive → hot; a manifest's
 *   tier stays its latest record): the preservation scope (every manifest the selector names — a hot one excluded, a hold recorded
 *   and honoured by keeping), the executor the archive's mirrored (the archive copy STAGED under the attempt's own name in the hot
 *   root, the move recorded under the manifest's lock, published after the commit, the archive copy removed once a hot copy is
 *   published), the restore contract at verification (no tombstone, the tier hot, the hot copy under the digest, the archive copy
 *   absent, no staged copy in either root, the move recorded), retrieval from the hot tier afterwards, and the overlap that succeeds
 *   (two restores of one archived manifest executed together: one mover, one finder, one tier record).
 *
 *   R6–R9 · THE MANAGER (0072 §1, §4, §6; D4) — a per-domain policy read by the executions and the evaluations: ORDERING (oldest
 *   due first, at most max_opens_per_evaluation per schedule, the rest deferred and counted on the schedule), THE RESTORE WINDOW
 *   (a restored manifest returns to the cold tier by the archive schedule after restore_hot_for), BUDGETS (a daily byte budget
 *   refuses an archive or a restore at admission — before the state moves, no attempt counted — and pauses it for a retry naming
 *   the instant the window frees), RETRIES (an attempt counted where its failure is durably recorded; exhausted, the action is
 *   ESCALATED for human review; a person's re-resolution restarts the count), ESCALATION BY AGE (an action paused for retry longer
 *   than escalate_after is escalated by the next evaluation) and OBSERVABLE STATE (retention.tier_state with the vault's inventory
 *   of both roots; readable under retention.read, declarable by a domain admin alone).
 *
 *   R10 · THE SWEEPER'S WALK (D6, C17/C18; the B11 round-2 follow-up) — both blob roots walked, the staged and temp names known:
 *   a redundant staged copy beside a verified published copy removed, a temp file older than a minute removed, an orphan recorded
 *   and kept, a staged copy in the wrong root removed only once older than the run timeout and only when the tier's copy verifies,
 *   a young one kept whatever root it is in; the counts exact; a second sweep changes nothing.
 *
 *   R11 · THE RETRY ROUTE for a restore (D2, C4, C5, C15) — the hot publish failing after the commit keeps the archive copy and
 *   records a pending residual; the evidence still serves, from the staged copy under the digest; the execute route publishes it,
 *   removes the archive copy, and the verification closes the residual.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService, type VaultName } from '../../src/observation/vault/vault.service.js';
import { SweeperService, type SweepReport } from '../../src/observation/sweeper/sweeper.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The ISOLATED vault of this run: all four roots under one temporary directory, set before the application reads its configuration.
const VAULT_DIR = mkdtempSync(join(tmpdir(), 'eye-b12-vault-'));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
// The sweeper's run timeout at its minimum (R10; C18): a staged copy "older than the timeout" is one whose mtime is set more than a minute back.
process.env['EYE_SWEEPER_RUN_TIMEOUT_SECONDS'] = '60';

let h: Phase4Harness; let observation: ObservationController; let retention: RetentionController; let vault: VaultService; let sweeper: SweeperService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Row = Record<string, unknown>;

/* ───────────── the rows ───────────── */
type Action = { action_id: string; state: string; kind: string; failure_class: string | null; disposition: string | null; failure_reason: string | null; attempts: number; escalated_at: Date | null };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, failure_class, disposition, failure_reason, attempts::int, escalated_at from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const items = async (id: string) => (await sql<{ item_kind: string; ref: string; disposition: string; hold_id: string | null; reason: string; details: Row }>`select item_kind, ref, disposition, hold_id::text, reason, details from retention.scope_items where action_id = ${id}::uuid order by dependency_order`.execute(su)).rows;
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; locator: string; content_digest: string; byte_length: number; source_id: string; retention_profile: string }>`select manifest_id::text, locator, content_digest, byte_length::int, source_id::text, retention_profile from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const tierOf = async (manifestId: string) => (await sql<{ t: string }>`select observation.manifest_tier(${manifestId}::uuid) t`.execute(su)).rows[0]!.t;
const tierRecords = async (manifestId: string) => (await sql<{ action_id: string; from_tier: string; tier: string }>`select action_id::text, from_tier, tier from observation.blob_tier_records where manifest_id = ${manifestId}::uuid order by moved_at`.execute(su)).rows;
/** Whether the manifest's latest move happened at the given instant (a jsonb timestamptz as the route returned it) — compared in SQL, so no clock precision is lost on the way. */
const latestMoveAt = async (manifestId: string, instant: string) => (await sql<{ same: boolean }>`select (select max(moved_at) from observation.blob_tier_records where manifest_id = ${manifestId}::uuid) = ${instant}::timestamptz as same`.execute(su)).rows[0]!.same;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Row }>`select event, details from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at desc`.execute(su)).rows;
const tombstones = async (manifestId: string) => (await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!.n;
const executions = async (id: string) => (await sql<{ port: string; outcome: string; evidence: Row }>`select port, outcome, evidence from retention.executions where action_id = ${id}::uuid order by executed_at`.execute(su)).rows;
const verifications = async (id: string) => (await sql<{ check_name: string; passed: boolean; expected: Row; observed: Row }>`select check_name, passed, expected, observed from retention.verifications where action_id = ${id}::uuid order by verified_at, check_name`.execute(su)).rows;
const residuals = async (id: string) => (await sql<{ kind: string; count: number; status: string }>`select kind, count, status from retention.residual_inventory where action_id = ${id}::uuid order by kind`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string }>`select event from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);
const eventDetails = async (id: string, event: string) => (await sql<{ details: Row }>`select details from retention.action_events where action_id = ${id}::uuid and event = ${event} order by occurred_at`.execute(su)).rows.map((e) => e.details);
const approvalsLive = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is null`.execute(su)).rows[0]!.n;
const deletionVerifiedCount = async (actionId: string) => (await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and payload ->> 'action_id' = ${actionId}`.execute(su)).rows[0]!.n;
const scheduleRow = async (id: string) => (await sql<{ state: string; last_evaluation: Row }>`select state, last_evaluation from retention.schedules where schedule_id = ${id}::uuid`.execute(su)).rows[0]!;
/** The manifests and bytes per tier as the ledger has them (non-tombstoned evidence manifests of the domain) — what tier_state must report. */
const tierCounts = async () => {
  const rows = (await sql<{ tier: string; n: number; b: number }>`select observation.manifest_tier(m.manifest_id) tier, count(*)::int n, coalesce(sum(m.byte_length), 0)::int b from observation.blob_manifests m
    where m.tenant_id = ${T()}::uuid and m.domain_id = ${D()}::uuid and m.vault = 'evidence' and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id) group by 1`.execute(su)).rows;
  const of = (t: string) => rows.find((r) => r.tier === t) ?? { tier: t, n: 0, b: 0 };
  return { hot: { manifests: of('hot').n, bytes: of('hot').b }, archive: { manifests: of('archive').n, bytes: of('archive').b } };
};
/** The moves of the last 24 hours as the ledger has them (the budget window of 0072 §4). */
const moves24h = async () => {
  const rows = (await sql<{ tier: string; n: number; b: number }>`select r.tier, count(*)::int n, coalesce(sum(bm.byte_length), 0)::int b from observation.blob_tier_records r join observation.blob_manifests bm on bm.manifest_id = r.manifest_id
    where r.tenant_id = ${T()}::uuid and r.domain_id = ${D()}::uuid and r.moved_at > clock_timestamp() - interval '1 day' group by r.tier`.execute(su)).rows;
  const of = (t: string) => rows.find((r) => r.tier === t) ?? { tier: t, n: 0, b: 0 };
  return { archived: { count: of('archive').n, bytes: of('archive').b }, restored: { count: of('hot').n, bytes: of('hot').b } };
};

/* ───────────── the routes ───────────── */
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; kind: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved; the held items stay') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
type Execution = { executed: number; held: number; refused: number; floor: Row | null; package: Row | null; bytes: { removed: string[]; failed: string[] }; published: number };
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Execution }>;
/** The same route on an EXECUTED action: the retry of its pending bytes residuals (0071; D2). */
const retry = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: { retried: boolean; pending: number; bytes: { removed: string[]; failed: string[] } } }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
const withdraw = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.withdraw(h.req(p, 'retention.action.withdraw', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
const declareSchedule = (payload: Row) => retention.declareSchedule(h.req(domainAdmin, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(), { payload }) as Promise<{ schedule: { scheduleId: string } }>;
const evaluate = () => retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as Promise<{ evaluation: { opened: Row[]; escalated: Row[]; deferred: number } }>;
/** The manager's policy (0072 §1; D4): declared by a domain admin, the fields not named taking the defaults. */
type PolicyIntake = { budgetBytesPerDay?: number | null; maxOpensPerEvaluation?: number; maxAttempts?: number; escalateAfter?: string; restoreHotFor?: string };
const declareTierPolicy = (p: AuthenticatedPrincipal, payload: PolicyIntake) => retention.declareTierPolicy(h.req(p, 'retention.tier.declare', 'RTP', null, 'retention'), T(), D(), { payload }) as Promise<{ policy: Row }>;
type Inventory = { blobs: number | null; staged: number | null; temp: number | null };
type TierState = {
  policy: { declared: boolean; version: number; budget_bytes_per_day: number | null; max_opens_per_evaluation: number; max_attempts: number; escalate_after: string; restore_hot_for: string };
  tiers: { hot: { manifests: number; bytes: number }; archive: { manifests: number; bytes: number } };
  moves_24h: { archived: { count: number; bytes: number }; restored: { count: number; bytes: number } };
  budget: { bytes_per_day: number | null; used_24h: number; remaining: number | null; window_resets_at: string | null };
  actions: { executing: number; paused_retry: number; paused_human_review: number; escalated: number; pending_bytes_residuals: number };
  restored_awaiting_rearchive: number;
  schedules: Row[];
  vault: { evidence: Inventory; archive: Inventory };
};
const tierState = (p: AuthenticatedPrincipal) => retention.tierState(h.req(p, 'retention.read', 'RTP', null, 'retention'), T(), D()) as Promise<{ state: TierState }>;
const download = (p: AuthenticatedPrincipal, evdId: string) => observation.downloadEvidence(h.req(p, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId) as Promise<{ download: { contentDigest: string; byteLength: number; base64: string; integrity: string; tier: string; availability: string } }>;
const getEvidence = (p: AuthenticatedPrincipal, evdId: string) => observation.getEvidence(h.req(p, 'observation.read.evidence', 'EVD', evdId, 'observation'), T(), D(), evdId, { payload: {} }) as Promise<{ manifest: Row | null; availability: { tier: string; state: string } }>;
const placeHold = async (evdId: string, reason: string): Promise<string> => {
  const r = await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', evdId, 'observation'), T(), D(), evdId, { payload: { reason } }) as { hold: { holdId: string } };
  return r.hold.holdId;
};
/** Uploads with the default label share ONE source (the harness keeps one per ceiling), so a schedule selecting that source sees every fixture of this file. */
const upload = async (names: string[]) =>
  h.upload(names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' })), 'internal', '') as Promise<Array<{ id: string; version: number; digest: string }>>;
/** OPEN → RESOLVE in one go; returns the action id and its digest. */
const opened = async (payload: Row): Promise<{ id: string; digest: string; scope: Row }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  return { id: o.action.actionId, digest: String(r.scope['scope_digest']), scope: r.scope };
};
/** OPEN → RESOLVE → APPROVE. */
const approved = async (payload: Row): Promise<{ id: string; digest: string; scope: Row }> => {
  const a = await opened(payload);
  await approve(authority, a.id, a.digest);
  return a;
};
const archiveOf = (...manifestIds: string[]) => ({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds } });
const restoreOf = (...manifestIds: string[]) => ({ kind: 'restore', targetKind: 'evidence', selector: { manifestIds } });
/** The failing execution's outcome, as a value: the 409 of the pause or the escalation, never a resolved promise. */
const failing = (p: Promise<unknown>) => p.then(() => { throw new Error('the execution should have been refused'); }, (e: unknown) => e as { status?: number; message?: string });
/** A retrieval from a blob root as a verdict, so a failed assertion names the vault's reason (missing, corrupt). */
const retrieval = (root: VaultName, locator: string, digest: string) => vault.read(root, scope(), locator, digest).then(() => ({ ok: true }), (e: { reason?: string }) => ({ ok: false, reason: e.reason ?? 'unknown' }));
const bytesOf = async (root: VaultName, m: { locator: string; content_digest: string }) => (await vault.read(root, scope(), m.locator, m.content_digest)).bytes;
/** The staged copies of a locator in both roots (D3: none after a move completes). */
const stagedInBoth = async (locator: string) => ({ evidence: await vault.stagedCopiesIn('evidence', scope(), locator), archive: await vault.stagedCopiesIn('archive', scope(), locator) });
const basenameOf = (locator: string) => basename(locator);
/** The sweep as phase1-fault-injection invokes it — the service itself under the analyst's session (the `observation.` PDP rule admits a domain analyst). */
const sweep = (): Promise<SweepReport> => sweeper.sweep(analyst, T(), D(), uuidv7(), 'observation');

/* ───────────── the fixtures the cases share ───────────── */
type Manifest = Awaited<ReturnType<typeof manifestRow>>;
let evdA: { id: string }; let evdB: { id: string }; let evdC: { id: string };
let mA: Manifest; let mB: Manifest; let mC: Manifest; let mD: Manifest; let mE: Manifest;
let holdId = ''; let sourceId = ''; let archiveId0 = ''; let restoreId = ''; let restoreDigest = ''; let scheduleId = ''; let escalatedByAgeId = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  observation = h.app.get(O); retention = h.app.get(R); vault = h.app.get(VaultService); sweeper = h.app.get(SweeperService);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b12-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b12-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b12-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b12-analyst');
}, 300_000);

afterAll(async () => {
  fault.disarm();
  await h?.close();
  await su?.destroy();
  rmSync(VAULT_DIR, { recursive: true, force: true });
}, 120_000);

describe('R · RESTORE — the port, the executor, the contract, the retrieval, the overlap (0072 §2–§5)', () => {
  it('R0 · SETUP: three uploads A, B, C from one source; a legal hold through B; an ARCHIVE of A and B approved, executed and verified (the B11 path); C stays hot', async () => {
    const up = await upload(['b12-a', 'b12-b', 'b12-c']);
    evdA = up[0]!; evdB = up[1]!; evdC = up[2]!;
    mA = await manifestRow((await manifestOf(evdA.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(evdB.id, 1)).manifest_id); mC = await manifestRow((await manifestOf(evdC.id, 1)).manifest_id);
    sourceId = mA.source_id;
    expect([mB.source_id, mC.source_id]).toEqual([sourceId, sourceId]);
    holdId = await placeHold(evdB.id, 'litigation hold on the second upload (fixture)');
    const arc = await approved(archiveOf(mA.manifest_id, mB.manifest_id));
    archiveId0 = arc.id;
    expect(arc.scope).toMatchObject({ state: 'scope_resolved', execute: 2 });
    const ex = await execute(steward, archiveId0);
    expect(ex.execution).toMatchObject({ executed: 2, held: 0, refused: 0 });
    expect([...ex.execution.bytes.removed].sort()).toEqual([mA.locator, mB.locator].sort());
    expect(ex.execution.bytes.failed).toEqual([]);
    expect((await verify(steward, archiveId0)).verification).toMatchObject({ verified: true, state: 'verified' });
    for (const m of [mA, mB]) {
      expect(await tierOf(m.manifest_id)).toBe('archive');
      expect(await vault.exists('archive', scope(), m.locator)).toBe(true); expect(await vault.exists('evidence', scope(), m.locator)).toBe(false);
    }
    expect(await tierOf(mC.manifest_id)).toBe('hot');
    expect(await vault.exists('evidence', scope(), mC.locator)).toBe(true);
  }, 180_000);

  it('R1 · OPEN → RESOLVE a restore of [A, B, C]: 3 items — execute 2 (A; B with its hold recorded and honoured by preserving), excluded 1 (C: already in the hot tier); a restore of a hot manifest alone pauses with nothing to restore; a deletion with manifestIds is still refused 422 (D7 kept); a schedule of kind restore is refused at declaration (D4)', async () => {
    const o = await open(steward, restoreOf(mA.manifest_id, mB.manifest_id, mC.manifest_id));
    restoreId = o.action.actionId;
    expect(o.action).toMatchObject({ kind: 'restore', state: 'opened' });
    const r = await resolve(steward, restoreId);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', items: 3, execute: 2, excluded: 1, held: 0, blocking: 0, residuals: [] });
    restoreDigest = String(r.scope['scope_digest']);
    const its = await items(restoreId);
    expect(its.map((i) => i.item_kind)).toEqual(['manifest', 'manifest', 'manifest']);
    const a = its.find((i) => i.ref === mA.manifest_id)!;
    expect(a).toMatchObject({ disposition: 'execute', hold_id: null });
    expect(a.reason).toMatch(/^restored: the manifest and its digest are kept, the bytes move from the archive tier back to the hot tier/);
    expect(a.reason).not.toMatch(/legal hold/);
    expect(a.details).toMatchObject({ tier: 'archive', legal_hold: false });
    const b = its.find((i) => i.ref === mB.manifest_id)!;
    expect(b).toMatchObject({ disposition: 'execute', hold_id: holdId });
    expect(b.reason).toMatch(/under a legal hold, which the restore honours by preserving it/);
    expect(b.details).toMatchObject({ tier: 'archive' });
    const c = its.find((i) => i.ref === mC.manifest_id)!;
    expect(c.disposition).toBe('excluded');
    expect(c.reason).toMatch(/already in the hot tier; a restore moves archived bytes only/);
    expect(c.details).toMatchObject({ tier: 'hot' });
    expect(await residuals(restoreId)).toEqual([]);
    // Nothing to restore (D5): every manifest in scope hot — paused with the reason, withdrawn here.
    const nothing = await opened(restoreOf(mC.manifest_id));
    expect(nothing.scope).toMatchObject({ state: 'paused', execute: 0, excluded: 1 });
    expect((await actionRow(nothing.id)).failure_reason).toMatch(/nothing to restore: every manifest in scope is already in the hot tier, or an id names no manifest of this domain/);
    await withdraw(steward, nothing.id, 'the control is withdrawn: nothing to restore');
    // D7 kept (C3: the pinned substring): a deletion does not take a chosen object set.
    await expect(open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id] } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/manifestIds is an archive's or a customer export's selector/) });
    // D4: a restore is on demand — a schedule of that kind is refused by the port (its 22023 reaches the harness as the port's own error, as B8 of the B11 harness saw a schedule's refusal).
    await expect(declareSchedule({ retentionProfile: mA.retention_profile, targetKind: 'evidence', actionKind: 'restore', dueAfter: '0 seconds', selector: { sourceId } })).rejects.toThrow(/retention schedule rejected: a restore is opened on demand \(an action naming the manifests\), not by a schedule/);
  }, 120_000);

  it('R2 · APPROVE → EXECUTE: executed 2 — the hot copies present and verifying, the archive copies ABSENT, no staged file in either root; the tier ledger has an archive→hot row per manifest by this action; custody.restored per manifest; the execution rows [observation.restore_blob done] ×2 (already_restored false, copy_created true, staged true, attempt_id a uuid); bytes.removed both archive locators; state executed; attempts 1', async () => {
    await approve(authority, restoreId, restoreDigest);
    const ex = await execute(steward, restoreId);
    expect(ex.execution).toMatchObject({ executed: 2, held: 0, refused: 0, package: null, published: 2 });
    expect([...ex.execution.bytes.removed].sort()).toEqual([mA.locator, mB.locator].sort());
    expect(ex.execution.bytes.failed).toEqual([]);
    for (const m of [mA, mB]) {
      expect(await vault.exists('evidence', scope(), m.locator)).toBe(true);
      expect(await vault.exists('archive', scope(), m.locator)).toBe(false);
      expect(await retrieval('evidence', m.locator, m.content_digest)).toEqual({ ok: true });
      expect(await stagedInBoth(m.locator)).toEqual({ evidence: [], archive: [] });
      expect(await tierOf(m.manifest_id)).toBe('hot');
      expect(await tierRecords(m.manifest_id)).toEqual([{ action_id: archiveId0, from_tier: 'hot', tier: 'archive' }, { action_id: restoreId, from_tier: 'archive', tier: 'hot' }]);
      const c = await custody(m.manifest_id, 'custody.restored');
      expect(c).toHaveLength(1);
      expect(c[0]!.details).toMatchObject({ action_id: restoreId, from_tier: 'archive', to_tier: 'hot', locator: m.locator });
      expect(String(c[0]!.details['tier_record_id'])).toMatch(UUID_RE);
      expect(await tombstones(m.manifest_id)).toBe(0);
    }
    const execs = await executions(restoreId);
    expect(execs.map((e) => [e.port, e.outcome])).toEqual([['observation.restore_blob', 'done'], ['observation.restore_blob', 'done']]);
    for (const e of execs) {
      expect(e.evidence).toMatchObject({ already_restored: false, copy_created: true, staged: true, digest_verified: true });
      expect(String(e.evidence['attempt_id'])).toMatch(UUID_RE);
      expect(String(e.evidence['tier_record_id'])).toMatch(UUID_RE);
      expect(e.evidence['hot_locator']).toBe(e.evidence['locator']);
    }
    expect(execs.map((e) => e.evidence['locator']).sort()).toEqual([mA.locator, mB.locator].sort());
    expect(execs.map((e) => e.evidence['hold_id'])).toEqual(expect.arrayContaining([holdId, null]));
    expect(await actionRow(restoreId)).toMatchObject({ state: 'executed', attempts: 1, escalated_at: null });
    expect((await eventDetails(restoreId, 'execution.started')).at(-1)).toMatchObject({ attempt: 1 });
    expect(await events(restoreId)).toContain('execution.finished');
  }, 180_000);

  it('R3 · VERIFY against the restore contract (D3): two checks passed, the expected object exactly as 0072 §5 states it; no DeletionVerified; the action verified', async () => {
    const v = await verify(steward, restoreId);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified', kind: 'restore' });
    const checks = await verifications(restoreId);
    expect(checks).toHaveLength(2);
    for (const c of checks) {
      expect(c.passed).toBe(true);
      expect(c.check_name).toMatch(/^manifest [0-9a-f-]{36}: restored — bytes in the hot tier under the manifest's digest, absent from the archive tier, no staged copy, the tier recorded$/);
      expect(c.expected).toEqual({ tombstone: false, tier: 'hot', bytes_present: true, hot_digest_ok: true, archive_present: false, staged_copies: false, restored: true });
      expect(c.observed).toMatchObject({ tombstone: false, tier: 'hot', bytes_present: true, hot_digest_ok: true, archive_present: false, staged_copies: false, restored: true });
    }
    expect(checks.map((c) => c.observed['hold_id'])).toEqual(expect.arrayContaining([holdId, null]));
    expect(await deletionVerifiedCount(restoreId)).toBe(0);
    expect(await actionRow(restoreId)).toMatchObject({ state: 'verified' });
  }, 120_000);

  it('R4 · RETRIEVAL after the restore: A downloads from the hot tier — tier hot, availability verified, the custody row served_from published; the detail\'s availability {hot, hot} and archived_at null; B (held) downloads too', async () => {
    const dl = await download(analyst, evdA.id);
    expect(dl.download).toMatchObject({ contentDigest: mA.content_digest, tier: 'hot', availability: 'verified', integrity: 'verified' });
    expect(sha256(Buffer.from(dl.download.base64, 'base64'))).toBe(mA.content_digest);
    const retrieved = await custody(mA.manifest_id, 'custody.retrieved');
    expect(retrieved[0]!.details).toMatchObject({ verified_on_read: true, tier: 'hot', served_from: 'published' });
    const detail = await getEvidence(analyst, evdA.id);
    expect(detail.manifest).toMatchObject({ tier: 'hot', archived_at: null });
    expect(detail.availability).toEqual({ tier: 'hot', state: 'hot' });
    expect((await download(analyst, evdB.id)).download).toMatchObject({ contentDigest: mB.content_digest, tier: 'hot', availability: 'verified', integrity: 'verified' });
    expect((await custody(mB.manifest_id, 'custody.retrieved'))[0]!.details).toMatchObject({ tier: 'hot', served_from: 'published' });
  }, 120_000);

  it('R5 · the OVERLAP that succeeds: A archived again (executed, verified), then TWO restores of A approved on the same archived state and executed CONCURRENTLY — one makes the copy and records the move, one finds A hot under the lock and records it as already restored; ONE archive→hot record for the round; the hot copy present, the archive copy absent, no staged copy in either root; both verify', async () => {
    const arc = await approved(archiveOf(mA.manifest_id));
    expect((await execute(steward, arc.id)).execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mA.locator], failed: [] } });
    expect((await verify(steward, arc.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect(await tierOf(mA.manifest_id)).toBe('archive');
    const before = await tierRecords(mA.manifest_id);
    expect(before).toHaveLength(3);
    const r1 = await approved(restoreOf(mA.manifest_id)); const r2 = await approved(restoreOf(mA.manifest_id));
    expect(r1.scope).toMatchObject({ state: 'scope_resolved', execute: 1 }); expect(r2.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    const [ex1, ex2] = await Promise.all([execute(steward, r1.id), execute(steward, r2.id)]);
    expect(ex1.execution).toMatchObject({ executed: 1, refused: 0 }); expect(ex2.execution).toMatchObject({ executed: 1, refused: 0 });
    const ev1 = (await executions(r1.id))[0]!; const ev2 = (await executions(r2.id))[0]!;
    expect([ev1, ev2].map((e) => [e.port, e.outcome])).toEqual([['observation.restore_blob', 'done'], ['observation.restore_blob', 'done']]);
    expect([ev1.evidence['copy_created'], ev2.evidence['copy_created']].sort()).toEqual([false, true]);
    expect([ev1.evidence['already_restored'], ev2.evidence['already_restored']].sort()).toEqual([false, true]);
    const finder = [ev1, ev2].find((e) => e.evidence['already_restored'] === true)!;
    expect(finder.evidence).toMatchObject({ tier_record_id: null, copy_created: false, digest_verified: true });
    const after = await tierRecords(mA.manifest_id);
    expect(after).toHaveLength(4);
    expect(after.at(-1)).toMatchObject({ from_tier: 'archive', tier: 'hot' });
    expect([r1.id, r2.id]).toContain(after.at(-1)!.action_id);
    expect(await tierOf(mA.manifest_id)).toBe('hot');
    expect(await retrieval('evidence', mA.locator, mA.content_digest)).toEqual({ ok: true });
    expect(await vault.exists('archive', scope(), mA.locator)).toBe(false);
    expect(await stagedInBoth(mA.locator)).toEqual({ evidence: [], archive: [] });
    expect(await custody(mA.manifest_id, 'custody.restored')).toHaveLength(2);
    expect((await verify(steward, r1.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await verify(steward, r2.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await download(analyst, evdA.id)).download).toMatchObject({ contentDigest: mA.content_digest, tier: 'hot', availability: 'verified', integrity: 'verified' });
  }, 180_000);
});

describe('M · THE MANAGER — ordering, the restore window, budgets, retries, escalation, observable state (0072 §1, §4, §6)', () => {
  it('R6 · the RESTORE WINDOW and ORDERING: an archive schedule (dueAfter 0 seconds) evaluated with NO policy does not open the restored A and B (their latest record a restore, within the default 30-day window) while it opens C (hot, never moved); under a policy restoreHotFor 0 seconds and maxOpensPerEvaluation 1, one evaluation opens exactly one action — C, the oldest due — with deferred 2 returned by the route and recorded on the schedule, and the next opens B (the next oldest due, due at its restore instant) with deferred 1; what was opened is withdrawn', async () => {
    const s = await declareSchedule({ retentionProfile: mA.retention_profile, targetKind: 'evidence', actionKind: 'archive', dueAfter: '0 seconds', selector: { sourceId } });
    scheduleId = s.schedule.scheduleId;
    // (i) no policy: the defaults in force — a restored manifest is due 30 days after its restore.
    const e1 = await evaluate();
    expect(e1.evaluation.opened.map((o) => String((o['selector'] as Row)['manifest_id']))).toEqual([mC.manifest_id]);
    expect(e1.evaluation.opened[0]).toMatchObject({ kind: 'archive', schedule_id: scheduleId });
    expect(e1.evaluation).toMatchObject({ escalated: [], deferred: 0 });
    expect((await scheduleRow(scheduleId)).last_evaluation).toMatchObject({ opened: 1, deferred: 0 });
    for (const o of e1.evaluation.opened) await withdraw(steward, String(o['action_id']), 'the schedule fixture is withdrawn (no policy)');
    // (ii) the policy: the restore window closed, one open per evaluation.
    const p = await declareTierPolicy(domainAdmin, { restoreHotFor: '0 seconds', maxOpensPerEvaluation: 1 });
    expect(p.policy).toMatchObject({ version: 1, max_opens_per_evaluation: 1, max_attempts: 3, budget_bytes_per_day: null, escalate_after: '7 days', restore_hot_for: '00:00:00' });
    expect(String(p.policy['policy_id'])).toMatch(UUID_RE);
    const e2 = await evaluate();
    expect(e2.evaluation.opened).toHaveLength(1);
    expect(String((e2.evaluation.opened[0]!['selector'] as Row)['manifest_id'])).toBe(mC.manifest_id);
    expect(e2.evaluation.deferred).toBe(2);
    expect((await scheduleRow(scheduleId)).last_evaluation).toMatchObject({ opened: 1, deferred: 2 });
    const e3 = await evaluate();
    expect(e3.evaluation.opened).toHaveLength(1);
    expect(String((e3.evaluation.opened[0]!['selector'] as Row)['manifest_id'])).toBe(mB.manifest_id);
    expect(e3.evaluation.deferred).toBe(1);
    expect((await scheduleRow(scheduleId)).last_evaluation).toMatchObject({ opened: 1, deferred: 1 });
    // B is due at its RESTORE instant (moved_at + restore_hot_for), not at its creation.
    expect(await latestMoveAt(mB.manifest_id, String(e3.evaluation.opened[0]!['due_from']))).toBe(true);
    expect((await actionRow(String(e3.evaluation.opened[0]!['action_id']))).state).toBe('opened');
    for (const o of [...e2.evaluation.opened, ...e3.evaluation.opened]) await withdraw(steward, String(o['action_id']), 'the schedule fixture is withdrawn (the policy)');
    for (const m of [mA, mB, mC]) expect(await tierOf(m.manifest_id)).toBe('hot');
  }, 180_000);

  it('R7 · BUDGET (admission): under budgetBytesPerDay 1 an archive of C is refused at execution — 409, the action paused infrastructure/retry with failure_reason naming budget_exhausted and the instant the window frees, attempts still 0 (the state never moved), the approvals revoked, no execution row; under budgetBytesPerDay null (version 3) it is re-resolved, re-approved and executed', async () => {
    const p2 = await declareTierPolicy(domainAdmin, { budgetBytesPerDay: 1 });
    expect(p2.policy).toMatchObject({ version: 2, budget_bytes_per_day: 1, max_opens_per_evaluation: 200, max_attempts: 3 });
    const arc = await approved(archiveOf(mC.manifest_id));
    const err = await failing(execute(steward, arc.id));
    expect(err).toMatchObject({ status: 409 });
    expect(String(err.message)).toMatch(/the execution was rolled back and the action paused: retention execution rejected \(budget_exhausted\)/);
    const row = await actionRow(arc.id);
    expect(row).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry', attempts: 0, escalated_at: null });
    expect(String(row.failure_reason)).toMatch(/^retention execution rejected \(budget_exhausted\): the domain moved \d+ bytes in the last 24 hours and this execution would move \d+ more, above the policy's 1 bytes per day; the window frees at /);
    expect(await approvalsLive(arc.id)).toBe(0);
    expect(await executions(arc.id)).toEqual([]);
    expect((await eventDetails(arc.id, 'action.paused')).at(-1)).toMatchObject({ failure_class: 'infrastructure', approvals_revoked: true, attempted: false, attempts: 0 });
    expect(await tierOf(mC.manifest_id)).toBe('hot');
    expect(await vault.exists('archive', scope(), mC.locator)).toBe(false); expect(await stagedInBoth(mC.locator)).toEqual({ evidence: [], archive: [] });
    expect((await tierState(steward)).state.budget).toMatchObject({ bytes_per_day: 1, remaining: 0 });
    const p3 = await declareTierPolicy(domainAdmin, { budgetBytesPerDay: null });
    expect(p3.policy).toMatchObject({ version: 3, budget_bytes_per_day: null });
    const again = await resolve(steward, arc.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await approve(authority, arc.id, String(again.scope['scope_digest']));
    expect((await execute(steward, arc.id)).execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mC.locator], failed: [] } });
    expect((await verify(steward, arc.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect(await actionRow(arc.id)).toMatchObject({ state: 'verified', attempts: 1 });
    expect(await tierOf(mC.manifest_id)).toBe('archive');
  }, 180_000);

  it('R8 · RETRIES and ESCALATION: under maxAttempts 1 an archive of a fresh upload D whose hot bytes are corrupt pauses (infrastructure/retry) with attempts 1; the bytes restored, re-resolved and re-approved, its execution is refused (attempts_exhausted) and the action ESCALATED — 409, state paused, disposition human_review, escalated_at set, action.escalated on record, the approvals revoked, tier/state counting escalated 1; re-resolved, attempts is 0 and escalated_at null with attempts_reset true in the resolution\'s summary and event; approved and executed. Then ESCALATION BY AGE under escalateAfter 0 seconds: an archive of a fresh upload E paused by a corrupt copy is escalated by the next schedule evaluation, which names it', async () => {
    const p4 = await declareTierPolicy(domainAdmin, { maxAttempts: 1 });
    expect(p4.policy).toMatchObject({ version: 4, max_attempts: 1, budget_bytes_per_day: null });
    const [evdD] = await upload(['b12-d']);
    mD = await manifestRow((await manifestOf(evdD!.id, 1)).manifest_id);
    const arc = await approved(archiveOf(mD.manifest_id));
    const originalD = await bytesOf('evidence', mD);
    await vault.overwriteForIntegrityTest('evidence', scope(), mD.locator, Buffer.from('corrupted for the R8 case'));
    // Attempt 1: the copy refused on the digest, the execution rolled back after it began — the attempt counted where the pause is recorded (C2).
    const err1 = await failing(execute(steward, arc.id));
    expect(err1).toMatchObject({ status: 409 });
    let row = await actionRow(arc.id);
    expect(row).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry', attempts: 1, escalated_at: null });
    expect(String(row.failure_reason)).toMatch(/1 item\(s\) refused at execution/);
    expect((await eventDetails(arc.id, 'action.paused')).at(-1)).toMatchObject({ failure_class: 'infrastructure', attempted: true, attempts: 1 });
    expect(await executions(arc.id)).toEqual([]);
    await vault.overwriteForIntegrityTest('evidence', scope(), mD.locator, originalD);
    // Re-resolved (not escalated: the count stands), re-approved: the second execution is refused before the state moves and the action escalated.
    const r = await resolve(steward, arc.id);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    expect(r.scope['attempts_reset']).not.toBe(true);
    expect((await actionRow(arc.id)).attempts).toBe(1);
    await approve(authority, arc.id, String(r.scope['scope_digest']));
    const err2 = await failing(execute(steward, arc.id));
    expect(err2).toMatchObject({ status: 409 });
    expect(String(err2.message)).toMatch(/the execution was refused and the action escalated: retention execution rejected \(attempts_exhausted\)/);
    row = await actionRow(arc.id);
    expect(row).toMatchObject({ state: 'paused', disposition: 'human_review', failure_class: 'infrastructure', attempts: 1 });
    expect(row.escalated_at).not.toBeNull();
    expect(String(row.failure_reason)).toMatch(/^retention execution rejected \(attempts_exhausted\): 1 attempt\(s\) were made under a policy allowing 1; the action is escalated for human review \(a re-resolution restarts the count\)/);
    expect(await approvalsLive(arc.id)).toBe(0);
    expect(await events(arc.id)).toContain('action.escalated');
    expect((await eventDetails(arc.id, 'action.escalated')).at(-1)).toMatchObject({ attempts: 1, approvals_revoked: true });
    expect(String((await eventDetails(arc.id, 'action.escalated')).at(-1)!['reason'])).toMatch(/attempts_exhausted/);
    expect(await executions(arc.id)).toEqual([]);
    expect(await tierOf(mD.manifest_id)).toBe('hot');
    expect(await vault.exists('evidence', scope(), mD.locator)).toBe(true); expect(await vault.exists('archive', scope(), mD.locator)).toBe(false);
    expect((await tierState(steward)).state.actions).toMatchObject({ escalated: 1, paused_human_review: 1, paused_retry: 0, executing: 0 });
    // A human review restarts the retry budget (D4): the re-resolution of an escalated action resets the count and says so.
    const again = await resolve(steward, arc.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1, attempts_reset: true });
    expect(await actionRow(arc.id)).toMatchObject({ state: 'scope_resolved', attempts: 0, escalated_at: null });
    expect((await eventDetails(arc.id, 'scope.resolved')).at(-1)).toMatchObject({ attempts_reset: true });
    expect((await tierState(steward)).state.actions).toMatchObject({ escalated: 0, paused_human_review: 0 });
    await approve(authority, arc.id, String(again.scope['scope_digest']));
    expect((await execute(steward, arc.id)).execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mD.locator], failed: [] } });
    expect((await verify(steward, arc.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect(await actionRow(arc.id)).toMatchObject({ state: 'verified', attempts: 1, escalated_at: null });
    expect(await tierOf(mD.manifest_id)).toBe('archive');
    // ESCALATION BY AGE: paused for retry longer than escalate_after (0 seconds here), escalated by the evaluation — named in its answer.
    const p5 = await declareTierPolicy(domainAdmin, { escalateAfter: '0 seconds' });
    expect(p5.policy).toMatchObject({ version: 5, max_attempts: 3, escalate_after: '00:00:00', restore_hot_for: '30 days' });
    const [evdE] = await upload(['b12-e']);
    mE = await manifestRow((await manifestOf(evdE!.id, 1)).manifest_id);
    const arcE = await approved(archiveOf(mE.manifest_id));
    const originalE = await bytesOf('evidence', mE);
    await vault.overwriteForIntegrityTest('evidence', scope(), mE.locator, Buffer.from('corrupted for the R8 escalation-by-age case'));
    expect(await failing(execute(steward, arcE.id))).toMatchObject({ status: 409 });
    await vault.overwriteForIntegrityTest('evidence', scope(), mE.locator, originalE);
    expect(await actionRow(arcE.id)).toMatchObject({ state: 'paused', disposition: 'retry', failure_class: 'infrastructure', attempts: 1, escalated_at: null });
    const e = await evaluate();
    expect(e.evaluation.escalated.map((x) => String(x['action_id']))).toEqual([arcE.id]);
    expect(e.evaluation.escalated[0]).toMatchObject({ kind: 'archive' });
    expect(String(e.evaluation.escalated[0]!['reason'])).toMatch(/^escalated by the cold-tier manager: paused for retry since .+, longer than the policy's escalate_after /);
    // The schedule of R6 is still active: A and B are inside the restore window again (the defaults' 30 days), C and D are cold, E has its open action — nothing else opens.
    expect(e.evaluation.opened).toEqual([]);
    const rowE = await actionRow(arcE.id);
    expect(rowE).toMatchObject({ state: 'paused', disposition: 'human_review', failure_class: 'infrastructure', attempts: 1 });
    expect(rowE.escalated_at).not.toBeNull();
    expect(await events(arcE.id)).toContain('action.escalated');
    expect((await eventDetails(arcE.id, 'action.escalated')).at(-1)).toMatchObject({ attempts: 1, approvals_revoked: true });
    expect(await approvalsLive(arcE.id)).toBe(0);
    expect(await tierOf(mE.manifest_id)).toBe('hot');
    expect(await retrieval('evidence', mE.locator, mE.content_digest)).toEqual({ ok: true });
    escalatedByAgeId = arcE.id;
  }, 300_000);

  it('R9 · OBSERVABLE STATE: tier/state reports the policy in force (declared, version 5), the manifests and bytes per tier as the ledger has them, the moves of the last 24 h and the budget used as the bytes moved, the actions by state (escalated 1), the restored manifests awaiting re-archive (A, B), the schedule with its last evaluation, the vault inventory of both roots (evidence blobs ≥ 1, no staged, no temp); the steward and the analyst may read it (retention.read); tier/declare by the steward is refused 403 (the PDP) and an invalid interval 422', async () => {
    const { state } = await tierState(steward);
    expect(state.policy).toMatchObject({ declared: true, version: 5, budget_bytes_per_day: null, max_opens_per_evaluation: 200, max_attempts: 3, escalate_after: '00:00:00', restore_hot_for: '30 days' });
    const counts = await tierCounts();
    expect(state.tiers).toEqual(counts);
    expect(counts.hot.manifests).toBe(3); // A, B (restored), E (never moved)
    expect(counts.archive.manifests).toBe(2); // C, D
    const moves = await moves24h();
    expect(state.moves_24h).toEqual(moves);
    expect(moves.archived.count).toBe(5); // R0 ×2, R5, R7, R8
    expect(moves.restored.count).toBe(3); // R2 ×2, R5
    expect(state.budget).toEqual({ bytes_per_day: null, used_24h: moves.archived.bytes + moves.restored.bytes, remaining: null, window_resets_at: expect.any(String) });
    expect(state.actions).toEqual({ executing: 0, paused_retry: 0, paused_human_review: 1, escalated: 1, pending_bytes_residuals: 0 });
    expect(state.restored_awaiting_rearchive).toBe(2);
    const sch = state.schedules.find((x) => x['schedule_id'] === scheduleId)!;
    expect(sch).toMatchObject({ action_kind: 'archive', retention_profile: mA.retention_profile, state: 'active' });
    expect(sch['last_evaluation']).toMatchObject({ opened: 0, deferred: 0 });
    expect(sch['last_evaluated_at']).not.toBeNull();
    expect(state.vault.evidence.blobs).toBeGreaterThanOrEqual(1);
    expect(state.vault.evidence).toMatchObject({ staged: 0, temp: 0 });
    expect(state.vault.archive.blobs).toBeGreaterThanOrEqual(2);
    expect(state.vault.archive).toMatchObject({ staged: 0, temp: 0 });
    // The read is retention.read: the analyst reads the same state.
    expect((await tierState(analyst)).state).toMatchObject({ policy: { declared: true, version: 5 }, actions: { escalated: 1 } });
    // The declaration is the domain admin's (retention.tier.declare): the steward is refused by the PDP; the policy in force is unchanged.
    await expect(declareTierPolicy(steward, { maxAttempts: 2 })).rejects.toMatchObject({ status: 403 });
    expect((await tierState(steward)).state.policy.version).toBe(5);
    // The route's own validation: an interval that is not one.
    await expect(declareTierPolicy(domainAdmin, { escalateAfter: 'soon' })).rejects.toMatchObject({ status: 422 });
    expect((await tierState(steward)).state.policy.version).toBe(5);
    // The escalated action of R8 is withdrawn (its fixture stays hot); no route retires a schedule — retired here so the file's later cases evaluate nothing.
    await withdraw(steward, escalatedByAgeId, 'the escalation fixture is withdrawn');
    await sql`update retention.schedules set state = 'retired' where schedule_id = ${scheduleId}::uuid`.execute(su);
    expect((await tierState(steward)).state.actions).toMatchObject({ escalated: 0, paused_human_review: 0 });
  }, 120_000);
});

describe('S · THE SWEEPER\'S WALK and THE RETRY ROUTE of a restore (D6, C17/C18; D2, C4/C5/C15)', () => {
  it('R10 · the sweeper walks BOTH roots and knows the staged names: in the archive root — (a) a redundant staged copy beside an archived manifest\'s published copy, (b) a temp file older than a minute, (c) a plain orphan, (d) a staged copy of a HOT manifest older than the run timeout whose hot copy verifies, (e) a young one; in the evidence root — (f) a redundant staged copy beside a verified hot copy, (g) a young staged copy of an ARCHIVED manifest: stagedCopiesRemoved 3 (a, d, f), stagedCopiesKept 2 (e, g), tempFilesRemoved 1 (b), archiveOrphanCandidates 1 (c), no evidence-root orphan (the staged names are not plain orphans); the files on disk as classified, the published copies untouched; a second sweep changes nothing', async () => {
    const archiveDir = join(vault.rootFor('archive'), T(), D()); const evidenceDir = join(vault.rootFor('evidence'), T(), D());
    const old = new Date(Date.now() - 120_000);
    const plant = (dir: string, name: string, bytes: Buffer, mtime: Date | null): string => {
      const p = join(dir, name); writeFileSync(p, bytes);
      if (mtime !== null) utimesSync(p, mtime, mtime);
      return p;
    };
    // C and D are cold (R7, R8); A and B are hot (restored); E is hot and never moved.
    expect([await tierOf(mC.manifest_id), await tierOf(mD.manifest_id), await tierOf(mA.manifest_id), await tierOf(mB.manifest_id)]).toEqual(['archive', 'archive', 'hot', 'hot']);
    const a = plant(archiveDir, `${basenameOf(mC.locator)}.staging-${uuidv7()}`, await bytesOf('archive', mC), null);
    const b = plant(archiveDir, `${uuidv7()}.tmp-${uuidv7()}`, Buffer.from('an interrupted write, never named by a locator'), old);
    const cName = uuidv7(); const c = plant(archiveDir, cName, Buffer.from('bytes under the archive root with no manifest row'), null);
    const d = plant(archiveDir, `${basenameOf(mA.locator)}.staging-${uuidv7()}`, await bytesOf('evidence', mA), old);
    const e = plant(archiveDir, `${basenameOf(mA.locator)}.staging-${uuidv7()}`, await bytesOf('evidence', mA), null);
    const f = plant(evidenceDir, `${basenameOf(mB.locator)}.staging-${uuidv7()}`, await bytesOf('evidence', mB), null);
    const g = plant(evidenceDir, `${basenameOf(mD.locator)}.staging-${uuidv7()}`, await bytesOf('archive', mD), null);
    try {
      const first = await sweep();
      expect(first).toMatchObject({ stagedCopiesRemoved: 3, stagedCopiesKept: 2, tempFilesRemoved: 1, archiveOrphanCandidates: 1, orphanCandidates: 0 });
      // The orphan is recorded and kept; nothing is recorded as an integrity incident (every published copy verifies) and no archive copy is stale.
      expect(first.poisonItems.filter((p) => p.kind === 'staged_copy_kept' || p.kind === 'stale_archive_copy')).toEqual([]);
      // The archive root's orphan is recorded with its root named (an operator reads which volume holds the bytes); the evidence root's keeps the bare locator.
      expect(first.poisonItems.some((p) => /orphan_candidate/.test(p.kind) && p.ref === `archive/${T()}/${D()}/${cName}`)).toBe(true);
      for (const gone of [a, b, d, f]) expect(existsSync(gone), `removed: ${basename(gone)}`).toBe(false);
      for (const kept of [c, e, g]) expect(existsSync(kept), `kept: ${basename(kept)}`).toBe(true);
      expect(await retrieval('evidence', mA.locator, mA.content_digest)).toEqual({ ok: true });
      expect(await retrieval('evidence', mB.locator, mB.content_digest)).toEqual({ ok: true });
      expect(await retrieval('archive', mC.locator, mC.content_digest)).toEqual({ ok: true });
      expect(await retrieval('archive', mD.locator, mD.content_digest)).toEqual({ ok: true });
      // The vault's own listing agrees (exact on the staged name — a temp is never a staged copy, C17).
      expect(await vault.stagedCopiesIn('archive', scope(), mA.locator)).toEqual([basename(e)]);
      expect(await vault.stagedCopiesIn('evidence', scope(), mD.locator)).toEqual([basename(g)]);
      expect(await stagedInBoth(mC.locator)).toEqual({ evidence: [], archive: [] });
      expect(await stagedInBoth(mB.locator)).toEqual({ evidence: [], archive: [] });
      expect((await tierState(steward)).state.vault).toMatchObject({ evidence: { staged: 1, temp: 0 }, archive: { staged: 1, temp: 0 } });
      // Idempotent: the second sweep removes nothing, keeps the same two, reports the same orphan; the pre-existing counts do not grow.
      const second = await sweep();
      expect(second).toMatchObject({ stagedCopiesRemoved: 0, stagedCopiesKept: 2, tempFilesRemoved: 0, archiveOrphanCandidates: 1, orphanCandidates: first.orphanCandidates });
      expect(second.expiredCases).toBeLessThanOrEqual(first.expiredCases);
      expect(second.failedRuns).toBeLessThanOrEqual(first.failedRuns);
      expect(second.pendingTombstones).toBeLessThanOrEqual(first.pendingTombstones);
      expect(second.poisonItems.length).toBe(first.poisonItems.length);
      for (const kept of [c, e, g]) expect(existsSync(kept), `still kept: ${basename(kept)}`).toBe(true);
    } finally {
      for (const p of [a, b, c, d, e, f, g]) rmSync(p, { force: true });
    }
    expect(await stagedInBoth(mA.locator)).toEqual({ evidence: [], archive: [] });
    expect(await stagedInBoth(mD.locator)).toEqual({ evidence: [], archive: [] });
    expect((await tierState(steward)).state.vault).toMatchObject({ evidence: { staged: 0, temp: 0 }, archive: { staged: 0, temp: 0 } });
  }, 120_000);

  it('R11 · the RETRY ROUTE for a restore: with the hot publish failing after the commit (b12.restore_publish_fail), the archive copy is kept, the hot copy stays staged, a pending bytes_present residual is recorded and the execution answers with the locator failed; the evidence still serves — tier hot, served_from staged — and its availability reads hot; the verification refuses while the archive copy stands; the execute route on the executed action publishes the staged copy and removes the archive copy; the verification passes and the residual closes', async () => {
    expect(await tierOf(mC.manifest_id)).toBe('archive');
    const r = await approved(restoreOf(mC.manifest_id));
    expect(r.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    fault.arm(['b12.restore_publish_fail'], 'test');
    let ex: Awaited<ReturnType<typeof execute>>;
    try { ex = await execute(steward, r.id); } finally { fault.disarm(); }
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0, published: 0 });
    expect(ex.execution.bytes).toEqual({ removed: [], failed: [mC.locator] });
    // The record committed (the tier hot, the execution row done); the bytes are where the failed publish left them.
    expect(await tierOf(mC.manifest_id)).toBe('hot');
    expect((await executions(r.id)).map((x) => [x.port, x.outcome])).toEqual([['observation.restore_blob', 'done']]);
    expect((await executions(r.id))[0]!.evidence).toMatchObject({ copy_created: true, staged: true, already_restored: false });
    expect(await vault.exists('archive', scope(), mC.locator)).toBe(true);
    expect(await vault.exists('evidence', scope(), mC.locator)).toBe(false);
    expect(await vault.stagedCopiesIn('evidence', scope(), mC.locator)).toHaveLength(1);
    expect(await vault.stagedCopiesIn('archive', scope(), mC.locator)).toEqual([]);
    expect((await residuals(r.id)).find((x) => x.kind === 'bytes_present')).toMatchObject({ status: 'pending' });
    expect((await actionRow(r.id)).state).toBe('executed');
    expect((await tierState(steward)).state.actions).toMatchObject({ pending_bytes_residuals: 1 });
    // The evidence still serves: the staged copy under the digest, the tier ledger standing (D2); the availability reads hot (C12).
    const dl = await download(analyst, evdC.id);
    expect(dl.download).toMatchObject({ contentDigest: mC.content_digest, tier: 'hot', availability: 'verified', integrity: 'verified' });
    expect(sha256(Buffer.from(dl.download.base64, 'base64'))).toBe(mC.content_digest);
    expect((await custody(mC.manifest_id, 'custody.retrieved'))[0]!.details).toMatchObject({ tier: 'hot', served_from: 'staged' });
    expect((await getEvidence(analyst, evdC.id)).availability).toEqual({ tier: 'hot', state: 'hot' });
    // Verification before the retry: the archive copy present and a staged copy in the hot root — the contract refuses; the residual stays pending (C5).
    const v0 = await verify(steward, r.id);
    expect(v0.verification).toMatchObject({ verified: false, state: 'executed' });
    const refused = (await verifications(r.id)).find((c) => !c.passed)!;
    expect(refused.observed).toMatchObject({ tier: 'hot', archive_present: true, staged_copies: true });
    expect((await residuals(r.id)).find((x) => x.kind === 'bytes_present')).toMatchObject({ status: 'pending' });
    // The designed operator step: the execute route on the executed action publishes first, then removes the archive copy.
    const rt = await retry(steward, r.id);
    expect(rt.execution).toMatchObject({ retried: true, pending: 1, bytes: { removed: [mC.locator], failed: [] } });
    // A second retry before the verification finds the publish done and nothing left to remove; the residual is verification's to close.
    expect((await retry(steward, r.id)).execution).toMatchObject({ retried: true, pending: 1, bytes: { removed: [], failed: [] } });
    expect(await vault.exists('evidence', scope(), mC.locator)).toBe(true);
    expect(await vault.exists('archive', scope(), mC.locator)).toBe(false);
    expect(await stagedInBoth(mC.locator)).toEqual({ evidence: [], archive: [] });
    expect(await retrieval('evidence', mC.locator, mC.content_digest)).toEqual({ ok: true });
    const v = await verify(steward, r.id);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await verifications(r.id)).filter((c) => c.passed).at(-1)!.observed).toMatchObject({ tier: 'hot', bytes_present: true, hot_digest_ok: true, archive_present: false, staged_copies: false, restored: true });
    expect((await residuals(r.id)).find((x) => x.kind === 'bytes_present')).toMatchObject({ status: 'retained_by_policy' });
    expect((await tierState(steward)).state.actions).toMatchObject({ pending_bytes_residuals: 0 });
    // Served from the published copy now.
    expect((await download(analyst, evdC.id)).download).toMatchObject({ contentDigest: mC.content_digest, tier: 'hot', availability: 'verified', integrity: 'verified' });
    expect((await custody(mC.manifest_id, 'custody.retrieved'))[0]!.details).toMatchObject({ tier: 'hot', served_from: 'published' });
    // A retry of a VERIFIED action is refused by the execute port itself (only an approved action executes; an executed one is retried) — the
    // route's retry path is the executed state's alone, and a verified action has no pending residual left to retry.
    await expect(retry(steward, r.id)).rejects.toThrow(/is verified — only an approved action executes/);
  }, 180_000);
});
