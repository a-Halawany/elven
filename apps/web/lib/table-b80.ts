/**
 * CP-6 B80 §CL-D (F-P7-E-05: UX-22-001/-002/-003/-005/-006, CMP-049, CMP-050) — THE TABLE CONTRACT as pure functions. `components/data.tsx`
 * renders exactly what these return; the web has no DOM test environment and B80 adds no dependency, so the behaviour is proven here (vitest,
 * node) and the rendering by the catalogue walk.
 *
 * What the contract holds to:
 *  - the counts are EXACT and stated: every view says how many rows the read returned, how many match the filter and how many the filter hides
 *    — a table never implies the world is what it shows;
 *  - an unknown value is a value: it sorts LAST in both directions and is never coerced to 0 or '';
 *  - a view (columns, sort, filter, grouping, density, selection) is a VERSIONED, digested, serialisable record — the persisted form is §SH's
 *    per-principal `shell.navigation_states` (the integrator's swap: `viewStateKey`); decoding reconciles it against today's columns and says
 *    what it dropped, never silently;
 *  - windowing renders a slice but the ARIA row count and the counts are the whole set's (a million rows are modelled; the DOM holds ~60);
 *  - an export is the DISPLAYED, AUTHORIZED rows only, labelled with the scope, the classification ceiling, the as-of instant and the count —
 *    the label's count is the number of rows written, by construction (a governed export package stays B13/B15's).
 *
 * CONSTRUCTION only: nothing here is demonstrated operation or acceptance.
 */
import { jcsCanonicalize } from './jcs';

export type ColumnKind = 'text' | 'number' | 'instant' | 'date';
export interface ColumnSpec<T> {
  key: string;
  label: string;
  kind?: ColumnKind;
  /** the comparable / exportable value; null or undefined = unknown */
  value: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
}
export type SortDir = 'asc' | 'desc';
export type Density = 'comfortable' | 'compact';
export interface TableView {
  v: 1;
  /** visible columns in order; empty = every column */
  columns: string[];
  sort: Array<{ key: string; dir: SortDir }>;
  filter: string;
  groupBy: string | null;
  density: Density;
  selection: string[];
}
export const VIEW_VERSION = 1 as const;
export const defaultView = (): TableView => ({ v: VIEW_VERSION, columns: [], sort: [], filter: '', groupBy: null, density: 'comfortable', selection: [] });

/* ───────────────────────── digests (a client-side change detector, NOT a security digest) ───────────────────────── */

/** FNV-1a 64-bit over the JCS canonical form: two equal records give the same text; a changed record a different one. */
export function stableDigest(value: unknown): string {
  const text = jcsCanonicalize(value);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/* ───────────────────────── comparison, sort, filter, group ───────────────────────── */

const isUnknown = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

/** Compare two known values of a column kind. Instants and dates by time (an unparseable one falls back to text). */
export function compareKnown(a: string | number, b: string | number, kind: ColumnKind = 'text', locale = 'en'): number {
  if (kind === 'number') return Number(a) - Number(b);
  if (kind === 'instant' || kind === 'date') {
    const ta = Date.parse(String(a)); const tb = Date.parse(String(b));
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  return String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: 'base' });
}

/** A STABLE multi-key sort; unknown values last in BOTH directions (an unknown is not the smallest value). */
export function sortRows<T>(rows: readonly T[], columns: ReadonlyArray<ColumnSpec<T>>, sort: TableView['sort'], locale = 'en'): T[] {
  const keys = sort.map((s) => ({ s, c: columns.find((c) => c.key === s.key) })).filter((x) => x.c !== undefined && x.c.sortable !== false);
  if (keys.length === 0) return [...rows];
  const indexed = rows.map((row, i) => ({ row, i }));
  indexed.sort((x, y) => {
    for (const { s, c } of keys) {
      const a = c!.value(x.row); const b = c!.value(y.row);
      const ua = isUnknown(a); const ub = isUnknown(b);
      if (ua && ub) continue;
      if (ua) return 1;
      if (ub) return -1;
      const d = compareKnown(a as string | number, b as string | number, c!.kind, locale);
      if (d !== 0) return s.dir === 'asc' ? d : -d;
    }
    return x.i - y.i;
  });
  return indexed.map((x) => x.row);
}

