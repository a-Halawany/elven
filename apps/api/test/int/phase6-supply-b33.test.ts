/**
 * CP-6 B33 §SC (migration 0111 §SC) — SUPPLY-CHAIN INTELLIGENCE (F-P4-14; F-P5-01's AI-53-003, V01-T-024 alternatives, AG-026), on a real
 * database through the real routes, ports and the Supply Chain Agent's real scan, with named humans and the agent holding sessions of their own
 * (the ports compare the acting principal). Every figure is SYNTHETIC — the network, the line, the records (Nordbearing AB is the synthetic
 * spec's SYN-SUP-SE; the Shenzhen maker does not exist). This is a SOFTWARE proof: no licensed trade/customs source, no real provider (R2 holds
 * AT-30's signed acceptance record).
 *
 *   SC1 · THE NETWORK'S UNCERTAINTY — the kind gains inventory:/obligation:; the scene network with country, ownership, contract, provenance,
 *         via and lead days admits; the workspace's uncertainty names what is unknown and the unsourced vendor input. Refused: malformed optional
 *         fields at admission, an inventory in a per-day unit at grounding. Recovered: corrected in the same draft.
 *   SC2 · HIDDEN-TIER INFERENCE, VALIDATED AND APPLIED — the owner names a record source; the agent's scan reads its evidence (custody) and drafts
 *         the hidden tier-2 Shenzhen supplier behind Nordbearing (`supply.dependency` routed to the analysts); a named analyst validates it
 *         (reason, digest, expiry); the owner applies it (open / ground / admit, each its own write) → provenance validated. Refused: a person
 *         drafting, the agent validating, the scan's requester validating, a stale digest, a sensitive validation without reason, an isolated
 *         (identity-conflict) inference, another owner applying, an expired validation. Recovered: re-validation; a revoked inference reverted.
 *   AG-026 · THE SCHEDULE AND THE RACE — the after-tick hook starts the scan only when work is pending, never waits past its bound, one in flight;
 *         two concurrent scans of one network draft each finding once (the advisory lock); the duplicate answered 409 in the family's words.
 *   SC3 · THE DISRUPTION MAP — opened from an admitted corridor change; the Red Sea derates Ningbo's and Shenzhen's routes; Regensburg 450 → 112.5,
 *         line SYN-LINE-A1's cover 17.78 days; `supply.disruption` routed; the map REPLAYED on its pinned versions to the same digest; the agent
 *         proposes (confirmed by a person) and re-maps a moved network. Refused: an unknown signal, a duplicate footprint, a stale pin, mapping a
 *         proposed disruption, the agent outside its run. Recovered: confirmed, re-mapped.
 *   SC4 · ALTERNATIVES ON SCENARIO BRANCHES — the Cape reroute and the Moravian dual source FEASIBLE, the safety-stock draw-down INFEASIBLE
 *         (constrained); constraint engine and cost recorded. Refused: a branch not alt-<key>, an older map, the agent evaluating. Recovered: a
 *         tightened rule makes the reroute infeasible, restored it is feasible again (the evaluation superseded).
 *   SC5 · THE CONTINUITY CONTRACT (AT-30's fault exercise) — the line twin stale: the map flagged, every option INDETERMINATE, "no feasible
 *         alternative" routed; an inferred-unvalidated site excluded, an identity conflict isolated (an item); recovered: a fresh line version,
 *         re-mapped, re-evaluated → feasible, the item closed — visible state, audit (the supply ledger) and recovery closure.
 *   SC7 · THE FIXTURES — unauthorized role, cross-tenant, correction, replay, source reconciliation (the inference's evidence re-read by digest).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { ConstraintsController } from '../../src/twin/constraints/constraints.controller.js';
import type { BranchesController } from '../../src/twin/branches/branches.controller.js';
import type { SupplyIntelController } from '../../src/twin/supply-intel/supply-intel.controller.js';
import { SupplyIntelService } from '../../src/twin/supply-intel/supply-intel.service.js';
import { SupplyIntelCapability } from '../../src/twin/supply-intel/supply-intel.capabilities.js';
import { DecisionAgentSessionService } from '../../src/executive/agents/agent-session.service.js';
import { SUPPLY_CHAIN_AGENT_DIGEST, SUPPLY_CHAIN_AGENT_VERSION } from '../../src/executive/agents/supply-chain-agent.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { cite } from './phase5-fixtures.js';
import { CONFLICT_RECORDS, OPTIONS, SEA_RED_SEA, SHENZHEN_RECORDS, regensburgLine, sceneNetwork } from '../unit/phase6-supply-b33.fixtures.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b33-sc-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number };
type El = { key: string; value: unknown; unit: string | null };
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
const RUN = uuidv7().slice(-6);

let h: Phase4Harness; let T: string; let D: string; let U: string; let DU: string;
let twins: TwinController; let comp: CompositionController; let exec: ExecutiveController; let cons: ConstraintsController; let br: BranchesController;
let api: SupplyIntelController; let svc: SupplyIntelService;
let netOwner: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let lineOwner: AuthenticatedPrincipal; let corridorOwner: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let requester: AuthenticatedPrincipal; let riskOwner: AuthenticatedPrincipal;
let executive: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let strategist: AuthenticatedPrincipal; let attention: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal;
let entityId: string; let base: Evd; let shenzhenEv: Evd & { digest: string }; let SRC: string; let SRC2: string;
/** N: the scene network; P: the Regensburg line (process twin); C: the corridor (telemetry, cost); N2: the identity-conflict network. */
let N: string; let P: string; let C: string; let N2: string; let A: string;
let INF: string; let DIS: string; let N3: string; let ID3: string; let PROPOSED: string | null = null;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const evidence = (caseName: string, e: Row): void => console.log(`B33-SC EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

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
async function person(label: string, roles: string[], scope: Scope = 'DOMAIN', t: string = T, d: string | null = D): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'human', ${scope}, ${t}::uuid, ${d}::uuid, ${`b33sc-${label}-${RUN} (SYNTHETIC)`}, ${`b33sc-${label.slice(0, 8)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r, scope: (r === 'tenant_admin' ? 'TENANT' : 'DOMAIN') as Scope, tenantId: t, domainId: r === 'tenant_admin' ? null : d }));
  for (const b of bindings) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: 'human', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}
const req = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(p, action, type, id, 'twin');
const ureq = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => ({ eyeEnvelope: { ...h.env(p, action, type, id, 'twin'), tenant_id: U, domain_id: DU }, eyePrincipal: p }) as never;
const dbDay = async (offset = 0) => String((await one(sql`select to_char((clock_timestamp() at time zone 'UTC')::date + ${offset}::int, 'YYYY-MM-DD') as d`))['d']);

