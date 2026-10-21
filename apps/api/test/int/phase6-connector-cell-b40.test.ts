/**
 * CP-6 B40 §CR (0123_b40_x_cr) — THE CONNECTOR CELL, THE PUBLISHED ADAPTER SDK AND THE EGRESS GATEWAY (F-P1-12), on the real database
 * through the real routes, ports, orchestrator and lifecycle:
 *   the ADAPTER PACKAGE REGISTER (DP-14-003, D12) — registered by a collection manager (the digest recomputed, the bytes in the vault),
 *     approved by a SECOND person (never the registrant, an agent or an external collaborator), decided once; an adapter contract
 *     activates only on its approved package;
 *   the CELL (INF-PF-12, IA-47-001, DAT-IN-02; RU-11 / IA-47-003 re-verified) — collectNow → connectorFor('adapter') → one confined child
 *     process per run under the run's lease; its framed items admitted by the UNCHANGED lifecycle; the package re-verified every run;
 *   the EGRESS GATEWAY (IA-28-001, IA-28-003) — every request on a TRANSFER RECEIPT (digests, bytes, destination, purpose, data class,
 *     the credential by reference) written before anything is admitted; the throttle stage asked per request;
 *   the UNREGISTERED HOST (scene B40-5, DEF-B40-05) — blocked, the run failed closed with nothing admitted, the contract SUSPENDED with its
 *     cursor and custody intact, REQUALIFICATION required: reactivation refused until a second person approves 1.0.1 with passing
 *     contract tests (IA-47-005);
 *   the DESTINATION IDENTITY CHANGE (IA-28-005) — a live contract on a LOOPBACK TLS server (B14's one transport substitution, test
 *     runtime only; certificates made at run time with openssl, never committed): first use pins the SPKI, a changed key is blocked BEFORE
 *     the request, the exchange quarantined `destination_identity_changed`, the contract suspended; the credential injected by the gateway;
 *   PACKAGE INTEGRITY and CREDENTIAL ROTATION (IA-47-005) — suspended, requalified, reactivated;
 *   the FAULTS F54 (gateway down), F55 (receipt write), F56 (requalification write) — each fails closed;
 *   the READS (connectors register, egress receipts: digests and counts, never bytes — D9), the lease and actor checks, the other tenant.
 * Every row here is SYNTHETIC fixture data. D3 is stated, never claimed: network-level denial is B103 / B109.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { ConnectorCellController } from '../../src/observation/connector-cell/connector-cell.controller.js';
import { AdapterCellConnector, ConnectorCellService } from '../../src/observation/connector-cell/connector-cell.service.js';
import { resolveAllVetted } from '../../src/observation/connector-cell/egress-gateway.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { evaluateForApproval, v4Blocks, B40_FIXTURES, B40_HOSTS, B40_REPLAY_ROOT, adapterPackage, sha256, srcV4Contract } from './phase6-b40-fixtures.js';

process.env['EYE_CONNECTOR_REPLAY_ROOT'] = B40_REPLAY_ROOT;

type Row = Record<string, unknown>;
const PARTNER = 'consignments.partner-logistics.synthetic.example';
const UNREGISTERED = 'track.unregistered-carrier.synthetic.example';
let h: Phase4Harness;
let su: Db;
let ctl: ConnectorCellController;
let cells: ConnectorCellService;
let orch: CollectionOrchestrator;
let vault: VaultService;
let dvorak: AuthenticatedPrincipal;     // collection manager (registers packages, submits requalifications)
let richter: AuthenticatedPrincipal;    // domain admin (the second person: approves packages and requalifications)
let haddad: AuthenticatedPrincipal;     // the partner's person: external collaborator (and, for the probe, a collection manager binding too)
const T = () => h.fx.tenantId;
const D = () => h.fx.domainId;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const refused = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) {
    const body = e.getResponse() as { error?: { message?: string }; message?: string };
    return { status: e.getStatus(), message: String(body?.error?.message ?? body?.message ?? e.message) };
  }
  return { status: -1, message: e instanceof Error ? e.message : String(e) };
};
const req = (p: AuthenticatedPrincipal, action: string, objectType = 'ADP', objectId: string | null = null) => h.req(p, action, objectType, objectId, 'observation');
const filesOf = (dir: string) => readdirSync(dir).filter((f) => f !== 'MANIFEST.json').sort().map((file) => ({ file, base64: readFileSync(join(dir, file)).toString('base64') }));

async function registerPackage(dir: string, who = dvorak, requestId?: string): Promise<Row> {
  const r = await ctl.registerAdapter(req(who, 'observation.adapter.register'), T(), D(), { payload: { files: filesOf(dir), ...(requestId === undefined ? {} : { requestId }) } }) as { package: Row };
  return r.package;
}
const digestOfPackage = async (packageId: string) => String((await one(sql`select package_digest d from observation.adapter_packages where package_id = ${packageId}::uuid`))['d']);
async function decidePackage(packageId: string, who: AuthenticatedPrincipal, decision: 'approve' | 'reject' = 'approve', expectedDigest?: string): Promise<Row> {
  const r = await ctl.decideAdapter(req(who, 'observation.adapter.approve', 'ADP', packageId), T(), D(), packageId,
    { payload: { decision, reason: 'reviewed the manifest, the destinations and the code (SYNTHETIC)', expectedDigest: expectedDigest ?? await digestOfPackage(packageId) } }) as { package: Row };
  return r.package;
}
const bind = (p: Row) => ({ package_id: String(p['package_id']), version: String(p['version']), digest: String(p['package_digest']) });

/** An SRC@v4 adapter contract registered by the analyst and approved by the manager (registrar ≠ approver, 0022); not yet active. */
async function adapterSource(label: string, pkg: { package_id: string; version: string; digest: string },
                             o: { mode?: 'replay' | 'live'; endpoints?: string[]; credentialRef?: string; credentialHeader?: string } = {}): Promise<string> {
  const key = `b40-cr-${label}-${uuidv7().slice(-8)}`;
  const c = srcV4Contract({ sourceKey: key, kind: 'adapter', endpoints: o.endpoints ?? [B40_HOSTS.partner], replaySet: 'nordwerk-logistics-partner', mode: o.mode ?? 'replay', adapter: pkg,
    /* B40 integration: §AP's authorize stage evaluates robots.txt for a LIVE v4 contract through the vetted client, which cannot reach this
       harness's loopback partner (its synthetic name resolves nowhere — the gateway's transport substitution is the cell's, not robots');
       a partner API under a bilateral agreement declares robots NOT APPLICABLE with its reason (the contract's own statement, D10's rule) */
    ...(o.mode === 'live' ? { blocks: { acquisition_policy: { ...v4Blocks().acquisition_policy, robots: { mode: 'not_applicable' as const, reason: 'a partner API under a bilateral data agreement (SYNTHETIC) — no crawler policy governs it' } } } } : {}) });
  if (o.credentialRef !== undefined) {
    const so = c['security_and_operations'] as Row;
    c['security_and_operations'] = { ...so, credential_ref: o.credentialRef, credential_header: o.credentialHeader ?? 'authorization', authentication_method: 'a partner key, injected by the egress gateway' };
  }
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const r = await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(),
    { payload: { contract: c } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  await evaluateForApproval(h, h.manager, { tenantId: T(), domainId: D(), sourceId, contractVersion: 1, label: 'B40 §CR fixture' });   // B40 integration: §RG's gate (D5)
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B40 cr fixture', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
    });
  return sourceId;
}
async function transition(sourceId: string, target: string): Promise<void> {
  await h.pipeline.write(h.env(h.manager, 'observation.source.transition', 'SRC', sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
    async (cap) => {
      await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target, reason: `B40 cr fixture: ${target}`, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
    });
}
/** The source's agent: an agent principal bound collection_agent, registered for the CELL (adapter-cell, the SDK's version and digest). */
async function registerAgent(sourceId: string): Promise<{ agentId: string; principalId: string }> {
  const connector = cells.connector();
  const principalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${principalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${principalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() },
    'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${principalId}::uuid, 'observation', ${connector.name}, ${connector.version},
        ${connector.codeDigest}, ${h.fx.registrarId}::uuid, ${sourceId}::uuid,
        ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
  return { agentId, principalId };
}
// the run's purpose is one the contract names (the admission's revalidation checks it); the gateway's default purpose is the run's
const collect = (sourceId: string) => orch.collectNow({ tenantId: T(), domainId: D(), sourceId, contractVersion: 1, correlationId: uuidv7(), purposeId: 'corridor monitoring',
  triggeredBy: 'B40 cr harness (SYNTHETIC)', triggerPrincipal: dvorak });
const contractState = async (sourceId: string) => String((await one(sql`select lifecycle_state s from observation.source_contracts_current where source_id = ${sourceId}::uuid and contract_version = 1`))['s']);
const receiptsOf = (runId: string) => rows(sql`select decision, refusal_class, host, response_status, response_digest, response_bytes, credential_injected, credential_ref,
  destination, package_digest, purpose, data_class, receipt_id::text from observation.egress_receipts where run_id = ${runId}::uuid order by seq`);
const admittedOf = async (runId: string) => Number((await one(sql`select count(*)::int n from observation.blob_manifests where run_id = ${runId}::uuid and vault = 'evidence'`))['n']);
const openRequalification = (sourceId: string) => one(sql`select requalification_id::text id, state, cause, cause_receipt_id::text receipt, digest_at_opening
  from observation.connector_requalifications where source_id = ${sourceId}::uuid and state in ('required', 'submitted', 'rejected')`);
const custodyCount = async (sourceId: string) => Number((await one(sql`select count(*)::int n from observation.custody_events where source_id = ${sourceId}::uuid`))['n']);
const checkpointCount = async (sourceId: string) => Number((await one(sql`select count(*)::int n from observation.checkpoint_events where source_id = ${sourceId}::uuid`))['n']);
async function submit(requalificationId: string, packageId: string | null, who = dvorak): Promise<{ requalification: Row; contractTests: Row }> {
  return await ctl.submitRequalification(req(who, 'observation.connector.requalification.submit', 'RQL', requalificationId), T(), D(), requalificationId,
    { payload: { packageId, reason: 'the requalified adapter follows tracking links on declared destinations only (SYNTHETIC)' } }) as { requalification: Row; contractTests: Row };
}
async function decideReq(requalificationId: string, who: AuthenticatedPrincipal, decision: 'approve' | 'reject' = 'approve', expectedDigest?: string): Promise<Row> {
  const digest = expectedDigest ?? String((await one(sql`select package_digest d from observation.connector_requalifications where requalification_id = ${requalificationId}::uuid`))['d']);
  return (await ctl.decideRequalification(req(who, 'observation.connector.requalification.approve', 'RQL', requalificationId), T(), D(), requalificationId,
    { payload: { decision, reason: 'reviewed the package, the digest and the contract tests (SYNTHETIC)', expectedDigest: digest } }) as { requalification: Row }).requalification;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  ctl = h.app.get(ConnectorCellController);
  cells = h.app.get(ConnectorCellService);
  orch = h.app.get(CollectionOrchestrator);
  vault = h.app.get(VaultService);
  dvorak = await h.humanWithSession(['collection_manager'], 'dvorak');
  richter = await h.humanWithSession(['domain_admin'], 'richter');
  haddad = await h.humanWithSession(['collection_manager', 'external_collaborator'], 'haddad');
}, 300_000);
afterEach(() => { fault.disarm(); });
afterAll(async () => { cells?.useLiveTransportForTests(null); await h?.close(); });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
let pkg100: Row; let pkg101: Row;
describe('the adapter package register (DP-14-003, D12)', () => {
  it('a collection manager registers 1.0.0: the digest RECOMPUTED by the port equals the SDK\'s, each file a vault blob that verifies, the manifest from adapter.json', async () => {
    const fx = adapterPackage('1.0.0');
    pkg100 = await registerPackage(fx.dir);
    expect(pkg100).toMatchObject({ name: 'nordwerk-logistics-consignments', version: '1.0.0', state: 'registered', package_digest: fx.packageDigest, protocol: 'eye-cell/1',
      author: 'R. Haddad\'s firm — partner logistics (SYNTHETIC, customer-written)', registered_by: dvorak.principalId, replayed: false });
    expect((pkg100['manifest'] as Row)['declared_destinations']).toEqual([PARTNER]);
    for (const f of pkg100['files'] as Array<Row>) {
      const got = await vault.read('evidence', { tenantId: T(), domainId: D() }, String(f['locator']), String(f['sha256']));
      expect(got.bytes.equals(readFileSync(join(fx.dir, String(f['file']))))).toBe(true);
    }
    const ev = await rows(sql`select event, actor::text a from observation.adapter_package_events where package_id = ${String(pkg100['package_id'])}::uuid`);
    expect(ev).toEqual([{ event: 'adapter.registered', a: dvorak.principalId }]);
  });
  it('a retry with the same request id answers the recorded package (replayed), never a second one; a second registration of 1.0.0 is a duplicate (409)', async () => {
    const requestId = uuidv7();
    const fx = adapterPackage('1.0.1');
    pkg101 = await registerPackage(fx.dir, dvorak, requestId);
    const again = await registerPackage(fx.dir, dvorak, requestId);
    expect(again).toMatchObject({ package_id: pkg101['package_id'], replayed: true });
    const dup = await refused(registerPackage(adapterPackage('1.0.0').dir));
    expect(dup.status).toBe(409);
    expect(dup.message).toMatch(/^adapter package rejected \(duplicate\): nordwerk-logistics-consignments 1\.0\.0 is already registered/);
    expect(Number((await one(sql`select count(*)::int n from observation.adapter_packages where name = 'nordwerk-logistics-consignments' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))['n'])).toBe(2);
  });
  it('refused: an analyst (the PDP), an external collaborator even holding a manager binding (the port), a manifest for another protocol, a file in a directory', async () => {
    expect((await refused(registerPackage(adapterPackage('1.0.0').dir, h.registrar))).status).toBe(403);
    const ext = await refused(registerPackage(adapterPackage('1.0.0').dir, haddad));
    expect(ext).toMatchObject({ status: 403 });
    expect(ext.message).toMatch(/^adapter package rejected \(authority\): registering an adapter package is never the act of an external collaborator/);
    const wrong = filesOf(adapterPackage('1.0.0').dir).map((f) => f.file === 'adapter.json'
      ? { ...f, base64: Buffer.from(Buffer.from(f.base64, 'base64').toString('utf8').replace('"eye-cell/1"', '"b40-cell-provisional-1"').replace('"1.0.0"', '"9.9.9"')).toString('base64') } : f);
    const proto = await refused(ctl.registerAdapter(req(dvorak, 'observation.adapter.register'), T(), D(), { payload: { files: wrong } }));
    expect(proto.status).toBe(422);
    expect(proto.message).toMatch(/^adapter package rejected \(manifest\): protocol is eye-cell\/1/);
    const dir = await refused(ctl.registerAdapter(req(dvorak, 'observation.adapter.register'), T(), D(), { payload: { files: [{ file: '../index.mjs', base64: 'eA==' }, ...filesOf(adapterPackage('1.0.0').dir)] } }));
    expect(dir).toMatchObject({ status: 422 });
    expect(dir.message).toMatch(/plain name/);
  });
  it('the SECOND PERSON decides once: the registrant (403 separation_of_duties), the external collaborator (403) and an agent (403) are refused; the domain admin approves; a second decision is 409', async () => {
    const id = String(pkg100['package_id']);
    const self = await refused(decidePackage(id, dvorak));
    expect(self.status).toBe(403);
    expect(self.message).toMatch(/^adapter package rejected \(separation_of_duties\): deciding an adapter package \(a second person: never its registrant\) is never done by its proposer/);
    expect((await refused(decidePackage(id, haddad))).status).toBe(403);
    // an agent principal of this domain (a collection agent): the PDP's rule names people only — an agent never decides
    const agentPrincipal = { ...h.manager, principalId: uuidv7(), kind: 'agent' as const, assurance: 'agent_grant' as const,
      bindings: [{ roleCode: 'collection_agent', scope: 'DOMAIN' as const, tenantId: T(), domainId: D() }] };
    expect((await refused(decidePackage(id, agentPrincipal))).status).toBe(403);
    // the decision binds the digest the decider reviewed: another digest is refused stale (409), nothing decided
    const stale = await refused(decidePackage(id, richter, 'approve', 'e'.repeat(64)));
    expect(stale.status).toBe(409);
    expect(stale.message).toMatch(/^adapter package rejected \(stale\): nordwerk-logistics-consignments 1\.0\.0 digests to [0-9a-f]{64}; the decision reviewed e{64}/);
    expect(await decidePackage(id, richter)).toMatchObject({ state: 'approved', decided_by: richter.principalId, replayed: false });
    expect((await refused(decidePackage(id, richter, 'reject'))).status).toBe(409);
    expect(await decidePackage(String(pkg101['package_id']), richter)).toMatchObject({ state: 'approved' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
let srcA = ''; let agentA = { agentId: '', principalId: '' };
describe('scene B40-5 — the customer-written adapter runs in its cell; the unregistered host is blocked; the connector is suspended and requalified', () => {
  it('an adapter contract activates ONLY on its approved package: bound to an unapproved one it is held; the requalified version runs later', async () => {
    // a contract binding a package digest the register does not hold for that id
    const bogus = await adapterSource('bogus', { package_id: String(pkg100['package_id']), version: '1.0.0', digest: 'f'.repeat(64) });
    const held = await refused(transition(bogus, 'active'));
    expect(held.message).toMatch(/^transition rejected \(held\): source .* v1 cannot be activated — adapter package .* is 1\.0\.0 with digest .*, not the 1\.0\.0 \/ f{64} the contract binds/);
    srcA = await adapterSource('partner', bind(pkg100));
    await transition(srcA, 'active');
    agentA = await registerAgent(srcA);
    expect(await contractState(srcA)).toBe('active');
  });

  let blocked: { runId: string; reason: string } = { runId: '', reason: '' };
  it('1.0.0 (DEF-B40-05): the gateway BLOCKS the unregistered host; the run FAILS CLOSED — nothing admitted, every request on a receipt; the contract SUSPENDED, cursor and custody intact', async () => {
    const custodyBefore = await custodyCount(srcA); const cpBefore = await checkpointCount(srcA);
    const r = await collect(srcA);
    blocked = { runId: r.runId, reason: String(r.reason) };
    expect(r.state).toBe('failed');
    expect(r.reason).toMatch(/^connector cell refused \(unregistered_destination\): the contract is suspended, requalification [0-9a-f-]{36} required \(cursor and custody unchanged\); host track\.unregistered-carrier\.synthetic\.example is not a destination the contract registers/);
    expect(r.admitted).toBe(0);
    expect(await admittedOf(r.runId)).toBe(0);
    const rc = await receiptsOf(r.runId);
    const page = (n: number) => sha256(readFileSync(join(B40_FIXTURES, 'replay', 'nordwerk-logistics-partner', `consignments-page-${n}.json`)));
    expect(rc.map((x) => [x['decision'], x['refusal_class'], x['host'], x['response_status'], x['response_digest']])).toEqual([
      ['allowed', null, PARTNER, 200, page(1)], ['allowed', null, PARTNER, 200, page(2)], ['blocked', 'unregistered_destination', UNREGISTERED, null, null]]);
    expect(rc.every((x) => x['package_digest'] === pkg100['package_digest'] && x['purpose'] === 'corridor monitoring' && x['credential_injected'] === false)).toBe(true);
    expect((rc[0]!['destination'] as Row)).toMatchObject({ mode: 'replay', replay_set: 'nordwerk-logistics-partner' });
    // suspended for requalification, with the blocked receipt as its evidence; cursor and custody untouched
    expect(await contractState(srcA)).toBe('suspended');
    const q = await openRequalification(srcA);
    expect(q).toMatchObject({ state: 'required', cause: 'unregistered_destination', receipt: String(rc[2]!['receipt_id']), digest_at_opening: pkg100['package_digest'] });
    expect(r.reason).toContain(`requalification ${String(q['id'])} required (cursor and custody unchanged)`);
    expect(await custodyCount(srcA)).toBe(custodyBefore);
    expect(await checkpointCount(srcA)).toBe(cpBefore);
    const ev = await rows(sql`select event, details ->> 'cause' c, actor_principal_id::text a from observation.source_contract_events
      where source_id = ${srcA}::uuid and event in ('contract.suspended', 'contract.requalification_required') order by event`);
    expect(ev).toEqual([{ event: 'contract.requalification_required', c: 'unregistered_destination', a: agentA.principalId },
                        { event: 'contract.suspended', c: 'unregistered_destination', a: agentA.principalId }]);
    // the same SourceHealthChanged a manager's suspension emits (B22's consumer marks what rests on the source)
    const ob = await rows(sql`select payload from objects.object_outbox where event_type = 'SourceHealthChanged' and payload ->> 'source_id' = ${srcA}`);
    expect(ob.map((o) => (o['payload'] as Row)['state'])).toEqual(['suspended']);
    // the run released the lease: the lifecycle recorded its end
    expect((await rows(sql`select event from observation.collection_run_events where run_id = ${r.runId}::uuid order by occurred_at`)).map((e) => e['event'])).toEqual(['run.started', 'run.failed']);
    expect(await one(sql`select count(*)::int n from observation.source_run_leases where source_id = ${srcA}::uuid`)).toEqual({ n: 0 });
  }, 120_000);
  it('reactivation is REFUSED while the requalification is open (transition_contract re-declared: held)', async () => {
    const r = await refused(transition(srcA, 'active'));
    expect(r.message).toMatch(/^transition rejected \(held\): source .* v1 is held for requalification .* \(unregistered_destination, required\)/);
    expect(await contractState(srcA)).toBe('suspended');
  });
  it('requalification: 1.0.0 again FAILS its contract tests (nothing recorded); 1.0.1 PASSES them in a cell against the replay set and is submitted', async () => {
    const q = await openRequalification(srcA);
    const same = await refused(submit(String(q['id']), String(pkg100['package_id'])));
    expect(same.status).toBe(422);
    expect(same.message).toMatch(/^requalification rejected \(contract_tests\): .*failed: every request on a registered destination — asked for track\.unregistered-carrier\.synthetic\.example/);
    expect(await openRequalification(srcA)).toMatchObject({ state: 'required' });
    // an analyst cannot submit (PDP); a domain admin cannot either (submission is the collection manager's)
    expect((await refused(submit(String(q['id']), String(pkg101['package_id']), h.registrar))).status).toBe(403);
    expect((await refused(submit(String(q['id']), String(pkg101['package_id']), richter))).status).toBe(403);
    const s = await submit(String(q['id']), String(pkg101['package_id']));
    expect(s.requalification).toMatchObject({ state: 'submitted', package_version: '1.0.1', package_digest: pkg101['package_digest'], submitted_by: dvorak.principalId });
    expect(s.contractTests).toMatchObject({ outcome: 'pass', transport: 'replay', package: { version: '1.0.1' } });
    expect((s.contractTests['cases'] as Row[]).map((c) => [c['name'], c['outcome']])).toEqual([
      ['package digest verified', 'pass'], ['manifest valid for eye-cell/1', 'pass'], ['declared destinations registered by the contract', 'pass'],
      ['every request on a registered destination', 'pass'], ['speaks eye-cell/1', 'pass'], ['completes against the replay set', 'pass'], ['frames at least one item', 'pass']]);
    expect(s.contractTests['receipts']).toEqual({ allowed: 2 });
    // the tests wrote no receipt and admitted nothing (a test is not a run)
    expect(Number((await one(sql`select count(*)::int n from observation.egress_receipts where source_id = ${srcA}::uuid`))['n'])).toBe(3);
  }, 120_000);
  it('the SECOND PERSON approves (the submitter is refused 403); the contract records contract.requalified; the manager reactivates; 1.0.1 is the package in force', async () => {
    const q = await openRequalification(srcA);
    const self = await refused(decideReq(String(q['id']), dvorak));
    expect(self.status).toBe(403);
    expect(self.message).toMatch(/^requalification rejected \(separation_of_duties\)/);
    expect((await refused(decideReq(String(q['id']), richter, 'approve', String(pkg100['package_digest'])))).message).toMatch(/^requalification rejected \(stale\)/);
    expect(await decideReq(String(q['id']), richter)).toMatchObject({ state: 'approved', decided_by: richter.principalId });
    expect(await one(sql`select event, details ->> 'package_version' v from observation.source_contract_events where source_id = ${srcA}::uuid and event = 'contract.requalified'`))
      .toEqual({ event: 'contract.requalified', v: '1.0.1' });
    await transition(srcA, 'active');
    const reg = await ctl.readConnectors(req(dvorak, 'observation.connectors.read'), T(), D()) as { connectors: Row };
    const c = (reg.connectors['contracts'] as Row[]).find((x) => x['source_id'] === srcA)!;
    expect(c).toMatchObject({ lifecycle_state: 'active', package_problem: null, open_requalification: null,
      package_in_force: { version: '1.0.1', digest: pkg101['package_digest'], via: 'requalification' } });
  });
  it('1.0.1 runs in its cell: three consignments framed and ADMITTED by the unchanged lifecycle (IA-47-003), every request on a receipt, the off-registry link never requested', async () => {
    const r = await collect(srcA);
    expect(r.state, r.reason).toBe('finished');
    expect(r.admitted).toBe(3);
    expect((await receiptsOf(r.runId)).map((x) => [x['decision'], x['host']])).toEqual([['allowed', PARTNER], ['allowed', PARTNER]]);
    const evd = await rows(sql`select o.payload -> 'transport' ->> 'methodRef' m, o.payload -> 'transport' ->> 'connector' c from objects.canonical_objects o
      where o.object_type = 'EVD' and o.payload ->> 'manifest_id' in (select manifest_id::text from observation.blob_manifests where run_id = ${r.runId}::uuid and vault = 'evidence')`);
    expect(evd).toHaveLength(3);
    const custody = await rows(sql`select event, connector, agent_principal_id::text a from observation.custody_events where run_id = ${r.runId}::uuid and event = 'custody.admitted'`);
    expect(custody).toHaveLength(3);
    expect(custody.every((x) => x['connector'] === 'adapter-cell' && x['a'] === agentA.principalId)).toBe(true);
  }, 120_000);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
let srcB = '';
describe('the faults (D17) and package integrity — each fails CLOSED', () => {
  it('F54 the gateway cannot start: no cell, no request, no receipt, nothing admitted; the contract stays active', async () => {
    srcB = await adapterSource('faults', bind(pkg101));
    await transition(srcB, 'active');
    await registerAgent(srcB);
    fault.arm(['f54.gateway_down'], 'test');
    const r = await collect(srcB);
    expect(r).toMatchObject({ state: 'failed', admitted: 0 });
    expect(r.reason).toMatch(/^connector cell refused \(gateway_unavailable\): the egress gateway could not start \(injected fault at f54\.gateway_down\); no cell was started and no request left/);
    expect(await receiptsOf(r.runId)).toEqual([]);
    expect(await contractState(srcB)).toBe('active');
  }, 120_000);
  it('F55 the receipts cannot be written: NOTHING the cell framed is admitted (no item without its receipts)', async () => {
    fault.arm(['f55.receipt_write'], 'test');
    const r = await collect(srcB);
    expect(r).toMatchObject({ state: 'failed', admitted: 0 });
    expect(r.reason).toMatch(/^connector cell refused \(receipts_unrecorded\): the 2 transfer receipt\(s\) of this run could not be recorded .*nothing the cell framed is admitted/);
    expect(await admittedOf(r.runId)).toBe(0);
    expect(await receiptsOf(r.runId)).toEqual([]);
    expect(await contractState(srcB)).toBe('active');
  }, 120_000);
  it('PACKAGE INTEGRITY: a package file whose vault bytes no longer verify is never run — suspended for requalification; once the bytes verify again the SAME digest requalifies', async () => {
    const scope = { tenantId: T(), domainId: D() };
    const f = (pkg101['files'] as Row[]).find((x) => x['file'] === 'index.mjs')!;
    const original = readFileSync(join(adapterPackage('1.0.1').dir, 'index.mjs'));
    await vault.overwriteForIntegrityTest('evidence', scope, String(f['locator']), Buffer.from('export async function acquire(ctx) { /* SYNTHETIC tampering */ }'));
    try {
      const r = await collect(srcB);
      expect(r).toMatchObject({ state: 'failed', admitted: 0 });
      expect(r.reason).toMatch(/^connector cell refused \(package_integrity\): the contract is suspended, requalification .* required \(cursor and custody unchanged\); package nordwerk-logistics-consignments 1\.0\.1 file index\.mjs did not verify \(corrupt/);
      expect(await receiptsOf(r.runId)).toEqual([]);   // no cell was started
      expect(await contractState(srcB)).toBe('suspended');
      expect(await openRequalification(srcB)).toMatchObject({ state: 'required', cause: 'package_integrity' });
      // while the bytes are still wrong the contract tests fail at their first case
      const bad = await refused(submit(String((await openRequalification(srcB))['id']), String(pkg101['package_id'])));
      expect(bad.message).toMatch(/^requalification rejected \(contract_tests\): .*failed: package digest verified/);
    } finally {
      await vault.overwriteForIntegrityTest('evidence', scope, String(f['locator']), original);
    }
    const q = await openRequalification(srcB);
    expect((await submit(String(q['id']), String(pkg101['package_id']))).requalification).toMatchObject({ state: 'submitted' });
    await decideReq(String(q['id']), richter);
    await transition(srcB, 'active');
    expect((await collect(srcB)).state).toBe('finished');
  }, 180_000);
  it('F56 the suspension cannot be written: the run still fails closed, its blocked receipt recorded, and it SAYS the requalification was NOT recorded; the next run records it', async () => {
    const srcE = await adapterSource('f56', bind(pkg100));
    await transition(srcE, 'active');
    await registerAgent(srcE);
    fault.arm(['f56.requalification_write'], 'test');
    const r = await collect(srcE);
    expect(r).toMatchObject({ state: 'failed', admitted: 0 });
    expect(r.reason).toMatch(/^connector cell refused \(unregistered_destination\): the suspension and requalification were NOT recorded \(injected fault at f56\.requalification_write\) — the run is failed closed all the same; host track\.unregistered-carrier/);
    expect((await receiptsOf(r.runId)).map((x) => x['decision'])).toEqual(['allowed', 'allowed', 'blocked']);
    expect(await contractState(srcE)).toBe('active');
    expect(await openRequalification(srcE)).toEqual({});
    fault.disarm();
    const again = await collect(srcE);
    expect(again.state).toBe('failed');
    expect(await contractState(srcE)).toBe('suspended');
    expect(await openRequalification(srcE)).toMatchObject({ state: 'required', cause: 'unregistered_destination' });
  }, 180_000);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('credential rotation (IA-47-005): a new reference, the old revoked, the contract suspended and requalified', () => {
  it('refused: an analyst (PDP), the external collaborator (port), a value instead of a reference, a contract of another kind', async () => {
    const rot = (who: AuthenticatedPrincipal, sourceId: string, ref: string) => ctl.rotateCredential(req(who, 'observation.connector.credential.rotate', 'SRC', sourceId), T(), D(), sourceId,
      { payload: { contractVersion: sourceId === h.fx.sourceId ? h.version : 1, ref, header: 'x-partner-key', reason: 'scheduled rotation of the partner key (SYNTHETIC)' } });
    expect((await refused(rot(h.registrar, srcB, 'EYE_SRC_B40_CR_KEY_2'))).status).toBe(403);
    expect((await refused(rot(haddad, srcB, 'EYE_SRC_B40_CR_KEY_2'))).status).toBe(403);
    const val = await refused(rot(dvorak, srcB, 'sk-live-not-a-reference'));
    expect(val).toMatchObject({ status: 422 });
    expect(val.message).toMatch(/^credential rotation rejected \(reference\): a credential is named by its deployment reference EYE_SRC_<NAME>, never by its value/);
    const kind = await refused(rot(dvorak, h.fx.sourceId, 'EYE_SRC_B40_CR_KEY_2'));
    expect(kind.message).toMatch(/^credential rotation rejected \(kind\): a rest contract carries its credential reference in its own document/);
  });
  it('rotate twice: binding v1 then v2 (v1 revoked); each rotation suspends and opens (or joins) the requalification; the same package requalifies', async () => {
    const rot = async (ref: string) => (await ctl.rotateCredential(req(dvorak, 'observation.connector.credential.rotate', 'SRC', srcB), T(), D(), srcB,
      { payload: { contractVersion: 1, ref, header: 'x-partner-key', reason: 'scheduled rotation of the partner key (SYNTHETIC)' } }) as { rotation: Row }).rotation;
    expect(await rot('EYE_SRC_B40_CR_KEY_2')).toMatchObject({ binding_version: 1, ref: 'EYE_SRC_B40_CR_KEY_2', revoked_binding_version: null, suspended: true, contract_state: 'suspended' });
    const q1 = await openRequalification(srcB);
    expect(q1).toMatchObject({ state: 'required', cause: 'credential_rotated' });
    expect((await refused(transition(srcB, 'active'))).message).toMatch(/^transition rejected \(held\)/);
    expect(await rot('EYE_SRC_B40_CR_KEY_3')).toMatchObject({ binding_version: 2, revoked_binding_version: 1, suspended: false, contract_state: 'suspended' });
    expect((await openRequalification(srcB))['id']).toBe(q1['id']);   // joined, not a second one
    expect(await rows(sql`select binding_version v, credential_ref r, state s, rotated_from f from observation.connector_credential_bindings where source_id = ${srcB}::uuid order by binding_version`))
      .toEqual([{ v: 1, r: 'EYE_SRC_B40_CR_KEY_2', s: 'revoked', f: null }, { v: 2, r: 'EYE_SRC_B40_CR_KEY_3', s: 'in_force', f: 1 }]);
    expect(Number((await one(sql`select count(*)::int n from observation.source_contract_events where source_id = ${srcB}::uuid and event = 'contract.credential_rotated'`))['n'])).toBe(2);
    expect((await submit(String(q1['id']), null)).requalification).toMatchObject({ state: 'submitted', package_digest: pkg101['package_digest'] });
    await decideReq(String(q1['id']), richter);
    await transition(srcB, 'active');
    expect(await contractState(srcB)).toBe('active');
  }, 120_000);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('a LIVE adapter contract: the credential injected by the gateway, the destination pinned, a changed identity blocked and quarantined (IA-28-005)', () => {
  let tls: { a: { key: string; pem: string }; b: { key: string; pem: string } };
  let server: TlsServer | null = null;
  const hits: Array<{ path: string; key: string | undefined }> = [];
  const listen = async (k: { key: string; pem: string }, port = 0): Promise<number> => {
    const s = createTlsServer({ key: k.key, cert: k.pem }, (rq, rs) => {
      hits.push({ path: rq.url ?? '', key: rq.headers['x-partner-key'] as string | undefined });
      rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ consignment_id: 'NWL-LIVE-1', status: 'in_transit', synthetic: true }));
    });
    await new Promise<void>((ok) => s.listen(port, '127.0.0.1', () => ok()));
    server = s;
    return (s.address() as AddressInfo).port;
  };
  const close = async () => { const s = server; server = null; if (s !== null) { s.closeAllConnections(); await new Promise<void>((ok) => s.close(() => ok())); } };
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'b40-cr-live-'));
    const make = (n: string) => {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, `${n}.key`), '-out', join(dir, `${n}.pem`),
        '-days', '1', '-subj', `/CN=${PARTNER}`, '-addext', `subjectAltName=DNS:${PARTNER}`], { stdio: ['ignore', 'ignore', 'ignore'] });
      return { key: readFileSync(join(dir, `${n}.key`), 'utf8'), pem: readFileSync(join(dir, `${n}.pem`), 'utf8') };
    };
    tls = { a: make('a'), b: make('b') };
    rmSync(dir, { recursive: true, force: true });   // the keys made here live in memory only
  });
  afterAll(async () => { await close(); delete process.env['EYE_SRC_B40_CR_PARTNER']; cells.useLiveTransportForTests(null); });

  it('first run: the gateway injects the credential (the cell never holds it), the receipt names its REFERENCE, the identity is PINNED on first use; then a changed key is BLOCKED before the request', async () => {
    const port = await listen(tls.a);
    const url = `https://${PARTNER}:${port}/v1/live?item=1`;
    // a probe package written here, registered and approved like any other (its one request is the contract's endpoint)
    const dir = mkdtempSync(join(tmpdir(), 'b40-cr-probe-'));
    try {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(dir, 'adapter.json'), `${JSON.stringify({ name: 'b40-cr-live-probe', version: '1.0.0', entry: 'index.mjs', author: 'the B40 harness (SYNTHETIC)',
        declared_destinations: [PARTNER], purposes: ['corridor monitoring'], data_classes: ['consignment status (internal)'], protocol: 'eye-cell/1', synthetic: true }, null, 2)}\n`);
      writeFileSync(join(dir, 'index.mjs'), `export async function acquire(ctx) {
  const res = await ctx.gatewayFetch(${JSON.stringify(url)});
  if (res.status !== 200) throw new Error('the partner answered ' + res.status);
  ctx.emit({ itemKey: 'live:NWL-LIVE-1', mediaType: 'application/json', bytes: res.body });
  ctx.log('environment keys seen by the cell: ' + Object.keys(process.env).filter((k) => k !== '__CF_USER_TEXT_ENCODING').length);
}\n`);
      const probe = await registerPackage(dir);
      await decidePackage(String(probe['package_id']), richter);
      process.env['EYE_SRC_B40_CR_PARTNER'] = 'synthetic-partner-credential-b40-cr';
      cells.useLiveTransportForTests({ resolve: async (host) => (host === PARTNER ? ['127.0.0.1'] : resolveAllVetted(host)), trustAnchorPem: `${tls.a.pem}${tls.b.pem}` });
      const srcC = await adapterSource('live', bind(probe), { mode: 'live', endpoints: [`https://${PARTNER}:${port}/v1/live`], credentialRef: 'EYE_SRC_B40_CR_PARTNER', credentialHeader: 'x-partner-key' });
      await transition(srcC, 'active');
      await registerAgent(srcC);
      const r1 = await collect(srcC);
      expect(r1.state, r1.reason).toBe('finished');
      expect(r1.admitted).toBe(1);
      expect(hits).toEqual([{ path: '/v1/live?item=1', key: 'synthetic-partner-credential-b40-cr' }]);
      const rc1 = await receiptsOf(r1.runId);
      expect(rc1).toHaveLength(1);
      expect(rc1[0]).toMatchObject({ decision: 'allowed', credential_injected: true, credential_ref: 'EYE_SRC_B40_CR_PARTNER', response_status: 200 });
      expect(rc1[0]!['destination']).toMatchObject({ mode: 'live', addresses: ['127.0.0.1'], pinned_address: '127.0.0.1', pin_state: 'first_use' });
      expect(JSON.stringify(await rows(sql`select * from observation.egress_receipts where source_id = ${srcC}::uuid`))).not.toContain('synthetic-partner-credential-b40-cr');
      const pin = await one(sql`select host, tls_spki_sha256 s, first_receipt_id::text f from observation.egress_destination_pins where source_id = ${srcC}::uuid`);
      expect(pin).toMatchObject({ host: PARTNER, s: (rc1[0]!['destination'] as Row)['tls_spki_sha256'], f: rc1[0]!['receipt_id'] });
      // the SAME host, now presenting another key (also trusted by the anchor): the identity CHANGED
      await close();
      await listen(tls.b, port);
      const before = hits.length;
      const r2 = await collect(srcC);
      expect(r2).toMatchObject({ state: 'failed', admitted: 0 });
      expect(r2.reason).toMatch(/^connector cell refused \(destination_identity_changed\): the contract is suspended, requalification [0-9a-f-]{36} required \(cursor and custody unchanged\); the exchange quarantined \(case [0-9a-f-]{36}\); the destination consignments\.partner/);   // the run's reason is bounded (300)
      // the whole reason is on the requalification (and on the receipt): the presented key, the pinned one, the request not sent
      expect(String((await one(sql`select cause_detail d from observation.connector_requalifications where source_id = ${srcC}::uuid`))['d']))
        .toMatch(/^the destination consignments\.partner-logistics\.synthetic\.example presented TLS identity \S+, not the pinned \S+; the request was not sent$/);
      expect(hits.length).toBe(before);   // not one request byte reached the changed destination
      const rc2 = await receiptsOf(r2.runId);
      expect(rc2).toHaveLength(1);
      expect(rc2[0]).toMatchObject({ decision: 'blocked', refusal_class: 'destination_identity_changed', response_digest: null });
      expect(rc2[0]!['destination']).toMatchObject({ pin_state: 'changed', expected_spki_sha256: [pin['s']] });
      // the exchange QUARANTINED with its reason; the request preserved (redacted, no credential value)
      const qc = await one(sql`select q.reason_class c, m.vault v, m.locator l, m.content_digest d from observation.quarantine_current q join observation.blob_manifests m on m.manifest_id = q.manifest_id
        where q.run_id = ${r2.runId}::uuid`);
      expect(qc).toMatchObject({ c: 'destination_identity_changed', v: 'quarantine' });
      const preserved = await vault.read('quarantine', { tenantId: T(), domainId: D() }, String(qc['l']), String(qc['d']));
      const x = JSON.parse(preserved.bytes.toString('utf8')) as Row;
      expect(x).toMatchObject({ receipt_id: rc2[0]!['receipt_id'], request: { method: 'GET', credential: { ref: 'EYE_SRC_B40_CR_PARTNER', injected: false } } });
      expect(preserved.bytes.toString('utf8')).not.toContain('synthetic-partner-credential-b40-cr');
      expect(await contractState(srcC)).toBe('suspended');
      expect(await openRequalification(srcC)).toMatchObject({ state: 'required', cause: 'destination_identity_changed', receipt: rc2[0]!['receipt_id'] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180_000);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('the reads, the lease and the actor (RU-11, D9), the other tenant', () => {
  it('the egress receipts read: digests, sizes, destinations and decisions — never bytes; counts by decision and class; an agent is not a reader', async () => {
    const r = await ctl.readEgress(req(dvorak, 'observation.egress.read', 'EGR'), T(), D(), { payload: { sourceId: srcA } }) as { egress: Row };
    const list = r.egress['receipts'] as Row[];
    expect(list.length).toBe(5);
    expect(r.egress['counts']).toEqual({ allowed: 4, 'blocked:unregistered_destination': 1 });
    for (const x of list) {
      expect(Object.keys(x)).not.toContain('body');
      expect(JSON.stringify(x)).not.toMatch(/NWL-7701|NORDWERK ANTRIEBSTECHNIK/);   // no content
    }
    const agentRun = await h.sessions.openRunSession({ agentId: agentA.agentId, tenantId: T(), domainId: D(), agentVersion: cells.connector().version, codeDigest: cells.connector().codeDigest, correlationId: uuidv7() });
    expect((await refused(ctl.readEgress(req(agentRun, 'observation.egress.read', 'EGR'), T(), D(), { payload: {} }))).status).toBe(403);
  });
  it('the connectors register: packages with their ledgers, requalifications with theirs, bindings by reference only', async () => {
    const r = await ctl.readConnectors(req(richter, 'observation.connectors.read'), T(), D()) as { connectors: Row };
    const pk = (r.connectors['packages'] as Row[]).find((p) => p['package_id'] === pkg100['package_id'])!;
    expect((pk['events'] as Row[]).map((e) => e['event'])).toEqual(['adapter.registered', 'adapter.approved']);
    const rq = (r.connectors['requalifications'] as Row[]).find((q) => q['source_id'] === srcA)!;
    expect((rq['events'] as Row[]).map((e) => e['event'])).toEqual(['requalification.required', 'requalification.submitted', 'requalification.approved']);
    expect(JSON.stringify(r.connectors['credential_bindings'])).not.toMatch(/synthetic-partner-credential/);
  });
  it('the receipts and the suspension are the source agent\'s, for the run that HOLDS the lease: a human is refused (actor), a run without the lease is refused (held)', async () => {
    const commitDb = h.app.get<Db>(COMMIT_DB);
    const agentRun = await h.sessions.openRunSession({ agentId: agentA.agentId, tenantId: T(), domainId: D(), agentVersion: cells.connector().version, codeDigest: cells.connector().codeDigest, correlationId: uuidv7() });
    const receipt = [{ seq: 1, requested_at: new Date().toISOString(), method: 'GET', url_redacted: 'https://x.synthetic.example/', host: 'x.synthetic.example', decision: 'refused',
      refusal_class: 'request', request_digest: 'a'.repeat(64), request_bytes: 1, destination: { mode: 'none' }, credential_injected: false }];
    const call = (p: AuthenticatedPrincipal) => inCommitContext(commitDb, { sessionId: p.sessionId, contextKey: p.contextKey }, { tenantId: T(), domainId: D() }, 'observation.egress.record', srcA,
      async (tx) => sql`select observation.record_egress_receipts(${T()}::uuid, ${D()}::uuid, ${srcA}::uuid, 1, ${uuidv7()}::uuid, ${JSON.stringify(receipt)}::jsonb, ${uuidv7()}::uuid)`.execute(tx as never));
    expect((await refused(call(dvorak))).message).toMatch(/^egress receipt rejected \(actor\): only the active collection agent of source/);
    expect((await refused(call(agentRun))).message).toMatch(/^egress receipt rejected \(held\): run .* does not hold the run lease of source/);
  });
  it('another tenant\'s caller reads nothing of this domain: the route refuses the scope before any port', async () => {
    const other = uuidv7();
    const r = await refused(ctl.readConnectors(h.req(dvorak, 'observation.connectors.read', 'ADP', null, 'observation'), other, D()));
    expect([400, 403, 404]).toContain(r.status);
  });
  it('the cell connector is the published SDK\'s: its digest names the SDK files; connectorFor(adapter) answers it; the default refusal for an unknown kind stands', async () => {
    const c = orch.connectorFor('adapter');
    expect(c).toBeInstanceOf(AdapterCellConnector);
    expect(c).toMatchObject({ kind: 'adapter', name: 'adapter-cell' });
    expect(c.codeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(() => orch.connectorFor('crawler')).toThrow();
    // an unbound cell (no run principal) never runs
    await expect(c.acquire({} as never)).rejects.toThrow(/^connector cell refused \(unbound\)/);
  });
});
