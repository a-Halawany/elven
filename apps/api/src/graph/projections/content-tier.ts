/**
 * THE MEMORY CONTENT TIER'S FAILURE CLASSES (CP-6 B20, D9; CP-6 B21 — Codex B20-F1). Under graph/projections so the shared
 * fallback reader (fallback.ts) and MemoryService (memory.service.ts, which imports the reader) share ONE classification
 * without a cycle — the boundaries gate refuses one; the same reason projection-state.ts exists. memory.service.ts re-exports
 * isContentTierFailure (the unit test's import path).
 */
import { InjectedFault } from '../../observation/fault-injection.js';

/**
 * A STATEMENT-level failure of a canonical read that leaves the connection alive, by SQLSTATE: class 53 (insufficient
 * resources), class 58 (system error), class XX (internal error), 57014 (query_canceled — a statement timeout) and 55P03
 * (lock_not_available). A connection-class failure (08xxx; 57P01–57P03) is NOT one: it kills the transaction the metadata was
 * read in, and the request fails as before. An injected fault is told apart by its class (InjectedFault), not here.
 */
export function isContentTierFailure(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string') return false;
  return code.startsWith('53') || code.startsWith('58') || code.startsWith('XX') || code === '57014' || code === '55P03';
}

/** The detail a degraded answer carries — an injected fault's point, or the SQLSTATE and the message cut at 120; null when `e` is neither (the caller rethrows it). */
export function contentFailureDetail(e: unknown): string | null {
  if (e instanceof InjectedFault) return `injected fault at ${e.point}`;
  if (isContentTierFailure(e)) return `${String((e as { code?: string }).code)}: ${String((e as Error).message).slice(0, 120)}`;
  return null;
}

/** The two canonical statements of the withdrawn-mode memory reader (fallback.ts memoryItemsFromLog): the derivation's policy columns, the absent rows' versions. */
export type ContentTierStatement = 'memory.expected_items' | 'canonical_versions';

/**
 * B21 (Codex B20-F1): a canonical statement of the withdrawn-mode memory reader did not answer — raised INSIDE the reader after
 * its savepoint rolled back, so the transaction stays usable; the caller answers by the withdrawn rule (MemoryService: 503
 * EYE-DEG-001 — nothing verified remains to gate a metadata answer on; the briefing composer: the memory source degraded, the
 * items omitted and said). NOT an absent row: `content_tier: 'absent'` is a DATA condition (the statement answered and held no
 * version the log names) and is served from the log's metadata.
 */
export class ContentTierUnavailable extends Error {
  constructor(readonly statement: ContentTierStatement, readonly detail: string) {
    super(`the content tier did not answer at ${statement}: ${detail}`);
  }
}
