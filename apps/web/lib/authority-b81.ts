/**
 * CP-6 B81 §HA (F-P7-E-20) — THE HUMAN-AUTHORITY PATTERNS as pure contracts (components/authority.tsx renders what these decide; the
 * server decides everything that matters and refuses in its own words — these functions only decide what the interface OFFERS, how it
 * words the record, and when a deliberate control is enabled):
 *
 *   actionClassOf        REL-10: every PDP action name → ONE interaction class (navigation · draft · acknowledgment · review · approval ·
 *                        publication · effect); an unknown write fails closed as an EFFECT. seamClassOf maps onto b81-seams' ActionClass.
 *   isIrreversible       PAT-16: the acts that need a typed confirmation (commit, the decision's signature, a close, a cancel, a destroy).
 *   eligibility          CMP-046 / HX-09: may THIS person do THIS act now — the role, the approver policy, separation of duties, recusal,
 *                        delegation, the gate's state — with the reason in words when not (the act is then DISABLED with that reason).
 *   digestFreeze         CMP-047: the review binds the digest it SHOWED; a different current digest voids it (a new version, never in place).
 *   payloadReviewState   B40 res: ONLY for a command whose server binds no version or digest, and only where the page passes it — a CLIENT-SIDE
 *                        review of the exact payload (canonicalPayload), voided by any change; said as such, never as a version binding.
 *   typedPhrase / typedState   PAT-16: the phrase to type (the short digest, or the object's name) and whether what was typed matches it.
 *   commandReviewGate    CMP-044 / PAT-07 / PAT-17: the deliberate control is enabled only when every condition holds — eligible, the
 *                        exact digest frozen, the consequence READ, the rationale stated, the typed phrase matched; the reasons otherwise.
 *   approvalFrom         UX-ADR-008: navigation, chat, defaults, acknowledgment and bulk never yield an approval — only a deliberate act.
 *   findBulkApprovals    PAT-07: no bulk approve / commit / sign path in the web source (a loop around such a call inside one handler).
 *   assertNoExecution    UX-ADR-008 (evolves B80's assertNavigationOnly): a palette / intent entry navigates, or HANDS OFF a command to
 *                        the page's Command Review (an href naming the action) — it never carries anything that executes.
 *   consequence*         CMP-045 / HX-13 / PAT-17: the server preview in words; where no server preview exists the catalogue STATES the
 *                        effect (and says it is stated, not computed).
 *   reviewRecordView     PAT-06: reviewer, version, evidence, findings — "not decision authority".
 *   deferIntake          PAT-08: rationale, conditions, owner and the next review (the 0119 §HA intake); never destructive.
 *   withdrawalView       PAT-11: identity, reason, recipients and the replacement — each "none recorded" when absent, never erased.
 *   contest registry     HX-14: every decision-active type has a contest path (challenge, evidence, reviewer, status, escalation, outcome).
 *   AUTHORITY_SURFACES   UX-ADR-007: the consequential gates that render authority as product state (banner + digest + signature receipt).
 *
 * CONSTRUCTION only: nothing here is acceptance evidence; the walk (demonstration, SYNTHETIC personas) and H3 (real acceptance) are other claims.
 */
import type { ActionClass, CommandReviewInput, SignatureReceiptView } from './b81-seams';

type Row = Record<string, unknown>;

/* ───────────────────────── REL-10: the action classes ───────────────────────── */

export const INTERACTION_CLASSES = ['navigation', 'draft', 'acknowledgment', 'review', 'approval', 'publication', 'effect'] as const;
export type InteractionClass = (typeof INTERACTION_CLASSES)[number];

/** A verb (the segments of a PDP action name, read from the last) → its class. Order of the table is irrelevant; the LAST known verb wins. */
const VERB_CLASS: Readonly<Record<string, InteractionClass>> = {
  // navigation: a read never changes the record
  read: 'navigation', list: 'navigation', search: 'navigation', retrieve: 'navigation', replay: 'navigation', render: 'navigation', get: 'navigation', view: 'navigation',
  status: 'navigation', export_read: 'navigation',
  // draft: authoring what is not yet submitted
  draft: 'draft', declare: 'draft', set: 'draft', define: 'draft', add: 'draft', version: 'draft', assemble: 'draft', map: 'draft', link: 'draft', option: 'draft',
  terms: 'draft', choice: 'draft', fields: 'draft', compose: 'draft', edit: 'draft', save: 'draft', cite: 'draft',
  // acknowledgment: a reading recorded, never authority
  acknowledge: 'acknowledgment', confirm: 'acknowledgment', concur: 'acknowledgment',
  // review: submitted for review, reviewed, assessed, challenged — never decision authority
  propose: 'review', submit: 'review', review: 'review', assess: 'review', evaluate: 'review', verify: 'review', validate: 'review', check: 'review',
  challenge: 'review', recuse: 'review', dissent: 'review', ready: 'review', request_information: 'review', comment: 'review', contest: 'review', preview: 'review',
  // approval: an authority's decision at a gate (approve, reject, defer are DISTINCT acts of the class — HX-12)
  approve: 'approval', accept: 'approval', certify: 'approval', decide: 'approval', grant: 'approval', sign: 'approval', adjudicate: 'approval',
  reject: 'approval', defer: 'approval', delegation: 'approval', override: 'approval', ratify: 'approval',
  // publication: the record leaves the room
  publish: 'publication', issue: 'publication', distribute: 'publication', deliver: 'publication', release: 'publication', share: 'publication', notify: 'publication',
  // effect: the institutional effect
  commit: 'effect', apply: 'effect', execute: 'effect', run: 'effect', start: 'effect', activate: 'effect', close: 'effect', withdraw: 'effect', retire: 'effect',
  revoke: 'effect', cancel: 'effect', delete: 'effect', purge: 'effect', erase: 'effect', destroy: 'effect', resume: 'effect', pause: 'effect', suspend: 'effect',
  restore: 'effect', reinstate: 'effect', quarantine: 'effect', trigger: 'effect', escalate: 'effect', reconcile: 'effect', record: 'effect', register: 'effect',
  open: 'effect', transition: 'effect', create: 'effect', archive: 'effect', correct: 'effect', retract: 'effect', freeze: 'effect', recover: 'effect',
};
/** Whole action names whose class the verb table would misread (the exceptions are named, never inferred). */
const ACTION_CLASS_EXCEPTIONS: Readonly<Record<string, InteractionClass>> = {
  'decision.commit.preview': 'review',          // the committer's recorded READING of the consequence (HX-13), not the commitment
  'decision.gate.request_information': 'review',
  'decision.gate.resume': 'approval',           // the gate's own act, resuming a deferred version
  'decision.board.reserve': 'approval',
  'decision.delegation.end': 'approval',
  'decision.override.review': 'review',
};

