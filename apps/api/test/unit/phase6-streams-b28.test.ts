/**
 * CP-6 B28 (0088 §S, F-P4-11) — the event-time stream processors, at the pure model, the refusal rows, the PDP and the consumer's
 * identity. The database evidence (the ports, the consumer over a real stream, the recovery paths) is in
 * `test/int/phase6-streams-b28.test.ts`, which also replays its arrivals through `simulate` and compares.
 */
import { describe, expect, it } from 'vitest';
import {
  DAY_MS, aggregate, classifyLateness, dayMs, ruleDefinitionProblem, simulate, watermarkOf, windowAt, windowsContaining, type RuleGeometry,
} from '../../src/prediction/streams/stream-windows.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import { CONSUMER_ACTION, CONSUMER_EVENT_TYPES, CONSUMER_KINDS, CONSUMER_ROLE, consumerCodeDigest } from '../../src/graph/subscriptions/graph-change.js';
import { streamOriginKey, streamTs } from '../../src/prediction/streams/stream-processor.service.js';

/** The corridor rule of the harness and the demonstration: five-day tumbling windows from 2024-02-01, lag one day, ten days' allowance. */
const CORRIDOR: RuleGeometry = {
  windowKind: 'tumbling', windowDays: 5, slideDays: 5, windowOrigin: '2024-02-01', allowedLatenessMs: 10 * DAY_MS, watermarkLagMs: DAY_MS,
  predicate: { comparator: 'lt', threshold: 30, min_hits: 3 },
};
const rows = (from: string, values: number[], page: string) => values.map((value, i) => {
  const day = new Date(dayMs(from) + i * DAY_MS).toISOString().slice(0, 10);
  return { key: `${page}:${day}`, day, value };
});
/** The late set's parent pages in arrival order (fixtures/phase1/replay/red-sea-corridor-stream-late; the redelivered page admits nothing). */
const LATE_BATCHES = [
  rows('2024-02-01', [38, 41, 39, 37, 40], 'A'),
  rows('2024-02-11', [24, 22, 26, 21, 25], 'B'),
  rows('2024-02-06', [31, 28, 27, 29, 33], 'C'),
  rows('2024-02-21', [36, 38, 35, 39, 37], 'E'),
  [...rows('2024-02-26', [25, 23, 27, 22], 'F'), { key: 'F:2024-02-13', day: '2024-02-13', value: 26 }],
  [...rows('2024-03-01', [24, 34, 36, 38, 35], 'G'), { key: 'G:2024-02-23', day: '2024-02-23', value: 28 }, { key: 'G:2024-02-02', day: '2024-02-02', value: 19 }],
];

describe('B28 · the window geometry and the watermark', () => {
  it('tumbling and sliding windows contain a day as the rule says; the watermark is the highest event time minus the lag', () => {
    expect(windowsContaining(CORRIDOR, '2024-02-06')).toEqual([1]);
    expect(windowAt(CORRIDOR, 1)).toEqual({ start: '2024-02-06', end: '2024-02-11' });
    expect(windowsContaining(CORRIDOR, '2024-01-31').map((k) => windowAt(CORRIDOR, k))).toEqual([{ start: '2024-01-27', end: '2024-02-01' }]);
    const sliding = { windowOrigin: '2024-02-01', windowDays: 7, slideDays: 1 };
    expect(windowsContaining(sliding, '2024-02-10').map((k) => windowAt(sliding, k).start)).toEqual(
      ['2024-02-04', '2024-02-05', '2024-02-06', '2024-02-07', '2024-02-08', '2024-02-09', '2024-02-10']);
    expect(watermarkOf(null, DAY_MS)).toBeNull();
    expect(new Date(watermarkOf(dayMs('2024-02-15'), DAY_MS) as number).toISOString()).toBe('2024-02-14T00:00:00.000Z');
  });
  it('lateness is judged against the watermark AT ARRIVAL and the windows\' status: on time, within the allowance, beyond it', () => {
    const W = dayMs('2024-02-14');
    expect(classifyLateness(CORRIDOR, '2024-02-13', () => undefined, W)).toBe('on_time');                // [11,16) not due
    expect(classifyLateness(CORRIDOR, '2024-02-07', () => 'fired', W)).toBe('late_within_allowance');    // [06,11) fired
    expect(classifyLateness(CORRIDOR, '2024-02-07', () => undefined, W)).toBe('late_within_allowance');  // due, 11 + 10 > 14
    expect(classifyLateness(CORRIDOR, '2024-02-02', () => 'closed', W)).toBe('late_beyond_allowance');
    expect(classifyLateness(CORRIDOR, '2024-01-02', () => undefined, W)).toBe('late_beyond_allowance'); // never fired, far past
    expect(classifyLateness(CORRIDOR, '2024-02-02', () => undefined, null)).toBe('on_time');            // no watermark yet
  });
  it('the predicate holds, fails, or is undetermined when the missing days could decide it', () => {
    const p = CORRIDOR.predicate;
    expect(aggregate(new Map([['a', 24], ['b', 22], ['c', 26]]), 5, p)).toEqual({ n: 3, hits: 3, holds: true });
    expect(aggregate(new Map([['a', 38], ['b', 41], ['c', 39], ['d', 37]]), 5, p)).toEqual({ n: 4, hits: 0, holds: false });
    expect(aggregate(new Map(), 5, p)).toEqual({ n: 0, hits: 0, holds: null });
    expect(aggregate(new Map([['a', 24], ['b', 38], ['c', 39]]), 5, p)).toEqual({ n: 3, hits: 1, holds: null });
  });
});

