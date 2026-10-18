'use client';
/**
 * CP-6 B81 §LY-G — THE LAYOUT PRIMITIVES, THE REGIONS, THE DENSITY SWITCH and THE COMPACT NAVIGATION of the shared library (F-P7-E-04:
 * CMP-005 Container, CMP-006 Stack, CMP-007 Cluster, CMP-008 Grid; REG-01…08 Region and Composition; DEN-01…03 PreferencesScope and
 * DensitySwitch; BP-01 BottomNavigation; BP-03 RailToggle). The behaviour is lib/layout-b81.ts (pure, tested); this file renders it:
 *
 *  - Container / Stack / Cluster / Grid compose on the space tokens only (gaps 4–32) and the 12-column grid; a Container may carry its own
 *    density (an inspection table inside a strategic page).
 *  - Region is a labelled landmark of one of the seven kinds; Composition places the regions for the measured class in ONE reading order
 *    (DOM order = focus order at every size), defers only the inspector behind a NAMED opener that carries its selection and version, keeps
 *    the focus on reflow (or moves it to that opener) and announces the change. Context, status, authority, primary, action and evidence are
 *    never deferred (UX-14-004, UX-ADR-013). A composition's problems (two primary regions, a gate without its authority) are SHOWN.
 *  - PreferencesScope reads the person's own preferences (shell.preferences.read) and applies the density in force (data-density) and the
 *    rail state (data-rail) to everything inside it; DensitySwitch and RailToggle SAVE the person's choice (shell.preferences.save) — the
 *    value shown is the SERVER's until it answers (nothing optimistic), a refusal in the server's words, the receipt shown.
 *  - BottomNavigation is the compact (< 640 px) navigation: the rail's own names (the hosted selectors), the current place always visible,
 *    the rest under "More". While it is rendered, the rail yields to it below 640 px (globals.css, the B81 lyg block).
 *
 * PRESENTATION NEVER CHANGES MEANING: no primitive decides who may act; elevation never carries a state (the lint in layout-b81.test.ts).
 * Styling: classes in app/globals.css (the B81 lyg block), semantic tokens only, logical properties only. CONSTRUCTION only.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { NavItem, ShellScope, WorkspaceSpec } from '../lib/b80-seams';
import type { Density, LayoutClass, RegionKey } from '../lib/b81-seams';
import { activeHref } from '../lib/shell-b80';
import {
  BREAKPOINTS, CONTAINER_MAX, DENSITIES, REGIONS, bottomNavOf, breakpointOf, composeRegions, currentOf, densityOf, effectiveDensity, isGap, layoutClassOf,
  layoutToSave, mediaQueryOf, readPreferences, reconcileLayout, reflow, savePreferences,
  type CompositionKind, type CompositionPlan, type ContainerWidth, type EffectiveDensity, type Gap, type PreferenceVersion, type PreferencesRead,
  type Reconciled, type SavedLayout, type Selection,
} from '../lib/layout-b81';
import { ErrorNote, Receipt } from './ui';
import { GovernedButton, LiveStatus } from './observation';
import { Dialog, Drawer } from './layers';

const gapClass = (g: Gap | undefined, fallback: Gap) => `eye-gap-${isGap(g) ? g : fallback}`;

/* ───────────────────────── Container, Stack, Cluster, Grid (CMP-005…008) ───────────────────────── */

/** CMP-005: a width-bounded container (reading 48rem · standard 90rem · full) with an optional density of its own. */
export function Container({ width = 'standard', density, label, children }: { width?: ContainerWidth; density?: Density; label?: string; children: ReactNode }) {
  return (
    <div className={`eye-container eye-container--${width}`} data-density={density} aria-label={label}
      role={label !== undefined ? 'region' : undefined} style={{ maxInlineSize: CONTAINER_MAX[width] }}>
      {children}
    </div>
  );
}

