/**
 * CP-6 B29 §D (migration 0092, part D) — THE CONSTRAINT ENGINE (F-P5-05 clause 3: general constraint declaration and satisfaction —
 * topology, conservation, business rules), on a real database through the real routes, ports and gate, with named humans holding
 * sessions of their own (the ports compare the acting principal). Every scene is SYNTHETIC (NORDWERK's data is the demonstration's).
 *
 *   D1 · DECLARATION: a constraint steward declares the Regensburg warehouse capacity (pallets per day) and versions it; a domain
 *        administrator declares the network topology naming another steward; the sets, versions and events read back. Refused: ANOTHER
 *        steward versioning the set, a non-steward declaring (the PDP), a steward naming another steward, a duplicate key, a stale expected
 *        version, a malformed constraint, an unknown set. Recovered: the set's own steward versions on the current version.
 *   D2 · THE PLAN CHECK (business rules): a replenishment plan within capacity passes (200, recorded, pinned); the plan exceeding capacity is
 *        REFUSED (422 naming the constraint, its bound and the day), and a unit mismatch; the AMENDED plan passes.
 *   D3 · CONSERVATION AND TOPOLOGY, through the route and §C's gate: a balanced run output holds at the gate (its machine capability reads
 *        the sets outside any write; a run's check is §C's to record — no plan_checks row); a conservation break; a connected network holds;
 *        an unreachable demand site and a route through a retired site are refused; a domain that declares nothing is vacuously satisfied
 *        (setId null — its sets are not another domain's); named sets of which none applies, and a malformed subject, are INDETERMINATE; a
 *        plan handed to the gate is recorded with no principal; the gate's capability serves no set write.
 *   D4 · INDETERMINATE AND REPRODUCIBLE: a timed-out evaluation is indeterminate (409), recorded, never a pass, and the same plan under the
 *        full budget passes; a missing input is indeterminate; a check pinned to the version it ran against re-derives identically after the
 *        set is re-versioned (while a new check runs against the new version); a retired set is no longer checked, and naming it is
 *        indeterminate.
 *   D5 · THE GATE IN THE RUNTIME (§C ↔ §D, the real engine behind CONSTRAINT_GATE): NORDWERK's supply-flow@1 run opens with nothing
 *        declared for its inputs (vacuously satisfied) and completes with the declared conservation rule unable to read its outputs
 *        (INDETERMINATE, recorded on the run — never a pass); a declared bound on the magnet stock the inputs violate REFUSES the run before it
 *        exists (422 naming the set, the constraint, its bound and what the inputs hold); the steward's corrected bound lets it open.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ConstraintsController } from '../../src/twin/constraints/constraints.controller.js';
import type { ConstraintService } from '../../src/twin/constraints/constraint.service.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { RECORD_FILES, completeElements, type Evd } from './phase5-fixtures.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;

let h: Phase4Harness; let T: string; let D: string;
let api: ConstraintsController; let engine: ConstraintService;
let steward: AuthenticatedPrincipal; let steward2: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let twinOwner: AuthenticatedPrincipal; let planner: AuthenticatedPrincipal;
/** The sets: the warehouse capacity (steward), the network topology (steward2, named by the administrator), the bearing flows (steward). */
let CAP: string; let NET: string; let FLOW: string;

/** A refusal as the HTTP answer the filter would give (a port's text mapped by observation-errors), or 'ok'. */
async function refusal(p: Promise<unknown>): Promise<{ status: number | 'ok'; message: string; body: Row }> {
  try { await p; return { status: 'ok', message: '', body: {} }; } catch (e) {
    const body = e instanceof HttpException ? (e.getResponse() as Row) : {};
    const raw = e instanceof HttpException ? String(body['message'] ?? '') : (e instanceof Error ? e.message : String(e));
    const r = asObservationRefusal(e, uuidv7());
    if (r === null) throw e;
    return { status: r.getStatus(), message: raw, body };
  }
}
const req = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(p, action, type, id, 'twin');

const CAPACITY = { key: 'regensburg-pallets', kind: 'business_rule', title: 'Regensburg warehouse capacity', quantity: 'warehouse:regensburg.pallets',
                   op: '<=', value: 1800, unit: 'pallets', applies_to: ['plan'] };
const TOPOLOGY = { key: 'demand-served', kind: 'topology', title: 'Every demand site served', sources: { prefix: 'supply:' },
                   targets: { nodes: ['demand:munich', 'demand:vienna', 'demand:prague'] }, avoid: ['site:hamburg-old'], applies_to: ['plan'] };
