/**
 * B80 §TK (F-P7-E-03: UX-05-003, UX-05-005; UX-ADR-010) — THE LIBRARY LINT `dg-lint-2` and THE COMPATIBILITY GATE: PURE functions over the
 * web source (the reader is B107's design-source.ts; nothing here writes a file).
 *
 *   library-fork        a LOCAL component (a function component defined in apps/web/app/**) that carries the NAME of a shared-library
 *                       component (apps/web/components/*.tsx exports) — a fork of the library's identity (UX-05-005: quarantine it);
 *   token-redefinition  a design-token custom property (`--eye-…:`) DECLARED outside packages/tokens — a local override of a token value
 *                       (themes are mapped through the governed theme ports and emitted by packages/tokens, never declared in a page).
 *
 * Findings name the principle they evidence (FORK_PRINCIPLE — declared in B107's principle registry by the Design System Authority, a human
 * act; the lint judges nothing) and are recorded through governance.dg_record_evaluation (rules `dg-lint-2`): a finding is OPEN until a narrow,
 * approved exception covers it, and the verdict is the port's. B107's dg-lint-1 is untouched.
 *
 * THE COMPATIBILITY GATE (UX-05-003): a component's PROPS CONTRACT (its destructured prop names, each required or optional, from its exported
 * signature) and its digest; comparing two versions names the breaking changes (a prop removed, a prop newly required) — the evidence a
 * `component_change` contribution carries into B107's queue (review → accept → publish by the Design System Authority).
 */
import { createHash } from 'node:crypto';
import { exportedComponents } from '../design-source.js';
import { stripComments, type SourceFile } from '../design-lint.js';

export const LIBRARY_LINT_VERSION = 'dg-lint-2';
export const FORK_PRINCIPLE = 'design.no-local-fork';
export const FORK_PRINCIPLE_STATEMENT = 'A local component or theme never duplicates a library component\'s identity or redefines a token value (UX-05-005); it is quarantined until it is migrated onto the library or rejected.';
export type LibraryRule = 'library-fork' | 'token-redefinition';
export interface LibraryFinding { rule: LibraryRule; principle: string; file: string; line: number; excerpt: string; note: string }
export interface LibraryLintResult { rulesVersion: string; inputDigest: string; files: number; library: string[]; findings: LibraryFinding[]; counts: Record<LibraryRule, number> }

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;
const excerptAt = (text: string, line: number): string => (text.split('\n')[line - 1] ?? '').trim().slice(0, 200);

/** The library's component names (every exported UpperCase function of a top-level apps/web/components/*.tsx). */
export function libraryNames(files: SourceFile[]): string[] {
  const names = new Set<string>();
  for (const f of files) if (/^apps\/web\/components\/[^/]+\.tsx$/.test(f.path)) for (const c of exportedComponents(f.text)) names.add(c.name);
  return [...names].sort();
}

function inputDigest(files: SourceFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(`${f.path}\0${createHash('sha256').update(f.text).digest('hex')}\n`);
  return h.digest('hex');
}