describe('B28 · the late set replayed through the rules (the differential model)', () => {
  it('fires on EVENT time, labels the late window instead of hiding it, and emits nothing for a duplicate', () => {
    const r = simulate(CORRIDOR, LATE_BATCHES, [{ from: '2024-02-16', to: '2024-02-21' }]);
    expect(r.emissions.map((e) => [e.windowStart, e.emission, e.revision, e.label, e.n, e.hits, e.holds])).toEqual([
      ['2024-02-01', 'fired', 0, 'on_time', 5, 0, false],          // B moves the watermark to 02-14
      ['2024-02-06', 'fired', 0, 'partial_window', 0, 0, null],    // a gap at the time: fired as the gap it is
      ['2024-02-06', 'revised', 1, 'late_window', 5, 3, true],     // DEF-L2: the late page revises it, labelled LATE — the collapse
      ['2024-02-11', 'fired', 0, 'on_time', 5, 5, true],           // DEF-L1 arrived early, fired on event time
      ['2024-02-16', 'fired', 0, 'partial_window', 0, 0, null],    // DEF-L3: the publisher gap
      ['2024-02-21', 'fired', 0, 'on_time', 5, 0, false],
      ['2024-02-21', 'revised', 1, 'late_window', 5, 1, false],    // DEF-L5: the revised value
      ['2024-02-26', 'fired', 0, 'on_time', 5, 5, true],
    ]);
    const label = (key: string) => r.inputs.find((i) => i.key === key);
    expect(label('B:2024-02-11')).toMatchObject({ lateness: 'on_time', disposition: 'new' });
    expect(label('C:2024-02-06')).toMatchObject({ lateness: 'late_within_allowance', disposition: 'new' });
    expect(label('F:2024-02-13')).toMatchObject({ lateness: 'late_within_allowance', disposition: 'duplicate' });   // DEF-L4
    expect(label('G:2024-02-23')).toMatchObject({ lateness: 'late_within_allowance', disposition: 'revision' });    // DEF-L5
    expect(label('G:2024-02-02')).toMatchObject({ lateness: 'late_beyond_allowance', disposition: 'revision' });    // DEF-L6
    expect(r.windows.find((w) => w.start === '2024-02-01')).toMatchObject({ status: 'closed', lateExcluded: 1 });
    expect(r.windows.find((w) => w.start === '2024-03-02')).toMatchObject({ status: 'open', n: 4 });
    expect(r.watermark).toBe('2024-03-04T00:00:00.000Z');
  });
  it('a redelivery is a repeat (no input); a different value under the same key is the port\'s value conflict', () => {
    const again = simulate(CORRIDOR, [...LATE_BATCHES, LATE_BATCHES[0] as never]);
    expect(again.repeated).toBe(5);
    expect(again.emissions).toHaveLength(8);
    expect(() => simulate(CORRIDOR, [LATE_BATCHES[0] as never, [{ key: 'A:2024-02-01', day: '2024-02-01', value: 1 }]])).toThrow(/value_conflict/);
  });
  it('a window whose every input arrived beyond the allowance is closed unevaluated', () => {
    const r = simulate(CORRIDOR, [rows('2024-02-20', [40, 40, 40, 40, 40], 'X'), rows('2024-02-02', [10, 10], 'Y')]);
    expect(r.emissions.some((e) => e.windowStart === '2024-02-01')).toBe(false);
    expect(r.windows.find((w) => w.start === '2024-02-01')).toMatchObject({ status: 'closed', lateExcluded: 2, holds: null });
  });
});

