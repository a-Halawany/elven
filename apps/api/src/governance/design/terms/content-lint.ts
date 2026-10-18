/**
 * B81 §CT (0119_b81_x_ct; F-P7-E-18: UX-69-004/-005, UX-ADR-021, GLB-20, CNT-02/06/07/10) — THE CONTENT LINT `dg-lint-3` and THE TERM CHECKS:
 * PURE functions over the web source (the reader is B107's design-source.ts; nothing here writes a file) and over term entries.
 *
 * THE FIVE RULES (b81-seams CONTENT_LINT_RULES — the web model apps/web/lib/content-b81.ts carries the same rule functions; the shared fixtures
 * apps/web/lib/content-b81.fixtures.json bind both):
 *   verb-object        a COMMAND label (a Button / GovernedButton / SplitButton `label`, a <button>'s text, an `actionLabel`) is a verb and its
 *                      object — never a generic "Continue", "OK", "Submit" … nor a lone verb (CNT-06); a dismissal or navigation word is not a
 *                      command (Cancel, Close, Back, Search …);
 *   destructive-scope  a DESTRUCTIVE command (Delete, Remove, Retire, Revoke, Withdraw, Discard, Reject, Close <object> …) names its scope (an
 *                      object) and the source near it states its REVERSIBILITY or consequence (CNT-07);
 *   error-recovery     an ERROR text the interface writes itself (setError('…'), a catalogue error message) states a safe recovery and never
 *                      blames the user (CNT-10) — a server refusal is shown in the server's words and is not linted here;
 *   no-dilution        a role EXPLANATION declared in source keeps the canonical label and its protected words and implies no certainty the
 *                      definition does not state (UX-69-004) — the same rule the term ports enforce (governance.term_dilution_problem);
 *   title-noun-phrase  a page / workspace TITLE (<h1>, a metadata title, a catalogue nav / app / *.title message) is a noun phrase naming
 *                      governed work: not an instruction, not a sentence, not a question (CNT-02; dg-lint-1's surface rule stays B107's).
 *
 * THE RATCHET (Q16; DESIGN D6): the lint runs over the real pages; TODAY'S findings are committed (content-lint-ratchet.ts) and the list ONLY
 * SHRINKS — a finding outside it is a regression, a committed one no longer found is reported resolved (remove it from the list). Findings are
 * fingerprinted by rule, file and text (never by line: a moved line is not a new finding). The lint JUDGES nothing: its findings are recorded
 * through B107's governance.dg_record_evaluation (rules `dg-lint-3`) under the principle the Design System Authority declared.
 *
 * THE READING GRADE (GLB-20): Flesch–Kincaid in exact integer tenths — governance.term_reading_grade's mirror, equal to the tenth.
 */
import { createHash } from 'node:crypto';
import { stripComments, surfacesOf, type SourceFile } from '../design-lint.js';

export const CONTENT_LINT_VERSION = 'dg-lint-3';
export const TERM_RULES_VERSION = 'b81-ct-terms-1';
export const CONTENT_PRINCIPLE = 'design.content-governed';
export const CONTENT_PRINCIPLE_STATEMENT = 'Canonical terminology governs content design (UX-ADR-021): a command is a verb and its object; a destructive command names its scope and reversibility; an error states a safe recovery and never blames the user; a role explanation or translation clarifies without diluting truth, uncertainty or consequence; a title is a noun phrase naming governed work.';
export const CONTENT_RULES = ['verb-object', 'destructive-scope', 'error-recovery', 'no-dilution', 'title-noun-phrase'] as const;
export type ContentRule = (typeof CONTENT_RULES)[number];
export interface ContentFinding { rule: ContentRule; principle: string; file: string; line: number; excerpt: string; note: string; fingerprint: string }
export interface ContentLintResult { rulesVersion: string; inputDigest: string; files: number; findings: ContentFinding[]; counts: Record<ContentRule, number> }

