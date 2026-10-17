import { describe, expect, it } from 'vitest';
import {
  IDLE, TONES, abandon, emptyStateText, lateAnswer, latencyBand, mayPresentBeforeReceipt, motionMs, outcomeText, pendingText, progressView,
  retryAdvice, settle, start, timeout, toastAllowed, toastDwellMs, toneFor, CONSEQUENTIAL_CLASSES,
} from './feedback-b80';

/** CP-6 B80 §CL-F — the feedback contract (UX-24-001..005, CMP-065..069). Every value here is SYNTHETIC. */
const ok = { ok: true, status: 200 } as const;
const refusedR = { ok: false, status: 409, error: { code: 'EYE_STA_002', message: 'form draft rejected (stale): your draft is at version 2', correlationId: 'c1', retry: 'no' } };
const lost = { ok: false, status: 0, error: { code: 'EYE-DEP-001', message: 'API unreachable', correlationId: 'c2', retry: 'yes' } };

describe('a command is pending until the server answers; nothing is shown done before it is (UX-24-004)', () => {
  it('start → pending with a new command id; a second start while pending is refused (no double submit)', () => {
    const a = start(IDLE, 'cmd-1', 1000);
    expect(a).toMatchObject({ started: true, state: { phase: 'pending', commandId: 'cmd-1', attempts: 1 } });
    expect(start(a.state, 'cmd-2', 1001)).toMatchObject({ started: false, state: { commandId: 'cmd-1' } });
  });
  it('confirmed only from the authoritative answer; refused in the server\'s own words', () => {
    const p = start(IDLE, 'cmd-1', 0).state;
    expect(settle(p, 'cmd-1', ok, 50, 'committed — POL 0190…')).toMatchObject({ phase: 'confirmed', lastConfirmed: 'committed — POL 0190…' });
    const r = settle(p, 'cmd-1', refusedR, 50, null);
    expect(r).toMatchObject({ phase: 'refused', error: { message: 'form draft rejected (stale): your draft is at version 2' } });
    expect(outcomeText(r)).toMatchObject({ tone: 'critical', body: 'form draft rejected (stale): your draft is at version 2' });
  });
  it('no optimistic presentation for any class, and none at all in this library', () => {
    for (const k of [...CONSEQUENTIAL_CLASSES, 'status' as const]) expect(mayPresentBeforeReceipt(k)).toBe(false);
  });
});

describe('an uncertain outcome is UNKNOWN — the last confirmed state kept, the command id kept, check before retrying (UX-24-005)', () => {
  it('a lost connection or a gateway failure is unknown, never success and never failure', () => {
    const p = { ...start({ ...IDLE, lastConfirmed: 'draft v2 saved' }, 'cmd-9', 0).state };
    const u = settle(p, 'cmd-9', lost, 10, null);
    expect(u).toMatchObject({ phase: 'unknown', unknownBecause: 'network', commandId: 'cmd-9', lastConfirmed: 'draft v2 saved' });
    const t = outcomeText(u)!;
    expect(t.tone).toBe('unknown');
    expect(t.title).toBe('Outcome UNKNOWN — not confirmed, not refused');
    expect(t.body).toMatch(/may have been recorded\. Last confirmed: draft v2 saved\. Check its status before trying again \(command cmd-9…\)/);
    expect(`${t.title} ${t.body}`).not.toMatch(/success|succeeded|done/i);
    expect(settle(p, 'cmd-9', { ok: false, status: 504, error: lost.error }, 10, null).unknownBecause).toBe('gateway');
  });
  it('a client timeout is unknown; a late answer for the SAME command still settles it; an answer for another command changes nothing', () => {
    const p = start(IDLE, 'cmd-3', 0).state;
    expect(timeout(p, 5000, 10000)).toBe(p);
    const t = timeout(p, 10000, 10000);
    expect(t).toMatchObject({ phase: 'unknown', unknownBecause: 'timeout' });
    expect(lateAnswer(t, 'cmd-other', ok, 12000, 'x')).toBe(t);
    expect(lateAnswer(t, 'cmd-3', ok, 12000, 'committed')).toMatchObject({ phase: 'confirmed', lastConfirmed: 'committed' });
  });
  it('a DUPLICATE answer (the command already settled) and a STALE answer (another command id) change nothing', () => {
    const p = start(IDLE, 'cmd-4', 0).state;
    const c = settle(p, 'cmd-4', ok, 5, 'first');
    expect(settle(c, 'cmd-4', refusedR, 6, null)).toBe(c);
    expect(settle(p, 'cmd-older', ok, 6, 'stale')).toBe(p);
  });
  it('abandoning a wait claims nothing about the server ("cancelled" is never said)', () => {
    const a = abandon(start(IDLE, 'cmd-5', 0).state, 3);
    expect(a.phase).toBe('abandoned');
    expect(JSON.stringify(outcomeText(a))).not.toMatch(/cancel/i);
    expect(abandon(IDLE, 3)).toBe(IDLE);
  });
  it('retry advice: a refusal is corrected or reloaded; an unknown outcome is checked first unless the act is idempotent by its own key (UX-24-003; B100 residue)', () => {
    const p = start(IDLE, 'c', 0).state;
    expect(retryAdvice(settle(p, 'c', refusedR, 1, null), { idempotentKey: false }).offer).toBe('reload');
    expect(retryAdvice(settle(p, 'c', { ok: false, status: 422, error: { ...refusedR.error, code: 'EYE_REQ_001' } }, 1, null), { idempotentKey: false }).offer).toBe('correct');
    expect(retryAdvice(settle(p, 'c', lost, 1, null), { idempotentKey: false }).offer).toBe('check_first');
    expect(retryAdvice(settle(p, 'c', lost, 1, null), { idempotentKey: true }).offer).toBe('retry');
  });
});

