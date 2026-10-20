/**
 * CP-6 B82 §PX (0121_b82_x_px) — THE TRUST CAPABILITIES: one per action class (the Phase 1 discipline: the relation is never a parameter,
 * the transaction unreachable, a handler receives a narrow interface). The reads (graph.trust.read) get the envelope, the strength and the
 * overview; each act its own port (graph.trust.verify / .attest / .withdraw / .investigate). Every port re-checks the bound action, the
 * domain scope, the acting principal, the human and the role. CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
export interface TrustSubject { tenantId: string; domainId: string; type: string; id: string; version: number }

/** The reads (graph.trust.read): the envelope, the strength, the Trust and Governance overview. */
export interface TrustReads {
  envelope(s: TrustSubject): Promise<Row>;
  strength(s: TrustSubject): Promise<Row>;
  overview(a: { tenantId: string; domainId: string; scope: Row }): Promise<Row>;
}
/** graph.trust.verify: the subject's recorded signatures (the verifier's input) and the recording port. */
export interface TrustVerify {
  signatures(s: TrustSubject): Promise<Row[]>;
  verify(a: TrustSubject & { requestId: string; facet: string; signatures: Row[] | null; actor: string; correlationId: string }): Promise<Row>;
}
/** graph.trust.attest / graph.trust.withdraw. */
export interface TrustAttest {
  attest(a: TrustSubject & { requestId: string; facets: string[]; statement: string; envelopeDigest: string; actor: string; correlationId: string }): Promise<Row>;
  withdraw(a: { requestId: string; tenantId: string; domainId: string; attestationId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
/** graph.trust.investigate. */
export interface TrustInvestigate {
  investigate(a: TrustSubject & { itemId: string; facet: string | null; note: string; actor: string; correlationId: string }): Promise<Row>;
}

class TrustCapabilityImpl implements TrustReads, TrustVerify, TrustAttest, TrustInvestigate {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: unknown }> }> }): Promise<Row> {
    return ((await fragment.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  envelope(s: TrustSubject): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.trust_envelope(${s.tenantId}::uuid, ${s.domainId}::uuid, ${s.type}, ${s.id}::uuid, ${s.version}::int) as r`);
  }
  strength(s: TrustSubject): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.provenance_strength(${s.tenantId}::uuid, ${s.domainId}::uuid, ${s.type}, ${s.id}::uuid, ${s.version}::int) as r`);
  }
  overview(a: { tenantId: string; domainId: string; scope: Row }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.trust_overview(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.scope)}::jsonb) as r`);
  }
  async signatures(s: TrustSubject): Promise<Row[]> {
    const r = (await sql<{ r: Row[] }>`select graph.px_signatures(${s.tenantId}::uuid, ${s.domainId}::uuid, ${s.type}, ${s.id}::uuid, ${s.version}::int) as r`.execute(this.#tx)).rows[0]?.r;
    return Array.isArray(r) ? r : [];
  }
  verify(a: TrustSubject & { requestId: string; facet: string; signatures: Row[] | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.verify_trust(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int, ${a.facet},
      ${a.signatures === null ? null : JSON.stringify(a.signatures)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  attest(a: TrustSubject & { requestId: string; facets: string[]; statement: string; envelopeDigest: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.attest_trust(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int,
      ${a.facets}::text[], ${a.statement}, ${a.envelopeDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  withdraw(a: { requestId: string; tenantId: string; domainId: string; attestationId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.withdraw_trust_attestation(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.attestationId}::uuid, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  investigate(a: TrustSubject & { itemId: string; facet: string | null; note: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.open_trust_investigation(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int,
      ${a.facet}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const TrustCapability = {
  read(tx: Tx, action: string): TrustReads { return new TrustCapabilityImpl(tx, action); },
  verify(tx: Tx, action: string): TrustVerify { return new TrustCapabilityImpl(tx, action); },
  attest(tx: Tx, action: string): TrustAttest { return new TrustCapabilityImpl(tx, action); },
  investigate(tx: Tx, action: string): TrustInvestigate { return new TrustCapabilityImpl(tx, action); },
};
