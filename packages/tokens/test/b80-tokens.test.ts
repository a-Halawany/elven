/**
 * B80 §TK (F-P7-E-03) — the contrast matrix, the themes and the customer-theme schema, the symbol registry, the digest and the generated
 * sheet. CONSTRUCTION evidence; every customer palette here is SYNTHETIC (a fictitious brand's values).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COLOR_TOKENS, ELEVATION_TOKENS, MOTION_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SPACE_TOKENS, TYPE_TOKENS,
} from '../src/registry.js';
import { TEXT_ROLES, buildCss, typeClass, varName } from '../src/css.js';
import {
  CONTRAST_RULES_VERSION, colourModeRules, contrastMatrix, contrastRatio, deltaE76, deltaE76Cvd, floor2, forcedModeRules, pairText, parseHex, relativeLuminance,
} from '../src/contrast.js';
import {
  ALLOWED_COLOUR_KEYS, ALLOWED_KEYS, CORE_DARK, CORE_LIGHT, FORCED_COLORS_BLACK, PRINT_PALETTE, PROTECTED_KEYS, certifyTheme, forcedSystemColour, palettesFor, resolveColours,
  previewCss, themeCss, validateMapping,
} from '../src/themes.js';
import { GENERIC_SYMBOL, SYMBOLS, glyphDigest, iconOnlyAdmitted, labelMustShow, resolveSymbol } from '../src/symbols.js';
import { sha256Hex } from '../src/digest.js';

/** A fictitious brand (SYNTHETIC): v1 tints the primary surface so far that the status inks fail; v2 is the corrected tint. */
export const BRAND_V1 = { 'color.accent.default': { light: '#00476B', dark: '#7CC4E8' }, 'color.accent.strong': { light: '#003352', dark: '#A8DAF2' },
  'color.surface.primary': { light: '#D5CFC8', dark: '#111A27' }, 'brand.wordmark': { text: 'NORDWERK' } };
export const BRAND_V2 = { ...BRAND_V1, 'color.surface.primary': { light: '#F7F5F2', dark: '#111A27' } };

describe('WCAG 2.x contrast, ΔE76 and colour-vision simulation', () => {
  it('relative luminance and the ratio: the fixed points, symmetry, unrounded comparison, floored display', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(contrastRatio('#000000', '#FFFFFF'));
    const r = contrastRatio('#777777', '#FFFFFF');
    expect(r).toBeGreaterThan(4.47); expect(r).toBeLessThan(4.5);
    expect(floor2(4.4999)).toBe(4.49);
    expect(floor2(r)).toBe(4.47);
    expect(parseHex('#12345')).toBeNull(); expect(parseHex('red')).toBeNull(); expect(parseHex('#0b6674')).toEqual([11, 102, 116]);
  });
  it('ΔE76: identical colours are 0; the core accent and critical are far apart; simulation narrows a red/green pair', () => {
    expect(deltaE76('#0B6674', '#0B6674')).toBe(0);
    expect(deltaE76(CORE_LIGHT['color.accent.default']!, CORE_LIGHT['color.critical']!)).toBeGreaterThan(90);
    const red = '#C8102E'; const green = '#2E8B57';
    expect(deltaE76Cvd(red, green, 'deutan')).toBeLessThan(deltaE76(red, green));
  });
  it('the pair rules: text 4.5, non-text 3, distinct 25, distinct under protan/deutan/tritan 12 — deterministic', () => {
    const rules = colourModeRules();
    expect(rules).toHaveLength(124);
    expect(rules.filter((r) => r.kind === 'text').every((r) => r.required === 4.5)).toBe(true);
    expect(rules.filter((r) => r.kind === 'non_text').every((r) => r.required === 3)).toBe(true);
    expect(rules.some((r) => r.kind === 'distinct' && r.fg === 'color.accent.default' && r.bg === 'color.critical')).toBe(true);
    expect(rules.some((r) => r.kind === 'distinct' && r.fg === 'color.recommended' && r.bg === 'color.decided')).toBe(true);
    expect(rules.filter((r) => r.kind === 'distinct_cvd').map((r) => r.cvd)).toEqual(['protan', 'protan', 'deutan', 'deutan', 'tritan', 'tritan']);
    expect(rules.some((r) => r.fg === 'color.disabled.ink' || r.bg === 'color.disabled.ink')).toBe(false);
    expect(forcedModeRules()).toHaveLength(5);
    expect(JSON.stringify(colourModeRules())).toBe(JSON.stringify(rules));
  });
});

