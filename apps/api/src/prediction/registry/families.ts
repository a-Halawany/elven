/**
 * CP-6 B25 §MR (0108) — THE FAMILIES AS THE ROUTED ISSUE RUNS THEM: which implementation serves which family and kind, the declarations a
 * proposal must carry (the same shape 0108 §MR.4's pmr_check_declarations insists on, said here in words), and `runFamily` — one registry
 * entry run on the known-at history for one target and horizon, answering the forecast's distribution, its outcome section and the claim
 * its statement makes. A DATA refusal (too little history, an intervention the history does not straddle, an infeasible optimisation) is a
 * FamilyRefusal — the request is refused and the method stays approved; any other throw is a FAILURE of the method — the routed issue
 * quarantines the entry.
 */
import { IMPLEMENTATION_DIGESTS } from './methods/digests.js';
import { EVENT_RATE_REF, eventProbability, type BetaPrior, type EventCondition } from './methods/event.js';
import { REGIME_JUDGEMENT_REF, regimeProbabilities, type RegimeCategory, type RegimeJudgement } from './methods/regime.js';
import { BAYESIAN_CONJUGATE_REF, bayesForecast, type BayesDeclarations } from './methods/bayesian.js';
import { CAUSAL_ITS_REF, interruptedTimeSeries, type CausalDeclarations } from './methods/causal.js';
import { OPTIMISATION_LP_REF, optimise, type OptimisationDeclarations } from './methods/optimisation.js';
import { round, type Band, type Point } from './methods/stats.js';

export type ForecastKind = 'quantity' | 'event' | 'state' | 'regime';
export const FAMILIES = ['statistical', 'event', 'state', 'bayesian', 'causal', 'structural_judgmental', 'optimisation'] as const;
export type Family = (typeof FAMILIES)[number];
export const HORIZON_CODES = ['30d', '90d', '180d', '1y', '3y', '5y'] as const;

/** The implementation each family runs on, and the kinds it issues. The statistical family is the legacy builtins' alone. */
export const FAMILY_IMPLEMENTATION: Readonly<Record<Family, { ref: string; kinds: readonly ForecastKind[] }>> = Object.freeze({
  statistical: { ref: 'legacy-models', kinds: ['quantity'] },
  event: { ref: EVENT_RATE_REF, kinds: ['event'] },
  state: { ref: REGIME_JUDGEMENT_REF, kinds: ['state'] },
  structural_judgmental: { ref: REGIME_JUDGEMENT_REF, kinds: ['state', 'regime'] },
  bayesian: { ref: BAYESIAN_CONJUGATE_REF, kinds: ['quantity'] },
  causal: { ref: CAUSAL_ITS_REF, kinds: ['quantity'] },
  optimisation: { ref: OPTIMISATION_LP_REF, kinds: ['quantity'] },
});

/** The digest this build carries for an implementation (undefined: not in this build). */
export const codeDigestOf = (implementationRef: string): string | undefined => IMPLEMENTATION_DIGESTS[implementationRef];

export class FamilyRefusal extends Error {
  constructor(readonly refusalClass: string, message: string) { super(message); }
}

export interface PlannedEntry {
  method_ref: string; method_key: string; version: number; family: Family; implementation_ref: string; implementation_digest: string;
  parameters: Record<string, unknown>; declarations: Record<string, unknown>; confidence_language: string; builtin?: boolean;
}
export interface TargetRow { target_key: string; version: number; kind: ForecastKind; unit: string; title: string; definition: Record<string, unknown>; sources: Record<string, unknown>; subject_entity_id: string | null; risk_class: string }

export interface FamilyInput {
  points: readonly Point[]; seriesKey: string; seriesUnit: string; seasonality: number; horizonCode: string; horizonDays: number;
  originAt: string; targetAt: string; kind: ForecastKind; target: TargetRow | null;
}
export interface FamilyResult {
  kind: ForecastKind; quantiles: Band | Record<string, never>; distribution: Record<string, unknown>; outcome: Record<string, unknown>;
  parameters: Record<string, unknown>; baselineMethod: string; unit: string; claim: string; scenarioLanguage: boolean;
}

