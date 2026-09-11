/**
 * Queue identities shared by the producer side (the outbox publisher) and the consumer side
 * (the scheduler's workers). A logical queue name is scope-prefixed with ':' (migration
 * 0022's rule: a job cannot be enqueued into another tenant's queue by naming it); the
 * Redis-facing name is DERIVED from it by `redisName()` because the pinned BullMQ refuses
 * ':' in a queue name — the mapping is injective and scope-preserving, and is never persisted.
 */
export function redisName(logical: string): string {
  return logical.replaceAll(':', '.');
}

/**
 * The per-domain queue a `CorrectionApplied` event is ALSO routed to (0060): the
 * propagation consumer serves it, one job at a time. `domain-events` stays the global,
 * unconsumed log it has been since Phase 0.
 */
export function propagationQueueNameFor(tenantId: string, domainId: string): string {
  return `graph:${tenantId}:${domainId}:propagation`;
}