/** The next sort when a header is activated: none → ascending → descending → none (one key; shift adds a secondary key). */
export function nextSort(sort: TableView['sort'], key: string, additive = false): TableView['sort'] {
  const cur = sort.find((s) => s.key === key);
  const rest = additive ? sort.filter((s) => s.key !== key) : [];
  if (cur === undefined) return [...rest, { key, dir: 'asc' }];
  if (cur.dir === 'asc') return additive ? sort.map((s) => (s.key === key ? { key, dir: 'desc' as const } : s)) : [{ key, dir: 'desc' }];
  return rest;
}

/** aria-sort for a header (only the primary key is announced as sorted, per the ARIA practice). */
export function ariaSort(sort: TableView['sort'], key: string): 'ascending' | 'descending' | 'none' {
  const first = sort[0];
  if (first === undefined || first.key !== key) return 'none';
  return first.dir === 'asc' ? 'ascending' : 'descending';
}

/** The text a filter matches: the column values the user can SEE (unknown reads as "unknown"). */
export function cellText(v: string | number | null | undefined): string {
  return isUnknown(v) ? 'unknown' : String(v);
}

/** Case-insensitive, every whitespace-separated term must match some filterable column. */
export function filterRows<T>(rows: readonly T[], columns: ReadonlyArray<ColumnSpec<T>>, filter: string): T[] {
  const terms = filter.trim().toLowerCase().split(/\s+/).filter((t) => t !== '');
  if (terms.length === 0) return [...rows];
  const cols = columns.filter((c) => c.filterable !== false);
  return rows.filter((r) => {
    const hay = cols.map((c) => cellText(c.value(r)).toLowerCase());
    return terms.every((t) => hay.some((h) => h.includes(t)));
  });
}

export interface Group<T> { key: string; label: string; rows: T[] }
/** Group (after sort): groups keep first-appearance order; the unknown group is named, and last. */
export function groupRows<T>(rows: readonly T[], columns: ReadonlyArray<ColumnSpec<T>>, groupBy: string | null): Array<Group<T>> | null {
  if (groupBy === null) return null;
  const c = columns.find((x) => x.key === groupBy && x.groupable !== false);
  if (c === undefined) return null;
  const map = new Map<string, Group<T>>();
  let unknown: Group<T> | null = null;
  for (const r of rows) {
    const v = c.value(r);
    if (isUnknown(v)) { unknown ??= { key: '\u0000unknown', label: `${c.label}: unknown`, rows: [] }; unknown.rows.push(r); continue; }
    const k = String(v);
    let g = map.get(k);
    if (g === undefined) { g = { key: k, label: `${c.label}: ${k}`, rows: [] }; map.set(k, g); }
    g.rows.push(r);
  }
  return [...map.values(), ...(unknown === null ? [] : [unknown])];
}

export interface ViewResult<T> {
  rows: T[];
  groups: Array<Group<T>> | null;
  counts: { total: number; matched: number; hiddenByFilter: number; selected: number; selectedHidden: number };
  columns: Array<ColumnSpec<T>>;
}
/** THE VIEW: filter → sort → group, with the exact counts; the selection counted against the whole read (a hidden selected row is named). */
export function applyView<T>(rows: readonly T[], columns: ReadonlyArray<ColumnSpec<T>>, view: TableView, rowId: (r: T) => string, locale = 'en'): ViewResult<T> {
  const matched = filterRows(rows, columns, view.filter);
  const sorted = sortRows(matched, columns, view.sort, locale);
  const visible = new Set(sorted.map(rowId));
  const all = new Set(rows.map(rowId));
  const selected = view.selection.filter((id) => all.has(id));
  return {
    rows: sorted,
    groups: groupRows(sorted, columns, view.groupBy),
    counts: {
      total: rows.length, matched: sorted.length, hiddenByFilter: rows.length - sorted.length,
      selected: selected.length, selectedHidden: selected.filter((id) => !visible.has(id)).length,
    },
    columns: visibleColumns(columns, view),
  };
}

