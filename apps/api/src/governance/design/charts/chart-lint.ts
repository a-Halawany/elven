/**
 * CP-6 B82 §CF (F-P7-E-21: UX-ADR-015, REL-17, GLB-07) — THE CHART-GRAMMAR LINT `dg-lint-4`: a PURE function over the web source (the reader
 * is B107's design-source.ts; nothing here writes a file). Every material visual of the product renders through the library's ChartFrame
 * (apps/web/components/chart-frame.tsx), whose grammar (apps/web/lib/b82-seams.ts assertGrammar + lib/chart-b82.ts chartGrammar) refuses a
 * chart that does not declare its basis, time, units, sources, uncertainty, legend and table alternative. This lint finds the drawings that
 * BYPASS that frame — so the grammar cannot be skipped by drawing outside it:
 *
 *   drawing-outside-frame  a DRAWING outside the library's chart files: an element with role="img" on a page (apps/web/app/**), or an <svg>
 *                          that is not a glyph (aria-hidden, or the symbol set's 24-unit icon grid) on a page, or in a top-level library component
 *                          file (apps/web/components/*.tsx) that never renders <ChartFrame (chart-frame.tsx itself is the frame);
 *   div-chart              a DATA BAR drawn with boxes: an inline style whose inline size / width / block size / height is a template literal
 *                          ending in a percentage computed from a value (`${…}%`) — a chart without a frame, a legend or an alternative.
 *
 * Comments are stripped first (B107's stripComments: a comment that says role="img" is not one). Test files are not product surfaces.
 * Findings are fingerprinted by rule, file and text (never by line — a moved line is not a new finding) for THE RATCHET (chart-lint-ratchet.ts):
 * today's findings are committed and the list ONLY SHRINKS. The lint JUDGES nothing: its findings are recorded through B107's
 * governance.dg_record_evaluation (rules `dg-lint-4`) under the principle the Design System Authority declares (CHART_PRINCIPLE), where a
 * narrow, approved, expiring exception may cover one. CONSTRUCTION only.
 */
import { createHash } from 'node:crypto';
import { stripComments, type SourceFile } from '../design-lint.js';

export const CHART_LINT_VERSION = 'dg-lint-4';
export const CHART_PRINCIPLE = 'design.evidence-bearing-charts';
export const CHART_PRINCIPLE_STATEMENT = 'Strategic visualizations use an evidence-bearing grammar (UX-ADR-015): every material visual renders through the library\'s chart frame and declares its basis, time (basis, cutoff, as-of), units, sources, uncertainty, legend and an accessible table alternative; series are told apart without colour alone; a drawing outside the frame, or a data bar drawn with boxes, bypasses the grammar.';
export const CHART_RULES = ['drawing-outside-frame', 'div-chart'] as const;
export type ChartRule = (typeof CHART_RULES)[number];
export interface ChartFinding { rule: ChartRule; principle: string; file: string; line: number; excerpt: string; note: string; fingerprint: string }
export interface ChartLintResult { rulesVersion: string; inputDigest: string; files: number; findings: ChartFinding[]; counts: Record<ChartRule, number> }

