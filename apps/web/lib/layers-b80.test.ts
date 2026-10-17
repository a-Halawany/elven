import { describe, expect, it } from 'vitest';
import {
  closeLayer, consequenceGate, digestValue, disclosureSummary, dividerAria, emptyDrafts, emptyStack, escapeTarget, initialFocus, onDigestChange,
  onLayerClosed, openLayer, restoreDraft, surfaceClasses, toggleAria, trapFocus, type Layer,
} from './layers-b80';

/** CP-6 B80 §CL-D (UX-23, PAT-27, CMP-002/004): the layer contract. SYNTHETIC. */
const L = (id: string, kind: Layer['kind'], modal: boolean, originId: string | null = `${id}-origin`): Layer => ({ id, kind, modal, originId, title: `Layer ${id}` });

describe('one modal at a time; supporting layers stack; closing returns focus to the origin', () => {
  it('a second blocking dialog is refused with its reason; a popover inside a dialog is admitted', () => {
    let s = emptyStack();
    const a = openLayer(s, L('confirm', 'dialog', true)); expect(a.ok).toBe(true); s = a.stack;
    const b = openLayer(s, L('second', 'dialog', true));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('“Layer confirm” is open — finish or close it first (one blocking dialog at a time)');
    const c = openLayer(s, L('help', 'popover', false)); expect(c.ok).toBe(true); s = c.stack;
    expect(s.layers.map((l) => l.id)).toEqual(['confirm', 'help']);
    expect(openLayer(s, L('help', 'popover', false)).stack).toBe(s);
    expect(openLayer(emptyStack(), L('x', 'dialog', false)).ok).toBe(false);
  });
  it('Escape targets the TOPMOST layer; closing a layer closes the ones above it; focus returns to its origin; only commit is consent', () => {
    let s = openLayer(emptyStack(), L('drawer', 'drawer', false)).stack;
    s = openLayer(s, L('confirm', 'dialog', true)).stack;
    s = openLayer(s, L('help', 'popover', false)).stack;
    expect(escapeTarget(s)).toBe('help');
    const r = closeLayer(s, 'confirm', 'escape');
    expect(r).toEqual({ stack: { layers: [L('drawer', 'drawer', false)] }, returnFocusTo: 'confirm-origin', consent: false, closed: ['confirm', 'help'] });
    for (const how of ['escape', 'dismiss', 'outside', 'cancel'] as const) expect(closeLayer(s, 'confirm', how).consent).toBe(false);
    expect(closeLayer(s, 'confirm', 'commit').consent).toBe(true);
    expect(closeLayer(s, 'nope', 'commit')).toEqual({ stack: s, returnFocusTo: null, consent: false, closed: [] });
    expect(escapeTarget(emptyStack())).toBeNull();
  });
});

describe('deterministic focus', () => {
  it('Tab wraps inside a modal in both directions; nothing focusable keeps focus on the dialog', () => {
    expect(trapFocus(3, 2, false)).toBe(0); expect(trapFocus(3, 0, true)).toBe(2); expect(trapFocus(3, 1, false)).toBe(2);
    expect(trapFocus(3, -1, false)).toBe(0); expect(trapFocus(3, -1, true)).toBe(2); expect(trapFocus(0, 0, false)).toBe(-1);
  });
  it('initial focus: the declared target, else the heading — never the destructive action', () => {
    expect(initialFocus([{ id: 'del', role: 'destructive' }, { id: 'h', role: 'heading' }, { id: 't', role: 'target' }])).toBe('t');
    expect(initialFocus([{ id: 'del', role: 'destructive' }, { id: 'h', role: 'heading' }])).toBe('h');
    expect(initialFocus([{ id: 'del', role: 'destructive' }])).toBeNull();
  });
});

