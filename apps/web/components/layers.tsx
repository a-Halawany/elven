'use client';
/**
 * CP-6 B80 §CL-D — THE LAYERS of the shared library (F-P7-E-05: UX-23-001…-005, PAT-27, CMP-002, CMP-004): Surface, Divider, Panel, Drawer,
 * Dialog, Popover, Disclosure. The behaviour is `lib/layers-b80.ts` (pure, tested); this file renders it:
 *
 *  - Dialog is the NATIVE `<dialog>` opened with showModal(): the browser makes the page inert, Escape fires `cancel`, the backdrop is the
 *    platform's. Tab cycles inside it; it opens on its declared initial target (else its heading) and closing returns focus to the ORIGIN.
 *    One blocking dialog at a time: a second one is refused in place, with its reason.
 *  - DISMISSAL IS NEVER CONSENT: Escape, the close button and a click on the backdrop each report `consent: false`. A consequential dialog shows
 *    its FULL digest and enables its deliberate action (a GovernedButton — pending until the server answers, no optimistic path) only while
 *    the digest shown is current and acknowledged; a digest change resets the acknowledgement.
 *  - Drawer is a SUPPORTING layer (non-modal `<dialog>` at the inline end — it mirrors under RTL); Popover is a supporting region bound to its
 *    trigger; Disclosure is the native `<details>` whose always-visible summary carries the AUTHORITY and the UNCERTAINTY (required props).
 *  - Surface and Panel carry elevation by token AND a border (shadows vanish in forced colours and print; the border stays).
 *
 * Styling: classes in app/globals.css (the B80 cld block) on semantic tokens only — no colour literal (B107's lint). CONSTRUCTION only.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GovernedButton } from './observation';
import {
  closeLayer, consequenceGate, digestValue, disclosureSummary, dividerAria, emptyStack, openLayer, surfaceClasses, toggleAria, trapFocus,
  type CloseHow, type DigestField, type LayerStack, type SurfaceLevel, type SurfaceState,
} from '../lib/layers-b80';

/* ── the page's layer stack (one per document; the pure model decides) ── */
let STACK: LayerStack = emptyStack();
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

/** The focusable elements OF THIS LAYER: rendered (has a box), not inert, not inside a nested closed layer. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) =>
    !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0 && el.closest('dialog') === root);
}
function returnFocus(originId: string | null, origin: HTMLElement | null): void {
  const el = origin !== null && origin.isConnected ? origin : originId !== null ? document.getElementById(originId) : null;
  if (el !== null) el.focus();
}

/* ───────────────────────── Surface, Divider, Panel ───────────────────────── */

export function Surface({ level = 'raised', state = 'rest', label, children, as = 'div' }: {
  level?: SurfaceLevel; state?: SurfaceState; /** a labelled surface is a region */ label?: string; children: ReactNode; as?: 'div' | 'section' | 'article';
}) {
  const Tag = as;
  return <Tag className={surfaceClasses(level, state)} aria-label={label} role={label !== undefined && as === 'div' ? 'region' : undefined}>{children}</Tag>;
}

export function Divider({ orientation = 'horizontal', label }: { orientation?: 'horizontal' | 'vertical'; /** names the groups it separates */ label?: string }) {
  const aria = dividerAria(orientation, label !== undefined);
  return (
    <div className={`eye-divider eye-divider--${orientation}`} {...aria} aria-label={label}>
      {label !== undefined && <span className="eye-divider-label" aria-hidden="true">{label}</span>}
    </div>
  );
}