// ── the twin's own routes (the owner's acts) ───────────────────────────────────────────────────
const asEl = (e: El, ev: Evd = base) => ({ key: e.key, kind: 'assumed', value: e.value, unit: e.unit, citations: [cite(ev)] });
async function declare(owner: AuthenticatedPrincipal, title: string, kind = 'supply-network'): Promise<string> {
  const d = await twins.declare(req(owner, 'twin.declare', 'TWN', null), T, D, { payload: { kind, title, statement: `${title} (B33 supply harness, SYNTHETIC)`,
    boundary: [entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  return d.twin.twinId;
}
async function openDraft(owner: AuthenticatedPrincipal, twinId: string, o: { carryFrom?: number | null; except?: string[]; branchId?: string; forkedFromVersion?: number | null; observedThrough?: string | null } = {}): Promise<number> {
  const r = await twins.openVersion(req(owner, 'twin.version', 'TWN', twinId), T, D, twinId, { payload: { branchId: o.branchId ?? 'actual', knownAt: new Date().toISOString(), carryFrom: o.carryFrom ?? null,
    except: o.except ?? [], forkedFromVersion: o.forkedFromVersion ?? null, observedThrough: o.observedThrough ?? null } }) as { version: { version: number } };
  return r.version.version;
}
const ground = (owner: AuthenticatedPrincipal, twinId: string, v: number, elements: El[]) =>
  twins.ground(req(owner, 'twin.ground', 'TWN', twinId), T, D, twinId, String(v), { payload: { elements: elements.map((e) => asEl(e)) } });
const admit = (owner: AuthenticatedPrincipal, twinId: string, v: number) =>
  twins.admit(req(owner, 'twin.version.admit', 'TWN', twinId), T, D, twinId, String(v), { payload: { allowIncomplete: true } }) as Promise<{ admitted: Row }>;
async function version(owner: AuthenticatedPrincipal, twinId: string, elements: El[], o: Parameters<typeof openDraft>[2] = {}): Promise<number> {
  const v = await openDraft(owner, twinId, o);
  await ground(owner, twinId, v, elements);
  await admit(owner, twinId, v);
  return v;
}
const head = async (twinId: string, branch = 'actual') => Number((await one(sql`select max(version)::int v from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = ${branch} and state = 'admitted'`))['v']);
const elementsOf = async (twinId: string, v: number) => (await rows(sql`select key, value, unit from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v} order by key`)) as unknown as El[];
/** A scenario branch alt-<key> of a network: forked from its head, the option's elements changed (each the owner's own governed write). */
async function branch(key: string, change: (els: El[]) => El[]): Promise<number> {
  const h0 = await head(N);
  const els = await elementsOf(N, h0);
  const next = change(els.map((e) => ({ key: String(e.key), value: e.value, unit: (e.unit as string | null) ?? null })));
  const before = new Map(els.map((e) => [e.key, JSON.stringify([e.value, e.unit])]));
  const changed = next.filter((e) => before.get(e.key) !== JSON.stringify([e.value, e.unit]));
  const v = await openDraft(netOwner, N, { branchId: `alt-${key}`, forkedFromVersion: h0, carryFrom: h0, except: changed.filter((e) => before.has(e.key)).map((e) => e.key) });
  if (changed.length > 0) await ground(netOwner, N, v, changed);
  await admit(netOwner, N, v);
  return v;
}

// ── §SC routes ─────────────────────────────────────────────────────────────────────────────────
const network = async (p: AuthenticatedPrincipal, twinId: string) => ((await api.network(req(p, 'twin.supply.read', 'TWN', twinId), T, D, twinId, { payload: {} })) as { network: Row }).network;
const declareSource = (p: AuthenticatedPrincipal, twinId: string, sourceKey: string, extra: Row = {}) =>
  api.declareRecordSource(req(p, 'twin.supply.records.declare', 'TWN', twinId), T, D, { payload: { twinId, sourceKey, ...extra } }) as Promise<{ recordSource: Row }>;
const inferences = async (p: AuthenticatedPrincipal, twinId: string, state?: string) =>
  ((await api.listInferences(req(p, 'twin.supply.read', 'TWS', null), T, D, { payload: { twinId, ...(state === undefined ? {} : { state }) } })) as { inferences: Row[] }).inferences;
const readInference = async (p: AuthenticatedPrincipal, id: string) => ((await api.readInference(req(p, 'twin.supply.read', 'TWS', id), T, D, id)) as { inference: Row }).inference;
const decide = (p: AuthenticatedPrincipal, id: string, payload: Row) => api.decide(req(p, 'twin.supply.inference.validate', 'TWS', id), T, D, id, { payload }) as Promise<{ decision: Row }>;
/* the fixture network's behaviour model (supply-flow@1) names inputs a structure-only network does not carry: the owner admits it as incomplete, as B29's harness does */
const applyInf = (p: AuthenticatedPrincipal, id: string, payload: Row = {}) => api.apply(req(p, 'twin.supply.inference.apply', 'TWS', id), T, D, id, { payload: { allowIncomplete: true, ...payload } }) as Promise<Row>;
const revert = (p: AuthenticatedPrincipal, id: string) => api.revert(req(p, 'twin.supply.inference.apply', 'TWS', id), T, D, id, { payload: { allowIncomplete: true } }) as Promise<Row>;
const openDis = (p: AuthenticatedPrincipal, payload: Row) => api.open(req(p, 'twin.supply.disruption.open', 'TWS', null), T, D, { payload }) as Promise<{ disruption: Row }>;
const mapDis = (p: AuthenticatedPrincipal, id: string) => api.map(req(p, 'twin.supply.disruption.map', 'TWS', id), T, D, id) as Promise<{ map: Row; result: Row; pinned: Row[] }>;
const readDis = async (p: AuthenticatedPrincipal, id: string) => ((await api.readDisruption(req(p, 'twin.supply.read', 'TWS', id), T, D, id)) as { disruption: Row }).disruption;
const replay = async (p: AuthenticatedPrincipal, id: string, mapNo?: number) => ((await api.replay(req(p, 'twin.supply.read', 'TWS', id), T, D, id, { payload: mapNo === undefined ? {} : { mapNo } })) as { replay: Row }).replay;
const evaluate = (p: AuthenticatedPrincipal, id: string, payload: Row) => api.evaluate(req(p, 'twin.supply.alternative.evaluate', 'TWS', id), T, D, id, { payload }) as Promise<{ alternative: Row; evaluation: Row }>;
const registerAgent = (payload: Row) => exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload }) as Promise<{ agent: { agentId: string; principalId: string } }>;
const runAgent = (agentId: string, by: AuthenticatedPrincipal = executive) =>
  exec.runAgent(h.req(by, 'agent.trigger', 'AGT', agentId, 'twin'), T, D, agentId, { payload: { task: 'supply_scan' } as never }) as unknown as Promise<{ run: { runId: string; outcome: string; stopReason: string | null; refusals: Row[]; outputs: Row } }>;
const items = async (subject: string) => rows(sql`select signal_class, subject_kind, state, owner_principal_id::text owner, route_roles, title, cause_event_type, policy_version
                                                    from executive.attention_items where subject_id = ${subject}::uuid order by created_at, item_id`);
const ledger = async (subject: string) => (await rows(sql`select event from twin.supply_events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));
const supplyOf = (r: { outputs: Row }) => (r.outputs['supply'] ?? {}) as Row;

const POLICY = {
  classes: {
    'supply.dependency': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_analyst'], ack_within_minutes: 480, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    'supply.disruption': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['risk_owner', 'twin_owner'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
  },
  overload: { max_open_per_role: 50 },
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { ConstraintsController: Kc } = await import('../../src/twin/constraints/constraints.controller.js');
  const { BranchesController: Bc } = await import('../../src/twin/branches/branches.controller.js');
  const { SupplyIntelController: Sc } = await import('../../src/twin/supply-intel/supply-intel.controller.js');
  twins = h.app.get(Tc); comp = h.app.get(Cc); exec = h.app.get(Ec); cons = h.app.get(Kc); br = h.app.get(Bc); api = h.app.get(Sc); svc = h.app.get(SupplyIntelService);
  netOwner = await person('t-nakamura', ['twin_owner']);
  otherOwner = await person('other-owner', ['twin_owner']);
  lineOwner = await person('e-kovacs', ['twin_owner']);
  corridorOwner = await person('corridor-owner', ['twin_owner']);
  analyst = await person('a-hoffmann', ['domain_analyst']);
  analyst2 = await person('h-weber', ['domain_analyst']);
  requester = await person('analyst-exec', ['domain_analyst', 'executive']);
  riskOwner = await person('c-brenner', ['risk_owner', 'decision_owner']);
  executive = await person('executive', ['executive']);
  tenantAdmin = await person('tenant-admin', ['tenant_admin'], 'TENANT', T, null);
  dadmin = await person('t-richter', ['domain_admin']);
  steward = await person('s-lindqvist', ['constraint_steward']);
  strategist = await person('strategist', ['strategy_owner']);
  attention = await person('attention', ['attention_agent']);
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b33sc-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b33sc-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await person('foreign', ['domain_admin', 'risk_owner', 'twin_owner'], 'DOMAIN', U, DU);
  entityId = uuidv7(); const corr = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'organization', 'NORDWERK Regensburg', 'nordwerk regensburg', 'active', ${netOwner.principalId}::uuid, ${corr}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${entityId}::uuid, 'entity.created', ${netOwner.principalId}::uuid,
            ${JSON.stringify({ entity_type: 'organization', canonical_name: 'NORDWERK Regensburg', normalized_name: 'nordwerk regensburg', split_from: null })}::jsonb, ${corr}::uuid)`.execute(h.su);
  base = (await h.upload([{ filename: 'b33-sc-network.csv', text: 'synthetic,record_id,key,value,unit\ntrue,SYN-NET-B33,capacity:nordbearing.bearing,2400,pcs/day\n' }]))[0] as Evd;
  // THE RECORDS: a separate upload source per record set (the owner names it as the network's record source)
  const up = (await h.upload([{ filename: 'b33-sc-shenzhen-records.csv', text: SHENZHEN_RECORDS }], 'internal', 'records'))[0] as Evd & { digest: string };
  shenzhenEv = up;
  const key = async (label: string) => String((await one(sql`select s.source_key from observation.source_contracts_current s where s.source_id = ${await h.uploadSource('internal', label)}::uuid`))['source_key']);
  SRC = await key('records');
  await h.upload([{ filename: 'b33-sc-conflict-records.csv', text: CONFLICT_RECORDS }], 'internal', 'conflict');
  SRC2 = await key('conflict');
  // the published attention policy (T. Richter): the analysts get supply.dependency, the risk and twin owners supply.disruption
  await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T, D,
    { payload: { rules: POLICY, reason: 'B33 supply harness: dependencies to the analysts, disruptions to the risk and twin owners (SYNTHETIC)' } as never });
}, 600_000);

afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('SC1 · the supply network\'s objects, provenance and uncertainty (PR-30-002, AI-53-003)', () => {
  it('positive: the kind gains inventory and obligation; the scene network admits with its optional fields; the uncertainty names the unknown and the unsourced', async () => {
    const kinds = ((await comp.listKinds(req(netOwner, 'twin.read', 'TWN', null), T, D)) as { kinds: Row[] }).kinds;
    expect(Object.keys(kinds.find((k) => k['kind'] === 'supply-network')?.['element_schema'] as Row).sort()).toEqual(['capacity', 'inventory', 'material', 'obligation', 'route', 'site', 'tier']);
    N = await declare(netOwner, 'NORDWERK — Regensburg hub-module network with Nordbearing (3 tiers)');
    expect(await version(netOwner, N, sceneNetwork())).toBe(1);
    const v = await network(analyst, N);
    expect(v).toMatchObject({ version: 1, family: 'supply-network', analysis: { terminal: 'regensburg', throughput_per_day: 450 },
      uncertainty: { coverage: { sites: 5, declared: 5, validated: 0, inferred: 0 }, unsourced: [{ site: 'nordbearing', tier: 1, material: 'bearing-blank' }] } });
    const sites = (v['uncertainty'] as Row)['sites'] as Row[];
    expect(sites.find((s) => s['id'] === 'module-b')?.['unknown']).toEqual(['parent', 'country', 'contract', 'geo_confidence']);
    expect(sites.find((s) => s['id'] === 'nordbearing')).toMatchObject({ country: 'SE', contract: { ref: 'SYN-CTR-0042', until: '2027-12-31' }, unknown: [] });
    evidence('SC1+', { twin: N, version: 1, uncertainty: v['uncertainty'] });
  });

  it('refusal: a malformed country refused at ADMISSION (the family validator); an inventory counted per day refused at GROUNDING (the schema)', async () => {
    const v2 = await openDraft(netOwner, N, { carryFrom: 1, except: ['site:module-b'] });
    await ground(netOwner, N, v2, [{ key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 }, country: 'Czechia' }, unit: null }]);
    await refused(admit(netOwner, N, v2), /^family validation refused \(supply-network\): site:module-b: country is an ISO 3166 alpha-2 code/, 422);
    await refused(ground(netOwner, N, v2, [{ key: 'inventory:module-b.bearing', value: 800, unit: 'pcs/day' }]),
      /inventory:module-b\.bearing: unit pcs\/day — the kind declares a unit of the form/, 422);
    expect((await one(sql`select state from twin.twin_versions where twin_id = ${N}::uuid and version = ${v2}`))['state']).toBe('draft');
  });

  it('recovery: the owner withdraws the wrong draft and admits the corrected site; v1 elements validate unchanged', async () => {
    const v2 = Number((await one(sql`select version v from twin.twin_versions where twin_id = ${N}::uuid and state = 'draft'`))['v']);
    await twins.withdraw(req(netOwner, 'twin.version.withdraw', 'TWN', N), T, D, N, String(v2), { payload: { reason: 'the country is an ISO code: CZ' } });
    const v3 = await version(netOwner, N, [{ key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 }, country: 'CZ' }, unit: null }], { carryFrom: 1, except: ['site:module-b'] });
    const v = await network(analyst, N);
    expect(v['version']).toBe(v3);
    expect(((v['uncertainty'] as Row)['sites'] as Row[]).find((s) => s['id'] === 'module-b')?.['unknown']).toEqual(['parent', 'contract', 'geo_confidence']);
  });
});

