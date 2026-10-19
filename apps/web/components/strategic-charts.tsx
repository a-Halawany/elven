'use client';
/**
 * CP-6 B82 §SC — THE SCENARIO, DECISION, RISK AND OPERATIONS CHARTS of the evidence-bearing visualization library (F-P7-E-21: CMP-062 /
 * VIZ-05 ScenarioFan, VIZ-06 ScenarioComparison, VIZ-07 SensitivityTornado, VIZ-10 RiskMatrix, VIZ-11 OpportunityPortfolio, VIZ-12
 * HealthDecomposition, VIZ-27 RunComparison, VIZ-28 TwinStateDiff, VIZ-29 OptionMatrix, VIZ-30 EvidenceCoverage, VIZ-33 StatusBoard, VIZ-34
 * AlertQueue, VIZ-35 AuditTimeline). Every chart COMPOSES components/chart-frame.tsx's ChartFrame with a ChartSpec that passes the §SC
 * grammar (lib/strategic-charts-b82 strategicGrammar = §CF's chartGrammar + the §SC kind rules): a chart missing a declaration is refused in
 * words, never drawn; the declarations, the legend and the TABLE ALTERNATIVE (summary, table, definitions, CSV) are the frame's.
 *
 *  - DESIGN D3: hand-written SVG; every coordinate comes from lib/strategic-charts-b82.ts (pure, unit-tested). No chart library.
 *  - DESIGN D5: no colour token is added — kinds, states and series are told apart by dash pattern, marker shape and words; the drawing's
 *    classes are §CF's (`eye-cf-*`, globals.css `B82 cf`) plus `B82 sc`'s one rule (a branch that is not live is faded AND labelled).
 *  - KEYBOARD AND POINTER: an interactive chart's points are §CF's DataTooltip (one tab stop, roving, Escape closes) — its lines are the
 *    table row's. A page whose selectors read buttons by an exposure's title renders the chart static (`interactive={false}`): every value
 *    is still in the table.
 *  - The charts read nothing themselves: a page passes the values its existing read returned and the spec naming that read.
 *
 * CONSTRUCTION only — each component arrives `proposed` in B107's inventory; the DSA approves it in the act; nothing here is demonstrated.
 */
import { useMemo, type ReactNode } from 'react';
import { ChartFrame, type ChartStatus } from './chart-frame';
import { DataTooltip, type TooltipPoint } from './chart';
import type { AlternativeRow, ChartSpec, DashPattern, MarkerShape } from '../lib/b82-seams';
import type { ExportLabel } from '../lib/table-b80';
import { DASH_ARRAY, chartNumber, markerPath, type Box } from '../lib/chart-b82';
import {
  alertGeometry, alertRows, auditGeometry, auditRows, clipText, comparisonFrame, comparisonGeometry, comparisonRows, coverageGeometry, coverageRows, diffGeometry,
  diffRows, fanGeometry, fanRows, healthGeometry, healthRows, opportunityGeometry, opportunityRows, optionGeometry, optionRows, riskGeometry, riskRows, runBasis,
  runGeometry, runRows, statusGeometry, statusRows, strategicGrammar, tornadoGeometry, tornadoRowsOf,
  type AlertIn, type AuditIn, type CompareItemIn, type CoveragePartIn, type DiffKeyIn, type FanBranchIn, type HealthCompIn, type HealthDimIn, type OpportunityIn,
  type OptionMatrixIn, type RiskIn, type RunIn, type RunMeasure, type StatusIn, type TornadoIn,
} from '../lib/strategic-charts-b82';

/* ───────────────────────── shared pieces ───────────────────────── */

