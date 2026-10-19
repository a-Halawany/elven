'use client';
/**
 * CP-6 B82 §SC — the catalogue's section for THE SCENARIO, DECISION, RISK AND OPERATIONS CHARTS (F-P7-E-21; REL-17: every kind with its
 * legend and its alternative): the thirteen components of components/strategic-charts.tsx, each from a SYNTHETIC specimen that says so
 * (DESIGN D13 — the spec's sources are the specimen statement, never a read), each spec passing the §SC grammar; one fan deliberately naming a
 * single destiny to show the refusal, one comparison of runs on two twin versions to show "not drawn side by side". Nothing here calls a
 * server; the CSV labels a fixture. Construction evidence only — not demonstrated operation, not acceptance.
 */
import { Panel } from '../../../../../components/layers';
import {
  AlertQueue, AuditTimeline, EvidenceCoverage, HealthDecomposition, OpportunityPortfolio, OptionMatrix, RiskMatrix, RunComparison, ScenarioComparison, ScenarioFan,
  SensitivityTornado, StatusBoard, TwinStateDiff,
} from '../../../../../components/strategic-charts';
import type { ChartSpec } from '../../../../../lib/b82-seams';
import {
  COMPARED_MEASURES, alertInput, alertSpec, auditSpec, comparisonSpec, coverageInput, coverageSpec, diffInput, diffSpec, fanSpec, healthSpec, opportunitySpec, optionMatrixInput,
  optionSpec, riskSpec, runSpec, statusOrder, statusSpec, tornadoInput, tornadoSpec,
  type AuditIn, type CompareItemIn, type FanBranchIn, type HealthCompIn, type HealthDimIn, type OpportunityIn, type RiskIn, type RunIn, type StatusIn,
} from '../../../../../lib/strategic-charts-b82';

/** The names this section renders (the catalogue's RENDERED set). */
export const SC_RENDERED: readonly string[] = ['ScenarioFan', 'ScenarioComparison', 'SensitivityTornado', 'RiskMatrix', 'OpportunityPortfolio', 'HealthDecomposition', 'RunComparison',
  'TwinStateDiff', 'OptionMatrix', 'EvidenceCoverage', 'StatusBoard', 'AlertQueue', 'AuditTimeline'];

const AS_OF = '2026-10-19T08:00:00Z';
const FIXTURE_EXPORT = { scope: 'the design catalogue (SYNTHETIC fixture — no tenant, no domain)', classificationCeiling: 'none — a SYNTHETIC fixture', asOf: AS_OF };
/** A specimen is said so: the sources are the specimen statement only, the title carries "(SYNTHETIC)". */
const specimen = (s: ChartSpec): ChartSpec => ({ ...s, title: `${s.title} (SYNTHETIC)`, sources: [{ specimen: 'SYNTHETIC catalogue values — no record, no read' }] });

