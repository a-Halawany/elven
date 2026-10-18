import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATUS_INKS, SYMBOLS, certifyTheme } from '@eye/tokens';
import { controlLabelProblem, controlSizeVar, legendEntries, symbolView } from './symbols-b80';
import { copyText, formatInstant, formatNumber, middleEllipsis, statementView } from './format-b80';
import { emptyForm, expectedVersionFor, inForceText, mappingFrom, matrixParity, scopeIdFor, specimen, themeStateText, type InForce } from './themes-b80';

/** CP-6 B80 §TK (F-P7-E-03): the component contracts of the symbols, the text roles and the theme pages as pure functions. SYNTHETIC values. */
describe('symbols: never colour alone; the label shown where the glyph could be ambiguous (UX-17-004, UX-20-003/-005)', () => {
  it('a symbol is always named: its visible label or its accessible name', () => {
    const v = symbolView({ id: 'observed' });
    expect(v).toMatchObject({ id: 'TS-01', label: 'OBSERVED', labelVisible: false, glyphHidden: false, accessibleName: 'OBSERVED', colourVar: 'var(--eye-color-observed)' });
    const shown = symbolView({ id: 'observed', showLabel: true });
    expect(shown).toMatchObject({ labelVisible: true, glyphHidden: true, accessibleName: null });
  });
  it('the label shows under forced colours, at a small scale, in an uncertified locale, for a consequential state and a substitute', () => {
    expect(symbolView({ id: 'observed', forcedColors: true }).labelVisible).toBe(true);
    expect(symbolView({ id: 'observed', sizePx: 12 }).labelVisible).toBe(true);
    expect(symbolView({ id: 'observed', locale: 'de' }).labelVisible).toBe(true);
    expect(symbolView({ id: 'decided' }).labelVisible).toBe(true);
    expect(symbolView({ id: 'critical' }).labelVisible).toBe(true);
    const sub = symbolView({ id: 'pkg.reroute', text: 'Rerouted' });
    expect(sub).toMatchObject({ substituted: true, label: 'REROUTED', labelVisible: true, id: 'GEN-00' });
    expect(sub.meaning).toMatch(/^REROUTED — /);
  });
  it('every status ink has a symbol with a label (the non-colour cue registry)', () => {
    const tokens = new Set(SYMBOLS.map((s) => s.token));
    for (const t of STATUS_INKS) expect(tokens.has(t), t).toBe(true);
    for (const s of SYMBOLS) expect(s.label.length).toBeGreaterThan(1);
  });
  it('the legend: each symbol once, in order, an unknown one as the generic symbol with its text', () => {
    const l = legendEntries(['observed', 'decided', 'observed', { id: 'pkg.x', text: 'Held at port' }]);
    expect(l.map((e) => e.label)).toEqual(['OBSERVED', 'DECIDED', 'HELD AT PORT']);
    expect(l[2]!.substituted).toBe(true);
  });
  it('no icon alone authorizes (UX-20-004); a consequential control is 44px (LAY-003)', () => {
    expect(controlLabelProblem({ visibleText: null, consequence: 'C1' })).toBeNull();
    expect(controlLabelProblem({ visibleText: null, consequence: 'C2' })).toMatch(/names its consequence in text/);
    expect(controlLabelProblem({ visibleText: 'Approve', consequence: 'C3' })).toBeNull();
    expect(controlSizeVar('C2')).toBe('var(--eye-size-control-consequential)');
    expect(controlSizeVar('C0')).toBe('var(--eye-size-control-md)');
  });
  /* B81 re (UX-20-001): TruthBadge's glyphs moved onto the symbol set — a contribution to B107's key web.ui.truth-badge (props kept) */
  it('TruthBadge (ui.tsx — B107\'s key) shows the SYMBOL SET\'s glyph AND its UPPERCASE label beside the colour', () => {
    const ui = readFileSync(new URL('../components/ui.tsx', import.meta.url), 'utf8');
    expect(ui).toMatch(/const v = truthBadgeView\(state\);/);
    expect(ui).toMatch(/<\/svg>\{' '\}\{v\.text\}/);
    expect(ui).not.toMatch(/TRUTH_SYMBOLS/);
  });
});

