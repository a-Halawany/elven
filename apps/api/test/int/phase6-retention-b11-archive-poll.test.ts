/**
 * CP-6 batch B11 (migration 0070), the adversarial review's correction of the acquisition lifecycle: an ARCHIVE action moves
 * CURRENT held evidence to the archive tier (the demonstration's scene 1 archives the current eu-sanctions-rss evidence, a
 * live polled source). The lifecycle's availability of held evidence (`availabilityOf`) must read the bytes from the tier
 * the ledger names, not from the immutable EVD payload's vault: archived evidence verifying in the archive root is
 * AVAILABLE — a live HTTP 304 against it is a bound confirmation, a live 200 of identical bytes confirms it and admits no
 * duplicate hot copy, and no run record asserts an integrity failure that did not happen. Adapted from the review's
 * reproduction (the assertions inverted to the corrected behaviour); the `phase6-*` name puts the file in `test:int:all`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { ObservationCapability, tierOf } from '../../src/observation/observation.capabilities.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';
import { Phase4Harness, SERIES_START, BASE, sdmxWindow } from './phase4-helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness; let observation: ObservationController; let retention: RetentionController; let scheduler: SchedulerService; let orchestrator: CollectionOrchestrator; let vault: VaultService;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal;

const pub: { status: number; body: () => string; headers: Record<string, string> } = { status: 200, body: () => JSON.stringify({ dataSets: [{ v: 'b11-archive-poll' }] }), headers: { etag: '"b11-archive-e1"' } };
const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
  const q = new URL(url).searchParams;
  const backfill = q.get('startPeriod') !== null;
  const status = backfill ? 200 : pub.status;
  const body = backfill ? sdmxWindow(q.get('startPeriod') as string, '2021-01-08') : (status === 304 ? '' : pub.body());
  return { status, headers: { 'content-type': 'application/json', ...(backfill ? {} : pub.headers) }, body: Buffer.from(body, 'utf8'),
    finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null };
};
const connector = () => new RestConnector({ egress });
const POLL_KEY = (() => { const u = new URL(BASE); return `${u.hostname}${u.pathname}?${createHash('sha256').update(u.search).digest('hex').slice(0, 16)}`; })();

type Evd = { object_id: string; object_version: number; content_digest: string; manifest_id: string; locator: string; payload_vault: string; lifecycle_state: string; recorded_at: Date };
const evidenceFor = async (key: string): Promise<Evd[]> =>
  (await sql<Evd>`
    with obs as (select o.object_id, o.payload ->> 'item_key' as item_key from objects.canonical_objects o
                  where o.object_type = 'OBS' and o.payload ->> 'source_id' = ${h.fx.sourceId} and o.payload ->> 'item_key' not like '%@backfill:%'
                    and (o.payload ->> 'item_key' = ${key} or regexp_replace(o.payload ->> 'item_key', '@[^#]*', '') = ${key}))
    select distinct on (e.object_id) e.object_id::text as object_id, e.object_version::int as object_version, e.payload ->> 'content_digest' as content_digest,
           e.payload ->> 'manifest_id' as manifest_id, e.payload ->> 'vault' as payload_vault,
           (select m.locator from observation.blob_manifests m where m.manifest_id = (e.payload ->> 'manifest_id')::uuid) as locator, e.lifecycle_state, e.recorded_at
      from objects.canonical_objects e join obs on e.payload ->> 'obs_object_id' = obs.object_id::text
     where e.object_type = 'EVD' order by e.object_id, e.object_version desc`.execute(h.su)).rows.sort((a, b) => b.recorded_at.getTime() - a.recorded_at.getTime());
const runEvents = async (runId: string) => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from observation.collection_run_events where run_id = ${runId}::uuid order by occurred_at`.execute(h.su)).rows;
const evidenceCount = async (): Promise<number> => Number((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n);
const ledgerTier = async (manifestId: string): Promise<string> => (await sql<{ t: string }>`select observation.manifest_tier(${manifestId}::uuid) as t`.execute(h.su)).rows[0]?.t ?? '?';

async function nextVersion(): Promise<number> {
  const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(h.su)).rows[0]?.source_key ?? '';
  const version = h.version + 1;
  const contract = h.contract(sourceKey, { from: SERIES_START, to: '2021-01-07', windowDays: 366, supersedes: h.version, version }) as Record<string, unknown>;
  await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { contract, sourceId: h.fx.sourceId } });
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', h.fx.sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.approve', objectType: 'SRC', objectId: h.fx.sourceId }, ObservationCapability.registry,
    async (cap) => { await cap.approveSource({ sourceId: h.fx.sourceId, contractVersion: version, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'B11 archive-poll fixture', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'SRC', targetId: h.fx.sourceId, targetVersion: String(version), outboxEvent: null }; });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  return version;
}
const leaseHeld = async (): Promise<boolean> => (await sql<{ n: string }>`select count(*)::text n from observation.source_run_leases where source_id = ${h.fx.sourceId}::uuid`.execute(h.su)).rows[0]?.n !== '0';
const warmUp = async (): Promise<void> => {
  const until = Date.now() + 90_000;
  for (;;) {
    while (await leaseHeld()) { if (Date.now() > until) throw new Error('warm-up: in flight for 90s'); await new Promise((r) => setTimeout(r, 200)); }
    const r = await h.runOnce(connector());
    if (r.state === 'finished') return;
    if (r.state === 'refused' && /in flight/.test(r.reason ?? '') && Date.now() < until) continue;
    throw new Error(`warm-up ${r.state}: ${r.reason ?? ''}`);
  }
};

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const open = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Record<string, unknown> }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved; nothing else' } });
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Record<string, unknown> }>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  observation = h.app.get(O); retention = h.app.get(R); scheduler = h.app.get(SchedulerService); orchestrator = h.app.get(CollectionOrchestrator); vault = h.app.get(VaultService);
  orchestrator.useEgressForTests(egress);
  steward = await h.humanWithSession(['retention_steward'], 'b11-poll-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b11-poll-retention-authority', 'TENANT');
}, 300_000);
afterAll(async () => {
  try { await scheduler?.obliterateForTests(h.fx.tenantId, h.fx.domainId); } catch { /* may be closed */ }
  await h?.close();
});