/** THE LIBRARY LINT. Test files and packages/tokens are not product surfaces; findings sorted (file, line, rule) — deterministic. */
export function lintLibrary(files: SourceFile[]): LibraryLintResult {
  const library = libraryNames(files);
  const lib = new Set(library);
  const findings: LibraryFinding[] = [];
  for (const f of files) {
    if (f.path.includes('packages/tokens/') || /\.(test|spec)\.(ts|tsx)$/.test(f.path)) continue;
    const code = stripComments(f.text);
    if (/^apps\/web\/app\/.*\.tsx$/.test(f.path)) {
      for (const m of code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[a-z_][A-Za-z0-9_]*)\s*=>/g)) {
        const name = m[1] ?? m[2] ?? '';
        if (!lib.has(name)) continue;
        const line = lineOf(code, (m.index ?? 0) + (m[0].startsWith('\n') ? 1 : 0));
        findings.push({ rule: 'library-fork', principle: FORK_PRINCIPLE, file: f.path, line, excerpt: excerptAt(f.text, line),
                        note: `a local ${name} duplicates the library component ${name} (apps/web/components) — migrate onto it or rename it` });
      }
    }
    if (/^apps\/web\/.*\.(ts|tsx|css)$/.test(f.path)) {
      // a declaration: a CSS property (`--eye-x:` after `{`, `;` or a line start), an object key (`'--eye-x':` after `{` or `,`), or a
      // style.setProperty('--eye-x', …) — never a READ (`var(--eye-x)`) or a ternary choosing a token name (`? '--eye-a' : '--eye-b'`)
      const decl = f.path.endsWith('.css') ? /(?:^|[;{])\s*(--eye-[a-z0-9-]+)\s*:/gm : /[{,]\s*(['"])(--eye-[a-z0-9-]+)\1\s*:|setProperty\(\s*(['"`])(--eye-[a-z0-9-]+)\3/g;
      for (const m of code.matchAll(decl)) {
        const name = m[1]?.startsWith('--') === true ? m[1] : (m[2] ?? m[4] ?? '');
        const line = lineOf(code, (m.index ?? 0) + (m[0].length - m[0].trimStart().length));
        findings.push({ rule: 'token-redefinition', principle: FORK_PRINCIPLE, file: f.path, line, excerpt: excerptAt(f.text, line),
                        note: `${name} is declared outside packages/tokens — a token value is defined once; a customer theme is mapped through the governed theme ports` });
      }
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  const counts: Record<LibraryRule, number> = { 'library-fork': 0, 'token-redefinition': 0 };
  for (const x of findings) counts[x.rule] += 1;
  return { rulesVersion: LIBRARY_LINT_VERSION, inputDigest: inputDigest(files), files: files.length, library, findings, counts };
}

/* ── THE COMPATIBILITY GATE ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface PropsContract { component: string; props: Array<{ name: string; required: boolean }>; digest: string }

/** The props contract of an exported component's source slice: `export function X({ a, b }: { a: string; b?: number })`. A component with
 *  no destructured props has an empty contract. */
export function propsContract(component: string, slice: string): PropsContract {
  const code = stripComments(slice);
  const sig = code.match(new RegExp(`export\\s+function\\s+${component}\\s*\\(\\s*\\{([^}]*)\\}\\s*:\\s*\\{([^}]*)\\}`));
  const props: Array<{ name: string; required: boolean }> = [];
  if (sig !== null) {
    const typeText = sig[2] ?? '';
    for (const raw of (sig[1] ?? '').split(',')) {
      const name = raw.split('=')[0]!.split(':')[0]!.replace('...', '').trim();
      if (name === '' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue;
      const optional = new RegExp(`(?:^|[;,\\s])${name}\\s*\\?\\s*:`).test(typeText) || raw.includes('=');
      props.push({ name, required: !optional });
    }
  }
  props.sort((a, b) => a.name.localeCompare(b.name));
  return { component, props, digest: createHash('sha256').update(JSON.stringify({ component, props })).digest('hex') };
}

export interface Compatibility { compatible: boolean; identical: boolean; breaking: string[]; additive: string[] }
/** COMPARE two props contracts: a prop removed or newly required is BREAKING (a consumer would be stranded); a new optional prop is additive. */
export function compatibility(before: PropsContract, after: PropsContract): Compatibility {
  const b = new Map(before.props.map((p) => [p.name, p])); const a = new Map(after.props.map((p) => [p.name, p]));
  const breaking: string[] = []; const additive: string[] = [];
  for (const p of before.props) if (!a.has(p.name)) breaking.push(`${before.component}.${p.name} removed`);
  for (const p of after.props) {
    const was = b.get(p.name);
    if (was === undefined) (p.required ? breaking : additive).push(`${after.component}.${p.name} added${p.required ? ' as required' : ' (optional)'}`);
    else if (p.required && !was.required) breaking.push(`${after.component}.${p.name} became required`);
  }
  return { compatible: breaking.length === 0, identical: before.digest === after.digest, breaking: breaking.sort(), additive: additive.sort() };
}

/** The props contracts of every library component (sorted) — the inventory's compatibility evidence. */
export function libraryContracts(files: SourceFile[]): PropsContract[] {
  const out: PropsContract[] = [];
  for (const f of files) if (/^apps\/web\/components\/[^/]+\.tsx$/.test(f.path)) for (const c of exportedComponents(f.text)) out.push(propsContract(c.name, c.slice));
  return out.sort((a, b) => a.component.localeCompare(b.component));
}
