/**
 * Design token registry — Volume 9 Appendix A (verbatim values).
 * Product code consumes semantic aliases only (UX-ADR-010); these tokens are
 * emitted as CSS custom properties (light + dark) and a Tailwind preset.
 */

export interface ColorToken {
  id: string;
  token: string;
  light: string;
  dark: string;
  role: string;
}

export const COLOR_TOKENS: ColorToken[] = [
  { id: 'CLR-001', token: 'color.canvas', light: '#F4F7FA', dark: '#0A111B', role: 'Application canvas' },
  { id: 'CLR-002', token: 'color.surface.primary', light: '#FFFFFF', dark: '#111A27', role: 'Primary work surface' },
  { id: 'CLR-003', token: 'color.surface.secondary', light: '#EAF0F5', dark: '#182434', role: 'Secondary region' },
  { id: 'CLR-004', token: 'color.surface.elevated', light: '#FFFFFF', dark: '#1E2B3D', role: 'Overlay / elevated task' },
  { id: 'CLR-005', token: 'color.ink.strong', light: '#0D1B2A', dark: '#F4F7FB', role: 'Primary text & identity' },
  { id: 'CLR-006', token: 'color.ink.default', light: '#243447', dark: '#DCE5EF', role: 'Body text' },
  { id: 'CLR-007', token: 'color.ink.muted', light: '#526579', dark: '#AFC0D1', role: 'Secondary metadata' },
  { id: 'CLR-008', token: 'color.border.default', light: '#C5D0DB', dark: '#405166', role: 'Default boundaries' },
  { id: 'CLR-009', token: 'color.border.strong', light: '#8EA0B3', dark: '#6F8298', role: 'Emphasized boundary' },
  { id: 'CLR-010', token: 'color.accent.default', light: '#0B6674', dark: '#65D3DE', role: 'Primary interaction accent' },
  { id: 'CLR-011', token: 'color.accent.strong', light: '#084C55', dark: '#9BE9EF', role: 'Accent emphasis' },
  { id: 'CLR-012', token: 'color.focus', light: '#005FCC', dark: '#78AFFF', role: 'Keyboard focus ring' },
  { id: 'CLR-013', token: 'color.info', light: '#175CD3', dark: '#84ADFF', role: 'Informational state' },
  { id: 'CLR-014', token: 'color.success', light: '#027A48', dark: '#6CE9A6', role: 'Verified success' },
  { id: 'CLR-015', token: 'color.warning', light: '#B54708', dark: '#FEC84B', role: 'Warning / caution' },
  { id: 'CLR-016', token: 'color.critical', light: '#B42318', dark: '#FDA29B', role: 'Critical condition' },
  { id: 'CLR-017', token: 'color.uncertain', light: '#6941C6', dark: '#BDB4FE', role: 'Uncertainty / indeterminate' },
  { id: 'CLR-018', token: 'color.observed', light: '#246B5A', dark: '#75E0C2', role: 'Observed truth state' },
  { id: 'CLR-019', token: 'color.asserted', light: '#2D5B9F', dark: '#9EC5FE', role: 'Asserted truth state' },
  { id: 'CLR-020', token: 'color.inferred', light: '#6A4C93', dark: '#C4A7E7', role: 'Inferred truth state' },
  { id: 'CLR-021', token: 'color.assessed', light: '#8A5A00', dark: '#F5D06F', role: 'Assessed truth state' },
  { id: 'CLR-022', token: 'color.synthetic', light: '#6B4F9B', dark: '#CAB8FF', role: 'Synthetic truth state' },
  { id: 'CLR-023', token: 'color.recommended', light: '#0B6674', dark: '#65D3DE', role: 'Recommended state' },
  { id: 'CLR-024', token: 'color.decided', light: '#1F5132', dark: '#9FE2B4', role: 'Human-decided state' },
  { id: 'CLR-025', token: 'color.corrected', light: '#8A5A00', dark: '#F5D06F', role: 'Corrected state' },
  { id: 'CLR-026', token: 'color.withdrawn', light: '#8B1E2D', dark: '#FFB4BE', role: 'Withdrawn state' },
  { id: 'CLR-027', token: 'color.classification', light: '#5B3A29', dark: '#E4B69C', role: 'Classification banner' },
  { id: 'CLR-028', token: 'color.degraded', light: '#7A3E00', dark: '#FFCA80', role: 'Degraded operation' },
  { id: 'CLR-029', token: 'color.disabled.ink', light: '#7E8FA1', dark: '#74879C', role: 'Unavailable control text' },
  { id: 'CLR-030', token: 'color.selection', light: '#D6EEF1', dark: '#123A43', role: 'Selected object or row' },
];