describe('SC2 · hidden-tier inference: the agent infers, a named analyst validates, the owner applies (PR-30-003, CAP-FW-07, JRN-11 map)', () => {
  it('positive: the scan reads the records (custody), drafts the hidden tier-2 Shenzhen supplier; A. Hoffmann validates it; T. Nakamura applies it', async () => {
    // the line twin and its link from the network (E. Kovács, the downstream owner, declares it), the corridor twin (telemetry and cost)
    P = await declare(lineOwner, 'Regensburg plant — assembly line (process twin)', 'process');
    await version(lineOwner, P, regensburgLine());
    await comp.publishContract(req(netOwner, 'twin.contract.publish', 'TWN', N), T, D, N,
      { payload: { exposed: { 'capacity:regensburg.module': { unit: 'units/day', cadence: 'on-admission' } }, approvedUses: { methodFamilies: ['discrete-event'], decisionClasses: ['capacity-planning'] } } });
    await comp.declareLink(req(lineOwner, 'twin.link.declare', 'TWN', P), T, D, { payload: { upstreamTwinId: N, downstreamTwinId: P, mapping: [{ from: 'capacity:regensburg.module', to: 'supply.capacity_per_day' }], use: 'capacity-planning' } });
    C = await declare(corridorOwner, 'Ningbo → Regensburg corridor (telemetry)', 'supply-chain');
    await version(corridorOwner, C, [{ key: 'corridor.capacity_share', value: 0.62, unit: 'ratio' }, { key: 'terms.reroute_cost_per_container', value: 1850, unit: 'EUR/container' }]);
    // the owner names the record source; the agent registered with THIS runtime's digest
    const rs = (await declareSource(netOwner, N, SRC, { note: 'inbound shipping and customs records (SYNTHETIC)' })).recordSource;
    expect(rs).toMatchObject({ state: 'live', source_key: SRC });
    A = (await registerAgent({ kind: 'supply_chain', version: SUPPLY_CHAIN_AGENT_VERSION, codeDigest: SUPPLY_CHAIN_AGENT_DIGEST, ownerPrincipalId: netOwner.principalId,
      escalationPrincipalId: executive.principalId, budgets: { max_reads: 60, max_gateway_calls: 0, max_elapsed_ms: 300_000 }, stopConditions: [{ kind: 'max_items', value: 20 }] })).agent.agentId;
    const r = (await runAgent(A)).run;
    expect(r.outcome, String(r.stopReason)).toBe('finished');
    const inf = arr(supplyOf(r)['inference']).find((x) => x['twin_id'] === N) as Row;
    expect(inf).toMatchObject({ read: 1 });
    expect(arr(inf['drafted'])).toHaveLength(1);
    const [i] = await inferences(analyst, N, 'proposed');
    INF = String(i?.['inference_id']);
    expect(i).toMatchObject({ behind_site: 'nordbearing', material: 'bearing-blank', proposed_site: 'shenzhen-bearing-blank', confidence: '0.875', sensitive: true, isolated: false,
      proposed_value: { tier: 2, name: 'Shenzhen precision bearing maker (SYNTHETIC)', country: 'CN', city: 'Shenzhen', provenance: { basis: 'inferred' } }, observed_flow_per_day: '3000' });
    expect(i?.['evidence']).toEqual([{ kind: 'evidence', id: shenzhenEv.id, version: shenzhenEv.version, digest: shenzhenEv.digest }]);
    // the read in custody, its digest the canonical one (source reconciliation)
    const read = await one(sql`select evidence_digest, recognised, jsonb_array_length(records)::int n from twin.supply_record_reads where twin_id = ${N}::uuid`);
    expect(read).toMatchObject({ evidence_digest: shenzhenEv.digest, recognised: true, n: 3 });
    // routed to the domain analysts under the published policy
    expect(await items(INF)).toEqual([expect.objectContaining({ signal_class: 'supply.dependency', subject_kind: 'supply_inference', state: 'open', route_roles: ['domain_analyst'], policy_version: 1 })]);
    // A. HOFFMANN validates: the reason, the proposal's digest, an expiry
    const full = await readInference(analyst, INF);
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const v = (await decide(analyst, INF, { decision: 'validated', reason: 'Three shipment and customs records agree; Nordbearing confirms the blank source by phone (SYNTHETIC).', digest: full['proposal_digest'], validUntil: until })).decision;
    expect(v).toMatchObject({ state: 'validated' });
    expect((await items(INF)).map((x) => [x['state'], x['owner']])).toEqual([['closed', null], ['open', netOwner.principalId]]);
    // T. NAKAMURA applies: open / ground / admit (each its own governed write) and the record
    const before = await head(N);
    const a = await applyInf(netOwner, INF, { leadDays: 32 });
    expect(a['capacity']).toMatchObject({ value: 3000, unit: 'pcs/day', basis: expect.stringMatching(/observed flow — a lower bound/) });
    expect(a['applied']).toMatchObject({ state: 'applied', version: before + 1 });
    const site = await one(sql`select value, citations from twin.state_elements where twin_id = ${N}::uuid and version = ${before + 1} and key = 'site:shenzhen-bearing-blank'`);
    expect(site['value']).toMatchObject({ tier: 2, provenance: { basis: 'validated', inference_id: INF } });
    expect(arr(site['citations'])[0]).toMatchObject({ kind: 'evidence', id: shenzhenEv.id });
    const nv = await network(analyst, N);
    expect(nv['uncertainty']).toMatchObject({ coverage: { sites: 6, declared: 5, validated: 1, inferred: 0 }, unsourced: [] });
    expect((await items(INF)).map((x) => x['state'])).toEqual(['closed', 'closed']);
    expect(await ledger(INF)).toEqual(['inference.drafted', 'inference.validated', 'inference.applied']);
    evidence('SC2+', { inference: INF, run: r.runId, applied_version: before + 1, ledger: await ledger(INF) });
  }, 300_000);

  it('refusal: a person drafting, the agent validating, the scan\'s requester validating, a stale digest, no reason on a sensitive relationship, an isolated inference, another owner applying', async () => {
    // a second network for the identity conflict (its record source names a declared site as the shipper)
    N2 = await declare(netOwner, 'NORDWERK — Brno hub-module network (identity probe)');
    await version(netOwner, N2, sceneNetwork({ extra: [{ key: 'site:steel-mill', value: { tier: 3, name: 'Steel mill', bom: {}, provenance: { basis: 'inferred', inference_id: uuidv7() } }, unit: null }] }));
    await declareSource(netOwner, N2, SRC2);
    // THE SCAN'S REQUESTER (a domain analyst who also triggered the scan)
    const r = (await runAgent(A, requester)).run;
    expect(r.outcome, String(r.stopReason)).toBe('finished');
    const [iso] = await inferences(analyst, N2, 'proposed');
    expect(iso).toMatchObject({ isolated: true, conflict: { site: 'bearing-maker' } });
    expect((await items(String(iso?.['inference_id'])))[0]).toMatchObject({ state: 'open', title: expect.stringMatching(/ISOLATED \(identity conflict\)/) });
    const isoFull = await readInference(analyst, String(iso?.['inference_id']));
    await refused(decide(requester, String(iso?.['inference_id']), { decision: 'validated', reason: 'I asked for it and I validate it', digest: isoFull['proposal_digest'], validUntil: new Date(Date.now() + 86_400_000).toISOString() }),
      /^supply inference rejected \(separation_of_duties\)/, 403);
    await refused(decide(analyst, String(iso?.['inference_id']), { decision: 'validated', reason: 'validated without reading the conflict', digest: isoFull['proposal_digest'], validUntil: new Date(Date.now() + 86_400_000).toISOString() }),
      /^supply inference rejected \(isolated\)/, 422);
    // A PERSON DRAFTING (the PDP: no supply_chain_agent role)
    await refused(api.draft(req(netOwner, 'twin.supply.inference.draft', 'TWN', N), T, D, { payload: { twinId: N, version: 1, agentId: A, runId: r.runId, inferences: [] } }), /./, 403);
    // THE AGENT VALIDATING (the PDP: the human gate, no domain_analyst role) — and outside a run at the port
    const agent = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: A, tenantId: T, domainId: D, correlationId: uuidv7() })).principal;
    await refused(decide(agent, INF, { decision: 'rejected', reason: 'the agent second-guessing the analyst' }), /./, 403);
    await refused(inCommitContext(h.fx.su as never, { sessionId: agent.sessionId, contextKey: agent.contextKey }, { tenantId: T, domainId: D }, 'twin.supply.inference.draft', N, async (tx) =>
      sql`select twin.tsc_draft_inferences(${T}::uuid, ${D}::uuid, ${N}::uuid, 1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${A}::uuid, ${r.runId}::uuid, ${agent.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^supply inference rejected \(authority\): run .* is not this agent's running supply scan/, 403);
    // an UNAUTHORIZED ROLE (a strategy owner) validating: the PDP
    await refused(decide(strategist, INF, { decision: 'rejected', reason: 'not my decision to make here' }), /./, 403);
    // a STALE digest; a sensitive relationship without reason / without expiry — on a fresh proposal (the anonymous probe below)
    N3 = await declare(netOwner, 'NORDWERK — Győr hub-module network (digest probe)');
    await version(netOwner, N3, sceneNetwork());
    await declareSource(netOwner, N3, SRC);
    expect((await runAgent(A)).run.outcome).toBe('finished');
    const [p3] = await inferences(analyst, N3, 'proposed');
    const id3 = String(p3?.['inference_id']); ID3 = id3;
    await refused(decide(analyst, id3, { decision: 'validated', reason: 'agreeing records (SYNTHETIC)', digest: 'f'.repeat(64), validUntil: new Date(Date.now() + 86_400_000).toISOString() }),
      /^supply inference rejected \(stale\): the validation quotes digest ffffffffffff/, 409);
    await refused(decide(analyst, id3, { decision: 'validated', digest: p3?.['proposal_digest'], validUntil: new Date(Date.now() + 86_400_000).toISOString() }), /^supply inference rejected \(sensitive\)/, 422);
    await refused(decide(analyst, id3, { decision: 'validated', reason: 'agreeing records (SYNTHETIC)', digest: p3?.['proposal_digest'] }), /^supply inference rejected \(sensitive\): a sensitive relationship is validated until a stated expiry/, 422);
    // ANOTHER OWNER applying; APPLYING before validation
    await refused(applyInf(netOwner, id3), /^supply inference rejected \(state\): inference .* is proposed; only a validated inference is applied/, 409);
    // validated until ten seconds past the database's instant (the recovery lets it lapse)
    const soon = String((await one(sql`select to_char((clock_timestamp() + interval '10 seconds') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') t`))['t']);
    await decide(analyst2, id3, { decision: 'validated', reason: 'Agreeing shipment and customs records (SYNTHETIC).', digest: p3?.['proposal_digest'], validUntil: soon });
    await refused(api.record(req(otherOwner, 'twin.supply.inference.apply', 'TWS', id3), T, D, id3, { payload: { mode: 'apply', version: await head(N3) } }), /^supply inference rejected \(ownership\)/, 403);
    // the record of an application the version does not carry
    await refused(api.record(req(netOwner, 'twin.supply.inference.apply', 'TWS', id3), T, D, id3, { payload: { mode: 'apply', version: await head(N3) } }), /^supply inference rejected \(application\)/, 422);
    // a record source by another owner
    await refused(declareSource(otherOwner, N3, SRC2), /^supply inference rejected \(ownership\)/, 403);
    evidence('SC2-', { isolated: iso?.['inference_id'], probe: id3, refusals: 13 });
  }, 300_000);

  it('recovery: an EXPIRED validation refuses the application (409) until a named analyst validates again; the probe applied', async () => {
    const id3 = ID3;
    // wait until the validation has lapsed by the database's instant
    for (let i = 0; i < 40; i += 1) {
      if ((await one(sql`select (valid_until <= clock_timestamp()) as lapsed from twin.supply_inferences where inference_id = ${id3}::uuid`))['lapsed'] === true) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await refused(applyInf(netOwner, id3), /^supply inference rejected \(stale\): the validation of inference .* expired at/, 409);
    const fresh = await readInference(analyst, id3);
    const renewed = (await decide(analyst, id3, { decision: 'validated', reason: 'Re-read the records: still agreeing (SYNTHETIC).', digest: fresh['proposal_digest'], validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString() })).decision;
    expect(renewed).toMatchObject({ state: 'validated' });
    const a = await applyInf(netOwner, id3, { capacityPerDay: 2500, leadDays: 32 });
    expect(a['applied']).toMatchObject({ state: 'applied' });
    expect(a['capacity']).toMatchObject({ value: 2500, basis: 'stated by the twin\'s owner' });
    expect(await ledger(id3)).toEqual(['inference.drafted', 'inference.validated', 'inference.validated', 'inference.applied']);
  }, 120_000);
});

describe('AG-026 · the schedule (started, never awaited past its bound; one in flight) and the race', () => {
  it('positive: the hook starts the scan only when work is pending; a second tick while it runs starts nothing; nothing pending → no run', async () => {
    // pending: a new version of N (the backlog)
    await version(netOwner, N, [{ key: 'capacity:regensburg.module', value: 1100, unit: 'pcs/day' }], { carryFrom: await head(N), except: ['capacity:regensburg.module'] });
    svc.scanAwaitMs = 1;
    const runsBefore = Number((await one(sql`select count(*)::int n from executive.agent_runs where agent_id = ${A}::uuid`))['n']);
    const t1 = await svc.afterTick({ principal: attention, tenantId: T, domainId: D, correlationId: uuidv7() });
    expect(t1).toMatchObject({ agents: 1 });
    expect(Number((t1['pending'] as Row)['backlog'])).toBeGreaterThanOrEqual(1);
    const s1 = t1['scan'] as Row;
    expect(s1, JSON.stringify(t1)).not.toBeNull();
    const t2 = await svc.afterTick({ principal: attention, tenantId: T, domainId: D, correlationId: uuidv7() });
    expect(s1).toMatchObject({ in_flight: true });
    expect(String((t2['scan'] as Row)['skipped'] ?? '')).toMatch(/is in flight since/);
    // the scan closes its own run after the tick
    for (let i = 0; i < 120; i += 1) {
      const c = await one(sql`select count(*)::int n, count(*) filter (where outcome = 'running')::int live from executive.agent_runs where agent_id = ${A}::uuid`);
      if (Number(c['n']) > runsBefore && Number(c['live']) === 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const runs = await rows(sql`select outcome, trigger_kind, trigger_ref from executive.agent_runs where agent_id = ${A}::uuid order by started_at`);
    expect(runs.length).toBeGreaterThan(runsBefore);
    expect(runs[runsBefore]).toMatchObject({ outcome: 'finished', trigger_kind: 'scheduler', trigger_ref: 'twin-supply-scan' });
    svc.scanAwaitMs = 30_000;
    const t3 = await svc.afterTick({ principal: attention, tenantId: T, domainId: D, correlationId: uuidv7() });
    expect(t3).toMatchObject({ scan: null, pending: { backlog: 0, unread: [], remaps: [] } });
  }, 120_000);

  it('refusal → recovery: two concurrent scans of a changed network draft each finding ONCE (the advisory lock); the duplicate answered 409 in the family\'s words', async () => {
    await version(netOwner, N, [{ key: 'capacity:steel-mill.steel', value: 45, unit: 't/day' }], { carryFrom: await head(N), except: ['capacity:steel-mill.steel'] });
    const [r1, r2] = await Promise.all([runAgent(A), runAgent(A)]);
    expect([r1.run.outcome, r2.run.outcome]).toEqual(['finished', 'finished']);
    const open = await rows(sql`select finding_kind, subject, count(*)::int n from twin.agent_proposals where twin_id = ${N}::uuid and state = 'proposed' group by 1, 2 order by 1, 2`);
    expect(open.every((o) => o['n'] === 1)).toBe(true);
    const drafted = [r1, r2].map((r) => arr(r.run.outputs['scanned']).filter((s) => s['twin_id'] === N).reduce((a, s) => a + Number(s['drafted']), 0));
    expect(drafted.filter((d) => d > 0)).toHaveLength(1);
    const mapped = asObservationRefusal(Object.assign(new Error('twin proposal rejected (duplicate): a bottleneck finding on bearing-maker.bearing of twin x is already open'), { code: '23505' }), 'harness');
    expect(mapped?.getStatus()).toBe(409);
    evidence('AG-026', { runs: [r1.run.runId, r2.run.runId], drafted });
  }, 180_000);
});

describe('SC3 · disruption detection and the map to the affected line (JRN-11 detect → map; V01-T-024)', () => {
  it('positive: C. Brenner opens the Red Sea disruption from the corridor\'s admitted change; the map derates Ningbo and Shenzhen and reaches line SYN-LINE-A1; replayed identical', async () => {
    const dis = (await openDis(riskOwner, { title: 'Red Sea corridor disruption (Bab el-Mandeb) — SYNTHETIC', signal: { kind: 'twin_change', ref: C, version: await head(C), note: 'corridor.capacity_share fell to 62 %' },
      chokepoints: ['bab-el-mandeb'], places: [], derating: 0.75, durationDays: 60, telemetryTwinId: C })).disruption;
    expect(dis).toMatchObject({ state: 'open' });
    DIS = String(dis['disruption_id']);
    const m = await mapDis(riskOwner, DIS);
    expect(m.map).toMatchObject({ map_no: 1, affected: true, stale: false, unchanged: false });
    const nmap = (m.result['networks'] as Row[]).find((x) => x['twin_id'] === N) as Row;
    expect((nmap['affected_routes'] as Row[]).map((r) => r['route']).sort()).toEqual(['inf-shenzhen-bearing-blank', 'r2', 'r3']);
    expect(nmap).toMatchObject({ throughput_before_per_day: 450, throughput_after_per_day: 112.5 });
    expect((nmap['lines'] as Row[])[0]).toMatchObject({ twin_id: P, lines: [{ line: 'SYN-LINE-A1', capacity_per_day: 1000 }], run_rate_before_per_day: 450, run_rate_after_per_day: 112.5,
      shortfall_per_day: 337.5, cover_days: 17.78, line_stop_days: 42.22 });
    expect(m.pinned.map((c) => c['id'])).toEqual(expect.arrayContaining([N, P, C]));
    expect((await items(DIS)).find((x) => x['signal_class'] === 'supply.disruption')).toMatchObject({ state: 'open', owner: netOwner.principalId, route_roles: ['risk_owner', 'twin_owner'] });
    // REPLAY on the pinned versions: the same digest
    const rp = await replay(analyst, DIS);
    expect(rp).toMatchObject({ map_no: 1, identical: true });
    expect(arr(rp['pinned']).every((p) => p['same'] === true)).toBe(true);
    evidence('SC3+', { disruption: DIS, map: m.map, line: (nmap['lines'] as Row[])[0] });
  }, 120_000);

  it('refusal: an unknown signal, a duplicate footprint, a stale pin at the port, the agent proposing outside its run, a proposed disruption mapped, another tenant reading', async () => {
    await refused(openDis(riskOwner, { title: 'A warning that does not exist', signal: { kind: 'warning', ref: uuidv7() }, chokepoints: ['hormuz'], derating: 0.5 }), /^supply disruption rejected \(unknown_signal\)/, 404);
    await refused(openDis(analyst, { title: 'Bab el-Mandeb again', signal: { kind: 'person', note: 'I read it in the news' }, chokepoints: ['bab-el-mandeb'], derating: 0.5 }), /^supply disruption rejected \(duplicate\)/, 409);
    // the port with a pin that is no longer the head (a newer admission between read and write)
    const d0 = await readDis(analyst, DIS);
    const oldPin = ((d0['latest_map'] as Row)['pinned'] as Row[]).find((c) => c['id'] === N) as Row;
    await version(netOwner, N, [{ key: 'capacity:module-b.module', value: 520, unit: 'pcs/day' }], { carryFrom: await head(N), except: ['capacity:module-b.module'] });
    await refused(h.pipeline.write(h.env(riskOwner, 'twin.supply.disruption.map', 'TWS', DIS, 'twin'), riskOwner, { scope: 'DOMAIN', tenantId: T, domainId: D, action: 'twin.supply.disruption.map', objectType: 'TWS', objectId: DIS },
      SupplyIntelCapability.disruption, async (cap) => ({ result: await cap.recordMap({ mapId: uuidv7(), tenantId: T, domainId: D, disruptionId: DIS, pinned: [oldPin], result: { networks: [], affected: false, stale: false },
        agentId: null, runId: null, actor: riskOwner.principalId, correlationId: uuidv7() }), targetType: 'TWS', targetId: DIS, targetVersion: null, outboxEvent: null })),
      /^supply disruption rejected \(stale\): the map read v\d+ of twin .*, whose head is now v\d+ — map it again/, 409);
    // THE AGENT proposing a disruption outside a running scan
    const agent = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: A, tenantId: T, domainId: D, correlationId: uuidv7() })).principal;
    const lastRun = String((await one(sql`select run_id::text id from executive.agent_runs where agent_id = ${A}::uuid order by started_at desc limit 1`))['id']);
    await refused(openDis(agent, { title: 'Agent proposal outside its run', signal: { kind: 'twin_change', ref: C }, chokepoints: ['hormuz'], derating: 0.5, agentId: A, runId: lastRun }),
      /^supply disruption rejected \(authority\): run .* is not this agent's running supply scan/, 403);
    // A PROPOSED disruption (the agent's, inside a run — made through the port) cannot be mapped before a person confirms it
    const proposedId = uuidv7();
    await sql`insert into executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, budget, correlation_id)
              select ${uuidv7()}::uuid, 'DOMAIN', tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, 'supply_scan', 'operator', budgets, ${uuidv7()}::uuid from executive.agents where agent_id = ${A}::uuid
              returning run_id`.execute(h.su).catch(() => undefined);
    const run = String((await one(sql`select run_id::text id from executive.agent_runs where agent_id = ${A}::uuid and outcome = 'running' order by started_at desc limit 1`))['id'] ?? '');
    expect(run).toMatch(/^[0-9a-f-]{36}$/);
    {
      const p = (await openDis(agent, { title: 'Strait of Hormuz closure risk (agent proposal, SYNTHETIC)', signal: { kind: 'twin_change', ref: C }, chokepoints: ['hormuz'], derating: 0.5, agentId: A, runId: run })).disruption;
      expect(p).toMatchObject({ state: 'proposed' });
      await refused(mapDis(riskOwner, String(p['disruption_id'])), /^supply disruption rejected \(state\): disruption .* is proposed — a person confirms it before it is mapped/, 409);
      await refused(api.confirm(req(agent, 'twin.supply.disruption.confirm', 'TWS', String(p['disruption_id'])), T, D, String(p['disruption_id']), { payload: {} }), /./, 403);
      // recovered below: a person confirms it
      PROPOSED = String(p['disruption_id']);
      await sql`update executive.agent_runs set outcome = 'finished', finished_at = clock_timestamp() where run_id = ${run}::uuid`.execute(h.su).catch(() => undefined);
    }
    // ANOTHER TENANT reading the disruption: nothing (row security)
    await refused(api.readDisruption(ureq(foreign, 'twin.supply.read', 'TWS', DIS), U, DU, DIS), /unknown_disruption/, 404);
  }, 120_000);

  it('recovery: a person confirms the agent\'s proposal; the agent\'s scan RE-MAPS the moved network (map 2, as the agent); the replay of map 1 stays identical', async () => {
    const proposed = PROPOSED;
    expect(proposed).not.toBeNull();
    if (proposed !== null) {
      const c = await api.confirm(req(riskOwner, 'twin.supply.disruption.confirm', 'TWS', proposed), T, D, proposed, { payload: {} }) as { disruption: Row };
      expect(c.disruption).toMatchObject({ state: 'open' });
      await api.close(req(riskOwner, 'twin.supply.disruption.close', 'TWS', proposed), T, D, proposed, { payload: { to: 'withdrawn', reason: 'Hormuz is not on this network\'s routes (SYNTHETIC)' } });
    }
    const r = (await runAgent(A)).run;
    expect(r.outcome, String(r.stopReason)).toBe('finished');
    expect(arr(supplyOf(r)['remapped'])).toEqual([expect.objectContaining({ disruption_id: DIS, map_no: 2, unchanged: false })]);
    const d = await readDis(analyst, DIS);
    expect((d['latest_map'] as Row)).toMatchObject({ map_no: 2, agent_id: A });
    expect((await replay(analyst, DIS, 1))['identical']).toBe(true);
    expect((await replay(analyst, DIS))['identical']).toBe(true);
  }, 120_000);
});

describe('SC4 · alternatives evaluated on scenario branches: feasibility and coverage limits (PR-30-001, AT-30, V01-T-024)', () => {
  let setId = '';
  it('positive: the Cape reroute and the Moravian dual source FEASIBLE; the safety-stock draw-down INFEASIBLE and never recommendable', async () => {
    setId = String(((await cons.declare(req(steward, 'simulation.constraint.declare', 'CST', null), T, D, { payload: { setKey: `supply-response-${RUN}`, title: 'Supply response lead time',
      constraints: [{ key: 'effect-within-two-weeks', kind: 'business_rule', quantity: 'alternative.effect_after_days', op: '<=', value: 14, unit: 'days', applies_to: ['run_input'] }],
      note: 'an option must take effect within two weeks (SYNTHETIC)' } })) as { set: Row }).set['set_id']);
    const vR = await branch('cape-reroute', (els) => OPTIONS.reroute(els as never) as El[]);
    const vS = await branch('dual-source', (els) => OPTIONS.dualSource(els as never) as El[]);
    const vI = await branch('safety-stock', (els) => OPTIONS.safetyStock(els as never) as El[]);
    const reroute = await evaluate(riskOwner, DIS, { key: 'cape-reroute', kind: 'routing', title: 'Reroute via the Cape of Good Hope', twinId: N, branchVersion: vR,
      constraintSets: [`supply-response-${RUN}`], costRef: { twinId: C, key: 'terms.reroute_cost_per_container', currency: 'EUR' } });
    expect(reroute.alternative).toMatchObject({ verdict: 'feasible', recommendable: true });
    expect(reroute.evaluation).toMatchObject({ restored_share: 1, effect_after_days: 11, constraint: { outcome: 'satisfied' } });
    const dual = await evaluate(riskOwner, DIS, { key: 'dual-source', kind: 'sourcing', title: 'Dual-source bearings from Moravia', twinId: N, branchVersion: vS, constraintSets: [`supply-response-${RUN}`],
      cost: { amount: 0.4, currency: 'EUR', basis: 'unit price premium per bearing (SYNTHETIC)' } });
    expect(dual.alternative).toMatchObject({ verdict: 'feasible' });
    const stock = await evaluate(riskOwner, DIS, { key: 'safety-stock', kind: 'inventory', title: 'Draw down the module safety stock', twinId: N, branchVersion: vI });
    expect(stock.alternative).toMatchObject({ verdict: 'infeasible', recommendable: false });
    expect(arr(stock.evaluation['reasons'] as never).join(' ')).toMatch(/the stock covers 26\.67 day\(s\) of a 60-day disruption/);
    const d = await readDis(riskOwner, DIS);
    expect(arr(d['alternatives']).map((a) => [a['alt_key'], a['verdict'], a['recommendable'], a['branch_id']]))
      .toEqual([['cape-reroute', 'feasible', true, 'alt-cape-reroute'], ['dual-source', 'feasible', true, 'alt-dual-source'], ['safety-stock', 'infeasible', false, 'alt-safety-stock']]);
    expect((arr(d['alternatives'])[0]?.['cost'] as Row)).toMatchObject({ amount: 1850, currency: 'EUR' });
    // the branches preserved for review
    expect(await head(N, 'alt-cape-reroute')).toBe(vR);
    evidence('SC4+', { disruption: DIS, alternatives: arr(d['alternatives']).map((a) => [a['alt_key'], a['verdict']]) });
  }, 180_000);

  it('refusal: a branch not alt-<key>, an older map at the port, the agent evaluating, a malformed option', async () => {
    const vR = await head(N, 'alt-cape-reroute');
    await refused(evaluate(riskOwner, DIS, { key: 'other-name', kind: 'routing', title: 'Mislabelled branch', twinId: N, branchVersion: vR }), /^supply alternative rejected \(branch\)/, 422);
    await refused(evaluate(riskOwner, DIS, { key: 'x', kind: 'teleport', title: 'nope', twinId: N, branchVersion: vR }), /^supply alternative rejected \(shape\)/, 422);
    const agent = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: A, tenantId: T, domainId: D, correlationId: uuidv7() })).principal;
    await refused(evaluate(agent, DIS, { key: 'cape-reroute', kind: 'routing', title: 'The agent evaluating', twinId: N, branchVersion: vR }), /./, 403);
    const first = String((await one(sql`select map_id::text id from twin.supply_disruption_maps where disruption_id = ${DIS}::uuid and map_no = 1`))['id']);
    await refused(h.pipeline.write(h.env(riskOwner, 'twin.supply.alternative.evaluate', 'TWS', DIS, 'twin'), riskOwner,
      { scope: 'DOMAIN', tenantId: T, domainId: D, action: 'twin.supply.alternative.evaluate', objectType: 'TWS', objectId: DIS }, SupplyIntelCapability.alternative,
      async (cap) => ({ result: await cap.recordAlternative({ alternativeId: uuidv7(), tenantId: T, domainId: D, disruptionId: DIS, mapId: first, key: 'cape-reroute', kind: 'routing', title: 'On the older map',
        params: {}, twinId: N, branchVersion: vR, evaluation: {}, verdict: 'feasible', reasons: [], limits: [], constraint: null, cost: null, actor: riskOwner.principalId, correlationId: uuidv7() }),
        targetType: 'TWS', targetId: DIS, targetVersion: null, outboxEvent: null })), /^supply alternative rejected \(stale\): the evaluation read map/, 409);
  }, 120_000);

  it('recovery: a tightened rule makes the reroute INFEASIBLE (its evaluation superseded); the rule restored, FEASIBLE again', async () => {
    const vR = await head(N, 'alt-cape-reroute');
    await cons.version(req(steward, 'simulation.constraint.version', 'CST', setId), T, D, setId, { payload: { expectedVersion: 1,
      constraints: [{ key: 'effect-within-ten-days', kind: 'business_rule', quantity: 'alternative.effect_after_days', op: '<=', value: 10, unit: 'days', applies_to: ['run_input'] }], note: 'tightened to ten days (SYNTHETIC)' } });
    const tight = await evaluate(riskOwner, DIS, { key: 'cape-reroute', kind: 'routing', title: 'Reroute via the Cape of Good Hope', twinId: N, branchVersion: vR, constraintSets: [`supply-response-${RUN}`] });
    expect(tight.alternative).toMatchObject({ verdict: 'infeasible', recommendable: false });
    await cons.version(req(steward, 'simulation.constraint.version', 'CST', setId), T, D, setId, { payload: { expectedVersion: 2,
      constraints: [{ key: 'effect-within-two-weeks', kind: 'business_rule', quantity: 'alternative.effect_after_days', op: '<=', value: 14, unit: 'days', applies_to: ['run_input'] }], note: 'restored to two weeks (SYNTHETIC)' } });
    const back = await evaluate(riskOwner, DIS, { key: 'cape-reroute', kind: 'routing', title: 'Reroute via the Cape of Good Hope', twinId: N, branchVersion: vR, constraintSets: [`supply-response-${RUN}`] });
    expect(back.alternative).toMatchObject({ verdict: 'feasible' });
    expect((await rows(sql`select state from twin.supply_alternatives where disruption_id = ${DIS}::uuid and alt_key = 'cape-reroute' order by evaluated_at`)).map((r) => r['state']))
      .toEqual(['superseded', 'superseded', 'evaluated']);
  }, 120_000);
});

