/**
 * B80 §CL-F (F-P7-E-05; DESIGN D5 / Q5) — THE LIBRARY OWNS THE STYLE CONSTANTS. `inputStyle`, `textareaStyle`, `buttonStyle`, `cardStyle` and
 * `tableStyle` are defined HERE, once (ui.tsx and observation.tsx keep exporting them under the same names for the ~200 pages that import them;
 * forms.tsx and actions.tsx export them as library exports). Their visual STATES live in ONE place — `app/globals.css` (the B80 clf block):
 * each constant reads its state-bearing properties through a CSS custom property with the token as the fallback
 * (`var(--eye-input-border, var(--eye-color-border-default))`), and the stylesheet sets those properties on :hover, :disabled,
 * [aria-invalid='true'], [aria-busy='true'], [readonly] and under `forced-colors: active` — so every page that already uses the constants
 * inherits hover, focus, disabled, invalid, busy and forced-colour states WITHOUT an edit. Semantic tokens only (UX-ADR-010); logical
 * properties only (RTL mirrors). The class names below are the same states for library components that render a class instead of a style.
 *
 * The inline-style RATCHET (styles-b80.test.ts): the count of `style={{` in apps/web/app may not rise above its committed baseline — pages
 * move onto the library as later stages touch them (UX-ADR-011's evidence states that); a new page renders library components.
 */
import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  blockSize: 'var(--eye-size-control-md)',
  border: '1px solid var(--eye-input-border, var(--eye-color-border-default))',
  borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-8)',
  fontSize: 'var(--eye-type-body-md)',
  background: 'var(--eye-input-bg, var(--eye-color-surface-primary))',
  color: 'var(--eye-input-ink, var(--eye-color-ink-default))',
};

export const textareaStyle: CSSProperties = {
  inlineSize: '100%',
  minBlockSize: '4.5rem',
  border: '1px solid var(--eye-input-border, var(--eye-color-border-default))',
  borderRadius: 'var(--eye-radius-md)',
  padding: 'var(--eye-space-8)',
  fontSize: 'var(--eye-type-body-md)',
  fontFamily: 'var(--eye-font-ui)',
  background: 'var(--eye-input-bg, var(--eye-color-surface-primary))',
  color: 'var(--eye-input-ink, var(--eye-color-ink-default))',
};

export const buttonStyle: CSSProperties = {
  blockSize: 'var(--eye-size-control-md)',
  border: '1px solid var(--eye-button-border, var(--eye-color-accent-strong))',
  borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-12)',
  background: 'var(--eye-button-bg, var(--eye-color-accent-default))',
  color: 'var(--eye-button-ink, var(--eye-color-surface-primary))',
  fontWeight: 600,
  cursor: 'var(--eye-button-cursor, pointer)',
};

export const cardStyle: CSSProperties = {
  background: 'var(--eye-color-surface-primary)',
  border: '1px solid var(--eye-color-border-default)',
  borderRadius: 'var(--eye-radius-lg)',
  padding: 'var(--eye-space-16)',
};

export const tableStyle: CSSProperties = {
  inlineSize: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--eye-type-body-sm)',
};

/** The library's CSS classes (app/globals.css, the B80 clf block) — one name per role; states come from the stylesheet. */
export const CLASSES = {
  field: 'eye-field', label: 'eye-label', help: 'eye-help', error: 'eye-field-error', required: 'eye-required', proposed: 'eye-proposed',
  input: 'eye-input', textarea: 'eye-input eye-textarea', select: 'eye-input eye-select', count: 'eye-count',
  button: 'eye-button', menu: 'eye-menu', menuItem: 'eye-menu-item', split: 'eye-split',
  message: 'eye-message', toast: 'eye-toast', progress: 'eye-progress', skeleton: 'eye-skeleton', empty: 'eye-empty',
  summary: 'eye-error-summary', stepper: 'eye-stepper', draft: 'eye-draft', card: 'eye-card', row: 'eye-row', grid: 'eye-form-grid',
} as const;

/** Every custom property the constants read, with the token it falls back to — the stylesheet may set only these. */
export const STATE_PROPERTIES: Readonly<Record<string, string>> = {
  '--eye-input-border': '--eye-color-border-default', '--eye-input-bg': '--eye-color-surface-primary', '--eye-input-ink': '--eye-color-ink-default',
  '--eye-button-border': '--eye-color-accent-strong', '--eye-button-bg': '--eye-color-accent-default', '--eye-button-ink': '--eye-color-surface-primary',
  '--eye-button-cursor': 'pointer',
};
