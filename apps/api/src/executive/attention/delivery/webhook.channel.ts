/**
 * THE SMS AND TEAMS ADAPTERS — SYNTHETIC (B34, 0090 §0.5). Each POSTs the provider's shape as JSON to its configured LOCAL webhook sink
 * (eye.attention.sms_webhook_url / eye.attention.teams_webhook_url — http(s) on a loopback host only, re-checked at every attempt):
 *   sms    {to: the recipient's synthetic number key, text (≤ 480 chars), delivery_id, synthetic: true}
 *   teams  an incoming-webhook MessageCard {"@type": "MessageCard", summary, title, text, delivery_id, synthetic: true}
 * A 2xx answer with a `message_id` is the receipt; any other answer, a refused connection or a timeout is a FAILED attempt with the reason
 * (the delivery port retries, then abandons). No real gateway or tenant is ever contacted: owner decision D6; no real-provider clause closed.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EYE_CONFIG } from '../../../config/config.module.js';
import type { EyeConfig } from '../../../config/config.js';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from './channel.js';
import { loopbackUrlProblem, SYNTHETIC_SINK_NOTE } from './local-sink.js';

const TIMEOUT_MS = 5_000;

abstract class WebhookChannel implements ChannelAdapter {
  abstract readonly name: 'sms' | 'teams';
  readonly synthetic = true;
  constructor(protected readonly cfg: EyeConfig) {}
  protected abstract url(): string;
  protected abstract shape(msg: DeliveryMessage): Record<string, unknown>;

  async deliver(msg: DeliveryMessage): Promise<ChannelResult> {
    const url = this.url();
    if (url === '') return { state: 'failed', receipt: null, error: `${this.name}: no local webhook sink is configured in this runtime; a real provider is owner decision D6` };
    const problem = loopbackUrlProblem(url);
    if (problem !== null) return { state: 'failed', receipt: null, error: `${this.name}: the sink is refused — ${problem}` };
    const bodyDigest = createHash('sha256').update(msg.body, 'utf8').digest('hex');
    const sinkUrl = new URL(url); const sink = `${sinkUrl.protocol}//${sinkUrl.host}${sinkUrl.pathname}`;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-eye-delivery': msg.deliveryId, 'x-eye-synthetic': 'true' },
        body: JSON.stringify(this.shape(msg)), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      if (res.status < 200 || res.status > 299) return { state: 'failed', receipt: null, error: `${this.name}: the sink answered HTTP ${res.status} ${text.slice(0, 200)}` };
      let id: unknown = null;
      try { id = (JSON.parse(text) as Record<string, unknown>)['message_id']; } catch { id = null; }
      if (typeof id !== 'string' || id === '') return { state: 'failed', receipt: null, error: `${this.name}: the sink answered without a message id` };
      return { state: 'delivered', providerRef: `${this.name}:${id}`,
               receipt: { channel: this.name, synthetic: true, sink, sink_message_id: id, http_status: res.status, body_digest: bodyDigest, note: SYNTHETIC_SINK_NOTE } };
    } catch (e) {
      return { state: 'failed', receipt: null, error: `${this.name}: ${(e as Error).message}`.slice(0, 500) };
    }
  }
}

@Injectable()
export class SmsChannel extends WebhookChannel {
  readonly name = 'sms' as const;
  constructor(@Inject(EYE_CONFIG) cfg: EyeConfig) { super(cfg); }
  protected url(): string { return this.cfg['eye.attention.sms_webhook_url']; }
  protected shape(msg: DeliveryMessage): Record<string, unknown> {
    return { to: `synthetic:${msg.recipient}`, text: `${msg.subject}\n${msg.body}`.slice(0, 480), delivery_id: msg.deliveryId, attempt: msg.attempt, synthetic: true };
  }
}

@Injectable()
export class TeamsChannel extends WebhookChannel {
  readonly name = 'teams' as const;
  constructor(@Inject(EYE_CONFIG) cfg: EyeConfig) { super(cfg); }
  protected url(): string { return this.cfg['eye.attention.teams_webhook_url']; }
  protected shape(msg: DeliveryMessage): Record<string, unknown> {
    return { '@type': 'MessageCard', '@context': 'https://schema.org/extensions', summary: msg.subject.slice(0, 120), title: msg.subject, text: msg.body.replace(/\n/g, '<br>'),
             recipient: `synthetic:${msg.recipient}`, delivery_id: msg.deliveryId, attempt: msg.attempt, synthetic: true };
  }
}
