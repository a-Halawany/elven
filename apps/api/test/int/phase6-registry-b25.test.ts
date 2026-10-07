/**
 * CP-6 B25 §MR (0108, part `registry`) — THE GOVERNED MODEL REGISTRY, THE TARGETS, THE VERSIONED HORIZON POLICY, ROUTING, THE GOVERNED
 * UNSUPPORTED-HORIZON REFUSAL AND THE METHOD FAMILIES (F-P4-01: C-020, V00-T-004, V00-T-051, V02-T-059, V02-T-153, L6-C03, V03-T-125,
 * V03-T-320, V03-T-324, PR-32-001, CAP-FW-12, MC-012, MC-013, MC-015), through the real database and controllers (POST …/prediction/registry/…,
 * …/prediction/portfolio/issue, the legacy …/forecasts/issue), with named humans holding sessions of their own (the ports compare the acting
 * principal) and an AGENT principal (kind agent, its own session) that proposes and is refused every human act.
 *
 *   a THE REGISTRY (L6-C03) — the legacy methods read as approved builtins; an agent and a forecast owner propose; the NAMED steward approves;
 *     refusals: the agent at approval (human gate), a forecast owner (PDP), another steward (ownership), a self-named steward (SoD), a
 *     bayesian entry without explicit priors (the validator AND the port), a causal entry on an unknown ASU (the port); recovery: a rejected
 *     entry re-proposed as version 2 and approved.
 *   b THE TARGETS — the corridor target (an EVENT at 30d, a REGIME at 5y — definition.horizon_kinds); approved by a named human who did not
 *     declare it; refusals: an unregistered series, an event with no condition, a regime whose `otherwise` is not last, the declarer approving;
 *     recovery: version 2 declared and approved, the plan reads it.
 *   c THE HORIZON POLICY (V00-T-051, V02-T-153, V03-T-125) — published by the forecast owner, ACTIVE on the named steward's concurrence;
 *     before it, the legacy rule (an event forecast refused, naming the missing policy); refusals: scenario language on a quantity, a required
 *     validation without its minimum, a publisher naming themselves steward, another steward concurring; recovery: version 2 supersedes 1.
 *   d THE SCENE (F-P4-01) — N. Eriksen forecasts the corridor ("Bab el-Mandeb transit delay", SYNTHETIC) at 30d by the EVENT method
 *     (a probability within the intervention window, its credible band, its Brier/log-score backtest) and at 5y in REGIME LANGUAGE (structural
 *     judgement + counted evidence, scenario_language, never validated): different methods per horizon on one target. The tracker's scene: a
 *     3y horizon on the (SYNTHETIC, short) line-demand series is REFUSED naming the missing validation — ledgered as forecast.horizon_refused,
 *     no forecast issued; recovery: the quantity rolling-origin validation at 3y on the long history passes and the 3y forecast is issued
 *     `validated_retrospective`, its note saying SYNTHETIC DEMONSTRATION (never empirical validation).
 *   e BAYESIAN (MC-012) — explicit priors on the forecast, the posterior, the prior sensitivity (calm, and SENSITIVE under a strongly wrong
 *     declared alternative), the calibration check (the 5y rolling-origin validation).
 *   f CAUSAL (MC-013) — the intervention's effect with its band, the declared identification assumptions (ASUs), placebo, balance and
 *     sensitivity; refusal: a history that ends before the intervention (no quarantine); recovery: the history through it.
 *   g OPTIMISATION (MC-015) — the steward-approved objective and constraints, feasibility and the optimality gap; refusal: infeasible
 *     constraints (refused, the entry stays approved); recovery: the steward retires it and approves a corrected version.
 *   h AVAILABILITY AND QUARANTINE — an entry whose pinned digest is not this build's (a stated superuser move: "approved for other bytes") is
 *     QUARANTINED by the routed run and the plan lists it unavailable with its reason; on-demand quarantine (an agent refused), reinstatement
 *     by the named steward; METHOD_ROUTER (the seam §EN plans with) answers the registry's plan and throws the governed refusal.
 *   i ENFORCEMENT ON THE ROW (pmr_fct_routed) — an unapproved method_ref, a family the policy does not allow, scenario language on a quantity —
 *     refused at the port; the legacy issue (no method_ref) unchanged (default-off); a statistical builtin routed through ForecastingService.
 *   k B25 completion (the gaps the bookkeeping review found) — G3 MC-012 IDENTIFIABILITY (the variance contraction per parameter on the
 *     forecast; a parameter the data barely inform flagged WEAKLY IDENTIFIED); G4 MC-013 TRANSPORTABILITY (the declared scope: inside it
 *     the transport assumptions are carried and a multi-series scope's consistency is said NOT ASSESSED; outside it `forecast rejected
 *     (transport)`; an unknown transport ASU refused at proposal); G5 MC-015 ROBUSTNESS (the plan's feasibility, worst case and regret under
 *     each parameter scenario; an infeasible scenario named, NOT ROBUST); G6 V00-T-051 (the 5y regime's path-dependent view and the declared
 *     options' value and resilience, beside the issued probabilities). Each POSITIVE, REFUSAL and RECOVERY; SYNTHETIC declarations.
 *
 * THREE CLAIMS KEPT APART: every proof here is SOFTWARE CAPABILITY on a SYNTHETIC series (the fixture source's contract says
 * data_origin synthetic); the validations are SYNTHETIC DEMONSTRATIONS of the machinery. No EMPIRICAL validation is claimed: the real history
 * a 3y/5y validation needs (e.g. the ECB EUR/USD reference rate since 1999) is the act's to collect. The "Regensburg line demand" series of the
 * tracker's scene does not exist; the refusal is proven on a registered SYNTHETIC short series. Every count is scoped to this file's tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { RegistryController } from '../../src/prediction/registry/registry.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { PredictionCapability } from '../../src/prediction/prediction.capabilities.js';
import { METHOD_ROUTER, type MethodRouter } from '../../src/prediction/portfolio/seams.js';
import { RegistryMethodRouter, RoutedRefusal } from '../../src/prediction/registry/method-router.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { IMPLEMENTATION_DIGESTS } from '../../src/prediction/registry/methods/digests.js';
import { Phase4Harness, fakeEgress } from './phase4-helpers.js';
import { SYN_END, SYN_START, synValue } from '../unit/prediction/b25-synthetic.js';
import type { AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b25mr-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb;
let pc: PredictionController; let rg: RegistryController; let graph: GraphController;
/** N. Eriksen (forecast owner), H. Petrović (the method steward), a second steward, T. Richter (domain admin), J. Weber (strategy owner),
 *  A. Hoffmann (the analyst), a steward who is also a forecast owner (the self-naming probe), the forecast AGENT (kind agent). */
let eriksen: AuthenticatedPrincipal; let petrovic: AuthenticatedPrincipal; let steward2: AuthenticatedPrincipal; let richter: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal;
let hoffmann: AuthenticatedPrincipal; let dual: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal;
let entity = ''; let asuOpen = ''; let asuEscort = ''; let asuNoAnticipation = '';
let CORRIDOR = ''; let LINE = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await q.execute(su)).rows as Row[];
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const evidence = (clause: string, what: string, claim: 'software capability' | 'synthetic demonstration') => console.log(`B25 §MR EVIDENCE · ${clause} · ${claim} · ${what}`);

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), code: (r['code'] as string | undefined) ?? null, message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the calls ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
const read = (as = eriksen) => rg.read(req(as, 'prediction.registry.read', 'FMR'), T(), D()) as unknown as Promise<Row & { methods: Row[]; targets: Row[]; policies: Row[]; validations: Row[]; routes: Row[]; events: Row[] }>;
const planOf = (payload: Row, as = eriksen) => (rg.plan(req(as, 'prediction.registry.plan.read', 'FMR'), T(), D(), { payload }) as Promise<{ plan: Row & { methods: Row[] } }>).then((r) => r.plan);
const propose = (payload: Row, as = eriksen) => (rg.propose(req(as, 'prediction.registry.method.propose', 'FMR'), T(), D(), { payload }) as Promise<{ method: Row }>).then((r) => r.method);
const decide = (methodId: string, decision: 'approve' | 'reject', as = petrovic, note = 'reviewed the declarations and the implementation (SYNTHETIC)') =>
  (rg.decide(req(as, 'prediction.registry.method.approve', 'FMR', methodId), T(), D(), methodId, { payload: { decision, note } }) as Promise<{ method: Row }>).then((r) => r.method);
const approved = async (payload: Row, as = eriksen): Promise<Row> => decide(String((await propose(payload, as))['method_id']), 'approve');
const declareTarget = (payload: Row, as = eriksen) => (rg.declareTarget(req(as, 'prediction.registry.target.declare', 'FTG'), T(), D(), { payload }) as Promise<{ target: Row }>).then((r) => r.target);
const decideTarget = (id: string, as = richter, decision: 'approve' | 'reject' = 'approve') =>
  (rg.decideTarget(req(as, 'prediction.registry.target.approve', 'FTG', id), T(), D(), id, { payload: { decision, note: 'the definition is the indicator\'s (SYNTHETIC)' } }) as Promise<{ target: Row }>).then((r) => r.target);
const publish = (payload: Row, as = eriksen) => (rg.publishPolicy(req(as, 'prediction.registry.policy.publish', 'HZP'), T(), D(), { payload }) as Promise<{ policy: Row }>).then((r) => r.policy);
const concur = (id: string, as = petrovic, decision: 'concur' | 'reject' = 'concur') =>
  (rg.concurPolicy(req(as, 'prediction.registry.policy.concur', 'HZP', id), T(), D(), id, { payload: { decision, note: 'the treatment table and the validation bar are right (SYNTHETIC)' } }) as Promise<{ policy: Row }>).then((r) => r.policy);
