/**
 * B80 §CL-F (F-P7-E-05: UX-24-001..005, CMP-065..069) — THE FEEDBACK CONTRACT as pure functions: a command's lifecycle from its start to the
 * server's answer, progress tied to the server's own counts, latency bands, timeouts, duplicate and stale responses, retry and cancellation,
 * the toast policy, motion under reduced-motion, the inline-message tones and the empty state. components/feedback.tsx renders these.
 *
 *   NOTHING IS SHOWN DONE BEFORE IT IS (UX-24-004, UX-ADR-017). A command is `pending` until the server answers; `confirmed` only from an
 *   authoritative receipt; `refused` in the server's own words. A lost answer — the network failed, the wait timed out, the gateway gave up
 *   — is `unknown`: the request MAY have been recorded, so the last confirmed state is shown, the command's identifier is kept, and the
 *   safe next step is to CHECK before retrying (UX-24-005). "unknown" is never worded as success, and a toast never carries a consequential
 *   outcome. The universal idempotent command identity (one key replayed safely by the server for every act) is F-R0-02 at B100 — until
 *   then a retry after `unknown` of an act without its own idempotency key is offered only as "check first" (UX-24-003's named residue).
 */
import type { ApiResult } from './api';

/* ───────────────────────── the command lifecycle ───────────────────────── */

export type CommandPhase = 'idle' | 'pending' | 'confirmed' | 'refused' | 'unknown' | 'abandoned';
export interface CommandState {
  /** the client's identifier for this attempt — kept through unknown outcomes so the person can quote it */ commandId: string | null;
  phase: CommandPhase; startedAt: number | null; settledAt: number | null;
  /** the last state the SERVER confirmed (a receipt's words), kept while a newer command is pending or unknown */ lastConfirmed: string | null;
  error: { code: string; message: string; correlationId: string } | null;
  unknownBecause: 'network' | 'timeout' | 'gateway' | null;
  attempts: number;
}
export const IDLE: CommandState = { commandId: null, phase: 'idle', startedAt: null, settledAt: null, lastConfirmed: null, error: null, unknownBecause: null, attempts: 0 };

/** Start a command: pending, a NEW identifier, the last confirmed state kept. A second start while pending is refused (no double submit). */
export function start(s: CommandState, commandId: string, now: number): { state: CommandState; started: boolean } {
  if (s.phase === 'pending') return { state: s, started: false };
  return { state: { ...s, commandId, phase: 'pending', startedAt: now, settledAt: null, error: null, unknownBecause: null, attempts: s.attempts + 1 }, started: true };
}
/** A status the API answers when it could not tell whether the act happened (the request may have reached the database). */
const UNKNOWN_STATUSES = new Set([0, 502, 503, 504]);
/**
 * Settle a command with the server's answer. A response for ANOTHER command id (a stale or duplicate answer) changes nothing; a second
 * answer for a command already settled changes nothing (the first authoritative answer stands). `receiptText` words the receipt.
 */
