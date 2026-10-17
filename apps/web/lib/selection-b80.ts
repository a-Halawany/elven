/**
 * CP-6 B80 §CL-D (F-P7-E-05: PAT-18, UX-22-003/-004/-005) — BULK SELECTION as pure functions. A bulk action acts on EXACT, IDENTIFIED records:
 * before anything runs the principal sees how many are INCLUDED, which are EXCLUDED and why, which selected rows the current filter HIDES, and
 * which CHANGED (or left the read) since they were selected. There is no "select all" ambiguity: selecting "all matching" selects the
 * identified rows the filter matched — counted and named — never a predicate the server would widen later.
 *
 * The action runs PER ITEM: each item is its own governed write with its own receipt (or its own refusal in the server's words). An item whose
 * answer did not arrive is UNKNOWN — never success. Nothing is shown done before the server says so (UX-ADR-017; B107's optimistic-path lint).
 * The confirmation binds the consequence digest: if the selection, the reason or any item's state changes, the confirmation is void and the
 * action FREEZES until the principal reviews the new digest.
 *
 * CONSTRUCTION only: the act on eye_demo is the demonstration (SYNTHETIC personas); no acceptance is claimed.
 */
import { stableDigest } from './table-b80';

export interface Snapshot { id: string; label: string; fingerprint: string }
/** A selection: the identified rows and their state AT THE MOMENT they were selected. */
export interface Selection { scopeKey: string; items: Snapshot[] }
export const emptySelection = (scopeKey: string): Selection => ({ scopeKey, items: [] });

export type Eligibility = { ok: true } | { ok: false; reason: string };
export interface Candidate { id: string; label: string; fingerprint: string; eligibility: Eligibility }

export function isSelected(s: Selection, id: string): boolean { return s.items.some((x) => x.id === id); }
export function toggle(s: Selection, c: Pick<Candidate, 'id' | 'label' | 'fingerprint'>): Selection {
  return isSelected(s, c.id) ? { ...s, items: s.items.filter((x) => x.id !== c.id) } : { ...s, items: [...s.items, { id: c.id, label: c.label, fingerprint: c.fingerprint }] };
}
/** Select exactly the rows given (the rows the filter MATCHED — named and counted); rows already selected keep their original snapshot. */
export function selectExactly(s: Selection, rows: ReadonlyArray<Pick<Candidate, 'id' | 'label' | 'fingerprint'>>): Selection {
  const have = new Set(s.items.map((x) => x.id));
  return { ...s, items: [...s.items, ...rows.filter((r) => !have.has(r.id)).map((r) => ({ id: r.id, label: r.label, fingerprint: r.fingerprint }))] };
}
export function clearRows(s: Selection, ids: ReadonlyArray<string>): Selection { const drop = new Set(ids); return { ...s, items: s.items.filter((x) => !drop.has(x.id)) }; }
/** The header checkbox: checked / mixed / unchecked against the rows SHOWN (never "everything"). */
export function headerState(s: Selection, shownIds: readonly string[]): 'true' | 'false' | 'mixed' {
  if (shownIds.length === 0) return 'false';
  const n = shownIds.filter((id) => isSelected(s, id)).length;
  return n === 0 ? 'false' : n === shownIds.length ? 'true' : 'mixed';
}

export interface Assessment {
  included: Snapshot[];
  excluded: Array<Snapshot & { reason: string }>;
  /** selected, still in the read, but not shown under the current filter — they are NOT acted on until shown */
  hidden: Snapshot[];
  /** selected rows whose state changed since selection (fingerprint differs) — the action freezes until re-confirmed */
  changed: Array<Snapshot & { now: string }>;
  /** selected rows the read no longer returns (gone, or no longer authorized) — never acted on */
  missing: Snapshot[];
  counts: { selected: number; included: number; excluded: number; hidden: number; changed: number; missing: number };
}
/**
 * ASSESS the selection against the CURRENT read: `current` = every row the read returned (authorized), `shownIds` = the rows the current
 * filter shows. A changed row is reported as changed AND judged on its current state; only included rows are ever acted on.
 */
export function assess(s: Selection, current: readonly Candidate[], shownIds: ReadonlySet<string>): Assessment {
  const byId = new Map(current.map((c) => [c.id, c]));
  const a: Assessment = { included: [], excluded: [], hidden: [], changed: [], missing: [], counts: { selected: s.items.length, included: 0, excluded: 0, hidden: 0, changed: 0, missing: 0 } };
  for (const item of s.items) {
    const now = byId.get(item.id);
    if (now === undefined) { a.missing.push(item); continue; }
    if (now.fingerprint !== item.fingerprint) a.changed.push({ ...item, now: now.fingerprint });
    if (!shownIds.has(item.id)) { a.hidden.push(item); continue; }
    if (!now.eligibility.ok) { a.excluded.push({ ...item, reason: now.eligibility.reason }); continue; }
    a.included.push({ id: now.id, label: now.label, fingerprint: now.fingerprint });
  }
  a.counts = { selected: s.items.length, included: a.included.length, excluded: a.excluded.length, hidden: a.hidden.length, changed: a.changed.length, missing: a.missing.length };
  return a;
}

/** Re-snapshot the selection at the current state (the principal accepted what changed); missing rows leave the selection. */
export function acceptCurrent(s: Selection, current: readonly Candidate[]): Selection {
  const byId = new Map(current.map((c) => [c.id, c]));
  return { ...s, items: s.items.filter((x) => byId.has(x.id)).map((x) => ({ id: x.id, label: byId.get(x.id)!.label, fingerprint: byId.get(x.id)!.fingerprint })) };
}

/**
 * After a run, re-snapshot ONLY the items this principal's own committed writes changed (their new state is the answer just received); any
 * other change since selection stays reported as changed — a concurrent change is never accepted on the principal's behalf.
 */
