/**
 * Durable audit-degradation store (Gate-2 §6) — the INDEPENDENT bounded
 * mechanism used when authoritative audit persistence is unavailable.
 *
 * When the ledger cannot accept evidence, the request MUST fail closed, but the
 * fact that it happened must still survive: this store appends a sanitized
 * record to a local append-only journal with an fsync per record, flips a
 * process-visible degraded flag (surfaced by /readyz), and keeps enough
 * information for deterministic reconciliation (correlation id, path, class,
 * scope labels, timestamps, counters). It never holds payloads, credentials or
 * tokens.
 *
 * It is deliberately NOT the audit ledger, and deliberately NOT part of the
 * audit module: a mechanism that shares the failure domain of the thing it
 * reports on cannot report on it. It lives in `shared` as a cross-cutting
 * capability so no module boundary is crossed to reach it.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, existsSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface DegradedRecord {
  id: string;
  at: string;
  kind: 'audit_unavailable' | 'evidence_write_failed' | 'degraded_recovered';
  correlationId: string | null;
  route: string | null;
  failureClass: string | null;
  scope: string | null;
  detail: string;
  /** Drops coalesced by rate limiting that had not yet been reported. */
  suppressedCarried: number;
}

/**
 * The journal location is a property of the DEPLOYMENT, not of the directory the
 * process happened to be started from (Gate-2.1 §7). Deriving it from
 * `process.cwd()` meant a restart from a different working directory read a
 * different journal and therefore came back reporting `ok` — silently discarding
 * exactly the degraded state this store exists to preserve. It is resolved from
 * this module's own location instead: `<app root>/.eye-local/degraded`, with an
 * explicit override for operators who place it elsewhere.
 */
// `__dirname` (the API compiles to CommonJS): dist/shared → up two levels is the
// application root, both from dist/ at runtime and from src/ under ts-node.
const APP_ROOT = join(__dirname, '..', '..');
const DEFAULT_DIR = process.env['EYE_DEGRADED_DIR'] ?? join(APP_ROOT, '.eye-local', 'degraded');

class DegradedAuditStore {
  private degradedSince: string | null = null;
  private lastError: string | null = null;
  private count = 0;

  constructor(private readonly dir: string = DEFAULT_DIR) {}

  private journalPath(): string {
    return join(this.dir, 'audit-degraded.jsonl');
  }

  /** Append + fsync a sanitized record. Returns the record actually written. */
  record(input: Omit<DegradedRecord, 'id' | 'at'>): DegradedRecord {
    const rec: DegradedRecord = { id: randomUUID(), at: new Date().toISOString(), ...input };
    const line = JSON.stringify(rec) + '\n';
    try {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      const fd = openSync(this.journalPath(), 'a', 0o600);
      try {
        writeSync(fd, line);
        fsyncSync(fd); // durability before the request is failed closed
      } finally {
        closeSync(fd);
      }
    } catch {
      // Last resort: the journal itself is unwritable. Emit to stderr so the
      // operator still sees it; never silently continue.
      // eslint-disable-next-line no-console
      console.error('[eye-api] DEGRADED-JOURNAL-UNWRITABLE', line.trim());
    }
    if (rec.kind === 'degraded_recovered') {
      this.degradedSince = null;
      this.lastError = null;
    } else {
      this.degradedSince ??= rec.at;
      this.lastError = rec.detail.slice(0, 200);
      this.count += 1;
    }
    return rec;
  }

  /** Surfaced by /readyz: degraded is never presented as healthy. */
  state(): { degraded: boolean; since: string | null; incidents: number; lastError: string | null } {
    return {
      degraded: this.degradedSince !== null,
      since: this.degradedSince,
      incidents: this.count,
      lastError: this.lastError,
    };
  }

  markRecovered(detail: string): void {
    if (this.degradedSince === null) return;
    this.record({
      kind: 'degraded_recovered',
      correlationId: null, route: null, failureClass: null, scope: null,
      detail, suppressedCarried: 0,
    });
  }

  /**
   * Gate-2.1 §7: RESTART RECOVERY. A degraded flag held only in memory is a
   * degraded flag that a crash silently clears — so on startup the journal is
   * replayed in order and the flag is restored unless a later
   * `degraded_recovered` record closed it. Recovery is therefore something that
   * has to be RECORDED, not something a restart grants for free.
   */
  reloadFromJournal(): { degraded: boolean; unreconciled: number; since: string | null } {
    let since: string | null = null;
    let count = 0;
    for (const rec of this.readAll()) {
      if (rec.kind === 'degraded_recovered') {
        since = null;
        count = 0;
      } else {
        since ??= rec.at;
        count += 1;
      }
    }
    if (since !== null) {
      this.degradedSince = since;
      this.count = count;
      this.lastError = 'restored from durable journal on startup (unreconciled)';
    }
    return { degraded: since !== null, unreconciled: count, since };
  }

  /**
   * Mark degraded from a GOVERNED database record (an open availability
   * incident), for the case where this process' local journal was lost but the
   * ledger still shows the degradation unreconciled.
   */
  restoreFromIncident(at: string, detail: string): void {
    this.degradedSince ??= at;
    this.count += 1;
    this.lastError = detail.slice(0, 200);
  }

  /** Reconciliation input: every record written by this process' journal. */
  readAll(): DegradedRecord[] {
    const p = this.journalPath();
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as DegradedRecord);
  }

  get journalFile(): string {
    return this.journalPath();
  }
  get journalDir(): string {
    return dirname(this.journalPath());
  }
}

/** Process-wide singleton: the degraded flag is a property of the process. */
export const degradedAudit = new DegradedAuditStore();
