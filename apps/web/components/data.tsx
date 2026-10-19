'use client';
/**
 * CP-6 B80 §CL-D — DATA AND HIGH-DENSITY INSPECTION in the shared library (F-P7-E-05: UX-22-001…-005, CMP-049…056, PAT-18, PAT-28): DataTable,
 * TreeGrid, StructuredList, DefinitionList, Metric, StatisticalSummary, ComparisonMatrix, DiffViewer, BulkSelection. The behaviour is the
 * pure contracts in `lib/table-b80.ts`, `lib/selection-b80.ts` and `lib/inspection-b80.ts` (tested); this file renders them.
 *
 *  - DataTable is a REAL table (caption, scoped headers, aria-sort) — cards below 768 px with every label kept (`.eye-table`). The counts
 *    are exact and live (shown, hidden by the filter, selected — and selected-but-hidden). Sort, filter, group and density change only the
 *    presentation; windowing turns on above 200 rows and keeps the ARIA row count of the WHOLE set; the keyboard grid (roving focus) is
 *    opt-in (a table of links stays a table). Export downloads the DISPLAYED rows, labelled with scope, classification ceiling, as-of, count.
 *  - BulkSelection states included / excluded (with reasons) / hidden by the filter / changed since selection / no longer in the read BEFORE
 *    any action, and the action is reviewed in a consequential Dialog that binds the exact items' digest. Each item is its own governed write
 *    with its own receipt — or its refusal in the server's words; an item with no answer is UNKNOWN, never success.
 *  - Metric, StatisticalSummary, ComparisonMatrix and DiffViewer word what they are given (basis, time, uncertainty, dissent, provenance and
 *    authority on both sides of a diff) and infer nothing: an unknown is UNKNOWN; no ranking without a common basis.
 *
 * Styling: classes in app/globals.css (the B80 cld block), semantic tokens only. CONSTRUCTION only — nothing here is demonstrated or accepted.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ErrorNote, Receipt } from './ui';
import {
  applyView, ariaSort, cellText, countsText, defaultView, exportCsv, flattenTree, gridMove, logicalKey, nextSort, shouldWindow, treeKey, windowRange,
  type ColumnSpec, type ExportLabel, type TableView, type TreeNode,
} from '../lib/table-b80';
import { assessmentText, outcomeText, type Assessment, type Gate, type ItemOutcome } from '../lib/selection-b80';
import {
  CHANGE_MARK, comparisonView, diffCounts, diffRecords, emptyStatement, fmtNumber, metricText, summarize,
  type Criterion, type EmptyInput, type MatrixCell, type MetricInput,
} from '../lib/inspection-b80';

/* ───────────────────────── DataTable ───────────────────────── */

export interface DataColumn<T> extends ColumnSpec<T> {
  /** the cell's rendering (defaults to the value's text; unknown reads "unknown") */ render?: (row: T) => ReactNode;
  /** text alignment (numbers default to the end, tabular figures) */ align?: 'start' | 'end';
}
export interface TableSelection<T> {
  isSelected: (id: string) => boolean;
  onToggle: (row: T) => void;
  /** select / clear exactly the rows SHOWN (the filter's matches) */ onToggleShown: (rows: T[], select: boolean) => void;
  header: 'true' | 'false' | 'mixed';
  rowLabel: (row: T) => string;
}

function HeaderCheckbox({ state, count, onChange }: { state: 'true' | 'false' | 'mixed'; count: number; onChange: (select: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current !== null) ref.current.indeterminate = state === 'mixed'; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === 'true'} aria-checked={state} aria-label={state === 'true' ? `Clear the ${count} rows shown` : `Select the ${count} rows shown (only these rows — not the rows the filter hides)`} onChange={() => onChange(state !== 'true')} />;
}