export function acceptCommitted(s: Selection, current: readonly Candidate[], committedIds: readonly string[]): Selection {
  const byId = new Map(current.map((c) => [c.id, c])); const mine = new Set(committedIds);
  return { ...s, items: s.items.map((x) => (mine.has(x.id) && byId.has(x.id) ? { ...x, fingerprint: byId.get(x.id)!.fingerprint } : x)) };
}

/** The counts in words, before the action (PAT-18). */
export function assessmentText(a: Assessment): string {
  const c = a.counts;
  return `${c.selected} selected · ${c.included} included · ${c.excluded} excluded · ${c.hidden} hidden by the filter · ${c.changed} changed since selection${c.missing > 0 ? ` · ${c.missing} no longer in this read` : ''}`;
}

/** The consequence the confirmation binds: the action, its parameters and the EXACT included items at their current state. */
export function consequenceDigest(action: { key: string; params: Record<string, string> }, a: Assessment): string {
  return stableDigest({ action: action.key, params: action.params, items: a.included.map((x) => [x.id, x.fingerprint]).sort((p, q) => (p[0]! < q[0]! ? -1 : 1)) });
}

export interface Gate { allowed: boolean; reasons: string[] }
/**
 * May the action run? Never with nothing included; never while a selected row changed or left the read (UX-22-005: displayed and acted-on
 * diverge → frozen, re-confirm); never without the parameters the action requires; never on a confirmation of a different digest.
 */
export function actionGate(a: Assessment, p: { requiredParams: Record<string, string>; confirmedDigest: string | null; digest: string; busy?: boolean }): Gate {
  const reasons: string[] = [];
  if (p.busy === true) reasons.push('the action is running — each item reports its own answer');
  if (a.counts.included === 0) reasons.push('nothing is included — select rows the action applies to');
  if (a.counts.changed > 0) reasons.push(`${a.counts.changed} selected row(s) changed since selection — review the current state and accept it first`);
  if (a.counts.missing > 0) reasons.push(`${a.counts.missing} selected row(s) are no longer in this read — accept the current state first`);
  for (const [k, v] of Object.entries(p.requiredParams)) if (v.trim() === '') reasons.push(`the ${k} is required (it is recorded with every item's decision)`);
  if (p.confirmedDigest !== null && p.confirmedDigest !== p.digest) reasons.push('the consequence changed after it was reviewed — review it again');
  return { allowed: reasons.length === 0, reasons };
}

/* ───────────────────────── the per-item run ───────────────────────── */

export type ItemOutcome =
  | { id: string; label: string; outcome: 'committed'; receipt: { policyDecisionId: string; auditSeq: number } }
  | { id: string; label: string; outcome: 'refused'; error: { code: string; message: string; correlationId: string } }
  | { id: string; label: string; outcome: 'unknown'; error: { code: string; message: string; correlationId: string } }
  | { id: string; label: string; outcome: 'not_attempted'; reason: string };
export interface ItemAnswer { ok: boolean; status: number; receipt?: { policyDecisionId: string; auditSeq: number }; error?: { code: string; message: string; correlationId: string } }

/** Classify ONE server answer: committed only with a receipt; status 0 (no answer) or an answer without a receipt is UNKNOWN, never success. */
export function classify(item: Snapshot, r: ItemAnswer): ItemOutcome {
  if (r.ok && r.receipt !== undefined) return { id: item.id, label: item.label, outcome: 'committed', receipt: r.receipt };
  if (r.ok) return { id: item.id, label: item.label, outcome: 'unknown', error: { code: 'EYE-UI-RECEIPT', message: 'the server answered without a receipt — the outcome is unknown; re-read the record', correlationId: 'none' } };
  const error = r.error ?? { code: 'EYE-INT-001', message: 'request failed', correlationId: 'none' };
  return r.status === 0 ? { id: item.id, label: item.label, outcome: 'unknown', error } : { id: item.id, label: item.label, outcome: 'refused', error };
}

/**
 * Run the items ONE AT A TIME (each its own governed write). `shouldStop` is consulted between items (a cancel): the items not reached are
 * reported `not_attempted` — the ones already answered keep their answers. `onItem` reports each answer as it arrives (the progress is real).
 */
export async function runPerItem(items: readonly Snapshot[], run: (item: Snapshot) => Promise<ItemAnswer>, hooks: { onItem?: (o: ItemOutcome, done: number) => void; shouldStop?: () => boolean } = {}): Promise<ItemOutcome[]> {
  const out: ItemOutcome[] = [];
  for (const item of items) {
    if (hooks.shouldStop?.() === true) { out.push({ id: item.id, label: item.label, outcome: 'not_attempted', reason: 'cancelled before this item was sent' }); hooks.onItem?.(out[out.length - 1]!, out.length); continue; }
    let o: ItemOutcome;
    try { o = classify(item, await run(item)); }
    catch (e) { o = { id: item.id, label: item.label, outcome: 'unknown', error: { code: 'EYE-UI-THROWN', message: e instanceof Error ? e.message : String(e), correlationId: 'none' } }; }
    out.push(o);
    hooks.onItem?.(o, out.length);
  }
  return out;
}

export function outcomeText(outcomes: readonly ItemOutcome[]): string {
  const n = (k: ItemOutcome['outcome']) => outcomes.filter((o) => o.outcome === k).length;
  const parts = [`${n('committed')} committed (each with its receipt)`, `${n('refused')} refused`];
  if (n('unknown') > 0) parts.push(`${n('unknown')} UNKNOWN — no answer arrived; re-read before acting again`);
  if (n('not_attempted') > 0) parts.push(`${n('not_attempted')} not attempted`);
  return `${outcomes.length} items: ${parts.join(' · ')}`;
}
