/**
 * THE ENTITY REGISTRY — reads, history, and known-at.
 *
 * An entity's history is not a changelog of the entity; it is the list of
 * MENTIONS that resolved to it, each keeping its own claim, its own evidence and
 * its own confidence. That is what makes C1 answerable: two spellings from two
 * sources become one entity, and both mentions survive intact underneath it.
 *
 * KNOWN-AT IS A RECORD-TIME QUESTION. "Which mentions did this entity have on
 * 14 January?" is answered from `accepted_at` and `superseded_at`, never from
 * whatever the projection says today — which is exactly why a split can be
 * undone in the reader's eye without being undone in the data.
 */
import { Injectable } from '@nestjs/common';
import type { GraphReads } from '../graph.capabilities.js';

export interface EntityRow {
  entity_id: string; entity_type: string; canonical_name: string; normalized_name: string;
  lifecycle_state: string; split_from: string | null; superseded_by: string | null;
  created_at: string; updated_at: string;
}

@Injectable()
export class EntitiesService {
  async list(cap: GraphReads, limit = 200): Promise<Array<Record<string, unknown>>> {
    return (await cap.readEntities().selectAll()
      .orderBy('updated_at' as never, 'desc')
      .limit(Math.min(limit, 1000)).execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: GraphReads, entityId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readEntities().selectAll()
      .where('entity_id' as never, '=', entityId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async identifiers(cap: GraphReads, entityId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readIdentifiers().selectAll()
      .where('entity_id' as never, '=', entityId as never)
      .orderBy('recorded_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  async events(cap: GraphReads, entityId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readEntityEvents().selectAll()
      .where('entity_id' as never, '=', entityId as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  /**
   * Every resolution this entity has ever had, in any state.
   *
   * Superseded and rejected rows are returned WITH the live ones on purpose: an
   * entity's history includes the mentions that were taken away from it and the
   * proposals a person turned down, and hiding either would make the history a
   * summary of the present rather than a record of what happened.
   */
  async resolutions(cap: GraphReads, entityId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readResolutions().selectAll()
      .where('entity_id' as never, '=', entityId as never)
      .orderBy('proposed_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  /**
   * The mentions this entity held AT AN INSTANT (C3).
   *
   * A resolution counted if it had been accepted by then and had not yet been
   * superseded. Nothing is reconstructed and nothing is inferred: both instants
   * are stored on the row, so the query is a predicate over record time.
   */
  async mentionsKnownAt(
    cap: GraphReads, entityId: string, knownAt: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = (await cap.readResolutions().selectAll()
      .where('entity_id' as never, '=', entityId as never)
      .execute()) as Array<Record<string, unknown>>;
    const t = new Date(knownAt).getTime();
    return rows.filter((r) => {
      const accepted = r['accepted_at'];
      if (accepted === null || accepted === undefined) return false;
      if (new Date(accepted as string).getTime() > t) return false;
      const superseded = r['superseded_at'];
      if (superseded === null || superseded === undefined) return true;
      return new Date(superseded as string).getTime() > t;
    });
  }

  /** The claims behind a set of resolutions, current version of each. */
  async claimsFor(
    cap: GraphReads, claimIds: readonly string[],
  ): Promise<Array<Record<string, unknown>>> {
    if (claimIds.length === 0) return [];
    const rows = (await cap.readCanonicalObjects().selectAll()
      .where('object_id' as never, 'in', claimIds as never)
      .execute()) as Array<Record<string, unknown>>;
    const current = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const id = String(r['object_id']);
      const prev = current.get(id);
      if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
        current.set(id, r);
      }
    }
    return [...current.values()];
  }
}
