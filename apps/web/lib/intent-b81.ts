/**
 * CP-6 B81 §SI (F-P7-E-02) — THE DETERMINISTIC INTENT INTERPRETER and the palette's modes, as pure functions (D4 / Q2: rule-based, NO
 * model, no dependency; the same words and the same governed hits always give the same reading). It only PROPOSES (UX-13-004): a reading is
 * shown before any result or review; it never executes, never chooses for the person and never guesses silently (PAT-15).
 *
 *   THE MODES         Go to · Search · Ask · Command (UX-13-001 / UX-13-003): visually and behaviourally distinct, chosen by the person
 *                     (a tab, or a typed prefix shown as the switch it is: `/` Search, `?` Ask, `>` Command) — never inferred silently.
 *                     Go to navigates; Search searches the words as typed; Ask reads the words (kind words, phrases, a command verb) and
 *                     shows that reading first; Command finds a command and HANDS IT OFF to its page's Command Review (§HA commandHandoff).
 *   interpret         input + mode (+ the governed hits, once the reads ran) → a reading: the kind (navigate · search · command · ambiguous ·
 *                     none), the kind words named (exposure, objective …), the phrases searched, the scoped query, the command, the
 *                     uncertainty in words, and — when a phrase names more than one record, or a verb more than one command — a BOUNDED
 *                     CLARIFICATION with the alternatives, NONE preselected (`chosen` is always null: only the person chooses).
 *   unsupported       a destructive verb (delete, erase, purge …) or an unknown command is said to be unsupported — never mapped to the
 *                     nearest act.
 *   disagreement      two interpreter versions reading the same words differently (UX-13-005 "interpreted differently") become an
 *                     ambiguity the person resolves — e.g. a saved search recorded under an earlier interpreter, reopened under this one.
 *   intentRecordOf    the reading as the intent record's intake (0119 §SI — shell.intent.record), the person's choice and the outcome.
 *
 * THREE CLAIMS: construction (this module and its test); demonstrated operation (the act's palette scene, SYNTHETIC); real acceptance (H3)
 * — never claimed.
 */
import type { Interpretation, PaletteMode } from './b81-seams';
import { commandHandoff, type CommandHandoff } from './authority-b81';

/** The interpreter's version, recorded on every intent record (0119 §SI: `b81-si-<name>-<n>`). */
export const INTERPRETER_VERSION = 'b81-si-intent-1';
/** The literal reading (every word searched as typed): the second version the disagreement rule is exercised with. */
export const LITERAL_INTERPRETER = 'b81-si-literal-1';
export type InterpreterVersion = typeof INTERPRETER_VERSION | typeof LITERAL_INTERPRETER;

/* ═════════════════════════════ THE MODES (UX-13-001, UX-13-003) ═════════════════════════════ */
export const PALETTE_MODES: readonly PaletteMode[] = ['goto', 'search', 'ask', 'command'];
export interface ModeSpec { label: string; prefix: string; inputLabel: string; says: string }
export const MODE_SPEC: Readonly<Record<PaletteMode, ModeSpec>> = {
  goto: { label: 'Go to', prefix: '', inputLabel: 'Go to — type a place or a workspace', says: 'Go to a place — going there changes nothing.' },
  search: { label: 'Search', prefix: '/', inputLabel: 'Search — the words are searched as typed', says: 'Search the words as typed, in this domain — reads only, within what you may see.' },
  ask: { label: 'Ask', prefix: '?', inputLabel: 'Ask — say what you are looking for', says: 'Say what you want: the reading is shown before anything happens (a deterministic interpreter — no model). Nothing runs.' },
  command: { label: 'Command', prefix: '>', inputLabel: 'Command — name the act and its object', says: 'Find a command: it opens the Command Review on its page, where you decide. Nothing runs from here.' },
};
/** A typed prefix switches the mode VISIBLY (the tab changes; the prefix leaves the text). `switched` says it happened. */
export function parseModePrefix(raw: string, current: PaletteMode): { mode: PaletteMode; text: string; switched: boolean } {
  for (const m of ['search', 'ask', 'command'] as const) {
    const p = MODE_SPEC[m].prefix;
    if (raw.startsWith(p)) return { mode: m, text: raw.slice(p.length).replace(/^\s+/, ''), switched: m !== current };
  }
  return { mode: current, text: raw, switched: false };
}

