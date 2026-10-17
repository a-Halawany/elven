'use client';
/**
 * THE FEEDBACK COMPONENTS — B80 §CL-F (F-P7-E-05: CMP-065 InlineMessage, CMP-066 Toast, CMP-067 ProgressIndicator, CMP-068 Skeleton,
 * CMP-069 EmptyState; UX-24-001..005). Each renders what lib/feedback-b80.ts decides.
 *
 *   · A tone is a glyph + an UPPERCASE word + a token colour — never colour alone; a CRITICAL message is an alert, the others a status.
 *     "Success" is only ever the server's: without a receipt the tone falls back to a note (ErrorNote and Receipt in ui.tsx stay the
 *     carriers of a refusal and a receipt — B107's pattern keys).
 *   · A TOAST carries NON-consequential status only (a draft saved, a copy made); a consequential outcome is shown in place with its
 *     receipt and stays. A toast pauses while hovered or focused and can always be dismissed.
 *   · PROGRESS shows only the server's counts — determinate when it gave them, indeterminate otherwise, STALE when it stopped updating.
 *   · A SKELETON stands only for content not yet read; an EMPTY STATE never implies an empty world (scope, why, the safe next step).
 *   · Motion uses the motion tokens and collapses under prefers-reduced-motion (globals.css); a consequential change is instant.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TONES, emptyStateText, progressView, toastAllowed, toastDwellMs, toneFor, type EmptyContext, type MessageTone, type ServerProgress, type ToastKind } from '../lib/feedback-b80';

/** CMP-065 — an inline message (info · success · warning · critical · unknown). */
export function InlineMessage({ tone, title, children, hasReceipt }: { tone: MessageTone; title?: string; children?: ReactNode; hasReceipt?: boolean }) {
  const t = TONES[toneFor(tone, hasReceipt ?? tone !== 'success')];
  return (
    <div role={t.role} className={t.className}>
      <strong>{t.glyph} {t.word}</strong>{title !== undefined && title !== '' ? <> — <strong>{title}</strong></> : null}
      {children !== undefined && children !== null && <div>{children}</div>}
    </div>
  );
}

export interface ToastMessage { id: string; text: string; kind: ToastKind }
/** CMP-066 — the toast region (role=status, polite). A consequential kind is refused: it is not rendered (toastAllowed) — its outcome belongs in place, with its receipt. */
export function Toast({ messages, onDismiss }: { messages: readonly ToastMessage[]; onDismiss: (id: string) => void }) {
  const allowed = messages.filter((m) => toastAllowed(m.kind).allowed);
  return (
    <div className="eye-toast-region" role="status" aria-live="polite">
      {allowed.map((m) => <ToastItem key={m.id} m={m} onDismiss={onDismiss} />)}
    </div>
  );
}
function ToastItem({ m, onDismiss }: { m: ToastMessage; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (paused) return undefined;
    timer.current = setTimeout(() => onDismiss(m.id), toastDwellMs(m.text));
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [paused, m.id, m.text, onDismiss]);
  return (
    <div className="eye-toast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span>ℹ {m.text}</span>
      <button type="button" className="eye-button eye-button--quiet eye-button--sm" onClick={() => onDismiss(m.id)}>Dismiss</button>
    </div>
  );
}

/** CMP-067 — progress tied to the server's own state (counts it reported; stale when it stopped updating). */
export function ProgressIndicator({ label, progress, now, staleAfterMs }: { label: string; progress: ServerProgress; now: number; staleAfterMs?: number }) {
  const v = progressView(progress, now, staleAfterMs);
  return (
    <div className={v.stale ? 'eye-progress eye-progress--stale' : 'eye-progress'}>
      <span>{label}: {v.label}</span>
      {!v.terminal && (v.determinate && v.max !== null && v.value !== null
        ? <progress aria-label={label} max={v.max} value={v.value} aria-valuetext={v.label} />
        : <progress aria-label={label} aria-valuetext={v.label} />)}
    </div>
  );
}

/** CMP-068 — a skeleton for content NOT YET READ (never laid over confirmed data); announced as reading. */
export function Skeleton({ label, lines }: { label: string; lines?: number }) {
  return (
    <div className="eye-skeleton" role="status" aria-busy="true">
      <span className="eye-visually-hidden">Reading {label}…</span>
      {Array.from({ length: lines ?? 3 }, (_, i) => <span key={i} aria-hidden="true" />)}
    </div>
  );
}

/** CMP-069 / PAT-28 — the empty state: what was looked for, where, WHY nothing is shown, and a safe next step. */
export function EmptyState({ context, action }: { context: EmptyContext; action?: ReactNode }) {
  const t = emptyStateText(context);
  return (
    <section className="eye-empty" aria-label={t.title}>
      <h3>{t.title}</h3>
      <p className="eye-help">{t.body}</p>
      {t.next !== null && <p>{t.next}</p>}
      {action}
    </section>
  );
}
