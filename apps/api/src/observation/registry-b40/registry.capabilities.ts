/**
 * CP-6 B40 §RG (0123_b40_x_rg) — THE REGISTRY CAPABILITIES: one narrow interface per action class (the Phase 1 discipline). Each method calls ONE
 * port; the ports re-check the bound action, the scope, the acting principal, the person, the role and the separation of duties (the TypeScript
 * shapes the call; it is never the guard). The reads call definer reads that assert the caller's read scope (observation.assert_read_scope).
 * CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { ObservationCapability, type RegistryWrites } from '../observation.capabilities.js';

type Row = Record<string, unknown>;

export interface RegistryReads {
  candidates(a: { tenantId: string; domainId: string }): Promise<Row>;
  record(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row>;
  impact(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row>;
  preview(a: { tenantId: string; domainId: string; sourceId: string; change: Row }): Promise<Row>;
}
export interface DiscoveryWrites {
  propose(a: { requestId: string; tenantId: string; domainId: string; name: string; publisher: string; howFound: string; termsUrl: string | null; purposes: string[]; assessment: string;
               actor: string; correlationId: string }): Promise<Row>;
  decline(a: { tenantId: string; domainId: string; candidateId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
/** The promotion: the registration (the registry capability, unchanged) and the candidate's promotion in ONE transaction. */
export interface PromotionWrites {
  registry: RegistryWrites;
  promote(a: { tenantId: string; domainId: string; candidateId: string; sourceId: string; contractVersion: number; actor: string; correlationId: string }): Promise<Row>;
  candidates(a: { tenantId: string; domainId: string }): Promise<Row>;
}
export interface EvaluationWrites {
  evaluate(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; authority: string; rightsEvidence: string; coverageFit: string;
                cost: string; risks: string[]; contractTests: Array<{ name: string; outcome: string; note?: string | null }>; recommendation: string; reason: string;
                actor: string; correlationId: string }): Promise<Row>;
}
/** The rights lifecycle: the change port, and the registry capability the schedule synchronisation reads and writes through. */
export interface RightsChangeWrites {
  registry: RegistryWrites;
  change(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; operation: string; purposes: string[] | null; reason: string;
              evidence: string | null; deletionObligation: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface CustomerApprovalWrites {
  approve(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; decision: string; scopeStatement: string; reason: string; claim: string;
               actor: string; correlationId: string }): Promise<Row>;
}
export interface StewardshipWrites {
  change(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; expectedVersion: number; steward: string; state: string; reviewDue: string; reason: string;
              actor: string; correlationId: string }): Promise<Row>;
}
export interface IncidentWrites {
  open(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; kind: string; statement: string; owner: string; actor: string; correlationId: string }): Promise<Row>;
  resolve(a: { tenantId: string; domainId: string; incidentId: string; resolution: string; actor: string; correlationId: string }): Promise<Row>;
}

class RegistryB40Impl implements RegistryReads, DiscoveryWrites, EvaluationWrites, CustomerApprovalWrites, IncidentWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql<{ r: Row }>>): Promise<Row> {
    return ((await q.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  // ── reads ──
  candidates(a: { tenantId: string; domainId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.source_candidates_read(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
  }
  record(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.source_registry_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`);
  }
  impact(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.rights_revocation_impact(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`);
  }
  preview(a: { tenantId: string; domainId: string; sourceId: string; change: Row }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.source_change_impact(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${JSON.stringify(a.change)}::jsonb) as r`);
  }
  // ── discovery ──
  propose(a: { requestId: string; tenantId: string; domainId: string; name: string; publisher: string; howFound: string; termsUrl: string | null; purposes: string[]; assessment: string;
               actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.propose_source_candidate(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.name}, ${a.publisher}, ${a.howFound},
      ${a.termsUrl}::text, ${JSON.stringify(a.purposes)}::jsonb, ${a.assessment}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  decline(a: { tenantId: string; domainId: string; candidateId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.decline_source_candidate(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.candidateId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  promote(a: { tenantId: string; domainId: string; candidateId: string; sourceId: string; contractVersion: number; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.promote_source_candidate(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.candidateId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  // ── evaluation ──
  evaluate(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; authority: string; rightsEvidence: string; coverageFit: string;
                cost: string; risks: string[]; contractTests: Array<{ name: string; outcome: string; note?: string | null }>; recommendation: string; reason: string;
                actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.record_source_evaluation(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int,
      ${a.authority}, ${a.rightsEvidence}, ${a.coverageFit}, ${a.cost}, ${JSON.stringify(a.risks)}::jsonb, ${JSON.stringify(a.contractTests)}::jsonb, ${a.recommendation}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  // ── the rights lifecycle ──
  changeRights(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; operation: string; purposes: string[] | null; reason: string;
                    evidence: string | null; deletionObligation: string | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.change_rights(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int, ${a.operation},
      ${a.purposes === null ? null : JSON.stringify(a.purposes)}::jsonb, ${a.reason}, ${a.evidence}::text, ${a.deletionObligation}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  // ── the customer approval ──
  approve(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; decision: string; scopeStatement: string; reason: string; claim: string;
               actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.record_customer_approval(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int,
      ${a.decision}, ${a.scopeStatement}, ${a.reason}, ${a.claim}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  // ── stewardship ──
  stewardship(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; expectedVersion: number; steward: string; state: string; reviewDue: string; reason: string;
                   actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.change_stewardship(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.expectedVersion}::int,
      ${a.steward}::uuid, ${a.state}, ${a.reviewDue}::date, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  // ── incidents ──
  open(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; kind: string; statement: string; owner: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.open_source_incident(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.kind}, ${a.statement},
      ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  resolve(a: { tenantId: string; domainId: string; incidentId: string; resolution: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.resolve_source_incident(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.incidentId}::uuid, ${a.resolution}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const RegistryB40Capability = {
  read(tx: Tx, action: string): RegistryReads { return new RegistryB40Impl(tx, action); },
  discovery(tx: Tx, action: string): DiscoveryWrites { return new RegistryB40Impl(tx, action); },
  promotion(tx: Tx, action: string): PromotionWrites {
    const impl = new RegistryB40Impl(tx, action);
    return { registry: ObservationCapability.registry(tx, action), promote: (a) => impl.promote(a), candidates: (a) => impl.candidates(a) };
  },
  evaluation(tx: Tx, action: string): EvaluationWrites { return new RegistryB40Impl(tx, action); },
  rights(tx: Tx, action: string): RightsChangeWrites {
    const impl = new RegistryB40Impl(tx, action);
    return { registry: ObservationCapability.registry(tx, action), change: (a) => impl.changeRights(a) };
  },
  customer(tx: Tx, action: string): CustomerApprovalWrites { return new RegistryB40Impl(tx, action); },
  stewardship(tx: Tx, action: string): StewardshipWrites {
    const impl = new RegistryB40Impl(tx, action);
    return { change: (a) => impl.stewardship(a) };
  },
  incidents(tx: Tx, action: string): IncidentWrites { return new RegistryB40Impl(tx, action); },
};
