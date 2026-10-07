/**
 * THE ENSEMBLE AND DISAGREEMENT MANAGER — CP-6 B25 part `ensembles` (migration 0108 §EN; F-P4-02; L6-C04, V00-T-053, V03-T-129,
 * V03-T-132, V03-T-326, V03-T-327, PER-07).
 *
 * A run is ADMITTED (prediction.ensemble.issue: the question, the METHOD_ROUTER's plan, the members in the plan's order each TIED TO
 * ITS ASSUMPTION SET, the declared combination and disagreement rules, the budget, the forecast owner), its members are COMPUTED here
 * (each attempt timed; a failure retried up to the budget's attempts; a path the registry lists unavailable, a method no runner
 * implements, a kind the quantity ensemble cannot combine, a member over the member budget or reached after the compute budget is spent
 * — each EXCLUDED with its class and reason), the included members and the ensemble are ISSUED in one write under
 * prediction.forecast.issue (the prelude's port; the member and ensemble FCT@v2 carry the inspectable distributions, the disagreement
 * and the excluded models), and the run is COMPLETED (prediction.ensemble.issue: the attempts, the exclusions disclosed, the weights, the
 * port's own divergence measure, the escalation of a material disagreement to the owner) — or FAILED and escalated when fewer than two
 * members are available or the combination claims more precision than the members agree (PER-07). A run the process left admitted or
 * running is RESUMED from what stands (the ensemble's payload carries its outcome).
 *
 * The legacy methods run here (models.ts: seasonal naive, Holt-Winters); a registry method runs through the router when it offers
 * `run` (§MR's provider at integration), and is otherwise excluded as unimplemented and disclosed. The context is frozen through
 * CONTEXT_FREEZER at admission (the prelude's null default: ungrounded), the environment recorded per member when the freezer gives one.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { ScopeContext } from '../../shared/scope.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PredictionCapability, type ForecastWrites } from '../prediction.capabilities.js';
import { SeriesService, cadenceOf, stepsFor, type AssembledSeries, type Reader } from '../series/series.service.js';
import { ForecastingService, HORIZONS, MIN_HISTORY_FOR_BACKTEST } from '../forecasting/forecasting.service.js';
import { forecastIssuedEvent } from '../forecasting/forecast-events.js';   // integration (B25 fold)
import { registerForecastReplayer } from '../../shared/forecast-environment.js';
import { ENSEMBLE_COMBINATION_REPLAYER } from './ensemble-replay.js';
import { forecastWith, SEASONAL_NAIVE, T1_LOW, T1_HIGH, type ForecastOutput, type Point } from '../models/models.js';
import { CONTEXT_FREEZER, METHOD_ROUTER, type ContextFreezer, type MethodRouter, type FrozenInformationSet } from '../portfolio/seams.js';
import { EnsembleCapability, type EnsembleReads } from './ensembles.capabilities.js';
import {
  COMBINATION_RULES, DISAGREEMENT_RULE, ENSEMBLE_RULES, combine, combinePaths, divergence, fmt, legacyMethodOf, precisionBreaches, splittingAssumptions, weightsFor,
  type CombinationRule, type Divergence, type Quantiles, type Weighting,
} from './ensemble-math.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round = (x: number, p = 4): number => Number(x.toFixed(p));
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A refusal in the CLASS form: `ensemble rejected (<class>): …` / `judgement overlay rejected (<class>): …`. */
export function refuse(noun: 'ensemble' | 'judgement overlay', cls: string, message: string, correlationId: string, status = 422): HttpException {
  const code = status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001';
  return new HttpException(errorBody(code, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

/* ───────────────────────── the request ───────────────────────── */

export interface EnsembleRequest {
  seriesKey: string; targetKey: string | null; horizon: string; knownAt: string | null; observedThrough: string | null;
  assumptions: string[]; members: Array<{ methodRef: string; assumptions: string[] }>;
  combination: CombinationRule; weighting: Weighting; budget: { members: number | undefined; attempts: number | undefined; computeMs: number | undefined };
  owner: string | null; label: 'replay demonstration' | 'live'; refreshCadence: string;
}

const uuids = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID.test(x)) ? [...new Set(v as string[])] : null);
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

export function validateEnsembleRequest(p: Row, cid: string): EnsembleRequest {
  const bad = (m: string) => refuse('ensemble', 'request', m, cid);
  if (typeof p['seriesKey'] !== 'string' || p['seriesKey'].length < 2) throw bad('seriesKey names the registered series the ensemble forecasts');
  if (typeof p['horizon'] !== 'string' || HORIZONS[p['horizon']] === undefined) throw refuse('ensemble', 'horizon', `horizon is one of ${Object.keys(HORIZONS).join(', ')}`, cid);
  const target = p['targetKey'] === undefined || p['targetKey'] === null ? null : p['targetKey'];
  if (target !== null && (typeof target !== 'string' || target.length < 2)) throw bad('targetKey, when named, is the governed target\'s key');
  let knownAt: string | null = null;
  if (p['knownAt'] !== undefined && p['knownAt'] !== null) {
    const d = new Date(String(p['knownAt']));
    if (typeof p['knownAt'] !== 'string' || Number.isNaN(d.getTime())) throw refuse('ensemble', 'cutoff', 'knownAt is an instant (the cut-off); omitted, the database\'s now', cid);
    knownAt = d.toISOString();
  }
  const ot = p['observedThrough'];
  if (ot !== undefined && ot !== null && (typeof ot !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ot))) throw bad('observedThrough is a day (YYYY-MM-DD)');
  const assumptions = uuids(p['assumptions']);
  if (assumptions === null || assumptions.length === 0) throw refuse('ensemble', 'assumptions', 'assumptions names at least one ASU every member rests on', cid);
  const members: EnsembleRequest['members'] = [];
  if (p['members'] !== undefined && p['members'] !== null) {
    if (!Array.isArray(p['members'])) throw bad('members is a list of {methodRef, assumptions} tying a planned method to its assumption set');
    for (const m of p['members'] as unknown[]) {
      const r = rec(m); const tied = uuids(r['assumptions'] ?? []);
      if (typeof r['methodRef'] !== 'string' || r['methodRef'].length < 2 || tied === null) throw bad('each member is {methodRef, assumptions: [ASU ids]}');
      if (members.some((x) => x.methodRef === r['methodRef'])) throw bad(`member ${String(r['methodRef'])} is named twice`);
      members.push({ methodRef: r['methodRef'], assumptions: tied });
    }
  }
  const combination = (p['combination'] ?? 'linear_pool@1') as CombinationRule;
  if (!COMBINATION_RULES.includes(combination)) throw refuse('ensemble', 'rule', `combination is one of ${COMBINATION_RULES.join(', ')}`, cid);
  const weighting = (p['weighting'] ?? 'equal') as Weighting;
  if (weighting !== 'equal' && weighting !== 'skill') throw refuse('ensemble', 'rule', 'weighting is equal or skill', cid);
  const b = rec(p['budget']);
  const budget = { members: int(b['members']), attempts: int(b['attempts']), computeMs: int(b['computeMs']) };
  const owner = p['owner'] === undefined || p['owner'] === null ? null : p['owner'];
  if (owner !== null && (typeof owner !== 'string' || !UUID.test(owner))) throw refuse('ensemble', 'owner', 'owner is the principal id of the forecast owner every escalation reaches', cid);
  const label = p['label'] === 'live' ? 'live' : 'replay demonstration';
  const refreshCadence = typeof p['refreshCadence'] === 'string' && p['refreshCadence'].length > 0 ? p['refreshCadence'] : 'daily';
  return { seriesKey: p['seriesKey'], targetKey: target as string | null, horizon: p['horizon'], knownAt, observedThrough: (ot as string | undefined) ?? null,
           assumptions, members, combination, weighting, budget, owner: owner as string | null, label, refreshCadence };
}