/** REL-10: the ONE interaction class of a PDP action name. An unknown verb fails closed as an EFFECT (consequential, reviewed). */
export function actionClassOf(action: string): InteractionClass {
  const exact = ACTION_CLASS_EXCEPTIONS[action];
  if (exact !== undefined) return exact;
  const parts = action.split('.').filter((p) => p !== '');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const verb = parts[i]!;
    const c = VERB_CLASS[verb] ?? VERB_CLASS[verb.replace(/s$/, '')];
    if (c !== undefined) return c;
  }
  return 'effect';
}
/** Does the class need the Command Review before effect (the consequential classes)? */
export const isConsequential = (c: InteractionClass): boolean => c === 'approval' || c === 'publication' || c === 'effect';

const DESTROY_VERBS = new Set(['delete', 'purge', 'erase', 'destroy', 'cancel', 'close']);
const WITHDRAW_VERBS = new Set(['withdraw', 'retract', 'revoke', 'retire']);
const lastVerb = (action: string): string => action.split('.').filter((p) => p !== '').at(-1) ?? '';

/** The seam's coarser ActionClass (lib/b81-seams.ts CommandReviewInput.actionClass). */
export function seamClassOf(action: string): ActionClass {
  const c = actionClassOf(action);
  const verb = lastVerb(action);
  if (c === 'navigation') return 'read';
  if (c === 'draft') return 'draft';
  if (c === 'acknowledgment' || c === 'review') return 'propose';
  if (c === 'approval') return action.split('.').includes('sign') ? 'sign' : 'approve';
  if (WITHDRAW_VERBS.has(verb)) return 'withdraw';
  if (DESTROY_VERBS.has(verb)) return 'destroy';
  return 'commit';
}

/** PAT-16: the acts that cannot be undone and so require a typed confirmation (re-authentication step-up is B61 / B84's — PAT-43/44). */
export function isIrreversible(action: string): boolean {
  if (action === 'decision.sign.decision') return true;
  const verb = lastVerb(action);
  return verb === 'commit' || DESTROY_VERBS.has(verb);
}

/* ───────────────────────── CMP-046 / HX-09: eligibility ───────────────────────── */

export interface EligibilityFacts {
  action: string;
  /** the signed-in person */ me: string;
  /** a human (never an agent: the human gate) */ isHuman: boolean;
  /** the person's role codes in this domain, and the roles the PDP rule admits (any of) */ roles: readonly string[]; requiredRoles: readonly string[];
  /** the approver policy (approval acts): the principals and roles it names */ policy?: { principals?: readonly string[]; roles?: readonly string[] } | null;
  /** separation of duties: who may NOT do this act on this object, and why (the author, the proposer, the owner, an approver who would commit) */
  excluded?: ReadonlyArray<{ principal: string; why: string }>;
  /** the recusals recorded on this version */ recused?: readonly string[];
  /** live delegations of an approval to the person (delegator → me) */ delegations?: ReadonlyArray<{ delegator: string; delegate: string; live: boolean }>;
  /** the version's state, and the states this act is offered in */ state?: string | null; openStates?: readonly string[];
}
export interface Eligibility { can: boolean; reason: string | null; role: string | null; basis: string }

/** May THIS person do THIS act now? The first failing rule is the reason, in words; the server re-checks every one of them. */
export function eligibility(f: EligibilityFacts): Eligibility {
  const no = (reason: string): Eligibility => ({ can: false, reason, role: null, basis: 'not eligible' });
  if (!f.isHuman) return no('the human gate: only a named person acts here — an agent never approves, commits or signs');
  const role = f.requiredRoles.find((r) => f.roles.includes(r)) ?? null;
  if (f.requiredRoles.length > 0 && role === null) return no(`you hold none of the roles this act requires (${f.requiredRoles.join(' or ')})`);
  if (f.state !== undefined && f.state !== null && f.openStates !== undefined && !f.openStates.includes(f.state)) return no(`the version is ${f.state.replace(/_/g, ' ')} — this act is offered on ${f.openStates.map((s) => s.replace(/_/g, ' ')).join(', ')} only`);
  const ex = (f.excluded ?? []).find((x) => x.principal === f.me);
  if (ex !== undefined) return no(`separation of duties: ${ex.why}`);
  if ((f.recused ?? []).includes(f.me)) return no('you recused from this version — your standing at this gate is withdrawn');
  let basis = role === null ? 'no role required' : `role ${role}`;
  if (f.policy !== undefined && f.policy !== null) {
    const named = (f.policy.principals ?? []).includes(f.me) || (f.policy.roles ?? []).some((r) => f.roles.includes(r));
    const delegated = (f.delegations ?? []).find((d) => d.delegate === f.me && d.live);
    if (!named && delegated === undefined) return no('the approver policy does not name you (neither by principal nor by role) and no live delegation is yours');
    basis = named ? `${basis}; named by the approver policy` : `${basis}; by delegation from ${shortId(delegated!.delegator)}`;
  }
  return { can: true, reason: null, role, basis };
}

/* ───────────────────────── CMP-047: the digest freeze ───────────────────────── */

