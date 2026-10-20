/**
 * CP-6 B81 §LY-G — THE LAYOUT CONTRACT as pure functions (F-P7-E-04: UX-14-001…005, UX-19-001…005, CMP-005…008, BP-01…04, DEN-01…03,
 * REG-01…08, UX-ADR-013, REL-15, GLB-23). The web has no DOM test environment and B81 adds no dependency: components/layout.tsx renders
 * exactly what these decide, and the walk proves the rendering.
 *
 *   THE BREAKPOINTS   BP-01 compact 0–639 (one column, bottom navigation) · BP-02 narrow 640–959 (one primary canvas, supporting detail in a
 *                     modal) · BP-03 standard 960–1439 (collapsible rail, the 12-column grid, ONE supporting panel) · BP-04 wide 1440–1919
 *                     (persistent rail, primary + evidence or inspector) · BP-05 command ≥ 1920 (multi-region — the synchronized views and
 *                     the explicit control surface are §LY-M's). A composition lays out in its EFFECTIVE width (the viewport over the
 *                     zoom and the text scale): 200 % zoom at 1440 px is 720 px — BP-02; when the primary measure would fall below its
 *                     minimum (text expansion, localization, assistive text size) it steps DOWN to the next approved composition (UX-14-005).
 *   THE DENSITIES     DEN-01 strategic (44 px controls, 40–48 px rows — executive, decision, briefing and touch) · DEN-02 operational
 *                     (36 px; 32–36 px rows — analytical and administrative work, today's rendering) · DEN-03 inspection (28–32 px —
 *                     tables, traces, operations rooms). The person's saved choice wins, then the composition's, then the role's; a touch
 *                     context is strategic whatever was chosen. A CONSEQUENTIAL control is 44 px at every density (LAY-003).
 *   THE REGIONS       context · status · authority · primary · action · evidence · inspector — ONE reading order at every size (reflow
 *                     never reorders); context, status, authority, primary, action and evidence are NEVER deferred; only the inspector
 *                     (secondary detail) moves behind a NAMED opener that keeps its selection and version explicit (UX-14-004, UX-ADR-013).
 *   THE SURFACES      elevation never carries meaning (a state, approval or authority surface takes no shadow — the lint below); nested
 *                     layers fall back to the nearest approved pattern; one scroll owner per region (UX-19-003…005).
 *   THE PREFERENCES   the person's own density and saved layout per composition (0119 §LY — shell.preferences), RECONCILED when the
 *                     contract or the size it was saved at differs: what was applied, what was not, and why — never a silent guess.
 *
 * PRESENTATION NEVER CHANGES MEANING: nothing here decides who may act, what an act does or what a record says. THREE CLAIMS: construction
 * (this module, components/layout.tsx, the 0119 §LY-G port and its harness); demonstrated operation (the act — SYNTHETIC personas); real
 * acceptance (UX-14-006, UX-19-006 → the shared non-demonstration recording path at B111, then H3) — never claimed.
 */
import { call, type ApiResult } from './api';
import { contentDigest } from './jcs';
import type { NavItem, ShellScope } from './b80-seams';
import type { Density, LayoutClass, RegionKey } from './b81-seams';

/** The layout contract every saved layout is validated under (0119 §LY.0 shell.layout_contract_version() — the same string). */
export const LAYOUT_CONTRACT = 'b81-lyg-layout-1';

/* ═════════════════════════════ THE BREAKPOINTS (BP-01…05) ═════════════════════════════ */
export type NavigationMode = 'bottom' | 'rail-glyphs' | 'rail-collapsible' | 'rail-persistent';
export type SupportingMode = 'stacked' | 'modal' | 'one-panel' | 'evidence-or-inspector' | 'multi-region';
export interface Breakpoint { key: LayoutClass; name: string; min: number; max: number | null; columns: 1 | 12; navigation: NavigationMode; supporting: SupportingMode; clause: string }
export const BREAKPOINTS: readonly Breakpoint[] = [
  { key: 'BP-01', name: 'Compact', min: 0, max: 639, columns: 1, navigation: 'bottom', supporting: 'stacked', clause: 'Single-column task flow; bottom navigation; no hidden authority or state' },
  { key: 'BP-02', name: 'Narrow', min: 640, max: 959, columns: 1, navigation: 'rail-glyphs', supporting: 'modal', clause: 'Single primary canvas with optional modal supporting detail' },
  { key: 'BP-03', name: 'Standard', min: 960, max: 1439, columns: 12, navigation: 'rail-collapsible', supporting: 'one-panel', clause: 'Collapsible rail; 12-column grid; one supporting panel' },
  { key: 'BP-04', name: 'Wide', min: 1440, max: 1919, columns: 12, navigation: 'rail-persistent', supporting: 'evidence-or-inspector', clause: 'Persistent rail; primary canvas plus evidence or inspector panel' },
  { key: 'BP-05', name: 'Command', min: 1920, max: null, columns: 12, navigation: 'rail-persistent', supporting: 'multi-region', clause: 'Multi-region synchronized views with explicit control surface' },
];
const CLASS_ORDER: readonly LayoutClass[] = BREAKPOINTS.map((b) => b.key);
export const breakpointOf = (cls: LayoutClass): Breakpoint => BREAKPOINTS.find((b) => b.key === cls)!;
/** The media query of a class (what globals.css and useLayoutClass use — one source). */
export function mediaQueryOf(cls: LayoutClass): string {
  const b = breakpointOf(cls);
  return b.max === null ? `(min-width: ${b.min}px)` : b.min === 0 ? `(max-width: ${b.max}px)` : `(min-width: ${b.min}px) and (max-width: ${b.max}px)`;
}

