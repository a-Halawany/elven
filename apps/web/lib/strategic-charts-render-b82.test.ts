/**
 * CP-6 B82 §SC — the strategic charts RENDERED (react-dom/server, node; no DOM, no new dependency): the catalogue's §SC section draws every
 * scenario, decision, risk and operations kind inside a ChartFrame — each with its declarations, its legend and its table alternative — and
 * refuses exactly the specimen that names a single destiny; runs on two twin versions are listed, not drawn side by side; an indeterminate
 * health dimension draws nothing. No raw colour, no causal word on the tornado, no rank column on the option matrix. Every value is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
// @ts-expect-error -- react-dom ships no type declarations and no new dev dependency (@types/react-dom) is added; the call is typed below
import { renderToStaticMarkup } from 'react-dom/server';
import { ScCatalogue, SC_RENDERED } from '../app/admin/governance/design/catalogue/sc-fixtures';
import { LIBRARY_B82 } from './b82-seams';

const html: string = (renderToStaticMarkup as (e: ReturnType<typeof createElement>) => string)(createElement(ScCatalogue));
const figures: string[] = html.split('<figure').slice(1);
const kindOf = (f: string) => /data-chart-kind="([^"]*)"/.exec(f)?.[1] ?? '';
const SC_KINDS = ['scenario_fan', 'scenario_comparison', 'sensitivity_tornado', 'risk_matrix', 'opportunity_portfolio', 'health_decomposition', 'run_comparison', 'twin_state_diff',
  'option_matrix', 'evidence_coverage', 'status_board', 'alert_queue', 'audit_timeline'];

describe('the catalogue draws every §SC kind through ChartFrame (REL-17, UX-ADR-015)', () => {
  it('renders every §SC kind, and its names are exactly LIBRARY_B82.strategic\'s exports', () => {
    const kinds = new Set(figures.map(kindOf));
    for (const k of SC_KINDS) expect(kinds.has(k), k).toBe(true);
    expect([...SC_RENDERED].sort()).toEqual([...LIBRARY_B82.strategic.exports].sort());
  });
  it('refuses exactly the fan that names a single destiny — and frames every other one', () => {
    const refused = figures.filter((f) => f.includes('eye-cf--refused'));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain('names no single destiny (most likely)');
    expect(refused[0]).not.toContain('<table');
    const drawn = figures.filter((f) => f.includes('data-chart-state="ready"') && f.includes('eye-cf-svg'));
    expect(drawn.length).toBeGreaterThanOrEqual(13);
  });
  it('every framed chart has its declarations, its legend and its table alternative with a caption and scoped headers; specimens say so', () => {
    for (const f of figures.filter((x) => !x.includes('eye-cf--refused'))) {
      expect(f).toContain('class="eye-cf-declarations"');
      expect(f).toContain('class="eye-cf-legend"');
      expect(f).toMatch(/aria-label="Table alternative: [^"]+"/);
      expect(f).toContain('<caption');
      expect(f).toContain('scope="col"');
      expect(f).toContain('SYNTHETIC specimen');
    }
  });
  it('the anti-patterns stay out: runs on two twin versions are not drawn; an indeterminate dimension draws nothing; no raw colour', () => {
    const twoTwins = figures.find((f) => f.includes('Runs on two twin versions'))!;
    expect(twoTwins).toContain('Not drawn side by side: the runs stand on different twin versions');
    expect(twoTwins).not.toContain('eye-cf-svg');
    const indet = figures.find((f) => f.includes('Resilience — the score laid out'))!;
    expect(indet).toContain('data-chart-state="empty"'); expect(indet).not.toContain('eye-cf-svg');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    const option = figures.find((f) => kindOf(f) === 'option_matrix')!;
    expect(option).not.toMatch(/>Rank<|>Score</);
  });
  it('an interactive chart\'s points are buttons named by their table rows; the drawing\'s SVG is hidden from assistive technology', () => {
    const fan = figures.find((f) => kindOf(f) === 'scenario_fan' && !f.includes('refused'))!;
    expect(fan).toMatch(/role="button"[^>]*aria-label="Branch: Baseline; Kind: baseline/);
    expect(fan).toContain('class="eye-cf-svg" viewBox');
    expect(fan).toMatch(/<svg class="eye-cf-svg"[^>]*aria-hidden="true"/);
  });
});