describe('SC5 · the continuity contract (PR-30-005; AT-30 fault exercise): visible state, audit and recovery closure', () => {
  it('fault → recovery: the line twin stale → the map flagged, every option INDETERMINATE, "no feasible alternative" routed; a fresh line → feasible, the item closed', async () => {
    // FAULT: the line twin's telemetry is late (its head observed five days ago against a two-day policy)
    const old = await dbDay(-5);
    await version(lineOwner, P, regensburgLine(), { observedThrough: old });
    await br.policy(req(lineOwner, 'twin.freshness.policy', 'TWN', P), T, D, P, { payload: { maxAgeDays: 2, note: 'the line state is daily telemetry (SYNTHETIC)' } });
    const m = await mapDis(riskOwner, DIS);
    expect(m.result).toMatchObject({ stale: true });
    expect(arr(m.result['stale_reasons'])).toEqual(expect.arrayContaining([expect.stringMatching(/is stale by its freshness policy/)]));
    const evs: Row[] = [];
    for (const [key, kind] of [['cape-reroute', 'routing'], ['dual-source', 'sourcing'], ['safety-stock', 'inventory']] as const) {
      evs.push((await evaluate(riskOwner, DIS, { key, kind, title: `${key} (re-evaluated on the stale map)`, twinId: N, branchVersion: await head(N, `alt-${key}`) })).alternative);
    }
    expect(evs.map((e) => e['verdict'])).toEqual(['indeterminate', 'indeterminate', 'indeterminate']);
    const none = (await items(String(evs[2]?.['alternative_id']))).find((x) => x['cause_event_type'] === 'supply.alternatives.none_feasible');
    expect(none).toMatchObject({ signal_class: 'supply.disruption', state: 'open' });
    // RECOVERY: a fresh line version (observed today), re-mapped, re-evaluated
    await version(lineOwner, P, regensburgLine(), { observedThrough: await dbDay(0) });
    const m2 = await mapDis(riskOwner, DIS);
    expect(m2.result).toMatchObject({ stale: false });
    const ok = await evaluate(riskOwner, DIS, { key: 'cape-reroute', kind: 'routing', title: 'Reroute via the Cape of Good Hope', twinId: N, branchVersion: await head(N, 'alt-cape-reroute') });
    expect(ok.alternative).toMatchObject({ verdict: 'feasible', closed_items: expect.arrayContaining([expect.any(String)]) });
    expect((await items(String(evs[2]?.['alternative_id']))).every((x) => x['state'] === 'closed')).toBe(true);
    expect(await ledger(DIS)).toEqual(expect.arrayContaining(['disruption.opened', 'disruption.mapped']));
    evidence('SC5', { fault: 'line twin stale', visible: m.result['stale_reasons'], audit: await ledger(DIS), recovery: ok.alternative });
  }, 180_000);

  it('the inferred-unvalidated site is NOT MAPPED; two sites of one entity ISOLATED with an item', async () => {
    const d = await readDis(analyst, DIS);
    const n2 = (((d['latest_map'] as Row)['result'] as Row)['networks'] as Row[]).find((x) => x['twin_id'] === N2) as Row;
    expect(n2['excluded']).toEqual([{ site: 'steel-mill', reason: 'not mapped: an inferred site not yet validated by a named analyst' }]);
    const E = uuidv7();
    await version(netOwner, N2, [{ key: 'site:module-a', value: { tier: 1, name: 'Module maker A', bom: { bearing: 4 }, entity_id: E }, unit: null },
      { key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 }, entity_id: E }, unit: null }], { carryFrom: await head(N2), except: ['site:module-a', 'site:module-b'] });
    const m = await mapDis(analyst, DIS);
    const iso = (m.result['networks'] as Row[]).find((x) => x['twin_id'] === N2) as Row;
    expect(arr(iso['isolated'])[0]).toMatchObject({ sites: ['module-a', 'module-b'] });
    expect(iso).toMatchObject({ throughput_before_per_day: null });
    expect(arr(m.map['identity_items'])).toHaveLength(1);
    expect((await items(DIS)).some((x) => x['cause_event_type'] === 'supply.identity.conflict' && x['signal_class'] === 'supply.dependency')).toBe(true);
  }, 120_000);
});