/** The review binds the digest it SHOWED. A different current digest is a NEW version — the review is void, never updated in place. */
export function digestFreeze(shown: string | null | undefined, current: string | null | undefined): { frozen: boolean; reason: string | null } {
  if (current === null || current === undefined || current === '') return { frozen: false, reason: 'the version has no digest yet — it is not frozen, so nothing can be reviewed or decided on it' };
  if (shown === null || shown === undefined || shown === '') return { frozen: false, reason: 'no digest was shown — read the version before acting' };
  if (shown !== current) return { frozen: false, reason: `the digest changed while you reviewed (${shortDigest(shown)} → ${shortDigest(current)}): this is a new version — review it again` };
  return { frozen: true, reason: null };
}

/* B40 res (R1) */
/* ───────────────────────── the payload review (a command whose server contract binds NO version) ───────────────────────── */

/**
 * Some governed commands bind no object version and no digest on the server: their route takes a payload, and the port re-checks the
 * authority, the object and the basis — not a version the person read (the impact trigger's record, the challenge's close). For those
 * ONLY, and only where the page says so explicitly, the review binds the EXACT PAYLOAD the person reviewed: a CLIENT-SIDE PAYLOAD
 * REVIEW. It is not a server-enforced version binding and is never presented as one; a command whose server binds a version or digest
 * keeps digestFreeze. A dummy digest is never a substitute.
 */
export const PAYLOAD_REVIEW_NOTE = 'client-side payload review — this command carries no version or digest for the server to bind; the review holds the exact payload shown, and any change to it voids the review';

/** The payload in one canonical text (object keys sorted at every depth; arrays in order) — what the review holds and compares. */
export function canonicalPayload(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x !== null && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => [k, norm(o[k])]));
    }
    return x;
  };
  return JSON.stringify(norm(v)) ?? 'null';
}

/** Whether the payload the person reviewed is still the payload the command would send now (exactly; nothing is normalised beyond key order). */
export function payloadReviewState(reviewed: string | null | undefined, current: string): { frozen: boolean; reason: string | null } {
  if (reviewed === null || reviewed === undefined || reviewed === '') return { frozen: false, reason: 'review the exact payload first — this command binds no server version, so the review holds the payload you see' };
  if (reviewed !== current) return { frozen: false, reason: 'the payload changed after you reviewed it — review it again (a client-side payload review; the server binds no version here)' };
  return { frozen: true, reason: null };
}
/* end B40 res */

/* ───────────────────────── PAT-16: the typed confirmation ───────────────────────── */

/** The phrase to type: the first 8 characters of the bound digest (lower-case hex); without a digest, the object's own name. */
export function typedPhrase(subject: { digest?: string | null; name?: string | null }): string {
  if (typeof subject.digest === 'string' && /^[0-9a-f]{8,}$/.test(subject.digest)) return subject.digest.slice(0, 8);
  return (subject.name ?? '').trim();
}
/** Whether what was typed IS the phrase — exact (surrounding spaces ignored, nothing else normalised); never a generic OK. */
export function typedState(phrase: string, typed: string): { ok: boolean; reason: string | null } {
  if (phrase === '') return { ok: false, reason: 'there is nothing to confirm against — the act cannot be confirmed' };
  const t = typed.trim();
  if (t === '') return { ok: false, reason: `type ${phrase} to confirm` };
  if (t !== phrase) return { ok: false, reason: `what you typed is not ${phrase} — the act stays disabled` };
  return { ok: true, reason: null };
}

/* ───────────────────────── CMP-044 / PAT-07 / PAT-17: the Command Review gate ───────────────────────── */

export interface ReviewState {
  eligibility: Eligibility;
  /** the digest shown to the person (frozen at the review) and the digest the command will carry now */ shownDigest: string | null; currentDigest: string | null;
  /** PAT-17: the consequence preview has been read (a server preview obtained, or the stated effect acknowledged) */ consequenceRead: boolean;
  /** the rationale, when the act requires one (minimum characters) */ rationale?: { value: string; min: number } | null;
  /** PAT-16: the typed confirmation, when the act is irreversible */ typed?: { phrase: string; value: string } | null;
  /** how the act was reached: only a deliberate act can approve, commit or sign (UX-ADR-008) */ source?: ApprovalSource;
  /* B40 res (R1) */
  /** ONLY for a command whose server contract binds no version or digest: the client-side payload review REPLACES the digest freeze for
   *  this act (the reviewed payload and the payload the command would send now, canonical). Absent → the digest freeze, unchanged. */
  payloadReview?: { reviewed: string | null; current: string } | null;
  /* end B40 res */
}
/** Is the deliberate control enabled? Every unmet condition is a reason, in the order the person meets them. */
export function commandReviewGate(input: Pick<CommandReviewInput, 'action'>, s: ReviewState): { enabled: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!s.eligibility.can) reasons.push(s.eligibility.reason ?? 'you are not eligible for this act');
  if (s.source !== undefined && s.source !== 'deliberate') reasons.push(`a ${s.source} never ${verbOf(input.action)} — open the review and act deliberately`);
  /* B40 res (R1): the explicit payload-review mode, used only where a page passes it; otherwise the digest freeze as before */
  const d = s.payloadReview !== undefined && s.payloadReview !== null
    ? payloadReviewState(s.payloadReview.reviewed, s.payloadReview.current)
    : digestFreeze(s.shownDigest, s.currentDigest);
  /* end B40 res */
  if (!d.frozen) reasons.push(d.reason!);
  if (!s.consequenceRead) reasons.push('read the consequence preview first — the act is enabled only after it');
  if (s.rationale !== undefined && s.rationale !== null && s.rationale.value.trim().length < s.rationale.min) reasons.push(`state your rationale (${s.rationale.min}+ characters, recorded with your name)`);
  if (isIrreversible(input.action)) {
    if (s.typed === undefined || s.typed === null) reasons.push('this act cannot be undone: a typed confirmation is required');
    else { const t = typedState(s.typed.phrase, s.typed.value); if (!t.ok) reasons.push(t.reason!); }
  }
  return { enabled: reasons.length === 0, reasons };
}
const verbOf = (action: string): string => {
  const c = actionClassOf(action);
  return c === 'approval' ? 'approves' : c === 'publication' ? 'publishes' : 'acts';
};