/** The props every §SC chart shares (the frame's optional additions passed through). */
interface Common {
  spec: ChartSpec;
  /** the alternative's CSV labelled for the page's read; omitted, no download is offered */ exportAs?: ExportLabel;
  /** loading, error, withheld, empty or stale — in words */ status?: ChartStatus;
  /** keyboard-focusable points with the table row as their value (default true); false: a static drawing, every value in the table */ interactive?: boolean;
}
const dashOf = (d: DashPattern): string | undefined => DASH_ARRAY[d] ?? undefined;
function Marker({ shape, x, y, r = 4 }: { shape: MarkerShape; x: number; y: number; r?: number }) {
  const d = markerPath(shape, x, y, r);
  return d === '' ? null : <path className="eye-cf-marker" data-shape={shape} d={d} />;
}
function XTicks({ box, ticks, y }: { box: Box; ticks: ReadonlyArray<{ x: number; label: string }>; y?: number }) {
  const yy = y ?? box.top + box.innerHeight;
  return (
    <g className="eye-cf-axis">
      <line x1={box.left} x2={box.left + box.innerWidth} y1={yy} y2={yy} />
      {ticks.map((t, i) => <g key={`${t.label}-${i}`}><line x1={t.x} x2={t.x} y1={yy} y2={yy + 4} /><text x={t.x} y={yy + 17} textAnchor="middle">{t.label}</text></g>)}
    </g>
  );
}
function YTicks({ box, ticks }: { box: Box; ticks: ReadonlyArray<{ y: number; label: string }> }) {
  return (
    <g className="eye-cf-axis">
      {ticks.map((t, i) => <g key={`${t.label}-${i}`}><line className="eye-cf-grid" x1={box.left} x2={box.left + box.innerWidth} y1={t.y} y2={t.y} /><text x={box.left - 6} y={t.y + 4} textAnchor="end">{t.label}</text></g>)}
    </g>
  );
}
/** The base drawing: an SVG on the plot box (aria-hidden — the points layer and the table carry the values), drawn left-to-right. */
function Drawing({ box, children, overlay }: { box: Box; children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="eye-cf-plot" dir="ltr" style={{ maxInlineSize: `min(100%, ${Math.round(box.width * 1.15)}px)` }}>
      <svg className="eye-cf-svg" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true" focusable="false">{children}</svg>
      {overlay}
    </div>
  );
}
/**
 * The frame with the §SC grammar: a spec with a problem is REFUSED in words (the frame's own wording) — neither the drawing nor the table;
 * otherwise ChartFrame draws the declarations, the legend, the drawing (with §CF's DataTooltip when interactive), the notes and the table.
 */
function ScFrame({ spec, rows, box, points, notes, drawing, exportAs, status, interactive }: Common & {
  rows: readonly AlternativeRow[]; box: Box; points: readonly TooltipPoint[]; notes?: ReactNode; drawing: ReactNode | null;
}) {
  const problems = useMemo(() => strategicGrammar(spec, rows), [spec, rows]);
  const title = typeof spec?.title === 'string' && spec.title.trim() !== '' ? spec.title : 'Untitled chart';
  if (problems.length > 0) {
    return (
      <figure className="eye-cf eye-cf--refused" aria-label={title} data-chart-kind={String(spec?.kind ?? '')}>
        <figcaption className="eye-cf-title">{title}</figcaption>
        <div className="eye-cf-refused" role="note" aria-label={`${title}: not drawn`}>
          <p>Not drawn: this chart does not declare everything a reader needs to interpret it. The page that supplies it declares what is listed here; then the chart and its table alternative are shown.</p>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </figure>
    );
  }
  const tip = interactive !== false && points.length > 0 && drawing !== null;
  return (
    <ChartFrame spec={spec} rows={rows} interactive={tip} {...(notes === undefined ? {} : { notes })} {...(exportAs === undefined ? {} : { exportAs })} {...(status === undefined ? {} : { status })}>
      {drawing === null ? undefined : (
        <Drawing box={box} overlay={tip ? <DataTooltip spec={spec} rows={rows} box={box} points={points} label={`${spec.title}: points`} /> : undefined}>{drawing}</Drawing>
      )}
    </ChartFrame>
  );
}
const help = (t: ReactNode) => <p className="eye-help">{t}</p>;

/* ───────────────────────── ScenarioFan (CMP-062, VIZ-05) ───────────────────────── */

/**
 * A SCENARIO FAN: the baseline and every branch fanned from the as-of instant to the horizon — each quantified branch as a wedge to its
 * lowest–highest and a line to its median, all with the SAME weight (no single highlighted destiny); each kind its dash and marker; a branch
 * that is not live faded AND labelled "not live"; a branch with no quantified outcome listed in the notes and the table, never drawn.
 */
