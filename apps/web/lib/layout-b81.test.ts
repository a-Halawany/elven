/**
 * CP-6 B81 §LY-G — THE LAYOUT CONTRACT (F-P7-E-04: BP-01…05, DEN-01…03, REG-01…08, UX-14-001…005, UX-19-001…005, CMP-005…008, UX-ADR-013).
 * Positive, refusal, recovery and fault cases of the pure model components/layout.tsx renders. Every fixture is SYNTHETIC. CONSTRUCTION only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BREAKPOINTS, DENSITIES, LAYOUT_CONTRACT, PROTECTED_REGIONS, READING_ORDER, REGIONS, TASK_PHASE_WORDS, bottomNavOf, composeRegions, compositionFor,
  compositionProblems, controlSizeFor, effectiveDensity, effectiveWidth, elevationFindings, hiddenProtected, isGap, layoutClassOf, layoutSpecDigest,
  layoutToSave, mediaQueryOf, nearestSurface, reconcileLayout, reflow, roleDefaultDensity, scrollOwnerOf, taskPhaseOf, type CompositionPlan,
} from './layout-b81';
import type { LayoutClass, RegionKey } from './b81-seams';
import type { NavItem } from './b80-seams';

const WEB = join(__dirname, '..');
const ALL: RegionKey[] = ['context', 'status', 'authority', 'primary', 'action', 'evidence', 'inspector'];
const CLASSES: LayoutClass[] = ['BP-01', 'BP-02', 'BP-03', 'BP-04', 'BP-05'];
const SEL = { label: 'Bab el-Mandeb corridor reroute (SYNTHETIC)', version: 2 };
/** The digest of LAYOUT_SPEC under contract b81-lyg-layout-1 — a spec change fails here until the contract (and this pin) move together. */
const SPEC_DIGEST = 'c8f3f87983a947b6bbca968d08273733ee41e4b9dff7a8706209e265b5f527bb';
const placementOf = (p: CompositionPlan, r: RegionKey) => p.regions.find((x) => x.region === r);

describe('BP-01…05 — the breakpoints, the effective width, the step-down (UX-14-001, UX-14-005, CMP-008)', () => {
  it('each width maps to exactly one class at the published edges', () => {
    expect([0, 390, 639, 640, 800, 959, 960, 1024, 1439, 1440, 1919, 1920, 2560].map(layoutClassOf))
      .toEqual(['BP-01', 'BP-01', 'BP-01', 'BP-02', 'BP-02', 'BP-02', 'BP-03', 'BP-03', 'BP-03', 'BP-04', 'BP-04', 'BP-05', 'BP-05']);
    expect(layoutClassOf(Number.NaN)).toBe('BP-01');
    expect(BREAKPOINTS.map((b) => [b.key, b.columns, b.navigation])).toEqual([
      ['BP-01', 1, 'bottom'], ['BP-02', 1, 'rail-glyphs'], ['BP-03', 12, 'rail-collapsible'], ['BP-04', 12, 'rail-persistent'], ['BP-05', 12, 'rail-persistent']]);
    expect(CLASSES.map(mediaQueryOf)).toEqual(['(max-width: 639px)', '(min-width: 640px) and (max-width: 959px)', '(min-width: 960px) and (max-width: 1439px)',
      '(min-width: 1440px) and (max-width: 1919px)', '(min-width: 1920px)']);
  });
  it('200 % zoom halves the width: 1440 → 720 (narrow); 1920 at 200 % → 960 (standard with the rail collapsed, else narrow); 390 stays compact', () => {
    expect(effectiveWidth({ viewportPx: 1440, zoom: 2 })).toBe(720);
    expect(compositionFor({ viewportPx: 1440, zoom: 2 }).cls).toBe('BP-02');
    expect(compositionFor({ viewportPx: 1920, zoom: 2, railCollapsed: true }).cls).toBe('BP-03');
    expect(compositionFor({ viewportPx: 1920, zoom: 2 })).toMatchObject({ cls: 'BP-02', steppedFrom: 'BP-03' });
    expect(compositionFor({ viewportPx: 390 }).cls).toBe('BP-01');
    expect(compositionFor({ viewportPx: 2560 })).toEqual({ cls: 'BP-05', effectivePx: 2560, steppedFrom: null, reason: null });
  });
  it('FAULT → RECOVERY: text expansion that would squeeze the primary task steps DOWN to the next approved composition, named — never clipped', () => {
    const r = compositionFor({ viewportPx: 1000, textScale: 1.5 });
    expect(r.steppedFrom).toBe('BP-03');
    expect(r.cls).toBe('BP-02');
    expect(r.reason).toMatch(/^the primary task needs 720 px at this text size; standard would give it \d+ px — laid out as narrow \(BP-02\) instead$/);
    expect(compositionFor({ viewportPx: 1000, textScale: 1.5, railCollapsed: true }).cls).toBe('BP-02');
    expect(compositionFor({ viewportPx: 1600, expansion: 1.35 }).cls).toBe('BP-04');
    expect(compositionFor({ viewportPx: 600, textScale: 3 }).cls).toBe('BP-01');   // the floor: one column always admits the task
  });
});