/** The class of a width in CSS pixels (the browser's own width already accounts for zoom; a model of a device passes its zoom below). */
export function layoutClassOf(widthCssPx: number): LayoutClass {
  const w = Number.isFinite(widthCssPx) && widthCssPx > 0 ? Math.floor(widthCssPx) : 0;
  for (let i = BREAKPOINTS.length - 1; i >= 0; i -= 1) if (w >= BREAKPOINTS[i]!.min) return BREAKPOINTS[i]!.key;
  return 'BP-01';
}
/** The width a composition lays out in: the device viewport over the page zoom (200 % zoom halves it). */
export function effectiveWidth(a: { viewportPx: number; zoom?: number }): number {
  const z = a.zoom !== undefined && a.zoom > 0 ? a.zoom : 1;
  return Math.floor(a.viewportPx / z);
}
/** The navigation's footprint at a class (an approximation for the measure check, not a pixel contract). */
export const RAIL_PX: Readonly<Record<NavigationMode, number>> = { bottom: 0, 'rail-glyphs': 56, 'rail-collapsible': 208, 'rail-persistent': 208 };
/** The narrowest primary measure a composition admits at text scale 1 (≈ 30rem of body text). */
export const PRIMARY_MIN_PX = 480;
/** The primary column's share of the grid at a class (12-column classes; a one-column class gives it all). */
export const PRIMARY_SPAN: Readonly<Record<LayoutClass, number>> = { 'BP-01': 12, 'BP-02': 12, 'BP-03': 8, 'BP-04': 8, 'BP-05': 6 };

export interface CompositionChoice { cls: LayoutClass; effectivePx: number; steppedFrom: LayoutClass | null; reason: string | null }
/**
 * UX-14-005 — THE COMPOSITION THE SPACE ADMITS: the class of the effective width, stepped down while the primary measure (its columns, less
 * the navigation and the gutters) would fall below the minimum the text needs (text scale × the locale's expansion). Never a clipped control:
 * the next approved composition, named.
 */
export function compositionFor(a: { viewportPx: number; zoom?: number; textScale?: number; expansion?: number; railCollapsed?: boolean }): CompositionChoice {
  const effectivePx = effectiveWidth(a);
  const first = layoutClassOf(effectivePx);
  const need = PRIMARY_MIN_PX * (a.textScale ?? 1) * (a.expansion ?? 1);
  let i = CLASS_ORDER.indexOf(first);
  const measure = (cls: LayoutClass) => {
    const b = breakpointOf(cls);
    const rail = b.navigation === 'rail-collapsible' && a.railCollapsed === true ? RAIL_PX['rail-glyphs'] : RAIL_PX[b.navigation];
    return ((effectivePx - rail - 48) * PRIMARY_SPAN[cls]) / 12;
  };
  while (i > 0 && measure(CLASS_ORDER[i]!) < need) i -= 1;
  const cls = CLASS_ORDER[i]!;
  return cls === first
    ? { cls, effectivePx, steppedFrom: null, reason: null }
    : { cls, effectivePx, steppedFrom: first, reason: `the primary task needs ${Math.ceil(need)} px at this text size; ${breakpointOf(first).name.toLowerCase()} would give it ${Math.floor(measure(first))} px — laid out as ${breakpointOf(cls).name.toLowerCase()} (${cls}) instead` };
}

