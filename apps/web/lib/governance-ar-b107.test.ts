import { describe, expect, it } from 'vitest';
import { confirmsDigest, dayText, evidenceText, inForce, latestOnly, latestVersions, scopeText, shortDigest, stateText, tone, unmet, type RecordVersion } from './governance-ar-b107';

/** CP-6 B107 §AR (0115_b107_x_ar): the acceptance page WORDS the server's record — what is accepted, current, held and attestable is the
 *  server's. Nothing is shown accepted by inference; a proposal is never worded like an acceptance. SYNTHETIC. */
const rv = (o: Partial<RecordVersion>): RecordVersion => ({ record_id: 'r', version: 1, kind: 'capability', title: 't', subject_key: 'CAP', subject_digest: '', scope_tuple: {}, obligations: [],
  evidence: [], conditions: [], exceptions: [], operational: null, digest: 'd', state: 'proposed', effective_scope: null, constrained_reasons: [], claim: 'demonstration', real_acceptance: 'R2',
  proposed_by: 'p', proposed_by_name: null, proposed_at: '2026-10-15T00:00:00Z', accepted_at: null, constrained_at: null, ended_at: null, end_reason: null, attestations: [], verification: null,
  conditions_met: [], signatures: [], ...o });

describe('the standing of a version and of a subject', () => {
  it('a proposal is never worded like an acceptance; constrained and suspended say what stays in force', () => {
    expect(stateText(rv({ state: 'proposed' }))).toMatch(/^PROPOSED — not accepted/);
    expect(stateText(rv({ state: 'accepted', accepted_at: '2026-10-15T10:00:00Z' }))).toBe('ACCEPTED for its exact scope since 2026-10-15T10:00:00Z (claim: demonstration)');
    expect(stateText(rv({ state: 'constrained' }))).toMatch(/previously accepted, unaffected scope; expansion held/);
    expect(stateText(rv({ state: 'suspended' }))).toMatch(/nothing of it is in force/);
    expect(stateText(rv({ state: 'withheld', end_reason: 'the resilience evidence is short' }))).toBe('WITHHELD — an obligation was withheld: the resilience evidence is short');
  });
  it('no record in force reads NOT ACCEPTED — never inferred from another domain', () => {
    expect(scopeText({ state: 'not_accepted', expansion_held: false })).toBe('NOT ACCEPTED in this domain');
    expect(scopeText({ state: 'not_accepted', expansion_held: true })).toBe('NOT ACCEPTED in this domain · expansion held in this tenant');
    expect(scopeText({ state: 'proposed_only', expansion_held: false })).toMatch(/^NOT ACCEPTED — a proposal awaits/);
    expect(scopeText({ state: 'constrained', expansion_held: true })).toMatch(/^CONSTRAINED here/);
    expect([tone('accepted'), tone('constrained'), tone('proposed'), tone('proposed_only'), tone('lapsed')]).toEqual(['in_force', 'restricted', 'proposal', 'proposal', 'none']);
  });
});

describe('evidence on the read\'s clock; partial attestation; versions', () => {
  const read = '2026-10-15T12:00:00.000Z';
  it('current / expiring / expired / failed / renewed', () => {
    expect(evidenceText({ valid_until: '2027-01-01T00:00:00.000Z' }, read)).toBe('current until 2027-01-01T00:00:00.000Z');
    expect(evidenceText({ valid_until: '2026-10-16T00:00:00.000Z' }, read)).toBe('expires soon — 12 h left');
    expect(evidenceText({ valid_until: '2026-10-15T11:00:00.000Z' }, read)).toBe('EXPIRED at 2026-10-15T11:00:00.000Z');
    expect(evidenceText({ valid_until: '2027-01-01T00:00:00.000Z', outcome: 'failed' }, read)).toMatch(/^FAILED/);
    expect(evidenceText({ valid_until: '2027-01-01T00:00:00.000Z', renewed_by: 'x' }, read)).toMatch(/^RENEWED/);
  });
  it('unmet obligations are visible as such; a withholding is not an attestation', () => {
    expect(unmet(rv({ obligations: ['customer', 'product', 'independent_assurance'], attestations: [{ obligation: 'product', decision: 'attest' }, { obligation: 'customer', decision: 'withhold' }] })))
      .toEqual(['customer', 'independent_assurance']);
  });
  it('the newest version per record; the version in force beside a newer proposal', () => {
    const rs = [rv({ record_id: 'a', version: 1, state: 'constrained' }), rv({ record_id: 'a', version: 2, state: 'proposed', proposed_at: '2026-10-15T01:00:00Z' }), rv({ record_id: 'b', version: 1, state: 'accepted' })];
    expect(latestVersions(rs).map((r) => `${r.record_id}${r.version}`)).toEqual(['a2', 'b1']);
    expect(inForce(rs, 'a')?.version).toBe(1);
    expect(inForce(rs, 'c')).toBeNull();
  });
});

describe('OBJ-40 deliberate action, days and selection', () => {
  it('the digest is confirmed by its first 8+ characters, never by less', () => {
    const d = 'abcdef0123456789'.repeat(4);
    expect(confirmsDigest('abcdef01', d)).toBe(true);
    expect(confirmsDigest('ABCDEF01', d)).toBe(true);
    expect(confirmsDigest('abcdef0', d)).toBe(false);
    expect(confirmsDigest('abcdef02', d)).toBe(false);
    expect(shortDigest(d)).toBe('abcdef012345…6789');
  });
  it('a DATE renders as the day it names; only the newest selection is applied', () => {
    expect(dayText('2027-04-13')).toBe('2027-04-13');
    expect(dayText('2027-04-13T00:00:00.000Z')).toBe('2027-04-13');
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
});
