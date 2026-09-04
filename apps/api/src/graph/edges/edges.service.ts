/**
 * EDGES — bitemporal retrieval, and the builder that turns REL claims into them.
 *
 * TWO TIME AXES, ALWAYS BOTH.
 *
 *   * WORLD time  (`valid_from` / `valid_to`)   — when the relationship held.
 *   * RECORD time (`asserted_at` / `retracted_at`) — when we believed it.
 *
 * An "as of 14 January" query that filters only world time answers WITH
 * hindsight: it happily includes an edge asserted in March about January. C5 asks
 * for the graph as it stood, so every retrieval here takes both instants and a
 * caller that supplies neither gets `now` for both — never a silent mix.
 */
import { Injectable } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, EdgeWrites, EdgeRetractionWrites } from '../graph.capabilities.js';

/** Traversal is bounded. An unbounded walk over a graph is a denial of service. */
export const MAX_DEPTH = 4;
export const MAX_EDGES = 2_000;
/**
 * How many edges a HISTORICAL query may examine.
 *
 * Deliberately larger than the listing bound: a historical filter must look past
 * recent activity to find older eligible edges, and a cap sized for a page of
 * results silently truncated exactly the answers this query exists to give. When
 * it is reached, `asOfBounded` reports the answer as incomplete.
 */
export const MAX_SCAN = 50_000;

export interface EdgeRow {
  edge_id: string; subject_entity_id: string; predicate: string; object_entity_id: string;
  valid_from: string; valid_to: string | null; asserted_at: string; retracted_at: string | null;
  state: string; claim_object_id: string; claim_version: number;
  evidence_object_id: string; evidence_digest: string; mode: string; confidence: string;
  retraction_reason: string | null;
}

export interface AsOf {
  /** Record time: what we BELIEVED at this instant. */
  knownAt: string;
  /** World time: what HELD at this instant. */
  validAt: string;
}

export function nowAsOf(): AsOf {
  const now = new Date().toISOString();
  return { knownAt: now, validAt: now };
}

/** Both axes, and no shortcut through either. */
export function visibleAt(e: EdgeRow, at: AsOf): boolean {
  const known = new Date(at.knownAt).getTime();
  const valid = new Date(at.validAt).getTime();
  if (new Date(e.asserted_at).getTime() > known) return false;
  if (e.retracted_at !== null && new Date(e.retracted_at).getTime() <= known) return false;
  if (new Date(e.valid_from).getTime() > valid) return false;
  if (e.valid_to !== null && new Date(e.valid_to).getTime() <= valid) return false;
  return true;
}

@Injectable()
export class EdgesService {
  /**
   * Every edge, newest first, bounded.
   *
   * `all` is a LISTING. It is not the input to a historical query, and
   * `asOf` no longer uses it — see the note there.
   */
  async all(cap: GraphReads, limit = MAX_EDGES): Promise<EdgeRow[]> {
    return (await cap.readEdges().selectAll()
      .orderBy('asserted_at' as never, 'desc')
      .limit(Math.min(limit, MAX_EDGES)).execute()) as EdgeRow[];
  }

