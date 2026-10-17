'use client';
/**
 * B80 §TK (F-P7-E-03: UX-20-001…005, UX-17-004; Volume 9 Appendix B TS-01…TS-10) — THE SYMBOL and THE LEGEND of the shared library. A
 * symbol is an SVG glyph from packages/tokens' registry, tinted by its semantic token (never the only cue), ALWAYS named: its canonical
 * UPPERCASE label is visible beside it, or it is the glyph's accessible name (role img). The label is shown wherever the glyph could be
 * ambiguous (forced colours — CSS in globals.css, a small scale, an uncertified locale, a consequential state, a substituted generic symbol);
 * an unknown id is the certified generic symbol with the text it was given. No icon alone authorizes anything: a control carries its own
 * text (lib/symbols-b80.ts controlLabelProblem). The decisions are lib/symbols-b80.ts's (pure, unit-tested); this file only renders them.
 */
import type { ReactNode } from 'react';
import { legendEntries, symbolView } from '../lib/symbols-b80';

export function Symbol({ id, text, size, showLabel, locale }: { id: string; text?: string; size?: number; showLabel?: boolean; locale?: string }) {
  const v = symbolView({ id, ...(text === undefined ? {} : { text }), ...(size === undefined ? {} : { sizePx: size }), ...(showLabel === undefined ? {} : { showLabel }),
    ...(locale === undefined ? {} : { locale }) });
  return (
    <span className="eye-symbol" data-symbol={v.id} data-label-visible={v.labelVisible ? 'true' : 'false'} title={v.meaning}>
      <svg className="eye-symbol-glyph" viewBox="0 0 24 24" width={v.sizePx} height={v.sizePx} focusable="false"
        {...(v.glyphHidden ? { 'aria-hidden': true } : { role: 'img', 'aria-label': v.accessibleName ?? v.label })}
        style={{ color: v.colourVar }}>
        {v.paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            {...(p.dashed === true ? { strokeDasharray: '3 2' } : {})} />
        ))}
      </svg>
      {/* the canonical label: visible when it must be, else kept for forced colours (globals.css shows it there) */}
      <span className={v.labelVisible ? 'eye-symbol-label' : 'eye-symbol-label eye-visually-hidden'} aria-hidden={v.labelVisible ? undefined : true}>{v.label}</span>
    </span>
  );
}

/** THE LEGEND (UX-20-003): the definitions of the symbols a surface shows — each once, in order; an unknown one stated, never guessed. */
export function Legend({ items, title, children }: { items: ReadonlyArray<string | { id: string; text?: string }>; title?: string; children?: ReactNode }) {
  const entries = legendEntries(items);
  return (
    <figure className="eye-legend" aria-label={title ?? 'Legend'}>
      <figcaption className="eye-text-label">{title ?? 'Legend'}</figcaption>
      <dl className="eye-legend-list">
        {entries.map((e) => (
          <div key={`${e.id}|${e.label}`} className="eye-legend-entry">
            <dt><Symbol id={e.substituted ? e.label : e.id} text={e.label} showLabel /></dt>
            <dd>{e.meaning}{e.substituted ? ' (no certified symbol — the generic one is shown with the text)' : ''} <span className="eye-text-unit">· {e.shape}</span></dd>
          </div>
        ))}
      </dl>
      {children}
    </figure>
  );
}
