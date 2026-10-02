/**
 * THE DELIVERY PORT — CP-6 B24 (0086 §D; F-P6-07 "notification transport beyond in_app with delivery receipts").
 *
 * The tick's DELIVERIES step (order 30 — after escalate 10 and rebalance 20, so what the tick just escalated or elevated is planned
 * in the same tick): PLAN (executive.plan_attention_deliveries — every routed, escalated or unrouted item event without a delivery:
 * one attempt per channel of the item's OWN policy version and per recipient, the owner and the holders of the event's roles), then
 * DRAIN (claim the due attempts with SKIP LOCKED, hand each to its channel adapter, record the outcome — a failure queues the next
 * attempt after 1, 5, 25 … minutes, the last one abandoned). An abandoned delivery never changes the item: it escalates by its
 * deadline all the same.
 *
 * RECEIPT vs ACKNOWLEDGEMENT. A receipt is the channel's machine proof of placement, kept on the delivery row; an acknowledgement is
 * the person's act on the item (receipt, not agreement — 0083). The reads below show both, side by side; neither sets the other.
 *
 * The channels are in_app and the SYNTHETIC demo-mailbox. No email, SMS, Teams or push adapter exists: a real provider is owner
 * decision D6 (the policy validator refuses those channels, naming it).
 */
