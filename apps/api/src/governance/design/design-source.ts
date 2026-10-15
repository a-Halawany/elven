/**
 * B107 §DG (0115_b107_x_dg; REL-01, UX-72) — THE REPOSITORY READER of design governance: the web source the lint reads, and the INVENTORY of
 * design assets (the semantic token set in packages/tokens; the exported components of apps/web/components; the named interaction patterns
 * they carry) with each one's consumers (the pages that render it). READ-ONLY: nothing here writes a file. `inventoryFrom` is PURE (files in,
 * assets out — unit-tested); `readRepository` is the thin fs wrapper. The inventory is registered through governance.dg_register_assets by
 * the conformance steward or the Design System Authority (a new asset arrives `proposed` with NO owner — the gap is shown until the
 * authority names one; a moved source is reported as drift and changes nothing).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { SourceFile } from './design-lint.js';

export interface InventoryAsset {
  kind: 'design_component' | 'pattern' | 'design_asset'; key: string; title: string; sourceRef: string; packageVersion: string; sourceDigest: string; consumers: string[];
}

/** The named interaction patterns the inventory recognises (each carried by one component of apps/web/components). */
export const PATTERNS: ReadonlyArray<{ key: string; title: string; component: string }> = [
  { key: 'pattern.governed-action', title: 'Governed action — pending until the authoritative receipt; no optimistic path (UX-ADR-017)', component: 'GovernedButton' },
  { key: 'pattern.truth-state', title: 'Truth state — colour, UPPERCASE label and symbol, never colour alone (TS-01…TS-10)', component: 'TruthBadge' },
  { key: 'pattern.degraded-state', title: 'Degraded state — visibly marked, never hidden', component: 'DegradedBanner' },
  { key: 'pattern.refusal-in-server-words', title: 'Refusal — the server\'s words, the code and the correlation id', component: 'ErrorNote' },
  { key: 'pattern.receipt', title: 'Receipt — the policy decision and the audit sequence of a governed act', component: 'Receipt' },
];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** The exported React components of a component file (an exported function whose name starts upper-case), each with its own source slice. */
export function exportedComponents(text: string): Array<{ name: string; slice: string }> {
  const marks = [...text.matchAll(/^export (?:function|const) ([A-Za-z0-9_]+)/gm)].map((m) => ({ name: m[1]!, at: m.index ?? 0 }));
  return marks.map((m, i) => ({ name: m.name, slice: text.slice(m.at, i + 1 < marks.length ? marks[i + 1]!.at : text.length) }))
    .filter((m) => /^[A-Z]/.test(m.name) && /^export function/.test(m.slice));
}

/** The route a page file serves (apps/web/app/admin/governance/design/page.tsx → /admin/governance/design). */
export const routeOf = (path: string): string => '/' + path.replace(/^apps\/web\/app\/?/, '').replace(/\/?page\.tsx$/, '').replace(/^$/, '');

/** THE INVENTORY (pure): the token set, the components and the patterns, with their consumers — sorted by key, deterministic. */
export function inventoryFrom(files: SourceFile[], versions: { tokens: string; web: string }): InventoryAsset[] {
  const pages = files.filter((f) => /^apps\/web\/app\/.*page\.tsx$/.test(f.path));
  const consumersOf = (name: string) => pages.filter((p) => new RegExp(`<${name}\\b`).test(p.text)).map((p) => routeOf(p.path)).sort();
  const out: InventoryAsset[] = [];
  const registry = files.find((f) => f.path === 'packages/tokens/src/registry.ts');
  if (registry !== undefined) {
    out.push({ kind: 'design_asset', key: 'tokens.semantic', title: 'Semantic design tokens — Volume 9 Appendix A (colour, type, space, radius, border)',
               sourceRef: 'packages/tokens/src/registry.ts', packageVersion: versions.tokens, sourceDigest: sha(registry.text), consumers: ['apps/web (globals.css → @eye/tokens/css)'] });
  }
  const components = files.filter((f) => /^apps\/web\/components\/[^/]+\.tsx$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const byName = new Map<string, { file: string; slice: string }>();
  for (const f of components) {
    const base = f.path.replace(/^apps\/web\/components\//, '').replace(/\.tsx$/, '');
    for (const c of exportedComponents(f.text)) {
      byName.set(c.name, { file: f.path, slice: c.slice });
      out.push({ kind: 'design_component', key: `web.${kebab(base)}.${kebab(c.name)}`, title: `${c.name} (${base}.tsx)`, sourceRef: `${f.path}#${c.name}`,
                 packageVersion: versions.web, sourceDigest: sha(c.slice), consumers: consumersOf(c.name) });
    }
  }
  for (const p of PATTERNS) {
    const c = byName.get(p.component);
    if (c === undefined) continue;
    out.push({ kind: 'pattern', key: p.key, title: p.title, sourceRef: `${c.file}#${p.component}`, packageVersion: versions.web, sourceDigest: sha(`${p.key}\0${c.slice}`), consumers: consumersOf(p.component) });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** The repository root (the directory holding pnpm-workspace.yaml), from EYE_REPO_ROOT or by walking up from the working directory; null when absent. */
export function repoRoot(start = process.cwd()): string | null {
  const env = process.env['EYE_REPO_ROOT'];
  if (env !== undefined && env !== '' && existsSync(join(env, 'pnpm-workspace.yaml'))) return resolve(env);
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = resolve(dir, '..'); if (up === dir) break; dir = up;
  }
  return null;
}

function walk(root: string, dir: string, out: SourceFile[], accept: (p: string) => boolean): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.next' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out, accept);
    else { const rel = relative(root, full).split('\\').join('/'); if (accept(rel)) out.push({ path: rel, text: readFileSync(full, 'utf8') }); }
  }
}

/** READ the design-relevant sources (read-only): the web app's pages, components and client libraries, its message catalogue, the token
 *  registry, and the two package versions. Null when this deployment carries no source tree (the routes then answer 409). */
export function readRepository(root = repoRoot()): { files: SourceFile[]; versions: { tokens: string; web: string } } | null {
  if (root === null || !existsSync(join(root, 'apps/web/app'))) return null;
  const files: SourceFile[] = [];
  walk(root, join(root, 'apps/web/app'), files, (p) => /\.(ts|tsx|css)$/.test(p));
  walk(root, join(root, 'apps/web/components'), files, (p) => /\.(ts|tsx)$/.test(p));
  walk(root, join(root, 'apps/web/lib'), files, (p) => /\.(ts|tsx)$/.test(p));
  for (const p of ['apps/web/messages/en.json', 'packages/tokens/src/registry.ts']) if (existsSync(join(root, p))) files.push({ path: p, text: readFileSync(join(root, p), 'utf8') });
  const version = (p: string) => { try { return String((JSON.parse(readFileSync(join(root, p), 'utf8')) as { version?: string }).version ?? '0.0.0'); } catch { return '0.0.0'; } };
  return { files, versions: { tokens: version('packages/tokens/package.json'), web: version('apps/web/package.json') } };
}
