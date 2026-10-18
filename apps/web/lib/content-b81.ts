/**
 * CP-6 B81 §CT (F-P7-E-18: UX-69-001…006, UX-ADR-021, GLB-20, CNT-01…07/10/14/15/16) — THE CONTENT MODEL as pure functions (vitest, node):
 *
 *  - THE TERMINOLOGY MODEL: a canonical term (b81-seams TermEntry, widened), its audience explanation, the locale resolution with its
 *    VERIFIED FALLBACK marks (canonical · translated · untranslated · source_corrected · unreviewed — UX-69-005), the static fallback of the
 *    truth states (packages/tokens' symbol registry — Volume 9 Appendix B) and the lifecycle states LS-01…12 (title case; never combined with
 *    a truth state — CNT-04/-05);
 *  - THE READING GRADE (GLB-20): a deterministic English measure (Flesch–Kincaid in exact integer tenths) — governance.term_reading_grade
 *    and the API's content-lint.ts compute the same number (content-b81.fixtures.json binds all three);
 *  - THE CONTENT-LINT RULES (b81-seams CONTENT_LINT_RULES; dg-lint-3 runs them over the source as a ratchet): verb + object, destructive
 *    scope and reversibility, error = condition + task + safe recovery without blame, no dilution, title = noun phrase;
 *  - THE COMPONENT CONTRACTS of Term and HelpPanel (components/help.tsx renders them): an explanation that would dilute the term is never
 *    shown (the definition is); help never hides a required condition;
 *  - the error → recovery sentences (CNT-10, rendered by §DG's RecoveryPanel beside ErrorNote), the correction view (CNT-14) and the
 *    receipt text (CNT-15, immutable and copyable).
 *
 * Presentation never changes meaning: nothing here re-words a canonical term, infers a state, or turns an explanation into authority.
 * CONSTRUCTION only; the terms a demonstration publishes are SYNTHETIC records of the act.
 */
import { SYMBOLS } from '@eye/tokens';
import { CONTENT_LINT_RULES, type Audience, type TermEntry } from './b81-seams';

export const CONTENT_LINT_VERSION = 'dg-lint-3';
export const TERM_RULES_VERSION = 'b81-ct-terms-1';
export type ContentRule = (typeof CONTENT_LINT_RULES)[number];
export const AUDIENCES: readonly Audience[] = ['analyst', 'executive', 'operator'];
export const READING_CEILINGS: Readonly<Record<Audience, number>> = { analyst: 14, executive: 10, operator: 8 };

/* ── THE VOCABULARIES (mirrored in apps/api/src/governance/design/terms/content-lint.ts; content-b81.fixtures.json binds both) ── */
export const GENERIC_LABELS: readonly string[] = ['apply', 'click here', 'confirm', 'continue', 'do it', 'done', 'go', 'next', 'no', 'ok', 'okay', 'proceed', 'submit', 'yes'];
export const NON_COMMAND_WORDS: readonly string[] = ['back', 'cancel', 'clear', 'close', 'collapse', 'copy', 'dismiss', 'expand', 'hide', 'less', 'menu', 'more', 'next page', 'open', 'previous',
  'previous page', 'refresh', 'reload', 'retry', 'search', 'show', 'sign in', 'sign out'];
export const DESTRUCTIVE_VERBS: readonly string[] = ['archive', 'cancel', 'close', 'deactivate', 'delete', 'destroy', 'discard', 'drop', 'erase', 'purge', 'reject', 'remove', 'retire', 'revoke',
  'suspend', 'terminate', 'withdraw'];
export const REVERSIBILITY = /irreversib|cannot be undone|can't be undone|not reversible|reversible|restor|undo|permanent|not rolled back|roll(?:s|ed)? back|stays recorded|is kept|are kept|preserved|history retained/i;
export const RECOVERY = /\b(try|retry|again|contact|ask|return|reload|refresh|sign in|choose|check|select|enter|use|open|wait|correct|fix|read|name|state|pick|add|remove|start)\b/i;
export const BLAME = /\b(you failed|you entered|you did|you made|your fault|your mistake|illegal|invalid input|wrong input|bad input|user error)\b/i;
export const IMPERATIVE_TITLE_WORDS: readonly string[] = ['add', 'browse', 'check', 'choose', 'configure', 'create', 'delete', 'edit', 'enter', 'find', 'go', 'manage', 'open', 'remove', 'run', 'see',
  'select', 'set', 'show', 'start', 'submit', 'update', 'view', 'welcome'];
