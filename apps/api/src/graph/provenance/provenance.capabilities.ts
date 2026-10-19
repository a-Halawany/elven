/**
 * CP-6 B50 §PV (0120_b50_x_pv) — THE PROVENANCE CAPABILITIES: one per action class, the Phase 1 discipline (the relation is never a parameter,
 * the transaction unreachable, a handler receives a narrow interface). A read route gets the reads; the fitness mark gets the mark; the
 * challenge acts get the challenge ports; the agent's registration gets the registry; the AGENT'S one surface gets graph.provenance_construct
 * and nothing else. The ports re-check everything (the bound action, the scope, the acting principal, the role, the separation).
 * CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class ProvenanceCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async one(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: Row }> }> }): Promise<Row> {
    const rows = (await fragment.execute(this.#tx)).rows;
    return (rows[0]?.r ?? {}) as Row;
  }
}

export interface Subject { tenantId: string; domainId: string; type: string; id: string; version: number }

/** The reads (graph.provenance.read): explain, the diffs, the fitness, the alignment, the challenges, the agent's registry. */
export interface ProvenanceReads {
  explain(a: Subject): Promise<Row>;
  revisionDiff(a: { tenantId: string; domainId: string; type: string; id: string; from: number; to: number }): Promise<Row>;
  graphRevisionDiff(a: { tenantId: string; domainId: string; from: number; to: number }): Promise<Row>;
  fitness(a: Subject): Promise<Row>;
  alignment(a: { tenantId: string; domainId: string; kind: string; id: string; version: number | null }): Promise<Row>;
  challenges(a: { tenantId: string; domainId: string; subjectId: string | null; state: string | null }): Promise<Row>;
  agentState(a: { tenantId: string; domainId: string }): Promise<Row>;
}

/** The generic unfit mark (graph.provenance.fitness.mark). */
export interface FitnessMarkWrites extends ProvenanceReads {
  markFitness(a: Subject & { markId: string; route: string | null; note: string; actor: string; correlationId: string }): Promise<Row>;
}

/** The contest path (graph.provenance.challenge.*). */
export interface ChallengeWrites extends ProvenanceReads {
  openChallenge(a: Subject & { challengeId: string; requestId: string; grounds: string; disputed: string[]; reviewWithinDays: number | null; actor: string; correlationId: string }): Promise<Row>;
  reviewChallenge(a: { challengeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  submitEvidence(a: { evidenceId: string; challengeId: string; tenantId: string; domainId: string; ref: string; digest: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  decideChallenge(a: { challengeId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  withdrawChallenge(a: { challengeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  escalateChallenge(a: { challengeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

/** The registry (graph.provenance.agent.register / .revoke). */
export interface ProvenanceAgentRegistryWrites extends ProvenanceReads {
  registerAgent(a: { agentId: string; tenantId: string; domainId: string; principalId: string; version: string; codeDigest: string; owner: string; budgets: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  revokeAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

/** THE AGENT'S ONE SURFACE (graph.provenance.construct) — no read, no other write. */
export interface ProvenanceConstructWrites {
  construct(a: Subject & { runId: string; agentVersion: string; codeDigest: string; correlationId: string }): Promise<Row>;
}

class ProvenanceCapabilityImpl extends ProvenanceCore implements FitnessMarkWrites, ChallengeWrites, ProvenanceAgentRegistryWrites, ProvenanceConstructWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  explain(a: Subject): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.explain(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int) as r`);
  }
  revisionDiff(a: { tenantId: string; domainId: string; type: string; id: string; from: number; to: number }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.revision_diff(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.from}::int, ${a.to}::int) as r`);
  }
  graphRevisionDiff(a: { tenantId: string; domainId: string; from: number; to: number }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.graph_revision_diff(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::bigint, ${a.to}::bigint) as r`);
  }
  fitness(a: Subject): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.product_fitness(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int) as r`);
  }
  alignment(a: { tenantId: string; domainId: string; kind: string; id: string; version: number | null }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.alignment_check(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.id}::uuid, ${a.version}::int) as r`);
  }
  challenges(a: { tenantId: string; domainId: string; subjectId: string | null; state: string | null }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.knowledge_challenges_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectId}::uuid, ${a.state}::text) as r`);
  }
  agentState(a: { tenantId: string; domainId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.provenance_agent_state(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
  }
  markFitness(a: Subject & { markId: string; route: string | null; note: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.mark_product_fitness(${a.markId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int, ${a.route}::text, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  openChallenge(a: Subject & { challengeId: string; requestId: string; grounds: string; disputed: string[]; reviewWithinDays: number | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.open_knowledge_challenge(${a.challengeId}::uuid, ${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int,
      ${a.grounds}, ${JSON.stringify(a.disputed)}::jsonb, ${a.reviewWithinDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  reviewChallenge(a: { challengeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.review_knowledge_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  submitEvidence(a: { evidenceId: string; challengeId: string; tenantId: string; domainId: string; ref: string; digest: string; note: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.submit_knowledge_challenge_evidence(${a.evidenceId}::uuid, ${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ref}, ${a.digest}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  decideChallenge(a: { challengeId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.decide_knowledge_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  withdrawChallenge(a: { challengeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.withdraw_knowledge_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  escalateChallenge(a: { challengeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.escalate_knowledge_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  registerAgent(a: { agentId: string; tenantId: string; domainId: string; principalId: string; version: string; codeDigest: string; owner: string; budgets: Row; actor: string; eventId: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.register_provenance_agent(${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.version}, ${a.codeDigest},
      ${a.owner}::uuid, ${JSON.stringify(a.budgets)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  revokeAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.revoke_provenance_agent(${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  construct(a: Subject & { runId: string; agentVersion: string; codeDigest: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.provenance_construct(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int, ${a.agentVersion}, ${a.codeDigest}, ${a.correlationId}::uuid) as r`);
  }
}

export const ProvenanceCapability = {
  read(tx: Tx, action: string): ProvenanceReads { return new ProvenanceCapabilityImpl(tx, action); },
  fitnessMark(tx: Tx, action: string): FitnessMarkWrites { return new ProvenanceCapabilityImpl(tx, action); },
  challenge(tx: Tx, action: string): ChallengeWrites { return new ProvenanceCapabilityImpl(tx, action); },
  agentRegistry(tx: Tx, action: string): ProvenanceAgentRegistryWrites { return new ProvenanceCapabilityImpl(tx, action); },
  construct(tx: Tx, action: string): ProvenanceConstructWrites { return new ProvenanceCapabilityImpl(tx, action); },
};