/* ═════════════════════════════ THE DENSITIES (DEN-01…03) ═════════════════════════════ */
export interface DensitySpec { key: Density; name: 'Strategic' | 'Operational' | 'Inspection'; controlPx: number; rowPx: readonly [number, number]; controlVar: string; contexts: string }
export const DENSITIES: readonly DensitySpec[] = [
  { key: 'DEN-01', name: 'Strategic', controlPx: 44, rowPx: [40, 48], controlVar: 'var(--eye-size-control-lg)', contexts: 'executive, decision, briefing and touch contexts' },
  { key: 'DEN-02', name: 'Operational', controlPx: 36, rowPx: [32, 36], controlVar: 'var(--eye-size-control-md)', contexts: 'analytical and administrative work' },
  { key: 'DEN-03', name: 'Inspection', controlPx: 28, rowPx: [28, 32], controlVar: 'var(--eye-size-control-sm)', contexts: 'high-density tables, traces and operations rooms' },
];
export const densityOf = (d: Density): DensitySpec => DENSITIES.find((x) => x.key === d)!;
export const isDensity = (v: unknown): v is Density => v === 'DEN-01' || v === 'DEN-02' || v === 'DEN-03';
/** The roles whose work is executive, decision or briefing (DEN-01 by default). Descriptive only — a density grants nothing. */
export const STRATEGIC_ROLES: readonly string[] = ['executive', 'executive_operator', 'board_member', 'decision_owner', 'decision_approver', 'decision_authority',
  'strategy_owner', 'opportunity_sponsor', 'customer_sponsor'];
export type CompositionKind = 'page' | 'briefing' | 'table' | 'trace' | 'operations_room';
export const COMPOSITION_DENSITY: Readonly<Record<CompositionKind, Density | null>> = { page: null, briefing: 'DEN-01', table: 'DEN-03', trace: 'DEN-03', operations_room: 'DEN-03' };

export function roleDefaultDensity(roles: readonly string[]): { density: Density; why: string } {
  const s = roles.find((r) => STRATEGIC_ROLES.includes(r));
  return s !== undefined
    ? { density: 'DEN-01', why: `strategic by default for the ${s.replace(/_/g, ' ')} role (executive, decision and briefing work)` }
    : { density: 'DEN-02', why: 'operational by default (analytical and administrative work)' };
}
export type DensitySource = 'touch' | 'saved_composition' | 'saved_default' | 'composition' | 'role';
export interface EffectiveDensity { density: Density; source: DensitySource; note: string }
/**
 * THE DENSITY IN FORCE: the person's saved choice for this composition, else their general choice, else the composition's kind (a briefing
 * is strategic; a table, a trace or an operations room is inspection), else the role default. A TOUCH context (a coarse pointer, or the
 * compact class) is strategic whatever was chosen — its targets stay 44 px — and says so.
 */
export function effectiveDensity(a: { savedComposition?: Density | null; savedDefault?: Density | null; kind?: CompositionKind; roles: readonly string[]; pointer?: 'fine' | 'coarse'; cls?: LayoutClass | null }): EffectiveDensity {
  const chosen: { density: Density; source: DensitySource; note: string } | null =
    isDensity(a.savedComposition) ? { density: a.savedComposition, source: 'saved_composition', note: 'your saved choice for this view' }
    : isDensity(a.savedDefault) ? { density: a.savedDefault, source: 'saved_default', note: 'your saved choice' }
    : a.kind !== undefined && COMPOSITION_DENSITY[a.kind] !== null ? { density: COMPOSITION_DENSITY[a.kind]!, source: 'composition', note: `the default for a ${a.kind.replace(/_/g, ' ')}` }
    : null;
  if (a.pointer === 'coarse' || a.cls === 'BP-01') {
    const was = chosen ?? { density: roleDefaultDensity(a.roles).density };
    return { density: 'DEN-01', source: 'touch', note: was.density === 'DEN-01' ? 'strategic on a touch or compact screen' : `strategic on a touch or compact screen — ${densityOf(was.density).name.toLowerCase()} is kept for wider screens (targets stay 44 px)` };
  }
  if (chosen !== null) return chosen;
  const r = roleDefaultDensity(a.roles);
  return { density: r.density, source: 'role', note: r.why };
}
/** LAY-003: a control's height — the density's for an ordinary control; 44 px for a consequential one (C2 and above) at EVERY density. */
export function controlSizeFor(density: Density, consequence: 'C0' | 'C1' | 'C2' | 'C3' | 'C4'): string {
  return consequence === 'C0' || consequence === 'C1' ? densityOf(density).controlVar : 'var(--eye-size-control-consequential)';
}

