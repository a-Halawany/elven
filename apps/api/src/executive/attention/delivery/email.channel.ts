/**
 * THE EMAIL ADAPTER — SYNTHETIC (B34, 0090 §0.5; F-P6-07 "notification transport"). It speaks SMTP (RFC 5321: EHLO, MAIL FROM, RCPT TO,
 * DATA, QUIT) over node:net to the configured LOCAL sink (eye.attention.sink_host — loopback only — and eye.attention.smtp_port), for the
 * recipient's SYNTHETIC address (principal-<id>@synthetic.eye.invalid: no mailbox exists). The sink's `250 … queued as <id>` is the receipt;
 * a 4xx/5xx reply, a refused connection or a timeout is a FAILED attempt with that reason (the delivery port retries, then abandons).
 * No real mail server is ever contacted: a real provider is owner decision D6, and this closes no real-provider clause.
 */
import { createHash } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { EYE_CONFIG } from '../../../config/config.module.js';
import type { EyeConfig } from '../../../config/config.js';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from './channel.js';
import { isLoopbackHost, SYNTHETIC_SINK_NOTE } from './local-sink.js';

export const SYNTHETIC_MAIL_DOMAIN = 'synthetic.eye.invalid';
const TIMEOUT_MS = 5_000;

/** One SMTP conversation; answers the final DATA reply (its code and text) or throws with the step that failed. */
export async function smtpSend(a: { host: string; port: number; from: string; to: string; data: string; timeoutMs?: number }): Promise<{ code: number; text: string }> {
  if (!isLoopbackHost(a.host)) throw new Error(`the SMTP sink ${a.host} is not loopback (a real provider is owner decision D6)`);
  const socket: Socket = connect({ host: a.host, port: a.port });
  socket.setEncoding('utf8');
  let buffer = ''; let waiter: ((r: { code: number; text: string }) => void) | null = null; let failer: ((e: Error) => void) | null = null;
  const fail = (e: Error) => { const f = failer; waiter = null; failer = null; f?.(e); };
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    // a reply is complete at a line `NNN <text>` (continuation lines read `NNN-<text>`)
    const lines = buffer.split('\r\n');
    for (let i = 0; i < lines.length - 1; i += 1) {
      const m = /^(\d{3}) (.*)$/.exec(lines[i]!);
      if (m !== null) {
        const text = lines.slice(0, i + 1).map((l) => l.slice(4)).join(' ');
        buffer = lines.slice(i + 1).join('\r\n');
        const w = waiter; waiter = null; failer = null;
        w?.({ code: Number(m[1]), text });
        return;
      }
    }
  });
  socket.on('error', (e) => fail(e));
  socket.on('close', () => fail(new Error('the SMTP sink closed the connection')));
  const timer = setTimeout(() => { fail(new Error(`the SMTP sink did not answer within ${a.timeoutMs ?? TIMEOUT_MS} ms`)); socket.destroy(); }, a.timeoutMs ?? TIMEOUT_MS);
  const reply = (): Promise<{ code: number; text: string }> => new Promise((resolve, reject) => { waiter = resolve; failer = reject; });
  const step = async (line: string | null, expect: number, what: string) => {
    const p = reply();
    if (line !== null) socket.write(`${line}\r\n`);
    const r = await p;
    if (r.code !== expect) throw new Error(`SMTP ${what}: the sink answered ${r.code} ${r.text}`.slice(0, 400));
    return r;
  };
  try {
    await step(null, 220, 'greeting');
    await step('EHLO eye.local', 250, 'EHLO');
    await step(`MAIL FROM:<${a.from}>`, 250, 'MAIL FROM');
    await step(`RCPT TO:<${a.to}>`, 250, 'RCPT TO');
    await step('DATA', 354, 'DATA');
    // dot-stuffing (RFC 5321 §4.5.2) and the terminating line
    const body = a.data.replace(/\r?\n/g, '\r\n').split('\r\n').map((l) => (l.startsWith('.') ? `.${l}` : l)).join('\r\n');
    const done = await step(`${body}\r\n.`, 250, 'message');
    socket.write('QUIT\r\n');
    return done;
  } finally {
    clearTimeout(timer);
    socket.removeAllListeners('close');
    socket.end();
  }
}

@Injectable()
export class EmailChannel implements ChannelAdapter {
  readonly name = 'email';
  readonly synthetic = true;
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  async deliver(msg: DeliveryMessage): Promise<ChannelResult> {
    const host = this.cfg['eye.attention.sink_host']; const port = this.cfg['eye.attention.smtp_port'];
    if (port === 0) return { state: 'failed', receipt: null, error: 'email: no local SMTP sink is configured in this runtime (eye.attention.smtp_port); a real provider is owner decision D6' };
    const to = `principal-${msg.recipient}@${SYNTHETIC_MAIL_DOMAIN}`;
    const bodyDigest = createHash('sha256').update(msg.body, 'utf8').digest('hex');
    const data = [`From: THE EYE attention <attention@${SYNTHETIC_MAIL_DOMAIN}>`, `To: <${to}>`, `Subject: ${msg.subject.replace(/[\r\n]+/g, ' ')}`,
      `X-Eye-Delivery: ${msg.deliveryId}`, `X-Eye-Attempt: ${msg.attempt}/${msg.maxAttempts}`, 'X-Eye-Synthetic: true', 'Content-Type: text/plain; charset=utf-8', '',
      msg.body, '', SYNTHETIC_SINK_NOTE].join('\r\n');
    try {
      const r = await smtpSend({ host, port, from: `attention@${SYNTHETIC_MAIL_DOMAIN}`, to, data });
      const id = /queued as ([A-Za-z0-9._-]+)/i.exec(r.text)?.[1] ?? null;
      if (id === null) return { state: 'failed', receipt: null, error: `email: the sink accepted without a message id (${r.text.slice(0, 200)})` };
      return { state: 'delivered', providerRef: `email:${id}`,
               receipt: { channel: 'email', synthetic: true, sink: `smtp://${host}:${port}`, sink_message_id: id, to, body_digest: bodyDigest, reply: `${r.code} ${r.text}`.slice(0, 300), note: SYNTHETIC_SINK_NOTE } };
    } catch (e) {
      return { state: 'failed', receipt: null, error: `email: ${(e as Error).message}`.slice(0, 500) };
    }
  }
}
