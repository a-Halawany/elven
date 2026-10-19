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
 *
 * B82 §CF COMPLETES THE FRAME (CMP-057 / -058 / VIZ-36 / GLB-07 / UX-ADR-015) — every addition OPTIONAL, the §0 props unchanged:
 *  - THE GRAMMAR grows by addition only: lib/chart-b82.ts chartGrammar = §0's assertGrammar (first, unchanged) + the kind rules + the rows
 *    checked against the alternative's columns; a problem still refuses the whole chart, in words.
 *  - THE LEGEND (ChartLegend, components/chart.tsx): always drawn from spec.legend — each series by its dash pattern, marker shape and label
 *    (never colour alone, D5); B80's symbol Legend stays the glyph legend.
 *  - THE CSV (`exportAs`): the table alternative's DISPLAYED rows through B80's DataTable export (lib/table-b80.ts exportCsv — labelled with
 *    the scope, the classification ceiling and the as-of instant); without `exportAs` no download is offered (a page with no authorized read
 *    to label offers none — B80's rule).
 *  - THE STATES (`status`): loading (the declarations wait, aria-busy), error (the server's words, ErrorNote), withheld (the policy's words —
 *    nothing drawn, nothing tabled), empty (the declarations and the statement; the table states it has no rows), stale (the statement before
 *    the drawing — never hidden). Rest / hover / focus / active are the chart components' (DataTooltip).
 *  - `interactive`: a drawing with keyboard-focusable points is a named GROUP (focusable descendants of role="img" are hidden from assistive
 *    technology); its points are buttons whose names are their table rows. A static drawing stays role="img".
 */
import { useId, useMemo, type ReactNode } from 'react';
import { Timestamp } from './text';
import { type AlternativeRow, type ChartSource, type ChartSpec, type TimeBasis } from '../lib/b82-seams';
/* B82 cf */
import { ErrorNote } from './ui';
import { AccessibleAlternative, ChartLegend } from './chart';
import { chartGrammar } from '../lib/chart-b82';
import type { ExportLabel } from '../lib/table-b80';
/** The frame's states beyond rest (CMP-057): each says what it is in words; none draws a value it does not have. */
export type ChartStatus =
  | { state: 'ready' }
  | { state: 'loading' }
  | { state: 'error'; error: { code: string; message: string; correlationId: string } }
  | { state: 'withheld'; statement: string }
  | { state: 'empty'; statement: string }
  | { state: 'stale'; statement: string };
/* end B82 cf */

const TIME_WORDS: Readonly<Record<TimeBasis, string>> = {
  event: 'event time', observation: 'observation time', valid: 'valid time', record: 'record time', horizon: 'forecast horizon', none: 'not ordered by time',
};

function sourceText(s: ChartSource): string {
  if ('specimen' in s) return `SYNTHETIC specimen — ${s.specimen}`;
  if ('citation' in s) return `${s.label} (${s.citation.kind} ${s.citation.id} v${s.citation.version})`;
  return `${s.label} (${s.read})`;
}


export function ChartFrame({ spec, rows, children, /* B82 cf */ exportAs, status, interactive, notes /* end B82 cf */ }: {
  /** the chart's declarations — checked by assertGrammar before anything is drawn */ spec: ChartSpec;
  /** the table alternative's rows, keyed by spec.alternative.columns' keys (null = unknown) */ rows: readonly AlternativeRow[];
  /** the drawing (SVG); omitted, the frame shows the declarations and the alternative alone */ children?: ReactNode;
  /* B82 cf */
  /** the alternative's CSV (B80's exportCsv over the displayed rows) labelled for the read; omitted, no download is offered */ exportAs?: ExportLabel;
  /** loading, error, withheld, empty or stale — in words (default: ready) */ status?: ChartStatus;
  /** the drawing has keyboard-focusable points (a named group, not role="img") */ interactive?: boolean;
  /** what the drawing shows beyond the declarations (gaps, unplaced events, a residual) — always rendered as text beside it */ notes?: ReactNode;
  /* end B82 cf */
}) {
  const id = useId();
  /* B82 cf: the grammar grows by addition only — chartGrammar = assertGrammar first, then the kind rules and the rows */
  const problems = useMemo(() => chartGrammar(spec, rows), [spec, rows]);
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
  /* B82 cf: the states before the declarations are drawn */
  const st = status ?? { state: 'ready' as const };
  if (st.state === 'loading' || st.state === 'error' || st.state === 'withheld') {
    return (
      <figure className="eye-cf" aria-labelledby={titleId} data-chart-kind={spec.kind} data-chart-state={st.state} aria-busy={st.state === 'loading' ? true : undefined}>
        <figcaption id={titleId} className="eye-cf-title">{title}{specimen ? ' — SYNTHETIC specimen' : ''}</figcaption>
        {st.state === 'loading' ? <p className="eye-cf-state" role="status">Reading the values — nothing is drawn until they arrive.</p> : null}
        {st.state === 'error' ? <><p className="eye-cf-state">Not drawn: the read was refused or failed. The server&apos;s words:</p><ErrorNote error={st.error} /></> : null}
        {st.state === 'withheld' ? <p className="eye-cf-state" role="note">Withheld — {st.statement}. Nothing is drawn and no value is tabled.</p> : null}
      </figure>
    );
  }
  /* end B82 cf */
  return (
    <figure className="eye-cf" aria-labelledby={titleId} data-chart-kind={spec.kind} data-chart-state={st.state}>
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
      {/* B82 cf: the legend (dash, marker, label — never colour alone), the stale / empty statements, the drawing's notes */}
      <ChartLegend entries={spec.legend} label={`${title}: legend`} />
      {st.state === 'stale' || st.state === 'empty' ? <p className="eye-cf-state" role="note"><strong>{st.state === 'stale' ? 'Stale' : 'No values'}</strong> — {st.statement}</p> : null}
      {/* end B82 cf */}
      {children !== undefined && children !== null && st.state !== 'empty' && (
        <div className="eye-cf-drawing" role={interactive === true ? 'group' : 'img'} aria-roledescription={interactive === true ? 'chart' : undefined}
          aria-label={interactive === true ? `${title}: the drawing — each point is a button that shows its table row; arrow keys move between points, Escape closes the value.` : `${title}: the drawing. Every value is in the table alternative.`}
          aria-describedby={summaryId}>
          {children}
        </div>
      )}
      {/* B82 cf */}{notes !== undefined && notes !== null ? <div className="eye-cf-notes">{notes}</div> : null}{/* end B82 cf */}
      {/* B82 cf: the mandatory alternative — AccessibleAlternative (components/chart.tsx): summary, the table, the definitions, the CSV when labelled */}
      <AccessibleAlternative spec={spec} rows={rows} title={title} summaryId={summaryId} {...(exportAs === undefined ? {} : { exportAs })} />
    </figure>
  );
}