describe('latency bands and the pending text (UX-24-006)', () => {
  it('instant < 100 ms · short < 1 s · long < 10 s · extended beyond — and the wait is named, never a success', () => {
    expect([latencyBand(50), latencyBand(500), latencyBand(5000), latencyBand(20000)]).toEqual(['instant', 'short', 'long', 'extended']);
    const p = start(IDLE, 'c', 0).state;
    expect(pendingText(p, 300, 'Saving draft')).toBe('Saving draft…');
    expect(pendingText(p, 4200, 'Saving draft')).toBe('Saving draft… 4 s');
    expect(pendingText(p, 15000, 'Saving draft')).toMatch(/still waiting for the server; nothing is confirmed until it answers$/);
    expect(pendingText(IDLE, 1, 'x')).toBe('');
  });
});

describe('progress shows only the server\'s counts; stale progress says it stopped (CMP-067)', () => {
  const now = Date.parse('2026-10-17T10:01:00.000Z');
  it('determinate from done/total; indeterminate without a total; never a fabricated percentage', () => {
    expect(progressView({ state: 'running', done: 3, total: 12, updatedAt: '2026-10-17T10:00:55.000Z' }, now)).toMatchObject({ determinate: true, percent: 25, stale: false, label: 'RUNNING — 3 of 12' });
    expect(progressView({ state: 'running', done: 3, total: null, updatedAt: '2026-10-17T10:00:55.000Z' }, now)).toMatchObject({ determinate: false, percent: null, label: 'RUNNING — 3 so far (total not known)' });
    expect(progressView({ state: 'queued', done: null, total: null, updatedAt: null }, now).label).toBe('QUEUED — no count reported');
  });
  it('no update past the threshold is STALE (and a finished run is never stale)', () => {
    const v = progressView({ state: 'running', done: 3, total: 12, updatedAt: '2026-10-17T10:00:00.000Z' }, now, 30000);
    expect(v.stale).toBe(true);
    expect(v.label).toMatch(/STALE: no update for 60 s; progress may have stopped$/);
    expect(progressView({ state: 'finished', done: 12, total: 12, updatedAt: '2026-10-17T09:00:00.000Z' }, now).stale).toBe(false);
  });
});

describe('toasts, motion, tones', () => {
  it('a toast is for non-consequential status only; a consequential outcome stays in place with its receipt (CMP-066)', () => {
    expect(toastAllowed('status').allowed).toBe(true);
    for (const k of CONSEQUENTIAL_CLASSES) expect(toastAllowed(k)).toMatchObject({ allowed: false, reason: expect.stringMatching(/shown in place with its receipt/) });
    expect(toastDwellMs('short')).toBe(7000);
    expect(toastDwellMs('x'.repeat(200))).toBe(16000);
  });
  it('motion collapses under reduced motion, and a consequential change is ALWAYS instant', () => {
    expect(motionMs('standard', { reducedMotion: false, consequential: false })).toBe(140);
    expect(motionMs('standard', { reducedMotion: true, consequential: false })).toBe(0);
    expect(motionMs('deliberate', { reducedMotion: false, consequential: true })).toBe(0);
  });
  it('tones are glyph + word + colour; critical is an alert; "success" without a receipt falls back to a note (CMP-065)', () => {
    expect(TONES.critical).toMatchObject({ role: 'alert', word: 'PROBLEM', glyph: '✕' });
    expect(TONES.info.role).toBe('status');
    expect(new Set(Object.values(TONES).map((t) => t.glyph)).size).toBe(5);
    expect(toneFor('success', false)).toBe('info');
    expect(toneFor('success', true)).toBe('success');
  });
});

describe('the empty state never implies an empty world (CMP-069, PAT-28)', () => {
  it('each reason is said with its scope and a safe next step', () => {
    const scope = 'the Supply Corridor Intelligence domain';
    expect(emptyStateText({ what: 'drafts', scope, evidence: 'none_recorded' }).body).toMatch(/not what exists in the world/);
    expect(emptyStateText({ what: 'sources', scope, evidence: 'filtered', hiddenByFilter: 4 })).toMatchObject({ body: '4 sources in the Supply Corridor Intelligence domain are hidden by the current filter.', next: 'Clear the filter to see them.' });
    expect(emptyStateText({ what: 'DEC objects', scope, evidence: 'not_permitted', permission: 'graph.read' }).body).toMatch(/do not include graph\.read; records may exist that you cannot see/);
    expect(emptyStateText({ what: 'drafts', scope, evidence: 'unavailable', reason: 'API unreachable' }).body).toMatch(/This is not an empty result/);
    for (const e of ['none_recorded', 'filtered', 'not_permitted', 'unavailable', 'not_collected', 'loading'] as const) {
      expect(emptyStateText({ what: 'x', scope, evidence: e }).title).not.toMatch(/^No x exist/);
    }
  });
});