describe('B28 · the rule definition is checked before the port', () => {
  const ok = { ruleKey: 'corridor-collapse', title: 'Corridor collapse', seriesKey: 'corridor-transits', windowKind: 'tumbling', windowDays: 5, windowOrigin: '2024-02-01',
               allowedLatenessHours: 240, watermarkLagHours: 24, stallAfterSeconds: 3600, predicate: { comparator: 'lt', threshold: 30, min_hits: 3 },
               consequenceClass: 'C3', ownerPrincipalId: '01900000-0000-7000-8000-000000000001' };
  it('names the field it refuses', () => {
    expect(ruleDefinitionProblem(ok)).toBeNull();
    expect(ruleDefinitionProblem({ ...ok, windowKind: 'session' })).toMatch(/windowKind/);
    expect(ruleDefinitionProblem({ ...ok, slideDays: 2 })).toMatch(/tumbling window slides by its own length/);
    expect(ruleDefinitionProblem({ ...ok, windowKind: 'sliding', slideDays: 9 })).toMatch(/slideDays/);
    expect(ruleDefinitionProblem({ ...ok, predicate: { comparator: 'lt', threshold: 30, min_hits: 9 } })).toMatch(/predicate/);
    expect(ruleDefinitionProblem({ ...ok, predicate: { comparator: 'lt', threshold: 30, min_hits: 3, extra: 1 } })).toMatch(/nothing else/);
    expect(ruleDefinitionProblem({ ...ok, watermarkLagHours: 1.5 })).toMatch(/watermarkLagHours/);
    expect(ruleDefinitionProblem({ ...ok, windowOrigin: '2024-2-1' })).toMatch(/windowOrigin/);
    expect(ruleDefinitionProblem({ ...ok, consequenceClass: 'C5' })).toMatch(/consequenceClass/);
  });
  it('the candidate origin key is processor:window_start:revision on the ports\' UTC text', () => {
    expect(streamTs(new Date('2024-02-06T00:00:00.000Z'))).toBe('2024-02-06T00:00:00Z');
    expect(streamOriginKey('p', '2024-02-06T00:00:00Z', 1)).toBe('p:2024-02-06T00:00:00Z:1');
  });
});