describe('THE CORE THEME certifies in every mode (REL-16, UX-17-001)', () => {
  const core = certifyTheme(null);
  it('light, dark, print and both forced-colour schemes: 382 pairs, none failing', () => {
    expect(core.outcome).toBe('certifiable');
    expect(core.matrix!.rulesVersion).toBe(CONTRAST_RULES_VERSION);
    expect(core.matrix!.pairs).toBe(382);
    expect(core.matrix!.modes.map((m) => [m.mode, m.pairs, m.failing])).toEqual([
      ['light', 124, 0], ['dark', 124, 0], ['print', 124, 0], ['forced_colors_black', 5, 0], ['forced_colors_white', 5, 0]]);
  });
  it('the pinned numbers the SQL port must reproduce (phase6-themes-b80 compares them pair by pair)', () => {
    const at = (mode: string, fg: string, bg: string) => core.matrix!.results.find((r) => r.mode === mode && r.fg === fg && r.bg === bg)!.shown;
    expect(at('light', 'color.ink.muted', 'color.selection')).toBe(4.96);
    expect(at('light', 'color.success', 'color.surface.secondary')).toBe(4.71);
    expect(at('light', 'color.critical', 'color.surface.primary')).toBe(6.57);
    expect(at('dark', 'color.focus', 'color.selection')).toBe(5.47);
    expect(core.matrix!.modes[0]!.minText).toBe(4.71);
  });
  it('the palettes: print is paper white under light inks; forced colours are the system reference; the core is the registry', () => {
    const p = palettesFor(null);
    expect(p.light).toEqual(CORE_LIGHT); expect(p.dark).toEqual(CORE_DARK);
    expect(p.print['color.surface.secondary']).toBe('#FFFFFF'); expect(p.print['color.critical']).toBe(CORE_LIGHT['color.critical']);
    expect(p.forced_colors_black).toEqual(FORCED_COLORS_BLACK);
    for (const t of COLOR_TOKENS) { expect(CORE_LIGHT[t.token]).toBe(t.light); expect(CORE_DARK[t.token]).toBe(t.dark); }
  });
});

describe('THE CUSTOMER-THEME SCHEMA: allowed keys only (UX-68-004, UX-ADR-010/022)', () => {
  it('the whitelist is the accent, the surface tints, the wordmark and the logo; every semantic and status token is protected', () => {
    expect([...ALLOWED_COLOUR_KEYS]).toEqual(['color.accent.default', 'color.accent.strong', 'color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated']);
    expect(ALLOWED_KEYS).toContain('brand.logo');
    for (const k of ['color.critical', 'color.warning', 'color.success', 'color.info', 'color.decided', 'color.recommended', 'color.withdrawn', 'color.observed', 'color.synthetic',
      'color.focus', 'color.ink.default', 'color.selection', 'color.disabled.ink', 'color.border.strong', 'color.classification', 'color.degraded']) expect(PROTECTED_KEYS).toContain(k);
    expect(PROTECTED_KEYS).toHaveLength(COLOR_TOKENS.length - ALLOWED_COLOUR_KEYS.length);
  });
  it('refusals in classes: semantic (a status key), mapping (unknown key, bad value, bad logo, bad wordmark, empty), alias (unknown target, cycle)', () => {
    expect(validateMapping({ 'color.critical': { light: '#000000', dark: '#000000' } })).toEqual([expect.objectContaining({ cls: 'semantic', key: 'color.critical' })]);
    expect(validateMapping({ 'font.family.ui': 'Comic' })[0]!.cls).toBe('mapping');
    expect(validateMapping({ 'color.canvas': { light: 'red', dark: '#000000' } })[0]!.cls).toBe('mapping');
    expect(validateMapping({ 'brand.logo': { src: 'https://cdn.example/logo.svg', alt: 'Logo' } })[0]!.cls).toBe('mapping');
    expect(validateMapping({ 'brand.logo': { src: '/brand/nordwerk.svg', alt: 'NORDWERK wordmark' } })).toEqual([]);
    expect(validateMapping({ 'brand.wordmark': { text: 'N' } })[0]!.cls).toBe('mapping');
    expect(validateMapping({})[0]!.cls).toBe('mapping');
    expect(validateMapping([])[0]!.cls).toBe('mapping');
    expect(validateMapping({ 'color.accent.strong': { alias: 'color.critical' } })[0]!.cls).toBe('alias');
    const cycle = validateMapping({ 'color.accent.default': { alias: 'color.accent.strong' }, 'color.accent.strong': { alias: 'color.accent.default' } });
    expect(cycle.map((p) => p.cls)).toEqual(['alias', 'alias']);
    expect(cycle[0]!.message).toMatch(/is a cycle/);
  });
  it('aliases resolve through the mapping and to the core value when the target is unmapped', () => {
    const r = resolveColours({ 'color.accent.strong': { alias: 'color.accent.default' }, 'color.accent.default': { light: '#00476b', dark: '#7CC4E8' }, 'color.canvas': { alias: 'color.surface.primary' } });
    expect(r['color.accent.strong']).toEqual({ light: '#00476B', dark: '#7CC4E8' });
    expect(r['color.canvas']).toEqual({ light: CORE_LIGHT['color.surface.primary'], dark: CORE_DARK['color.surface.primary'] });
  });
  it('a contrast-reducing tint is REFUSED with the failing pairs named and their ratios; the corrected tint certifies', () => {
    const v1 = certifyTheme(BRAND_V1);
    expect(v1.outcome).toBe('refused');
    const critical = v1.matrix!.failing.find((p) => p.fg === 'color.critical' && p.bg === 'color.surface.primary' && p.mode === 'light')!;
    expect(critical.shown).toBe(4.25);
    expect(pairText(critical)).toBe('light: color.critical on color.surface.primary 4.25:1 < 4.5:1');
    expect(v1.matrix!.failing.every((p) => p.mode === 'light')).toBe(true);
    expect(certifyTheme(BRAND_V2).outcome).toBe('certifiable');
  });
  it('an accent that resembles the critical state is refused for distinctness (ΔE) and under colour-vision simulation', () => {
    const r = certifyTheme({ 'color.accent.default': { light: '#C8102E', dark: '#FF8A95' } });
    expect(r.matrix!.failing.some((p) => p.kind === 'distinct' && p.bg === 'color.critical')).toBe(true);
    expect(r.matrix!.failing.some((p) => p.kind === 'distinct_cvd' && p.cvd === 'deutan')).toBe(true);
  });
  it('a theme never changes print or forced colours: the customer palette applies on screen, in light and dark only', () => {
    const p = palettesFor(BRAND_V2);
    expect(p.light['color.surface.primary']).toBe('#F7F5F2');
    expect(p.print).toEqual(PRINT_PALETTE);
    expect(p.forced_colors_black).toEqual(FORCED_COLORS_BLACK);
  });
});

