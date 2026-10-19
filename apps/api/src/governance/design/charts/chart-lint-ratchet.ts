/**
 * CP-6 B82 §CF — THE CHART-GRAMMAR RATCHET (dg-lint-4): TODAY'S findings over the real web source, committed on 2026-10-19 at the B82 prelude
 * (3571d92b) plus §CF's own files (which add none). THE LIST ONLY SHRINKS: a finding not listed here is a regression (the unit test
 * chart-grammar-b82.test.ts and the lint route say so); when a page is corrected its entry is REMOVED in the same change. Never add an entry
 * to admit a new finding — draw through the library's ChartFrame, or record a narrow, expiring design exception through B107's port.
 *
 * The four entries WERE the two hand-drawn div charts the B82 map names (§5.6, VIZ-07 / VIZ-12): the sensitivity tornado on
 * /twins/simulations/impact and the health score bar on /decisions/health — both pages §SC's (wave 2), which replaces them with
 * SensitivityTornado and HealthDecomposition (components/strategic-charts.tsx) and empties this list at its fold. dg-lint-4 is at ZERO
 * findings only then (UX-ADR-015, REL-17 — partial until that fold). Fingerprint = sha256(rule, file, text)[0..16].
 */
import type { ChartRatchetEntry } from './chart-lint.js';

/* B82 sc: the four entries REMOVED — §SC replaced both div charts (SensitivityTornado on /twins/simulations/impact, HealthDecomposition on
   /decisions/health); dg-lint-4 stands at ZERO findings over the real web source (UX-ADR-015, REL-17). The list stays: it only shrinks. */
export const CHART_LINT_RATCHET: readonly ChartRatchetEntry[] = [];