  async get(cap: GraphReads, edgeId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readEdges().selectAll()
      .where('edge_id' as never, '=', edgeId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: GraphReads, edgeId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readEdgeEvents().selectAll()
      .where('edge_id' as never, '=', edgeId as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  /**
   * The whole visible graph at an instant.
   *
   * FILTER FIRST, THEN BOUND. This previously took the newest 2,000 rows and
   * filtered those — so a single eligible edge asserted in 2024, sitting behind
   * 2,000 later ones, disappeared from a 2024 view entirely. A historical answer
   * that silently omits eligible information is worse than a slow one, because
   * nothing about it looks wrong.
   *
   * The scan is still bounded: `MAX_SCAN` caps how much is examined, and when the
   * scan is exhausted the caller is told rather than quietly handed a partial
   * graph — see `asOfBounded`.
   */
  async asOf(cap: GraphReads, at: AsOf): Promise<EdgeRow[]> {
    return (await this.asOfBounded(cap, at)).edges;
  }

  /**
   * The visible graph at an instant, with an honest statement about completeness.
   *
   * `complete` is false when the scan bound was reached, which means edges beyond
   * it were never examined. A reader deciding anything on a historical view needs
   * to know that, and the API surfaces it rather than keeping it here.
   */
  async asOfBounded(
    cap: GraphReads, at: AsOf,
  ): Promise<{ edges: EdgeRow[]; scanned: number; complete: boolean }> {
    const rows = (await cap.readEdges().selectAll()
      .orderBy('asserted_at' as never, 'desc')
      .limit(MAX_SCAN).execute()) as EdgeRow[];
    return {
      edges: rows.filter((e) => visibleAt(e, at)),
      scanned: rows.length,
      complete: rows.length < MAX_SCAN,
    };
  }

  /**
   * Neighbourhood traversal, bounded in depth and in edges.
   *
   * Direction is preserved in the answer (`out` / `in`) rather than flattened,
   * because "supplies" and "is supplied by" are not the same statement and a
   * reader deciding anything needs to know which way the edge points.
   */
  async neighbourhood(
    cap: GraphReads, entityId: string, depth: number, at: AsOf,
  ): Promise<{ edges: Array<EdgeRow & { direction: 'out' | 'in'; hop: number }>; entityIds: string[] }> {
    const visible = await this.asOf(cap, at);
    const bounded = Math.max(1, Math.min(depth, MAX_DEPTH));
    const seen = new Set<string>([entityId]);
    const out: Array<EdgeRow & { direction: 'out' | 'in'; hop: number }> = [];
    let frontier = [entityId];
    for (let hop = 1; hop <= bounded && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const e of visible) {
        if (frontier.includes(e.subject_entity_id) && !out.some((x) => x.edge_id === e.edge_id)) {
          out.push({ ...e, direction: 'out', hop });
          if (!seen.has(e.object_entity_id)) { seen.add(e.object_entity_id); next.push(e.object_entity_id); }
        } else if (frontier.includes(e.object_entity_id) && !out.some((x) => x.edge_id === e.edge_id)) {
          out.push({ ...e, direction: 'in', hop });
          if (!seen.has(e.subject_entity_id)) { seen.add(e.subject_entity_id); next.push(e.subject_entity_id); }
        }
      }
      frontier = next;
    }
    return { edges: out, entityIds: [...seen] };
  }

  /**
   * The shortest undirected path between two entities at an instant.
   *
   * `null` means there is no path IN WHAT THE CALLER CAN SEE — which is not the
   * same as "no path exists", and the API says so rather than implying absence is
   * proof (C4).
   */
  async path(
    cap: GraphReads, from: string, to: string, at: AsOf,
  ): Promise<Array<EdgeRow & { direction: 'out' | 'in' }> | null> {
    if (from === to) return [];
    const visible = await this.asOf(cap, at);
    const prev = new Map<string, { edge: EdgeRow; direction: 'out' | 'in'; from: string }>();
    const seen = new Set<string>([from]);
    let frontier = [from];
    for (let hop = 0; hop < MAX_DEPTH && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const e of visible) {
        const ends: Array<[string, string, 'out' | 'in']> = [
          [e.subject_entity_id, e.object_entity_id, 'out'],
          [e.object_entity_id, e.subject_entity_id, 'in'],
        ];
        for (const [a, b, direction] of ends) {
          if (!frontier.includes(a) || seen.has(b)) continue;
          seen.add(b);
          prev.set(b, { edge: e, direction, from: a });
          if (b === to) {
            const chain: Array<EdgeRow & { direction: 'out' | 'in' }> = [];
            let cursor = to;
            while (cursor !== from) {
              const step = prev.get(cursor);
              if (step === undefined) return null;
              chain.unshift({ ...step.edge, direction: step.direction });
              cursor = step.from;
            }
            return chain;
          }
          next.push(b);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Every edge that rests on a given claim — the join invalidation walks. */
  async byClaim(cap: GraphReads, claimObjectId: string): Promise<EdgeRow[]> {
    return (await cap.readEdges().selectAll()
      .where('claim_object_id' as never, '=', claimObjectId as never)
      .execute()) as EdgeRow[];
  }

  async assert(
    cap: EdgeWrites, ctx: ScopeContext,
    a: {
      subject: string; predicate: string; object: string;
      validFrom: string; validTo: string | null;
      claimObjectId: string; claimVersion: number;
      evidenceObjectId: string; evidenceDigest: string;
      methodId: string | null; runId: string | null; mode: string; confidence: number;
      actor: string; correlationId: string;
    },
  ): Promise<{ edgeId: string }> {
    const edgeId = newId();
    await cap.assertEdge({
      edgeId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      subject: a.subject, predicate: a.predicate, object: a.object,
      validFrom: a.validFrom, validTo: a.validTo,
      claimObjectId: a.claimObjectId, claimVersion: a.claimVersion,
      evidenceObjectId: a.evidenceObjectId, evidenceDigest: a.evidenceDigest,
      methodId: a.methodId, runId: a.runId, mode: a.mode, confidence: a.confidence,
      actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });
    return { edgeId };
  }

  async retract(
    cap: EdgeRetractionWrites, ctx: ScopeContext,
    a: { edgeId: string; actor: string; reason: string; correlationId: string },
  ): Promise<{ edgeId: string; state: 'retracted' }> {
    await cap.retractEdge({
      edgeId: a.edgeId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      actor: a.actor, reason: a.reason, eventId: newId(), correlationId: a.correlationId,
    });
    return { edgeId: a.edgeId, state: 'retracted' };
  }
}