/* ═════════════════════════════ THE REGIONS (REG-01…08) ═════════════════════════════ */
export interface RegionSpec { key: RegionKey; row: string; label: string; deferrable: boolean; rule: string }
export const REGIONS: Readonly<Record<RegionKey, RegionSpec>> = {
  context:   { key: 'context', row: 'REG-01', label: 'Context', deferrable: false, rule: 'persistent above or before work; may collapse to an explicit switcher, never disappears' },
  status:    { key: 'status', row: 'REG-07', label: 'Status', deferrable: false, rule: 'persistent product and task feedback; queued, accepted, completed and failed told apart' },
  authority: { key: 'authority', row: 'REG-08', label: 'Authority', deferrable: false, rule: 'at every consequential gate: eligibility, review, consequence and receipt named' },
  primary:   { key: 'primary', row: 'REG-03', label: 'Primary task', deferrable: false, rule: 'the largest and first semantic work region; one task owner per composition' },
  action:    { key: 'action', row: 'REG-06', label: 'Actions', deferrable: false, rule: 'near the affected object or in a fixed review region; a consequential act shows its full digest' },
  evidence:  { key: 'evidence', row: 'REG-04', label: 'Evidence', deferrable: false, rule: 'adjacent, linked or immediately resolvable; never buried behind unexplained decoration' },
  inspector: { key: 'inspector', row: 'REG-05', label: 'Inspector', deferrable: true, rule: 'the selected object\'s detail and state; selection and version stay explicit' },
};
/** ONE READING (and focus) ORDER at every size: reflow moves regions into columns, never reorders them (UX-14-003, UX-19-003). */
export const READING_ORDER: readonly RegionKey[] = ['context', 'status', 'authority', 'primary', 'action', 'evidence', 'inspector'];
export const PROTECTED_REGIONS: readonly RegionKey[] = READING_ORDER.filter((k) => !REGIONS[k].deferrable);
const BANDS: readonly RegionKey[] = ['context', 'status', 'authority'];

export type Placement = 'band' | 'main' | 'panel' | 'deferred';
export interface RegionPlacement {
  region: RegionKey; placement: Placement;
  /** CSS grid lines (1-based start, span) — the one-column classes stack everything in column 1 */ column: readonly [number, number]; row: readonly [number, number];
}
export interface DeferredItem { region: RegionKey; label: string; summary: string; opener: string; open: 'drawer' | 'modal' }
export interface Selection { label: string; version: number | string | null }
export interface CompositionPlan {
  cls: LayoutClass | null; columns: 1 | 12; panel: 'evidence' | 'inspector' | null;
  regions: RegionPlacement[]; deferred: DeferredItem[]; focusOrder: RegionKey[]; problems: string[];
}
export interface ComposeInput {
  /** null before the browser has measured (the server render): everything stacked, nothing deferred */ cls: LayoutClass | null;
  present: readonly RegionKey[];
  selection?: Selection | null;
  /** the person's saved panel choice and inspector state (reconciled) */ prefs?: { panel?: 'evidence' | 'inspector' | null; inspectorCollapsed?: boolean };
  /** the composition carries a consequential gate (REG-08: it must name its authority) */ consequentialGate?: boolean;
}

/** What a composition must satisfy whatever the size (REG-03, REG-06, REG-08). */
export function compositionProblems(a: { present: readonly RegionKey[]; consequentialGate?: boolean }): string[] {
  const out: string[] = [];
  const primaries = a.present.filter((r) => r === 'primary').length;
  if (primaries === 0) out.push('a composition has one primary task region (REG-03)');
  if (primaries > 1) out.push(`a composition has ONE primary task region — this one declares ${primaries} (REG-03)`);
  for (const k of READING_ORDER) if (k !== 'primary' && a.present.filter((r) => r === k).length > 1) out.push(`the ${REGIONS[k].label.toLowerCase()} region is declared more than once`);
  if (a.consequentialGate === true && !a.present.includes('authority')) out.push('a consequential gate names its authority — eligibility, review, consequence and receipt (REG-08)');
  if (a.consequentialGate === true && !a.present.includes('action')) out.push('a consequential gate has an action region with the full digest (REG-06)');
  return out;
}

const selectionWords = (s: Selection | null | undefined) =>
  s === null || s === undefined ? 'nothing selected' : `${s.label} selected${s.version === null || s.version === undefined ? ' (version not stated)' : ` · version ${s.version}`}`;

/**
 * COMPOSE the regions for a class: the bands (context, status, authority) across the grid; the primary task and its action region in the
 * main column; the ONE supporting panel at the inline end on the standard and wide classes (the person's choice, else the inspector when
 * something is selected, else the evidence) — the evidence that is not the panel stays INLINE under the primary task (never deferred); the
 * inspector that is not the panel is DEFERRED behind a named opener carrying its selection and version. The command class shows both.
 */
