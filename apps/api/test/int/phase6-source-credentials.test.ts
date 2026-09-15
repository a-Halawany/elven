/**
 * CP-6 B11 — the governed credential path (SOURCE_INTEGRATION_STATUS §6 item 3; migration 0070 §1; AU-DP source
 * activation): a source contract names a credential by REFERENCE (the deployment's variable `EYE_SRC_<NAME>`) and the
 * request header it travels in; the run resolves the value from the deployment at egress time, carries it on the
 * request, and never records it — not on the run, not in the audit, not in the evidence, not in the readiness register.
 *
 *   1. UNBOUND: a live contract naming `EYE_SRC_FIXTURE_KEY` while the deployment binds nothing under it — the readiness
 *      register reads blocked-credential; a run opens and is CANCELLED before any request, the reference (never a value)
 *      on the cancellation; the egress double sees no request.
 *   2. BOUND: the deployment binds the reference — the readiness register reads live-unscheduled; the run carries the
 *      value in the contract's header on every request (the egress double asserts it), admits the fixture's items, and
 *      the value is nowhere in observation.collection_run_events, the audit log, the evidence rows or the readiness register;
 *      the reference is on the contract and in the register's own words.
 *   3. THE CONTRACT: a reference outside the deployment's namespace, a pasted secret, or a header without a reference
 *      is refused at registration; the header name is a header name.
 * Every case runs on the real database through the governed controller and the real lifecycle.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

let h: Phase4Harness;
let observation: ObservationController;
const REF = 'EYE_SRC_FIXTURE_KEY';
const HEADER = 'X-Fixture-Subscription-Key';
const SERIES_START = '2020-01-01'; const SERIES_END = '2020-03-01';
type Row = { source_id: string; contract_version: number; acquisition_mode: string; readiness: { verdict: string; reason: string; credential: string } };
const readiness = async (): Promise<Row[]> => {
  const r = await observation.sourcesReadiness(h.req(h.manager, 'observation.read.sources', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { limit: 100 } }) as { sources: Row[] };
  return r.sources;
};
/** An egress double that records the credentials it was handed per request, on top of the synthetic series. */
function recordingEgress() {
  const base = syntheticEgress();
  const seen: Array<{ url: string; headers: Record<string, string>; credentials: Record<string, unknown> | undefined }> = [];
  const egress = async (a: { url: string; headers: Record<string, string>; credentials?: { headers?: Record<string, string> }; policy: unknown }) => {
    seen.push({ url: a.url, headers: a.headers, credentials: a.credentials });
    return base.egress(a as never);
  };
  return { egress, seen };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
  delete process.env[REF];
}, 300_000);

afterAll(async () => { delete process.env[REF]; await h?.close(); });

