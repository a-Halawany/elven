/**
 * B80 §TK (F-P7-E-03: UX-20-001…005, UX-17-004; Volume 9 Appendix B TS-01…TS-10) — THE SYMBOL REGISTRY: the truth-state symbols TS-01…10,
 * two truth glyphs the product already shows (extracted, disputed), and the status glyphs — each an SVG glyph on a 24 × 24 grid with its
 * MEANING, its canonical UPPERCASE LABEL, the semantic colour token that may tint it, and the digest of its glyph (UX-20-002: a changed
 * glyph is a changed digest; the registry is versioned). Colour is never the only cue (UX-17-004): a symbol is always rendered with its
 * label visible or as its accessible name, and the label is the CANONICAL TEXT shown wherever the glyph could be ambiguous (forced
 * colours, a small scale, a locale or a domain package that does not certify it — UX-20-005). An unknown symbol id resolves to the
 * certified GENERIC symbol with the canonical text it was given — never to a guessed meaning.
 */
import { sha256Hex } from './digest.js';

export const SYMBOLS_VERSION = '0.1.0';
export interface GlyphPath { d: string; fill: boolean; dashed?: boolean }
export interface SymbolDef {
  id: string; key: string; label: string; meaning: string; token: string; shape: string; paths: readonly GlyphPath[];
  /** a symbol that is the visible form of a CONSEQUENTIAL state (a decision, a withdrawal, a critical condition) is never shown unlabelled */
  consequential: boolean;
}

const o = (d: string): GlyphPath => ({ d, fill: false });
const f = (d: string): GlyphPath => ({ d, fill: true });
const CIRCLE = 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z';