describe('DEN-01…03 — the densities, the role defaults, the person\'s choice, touch and the consequential control', () => {
  it('the three densities on the control tokens: 44/36/28 px controls; rows 40–48, 32–36, 28–32', () => {
    expect(DENSITIES.map((d) => [d.key, d.name, d.controlPx, d.rowPx, d.controlVar])).toEqual([
      ['DEN-01', 'Strategic', 44, [40, 48], 'var(--eye-size-control-lg)'], ['DEN-02', 'Operational', 36, [32, 36], 'var(--eye-size-control-md)'],
      ['DEN-03', 'Inspection', 28, [28, 32], 'var(--eye-size-control-sm)']]);
    for (const d of DENSITIES) expect(d.controlPx).toBeGreaterThanOrEqual(d.rowPx[0] - 12);
  });
  it('role defaults: executive / decision / briefing roles strategic; analytical and administrative work operational', () => {
    expect(roleDefaultDensity(['decision_authority', 'decision_owner']).density).toBe('DEN-01');
    expect(roleDefaultDensity(['executive']).why).toMatch(/strategic by default for the executive role/);
    expect(roleDefaultDensity(['domain_analyst']).density).toBe('DEN-02');
    expect(roleDefaultDensity([]).density).toBe('DEN-02');
  });
  it('the order: the person\'s choice for this view → their general choice → the composition kind → the role', () => {
    expect(effectiveDensity({ savedComposition: 'DEN-03', savedDefault: 'DEN-01', roles: ['executive'] })).toEqual({ density: 'DEN-03', source: 'saved_composition', note: 'your saved choice for this view' });
    expect(effectiveDensity({ savedDefault: 'DEN-02', kind: 'operations_room', roles: ['executive'] })).toMatchObject({ density: 'DEN-02', source: 'saved_default' });
    expect(effectiveDensity({ kind: 'operations_room', roles: ['executive'] })).toEqual({ density: 'DEN-03', source: 'composition', note: 'the default for a operations room' });
    expect(effectiveDensity({ kind: 'table', roles: ['domain_analyst'] }).density).toBe('DEN-03');
    expect(effectiveDensity({ kind: 'briefing', roles: ['domain_analyst'] }).density).toBe('DEN-01');
    expect(effectiveDensity({ kind: 'page', roles: ['board_member'] })).toMatchObject({ density: 'DEN-01', source: 'role' });
    expect(effectiveDensity({ savedDefault: null, roles: ['domain_admin'] })).toMatchObject({ density: 'DEN-02', source: 'role' });
  });
  it('a TOUCH or compact context is strategic whatever was chosen — and says what it kept for wider screens', () => {
    expect(effectiveDensity({ savedDefault: 'DEN-03', roles: ['domain_analyst'], pointer: 'coarse' })).toEqual({ density: 'DEN-01', source: 'touch',
      note: 'strategic on a touch or compact screen — inspection is kept for wider screens (targets stay 44 px)' });
    expect(effectiveDensity({ roles: ['executive'], cls: 'BP-01' })).toEqual({ density: 'DEN-01', source: 'touch', note: 'strategic on a touch or compact screen' });
  });
  it('LAY-003: a consequential control is 44 px at EVERY density; an ordinary one follows the density', () => {
    for (const d of DENSITIES) {
      expect(controlSizeFor(d.key, 'C2')).toBe('var(--eye-size-control-consequential)');
      expect(controlSizeFor(d.key, 'C4')).toBe('var(--eye-size-control-consequential)');
      expect(controlSizeFor(d.key, 'C1')).toBe(d.controlVar);
    }
  });
});

