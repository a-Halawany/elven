/**
 * CP-6 B11 CLOSURE (migration 0071; Codex's bounded review at 1e3e4be — B11-F1 and B11-F2), on a real database and an
 * ISOLATED vault: the four roots of this run live under one temporary directory (set before the application boots — nothing
 * of the workspace's vault is read or written), so an archive's copies, the hot removals and the rollback cleanups of these
 * cases touch this run's bytes alone.
 *
 *   F1 · OVERLAPPING ARCHIVE ACTIONS (0071 §1) — the interleaving Codex named, run through the governed path with two
 *   executions in flight on the same manifest: A (over P and Q) copies P into the archive tier and is HELD before the move is
 *   recorded; B (over P alone), approved on the same hot manifest, starts meanwhile. Before 0071, B found A's copy in place,
 *   adopted it (`copy_created: false`), recorded the move, committed and removed the hot copy — and A, failing on Q, rolled
 *   back and removed the copy it had created: P's bytes gone from both tiers under B's committed record. After 0071 the
 *   manifests an execution moves are LOCKED for the whole transaction (begin_execution takes the domain's movers lock and
 *   each executable manifest's advisory lock in a canonical order; the archive port refuses to record a move for a manifest
 *   the transaction does not hold) and a copy is STAGED under the execution attempt's own name until the commit that records
 *   the move — adoptable by no one, removed by no one else — so B is held back until A's staged copy is gone and then makes
 *   its own. The serial control and
 *   the already-committed-copy control (A9 of the B11 harness) keep their behaviour; the failure record and the retry stay; and the
 *   overlap that SUCCEEDS — the execution that finds the manifest archived under the lock records the move as already made (no copy
 *   from a hot file the mover removed), both actions execute and verify, one tier record. And the lock's END: a copy is STAGED under its
 *   execution ATTEMPT's own name until the commit that records the move and published under the locator only after it, so an uncommitted
 *   copy is adoptable by no one and a rollback removes only its own attempt's files — whatever became of the transaction's locks meanwhile: a session
 *   terminated after the copy (the locks gone with the backend), or a statement cancelled mid-record (PostgreSQL releases a transaction's
 *   locks at the abort itself; the execution runs in a subtransaction so the failure is still recorded) — B makes its own copy either way,
 *   and A's cleanup removes only A's staged file; a SECOND ATTEMPT of the same action, admitted after the first's backend was lost, owns
 *   its own staged file and the first's late cleanup cannot touch it; the controller keeps the verdict when the rollback itself fails and
 *   pauses the action on a fresh connection, naming a pause that is refused.
 *
 *   F2 · THE CUSTOMER'S VERIFIER FAILS CLOSED — a manifest that is not a JSON object (null, a list, a scalar), a missing
 *   manifest, a manifest without its object list or signature block: exit 1, `ok: false`, `complete: false`, the text verdict
 *   PACKAGE FAILED; an expected package digest that could not be compared is a failed check of its own; the valid package
 *   (a synthetic one built with the product's own digest helpers) and the tampered package keep their verdicts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { EXPORT_FORMAT, SIGNATURE_SCHEME, objectsDigestOf, packageDigestOf } from '../../src/retention/export-package.js';
import { contentDigest } from '@eye/contracts';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The ISOLATED vault of this run: all four roots under one temporary directory, set before the application reads its configuration.
const VAULT_DIR = mkdtempSync(join(tmpdir(), 'eye-b11-closure-vault-'));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

/** Every temporary directory this file creates, removed in afterAll. */
const tempDirs: string[] = [VAULT_DIR];
const execFile = promisify(execFileCb);
const VERIFIER = resolvePath(__dirname, '../../../../scripts/retention/verify-export.mjs');

