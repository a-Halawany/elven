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
 * So /readyz keeps reporting `degraded` after a restart until governed
 * reconciliation actually records recovery.
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';
import { degradedAudit } from '../shared/degraded-store.js';

@Injectable()
export class DegradedReconciliationService implements OnModuleInit {
  private readonly log = new Logger('DegradedReconciliation');

  constructor(@Inject(APP_DB) private readonly db: Db) {}

  async onModuleInit(): Promise<void> {
    const journal = degradedAudit.reloadFromJournal();
    if (journal.degraded) {
      this.log.warn(
        `restored DEGRADED audit state from the durable journal ` +
        `(${journal.unreconciled} unreconciled record(s) since ${journal.since ?? 'unknown'})`,
      );
    }

    let open: Array<{ id: string; detected_at: Date; kind: string }> = [];
    try {
      open = (
        await sql<{ id: string; detected_at: Date; kind: string }>`
          select id, detected_at, kind from audit.open_availability_incidents()`.execute(this.db)
      ).rows;
    } catch (e) {
      // The ledger is unreachable at boot. That is itself a degraded condition:
      // reporting "ok" because the check failed would be exactly the dishonesty
      // this service exists to prevent.
      degradedAudit.record({
        kind: 'evidence_write_failed',
        correlationId: null,
        route: 'startup.reconciliation',
        failureClass: 'availability_incident_read_failed',
        scope: null,
        detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        suppressedCarried: 0,
      });
      return;
    }

    for (const incident of open) {
      degradedAudit.restoreFromIncident(
        new Date(incident.detected_at).toISOString(),
        `unreconciled governed incident ${incident.id} (${incident.kind})`,
      );
    }
    if (open.length > 0) {
      this.log.warn(`${open.length} unreconciled availability incident(s) in the ledger — readiness stays degraded`);
    }
  }
}