export function ScenarioFan({ spec, branches, ...c }: Common & { branches: readonly FanBranchIn[] }) {
  const rows = useMemo(() => fanRows(branches), [branches]);
  const g = useMemo(() => fanGeometry(branches), [branches]);
  const b = g.box;
  const unq = branches.filter((x) => g.unquantified.includes(x.key)).map((x) => x.name);
  const points = g.branches.flatMap((x) => (x.end !== null ? [{ x: x.end.x, y: x.end.y, row: x.row }] : x.interval !== null ? [{ x: x.interval.x, y: (x.interval.y0 + x.interval.y1) / 2, row: x.row }] : []));
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={points} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'no branch carries a quantified outcome — every branch is listed in the table with its divergence, assumptions and signpost' } } : {})}
      notes={help(<>{g.branches.length} branch(es) drawn, each with the same line weight{unq.length === 0 ? '' : `; not quantified (listed, not drawn): ${unq.join(', ')}`}. {g.origin === null ? 'The baseline carries no value, so no origin is drawn: each branch is its interval at the horizon.' : 'The fan opens at the baseline\'s median at the as-of instant.'}</>)}
      drawing={g.empty ? null : (
        <>
          <YTicks box={b} ticks={g.yTicks} />
          <line className="eye-cf-axis-line" x1={b.left} x2={b.left + b.innerWidth} y1={b.top + b.innerHeight} y2={b.top + b.innerHeight} />
          <text x={b.left + 8} y={b.top + b.innerHeight + 18}>as of</text>
          <text x={b.left + b.innerWidth} y={b.top + b.innerHeight + 18} textAnchor="end">horizon</text>
          {g.origin === null ? null : <Marker shape="circle" x={g.origin.x} y={g.origin.y} r={3} />}
          {g.branches.map((x) => {
            const br = branches.find((y) => y.key === x.key)!;
            return (
              <g key={x.key} className={x.live ? 'eye-cf-series-group' : 'eye-cf-series-group eye-sc-notlive'} data-branch-kind={br.kind}>
                {x.wedge === null ? null : <path className="eye-cf-band" d={x.wedge} strokeDasharray={dashOf(x.dash)} />}
                {x.line === null ? null : <path className="eye-cf-series" d={x.line} strokeDasharray={dashOf(x.dash)} />}
                {x.interval === null ? null : <line className="eye-cf-interval" x1={x.interval.x} x2={x.interval.x} y1={x.interval.y0} y2={x.interval.y1} />}
                {x.end === null ? null : <Marker shape={x.marker} x={x.end.x} y={x.end.y} />}
                {x.label === null ? null : <text className="eye-cf-direct" x={x.label.x} y={x.label.y + 4}>{clipText(br.name, 16)}{x.live ? '' : ' (not live)'}</text>}
              </g>
            );
          })}
        </>
      )} />
  );
}

/* ───────────────────────── ScenarioComparison (VIZ-06) ───────────────────────── */

/**
 * A SCENARIO COMPARISON: the branches of one set on ONE probability scale (0–1) — each governed probability as its interval, the consequence
 * class and "not counted" in words beside it. Probabilities set by DIFFERENT methods are an unequal frame: none is drawn on the shared scale
 * and the reason is said; every value stays in the table.
 */
export function ScenarioComparison({ spec, items, ...c }: Common & { items: readonly CompareItemIn[] }) {
  const rows = useMemo(() => comparisonRows(items), [items]);
  const frame = useMemo(() => comparisonFrame(items), [items]);
  const g = useMemo(() => comparisonGeometry(items, { drawProbability: frame.problem === null }), [items, frame]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.rows.filter((r) => r.interval !== null).map((r) => ({ x: (r.interval!.x0 + r.interval!.x1) / 2, y: r.y, row: r.row }))} {...c}
      {...(items.length === 0 ? { status: c.status ?? { state: 'empty' as const, statement: 'the set has no branch to set side by side' } } : {})}
      notes={help(frame.problem === null ? 'One set, one read, one scale: each bar is the interval its owner set; a dotted bar is a branch that is not counted.' : `Unequal frame — ${frame.problem}.`)}
      drawing={items.length === 0 ? null : (
        <>
          <XTicks box={b} ticks={g.xTicks} />
          {g.rows.map((r) => {
            const it = items[r.row]!;
            return (
              <g key={r.key} className={r.live ? undefined : 'eye-sc-notlive'}>
                <line className="eye-cf-grid" x1={b.left} x2={b.left + b.innerWidth} y1={r.y} y2={r.y} />
                <text className="eye-cf-small" x={b.left - 6} y={r.y + 4} textAnchor="end">{clipText(it.name, 24)}</text>
                {r.interval === null ? null : (
                  <g>
                    <rect className="eye-cf-bar" x={r.interval.x0} y={r.y - 5} width={Math.max(2, r.interval.x1 - r.interval.x0)} height={10} strokeDasharray={r.live ? undefined : dashOf('dotted')} />
                    <line className="eye-cf-interval" x1={r.interval.x0} x2={r.interval.x0} y1={r.y - 7} y2={r.y + 7} />
                    <line className="eye-cf-interval" x1={r.interval.x1} x2={r.interval.x1} y1={r.y - 7} y2={r.y + 7} />
                  </g>
                )}
                <text className="eye-cf-small" x={b.left + b.innerWidth + 6} y={r.y + 4}>{clipText(r.note, 18)}</text>
              </g>
            );
          })}
        </>
      )} />
  );
}

/* ───────────────────────── SensitivityTornado (VIZ-07) ───────────────────────── */

/**
 * A SENSITIVITY TORNADO: each factor's metric move when moved down (a filled bar) and up (an open, dashed bar) from the no-move line, in
 * the SERVER's rank order; one value axis in the metric's unit. The model, the baseline and the range are declared; no causal claim.
 */
