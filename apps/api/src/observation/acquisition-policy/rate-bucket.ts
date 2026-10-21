/**
 * CP-6 B40 §AP (L1-I02, V03-T-073) — THE PER-SOURCE TOKEN BUCKET in Redis (SRC@v4 acquisition_policy.rate: `requests` per `per_seconds`,
 * at most `burst` at once), keyed by SOURCE so the command form, the stream form and §CR's egress gateway — every caller of the throttle
 * stage, in every process — draw from ONE bucket. The refill and the take are one Lua script on Redis's own clock (TIME), so two processes
 * never disagree about the instant. An unreachable bucket is an ANSWER: `unavailable` — the stage refuses the request (fail closed; F50).
 * The existing ioredis dependency; no new one.
 */
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import * as fault from '../fault-injection.js';

/** KEYS[1] the bucket · ARGV: requests, per_seconds, burst → { taken (1|0), wait_ms } */
const TAKE = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local rate = tonumber(ARGV[1]) / (tonumber(ARGV[2]) * 1000)
local burst = tonumber(ARGV[3])
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil or ts == nil then tokens = burst; ts = now end
tokens = math.min(burst, tokens + math.max(0, now - ts) * rate)
local taken = 0
local wait = 0
if tokens >= 1 then
  tokens = tokens - 1
  taken = 1
else
  wait = math.ceil((1 - tokens) / rate)
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil(tonumber(ARGV[2]) * 1000 * 2) + 60000)
return { taken, wait }
`;

export type BucketAnswer = { kind: 'taken' } | { kind: 'wait'; waitMs: number } | { kind: 'unavailable'; reason: string };
export interface BucketRate { requests: number; per_seconds: number; burst: number }

@Injectable()
export class RateBucket implements OnModuleDestroy {
  private client: Redis | null = null;
  private connecting: Promise<void> | null = null;
  private override: { port: number } | null = null;

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  private redis(): Redis {
    if (this.client === null) {
      this.client = new Redis({
        host: this.cfg['eye.redis.host'], port: this.override?.port ?? this.cfg['eye.redis.port'], password: this.cfg['eye.redis.password'],
        lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, connectTimeout: 1_500, commandTimeout: 2_000,
        retryStrategy: (n) => Math.min(n * 250, 2_000),
      });
      this.client.on('error', () => undefined); // answered per call as `unavailable`; never an unhandled event
    }
    return this.client;
  }

  /** TEST CONTROL ONLY: point the bucket at another Redis port (an unreachable one proves the fail-closed answer). */
  async useRedisPortForTests(port: number | null): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useRedisPortForTests is available only in the test runtime');
    await this.onModuleDestroy();
    this.override = port === null ? null : { port };
  }

  /** The client, connected (one connect at a time; a failed connect is retried by the next call). */
  private async ready(): Promise<Redis> {
    const r = this.redis();
    if (r.status === 'ready') return r;
    if (r.status === 'wait' || r.status === 'end') {
      this.connecting ??= r.connect().finally(() => { this.connecting = null; });
    }
    if (this.connecting !== null) {
      const c = this.connecting;
      await Promise.race([c, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('connect timed out after 2500 ms')), 2_500).unref())]);
    }
    return r;
  }

  static keyOf(sourceId: string): string { return `eye:b40:ap:bucket:${sourceId}`; }

  /** Take one token, or say how long until one is free. Any Redis failure — a refused connection, a timeout — answers `unavailable`. */
  async take(sourceId: string, rate: BucketRate): Promise<BucketAnswer> {
    try {
      fault.at('f50.rate_bucket_unavailable');
      const r = await this.ready();
      const out = await r.eval(TAKE, 1, RateBucket.keyOf(sourceId), String(rate.requests), String(rate.per_seconds), String(rate.burst)) as [number, number];
      return Number(out[0]) === 1 ? { kind: 'taken' } : { kind: 'wait', waitMs: Math.max(1, Number(out[1])) };
    } catch (e) {
      return { kind: 'unavailable', reason: `the rate bucket could not be reached (${(e as Error).message.slice(0, 160)})` };
    }
  }

  /** Is the bucket reachable at all (the authorization's pre-egress check)? */
  async ping(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      fault.at('f50.rate_bucket_unavailable');
      const r = await this.ready();
      await r.ping();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `the rate bucket could not be reached (${(e as Error).message.slice(0, 160)})` };
    }
  }

  /** TEST CONTROL ONLY: forget a source's bucket (a fresh case starts full). */
  async resetForTests(sourceId: string): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('resetForTests is available only in the test runtime');
    const r = await this.ready();
    await r.del(RateBucket.keyOf(sourceId));
  }

  async onModuleDestroy(): Promise<void> {
    const c = this.client;
    this.client = null;
    this.connecting = null;
    if (c !== null) await c.quit().catch(() => c.disconnect());
  }
}
