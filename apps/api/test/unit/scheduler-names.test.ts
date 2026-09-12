/**
 * Queue identity under the PINNED BullMQ 6.0.6 (SCHEDULED_COLLECTION.md §1.2).
 *
 * The stored, logical names are scope-prefixed with ':' and constrained so in the
 * database (migration 0022, sched_scoped_names). BullMQ 6.0.6 refuses a queue name
 * containing ':' before it touches any backend. The Redis-facing name is derived by
 * an injective, scope-preserving mapping and never persisted. This test executes the
 * pinned dependency's constructor — a reproduction, not a description.
 */
import { describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { queueNameFor, schedulerIdFor, redisName } from '../../src/observation/scheduling/scheduler.service.js';

const T = '01a078a1-07c6-7e28-bd31-497b640c49b9';
const D = '01a078a1-07d9-79ff-8774-fa61f35c0c19';
const S = '01a078a1-089e-7856-afb6-0de0bc6efcf5';
// No connection is opened: the refusal happens in QueueBase's constructor before any backend exists,
// and the accepted name is closed immediately without a command.
const connection = { host: '127.0.0.1', port: 1, password: 'unused', lazyConnect: true, maxRetriesPerRequest: 1 };

describe('scheduler queue identity under BullMQ 6.0.6', () => {
  it('the STORED logical queue name is refused by the pinned QueueBase constructor', () => {
    const logical = queueNameFor(T, D);
    expect(logical).toBe(`obs:${T}:${D}:collection`);
    expect(() => new Queue(logical, { connection })).toThrow('Queue name cannot contain :');
  });

  it('the derived Redis name is accepted, keeps tenant and domain, and is injective over scope identifiers', async () => {
    const name = redisName(queueNameFor(T, D));
    expect(name).toBe(`obs.${T}.${D}.collection`);
    expect(name.includes(':')).toBe(false);
    expect(name).toContain(T); expect(name).toContain(D);
    const q = new Queue(name, { connection });
    await q.close().catch(() => undefined);
    // Injective: two scopes never collide, and the logical name is recoverable (no '.' or ':' in a uuid).
    const other = redisName(queueNameFor(T, S));
    expect(other).not.toBe(name);
    expect(name.replaceAll('.', ':')).toBe(queueNameFor(T, D));
    for (const id of [T, D, S]) expect(/[.:]/.test(id)).toBe(false);
  });

  it('scheduler ids map the same way and stay scope-prefixed', () => {
    const logical = schedulerIdFor(T, D, S);
    expect(logical).toBe(`obs:${T}:${D}:src:${S}`);
    expect(redisName(logical)).toBe(`obs.${T}.${D}.src.${S}`);
  });
});
