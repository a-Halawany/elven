/**
 * CP-6 B80 §CL-D (F-P7-E-05: UX-23-001…-006, PAT-27) — LAYERS as pure functions: panels, drawers, popovers, dialogs and progressive
 * disclosure. `components/layers.tsx` renders them on the native `<dialog>` (the browser's own modality, inert background and Escape) and
 * follows exactly this model:
 *
 *  - ONE MODAL AT A TIME: opening a blocking layer while another is open is refused with its reason (no nested-modal ambiguity); supporting
 *    layers (a drawer, a popover) may sit on top of the page or inside a modal, never above a second modal;
 *  - DETERMINISTIC FOCUS: a layer opens on its declared initial target (else its heading), Tab cycles inside a modal, and closing returns focus
 *    to the ORIGIN that opened it (or says it could not, when the origin left the page);
 *  - DISMISSAL IS NEVER CONSENT: Escape, the close button, a click outside — each closes with `consent: false`; only the deliberate action
 *    commits; a pending change (a draft) survives a dismissal and is offered back on re-open;
 *  - A CONSEQUENTIAL dialog shows the FULL digest (every required field present, nothing truncated) and enables its deliberate action only
 *    while the digest it shows is the digest the command will carry — a change resets the acknowledgement;
 *  - DISCLOSURE never hides authority or uncertainty: both are part of the always-visible summary (stated as "not stated" when absent).
 *
 * CONSTRUCTION only.
 */
export type LayerKind = 'dialog' | 'drawer' | 'popover' | 'panel';
export interface Layer { id: string; kind: LayerKind; modal: boolean; originId: string | null; title: string }
export interface LayerStack { layers: Layer[] }
export const emptyStack = (): LayerStack => ({ layers: [] });

export type OpenResult = { ok: true; stack: LayerStack } | { ok: false; stack: LayerStack; reason: string };
export function openLayer(stack: LayerStack, layer: Layer): OpenResult {
  if (stack.layers.some((l) => l.id === layer.id)) return { ok: true, stack };
  const modal = stack.layers.find((l) => l.modal);
  if (layer.modal && modal !== undefined) {
    return { ok: false, stack, reason: `“${modal.title}” is open — finish or close it first (one blocking dialog at a time)` };
  }
  if (layer.kind === 'dialog' && !layer.modal) return { ok: false, stack, reason: 'a dialog is blocking by definition — use a drawer or a panel for supporting content' };
  return { ok: true, stack: { layers: [...stack.layers, layer] } };
}

export type CloseHow = 'escape' | 'dismiss' | 'outside' | 'cancel' | 'commit';
export interface CloseResult { stack: LayerStack; returnFocusTo: string | null; consent: boolean; closed: string[] }
/**
 * Close a layer — and every layer opened ABOVE it (a popover inside a dialog closes with the dialog). Focus returns to the closed layer's
 * origin. Only `commit` is consent.
 */
export function closeLayer(stack: LayerStack, id: string, how: CloseHow): CloseResult {
  const i = stack.layers.findIndex((l) => l.id === id);
  if (i < 0) return { stack, returnFocusTo: null, consent: false, closed: [] };
  const closed = stack.layers.slice(i).map((l) => l.id);
  return { stack: { layers: stack.layers.slice(0, i) }, returnFocusTo: stack.layers[i]!.originId, consent: how === 'commit', closed };
}
/** Escape closes the TOPMOST layer only. */
export function escapeTarget(stack: LayerStack): string | null { return stack.layers.length === 0 ? null : stack.layers[stack.layers.length - 1]!.id; }