export interface OverlayRequest { adjustment: Row; rationale: string; evidence: Row[]; expectedVersion: number | null }
export function validateOverlay(p: Row, cid: string, revising: boolean): OverlayRequest {
  const adjustment = rec(p['adjustment']);
  if (Object.keys(adjustment).length === 0) throw refuse('judgement overlay', 'adjustment', 'adjustment is {kind: quantiles | probability | categories, …}', cid);
  if (typeof p['rationale'] !== 'string' || p['rationale'].trim().length < 16) throw refuse('judgement overlay', 'rationale', 'a judgement states its rationale (at least 16 characters)', cid);
  if (!Array.isArray(p['evidence']) || p['evidence'].length === 0) throw refuse('judgement overlay', 'evidence', 'a judgement names the evidence it rests on (at least one {kind, id})', cid);
  const ev = p['evidence'].map(rec);
  const expected = int(p['expectedVersion']) ?? null;
  if (revising && expected === null) throw refuse('judgement overlay', 'request', 'a revision names the version it revises (expectedVersion)', cid);
  return { adjustment, rationale: p['rationale'], evidence: ev, expectedVersion: expected };
}

/* ───────────────────────── the member computation ───────────────────────── */

/** What the router may additionally offer at integration (§MR): running a registry method. The prelude's legacy router does not. */
type MemberContext = { tenantId?: string; domainId?: string; horizonCode?: string; seriesKey?: string; features?: Array<{ key: string; source: string; digest: string; value?: unknown }> | null; subjectEntityId?: string | null };
type RunnableRouter = MethodRouter & { run?: (a: { methodRef: string; points: Point[]; steps: number; season: number } & MemberContext) => Promise<ForecastOutput> | ForecastOutput };

export interface PlannedMember {
  ordinal: number; methodRef: string; family: string; forecastKind: string; available: boolean; unavailableReason: string | null;
  confidenceLanguage: string | null; assumptions: string[]; tied: string[];
}
interface Attempt { ordinal: number; attempt: number; outcome: 'succeeded' | 'failed'; error?: string; duration_ms: number }
interface Excluded { ordinal: number; class: 'unavailable' | 'unimplemented' | 'kind' | 'failed' | 'budget' | 'not_combined' | 'not_run'; reason: string }
interface Included { member: PlannedMember; output: ForecastOutput; attempts: number; forecastId: string }

/** The run as the manager continues it (the port's answer, read back whole). */
interface RunSnapshot {
  runId: string; ensembleForecastId: string; seriesKey: string; targetKey: string | null; horizon: string; knownAt: string; observedThrough: string | null;
  label: 'replay demonstration' | 'live'; refreshCadence: string; assumptions: string[]; combination: CombinationRule; weighting: Weighting;
  budget: { members: number; attempts: number; compute_ms: number }; plan: Row; informationSetId: string | null; members: PlannedMember[]; state: string;
}

function snapshotOf(r: Row): RunSnapshot {
  const b = rec(r['budget']);
  return {
    runId: String(r['run_id']), ensembleForecastId: String(r['ensemble_forecast_id']), seriesKey: String(r['series_key']),
    targetKey: (r['target_key'] as string | null) ?? null, horizon: String(r['horizon_code']), knownAt: new Date(String(r['known_at'])).toISOString(),
    observedThrough: r['observed_through'] === null || r['observed_through'] === undefined ? null : String(r['observed_through']).slice(0, 10),
    label: r['label'] === 'live' ? 'live' : 'replay demonstration', refreshCadence: String(r['refresh_cadence'] ?? 'daily'),
    assumptions: arr(r['assumptions']).map(String), combination: String(r['combination_rule']) as CombinationRule, weighting: String(r['weighting']) as Weighting,
    budget: { members: Number(b['members']), attempts: Number(b['attempts']), compute_ms: Number(b['compute_ms']) }, plan: rec(r['plan']),
    informationSetId: (r['information_set_id'] as string | null) ?? null, state: String(r['state']),
    members: arr(r['members']).map(rec).map((m) => ({
      ordinal: Number(m['ordinal']), methodRef: String(m['method_ref']), family: String(m['family']), forecastKind: String(m['forecast_kind']),
      available: m['available'] === true, unavailableReason: (m['unavailable_reason'] as string | null) ?? null, confidenceLanguage: (m['confidence_language'] as string | null) ?? null,
      assumptions: arr(m['assumptions']).map(String), tied: arr(m['tied_assumptions']).map(String),
    })),
  };
}

/** The precision refusal raised inside the issuance write (it rolls the write back; the manager then FAILS the run). */
class PrecisionRefusal extends Error {}