/* ───────────────────────── UX-ADR-008: nothing implies approval ───────────────────────── */

export type ApprovalSource = 'navigation' | 'chat' | 'default' | 'acknowledgment' | 'bulk' | 'palette' | 'deliberate';
/** Navigation, chat, a default, an acknowledgment, a bulk selection or the palette NEVER yield an approval; only a deliberate act whose gate
 *  is enabled does (and then it is the server's answer, not this function's, that records it). */
export function approvalFrom(source: ApprovalSource, gate: { enabled: boolean }): 'deliberate' | null {
  return source === 'deliberate' && gate.enabled ? 'deliberate' : null;
}

/* ───────────────────────── PAT-07: no bulk approval path in the web source ───────────────────────── */

export interface BulkFinding { file: string; line: number; excerpt: string; why: string }
const AUTHORITY_CALL = /\.(approve|commit|sign|boardAct|certify)\s*\(/;
const ITERATION = /\.forEach\s*\(|\.map\s*\(|\bfor\s*\(|Promise\.all(?:Settled)?\s*\(/g;
const HANDLER = /\bon(?:Run|Click|Select|Confirm|Submit)\s*=/;
const BULK_COPY = /\b(approve|commit|sign|certify)\s+(all|every|selected|\d+)\b|\bbulk[- ]approv/i;
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
/**
 * A bulk authority path: inside ONE handler, an iteration whose body calls an approval / commit / signature API (a per-item control rendered
 * in a list — a handler BETWEEN the iteration and the call — is per item, not bulk), or copy that offers to approve / commit / sign many.
 */
/** The index just past the bracket matching the one at `open` (skipping string literals), or the text's end. */
function matchClose(code: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i]!;
    if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i += 1; while (i < code.length && code[i] !== q) { if (code[i] === '\\') i += 1; i += 1; } continue; }
    if (pairs[ch] !== undefined) stack.push(pairs[ch]!);
    else if (ch === ')' || ch === '}' || ch === ']') { stack.pop(); if (stack.length === 0) return i + 1; }
  }
  return code.length;
}
/** The iteration's OWN body: the call's arguments (`.map(…)`, `Promise.all(…)`), or a for-loop's header and its block / statement. */
function iterationBody(code: string, start: number, opener: string): string {
  const paren = start + opener.lastIndexOf('(');
  const headEnd = matchClose(code, paren);
  if (!/^for/.test(opener.trim())) return code.slice(paren, headEnd);
  const rest = code.slice(headEnd);
  const lead = rest.length - rest.trimStart().length;
  if (rest.trimStart().startsWith('{')) return code.slice(paren, matchClose(code, headEnd + lead));
  const semi = code.indexOf(';', headEnd);
  return code.slice(paren, semi === -1 ? code.length : semi + 1);
}
/**
 * A bulk authority path: an iteration whose OWN body calls an approval / commit / signature API (a per-item control rendered in a list — a
 * handler BETWEEN the iteration and the call — is per item, not bulk), or copy that offers to approve / commit / sign many.
 */
export function findBulkApprovals(files: ReadonlyArray<{ path: string; text: string }>): BulkFinding[] {
  const out: BulkFinding[] = [];
  for (const f of files) {
    if (/\.(test|spec)\.tsx?$/.test(f.path)) continue;
    const code = strip(f.text);
    const lineAt = (i: number) => code.slice(0, i).split('\n').length;
    const seen = new Set<number>();
    for (const m of code.matchAll(ITERATION)) {
      const start = m.index ?? 0;
      const body = iterationBody(code, start, m[0]);
      const call = AUTHORITY_CALL.exec(body);
      if (call === null) continue;
      if (HANDLER.test(body.slice(0, call.index))) continue;
      const line = lineAt(start + (m[0].length - m[0].trimStart().length));
      if (seen.has(line)) continue;
      seen.add(line);
      out.push({ file: f.path, line, excerpt: (f.text.split('\n')[line - 1] ?? '').trim().slice(0, 160), why: `an iteration around ${call[1]}() — one deliberate act per item, never a batch` });
    }
    for (const m of code.matchAll(new RegExp(BULK_COPY, 'gi'))) {
      const line = lineAt(m.index ?? 0);
      out.push({ file: f.path, line, excerpt: (f.text.split('\n')[line - 1] ?? '').trim().slice(0, 160), why: `"${m[0]}" offers a bulk authority act` });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/* ───────────────────────── UX-ADR-008: the palette executes nothing ───────────────────────── */

export interface CommandHandoff { kind: 'command'; action: string; label: string; href: string; detail: string }
/** A command offered by the palette or the intent interpreter: a HAND-OFF to the object's page, whose Command Review opens on the action. */
export function commandHandoff(action: string, objectHref: string, label: string, detail = ''): CommandHandoff {
  const sep = objectHref.includes('?') ? '&' : '?';
  return { kind: 'command', action, label, href: `${objectHref}${sep}review=${encodeURIComponent(action)}`, detail: detail || `opens the Command Review for ${action} — nothing runs from here` };
}
/** The review the page should open from its URL (`?review=<action>`), or null. The page still renders its own gate; nothing is preselected. */
export function reviewRequested(search: string): string | null {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('review');
  return v !== null && /^[a-z][a-z0-9_.]{2,120}$/.test(v) ? v : null;
}
const NAVIGATING_KINDS = new Set(['navigate', 'search', 'ask', 'goto']);
/**
 * The guard (B80's assertNavigationOnly, evolved): an entry NAVIGATES (navigate · search · ask · goto) or HANDS OFF a command to a same-origin
 * page whose href names the action under `review=`; no entry carries a function (nothing executes from the palette), and no other kind exists.
 */
export function assertNoExecution(entries: ReadonlyArray<Record<string, unknown>>): void {
  for (const e of entries) {
    const kind = String(e['kind'] ?? '');
    const fn = Object.entries(e).find(([, v]) => typeof v === 'function');
    if (fn !== undefined) throw new Error(`an entry of kind "${kind}" carries ${fn[0]}() — the palette executes nothing; the page's Command Review acts`);
    const href = typeof e['href'] === 'string' ? e['href'] : '';
    if (!href.startsWith('/') || href.startsWith('//')) throw new Error(`an entry of kind "${kind}" does not lead to a page of this product (${href || 'no href'})`);
    if (NAVIGATING_KINDS.has(kind)) continue;
    if (kind === 'command') {
      const action = typeof e['action'] === 'string' ? e['action'] : '';
      if (reviewRequested(href.includes('?') ? href.slice(href.indexOf('?')) : '') !== action) throw new Error(`the command "${action}" does not hand off to its Command Review (review=${action} missing from ${href})`);
      continue;
    }
    throw new Error(`an entry of kind "${kind}" is not admitted — entries navigate or hand off to the page's Command Review`);
  }
}

/* ───────────────────────── CMP-045 / HX-13 / PAT-17: the consequence ───────────────────────── */

export interface ConsequenceView {
  effect: string; affected: string[]; users: string[]; reversibility: string; residualRisk: string; audit: string;
  /** 'server' — a preview the server computed and recorded; 'stated' — the catalogue states the effect (no server preview exists for it) */ source: 'server' | 'stated';
  blockers: string[];
}
const say = (v: unknown, none = 'not stated'): string => (v === null || v === undefined || v === '' ? none : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** The decision commit preview (decision.commit_preview, 0090 §G7) in words. */
export function consequenceFromPreview(preview: Row): ConsequenceView {
  const eff = (preview['intended_effect'] ?? {}) as Row;
  const aff = (preview['affected_objects'] ?? {}) as Row;
  const risk = (preview['residual_risk'] ?? {}) as Row;
  const affected = [
    aff['decision'] !== undefined ? `decision ${shortId(aff['decision'])}` : null,
    `${arr(aff['objectives']).length} objective(s)`, `${arr(aff['runs']).length} run(s)`,
  ].filter((x): x is string => x !== null);
  const users = arr(aff['approvers']).map((a) => `approver ${shortId(typeof a === 'object' && a !== null ? (a as Row)['approver'] ?? (a as Row)['principal'] : a)}`);
  return {
    effect: `${say(eff['statement'], 'the commitment of the approved choice')} (${say(eff['bound_action'], 'decision.commit')}, ${say(eff['op_class'], 'C3')})`,
    affected, users: users.length > 0 ? users : ['the approvers, the action owner and the room (as the record names them)'],
    reversibility: say(preview['reversibility']),
    residualRisk: `${say(risk['conditions_failed'], '0')} failing condition(s), ${say(risk['source_impact_outstanding'], '0')} source-impact marker(s) outstanding`,
    audit: 'the commitment, the CMT, its dependencies, the package events and the audit chain',
    source: 'server', blockers: arr(preview['blockers']).map(String),
  };
}
/** The effect STATED by the command catalogue for an act no server preview exists for (said as stated, never as computed). */
export const COMMAND_EFFECTS: Readonly<Record<string, Omit<ConsequenceView, 'source' | 'blockers'>>> = {
  'decision.package.propose': { effect: 'freezes this version (its digest) and asks the named reviewers to review it — it approves nothing', affected: ['this version'], users: ['the approvers the policy names'], reversibility: 'withdrawn or superseded by a new version; the proposal itself stays in the record', residualRisk: 'none from the proposal; the review is still to come', audit: 'version.proposed on the package events and the audit chain' },
  'decision.approve': { effect: 'records your approval of THIS digest — one of the quorum; it commits nothing', affected: ['this version'], users: ['you (the approver)', 'the committing authority, who sees the quorum'], reversibility: 'revocable by you until the commitment', residualRisk: 'the commit still needs the quorum, the conditions and the authority', audit: 'the approval, version.approved when the quorum is met, the audit chain' },
  'decision.gate.defer': { effect: 'defers this version to its next review, with your conditions and the review\'s owner — nothing is deleted', affected: ['this version', 'its gate.review task'], users: ['the owner of the next review'], reversibility: 'resumed by a person with standing at this gate', residualRisk: 'the decision waits until the next review', audit: 'the gate act, version.deferred, the review task and its timer' },
  'decision.gate.reject': { effect: 'rejects this version at the gate with your rationale — its open gate tasks are cancelled', affected: ['this version', 'its gate tasks'], users: ['the package owner', 'the approvers'], reversibility: 'not reversed — a new version is proposed instead', residualRisk: 'the question stays undecided', audit: 'the gate act, version.rejected_by_owner, the audit chain' },
  'decision.sign.decision': { effect: 'signs the committed decision\'s header digest with this deployment\'s key — an attestation beyond the audit chain', affected: ['the committed version'], users: ['you (the signer)', 'every reader of the record'], reversibility: 'cannot be undone — a signature stays in the record', residualRisk: 'none added; the signature attests what was committed', audit: 'the signature, gate.signed, the audit chain' },
  'decision.sign.approval': { effect: 'signs your approval\'s header digest with this deployment\'s key', affected: ['your approval'], users: ['you (the approver)'], reversibility: 'the approval may still be revoked; the signature stays in the record', residualRisk: 'none added', audit: 'the signature, gate.signed, the audit chain' },
  'decision.package.withdraw': { effect: 'withdraws the package: its open versions are superseded and its gate tasks cancelled — nothing is erased', affected: ['the package', 'its open versions'], users: ['the room', 'the recipients of its distributions'], reversibility: 'not reversed — a new package is declared instead', residualRisk: 'the decision is not taken', audit: 'package.withdrawn with the reason, the audit chain' },
  'decision.gate.resume': { effect: 'resumes the deferred version: its state returns to what its live approvals make it', affected: ['this version', 'its gate.review task'], users: ['the approvers', 'the committing authority'], reversibility: 'deferred again by a person with standing', residualRisk: 'the conditions of the defer are yours to have checked', audit: 'the gate act, version.resumed, the audit chain' },
  'decision.board.approve': { effect: 'records your board approval of THIS digest — one of the board\'s quorum; it commits nothing', affected: ['this version'], users: ['you (a board member)', 'the committing authority'], reversibility: 'revocable by you until the commitment', residualRisk: 'the commit still needs the board quorum and the authority', audit: 'the approval under the board policy, the audit chain' },
  'decision.board.reject': { effect: 'records your board rejection of THIS digest, with your rationale', affected: ['this version'], users: ['the package owner', 'the board'], reversibility: 'revocable by you until the commitment', residualRisk: 'the board quorum may not be reached', audit: 'the rejection under the board policy, the audit chain' },
  'decision.board.defer': { effect: 'defers this board version to its next review, with your conditions — nothing is deleted', affected: ['this version', 'its gate.review task'], users: ['the owner of the next review'], reversibility: 'resumed by a person with standing at this gate', residualRisk: 'the decision waits until the next review', audit: 'the gate act, version.deferred, the review task and its timer' },
  'tenancy.tenant.create': { effect: 'creates an active tenant with lifecycle evidence and audit records', affected: ['a new tenant'], users: ['the platform administrators'], reversibility: 'suspended or retired later — never deleted', residualRisk: 'none until domains and principals are added', audit: 'the tenant lifecycle evidence and the audit chain' },
  'observation.source.register': { effect: 'registers the source contract as a DRAFT — it collects nothing until another operator approves it', affected: ['a new source contract (draft)'], users: ['a collection manager who is not you (the approver)'], reversibility: 'the draft is withdrawn or superseded by a new version', residualRisk: 'none until approved', audit: 'the contract version, its review digest and the audit chain' },
  /* B40 integration (§IN, SP-22): the held upload's decision — a second person approves (release) or declines (reject) it; the page states each */
  'observation.upload.approve': { effect: 'records your decision on this held upload (approve, or decline) — an approval then releases its case into evidence through the quarantine review; a decline rejects its case and KEEPS the bytes in the quarantine volume, the case and its verdicts', affected: ['the upload approval', 'its quarantine case', 'on approval: a new evidence object'], users: ['the uploader', 'the collection managers'], reversibility: 'the decision stays recorded; admitted evidence is corrected or withdrawn later, never erased', residualRisk: 'every engine answered clean; the content is still the uploader\'s', audit: 'upload.approved or upload.declined, case.admitted or case.rejected, the custody chain and the audit chain' },
  /* end B40 integration */
};
export function consequenceStated(action: string): ConsequenceView | null {
  const c = COMMAND_EFFECTS[action];
  return c === undefined ? null : { ...c, source: 'stated', blockers: [] };
}

/* ───────────────────────── CMP-047: the decision digest ───────────────────────── */

export interface DigestView {
  version: number; digest: string | null; frozen: boolean; question: string; options: string[]; evidence: string[]; recommendation: string; dissent: string[];
  conditions: string[]; newer: number | null; note: string;
}
/** The FROZEN version as the record states it; a later version is named as such (the review never moves to it in place). */
export function decisionDigestView(pkg: { statement: string; versions: ReadonlyArray<{ version: number }> }, version: number): DigestView | null {
  const found = pkg.versions.find((x) => x.version === version);
  if (found === undefined) return null;
  const v = found as unknown as Row;
  const digest = typeof v['version_digest'] === 'string' ? v['version_digest'] : null;
  const options = arr(v['options']).map((o) => { const r = o as Row; return `${say(r['title'])} (${say(r['key'])}${r['kind'] === 'status_quo' ? ', status quo' : ''})`; });
  const evidence = arr(v['options']).flatMap((o) => arr((o as Row)['consequences']).map((c) => { const r = c as Row; return `${say(r['kind'])} ${shortId(r['id'])}@${say(r['version'])}`; }));
  const choice = (v['choice'] ?? null) as Row | null;
  const dissent = arr(v['dissent']).map((d) => { const r = d as Row; return `${say(r['position'])} — ${say(r['rationale'])}`; });
  const conditions = [...arr(v['constraints']).map((c) => `constraint: ${typeof c === 'string' ? c : JSON.stringify(c)}`),
                      ...arr(v['missing_information']).map((m) => `missing: ${say((m as Row)['what'])}`)];
  const newest = Math.max(...pkg.versions.map((x) => x.version));
  return {
    version, digest, frozen: digest !== null, question: pkg.statement, options, evidence: [...new Set(evidence)],
    recommendation: choice === null ? 'no choice yet — a menu of options is not a proposal' : `option ${say(choice['option_key'])} — “${say(choice['rationale'])}”`,
    dissent, conditions, newer: newest > version ? newest : null,
    note: digest === null ? 'not frozen: the version is still a draft — nothing can be approved on it' : `frozen at ${shortDigest(digest)} — any change is a new version, never an edit of this one`,
  };
}

/* ───────────────────────── CMP-048: the signature receipt ───────────────────────── */

export interface SignatureReceiptModel extends SignatureReceiptView { verified: boolean; keyId: string; command: string; object: string; result: string; copy: string }
/** A recorded signature (executive.signatures as the gate record serves it) with the write's receipt, in the seam's shape and copyable. */
export function signatureReceiptView(sig: Row, ctx: { command: string; object: string; role?: string | null }): SignatureReceiptModel {
  const view: SignatureReceiptModel = {
    signatureId: say(sig['signature_id'], ''), signer: say(sig['signer'], ''), role: ctx.role ?? null, digest: say(sig['subject_digest'] ?? sig['digest'], ''),
    signedAt: say(sig['signed_at'], ''), boundAction: say(sig['bound_action'], ctx.command), verified: sig['verified'] === true, keyId: say(sig['key_id'], 'no key'),
    command: ctx.command, object: ctx.object, result: sig['verified'] === true ? 'VERIFIED by the server' : 'NOT VERIFIED — the signature does not match the digest the record holds', copy: '',
  };
  view.copy = [`signature ${view.signatureId}`, `signer ${view.signer}${view.role ? ` (${view.role})` : ''}`, `command ${view.command}`, `object ${view.object}`, `digest ${view.digest}`,
               `key ${view.keyId}`, `signed at ${view.signedAt}`, `result ${view.result}`].join('\n');
  return view;
}

/* ───────────────────────── PAT-06: the review record ───────────────────────── */

export interface ReviewRecordModel { reviewer: string; version: number | null; evidence: string; findings: string; at: string | null; act: string; authority: 'not decision authority' }
/** A gate act of the review family (review, acknowledge, ready) as a review record — never shown as authority. */
export function reviewRecordView(a: Row, versionDigest: string | null): ReviewRecordModel | null {
  const act = String(a['action'] ?? '');
  if (!['review', 'acknowledge', 'ready'].includes(act)) return null;
  const evidence = act === 'ready' && typeof a['information_package_digest'] === 'string'
    ? `the information package ${shortDigest(a['information_package_digest'])}`
    : versionDigest !== null ? `the version as proposed (${shortDigest(versionDigest)})` : 'the version as it stood (no digest recorded)';
  return { reviewer: say(a['actor_principal_id'], 'unknown'), version: typeof a['version'] === 'number' ? a['version'] : null, evidence, findings: say(a['rationale'], 'no findings stated'),
           at: typeof a['at'] === 'string' ? a['at'] : null, act: act === 'ready' ? 'marked decision-ready' : act === 'acknowledge' ? 'acknowledged' : 'reviewed', authority: 'not decision authority' };
}

/* ───────────────────────── PAT-08: the defer intake ───────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The defer's payload (rationale, next review, conditions, owner — 0119 §HA), or the reason it is not one yet. The server re-validates. */
export function deferIntake(f: { rationale: string; nextReviewAt: string; conditions: readonly string[]; owner: string }, now: Date = new Date()): Row | string {
  if (f.rationale.trim().length < 8) return 'state the rationale (8+ characters)';
  const at = new Date(f.nextReviewAt);
  if (f.nextReviewAt === '' || Number.isNaN(at.getTime())) return 'name the next review (a date and time)';
  if (at.getTime() <= now.getTime()) return 'the next review is in the future';
  if (at.getTime() > now.getTime() + 180 * 86_400_000) return 'the next review is within 180 days';
  const conditions = f.conditions.map((c) => c.trim()).filter((c) => c !== '');
  if (conditions.length === 0) return 'state at least one condition for the next review';
  if (conditions.length > 12) return 'at most 12 conditions';
  if (conditions.some((c) => c.length < 4 || c.length > 500)) return 'each condition is 4 to 500 characters';
  if (new Set(conditions.map((c) => c.toLowerCase())).size !== conditions.length) return 'state each condition once';
  const owner = f.owner.trim();
  if (owner !== '' && !UUID.test(owner)) return 'the owner of the next review is a principal id (blank: you own it)';
  return { rationale: f.rationale.trim(), nextReviewAt: at.toISOString(), conditions, ...(owner === '' ? {} : { owner }) };
}
/** A recorded defer in words — what was captured, and what a pre-B81 defer did not capture (said, never back-filled). */
export function deferLine(a: Row): string | null {
  if (a['action'] !== 'defer') return null;
  const cs = Array.isArray(a['defer_conditions']) ? (a['defer_conditions'] as unknown[]).map(String) : null;
  const owner = typeof a['defer_owner_principal_id'] === 'string' ? a['defer_owner_principal_id'] : null;
  const when = typeof a['next_review_at'] === 'string' ? a['next_review_at'] : 'no next review';
  if (cs === null && owner === null) return `deferred to ${when} — recorded before conditions and an owner were captured`;
  return `deferred to ${when} · owner ${owner === null ? 'not recorded' : shortId(owner)} · ${cs === null || cs.length === 0 ? 'no conditions stated' : `conditions: ${cs.map((c) => `“${c}”`).join('; ')}`}`;
}

/* ───────────────────────── PAT-11: the withdrawal ───────────────────────── */

export interface WithdrawalModel { identity: string; reason: string; recipients: string[]; replacement: string; erased: false }
/** The withdrawal as the record holds it: who and when, why, who had received the record, what replaces it — absence said, nothing erased. */
export function withdrawalView(f: { by?: unknown; at?: unknown; reason?: unknown; recipients?: ReadonlyArray<Row>; replacement?: { href: string; label: string } | null }): WithdrawalModel {
  return {
    identity: f.by === undefined || f.by === null ? 'withdrawn — the actor is not recorded' : `withdrawn by ${shortId(f.by)}${typeof f.at === 'string' ? ` at ${f.at}` : ''}`,
    reason: say(f.reason, 'no reason recorded'),
    recipients: (f.recipients ?? []).length === 0 ? ['no distribution recorded — nobody had received the record'] : (f.recipients ?? []).map((d) => `${shortId(d['recipient_principal_id'])} via ${say(d['channel'])}`),
    replacement: f.replacement === undefined || f.replacement === null ? 'no replacement recorded' : `replaced by ${f.replacement.label}`,
    erased: false,
  };
}

/* ───────────────────────── HX-14: the contest path ───────────────────────── */

export interface ContestRoute { type: string; label: string; challenge: string | null; appeal: string | null; page: string }
/** The DECISION-ACTIVE object types and their contest paths: the B36 challenge (a decision version) and the B35 appeal subject kind. */
export const CONTEST_PATHS: readonly ContestRoute[] = [
  { type: 'DPK', label: 'decision package', challenge: 'decision.challenge', appeal: 'package', page: '/decisions' },
  { type: 'recommendation', label: 'recommendation', challenge: null, appeal: 'recommendation', page: '/decisions/explanations' },
  { type: 'explanation', label: 'explanation', challenge: null, appeal: 'explanation', page: '/decisions/explanations' },
  { type: 'forecast', label: 'forecast', challenge: null, appeal: 'forecast', page: '/decisions/explanations' },
  { type: 'source', label: 'source contract', challenge: null, appeal: 'source', page: '/decisions/explanations' },
  { type: 'claim', label: 'claim', challenge: null, appeal: 'claim', page: '/decisions/explanations' },
];
export const DECISION_ACTIVE_TYPES: readonly string[] = ['DPK', 'recommendation', 'explanation', 'forecast', 'source', 'claim'];
export const contestPathFor = (type: string): ContestRoute | null => CONTEST_PATHS.find((c) => c.type === type) ?? null;
/** The registry check: the decision-active types WITHOUT a contest path (must be empty). */
export const missingContestPaths = (types: readonly string[]): string[] => types.filter((t) => { const c = contestPathFor(t); return c === null || (c.challenge === null && c.appeal === null); });

export interface ContestRow { kind: 'challenge' | 'appeal'; id: string; raisedBy: string; evidence: string; reviewer: string; status: string; escalation: string; outcome: string }
/** The B36 challenges and the B35 appeal cases on one object, as the contest path's rows (challenge, evidence, reviewer, status, escalation, outcome). */
export function contestRows(challenges: ReadonlyArray<Row>, appeals: ReadonlyArray<Row>): ContestRow[] {
  const ch = challenges.map((c): ContestRow => ({
    kind: 'challenge', id: say(c['challenge_id'], ''), raisedBy: `${shortId(c['challenger_principal_id'])} (${say(c['standing'], 'standing not recorded')})`,
    evidence: say(c['reason'], 'no reason recorded'), reviewer: c['resolved_by'] ? shortId(c['resolved_by']) : 'the package owner (to resolve)',
    status: c['resolved_at'] ? `resolved: ${say(c['resolution'])}` : 'open — the commitment is held',
    escalation: c['after_commitment'] === true ? 'after the commitment — an upheld challenge requires a reopen' : 'before the commitment — the commit is held while it is open',
    outcome: c['resolved_at'] ? say(c['resolution_note'], 'no note') : 'pending',
  }));
  const ap = appeals.map((a): ContestRow => ({
    kind: 'appeal', id: say(a['case_id'], ''), raisedBy: shortId(a['appellant_principal_id']),
    evidence: `${arr(a['evidence']).length} evidence item(s) — grounds: ${say(a['grounds'], 'none stated')}`,
    reviewer: a['adjudicator_principal_id'] ? shortId(a['adjudicator_principal_id']) : 'no adjudicator assigned yet',
    status: `${say(a['state'])}${a['closure'] ? ` (${String(a['closure'])})` : ''}`,
    escalation: a['overdue'] === true ? `OVERDUE — the response was due ${say(a['deadline_at'])}` : `response due ${say(a['deadline_at'])}`,
    outcome: a['outcome'] === null || a['outcome'] === undefined ? 'not adjudicated' : String(a['outcome']).replace('_', ' '),
  }));
  return [...ch, ...ap];
}

/* ───────────────────────── UX-ADR-007: authority as product state ───────────────────────── */

/** The consequential gates that render human authority as product state, and where (the route; the components each composes). */
export const AUTHORITY_SURFACES: ReadonlyArray<{ gate: string; route: string; banner: boolean; digest: boolean; receipt: boolean; carrier: string | null }> = [
  { gate: 'decision approval and commitment', route: '/decisions', banner: true, digest: true, receipt: true, carrier: null },
  { gate: 'board decision', route: '/decisions/board', banner: true, digest: true, receipt: true, carrier: null },
  { gate: 'source contract registration (submitted for approval)', route: '/observation/sources/new', banner: true, digest: true, receipt: true, carrier: null },
  { gate: 'tenant creation', route: '/admin/tenants', banner: false, digest: true, receipt: true, carrier: null },
  { gate: 'theme certification', route: '/admin/governance/design/themes', banner: true, digest: true, receipt: true, carrier: 'the B80 themes page composes the banner when its stage next touches it (§RE / B82)' },
  { gate: 'design acceptance', route: '/admin/governance/design', banner: true, digest: true, receipt: true, carrier: 'a Field-fork page (§RE migrates it); the banner is composed there after the migration' },
];

/* ───────────────────────── helpers ───────────────────────── */

export function shortId(v: unknown): string {
  return typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v);
}
export function shortDigest(v: unknown): string {
  return typeof v === 'string' && v.length > 16 ? `${v.slice(0, 8)}…${v.slice(-4)}` : say(v, '—');
}
/** The person's role codes in a domain scope (bindings at PLATFORM, or at DOMAIN for this domain, or at TENANT for this tenant). */
export function rolesIn(bindings: ReadonlyArray<{ roleCode: string; scope: string; tenantId: string | null; domainId: string | null }>, scope: { tenantId: string; domainId: string }): string[] {
  return [...new Set(bindings.filter((b) => b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId) || (b.scope === 'TENANT' && b.tenantId === scope.tenantId)).map((b) => b.roleCode))].sort();
}
/** The PDP rules' roles for the acts the decision pages offer (apps/api/src/policy/pdp.service.ts — the test reads the file and compares). */
export const ACT_ROLES: Readonly<Record<string, readonly string[]>> = {
  'decision.package.propose': ['decision_owner', 'platform_admin'],
  'decision.approve': ['decision_approver'],
  'decision.commit': ['decision_authority'],
  'decision.commit.preview': ['decision_authority'],
  'decision.gate.defer': ['decision_owner', 'decision_approver', 'decision_authority'],
  'decision.gate.reject': ['decision_owner', 'decision_approver', 'decision_authority'],
  'decision.sign.decision': ['decision_owner', 'decision_authority'],
  'decision.sign.approval': ['decision_approver', 'board_member'],
};