const FAN: FanBranchIn[] = [
  { key: 'b', name: 'Baseline', kind: 'baseline', state: 'open', live: true, low: 1, mid: 2, high: 3, n: 3, divergence: null, assumptions: { total: 1, critical: 0, invalidated: 0 }, signpost: null },
  { key: 'd', name: 'Downside', kind: 'downside', state: 'flipped', live: true, low: 5, mid: 8, high: 12, n: 4, divergence: 'transits fall by half', assumptions: { total: 2, critical: 1, invalidated: 0 }, signpost: 'chokepoint transits below 20 a day' },
  { key: 'x', name: 'Regional blockade', kind: 'adversarial', state: 'open', live: true, low: 14, mid: 18, high: 26, n: 2, divergence: 'naval activity halts transits', assumptions: { total: 1, critical: 1, invalidated: 0 }, signpost: 'two carriers suspend calls' },
  { key: 's', name: 'Insurer withdrawal', kind: 'stress', state: 'suspended', live: false, low: null, mid: null, high: null, n: 0, divergence: 'war-risk cover withdrawn', assumptions: { total: 1, critical: 1, invalidated: 1 }, signpost: 'premium notices' },
];
const CMP: CompareItemIn[] = [
  { key: 'b', name: 'Baseline', scenario: 'Corridor (SYNTHETIC)', kind: 'baseline', state: 'open', live: true, notCounted: null, probability: { low: 0.55, high: 0.65, method: 'elicited' }, consequenceClass: 'C1', indicator: 'fresh', assumptions: 1 },
  { key: 'd', name: 'Downside', scenario: 'Corridor (SYNTHETIC)', kind: 'downside', state: 'open', live: true, notCounted: null, probability: { low: 0.3, high: 0.4, method: 'elicited' }, consequenceClass: 'C3', indicator: 'stale (9 days)', assumptions: 2 },
  { key: 's', name: 'Insurer withdrawal', scenario: 'Corridor (SYNTHETIC)', kind: 'stress', state: 'suspended', live: false, notCounted: 'suspended', probability: null, consequenceClass: 'C4', indicator: null, assumptions: 1 },
];
const FACTORS = tornadoInput([
  { key: 'buffer_days', kind: 'parameter', rank: 1, base_value: 12, low: { value: 9.6 }, high: { value: 14.4 }, delta_low: 180, delta_high: -120, swing: 300 },
  { key: 'reroute_lead_time', kind: 'parameter', rank: 2, base_value: 21, low: { value: 16.8 }, high: { value: 25.2 }, delta_low: -60, delta_high: 90, swing: 150, nonlinear: true },
  { key: 'air_freight_start', kind: 'timing', rank: 3, base_value: '2026-10-25', low: { value: '2026-10-18' }, high: { value: '2026-11-01' }, delta_low: -20, delta_high: 35, swing: 55 },
]);
const RISKS: RiskIn[] = [
  { key: 'r1', title: 'Corridor closure', category: 'supply_chain', state: 'accepted', probabilityHigh: 0.35, plausibility: null, residualLow: 400, residualHigh: 900, unit: 'EUR k', threshold: 600, breach: true, owner: 'specimen-owner-1', gaps: 0 },
  { key: 'r2', title: 'Port strike', category: 'supply_chain', state: 'contested', probabilityHigh: null, plausibility: 'medium', residualLow: 50, residualHigh: 150, unit: 'EUR k', threshold: 600, breach: false, owner: 'specimen-owner-2', gaps: 0 },
  { key: 'r3', title: 'Supplier insolvency', category: 'sourcing', state: 'accepted', probabilityHigh: 0.1, plausibility: null, residualLow: 100, residualHigh: 300, unit: 'EUR k', threshold: null, breach: null, owner: 'specimen-owner-3', gaps: 0 },
];
const OPPS: OpportunityIn[] = [
  { key: 'o1', title: 'Alternative supplier', valueLow: 200, valueHigh: 500, unit: 'EUR k', horizonDays: 90, horizon: '90d', confidence: '0.6', effort: '2 option(s), declared cost 75', objectives: 1, owner: 'specimen-owner-1', sponsor: 'specimen-sponsor', evidence: 2, state: 'sponsored' },
  { key: 'o2', title: 'Rail corridor', valueLow: 100, valueHigh: 900, unit: 'EUR k', horizonDays: 365, horizon: '1y', confidence: 'low', effort: '1 option(s), no cost declared', objectives: 2, owner: 'specimen-owner-2', sponsor: null, evidence: 0, state: 'assessed' },
  { key: 'o3', title: 'Nearshoring study', valueLow: 50, valueHigh: 120, unit: 'EUR k', horizonDays: null, horizon: null, confidence: null, effort: null, objectives: 0, owner: 'specimen-owner-3', sponsor: null, evidence: 1, state: 'identified' },
];
const DIM: HealthDimIn = { key: 'exec', label: 'Execution', value: 62, status: 'computed', coverage: 0.8, weight: 2, bands: [{ key: 'red', min: 0 }, { key: 'amber', min: 40 }, { key: 'green', min: 70 }], band: 'amber' };
const COMPS: HealthCompIn[] = [
  { key: 'a', label: 'On-time delivery', weight: 1, score: 80, contribution: 32, confidence: 0.9, evidence: 2, freshness: 'fresh', state: 'ok', excluded: null, critical: true },
  { key: 'b', label: 'Capability coverage', weight: 1, score: 70, contribution: 28, confidence: 0.7, evidence: 1, freshness: '9 d stale', state: 'stale', excluded: null, critical: false },
  { key: 'c', label: 'Budget burn', weight: 0.5, score: null, contribution: null, confidence: null, evidence: 0, freshness: 'missing', state: 'missing', excluded: 'no input in the window', critical: false },
];
const run = (key: string, kind: string, v: [number, number, number], o: Partial<RunIn> = {}): RunIn => ({ key, label: key, kind, twin: 'twin specimen v14', control: kind === 'control' ? null : 'control-run', model: 'supply-flow@1',
  validity: 'valid', seed: '11', use: 'decision-grade', measures: { lsd: v[0], dbs: v[1], cost: v[2] }, ...o });
