/**
 * CP-6 batch B2 — WARNING LEVELS (migration 0061; register R-4 (1)).
 *
 * Four levels — low, normal, high, critical — derived by a VERSIONED rule from the C0–C4 class of
 * the consequence a branch's flip reaches, stating impact and response urgency; confidence and the
 * C0–C4 authority class kept explicit and distinct: a label never changes decision authority.
 *
 *   AU-PRD-0090  every raised warning carries a level from the current derivation and the version
 *                it was derived under — all five classes exercised, and the absent-class rule (a
 *                branch that declares no class raises a C2 ASSUMED warning, and says so);
 *   AU-PRD-0091  a change of derivation is a new version; existing warnings keep theirs (v1 rows
 *                cannot be edited; a v2 moves the current derivation; the raised warning's columns
 *                are immutable; everything rolled back leaves nothing behind);
 *   AU-PRD-0092  the level never changes the operation's consequence class or the authority a
 *                response requires: a critical label on a C1 raise records op_class C1; the
 *                acknowledge rule is a person's role, alike for a low and a critical warning; a
 *                canonical object whose level disagrees with the derivation is REFUSED by the port
 *                and the branch stays owed until an honest raise recovers it.
 * Through the real database and controllers (Phase4Harness), on the synthetic disruption series.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { ScenariosService } from '../../src/prediction/scenarios/scenarios.service.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let controller: PredictionController;
let owner: AuthenticatedPrincipal; let ownerId = '';
let seriesKey = ''; let knownAt = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

type Level = { level: string | null; level_version: number | null; urgency: string | null; consequence_class: string | null; consequence_class_source: string | null; op_class: string | null };
const levelOf = async (warningId: string): Promise<Level | undefined> =>
  (await sql<Level>`select level, level_version, urgency, consequence_class, consequence_class_source, op_class from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(h.su)).rows[0];
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), code: null, message: String((e.getResponse() as { message?: string }).message ?? '') };
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};

/** An indicator that breaches on the November episode, and a scenario with one flipping branch of the given class. */
async function flippingBranch(label: string, consequenceClass: string | null, over: Record<string, unknown> = {}, as = owner, purpose = 'prediction') {
  const ind = await controller.defineIndicator(h.req(as, 'prediction.indicator.define', 'IND', null, purpose), T(), D(),
    { payload: { seriesKey, description: `transits below 40 for five days (${label})`, comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
  const scn = await controller.declareScenario(h.req(as, 'prediction.scenario.declare', 'SCN', null, purpose), T(), D(),
    { payload: { title: `Corridor — ${label}`, statement: 'what we expect, and what would change it', forecastId: null, owner: ownerId, reviewCadence: 'weekly',
      branches: [
        { name: 'Baseline', kind: 'baseline', statement: 'transits at seasonal level', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
        { name: 'Collapse', kind: 'downside', statement: 'transits stay below 40/day for five days', indicatorId: ind.indicator.indicatorId, signpost: 'five days under 40',
          owner: ownerId, consequence: 'rebook the third shipment before the window closes', responseWindowHours: 48,
          ...(consequenceClass === null ? {} : { consequenceClass }), ...over },
      ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  return { indicatorId: ind.indicator.indicatorId, scenarioId: scn.scenario.scenarioId, branchId: (scn.scenario.branches.find((b) => b.kind === 'downside') as { branchId: string }).branchId };
}
type Raised = { evaluation: { flips: unknown[] }; warnings: Array<{ warningId: string; branchId: string; level: string; levelVersion: number; urgency: string; response: string; consequenceClass: string; consequenceClassSource: string; opClass: string }> };
const evaluate = (indicatorId: string, as = owner, envelopeClass = 'C2') => {
  const r = h.req(as, 'prediction.indicator.evaluate', 'IND', indicatorId) as unknown as { eyeEnvelope: { consequence_class: string } };
  r.eyeEnvelope.consequence_class = envelopeClass;
  return controller.evaluateIndicator(r as never, T(), D(), indicatorId, { payload: { knownAt } }) as Promise<Raised>;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  controller = h.app.get(P);
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'forecast-owner');
  ownerId = owner.principalId;
  const { sourceKey } = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  knownAt = new Date().toISOString();
  seriesKey = `fixture:${sourceKey}:value`;
  await controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), T(), D(),
    { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('B2 · the derivation is a versioned record', () => {
  it('v1 is complete: five classes, four levels, an absent-class rule, a source; an unknown class or an incomplete version is refused', async () => {
    const versions = (await sql<{ version: number; source: string; absent_class_rule: string }>`select version, source, absent_class_rule from prediction.warning_level_versions order by version`.execute(h.su)).rows;
    expect(versions.map((v) => v.version)).toEqual([1]);
    expect(versions[0]?.source).toMatch(/Volume 5 ch\. 58/);
    expect(versions[0]?.absent_class_rule).toMatch(/C2 assumed/);
    const rows = (await sql<{ consequence_class: string; level: string; urgency: string; response: string }>`select consequence_class, level, urgency, response from prediction.warning_level_derivations where version = 1 order by consequence_class`.execute(h.su)).rows;
    expect(rows).toEqual([
      { consequence_class: 'C0', level: 'low', urgency: 'routine', response: 'acknowledge' },
      { consequence_class: 'C1', level: 'low', urgency: 'routine', response: 'acknowledge' },
      { consequence_class: 'C2', level: 'normal', urgency: 'prompt', response: 'acknowledge' },
      { consequence_class: 'C3', level: 'high', urgency: 'urgent', response: 'acknowledge-and-act' },
      { consequence_class: 'C4', level: 'critical', urgency: 'immediate', response: 'act' },
    ]);
    expect((await failure(sql`select * from prediction.derive_warning_level('C5', null)`.execute(h.su))).code).toBe('22023');
    expect((await failure(sql`select * from prediction.derive_warning_level('C2', 99)`.execute(h.su))).message).toMatch(/incomplete/);
    expect((await sql<{ v: number }>`select prediction.current_warning_level_version() v`.execute(h.su)).rows[0]?.v).toBe(1);
  });
});

describe('B2 · every raised warning carries a level from the current derivation (AU-PRD-0090)', () => {
  it('a declared C3 branch flips: level high / urgency urgent from derivation v1, the class it was derived from, the version, and the authority class beside it', async () => {
    const b = await flippingBranch('declared C3', 'C3', { decisionDeadline: '2030-01-01T00:00:00Z' });
    expect((await sql<{ c: string }>`select consequence_class c from prediction.branches_current where branch_id = ${b.branchId}::uuid`.execute(h.su)).rows[0]?.c).toBe('C3');
    const added = (await sql<{ details: Record<string, unknown> }>`select details from prediction.scenario_events where branch_id = ${b.branchId}::uuid and event = 'branch.added'`.execute(h.su)).rows[0];
    expect(added?.details['consequence_class']).toBe('C3');
    const r = await evaluate(b.indicatorId);
    expect(r.evaluation.flips.length).toBe(1);
    expect(r.warnings.length).toBe(1);
    const w = r.warnings[0] as Raised['warnings'][number];
    expect(w).toMatchObject({ level: 'high', levelVersion: 1, urgency: 'urgent', response: 'acknowledge-and-act', consequenceClass: 'C3', consequenceClassSource: 'declared', opClass: 'C2' });
    expect(await levelOf(w.warningId)).toEqual({ level: 'high', level_version: 1, urgency: 'urgent', consequence_class: 'C3', consequence_class_source: 'declared', op_class: 'C2' });
    const ev = (await sql<{ details: Record<string, unknown> }>`select details from prediction.warning_events where warning_id = ${w.warningId}::uuid and event = 'warning.raised'`.execute(h.su)).rows[0];
    expect(ev?.details).toMatchObject({ level: 'high', level_version: 1, urgency: 'urgent', response: 'acknowledge-and-act', consequence_class: 'C3', consequence_class_source: 'declared', op_class: 'C2' });
    // The canonical object takes WRN@v2 and VALIDATES against the registered schema — the first schema check ever run on this path.
    const obj = (await sql<{ schema_ref: string; payload: Record<string, unknown> }>`select schema_ref, payload from objects.canonical_objects where object_id = ${w.warningId}::uuid`.execute(h.su)).rows[0];
    expect(obj?.schema_ref).toBe('WRN@v2');
    const schema = (await sql<{ json_schema: Record<string, unknown> }>`select json_schema from objects.schema_registry where object_type = 'WRN' and schema_version = 'v2'`.execute(h.su)).rows[0]?.json_schema;
    const ajv = new Ajv2020({ strict: false });
    const valid = ajv.validate(schema as object, obj?.payload);
    expect(valid, JSON.stringify(ajv.errors)).toBe(true);
    expect(obj?.payload['level']).toMatchObject({ value: 'high', version: 1, urgency: 'urgent', response: 'acknowledge-and-act' });
    expect(obj?.payload['authority']).toEqual({ op_class: 'C2' });
    expect(obj?.payload['confidence']).toBe(0.8);
    const outbox = (await sql<{ payload: Record<string, unknown> }>`select payload from objects.object_outbox where event_type = 'EarlyWarningRaised' and payload ->> 'warning_id' = ${w.warningId}`.execute(h.su)).rows[0];
    expect(outbox?.payload).toMatchObject({ level: 'high', level_version: 1, urgency: 'urgent', consequence_class: 'C3', consequence_class_source: 'declared', op_class: 'C2' });
    const listed = await controller.listWarnings(h.req(owner, 'prediction.read', 'WRN', null), T(), D(), { payload: {} }) as { warnings: Array<Record<string, unknown>> };
    expect(listed.warnings.find((x) => x['warning_id'] === w.warningId)).toMatchObject({ level: 'high', level_version: 1, urgency: 'urgent' });
  }, 120_000);

  it('the absent-class rule: a branch that declares no class raises a warning classed C2 ASSUMED, level normal, and the record says assumed; C0 and C1 → low, C4 → critical', async () => {
    const none = await flippingBranch('no class declared', null);
    const r = await evaluate(none.indicatorId);
    expect(await levelOf((r.warnings[0] as { warningId: string }).warningId)).toEqual({ level: 'normal', level_version: 1, urgency: 'prompt', consequence_class: 'C2', consequence_class_source: 'assumed', op_class: 'C2' });
    for (const [cls, level, urgency] of [['C0', 'low', 'routine'], ['C1', 'low', 'routine'], ['C4', 'critical', 'immediate']] as const) {
      const b = await flippingBranch(`declared ${cls}`, cls);
      const x = await evaluate(b.indicatorId);
      expect(await levelOf((x.warnings[0] as { warningId: string }).warningId), cls).toEqual({ level, level_version: 1, urgency, consequence_class: cls, consequence_class_source: 'declared', op_class: 'C2' });
    }
    // A class outside Volume 5's five is refused at declaration, by the service and by the port alike.
    const bad = await failure(flippingBranch('C9', 'C9'));
    expect(bad.status).toBe(422);
    expect(bad.message).toMatch(/consequenceClass must be one of C0–C4/);
  }, 180_000);
});

describe('B2 · a change of derivation is a new version; existing warnings keep theirs (AU-PRD-0091)', () => {
  it('v1 cannot be edited; a v2 moves the current derivation while v1 stays resolvable; the raised warning is immutable; the trial leaves nothing behind', async () => {
    const b = await flippingBranch('kept under v1', null);
    const w = (await evaluate(b.indicatorId)).warnings[0] as { warningId: string };
    const conn = h.su;
    await conn.transaction().execute(async (tx) => {
      expect((await failure(sql`update prediction.warning_level_derivations set level = 'high' where version = 1 and consequence_class = 'C2'`.execute(tx))).message).toMatch(/append-only/i);
      await sql`savepoint s1`.execute(tx).catch(() => undefined);
    }).catch(() => undefined);
    // A version 2 in a transaction that is rolled back: the current version moves, v1 remains resolvable, the old warning keeps v1.
    let seen: Record<string, unknown> = {};
    await conn.transaction().execute(async (tx) => {
      await sql`insert into prediction.warning_level_versions (version, source, absent_class_rule) values (2, 'trial', 'C2 assumed')`.execute(tx);
      for (const [c, l, u, r] of [['C0', 'low', 'routine', 'acknowledge'], ['C1', 'low', 'routine', 'acknowledge'], ['C2', 'high', 'urgent', 'acknowledge-and-act'], ['C3', 'high', 'urgent', 'acknowledge-and-act'], ['C4', 'critical', 'immediate', 'act']]) {
        await sql`insert into prediction.warning_level_derivations (version, consequence_class, level, urgency, response, impact, basis) values (2, ${c}, ${l}, ${u}, ${r}, 'trial derivation row', 'trial')`.execute(tx);
      }
      const now = (await sql<{ out_version: number; out_level: string }>`select out_version, out_level from prediction.derive_warning_level('C2', null)`.execute(tx)).rows[0];
      const old = (await sql<{ out_version: number; out_level: string }>`select out_version, out_level from prediction.derive_warning_level('C2', 1)`.execute(tx)).rows[0];
      const kept = (await sql<{ level: string; level_version: number }>`select level, level_version from prediction.warnings_current where warning_id = ${w.warningId}::uuid`.execute(tx)).rows[0];
      seen = { now, old, kept };
      // The raised warning's columns are immutable even to the superuser.
      const upd = await failure(sql`update prediction.warnings_current set level = 'high', level_version = 2 where warning_id = ${w.warningId}::uuid`.execute(tx));
      seen['update'] = upd;
      throw new Error('rollback the trial');
    }).catch((e: Error) => { if (e.message !== 'rollback the trial') throw e; });
    expect(seen['now']).toEqual({ out_version: 2, out_level: 'high' });
    expect(seen['old']).toEqual({ out_version: 1, out_level: 'normal' });
    expect(seen['kept']).toEqual({ level: 'normal', level_version: 1 });
    expect((seen['update'] as { code: string; message: string }).code).toBe('42501');
    expect((seen['update'] as { code: string; message: string }).message).toMatch(/never rewritten/);
    // Nothing of the trial remains: a fresh raise is levelled under v1.
    expect((await sql<{ v: number }>`select prediction.current_warning_level_version() v`.execute(h.su)).rows[0]?.v).toBe(1);
    const again = await flippingBranch('after the trial', null);
    const w2 = (await evaluate(again.indicatorId)).warnings[0] as { warningId: string };
    expect((await levelOf(w2.warningId))?.level_version).toBe(1);
  }, 180_000);
});

describe('B2 · the level never changes the operation\'s consequence class or the authority a response requires (AU-PRD-0092)', () => {
  it('a critical label on a C1 raise records op_class C1, and so does a low one; the policy decision carries the envelope\'s class', async () => {
    const crit = await flippingBranch('critical under C1', 'C4');
    const low = await flippingBranch('low under C1', 'C0');
    const wc = (await evaluate(crit.indicatorId, owner, 'C1')).warnings[0] as { warningId: string };
    const wl = (await evaluate(low.indicatorId, owner, 'C1')).warnings[0] as { warningId: string };
    expect(await levelOf(wc.warningId)).toMatchObject({ level: 'critical', op_class: 'C1' });
    expect(await levelOf(wl.warningId)).toMatchObject({ level: 'low', op_class: 'C1' });
    for (const id of [wc.warningId, wl.warningId]) {
      const corr = (await sql<{ correlation_id: string }>`select correlation_id::text from prediction.warnings_current where warning_id = ${id}::uuid`.execute(h.su)).rows[0]?.correlation_id;
      const pol = (await sql<{ consequence_class: string }>`select consequence_class from policy.policy_decisions where correlation_id = ${corr}::uuid and action = 'prediction.warning.raise'`.execute(h.su)).rows;
      expect(pol.length).toBeGreaterThanOrEqual(1);
      expect(pol.every((p) => p.consequence_class === 'C1'), 'the raise policy decision did not carry the envelope class').toBe(true);
    }
    // ACKNOWLEDGEMENT is a person's act by role, alike for the critical and the low warning: an agent is refused on both, the owner allowed on both.
    const agent = await h.principalWith(['forecast_agent'], 'forecast-agent');
    for (const id of [wc.warningId, wl.warningId]) {
      expect((await failure(controller.acknowledgeWarning(h.req(agent, 'prediction.warning.acknowledge', 'WRN', id), T(), D(), id, { payload: { note: 'an agent answering' } }))).status).toBe(403);
      const ok = await controller.acknowledgeWarning(h.req(owner, 'prediction.warning.acknowledge', 'WRN', id), T(), D(), id, { payload: { note: 'a person answering for it' } }) as { warning: { state: string } };
      expect(ok.warning.state).toBe('acknowledged');
    }
    // The acknowledged rows keep their level columns untouched (the immutability trigger let the acknowledgement through).
    expect(await levelOf(wc.warningId)).toMatchObject({ level: 'critical', level_version: 1, op_class: 'C1' });
  }, 180_000);

  it('the port is the enforcement: a canonical object whose level disagrees with the derivation is refused, the branch stays owed, and the next honest raise recovers it', async () => {
    const b = await flippingBranch('port refuses an unsupported severity', null);
    const svc = h.app.get(ScenariosService);
    const spy = vi.spyOn(svc, 'levelFor').mockResolvedValueOnce({ version: 1, level: 'critical', urgency: 'immediate', response: 'act', impact: 'forged' });
    const refused = await failure(evaluate(b.indicatorId));
    spy.mockRestore();
    expect(refused.status).toBe(409);
    expect(refused.message).toMatch(/disagrees with derivation v1 for class C2/);
    expect(refused.message).toMatch(/OWE a warning/);
    const branch = (await sql<{ state: string; warning_state: string }>`select state, warning_state from prediction.branches_current where branch_id = ${b.branchId}::uuid`.execute(h.su)).rows[0];
    expect(branch).toEqual({ state: 'flipped', warning_state: 'owed' });
    expect(Number((await sql<{ n: string }>`select count(*)::text n from prediction.warnings_current where branch_id = ${b.branchId}::uuid`.execute(h.su)).rows[0]?.n)).toBe(0);
    // The next evaluation recovers the owed flip with the honest label.
    const recovered = await evaluate(b.indicatorId);
    expect(recovered.evaluation.flips.length).toBe(0);
    expect(recovered.warnings.length).toBe(1);
    expect(await levelOf((recovered.warnings[0] as { warningId: string }).warningId)).toMatchObject({ level: 'normal', level_version: 1, consequence_class: 'C2', consequence_class_source: 'assumed' });
    expect((await sql<{ warning_state: string }>`select warning_state from prediction.branches_current where branch_id = ${b.branchId}::uuid`.execute(h.su)).rows[0]?.warning_state).toBe('raised');
    // And a direct rewrite of the class or the authority class is refused.
    expect((await failure(sql`update prediction.warnings_current set op_class = 'C4' where branch_id = ${b.branchId}::uuid`.execute(h.su))).code).toBe('42501');
  }, 180_000);
});
