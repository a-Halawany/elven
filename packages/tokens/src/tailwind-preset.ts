/**
 * Tailwind preset mapping SEMANTIC ALIASES ONLY to token CSS variables.
 * Arbitrary raw values in app code violate the token contract (UX-ADR-010).
 */
import { COLOR_TOKENS, RADIUS_TOKENS, SPACE_TOKENS } from './registry.js';

const colors: Record<string, string> = {};
for (const t of COLOR_TOKENS) {
  // color.surface.primary -> 'surface-primary'
  const key = t.token.replace(/^color\./, '').replace(/\./g, '-');
  colors[key] = `var(--eye-${t.token.replace(/\./g, '-')})`;
}

const spacing: Record<string, string> = {};
for (const v of SPACE_TOKENS) spacing[String(v)] = `var(--eye-space-${v})`;

const borderRadius: Record<string, string> = {};
for (const [k] of Object.entries(RADIUS_TOKENS)) borderRadius[k] = `var(--eye-radius-${k})`;

export default {
  theme: {
    colors,
    spacing,
    borderRadius,
    fontFamily: {
      ui: 'var(--eye-font-ui)',
      mono: 'var(--eye-font-mono)',
    },
  },
};
