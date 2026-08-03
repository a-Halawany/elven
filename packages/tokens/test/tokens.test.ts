import { describe, expect, it } from 'vitest';
import { buildCss, COLOR_TOKENS, MOTION_TOKENS } from '../src/registry.js';

describe('design tokens (Vol 9 Appendix A)', () => {
  it('has all 30 color tokens with light+dark values', () => {
    expect(COLOR_TOKENS).toHaveLength(30);
    for (const t of COLOR_TOKENS) {
      expect(t.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.dark).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
  it('motion.instant is 0ms (consequential state change)', () => {
    expect(MOTION_TOKENS.instant).toBe(0);
  });
  it('emits CSS with dark theme override and focus token', () => {
    const css = buildCss();
    expect(css).toContain("--eye-color-focus: #005FCC");
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('--eye-motion-instant: 0ms');
  });
});
