/**
 * CP-6 B50 §LC (0120_b50_x_lc; F-P3-02: PR-06-001/002/003/005, CAP-AU-07, ADR-006; F-P3-01: V03-T-021, V04-T-006) — THE WORK-OBJECT LIFECYCLE
 * as PURE functions (the web has no DOM test environment; components/knowledge.tsx and the pages render exactly what these decide):
 *
 *   · THE CATALOGUE MAP read from the SERVER'S PROFILE (ADR-006): a type's own state → its canonical word (the profile's map) → B81's LS code
 *     (LS-01…10; `reviewed` → LS-03 "In Review", DESIGN D4 — no new LS code). A word with no catalogue equivalent is shown in the server's
 *     words with the reason; a lifecycle reading is never derived from a truth state;
 *   · THE OFFER: per transition of the profile, whether THIS person may take it now and, when not, the reason in words (the owner, the
 *     reviewer / approver roles, the separation of duties, the state, the degraded contracts in force) — the server re-checks every one;
 *   · THE RECORD: every attempted transition (accepted, rejected, compensated) in words — the refusal in the server's words, the attempt KEPT;
 *   · THE REPLAY: the recorded instants of the versions, each a deep link to the state at that instant;
 *   · THE CALLS: the governed routes of api.objects' lifecycle surface (lib/api's envelope; nothing optimistic — the page renders the answer).
 *
 * Presentation never changes meaning: a published state is not emphasised over a draft; nothing is shown accepted or current by inference.
 * CONSTRUCTION only: nothing here is demonstrated or accepted; the records in the tests are SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';
import type { LifecycleState } from './b81-seams';
import type { LifecycleProfile, TransitionOutcome, WorkObjectState } from './b50-seams';
import { LIFECYCLE, type LifecycleReading } from './object-b81';
import { unavailableBecause, type DegradedState } from './degraded-b81';
import type { ConsequenceView } from './authority-b81';

type Row = Record<string, unknown>;

/* ═════════════════════════════ THE CATALOGUE MAP (ADR-006 → LS-01…12) ═════════════════════════════ */
/** ADR-006's eight work-object states, in their order. */
export const WORK_OBJECT_STATES: readonly WorkObjectState[] = ['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired'];
/** Every canonical word a profile may map to → its LS code, or the reason it has none (shown in the server's words). */
export const CANONICAL_LS: Readonly<Record<string, LifecycleState | { none: string }>> = {
  draft: 'LS-01', proposed: 'LS-02', reviewed: 'LS-03', approved: 'LS-04', published: 'LS-05', superseded: 'LS-06', corrected: 'LS-07', withdrawn: 'LS-08',
  archived: 'LS-09', retired: 'LS-10',
  admitted: { none: 'admitted by the admission port — an admission is not an authority\'s approval of the version' },
  active: { none: 'in current use — no catalogue state says "active"' },
  disputed: { none: 'a TRUTH marking (shown by the truth badge), never a lifecycle state' },
  deleted: { none: 'deleted under retention — the record of the deletion is what remains' },
};

/** The server's profile (snake case, as the route answers it). */
export interface ServerProfile {
  object_type: string; version: number; governance: 'work_object' | 'module' | 'canonical' | 'revision'; owning_port: string; schema_ref: string | null;
  states: string[]; canonical_map: Record<string, string>; consistent: Record<string, string[]>;
  transitions: Array<{ action: string; from: string[]; to: string; actor: 'owner' | 'reviewer' | 'approver'; kind: 'forward' | 're_entry' | 'compensation';
    separation?: string[]; reentry_reasons?: string[]; reason?: string; changes?: boolean; roles?: string[] }>;
  reviewer_roles: string[]; approver_roles: string[]; module_read: string; description: string;
}
/** The seam's camel-case profile (lib/b50-seams.ts LifecycleProfile). */
export function toSeamProfile(p: ServerProfile): LifecycleProfile {
  return { objectType: p.object_type, version: p.version, states: [...p.states], canonicalMap: { ...p.canonical_map },
    transitions: p.transitions.map((t) => ({ from: t.from.join('|'), to: t.to, action: t.action, actor: t.actor, kind: t.kind })) };
}

