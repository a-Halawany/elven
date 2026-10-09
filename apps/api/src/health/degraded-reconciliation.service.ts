/**
 * Degraded-state reconciliation across restarts (Gate-2.1 §7).
 *
 * A degraded audit state must not be cleared by restarting the process. On boot
 * this service:
 *   1. replays the durable local journal and restores the degraded flag unless a
 *      `degraded_recovered` record closed it;
 *   2. consults the GOVERNED ledger (audit.open_availability_incidents) and marks
 *      the process degraded for any incident that has not been reconciled, even
 *      if the local journal was lost;
 *   3. records recovery ONLY when both sources agree there is nothing open.
 *
 * B33-J (0110): between 1 and 2, every journal record since the last recovery that has no ledger counterpart (matched by journal_ref) is
 * FILED into the ledger — idempotently, never twice — so the governed entrypoint can reconcile it. Boot never clears anything: the
 * filed incidents are open, and readiness stays degraded until the governed recovery reconciles them and records its proof. A filing
 * that fails is logged and left to the next boot or to the recovery, which files it itself; the journal record stays the durable trace.
 *
 * So /readyz keeps reporting `degraded` after a restart until governed
 * reconciliation actually records recovery.
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB, COMMIT_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';
import { degradedAudit, type DegradedAuditStore } from '../shared/degraded-store.js';
import { fileJournalIncident, journalIncidents } from '../shared/journal-incident.js';

@Injectable()
export class DegradedReconciliationService implements OnModuleInit {
  private readonly log = new Logger('DegradedReconciliation');

  constructor(
    @Inject(APP_DB) private readonly db: Db,
    @Inject(COMMIT_DB) private readonly commitDb: Db,   // B33-J: the failure-path filing authority (the pipeline's failClosed pool)
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcileAtBoot(degradedAudit);
  }

  /** The boot reconciliation against a given journal store (the process singleton in production). */
  async reconcileAtBoot(store: DegradedAuditStore): Promise<{ filed: number; filingFailed: number }> {
    const journal = store.reloadFromJournal();
    if (journal.degraded) {
      this.log.warn(
        `restored DEGRADED audit state from the durable journal ` +
        `(${journal.unreconciled} unreconciled record(s) since ${journal.since ?? 'unknown'})`,
      );
    }

    // B33-J: file the ledger counterpart of every pending journal record that has none (idempotent on journal_ref).
    let filed = 0;
    let filingFailed = 0;
    for (const rec of store.pendingRecords()) {
      try {
        if ((await fileJournalIncident(this.commitDb, rec, 'journal_backfill:boot')).filed) filed += 1;
      } catch (e) {
        filingFailed += 1;
        this.log.warn(`journal record ${rec.id} could not be filed into the ledger at boot (it stays degraded): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (filed > 0) this.log.warn(`${filed} journal-only record(s) filed into the ledger as open availability incidents`);

    let open: Array<{ id: string; detected_at: Date; kind: string }> = [];
    let journalMapped = new Set<string>();
    try {
      open = (
        await sql<{ id: string; detected_at: Date; kind: string }>`
          select id, detected_at, kind from audit.open_availability_incidents()`.execute(this.db)
      ).rows;
      // B33-J: an open incident that IS a pending journal record's counterpart is already counted by the journal replay above.
      const pendingIds = store.pendingRecords().map((r) => r.id);
      journalMapped = new Set([...(await journalIncidents(this.db, pendingIds)).values()].map((c) => c.incidentId));
    } catch (e) {
      // The ledger is unreachable at boot. That is itself a degraded condition:
      // reporting "ok" because the check failed would be exactly the dishonesty
      // this service exists to prevent.
      store.record({
        kind: 'evidence_write_failed',
        correlationId: null,
        route: 'startup.reconciliation',
        failureClass: 'availability_incident_read_failed',
        scope: null,
        detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        suppressedCarried: 0,
      });
      return { filed, filingFailed };
    }

    for (const incident of open) {
      if (journalMapped.has(incident.id)) continue;
      store.restoreFromIncident(
        new Date(incident.detected_at).toISOString(),
        `unreconciled governed incident ${incident.id} (${incident.kind})`,
      );
    }
    if (open.length > 0) {
      this.log.warn(`${open.length} unreconciled availability incident(s) in the ledger — readiness stays degraded`);
    }
    return { filed, filingFailed };
  }
}
