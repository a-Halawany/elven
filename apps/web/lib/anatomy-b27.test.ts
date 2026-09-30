import { describe, expect, it } from 'vitest';
import { ELEMENT_KINDS, ELEMENT_KIND_LABEL, RECORD_KINDS, attributesLine, branchStateMark, causeLine, conditionLine, linkStanding, pathLine, reinstatementLine, suspensionBanner, type SuspensionView } from './anatomy-b27';

/** CP-6 B27 part `anatomy` (0097 §A): the anatomy page is worded, never judged on the client (the states, causes and maps are the server's). */
const S = (over: Partial<SuspensionView> = {}): SuspensionView => ({
  suspended_at: '2026-10-01T09:00:00.000Z', suspended_by: '0190b1c2-d3e4-7000-8000-000000000001', suspended_by_name: 'J. Weber',
  reason: 'the critical assumption "Insurers keep war-risk cover" was invalidated: underwriters withdrew', cause: { kind: 'assumption', id: 'a1', title: 'Insurers keep war-risk cover' },
  suspended_from: 'open', current: true, reinstated_at: null, reinstated_by: null, reinstated_by_name: null, reinstatement_note: null, ...over,
});

describe('the anatomy page is worded from the record', () => {
  it('the vocabularies are the migration\'s (five element kinds, three record kinds), each kind labelled', () => {
    expect([...ELEMENT_KINDS]).toEqual(['driver', 'actor', 'mechanism', 'intervention', 'impact']);
    expect(Object.keys(ELEMENT_KIND_LABEL)).toEqual([...ELEMENT_KINDS]);
    expect([...RECORD_KINDS]).toEqual(['narrative', 'implication', 'option']);
  });
  it('a suspended branch says it is not live, with a glyph and words — never colour alone', () => {
    expect(branchStateMark('suspended')).toEqual({ glyph: '⏸', token: '--eye-color-warning', text: 'SUSPENDED — not live: no flip, no simulation, not decision-active' });
    expect(branchStateMark('open').text).toBe('OPEN — live');
    expect(branchStateMark('flipped').text).toBe('FLIPPED — live');
  });
  it('the banner names the cause, when, by whom and where a reinstatement returns; an element and an operator cause are named too', () => {
    expect(suspensionBanner(S())).toBe('Suspended 2026-10-01T09:00:00.000Z by J. Weber — the critical assumption "Insurers keep war-risk cover" was invalidated. Reason: the critical assumption "Insurers keep war-risk cover" was invalidated: underwriters withdrew. A reinstatement returns it to open.');
    expect(suspensionBanner(S({ suspended_by_name: null })).startsWith('Suspended 2026-10-01T09:00:00.000Z by 0190b1c2…')).toBe(true);
    expect(causeLine(S({ cause: { kind: 'element', id: 'e1', element_kind: 'intervention', name: 'Naval escort' } }))).toBe('suspended by a person on the intervention "Naval escort"');
    expect(causeLine(S({ cause: { kind: 'operator', id: 'p1' } }))).toBe('suspended by a person');
    expect(reinstatementLine(S())).toBeNull();
    expect(reinstatementLine(S({ current: false, reinstated_at: '2026-10-02T09:00:00.000Z', reinstated_by: 'p2', reinstated_by_name: 'N. Eriksen', reinstatement_note: 'cover is written again' })))
      .toBe('Reinstated 2026-10-02T09:00:00.000Z by N. Eriksen: cover is written again');
  });
  it('the attributes read by kind (exogeneity, agency, cause → effect, who acts, the impact\'s band), the timing appended', () => {
    expect(attributesLine({ kind: 'driver', attributes: { exogenous: true, timing: { start: '2026-10-01', end: '2026-12-31' } } })).toBe('exogenous (a shock from outside) · timing 2026-10-01 – 2026-12-31');
    expect(attributesLine({ kind: 'actor', attributes: { agency: 'high', interest: 'keep schedules' } })).toBe('agency high · interest: keep schedules');
    expect(attributesLine({ kind: 'mechanism', attributes: { cause: 'premium rises', effect: 'carriers reroute' } })).toBe('premium rises → carriers reroute');
    expect(attributesLine({ kind: 'intervention', attributes: { by: 'navies', expected_effect: 'fewer attacks' } })).toBe('by navies · expected: fewer attacks');
    expect(attributesLine({ kind: 'impact', attributes: { on: { kind: 'strategy', id: 'x', label: 'OBJ Keep the line running' }, direction: 'adverse', magnitude: 'severe', horizon: '30d' } }))
      .toBe('on OBJ Keep the line running · adverse · magnitude severe · horizon 30d');
  });
  it('the register row: critical or not, the ASU\'s state, the condition met, the server\'s note; an unlinked row says so', () => {
    const l = { critical: true, state: 'linked' as const, assumption: { title: 't', statement: 's', status: 'active', verification_state: 'invalidated' as const, verification_reason: null, verified_at: null }, condition_met: true,
      note: 'a critical assumption is invalidated: the branch it names is suspended' };
    expect(linkStanding(l)).toBe('CRITICAL · assumption invalidated · condition MET — a critical assumption is invalidated: the branch it names is suspended');
    expect(linkStanding({ ...l, critical: false, condition_met: false, note: null, assumption: { ...l.assumption, verification_state: 'unverified' } })).toBe('non-critical · assumption unverified');
    expect(linkStanding({ ...l, state: 'unlinked' })).toBe('UNLINKED');
    expect(conditionLine({ kind: 'state', text: 'cover withdrawn' })).toBe('the assumption is invalidated in the Knowledge Graph — “cover withdrawn”');
    expect(conditionLine({ kind: 'claim', claim_id: '0190b1c2-d3e4', text: 'rates claim disputed' })).toBe('claim 0190b1c2… is disputed or withdrawn — “rates claim disputed”');
  });
  it('a map path reads intervention → targets → mechanisms → impacts; an unmapped one says so', () => {
    const p = { intervention: { element_id: 'i', name: 'Naval escort', by: 'navies', expected_effect: 'x' }, targets: [{ element_id: 'd', kind: 'driver', name: 'Houthi activity' }],
      mechanisms: [{ element_id: 'm', name: 'War-risk premium', cause: 'a', effect: 'b' }], impacts: [{ element_id: 'k', name: 'Line stop', on: null, direction: 'adverse', magnitude: 'severe', horizon: '30d' }], unmapped: false };
    expect(pathLine(p)).toBe('Naval escort → Houthi activity → War-risk premium → Line stop (adverse, severe, 30d)');
    expect(pathLine({ ...p, mechanisms: [], impacts: [], unmapped: true })).toBe('Naval escort → Houthi activity → — → no impact mapped yet');
  });
});
