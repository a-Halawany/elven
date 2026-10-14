import { describe, expect, it } from 'vitest';
import { blockingLine, consequencePreview, countsLine, diffRehearsals, disabledReason, draftFromSuggestions, latestOnly, shortDigest, stateBadge, type Rehearsal, type StagingRow } from './delivery-mg-b94';

/** CP-6 B94 §MG (0114 §MG): the migration workspace WORDS the server's record — it never decides a disposition, a hold or an approval. SYNTHETIC. */
describe('states are visibly distinct; a proposal is never worded like an approval', () => {
  it('held beats every progression; proposed ≠ approved', () => {
    expect(stateBadge('requested', true)).toMatchObject({ text: 'HELD (requested)', token: '--eye-color-critical' });
    expect(stateBadge('executed', true).text).toBe('HELD (executed)');
    expect(stateBadge('proposed').text).toMatch(/^PROPOSED — awaiting the customer authority/);
    expect(stateBadge('approved').text).toBe('APPROVED by the customer authority');
    expect(stateBadge('proposed').token).not.toBe(stateBadge('approved').token);
    expect(stateBadge('accepted').text).toBe('ACCEPTED (demonstration)');
    expect(stateBadge('rolled_back').text).toBe('ROLLED BACK');
  });
});

describe('blocking items and the reconciliation report, in words', () => {
  it('an owner gap names the responsibility, its state and the escalation path', () => {
    expect(blockingLine({ kind: 'owner_gap', responsibility: 'data.migration', state: 'unfilled', reason: 'the named owner no longer holds onboarding_authority', escalation_path: 'the sponsor' }))
      .toBe('No resolved accountable owner for data.migration (unfilled): the named owner no longer holds onboarding_authority — escalation: the sponsor');
    expect(blockingLine({ kind: 'reconciliation', blocking: 5, unmapped_columns: ['Buyer Note'], route: 'remediate' })).toBe('The reconciliation has 5 blocking item(s); unmapped columns: Buyer Note — remediate');
    expect(blockingLine({ kind: 'mapping_not_approved', mapping_version: 2, approved_version: 1 })).toBe('The rehearsal ran mapping v2; the approved mapping is v1');
    expect(blockingLine({ kind: 'post_cutover', observed: { observed: 47, expected: 48 } })).toMatch(/47 of 48 observed/);
  });
  it('the counts in the clause order', () => {
    expect(countsLine({ rows: 48, mapped: 44, would_create: 43, would_match: 1, rejected: 2, rejected_missing_key: 1, rejected_formula_cell: 1, ambiguous: 2, unmapped_columns: 1 }))
      .toBe('48 rows · mapped 44 (would create 43, would match 1) · rejected 2 (missing key 1, formula cell 1, bad value 0) · ambiguous 2 · conflict 0 · unmapped columns 1');
  });
});

describe('the rehearsal diff (a correction is visible row by row)', () => {
  const row = (row_no: number, legacy_id: string | null, disposition: string, reasons: string[] = []): StagingRow => ({ row_no, legacy_id, name: 'x', values: {}, disposition, reasons, formula_cells: [], match_entity_id: null, match_name: null });
  it('only rows whose disposition or key changed', () => {
    const before = [row(1, 'A', 'would_create'), row(2, null, 'rejected', ['missing_key']), row(3, 'C', 'ambiguous'), row(4, 'C', 'ambiguous')];
    const after = [row(1, 'A', 'would_create'), row(2, 'B', 'would_create'), row(3, 'C', 'would_create'), row(4, 'D', 'would_create'), row(5, 'E', 'would_create')];
    expect(diffRehearsals(before, after)).toEqual([
      { row_no: 2, legacy_id: 'B', before: 'rejected', after: 'would_create', reasons: ['missing_key'] },
      { row_no: 3, legacy_id: 'C', before: 'ambiguous', after: 'would_create', reasons: [] },
      { row_no: 4, legacy_id: 'D', before: 'ambiguous', after: 'would_create', reasons: [] },
      { row_no: 5, legacy_id: 'E', before: null, after: 'would_create', reasons: [] },
    ]);
  });
});

describe('the approval control: a consequence preview, the reason a control is disabled, the stale guard', () => {
  it('the preview names what is written and what is not', () => {
    const r = { counts: { would_create: 47, would_match: 1 } } as unknown as Rehearsal;
    expect(consequencePreview(r, 'NORDWERK Polska')).toMatch(/^Approving authorizes the migration of 48 legacy rows into "NORDWERK Polska": 47 new organization entities/);
    expect(consequencePreview(r, 'x')).toMatch(/no exposure is registered/);
    expect(consequencePreview(null, 'x')).toBe('No rehearsal is named.');
  });
  it('a disabled control carries its reason; an eligible one may still be blocked', () => {
    expect(disabledReason({ eligible: false, reason: 'an implementation lead never approves' })).toBe('an implementation lead never approves');
    expect(disabledReason({ eligible: true, reason: 'ok' })).toBeNull();
    expect(disabledReason({ eligible: true, reason: 'ok' }, 'the cutover is held')).toBe('the cutover is held');
    expect(disabledReason(undefined)).toMatch(/unknown/);
  });
  it('only the latest selection may set the page', () => {
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
  it('a draft from suggestions leaves unconfident columns out (the lead decides); digests are shortened for display only', () => {
    const d = draftFromSuggestions([{ column: 'Supplier No', field: 'legacy_id', transforms: ['trim'], ignore: false }, { column: 'Buyer Note', field: null, transforms: [], ignore: false }]);
    expect(d).toEqual({ key_column: 'Supplier No', columns: [{ column: 'Supplier No', field: 'legacy_id', transforms: ['trim'], ignore: false }] });
    expect(shortDigest('a'.repeat(64))).toBe('aaaaaaaaaaaa…');
  });
});
