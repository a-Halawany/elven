#!/usr/bin/env node
/**
 * Assert a workflow grants EXACTLY `contents: read` and nothing else, anywhere.
 *
 * The previous self-check grepped for `id-token: write`. That is one key out of many: `contents`,
 * `packages`, `actions`, `attestations`, `deployments`, `issues`, `pull-requests`, `statuses`,
 * `security-events` and the rest are all writable permissions, and `permissions: write-all` grants
 * every one of them in five words the grep would not have matched.
 *
 * So this parses the permission blocks and requires the whole map, rather than looking for the one
 * grant somebody thought of. A permission that is not `contents: read` is a finding whether or not
 * anyone anticipated it.
 *
 * Usage: assert-readonly-workflow.mjs <workflow.yml>...
 */
import { readFileSync } from 'node:fs';

/**
 * Every `permissions:` block in the file, as `{ line, scope, entries }`.
 *
 * Deliberately a small indentation-aware reader rather than a YAML dependency: the gate's scanners
 * are pinned by digest and adding a parser to assert three lines would be a larger supply-chain
 * surface than the thing it checks.
 */
export function permissionBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)permissions:\s*(\S.*)?$/.exec(lines[i]);
    if (m === null) continue;
    const indent = m[1].length;
    const inline = (m[2] ?? '').trim();
    if (inline !== '') {                       // `permissions: write-all` / `read-all` / `{}`
      blocks.push({ line: i + 1, inline, entries: [] });
      continue;
    }
    const entries = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const raw = lines[j];
      if (raw.trim() === '' || /^\s*#/.test(raw)) continue;
      const ind = /^(\s*)/.exec(raw)[1].length;
      if (ind <= indent) break;
      const e = /^\s*([a-z-]+):\s*(\S+)\s*$/.exec(raw);
      if (e !== null) entries.push({ name: e[1], value: e[2], line: j + 1 });
    }
    blocks.push({ line: i + 1, inline: null, entries });
  }
  return blocks;
}

/** Findings for anything that is not exactly `contents: read`. */
export function assertReadOnly(text, label = 'workflow') {
  const problems = [];
  const blocks = permissionBlocks(text);
  if (blocks.length === 0) {
    problems.push(`${label}: declares no permissions block, so it inherits the repository default; `
      + 'a read-only job must say so rather than depend on a setting it does not control');
    return problems;
  }
  for (const b of blocks) {
    if (b.inline !== null) {
      // `read-all` is not equivalent: it grants read on every scope, not contents alone.
      problems.push(`${label}:${b.line}: permissions is ${JSON.stringify(b.inline)}; this workflow `
        + 'must grant exactly `contents: read`');
      continue;
    }
    if (b.entries.length === 0) {
      problems.push(`${label}:${b.line}: an empty permissions block grants nothing and states `
        + 'nothing; declare `contents: read`');
      continue;
    }
    for (const e of b.entries) {
      if (e.name === 'contents' && e.value === 'read') continue;
      problems.push(`${label}:${e.line}: ${e.name}: ${e.value} is granted; this workflow must grant `
        + 'exactly `contents: read` and nothing else');
    }
    if (!b.entries.some((e) => e.name === 'contents' && e.value === 'read')) {
      problems.push(`${label}:${b.line}: this block does not grant \`contents: read\``);
    }
  }
  return problems;
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write('usage: assert-readonly-workflow.mjs <workflow.yml>...\n');
    process.exit(2);
  }
  let bad = 0;
  for (const f of files) {
    const problems = assertReadOnly(readFileSync(f, 'utf8'), f);
    for (const p of problems) { process.stderr.write(`::error::${p}\n`); bad += 1; }
    if (problems.length === 0) process.stdout.write(`${f}: exactly contents: read, everywhere\n`);
  }
  process.exit(bad > 0 ? 1 : 0);
}