describe('SC7 · the fixtures: correction, cross-tenant, unauthorized role, source reconciliation', () => {
  it('correction: a validated and applied inference REVOKED by a named analyst → the owner REVERTS the network through a new version', async () => {
    const r = (await decide(analyst2, INF, { decision: 'rejected', reason: 'Nordbearing confirms the blanks come from its own Swedish plant (SYNTHETIC).' })).decision;
    expect(r).toMatchObject({ state: 'revoked' });
    expect((await items(INF)).at(-1)).toMatchObject({ state: 'open', owner: netOwner.principalId, title: expect.stringMatching(/REVOKED/) });
    const v = await revert(netOwner, INF);
    expect(v['reverted']).toMatchObject({ state: 'reverted' });
    expect(arr(v['removed'] as never)).toEqual(expect.arrayContaining(['site:shenzhen-bearing-blank', 'capacity:shenzhen-bearing-blank.bearing-blank', 'route:inf-shenzhen-bearing-blank']));
    expect((await one(sql`select count(*)::int n from twin.state_elements where twin_id = ${N}::uuid and version = ${v['version'] as number} and key like '%shenzhen%'`))['n']).toBe(0);
    expect((await items(INF)).every((x) => x['state'] === 'closed')).toBe(true);
    expect(await ledger(INF)).toEqual(['inference.drafted', 'inference.validated', 'inference.applied', 'inference.revoked', 'inference.reverted']);
    // the network again shows the unsourced input — the next scan finds the records' inference again (a new proposal, not the revoked one)
    expect(((await network(analyst, N))['uncertainty'] as Row)['unsourced']).toEqual([{ site: 'nordbearing', tier: 1, material: 'bearing-blank' }]);
  }, 120_000);

  it('cross-tenant and unauthorized: another tenant sees no inference; a strategy owner cannot open, map or evaluate; source reconciliation by digest', async () => {
    const other = (await api.listInferences(ureq(foreign, 'twin.supply.read', 'TWS', null), U, DU, { payload: {} })) as { inferences: Row[] };
    expect(other.inferences).toEqual([]);
    await refused(openDis(strategist, { title: 'A strategist opening one', signal: { kind: 'person' }, chokepoints: ['panama'], derating: 0.5 }), /./, 403);
    await refused(mapDis(strategist, DIS), /./, 403);
    // every read the inferences rest on: its digest is the evidence version's canonical digest
    const mismatch = await one(sql`select count(*)::int n from twin.supply_record_reads r join objects.canonical_objects o on o.object_type = 'EVD' and o.object_id = r.evidence_id and o.object_version = r.evidence_version
                                    where r.tenant_id = ${T}::uuid and o.content_digest <> r.evidence_digest`);
    expect(mismatch['n']).toBe(0);
    evidence('SC7', { reconciled_reads: Number((await one(sql`select count(*)::int n from twin.supply_record_reads where tenant_id = ${T}::uuid`))['n']) });
  }, 60_000);
});
