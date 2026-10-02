/**
 * CP-6 B23 (migration 0084, part `stream`) — L1-I02 "Acquire" GAINS ITS STREAM FORM: segment pull with credit-based flow
 * control over the connector's pages, under a STABLE PARTITION KEY, at-least-once segments, BACKPRESSURE, RESUME from a
 * cursor, an EXPLICIT INCOMPLETE RANGE — and the command form UNCHANGED. On a real database, through the real controller,
 * orchestrator, lifecycle, connector and ports; the run acts as the fixture's registered agent, exactly as `collect` does.
 *
 *   S1 · OPEN, a failure MID-SEGMENT (the 3rd admission commit — fault f25), and the RESUME that redelivers the segment: the
 *        three items admitted before the cut are recorded no-ops, the in-flight range declared `interrupted` is RESOLVED by
 *        the redelivered segment's seq, credit 1 BACKPRESSURE signalled and relieved, a pull limit PAUSES the stream at its
 *        cursor; nothing admitted twice; the connector checkpoint untouched; no run.checkpointed on a stream run.
 *   S2 · an OPERATOR INTERRUPT of an idle stream (immediate; a second one 409), the PDP (403 for a forecast owner and for the
 *        collection agent), the RESUME to the end of the range with credit 2, the planted PUBLISHER GAP (DEF-S1) as an
 *        explicit unresolved incomplete range and the stream `closed_incomplete`; a closed stream is not resumed (409); the
 *        reads (get, list).
 *   S3 · AT-LEAST-ONCE ACKNOWLEDGEMENT at the port: the same (stream, seq) and digest is an audited REDELIVERY (no-op,
 *        delivery_count 2); another digest is refused (23505 → 409); an append to a stream the run does not drive 409.
 *   S4 · a NEW stream on the SAME stable partition key over a narrower range: `completed`, every item a recorded no-op.
 *   S5 · the refusals: 404 (no such stream), 422 (another source's partition key, an unknown partition, a credit of 0),
 *        409 (a source already being collected — the holder named), PURPOSE still enforced at the run's contract lock (a
 *        purpose outside the contract: the run fails and NO stream is created), and RESIDENCY / custody still recorded by
 *        the ordinary admission on every stream-admitted manifest.
 *   S6 · THE COMMAND FORM UNCHANGED: collect now on the same source and contract admits the snapshot as it always did,
 *        writes its run.checkpointed and the connector checkpoint, and touches no stream table.
 *   S7 · the LIVE REST path with transport doubles (the demonstration cannot inject them; this suite can): an operator's
 *        interrupt of a RUNNING stream (the second page held open — the §9.6.1 held-promise technique), honoured at the
 *        next boundary with both unacknowledged segments declared incomplete; the resume resolves both and a 404 window is
 *        a publisher gap; then a stream left `running` by a run that ended without saying so is reconciled at the resume.
 *   S8 · the register: L1-I02 bound in 0084 (only this row is asserted; the global counts are the integrator's).
 *
 * EACH CASE LOGS ONE `B23 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { fixtureContract, inCommitContext } from './phase1-helpers.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import * as fault from '../../src/observation/fault-injection.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';

// The committed replay sets (the stream set is fixtures/phase1/replay/red-sea-corridor-stream), by absolute path.
process.env['EYE_CONNECTOR_REPLAY_ROOT'] = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'phase1', 'replay');
// C5 / Nit 8: this file's own vault roots.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b23-stream-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let ctl: ObservationController; let orchestrator: CollectionOrchestrator;
let forecastOwner: AuthenticatedPrincipal; let agentRole: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId; const S = () => h.fx.sourceId;
let sourceKey = ''; let PK = ''; let replayVersion = 0;
let firstStream = ''; let liveStream = '';

const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  // eslint-disable-next-line no-console
  console.log(`B23 EVIDENCE stream ${caseName}: ${JSON.stringify(e)}`);

const req = (p: AuthenticatedPrincipal, action: string, id: string | null = null, purpose = 'observation') => h.req(p, action, 'AQS', id, purpose);
async function refused(p: Promise<unknown>): Promise<{ status: number; body: Row }> {
  try { await p; } catch (e) {
    const x = e instanceof HttpException ? e : asObservationRefusal(e, 'corr');
    if (x === null) throw e;
    return { status: x.getStatus(), body: x.getResponse() as Row };
  }
  throw new Error('expected a refusal; the call succeeded');
}
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await (q as ReturnType<typeof sql<Row>>).execute(h.su)).rows as Row[];
const streamEvents = async (streamId: string): Promise<Row[]> =>
  rows(sql`select event, seq, run_id::text run_id, details from observation.acquisition_stream_events where stream_id = ${streamId}::uuid order by ledger_seq`);
const ranges = async (streamId: string): Promise<Row[]> =>
  rows(sql`select range_from, range_to, reason_class, detail, declared_seq, resolved_by_seq from observation.acquisition_incomplete_ranges where stream_id = ${streamId}::uuid order by declared_at`);
const runEvents = async (runId: string, event: string): Promise<Row[]> =>
  (await rows(sql`select details from observation.collection_run_events where run_id = ${runId}::uuid and event = ${event} order by occurred_at`)).map((r) => r['details'] as Row);
const checkpointRows = async (): Promise<Row[]> => rows(sql`select run_id::text run_id from observation.connector_checkpoints where source_id = ${S()}::uuid`);
/** The evidence a STREAM admitted for this source: objects held (latest version) against distinct item keys — a second copy shows as held > distinct. */
async function streamEvidence(marker: string): Promise<{ held: number; distinct: number }> {
  const r = (await rows(sql`
    with held as (
      select distinct on (e.object_id) e.object_id, o.payload ->> 'item_key' as item_key
        from objects.canonical_objects e
        join objects.canonical_objects o on o.object_type = 'OBS' and o.object_id::text = e.payload ->> 'obs_object_id' and o.object_version = 1
       where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${S()}@%`} and (o.payload ->> 'item_key') like ${`%${marker}%`}
       order by e.object_id, e.object_version desc)
    select count(*)::int held, count(distinct item_key)::int "distinct" from held`))[0] as { held: number; distinct: number };
  return r;
}

/** The replay contract version that reads the synthetic stream set, through the real register route and the two operators. */
async function newReplayStreamVersion(): Promise<number> {
  const version = h.version + 1;
  const c = fixtureContract(sourceKey) as Row;
  const so = c['security_and_operations'] as Row;
  const contract = {
    ...c, data_origin: 'synthetic',
    identity: { ...(c['identity'] as Row), endpoints: ['https://corridor-stream.synthetic.example/red-sea/chokepoint4'] },
    security_and_operations: {
      ...so, replay_set: 'red-sea-corridor-stream',
      expected_schema: { ...(so['expected_schema'] as Row), required_fields: ['features.[].attributes.date', 'features.[].attributes.n_total'] },
    },
    lifecycle: { contract_version: version, effective_from: '2026-09-05T00:00:00Z', supersedes_version: h.version },
  };
  await ctl.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', S(), 'observation'), T(), D(),
    { payload: { contract, sourceId: S() } });
  await h.pipeline.write(
    h.env(h.manager, 'observation.source.approve', 'SRC', S()), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.approve', objectType: 'SRC', objectId: S() },
    ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: S(), contractVersion: version, tenantId: T(), domainId: D(),
        decision: 'approve', reason: 'B23 stream suite', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: S(), targetVersion: String(version), outboxEvent: null };
    });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  return version;
}

/* Fixture scaffolding through the run's own ports (the serialisation suite's idiom): a run that holds the source. */
const runEvent = (tx: unknown, run: string, event: string, details: Row = {}, correlationId: string = uuidv7()) => sql`select observation.append_run_event(
  ${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${run}::uuid, ${S()}::uuid, ${h.version},
  ${h.manager.principalId}::uuid, 'fixture', 'sha256:fixture', 'rest', '1', 'live', ${event}, ${JSON.stringify(details)}::jsonb, ${correlationId}::uuid)`.execute(tx as never);
const session = () => ({ sessionId: h.manager.sessionId as string, contextKey: h.manager.contextKey as string });
async function openRun(withStream?: { partitionKey: string; from: string; to: string; cursor: Row }): Promise<{ run: string; stream: Row | null }> {
  const run = uuidv7(); const correlationId = uuidv7(); let stream: Row | null = null;
  await inCommitContext(h.app.get<Db>(COMMIT_DB), session(), { tenantId: T(), domainId: D() }, 'observation.run.start', uuidv7(), async (tx) => {
    const a = (await sql<{ answer: Row }>`select observation.acquire_source_run_lease(
      ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${h.version}, ${run}::uuid, 'operator', 900, ${correlationId}::uuid) as answer`.execute(tx as never)).rows[0]?.answer as Row;
    if (a['granted'] !== true) throw new Error(`fixture run not granted the source: ${JSON.stringify(a)}`);
    if (withStream !== undefined) {
      stream = (await sql<{ r: Row }>`select observation.open_acquisition_stream(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${h.version}, ${run}::uuid,
        ${withStream.partitionKey}, ${withStream.from}, ${withStream.to}, ${JSON.stringify(withStream.cursor)}::jsonb, 2, null, ${correlationId}::uuid) as r`.execute(tx as never)).rows[0]?.r as Row;
    }
    await runEvent(tx, run, 'run.started', { fixture: true }, correlationId);
  }, correlationId);
  return { run, stream };
}
const endRun = (run: string): Promise<unknown> => {
  const correlationId = uuidv7();
  return inCommitContext(h.app.get<Db>(COMMIT_DB), session(), { tenantId: T(), domainId: D() }, 'observation.run.cancel', uuidv7(),
    async (tx) => runEvent(tx, run, 'run.cancelled', { reason: 'fixture run ended' }, correlationId), correlationId);
};
const inCheckpoint = <X>(fn: (tx: unknown) => Promise<X>): Promise<X> =>
  inCommitContext(h.app.get<Db>(COMMIT_DB), session(), { tenantId: T(), domainId: D() }, 'observation.run.checkpoint', uuidv7(), fn as never) as Promise<X>;

type StreamAnswer = { stream: Row; run: Row & { runId: string; state: string; admitted: number; noop: number; quarantined: number; segments: number; redelivered: number; backpressureSignals: number; incompleteRanges: number; reason?: string } };
const open = (payload: Row, p: AuthenticatedPrincipal = h.manager, purpose = 'observation') =>
  ctl.openStream(req(p, 'observation.stream.open', null, purpose), T(), D(), S(), { payload } as never) as Promise<StreamAnswer>;
const resume = (streamId: string, payload: Row = {}, p: AuthenticatedPrincipal = h.manager) =>
  ctl.resumeStream(req(p, 'observation.stream.resume', streamId), T(), D(), streamId, { payload } as never) as Promise<StreamAnswer>;
const interrupt = (streamId: string, reason: string, p: AuthenticatedPrincipal = h.manager) =>
  ctl.interruptStream(req(p, 'observation.stream.interrupt', streamId), T(), D(), streamId, { payload: { reason } }) as Promise<{ stream: Row }>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: C } = await import('../../src/observation/observation.controller.js');
  ctl = h.app.get(C);
  orchestrator = h.app.get(CollectionOrchestrator);
  forecastOwner = await h.principalWith(['forecast_owner'], 'b23fo');
  agentRole = await h.principalWith(['collection_agent'], 'b23ag');
  sourceKey = (await rows(sql`select source_key from observation.source_contracts_current where source_id = ${S()}::uuid limit 1`))[0]?.['source_key'] as string;
  PK = `${sourceKey}:chokepoint4`;
  replayVersion = await newReplayStreamVersion();
}, 180_000);

afterAll(async () => {
  fault.disarm();
  orchestrator?.useEgressForTests(null);
  await h?.close();
});

describe('B23 · L1-I02 Acquire — the stream form', () => {
  it('S1 · open; a failure mid-segment; the resume redelivers it — the admitted items no-op, the range resolves, credit 1 backpressures, the pull limit pauses', async () => {
    expect(await checkpointRows(), 'the fixture source starts with no connector checkpoint').toEqual([]);
    // The third admission commit crashes (f25, after the commit): the parent and the first row of page 1 are admitted, the rest is not.
    fault.armNth('f25.after_admission_commit', 3, 'test');
    const first = await open({ contractVersion: replayVersion, partitionKey: PK, credit: 1, maxSegments: 2 });
    fault.disarm();
    firstStream = String(first.stream['stream_id']);
    expect(first.run.state).toBe('failed');
    expect(first.run.reason).toMatch(/injected fault at f25/);
    // The run counts what it LEARNED committed (two); the third committed and the run crashed before it heard — the ledger says three.
    expect(first.run.admitted).toBe(2);
    expect(await streamEvidence('@stream:chokepoint4')).toEqual({ held: 3, distinct: 3 });
    expect(first.stream).toMatchObject({ state: 'interrupted', partition_key: PK, next_seq: 0, current_run_id: null, range_from: '2024-01-01', range_to: '2024-01-31' });
    expect(await ranges(firstStream)).toEqual([
      expect.objectContaining({ range_from: '2024-01-01', range_to: '2024-01-06', reason_class: 'interrupted', declared_seq: 0, resolved_by_seq: null }),
    ]);
    const started = await runEvents(first.run.runId, 'run.started');
    expect(started[0]?.['form']).toBe('stream');
    expect((started[0]?.['stream'] as Row)['stream_id']).toBe(firstStream);
    expect(await runEvents(first.run.runId, 'run.failed')).toHaveLength(1);
    // An interrupted stream is not interrupted again.
    const again = await refused(interrupt(firstStream, 'twice'));
    expect(again.status).toBe(409);

    // RESUME from the cursor (the start of page 1), credit 1, at most two segments.
    const second = await resume(firstStream, { credit: 1, maxSegments: 2 });
    expect(second.run.state).toBe('finished');
    expect(second.stream).toMatchObject({ stream_id: firstStream, state: 'open', next_seq: 2, credit: 1, current_run_id: null });
    expect(second.run).toMatchObject({ noop: 3, admitted: 9, segments: 2, redelivered: 0, backpressureSignals: 1 });
    expect(await ranges(firstStream)).toEqual([expect.objectContaining({ reason_class: 'interrupted', resolved_by_seq: 0 })]);
    const ev = (await streamEvents(firstStream)).map((e) => e['event']);
    expect(ev).toEqual(['opened', 'backpressured', 'range.incomplete', 'interrupted', 'resumed', 'backpressured', 'segment.appended', 'backpressure.relieved', 'range.resolved', 'segment.appended', 'paused']);
    const segs = await rows(sql`select seq, partition_key, range_from, range_to, admitted, noop, item_count, jsonb_array_length(evidence_ids)::int evidence from observation.acquisition_segments where stream_id = ${firstStream}::uuid order by seq`);
    expect(segs).toEqual([
      { seq: 0, partition_key: PK, range_from: '2024-01-01', range_to: '2024-01-06', admitted: 3, noop: 3, item_count: 6, evidence: 6 },
      { seq: 1, partition_key: PK, range_from: '2024-01-06', range_to: '2024-01-11', admitted: 6, noop: 0, item_count: 6, evidence: 6 },
    ]);
    // Nothing admitted twice; the command form's checkpoint untouched; no run.checkpointed on a stream run.
    expect(await streamEvidence('@stream:chokepoint4')).toEqual({ held: 12, distinct: 12 });
    expect(await checkpointRows()).toEqual([]);
    expect(await runEvents(first.run.runId, 'run.checkpointed')).toEqual([]);
    expect(await runEvents(second.run.runId, 'run.checkpointed')).toEqual([]);
    expect((await runEvents(second.run.runId, 'run.finished'))[0]).toMatchObject({ paused: true, stream_state: 'open' });
    sixEvidence('S1', {
      fault_trace: { armed: 'f25.after_admission_commit (3rd)', run: first.run.runId, state: first.run.state, admitted_before_cut: 3 },
      watermark: { stream: firstStream, partition_key: PK, cursor: second.stream['cursor'], next_seq: 2 },
      consumer_behaviour: { credit: 1, backpressure_signals: 1, segments: 2, events: ev },
      operator_action: { open: { credit: 1, maxSegments: 2 }, resume: { credit: 1, maxSegments: 2 }, second_interrupt: again.status },
      recovery: { redelivered_segment: 0, noop: 3, admitted: 9, range_resolved_by_seq: 0 },
      reconciliation: { evidence: await streamEvidence('@stream:chokepoint4'), connector_checkpoints: 0 },
    });
  }, 180_000);

  it('S2 · an operator interrupts the idle stream; the PDP; the resume runs to the end — the publisher gap is an explicit incomplete range, closed_incomplete', async () => {
    const byFo = await refused(interrupt(firstStream, 'not mine', forecastOwner));
    expect(byFo.status, 'a forecast owner holds no stream act').toBe(403);
    const byAgent = await refused(interrupt(firstStream, 'agent', agentRole));
    expect(byAgent.status, 'the collection agent may not interrupt through the operator route').toBe(403);
    const cut = await interrupt(firstStream, 'the corridor desk pauses the feed for the handover');
    expect(cut.stream).toMatchObject({ state: 'interrupted', changed: true, requested: false });

    const rest = await resume(firstStream, { credit: 2 });
    expect(rest.run.state).toBe('finished');
    expect(rest.run).toMatchObject({ admitted: 18, noop: 0, segments: 4, incompleteRanges: 1, backpressureSignals: 2 });
    expect(rest.stream).toMatchObject({ state: 'closed_incomplete', next_seq: 6, reached_end: true, credit: 2, high_water: '2024-01-31' });
    const unresolved = (await ranges(firstStream)).filter((r) => r['resolved_by_seq'] === null);
    expect(unresolved).toEqual([expect.objectContaining({ range_from: '2024-01-11', range_to: '2024-01-16', reason_class: 'publisher_gap', declared_seq: 2 })]);
    expect(String(unresolved[0]?.['detail'])).toMatch(/DEF-S1/);
    const closed = (await streamEvents(firstStream)).filter((e) => e['event'] === 'closed');
    expect((closed[0]?.['details'] as Row)['state']).toBe('closed_incomplete');
    expect(await streamEvidence('@stream:chokepoint4')).toEqual({ held: 30, distinct: 30 });
    const notAgain = await refused(resume(firstStream));
    expect(notAgain.status, 'a closed stream is not resumed').toBe(409);
    expect(String(notAgain.body['message'])).toMatch(/not_resumable/);

    const got = await ctl.getStream(h.req(h.manager, 'observation.read.streams', 'AQS', firstStream, 'observation'), T(), D(), firstStream) as unknown as { segments: Row[]; incompleteRanges: Row[]; stream: Row };
    expect(got.segments.map((s) => [s['seq'], s['incomplete'], s['item_count']])).toEqual([[0, false, 6], [1, false, 6], [2, true, 0], [3, false, 6], [4, false, 6], [5, false, 6]]);
    const listed = await ctl.listStreams(h.req(h.manager, 'observation.read.streams', 'AQS', null, 'observation'), T(), D(), { payload: { sourceId: S() } });
    expect(listed.streams.map((s) => s['stream_id'])).toContain(firstStream);
    sixEvidence('S2', {
      fault_trace: { planted: 'DEF-S1 publisher gap 2024-01-11..2024-01-16', refused: { forecast_owner: byFo.status, collection_agent: byAgent.status, resume_closed: notAgain.status } },
      watermark: { stream: firstStream, next_seq: 6, high_water: rest.stream['high_water'] },
      consumer_behaviour: { credit: 2, backpressure_signals: 2, segments: 4 },
      operator_action: { interrupt: 'idle → interrupted at once', resume: { credit: 2 } },
      recovery: { state: rest.stream['state'], unresolved: unresolved.length },
      reconciliation: { evidence: { held: 30, distinct: 30 } },
    });
  }, 180_000);

  it('S3 · at-least-once acknowledgement at the port: the same segment again is a recorded redelivery; another digest 409; a stream the run does not drive 409', async () => {
    const seg0 = (await rows(sql`select * from observation.acquisition_segments where stream_id = ${firstStream}::uuid and seq = 0`))[0] as Row;
    const { run } = await openRun();
    const append = (digest: string, seq = 0) => inCheckpoint((tx) => sql<{ r: Row }>`select observation.append_stream_segment(
      ${firstStream}::uuid, ${T()}::uuid, ${D()}::uuid, ${run}::uuid, ${seq}::int, ${PK}, ${seg0['range_from'] as string}, ${seg0['range_to'] as string},
      ${JSON.stringify(seg0['cursor_before'])}::jsonb, ${JSON.stringify(seg0['cursor_after'])}::jsonb, ${digest}, '[]'::jsonb, 6, 0, 6, 0, false, null, false, ${uuidv7()}::uuid) as r`
      .execute(tx as never).then((x) => x.rows[0]?.r as Row));
    let redelivery: Row; let conflict: { status: number; body: Row }; let foreign: { status: number; body: Row };
    try {
      redelivery = await append(seg0['segment_digest'] as string);
      conflict = await refused(append('0'.repeat(64)));
      foreign = await refused(append('1'.repeat(64), 6));
    } finally { await endRun(run); }
    expect(redelivery).toMatchObject({ redelivered: true, seq: 0, delivery_count: 2, state: 'closed_incomplete' });
    expect((await rows(sql`select delivery_count from observation.acquisition_segments where stream_id = ${firstStream}::uuid and seq = 0`))[0]).toEqual({ delivery_count: 2 });
    expect((await streamEvents(firstStream)).filter((e) => e['event'] === 'segment.redelivered')).toHaveLength(1);
    expect(conflict.status).toBe(409);
    expect(String(conflict.body['message'])).toMatch(/^acquisition stream rejected \(digest_conflict\)/);
    expect(foreign.status).toBe(409);
    expect(String(foreign.body['message'])).toMatch(/\(not_running\)/);
    expect(await streamEvidence('@stream:chokepoint4'), 'a redelivered acknowledgement admits nothing').toEqual({ held: 30, distinct: 30 });
    sixEvidence('S3', {
      fault_trace: { redelivered_seq: 0, conflicting_digest: '0…0' }, watermark: { delivery_count: 2 },
      consumer_behaviour: 'the same (stream, seq, digest) acknowledged twice → segment.redelivered, no-op',
      operator_action: 'none (a port-level redelivery under a run holding the source)',
      recovery: { conflict: conflict.status, foreign: foreign.status }, reconciliation: { evidence: { held: 30, distinct: 30 } },
    });
  }, 120_000);

  it('S4 · a NEW stream on the same stable partition key (a narrower range) completes, every item a recorded no-op', async () => {
    const fresh = await open({ contractVersion: replayVersion, partitionKey: PK, credit: 4, range: { from: '2024-01-16', to: '2024-01-31' } });
    expect(fresh.run.state).toBe('finished');
    expect(fresh.stream['stream_id']).not.toBe(firstStream);
    expect(fresh.stream).toMatchObject({ partition_key: PK, state: 'completed', range_from: '2024-01-16', range_to: '2024-01-31', next_seq: 3 });
    expect(fresh.run).toMatchObject({ admitted: 0, noop: 18, segments: 3, backpressureSignals: 0 });
    expect(await ranges(String(fresh.stream['stream_id']))).toEqual([]);
    expect(await streamEvidence('@stream:chokepoint4')).toEqual({ held: 30, distinct: 30 });
    sixEvidence('S4', {
      fault_trace: null, watermark: { stream: fresh.stream['stream_id'], partition_key: PK, range: ['2024-01-16', '2024-01-31'] },
      consumer_behaviour: { credit: 4, backpressure_signals: 0, segments: 3 }, operator_action: 'open (narrower range)',
      recovery: { state: 'completed', noop: 18 }, reconciliation: { evidence: { held: 30, distinct: 30 } },
    });
  }, 120_000);

  it('S5 · the refusals — 404, 422, 409 with the holder named — and purpose and residency still enforced by the ordinary admission', async () => {
    const absent = await refused(resume(uuidv7()));
    expect(absent.status).toBe(404);
    const foreignKey = await refused(open({ contractVersion: replayVersion, partitionKey: 'another-source:chokepoint4', credit: 1 }));
    expect(foreignKey.status).toBe(422);
    const unknownPartition = await refused(open({ contractVersion: replayVersion, partitionKey: `${sourceKey}:chokepoint9`, credit: 1 }));
    expect(unknownPartition.status).toBe(422);
    expect(String((unknownPartition.body['error'] as Row | undefined)?.['message'] ?? JSON.stringify(unknownPartition.body))).toMatch(/chokepoint9/);
    const zeroCredit = await refused(open({ contractVersion: replayVersion, partitionKey: PK, credit: 0 }));
    expect(zeroCredit.status).toBe(422);
    const byFo = await refused(open({ contractVersion: replayVersion, partitionKey: PK, credit: 1 }, forecastOwner));
    expect(byFo.status).toBe(403);

    // A source already being collected: the stream is refused like any other attempt, with the holder named.
    const { run } = await openRun();
    let inFlight: { status: number; body: Row };
    try { inFlight = await refused(open({ contractVersion: replayVersion, partitionKey: PK, credit: 1 })); } finally { await endRun(run); }
    expect(inFlight.status).toBe(409);
    expect(inFlight.body['refusal_class']).toBe('source_run_in_flight');
    expect((inFlight.body['holder'] as Row)['holder_run_id']).toBe(run);

    // PURPOSE: a purpose outside the contract fails the run at its contract lock — in the run.start transaction, so NO stream exists.
    const before = (await rows(sql`select count(*)::int n from observation.acquisition_streams where source_id = ${S()}::uuid`))[0]?.['n'];
    const wrongPurpose = await open({ contractVersion: replayVersion, partitionKey: PK, credit: 1 }, h.manager, 'marketing');
    expect(wrongPurpose.run.state).toBe('failed');
    expect(wrongPurpose.run.reason).toMatch(/purpose marketing is not among the contract purposes/);
    expect(wrongPurpose.stream).toBeNull();
    expect((await rows(sql`select count(*)::int n from observation.acquisition_streams where source_id = ${S()}::uuid`))[0]?.['n']).toBe(before);

    // RESIDENCY and CUSTODY: every manifest a stream admitted carries the contract's residency and classification, with custody.
    const manifests = await rows(sql`select m.residency, m.classification, count(*)::int n,
        count(*) filter (where exists (select 1 from observation.custody_events c where c.manifest_id = m.manifest_id and c.event = 'custody.admitted'))::int custody
      from observation.blob_manifests m
      where m.source_id = ${S()}::uuid and m.vault = 'evidence' and m.run_id in (select run_id from observation.collection_run_events where source_id = ${S()}::uuid and event = 'run.started' and details ->> 'form' = 'stream')
      group by 1, 2`);
    expect(manifests).toEqual([{ residency: 'EU', classification: 'internal', n: 30, custody: 30 }]);
    sixEvidence('S5', {
      fault_trace: { '404': absent.status, foreign_key: foreignKey.status, unknown_partition: unknownPartition.status, credit_0: zeroCredit.status, forecast_owner: byFo.status, in_flight: inFlight.status },
      watermark: { holder: run }, consumer_behaviour: 'refused before anything is collected; a wrong purpose rolls back the run.start transaction (no stream row)',
      operator_action: 'open / resume as refused callers', recovery: { purpose: wrongPurpose.run.reason },
      reconciliation: { manifests },
    });
  }, 120_000);

  it('S6 · THE COMMAND FORM UNCHANGED: collect now on the same source admits the snapshot, checkpoints, and touches no stream table', async () => {
    const streamRows = async () => (await rows(sql`select (select count(*) from observation.acquisition_stream_events)::int ev, (select count(*) from observation.acquisition_segments)::int sg`))[0];
    const beforeStreams = await streamRows();
    const out = await ctl.collect(h.req(h.manager, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(), S(),
      { payload: { contractVersion: replayVersion } }) as { run: { runId: string; state: string; admitted: number; noop: number } };
    expect(out.run.state).toBe('finished');
    expect(out.run.admitted, 'the snapshot parent and its 25 rows, as a replay retrieval always was').toBe(26);
    expect(await runEvents(out.run.runId, 'run.checkpointed')).toHaveLength(1);
    expect(await checkpointRows()).toEqual([{ run_id: out.run.runId }]);
    expect((await runEvents(out.run.runId, 'run.started'))[0]?.['form']).toBeUndefined();
    expect(await streamRows()).toEqual(beforeStreams);
    sixEvidence('S6', {
      fault_trace: null, watermark: { run: out.run.runId, checkpoint_run: out.run.runId },
      consumer_behaviour: 'command form: acquire() all at once, per-item admission, run.checkpointed, connector checkpoint written',
      operator_action: 'collect now', recovery: null, reconciliation: { stream_tables_unchanged: beforeStreams },
    });
  }, 120_000);

  it('S7 · LIVE: an operator interrupts a RUNNING stream (honoured at the boundary); the resume resolves the in-flight ranges and meets a 404 window; a stream left running is reconciled at the resume', async () => {
    const { version } = await h.newVersion({ from: '2023-01-01', to: '2023-02-20', windowDays: 10 });
    const livePK = `${sourceKey}:backfill`;
    const series = syntheticEgress();
    const checkpointBefore = await checkpointRows();

    // The second page is HELD open until the operator has asked for the interrupt.
    let served = 0; let release: () => void = () => undefined; let reached: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; }); const atGate = new Promise<void>((r) => { reached = r; });
    orchestrator.useEgressForTests(async (a: { url: string }): Promise<EgressResult> => {
      served += 1;
      if (served === 2) { reached(); await gate; }
      return series.egress(a as never);
    });
    const running = open({ contractVersion: version, partitionKey: livePK, credit: 2 });
    let asked: { stream: Row };
    try {
      await atGate;
      asked = await interrupt((await rows(sql`select stream_id::text id from observation.acquisition_streams where partition_key = ${livePK} and state = 'running'`))[0]?.['id'] as string,
        'the operator stops the live walk mid-run');
    } finally { release(); }
    const cut = await running;
    liveStream = String(cut.stream['stream_id']);
    expect(asked.stream).toMatchObject({ state: 'running', requested: true, interrupt_requested: true });
    expect(cut.run.state).toBe('cancelled');
    expect(cut.run.admitted).toBe(0);
    expect(cut.stream).toMatchObject({ state: 'interrupted', next_seq: 0 });
    expect(await ranges(liveStream)).toEqual([
      expect.objectContaining({ range_from: '2023-01-01', range_to: '2023-01-11', reason_class: 'interrupted', declared_seq: 0, resolved_by_seq: null }),
      expect.objectContaining({ range_from: '2023-01-11', range_to: '2023-01-21', reason_class: 'interrupted', declared_seq: 1, resolved_by_seq: null }),
    ]);
    expect((await streamEvents(liveStream)).map((e) => e['event'])).toEqual(['opened', 'interrupt.requested', 'backpressured', 'range.incomplete', 'range.incomplete', 'interrupted']);
    expect(await runEvents(cut.run.runId, 'run.cancelled')).toHaveLength(1);

    // RESUME: the publisher now answers 404 for the third window.
    orchestrator.useEgressForTests(async (a: { url: string }): Promise<EgressResult> => {
      if (new URL(a.url).searchParams.get('startPeriod') === '2023-01-21') {
        return { ...(await series.egress(a as never)), status: 404, body: Buffer.from('{"error":{"message":"no data"}}') };
      }
      return series.egress(a as never);
    });
    const done = await resume(liveStream, { credit: 2 });
    expect(done.run.state).toBe('finished');
    expect(done.run).toMatchObject({ admitted: 4, segments: 5, incompleteRanges: 1 });
    expect(done.stream).toMatchObject({ state: 'closed_incomplete', next_seq: 5, reached_end: true });
    const lr = await ranges(liveStream);
    expect(lr.map((r) => [r['range_from'], r['reason_class'], r['resolved_by_seq']])).toEqual([
      ['2023-01-01', 'interrupted', 0], ['2023-01-11', 'interrupted', 1], ['2023-01-21', 'publisher_gap', null],
    ]);
    expect(String(lr[2]?.['detail'])).toMatch(/answered 404/);
    expect(await streamEvidence('@backfill:')).toEqual({ held: 4, distinct: 4 });
    expect(await checkpointRows(), 'a stream never advances the connector checkpoint').toEqual(checkpointBefore);

    // A stream left RUNNING by a run that ended without saying so is recorded interrupted, then resumed, at the next open.
    const { run: dead, stream: orphan } = await openRun({ partitionKey: livePK, from: '2023-01-01', to: '2023-02-20', cursor: { position: '2023-01-01', through: '2023-01-01' } });
    await endRun(dead);
    const orphanId = String((orphan as Row | null)?.['stream_id']);
    expect((await rows(sql`select state, current_run_id::text r from observation.acquisition_streams where stream_id = ${orphanId}::uuid`))[0]).toEqual({ state: 'running', r: dead });
    const reconciled = await resume(orphanId, { credit: 4 });
    expect(reconciled.run.state).toBe('finished');
    expect(reconciled.run).toMatchObject({ admitted: 0, noop: 4 });
    const oe = await streamEvents(orphanId);
    expect(oe.map((e) => e['event']).slice(0, 3)).toEqual(['opened', 'interrupted', 'resumed']);
    expect((oe[1]?.['details'] as Row)['by']).toBe('reconciled_at_resume');
    expect(reconciled.stream['state']).toBe('closed_incomplete');
    orchestrator.useEgressForTests(null);
    sixEvidence('S7', {
      fault_trace: { held_page: 2, interrupt_requested_while_running: true, http_404_window: '2023-01-21..2023-01-31', orphan_run: dead },
      watermark: { stream: liveStream, next_seq: 5, partition_key: livePK },
      consumer_behaviour: { credit: 2, honoured_at: 'the backpressure boundary', in_flight_declared: 2 },
      operator_action: { interrupt: asked.stream['state'], resume: 'credit 2' },
      recovery: { resolved: [0, 1], unresolved: 'publisher_gap', reconciled_at_resume: orphanId },
      reconciliation: { evidence: { held: 4, distinct: 4 }, connector_checkpoint_unchanged: true },
    });
  }, 180_000);

  it('S8 · the register: L1-I02 bound in 0084, its text naming the command form unchanged and the stream as segment pull under credit', async () => {
    const r = (await rows(sql`select binding_state, bound_in, schema_version, bound_to from objects.interface_register where interface_id = 'L1-I02'`))[0] as Row;
    expect(r).toMatchObject({ binding_state: 'bound', bound_in: '0084', schema_version: 'v1' });
    expect(String(r['bound_to'])).toMatch(/COMMAND form unchanged/);
    expect(String(r['bound_to'])).toMatch(/SEGMENT PULL WITH CREDIT-BASED FLOW CONTROL/);
    expect(String(r['bound_to'])).toMatch(/NOT a WebSocket or SSE transport/);
    sixEvidence('S8', { fault_trace: null, watermark: { bound_in: r['bound_in'] }, consumer_behaviour: null, operator_action: null, recovery: null, reconciliation: { binding_state: r['binding_state'] } });
  });
});
