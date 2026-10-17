/**
 * THE GENERATED SHEET (`@eye/tokens/css`) — Volume 9 Appendix A as CSS custom properties. B80 §TK (F-P7-E-03: REL-16, TYP-013/014,
 * LAY-003/009/010/011, UX-18-002/-004) extends Phase 0's light + dark sheet with:
 *   · PRINT — light inks on paper white, whatever the screen theme (a customer theme never prints; its wordmark does);
 *   · FORCED COLOURS — every token mapped to its system colour (`forced-colors: active`); meaning is carried by symbols and labels;
 *   · THE FALLBACK SCOPE — `[data-eye-theme='fallback']` re-asserts the certified core values a customer theme could have changed;
 *   · THE TYPE CLASSES — one per type token, the numeric ones with `font-variant-numeric: tabular-nums` (TYP-013/014), the mono one in the
 *     mono stack; THE TEXT ROLES — label, value, number, unit, timestamp, identifier, digest, and the three DISTINCT statement roles
 *     (fact, recommendation, decision — UX-18-004: typography never collapses a recommendation into a fact or an approval);
 *   · THE USE ALIASES — the elevations by use (raised surface, overlay, blocking dialog) and the consequential control size (44px).
 * FONTS: fallback stacks only (DESIGN D4) — no font file and no @font-face; the vendored Inter / IBM Plex Mono are B81's, pending the
 * owner's licence decision.
 */
import { BORDER_TOKENS, COLOR_TOKENS, ELEVATION_TOKENS, FONT_FAMILIES, MOTION_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SPACE_TOKENS, TYPE_TOKENS } from './registry.js';
import { ALLOWED_COLOUR_KEYS, CORE_DARK, CORE_LIGHT, PRINT_PALETTE, forcedSystemColour } from './themes.js';

export const varName = (token: string): string => '--eye-' + token.replace(/\./g, '-');
/** The class of a type token (type.numeric.lg → eye-type-numeric-lg). */
export const typeClass = (token: string): string => 'eye-' + token.replace(/\./g, '-');

/** The text roles (UX-18-002) and the statement roles (UX-18-004), each bound to type tokens. */
export const TEXT_ROLES = {
  label: { type: 'type.label.md', css: 'color: var(--eye-color-ink-muted);' },
  value: { type: 'type.body.md', css: 'color: var(--eye-color-ink-strong);' },
  number: { type: 'type.numeric.md', css: 'color: var(--eye-color-ink-strong); white-space: nowrap;' },
  unit: { type: 'type.body.sm', css: 'color: var(--eye-color-ink-muted); white-space: nowrap;' },
  timestamp: { type: 'type.mono.sm', css: 'color: var(--eye-color-ink-default); font-variant-numeric: tabular-nums; white-space: nowrap;' },
  identifier: { type: 'type.mono.sm', css: 'color: var(--eye-color-ink-default); overflow-wrap: anywhere;' },
  digest: { type: 'type.mono.sm', css: 'color: var(--eye-color-ink-muted); overflow-wrap: anywhere;' },
  fact: { type: 'type.body.md', css: 'font-style: normal; font-weight: 400;' },
  recommendation: { type: 'type.body.md', css: 'font-style: italic; font-weight: 400; border-inline-start: 2px dashed var(--eye-color-recommended); padding-inline-start: var(--eye-space-8);' },
  decision: { type: 'type.body.md', css: 'font-style: normal; font-weight: 650; border-inline-start: 4px solid var(--eye-color-decided); padding-inline-start: var(--eye-space-8);' },
} as const;
export type TextRole = keyof typeof TEXT_ROLES;

const indent = (s: string, pad: string) => s.replace(/^/gm, pad);