describe('a draft survives a dismissal; a commit or a discard clears it', () => {
  it('escape keeps the pending change for re-open; commit and discard clear; an empty change is not kept', () => {
    let d = onLayerClosed(emptyDrafts(), 'note', 'escape', { reason: 'half-typed' }, '2026-10-17T10:00:00Z');
    expect(restoreDraft(d, 'note')).toEqual({ value: { reason: 'half-typed' }, savedAt: '2026-10-17T10:00:00Z' });
    d = onLayerClosed(d, 'note', 'commit', { reason: 'done' }, 'x'); expect(restoreDraft(d, 'note')).toBeNull();
    d = onLayerClosed(d, 'note', 'outside', 'abc', 'y'); expect(restoreDraft(d, 'note')?.value).toBe('abc');
    d = onLayerClosed(d, 'note', 'discard', 'abc', 'z'); expect(restoreDraft(d, 'note')).toBeNull();
    expect(restoreDraft(onLayerClosed(emptyDrafts(), 'n', 'escape', '', 'x'), 'n')).toBeNull();
  });
});

describe('the consequential dialog: the full digest, a deliberate action, a changed digest resets', () => {
  const fields = [{ term: 'Action', value: 'suspend' }, { term: 'Items', value: '3' }, { term: 'Reason', value: 'drill' }];
  it('enabled only with every required field, the shown digest current, and THIS digest acknowledged', () => {
    expect(consequenceGate({ shownDigest: 'd1', currentDigest: 'd1', acknowledged: true, fields })).toEqual({ enabled: true, reasons: [] });
    expect(consequenceGate({ shownDigest: 'd1', currentDigest: 'd1', acknowledged: false, fields }).reasons).toEqual(['acknowledge the digest above to enable the action']);
    expect(consequenceGate({ shownDigest: 'd1', currentDigest: 'd2', acknowledged: true, fields }).reasons).toEqual(['the digest changed while this dialog was open — review the new digest']);
    expect(consequenceGate({ shownDigest: 'd', currentDigest: 'd', acknowledged: true, fields: [...fields, { term: 'Scope', value: ' ' }] }).reasons).toEqual(['Scope is missing from the digest — the action cannot be reviewed']);
    expect(consequenceGate({ shownDigest: 'd', currentDigest: 'd', acknowledged: true, fields: [{ term: 'Note', value: null, required: false }] }).enabled).toBe(true);
  });
  it('a digest change voids the acknowledgement; the same digest keeps it', () => {
    const s = { shownDigest: 'd1', currentDigest: 'd1', acknowledged: true, fields };
    expect(onDigestChange(s, 'd1')).toBe(s);
    expect(onDigestChange(s, 'd2')).toEqual({ ...s, currentDigest: 'd2', acknowledged: false });
  });
  it('a digest value is shown whole; absence is stated', () => {
    const long = '0190f2c4-7b1e-7d3a-9c2f-5e8a1b2c3d4e@sha256:' + 'a'.repeat(64);
    expect(digestValue(long)).toBe(long); expect(digestValue('')).toBe('not stated'); expect(digestValue(null)).toBe('not stated');
  });
});

describe('progressive disclosure never hides authority or uncertainty (PAT-27); surfaces and dividers', () => {
  it('the always-visible summary carries both; absence is stated, never omitted', () => {
    expect(disclosureSummary({ title: 'Method', authority: 'Observational — IMF PortWatch', uncertainty: '±12 % (80 % interval)' }))
      .toEqual({ title: 'Method', authority: 'Observational — IMF PortWatch', uncertainty: '±12 % (80 % interval)' });
    expect(disclosureSummary({ title: 'Method', authority: '', uncertainty: undefined })).toEqual({ title: 'Method', authority: 'not stated', uncertainty: 'not stated' });
  });
  it('toggle ARIA; a surface carries a border cue class with its elevation; a labelled divider is a separator', () => {
    expect(toggleAria(true, 'p1', 'dialog')).toEqual({ 'aria-expanded': 'true', 'aria-controls': 'p1', 'aria-haspopup': 'dialog' });
    expect(toggleAria(false, 'p1')).toEqual({ 'aria-expanded': 'false', 'aria-controls': 'p1' });
    expect(surfaceClasses('raised')).toBe('eye-surface eye-surface--raised');
    expect(surfaceClasses('overlay', 'critical')).toBe('eye-surface eye-surface--overlay eye-surface--critical');
    expect(dividerAria('vertical', true)).toEqual({ role: 'separator', 'aria-orientation': 'vertical' });
    expect(dividerAria('horizontal', false)).toEqual({ role: 'presentation' });
  });
});
