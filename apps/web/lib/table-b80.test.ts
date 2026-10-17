import { describe, expect, it } from 'vitest';
import {
  applyView, ariaSort, countsText, csvCell, decodeView, defaultView, exportCsv, filterRows, flattenTree, gridMove, groupRows, logicalKey,
  nextSort, shouldWindow, sortRows, stableDigest, treeKey, viewDigest, viewStateKey, windowRange, type ColumnSpec, type TableView, type TreeNode,
} from './table-b80';

/** CP-6 B80 §CL-D (UX-22, CMP-049/050): the table contract. Every row here is SYNTHETIC fixture data. */
interface R { id: string; name: string; mode: string | null; n: number | null; at: string | null }
const rows: R[] = [
  { id: 'a', name: 'Red Sea corridor stream', mode: 'replay', n: 3, at: '2026-10-01T00:00:00Z' },
  { id: 'b', name: 'carrier advisories', mode: 'live', n: null, at: '2026-09-01T00:00:00Z' },
  { id: 'c', name: 'PortWatch chokepoints', mode: 'replay', n: 10, at: null },
  { id: 'd', name: 'GDELT discovery', mode: null, n: 2, at: '2026-10-05T00:00:00Z' },
];
const cols: Array<ColumnSpec<R>> = [
  { key: 'name', label: 'Source', value: (r) => r.name },
  { key: 'mode', label: 'Mode', value: (r) => r.mode, groupable: true },
  { key: 'n', label: 'Evidence', kind: 'number', value: (r) => r.n },
  { key: 'at', label: 'Read at', kind: 'instant', value: (r) => r.at },
];
const view = (p: Partial<TableView>): TableView => ({ ...defaultView(), ...p });