/** Emit the CSS custom-property sheet. */
export function buildCss(): string {
  const light = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${t.light};`).join('\n');
  const dark = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${t.dark};`).join('\n');
  const space = SPACE_TOKENS.map((v) => `  --eye-space-${v}: ${v}px;`).join('\n');
  const sizes = Object.entries(SIZE_TOKENS).map(([k, v]) => `  --eye-size-${k.replace('.', '-')}: ${v}px;`).join('\n');
  const radius = Object.entries(RADIUS_TOKENS).map(([k, v]) => `  --eye-radius-${k}: ${v}px;`).join('\n');
  const border = Object.entries(BORDER_TOKENS).map(([k, v]) => `  --eye-border-${k}: ${v}px;`).join('\n');
  const elev = Object.entries(ELEVATION_TOKENS).map(([k, v]) => `  --eye-elevation-${k}: ${v};`).join('\n');
  const motion = Object.entries(MOTION_TOKENS).map(([k, v]) => `  --eye-motion-${k}: ${v}ms;`).join('\n');
  const type = TYPE_TOKENS.map((t) => {
    const base = `  ${varName(t.token)}: ${t.size}px; ${varName(t.token)}-line: ${t.line}px; ${varName(t.token)}-weight: ${t.weight};`;
    return 'tabular' in t && t.tabular === true ? `${base} ${varName(t.token)}-numeric: tabular-nums;` : base;
  }).join('\n');
  const aliases = [
    '  /* B80 §TK use aliases */',
    '  --eye-elevation-raised: var(--eye-elevation-1);',
    '  --eye-elevation-overlay: var(--eye-elevation-2);',
    '  --eye-elevation-blocking: var(--eye-elevation-3);',
    '  --eye-size-control-consequential: var(--eye-size-control-lg);',
  ].join('\n');
  const fallbackLight = ALLOWED_COLOUR_KEYS.map((k) => `  ${varName(k)}: ${CORE_LIGHT[k]};`).join('\n');
  const fallbackDark = ALLOWED_COLOUR_KEYS.map((k) => `  ${varName(k)}: ${CORE_DARK[k]};`).join('\n');
  const print = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${PRINT_PALETTE[t.token]} !important;`).join('\n');
  const forced = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${forcedSystemColour(t.token)} !important;`).join('\n');
  const typeClasses = TYPE_TOKENS.map((t) => {
    const v = varName(t.token);
    const extra = ('tabular' in t && t.tabular === true ? ' font-variant-numeric: tabular-nums;' : '') + ('mono' in t && t.mono === true ? ' font-family: var(--eye-font-mono);' : '');
    return `.${typeClass(t.token)} { font-size: var(${v}); line-height: var(${v}-line); font-weight: var(${v}-weight);${extra} }`;
  }).join('\n');
  const roles = (Object.keys(TEXT_ROLES) as TextRole[]).map((r) => `.eye-text-${r} { font-size: var(${varName(TEXT_ROLES[r].type)}); line-height: var(${varName(TEXT_ROLES[r].type)}-line); ${
    TEXT_ROLES[r].type.startsWith('type.numeric') ? 'font-variant-numeric: tabular-nums; ' : ''}${TEXT_ROLES[r].type.startsWith('type.mono') ? 'font-family: var(--eye-font-mono); ' : ''}${TEXT_ROLES[r].css} }`).join('\n');
  return `/* GENERATED from @eye/tokens — Volume 9 Appendix A. Do not edit by hand. */
:root {
${light}
${space}
${sizes}
${radius}
${border}
${elev}
${motion}
${type}
${aliases}
  --eye-font-ui: ${FONT_FAMILIES.ui};
  --eye-font-mono: ${FONT_FAMILIES.mono};
}
:root[data-theme='dark'] {
${dark}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${dark.replace(/^ {2}/gm, '    ')}
  }
}
/* THE FALLBACK SCOPE (B80 §TK): the certified core values a customer theme could have changed, re-asserted */
[data-eye-theme='fallback'] {
${fallbackLight}
}
:root[data-theme='dark'] [data-eye-theme='fallback'] {
${fallbackDark}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) [data-eye-theme='fallback'] {
${indent(fallbackDark, '  ')}
  }
}
/* PRINT (B80 §TK): light inks on paper white, whatever the screen theme */
@media print {
  :root, :root[data-theme], [data-eye-theme] {
${indent(print, '  ')}
  }
}
/* FORCED COLOURS (B80 §TK): every token takes its system colour; symbols and labels carry meaning */
@media (forced-colors: active) {
  :root, :root[data-theme], [data-eye-theme] {
${indent(forced, '  ')}
  }
}
/* THE TYPE CLASSES and THE TEXT ROLES (B80 §TK) */
${typeClasses}
${roles}
`;
}
