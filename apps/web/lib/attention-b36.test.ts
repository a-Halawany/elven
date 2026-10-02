import { describe, expect, it } from 'vitest';
import { actStateLine, canResume, consequenceLines, contextLine, degradedMark, filteredLine, forumPayload, holdLine, outcomeWords, policyLine, type Consequence, type QueueContext } from './attention-b36';

/** CP-6 B36 (0094 §A, part attention): the client words what the server recorded — the context, the policy, the filtered counts, the hold, the consequence, an act's state, a route's outcome — and never judges. */
describe('B36 attention · the context strip', () => {
  const ctx = (over: Partial<QueueContext['context']> = {}): QueueContext['context'] => ({ context_id: null, objective_id: null, horizon: '90d', scenario_id: null, classification: null, effective_at: null, digest: null, set_at: null, source: 'default', ...over });
  it('the default context says so; a set context names its objective, horizon, scenario, classification and effective instant', () => {
    expect(contextLine(ctx())).toBe('the whole domain · horizon 90d · no scenario · your own classification ceiling · effective now · the default (no context set)');
    expect(contextLine(ctx({ objective_id: '0190b1c2-d3e4-7000-8000-000000000001', horizon: '30d', scenario_id: '0190b1c2-d3e4-7000-8000-000000000002', classification: 'confidential', effective_at: '2026-09-30T08:00:00.000Z', source: 'executive.contexts' })))
      .toBe('objective 0190b1c2… · horizon 30d · scenario 0190b1c2… · classification confidential · as of 2026-09-30T08:00:00.000Z · your executive context');
    expect(contextLine(null)).toBe('context not read');
  });
  it('the policy line names the version, the digest and the governance in force', () => {
    expect(policyLine({ policy_id: 'p', version: 3, digest: 'abcdef0123456789abcdef', governance: { fairness_floor: 0.7, staleness_ceiling_hours: 168 } })).toBe('policy version 3 (abcdef012345…) — fairness floor 0.7, staleness ceiling 168 h');
    expect(policyLine({ policy_id: 'p', version: 1, digest: 'abcdef0123456789abcdef', governance: null })).toMatch(/no governance fields \(the evaluation reports, gating nothing\)/);
    expect(policyLine({ policy_id: null, version: null, digest: null, governance: null })).toBe('no active attention policy');
  });
  it('what the context filtered is counted, by reason, and unknown linkage is said', () => {
    expect(filteredLine({ total: 4, served: 2, filtered: 2, by: { objective: 1, horizon: 1, effective_at: 0 }, linkage_unknown: 1 })).toBe('2 item(s) served; 2 filtered by the context (1 outside the objective, 1 beyond the horizon); 1 with unknown objective linkage, served');
    expect(filteredLine({ total: 3, served: 3, filtered: 0, by: { objective: 0, horizon: 0, effective_at: 0 }, linkage_unknown: 0 })).toBe('3 item(s) served; none filtered by the context');
    expect(filteredLine({ total: 4, served: 0, filtered: 4, by: { objective: 0, horizon: 0, effective_at: 4 }, linkage_unknown: 2 })).toMatch(/4 filtered by the context \(4 after the effective instant\); 2 with unknown objective linkage, served/);
  });
  it('the hold banner: the cause against the threshold; none without a hold', () => {
    expect(holdLine({ hold_id: 'h', cause: 'fairness_below_floor', measure: 0.22, threshold: 0.7, held_at: '2026-09-30T09:00:00.000Z', held_by: 'x', governance_item_id: 'g', read_only: true }))
      .toBe('The queue is HELD since 2026-09-30T09:00:00.000Z: the ranking fairness 0.22 fell below the floor 0.7. Its items are served read-only until the executive releases the hold.');
    expect(holdLine({ hold_id: 'h', cause: 'staleness_above_ceiling', measure: 100, threshold: 24, held_at: 't', held_by: 'x', governance_item_id: null, read_only: true })).toMatch(/staleness 100 h rose above the ceiling 24 h/);
    expect(holdLine(null)).toBeNull();
  });
});

