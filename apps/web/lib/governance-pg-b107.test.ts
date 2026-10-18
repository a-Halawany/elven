import { describe, expect, it } from 'vitest';
import { BUCKETS, bucketLine, dayText, decisionsOf, dimensionText, engineeringLine, exceptionStateText, holdText, latestOnly, rightsRowText, shortDigest, standingText, supplyChainLine,
  toneOf, versionStateText, type Hold } from './governance-pg-b107';

/** CP-6 B107 §PG (0115_b107_x_pg): the workspace WORDS the server's record — it never decides who may approve, what is in force or what
 *  conforms. A proposal never reads like an approval; an expired exception never reads in force; nothing declared reads UNKNOWN. SYNTHETIC. */
describe('states are visibly distinct and never inferred', () => {
  it('an exception: proposed, in force, expired (sweep pending), expired and held, renewed, closed', () => {
    expect(exceptionStateText({ effective_state: 'proposed', approver_roles: ['independent_assurance'] })).toBe('PROPOSED — not in force; awaits independent_assurance (never its owner or proposer)');
    expect(exceptionStateText({ effective_state: 'approved', expires_at: '2026-11-01T00:00:00Z', decided_by_name: 'A (SYNTHETIC)', decided_role: 'independent_assurance' })).toMatch(/^IN FORCE until 2026-11-01/);
    expect(exceptionStateText({ effective_state: 'expired (sweep pending)', expires_at: 'x' })).toMatch(/^EXPIRED at x — no longer in force/);
    expect(exceptionStateText({ state: 'expired', expires_at: 'x' })).toMatch(/HELD until a renewal with current evidence/);
    expect(exceptionStateText({ state: 'superseded' })).toBe('SUPERSEDED by a renewal');
    expect(toneOf('proposed')).toBe('proposal'); expect(toneOf('approved')).toBe('in_force'); expect(toneOf('expired (sweep pending)')).toBe('held'); expect(toneOf('closed')).toBe('ended');
  });
  it('a version: a held baseline, a change missing its plans, a signed baseline (demonstration; the real attestation is H3), an overdue record', () => {
    expect(versionStateText('baseline', { state: 'proposed', gaps: [{ gap: 'orphans' }, { gap: 'no_decision_rights' }] })).toBe('PROPOSED — HELD: authority unresolved (orphans, no_decision_rights)');
    expect(versionStateText('baseline', { state: 'proposed', gaps: [] })).toBe('PROPOSED — not in force');
    expect(versionStateText('change', { state: 'proposed', missing_plans: ['replay', 'rollback'] })).toBe('PROPOSED — NOT approvable: plans missing (replay, rollback)');
    expect(versionStateText('change', { state: 'proposed', missing_plans: [], required_roles: ['product_authority', 'independent_assurance'] })).toBe('PROPOSED — awaits product_authority and independent_assurance');
    expect(versionStateText('baseline', { state: 'signed', claim: 'demonstration' })).toMatch(/^SIGNED — the controlled baseline \(demonstration; the real executive attestation is H3\)/);
    expect(versionStateText('record', { state: 'active', next_review_due: '2026-12-01', review_overdue: true })).toBe('ACTIVE — next review 2026-12-01 (OVERDUE)');
  });
  it('a posture dimension with nothing declared reads UNKNOWN, never conformant', () => {
    expect(dimensionText('decision_rights', { state: 'unknown' })).toBe('decision rights: UNKNOWN — nothing declared (never inferred conformant)');
    expect(dimensionText('holds', { state: 'non_conformant' })).toBe('holds: NON-CONFORMANT');
    expect(dimensionText('baseline', { state: 'conformant' })).toBe('baseline: CONFORMANT');
  });
});

describe('holds, owners, rights and the read-only registers are worded from the record', () => {
  const hold: Hold = { hold_id: 'h', subject_artifact: 'a', subject_kind: 'release_candidate', subject_key: 'RC-2', subject_title: null, reason_kind: 'exception_expired', source_artifact: 's',
    source_kind: 'exception', source_key: 'GEX-0001', reason: 'r', opened_at: 't', lifted_at: null, lifted_by_name: null, lift_reason: null };
  it('a hold: HELD (what, why, by what) or LIFTED (why, by whom)', () => {
    expect(holdText(hold)).toBe('HELD: RC-2 (release candidate) by an exception expired — GEX-0001');
    expect(holdText({ ...hold, lifted_at: 't2', lift_reason: 'renewed: GEX-0001 v2', lifted_by_name: 'B (SYNTHETIC)' })).toBe('LIFTED: RC-2 (release candidate) (an exception expired — GEX-0001) — renewed: GEX-0001 v2 · by B (SYNTHETIC)');
  });
  it('a capability\'s standing, a rights row, the buckets in their natural order', () => {
    expect(standingText({ standing: 'orphan' })).toBe('ORPHAN — no accountable owner');
    expect(standingText({ standing: 'lapsed', owner_name: 'O', owner_role: 'operations_authority' })).toBe('LAPSED — O no longer holds operations_authority');
    expect(rightsRowText({ subject: 'exception', duty: 'approve', role: 'independent_assurance', principal: 'p', delegate: { to: 'q', until: '2026-10-22' } })).toBe('exception · approve · independent_assurance (named) · delegated until 2026-10-22');
    expect(bucketLine({ '>180': 1, '0-30': 2, '31-90': 0, '91-180': 0 })).toBe('0-30 days: 2 · 31-90 days: 0 · 91-180 days: 0 · >180 days: 1');
    expect(BUCKETS).toEqual(['0-30', '31-90', '91-180', '>180']);
  });
  it('EXCEPTIONS.md: an expired entry is REPORTED (the owner renews or closes it); a C15 disposition is shown, the gate decides', () => {
    expect(engineeringLine({ id: 'EXC-P0-003', expired: true, expiry_date: '2026-09-30', days_past_expiry: 15, status: 'open' })).toBe('EXC-P0-003 — EXPIRED 2026-09-30 (15 days) and still open — REPORTED; the owner renews or closes it in EXCEPTIONS.md');
    expect(engineeringLine({ id: 'EXC-P0-001', expired: false, expiry_date: '2026-10-31', status: 'open' })).toBe('EXC-P0-001 — open, expires 2026-10-31');
    expect(supplyChainLine({ id: 'SCX-0002', package: 'stdlib', installed_version: 'v1.24.6', severities: ['HIGH'], image: 'postgres@sha256:77f5…', expires_on: '2026-11-05', expired: false }))
      .toBe('SCX-0002 — stdlib v1.24.6 (HIGH) in postgres@sha256:77f5… · expires 2026-11-05');
    expect(supplyChainLine({ id: 'SCX-9', package: 'p', installed_version: 'v', severities: [], image: 'i', expires_on: '2026-01-01', expired: true })).toMatch(/the C15 gate decides, not this workspace/);
  });
  it('the decisions a kind offers; the stale-response guard; a DATE renders as the day it names', () => {
    expect(decisionsOf('baseline').map((d) => d.decision)).toEqual(['sign', 'reject']);
    expect(decisionsOf('exception').map((d) => d.decision)).toEqual(['approve', 'reject']);
    expect(decisionsOf('conflict').map((d) => d.decision)).toEqual(['closure']);
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
    expect(dayText('2026-09-30')).toBe('2026-09-30');
    expect(dayText('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
    expect(shortDigest('a'.repeat(64))).toBe(`${'a'.repeat(12)}…aaaa`);
  });
});
