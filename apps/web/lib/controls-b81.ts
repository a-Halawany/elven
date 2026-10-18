/**
 * CP-6 B81 §RE — B80's control residues as pure functions (the web has no DOM test environment; the components render exactly what these
 * decide and controls-b81.test.ts reads the real sources):
 *
 *   · GOVERNED HOLD (PR-05-005, UX-09-005): GovernedButton reads the shell's status (`useShellStatus().frozen`, built in B80): under a frozen
 *     shell — or inside a FreezeScope — it is held, disabled WITH the shell's own statement as its reason; never activatable, never hidden.
 *     Outside a shell (no status) and under a DEGRADED-but-verified shell it is as before (the server refuses what it cannot make durable).
 *     A CONTRIBUTED change to B107's inventory key `web.observation.governed-button` (props kept: label, pendingLabel, onRun, disabled,
 *     variant) — recorded through B107's contribution queue by the act (proposer ≠ the Design System Authority).
 *   · TRUTH GLYPHS (UX-20-001): TruthBadge's Unicode glyphs move onto the symbol set (packages/tokens SYMBOLS — TS-01…TS-10 and the two
 *     certified TG- states); an unknown state is the certified GENERIC symbol with its text, never a guessed glyph. The UPPERCASE label stays
 *     beside it and the accessible name stays `truth state <state>` (the hosted phase0 suite selects by it). A CONTRIBUTED change to
 *     `web.ui.truth-badge` (props kept: state).
 *   · THE BUTTON'S ENFORCEMENT (UX-20-004, LAY-003): a Button declares (or is inferred to have) a consequence class; from C2 its visible
 *     label must NAME the act in words (a glyph alone — ✕, ▾, ✓ — is icon-only and is refused: the control renders disabled with the
 *     reason) and it is the 44px consequential control (size.control.lg via --eye-size-control-consequential).
 *   · THE ELEVATION BINDING (LAY-009 / -010 / -011): each layer component names its USE alias — raised (elevation.1), overlay
 *     (elevation.2), blocking (elevation.3) — never a raw level; globals.css (the B81 re block) binds the alias by `data-elevation`.
 *
 * THREE CLAIMS: construction (here); demonstrated operation (the act / walks, SYNTHETIC); real acceptance (H3) — never claimed.
 */
import { resolveSymbol } from '@eye/tokens';
import { controlLabelProblem, controlSizeVar, symbolView, type Consequence, type SymbolView } from './symbols-b80';
import type { ButtonSize, ButtonVariant } from './actions-b80';
import type { ShellStatus } from './shell-b80';

/* ═════════════ GOVERNED HOLD ═════════════ */
export interface GovernedHold { held: boolean; reason: string | null; phase: ShellStatus['phase'] | null }
/** May a governed control act under this shell status? (null = outside a shell: as before.) */
export function governedHold(status: ShellStatus | null): GovernedHold {
  if (status === null || !status.frozen) return { held: false, reason: null, phase: status?.phase ?? null };
  return { held: true, reason: `held — ${status.statement}`, phase: status.phase };
}

/* ═════════════ TRUTH GLYPHS ═════════════ */
export interface TruthBadgeView { state: string; text: string; ariaLabel: string; glyph: SymbolView; colourVar: string; certified: boolean }
/** The badge of a truth state: the registry's glyph (or the generic symbol), its colour token, the UPPERCASE word beside it. */
export function truthBadgeView(state: string): TruthBadgeView {
  const r = resolveSymbol(state, state);
  // the glyph is decorative beside the visible word (the badge's own accessible name carries the state) — so its label is never doubled
  const glyph = symbolView({ id: r.substituted ? state : r.symbol.id, text: state });
  const certified = !r.substituted;
  return {
    state, text: state.toUpperCase(), ariaLabel: `truth state ${state}`, glyph,
    colourVar: certified ? glyph.colourVar : 'var(--eye-color-uncertain)', certified,
  };
}

/* ═════════════ THE BUTTON'S ENFORCEMENT ═════════════ */
/** The label's WORDS: null when it carries no letter or digit (a glyph alone is icon-only). */
export function visibleWords(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null;
  const t = label.trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}
export interface ButtonEnforcement { consequence: Consequence; size: ButtonSize; minBlockSize: string; problem: string | null; disabledReason: string | null }
/**
 * The Button's consequence class (declared, else inferred: a critical variant is at least C3, anything else C1 — as it was), its size (the
 * consequential 44px control from C2), and the problem that HOLDS it (an icon-only consequential control). The page's own disabled reason
 * stays first; the enforcement's problem is added, never hidden.
 */
export function buttonEnforcement(a: { label: string; consequence?: Consequence; variant?: ButtonVariant; size?: ButtonSize; disabledReason?: string | null }): ButtonEnforcement {
  const consequence: Consequence = a.consequence ?? (a.variant === 'critical' ? 'C3' : 'C1');
  const consequential = consequence !== 'C0' && consequence !== 'C1';
  const problem = controlLabelProblem({ visibleText: visibleWords(a.label), consequence });
  const own = a.disabledReason === undefined || a.disabledReason === null || a.disabledReason === '' ? null : a.disabledReason;
  return {
    consequence, size: consequential ? 'lg' : (a.size ?? 'md'), minBlockSize: controlSizeVar(consequence), problem,
    disabledReason: own !== null && problem !== null ? `${own}; ${problem}` : own ?? problem,
  };
}

/* ═════════════ THE ELEVATION BINDING ═════════════ */
export type ElevationUse = 'none' | 'raised' | 'overlay' | 'blocking';
/** The registry rows each use alias resolves to (packages/tokens css.ts: --eye-elevation-<use> → --eye-elevation-<n>). */
export const ELEVATION_ROWS: Readonly<Record<Exclude<ElevationUse, 'none'>, { row: string; level: '1' | '2' | '3'; use: string }>> = {
  raised: { row: 'LAY-009', level: '1', use: 'Raised inspection surface' },
  overlay: { row: 'LAY-010', level: '2', use: 'Drawer or popover' },
  blocking: { row: 'LAY-011', level: '3', use: 'Blocking dialog' },
};
/** Which use each layer component (and Surface level) is bound to. */
export const ELEVATION_BINDING = {
  'Surface.base': 'none', 'Surface.raised': 'raised', 'Surface.overlay': 'overlay', Panel: 'raised', Drawer: 'overlay', Popover: 'overlay', Dialog: 'blocking',
} as const satisfies Record<string, ElevationUse>;
export type ElevationSubject = keyof typeof ELEVATION_BINDING;
export const elevationOf = (subject: ElevationSubject): ElevationUse => ELEVATION_BINDING[subject];
/** The CSS value a use resolves to — the alias, never a raw level. */
export const elevationVar = (use: ElevationUse): string => (use === 'none' ? 'none' : `var(--eye-elevation-${use})`);