const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmt = (x: number, p = 4): string => Number(x.toFixed(p)).toString();

export function eventConditionOf(target: TargetRow | null): EventCondition {
  const e = rec(rec(target?.definition)['event']);
  const comparator = e['comparator']; const threshold = num(e['threshold']); const consecutive = num(e['consecutive']);
  if (target === null || (comparator !== '<' && comparator !== '<=' && comparator !== '>' && comparator !== '>=') || threshold === null || consecutive === null || consecutive < 1) {
    throw new FamilyRefusal('target', 'forecast rejected (target): an event forecast is OF a target whose definition declares the event (definition.event {comparator, threshold, consecutive}); a probability is never derived from narrative');
  }
  return { comparator, threshold, consecutive: Math.floor(consecutive) };
}

function categoriesOf(target: TargetRow | null, kind: 'state' | 'regime'): { categories: RegimeCategory[]; windowDays: number } {
  const d = rec(rec(target?.definition)[kind]);
  const cats = Array.isArray(d['categories']) ? (d['categories'] as unknown[]) : [];
  const windowDays = num(d['classification_window_days']);
  if (target === null || cats.length < 2 || windowDays === null || windowDays < 1) {
    throw new FamilyRefusal('target', `forecast rejected (target): a ${kind} forecast is OF a target whose definition declares its categories and classification window (definition.${kind})`);
  }
  return { windowDays: Math.floor(windowDays), categories: cats.map((c) => { const r = rec(c); const rule = r['rule'] === null || r['rule'] === undefined ? null : rec(r['rule']);
    return { key: String(r['key']), label: String(r['label']), rule: rule === null ? null : { comparator: rule['comparator'] as EventCondition['comparator'], threshold: Number(rule['threshold']) } }; }) };
}

