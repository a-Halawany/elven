/**
 * CP-6 B81 §RE — B80's control residues: the governed hold (PR-05-005 / UX-09-005), the truth glyphs on the symbol set (UX-20-001), the
 * Button's enforcement (UX-20-004 / LAY-003), the elevation binding (LAY-009…011) — the pure contract, then the REAL sources rendering it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCss, SYMBOLS } from '@eye/tokens';
import { ELEVATION_BINDING, ELEVATION_ROWS, buttonEnforcement, elevationVar, governedHold, truthBadgeView, visibleWords } from './controls-b81';
import { shellStatus } from './shell-b80';
import { freezeOf } from './shell-status-b81';

const WEB = join(__dirname, '..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('the governed hold: GovernedButton reads the shell\'s frozen status', () => {
  it('a frozen shell (unverified, verifying, signed out) HOLDS with the shell\'s own statement; ready and degraded do not; no shell is as before', () => {
    const unverified = shellStatus({ session: true, verified: null, problem: 'the server no longer confirms this session (EYE-IDN-002)', health: 'ok' });
    expect(governedHold(unverified)).toEqual({ held: true, reason: `held — ${unverified.statement}`, phase: 'unverified' });
    expect(governedHold(shellStatus({ session: false, verified: null, problem: null, health: null })).held).toBe(true);
    expect(governedHold(shellStatus({ session: true, verified: null, problem: null, health: 'ok' })).held).toBe(true);
    expect(governedHold(shellStatus({ session: true, verified: true, problem: null, health: 'degraded' }))).toEqual({ held: false, reason: null, phase: 'degraded' });
    expect(governedHold(shellStatus({ session: true, verified: true, problem: null, health: 'ok' })).held).toBe(false);
    expect(governedHold(null)).toEqual({ held: false, reason: null, phase: null });
  });
  it('the source: GovernedButton reads useShellStatus(), is disabled while held, never runs onRun while held, states the reason; props kept', () => {
    const obs = read('components/observation.tsx');
    const gb = obs.slice(obs.indexOf('export function GovernedButton'), obs.indexOf('/* ───────────────────────── layout helpers'));
    expect(gb).toMatch(/const hold = governedHold\(useLeafShellStatus\(\)\);/);
    expect(gb).toMatch(/disabled=\{busy \|\| off\}/);
    expect(gb).toMatch(/if \(hold\.held\) return;/);
    expect(gb).toMatch(/hold\.held && <span id=\{holdId\}/);
    expect(gb).toMatch(/^export function GovernedButton\(\{\n {2}label, pendingLabel, onRun, disabled, variant,\n\}: \{/);
  });
  it('the shell\'s re-verification freezes in place, and FreezeScope can only make a region MORE frozen', () => {
    const shell = read('components/shell.tsx');
    expect(shell).toMatch(/const status = lapsed !== null \? shellStatus\(\{ session: ready, verified: null, problem: lapsed/);
    expect(shell).toMatch(/const StatusCtx = ShellStatusContext;/);
    expect(shell).toMatch(/export \{ FreezeScope \} from '\.\.\/lib\/shell-status-b81';/);
    expect(freezeOf(null, 'x')).toMatchObject({ phase: 'unverified', frozen: true, statement: 'x' });
    const ready = shellStatus({ session: true, verified: true, problem: null, health: 'ok' });
    expect(freezeOf(ready, 'stale read')).toMatchObject({ frozen: true, statement: 'stale read', regions: ['region'] });
    const already = shellStatus({ session: false, verified: null, problem: null, health: null });
    expect(freezeOf(already, 'x')).toBe(already);
    expect(shell).toMatch(/document\.addEventListener\('visibilitychange', recheck\)/);
  });
});

describe('TruthBadge\'s glyphs are the symbol set\'s', () => {
  it('each truth state resolves to its registered symbol (TS-01…, TG-…), its colour token and the UPPERCASE word; the name kept', () => {
    for (const [state, id] of [['observed', 'TS-01'], ['asserted', 'TS-02'], ['inferred', 'TS-03'], ['assessed', 'TS-04'], ['synthetic', 'TS-05'], ['decided', 'TS-07'],
      ['withdrawn', 'TS-09'], ['extracted', 'TG-EXTRACTED'], ['disputed', 'TG-DISPUTED']] as const) {
      const v = truthBadgeView(state);
      expect(v.glyph.id, state).toBe(id);
      expect(v.glyph.paths).toEqual(SYMBOLS.find((s) => s.id === id)!.paths);
      expect(v).toMatchObject({ text: state.toUpperCase(), ariaLabel: `truth state ${state}`, certified: true });
      expect(v.colourVar).toMatch(/^var\(--eye-color-[a-z-]+\)$/);
    }
  });
  it('an unknown state is the GENERIC symbol with its own word, in the uncertain colour — never a guessed glyph', () => {
    const v = truthBadgeView('rumoured');
    expect(v).toMatchObject({ certified: false, text: 'RUMOURED', ariaLabel: 'truth state rumoured', colourVar: 'var(--eye-color-uncertain)' });
    expect(v.glyph.id).toBe('GEN-00');
  });
  it('the source renders the registry\'s paths (no Unicode glyph table left) and keeps the props', () => {
    const ui = read('components/ui.tsx');
    expect(ui).toMatch(/export function TruthBadge\(\{ state \}: \{ state: string \}\)/);
    expect(ui).toMatch(/aria-label=\{v\.ariaLabel\}/);
    expect(ui).toMatch(/v\.glyph\.paths\.map/);
    expect(ui).not.toMatch(/'⌕'|'⧉'|'⬡'|'☑'/);
  });
});

describe('the Button enforces the label and the target size', () => {
  it('words, not glyphs: a label with no letter or digit is icon-only', () => {
    expect(visibleWords('Approve')).toBe('Approve');
    expect(visibleWords('  ✕ ')).toBeNull();
    expect(visibleWords('▾')).toBeNull();
    expect(visibleWords('✓ Approve')).toBe('✓ Approve');
    expect(visibleWords('اعتماد')).toBe('اعتماد');
  });
  it('from C2 the control is the 44px consequential one and an icon-only label HOLDS it with the reason; C0/C1 stay as they were', () => {
    expect(buttonEnforcement({ label: 'Continue' })).toEqual({ consequence: 'C1', size: 'md', minBlockSize: 'var(--eye-size-control-md)', problem: null, disabledReason: null });
    expect(buttonEnforcement({ label: 'Add', size: 'sm' }).size).toBe('sm');
    expect(buttonEnforcement({ label: '✕', consequence: 'C1' }).problem).toBeNull();
    const c3 = buttonEnforcement({ label: 'Withdraw the warning', consequence: 'C3', size: 'sm' });
    expect(c3).toMatchObject({ size: 'lg', minBlockSize: 'var(--eye-size-control-consequential)', problem: null, disabledReason: null });
    const icon = buttonEnforcement({ label: '✕', consequence: 'C2' });
    expect(icon.problem).toMatch(/a C2 control names its consequence in text/);
    expect(icon.disabledReason).toBe(icon.problem);
    expect(buttonEnforcement({ label: '✕', variant: 'critical' })).toMatchObject({ consequence: 'C3', size: 'lg' });
    expect(buttonEnforcement({ label: '⊘', consequence: 'C4', disabledReason: 'not yours to make' }).disabledReason).toMatch(/^not yours to make; a C4 control/);
  });
  it('the source: Button takes an OPTIONAL consequence (the props contract only grows), renders the enforced size and reason', () => {
    const a = read('components/actions.tsx');
    expect(a).toMatch(/type\?: 'button' \| 'submit'; describedBy\?: string; consequence\?: Consequence;/);
    expect(a).toMatch(/const en = buttonEnforcement\(/);
    expect(a).toMatch(/className=\{buttonClass\(variant, en\.size\)\}/);
    expect(a).toMatch(/data-consequence=\{en\.consequence/);
  });
});

describe('the elevation binding', () => {
  it('raised / overlay / blocking are LAY-009 / -010 / -011 (elevation.1 / .2 / .3), aliased in the token CSS', () => {
    expect(Object.values(ELEVATION_ROWS).map((r) => `${r.row}:${r.level}`)).toEqual(['LAY-009:1', 'LAY-010:2', 'LAY-011:3']);
    const css = buildCss();
    for (const [use, r] of Object.entries(ELEVATION_ROWS)) expect(css).toContain(`--eye-elevation-${use}: var(--eye-elevation-${r.level});`);
    expect(elevationVar('overlay')).toBe('var(--eye-elevation-overlay)');
    expect(elevationVar('none')).toBe('none');
  });
  it('Surface / Panel / Drawer / Popover / Dialog each carry their use; globals.css binds every use by its alias (never a raw level)', () => {
    expect(ELEVATION_BINDING).toEqual({ 'Surface.base': 'none', 'Surface.raised': 'raised', 'Surface.overlay': 'overlay', Panel: 'raised', Drawer: 'overlay', Popover: 'overlay', Dialog: 'blocking' });
    const layers = read('components/layers.tsx');
    expect(layers).toMatch(/data-elevation=\{elevationOf\(`Surface\.\$\{level\}`\)/);
    for (const c of ['Panel', 'Dialog', 'Drawer', 'Popover']) expect(layers, c).toMatch(new RegExp(`data-elevation=\\{elevationOf\\('${c}'\\)`));
    const g = read('app/globals.css');
    const block = g.slice(g.indexOf('/* B81 re'), g.indexOf('/* end B81 re */'));
    for (const use of ['raised', 'overlay', 'blocking']) expect(block).toContain(`[data-elevation='${use}'] { box-shadow: var(--eye-elevation-${use}); }`);
    expect(block).not.toMatch(/var\(--eye-elevation-[123]\)/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(block).not.toMatch(/(^|[\s;{])(margin|padding)-(left|right)\s*:|(^|[\s;{])(left|right)\s*:/m);
    expect(block).toMatch(/@media \(forced-colors: active\) \{\n {2}\[data-elevation\] \{ box-shadow: none; \}/);
  });
});