const validate = (payload: Row, as = eriksen) => (rg.runValidation(req(as, 'prediction.registry.validation.record', 'MVL'), T(), D(), { payload }) as Promise<{ validation: Row }>).then((r) => r.validation);
const issue = (payload: Row, as = eriksen) => rg.issue(req(as, 'prediction.portfolio.issue', 'FCT'), T(), D(), { payload }) as Promise<{ forecast: Row; plan: Row }>;
const methodAct = (kind: 'retire' | 'quarantine' | 'reinstate', methodRef: string, as = petrovic) => {
  const action = `prediction.registry.method.${kind}`;
  const payload = kind === 'reinstate' ? { methodRef, note: 'the digest and the declarations were checked again (SYNTHETIC)' } : { methodRef, reason: `${kind}d by the steward on review (SYNTHETIC)` };
  const fn = kind === 'retire' ? rg.retire : kind === 'quarantine' ? rg.quarantine : rg.reinstate;
  return (fn.call(rg, req(as, action, 'FMR'), T(), D(), { payload }) as Promise<{ method: Row }>).then((r) => r.method);
};
const forecastRow = async (id: string): Promise<Row | undefined> => (await rows(sql`select * from prediction.forecasts_current where forecast_id = ${id}::uuid`))[0];
const forecastEvents = async (id: string): Promise<string[]> => (await rows(sql`select event from prediction.forecast_events where forecast_id = ${id}::uuid order by occurred_at`)).map((r) => String(r['event']));
const fctPayload = async (id: string): Promise<Row> => obj((await rows(sql`select payload, schema_ref from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`))[0]);

/* ───────────── the declarations (SYNTHETIC) ───────────── */
const H5 = ['30d', '90d', '180d', '1y', '3y', '5y'];
const NL = { model: 'normal_linear', window_days: 60, intercept: { mean: 60, sd: 20 }, slope_per_year: { mean: 0, sd: 2 } };
const policyRules = (over: Row = {}): Row => ({
  '30d': { treatment: 'intervention windows and freshness: what can still be acted on inside the month', allowed_families: ['event', 'statistical', 'bayesian', 'optimisation'],
           kinds: { event: { confidence_language: 'probability', validation: { required: false } }, quantity: { confidence_language: 'distribution', validation: { required: false } } } },
  '90d': { treatment: 'operational planning: distributions, with interventions estimated', allowed_families: ['statistical', 'bayesian', 'causal', 'event'],
           kinds: { quantity: { confidence_language: 'distribution', validation: { required: false } }, event: { confidence_language: 'probability', validation: { required: false } } } },
  '180d': { treatment: 'budget and capacity: distributions read beside scenarios', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
  '1y': { treatment: 'annual planning: distributions read beside scenarios', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
  '3y': { treatment: 'regimes and path dependence: a quantity only where measured at 3y, else regime language', allowed_families: ['bayesian', 'structural_judgmental'],
          kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: true, kind: 'quantity_rolling_origin', min_origins: 20, modes: ['historical', 'retrospective'] } },
                   regime: { confidence_language: 'scenario_language', validation: { required: false } } } },
  '5y': { treatment: 'regimes, path dependence, option value and resilience: scenario language', allowed_families: ['structural_judgmental', 'bayesian'],
          kinds: { regime: { confidence_language: 'scenario_language', validation: { required: false } },
                   quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: true, kind: 'quantity_rolling_origin', min_origins: 20, modes: ['historical', 'retrospective'] } } } },
  ...over,
});
const corridorTarget = (over: Row = {}): Row => ({
  targetKey: 'corridor.bab-el-mandeb.transit-delay', kind: 'event', unit: 'probability', title: 'Bab el-Mandeb transit delay (SYNTHETIC corridor)', subjectEntityId: entity,
  definition: { series_key: CORRIDOR, event: { comparator: '<', threshold: 41, consecutive: 5 }, horizon_kinds: { '3y': 'regime', '5y': 'regime' },
                regime: { classification_window_days: 90, categories: [{ key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } },
                  { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 58 } }, { key: 'open', label: 'open', rule: null }] } },
  sources: { series: [CORRIDOR], twin_elements: ['shock.corridor_delay_days'], note: 'the twin element is a declared FEATURE (§CX grounds it); the computation reads the transit series' },
  ...over,
});

