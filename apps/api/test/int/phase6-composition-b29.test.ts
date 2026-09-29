/**
 * CP-6 B29 §A (migration 0092, part A) — TWIN FAMILIES, COMPOSITION AND THE EXTENSION SURFACE (F-P5-01; L5-C06; V03-T-473), on a real
 * database through the real routes and ports, with named humans holding sessions of their own (the ports compare the acting principal).
 *
 *   C1 · FAMILIES: the eight product kinds with their schemas, dependencies and default methods; a family validator at admission (a
 *        non-conforming element refused, nothing admitted; the supply-chain kind admits as before); the family-derived measures.
 *   C2 · LINKS AND COUPLED STATE: enterprise ← process ← supply-chain linked by contracts; an upstream capacity change admitted →
 *        proposals → the downstream owners apply (through the version and ground ports, each coupled element citing the upstream version)
 *        and admit → the enterprise's capacity utilisation moves 0.8 → 1.2903; dependency completeness 2/3 → 3/3; the upstream owner never
 *        writes the downstream twin; a cycle refused; a declined proposal re-proposed by the next upstream admission; a retired link stops
 *        propagation; a proposal left pending is applied from a fresh application context (the restarted API).
 *   C3 · CONTRACTS AND APPROVED USES: published by the owner (the interfaces column mirrors it), a link on an uncontracted key or for an
 *        unapproved use refused, an upstream without a contract refused until it publishes one, a contract that would strand a live link
 *        refused; twin.use_approved (part C's run check).
 *   C4 · THE EXTENSION SURFACE: x- kinds registered by a domain administrator (human-gated), usable only in their tenant and domain,
 *        duplicate names refused, listed beside the product kinds for their own domain only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { cite } from './phase5-fixtures.js';

// C5 / Nit 8: this file's own vault roots (the capacity records are uploaded through the real route).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b29-a-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number };
const csv = (rows: string[][]) => ['synthetic,record_id,key,value,unit', ...rows.map((r) => ['true', ...r].join(','))].join('\n') + '\n';

let h: Phase4Harness; let T: string; let D: string;
let twins: TwinController; let comp: CompositionController;
let supplyOwner: AuthenticatedPrincipal; let processOwner: AuthenticatedPrincipal; let enterpriseOwner: AuthenticatedPrincipal;
let dadmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal;
let entityId: string;
let base: Evd; let cut: Evd; let later: Evd;
let S: string; let P: string; let E: string; let M: string;
/** C1's refusal probe: a process twin and its draft, refused at grounding and recovered in the same draft. */
let X9: string; let x9: number;
let Z: string; let z: number; let O: string; let o: number; // B29-F1 (0093): the refused drafts and their recovery

/** A refusal as the HTTP answer the filter would give (a port's text mapped by observation-errors), or 'ok'. */
async function refusal(p: Promise<unknown>): Promise<{ status: number | 'ok'; message: string }> {
  try { await p; return { status: 'ok', message: '' }; } catch (e) {
    const raw = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e));
    const r = asObservationRefusal(e, uuidv7());
    if (r === null) throw e;
    return { status: r.getStatus(), message: raw };
  }
}
const req = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(p, action, type, id, 'twin');
const assumed = (key: string, value: number, unit: string, evd: Evd) => ({ key, kind: 'assumed', value, unit, citations: [cite(evd)] });

async function declare(owner: AuthenticatedPrincipal, kind: string, title: string): Promise<string> {
  const d = await twins.declare(req(owner, 'twin.declare', 'TWN', null), T, D, { payload: { kind, title, statement: `${title} (B29 composition harness)`,
    boundary: [entityId], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  return d.twin.twinId;
}
async function openDraft(owner: AuthenticatedPrincipal, twinId: string, carryFrom: number | null = null, except: string[] = []): Promise<number> {
  const o = await twins.openVersion(req(owner, 'twin.version', 'TWN', twinId), T, D, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), carryFrom, except } }) as { version: { version: number } };
  return o.version.version;
}
async function ground(owner: AuthenticatedPrincipal, twinId: string, v: number, elements: unknown[]) {
  return twins.ground(req(owner, 'twin.ground', 'TWN', twinId), T, D, twinId, String(v), { payload: { elements } });
}
async function admit(owner: AuthenticatedPrincipal, twinId: string, v: number) {
  return twins.admit(req(owner, 'twin.version.admit', 'TWN', twinId), T, D, twinId, String(v), { payload: { allowIncomplete: true } }) as Promise<{ admitted: Row }>;
}
/** Open, ground and admit (incomplete allowed: the family twins run on supply-flow@1 here, whose inputs they do not carry). */
async function version(owner: AuthenticatedPrincipal, twinId: string, elements: unknown[], carryFrom: number | null = null, except: string[] = []): Promise<number> {
  const v = await openDraft(owner, twinId, carryFrom, except);
  await ground(owner, twinId, v, elements);
  await admit(owner, twinId, v);
  return v;
}
const publish = (owner: AuthenticatedPrincipal, twinId: string, exposed: Row, decisionClasses: string[], methodFamilies: string[] = ['discrete-event']) =>
  comp.publishContract(req(owner, 'twin.contract.publish', 'TWN', twinId), T, D, twinId, { payload: { exposed, approvedUses: { methodFamilies, decisionClasses } } }) as Promise<{ contract: Row }>;
const link = (owner: AuthenticatedPrincipal, upstreamTwinId: string, downstreamTwinId: string, mapping: Array<{ from: string; to: string }>, use = 'capacity-planning') =>
  comp.declareLink(req(owner, 'twin.link.declare', 'TWN', downstreamTwinId), T, D, { payload: { upstreamTwinId, downstreamTwinId, mapping, use } }) as Promise<{ link: Row }>;
