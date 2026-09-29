/**
 * CP-6 B29 §B (migration 0092, part B) — THE MULTI-TIER SUPPLY NETWORK TWIN AND THE SUPPLY CHAIN AGENT (F-P5-01 clause 3), on a real
 * database through the real routes and ports, with named humans and the agent holding sessions of their own (the ports compare the acting
 * principal). Every network here is SYNTHETIC (NORDWERK's data is the demonstration's).
 *
 *   C1 · THE KIND: `supply-network` listed with its schema; a 3-tier network admitted under the family validator; its measures — the tier-2
 *        bearing maker's capacity is the bottleneck (1800 pcs/day bounds Regensburg at 450 modules/day), tier coverage, single sources.
 *        Refused: a capacity in a unit that is not per day (at grounding, nothing written); a route from an undeclared site (at admission).
 *        Recovered: the owner declares the site (and its capacity) into the same draft, which admits.
 *   C2 · THE AGENT: registered with this runtime's scan; its run drafts the bottleneck finding WITH THE NUMBERS to the owner (and the single
 *        sources), its attempt to admit REFUSED at the PDP and recorded; the owner accepts it. Refused: the agent admitting or grounding at
 *        the route (PDP) and opening a version at the port (the agent write boundary); a person drafting a finding (the PDP, and the port by
 *        principal kind); another owner deciding; a foreign digest at registration and a drifted registration's run.
 *        Recovered: a dismissed finding is not re-proposed while its measure stands and is re-proposed once it changes (the accepted one
 *        stays accepted, the open one superseded); a run interrupted by its read budget resumes from the backlog in a fresh application
 *        context (the restarted API) and the backlog is drafted within max_items across runs, nothing twice.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { SupplyNetworkController } from '../../src/twin/supply-network/supply-network.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { DecisionAgentSessionService } from '../../src/executive/agents/agent-session.service.js';
import { SUPPLY_CHAIN_AGENT_DIGEST, SUPPLY_CHAIN_AGENT_VERSION } from '../../src/executive/agents/supply-chain-agent.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { cite } from './phase5-fixtures.js';
import { threeTier } from '../unit/phase6-supply-network-b29.fixtures.js';

// C5 / Nit 8: this file's own vault roots (the record the elements cite is uploaded through the real route).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b29-b-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number };
type El = { key: string; value: unknown; unit: string | null };

let h: Phase4Harness; let T: string; let D: string;
let twins: TwinController; let comp: CompositionController; let sn: SupplyNetworkController; let exec: ExecutiveController;
let netOwner: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let entityId: string; let base: Evd;
/** N: the 3-tier network; P: C1's refusal probe (recovered with a second steel mill); Q1/Q2: C2's backlog. */
let N: string; let P: string; let A1: string;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B29-B EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
async function refusal(p: Promise<unknown>): Promise<{ status: number | null; message: string }> {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  const raw = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e));
  return { status: mapped === null ? null : mapped.getStatus(), message: raw };
}
async function refused(p: Promise<unknown>, re: RegExp, status: number) {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
}

