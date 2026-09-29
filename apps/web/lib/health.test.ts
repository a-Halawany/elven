import { describe, expect, it } from 'vitest';
import { CHANGE_STATES, COMPONENT_STATES, INPUT_KINDS, barPercent, changeMark, coverageWords, freshnessBadge, gamingFlagWords, parseModel, scoreWords, sensitivityWords, statusMark, trendWords, whatIf,
  /* B36 (0094 §S) strategy */ EXCEPTION_KINDS, EXCEPTION_STATES, contextLine, exceptionLine, ownerLine, signatureLine } from './health';

/** CP-6 B32 (0089 §H): the score is the server's; the page words it, and its one computation is a labelled alternative-weight VIEW. */
describe('the Strategic Health Score is worded, never invented on the client', () => {
  it('the vocabularies are the migration\'s (the CHECKs of 0089 §H and the contract\'s kinds)', () => {
    // B36 (0094 §S2): the four further classes
    expect([...INPUT_KINDS]).toEqual(['indicator', 'measure', 'risk', 'opportunity', 'capability', 'execution', 'outcome', 'quality']);
    expect([...COMPONENT_STATES]).toEqual(['included', 'stale', 'missing', 'inconsistent']);
    expect([...CHANGE_STATES]).toEqual(['raised', 'acknowledged', 'challenged', 'upheld', 'dismissed', 'withdrawn']);
  });
  it('an indeterminate score has no number — in words and in the bar', () => {
    expect(scoreWords(null, 'indeterminate')).toBe('no score (indeterminate)');
    expect(scoreWords(58, 'indeterminate'), 'the status wins over a stray value').toBe('no score (indeterminate)');
    expect(scoreWords(58, 'partial')).toBe('58.0');
    expect(statusMark('indeterminate').text).toBe('INDETERMINATE — NO SCORE');
    expect(statusMark('partial').glyph).toBe('◐');
    expect(barPercent(null)).toBeNull();
    expect(barPercent(140)).toBe(100);
    expect(coverageWords(0.8)).toBe('80 % of the weight covered');
  });
  it('the freshness badge says "9 d stale" for the supplier measure; missing and inconsistent say so', () => {
    expect(freshnessBadge({ state: 'stale', freshness_days: 9.43, stale_after_days: 7 }).text).toBe('9 d stale (bound 7 d)');
    expect(freshnessBadge({ state: 'included', freshness_days: 1.2, stale_after_days: 14 }).text).toBe('1 d old');
    expect(freshnessBadge({ state: 'missing', freshness_days: null, stale_after_days: 30 })).toEqual({ text: 'missing', token: '--eye-color-critical' });
    expect(freshnessBadge({ state: 'inconsistent', freshness_days: null, stale_after_days: 30 }).text).toBe('inconsistent');
  });
  it('trend, sensitivity, change state and the anti-gaming flags in words', () => {
    expect(trendWords(-23.2)).toBe('↓ -23.2');
    expect(trendWords({ delta: 12.5 })).toBe('↑ +12.5');
    expect(trendWords(null)).toBe('no prior');
    expect(sensitivityWords({ weight_plus_10pct: 58.4, weight_minus_10pct: 57.6, swing: 0.8, if_0: 46.4, if_100: 66.4 })).toBe('±10 % weight: 57.6–58.4 (swing 0.8); at 0: 46.4, at 100: 66.4');
    expect(changeMark('upheld').text).toBe('UPHELD — CHALLENGE STANDS');
    expect(gamingFlagWords({ flag: 'restated_input', component: 'corridor_risk', from_value: 42.72, to_value: 50.72 })).toMatch(/^restated input: corridor_risk 42\.72 → 50\.72/);
    expect(gamingFlagWords({ flag: 'on_threshold', band: 'healthy', floor: 70, value: 70.5 })).toBe('sits on a threshold: 70.5 is within a point of the healthy floor 70');
  });
  it('the alternative-weight VIEW recomposes a dimension by the server\'s rule over all four input kinds (the score already carries the direction)', () => {
    // the four kinds as the server records them: an indicator, a measure, a lower_better risk (scored 80), an opportunity
    const comps = [
      { key: 'ind', state: 'included', normalised: 80, weight: 0.25 },
      { key: 'msr', state: 'included', normalised: 80, weight: 0.25 },
      { key: 'rsk', state: 'included', normalised: 80, weight: 0.25 },
      { key: 'opp', state: 'included', normalised: 50, weight: 0.25 },
    ];
    expect(whatIf(comps, {}, 0.7)).toEqual({ value: 72.5, coverage: 1, total: 1 });
    // the server's +10 % sensitivity for `ind` (72.75): the same weight typed here, the others unchanged, gives the renormalised view
    expect(whatIf(comps, { opp: 0 }, 0.7).value).toBe(80);
    // the NORDWERK scene: the stale supplier excluded → 58 at coverage 0.8; typing its weight to 0 does not invent a value for it
    const scene = [{ key: 'corridor_risk', state: 'included', normalised: 56.8, weight: 0.5 }, { key: 'inventory_cover', state: 'included', normalised: 60, weight: 0.3 }, { key: 'supplier_on_time', state: 'stale', normalised: null, weight: 0.2 }];
    expect(whatIf(scene, {}, 0.7)).toEqual({ value: 58, coverage: 0.8, total: 1 });
    expect(whatIf(scene, { corridor_risk: 0.2 }, 0.7)).toEqual({ value: 58.72, coverage: 0.7143, total: 0.7 });
    expect(whatIf(scene, { corridor_risk: 0.1 }, 0.7), 'below the coverage floor: no value').toEqual({ value: null, coverage: 0.6667, total: 0.6 });
    expect(whatIf(scene, { supplier_on_time: 0 }, 0.7)).toEqual({ value: 58, coverage: 1, total: 0.8 });
    expect(whatIf([{ key: 'm', state: 'missing', normalised: null, weight: 1 }], {}, 0.7).value).toBeNull();
  });
  it('a proposal\'s model must be a JSON object (the server validates the rest)', () => {
    expect(parseModel('{"dimensions": []}')).toEqual({ ok: true, model: { dimensions: [] } });
    expect(parseModel('[1]').ok).toBe(false);
    expect(parseModel('{').ok).toBe(false);
  });
});