export function composeRegions(a: ComposeInput): CompositionPlan {
  const present = READING_ORDER.filter((k) => a.present.includes(k));
  const problems = compositionProblems(a);
  const has = (k: RegionKey) => present.includes(k);
  const cls = a.cls;
  const columns: 1 | 12 = cls === null ? 1 : breakpointOf(cls).columns;
  const collapsed = a.prefs?.inspectorCollapsed === true;
  // which supporting region gets the panel (12-column classes)
  let panel: 'evidence' | 'inspector' | null = null;
  if (columns === 12 && cls !== 'BP-05') {
    const want = a.prefs?.panel ?? (a.selection !== null && a.selection !== undefined ? 'inspector' : 'evidence');
    const candidates = (['evidence', 'inspector'] as const).filter((k) => has(k) && !(k === 'inspector' && collapsed));
    panel = candidates.includes(want as 'evidence' | 'inspector') ? want as 'evidence' | 'inspector' : (candidates[0] ?? null);
  }
  const deferInspector = has('inspector') && cls !== null && (collapsed || (columns === 1 && cls !== null) || (columns === 12 && cls !== 'BP-05' && panel !== 'inspector'));
  const regions: RegionPlacement[] = [];
  const deferred: DeferredItem[] = [];
  let row = 1;
  for (const k of present) {
    if (BANDS.includes(k)) { regions.push({ region: k, placement: 'band', column: [1, columns], row: [row, 1] }); row += 1; }
  }
  const mainStart = row;
  const side5 = cls === 'BP-05' ? (['evidence', 'inspector'] as const).filter((k) => has(k) && !(k === 'inspector' && deferInspector)) : [];
  const mainSpan = columns === 1 ? 1 : cls === 'BP-05' ? (side5.length === 2 ? 6 : side5.length === 1 ? 8 : 12) : (panel !== null ? 8 : 12);
  const mainCol: readonly [number, number] = [1, mainSpan];
  for (const k of ['primary', 'action', 'evidence', 'inspector'] as const) {
    if (!has(k)) continue;
    if (k === 'inspector' && deferInspector) {
      regions.push({ region: k, placement: 'deferred', column: mainCol, row: [row, 1] }); row += 1;
      deferred.push({ region: k, label: REGIONS[k].label, summary: selectionWords(a.selection), opener: `Open the inspector — ${selectionWords(a.selection)}`, open: columns === 1 ? 'modal' : 'drawer' });
      continue;
    }
    if (k === panel || (cls === 'BP-05' && (k === 'evidence' || k === 'inspector'))) continue;   // placed beside the main column below
    regions.push({ region: k, placement: 'main', column: mainCol, row: [row, 1] }); row += 1;   // the action region right after the task: near the object (REG-06)
  }
  const mainRows = Math.max(1, row - mainStart);
  if (panel !== null) regions.push({ region: panel, placement: 'panel', column: [mainSpan + 1, 12 - mainSpan], row: [mainStart, mainRows] });
  if (cls === 'BP-05') {
    let col = mainSpan + 1;
    for (const k of side5) {
      const span = side5.length === 1 ? 12 - mainSpan : 3;
      regions.push({ region: k, placement: 'panel', column: [col, span], row: [mainStart, mainRows] }); col += span;
    }
  }
  // DOM order is the reading order (a deferred region keeps its place as its opener)
  regions.sort((x, y) => READING_ORDER.indexOf(x.region) - READING_ORDER.indexOf(y.region));
  return { cls, columns, panel, regions, deferred, focusOrder: regions.map((r) => r.region), problems };
}

/** UX-14-004 / UX-ADR-013: what a plan hides that it never may (empty = nothing protected is hidden). */
export function hiddenProtected(plan: CompositionPlan, present: readonly RegionKey[]): RegionKey[] {
  return PROTECTED_REGIONS.filter((k) => present.includes(k) && !plan.regions.some((r) => r.region === k && r.placement !== 'deferred'));
}

export interface ReflowResult { focus: { region: RegionKey; via: 'region' | 'opener' } | null; selection: Selection | null; announcement: string }
/**
 * REFLOW (resize, zoom, rotation, a density change): the selection is KEPT as it was (the layout never changes it); the focus stays in its
 * region, or moves to the NAMED opener of the region it was in when that region is deferred; the change is announced in words.
 */
export function reflow(prev: CompositionPlan, next: CompositionPlan, kept: { focusRegion: RegionKey | null; selection: Selection | null }): ReflowResult {
  const name = (p: CompositionPlan) => (p.cls === null ? 'unmeasured' : `${breakpointOf(p.cls).name.toLowerCase()} (${p.cls})`);
  const nowDeferred = next.deferred.map((d) => d.region);
  const wasDeferred = prev.deferred.map((d) => d.region);
  const parts = [`Layout ${name(prev)} → ${name(next)}`];
  const newly = nowDeferred.filter((r) => !wasDeferred.includes(r));
  const back = wasDeferred.filter((r) => !nowDeferred.includes(r));
  if (newly.length > 0) parts.push(`moved behind a named opener: ${newly.map((r) => REGIONS[r].label.toLowerCase()).join(', ')}`);
  if (back.length > 0) parts.push(`shown again: ${back.map((r) => REGIONS[r].label.toLowerCase()).join(', ')}`);
  parts.push(selectionWords(kept.selection));
  let focus: ReflowResult['focus'] = null;
  if (kept.focusRegion !== null) focus = { region: kept.focusRegion, via: nowDeferred.includes(kept.focusRegion) ? 'opener' : 'region' };
  return { focus, selection: kept.selection, announcement: parts.join(' · ') };
}

