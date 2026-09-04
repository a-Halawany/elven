/**
 * INVALIDATION PROPAGATION — the sentence Phase 1 could not write.
 *
 * Since Phase 1 every correction case has carried:
 *
 *   "downstream consumers not yet present (KG/dependency graph arrives Phase 3)"
 *
 * That was a true statement about the world at the time, not a label. This service
 * is what makes it stop being true: it walks the dependency graph from a changed
 * claim and reports what rested on it.
 *
 * IT REPORTS; IT DOES NOT DECIDE.
 *
 * Every affected assumption is marked UNVERIFIED — not false, not withdrawn. An
 * assumption whose evidence changed is one nobody has re-checked yet, and saying
 * anything stronger would be the system concluding something it has no standing
 * to conclude. Objectives, decisions and commitments are LISTED and left exactly
 * as they were: what to do about them is a person's judgement, and in a later
 * phase a decision package's.
 */
import { Injectable } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, ImpactWrites } from '../graph.capabilities.js';

/** The walk is bounded: a dependency cycle must not become an infinite loop. */
const MAX_HOPS = 8;

export interface AffectedObject {
  strategy_object_id: string;
  object_type: string;
  title: string;
  /** How the walk reached it — never a bare id in a list. */
  reached_via: string;
  hop: number;
}

export interface ImpactResult {
  invalidationId: string;
  triggerKind: string;
  triggerObjectId: string;
  correctionCaseId: string | null;
  assumptions: AffectedObject[];
  objectives: AffectedObject[];
  decisions: AffectedObject[];
  commitments: AffectedObject[];
  /** Entities and edges the changed claim reached on the way. */
  reachedEntities: string[];
  reachedEdges: string[];
  statement: string;
}

