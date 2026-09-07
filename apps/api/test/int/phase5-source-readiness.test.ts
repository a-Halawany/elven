/**
 * The source READINESS register, through the real database and controller.
 *
 * Every registered source answers what it is — live, replay, operator upload — and what
 * stands between it and live collection, from stored records alone: a replay contract
 * reads `replay`; a live contract that nothing has scheduled reads `live-unscheduled`
 * (the harness activates through the registry port, not the orchestrator, so no schedule
 * exists — and the register says exactly that rather than "live"); an upload source
 * reads `operator-upload`; a contract whose reuse rights are pending reads
 * `blocked-rights`. The evidence count and the last governed run are the stored ones.
 * Nothing here activates anything the harness did not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { fixtureContract } from './phase1-helpers.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

let h: Phase4Harness;
let observation: ObservationController;

type Row = { source_id: string; source_key: string; contract_version: number; acquisition_mode: string; connector_kind: string; rights_state: string; lifecycle_state: string;
  readiness: { verdict: string; reason: string; credential: string; scheduled: boolean; last_run: { state: string; mode: string; admitted: number } | null; evidence_objects: number; health: { state: string } | null } };

const readiness = async (): Promise<Row[]> => {
  const r = await observation.sourcesReadiness(h.req(h.manager, 'observation.read.sources', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { limit: 100 } }) as { sources: Row[] };
  return r.sources;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('the source readiness register', () => {
  it('a replay contract with confirmed rights reads REPLAY, with its evidence and last governed run', async () => {
    const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
    expect(r.state, r.reason).toBe('finished');
    const rows = await readiness();
    const fixture = rows.find((x) => x.source_id === h.fx.sourceId && x.contract_version === 1);
    expect(fixture?.acquisition_mode).toBe('replay');
    expect(fixture?.readiness.verdict).toBe('replay');
    expect(fixture?.readiness.reason).toMatch(/rights confirmed/);
    expect(fixture?.readiness.credential).toBe('none required');
    expect(fixture?.readiness.last_run?.state).toBe('finished');
    expect(fixture?.readiness.last_run?.mode).toBe('replay');
    expect(fixture?.readiness.evidence_objects).toBeGreaterThan(0);
    const stored = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n;
    expect(fixture?.readiness.evidence_objects).toBe(Number(stored));
  }, 180_000);

  it('a LIVE contract that nothing has scheduled reads LIVE — UNSCHEDULED, never LIVE; the superseded replay version reads INACTIVE', async () => {
    const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
    const rows = await readiness();
    const live = rows.find((x) => x.source_id === h.fx.sourceId && x.contract_version === v.version);
    expect(live?.acquisition_mode).toBe('live');
    expect(live?.readiness.verdict, 'a live contract with no schedule was reported as collecting').toBe('live-unscheduled');
    expect(live?.readiness.scheduled).toBe(false);
    expect(live?.readiness.reason).toMatch(/no collection is scheduled/);
    const old = rows.find((x) => x.source_id === h.fx.sourceId && x.contract_version === 1);
    expect(old?.readiness.verdict).toBe('inactive');
    expect(old?.readiness.reason).toMatch(/superseded/);
    // and after a governed run under the live contract the run shows on it
    const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v.version);
    expect(r.state, r.reason).toBe('finished');
    const again = (await readiness()).find((x) => x.source_id === h.fx.sourceId && x.contract_version === v.version);
    expect(again?.readiness.last_run?.mode).toBe('live');
  }, 300_000);

  it('an upload source reads OPERATOR UPLOAD', async () => {
    const sourceId = await h.uploadSource();
    await h.upload([{ filename: 'readiness.csv', text: 'synthetic,record_id,on_hand\ntrue,R-1,1\n', documentTime: '2024-01-11T00:00:00Z' }]);
    const row = (await readiness()).find((x) => x.source_id === sourceId);
    expect(row?.connector_kind).toBe('upload');
    expect(row?.readiness.verdict).toBe('operator-upload');
    expect(row?.readiness.evidence_objects).toBe(1);
    expect(row?.readiness.last_run?.admitted).toBe(1);
  }, 180_000);

  it('a contract whose reuse rights are PENDING reads BLOCKED — RIGHTS, however public its endpoint', async () => {
    const key = `fixture-pending-${uuidv7().slice(-8)}`;
    const contract = fixtureContract(key) as Record<string, unknown>;
    (contract['authority_and_rights'] as Record<string, unknown>)['rights_state'] = 'pending';
    const reg = await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { contract } }) as { source: { sourceId: string } };
    const sourceId = reg.source.sourceId;
    await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => { await cap.approveSource({ sourceId, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'readiness probe', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null }; });
    await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => { await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, target: 'active', reason: 'readiness probe: active', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null }; });
    const row = (await readiness()).find((x) => x.source_id === sourceId);
    expect(row?.rights_state).toBe('pending');
    expect(row?.readiness.verdict).toBe('blocked-rights');
    expect(row?.readiness.reason).toMatch(/stays in replay until the publisher/);
    expect(row?.readiness.last_run).toBeNull();
    expect(row?.readiness.evidence_objects).toBe(0);
  }, 180_000);
});