/* ═════════════════════════════ THE SAVED LAYOUT AND ITS RECONCILIATION (UX-14-002) ═════════════════════════════ */
export interface SavedLayout {
  viewport_class?: LayoutClass; grid?: { columns: 12 };
  regions?: Partial<Record<RegionKey, { span?: number; state?: 'open' | 'collapsed' }>>;
  panel?: 'evidence' | 'inspector' | null; rail?: 'expanded' | 'collapsed'; focus_region?: RegionKey | null; overflow?: 'reflow' | 'scroll_region';
}
export interface ReconcileNote { field: string; saved: unknown; applied: unknown; why: string }
export interface Reconciled { panel: 'evidence' | 'inspector' | null; inspectorCollapsed: boolean; rail: 'expanded' | 'collapsed'; focusRegion: RegionKey | null; overflow: 'reflow' | 'scroll_region'; notes: ReconcileNote[] }
/**
 * RECONCILE a saved layout with the size and the contract in force now: each field applied or NOT, with the reason — a layout saved on a
 * wide screen opened on a phone, a rail that cannot collapse at this class, a hidden protected region (never honoured), a contract that
 * changed. Nothing is guessed silently.
 */
export function reconcileLayout(saved: { contract: string | null; layout: SavedLayout } | null, cls: LayoutClass | null): Reconciled {
  const out: Reconciled = { panel: null, inspectorCollapsed: false, rail: 'expanded', focusRegion: null, overflow: 'reflow', notes: [] };
  if (saved === null) return out;
  const l = saved.layout ?? {};
  if (saved.contract !== null && saved.contract !== LAYOUT_CONTRACT) {
    out.notes.push({ field: 'contract', saved: saved.contract, applied: LAYOUT_CONTRACT, why: `saved under ${saved.contract}; read under ${LAYOUT_CONTRACT} — applied field by field, an unknown field ignored` });
  }
  const b = cls === null ? null : breakpointOf(cls);
  if (l.panel !== undefined && l.panel !== null) {
    if (b !== null && b.columns === 12 && b.key !== 'BP-05') out.panel = l.panel;
    else out.notes.push({ field: 'panel', saved: l.panel, applied: null, why: b === null ? 'the size is not measured yet' : b.columns === 1 ? `${b.name.toLowerCase()} has no supporting panel — supporting detail opens in a modal` : 'the command composition shows evidence and inspector together' });
  }
  if (l.rail === 'collapsed') {
    if (b !== null && b.navigation === 'rail-collapsible') out.rail = 'collapsed';
    else out.notes.push({ field: 'rail', saved: 'collapsed', applied: b?.navigation ?? null, why: b === null ? 'the size is not measured yet' : b.navigation === 'rail-persistent' ? 'the rail is persistent on wide screens' : b.navigation === 'bottom' ? 'compact screens use the bottom navigation' : 'narrow screens show the rail as glyphs' });
  }
  for (const [k, v] of Object.entries(l.regions ?? {}) as Array<[RegionKey, { span?: number; state?: string }]>) {
    if (v?.state === 'collapsed') {
      if (REGIONS[k]?.deferrable === true) out.inspectorCollapsed = true;
      else out.notes.push({ field: `regions.${k}.state`, saved: 'collapsed', applied: 'open', why: `the ${k} region is never hidden by a preference (UX-14-004)` });
    }
    if (v?.span !== undefined && (b === null || b.columns === 1)) out.notes.push({ field: `regions.${k}.span`, saved: v.span, applied: 'full width', why: 'one-column sizes stack every region' });
  }
  if (l.focus_region !== undefined && l.focus_region !== null && READING_ORDER.includes(l.focus_region)) out.focusRegion = l.focus_region;
  if (l.overflow === 'scroll_region') out.overflow = 'scroll_region';
  if (l.viewport_class !== undefined && cls !== null && l.viewport_class !== cls) {
    out.notes.push({ field: 'viewport_class', saved: l.viewport_class, applied: cls, why: `saved at ${breakpointOf(l.viewport_class).name.toLowerCase()}; shown at ${breakpointOf(cls).name.toLowerCase()} — reflowed, the reading order kept` });
  }
  return out;
}
/** The layout a composition saves (what the person arranged, at the size they arranged it) — the port validates it key by key. */
export function layoutToSave(a: { cls: LayoutClass | null; panel: 'evidence' | 'inspector' | null; inspectorCollapsed: boolean; rail: 'expanded' | 'collapsed'; focusRegion: RegionKey | null }): SavedLayout {
  return {
    ...(a.cls !== null ? { viewport_class: a.cls } : {}), grid: { columns: 12 },
    ...(a.inspectorCollapsed ? { regions: { inspector: { state: 'collapsed' } } } : {}),
    panel: a.panel, rail: a.rail, focus_region: a.focusRegion, overflow: 'reflow',
  };
}