export function settle<T>(s: CommandState, commandId: string, r: Pick<ApiResult<T>, 'ok' | 'status' | 'error'>, now: number, receiptText: string | null): CommandState {
  if (s.commandId !== commandId || s.phase !== 'pending') return s;
  if (r.ok) return { ...s, phase: 'confirmed', settledAt: now, lastConfirmed: receiptText ?? s.lastConfirmed, error: null, unknownBecause: null };
  const error = r.error === undefined ? { code: 'EYE-INT-001', message: 'no answer', correlationId: '' } : { code: r.error.code, message: r.error.message, correlationId: r.error.correlationId };
  if (UNKNOWN_STATUSES.has(r.status)) return { ...s, phase: 'unknown', settledAt: now, error, unknownBecause: r.status === 0 ? 'network' : 'gateway' };
  return { ...s, phase: 'refused', settledAt: now, error, unknownBecause: null };
}
/** The client stopped waiting (timeout): the outcome is UNKNOWN, never failed and never done; a late answer may still settle it. */
export function timeout(s: CommandState, now: number, timeoutMs: number): CommandState {
  if (s.phase !== 'pending' || s.startedAt === null || now - s.startedAt < timeoutMs) return s;
  return { ...s, phase: 'unknown', settledAt: now, unknownBecause: 'timeout' };
}
/** A late answer after a client timeout settles the command if it is the same command (the server's answer outranks the timeout). */
export function lateAnswer<T>(s: CommandState, commandId: string, r: Pick<ApiResult<T>, 'ok' | 'status' | 'error'>, now: number, receiptText: string | null): CommandState {
  if (s.commandId !== commandId || !(s.phase === 'unknown' && s.unknownBecause === 'timeout')) return s;
  return settle({ ...s, phase: 'pending' }, commandId, r, now, receiptText);
}
/** The person stops waiting on the client. Nothing is claimed about the server: abandoning never says "cancelled". */
export function abandon(s: CommandState, now: number): CommandState {
  return s.phase === 'pending' ? { ...s, phase: 'abandoned', settledAt: now } : s;
}

export type LatencyBand = 'instant' | 'short' | 'long' | 'extended';
/** Latency bands (UX-24-006): < 100 ms nothing extra; < 1 s the pending label; < 10 s a progress indicator with the elapsed time; beyond, the
 *  wait is named and the person may stop waiting or check the status. */
export function latencyBand(ms: number): LatencyBand { return ms < 100 ? 'instant' : ms < 1000 ? 'short' : ms < 10000 ? 'long' : 'extended'; }
export function pendingText(s: CommandState, now: number, verb: string): string {
  if (s.phase !== 'pending' || s.startedAt === null) return '';
  const ms = now - s.startedAt; const band = latencyBand(ms);
  if (band === 'instant' || band === 'short') return `${verb}…`;
  const sec = Math.floor(ms / 1000);
  return band === 'long' ? `${verb}… ${sec} s` : `${verb}… ${sec} s — still waiting for the server; nothing is confirmed until it answers`;
}

/** The outcome in words (CMP-065's tone with it). "unknown" is never success. */
export function outcomeText(s: CommandState): { tone: MessageTone; title: string; body: string } | null {
  switch (s.phase) {
    case 'idle': case 'pending': return null;
    case 'confirmed': return { tone: 'success', title: 'Confirmed by the server', body: s.lastConfirmed ?? 'the server recorded it' };
    case 'refused': return { tone: 'critical', title: `Refused — ${s.error?.code ?? ''}`.trim(), body: s.error?.message ?? 'the server refused the request' };
    case 'abandoned': return { tone: 'unknown', title: 'You stopped waiting — the outcome is UNKNOWN', body: `The request may still be recorded. Check its status before trying again${s.commandId ? ` (command ${s.commandId.slice(0, 8)}…)` : ''}.` };
    case 'unknown': {
      const why = s.unknownBecause === 'timeout' ? 'no answer arrived in time' : s.unknownBecause === 'network' ? 'the connection failed before an answer arrived' : 'the gateway could not say what happened';
      return { tone: 'unknown', title: 'Outcome UNKNOWN — not confirmed, not refused', body: `${why}. The request may have been recorded. ${s.lastConfirmed !== null ? `Last confirmed: ${s.lastConfirmed}. ` : ''}Check its status before trying again${s.commandId ? ` (command ${s.commandId.slice(0, 8)}…)` : ''}.` };
    }
  }
}