export function SensitivityTornado({ spec, items, ...c }: Common & { items: readonly TornadoIn[] }) {
  const rows = useMemo(() => tornadoRowsOf(items), [items]);
  const g = useMemo(() => tornadoGeometry(items), [items]);
  const b = g.box;
  const points = g.bars.flatMap((x) => (x.high !== null ? [{ x: (items[x.row]!.highDelta ?? 0) >= 0 ? x.high.x + x.high.w : x.high.x, y: x.y + x.h / 2, row: x.row }] : []));
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={points} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'the analysis recorded no factor' } } : {})}
      notes={help('The vertical line is no move (the run at its base settings). Filled bars: the factor moved down; open dashed bars: moved up. Ranked by the server, widest swing first; a swing is the model\'s response, not a finding about the world.')}
      drawing={g.empty ? null : (
        <>
          <XTicks box={b} ticks={g.xTicks} />
          <line className="eye-cf-zero" x1={g.zeroX} x2={g.zeroX} y1={b.top} y2={b.top + b.innerHeight} />
          {g.bars.map((x) => {
            const t = items[x.row]!;
            return (
              <g key={x.key}>
                <text className="eye-cf-small" x={b.left - 6} y={x.y + x.h / 2 + 4} textAnchor="end">{clipText(`${t.rank}. ${t.key}${t.kind === 'timing' ? ' (timing)' : ''}`, 26)}</text>
                {x.low === null ? null : <rect className="eye-cf-step" data-kind="decrease" x={x.low.x} y={x.y} width={x.low.w} height={x.h} />}
                {x.high === null ? null : <rect className="eye-cf-step" data-kind="increase" x={x.high.x} y={x.y + 2} width={x.high.w} height={x.h - 4} strokeDasharray="4 3" />}
              </g>
            );
          })}
        </>
      )} />
  );
}

/* ───────────────────────── RiskMatrix (VIZ-10) ───────────────────────── */

/**
 * A RISK MATRIX: each risk's residual RANGE (low to high) against its likelihood as stated — a probability upper bound on the 0–1 scale, or
 * a plausibility word in its own lane (never converted); the appetite thresholds as dashed lines; a residual OUTSIDE appetite marked "!"
 * (a mark and a word, never colour alone); each state its marker shape. One unit: a risk in another unit is listed, not drawn.
 */
