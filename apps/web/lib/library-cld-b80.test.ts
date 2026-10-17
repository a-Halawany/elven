import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY } from './b80-seams';

/**
 * CP-6 B80 §CL-D (UX-ADR-011 / -012): ONE library. The data and layer components live in components/data.tsx and components/layers.tsx; a
 * page may compose them but never FORK them — no local component of the same name, no second modal (`<dialog>` / role="dialog") outside the
 * layer component, no page-local re-implementation of the table contract's windowing. This is the web side of the fork rule; registering the
 * rule in B107's principle registry (`dg-lint-2`) is §TK's. Reads the real source (like B107's lint).
 */
const WEB = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = [...walk(join(WEB, 'app')), ...walk(join(WEB, 'components'))].map((p) => ({ path: relative(WEB, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
const OWN = new Set(['components/data.tsx', 'components/layers.tsx']);

describe('the data and layer components are the library\'s, exported where the contract says', () => {
  it('every name LIBRARY assigns to data.tsx and layers.tsx is an exported function there', () => {
    for (const [file, names] of [['components/data.tsx', LIBRARY.data.exports], ['components/layers.tsx', LIBRARY.layers.exports]] as const) {
      const text = files.find((f) => f.path === file)!.text;
      for (const n of names) expect(text, `${file} exports ${n}`).toMatch(new RegExp(`^export function ${n}\\b`, 'm'));
    }
  });
  it('no other file defines a component of the same name (a fork), except ui.tsx\'s historical Panel', () => {
    const names = [...LIBRARY.data.exports, ...LIBRARY.layers.exports];
    const forks = files.filter((f) => !OWN.has(f.path)).flatMap((f) => names
      .filter((n) => new RegExp(`(?:function|const)\\s+${n}\\b`).test(f.text))
      .filter((n) => !(f.path === 'components/ui.tsx' && n === 'Panel'))
      .map((n) => `${f.path}: ${n}`));
    expect(forks).toEqual([]);
  });
  /* A RATCHET: two pages predate the library with an inline review panel labelled role="dialog" (not modal). They are named here and move
     onto layers.tsx's Dialog when their stages next touch them; no NEW one may appear (a fork of the layer contract). */
  const PRE_B80 = ['app/admin/commercial/ledger/page.tsx', 'app/decisions/gate-control.tsx'];
  it('no modal outside the layer component: no <dialog>, no showModal(), no new role="dialog" anywhere else', () => {
    expect(files.filter((f) => !OWN.has(f.path) && /<dialog\b|\.showModal\(/.test(f.text)).map((f) => f.path)).toEqual([]);
    const hits = files.filter((f) => !OWN.has(f.path) && /role=["']dialog["']/.test(f.text)).map((f) => f.path).sort();
    expect(hits.filter((p) => !PRE_B80.includes(p))).toEqual([]);
  });
});