describe('B36 attention · the acceptance, the act and the routes', () => {
  const c: Consequence = { accountable: 'a', state: 'open', rank: 'consequence C2', response_window: { due_at: '2026-10-01T09:00:00.000Z', hours_remaining: 23.5, ack_within_minutes: 60 },
    escalation: { roles: ['executive'], max_escalations: 1, so_far: 0 }, commits_to: 'the accountable person answers for item x within its response window', policy_version: 2, evaluation_digest: 'd', context_digest: null };
  it('the consequence preview: what accepting commits the person to, the window, the escalation, the rank', () => {
    expect(consequenceLines(c)).toEqual(['the accountable person answers for item x within its response window', 'Response window: due 2026-10-01T09:00:00.000Z (23.5 h remaining).', 'Escalation: escalates to executive (up to 1; 0 so far).', 'Rank: consequence C2.']);
    expect(consequenceLines({ ...c, response_window: { due_at: null, hours_remaining: null, ack_within_minutes: null }, escalation: { roles: [], max_escalations: 0, so_far: 0 }, rank: null })).toEqual([c.commits_to, 'Response window: no deadline is set.', 'Escalation: no escalation roles.', 'No rank explanation recorded.']);
    expect(consequenceLines(null)).toEqual([]);
  });
  it('an act\'s state: settle_failed names the resume and says the action is not performed again; a resumed act says so', () => {
    expect(actStateLine({ state: 'settle_failed', settle_failure: { reason: 'SYNTHETIC settle fault' } })).toBe('settle FAILED after the governed action committed (SYNTHETIC settle fault) — resume it; the action is not performed again');
    expect(actStateLine({ state: 'acted', effect_ref: 'WRN:x:acknowledged', resumed_at: 't' })).toBe('acted → WRN:x:acknowledged (resumed)');
    expect(actStateLine({ state: 'acted', effect_ref: 'WRN:x:acknowledged' })).toBe('acted → WRN:x:acknowledged');
    expect(actStateLine({ state: 'refused', refusal: 'answered 404' })).toBe('refused: answered 404');
    expect(['settle_failed', 'launched'].every(canResume)).toBe(true);
    expect(['acted', 'refused'].some(canResume)).toBe(false);
  });
  it('a degraded state\'s mark and a route\'s outcome are worded', () => {
    expect(degradedMark({ state: 'hold', active: true })).toMatchObject({ text: 'DEGRADED', token: '--eye-color-critical' });
    expect(degradedMark({ state: 'hold', active: false })).toMatchObject({ text: 'nominal' });
    expect(outcomeWords('recovered')).toMatch(/nominal after the route/);
    expect(outcomeWords('requeued')).toMatch(/the next tick drains/);
    expect(outcomeWords('exhausted')).toMatch(/five attempts/);
    expect(outcomeWords('still_degraded')).toMatch(/still degraded/);
    expect(outcomeWords('unchanged')).toMatch(/nothing to recover/);
    expect(outcomeWords('other')).toBe('other');
  });
  it('the forum payload: members split and deduplicated, the optional ids left out when empty, the classification internal by default', () => {
    const p = forumPayload({ title: ' Supply forum ', members: 'aaaa\nbbbb, aaaa; cccc', period: 'monthly', objectiveId: ' obj ', horizon: '90d', scenarioId: '', classification: '' });
    expect(p).toEqual({ title: 'Supply forum', members: ['aaaa', 'bbbb', 'cccc'], period: 'monthly', context: { horizon: '90d', classification: 'internal', objective_id: 'obj' } });
    expect(forumPayload({ title: 'F', members: 'x', period: 'weekly', objectiveId: '', horizon: '12m', scenarioId: 'scn', classification: 'restricted' })['context']).toEqual({ horizon: '12m', classification: 'restricted', scenario_id: 'scn' });
  });
});
