/**
 * B80 §CL-F (F-P7-E-05: CMP-041..043, UX-24-004) — THE ACTION CONTRACT as pure functions: the Button's variants, sizes and states, the
 * menu-button keyboard model shared by ActionMenu and SplitButton, and the rule that an action never looks done before the server says so.
 *
 *   · A Button is pending (aria-busy, disabled, its verb in progress) while its handler runs and returns to rest when it ends — it has NO
 *     success state of its own: an outcome is the page's to show, from the receipt (GovernedButton keeps its own governed slice in
 *     observation.tsx; a consequential act still uses it or this Button with a receipt beside it).
 *   · An UNSAFE action is disabled WITH ITS REASON (aria-disabled + the reason as its description), never hidden and never silently inert.
 *   · Sizes are the control tokens (--eye-size-control-sm/md/lg, LAY-001…003); the variants are semantic (primary, secondary, quiet, critical).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'critical';
export type ButtonSize = 'sm' | 'md' | 'lg';
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string =>
  ['eye-button', variant === 'primary' ? null : `eye-button--${variant}`, size === 'md' ? null : `eye-button--${size}`].filter((x) => x !== null).join(' ');

export interface ButtonFacts { busy: boolean; disabledReason: string | null; label: string; pendingLabel: string | null }
/** The rendered state: native `disabled` while busy (a second activation cannot start), aria-disabled + the reason when unsafe (still focusable
 *  so the reason can be read), the label in progress while busy. */
export function buttonState(f: ButtonFacts): { disabled: boolean; ariaDisabled: boolean; ariaBusy: boolean; text: string; reason: string | null } {
  const unsafe = f.disabledReason !== null && f.disabledReason !== '';
  return { disabled: f.busy, ariaDisabled: unsafe, ariaBusy: f.busy, text: f.busy ? `${f.pendingLabel ?? f.label}…` : f.label, reason: unsafe ? f.disabledReason : null };
}
/** May the activation run? Never while busy, never while unsafe. */
export const mayActivate = (f: ButtonFacts): boolean => !f.busy && (f.disabledReason === null || f.disabledReason === '');

/* ───────────────────────── the menu button (ActionMenu, SplitButton's menu) ───────────────────────── */

export interface MenuItem { key: string; label: string; description?: string; disabledReason?: string | null }
export interface MenuState { open: boolean; active: number | null }
export const MENU_CLOSED: MenuState = { open: false, active: null };
/**
 * The WAI-ARIA menu-button keyboard contract. On the BUTTON: Enter, Space and ArrowDown open on the first item, ArrowUp on the last. In the
 * MENU: ArrowDown/ArrowUp move (wrapping), Home/End jump, a printable character moves to the next item starting with it, Enter/Space
 * activate the active item (a disabled item is focusable and announces its reason but is never activated), Escape closes and returns focus
 * to the button, Tab closes. `focusButton` tells the component to move focus back to the button.
 */
export function menuKey(s: MenuState, key: string, items: readonly MenuItem[], from: 'button' | 'menu'): { state: MenuState; activate: MenuItem | null; focusButton: boolean; prevent: boolean } {
  const n = items.length; const wrap = (i: number) => (n === 0 ? null : ((i % n) + n) % n);
  const none = { activate: null, focusButton: false };
  if (from === 'button') {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown') return { state: { open: true, active: wrap(0) }, ...none, prevent: true };
    if (key === 'ArrowUp') return { state: { open: true, active: wrap(n - 1) }, ...none, prevent: true };
    return { state: s, ...none, prevent: false };
  }
  switch (key) {
    case 'ArrowDown': return { state: { ...s, active: wrap((s.active ?? -1) + 1) }, ...none, prevent: true };
    case 'ArrowUp': return { state: { ...s, active: wrap((s.active ?? n) - 1) }, ...none, prevent: true };
    case 'Home': return { state: { ...s, active: wrap(0) }, ...none, prevent: true };
    case 'End': return { state: { ...s, active: wrap(n - 1) }, ...none, prevent: true };
    case 'Escape': return { state: MENU_CLOSED, activate: null, focusButton: true, prevent: true };
    case 'Tab': return { state: MENU_CLOSED, activate: null, focusButton: false, prevent: false };
    case 'Enter': case ' ': {
      const it = s.active === null ? undefined : items[s.active];
      if (it === undefined || (it.disabledReason ?? null) !== null) return { state: s, ...none, prevent: true };
      return { state: MENU_CLOSED, activate: it, focusButton: true, prevent: true };
    }
    default: {
      if (key.length === 1 && /\S/.test(key)) {
        const start = (s.active ?? -1) + 1;
        for (let k = 0; k < n; k++) { const i = (start + k) % n; if (items[i]!.label.toLowerCase().startsWith(key.toLowerCase())) return { state: { ...s, active: i }, ...none, prevent: true }; }
      }
      return { state: s, ...none, prevent: false };
    }
  }
}
/** A SplitButton's two parts: the primary action's own name, and the menu button named for what it opens — never containing the primary's
 *  name (a name-substring selector for the primary must find exactly one button). */
export const splitNames = (primary: string): { primary: string; toggle: string } => ({ primary, toggle: 'More actions' });
