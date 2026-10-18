import { describe, expect, it } from 'vitest';
import { authorityStateText, capabilityStateText, caseConsequenceLines, caseStateText, conditionsOf, dayText, daysAfter, dutyText, gapText, isGapDuty, isLiveGap, latestOnly, resolutionText,
  shortDigest, transferConsequenceLines } from './governance-dr-b107';

/** CP-6 B107 §DR (0115_b107_x_dr): the ownership page WORDS the server's record — who owns what, what holds and who may decide are the server's. SYNTHETIC. */
describe('duties and authorities: a gap is shown as a gap, a proposal never like a ratification', () => {
  it('duty states', () => {
    expect(dutyText({ state: 'resolved', principal: 'p1', name: 'A. Novák (SYNTHETIC)' })).toBe('● resolved · A. Novák (SYNTHETIC)');
    expect(dutyText({ state: 'lost', principal: 'p2' })).toBe('⊘ LOST — no longer an active human of the tenant · p2');
    expect(dutyText({ state: 'unfilled', role: 'privacy_officer', holders: [] })).toBe('⊘ UNFILLED — nobody holds the role · privacy_officer (0 holders)');
    expect(dutyText({ state: 'ambiguous', role: 'data_steward', holders: ['a', 'b'] })).toMatch(/^◐ AMBIGUOUS .* data_steward \(2 holders\)$/);
    expect(dutyText(undefined)).toBe('○ undeclared');
    expect(isGapDuty({ state: 'declared' })).toBe(false);
    expect(isGapDuty({ state: 'ambiguous' })).toBe(true);
    expect(isGapDuty(undefined)).toBe(true);
  });
  it('authority standings', () => {
    expect(authorityStateText('proposed')).toMatch(/^PROPOSED — not in force; awaits the named owner/);
    expect(authorityStateText('proposed', true)).toMatch(/^PROPOSED — the named owner ACCEPTED; awaits ratification by another named human/);
    expect(authorityStateText('ratified')).toBe('RATIFIED — in force');
    expect(authorityStateText('undeclared')).toMatch(/^○ UNDECLARED/);
    expect(resolutionText({ state: 'unresolved', unresolved: ['custodian'] })).toMatch(/^⊘ UNRESOLVED — custodian/);
    expect(resolutionText({ state: 'unresolved', unresolved: [] })).toMatch(/the registry and the catalog disagree/);
    expect(resolutionText({ state: 'proposed', unresolved: [] })).toMatch(/nothing is in force/);
  });
});

describe('gaps and cases on the read\'s clock', () => {
  const read = '2026-10-15T12:00:00.000Z';
  it('a held gap, a listed gap, an escalated one, an accepted one (still listed), the DATE as the day it names', () => {
    expect(gapText({ state: 'open', gap_kind: 'owner_lost', held: true })).toBe('OPEN · owner lost · HELD (new consumption and authoritative changes stop)');
    expect(gapText({ state: 'open', gap_kind: 'no_owner', held: false })).toBe('OPEN · no owner · listed (the domain observes)');
    expect(gapText({ state: 'escalated', gap_kind: 'no_owner', held: true, escalations: 2 })).toBe('ESCALATED (level 2) · no owner · HELD');
    expect(gapText({ state: 'accepted', gap_kind: 'no_owner', accepted_until: '2026-10-29T23:30:00.000+02:00', accepted_by_name: 'T. Richter' })).toBe('ACCEPTED until 2026-10-29 · no owner · residual accepted by T. Richter — still listed');
    expect(isLiveGap({ state: 'escalated' })).toBe(true);
    expect(isLiveGap({ state: 'accepted' })).toBe(false);
    expect(dayText('2026-09-30')).toBe('2026-09-30');
  });
  it('cases: overdue before any sweep; unowned held; in review counts; expired holds', () => {
    expect(caseStateText({ state: 'open', due_at: '2026-10-15T11:00:00.000Z', owner_principal_id: 'o' }, read)).toMatch(/^OVERDUE since/);
    expect(caseStateText({ state: 'open', due_at: '2026-10-16T11:00:00.000Z', owner_principal_id: null }, read)).toMatch(/NO ACCOUNTABLE OWNER \(held; approval blocked\)$/);
    expect(caseStateText({ state: 'in_review', due_at: '2026-10-16T11:00:00.000Z', approvals: 1, reviewers_required: 2 }, read)).toBe('IN REVIEW — 1 of 2 approvals');
    expect(caseStateText({ state: 'expired', expires_at: '2026-10-14T00:00:00.000Z' }, read)).toMatch(/subject is HELD until the case is closed/);
    const l = caseConsequenceLines({ case_ref: 'STW-0001', kind: 'data_exception', consequence: 'C2', subject_label: 'product X', proposed_action: 'waive the lag policy', reviewers_required: 1, approvals: 0 });
    expect(l[2]).toMatch(/^Your approval DECIDES the case/);
    expect(l[3]).toMatch(/^A data exception EXPIRES/);
    expect(caseConsequenceLines({ kind: 'access', reviewers_required: 2, approvals: 0 })[2]).toBe('Your approval is 1 of 2 — another named reviewer decides');
  });
});

describe('the vendor side and the helpers', () => {
  it('a transfer\'s consequence; a capability\'s standing', () => {
    const l = transferConsequenceLines({ component_key: 'L3-C04', from_version: 1, proposal: { owning_team: 'Data governance team', operator_role: 'operations_authority', owned_contracts: ['/v1/governance/ownership'] },
      checklist: { code: {}, state: {}, contracts: {}, dashboards: {}, alerts: {}, runbooks: {}, risks: {}, exceptions: {}, incidents: {} }, open_exceptions: [{ key: 'EXC-1' }] });
    expect(l[0]).toBe('L3-C04: ownership v1 → v2 to Data governance team');
    expect(l[3]).toBe('Handover checklist: 9 of 9 items with references; open exceptions handed over: 1');
    expect(transferConsequenceLines({ component_key: 'X', from_version: null, proposal: {}, checklist: {} })[0]).toMatch(/assigned for the first time/);
    expect(capabilityStateText({ conformance: 'drift', admission: 'not_admitted', holds: [{}] })).toBe('DRIFT · not admitted · HELD (1)');
    expect(capabilityStateText({ conformance: 'conformant', admission: 'admitted', holds: [] })).toBe('CONFORMANT · ADMITTED to the governed inventory');
  });
  it('conditions, dates, digests, the stale-response guard', () => {
    expect(conditionsOf('  a first condition \n\n second one\n')).toEqual(['a first condition', 'second one']);
    expect(daysAfter('2026-10-15T12:00:00.000Z', 14)).toBe('2026-10-29T12:00:00.000Z');
    expect(shortDigest('a'.repeat(64))).toBe(`${'a'.repeat(12)}…aaaa`);
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
});