/** A titled, labelled section (aria-labelledby its heading) with an optional actions slot. ui.tsx's Panel stays for the pages that use it. */
export function Panel({ title, level = 2, actions, children, state = 'rest' }: { title: string; level?: 2 | 3; actions?: ReactNode; children: ReactNode; state?: SurfaceState }) {
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className={`${surfaceClasses('raised', state)} eye-panel`} aria-labelledby={id}>
      <div className="eye-panel-head">
        <H id={id} className="eye-panel-title">{title}</H>
        {actions !== undefined && <div className="eye-panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── Dialog (blocking) ───────────────────────── */

export interface Consequence {
  /** every field of the digest, shown WHOLE; a missing required one disables the action and is named */ fields: DigestField[];
  /** the digest the command will carry */ digest: string;
  actionLabel: string; pendingLabel: string;
  variant?: 'primary' | 'critical';
  /** the governed act; resolves only on the server's answer (throw on refusal — the button restores itself) */ onConfirm: () => Promise<void>;
}
export type DialogClose = { how: CloseHow | 'refused'; consent: boolean };

export function Dialog({ open, title, description, onClose, children, consequence, initialFocusId, size = 'md' }: {
  open: boolean; title: string; description?: ReactNode;
  /** called on Escape, the close button, a backdrop click (consent: false) and after the deliberate action committed (consent: true) */
  onClose: (c: DialogClose) => void;
  children?: ReactNode; consequence?: Consequence; initialFocusId?: string; size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const layerId = useId(); const headingId = `${layerId}-h`; const descId = `${layerId}-d`;
  const [refused, setRefused] = useState<string | null>(null);
  /* the acknowledgement binds the DIGEST acknowledged: a digest change while open voids it (layers-b80 onDigestChange) and says so */
  const [ackDigest, setAckDigest] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current; if (d === null) return;
    if (open && !d.open) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const r = openLayer(STACK, { id: layerId, kind: 'dialog', modal: true, originId: active !== null && active.id !== '' ? active.id : null, title });
      if (!r.ok) { setRefused(r.reason); return; }
      STACK = r.stack; setRefused(null); origin.current = active;
      d.showModal();
      const target = (initialFocusId !== undefined ? d.querySelector<HTMLElement>(`#${CSS.escape(initialFocusId)}`) : null) ?? d.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`);
      target?.focus();
    } else if (!open && d.open) {
      d.close(); setAckDigest(null);
      const c = closeLayer(STACK, layerId, 'dismiss'); STACK = c.stack;
      returnFocus(c.returnFocusTo, origin.current);
    } else if (!open) setRefused(null);
  }, [open, layerId, title, initialFocusId, headingId]);
  useEffect(() => () => { STACK = closeLayer(STACK, layerId, 'dismiss').stack; }, [layerId]);

  const dismiss = useCallback((how: CloseHow) => onClose({ how, consent: false }), [onClose]);
  const ack = consequence !== undefined && ackDigest === consequence.digest;
  const gate = consequence === undefined ? null
    : consequenceGate({ shownDigest: ackDigest ?? consequence.digest, currentDigest: consequence.digest, acknowledged: ack || ackDigest !== null, fields: consequence.fields });
  const gateId = `${layerId}-gate`;

  return (
    <>
      {refused !== null && open && <p role="status" className="eye-layer-refused">The dialog “{title}” was not opened: {refused}.</p>}
      <dialog
        ref={ref}
        className={`eye-dialog eye-dialog--${size}`}
        aria-labelledby={headingId}
        aria-describedby={description !== undefined ? descId : undefined}
        onCancel={(e) => { e.preventDefault(); dismiss('escape'); }}
        onClick={(e) => { if (e.target === ref.current) dismiss('outside'); }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab' || ref.current === null) return;
          const els = focusables(ref.current);
          const i = els.indexOf(document.activeElement as HTMLElement);
          const n = trapFocus(els.length, i, e.shiftKey);
          if (n >= 0 && (i === -1 || (e.shiftKey ? i === 0 : i === els.length - 1))) { e.preventDefault(); els[n]!.focus(); }
        }}
      >
        <div className="eye-dialog-body">
          <div className="eye-dialog-head">
            <h2 id={headingId} tabIndex={-1} className="eye-dialog-title">{title}</h2>
            <button type="button" className="eye-dialog-close" onClick={() => dismiss('dismiss')} aria-label={`Close “${title}” without acting`}>✕</button>
          </div>
          {description !== undefined && <div id={descId} className="eye-dialog-desc">{description}</div>}
          {children}
          {consequence !== undefined && gate !== null && (
            <div className="eye-consequence">
              <dl className="eye-dl">
                {consequence.fields.map((f) => (
                  <div className="eye-dl-row" key={f.term}><dt>{f.term}</dt><dd><bdi className="eye-mono-wrap">{digestValue(f.value)}</bdi></dd></div>
                ))}
                <div className="eye-dl-row"><dt>Digest</dt><dd><bdi className="eye-mono-wrap">{consequence.digest}</bdi></dd></div>
              </dl>
              <label className="eye-cld-check">
                <input type="checkbox" checked={ack} onChange={(e) => setAckDigest(e.target.checked ? consequence.digest : null)} />
                I have reviewed this digest ({consequence.digest}). Closing this dialog is not consent.
              </label>
              {!gate.enabled && <ul id={gateId} className="eye-cld-reasons" aria-label="Why the action is not available">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              <div className="eye-dialog-foot">
                <button type="button" className="eye-cld-btn-quiet" onClick={() => dismiss('cancel')}>Cancel — do nothing</button>
                <span aria-describedby={gate.enabled ? undefined : gateId}>
                  <GovernedButton
                    label={consequence.actionLabel} pendingLabel={consequence.pendingLabel} variant={consequence.variant ?? 'primary'}
                    disabled={!gate.enabled}
                    onRun={async () => { await consequence.onConfirm(); onClose({ how: 'commit', consent: true }); }}
                  />
                </span>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

/* ───────────────────────── Drawer (supporting) ───────────────────────── */

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: (how: CloseHow) => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const layerId = useId(); const headingId = `${layerId}-h`;
  useEffect(() => {
    const d = ref.current; if (d === null) return;
    if (open && !d.open) {
      origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      STACK = openLayer(STACK, { id: layerId, kind: 'drawer', modal: false, originId: origin.current?.id ?? null, title }).stack;
      d.show();
      d.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`)?.focus();
    } else if (!open && d.open) {
      d.close();
      const c = closeLayer(STACK, layerId, 'dismiss'); STACK = c.stack;
      returnFocus(c.returnFocusTo, origin.current);
    }
  }, [open, layerId, title, headingId]);
  useEffect(() => () => { STACK = closeLayer(STACK, layerId, 'dismiss').stack; }, [layerId]);
  return (
    <dialog ref={ref} className="eye-drawer" aria-labelledby={headingId} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose('escape'); } }}>
      <div className="eye-dialog-head">
        <h2 id={headingId} tabIndex={-1} className="eye-dialog-title">{title}</h2>
        <button type="button" className="eye-dialog-close" onClick={() => onClose('dismiss')} aria-label={`Close the “${title}” drawer`}>✕</button>
      </div>
      {children}
    </dialog>
  );
}