async function proposals(owner: AuthenticatedPrincipal, twinId: string, state?: string): Promise<Row[]> {
  const r = await comp.listProposals(req(owner, 'twin.read', 'TWN', twinId), T, D, { payload: { twinId, ...(state === undefined ? {} : { state }) } }) as { proposals: Row[] };
  return r.proposals;
}
const apply = (owner: AuthenticatedPrincipal, proposalId: string, c: CompositionController = comp) =>
  c.applyCoupling(req(owner, 'twin.coupling.apply', 'CPL', proposalId), T, D, proposalId) as Promise<{ applied: Row }>;
const decline = (owner: AuthenticatedPrincipal, proposalId: string, reason: string) =>
  comp.declineCoupling(req(owner, 'twin.coupling.decline', 'CPL', proposalId), T, D, proposalId, { payload: { reason } }) as Promise<{ declined: Row }>;
async function measures(owner: AuthenticatedPrincipal, twinId: string): Promise<Row> {
  return ((await comp.measures(req(owner, 'twin.read', 'TWN', twinId), T, D, twinId, { payload: {} })) as { measures: Row }).measures;
}
async function completeness(owner: AuthenticatedPrincipal, twinId: string): Promise<Row> {
  return ((await comp.completeness(req(owner, 'twin.read', 'TWN', twinId), T, D, twinId)) as { completeness: Row }).completeness;
}
/** Apply the one pending proposal of a twin and admit the version it opened (the downstream owner's two acts). */
async function applyAndAdmit(owner: AuthenticatedPrincipal, twinId: string): Promise<{ proposal: Row; version: number }> {
  const pending = await proposals(owner, twinId, 'proposed');
  expect(pending).toHaveLength(1);
  const proposal = pending[0] as Row;
  const a = await apply(owner, String(proposal['proposal_id']));
  const v = Number(a.applied['version']);
  await admit(owner, twinId, v);
  return { proposal, version: v };
}
/** B29-F1 (0093): the withdraw route (twin.version.withdraw). */
const withdraw = (owner: AuthenticatedPrincipal, twinId: string, v: number, reason: string) =>
  twins.withdraw(req(owner, 'twin.version.withdraw', 'TWN', twinId), T, D, twinId, String(v), { payload: { reason } }) as Promise<{ withdrawn: Row; receipt: Row }>;
/** A trigger's raw refusal on a direct SQL write (no HTTP mapping: the text as PostgreSQL raised it). */
const raised = async (p: Promise<unknown>): Promise<string> => { try { await p; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); } };
const elementCount = async (twinId: string, v: number): Promise<number> =>
  (await sql<{ n: number }>`select count(*)::int n from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v}`.execute(h.su)).rows[0]?.n ?? -1;
/** An element written as the SQL paths write one (a carry-forward, a coupling: twin.ground_element, under the ground route's preflight's sight of nothing) — the row as such a path leaves it. */
async function plant(twinId: string, v: number, key: string, value: number, unit: string): Promise<void> {
  await sql`insert into twin.state_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations, health, synthetic_state, controls, grounded_by, correlation_id)
    select ${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${twinId}::uuid, ${v}, ${key}, 'assumed', null, ${JSON.stringify(value)}::jsonb, ${unit}, twin.key_is_material(${twinId}::uuid, ${key}),
           e.citations, 'complete', false, '{}'::jsonb, ${processOwner.principalId}::uuid, ${uuidv7()}::uuid
      from twin.state_elements e where e.twin_id = ${S}::uuid and e.version = 1 and e.key = 'supply.capacity_per_day'`.execute(h.su);
  await sql`update twin.twin_versions set element_count = element_count + 1 where twin_id = ${twinId}::uuid and version = ${v}`.execute(h.su);
}

