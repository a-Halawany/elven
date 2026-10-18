/**
 * B81 §SI (0119_b81_x_si) — THE SEARCH AND INTENT CAPABILITIES: one narrow shape per port group.
 *
 *   read    shell.searches_of (the principal's OWN saved searches of this domain — current per name + history, one exact version with its
 *           results — and the recent intent records; the port refuses any other principal `(actor)` and an unbound scope `(access)`)
 *   write   shell.save_search (`shell.search.save`: append-only versions, the stale check, the human re-check, every searched leg's receipt
 *           verified against the policy record — the policy version and the cutoff derived there — the result-set digest computed there)
 *           shell.record_intent (`shell.intent.record`: append-only; nothing preselected; an ambiguous reading asks; a command is a hand-off)
 *
 * The capability decides nothing: the ports do. THREE CLAIMS: construction (this code and phase6-search-b81), demonstrated operation (the
 * act, SYNTHETIC), real acceptance (H3) — never claimed.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface SearchReads {
  readonly action: string;
  searchesOf(a: { principalId: string; tenantId: string; domainId: string; savedSearchId: string | null; history: number }): Promise<Row>;
}
export interface SearchWrites extends SearchReads {
  saveSearch(a: { savedSearchId: string; tenantId: string; domainId: string; name: string; expectedVersion: number; query: string; intent: Row | null; filters: Row | null;
                  legs: Row[]; results: Row[]; intentRecordId: string | null; actor: string; correlationId: string }): Promise<Row>;
  recordIntent(a: { intentId: string; tenantId: string; domainId: string; mode: string; input: string; interpreter: string; interpretation: Row; alternatives: Row[];
                    clarification: string | null; choice: string | null; outcome: string; commandAction: string | null; respondsTo: string | null; actor: string; correlationId: string }): Promise<Row>;
}

class SearchCapabilityImpl implements SearchWrites {
  readonly #tx: Tx;
  readonly action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.action = action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  searchesOf(a: Parameters<SearchReads['searchesOf']>[0]) {
    return this.one(sql`select shell.searches_of(${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.savedSearchId}::uuid, ${a.history}::int) as r`, 'searches_of');
  }
  saveSearch(a: Parameters<SearchWrites['saveSearch']>[0]) {
    return this.one(sql`select shell.save_search(${a.savedSearchId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.name}, ${a.expectedVersion}::int, ${a.query},
      ${a.intent === null ? null : JSON.stringify(a.intent)}::jsonb, ${a.filters === null ? null : JSON.stringify(a.filters)}::jsonb, ${JSON.stringify(a.legs)}::jsonb,
      ${JSON.stringify(a.results)}::jsonb, ${a.intentRecordId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'save_search');
  }
  recordIntent(a: Parameters<SearchWrites['recordIntent']>[0]) {
    return this.one(sql`select shell.record_intent(${a.intentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.mode}, ${a.input}, ${a.interpreter},
      ${JSON.stringify(a.interpretation)}::jsonb, ${JSON.stringify(a.alternatives)}::jsonb, ${a.clarification}, ${a.choice}, ${a.outcome}, ${a.commandAction},
      ${a.respondsTo}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_intent');
  }
}

export const SearchCapability = {
  read(tx: Tx, action: string): SearchReads { return new SearchCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): SearchWrites { return new SearchCapabilityImpl(tx, action); },
};