/** Run one planned entry on the known-at history. Throws FamilyRefusal for a governed data refusal; anything else is the method failing. */
export function runFamily(entry: PlannedEntry, a: FamilyInput): FamilyResult {
  const d = entry.declarations;
  switch (entry.family) {
    case 'event': {
      const c = eventConditionOf(a.target);
      const prior = rec(d['prior']) as unknown as BetaPrior;
      const minWindows = num(entry.parameters['min_windows']) ?? 6;
      const p = eventProbability(a.points, a.horizonDays, c, prior);
      if (p.windows < minWindows) {
        throw new FamilyRefusal('history', `forecast rejected (history): ${p.windows} complete ${a.horizonDays}-day window(s) of ${a.seriesKey} are known; ${entry.method_ref} needs at least ${minWindows} to estimate a probability`);
      }
      const condition = `${a.seriesKey} ${c.comparator} ${c.threshold} on ${c.consecutive} consecutive published observation(s)`;
      return {
        kind: 'event', quantiles: { q10: p.q10, q50: p.q50, q90: p.q90 },
        distribution: { q10: p.q10, q50: p.q50, q90: p.q90, unit: 'probability', probability: p.probability },
        outcome: { type: 'event', condition: { ...c, series_key: a.seriesKey, window_days: a.horizonDays, window: `${a.originAt} → ${a.targetAt}` }, probability: p.probability,
                   credible_band: { q10: p.q10, q50: p.q50, q90: p.q90 }, prior: p.prior, posterior: p.posterior, evidence: { windows: p.windows, hits: p.hits, skipped_coverage_gaps: p.skipped, window_days: p.windowDays },
                   basis: 'counted windows of the series under the declared Beta prior — never narrative' },
        parameters: { prior: p.prior, window_days: p.windowDays, min_windows: minWindows }, baselineMethod: 'prior-mean reference', unit: 'probability',
        claim: `P(${condition} within the ${a.horizonCode} window to ${a.targetAt}) = ${fmt(p.probability)} (80% credible band ${fmt(p.q10)}–${fmt(p.q90)}); `
          + `${entry.method_ref} on ${p.windows} non-overlapping ${p.windowDays}-day windows of history (${p.hits} with the event) under the declared Beta(${p.prior.alpha}, ${p.prior.beta}) prior`,
        scenarioLanguage: false,
      };
    }
    case 'state':
    case 'structural_judgmental': {
      if (a.kind !== 'state' && a.kind !== 'regime') throw new FamilyRefusal('kind', `forecast rejected (kind): ${entry.method_ref} speaks of states and regimes, not of a ${a.kind}`);
      const { categories, windowDays } = categoriesOf(a.target, a.kind);
      const j = rec(d['judgement']) as unknown as RegimeJudgement;
      const missing = categories.filter((c) => !(Number(rec(j.pseudo_counts)[c.key]) > 0)).map((c) => c.key);
      if (missing.length > 0) {
        throw new FamilyRefusal('target', `forecast rejected (target): ${entry.method_ref}'s judgement declares no pseudo-count for the target's categor${missing.length === 1 ? 'y' : 'ies'} ${missing.join(', ')}; the judgement and the target are revised together`);
      }
      const r = regimeProbabilities(a.points, categories, windowDays, j);
      if (r.windows === 0) throw new FamilyRefusal('history', `forecast rejected (history): no complete ${windowDays}-day classification window of ${a.seriesKey} is known; the evidence summary would be empty`);
      const words = r.categories.map((x) => `${x.label} ${fmt(x.probability, 2)}`).join(', ');
      return {
        kind: a.kind, quantiles: {},
        distribution: { unit: 'probability', categories: r.categories.map((x) => ({ key: x.key, label: x.label, probability: x.probability })) },
        outcome: { type: a.kind, categories: r.categories, modal: r.modal, judgement: { judged_by: j.judged_by, rationale: j.rationale, pseudo_counts: j.pseudo_counts, share: r.judgementShare },
                   evidence: { classification_window_days: windowDays, windows: r.windows, skipped_coverage_gaps: r.skipped, share: r.evidenceShare },
                   sensitivity_to_judgement: r.sensitivity, language: 'scenario_language', validation: 'none claimed — scenario language at a long horizon, never presented as validated' },
        parameters: { classification_window_days: windowDays }, baselineMethod: 'the declared judgement alone', unit: 'probability',
        claim: `SCENARIO LANGUAGE, NOT A VALIDATED FORECAST — the ${a.kind}s of ${a.target?.title ?? a.seriesKey} at ${a.horizonCode} (${a.targetAt}): ${words}; `
          + `from the structural judgement declared by principal ${j.judged_by} (${Math.round(r.judgementShare * 100)}% of the weight) and ${r.windows} counted ${windowDays}-day windows of ${a.seriesKey}; `
          + `judgement held half as firmly or twice as firmly moves a category by up to ${fmt(r.sensitivity.maxShift, 2)}`,
        scenarioLanguage: true,
      };
    }
    case 'bayesian': {
      const decl = d as unknown as BayesDeclarations;
      const f = bayesForecast(a.points, decl, a.targetAt);
      const sens = f.sensitivity.sensitive
        ? ` PRIOR-SENSITIVE: a declared alternative prior moves the median by ${fmt(f.sensitivity.maxShiftSd, 2)} predictive sd (threshold ${f.sensitivity.threshold}).`
        : ` Prior sensitivity: the declared alternatives move the median by at most ${fmt(f.sensitivity.maxShiftSd, 2)} predictive sd (threshold ${f.sensitivity.threshold}).`;
      return {
        kind: 'quantity', quantiles: f.band,
        distribution: { ...f.band, unit: a.seriesUnit, quantity: f.quantity, path: [] },
        outcome: { type: 'quantity', quantity: f.quantity, model: f.model, prior: decl.prior, alternatives: decl.alternatives, posterior: f.posterior, predictive: { mean: f.mean, sd: f.sd },
                   prior_sensitivity: f.sensitivity },
        parameters: { model: f.model }, baselineMethod: 'climatology', unit: a.seriesUnit,
        claim: `${f.quantity} of ${a.seriesKey} at ${a.horizonCode} (${a.targetAt}): posterior predictive median ${fmt(f.band.q50)} ${a.seriesUnit}, 80% band ${fmt(f.band.q10)}–${fmt(f.band.q90)}; `
          + `${entry.method_ref} (${f.model}) under its declared, explicit prior.${sens}`,
        scenarioLanguage: false,
      };
    }
    case 'causal': {
      const decl = d as unknown as CausalDeclarations;
      if (decl.intervention.date > a.originAt) {
        throw new FamilyRefusal('intervention', `forecast rejected (intervention): the declared intervention (${decl.intervention.date}) is after the last known observation (${a.originAt}); its effect cannot be estimated from this history`);
      }
      let out;
      try { out = interruptedTimeSeries(a.points, decl, a.seasonality); } catch (e) {
        throw new FamilyRefusal('history', `forecast rejected (history): ${(e as Error).message}`);
      }
      const e = out.effect;
      return {
        kind: 'quantity', quantiles: { q10: e.q10, q50: e.q50, q90: e.q90 },
        distribution: { q10: e.q10, q50: e.q50, q90: e.q90, unit: `${a.seriesUnit} (effect)`, path: [] },
        outcome: { type: 'effect', estimand: `the mean effect of "${decl.intervention.description}" on ${a.seriesKey} over the ${decl.post_days} days from ${decl.intervention.date}`,
                   ...out },
        parameters: { pre_days: decl.pre_days, post_days: decl.post_days, season: decl.season ?? a.seasonality }, baselineMethod: 'pre-period trend and season (the counterfactual)', unit: `${a.seriesUnit} (effect)`,
        claim: `the effect of "${decl.intervention.description}" (${decl.intervention.date}) on ${a.seriesKey}: ${fmt(e.estimate)} ${a.seriesUnit} (80% band ${fmt(e.q10)}–${fmt(e.q90)}, se ${fmt(e.se)}); `
          + `interrupted time series under ${decl.identification.assumptions.length} declared identification assumption(s); placebo p ${out.placebo.p_value ?? 'n/a'} over ${out.placebo.effects.length} fake date(s); `
          + `pre-fit balance SMD ${fmt(out.balance.smd, 3)} (${out.balance.balanced ? 'balanced' : 'NOT balanced'}); pre-window sensitivity ${fmt(out.sensitivity.range[0])}…${fmt(out.sensitivity.range[1])} (sign ${out.sensitivity.sign_stable ? 'stable' : 'NOT stable'})`,
        scenarioLanguage: false,
      };
    }
    case 'optimisation': {
      const decl = d as unknown as OptimisationDeclarations;
      const o = optimise(a.points, decl);
      if (o.status === 'infeasible' || o.band === null || o.implementable.x === null) {
        const broken = o.feasibility.filter((f) => !f.satisfied).map((f) => `${f.label} (${fmt(f.lhs)} ${f.comparator} ${fmt(f.rhs)})`).join('; ');
        throw new FamilyRefusal('infeasible', `forecast rejected (infeasible): the declared constraints of ${entry.method_ref} admit no plan${broken === '' ? '' : ` — at the bounds: ${broken}`}; a steward revises the entry`);
      }
      const plan = o.variables.map((v, i) => `${v} = ${fmt(o.implementable.x![i]!)}`).join(', ');
      return {
        kind: 'quantity', quantiles: o.band,
        distribution: { ...o.band, unit: decl.objective.unit, quantity: decl.objective.statement, path: [], band_kind: 'scenario band over the declared parameter band (low / mid / high) — not a statistical interval' },
        outcome: { type: 'objective', ...o, approval: 'the objective and the constraints are the registry entry\'s, approved by its method steward' },
        parameters: { grid: decl.variables.map((v) => ({ name: v.name, step: v.step })) }, baselineMethod: 'the LP relaxation (optimality gap)', unit: decl.objective.unit,
        claim: `${decl.objective.statement} at ${a.horizonCode}: ${fmt(o.band.q50)} ${decl.objective.unit} at the implementable plan ${plan} (scenario band ${fmt(o.band.q10)}–${fmt(o.band.q90)} over the declared parameter band); `
          + `feasible; optimality gap ${o.gap === null ? 'n/a' : `${fmt(o.gap * 100, 2)}%`} against the LP optimum ${fmt(o.lp.value ?? NaN)}`,
        scenarioLanguage: false,
      };
    }
    default:
      throw new Error(`${entry.method_ref}: the ${entry.family} family is run by the legacy path, not here`);
  }
}