/** The lifecycle of a record from the SERVER's state word through its type's PROFILE (never from a truth state). */
export function lifecycleFromProfile(profile: Pick<ServerProfile, 'object_type' | 'canonical_map'> | null, serverState: string | null | undefined): LifecycleReading {
  const s = typeof serverState === 'string' && serverState.trim() !== '' ? serverState.trim() : null;
  if (s === null) return { code: null, label: 'Unresolved', definition: 'The read carried no lifecycle state', glyph: '?', serverState: null, note: 'the lifecycle state could not be resolved from the record', conditions: [] };
  const canonical = profile === null ? s : profile.canonical_map[s];
  if (canonical === undefined) {
    return { code: null, label: s.replace(/_/g, ' '), definition: 'The server\'s own state — not in this type\'s lifecycle profile', glyph: '·', serverState: s,
      note: `the ${profile?.object_type ?? 'type'} profile does not name this state — shown in its own words`, conditions: [] };
  }
  const m = CANONICAL_LS[canonical];
  if (typeof m === 'string') {
    const d = LIFECYCLE[m];
    return { code: m, label: d.label, definition: d.definition, glyph: d.glyph, serverState: s, note: canonical === s || profile === null ? null : `the ${profile.object_type} profile maps ${s} to ${canonical}`, conditions: [] };
  }
  return { code: null, label: s.replace(/_/g, ' '), definition: 'The server\'s own state — no lifecycle-catalogue equivalent', glyph: '·', serverState: s, note: m === undefined ? 'not a canonical lifecycle word' : m.none, conditions: [] };
}

/** The re-entry reasons (V03-T-021) in words. */
export const REENTRY_REASONS_WEB: Readonly<Record<string, string>> = {
  contradiction: 'a contradiction reopens it', fitness_failure: 'a fitness failure of what it cites', policy_change: 'a policy change reopens it', review_finding: 'a review finding returns it to its author',
};

/* ═════════════════════════════ THE OFFER ═════════════════════════════ */
/** The verb + object label of a transition, and what is kept for a destructive one (dg-lint-3: a destructive command states what is kept). */
export const ACTION_WORDS: Readonly<Record<string, { label: string; pending: string; kept: string | null; typed: boolean }>> = {
  review: { label: 'Record the review', pending: 'Recording the review…', kept: null, typed: false },
  approve: { label: 'Approve this version', pending: 'Approving…', kept: null, typed: false },
  publish: { label: 'Publish the assessment', pending: 'Publishing…', kept: null, typed: true },
  correct: { label: 'Correct the assessment', pending: 'Correcting…', kept: 'the corrected version is linked to the prior one, which is kept', typed: false },
  supersede: { label: 'Mark the assessment superseded', pending: 'Marking superseded…', kept: 'every version is kept and replayable', typed: false },
  withdraw: { label: 'Withdraw the assessment', pending: 'Withdrawing…', kept: 'it is preserved and replayable; a withdrawal is terminal', typed: true },
  archive: { label: 'Archive the assessment', pending: 'Archiving…', kept: 'it is kept for history and replayable', typed: false },
  retire: { label: 'Retire the assessment', pending: 'Retiring…', kept: 'it stays replayable; every version is kept', typed: true },
  reopen: { label: 'Reopen as a draft', pending: 'Reopening…', kept: 'the published versions are kept; a new review is needed', typed: false },
  compensate: { label: 'Undo the last transition', pending: 'Undoing…', kept: 'both transitions stay recorded; the state before it is restored as a new version', typed: false },
};
export interface OfferFacts {
  me: string; isHuman: boolean; roles: readonly string[];
  /** the object's accountable owner, its author, the reviewer of the current cycle (principal ids; null when unknown) */ owner: string | null; author: string | null; reviewer: string | null;
  state: string; governedHere: boolean; degraded: DegradedState | null;
  /** the latest accepted transition (a compensation undoes it): its id, action and kind */ last: { transitionId: string; action: string; kind: string } | null;
}
export interface Offer { action: string; label: string; pending: string; to: string; kind: string; actor: string; can: boolean; reason: string | null;
  needsReason: string | null; reentryReasons: string[]; changes: boolean; typed: boolean; kept: string | null }