@Injectable()
export class EnsemblesService {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly series: SeriesService,
    private readonly forecasting: ForecastingService,
    @Inject(METHOD_ROUTER) private readonly router: MethodRouter,
    @Inject(CONTEXT_FREEZER) private readonly freezer: ContextFreezer,
  ) { registerForecastReplayer(ENSEMBLE_COMBINATION_REPLAYER); }   // B25 completion (G2): an ensemble row's replay, reached by §CX through the shared register

  private env(envelope: Envelope, action: string, objectType: string, objectId: string | null): Envelope {
    return { ...envelope, action, message_id: newId(), object_type: objectType, object_id: objectId,
             side_effect_class: action.endsWith('.read') ? 'none' : envelope.side_effect_class } as Envelope;
  }
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null, writableTargets?: string[]) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId, ...(writableTargets === undefined ? {} : { writableTargets }) };
  }

  /* ───────────── ISSUE: admit, then execute ───────────── */

  async issue(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, req: EnsembleRequest): Promise<Row> {
    const cid = envelope.correlation_id;
    const runId = newId(); const ensembleForecastId = newId();
    const admitted = await this.pipeline.write(this.env(envelope, 'prediction.ensemble.issue', 'ENS', runId), principal,
      this.route(tenantId, domainId, 'prediction.ensemble.issue', 'ENS', runId), EnsembleCapability.manage,
      async (cap) => {
        const knownAt = req.knownAt ?? await cap.now();
        const plan = await this.router.plan(cap.seamTx(), { tenantId, domainId, targetKey: req.targetKey, seriesKey: req.seriesKey, horizonCode: req.horizon, correlationId: cid });
        for (const m of req.members) {
          if (!plan.methods.some((x) => x.methodRef === m.methodRef)) {
            throw refuse('ensemble', 'plan', `${m.methodRef} is not in the router's plan for ${req.targetKey ?? req.seriesKey} at ${req.horizon} (planned: ${plan.methods.map((x) => x.methodRef).join(', ') || 'none'})`, cid);
          }
        }
        const frozen: FrozenInformationSet | null = await this.freezer.freeze(cap.seamTx(), {
          tenantId, domainId, seriesKey: req.seriesKey, subjectEntityId: await cap.seriesSubject(req.seriesKey), targetKey: req.targetKey, knownAt, observedThrough: req.observedThrough,
          assumptions: req.assumptions, actor: principal.principalId, correlationId: cid,
        });
        const members = plan.methods.map((m, i) => {
          const tied = req.members.find((x) => x.methodRef === m.methodRef)?.assumptions ?? [];
          return { ordinal: i + 1, method_ref: m.methodRef, family: m.family, forecast_kind: m.forecastKind, available: m.available,
                   unavailable_reason: m.available ? null : (m.unavailableReason ?? 'the registry lists the method path unavailable'),
                   confidence_language: m.confidenceLanguage, tied_assumptions: tied.filter((t) => !req.assumptions.includes(t)) };
        });
        const planRow: Row = { targetKey: plan.targetKey, horizonCode: plan.horizonCode, policy: plan.policy, methods: plan.methods,
                               grounding: frozen === null ? null : { information_set_id: frozen.informationSetId, manifest_digest: frozen.manifestDigest, graph: frozen.graph, twin: frozen.twin,
                                                                     feature_keys: frozen.features.map((f) => f.key), coverage_gaps: frozen.coverageGaps } };
        const r = await cap.admit({ runId, tenantId, domainId, ensembleForecastId, plan: planRow, members,
          request: { series_key: req.seriesKey, target_key: req.targetKey, horizon_code: req.horizon, known_at: knownAt, observed_through: req.observedThrough,
                     label: req.label, refresh_cadence: req.refreshCadence, assumptions: req.assumptions, combination_rule: req.combination, weighting: req.weighting,
                     disagreement_rule: DISAGREEMENT_RULE, budget: { members: req.budget.members, attempts: req.budget.attempts, compute_ms: req.budget.computeMs },
                     owner: req.owner ?? principal.principalId, information_set_id: frozen?.informationSetId ?? null },
          actor: principal.principalId, eventId: newId(), correlationId: cid });
        return { result: r, targetType: 'ENS', targetId: runId, targetVersion: null, outboxEvent: null };
      });
    return this.execute(envelope, principal, tenantId, domainId, snapshotOf(admitted.result));
  }

  /* ───────────── RESUME: continue from what stands ───────────── */

  async resume(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, runId: string): Promise<Row> {
    const r = await this.pipeline.write(this.env(envelope, 'prediction.ensemble.issue', 'ENS', runId), principal,
      this.route(tenantId, domainId, 'prediction.ensemble.issue', 'ENS', runId), EnsembleCapability.manage,
      async (cap) => ({ result: await cap.resume({ runId, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'ENS', targetId: runId, targetVersion: null, outboxEvent: null }));
    const run = snapshotOf(r.result);
    const payload = await this.readOne(envelope, principal, tenantId, domainId, (cap) => cap.forecastPayload(run.ensembleForecastId));
    if (payload !== null) {
      // the ensemble was issued before the process stopped: its payload carries the outcome the completion records
      const outcome = rec(rec(payload['ensemble'])['outcome']);
      await this.completeRun(envelope, principal, tenantId, domainId, run.runId, outcome);
      return this.read(envelope, principal, tenantId, domainId, run.runId);
    }
    return this.execute(envelope, principal, tenantId, domainId, run);
  }

  /* ───────────── THE EXECUTION: compute, issue, complete (or fail) ───────────── */

  private async execute(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, run: RunSnapshot): Promise<Row> {
    const cid = envelope.correlation_id;
    const reader: Reader = { principal, tenantId, domainId, correlationId: cid, purposeId: envelope.purpose_id ?? 'prediction' };
    // B25 act-found: the compute budget is the MEMBERS' compute. The clock starts AFTER the history is read (below) — a long real history
    // (the corridor's ~8,900 PortWatch evidence versions, each a governed retrieval) took minutes to assemble and, charged to the budget,
    // excluded every member as `budget` before any was run.
    let started = Date.now();
    const attempts: Attempt[] = []; const excluded: Excluded[] = []; const included: Included[] = [];
    let assembled: AssembledSeries;
    try {
      assembled = await this.series.assemble(reader, run.seriesKey, run.knownAt, run.observedThrough);
      started = Date.now();
    } catch (e) {
      return this.failRun(envelope, principal, tenantId, domainId, run, `the history of ${run.seriesKey} could not be assembled: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`, attempts, this.excludeAll(run, 'the run\'s history could not be read'));
    }
    if (!assembled.complete || assembled.points.length < 8) {
      const why = !assembled.complete ? `${assembled.unreadable.length} evidence version(s) of ${run.seriesKey} could not be read; no member is fitted on an incomplete history`
        : `${run.seriesKey} has ${assembled.points.length} observation(s) known at ${run.knownAt}; a member needs at least 8`;
      return this.failRun(envelope, principal, tenantId, domainId, run, why, attempts, this.excludeAll(run, why));
    }
    const horizonDays = HORIZONS[run.horizon] as number;
    // B25 completion (G1): the members compute with the FEATURES of the ensemble's frozen information set (null when ungrounded)
    const features = run.informationSetId === null ? null : await this.readOne(envelope, principal, tenantId, domainId, (cap) => cap.informationSetFeatures(run.informationSetId as string));
    started = Date.now();
    const cadence = cadenceOf(assembled.points);
    const steps = stepsFor(horizonDays, cadence);
    const season = cadence === 'daily' ? assembled.series.seasonality_days : 1;

    for (const m of run.members) {
      if (!m.available) { excluded.push({ ordinal: m.ordinal, class: 'unavailable', reason: `${m.methodRef} is unavailable: ${m.unavailableReason ?? 'the registry lists the path unavailable'}` }); continue; }
      if (m.forecastKind !== 'quantity') { excluded.push({ ordinal: m.ordinal, class: 'kind', reason: `${m.methodRef} forecasts a ${m.forecastKind}; a quantity ensemble combines quantity distributions only` }); continue; }
      if (included.length >= run.budget.members) { excluded.push({ ordinal: m.ordinal, class: 'budget', reason: `the run's member budget (${run.budget.members}) is reached; ${m.methodRef} was not run` }); continue; }
      if (Date.now() - started >= run.budget.compute_ms) { excluded.push({ ordinal: m.ordinal, class: 'budget', reason: `the run's compute budget (${run.budget.compute_ms} ms) was spent before ${m.methodRef} was reached` }); continue; }
      if (!this.implements(m.methodRef)) { excluded.push({ ordinal: m.ordinal, class: 'unimplemented', reason: `no runner implements ${m.methodRef} for the ensemble manager (the router offers no run for it)` }); continue; }
      let output: ForecastOutput | null = null; let lastError = '';
      for (let attempt = 1; attempt <= run.budget.attempts; attempt += 1) {
        const t0 = Date.now();
        try {
          const out = await this.computeMember(m.methodRef, assembled.points, steps, season, { tenantId, domainId, horizonCode: run.horizon, seriesKey: run.seriesKey,
            features, subjectEntityId: assembled.series.subject_entity_id });   // integration: the run's context for the router (B25 completion: + the frozen features)
          const qs = [out.quantiles.q10, out.quantiles.q50, out.quantiles.q90];
          if (!qs.every(Number.isFinite) || !(qs[0]! <= qs[1]! && qs[1]! <= qs[2]!) || !out.path.every((p) => [p.q10, p.q50, p.q90].every(Number.isFinite))) {
            throw new Error(`${m.methodRef} returned a distribution that is not finite and ordered`);
          }
          attempts.push({ ordinal: m.ordinal, attempt, outcome: 'succeeded', duration_ms: Date.now() - t0 });
          output = out; break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          attempts.push({ ordinal: m.ordinal, attempt, outcome: 'failed', error: lastError.slice(0, 500), duration_ms: Date.now() - t0 });
        }
      }
      if (output === null) { excluded.push({ ordinal: m.ordinal, class: 'failed', reason: `${m.methodRef} failed ${run.budget.attempts} attempt(s): ${lastError.slice(0, 200)}` }); continue; }
      included.push({ member: m, output, attempts: attempts.filter((a) => a.ordinal === m.ordinal).length, forecastId: newId() });
    }
    const computeMs = Date.now() - started;
    if (included.length < ENSEMBLE_RULES['manager@1'].min_members) {
      // the included members never issued are excluded too: nothing is issued under a failed run
      for (const i of included) excluded.push({ ordinal: i.member.ordinal, class: 'not_combined', reason: `${i.member.methodRef} computed, but the run has fewer than ${ENSEMBLE_RULES['manager@1'].min_members} members to combine` });
      return this.failRun(envelope, principal, tenantId, domainId, run,
        `${included.length} of ${run.members.length} planned member(s) available; an ensemble combines at least ${ENSEMBLE_RULES['manager@1'].min_members}`, attempts,
        excluded.sort((a, b) => a.ordinal - b.ordinal), computeMs);
    }
    let outcome: Row;
    try {
      outcome = await this.issueAll(envelope, principal, tenantId, domainId, run, assembled, steps, included, excluded, attempts, computeMs);
    } catch (e) {
      if (e instanceof PrecisionRefusal) {
        await this.failRun(envelope, principal, tenantId, domainId, run, `precision: ${e.message}`, attempts,
          [...excluded, ...included.map((i) => ({ ordinal: i.member.ordinal, class: 'not_combined' as const, reason: `${i.member.methodRef} computed, but the combination was refused (PER-07)` }))].sort((a, b) => a.ordinal - b.ordinal), computeMs);
        throw refuse('ensemble', 'precision', `${e.message} — run ${run.runId} FAILED and was escalated to its owner; ${ENSEMBLE_RULES.precision.statement}; linear_pool@1 does not hide the disagreement`, cid);
      }
      throw e;
    }
    await this.completeRun(envelope, principal, tenantId, domainId, run.runId, outcome);
    return this.read(envelope, principal, tenantId, domainId, run.runId);
  }

  /** Whether the manager can run a method reference: a legacy model here, or a registry method through the router's `run`. */
  private implements(methodRef: string): boolean {
    return legacyMethodOf(methodRef) !== null || typeof (this.router as RunnableRouter).run === 'function';
  }

  /** ONE attempt at a member (deterministic for the legacy models; the router's `run` for a registry method). Overridable in harnesses only through the instance. */
  async computeMember(methodRef: string, points: Point[], steps: number, season: number, ctx: MemberContext = {}): Promise<ForecastOutput> {
    const legacy = legacyMethodOf(methodRef);
    if (legacy !== null) return forecastWith(legacy, points, steps, season);
    const run = (this.router as RunnableRouter).run;
    if (typeof run !== 'function') throw new Error(`no runner implements ${methodRef}`);
    return await run.call(this.router, { methodRef, points, steps, season, ...ctx });
  }

  private excludeAll(run: RunSnapshot, why: string): Excluded[] {
    return run.members.map((m) => (m.available ? { ordinal: m.ordinal, class: 'not_run' as const, reason: `${m.methodRef} was not run: ${why}` }
                                                 : { ordinal: m.ordinal, class: 'unavailable' as const, reason: `${m.methodRef} is unavailable: ${m.unavailableReason ?? 'the registry lists the path unavailable'}` }));
  }

  /** FAIL the run (prediction.ensemble.issue): every member excluded and disclosed (what it lost, what it computed but could not combine,
   *  what it never reached), the attempts as they happened, the reason, the escalation to the owner. */
  private async failRun(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, run: RunSnapshot, reason: string,
                        attempts: Attempt[], excluded: Excluded[], computeMs = 0): Promise<Row> {
    await this.pipeline.write(this.env(envelope, 'prediction.ensemble.issue', 'ENS', run.runId), principal,
      this.route(tenantId, domainId, 'prediction.ensemble.issue', 'ENS', run.runId), EnsembleCapability.manage,
      async (cap) => ({ result: await cap.fail({ runId: run.runId, tenantId, domainId, reason, outcome: { attempts, excluded, compute_ms: computeMs }, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'ENS', targetId: run.runId, targetVersion: null, outboxEvent: null }));
    return this.read(envelope, principal, tenantId, domainId, run.runId);
  }

  private async completeRun(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, runId: string, outcome: Row): Promise<void> {
    await this.pipeline.write(this.env(envelope, 'prediction.ensemble.issue', 'ENS', runId), principal,
      this.route(tenantId, domainId, 'prediction.ensemble.issue', 'ENS', runId), EnsembleCapability.manage,
      async (cap) => ({ result: await cap.complete({ runId, tenantId, domainId, outcome, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'ENS', targetId: runId, targetVersion: null, outboxEvent: null }));
  }

  /* ───────────── THE ISSUANCE (prediction.forecast.issue): the members, then the ensemble, in ONE write ───────────── */

  private async issueAll(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, run: RunSnapshot, assembled: AssembledSeries,
                         steps: number, included: Included[], excluded: Excluded[], attempts: Attempt[], computeMs: number): Promise<Row> {
    const cid = envelope.correlation_id;
    const targets = [run.ensembleForecastId, ...included.map((i) => i.forecastId)];
    const out = await this.pipeline.write(this.env(envelope, 'prediction.forecast.issue', 'FCT', run.ensembleForecastId), principal,
      this.route(tenantId, domainId, 'prediction.forecast.issue', 'FCT', run.ensembleForecastId, targets), PredictionCapability.forecast,
      async (cap, scope) => {
        const horizonDays = HORIZONS[run.horizon] as number;
        const originAt = assembled.points[assembled.points.length - 1]?.date as string;
        const targetAt = addDays(originAt, horizonDays);
        const bt = await this.forecasting.applicableBacktests(cap, { seriesKey: run.seriesKey, horizonCode: run.horizon, knownAt: run.knownAt, originAt });
        const record = bt.historical ?? bt.retrospective;
        const tiedIds = [...new Set([...run.assumptions, ...included.flatMap((i) => i.member.tied)])];
        const titles = Object.fromEntries(((await cap.readStrategy().select(['strategy_object_id', 'title']).where('strategy_object_id' as never, 'in', tiedIds as never).execute()) as Array<{ strategy_object_id: string; title: string }>)
          .map((t) => [String(t.strategy_object_id), t.title]));

        // THE MEMBERS: each its own FCT@v2 (method, distribution, validation as its record earns it) — inspectable on its own (V03-T-129)
        const memberRows: Array<{ ordinal: number; methodRef: string; forecastId: string; quantiles: Quantiles; path: Array<{ step: number } & Quantiles>; validationState: string; pinball: number | null; tied: string[] }> = [];
        for (const i of included) {
          const legacy = legacyMethodOf(i.member.methodRef);
          const q = { q10: round(i.output.quantiles.q10), q50: round(i.output.quantiles.q50), q90: round(i.output.quantiles.q90) };
          const path = i.output.path.map((p) => ({ step: p.step, date: null, q10: round(p.q10), q50: round(p.q50), q90: round(p.q90) }));
          const v = memberValidation(legacy, record, assembled.points.length, i.output, steps);
          const pinball = legacy === null || record === undefined ? null : Number(legacy === SEASONAL_NAIVE ? record['baseline_pinball_mean'] : record['pinball_mean']);
          const tiedTitles = i.member.tied.map((t) => titles[t] ?? t);
          const statement = `ENSEMBLE MEMBER ${i.member.ordinal} of run ${run.runId} — ${run.seriesKey} at ${run.horizon} (${targetAt}): median ${fmt(q.q50)} ${assembled.series.unit}, `
            + `10–90 band ${fmt(q.q10)}–${fmt(q.q90)}; ${i.output.method}@${i.output.version} (${i.member.methodRef}) on ${assembled.points.length} observation(s) known at ${run.knownAt} (last ${originAt}); `
            + `${v.state.replace(/_/g, ' ')}.` + (tiedTitles.length > 0 ? ` Tied to: ${tiedTitles.join('; ')}.` : '')
            + (run.label === 'replay demonstration' ? ' REPLAY DEMONSTRATION — not a live forecast.' : '') + (assembled.controls.synthetic_state ? ' SYNTHETIC: at least one evidence version it rests on is synthetic.' : '');
          const env = this.freezer.environment(i.member.methodRef);
          const ensembleSection = { run_id: run.runId, role: 'member', ensemble_forecast_id: run.ensembleForecastId, ordinal: i.member.ordinal, method_ref: i.member.methodRef,
                                    family: i.member.family, confidence_language: i.member.confidenceLanguage, tied_assumptions: i.member.tied, attempts: i.attempts };
          await this.admitAndIssue(cap, scope, run, assembled, {
            forecastId: i.forecastId, method: i.output.method, methodVersion: i.output.version, methodRef: i.member.methodRef, parameters: i.output.parameters,
            quantiles: q, path, assumptions: i.member.assumptions, validation: v, statement, originAt, targetAt, horizonDays, role: 'member',
            payloadExtra: { ensemble: ensembleSection, ...(env === null ? {} : { environment: { digest: env.digest, ...env.facts } }) },
            columnsExtra: env === null ? {} : { environment: { digest: env.digest, ...env.facts } },
          }, principal.principalId, cid);
          memberRows.push({ ordinal: i.member.ordinal, methodRef: i.member.methodRef, forecastId: i.forecastId, quantiles: q, path, validationState: v.state, pinball, tied: i.member.tied });
        }

        // THE COMBINATION under the declared rule and weighting; THE DISAGREEMENT (disagreement@1) and the assumptions that split
        const w = weightsFor(run.weighting, memberRows.map((m) => m.pinball));
        const combined = combine(run.combination, memberRows.map((m) => m.quantiles), w.weights);
        const cq = { q10: round(combined.q10), q50: round(combined.q50), q90: round(combined.q90) };
        const cpath = combinePaths(run.combination, memberRows.map((m) => m.path), w.weights).map((p) => ({ ...p, q10: round(p.q10), q50: round(p.q50), q90: round(p.q90) }));
        const div: Divergence = divergence(memberRows.map((m) => ({ ordinal: m.ordinal, ...m.quantiles })));
        const breaches = precisionBreaches(cq, memberRows.map((m) => ({ ordinal: m.ordinal, methodRef: m.methodRef, ...m.quantiles })));
        if (breaches.length > 0) {
          throw new PrecisionRefusal(`${run.combination} gives a 10–90 band ${fmt(cq.q10)}–${fmt(cq.q90)} that excludes the median of ${breaches.map((b) => `${b.methodRef} (${fmt(b.q50)})`).join(', ')}: more precise than the members agree`);
        }
        const byOrd = new Map(memberRows.map((m) => [m.ordinal, m]));
        const splitPairs = div.pairs.filter((p) => p.level !== 'agree').map((p) => {
          const a = byOrd.get(p.a)!; const b = byOrd.get(p.b)!;
          const s = splittingAssumptions({ ordinal: a.ordinal, methodRef: a.methodRef, tied: a.tied }, { ordinal: b.ordinal, methodRef: b.methodRef, tied: b.tied }, titles);
          return { a: a.methodRef, b: b.methodRef, level: p.level, gap_ratio: p.gap_ratio, overlap: p.overlap, medians: { [a.methodRef]: a.quantiles.q50, [b.methodRef]: b.quantiles.q50 }, ...s };
        });
        const driving = splitPairs.find((p) => div.driving_pair !== null && p.a === byOrd.get(div.driving_pair.a)?.methodRef && p.b === byOrd.get(div.driving_pair.b)?.methodRef) ?? null;
        const unit = assembled.series.unit;
        const disagreementStatement = div.level === 'agree'
          ? `The members AGREE under ${DISAGREEMENT_RULE} (max gap ratio ${fmt(div.max_gap_ratio)}).`
          : `The members DISAGREE ${div.level === 'material' ? 'MATERIALLY' : '(notably)'} under ${DISAGREEMENT_RULE} (max gap ratio ${fmt(div.max_gap_ratio)}, min overlap ${fmt(div.min_overlap)})`
            + (driving === null ? '.' : `: ${driving.a} median ${fmt(Number(driving.medians[driving.a]))} vs ${driving.b} median ${fmt(Number(driving.medians[driving.b]))} ${unit}; `
              + (driving.declared.length > 0
                ? `the split rests on ${driving.declared.map((d) => `"${d.title ?? d.assumption_id}" (held by ${d.held_by.join(', ')})`).join(' vs ')}`
                : 'the members rest on the same declared assumptions')
              + `; the methods' own: ${driving.structural.map((s) => `${s.method_ref} assumes ${s.assumption}`).join('; ')}.`);
        const analysis = { level: div.level, max_gap_ratio: div.max_gap_ratio, min_overlap: div.min_overlap, pairs: div.pairs, driving_pair: div.driving_pair,
                           splitting_assumptions: driving?.declared ?? [], structural: driving?.structural ?? [], split_pairs: splitPairs, statement: disagreementStatement };

        const excludedModels = [...excluded].sort((a, b) => a.ordinal - b.ordinal).map((x) => {
          const m = run.members.find((y) => y.ordinal === x.ordinal)!;
          return { ordinal: x.ordinal, method_ref: m.methodRef, family: m.family, class: x.class, reason: x.reason, attempts: attempts.filter((a) => a.ordinal === x.ordinal).length };
        });
        const lost = excludedModels.length === 0 ? 'No planned method path was lost.'
          : `${excludedModels.length} planned method path(s) EXCLUDED and not in this ensemble: ${excludedModels.map((x) => `${x.method_ref} (${x.class}: ${x.reason})`).join('; ')}.`;
        const allImpossible = memberRows.every((m) => m.validationState === 'validation_impossible');
        const validation = {
          state: allImpossible ? 'validation_impossible' : 'unvalidated',
          note: `the ensemble is not backtested as a combination; no accuracy is claimed for it beyond its members' own records (${memberRows.map((m) => `${m.methodRef}: ${m.validationState.replace(/_/g, ' ')}`).join('; ')}).`
            + (allImpossible ? ` ${assembled.points.length} observation(s) are known; a backtest needs ${MIN_HISTORY_FOR_BACKTEST}.` : ''),
          backtest_id: null, skill: null,
        };
        const outcome = {
          attempts, excluded, weights: memberRows.map((m, k) => ({ ordinal: m.ordinal, weight: round(w.weights[k] as number, 6) })), compute_ms: computeMs,
          weighting_used: w.used, analysis: { level: analysis.level, max_gap_ratio: analysis.max_gap_ratio, driving_pair: analysis.driving_pair,
                                               splitting_assumptions: analysis.splitting_assumptions, structural: analysis.structural, statement: disagreementStatement },
        };
        // the weights as recorded sum to 1 after rounding: the last absorbs the rounding
        const ws = outcome.weights; const drift = 1 - ws.reduce((s, x) => s + x.weight, 0); if (ws.length > 0) ws[ws.length - 1]!.weight = round(ws[ws.length - 1]!.weight + drift, 6);
        const statement = `ENSEMBLE of ${memberRows.length} member(s) (${memberRows.map((m) => m.methodRef).join(', ')}) under ${run.combination}, ${w.used} weights — `
          + `${run.seriesKey} at ${run.horizon}${run.targetKey === null ? '' : ` (${run.targetKey})`} (${targetAt}): median ${fmt(cq.q50)} ${unit}, 10–90 band ${fmt(cq.q10)}–${fmt(cq.q90)}. `
          + `${disagreementStatement} ${lost} ${validation.state.replace(/_/g, ' ')}: no accuracy is claimed for the combination.`
          + (run.label === 'replay demonstration' ? ' REPLAY DEMONSTRATION — not a live forecast.' : '') + (assembled.controls.synthetic_state ? ' SYNTHETIC: at least one evidence version it rests on is synthetic.' : '');
        const ensembleSection = {
          run_id: run.runId, role: 'ensemble', combination: { rule: run.combination, statement: ENSEMBLE_RULES[run.combination].statement, weighting: run.weighting, weighting_used: w.used, weighting_note: w.note },
          members: memberRows.map((m, k) => ({ ordinal: m.ordinal, forecast_id: m.forecastId, method_ref: m.methodRef, tied_assumptions: m.tied,
                                               assumption_titles: m.tied.map((t) => titles[t] ?? null), distribution: m.quantiles, validation_state: m.validationState, weight: outcome.weights[k]?.weight })),
          budget: run.budget, outcome,
        };
        const issued = await this.admitAndIssue(cap, scope, run, assembled, {
          forecastId: run.ensembleForecastId, method: `ensemble-${run.combination.split('@')[0]!.replace(/_/g, '-')}`, methodVersion: run.combination.split('@')[1] ?? '1',
          methodRef: `ensemble:${run.combination}`, parameters: { members: memberRows.length },
          quantiles: cq, path: cpath, assumptions: run.assumptions, validation, statement, originAt, targetAt, horizonDays, role: 'ensemble',
          payloadExtra: { ensemble: ensembleSection, disagreement: analysis, excluded_models: excludedModels }, columnsExtra: {},
        }, principal.principalId, cid);
        /* integration (B25 fold): the ENSEMBLE forecast is published as ForecastIssued@v2 (L6-I02, the interface every issued forecast
           announces) — built from the issue's own answer; its members are internal to the ensemble and announce nothing on their own. */
        const superseded = await cap.supersededBy({ forecastId: run.ensembleForecastId });
        const ensembleMethod = `ensemble-${run.combination.split('@')[0]!.replace(/_/g, '-')}`;
        return { result: outcome, targetType: 'FCT', targetId: run.ensembleForecastId, targetVersion: '1',
                 outboxEvent: forecastIssuedEvent({
                   forecastId: run.ensembleForecastId, seriesKey: run.seriesKey, subjectEntityId: assembled.series.subject_entity_id, horizon: run.horizon, horizonDays,
                   method: ensembleMethod, methodVersion: run.combination.split('@')[1] ?? '1', baselineMethod: SEASONAL_NAIVE, validationState: validation.state,
                   validationNote: validation.note, backtestId: validation.backtest_id, skill: validation.skill ?? null, label: run.label, supersededForecastId: superseded?.forecast_id ?? null,
                   originAt, knownAt: run.knownAt, targetAt, observedThrough: run.observedThrough, issuedAt: issued.issuedAt, refreshCadence: run.refreshCadence,
                   quantiles: { q10: cq.q10, q50: cq.q50, q90: cq.q90 }, unit, drivers: issued.drivers, assumptions: run.assumptions, evidenceRefs: issued.evidence,
                   controls: { synthetic_state: issued.controls.synthetic_state, classification: issued.controls.classification }, actor: principal.principalId,
                 }) };
      });
    return out.result;
  }

  /** Admit one FCT@v2 and issue it through the prelude's port with its B25 columns (the ForecastingService.issue header, restated). */
  private async admitAndIssue(cap: ForecastWrites, scope: ScopeContext, run: RunSnapshot, assembled: AssembledSeries, f: {
    forecastId: string; method: string; methodVersion: string; methodRef: string; parameters: Record<string, number>; quantiles: Quantiles; path: unknown[];
    assumptions: string[]; validation: { state: string; note: string; backtest_id: string | null; skill: unknown }; statement: string; originAt: string; targetAt: string;
    horizonDays: number; role: 'member' | 'ensemble'; payloadExtra: Row; columnsExtra: Row;
  }, actor: string, correlationId: string): Promise<{ drivers: unknown[]; evidence: unknown[]; issuedAt: string; controls: AssembledSeries['controls'] }> {
    const controls = assembled.controls;
    const now = new Date().toISOString();
    const last = assembled.points[assembled.points.length - 1];
    const drivers = [{ series_key: run.seriesKey, role: f.role === 'member' ? 'the series itself, fitted on its own history' : 'the series itself, through the ensemble\'s members', share: 1,
                       evidence_object_id: last?.evidence_object_id, evidence_version: last?.evidence_version, evidence_digest: last?.evidence_digest, attribution: assembled.attribution }];
    const evidence = assembled.evidence.map((e) => ({ evidence_object_id: e.evidence_object_id, evidence_version: e.evidence_version, evidence_digest: e.evidence_digest }));
    const policy = rec(run.plan['policy']);
    const horizonPolicy = policy['policyId'] === null || policy['policyId'] === undefined ? null
      : { policy_id: policy['policyId'], version: policy['version'], horizon_rule: policy['horizonRule'] ?? null };
    const grounding = run.plan['grounding'] === null || run.plan['grounding'] === undefined ? null : rec(run.plan['grounding']);
    const payload = {
      series_key: run.seriesKey, subject_entity_id: assembled.series.subject_entity_id, horizon: { code: run.horizon, days: f.horizonDays },
      origin_at: f.originAt, known_at: run.knownAt, target_at: f.targetAt,
      method: { name: f.method, version: f.methodVersion, parameters: f.parameters }, baseline_method: SEASONAL_NAIVE,
      distribution: { ...f.quantiles, unit: assembled.series.unit, path: f.path },
      drivers, assumptions: f.assumptions, evidence, refresh_cadence: run.refreshCadence,
      validation: f.validation, label: run.label, statement: f.statement, narrative: null, controls,
      forecast_kind: 'quantity', target_key: run.targetKey, method_ref: f.methodRef, horizon_policy: horizonPolicy,
      ...(grounding === null ? {} : { information_set: grounding }),
      ...f.payloadExtra,
    };
    const header: CanonicalHeader = {
      object_id: f.forecastId, object_type: 'FCT', tenant_id: scope.tenantId, domain_id: scope.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${actor}`,
      source_object_ids: assembled.evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      event_time: `${f.targetAt}T00:00:00.000Z`, observation_time: now, valid_from: `${f.originAt}T00:00:00.000Z`, valid_to: `${f.targetAt}T00:00:00.000Z`,
      recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'inferred', synthetic_state: controls.synthetic_state,
      confidence: null, uncertainty: { ...f.quantiles },
      evidence_refs: assembled.evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      provenance_ref: `series:${run.seriesKey}`, method_ref: `${f.method}@${f.methodVersion}`,
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: controls.classification,
      purpose_scope: 'prediction', rights_profile: controls.rights_profile ?? assembled.attribution,
      residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { validation: f.validation.state },
      freshness_state: { freshest_evidence_recorded_at: assembled.freshestRecordedAt, origin_at: f.originAt },
      schema_ref: 'FCT@v2', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `forecast header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.issueForecast({
      forecastId: f.forecastId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, seriesKey: run.seriesKey,
      subjectEntityId: assembled.series.subject_entity_id, horizonCode: run.horizon, horizonDays: f.horizonDays, originAt: f.originAt, knownAt: run.knownAt, targetAt: f.targetAt,
      method: f.method, methodVersion: f.methodVersion, baselineMethod: SEASONAL_NAIVE, quantiles: { ...f.quantiles }, path: f.path, drivers, assumptions: f.assumptions,
      evidenceRefs: evidence, refreshCadence: run.refreshCadence, validationState: f.validation.state, validationNote: f.validation.note, label: run.label,
      skill: f.validation.skill ?? null, statement: f.statement, backtestId: f.validation.backtest_id, controls, actor, eventId: newId(), correlationId,
      extras: { forecast_kind: 'quantity', target_key: run.targetKey, method_ref: f.methodRef, ensemble_id: run.ensembleForecastId, ensemble_role: f.role,
                ...(run.informationSetId === null ? {} : { information_set_id: run.informationSetId }), ...(horizonPolicy === null ? {} : { horizon_policy: horizonPolicy }), ...f.columnsExtra },
    });
    return { drivers, evidence, issuedAt: now, controls };   // integration: the ensemble's ForecastIssued@v2 is built from this answer
  }

  /* ───────────── THE READS ───────────── */

  private async readOne<T>(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, fn: (cap: EnsembleReads) => Promise<T>, action = 'prediction.ensemble.read'): Promise<T> {
    const out = await this.pipeline.consequentialRead(this.env(envelope, action, 'ENS', null), principal, this.route(tenantId, domainId, action, 'ENS', null), EnsembleCapability.read,
      async (cap) => fn(cap));
    return out.result;
  }

  /** The PACKAGE of a run: the run and its state, the members (each distribution inspectable), the ensemble forecast beside them, the
   *  disagreement and what split it, the excluded models, the attempts, the ledger, and the judgement overlays on the ensemble — the model's
   *  own distribution always readable beside a JUDGEMENT. */
  async read(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, runId: string): Promise<Row> {
    return this.readOne(envelope, principal, tenantId, domainId, async (cap) => {
      const run = await cap.run(runId);
      if (run === null) throw refuse('ensemble', 'unknown_run', `no ensemble run ${runId} in this domain`, envelope.correlation_id, 404);
      const ensembleId = String(run['ensemble_forecast_id']);
      const ensemble = await cap.forecast(ensembleId);
      const payload = ensemble === null ? null : await cap.forecastPayload(ensembleId);
      const overlays = ensemble === null ? [] : await cap.overlays(ensembleId);
      const members = await cap.members(runId);
      return {
        run, members,
        ensemble: ensemble === null ? null : { ...ensemble, label_kind: 'MODEL OUTPUT', combination: rec(payload?.['ensemble'])['combination'] ?? null },
        disagreement: run['disagreement'] ?? rec(payload)['disagreement'] ?? null,
        excluded_models: rec(payload)['excluded_models'] ?? members.filter((m) => m['state'] === 'excluded').map((m) => ({ ordinal: m['ordinal'], method_ref: m['method_ref'], class: m['exclusion_class'], reason: m['exclusion_reason'], attempts: m['attempts'] })),
        attempts: await cap.attempts(runId), events: await cap.events(runId),
        overlays, standing_overlay: overlays.find((o) => o['state'] === 'active') ?? null,
        rules: await cap.rules(),
      };
    });
  }

  async list(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, limit: number): Promise<Row> {
    return this.readOne(envelope, principal, tenantId, domainId, async (cap) => ({ at: await cap.now(), runs: await cap.runs(limit), rules: await cap.rules() }));
  }

  async members(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, runId: string): Promise<Row> {
    return this.readOne(envelope, principal, tenantId, domainId, async (cap) => {
      const run = await cap.run(runId);
      if (run === null) throw refuse('ensemble', 'unknown_run', `no ensemble run ${runId} in this domain`, envelope.correlation_id, 404);
      const members = await cap.members(runId);
      const withPayload = [];
      for (const m of members) withPayload.push({ ...m, ensemble: m['forecast_id'] === null ? null : rec(await cap.forecastPayload(String(m['forecast_id'])))['ensemble'] ?? null });
      return { run_id: runId, ensemble_forecast_id: run['ensemble_forecast_id'], members: withPayload };
    });
  }

  async disagreement(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, runId: string): Promise<Row> {
    return this.readOne(envelope, principal, tenantId, domainId, async (cap) => {
      const run = await cap.run(runId);
      if (run === null) throw refuse('ensemble', 'unknown_run', `no ensemble run ${runId} in this domain`, envelope.correlation_id, 404);
      const payload = await cap.forecastPayload(String(run['ensemble_forecast_id']));
      return { run_id: runId, state: run['state'], rule: run['disagreement_rule'], measured: run['disagreement'] ?? null, analysis: rec(payload)['disagreement'] ?? null,
               rules: rec(await cap.rules())[String(run['disagreement_rule'])] ?? null };
    });
  }

  /** A forecast's judgement overlays (every version) beside the model's own distribution — under prediction.read (the forecast's readers). */
  async overlays(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, forecastId: string): Promise<Row> {
    return this.readOne(envelope, principal, tenantId, domainId, async (cap) => {
      const f = await cap.forecast(forecastId);
      if (f === null) throw refuse('judgement overlay', 'unknown_forecast', `no forecast ${forecastId} in this domain`, envelope.correlation_id, 404);
      const overlays = await cap.overlays(forecastId);
      return { forecast_id: forecastId, model: { label: 'MODEL OUTPUT', forecast_kind: f['forecast_kind'], method: f['method'], method_ref: f['method_ref'], ensemble_role: f['ensemble_role'],
                                                 quantiles: f['quantiles'], validation_state: f['validation_state'], statement: f['statement'] },
               standing: overlays.find((o) => o['state'] === 'active') ?? null, overlays };
    }, 'prediction.read');
  }
}

/* ───────────────────────── helpers ───────────────────────── */

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A member's validation as its record earns it — the ForecastingService rule: validated only by an applicable backtest whose own band met T1. */
function memberValidation(legacy: string | null, bt: Record<string, unknown> | undefined, observations: number, out: ForecastOutput, steps: number):
  { state: string; note: string; backtest_id: string | null; skill: unknown } {
  const approximated = out.errorsUsed === 0 || (Number(out.parameters['intervalBasisStep'] ?? steps) < steps)
    ? ` The 10–90 band is APPROXIMATED from ${out.errorsUsed} ${String(out.parameters['intervalBasisStep'] ?? '?')}-step error(s) scaled to the horizon, not measured at it.` : '';
  if (legacy !== null && bt !== undefined) {
    const own = legacy === SEASONAL_NAIVE ? Number(bt['baseline_coverage_80']) : Number(bt['coverage_80']);
    const skill = { backtest_id: bt['backtest_id'], mode: bt['mode'] ?? 'retrospective', coverage_80: bt['coverage_80'], baseline_coverage_80: bt['baseline_coverage_80'],
                    pinball_mean: bt['pinball_mean'], baseline_pinball_mean: bt['baseline_pinball_mean'], t1_met: bt['t1_met'], t2_met: bt['t2_met'] };
    if (Number.isFinite(own) && own >= T1_LOW && own <= T1_HIGH) {
      const state = bt['mode'] === 'historical' ? 'validated' : 'validated_retrospective';
      return { state, note: `backtested (${String(bt['mode'] ?? 'retrospective')}) on ${String(bt['origins'])} rolling origins: ${legacy} 80% coverage ${(own * 100).toFixed(1)}% (T1 met).${approximated}`,
               backtest_id: String(bt['backtest_id']), skill };
    }
    return { state: 'unvalidated', note: `the applicable backtest records ${legacy}'s 80% coverage ${Number.isFinite(own) ? `${(own * 100).toFixed(1)}%` : 'n/a'}, outside the 75–85% T1 band.${approximated}`, backtest_id: null, skill };
  }
  if (observations < MIN_HISTORY_FOR_BACKTEST) {
    return { state: 'validation_impossible', note: `${observations} observation(s) are known at this cut-off; a backtest needs at least ${MIN_HISTORY_FOR_BACKTEST}. No accuracy is claimed.${approximated}`, backtest_id: null, skill: null };
  }
  return { state: 'unvalidated', note: `no backtest applies to this member's method, series, horizon, cut-off and history; the numbers are unscored.${approximated}`, backtest_id: null, skill: null };
}

