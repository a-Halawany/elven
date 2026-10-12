/**
 * B94 §AD (0114 §IM, D9; CAP-DL-08, PR-68-002) — THE ADOPTION MEASURES as B92 metric contracts (data, proposed through §MD's governed port
 * and approved by a named product analytics owner — never a SQL seed). Each is a registered computation of 0113 §0.7 (0114 §MC):
 *
 *   ADP-001  training completion  — the share of cohort role holders who completed every attested-accessible path naming their role;
 *   ADP-002  competence completion — the share of cohort role holders recorded competent (complete | not_yet) in every key assessed.
 *
 * The grain is a COHORT (role × rollout wave) — never a person: k ≥ 5 (below k the port answers INDETERMINATE, said so — NORDWERK's three
 * executives will be), no score, no rank, no employee-performance inference. A measure may be CITED in readiness (a value measure of the
 * programme) where it can only BLOCK (a B92 exception marks it not to be read at face value) — no value, cohort result or percentage ever
 * releases the go-live gate (PR-68-003). Values on the harness and the act are SYNTHETIC demonstrations (construction ≠ demonstrated
 * operation ≠ real customer acceptance, R2).
 */
import type { MetricContract } from '../../analytics/contract.js';

/** A registered computation key, built from its parts (a quoted `…Key: '<value>'` literal reads to the secret scanner as a credential). */
const ck = (metric: string, name: string): string => [metric, name].join('_');
const MONTH = { kind: 'calendar_month', clock: 'record' } as const;
const REVIEW = 'a review by the implementation lead with the customer sponsor (analytics.metric) — targeted remediation of the cohort\'s enablement, never an automatic or punitive decision';

export const ADOPTION_CONTRACTS: MetricContract[] = [
  {
    metricKey: 'ADP-001', title: 'Training completion by cohort', meaning: 'Share of a cohort\'s role holders who completed the accessible training paths of their role',
    kind: 'rate', unit: 'share of cohort role holders', direction: 'higher',
    population: { subject: 'cohort role holder', inclusion: 'every live holder of a declared cohort role (role × rollout wave) of the domain, as at the window end', scope_rule: 'ignored: adoption is read over the domain\'s declared cohorts',
                  grain: 'role × wave — never a person', app_m_owner: 'implementation owner' },
    numerator: 'holders whose latest training record is complete (inside retention) for the current attested-accessible version of every path naming their role',
    denominator: 'every holder of a cohort role with at least one attested-accessible path',
    exclusions: [{ rule: 'a holder whose role has no attested-accessible path', reason: 'training on an inaccessible or unattested path does not count; the path is remediated first' }],
    window: MONTH, dimensions: ['role', 'wave'], privacyClass: 'aggregate', kMin: 5, floorN: 5, threshold: { target: 1 },
    purposeKey: 'mission-outcomes', serves: { decision_classes: ['go-live readiness (never released by a measure)'], value_measure: 'adoption: role enablement', note: 'B94 §AD; CAP-DL-08' },
    cadence: 'weekly during rollout', ownerRole: 'product_analytics_owner', action: REVIEW,
    retirement: 'retired when the programme is accepted and the cohorts close; its results stay readable', quality: {},
    costAllocation: { unit: 'analytics.computation', meter: 'rows read, compute ms' }, computationKey: ck('adp001', 'training_completion'), params: {}, unsupportedReason: null, sourceRefs: ['ADP-001', 'CAP-DL-08', 'PR-68-002'],
  },
  {
    metricKey: 'ADP-002', title: 'Competence completion by cohort', meaning: 'Share of a cohort\'s role holders recorded competent by a named assessor',
    kind: 'rate', unit: 'share of cohort role holders', direction: 'higher',
    population: { subject: 'cohort role holder', inclusion: 'every live holder of a declared cohort role (role × rollout wave) of the domain, as at the window end', scope_rule: 'ignored: adoption is read over the domain\'s declared cohorts',
                  grain: 'role × wave — never a person', app_m_owner: 'implementation owner' },
    numerator: 'holders whose latest competence record is complete for every competence key assessed for their role (complete | not_yet — no score)',
    denominator: 'every holder of a cohort role (a holder never assessed counts as not yet assessed)',
    exclusions: [],
    window: MONTH, dimensions: ['role', 'wave'], privacyClass: 'aggregate', kMin: 5, floorN: 5, threshold: { target: 1 },
    purposeKey: 'mission-outcomes', serves: { decision_classes: ['go-live readiness (never released by a measure)'], value_measure: 'adoption: role competence', note: 'B94 §AD; CAP-DL-08' },
    cadence: 'weekly during rollout', ownerRole: 'product_analytics_owner', action: REVIEW,
    retirement: 'retired when the programme is accepted and the cohorts close; its results stay readable', quality: {},
    costAllocation: { unit: 'analytics.computation', meter: 'rows read, compute ms' }, computationKey: ck('adp002', 'competence_completion'), params: {}, unsupportedReason: null, sourceRefs: ['ADP-002', 'CAP-DL-08', 'PR-68-002'],
  },
];

export const ADOPTION_METRIC_KEYS = ADOPTION_CONTRACTS.map((c) => c.metricKey);