let h: Phase4Harness; let observation: ObservationController; let retention: RetentionController; let vault: VaultService; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── the rows ───────────── */
type Action = { action_id: string; state: string; kind: string; failure_class: string | null; disposition: string | null; failure_reason: string | null };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, failure_class, disposition, failure_reason from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; locator: string; content_digest: string; byte_length: number }>`select manifest_id::text, locator, content_digest, byte_length::int from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const tierOf = async (manifestId: string) => (await sql<{ t: string }>`select observation.manifest_tier(${manifestId}::uuid) t`.execute(su)).rows[0]!.t;
const tierRecords = async (manifestId: string) => (await sql<{ action_id: string; tier: string }>`select action_id::text, tier from observation.blob_tier_records where manifest_id = ${manifestId}::uuid order by moved_at`.execute(su)).rows;
const executions = async (id: string) => (await sql<{ port: string; outcome: string; evidence: Record<string, unknown> }>`select port, outcome, evidence from retention.executions where action_id = ${id}::uuid order by executed_at`.execute(su)).rows;
const approvalsLive = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is null`.execute(su)).rows[0]!.n;
const events = async (id: string) => (await sql<{ event: string }>`select event from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);

/* ───────────── the routes ───────────── */
const open = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Record<string, unknown> }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved' } }) as Promise<{ approval: { approvalId: string } }>;
type Execution = { executed: number; held: number; refused: number; bytes: { removed: string[]; failed: string[] } };
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Execution }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Record<string, unknown> }>;
const download = (p: AuthenticatedPrincipal, evdId: string) => observation.downloadEvidence(h.req(p, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId) as Promise<{ download: { contentDigest: string; byteLength: number; integrity: string; tier: string; availability: string } }>;
const approved = async (payload: Record<string, unknown>): Promise<{ id: string; digest: string; scope: Record<string, unknown> }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  const digest = String(r.scope['scope_digest']);
  await approve(authority, o.action.actionId, digest);
  return { id: o.action.actionId, digest, scope: r.scope };
};
/** One upload run per manifest, so the manifests' creation instants order them (the resolution orders by created_at, then id): P before Q. */
const uploadOne = async (name: string) => (await h.upload([{ filename: `${name}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${name})`), documentTime: '2024-01-14T00:00:00Z' }], 'internal', name))[0]!;
/** The failing execution's outcome, as a value: the 409 of the pause, never a resolved promise. */
const failing = (p: Promise<unknown>) => p.then(() => { throw new Error('the execution should have been rolled back'); }, (e: unknown) => e as { status?: number; message?: string });
/** A retrieval from the archive tier as a verdict, so a failed assertion names the vault's reason (missing, corrupt). */
const archiveRetrieval = (locator: string, digest: string) => vault.read('archive', scope(), locator, digest).then(() => ({ ok: true }), (e: { reason?: string }) => ({ ok: false, reason: e.reason ?? 'unknown' }));

async function waitFor<X>(what: string, probe: () => Promise<X>, okp: (x: X) => boolean, ms = 10_000): Promise<X> {
  const until = Date.now() + ms; let last: X;
  for (;;) { last = await probe(); if (okp(last)) return last; if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 500)}`); await sleep(100); }
}
/** The backends holding P's exclusive manifest lock (0071 §1), by the same pg_locks derivation the port uses. */
const holdersOf = async (manifestId: string) => (await sql<{ pid: number }>`select l.pid from pg_locks l where l.locktype = 'advisory' and l.mode = 'ExclusiveLock' and l.granted and l.objsubid = 1
  and l.classid = ((retention.lock_key_manifest(${manifestId}::uuid) >> 32) & 4294967295)::oid and l.objid = (retention.lock_key_manifest(${manifestId}::uuid) & 4294967295)::oid`.execute(su)).rows.map((r) => r.pid);