describe('sort: stable, typed, unknown LAST in both directions', () => {
  it('numbers numerically; unknown last ascending AND descending', () => {
    expect(sortRows(rows, cols, [{ key: 'n', dir: 'asc' }]).map((r) => r.id)).toEqual(['d', 'a', 'c', 'b']);
    expect(sortRows(rows, cols, [{ key: 'n', dir: 'desc' }]).map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
  });
  it('instants by time; text case-insensitively with numeric collation; ties keep the read order', () => {
    expect(sortRows(rows, cols, [{ key: 'at', dir: 'asc' }]).map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortRows(rows, cols, [{ key: 'name', dir: 'asc' }]).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(sortRows(rows, cols, [{ key: 'mode', dir: 'asc' }]).map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortRows(rows, cols, []).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('the header cycle none → asc → desc → none; shift adds a secondary key; aria-sort names the primary only', () => {
    let s = nextSort([], 'n'); expect(s).toEqual([{ key: 'n', dir: 'asc' }]);
    s = nextSort(s, 'n'); expect(s).toEqual([{ key: 'n', dir: 'desc' }]);
    s = nextSort(s, 'n'); expect(s).toEqual([]);
    s = nextSort(nextSort([], 'mode'), 'n', true); expect(s).toEqual([{ key: 'mode', dir: 'asc' }, { key: 'n', dir: 'asc' }]);
    expect(ariaSort(s, 'mode')).toBe('ascending'); expect(ariaSort(s, 'n')).toBe('none');
  });
});

describe('filter and group: exact counts, unknown is a value', () => {
  it('every term must match some column; "unknown" matches an unknown value', () => {
    expect(filterRows(rows, cols, 'replay').map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterRows(rows, cols, 'RED replay').map((r) => r.id)).toEqual(['a']);
    expect(filterRows(rows, cols, 'unknown').map((r) => r.id)).toEqual(['b', 'c', 'd']);
    expect(filterRows(rows, cols, '   ').length).toBe(4);
  });
  it('groups keep first-appearance order; the unknown group is named and last', () => {
    const g = groupRows(rows, cols, 'mode')!;
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([['Mode: replay', 2], ['Mode: live', 1], ['Mode: unknown', 1]]);
    expect(groupRows(rows, cols, 'name')).not.toBeNull();
    expect(groupRows(rows, cols, 'nope')).toBeNull();
  });
  it('applyView: filter → sort → group with the exact counts; a selected row hidden by the filter is counted as such', () => {
    const r = applyView(rows, cols, view({ filter: 'replay', sort: [{ key: 'n', dir: 'desc' }], selection: ['a', 'b', 'gone'] }), (x) => x.id);
    expect(r.rows.map((x) => x.id)).toEqual(['c', 'a']);
    expect(r.counts).toEqual({ total: 4, matched: 2, hiddenByFilter: 2, selected: 2, selectedHidden: 1 });
    expect(countsText(r.counts, 'sources')).toBe('2 of 4 sources shown · 2 hidden by the filter · 2 selected (1 of them hidden by the filter)');
    expect(countsText(applyView(rows, cols, view({}), (x) => x.id).counts)).toBe('4 of 4 rows shown');
  });
});

describe('windowing — the million-row model', () => {
  const total = 1_000_000;
  it('renders a bounded slice anywhere in a million rows; spacers keep the full height', () => {
    for (const scrollTop of [0, 32 * 500_000, 32 * total, 32 * total * 2]) {
      const w = windowRange({ total, rowHeight: 32, viewportHeight: 640, scrollTop });
      expect(w.end - w.start).toBeLessThanOrEqual(21 + 12);
      expect(w.padBefore + (w.end - w.start) * 32 + w.padAfter).toBe(total * 32);
      expect(w.start).toBeGreaterThanOrEqual(0); expect(w.end).toBeLessThanOrEqual(total);
    }
    expect(windowRange({ total, rowHeight: 32, viewportHeight: 640, scrollTop: 32 * 500_000 }).start).toBe(500_000 - 6);
    expect(windowRange({ total: 0, rowHeight: 32, viewportHeight: 640, scrollTop: 0 })).toEqual({ start: 0, end: 0, padBefore: 0, padAfter: 0 });
    expect(windowRange({ total: 5, rowHeight: 0, viewportHeight: 0, scrollTop: -10 }).end).toBe(5);
  });
  it('a million synthetic rows filter, sort and count exactly in the pure model', () => {
    const big = Array.from({ length: total }, (_, i) => ({ id: String(i), name: `SYNTHETIC source ${i}`, mode: i % 3 === 0 ? 'live' : 'replay', n: i % 1000 === 0 ? null : i % 97, at: null }));
    const t0 = Date.now();
    const r = applyView(big, cols, view({ filter: 'live', sort: [{ key: 'n', dir: 'desc' }] }), (x) => x.id);
    expect(r.counts.total).toBe(total);
    expect(r.counts.matched).toBe(333_334);
    expect(r.counts.hiddenByFilter).toBe(total - 333_334);
    expect(r.rows[0]!.n).toBe(96);
    expect(r.rows[r.rows.length - 1]!.n).toBeNull();
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 60_000);
  it('a short table is rendered whole (every row in the accessibility tree)', () => {
    expect(shouldWindow(40)).toBe(false); expect(shouldWindow(201)).toBe(true);
  });
});

describe('the keyboard grid', () => {
  const dims = { rows: 5, cols: 4, page: 2 };
  it('arrows move one cell and clamp; Home/End per row; Ctrl+Home/End to the corners; Page by a page', () => {
    expect(gridMove({ row: 0, col: 0 }, 'ArrowUp', dims)).toEqual({ row: 0, col: 0 });
    expect(gridMove({ row: 0, col: 0 }, 'ArrowDown', dims)).toEqual({ row: 1, col: 0 });
    expect(gridMove({ row: 1, col: 3 }, 'ArrowRight', dims)).toEqual({ row: 1, col: 3 });
    expect(gridMove({ row: 2, col: 2 }, 'Home', dims)).toEqual({ row: 2, col: 0 });
    expect(gridMove({ row: 2, col: 1 }, 'End', dims)).toEqual({ row: 2, col: 3 });
    expect(gridMove({ row: 2, col: 2 }, 'Home', dims, true)).toEqual({ row: 0, col: 0 });
    expect(gridMove({ row: 2, col: 2 }, 'End', dims, true)).toEqual({ row: 4, col: 3 });
    expect(gridMove({ row: 1, col: 1 }, 'PageDown', dims)).toEqual({ row: 3, col: 1 });
    expect(gridMove({ row: 1, col: 1 }, 'PageUp', dims)).toEqual({ row: 0, col: 1 });
    expect(gridMove({ row: 1, col: 1 }, 'x', dims)).toEqual({ row: 1, col: 1 });
  });
  it('RTL mirrors the horizontal arrows only', () => {
    expect(logicalKey('ArrowLeft', 'rtl')).toBe('ArrowRight'); expect(logicalKey('ArrowRight', 'rtl')).toBe('ArrowLeft');
    expect(logicalKey('ArrowLeft', 'ltr')).toBe('ArrowLeft'); expect(logicalKey('ArrowUp', 'rtl')).toBe('ArrowUp');
  });
});

describe('the view record: versioned, digested, reconciled', () => {
  const keys = cols.map((c) => c.key);
  it('the digest is stable over key order and moves when anything changes', () => {
    const v = view({ sort: [{ key: 'n', dir: 'asc' }], filter: 'red' });
    expect(viewDigest(v)).toBe(viewDigest({ selection: [], groupBy: null, filter: 'red', density: 'comfortable', columns: [], sort: [{ dir: 'asc', key: 'n' }], v: 1 }));
    expect(viewDigest(v)).not.toBe(viewDigest({ ...v, filter: 'reds' }));
    expect(stableDigest({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(viewStateKey('observation.sources')).toBe('table:observation.sources');
  });
  it('decoding drops — and NAMES — what today cannot honour', () => {
    const raw = { v: 1, columns: ['name', 'gone'], sort: [{ key: 'n', dir: 'desc' }, { key: 'zzz', dir: 'asc' }], filter: 'x', groupBy: 'vanished', density: 'compact', selection: ['a', 'q'] };
    const r = decodeView(raw, keys, new Set(['a', 'b']));
    expect(r.view).toEqual({ v: 1, columns: ['name'], sort: [{ key: 'n', dir: 'desc' }], filter: 'x', groupBy: null, density: 'compact', selection: ['a'] });
    expect(r.dropped).toEqual(['column gone', 'sort zzz', 'grouping vanished', 'selected q (no longer in this read)']);
  });
  it('an unknown version or a non-record is refused to the default view, said so', () => {
    expect(decodeView({ v: 2 }, keys).dropped[0]).toMatch(/version 2 is not readable/);
    expect(decodeView('junk', keys).dropped).toEqual(['the stored view is not a record']);
    expect(decodeView(null, keys)).toEqual({ view: defaultView(), dropped: [] });
  });
});

describe('export: the displayed, authorized rows — labelled; the count derived', () => {
  it('the label block names scope, classification ceiling, as-of and the count of rows written', () => {
    const shown = applyView(rows, cols, view({ filter: 'replay' }), (x) => x.id).rows;
    const f = exportCsv(shown, cols, { scope: 'tenant T / domain D', classificationCeiling: 'not declared by this read', asOf: '2026-10-17T10:00:00.000Z' }, 'Registered sources');
    const lines = f.text.split('\r\n');
    expect(lines.slice(0, 5)).toEqual([
      '# Registered sources', '# scope: tenant T / domain D', '# classification ceiling: not declared by this read', '# as of: 2026-10-17T10:00:00.000Z',
      '# rows: 2 (the rows displayed to this principal under the current filter — authorized by the read, nothing more)',
    ]);
    expect(lines[5]).toBe('Source,Mode,Evidence,Read at');
    expect(lines[6]).toBe('Red Sea corridor stream,replay,3,2026-10-01T00:00:00Z');
    expect(lines[7]).toBe('PortWatch chokepoints,replay,10,unknown');
    expect(f.count).toBe(2); expect(lines.length).toBe(9);
    expect(f.filename).toBe('registered-sources-2026-10-17.csv');
  });
  it('cells a spreadsheet would evaluate are neutralised; quotes and separators escaped', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1"); expect(csvCell('-2')).toBe("'-2"); expect(csvCell('@a')).toBe("'@a");
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('unknown'); expect(csvCell(-3)).toBe("'-3");
  });
});

describe('the tree grid (CMP-050)', () => {
  const tree: TreeNode[] = [
    { id: 'r', label: 'Red Sea corridor', children: [{ id: 'r1', label: 'Bab el-Mandeb' }, { id: 'r2', label: 'Suez', children: [{ id: 'r2a', label: 'Port Said' }] }] },
    { id: 'm', label: 'Malacca' },
  ];
  it('flattens the visible nodes with level, set size and position', () => {
    expect(flattenTree(tree, new Set()).map((f) => [f.id, f.level, f.posInSet, f.setSize, f.hasChildren, f.expanded])).toEqual([['r', 1, 1, 2, true, false], ['m', 1, 2, 2, false, false]]);
    expect(flattenTree(tree, new Set(['r', 'r2'])).map((f) => `${f.id}@${f.level}`)).toEqual(['r@1', 'r1@2', 'r2@2', 'r2a@3', 'm@1']);
  });
  it('Right expands then enters; Left collapses then climbs; Up/Down/Home/End move', () => {
    let exp = new Set<string>();
    let k = treeKey(flattenTree(tree, exp), 'r', 'ArrowRight', exp); expect(k.focus).toBe('r'); expect([...k.expanded]).toEqual(['r']); exp = k.expanded;
    k = treeKey(flattenTree(tree, exp), 'r', 'ArrowRight', exp); expect(k.focus).toBe('r1');
    k = treeKey(flattenTree(tree, exp), 'r1', 'ArrowLeft', exp); expect(k.focus).toBe('r');
    k = treeKey(flattenTree(tree, exp), 'r', 'ArrowLeft', exp); expect([...k.expanded]).toEqual([]);
    k = treeKey(flattenTree(tree, exp), 'r1', 'ArrowDown', exp); expect(k.focus).toBe('r2');
    k = treeKey(flattenTree(tree, exp), 'r2', 'End', exp); expect(k.focus).toBe('m');
    k = treeKey(flattenTree(tree, exp), 'm', 'Home', exp); expect(k.focus).toBe('r');
  });
});
