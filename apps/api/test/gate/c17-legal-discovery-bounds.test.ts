/** C17.2 D — a recursive walk must find deep legal material and fail closed at its safety bound. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverLegalFiles } from '../../../../scripts/gate/lib/license-closure.mjs';
import { markdownFenceBlock } from '../../../../scripts/gate/licence-obligations.mjs';

describe('C17.2 D — recursive legal discovery is complete and fails closed at its safety bound', () => {
  const roots: string[] = [];
  const root = () => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c172-legal-walk-'));
    roots.push(d);
    return d;
  };
  afterEach(() => { for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('discovers legal material under shipped test trees instead of skipping it', () => {
    const d = root();
    mkdirSync(join(d, 'tests', 'fixtures'), { recursive: true });
    writeFileSync(join(d, 'tests', 'fixtures', 'AUTHORS'), 'Alice Example\n');
    const r = discoverLegalFiles(d);
    expect(r.problems).toEqual([]);
    expect(r.files.map((f: any) => f.file)).toContain('tests/fixtures/AUTHORS');
  });

  it('discovers legal material beyond the former depth-six truncation point', () => {
    const d = root();
    let at = d;
    for (let i = 0; i < 8; i += 1) { at = join(at, `d${i}`); mkdirSync(at); }
    writeFileSync(join(at, 'LICENSE'), 'MIT License\n');
    const r = discoverLegalFiles(d);
    expect(r.problems).toEqual([]);
    expect(r.files.map((f: any) => f.file)).toContain('d0/d1/d2/d3/d4/d5/d6/d7/LICENSE');
  });

  it('reports the 401st legal file instead of returning a plausible sample of 400', () => {
    const d = root();
    for (let i = 0; i < 401; i += 1) writeFileSync(join(d, `NOTICE-${String(i).padStart(3, '0')}.txt`), `${i}\n`);
    const r = discoverLegalFiles(d);
    expect(r.files).toHaveLength(400);
    expect(r.problems.join('\n')).toMatch(/file limit 400/);
  });

  it('reports a legal-file symlink rather than silently omitting it', () => {
    const d = root();
    writeFileSync(join(d, 'real.txt'), 'legal bytes\n');
    symlinkSync('real.txt', join(d, 'LICENSE'));
    const r = discoverLegalFiles(d);
    expect(r.problems.join('\n')).toMatch(/LICENSE.*symlink/);
  });

  it('reports a symlinked directory because it could hide uninspected legal material', () => {
    const d = root();
    mkdirSync(join(d, 'real'));
    writeFileSync(join(d, 'real', 'LICENSE'), 'MIT License\n');
    symlinkSync('real', join(d, 'linked'));
    const r = discoverLegalFiles(d);
    expect(r.problems.join('\n')).toMatch(/linked.*symlink.*cannot prove/);
  });

  it('does not silently skip dot-directories that carry notices', () => {
    const d = root();
    mkdirSync(join(d, '.packaged'), { recursive: true });
    writeFileSync(join(d, '.packaged', 'NOTICE'), 'Copyright Example\n');
    const r = discoverLegalFiles(d);
    expect(r.problems).toEqual([]);
    expect(r.files.map((f: any) => f.file)).toContain('.packaged/NOTICE');
  });

  it('emits complete AUTHORS/legal bytes without trimming or rewriting embedded Markdown fences', () => {
    const authors = 'FIRST AUTHOR  \n```embedded fence```\nLAST AUTHOR\t';
    const block = markdownFenceBlock(authors);
    expect(block).toContain(`\n${authors}\n`);
    expect(block).not.toContain('\u200b');
    const [opening, ...rest] = block.split('\n');
    expect(opening).toMatch(/^`{4,}text$/);
    expect(rest.at(-1)).toBe(opening.replace(/text$/, ''));
  });
});
