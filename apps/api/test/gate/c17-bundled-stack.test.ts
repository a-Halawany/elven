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
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  verifyBundledComponents, loadBundledManifest, readmeRows, BUNDLED_PACKAGE,
  BUNDLED_MANIFEST_SHA256, BUNDLED_LEGAL_FILES, BUNDLED_PACKAGE_CONTRACT,
  BUNDLED_TERM_SPDX, BUNDLED_SOURCE_UPSTREAM, BUNDLED_AOM_PATENT_GRANT,
} from '../../../../scripts/gate/lib/bundled-components.mjs';
import { loadCanonicalTexts } from '../../../../scripts/gate/lib/licence-texts.mjs';
import { parseSpdxExpression } from '../../../../scripts/gate/lib/license-closure.mjs';

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
    expect(r.notes.join(' ')).toMatch(/bundled_components=\d+ readme_rows=\d+ versions_keys=\d+ source_offers=\d+ source_required=\d+/);
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
      expect(c.spdx_expression, `${row.name} must use the code-owned mapping`)
        .toBe(BUNDLED_TERM_SPDX[row.terms]);
      const parsed = parseSpdxExpression(c.spdx_expression);
      expect(parsed.ok, `${row.name}: ${parsed.error ?? ''}`).toBe(true);
      for (const id of parsed.ids) expect(texts.has(id), `${row.name} needs canonical ${id}`).toBe(true);
    }
    expect([...new Set(rows.map((row: any) => row.terms))].sort())
      .toEqual(Object.keys(BUNDLED_TERM_SPDX).sort());
  }, TIMEOUT);

  it('the source-offer set exactly equals the obligation-derived, code-owned set', () => {
    const m = loadBundledManifest(REPO);
    const verified = verifyBundledComponents(REPO, { texts });
    expect(verified.ok, verified.problems.join('\n')).toBe(true);
    const required = verified.obligations
      .filter((o: any) => o.requires_source_offer).map((o: any) => o.component).sort();
    expect(required).toEqual(Object.keys(BUNDLED_SOURCE_UPSTREAM).sort());
    expect(m.source_offers.map((o: any) => o.component).sort()).toEqual(required);
    for (const name of required) {
      const c = m.bundled_components.find((x: any) => x.name === name);
      const o = m.source_offers.find((x: any) => x.component === c.name);
      expect(o, `${c.name} (${c.spdx_expression}) needs a source offer`).toBeDefined();
      expect(o.upstream_source).toBe(BUNDLED_SOURCE_UPSTREAM[c.name]);
      expect(o.spdx_expression).toBe(c.spdx_expression);
      expect(o.version).toBe(c.version);
      expect(o.obtain.length).toBeGreaterThan(0);
      expect(o.obtain.join('\n')).toContain(BUNDLED_PACKAGE_CONTRACT.commit);
      expect(o.relinking.length).toBeGreaterThan(0);
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
    expect(m.aom_patent_grant.applies_to).toBe(BUNDLED_AOM_PATENT_GRANT.applies_to);
    // SPDX publishes no id for it, so the record says so rather than implying a vendored text.
    expect(m.aom_patent_grant.note).toMatch(/no identifier/i);
    expect(m.aom_patent_grant.url).toBe(BUNDLED_AOM_PATENT_GRANT.url);
    expect(m.aom_patent_grant.upstream_source).toBe(BUNDLED_AOM_PATENT_GRANT.upstream_source);
  });

  it('delivers every bundled component, source offer and licence text in THIRD_PARTY_NOTICES', () => {
    const out = mkdtempSync(join(tmpdir(), 'eye-c172-bundled-notices-'));
    try {
      const r = spawnSync(process.execPath,
        [join(REPO, 'scripts/gate/licence-obligations.mjs'), '--out', out, '--as-of', '2026-08-15'],
        { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 128 * 1024 * 1024 });
      expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
      const notices = readFileSync(join(out, 'THIRD_PARTY_NOTICES.md'), 'utf8');
      const m = loadBundledManifest(REPO);
      for (const c of m.bundled_components) {
        expect(notices, `missing bundled component ${c.name}`).toContain(`### ${c.name}`);
        expect(notices).toContain(c.declared_terms_upstream);
        const legalFiles = BUNDLED_LEGAL_FILES[c.name];
        expect(legalFiles.length, `${c.name} needs exact upstream legal bytes`).toBeGreaterThan(0);
        for (const legalFile of legalFiles) {
          const exactText = readFileSync(join(REPO, legalFile.path), 'utf8');
          expect(notices).toContain(`===== BEGIN UPSTREAM LEGAL FILE ${legalFile.path} (${legalFile.role}) =====`);
          expect(notices, `${c.name} ${legalFile.path} must be emitted in full`).toContain(exactText);
          expect(notices).toContain(legalFile.source_url);
        }
      }
      for (const o of m.source_offers) expect(notices).toContain(o.upstream_source);
      const ids = new Set<string>();
      for (const c of m.bundled_components) {
        const parsed = parseSpdxExpression(c.spdx_expression);
        expect(parsed.ok).toBe(true);
        for (const id of parsed.ids) ids.add(id);
      }
      for (const id of [...ids].sort()) {
        expect(notices).toContain(`canonical ${id} text`);
      }
      expect(notices).toContain(m.aom_patent_grant.url);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, TIMEOUT);

  /** A throwaway root whose tracked manifest can be corrupted safely. */
  const withManifest = (
    mutate: (m: any) => void,
    fn: (root: string) => void,
    mutateFiles: (root: string, m: any) => void = () => {},
  ) => {
    const root = mkdtempSync(join(tmpdir(), 'eye-c172-bundled-'));
    try {
      // Symlink the store so the SHIPPED package is the real one. Copy the legal closure so byte
      // mutations are isolated and cannot alter the repository's governed files.
      mkdirSync(join(root, 'scripts', 'gate'), { recursive: true });
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      require('node:fs').symlinkSync(join(REPO, 'node_modules', '.pnpm'), join(root, 'node_modules', '.pnpm'));
      cpSync(join(REPO, 'vendor', 'sharp-libvips'), join(root, 'vendor', 'sharp-libvips'), { recursive: true });
      const m = loadBundledManifest(REPO);
      const before = JSON.stringify(m);
      mutate(m);
      mutateFiles(root, m);
      const dest = join(root, 'scripts/gate/bundled-components.json');
      if (JSON.stringify(m) === before) cpSync(join(REPO, 'scripts/gate/bundled-components.json'), dest);
      else writeFileSync(dest, JSON.stringify(m, null, 2));
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

  it.each([
    ['a licence remap that leaves the shipped README term untouched', (m: any) => {
      m.bundled_components.find((x: any) => x.name === 'libvips').spdx_expression = 'MIT';
    }, /'libvips' maps "LGPLv3" to "MIT", the code-owned mapping requires "LGPL-3\.0-or-later"/],
    ['removing the complete shared-object inventory', (m: any) => { m.shipped_evidence.shared_libraries = []; },
      /shared-object inventory \[\] does not equal the package bytes/],
    ['declaring a shared object the package does not ship', (m: any) => {
      m.shipped_evidence.shared_libraries[0].path = 'lib/missing.so';
    }, /shared-object inventory \["lib\/missing\.so"\] does not equal the package bytes/],
    ['forging the package identity', (m: any) => { m.package.name = 'attacker'; m.package.purl = 'pkg:npm\/attacker@1'; },
      /manifest package\.name is "attacker", the code-owned contract requires/],
    ['forging an otherwise well-shaped build recipe', (m: any) => {
      m.build_recipe.repository = 'https://attacker.example/repo';
      m.build_recipe.commit_binding.commit = 'f'.repeat(40);
    }, /build_recipe\.repository is "https:\/\/attacker\.example\/repo".*code-owned contract requires/],
    ['deleting the AOM patent grant', (m: any) => { delete m.aom_patent_grant; },
      /aom_patent_grant\.applies_to is undefined.*code-owned contract requires/],
    ['replacing a copyleft source offer with attacker prose', (m: any) => {
      const o = m.source_offers.find((x: any) => x.component === 'libvips');
      o.upstream_source = 'https://attacker.example/source';
      o.obtain = ['trust me'];
      o.relinking = 'trust me';
    }, /source offer for 'libvips' names upstream "https:\/\/attacker\.example\/source"/],
  ])('rejects %s through both digest and semantic bindings', (_label, mutate, semanticPattern) => {
    withManifest(mutate, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.ok).toBe(false);
      // The whole-document digest is one independent root, but it must not be the only reason
      // this fails. Assert the legal/inventory contract too so the control cannot become vacuous.
      expect(r.problems.join('\n')).toMatch(new RegExp(BUNDLED_MANIFEST_SHA256));
      expect(r.problems.join('\n')).toMatch(semanticPattern);
    });
  }, TIMEOUT);

  it('rejects duplicate and surplus source offers in both directions', () => {
    withManifest((m) => {
      m.source_offers.push({ ...m.source_offers[0] });
      m.source_offers.push({
        component: 'cgif', version: '0.5.3', spdx_expression: 'MIT',
        obligation: 'invented', upstream_source: 'https://attacker.example/cgif',
        obtain: ['invented'], relinking: 'invented',
      });
    }, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/source offer for 'cairo' appears more than once/);
      expect(r.problems.join('\n')).toMatch(/source-offer set .*"cgif".* does not equal the obligation-derived set/);
    });
  }, TIMEOUT);

  it('rejects mutated upstream legal bytes even when manifest length and digest are rebound', () => {
    withManifest(() => {}, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/legal-file record .* bytes is .*code-owned value/);
      expect(r.problems.join('\n')).toMatch(/bundled legal file .*code-owned upstream file/);
    }, (root, m) => {
      const row = m.legal_files.find((candidate: any) => candidate.component === 'cgif');
      const file = join(root, row.path);
      const changed = Buffer.concat([readFileSync(file), Buffer.from('\nTAMPERED LEGAL BYTES\n')]);
      writeFileSync(file, changed);
      // Rebind every manifest-level fact so rejection cannot be attributed to a stale binding.
      row.bytes = changed.byteLength;
      row.sha256 = createHash('sha256').update(changed).digest('hex');
    });
  }, TIMEOUT);

  it.each([
    ['path', (m: any) => {
      m.legal_files.find((r: any) => r.component === 'cgif').path =
        'vendor/sharp-libvips/1.3.2/legal/cgif/ATTACKER-LICENSE';
    }, /surplus legal-file record .*ATTACKER-LICENSE.*not code-owned.*code-owned legal-file record .*cgif.*LICENSE.*missing/s],
    ['sha256', (m: any) => {
      m.legal_files.find((r: any) => r.component === 'cgif').sha256 = 'f'.repeat(64);
    }, /legal-file record .*cgif.* sha256 is .*the code-owned value/s],
    ['source URL', (m: any) => {
      m.legal_files.find((r: any) => r.component === 'cgif').source_url = 'https://attacker.example/LICENSE';
    }, /legal-file record .*cgif.* source_url is .*attacker\.example.*the code-owned value/s],
    ['omission', (m: any) => {
      m.legal_files = m.legal_files.filter((r: any) => r.component !== 'cgif');
    }, /manifest legal-file component set .*code-owned legal-file record .*cgif.*LICENSE.*missing/s],
    ['surplus record', (m: any) => {
      m.legal_files.push({
        component: 'cgif',
        path: 'vendor/sharp-libvips/1.3.2/legal/cgif/SURPLUS',
        bytes: 1,
        sha256: 'f'.repeat(64),
        source_url: 'https://attacker.example/SURPLUS',
        role: 'licence-and-attribution',
      });
    }, /surplus legal-file record .*SURPLUS.*not code-owned/],
  ])('rejects a rebound manifest legal-file %s semantically, not only by manifest digest', (_label, mutate, pattern) => {
    withManifest(mutate, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toContain(BUNDLED_MANIFEST_SHA256);
      expect(r.problems.join('\n')).toMatch(pattern);
    });
  }, TIMEOUT);

  it('rejects a missing canonical text through the obligation-derived coverage check', () => {
    const incomplete = new Map(texts);
    incomplete.delete('MPL-2.0');
    const r = verifyBundledComponents(REPO, { texts: incomplete });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/bundled component 'cairo' names MPL-2\.0, for which no canonical text is available/);
  }, TIMEOUT);

  it('and the UNMUTATED manifest still reconciles through the same harness', () => {
    // Non-vacuity: the throwaway harness itself does not cause failure.
    withManifest(() => {}, (root) => {
      const r = verifyBundledComponents(root, { texts });
      expect(r.problems).toEqual([]);
    });
  }, TIMEOUT);
});
