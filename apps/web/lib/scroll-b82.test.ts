/**
 * B82 §GM — UX-19-003: sticky region boundaries within one scroll owner per region (lib/scroll-b82.ts) and the stylesheet that makes it so
 * (app/globals.css). The STICKY half: no ancestor of the page content in the shell is a scroll container (B80's `.eye-shell-main {
 * overflow-x: auto }` was one — a sticky boundary inside it never stuck), and the supporting panel is the sticky boundary on the grid. The
 * NO-SIDEWAYS-SCROLL half: main still CLIPS its inline overflow (a stray wide child never widens the page — phase1-observation #14) and the
 * wide content owns its own inline scroll. The browser half (computed styles at 1440 / 1024 / 800 / 390 px) is the hosted #14 and the walk.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssRules, effective, isScrollContainer, regionScrollOf, stickyBlockers } from './scroll-b82';
import { composeRegions, scrollOwnerOf } from './layout-b81';

const WEB = join(__dirname, '..');
const CSS = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');
const LAYOUT = readFileSync(join(WEB, 'components', 'layout.tsx'), 'utf8');

describe('UX-19-003 — one scroll owner per region; the supporting panel is the sticky boundary on the grid', () => {
  it('one column (or unmeasured): the page owns every region and nothing sticks over the task', () => {
    for (const p of ['band', 'main', 'panel', 'deferred', null] as const) expect(regionScrollOf(p, 1)).toMatchObject({ block: 'page', sticky: null, inline: 'content' });
    expect(regionScrollOf('panel', 12)).toEqual({ block: 'region', inline: 'content', sticky: 'block-start', why: expect.stringMatching(/stays beside the task/) });
    expect(regionScrollOf('band', 12).sticky).toBeNull();
    expect(regionScrollOf('main', 12).block).toBe('page');
  });
  it('B81\'s class rule is unchanged (the page on one column, the columns on the grid) and agrees with the per-region plan', () => {
    expect(scrollOwnerOf('BP-01')).toBe('page');
    expect(scrollOwnerOf('BP-04')).toBe('columns');
    const plan = composeRegions({ cls: 'BP-04', present: ['context', 'primary', 'action', 'evidence'], selection: null });
    const sticky = plan.regions.filter((r) => regionScrollOf(r.placement, plan.columns).sticky !== null).map((r) => r.region);
    expect(sticky).toEqual(['evidence']);
    const one = composeRegions({ cls: 'BP-01', present: ['context', 'primary', 'action', 'evidence'], selection: null });
    expect(one.regions.filter((r) => regionScrollOf(r.placement, one.columns).sticky !== null)).toEqual([]);
  });
  it('the Composition marks each region with its owner and its sticky boundary (components/layout.tsx)', () => {
    expect(LAYOUT).toMatch(/scroll=\{regionScrollOf\(r\.placement, plan\.columns\)\}/);
    expect(LAYOUT).toMatch(/data-scroll-owner=\{scroll\?\.block\} data-sticky=\{scroll\?\.sticky \?\? undefined\}/);
  });
});

describe('UX-19-003 — the stylesheet: sticky works, and the page never scrolls sideways', () => {
  const rules = cssRules(CSS);
  it('the parser reads overflow shorthands and the last rule wins', () => {
    const r = cssRules('.a { overflow: auto hidden; } @media (x) { .a { overflow-x: visible; } } .a { overflow-y: clip; }');
    expect(effective(r, '.a', 'overflow-x')).toBe('auto');
    expect(effective(r, '.a', 'overflow-y')).toBe('clip');
    expect(isScrollContainer('clip', null)).toBe(false);
    expect(isScrollContainer('auto', null)).toBe(true);
    expect(isScrollContainer(null, 'hidden')).toBe(true);
  });
  it('B80\'s defect is gone: no ancestor of the page content is a scroll container (a sticky boundary sticks to the page\'s scroll)', () => {
    expect(stickyBlockers(CSS)).toEqual([]);
    // the proof the check catches the defect: B80's rule alone makes main a blocker
    expect(stickyBlockers('.eye-shell-main { flex: 1; overflow-x: auto; }')).toEqual([{ selector: '.eye-shell-main', overflowX: 'auto', overflowY: null }]);
  });
  it('main still CLIPS its inline overflow (never widens the page); wide content owns its inline scroll; the panel sticks', () => {
    expect(effective(rules, '.eye-shell-main', 'overflow-x')).toBe('clip');
    expect(effective(rules, '.eye-dt-scroll', 'overflow-x')).toBe('auto');
    expect(effective(rules, '.eye-canvas-scroll', 'overflow-x')).toBe('auto');
    expect(effective(rules, '.eye-region[data-sticky="block-start"]', 'position')).toBe('sticky');
    const sticky = rules.find((r) => r.selector === '.eye-region[data-sticky="block-start"]')!;
    expect(sticky.decls).toMatchObject({ 'inset-block-start': '0', 'max-block-size': '100vh', 'overflow-y': 'auto' });
    expect(Object.keys(sticky.decls).some((k) => /^(top|left|right|bottom|margin-left|margin-right|padding-left|padding-right)$/.test(k))).toBe(false);   // logical properties only
  });
});