/* ───────────── what a proposal must declare (said in words; the database insists on the same) ───────────── */

const refuse = (cls: string, msg: string): never => { throw new FamilyRefusal(cls, `forecast method rejected (${cls}): ${msg}`); };

export function checkDeclarations(family: Family, kinds: readonly string[], declarations: Record<string, unknown>, parameters: Record<string, unknown>): void {
  const allowed = FAMILY_IMPLEMENTATION[family].kinds;
  if (!kinds.every((k) => (allowed as readonly string[]).includes(k))) refuse('kinds', `a ${family} method issues ${allowed.join(' / ')} forecasts`);
  const d = declarations;
  if (family === 'statistical') refuse('family', 'the statistical family is the two legacy builtins\' (seasonal_naive@1, holt_winters@1); a domain retires or quarantines them, it does not propose new ones');
  if (family === 'event') {
    const p = rec(d['prior']);
    if (!(num(p['alpha']) !== null && num(p['beta']) !== null && Number(p['alpha']) > 0 && Number(p['beta']) > 0)) refuse('declarations', 'an event method declares its Beta prior explicitly (declarations.prior {alpha > 0, beta > 0})');
    if (parameters['min_windows'] !== undefined && !(num(parameters['min_windows']) !== null && Number(parameters['min_windows']) >= 1)) refuse('parameters', 'parameters.min_windows is a positive number');
  }
  if (family === 'bayesian') {
    const okPrior = (v: unknown): boolean => {
      const p = rec(v);
      if (p['model'] === 'normal_linear') {
        const i = rec(p['intercept']); const s = rec(p['slope_per_year']);
        return num(p['window_days']) !== null && Number(p['window_days']) >= 1 && num(i['mean']) !== null && num(i['sd']) !== null && Number(i['sd']) > 0 && num(s['mean']) !== null && num(s['sd']) !== null && Number(s['sd']) > 0;
      }
      if (p['model'] === 'gamma_poisson') return num(p['shape']) !== null && Number(p['shape']) > 0 && num(p['rate']) !== null && Number(p['rate']) > 0;
      return false;
    };
    if (!okPrior(d['prior'])) refuse('declarations', 'a bayesian method declares its prior EXPLICITLY: normal_linear {window_days, intercept {mean, sd > 0}, slope_per_year {mean, sd > 0}} or gamma_poisson {shape > 0, rate > 0}');
    const alts = Array.isArray(d['alternatives']) ? (d['alternatives'] as unknown[]) : [];
    if (alts.length === 0) refuse('declarations', 'a bayesian method declares the alternative priors its sensitivity runs under (declarations.alternatives, at least one)');
    for (const a of alts) {
      const r = rec(a);
      if (typeof r['label'] !== 'string' || !okPrior(r['prior']) || rec(r['prior'])['model'] !== rec(d['prior'])['model']) refuse('declarations', 'each alternative prior has a label and a prior of the same model, explicit');
    }
  }
  if (family === 'causal') {
    const iv = rec(d['intervention']); const id = rec(d['identification']);
    if (typeof iv['date'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iv['date']) || typeof iv['description'] !== 'string' || iv['description'].trim().length < 8) refuse('declarations', 'a causal method declares its intervention (declarations.intervention {date YYYY-MM-DD, description})');
    if (!Array.isArray(id['assumptions']) || id['assumptions'].length === 0 || typeof id['statement'] !== 'string' || id['statement'].trim().length < 8) refuse('declarations', 'a causal method declares its identification assumptions (declarations.identification {assumptions: [ASU ids], statement})');
    if (!(num(d['pre_days']) !== null && Number(d['pre_days']) >= 28) || !(num(d['post_days']) !== null && Number(d['post_days']) >= 3)) refuse('declarations', 'a causal method declares its windows (declarations.pre_days ≥ 28, post_days ≥ 3)');
  }
  if (family === 'optimisation') {
    const o = rec(d['objective']);
    const vars = Array.isArray(d['variables']) ? (d['variables'] as unknown[]) : [];
    if (o['sense'] !== 'minimise' && o['sense'] !== 'maximise') refuse('declarations', 'an optimisation method declares its objective (declarations.objective {sense minimise|maximise, coefficients, constant, unit, statement})');
    if (vars.length < 1 || vars.length > 4 || !vars.every((v) => { const r = rec(v); return typeof r['name'] === 'string' && num(r['lo']) !== null && num(r['hi']) !== null && Number(r['hi']) >= Number(r['lo']) && num(r['step']) !== null && Number(r['step']) > 0; })) {
      refuse('declarations', 'an optimisation method declares one to four decision variables {name, lo ≤ hi, step > 0}');
    }
    if (!Array.isArray(o['coefficients']) || o['coefficients'].length !== vars.length || typeof o['unit'] !== 'string' || typeof o['statement'] !== 'string' || o['constant'] === undefined) refuse('declarations', 'the objective has one coefficient per variable, a constant, a unit and a statement');
    const cons = Array.isArray(d['constraints']) ? (d['constraints'] as unknown[]) : [];
    if (cons.length === 0) refuse('declarations', 'an optimisation method declares its constraints (declarations.constraints, at least one) — the steward approves them with the entry');
    for (const c of cons) {
      const r = rec(c);
      if (typeof r['label'] !== 'string' || !Array.isArray(r['coefficients']) || r['coefficients'].length !== vars.length || !['<=', '>=', '='].includes(String(r['comparator'])) || r['rhs'] === undefined) {
        refuse('declarations', 'each constraint has a label, one coefficient per variable, a comparator (<=, >=, =) and a right-hand side');
      }
    }
    const params = rec(d['parameters']); const inputs = rec(d['inputs']);
    for (const [k, v] of Object.entries(params)) { const r = rec(v); if (num(r['low']) === null || num(r['mid']) === null || num(r['high']) === null || typeof r['source'] !== 'string') refuse('declarations', `parameter ${k} declares low, mid, high and its source`); }
    for (const [k, v] of Object.entries(inputs)) { const r = rec(v); if (r['kind'] !== 'series_recent_mean' || num(r['window_days']) === null) refuse('declarations', `input ${k} is a series_recent_mean with window_days`); }
  }
  if (family === 'structural_judgmental' || family === 'state') {
    const j = rec(d['judgement']);
    const pc = rec(j['pseudo_counts']);
    if (Object.keys(pc).length < 2 || !Object.values(pc).every((v) => num(v) !== null && Number(v) > 0) || typeof j['rationale'] !== 'string' || j['rationale'].trim().length < 8 || typeof j['judged_by'] !== 'string') {
      refuse('declarations', 'a structural-judgmental method declares its judgement (declarations.judgement {pseudo_counts per category > 0, rationale, judged_by: the named human})');
    }
  }
}

export const r6 = (x: number): number => round(x, 6);