const PAGE = /^apps\/web\/app\/.*\.tsx$/;
const LIBRARY_FILE = /^apps\/web\/components\/[^/]+\.tsx$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const FRAME_FILE = 'apps/web/components/chart-frame.tsx';
const ROLE_IMG = /\brole\s*=\s*(?:"img"|'img'|\{\s*['"`]img['"`]\s*\})/g;
const DIV_BAR = /\b(?:inlineSize|width|blockSize|height)\s*:\s*`[^`]*\$\{[^}]+\}\s*%`/g;

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;
const excerptAt = (text: string, line: number): string => (text.split('\n')[line - 1] ?? '').trim().slice(0, 200);
const fp = (rule: string, file: string, excerpt: string): string => createHash('sha256').update(`${rule}\0${file}\0${excerpt.trim()}`).digest('hex').slice(0, 16);

/** The opening tag starting at `at` (`<svg …>`), braces respected (an arrow `=>` inside an attribute expression does not end the tag). */
export function openingTag(code: string, at: number): string {
  let depth = 0;
  for (let i = at; i < code.length && i < at + 4000; i += 1) {
    const c = code[i];
    if (c === '{') depth += 1; else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0 && code[i - 1] !== '=') return code.slice(at, i + 1);
  }
  return code.slice(at, at + 200);
}
/** Is this opening tag a GLYPH, not a data drawing: hidden from assistive technology, or the symbol set's 24-unit icon grid (B80's
 *  symbols.tsx / ui.tsx — a named symbol, never a chart)? */
export const hiddenTag = (tag: string): boolean =>
  /\baria-hidden(?:\s*=\s*(?:"true"|'true'|\{\s*true\s*\}))?(?=[\s/>])/.test(tag) || /\bviewBox\s*=\s*["']0 0 24 24["']/.test(tag);

/** THE LINT. Deterministic: findings sorted (file, line, rule); the input digest names what was read. */
export function lintCharts(files: SourceFile[]): ChartLintResult {
  const findings: ChartFinding[] = [];
  const add = (rule: ChartRule, file: string, text: string, index: number, note: string) => {
    const line = lineOf(text, index); const excerpt = excerptAt(text, line);
    findings.push({ rule, principle: CHART_PRINCIPLE, file, line, excerpt, note, fingerprint: fp(rule, file, excerpt) });
  };
  for (const f of files) {
    if (TEST_FILE.test(f.path) || f.path.includes('packages/tokens/')) continue;
    const page = PAGE.test(f.path); const lib = LIBRARY_FILE.test(f.path);
    if (!page && !lib) continue;
    const code = stripComments(f.text);
    if (page) {
      for (const m of code.matchAll(ROLE_IMG)) add('drawing-outside-frame', f.path, code, m.index ?? 0, 'a role="img" drawing on a page — render it through the library\'s ChartFrame (a chart component of components/chart.tsx, strategic-charts.tsx or canvas.tsx) so it declares its basis, time, units, sources, uncertainty, legend and table alternative');
      for (const m of code.matchAll(/<svg\b/g)) if (!hiddenTag(openingTag(code, m.index ?? 0))) add('drawing-outside-frame', f.path, code, m.index ?? 0, 'an <svg> drawing on a page that is not a hidden glyph — draw it inside the library\'s ChartFrame');
      for (const m of code.matchAll(DIV_BAR)) add('div-chart', f.path, code, m.index ?? 0, 'a data bar drawn with boxes (a size computed as a percentage of a value) — a chart without a frame, a legend or a table alternative; use the library chart that draws it');
    } else if (f.path !== FRAME_FILE && !/<ChartFrame\b/.test(code)) {
      for (const m of code.matchAll(/<svg\b/g)) if (!hiddenTag(openingTag(code, m.index ?? 0))) add('drawing-outside-frame', f.path, code, m.index ?? 0, 'a library component draws an <svg> that is not a hidden glyph without rendering ChartFrame — compose the frame');
      for (const m of code.matchAll(ROLE_IMG)) add('drawing-outside-frame', f.path, code, m.index ?? 0, 'a library component exposes a role="img" drawing without rendering ChartFrame — compose the frame');
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  const unique = findings.filter((x, i) => i === 0 || !(x.file === findings[i - 1]!.file && x.line === findings[i - 1]!.line && x.rule === findings[i - 1]!.rule));
  const counts: Record<ChartRule, number> = { 'drawing-outside-frame': 0, 'div-chart': 0 };
  for (const x of unique) counts[x.rule] += 1;
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(`${f.path}\0${createHash('sha256').update(f.text).digest('hex')}\n`);
  return { rulesVersion: CHART_LINT_VERSION, inputDigest: h.digest('hex'), files: files.length, findings: unique, counts };
}

/* ── THE RATCHET (the B81 dg-lint-3 idiom): the committed findings only shrink ── */
export interface ChartRatchetEntry { rule: ChartRule; file: string; excerpt: string; fingerprint: string; carrier: string }
export interface ChartRatchetResult { baseline: number; current: number; regressions: ChartFinding[]; resolved: ChartRatchetEntry[]; holds: boolean }
/** A finding not committed is a REGRESSION; a committed one no longer found is RESOLVED (remove it from the list in the same change). Multiset by fingerprint. */
export function chartRatchet(findings: readonly ChartFinding[], committed: readonly ChartRatchetEntry[]): ChartRatchetResult {
  const left = new Map<string, number>();
  for (const c of committed) left.set(c.fingerprint, (left.get(c.fingerprint) ?? 0) + 1);
  const regressions: ChartFinding[] = [];
  for (const f of findings) { const n = left.get(f.fingerprint) ?? 0; if (n > 0) left.set(f.fingerprint, n - 1); else regressions.push(f); }
  const resolved: ChartRatchetEntry[] = [];
  for (const c of committed) { const n = left.get(c.fingerprint) ?? 0; if (n > 0) { resolved.push(c); left.set(c.fingerprint, n - 1); } }
  return { baseline: committed.length, current: findings.length, regressions, resolved, holds: regressions.length === 0 };
}
