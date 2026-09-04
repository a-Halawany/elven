/**
 * THE RESOLUTION QUEUE — and the split that undoes a wrong merge.
 *
 * Everything the resolver could not resolve on its own authority arrives here.
 * A proposal cannot bypass it: the only path to an acceptance without a person is
 * an authoritative identifier match, which the port re-checks itself, so a
 * proposal that reached this queue reached it because nothing else was permitted.
 *
 * A SPLIT DELETES NOTHING. The resolutions that put a mention on the wrong entity
 * are superseded, keeping their reason, their score and the instant they were
 * accepted; a known-at query positioned before the split still reproduces the
 * merged view, because that is what the record says was true then.
 */
import { Injectable } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, ResolutionDecisionWrites, SplitWrites } from '../graph.capabilities.js';
import { normalizeName } from './resolver.service.js';

export interface ResolutionDecision {
  resolutionId: string;
  decision: 'accept' | 'reject';
  reason: string;
  /**
   * The entity the DECIDER chose, when it is not the one the resolver proposed.
   *
   * A person who knows the domain may know the proposal points at the wrong
   * thing, and no string comparison was ever going to see that. The port records
   * the redirection as a `human` resolution and keeps the resolver's original
   * proposal inside the match evidence rather than overwriting it.
   */
  targetEntityId?: string | null;
}

@Injectable()
export class ResolutionService {
  /**
   * The queue, least-certain first.
   *
   * A model-assisted proposal and a name match sit in the same list because they
   * need the same thing from a person: a judgement. The `method` column says which
   * is which, and the UI shows it — a reader must never have to infer whether a
   * candidate came from a string comparison or from a model.
   */
  async queue(cap: GraphReads, limit = 200): Promise<Array<Record<string, unknown>>> {
    return (await cap.readResolutions().selectAll()
      .where('state' as never, '=', 'proposed' as never)
      .orderBy('score' as never, 'asc')
      .orderBy('proposed_at' as never, 'asc')
      .limit(Math.min(limit, 1000)).execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: GraphReads, resolutionId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readResolutions().selectAll()
      .where('resolution_id' as never, '=', resolutionId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: GraphReads, resolutionId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readResolutionEvents().selectAll()
      .where('resolution_id' as never, '=', resolutionId as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  /**
   * Accept or reject one proposal — optionally onto a DIFFERENT entity.
   *
   * The port refuses a decider who proposed the row, refuses a decision without a
   * reason, and refuses a chosen entity that is not active in this domain.
   */
  async decide(
    cap: ResolutionDecisionWrites, ctx: ScopeContext,
    a: { decision: ResolutionDecision; decider: string; correlationId: string },
  ): Promise<{ resolutionId: string; state: 'accepted' | 'rejected' }> {
    const state = a.decision.decision === 'accept' ? 'accepted' : 'rejected';
    await cap.decideResolution({
      resolutionId: a.decision.resolutionId,
      tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      state, decider: a.decider, reason: a.decision.reason,
      targetEntityId: a.decision.targetEntityId ?? null,
      eventId: newId(), correlationId: a.correlationId,
    });
    return { resolutionId: a.decision.resolutionId, state };
  }

  /**
   * Split an entity by moving named mentions onto a new one.
   *
   * The caller names the RESOLUTIONS to move rather than the mentions, because a
   * resolution is the thing that was wrong: the mention was fine, the claim was
   * fine, and what a person is correcting is the assertion that connected them.
   */
  async split(
    cap: SplitWrites, ctx: ScopeContext,
    a: {
      fromEntityId: string; resolutionIds: string[]; entityType: string;
      canonicalName: string; decider: string; reason: string; correlationId: string;
    },
  ): Promise<{ newEntityId: string; moved: number }> {
    const newEntityId = newId();
    const r = await cap.splitEntity({
      newEntityId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      fromEntityId: a.fromEntityId, resolutionIds: a.resolutionIds,
      entityType: a.entityType, canonicalName: a.canonicalName,
      normalizedName: normalizeName(a.canonicalName),
      decider: a.decider, reason: a.reason,
      eventId: newId(), correlationId: a.correlationId,
    });
    return { newEntityId, moved: Number(r.moved) };
  }
}
