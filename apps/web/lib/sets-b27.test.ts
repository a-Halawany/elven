import { describe, expect, it } from 'vitest';
import { branchStateLine, freshnessLine, payoffCell, pluralityLine, policyLine, proposalSourceLine, proposalStateLine, reviewVerdictLine, setStateMark, type IndicatorView } from './sets-b27';

/** CP-6 B27 §S (0097): the scenario sets page WORDS the server's record — it never counts a branch, judges plurality or computes a regret. */
describe('the scenario sets page is worded, never judged on the client', () => {
  it('a set state is a glyph, a token and words — never colour alone', () => {
    expect(setStateMark('draft')).toMatchObject({ glyph: '◌', text: expect.stringMatching(/owner activates/) });
    expect(setStateMark('active')).toMatchObject({ glyph: '●', token: '--eye-color-success', text: expect.stringMatching(/gate a recommendation/) });
    expect(setStateMark('retired').text).toMatch(/gates nothing/);
    expect(setStateMark('odd').text).toBe('ODD');
  });
  it('the plurality verdict names the missing kinds the server listed, in its order, and the other failing rules', () => {
    expect(pluralityLine({ passed: true, missing_kinds: [], live_branches: 4, adverse_branches: 2, findings: [] })).toBe('PLURAL — 4 live branch(es), 2 adverse');
    const line = pluralityLine({ passed: false, missing_kinds: ['stress'], live_branches: 3, adverse_branches: 1,
      findings: [{ rule: 'required_kind', outcome: 'fail', kind: 'stress', detail: 'no live stress branch' }, { rule: 'min_adverse', outcome: 'fail', detail: '1 live adverse branch(es); the policy requires at least 2' },
                 { rule: 'not_counted', outcome: 'note', detail: '1 branch(es) … not counted' }] });
    expect(line).toBe('NOT PLURAL — missing stress; 1 live adverse branch(es); the policy requires at least 2 (3 live branch(es) counted)');
    expect(line).not.toMatch(/not counted/);
  });
  it('the policy and a branch\'s state are the server\'s words; a suspended branch says it is not counted and why', () => {
    expect(policyLine({ require: ['baseline', 'stress'], min_branches: 2, min_adverse: 1 })).toBe('requires baseline, stress · at least 2 live branch(es) · at least 1 adverse');
    expect(policyLine({ require: [], min_branches: 3, min_adverse: 0 })).toMatch(/^no kind required/);
    expect(branchStateLine({ state: 'open', live: true, not_counted_reason: null })).toBe('OPEN — counted');
    expect(branchStateLine({ state: 'suspended', live: false, not_counted_reason: 'suspended — the corridor assumption was invalidated' })).toBe('SUSPENDED — not counted: suspended — the corridor assumption was invalidated');
  });
  it('freshness keeps the server\'s verdict and age; a missing indicator says so', () => {
    const i: IndicatorView = { indicator_id: 'x', series_key: 'freight:rate', comparator: '>', threshold: 5000, consecutive_days: 3, last_value: 4200, last_observation_at: '2024-01-17', last_evaluated_at: null,
      streak: 1, breached: false, breached_at: null, state: 'active', next_review_at: null, age_days: 990, freshness: 'stale' };
    expect(freshnessLine(i, 14)).toBe('STALE (older than 14 days) — last observation 2024-01-17 (990 day(s) ago) · streak 1/3');
    expect(freshnessLine({ ...i, freshness: 'missing', last_observation_at: null, age_days: null }, 14)).toBe('MISSING — freight:rate has no observation');
    expect(freshnessLine({ ...i, freshness: 'fresh', age_days: 2, breached: true }, 14)).toMatch(/^fresh — .* · BREACHED$/);
    expect(freshnessLine(null, 14)).toBe('no indicator (a baseline)');
  });
  it('the review\'s verdict and cells are the server\'s robustness and regret — the best payoff in a branch is marked, never recomputed into a score', () => {
    expect(payoffCell(120, 120)).toBe('120 ★');
    expect(payoffCell(80, 120)).toBe('80');
    expect(payoffCell(undefined, 120)).toBe('—');
    expect(reviewVerdictLine({ most_robust: ['dual-source'], least_regret: ['dual-source', 'status-quo'], robustness: { 'dual-source': -40 }, regret: { 'dual-source': 30, 'status-quo': 30 }, payoff_unit: 'EUR k' }))
      .toBe('most robust: dual-source (worst -40 EUR k) · least regret: dual-source (max regret 30 EUR k), status-quo (max regret 30 EUR k)');
  });
  it('a proposal\'s source and state are worded from the facts the server validated; accepting declares nothing', () => {
    expect(proposalSourceLine({ kind: 'forecast_shift', source_facts: { forecast_id: '0190f3e2-aaaa-7000-8000-000000000001', prior_q50: 52, q50: 31, shift: 0.4038, band_pct: 0.1 } }))
      .toBe('forecast 0190f3e2… median 52 → 31 (shift 0.4038, band 0.1)');
    expect(proposalSourceLine({ kind: 'weak_signal', source_facts: { title: 'Insurers quote war-risk cover', disposition_at: '2026-09-30T10:00:00Z' } })).toMatch(/^weak signal "Insurers quote war-risk cover" — escalated/);
    expect(proposalStateLine({ state: 'open', resolution_note: null })).toMatch(/not the proposer.*accepting declares nothing/);
    expect(proposalStateLine({ state: 'dismissed', resolution_note: 'covered by the corridor set' })).toBe('DISMISSED — covered by the corridor set');
  });
});
