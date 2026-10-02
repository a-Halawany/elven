/**
 * CP-6 B29 §B (0092) — THE SUPPLY-NETWORK CAPABILITIES: the twin capability's shape (one implementation, narrow interfaces, every write a
 * SECURITY DEFINER port that asserts the caller's own bound action). Reads go through the tables' row security (the domain's twins, versions,
 * elements, the agent's proposals and scan marks).
 *
 *   twin.proposal.draft   → twin.draft_agent_proposals   (the domain's active Supply Chain Agent, in its running supply scan)
 *   twin.proposal.decide  → twin.decide_agent_proposal   (the twin's owner)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SupplyNetworkReads {
  readonly action: string;
  readKinds(): any;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  readProposals(): any;
  readScans(): any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ProposalDraftWrites extends SupplyNetworkReads {
  draft(a: { tenantId: string; domainId: string; twinId: string; version: number; findings: unknown[]; complete: boolean; agentId: string; runId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
export interface ProposalDecideWrites extends SupplyNetworkReads {
  decide(a: { tenantId: string; domainId: string; proposalId: string; decision: 'accepted' | 'dismissed'; note: string | null; actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class SupplyNetworkCapabilityImpl implements ProposalDraftWrites, ProposalDecideWrites {
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
  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readProposals(): any { return this.from('twin.agent_proposals'); }
  readScans(): any { return this.from('twin.agent_scans'); }

  async draft(a: Parameters<ProposalDraftWrites['draft']>[0]) {
    return this.one(sql`select twin.draft_agent_proposals(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int, ${JSON.stringify(a.findings)}::jsonb,
      ${a.complete}, ${a.agentId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decide(a: Parameters<ProposalDecideWrites['decide']>[0]) {
    return this.one(sql`select twin.decide_agent_proposal(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SupplyNetworkCapability = {
  read(tx: Tx, action: string): SupplyNetworkReads { return new SupplyNetworkCapabilityImpl(tx, action); },
  draft(tx: Tx, action: string): ProposalDraftWrites { return new SupplyNetworkCapabilityImpl(tx, action); },
  decide(tx: Tx, action: string): ProposalDecideWrites { return new SupplyNetworkCapabilityImpl(tx, action); },
};