/* ═════════════════════════════ THE BOTTOM NAVIGATION (BP-01) ═════════════════════════════ */
/**
 * The compact navigation: every place when they fit (≤ max), else the first ones with the CURRENT place always among them (a person never
 * loses where they are), the rest under "More" in the rail's order. The same names as the rail (the hosted selectors), one aria-current.
 */
export function bottomNavOf(nav: readonly NavItem[], active: string | null, max = 5): { primary: NavItem[]; more: NavItem[] } {
  if (nav.length <= max) return { primary: [...nav], more: [] };
  let primary = nav.slice(0, max - 1);
  const act = active === null ? undefined : nav.find((n) => n.href === active);
  if (act !== undefined && !primary.includes(act)) primary = [...nav.slice(0, max - 2), act];
  return { primary, more: nav.filter((n) => !primary.includes(n)) };
}

/* ═════════════════════════════ THE SURFACES (UX-19-001…005) ═════════════════════════════ */
export type SurfaceKind = 'page' | 'panel' | 'drawer' | 'dialog' | 'popover' | 'disclosure';
/**
 * UX-19-005 — THE NEAREST APPROVED SURFACE: nested layers, overlays at a small size or a large zoom fall back to a pattern that keeps the
 * task position and the focus visible — never a second blocking dialog, never a drawer inside a dialog, never a popover inside a popover.
 */
export function nearestSurface(requested: SurfaceKind, ctx: { inside: readonly SurfaceKind[]; cls: LayoutClass | null; zoom?: number }): { kind: SurfaceKind; reason: string | null } {
  const inDialog = ctx.inside.includes('dialog'); const inPopover = ctx.inside.includes('popover'); const inDrawer = ctx.inside.includes('drawer');
  const small = ctx.cls === 'BP-01' || ctx.cls === 'BP-02' || (ctx.zoom ?? 1) >= 2;
  if (requested === 'dialog' && inDialog) return { kind: 'disclosure', reason: 'one blocking dialog at a time — the detail opens in place inside it' };
  if (requested === 'drawer' && (inDialog || inDrawer)) return { kind: 'disclosure', reason: 'a supporting layer inside a layer opens in place, so the focus and the task stay where they are' };
  if (requested === 'popover' && (inPopover || inDialog)) return { kind: 'disclosure', reason: 'a popover inside a layer would hide its own trigger — it opens in place' };
  if (requested === 'drawer' && small) return { kind: 'dialog', reason: 'a side drawer does not fit this size — it opens as a full-height dialog that returns focus where it opened' };
  if (requested === 'popover' && small) return { kind: 'disclosure', reason: 'a floating popover would cover the task at this size — it opens in place' };
  return { kind: requested, reason: null };
}
/** UX-19-003: who scrolls — one owner per region: the page on the one-column sizes; each column on the grid sizes (no nested scroll in a region). */
export function scrollOwnerOf(cls: LayoutClass | null): 'page' | 'columns' {
  return cls === null || breakpointOf(cls).columns === 1 ? 'page' : 'columns';
}