describe('B11 · archived CURRENT evidence and the next live polls (the acquisition lifecycle reads the tier the ledger names)', () => {
  let held: Evd;
  it('positive control: a live version admits the forward item (ETag retained); a repeat 200 of identical bytes is confirmed; a 304 is a bound confirmation', async () => {
    await nextVersion();
    await warmUp();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    held = (await evidenceFor(POLL_KEY))[0] as Evd;
    expect(held).toBeDefined();
    expect(held.payload_vault).toBe('evidence');
    const before = await evidenceCount();
    const r2 = await h.runOnce(connector());
    expect(r2.state, r2.reason).toBe('finished');
    const confirmed = (await runEvents(r2.runId)).filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    expect(confirmed.length).toBe(1);
    expect(confirmed[0]?.details['availability']).toBe('verified');
    expect(await evidenceCount()).toBe(before);
    pub.status = 304;
    const r3 = await h.runOnce(connector());
    pub.status = 200;
    expect(r3.state, r3.reason).toBe('finished');
    const c304 = (await runEvents(r3.runId)).filter((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(c304.length).toBe(1);
    expect(c304[0]?.details['bound']).toBe(true);
    expect(c304[0]?.details['availability']).toBe('verified');
    expect(await evidenceCount()).toBe(before);
  }, 180_000);

  it('ARCHIVE the held manifest: ledger tier archive, hot copy absent, archive copy verifies under the digest; the EVD payload still says vault=evidence (immutable) — the tier is the ledger\'s', async () => {
    const o = await open(steward, { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [held.manifest_id] } });
    const rs = await resolve(steward, o.action.actionId);
    expect(rs.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await approve(authority, o.action.actionId, String(rs.scope['scope_digest']));
    const ex = await execute(steward, o.action.actionId);
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0 });
    expect(await ledgerTier(held.manifest_id)).toBe('archive');
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, held.locator)).toBe(false);
    expect(await vault.exists('archive', { tenantId: T(), domainId: D() }, held.locator)).toBe(true);
    await expect(vault.read('archive', { tenantId: T(), domainId: D() }, held.locator, held.content_digest)).resolves.toBeDefined();
    const again = (await evidenceFor(POLL_KEY))[0] as Evd;
    expect(again.object_id).toBe(held.object_id);
    expect(again.payload_vault).toBe('evidence');
    expect(again.lifecycle_state).toBe(held.lifecycle_state);
    // the admission-time vault no longer holds the bytes: a reader of the payload's vault alone would read 'missing' — the lifecycle reads the tier instead (the two cases below)
    await expect(vault.read('evidence', { tenantId: T(), domainId: D() }, held.locator, held.content_digest)).rejects.toThrow(/not retrievable/);
  }, 180_000);

  it('the CORRECTION (304 path): a live 304 against the archived, intact held evidence is a BOUND confirmation — the read goes to the tier the ledger names (availability verified), nothing is admitted', async () => {
    const before = await evidenceCount();
    pub.status = 304;
    const r = await h.runOnce(connector());
    pub.status = 200;
    expect(r.state, r.reason).toBe('finished');
    const e304 = (await runEvents(r.runId)).filter((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(e304.length).toBe(1);
    expect(e304[0]?.details).toMatchObject({ bound: true, unchanged: true, availability: 'verified', evd_object_id: held.object_id });
    expect(await evidenceCount()).toBe(before);
    expect(await ledgerTier(held.manifest_id)).toBe('archive');
  }, 180_000);

  it('the CORRECTION (200 path): a live 200 of identical bytes CONFIRMS the archived held evidence (item.noop unchanged, availability verified) — no duplicate hot EVD, no held_unavailable, the bytes stay cold; a later tick confirms the same object', async () => {
    const before = await evidenceCount();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const confirmed = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    const admitted = ev.find((e) => e.event === 'item.admitted' && (e.details['item_key'] as string).startsWith(`${POLL_KEY}@`));
    expect(admitted).toBeUndefined();
    expect(confirmed.length).toBe(1);
    expect(confirmed[0]?.details).toMatchObject({ evd_object_id: held.object_id, evd_version: held.object_version, digest: held.content_digest, availability: 'verified' });
    expect(ev.some((e) => e.details['held_unavailable'] !== undefined && e.details['held_unavailable'] !== null)).toBe(false);
    expect(await evidenceCount()).toBe(before);
    const latest = (await evidenceFor(POLL_KEY))[0] as Evd;
    expect(latest.object_id).toBe(held.object_id);
    expect(await ledgerTier(held.manifest_id)).toBe('archive');
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, held.locator)).toBe(false);
    expect(await vault.exists('archive', { tenantId: T(), domainId: D() }, held.locator)).toBe(true);
    const r2 = await h.runOnce(connector());
    expect(r2.state, r2.reason).toBe('finished');
    const c2 = (await runEvents(r2.runId)).filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    expect(c2.length).toBe(1);
    expect(c2[0]?.details['evd_object_id']).toBe(held.object_id);
    expect(await evidenceCount()).toBe(before);
  }, 180_000);
});