@Injectable()
export class ImpactService {
  /**
   * Resolve what a changed claim reaches, WITHOUT writing anything.
   *
   * Kept separate from `propagate` so the Impact screen can answer "what would
   * this affect?" before a person commits to marking anything — and so the walk
   * is testable on its own.
   */
  async walk(
    cap: GraphReads,
    a: { triggerKind: string; triggerObjectId: string },
  ): Promise<Omit<ImpactResult, 'invalidationId' | 'correctionCaseId' | 'statement'>> {
    const deps = (await cap.readDependencies().selectAll()
      .where('state' as never, '=', 'active' as never)
      .execute()) as Array<Record<string, unknown>>;
    const strategy = (await cap.readStrategy().selectAll()
      .execute()) as Array<Record<string, unknown>>;
    const byId = new Map(strategy.map((s) => [String(s['strategy_object_id']), s]));

    // The claim reaches entities through the resolutions that named it, and edges
    // through the edges that rest on it. Both are dependency targets in their own
    // right, so both widen the walk.
    const reachedEntities = new Set<string>();
    const reachedEdges = new Set<string>();
    if (a.triggerKind === 'claim_correction' || a.triggerKind === 'claim_withdrawal') {
      const resolutions = (await cap.readResolutions().selectAll()
        .where('claim_object_id' as never, '=', a.triggerObjectId as never)
        .where('state' as never, '=', 'accepted' as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const r of resolutions) reachedEntities.add(String(r['entity_id']));
      const edges = (await cap.readEdges().selectAll()
        .where('claim_object_id' as never, '=', a.triggerObjectId as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const e of edges) reachedEdges.add(String(e['edge_id']));
    } else if (a.triggerKind === 'edge_retraction') {
      reachedEdges.add(a.triggerObjectId);
    } else if (a.triggerKind === 'entity_split') {
      reachedEntities.add(a.triggerObjectId);
    }

    /*
     * SEEDS. A dependency on the claim itself is direct; a dependency on an entity
     * or edge the claim produced is one hop further out, and the reason is
     * recorded so a reader sees the chain rather than an unexplained list.
     */
    const seeds: Array<{ kind: string; id: string; via: string }> = [
      { kind: 'claim', id: a.triggerObjectId, via: 'rests on the changed claim directly' },
      ...[...reachedEntities].map((id) => ({
        kind: 'entity', id, via: 'rests on an entity the changed claim resolved to' })),
      ...[...reachedEdges].map((id) => ({
        kind: 'edge', id, via: 'rests on an edge the changed claim asserted' })),
    ];

    const found = new Map<string, AffectedObject>();
    let frontier: Array<{ kind: string; id: string; via: string }> = seeds;
    for (let hop = 1; hop <= MAX_HOPS && frontier.length > 0; hop += 1) {
      const next: Array<{ kind: string; id: string; via: string }> = [];
      for (const seed of frontier) {
        for (const d of deps) {
          if (String(d['depends_on_kind']) !== seed.kind) continue;
          if (String(d['depends_on_id']) !== seed.id) continue;
          const dependent = String(d['dependent_object_id']);
          if (found.has(dependent)) continue;
          const s = byId.get(dependent);
          if (s === undefined) continue;
          found.set(dependent, {
            strategy_object_id: dependent,
            object_type: String(s['object_type']),
            title: String(s['title']),
            reached_via: seed.via,
            hop,
          });
          next.push({
            kind: 'strategy', id: dependent,
            via: `rests on ${String(s['object_type'])} "${String(s['title'])}"`,
          });
        }
      }
      frontier = next;
    }

    const of = (t: string): AffectedObject[] =>
      [...found.values()].filter((x) => x.object_type === t)
        .sort((x, y) => x.hop - y.hop);

    return {
      triggerKind: a.triggerKind,
      triggerObjectId: a.triggerObjectId,
      assumptions: of('ASU'),
      objectives: of('OBJ'),
      decisions: of('DEC'),
      commitments: of('CMT'),
      reachedEntities: [...reachedEntities],
      reachedEdges: [...reachedEdges],
    };
  }

  /**
   * Open the invalidation, mark every affected assumption unverified, and record
   * the assessment — including, when the trigger was a Phase 1 correction case,
   * the statement that replaces "downstream consumers not yet present".
   */
  async propagate(
    cap: ImpactWrites, ctx: ScopeContext,
    a: {
      triggerKind: string; triggerObjectId: string; correctionCaseId: string | null;
      actor: string; correlationId: string;
    },
  ): Promise<ImpactResult> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const walked = await this.walk(cap, a);
    const invalidationId = newId();

    await cap.openInvalidation({
      invalidationId, tenantId, domainId, triggerKind: a.triggerKind,
      triggerObjectId: a.triggerObjectId, correctionCaseId: a.correctionCaseId,
      actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });

    for (const asu of walked.assumptions) {
      await cap.setAssumptionState({
        objectId: asu.strategy_object_id, tenantId, domainId, state: 'unverified',
        reason: `an object it rests on changed (${a.triggerKind}); ${asu.reached_via}`,
        actor: a.actor, eventId: newId(), correlationId: a.correlationId,
      });
    }

    const statement = buildStatement(invalidationId, walked);
    await cap.recordImpact({
      invalidationId, tenantId, domainId,
      assumptions: walked.assumptions, objectives: walked.objectives,
      decisions: walked.decisions, commitments: walked.commitments,
      statement, actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });

    return { ...walked, invalidationId, correctionCaseId: a.correctionCaseId, statement };
  }

  async list(cap: GraphReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap.readInvalidations().selectAll()
      .orderBy('opened_at' as never, 'desc')
      .limit(Math.min(limit, 500)).execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: GraphReads, invalidationId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readInvalidations().selectAll()
      .where('invalidation_id' as never, '=', invalidationId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }
}

/**
 * The propagation statement, in words.
 *
 * It is stored rather than rendered, exactly as Phase 1's unresolved sentence was,
 * so it survives into the record and does not depend on a screen to exist. When
 * the walk found nothing it says so plainly — "nothing rested on it" is a real
 * answer and must never be presented as absence of the feature.
 */
function buildStatement(
  invalidationId: string,
  w: Omit<ImpactResult, 'invalidationId' | 'correctionCaseId' | 'statement'>,
): string {
  const total = w.assumptions.length + w.objectives.length + w.decisions.length + w.commitments.length;
  if (total === 0) {
    return `dependency propagation assessed by invalidation ${invalidationId}: `
      + 'the dependency graph was walked and nothing declared rests on this object';
  }
  return `dependency propagation assessed by invalidation ${invalidationId}: `
    + `${w.assumptions.length} assumption(s) marked unverified; `
    + `${w.objectives.length} objective(s), ${w.decisions.length} decision(s) and `
    + `${w.commitments.length} commitment(s) reported for human review; `
    + `reached through ${w.reachedEntities.length} entity(ies) and ${w.reachedEdges.length} edge(s)`;
}
