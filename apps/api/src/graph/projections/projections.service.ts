/**
 * THE TWO GOVERNED ACTS ON A PROJECTION PARTITION (CP-6 B20, 0080 §5, §7; design §2.8, D4, D7, D8).
 *
 *   * WITHDRAW — `graph.projection.withdraw` (platform_admin @ PLATFORM, tenant_admin @ TENANT, domain_admin @ DOMAIN;
 *     human-gated; C2): the operator takes a partition out of service — a suspicion, a representation review, a planned
 *     rebuild. Idempotent: a second withdrawal is a second ledger row (`changed: false`, the earlier reason kept). No outbox
 *     event: a withdrawal changes no fact of the graph; the reads consult the partition row (graph.projection_state) and the
 *     retrieval subscriber's next check would re-withdraw anyway. The write's target is the withdrawal's own ledger row
 *     (object type PRJ, a fresh id — the `retention.action.open` idiom of a pre-generated id).
 *
 *   * REBUILD — `graph.projection.rebuild` (the same holders; human-gated; C2): the ONLY transition from withdrawn to
 *     serving. The port writes the drifted, missing and unexpected rows from the ONE derivation under a per-partition
 *     advisory lock and re-checks; a refusal (a held poisoned row, an unrebuildable row, a check that still fails, a
 *     constraint) is an OUTCOME on the ledger (`projection.rebuild_refused`, the partition stays withdrawn) and the route
 *     answers 200 with the recorded refusal — the B18.1 `copies_refused` idiom, never a lost transaction. On success the
 *     handler publishes ONE `GraphChanged/projection.rebuilt` (D8: no identities, no relationships, no walk — a rebuild
 *     changes no fact of the world; the typed block carries the report) so the retrieval consumer re-verifies independently
 *     and, on the re-drive of its earlier unresolved delivery, clears it; the other consumers find nothing by construction.
 *
 * The port's own REFUSALS (the standing, a name that is not a projection, a reason too short, a rebuild of a SERVING
 * partition) are raised as SQLSTATEs and mapped by family in observation-errors.ts (403 / 404 / 409 / 422).
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { GraphCapability } from '../graph.capabilities.js';
import { projectionRebuiltEvent } from '../subscriptions/change-events.js';
import type { ProjectionName } from './projection-state.js';

const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Injectable()
export class ProjectionsService {
  constructor(private readonly pipeline: PipelineService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** The operator's withdrawal: the port's answer (`changed`, `withdrawn_since`, `reason`, `second_reason`, `event_id`) with the receipt. */
  async withdraw(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, projection: ProjectionName, reason: string) {
    const eventId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'graph.projection.withdraw', 'PRJ', eventId), writableTargets: [eventId] },
      GraphCapability.projections,
      async (cap) => {
        const r = await cap.withdrawProjection({ eventId, tenantId, domainId, projection, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PRJ', targetId: eventId, targetVersion: null, outboxEvent: null };
      });
    return { projection: out.result, receipt: receipt(out) };
  }

  /** The rebuild: the port's report in every outcome (rebuilt | restored | refused) with the receipt; the rebuilt event on success only. */
  async rebuild(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, projection: ProjectionName, reason: string) {
    const rebuildId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'graph.projection.rebuild', 'PRJ', rebuildId), writableTargets: [rebuildId] },
      GraphCapability.projections,
      async (cap) => {
        const r = await cap.rebuildProjection({ rebuildId, tenantId, domainId, projection, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        // A refusal is recorded (projection.rebuild_refused) and answered; nothing is announced — the partition stays withdrawn.
        if (r['outcome'] === 'refused') return { result: r, targetType: 'PRJ', targetId: rebuildId, targetVersion: null, outboxEvent: null };
        const subscriptions = await cap.subscriptionsMatching({ tenantId, domainId, eventType: 'GraphChanged', changeKind: 'projection.rebuilt' });
        return {
          result: r, targetType: 'PRJ', targetId: rebuildId, targetVersion: null,
          outboxEvent: projectionRebuiltEvent({ tenantId, domainId, report: r, subscriptions, actor: principal.principalId }),
        };
      });
    return { rebuild: out.result, receipt: receipt(out) };
  }
}