describe('numbers, units, instants, long values (UX-18-001/-003/-005)', () => {
  it('Intl for the active locale; the unit kept; the canonical value copied, never the display', () => {
    const f = formatNumber(1234567.891, { locale: 'en', unit: 't', fractionDigits: 1 });
    expect(f).toMatchObject({ text: '1,234,567.9', unit: 't', state: 'value' });
    expect(f.note).toMatch(/exact value is 1234567.891/);
    expect(copyText(f)).toBe('1234567.891 t');
    expect(formatNumber(1234.5, { locale: 'de' }).text).toBe('1.234,5');
    expect(formatNumber(1234.5, { locale: 'ar-EG' }).text).not.toBe('1,234.5');
  });
  it('extreme and missing values are stated, never made plausible', () => {
    expect(formatNumber(Infinity)).toMatchObject({ text: '+∞', state: 'infinite' });
    expect(formatNumber('abc')).toMatchObject({ text: '—', state: 'not_a_number' });
    expect(formatNumber(null)).toMatchObject({ text: '—', note: 'no value was given' });
    expect(formatNumber(1e21, { locale: 'en' }).text).toBe('1,000,000,000,000,000,000,000');
  });
  it('middle ellipsis keeps both ends; the full value stays accessible', () => {
    const d = 'a'.repeat(30) + 'Z'.repeat(34);
    const s = middleEllipsis(d, 20);
    expect(s.truncated).toBe(true); expect(Array.from(s.shown)).toHaveLength(20);
    expect(s.shown.startsWith('aaaa')).toBe(true); expect(s.shown.endsWith('ZZZZ')).toBe(true); expect(s.full).toBe(d);
    expect(middleEllipsis('short', 20)).toEqual({ shown: 'short', full: 'short', truncated: false });
  });
  it('an instant states its zone; a DATE renders as the day it names', () => {
    expect(formatInstant('2026-10-17T09:30:00Z')).toEqual({ text: '10/17/2026, 09:30:00 UTC', canonical: '2026-10-17T09:30:00.000Z', zone: 'UTC' });
    expect(formatInstant('2026-10-17').text).toBe('2026-10-17');
    expect(formatInstant('2026-10-17T09:30:00Z', { timeZone: 'Europe/Berlin' }).text).toMatch(/11:30:00 Europe\/Berlin$/);
  });
  it('a recommendation is never typed as a fact or an approval; a decision names its actor (UX-18-004)', () => {
    expect(statementView('recommendation')).toMatchObject({ className: 'eye-text-recommendation', prefix: 'RECOMMENDED — advisory, not a decision' });
    expect(statementView('decision', 'L. Brandt (SYNTHETIC)')).toMatchObject({ className: 'eye-text-decision', prefix: 'DECIDED by L. Brandt (SYNTHETIC)', problem: null });
    expect(statementView('decision').problem).toMatch(/names its actor/);
    expect(new Set(['fact', 'recommendation', 'decision'].map((r) => statementView(r as 'fact').className)).size).toBe(3);
  });
});

