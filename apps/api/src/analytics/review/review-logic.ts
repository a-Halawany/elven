/**
 * B92 §OR (0113_b92_x_or) — THE OPERATING REVIEW's pure logic: the named periods a review covers (a calendar quarter or month — never a
 * rolling window), the series' periods (every period listed, oldest first — mirrors analytics.aor_shift_period), and the shape checks of
 * the requests a route answers before any port runs (the ports re-check every rule that matters). Nothing here measures or decides.
 */
export const REVIEW_PERIOD_RE = /^([0-9]{4})-(Q[1-4]|0[1-9]|1[0-2])$/;
export const METRIC_KEY_RE = /^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/;
export const SCOPE_KEY_RE = /^[a-z][a-z0-9_.-]{2,62}$/;
export const ROLE_RE = /^[a-z][a-z0-9_]{1,62}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIGEST_RE = /^[0-9a-f]{64}$/;
export const DAY_RE = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

/** A review period: a calendar quarter (2026-Q3) or a calendar month (2026-09). */
export function isReviewPeriod(p: string): boolean { return REVIEW_PERIOD_RE.test(p); }

/** A named period shifted by n periods of its own kind; null for anything else (mirrors analytics.aor_shift_period). */
export function shiftPeriod(p: string, n: number): string | null {
  const q = /^([0-9]{4})-Q([1-4])$/.exec(p);
  if (q !== null) {
    const v = Number(q[1]) * 4 + (Number(q[2]) - 1) + n;
    return `${String(Math.floor(v / 4)).padStart(4, '0')}-Q${(v % 4) + 1}`;
  }
  const m = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(p);
  if (m !== null) {
    const v = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
    return `${String(Math.floor(v / 12)).padStart(4, '0')}-${String((v % 12) + 1).padStart(2, '0')}`;
  }
  return null;
}

/** The `count` periods ending with `through`, oldest first (the scene: 2025-Q4 … 2026-Q3). */
export function seriesPeriods(through: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) { const p = shiftPeriod(through, -i); if (p !== null) out.push(p); }
  return out;
}

export type Followthrough =
  | { kind: 'action'; metricKey: string | null; action: string; owner: string; dueOn: string; reason: string }
  | { kind: 'no_action'; metricKey: string | null; reason: string };

/** A follow-through request's SHAPE (the port decides the rest: the chair, the owner's humanity, the due date against the database's day). */
export function parseFollowthrough(p: Record<string, unknown>): { ok: true; value: Followthrough } | { ok: false; cls: string; message: string } {
  const str = (k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);
  const metricKey = str('metricKey');
  if (metricKey !== null && !METRIC_KEY_RE.test(metricKey)) return { ok: false, cls: 'request', message: 'payload.metricKey names a metric (MET-001) or is absent (the review as a whole)' };
  const reason = str('reason');
  if (reason === null || reason.length < 8) return { ok: false, cls: 'reason', message: 'a follow-through states its reason (8+ characters)' };
  const kind = str('kind');
  if (kind === 'no_action') {
    if (str('action') !== null || str('owner') !== null || str('dueOn') !== null) return { ok: false, cls: 'kind', message: '"no action" names no action, owner or due date — its reason says why' };
    return { ok: true, value: { kind, metricKey, reason } };
  }
  if (kind !== 'action') return { ok: false, cls: 'kind', message: 'payload.kind is action or no_action' };
  const action = str('action'); const owner = str('owner'); const dueOn = str('dueOn');
  if (action === null || action.length < 8 || action.length > 500) return { ok: false, cls: 'action', message: 'an action is named in 8–500 characters' };
  if (owner === null || !UUID_RE.test(owner)) return { ok: false, cls: 'owner', message: 'an action has a named owner (a principal id)' };
  if (dueOn === null || !DAY_RE.test(dueOn)) return { ok: false, cls: 'due', message: 'an action has a due date (YYYY-MM-DD)' };
  return { ok: true, value: { kind, metricKey, action, owner, dueOn, reason } };
}

/** Pins {metric_key: result_id}: the shape only (the port refuses a preview, a replay, a mismatch, an unknown result). */
export function parsePins(v: unknown): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  if (v === undefined || v === null) return { ok: true, value: {} };
  if (typeof v !== 'object' || Array.isArray(v)) return { ok: false, message: 'payload.pins is {metricKey: resultId}' };
  const out: Record<string, string> = {};
  for (const [k, id] of Object.entries(v as Record<string, unknown>)) {
    if (!METRIC_KEY_RE.test(k) || typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, message: `payload.pins.${k} names a metric and a result id` };
    out[k] = id;
  }
  return { ok: true, value: out };
}
