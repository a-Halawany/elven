/**
 * CP-6 B29 §A (0092) — THE COMPOSITION CAPABILITIES: the twin capability's shape (one implementation, narrow interfaces, every write a
 * SECURITY DEFINER port that asserts the caller's own bound action) for the kind registry, the contracts, the links and the coupling
 * proposals. Reads go through the tables' row security (the kind registry: product kinds and the caller's own x- kinds).
 *
 *   twin.kind.register    → twin.register_kind       (human-gated by the PDP; an x- kind of this tenant and domain)
 *   twin.contract.publish → twin.publish_contract    (the twin's owner)
 *   twin.link.declare     → twin.declare_link        (the downstream owner)
 *   twin.link.retire      → twin.retire_link         (the downstream owner)
 *   twin.coupling.apply   → twin.apply_coupling      (the downstream owner; through twin.open_version / twin.ground_element)
 *   twin.coupling.decline → twin.decline_coupling    (the downstream owner)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CompositionReads {
  readonly action: string;
  readKinds(): any;
  readContracts(): any;
  readLinks(): any;
  readProposals(): any;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  /** twin.dependency_completeness — null when the twin is not visible in this domain. */
  completeness(a: { tenantId: string; domainId: string; twinId: string }): Promise<Record<string, unknown> | null>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Ids { tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }
export interface KindWrites extends CompositionReads {
  registerKind(a: Ids & { kind: string; description: string; elementSchema: Record<string, unknown> }): Promise<Record<string, unknown>>;
}
export interface ContractWrites extends CompositionReads {
  publishContract(a: Ids & { twinId: string; exposed: Record<string, unknown>; approvedUses: { method_families: string[]; decision_classes: string[] } }): Promise<Record<string, unknown>>;
}
export interface LinkWrites extends CompositionReads {
  declareLink(a: Ids & { linkId: string; upstreamTwinId: string; downstreamTwinId: string; mapping: Array<{ from: string; to: string }>; use: string }): Promise<Record<string, unknown>>;
  retireLink(a: Ids & { linkId: string; reason: string }): Promise<Record<string, unknown>>;
}
export interface CouplingWrites extends CompositionReads {
  applyCoupling(a: Ids & { proposalId: string }): Promise<Record<string, unknown>>;
  declineCoupling(a: Ids & { proposalId: string; reason: string }): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class CompositionCapabilityImpl implements KindWrites, ContractWrites, LinkWrites, CouplingWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Record<string, unknown> } | undefined)?.r) ?? {};
  }

  readKinds(): any { return this.from('twin.twin_kind_schemas'); }
  readContracts(): any { return this.from('twin.twin_contracts'); }
  readLinks(): any { return this.from('twin.twin_links'); }
  readProposals(): any { return this.from('twin.coupling_proposals'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  async completeness(a: { tenantId: string; domainId: string; twinId: string }): Promise<Record<string, unknown> | null> {
    const r = await sql<{ r: Record<string, unknown> | null }>`select twin.dependency_completeness(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? null;
  }

  async registerKind(a: Parameters<KindWrites['registerKind']>[0]) {
    return this.one(sql`select twin.register_kind(${a.kind}, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.description}, ${JSON.stringify(a.elementSchema)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async publishContract(a: Parameters<ContractWrites['publishContract']>[0]) {
    return this.one(sql`select twin.publish_contract(${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.exposed)}::jsonb,
      ${JSON.stringify(a.approvedUses)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async declareLink(a: Parameters<LinkWrites['declareLink']>[0]) {
    return this.one(sql`select twin.declare_link(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.upstreamTwinId}::uuid, ${a.downstreamTwinId}::uuid,
      ${JSON.stringify(a.mapping)}::jsonb, ${a.use}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async retireLink(a: Parameters<LinkWrites['retireLink']>[0]) {
    return this.one(sql`select twin.retire_link(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async applyCoupling(a: Parameters<CouplingWrites['applyCoupling']>[0]) {
    return this.one(sql`select twin.apply_coupling(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async declineCoupling(a: Parameters<CouplingWrites['declineCoupling']>[0]) {
    return this.one(sql`select twin.decline_coupling(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CompositionCapability = {
  read(tx: Tx, action: string): CompositionReads { return new CompositionCapabilityImpl(tx, action); },
  kind(tx: Tx, action: string): KindWrites { return new CompositionCapabilityImpl(tx, action); },
  contract(tx: Tx, action: string): ContractWrites { return new CompositionCapabilityImpl(tx, action); },
  link(tx: Tx, action: string): LinkWrites { return new CompositionCapabilityImpl(tx, action); },
  coupling(tx: Tx, action: string): CouplingWrites { return new CompositionCapabilityImpl(tx, action); },
};
