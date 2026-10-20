/**
 * CP-6 B82 §GM (0121_b82_x_gm) — THE GEOGRAPHIC-REFERENCE CAPABILITIES: one per action class (the Phase 1 discipline: the relation is never
 * a parameter, the transaction unreachable, a handler receives a narrow interface). The read (graph.geo.read) gets the layer; the register
 * (graph.geo.declare / graph.geo.retire) gets the two ports. Every port re-checks the bound action, the domain scope, the acting principal,
 * the human and the data-steward role (governance.assert_approver). CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface GeoDeclareAsk {
  requestId: string; tenantId: string; domainId: string; referenceId: string | null; expectedVersion: number;
  key: string; label: string; kind: string; geometry: Row; crs: string; uncertaintyM: number;
  sourceStatement: string; licenceStatement: string; linkedType: string | null; linkedId: string | null; chokepointKey: string | null;
  reason: string; actor: string; correlationId: string;
}
export interface GeoRetireAsk { requestId: string; tenantId: string; domainId: string; referenceId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }

/** The read (graph.geo.read): the layer the canvases draw. */
export interface GeoReads { layer(a: { tenantId: string; domainId: string; scope: Row }): Promise<Row> }
/** The register (graph.geo.declare / graph.geo.retire). */
export interface GeoWrites extends GeoReads {
  declare(a: GeoDeclareAsk): Promise<Row>;
  retire(a: GeoRetireAsk): Promise<Row>;
}

class GeoCapabilityImpl implements GeoWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: Row }> }> }): Promise<Row> {
    return ((await fragment.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  layer(a: { tenantId: string; domainId: string; scope: Row }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.geo_layer(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.scope)}::jsonb) as r`);
  }
  declare(a: GeoDeclareAsk): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.declare_geo_reference(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.referenceId}::uuid, ${a.expectedVersion}::int,
      ${a.key}, ${a.label}, ${a.kind}, ${JSON.stringify(a.geometry)}::jsonb, ${a.crs}, ${a.uncertaintyM}::numeric, ${a.sourceStatement}, ${a.licenceStatement},
      ${a.linkedType}, ${a.linkedId}::uuid, ${a.chokepointKey}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  retire(a: GeoRetireAsk): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.retire_geo_reference(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.referenceId}::uuid, ${a.expectedVersion}::int,
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const GeoCapability = {
  read(tx: Tx, action: string): GeoReads { return new GeoCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): GeoWrites { return new GeoCapabilityImpl(tx, action); },
};
