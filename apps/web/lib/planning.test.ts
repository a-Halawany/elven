import { describe, expect, it } from 'vitest';
import { BREACH_LABEL, MILESTONE_LABEL, NEXT_ACT, SENSITIVITY_LABEL, STATE_LABEL, budgetLine, dayOf, money, varianceLine } from './planning';

/** CP-6 B36 §P (0094): the planning workspace is worded, never judged on the client (the states, the breaches and the sensitivity are the server's). */
describe('the planning workspace is worded, never scored on the client', () => {
  it('the vocabularies are the migration\'s (the seven initiative states, the five breach kinds, the milestone and sensitivity statuses), each with a glyph and words', () => {
    expect(Object.keys(STATE_LABEL)).toEqual(['proposed', 'aligned', 'prioritised', 'funded', 'approved', 'paused', 'closed']);
    expect(Object.keys(BREACH_LABEL)).toEqual(['lost_linkage', 'infeasible', 'budget_over_authority', 'conflicting_dependencies', 'drift_without_review']);
    expect(Object.keys(MILESTONE_LABEL)).toEqual(['planned', 'at_risk', 'met', 'missed', 'cancelled']);
    expect(Object.keys(SENSITIVITY_LABEL)).toEqual(['at_risk', 'on_track', 'unmapped', 'no_value']);
    expect(BREACH_LABEL.budget_over_authority).toMatch(/never silently accepted/);
  });
  it('the next act follows the state and names who holds it: the lead aligns and prioritises, the executive funds and approves (never the proposer), a baseline follows approval', () => {
    expect(NEXT_ACT.proposed).toEqual({ act: 'align', by: 'the strategy lead' });
    expect(NEXT_ACT.aligned.act).toBe('prioritise');
    expect(NEXT_ACT.prioritised.act).toBe('fund');
    expect(NEXT_ACT.prioritised.by).toMatch(/within the plan's authority/);
    expect(NEXT_ACT.funded.by).toMatch(/never the proposer/);
    expect(NEXT_ACT.approved.act).toBeNull();
    expect(NEXT_ACT.closed.act).toBeNull();
  });
  it('the budget line keeps the server\'s decimal strings and its currency, names OVER AUTHORITY only when the funded sum exceeds the ceiling — never a percentage', () => {
    expect(budgetLine({ budget_currency: 'EUR', budget_total: '1200000.00', budget_authority: '900000.00', funded: '650000.00' })).toBe('650000.00 EUR funded · 1200000.00 EUR planned · authority 900000.00 EUR');
    const over = budgetLine({ budget_currency: 'EUR', budget_total: '1200000.00', budget_authority: '500000.00', funded: '650000.00' });
    expect(over).toMatch(/OVER AUTHORITY$/);
    expect(over).not.toMatch(/%/);
  });
  it('a variance in words names the observed, the target, the direction, the signed variance and its basis', () => {
    expect(varianceLine({ milestone: 'Q2 second source live', observed_value: '82', target_value: '95', variance: '-13', basis_kind: 'run', direction: 'higher_better', unit: 'percent' }))
      .toBe('Q2 second source live: 82 percent vs target 95 (higher better) — variance -13, from a scenario run');
    expect(varianceLine({ milestone: 'm', observed_value: '12', target_value: '10', variance: '-2', basis_kind: 'observation', direction: 'lower_better' })).toMatch(/from the latest observation$/);
  });
  it('a DATE renders as the day it names; money keeps its decimals', () => {
    expect(dayOf('2027-06-30')).toBe('2027-06-30');
    expect(dayOf('2027-06-30T00:00:00.000Z')).toBe('2027-06-30');
    expect(dayOf(null)).toBe('—');
    expect(money('1250000.50', 'EUR')).toBe('1250000.50 EUR');
    expect(money(null, 'EUR')).toBe('—');
  });
});
