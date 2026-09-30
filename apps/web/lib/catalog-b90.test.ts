import { describe, expect, it } from 'vitest';
import { CATALOG_KINDS, FLAG_KINDS, FLAG_LABEL, KIND_LABEL, LINEAGE_KINDS, LINEAGE_LABEL, coverageLine, dayOf, flagLine, hiddenLine, lineageLine, trustLine } from './catalog-b90';

/** CP-6 B90 §K (0095): the catalog page is worded, never judged on the client (the marks, the flags and the counts are the server's). */
describe('the catalog page is worded, never scored on the client', () => {
  it('the vocabularies are the migration\'s (the six kinds, the seven flags, the four lineage kinds), each flag with a glyph and words naming its mark', () => {
    expect(CATALOG_KINDS).toEqual(['schema', 'field', 'source', 'product', 'staging', 'external']);
    expect(Object.keys(KIND_LABEL)).toEqual(CATALOG_KINDS);
    expect(FLAG_KINDS).toEqual(['unowned', 'stale', 'duplicate', 'inconsistent', 'orphan', 'lineage_missing', 'ownership_lapsed']);
    expect(Object.keys(FLAG_LABEL)).toEqual(FLAG_KINDS);
    expect(FLAG_LABEL.orphan).toMatch(/undiscoverable/);
    expect(FLAG_LABEL.stale).toMatch(/untrusted/);
    expect(FLAG_LABEL.ownership_lapsed).toMatch(/untrusted/);
    expect(FLAG_LABEL.unowned).toMatch(/coverage debt/);
    expect(LINEAGE_KINDS).toEqual(['derives_from', 'feeds', 'serves', 'describes']);
    expect(Object.keys(LINEAGE_LABEL)).toEqual(LINEAGE_KINDS);
  });
  it('the trust line repeats the server\'s two marks and names the flags behind them; a read-time staleness the server reports is named too', () => {
    expect(trustLine({ trusted: true, discoverable: true, flags: [], stale_now: false })).toBe('✓ trusted · ◎ discoverable');
    expect(trustLine({ trusted: false, discoverable: false, flags: [{ kind: 'stale', since: '2026-09-20T00:00:00Z', reason: 'r' }, { kind: 'orphan', since: '2026-09-20T00:00:00Z', reason: 'r' }], stale_now: false }))
      .toBe('✗ UNTRUSTED (stale) · ⊘ undiscoverable (orphan)');
    expect(trustLine({ trusted: true, discoverable: true, flags: [], stale_now: true })).toBe('✗ UNTRUSTED (stale) · ◎ discoverable');
    expect(trustLine({ trusted: false, discoverable: true, flags: [{ kind: 'ownership_lapsed', since: '2026-09-20', reason: 'r' }], stale_now: false })).toMatch(/UNTRUSTED \(ownership lapsed\)/);
  });
  it('a flag line names the flag, the day since and the reason; a DATE renders as the day it names', () => {
    expect(flagLine({ kind: 'orphan', since: '2026-09-30T10:11:12.000Z', reason: 'a staging asset with no owner and no lineage' })).toMatch(/^⊘ orphan .* · since 2026-09-30 — a staging asset with no owner and no lineage$/);
    expect(dayOf('2026-09-30')).toBe('2026-09-30');
    expect(dayOf('2026-09-30T23:59:00.000Z')).toBe('2026-09-30');
    expect(dayOf(null)).toBe('—');
  });
  it('a lineage line reads in the direction of the edge with the neighbour\'s kind and trust', () => {
    expect(lineageLine('upstream', { kind: 'feeds', title: 'Red Sea AIS positions (synthetic)', asset_kind: 'source', trusted: true })).toBe('Red Sea AIS positions (synthetic) (source) — feeds → this asset');
    expect(lineageLine('downstream', { kind: 'feeds', title: 'Corridor warning stream', asset_kind: 'product', trusted: false })).toBe('this asset — feeds → Corridor warning stream (data product, untrusted)');
  });
  it('the coverage line keeps the server\'s counts per kind and its flags, never a percentage; the hidden line counts what was not served', () => {
    const line = coverageLine('staging', { total: 3, owned: 1, trusted: 3, discoverable: 2, lineage_covered: 1, flagged: { unowned: 2, orphan: 1 } });
    expect(line).toBe('staging asset: 3 total · 1 owned · 3 trusted · 2 discoverable · 1 with lineage · flags: orphan 1, unowned 2');
    expect(line).not.toMatch(/%/);
    expect(hiddenLine({ total: 4, hidden: 0, hidden_by: { undiscoverable: 0, clearance: 0 } })).toBe('4 match(es), nothing hidden');
    expect(hiddenLine({ total: 4, hidden: 2, hidden_by: { undiscoverable: 1, clearance: 1 } })).toBe('4 match(es) · 2 hidden: 1 undiscoverable, 1 above your clearance');
  });
});