export function RiskMatrix({ spec, items, unit, ...c }: Common & { items: readonly RiskIn[]; unit: string | null }) {
  const rows = useMemo(() => riskRows(items, unit), [items, unit]);
  const g = useMemo(() => riskGeometry(items, unit), [items, unit]);
  const b = g.box;
  const notDrawn = rows.filter((r) => r['drawn'] !== 'drawn').length;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.marks.map((m) => ({ x: m.x, y: m.yHigh, row: m.row }))} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'no risk carries an accepted residual with a stated likelihood — each is listed in the table' } } : {})}
      notes={help(`${g.marks.length} risk(s) drawn; ${notDrawn} listed and not drawn (the table says why). A vertical line is a residual range; "!" marks one OUTSIDE appetite.`)}
      drawing={g.empty ? null : (
        <>
          <YTicks box={b} ticks={g.yTicks} />
          <XTicks box={{ ...b, left: g.prob.x0, innerWidth: g.prob.x1 - g.prob.x0 }} ticks={g.xTicks} />
          <line className="eye-cf-axis-line" x1={g.lane.x0} x2={g.lane.x1} y1={b.top + b.innerHeight} y2={b.top + b.innerHeight} />
          {g.slots.map((s) => <text key={s.label} className="eye-cf-small" x={s.x} y={b.top + b.innerHeight + 17} textAnchor="middle">{s.label}</text>)}
          <text className="eye-cf-small" x={(g.lane.x0 + g.lane.x1) / 2} y={b.top + b.innerHeight + 32} textAnchor="middle">plausibility only</text>
          <text className="eye-cf-small" x={(g.prob.x0 + g.prob.x1) / 2} y={b.top + b.innerHeight + 32} textAnchor="middle">probability upper bound (0–1)</text>
          <line className="eye-cf-grid" x1={g.lane.x1 + 15} x2={g.lane.x1 + 15} y1={b.top} y2={b.top + b.innerHeight} strokeDasharray="2 3" />
          {g.thresholds.map((t) => <g key={t.label} className="eye-cf-limit"><line x1={b.left} x2={b.left + b.innerWidth} y1={t.y} y2={t.y} strokeDasharray="6 4" /><text x={b.left + b.innerWidth - 4} y={t.y - 4} textAnchor="end">{t.label}</text></g>)}
          {g.marks.map((m) => (
            <g key={m.key}>
              <line className="eye-cf-series" x1={m.x} x2={m.x} y1={m.yLow} y2={m.yHigh} strokeDasharray={dashOf(m.dash)} />
              <Marker shape={m.marker} x={m.x} y={m.yHigh} r={4.5} />
              {m.breach ? <text className="eye-cf-strong" x={m.x + 8} y={m.yHigh + 4}>!</text> : null}
              <text className="eye-cf-small" x={m.x + (m.breach ? 16 : 8)} y={m.yHigh + 4}>{clipText(items[m.row]!.title, 18)}</text>
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── OpportunityPortfolio (VIZ-11) ───────────────────────── */

/**
 * AN OPPORTUNITY PORTFOLIO: each opportunity as a LABELLED point — its value range (low to high) at its horizon, its stated confidence in
 * its label; never a bubble whose area is a value. One without a horizon sits in the "timing: no input" strip; another unit is listed.
 */
export function OpportunityPortfolio({ spec, items, unit, ...c }: Common & { items: readonly OpportunityIn[]; unit: string | null }) {
  const rows = useMemo(() => opportunityRows(items, unit), [items, unit]);
  const g = useMemo(() => opportunityGeometry(items, unit), [items, unit]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.marks.map((m) => ({ x: m.x, y: m.yHigh, row: m.row }))} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'no opportunity carries a value in one unit — each is listed in the table' } } : {})}
      notes={help(`${g.marks.length} of ${items.length} opportunity(ies) drawn; the vertical line is the value range, the label carries the stated confidence.`)}
      drawing={g.empty ? null : (
        <>
          <YTicks box={b} ticks={g.yTicks} />
          <XTicks box={{ ...b, left: g.strip.x1 + 30, innerWidth: b.left + b.innerWidth - g.strip.x1 - 30 }} ticks={g.xTicks} />
          <rect className="eye-cf-gap" x={g.strip.x0} y={b.top} width={g.strip.x1 - g.strip.x0} height={b.innerHeight} />
          <text className="eye-cf-small" x={(g.strip.x0 + g.strip.x1) / 2} y={b.top + b.innerHeight + 17} textAnchor="middle">timing: no input</text>
          {g.marks.map((m) => (
            <g key={m.key}>
              <line className="eye-cf-series" x1={m.x} x2={m.x} y1={m.yLow} y2={m.yHigh} />
              <Marker shape="triangle" x={m.x} y={m.yHigh} r={4.5} />
              <text className="eye-cf-direct" x={m.x + 8} y={m.yHigh + 4}>{m.label}</text>
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── HealthDecomposition (VIZ-12) ───────────────────────── */

/**
 * A HEALTH DECOMPOSITION (it replaces the gauge — VIZ-12's anti-pattern): the dimension's 0–100 value laid out AS its components'
 * contributions end to end (alternate segments hatched; each labelled where it fits), what they do not add up to as a dashed "not
 * attributed" segment, the band floors marked; the weights, evidence, confidence, freshness and exclusions in the table. An INDETERMINATE
 * value draws nothing.
 */
export function HealthDecomposition({ spec, dimension, components, ...c }: Common & { dimension: HealthDimIn; components: readonly HealthCompIn[] }) {
  const rows = useMemo(() => healthRows(components), [components]);
  const g = useMemo(() => healthGeometry(dimension, components), [dimension, components]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.segments.map((s) => ({ x: s.x + s.w / 2, y: g.barY + g.barH / 2, row: s.row }))} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'the dimension is indeterminate — no value is drawn; every component is in the table with its reason' } } : {})}
      notes={help(<>{g.segments.length} component(s) contribute{g.residual === null ? '; the components account for the whole value' : `; ${g.residual.value > 0 ? 'not attributed' : 'over-attributed'}: ${chartNumber(Math.abs(g.residual.value))} (dashed)`}. The ticks above the bar are the band floors.</>)}
      drawing={g.empty ? null : (
        <>
          <XTicks box={b} ticks={g.xTicks} />
          <rect className="eye-cf-cell" x={b.left} y={g.barY} width={b.innerWidth} height={g.barH} />
          {g.segments.map((s) => (
            <g key={s.key}>
              <rect className="eye-cf-step" data-kind={s.alt ? 'decrease' : 'start'} x={s.x} y={g.barY} width={s.w} height={g.barH} />
              {s.label === null ? null : <text className="eye-cf-small" x={s.x + 4} y={g.barY + g.barH / 2 + 4}>{s.label}</text>}
            </g>
          ))}
          {g.residual === null ? null : <rect className="eye-cf-step" data-kind="residual" x={g.residual.x} y={g.barY} width={g.residual.w} height={g.barH} />}
          {g.bands.map((x) => <g key={x.label} className="eye-cf-cutoff"><line x1={x.x} x2={x.x} y1={g.barY - 6} y2={g.barY + g.barH} /><text x={x.x + 3} y={g.barY - 8}>{x.label}</text></g>)}
          {g.valueX === null ? null : <line className="eye-cf-zero" x1={g.valueX} x2={g.valueX} y1={g.barY - 3} y2={g.barY + g.barH + 3} strokeWidth={2} />}
        </>
      )} />
  );
}

/* ───────────────────────── RunComparison (VIZ-27) ───────────────────────── */

/**
 * A RUN COMPARISON: runs on ONE basis (one twin version, one control, one model) side by side — per measure a panel with each run's marker
 * (control circle, intervention square, invalidated cross) and the control's value as a dashed line; the manifests, validity, seed and
 * decision use in the table. Incompatible runs are NOT drawn side by side: the reason is said and the runs are listed.
 */
export function RunComparison({ spec, runs, measures, ...c }: Common & { runs: readonly RunIn[]; measures: readonly RunMeasure[] }) {
  const rows = useMemo(() => runRows(runs, measures), [runs, measures]);
  const problems = useMemo(() => runBasis(runs), [runs]);
  const g = useMemo(() => runGeometry(runs, measures), [runs, measures]);
  const b = g.box;
  const draw = problems.length === 0 && measures.length > 0;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={draw ? g.panels.flatMap((p) => p.marks.map((m) => ({ x: m.x, y: m.y, row: m.row }))) : []} {...c}
      notes={help(problems.length > 0 ? `Not drawn side by side: ${problems.join('; ')}. Each run is listed with its manifest.` : measures.length === 0 ? 'No measure is compared on this read: the manifests, validity and decision use are in the table.' : 'One basis: the dashed line in each panel is the control\'s value.')}
      drawing={!draw ? null : (
        <>
          {g.panels.map((p) => (
            <g key={p.key}>
              <text className="eye-cf-strong" x={4} y={p.y + 4}>{clipText(p.label, 24)}</text>
              <line className="eye-cf-axis-line" x1={b.left} x2={b.left + b.innerWidth} y1={p.y + 8} y2={p.y + 8} />
              {p.ticks.map((t, i) => <text key={`${t.label}-${i}`} className="eye-cf-small" x={t.x} y={p.y + 22} textAnchor="middle">{t.label}</text>)}
              {p.ref === null ? null : <line className="eye-cf-reference" x1={p.ref} x2={p.ref} y1={p.y - 20} y2={p.y + 8} strokeDasharray="4 3" />}
              {p.marks.map((m) => <Marker key={m.key} shape={m.marker} x={m.x} y={m.y} r={4.5} />)}
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── TwinStateDiff (VIZ-28) ───────────────────────── */

/**
 * A TWIN STATE DIFF: the elements a version changed against its parent (actual's head), one PANEL PER STATE CLASS of the version's value —
 * observed and synthetic are never drawn together — each row on its OWN scale (its ends printed): actual's value a circle, the version's a
 * square. A non-numeric change is listed in the table, not drawn.
 */
export function TwinStateDiff({ spec, items, ...c }: Common & { items: readonly DiffKeyIn[] }) {
  const rows = useMemo(() => diffRows(items), [items]);
  const g = useMemo(() => diffGeometry(items), [items]);
  const b = g.box;
  const empty = g.panels.length === 0;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.panels.flatMap((p) => p.rows.map((r) => ({ x: r.versionX ?? r.actualX ?? b.left, y: r.y, row: r.row })))} {...c}
      {...(empty ? { status: c.status ?? { state: 'empty' as const, statement: items.length === 0 ? 'no element differs' : 'no changed element carries a number — each is listed in the table' } } : {})}
      notes={help(`${g.panels.length} state class panel(s); ${g.skipped} non-numeric change(s) listed in the table only. Each row has its own scale — compare a row only with itself.`)}
      drawing={empty ? null : (
        <>
          {g.panels.map((p) => (
            <g key={p.cls}>
              <text className="eye-cf-strong" x={4} y={p.y + 14}>{p.cls} — state class of this version&apos;s value</text>
              {p.rows.map((r) => (
                <g key={r.key}>
                  <text className="eye-cf-small" x={b.left - 8} y={r.y + 4} textAnchor="end">{clipText(r.key, 26)}</text>
                  <line className="eye-cf-axis-line" x1={b.left} x2={b.left + b.innerWidth} y1={r.y + 8} y2={r.y + 8} />
                  <text className="eye-cf-small" x={b.left} y={r.y + 19}>{r.lo}</text>
                  <text className="eye-cf-small" x={b.left + b.innerWidth} y={r.y + 19} textAnchor="end">{r.hi}</text>
                  {r.actualX !== null && r.versionX !== null ? <line className="eye-cf-series" x1={r.actualX} x2={r.versionX} y1={r.y} y2={r.y} strokeDasharray="3 2" /> : null}
                  {r.actualX === null ? null : <Marker shape="circle" x={r.actualX} y={r.y} />}
                  {r.versionX === null ? null : <Marker shape="square" x={r.versionX} y={r.y} />}
                </g>
              ))}
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── OptionMatrix (VIZ-29) ───────────────────────── */

/**
 * A DECISION OPTION MATRIX: options (rows) against criteria (columns), each criterion with its weight and ITS OWN scale from worst to best
 * (right is better; the ends printed); an unassessed cell a cross. No composite rank is drawn — the weights, ranges and dissent are declared.
 */
export function OptionMatrix({ spec, matrix, ...c }: Common & { matrix: OptionMatrixIn }) {
  const rows = useMemo(() => optionRows(matrix), [matrix]);
  const g = useMemo(() => optionGeometry(matrix), [matrix]);
  const b = g.box;
  const empty = matrix.options.length === 0 || matrix.criteria.length === 0;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.marks.filter((m) => !m.missing).map((m) => ({ x: m.x, y: m.y, row: m.row }))} {...c}
      {...(empty ? { status: c.status ?? { state: 'empty' as const, statement: 'no option or no criterion yet' } } : {})}
      notes={help('Each column is one criterion on its own scale, worst at the left, best at the right; positions are not comparable across columns, and no total is formed here.')}
      drawing={empty ? null : (
        <>
          {g.cols.map((col) => (
            <g key={col.key}>
              <text className="eye-cf-strong" x={col.x + g.colW / 2} y={18} textAnchor="middle">{col.title}</text>
              <text className="eye-cf-small" x={col.x + 12} y={36}>{col.lo}</text>
              <text className="eye-cf-small" x={col.x + g.colW - 12} y={36} textAnchor="end">{col.hi}</text>
              <line className="eye-cf-grid" x1={col.x} x2={col.x} y1={b.top - 10} y2={b.top + b.innerHeight} />
            </g>
          ))}
          {g.rowsY.map((r) => (
            <g key={r.key}>
              <text className="eye-cf-small" x={b.left - 8} y={r.y + 4} textAnchor="end">{r.title}</text>
              {g.cols.map((col) => <line key={col.key} className="eye-cf-axis-line" x1={col.x + 12} x2={col.x + g.colW - 12} y1={r.y} y2={r.y} />)}
            </g>
          ))}
          {g.marks.map((m) => <Marker key={`${m.option}|${m.criterion}`} shape={m.missing ? 'cross' : 'diamond'} x={m.x} y={m.y} r={m.missing ? 3.5 : 5} />)}
        </>
      )} />
  );
}

/* ───────────────────────── EvidenceCoverage (VIZ-30) ───────────────────────── */

/**
 * AN EVIDENCE COVERAGE: each count of support as a filled bar inside its whole (the open part is the gap) — citations that stand, options
 * citing evidence or a simulation, decision-grade runs; counts from zero. A count says how much is cited, never how good it is; what the read
 * does not measure (source classes, rights, freshness, diversity) is declared under Omissions.
 */
export function EvidenceCoverage({ spec, parts, ...c }: Common & { parts: readonly CoveragePartIn[] }) {
  const rows = useMemo(() => coverageRows(parts), [parts]);
  const g = useMemo(() => coverageGeometry(parts), [parts]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.bars.map((x) => ({ x: x.x + Math.max(4, x.partW), y: x.y + 9, row: x.row }))} {...c}
      notes={help('A filled bar is what is counted; the open remainder of its outline is the gap. Counts are not quality.')}
      drawing={(
        <>
          {g.bars.map((x) => {
            const p = parts[x.row]!;
            return (
              <g key={x.key}>
                <text className="eye-cf-small" x={b.left - 8} y={x.y + 13} textAnchor="end">{clipText(p.label, 32)}</text>
                <rect className="eye-cf-cell eye-cf-cell--missing" x={x.x} y={x.y} width={Math.max(1, x.wholeW)} height={18} />
                {x.partW > 0 ? <rect className="eye-cf-bar" x={x.x} y={x.y} width={x.partW} height={18} /> : null}
                <text className="eye-cf-small" x={x.x + Math.max(1, x.wholeW) + 6} y={x.y + 13}>{p.part ?? '?'} of {p.whole ?? '?'}</text>
              </g>
            );
          })}
        </>
      )} />
  );
}

/* ───────────────────────── StatusBoard (VIZ-33) ───────────────────────── */

/**
 * AN OPERATIONAL STATUS BOARD: each capability's state as a SHAPE AND A WORD (healthy circle, degraded triangle, unknown diamond, failed or
 * gap cross) — never a green light alone — worst first, with its service level and freshness beside it; dependencies, the degraded-mode
 * contract and the owner in the table. UNKNOWN is a state and is counted.
 */
export function StatusBoard({ spec, items, ...c }: Common & { items: readonly StatusIn[] }) {
  const rows = useMemo(() => statusRows(items), [items]);
  const g = useMemo(() => statusGeometry(items), [items]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.rows.map((r) => ({ x: b.left + 12, y: r.y, row: r.row }))} {...c}
      {...(items.length === 0 ? { status: c.status ?? { state: 'empty' as const, statement: 'the read lists no capability' } } : {})}
      notes={help('Worst first. Each state is a shape and a word; nothing here is shown healthy by default.')}
      drawing={items.length === 0 ? null : (
        <>
          {g.rows.map((r) => (
            <g key={r.key}>
              <line className="eye-cf-grid" x1={b.left} x2={b.left + b.innerWidth} y1={r.y + 13} y2={r.y + 13} />
              <Marker shape={r.marker} x={b.left + 12} y={r.y} r={5} />
              <text className="eye-cf-strong" x={b.left + 26} y={r.y + 4}>{r.word}</text>
              <text x={b.left + 130} y={r.y + 4}>{r.label}</text>
              <text className="eye-cf-small" x={b.left + 370} y={r.y + 4}>{r.detail}</text>
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── AlertQueue (VIZ-34) ───────────────────────── */

/**
 * AN ALERT QUEUE: the items in the DECLARED POLICY's order (position 1 first — never re-sorted by a score), each row its age as a line up to
 * now and its due time as a marker whose shape is the consequence class (C0 circle … C4 cross); a suppressed item's line dashed; "✓" an
 * acknowledged one. The reason, owner, acknowledgement and suppression are in the table.
 */
export function AlertQueue({ spec, items, ...c }: Common & { items: readonly AlertIn[] }) {
  const rows = useMemo(() => alertRows(items), [items]);
  const g = useMemo(() => alertGeometry(items), [items]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.rows.map((r) => ({ x: r.dueX ?? g.nowX, y: r.y, row: r.row }))} {...c}
      {...(items.length === 0 ? { status: c.status ?? { state: 'empty' as const, statement: 'no item in the queue' } } : {})}
      notes={help('The vertical line is the read\'s instant (now). Left of it: how long each item has been open; the marker: its due time (left of now is overdue).')}
      drawing={items.length === 0 ? null : (
        <>
          <XTicks box={b} ticks={g.xTicks} />
          <g className="eye-cf-cutoff"><line x1={g.nowX} x2={g.nowX} y1={b.top} y2={b.top + b.innerHeight} /><text x={g.nowX + 4} y={b.top + 10}>now</text></g>
          {g.rows.map((r) => (
            <g key={r.key}>
              <text className="eye-cf-small" x={b.left - 8} y={r.y + 4} textAnchor="end">{r.label}{r.acknowledged ? ' ✓' : ''}</text>
              {r.ageX0 === null ? null : <line className="eye-cf-series" x1={r.ageX0} x2={g.nowX} y1={r.y} y2={r.y} strokeDasharray={r.suppressed ? '4 3' : undefined} />}
              {r.dueX === null ? null : <Marker shape={r.marker} x={r.dueX} y={r.y} r={5} />}
            </g>
          ))}
        </>
      )} />
  );
}

/* ───────────────────────── AuditTimeline (VIZ-35) ───────────────────────── */

/**
 * AN AUDIT TIMELINE: the ledger's events on RECORD time, one lane per outcome (success circle, denied cross, failure triangle, indeterminate
 * diamond) — READ-ONLY: nothing here edits, hides or reorders an event; actor, action, event, result and the chain hash are in the table.
 */
export function AuditTimeline({ spec, events, ...c }: Common & { events: readonly AuditIn[] }) {
  const rows = useMemo(() => auditRows(events), [events]);
  const g = useMemo(() => auditGeometry(events), [events]);
  const b = g.box;
  return (
    <ScFrame spec={spec} rows={rows} box={b} points={g.marks.map((m) => ({ x: m.x, y: m.y, row: m.row }))} {...c}
      {...(g.empty ? { status: c.status ?? { state: 'empty' as const, statement: 'no event with a recorded instant in the window' } } : {})}
      notes={help(`${g.marks.length} event(s) placed on record time${g.unplaced > 0 ? `; ${g.unplaced} without a readable instant listed in the table, not placed` : ''}. Read-only.`)}
      drawing={g.empty ? null : (
        <>
          <XTicks box={b} ticks={g.xTicks} />
          {g.lanes.map((l) => <g key={l.key}><line className="eye-cf-grid" x1={b.left} x2={b.left + b.innerWidth} y1={l.y} y2={l.y} /><text className="eye-cf-small" x={b.left - 8} y={l.y + 4} textAnchor="end">{l.key}</text></g>)}
          {g.marks.map((m) => <Marker key={m.key} shape={m.marker} x={m.x} y={m.y} r={4} />)}
        </>
      )} />
  );
}
