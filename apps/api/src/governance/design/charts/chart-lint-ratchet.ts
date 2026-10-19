/**
 * CP-6 B82 §CF — THE CHART-GRAMMAR RATCHET (dg-lint-4): TODAY'S findings over the real web source, committed on 2026-10-19 at the B82 prelude
 * (3571d92b) plus §CF's own files (which add none). THE LIST ONLY SHRINKS: a finding not listed here is a regression (the unit test
 * chart-grammar-b82.test.ts and the lint route say so); when a page is corrected its entry is REMOVED in the same change. Never add an entry
 * to admit a new finding — draw through the library's ChartFrame, or record a narrow, expiring design exception through B107's port.
 *
 * The four entries are the two hand-drawn div charts the B82 map names (§5.6, VIZ-07 / VIZ-12): the sensitivity tornado on
 * /twins/simulations/impact and the health score bar on /decisions/health — both pages §SC's (wave 2), which replaces them with
 * SensitivityTornado and HealthDecomposition (components/strategic-charts.tsx) and empties this list at its fold. dg-lint-4 is at ZERO
 * findings only then (UX-ADR-015, REL-17 — partial until that fold). Fingerprint = sha256(rule, file, text)[0..16].
 */
import type { ChartRatchetEntry } from './chart-lint.js';

export const CHART_LINT_RATCHET: readonly ChartRatchetEntry[] = [
  { rule: 'drawing-outside-frame', file: 'apps/web/app/decisions/health/page.tsx', excerpt: '<div role="img" aria-label={`${label}: ${pct} of 100; band floors ${bands.map((b) => `${b.key} ${b.min}`).join(\', \')}`}', fingerprint: 'd67f6d4eac769e60', carrier: '§SC HealthDecomposition (B82 wave 2)' },
  { rule: 'div-chart', file: 'apps/web/app/decisions/health/page.tsx', excerpt: '<div style={{ position: \'absolute\', insetBlock: 0, insetInlineStart: 0, inlineSize: `${pct}%`, background: \'var(--eye-color-accent-default)\', borderRadius: \'var(--eye-radius-sm)\' }} />', fingerprint: 'd971112d9b9915c6', carrier: '§SC HealthDecomposition (B82 wave 2)' },
  { rule: 'drawing-outside-frame', file: 'apps/web/app/twins/simulations/impact/page.tsx', excerpt: '<div role="img" aria-label={`${r.key}: low ${r.lowValue} moves the metric by ${r.lowDelta}; high ${r.highValue} by ${r.highDelta}`}', fingerprint: '65751faaae69bf6f', carrier: '§SC SensitivityTornado (B82 wave 2)' },
  { rule: 'div-chart', file: 'apps/web/app/twins/simulations/impact/page.tsx', excerpt: '...(b.pct >= 0 ? { insetInlineStart: \'50%\', inlineSize: `${b.pct / 2}%` } : { insetInlineEnd: \'50%\', inlineSize: `${-b.pct / 2}%` }) }} />', fingerprint: 'ffcafc9bb23a2ce1', carrier: '§SC SensitivityTornado (B82 wave 2)' },
];
