/**
 * THE CHANNEL ADAPTER (CP-6 B24, 0086 §D). A channel places one attention message for one recipient and answers what happened with
 * its RECEIPT — the machine proof of placement the delivery row keeps. A receipt is never an acknowledgement: that is the person's
 * act on the item (0083, receipt_not_agreement), and neither sets the other.
 *
 * This product has two channels: `in_app` (the item stands in the recipient's queue) and `demo-mailbox` — a SYNTHETIC local sink
 * (executive.demo_mailbox) that demonstrates the port and closes no real-provider clause. There is NO email, SMS, Teams or push
 * adapter: a real provider is owner decision D6, and the policy validator refuses those channels.
 */
import type { AttentionTickWrites } from '../../executive.capabilities.js';

export const DELIVERY_CHANNELS = ['in_app', 'demo-mailbox'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** One claimed attempt, as the channel sees it: who, what and on which delivery row; `via` is the tick's capability (the adapter's only way to the database). */
export interface DeliveryMessage {
  deliveryId: string; tenantId: string; domainId: string; itemId: string; itemEventId: string; itemEvent: string;
  channel: string; recipient: string; attempt: number; maxAttempts: number;
  subject: string; body: string; correlationId: string;
  via: AttentionTickWrites;
}
/** What an attempt came to: placed (sent / delivered, with the channel's receipt) or failed (with why). */
export interface ChannelResult {
  state: 'sent' | 'delivered' | 'failed';
  receipt: Record<string, unknown> | null;
  providerRef?: string | null;
  error?: string | null;
}
export interface ChannelAdapter {
  readonly name: string;
  /** SYNTHETIC channels say so on every receipt and in every text that could read as a real delivery. */
  readonly synthetic: boolean;
  deliver(msg: DeliveryMessage): Promise<ChannelResult>;
}