const req = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(p, action, type, id, 'twin');
const asEl = (base0: Evd) => (e: El) => ({ key: e.key, kind: 'assumed', value: e.value, unit: e.unit, citations: [cite(base0)] });
async function declare(owner: AuthenticatedPrincipal, title: string, kind = 'supply-network'): Promise<string> {
  const d = await twins.declare(req(owner, 'twin.declare', 'TWN', null), T, D, { payload: { kind, title, statement: `${title} (B29 supply-network harness)`,
    boundary: [entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  return d.twin.twinId;
}
async function openDraft(owner: AuthenticatedPrincipal, twinId: string, carryFrom: number | null = null, except: string[] = []): Promise<number> {
  const o = await twins.openVersion(req(owner, 'twin.version', 'TWN', twinId), T, D, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), carryFrom, except } }) as { version: { version: number } };
  return o.version.version;
}
const ground = (owner: AuthenticatedPrincipal, twinId: string, v: number, elements: El[]) =>
  twins.ground(req(owner, 'twin.ground', 'TWN', twinId), T, D, twinId, String(v), { payload: { elements: elements.map(asEl(base)) } });
const admit = (owner: AuthenticatedPrincipal, twinId: string, v: number) =>
  twins.admit(req(owner, 'twin.version.admit', 'TWN', twinId), T, D, twinId, String(v), { payload: { allowIncomplete: true } }) as Promise<{ admitted: Row }>;
async function version(owner: AuthenticatedPrincipal, twinId: string, elements: El[], carryFrom: number | null = null, except: string[] = []): Promise<number> {
  const v = await openDraft(owner, twinId, carryFrom, except);
  await ground(owner, twinId, v, elements);
  await admit(owner, twinId, v);
  return v;
}
const analysis = async (p: AuthenticatedPrincipal, twinId: string) =>
  ((await sn.analysis(req(p, 'twin.read', 'TWN', twinId), T, D, twinId, { payload: {} })) as { analysis: Row }).analysis;
const proposals = async (p: AuthenticatedPrincipal, twinId: string, state?: string) =>
  ((await sn.listProposals(req(p, 'twin.read', 'TWN', twinId), T, D, { payload: { twinId, ...(state === undefined ? {} : { state }) } })) as { proposals: Row[] }).proposals;
const decide = (p: AuthenticatedPrincipal, proposalId: string, decision: string, note?: string) =>
  sn.decide(req(p, 'twin.proposal.decide', 'TWP', proposalId), T, D, proposalId, { payload: { decision, ...(note === undefined ? {} : { note }) } }) as Promise<{ decision: Row }>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload }) as Promise<{ agent: { agentId: string; principalId: string; kind: string; role: string } }>;
const runAgent = (agentId: string, payload: Row, e: ExecutiveController = exec) =>
  e.runAgent(h.req(executive, 'agent.trigger', 'AGT', agentId, 'twin'), T, D, agentId, { payload: payload as never }) as unknown as Promise<{ run: { runId: string; outcome: string; stopReason: string | null; refusals: Row[]; outputs: Row; escalatedTo: string | null } }>;
