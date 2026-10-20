/**
 * CP-6 B40 §VA (0123_b40_x_va) — THE CAPABILITIES of the authenticity, attribute, inheritance and retention-register routes: one narrow
 * interface per action class (the Phase 1 discipline) — a read route has no method to write with, an act names exactly its port. The ports
 * re-check the bound action, the scope, the acting principal, the person and the role. CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface AuthenticityReads {
  keys(a: { tenantId: string; domainId: string; sourceId: string | null }): Promise<Row>;
  evidence(a: { tenantId: string; domainId: string; evdId: string }): Promise<Row>;
}
export interface PublisherKeyDeclareWrites {
  declare(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; keyRef: string; kind: string; publicKeyPem: string | null; pin: string | null;
               validFrom: string | null; validTo: string | null; rotatedFrom: string | null; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface PublisherKeyRetireWrites {
  retire(a: { tenantId: string; domainId: string; keyId: string; fingerprint: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface EvidenceAttributeWrites {
  setAttribute(a: { requestId: string; tenantId: string; domainId: string; evdId: string; version: number; attribute: string; value: unknown; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface ObligationReads {
  inherited(a: { tenantId: string; domainId: string; type: string; id: string; version: number }): Promise<Row>;
  rules(a: { tenantId: string; domainId: string }): Promise<Row>;
}
export interface TransformationRuleProposeWrites {
  propose(a: { requestId: string; tenantId: string; domainId: string; obligation: string; transformation: string; from: string; to: string; objectTypes: string[];
               rationale: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface TransformationRuleDecideWrites {
  decide(a: { tenantId: string; domainId: string; ruleId: string; digest: string; decision: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface TransformationRuleRetireWrites {
  retireRule(a: { tenantId: string; domainId: string; ruleId: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RetentionRegisterReads {
  register(a: { tenantId: string }): Promise<Row>;
}

class VaCapabilityImpl implements AuthenticityReads, PublisherKeyDeclareWrites, PublisherKeyRetireWrites, EvidenceAttributeWrites, ObligationReads,
  TransformationRuleProposeWrites, TransformationRuleDecideWrites, TransformationRuleRetireWrites, RetentionRegisterReads {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql<{ r: Row }>>): Promise<Row> {
    return ((await q.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  keys(a: { tenantId: string; domainId: string; sourceId: string | null }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.publisher_keys_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`);
  }
  evidence(a: { tenantId: string; domainId: string; evdId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.evidence_authenticity_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.evdId}::uuid) as r`);
  }
  declare(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; keyRef: string; kind: string; publicKeyPem: string | null; pin: string | null;
               validFrom: string | null; validTo: string | null; rotatedFrom: string | null; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.declare_publisher_key(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.keyRef},
      ${a.kind}, ${a.publicKeyPem}::text, ${a.pin}::text, ${a.validFrom}::timestamptz, ${a.validTo}::timestamptz, ${a.rotatedFrom}::uuid, ${a.reason}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`);
  }
  retire(a: { tenantId: string; domainId: string; keyId: string; fingerprint: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.retire_publisher_key(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.keyId}::uuid, ${a.fingerprint}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  setAttribute(a: { requestId: string; tenantId: string; domainId: string; evdId: string; version: number; attribute: string; value: unknown; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.set_evidence_attribute(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.evdId}::uuid, ${a.version}::int,
      ${a.attribute}, ${JSON.stringify(a.value ?? null)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  inherited(a: { tenantId: string; domainId: string; type: string; id: string; version: number }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select objects.inherited_obligations(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int) as r`);
  }
  rules(a: { tenantId: string; domainId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select objects.transformation_rules_read(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
  }
  propose(a: { requestId: string; tenantId: string; domainId: string; obligation: string; transformation: string; from: string; to: string; objectTypes: string[];
               rationale: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select objects.propose_transformation_rule(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.obligation}, ${a.transformation},
      ${a.from}, ${a.to}, ${a.objectTypes}::text[], ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  decide(a: { tenantId: string; domainId: string; ruleId: string; digest: string; decision: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select objects.decide_transformation_rule(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ruleId}::uuid, ${a.digest}, ${a.decision}, ${a.reason}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`);
  }
  retireRule(a: { tenantId: string; domainId: string; ruleId: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select objects.retire_transformation_rule(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ruleId}::uuid, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  register(a: { tenantId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select retention.tenant_register(${a.tenantId}::uuid) as r`);
  }
}

export const VaCapability = {
  read(tx: Tx, action: string): AuthenticityReads { return new VaCapabilityImpl(tx, action); },
  declareKey(tx: Tx, action: string): PublisherKeyDeclareWrites { return new VaCapabilityImpl(tx, action); },
  retireKey(tx: Tx, action: string): PublisherKeyRetireWrites { return new VaCapabilityImpl(tx, action); },
  setAttribute(tx: Tx, action: string): EvidenceAttributeWrites { return new VaCapabilityImpl(tx, action); },
  obligations(tx: Tx, action: string): ObligationReads { return new VaCapabilityImpl(tx, action); },
  proposeRule(tx: Tx, action: string): TransformationRuleProposeWrites { return new VaCapabilityImpl(tx, action); },
  decideRule(tx: Tx, action: string): TransformationRuleDecideWrites { return new VaCapabilityImpl(tx, action); },
  retireRule(tx: Tx, action: string): TransformationRuleRetireWrites { return new VaCapabilityImpl(tx, action); },
  register(tx: Tx, action: string): RetentionRegisterReads { return new VaCapabilityImpl(tx, action); },
};
