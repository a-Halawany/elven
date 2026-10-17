/**
 * B80 §TK (F-P7-E-03: UX-20-001…005, UX-17-004, LAY-003) — THE SYMBOL CONTRACT as pure functions (the web has no DOM test environment;
 * components/symbols.tsx renders exactly what these decide, and the catalogue walk proves the rendering).
 *
 *   · a symbol is ALWAYS named: its canonical label is visible beside the glyph, or it is the glyph's accessible name (colour is never the
 *     only cue — UX-17-004); a decorative use beside its own visible text hides the glyph from assistive technology instead;
 *   · the label is SHOWN wherever the glyph could be ambiguous (forced colours, a small scale, a locale the glyph set is not certified for,
 *     a consequential state, a substituted generic symbol — UX-20-005); an unknown id is the certified GENERIC symbol with the given text;
 *   · no icon alone authorizes, approves, deletes, publishes, closes or escalates (UX-20-004): an icon-only control is C0/C1 only;
 *   · a consequential control is the 44px control (LAY-003: size.control.lg via --eye-size-control-consequential).
 */
import { GENERIC_SYMBOL, SYMBOLS, iconOnlyAdmitted, labelMustShow, resolveSymbol, type RegisteredSymbol } from '@eye/tokens';

export type Consequence = 'C0' | 'C1' | 'C2' | 'C3' | 'C4';
export interface SymbolView {
  id: string; key: string; shape: string; meaning: string; label: string; labelVisible: boolean; substituted: boolean;
  /** the CSS variable that may tint the glyph (never the only cue) */ colourVar: string;
  /** the glyph is hidden from assistive technology only when its name is visible text right beside it */ glyphHidden: boolean;
  /** the accessible name of the glyph when it is exposed */ accessibleName: string | null;
  paths: RegisteredSymbol['paths']; sizePx: number; glyphDigest: string;
}

const varOf = (token: string) => `var(--eye-${token.replace(/\./g, '-')})`;

/** DECIDE a symbol's presentation. */
export function symbolView(a: { id: string; text?: string; sizePx?: number; forcedColors?: boolean; locale?: string; showLabel?: boolean }): SymbolView {
  const r = resolveSymbol(a.id, a.text);
  const sizePx = a.sizePx ?? 16;
  const labelVisible = a.showLabel === true || labelMustShow({ consequential: r.symbol.consequential, substituted: r.substituted, forcedColors: a.forcedColors === true, scalePx: sizePx, locale: a.locale ?? 'en' });
  return {
    id: r.symbol.id, key: r.symbol.key, shape: r.symbol.shape, meaning: r.substituted ? `${r.label} — ${GENERIC_SYMBOL.meaning}` : r.symbol.meaning, label: r.label, labelVisible,
    substituted: r.substituted, colourVar: varOf(r.symbol.token), glyphHidden: labelVisible, accessibleName: labelVisible ? null : r.label,
    paths: r.symbol.paths, sizePx, glyphDigest: r.symbol.glyphDigest,
  };
}

export interface LegendEntry { id: string; label: string; shape: string; meaning: string; substituted: boolean }
/** THE LEGEND (UX-20-003): the definitions of the symbols a surface shows, in the order first shown, each once; an unknown id is stated as
 *  the generic symbol with its text — never a guessed meaning. */
export function legendEntries(items: ReadonlyArray<string | { id: string; text?: string }>): LegendEntry[] {
  const seen = new Set<string>(); const out: LegendEntry[] = [];
  for (const it of items) {
    const id = typeof it === 'string' ? it : it.id; const text = typeof it === 'string' ? undefined : it.text;
    const v = symbolView({ id, ...(text === undefined ? {} : { text }) });
    const k = `${v.id}|${v.label}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push({ id: v.id, label: v.label, shape: v.shape, meaning: v.meaning, substituted: v.substituted });
  }
  return out;
}

/** UX-20-004: why a control may not be icon-only (null = admitted). */
export function controlLabelProblem(a: { visibleText: string | null; consequence: Consequence }): string | null {
  if (a.visibleText !== null && a.visibleText.trim().length > 0) return null;
  return iconOnlyAdmitted(a.consequence) ? null : `a ${a.consequence} control names its consequence in text — no icon alone authorizes, approves, deletes, publishes, closes or escalates`;
}
/** LAY-003: the control size by consequence (44px from C2: touch and consequential controls). */
export function controlSizeVar(consequence: Consequence): string {
  return consequence === 'C0' || consequence === 'C1' ? 'var(--eye-size-control-md)' : 'var(--eye-size-control-consequential)';
}

/** The registry as the token inspection lists it. */
export const symbolRegistry = (): ReadonlyArray<RegisteredSymbol> => SYMBOLS;