/** Two hot manifests P and Q; A approved over both (P first), B over P alone; Q's hot bytes corrupted so A's copy of Q is refused after P's copy was made. */
async function twoActionsOnP(prefix: string) {
  const evdP = await uploadOne(`${prefix}-p`); const evdQ = await uploadOne(`${prefix}-q`);
  const mP = await manifestRow((await manifestOf(evdP.id, 1)).manifest_id); const mQ = await manifestRow((await manifestOf(evdQ.id, 1)).manifest_id);
  const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id, mQ.manifest_id] } });
  expect(a.scope).toMatchObject({ state: 'scope_resolved', execute: 2 });
  const b = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
  expect(b.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
  const originalQ = (await vault.read('evidence', scope(), mQ.locator, mQ.content_digest)).bytes;
  await vault.overwriteForIntegrityTest('evidence', scope(), mQ.locator, Buffer.from(`corrupted for the ${prefix} case`));
  const restoreQ = () => vault.overwriteForIntegrityTest('evidence', scope(), mQ.locator, originalQ);
  return { evdP, evdQ, mP, mQ, a, b, restoreQ };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  observation = h.app.get(O); retention = h.app.get(R); vault = h.app.get(VaultService);
  await vault.ensureRoots();
  su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b11c-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b11c-retention-authority', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'b11c-analyst');
}, 300_000);

afterAll(async () => {
  fault.disarm();
  await h?.close();
  await su?.destroy();
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
}, 120_000);