/** Retry (UX-24-003/-005): a refusal is corrected, not repeated; an unknown outcome is CHECKED first unless the act is idempotent by its own key. */
export function retryAdvice(s: CommandState, o: { idempotentKey: boolean }): { offer: 'none' | 'retry' | 'check_first' | 'correct' | 'reload'; text: string } {
  if (s.phase === 'refused') {
    const st = s.error?.code ?? '';
    if (/STA_002|409/.test(st)) return { offer: 'reload', text: 'The record changed or is in another state — reload it, then decide again.' };
    return { offer: 'correct', text: 'Correct what the server named, then submit again.' };
  }
  if (s.phase === 'unknown' || s.phase === 'abandoned') {
    return o.idempotentKey
      ? { offer: 'retry', text: 'Retrying is safe: the server answers the same request key with the record it already holds.' }
      : { offer: 'check_first', text: 'Check whether it was recorded before trying again — a blind retry could act twice.' };
  }
  return { offer: 'none', text: '' };
}

/* ───────────────────────── progress tied to backend state (CMP-067) ───────────────────────── */

export interface ServerProgress { state: 'queued' | 'running' | 'paused' | 'finished' | 'failed' | 'cancelled'; done: number | null; total: number | null; updatedAt: string | null }
/**
 * The indicator shows ONLY the server's counts: determinate when the server gave done/total, indeterminate otherwise — never a fabricated
 * percentage. Progress older than `staleAfterMs` is STALE: it is said to have stopped updating, and the indicator stops moving.
 */
export function progressView(p: ServerProgress, now: number, staleAfterMs = 30000): { determinate: boolean; value: number | null; max: number | null; percent: number | null; stale: boolean; label: string; terminal: boolean } {
  const determinate = p.done !== null && p.total !== null && p.total > 0;
  const percent = determinate ? Math.min(100, Math.floor((p.done! / p.total!) * 100)) : null;
  const age = p.updatedAt === null ? null : now - new Date(p.updatedAt).getTime();
  const terminal = ['finished', 'failed', 'cancelled'].includes(p.state);
  const stale = !terminal && age !== null && age > staleAfterMs;
  const counts = determinate ? `${p.done} of ${p.total}` : p.done !== null ? `${p.done} so far (total not known)` : 'no count reported';
  const state = p.state === 'finished' ? 'FINISHED' : p.state === 'failed' ? 'FAILED' : p.state === 'cancelled' ? 'CANCELLED' : p.state === 'paused' ? 'PAUSED' : p.state === 'queued' ? 'QUEUED' : 'RUNNING';
  const label = `${state} — ${counts}${stale ? ` — STALE: no update for ${Math.round((age ?? 0) / 1000)} s; progress may have stopped` : ''}`;
  return { determinate, value: determinate ? p.done : null, max: determinate ? p.total : null, percent, stale, label, terminal };
}

/* ───────────────────────── toasts, optimism, motion ───────────────────────── */

/** The classes of consequential state no toast and no optimistic presentation may carry (UX-24-004). */
export const CONSEQUENTIAL_CLASSES = ['approval', 'publication', 'security', 'policy', 'payment', 'deletion', 'submission', 'commitment', 'certification', 'signature', 'access'] as const;
export type ToastKind = 'status' | (typeof CONSEQUENTIAL_CLASSES)[number];
/** CMP-066: a toast is for NON-consequential status only (a draft saved, a copy made, a filter applied) — a consequential outcome is shown
 *  where the act was made, with its receipt, and stays until the person moves on. */
export function toastAllowed(kind: ToastKind): { allowed: boolean; reason: string } {
  return kind === 'status' ? { allowed: true, reason: 'non-consequential status' }
    : { allowed: false, reason: `a ${kind} outcome is shown in place with its receipt, never in a transient toast` };
}
/** Optimistic presentation (showing an outcome before the receipt) is never allowed for a consequential class, and this library offers none at all. */
export const mayPresentBeforeReceipt = (_kind: ToastKind): false => false;
/** A toast's dwell (non-consequential status only): long enough to read (≥ 6 s, plus reading time); paused while hovered or focused (the component). */
export const toastDwellMs = (text: string): number => Math.max(6000, 6000 + Math.ceil([...text].length / 20) * 1000);