export function visibleColumns<T>(columns: ReadonlyArray<ColumnSpec<T>>, view: TableView): Array<ColumnSpec<T>> {
  if (view.columns.length === 0) return [...columns];
  return view.columns.map((k) => columns.find((c) => c.key === k)).filter((c): c is ColumnSpec<T> => c !== undefined);
}

/** The counts in words — exact, never "all", never rounded. */
export function countsText(c: ViewResult<unknown>['counts'], noun = 'rows'): string {
  const parts = [`${c.matched} of ${c.total} ${noun} shown`];
  if (c.hiddenByFilter > 0) parts.push(`${c.hiddenByFilter} hidden by the filter`);
  if (c.selected > 0) parts.push(`${c.selected} selected${c.selectedHidden > 0 ? ` (${c.selectedHidden} of them hidden by the filter)` : ''}`);
  return parts.join(' · ');
}

/* ───────────────────────── windowing ───────────────────────── */

export interface WindowRange { start: number; end: number; padBefore: number; padAfter: number }
/**
 * The rows to render for a scroll position: [start, end) with the spacer heights before and after. Pure arithmetic — a million rows cost the
 * same as ten. A non-positive viewport or row height renders the first page rather than nothing.
 */
export function windowRange(p: { total: number; rowHeight: number; viewportHeight: number; scrollTop: number; overscan?: number }): WindowRange {
  const total = Math.max(0, Math.floor(p.total));
  const rh = p.rowHeight > 0 ? p.rowHeight : 1;
  const vh = p.viewportHeight > 0 ? p.viewportHeight : rh * 20;
  const over = Math.max(0, Math.floor(p.overscan ?? 6));
  const first = Math.min(total, Math.max(0, Math.floor(Math.max(0, p.scrollTop) / rh)));
  const visible = Math.ceil(vh / rh) + 1;
  const start = Math.max(0, first - over);
  const end = Math.min(total, first + visible + over);
  return { start, end, padBefore: start * rh, padAfter: (total - end) * rh };
}

/** Windowing turns on only when it is needed (a short table is rendered whole — every row in the accessibility tree). */
export const WINDOW_THRESHOLD = 200;
export const shouldWindow = (rows: number, threshold = WINDOW_THRESHOLD): boolean => rows > threshold;

/* ───────────────────────── the keyboard grid (roving focus) ───────────────────────── */

export interface GridPos { row: number; col: number }
/**
 * The ARIA grid keyboard model: arrows move one cell, Home/End to the row's ends, Ctrl+Home/End to the grid's corners, PageUp/PageDown by a
 * page. Positions clamp — focus never leaves the grid through an arrow. Row 0 is the header row.
 */
export function gridMove(pos: GridPos, key: string, dims: { rows: number; cols: number; page?: number }, ctrl = false): GridPos {
  const maxR = Math.max(0, dims.rows - 1); const maxC = Math.max(0, dims.cols - 1); const page = Math.max(1, dims.page ?? 10);
  const clamp = (r: number, c: number): GridPos => ({ row: Math.min(maxR, Math.max(0, r)), col: Math.min(maxC, Math.max(0, c)) });
  switch (key) {
    case 'ArrowUp': return clamp(pos.row - 1, pos.col);
    case 'ArrowDown': return clamp(pos.row + 1, pos.col);
    case 'ArrowLeft': return clamp(pos.row, pos.col - 1);
    case 'ArrowRight': return clamp(pos.row, pos.col + 1);
    case 'Home': return ctrl ? clamp(0, 0) : clamp(pos.row, 0);
    case 'End': return ctrl ? clamp(maxR, maxC) : clamp(pos.row, maxC);
    case 'PageUp': return clamp(pos.row - page, pos.col);
    case 'PageDown': return clamp(pos.row + page, pos.col);
    default: return clamp(pos.row, pos.col);
  }
}
/** Mirrors the horizontal arrows under RTL (the visual left is the logical end). */
export const logicalKey = (key: string, dir: 'ltr' | 'rtl'): string =>
  dir === 'rtl' && key === 'ArrowLeft' ? 'ArrowRight' : dir === 'rtl' && key === 'ArrowRight' ? 'ArrowLeft' : key;

