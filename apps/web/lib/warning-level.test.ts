import { describe, expect, it } from 'vitest';
import { LEVEL_GLYPH, LEVEL_LABEL, LEVEL_TOKEN, levelBadge, levelOf } from './warning-level';

/** A warning raised before derivation v1 has NO level, and the screen never invents one (0061). */
describe('warning levels are stated, never invented', () => {
  it('the four levels read as glyph + label + token, never colour alone (GLB-09)', () => {
    for (const l of ['low', 'normal', 'high', 'critical'] as const) {
      expect(levelOf({ level: l })).toBe(l);
      expect(LEVEL_GLYPH[l].length).toBeGreaterThan(0);
      expect(LEVEL_LABEL[l]).toBe(l.toUpperCase());
      expect(LEVEL_TOKEN[l]).toMatch(/^--eye-color-/);
      expect(levelBadge({ level: l, level_version: 1 })).toContain(`${LEVEL_LABEL[l]} · derivation v1`);
    }
    expect(LEVEL_TOKEN.critical).toBe('--eye-color-critical');
    expect(LEVEL_TOKEN.high).toBe('--eye-color-warning');
  });
  it('a row without a level is "none", labelled as raised before the derivation', () => {
    expect(levelOf({})).toBe('none');
    expect(levelOf({ level: null })).toBe('none');
    expect(levelOf({ level: 'severe' })).toBe('none');
    expect(levelBadge({ level: null })).toMatch(/no level — raised before derivation v1/);
    expect(levelBadge({})).not.toMatch(/LOW|NORMAL|HIGH|CRITICAL/);
  });
});