/** CMP-006: a vertical flow on one space token. */
export function Stack({ gap = 16, as = 'div', label, children }: { gap?: Gap; as?: 'div' | 'section' | 'ul' | 'ol'; label?: string; children: ReactNode }) {
  const Tag = as;
  return <Tag className={`eye-stack ${gapClass(gap, 16)}`} aria-label={label}>{children}</Tag>;
}

/** CMP-007: a wrapping horizontal group (it never pushes the page sideways); mirrors under RTL. */
export function Cluster({ gap = 8, justify = 'start', align = 'center', label, children }: {
  gap?: Gap; justify?: 'start' | 'end' | 'between' | 'center'; align?: 'start' | 'center' | 'baseline' | 'end'; label?: string; children: ReactNode;
}) {
  return <div className={`eye-cluster ${gapClass(gap, 8)} eye-cluster--justify-${justify} eye-cluster--align-${align}`} role={label !== undefined ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/** CMP-008: the responsive grid — 12 columns from 960 px, ONE column below (BP-01/02); children take a span (1–12) through Region or GridItem. */
export function Grid({ columns = 12, gap = 16, label, children }: { columns?: 1 | 12; gap?: Gap; label?: string; children: ReactNode }) {
  return <div className={`eye-grid ${gapClass(gap, 16)}`} data-columns={columns} role={label !== undefined ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/** A plain grid cell spanning 1–12 columns (one column below 960 px). */
export function GridItem({ span = 12, children }: { span?: number; children: ReactNode }) {
  const s = Number.isInteger(span) && span >= 1 && span <= 12 ? span : 12;
  return <div className={`eye-grid-item eye-span-${s}`}>{children}</div>;
}

/* ───────────────────────── Region (REG-01…08) ───────────────────────── */

const placementStyle = (column: readonly [number, number], row: readonly [number, number]): CSSProperties =>
  ({ gridColumn: `${column[0]} / span ${column[1]}`, gridRow: `${row[0]} / span ${row[1]}` });

/**
 * A REGION of a composition: a labelled landmark (`section`) of one kind. The status region is a polite live region; the authority region
 * is where §HA's AuthorityBanner sits at a consequential gate. A region carries no elevation (meaning is stated, never implied by depth).
 */
export function Region({ region, label, span, id, children, placement }: {
  region: RegionKey; label?: string; span?: number; id?: string; children: ReactNode;
  /** set by Composition: the grid lines of this region at the measured class */ placement?: { column: readonly [number, number]; row: readonly [number, number] };
}) {
  const spec = REGIONS[region];
  const s = span !== undefined && Number.isInteger(span) && span >= 1 && span <= 12 ? ` eye-span-${span}` : '';
  return (
    <section id={id} data-region={region} aria-label={label ?? spec.label} className={`eye-region eye-region--${region}${s}`}
      style={placement !== undefined ? placementStyle(placement.column, placement.row) : undefined}
      aria-live={region === 'status' ? 'polite' : undefined}>
      {children}
    </section>
  );
}

/* ───────────────────────── the measured class ───────────────────────── */

/** The layout class of this window (null until measured — the server render stacks everything and defers nothing). */
export function useLayoutClass(): LayoutClass | null {
  const [cls, setCls] = useState<LayoutClass | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const lists = BREAKPOINTS.map((b) => ({ key: b.key, mq: window.matchMedia(mediaQueryOf(b.key)) }));
    const pick = () => setCls(lists.find((l) => l.mq.matches)?.key ?? layoutClassOf(window.innerWidth));
    pick();
    for (const l of lists) l.mq.addEventListener('change', pick);
    return () => { for (const l of lists) l.mq.removeEventListener('change', pick); };
  }, []);
  return cls;
}
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

/* ───────────────────────── PreferencesScope, DensitySwitch, RailToggle (DEN-01…03, UX-14-002) ───────────────────────── */

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
export interface PreferencesValue {
  cls: LayoutClass | null; density: EffectiveDensity; rail: 'expanded' | 'collapsed'; roles: readonly string[];
  state: 'reading' | 'ready' | 'refused'; readError: Err; saveError: Err; receipt: Rcpt; pending: string | null;
  current: (composition: string) => PreferenceVersion | null;
  layoutFor: (composition: string) => Reconciled;
  save: (composition: string, change: { density?: Density | null; layout?: SavedLayout }, pendingWords: string) => Promise<void>;
}
const PrefCtx = createContext<PreferencesValue | null>(null);
/** The person's preferences in force (null outside a PreferencesScope). */
export function usePreferences(): PreferencesValue | null { return useContext(PrefCtx); }

/**
 * THE SCOPE of the person's preferences: reads them once (their own — the server refuses anyone else's), applies the density in force and
 * the rail state to everything inside it. `scope` null = the PLATFORM workspace. The roles are DESCRIPTIVE (they pick a default density;
 * they grant nothing).
 */
export function PreferencesScope({ scope, roles, kind, children }: { scope: ShellScope | null; roles: readonly string[]; kind?: CompositionKind; children: ReactNode }) {
  const cls = useLayoutClass();
  const coarse = useCoarsePointer();
  const [read, setRead] = useState<PreferencesRead | null>(null);
  const [state, setState] = useState<PreferencesValue['state']>('reading');
  const [readError, setReadError] = useState<Err>(null);
  const [saveError, setSaveError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [pending, setPending] = useState<string | null>(null);
  const tenantId = scope?.tenantId ?? null; const domainId = scope?.domainId ?? null;
  const load = useCallback(async () => {
    const r = await readPreferences(tenantId === null || domainId === null ? null : { tenantId, domainId }, null, 3);
    if (r.ok && r.data !== undefined) { setRead(r.data.preferences); setState('ready'); setReadError(null); }
    else { setState('refused'); setReadError(r.error ?? null); }
  }, [tenantId, domainId]);
  useEffect(() => { void load(); }, [load]);
  const current = useCallback((c: string) => currentOf(read, c), [read]);
  const def = currentOf(read, 'default');
  const density = effectiveDensity({ savedDefault: def?.density ?? null, ...(kind !== undefined ? { kind } : {}), roles, pointer: coarse ? 'coarse' : 'fine', cls });
  const rail = reconcileLayout(def === null ? null : { contract: def.contract, layout: def.layout }, cls).rail;
  const save = useCallback(async (composition: string, change: { density?: Density | null; layout?: SavedLayout }, pendingWords: string) => {
    const cur = currentOf(read, composition);
    setPending(pendingWords); setSaveError(null); setReceipt(null);
    const r = await savePreferences(tenantId === null || domainId === null ? null : { tenantId, domainId }, {
      composition, expectedVersion: cur?.version ?? 0,
      density: change.density !== undefined ? change.density : (cur?.density ?? null),
      layout: change.layout !== undefined ? change.layout : (cur?.layout ?? {}),
    });
    setPending(null);
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); await load(); }
    else { setSaveError(r.error ?? null); throw new Error(r.error?.message ?? 'the save was refused'); }
  }, [read, tenantId, domainId, load]);
  const value = useMemo<PreferencesValue>(() => ({
    cls, density, rail, roles, state, readError, saveError, receipt, pending, current,
    layoutFor: (c: string) => { const v = currentOf(read, c); return reconcileLayout(v === null ? null : { contract: v.contract, layout: v.layout }, cls); },
    save,
  }), [cls, density, rail, roles, state, readError, saveError, receipt, pending, current, read, save]);
  return (
    <PrefCtx.Provider value={value}>
      <div className="eye-preferences-scope" data-density={density.density} data-rail={rail} data-layout-class={cls ?? 'unmeasured'}>{children}</div>
    </PrefCtx.Provider>
  );
}

/**
 * THE DENSITY SWITCH (DEN-01…03): a native select (its label is its name), the density in force and WHERE it comes from (your choice, the
 * view's, your roles', a touch screen). Saving is the person's own act (`shell.preferences.save`); the select shows the server's value until
 * it answers. Inside a PreferencesScope only.
 */
export function DensitySwitch({ compact }: { compact?: boolean }) {
  const p = usePreferences();
  const id = useId();
  if (p === null) return null;
  const saved = p.current('default')?.density ?? null;
  const onChange = (v: string) => {
    const next: Density | null = v === '' ? null : (v as Density);
    void p.save('default', { density: next }, next === null ? 'Returning to the default density' : `Saving ${densityOf(next).name.toLowerCase()} density`).catch(() => undefined);
  };
  return (
    <span className="eye-density-switch">
      <label htmlFor={`${id}-density`} className="eye-density-label">Density</label>{' '}
      <select id={`${id}-density`} className="eye-density-select" value={saved ?? ''} disabled={p.pending !== null || p.state !== 'ready'}
        aria-describedby={`${id}-density-note`} onChange={(e) => onChange(e.target.value)}>
        <option value="">Default for your work</option>
        {DENSITIES.map((d) => <option key={d.key} value={d.key}>{`${d.name} — ${d.controlPx} px controls`}</option>)}
      </select>
      <span id={`${id}-density-note`} className={compact === true ? 'eye-visually-hidden' : 'eye-shell-meta'}>
        {' '}{p.state === 'reading' ? 'reading your saved choice…' : p.state === 'refused' ? 'your saved choice could not be read — the default applies'
          : `in force: ${densityOf(p.density.density).name.toLowerCase()} (${p.density.note})`}
      </span>
      {p.pending !== null && <LiveStatus>{`${p.pending}…`}</LiveStatus>}
      <ErrorNote error={p.saveError ?? (p.state === 'refused' ? p.readError : null)} />
      {compact !== true && <Receipt receipt={p.receipt} />}
    </span>
  );
}

/** BP-03 — the collapsible rail's toggle (shown 960–1439 px only; the rail is persistent above and glyphs below). Saves the person's choice. */
export function RailToggle() {
  const p = usePreferences();
  if (p === null) return null;
  const collapsed = p.rail === 'collapsed';
  const cur = p.current('default');
  const toggle = async () => {
    const layout: SavedLayout = { ...(cur?.layout ?? {}), rail: collapsed ? 'expanded' : 'collapsed' };
    await p.save('default', { layout }, collapsed ? 'Showing the navigation labels' : 'Collapsing the navigation labels');
  };
  return (
    <span className="eye-rail-toggle">
      <GovernedButton variant="quiet" label={collapsed ? 'Show navigation labels' : 'Collapse navigation labels'} pendingLabel={collapsed ? 'Showing the labels' : 'Collapsing the labels'}
        disabled={p.state !== 'ready'} onRun={toggle} />
    </span>
  );
}

/* ───────────────────────── Composition and DeferredContent (UX-14-003…005, UX-19-003/005) ───────────────────────── */

export interface DeferredView { region: RegionKey; label: string; summary: string; opener: string; openerId: string }
/** The deferred-content list: every region moved behind an opener, NAMED with what it holds (its selection and version). */
export function DeferredContent({ items, onOpen }: { items: readonly DeferredView[]; onOpen: (region: RegionKey) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="eye-deferred" aria-label="Moved behind an opener at this size">
      {items.map((d) => (
        <li key={d.region}>
          <button type="button" id={d.openerId} className="eye-deferred-opener" onClick={() => onOpen(d.region)}>{d.opener}</button>
        </li>
      ))}
    </ul>
  );
}

/**
 * THE COMPOSITION of a page's regions for the measured class (lib/layout-b81 composeRegions): one reading order, the bands across, the
 * primary task and its actions in the main column, one supporting panel (standard / wide) or both (command), the inspector behind its named
 * opener where it does not fit. `composition` names the person's saved arrangement (the panel, the inspector state) — reconciled, with what
 * was not applied said in words; "Save this arrangement" saves it (the person's act).
 */
export function Composition({ regions, label, selection, consequentialGate, composition }: {
  regions: Partial<Record<RegionKey, ReactNode>>; label: string; selection?: Selection | null; consequentialGate?: boolean; composition?: string;
}) {
  const prefs = usePreferences();
  const measured = useLayoutClass();
  const cls = prefs?.cls ?? measured;
  const saved = composition !== undefined && prefs !== null ? prefs.layoutFor(composition) : null;
  const [panel, setPanel] = useState<'evidence' | 'inspector' | null>(null);
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const present = (Object.keys(regions) as RegionKey[]).filter((k) => regions[k] !== undefined && regions[k] !== null);
  const plan = composeRegions({ cls, present, selection: selection ?? null, consequentialGate: consequentialGate === true,
    prefs: { panel: panel ?? saved?.panel ?? null, inspectorCollapsed: collapsed ?? saved?.inspectorCollapsed ?? false } });
  const base = useId();
  const [open, setOpen] = useState<RegionKey | null>(null);
  const [announce, setAnnounce] = useState('');
  const focusRegion = useRef<RegionKey | null>(null);
  const prev = useRef<CompositionPlan | null>(null);
  useEffect(() => {
    const before = prev.current; prev.current = plan;
    if (before === null || before.cls === plan.cls) return;
    const r = reflow(before, plan, { focusRegion: focusRegion.current, selection: selection ?? null });
    setAnnounce(r.announcement);
    if (r.focus?.via === 'opener') document.getElementById(`${base}-open-${r.focus.region}`)?.focus();
  });
  const deferredViews: DeferredView[] = plan.deferred.map((d) => ({ ...d, openerId: `${base}-open-${d.region}` }));
  const openItem = plan.deferred.find((d) => d.region === open) ?? null;
  const inspectorDeferred = plan.deferred.find((d) => d.region === 'inspector') ?? null;
  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const r = (e.target as HTMLElement).closest('[data-region]')?.getAttribute('data-region');
    if (r !== null && r !== undefined) focusRegion.current = r as RegionKey;
  };
  const arrangeable = composition !== undefined && prefs !== null && cls !== null && breakpointOf(cls).columns === 12;
  const effPanel = plan.panel;
  return (
    <div className="eye-composition" data-layout-class={cls ?? 'unmeasured'} aria-label={label} role="group" onFocus={onFocus}>
      {plan.problems.length > 0 && <p role="note" className="eye-composition-problem">{`This composition is not approved: ${plan.problems.join('; ')}.`}</p>}
      {saved !== null && saved.notes.length > 0 && (
        <p role="note" className="eye-shell-meta">{`Your saved arrangement, reconciled: ${saved.notes.map((n) => `${n.field} — ${n.why}`).join('; ')}.`}</p>
      )}
      {arrangeable && (
        <div className="eye-cluster eye-gap-8 eye-cluster--justify-end eye-cluster--align-center">
          {present.includes('evidence') && present.includes('inspector') && cls !== 'BP-05' && (
            <label className="eye-shell-meta">Supporting panel{' '}
              <select value={effPanel ?? ''} onChange={(e) => setPanel(e.target.value === 'inspector' ? 'inspector' : 'evidence')}>
                <option value="evidence">Evidence</option><option value="inspector">Inspector</option>
              </select>
            </label>
          )}
          {present.includes('inspector') && (
            <label className="eye-shell-meta">
              <input type="checkbox" checked={collapsed ?? saved?.inspectorCollapsed ?? false} onChange={(e) => setCollapsed(e.target.checked)} /> Inspector behind an opener
            </label>
          )}
          <GovernedButton variant="quiet" label="Save this arrangement" pendingLabel="Saving the arrangement"
            onRun={() => prefs!.save(composition!, { layout: layoutToSave({ cls, panel: effPanel, inspectorCollapsed: collapsed ?? saved?.inspectorCollapsed ?? false, rail: prefs!.rail, focusRegion: focusRegion.current }) }, 'Saving the arrangement')} />
          <ErrorNote error={prefs!.saveError} />
        </div>
      )}
      <div className="eye-grid eye-gap-16" data-columns={plan.columns}>
        {plan.regions.map((r) => r.placement === 'deferred'
          ? (
            <div key={r.region} className="eye-region-deferred" style={placementStyle(r.column, r.row)}>
              <DeferredContent items={deferredViews.filter((d) => d.region === r.region)} onOpen={setOpen} />
            </div>
          ) : (
            <Region key={r.region} region={r.region} placement={{ column: r.column, row: r.row }}>{regions[r.region]}</Region>
          ))}
      </div>
      <LiveStatus>{announce}</LiveStatus>
      {/* mounted while the region is deferred, so closing runs the layer's own focus return (to the opener) */}
      {inspectorDeferred !== null && (
        <Dialog open={openItem !== null && plan.columns === 1} title={`${inspectorDeferred.label} — ${inspectorDeferred.summary}`} onClose={() => setOpen(null)}>
          {openItem !== null && plan.columns === 1 ? regions[openItem.region] : null}
        </Dialog>
      )}
      {inspectorDeferred !== null && (
        <Drawer open={openItem !== null && plan.columns === 12} title={`${inspectorDeferred.label} — ${inspectorDeferred.summary}`} onClose={() => setOpen(null)}>
          {openItem !== null && plan.columns === 12 ? regions[openItem.region] : null}
        </Drawer>
      )}
    </div>
  );
}