/* ── THE VOCABULARIES (mirrored in apps/web/lib/content-b81.ts; the fixtures bind both) ── */
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
export const AUDIENCES = ['analyst', 'executive', 'operator'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const READING_CEILINGS: Readonly<Record<Audience, number>> = { analyst: 14, executive: 10, operator: 8 };

/** A label as a reader sees it: trimmed, the trailing ellipsis / arrow / colon removed, inner whitespace collapsed. */
export const normaliseLabel = (s: string): string => s.replace(/\s+/g, ' ').trim().replace(/(\s*(?:…|\.\.\.|→|›|:))+$/u, '').trim();
const words = (s: string): string[] => normaliseLabel(s).toLowerCase().split(' ').filter((w) => w.length > 0);

/* ── THE RULES as functions of one text (the lint below finds the texts) ── */
/** CNT-06: null, or why a command label is not verb + object. */
export function commandLabelProblem(label: string): string | null {
  const l = normaliseLabel(label).toLowerCase();
  if (l === '') return null;
  if (GENERIC_LABELS.includes(l)) return `"${normaliseLabel(label)}" is generic — a command names its exact effect, a verb and its object`;
  if (NON_COMMAND_WORDS.includes(l)) return null;
  if (words(label).length < 2) return `"${normaliseLabel(label)}" is a lone verb — a command names its object too`;
  return null;
}
/** Is the label a destructive command (its first word a destructive verb — Close / Cancel only when an object follows)? */
export function isDestructive(label: string): boolean {
  const w = words(label);
  if (w.length === 0 || !DESTRUCTIVE_VERBS.includes(w[0]!)) return false;
  return !((w[0] === 'close' || w[0] === 'cancel') && w.length === 1);
}
/** CNT-07: null, or why a destructive command lacks its scope or its reversibility (`context` = the source around it). */
export function destructiveProblem(label: string, context: string): string | null {
  if (!isDestructive(label)) return null;
  if (words(label).length < 2) return `"${normaliseLabel(label)}" is destructive and names no scope — say what it acts on`;
  if (!REVERSIBILITY.test(context)) return `"${normaliseLabel(label)}" is destructive and nothing near it states whether it can be undone or what is kept`;
  return null;
}
/** CNT-10: null, or why an error text is not condition + task + safe recovery, or blames the user. */
export function errorTextProblem(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (BLAME.test(t)) return 'the error blames the user — state the condition, the affected task and a safe recovery';
  if (t.split(' ').length < 3) return 'the error names no condition — state what happened, the affected task and a safe recovery';
  if (!RECOVERY.test(t)) return 'the error states no safe recovery — say what the reader can do next';
  return null;
}
/** CNT-02: null, or why a title is not a noun phrase naming governed work. */
export function titleProblem(title: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (/[.?!]$/.test(t)) return `"${t}" reads as a sentence or a question — a title is a noun phrase`;
  const first = (t.split(/[\s—–-]+/)[0] ?? '').toLowerCase();
  if (IMPERATIVE_TITLE_WORDS.includes(first)) return `"${t}" is an instruction — a title names the governed work (a noun phrase)`;
  return null;
}

/* ── THE READING GRADE (exact; governance.term_reading_grade's mirror) ── */
export function syllables(word: string): number {
  const w = word.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const groups = (w.match(/[aeiouy]+/g) ?? []).length;
  return Math.max(1, groups - (/e$/.test(w) && !/le$/.test(w) ? 1 : 0));
}
/** Flesch–Kincaid grade in tenths, rounded half up, floored at 0 — integer arithmetic only. */
export function readingGrade(text: string): number {
  const t = text.replace(/['’]/g, '');
  const ws = t.match(/[A-Za-z]+/g) ?? [];
  const W = ws.length;
  if (W === 0) return 0;
  const S = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const Y = ws.reduce((a, w) => a + syllables(w), 0);
  const num = 39 * W * W + 1180 * Y * S - 1559 * S * W;
  const den = 10 * S * W;
  const tenths = Math.floor((2 * num + den) / (2 * den));
  return Math.max(0, tenths) / 10;
}
export function readingLevels(explanations: Partial<Record<string, string>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(explanations).sort()) out[k] = readingGrade(explanations[k] ?? '');
  return out;
}

/* ── NO DILUTION (governance.term_dilution_problem's mirror: audiences sorted, protected sorted, certainty words in list order) ── */
const wordRe = (w: string) => new RegExp(`(?:^|[^A-Za-z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`);
export function dilutionProblem(label: string, definition: string, protectedWords: readonly string[], explanations: Partial<Record<string, string>>): string | null {
  for (const a of Object.keys(explanations).sort()) {
    const e = (explanations[a] ?? '').toLowerCase();
    if (!e.includes(label.trim().toLowerCase())) return `dilution: the ${a} explanation drops the canonical term ${label.trim()}`;
    for (const w of [...protectedWords].sort()) if (!e.includes(w.trim().toLowerCase())) return `dilution: the ${a} explanation drops "${w.trim()}" (a protected truth, uncertainty or consequence word)`;
    for (const c of CERTAINTY_WORDS) if (wordRe(c).test(e) && !wordRe(c).test(definition.toLowerCase())) return `certainty: the ${a} explanation implies certainty or authority ("${c}") the definition does not state`;
  }
  return null;
}

/* ── THE LINT over the web source ── */
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;
const fp = (rule: string, file: string, excerpt: string): string => createHash('sha256').update(`${rule}\0${file}\0${normaliseLabel(excerpt).toLowerCase()}`).digest('hex').slice(0, 16);
function inputDigest(files: SourceFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(`${f.path}\0${createHash('sha256').update(f.text).digest('hex')}\n`);
  return h.digest('hex');
}

/** The command labels of a TSX source: `label=` / `actionLabel=` (literal strings) on a Button / GovernedButton / SplitButton, `actionLabel: '…'`, and a <button>'s literal text. */
export function commandLabelsOf(code: string): Array<{ index: number; label: string }> {
  const out: Array<{ index: number; label: string }> = [];
  for (const m of code.matchAll(/<(?:Button|GovernedButton|SplitButton)\b(?:=>|[^>])*?\blabel=(?:"([^"]*)"|\{\s*'([^']*)'\s*\}|\{\s*"([^"]*)"\s*\}|'([^']*)')/g)) out.push({ index: m.index ?? 0, label: m[1] ?? m[2] ?? m[3] ?? m[4] ?? '' });
  for (const m of code.matchAll(/\bactionLabel\s*[:=]\s*\{?\s*(['"])([^'"]+)\1/g)) out.push({ index: m.index ?? 0, label: m[2] ?? '' });
  for (const m of code.matchAll(/<button\b(?:=>|[^>])*>([^<{]+)<\/button>/g)) out.push({ index: m.index ?? 0, label: (m[1] ?? '').trim() });
  return out.filter((x) => normaliseLabel(x.label) !== '');
}
/** The error texts an interface writes itself: setError('…') / setError({ … message: '…' }) / setErr('…'). */
export function errorTextsOf(code: string): Array<{ index: number; text: string }> {
  const out: Array<{ index: number; text: string }> = [];
  for (const m of code.matchAll(/\bset(?:Error|Err|Problem)\(\s*(['"`])([^'"`]{3,})\1/g)) out.push({ index: m.index ?? 0, text: m[2] ?? '' });
  for (const m of code.matchAll(/\bset(?:Error|Err)\(\s*\{[^}]*?\bmessage\s*:\s*(['"`])([^'"`]{3,})\1/g)) out.push({ index: m.index ?? 0, text: m[2] ?? '' });
  return out.filter((x) => !x.text.includes('${'));
}
/** The role explanations declared in source: an object literal with `label: '…'` and `explanations: { executive: '…', … }` (and `protected: [...]`, `definition: '…'`). */
export function explanationsOf(code: string): Array<{ index: number; label: string; definition: string; protectedWords: string[]; explanations: Record<string, string> }> {
  const out: Array<{ index: number; label: string; definition: string; protectedWords: string[]; explanations: Record<string, string> }> = [];
  for (const m of code.matchAll(/\bexplanations\s*:\s*\{([^}]*)\}/g)) {
    const at = m.index ?? 0;
    const before = code.slice(Math.max(0, at - 1500), at);
    const lab = [...before.matchAll(/\blabel\s*:\s*'([^']+)'/g)].pop()?.[1];
    if (lab === undefined) continue;
    const def = [...before.matchAll(/\bdefinition\s*:\s*'([^']+)'/g)].pop()?.[1] ?? '';
    const prot = [...before.matchAll(/\bprotected\s*:\s*\[([^\]]*)\]/g)].pop()?.[1] ?? '';
    const explanations: Record<string, string> = {};
    for (const e of (m[1] ?? '').matchAll(/\b(executive|analyst|operator)\s*:\s*'([^']*)'/g)) explanations[e[1]!] = e[2]!;
    out.push({ index: at, label: lab, definition: def, protectedWords: [...prot.matchAll(/'([^']+)'/g)].map((x) => x[1]!), explanations });
  }
  return out;
}

/** THE CONTENT LINT. Test files, packages/tokens and stylesheets are not content; findings sorted (file, line, rule) — deterministic. */
export function lintContent(files: SourceFile[]): ContentLintResult {
  const findings: ContentFinding[] = [];
  const add = (rule: ContentRule, file: string, line: number, excerpt: string, note: string) =>
    findings.push({ rule, principle: CONTENT_PRINCIPLE, file, line, excerpt: excerpt.slice(0, 200), note, fingerprint: fp(rule, file, excerpt) });
  for (const f of files) {
    if (f.path.includes('packages/tokens/') || /\.(test|spec)\.(ts|tsx)$/.test(f.path) || f.path.endsWith('.css')) continue;
    if (f.path.endsWith('.json')) {
      let cat: Record<string, unknown> = {};
      try { cat = JSON.parse(f.text) as Record<string, unknown>; } catch { continue; }
      const lines = f.text.split('\n');
      const lineOfKey = (k: string) => Math.max(1, lines.findIndex((l) => l.includes(`"${k}"`)) + 1);
      for (const [k, v] of Object.entries(cat)) {
        if (typeof v !== 'string') continue;
        if (/\.(action|command|button|cta|submit)$/.test(k)) { const p = commandLabelProblem(v); if (p !== null) add('verb-object', f.path, lineOfKey(k), v, p); }
        if (/(^|\.)errors?(\.|$)/.test(k)) { const p = errorTextProblem(v); if (p !== null) add('error-recovery', f.path, lineOfKey(k), v, p); }
      }
      for (const s of surfacesOf(f)) { const p = titleProblem(s.text); if (p !== null) add('title-noun-phrase', f.path, s.line, s.text, p); }
      continue;
    }
    if (!/\.(ts|tsx)$/.test(f.path)) continue;
    const code = stripComments(f.text);
    if (f.path.endsWith('.tsx')) {
      for (const c of commandLabelsOf(code)) {
        const line = lineOf(code, c.index);
        const p = commandLabelProblem(c.label);
        if (p !== null) add('verb-object', f.path, line, c.label, p);
        const lines = f.text.split('\n');
        const context = lines.slice(Math.max(0, line - 11), line + 10).join('\n');
        const d = destructiveProblem(c.label, context);
        if (d !== null) add('destructive-scope', f.path, line, c.label, d);
      }
      for (const s of surfacesOf(f)) { const p = titleProblem(s.text); if (p !== null) add('title-noun-phrase', f.path, s.line, s.text, p); }
    }
    for (const e of errorTextsOf(code)) { const p = errorTextProblem(e.text); if (p !== null) add('error-recovery', f.path, lineOf(code, e.index), e.text, p); }
    for (const x of explanationsOf(code)) {
      const p = dilutionProblem(x.label, x.definition, x.protectedWords, x.explanations);
      if (p !== null) add('no-dilution', f.path, lineOf(code, x.index), x.label, p);
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.excerpt.localeCompare(b.excerpt));
  const counts = Object.fromEntries(CONTENT_RULES.map((r) => [r, 0])) as Record<ContentRule, number>;
  for (const x of findings) counts[x.rule] += 1;
  return { rulesVersion: CONTENT_LINT_VERSION, inputDigest: inputDigest(files), files: files.length, findings, counts };
}

/* ── THE RATCHET ── */
export interface RatchetEntry { rule: ContentRule; file: string; excerpt: string; fingerprint: string }
export interface RatchetResult { baseline: number; current: number; regressions: ContentFinding[]; resolved: RatchetEntry[]; holds: boolean }
/** Compare today's findings with the committed list (a MULTISET by fingerprint): every finding must be committed (else a regression); a
 *  committed one no longer found is resolved (the list shrinks by removing it). `holds` = no regression. */
export function ratchet(findings: readonly ContentFinding[], committed: readonly RatchetEntry[]): RatchetResult {
  const left = new Map<string, number>();
  for (const c of committed) left.set(c.fingerprint, (left.get(c.fingerprint) ?? 0) + 1);
  const regressions: ContentFinding[] = [];
  for (const f of findings) {
    const n = left.get(f.fingerprint) ?? 0;
    if (n > 0) left.set(f.fingerprint, n - 1); else regressions.push(f);
  }
  const resolved: RatchetEntry[] = [];
  const pending = new Map(left);
  for (const c of committed) { const n = pending.get(c.fingerprint) ?? 0; if (n > 0) { resolved.push(c); pending.set(c.fingerprint, n - 1); } }
  return { baseline: committed.length, current: findings.length, regressions, resolved, holds: regressions.length === 0 };
}
