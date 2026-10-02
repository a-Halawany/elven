/**
 * CP-6 B23 (0084) · L1-I02 "Acquire" — the STREAM form, at the connector, the digest, the refusal rows and the PDP.
 *
 * Service-level: the real RestConnector's `planStream` / `acquireStream` over the committed synthetic replay set
 * (fixtures/phase1/replay/red-sea-corridor-stream) and over an injected transport double for the live closed-range walk.
 * The database evidence — the stream ports, backpressure, interrupt and resume, the incomplete ranges, the command form
 * unchanged — is in `test/int/phase6-acquire-stream-b23.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RestConnector, BACKFILL_METHOD_REF, LIVE_STREAM_PARTITION } from '../../src/observation/connectors/rest.connector.js';
import { BudgetMeter, StreamPlanRefused, type AcquiredSegment, type AcquisitionContext, type BackfillDeclaration, type SourceBinding }
  from '../../src/observation/connectors/sdk.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';
import { segmentDigest } from '../../src/observation/acquisition/lifecycle.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService } from '../../src/policy/pdp.service.js';

const REPLAY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'phase1', 'replay');
const BASE = 'https://backfill.example/series?format=jsondata';

function binding(over: Partial<SourceBinding>): SourceBinding {
  return {
    sourceId: 's', sourceKey: 'k', replaySet: 'red-sea-corridor-stream', contractVersion: 2, acquisitionMode: 'replay',
    authorityClass: 'observational', endpoints: ['https://corridor-stream.synthetic.example/red-sea/chokepoint4'],
    expectedSchema: { mediaTypes: ['application/json'], requiredFields: ['features.[].attributes.date'], driftTolerance: 0,
                      itemPath: 'features', itemKeyField: 'attributes.date', itemTimeField: 'attributes.date' },
    budgets: { maxRequestsPerRun: 12, maxBytesPerRun: 1 << 24, maxConcurrency: 1, timeoutMs: 60_000, maxRetries: 0 },
    egress: { hostAllowlist: ['backfill.example'], schemeAllowlist: ['https'], maxRedirects: 0, timeoutMs: 1000,
              maxResponseBytes: 1 << 24, maxDecompressedBytes: 1 << 24 },
    ...over,
  };
}
const ctx = (b: SourceBinding): AcquisitionContext => ({ binding: b, checkpoint: null, budget: new BudgetMeter(b.budgets), replayRoot: REPLAY_ROOT });
const ok = (body: string, status = 200): EgressResult => ({
  status, headers: { 'content-type': 'application/json' }, body: Buffer.from(body, 'utf8'),
  finalUrlRedacted: 'redacted', hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.1', retryAfterSeconds: null,
} as EgressResult);
async function all(it: AsyncIterable<AcquiredSegment>): Promise<AcquiredSegment[]> {
  const out: AcquiredSegment[] = [];
  for await (const s of it) out.push(s);
  return out;
}

describe('B23 · the replay stream: the MANIFEST pages of a partition, one segment per pull', () => {
  it('plans the partition, yields its six pages in order with the planted gap, every item deterministic', async () => {
    const conn = new RestConnector();
    const b = binding({});
    const plan = await conn.planStream(ctx(b), { partition: 'chokepoint4', range: null });
    expect(plan).toEqual({ partition: 'chokepoint4', rangeFrom: '2024-01-01', rangeTo: '2024-01-31', initialCursor: { position: 0, through: '2024-01-01' } });
    const segs = await all(conn.acquireStream(ctx(b), { partition: 'chokepoint4', rangeFrom: plan.rangeFrom, rangeTo: plan.rangeTo, cursor: plan.initialCursor }));
    expect(segs.map((s) => [s.rangeFrom, s.rangeTo, s.gap?.reasonClass ?? null, s.items.length, s.last])).toEqual([
      ['2024-01-01', '2024-01-06', null, 6, false],
      ['2024-01-06', '2024-01-11', null, 6, false],
      ['2024-01-11', '2024-01-16', 'publisher_gap', 0, false],
      ['2024-01-16', '2024-01-21', null, 6, false],
      ['2024-01-21', '2024-01-26', null, 6, false],
      ['2024-01-26', '2024-01-31', null, 6, true],
    ]);
    expect(segs[2]?.gap?.detail).toMatch(/DEF-S1/);
    // Every item deterministic (a redelivery admits nothing twice); the parent carries the backfill traversal ref — no new method.
    for (const s of segs) for (const i of s.items) expect(i.deterministic).toBe(true);
    expect(segs[0]?.items[0]?.transport.methodRef).toBe(BACKFILL_METHOD_REF);
    expect(segs[0]?.items[0]?.itemKey).toMatch(/@stream:chokepoint4:2024-01-01\.\.2024-01-06$/);
    expect(segs[0]?.items[1]?.parentItemKey).toBe(segs[0]?.items[0]?.itemKey);
    expect(segs.map((s) => s.cursorAfter.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resumes from a cursor: the pull starts at the cursor\'s page, and the same page yields the same digest', async () => {
    const conn = new RestConnector();
    const b = binding({});
    const first = await all(conn.acquireStream(ctx(b), { partition: 'chokepoint4', rangeFrom: '2024-01-01', rangeTo: '2024-01-31', cursor: { position: 0, through: '2024-01-01' } }));
    const resumed = await all(conn.acquireStream(ctx(b), { partition: 'chokepoint4', rangeFrom: '2024-01-01', rangeTo: '2024-01-31', cursor: { position: 3, through: '2024-01-16' } }));
    expect(resumed.map((s) => s.rangeFrom)).toEqual(['2024-01-16', '2024-01-21', '2024-01-26']);
    expect(segmentDigest(resumed[0] as AcquiredSegment)).toBe(segmentDigest(first[3] as AcquiredSegment));
    expect(segmentDigest(first[0] as AcquiredSegment)).not.toBe(segmentDigest(first[1] as AcquiredSegment));
  });

  it('a narrower range selects its pages; an unknown partition or a range outside the declared one is refused', async () => {
    const conn = new RestConnector();
    const b = binding({});
    const plan = await conn.planStream(ctx(b), { partition: 'chokepoint4', range: { from: '2024-01-16', to: '2024-01-31' } });
    expect(plan.initialCursor).toEqual({ position: 3, through: '2024-01-16' });
    await expect(conn.planStream(ctx(b), { partition: 'chokepoint1', range: null })).rejects.toBeInstanceOf(StreamPlanRefused);
    await expect(conn.planStream(ctx(b), { partition: 'chokepoint4', range: { from: '2023-12-01', to: '2024-01-31' } })).rejects.toThrow(/declares no page/);
  });

  it('the stream form changes nothing about the command form: the code digest and the forward replay read are as before', async () => {
    const conn = new RestConnector();
    // The digest the fixture agents and the demonstration's agents are registered against (B11) — unchanged by B23.
    expect(conn.codeDigest).toBe(new RestConnector({ egress: async () => ok('{}') }).codeDigest);
    const out = await conn.acquire(ctx(binding({})));
    // The contract's identity endpoint is the whole-month snapshot: one parent and its 25 rows (the gap days absent).
    expect(out.items.length).toBe(26);
    expect(out.items.some((i) => i.deterministic === true)).toBe(false);
  });
});

describe('B23 · the live stream: the declared closed-range traversal as the one partition `backfill`', () => {
  const PERIOD: BackfillDeclaration = { strategy: 'period-range', endpoint: BASE, from: '2023-01-01', to: '2023-02-20',
                                       windowDays: 10, startParam: 'startPeriod', endParam: 'endPeriod' };
  const live = binding({ acquisitionMode: 'live', endpoints: [BASE], backfill: PERIOD,
                         expectedSchema: { mediaTypes: ['application/json'], requiredFields: [], driftTolerance: 0 } });

  it('a non-2xx window is a SEGMENT WITH A GAP (publisher_gap), an egress refusal a `refused` gap; the walk moves past both', async () => {
    const seen: string[] = [];
    const conn = new RestConnector({ egress: async ({ url }) => {
      seen.push(url);
      const start = new URL(url).searchParams.get('startPeriod');
      if (start === '2023-01-21') return ok('{"error":"none"}', 404);
      return ok('{"dataSets":[]}');
    } });
    const plan = await conn.planStream(ctx(live), { partition: LIVE_STREAM_PARTITION, range: null });
    expect(plan).toMatchObject({ rangeFrom: '2023-01-01', rangeTo: '2023-02-20', initialCursor: { position: '2023-01-01' } });
    const segs = await all(conn.acquireStream(ctx(live), { partition: 'backfill', rangeFrom: plan.rangeFrom, rangeTo: plan.rangeTo, cursor: plan.initialCursor }));
    expect(segs.map((s) => [s.rangeFrom, s.rangeTo, s.gap?.reasonClass ?? null, s.items.length, s.last])).toEqual([
      ['2023-01-01', '2023-01-11', null, 1, false],
      ['2023-01-11', '2023-01-21', null, 1, false],
      ['2023-01-21', '2023-01-31', 'publisher_gap', 0, false],
      ['2023-01-31', '2023-02-10', null, 1, false],
      ['2023-02-10', '2023-02-20', null, 1, true],
    ]);
    expect(segs[2]?.gap?.detail).toMatch(/answered 404/);
    expect(seen.length).toBe(5);
    // The same key as the command form's backfill page for the same window — the two forms never admit a window twice.
    expect(segs[0]?.items[0]?.itemKey).toMatch(/@backfill:2023-01-01\.\.2023-01-11$/);
  });

  it('pulls lazily: nothing is fetched until the next segment is asked for', async () => {
    let fetched = 0;
    const conn = new RestConnector({ egress: async () => { fetched += 1; return ok('{"dataSets":[]}'); } });
    const it = conn.acquireStream(ctx(live), { partition: 'backfill', rangeFrom: '2023-01-01', rangeTo: '2023-02-20', cursor: { position: '2023-01-31', through: '2023-01-31' } })[Symbol.asyncIterator]();
    expect(fetched).toBe(0);
    const one = await it.next();
    expect(fetched).toBe(1);
    expect((one.value as AcquiredSegment).rangeFrom).toBe('2023-01-31');
  });

  it('refuses a partition other than `backfill` and a contract with no declared traversal', async () => {
    const conn = new RestConnector({ egress: async () => ok('{}') });
    await expect(conn.planStream(ctx(live), { partition: 'series', range: null })).rejects.toThrow(/one partition "backfill"/);
    await expect(conn.planStream(ctx(binding({ acquisitionMode: 'live', endpoints: [BASE] })), { partition: 'backfill', range: null }))
      .rejects.toThrow(/no closed-range traversal/);
    await expect(conn.planStream(ctx(live), { partition: 'backfill', range: { from: '2022-12-01', to: '2023-01-10' } })).rejects.toThrow(/not inside/);
  });
});

describe('B23 · the stream ports\' refusals answer as what they are (404 → 409 → 422)', () => {
  const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
  const answer = (code: string, m: string) => { const r = asObservationRefusal(pg(code, m), 'corr'); return r === null ? null : { status: r.getStatus(), message: (r.getResponse() as { message: string }).message }; };
  it('maps each class with the port\'s own sentence', () => {
    for (const [code, m, status] of [
      ['23503', 'acquisition stream rejected: no such stream 0190b1c2-d3e4-7000-8000-000000000001 in this domain', 404],
      ['23503', 'acquisition stream rejected: no source contract 0190b1c2-d3e4-7000-8000-000000000001 version 3 in this domain', 404],
      ['23514', 'acquisition stream rejected (not_resumable): stream x is completed; a closed stream is not resumed', 409],
      ['23514', 'acquisition stream rejected (stale_contract): stream x of partition k:p was opened under contract version 2, not 3', 409],
      ['23514', 'acquisition stream rejected (range_mismatch): stream x of partition k:p covers [a, b), not [c, d)', 409],
      ['23514', 'acquisition stream rejected (not_running): stream x is open and driven by run <none>, not run y', 409],
      ['23514', 'acquisition stream rejected (out_of_order): segment 4 is not the next segment 2 of stream x', 409],
      ['23514', 'acquisition stream rejected (not_interruptible): stream x is already interrupted', 409],
      ['23505', 'acquisition stream rejected (digest_conflict): segment 0 of stream x is held with digest a, not b; a position holds one content', 409],
      ['22023', 'acquisition stream rejected (partition): the partition key other:p does not name a partition of source k', 422],
      ['22023', 'acquisition stream rejected (credit): the credit (the most unacknowledged segments) is between 1 and 64, not 0', 422],
      ['22023', 'acquisition stream rejected (range): an incomplete range names its bounds in order', 422],
      ['22023', 'acquisition stream rejected (reason): an interrupt records its reason', 422],
    ] as const) {
      expect(answer(code, m), m).toEqual({ status, message: m });
    }
  });
});

describe('B23 · the PDP: the operator\'s stream acts are exact rules for the humans who collect by hand', () => {
  const pdp = new PdpService();
  const decide = (action: string, role: string) => pdp.evaluate({
    principal: { principalId: 'p', kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: 't', domainId: 'd' }] },
    delegationId: null, action, objectType: 'AQS', objectId: null, purposeId: 'observation',
    context: { scope: 'DOMAIN', tenantId: 't', domainId: 'd' }, consequenceClass: 'C1',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as never).decision;
  it('open, resume and interrupt: collection_manager / domain_analyst / domain_admin allow; the collection agent and others deny', () => {
    for (const action of ['observation.stream.open', 'observation.stream.resume', 'observation.stream.interrupt']) {
      for (const role of ['collection_manager', 'domain_analyst', 'domain_admin']) expect(decide(action, role), `${action} ${role}`).toBe('allow');
      for (const role of ['collection_agent', 'forecast_owner', 'auditor']) expect(decide(action, role), `${action} ${role}`).toBe('deny');
    }
    // The reads ride the existing observation.read rule; the run's own writes the existing catch-all, for the agent.
    expect(decide('observation.read.streams', 'collection_agent')).toBe('allow_with_obligations'); // audit_access
    expect(decide('observation.run.checkpoint', 'collection_agent')).toBe('allow');
  });
});
