/**
 * B92 §MCA — the pure logic of computations A's contracts (definitions-a.ts): every contract well-formed (contractProblems), the readings
 * the approver must see stated (population, clock, exclusions with reasons), no person dimension anywhere, App M's non-numeric thresholds
 * never turned into an invented target, the scene's definitions as DESIGN D9 decides them, the unsupported V01-T-046 measures with their
 * carriers. Data only — no database.
 */
import { describe, expect, it } from 'vitest';
import { COMPUTATIONS_A, contractProblems, definitionsA, SCENE_METRICS_A } from '../../src/analytics/computations-a/definitions-a.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { PERSON_DIMENSIONS } from '../../src/analytics/seams.js';

const byKey = (k: string): MetricContract => { const c = definitionsA.find((d) => d.metricKey === k); if (c === undefined) throw new Error(k); return c; };

describe('B92 §MCA contracts — shape', () => {
  it('29 contracts with unique keys: MET-001..005, MET-019..030, four V1 measures, two ES-40-008 indicators, six unsupported V1 measures', () => {
    const keys = definitionsA.map((d) => d.metricKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith('MET-'))).toEqual(['MET-001', 'MET-002', 'MET-003', 'MET-004', 'MET-005', 'MET-019', 'MET-020', 'MET-021', 'MET-022', 'MET-023',
      'MET-024', 'MET-025', 'MET-026', 'MET-027', 'MET-028', 'MET-029', 'MET-030']);
    expect(keys.filter((k) => k.startsWith('ES40-'))).toEqual(['ES40-commitment-visibility', 'ES40-explanation-use']);
    expect(COMPUTATIONS_A).toHaveLength(23);
  });
  it('every contract is well-formed (contractProblems is empty) and names App M / V1 / ES rows it answers', () => {
    for (const c of definitionsA) {
      expect(contractProblems(c), c.metricKey).toEqual([]);
      expect(c.sourceRefs.length, c.metricKey).toBeGreaterThan(0);
      expect(c.population['subject'], c.metricKey).toBeTruthy();
    }
  });
  it('no contract carries a person dimension, every k_min is ≥ 5 and every privacy class is aggregate (D4)', () => {
    for (const c of definitionsA) {
      expect(c.dimensions.filter((d) => (PERSON_DIMENSIONS as readonly string[]).includes(d)), c.metricKey).toEqual([]);
      expect(c.kMin).toBeGreaterThanOrEqual(5);
      expect(c.privacyClass).toBe('aggregate');
    }
  });
  it('the floors of the brief\'s table', () => {
    const floors: Record<string, number> = { 'MET-001': 3, 'MET-002': 3, 'MET-003': 3, 'MET-004': 5, 'MET-005': 3, 'MET-019': 5, 'MET-020': 3, 'MET-021': 5, 'MET-022': 5, 'MET-023': 5,
      'MET-024': 8, 'MET-025': 8, 'MET-026': 2, 'MET-027': 3, 'MET-028': 2, 'MET-029': 3, 'MET-030': 5, 'V1-decision-cycle': 3, 'V1-understanding-latency': 3, 'V1-warning-precision': 5,
      'V1-attention-saved': 5, 'ES40-commitment-visibility': 3, 'ES40-explanation-use': 3 };
    for (const [k, f] of Object.entries(floors)) expect(byKey(k).floorN, k).toBe(f);
  });
});