/** Every transition of the profile offered FROM the current state, each with whether this person may take it now (and why not). */
export function offers(profile: ServerProfile, f: OfferFacts): Offer[] {
  const out: Offer[] = [];
  for (const t of profile.transitions) {
    const isComp = t.kind === 'compensation';
    if (!isComp && !t.from.includes(f.state)) continue;
    const words = ACTION_WORDS[t.action] ?? { label: `Record the ${t.action.replace(/_/g, ' ')}`, pending: 'Recording…', kept: null, typed: false };
    let reason: string | null = null;
    if (!f.governedHere) reason = `this object is moved by ${profile.owning_port}, not on this page`;
    else if (!f.isHuman) reason = 'the human gate: an authoritative transition is a named person\'s act — an agent proposes';
    else if (t.actor === 'owner' && f.me !== f.owner) reason = 'this is the accountable owner\'s act — you may propose it';
    else if (t.actor === 'reviewer' && !profile.reviewer_roles.some((r) => f.roles.includes(r))) reason = `you hold none of the reviewer roles (${profile.reviewer_roles.join(' or ')})`;
    else if (t.actor === 'approver' && !profile.approver_roles.some((r) => f.roles.includes(r))) reason = `you hold none of the approver roles (${profile.approver_roles.join(' or ')})`;
    else if ((t.separation ?? []).includes('author') && f.me === f.author) reason = 'separation of duties: the author never does this';
    else if ((t.separation ?? []).includes('reviewer') && f.me === f.reviewer) reason = 'separation of duties: the reviewer of this version never approves it';
    else if (isComp && (f.last === null || f.last.action === 'create' || f.last.kind === 'compensation')) reason = 'there is no accepted transition to undo (the creation and an undo are not undone)';
    if (reason === null) {
      const u = unavailableBecause(f.degraded, 'objects.lifecycle.transition');
      if (u.unavailable) reason = u.reason;
    }
    out.push({ action: t.action, label: words.label, pending: words.pending, to: t.to, kind: t.kind, actor: t.actor, can: reason === null, reason,
      needsReason: t.reason ?? null, reentryReasons: t.reentry_reasons ?? [], changes: t.changes === true, typed: words.typed, kept: words.kept });
  }
  return out;
}

/** The consequence of a transition, STATED (no server preview exists for a lifecycle transition; the server decides when it runs). */
export function consequenceOf(o: Pick<Offer, 'action' | 'to' | 'kind' | 'kept'>, title: string, version: number): ConsequenceView {
  const to = o.kind === 'compensation' ? 'the state before the last accepted transition' : o.to;
  return {
    source: 'stated', blockers: [],
    effect: `${title} moves from version ${version} to a new version ${version + 1}, ${to}; the server re-checks the version you read, your authority and the separation of duties`,
    affected: [`the assessment (version ${version} stays recorded)`, 'the lifecycle record (the attempt is kept whatever the answer)'],
    users: ['every reader of the assessment in this domain'],
    reversibility: o.kept ?? 'a later transition or an undo of this one changes the state again; nothing recorded is rewritten',
    residualRisk: o.action === 'publish' ? 'readers act on the published version until it is corrected, withdrawn or retired' : 'none beyond the state shown',
    audit: 'recorded under your name with the policy decision, the version read and the idempotency key',
  };
}

/* ═════════════════════════════ THE RECORD ═════════════════════════════ */
export interface AttemptRow { id: string; at: string; action: string; outcome: 'accepted' | 'rejected' | 'compensated'; from: string | null; to: string | null;
  version: number | null; lastAuthoritative: number | null; by: string; words: string; refusal: string | null; kind: string }