import { HttpException, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { EYE_CONFIG } from '../../../config/config.module.js';
import type { EyeConfig } from '../../../config/config.js';
import { ExecutiveCapability, type AttentionTickWrites, type ExecutiveReads } from '../../executive.capabilities.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../tick.js';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from './channel.js';
import { InAppChannel } from './in-app.channel.js';
import { DemoMailboxChannel } from './demo-mailbox.channel.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
/** At most this many attempts are drained per tick (the claim's bound; what one tick leaves, the next one takes). */
export const DRAIN_LIMIT = 100;
export const SYNTHETIC_NOTE = 'SYNTHETIC — the demo mailbox is a local sink; no email, SMS or Teams message was sent (a real provider is owner decision D6)';
export const RECEIPT_NOT_ACKNOWLEDGEMENT = 'a receipt is the channel\'s machine proof of placement; an acknowledgement is the person\'s act on the item (receipt, not agreement) — neither sets the other';

/** The message one claimed attempt carries: deterministic in the item's state at the claim (the demo mailbox keeps its digest). */
export function attentionMessage(c: Row): { subject: string; body: string } {
  const escalated = c['item_event'] === 'item.escalated';
  const subject = `[attention · ${String(c['signal_class'])}] ${String(c['title'])}${escalated ? ' — ESCALATED' : ''}`.slice(0, 300);
  const due = iso(c['due_at']);
  const body = [
    `Attention item ${String(c['item_id'])} (${String(c['signal_class'])}) — ${String(c['item_event'])}.`,
    `State: ${String(c['item_state'])}; ${due === null ? 'no deadline' : `acknowledge by ${due}`}.`,
    `Subject: ${String(c['subject_kind'])} ${String(c['subject_id'])}; policy version ${c['policy_version'] === null || c['policy_version'] === undefined ? 'none' : String(c['policy_version'])}.`,
    `Attempt ${String(c['attempt'])} of ${String(c['max_attempts'])} on ${String(c['channel'])}.`,
    'Open the attention queue to acknowledge it: this message is a delivery, and its receipt is not your acknowledgement.',
    ...(c['channel'] === 'demo-mailbox' ? [SYNTHETIC_NOTE] : []),
  ].join('\n');
  return { subject, body };
}

@Injectable()
export class DeliveryService implements OnModuleInit {
  private readonly channels = new Map<string, ChannelAdapter>();

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, private readonly ticks: AttentionTickRegistry, inApp: InAppChannel, demoMailbox: DemoMailboxChannel) {
    this.channels.set(inApp.name, inApp);
    this.channels.set(demoMailbox.name, demoMailbox);
  }

  /** The DELIVERIES step (order 30): plan, then drain — both in the tick's own write. */
  onModuleInit(): void {
    this.ticks.register({ name: 'deliveries', order: 30, run: async (ctx) => this.step(ctx) });
  }

  /** TEST CONTROL ONLY: replace a channel's adapter with a double (a failing one), or restore the product's with null. */
  useChannelForTests(name: 'in_app' | 'demo-mailbox', adapter: ChannelAdapter | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useChannelForTests is available only in the test runtime');
    if (adapter === null) {
      this.channels.set(name, name === 'in_app' ? new InAppChannel() : new DemoMailboxChannel());
      return;
    }
    this.channels.set(name, adapter);
  }

  async step(ctx: AttentionTickContext): Promise<Row> {
    const cap = ExecutiveCapability.attentionTick(ctx.tx, 'executive.attention.tick');
    const planned = await cap.planDeliveries({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
    const drained = await this.drain(cap, ctx);
    return { planned, drained };
  }

  /** Claim the due attempts and hand each to its channel; every outcome recorded (a channel that throws is a failed attempt with its reason). */
  private async drain(cap: AttentionTickWrites, ctx: AttentionTickContext): Promise<Row> {
    const claimed = await cap.claimDeliveries({ tenantId: ctx.tenantId, domainId: ctx.domainId, limit: DRAIN_LIMIT });
    const tally: Record<string, number> = { delivered: 0, sent: 0, failed: 0, abandoned: 0 };
    const attempts: Row[] = [];
    for (const c of claimed) {
      const deliveryId = String(c['delivery_id']);
      const { subject, body } = attentionMessage(c);
      const msg: DeliveryMessage = {
        deliveryId, tenantId: ctx.tenantId, domainId: ctx.domainId, itemId: String(c['item_id']), itemEventId: String(c['item_event_id']), itemEvent: String(c['item_event']),
        channel: String(c['channel']), recipient: String(c['recipient_principal_id']), attempt: Number(c['attempt']), maxAttempts: Number(c['max_attempts']),
        subject, body, correlationId: ctx.correlationId, via: cap,
      };
      const adapter = this.channels.get(msg.channel);
      let result: ChannelResult;
      if (adapter === undefined) result = { state: 'failed', receipt: null, error: `no adapter serves the channel ${msg.channel} in this runtime` };
      else {
        try {
          // the adapter's own statements run under a savepoint: a refusal inside it leaves the tick's transaction usable
          result = await cap.withSavepoint('b24_delivery_attempt', () => adapter.deliver(msg));
        } catch (e) {
          result = { state: 'failed', receipt: null, error: `${adapter.name}: ${(e as Error).message}`.slice(0, 500) };
        }
      }
      const recorded = await cap.recordDeliveryAttempt({ deliveryId, tenantId: ctx.tenantId, domainId: ctx.domainId, state: result.state, receipt: result.receipt, providerRef: result.providerRef ?? null,
        error: result.state === 'failed' ? (result.error ?? 'the channel reported a failure without a reason') : null, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
      const state = String(recorded['state']);
      tally[state] = (tally[state] ?? 0) + 1;
      attempts.push({ delivery_id: deliveryId, channel: msg.channel, recipient: msg.recipient, attempt: msg.attempt, state, next_attempt_at: recorded['next_attempt_at'] ?? null });
    }
    return { claimed: claimed.length, ...tally, attempts };
  }

  // ───────────────────────── the reads (executive.attention.read) ─────────────────────────
  /** An item's deliveries — every attempt with its receipt — beside the item's acknowledgement (neither sets the other), and the delivery log. */
  async forItem(cap: ExecutiveReads, itemId: string, correlationId: string): Promise<Row> {
    if (!UUID.test(itemId)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the item id is a uuid'), 422);
    const item = ((await cap.readAttentionItems().select(['item_id', 'title', 'signal_class', 'state', 'owner_principal_id', 'route_roles', 'due_at', 'acknowledged_at', 'acknowledged_by', 'policy_version'] as never)
      .where('item_id' as never, '=', itemId as never).execute()) as Row[])[0];
    if (item === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized attention item matches'), 404);
    const rows = (await cap.readAttentionDeliveries().selectAll().where('item_id' as never, '=', itemId as never).orderBy('created_at' as never).orderBy('attempt' as never).execute()) as Row[];
    const events = (await cap.readAttentionDeliveryEvents().selectAll().where('item_id' as never, '=', itemId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const deliveries = rows.map((d) => ({
      delivery_id: d['delivery_id'], item_event: d['item_event'], item_event_id: d['item_event_id'], channel: d['channel'], synthetic: d['synthetic_state'] === true,
      recipient: d['recipient_principal_id'], attempt: Number(d['attempt']), max_attempts: Number(d['max_attempts']), state: d['state'], receipt: d['receipt'] ?? null,
      provider_ref: d['provider_ref'] ?? null, error: d['error'] ?? null, next_attempt_at: iso(d['next_attempt_at']), attempted_at: iso(d['attempted_at']),
      policy_version: d['policy_version'] ?? null, created_at: iso(d['created_at']),
    }));
    const counts: Record<string, number> = { queued: 0, sent: 0, delivered: 0, failed: 0, abandoned: 0 };
    for (const d of deliveries) counts[String(d.state)] = (counts[String(d.state)] ?? 0) + 1;
    return {
      item: { item_id: item['item_id'], title: item['title'], signal_class: item['signal_class'], state: item['state'], owner_principal_id: item['owner_principal_id'], route_roles: item['route_roles'],
              due_at: iso(item['due_at']), policy_version: item['policy_version'] ?? null },
      acknowledgement: { acknowledged: item['acknowledged_at'] !== null && item['acknowledged_at'] !== undefined, acknowledged_at: iso(item['acknowledged_at']), acknowledged_by: item['acknowledged_by'] ?? null },
      deliveries, counts,
      events: events.map((e) => ({ event: e['event'], delivery_id: e['delivery_id'] ?? null, item_event_id: e['item_event_id'], actor: e['actor_principal_id'], details: e['details'], occurred_at: iso(e['occurred_at']) })),
      note: RECEIPT_NOT_ACKNOWLEDGEMENT,
    };
  }

  /** The SYNTHETIC demo mailbox of the domain (newest first): what the demo-mailbox channel placed — the subject and the body's digest per recipient. */
  async mailbox(cap: ExecutiveReads, p: { recipient?: unknown; limit?: unknown }, correlationId: string): Promise<Row> {
    let q = cap.readDemoMailbox().selectAll();
    if (p.recipient !== undefined && p.recipient !== null && p.recipient !== '') {
      if (typeof p.recipient !== 'string' || !UUID.test(p.recipient)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'payload.recipient is a principal id (uuid)'), 422);
      q = q.where('recipient_principal_id' as never, '=', p.recipient as never);
    }
    const limit = Math.min(Math.max(Number(p.limit ?? 100) || 100, 1), 500);
    const rows = (await q.orderBy('delivered_at' as never, 'desc').limit(limit).execute()) as Row[];
    return {
      synthetic: true, note: SYNTHETIC_NOTE,
      messages: rows.map((m) => ({ message_id: m['message_id'], delivery_id: m['delivery_id'], recipient: m['recipient_principal_id'], subject: m['subject'], body_digest: m['body_digest'],
                                   delivered_at: iso(m['delivered_at']), synthetic_state: m['synthetic_state'] === true })),
    };
  }
}
