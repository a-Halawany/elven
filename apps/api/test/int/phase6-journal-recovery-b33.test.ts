/**
 * B33-J — A GOVERNED RECOVERY PATH FOR DURABLE-JOURNAL-ONLY AUDIT FAILURES.
 *
 * REPRODUCTION (eye_demo, 2026-10-09): /readyz audit-degraded on 4 `evidence_write_failed` journal records written by the pipeline's
 * recordEvidenceFailure, which filed NO ledger incident; the governed entrypoint reconciled nothing and printed "readiness after: DEGRADED".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { superDb, type AnyDb } from './helpers.js';

const ENTRY = join(__dirname, '..', '..', 'dist', 'audit', 'reconcile-degraded.js');
const dirs: string[] = [];
let su: AnyDb;

/** A journal record exactly as the pipeline's recordEvidenceFailure writes it (the shape of the four eye_demo records). */
function journalRecord(route: string, correlationId: string = uuidv7()): Record<string, unknown> {
  return {
    id: randomUUID(), at: new Date(Date.now() - 60_000).toISOString(), kind: 'evidence_write_failed', correlationId, route,
    failureClass: 'handler_failure_evidence', scope: 'DOMAIN', detail: 'capability denied: session_not_active', suppressedCarried: 0,
  };
}
function journalDir(records: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eye-b33j-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'audit-degraded.jsonl'), records.map((r) => JSON.stringify(r) + '\n').join(''), { mode: 0o600 });
  return dir;
}
function runRecovery(dir: string, operator = 'b33-operator', reason = 'journal-only recovery under test'): { status: number | null; out: string } {
  const r = spawnSync('node', [ENTRY, operator, reason], { env: { ...process.env, EYE_DEGRADED_DIR: dir }, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeAll(() => { su = superDb(); });
afterAll(async () => {
  await su.destroy();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('REPRODUCTION — a journal-only evidence_write_failed record', () => {
  it('the governed entrypoint clears it (pre-fix: it reconciles nothing and readiness stays DEGRADED)', () => {
    const recs = [journalRecord('observation.evidence.retrieve'), journalRecord('prediction.portfolio.issue')];
    const dir = journalDir(recs);
    const r = runRecovery(dir);
    // eslint-disable-next-line no-console
    console.log(r.out);
    expect(r.out).toContain('readiness after:         healthy');
    expect(r.status).toBe(0);
    const journal = readFileSync(join(dir, 'audit-degraded.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string });
    expect(journal.at(-1)!.kind).toBe('degraded_recovered');
  });
});