export type MotionToken = 'instant' | 'fast' | 'standard' | 'layout' | 'deliberate' | 'max';
export const MOTION_MS: Readonly<Record<MotionToken, number>> = { instant: 0, fast: 80, standard: 140, layout: 220, deliberate: 320, max: 480 };
/** A transition's duration: 0 under reduced motion, and ALWAYS 0 for a consequential state change (motion.instant — UX-ADR-017). */
export function motionMs(token: MotionToken, o: { reducedMotion: boolean; consequential: boolean }): number {
  return o.reducedMotion || o.consequential ? 0 : MOTION_MS[token];
}

/* ───────────────────────── inline messages (CMP-065) ───────────────────────── */

export type MessageTone = 'info' | 'success' | 'warning' | 'critical' | 'unknown';
/** Each tone: glyph + UPPERCASE word + token colour (never colour alone) and its live-region role (a critical message interrupts). */
export const TONES: Readonly<Record<MessageTone, { glyph: string; word: string; role: 'status' | 'alert'; className: string }>> = {
  info: { glyph: 'ℹ', word: 'NOTE', role: 'status', className: 'eye-message eye-message--info' },
  success: { glyph: '✓', word: 'CONFIRMED', role: 'status', className: 'eye-message eye-message--success' },
  warning: { glyph: '⚠', word: 'WARNING', role: 'status', className: 'eye-message eye-message--warning' },
  critical: { glyph: '✕', word: 'PROBLEM', role: 'alert', className: 'eye-message eye-message--critical' },
  unknown: { glyph: '◍', word: 'UNKNOWN', role: 'status', className: 'eye-message eye-message--unknown' },
};
/** A success tone is only for what the server confirmed: asked for a success without a receipt, the tone falls back to info. */
export const toneFor = (tone: MessageTone, hasReceipt: boolean): MessageTone => (tone === 'success' && !hasReceipt ? 'info' : tone);

/* ───────────────────────── the empty state (CMP-069, PAT-28) ───────────────────────── */

export type EmptyEvidence = 'none_recorded' | 'filtered' | 'not_permitted' | 'unavailable' | 'not_collected' | 'loading';
export interface EmptyContext { what: string; scope: string; evidence: EmptyEvidence; hiddenByFilter?: number; permission?: string | null; reason?: string | null; nextStep?: string | null }
/**
 * An empty list NEVER implies an empty world (PAT-28): it says what was looked for, in which scope, WHY nothing is shown (none recorded here,
 * hidden by the filter, outside the reader's permission, the source unavailable, not collected yet), and a safe next step.
 */
export function emptyStateText(c: EmptyContext): { title: string; body: string; next: string | null } {
  const where = `in ${c.scope}`;
  switch (c.evidence) {
    case 'none_recorded': return { title: `No ${c.what} recorded ${where}`, body: `Nothing is recorded ${where} that you can read. That says what this system holds, not what exists in the world.`, next: c.nextStep ?? null };
    case 'filtered': return { title: `No ${c.what} match the filter`, body: `${c.hiddenByFilter ?? 'Some'} ${c.what} ${where} are hidden by the current filter.`, next: c.nextStep ?? 'Clear the filter to see them.' };
    case 'not_permitted': return { title: `${c.what} ${where} are outside your access`, body: `Your roles do not include ${c.permission ?? 'the permission this list needs'}; records may exist that you cannot see.`, next: c.nextStep ?? 'Ask an administrator of this domain if you need them.' };
    case 'unavailable': return { title: `${c.what} could not be read`, body: `The read failed${c.reason ? `: ${c.reason}` : ''}. This is not an empty result — nothing is known about what exists.`, next: c.nextStep ?? 'Try again; if it persists, the degraded banner names the dependency.' };
    case 'not_collected': return { title: `No ${c.what} collected yet ${where}`, body: `Collection has not produced ${c.what} ${where} yet${c.reason ? ` (${c.reason})` : ''}.`, next: c.nextStep ?? null };
    case 'loading': return { title: `Reading ${c.what}…`, body: 'Nothing is shown until the server answers.', next: null };
  }
}