/** One attempt in words — accepted, REJECTED (the server's words; the attempt is kept), or COMPENSATED (what it restored). */
/** An attempt's answer (TransitionOutcome's fields, the `from` nullable: the creation has none). */
export type AttemptInput = Pick<TransitionOutcome, 'outcome' | 'to' | 'objectVersion' | 'lastAuthoritativeVersion' | 'attemptedAction' | 'refusal' | 'repeated'> & { from: string | null };
export function attemptWords(t: AttemptInput): string {
  const act = t.attemptedAction.replace(/_/g, ' ');
  if (t.outcome === 'accepted') return `${act}: ${t.from ?? 'new'} → ${t.to} — version ${t.objectVersion} written${t.repeated ? ' (a repeat of the same command answered its first result; nothing new written)' : ''}`;
  if (t.outcome === 'compensated') return `${act}: ${t.from} → ${t.to} restored — version ${t.objectVersion} written; the undone transition stays recorded`;
  return `${act} REJECTED — ${t.refusal?.message ?? 'refused'}; the attempt is kept, the authoritative version stays ${t.lastAuthoritativeVersion}${t.repeated ? ' (a repeat of the same command answered its first result)' : ''}`;
}
/** The server's transition rows (snake case) → the record's rows, oldest first. */
export function attemptRows(transitions: readonly Row[]): AttemptRow[] {
  return transitions.map((r) => {
    const refusal = (r['refusal'] ?? null) as Row | null;
    const o: AttemptInput = {
      outcome: String(r['outcome']) as TransitionOutcome['outcome'], from: (r['from'] as string | null) ?? null, to: (r['to'] as string | null) ?? null,
      objectVersion: r['object_version'] === null || r['object_version'] === undefined ? null : Number(r['object_version']),
      lastAuthoritativeVersion: Number(r['last_authoritative_version'] ?? 0), attemptedAction: String(r['attempted_action'] ?? r['action']),
      refusal: refusal === null ? null : { class: String(refusal['class']), message: String(refusal['message']) }, repeated: r['repeated'] === true,
    };
    return { id: String(r['transition_id']), at: String(r['recorded_at']), action: String(r['action']), outcome: o.outcome, from: o.from, to: o.to, version: o.objectVersion,
      lastAuthoritative: o.lastAuthoritativeVersion, by: String(r['actor_principal_id'] ?? ''), words: attemptWords(o), refusal: refusal === null ? null : String(refusal['message']), kind: String(r['kind'] ?? 'forward') };
  });
}

/** The current cycle's reviewer (since the last return to draft) and the author, read from the record (never inferred from roles). */
export function cycleFacts(transitions: readonly Row[]): { author: string | null; reviewer: string | null; last: OfferFacts['last'] } {
  let author: string | null = null; let reviewer: string | null = null; let last: OfferFacts['last'] = null;
  for (const t of transitions) {
    if (t['outcome'] !== 'accepted' && t['outcome'] !== 'compensated') continue;
    if (t['action'] === 'create') author = String(t['actor_principal_id']);
    if (t['to'] === 'draft') reviewer = null;
    if (t['action'] === 'review') reviewer = String(t['actor_principal_id']);
    last = { transitionId: String(t['transition_id']), action: String(t['action']), kind: String(t['kind']) };
  }
  return { author, reviewer, last };
}

/* ═════════════════════════════ THE REPLAY ═════════════════════════════ */
/** Each recorded version's instant — a link to the state AT that instant (replayed from the record, never from now). */
export function replayInstants(versions: readonly Row[], type: string, id: string): Array<{ version: number; state: string; at: string; href: string }> {
  return versions.map((v) => {
    const at = String(v['recorded_at']);
    return { version: Number(v['version']), state: String(v['state']), at, href: `/graph/lifecycle/${type}/${id}?asOf=${encodeURIComponent(at)}` };
  });
}
/** A replay's answer in words. */
export function replayWords(r: Row): string {
  if (r['known'] !== true) return `Nothing of this object was recorded by ${String(r['as_of'])}.`;
  const later = (r['later'] ?? {}) as Row;
  const agree = r['agrees'] === false ? ' The ledger DISAGREES with the recorded version — the object needs reconciling.' : '';
  return `At ${String(r['as_of'])} the object stood at version ${String(r['version'])}, ${String(r['state'])}. ${Number(later['versions'] ?? 0)} later version(s) and ${Number(later['attempts'] ?? 0)} later attempt(s) are not folded in.${agree}`;
}