describe('REG-01…08 — regions, priority and reflow (UX-14-003/004/005, UX-ADR-013, UX-19-003)', () => {
  it('the seven regions, their rows, and the ONE deferrable region (the inspector)', () => {
    expect(READING_ORDER).toEqual(['context', 'status', 'authority', 'primary', 'action', 'evidence', 'inspector']);
    expect(READING_ORDER.map((k) => REGIONS[k].row)).toEqual(['REG-01', 'REG-07', 'REG-08', 'REG-03', 'REG-06', 'REG-04', 'REG-05']);
    expect(PROTECTED_REGIONS).toEqual(['context', 'status', 'authority', 'primary', 'action', 'evidence']);
  });
  it('at EVERY size nothing protected is hidden, and the reading / focus order is the same (reflow never reorders)', () => {
    for (const cls of [null, ...CLASSES] as Array<LayoutClass | null>) {
      for (const selection of [null, SEL]) {
        const plan = composeRegions({ cls, present: ALL, selection });
        expect(hiddenProtected(plan, ALL), `${cls}`).toEqual([]);
        expect(plan.focusOrder).toEqual(READING_ORDER);
        expect(plan.problems).toEqual([]);
      }
    }
  });
  it('BP-01: one column; the inspector behind a NAMED opener carrying its selection and version; the action right after the task (near the object)', () => {
    const p = composeRegions({ cls: 'BP-01', present: ALL, selection: SEL });
    expect(p.columns).toBe(1);
    expect(p.regions.every((r) => r.column[0] === 1 && r.column[1] === 1)).toBe(true);
    expect(p.deferred).toEqual([{ region: 'inspector', label: 'Inspector', summary: 'Bab el-Mandeb corridor reroute (SYNTHETIC) selected · version 2',
      opener: 'Open the inspector — Bab el-Mandeb corridor reroute (SYNTHETIC) selected · version 2', open: 'modal' }]);
    expect(p.focusOrder.indexOf('action')).toBe(p.focusOrder.indexOf('primary') + 1);
    expect(placementOf(p, 'evidence')!.placement).toBe('main');   // evidence is never deferred (UX-ADR-013)
  });
  it('BP-02: one primary canvas; supporting detail (the inspector) in a modal; evidence inline under the task', () => {
    const p = composeRegions({ cls: 'BP-02', present: ALL, selection: null });
    expect(p.deferred.map((d) => [d.region, d.open, d.summary])).toEqual([['inspector', 'modal', 'nothing selected']]);
    expect(placementOf(p, 'evidence')!.placement).toBe('main');
  });
  it('BP-03 / BP-04: the 12-column grid with ONE supporting panel (span 4) beside the primary task (span 8) — the inspector when something is selected', () => {
    for (const cls of ['BP-03', 'BP-04'] as const) {
      const sel = composeRegions({ cls, present: ALL, selection: SEL });
      expect(sel.panel).toBe('inspector');
      expect(placementOf(sel, 'inspector')).toMatchObject({ placement: 'panel', column: [9, 4] });
      expect(placementOf(sel, 'evidence')).toMatchObject({ placement: 'main', column: [1, 8] });
      expect(sel.deferred).toEqual([]);
      const none = composeRegions({ cls, present: ALL, selection: null });
      expect(none.panel).toBe('evidence');
      expect(placementOf(none, 'evidence')).toMatchObject({ placement: 'panel', column: [9, 4] });
      expect(none.deferred.map((d) => [d.region, d.open])).toEqual([['inspector', 'drawer']]);
      // the panel spans the main column's rows (primary, action, the deferred opener) beside it
      expect(placementOf(none, 'evidence')!.row).toEqual([placementOf(none, 'primary')!.row[0], 3]);
    }
    expect(placementOf(composeRegions({ cls: 'BP-03', present: ['primary', 'evidence'] }), 'primary')!.column).toEqual([1, 8]);
    expect(placementOf(composeRegions({ cls: 'BP-03', present: ['primary'] }), 'primary')!.column).toEqual([1, 12]);
  });
  it('BP-04: the person\'s saved panel choice wins (evidence even with a selection); BP-05 shows evidence AND inspector beside the task', () => {
    const p = composeRegions({ cls: 'BP-04', present: ALL, selection: SEL, prefs: { panel: 'evidence' } });
    expect(p.panel).toBe('evidence');
    expect(p.deferred.map((d) => d.region)).toEqual(['inspector']);
    const c = composeRegions({ cls: 'BP-05', present: ALL, selection: SEL });
    expect(c.deferred).toEqual([]);
    expect(['primary', 'evidence', 'inspector'].map((r) => placementOf(c, r as RegionKey)!.column)).toEqual([[1, 6], [7, 3], [10, 3]]);
    expect(placementOf(composeRegions({ cls: 'BP-05', present: ['primary', 'evidence'] }), 'evidence')!.column).toEqual([9, 4]);
  });
  it('a collapsed inspector (the person\'s choice) is deferred at every size, named — never anything else', () => {
    for (const cls of CLASSES) {
      const p = composeRegions({ cls, present: ALL, selection: SEL, prefs: { inspectorCollapsed: true } });
      expect(p.deferred.map((d) => d.region)).toEqual(['inspector']);
      expect(hiddenProtected(p, ALL)).toEqual([]);
    }
  });
  it('REFUSAL: one primary task region per composition; a consequential gate names its authority and has its action region', () => {
    expect(compositionProblems({ present: ['primary', 'primary'] })).toEqual(['a composition has ONE primary task region — this one declares 2 (REG-03)']);
    expect(compositionProblems({ present: ['evidence'] })).toEqual(['a composition has one primary task region (REG-03)']);
    expect(compositionProblems({ present: ['primary'], consequentialGate: true })).toEqual([
      'a consequential gate names its authority — eligibility, review, consequence and receipt (REG-08)', 'a consequential gate has an action region with the full digest (REG-06)']);
    expect(compositionProblems({ present: ['primary', 'authority', 'action'], consequentialGate: true })).toEqual([]);
    expect(composeRegions({ cls: 'BP-03', present: ['primary', 'primary', 'status', 'status'] }).problems).toHaveLength(2);
  });
  it('RECOVERY on reflow (resize / zoom / rotate): the selection is kept; the focus stays, or moves to the named opener of its deferred region', () => {
    const wide = composeRegions({ cls: 'BP-04', present: ALL, selection: SEL });
    const phone = composeRegions({ cls: 'BP-01', present: ALL, selection: SEL });
    const r = reflow(wide, phone, { focusRegion: 'inspector', selection: SEL });
    expect(r.focus).toEqual({ region: 'inspector', via: 'opener' });
    expect(r.selection).toBe(SEL);
    expect(r.announcement).toBe('Layout wide (BP-04) → compact (BP-01) · moved behind a named opener: inspector · Bab el-Mandeb corridor reroute (SYNTHETIC) selected · version 2');
    const back = reflow(phone, wide, { focusRegion: 'inspector', selection: SEL });
    expect(back.focus).toEqual({ region: 'inspector', via: 'region' });
    expect(back.announcement).toMatch(/shown again: inspector/);
    expect(reflow(wide, phone, { focusRegion: null, selection: null }).focus).toBeNull();
  });
});

