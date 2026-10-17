import { describe, expect, it } from 'vitest';
import { MENU_CLOSED, buttonClass, buttonState, mayActivate, menuKey, splitNames } from './actions-b80';

/** CP-6 B80 §CL-F — the action contract (CMP-041..043, UX-24-004). SYNTHETIC. */
describe('the Button (CMP-041): variants and sizes on tokens; pending, never "done"; unsafe disabled with its reason', () => {
  it('classes carry the variant and the size (control tokens)', () => {
    expect(buttonClass()).toBe('eye-button');
    expect(buttonClass('critical', 'sm')).toBe('eye-button eye-button--critical eye-button--sm');
    expect(buttonClass('quiet', 'lg')).toBe('eye-button eye-button--quiet eye-button--lg');
  });
  it('busy: natively disabled, aria-busy, the verb in progress; there is no success state', () => {
    expect(buttonState({ busy: true, disabledReason: null, label: 'Save draft', pendingLabel: 'Saving draft' })).toEqual({ disabled: true, ariaDisabled: false, ariaBusy: true, text: 'Saving draft…', reason: null });
    const rest = buttonState({ busy: false, disabledReason: null, label: 'Save draft', pendingLabel: 'Saving draft' });
    expect(rest).toEqual({ disabled: false, ariaDisabled: false, ariaBusy: false, text: 'Save draft', reason: null });
    expect(Object.keys(rest)).not.toContain('done');
  });
  it('an unsafe action is aria-disabled with its reason (still focusable) and never activates', () => {
    const f = { busy: false, disabledReason: 'you registered this source; a second operator approves it', label: 'Approve', pendingLabel: null };
    expect(buttonState(f)).toMatchObject({ disabled: false, ariaDisabled: true, reason: 'you registered this source; a second operator approves it' });
    expect(mayActivate(f)).toBe(false);
    expect(mayActivate({ ...f, disabledReason: null, busy: true })).toBe(false);
    expect(mayActivate({ ...f, disabledReason: null })).toBe(true);
  });
});

describe('the menu button (CMP-043 ActionMenu, CMP-042 SplitButton): the WAI-ARIA keyboard contract', () => {
  const items = [{ key: 'suspend', label: 'Suspend' }, { key: 'retire', label: 'Retire', disabledReason: 'a live source is never retired from here' }, { key: 'resume', label: 'Resume' }];
  it('Enter / Space / ArrowDown open on the first item; ArrowUp on the last', () => {
    for (const k of ['Enter', ' ', 'ArrowDown']) expect(menuKey(MENU_CLOSED, k, items, 'button').state).toEqual({ open: true, active: 0 });
    expect(menuKey(MENU_CLOSED, 'ArrowUp', items, 'button').state).toEqual({ open: true, active: 2 });
    expect(menuKey(MENU_CLOSED, 'x', items, 'button').prevent).toBe(false);
  });
  it('arrows wrap, Home/End jump, a letter moves to the next item starting with it', () => {
    const o = { open: true, active: 2 };
    expect(menuKey(o, 'ArrowDown', items, 'menu').state.active).toBe(0);
    expect(menuKey({ open: true, active: 0 }, 'ArrowUp', items, 'menu').state.active).toBe(2);
    expect(menuKey(o, 'Home', items, 'menu').state.active).toBe(0);
    expect(menuKey({ open: true, active: 0 }, 'End', items, 'menu').state.active).toBe(2);
    expect(menuKey({ open: true, active: 0 }, 'r', items, 'menu').state.active).toBe(1);
    expect(menuKey({ open: true, active: 1 }, 'r', items, 'menu').state.active).toBe(2);
  });
  it('Enter activates the active item and returns focus to the button; a disabled item is never activated; Escape closes and returns focus; Tab closes', () => {
    expect(menuKey({ open: true, active: 0 }, 'Enter', items, 'menu')).toMatchObject({ state: MENU_CLOSED, activate: { key: 'suspend' }, focusButton: true });
    expect(menuKey({ open: true, active: 1 }, 'Enter', items, 'menu')).toMatchObject({ activate: null, state: { open: true, active: 1 } });
    expect(menuKey({ open: true, active: 1 }, 'Escape', items, 'menu')).toMatchObject({ state: MENU_CLOSED, focusButton: true });
    expect(menuKey({ open: true, active: 1 }, 'Tab', items, 'menu')).toMatchObject({ state: MENU_CLOSED, focusButton: false, prevent: false });
  });
  it('the split button\'s toggle never carries the primary\'s name (a name-substring selector finds one button)', () => {
    const n = splitNames('Submit for approval');
    expect(n.primary).toBe('Submit for approval');
    expect(n.toggle).not.toContain('Submit for approval');
  });
});
