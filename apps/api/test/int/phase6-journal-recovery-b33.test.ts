/**
 * B33-J (0110) — A GOVERNED RECOVERY PATH FOR DURABLE-JOURNAL-ONLY AUDIT FAILURES.
 *
 * REPRODUCTION (eye_demo, 2026-10-09): /readyz audit-degraded on 4 `evidence_write_failed` journal records written by the pipeline's
 * recordEvidenceFailure, which filed NO ledger incident; the governed entrypoint reconciled nothing and printed "readiness after: DEGRADED"
 * (reproduced on a fresh database through 0109 with the dfcac8d build before the correction: the first case below failed exactly so).
 *
 * THE CORRECTION, proved here:
 *   FAILURE TIME — recordEvidenceFailure files a ledger incident carrying the journal record's id as journal_ref (best effort, as failClosed).
 *   BOOT / RECOVERY — a pending journal record with no ledger counterpart is FILED (idempotent on journal_ref, never twice), then reconciled
 *     ONLY through the governed entrypoint under the recovery capability bound to each incident. Boot never clears.
 *   HONEST INCIDENTS — what the journal knew (route, correlation, time, class, detail) and that the evidence was never written; nothing made up.
 *   FAIL CLOSED — the flag clears only when every journal record since the last recovery maps to a RECONCILED ledger incident and the ledger
 *     has none open; a record appended during recovery is not covered; unauthorized reconciliation is refused; incomplete recovery exits 1.
 *   THE JOURNAL — only appended to: the original lines survive byte for byte, the recovery's proof (with the ids it covers) is appended.
 *
 * Every case runs against the REAL entrypoint (dist/audit/reconcile-degraded.js, a separate process, its own EYE_DEGRADED_DIR) or the real
 * services in-process with their own journal stores; the ledger is the fresh database's. Cases run in order and each leaves the ledger
 * with no open incident.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { appDb, commitDb, identityDb, verifierDb, superDb, type AnyDb } from './helpers.js';

// The process singleton journal (used by the pipeline's recordEvidenceFailure in-process) lives in a scratch directory of this run.
const SINGLETON_DIR = vi.hoisted(() => {
  const d = `${(process.env['TMPDIR'] ?? '/tmp').replace(/\/$/, '')}/eye-b33j-singleton-${process.pid}-${Date.now()}`;
  process.env['EYE_DEGRADED_DIR'] = d;   // the store creates it (0700) on its first record
  return d;
});

import { DegradedAuditStore, degradedAudit, type DegradedRecord } from '../../src/shared/degraded-store.js';
import { fileJournalIncident } from '../../src/shared/journal-incident.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { DegradedReconciliationService } from '../../src/health/degraded-reconciliation.service.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';

const ENTRY = join(__dirname, '..', '..', 'dist', 'audit', 'reconcile-degraded.js');
const JOURNAL = 'audit-degraded.jsonl';
const dirs: string[] = [SINGLETON_DIR];
let su: AnyDb; let app: AnyDb; let commit: AnyDb; let verifier: AnyDb; let ident: AnyDb;
let audit: AuditService; let boot: DegradedReconciliationService;

type Rec = DegradedRecord & Record<string, unknown>;
/** A journal record exactly as the pipeline's recordEvidenceFailure writes it (the shape of the four eye_demo records). */
function journalRecord(route: string, correlationId: string = uuidv7(), agoMs = 60_000): Rec {
  return {
    id: randomUUID(), at: new Date(Date.now() - agoMs).toISOString(), kind: 'evidence_write_failed', correlationId, route,
    failureClass: 'handler_failure_evidence', scope: 'DOMAIN', detail: 'capability denied: session_not_active', suppressedCarried: 0,
  };
}
const line = (r: Record<string, unknown>): string => JSON.stringify(r) + '\n';
function journalDir(records: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eye-b33j-'));
  dirs.push(dir);
  writeFileSync(join(dir, JOURNAL), records.map(line).join(''), { mode: 0o600 });
  return dir;
}
const journalText = (dir: string): string => readFileSync(join(dir, JOURNAL), 'utf8');
const journalLines = (dir: string): Rec[] => journalText(dir).trim().split('\n').map((l) => JSON.parse(l) as Rec);
function runRecovery(dir: string, operator = 'b33-operator', reason = 'journal-only recovery under test'): { status: number | null; out: string } {
  const r = spawnSync('node', [ENTRY, operator, reason], { env: { ...process.env, EYE_DEGRADED_DIR: dir }, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
interface Incident { id: string; kind: string; journal_ref: string | null; reconciled_at: Date | null; reconciled_by: string | null;
  detected_at: Date; correlation_id: string | null; partition_hint: string | null; details: Record<string, unknown> }
async function incidentsFor(refs: string[]): Promise<Incident[]> {
  return (await sql<Incident>`select * from audit.availability_incidents where journal_ref = any(${refs}::text[]) order by detected_at`.execute(su)).rows;
}
async function openCount(): Promise<number> {
  return Number((await sql<{ n: string }>`select count(*) n from audit.availability_incidents where reconciled_at is null`.execute(su)).rows[0]!.n);
}
async function setPlatformFrozen(frozen: boolean): Promise<void> {
  const r = await sql`update audit.audit_chain_heads set frozen = ${frozen} where partition_id = 'platform'`.execute(su);
  expect(Number(r.numAffectedRows)).toBe(1);
}
/** A ledger-only incident (its journal lost, or filed by a path without a journal): the 0010 failure port, unchanged. */
async function ledgerOnlyIncident(): Promise<string> {
  const id = uuidv7();
  await commit.transaction().execute(async (tx) => {
    await sql`select audit.record_availability_incident(${id}::uuid, 'audit_unavailable', 'PLATFORM', ${uuidv7()}::uuid,
      ${JSON.stringify({ probe: 'b33j-ledger-only' })}::jsonb)`.execute(tx);
  });
  return id;
}
/** Reconcile ONE incident through the governed port under the recovery capability bound to it (what the entrypoint does per incident). */
async function reconcileOne(id: string, by = 'b33-operator'): Promise<void> {
  await verifier.transaction().execute(async (tx) => {
    await sql`select ctx.issue_recovery(${id}::uuid)`.execute(tx);
    await sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, ${by}, 'one incident, governed')`.execute(tx);
  });
}

beforeAll(async () => {
  su = superDb(); app = appDb(); commit = commitDb(); verifier = verifierDb(); ident = identityDb();
  audit = new AuditService(app as never, verifier as never, ident as never);
  boot = new DegradedReconciliationService(app as never, commit as never);
});
afterAll(async () => {
  await Promise.all([su, app, commit, verifier, ident].map((d) => d.destroy()));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('REPRODUCTION — a journal-only evidence_write_failed record', () => {
  it('the governed entrypoint clears it (pre-fix: it reconciled nothing and readiness stayed DEGRADED)', async () => {
    const recs = [journalRecord('observation.evidence.retrieve'), journalRecord('prediction.portfolio.issue')];
    const dir = journalDir(recs);
    expect(await incidentsFor(recs.map((r) => r.id))).toHaveLength(0);   // journal-only: no ledger counterpart
    const r = runRecovery(dir);
    expect(r.out).toContain('journal records filed:   2 new of 2 pending');
    expect(r.out).toContain('journal records covered: 2 of 2');
    expect(r.out).toContain('readiness after:         healthy');
    expect(r.status).toBe(0);
    expect(journalLines(dir).at(-1)!.kind).toBe('degraded_recovered');
    expect(await openCount()).toBe(0);
  });
});

describe('FAILURE TIME — recordEvidenceFailure files the ledger incident with journal_ref', () => {
  it('the pipeline\'s own path writes the journal record AND its governed incident (journal_ref = the record id, kind evidence_write_failed)', async () => {
    const pipeline = Object.assign(Object.create(PipelineService.prototype) as object, { commitDb: commit }) as unknown as {
      recordEvidenceFailure(e: { correlation_id: string }, r: { action: string; scope: string }, stage: string, err: unknown): void };
    const correlation = uuidv7();
    pipeline.recordEvidenceFailure({ correlation_id: correlation }, { action: 'prediction.portfolio.issue', scope: 'DOMAIN' },
      'handler_failure_evidence', new Error('capability denied: session_not_active'));
    const rec = degradedAudit.pendingRecords().find((x) => x.correlationId === correlation)!;
    expect(rec.kind).toBe('evidence_write_failed');
    let inc: Incident[] = [];
    for (let i = 0; i < 50 && inc.length === 0; i += 1) {   // best effort, not awaited by the request: poll for it
      inc = await incidentsFor([rec.id]);
      if (inc.length === 0) await new Promise((res) => setTimeout(res, 100));
    }
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ kind: 'evidence_write_failed', journal_ref: rec.id, correlation_id: correlation, partition_hint: 'DOMAIN',
      reconciled_at: null });
    expect(new Date(inc[0]!.detected_at).toISOString()).toBe(rec.at);
    expect(inc[0]!.details).toMatchObject({ filed_by: 'failure_time', evidence_written: false, source: 'durable_journal' });

    // Recovery of the singleton journal: the failure-time incident is the record's counterpart — not filed again — and is reconciled.
    const out = await audit.reconcileDegraded('b33-operator', 'failure-time filing reconciled', degradedAudit);
    expect(out).toMatchObject({ journalPending: 1, journalFiled: 0, journalCovered: 1, remainingUnreconciled: 0 });
    expect(degradedAudit.pendingRecords()).toHaveLength(0);
    expect(degradedAudit.state().degraded).toBe(false);
    expect(await incidentsFor([rec.id])).toHaveLength(1);
  });
});

describe('THE FOUR LOST RECORDS — honestly worded incidents, the original journal preserved', () => {
  it('eye_demo\'s shape: 4 records (one correlation reused three times) → 4 incidents saying the evidence was never written; journal only appended', async () => {
    const reused = uuidv7();
    const recs = [journalRecord('observation.evidence.retrieve', reused, 4 * 3600_000), journalRecord('observation.evidence.retrieve', reused, 3 * 3600_000),
      journalRecord('prediction.portfolio.issue', uuidv7(), 2 * 3600_000), journalRecord('observation.evidence.retrieve', reused, 3600_000)];
    const dir = journalDir(recs);
    const original = journalText(dir);

    const store = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(store);
    expect(store.state()).toMatchObject({ degraded: true, incidents: 4 });   // the 4 filed incidents are the journal's — not counted twice

    const r = runRecovery(dir, 'b33-operator', 'the four lost evidence records: filed from the journal, reconciled as lost');
    expect(r.out).toContain('journal records filed:   0 new of 4 pending');   // boot filed them; recovery files nothing twice
    expect(r.out).toContain('readiness after:         healthy');
    expect(r.status).toBe(0);

    const inc = await incidentsFor(recs.map((x) => x.id));
    expect(inc).toHaveLength(4);
    for (const [i, x] of recs.entries()) {
      const row = inc.find((y) => y.journal_ref === x.id)!;
      expect(row.kind).toBe('evidence_write_failed');
      expect(row.correlation_id).toBe(x.correlationId);
      expect(new Date(row.detected_at).toISOString()).toBe(x.at);
      expect(row.reconciled_by).toBe('b33-operator');
      expect(row.details, `record ${i}`).toMatchObject({
        source: 'durable_journal', filed_by: 'journal_backfill:boot', evidence_written: false, journal_ref: x.id,
        known: { route: x.route, correlation_id: x.correlationId, at: x.at, failure_class: 'handler_failure_evidence', scope: 'DOMAIN',
          detail: 'capability denied: session_not_active' },
        reconciliation_note: 'the four lost evidence records: filed from the journal, reconciled as lost',
      });
      expect(String(row.details['statement'])).toMatch(/^Evidence lost: the request's evidence \(stage handler_failure_evidence\) was never written to the audit ledger/);
      expect(String(row.details['statement'])).toContain('The missing evidence was not reconstructed.');
      // nothing manufactured: no policy decision, no request audit event for that correlation was written by recovery
      const made = await sql<{ n: string }>`select count(*) n from audit.audit_events where correlation_id = ${x.correlationId}::uuid and event->>'event_type' <> 'audit.integrity'`.execute(su);
      expect(Number(made.rows[0]!.n)).toBe(0);
      // each reconciliation left its inseparable integrity evidence
      const ev = await sql<{ n: string }>`select count(*) n from audit.audit_events where correlation_id = ${row.id}::uuid and event->'metadata'->>'event' = 'availability.reconciled'`.execute(su);
      expect(Number(ev.rows[0]!.n)).toBe(1);
    }

    // THE JOURNAL: the original bytes untouched, exactly one line appended — the recovery's proof naming the 4 records it covered.
    const after = journalText(dir);
    expect(after.startsWith(original)).toBe(true);
    const appended = after.slice(original.length).trim().split('\n').map((l) => JSON.parse(l) as Rec);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ kind: 'degraded_recovered', covers: recs.map((x) => x.id) });
    expect(String(appended[0]!.detail)).toMatch(/^governed reconciliation by b33-operator \[governed: /);
    for (const x of inc) expect(String(appended[0]!.detail)).toContain(x.id);

    const restarted = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(restarted);
    expect(restarted.state().degraded).toBe(false);
  });
});

describe('MIXED — journal-only, failure-time-filed and ledger-only incidents recovered together', () => {
  it('all three reconciled through the governed port; the failure-time one not filed again; healthy', async () => {
    const journalOnly = journalRecord('observation.evidence.retrieve');
    const filedAtFailure = journalRecord('prediction.portfolio.issue');
    const dir = journalDir([journalOnly, filedAtFailure]);
    const pre = await fileJournalIncident(commit as never, filedAtFailure, 'failure_time');
    expect(pre.filed).toBe(true);
    const ledgerOnly = await ledgerOnlyIncident();

    const r = runRecovery(dir);
    expect(r.out).toContain('journal records filed:   1 new of 2 pending');
    expect(r.out).toContain('journal records covered: 2 of 2');
    expect(r.out).toContain('remaining unreconciled:  0');
    expect(r.out).toContain('readiness after:         healthy');
    expect(r.status).toBe(0);
    const inc = await incidentsFor([journalOnly.id, filedAtFailure.id]);
    expect(inc).toHaveLength(2);
    expect(inc.find((x) => x.journal_ref === filedAtFailure.id)!.id).toBe(pre.incidentId);
    expect(inc.find((x) => x.journal_ref === filedAtFailure.id)!.details['filed_by']).toBe('failure_time');
    expect(inc.find((x) => x.journal_ref === journalOnly.id)!.details['filed_by']).toBe('journal_backfill:recovery');
    expect(inc.every((x) => x.reconciled_at !== null)).toBe(true);
    const lo = await sql<{ reconciled_at: Date | null }>`select reconciled_at from audit.availability_incidents where id = ${ledgerOnly}::uuid`.execute(su);
    expect(lo.rows[0]!.reconciled_at).not.toBeNull();
  });
});

describe('INCOMPLETE → RETRY → IDEMPOTENT — and RESTART after a partial recovery stays degraded until complete', () => {
  it('an incomplete recovery exits 1 and stays degraded; re-runs file nothing twice; boot after it stays degraded; completion clears', async () => {
    const a = journalRecord('observation.evidence.retrieve'); const b = journalRecord('prediction.portfolio.issue');
    const dir = journalDir([a, b]);
    const original = journalText(dir);

    // 1. The reconciliation's evidence cannot be written (the platform chain frozen): INCOMPLETE — filed, not reconciled, exit 1.
    await setPlatformFrozen(true);
    let first: { status: number | null; out: string }; let second: { status: number | null; out: string };
    try {
      first = runRecovery(dir);
      second = runRecovery(dir);   // a retry while still broken
    } finally {
      await setPlatformFrozen(false);
    }
    expect(first.status).toBe(1);
    expect(first.out).toContain('reconcile-degraded: FAILED');
    expect(second.status).toBe(1);
    expect(journalText(dir)).toBe(original);                     // nothing appended: no recovery was proved
    let inc = await incidentsFor([a.id, b.id]);
    expect(inc).toHaveLength(2);                                  // filed ONCE each across both runs
    expect(inc.every((x) => x.reconciled_at === null)).toBe(true);

    // 2. RESTART after the partial recovery: degraded (the journal's 2 records; their 2 open incidents are not counted twice).
    const s1 = new DegradedAuditStore(dir);
    expect((await boot.reconcileAtBoot(s1)).filed).toBe(0);
    expect(s1.state()).toMatchObject({ degraded: true, incidents: 2 });

    // 3. One incident reconciled out of band (governed, under its own capability) — still partial: restart stays degraded.
    await reconcileOne(inc.find((x) => x.journal_ref === a.id)!.id);
    const s2 = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(s2);
    expect(s2.state().degraded).toBe(true);

    // 4. The retry completes: b reconciled, a already reconciled (covered by its earlier governed reconciliation); healthy.
    const done = runRecovery(dir);
    expect(done.out).toContain('journal records filed:   0 new of 2 pending');
    expect(done.out).toContain('journal records covered: 2 of 2');
    expect(done.status).toBe(0);
    inc = await incidentsFor([a.id, b.id]);
    expect(inc).toHaveLength(2);
    expect(inc.every((x) => x.reconciled_at !== null)).toBe(true);

    // 5. Run again: idempotent — nothing filed, nothing reconciled, nothing appended, still healthy.
    const lines = journalLines(dir).length;
    const again = runRecovery(dir);
    expect(again.status).toBe(0);
    expect(again.out).toContain('journal records filed:   0 new of 0 pending');
    expect(again.out).toContain('incidents reconciled:    none');
    expect(journalLines(dir)).toHaveLength(lines);
    expect(await incidentsFor([a.id, b.id])).toHaveLength(2);
    const s3 = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(s3);
    expect(s3.state().degraded).toBe(false);
  });

  it('every incident reconciled but the proof never recorded (a crash before the append): boot stays degraded; the re-run records it', async () => {
    const a = journalRecord('observation.evidence.retrieve');
    const dir = journalDir([a]);
    const s = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(s);
    await reconcileOne((await incidentsFor([a.id]))[0]!.id);
    expect(await openCount()).toBe(0);
    const restarted = new DegradedAuditStore(dir);
    await boot.reconcileAtBoot(restarted);
    expect(restarted.state().degraded).toBe(true);           // the ledger is clean, the journal is not: never cleared locally
    const r = runRecovery(dir);
    expect(r.out).toContain('incidents reconciled:    none');
    expect(r.out).toContain('journal records covered: 1 of 1');
    expect(r.status).toBe(0);
    expect(journalLines(dir).at(-1)).toMatchObject({ kind: 'degraded_recovered', covers: [a.id] });
  });
});

describe('UNAUTHORIZED — a journal-filed incident is reconciled only under the recovery capability bound to it', () => {
  it('no capability, a capability for another incident, a verify capability, an ordinary role: all refused; the filing port cannot reconcile', async () => {
    const a = journalRecord('observation.evidence.retrieve'); const b = journalRecord('prediction.portfolio.issue');
    const ia = (await fileJournalIncident(commit as never, a, 'failure_time')).incidentId;
    const ib = (await fileJournalIncident(commit as never, b, 'failure_time')).incidentId;
    await expect(verifier.transaction().execute(async (tx) =>
      sql`select * from audit.reconcile_availability_incident_v2(${ia}::uuid, 'intruder', 'no capability')`.execute(tx)))
      .rejects.toThrow(/a recovery capability is required/);
    await expect(verifier.transaction().execute(async (tx) => {
      await sql`select ctx.issue_recovery(${ib}::uuid)`.execute(tx);
      return sql`select * from audit.reconcile_availability_incident_v2(${ia}::uuid, 'intruder', 'wrong incident')`.execute(tx);
    })).rejects.toThrow(/bound to incident/);
    await expect(verifier.transaction().execute(async (tx) => {
      await sql`select ctx.issue_verify('platform', false)`.execute(tx);
      return sql`select * from audit.reconcile_availability_incident_v2(${ia}::uuid, 'intruder', 'verify capability')`.execute(tx);
    })).rejects.toThrow(/a recovery capability is required/);
    for (const db of [app, commit]) {
      await expect(sql`select * from audit.reconcile_availability_incident_v2(${ia}::uuid, 'intruder', 'role')`.execute(db))
        .rejects.toThrow(/permission denied/);
    }
    // Filing again (any role holding the port) returns the SAME open incident and changes nothing — it can never reconcile or rewrite.
    const again = await fileJournalIncident(verifier as never, { ...a, detail: 'rewritten' }, 'journal_backfill:recovery');
    expect(again).toEqual({ incidentId: ia, filed: false, reconciled: false });
    const row = (await incidentsFor([a.id]))[0]!;
    expect(row.reconciled_at).toBeNull();
    expect(row.details['filed_by']).toBe('failure_time');
    expect((row.details['known'] as Record<string, unknown>)['detail']).toBe('capability denied: session_not_active');
    // the app role cannot file at all; the port refuses what is not a journal record's counterpart
    await expect(sql`select * from audit.file_journal_incident(${uuidv7()}::uuid, 'evidence_write_failed', null, null, ${randomUUID()}, null, '{}'::jsonb)`.execute(app))
      .rejects.toThrow(/permission denied/);
    for (const [args, re] of [
      [sql`${uuidv7()}::uuid, 'degraded_recovered', null, null, ${randomUUID()}, null, '{}'::jsonb`, /not a degrading journal record/],
      [sql`${uuidv7()}::uuid, 'evidence_write_failed', null, null, 'not-a-journal-id', null, '{}'::jsonb`, /durable journal record id/],
      [sql`${uuidv7()}::uuid, 'evidence_write_failed', null, null, null, null, '{}'::jsonb`, /durable journal record id/],
      [sql`null::uuid, 'evidence_write_failed', null, null, ${randomUUID()}, null, '{}'::jsonb`, /an incident id is required/],
      [sql`${uuidv7()}::uuid, 'evidence_write_failed', null, null, ${randomUUID()}, now() + interval '1 day', '{}'::jsonb`, /in the future/],
    ] as const) {
      await expect(sql`select * from audit.file_journal_incident(${args})`.execute(commit)).rejects.toThrow(re);
    }
    // The local half refuses a proof that does not cover the journal: a reconciled UNRELATED incident does not clear a journal record.
    const dir = journalDir([a, b]);
    const store = new DegradedAuditStore(dir);
    store.reloadFromJournal();
    expect(() => store.markRecovered({ reconciledIncidentIds: [uuidv7()], remainingUnreconciled: 0, detail: 'unrelated' }))
      .toThrow(/2 journal record\(s\) have no reconciled ledger incident/);
    expect(() => store.markRecovered({ reconciledIncidentIds: [ia], remainingUnreconciled: 0, detail: 'partial', journalCovered: [a.id] }))
      .toThrow(/1 journal record\(s\) have no reconciled ledger incident \(/);
    expect(store.state().degraded).toBe(true);
    // Leave the ledger clean: the governed entrypoint recovers both.
    expect(runRecovery(dir).status).toBe(0);
  });
});

describe('A NEW journal failure is NOT cleared by reconciling the others', () => {
  it('a record appended while recovery runs (after the others were filed) is not covered: refused, still degraded; the next run files and reconciles it', async () => {
    const a = journalRecord('observation.evidence.retrieve'); const b = journalRecord('prediction.portfolio.issue');
    const late = journalRecord('observation.evidence.retrieve', uuidv7(), 0);
    const dir = journalDir([a, b]);
    class RacingStore extends DegradedAuditStore {
      private raced = false;
      override pendingRecords(): DegradedRecord[] {
        const p = super.pendingRecords();
        if (!this.raced) { this.raced = true; appendFileSync(join(dir, JOURNAL), line(late)); }   // arrives after a, b were snapshotted
        return p;
      }
    }
    const store = new RacingStore(dir);
    store.reloadFromJournal();
    await expect(audit.reconcileDegraded('b33-operator', 'race', store)).rejects.toThrow(/1 journal record\(s\) have no reconciled ledger incident \(.*/);
    expect(store.state().degraded).toBe(true);
    // a and b were filed and reconciled; the late one has no ledger incident at all — nothing cleared it
    const inc = await incidentsFor([a.id, b.id, late.id]);
    expect(inc.map((x) => x.journal_ref).sort()).toEqual([a.id, b.id].sort());
    expect(inc.every((x) => x.reconciled_at !== null)).toBe(true);
    expect(journalLines(dir).some((x) => x.kind === 'degraded_recovered')).toBe(false);
    const restarted = new DegradedAuditStore(dir);
    restarted.reloadFromJournal();
    expect(restarted.state()).toMatchObject({ degraded: true, incidents: 3 });

    // A ledger incident is open (unrelated) and the new record is unfiled: the run files the new one FIRST and reconciles both, governed.
    const unrelated = await ledgerOnlyIncident();
    const r = runRecovery(dir);
    expect(r.out).toContain('journal records filed:   1 new of 3 pending');
    expect(r.out).toContain('journal records covered: 3 of 3');
    expect(r.status).toBe(0);
    expect((await incidentsFor([late.id]))[0]!.reconciled_at).not.toBeNull();
    expect((await sql<{ r: Date | null }>`select reconciled_at r from audit.availability_incidents where id = ${unrelated}::uuid`.execute(su)).rows[0]!.r).not.toBeNull();
  });

  it('a record appended between the coverage check and the proof stays degraded on replay: the proof names only what it covered', () => {
    const a = journalRecord('observation.evidence.retrieve'); const late = journalRecord('prediction.portfolio.issue', uuidv7(), 0);
    const dir = journalDir([a, late, { id: randomUUID(), at: new Date().toISOString(), kind: 'degraded_recovered', correlationId: null, route: null,
      failureClass: null, scope: null, detail: 'governed reconciliation by b33-operator [governed: x]', suppressedCarried: 0, covers: [a.id] }]);
    const s = new DegradedAuditStore(dir);
    expect(s.reloadFromJournal()).toMatchObject({ degraded: true, unreconciled: 1, since: late.at });
    expect(s.pendingRecords().map((x) => x.id)).toEqual([late.id]);
  });

  it('a recovery record written before B33 (no covers list) still closes everything before it, as it always did', () => {
    const a = journalRecord('observation.evidence.retrieve');
    const dir = journalDir([a, { id: randomUUID(), at: new Date().toISOString(), kind: 'degraded_recovered', correlationId: null, route: null,
      failureClass: null, scope: null, detail: 'governed reconciliation by acceptance-operator [governed: x]', suppressedCarried: 0 }]);
    expect(new DegradedAuditStore(dir).reloadFromJournal()).toMatchObject({ degraded: false, unreconciled: 0 });
  });

  it('a journal record that cannot be filed blocks recovery: an unrelated open incident is NOT reconciled in its place, exit 1', async () => {
    const bad = { ...journalRecord('observation.evidence.retrieve'), at: new Date(Date.now() + 86_400_000).toISOString() };   // unfilable (future)
    const dir = journalDir([bad]);
    const unrelated = await ledgerOnlyIncident();
    const r = runRecovery(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('reconcile-degraded: FAILED');
    expect(r.out).toMatch(/in the future/);
    expect((await sql<{ r: Date | null }>`select reconciled_at r from audit.availability_incidents where id = ${unrelated}::uuid`.execute(su)).rows[0]!.r).toBeNull();
    expect(journalLines(dir).some((x) => x.kind === 'degraded_recovered')).toBe(false);
    // leave the ledger clean (a separate deployment's journal holds nothing pending)
    expect(runRecovery(journalDir([])).status).toBe(0);
    expect(await openCount()).toBe(0);
  });
});
