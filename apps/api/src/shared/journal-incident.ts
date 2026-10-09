/**
 * B33-J (0110): the LEDGER COUNTERPART of a durable-journal record.
 *
 * A fail-closed path that cannot write evidence records the fact in the local durable journal (degraded-store.ts). The journal is a
 * per-process trace; recovery is governed through the ledger (audit.availability_incidents, reconciled only under a recovery capability).
 * A journal record therefore needs exactly ONE ledger incident, linked by `journal_ref` = the record's id, so the governed entrypoint can
 * reconcile it and prove that every journal record since the last recovery was reconciled.
 *
 * Filed at failure time where the path can (best effort — the journal stays the durable trace), and otherwise at boot or at recovery
 * from the journal itself. audit.file_journal_incident is idempotent on journal_ref: a record is never filed twice.
 *
 * The incident states only what the journal KNOWS — the route, the correlation id, the time, the failure class and detail — and says
 * plainly that the request's evidence was never written. Nothing missing is reconstructed.
 */
import { sql } from 'kysely';
import type { Db, Tx } from './db.js';
import type { DegradedRecord } from './degraded-store.js';
import { newId } from './ids.js';

/** Who filed the ledger counterpart, recorded on the incident so its provenance is traceable. */
export type JournalFiler = 'failure_time' | 'journal_backfill:boot' | 'journal_backfill:recovery';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The honest statement an incident carries about what was lost, by the journal record's failure class. Each names what was NOT written
 * and states that nothing was reconstructed; a class that lost no evidence says so.
 */
export function lostEvidenceStatement(rec: Pick<DegradedRecord, 'kind' | 'failureClass' | 'detail'>): string {
  const known = 'Only what the durable journal kept is known: the route, the correlation id, the time, the failure class and its detail. '
    + 'The missing evidence was not reconstructed.';
  const why = rec.detail.slice(0, 200);
  if (rec.kind === 'audit_unavailable' && rec.failureClass === 'audit_unavailable') {
    return 'Authoritative audit persistence was unavailable: the request was refused fail-closed and no audit record of it was written '
      + `(${why}). ${known}`;
  }
  if (rec.failureClass === 'pdp_denial_object_not_recorded') {
    return `Evidence lost: the denial's decision object was never written (${why}); the denial's policy decision and audit record were `
      + `committed without it. ${known}`;
  }
  if (rec.failureClass === 'intake_accounting') {
    return `Evidence lost: the intake suppression accounting for a request was never written (${why}), so a rate-limited drop may be `
      + `uncounted. ${known}`;
  }
  if (rec.failureClass === 'availability_incident_read_failed') {
    return `The governed ledger could not be read at startup (${why}); readiness was kept degraded. No request evidence is described by `
      + 'this record.';
  }
  return `Evidence lost: the request's evidence (stage ${rec.failureClass ?? 'unknown'}) was never written to the audit ledger — `
    + `the write was refused (${why}). ${known}`;
}

/** The sanitized incident description: the journal record's own fields, nothing more. */
export function journalIncidentDetails(rec: DegradedRecord, filedBy: JournalFiler): Record<string, unknown> {
  const correlationIsUuid = rec.correlationId !== null && UUID.test(rec.correlationId);
  return {
    source: 'durable_journal',
    filed_by: filedBy,
    evidence_written: false,
    statement: lostEvidenceStatement(rec),
    known: {
      route: rec.route,
      correlation_id: rec.correlationId,
      ...(correlationIsUuid || rec.correlationId === null ? {} : { correlation_id_not_uuid: true }),
      at: rec.at,
      failure_class: rec.failureClass,
      scope: rec.scope,
      detail: rec.detail.slice(0, 300),
      suppressed_carried: rec.suppressedCarried,
    },
  };
}

/**
 * File the ledger counterpart of ONE journal record (idempotent). Returns the incident id, whether THIS call filed it, and whether it
 * is already reconciled. A `degraded_recovered` record has no counterpart and is refused here, before the port.
 */
export async function fileJournalIncident(
  db: Db | Tx, rec: DegradedRecord, filedBy: JournalFiler,
): Promise<{ incidentId: string; filed: boolean; reconciled: boolean }> {
  if (rec.kind === 'degraded_recovered') throw new Error('a degraded_recovered journal record has no ledger counterpart');
  const correlation = rec.correlationId !== null && UUID.test(rec.correlationId) ? rec.correlationId : null;
  const row = (
    await sql<{ incident_id: string; filed: boolean; reconciled: boolean }>`
      select * from audit.file_journal_incident(
        ${newId()}::uuid, ${rec.kind}, ${rec.scope}, ${correlation}::uuid, ${rec.id},
        ${rec.at}::timestamptz, ${JSON.stringify(journalIncidentDetails(rec, filedBy))}::jsonb)`.execute(db)
  ).rows[0];
  if (row === undefined) throw new Error(`journal record ${rec.id}: the ledger returned no counterpart`);
  return { incidentId: row.incident_id, filed: row.filed, reconciled: row.reconciled };
}

/** The ledger counterparts of the given journal record ids (journal_ref → incident, reconciled or not). */
export async function journalIncidents(
  db: Db | Tx, refs: string[],
): Promise<Map<string, { incidentId: string; reconciled: boolean }>> {
  const out = new Map<string, { incidentId: string; reconciled: boolean }>();
  if (refs.length === 0) return out;
  const rows = (
    await sql<{ journal_ref: string; incident_id: string; reconciled_at: Date | null }>`
      select journal_ref, incident_id, reconciled_at from audit.journal_incidents(${refs}::text[])`.execute(db)
  ).rows;
  for (const r of rows) out.set(r.journal_ref, { incidentId: r.incident_id, reconciled: r.reconciled_at !== null });
  return out;
}