/* ═════════════════════════════ THE VOCABULARY ═════════════════════════════ */
/** Kind words → the kind of record they name (and the leg that reads it). A kind word scopes; it is never searched as text. */
export const KIND_WORDS: Readonly<Record<string, string>> = {
  exposure: 'exposure', exposures: 'exposure', risk: 'exposure', risks: 'exposure', opportunity: 'exposure', opportunities: 'exposure',
  objective: 'objective', objectives: 'objective', goal: 'objective', goals: 'objective',
  capability: 'capability', capabilities: 'capability', stakeholder: 'stakeholder', stakeholders: 'stakeholder',
  initiative: 'initiative', initiatives: 'initiative', assumption: 'assumption', assumptions: 'assumption', measure: 'measure', measures: 'measure',
  package: 'package', packages: 'package', decision: 'package', decisions: 'package',
  entity: 'entity', entities: 'entity', place: 'entity', places: 'entity', claim: 'claim', claims: 'claim', evidence: 'evidence',
  product: 'product', products: 'product', dataset: 'product', datasets: 'product', schema: 'product', schemas: 'product',
};
/** The strategy graph's object types as kinds (graph.strategy_current object_type). */
export const STRATEGY_KINDS: Readonly<Record<string, string>> = {
  OBJ: 'objective', ASU: 'assumption', DEC: 'decision', CMT: 'commitment', OUT: 'outcome', CAP: 'capability', INI: 'initiative', RSC: 'resource', MSR: 'measure',
  STK: 'stakeholder', RSK: 'risk',
};
const STOP_WORDS = new Set(['of', 'at', 'for', 'in', 'on', 'to', 'with', 'the', 'a', 'an', 'and', 'about', 'near', 'from', 'by', 'show', 'find', 'me', 'all', 'what', 'is', 'are']);
/** Verbs the palette never offers — nothing in this product is erased from a palette (and no such act is mapped to its nearest neighbour). */
export const UNSUPPORTED_VERBS: readonly string[] = ['delete', 'erase', 'purge', 'drop', 'destroy', 'wipe', 'remove', 'truncate', 'execute', 'run'];

