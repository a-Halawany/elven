/**
 * 0057 · A background publisher that cannot publish reports and retries; it never
 * ends the process.
 *
 * On 2026-09-10 the publisher's interval callback ran `void this.publishPending()`;
 * the tick's first transaction rejected (an expired publish context) and, with no
 * catch, Node ended the API on the unhandled rejection. This test drives the interval
 * with a publishPending that rejects the way the database did, and asserts the
 * rejection is REPORTED (once per streak) and never escapes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { OutboxPublisher } from '../../src/objects/outbox.publisher.js';

describe('OutboxPublisher — a failed tick is reported, never fatal', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown): void => { unhandled.push(e); };
  beforeEach(() => { vi.useFakeTimers(); unhandled.length = 0; process.on('unhandledRejection', onUnhandled); });
  afterEach(() => { vi.useRealTimers(); process.off('unhandledRejection', onUnhandled); vi.restoreAllMocks(); });

  it('the interval callback catches a rejecting publishPending, reports it once, and keeps ticking', async () => {
    const cfg = { 'eye.redis.host': '127.0.0.1', 'eye.redis.port': 1, 'eye.redis.password': 'x' };
    const pub = new OutboxPublisher({} as never, cfg as never);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failing = vi.spyOn(pub, 'publishPending')
      .mockRejectedValue(new Error('capability denied: mode publish required (context is none)'));
    // onModuleInit constructs a BullMQ Queue (lazy; no connection is made without a command) and arms the interval.
    pub.onModuleInit();
    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await pub.onModuleDestroy();
    expect(failing).toHaveBeenCalledTimes(3);
    expect(unhandled, 'a failed tick escaped as an unhandled rejection').toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/publish tick failed; pending rows stay pending and the next tick retries: capability denied/);
  });
});