async function events(twinId: string, event: string): Promise<Row[]> {
  return (await sql<Row>`select event, details from twin.twin_events where twin_id = ${twinId}::uuid and event = ${event} order by occurred_at`.execute(h.su)).rows;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  twins = h.app.get(Tc); comp = h.app.get(Cc);
  supplyOwner = await h.humanWithSession(['twin_owner'], 'supply-owner');
  processOwner = await h.humanWithSession(['twin_owner'], 'process-owner');
  enterpriseOwner = await h.humanWithSession(['twin_owner'], 'enterprise-owner');
  dadmin = await h.humanWithSession(['domain_admin'], 'domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'analyst');
  operator = await h.humanWithSession(['simulation_operator'], 'sim-operator');
  entityId = uuidv7(); const corr = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'organization', 'NORDWERK Regensburg', 'nordwerk regensburg', 'active', ${supplyOwner.principalId}::uuid, ${corr}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${entityId}::uuid, 'entity.created', ${supplyOwner.principalId}::uuid,
            ${JSON.stringify({ entity_type: 'organization', canonical_name: 'NORDWERK Regensburg', normalized_name: 'nordwerk regensburg', split_from: null })}::jsonb, ${corr}::uuid)`.execute(h.su);
  const up = await h.upload([
    { filename: 'b29-capacity-baseline.csv', text: csv([['SYN-CAP-001', 'supply.capacity_per_day', '1000', 'units/day'], ['SYN-CAP-002', 'line.capacity_per_day', '1000', 'units/day'],
                                                        ['SYN-CAP-003', 'demand.per_day', '800', 'units/day'], ['SYN-CAP-004', 'demand.volume_per_month', '24000', 'units/month'],
                                                        ['SYN-CAP-005', 'demand.index', '100', 'index']]) },
    { filename: 'b29-capacity-corridor-62pct.csv', text: csv([['SYN-CAP-101', 'supply.capacity_per_day', '620', 'units/day']]) },
    { filename: 'b29-capacity-later.csv', text: csv([['SYN-CAP-201', 'supply.capacity_per_day', '700', 'units/day'], ['SYN-CAP-202', 'demand.index', '110', 'index'],
                                                     ['SYN-CAP-203', 'demand.index', '115', 'index'], ['SYN-CAP-204', 'demand.index', '120', 'index']]) },
  ]);
  base = up[0] as Evd; cut = up[1] as Evd; later = up[2] as Evd;
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('C1 · twin families as kind schemas with domain behaviour', () => {
  it('positive: the eight product families are listed with their schemas, dependencies and default methods; the family measures read admitted state', async () => {
    const r = await comp.listKinds(req(analyst, 'twin.read', 'TWN', null), T, D) as { kinds: Row[] };
    const byKind = new Map(r.kinds.map((k) => [String(k['kind']), k]));
    for (const f of ['enterprise', 'market', 'competitor', 'product', 'process', 'infrastructure', 'regulation', 'organisation']) {
      expect(byKind.get(f)?.['family'], f).toBe(f);
      expect(byKind.get(f)?.['scope']).toBe('product');
      expect(Object.keys(byKind.get(f)?.['element_schema'] as Row).length).toBeGreaterThan(0);
    }
    expect(byKind.get('enterprise')?.['required_dependencies']).toEqual(['process', 'supply-chain|supply-network', 'market']);
    expect(byKind.get('process')?.['required_dependencies']).toEqual(['supply-chain|supply-network']);
    expect(byKind.get('process')?.['default_methods']).toEqual(['discrete-event', 'flow']);
    expect(byKind.get('supply-chain')?.['family']).toBe('supply-chain');
    expect(byKind.get('supply-chain')?.['element_schema']).toEqual({});
    // The four twins of the composition, each admitted at version 1 under its family's validator.
    S = await declare(supplyOwner, 'supply-chain', 'NORDWERK — Ningbo → Regensburg corridor (B29)');
    P = await declare(processOwner, 'process', 'Regensburg line 1');
    E = await declare(enterpriseOwner, 'enterprise', 'NORDWERK enterprise');
    M = await declare(enterpriseOwner, 'market', 'EU drive-magnet market');
    expect(await version(supplyOwner, S, [assumed('supply.capacity_per_day', 1000, 'units/day', base)])).toBe(1);
    expect(await version(processOwner, P, [assumed('line.capacity_per_day:l1', 1000, 'units/day', base)])).toBe(1);
    expect(await version(enterpriseOwner, E, [assumed('demand.per_day', 800, 'units/day', base)])).toBe(1);
    expect(await version(enterpriseOwner, M, [assumed('demand.volume_per_month', 24000, 'units/month', base), assumed('demand.index', 100, 'index', base)])).toBe(1);
    expect(await measures(processOwner, P)).toMatchObject({ family: 'process', version: 1, measures: { throughput_per_day: 1000, bottleneck: 'line' } });
    expect(await measures(enterpriseOwner, E)).toMatchObject({ family: 'enterprise', measures: { demand_per_day: 800, capacity_utilisation: null } });
  });

  it('refusal: a family validator refuses a non-conforming element at GROUNDING — nothing written, the draft still open; a whole-version rule at grounding too (B29-F1), and at admission for what another path wrote', async () => {
    X9 = await declare(processOwner, 'process', 'Regensburg line 9 (refusal probe)');
    x9 = await openDraft(processOwner, X9);
    const r = await refusal(ground(processOwner, X9, x9, [assumed('line.capacity_per_day:l9', 7000, 'units/day', base), assumed('line.capacity_per_day:l10', 7000, 'units/week', base),
                                                         assumed('line.speed', 3, 'm/s', base)]));
    expect(r.status).toBe(422);
    expect(r.message).toMatch(/^family validation refused \(process\) at grounding: line\.capacity_per_day:l10: unit units\/week — the kind declares units\/day; line\.speed: not an element this kind declares.* — nothing was grounded$/);
    // Nothing of the batch was written (not even its conforming first element), and the draft is still open for the owner.
    const row = (await sql<{ state: string; element_count: number }>`select state, element_count from twin.twin_versions where twin_id = ${X9}::uuid and version = ${x9}`.execute(h.su)).rows[0];
    expect(row).toEqual({ state: 'draft', element_count: 0 });
    expect(await elementCount(X9, x9)).toBe(0);
    // B29-F1 (0093): the family's own VERSION-LEVEL rule, judged at GROUNDING over the accumulated draft — a line of zero capacity is refused before it enters the draft.
    Z = await declare(processOwner, 'process', 'Regensburg line 0 (refusal probe)');
    z = await openDraft(processOwner, Z);
    const z0 = await refusal(ground(processOwner, Z, z, [assumed('line.capacity_per_day:l0', 0, 'units/day', base)]));
    expect(z0.status).toBe(422);
    expect(z0.message).toMatch(/^family validation refused \(process\) at grounding: line\.capacity_per_day:l0: a line with no capacity is not a line — retire it from the process — nothing was grounded$/);
    expect(await elementCount(Z, z)).toBe(0);
    // The CROSS-ELEMENT rule accumulated across two ground calls (organisation: roles filled beyond the headcount) — the second batch is refused, the first stands.
    O = await declare(processOwner, 'organisation', 'Regensburg plant organisation (refusal probe)');
    o = await openDraft(processOwner, O);
    await ground(processOwner, O, o, [assumed('headcount', 10, 'people', base), assumed('roles.filled:assembly', 6, 'people', base)]);
    const o2 = await refusal(ground(processOwner, O, o, [assumed('roles.filled:maintenance', 6, 'people', base)]));
    expect(o2.status).toBe(422);
    expect(o2.message).toMatch(/^family validation refused \(organisation\) at grounding: roles\.filled: 12 roles filled by a headcount of 10 — nothing was grounded$/);
    expect(await elementCount(O, o)).toBe(2);
    // The ADMISSION validator stands for what arrives by a path the ground route's preflight cannot see (a carry-forward, a coupling — both
    // write twin.ground_element directly): the refused elements planted as such a path leaves them, admission refuses each version.
    await plant(Z, z, 'line.capacity_per_day:l0', 0, 'units/day');
    expect((await refusal(admit(processOwner, Z, z))).message).toMatch(/a line with no capacity is not a line/);
    await plant(O, o, 'roles.filled:maintenance', 6, 'people');
    expect((await refusal(admit(processOwner, O, o))).message).toMatch(/roles\.filled: 12 roles filled by a headcount of 10/);
  });

  it('recovery (B29-F1, 0093): the family-refused draft is WITHDRAWN by its owner — the row withdrawn once, its elements kept, the branch free — and a valid version admits on the same branch; the cross-element case the same way; the conforming element grounds into X9', async () => {
    // Before the correction the owner was stuck: one element per key per draft (409), and no second draft while this one is open (409).
    expect((await refusal(ground(processOwner, Z, z, [assumed('line.capacity_per_day:l0', 1000, 'units/day', base)]))).status).toBe(409);
    const blocked = await refusal(openDraft(processOwner, Z));
    expect(blocked.status).toBe(409);
    expect(blocked.message).toMatch(/already has an open draft/);
    // The withdrawal's own refusals: an operator (the PDP), a peer twin owner (the port: ownership), an admitted version (state), an absent reason.
    expect((await refusal(withdraw(operator, Z, z, 'not mine to withdraw'))).status).toBe(403);
    const peer = await refusal(withdraw(supplyOwner, Z, z, 'a peer owner tidying up'));
    expect(peer.status).toBe(403);
    expect(peer.message).toMatch(/^draft withdrawal rejected \(ownership\): draft version \d+ of twin .* is withdrawn by the twin's owner or by the person who opened it/);
    expect((await refusal(withdraw(processOwner, P, 1, 'an admitted version'))).status).toBe(409);
    expect((await refusal(withdraw(processOwner, Z, z, ''))).status).toBe(422);
    expect((await refusal(withdraw(processOwner, Z, z + 40, 'no such version'))).status).toBe(404);
    expect(await events(Z, 'version.withdrawn')).toHaveLength(0);
    // THE WITHDRAWAL: the owner's act, with a reason; the answer and the receipt.
    const w = await withdraw(processOwner, Z, z, 'line 0 was entered with no capacity; the line is re-entered with its rated capacity');
    expect(w.withdrawn).toMatchObject({ twinId: Z, version: z, branchId: 'actual', state: 'withdrawn', elementCount: 1, withdrawnBy: processOwner.principalId });
    expect(typeof w.receipt['auditSeq']).toBe('number');
    const row = (await sql<Row>`select state, element_count, withdrawn_by::text wb, withdrawal_reason, state_set_digest, admitted_at from twin.twin_versions where twin_id = ${Z}::uuid and version = ${z}`.execute(h.su)).rows[0];
    expect(row).toMatchObject({ state: 'withdrawn', element_count: 1, wb: processOwner.principalId, withdrawal_reason: 'line 0 was entered with no capacity; the line is re-entered with its rated capacity', state_set_digest: null, admitted_at: null });
    expect(await elementCount(Z, z)).toBe(1); // history preserved: the refused element stays as it was written
    const ev = await events(Z, 'version.withdrawn');
    expect(ev).toHaveLength(1);
    expect(ev[0]!['details']).toMatchObject({ version: z, branch_id: 'actual', element_count: 1, reason: 'line 0 was entered with no capacity; the line is re-entered with its rated capacity' });
    // Withdrawn = closed and immutable: grounding, admission and a second withdrawal are refused; the row cannot be moved back by anyone (the trigger).
    expect((await refusal(ground(processOwner, Z, z, [assumed('line.capacity_per_day:l0', 1000, 'units/day', base)]))).status).toBe(409);
    expect((await refusal(admit(processOwner, Z, z))).status).toBe(409);
    const again = await refusal(withdraw(processOwner, Z, z, 'again'));
    expect(again.status).toBe(409);
    expect(again.message).toMatch(/was withdrawn at/);
    expect(await raised(sql`update twin.twin_versions set state = 'draft', withdrawn_at = null, withdrawn_by = null, withdrawal_reason = null where twin_id = ${Z}::uuid and version = ${z}`.execute(h.su))).toMatch(/withdrawn and immutable/);
    expect(await raised(sql`update twin.twin_versions set state = 'withdrawn' where twin_id = ${X9}::uuid and version = ${x9}`.execute(h.su))).toMatch(/withdrawal port alone|twv_withdrawn_bound/);
    expect(await raised(sql`delete from twin.state_elements where twin_id = ${Z}::uuid and version = ${z}`.execute(h.su))).toMatch(/append-only/);
    // THE BRANCH IS FREE: a new draft on `actual`, the corrected value, admission, the family measures — the recovery on the same branch.
    const z2 = await openDraft(processOwner, Z);
    expect(z2).toBe(z + 1);
    await ground(processOwner, Z, z2, [assumed('line.capacity_per_day:l0', 1000, 'units/day', base)]);
    expect((await admit(processOwner, Z, z2)).admitted).toMatchObject({ version: z2, supersedes: null });
    expect((await measures(processOwner, Z))['measures']).toMatchObject({ throughput_per_day: 1000, bottleneck: 'line' });
    const states = (await sql<{ version: number; state: string }>`select version, state from twin.twin_versions where twin_id = ${Z}::uuid order by version`.execute(h.su)).rows;
    expect(states).toEqual([{ version: z, state: 'withdrawn' }, { version: z2, state: 'admitted' }]);
    // THE CROSS-ELEMENT CASE: the organisation's refused draft withdrawn the same way, then 10 people with 6 + 4 roles filled admitted.
    expect((await withdraw(processOwner, O, o, 'roles filled beyond the headcount were entered; re-entered within it')).withdrawn).toMatchObject({ state: 'withdrawn', elementCount: 3 });
    const o2 = await openDraft(processOwner, O);
    await ground(processOwner, O, o2, [assumed('headcount', 10, 'people', base), assumed('roles.filled:assembly', 6, 'people', base), assumed('roles.filled:maintenance', 4, 'people', base)]);
    expect((await admit(processOwner, O, o2)).admitted).toMatchObject({ version: o2 });
    expect((await measures(processOwner, O))['measures']).toMatchObject({ headcount: 10 });
    expect(await elementCount(O, o)).toBe(3);
    // The conforming element grounds into X9's still-open draft and the version admits; the supply-chain kind (no schema) admits as before.
    await ground(processOwner, X9, x9, [assumed('line.capacity_per_day:l9', 7000, 'units/day', base)]);
    expect((await admit(processOwner, X9, x9)).admitted).toMatchObject({ version: x9 });
    expect((await measures(processOwner, X9))['measures']).toMatchObject({ throughput_per_day: 7000 });
    const v = await version(supplyOwner, S, [assumed('supply.capacity_per_day', 1000, 'units/day', base), assumed('anything.else', 1, 'furlongs', base)], null);
    expect(v).toBe(2);
    const X2 = await declare(processOwner, 'process', 'Regensburg line 2');
    expect(await version(processOwner, X2, [assumed('line.capacity_per_day:l2', 900, 'units/day', base), assumed('line.availability', 0.9, 'ratio', base)])).toBe(1);
    expect((await measures(processOwner, X2))['measures']).toMatchObject({ throughput_per_day: 810 });
  }, 120_000);
});

describe('C4 · the extension surface (tenant/domain twin kinds)', () => {
  const schema = { 'turbine.output': { unit: 'MW', description: 'rated output', required: true }, 'turbine.hub_height': { unit: 'm', description: 'hub height', required: false } };
  it('positive: a domain administrator registers x-wind-farm; it is listed for this domain, a twin of it is declared and admitted under its schema', async () => {
    const r = await comp.registerKind(req(dadmin, 'twin.kind.register', 'TWK', null), T, D, { payload: { kind: 'x-wind-farm', description: 'An onshore wind farm of the domain', elementSchema: schema } }) as { kind: Row; receipt: Row };
    expect(r.kind).toMatchObject({ kind: 'x-wind-farm', family: 'extension', material_keys: ['turbine.output'], tenant_id: T, domain_id: D });
    expect(typeof r.receipt['auditSeq']).toBe('number');
    const listed = (await comp.listKinds(req(analyst, 'twin.read', 'TWN', null), T, D) as { kinds: Row[] }).kinds.find((k) => k['kind'] === 'x-wind-farm');
    expect(listed).toMatchObject({ family: 'extension', scope: 'domain' });
    const W = await declare(supplyOwner, 'x-wind-farm', 'Oberpfalz wind farm');
    expect(await version(supplyOwner, W, [assumed('turbine.output', 4.2, 'MW', base)])).toBe(1);
    const w2 = await openDraft(supplyOwner, W, null);
    expect((await refusal(ground(supplyOwner, W, w2, [assumed('turbine.output', 4200, 'kW', base)]))).message).toMatch(/^family validation refused \(extension\) at grounding: turbine\.output: unit kW — the kind declares MW/);
    await ground(supplyOwner, W, w2, [assumed('turbine.output', 4.5, 'MW', base)]);
    await admit(supplyOwner, W, w2);
    expect(await events(twinSubject('x-wind-farm'), 'kind.registered')).toHaveLength(1);
  });

  it('refusal: a duplicate name; a non-x- name; a twin owner (the PDP); another tenant\'s and another domain\'s x- kind', async () => {
    expect((await refusal(comp.registerKind(req(dadmin, 'twin.kind.register', 'TWK', null), T, D, { payload: { kind: 'x-wind-farm', description: 'Another wind farm kind', elementSchema: schema } }))).status).toBe(409);
    expect((await refusal(comp.registerKind(req(dadmin, 'twin.kind.register', 'TWK', null), T, D, { payload: { kind: 'wind-farm', description: 'A product-looking name', elementSchema: schema } }))).status).toBe(422);
    expect((await refusal(comp.registerKind(req(supplyOwner, 'twin.kind.register', 'TWK', null), T, D, { payload: { kind: 'x-solar-park', description: 'A solar park of the domain', elementSchema: schema } }))).status).toBe(403);
    // Another tenant's kind and another domain's kind, planted as their own registrations would have written them.
    const otherTenant = uuidv7(); const otherDomain = uuidv7();
    await sql`insert into twin.twin_kind_schemas (kind, description, material_keys, family, element_schema, tenant_id, domain_id, registered_by)
              values ('x-foreign-kind', 'another tenant''s kind', ARRAY['a.b'], 'extension', '{"a.b": {"unit": null, "description": "x", "required": true}}'::jsonb, ${otherTenant}::uuid, ${otherDomain}::uuid, ${uuidv7()}::uuid),
                     ('x-sibling-kind', 'another domain''s kind', ARRAY['a.b'], 'extension', '{"a.b": {"unit": null, "description": "x", "required": true}}'::jsonb, ${T}::uuid, ${otherDomain}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const kinds = (await comp.listKinds(req(analyst, 'twin.read', 'TWN', null), T, D) as { kinds: Row[] }).kinds.map((k) => k['kind']);
    expect(kinds).not.toContain('x-foreign-kind');
    expect(kinds).not.toContain('x-sibling-kind');
    for (const k of ['x-foreign-kind', 'x-sibling-kind']) {
      const r = await refusal(declare(supplyOwner, k, 'A twin of a kind registered elsewhere'));
      expect(r.status, k).toBe(422);
      expect(r.message).toMatch(new RegExp(`twin kind ${k} is not registered`));
    }
    // The trigger holds whatever path inserts the twin (the foreign key alone would accept it).
    const direct = await refusal(sql`insert into twin.twins_current (twin_id, scope, tenant_id, domain_id, kind, title, statement, boundary, owner_principal_id, behaviour_model_ref, validation, declared_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'x-foreign-kind', 'direct insert', 'a direct insert', ${JSON.stringify([entityId])}::jsonb, ${supplyOwner.principalId}::uuid,
              'supply-flow@1', '{"status": "unvalidated", "limitations": []}'::jsonb, ${supplyOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
    expect(direct.status).toBe(403);
    expect(direct.message).toMatch(/^twin kind rejected \(scope\): kind x-foreign-kind is not registered in this tenant and domain/);
  });

  it('recovery: another name registers; the refused names left nothing behind', async () => {
    const r = await comp.registerKind(req(dadmin, 'twin.kind.register', 'TWK', null), T, D, { payload: { kind: 'x-solar-park', description: 'A solar park of the domain', elementSchema: schema } }) as { kind: Row };
    expect(r.kind['kind']).toBe('x-solar-park');
    const n = (await sql<{ n: number }>`select count(*)::int n from twin.twin_kind_schemas where kind in ('wind-farm')`.execute(h.su)).rows[0]?.n;
    expect(n).toBe(0);
  });
});

describe('C3 · interfaces: composition contracts and approved uses', () => {
  it('positive: the owners publish; the contract is versioned, announced and mirrored into the twin\'s interfaces', async () => {
    const s = await publish(supplyOwner, S, { 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } }, ['capacity-planning'], ['flow', 'discrete-event']);
    expect(s.contract).toMatchObject({ contract_version: 1, supersedes: null });
    const p = await publish(processOwner, P, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'on-admission' }, 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } }, ['capacity-planning']);
    expect(p.contract['contract_version']).toBe(1);
    const iface = (await sql<{ i: Row }>`select interfaces i from twin.twins_current where twin_id = ${P}::uuid`.execute(h.su)).rows[0]?.i as Row;
    expect(iface['contract']).toMatchObject({ version: 1, exposed: ['line.capacity_per_day:l1', 'supply.capacity_per_day'], decision_classes: ['capacity-planning'] });
    expect(await events(S, 'contract.published')).toHaveLength(1);
    // twin.use_approved — part C's run check: the approved families only; a twin without a contract restricts nothing; no family, no use.
    const ua = async (twin: string, fam: string | null) => (await sql<{ ok: boolean }>`select twin.use_approved(${twin}::uuid, ${fam}) ok`.execute(h.su)).rows[0]?.ok;
    expect(await ua(S, 'flow')).toBe(true);
    expect(await ua(S, 'war-gaming')).toBe(false);
    expect(await ua(E, 'war-gaming')).toBe(true);
    expect(await ua(S, null)).toBe(false);
  });

  it('refusal: a contract published by someone else; an undeclared key; a unit off the schema; a non-family use; a role without the action', async () => {
    const r1 = await refusal(publish(supplyOwner, P, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'daily' } }, ['capacity-planning']));
    expect(r1).toMatchObject({ status: 403 });
    expect(r1.message).toMatch(/^twin contract rejected \(ownership\)/);
    expect((await refusal(publish(processOwner, P, { 'line.speed': { unit: 'm/s', cadence: 'daily' } }, ['capacity-planning']))).message).toMatch(/^twin contract rejected \(schema\): key line\.speed is not an element the process kind declares/);
    expect((await refusal(publish(processOwner, P, { 'line.capacity_per_day:l1': { unit: 'units/week', cadence: 'daily' } }, ['capacity-planning']))).status).toBe(422);
    expect((await refusal(publish(processOwner, P, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'daily' } }, ['capacity-planning'], ['astrology']))).status).toBe(422);
    expect((await refusal(publish(operator, P, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'daily' } }, ['capacity-planning']))).status).toBe(403);
    expect((await sql<{ n: number }>`select count(*)::int n from twin.twin_contracts where twin_id = ${P}::uuid`.execute(h.su)).rows[0]?.n).toBe(1);
  });

  it('recovery: a new version supersedes the old one and keeps what the dependants may need', async () => {
    const p2 = await publish(processOwner, P, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'on-admission' }, 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } },
      ['capacity-planning'], ['discrete-event', 'flow']);
    expect(p2.contract).toMatchObject({ contract_version: 2, supersedes: 1 });
    const rows = (await sql<{ v: number; state: string }>`select contract_version v, state from twin.twin_contracts where twin_id = ${P}::uuid order by 1`.execute(h.su)).rows;
    expect(rows).toEqual([{ v: 1, state: 'superseded' }, { v: 2, state: 'current' }]);
  });
});

describe('C2 · twin-to-twin dependency links, coupled state and ownership boundaries; dependency completeness', () => {
  it('positive: enterprise ← process ← supply-chain linked; an upstream capacity change propagates by proposals the downstream owners apply; the enterprise measure moves; completeness 2/3', async () => {
    const sp = await link(processOwner, S, P, [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }]);
    expect(sp.link).toMatchObject({ state: 'live', contract_version: 1, use: 'capacity-planning' });
    await link(enterpriseOwner, P, E, [{ from: 'line.capacity_per_day:l1', to: 'process.line_capacity_per_day:regensburg' }, { from: 'supply.capacity_per_day', to: 'process.supply_capacity_per_day:regensburg' }]);
    expect(await completeness(enterpriseOwner, E)).toMatchObject({ required: ['market', 'process', 'supply-chain|supply-network'], linked: ['process', 'supply-chain'], direct: ['process'],
      missing: ['market'], required_count: 2 + 1, satisfied_count: 2, ratio: 0.6667 });
    expect(await completeness(processOwner, P)).toMatchObject({ missing: [], ratio: 1 });
    // THE BASELINE ROUND: the corridor admits 1000 units/day → the process owner applies and admits → the enterprise owner applies and admits.
    const s3 = await version(supplyOwner, S, [assumed('supply.capacity_per_day', 1000, 'units/day', base)]);
    const pp = await proposals(processOwner, P, 'proposed');
    expect(pp).toHaveLength(1);
    const digest = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_type = 'TWN' and object_id = ${S}::uuid and object_version = ${s3}`.execute(h.su)).rows[0]?.d;
    expect(pp[0]?.['upstream_citation']).toEqual({ kind: 'twin', id: S, version: s3, digest });
    expect((pp[0]?.['elements'] as Row[]).map((e) => [e['key'], e['from_key'], e['value']])).toEqual([['supply.capacity_per_day', 'supply.capacity_per_day', 1000]]);
    const p2 = await applyAndAdmit(processOwner, P);
    const coupled = (await sql<{ citations: Row[]; kind: string }>`select citations, kind from twin.state_elements where twin_id = ${P}::uuid and version = ${p2.version} and key = 'supply.capacity_per_day'`.execute(h.su)).rows[0];
    expect(coupled?.kind).toBe('assumed');
    expect(coupled?.citations).toEqual([{ kind: 'evidence', id: base.id, version: base.version, digest: expect.any(String) }, { kind: 'twin', id: S, version: s3, digest }]);
    const carried = (await sql<{ n: number }>`select count(*)::int n from twin.state_elements where twin_id = ${P}::uuid and version = ${p2.version} and key = 'line.capacity_per_day:l1'`.execute(h.su)).rows[0]?.n;
    expect(carried).toBe(1);
    await applyAndAdmit(enterpriseOwner, E);
    expect((await measures(enterpriseOwner, E))['measures']).toMatchObject({ capacity_utilisation: 0.8, effective_capacity_per_day: 1000 });
    // THE CHANGE: the corridor's capacity drops to 62% (620 units/day).
    await version(supplyOwner, S, [assumed('supply.capacity_per_day', 620, 'units/day', cut)]);
    await applyAndAdmit(processOwner, P);
    expect((await measures(processOwner, P))['measures']).toMatchObject({ throughput_per_day: 620, bottleneck: 'supply' });
    const e3 = await applyAndAdmit(enterpriseOwner, E);
    const em = await measures(enterpriseOwner, E);
    expect(em).toMatchObject({ version: e3.version, measures: { capacity_utilisation: 1.2903, effective_capacity_per_day: 620 } });
    // The enterprise's coupled element carries the whole chain: the record, the corridor's version and the process's version.
    const chain = (await sql<{ citations: Array<{ kind: string; id: string }> }>`select citations from twin.state_elements where twin_id = ${E}::uuid and version = ${e3.version} and key = 'process.supply_capacity_per_day:regensburg'`.execute(h.su)).rows[0]?.citations;
    expect(chain?.map((c) => `${c.kind}:${c.id === S ? 'S' : c.id === P ? 'P' : 'record'}`)).toEqual(['evidence:record', 'twin:S', 'twin:P']);
    const deps = (await sql<{ n: number }>`select count(*)::int n from graph.dependencies where dependent_object_id = ${E}::uuid and depends_on_kind = 'twin' and depends_on_id = ${P}::uuid`.execute(h.su)).rows[0]?.n;
    expect(deps).toBeGreaterThanOrEqual(1);
    expect((await events(P, 'coupling.proposed')).length).toBe(2);
    expect((await events(P, 'coupling.applied')).length).toBe(2);
  });

  it('refusal: the upstream owner never writes the downstream twin; links by the wrong owner, on an uncontracted key, for an unapproved use, to an uncontracted twin, closing a cycle', async () => {
    await version(supplyOwner, S, [assumed('supply.capacity_per_day', 620, 'units/day', cut)]);
    const pending = (await proposals(processOwner, P, 'proposed'))[0] as Row;
    const pid = String(pending['proposal_id']);
    const up = await refusal(apply(supplyOwner, pid));
    expect(up.status).toBe(403);
    expect(up.message).toMatch(/^coupling rejected \(ownership_boundary\): the owner of upstream twin .* does not write downstream twin/);
    expect((await refusal(decline(supplyOwner, pid, 'the upstream owner tries to decide'))).message).toMatch(/^coupling rejected \(ownership_boundary\)/);
    expect((await refusal(apply(enterpriseOwner, pid))).message).toMatch(/^coupling rejected \(ownership\)/);
    expect((await refusal(apply(analyst, pid))).status).toBe(403); // the PDP: no twin_owner role
    // …nor around the coupling: the corridor's owner holds twin_owner in the domain, yet opening a version of the process twin is refused.
    const around = await refusal(openDraft(supplyOwner, P, null));
    expect(around.status).toBe(403);
    expect(around.message).toMatch(/^coupling rejected \(ownership_boundary\): the owner of upstream twin .* does not write downstream twin .* \(version\.opened refused\)/);
    expect((await sql<{ n: number }>`select count(*)::int n from twin.twin_versions where twin_id = ${P}::uuid and state = 'draft'`.execute(h.su)).rows[0]?.n).toBe(0);
    const wrong = await refusal(link(supplyOwner, S, P, [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }]));
    expect(wrong).toMatchObject({ status: 403 });
    expect(wrong.message).toMatch(/^twin link rejected \(ownership\)/);
    const X = await declare(processOwner, 'process', 'Regensburg line 3');
    const key = await refusal(link(processOwner, P, X, [{ from: 'line.availability', to: 'line.availability' }]));
    expect(key.status).toBe(422);
    expect(key.message).toMatch(/^twin link rejected \(uncontracted_key\): key line\.availability is not in the current contract \(version 2\)/);
    const use = await refusal(link(processOwner, P, X, [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }], 'pricing'));
    expect(use.status).toBe(422);
    expect(use.message).toMatch(/^twin link rejected \(use_not_approved\)/);
    const noContract = await refusal(link(enterpriseOwner, M, E, [{ from: 'demand.index', to: 'market.demand_index' }]));
    expect(noContract.status).toBe(409);
    expect(noContract.message).toMatch(/^twin link rejected \(uncontracted\): twin .* publishes no contract/);
    // A cycle: the enterprise publishes its demand; the corridor's owner links it back upstream (S → P → E → S).
    await publish(enterpriseOwner, E, { 'demand.per_day': { unit: 'units/day', cadence: 'daily' } }, ['capacity-planning']);
    const cyc = await refusal(link(supplyOwner, E, S, [{ from: 'demand.per_day', to: 'demand.per_day' }]));
    expect(cyc.status).toBe(422);
    expect(cyc.message).toMatch(/^twin link rejected \(cycle\)/);
    expect((await refusal(link(processOwner, E, P, [{ from: 'demand.per_day', to: 'supply.capacity_per_day' }]))).message).toMatch(/^twin link rejected \(cycle\)/);
    // A contract that would strand a live link (the process consumes the corridor's capacity).
    const strand = await refusal(publish(supplyOwner, S, { 'other.key': { unit: null, cadence: 'daily' } }, ['capacity-planning']));
    expect(strand.status).toBe(409);
    expect(strand.message).toMatch(/^twin contract rejected \(live_link\)/);
    // The pending proposal is still the process owner's to apply.
    await applyAndAdmit(processOwner, P);
    await applyAndAdmit(enterpriseOwner, E);
  });

  it('recovery: the market publishes a contract → its link succeeds → completeness 3/3; a declined proposal is re-proposed by the next upstream admission', async () => {
    await publish(enterpriseOwner, M, { 'demand.index': { unit: 'index', cadence: 'monthly' } }, ['capacity-planning'], ['system-dynamics']);
    await link(enterpriseOwner, M, E, [{ from: 'demand.index', to: 'market.demand_index' }]);
    expect(await completeness(enterpriseOwner, E)).toMatchObject({ linked: ['market', 'process', 'supply-chain'], missing: [], satisfied_count: 3, ratio: 1 });
    await version(enterpriseOwner, M, [assumed('demand.index', 110, 'index', later)]);
    const first = (await proposals(enterpriseOwner, E, 'proposed'))[0] as Row;
    await decline(enterpriseOwner, String(first['proposal_id']), 'the index moved on a one-off order; not taken');
    expect((await refusal(apply(enterpriseOwner, String(first['proposal_id'])))).status).toBe(409);
    expect(await events(E, 'coupling.declined')).toHaveLength(1);
    await version(enterpriseOwner, M, [assumed('demand.index', 115, 'index', later)]);
    const again = await proposals(enterpriseOwner, E, 'proposed');
    expect(again).toHaveLength(1);
    expect(again[0]?.['proposal_id']).not.toBe(first['proposal_id']);
    expect((again[0]?.['elements'] as Row[])[0]?.['value']).toBe(115);
    await applyAndAdmit(enterpriseOwner, E);
    const idx = (await sql<{ value: number }>`select e.value from twin.state_elements e where e.twin_id = ${E}::uuid and e.key = 'market.demand_index' order by e.version desc limit 1`.execute(h.su)).rows[0]?.value;
    expect(idx).toBe(115);
  });

  it('recovery: an open draft known before the upstream admission is refused, then the proposal applies once it is admitted; a proposal pending across an API restart is applied from a fresh application context', async () => {
    const draft = await openDraft(processOwner, P, null);
    await ground(processOwner, P, draft, [assumed('line.capacity_per_day:l1', 1000, 'units/day', base)]);
    await version(supplyOwner, S, [assumed('supply.capacity_per_day', 700, 'units/day', later)]);
    const pending = (await proposals(processOwner, P, 'proposed'))[0] as Row;
    const conflict = await refusal(apply(processOwner, String(pending['proposal_id'])));
    expect(conflict.status).toBe(409);
    expect(conflict.message).toMatch(/^coupling rejected \(draft_conflict\)/);
    await admit(processOwner, P, draft);
    // THE RESTART: a second application context over the same database — nothing of the proposal lives in memory.
    let fresh: INestApplicationContext | null = null;
    try {
      const { AppModule } = await import('../../src/app.module.js');
      const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
      fresh = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const a = await apply(processOwner, String(pending['proposal_id']), fresh.get(Cc));
      expect(a.applied).toMatchObject({ opened: true, keys: ['supply.capacity_per_day'] });
      await admit(processOwner, P, Number(a.applied['version']));
    } finally { await fresh?.close(); }
    expect((await measures(processOwner, P))['measures']).toMatchObject({ throughput_per_day: 700 });
  });

  it('recovery: a retired link stops propagation — its pending proposal superseded, the next upstream admission proposes nothing; completeness back to 2/3', async () => {
    await version(enterpriseOwner, M, [assumed('demand.index', 120, 'index', later)]);
    const pending = (await proposals(enterpriseOwner, E, 'proposed')).filter((p) => p['upstream_twin_id'] === M);
    expect(pending).toHaveLength(1);
    const lk = (await comp.listLinks(req(enterpriseOwner, 'twin.read', 'TWN', E), T, D, { payload: { twinId: E, state: 'live' } }) as { links: Row[] }).links.find((l) => l['upstream_twin_id'] === M) as Row;
    const lid = String(lk['link_id']);
    expect((await refusal(comp.retireLink(req(supplyOwner, 'twin.link.retire', 'TWL', lid), T, D, lid, { payload: { reason: 'not mine to retire at all' } }))).status).toBe(403);
    const r = await comp.retireLink(req(enterpriseOwner, 'twin.link.retire', 'TWL', lid), T, D, lid, { payload: { reason: 'the market index is read elsewhere now' } }) as { link: Row };
    expect(r.link).toMatchObject({ state: 'retired', proposals_superseded: 1 });
    expect((await refusal(apply(enterpriseOwner, String(pending[0]?.['proposal_id'])))).status).toBe(409);
    expect((await refusal(comp.retireLink(req(enterpriseOwner, 'twin.link.retire', 'TWL', lid), T, D, lid, { payload: { reason: 'a second retirement' } }))).status).toBe(409);
    const before = (await sql<{ n: number }>`select count(*)::int n from twin.coupling_proposals where link_id = ${lid}::uuid`.execute(h.su)).rows[0]?.n;
    await version(enterpriseOwner, M, [assumed('demand.index', 125, 'index', later)]);
    const after = (await sql<{ n: number }>`select count(*)::int n from twin.coupling_proposals where link_id = ${lid}::uuid`.execute(h.su)).rows[0]?.n;
    expect(after).toBe(before);
    expect(await completeness(enterpriseOwner, E)).toMatchObject({ missing: ['market'], ratio: 0.6667 });
    expect(await events(E, 'link.retired')).toHaveLength(1);
  });
});

/** The event-log subject of a kind (twin.kind_subject). */
function twinSubject(kind: string): string {
  // md5('twin-kind:' || kind)::uuid, computed as Postgres does (the 32 hex digits hyphenated 8-4-4-4-12).
  const hex = createHash('md5').update(`twin-kind:${kind}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
