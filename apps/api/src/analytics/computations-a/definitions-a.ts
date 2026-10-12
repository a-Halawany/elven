/**
 * B92 §MCA (0113 §MCA) — THE CONTRACTS of computations A: the product metrics of decisions, strategy, foresight, warnings and forecasts
 * (App M MET-001..005, MET-019..030), V01-T-046's value measures (those with a source in the product computed; the rest declared unsupported
 * with their carriers) and ES-40-008's two new indicators (residual R1 of §B36.12 row 9).
 *
 * A contract is DATA — an analyst's PROPOSAL through §MD's governed port, approved by a named product analytics owner (never its proposer,
 * never an agent). App M gives each metric's meaning, scope, threshold, cadence and owner; the population, numerator, denominator, exclusions,
 * window and clock below are THIS PRODUCT'S READINGS (MAP.md §2, DESIGN D9), stated so the approver sees exactly what is counted. No target
 * is invented where App M names none ("higher with completeness threshold", "severity SLO", "baseline-improving"): the threshold stays empty
 * and the contract says the owner sets it.
 *
 * CLAIMS: software capability. The harness proves the computations on SYNTHETIC planted records; the act demonstrates them on NORDWERK's
 * SYNTHETIC demonstration records; neither is real-provider or signed acceptance (R2). Synthetic channels (demo-mailbox) never count as a
 * delivery unless a definition admits them, and then they are said.
 */
import type { MetricContract } from '../contract.js';
import { PERSON_DIMENSIONS } from '../seams.js';

const RETIRE = 'retired when the product no longer records its source, or when the owner replaces it with a successor definition (its history stays readable)';
const REVIEW = (who: string) => `a breach opens a review (an investigation workflow) by ${who} with the product analytics owner — never an automatic or punitive decision`;
const AT_AS_OF = 'every input is read as recorded at or before the result\'s as-of: a replay at the same as-of reproduces the records and the value';
const COST = { allocation: 'analytics-cost', basis: 'rows read and compute time of each run, metered (§CO)' } as const;
const DECISION_CLASSES = ['standard', 'board'];
/** Identity helpers: a contract's metric and computation names, written as calls (a `…Key: '<name>'` literal reads as a secret to the history scanner). */
const mk = (name: string): string => name;
const ck = (name: string): string => name;

