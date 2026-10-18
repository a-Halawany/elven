'use client';
/**
 * THE ACTION COMPONENTS — B80 §CL-F (F-P7-E-05: CMP-041 Button, CMP-042 SplitButton, CMP-043 ActionMenu; UX-24-004). Each renders what
 * lib/actions-b80.ts decides.
 *
 *   · NOTHING LOOKS DONE BEFORE IT IS. A Button whose handler is asynchronous is PENDING (aria-busy, natively disabled, its verb in
 *     progress) until the handler ends, then returns to rest — it has no success state of its own; the outcome is the page's to show, from
 *     the server's receipt. GovernedButton (observation.tsx) keeps its own governed slice and pattern (B107's inventory key).
 *   · AN UNSAFE ACTION IS DISABLED WITH ITS REASON: aria-disabled, still focusable, the reason as its description — never hidden, never
 *     silently inert.
 *   · The menu-button pattern (ActionMenu, the SplitButton's menu): keyboard per WAI-ARIA, focus returned to the button on Escape and after
 *     an activation, disabled items announced with their reason and never activated.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { MENU_CLOSED, buttonClass, buttonState, mayActivate, menuKey, splitNames, type ButtonSize, type ButtonVariant, type MenuItem, type MenuState } from '../lib/actions-b80';
/* the library owns the style constant (lib/styles-b80.ts); ui.tsx re-exports it for existing pages */
export { buttonStyle } from '../lib/styles-b80';
/* B81 re: the Button ENFORCES controlLabelProblem / controlSizeVar (UX-20-004, LAY-003) — lib/controls-b81.ts buttonEnforcement */
import { buttonEnforcement } from '../lib/controls-b81';
import type { Consequence } from '../lib/symbols-b80';
/* end B81 re */

/** CMP-041 — the Button. `onClick` may return a promise: the button is pending until it settles (never a success state of its own).
 *  B81 re: `consequence` (optional; a critical variant is at least C3, else C1): from C2 the label must NAME the act in words (an icon-only
 *  consequential control is held with the reason) and the control is the 44px consequential one. */
export function Button({ label, pendingLabel, onClick, variant, size, disabledReason, type, describedBy, consequence }: {
  label: string; pendingLabel?: string; onClick?: () => unknown; variant?: ButtonVariant; size?: ButtonSize; disabledReason?: string | null;
  type?: 'button' | 'submit'; describedBy?: string; consequence?: Consequence;
}) {
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  /* B81 re */
  const en = buttonEnforcement({ label, ...(consequence === undefined ? {} : { consequence }), ...(variant === undefined ? {} : { variant }), ...(size === undefined ? {} : { size }), disabledReason: disabledReason ?? null });
  const facts = { busy, disabledReason: en.disabledReason, label, pendingLabel: pendingLabel ?? null };
  /* end B81 re */
  const st = buttonState(facts);
  const described = [describedBy, st.reason !== null ? reasonId : null].filter((x): x is string => x !== undefined && x !== null).join(' ') || undefined;
  return (
    <>
      <button type={type ?? 'button'} className={buttonClass(variant, en.size)} disabled={st.disabled} aria-disabled={st.ariaDisabled ? true : undefined}
        data-consequence={en.consequence /* B81 re: the 44px consequential target from C2 (globals.css B81 re) */}
        aria-busy={st.ariaBusy ? true : undefined} aria-describedby={described}
        onClick={(e) => {
          if (!mayActivate(facts)) { e.preventDefault(); return; }
          const r = onClick?.();
          if (r instanceof Promise) { setBusy(true); void r.catch(() => undefined).finally(() => setBusy(false)); }
        }}>
        {st.text}
      </button>
      {st.reason !== null && <span id={reasonId} className="eye-help"> — unavailable: {st.reason}</span>}
    </>
  );
}