describe('B28 · the refusal rows answer the ports\' texts with the right status', () => {
  const status = (message: string, code = '22023') => asObservationRefusal(Object.assign(new Error(message), { code }), 'c')?.getStatus() ?? null;
  it('403 / 404 / 409 / 422 in B9\'s order', () => {
    expect(status('stream rule rejected: defined by the acting principal', '42501')).toBe(403);
    expect(status('stream rule rejected: activated by the acting principal', '42501')).toBe(403);
    expect(status('stream processor rejected (actor): recovered by the acting principal', '42501')).toBe(403);
    expect(status('stream signal rejected: retracted by the acting principal', '42501')).toBe(403);
    expect(status('stream rule rejected: no such rule 0190 in this domain', '23503')).toBe(404);
    expect(status('stream rule rejected: no series nope is registered in this domain', '23503')).toBe(404);
    expect(status('stream processor rejected (no_processor): no such processor x in this domain', '23503')).toBe(404);
    expect(status('stream processor rejected (no_source): no source k is registered in this domain', '23503')).toBe(404);
    expect(status('stream signal rejected: no such signal x in this domain', '23503')).toBe(404);
    expect(status('stream rule rejected (unchanged): version 1 of k (active) has this definition; a version records a change', '23505')).toBe(409);
    expect(status('stream rule rejected (not_draft): rule x (version 1 of k) is active; only a draft is activated', '23514')).toBe(409);
    expect(status('stream processor rejected (already_running): processor x of rule k is running; one live processor per rule', '23505')).toBe(409);
    expect(status('stream processor rejected (not_recoverable): processor x is running; only a suspended, stalled or corrupt processor is recovered', '23514')).toBe(409);
    expect(status('stream processor rejected (no_compatible_checkpoint): processor x has no checkpoint', '23514')).toBe(409);
    expect(status('stream processor rejected (retired): processor x is retired (rule superseded)', '23514')).toBe(409);
    expect(status('stream input rejected (value_conflict): evd:x@1:2024-02-01 is held with value 38, not 1; an event key holds one value', '23505')).toBe(409);
    expect(status('stream signal rejected (already_retracted): signal x was retracted already', '23514')).toBe(409);
    expect(status('stream signal rejected (not_an_emission): signal x is itself a retraction', '23514')).toBe(409);
    expect(status('stream rule rejected: predicate is {comparator: lt|le|gt|ge, threshold: number, min_hits: 1..window_days} and nothing else')).toBe(422);
    expect(status('stream processor rejected: a reason of 8..1000 characters says why the processor is recovered')).toBe(422);
    expect(status('stream input rejected: each row is {day: YYYY-MM-DD, value: number}')).toBe(422);
    expect(status('stream signal rejected: a reason of 8..1000 characters says why the signal is retracted')).toBe(422);
  });
});

describe('B28 · the PDP and the consumer identity', () => {
  const pdp = new PdpService();
  const T = '01900000-0000-7000-8000-00000000000a'; const D = '01900000-0000-7000-8000-00000000000b';
  const decide = (action: string, role: string) => pdp.evaluate({
    principal: { principalId: 'p', kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] } as never,
    delegationId: null, action, objectType: 'SPR', objectId: null, purposeId: 'prediction', context: { scope: 'DOMAIN', tenantId: T, domainId: D },
    consequenceClass: 'C2', environment: {} as never,
  } as never);
  it('exact rules: the human-gated acts, the operational acts, the consumer\'s one action', () => {
    for (const a of ['prediction.stream.rule.define', 'prediction.stream.rule.activate', 'prediction.stream.processor.recover', 'prediction.stream.signal.retract']) {
      expect(decide(a, 'forecast_owner').obligations, a).toEqual([{ type: 'human_gate' }]);
      expect(decide(a, 'domain_analyst').decision, a).toBe('deny');
    }
    expect(decide('prediction.stream.processor.start', 'strategy_owner').decision).toBe('allow');
    expect(decide('prediction.stream.processor.reconcile', 'collection_manager').decision).toBe('allow');
    expect(decide('prediction.stream.processor.start', 'collection_manager').decision).toBe('deny');
    expect(decide('prediction.stream.subscription.apply', 'stream_rule_subscriber').decision).toBe('allow');
    expect(decide('prediction.stream.subscription.apply', 'forecast_owner').decision).toBe('deny');
    expect(decide('prediction.stream.rule.define', 'stream_rule_subscriber').decision).toBe('deny');
    expect(decide('prediction.read', 'forecast_owner').decision).toBe('allow_with_obligations');
  });
  it('the stream-rules kind: its action, its role, its one event type, its own digest', () => {
    expect(CONSUMER_KINDS).toContain('stream-rules');
    expect(CONSUMER_ACTION['stream-rules']).toBe('prediction.stream.subscription.apply');
    expect(CONSUMER_ROLE['stream-rules']).toBe('stream_rule_subscriber');
    expect(CONSUMER_EVENT_TYPES['stream-rules']).toEqual(['ObservationRecorded']);
    expect(consumerCodeDigest('stream-rules')).toMatch(/^[0-9a-f]{64}$/);
    expect(consumerCodeDigest('stream-rules')).not.toBe(consumerCodeDigest('observations'));
  });
});