/** UX-19-004 — ELEVATION NEVER IMPLIES AUTHORITY, TRUTH, PRIORITY OR APPROVAL: a rule for a state / approval / authority surface carries no shadow. */
export const MEANING_SELECTOR = /truth|lifecycle|approv|authority|receipt|status|priority|severity|critical|certif|verified|consequen|badge|region--|-state\b|\[data-state/i;
export interface ElevationFinding { line: number; selector: string; declaration: string }
export function elevationFindings(css: string): ElevationFinding[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out: ElevationFinding[] = [];
  for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    if (selector.startsWith('@') || !MEANING_SELECTOR.test(selector)) continue;
    const line = code.slice(0, (m.index ?? 0) + (m[1]!.length - m[1]!.trimStart().length)).split('\n').length;
    for (const d of m[2]!.split(';')) {
      const decl = d.trim();
      if ((/^box-shadow\s*:/i.test(decl) && !/^box-shadow\s*:\s*none\s*$/i.test(decl)) || /var\(--eye-elevation/.test(decl)) out.push({ line, selector, declaration: decl });
    }
  }
  return out;
}

/* ═════════════════════════════ THE STATUS REGION (REG-07) ═════════════════════════════ */
export type TaskPhase = 'sending' | 'queued' | 'accepted' | 'completed' | 'failed';
export const TASK_PHASE_WORDS: Readonly<Record<TaskPhase, string>> = {
  sending: 'Sent — nothing is accepted until the server answers',
  queued: 'Queued by the server — not started yet',
  accepted: 'Accepted by the server — in progress, not complete',
  completed: 'Completed — the receipt is the record',
  failed: 'Failed — in the server\'s words below',
};
/** One status vocabulary for every task (queued, accepted, completed and failed told apart — never an optimistic "done"). */
export function taskPhaseOf(a: { answered: boolean; ok?: boolean; httpStatus?: number; state?: string | null }): { phase: TaskPhase; words: string } {
  const phase: TaskPhase = !a.answered ? 'sending' : a.ok === false ? 'failed'
    : a.httpStatus === 202 || ['queued', 'pending', 'scheduled', 'waiting'].includes(String(a.state ?? '').toLowerCase()) ? 'queued'
    : ['accepted', 'running', 'started', 'in_progress', 'processing'].includes(String(a.state ?? '').toLowerCase()) ? 'accepted'
    : ['failed', 'refused', 'rejected', 'cancelled', 'error'].includes(String(a.state ?? '').toLowerCase()) ? 'failed'
    : 'completed';
  return { phase, words: TASK_PHASE_WORDS[phase] };
}

/* ═════════════════════════════ THE CONTAINERS AND THE SPEC'S VERSION (CMP-005…008, UX-19-002) ═════════════════════════════ */
export type ContainerWidth = 'reading' | 'standard' | 'full';
export const CONTAINER_MAX: Readonly<Record<ContainerWidth, string>> = { reading: '48rem', standard: '90rem', full: 'none' };
/** The approved gaps (space tokens) a Stack, a Cluster or a Grid may use. */
export const GAPS = [4, 8, 12, 16, 24, 32] as const;
export type Gap = (typeof GAPS)[number];
export const isGap = (g: unknown): g is Gap => (GAPS as readonly unknown[]).includes(g);
/** THE LAYOUT SPEC — breakpoints, densities, regions, the reading order, containers, gaps — and its digest (a changed spec is a changed digest;
 *  the contract string moves with it). */
export const LAYOUT_SPEC = {
  contract: LAYOUT_CONTRACT, breakpoints: BREAKPOINTS, densities: DENSITIES, regions: READING_ORDER.map((k) => REGIONS[k]), readingOrder: READING_ORDER,
  containers: CONTAINER_MAX, gaps: GAPS, grid: { columns: 12 }, primarySpan: PRIMARY_SPAN, primaryMinPx: PRIMARY_MIN_PX,
};
export function layoutSpecDigest(): Promise<string> { return contentDigest(JSON.parse(JSON.stringify(LAYOUT_SPEC)) as unknown); }

/* ═════════════════════════════ THE CLIENT (0119_b81_x_lyg) ═════════════════════════════ */
type Receipt = { policyDecisionId: string; auditSeq: number };
export interface PreferenceVersion { preference_id: string; version: number; supersedes: string | null; density: Density | null; layout: SavedLayout; contract: string;
  current_contract?: boolean; digest: string; saved_at: string; composition?: string; unchanged?: boolean }
export interface PreferencesRead { principal_id: string; scope: string; read_at: string; contract: string; claim: string;
  compositions: Array<{ composition: string; current: PreferenceVersion; versions: number; history: Array<{ preference_id: string; version: number; density: Density | null; digest: string; saved_at: string }> }> }
export interface PreferenceIntake { composition: string; expectedVersion: number; density: Density | null; layout: SavedLayout }
const base = (s: ShellScope | null) => (s === null ? '/v1/shell' : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell`);
const envOf = (s: ShellScope | null, action: string) => ({
  scope: (s === null ? 'PLATFORM' : 'DOMAIN') as 'PLATFORM' | 'DOMAIN', tenant_id: s?.tenantId ?? null, domain_id: s?.domainId ?? null, action, object_type: 'PRF', object_id: null,
  side_effect_class: (action.endsWith('.read') ? 'none' : 'reversible') as 'none' | 'reversible', consequence_class: 'C1' as const, purpose_id: 'navigation',
});
/** The caller's OWN preferences (the PLATFORM ones for the admin workspace — `scope` null). */
export function readPreferences(s: ShellScope | null, composition: string | null = null, history = 5): Promise<ApiResult<{ preferences: PreferencesRead; receipt: Receipt }>> {
  return call(`${base(s)}/preferences/read`, envOf(s, 'shell.preferences.read'), { composition, history });
}
/** A new version of the person's preference for one composition — asked for by the person; refused `(stale)` when it read an older version. */
export function savePreferences(s: ShellScope | null, intake: PreferenceIntake): Promise<ApiResult<{ preference: PreferenceVersion; receipt: Receipt }>> {
  return call(`${base(s)}/preferences/save`, envOf(s, 'shell.preferences.save'), intake);
}
/** The current version of one composition in a read (null when the person saved none). */
export function currentOf(read: PreferencesRead | null, composition: string): PreferenceVersion | null {
  return read?.compositions.find((c) => c.composition === composition)?.current ?? null;
}
