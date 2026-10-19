'use client';
/**
 * CP-6 B82 §CF — THE QUANTITATIVE CHARTS of the evidence-bearing visualization library (F-P7-E-21: CMP-058 ChartLegend, CMP-059 DataTooltip,
 * VIZ-36 AccessibleAlternative, CMP-060 / VIZ-01 TimeSeries, VIZ-02 EventTimeline, CMP-061 / VIZ-03 ProbabilityBand, VIZ-04 HorizonMatrix,
 * VIZ-08 Distribution, VIZ-09 CalibrationPlot, VIZ-22 Waterfall, VIZ-23 VarianceBridge, VIZ-24 CorrelationMatrix, VIZ-25 Scatter, VIZ-26
 * ControlChart; GLB-07). Every chart COMPOSES components/chart-frame.tsx's ChartFrame with a ChartSpec that passes the grammar (lib/chart-b82
 * chartGrammar): a chart missing a declaration is refused in words, never drawn.
 *
 *  - DESIGN D3: hand-written SVG; every coordinate comes from lib/chart-b82.ts (pure, unit-tested). No chart library, no dependency.
 *  - DESIGN D5: no colour token is added — series are told apart by DASH PATTERN, MARKER SHAPE and DIRECT LABEL; a legend entry's `token` is a
 *    token name (`color.*`, rendered as its CSS custom property) and is never the only channel. Text wears ink tokens, never a series colour.
 *  - ONE VALUE AXIS per chart (never two scales); thin 2-unit lines; recessive grid; counts start at zero; gaps drawn as gaps; bands, not lines.
 *  - THE TABLE ALTERNATIVE is always rendered (ChartFrame → AccessibleAlternative) from the SAME rows the drawing uses; the DataTooltip's
 *    lines are that row's cells (CMP-059: it mirrors the table row), plus the chart's source and uncertainty.
 *  - KEYBOARD: an interactive chart's points are buttons in ONE tab stop (roving tabindex); arrows move (mirrored in RTL), Home / End to the
 *    ends, Enter / Space pins the value, Escape dismisses it. Pointer hover shows the same tooltip. Focus is always visible (the focus token).
 *  - The drawing's geometry is left-to-right (the plot is `dir="ltr"`: a time axis is not mirrored); every text outside the plot follows
 *    the page's direction. Forced colours: the strokes and marks take CanvasText, the band a hatch (globals.css `B82 cf`).
 *
 * The charts read nothing themselves: a page passes the values its existing read returned, and the spec's declarations name that read.
 * CONSTRUCTION only — each component arrives `proposed` in B107's inventory; the DSA approves it in the act; nothing here is demonstrated.
 */
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DataTable, type DataColumn } from './data';
import { ChartFrame, type ChartStatus } from './chart-frame';
import type { AlternativeColumn, AlternativeRow, ChartSource, ChartSpec, DashPattern, LegendEntry, MarkerShape } from '../lib/b82-seams';
import type { ExportLabel } from '../lib/table-b80';
import {
  bridgeGeometry, bridgeRows, bridgeSteps, calibrationGeometry, calibrationRows, chartNumber, controlRows, correlationMatrix, DASH_ARRAY,
  distributionBinRows, distributionPercentileRows, eventTimelineGeometry, eventTimelineRows, extentOf, histogram, histogramGeometry, horizonMatrixRows,
  horizonRowScale, linearScale, markerPath, meets, nextPointIndex, niceDomain, pathOf, percentileGeometry, plotBox, probabilityBandGeometry,
  probabilityBandRows, rowLines, rowText, scatterGeometry, scatterRows, SERIES_IDENTITIES, timeSeriesGeometry, timeSeriesRows, timeTicks, toInstant,
  type BandPointIn, type Box, type CalibrationPointIn, type ControlLimitIn, type CorrelationCellIn, type HorizonRowIn, type PercentileItemIn,
  type ScatterLine, type ScatterPointIn, type SeriesIn, type TimelineEventIn,
} from '../lib/chart-b82';

/* ───────────────────────── shared pieces ───────────────────────── */

/** A token NAME (`color.uncertain`) as its CSS custom property; anything else is ignored (never a raw colour). */
const tokenVar = (token: string | undefined): string | undefined => (token !== undefined && /^color\.[a-z0-9.-]+$/.test(token) ? `var(--eye-${token.replace(/\./g, '-')})` : undefined);
/** The identity of a series: its legend entry by key, else the fixed identity order. */
function identityOf(legend: readonly LegendEntry[], key: string, i: number): { dash: DashPattern; marker: MarkerShape; label: string; token?: string } {
  const e = legend.find((x) => x.key === key);
  if (e !== undefined) return { dash: e.dash, marker: e.marker, label: e.label, ...(e.token === undefined ? {} : { token: e.token }) };
  const s = SERIES_IDENTITIES[i % SERIES_IDENTITIES.length]!;
  return { ...s, label: key };
}
function sourceLine(s: ChartSource): string {
  if ('specimen' in s) return `SYNTHETIC specimen — ${s.specimen}`;
  if ('citation' in s) return `${s.label} (${s.citation.kind} ${s.citation.id.slice(0, 8)}… v${s.citation.version})`;
  return `${s.label} (${s.read})`;
}
const dashOf = (d: DashPattern): string | undefined => DASH_ARRAY[d] ?? undefined;

