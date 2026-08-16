/**
 * C17.2 F — the bundled native stack is reconciled against what the package SHIPS.
 *
 * `@img/sharp-libvips-linux-x64` bundles ~30 third-party libraries into one shared object. C17
 * recorded only the package-level LGPL declaration, so every bundled library's own terms and
 * obligations went unrecorded. The tracked manifest is not trusted on its own: it is reconciled,
 * every run, against the `versions.json` and `README.md` the package itself ships.
 *
 * Every control executes the real verifier against a real or deliberately corrupted manifest.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  verifyBundledComponents, loadBundledManifest, readmeRows, BUNDLED_PACKAGE,
} from '../../../../scripts/gate/lib/bundled-components.mjs';
import { loadCanonicalTexts } from '../../../../scripts/gate/lib/licence-texts.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const TIMEOUT = 180_000;

describe('C17.2 F — bundled native stack', () => {
  let texts: Map<string, unknown>;

  beforeAll(() => {
    const t = loadCanonicalTexts(REPO);
    expect(t.ok, t.problems.join('\n')).toBe(true);
    texts = t.texts as Map<string, unknown>;
  });

  it('reconciles cleanly against the shipped versions.json and README', () => {
    const r = verifyBundledComponents(REPO, { texts });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    // Non-vacuity: a manifest of nothing would also "reconcile".
    expect(r.componentCount).toBeGreaterThanOrEqual(29);
    expect(r.notes.join(' ')).toMatch(/bundled_components=\d+ readme_rows=\d+ versions_keys=\d+ source_offers=\d+ copyleft=\d+/);
  }, TIMEOUT);

  it('records the licence terms the README actually states, for every library', () => {
    const m = loadBundledManifest(REPO);
    const store = join(REPO, 'node_modules', '.pnpm');
    const dirName = readdirSync(store).find((n) => n.startsWith(`${BUNDLED_PACKAGE.replace('/', '+')}@`)) as string;
    const pkgDir = join(store, dirName, 'node_modules', BUNDLED_PACKAGE);
    const rows = readmeRows(readFileSync(join(pkgDir, 'README.md'), 'utf8'));
    expect(rows.length).toBeGreaterThanOrEqual(29);
    for (const row of rows) {
      const c = m.bundled_components.find((x: any) => x.name === row.name);
      expect(c, `${row.name} must be in the manifest`).toBeDefined();
      expect(c.declared_terms_upstream).toBe(row.terms);
      expect(typeof c.spdx_expression, `${row.name} must have a mapped SPDX expression`).toBe('string');
    }
  }, TIMEOUT);

  it('every copyleft bundled component has a source offer naming an https upstream', () => {
    const m = loadBundledManifest(REPO);
    const copyleft = m.bundled_components.filter(
      (c: any) => /LGPL|MPL|GPL/.test(c.spdx_expression ?? ''),
    );
    // These are real: cairo (MPL), and the LGPL set including libvips itself.
    expect(copyleft.length).toBeGreaterThanOrEqual(9);
    for (const c of copyleft) {
      const o = m.source_offers.find((x: any) => x.component === c.name);
      expect(o, `${c.name} (${c.spdx_expression}) needs a source offer`).toBeDefined();
      expect(o.upstream_source).toMatch(/^https:\/\//);
      expect(o.version).toBe(c.version);
      expect(o.obtain.length).toBeGreaterThan(0);
    }
  }, TIMEOUT);

  it('the build recipe is pinned to an immutable commit, not just a tag', () => {
    const m = loadBundledManifest(REPO);
    expect(m.build_recipe.tag).toBe('v1.3.2');
    expect(m.build_recipe.commit_binding.commit).toMatch(/^[0-9a-f]{40}$/);
    // The reason is recorded, because a tag alone would look equally pinned.
    expect(m.build_recipe.commit_binding.why).toMatch(/tag is mutable/i);
  });

  it('the AOM patent grant is recorded explicitly, not silently dropped', () => {
    const m = loadBundledManifest(REPO);
    expect(m.aom_patent_grant.applies_to).toBe('aom');
    // SPDX publishes no id for it, so the record says so rather than implying a vendored text.
    expect(m.aom_patent_grant.note).toMatch(/no identifier/i);
    expect(m.aom_patent_grant.upstream_source).toMatch(/^https:\/\//);
  });

  /** A throwaway root whose tracked manifest can be corrupted safely. */
  const withManifest = (mutate: (m: any) => void, fn: (root: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), 'eye-c172-bundled-'));
    try {
      // Symlink the store so the SHIPPED package is the real one; only the manifest changes.
      mkdirSync(join(root, 'scripts', 'gate'), { recursive: true });
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      require('node:fs').symlinkSync(join(REPO, 'node_modules', '.pnpm'), join(root, 'node_modules', '.pnpm'));
      const m = loadBundledManifest(REPO);
      mutate(m);
      writeFileSync(join(root, 'scripts/gate/bundled-components.json'), JSON.stringify(m, null, 2));
      fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it.each([
    ['a REMOVED bundled library', (m: any) => {
      m.bundled_components = m.bundled_components.filter((c: any) => c.name !== 'libwebp');
    }, /README names bundled library 'libwebp', which the manifest omits/],
    ['an ALTERED licence', (m: any) => {
      const c = m.bundled_components.find((x: any) => x.name === 'libvips');
      c.spdx_expression = 'MIT';
      c.declared_terms_upstream = 'MIT License';
    }, /records terms "MIT License", the shipped README says "LGPLv3"/],
    ['a MISSING source offer', (m: any) => {
      m.source_offers = m.source_offers.filter((o: any) => o.component !== 'libvips');
    }, /'libvips' is LGPL-3\.0-or-later and has NO source offer/],
    ['a WRONG version', (m: any) => {
      m.bundled_components.find((x: any) => x.name === 'libvips').version = '0.0.0';
    }, /records version "0\.0\.0", versions\.json says/],
    ['a DUPLICATE component', (m: any) => {
      m.bundled_components.push({ ...m.bundled_components[0] });
    }, /appears more than once/],
    ['an UNCLASSIFIED licence', (m: any) => {
      m.bundled_components.find((x: any) => x.name === 'cgif').spdx_expression = '';
    }, /has no SPDX expression; its licence is unclassified/],
    ['an INVENTED component', (m: any) => {
      m.bundled_components.push({
        name: 'not-really-bundled', version: '1.0.0', spdx_expression: 'MIT',
        declared_terms_upstream: 'MIT License',
      });
    }, /'not-really-bundled' is not named by the shipped README/],
    ['a stale shipped-evidence digest', (m: any) => {
      m.shipped_evidence.versions_json_sha256 = 'f'.repeat(64);
    }, /versions\.json hashes to [a-f0-9]{64}, the manifest records f{64}/],
    ['an unpinned build recipe', (m: any) => { delete m.build_recipe.commit_binding; },
      /build recipe is not bound to an immutable 40-hex commit/],
    ['a source offer for a version that is not bundled', (m: any) => {
      m.source_offers.find((o: any) => o.component === 'libvips').version = '9.9.9';
    }, /source offer for 'libvips' is for version "9\.9\.9"/],
  ])('rejects %s', (_label, mutate, pattern) => {
    withManifest(mutate, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.ok, 'the mutation must be rejected').toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
    });
  }, TIMEOUT);

  it('and the UNMUTATED manifest still reconciles through the same harness', () => {
    // Non-vacuity for the ten controls above: the harness itself does not cause failure.
    withManifest(() => {}, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.problems).toEqual([]);
    });
  }, TIMEOUT);
});