/* ───────────────────────── BottomNavigation (BP-01) ───────────────────────── */

/**
 * THE COMPACT NAVIGATION (< 640 px): the rail's places under the rail's own accessible name (one navigation of that name is in the
 * accessibility tree at any width — the other is not rendered there), the current place always among the visible ones (aria-current), the
 * rest under "More" (Escape closes it and returns the focus).
 */
export function BottomNavigation({ spec, nav, pathname, specimen }: {
  spec: WorkspaceSpec; nav: readonly NavItem[]; pathname: string; /** a catalogue specimen: shown at every width, in the page (never the shell's navigation) */ specimen?: boolean;
}) {
  const active = activeHref(nav, pathname);
  const { primary, more } = bottomNavOf(nav, active);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  useEffect(() => { setOpen(false); }, [pathname]);
  const onKey = (e: ReactKeyboardEvent<HTMLElement>) => { if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); toggle.current?.focus(); } };
  const item = (n: NavItem) => (
    <li key={n.href}>
      <Link href={n.href} aria-current={n.href === active ? 'page' : undefined} className="eye-bottom-nav-link">
        {n.glyph !== '' && <span aria-hidden="true" className="eye-bottom-nav-glyph">{n.glyph}</span>}
        <span className="eye-bottom-nav-label">{n.label}</span>
      </Link>
    </li>
  );
  return (
    <nav aria-label={spec.navName} className={specimen === true ? 'eye-bottom-nav eye-bottom-nav--specimen' : 'eye-bottom-nav'} onKeyDown={onKey}>
      {open && more.length > 0 && <ul id={`${id}-more`} className="eye-bottom-nav-more" aria-label="More places">{more.map(item)}</ul>}
      <ul className="eye-bottom-nav-list">
        {primary.map(item)}
        {more.length > 0 && (
          <li>
            <button ref={toggle} type="button" className="eye-bottom-nav-link" aria-expanded={open} aria-controls={`${id}-more`} onClick={() => setOpen((o) => !o)}>
              <span aria-hidden="true" className="eye-bottom-nav-glyph">⋯</span>
              <span className="eye-bottom-nav-label">{`More (${more.length})`}</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