describe('UX-14-002 — the saved layout and its reconciliation (versioned under the layout contract)', () => {
  it('a wide layout opened on a phone: the panel and the spans are not applied — each with its reason; the protected regions are never hidden', () => {
    const saved = { contract: LAYOUT_CONTRACT, layout: { viewport_class: 'BP-04' as const, panel: 'inspector' as const, rail: 'collapsed' as const, focus_region: 'primary' as const,
      regions: { primary: { span: 8 }, inspector: { state: 'collapsed' as const }, authority: { state: 'collapsed' as const } } } };
    const r = reconcileLayout(saved, 'BP-01');
    expect(r).toMatchObject({ panel: null, inspectorCollapsed: true, rail: 'expanded', focusRegion: 'primary', overflow: 'reflow' });
    expect(r.notes.map((n) => n.field)).toEqual(['panel', 'rail', 'regions.primary.span', 'regions.authority.state', 'viewport_class']);
    expect(r.notes.find((n) => n.field === 'regions.authority.state')!.why).toBe('the authority region is never hidden by a preference (UX-14-004)');
    expect(r.notes.find((n) => n.field === 'viewport_class')!.why).toBe('saved at wide; shown at compact — reflowed, the reading order kept');
  });
  it('at the standard size the rail collapses and the panel applies; on wide screens the rail is persistent (said, not ignored)', () => {
    const l = { contract: LAYOUT_CONTRACT, layout: { rail: 'collapsed' as const, panel: 'evidence' as const } };
    expect(reconcileLayout(l, 'BP-03')).toMatchObject({ rail: 'collapsed', panel: 'evidence', notes: [] });
    expect(reconcileLayout(l, 'BP-04').notes).toEqual([{ field: 'rail', saved: 'collapsed', applied: 'rail-persistent', why: 'the rail is persistent on wide screens' }]);
  });
  it('a layout saved under another contract is applied field by field and SAYS so; none saved = the defaults, no notes', () => {
    expect(reconcileLayout({ contract: 'b81-lyg-layout-0', layout: {} }, 'BP-03').notes).toEqual([{ field: 'contract', saved: 'b81-lyg-layout-0', applied: LAYOUT_CONTRACT,
      why: 'saved under b81-lyg-layout-0; read under b81-lyg-layout-1 — applied field by field, an unknown field ignored' }]);
    expect(reconcileLayout(null, 'BP-03')).toEqual({ panel: null, inspectorCollapsed: false, rail: 'expanded', focusRegion: null, overflow: 'reflow', notes: [] });
  });
  it('what is saved is exactly what the port admits (12 columns, the inspector the only collapsed region, never a clipping overflow)', () => {
    expect(layoutToSave({ cls: 'BP-03', panel: 'evidence', inspectorCollapsed: true, rail: 'collapsed', focusRegion: 'primary' })).toEqual({
      viewport_class: 'BP-03', grid: { columns: 12 }, regions: { inspector: { state: 'collapsed' } }, panel: 'evidence', rail: 'collapsed', focus_region: 'primary', overflow: 'reflow' });
    expect(layoutToSave({ cls: null, panel: null, inspectorCollapsed: false, rail: 'expanded', focusRegion: null })).toEqual({ grid: { columns: 12 }, panel: null, rail: 'expanded', focus_region: null, overflow: 'reflow' });
  });
  it('UX-19-002: the layout spec is versioned — its digest is pinned with the contract string (a changed spec moves both)', async () => {
    expect(LAYOUT_CONTRACT).toBe('b81-lyg-layout-1');
    expect(await layoutSpecDigest()).toMatch(/^[0-9a-f]{64}$/);
    expect(await layoutSpecDigest()).toBe(SPEC_DIGEST);
  });
});