/* ═════════════════════════════ THE CALLS ═════════════════════════════ */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/lifecycle`;
const env = (s: Scope, action: string, type: string, id: string | null = null) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: type, object_id: id, purpose_id: 'intelligence',
  side_effect_class: action === 'objects.lifecycle.read' ? 'none' as const : 'reversible' as const, consequence_class: action === 'objects.lifecycle.read' ? 'C1' as const : 'C2' as const,
});
export const lifecycle = {
  profiles: (s: Scope): Promise<ApiResult<{ profiles: ServerProfile[]; receipt: Receipt }>> => call(`${base(s)}/profiles`, env(s, 'objects.lifecycle.read', 'OLC'), {}),
  list: (s: Scope, type: string): Promise<ApiResult<{ objects: Row[]; receipt: Receipt }>> => call(`${base(s)}/${type}/list`, env(s, 'objects.lifecycle.read', type), {}),
  history: (s: Scope, type: string, id: string): Promise<ApiResult<{ lifecycle: Row; receipt: Receipt }>> => call(`${base(s)}/${type}/${id}/history`, env(s, 'objects.lifecycle.read', type, id), {}),
  replay: (s: Scope, type: string, id: string, asOf: string): Promise<ApiResult<{ replay: Row; receipt: Receipt }>> =>
    call(`${base(s)}/${type}/${id}/replay`, env(s, 'objects.lifecycle.read', type, id), { asOf }),
  reconcile: (s: Scope): Promise<ApiResult<{ reconciliation: Row; receipt: Receipt }>> => call(`${base(s)}/reconcile`, env(s, 'objects.lifecycle.read', 'OLC'), {}),
  author: (s: Scope, a: { title: string; statement: string; body: Row; evidenceRefs: string[]; classification: string; purposeScope: string; synthetic: boolean; idempotencyKey: string }):
    Promise<ApiResult<{ transition: Row; receipt: Receipt }>> => call(`${base(s)}/work-objects/author`, env(s, 'objects.work_object.author', 'ASM'), { objectType: 'ASM', ...a }),
  transition: (s: Scope, type: string, id: string, a: { expectedVersion: number; action: string; idempotencyKey: string; reason?: string | null; reentryReason?: string | null;
    causationId?: string | null; changes?: Row }): Promise<ApiResult<{ transition: Row; receipt: Receipt }>> =>
    call(`${base(s)}/${type}/${id}/transition`, env(s, 'objects.lifecycle.transition', type, id), a),
  propose: (s: Scope, type: string, id: string, a: { requestId: string; baseVersion: number; action: string; reason: string; via: 'view'; reentryReason?: string | null; causationId?: string | null }):
    Promise<ApiResult<{ proposal: Row; receipt: Receipt }>> => call(`${base(s)}/${type}/${id}/proposals/propose`, env(s, 'objects.lifecycle.propose', type, id), a),
  decide: (s: Scope, type: string, id: string, proposalId: string, a: { requestId: string; decision: 'accept' | 'decline'; reason: string; expectedVersion?: number; idempotencyKey?: string }):
    Promise<ApiResult<{ decision: Row; receipt: Receipt }>> => call(`${base(s)}/${type}/${id}/proposals/${proposalId}/decide`, env(s, 'objects.lifecycle.proposal.decide', type, id), a),
};

/** A command identity: a NEW one per deliberate act, REUSED by a retry after an unknown outcome (the server answers the first result). */
export function commandKey(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