describe('the theme scope CSS: nothing unvalidated is emitted', () => {
  it('only the mapped allowed variables, screen only, never under forced colours; dark in both triggers', () => {
    const css = themeCss(BRAND_V2, 'nordwerk-corporate-2');
    expect(css).toContain('@media screen and (forced-colors: none) {');
    expect(css).toContain('[data-eye-theme="nordwerk-corporate-2"] {');
    expect(css).toContain("--eye-color-surface-primary: #F7F5F2;");
    expect(css).toContain(":root[data-theme='dark'] [data-eye-theme=\"nordwerk-corporate-2\"]");
    expect(css).toContain('(prefers-color-scheme: dark)');
    for (const k of PROTECTED_KEYS) expect(css).not.toContain(`${varName(k)}:`);
  });
  it('the preview CSS carries every token per mode (light, dark, print) at the candidate\'s values, scoped to the preview', () => {
    const css = previewCss(BRAND_V2, 'pv-1');
    expect(css).toContain('[data-eye-preview="pv-1"][data-eye-mode="light"] {');
    expect(css).toContain('[data-eye-preview="pv-1"][data-eye-mode="print"] {');
    expect(css.match(/--eye-color-critical:/g)).toHaveLength(3);
    expect(css).toContain('--eye-color-surface-primary: #F7F5F2;');
    expect(css).toContain(`--eye-color-critical: ${CORE_DARK['color.critical']};`);
    expect(() => previewCss({ 'color.critical': { light: '#000000', dark: '#000000' } }, 'pv-1')).toThrow(/invalid theme mapping/);
    expect(previewCss(null, 'core')).toContain('--eye-color-surface-primary: #FFFFFF;');
  });
  it('refuses an invalid mapping or a scope id that is not a plain key (no selector injection)', () => {
    expect(() => themeCss({ 'color.critical': { light: '#000000', dark: '#000000' } }, 'x-1')).toThrow(/invalid theme mapping/);
    expect(() => themeCss(BRAND_V2, 'x"] body { color: red } [x="')).toThrow(/not a theme scope id/);
  });
});

