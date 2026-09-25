/**
 * THE IN-APP CHANNEL (0086 §D). The attention item is already in the queue; the placement is that THIS recipient can act on it there
 * — its owner, a holder of one of its routed roles, an administrator (executive.may_act_on_item, read by the in-app placement port).
 * The port's answer is the receipt. A recipient who can no longer act on the item (a binding revoked since the plan) is a FAILED
 * attempt with that reason: the retry finds the binding restored, or the delivery is abandoned — the item is never touched.
 */
import { Injectable } from '@nestjs/common';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from './channel.js';

@Injectable()
export class InAppChannel implements ChannelAdapter {
  readonly name = 'in_app';
  readonly synthetic = false;

  async deliver(msg: DeliveryMessage): Promise<ChannelResult> {
    const placement = await msg.via.inAppPlacement({ deliveryId: msg.deliveryId, tenantId: msg.tenantId, domainId: msg.domainId });
    if (placement['placed'] !== true) {
      return { state: 'failed', receipt: { channel: 'in_app', ...placement }, error: `the recipient ${msg.recipient} cannot act on item ${msg.itemId} in the attention queue (not its owner, no routed role)` };
    }
    return { state: 'delivered', receipt: { channel: 'in_app', proof: 'the item stands in the recipient\'s attention queue (executive.may_act_on_item)', ...placement }, providerRef: `in_app:${msg.itemId}` };
  }
}
