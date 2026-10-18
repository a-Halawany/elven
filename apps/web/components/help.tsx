'use client';
/**
 * CP-6 B81 §CT — TERM and HELP PANEL of the shared library (F-P7-E-18: GLB-20, UX-69-001/-004/-005, UX-ADR-021, CNT-04, CNT-16). The
 * decisions are lib/content-b81.ts's (pure, unit-tested); this file only renders them:
 *
 *  - Term: the CANONICAL label in the text, with its explanation for the reader's audience on HOVER and on keyboard FOCUS (a tooltip that
 *    is dismissible with Escape, hoverable and persistent while hovered or focused — WCAG 1.4.13). The description is always in the
 *    accessibility tree (aria-describedby). An explanation that would dilute the term is never shown — the definition is (explanationFor).
 *    A truth state carries its SYMBOL and its definition (CNT-04). A fallback (untranslated, a corrected source, an unreviewed translation,
 *    the symbol registry) is MARKED in words, never hidden. A synonym is never shown as the canonical label.
 *  - HelpPanel: a contextual explanation and an example; EVERY required condition is in the always-visible part — only the secondary
 *    detail is deferred (helpModel); the panel never hides what an act requires.
 *
 * Styling: the B81 ct block of app/globals.css on semantic tokens only (B107's lint). Logical properties (the tooltip mirrors under RTL).
 * Forced colours: borders, not shadows. CONSTRUCTION only.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { Audience } from '../lib/b81-seams';
import { Symbol } from './symbols';
import { explanationFor, helpModel, truthSymbolId, type HelpInput, type ResolvedTerm, type TermRecord } from '../lib/content-b81';

const AUDIENCE_WORD: Record<Audience, string> = { executive: 'For executives', analyst: 'For analysts', operator: 'For operators' };

/**
 * A canonical term in running text. `term` is the record the page read (or a ResolvedTerm with its locale mark); `audience` is the
 * reader's (the role the page serves); `children` may give the inline text (it must name the same concept — the tooltip states the
 * canonical label).
 */
export function Term({ term, audience, children }: { term: TermRecord | ResolvedTerm; audience: Audience; children?: ReactNode }) {
  const resolved: ResolvedTerm = 'term' in term ? term : { term, mark: term.state === 'registry' ? 'registry' : 'canonical', fallback: term.state === 'registry', markText: null };
  const t = resolved.term;
  const x = explanationFor(t, audience);
  const symbolId = t.category === 'truth_state' ? truthSymbolId(t.key) : null;
  const [open, setOpen] = useState(false);
  const id = useId(); const tipId = `${id}-tip`;
  const hover = useRef(false); const focus = useRef(false);
  const sync = useCallback(() => setOpen(hover.current || focus.current), []);
  const mark = resolved.markText ?? (resolved.mark === 'registry' ? 'From the symbol registry — no published explanation yet' : null);
  return (
    <span className="eye-term-anchor"
      onMouseEnter={() => { hover.current = true; sync(); }} onMouseLeave={() => { hover.current = false; sync(); }}>
      <span className="eye-term" tabIndex={0} aria-describedby={tipId} data-term={t.key} data-mark={resolved.mark}
        onFocus={() => { focus.current = true; sync(); }} onBlur={() => { focus.current = false; sync(); }}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); hover.current = false; setOpen(false); } }}>
        {symbolId !== null ? <Symbol id={symbolId} showLabel={children === undefined} /> : null}
        {children ?? (symbolId === null ? t.label : null)}
      </span>
      <span role="tooltip" id={tipId} className="eye-term-tip" hidden={!open}>
        <span className="eye-term-tip-label">{t.label}</span>
        <span className="eye-term-tip-text">
          {x.fellBack ? <>Definition: {t.definition}</> : <>{AUDIENCE_WORD[audience]}: {x.text}</>}
        </span>
        {!x.fellBack ? <span className="eye-term-tip-definition">Definition: {t.definition}</span> : null}
        {mark !== null ? <span className="eye-term-tip-mark">{mark}</span> : null}
        {t.version > 0 ? <span className="eye-term-tip-version">Term {t.key} · version {t.version}</span> : null}
      </span>
    </span>
  );
}

/**
 * Contextual help (CNT-16): the explanation, an example and every REQUIRED CONDITION visible; `children` (the secondary detail) is the only
 * deferred part. `terms` lists canonical terms the help uses (each rendered with Term). A help model problem is shown, not hidden.
 */
export function HelpPanel({ title, explanation, example, conditions, audience, terms, children, level }: {
  title: string; explanation: string; example?: string | null; conditions?: readonly string[]; audience?: Audience;
  terms?: ReadonlyArray<TermRecord | ResolvedTerm>; children?: ReactNode; level?: 2 | 3;
}) {
  const input: HelpInput = { title, explanation, example: example ?? null, conditions: conditions ?? [] };
  const m = helpModel(input);
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <aside className="eye-help" aria-labelledby={id}>
      <H id={id} className="eye-help-title">{m.title}</H>
      <p className="eye-help-text">{m.explanation}</p>
      {m.example !== null ? <p className="eye-help-example"><span className="eye-help-key">Example: </span>{m.example}</p> : null}
      <div className="eye-help-conditions">
        <span className="eye-help-key">{m.conditions.length === 0 ? 'Required conditions: none stated' : 'Required conditions'}</span>
        {m.conditions.length > 0 ? <ul>{m.conditions.map((c) => <li key={c}>{c}</li>)}</ul> : null}
      </div>
      {terms !== undefined && terms.length > 0 ? (
        <p className="eye-help-terms"><span className="eye-help-key">Terms: </span>
          {terms.map((t, i) => <span key={'term' in t ? t.term.key : t.key}>{i > 0 ? ' · ' : ''}<Term term={t} audience={audience ?? 'analyst'} /></span>)}
        </p>
      ) : null}
      {m.problems.length > 0 ? <p className="eye-help-problem" role="note">Help incomplete: {m.problems.join('; ')}</p> : null}
      {children !== undefined ? <details className="eye-help-detail"><summary>More detail</summary>{children}</details> : null}
    </aside>
  );
}