describe('F1 · overlapping archive actions on one manifest (0071 §1; Codex B11-F1)', () => {
  it('the interleaving Codex named, through the governed path: A copies P and is held before the move is recorded; B (approved on P) starts meanwhile and is held back by the lock; A fails on Q, removes its copy inside the transaction, rolls back and pauses (infrastructure → retry); B then makes ITS OWN copy, records the move, commits and removes the hot copy — B\'s committed evidence is served from the archive tier and verifies; A resolved again executes Q', async () => {
    const { evdP, mP, mQ, a, b, restoreQ } = await twoActionsOnP('ovl');
    const held = fault.hold('b11.archive_after_copy_before_record', 'test');
    const pA = failing(execute(steward, a.id));
    await held.reached;
    // A's copy of P is STAGED under A's own name (0071) — not under the locator, adoptable by no one; the move is not recorded; the hot copy is in place.
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(1);
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(false);
    expect(await tierOf(mP.manifest_id)).toBe('hot');
    // B starts now — its own transaction on its own connection, against the same manifest.
    let bDone = false;
    const pB = execute(steward, b.id).then((r) => { bDone = true; return r; });
    await sleep(2_000);
    const bHeldBackWhileACopyUnrecorded = !bDone;
    held.release();
    const errA = await pA;
    const exB = await pB;
    // THE BYTES: P is served from the archive tier under B's committed record — the copy is B's own, not one A removed.
    expect(await tierOf(mP.manifest_id)).toBe('archive');
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(true);
    expect(await vault.exists('evidence', scope(), mP.locator)).toBe(false);
    expect((await download(analyst, evdP.id)).download).toMatchObject({ contentDigest: mP.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect(exB.execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
    expect((await executions(b.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true, already_archived: false, locator: mP.locator });
    expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: b.id, tier: 'archive' }]);
    // THE LOCK: B did not run while A's copy was unrecorded.
    expect(bHeldBackWhileACopyUnrecorded).toBe(true);
    // A: rolled back whole after it began — no execution row, no tier record of its own, its copy gone with it; paused for a retry with the approvals revoked; the failure on record.
    expect(errA).toMatchObject({ status: 409 });
    expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry' });
    expect(String((await actionRow(a.id)).failure_reason)).toMatch(/1 item\(s\) refused at execution/);
    expect(await approvalsLive(a.id)).toBe(0);
    expect(await executions(a.id)).toEqual([]);
    expect(await events(a.id)).toContain('action.paused');
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(0);
    expect(await vault.exists('evidence', scope(), mQ.locator)).toBe(true); expect(await vault.exists('archive', scope(), mQ.locator)).toBe(false);
    // B verifies against the archive contract.
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    // THE RETRY: Q's bytes restored, A resolved again — P is already cold (excluded), Q executes and verifies.
    await restoreQ();
    const again = await resolve(steward, a.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1, excluded: 1 });
    await approve(authority, a.id, String(again.scope['scope_digest']));
    expect((await execute(steward, a.id)).execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mQ.locator], failed: [] } });
    expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true });
    expect(await tierOf(mQ.manifest_id)).toBe('archive');
  }, 180_000);

  it('the lock spans the CLEANUP boundary: A, failed on Q, is held inside its rollback cleanup with its copy of P still under the archive root and its transaction open; B, started meanwhile, is still held back; released, A removes its copy and rolls back, and B makes its own copy', async () => {
    const { mP, a, b, restoreQ } = await twoActionsOnP('cln');
    const held = fault.hold('b11.archive_cleanup_before_remove', 'test');
    const pA = failing(execute(steward, a.id));
    await held.reached;
    // A failed after it began; its staged copy of P is still there; nothing is committed, nothing published.
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(1);
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(false);
    expect(await tierOf(mP.manifest_id)).toBe('hot');
    let bDone = false;
    const pB = execute(steward, b.id).then((r) => { bDone = true; return r; });
    await sleep(2_000);
    const bHeldBackDuringCleanup = !bDone;
    held.release();
    const errA = await pA;
    const exB = await pB;
    expect(errA).toMatchObject({ status: 409 });
    expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure' });
    expect(exB.execution).toMatchObject({ executed: 1, refused: 0 });
    expect((await executions(b.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true, already_archived: false });
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: b.id, tier: 'archive' }]);
    expect(bHeldBackDuringCleanup).toBe(true);
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true });
    await restoreQ();
  }, 180_000);

  it('the OVERLAP THAT SUCCEEDS: two approved archives naming the same hot manifest — serially (B moves P, then A finds P archived under the lock, verifies the archive copy and records the move as already made without a copy, and archives Q) and CONCURRENTLY (the lock orders them; exactly one makes the copy and the move) — both execute, both verify, one tier record, the bytes served from the archive tier', async () => {
    // (i) serial: B first, then A over P and Q.
    {
      const evdP = await uploadOne('win-p'); const evdQ = await uploadOne('win-q');
      const mP = await manifestRow((await manifestOf(evdP.id, 1)).manifest_id); const mQ = await manifestRow((await manifestOf(evdQ.id, 1)).manifest_id);
      const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id, mQ.manifest_id] } });
      const b = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
      expect((await execute(steward, b.id)).execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
      expect(await vault.exists('evidence', scope(), mP.locator)).toBe(false);
      const exA = await execute(steward, a.id);
      expect(exA.execution).toMatchObject({ executed: 2, refused: 0 });
      const evP = (await executions(a.id)).find((r) => r.evidence['locator'] === mP.locator)!;
      expect(evP).toMatchObject({ port: 'observation.archive_blob', outcome: 'done' });
      expect(evP.evidence).toMatchObject({ already_archived: true, copy_created: false, tier_record_id: null, digest_verified: true });
      expect((await executions(a.id)).find((r) => r.evidence['locator'] === mQ.locator)!.evidence).toMatchObject({ already_archived: false, copy_created: true });
      expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: b.id, tier: 'archive' }]);
      expect(await tierOf(mQ.manifest_id)).toBe('archive');
      expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
      expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true, state: 'verified' });
      expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true, state: 'verified' });
      expect((await download(analyst, evdP.id)).download).toMatchObject({ contentDigest: mP.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    }
    // (ii) concurrent: both executions started together; the lock decides the order.
    {
      const evdP = await uploadOne('con-p'); const evdQ = await uploadOne('con-q');
      const mP = await manifestRow((await manifestOf(evdP.id, 1)).manifest_id); const mQ = await manifestRow((await manifestOf(evdQ.id, 1)).manifest_id);
      const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id, mQ.manifest_id] } });
      const b = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
      const [exA, exB] = await Promise.all([execute(steward, a.id), execute(steward, b.id)]);
      expect(exA.execution).toMatchObject({ executed: 2, refused: 0 }); expect(exB.execution).toMatchObject({ executed: 1, refused: 0 });
      const evA = (await executions(a.id)).find((r) => r.evidence['locator'] === mP.locator)!.evidence; const evB = (await executions(b.id)).find((r) => r.evidence['locator'] === mP.locator)!.evidence;
      expect([evA['copy_created'], evB['copy_created']].sort()).toEqual([false, true]);
      expect([evA['already_archived'], evB['already_archived']].sort()).toEqual([false, true]);
      expect((await tierRecords(mP.manifest_id)).length).toBe(1);
      expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
      expect(await vault.exists('evidence', scope(), mP.locator)).toBe(false);
      expect(await tierOf(mQ.manifest_id)).toBe('archive');
      expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true });
      expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true });
    }
  }, 180_000);

  it('the lock ends with the BACKEND (0071, d): A is held after its copy and its session is terminated — the lock is gone, B adopts the copy, commits and removes the hot copy; released, A cannot prove its lock on its lost connection and LEAVES the copy in place; the server rolled A back; the controller keeps A\'s verdict and pauses it on a fresh connection; B\'s committed evidence is served and verifies; A resolved again executes Q', async () => {
    const { evdP, mP, mQ, a, b, restoreQ } = await twoActionsOnP('dead');
    const held = fault.hold('b11.archive_after_copy_before_record', 'test');
    const pA = failing(execute(steward, a.id));
    await held.reached;
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(1);
    // A's backend is the one holding P's lock; the superuser terminates it (an administrator's act, or a connection lost).
    const holders = await holdersOf(mP.manifest_id);
    expect(holders).toHaveLength(1);
    await sql`select pg_terminate_backend(${holders[0]!})`.execute(su);
    await waitFor('the lock released with the backend', () => holdersOf(mP.manifest_id), (p) => p.length === 0);
    // B runs whole: nothing holds P now — but A's copy is staged under A's name, not under the locator, so B makes ITS OWN copy, records the move, commits, publishes and removes the hot copy.
    const exB = await execute(steward, b.id);
    expect(exB.execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
    expect((await executions(b.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true, already_archived: false });
    expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: b.id, tier: 'archive' }]);
    // A released: its next port call fails on the lost connection; its cleanup removes its OWN staged file by name — B's published copy is untouched.
    held.release();
    const errA = await pA;
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(0);
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(true);
    expect((await download(analyst, evdP.id)).download).toMatchObject({ contentDigest: mP.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect(errA).toMatchObject({ status: 409 });
    const rowA = await actionRow(a.id);
    expect(rowA).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry' });
    expect(String(rowA.failure_reason)).toMatch(/the execution failed after it began/);
    expect(await executions(a.id)).toEqual([]);
    expect(await approvalsLive(a.id)).toBe(0);
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    // The retry: Q's bytes restored, A resolved again — P is cold (excluded), Q executes and verifies.
    await restoreQ();
    const again = await resolve(steward, a.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1, excluded: 1 });
    await approve(authority, a.id, String(again.scope['scope_digest']));
    expect((await execute(steward, a.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    expect(await tierOf(mQ.manifest_id)).toBe('archive');
    expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true });
  }, 180_000);

  it('the SUBTRANSACTION keeps the locks through an ABORT (0071, b): A\'s record of P is cancelled by the superuser mid-statement (what a statement timeout does unattended) — the error aborts the execution\'s subtransaction only; held inside its cleanup, A still holds P\'s lock and B (started meanwhile) is still waiting at its start; released, A removes its own staged copy and pauses with the cancel on record; B then makes its own copy, commits and is served', async () => {
    const evdP = await uploadOne('abt-p');
    const mP = await manifestRow((await manifestOf(evdP.id, 1)).manifest_id);
    const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
    const b = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
    // A trigger that makes every record of an execution sleep, so A's record of P is a long-running statement the superuser can cancel while A holds P's lock.
    await sql`create or replace function public.b11c_sleep_on_execution() returns trigger language plpgsql as $$ begin perform pg_sleep(12); return new; end $$`.execute(su);
    await sql`create trigger b11c_sleep before insert on retention.executions for each row execute function public.b11c_sleep_on_execution()`.execute(su);
    try {
      const pA = failing(execute(steward, a.id));
      // A is inside its record of P (the trigger sleeping), the copy made, the lock held.
      const active = await waitFor('A active in its record of P', () => sql<{ pid: number; query: string }>`select pid, query from pg_stat_activity where state = 'active' and pid <> pg_backend_pid() and query like '%retention.record_execution%'`.execute(su).then((r) => r.rows), (rows) => rows.length === 1, 30_000);
      expect(await holdersOf(mP.manifest_id)).toEqual([active[0]!.pid]);
      expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(1);
      let bDone = false;
      const pB = execute(steward, b.id).then((r) => { bDone = true; return r; });
      await sleep(1_000);
      // The cancel: a top-level SQL error inside the execution — the subtransaction aborts, the manifests' locks taken before it stay held.
      const heldInCleanup = fault.hold('b11.archive_cleanup_before_remove', 'test');
      await sql`select pg_cancel_backend(${active[0]!.pid})`.execute(su);
      await heldInCleanup.reached;
      // A, inside its cleanup after the rollback to its savepoint: its transaction open, P's lock STILL A's; B still waiting at its start (its own
      // record — which the trigger would slow — not yet reached, since begin_execution is where it waits).
      expect(await holdersOf(mP.manifest_id)).toEqual([active[0]!.pid]);
      const bHeldBackThroughAsCleanup = !bDone;
      heldInCleanup.release();
      const errA = await pA;
      const exB = await pB;
      expect(errA).toMatchObject({ status: 409 });
      expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry' });
      expect(String((await actionRow(a.id)).failure_reason)).toMatch(/canceling statement due to user request/);
      expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(0);
      expect(await executions(a.id)).toEqual([]);
      // B: its own copy (A's was removed under the lock), the move recorded, the bytes served.
      expect(exB.execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
      expect((await executions(b.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true, already_archived: false });
      expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: b.id, tier: 'archive' }]);
      expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
      expect(await vault.exists('evidence', scope(), mP.locator)).toBe(false);
      expect(bHeldBackThroughAsCleanup).toBe(true);
      expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    } finally {
      await sql`drop trigger if exists b11c_sleep on retention.executions`.execute(su);
      await sql`drop function if exists public.b11c_sleep_on_execution()`.execute(su);
    }
  }, 180_000);

  it('a SECOND ATTEMPT of the same action (0071): A\'s first attempt is held after its copy and its backend terminated — the server rolls it back to approved; a second execute of A is admitted, stages under its OWN attempt name, records, commits and publishes; the first attempt, released, removes only its own staged file and is answered 409 with the refused pause named; A\'s published copy is served and verifies', async () => {
    const evdP = await uploadOne('two-p');
    const mP = await manifestRow((await manifestOf(evdP.id, 1)).manifest_id);
    const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
    const held = fault.hold('b11.archive_after_copy_before_record', 'test');
    const pA1 = failing(execute(steward, a.id));
    await held.reached;
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(1);
    const holders = await holdersOf(mP.manifest_id);
    expect(holders).toHaveLength(1);
    await sql`select pg_terminate_backend(${holders[0]!})`.execute(su);
    await waitFor('the lock released with the backend', () => holdersOf(mP.manifest_id), (p) => p.length === 0);
    expect(await actionRow(a.id)).toMatchObject({ state: 'approved' });
    // The second attempt of the same action: its own staged file beside the first's; the move recorded, committed, published; the hot copy removed.
    const exA2 = await execute(steward, a.id);
    expect(exA2.execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
    expect((await executions(a.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true });
    expect(await tierRecords(mP.manifest_id)).toEqual([{ action_id: a.id, tier: 'archive' }]);
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    // The first attempt released: its cleanup removes only its own staged file — the published copy stays; its pause is refused (the action is executed) and named in its answer.
    held.release();
    const errA1 = await pA1;
    expect(errA1).toMatchObject({ status: 409 });
    expect(String(errA1.message)).toMatch(/the pause could not be recorded/);
    expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(0);
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(true);
    expect(await actionRow(a.id)).toMatchObject({ state: 'executed' });
    expect((await download(analyst, evdP.id)).download).toMatchObject({ contentDigest: mP.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true, state: 'verified' });
  }, 180_000);

  it('the serial control: A fails and cleans up before B begins (its copy of P removed, the hot copy present); B archives normally with its own copy; retrieval from the archive tier and B\'s verification hold', async () => {
    const { evdP, mP, a, b, restoreQ } = await twoActionsOnP('ser');
    const errA = await failing(execute(steward, a.id));
    expect(errA).toMatchObject({ status: 409 });
    expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry' });
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(false); expect(await vault.stagedCopies(scope(), mP.locator)).toHaveLength(0); expect(await vault.exists('evidence', scope(), mP.locator)).toBe(true);
    expect(await tierOf(mP.manifest_id)).toBe('hot');
    const exB = await execute(steward, b.id);
    expect(exB.execution).toMatchObject({ executed: 1, refused: 0, bytes: { removed: [mP.locator], failed: [] } });
    expect((await executions(b.id)).find((r) => r.port === 'observation.archive_blob')!.evidence).toMatchObject({ copy_created: true, already_archived: false });
    expect(await archiveRetrieval(mP.locator, mP.content_digest)).toEqual({ ok: true });
    expect((await download(analyst, evdP.id)).download).toMatchObject({ tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true });
    await restoreQ();
  }, 180_000);
});