/* ═════════════════════════════ THE COMMAND CATALOGUE ═════════════════════════════ */
export interface CommandSpec {
  action: string;
  /** verb + object (dg-lint-3's verb-object rule) */ label: string;
  verbs: readonly string[];
  /** the kind of record the command acts on */ object: 'package';
  /** words that select this command among those sharing a verb */ qualifiers: readonly string[];
  /** the page whose Command Review acts (it lists the objects when none is named) */ page: string;
  /** the object's own place on that page */ objectHref: (id: string) => string;
}
/** Only commands whose page renders the Command Review (§HA) — the hand-off opens it there; the page decides eligibility and acts. */
export const COMMANDS: readonly CommandSpec[] = [
  { action: 'decision.approve', label: 'Approve a decision package version', verbs: ['approve'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.package.propose', label: 'Propose a decision package version', verbs: ['propose', 'submit'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.package.withdraw', label: 'Withdraw a decision package', verbs: ['withdraw'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.gate.defer', label: 'Defer a decision package version', verbs: ['defer', 'postpone'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.gate.reject', label: 'Reject a decision package version', verbs: ['reject'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.sign.decision', label: 'Sign a committed decision', verbs: ['sign'], object: 'package', qualifiers: [], page: '/decisions', objectHref: (id) => `/decisions?package=${id}` },
  { action: 'decision.board.approve', label: 'Approve a board decision version', verbs: ['approve'], object: 'package', qualifiers: ['board'], page: '/decisions/board', /* the board page lists its packages (it opens none by link yet) */ objectHref: () => '/decisions/board' },
];
const VERBS = new Set(COMMANDS.flatMap((c) => c.verbs));

/* ═════════════════════════════ THE READING ═════════════════════════════ */
/** A governed hit the reading is checked against (lib/search-b81 FederatedHit carries these fields). */
export interface IntentHit { key: string; kind: string; label: string; href: string; leg: string; id: string }
export interface Alternative { key: string; label: string; kind: string; target: string; detail?: string }
export interface Reading extends Interpretation {
  interpreter: InterpreterVersion;
  mode: PaletteMode;
  /** the kinds the words named (scoping, never searched as text) */ kinds: string[];
  /** the phrases searched (the text between kind words, verbs and stop words) */ phrases: string[];
  scopedQuery: string | null;
  command: CommandSpec | null;
  /** what the reading is unsure of, in words */ uncertainty: string[];
  /** why nothing is offered (unsupported, empty) */ reason: string | null;
  /** the bounded clarification (a question in words), when the reading is ambiguous */ clarification: string | null;
  alternatives: Alternative[];
  /** the phrase the clarification is about */ ambiguousPhrase: string | null;
  /** the hand-offs a command reading offers (never executed; each opens its page's Command Review) */ handoffs: CommandHandoff[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFKC');
const tokensOf = (s: string) => s.trim().split(/\s+/).filter((t) => t !== '');
const cap = (s: string) => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
const quote = (s: string) => `“${s}”`;
const byKey = (a: { kind: string; label: string; key: string }, b: { kind: string; label: string; key: string }) =>
  a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
const MAX_ALTERNATIVES = 12;

/** The words of the input split into kind words, a leading command verb, and the PHRASES between them (stop words split, never kept). */
export function wordsOf(text: string): { verb: string | null; kinds: string[]; phrases: string[] } {
  const toks = tokensOf(text);
  const first = toks.length > 0 ? norm(toks[0]!) : '';
  const verb = VERBS.has(first) || UNSUPPORTED_VERBS.includes(first) ? first : null;
  const kinds: string[] = []; const phrases: string[] = []; let cur: string[] = [];
  const flush = () => { if (cur.length > 0) { phrases.push(cur.join(' ')); cur = []; } };
  toks.forEach((t, i) => {
    const w = norm(t).replace(/[.,;:!?]+$/, '');
    if (i === 0 && verb !== null) return;
    if (KIND_WORDS[w] !== undefined) { if (!kinds.includes(KIND_WORDS[w]!)) kinds.push(KIND_WORDS[w]!); flush(); return; }
    if (STOP_WORDS.has(w)) { flush(); return; }
    cur.push(t.replace(/[.,;:!?]+$/, ''));
  });
  flush();
  return { verb, kinds, phrases: phrases.filter((p) => p.length >= 2) };
}
/** The hits that match a phrase (the label contains it, case-insensitive), in a canonical order. */
export function hitsFor(phrase: string, hits: readonly IntentHit[]): IntentHit[] {
  const p = norm(phrase);
  return hits.filter((h) => norm(h.label).includes(p)).sort(byKey);
}
const altOf = (h: IntentHit): Alternative => ({ key: h.key, label: h.label, kind: h.kind, target: h.href, detail: `the ${h.kind} ${quote(h.label)} (${h.leg})` });
const kindList = (ks: readonly string[]) => (ks.length <= 1 ? ks.join('') : `${ks.slice(0, -1).join(', ')} or ${ks[ks.length - 1]}`);
/** The server keeps a clarification to 500 characters (0119 §SI): each record is named by at most 60 characters of its label in the
 *  question (the alternatives keep the whole label), and a list too long for the bound names the first records and counts the rest. */
export const CLARIFICATION_MAX = 500;
const clip = (s: string, n = 60) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
function boundedQuestion(head: string, items: readonly string[]): string {
  for (let k = items.length; k >= 1; k -= 1) {
    const shown = k === items.length ? items : [...items.slice(0, k), `${items.length - k} more`];
    const q = `${head}${kindList(shown)}?`;
    if (q.length <= CLARIFICATION_MAX) return q;
  }
  return `${head.slice(0, CLARIFICATION_MAX - 2)}…?`;
}

/**
 * THE INTERPRETER. Deterministic: the same input, mode, hits and version always give the same reading. `hits` absent = the palette's
 * preview, before any read (the reading says it is not yet checked); present = the governed reads' answers (the page's reading).
 */
export function interpret(input: string, opts: { mode: PaletteMode; hits?: readonly IntentHit[] | null; version?: InterpreterVersion }): Reading {
  const version = opts.version ?? INTERPRETER_VERSION;
  const mode = opts.mode;
  const text = input.trim();
  const base = (o: Partial<Reading>): Reading => ({
    input, kind: 'none', options: [], chosen: null, interpreter: version, mode, kinds: [], phrases: [], scopedQuery: null, command: null, uncertainty: [], reason: null,
    clarification: null, alternatives: [], ambiguousPhrase: null, handoffs: [], ...o,
  } as Reading);
  if (text === '') return base({ reason: 'nothing typed yet' });
  if (mode === 'goto') return base({ kind: 'navigate', phrases: [text], scopedQuery: text });
  // the literal reading (the second interpreter version): every word searched as typed, no kind words, no commands
  if (version === LITERAL_INTERPRETER || mode === 'search') {
    const w = wordsOf(text);
    const looksLikeCommand = mode === 'search' && w.verb !== null && VERBS.has(w.verb);
    return base({ kind: 'search', phrases: [text], scopedQuery: text,
      uncertainty: looksLikeCommand ? [`${quote(text)} reads like a command — Search only searches the words; Command mode opens its review`] : [] });
  }
  const w = wordsOf(text);
  if (w.verb !== null && UNSUPPORTED_VERBS.includes(w.verb)) {
    return base({ kind: 'none', reason: `unsupported: the palette offers no command to ${quote(w.verb)} — nothing is erased or run from here; search for the record instead and act on its page` });
  }
  const hits = opts.hits ?? null;
  const scopedQuery = w.phrases.length === 0 ? null : w.phrases.join(' ');
  const preview = hits === null ? ['not yet checked against what you may see — the reading is confirmed when the search runs'] : [];

  // ── a COMMAND reading (Command mode, or Ask with a leading command verb): proposed only, handed off to its review
  if (w.verb !== null && (mode === 'command' || mode === 'ask')) {
    const sharing = COMMANDS.filter((c) => c.verbs.includes(w.verb!));
    const qualified = sharing.filter((c) => c.qualifiers.length > 0 && c.qualifiers.some((q) => text.toLowerCase().includes(q)));
    const candidates = qualified.length > 0 ? qualified : sharing.filter((c) => c.qualifiers.length === 0);
    if (candidates.length === 0) return base({ kind: 'none', reason: `unsupported: no command reads ${quote(w.verb)} here` });
    const qualifierWords = new Set(candidates.flatMap((c) => c.qualifiers));
    const phrases = w.phrases.map((p) => p.split(' ').filter((x) => !qualifierWords.has(norm(x))).join(' ')).filter((p) => p.length >= 2);
    if (candidates.length > 1) {
      const alternatives = candidates.map((c) => ({ key: c.action, label: c.label, kind: 'command', target: commandHandoff(c.action, c.page, c.label).href }));
      return base({ kind: 'ambiguous', kinds: w.kinds, phrases, scopedQuery, alternatives, options: alternatives.map(({ label, target }) => ({ label, target })),
        clarification: `Which command do you mean — ${kindList(candidates.map((c) => c.label.toLowerCase()))}?`, uncertainty: [`${quote(w.verb)} names ${candidates.length} commands`] });
    }
    const c = candidates[0]!;
    const objects = hits === null ? [] : phrases.flatMap((p) => hitsFor(p, hits)).filter((h) => h.kind === c.object);
    const unique = [...new Map(objects.map((h) => [h.key, h])).values()].sort(byKey).slice(0, MAX_ALTERNATIVES);
    const handoffs = unique.length === 0 ? [commandHandoff(c.action, c.page, c.label, `opens ${c.page}, which lists the records — choose one there; nothing runs from here`)]
      : unique.map((h) => commandHandoff(c.action, c.objectHref(h.id), `${c.label} — ${h.label}`));
    const alternatives = handoffs.map((x, i) => ({ key: unique[i]?.key ?? x.action, label: x.label, kind: 'command', target: x.href, detail: x.detail }));
    const uncertainty = [...preview, ...(hits !== null && phrases.length > 0 && unique.length === 0 ? [`no ${c.object} you may see matches ${quote(phrases.join(' '))} — the page lists them`] : [])];
    if (unique.length > 1) {
      return base({ kind: 'ambiguous', command: c, kinds: w.kinds, phrases, scopedQuery, handoffs, alternatives, options: alternatives.map(({ label, target }) => ({ label, target })),
        clarification: boundedQuestion(`Which ${c.object} do you mean — `, unique.map((h) => quote(clip(h.label)))), ambiguousPhrase: phrases.join(' '), uncertainty: [...uncertainty, `${unique.length} ${c.object}s match`] });
    }
    return base({ kind: 'command', command: c, kinds: w.kinds, phrases, scopedQuery, handoffs, alternatives, options: alternatives.map(({ label, target }) => ({ label, target })),
      uncertainty: [...uncertainty, 'a command is consequential: its Command Review states the effect, your eligibility and the digest before anything happens'] });
  }

  // ── a SEARCH reading (Ask): kind words scope it; each phrase is checked against the hits
  if (w.phrases.length === 0) return base({ kind: 'none', kinds: w.kinds, reason: w.kinds.length > 0 ? `name what to look for — ${kindList(w.kinds)} of what?` : 'nothing to search for' });
  const uncertainty = [...preview];
  if (hits !== null) {
    for (const p of w.phrases) {
      const hs = hitsFor(p, hits);
      if (hs.length === 0) uncertainty.push(`${quote(p)} matches nothing you may see`);
      const distinct = [...new Map(hs.map((h) => [h.key, h])).values()];
      if (distinct.length > 1) {
        const alternatives = distinct.slice(0, MAX_ALTERNATIVES).map(altOf);
        const kinds = [...new Set(distinct.map((h) => h.kind))];
        return base({ kind: 'ambiguous', kinds: w.kinds, phrases: w.phrases, scopedQuery, ambiguousPhrase: p, alternatives, options: alternatives.map(({ label, target }) => ({ label, target })),
          clarification: boundedQuestion(`Which ${quote(p)} do you mean — `, distinct.slice(0, MAX_ALTERNATIVES).map((h) => `the ${h.kind} ${quote(clip(h.label))}`)),
          uncertainty: [...uncertainty, `${quote(p)} matches ${distinct.length} records of ${kinds.length} kind(s)${distinct.length > MAX_ALTERNATIVES ? ` — the first ${MAX_ALTERNATIVES} are offered; refine the words for the rest` : ''}`] });
      }
    }
  }
  return base({ kind: 'search', kinds: w.kinds, phrases: w.phrases, scopedQuery, uncertainty });
}

/** UX-13-005 "interpreted differently": two readings of the same words that differ in kind, scope or kinds — an ambiguity the person resolves. */
export function disagreement(a: Reading, b: Reading): Reading | null {
  const same = a.kind === b.kind && a.scopedQuery === b.scopedQuery && a.kinds.join(',') === b.kinds.join(',') && (a.command?.action ?? null) === (b.command?.action ?? null);
  if (same) return null;
  const say = (r: Reading) => r.kind === 'command' && r.command !== null ? `the command ${quote(r.command.label)}` : r.kinds.length > 0 ? `${kindList(r.kinds)} of ${quote(r.scopedQuery ?? '')}` : `${quote(r.scopedQuery ?? r.input)} as typed`;
  const target = (r: Reading) => `/graph/search/all?q=${encodeURIComponent(r.input)}&mode=${r.mode}&interpreter=${r.interpreter}`;
  const alternatives: Alternative[] = [a, b].map((r) => ({ key: r.interpreter, label: cap(say(r)), kind: 'reading', target: target(r), detail: `read by ${r.interpreter}` }));
  return {
    ...a, kind: 'ambiguous', alternatives, options: alternatives.map(({ label, target: t }) => ({ label, target: t })), chosen: null, handoffs: [], command: null,
    clarification: `Two readings of your words differ: ${say(a)} (${a.interpreter}) or ${say(b)} (${b.interpreter}) — which do you mean?`,
    uncertainty: [...a.uncertainty, `${a.interpreter} and ${b.interpreter} read ${quote(a.input)} differently`], ambiguousPhrase: null,
  };
}

/** The palette's own reading of the input in the current mode (no hits yet): what is shown BEFORE results or a review (UX-13-001). */
export function previewLine(r: Reading): string {
  if (r.reason !== null) return cap(r.reason);
  if (r.kind === 'navigate') return `Go to a place matching ${quote(r.input.trim())}.`;
  if (r.kind === 'command' && r.command !== null) return `Command: ${r.command.label.toLowerCase()}${r.phrases.length > 0 ? ` — ${quote(r.phrases.join(' '))}` : ''}. It opens its Command Review; nothing runs from here.`;
  if (r.kind === 'ambiguous') return r.clarification ?? 'More than one reading — choose one.';
  const scope = r.kinds.length > 0 ? `${kindList(r.kinds)} of ` : '';
  return `Search ${scope}${r.phrases.map(quote).join(' and ')}${r.mode === 'search' ? ' (the words as typed)' : ''}.`;
}

/* ═════════════════════════════ THE INTENT RECORD (0119 §SI) ═════════════════════════════ */
export type IntentOutcome = 'chosen' | 'literal' | 'cancelled' | 'command_review' | 'navigated' | 'unsupported';
export interface IntentRecordIntake {
  mode: PaletteMode; input: string; interpreter: string;
  interpretation: { kind: Interpretation['kind']; scoped_query: string | null; kinds: string[]; terms: string[]; command: string | null; uncertainty: string[]; reason: string | null };
  alternatives: Alternative[]; clarification: string | null; choice: string | null; outcome: IntentOutcome; commandAction: string | null; respondsTo: string | null;
}
/**
 * The reading as the record's intake. The outcome follows the person's act: a choice among the alternatives (`chosen`), the words searched
 * as typed (`literal`), the clarification abandoned (`cancelled`), a command's review opened (`command_review` — never "executed"), a place
 * opened (`navigated`), or nothing offered (`unsupported`). A choice the reading did not offer is refused here as it is by the port.
 */
export function intentRecordOf(r: Reading, act: { outcome: IntentOutcome; choice?: string | null; respondsTo?: string | null }): IntentRecordIntake | string {
  const choice = act.choice ?? null;
  if (choice !== null && !r.alternatives.some((a) => a.key === choice)) return `the choice ${quote(choice)} is not one of the alternatives offered`;
  if (r.kind === 'ambiguous' && (act.outcome === 'command_review' || act.outcome === 'navigated') && choice === null) return 'an ambiguous reading leads nowhere until you choose';
  const handoff = act.outcome === 'command_review'
    ? (r.alternatives.find((a) => a.key === choice)?.target ?? r.handoffs[0]?.href ?? null) : null;
  const action = act.outcome === 'command_review' ? (r.command?.action ?? (choice !== null && COMMANDS.some((c) => c.action === choice) ? choice : null)) : null;
  if (act.outcome === 'command_review' && (action === null || handoff === null)) return 'a command review names its command and its page';
  return {
    mode: r.mode, input: r.input, interpreter: r.interpreter,
    interpretation: { kind: r.kind, scoped_query: r.scopedQuery, kinds: r.kinds, terms: r.phrases, command: r.command?.action ?? null, uncertainty: r.uncertainty, reason: r.reason },
    alternatives: r.alternatives.map((a) => ({ key: a.key, label: a.label.slice(0, 300), kind: a.kind, target: a.target, ...(a.detail === undefined ? {} : { detail: a.detail.slice(0, 500) }) })),
    clarification: r.clarification, choice: act.outcome === 'literal' || act.outcome === 'cancelled' || act.outcome === 'unsupported' ? null : choice,
    outcome: act.outcome, commandAction: action, respondsTo: act.respondsTo ?? null,
  };
}

/** The palette's command entries for the typed words (Command mode, before any read): hand-offs only — each opens its page's review. */
export function commandEntries(text: string): CommandHandoff[] {
  const t = norm(text.trim());
  const words = t.split(/\s+/).filter((x) => x !== '');
  const hit = (c: CommandSpec) => words.length === 0 || words.every((x) => norm(c.label).includes(x) || c.verbs.includes(x) || c.qualifiers.includes(x) || c.action.includes(x))
    || (words.length > 0 && c.verbs.includes(words[0]!));
  return COMMANDS.filter(hit).map((c) => commandHandoff(c.action, c.page, c.label, `opens the Command Review on ${c.page} — nothing runs from here`));
}

/* ═════════════════════════════ THE PALETTE'S ITEMS PER MODE (UX-13-001, UX-13-003) ═════════════════════════════ */
export type { PaletteMode } from './b81-seams';
/** The page that runs a search or an Ask reading over the governed reads (the graph workspace's federated search, WS-03). */
export const SEARCH_PAGE = '/graph/search/all';
export function searchPageHref(q: string, mode: PaletteMode, review: string | null = null): string {
  return `${SEARCH_PAGE}?q=${encodeURIComponent(q)}&mode=${mode}${review === null ? '' : `&review=${encodeURIComponent(review)}`}`;
}
/** A palette item: it NAVIGATES (search · ask) or HANDS OFF a command to its Command Review (command) — no item carries a function. */
export interface PaletteItem { kind: 'search' | 'ask' | 'command'; href: string; label: string; detail: string; action?: string }
/**
 * The items of the Search, Ask and Command modes for the typed words (Go to's are B80's navigation entries). `inDomain` false (the admin
 * workspace) — no domain to search: the reason is said and nothing is offered. Every item passes §HA's assertNoExecution.
 */
export function modeItems(mode: Exclude<PaletteMode, 'goto'>, text: string, inDomain: boolean): { items: PaletteItem[]; reason: string | null } {
  const t = text.trim();
  if (t === '') return { items: [], reason: mode === 'command' ? null : 'Type the words first.' };
  const noDomain = 'Search runs in a domain workspace — this workspace has no domain to search. Open a domain workspace first.';
  if (mode === 'search') {
    return inDomain ? { items: [{ kind: 'search', href: searchPageHref(t, 'search'), label: `Search “${t}”`, detail: 'the words as typed, in this domain — reads only, within what you may see' }], reason: null }
      : { items: [], reason: noDomain };
  }
  const r = interpret(t, { mode });
  const instead: PaletteItem[] = inDomain ? [{ kind: 'search', href: searchPageHref(t, 'search'), label: `Search “${t}” instead`, detail: 'the words as typed — reads only' }] : [];
  if (r.reason !== null) return { items: instead, reason: cap(r.reason) };
  if (mode === 'command' || r.kind === 'command') {
    const entries = mode === 'command' ? commandEntries(t) : (r.command === null ? [] : [commandHandoff(r.command.action, r.command.page, r.command.label)]);
    const phrases = r.phrases.length > 0 && inDomain;
    const items: PaletteItem[] = entries.map((c) => ({
      kind: 'command', action: c.action,
      href: phrases ? searchPageHref(t, mode, c.action) : c.href,
      label: phrases ? `Review: ${c.label} — find “${r.phrases.join(' ')}”` : `Review: ${c.label}`,
      detail: phrases ? 'the matching records are found first; the Command Review opens on the one you choose — nothing runs from here' : c.detail,
    }));
    if (items.length === 0) return { items: instead, reason: `No command reads “${t}” here.` };
    return { items, reason: null };
  }
  if (!inDomain) return { items: [], reason: noDomain };
  return { items: [{ kind: 'ask', href: searchPageHref(t, 'ask'), label: 'Show the reading and its results', detail: previewLine(r) }], reason: null };
}
