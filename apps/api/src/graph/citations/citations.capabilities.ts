/**
 * CP-6 B82 §EV (0121_b82_x_ev) — THE CITATION CAPABILITY: the one read a citation route receives (the Phase 1 discipline: the relation is never
 * a parameter, the transaction unreachable, a handler gets a narrow interface). graph.resolve_citation asserts the caller's read scope itself;
 * the route's PDP action is the EXISTING graph.provenance.read (DESIGN D9 — no new permission). executive.signature_of is an invoker read
 * under the caller's RLS. CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { CitationRefRow } from '../b82-seams.js';

type Row = Record<string, unknown>;

export interface CitationReads {
  resolve(a: { tenantId: string; domainId: string; refs: CitationRefRow[]; depth: number }): Promise<Row[]>;
  signaturesOf(a: { subjectKind: string; subjectId: string; subjectVersion: number }): Promise<Row[]>;
}

class CitationCapabilityImpl implements CitationReads {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async resolve(a: { tenantId: string; domainId: string; refs: CitationRefRow[]; depth: number }): Promise<Row[]> {
    const rows = (await sql<{ r: Row[] }>`select graph.resolve_citation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.refs)}::jsonb, ${a.depth}::int) as r`.execute(this.#tx)).rows;
    return rows[0]?.r ?? [];
  }
  async signaturesOf(a: { subjectKind: string; subjectId: string; subjectVersion: number }): Promise<Row[]> {
    const rows = (await sql<{ r: Row[] }>`select executive.signature_of(${a.subjectKind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int) as r`.execute(this.#tx)).rows;
    return rows[0]?.r ?? [];
  }
}

export const CitationCapability = {
  read(tx: Tx, action: string): CitationReads { return new CitationCapabilityImpl(tx, action); },
};