describe('F2 · the customer\'s verifier fails closed (Codex B11-F2)', () => {
  const runVerifier = async (packageDir: string, ...extra: string[]): Promise<{ code: number; stdout: string; json: Record<string, unknown> | null }> => {
    let code = 0; let stdout = '';
    try { stdout = (await execFile(process.execPath, [VERIFIER, packageDir, ...extra], { encoding: 'utf8' })).stdout; }
    catch (e) { const x = e as { code?: number; stdout?: string }; code = Number(x.code ?? 1); stdout = String(x.stdout ?? ''); }
    let json: Record<string, unknown> | null = null;
    if (extra.includes('--json')) { try { json = JSON.parse(stdout) as Record<string, unknown>; } catch { json = null; } }
    return { code, stdout, json };
  };
  const packageDir = (manifest: string | null, files: Record<string, Buffer> = {}): string => {
    const d = mkdtempSync(join(tmpdir(), 'eye-b11c-pkg-')); tempDirs.push(d);
    if (manifest !== null) writeFileSync(join(d, 'manifest.json'), manifest);
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(d, name), bytes);
    return d;
  };
  const HEX = 'a'.repeat(64);

  it('null, a list, a scalar, no manifest at all, and a manifest without its object list or signature block: exit 1, ok false, complete false, PACKAGE FAILED — in text and in JSON alike; with an expected digest the comparison that could not run is a failed check', async () => {
    const cases: Array<[string, string | null]> = [['null', 'null'], ['a list', '[]'], ['a scalar', '"a package"'], ['no manifest', null], ['no object list', JSON.stringify({ format: EXPORT_FORMAT, signature: { scheme: SIGNATURE_SCHEME } })], ['no signature block', JSON.stringify({ format: EXPORT_FORMAT, objects: [] })]];
    for (const [label, manifest] of cases) {
      const dir = packageDir(manifest);
      const text = await runVerifier(dir);
      expect(text.code, `${label}: exit`).toBe(1);
      expect(text.stdout, `${label}: verdict`).toMatch(/PACKAGE FAILED: [1-9]\d* check\(s\) failed; the validation did not complete/);
      expect(text.stdout, `${label}: never OK`).not.toMatch(/PACKAGE OK/);
      const json = await runVerifier(dir, '--json');
      expect(json.code, `${label}: json exit`).toBe(1);
      expect(json.json, `${label}: json verdict`).toMatchObject({ ok: false, complete: false, summary: null });
      expect(Number(json.json!['failed']), `${label}: failed count`).toBeGreaterThanOrEqual(1);
      expect((json.json!['checks'] as Array<{ name: string; ok: boolean | null }>).some((c) => c.ok === false && /validation complete/.test(c.name)), `${label}: the completion check`).toBe(true);
      // The expected digest is never skipped silently.
      const expected = await runVerifier(dir, '--json', '--expect-package-digest', HEX);
      expect(expected.code, `${label}: expected-digest exit`).toBe(1);
      expect(expected.json, `${label}: expected-digest verdict`).toMatchObject({ ok: false, complete: false });
      expect((expected.json!['checks'] as Array<{ name: string; ok: boolean | null; detail: string | null }>).find((c) => c.ok === false && /^authenticity:/.test(c.name))?.detail, `${label}: the authenticity check`).toMatch(/could not be compared/);
    }
  }, 120_000);

  it('the controls: a one-object package built with the product\'s own digest helpers passes every check with its expected digest (exit 0, ok true, complete true, PACKAGE OK); its format tampered fails with exit 1 and ok false', async () => {
    const bytes = Buffer.from('SYNTHETIC export bytes of one record\n');
    const manifestId = uuidv7(); const file = `${manifestId}.bin`; const objectId = uuidv7();
    // A 43-field header (the count the re-import check holds the record to), its classification within the ceiling.
    const header: Record<string, unknown> = { classification: 'internal' };
    for (let i = 1; i < 43; i += 1) header[`field_${String(i).padStart(2, '0')}`] = i;
    const payload = { content_digest: sha256(bytes), manifest_id: manifestId, filename: 'one.csv' };
    const object = { object_id: objectId, object_version: 1, header, payload, bytes: { file, content_digest: sha256(bytes), byte_length: bytes.byteLength }, content_digest: contentDigest({ header, payload }) };
    const actionId = uuidv7(); const scopeDigest = sha256('scope'); const approvalId = uuidv7();
    const shape = { format: EXPORT_FORMAT, package: { action_id: actionId, package_id: uuidv7() }, authorization: { scope_digest: scopeDigest, approval_id: approvalId }, gates: { redaction: { classification_ceiling: 'internal' } }, objects: [object], excluded: [],
      signature: { scheme: SIGNATURE_SCHEME, bound_to: { action_id: actionId, scope_digest: scopeDigest, approval_id: approvalId }, statement: 'synthetic package of the B11 closure harness' } as Record<string, unknown> };
    shape.signature['objects_digest'] = objectsDigestOf(shape.objects); shape.signature['package_digest'] = packageDigestOf(shape);
    const packageDigest = String(shape.signature['package_digest']);
    const dir = packageDir(JSON.stringify(shape, null, 2), { [file]: bytes });
    const ok = await runVerifier(dir, '--json', '--expect-package-digest', packageDigest);
    expect(ok.code).toBe(0);
    expect(ok.json).toMatchObject({ ok: true, complete: true, failed: 0, summary: { objects: 1, bytes: bytes.byteLength, package_digest: packageDigest } });
    const okText = await runVerifier(dir, '--expect-package-digest', packageDigest);
    expect(okText.code).toBe(0); expect(okText.stdout).toMatch(/PACKAGE OK: 1 objects/); expect(okText.stdout).toMatch(/PASS\s+authenticity/);
    // Tampered: the format edited — the chain no longer matches; a nonzero exit in both modes.
    const tampered = packageDir(JSON.stringify({ ...shape, format: 'eye-customer-export/9' }, null, 2), { [file]: bytes });
    const bad = await runVerifier(tampered, '--json', '--expect-package-digest', packageDigest);
    expect(bad.code).toBe(1); expect(bad.json).toMatchObject({ ok: false, complete: true }); expect(Number(bad.json!['failed'])).toBeGreaterThanOrEqual(2);
    const badText = await runVerifier(tampered);
    expect(badText.code).toBe(1); expect(badText.stdout).toMatch(/PACKAGE FAILED: [1-9]\d* check\(s\) failed$/m);
  }, 120_000);
});