const FLOWS = { key: 'bearing-balance', kind: 'conservation', title: 'Bearing stock conserved', stock_prefix: 'stock:', tolerance: 0.5, unit: 'units', applies_to: ['run_output'] };

const declare = (as: AuthenticatedPrincipal, payload: Row) => api.declare(req(as, 'simulation.constraint.declare', 'CST', null), T, D, { payload }) as Promise<{ set: Row }>;
const version = (as: AuthenticatedPrincipal, setId: string, payload: Row) => api.version(req(as, 'simulation.constraint.version', 'CST', setId), T, D, setId, { payload }) as Promise<{ set: Row }>;
const retire = (as: AuthenticatedPrincipal, setId: string, reason: string) => api.retire(req(as, 'simulation.constraint.retire', 'CST', setId), T, D, setId, { payload: { reason } }) as Promise<{ set: Row }>;
const check = (payload: Row, as = planner) => api.checkPlan(req(as, 'simulation.plan.check', 'CCK', null), T, D, { payload }) as Promise<{ check: Row; verdict: Row }>;
const readSet = (setId: string, as = analyst) => api.readSet(req(as, 'simulation.constraint.read', 'CST', setId), T, D, setId) as Promise<{ set: Row }>;
const reproduce = (checkId: string) => api.reproduce(req(analyst, 'simulation.constraint.read', 'CCK', checkId), T, D, checkId) as Promise<{ reproduction: Row }>;

/** The replenishment plan for calendar week 42: Regensburg inbound pallets per day. */
const pallets = (days: Array<[string, number]>, unit = 'pallets') => days.map(([date, value]) => ({ key: 'warehouse:regensburg.pallets', date, value, unit }));
const W42 = [['2026-10-12', 1650], ['2026-10-13', 1720], ['2026-10-14', 2350], ['2026-10-15', 1780], ['2026-10-16', 1600]] as Array<[string, number]>;
/** The amended plan: the 550 pallets over capacity on the 14th moved to the 17th — the same 9100 pallets, no day above 1800. */
const W42_AMENDED = [['2026-10-12', 1650], ['2026-10-13', 1720], ['2026-10-14', 1800], ['2026-10-15', 1780], ['2026-10-16', 1600], ['2026-10-17', 550]] as Array<[string, number]>;
const edges = (pairs: Array<[string, string]>) => pairs.map(([from, to]) => ({ from, to, kind: 'route' }));
const CONNECTED = edges([['supply:ningbo', 'port:hamburg'], ['port:hamburg', 'warehouse:regensburg'], ['warehouse:regensburg', 'demand:munich'],
                         ['warehouse:regensburg', 'demand:vienna'], ['warehouse:regensburg', 'demand:prague']]);
const bal = (stock: string, date: string | null, o: number, i: number, out: number, c: number) =>
  (['opening', 'inflow', 'outflow', 'closing'] as const).map((f, n) => ({ key: `${stock}.${f}`, date, value: [o, i, out, c][n] as number, unit: null }));