describe('the theme pages: nothing certified or in force by inference (UX-68-003/-005, PAT-41)', () => {
  const inForce: InForce = { tenant_id: 't', theme: 'customer', fallback: false, note: '', activation: {}, version: { theme_id: 'x', version: 2, key: 'k', title: 'NORDWERK (SYNTHETIC)', digest: 'd', mapping: {}, resolved: {} } };
  it('states in words; "in force" only when the server\'s latest activation names the version', () => {
    expect(themeStateText({ state: 'proposed', claim: 'demonstration', certification: null }, inForce)).toBe('PROPOSED — not certified, not in force');
    expect(themeStateText({ theme_id: 'x', version: 2, state: 'certified', claim: 'demonstration', certification: null }, inForce)).toBe('IN FORCE — certified (claim: demonstration)');
    expect(themeStateText({ theme_id: 'x', version: 3, state: 'certified', claim: 'demonstration', certification: null }, inForce)).toBe('CERTIFIED (claim: demonstration) — not in force');
    expect(themeStateText({ state: 'refused', claim: 'demonstration', certification: { outcome: 'refused', failing: [{}, {}], certifier_name: null, certified_at: '', certification_digest: '' } }, null))
      .toBe('REFUSED certification — 2 failing pairs; never in force');
    expect(inForceText(null)).toMatch(/Reading/);
    expect(inForceText({ ...inForce, theme: 'core', fallback: true, note: 'v2 is refused' })).toMatch(/FALLBACK: v2 is refused/);
  });
  it('the proposal form maps only the keys switched on; the expected version is the latest; the scope id is a plain key', () => {
    const f = emptyForm();
    expect(mappingFrom(f)).toEqual({});
    f.colours['color.accent.default'] = { on: true, light: '#00476b', dark: '#7cc4e8' }; f.wordmark = 'NORDWERK';
    expect(mappingFrom(f)).toEqual({ 'color.accent.default': { light: '#00476B', dark: '#7CC4E8' }, 'brand.wordmark': { text: 'NORDWERK' } });
    expect(expectedVersionFor([{ theme_key: 'a', version: 1 }, { theme_key: 'a', version: 3 }, { theme_key: 'b', version: 7 }], 'a')).toBe(3);
    expect(expectedVersionFor([], 'a')).toBe(0);
    expect(scopeIdFor('018f-ABCD-ef12-3456-7890abcdef12', 2)).toMatch(/^t-[0-9a-f]{1,12}-v2$/);
    expect(scopeIdFor('"]{}', 1)).toBe('t--v1');
  });
  it('parity: the client recomputation agrees with itself pair by pair; a divergence is named', () => {
    const c = certifyTheme(null).matrix!;
    const server = { outcome: c.outcome, results: c.results.map((r) => ({ mode: r.mode, fg: r.fg, bg: r.bg, pass: r.pass, shown: r.shown })) };
    expect(matrixParity(server, c)).toEqual({ agree: true, differing: [] });
    const bad = { ...server, results: server.results.map((r, i) => (i === 3 ? { ...r, pass: !r.pass } : r)) };
    expect(matrixParity(bad, c).differing).toHaveLength(1);
    expect(matrixParity(null, c).agree).toBe(false);
  });
  it('the specimen is the same items, labels and symbols in every mode', () => {
    const s = specimen('NORDWERK (SYNTHETIC)');
    expect(s.map((i) => i.kind)).toEqual(['wordmark', 'warning', 'decision', 'recommendation', 'table', 'action']);
    expect(specimen(null).map((i) => i.label)).toEqual(['CRITICAL', 'DECIDED', 'RECOMMENDED', 'OBSERVED', 'ACTION']);
  });
});

describe('the token inspection (UX-17-003): meaning, values, mappable or never, the non-colour cue, contrast and the permitted surfaces', async () => {
  const { inspectColours } = await import('./tokens-b80');
  const rows = inspectColours();
  it('every colour token; only the accent and the surface tints are mappable', () => {
    expect(rows).toHaveLength(30);
    expect(rows.filter((r) => r.mappable).map((r) => r.token)).toEqual(['color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated', 'color.accent.default', 'color.accent.strong']);
  });
  it('every status token carries a non-colour cue (its symbol); every ink is permitted on every surface of the core theme', () => {
    for (const r of rows.filter((x) => x.kind === 'status')) expect(r.cue, r.token).not.toBeNull();
    for (const r of rows.filter((x) => x.kind === 'ink' || x.kind === 'status')) expect(r.contrast.every((c) => c.permitted), r.token).toBe(true);
    const critical = rows.find((r) => r.token === 'color.critical')!;
    expect(critical.contrast.find((c) => c.mode === 'light' && c.surface === 'color.surface.primary')!.ratio).toBe(6.57);
    expect(critical.cue).toBe('CRITICAL (Octagon with bar)');
  });
});
