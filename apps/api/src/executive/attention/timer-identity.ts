/**
 * THE ATTENTION TIMER'S IDENTITY (CP-6 B24, 0086 §T). The attention agent is registered with the version and the code digest of THIS
 * runtime's timer; a run whose registration names another digest is a DRIFTED agent (the code changed since it was registered) and its
 * tick is refused — recorded on the run and escalated to the named human, never run under a stale identity. A changed method is a new
 * digest: the attention agent is registered anew (the B8 precedent for the subscriptions' METHOD_REF).
 *
 * Kept apart from the timer host so the agents service reads it without importing the host (the host depends on the agents service).
 */
import { createHash } from 'node:crypto';

export const ATTENTION_TIMER_VERSION = '1.0.0';
export const ATTENTION_TIMER_METHOD = `attention-timer@${ATTENTION_TIMER_VERSION}`;
/** What the tick does, in words: the digest is taken over this text (the registered steps are the sections'; their order is the registry's). */
const METHOD_TEXT = 'one tick per domain on the cadence (exec:{t}:{d}:attention) under the attention agent\'s own session; the governed write executive.attention.tick runs the '
  + 'registered steps in order (escalate 10 → executive.escalate_attention_due; rebalance 20; deliveries 30 → plan the deliveries of the routed, escalated and unrouted '
  + 'items over the channels of the item\'s own policy version, then drain the due attempts through the channel adapters — in_app and the SYNTHETIC demo-mailbox); '
  + 'executive.attention_ticks keeps one tick per (tenant, domain, floor(epoch of the scheduled instant / cadence)); a duplicate answers repeated';
export const ATTENTION_TIMER_DIGEST = createHash('sha256').update(`executive.attention.timer@${ATTENTION_TIMER_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');
/** The cadence when the registration names none (budgets.tick_every_seconds; the port bounds it to [60, 86400]). */
export const DEFAULT_TICK_SECONDS = 300;

/** The cadence a registration's budgets carry (the port validated it), or the default. */
export function cadenceOf(budgets: Record<string, unknown> | null | undefined): number {
  const v = budgets?.['tick_every_seconds'];
  return typeof v === 'number' && Number.isInteger(v) && v >= 60 && v <= 86_400 ? v : DEFAULT_TICK_SECONDS;
}
