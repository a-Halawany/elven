/**
 * THE DEMO MAILBOX — a SYNTHETIC channel (0086 §D). It places the message in executive.demo_mailbox, a local sink inside the database
 * (the subject and the body's digest, per recipient), so the delivery port — planning, attempts, receipts, retries, abandonment — is
 * demonstrable end to end without a provider. NOTHING leaves the database: no email, SMS or Teams message is sent, and this channel
 * closes no real-provider clause (a real provider is owner decision D6). Every receipt says `synthetic: true`.
 */
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '../../../shared/ids.js';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from './channel.js';

@Injectable()
export class DemoMailboxChannel implements ChannelAdapter {
  readonly name = 'demo-mailbox';
  readonly synthetic = true;

  async deliver(msg: DeliveryMessage): Promise<ChannelResult> {
    const bodyDigest = createHash('sha256').update(msg.body, 'utf8').digest('hex');
    const placed = await msg.via.placeDemoMail({ messageId: newId(), deliveryId: msg.deliveryId, tenantId: msg.tenantId, domainId: msg.domainId, subject: msg.subject, bodyDigest, correlationId: msg.correlationId });
    return {
      state: 'delivered',
      receipt: { channel: 'demo-mailbox', synthetic: true, sink: 'executive.demo_mailbox', message_id: placed['message_id'], delivered_at: placed['delivered_at'], body_digest: bodyDigest,
                 note: 'SYNTHETIC — placed in the local demo mailbox; no email, SMS or Teams message was sent (a real provider is owner decision D6)' },
      providerRef: `demo-mailbox:${String(placed['message_id'])}`,
    };
  }
}
