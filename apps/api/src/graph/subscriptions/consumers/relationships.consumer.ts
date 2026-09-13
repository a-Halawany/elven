/**
 * The RELATIONSHIPS consumer (0066 §2; AU-DP-0041, V7:TT-04): the automatic RE-DERIVATION of a pending inferred
 * relationship through the builder's governed run.
 *
 * A relationship in the graph is an edge asserted by a REL claim at a claim version. When a person corrects that claim
 * in review, a NEW claim version exists and MemoryCorrected/claim.corrected is published; the edge asserted by the old
 * version is pending reassessment (0065 §7 — opened by the memory-mappings consumer, or here). This consumer closes it
 * the way the register asks: it derives the relationship for the CORRECTED version under exactly the builder's rules
 * (edges/derive.ts — both ends resolved to one accepted entity each, no self-edge, a claim decided in review, evidence
 * lineage present) and asserts it through the builder's own port, graph.assert_edge, which supersedes the pending edge;
 * the 0065 trigger closes the reassessment as `superseded`, and GraphChanged/edge.asserted is published in the item's
 * transaction so what rested on the old edge is re-verified through its own subscriptions.
 *
 * What the builder would skip, this consumer leaves UNRESOLVED (unresolved_dependency → human_review) with the
 * builder's own reason, re-checked at every re-drive; the reassessment stays pending for the person (keep, decide,
 * retract). Limits, stated: an evidence correction makes no new claim version (nothing to re-derive from; the
 * memory-mappings proposal and the person's decision remain the route); a retired method cannot re-run.
 *
 * Items are `edge:<edge_id>` — the asserted edges of the corrected claim at versions below the corrected one.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { newId } from '../../../shared/ids.js';
import { GraphCapability, type RelationshipSubscriberWrites } from '../../graph.capabilities.js';
import { ImpactService } from '../../strategy/impact.service.js';
import { deriveEdgeFromClaim, entitiesByName } from '../../edges/derive.js';
import type { ChangeEvent, SubscriptionConsumer } from '../graph-change.js';
import { graphChangedEvent } from '../change-events.js';
import { SubscriptionDispatcherService } from '../subscription-dispatcher.service.js';

type Row = Record<string, unknown>;

@Injectable()
export class RelationshipsConsumer implements SubscriptionConsumer<RelationshipSubscriberWrites>, OnModuleInit {
  readonly kind = 'relationships' as const;
  readonly objectType = 'EDG';
  readonly purpose = 'graph';
  constructor(private readonly dispatcher: SubscriptionDispatcherService, private readonly impact: ImpactService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof GraphCapability.relationshipSubscriber>[0], action: string): RelationshipSubscriberWrites { return GraphCapability.relationshipSubscriber(tx, action); }

  /** The corrected REL claims of the event with their corrected version: object_id → to_version. */
  private correctedClaims(event: ChangeEvent): Map<string, number> {
    const out = new Map<string, number>();
    if (event.event_type !== 'MemoryCorrected' || event.payload.change.kind !== 'claim.corrected') return out;
    for (const o of event.payload.objects) {
      if (o.object_type !== 'REL') continue;
      const to = Number(o.to_version);
      if (Number.isInteger(to) && to > 1) out.set(o.object_id, to);
    }
    return out;
  }

  async resolveItems(cap: RelationshipSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    const corrected = this.correctedClaims(event);
    if (corrected.size === 0) return [];
    const edges = (await cap.readEdges().selectAll().where('state' as never, '=', 'asserted' as never)
      .where('claim_object_id' as never, 'in', [...corrected.keys()] as never).execute()) as Row[];
    return edges
      .filter((e) => Number(e['claim_version']) < (corrected.get(String(e['claim_object_id'])) ?? 0))
      .map((e) => `edge:${String(e['edge_id'])}`)
      .sort();
  }

  async applyItem(cap: RelationshipSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string) {
    const edgeId = item.replace(/^edge:/, '');
    const edge = ((await cap.readEdges().selectAll().where('edge_id' as never, '=', edgeId as never).execute()) as Row[])[0] ?? null;
    if (edge === null) return { effect: 'basis.unchanged', effectRef: null, details: { item, note: 'the edge no longer exists under this subscription\'s reads' } };
    if (String(edge['state']) !== 'asserted') {
      // Already closed (a retraction, a supersession by another run): nothing to re-derive; the outcome is the edge's own.
      return { effect: 'basis.unchanged', effectRef: null, details: { item, state: String(edge['state']), reassessment_state: String(edge['reassessment_state'] ?? ''), note: 'the edge left the asserted state before this delivery applied' } };
    }
    const claimId = String(edge['claim_object_id']);
    const toVersion = this.correctedClaims(event).get(claimId) ?? null;
    if (toVersion === null || Number(edge['claim_version']) >= toVersion) {
      return { effect: 'basis.unchanged', effectRef: null, details: { item, note: 'the corrected version this item was resolved on no longer applies' } };
    }
    const reason = `claim ${claimId} corrected from v${String(edge['claim_version'])} to v${toVersion} (${event.payload.change.kind}); the relationship is re-derived for the corrected version`;
    // A person already decided this relationship's reassessment (kept it, or closed it): the subscriber does not re-open a decided
    // record on a re-drive; the item is applied as the person's decision standing (B9 review).
    if (String(edge['reassessment_state'] ?? 'none') === 'reassessed') {
      return { effect: 'basis.unchanged', effectRef: null, details: { item, reassessment_state: 'reassessed', reassessment_outcome: edge['reassessment_outcome'] ?? null, note: 'the relationship\'s reassessment was decided by a person; the subscriber does not re-open it' } };
    }
    // 1. The reassessment is OPEN on the relationship itself before anything is asserted — once per cause: a re-drive of this
    //    delivery (the same event) finds its cause already recorded and does not append it again (the port is idempotent per cause).
    if (String(edge['reassessment_state'] ?? 'none') !== 'pending' || String(edge['reassessment_cause_id'] ?? '') !== event.event_id) {
      await cap.openEdgeReassessment({ edgeId, tenantId: scope.tenantId, domainId: scope.domainId, trigger: 'claim', reason, causeId: event.event_id, actor, correlationId });
    }
    // 2. The corrected claim version, read under the subscriber's own capability (RLS): the builder derives from it.
    const claim = ((await cap.readCanonicalObjects().selectAll()
      .where('object_id' as never, '=', claimId as never).where('object_version' as never, '=', toVersion as never).execute()) as Row[])[0] ?? null;
    if (claim === null || String(claim['object_type']) !== 'REL') {
      return { effect: 'derivation.blocked', effectRef: null, details: { item, claim_object_id: claimId, claim_version: toVersion },
               unresolved: { reason: `the corrected claim ${claimId} v${toVersion} is not readable as a REL claim under this subscription; the relationship cannot be re-derived`, failureClass: 'unresolved_dependency' as const, disposition: 'human_review' as const } };
    }
    const accepted = (await cap.readResolutions().selectAll().where('state' as never, '=', 'accepted' as never).execute()) as Row[];
    const latestCase = ((await cap.readReviewCases().select(['state'] as never).where('claim_object_id' as never, '=', claimId as never).where('claim_version' as never, '=', toVersion as never).orderBy('opened_at' as never, 'desc').limit(1).execute()) as Row[])[0] ?? null;
    const derived = deriveEdgeFromClaim(claim, entitiesByName(accepted), latestCase === null ? null : String(latestCase['state']));
    if (!derived.ok) {
      // The builder's own refusal: the item stays open with that reason; the reassessment stays pending for the person.
      return { effect: 'derivation.blocked', effectRef: null, details: { item, claim_object_id: claimId, claim_version: toVersion, builder_reason: derived.reason },
               unresolved: { reason: `the builder cannot re-derive claim ${claimId} v${toVersion}: ${derived.reason}`, failureClass: 'unresolved_dependency' as const, disposition: 'human_review' as const } };
    }
    // 3. The lineage of the corrected version names the method and run that produced it (recorded with the review decision).
    const lineage = ((await cap.readClaimLineage().select(['method_id', 'run_id', 'mode'] as never)
      .where('claim_object_id' as never, '=', claimId as never).where('claim_version' as never, '=', toVersion as never).execute()) as Row[])[0] ?? null;
    const e = derived.edge;
    const newEdgeId = newId();
    // 4. The builder's port: asserts the successor and supersedes every asserted edge of the same claim at a lower version —
    //    the pending edge — whose reassessment the 0065 trigger closes as `superseded`. The port's own refusals of the
    //    DERIVATION (the predicate outside the active ontology; a claim a person has not decided) are the person's to
    //    resolve, not faults to retry: the item stays open with the port's reason — the call runs under a SAVEPOINT so the
    //    refusal leaves the delivery's transaction usable for the unresolved checkpoint (Codex B9-F2).
    try {
      await cap.withSavepoint('rel_assert', () => cap.assertEdge({
        edgeId: newEdgeId, tenantId: scope.tenantId, domainId: scope.domainId,
        subject: e.subject, predicate: e.predicate, object: e.object, validFrom: e.validFrom, validTo: e.validTo,
        claimObjectId: claimId, claimVersion: toVersion, evidenceObjectId: e.evidenceObjectId, evidenceDigest: e.evidenceDigest,
        methodId: lineage === null ? null : (lineage['method_id'] as string | null) ?? null,
        runId: lineage === null ? e.runId : (lineage['run_id'] as string | null) ?? e.runId,
        mode: lineage === null ? e.mode : String(lineage['mode'] ?? e.mode),
        confidence: e.confidence, actor, eventId: newId(), correlationId,
      }));
    } catch (err) {
      const pg = err as { code?: string; message?: string };
      if (pg.code === '22023' && /edge rejected: (predicate .* is not in the domain|the claim behind it is .* for review)/.test(String(pg.message ?? ''))) {
        return { effect: 'derivation.blocked', effectRef: null, details: { item, claim_object_id: claimId, claim_version: toVersion, port_reason: String(pg.message) },
                 unresolved: { reason: `the builder's port refused the re-derived relationship: ${String(pg.message)}`, failureClass: 'unresolved_dependency' as const, disposition: 'human_review' as const } };
      }
      throw err;
    }
    // 5. Published as the builder publishes it: the asserted edge with both ends, walked for the derivatives of the claim.
    const live = (await cap.subscriptionsMatching({ tenantId: scope.tenantId, domainId: scope.domainId, eventType: 'GraphChanged', changeKind: 'edge.asserted' })).length > 0;
    const changed = await graphChangedEvent(cap, this.impact, {
      tenantId: scope.tenantId, domainId: scope.domainId, kind: 'edge.asserted',
      identities: [{ entity_id: e.subject, role: 'subject' }, { entity_id: e.object, role: 'object' }],
      edges: [{ edge_id: newEdgeId, state: 'asserted', predicate: e.predicate, subject_entity_id: e.subject, object_entity_id: e.object, valid_from: e.validFrom, valid_to: e.validTo, claim_object_id: claimId }],
      reach: live ? { kind: 'claim', id: claimId } : null, validFrom: e.validFrom, validTo: e.validTo,
      cause: { action: 'graph.relationship.subscription.apply', actor, target_type: 'EDG', target_id: newEdgeId },
    });
    return { effect: 'edge.re_derived', effectRef: newEdgeId,
             details: { superseded: [edgeId], claim_object_id: claimId, from_version: Number(edge['claim_version']), claim_version: toVersion, predicate: e.predicate, subject_entity_id: e.subject, object_entity_id: e.object, cause: event.event_id },
             outboxEvents: [changed] };
  }
}