describe('B92 §MCA contracts — the readings', () => {
  it('the scene\'s three: MET-001 a rate over committed packages (six links); MET-022 a duration from the RECEIPT with the declared raised_at proxy, the qualified roles and severity/role cohorts; MET-024 a band [0.75, 0.85] over live outcomes, backtests excluded', () => {
    expect(SCENE_METRICS_A).toEqual(['MET-001', 'MET-022', 'MET-024']);
    const m1 = byKey('MET-001');
    expect(m1).toMatchObject({ kind: 'rate', computationKey: 'met001_loop_closure', window: { kind: 'calendar_quarter', clock: 'record' } });
    for (const l of ['objective', 'evidence', 'foresight', 'commitment', 'outcome', 'learning']) expect(m1.numerator).toContain(l);
    const m22 = byKey('MET-022');
    expect(m22).toMatchObject({ kind: 'duration', direction: 'lower', dimensions: ['severity', 'role'], params: { start: 'raised_proxy', admit_synthetic: false } });
    expect(m22.params['qualified_roles']).toEqual(['domain_admin', 'strategy_owner', 'forecast_owner', 'risk_owner']);
    expect(m22.exclusions.map((e) => e.rule).join(' | ')).toMatch(/world-clock/);
    expect(String(m22.quality['proxy'])).toMatch(/^DECLARED/);
    const m24 = byKey('MET-024');
    expect(m24).toMatchObject({ kind: 'rate', direction: 'band', threshold: { band: [0.75, 0.85] }, dimensions: ['horizon', 'method'], floorN: 8 });
    expect(m24.exclusions[0]!.rule).toMatch(/backtest/);
  });
  it('App M\'s non-numeric thresholds are never turned into a target: MET-001 ("completeness threshold"), MET-019 (monitored, not optimized alone), MET-020 (distribution tracked), MET-021/022 (severity SLO), MET-025 (baseline-improving)', () => {
    for (const k of ['MET-001', 'MET-019', 'MET-020', 'MET-021', 'MET-022', 'MET-025']) expect(byKey(k).threshold, k).toEqual({});
    expect(byKey('MET-019').direction).toBe('track');
    expect(byKey('MET-019').action).toMatch(/monitored, not optimized alone/);
    for (const k of ['MET-002', 'MET-003', 'MET-004', 'MET-005', 'MET-023', 'MET-026', 'MET-027', 'MET-029', 'MET-030']) expect(byKey(k).threshold, k).toEqual({ target: 1 });
  });
  it('MET-030 is portfolio level only — App M\'s "Owner" scope is never a grouping', () => {
    const c = byKey('MET-030');
    expect(c.dimensions).toEqual(['portfolio']);
    expect(String(c.quality['owner_scope'])).toMatch(/NEVER a grouping/);
  });
  it('every action is a review or a tracked reading — never an automatic or punitive decision', () => {
    // what an action DOES (its "never …" clauses removed) never names an automatic or punitive effect
    for (const c of definitionsA) expect(c.action.replace(/never[^;:.()]*/gi, ''), c.metricKey).not.toMatch(/automatic|punitive|penal|sanction/i);
    for (const c of definitionsA.filter((x) => x.threshold.target !== undefined || x.threshold.band !== undefined)) expect(c.action, c.metricKey).toMatch(/REVIEW|review/);
  });
  it('the six V01-T-046 measures with no source are unsupported, each with its carrier, served as a rate that is never computed', () => {
    const u = definitionsA.filter((d) => d.computationKey === null);
    expect(u.map((d) => [d.metricKey, /carrier: (B\d+|customer-approved)/.exec(d.unsupportedReason ?? '')?.[1]])).toEqual([
      ['V1-prevented-loss', 'customer-approved'], ['V1-captured-opportunity', 'customer-approved'], ['V1-option-value', 'B73'], ['V1-resilience', 'B63'],
      ['V1-residency-compliance', 'B62'], ['V1-lifecycle-coverage', 'B50']]);
  });
});

describe('B92 §MCA contractProblems — refusals of a malformed contract', () => {
  const base = byKey('MET-001');
  it('a person dimension, a rate without parts, a supported/unsupported mismatch, an inverted band, an empty serves, k below 5', () => {
    expect(contractProblems({ ...base, dimensions: ['acknowledged_by'] }).join()).toMatch(/person dimension/);
    expect(contractProblems({ ...base, numerator: null }).join()).toMatch(/numerator and denominator/);
    expect(contractProblems({ ...base, computationKey: null }).join()).toMatch(/supported ⇔ a computation key/);
    expect(contractProblems({ ...base, direction: 'band', threshold: { band: [0.9, 0.8] } }).join()).toMatch(/lo < hi/);
    expect(contractProblems({ ...base, direction: 'band', threshold: {} }).join()).toMatch(/declares its band/);
    expect(contractProblems({ ...base, serves: {} }).join()).toMatch(/serves names/);
    expect(contractProblems({ ...base, kMin: 3 }).join()).toMatch(/k_min/);
    expect(contractProblems({ ...base, metricKey: 'met-1' }).join()).toMatch(/form MET-001/);
  });
  it('§MD\'s rules mirrored: subject 3+, exclusions {rule, reason}, an action naming a review, a target only with higher/lower, a band only with band/track, a rate threshold in [0, 1], no dimension on an unsupported contract, a role code as owner', () => {
    expect(contractProblems({ ...base, population: { subject: 'x' } }).join()).toMatch(/population.subject/);
    expect(contractProblems({ ...base, exclusions: [{ rule: 'r', reason: '' }] }).join()).toMatch(/exclusion is \{rule, reason\}/);
    expect(contractProblems({ ...base, action: 'a breach changes the plan automatically' }).join()).toMatch(/names a review/);
    expect(contractProblems({ ...base, direction: 'band', threshold: { target: 0.5 } }).join()).toMatch(/target needs direction higher or lower/);
    expect(contractProblems({ ...base, direction: 'higher', threshold: { band: [0.1, 0.2] } }).join()).toMatch(/band needs direction band or track/);
    expect(contractProblems({ ...base, threshold: { target: 3 } }).join()).toMatch(/lies in \[0, 1\]/);
    expect(contractProblems({ ...byKey('V1-resilience'), dimensions: ['severity'] }).join()).toMatch(/unsupported contract has no dimensions/);
    expect(contractProblems({ ...base, ownerRole: 'Executive product owner' }).join()).toMatch(/role code/);
  });
  it('every owner is a role code, App M\'s label kept on the contract', () => {
    expect(byKey('MET-001')).toMatchObject({ ownerRole: 'executive', quality: { app_m_owner: 'Executive product owner' } });
    expect(byKey('MET-022')).toMatchObject({ ownerRole: 'risk_owner', quality: { app_m_owner: 'Warning owner' } });
    expect(byKey('MET-028').ownerRole).toBe('twin_owner');
  });
});
