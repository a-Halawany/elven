/**
 * SOURCE-IMPACT CAPABILITIES — CP-6 B24 (0086 §markers; F-P6-07, V03-T-077).
 *
 * The markers B22 (0083 §6) set on the products derived from a degraded source — forecasts, warnings, scenarios, runs,
 * packages — READ where a product is used, and ACKNOWLEDGED by the person who answers for using it. Two narrow shapes:
 *
 *   read          the markers (under RLS), the products they reach (titles only), and the BEARING of one package version
 *                 (decision.source_impact_bearing: the active markers on the package or on what that version cites, each
 *                 with the acknowledgement recorded for THIS version, if any) — `observation.source_impact.read`;
 *   acknowledge   the reads plus ONE write, decision.acknowledge_source_impact — the port asserts the bound action
 *                 (`decision.source_impact.acknowledge`), the acting principal, a named active human holding
 *                 decision_authority, and that every marker named is active and bears on that version.
 *
 * The markers are observation's (the table is observation.source_impact_markers), so the capability lives here; the
 * acknowledgement is exercised by the decision route (…/decisions/:packageId/source-impact/acknowledge) — the decision
 * module imports this file, never the other way (ES-04-003).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/** One active marker bearing on a package version, as decision.source_impact_bearing answers it. */
export interface BearingRow {
  marker_id: string; source_id: string; subject_kind: string; subject_id: string; health_state: string; reason: string | null; set_at: string;
  bearing: string | null; acknowledged: boolean; acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_id: string | null;
}
/** What the acknowledgement port answers. */
export interface Acknowledgement {
  acknowledgement_id: string | null; package_id: string; version: number; repeated: boolean; acknowledged: string[]; already_acknowledged: string[];
  outstanding: Array<{ marker_id: string; subject_kind: string; subject_id: string; health_state: string }>; acknowledged_by: string; acknowledged_at: string | null; reason: string;
}

abstract class SourceImpactCore {
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
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SourceImpactReads {
  readonly action: string;
  readMarkers(): any;
  readSourceContracts(): any;
  readForecasts(): any;
  readWarnings(): any;
  readScenarios(): any;
  readRuns(): any;
  readPackages(): any;
  /** The active markers bearing on one version of a package, with the acknowledgement recorded for that version (0086 §M2). */
  bearing(a: { tenantId: string; domainId: string; packageId: string; version: number }): Promise<BearingRow[]>;
}
export interface SourceImpactWrites extends SourceImpactReads {
  acknowledgeSourceImpact(a: { tenantId: string; domainId: string; packageId: string; version: number; markerIds: unknown; reason: string | null;
                               actor: string; eventId: string; correlationId: string }): Promise<Acknowledgement>;
}

class SourceImpactCapabilityImpl extends SourceImpactCore implements SourceImpactWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readMarkers(): any { return this.from('observation.source_impact_markers'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  readScenarios(): any { return this.from('prediction.scenarios_current'); }
  readRuns(): any { return this.from('simulation.runs_current'); }
  readPackages(): any { return this.from('decision.packages_current'); }

  async bearing(a: Parameters<SourceImpactReads['bearing']>[0]): Promise<BearingRow[]> {
    return this.call<BearingRow>(sql`
      select b.marker_id::text, b.source_id::text, b.subject_kind, b.subject_id::text, b.health_state, b.reason,
             to_char(b.set_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as set_at, b.bearing, b.acknowledged, b.acknowledged_by::text,
             to_char(b.acknowledged_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as acknowledged_at, b.acknowledgement_id::text
        from decision.source_impact_bearing(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int) b`);
  }

  async acknowledgeSourceImpact(a: Parameters<SourceImpactWrites['acknowledgeSourceImpact']>[0]): Promise<Acknowledgement> {
    const rows = await this.call<{ r: Acknowledgement }>(sql`select decision.acknowledge_source_impact(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${a.markerIds === null || a.markerIds === undefined ? null : JSON.stringify(a.markerIds)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('the source-impact acknowledgement returned no row'); return r;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SourceImpactCapability = {
  read(tx: Tx, action: string): SourceImpactReads { return new SourceImpactCapabilityImpl(tx, action); },
  acknowledge(tx: Tx, action: string): SourceImpactWrites { return new SourceImpactCapabilityImpl(tx, action); },
};