/** The Tab cycle inside a modal: wraps at both ends; with nothing focusable the dialog itself keeps focus (-1). */
export function trapFocus(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/** The initial focus: the declared target if it exists, else the heading — never the destructive action. */
export function initialFocus(candidates: ReadonlyArray<{ id: string; role: 'target' | 'heading' | 'destructive' | 'control' }>): string | null {
  return candidates.find((c) => c.role === 'target')?.id ?? candidates.find((c) => c.role === 'heading')?.id ?? candidates.find((c) => c.role === 'control')?.id ?? null;
}

/* ───────────────────────── drafts held across dismissal ───────────────────────── */

export interface DraftStore { drafts: Record<string, { value: unknown; savedAt: string }> }
export const emptyDrafts = (): DraftStore => ({ drafts: {} });
/** A dismissal with a pending change KEEPS the change (keyed by the layer); a commit or an explicit discard clears it. */
export function onLayerClosed(store: DraftStore, layerId: string, how: CloseHow | 'discard', pending: unknown, at: string): DraftStore {
  const next = { drafts: { ...store.drafts } };
  if (how === 'commit' || how === 'discard') { delete next.drafts[layerId]; return next; }
  if (pending !== undefined && pending !== null && pending !== '') next.drafts[layerId] = { value: pending, savedAt: at };
  return next;
}
export function restoreDraft(store: DraftStore, layerId: string): { value: unknown; savedAt: string } | null { return store.drafts[layerId] ?? null; }

/* ───────────────────────── the consequential dialog ───────────────────────── */

export interface DigestField { term: string; value: string | null | undefined; required?: boolean }
export interface ConsequenceState { shownDigest: string; currentDigest: string; acknowledged: boolean; fields: readonly DigestField[] }
/**
 * Is the deliberate action enabled? Only when every REQUIRED field of the digest is present (a missing one is named), the digest shown is the
 * digest the command will carry, and the principal acknowledged THIS digest.
 */
export function consequenceGate(s: ConsequenceState): { enabled: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const f of s.fields) if (f.required !== false && (f.value === null || f.value === undefined || String(f.value).trim() === '')) reasons.push(`${f.term} is missing from the digest — the action cannot be reviewed`);
  if (s.shownDigest !== s.currentDigest) reasons.push('the digest changed while this dialog was open — review the new digest');
  if (!s.acknowledged) reasons.push('acknowledge the digest above to enable the action');
  return { enabled: reasons.length === 0, reasons };
}
/** When the digest the dialog shows changes, the acknowledgement is void. */
export function onDigestChange(s: ConsequenceState, nextDigest: string): ConsequenceState {
  return nextDigest === s.currentDigest ? s : { ...s, currentDigest: nextDigest, acknowledged: false };
}
/** A digest value is shown WHOLE: never sliced or ellipsised (an identifier that does not fit wraps). */
export function digestValue(v: string | null | undefined): string { return v === null || v === undefined || v === '' ? 'not stated' : v; }

/* ───────────────────────── progressive disclosure (PAT-27) ───────────────────────── */

/** The always-visible summary of a disclosure: its title AND the authority AND the uncertainty — absence stated, never omitted. */
export function disclosureSummary(p: { title: string; authority: string | null | undefined; uncertainty: string | null | undefined }): { title: string; authority: string; uncertainty: string } {
  const say = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === '' ? 'not stated' : v);
  return { title: p.title, authority: say(p.authority), uncertainty: say(p.uncertainty) };
}

/** The ARIA wiring of a toggle that shows or hides a region (popover, disclosure, drawer trigger). */
export function toggleAria(open: boolean, controls: string, popup: 'dialog' | 'menu' | 'true' | false = false): Record<string, string> {
  const a: Record<string, string> = { 'aria-expanded': open ? 'true' : 'false', 'aria-controls': controls };
  if (popup !== false) a['aria-haspopup'] = popup;
  return a;
}

/* ───────────────────────── surfaces and dividers (CMP-002, CMP-004) ───────────────────────── */

export type SurfaceLevel = 'base' | 'raised' | 'overlay';
export type SurfaceState = 'rest' | 'selected' | 'disabled' | 'critical' | 'degraded';
/**
 * The classes of a surface: elevation by token AND a border cue (a shadow alone disappears in forced colours and print — the border stays).
 * A state is carried by the border and a word in the content, never by the tint alone.
 */
export function surfaceClasses(level: SurfaceLevel, state: SurfaceState = 'rest'): string {
  return ['eye-surface', `eye-surface--${level}`, state === 'rest' ? '' : `eye-surface--${state}`].filter((c) => c !== '').join(' ');
}
/** A divider is presentational unless it separates labelled groups (then a separator with its orientation). */
export function dividerAria(orientation: 'horizontal' | 'vertical', labelled: boolean): Record<string, string> {
  return labelled ? { role: 'separator', 'aria-orientation': orientation } : { role: 'presentation' };
}