export const CERTAINTY_WORDS: readonly string[] = ['always', 'certain', 'certainly', 'confirmed', 'definitely', 'final', 'guaranteed', 'proven', 'undisputed', 'verified'];

export const normaliseLabel = (s: string): string => s.replace(/\s+/g, ' ').trim().replace(/(\s*(?:…|\.\.\.|→|›|:))+$/u, '').trim();
const words = (s: string): string[] => normaliseLabel(s).toLowerCase().split(' ').filter((w) => w.length > 0);

/* ── THE RULES ── */
/** verb-object (CNT-06): null, or why a command label is not verb + object. */
export function commandLabelProblem(label: string): string | null {
  const l = normaliseLabel(label).toLowerCase();
  if (l === '') return null;
  if (GENERIC_LABELS.includes(l)) return `"${normaliseLabel(label)}" is generic — a command names its exact effect, a verb and its object`;
  if (NON_COMMAND_WORDS.includes(l)) return null;
  if (words(label).length < 2) return `"${normaliseLabel(label)}" is a lone verb — a command names its object too`;
  return null;
}
export function isDestructive(label: string): boolean {
  const w = words(label);
  if (w.length === 0 || !DESTRUCTIVE_VERBS.includes(w[0]!)) return false;
  return !((w[0] === 'close' || w[0] === 'cancel') && w.length === 1);
}
/** destructive-scope (CNT-07): null, or why a destructive command lacks its scope or its reversibility (`context` = what is said beside it). */
export function destructiveProblem(label: string, context: string): string | null {
  if (!isDestructive(label)) return null;
  if (words(label).length < 2) return `"${normaliseLabel(label)}" is destructive and names no scope — say what it acts on`;
  if (!REVERSIBILITY.test(context)) return `"${normaliseLabel(label)}" is destructive and nothing near it states whether it can be undone or what is kept`;
  return null;
}
/** error-recovery (CNT-10): null, or why an error text is not condition + task + safe recovery, or blames the user. */
export function errorTextProblem(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (BLAME.test(t)) return 'the error blames the user — state the condition, the affected task and a safe recovery';
  if (t.split(' ').length < 3) return 'the error names no condition — state what happened, the affected task and a safe recovery';
  if (!RECOVERY.test(t)) return 'the error states no safe recovery — say what the reader can do next';
  return null;
}
/** title-noun-phrase (CNT-02): null, or why a title is not a noun phrase naming governed work. */
export function titleProblem(title: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (/[.?!]$/.test(t)) return `"${t}" reads as a sentence or a question — a title is a noun phrase`;
  const first = (t.split(/[\s—–-]+/)[0] ?? '').toLowerCase();
  if (IMPERATIVE_TITLE_WORDS.includes(first)) return `"${t}" is an instruction — a title names the governed work (a noun phrase)`;
  return null;
}
const wordRe = (w: string) => new RegExp(`(?:^|[^A-Za-z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`);
/** no-dilution (UX-69-004): null, or the first problem — audiences sorted, then protected words sorted, then certainty words in order. */
export function dilutionProblem(label: string, definition: string, protectedWords: readonly string[], explanations: Partial<Record<string, string>>): string | null {
  for (const a of Object.keys(explanations).sort()) {
    const e = (explanations[a] ?? '').toLowerCase();
    if (!e.includes(label.trim().toLowerCase())) return `dilution: the ${a} explanation drops the canonical term ${label.trim()}`;
    for (const w of [...protectedWords].sort()) if (!e.includes(w.trim().toLowerCase())) return `dilution: the ${a} explanation drops "${w.trim()}" (a protected truth, uncertainty or consequence word)`;
    for (const c of CERTAINTY_WORDS) if (wordRe(c).test(e) && !wordRe(c).test(definition.toLowerCase())) return `certainty: the ${a} explanation implies certainty or authority ("${c}") the definition does not state`;
  }
  return null;
}
export interface ContentProblem { rule: ContentRule; note: string }
/** Every rule that applies to one piece of content — what a component checks about its own text. */
export function contentProblems(c: { kind: 'command' | 'error' | 'title'; text: string; context?: string }): ContentProblem[] {
  const out: ContentProblem[] = [];
  const push = (rule: ContentRule, note: string | null) => { if (note !== null) out.push({ rule, note }); };
  if (c.kind === 'command') { push('verb-object', commandLabelProblem(c.text)); push('destructive-scope', destructiveProblem(c.text, c.context ?? '')); }
  if (c.kind === 'error') push('error-recovery', errorTextProblem(c.text));
  if (c.kind === 'title') push('title-noun-phrase', titleProblem(c.text));
  return out;
}

