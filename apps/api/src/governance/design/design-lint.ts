/**
 * B107 §DG (0115_b107_x_dg; UX-03-001/-003/-005, UX-ADR-002, UX-ADR-010, UX-ADR-017) — THE DESIGN LINT: a PURE function over the web source
 * (path + text pairs; the reader is design-source.ts). Three rules, each bound to a principle of the registry (governance.design_principles
 * `lint_rule`):
 *
 *   raw-colour          a colour literal (#hex, rgb()/rgba(), hsl()/hsla()) in product code — semantic tokens only (UX-ADR-010);
 *                       packages/tokens is the one place colours are defined and is not linted;
 *   optimistic-path     an optimistic update (useOptimistic, an optimistic… helper, `optimistic: true`) — a governed act renders from the
 *                       authoritative receipt only (UX-ADR-017);
 *   surface-definition  a SURFACE (a page's <h1>, the app's metadata title, a navigation / app / title message) that defines the product as
 *                       chat, chatbot, copilot, dashboard, BI, business intelligence or report (UX-ADR-002: interfaces remain access modes).
 *
 * Comments are stripped before the code rules run (a comment that says "there is no optimistic path" is not one). The lint JUDGES nothing:
 * its findings are evidence recorded through governance.dg_record_evaluation, where a narrow, approved, unexpired exception may cover one;
 * the verdict is the port's. Deterministic: the same files give the same findings and the same input digest.
 */
import { createHash } from 'node:crypto';

export const LINT_RULES_VERSION = 'dg-lint-1';
export type LintRule = 'raw-colour' | 'optimistic-path' | 'surface-definition';
export interface SourceFile { path: string; text: string }
export interface LintFinding { rule: LintRule; file: string; line: number; excerpt: string }
export interface LintResult { rulesVersion: string; inputDigest: string; files: number; findings: LintFinding[]; counts: Record<LintRule, number> }

const CODE_EXT = /\.(ts|tsx|css)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const HEX = /(?<=['"`\s:(,])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const FUNC_COLOUR = /\b(?:rgba?|hsla?)\(\s*[0-9.%\s,/-]+\)/g;
const OPTIMISTIC = /\buseOptimistic\b|\boptimistic[A-Z][A-Za-z0-9]*\s*\(|\boptimistic\s*:\s*true\b/g;
const SURFACE_WORDS_CI = /\b(chat|chatbot|copilot|dashboards?|business intelligence|reports?)\b/i;
const SURFACE_BI = /\bBI\b/;

/** Blank every comment (block and line) while keeping line numbers; strings are left intact (a `//` inside a URL string is not a comment). */
export function stripComments(text: string): string {
  let out = ''; let i = 0; let quote: string | null = null;
  while (i < text.length) {
    const c = text[i]!; const n = text[i + 1];
    if (quote !== null) {
      out += c;
      if (c === '\\' && i + 1 < text.length) { out += text[i + 1]; i += 2; continue; }
      // a '…' or "…" string never spans a line (an apostrophe in JSX text is not a string): the quote ends at the newline
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      i += 1; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2); const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue;
    }
    if (c === '/' && n === '/') {
      const end = text.indexOf('\n', i); const stop = end < 0 ? text.length : end;
      out += ' '.repeat(stop - i); i = stop; continue;
    }
    out += c; i += 1;
  }
  return out;
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;
const excerptAt = (text: string, line: number): string => (text.split('\n')[line - 1] ?? '').trim().slice(0, 200);

/** Is a surface text a definition of the product as a chat / dashboard / BI / copilot / report surface? */
export function definesSurface(text: string): boolean {
  return SURFACE_WORDS_CI.test(text) || SURFACE_BI.test(text);
}

/** The surfaces of one file: <h1> texts, a metadata/document title, and (for the message catalogue) nav.*, app.* and *.title values. */
export function surfacesOf(file: SourceFile): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  if (file.path.endsWith('.json')) {
    let catalogue: Record<string, unknown> = {};
    try { catalogue = JSON.parse(file.text) as Record<string, unknown>; } catch { return out; }
    const lines = file.text.split('\n');
    for (const [k, v] of Object.entries(catalogue)) {
      if (typeof v !== 'string' || !(/^(nav|app)\./.test(k) || /\.title$/.test(k))) continue;
      const line = lines.findIndex((l) => l.includes(`"${k}"`)) + 1;
      out.push({ line: line > 0 ? line : 1, text: v });
    }
    return out;
  }
  const code = stripComments(file.text);
  for (const m of code.matchAll(/<h1\b[^>]*>([^<{]*)/g)) out.push({ line: lineOf(code, m.index ?? 0), text: (m[1] ?? '').trim() });
  for (const m of code.matchAll(/\btitle\s*:\s*(['"`])([^'"`]*)\1/g)) {
    if (/metadata/.test(code.slice(Math.max(0, (m.index ?? 0) - 200), m.index ?? 0))) out.push({ line: lineOf(code, m.index ?? 0), text: m[2] ?? '' });
  }
  for (const m of code.matchAll(/<title>([^<]*)<\/title>/g)) out.push({ line: lineOf(code, m.index ?? 0), text: (m[1] ?? '').trim() });
  return out;
}

/** The digest of the lint's input (sorted by path; each file's text digested) — the evaluation names what it read. */
export function inputDigest(files: SourceFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(`${f.path}\0${createHash('sha256').update(f.text).digest('hex')}\n`);
  return h.digest('hex');
}

/** THE LINT. Files under packages/tokens and test files are not product surfaces; findings are sorted (file, line, rule) — deterministic. */
export function lintDesign(files: SourceFile[]): LintResult {
  const findings: LintFinding[] = [];
  for (const f of files) {
    if (f.path.includes('packages/tokens/')) continue;
    if (CODE_EXT.test(f.path) && !TEST_FILE.test(f.path)) {
      const code = stripComments(f.text);
      for (const re of [HEX, FUNC_COLOUR]) {
        for (const m of code.matchAll(re)) { const line = lineOf(code, m.index ?? 0); findings.push({ rule: 'raw-colour', file: f.path, line, excerpt: excerptAt(f.text, line) }); }
      }
      for (const m of code.matchAll(OPTIMISTIC)) { const line = lineOf(code, m.index ?? 0); findings.push({ rule: 'optimistic-path', file: f.path, line, excerpt: excerptAt(f.text, line) }); }
    }
    if ((/\.(tsx|json)$/.test(f.path)) && !TEST_FILE.test(f.path)) {
      for (const s of surfacesOf(f)) if (definesSurface(s.text)) findings.push({ rule: 'surface-definition', file: f.path, line: s.line, excerpt: s.text.slice(0, 200) });
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  const unique = findings.filter((x, i) => i === 0 || !(x.file === findings[i - 1]!.file && x.line === findings[i - 1]!.line && x.rule === findings[i - 1]!.rule));
  const counts: Record<LintRule, number> = { 'raw-colour': 0, 'optimistic-path': 0, 'surface-definition': 0 };
  for (const x of unique) counts[x.rule] += 1;
  return { rulesVersion: LINT_RULES_VERSION, inputDigest: inputDigest(files), files: files.length, findings: unique, counts };
}