describe('B11 · the governed credential path', () => {
  let version = 0; let runIdUnbound = '';
  it('UNBOUND: the register reads blocked-credential; a run is cancelled before any request, with the reference and never a value', async () => {
    const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366, credentialRef: REF, credentialHeader: HEADER });
    version = v.version;
    const row = (await readiness()).find((x) => x.source_id === h.fx.sourceId && x.contract_version === version)!;
    expect(row.acquisition_mode).toBe('live');
    expect(row.readiness.verdict).toBe('blocked-credential');
    expect(row.readiness.credential).toBe(`reference ${REF} (not bound in this deployment)`);
    expect(row.readiness.reason).toMatch(/binds no source credential under that name/);
    const schema = (await sql<{ schema_ref: string }>`select schema_ref from objects.canonical_objects where object_id = ${h.fx.sourceId}::uuid and object_version = ${version}`.execute(h.su)).rows[0]!;
    expect(schema.schema_ref).toBe('SRC@v3');
    const { egress, seen } = recordingEgress();
    const r = await h.runOnce(new RestConnector({ egress }), version);
    expect(r.state).toBe('cancelled');
    expect(r.reason).toBe(`credential unresolved: the deployment binds no source credential named ${REF}`);
    expect(seen).toHaveLength(0);
    runIdUnbound = r.runId;
    const events = (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from observation.collection_run_events where run_id = ${r.runId}::uuid order by occurred_at`.execute(h.su)).rows;
    expect(events.map((e) => e.event)).toEqual(['run.started', 'run.cancelled']);
    expect(events[1]!.details).toMatchObject({ credential_ref: REF, credential_header: HEADER });
  }, 120_000);

  it('BOUND: the run carries the value in the contract\'s header on every request, admits the items, and the value is recorded nowhere', async () => {
    const VALUE = 'fixture-secret-value-7b3a9c-DO-NOT-RECORD';
    process.env[REF] = VALUE;
    const row = (await readiness()).find((x) => x.source_id === h.fx.sourceId && x.contract_version === version)!;
    expect(row.readiness.verdict).toBe('live-unscheduled');
    expect(row.readiness.credential).toBe(`reference ${REF} (bound in this deployment; the run carries it)`);
    expect(JSON.stringify(await readiness())).not.toContain(VALUE);
    const { egress, seen } = recordingEgress();
    const r = await h.runOnce(new RestConnector({ egress }), version);
    expect(r.state, r.reason).toBe('finished');
    expect(r.admitted).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.credentials).toEqual({ headers: { [HEADER]: VALUE } }); // apart from the request headers, so the client drops it on a redirect off the origin
      expect(s.headers[HEADER]).toBeUndefined();
      expect(s.url).not.toContain(VALUE);
    }
    // the value is nowhere on the record; the reference is
    const runEvents = (await sql<{ details: Record<string, unknown> }>`select details from observation.collection_run_events where run_id = ${r.runId}::uuid`.execute(h.su)).rows;
    expect(JSON.stringify(runEvents)).not.toContain(VALUE);
    const audit = (await sql<{ n: number }>`select count(*)::int n from audit.audit_events where event_jcs::text like ${'%' + VALUE + '%'}`.execute(h.su)).rows[0]!.n;
    expect(audit).toBe(0);
    const evidence = (await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where payload::text like ${'%' + VALUE + '%'}`.execute(h.su)).rows[0]!.n;
    expect(evidence).toBe(0);
    const manifests = (await sql<{ n: number }>`select count(*)::int n from observation.blob_manifests where manifest_id::text like ${'%' + VALUE + '%'}`.execute(h.su)).rows[0]!.n;
    expect(manifests).toBe(0);
    const contract = (await sql<{ c: Record<string, unknown> }>`select contract c from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid and contract_version = ${version}`.execute(h.su)).rows[0]!.c;
    expect(JSON.stringify(contract)).toContain(REF); expect(JSON.stringify(contract)).not.toContain(VALUE);
    // the unbound run's record is unchanged by the later binding
    expect((await sql<{ event: string }>`select event from observation.collection_run_events where run_id = ${runIdUnbound}::uuid order by occurred_at`.execute(h.su)).rows.map((e) => e.event)).toEqual(['run.started', 'run.cancelled']);
    delete process.env[REF];
  }, 120_000);

  it('THE CONTRACT: a reference outside EYE_SRC_<NAME>, a pasted secret, and a header without a reference are refused at registration', async () => {
    const bad = async (over: { credentialRef?: string; credentialHeader?: string }, pattern: RegExp) => {
      await expect(h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366, ...over })).rejects.toThrow(pattern);
    };
    await bad({ credentialRef: 'vault/sources/fixture/api-key' }, /names a deployment variable EYE_SRC_<NAME>/);
    await bad({ credentialRef: 'EYE_SRC_OK', credentialHeader: 'not a header name!' }, /credential_header is a header name/);
    await bad({ credentialHeader: 'X-Key' }, /credential_header is named only with a credential_ref/);
    // a pasted secret: built at run time (no literal in the source — the secret scanners on the gate and the host rightly flag one), 52 characters of 36 distinct letters and digits
    const pasted = Array.from({ length: 26 }, (_, k) => String.fromCharCode(65 + k) + String(k % 10)).join('');
    await bad({ credentialRef: pasted }, /looks like a secret value|names a deployment variable/);
  }, 60_000);
});