function Menu({ id, items, state, setState, onSelect, buttonRef, label }: {
  id: string; items: readonly MenuItem[]; state: MenuState; setState: (s: MenuState) => void; onSelect: (key: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>; label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { if (state.open && state.active !== null) refs.current[state.active]?.focus(); }, [state.open, state.active]);
  if (!state.open) return null;
  return (
    <ul id={id} role="menu" aria-label={label} className="eye-menu"
      onKeyDown={(e) => {
        const r = menuKey(state, e.key, items, 'menu');
        if (r.prevent) e.preventDefault();
        setState(r.state);
        if (r.focusButton) buttonRef.current?.focus();
        if (r.activate !== null) onSelect(r.activate.key);
      }}>
      {items.map((it, i) => {
        const off = (it.disabledReason ?? null) !== null;
        return (
          <li key={it.key} role="none">
            <button ref={(el) => { refs.current[i] = el; }} type="button" role="menuitem" tabIndex={i === state.active ? 0 : -1} className="eye-menu-item"
              aria-disabled={off ? true : undefined}
              onClick={() => { if (off) return; setState(MENU_CLOSED); buttonRef.current?.focus(); onSelect(it.key); }}>
              {it.label}
              {it.description !== undefined && <small>{it.description}</small>}
              {off && <small>unavailable: {it.disabledReason}</small>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** CMP-043 — the ACTION MENU (menu-button): a button that opens a menu of actions; each action is the page's own (governed where it acts). */
export function ActionMenu({ label, items, onSelect, variant, size }: { label: string; items: readonly MenuItem[]; onSelect: (key: string) => void; variant?: ButtonVariant; size?: ButtonSize }) {
  const [state, setState] = useState<MenuState>(MENU_CLOSED);
  const menuId = useId();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <span className="eye-menu-wrap" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setState(MENU_CLOSED); }}>
      <button ref={ref} type="button" className={buttonClass(variant ?? 'secondary', size)} aria-haspopup="menu" aria-expanded={state.open} aria-controls={state.open ? menuId : undefined}
        onClick={() => setState(state.open ? MENU_CLOSED : { open: true, active: 0 })}
        onKeyDown={(e) => { const r = menuKey(state, e.key, items, 'button'); if (r.prevent) { e.preventDefault(); setState(r.state); } }}>
        {label} ▾
      </button>
      <Menu id={menuId} items={items} state={state} setState={setState} onSelect={onSelect} buttonRef={ref} label={label} />
    </span>
  );
}

/** CMP-042 — the SPLIT BUTTON: the primary action (a Button, pending until it settles) and a menu of its alternatives. */
export function SplitButton({ label, pendingLabel, onRun, items, onSelect, variant, size, disabledReason }: {
  label: string; pendingLabel?: string; onRun: () => unknown; items: readonly MenuItem[]; onSelect: (key: string) => void;
  variant?: ButtonVariant; size?: ButtonSize; disabledReason?: string | null;
}) {
  const [state, setState] = useState<MenuState>(MENU_CLOSED);
  const menuId = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const names = splitNames(label);
  return (
    <span className="eye-split" role="group">
      <Button label={label} pendingLabel={pendingLabel} onClick={onRun} variant={variant} size={size} disabledReason={disabledReason} />
      <span className="eye-menu-wrap" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setState(MENU_CLOSED); }}>
        <button ref={ref} type="button" className={buttonClass(variant, size)} aria-haspopup="menu" aria-expanded={state.open} aria-controls={state.open ? menuId : undefined}
          onClick={() => setState(state.open ? MENU_CLOSED : { open: true, active: 0 })}
          onKeyDown={(e) => { const r = menuKey(state, e.key, items, 'button'); if (r.prevent) { e.preventDefault(); setState(r.state); } }}>
          <span aria-hidden="true">▾</span><span className="eye-visually-hidden">{names.toggle}</span>
        </button>
        <Menu id={menuId} items={items} state={state} setState={setState} onSelect={onSelect} buttonRef={ref} label={names.toggle} />
      </span>
    </span>
  );
}