function XAxis({ box, ticks }: { box: Box; ticks: ReadonlyArray<{ x: number; label: string }> }) {
  const y = box.top + box.innerHeight;
  return (
    <g className="eye-cf-axis" aria-hidden="true">
      <line x1={box.left} x2={box.left + box.innerWidth} y1={y} y2={y} />
      {ticks.map((t, i) => (
        <g key={`${t.label}-${i}`}>
          <line x1={t.x} x2={t.x} y1={y} y2={y + 4} />
          <text x={t.x} y={y + 18} textAnchor="middle">{t.label}</text>
        </g>
      ))}
    </g>
  );
}
function YAxis({ box, ticks, grid = true }: { box: Box; ticks: ReadonlyArray<{ y: number; label: string }>; grid?: boolean }) {
  return (
    <g className="eye-cf-axis" aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={`${t.label}-${i}`}>
          {grid ? <line className="eye-cf-grid" x1={box.left} x2={box.left + box.innerWidth} y1={t.y} y2={t.y} /> : null}
          <text x={box.left - 6} y={t.y + 4} textAnchor="end">{t.label}</text>
        </g>
      ))}
    </g>
  );
}
function Marker({ shape, x, y, r = 4, className = 'eye-cf-marker' }: { shape: MarkerShape; x: number; y: number; r?: number; className?: string }) {
  const d = markerPath(shape, x, y, r);
  return d === '' ? null : <path className={className} data-shape={shape} d={d} />;
}
/** The base drawing: an SVG on the plot box (aria-hidden — the points layer and the table carry the values). */
function Drawing({ box, children, overlay }: { box: Box; children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="eye-cf-plot" dir="ltr">
      <svg className="eye-cf-svg" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true" focusable="false">{children}</svg>
      {overlay}
    </div>
  );
}

/* ───────────────────────── ChartLegend (CMP-058) ───────────────────────── */

/**
 * THE CHART LEGEND: each series as its line (dash pattern), its marker shape and its label — never colour alone (D5). A token colour, when
 * declared, is a second channel. B80's symbol Legend (symbols.tsx) stays the glyph legend; this is the series legend.
 */