describe('THE GENERATED SHEET (REL-16, TYP-013/014, LAY-*, SPC-*): every token emitted; print, forced colours, fallback', () => {
  const css = buildCss();
  it('every colour, type, space, size, radius, border, elevation and motion token is emitted', () => {
    for (const t of COLOR_TOKENS) expect(css).toContain(`${varName(t.token)}: ${t.light};`);
    for (const t of TYPE_TOKENS) { expect(css).toContain(`${varName(t.token)}: ${t.size}px;`); expect(css).toContain(`${varName(t.token)}-line: ${t.line}px;`); expect(css).toContain(`${varName(t.token)}-weight: ${t.weight};`); }
    for (const v of SPACE_TOKENS) expect(css).toContain(`--eye-space-${v}: ${v}px;`);
    for (const [k, v] of Object.entries(SIZE_TOKENS)) expect(css).toContain(`--eye-size-${k.replace('.', '-')}: ${v}px;`);
    for (const [k, v] of Object.entries(RADIUS_TOKENS)) expect(css).toContain(`--eye-radius-${k}: ${v}px;`);
    for (const [k, v] of Object.entries(ELEVATION_TOKENS)) expect(css).toContain(`--eye-elevation-${k}: ${v};`);
    for (const [k, v] of Object.entries(MOTION_TOKENS)) expect(css).toContain(`--eye-motion-${k}: ${v}ms;`);
    expect(css).toContain('--eye-border-default: 1px;');
  });
  it('TYP-013/014 tabular numerals (variables and classes); TYP-015 in the mono stack', () => {
    expect(css).toContain('--eye-type-numeric-lg-numeric: tabular-nums;');
    expect(css).toContain('--eye-type-numeric-md-numeric: tabular-nums;');
    expect(css).toMatch(/\.eye-type-numeric-lg \{[^}]*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(/\.eye-type-numeric-md \{[^}]*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(/\.eye-type-mono-sm \{[^}]*font-family: var\(--eye-font-mono\);/);
    expect(css).not.toMatch(/\.eye-type-body-md \{[^}]*tabular-nums/);
    expect(typeClass('type.numeric.lg')).toBe('eye-type-numeric-lg');
  });
  it('the use aliases: elevation by use and the consequential control size (LAY-003, LAY-009/010/011)', () => {
    expect(css).toContain('--eye-elevation-raised: var(--eye-elevation-1);');
    expect(css).toContain('--eye-elevation-overlay: var(--eye-elevation-2);');
    expect(css).toContain('--eye-elevation-blocking: var(--eye-elevation-3);');
    expect(css).toContain('--eye-size-control-consequential: var(--eye-size-control-lg);');
  });
  it('print paints every surface paper white under the light inks; forced colours take the system palette', () => {
    const print = css.slice(css.indexOf('@media print'), css.indexOf('@media (forced-colors: active)'));
    expect(print).toContain('--eye-color-surface-secondary: #FFFFFF !important;');
    expect(print).toContain(`--eye-color-critical: ${CORE_LIGHT['color.critical']} !important;`);
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    expect(forced).toContain('--eye-color-critical: CanvasText !important;');
    expect(forced).toContain('--eye-color-accent-default: LinkText !important;');
    expect(forced).toContain('--eye-color-focus: Highlight !important;');
    expect(forced).toContain('--eye-color-canvas: Canvas !important;');
    expect(forcedSystemColour('color.disabled.ink')).toBe('GrayText');
  });
  it('the fallback scope re-asserts exactly the core values a theme could change (light and dark)', () => {
    const fb = css.slice(css.indexOf("[data-eye-theme='fallback'] {"), css.indexOf('/* PRINT'));
    for (const k of ALLOWED_COLOUR_KEYS) { expect(fb).toContain(`${varName(k)}: ${CORE_LIGHT[k]};`); expect(fb).toContain(`${varName(k)}: ${CORE_DARK[k]};`); }
    expect(fb).not.toContain('--eye-color-critical');
  });
  it('the swatches paint every colour token by its variable', () => {
    for (const t of COLOR_TOKENS) expect(css).toContain(`.eye-swatch-${t.token.replace(/\./g, '-')} { background: var(${varName(t.token)}); }`);
  });
  it('fonts: fallback stacks only — no @font-face, no font file (D4; TYP-001/002 stay partial)', () => {
    expect(css).not.toContain('@font-face');
    expect(css).toContain("--eye-font-ui: 'Inter Variable', 'Segoe UI', Arial, sans-serif;");
    expect(css).not.toMatch(/\.(woff2?|ttf|otf)/);
  });
  it('the statement roles are typographically DISTINCT: fact, recommendation, decision (UX-18-004)', () => {
    const roles = [TEXT_ROLES.fact.css, TEXT_ROLES.recommendation.css, TEXT_ROLES.decision.css];
    expect(new Set(roles).size).toBe(3);
    expect(TEXT_ROLES.recommendation.css).toMatch(/italic/); expect(TEXT_ROLES.recommendation.css).toMatch(/recommended/);
    expect(TEXT_ROLES.decision.css).toMatch(/650/); expect(TEXT_ROLES.decision.css).toMatch(/decided/);
    expect(TEXT_ROLES.fact.css).not.toMatch(/border/);
    expect(css).toContain('.eye-text-recommendation {');
    expect(css).toMatch(/\.eye-text-number \{[^}]*tabular-nums/);
  });
});

describe('THE SYMBOL REGISTRY (UX-20-001…005, TS-01…TS-10)', () => {
  it('TS-01…TS-10 with Appendix B\'s labels, shapes and tokens; every symbol has a meaning, a label and a known token', () => {
    const ts = SYMBOLS.filter((s) => s.id.startsWith('TS-'));
    expect(ts.map((s) => [s.id, s.label, s.token, s.shape])).toEqual([
      ['TS-01', 'OBSERVED', 'color.observed', 'Solid circle'], ['TS-02', 'ASSERTED', 'color.asserted', 'Outlined square'], ['TS-03', 'INFERRED', 'color.inferred', 'Linked nodes'],
      ['TS-04', 'ASSESSED', 'color.assessed', 'Diamond'], ['TS-05', 'SYNTHETIC', 'color.synthetic', 'Dashed hexagon'], ['TS-06', 'RECOMMENDED', 'color.recommended', 'Open arrow'],
      ['TS-07', 'DECIDED', 'color.decided', 'Signed check'], ['TS-08', 'CORRECTED', 'color.corrected', 'Revision mark'], ['TS-09', 'WITHDRAWN', 'color.withdrawn', 'Barred circle'],
      ['TS-10', 'INDETERMINATE', 'color.uncertain', 'Question mark']]);
    const tokens = new Set(COLOR_TOKENS.map((t) => t.token));
    for (const s of SYMBOLS) { expect(tokens.has(s.token), s.id).toBe(true); expect(s.meaning.length).toBeGreaterThan(10); expect(s.label).toBe(s.label.toUpperCase()); expect(s.paths.length).toBeGreaterThan(0); }
  });
  it('versioned by glyph digest: 64 hex, unique per glyph, stable', () => {
    for (const s of SYMBOLS) expect(s.glyphDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(SYMBOLS.map((s) => s.glyphDigest)).size).toBe(SYMBOLS.length);
    expect(glyphDigest(SYMBOLS[0]!)).toBe(SYMBOLS[0]!.glyphDigest);
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(SYMBOLS.length);
    expect(new Set(SYMBOLS.map((s) => s.key)).size).toBe(SYMBOLS.length);
  });
  it('an unknown symbol is the certified GENERIC one carrying the canonical text — never a guessed meaning (UX-20-005)', () => {
    expect(resolveSymbol('TS-07').symbol.key).toBe('decided');
    expect(resolveSymbol('withdrawn').label).toBe('WITHDRAWN');
    const u = resolveSymbol('pkg.supply.reroute', 'Rerouted');
    expect(u).toMatchObject({ substituted: true, label: 'REROUTED' }); expect(u.symbol.id).toBe(GENERIC_SYMBOL.id);
  });
  it('the canonical label shows where a glyph could be ambiguous; consequential states are never unlabelled', () => {
    const base = { consequential: false, substituted: false, forcedColors: false, scalePx: 16, locale: 'en' };
    expect(labelMustShow(base)).toBe(false);
    expect(labelMustShow({ ...base, forcedColors: true })).toBe(true);
    expect(labelMustShow({ ...base, scalePx: 12 })).toBe(true);
    expect(labelMustShow({ ...base, locale: 'de' })).toBe(true);
    expect(labelMustShow({ ...base, substituted: true })).toBe(true);
    for (const k of ['decided', 'withdrawn', 'critical', 'warning', 'degraded']) expect(labelMustShow({ ...base, consequential: resolveSymbol(k).symbol.consequential })).toBe(true);
  });
  it('no icon alone authorizes, approves, deletes or publishes: icon-only controls are C0/C1 only (UX-20-004)', () => {
    expect(iconOnlyAdmitted('C0')).toBe(true); expect(iconOnlyAdmitted('C1')).toBe(true);
    expect(iconOnlyAdmitted('C2')).toBe(false); expect(iconOnlyAdmitted('C4')).toBe(false);
  });
});

describe('the dependency-free SHA-256 equals node:crypto', () => {
  it('on empty, ASCII, UTF-8 and block-boundary inputs', () => {
    for (const s of ['', 'abc', 'The Eye — NORDWERK (SYNTHETIC) ⬡', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});