describe('BP-01 — the bottom navigation (the current place never lost; the rail\'s names)', () => {
  const nav = (n: number): NavItem[] => Array.from({ length: n }, (_, i) => ({ href: `/observation/p${i}`, label: `Place ${i}`, glyph: '◆' }));
  it('every place when they fit; otherwise four + More, the CURRENT place always among the four, the rest in the rail\'s order', () => {
    expect(bottomNavOf(nav(4), '/observation/p3')).toEqual({ primary: nav(4), more: [] });
    const r = bottomNavOf(nav(8), '/observation/p6');
    expect(r.primary.map((x) => x.href)).toEqual(['/observation/p0', '/observation/p1', '/observation/p2', '/observation/p6']);
    expect(r.more.map((x) => x.href)).toEqual(['/observation/p3', '/observation/p4', '/observation/p5', '/observation/p7']);
    expect(bottomNavOf(nav(8), '/observation/p1').primary.map((x) => x.href)).toEqual(['/observation/p0', '/observation/p1', '/observation/p2', '/observation/p3']);
    expect(bottomNavOf(nav(8), null).more).toHaveLength(4);
    const all = bottomNavOf(nav(9), '/observation/p8');
    expect([...all.primary, ...all.more].map((x) => x.href).sort()).toEqual(nav(9).map((x) => x.href).sort());
  });
});