export function ChartLegend({ entries, label }: { entries: readonly LegendEntry[]; label: string }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <ul className="eye-cf-legend" aria-label={label}>
      {entries.map((e) => (
        <li key={e.key} data-dash={e.dash} data-marker={e.marker}>
          <svg className="eye-cf-swatch" viewBox="0 0 28 12" width="28" height="12" aria-hidden="true" focusable="false" style={{ color: tokenVar(e.token) }}>
            {e.marker === 'none' && e.dash === 'solid' && e.token !== undefined
              ? <rect className="eye-cf-swatch-fill" x="1" y="2" width="26" height="8" />
              : <line x1="1" x2="27" y1="6" y2="6" strokeDasharray={dashOf(e.dash)} />}
            <Marker shape={e.marker} x={14} y={6} r={3.5} />
          </svg>
          <span>{e.label}</span>
          <span className="eye-visually-hidden"> — drawn {e.dash === 'solid' ? 'as a solid line' : `${e.dash.replace('-', ' and ')}`}{e.marker === 'none' ? '' : ` with ${e.marker} markers`}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── DataTooltip (CMP-059) ───────────────────────── */

export interface TooltipPoint { x: number; y: number; row: number }
/**
 * THE DATA TOOLTIP and its POINTS LAYER: an overlay on the drawing (the same viewBox) whose points are keyboard-focusable buttons (ONE tab
 * stop, roving tabindex); the tooltip shows the point's TABLE ROW (value + units + time, in the table's column order) with the chart's
 * source and uncertainty, and is dismissed by Escape or its Close control. Hover shows the same. Nothing is shown that the table does not hold.
 */
export function DataTooltip({ spec, rows, box, points, label }: { spec: ChartSpec; rows: readonly AlternativeRow[]; box: Box; points: readonly TooltipPoint[]; label: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const tipId = useId();
  const columns = spec.alternative.columns;
  const ordered = useMemo(() => points.map((p, i) => ({ ...p, i })).sort((a, b) => a.x - b.x || a.y - b.y), [points]);
  if (ordered.length === 0) return null;
  const focusAt = (i: number, el: Element | null) => {
    setActive(i); setOpen(i);
    const g = el?.closest('svg')?.querySelector<SVGGElement>(`[data-point="${i}"]`); g?.focus();
  };
  const onKey = (e: KeyboardEvent<SVGGElement>, i: number) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(null); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(open === i ? null : i); return; }
    /* the page's direction (the plot itself is drawn left-to-right): in RTL the arrow keys mirror */
    const frame = e.currentTarget.closest('.eye-cf') ?? document.documentElement;
    const dir = (getComputedStyle(frame).direction === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
    const n = nextPointIndex(i, e.key, ordered.length, dir);
    if (n === null) return;
    e.preventDefault(); focusAt(n, e.currentTarget);
  };
  const shown = open === null ? null : ordered[open] ?? null;
  const row = shown === null ? null : rows[shown.row] ?? null;
  const unc = spec.uncertainty?.statement;
  return (
    <>
      <svg className="eye-cf-overlay" viewBox={`0 0 ${box.width} ${box.height}`} role="list" aria-label={label}>
        {ordered.map((p, i) => {
          const r = rows[p.row];
          return (
            <g key={`${p.row}-${i}`} role="listitem">
              <g role="button" tabIndex={i === active ? 0 : -1} data-point={i} data-active={open === i ? 'true' : undefined} className="eye-cf-hit"
                aria-label={r === undefined ? 'a point with no table row' : rowText(r, columns)} aria-expanded={open === i} aria-controls={open === i ? tipId : undefined}
                onFocus={() => { setActive(i); }} onClick={() => setOpen(open === i ? null : i)} onKeyDown={(e) => onKey(e, i)}
                onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen((o) => (o === i ? null : o))}>
                <circle cx={p.x} cy={p.y} r={11} className="eye-cf-hit-area" />
                <circle cx={p.x} cy={p.y} r={7} className="eye-cf-ring" />
              </g>
            </g>
          );
        })}
      </svg>
      {shown !== null && row !== null ? (
        <div id={tipId} className="eye-cf-tooltip" role="status" style={{ insetInlineStart: `${(shown.x / box.width) * 100}%`, insetBlockStart: `${(shown.y / box.height) * 100}%` }}
          data-side={shown.x / box.width > 0.6 ? 'before' : 'after'}>
          <dl>
            {rowLines(row, columns).map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}
            <div><dt>Source</dt><dd>{spec.sources.map(sourceLine).join('; ')}</dd></div>
            {unc === undefined ? null : <div><dt>Uncertainty</dt><dd>{unc}</dd></div>}
          </dl>
          <button type="button" className="eye-cf-tooltip-close" onClick={() => setOpen(null)}>Close</button>
        </div>
      ) : null}
    </>
  );
}

/* ───────────────────────── AccessibleAlternative (VIZ-36) ───────────────────────── */

interface Keyed { i: number; r: AlternativeRow }
/**
 * THE ACCESSIBLE DATA ALTERNATIVE: the text summary first, the table (B80's DataTable: a real table, caption, scoped headers, a named
 * focusable region — the same rows the drawing uses, every unknown "unknown"), the definitions, the units in the column headers, and the
 * downloadable data (B80's exportCsv over the DISPLAYED rows) when the page labels its read. ChartFrame renders it always — never behind a toggle.
 */
export function AccessibleAlternative({ spec, rows, title, summaryId, exportAs }: {
  spec: ChartSpec; rows: readonly AlternativeRow[]; title: string; summaryId?: string; exportAs?: ExportLabel;
}) {
  const keyed = useMemo<Keyed[]>(() => rows.map((r, i) => ({ i, r })), [rows]);
  const columns = useMemo<Array<DataColumn<Keyed>>>(() => (Array.isArray(spec?.alternative?.columns) ? spec.alternative.columns : []).map((c: AlternativeColumn) => ({
    key: c.key,
    label: c.unit !== undefined && c.unit !== '' ? `${c.label} (${c.unit})` : c.label,
    kind: c.kind === 'state' ? 'text' : c.kind,
    value: (x: Keyed) => x.r[c.key] ?? null,
    sortable: true,
  })), [spec]);
  return (
    <section className="eye-cf-alternative" aria-label={`Table alternative: ${title}`}>
      <p id={summaryId} className="eye-cf-summary">{spec.alternative.summary}</p>
      <DataTable<Keyed>
        label={`Table alternative: ${title}`}
        columns={columns}
        rows={keyed}
        rowId={(x) => String(x.i)}
        exportAs={exportAs === undefined ? null : { name: title, label: exportAs }}
        noun="rows"
      />
      {spec.alternative.definitions !== undefined && spec.alternative.definitions.length > 0 && (
        <dl className="eye-cf-definitions" aria-label={`${title}: definitions`}>
          {spec.alternative.definitions.map((d) => <div key={d.term}><dt>{d.term}</dt><dd>{d.definition}</dd></div>)}
        </dl>
      )}
    </section>
  );
}

/** The props every chart shares (the frame's optional additions passed through). */
interface Common { spec: ChartSpec; exportAs?: ExportLabel; status?: ChartStatus }
const frameProps = (c: Common) => ({ ...(c.exportAs === undefined ? {} : { exportAs: c.exportAs }), ...(c.status === undefined ? {} : { status: c.status }) });
const gapText = (g: { x0: number; x1: number; reason: string }, i: number) => `${i + 1}: ${g.reason === 'missing_value' ? 'a missing value' : 'a missing interval (wider than the declared cadence)'}`;

/* ───────────────────────── TimeSeries (CMP-060, VIZ-01) ───────────────────────── */

/**
 * A TIME SERIES: one value axis, the declared time basis on the other; each series by its legend identity (dash, marker) and labelled at its
 * end; a missing value or a missing interval is DRAWN AS A GAP (an outlined, hatched span) and stated — a line never crosses what was not
 * observed (VIZ-01). `levels` makes an ordinal state series (steps; the ticks are the states' words).
 */
export function TimeSeries({ spec, series, cadenceMs, levels, includeZero, exportAs, status }: Common & {
  series: readonly SeriesIn[]; /** the declared cadence (ms): a wider step is a missing interval */ cadenceMs?: number | null; levels?: readonly string[]; includeZero?: boolean;
}) {
  const rows = useMemo(() => timeSeriesRows(series, levels), [series, levels]);
  const g = useMemo(() => timeSeriesGeometry(series, { cadenceMs: cadenceMs ?? null, ...(levels === undefined ? {} : { levels }), ...(includeZero === undefined ? {} : { includeZero }) }), [series, cadenceMs, levels, includeZero]);
  const b = g.box;
  const notes = g.gaps.length === 0 ? <p className="eye-help">No gap in the drawn series{cadenceMs ? ' at the declared cadence' : ''}.</p>
    : <p className="eye-help">{g.gaps.length} gap(s) drawn as gaps, never interpolated — {g.gaps.map(gapText).join('; ')}. Each missing value is a row reading “unknown” in the table.</p>;
  return (
    <ChartFrame spec={spec} rows={rows} interactive notes={notes} {...frameProps({ spec, exportAs, status })}
      {...(g.empty ? { status: status ?? { state: 'empty' as const, statement: 'the read returned no timed value' } } : {})}>
      {g.empty ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.series.flatMap((s) => s.points)} label={`${spec.title}: points`} />}>
          <YAxis box={b} ticks={g.yTicks} />
          <XAxis box={b} ticks={g.xTicks} />
          {g.gaps.map((gap, i) => <rect key={i} className="eye-cf-gap" x={Math.min(gap.x0, gap.x1)} y={b.top} width={Math.max(2, Math.abs(gap.x1 - gap.x0))} height={b.innerHeight} data-reason={gap.reason} />)}
          {g.series.map((s, i) => {
            const id = identityOf(spec.legend, s.key, i);
            return (
              <g key={s.key} className="eye-cf-series-group" style={{ color: tokenVar(id.token) }}>
                <path className="eye-cf-series" d={s.d} strokeDasharray={dashOf(id.dash)} />
                {s.points.map((p) => <Marker key={p.row} shape={id.marker} x={p.x} y={p.y} />)}
                {s.label !== null && g.series.length > 1 ? <text className="eye-cf-direct" x={Math.min(b.left + b.innerWidth - 2, s.label.x + 6)} y={s.label.y - 6} textAnchor="end">{id.label}</text> : null}
              </g>
            );
          })}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── EventTimeline (VIZ-02) ───────────────────────── */

/**
 * AN EVENT TIMELINE: ordered events and decisions on ONE declared time (event or record — the spec says which; a chronology always declares
 * its basis), each with its actor, source and correction; a corrected event is a diamond with its correction in its row. An event with no
 * time on the declared basis is not placed and is listed last in the table, counted in the notes (never dropped).
 */
export function EventTimeline({ spec, events, exportAs, status }: Common & { events: readonly TimelineEventIn[] }) {
  const rows = useMemo(() => eventTimelineRows(events), [events]);
  const g = useMemo(() => eventTimelineGeometry(events), [events]);
  const b = g.box;
  const corrected = g.marks.filter((m) => m.corrected).length;
  const notes = <p className="eye-help">{g.marks.length} event(s) placed on {spec.time.basis} time{corrected > 0 ? `, ${corrected} with a correction recorded (diamonds)` : ''}{g.unplaced > 0 ? `; ${g.unplaced} have no ${spec.time.basis} time and are listed last in the table, not placed` : ''}.</p>;
  return (
    <ChartFrame spec={spec} rows={rows} interactive notes={notes} {...frameProps({ spec, exportAs, status })}
      {...(g.marks.length === 0 && events.length === 0 ? { status: status ?? { state: 'empty' as const, statement: 'no event in the window' } } : {})}>
      {g.marks.length === 0 ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.marks.map((m) => ({ x: m.x, y: m.y, row: m.row }))} label={`${spec.title}: events`} />}>
          <XAxis box={b} ticks={g.xTicks} />
          {Array.from({ length: g.lanes }, (_, i) => { const y = b.top + (b.innerHeight / g.lanes) * (i + 0.5); return <line key={i} className="eye-cf-grid" x1={b.left} x2={b.left + b.innerWidth} y1={y} y2={y} />; })}
          {g.marks.map((m) => <Marker key={m.key} shape={m.corrected ? 'diamond' : 'circle'} x={m.x} y={m.y} r={5} />)}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── ProbabilityBand (CMP-061, VIZ-03) ───────────────────────── */

/**
 * A PROBABILITY BAND: the forecast's q10–q90 band over its horizon path with the median inside, the CUTOFF marked (the last instant the
 * forecast could know), the method and the calibration / validation state in the declarations — NEVER a single deterministic line. A missing
 * quantile breaks the band (a gap). A forecast without a path is drawn as its one interval at its target.
 */
export function ProbabilityBand({ spec, points, cutoff, includeZero, exportAs, status, validation }: Common & {
  points: readonly BandPointIn[]; cutoff?: string | null; includeZero?: boolean; /** the validation / calibration state in words, shown beside the band */ validation?: string;
}) {
  const rows = useMemo(() => probabilityBandRows(points), [points]);
  const g = useMemo(() => probabilityBandGeometry(points, { cutoff: cutoff ?? null, ...(includeZero === undefined ? {} : { includeZero }) }), [points, cutoff, includeZero]);
  const b = g.box;
  const band = spec.legend.find((e) => e.marker === 'none') ?? spec.legend[0];
  const med = spec.legend.find((e) => e.marker !== 'none') ?? spec.legend[0];
  const notes = <p className="eye-help">{validation === undefined ? '' : `${validation}. `}The band is the stated interval of the forecast distribution, not a range of certainty{g.gaps > 0 ? `; ${g.gaps} gap(s) where a quantile is missing` : ''}{g.cutoffX === null ? '' : '; the vertical line is the cutoff'}.</p>;
  return (
    <ChartFrame spec={spec} rows={rows} interactive notes={notes} {...frameProps({ spec, exportAs, status })}
      {...(g.empty ? { status: status ?? { state: 'empty' as const, statement: 'the forecast carries no quantile to draw' } } : {})}>
      {g.empty ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.medianPoints} label={`${spec.title}: median points`} />}>
          <YAxis box={b} ticks={g.yTicks} />
          <XAxis box={b} ticks={g.xTicks} />
          <path className="eye-cf-band" d={g.band} strokeDasharray={band === undefined ? undefined : dashOf(band.dash)} style={{ color: tokenVar(band?.token ?? 'color.uncertain') }} />
          <path className="eye-cf-series" d={g.median} strokeDasharray={med === undefined ? undefined : dashOf(med.dash)} />
          {g.medianPoints.map((p) => <Marker key={p.row} shape={med?.marker ?? 'circle'} x={p.x} y={p.y} r={3} />)}
          {g.cutoffX === null ? null : (
            <g className="eye-cf-cutoff"><line x1={g.cutoffX} x2={g.cutoffX} y1={b.top} y2={b.top + b.innerHeight} /><text x={g.cutoffX + 4} y={b.top + 12}>cutoff</text></g>
          )}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── HorizonMatrix (VIZ-04) ───────────────────────── */

/**
 * THE HORIZON MATRIX: the six canonical horizons (30d … 5y) as rows — each with its target, its distribution drawn on ITS OWN declared
 * scale (the scale's ends printed on the row: horizons are never compared on a hidden shared axis), its method, its score and its permitted
 * use. A horizon with nothing issued is a row that says so.
 */
export function HorizonMatrix({ spec, rows: input, exportAs, status }: Common & { rows: readonly HorizonRowIn[] }) {
  const rows = useMemo(() => horizonMatrixRows(input), [input]);
  const rowH = 34; const labelW = 64; const bandW = 360; const b = plotBox(labelW + bandW + 200, 20 + rows.length * rowH, { left: 0, right: 0, top: 10, bottom: 10 });
  const pts: TooltipPoint[] = [];
  const lines = rows.map((r, i) => {
    const s = horizonRowScale({ q10: r['q10'] as number | null, q50: r['q50'] as number | null, q90: r['q90'] as number | null }, bandW);
    const y = b.top + rowH * (i + 0.5);
    if (s.mid !== null) pts.push({ x: labelW + s.mid, y, row: i });
    return { r, s, y };
  });
  return (
    <ChartFrame spec={spec} rows={rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">Each row has its own scale (its two ends are printed on the row); compare a horizon&apos;s values only with its own scale. Method, score and permitted use are in the table.</p>}>
      <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={pts} label={`${spec.title}: horizons`} />}>
        {lines.map(({ r, s, y }) => (
          <g key={String(r['horizon'])}>
            <line className="eye-cf-grid" x1={0} x2={b.width} y1={y + rowH / 2} y2={y + rowH / 2} />
            <text className="eye-cf-strong" x={4} y={y + 4}>{String(r['horizon'])}</text>
            {s.mid === null ? <text x={labelW} y={y + 4}>nothing issued at this horizon</text> : (
              <g transform={`translate(${labelW} 0)`}>
                <line className="eye-cf-axis-line" x1={4} x2={bandW - 4} y1={y + 9} y2={y + 9} />
                {s.ticks.map((t) => <text key={t.x} className="eye-cf-small" x={t.x} y={y + 16} textAnchor="middle">{t.label}</text>)}
                {s.lo !== null && s.hi !== null ? <rect className="eye-cf-band" x={s.lo} y={y - 6} width={Math.max(2, s.hi - s.lo)} height={10} style={{ color: tokenVar('color.uncertain') }} /> : null}
                <Marker shape="circle" x={s.mid} y={y - 1} r={3.5} />
              </g>
            )}
            <text className="eye-cf-small" x={labelW + bandW + 8} y={y + 4}>{r['method'] === null ? '' : String(r['method']).slice(0, 26)}</text>
          </g>
        ))}
      </Drawing>
    </ChartFrame>
  );
}

/* ───────────────────────── Distribution (VIZ-08) ───────────────────────── */

export type DistributionInput =
  | { kind: 'bins'; values: readonly number[]; bins: { edges: readonly number[] } | { count: number }; marks?: ReadonlyArray<{ key: string; label: string; at: number }> }
  | { kind: 'percentiles'; items: readonly PercentileItemIn[] };
/**
 * A DISTRIBUTION: a histogram over DECLARED bins (counts from zero; values outside the edges counted, not dropped) or the 10th / 50th / 90th
 * percentiles of several distributions on one axis. Never a decorative smoothed curve (VIZ-08).
 */
export function Distribution({ spec, input, exportAs, status }: Common & { input: DistributionInput }) {
  const view = useMemo(() => {
    if (input.kind === 'bins') {
      const h = histogram(input.values, input.bins);
      return { kind: 'bins' as const, h, rows: distributionBinRows(h.bins), g: histogramGeometry(h.bins, { ...(input.marks === undefined ? {} : { marks: input.marks }) }) };
    }
    return { kind: 'percentiles' as const, rows: distributionPercentileRows(input.items), p: percentileGeometry(input.items) };
  }, [input]);
  if (view.kind === 'bins') {
    const { g, h } = view; const b = g.box;
    return (
      <ChartFrame spec={spec} rows={view.rows} interactive {...frameProps({ spec, exportAs, status })}
        notes={<p className="eye-help">{h.n} value(s) in {h.bins.length} declared bin(s){h.outside > 0 ? `; ${h.outside} outside the edges (counted, not drawn)` : ''}. Bars are counts from zero; no curve is fitted.</p>}
        {...(g.empty ? { status: status ?? { state: 'empty' as const, statement: 'no value to bin' } } : {})}>
        {g.empty ? null : (
          <Drawing box={b} overlay={<DataTooltip spec={spec} rows={view.rows} box={b} points={g.bars.map((x) => ({ x: x.x + x.w / 2, y: x.y, row: x.row }))} label={`${spec.title}: bins`} />}>
            <YAxis box={b} ticks={g.yTicks} />
            <XAxis box={b} ticks={g.xTicks} />
            {g.bars.map((x) => <rect key={x.row} className="eye-cf-bar" x={x.x} y={x.y} width={x.w} height={Math.max(0, x.h)} />)}
            {g.marks.map((m) => <g key={m.key} className="eye-cf-cutoff"><line x1={m.x} x2={m.x} y1={b.top} y2={b.top + b.innerHeight} /><text x={m.x + 4} y={b.top + 12}>{m.label}</text></g>)}
          </Drawing>
        )}
      </ChartFrame>
    );
  }
  const { p } = view; const b = p.box;
  return (
    <ChartFrame spec={spec} rows={view.rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">Each strip runs from the 10th to the 90th percentile with the median marked; a strip with a missing percentile shows only what is known.</p>}
      {...(p.empty ? { status: status ?? { state: 'empty' as const, statement: 'no percentile to draw' } } : {})}>
      {p.empty ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={view.rows} box={b} points={p.strips.filter((s) => s.mid !== null).map((s) => ({ x: s.mid as number, y: s.y, row: s.row }))} label={`${spec.title}: distributions`} />}>
          <XAxis box={b} ticks={p.xTicks} />
          {p.strips.map((s) => (
            <g key={s.key}>
              {s.lo !== null && s.hi !== null ? <line className="eye-cf-interval" x1={s.lo} x2={s.hi} y1={s.y} y2={s.y} /> : null}
              {s.lo !== null ? <line className="eye-cf-interval" x1={s.lo} x2={s.lo} y1={s.y - 5} y2={s.y + 5} /> : null}
              {s.hi !== null ? <line className="eye-cf-interval" x1={s.hi} x2={s.hi} y1={s.y - 5} y2={s.y + 5} /> : null}
              {s.mid !== null ? <Marker shape="diamond" x={s.mid} y={s.y} r={4} /> : null}
              <text className="eye-cf-small" x={b.left} y={s.y - 8}>{String(view.rows[s.row]?.['item'] ?? '')}</text>
            </g>
          ))}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── CalibrationPlot (VIZ-09) ───────────────────────── */

/**
 * A CALIBRATION PLOT: observed coverage against the nominal coverage it promised — on the diagonal of perfect calibration, or, when every
 * family promised the same level, one column per family with the promise as its reference mark; each point carries its 95 % Wilson interval
 * from its sample. The period, the sample, the bins, the confidence and the method are declared; never an accuracy score alone.
 */
export function CalibrationPlot({ spec, points, layout, exportAs, status }: Common & { points: readonly CalibrationPointIn[]; layout?: 'diagonal' | 'category' }) {
  const rows = useMemo(() => calibrationRows(points), [points]);
  const g = useMemo(() => calibrationGeometry(points, layout === undefined ? {} : { layout }), [points, layout]);
  const b = g.box;
  const groups = [...new Set(points.map((p) => p.group))];
  return (
    <ChartFrame spec={spec} rows={rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">{g.layout === 'diagonal' ? 'The diagonal is perfect calibration.' : 'Each column is one family; its short horizontal mark is the coverage it promised.'} The vertical bar on each point is its 95 % interval from its sample; a family with no scored outcome has no point.</p>}
      {...(g.empty ? { status: status ?? { state: 'empty' as const, statement: 'nothing has been scored yet' } } : {})}>
      {g.empty ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.points.filter((p) => p.y !== null).map((p) => ({ x: p.x, y: p.y as number, row: p.row }))} label={`${spec.title}: families`} />}>
          <YAxis box={b} ticks={g.yTicks} />
          {g.layout === 'diagonal' ? <XAxis box={b} ticks={g.xTicks} /> : <XAxis box={b} ticks={g.xTicks.map((t) => ({ ...t, label: t.label.length > 14 ? `${t.label.slice(0, 13)}…` : t.label }))} />}
          {g.diagonal === null ? null : <path className="eye-cf-reference" d={g.diagonal} strokeDasharray="4 4" />}
          {g.points.map((p) => {
            const id = identityOf(spec.legend, p.group, groups.indexOf(p.group));
            return (
              <g key={p.key}>
                {g.layout === 'category' ? <line className="eye-cf-reference" x1={p.x - 12} x2={p.x + 12} y1={p.ref} y2={p.ref} /> : null}
                {p.lo !== null && p.hi !== null ? <line className="eye-cf-interval" x1={p.x} x2={p.x} y1={p.lo} y2={p.hi} /> : null}
                {p.y === null ? null : <Marker shape={id.marker} x={p.x} y={p.y} r={4.5} />}
              </g>
            );
          })}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── Waterfall (VIZ-22) and VarianceBridge (VIZ-23) ───────────────────────── */

function Bridge({ spec, steps, exportAs, status, notes }: Common & { steps: ReturnType<typeof bridgeSteps>; notes: ReactNode }) {
  const rows = useMemo(() => bridgeRows(steps), [steps]);
  const g = useMemo(() => bridgeGeometry(steps), [steps]);
  const b = g.box;
  return (
    <ChartFrame spec={spec} rows={rows} interactive notes={notes} {...frameProps({ spec, exportAs, status })}>
      <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.bars.map((x) => ({ x: x.x + x.w / 2, y: x.y, row: x.row }))} label={`${spec.title}: steps`} />}>
        <YAxis box={b} ticks={g.yTicks} />
        <line className="eye-cf-zero" x1={b.left} x2={b.left + b.innerWidth} y1={g.zeroY} y2={g.zeroY} />
        <path className="eye-cf-connector" d={g.connectors} strokeDasharray="2 3" />
        {g.bars.map((x) => (
          <g key={x.key}>
            <rect className="eye-cf-step" data-kind={x.kind} x={x.x} y={x.y} width={x.w} height={x.h} />
            <text className="eye-cf-small" x={x.x + x.w / 2} y={b.top + b.innerHeight + 14} textAnchor="middle">{x.kind === 'residual' ? 'residual' : String(rows[x.row]?.['step'] ?? '').slice(0, 12)}</text>
          </g>
        ))}
      </Drawing>
    </ChartFrame>
  );
}
/**
 * A WATERFALL: from a start to an end through signed components (an increase is an open bar, a decrease a hatched bar — the sign in the
 * table's Kind column, never colour alone) and THE RESIDUAL — always drawn, "fully attributed" when it is zero (VIZ-22: never a hidden residual).
 */
export function Waterfall({ spec, start, components, end, exportAs, status }: Common & {
  start: { label: string; value: number }; components: ReadonlyArray<{ key: string; label: string; delta: number | null; source?: string | null }>; end: { label: string; value: number };
}) {
  const steps = useMemo(() => bridgeSteps(start, components, end), [start, components, end]);
  const residual = steps.find((s) => s.kind === 'residual')?.delta ?? 0;
  return <Bridge spec={spec} steps={steps} exportAs={exportAs} status={status}
    notes={<p className="eye-help">Increases are open bars, decreases hatched bars. Residual {chartNumber(residual)}{residual === 0 ? ' — the components account for the whole change' : ' — the part of the change no component explains, shown, never hidden'}.</p>} />;
}
/**
 * A VARIANCE BRIDGE: the actual against the baseline (each with its period), the attributed DRIVERS with their sources, and the UNATTRIBUTED
 * delta drawn as its own step (VIZ-23: never an unattributed delta hidden in a driver).
 */
export function VarianceBridge({ spec, baseline, actual, drivers, exportAs, status }: Common & {
  baseline: { label: string; value: number; period: string }; actual: { label: string; value: number; period: string };
  drivers: ReadonlyArray<{ key: string; label: string; delta: number | null; source: string | null }>;
}) {
  const steps = useMemo(() => bridgeSteps({ label: `${baseline.label} (${baseline.period})`, value: baseline.value }, drivers, { label: `${actual.label} (${actual.period})`, value: actual.value },
    'Unattributed (actual − baseline − drivers)'), [baseline, actual, drivers]);
  const un = steps.find((s) => s.kind === 'residual')?.delta ?? 0;
  return <Bridge spec={spec} steps={steps} exportAs={exportAs} status={status}
    notes={<p className="eye-help">Baseline {chartNumber(baseline.value)} ({baseline.period}) → actual {chartNumber(actual.value)} ({actual.period}); {drivers.length} attributed driver(s); unattributed {chartNumber(un)}.</p>} />;
}

/* ───────────────────────── CorrelationMatrix (VIZ-24) ───────────────────────── */

/**
 * A CORRELATION MATRIX: the association between each pair (upper triangle) — a coefficient as its number with a square whose side is its
 * magnitude and its sign written (+ / −), a categorical relation as its word, a pair with nothing as "missing" (dotted, never 0). The method,
 * the sample, the time, the missingness and the caveat are declared; the grammar refuses a causal word (VIZ-24).
 */
export function CorrelationMatrix({ spec, variables, cells, exportAs, status }: Common & { variables: ReadonlyArray<{ key: string; label: string }>; cells: readonly CorrelationCellIn[] }) {
  const m = useMemo(() => correlationMatrix(variables, cells), [variables, cells]);
  const n = variables.length; const cell = 72; const lab = 140;
  const b = plotBox(lab + Math.max(1, n - 1) * cell + 8, lab / 2 + Math.max(1, n - 1) * cell + 8, { left: lab, top: lab / 2, right: 8, bottom: 8 });
  const rowOf = new Map<string, number>();
  m.rows.forEach((r, i) => rowOf.set(`${String(r['a'])}|${String(r['b'])}`, i));
  const at = (i: number, j: number) => ({ x: lab + cell * (j - 1), y: b.top + cell * i });
  const pts: TooltipPoint[] = m.cells.map(({ i, j }) => ({ x: at(i, j).x + cell / 2, y: at(i, j).y + cell / 2, row: rowOf.get(`${variables[i]!.label}|${variables[j]!.label}`) ?? 0 }));
  return (
    <ChartFrame spec={spec} rows={m.rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">{m.pairs - m.missing} of {m.pairs} pair(s) have an entry; {m.missing} missing (dotted). Association only — no entry here says one exposure moves another.</p>}
      {...(n < 2 ? { status: status ?? { state: 'empty' as const, statement: 'fewer than two variables — no pair to show' } } : {})}>
      {n < 2 ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={m.rows} box={b} points={pts} label={`${spec.title}: pairs`} />}>
          {variables.slice(0, -1).map((v, i) => <text key={`r-${v.key}`} className="eye-cf-small" x={lab - 6} y={b.top + cell * i + cell / 2 + 4} textAnchor="end">{v.label.slice(0, 20)}</text>)}
          {variables.slice(1).map((v, j) => <text key={`c-${v.key}`} className="eye-cf-small" x={lab + cell * j + cell / 2} y={b.top - 8} textAnchor="middle">{v.label.slice(0, 11)}</text>)}
          {m.cells.map(({ i, j, cell: c }) => {
            const { x, y } = at(i, j); const cx = x + cell / 2; const cy = y + cell / 2;
            const k = c?.coefficient ?? null; const side = k === null ? 0 : Math.max(4, Math.abs(k) * (cell - 16));
            return (
              <g key={`${i}-${j}`}>
                <rect className={c === null ? 'eye-cf-cell eye-cf-cell--missing' : 'eye-cf-cell'} x={x + 2} y={y + 2} width={cell - 4} height={cell - 4} />
                {k !== null ? <rect className="eye-cf-cell-mark" x={cx - side / 2} y={cy - side / 2} width={side} height={side} /> : null}
                <text className="eye-cf-small" x={cx} y={cy + 4} textAnchor="middle">{c === null ? 'missing' : k !== null ? `${k >= 0 ? '+' : '−'}${chartNumber(Math.abs(k))}` : String(c.relation ?? '').slice(0, 11)}</text>
              </g>
            );
          })}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── Scatter (VIZ-25) ───────────────────────── */

/**
 * A SCATTER PLOT: two declared axes with units, one marker shape per group (the legend), the sample counted (a point with a missing
 * coordinate is counted, not drawn). A line is drawn ONLY as a declared REFERENCE (y = x: perfect agreement — not a fit) or as the ordinary
 * least squares fit, its method named; never a trendline without a method (VIZ-25).
 */
export function Scatter({ spec, points, xLabel, yLabel, line, exportAs, status }: Common & { points: readonly ScatterPointIn[]; xLabel: string; yLabel: string; line?: ScatterLine | null }) {
  const rows = useMemo(() => scatterRows(points), [points]);
  const g = useMemo(() => scatterGeometry(points, { line: line ?? null }), [points, line]);
  const b = g.box;
  const groups = [...new Set(points.map((p) => p.group))];
  const lineNote = line === undefined || line === null ? 'No line is drawn.' : line.kind === 'identity' ? `The dashed line is a reference — ${line.label}; it is not fitted.`
    : g.fit === null ? 'No fit: fewer than three points with an x spread.' : `The solid line is the ${line.label} (method: ordinary least squares; n ${g.fit.n}; R² ${chartNumber(g.fit.r2)}).`;
  return (
    <ChartFrame spec={spec} rows={rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">{points.length - g.dropped} point(s) drawn{g.dropped > 0 ? `; ${g.dropped} with a missing coordinate counted in the table, not drawn` : ''}. {lineNote}</p>}
      {...(g.empty ? { status: status ?? { state: 'empty' as const, statement: 'no point with both coordinates' } } : {})}>
      {g.empty ? null : (
        <Drawing box={b} overlay={<DataTooltip spec={spec} rows={rows} box={b} points={g.points.map((p) => ({ x: p.x, y: p.y, row: p.row }))} label={`${spec.title}: points`} />}>
          <YAxis box={b} ticks={g.yTicks} />
          <XAxis box={b} ticks={g.xTicks} />
          <text className="eye-cf-small" x={b.left + b.innerWidth} y={b.height - 4} textAnchor="end">{xLabel}</text>
          <text className="eye-cf-small" x={b.left} y={b.top - 4}>{yLabel}</text>
          {g.line === null ? null : <path className={line?.kind === 'identity' ? 'eye-cf-reference' : 'eye-cf-series'} d={g.line} strokeDasharray={line?.kind === 'identity' ? '4 4' : undefined} />}
          {g.points.map((p) => <Marker key={p.row} shape={identityOf(spec.legend, p.group, groups.indexOf(p.group)).marker} x={p.x} y={p.y} r={4} />)}
        </Drawing>
      )}
    </ChartFrame>
  );
}

/* ───────────────────────── ControlChart (VIZ-26) ───────────────────────── */

/**
 * A CONTROL CHART: the sample over time, its BASELINE (with its basis), its LIMITS — a declared rule (e.g. a B28 stream rule's threshold) or
 * a statistical limit, each labelled with its basis — the points that MEET a rule (a square marker; "meets <rule>" in the table: a signal to
 * look, never a certainty) and the INTERVENTIONS (dotted verticals). A threshold is shown as a rule, never as certainty (VIZ-26).
 */
export function ControlChart({ spec, points, baseline, limits, interventions, exportAs, status }: Common & {
  points: ReadonlyArray<{ at: string; value: number | null }>; baseline: { value: number; label: string } | null; limits: readonly ControlLimitIn[];
  interventions?: ReadonlyArray<{ at: string; label: string }>;
}) {
  const rows = useMemo(() => controlRows(points, limits), [points, limits]);
  const geo = useMemo(() => {
    const b = plotBox();
    const sorted = points.filter((p) => toInstant(p.at) !== null).slice().sort((a, c) => toInstant(a.at)! - toInstant(c.at)!);
    const tx = extentOf([...sorted.map((p) => toInstant(p.at)), ...(interventions ?? []).map((i) => toInstant(i.at))]);
    const vy = extentOf([...sorted.map((p) => p.value), ...limits.map((l) => l.value), baseline?.value ?? null]);
    if (tx === null || vy === null) return null;
    const t = tx[0] === tx[1] ? [tx[0] - 86_400_000, tx[1] + 86_400_000] as [number, number] : tx;
    const d = niceDomain(vy[0], vy[1]);
    const x = linearScale(t, [b.left, b.left + b.innerWidth]); const y = linearScale([d.min, d.max], [b.top + b.innerHeight, b.top]);
    const pts = sorted.map((p, row) => ({ p, row })).filter(({ p }) => p.value !== null && Number.isFinite(p.value))
      .map(({ p, row }) => ({ x: x(toInstant(p.at)!), y: y(p.value as number), row, met: limits.some((l) => meets(p.value as number, l.comparator, l.value)) }));
    const runs: Array<Array<{ x: number; y: number }>> = [[]];
    sorted.forEach((p) => { if (p.value === null || !Number.isFinite(p.value)) { if (runs[runs.length - 1]!.length > 0) runs.push([]); } else runs[runs.length - 1]!.push({ x: x(toInstant(p.at)!), y: y(p.value) }); });
    return {
      b, pts, line: pathOf(runs), baseY: baseline === null ? null : y(baseline.value), limits: limits.map((l) => ({ ...l, y: y(l.value) })),
      marks: (interventions ?? []).filter((i) => toInstant(i.at) !== null).map((i) => ({ ...i, x: x(toInstant(i.at)!) })),
      xTicks: timeTicks(t[0], t[1]).map((k) => ({ x: x(k.at), label: k.label })), yTicks: d.ticks.map((v) => ({ y: y(v), label: chartNumber(v) })),
    };
  }, [points, limits, baseline, interventions]);
  const met = rows.filter((r) => r['rules'] !== 'none' && r['rules'] !== 'unknown — no value').length;
  return (
    <ChartFrame spec={spec} rows={rows} interactive {...frameProps({ spec, exportAs, status })}
      notes={<p className="eye-help">{met} of {rows.length} point(s) meet a declared rule (square markers) — a rule met is a signal to look at, not a certainty about the process. {limits.map((l) => `${l.label}: ${l.basis}`).join('; ')}.</p>}
      {...(geo === null ? { status: status ?? { state: 'empty' as const, statement: 'no timed value in the sample' } } : {})}>
      {geo === null ? null : (
        <Drawing box={geo.b} overlay={<DataTooltip spec={spec} rows={rows} box={geo.b} points={geo.pts} label={`${spec.title}: sample`} />}>
          <YAxis box={geo.b} ticks={geo.yTicks} />
          <XAxis box={geo.b} ticks={geo.xTicks} />
          {geo.baseY === null ? null : <g className="eye-cf-reference"><line x1={geo.b.left} x2={geo.b.left + geo.b.innerWidth} y1={geo.baseY} y2={geo.baseY} /><text x={geo.b.left + 4} y={geo.baseY - 4}>{baseline?.label}</text></g>}
          {geo.limits.map((l) => (
            <g key={l.key} className="eye-cf-limit"><line x1={geo.b.left} x2={geo.b.left + geo.b.innerWidth} y1={l.y} y2={l.y} strokeDasharray="6 4" />
              <text x={geo.b.left + geo.b.innerWidth - 4} y={l.y - 4} textAnchor="end">{l.kind === 'rule' ? 'rule' : 'limit'} {l.comparator} {chartNumber(l.value)}</text></g>
          ))}
          {geo.marks.map((m, i) => <g key={i} className="eye-cf-cutoff"><line x1={m.x} x2={m.x} y1={geo.b.top} y2={geo.b.top + geo.b.innerHeight} strokeDasharray="1.5 3" /><text x={m.x + 3} y={geo.b.top + 10 + (i % 3) * 12}>{m.label.slice(0, 24)}</text></g>)}
          <path className="eye-cf-series" d={geo.line} />
          {geo.pts.map((p) => <Marker key={p.row} shape={p.met ? 'square' : 'circle'} x={p.x} y={p.y} r={p.met ? 4.5 : 3} />)}
        </Drawing>
      )}
    </ChartFrame>
  );
}
