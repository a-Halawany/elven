/**
 * CP-6 B82 §CF — the charts RENDERED (react-dom/server, node; no DOM, no new dependency): the catalogue's section draws every quantitative
 * kind inside a ChartFrame — each with its declarations, its legend, its drawing and its table alternative — and refuses exactly the one
 * specimen that is missing its declarations. The structure a screen reader reads is asserted on the markup: a figure named by its caption,
 * the legend list, the points as buttons named by their table rows, the table with its caption and scoped headers. Every value is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
// @ts-expect-error -- react-dom ships no type declarations and no new dev dependency (@types/react-dom) is added; the call is typed below
import { renderToStaticMarkup } from 'react-dom/server';
import { CfCatalogue, CF_RENDERED } from '../app/admin/governance/design/catalogue/cf-fixtures';
import { LIBRARY_B82 } from './b82-seams';

const html: string = (renderToStaticMarkup as (e: ReturnType<typeof createElement>) => string)(createElement(CfCatalogue));
const figures: string[] = html.split('<figure').slice(1);
const kindOf = (f: string) => /data-chart-kind="([^"]*)"/.exec(f)?.[1] ?? '';

describe('the catalogue draws every §CF kind through ChartFrame (REL-17, UX-ADR-015)', () => {
  it('renders every quantitative kind of the library, each in a frame', () => {
    const kinds = new Set(figures.map(kindOf));
    for (const k of ['time_series', 'event_timeline', 'probability_band', 'horizon_matrix', 'distribution', 'calibration_plot', 'waterfall', 'variance_bridge', 'correlation_matrix', 'scatter', 'control_chart']) {
      expect(kinds.has(k), k).toBe(true);
    }
  });
  it('refuses exactly the specimen missing its declarations — and draws every other one', () => {
    const refused = figures.filter((f) => f.includes('eye-cf--refused'));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain('basis: missing');
    expect(refused[0]).not.toContain('<table');
    const drawn = figures.filter((f) => f.includes('data-chart-state="ready"') && f.includes('eye-cf-svg'));
    expect(drawn.length).toBeGreaterThanOrEqual(13);
  });
  it('every drawn chart has its legend, its declarations and its table alternative with a caption and scoped headers', () => {
    for (const f of figures.filter((x) => x.includes('eye-cf-svg'))) {
      expect(f).toContain('class="eye-cf-legend"');
      expect(f).toContain('class="eye-cf-declarations"');
      expect(f).toMatch(/aria-label="Table alternative: [^"]+"/);
      expect(f).toContain('<caption');
      expect(f).toContain('scope="col"');
    }
  });
  it('the interactive drawings are named groups whose points are buttons named by their table rows (CMP-059)', () => {
    const ts = figures.find((f) => f.includes('Time series — daily transits'))!;
    expect(ts).toContain('role="group"');
    expect(ts).toMatch(/role="button" tabindex="0"[^>]*aria-label="Series: chokepoint 4; Time: 2026-09-20; Value: \d+ vessels per day"/);
    expect((ts.match(/tabindex="0"/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
  it('the gap is drawn as a gap and stated in words (VIZ-01); the band is a band (VIZ-03); the residual is stated (VIZ-22)', () => {
    const ts = figures.find((f) => f.includes('Time series — daily transits'))!;
    expect(ts).toContain('class="eye-cf-gap"'); expect(ts).toContain('drawn as gaps, never interpolated');
    const band = figures.find((f) => kindOf(f) === 'probability_band')!;
    expect(band).toContain('class="eye-cf-band"'); expect(band).toContain('cutoff'); expect(band).toContain('UNVALIDATED');
    expect(figures.find((f) => kindOf(f) === 'waterfall')!).toContain('Residual -2');
  });
  it('the frame states say what they are in words (CMP-057)', () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Reading the values');
    expect(html).toContain('a SYNTHETIC refusal shown in the server');
    expect(html).toContain('Withheld — the read is above');
    expect(html).toContain('<strong>Stale</strong>');
    expect(html).toContain('<strong>No values</strong>');
  });
  it('no raw colour reaches the markup; series identity is dash and marker (D5)', () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('data-shape="square"');
  });
  it('the catalogue renders every name LIBRARY_B82 gives §CF (and the frame)', () => {
    for (const n of [...LIBRARY_B82.chart.exports, ...LIBRARY_B82.frame.exports]) expect(CF_RENDERED).toContain(n);
  });
});
