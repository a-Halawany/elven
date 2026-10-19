/**
 * CP-6 B82 — THE VISUALIZATION WALK (F-P7-E-21; GLB-07, UX-ADR-015/016, REL-17): scene 3 of the B82 map §8 (the corridor flow map, the
 * probability band of transit delay, the scenario fan for the Regensburg line) and EVERY visual kind of the design catalogue, at 390 / 800 /
 * 1024 / 1440 / 1920 / 2560 px, at 200 % zoom and in forced colours. Each chart's TABLE ALTERNATIVE is read through the ACCESSIBILITY TREE
 * (its region by name, role table, the caption, the column headers) — the screen-reader check of DESIGN D2; testing with human assistive-
 * technology users stays B108's. A DEMO WALK, not a hosted gate case (playwright.demo.config.ts only).
 *
 * §0 SKELETON (the integrator's prelude): the scenes are named and skipped; the act builder fills each one (personas from EYE_B82_*, the
 * password EYE_TEST_ADMIN_PASSWORD, screenshots to EYE_SHOTS as b82-viz-*.png). The walk WRITES NOTHING. Every figure is SYNTHETIC; the
 * sankey and the choropleth are catalogue specimens only (D13 / Q4), and say so. Demonstrated operation, never an acceptance.
 */
import { test } from '@playwright/test';

test.describe('CP-6 B82 — the visualization walk: the corridor map, the band, the fan, and every kind in the catalogue', () => {
  test.skip('B82-3 THE CORRIDOR MAP (/graph/geo and the operations room): the declared references on a graticule with a scale bar, EPSG:4326 stated, no tiles; the flow map\'s width legend, period and source; its table alternative read by role', async () => {});
  test.skip('B82-3 THE PROBABILITY BAND: the transit-delay forecast\'s q10–q90 with "unvalidated" stated and its cutoff; the alternative read by role; the CSV downloads the displayed rows', async () => {});
  test.skip('B82-3 THE SCENARIO FAN: the every-kind branches with their p10–p90 and the elicited bands, no single highlighted destiny, the suspended branch marked; the alternative read by role', async () => {});
  test.skip('B82-6 THE CATALOGUE: every visual kind in a ChartFrame with its declarations (basis, time, units, sources, uncertainty), its legend and its table alternative; a spec missing a declaration is refused, not drawn', async () => {});
  test.skip('THE VIEWPORT MATRIX: 390 / 800 / 1024 / 1440 / 1920 / 2560 px — no sideways page scroll; every alternative reachable by keyboard', async () => {});
  test.skip('200 % ZOOM AND FORCED COLOURS: the declarations wrap, series stay told apart by dash and marker (no colour alone), the alternatives stay readable', async () => {});
});