function sdmx(from: string, toExclusive: string): string {
  const dates: string[] = []; const obs: Record<string, number[]> = {};
  for (let d = new Date(`${from}T00:00:00Z`), i = 0; d.toISOString().slice(0, 10) < toExclusive; d.setUTCDate(d.getUTCDate() + 1), i += 1) {
    const date = d.toISOString().slice(0, 10); dates.push(date); obs[String(i)] = [synValue(date)];
  }
  return JSON.stringify({ dataSets: [{ series: { '0:0:0:0:0': { observations: obs } } }], structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: dates.map((x) => ({ id: x })) }] } } });
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { RegistryController: Rc } = await import('../../src/prediction/registry/registry.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  pc = h.app.get(Pc); rg = h.app.get(Rc); graph = h.app.get(Gc);
  eriksen = await h.humanWithSession(['forecast_owner'], 'b25-n-eriksen');
  petrovic = await h.humanWithSession(['method_steward'], 'b25-h-petrovic');
  steward2 = await h.humanWithSession(['method_steward'], 'b25-steward-2');
  richter = await h.humanWithSession(['domain_admin'], 'b25-t-richter');
  weber = await h.humanWithSession(['strategy_owner'], 'b25-j-weber');
  hoffmann = await h.humanWithSession(['domain_analyst'], 'b25-a-hoffmann');
  dual = await h.humanWithSession(['forecast_owner', 'method_steward'], 'b25-dual');
  // THE AGENT: a principal of kind agent with the forecast_agent role and a session of its own (fixture scaffolding, stated).
  const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:forecast-drafter-${agentId.slice(-8)}`}, ${`fx-fagent-${agentId.slice(-8)}`}, 'active')`.execute(su);
  // it holds forecast_agent AND method_steward: the human gate, not a missing role, is what refuses its approvals
  for (const role of ['forecast_agent', 'method_steward']) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentId}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  }
  agent = { ...(await h.openSession({ ...eriksen, principalId: agentId, bindings: ['forecast_agent', 'method_steward'].map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T(), domainId: D() })) })),
            kind: 'agent' } as AuthenticatedPrincipal;

  // THE SYNTHETIC HISTORY: 2008-01-01 → 2023-12-31, daily, through the real REST path (the fixture source; data_origin synthetic).
  const sv = await h.newVersion({ from: SYN_START, to: SYN_END, windowDays: 366, budget: 24, controls: { data_origin: 'synthetic' } });
  const egress = fakeEgress((url) => {
    const q = new URL(url).searchParams;
    const end = new Date(`${q.get('endPeriod') as string}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    return sdmx(q.get('startPeriod') as string, end.toISOString().slice(0, 10));
  });
  const run = await h.runOnce(new RestConnector({ egress: egress.egress }));
  expect(run.state, run.reason).toBe('finished');
  // the corridor's subject and the assumptions (J. Weber's ASUs; SYNTHETIC)
  entity = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entity}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${weber.principalId}::uuid, ${ec}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entity}::uuid, 'entity.created', ${weber.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', normalized_name: 'bab el-mandeb strait', split_from: null })}::jsonb, ${ec}::uuid)`.execute(su);
  const asu = async (title: string, statement: string): Promise<string> => ((await graph.declare(h.req(weber, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title, statement,
    restsOn: [{ kind: 'entity', id: entity, rationale: 'the assumption is about this strait' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
  asuOpen = await asu('The corridor stays open (SYNTHETIC)', 'transits through Bab el-Mandeb continue at their seasonal level');
  asuEscort = await asu('Escort convoys began on 2023-06-01 and nothing else changed then (SYNTHETIC)', 'the only break in the transit series at 2023-06-01 is the escort programme');
  asuNoAnticipation = await asu('Carriers did not anticipate the escorts (SYNTHETIC)', 'no shift in transits before the escort programme was announced');
  CORRIDOR = `syn-corridor:${sv.sourceKey}:transits`;
  LINE = `syn-line-demand:${sv.sourceKey}`;
  for (const [key, desc, subject] of [[CORRIDOR, 'SYNTHETIC daily transits through the corridor (2008–2023)', entity], [LINE, 'SYNTHETIC line demand series — the tracker scene\'s stand-in (no Regensburg line demand series exists)', null]] as const) {
    await pc.registerSeries(h.req(eriksen, 'prediction.series.register', 'SER', null), T(), D(), { payload: { seriesKey: key, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE',
      unit: 'transits/day', seasonalityDays: 7, subjectEntityId: subject, attribution: 'Source: fixture statistics (SYNTHETIC).', description: desc } });
  }
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

/* ═══════════════════════════════════════ a · THE REGISTRY ═══════════════════════════════════════ */
let EVENT_ID = ''; let REGIME_ID = ''; let BAYES_ID = '';
describe('B25 §MR · a THE GOVERNED REGISTRY (L6-C03): builtins, proposals, the named steward', () => {
  it('a · POSITIVE: the legacy methods read as APPROVED builtins; an AGENT proposes the event entry, the forecast owner the others; the NAMED steward approves', async () => {
    const r0 = await read();
    const builtins = r0.methods.filter((m) => m['builtin'] === true).map((m) => [m['method_ref'], m['state'], m['implementation_digest']]);
    expect(builtins).toEqual([['holt_winters@1', 'approved', IMPLEMENTATION_DIGESTS['legacy-models']], ['seasonal_naive@1', 'approved', IMPLEMENTATION_DIGESTS['legacy-models']]]);
    const ev = await propose({ methodKey: 'event_rate', family: 'event', horizons: ['30d', '90d'], description: 'P(event within the window) from counted windows, Beta prior (SYNTHETIC)', steward: petrovic.principalId,
      declarations: { prior: { alpha: 1, beta: 1 } }, parameters: { min_windows: 12 } }, agent);
    expect(ev).toMatchObject({ method_ref: 'event_rate@1', state: 'proposed', proposed_by_kind: 'agent', implementation_ref: 'event-rate', implementation_digest: IMPLEMENTATION_DIGESTS['event-rate'] });
    EVENT_ID = String(ev['method_id']);
    const ok = await decide(EVENT_ID, 'approve');
    expect(ok).toMatchObject({ state: 'approved', decided_by: petrovic.principalId });
    const rj = await approved({ methodKey: 'regime_judgement', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['3y', '5y'], steward: petrovic.principalId,
      description: 'Regime probabilities from N. Eriksen\'s structural judgement and counted windows (SYNTHETIC)',
      declarations: { judgement: { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk in the strait over five years (SYNTHETIC judgement)', judged_by: eriksen.principalId } } });
    REGIME_ID = String(rj['method_id']);
    const by = await approved({ methodKey: 'bayes_level', family: 'bayesian', horizons: H5, steward: petrovic.principalId, description: 'Normal–linear level of the 60-day mean, explicit priors (SYNTHETIC)',
      declarations: { prior: NL, alternatives: [{ label: 'a wider vague prior', prior: { ...NL, intercept: { mean: 60, sd: 40 } } }] } });
    BAYES_ID = String(by['method_id']);
    const r1 = await read();
    expect(r1.methods.filter((m) => m['builtin'] !== true).map((m) => [m['method_ref'], m['state']]).sort()).toEqual([['bayes_level@1', 'approved'], ['event_rate@1', 'approved'], ['regime_judgement@1', 'approved']]);
    const ledger = (await rows(sql`select event from prediction.forecast_registry_events where tenant_id = ${T()}::uuid and subject_kind = 'method' order by occurred_at`)).map((x) => x['event']);
    expect(ledger).toEqual(['method.proposed', 'method.approved', 'method.proposed', 'method.approved', 'method.proposed', 'method.approved']);
    evidence('a', 'builtins approved; agent proposal; named steward approval; ledger', 'software capability');
  });

  it('a · REFUSAL: the agent at approval (human gate), a forecast owner (PDP), another steward (ownership), a self-named steward (SoD), no explicit priors (validator AND port), an unknown ASU (port)', async () => {
    const p = await propose({ methodKey: 'event_rate_alt', family: 'event', horizons: ['30d'], description: 'an alternative event entry (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: { alpha: 2, beta: 8 } } }, agent);
    const id = String(p['method_id']);
    await refused(decide(id, 'approve', agent), /^human gate: prediction\.registry\.method\.approve requires a named human principal/, 403);
    await refused(decide(id, 'approve', eriksen), /./, 403);
    await refused(decide(id, 'approve', steward2), /^forecast method rejected \(ownership\): event_rate_alt@1 names its steward/, 403);
    await refused(propose({ methodKey: 'self_named', family: 'event', horizons: ['30d'], description: 'a steward naming themselves (SYNTHETIC)', steward: dual.principalId, declarations: { prior: { alpha: 1, beta: 1 } } }, dual),
      /^forecast method rejected \(separation_of_duties\)/, 403);
    await refused(propose({ methodKey: 'bayes_noprior', family: 'bayesian', horizons: ['3y'], description: 'no alternatives declared (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: NL } }),
      /^forecast method rejected \(declarations\): a bayesian method declares the alternative priors/, 422);
    // the PORT insists on the same, whatever a caller sends past the validator
    const viaPort = h.pipeline.write(h.env(eriksen, 'prediction.registry.method.propose', 'FMR', null), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.registry.method.propose', objectType: 'FMR', objectId: null },
      (await import('../../src/prediction/registry/registry.capabilities.js')).RegistryCapability.method,
      async (cap) => ({ result: await cap.propose({ methodId: uuidv7(), tenantId: T(), domainId: D(), key: 'bayes_raw', version: 1, family: 'bayesian', kinds: ['quantity'], horizons: ['3y'],
        implementationRef: 'bayesian-conjugate', implementationDigest: IMPLEMENTATION_DIGESTS['bayesian-conjugate']!, parameters: {}, declarations: { prior: { model: 'normal_linear' } }, validation: {},
        description: 'past the validator (SYNTHETIC)', steward: petrovic.principalId, actor: eriksen.principalId, correlationId: uuidv7() }), targetType: 'FMR', targetId: null, targetVersion: null, outboxEvent: null }));
    await refused(viaPort, /^forecast method rejected \(declarations\): a bayesian method declares the alternative priors/, 422);
    await refused(propose({ methodKey: 'its_unknown', family: 'causal', horizons: ['90d'], description: 'an identification assumption that is not an ASU (SYNTHETIC)', steward: petrovic.principalId,
      declarations: { intervention: { date: '2023-06-01', description: 'escort convoys begin (SYNTHETIC)' }, identification: { assumptions: [uuidv7()], statement: 'nothing else changed then' }, pre_days: 365, post_days: 90,
        transport: { scope: [CORRIDOR], assumptions: [asuOpen], statement: 'the corridor series alone (SYNTHETIC)' } } }),   // B25 completion (G4): a valid transport, so the port's identification check is reached
      /^forecast method rejected \(unknown_assumption\)/, 404);
    await refused(propose({ methodKey: 'seasonal_naive', family: 'event', horizons: ['30d'], description: 'shadowing a builtin (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: { alpha: 1, beta: 1 } } }),
      /^forecast method rejected \(duplicate\): seasonal_naive is a builtin/, 409);
    evidence('a', 'human gate, PDP, ownership, SoD, declarations at validator and port, unknown ASU, builtin shadow', 'software capability');
  });

  it('a · RECOVERY: a rejected entry is re-proposed as version 2 and approved; the plan reads the approved version only', async () => {
    const v1 = await propose({ methodKey: 'event_rate_alt2', family: 'event', horizons: ['30d'], description: 'a first draft with a tight prior (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: { alpha: 20, beta: 1 } } }, agent);
    expect((await decide(String(v1['method_id']), 'reject'))['state']).toBe('rejected');
    await refused(decide(String(v1['method_id']), 'approve'), /^forecast method rejected \(state\): event_rate_alt2@1 is rejected/, 409);
    await refused(propose({ methodKey: 'event_rate_alt2', version: 1, family: 'event', horizons: ['30d'], description: 'the same version again (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: { alpha: 1, beta: 1 } } }),
      /^forecast method rejected \(duplicate\)/, 409);
    const v2 = await propose({ methodKey: 'event_rate_alt2', version: 2, family: 'event', horizons: ['30d'], description: 'version 2 with a Jeffreys prior (SYNTHETIC)', steward: petrovic.principalId, declarations: { prior: { alpha: 0.5, beta: 0.5 } } }, agent);
    expect((await decide(String(v2['method_id']), 'approve'))).toMatchObject({ method_ref: 'event_rate_alt2@2', state: 'approved' });
    evidence('a', 'rejected → v2 approved; state and duplicate refusals', 'software capability');
  });
});

/* ═══════════════════════════════════════ b · THE TARGETS ═══════════════════════════════════════ */
let TARGET_ID = '';
describe('B25 §MR · b THE GOVERNED TARGETS', () => {
  it('b · POSITIVE: the corridor target — an EVENT at 30d, a REGIME at 3y/5y — declared by the forecast owner, approved by a named human who did not declare it', async () => {
    const t = await declareTarget(corridorTarget());
    expect(t).toMatchObject({ target_key: 'corridor.bab-el-mandeb.transit-delay', version: 1, kind: 'event', state: 'proposed', declared_by: eriksen.principalId });
    TARGET_ID = String(t['target_id']);
    expect(await decideTarget(TARGET_ID)).toMatchObject({ state: 'approved', decided_by: richter.principalId });
    evidence('b', 'target declared and approved (SoD)', 'software capability');
  });
  it('b · REFUSAL: an unregistered series, an event with no condition, an `otherwise` not last, the declarer approving, the analyst declaring', async () => {
    await refused(declareTarget(corridorTarget({ targetKey: 'x.unknown', definition: { series_key: 'no-such-series', event: { comparator: '<', threshold: 1, consecutive: 1 } } })), /^forecast target rejected \(unknown_series\)/, 404);
    await refused(declareTarget(corridorTarget({ targetKey: 'x.nocond', definition: { series_key: CORRIDOR } })), /^forecast target rejected \(definition\): an event is defined by its condition/, 422);
    await refused(declareTarget(corridorTarget({ targetKey: 'x.regime', kind: 'regime', definition: { series_key: CORRIDOR, regime: { classification_window_days: 90, categories: [
      { key: 'open', label: 'open', rule: null }, { key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } }] } } })), /^forecast target rejected \(definition\): category 1/, 422);
    const own = await declareTarget(corridorTarget({ targetKey: 'x.own' }), richter);
    await refused(decideTarget(String(own['target_id']), richter), /^forecast target rejected \(separation_of_duties\)/, 403);
    await refused(declareTarget(corridorTarget({ targetKey: 'x.analyst' }), hoffmann), /./, 403);
    evidence('b', 'target refusals', 'software capability');
  });
  it('b · RECOVERY: version 2 of the target is declared and approved; the plan reads the highest APPROVED version', async () => {
    const v2 = await declareTarget(corridorTarget({ title: 'Bab el-Mandeb transit delay, v2 (SYNTHETIC corridor)' }));
    expect(v2['version']).toBe(2);
    const before = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '1y' });
    expect(obj(before['target'])['version']).toBe(1);
    await decideTarget(String(v2['target_id']));
    const after = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '1y' });
    expect(obj(after['target'])['version']).toBe(2);
    evidence('b', 'target v2 read after approval', 'software capability');
  });
});

/* ═══════════════════════════════════════ c · THE HORIZON POLICY ═══════════════════════════════════════ */
let POLICY_V1 = ''; let POLICY_V2 = '';
describe('B25 §MR · c THE VERSIONED HORIZON POLICY (V00-T-051, V02-T-153, V03-T-125)', () => {
  it('c · POSITIVE: before any policy the legacy rule refuses an event forecast; published v1 is inert until the named steward concurs', async () => {
    const legacy = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d' });
    expect(legacy['refusal']).toMatch(/^forecast rejected \(horizon\): corridor\.bab-el-mandeb\.transit-delay at 30d is unsupported — no horizon policy is published in this domain/);
    const q = await planOf({ seriesKey: CORRIDOR, horizon: '3y' });
    expect(q['refusal']).toBeNull();
    expect((q['methods'] as Row[]).map((m) => [m['method_ref'], m['available']])).toEqual([['seasonal_naive@1', true], ['holt_winters@1', true]]);   // integration: the seasonal baseline first in its family (the legacy order)
    const v1 = await publish({ riskClass: 'standard', statement: 'the corridor\'s horizon treatment, v1 (SYNTHETIC)', steward: petrovic.principalId, rules: policyRules() });
    POLICY_V1 = String(v1['policy_id']);
    expect(v1).toMatchObject({ state: 'proposed', version: 1 });
    expect((await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d' }))['refusal']).not.toBeNull();
    expect(await concur(POLICY_V1)).toMatchObject({ state: 'active', concurred_by: petrovic.principalId });
    const p30 = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d' });
    expect(p30).toMatchObject({ forecast_kind: 'event', confidence_language: 'probability', refusal: null });
    const p5 = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '5y' });
    expect(p5).toMatchObject({ forecast_kind: 'regime', confidence_language: 'scenario_language', refusal: null });
    expect((p30['methods'] as Row[]).filter((m) => m['available'] === true).map((m) => m['family'])).toContain('event');
    expect((p5['methods'] as Row[]).filter((m) => m['available'] === true).map((m) => m['method_ref'])).toEqual(['regime_judgement@1']);
    evidence('c', 'legacy rule, publish, concur, method and language by horizon', 'software capability');
  });
  it('c · REFUSAL: scenario language on a quantity, a required validation without its minimum, a self-named steward, another steward, the publisher', async () => {
    await refused(publish({ statement: 'bad v (SYNTHETIC)', steward: petrovic.principalId, rules: policyRules({ '1y': { treatment: 'annual planning, in words', allowed_families: ['bayesian'], kinds: { quantity: { confidence_language: 'scenario_language', validation: { required: false } } } } }) }),
      /^horizon policy rejected \(language\): scenario language is a state or regime forecast's/, 422);
    await refused(publish({ statement: 'bad v (SYNTHETIC)', steward: petrovic.principalId, rules: policyRules({ '3y': { treatment: 'regimes and path dependence', allowed_families: ['bayesian'], kinds: { quantity: { confidence_language: 'distribution', validation: { required: true, kind: 'quantity_rolling_origin', modes: ['retrospective'] } } } } }) }),
      /^horizon policy rejected \(validation\): a required validation names its kind/, 422);
    await refused(publish({ statement: 'self-named (SYNTHETIC)', steward: dual.principalId, rules: policyRules() }, dual), /^horizon policy rejected \(separation_of_duties\)/, 403);
    const v = await publish({ statement: 'a draft v2 (SYNTHETIC)', steward: petrovic.principalId, rules: policyRules() });
    await refused(concur(String(v['policy_id']), steward2), /^horizon policy rejected \(ownership\)/, 403);
    await refused(concur(String(v['policy_id']), eriksen), /./, 403);
    expect((await concur(String(v['policy_id']), petrovic, 'reject'))['state']).toBe('rejected');
    evidence('c', 'policy refusals', 'software capability');
  });
  it('c · RECOVERY: version 3 is published and concurred — v1 superseded, the route reads v3', async () => {
    const v3 = await publish({ statement: 'the corridor\'s horizon treatment, v3: optimisation allowed at 30d (SYNTHETIC)', steward: petrovic.principalId, rules: policyRules() });
    POLICY_V2 = String(v3['policy_id']);
    expect((await concur(POLICY_V2))['version']).toBe(3);
    const ps = (await read()).policies;
    expect(ps.map((p) => [p['version'], p['state']])).toEqual([[1, 'superseded'], [2, 'rejected'], [3, 'active']]);
    expect(obj((await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d' }))['policy'])['version']).toBe(3);
    evidence('c', 'v3 supersedes v1', 'software capability');
  });
});

/* ═══════════════════════════════════════ d · THE SCENE ═══════════════════════════════════════ */
let F30 = ''; let F5Y = ''; let F3Y = '';
describe('B25 §MR · d THE SCENE (F-P4-01): 30d EVENT and 5y REGIME on the corridor; the 3y refusal naming the missing validation', () => {
  it('d · POSITIVE: N. Eriksen forecasts the corridor at 30d (event method, intervention window) and 5y (regime language) — different methods per horizon', async () => {
    const ev = await validate({ methodRef: 'event_rate@1', targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d', origins: 60, stride: 30, minOrigins: 20 });
    expect(ev).toMatchObject({ kind: 'event_backtest', passed: true, synthetic: true, mode: 'retrospective' });
    expect(String(ev['claim'])).toMatch(/^SYNTHETIC DEMONSTRATION/);
    const a = await issue({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d', assumptions: [asuOpen], label: 'replay demonstration' });
    F30 = String(a.forecast['forecastId']);
    expect(a.forecast).toMatchObject({ method_ref: 'event_rate@1', family: 'event', forecast_kind: 'event', validation_state: 'validated_retrospective', confidence_language: 'probability' });
    expect(String(a.forecast['validation_note'])).toMatch(/SYNTHETIC DEMONSTRATION of the validation machinery — not empirical validation/);
    expect(String(a.forecast['statement'])).toMatch(/^P\(syn-corridor:.* < 41 on 5 consecutive published observation\(s\) within the 30d window to \d{4}-\d{2}-\d{2}\) = 0\.\d+/);
    const b = await issue({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '5y', assumptions: [asuOpen], label: 'replay demonstration' });
    F5Y = String(b.forecast['forecastId']);
    expect(b.forecast).toMatchObject({ method_ref: 'regime_judgement@1', family: 'structural_judgmental', forecast_kind: 'regime', validation_state: 'scenario_language', confidence_language: 'scenario_language' });
    expect(String(b.forecast['statement'])).toMatch(/^SCENARIO LANGUAGE, NOT A VALIDATED FORECAST/);
    // the package: two rows on one target, two methods, two kinds, two languages; FCT@v2 with the policy and the outcome; forecast.routed on each
    const r30 = (await forecastRow(F30))!; const r5 = (await forecastRow(F5Y))!;
    expect([r30['method_ref'], r30['forecast_kind'], r30['target_key'], r30['state']]).toEqual(['event_rate@1', 'event', 'corridor.bab-el-mandeb.transit-delay', 'issued']);
    expect([r5['method_ref'], r5['forecast_kind'], r5['validation_state'], r5['state']]).toEqual(['regime_judgement@1', 'regime', 'scenario_language', 'issued']);
    expect(obj(r5['horizon_policy'])).toMatchObject({ policy_id: POLICY_V2, version: 3, confidence_language: 'scenario_language' });
    const p5 = await fctPayload(F5Y);
    expect(p5['schema_ref']).toBe('FCT@v2');
    const pay = obj(p5['payload']);
    expect(obj(pay['outcome'])).toMatchObject({ type: 'regime', modal: 'open', language: 'scenario_language' });
    expect(obj(obj(pay['outcome'])['judgement'])['judged_by']).toBe(eriksen.principalId);
    expect((obj(pay['distribution'])['categories'] as Row[]).map((c) => c['key'])).toEqual(['closed', 'disrupted', 'open']);
    expect(obj(pay['validation'])['state']).toBe('scenario_language');
    expect(await forecastEvents(F30)).toEqual(['forecast.information_set_frozen', 'forecast.issued', 'forecast.routed']);   // integrated: §CX grounds the routed issue
    expect(await forecastEvents(F5Y)).toEqual(['forecast.information_set_frozen', 'forecast.issued', 'forecast.routed']);   // integrated: §CX grounds the routed issue
    const routes = await rows(sql`select outcome, method_ref, horizon_code from prediction.forecast_routes where tenant_id = ${T()}::uuid and forecast_id in (${F30}::uuid, ${F5Y}::uuid) order by horizon_code`);
    expect(routes).toEqual([{ outcome: 'issued', method_ref: 'event_rate@1', horizon_code: '30d' }, { outcome: 'issued', method_ref: 'regime_judgement@1', horizon_code: '5y' }]);
    evidence('d', `30d event P=${String(obj(a.forecast['distribution'])['probability'])} (validated_retrospective on SYNTHETIC history) and 5y regime in scenario language; methods per horizon`, 'synthetic demonstration');
  });

  it('d · REFUSAL: a 3y horizon on the (SYNTHETIC, short) line-demand series is REFUSED naming the missing validation — ledgered, nothing issued', async () => {
    const r = await refused(issue({ seriesKey: LINE, horizon: '3y', observedThrough: '2009-12-31', assumptions: [asuOpen] }),
      /^forecast rejected \(horizon\): syn-line-demand:.* at 3y is unsupported — no passed quantity-rolling-origin validation of bayes_level@1 at 3y with at least 20 origins \(historical or retrospective\) on syn-line-demand:.*history ending by 2009-12-31/, 422);
    expect(r.body['refusal_class']).toBe('horizon');
    const routeId = String(r.body['route_id']);
    const route = (await rows(sql`select outcome, refusal_class, forecast_id::text from prediction.forecast_routes where route_id = ${routeId}::uuid`))[0]!;
    expect(route).toMatchObject({ outcome: 'refused', refusal_class: 'horizon' });
    expect(await forecastEvents(String(route['forecast_id']))).toEqual(['forecast.horizon_refused']);
    expect(await forecastRow(String(route['forecast_id']))).toBeUndefined();
    // the analyst may not issue at all (PDP), the agent may (and is refused the same way)
    await refused(issue({ seriesKey: LINE, horizon: '30d', assumptions: [asuOpen] }, hoffmann), /./, 403);
    await refused(issue({ seriesKey: LINE, horizon: '3y', observedThrough: '2009-12-31', assumptions: [asuOpen] }, agent), /^forecast rejected \(horizon\)/, 422);
    // a validation attempted on the two-year history CANNOT VALIDATE — recorded, not passed, and still refused
    const cv = await validate({ methodRef: 'bayes_level@1', seriesKey: LINE, horizon: '3y', observedThrough: '2009-12-31', stride: 45, minOrigins: 20 });
    expect(cv).toMatchObject({ passed: false, origins: 0 });
    expect(String(cv['verdict'])).toMatch(/^CANNOT VALIDATE: 0 scored origin\(s\) at 1095 days/);
    await refused(issue({ seriesKey: LINE, horizon: '3y', observedThrough: '2009-12-31', assumptions: [asuOpen] }), /the latest, recorded .* did not apply or pass: CANNOT VALIDATE/, 422);
    evidence('d', 'the 3y refusal names the missing validation; route refused; forecast.horizon_refused; no row', 'software capability');
  });

  it('d · RECOVERY: the 3y rolling-origin validation on the long history PASSES (synthetic demonstration) and the 3y forecast is issued validated_retrospective', async () => {
    const v = await validate({ methodRef: 'bayes_level@1', seriesKey: LINE, horizon: '3y', observedThrough: '2023-05-31', origins: 40, stride: 45, minOrigins: 20 });
    expect(v).toMatchObject({ kind: 'quantity_rolling_origin', passed: true, origins: 40, synthetic: true });
    const bt = (await rows(sql`select method, method_version, mode, t1_met, origins from prediction.backtests where backtest_id = ${String(v['backtest_id'])}::uuid`))[0];
    expect(bt).toMatchObject({ method: 'bayes_level', method_version: 'bayes_level@1', mode: 'retrospective', t1_met: true, origins: 40 });
    const f = await issue({ seriesKey: LINE, horizon: '3y', observedThrough: '2023-05-31', assumptions: [asuOpen] });
    F3Y = String(f.forecast['forecastId']);
    expect(f.forecast).toMatchObject({ method_ref: 'bayes_level@1', forecast_kind: 'quantity', validation_state: 'validated_retrospective', backtest_id: v['backtest_id'] });
    expect(String(f.forecast['validation_note'])).toMatch(/SYNTHETIC DEMONSTRATION/);
    expect(String(f.forecast['validation_note'])).not.toMatch(/an empirical validation/);
    // the earlier cut still refused: the long history's validation does not apply to a forecast on two years
    await refused(issue({ seriesKey: LINE, horizon: '3y', observedThrough: '2009-12-31', assumptions: [asuOpen] }), /^forecast rejected \(horizon\)/, 422);
    evidence('d', '3y validated_retrospective after a passed synthetic 3y validation; the short cut still refused', 'synthetic demonstration');
  });
});

/* ═══════════════════════════════════════ e · BAYESIAN ═══════════════════════════════════════ */
describe('B25 §MR · e BAYESIAN (MC-012): explicit priors, posterior predictive, prior sensitivity, calibration', () => {
  it('e · POSITIVE: the 5y quantity forecast carries the prior, the alternatives, the posterior and a calm sensitivity; the calibration check is the 5y validation', async () => {
    const v = await validate({ methodRef: 'bayes_level@1', seriesKey: CORRIDOR, horizon: '5y', observedThrough: '2023-05-31', origins: 40, stride: 45, minOrigins: 20 });
    expect(v).toMatchObject({ passed: true, origins: 40 });
    const f = await issue({ seriesKey: CORRIDOR, horizon: '5y', observedThrough: '2023-05-31', assumptions: [asuOpen] });
    expect(f.forecast).toMatchObject({ method_ref: 'bayes_level@1', validation_state: 'validated_retrospective' });
    const o = obj(f.forecast['outcome']);
    expect(obj(o['prior'])).toMatchObject({ model: 'normal_linear', window_days: 60 });
    expect(obj(o['prior_sensitivity'])['sensitive']).toBe(false);
    expect(String(f.forecast['statement'])).toMatch(/Prior sensitivity: the declared alternatives move the median by at most/);
    evidence('e', `5y coverage ${String(obj(v['metrics'])['coverage'])} at 40 origins`, 'synthetic demonstration');
  });
  it('e · REFUSAL (disclosed, never hidden): a strongly wrong declared alternative makes the forecast say PRIOR-SENSITIVE, unvalidated', async () => {
    await approved({ methodKey: 'bayes_tight', family: 'bayesian', horizons: ['1y'], steward: petrovic.principalId, description: 'a tight prior with a wrong alternative (SYNTHETIC)',
      declarations: { prior: NL, alternatives: [{ label: 'level at 40, very tight', prior: { ...NL, intercept: { mean: 40, sd: 0.01 }, slope_per_year: { mean: 0, sd: 0.01 } } }] } });
    const f = await issue({ seriesKey: CORRIDOR, horizon: '1y', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'bayes_tight@1' });
    expect(obj(obj(f.forecast['outcome'])['prior_sensitivity'])['sensitive']).toBe(true);
    expect(String(f.forecast['statement'])).toMatch(/PRIOR-SENSITIVE: a declared alternative prior moves the median by/);
    expect(f.forecast['validation_state']).toBe('unvalidated');
    evidence('e', 'prior sensitivity flagged', 'software capability');
  });
  it('e · RECOVERY: the same quantity at 1y under the calm entry is not flagged', async () => {
    const f = await issue({ seriesKey: CORRIDOR, horizon: '1y', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'bayes_level@1' });
    expect(obj(obj(f.forecast['outcome'])['prior_sensitivity'])['sensitive']).toBe(false);
  });
});

/* ═══════════════════════════════════════ f · CAUSAL ═══════════════════════════════════════ */
describe('B25 §MR · f CAUSAL (MC-013): identification declared, effect with interval, placebo, balance, sensitivity', () => {
  it('f · POSITIVE: the escort programme\'s effect on transits, under J. Weber\'s declared assumptions', async () => {
    await approved({ methodKey: 'its_escorts', family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'interrupted time series of the escort programme (SYNTHETIC)',
      declarations: { intervention: { date: '2023-06-01', description: 'escort convoys begin (SYNTHETIC)' }, identification: { assumptions: [asuEscort, asuNoAnticipation], statement: 'the pre-trend and season would have continued; nothing else broke then' }, pre_days: 365, post_days: 90,
        transport: { scope: [CORRIDOR], assumptions: [asuNoAnticipation], statement: 'the effect is claimed for the corridor series it was estimated on (SYNTHETIC)' } } });   // B25 completion (G4): the transport scope
    const f = await issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-12-31', assumptions: [asuEscort], methodRef: 'its_escorts@1' });
    const o = obj(f.forecast['outcome']);
    expect(o['type']).toBe('effect');
    expect(obj(o['effect'])['q10'] as number).toBeGreaterThan(0);
    expect(obj(o['identification'])['assumptions']).toEqual([asuEscort, asuNoAnticipation]);
    expect((obj(o['placebo'])['effects'] as number[]).length).toBeGreaterThanOrEqual(4);
    expect(obj(o['balance'])['balanced']).toBe(true);
    expect(obj(o['sensitivity'])['sign_stable']).toBe(true);
    expect(f.forecast['validation_state']).toBe('unvalidated');
    evidence('f', `effect ${String(obj(o['effect'])['estimate'])}/day, placebo p ${String(obj(o['placebo'])['p_value'])}`, 'synthetic demonstration');
  });
  it('f · REFUSAL: a history that ends before the intervention — refused, ledgered, the entry NOT quarantined', async () => {
    const r = await refused(issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-05-01', assumptions: [asuEscort], methodRef: 'its_escorts@1' }),
      /^forecast rejected \(intervention\): the declared intervention \(2023-06-01\) is after the last known observation \(2023-05-01\)/, 422);
    expect(r.body['quarantined']).toBeNull();
    const route = (await rows(sql`select outcome, refusal_class from prediction.forecast_routes where route_id = ${String(r.body['route_id'])}::uuid`))[0];
    expect(route).toEqual({ outcome: 'refused', refusal_class: 'intervention' });
    expect((await read()).methods.find((m) => m['method_ref'] === 'its_escorts@1')!['state']).toBe('approved');
  });
  it('f · RECOVERY: with the history through the intervention the same request issues', async () => {
    const f = await issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-10-31', assumptions: [asuEscort], methodRef: 'its_escorts@1' });
    expect(f.forecast['method_ref']).toBe('its_escorts@1');
  });
});

/* ═══════════════════════════════════════ g · OPTIMISATION ═══════════════════════════════════════ */
const lp = (minShare: number) => ({
  variables: [{ name: 'reroute_share', lo: 0, hi: 1, step: 0.05 }],
  objective: { sense: 'minimise', coefficients: [{ param: 'p_disruption', times: -45, plus: 11 }], constant: { param: 'p_disruption', times: 45 }, unit: 'days', statement: 'expected corridor delay per shipment (SYNTHETIC)' },
  constraints: [{ label: 'reroute capacity (transits/day)', coefficients: [{ input: 'transits', times: 1 }], comparator: '<=', rhs: 29 }, { label: 'contracted minimum share', coefficients: [1], comparator: '>=', rhs: minShare }],
  parameters: { p_disruption: { low: 0.1, mid: 0.4, high: 0.7, source: 'J. Weber\'s blockade assumption band (SYNTHETIC)' } },
  inputs: { transits: { kind: 'series_recent_mean', window_days: 28 } },
});
describe('B25 §MR · g OPTIMISATION (MC-015): approved objective and constraints, feasibility, optimality gap', () => {
  it('g · POSITIVE: the reroute share minimising expected corridor delay under capacity — feasible, with its gap and scenario band', async () => {
    await approved({ methodKey: 'reroute_lp', family: 'optimisation', horizons: ['30d'], steward: petrovic.principalId, description: 'reroute share under capacity (SYNTHETIC)', declarations: lp(0.1) });
    const f = await issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_lp@1' });
    const o = obj(f.forecast['outcome']);
    expect(o).toMatchObject({ type: 'objective', status: 'optimal' });
    expect(o['gap'] as number).toBeGreaterThanOrEqual(0);
    expect((o['feasibility'] as Row[]).every((x) => x['satisfied'] === true)).toBe(true);
    expect(String(o['approval'])).toMatch(/approved by its method steward/);
    expect(String(obj(f.forecast['distribution'])['band_kind'])).toMatch(/scenario band/);
    evidence('g', `gap ${String(o['gap'])}`, 'software capability');
  });
  it('g · REFUSAL: infeasible constraints are refused (the entry stays approved, nothing solved around)', async () => {
    await approved({ methodKey: 'reroute_lp_bad', family: 'optimisation', horizons: ['30d'], steward: petrovic.principalId, description: 'an infeasible contracted share (SYNTHETIC)', declarations: lp(0.9) });
    await refused(issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_lp_bad@1' }),
      /^forecast rejected \(infeasible\): the declared constraints of reroute_lp_bad@1 admit no plan/, 422);
    expect((await read()).methods.find((m) => m['method_ref'] === 'reroute_lp_bad@1')!['state']).toBe('approved');
  });
  it('g · RECOVERY: the steward retires the infeasible entry and approves a corrected version 2', async () => {
    expect((await methodAct('retire', 'reroute_lp_bad@1'))['state']).toBe('retired');
    await approved({ methodKey: 'reroute_lp_bad', version: 2, family: 'optimisation', horizons: ['30d'], steward: petrovic.principalId, description: 'the contracted share corrected (SYNTHETIC)', declarations: lp(0.2) });
    const f = await issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_lp_bad@2' });
    expect(obj(f.forecast['outcome'])['status']).toBe('optimal');
    const plan = await planOf({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31' });
    expect((plan['methods'] as Row[]).find((m) => m['method_ref'] === 'reroute_lp_bad@1')).toMatchObject({ available: false, unavailable_reason: expect.stringMatching(/^retired: /) });
  });
});

/* ═══════════════════════════════════════ h · AVAILABILITY, QUARANTINE, METHOD_ROUTER ═══════════════════════════════════════ */
describe('B25 §MR · h AVAILABILITY AND QUARANTINE; METHOD_ROUTER replaces the seam\'s default', () => {
  it('h · POSITIVE: METHOD_ROUTER is the registry\'s; it answers the plan with each method\'s availability and throws the governed refusal', async () => {
    const router = h.app.get<MethodRouter>(METHOD_ROUTER);
    expect(router).toBeInstanceOf(RegistryMethodRouter);
    const inTx = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => (await h.pipeline.write(h.env(eriksen, 'prediction.portfolio.issue', 'FCT', null), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.portfolio.issue', objectType: 'FCT', objectId: null }, (tx) => tx,
      async (tx) => ({ result: await fn(tx), targetType: 'FCT', targetId: null, targetVersion: null, outboxEvent: null }))).result;
    const plan = await inTx((tx) => router.plan(tx, { tenantId: T(), domainId: D(), targetKey: 'corridor.bab-el-mandeb.transit-delay', seriesKey: CORRIDOR, horizonCode: '5y', correlationId: uuidv7() }));
    expect(plan.policy.version).toBe(3);
    expect(plan.methods.map((m) => [m.methodRef, m.family, m.forecastKind, m.available, m.confidenceLanguage])).toEqual([['regime_judgement@1', 'structural_judgmental', 'regime', true, 'scenario_language']]);
    const e = await inTx((tx) => router.plan(tx, { tenantId: T(), domainId: D(), targetKey: null, seriesKey: LINE, horizonCode: '3y', correlationId: uuidv7(), observedThrough: '2009-12-31' } as never)).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(RoutedRefusal);
    expect((e as RoutedRefusal).getStatus()).toBe(422);
    evidence('h', 'METHOD_ROUTER replaced; plan with availability; RoutedRefusal', 'software capability');
  });
  it('h · REFUSAL: an entry pinned to other bytes is QUARANTINED by its routed run; the plan lists it unavailable; an agent may not quarantine on demand', async () => {
    const e = await approved({ methodKey: 'event_rate_pinned', family: 'event', horizons: ['30d'], steward: petrovic.principalId, description: 'an entry whose pin will differ (SYNTHETIC)', declarations: { prior: { alpha: 1, beta: 1 } } });
    // STATED SUPERUSER MOVE: the entry's pinned digest set to other bytes — as if it was approved for a build that is no longer this one.
    await sql`update prediction.forecast_methods set implementation_digest = ${'0'.repeat(64)} where method_id = ${String(e['method_id'])}::uuid`.execute(su);
    const r = await refused(issue({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d', assumptions: [asuOpen], methodRef: 'event_rate_pinned@1' }),
      /^forecast rejected \(method\): event_rate_pinned@1 is quarantined — implementation digest mismatch/, 422);
    expect(r.body['quarantined']).toBe('event_rate_pinned@1');
    const plan = await planOf({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '30d' });
    expect((plan['methods'] as Row[]).find((m) => m['method_ref'] === 'event_rate_pinned@1')).toMatchObject({ available: false, unavailable_reason: expect.stringMatching(/^quarantined: implementation digest mismatch/) });
    const ledger = (await rows(sql`select event, details from prediction.forecast_registry_events where tenant_id = ${T()}::uuid and subject_ref = 'event_rate_pinned@1' order by occurred_at`)).map((x) => [x['event'], obj(x['details'])['automatic'] ?? null]);
    expect(ledger).toEqual([['method.proposed', null], ['method.approved', null], ['method.quarantined', true]]);
    await refused(methodAct('quarantine', 'event_rate@1', agent), /./, 403);
    await refused(methodAct('reinstate', 'event_rate_pinned@1', steward2), /^forecast method rejected \(ownership\)/, 403);
    evidence('h', 'digest mismatch → automatic quarantine; plan discloses', 'software capability');
  });
  it('h · RECOVERY: the steward quarantines on demand and reinstates; a builtin is quarantined and reinstated for this domain only', async () => {
    expect((await methodAct('quarantine', 'event_rate_alt2@2'))['state']).toBe('quarantined');
    await refused(methodAct('quarantine', 'event_rate_alt2@2'), /^forecast method rejected \(state\)/, 409);
    expect((await methodAct('reinstate', 'event_rate_alt2@2'))['state']).toBe('approved');
    const b = await methodAct('quarantine', 'holt_winters@1', richter);
    expect(b).toMatchObject({ state: 'quarantined', adopted_builtin: true });
    const plan = await planOf({ seriesKey: CORRIDOR, horizon: '90d' });
    expect((plan['methods'] as Row[]).find((m) => m['method_ref'] === 'holt_winters@1')).toMatchObject({ available: false });
    expect((await methodAct('reinstate', 'holt_winters@1'))['state']).toBe('approved');
  });
});

/* ═══════════════════════════════════════ i · ENFORCEMENT ON THE ROW ═══════════════════════════════════════ */
describe('B25 §MR · i ENFORCEMENT ON THE FORECAST ROW (pmr_fct_routed) — default-off for the legacy path', () => {
  const portIssue = (extras: Row, over: Row = {}) => h.pipeline.write(h.env(eriksen, 'prediction.forecast.issue', 'FCT', null), eriksen,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.issue', objectType: 'FCT', objectId: null }, PredictionCapability.forecast,
    async (cap) => {
      await cap.issueForecast({ forecastId: uuidv7(), tenantId: T(), domainId: D(), seriesKey: CORRIDOR, subjectEntityId: entity, horizonCode: '30d', horizonDays: 30, originAt: '2023-05-31', knownAt: new Date().toISOString(),
        targetAt: '2023-06-30', method: 'x', methodVersion: 'x@1', baselineMethod: 'x', quantiles: { q10: 0.1, q50: 0.2, q90: 0.3 }, path: [], drivers: [{ series_key: CORRIDOR, role: 'r', evidence_object_id: uuidv7() }],
        assumptions: [asuOpen], evidenceRefs: [{ evidence_object_id: uuidv7(), evidence_version: 1, evidence_digest: 'x' }], refreshCadence: 'daily', validationState: 'unvalidated', validationNote: 'n',
        label: 'replay demonstration', skill: null, statement: 'a crafted row (SYNTHETIC)', backtestId: null, controls: {}, actor: eriksen.principalId, eventId: uuidv7(), correlationId: uuidv7(), extras, ...over });
      return { result: null, targetType: 'FCT', targetId: null, targetVersion: null, outboxEvent: null };
    });
  it('i · REFUSAL: an unapproved method_ref, a family the active policy does not allow at the horizon, scenario language on a quantity', async () => {
    await refused(portIssue({ forecast_kind: 'event', method_ref: 'nope@1' }), /^forecast rejected \(method\): nope@1 is not a method of this domain's registry/, 422);
    await refused(portIssue({ forecast_kind: 'event', method_ref: 'reroute_lp_bad@1' }), /^forecast rejected \(method\): reroute_lp_bad@1 is retired, not approved/, 422);
    await refused(portIssue({ forecast_kind: 'quantity', method_ref: 'bayes_level@1', horizon_policy: { policy_id: POLICY_V2 } }, { horizonCode: '3y', horizonDays: 1095 }),
      /^forecast rejected \(horizon\): a quantity forecast at 3y requires a passed quantity-rolling-origin validation/, 422);
    await refused(portIssue({ forecast_kind: 'quantity', method_ref: 'seasonal_naive@1', horizon_policy: { policy_id: POLICY_V2 } }, { horizonCode: '3y', horizonDays: 1095 }),
      /^forecast rejected \(horizon\): the statistical family is not allowed at 3y/, 422);
    await refused(portIssue({ forecast_kind: 'quantity' }, { validationState: 'scenario_language' }), /^forecast rejected \(validation\): scenario language is a state or regime forecast's/, 422);
    await refused(portIssue({ forecast_kind: 'quantity', method_ref: 'seasonal_naive@1', horizon_policy: { policy_id: POLICY_V1 } }), /^forecast rejected \(stale\): horizon policy .* is not the domain's active policy/, 409);
    evidence('i', 'the row refuses what the policy and the registry do not allow', 'software capability');
  });
  it('i · POSITIVE / RECOVERY: the legacy issue is unchanged (no method_ref, quantity), and a statistical builtin routes through ForecastingService', async () => {
    const legacy = await pc.issueForecast(h.req(eriksen, 'prediction.forecast.issue', 'FCT', null), T(), D(),
      { payload: { seriesKey: CORRIDOR, horizon: '90d', knownAt: new Date().toISOString(), observedThrough: '2023-05-31', assumptions: [asuOpen], label: 'replay demonstration' } }) as { forecast: { forecastId: string; method: string } };
    const row = (await forecastRow(legacy.forecast.forecastId))!;
    expect([row['forecast_kind'], row['method_ref'], row['horizon_policy'], row['target_key']]).toEqual(['quantity', null, null, null]);
    expect(await forecastEvents(legacy.forecast.forecastId)).toEqual(['forecast.issued']);
    const routed = await issue({ seriesKey: LINE, horizon: '90d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'seasonal_naive@1' });
    expect(routed.forecast).toMatchObject({ method_ref: 'seasonal_naive@1', family: 'statistical' });
    const r2 = (await forecastRow(String(routed.forecast['forecastId'])))!;
    expect([r2['method'], r2['method_ref'], r2['forecast_kind']]).toEqual(['seasonal-naive', 'seasonal_naive@1', 'quantity']);
    expect((await fctPayload(String(routed.forecast['forecastId'])))['schema_ref']).toBe('FCT@v2');
    // every count scoped to this tenant: the routes this file made, by outcome
    const byOutcome = await rows(sql`select outcome, count(*)::int n from prediction.forecast_routes where tenant_id = ${T()}::uuid group by outcome order by outcome`);
    expect(byOutcome.map((x) => x['outcome'])).toEqual(['issued', 'planned', 'refused']);
    evidence('i', 'legacy untouched; statistical routed via ForecastingService (FCT@v2)', 'software capability');
  });
});

/* j — INTEGRATION (the B25 fold): §EN's ensemble manager over §MR's router — a MULTI-FAMILY ensemble. The real METHOD_ROUTER plans the
   registry's methods for the horizon under the active policy, and RUNS a planned quantity family for a member (the same runFamily the routed
   issue uses): seasonal_naive@1 (statistical) and bayes_level@1 (bayesian, explicit priors) stand side by side as members, each tied to its
   assumption, the ensemble combining them; each member row passes §MR's routed-row check (approved, the family allowed at 1y). SYNTHETIC. */
describe('B25 §MR · j INTEGRATION: a multi-family ensemble through the registry router (§EN × §MR)', () => {
  it('j · POSITIVE: a multi-family ensemble at 1y — the builtins and the approved Bayesian entries planned by the router, each run and issued as a member, the ensemble beside them', async () => {
    const { EnsemblesController: Ec } = await import('../../src/prediction/ensembles/ensembles.controller.js');
    const ens = h.app.get(Ec);
    const out = (await ens.issue(req(eriksen, 'prediction.ensemble.issue', 'ENS'), T(), D(), { payload: {
      seriesKey: CORRIDOR, horizon: '1y', observedThrough: '2023-05-31', assumptions: [asuOpen],
      members: [{ methodRef: 'seasonal_naive@1', assumptions: [asuOpen] }, { methodRef: 'bayes_level@1', assumptions: [asuEscort] }] } }) as { ensemble: Row }).ensemble;
    // the manager takes EVERY method the router plans for the horizon (the plan's order; the requested members tie their assumptions): at 1y
    // the policy allows statistical and bayesian — the two builtins and the two approved Bayesian entries, each run and issued as a member
    const members = (out['members'] as Row[]).map((m) => [m['method_ref'], m['state']]);
    expect(members, JSON.stringify(out['excluded_models'] ?? null)).toEqual([['seasonal_naive@1', 'issued'], ['holt_winters@1', 'issued'], ['bayes_level@1', 'issued'], ['bayes_tight@1', 'issued']]);
    const rows = (await sql<{ method_ref: string; ensemble_role: string }>`select method_ref, ensemble_role from prediction.forecasts_current
      where ensemble_id = ${String((out['run'] as Row)['ensemble_forecast_id'])}::uuid order by ensemble_role, method_ref`.execute(su)).rows;
    expect(rows.map((r) => [r.ensemble_role, r.method_ref])).toEqual([['ensemble', 'ensemble:linear_pool@1'], ['member', 'bayes_level@1'], ['member', 'bayes_tight@1'],
      ['member', 'holt_winters@1'], ['member', 'seasonal_naive@1']]);
  });
});

/* ═══════════════════════════════════════ k · B25 completion: G3 identifiability, G4 transport, G5 robustness, G6 paths and options ═══════════════════════════════════════ */
describe('B25 completion · k G3 IDENTIFIABILITY (MC-012), G4 TRANSPORTABILITY (MC-013), G5 ROBUSTNESS (MC-015), G6 PATH DEPENDENCE / OPTION VALUE (V00-T-051)', () => {
  const ITS = (scope: string[], transportAsus: string[]) => ({ intervention: { date: '2023-06-01', description: 'escort convoys begin (SYNTHETIC)' },
    identification: { assumptions: [asuEscort, asuNoAnticipation], statement: 'the pre-trend and season would have continued; nothing else broke then' }, pre_days: 365, post_days: 90,
    transport: { scope, assumptions: transportAsus, statement: 'the escorts act alike wherever the declared scope reaches (SYNTHETIC)' } });

  it('k · G3 POSITIVE / REFUSAL / RECOVERY: the 1y Bayesian forecast carries each parameter\'s contraction (identified); a slope prior the data cannot move is WEAKLY IDENTIFIED on the forecast; an invalid threshold is refused at proposal', async () => {
    const calm = await issue({ seriesKey: CORRIDOR, horizon: '1y', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'bayes_level@1' });
    const idf = obj(obj(calm.forecast['outcome'])['identifiability']);
    expect((idf['parameters'] as Row[]).map((x) => [x['name'], x['weakly_identified']])).toEqual([['intercept', false], ['slope_per_year', false]]);
    expect(idf['weakly_identified']).toEqual([]); expect(obj(idf['conditioning'])['xtx_condition_number'] as number).toBeGreaterThan(1);
    expect(String(calm.forecast['statement'])).toMatch(/Identifiability: posterior\/prior variance contraction intercept [\d.]+, slope_per_year [\d.]+ \(threshold 0\.1\)/);
    await approved({ methodKey: 'bayes_pinned_slope', family: 'bayesian', horizons: ['1y'], steward: petrovic.principalId, description: 'a slope prior so tight the data cannot move it (SYNTHETIC)',
      declarations: { prior: { ...NL, slope_per_year: { mean: 0, sd: 0.0001 } }, alternatives: [{ label: 'the calm prior', prior: NL }] } });
    const weak = await issue({ seriesKey: CORRIDOR, horizon: '1y', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'bayes_pinned_slope@1' });
    expect(obj(obj(weak.forecast['outcome'])['identifiability'])['weakly_identified']).toEqual(['slope_per_year']);
    expect(String(weak.forecast['statement'])).toMatch(/WEAKLY IDENTIFIED: slope_per_year — posterior\/prior variance contraction .* the data barely inform it, the value is mostly the prior's/);
    await refused(propose({ methodKey: 'bayes_bad_bar', family: 'bayesian', horizons: ['1y'], steward: petrovic.principalId, description: 'a contraction bar of 1.5 (SYNTHETIC)',
      declarations: { prior: NL, alternatives: [{ label: 'x', prior: NL }], identifiability_threshold: 1.5 } }), /^forecast method rejected \(declarations\): declarations\.identifiability_threshold is a variance contraction in \(0, 1\)/, 422);
    const strict = await approved({ methodKey: 'bayes_strict_bar', family: 'bayesian', horizons: ['1y'], steward: petrovic.principalId, description: 'the calm prior under a stricter bar (SYNTHETIC)',
      declarations: { prior: NL, alternatives: [{ label: 'x', prior: NL }], identifiability_threshold: 0.5 } });
    expect(strict['state']).toBe('approved');
    evidence('k', `G3 identifiability: contraction ${(idf['parameters'] as Row[]).map((x) => `${String(x['name'])} ${String(x['contraction'])}`).join(', ')}; pinned slope WEAKLY IDENTIFIED`, 'software capability');
  });

  it('k · G4 POSITIVE / REFUSAL / RECOVERY: inside its scope the effect carries its transport assumptions (two series in scope: consistency NOT ASSESSED); outside it, refused (transport) and ledgered; an unknown transport ASU refused; the widened version issues by the subject', async () => {
    await approved({ methodKey: 'its_scoped', family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'the escort effect, transportable to two corridor series (SYNTHETIC)',
      declarations: ITS([CORRIDOR, 'syn-red-sea:transits'], [asuNoAnticipation]) });
    const f = await issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-12-31', assumptions: [asuEscort], methodRef: 'its_scoped@1' });
    const t = obj(obj(f.forecast['outcome'])['transport']);
    expect(t).toMatchObject({ declared: true, in_scope: true, matched: CORRIDOR, assumptions: [asuNoAnticipation], consistency: { series_in_scope: 2, assessed: false } });
    expect(String(f.forecast['statement'])).toMatch(/transported within its declared scope .* under 1 transport assumption\(s\); the declared scope names 2 series; this routed issue reads only .* NOT ASSESSED/);
    // REFUSAL — outside the scope: refused, ledgered, the entry stays approved; an unknown transport ASU at proposal
    await approved({ methodKey: 'its_elsewhere', family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'the escort effect declared for another strait only (SYNTHETIC)',
      declarations: ITS(['syn-red-sea:transits'], [asuNoAnticipation]) });
    const r = await refused(issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-12-31', assumptions: [asuEscort], methodRef: 'its_elsewhere@1' }),
      /^forecast rejected \(transport\): its_elsewhere@1's effect is declared transportable to syn-red-sea:transits; syn-corridor:.* \(subject .*\) is outside that scope/, 422);
    expect((await rows(sql`select outcome, refusal_class from prediction.forecast_routes where route_id = ${String(r.body['route_id'])}::uuid`))[0]).toEqual({ outcome: 'refused', refusal_class: 'transport' });
    expect((await read()).methods.find((m) => m['method_ref'] === 'its_elsewhere@1')!['state']).toBe('approved');
    await refused(propose({ methodKey: 'its_unknown_transport', family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'a transport assumption that is no ASU (SYNTHETIC)',
      declarations: ITS([CORRIDOR], [uuidv7()]) }), /^forecast method rejected \(unknown_assumption\): .* a transport assumption is declared in the Strategy Graph first/, 404);
    await refused(propose({ methodKey: 'its_no_transport', family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'no transport scope declared (SYNTHETIC)',
      declarations: { ...ITS([CORRIDOR], [asuNoAnticipation]), transport: undefined } }), /^forecast method rejected \(declarations\): a causal method declares where its effect is transportable/, 422);
    // RECOVERY — the steward's version 2 widens the scope to the strait (the series' subject entity): issued, matched by the subject
    await approved({ methodKey: 'its_elsewhere', version: 2, family: 'causal', horizons: ['90d'], steward: petrovic.principalId, description: 'the scope widened to the strait itself (SYNTHETIC)',
      declarations: ITS(['syn-red-sea:transits', entity], [asuNoAnticipation]) });
    const ok = await issue({ seriesKey: CORRIDOR, horizon: '90d', observedThrough: '2023-12-31', assumptions: [asuEscort], methodRef: 'its_elsewhere@2' });
    expect(obj(obj(ok.forecast['outcome'])['transport'])).toMatchObject({ in_scope: true, matched: entity });
    evidence('k', 'G4 transport: in scope (consistency not assessed), outside refused (transport), widened by subject', 'software capability');
  });

  it('k · G5 POSITIVE / REFUSAL / RECOVERY: the capacity plan is ROBUST (feasible low/mid/high, worst case, regret); a slot bound that tightens under the low scenario is NOT ROBUST, the scenario named; the corrected band is robust', async () => {
    const f = await issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_lp@1' });
    const rb = obj(obj(f.forecast['outcome'])['robustness']);
    expect(rb).toMatchObject({ robust: true, infeasible_scenarios: [] });
    expect((rb['scenarios'] as Row[]).map((x) => [x['scenario'], x['feasible']])).toEqual([['low', true], ['mid', true], ['high', true]]);
    for (const x of rb['scenarios'] as Row[]) expect(x['regret'] as number).toBeGreaterThanOrEqual(0);
    expect(String(f.forecast['statement'])).toMatch(/ROBUST: the plan is feasible under every declared parameter scenario \(low, mid, high\); worst-case objective/);
    const slots = (low: number) => ({ ...lp(0.1), constraints: [...lp(0.1).constraints, { label: 'escort slots (share)', coefficients: [1], comparator: '<=', rhs: { param: 'slots' } }],
      parameters: { ...lp(0.1).parameters, slots: { low, mid: 0.5, high: 0.8, source: 'the escort slot band (SYNTHETIC)' } } });
    await approved({ methodKey: 'reroute_slots', family: 'optimisation', horizons: ['30d'], steward: petrovic.principalId, description: 'reroute share under escort slots (SYNTHETIC)', declarations: slots(0.2) });
    const nr = await issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_slots@1' });
    const rb2 = obj(obj(nr.forecast['outcome'])['robustness']);
    expect(rb2).toMatchObject({ robust: false, infeasible_scenarios: ['low'] });
    expect(String(nr.forecast['statement'])).toMatch(/NOT ROBUST: the plan is INFEASIBLE under the low scenario \(low: escort slots \(share\)/);
    await approved({ methodKey: 'reroute_slots', version: 2, family: 'optimisation', horizons: ['30d'], steward: petrovic.principalId, description: 'the escort slot band corrected (SYNTHETIC)', declarations: slots(0.5) });
    const ok = await issue({ seriesKey: CORRIDOR, horizon: '30d', observedThrough: '2023-05-31', assumptions: [asuOpen], methodRef: 'reroute_slots@2' });
    expect(obj(obj(ok.forecast['outcome'])['robustness'])['robust']).toBe(true);
    evidence('k', `G5 robustness: worst case ${String(obj(rb['worst_case'])['objective'])} (${String(obj(rb['worst_case'])['scenario'])}); slots low 0.2 NOT ROBUST; 0.5 robust`, 'software capability');
  });

  it('k · G6 POSITIVE / REFUSAL / RECOVERY: the 5y regime shows the path-dependent view and the declared options\' value and resilience beside the issued probabilities; options that do not price every regime are refused at proposal', async () => {
    const options = [{ key: 'hold', label: 'hold safety stock', cost: 2, payoff: { closed: 8, disrupted: 6, open: 3 } }, { key: 'reroute', label: 'reroute via the Cape', cost: 4, payoff: { closed: 10, disrupted: 7, open: 1 } }];
    const judgement = { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk in the strait over five years (SYNTHETIC judgement)', judged_by: eriksen.principalId };
    await refused(propose({ methodKey: 'regime_options', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId, description: 'options that price two regimes of three (SYNTHETIC)',
      declarations: { judgement, options: [{ ...options[0], payoff: { closed: 8, open: 3 } }] } }), /^forecast method rejected \(declarations\): each option is \{key/, 422);
    await approved({ methodKey: 'regime_options', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId,
      description: 'the regime judgement with the declared options (SYNTHETIC options and payoffs)', declarations: { judgement, options } });
    const f = await issue({ targetKey: 'corridor.bab-el-mandeb.transit-delay', horizon: '5y', assumptions: [asuOpen], label: 'replay demonstration', methodRef: 'regime_options@1' });
    const o = obj(f.forecast['outcome']);
    // the issued probabilities are the SAME judgement-and-counts posterior regime_judgement@1 issued (d) — the additions ride beside them
    const d5 = obj((await fctPayload(F5Y))['payload']);
    expect(obj(f.forecast['distribution'])['categories']).toEqual(obj(d5['distribution'])['categories']);
    const pd = obj(o['path_dependence']);
    expect(pd['current']).toBeDefined(); expect(pd['steps']).toBe(Math.ceil(1825 / 90));
    expect(Object.values(obj(pd['horizon_distribution'])).reduce((a: number, b) => a + Number(b), 0)).toBeCloseTo(1, 3);
    const opts = obj(o['options']);
    expect((opts['options'] as Row[]).map((x) => x['key'])).toEqual(['hold', 'reroute']);
    expect(opts['option_value'] as number).toBeGreaterThanOrEqual(0);
    expect(String(f.forecast['statement'])).toMatch(/THE PATH-DEPENDENT VIEW \(scenario language, not a validated forecast\).* OPTION VALUE AND RESILIENCE .* not measured/);
    expect(f.forecast['validation_state']).toBe('scenario_language');
    evidence('k', `G6: path view from ${String(pd['current'])} over ${String(pd['steps'])} steps; option value ${String(opts['option_value'])}, most resilient ${String(obj(opts['most_resilient'])['key'])}`, 'synthetic demonstration');
  });
});