export function DataTable<T>({
  label, caption, columns, rows, rowId, view: controlled, onViewChange, selection, exportAs, toolbar, grid = false, rowHeight = 40, viewportHeight = 560,
  empty, noun = 'rows', windowThreshold,
}: {
  /** the table's accessible name (its region and its caption's first words) */ label: string;
  caption?: ReactNode;
  columns: Array<DataColumn<T>>;
  rows: readonly T[];
  rowId: (row: T) => string;
  view?: TableView; onViewChange?: (v: TableView) => void;
  selection?: TableSelection<T>;
  /** client-side export of the displayed rows; null hides it (a page without an authorized read to label) */ exportAs?: { name: string; label: ExportLabel } | null;
  toolbar?: ReactNode;
  /** the ARIA grid keyboard model (roving focus over cells); off for tables of links */ grid?: boolean;
  rowHeight?: number; viewportHeight?: number; windowThreshold?: number;
  /** what an empty view says (PAT-28) — scope, evidence status, permission, next step */ empty?: Omit<EmptyInput, 'evidence' | 'hiddenByFilter'> & { evidence?: EmptyInput['evidence'] };
  noun?: string;
}) {
  const [own, setOwn] = useState<TableView>(defaultView());
  const view = controlled ?? own;
  const setView = (v: TableView) => { if (onViewChange !== undefined) onViewChange(v); if (controlled === undefined) setOwn(v); };
  const id = useId();
  const base = useMemo(() => applyView(rows, columns, view, rowId), [rows, columns, view, rowId]);
  /* the selected counts come from the SELECTION the page holds (exact ids), counted against the whole read and against the rows shown */
  const r = useMemo(() => {
    if (selection === undefined) return base;
    const selected = rows.filter((x) => selection.isSelected(rowId(x))).length;
    const shownSelected = base.rows.filter((x) => selection.isSelected(rowId(x))).length;
    return { ...base, counts: { ...base.counts, selected, selectedHidden: selected - shownSelected } };
  }, [base, rows, rowId, selection]);
  const cols = r.columns as Array<DataColumn<T>>; // visibleColumns returns the given column objects
  const groupable = columns.filter((c) => c.groupable === true);
  const windowed = shouldWindow(r.rows.length, windowThreshold);
  const [scrollTop, setScrollTop] = useState(0);
  const win = windowed ? windowRange({ total: r.rows.length, rowHeight, viewportHeight, scrollTop }) : { start: 0, end: r.rows.length, padBefore: 0, padAfter: 0 };
  const colCount = cols.length + (selection !== undefined ? 1 : 0);
  const [pos, setPos] = useState({ row: 0, col: 0 });
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exported, setExported] = useState<string | null>(null);

  /* a key move asks for focus; the target cell may only exist once the window has re-rendered around it, so the request outlives one render */
  const wantFocus = useRef(false);
  useEffect(() => {
    if (!grid || tableRef.current === null || !wantFocus.current) return;
    const el = tableRef.current.querySelector<HTMLElement>(`[data-pos="${pos.row}:${pos.col}"]`);
    if (el !== null) { el.focus(); wantFocus.current = false; }
  });

  const onGridKey = (e: KeyboardEvent) => {
    if (!grid) return;
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dir = (getComputedStyle(e.currentTarget as Element).direction === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
    const next = gridMove(pos, logicalKey(e.key, dir), { rows: r.rows.length + 1, cols: colCount, page: Math.max(1, Math.floor(viewportHeight / rowHeight) - 1) }, e.ctrlKey || e.metaKey);
    wantFocus.current = true;
    setPos(next);
    if (windowed && scrollRef.current !== null && next.row > 0) {
      const top = (next.row - 1) * rowHeight; const el = scrollRef.current;
      if (top < el.scrollTop || top + rowHeight > el.scrollTop + viewportHeight - rowHeight) { el.scrollTop = Math.max(0, top - rowHeight); setScrollTop(el.scrollTop); }
    }
  };
  const cellProps = (row: number, col: number) => grid ? { 'data-pos': `${row}:${col}`, tabIndex: pos.row === row && pos.col === col ? 0 : -1, onFocus: () => setPos({ row, col }) } : {};

  const doExport = () => {
    if (exportAs === undefined || exportAs === null) return;
    const f = exportCsv(r.rows, cols, exportAs.label, exportAs.name);
    const url = URL.createObjectURL(new Blob([f.text], { type: f.mime }));
    const a = document.createElement('a'); a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(`${f.filename}: ${f.count} displayed ${noun}, labelled with the scope, the classification ceiling and the as-of instant`);
  };

  const rowsToRender = r.rows.slice(win.start, win.end);
  const renderRow = (row: T, index: number) => {
    const rid = rowId(row); const ri = index + 1;
    return (
      <tr key={rid} aria-rowindex={windowed || grid ? ri + 1 : undefined} aria-selected={grid && selection !== undefined ? selection.isSelected(rid) : undefined}>
        {selection !== undefined && (
          <td data-label="Select" className="eye-dt-select" {...cellProps(ri, 0)}>
            <input type="checkbox" checked={selection.isSelected(rid)} onChange={() => selection.onToggle(row)} aria-label={`Select ${selection.rowLabel(row)}`} />
          </td>
        )}
        {cols.map((c, ci) => (
          <td key={c.key} data-label={c.label} className={(c.align ?? (c.kind === 'number' ? 'end' : 'start')) === 'end' ? 'eye-cld-num' : undefined} {...cellProps(ri, ci + (selection !== undefined ? 1 : 0))}>
            {c.render !== undefined ? c.render(row) : cellText(c.value(row))}
          </td>
        ))}
      </tr>
    );
  };
  const grouped = r.groups !== null && !windowed;

  return (
    <div className={`eye-dt eye-dt--${view.density}`}>
      <div className="eye-dt-toolbar" role="group" aria-label={`${label}: view controls`}>
        <label className="eye-cld-field">
          <span>Filter</span>
          <input type="search" value={view.filter} onChange={(e) => setView({ ...view, filter: e.target.value })} aria-label={`Filter ${label}`} className="eye-cld-input" />
        </label>
        {groupable.length > 0 && (
          <label className="eye-cld-field">
            <span>Group by</span>
            <select value={view.groupBy ?? ''} onChange={(e) => setView({ ...view, groupBy: e.target.value === '' ? null : e.target.value })} className="eye-cld-input">
              <option value="">No grouping</option>
              {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}
        <label className="eye-cld-field">
          <span>Density</span>
          <select value={view.density} onChange={(e) => setView({ ...view, density: e.target.value === 'compact' ? 'compact' : 'comfortable' })} className="eye-cld-input">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        {exportAs !== undefined && exportAs !== null && (
          <button type="button" className="eye-cld-btn-quiet" onClick={doExport} disabled={r.rows.length === 0}>
            Export the {r.rows.length} displayed {noun} (CSV)
          </button>
        )}
        {toolbar}
      </div>
      <p role="status" className="eye-dt-counts">{countsText(r.counts, noun)}{windowed ? ` · showing rows ${win.start + 1}–${win.end} of ${r.rows.length} as you scroll` : ''}</p>
      {exported !== null && <p role="status" className="eye-dt-counts">Exported {exported}.</p>}
      {r.rows.length === 0 ? (
        <div className="eye-cld-empty" role="note" aria-label={`${label}: nothing shown`}>
          {emptyStatement({
            scope: empty?.scope ?? label, permission: empty?.permission ?? 'partial', nextStep: r.counts.hiddenByFilter > 0 ? 'clear or change the filter' : empty?.nextStep ?? null,
            evidence: r.counts.hiddenByFilter > 0 ? 'filtered_out' : empty?.evidence ?? 'none_recorded', hiddenByFilter: r.counts.hiddenByFilter,
          }).map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        <div ref={scrollRef} className={`eye-dt-scroll${windowed ? ' eye-dt-scroll--windowed' : ''}`} role="region" aria-label={label} tabIndex={0}
          style={windowed ? { maxBlockSize: `${viewportHeight}px` } : undefined}
          onScroll={windowed ? (e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop) : undefined}>
          <table ref={tableRef} className="eye-table eye-dt-table" role={grid ? 'grid' : undefined} aria-rowcount={windowed || grid ? r.rows.length + 1 : undefined}
            aria-multiselectable={grid && selection !== undefined ? true : undefined} aria-labelledby={`${id}-cap`} onKeyDown={onGridKey}>
            <caption id={`${id}-cap`}>{caption ?? label}</caption>
            <thead>
              <tr aria-rowindex={windowed || grid ? 1 : undefined}>
                {selection !== undefined && (
                  <th scope="col" className="eye-dt-select" {...cellProps(0, 0)}>
                    <HeaderCheckbox state={selection.header} count={r.rows.length} onChange={(sel) => selection.onToggleShown(r.rows, sel)} />
                  </th>
                )}
                {cols.map((c, ci) => {
                  const s = ariaSort(view.sort, c.key);
                  return (
                    <th key={c.key} scope="col" aria-sort={c.sortable === false ? undefined : s} className={(c.align ?? (c.kind === 'number' ? 'end' : 'start')) === 'end' ? 'eye-cld-num' : undefined} {...cellProps(0, ci + (selection !== undefined ? 1 : 0))}>
                      {c.sortable === false ? c.label : (
                        <button type="button" className="eye-dt-sort" tabIndex={grid ? -1 : 0}
                          onClick={(e) => setView({ ...view, sort: nextSort(view.sort, c.key, e.shiftKey) })}
                          aria-label={`${c.label}: ${s === 'none' ? 'not sorted' : `sorted ${s}`} — activate to sort${s === 'ascending' ? ' descending' : s === 'descending' ? ' off' : ' ascending'}`}>
                          {c.label} <span aria-hidden="true">{s === 'ascending' ? '▲' : s === 'descending' ? '▼' : '↕'}</span>
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {win.padBefore > 0 && <tr aria-hidden="true" className="eye-dt-spacer"><td colSpan={colCount} style={{ blockSize: `${win.padBefore}px` }} /></tr>}
              {grouped
                ? r.groups!.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="eye-dt-group"><th scope="colgroup" colSpan={colCount}>{g.label} — {g.rows.length} {noun}</th></tr>
                      {g.rows.map((row) => renderRow(row, r.rows.indexOf(row)))}
                    </Fragment>
                  ))
                : rowsToRender.map((row, i) => renderRow(row, win.start + i))}
              {win.padAfter > 0 && <tr aria-hidden="true" className="eye-dt-spacer"><td colSpan={colCount} style={{ blockSize: `${win.padAfter}px` }} /></tr>}
            </tbody>
          </table>
        </div>
      )}
      {r.groups !== null && windowed && <p className="eye-dt-counts">Grouping is not applied above {windowThreshold ?? 200} rows (windowed); the rows are sorted and filtered.</p>}
    </div>
  );
}

/* ───────────────────────── TreeGrid (CMP-050) ───────────────────────── */

export function TreeGrid({ label, columns, nodes, defaultExpanded = [] }: {
  label: string; columns: Array<{ key: string; label: string }>; nodes: TreeNode[]; defaultExpanded?: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(defaultExpanded));
  const flat = flattenTree(nodes, expanded);
  const [focus, setFocus] = useState<string>(flat[0]?.id ?? '');
  const ref = useRef<HTMLTableElement>(null);
  useEffect(() => { if (ref.current?.contains(document.activeElement)) ref.current.querySelector<HTMLElement>(`[data-node="${CSS.escape(focus)}"]`)?.focus(); }, [focus, expanded]);
  return (
    <div className="eye-dt-scroll" role="region" aria-label={label} tabIndex={-1}>
      <table ref={ref} role="treegrid" aria-label={label} className="eye-table eye-tree"
        onKeyDown={(e) => {
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const dir = getComputedStyle(e.currentTarget).direction === 'rtl' ? 'rtl' : 'ltr';
          const k = treeKey(flat, focus, logicalKey(e.key, dir), expanded);
          setExpanded(k.expanded); setFocus(k.focus);
        }}>
        <thead><tr><th scope="col">{label}</th>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {flat.map((n) => (
            <tr key={n.id} data-node={n.id} tabIndex={n.id === focus ? 0 : -1} aria-level={n.level} aria-setsize={n.setSize} aria-posinset={n.posInSet}
              aria-expanded={n.hasChildren ? n.expanded : undefined} onFocus={() => setFocus(n.id)}
              onClick={() => { setFocus(n.id); if (n.hasChildren) { const x = new Set(expanded); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); setExpanded(x); } }}>
              <td data-label={label} className={`eye-tree-cell eye-tree-l${Math.min(n.level, 6)}`}>
                <span aria-hidden="true" className="eye-tree-glyph">{n.hasChildren ? (n.expanded ? '▾' : '▸') : '·'}</span> {n.label}
              </td>
              {columns.map((c) => <td key={c.key} data-label={c.label}>{cellText(n.values[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── StructuredList, DefinitionList ───────────────────────── */

export function StructuredList({ label, items }: { label: string; items: Array<{ id: string; title: ReactNode; meta?: ReactNode; badges?: ReactNode; description?: ReactNode }> }) {
  if (items.length === 0) return <p className="eye-cld-empty">{label}: no item recorded.</p>;
  return (
    <ul className="eye-slist" aria-label={label}>
      {items.map((i) => (
        <li key={i.id} className="eye-slist-item">
          <div className="eye-slist-title">{i.title}</div>
          {i.badges !== undefined && <div className="eye-cld-badges">{i.badges}</div>}
          {i.meta !== undefined && <div className="eye-slist-meta">{i.meta}</div>}
          {i.description !== undefined && <div className="eye-slist-desc">{i.description}</div>}
        </li>
      ))}
    </ul>
  );
}

/** A definition list; a value marked `copy` gets a copy control whose "copied" is said only after the clipboard accepted it. */
export function DefinitionList({ items, label }: { label?: string; items: Array<{ term: string; value: ReactNode; mono?: boolean; copy?: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <>
      <dl className="eye-dl" aria-label={label}>
        {items.map((i) => (
          <div className="eye-dl-row" key={i.term}>
            <dt>{i.term}</dt>
            <dd>
              {i.mono === true ? <bdi className="eye-mono-wrap">{i.value}</bdi> : i.value}
              {i.copy !== undefined && (
                <button type="button" className="eye-cld-btn-quiet eye-cld-btn-sm" aria-label={`Copy ${i.term}`}
                  onClick={() => { void navigator.clipboard.writeText(i.copy!).then(() => setCopied(`${i.term} copied`), () => setCopied(`${i.term} could not be copied — select the text instead`)); }}>
                  Copy
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {copied !== null && <p role="status" className="eye-dt-counts">{copied}</p>}
    </>
  );
}

/* ───────────────────────── Metric, StatisticalSummary ───────────────────────── */

export function Metric(props: MetricInput) {
  const m = metricText(props);
  const known = m.state === 'MEASURED' || m.state === 'ESTIMATED';
  return (
    <figure className={`eye-metric${known ? '' : ' eye-metric--unknown'}`} aria-label={m.ariaLabel}>
      <figcaption className="eye-metric-label">{props.label}</figcaption>
      <div className="eye-metric-value"><span className="eye-cld-num">{m.value}</span>{known && m.unit !== '' && <span className="eye-metric-unit"> {m.unit}</span>}</div>
      <div className="eye-metric-meta">{known ? (m.state === 'ESTIMATED' ? '◇ ESTIMATED' : '● MEASURED') : '◍ ' + m.state} · {m.basis} · as of {m.asOf}</div>
      <div className="eye-metric-meta">{m.uncertainty}</div>
    </figure>
  );
}

export function StatisticalSummary({ label, values, unit, locale = 'en' }: { label: string; values: ReadonlyArray<number | null | undefined>; unit?: string; locale?: string }) {
  const s = summarize(values);
  const f = (v: number | null) => (v === null ? 'not computed' : `${fmtNumber(v, locale, 2)}${unit !== undefined ? ` ${unit}` : ''}`);
  const rows: Array<[string, string]> = [['n', String(s.n)], ['missing', String(s.missing)], ['minimum', f(s.min)], ['lower quartile', f(s.q1)], ['median', f(s.median)],
    ['mean', f(s.mean)], ['upper quartile', f(s.q3)], ['maximum', f(s.max)], ['standard deviation', f(s.sd)]];
  return (
    <div className="eye-summary">
      <table className="eye-table">
        <caption>{label}</caption>
        <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td data-label={k} className="eye-cld-num">{v}</td></tr>)}</tbody>
      </table>
      {s.notes.length > 0 && <ul className="eye-cld-reasons" aria-label={`${label}: what the summary does not compute`}>{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}

/* ───────────────────────── ComparisonMatrix, DiffViewer ───────────────────────── */

export function ComparisonMatrix({ label, options, criteria, cells, locale = 'en' }: {
  label: string; options: Array<{ id: string; label: string }>; criteria: Criterion[]; cells: Record<string, Record<string, MatrixCell | undefined>>; locale?: string;
}) {
  const v = comparisonView(options, criteria, cells, locale);
  return (
    <div className="eye-dt-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="eye-table eye-matrix">
        <caption>{label} — a best value is marked only on a common basis with a declared direction; nothing else is ranked</caption>
        <thead><tr><th scope="col">Criterion</th>{options.map((o) => <th key={o.id} scope="col">{o.label}</th>)}</tr></thead>
        <tbody>
          {v.rows.map((row) => (
            <tr key={row.criterion.key}>
              <th scope="row">{row.criterion.label}<div className={row.common ? 'eye-cell-note' : 'eye-cell-note eye-cell-note--warn'}>{row.basisNote}</div></th>
              {options.map((o) => {
                const c = row.cells[o.id]!;
                return (
                  <td key={o.id} data-label={o.label} className={c.best ? 'eye-cell-best' : c.assessed ? undefined : 'eye-cell-na'}>
                    <span className="eye-cld-num">{c.text}</span>
                    {c.best && <div className="eye-cell-note">★ BEST ({row.criterion.better} is better)</div>}
                    {c.assessed && <div className="eye-cell-note">{c.uncertainty}</div>}
                    {c.dissent !== null && <div className="eye-cell-note eye-cell-note--warn">⚑ DISSENT — {c.dissent}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DiffSide { record: Record<string, unknown> | null; title: string; source: string; author: string | null; at: string | null; authority: string }
export function DiffViewer({ label, before, after, fields = [] }: { label: string; before: DiffSide; after: DiffSide; fields?: Array<{ key: string; label: string }> }) {
  const rows = diffRecords(before.record, after.record, fields);
  const counts = diffCounts(rows);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const shown = showUnchanged ? rows : rows.filter((r) => r.kind !== 'unchanged');
  const side = (s: DiffSide) => `${s.title} · ${s.source} · ${s.author ?? 'author not recorded'} · ${s.at ?? 'time not recorded'} · authority: ${s.authority}`;
  return (
    <div className="eye-diff">
      <p className="eye-dt-counts">{counts.changed} changed · {counts.added} added · {counts.removed} removed · {counts.unchanged} unchanged{showUnchanged ? '' : ' (hidden)'}</p>
      <button type="button" className="eye-cld-btn-quiet" aria-pressed={showUnchanged} onClick={() => setShowUnchanged((v) => !v)}>
        {showUnchanged ? 'Hide' : 'Show'} the {counts.unchanged} unchanged fields
      </button>
      <div className="eye-dt-scroll" role="region" aria-label={label} tabIndex={0}>
        <table className="eye-table">
          <caption>{label}</caption>
          <thead>
            <tr><th scope="col">Field</th><th scope="col">Before — {side(before)}</th><th scope="col">After — {side(after)}</th><th scope="col">Change</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className={`eye-diff-${r.kind}`}>
                <th scope="row">{r.label}</th>
                <td data-label="Before"><bdi className="eye-mono-wrap">{r.before}</bdi></td>
                <td data-label="After"><bdi className="eye-mono-wrap">{r.after}</bdi></td>
                <td data-label="Change">{CHANGE_MARK[r.kind].glyph} {CHANGE_MARK[r.kind].word}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── BulkSelection (PAT-18) ───────────────────────── */

/**
 * The bulk panel: the assessment in words and in lists BEFORE any action; the gate's reasons when the action is not available; "accept the
 * current state" when rows changed or left the read; the per-item outcomes (a receipt each, or the server's words) after a run.
 */
export function BulkSelection({ noun, assessment, gate, onAcceptCurrent, onReview, onClear, reviewLabel, outcomes, children }: {
  noun: string; assessment: Assessment; gate: Gate; onAcceptCurrent: () => void; onReview: () => void; onClear: () => void;
  /** the review control's label, e.g. "Review the suspension of 3 sources" */ reviewLabel: string;
  outcomes?: ItemOutcome[] | null; /** the action's parameters (choice, reason) */ children?: ReactNode;
}) {
  const id = useId();
  const a = assessment;
  const list = (title: string, items: Array<{ id: string; label: string; note?: string }>, cls = '') => items.length === 0 ? null : (
    <div className={`eye-bulk-list ${cls}`}>
      <h3 className="eye-bulk-h">{title} ({items.length})</h3>
      <ul>{items.map((i) => <li key={i.id}><bdi className="eye-mono-wrap">{i.label}</bdi>{i.note !== undefined && <> — {i.note}</>}</li>)}</ul>
    </div>
  );
  return (
    <section className="eye-surface eye-surface--raised eye-bulk" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="eye-panel-title">Bulk selection — {noun}</h2>
      <p role="status" className="eye-bulk-counts">{assessmentText(a)}</p>
      <div className="eye-bulk-grid">
        {list('Included — the action applies to these', a.included)}
        {list('Excluded — with the reason', a.excluded.map((x) => ({ id: x.id, label: x.label, note: x.reason })), 'eye-bulk-list--warn')}
        {list('Hidden by the filter — selected, not acted on until shown', a.hidden)}
        {list('Changed since selection', a.changed.map((x) => ({ id: x.id, label: x.label, note: `was ${x.fingerprint}, now ${x.now}` })), 'eye-bulk-list--warn')}
        {list('No longer in this read — never acted on', a.missing, 'eye-bulk-list--warn')}
      </div>
      {children}
      <div className="eye-cld-badges">
        {(a.counts.changed > 0 || a.counts.missing > 0) && <button type="button" className="eye-cld-btn-quiet" onClick={onAcceptCurrent}>Accept the current state of the selection</button>}
        <button type="button" className="eye-cld-btn" onClick={onReview} disabled={!gate.allowed} aria-describedby={gate.allowed ? undefined : `${id}-why`}>{reviewLabel}</button>
        <button type="button" className="eye-cld-btn-quiet" onClick={onClear}>Clear the selection</button>
      </div>
      {!gate.allowed && <ul id={`${id}-why`} className="eye-cld-reasons" aria-label="Why the action is not available">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {outcomes !== undefined && outcomes !== null && outcomes.length > 0 && (
        <div className="eye-bulk-results">
          <h3 className="eye-bulk-h">Per-item answers</h3>
          <p role="status">{outcomeText(outcomes)}</p>
          <ul>
            {outcomes.map((o) => (
              <li key={o.id}>
                <bdi className="eye-mono-wrap">{o.label}</bdi> — {o.outcome === 'committed' ? 'COMMITTED' : o.outcome === 'refused' ? 'REFUSED' : o.outcome === 'unknown' ? 'UNKNOWN — re-read before acting again' : `NOT ATTEMPTED — ${o.reason}`}
                {o.outcome === 'committed' && <Receipt receipt={o.receipt} />}
                {(o.outcome === 'refused' || o.outcome === 'unknown') && <ErrorNote error={o.error} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
