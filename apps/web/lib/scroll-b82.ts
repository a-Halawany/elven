/**
 * CP-6 B82 §GM — UX-19-003: STICKY REGION BOUNDARIES WITHIN ONE SCROLL OWNER PER REGION (F-P7-E-04), as pure functions. B81's
 * scrollOwnerOf (lib/layout-b81.ts) says WHO scrolls at a class (the page on one column, the columns on the grid); this file says, per
 * REGION of a composition, which scroll owns it, whether its boundary sticks, and who owns a wide child's inline scroll — and checks the
 * stylesheet that makes it so.
 *
 * THE DEFECT B80 LEFT (CP6_BATCHES §B81.0): `.eye-shell-main { overflow-x: auto }` made the main column a SCROLL CONTAINER (a non-visible
 * overflow on one axis computes the other to auto) that never scrolls vertically — so `position: sticky` inside it stuck to main, i.e.
 * never. THE FIX (app/globals.css, the `B82 gm` block): `overflow-x: clip` — clipping is not a scroll container, so a sticky boundary sticks
 * to the PAGE's scroll; and a stray wide child still cannot widen the page (phase1-observation #14). Wide content owns its own inline
 * scroll (the DataTable, a canvas). DESIGN D18: withdrawn if the hosted no-sideways-scroll test goes red.
 *
 * CONSTRUCTION only (the walk's screenshots and the hosted #14 are the demonstration).
 */
import type { Placement } from './layout-b81';

export interface RegionScroll {
  /** who scrolls the region vertically */ block: 'page' | 'region';
  /** a wide child (a table, a canvas) scrolls inline INSIDE its own container — never the page, never the shell */ inline: 'content';
  /** the boundary that sticks to the page's scroll (null = none) */ sticky: 'block-start' | null;
  why: string;
}

/**
 * ONE SCROLL OWNER PER REGION. On one column (and before the class is measured) the PAGE is the only owner and nothing sticks — a sticky
 * band would cover the task at 390 px or at 200 % zoom (visible occlusion). On the grid, the SUPPORTING PANEL (evidence / inspector beside
 * the task) sticks at the block start of the page's scroll and scrolls its own overflow — it stays beside the work without hiding any of
 * it; the bands and the main column scroll with the page.
 */
export function regionScrollOf(placement: Placement | null, columns: 1 | 12): RegionScroll {
  if (columns === 1 || placement === null) return { block: 'page', inline: 'content', sticky: null, why: 'one column: the page is the only scroll owner; nothing sticks over the task' };
  if (placement === 'panel') return { block: 'region', inline: 'content', sticky: 'block-start', why: 'the supporting panel stays beside the task: it sticks to the page\'s scroll and scrolls its own overflow' };
  if (placement === 'deferred') return { block: 'page', inline: 'content', sticky: null, why: 'behind a named opener: the layer it opens in owns its scroll' };
  return { block: 'page', inline: 'content', sticky: null, why: placement === 'band' ? 'a band scrolls with the page (it never covers the task)' : 'the task scrolls with the page' };
}

/* ═════════════════════════════ THE STYLESHEET CHECK ═════════════════════════════ */

export interface CssRule { selector: string; decls: Record<string, string>; line: number }
/** The plain rules of a stylesheet (comments stripped; at-rule blocks skipped — media queries are not the shell's default). */
export function cssRules(css: string): CssRule[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out: CssRule[] = [];
  let depth = 0; let i = 0; let start = 0; let atDepth = -1;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === '{') {
      const head = code.slice(start, i).trim();
      if (head.startsWith('@')) { if (atDepth === -1) atDepth = depth; }
      else if (atDepth === -1) {
        const end = code.indexOf('}', i);
        const body = code.slice(i + 1, end);
        const decls: Record<string, string> = {};
        for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim(); }
        for (const sel of head.split(',')) out.push({ selector: sel.trim(), decls, line: code.slice(0, i).split('\n').length });
        i = end + 1; start = i; continue;
      }
      depth += 1; start = i + 1;
    } else if (ch === '}') {
      depth -= 1; if (atDepth !== -1 && depth === atDepth) atDepth = -1; start = i + 1;
    } else if (ch === ';' && depth === 0) start = i + 1;
    i += 1;
  }
  return out;
}
/** The value a selector's property ends with (the last plain rule of exactly that selector wins; `overflow` sets both axes). */
export function effective(rules: readonly CssRule[], selector: string, prop: 'overflow-x' | 'overflow-y' | 'position'): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (r.selector !== selector) continue;
    if (r.decls[prop] !== undefined) v = r.decls[prop]!;
    else if ((prop === 'overflow-x' || prop === 'overflow-y') && r.decls['overflow'] !== undefined) {
      const parts = r.decls['overflow']!.split(/\s+/); v = prop === 'overflow-x' ? parts[0]! : (parts[1] ?? parts[0]!);
    }
  }
  return v;
}
/** Does a box with these overflow values become a SCROLL CONTAINER? (visible / clip on both axes do not — anything else does.) */
export function isScrollContainer(x: string | null, y: string | null): boolean {
  const ok = (v: string | null) => v === null || v === 'visible' || v === 'clip';
  return !(ok(x) && ok(y));
}
/** The shell's ancestors of the page content (shell.tsx): none may be a scroll container, or a sticky boundary in a page sticks to it. */
export const SHELL_CHAIN = ['html', 'body', '.eye-shell', '.eye-shell-body', '.eye-shell-main'] as const;
export interface StickyFinding { selector: string; overflowX: string | null; overflowY: string | null }
/** The shell ancestors that are scroll containers in this stylesheet (empty = a sticky boundary sticks to the page's own scroll). */
export function stickyBlockers(css: string): StickyFinding[] {
  const rules = cssRules(css);
  return SHELL_CHAIN.map((s) => ({ selector: s, overflowX: effective(rules, s, 'overflow-x'), overflowY: effective(rules, s, 'overflow-y') }))
    .filter((f) => isScrollContainer(f.overflowX, f.overflowY));
}