/* ───────────────────────── Popover (supporting, bound to its trigger) ───────────────────────── */

export function Popover({ label, triggerLabel, children }: { /** the popover's accessible name */ label: string; triggerLabel: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId(); const panelId = `${id}-p`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    STACK = openLayer(STACK, { id, kind: 'popover', modal: false, originId: null, title: label }).stack;
    panel.current?.focus();
    const outside = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', outside);
    return () => { document.removeEventListener('mousedown', outside); STACK = closeLayer(STACK, id, 'dismiss').stack; };
  }, [open, id, label, close]);
  return (
    <span className="eye-popover-anchor">
      <button ref={trigger} type="button" className="eye-cld-btn-quiet" {...toggleAria(open, panelId, 'dialog')} onClick={() => setOpen((o) => !o)}>{triggerLabel}</button>
      {open && (
        <div ref={panel} id={panelId} role="dialog" aria-label={label} tabIndex={-1} className="eye-popover"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }}>
          {children}
        </div>
      )}
    </span>
  );
}

/* ───────────────────────── Disclosure (PAT-27) ───────────────────────── */

/**
 * Progressive disclosure that CANNOT hide authority or uncertainty: both are required props and both render in the always-visible summary
 * (stated "not stated" when absent). Only the secondary detail is deferred.
 */
export function Disclosure({ title, authority, uncertainty, children, defaultOpen = false, onToggle }: {
  title: string; authority: string | null; uncertainty: string | null; children: ReactNode; defaultOpen?: boolean; onToggle?: (open: boolean) => void;
}) {
  const s = disclosureSummary({ title, authority, uncertainty });
  return (
    <details className="eye-disclosure" open={defaultOpen} onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="eye-disclosure-title">{s.title}</span>
        <span className="eye-disclosure-meta">Authority: {s.authority}</span>
        <span className="eye-disclosure-meta">Uncertainty: {s.uncertainty}</span>
      </summary>
      <div className="eye-disclosure-body">{children}</div>
    </details>
  );
}
