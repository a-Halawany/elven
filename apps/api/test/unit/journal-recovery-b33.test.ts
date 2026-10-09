/**
 * B33-J (0110) — the durable journal's LOCAL half of the governed recovery, without a database.
 *
 *   REPLAY — a `degraded_recovered` record clears exactly the records it `covers`; one written before B33 (no list) clears everything
 *     before it, as it always did; a record the proof does not name stays degraded.
 *   markRecovered — refuses a proof that leaves any journal record since the last recovery without a reconciled ledger incident; the
 *     journal is only appended to; a record appended while recovery ran keeps the process degraded.
 *   THE INCIDENT'S WORDING — per failure class, what was not written, and that nothing was reconstructed.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DegradedAuditStore, type DegradedRecord } from '../../src/shared/degraded-store.js';
import { journalIncidentDetails, lostEvidenceStatement } from '../../src/shared/journal-incident.js';

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function rec(over: Partial<DegradedRecord> = {}): DegradedRecord {
  return { id: randomUUID(), at: new Date().toISOString(), kind: 'evidence_write_failed', correlationId: randomUUID(),
    route: 'observation.evidence.retrieve', failureClass: 'handler_failure_evidence', scope: 'DOMAIN',
    detail: 'capability denied: session_not_active', suppressedCarried: 0, ...over };
}
function recovered(covers?: string[]): DegradedRecord {
  return rec({ kind: 'degraded_recovered', correlationId: null, route: null, failureClass: null, scope: null,
    detail: 'governed reconciliation by op [governed: x]', ...(covers === undefined ? {} : { covers }) });
}
function store(records: DegradedRecord[]): { s: DegradedAuditStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'eye-b33j-unit-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'audit-degraded.jsonl'), records.map((r) => JSON.stringify(r) + '\n').join(''));
  return { s: new DegradedAuditStore(dir), dir };
}

describe('REPLAY — what a recovery record clears', () => {
  it('a covers list clears exactly the records it names', () => {
    const a = rec(); const b = rec(); const c = rec();
    const { s } = store([a, b, recovered([a.id, c.id]), c]);
    // naming a record that is not yet in the journal does not pre-clear it: c, written after the proof, stays degraded
    expect(s.pendingRecords().map((r) => r.id)).toEqual([b.id, c.id]);
    expect(s.reloadFromJournal()).toEqual({ degraded: true, unreconciled: 2, since: b.at });
  });
  it('a pre-B33 recovery record (no list) clears everything before it', () => {
    const a = rec(); const b = rec();
    const { s } = store([a, recovered(), b]);
    expect(s.pendingRecords().map((r) => r.id)).toEqual([b.id]);
  });
  it('an empty or absent journal is not degraded', () => {
    expect(store([]).s.reloadFromJournal()).toEqual({ degraded: false, unreconciled: 0, since: null });
    expect(new DegradedAuditStore(join(tmpdir(), `eye-b33j-none-${randomUUID()}`)).reloadFromJournal().degraded).toBe(false);
  });
});

describe('markRecovered — the local half refuses an incomplete proof', () => {
  it('refuses when a journal record is not covered, and never writes', () => {
    const a = rec(); const b = rec();
    const { s, dir } = store([a, b]);
    s.reloadFromJournal();
    const before = readFileSync(join(dir, 'audit-degraded.jsonl'), 'utf8');
    expect(() => s.markRecovered({ reconciledIncidentIds: [randomUUID()], remainingUnreconciled: 0, detail: 'unrelated' }))
      .toThrow(`degraded recovery refused: 2 journal record(s) have no reconciled ledger incident (${a.id}, ${b.id})`);
    expect(() => s.markRecovered({ reconciledIncidentIds: [randomUUID()], remainingUnreconciled: 0, detail: 'partial', journalCovered: [a.id] }))
      .toThrow(`(${b.id})`);
    expect(readFileSync(join(dir, 'audit-degraded.jsonl'), 'utf8')).toBe(before);
    expect(s.state().degraded).toBe(true);
  });
  it('keeps the C9 refusals: an empty proof, an open ledger', () => {
    const { s } = store([rec()]);
    s.reloadFromJournal();
    expect(() => s.markRecovered({ reconciledIncidentIds: [], remainingUnreconciled: 0, detail: 'x' })).toThrow(/no governed reconciliation/);
    expect(() => s.markRecovered({ reconciledIncidentIds: [randomUUID()], remainingUnreconciled: 1, detail: 'x' })).toThrow(/still shows 1/);
  });
  it('a complete proof appends ONE recovery line naming what it covered; the original lines are untouched', () => {
    const a = rec(); const b = rec();
    const { s, dir } = store([a, b]);
    s.reloadFromJournal();
    const before = readFileSync(join(dir, 'audit-degraded.jsonl'), 'utf8');
    s.markRecovered({ reconciledIncidentIds: ['i1', 'i2'], remainingUnreconciled: 0, detail: 'governed reconciliation by op', journalCovered: [a.id, b.id] });
    const after = readFileSync(join(dir, 'audit-degraded.jsonl'), 'utf8');
    expect(after.startsWith(before)).toBe(true);
    const appended = after.slice(before.length).trim().split('\n').map((l) => JSON.parse(l) as DegradedRecord);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ kind: 'degraded_recovered', covers: [a.id, b.id], detail: 'governed reconciliation by op [governed: i1,i2]' });
    expect(s.state().degraded).toBe(false);
    expect(new DegradedAuditStore(dir).reloadFromJournal().degraded).toBe(false);
  });
  it('a record appended after the check but before the proof keeps this process — and a restart — degraded', () => {
    const a = rec(); const late = rec();
    const { dir } = store([a]);
    class Racing extends DegradedAuditStore {
      private n = 0;
      override readAll(): DegradedRecord[] {
        const all = super.readAll();
        this.n += 1;
        if (this.n === 2) writeFileSync(join(dir, 'audit-degraded.jsonl'), JSON.stringify(late) + '\n', { flag: 'a' });   // after the coverage check
        return all;
      }
    }
    const r = new Racing(dir);
    r.reloadFromJournal();                                          // read 1
    r.markRecovered({ reconciledIncidentIds: ['i1'], remainingUnreconciled: 0, detail: 'op', journalCovered: [a.id] });   // read 2 = the check
    expect(r.state().degraded).toBe(true);
    expect(r.state().since).toBe(late.at);
    expect(new DegradedAuditStore(dir).pendingRecords().map((x) => x.id)).toEqual([late.id]);
  });
});

describe('THE INCIDENT — honest about what was lost', () => {
  it('the eye_demo class: the request\'s evidence was never written; only the journal\'s facts are known; nothing reconstructed', () => {
    const r = rec();
    expect(lostEvidenceStatement(r)).toBe(
      'Evidence lost: the request\'s evidence (stage handler_failure_evidence) was never written to the audit ledger — the write was refused '
      + '(capability denied: session_not_active). Only what the durable journal kept is known: the route, the correlation id, the time, the '
      + 'failure class and its detail. The missing evidence was not reconstructed.');
    expect(journalIncidentDetails(r, 'journal_backfill:recovery')).toEqual({
      source: 'durable_journal', filed_by: 'journal_backfill:recovery', evidence_written: false, statement: lostEvidenceStatement(r),
      known: { route: r.route, correlation_id: r.correlationId, at: r.at, failure_class: 'handler_failure_evidence', scope: 'DOMAIN',
        detail: 'capability denied: session_not_active', suppressed_carried: 0 },
    });
  });
  it('each other journal class is worded for what it actually lost', () => {
    expect(lostEvidenceStatement(rec({ kind: 'audit_unavailable', failureClass: 'audit_unavailable', detail: 'partition frozen' })))
      .toMatch(/^Authoritative audit persistence was unavailable: the request was refused fail-closed and no audit record of it was written \(partition frozen\)/);
    expect(lostEvidenceStatement(rec({ kind: 'audit_unavailable', failureClass: 'pdp_denial_object_not_recorded' })))
      .toMatch(/^Evidence lost: the denial's decision object was never written .*committed without it/);
    expect(lostEvidenceStatement(rec({ failureClass: 'intake_accounting' }))).toMatch(/suppression accounting .* never written/);
    expect(lostEvidenceStatement(rec({ failureClass: 'availability_incident_read_failed' }))).toMatch(/No request evidence is described by this record\.$/);
  });
  it('a correlation that is not a uuid is kept as known text and flagged (the ledger column stays null)', () => {
    const d = journalIncidentDetails(rec({ correlationId: 'client-supplied-123' }), 'journal_backfill:boot');
    expect(d['known']).toMatchObject({ correlation_id: 'client-supplied-123', correlation_id_not_uuid: true });
  });
});