const finding = (rows: Row[], kind: string, subject: string, state?: string) => rows.filter((r) => r['finding_kind'] === kind && r['subject'] === subject && (state === undefined || r['state'] === state));
async function events(twinId: string, event: string): Promise<Row[]> {
  return (await sql<Row>`select event, actor_principal_id, details from twin.twin_events where twin_id = ${twinId}::uuid and event = ${event} order by occurred_at`.execute(h.su)).rows;
}
const agentBase = () => ({ kind: 'supply_chain', version: SUPPLY_CHAIN_AGENT_VERSION, codeDigest: SUPPLY_CHAIN_AGENT_DIGEST, ownerPrincipalId: netOwner.principalId, escalationPrincipalId: executive.principalId });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { SupplyNetworkController: Sc } = await import('../../src/twin/supply-network/supply-network.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  twins = h.app.get(Tc); comp = h.app.get(Cc); sn = h.app.get(Sc); exec = h.app.get(Ec);
  netOwner = await h.humanWithSession(['twin_owner'], 'network-owner');
  otherOwner = await h.humanWithSession(['twin_owner'], 'other-owner');
  executive = await h.humanWithSession(['executive'], 'b29-executive');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b29-tenant-admin', 'TENANT');
  entityId = uuidv7(); const corr = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'organization', 'NORDWERK Regensburg', 'nordwerk regensburg', 'active', ${netOwner.principalId}::uuid, ${corr}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${entityId}::uuid, 'entity.created', ${netOwner.principalId}::uuid,
            ${JSON.stringify({ entity_type: 'organization', canonical_name: 'NORDWERK Regensburg', normalized_name: 'nordwerk regensburg', split_from: null })}::jsonb, ${corr}::uuid)`.execute(h.su);
  const up = await h.upload([{ filename: 'b29-supply-network.csv', text: 'synthetic,record_id,key,value,unit\ntrue,SYN-NET-001,capacity:bearing-maker.bearing,1800,pcs/day\n' }]);
  base = up[0] as Evd;
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('C1 · the multi-tier supply network: tier, site, material, route, capacity — the kind, its validator and its measures', () => {
  it('positive: the kind is listed with its schema; a 3-tier network admits; the tier-2 bearing maker\'s capacity is the bottleneck with the constrained quantity', async () => {
    const kinds = ((await comp.listKinds(req(netOwner, 'twin.read', 'TWN', null), T, D)) as { kinds: Row[] }).kinds;
    const k = kinds.find((x) => x['kind'] === 'supply-network');
    expect(k).toMatchObject({ family: 'supply-network', scope: 'product', material_keys: ['capacity', 'material', 'route', 'site', 'tier'], default_methods: ['discrete-event', 'optimisation'] });
    expect(Object.keys(k?.['element_schema'] as Row).sort()).toEqual(['capacity', 'material', 'route', 'site', 'tier']);
    expect(kinds.find((x) => x['kind'] === 'supply-chain')?.['material_keys']).toContain('inventory.on_hand');   // the supply-chain kind untouched
    N = await declare(netOwner, 'NORDWERK — Regensburg hub-module network (3 tiers)');
    expect(await version(netOwner, N, threeTier())).toBe(1);
    const a = await analysis(netOwner, N);
    expect(a).toMatchObject({ family: 'supply-network', version: 1, analysis: { terminal: 'regensburg', throughput_per_day: 450, throughput_unit: 'pcs/day', tier_coverage: 1,
      bottleneck: { site: 'bearing-maker', tier: 2, material: 'bearing', capacity_per_day: 1800, unit: 'pcs/day', throughput_per_day: 450, relieved_throughput_per_day: 1000 } } });
    expect(arr(a['findings']).map((f) => `${String(f['finding_kind'])}:${String(f['subject'])}`)).toEqual(['bottleneck:bearing-maker.bearing', 'single_source:bearing-maker.steel', 'single_source:module-a.bearing', 'single_source:module-b.bearing']);
    const m = ((await comp.measures(req(netOwner, 'twin.read', 'TWN', N), T, D, N, { payload: {} })) as { measures: Row }).measures;
    expect(m).toMatchObject({ family: 'supply-network', version: 1, measures: { bottleneck: 'bearing-maker.bearing', bottleneck_tier: 2, bottleneck_capacity_per_day: 1800, throughput_per_day: 450, tiers: 3, tiers_covered: 3, single_sources: 3 } });
    sixEvidence('C1+', { fault_trace: { refused: [] }, watermark: { twin: N, version: 1 }, consumer_behaviour: { bottleneck: 'bearing-maker.bearing', throughput_per_day: 450 },
      operator_action: 'the network owner declares, grounds and admits', recovery: 'none needed', reconciliation: m['measures'] });
  });

  it('refusal: a capacity not per day refused at GROUNDING (nothing written); a route from an undeclared site refused by the validator at ADMISSION', async () => {
    P = await declare(netOwner, 'NORDWERK — second steel source (refusal probe)');
    const p1 = await openDraft(netOwner, P);
    await refused(ground(netOwner, P, p1, [...threeTier().slice(0, 3), { key: 'capacity:steel-mill.steel', value: 40, unit: 't' }]),
      /^family validation refused \(supply-network\) at grounding: capacity:steel-mill\.steel: unit t — the kind declares a unit of the form .* — nothing was grounded$/, 422);
    expect((await sql<{ n: number }>`select count(*)::int n from twin.state_elements where twin_id = ${P}::uuid`.execute(h.su)).rows[0]?.n).toBe(0);
    await ground(netOwner, P, p1, [...threeTier(), { key: 'route:r9', value: { from: 'second-mill', to: 'bearing-maker', material: 'steel' }, unit: null }]);
    await refused(admit(netOwner, P, p1), /^family validation refused \(supply-network\): route:r9: from second-mill — not a declared site$/, 422);
    expect((await sql<{ state: string }>`select state from twin.twin_versions where twin_id = ${P}::uuid and version = ${p1}`.execute(h.su)).rows[0]?.state).toBe('draft');
    // a capacity in another material's unit, judged at admission (the schema takes any unit per day; the family holds it to the material's)
    const Z = await declare(netOwner, 'NORDWERK — unit probe');
    const z = await openDraft(netOwner, Z);
    await ground(netOwner, Z, z, threeTier({ extra: [] }).map((e) => (e.key === 'capacity:module-b.module' ? { ...e, unit: 't/day' } : e)));
    await refused(admit(netOwner, Z, z), /capacity:module-b\.module: unit t\/day — module is counted in pcs, so its capacity is in pcs\/day/, 422);
  });

  it('recovery: the owner declares the missing site and its capacity into the same draft, which admits; the single source it removes is gone', async () => {
    const p1 = Number((await sql<{ v: number }>`select version v from twin.twin_versions where twin_id = ${P}::uuid and state = 'draft'`.execute(h.su)).rows[0]?.v);
    await ground(netOwner, P, p1, [{ key: 'site:second-mill', value: { tier: 3, name: 'Second steel mill' }, unit: null }, { key: 'capacity:second-mill.steel', value: 40, unit: 't/day' }]);
    expect((await admit(netOwner, P, p1)).admitted).toMatchObject({ version: p1 });
    const a = await analysis(netOwner, P);
    expect(arr(a['findings']).map((f) => `${String(f['finding_kind'])}:${String(f['subject'])}`)).toEqual(['bottleneck:bearing-maker.bearing', 'single_source:module-a.bearing', 'single_source:module-b.bearing']);
    sixEvidence('C1', { fault_trace: { refused: ['422 capacity unit at grounding', '422 undeclared route endpoint at admission', '422 unit of another material'] }, watermark: { probe: P, version: p1 },
      consumer_behaviour: { findings: arr(a['findings']).length }, operator_action: 'the owner declares the site into the same draft', recovery: 'admitted', reconciliation: (a['analysis'] as Row)['bottleneck'] });
  });
});

describe('C2 · the Supply Chain Agent proposes to the twin\'s owner; it never admits a version or writes an element', () => {
  it('positive: its run drafts the bottleneck proposal with the numbers (and the single sources); its admit attempt refused and recorded; the owner accepts', async () => {
    await refused(registerAgent({ ...agentBase(), codeDigest: 'a'.repeat(64), budgets: { max_reads: 10, max_gateway_calls: 0, max_elapsed_ms: 60_000 } }), /registered with this runtime's scan/, 422);
    const reg = (await registerAgent({ ...agentBase(), budgets: { max_reads: 10, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions: [{ kind: 'max_items', value: 10 }] })).agent;
    expect(reg).toMatchObject({ kind: 'supply_chain', role: 'supply_chain_agent' });
    A1 = reg.agentId;
    await refused(runAgent(A1, { task: 'risk_assess' }), /./, 403);   // a supply_chain agent runs its own task only
    const r = (await runAgent(A1, { task: 'supply_scan' })).run;
    expect(r.outcome, String(r.stopReason)).toBe('finished');
    expect(arr(r.outputs['scanned']).map((s) => [s['twin_id'], s['version'], s['drafted'], s['complete']])).toEqual([[N, 1, 4, true], [P, 1, 3, true]]);
    expect(r.refusals.map((x) => x['action'])).toEqual(['twin.version.admit']);
    const open = await proposals(netOwner, N, 'proposed');
    expect(open).toHaveLength(4);
    const b = finding(open, 'bottleneck', 'bearing-maker.bearing')[0] as Row;
    expect(b).toMatchObject({ twin_version: 1, agent_id: A1, run_id: r.runId, drafted_by: reg.principalId,
      measure: { site: 'bearing-maker', tier: 2, material: 'bearing', capacity_per_day: 1800, unit: 'pcs/day', throughput_per_day: 450, throughput_unit: 'pcs/day', relieved_throughput_per_day: 1000, terminal: 'regensburg' } });
    expect(b['version_citation']).toMatchObject({ kind: 'twin', id: N, version: 1 });
    expect(String(b['rationale'])).toMatch(/Bearing maker \(Ningbo\) \(tier 2\) at 1800 pcs\/day of bearing bounds the network's throughput to NORDWERK Regensburg at 450 pcs\/day/);
    const drafted = await events(N, 'proposal.drafted');
    expect(drafted).toHaveLength(4);
    expect(drafted[0]).toMatchObject({ actor_principal_id: reg.principalId, details: { owner: netOwner.principalId, agent_id: A1 } });
    // the OWNER accepts the bottleneck finding
    const d = await decide(netOwner, String(b['proposal_id']), 'accepted', 'Qualify a second bearing source; raise the frame order.');
    expect(d.decision).toMatchObject({ state: 'accepted', finding_kind: 'bottleneck' });
    expect(await events(N, 'proposal.decided')).toHaveLength(1);
    // nothing of the twin was written by the agent: N is still at version 1, admitted by its owner
    expect((await sql<{ n: number }>`select count(*)::int n from twin.twin_versions where twin_id = ${N}::uuid`.execute(h.su)).rows[0]?.n).toBe(1);
    sixEvidence('C2+', { fault_trace: { refused: ['422 foreign digest', '403 wrong task', 'twin.version.admit (PDP, recorded on the run)'] }, watermark: { run: r.runId, agent: A1 },
      consumer_behaviour: { drafted: arr(r.outputs['drafted']).length }, operator_action: 'the executive triggers the scan; the owner accepts', recovery: 'none needed', reconciliation: b['measure'] });
  }, 180_000);

  it('refusal: the agent admitting/grounding (route and port), a person drafting (PDP and port), another owner deciding, a decided finding re-decided, a drifted agent', async () => {
    const agent = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: A1, tenantId: T, domainId: D, correlationId: uuidv7() })).principal;
    // THE ROUTE: its role holds no twin.version / twin.ground rule
    await refused(twins.admit(req(agent, 'twin.version.admit', 'TWN', N), T, D, N, '1', { payload: { allowIncomplete: true } }), /./, 403);
    await refused(twins.openVersion(req(agent, 'twin.version', 'TWN', N), T, D, N, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), carryFrom: 1, except: [] } }), /./, 403);
    await refused(twins.ground(req(agent, 'twin.ground', 'TWN', N), T, D, N, '1', { payload: { elements: [asEl(base)({ key: 'capacity:bearing-maker.bearing', value: 5000, unit: 'pcs/day' })] } }), /./, 403);
    // THE PORT, with the API bypassed: a context bound to the agent's own session AND the version action still refuses by principal kind
    const target = uuidv7();
    await refused(inCommitContext(h.fx.su as never, { sessionId: agent.sessionId, contextKey: agent.contextKey }, { tenantId: T, domainId: D }, 'twin.version', target, async (tx) =>
      sql`select twin.open_version(${N}::uuid, ${T}::uuid, ${D}::uuid, 'actual', null, ${new Date().toISOString()}::timestamptz, null, 1, ${[]}::text[], ${agent.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^twin write rejected \(agent\): principal .* is an agent; an agent proposes to the twin's owner and never declares, opens, grounds or admits a twin \(version\.opened refused\)$/, 403);
    expect((await sql<{ n: number }>`select count(*)::int n from twin.twin_versions where twin_id = ${N}::uuid`.execute(h.su)).rows[0]?.n).toBe(1);
    // A PERSON DRAFTING A FINDING: the PDP (no supply_chain_agent role) …
    const lastRun = String((await sql<{ id: string }>`select run_id::text id from executive.agent_runs where agent_id = ${A1}::uuid order by started_at desc limit 1`.execute(h.su)).rows[0]?.id);
    const fake = { finding_kind: 'bottleneck', subject: 'module-a.module', measure: { note: 'an owner writing a finding' }, rationale: 'an owner drafting as if an agent' };
    await refused(sn.draft(req(netOwner, 'twin.proposal.draft', 'TWN', N), T, D, { payload: { twinId: N, version: 1, agentId: A1, runId: lastRun, findings: [fake] } }), /./, 403);
    // … and the port, with the draft action bound to the person's own session: refused by principal kind
    await refused(inCommitContext(h.fx.su as never, { sessionId: netOwner.sessionId, contextKey: netOwner.contextKey }, { tenantId: T, domainId: D }, 'twin.proposal.draft', N, async (tx) =>
      sql`select twin.draft_agent_proposals(${T}::uuid, ${D}::uuid, ${N}::uuid, 1, ${JSON.stringify([fake])}::jsonb, false, ${A1}::uuid, ${lastRun}::uuid, ${netOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^twin proposal rejected \(not_agent\)/, 403);
    // … and the agent itself outside a running scan (its last run is closed)
    await refused(inCommitContext(h.fx.su as never, { sessionId: agent.sessionId, contextKey: agent.contextKey }, { tenantId: T, domainId: D }, 'twin.proposal.draft', N, async (tx) =>
      sql`select twin.draft_agent_proposals(${T}::uuid, ${D}::uuid, ${N}::uuid, 1, ${JSON.stringify([fake])}::jsonb, false, ${A1}::uuid, ${lastRun}::uuid, ${agent.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^twin proposal rejected \(run\)/, 403);
    expect(finding(await proposals(netOwner, N), 'bottleneck', 'module-a.module')).toHaveLength(0);
    // ANOTHER OWNER deciding N's finding; a decided finding decided again; a dismissal without its reason
    const open = await proposals(netOwner, N, 'proposed');
    const single = finding(open, 'single_source', 'module-b.bearing')[0] as Row;
    await refused(decide(otherOwner, String(single['proposal_id']), 'accepted'), /^twin proposal rejected \(ownership\)/, 403);
    const accepted = finding(await proposals(netOwner, N, 'accepted'), 'bottleneck', 'bearing-maker.bearing')[0] as Row;
    await refused(decide(netOwner, String(accepted['proposal_id']), 'dismissed', 'changed my mind about it'), /^twin proposal rejected \(state\)/, 409);
    await refused(decide(netOwner, String(single['proposal_id']), 'dismissed'), /states its reason/, 422);
    // A DRIFTED registration: its run is refused and recorded, never run under a stale identity
    await sql`update executive.agents set code_digest = ${'b'.repeat(64)} where agent_id = ${A1}::uuid`.execute(h.su);
    const r = (await runAgent(A1, { task: 'supply_scan' })).run;
    expect(r.outcome).toBe('refused');
    expect(String(r.stopReason)).toMatch(/^supply scan refused \(drift\)/);
    expect(r.escalatedTo).toBe(executive.principalId);
    expect((await sql<{ n: number }>`select count(*)::int n from twin.agent_scans where run_id = ${r.runId}::uuid`.execute(h.su)).rows[0]?.n).toBe(0);
    await sql`update executive.agents set code_digest = ${SUPPLY_CHAIN_AGENT_DIGEST} where agent_id = ${A1}::uuid`.execute(h.su);
    sixEvidence('C2-', { fault_trace: { refused: ['403 admit/open/ground at the route', '403 open_version at the port (agent boundary)', '403 person drafting (PDP)', '403 not_agent at the port',
      '403 closed run', '403 other owner', '409 decided', '422 no reason', 'the drifted run'] }, watermark: { run: r.runId }, consumer_behaviour: { versions_of_N: 1 },
      operator_action: 'none: refusals', recovery: 'the digest restored', reconciliation: { outcome: r.outcome } });
  }, 180_000);

  it('recovery: a dismissed finding re-proposed only when its measure changes; an interrupted run resumes after a restart and the backlog is drafted within max_items', async () => {
    // (a) DISMISSED, then NOT re-proposed while the measure stands (a version that changes something else)
    const single = finding(await proposals(netOwner, N, 'proposed'), 'single_source', 'module-b.bearing')[0] as Row;
    await decide(netOwner, String(single['proposal_id']), 'dismissed', 'Module maker B holds a six-week bearing buffer.');
    const v2 = await version(netOwner, N, [{ key: 'capacity:module-a.module', value: 650, unit: 'pcs/day' }], 1, ['capacity:module-a.module']);
    const r2 = (await runAgent(A1, { task: 'supply_scan' })).run;
    expect(r2.outcome, String(r2.stopReason)).toBe('finished');
    expect(arr(r2.outputs['scanned']).map((s) => [s['twin_id'], s['version'], s['drafted'], s['unchanged']])).toEqual([[N, v2, 0, 4]]);
    expect(finding(await proposals(netOwner, N), 'single_source', 'module-b.bearing').map((x) => x['state'])).toEqual(['dismissed']);
    // … and RE-PROPOSED once it changes (the bearing maker's capacity moves): the accepted bottleneck stays accepted, a new one is proposed
    const v3 = await version(netOwner, N, [{ key: 'capacity:bearing-maker.bearing', value: 2400, unit: 'pcs/day' }], v2, ['capacity:bearing-maker.bearing']);
    const r3 = (await runAgent(A1, { task: 'supply_scan' })).run;
    expect(arr(r3.outputs['scanned']).map((s) => [s['twin_id'], s['version'], s['drafted'], s['unchanged'], s['superseded']])).toEqual([[N, v3, 3, 1, 1]]);
    const all = await proposals(netOwner, N);
    expect(finding(all, 'bottleneck', 'bearing-maker.bearing').map((x) => [x['state'], (x['measure'] as Row)['capacity_per_day'], (x['measure'] as Row)['throughput_per_day']]).sort())
      .toEqual([['accepted', 1800, 450], ['proposed', 2400, 600]]);
    expect(finding(all, 'single_source', 'module-b.bearing').map((x) => x['state']).sort()).toEqual(['dismissed', 'proposed']);
    expect(finding(all, 'single_source', 'module-a.bearing').map((x) => x['state']).sort()).toEqual(['proposed', 'superseded']);
    expect(finding(all, 'single_source', 'bearing-maker.steel').map((x) => x['state'])).toEqual(['proposed']);

    // (b) THE BACKLOG within max_items, across an INTERRUPTION and a RESTART: two new networks (4 findings each); a fresh agent that reads
    //     at most 3 times a run and drafts at most 2 findings a run
    const Q1 = await declare(netOwner, 'NORDWERK — Cheb hub-module network');
    const Q2 = await declare(netOwner, 'NORDWERK — Győr hub-module network');
    await version(netOwner, Q1, threeTier());
    await version(netOwner, Q2, threeTier({ bearing: 1500 }));
    const A2 = (await registerAgent({ ...agentBase(), budgets: { max_reads: 3, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions: [{ kind: 'max_items', value: 2 }] })).agent.agentId;
    // run 1: the backlog, N and P read (nothing new on them) — the read of Q1 is refused by the budget: the run STOPS (escalated) midway
    const s1 = (await runAgent(A2, { task: 'supply_scan' })).run;
    expect(s1.outcome).toBe('stopped');
    expect(String(s1.stopReason)).toMatch(/^budget: read budget of 3 reached before twin /);
    expect(s1.escalatedTo).toBe(executive.principalId);
    const marks = async (agentId: string) => (await sql<{ twin_id: string; complete: boolean; drafted: number }>`select twin_id::text, complete, drafted from twin.agent_scans where agent_id = ${agentId}::uuid order by scanned_at`.execute(h.su)).rows;
    expect((await marks(A2)).map((m) => [m.twin_id, m.complete, m.drafted])).toEqual([[N, true, 0], [P, true, 0]]);
    // THE RESTART: the next runs from a second application context over the same database — the backlog lives in the database
    let fresh: INestApplicationContext | null = null;
    const perRun: number[] = [];
    try {
      const { AppModule } = await import('../../src/app.module.js');
      const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
      fresh = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const e2 = fresh.get(Ec);
      for (let i = 0; i < 5; i += 1) {
        const s = (await runAgent(A2, { task: 'supply_scan' }, e2)).run;
        expect(s.outcome, String(s.stopReason)).toBe('finished');
        perRun.push(arr(s.outputs['drafted']).length);
        if (arr(s.outputs['scanned']).length === 0 && Number(s.outputs['backlog']) === 0) break;
      }
    } finally { await fresh?.close(); }
    expect(perRun).toEqual([2, 2, 2, 2, 0]);
    for (const q of [Q1, Q2]) {
      const rows = await proposals(netOwner, q);
      expect(rows).toHaveLength(4);                                           // every finding once, nothing twice
      expect(new Set(rows.map((x) => `${String(x['finding_kind'])}:${String(x['subject'])}`)).size).toBe(4);
    }
    expect(finding(await proposals(netOwner, Q2), 'bottleneck', 'bearing-maker.bearing')[0]?.['measure']).toMatchObject({ capacity_per_day: 1500, throughput_per_day: 375 });
    expect((await marks(A2)).filter((m) => m.complete).map((m) => m.twin_id)).toEqual([N, P, Q1, Q2]);
    sixEvidence('C2', { fault_trace: { refused: ['the read budget stops run 1 midway'] }, watermark: { agent: A2, runs: perRun.length + 1 },
      consumer_behaviour: { drafted_per_run: perRun, re_proposed: 'module-b.bearing after the bearing capacity moved' },
      operator_action: 'the owner dismisses, then admits two versions; the executive re-triggers the scan', recovery: 'resumed from the backlog after a restart',
      reconciliation: { Q1: 4, Q2: 4 } });
  }, 300_000);
});