/* ── THE READING GRADE (exact integer tenths) ── */
export function syllables(word: string): number {
  const w = word.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const groups = (w.match(/[aeiouy]+/g) ?? []).length;
  return Math.max(1, groups - (/e$/.test(w) && !/le$/.test(w) ? 1 : 0));
}
export function readingGrade(text: string): number {
  const t = text.replace(/['’]/g, '');
  const ws = t.match(/[A-Za-z]+/g) ?? [];
  const W = ws.length;
  if (W === 0) return 0;
  const S = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const Y = ws.reduce((a, w) => a + syllables(w), 0);
  const num = 39 * W * W + 1180 * Y * S - 1559 * S * W;
  const den = 10 * S * W;
  return Math.max(0, Math.floor((2 * num + den) / (2 * den))) / 10;
}
/** The reading check of every explanation: grade, ceiling, pass (GLB-20). */
export function readingCheck(explanations: Partial<Record<Audience, string>>): Array<{ audience: Audience; grade: number; ceiling: number; pass: boolean }> {
  return AUDIENCES.filter((a) => explanations[a] !== undefined).map((a) => { const grade = readingGrade(explanations[a]!); return { audience: a, grade, ceiling: READING_CEILINGS[a], pass: grade <= READING_CEILINGS[a] }; });
}

/* ── THE TERMINOLOGY MODEL ── */
export type TermCategory = 'truth_state' | 'lifecycle_state' | 'action' | 'object' | 'concept' | 'instruction' | 'error' | 'warning' | 'label';
export type TermMark = 'canonical' | 'translated' | 'untranslated' | 'source_corrected' | 'unreviewed' | 'registry';
export interface TermRecord extends TermEntry {
  category: TermCategory; protectedWords: string[]; synonyms: string[]; example: string | null; conditions: string[]; cites: string[]; glossaryKeys: string[];
  state: string; digest: string | null; translation: { fromVersion: number; method: 'human' | 'machine' } | null;
  correction: CorrectionRecord | null;
}
export interface CorrectionRecord { original: { version: number; label: string; definition: string; digest: string }; replacement: { label: string; definition: string }; impact: string; action: string }
export interface ResolvedTerm { term: TermRecord; mark: TermMark; fallback: boolean; markText: string | null }

type Row = Record<string, unknown>;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** A catalogue row of the server (governance.term_catalogue) as a TermRecord — nothing re-worded, nothing defaulted to a state it does not hold. */
export function termFromCatalogue(row: Row): ResolvedTerm {
  const e = (row['entry'] ?? {}) as Row;
  const tr = (row['translation'] ?? null) as Row | null;
  const term: TermRecord = {
    key: String(e['term_key'] ?? row['key'] ?? ''), label: String(e['label'] ?? ''), definition: String(e['definition'] ?? ''), explanations: (e['explanations'] ?? {}) as Partial<Record<Audience, string>>,
    locale: String(e['locale'] ?? 'en'), version: Number(e['version'] ?? 0), category: String(e['category'] ?? 'concept') as TermCategory, protectedWords: strs(e['protected_words']),
    synonyms: strs(e['synonyms']), example: typeof e['example'] === 'string' ? e['example'] : null, conditions: strs(e['conditions']), cites: strs(e['cites']), glossaryKeys: strs(e['glossary_keys']),
    state: String(e['state'] ?? 'published'), digest: typeof e['digest'] === 'string' ? e['digest'] : null,
    translation: tr !== null && typeof tr['from_version'] === 'number' ? { fromVersion: tr['from_version'], method: tr['method'] === 'machine' ? 'machine' : 'human' } : null,
    correction: (e['correction'] ?? null) as CorrectionRecord | null,
  };
  const mark = (['canonical', 'translated', 'untranslated', 'source_corrected'] as const).find((m) => m === row['mark']) ?? 'unreviewed';
  return { term, mark, fallback: mark !== 'canonical' && mark !== 'translated', markText: markText(mark) };
}
export function markText(mark: TermMark): string | null {
  switch (mark) {
    case 'canonical': case 'translated': return null;
    case 'untranslated': return 'Not translated — the canonical English term is shown';
    case 'source_corrected': return 'The English term was corrected after this translation — the canonical English term is shown until the translation is reviewed';
    case 'unreviewed': return 'Unreviewed translation — no translation provenance; the canonical English term is shown';
    case 'registry': return 'From the symbol registry — no published explanation yet';
  }
}
/**
 * RESOLVE a term for a locale from the entries a page holds (UX-69-005): the entry in that locale only when it carries its translation
 * provenance and is a published version; else the canonical English entry, marked. Never a guessed or blended entry.
 */
export function resolveTerm(entries: readonly TermRecord[], key: string, locale: string): ResolvedTerm | null {
  const canon = entries.find((e) => e.key === key && e.locale === 'en' && e.state === 'published') ?? null;
  if (locale === 'en') return canon === null ? null : { term: canon, mark: 'canonical', fallback: false, markText: null };
  const loc = entries.find((e) => e.key === key && e.locale === locale && e.state === 'published') ?? null;
  if (loc !== null && loc.translation !== null && canon !== null && loc.translation.fromVersion === canon.version) return { term: loc, mark: 'translated', fallback: false, markText: null };
  if (canon === null) return null;
  const mark: TermMark = loc === null ? 'untranslated' : loc.translation === null ? 'unreviewed' : 'source_corrected';
  return { term: canon, mark, fallback: true, markText: markText(mark) };
}
/**
 * THE EXPLANATION a reader sees (GLB-20, UX-69-004): the audience's explanation when it keeps the term undiluted; otherwise the canonical
 * DEFINITION (`fellBack`) — an explanation never replaces the meaning, and the canonical label is always shown beside it.
 */
export function explanationFor(t: Pick<TermRecord, 'label' | 'definition' | 'protectedWords' | 'explanations'>, audience: Audience): { text: string; audience: Audience | null; fellBack: boolean; reason: string | null } {
  const e = t.explanations[audience];
  if (e === undefined || e.trim() === '') return { text: t.definition, audience: null, fellBack: true, reason: `no ${audience} explanation is published — the definition is shown` };
  const p = dilutionProblem(t.label, t.definition, t.protectedWords, { [audience]: e });
  if (p !== null) return { text: t.definition, audience: null, fellBack: true, reason: `${p} — the definition is shown` };
  return { text: e, audience, fellBack: false, reason: null };
}

/* ── THE STATIC FALLBACK: the truth states (CNT-04) and the lifecycle states (CNT-05) ── */
/** The truth states TS-01…TS-10 from the symbol registry — canonical UPPERCASE label, symbol id and definition; marked `registry`. */
export const TRUTH_TERMS: readonly TermRecord[] = SYMBOLS.filter((s) => /^TS-\d\d$/.test(s.id)).map((s) => ({
  key: `truth.${s.key}`, label: s.label, definition: s.meaning, explanations: {}, locale: 'en', version: 0, category: 'truth_state' as const, protectedWords: [], synonyms: [], example: null,
  conditions: [], cites: [], glossaryKeys: [], state: 'registry', digest: s.glyphDigest, translation: null, correction: null,
}));
export const truthSymbolId = (key: string): string | null => SYMBOLS.find((s) => `truth.${s.key}` === key || s.key === key)?.id ?? null;
/** Volume 9's lifecycle states — APPROVED TITLE-CASE labels with their definitions (LS-01…LS-12). */
export const LIFECYCLE_TERMS: ReadonlyArray<{ id: string; label: string; definition: string }> = [
  { id: 'LS-01', label: 'Draft', definition: 'Authoring; not review-active' },
  { id: 'LS-02', label: 'Proposed', definition: 'Submitted for governed review' },
  { id: 'LS-03', label: 'In Review', definition: 'Named review is active' },
  { id: 'LS-04', label: 'Approved', definition: 'Eligible authority approved exact version' },
  { id: 'LS-05', label: 'Published', definition: 'Approved version made effective for audience' },
  { id: 'LS-06', label: 'Superseded', definition: 'Replaced by a newer effective version' },
  { id: 'LS-07', label: 'Corrected', definition: 'Material correction linked to prior version' },
  { id: 'LS-08', label: 'Withdrawn', definition: 'Removed from current use but preserved' },
  { id: 'LS-09', label: 'Archived', definition: 'Retained for history; no active change' },
  { id: 'LS-10', label: 'Retired', definition: 'No longer supported or admitted' },
  { id: 'LS-11', label: 'Degraded', definition: 'Available with declared limitations' },
  { id: 'LS-12', label: 'Blocked', definition: 'Required condition prevents transition' },
];
const TITLE_SMALL = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);
/** CNT-05: null, or why a lifecycle label is not an approved title-case label (or combines a truth state). */
export function lifecycleLabelProblem(label: string): string | null {
  const t = label.trim();
  if (combinesTruthAndLifecycle(t)) return `"${t}" combines a truth state and a lifecycle state — show them as two labels`;
  if (!LIFECYCLE_TERMS.some((l) => l.label === t)) {
    const near = LIFECYCLE_TERMS.find((l) => l.label.toLowerCase() === t.toLowerCase());
    return near !== undefined ? `"${t}" is not title case — the approved label is "${near.label}"` : `"${t}" is not an approved lifecycle label (LS-01…LS-12)`;
  }
  return t.split(' ').every((w, i) => (i > 0 && TITLE_SMALL.has(w)) || /^[A-Z]/.test(w)) ? null : `"${t}" is not title case`;
}
/** A label that carries BOTH a truth-state word (UPPERCASE canonical) and a lifecycle word — CNT-05 forbids the combination. */
export function combinesTruthAndLifecycle(label: string): boolean {
  const truth = SYMBOLS.filter((s) => /^TS-\d\d$/.test(s.id)).some((s) => new RegExp(`\\b${s.label}\\b`).test(label));
  const life = LIFECYCLE_TERMS.some((l) => new RegExp(`\\b${l.label}\\b`, 'i').test(label));
  if (!truth || !life) return false;
  // the same word may name both (CORRECTED / Corrected, WITHDRAWN / Withdrawn): only a SECOND, different word combines them
  const truthWords = SYMBOLS.filter((s) => /^TS-\d\d$/.test(s.id) && new RegExp(`\\b${s.label}\\b`).test(label)).map((s) => s.label.toLowerCase());
  return LIFECYCLE_TERMS.some((l) => new RegExp(`\\b${l.label}\\b`, 'i').test(label) && !truthWords.includes(l.label.toLowerCase()));
}

/* ── HELP (CNT-16): contextual explanation and example; NEVER hides a required condition ── */
export interface HelpInput { title: string; explanation: string; example?: string | null; conditions?: readonly string[]; detail?: string | null }
export interface HelpModel { title: string; explanation: string; example: string | null; conditions: string[]; deferred: string | null; problems: string[] }
/** The help panel's contract: the explanation, the example and EVERY required condition are in the always-visible part; only the
 *  secondary detail may be deferred. A condition-free help says so; a missing example is a stated problem (shown, not hidden). */
export function helpModel(h: HelpInput): HelpModel {
  const problems: string[] = [];
  if (h.explanation.trim().length < 8) problems.push('help explains the context in a sentence (8+ characters)');
  if (h.example === undefined || h.example === null || h.example.trim() === '') problems.push('help carries an example (CNT-16)');
  const t = titleProblem(h.title); if (t !== null) problems.push(t);
  return { title: h.title.trim(), explanation: h.explanation.trim(), example: h.example?.trim() || null, conditions: (h.conditions ?? []).map((c) => c.trim()).filter((c) => c !== ''),
           deferred: h.detail?.trim() || null, problems };
}
/** Does a rendered help keep every required condition visible? (the panel renders `conditions` outside the deferred part — always true
 *  for helpModel's output; the assertion exists for callers that compose their own). */
export const helpHidesCondition = (m: HelpModel, visibleText: string): boolean => m.conditions.some((c) => !visibleText.includes(c));

/* ── CNT-10: the error → recovery sentences (§DG's RecoveryPanel renders them beside ErrorNote — the server's words stay first) ── */
export const RECOVERY_SENTENCES: Readonly<Record<string, { condition: string; recovery: string }>> = {
  EYE_AUT_001: { condition: 'This act needs an authority your session does not hold here.', recovery: 'Ask the named authority, or open the page in a context where you hold the role.' },
  'EYE-AUT-001': { condition: 'This act needs an authority your session does not hold here.', recovery: 'Ask the named authority, or open the page in a context where you hold the role.' },
  EYE_STA_001: { condition: 'The object named is not visible here or does not exist.', recovery: 'Check the link, or return to the list and choose the object again.' },
  'EYE-STA-001': { condition: 'The object named is not visible here or does not exist.', recovery: 'Check the link, or return to the list and choose the object again.' },
  EYE_STA_002: { condition: 'The object changed state, or the version shown is no longer current.', recovery: 'Read the object again, then repeat the act on the version now shown.' },
  'EYE-STA-002': { condition: 'The object changed state, or the version shown is no longer current.', recovery: 'Read the object again, then repeat the act on the version now shown.' },
  EYE_REQ_001: { condition: 'The request was not accepted as written.', recovery: 'Correct the field the message names and try again.' },
  'EYE-REQ-001': { condition: 'The request was not accepted as written.', recovery: 'Correct the field the message names and try again.' },
  'EYE-DEP-001': { condition: 'The service could not be reached, so nothing was recorded.', recovery: 'Wait a moment and try again; the page shows the last state it read.' },
  'EYE-INT-001': { condition: 'The service could not complete the request, so nothing was recorded.', recovery: 'Try again; if it repeats, contact the operations authority with the correlation id.' },
};
/** The recovery for an error code and the affected task (CNT-10: condition + affected task + safe recovery; never blames the reader). */
export function recoveryFor(code: string, task: string): { condition: string; task: string; recovery: string; text: string } {
  const r = RECOVERY_SENTENCES[code] ?? { condition: 'The act did not complete, so nothing was recorded.', recovery: 'Read the message, then try again or contact the operations authority with the correlation id.' };
  const taskText = `Affected: ${task.trim()}.`;
  return { ...r, task: task.trim(), text: `${r.condition} ${taskText} ${r.recovery}` };
}

/* ── CNT-14: the correction — original / replacement / impact / action ── */
export function correctionView(c: CorrectionRecord | null): Array<{ label: string; value: string }> | null {
  if (c === null) return null;
  return [
    { label: 'Original', value: `${c.original.label} (v${c.original.version}) — ${c.original.definition}` },
    { label: 'Replacement', value: `${c.replacement.label} — ${c.replacement.definition}` },
    { label: 'Impact', value: c.impact },
    { label: 'Action', value: c.action },
    { label: 'Recipients', value: 'Readers of the original see this correction beside it; notices to recipients are delivered by the notification service (B84)' },
  ];
}

/* ── CNT-15: the receipt — actor / command / object / time / result; immutable and copyable ── */
export interface ReceiptFacts { actor: string | null; command: string | null; object: string | null; time: string | null; result: string | null }
export function receiptProblem(r: ReceiptFacts): string | null {
  const missing = (['actor', 'command', 'object', 'time', 'result'] as const).filter((k) => r[k] === null || r[k]!.trim() === '');
  return missing.length === 0 ? null : `the receipt does not state its ${missing.join(', ')} — a receipt is rendered only from the server's answer`;
}
/** The copyable text of a receipt — the same five fields in a fixed order (Object.freeze: nothing edits it after it is built). */
export function receiptText(r: ReceiptFacts): string | null {
  if (receiptProblem(r) !== null) return null;
  return Object.freeze([`Actor: ${r.actor}`, `Command: ${r.command}`, `Object: ${r.object}`, `Time: ${r.time}`, `Result: ${r.result}`]).join('\n');
}

/* ── CNT-01: the product identity ── */
/** The product is "The Eye" — never abbreviated at first use nor redefined (the catalogue's app.title opens with it). */
export function productIdentityProblem(catalogue: Readonly<Record<string, string>>): string | null {
  const t = catalogue['app.title'] ?? '';
  if (!t.startsWith('The Eye')) return 'app.title does not open with the product name "The Eye"';
  const abbreviated = Object.entries(catalogue).find(([, v]) => /\bTE\b|\bthe eye\b/.test(v));
  return abbreviated === undefined ? null : `${abbreviated[0]} abbreviates or lower-cases the product name`;
}
