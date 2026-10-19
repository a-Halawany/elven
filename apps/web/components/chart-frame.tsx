'use client';
/**
 * B82 §0 (the integrator's prelude) — THE CHART FRAME SKELETON (CMP-057, VIZ-36, GLB-07, UX-ADR-015): the one frame every chart, graph view
 * and map of the library composes (§CF, §SC, §GM), so they code to one contract from day one. §CF completes its states (the ChartLegend, the
 * DataTooltip, the alternative's CSV through B80's exportCsv) — additions only, every one OPTIONAL (the props-contract compatibility gate).
 *
 *  - A `<figure>` named by its `<figcaption>` (the spec's title). No heading element: the page owns its one level-1 heading and its outline.
 *  - The DECLARATIONS a reader needs to interpret it, always shown: basis, time (basis, cutoff, as-of), units, sources, uncertainty
 *    (lib/b82-seams.ts ChartSpec). A SYNTHETIC catalogue specimen says so.
 *  - The drawing (children: hand-written SVG — DESIGN D3) inside role="img", described by the alternative's summary.
 *  - THE MANDATORY TABLE ALTERNATIVE: always rendered (never behind a toggle), a named region reachable by keyboard (B80's DataTable: a real
 *    table with caption and scoped headers inside a focusable region), its text summary first, its definitions after.
 *  - REFUSAL: when assertGrammar(spec) finds a problem, the frame draws NEITHER the chart NOR the table — it renders the problems, in words.
 *    Presentation never changes meaning; nothing is drawn without its declarations.
 *
 * Styling: the `B82 §0 cf` block of app/globals.css — semantic tokens only, logical properties (RTL mirrors), forced-colors kept, wraps at
 * 390 px and 200 % zoom. CONSTRUCTION only — nothing here is demonstrated or accepted.
 */
import { useId, useMemo, type ReactNode } from 'react';
import { DataTable, type DataColumn } from './data';
import { Timestamp } from './text';
import { assertGrammar, type AlternativeRow, type ChartSource, type ChartSpec, type TimeBasis } from '../lib/b82-seams';

const TIME_WORDS: Readonly<Record<TimeBasis, string>> = {
  event: 'event time', observation: 'observation time', valid: 'valid time', record: 'record time', horizon: 'forecast horizon', none: 'not ordered by time',
};

function sourceText(s: ChartSource): string {
  if ('specimen' in s) return `SYNTHETIC specimen — ${s.specimen}`;
  if ('citation' in s) return `${s.label} (${s.citation.kind} ${s.citation.id} v${s.citation.version})`;
  return `${s.label} (${s.read})`;
}

interface Keyed { i: number; r: AlternativeRow }

export function ChartFrame({ spec, rows, children }: {
  /** the chart's declarations — checked by assertGrammar before anything is drawn */ spec: ChartSpec;
  /** the table alternative's rows, keyed by spec.alternative.columns' keys (null = unknown) */ rows: readonly AlternativeRow[];
  /** the drawing (SVG); omitted, the frame shows the declarations and the alternative alone */ children?: ReactNode;
}) {
  const id = useId();
  const problems = useMemo(() => assertGrammar(spec), [spec]);
  const keyed = useMemo<Keyed[]>(() => rows.map((r, i) => ({ i, r })), [rows]);
  const columns = useMemo<Array<DataColumn<Keyed>>>(() => (Array.isArray(spec?.alternative?.columns) ? spec.alternative.columns : []).map((c) => ({
    key: c.key,
    label: c.unit !== undefined && c.unit !== '' ? `${c.label} (${c.unit})` : c.label,
    kind: c.kind === 'state' ? 'text' : c.kind,
    value: (x: Keyed) => x.r[c.key] ?? null,
    sortable: true,
  })), [spec]);
  const title = typeof spec?.title === 'string' && spec.title.trim() !== '' ? spec.title : 'Untitled chart';
  const titleId = `${id}-title`; const summaryId = `${id}-summary`;

  if (problems.length > 0) {
    return (
      <figure className="eye-cf eye-cf--refused" aria-labelledby={titleId} data-chart-kind={String(spec?.kind ?? '')}>
        <figcaption id={titleId} className="eye-cf-title">{title}</figcaption>
        <div className="eye-cf-refused" role="note" aria-label={`${title}: not drawn`}>
          <p>Not drawn: this chart does not declare everything a reader needs to interpret it. The page that supplies it declares what is listed here; then the chart and its table alternative are shown.</p>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </figure>
    );
  }

  const t = spec.time;
  const specimen = spec.sources.some((s) => 'specimen' in s);
  return (
    <figure className="eye-cf" aria-labelledby={titleId} data-chart-kind={spec.kind}>
      <figcaption id={titleId} className="eye-cf-title">{title}{specimen ? ' — SYNTHETIC specimen' : ''}</figcaption>
      <dl className="eye-cf-declarations" aria-label={`${title}: what the chart declares`}>
        <div><dt>Basis</dt><dd>{spec.basis}</dd></div>
        <div>
          <dt>Time</dt>
          <dd>
            {TIME_WORDS[t.basis]} · cutoff {typeof t.cutoff === 'string' ? <Timestamp value={t.cutoff} /> : <span>none — {t.cutoff.absent}</span>} · as of <Timestamp value={t.asOf} />
          </dd>
        </div>
        <div><dt>Units</dt><dd>{spec.units.map((u) => `${u.measure} (${u.unit})`).join('; ')}</dd></div>
        <div><dt>Sources</dt><dd>{spec.sources.map(sourceText).join('; ')}</dd></div>
        <div>
          <dt>Uncertainty</dt>
          <dd>{spec.uncertainty.statement}{typeof spec.uncertainty.level === 'number' ? ` (${Math.round(spec.uncertainty.level * 1000) / 10} % coverage)` : ''}</dd>
        </div>
      </dl>
      {children !== undefined && children !== null && (
        <div className="eye-cf-drawing" role="img" aria-label={`${title}: the drawing. Every value is in the table alternative.`} aria-describedby={summaryId}>
          {children}
        </div>
      )}
      <section className="eye-cf-alternative" aria-label={`Table alternative: ${title}`}>
        <p id={summaryId} className="eye-cf-summary">{spec.alternative.summary}</p>
        <DataTable<Keyed>
          label={`Table alternative: ${title}`}
          columns={columns}
          rows={keyed}
          rowId={(x) => String(x.i)}
          exportAs={null}
          noun="rows"
        />
        {spec.alternative.definitions !== undefined && spec.alternative.definitions.length > 0 && (
          <dl className="eye-cf-definitions" aria-label={`${title}: definitions`}>
            {spec.alternative.definitions.map((d) => <div key={d.term}><dt>{d.term}</dt><dd>{d.definition}</dd></div>)}
          </dl>
        )}
      </section>
    </figure>
  );
}
