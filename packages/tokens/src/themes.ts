/**
 * B80 §TK (F-P7-E-03: UX-68-001…005, UX-ADR-022, UX-17-005, REL-16, PAT-41) — THE THEMES: the certified CORE theme (Volume 9 Appendix A,
 * light + dark), the FALLBACK theme (the core palette re-asserted inside a scope whose customer theme is refused, uncertified or invalid),
 * the PRINT theme (light inks on paper white) and the FORCED-COLOURS reference palettes (the two system schemes the certification is
 * computed against), and THE CUSTOMER-THEME SCHEMA — an ALLOWED-KEY WHITELIST: the accent, the surface tints, the wordmark and the logo.
 * Every semantic, status, truth-state, ink, focus, border, selection and disabled token is NEVER mappable (UX-68-004: branding authority
 * controls approved appearance only; it cannot redefine semantic states, priority, truth or human decision controls).
 *
 * A customer theme applies on SCREEN only, in light and dark; print and forced colours always render the certified core palette (the
 * wordmark still prints) — so a theme can never diverge across output formats (UX-68-005). The same schema is enforced in SQL by 0118 §TK
 * (governance.theme_mapping_problem — the CHECK on governance.design_themes.mapping and the ports' refusal).
 */
import { COLOR_TOKENS } from './registry.js';
import { contrastMatrix, parseHex, type MatrixResult, type Mode, type SystemKey } from './contrast.js';

export const THEME_SCHEMA_VERSION = 'b80-tk-theme-1';
export type Palette = Readonly<Record<string, string>>;

const fromRegistry = (m: 'light' | 'dark'): Palette => Object.freeze(Object.fromEntries(COLOR_TOKENS.map((t) => [t.token, t[m]])));
/** THE CORE THEME — the certified palette every other theme falls back to. */
export const CORE_LIGHT: Palette = fromRegistry('light');
export const CORE_DARK: Palette = fromRegistry('dark');
export const PAPER = '#FFFFFF';
/** The tokens painted as paper in print (every surface and the selection). */
export const PRINT_SURFACES = ['color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated', 'color.selection'] as const;
/** THE PRINT THEME — the light inks on paper white. */
export const PRINT_PALETTE: Palette = Object.freeze({ ...CORE_LIGHT, ...Object.fromEntries(PRINT_SURFACES.map((k) => [k, PAPER])) });

/** THE FORCED-COLOURS REFERENCE PALETTES (the system colours of the two common high-contrast schemes) — the certification's reference only;
 *  the browser supplies the real ones, and colour carries no meaning under forced colours (the symbol and the label do). */
export const FORCED_COLORS_BLACK: Readonly<Record<SystemKey, string>> = Object.freeze({
  Canvas: '#000000', CanvasText: '#FFFFFF', LinkText: '#FFFF00', GrayText: '#3FF23F', Highlight: '#1AEBFF', HighlightText: '#000000', ButtonFace: '#000000', ButtonText: '#FFFFFF',
});
export const FORCED_COLORS_WHITE: Readonly<Record<SystemKey, string>> = Object.freeze({
  Canvas: '#FFFFFF', CanvasText: '#000000', LinkText: '#00009F', GrayText: '#600000', Highlight: '#37006E', HighlightText: '#FFFFFF', ButtonFace: '#FFFFFF', ButtonText: '#000000',
});
/** Which system colour each token takes under `forced-colors: active` (emitted by buildCss). */
export function forcedSystemColour(token: string): SystemKey {
  if (/^color\.(canvas|surface\.)/.test(token)) return 'Canvas';
  if (token === 'color.selection' || token === 'color.focus') return 'Highlight';
  if (/^color\.accent\./.test(token)) return 'LinkText';
  if (token === 'color.disabled.ink' || token === 'color.border.default') return 'GrayText';
  return 'CanvasText';
}

/** The certified named themes (REL-16). */
export const NAMED_THEMES = [
  { key: 'core', title: 'Core (light and dark) — Volume 9 Appendix A', modes: ['light', 'dark'] },
  { key: 'fallback', title: 'Fallback — the core palette re-asserted where a customer theme is refused, uncertified or invalid', modes: ['light', 'dark'] },
  { key: 'print', title: 'Print — light inks on paper white', modes: ['print'] },
  { key: 'forced-colors', title: 'Forced colours — the system palette; symbols and labels carry meaning', modes: ['forced_colors_black', 'forced_colors_white'] },
] as const;

