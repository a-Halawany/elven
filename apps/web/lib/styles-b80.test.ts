import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, STATE_PROPERTIES, buttonStyle, cardStyle, inputStyle, tableStyle, textareaStyle } from './styles-b80';
import { LIBRARY } from './b80-seams';

/** CP-6 B80 §CL-F — the library owns the style constants (DESIGN D5 / Q5) and the inline-style RATCHET (UX-ADR-011's evidence). */
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(n)) out.push(f);
  }
  return out;
}

/**
 * THE RATCHET: the count of `style={{` in apps/web/app may not RISE above this committed baseline. It may fall — lower the number in the
 * same commit (pages move onto the library's classes and components as later stages touch them). At 54d2936: 2529; §CL-F's rebuilt source
 * registration form and the new decision-package form brought it to the value below. The integrator re-states it at the fold.
 */
export const INLINE_STYLE_BASELINE = 2521;

describe('the style constants: one definition, semantic tokens, logical properties, states through custom properties', () => {
  const all = { inputStyle, textareaStyle, buttonStyle, cardStyle, tableStyle };
  it('every value is a token variable, a keyword or a number — no colour literal, no physical side', () => {
    for (const [name, s] of Object.entries(all)) {
      for (const [k, v] of Object.entries(s)) {
        expect(k, `${name}.${k}`).not.toMatch(/^(left|right|top|bottom|width|height|marginLeft|marginRight|paddingLeft|paddingRight)$/);
        expect(String(v), `${name}.${k}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      }
    }
  });
  it('the state-bearing properties read a custom property whose fallback is the token (so globals.css carries hover / disabled / invalid / busy)', () => {
    expect(inputStyle.border).toBe('1px solid var(--eye-input-border, var(--eye-color-border-default))');
    expect(textareaStyle.background).toBe('var(--eye-input-bg, var(--eye-color-surface-primary))');
    expect(buttonStyle.cursor).toBe('var(--eye-button-cursor, pointer)');
    for (const [prop, fallback] of Object.entries(STATE_PROPERTIES)) {
      const users = Object.values(all).flatMap((s) => Object.values(s).map(String)).filter((v) => v.includes(prop));
      expect(users.length, prop).toBeGreaterThan(0);
      for (const u of users) expect(u).toContain(fallback === 'pointer' ? `${prop}, pointer` : `${prop}, var(${fallback})`);
    }
  });
  it('ui.tsx and observation.tsx keep their exports AS the library\'s (no second definition)', () => {
    const ui = read('components/ui.tsx'); const obs = read('components/observation.tsx');
    for (const n of ['inputStyle', 'buttonStyle', 'tableStyle']) expect(ui).toContain(`export const ${n}: CSSProperties = LIBRARY_STYLES.${n};`);
    for (const n of ['cardStyle', 'textareaStyle']) expect(obs).toContain(`export const ${n}: CSSProperties = LIBRARY_STYLES.${n};`);
    expect(read('components/forms.tsx')).toMatch(/export \{ inputStyle, textareaStyle \} from '\.\.\/lib\/styles-b80';/);
    expect(read('components/actions.tsx')).toMatch(/export \{ buttonStyle \} from '\.\.\/lib\/styles-b80';/);
  });
  it('globals.css (the B80 clf block) sets only the declared state properties, uses system colours under forced-colors, and no colour literal', () => {
    const css = read('app/globals.css');
    const block = css.slice(css.indexOf('/* B80 clf */'), css.indexOf('/* end B80 clf */'));
    expect(block.length).toBeGreaterThan(1000);
    const set = new Set([...block.matchAll(/(--eye-(?:input|button)-[a-z]+)\s*:/g)].map((m) => m[1]!));
    for (const p of set) expect(Object.keys(STATE_PROPERTIES), p).toContain(p);
    expect(block).toMatch(/@media \(forced-colors: active\)/);
    expect(block).toMatch(/\[aria-invalid='true'\]/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(block).not.toMatch(/(^|[\s;{])(margin|padding)-(left|right)\s*:|(^|[\s;{])(left|right)\s*:/m);
    for (const c of Object.values(CLASSES).flatMap((v) => v.split(' '))) expect(block, c).toContain(`.${c}`);
  });
});

describe('the library files and exports of §CL-F are the seams\' (lib/b80-seams.ts LIBRARY)', () => {
  it('forms, actions and feedback export exactly the contracted components (each an exported function — B107\'s inventory reads them)', () => {
    for (const k of ['forms', 'actions', 'feedback'] as const) {
      const lib = LIBRARY[k];
      expect(lib.part).toBe('§CL-F');
      for (const f of lib.files) {
        const text = read(f);
        const exported = [...text.matchAll(/^export function ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]!);
        expect([...exported].sort(), f).toEqual([...lib.exports].sort());
      }
    }
  });
});

describe('THE RATCHET: inline styles in apps/web/app may not rise', () => {
  it(`the count of style={{ is at most ${INLINE_STYLE_BASELINE}`, () => {
    const n = walk(join(WEB, 'app')).reduce((a, f) => a + (readFileSync(f, 'utf8').match(/style=\{\{/g) ?? []).length, 0);
    expect(n, `inline styles rose to ${n}; render library components / classes instead (or lower the baseline when it falls)`).toBeLessThanOrEqual(INLINE_STYLE_BASELINE);
  });
  it('the forms §CL-F rebuilt carry no inline style at all', () => {
    for (const f of ['app/observation/sources/new/page.tsx', 'app/decisions/packages/new/page.tsx']) expect((read(f).match(/style=\{\{/g) ?? []).length, f).toBe(0);
  });
});