/* B36 (0094 §S) strategy: the score completed — the owner, the exception, the context and the signature are WORDED; nothing is judged here. */
describe('B36 · the input contract with owners, the exceptions, the context and the signature in words', () => {
  it('the vocabularies are the migration\'s', () => {
    expect([...EXCEPTION_KINDS]).toEqual(['exclude', 'relax_bound']);
    expect([...EXCEPTION_STATES]).toEqual(['requested', 'approved', 'refused']);
  });
  it('an input\'s owner and edit history in words — no owner stated as such, never invented', () => {
    expect(ownerLine({ owner_principal_id: null, owner_basis: 'the owner of MSR "x" — not an active human; no owner edit is admitted until one is assigned', edits: 0, history: [], owner_stated: false })).toMatch(/^no owner — the owner of MSR "x" — not an active human/);
    expect(ownerLine({ owner_principal_id: '0190b1c2-d3e4-7000-8000-000000000361', owner_basis: 'the owner of MSR "On-time delivery rate"', edits: 0, history: [], owner_stated: false })).toBe('owner 0190b1c2… (the owner of MSR "On-time delivery rate") · never restated');
    expect(ownerLine({ owner_principal_id: '0190b1c2-d3e4-7000-8000-000000000361', owner_basis: 'the owner of MSR "On-time delivery rate"', edits: 1, owner_stated: true,
      history: [{ edit_id: 'e', editor: 'p', from_value: 91, to_value: 96, reason: 'r', edited_at: null }] })).toBe('owner 0190b1c2… (the owner of MSR "On-time delivery rate") · 1 edit(s), last 91 → 96 (the owner\'s statement is what the score reads)');
  });
  it('the owner-edit flag in words (shown; it gates nothing)', () => {
    expect(gamingFlagWords({ flag: 'owner_edit', component: 'on_time', from_value: 91, to_value: 96, window_days: 2 })).toBe('owner edit: on_time restated 91 → 96 by its owner inside the 2-day window before this favourable change');
  });
  it('an exception in words: no effect until approved; in force; expired; refused', () => {
    expect(exceptionLine({ kind: 'exclude', relaxed_stale_after_days: null, state: 'requested', expires_at: null, component_key: 'execution' })).toBe('execution excluded · requested — no effect until approved');
    expect(exceptionLine({ kind: 'relax_bound', relaxed_stale_after_days: 30, state: 'approved', expires_at: '2027-01-01T00:00:00.000Z', in_force_now: true, component_key: 'on_time' })).toBe('on_time bound relaxed to 30 d · APPROVED — in force · until 2027-01-01T00:00:00.000Z');
    expect(exceptionLine({ kind: 'exclude', relaxed_stale_after_days: null, state: 'approved', expires_at: null, in_force_now: false, component_key: 'x' })).toMatch(/approved — expired/);
    expect(exceptionLine({ kind: 'exclude', relaxed_stale_after_days: null, state: 'refused', expires_at: null, component_key: 'x' })).toMatch(/refused — no effect/);
  });
  it('the active context in words — none set is stated, never defaulted silently', () => {
    expect(contextLine(null)).toMatch(/^no context set — the whole domain, horizon 90d/);
    expect(contextLine({ context_id: 'c', objective_id: null, horizon: '12m', scenario_id: null, classification: 'internal', effective_at: null, set_at: null, digest: 'd' })).toBe('objective the whole domain · horizon 12m · scenario none · ceiling internal · effective now');
  });
  it('a signature in words — never "signed" without the key and the digest it binds', () => {
    expect(signatureLine(null)).toBe('not signed');
    expect(signatureLine({ signature_id: 's', signer: '0190b1c2-d3e4-7000-8000-000000000361', key_id: 'ed25519:0123456789abcdef', algorithm: 'Ed25519', signature: 'x', subject_digest: 'a'.repeat(64), bound_action: 'executive.health.snapshot.approve', signed_at: null }))
      .toBe('signed Ed25519 with key ed25519:0123456789abcdef over aaaaaaaaaaaa… by 0190b1c2… (executive.health.snapshot.approve)');
  });
});