/* ── THE CUSTOMER-THEME SCHEMA ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The colour keys a customer theme MAY map (brand expression: the accent and the surface tints). */
export const ALLOWED_COLOUR_KEYS = ['color.accent.default', 'color.accent.strong', 'color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated'] as const;
/** The non-colour brand keys (the wordmark text and the logo reference). */
export const BRAND_KEYS = ['brand.wordmark', 'brand.logo'] as const;
export const ALLOWED_KEYS: readonly string[] = [...ALLOWED_COLOUR_KEYS, ...BRAND_KEYS];
/** The keys that are NEVER mappable: every other token of the registry (semantic, status, truth, ink, focus, border, selection, disabled). */
export const PROTECTED_KEYS: readonly string[] = COLOR_TOKENS.map((t) => t.token).filter((k) => !(ALLOWED_COLOUR_KEYS as readonly string[]).includes(k));
const LOGO_SRC = /^\/brand\/[a-z0-9][a-z0-9-]{0,60}\.(svg|png)$/;

export type ColourValue = { light: string; dark: string } | { alias: string };
export interface ThemeMapping { [key: string]: unknown }
export interface MappingProblem { cls: 'semantic' | 'mapping' | 'alias'; key: string; message: string }

/** VALIDATE a customer theme's mapping (deterministic order: the keys sorted). Empty = valid. Mirrors governance.theme_mapping_problem. */
export function validateMapping(mapping: unknown): MappingProblem[] {
  if (mapping === null || typeof mapping !== 'object' || Array.isArray(mapping)) return [{ cls: 'mapping', key: '', message: 'a theme mapping is an object of allowed keys' }];
  const m = mapping as Record<string, unknown>;
  const keys = Object.keys(m).sort();
  if (keys.length === 0) return [{ cls: 'mapping', key: '', message: 'a theme maps at least one allowed key' }];
  const out: MappingProblem[] = [];
  for (const k of keys) {
    const v = m[k];
    if (PROTECTED_KEYS.includes(k)) { out.push({ cls: 'semantic', key: k, message: `${k} is a semantic or status token — a theme maps brand expression only (the accent, the surface tints, the wordmark, the logo)` }); continue; }
    if (!ALLOWED_KEYS.includes(k)) { out.push({ cls: 'mapping', key: k, message: `${k} is not a theme key (allowed: ${ALLOWED_KEYS.join(', ')})` }); continue; }
    if (k === 'brand.wordmark') {
      const t = (v as { text?: unknown } | null)?.text;
      if (typeof t !== 'string' || t.trim().length < 2 || t.trim().length > 40) out.push({ cls: 'mapping', key: k, message: 'the wordmark is { text } of 2–40 characters' });
      continue;
    }
    if (k === 'brand.logo') {
      const l = v as { src?: unknown; alt?: unknown } | null;
      if (typeof l?.src !== 'string' || !LOGO_SRC.test(l.src) || typeof l.alt !== 'string' || l.alt.trim().length < 2 || l.alt.trim().length > 80) {
        out.push({ cls: 'mapping', key: k, message: 'the logo is { src: /brand/<name>.svg|png (same origin), alt: 2–80 characters }' });
      }
      continue;
    }
    if (v !== null && typeof v === 'object' && 'alias' in v) {
      const a = (v as { alias?: unknown }).alias;
      if (typeof a !== 'string' || !(ALLOWED_COLOUR_KEYS as readonly string[]).includes(a) || a === k) out.push({ cls: 'alias', key: k, message: `${k} aliases ${String(a)} — an alias names another allowed colour key` });
      continue;
    }
    const c = v as { light?: unknown; dark?: unknown } | null;
    if (typeof c?.light !== 'string' || typeof c.dark !== 'string' || parseHex(c.light) === null || parseHex(c.dark) === null) {
      out.push({ cls: 'mapping', key: k, message: `${k} is { light: #RRGGBB, dark: #RRGGBB } or { alias: <allowed colour key> }` });
    }
  }
  if (out.length > 0) return out;
  // alias cycles (an alias resolves through the mapping; an unmapped target is the core value)
  for (const k of keys) {
    const seen = [k]; let cur = m[k];
    while (cur !== null && typeof cur === 'object' && 'alias' in cur) {
      const next = String((cur as { alias: string }).alias);
      if (seen.includes(next)) { out.push({ cls: 'alias', key: k, message: `the alias chain ${[...seen, next].join(' → ')} is a cycle` }); break; }
      seen.push(next); cur = m[next];
    }
  }
  return out;
}