const checkRow = async (checkId: string) => (await sql<Row>`select * from simulation.plan_checks where check_id = ${checkId}::uuid`.execute(h.su)).rows[0] as Row;
const checkCount = async () => Number((await sql<{ n: number }>`select count(*)::int n from simulation.plan_checks where tenant_id = ${T}::uuid`.execute(h.su)).rows[0]?.n);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { ConstraintsController: Cc } = await import('../../src/twin/constraints/constraints.controller.js');
  const { ConstraintService: Cs } = await import('../../src/twin/constraints/constraint.service.js');
  api = h.app.get(Cc); engine = h.app.get(Cs);
  steward = await h.humanWithSession(['constraint_steward'], 'steward');
  steward2 = await h.humanWithSession(['constraint_steward'], 'steward-two');
  dadmin = await h.humanWithSession(['domain_admin'], 'domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'analyst');
  twinOwner = await h.humanWithSession(['twin_owner'], 'twin-owner');
  planner = await h.humanWithSession(['simulation_operator'], 'planner');
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('D1 · declaration: constraint sets declared and versioned by their steward', () => {
  it('positive: the steward declares the warehouse capacity and versions it; the administrator declares the topology naming another steward; all read back', async () => {
    const cap = await declare(steward, { setKey: 'regensburg-capacity', title: 'Regensburg warehouse capacity', constraints: [{ ...CAPACITY, value: 2000 }], note: 'initial capacity from the 2026 lease' });
    CAP = String(cap.set['set_id']);
    expect(cap.set).toMatchObject({ set_key: 'regensburg-capacity', steward_principal_id: steward.principalId, state: 'live', version: 1, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    // the stored constraint is the NORMALISED one (per: day added, fields in a fixed shape)
    expect((cap.set['constraints'] as Row[])[0]).toMatchObject({ key: 'regensburg-pallets', per: 'day', value: 2000 });
    const v2 = await version(steward, CAP, { expectedVersion: 1, constraints: [CAPACITY], note: 'the dock refit lowers the daily intake to 1800 pallets' });
    expect(v2.set).toMatchObject({ version: 2, prior_version: 1 });
    expect(v2.set['digest']).not.toBe(cap.set['digest']);

    const net = await declare(dadmin, { setKey: 'network-topology', title: 'Supply network topology', steward: steward2.principalId, constraints: [TOPOLOGY], note: 'the demand sites the corridor serves' });
    NET = String(net.set['set_id']);
    expect(net.set).toMatchObject({ steward_principal_id: steward2.principalId, version: 1 });
    const flow = await declare(steward, { setKey: 'bearing-flows', title: 'Bearing stock flows', constraints: [FLOWS], note: 'conservation of the bearing stock' });
    FLOW = String(flow.set['set_id']);

    const read = await readSet(CAP);
    expect(read.set).toMatchObject({ set_key: 'regensburg-capacity', current_version: 2, state: 'live' });
    expect((read.set['versions'] as Row[]).map((v) => v['version'])).toEqual([2, 1]);
    expect((read.set['events'] as Row[]).map((e) => e['event'])).toEqual(['set.declared', 'set.versioned']);
    const list = await api.listSets(req(analyst, 'simulation.constraint.read', 'CST', null), T, D, { payload: { state: 'live' } }) as { sets: Row[] };
    expect(list.sets.map((s) => [s['set_key'], (s['current'] as Row)['version']])).toEqual([['bearing-flows', 1], ['network-topology', 1], ['regensburg-capacity', 2]]);
  });

  it('refusal: another steward versioning the set; a non-steward declaring; a steward naming another steward; a duplicate; a stale version; malformed; unknown', async () => {
    const other = await refusal(version(steward2, CAP, { expectedVersion: 2, constraints: [{ ...CAPACITY, value: 9999 }], note: 'widen it' }));
    expect(other.status).toBe(403);
    expect(other.message).toMatch(/constraint set rejected \(not_steward\): set regensburg-capacity .* is stewarded by/);
    const other2 = await refusal(retire(steward2, CAP, 'retire someone else\'s set'));
    expect(other2.status).toBe(403);
    expect((await refusal(declare(twinOwner, { setKey: 'owner-rules', title: 'A twin owner\'s rules', constraints: [CAPACITY], note: 'not theirs to declare' }))).status).toBe(403);
    expect((await refusal(declare(analyst, { setKey: 'analyst-rules', title: 'An analyst\'s rules', constraints: [CAPACITY], note: 'not theirs to declare' }))).status).toBe(403);
    const naming = await refusal(declare(steward, { setKey: 'named-rules', title: 'Rules for another steward', steward: steward2.principalId, constraints: [CAPACITY], note: 'on their behalf' }));
    expect(naming).toMatchObject({ status: 403, message: expect.stringMatching(/\(steward\): .*domain administrator/) });
    const noRole = await refusal(declare(dadmin, { setKey: 'analyst-owned', title: 'Stewarded by an analyst', steward: analyst.principalId, constraints: [CAPACITY], note: 'an analyst is no steward' }));
    expect(noRole).toMatchObject({ status: 422, message: expect.stringMatching(/\(steward_role\)/) });
    expect((await refusal(declare(steward, { setKey: 'regensburg-capacity', title: 'Again', constraints: [CAPACITY], note: 'a second set on the key' }))).status).toBe(409);
    const stale = await refusal(version(steward, CAP, { expectedVersion: 1, constraints: [{ ...CAPACITY, value: 1700 }], note: 'from a stale read' }));
    expect(stale).toMatchObject({ status: 409, message: expect.stringMatching(/\(stale_version\): set regensburg-capacity is at version 2, not 1/) });
    const bad = await refusal(declare(steward, { setKey: 'bad-rules', title: 'Malformed', constraints: [{ ...CAPACITY, op: '<' }], note: 'a bad op' }));
    expect(bad).toMatchObject({ status: 422, message: expect.stringMatching(/op must be <=, >= or between/) });
    const same = await refusal(version(steward, CAP, { expectedVersion: 2, constraints: [CAPACITY], note: 'no change at all' }));
    expect(same).toMatchObject({ status: 422, message: expect.stringMatching(/\(unchanged\)/) });
    expect((await refusal(version(steward, uuidv7(), { expectedVersion: 1, constraints: [CAPACITY], note: 'nothing there' }))).status).toBe(404);
    // nothing of the refusals was written
    const sets = await sql<{ n: number }>`select count(*)::int n from simulation.constraint_sets where tenant_id = ${T}::uuid and domain_id = ${D}::uuid`.execute(h.su);
    expect(sets.rows[0]?.n).toBe(3);
    expect((await readSet(CAP)).set['current_version']).toBe(2);
  });

  it('recovery: the set\'s own steward versions it on the current version; the administrator may too — and neither changes the steward', async () => {
    const v3 = await version(steward, CAP, { expectedVersion: 2, constraints: [CAPACITY, { key: 'regensburg-floor', kind: 'business_rule', quantity: 'warehouse:regensburg.pallets', op: '>=', value: 0, unit: 'pallets', applies_to: ['plan'] }],
      note: 'a floor beside the ceiling' });
    expect(v3.set).toMatchObject({ version: 3, steward_principal_id: steward.principalId });
    const v4 = await version(dadmin, CAP, { expectedVersion: 3, constraints: [CAPACITY], note: 'the administrator restores the single ceiling' });
    expect(v4.set).toMatchObject({ version: 4, steward_principal_id: steward.principalId });
    const ev = (await readSet(CAP)).set['events'] as Row[];
    expect(ev.map((e) => (e['details'] as Row)['by_steward'] ?? null)).toEqual([null, true, true, false]);
  });
});

describe('D2 · the plan check: a replenishment plan against the warehouse capacity', () => {
  let passed: Row;
  it('positive: a replenishment plan within capacity passes — 200, recorded, pinned to the version it ran against', async () => {
    const ok = await check({ planKey: 'replenishment-' + 'w42-lean', quantities: pallets([['2026-10-12', 1650], ['2026-10-13', 1790]]), setKeys: ['regensburg-capacity'] });
    expect(ok.verdict).toMatchObject({ outcome: 'satisfied', setId: CAP, setVersion: 4, violations: [] });
    passed = ok.check;
    const row = await checkRow(String(ok.check['check_id']));
    expect(row).toMatchObject({ subject_kind: 'plan', subject_ref: 'replenishment-w42-lean', outcome: 'satisfied', checked_via: 'route', checked_by: planner.principalId, indeterminate_reason: null });
    expect(row['sets']).toEqual([{ set_id: CAP, set_key: 'regensburg-capacity', version: 4, digest: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
  });

  it('refusal: the plan exceeding capacity is refused (422 naming the constraint, its bound and the day) and recorded; a unit mismatch is refused', async () => {
    const over = await refusal(check({ planKey: 'replenishment-' + 'w42', quantities: pallets(W42), setKeys: ['regensburg-capacity'] }));
    expect(over.status).toBe(422);
    expect(over.message).toMatch(/^plan refused: replenishment-w42 violates 1 constraint — regensburg-pallets \(business_rule\): bound ≤ 1800 pallets per day, observed 2350 pallets on 2026-10-14/);
    const v = (over.body['verdict'] as Row);
    expect(v['outcome']).toBe('violated');
    expect(v['violations']).toEqual([{ constraintKey: 'regensburg-pallets', kind: 'business_rule', bound: '≤ 1800 pallets per day', observed: '2350 pallets on 2026-10-14',
      message: '[regensburg-capacity v4] Regensburg warehouse capacity: warehouse:regensburg.pallets exceeds the bound by 550 pallets on 2026-10-14' }]);
    const row = await checkRow(String((over.body['check'] as Row)['check_id']));
    expect(row).toMatchObject({ outcome: 'violated', subject_ref: 'replenishment-w42' });
    expect((row['violations'] as Row[])[0]).toMatchObject({ bound: '≤ 1800 pallets per day', observed: '2350 pallets on 2026-10-14', setKey: 'regensburg-capacity', setVersion: 4 });

    const tonnes = await refusal(check({ planKey: 'replenishment-' + 'w42-tonnes', quantities: pallets([['2026-10-12', 21]], 't'), setKeys: ['regensburg-capacity'] }));
    expect(tonnes.status).toBe(422);
    expect(tonnes.message).toMatch(/regensburg-pallets \(business_rule\): bound unit pallets, observed 21 t on 2026-10-12/);
    // a malformed plan is the caller's own request, before any check
    expect((await refusal(check({ planKey: 'no-units', quantities: [{ key: 'warehouse:regensburg.pallets', date: '2026-10-12', value: 5 }] }))).status).toBe(422);
    expect((await refusal(check({ planKey: 'loose', quantities: pallets([['2026-10-12', 1]]), budgetMs: 999_999 }))).message).toMatch(/never loosen/);
  });

  it('recovery: the amended plan (the 550 pallets moved to the 17th) passes', async () => {
    const amended = await check({ planKey: 'replenishment-' + 'w42', quantities: pallets(W42_AMENDED), setKeys: ['regensburg-capacity'] });
    expect(amended.verdict).toMatchObject({ outcome: 'satisfied', violations: [] });
    const history = await api.listChecks(req(analyst, 'simulation.constraint.read', 'CCK', null), T, D, { payload: { subjectKind: 'plan', subjectRef: 'replenishment-w42' } }) as { checks: Row[] };
    expect(history.checks.map((c) => c['outcome'])).toEqual(['satisfied', 'violated']);
    expect(passed['outcome']).toBe('satisfied');
  });
});

describe('D3 · conservation and topology, through the route and §C\'s gate', () => {
  const broken = () => ({ kind: 'run_output' as const, ref: uuidv7(), quantities: [...bal('stock:bearings', '2026-10-01', 400, 120, 180, 300)] });
  it('positive: a balanced run output holds at the gate (its machine capability reads the sets; a run check is recorded by §C); a connected network holds', async () => {
    const before = await checkCount();
    const out = { kind: 'run_output' as const, ref: uuidv7(), quantities: [...bal('stock:bearings', '2026-10-01', 400, 120, 180, 340), ...bal('stock:bearings', '2026-10-02', 340, 0, 90, 250)] };
    // every LIVE set is loaded (none named); only the conservation set applies to a run output — the verdict names it
    const v = await engine.check({ tenantId: T, domainId: D }, out);
    expect(v).toMatchObject({ outcome: 'satisfied', setId: FLOW, setVersion: 1, violations: [], checkId: null });
    const named = await engine.check({ tenantId: T, domainId: D }, out, ['bearing-flows']);
    expect(named).toMatchObject({ outcome: 'satisfied', setId: FLOW, setVersion: 1 });
    expect(await checkCount()).toBe(before); // a run's check is §C's record, not a plan check

    const net = await check({ planKey: 'network-w42', quantities: pallets([['2026-10-12', 100]]), edges: CONNECTED, setKeys: ['network-topology'] });
    expect(net.verdict).toMatchObject({ outcome: 'satisfied', setId: NET });
  });

  it('refusal: a conservation break at the gate; an unreachable demand site and a route through a retired site at the route', async () => {
    const v = await engine.check({ tenantId: T, domainId: D }, broken());
    expect(v).toMatchObject({ outcome: 'violated', setId: FLOW, setVersion: 1 });
    expect(v.violations).toEqual([{ constraintKey: 'bearing-balance', kind: 'conservation', bound: 'opening + inflow − outflow = closing ± 0.5 units',
      observed: '400 + 120 − 180 = 340, closing 300 units on 2026-10-01', message: '[bearing-flows v1] Bearing stock conserved: stock stock:bearings does not balance on 2026-10-01 — 40 units unaccounted for' }]);

    const cut = await refusal(check({ planKey: 'network-w42-cut', quantities: pallets([['2026-10-12', 100]]), setKeys: ['network-topology'],
      edges: edges([['supply:ningbo', 'port:hamburg'], ['port:hamburg', 'warehouse:regensburg'], ['warehouse:regensburg', 'demand:munich'], ['warehouse:regensburg', 'demand:vienna'], ['port:gdansk', 'demand:prague']]) }));
    expect(cut.status).toBe(422);
    expect(cut.message).toMatch(/demand-served \(topology\): bound reachable from supply:ningbo, observed demand:prague: no route/);
    const retired = await refusal(check({ planKey: 'network-w42-old', quantities: pallets([['2026-10-12', 100]]), setKeys: ['network-topology'],
      edges: [...CONNECTED.filter((e) => e.to !== 'demand:prague'), ...edges([['warehouse:regensburg', 'site:hamburg-old'], ['site:hamburg-old', 'demand:prague']])] }));
    expect(retired.status).toBe(422);
    expect(retired.message).toMatch(/bound no route through site:hamburg-old \(retired\), observed edge warehouse:regensburg → site:hamburg-old/);
    expect(retired.message).toMatch(/demand:prague: no route/);
  });

  it('recovery: nothing declared is vacuously satisfied; named sets of which none applies, a malformed subject and a bad scope are INDETERMINATE; a plan at the gate is recorded', async () => {
    const input = { kind: 'run_input' as const, ref: uuidv7(), quantities: [{ key: 'supply.capacity_per_day', date: null, value: 620, unit: 'units/day' }] };
    expect(await engine.check({ tenantId: T, domainId: D }, input)).toMatchObject({ outcome: 'satisfied', setId: null, violations: [] });
    // another domain of the tenant declares nothing — this domain's sets are not its sets (row security under the gate's capability)
    expect(await engine.check({ tenantId: T, domainId: uuidv7() }, { ...broken() })).toMatchObject({ outcome: 'satisfied', setId: null, violations: [] });
    const named = await engine.check({ tenantId: T, domainId: D }, input, ['regensburg-capacity']);
    expect(named).toMatchObject({ outcome: 'indeterminate', indeterminateReason: expect.stringMatching(/no declared constraint applies to a run_input subject/) });
    const malformed = await engine.check({ tenantId: T, domainId: D }, { kind: 'run_output', ref: '', quantities: [] });
    expect(malformed).toMatchObject({ outcome: 'indeterminate', checkId: null, indeterminateReason: expect.stringMatching(/malformed/) });
    const viaGate = await engine.check({ tenantId: T, domainId: D }, { kind: 'plan', ref: 'agent-draft-w42', quantities: pallets(W42) }, ['regensburg-capacity']);
    expect(viaGate).toMatchObject({ outcome: 'violated', setId: CAP });
    expect(await checkRow(String(viaGate.checkId))).toMatchObject({ subject_kind: 'plan', outcome: 'violated', checked_via: 'gate', checked_by: null });
    const wrongScope = await engine.check({ tenantId: T, domainId: 'not-a-domain' }, { kind: 'run_input', ref: 'r', quantities: [] });
    expect(wrongScope).toMatchObject({ outcome: 'indeterminate', checkId: null });
    // the gate's machine capability serves the check record and nothing else: a set write under it is refused by the port
    const refused = await h.app.get<import('../../src/shared/db.js').Db>((await import('../../src/shared/shared.module.js')).COMMIT_DB).transaction().execute(async (tx) => {
      await sql`select simulation.issue_constraint_gate_capability(${T}::uuid, ${D}::uuid, 'harness probe', 30)`.execute(tx);
      return sql`select simulation.retire_constraint_set(${CAP}::uuid, ${T}::uuid, ${D}::uuid, 'the gate may not retire sets', ${steward.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx)
        .then(() => 'written', (e: Error) => e.message);
    });
    expect(refused).toMatch(/context is bound to action simulation.constraint.gate, which this port does not serve/);
    // the capability is the commit pool's alone (the 0039 grant): the application role cannot mint it
    const shared = await import('../../src/shared/shared.module.js');
    const byApp = await h.app.get<import('../../src/shared/db.js').Db>(shared.APP_DB).transaction().execute(async (tx) =>
      sql`select simulation.issue_constraint_gate_capability(${T}::uuid, ${D}::uuid, 'harness probe', 30)`.execute(tx).then(() => 'minted', (e: Error) => e.message));
    expect(byApp).toMatch(/permission denied/);
  });
});

describe('D4 · indeterminate outcomes and reproducible checks', () => {
  let pinned: string;
  it('positive: a check pinned to the version it ran against re-derives identically', async () => {
    const over = await refusal(check({ planKey: 'replenishment-' + 'w43', quantities: pallets([['2026-10-19', 1790], ['2026-10-20', 1900]]), setKeys: ['regensburg-capacity'] }));
    expect(over.status).toBe(422);
    pinned = String((over.body['check'] as Row)['check_id']);
    const r = await reproduce(pinned);
    expect(r.reproduction).toMatchObject({ reproducible: true, matches: true, rederived: { outcome: 'violated', sets: [{ set_key: 'regensburg-capacity', version: 4 }] } });
  });

  it('refusal: a timed-out evaluation is INDETERMINATE (409), recorded, never a pass; a missing input is indeterminate', async () => {
    const timed = await refusal(check({ planKey: 'replenishment-' + 'w42-final', quantities: pallets(W42_AMENDED), setKeys: ['regensburg-capacity'], budgetMs: 0 }));
    expect(timed.status).toBe(409);
    expect(timed.message).toMatch(/is indeterminate — the evaluation exceeded its time budget of 0 ms after 0 of 1 constraints \(an indeterminate check is never a pass\)/);
    const row = await checkRow(String((timed.body['check'] as Row)['check_id']));
    expect(row).toMatchObject({ outcome: 'indeterminate', budget_ms: 0, violations: [], indeterminate_reason: expect.stringMatching(/time budget/) });
    const missing = await refusal(check({ planKey: 'other-site', quantities: [{ key: 'warehouse:linz.pallets', date: '2026-10-12', value: 5000, unit: 'pallets' }], setKeys: ['regensburg-capacity'] }));
    expect(missing).toMatchObject({ status: 409, message: expect.stringMatching(/has no quantity warehouse:regensburg.pallets/) });
    const unknown = await refusal(check({ planKey: 'unknown-set', quantities: pallets([['2026-10-12', 1]]), setKeys: ['no-such-set'] }));
    expect(unknown).toMatchObject({ status: 409, message: expect.stringMatching(/set no-such-set is not declared in this domain/) });
  });

  it('recovery: the same plan under the full budget passes; after a re-version the pinned check still re-derives against its own version while a new check uses the new one; a retired set is no longer checked', async () => {
    const full = await check({ planKey: 'replenishment-' + 'w42-final', quantities: pallets(W42_AMENDED), setKeys: ['regensburg-capacity'] });
    expect(full.verdict['outcome']).toBe('satisfied');

    // the steward RAISES the capacity (a new dock): the W43 plan would now pass — but the recorded check still says what it said
    await version(steward, CAP, { expectedVersion: 4, constraints: [{ ...CAPACITY, value: 2000 }], note: 'the new dock raises the daily intake to 2000 pallets' });
    const r = await reproduce(pinned);
    expect(r.reproduction).toMatchObject({ reproducible: true, matches: true, recorded: { outcome: 'violated' }, rederived: { outcome: 'violated', sets: [{ version: 4 }] },
                                           current_versions: [{ set_key: 'regensburg-capacity', version: 5 }] });
    const now = await check({ planKey: 'replenishment-' + 'w43', quantities: pallets([['2026-10-19', 1790], ['2026-10-20', 1900]]), setKeys: ['regensburg-capacity'] });
    expect(now.verdict).toMatchObject({ outcome: 'satisfied', setVersion: 5 });
    // a recorded pin cannot be forged: the port refuses a digest that is not the version's
    const forged = await refusal(h.pipeline.write(h.env(planner, 'simulation.plan.check', 'CCK', null, 'twin'), planner,
      { scope: 'DOMAIN', tenantId: T, domainId: D, action: 'simulation.plan.check', objectType: 'CCK', objectId: null },
      (await import('../../src/twin/constraints/constraint.capabilities.js')).ConstraintCapability.check, async (cap) => {
        const rec = await cap.recordCheck({ checkId: uuidv7(), tenantId: T, domainId: D, subjectKind: 'plan', subjectRef: 'forged', subject: { quantities: [] },
          sets: [{ set_id: CAP, set_key: 'regensburg-capacity', version: 4, digest: '0'.repeat(64) }], outcome: 'satisfied', violations: [], reason: null,
          budgetMs: 1, elapsedMs: 0, actor: planner.principalId, correlationId: uuidv7() });
        return { result: rec, targetType: 'CCK', targetId: String(rec['check_id']), targetVersion: '1', outboxEvent: null };
      }));
    expect(forged).toMatchObject({ status: 409, message: expect.stringMatching(/\(stale_pin\)/) });

    // the topology set's own steward retires it: no longer checked when every live set is; naming it is indeterminate
    const ret = await retire(steward2, NET, 'the corridor network is modelled by the supply-network twin now');
    expect(ret.set).toMatchObject({ state: 'retired', version: 1 });
    expect((await refusal(version(steward2, NET, { expectedVersion: 1, constraints: [TOPOLOGY], note: 'revive it' }))).status).toBe(409);
    const all = await check({ planKey: 'replenishment-' + 'w44', quantities: pallets([['2026-10-26', 1500]]) });
    expect(all.verdict['outcome']).toBe('satisfied');
    expect(((all.check['sets'] as Row[]) ?? []).map((s) => s['set_key'])).toEqual(['bearing-flows', 'regensburg-capacity']);
    const named = await refusal(check({ planKey: 'network-w44', quantities: pallets([['2026-10-26', 1]]), edges: CONNECTED, setKeys: ['network-topology'] }));
    expect(named).toMatchObject({ status: 409, message: expect.stringMatching(/set network-topology is retired/) });
    // the retired set's versions stay readable
    expect(((await readSet(NET)).set['versions'] as Row[]).length).toBe(1);
  });
});

describe('D5 · the gate in the runtime: §C asks the real engine at run opening and completion', () => {
  let twins: TwinController; let twinId = ''; let v1 = 0; let MAG = '';
  const supplyFlow = () => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG',
                              interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
  const run = () => twins.run(h.req(planner, 'simulation.run', 'SIM', null), T, D, { payload: supplyFlow() }) as Promise<{ run: Row }>;
  const runChecks = async (runId: string) => (await sql<Row>`select stage, outcome, set_id, set_version, violations, indeterminate_reason from simulation.run_constraint_checks
                                                             where run_id = ${runId}::uuid order by stage desc`.execute(h.su)).rows;
  beforeAll(async () => {
    const { TwinController: TC } = await import('../../src/twin/twin.controller.js');
    twins = h.app.get(TC);
    const up = await h.upload(RECORD_FILES());
    const records = { inv: up[0] as Evd, ship: up[1] as Evd, terms: up[2] as Evd };
    const entityId = uuidv7();
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'place', 'Regensburg plant', 'regensburg plant', 'active', ${twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const d = await twins.declare(h.req(twinOwner, 'twin.declare', 'TWN', null), T, D, { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain (constraint harness)',
      statement: 'the magnet chain the Regensburg line depends on', boundary: [entityId], owner: twinOwner.principalId, behaviourModelRef: 'supply-flow@1',
      validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    twinId = d.twin.twinId;
    const o = await twins.openVersion(h.req(twinOwner, 'twin.version', 'TWN', twinId), T, D, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
    await twins.ground(h.req(twinOwner, 'twin.ground', 'TWN', twinId), T, D, twinId, String(o.version.version), { payload: { elements: completeElements(records) } });
    await twins.admit(h.req(twinOwner, 'twin.version.admit', 'TWN', twinId), T, D, twinId, String(o.version.version), { payload: {} });
    v1 = o.version.version;
  }, 300_000);

  it('positive: nothing declared for the inputs opens the run (vacuously satisfied); the conservation rule that cannot read the outputs is INDETERMINATE on the run', async () => {
    const r = await run();
    expect(r.run['state']).toBe('completed');
    const checks = await runChecks(String(r.run['runId']));
    expect(checks.map((c) => [c['stage'], c['outcome']])).toEqual([['opening', 'satisfied'], ['completion', 'indeterminate']]);
    expect(checks[0]?.['set_id']).toBeNull();
    expect(String(checks[1]?.['indeterminate_reason'])).toMatch(/bearing-flows v1 · bearing-balance: the subject has no stock under stock:/);
  });

  it('refusal: a declared bound on the magnet stock the inputs violate refuses the run before it exists', async () => {
    const mag = await declare(steward, { setKey: 'magnet-cover', title: 'Magnet stock cover at Regensburg', note: 'the line needs 70 000 sets on hand',
      constraints: [{ key: 'magnet-on-hand', kind: 'business_rule', title: 'Magnet sets on hand', quantity: 'inventory.on_hand:SYN-PART-MAG', op: '>=', value: 70000, unit: 'sets', applies_to: ['run_input'] }] });
    MAG = String(mag.set['set_id']);
    const before = Number((await sql<{ n: number }>`select count(*)::int n from simulation.runs_current where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0]?.n);
    const refused = await refusal(run());
    expect(refused.status).toBe(422);
    expect(refused.message).toMatch(new RegExp(`^run rejected \\(constraint\\): the run's inputs violate constraint set ${MAG} v1: magnet-on-hand \\(business_rule\\): bound ≥ 70000 sets per day, observed 63400 sets on 2024-01-11`));
    expect(Number((await sql<{ n: number }>`select count(*)::int n from simulation.runs_current where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0]?.n)).toBe(before);
  });

  it('recovery: the steward corrects the bound to what the line needs; the run opens, its opening check names the set version', async () => {
    await version(steward, MAG, { expectedVersion: 1, note: 'the line needs 60 000 sets on hand (the revised safety cover)',
      constraints: [{ key: 'magnet-on-hand', kind: 'business_rule', title: 'Magnet sets on hand', quantity: 'inventory.on_hand:SYN-PART-MAG', op: '>=', value: 60000, unit: 'sets', applies_to: ['run_input'] }] });
    const r = await run();
    expect(r.run['state']).toBe('completed');
    const checks = await runChecks(String(r.run['runId']));
    expect(checks[0]).toMatchObject({ stage: 'opening', outcome: 'satisfied', set_id: MAG, set_version: 2 });
  });
});