const RUNS = [run('control-run', 'control', [6, 9, 1200]), run('reroute-run', 'intervention', [2, 4, 1500]), run('air-run', 'intervention', [0, 1, 2100], { validity: 'invalidated', use: 'refused' })];
const DIFF = diffInput([
  { key: 'stock.on_hand', change: 'changed', source: { kind: 'scenario', value: 40, unit: 'units' }, target: { kind: 'observed', value: 100, unit: 'units' } },
  { key: 'transit.days', change: 'changed', source: { kind: 'observed', value: 31, unit: 'days' }, target: { kind: 'observed', value: 24, unit: 'days' } },
  { key: 'demand.weekly', change: 'added', source: { kind: 'synthetic', value: 1200, unit: 'units' }, target: null },
  { key: 'route', change: 'changed', source: { kind: 'observed', value: 'cape', unit: null }, target: { kind: 'observed', value: 'suez', unit: null } },
]);
const MATRIX = optionMatrixInput({
  options: [{ key: 'reroute', title: 'Reroute via the Cape', values: { cost: 1500, days: 2, co2: 340 }, bases: { cost: 'run specimen' } }, { key: 'wait', title: 'Status quo', values: { cost: 1200, days: 6 }, bases: {} },
    { key: 'air', title: 'Air freight', values: { cost: 2100, days: 0, co2: 900 }, bases: {} }],
  criteria: [{ key: 'cost', title: 'Cost', weight: 0.5, direction: 'min', unit: 'EUR k' }, { key: 'days', title: 'Line-stop days', weight: 0.3, direction: 'min', unit: 'days' }, { key: 'co2', title: 'Emissions', weight: 0.2, direction: 'min', unit: 't CO2e' }],
});
const STATUS: StatusIn[] = statusOrder([
  { key: 'a', capability: 'collection · PortWatch', state: 'healthy', slo: 'degraded mode at most 2 h (contract v2)', freshness: 'signal since 2026-10-19T07:55Z', dependencies: 'http connector', degraded: 'normal', owner: 'specimen steward' },
  { key: 'b', capability: 'collection · AIS positions', state: 'degraded', slo: 'degraded mode at most 24 h (contract v1)', freshness: 'signal since 2026-10-17T00:00Z', dependencies: 'withdrawn when degraded: issue a forecast', degraded: 'active — in force', owner: 'specimen steward' },
  { key: 'c', capability: 'audit · journal', state: 'unknown', slo: null, freshness: null, dependencies: null, degraded: 'no contract declared', owner: null },
]);
const ALERTS = alertInput([
  { item_id: 'i1', title: 'Corridor warning', signal_class: 'prediction.warning', state: 'open', owner_principal_id: 'specimen-owner', created_at: '2026-10-19T02:00:00Z', due_at: '2026-10-19T14:00:00Z', overdue: false, suppressed_until: null, acknowledged_at: null, evaluation: { dimensions: { consequence: 'C3' } } },
  { item_id: 'i2', title: 'Outcome review owed', signal_class: 'decision.outcome', state: 'acknowledged', owner_principal_id: null, created_at: '2026-10-17T08:00:00Z', due_at: '2026-10-18T08:00:00Z', overdue: true, suppressed_until: null, acknowledged_at: '2026-10-17T09:00:00Z', evaluation: { dimensions: { consequence: 'C2' } } },
  { item_id: 'i3', title: 'Source degraded', signal_class: 'observation.health', state: 'suppressed', owner_principal_id: 'specimen-owner', created_at: '2026-10-18T20:00:00Z', due_at: null, overdue: false, suppressed_until: '2026-10-20T00:00:00Z', acknowledged_at: null, evaluation: null },
], (i) => `the specimen reason for ${i.item_id}`, AS_OF);
const AUDIT: AuditIn[] = [
  { key: 'e1', seq: '101', at: '2026-10-19T07:10:00Z', actor: 'principal:specimen-a', action: 'decision.read', type: 'policy.decision', outcome: 'success', result: 'ok', partition: 'specimen', hash: 'a1b2c3d4e5f60718' },
  { key: 'e2', seq: '102', at: '2026-10-19T07:25:00Z', actor: 'principal:specimen-b', action: 'observation.read', type: 'policy.decision', outcome: 'denied', result: 'denied', partition: 'specimen', hash: 'b2c3d4e5f6071829' },
  { key: 'e3', seq: '103', at: '2026-10-19T07:40:00Z', actor: 'principal:specimen-a', action: 'decision.commit', type: 'policy.decision', outcome: 'failure', result: 'stale', partition: 'specimen', hash: 'c3d4e5f60718293a' },
];