/** The mapped colour keys resolved through their aliases (an unmapped alias target is the core value). Assumes a VALID mapping. */
export function resolveColours(mapping: ThemeMapping): Record<string, { light: string; dark: string }> {
  const out: Record<string, { light: string; dark: string }> = {};
  const resolve = (k: string, depth: number): { light: string; dark: string } => {
    const v = mapping[k];
    if (v === undefined) return { light: CORE_LIGHT[k]!, dark: CORE_DARK[k]! };
    if (depth > 8) throw new Error('alias depth');
    if (v !== null && typeof v === 'object' && 'alias' in v) return resolve(String((v as { alias: string }).alias), depth + 1);
    const c = v as { light: string; dark: string };
    return { light: c.light.toUpperCase(), dark: c.dark.toUpperCase() };
  };
  for (const k of ALLOWED_COLOUR_KEYS) if (mapping[k] !== undefined) out[k] = resolve(k, 0);
  return out;
}

/** The five modes' palettes for a mapping (null = the core theme). The customer theme applies to light and dark only. */
export function palettesFor(mapping: ThemeMapping | null): Record<Mode, Palette> {
  const r = mapping === null ? {} : resolveColours(mapping);
  const light: Record<string, string> = { ...CORE_LIGHT }; const dark: Record<string, string> = { ...CORE_DARK };
  for (const [k, v] of Object.entries(r)) { light[k] = v.light; dark[k] = v.dark; }
  return { light, dark, print: PRINT_PALETTE, forced_colors_black: FORCED_COLORS_BLACK, forced_colors_white: FORCED_COLORS_WHITE };
}

export interface ThemeCertification { schemaVersion: string; problems: MappingProblem[]; matrix: MatrixResult | null; outcome: 'certifiable' | 'refused' }
/** CERTIFY a mapping (the client's preview — the PORT recomputes this from the stored mapping and decides). */
export function certifyTheme(mapping: ThemeMapping | null): ThemeCertification {
  const problems = mapping === null ? [] : validateMapping(mapping);
  if (problems.length > 0) return { schemaVersion: THEME_SCHEMA_VERSION, problems, matrix: null, outcome: 'refused' };
  const matrix = contrastMatrix(palettesFor(mapping));
  return { schemaVersion: THEME_SCHEMA_VERSION, problems, matrix, outcome: matrix.outcome === 'pass' ? 'certifiable' : 'refused' };
}

/* ── THE CSS of a theme scope ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
const varName = (token: string): string => '--eye-' + token.replace(/\./g, '-');
const SCOPE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The CSS of a CUSTOMER theme scope `[data-eye-theme="<scopeId>"]` — screen only, never under forced colours (the system palette wins;
 *  print renders the core palette). Throws on an invalid mapping or scope id: nothing unvalidated is ever emitted. */
export function themeCss(mapping: ThemeMapping, scopeId: string): string {
  if (!SCOPE_ID.test(scopeId)) throw new Error(`not a theme scope id: ${scopeId}`);
  const problems = validateMapping(mapping);
  if (problems.length > 0) throw new Error(`invalid theme mapping: ${problems.map((p) => p.message).join('; ')}`);
  const r = resolveColours(mapping);
  const sel = `[data-eye-theme="${scopeId}"]`;
  const decl = (m: 'light' | 'dark', pad: string) => Object.keys(r).sort().map((k) => `${pad}${varName(k)}: ${r[k]![m]};`).join('\n');
  return `/* customer theme ${scopeId} — ${THEME_SCHEMA_VERSION}; screen only (print and forced colours render the certified core) */
@media screen and (forced-colors: none) {
  ${sel} {
${decl('light', '    ')}
  }
  :root[data-theme='dark'] ${sel} {
${decl('dark', '    ')}
  }
}
@media screen and (forced-colors: none) and (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) ${sel} {
${decl('dark', '    ')}
  }
}
`;
}

/** The CSS of a side-by-side PREVIEW (PAT-41): each mode's FULL palette (every colour token — the semantic ones at their certified values,
 *  the mapped ones at the candidate's) under `[data-eye-preview="<scopeId>"][data-eye-mode="light|dark|print"]`, independent of the page's
 *  own mode. `mapping` null previews the core theme. Throws on an invalid mapping or scope id. */
export function previewCss(mapping: ThemeMapping | null, scopeId: string): string {
  if (!SCOPE_ID.test(scopeId)) throw new Error(`not a theme scope id: ${scopeId}`);
  if (mapping !== null) { const problems = validateMapping(mapping); if (problems.length > 0) throw new Error(`invalid theme mapping: ${problems.map((p) => p.message).join('; ')}`); }
  const p = palettesFor(mapping);
  const block = (mode: 'light' | 'dark' | 'print') => `[data-eye-preview="${scopeId}"][data-eye-mode="${mode}"] {\n${Object.keys(p[mode]).sort().map((k) => `  ${varName(k)}: ${p[mode][k]};`).join('\n')}\n}`;
  return `/* theme preview ${scopeId} — ${THEME_SCHEMA_VERSION} */\n${block('light')}\n${block('dark')}\n${block('print')}\n`;
}