/* ───────────────────────── the view record (versioned, digested, reconciled) ───────────────────────── */

/** The navigation-state key a table's view persists under (§SH's `shell.navigation_states`; the integrator wires the port). */
export const viewStateKey = (tableKey: string): string => `table:${tableKey}`;

export function viewDigest(view: TableView): string { return stableDigest(view); }

export interface Reconciled { view: TableView; dropped: string[] }
/**
 * Decode a stored view against TODAY's columns. Anything it cannot honour is DROPPED AND NAMED (an unknown column, sort key or group; a
 * selected id no longer in the read; a version this code does not know) — a restored view never pretends to be what was saved.
 */
export function decodeView(raw: unknown, columnKeys: readonly string[], rowIds?: ReadonlySet<string>): Reconciled {
  const dropped: string[] = [];
  const base = defaultView();
  if (raw === null || typeof raw !== 'object') return { view: base, dropped: raw === null || raw === undefined ? [] : ['the stored view is not a record'] };
  const r = raw as Record<string, unknown>;
  if (r['v'] !== VIEW_VERSION) return { view: base, dropped: [`view version ${String(r['v'])} is not readable by this release (expects ${VIEW_VERSION})`] };
  const known = new Set(columnKeys);
  const cols = Array.isArray(r['columns']) ? r['columns'].filter((x): x is string => typeof x === 'string') : [];
  for (const c of cols) if (!known.has(c)) dropped.push(`column ${c}`);
  const sort = Array.isArray(r['sort']) ? r['sort'] : [];
  const sortOk: TableView['sort'] = [];
  for (const s of sort) {
    const k = (s as { key?: unknown }).key; const d = (s as { dir?: unknown }).dir;
    if (typeof k === 'string' && known.has(k) && (d === 'asc' || d === 'desc')) sortOk.push({ key: k, dir: d });
    else dropped.push(`sort ${String(k)}`);
  }
  const groupBy = typeof r['groupBy'] === 'string' ? (known.has(r['groupBy']) ? r['groupBy'] : (dropped.push(`grouping ${r['groupBy']}`), null)) : null;
  const sel = Array.isArray(r['selection']) ? r['selection'].filter((x): x is string => typeof x === 'string') : [];
  const selOk = rowIds === undefined ? sel : sel.filter((id) => rowIds.has(id) || (dropped.push(`selected ${id} (no longer in this read)`), false));
  return {
    view: {
      v: VIEW_VERSION, columns: cols.filter((c) => known.has(c)), sort: sortOk,
      filter: typeof r['filter'] === 'string' ? r['filter'] : '', groupBy,
      density: r['density'] === 'compact' ? 'compact' : 'comfortable', selection: selOk,
    },
    dropped,
  };
}

/* ───────────────────────── export (the displayed, authorized rows — labelled) ───────────────────────── */