export function ScCatalogue() {
  const fan = specimen(fanSpec({ scenario: 'Corridor over the next quarter', measure: 'line-stop days', unit: 'days', asOf: AS_OF, branches: FAN, read: 'specimen' }));
  return (
    <>
      <Panel title="Scenario fan and scenario comparison (CMP-062, VIZ-05, VIZ-06)">
        <ScenarioFan spec={fan} branches={FAN} exportAs={FIXTURE_EXPORT} />
        <ScenarioFan spec={{ ...fan, title: 'The most likely path of the corridor — refused (a single destiny named) (SYNTHETIC)' }} branches={FAN} />
        <ScenarioComparison spec={specimen(comparisonSpec({ set: 'Corridor set', asOf: AS_OF, items: CMP, purpose: 'the routing decision' }))} items={CMP} />
      </Panel>
      <Panel title="Sensitivity tornado (VIZ-07)">
        <SensitivityTornado spec={specimen(tornadoSpec({ metric: 'total_cost', relative: 0.2, base: 1200, model: 'supply-flow@1', runId: 'specimen-run', analysisId: 'specimen-analysis', analysedAt: AS_OF, robustness: 'ROBUST — the ranking holds under every seed', timingShiftDays: 7, items: FACTORS }))} items={FACTORS} />
      </Panel>
      <Panel title="Risk matrix and opportunity portfolio (VIZ-10, VIZ-11)">
        <RiskMatrix spec={specimen(riskSpec({ items: RISKS, unit: 'EUR k', asOf: AS_OF, rule: null }))} items={RISKS} unit="EUR k" />
        <OpportunityPortfolio spec={specimen(opportunitySpec({ items: OPPS, unit: 'EUR k', asOf: AS_OF, unread: 0 }))} items={OPPS} unit="EUR k" />
      </Panel>
      <Panel title="Strategic health decomposition (VIZ-12)">
        <HealthDecomposition spec={specimen(healthSpec({ dimension: DIM, comps: COMPS, formula: 'weighted-mean@1', rule: 'the covered components\' weighted mean', at: AS_OF, asOf: AS_OF, snapshotId: 'specimen-snapshot' }))} dimension={DIM} components={COMPS} />
        <HealthDecomposition spec={specimen(healthSpec({ dimension: { ...DIM, label: 'Resilience', status: 'indeterminate', value: null }, comps: COMPS, formula: 'weighted-mean@1', rule: 'below the coverage floor', at: AS_OF, asOf: AS_OF, snapshotId: 'specimen-snapshot' }))}
          dimension={{ ...DIM, label: 'Resilience', status: 'indeterminate', value: null }} components={COMPS} />
      </Panel>
      <Panel title="Run comparison and twin state diff (VIZ-27, VIZ-28)">
        <RunComparison spec={specimen(runSpec({ title: 'Runs on one basis', runs: RUNS, measures: COMPARED_MEASURES, asOf: AS_OF, read: 'specimen', readLabel: 'specimen' }))} runs={RUNS} measures={COMPARED_MEASURES} />
        <RunComparison spec={specimen(runSpec({ title: 'Runs on two twin versions — not drawn side by side', runs: [RUNS[0]!, { ...RUNS[1]!, twin: 'twin specimen v13' }], measures: COMPARED_MEASURES, asOf: AS_OF, read: 'specimen', readLabel: 'specimen' }))}
          runs={[RUNS[0]!, { ...RUNS[1]!, twin: 'twin specimen v13' }]} measures={COMPARED_MEASURES} />
        <TwinStateDiff spec={specimen(diffSpec({ twin: 'Regensburg line', branch: 'what-if', version: 'v3', asOf: AS_OF, verification: 'verified', items: DIFF }))} items={DIFF} />
      </Panel>
      <Panel title="Decision option matrix and evidence coverage (VIZ-29, VIZ-30)">
        <OptionMatrix spec={specimen(optionSpec({ pkg: 'Regensburg routing', version: 1, m: MATRIX, dissent: [{ by: 'specimen-dissenter', position: 'against the reroute', rationale: 'the Cape adds 12 days of exposure' }], asOf: AS_OF, criteriaVersion: 2 }))} matrix={MATRIX} />
        <EvidenceCoverage spec={specimen(coverageSpec({ pkg: 'Regensburg routing', asOf: AS_OF, standard: 'two independent sources', meets: false, disputed: 2 }))}
          parts={coverageInput({ evidence_coverage: { options: 3, simulated: 2, with_evidence: 2, citations: 12, standing: 10, runs: 3, decision_grade_runs: 1 } })} />
      </Panel>
      <Panel title="Status board, alert queue and audit timeline (VIZ-33, VIZ-34, VIZ-35)">
        <StatusBoard spec={specimen(statusSpec({ title: 'Capabilities and their state', items: STATUS, asOf: AS_OF, read: 'specimen', readLabel: 'specimen', sloWords: 'a declared degraded-mode contract\'s maximum duration' }))} items={STATUS} />
        <AlertQueue spec={specimen(alertSpec({ items: ALERTS, asOf: AS_OF, policy: 'policy version 2 (specimen)' }))} items={ALERTS} />
        <AuditTimeline spec={specimen(auditSpec({ events: AUDIT, asOf: AS_OF, obligations: ['mask_secret_metadata'] }))} events={AUDIT} />
      </Panel>
    </>
  );
}
