/**
 * CP-6 B25 — act-found (the rehearsal of the B25 act on eye_demo_b25): A LONG HISTORY IS READ BEFORE THE WRITE OPENS.
 *
 * The corridor's real PortWatch history is ~8,900 evidence versions, each a governed retrieval: assembling it takes minutes. The B25 write
 * routes assembled the series INSIDE the governed write, whose commit capability lives 60 seconds (ctx.issue_commit) — on the real history
 * the routed issue, the validation, the grounded issue and the replay all answered 500 ("context is bound to action <none>") after reading
 * it. Reproduced here through the real controllers BEFORE the correction (a series read slowed past the capability's lifetime — the
 * failures ARE the reproduction), kept as the regression after: each route now reads the series first and writes after.
 *
 *   L1 · THE ROUTED ISSUE (portfolio/issue, the legacy rule's statistical path): issued.
 *   L2 · THE VALIDATION (registry/validations/run, a bayesian entry's rolling-origin backtest): recorded.
 *   L3 · THE GROUNDED ISSUE (forecasts/issue-grounded): issued and pinned.
 *   L4 · THE REPLAY of it: REPRODUCED.
 *   L5 · REFUSALS UNCHANGED: a refused plan reads no series (fast) and is ledgered as before; an unknown series is refused as before.
 *   L6 · THE LEGACY ISSUE (forecasts/issue, the route the scheduler-era callers use): issued (found after the act: the same read inside its write).
 *
 * SYNTHETIC history (the phase-4 fixture). The slow read is a spy delaying SeriesService.assemble by 61 s (fixture, said): ~5 minutes.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SeriesService } from '../../src/prediction/series/series.service.js';
import { ContextController } from '../../src/prediction/context/context.controller.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b25-long-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const SLOW_MS = 61_000;
let h: Phase4Harness; let series: SeriesService; let C: ContextController;
let P: import('../../src/prediction/prediction.controller.js').PredictionController;
let rg: import('../../src/prediction/registry/registry.controller.js').RegistryController;
let eriksen: AuthenticatedPrincipal; let petrovic: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal;
let SERIES = ''; let ASU = ''; let GROUNDED = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

/** FIXTURE: the series read slowed past the commit capability's 60 s — the real history's minutes, in miniature. */
async function slowly<X>(fn: () => Promise<X>): Promise<X> {
  const original = series.assemble.bind(series);
  const spy = vi.spyOn(series, 'assemble').mockImplementation(async (...a: Parameters<SeriesService['assemble']>) => { await new Promise((r) => setTimeout(r, SLOW_MS)); return original(...a); });
  try { return await fn(); } finally { spy.mockRestore(); }
}
async function refusalOf(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try { await p; } catch (e) {
    const m = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
    if (m !== null) return { status: m.getStatus(), message: String((m.getResponse() as Row)['message'] ?? '') };
    return { status: 500, message: e instanceof Error ? e.message : String(e) };
  }
  throw new Error('the call should have been refused');
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  series = h.app.get(SeriesService); C = h.app.get(ContextController);
  const { RegistryController: Rc } = await import('../../src/prediction/registry/registry.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  rg = h.app.get(Rc); const prediction = h.app.get(Pc); P = prediction; const graph = h.app.get(Gc);
  eriksen = await h.humanWithSession(['forecast_owner'], 'b25l-n-eriksen');
  petrovic = await h.humanWithSession(['method_steward'], 'b25l-h-petrovic');
  weber = await h.humanWithSession(['strategy_owner'], 'b25l-j-weber');
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  SERIES = `fixture:${sv.sourceKey}:value`;
  await prediction.registerSeries(h.req(eriksen, 'prediction.series.register', 'SER', null), T(), D(), { payload: { seriesKey: SERIES, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1',
    valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, subjectEntityId: null, attribution: 'Source: fixture statistics.', description: 'SYNTHETIC daily series (B25 act-found harness)' } } as never);
  // FIXTURE: the entity the assumption rests on
  const entity = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entity}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Suez Canal', 'suez canal', 'active', ${weber.principalId}::uuid, ${ec}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entity}::uuid, 'entity.created', ${weber.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: 'Suez Canal', normalized_name: 'suez canal', split_from: null })}::jsonb, ${ec}::uuid)`.execute(h.su);
  ASU = ((await graph.declare(h.req(weber, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'The series is read as published (SYNTHETIC)',
    statement: 'the counts are taken as the fixture publishes them', restsOn: [{ kind: 'entity', id: entity, rationale: 'the series is about this place' }] } } as never)) as { strategy: { objectId: string } }).strategy.objectId;
  // a bayesian entry, approved by its named steward (the validation's subject)
  const m = (await rg.propose(h.req(eriksen, 'prediction.registry.method.propose', 'FMR', null, 'prediction'), T(), D(), { payload: { methodKey: 'bayes_level', family: 'bayesian', horizons: ['30d'], steward: petrovic.principalId,
    description: 'Normal–linear level of the 60-day mean, weakly informative priors (SYNTHETIC)', declarations: { prior: { model: 'normal_linear', window_days: 60, intercept: { mean: 0, sd: 1000 }, slope_per_year: { mean: 0, sd: 100 } },
      alternatives: [{ label: 'no drift', prior: { model: 'normal_linear', window_days: 60, intercept: { mean: 0, sd: 1000 }, slope_per_year: { mean: 0, sd: 0.001 } } }] } } }) as { method: Row }).method;
  await rg.decide(h.req(petrovic, 'prediction.registry.method.approve', 'FMR', String(m['method_id']), 'prediction'), T(), D(), String(m['method_id']), { payload: { decision: 'approve', note: 'reviewed (SYNTHETIC harness)' } });
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B25 act-found · the series is read before the write opens (a long history outlives the 60-second commit capability)', () => {
  it('L1 · the ROUTED ISSUE on a slow history is ISSUED', async () => {
    const out = await slowly(() => rg.issue(h.req(eriksen, 'prediction.portfolio.issue', 'FCT', null, 'prediction'), T(), D(), { payload: { seriesKey: SERIES, horizon: '30d', assumptions: [ASU] } }) as Promise<{ forecast: Row }>);
    expect(out.forecast['forecastId']).toBeDefined();
    expect(out.forecast['method_ref']).toBe('seasonal_naive@1');
  }, 300_000);

  it('L2 · the VALIDATION on a slow history is RECORDED', async () => {
    const out = await slowly(() => rg.runValidation(h.req(eriksen, 'prediction.registry.validation.record', 'MVL', null, 'prediction'), T(), D(),
      { payload: { methodRef: 'bayes_level@1', seriesKey: SERIES, horizon: '30d', origins: 20, minOrigins: 20 } }) as Promise<{ validation: Row }>);
    expect(out.validation['validation_id']).toBeDefined();
    expect(Number(out.validation['origins'])).toBeGreaterThan(0);   // the SYNTHETIC history (2021–2023) carries what it carries
  }, 300_000);

  it('L3 · the GROUNDED ISSUE on a slow history is ISSUED and pinned; L4 · its REPLAY is REPRODUCED', async () => {
    const g = await slowly(() => C.issueGrounded(h.req(eriksen, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(), { payload: { seriesKey: SERIES, horizon: '90d', assumptions: [ASU], method: 'seasonal-naive' } }) as unknown as Promise<{ forecast: Row }>);
    GROUNDED = String(g.forecast['forecastId']);
    const row = (await sql<Row>`select information_set_id::text from prediction.forecasts_current where forecast_id = ${GROUNDED}::uuid`.execute(h.su)).rows[0]!;
    expect(row['information_set_id']).not.toBeNull();
    const r = await slowly(() => C.replay(h.req(eriksen, 'prediction.forecast.replay', 'FCT', GROUNDED, 'prediction'), T(), D(), GROUNDED) as unknown as Promise<{ replay: Row }>);
    expect(r.replay['outcome']).toBe('REPRODUCED');
  }, 400_000);

  it('L6 · the LEGACY ISSUE (forecasts/issue) on a slow history is ISSUED', async () => {
    const out = await slowly(() => P.issueForecast(h.req(eriksen, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(), { payload: { seriesKey: SERIES, horizon: '180d', assumptions: [ASU], method: 'seasonal-naive' } }) as Promise<{ forecast: Row }>);
    expect(out.forecast['forecastId']).toBeDefined();
  }, 300_000);

  it('L5 · REFUSALS UNCHANGED: a refused plan reads no series and is ledgered; an unknown series is refused as before', async () => {
    const spy = vi.spyOn(series, 'assemble');
    try {
      // no horizon policy in this domain: an EVENT plan is refused by the legacy rule — before any series is read
      const tk = (await rg.declareTarget(h.req(eriksen, 'prediction.registry.target.declare', 'FTG', null, 'prediction'), T(), D(), { payload: { targetKey: 'b25l.event', kind: 'event', unit: 'probability',
        title: 'an event target (SYNTHETIC)', definition: { series_key: SERIES, event: { comparator: '<', threshold: 1, consecutive: 1 } }, sources: { series: [SERIES] } } }) as { target: Row }).target;
      const steward2 = await h.humanWithSession(['domain_admin'], 'b25l-t-richter');
      await rg.decideTarget(h.req(steward2, 'prediction.registry.target.approve', 'FTG', String(tk['target_id']), 'prediction'), T(), D(), String(tk['target_id']), { payload: { decision: 'approve', note: 'reviewed (SYNTHETIC harness)' } });
      const r = await refusalOf(rg.issue(h.req(eriksen, 'prediction.portfolio.issue', 'FCT', null, 'prediction'), T(), D(), { payload: { targetKey: 'b25l.event', horizon: '30d', assumptions: [ASU] } }));
      expect(r.status).toBe(422); expect(r.message).toMatch(/^forecast rejected \(horizon\): b25l\.event at 30d is unsupported — no horizon policy is published/);
      expect(spy).not.toHaveBeenCalled();
      const u = await refusalOf(rg.issue(h.req(eriksen, 'prediction.portfolio.issue', 'FCT', null, 'prediction'), T(), D(), { payload: { seriesKey: 'b25l:no-such-series', horizon: '30d', assumptions: [ASU] } }));
      expect(u.status).toBe(404); expect(u.message).toMatch(/^forecast rejected \(unknown_series\)/);
    } finally { spy.mockRestore(); }
  }, 120_000);
});