export interface ExportLabel {
  /** e.g. "tenant 0190… / domain 0190…" */ scope: string;
  /** the classification ceiling of the read, or a statement that the read declares none */ classificationCeiling: string;
  /** the instant the rows were read (ISO) */ asOf: string;
}
/** A cell that a spreadsheet would evaluate (=, +, -, @, tab, CR) is prefixed with an apostrophe; quotes doubled; fields with , " or newline quoted. */
export function csvCell(v: string | number | null | undefined): string {
  let s = cellText(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export interface ExportFile { filename: string; text: string; count: number; mime: 'text/csv' }
/**
 * The export: a label block (scope, classification ceiling, as-of, the count and what the rows are), then the header and the rows, in the
 * DISPLAYED order and columns. The count is the number of data rows written — derived, never passed in.
 */
export function exportCsv<T>(rows: readonly T[], columns: ReadonlyArray<ColumnSpec<T>>, label: ExportLabel, name: string): ExportFile {
  const lines: string[] = [];
  lines.push(`# ${name}`);
  lines.push(`# scope: ${label.scope}`);
  lines.push(`# classification ceiling: ${label.classificationCeiling}`);
  lines.push(`# as of: ${label.asOf}`);
  lines.push(`# rows: ${rows.length} (the rows displayed to this principal under the current filter — authorized by the read, nothing more)`);
  lines.push(columns.map((c) => csvCell(c.label)).join(','));
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
  const day = label.asOf.slice(0, 10).replace(/[^0-9-]/g, '') || 'undated';
  return { filename: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${day}.csv`, text: lines.join('\r\n') + '\r\n', count: rows.length, mime: 'text/csv' };
}

/* ───────────────────────── the tree grid (CMP-050) ───────────────────────── */

export interface TreeNode { id: string; label: string; children?: TreeNode[]; values?: Record<string, string | number | null> }
export interface FlatNode { id: string; label: string; level: number; setSize: number; posInSet: number; hasChildren: boolean; expanded: boolean; parentId: string | null; values: Record<string, string | number | null> }
/** Flatten the visible part of a tree (aria-level from 1, aria-setsize / aria-posinset per sibling set). */
export function flattenTree(nodes: readonly TreeNode[], expanded: ReadonlySet<string>, level = 1, parentId: string | null = null): FlatNode[] {
  const out: FlatNode[] = [];
  nodes.forEach((n, i) => {
    const kids = n.children ?? [];
    const open = kids.length > 0 && expanded.has(n.id);
    out.push({ id: n.id, label: n.label, level, setSize: nodes.length, posInSet: i + 1, hasChildren: kids.length > 0, expanded: open, parentId, values: n.values ?? {} });
    if (open) out.push(...flattenTree(kids, expanded, level + 1, n.id));
  });
  return out;
}
/**
 * The treegrid keyboard model on ROWS: Up/Down move; Right expands a closed parent or moves to its first child; Left collapses an open parent
 * or moves to the parent; Home/End to the first/last visible row. Returns the focused id and the expanded set to apply.
 */
export function treeKey(flat: readonly FlatNode[], focusId: string, key: string, expanded: ReadonlySet<string>): { focus: string; expanded: Set<string> } {
  const next = new Set(expanded);
  const i = Math.max(0, flat.findIndex((f) => f.id === focusId));
  const cur = flat[i];
  if (cur === undefined) return { focus: focusId, expanded: next };
  switch (key) {
    case 'ArrowDown': return { focus: flat[Math.min(flat.length - 1, i + 1)]!.id, expanded: next };
    case 'ArrowUp': return { focus: flat[Math.max(0, i - 1)]!.id, expanded: next };
    case 'Home': return { focus: flat[0]!.id, expanded: next };
    case 'End': return { focus: flat[flat.length - 1]!.id, expanded: next };
    case 'ArrowRight':
      if (cur.hasChildren && !cur.expanded) { next.add(cur.id); return { focus: cur.id, expanded: next }; }
      if (cur.hasChildren && cur.expanded && flat[i + 1] !== undefined) return { focus: flat[i + 1]!.id, expanded: next };
      return { focus: cur.id, expanded: next };
    case 'ArrowLeft':
      if (cur.hasChildren && cur.expanded) { next.delete(cur.id); return { focus: cur.id, expanded: next }; }
      return { focus: cur.parentId ?? cur.id, expanded: next };
    default: return { focus: cur.id, expanded: next };
  }
}
