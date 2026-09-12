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

/**
 * The per-domain queue GraphChanged and MemoryCorrected are routed to (0063): the subscription dispatcher serves it,
 * one job at a time, fanning each event out to the domain's active subscriptions.
 */
export function subscriptionQueueNameFor(tenantId: string, domainId: string): string {
  return `graph:${tenantId}:${domainId}:subscriptions`;
}

/*
 * WHICH DOMAINS ARE SUBSCRIBED, as this process knows it. The publisher routes a GraphChanged/MemoryCorrected row
 * to a domain's subscription queue only when the dispatcher in this process serves that domain — otherwise the
 * queue of an unsubscribed domain would grow one job per graph write forever. The outbox row is the durable log
 * either way: a subscription registered later is served from its checkpoint by the dispatcher's reconciliation,
 * which reads the outbox, not the queue, so a row this process did not route is never lost.
 */
const subscribedDomains = new Set<string>();
export function markSubscribedDomain(tenantId: string, domainId: string, subscribed: boolean): void {
  const k = `${tenantId}/${domainId}`;
  if (subscribed) subscribedDomains.add(k); else subscribedDomains.delete(k);
}
export function isSubscribedDomain(tenantId: string, domainId: string): boolean {
  return subscribedDomains.has(`${tenantId}/${domainId}`);
}
