/**
 * COVERAGE-REMEDIATION CAPABILITIES — CP-6 B28 (0088 §R; the B24 carryover (a): the remediation workflow on source coverage loss).
 *
 * A source.coverage_loss attention item (0083 §6, the source-health subscriber) is ROUTED; a remediation is what a person OPENS from it:
 * an owner, the gap (the loss window and the blind-spot / degraded-region measurements, absence declared), the steps (a fallback
 * source, a named re-collection run, the gap accepted by a second person) and the closure. Two narrow shapes:
 *
 *   read    the remediations and their ledger (under RLS), the source contracts (names), the source's HEALTH NOW
 *           (observation.source_health_now — the latest of its SourceHealthChanged announcements, coverage evaluations and lifecycle
 *           events, with its basis) — `observation.coverage_remediation.read`;
 *   write   the reads plus ONE port per act, each asserting its own bound action, the scope, the acting principal and a named
 *           active human: observation.open_coverage_remediation (`observation.coverage_remediation.open`),
 *           observation.add_coverage_remediation_step (`….step`), observation.close_coverage_remediation (`….close`),
 *           observation.withdraw_coverage_remediation (`….withdraw`).
 *
 * The AUTOMATIC closure on recovery is not here: the source-health subscriber's port (observation.mark_source_impact, 0088 §R4) closes
 * the open remediation when it applies a healthy | active signal, in the delivery's own transaction.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/** The source's health as the records stand, with what says so. */
export interface HealthNow { state: string; at: string | null; basis: string; ref: string | null }
/** What the ports answer (the row's shape is the table's; these are the ports' own jsonb answers). */
export type RemediationAnswer = Record<string, unknown> & { remediation_id: string; state: string };

abstract class CoverageRemediationCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one<T>(q: ReturnType<typeof sql>, what: string): Promise<T> {
    const rows = await this.call<{ r: T }>(q);
    const r = rows[0]?.r; if (r === undefined) throw new Error(`${what} returned no row`); return r;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CoverageRemediationReads {
  readonly action: string;
  readRemediations(): any;
  readRemediationEvents(): any;
  readSourceContracts(): any;
  /** The source's health now, from the records (0088 §R2). */
  healthNow(a: { tenantId: string; domainId: string; sourceId: string }): Promise<HealthNow>;
  /** The remediations of the named sources, the open one first (observation.source_remediations — the read the warnings' coverage gaps join). */
  sourceRemediations(a: { tenantId: string; domainId: string; sourceIds: string[] }): Promise<Array<Record<string, unknown>>>;
}
export interface CoverageRemediationWrites extends CoverageRemediationReads {
  openRemediation(a: { remediationId: string; tenantId: string; domainId: string; sourceId: string; itemId: string; owner: string; reason: string | null;
                       actor: string; eventId: string; correlationId: string }): Promise<RemediationAnswer>;
  addStep(a: { tenantId: string; domainId: string; remediationId: string; kind: string; fallbackSourceId: string | null; runId: string | null; reason: string | null;
               actor: string; eventId: string; correlationId: string }): Promise<RemediationAnswer>;
  closeRemediation(a: { tenantId: string; domainId: string; remediationId: string; kind: string; note: string | null; actor: string; eventId: string; correlationId: string }): Promise<RemediationAnswer>;
  withdrawRemediation(a: { tenantId: string; domainId: string; remediationId: string; reason: string | null; actor: string; eventId: string; correlationId: string }): Promise<RemediationAnswer>;
}

class CoverageRemediationCapabilityImpl extends CoverageRemediationCore implements CoverageRemediationWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readRemediations(): any { return this.from('observation.coverage_remediations'); }
  readRemediationEvents(): any { return this.from('observation.coverage_remediation_events'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }

  async healthNow(a: Parameters<CoverageRemediationReads['healthNow']>[0]): Promise<HealthNow> {
    return this.one<HealthNow>(sql`select observation.source_health_now(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`, 'the source health read');
  }

  async sourceRemediations(a: Parameters<CoverageRemediationReads['sourceRemediations']>[0]): Promise<Array<Record<string, unknown>>> {
    return this.call<Record<string, unknown>>(sql`select r.source_id::text, r.remediation_id::text, r.item_id::text, r.state, r.owner_principal_id::text, r.gap_from, r.gap_to, r.gap,
      r.steps, r.closure, r.opened_at, r.closed_at, r.health_now
      from observation.source_remediations(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceIds}::uuid[]) r`);
  }

  async openRemediation(a: Parameters<CoverageRemediationWrites['openRemediation']>[0]): Promise<RemediationAnswer> {
    return this.one<RemediationAnswer>(sql`select observation.open_coverage_remediation(${a.remediationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.itemId}::uuid, ${a.owner}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'the remediation opening');
  }

  async addStep(a: Parameters<CoverageRemediationWrites['addStep']>[0]): Promise<RemediationAnswer> {
    return this.one<RemediationAnswer>(sql`select observation.add_coverage_remediation_step(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.remediationId}::uuid, ${a.kind},
      ${a.fallbackSourceId}::uuid, ${a.runId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'the remediation step');
  }

  async closeRemediation(a: Parameters<CoverageRemediationWrites['closeRemediation']>[0]): Promise<RemediationAnswer> {
    return this.one<RemediationAnswer>(sql`select observation.close_coverage_remediation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.remediationId}::uuid, ${a.kind},
      ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'the remediation closure');
  }

  async withdrawRemediation(a: Parameters<CoverageRemediationWrites['withdrawRemediation']>[0]): Promise<RemediationAnswer> {
    return this.one<RemediationAnswer>(sql`select observation.withdraw_coverage_remediation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.remediationId}::uuid, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'the remediation withdrawal');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CoverageRemediationCapability = {
  read(tx: Tx, action: string): CoverageRemediationReads { return new CoverageRemediationCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): CoverageRemediationWrites { return new CoverageRemediationCapabilityImpl(tx, action); },
};