const DEFS: readonly SymbolDef[] = [
  { id: 'TS-01', key: 'observed', label: 'OBSERVED', meaning: 'Directly recorded evidence; source and time required', token: 'color.observed', shape: 'Solid circle', paths: [f(CIRCLE)], consequential: false },
  { id: 'TS-02', key: 'asserted', label: 'ASSERTED', meaning: 'Claim made by an attributable source or actor', token: 'color.asserted', shape: 'Outlined square', paths: [o('M5 5h14v14H5Z')], consequential: false },
  { id: 'TS-03', key: 'inferred', label: 'INFERRED', meaning: 'Derived relationship or conclusion; method required', token: 'color.inferred', shape: 'Linked nodes', paths: [o('M7 7a2.5 2.5 0 1 1 0.01 0Z'), o('M17 17a2.5 2.5 0 1 1 0.01 0Z'), o('M8.8 8.8L15.2 15.2')], consequential: false },
  { id: 'TS-04', key: 'assessed', label: 'ASSESSED', meaning: 'Reviewed analytical judgment with uncertainty', token: 'color.assessed', shape: 'Diamond', paths: [o('M12 3l9 9-9 9-9-9Z')], consequential: false },
  { id: 'TS-05', key: 'synthetic', label: 'SYNTHETIC', meaning: 'Scenario, simulation, or generated state; never observed', token: 'color.synthetic', shape: 'Dashed hexagon', paths: [{ d: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z', fill: false, dashed: true }], consequential: false },
  { id: 'TS-06', key: 'recommended', label: 'RECOMMENDED', meaning: 'Advisory proposal with rationale and alternatives', token: 'color.recommended', shape: 'Open arrow', paths: [o('M4 12h14'), o('M13 6l6 6-6 6')], consequential: false },
  { id: 'TS-07', key: 'decided', label: 'DECIDED', meaning: 'Human decision bound to authority and digest', token: 'color.decided', shape: 'Signed check', paths: [o('M4 4h16v16H4Z'), o('M7.5 12.5l3 3 6-7')], consequential: true },
  { id: 'TS-08', key: 'corrected', label: 'CORRECTED', meaning: 'Replacement linked to preserved original', token: 'color.corrected', shape: 'Revision mark', paths: [o('M5 19l3.5-1 9.5-9.5-2.5-2.5L6 15.5Z'), o('M14 7l3 3'), o('M4 21h16')], consequential: false },
  { id: 'TS-09', key: 'withdrawn', label: 'WITHDRAWN', meaning: 'Not current; identity and history retained', token: 'color.withdrawn', shape: 'Barred circle', paths: [o(CIRCLE), o('M6.3 17.7L17.7 6.3')], consequential: true },
  { id: 'TS-10', key: 'indeterminate', label: 'INDETERMINATE', meaning: 'Required state cannot be resolved; use constrained', token: 'color.uncertain', shape: 'Question mark', paths: [o('M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4'), f('M12 17a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z')], consequential: false },
  // the two truth glyphs ui.tsx's TruthBadge already shows
  { id: 'TG-EXTRACTED', key: 'extracted', label: 'EXTRACTED', meaning: 'Extracted from a document by a recorded method; reviewable', token: 'color.inferred', shape: 'Magnifier', paths: [o('M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z'), o('M15.2 15.2L20 20')], consequential: false },
  { id: 'TG-DISPUTED', key: 'disputed', label: 'DISPUTED', meaning: 'Contested by an attributable party; both claims retained', token: 'color.warning', shape: 'Flag', paths: [o('M6 21V4'), o('M6 4h11l-2.5 4L17 12H6')], consequential: false },
  // status glyphs
  { id: 'ST-INFO', key: 'info', label: 'INFO', meaning: 'Informational state', token: 'color.info', shape: 'Circled i', paths: [o(CIRCLE), o('M12 11v5'), f('M12 7a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z')], consequential: false },
  { id: 'ST-SUCCESS', key: 'success', label: 'VERIFIED', meaning: 'Verified success — the server confirmed it', token: 'color.success', shape: 'Circled check', paths: [o(CIRCLE), o('M8 12.5l2.5 2.5 5.5-6')], consequential: false },
  { id: 'ST-WARNING', key: 'warning', label: 'WARNING', meaning: 'Warning or caution', token: 'color.warning', shape: 'Triangle with bar', paths: [o('M12 3.5l9 16H3Z'), o('M12 9.5v5'), f('M12 16.5a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z')], consequential: true },
  { id: 'ST-CRITICAL', key: 'critical', label: 'CRITICAL', meaning: 'Critical condition', token: 'color.critical', shape: 'Octagon with bar', paths: [o('M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3Z'), o('M12 7.5v5.5'), f('M12 15a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z')], consequential: true },
  { id: 'ST-DEGRADED', key: 'degraded', label: 'DEGRADED', meaning: 'Degraded operation — constrained, never hidden', token: 'color.degraded', shape: 'Half-filled circle', paths: [o(CIRCLE), f('M12 4a8 8 0 0 0 0 16Z')], consequential: true },
  { id: 'ST-CLASSIFICATION', key: 'classification', label: 'CLASSIFICATION', meaning: 'Classification banner — the tenant policy supplies the label', token: 'color.classification', shape: 'Shield', paths: [o('M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z')], consequential: false },
];

/** The certified GENERIC symbol (UX-20-005): shown, with the canonical text it was given, where a symbol is unknown or uncertified. */
export const GENERIC_SYMBOL: SymbolDef = { id: 'GEN-00', key: 'generic', label: 'STATE', meaning: 'A state named by its text label — no certified symbol applies', token: 'color.ink.muted', shape: 'Dot', paths: [f('M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z')], consequential: false };

/** The digest of a glyph (its paths, canonical). */
export const glyphDigest = (s: Pick<SymbolDef, 'paths'>): string => sha256Hex(JSON.stringify(s.paths.map((p) => [p.d, p.fill, p.dashed === true])));

export interface RegisteredSymbol extends SymbolDef { glyphDigest: string; version: string }
export const SYMBOLS: readonly RegisteredSymbol[] = Object.freeze([...DEFS, GENERIC_SYMBOL].map((s) => Object.freeze({ ...s, glyphDigest: glyphDigest(s), version: SYMBOLS_VERSION })));
const BY_KEY = new Map(SYMBOLS.map((s) => [s.key, s]));
const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

export interface ResolvedSymbol { symbol: RegisteredSymbol; label: string; substituted: boolean }
/** RESOLVE a symbol by key or id; an unknown one is the GENERIC symbol carrying the canonical text it was given (never a guessed meaning). */
export function resolveSymbol(keyOrId: string, canonicalText?: string): ResolvedSymbol {
  const s = BY_KEY.get(keyOrId) ?? BY_ID.get(keyOrId);
  if (s !== undefined) return { symbol: s, label: s.label, substituted: false };
  const label = (canonicalText ?? keyOrId).trim().toUpperCase() || GENERIC_SYMBOL.label;
  return { symbol: BY_KEY.get('generic')!, label, substituted: true };
}

/** When the canonical text label must be VISIBLE beside the glyph (UX-20-005): forced colours, a small scale, a consequential state, a
 *  substituted (generic) symbol, or a locale the registry does not certify the glyph for. Otherwise the label is the accessible name. */
export function labelMustShow(a: { consequential: boolean; substituted: boolean; forcedColors: boolean; scalePx: number; locale: string }): boolean {
  return a.consequential || a.substituted || a.forcedColors || a.scalePx < 14 || !CERTIFIED_LOCALES.includes(a.locale);
}
/** The locales the glyph set is certified for (a glyph read in another locale shows its text — B85 extends the corpus). */
export const CERTIFIED_LOCALES: readonly string[] = ['en', 'ar'];

/** No icon alone authorizes, approves, deletes, publishes, closes or escalates (UX-20-004): an icon-only control is admitted for C0/C1
 *  navigation and disclosure only; from C2 a control names its consequence in text. */
export function iconOnlyAdmitted(consequence: 'C0' | 'C1' | 'C2' | 'C3' | 'C4'): boolean { return consequence === 'C0' || consequence === 'C1'; }