export const TYPE_TOKENS = [
  { id: 'TYP-003', token: 'type.display.1', size: 40, line: 48, weight: 700 },
  { id: 'TYP-004', token: 'type.display.2', size: 32, line: 40, weight: 650 },
  { id: 'TYP-005', token: 'type.heading.1', size: 24, line: 32, weight: 650 },
  { id: 'TYP-006', token: 'type.heading.2', size: 20, line: 28, weight: 650 },
  { id: 'TYP-007', token: 'type.heading.3', size: 16, line: 24, weight: 650 },
  { id: 'TYP-008', token: 'type.body.lg', size: 16, line: 24, weight: 400 },
  { id: 'TYP-009', token: 'type.body.md', size: 14, line: 20, weight: 400 },
  { id: 'TYP-010', token: 'type.body.sm', size: 12, line: 18, weight: 400 },
  { id: 'TYP-011', token: 'type.label.md', size: 13, line: 16, weight: 600 },
  { id: 'TYP-012', token: 'type.label.sm', size: 11, line: 14, weight: 650 },
  { id: 'TYP-013', token: 'type.numeric.lg', size: 28, line: 32, weight: 600, tabular: true },
  { id: 'TYP-014', token: 'type.numeric.md', size: 16, line: 20, weight: 550, tabular: true },
  { id: 'TYP-015', token: 'type.mono.sm', size: 12, line: 18, weight: 400, mono: true },
] as const;

export const FONT_FAMILIES = {
  ui: "'Inter Variable', 'Segoe UI', Arial, sans-serif",
  mono: "'IBM Plex Mono', Consolas, monospace",
} as const;

/** 4px base spatial scale. */
export const SPACE_TOKENS = [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80] as const;

export const SIZE_TOKENS = { 'control.sm': 28, 'control.md': 36, 'control.lg': 44 } as const;
export const RADIUS_TOKENS = { sm: 2, md: 4, lg: 8 } as const;
export const BORDER_TOKENS = { default: 1, focus: 3 } as const;
export const ELEVATION_TOKENS = {
  '1': '0 1px 2px rgba(13,27,42,0.12)',
  '2': '0 4px 12px rgba(13,27,42,0.16)',
  '3': '0 12px 32px rgba(13,27,42,0.22)',
} as const;
/** motion.instant = 0ms is REQUIRED for consequential state change (UX-ADR-017). */
export const MOTION_TOKENS = { instant: 0, fast: 80, standard: 140, layout: 220, deliberate: 320, max: 480 } as const;

function varName(token: string): string {
  return '--eye-' + token.replace(/\./g, '-');
}

/** Emit the CSS custom-property sheet (light default + dark via data-theme + prefers-color-scheme). */
export function buildCss(): string {
  const light = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${t.light};`).join('\n');
  const dark = COLOR_TOKENS.map((t) => `  ${varName(t.token)}: ${t.dark};`).join('\n');
  const space = SPACE_TOKENS.map((v) => `  --eye-space-${v}: ${v}px;`).join('\n');
  const sizes = Object.entries(SIZE_TOKENS).map(([k, v]) => `  --eye-size-${k.replace('.', '-')}: ${v}px;`).join('\n');
  const radius = Object.entries(RADIUS_TOKENS).map(([k, v]) => `  --eye-radius-${k}: ${v}px;`).join('\n');
  const border = Object.entries(BORDER_TOKENS).map(([k, v]) => `  --eye-border-${k}: ${v}px;`).join('\n');
  const elev = Object.entries(ELEVATION_TOKENS).map(([k, v]) => `  --eye-elevation-${k}: ${v};`).join('\n');
  const motion = Object.entries(MOTION_TOKENS).map(([k, v]) => `  --eye-motion-${k}: ${v}ms;`).join('\n');
  const type = TYPE_TOKENS.map(
    (t) => `  ${varName(t.token)}: ${t.size}px; ${varName(t.token)}-line: ${t.line}px; ${varName(t.token)}-weight: ${t.weight};`,
  ).join('\n');
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
`;
}