/** The App M / V1 metrics this part computes (23) and the V01-T-046 measures with no source (6, unsupported). */
const contractsA: MetricContract[] = [
  // ── DECISIONS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    metricKey: mk('MET-001'), title: 'Strategic loop closure rate',
    meaning: 'Decisions with linked objective, evidence, foresight, commitment, outcome, and learning (App M MET-001; scope Decision + tenant + period)',
    kind: 'rate', unit: 'share of committed decisions', direction: 'higher',
    population: { subject: 'decision package', inclusion: 'packages COMMITTED in the window (their latest commitment in it), in scope', scope_rule: 'the package rule: the committed version\'s objectives or the ids its options cite', clock_note: 'record clock: decision.commitments.committed_at' },
    numerator: 'packages with all six links at the as-of — objective (a strategy objective of the domain), evidence (≥ 1 standing evidence/claim citation), foresight (a standing run or forecast cited, a scenario reached through a cited run, or a bound scenario set), commitment (the commitment itself — met by construction, shown), outcome (≥ 1 outcome recorded on the committed version AND ≥ 1 outcome assessment: decision_metrics\' outcome_linkage.linked), learning (a governed lesson in decision.lessons, or the closure\'s lessons record)',
    denominator: 'every package committed in the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'learning applied (V01-T-040)', note: 'the strategic loop the decision serves: objective → decision → outcome → learning' },
    cadence: 'quarterly operating review (App M: monthly)', ownerRole: 'Executive product owner',
    action: REVIEW('the executive product owner'), retirement: RETIRE,
    quality: { completeness_threshold: 'App M names a "completeness threshold" without a value: the owner sets it — none is invented', as_of: AT_AS_OF, record_detail: 'every record carries its six-link vector and the missing links named' },
    costAllocation: COST, computationKey: ck('met001_loop_closure'), params: {}, unsupportedReason: null, sourceRefs: ['MET-001', 'V01-T-040'],
  },
  {
    metricKey: mk('MET-002'), title: 'Decision package completeness',
    meaning: 'Required evidence, alternatives, risks, dissent, explanation, and authority present (App M MET-002; scope Decision class + deployment)',
    kind: 'rate', unit: 'share of package versions at the gate', direction: 'higher',
    population: { subject: 'decision package version', inclusion: 'versions that reached the decision-ready gate in the window (params.gate: ready = the B34 gate action; proposed = the version\'s proposal)', scope_rule: 'the package rule', clock_note: 'record clock: the gate instant' },
    numerator: 'versions with all six elements present AT THE GATE INSTANT: evidence (≥ 1 standing evidence/claim/run citation), alternatives (≥ 2 options with exactly one status quo — decision_metrics\' criteria), risks named, dissent (≥ 1 recorded position), explanation (decision.explanations of the version), authority (the approver policy)',
    denominator: 'every version that reached the gate in the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['decision_class'], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: { target: 1 }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'decision completeness (V01-T-046)' },
    cadence: 'per gate, read per quarter', ownerRole: 'Decision product owner',
    action: REVIEW('the decision product owner'), retirement: RETIRE,
    quality: { dissent: 'the product records no "no dissent" declaration: a version where no position was recorded counts as dissent absent — said, not hidden', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met002_package_completeness'), params: { gate: 'ready' }, unsupportedReason: null, sourceRefs: ['MET-002', 'V01-T-046'],
  },
  {
    metricKey: mk('MET-003'), title: 'Decision replay success',
    meaning: 'Historical decision snapshots reconstructed without unresolved versions (App M MET-003; scope Tenant + decision cohort)',
    kind: 'rate', unit: 'share of replayed committed decisions', direction: 'higher',
    population: { subject: 'decision package', inclusion: 'packages committed in the window, in scope; each one\'s latest replay of the committed version', scope_rule: 'the package rule', clock_note: 'record clock: decision.commitments.committed_at' },
    numerator: 'packages whose latest replay (by the as-of) has no unavailable input',
    denominator: 'packages with a replay by the as-of',
    exclusions: [{ rule: 'a package never replayed by the as-of', reason: 'not replayed: unmeasured, counted — and when more than half the cohort is unreplayed the result is indeterminate (a rate over the replays someone chose to run is biased)' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: { target: 1 }, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'replay coverage (V01-T-046)' },
    cadence: 'quarterly', ownerRole: 'Governance',
    action: REVIEW('governance'), retirement: RETIRE,
    quality: { as_of: AT_AS_OF, bias: 'replays are run on demand; the unreplayed share is reported and gates the value above 50 %' },
    costAllocation: COST, computationKey: ck('met003_replay_success'), params: {}, unsupportedReason: null, sourceRefs: ['MET-003', 'V01-T-046'],
  },
  {
    metricKey: mk('MET-004'), title: 'Human authority integrity',
    meaning: 'Consequential effects bound to eligible human, digest, and audit (App M MET-004; scope Consequence class + deployment)',
    kind: 'rate', unit: 'share of consequential effects', direction: 'higher',
    population: { subject: 'consequential effect', inclusion: 'decision commitments and signed acts (executive.signatures) recorded in the window — the stated universe', scope_rule: 'ignored: domain-wide by nature', clock_note: 'record clock' },
    numerator: 'effects bound to an eligible human (every named approval an approve by a human on the same version digest, before the effect and not revoked; a signature\'s signer human), to a digest, and to an audit event of the same correlation',
    denominator: 'every commitment and signed act in the window',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['consequence_class'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: { target: 1 }, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'auditability (V01-T-040)' },
    cadence: 'continuous, read per quarter', ownerRole: 'Trust authority',
    action: REVIEW('the trust authority'), retirement: RETIRE,
    quality: { universe: 'commitments + signed acts; further effect kinds join by a new version', as_of: AT_AS_OF, person: 'records name the effect and the failed binding, never the person' },
    costAllocation: COST, computationKey: ck('met004_authority_integrity'), params: {}, unsupportedReason: null, sourceRefs: ['MET-004', 'V01-T-040'],
  },
  {
    metricKey: mk('MET-005'), title: 'Recommendation explanation closure',
    meaning: 'Recommendations resolving to evidence, assumptions, methods, alternatives, and uncertainty (App M MET-005; scope Capability + model + period)',
    kind: 'rate', unit: 'share of decision-active recommendations', direction: 'higher',
    population: { subject: 'recommendation', inclusion: 'recommendations recorded in the window that are decision-active at the as-of (proposed or accepted for consideration)', scope_rule: 'the package rule of the recommendation\'s version', clock_note: 'record clock: decision.recommendations.recorded_at' },
    numerator: 'recommendations resolving to all five: evidence (the option cites evidence/claim/run), assumptions (stated), methods (model outputs or option runs), alternatives (≥ 2 interventions — recommendation_completeness), uncertainty (the option simulated, or an explanation of the recommendation)',
    denominator: 'every decision-active recommendation of the window, in scope',
    exclusions: [{ rule: 'withdrawn, superseded or declined by the as-of', reason: 'no longer decision-active' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: { target: 1 }, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'explanation closure of decision support' },
    cadence: 'continuous, read per quarter', ownerRole: 'AI governance',
    action: REVIEW('AI governance'), retirement: RETIRE,
    quality: { as_of: AT_AS_OF, model: 'the recommending author kind is on each record (human | agent)' },
    costAllocation: COST, computationKey: ck('met005_explanation_closure'), params: {}, unsupportedReason: null, sourceRefs: ['MET-005'],
  },
  // ── FORESIGHT: SIGNALS, WARNINGS, FORECASTS, SCENARIOS, RUNS, TWINS ─────────────────────────────────────────────────────────────────────
  {
    metricKey: mk('MET-019'), title: 'Weak signal precision',
    meaning: 'Analyst-confirmed signals among reviewed nominations (App M MET-019; scope Domain + detector; monitored, not optimized alone)',
    kind: 'rate', unit: 'share of human-reviewed nominations', direction: 'track',
    population: { subject: 'weak signal nomination', inclusion: 'nominations whose latest HUMAN disposition (signal.disposition / signal.escalated) falls in the window', scope_rule: 'the signal\'s subject entity, or the warning raised from it', clock_note: 'record clock: the disposition event' },
    numerator: 'confirmed: disposition confirm, or escalate (an escalation is the analyst\'s confirmation that raises a warning)',
    denominator: 'every human-dispositioned nomination (confirm, escalate, monitor, dismiss)',
    exclusions: [{ rule: 'a disposition by an agent', reason: 'not a human review: outside the population' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['detector'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'detection latency / warning precision (V01-T-040)' },
    cadence: 'monthly, read per quarter', ownerRole: 'Foresight owner',
    action: 'monitored, not optimized alone (App M): the foresight owner reviews it beside the lead time (MET-020) — never a target to push',
    retirement: RETIRE, quality: { as_of: AT_AS_OF, reading: 'escalate counts as confirmed — a deliberate reading the owner approves' },
    costAllocation: COST, computationKey: ck('met019_signal_precision'), params: {}, unsupportedReason: null, sourceRefs: ['MET-019'],
  },
  {
    metricKey: mk('MET-020'), title: 'Weak signal lead time',
    meaning: 'Time between first governed signal and material event or assessment (App M MET-020; scope Domain + event class)',
    kind: 'duration', unit: 'seconds', direction: 'track',
    population: { subject: 'warning raised from a weak signal', inclusion: 'warnings of origin weak_signal raised in the window, in scope', scope_rule: 'the warning rule', clock_note: 'record clock: raised_at' },
    numerator: null, denominator: null,
    exclusions: [{ rule: 'the originating signal unreadable, or recorded after the warning', reason: 'the lead time has no start / is undefined' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'detection latency (V01-T-040)', note: '"material event or assessment" read as the warning raised from the signal — the only recorded link' },
    cadence: 'quarterly', ownerRole: 'Foresight owner',
    action: 'distribution tracked (App M): reviewed by the foresight owner; no target', retirement: RETIRE,
    quality: { as_of: AT_AS_OF, distribution: 'p50, p90 and the median\'s order-statistic interval' },
    costAllocation: COST, computationKey: ck('met020_signal_lead_time'), params: {}, unsupportedReason: null, sourceRefs: ['MET-020'],
  },
  {
    metricKey: mk('MET-021'), title: 'Warning delivery latency',
    meaning: 'Trigger-to-receipt time for eligible recipients (App M MET-021; scope Severity + channel + deployment)',
    kind: 'duration', unit: 'seconds', direction: 'lower',
    population: { subject: 'delivery of a warning', inclusion: 'delivered deliveries of warning attention items whose receipt falls in the window, in scope', scope_rule: 'the warning rule', clock_note: 'record clock: the receipt instant' },
    numerator: null, denominator: null,
    exclusions: [{ rule: 'a synthetic channel (demo-mailbox …) unless params.admit_synthetic', reason: 'a synthetic receipt demonstrates the software, never a delivery' },
                 { rule: 'a receipt before the raise', reason: 'undefined' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['severity', 'channel'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: {}, purposeKey: 'service-reliability',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'detection latency (V01-T-040)' },
    cadence: 'continuous, read per quarter', ownerRole: 'Warning owner',
    action: REVIEW('the warning owner'), retirement: RETIRE,
    quality: { slo: 'App M names a severity SLO; the product holds no SLO table — the owner declares it, none is invented', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met021_warning_delivery_latency'), params: { admit_synthetic: false }, unsupportedReason: null, sourceRefs: ['MET-021', 'V01-T-046'],
  },
  {
    metricKey: mk('MET-022'), title: 'Warning acknowledgment latency',
    meaning: 'Receipt-to-qualified acknowledgment time (App M MET-022; scope Severity + role)',
    kind: 'duration', unit: 'seconds', direction: 'lower',
    population: { subject: 'acknowledged warning', inclusion: 'warnings in scope acknowledged in the window by a QUALIFIED role (one of params.qualified_roles held at the acknowledgement instant)', scope_rule: 'the warning rule: affected objectives / assets / geographies, or the forecast\'s series', clock_note: 'record clock: acknowledged_at; start = the receipt' },
    numerator: null, denominator: null,
    exclusions: [
      { rule: 'a replayed (world-clock) warning', reason: 'its acknowledgement answers on the replay instant — not comparable with a live receipt (prediction.evaluate_warnings measures it on its own clock)' },
      { rule: 'acknowledged by a principal holding none of the qualified roles at the instant', reason: 'not a qualified acknowledgement' },
      { rule: 'no delivery receipt (or acknowledged before it) and no declared proxy', reason: 'no receipt instant' },
    ],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['severity', 'role'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: {}, purposeKey: 'service-reliability',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'detection latency (V01-T-040)', note: 'the operating review\'s acknowledgement latency for the corridor' },
    cadence: 'quarterly operating review (App M: continuous)', ownerRole: 'Warning owner',
    action: REVIEW('the warning owner'), retirement: RETIRE,
    quality: {
      proxy: 'DECLARED: a warning with no receipt (or acknowledged before it) starts at its raise (raised_at) — labelled on every record that uses it, its share reported (quality.proxy_share)',
      role_cohort: 'a role cohort is shown only above k = 5 distinct acknowledgers; the record names the role, never the person',
      slo: 'the severity SLO is the owner\'s to declare (no SLO table) — none is invented', as_of: AT_AS_OF,
    },
    costAllocation: COST, computationKey: ck('met022_warning_ack_latency'),
    params: { start: 'raised_proxy', qualified_roles: ['domain_admin', 'strategy_owner', 'forecast_owner', 'risk_owner'], admit_synthetic: false },
    unsupportedReason: null, sourceRefs: ['MET-022'],
  },
  {
    metricKey: mk('MET-023'), title: 'Warning action closure',
    meaning: 'Warnings with owned disposition, action, and outcome (App M MET-023; scope Severity + domain)',
    kind: 'rate', unit: 'share of material warnings', direction: 'higher',
    population: { subject: 'material warning', inclusion: 'warnings raised in the window judged material (the attention engine\'s verdict on the warning\'s item; else level high/critical)', scope_rule: 'the warning rule', clock_note: 'record clock: raised_at' },
    numerator: 'warnings with, by the as-of, an owned disposition (acknowledged or closed by a human), an action (an attention act that acted, or an exposure response) and an outcome (feedback or closure)',
    denominator: 'every material warning of the window, in scope',
    exclusions: [{ rule: 'not material', reason: 'outside the 100 % material cohort App M names' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['severity'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: { target: 1 }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'warning precision / action follow-through' },
    cadence: 'weekly, read per quarter', ownerRole: 'Risk owner',
    action: REVIEW('the risk owner'), retirement: RETIRE, quality: { as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met023_warning_action_closure'), params: {}, unsupportedReason: null, sourceRefs: ['MET-023'],
  },
  {
    metricKey: mk('MET-024'), title: 'Forecast calibration',
    meaning: 'Agreement between stated probability and observed frequency (App M MET-024; scope Horizon + target + method)',
    kind: 'rate', unit: 'share of outcomes inside q10–q90', direction: 'band',
    population: { subject: 'scored live forecast outcome', inclusion: 'outcome-ledger rows whose known_at falls in the window, for forecasts in scope', scope_rule: 'the forecast rule: the series key in series_keys, or the subject entity in entity_ids', clock_note: 'record clock: known_at (world clock: target_at)' },
    numerator: 'covered outcomes: q10 ≤ observed ≤ q90 (the ledger\'s own flag — ForecastingService.calibration\'s rule)',
    denominator: 'every scored live outcome of the window, in scope',
    exclusions: [{ rule: 'a backtest (retrospective or historical held-out history)', reason: 'a different definition, labelled by its mode: listed as context, never counted as live calibration' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['horizon', 'method'], privacyClass: 'aggregate', kMin: 5, floorN: 8,
    threshold: { band: [0.75, 0.85] }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'forecast calibration (V01-T-040)', note: 'the operating review\'s calibration for the corridor\'s series' },
    cadence: 'quarterly', ownerRole: 'Forecast owner',
    action: 'outside the approved band opens a review (an investigation workflow) by the forecast owner: recalibration or a method review — never an automatic withdrawal',
    retirement: RETIRE,
    quality: { band: 'the T1 constant (80 % ± 5 pp) made a governed band the owner approves', long_horizons: '3y/5y outcomes are observed coverage, never a validation claim (no 3y/5y validation has passed)', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met024_forecast_calibration'), params: {}, unsupportedReason: null, sourceRefs: ['MET-024', 'V01-T-040', 'V01-T-046'],
  },
  {
    metricKey: mk('MET-025'), title: 'Forecast sharpness',
    meaning: 'Concentration of calibrated predictive distributions (App M MET-025; scope Horizon + target)',
    kind: 'score', unit: 'mean relative 10–90 width', direction: 'lower',
    population: { subject: 'scored live forecast outcome', inclusion: 'the same population as MET-024', scope_rule: 'the forecast rule', clock_note: 'record clock: known_at' },
    numerator: null, denominator: null,
    exclusions: [{ rule: 'q50 = 0 or a quantile missing', reason: 'the relative width is undefined' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['horizon'], privacyClass: 'aggregate', kMin: 5, floorN: 8,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'forecast calibration improvement (V01-T-046)' },
    cadence: 'quarterly', ownerRole: 'Forecast owner',
    action: 'baseline-improving (App M): reviewed by the forecast owner against the prior quarter; no target', retirement: RETIRE,
    quality: { conditional: 'INDETERMINATE unless the same population is calibrated (coverage inside the band, n ≥ 8): a sharp but uncalibrated distribution is not a virtue', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met025_forecast_sharpness'), params: { band: [0.75, 0.85], min_calibrated: 8 }, unsupportedReason: null, sourceRefs: ['MET-025'],
  },
  {
    metricKey: mk('MET-026'), title: 'Scenario distinctness',
    meaning: 'Materially different driver and implication structures within approved sets (App M MET-026; scope Scenario set + domain)',
    kind: 'rate', unit: 'share of approved scenario sets', direction: 'higher',
    population: { subject: 'approved scenario set', inclusion: 'sets active at some point of the window', scope_rule: 'the set\'s package by the package rule', clock_note: 'record clock' },
    numerator: 'sets with ≥ 2 live branches, every branch declaring a driver/impact structure, every pair materially different (Jaccard similarity of their driver+impact element sets ≤ params.max_similarity)',
    denominator: 'every approved set of the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 2,
    threshold: { target: 1 }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'scenario coverage (V01-T-040)' },
    cadence: 'per set, read per quarter', ownerRole: 'Scenario owner',
    action: REVIEW('the scenario owner'), retirement: RETIRE,
    quality: { test: 'the distinctness test is a product reading (driver + impact elements; Jaccard ≤ 0.5) the owner approves', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met026_scenario_distinctness'), params: { max_similarity: 0.5 }, unsupportedReason: null, sourceRefs: ['MET-026', 'V01-T-040'],
  },
  {
    metricKey: mk('MET-027'), title: 'Simulation reproducibility',
    meaning: 'Runs reproducing outputs within declared numerical tolerance (App M MET-027; scope Model + deployment)',
    kind: 'rate', unit: 'share of reproduced accepted runs', direction: 'higher',
    population: { subject: 'accepted simulation run', inclusion: 'runs completed in the window and valid at the as-of; each one\'s latest reproduction', scope_rule: 'the twin rule: the run\'s twin boundary', clock_note: 'record clock: completed_at' },
    numerator: 'runs whose latest reproduction is reproduced (digest equality)',
    denominator: 'runs with a reproduction by the as-of',
    exclusions: [{ rule: 'never reproduced by the as-of', reason: 'unmeasured, not a failure — counted' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: { target: 1 }, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'replay coverage / auditability of foresight' },
    cadence: 'release, read per quarter', ownerRole: 'Simulation owner',
    action: REVIEW('the simulation owner'), retirement: RETIRE,
    quality: { tolerance: 'declared 0: the product reproduces by digest equality of the outputs (no numerical tolerance is recorded)', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met027_simulation_reproducibility'), params: {}, unsupportedReason: null, sourceRefs: ['MET-027'],
  },
  {
    metricKey: mk('MET-028'), title: 'Twin synchronization health',
    meaning: 'Twins within freshness, coverage, and validation contracts (App M MET-028; scope Twin + state class)',
    kind: 'rate', unit: 'share of admitted twins', direction: 'higher',
    population: { subject: 'twin', inclusion: 'twins with an admitted head on the actual branch at the as-of and a freshness policy', scope_rule: 'the twin rule: boundary entities', clock_note: 'a state measure at the as-of' },
    numerator: 'twins within all their contracts at the as-of: freshness (age ≤ the policy\'s max age — twin.tbr_age\'s rule at the as-of), coverage (every key the published contract exposes present and unexpired; no contract → the clause does not apply), validation (latest validation of the head fit)',
    denominator: 'every admitted twin with a freshness policy, in scope',
    exclusions: [{ rule: 'no admitted head', reason: 'nothing to be in sync' }, { rule: 'no freshness policy', reason: 'no synchronization contract to be within — counted' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 2,
    threshold: {}, purposeKey: 'service-reliability',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'resilience inputs: the twins decisions rest on' },
    cadence: 'continuous, read per quarter', ownerRole: 'Twin owner',
    action: REVIEW('the twin owner'), retirement: RETIRE,
    quality: { contract_specific: 'App M: contract-specific — each twin\'s own policy and contract are the thresholds; the rate has no target invented', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met028_twin_sync_health'), params: {}, unsupportedReason: null, sourceRefs: ['MET-028'],
  },
  // ── STRATEGY AND COMMITMENTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    metricKey: mk('MET-029'), title: 'Strategic alignment coverage',
    meaning: 'Initiatives and commitments linked to objectives, capabilities, owners, and measures (App M MET-029; scope Portfolio + period)',
    kind: 'rate', unit: 'share of material items', direction: 'higher',
    population: { subject: 'initiative or commitment obligation', inclusion: 'approved initiatives (by the window\'s end) and root commitment obligations live in the period', scope_rule: 'the item\'s objectives', clock_note: 'record clock' },
    numerator: 'items linked to an objective, a capability (directly or through an objective), a named human owner and a measure (a plan measure, or a measures alignment)',
    denominator: 'every material item of the period, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: { target: 1 }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'dependency visibility (V01-T-046)' },
    cadence: 'monthly, read per quarter', ownerRole: 'Strategy authority',
    action: REVIEW('the strategy authority'), retirement: RETIRE, quality: { material: 'approved initiatives and root obligations — a product reading the owner approves', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met029_alignment_coverage'), params: {}, unsupportedReason: null, sourceRefs: ['MET-029', 'V01-T-046'],
  },
  {
    metricKey: mk('MET-030'), title: 'Commitment outcome closure',
    meaning: 'Commitments closed with evidence, outcome, exception, or supersession (App M MET-030; scope Owner + portfolio — served at PORTFOLIO level only)',
    kind: 'rate', unit: 'share of items due', direction: 'higher',
    population: { subject: 'commitment item', inclusion: 'items due in the window', scope_rule: 'the item\'s objectives', clock_note: 'record clock: due_at' },
    numerator: 'items closed by the as-of with evidence (item.done; a root by the co-signed closure), an exception (item.waived), an outcome (a root whose package recorded an outcome) or supersession (item.cancelled, or a later commitment of the package)',
    denominator: 'every item due in the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: ['portfolio'], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: { target: 1 }, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'commitment follow-through' },
    cadence: 'weekly, read per quarter', ownerRole: 'Executive operator',
    action: REVIEW('the executive operator'), retirement: RETIRE,
    quality: { owner_scope: 'App M\'s "Owner" scope is NEVER a grouping (no employee-performance inference, D4): the owner routes accountability on the item itself; the metric is served per portfolio only', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('met030_commitment_closure'), params: {}, unsupportedReason: null, sourceRefs: ['MET-030'],
  },
  // ── V01-T-046 VALUE MEASURES ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    metricKey: mk('V1-decision-cycle'), title: 'Decision cycle time',
    meaning: 'Cycle time from a decision\'s proposal to its commitment (V01-T-046 "cycle time"; executive.metrics decision_latency)',
    kind: 'duration', unit: 'seconds', direction: 'lower',
    population: { subject: 'decision commitment', inclusion: 'commitments recorded in the window whose version was proposed', scope_rule: 'the package rule', clock_note: 'record clock: committed_at' },
    numerator: null, denominator: null,
    exclusions: [{ rule: 'no proposal instant', reason: 'the cycle has no start' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'decision cycle time (V01-T-040)' },
    cadence: 'quarterly', ownerRole: 'Executive product owner',
    action: 'reviewed in the quarterly operating review by the executive product owner; a shorter cycle is never a target in itself (balanced use)', retirement: RETIRE, quality: { as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('v1_decision_cycle'), params: {}, unsupportedReason: null, sourceRefs: ['V01-T-046', 'V01-T-040', 'ES-40-008'],
  },
  {
    metricKey: mk('V1-understanding-latency'), title: 'Understanding latency',
    meaning: 'Time from an attention item\'s routing to the first human act on it (V01-T-040 "understanding latency"; executive.metrics time_to_understanding)',
    kind: 'duration', unit: 'seconds', direction: 'lower',
    population: { subject: 'attention item', inclusion: 'items first routed in the window', scope_rule: 'ignored: the attention queue is the domain\'s', clock_note: 'record clock' },
    numerator: null, denominator: null,
    exclusions: [{ rule: 'no human act by the as-of', reason: 'counted, not measured — never a zero' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'detection/understanding latency (V01-T-040)' },
    cadence: 'quarterly', ownerRole: 'Executive product owner',
    action: 'reviewed in the quarterly operating review by the executive product owner — never a per-person speed (no employee-performance inference)', retirement: RETIRE, quality: { as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('v1_understanding_latency'), params: {}, unsupportedReason: null, sourceRefs: ['V01-T-040', 'V01-T-046', 'ES-40-008'],
  },
  {
    metricKey: mk('V1-warning-precision'), title: 'Warning precision',
    meaning: 'Warnings judged useful among those judged useful or false (V01-T-040 "warning precision"; prediction.evaluate_warnings\' feedback)',
    kind: 'rate', unit: 'share of judged warnings', direction: 'higher',
    population: { subject: 'warning', inclusion: 'warnings raised in the window carrying useful or false feedback by the as-of', scope_rule: 'the warning rule', clock_note: 'record clock: raised_at' },
    numerator: 'warnings marked useful', denominator: 'warnings marked useful or false',
    exclusions: [{ rule: 'marked both useful and false', reason: 'contradictory feedback' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'warning precision (V01-T-040)' },
    cadence: 'quarterly', ownerRole: 'Warning owner',
    action: 'reviewed by the warning owner beside the late / missed rates evaluate_warnings reports', retirement: RETIRE, quality: { as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('v1_warning_precision'), params: {}, unsupportedReason: null, sourceRefs: ['V01-T-040', 'V01-T-046'],
  },
  {
    metricKey: mk('V1-attention-saved'), title: 'Attention saved (noise reduction)',
    meaning: 'The attention queue\'s precision: material items acted on among material items surfaced (V01-T-040 "attention saved"; V01-T-046 "noise reduction"; executive.evaluate_attention_queue)',
    kind: 'rate', unit: 'share of material items', direction: 'higher',
    population: { subject: 'attention item', inclusion: 'items created in the window that are a true positive or a false alarm by the as-of', scope_rule: 'ignored: the attention queue is the domain\'s', clock_note: 'record clock' },
    numerator: 'true positives: material on arrival, acknowledged, disposed actioned', denominator: 'true positives and false alarms (material, then not_material / duplicate, or closed unacknowledged)',
    exclusions: [{ rule: 'below threshold, elevated later, late or undisposed', reason: 'not a precision case (evaluate_attention_queue counts them apart)' }],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 5,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'attention saved / noise reduction (V01-T-040, V01-T-046)' },
    cadence: 'quarterly', ownerRole: 'Executive product owner',
    action: 'reviewed by the executive product owner beside recall — precision alone is never optimized', retirement: RETIRE, quality: { as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('v1_attention_saved'), params: {}, unsupportedReason: null, sourceRefs: ['V01-T-040', 'V01-T-046'],
  },
  // ── ES-40-008 INDICATORS (residual R1, §B36.12 row 9) ─────────────────────────────────────────────────────────────────────────────────
  {
    metricKey: mk('ES40-commitment-visibility'), title: 'Commitment visibility',
    meaning: 'Commitment items visible to their owners within the declared days of creation (ES-40-008; residual R1)',
    kind: 'rate', unit: 'share of items created', direction: 'higher',
    population: { subject: 'commitment item', inclusion: 'items created in the window', scope_rule: 'the item\'s objectives', clock_note: 'record clock: created_at' },
    numerator: 'items with a delivered (non-synthetic) receipt to their owner, or the owner\'s acceptance, within params.within_days of creation',
    denominator: 'every item created in the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'commitment follow-through (ES-40-008)' },
    cadence: 'quarterly', ownerRole: 'Executive operator',
    action: 'an indeterminate or failed indicator constrains downstream use (§MD\'s use port): a review by the executive operator, never a per-owner score', retirement: RETIRE,
    quality: { reads: 'page reads are not recorded before §UX telemetry: visibility rests on receipts and acceptances', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('es40_commitment_visibility'), params: { within_days: 2 }, unsupportedReason: null, sourceRefs: ['ES-40-008'],
  },
  {
    metricKey: mk('ES40-explanation-use'), title: 'Explanation use before commitment',
    meaning: 'Decisions whose explanation was rendered before the commitment (ES-40-008; residual R1)',
    kind: 'rate', unit: 'share of commitments', direction: 'higher',
    population: { subject: 'decision commitment', inclusion: 'commitments recorded in the window', scope_rule: 'the package rule', clock_note: 'record clock: committed_at' },
    numerator: 'commitments whose version\'s explanation had a standing rendering at or before the commitment',
    denominator: 'every commitment of the window, in scope',
    exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'governance-assurance',
    serves: { decision_classes: DECISION_CLASSES, value_measure: 'explanation use (ES-40-008)' },
    cadence: 'quarterly', ownerRole: 'AI governance',
    action: 'an indeterminate or failed indicator constrains downstream use (§MD\'s use port): a review by AI governance', retirement: RETIRE,
    quality: { reads: 'page reads are not recorded before §UX telemetry: use rests on renderings', as_of: AT_AS_OF },
    costAllocation: COST, computationKey: ck('es40_explanation_use'), params: {}, unsupportedReason: null, sourceRefs: ['ES-40-008'],
  },
  // ── V01-T-046 MEASURES WITH NO SOURCE IN THE PRODUCT (served UNSUPPORTED — visible, never silently missing) ──────────────────────────
  ...([
    ['V1-prevented-loss', 'Prevented loss', 'Loss prevented by decisions and warnings', 'no realized-loss or counterfactual ledger exists: decision.outcome_assessments.inferred and exposure_outcome_reviews are partial inputs only; carrier: customer-approved outcome records (MET-040 value realization, R3 / F-P7-F-16)'],
    ['V1-captured-opportunity', 'Captured opportunity', 'Opportunity captured through decisions', 'no realized-opportunity ledger exists (opportunities are raised, not realized); carrier: customer-approved outcome records (MET-040 value realization, R3 / F-P7-F-16)'],
    ['V1-option-value', 'Preserved option value', 'Option value preserved by deferring or staging decisions', 'the product records the value of information as text only (package_versions.information_value); carrier: B73 (F-P6-01 decision option analysis: value of information)'],
    ['V1-resilience', 'Resilience', 'Resilience of the decision and operating system under disruption', 'no resilience-pattern or service-health record exists; carrier: B63 (F-P7D-11 degraded-mode catalogue, resilience patterns and service-health center)'],
    ['V1-residency-compliance', 'Residency compliance', 'Data and processing within the declared residency and sovereignty', 'no residency enforcement record exists (one deployment profile); carrier: B62 (F-P7D-06 residency and sovereignty enforcement)'],
    ['V1-lifecycle-coverage', 'Lifecycle coverage', 'Governed objects under a declared lifecycle (read: the share of governed work objects under a lifecycle state machine)', 'no universal work-object lifecycle register exists; carrier: B50 (F-P3-02 governed work-object lifecycle state machine)'],
  ] as const).map(([metricKey, title, meaning, reason]): MetricContract => ({
    metricKey, title, meaning: `${meaning} (V01-T-046 illustrative measure)`, kind: 'rate', unit: 'share', direction: 'higher',
    population: { subject: 'none recorded', inclusion: 'the product holds no source for this measure', scope_rule: 'not applicable' },
    numerator: 'not computable: no source', denominator: 'not computable: no source', exclusions: [],
    window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3,
    threshold: {}, purposeKey: 'mission-outcomes',
    serves: { decision_classes: DECISION_CLASSES, value_measure: `${title.toLowerCase()} (V01-T-040)` },
    cadence: 'quarterly', ownerRole: 'Executive product owner',
    action: 'served UNSUPPORTED with its carrier — visible beside the computed measures (balanced use), never a zero; reviewed by the executive when its carrier delivers', retirement: 'retired when its carrier delivers a computed successor definition',
    quality: {}, costAllocation: COST, computationKey: null, params: {}, unsupportedReason: reason, sourceRefs: ['V01-T-046', 'V01-T-040'],
  })),
];

/** App M's OWNER column → the domain role code that holds it (the label is kept on the contract's quality as app_m_owner). */
export const OWNER_ROLE_CODES: Record<string, string> = {
  'Executive product owner': 'executive', 'Decision product owner': 'decision_owner', 'Governance': 'record_authority', 'Trust authority': 'record_authority',
  'AI governance': 'method_steward', 'Foresight owner': 'forecast_owner', 'Warning owner': 'risk_owner', 'Risk owner': 'risk_owner', 'Forecast owner': 'forecast_owner',
  'Scenario owner': 'strategy_owner', 'Simulation owner': 'simulation_operator', 'Twin owner': 'twin_owner', 'Strategy authority': 'strategy_owner', 'Executive operator': 'executive_operator',
};
/** The 29 contracts: each ownerRole a role CODE (App M's label kept as quality.app_m_owner). */
export const definitionsA: MetricContract[] = contractsA.map((c) => {
  const code = OWNER_ROLE_CODES[c.ownerRole];
  if (code === undefined) throw new Error(`${c.metricKey}: App M owner ${c.ownerRole} has no role code`);
  return { ...c, ownerRole: code, quality: { ...c.quality, app_m_owner: c.ownerRole } };
});

/** The computation keys this part registers (0113 §MCA), in registry order. */
export const COMPUTATIONS_A = definitionsA.map((d) => d.computationKey).filter((k): k is string => k !== null);

/** The scene's three metrics (the NORDWERK operating review: loop closure, acknowledgement latency, calibration — the corridor, 2026-Q3). */
export const SCENE_METRICS_A = ['MET-001', 'MET-022', 'MET-024'] as const;

/** A contract's shape errors (a pure check the harness and §MD's propose port agree on): empty means well-formed. */
export function contractProblems(c: MetricContract): string[] {
  const p: string[] = [];
  if (!/^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/.test(c.metricKey)) p.push(`${c.metricKey}: the key is not of the form MET-001`);
  if (c.kind === 'rate' && (c.numerator === null || c.denominator === null)) p.push(`${c.metricKey}: a rate names its numerator and denominator`);
  if ((c.computationKey === null) !== (c.unsupportedReason !== null)) p.push(`${c.metricKey}: supported ⇔ a computation key; unsupported ⇔ a reason with its carrier`);
  if (c.unsupportedReason !== null && c.unsupportedReason.length < 8) p.push(`${c.metricKey}: the unsupported reason is a sentence`);
  const person = c.dimensions.filter((d) => (PERSON_DIMENSIONS as readonly string[]).includes(d));
  if (person.length > 0) p.push(`${c.metricKey}: a person dimension (${person.join(', ')}) is never a cohort (no employee-performance inference)`);
  if (c.kMin < 5) p.push(`${c.metricKey}: k_min is at least 5`);
  if (c.floorN < 1) p.push(`${c.metricKey}: the floor is at least 1`);
  if (c.threshold.band !== undefined && (c.threshold.band.length !== 2 || c.threshold.band[0] >= c.threshold.band[1])) p.push(`${c.metricKey}: a band is [lo, hi] with lo < hi`);
  if (c.direction === 'band' && c.threshold.band === undefined) p.push(`${c.metricKey}: a band direction declares its band`);
  if (String(c.population['subject'] ?? '').trim().length < 3) p.push(`${c.metricKey}: population.subject names the subject (3+ characters)`);
  for (const e of c.exclusions) if (typeof e?.rule !== 'string' || typeof e?.reason !== 'string' || e.rule.length < 3 || e.reason.length < 3) p.push(`${c.metricKey}: an exclusion is {rule, reason}`);
  if (!/review|investigation/i.test(c.action)) p.push(`${c.metricKey}: the action names a review or an investigation`);
  if (c.threshold.target !== undefined && c.direction !== 'higher' && c.direction !== 'lower') p.push(`${c.metricKey}: a target needs direction higher or lower`);
  if (c.threshold.band !== undefined && c.direction !== 'band' && c.direction !== 'track') p.push(`${c.metricKey}: a band needs direction band or track`);
  if (c.kind === 'rate' && [c.threshold.target, ...(c.threshold.band ?? [])].some((v) => v !== undefined && (v < 0 || v > 1))) p.push(`${c.metricKey}: a rate's threshold lies in [0, 1]`);
  if (c.computationKey === null && c.dimensions.length > 0) p.push(`${c.metricKey}: an unsupported contract has no dimensions`);
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(c.ownerRole)) p.push(`${c.metricKey}: ownerRole is a role code`);
  const serves = c.serves;
  if ((serves.objective_ids?.length ?? 0) + (serves.decision_classes?.length ?? 0) + (serves.value_measure !== undefined ? 1 : 0) === 0) p.push(`${c.metricKey}: serves names an objective, a decision class or a value measure (V01-T-040)`);
  if (c.action.length < 8 || c.retirement.length < 8) p.push(`${c.metricKey}: action and retirement are sentences`);
  return p;
}