describe('UX-19-001…005 — surfaces: the nearest approved pattern, one scroll owner, elevation never carries meaning', () => {
  it('nested layers fall back to the nearest approved pattern, with the reason; a plain request stands', () => {
    expect(nearestSurface('dialog', { inside: ['dialog'], cls: 'BP-04' })).toEqual({ kind: 'disclosure', reason: 'one blocking dialog at a time — the detail opens in place inside it' });
    expect(nearestSurface('drawer', { inside: ['dialog'], cls: 'BP-04' }).kind).toBe('disclosure');
    expect(nearestSurface('popover', { inside: ['popover'], cls: 'BP-04' }).kind).toBe('disclosure');
    expect(nearestSurface('drawer', { inside: ['page'], cls: 'BP-01' }).kind).toBe('dialog');
    expect(nearestSurface('popover', { inside: ['page'], cls: 'BP-04', zoom: 2 }).kind).toBe('disclosure');
    expect(nearestSurface('drawer', { inside: ['page'], cls: 'BP-04' })).toEqual({ kind: 'drawer', reason: null });
  });
  it('one scroll owner per region: the page on one-column sizes, each column on the grid sizes', () => {
    expect([null, ...CLASSES].map((c) => scrollOwnerOf(c as LayoutClass | null))).toEqual(['page', 'page', 'page', 'columns', 'columns', 'columns']);
  });
  it('THE ELEVATION LINT finds a shadow on a state / approval / authority surface — and the real stylesheet has none', () => {
    const fixture = '.eye-ok { box-shadow: var(--eye-elevation-2); }\n.eye-truth-badge { box-shadow: 0 1px 2px x; }\n@media print { .eye-region--authority { box-shadow: var(--eye-elevation-1); } }\n.eye-status { box-shadow: none; }\n/* .eye-approval { box-shadow: 1px } */\n';
    expect(elevationFindings(fixture).map((f) => [f.line, f.selector])).toEqual([[2, '.eye-truth-badge'], [3, '.eye-region--authority']]);
    const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');
    expect(elevationFindings(css)).toEqual([]);
  });
});

describe('REG-07 — one status vocabulary (queued, accepted, completed, failed told apart; nothing optimistic)', () => {
  it('no answer is not success; the server\'s state decides the phase', () => {
    expect(taskPhaseOf({ answered: false })).toEqual({ phase: 'sending', words: TASK_PHASE_WORDS.sending });
    expect(taskPhaseOf({ answered: true, ok: true, httpStatus: 202 }).phase).toBe('queued');
    expect(taskPhaseOf({ answered: true, ok: true, state: 'running' }).phase).toBe('accepted');
    expect(taskPhaseOf({ answered: true, ok: true, state: 'completed' }).phase).toBe('completed');
    expect(taskPhaseOf({ answered: true, ok: true, state: 'cancelled' }).phase).toBe('failed');
    expect(taskPhaseOf({ answered: true, ok: false, httpStatus: 409 }).phase).toBe('failed');
  });
});

describe('CMP-005…008 / REG-03 — the primitives\' gaps, and one primary task (one h1) per page — a RATCHET over the real pages', () => {
  it('the approved gaps are space tokens', () => {
    expect([4, 8, 12, 16, 24, 32].every(isGap)).toBe(true);
    expect(isGap(10)).toBe(false);
  });
  /** Pages whose source carries more than one <h1> literal today (each renders one per branch — a gate, a loading state, the ready page;
   *  the walk asserts one h1 at run time). The list may only SHRINK: a page added with two h1 literals fails here. */
  const PRE_B81_MULTI_H1 = [
    'app/decisions/board/page.tsx', 'app/decisions/packages/new/page.tsx', 'app/home/page.tsx', 'app/observation/evidence/[evdId]/page.tsx',
    'app/observation/sources/[sourceId]/page.tsx', 'app/observation/sources/new/page.tsx', 'app/prediction/scenarios/anatomy/page.tsx',
  ];
  it('no page beyond the listed ones declares more than one h1', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : n === 'page.tsx' ? [p] : []; });
    const multi = walk(join(WEB, 'app')).filter((p) => (readFileSync(p, 'utf8').match(/<h1\b/g) ?? []).length > 1).map((p) => relative(WEB, p).split('\\').join('/')).sort();
    expect(multi.filter((p) => !PRE_B81_MULTI_H1.includes(p))).toEqual([]);
    expect(multi.length).toBeLessThanOrEqual(PRE_B81_MULTI_H1.length);
  });
});
