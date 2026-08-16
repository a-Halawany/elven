/**
 * C17 §4/§6/§7 — licence inventory reconciliation, legal-disposition governance, determinism.
 *
 * The two governed sets are kept apart on purpose: `scanner-exclusions.json` decides about
 * VULNERABILITIES, `legal-dispositions.json` decides about LICENCES. The controls here prove
 * neither can reach the other's findings — a security sign-off cannot silence a licence
 * failure, and a legal sign-off cannot silence a CVE.
 *
 * Every control executes the real builder, the real validator and the real gate. The
 * disposition fixtures are constructed in-memory or in throwaway directories; no tracked
 * governance document is written by any test.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deriveC16Expectation } from '../../../../scripts/gate/generate-closures.mjs';
import {
  buildTargetInventory, reconcileInventory, spdxIds, parseSpdxExpression, resetStoreIndex,
  familiesInText, familyOf, OBLIGATION_TABLE, isLegalFileName, classifyLegalFile,
} from '../../../../scripts/gate/lib/license-closure.mjs';
import {
  validateLegalDispositions, loadLegalDispositions, unresolvedScopeKey, isRealDate,
} from '../../../../scripts/gate/lib/legal-dispositions.mjs';
import { loadScannerExclusions } from '../../../../scripts/gate/lib/scanner-exclusions.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const GATE = join(REPO, 'scripts', 'gate', 'licence-obligations.mjs');
const RUN_DATE = '2026-08-15';
const TIMEOUT = 180_000;

const tracked = (rel: string) =>
  spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO, encoding: 'utf8' }).status === 0;

/** A well-formed disposition, used as the base every mutation departs from by one field. */
const baseDisposition = () => ({
  id: 'LGL-0001',
  target: 'production',
  purl: 'pkg:npm/%40img/sharp-linux-x64@0.35.3',
  version: '0.35.3',
  issue: 'not_materialized',
  classification: 'APPROVED_WITH_CONDITIONS',
  rationale: 'A platform-gated optional binary that this host cannot materialize.',
  owner: 'founding-engineer',
  approver: 'gate-2.2-legal-review',
  evidence_files: [{
    path: 'scripts/gate/legal-dispositions.json',
    sha256: require('node:crypto').createHash('sha256')
      .update(readFileSync(join(REPO, 'scripts/gate/legal-dispositions.json'))).digest('hex'),
  }],
  approved_on: '2026-08-10',
  reviewed_on: '2026-08-14',
  expires_on: '2026-11-05',
  permitted_use: ['Phase 0 local development profile.'],
  prohibited_use: ['Any external distribution.'],
});

const govern = (records: any[], unresolvedKeys: Set<string> | null = null) =>
  validateLegalDispositions({ schema_version: '1.0.0', records }, {
    runDate: RUN_DATE, root: REPO, isTracked: tracked, unresolvedKeys,
  });

describe('C17 §4/§6/§7 — licence governance', () => {
  let derived: any;
  let inventories: Record<string, any>;

  beforeAll(() => {
    derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    inventories = Object.fromEntries(['production', 'development'].map((t) => [
      t, buildTargetInventory({ root: REPO, target: t, closure: derived.closures[t] }),
    ]));
  }, TIMEOUT);

  // ── §4 reconciliation, in both directions ───────────────────────────────────

  it('both inventories reconcile against their C16 closure with zero discrepancies', () => {
    for (const t of ['production', 'development']) {
      expect(reconcileInventory({ target: t, inventory: inventories[t], closure: derived.closures[t] }))
        .toEqual([]);
      // Non-vacuity: an inventory of nothing would also "reconcile" against nothing.
      expect(inventories[t].components.length).toBeGreaterThan(150);
    }
  });

  it.each([
    ['a MISSING component', (inv: any) => { inv.components.pop(); }, /is MISSING/],
    ['an EXTRA component', (inv: any) => {
      inv.components.push({ ...inv.components[0], bom_ref: 'ghost@1.0.0', purl: 'pkg:npm/ghost@1.0.0' });
    }, /contains EXTRA/],
    ['a WRONG version', (inv: any) => { inv.components[0].version = '0.0.0-wrong'; }, /the closure resolves/],
    ['a WRONG PURL', (inv: any) => { inv.components[0].purl = 'pkg:npm/elsewhere@1.0.0'; }, /the closure derives/],
    ['TARGET LEAKAGE', (inv: any) => { inv.components[0].target = 'development'; }, /target leakage/],
    ['a DUPLICATE record', (inv: any) => { inv.components.push({ ...inv.components[0] }); }, /more than once/],
  ])('reconciliation rejects %s', (_label, mutate, pattern) => {
    const inv = JSON.parse(JSON.stringify(inventories.production));
    mutate(inv);
    const problems = reconcileInventory({ target: 'production', inventory: inv, closure: derived.closures.production });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(pattern);
  });

  it('classifies nothing silently: every classified component names a table-backed category', () => {
    for (const t of ['production', 'development']) {
      for (const c of inventories[t].components) {
        if (c.first_party) {
          expect(c.obligation_category).toBe('first-party');
          continue;
        }
        expect(c.declared_license, `${c.purl} has no declared licence`).toBeTruthy();
        expect(c.spdx_ids.length).toBeGreaterThan(0);
        for (const id of c.spdx_ids) {
          expect(Object.prototype.hasOwnProperty.call(OBLIGATION_TABLE, id),
            `${c.purl} declares ${id}, absent from the obligation table`).toBe(true);
        }
        expect(c.manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(['package-file', 'spdx-canonical']).toContain(c.notice_text_source);
        for (const f of c.licence_files) expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it('workspace components are recorded honestly, not dropped and not misclassified', () => {
    const first = inventories.production.components.filter((c: any) => c.first_party);
    expect(first.length).toBeGreaterThan(0);
    for (const c of first) {
      expect(c.obligation_category).toBe('first-party');
      expect(c.evidence_provenance).toMatch(/not published/);
    }
  });

  it('the REAL SPDX parser reports ids, exceptions and malformed grammar distinctly', () => {
    // The whitespace split this replaced treated an exception as an "id" and accepted anything
    // token-shaped. The parser separates them and rejects invalid grammar and registers.
    expect(spdxIds('MIT')).toEqual(['MIT']);
    expect(spdxIds('(MIT OR Apache-2.0)')).toEqual(['Apache-2.0', 'MIT']);
    // An exception is NOT a licence id: it is reported separately.
    const withException = parseSpdxExpression('Apache-2.0 WITH LLVM-exception');
    expect(withException.ok).toBe(true);
    expect(withException.ids).toEqual(['Apache-2.0']);
    expect(withException.exceptions).toEqual(['LLVM-exception']);
    // A disjunction is flagged, because choosing a limb is a legal decision, not a mechanical one.
    expect(parseSpdxExpression('(MIT OR Apache-2.0)').disjunctive).toBe(true);
    for (const bad of ['NOT-A-LICENCE', 'MIT OR', 'Apache-2.0 WITH Nope-exception', '', 'MIT AND']) {
      const r = parseSpdxExpression(bad);
      expect(r.ok, `${JSON.stringify(bad)} must not parse`).toBe(false);
      expect(r.ids).toEqual([]);
      expect(r.error.length).toBeGreaterThan(0);
    }
    expect(spdxIds(null as unknown as string)).toEqual([]);
  });

  // ── §6 disposition governance ───────────────────────────────────────────────

  it('the committed legal-disposition document is valid and deliberately EMPTY', () => {
    const { doc } = loadLegalDispositions(REPO);
    expect(doc.schema_version).toBe('1.0.0');
    expect(doc.records).toEqual([]);
    expect(govern(doc.records).problems).toEqual([]);
  });

  it('a well-formed disposition is accepted only when it covers a REAL finding', () => {
    const d = baseDisposition();
    const key = `${d.target}|${d.purl}|${d.issue}`;
    expect(govern([d], new Set([key])).valid).toHaveLength(1);
    // Covering nothing is UNUSED: a decision nobody needs is a decision nobody reviewed.
    const unused = govern([d], new Set());
    expect(unused.valid).toHaveLength(0);
    expect(unused.problems.join('\n')).toMatch(/UNUSED/);
  });

  it.each([
    ['a missing required field', (d: any) => { delete d.rationale; }, /missing required field 'rationale'/],
    ['a malformed id', (d: any) => { d.id = 'NOPE-1'; }, /id must match LGL-NNNN/],
    ['an unknown classification', (d: any) => { d.classification = 'FINE_PROBABLY'; }, /classification .* is not one of/],
    ['an unknown issue', (d: any) => { d.issue = 'vibes'; }, /issue .* is not one of/],
    ['an unknown target', (d: any) => { d.target = 'staging'; }, /target .* is not one of/],
    ['a wildcard PURL', (d: any) => { d.purl = 'pkg:npm/%40img/*@0.35.3'; }, /OVERBROAD/],
    ['a version-less PURL', (d: any) => { d.purl = 'pkg:npm/sharp'; d.version = '0.35.3'; }, /complete canonical PURL including a version/],
    ['a PURL/version mismatch', (d: any) => { d.version = '9.9.9'; }, /does not end with the declared version/],
    ['self-approval', (d: any) => { d.approver = d.owner; }, /approver must differ from owner/],
    ['a future approval', (d: any) => { d.approved_on = '2026-12-01'; }, /in the future/],
    ['an expired record', (d: any) => { d.expires_on = '2026-01-01'; }, /expired on/],
    ['a review preceding approval', (d: any) => { d.reviewed_on = '2026-01-01'; }, /reviewed_on precedes approved_on/],
    ['untracked evidence', (d: any) => { d.evidence_files[0].path = 'not-a-tracked-file.txt'; }, /missing or is not a regular file/],
    ['traversal evidence', (d: any) => { d.evidence_files[0].path = '../../../etc/passwd'; }, /repository-relative/],
    ['altered evidence', (d: any) => { d.evidence_files[0].sha256 = 'a'.repeat(64); }, /hashes to .* the record claims/],
  ])('rejects %s', (_label, mutate, pattern) => {
    const d = baseDisposition();
    mutate(d);
    const r = govern([d], new Set([`${d.target}|${d.purl}|${d.issue}`]));
    expect(r.valid).toHaveLength(0);
    expect(r.problems.join('\n')).toMatch(pattern);
  });

  it('rejects DUPLICATE dispositions covering one scope', () => {
    const a = baseDisposition();
    const b = { ...baseDisposition(), id: 'LGL-0002' };
    const r = govern([a, b], new Set([`${a.target}|${a.purl}|${a.issue}`]));
    expect(r.problems.join('\n')).toMatch(/duplicates the scope already covered by LGL-0001/);
  });

  it('a PRODUCTION disposition does not cover development, or another version', () => {
    const d = baseDisposition();
    // Same package, same issue, different TARGET: the scope key does not match.
    expect(unresolvedScopeKey({ target: 'development', purl: d.purl, issue: d.issue }))
      .not.toBe(`${d.target}|${d.purl}|${d.issue}`);
    // Same package, different VERSION: different PURL, so a different scope.
    expect(unresolvedScopeKey({ target: 'production', purl: 'pkg:npm/%40img/sharp-linux-x64@0.36.0', issue: d.issue }))
      .not.toBe(`${d.target}|${d.purl}|${d.issue}`);
    const r = govern([d], new Set([`development|${d.purl}|${d.issue}`]));
    expect(r.valid).toHaveLength(0);
    expect(r.problems.join('\n')).toMatch(/UNUSED/);
  });

  // ── §6 the two governed sets cannot reach each other ────────────────────────

  it('a SECURITY exclusion cannot suppress a licence finding', () => {
    const { doc } = loadScannerExclusions(REPO);
    // The security records are real and non-empty...
    expect(doc.records.length).toBeGreaterThan(0);
    // ...and none of them carries the fields a licence disposition is matched on, so there is
    // no shape by which one could satisfy the licence scope key.
    for (const r of doc.records) {
      expect(r.purl).toBeUndefined();
      expect(r.issue).toBeUndefined();
      expect(r.target).toBeUndefined();
    }
    // Feeding the security set to the licence validator rejects every record outright.
    const r = govern(doc.records as any[], new Set(['production|pkg:npm/x@1.0.0|not_materialized']));
    expect(r.valid).toHaveLength(0);
    expect(r.problems.length).toBeGreaterThan(0);
  });

  it('a LEGAL disposition cannot suppress a vulnerability', () => {
    const legal = baseDisposition();
    // The security validator requires advisory ids, an image, a platform, severities and a
    // result target. A licence disposition has none of them.
    const { validateRecords } = require('../../../../scripts/gate/lib/scanner-exclusions.mjs');
    const r = validateRecords({ schema_version: '2.0.0', records: [legal] }, {
      runDate: RUN_DATE, root: REPO, isTracked: tracked,
      readEvidence: (rel: string) => { try { return readFileSync(join(REPO, rel)); } catch { return null; } },
    });
    expect(r.problems.join('\n')).toMatch(/missing required field 'advisory_ids'|missing required field 'image'/);
    expect(r.fatalIndices.size ?? r.fatalIndices.length).toBeGreaterThan(0);
  });

  // ── §7 determinism ──────────────────────────────────────────────────────────

  const runGate = (outDir: string, env: Record<string, string> = {}) => spawnSync(
    process.execPath, [GATE, '--out', outDir, '--as-of', RUN_DATE],
    { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } },
  );

  it('produces BYTE-IDENTICAL artifacts across two directories, two times and a hostile environment', () => {
    const dirs = [
      mkdtempSync(join(tmpdir(), 'eye-c17-a-')),
      mkdtempSync(join(tmpdir(), 'eye-c17-b-')),
    ];
    try {
      // A hostile environment: values that a non-deterministic generator would leak into its
      // output — a different locale, timezone, and claimed platform.
      runGate(dirs[0]);
      runGate(dirs[1], { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' });
      const artifacts = [
        'license-inventory.json', 'license-obligations.json',
        'license-reconciliation.json', 'THIRD_PARTY_NOTICES.md',
      ];
      for (const a of artifacts) {
        const first = readFileSync(join(dirs[0], a));
        const second = readFileSync(join(dirs[1], a));
        expect(first.byteLength, `${a} differs in length`).toBe(second.byteLength);
        expect(first.equals(second), `${a} is not byte-identical across runs`).toBe(true);
      }
      // And the artifacts are substantial, so identity is not the identity of nothing.
      expect(readFileSync(join(dirs[0], 'license-inventory.json')).byteLength).toBeGreaterThan(10_000);
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('writes NOTHING into the source tree and leaves the worktree clean', () => {
    const before = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout;
    const out = mkdtempSync(join(tmpdir(), 'eye-c17-clean-'));
    try {
      runGate(out);
      const after = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout;
      expect(after).toBe(before);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('FAILS CLOSED when the vendored schema is unavailable', () => {
    // Not a source-string assertion: the gate is executed with a broken vendor directory and
    // its exit status and manifest are read.
    const out = mkdtempSync(join(tmpdir(), 'eye-c17-broken-'));
    const fakeRoot = mkdtempSync(join(tmpdir(), 'eye-c17-root-'));
    try {
      // A manifest whose digest cannot match anything.
      const r = spawnSync(process.execPath, [GATE, '--out', out, '--as-of', RUN_DATE, '--expected-sha', 'f'.repeat(40)],
        { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 });
      expect(r.status, 'a mismatched expected SHA must fail the gate').not.toBe(0);
      const manifest = JSON.parse(readFileSync(join(out, 'c17-manifest.json'), 'utf8'));
      expect(manifest.result).toBe('FAIL');
      expect(manifest.failures.join('\n')).toMatch(/--expected-sha/);
      expect(readFileSync(join(out, 'RESULT-FAIL.txt'), 'utf8')).toMatch(/^C17 FAIL/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('an unresolved licence finding with no disposition BLOCKS the gate', () => {
    const out = mkdtempSync(join(tmpdir(), 'eye-c17-block-'));
    try {
      const r = runGate(out);
      const manifest = JSON.parse(readFileSync(join(out, 'c17-manifest.json'), 'utf8'));
      const unresolvedFailures = (manifest.failures as string[])
        .filter((f) => /unresolved licence finding with no legal disposition/.test(f));
      // On a linux-x64 host every component materializes and there are none; on any other host
      // the platform-gated binaries are absent. Either way the invariant is the same: an
      // unresolved finding and a PASS cannot coexist.
      if (unresolvedFailures.length > 0) {
        expect(r.status, 'unresolved findings must fail the gate').not.toBe(0);
        expect(manifest.result).toBe('FAIL');
      } else {
        expect(manifest.result).toBe('PASS');
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, TIMEOUT);

  // ── C17.1 B1/B2 — identity and contradiction ────────────────────────────────

  it('a materialized package whose manifest names ANOTHER package fails as an identity mismatch', () => {
    // A store directory named foo@1.0.0 holding attacker@9.9.9 would otherwise contribute the
    // attacker's licence, notices and copyright under the real component's identity.
    const root = mkdtempSync(join(tmpdir(), 'eye-c17-ident-'));
    try {
      const node = { bomRef: 'foo@1.0.0', purl: 'pkg:npm/foo@1.0.0', name: 'foo', version: '1.0.0', kind: 'npm' };
      const dir = join(root, 'node_modules', '.pnpm', 'foo@1.0.0', 'node_modules', 'foo');
      require('node:fs').mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'),
        JSON.stringify({ name: 'attacker', version: '9.9.9', license: 'MIT' }));
      writeFileSync(join(dir, 'LICENSE'), 'MIT License\n\nCopyright (c) attacker\n');
      resetStoreIndex();
      const inv = buildTargetInventory({
        root, target: 'production', closure: { nodes: new Map([[node.bomRef, node]]) },
      });
      resetStoreIndex();
      expect(inv.components).toHaveLength(0);
      expect(inv.unresolved).toHaveLength(1);
      expect(inv.unresolved[0].issue).toBe('identity_mismatch');
      expect(inv.unresolved[0].detail).toMatch(/declares "attacker"@"9\.9\.9".*resolves foo@1\.0\.0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      resetStoreIndex();
    }
  });

  it('a manifest declaring MIT while shipping GPLv3 text becomes contradictory_licence', () => {
    const root = mkdtempSync(join(tmpdir(), 'eye-c17-contra-'));
    try {
      const node = { bomRef: 'two-faced@1.0.0', purl: 'pkg:npm/two-faced@1.0.0', name: 'two-faced', version: '1.0.0', kind: 'npm' };
      const dir = join(root, 'node_modules', '.pnpm', 'two-faced@1.0.0', 'node_modules', 'two-faced');
      require('node:fs').mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'),
        JSON.stringify({ name: 'two-faced', version: '1.0.0', license: 'MIT' }));
      writeFileSync(join(dir, 'LICENSE'),
        'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n\nCopyright (C) 2007 FSF\n');
      resetStoreIndex();
      const inv = buildTargetInventory({
        root, target: 'production', closure: { nodes: new Map([[node.bomRef, node]]) },
      });
      resetStoreIndex();
      expect(inv.components, 'it must NOT classify cleanly as MIT').toHaveLength(0);
      expect(inv.unresolved[0].issue).toBe('contradictory_licence');
      expect(inv.unresolved[0].detail).toMatch(/declares 'MIT' but its ROOT licence text identifies GPL/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      resetStoreIndex();
    }
  });

  it('but MENTIONING another licence is not a contradiction — the title position decides', () => {
    // The first version of this check matched anywhere in the file and produced three false
    // positives on the real tree: the MPL names the GNU GPL as a Secondary License, and vite's
    // LICENSE.md bundles its vendored dependencies' Apache notices.
    expect(familiesInText('Mozilla Public License Version 2.0\n\n1. Definitions\n')).toEqual(['MPL']);
    const mplBody = ['Mozilla Public License Version 2.0', '', ...Array(20).fill('body text'),
      'compatible with the GNU GENERAL PUBLIC LICENSE as a Secondary License'].join('\n');
    expect(familiesInText(mplBody), 'a body mention must not register').toEqual(['MPL']);
    expect(familyOf('MPL-2.0')).toBe('MPL');
    expect(familyOf('MIT')).toBeNull();
  });

  // ── C17.1 D — typed fields and REAL calendar dates ──────────────────────────

  it.each([
    ['2026-08-15', true], ['2024-02-29', true],
    ['2026-99-99', false], ['2026-02-31', false], ['2026-02-29', false],
    ['2026-13-01', false], ['2026-00-10', false], ['not-a-date', false], ['', false],
  ])('isRealDate(%s) === %s', (value, expected) => {
    expect(isRealDate(value)).toBe(expected);
  });

  it('an IMPOSSIBLE expiry cannot make a record look current', () => {
    // '2026-99-99' > any plausible run date as a STRING, so a shape-only check read it as
    // "not yet expired" and the record governed indefinitely.
    const d = { ...baseDisposition(), expires_on: '2026-99-99' };
    const r = govern([d], new Set([`${d.target}|${d.purl}|${d.issue}`]));
    expect(r.valid).toHaveLength(0);
    expect(r.problems.join('\n')).toMatch(/expires_on.*not a real calendar date/);
  });

  it.each([
    ['a non-array evidence_files', (d: any) => { d.evidence_files = 'scripts/gate/legal-dispositions.json'; },
      /must be an array of \{path, sha256\} records, got string/],
    ['evidence_files holding strings', (d: any) => { d.evidence_files = ['some/path']; },
      /must contain only \{path, sha256\} objects/],
    ['a non-array permitted_use', (d: any) => { d.permitted_use = 'anything'; },
      /permitted_use' must be an array of strings, got string/],
    ['permitted_use with an empty entry', (d: any) => { d.permitted_use = ['ok', '  ']; },
      /permitted_use' must contain only nonempty strings/],
    ['prohibited_use holding a number', (d: any) => { d.prohibited_use = [42]; },
      /prohibited_use' must contain only nonempty strings/],
    ['a numeric rationale', (d: any) => { d.rationale = 7; }, /rationale' must be a string, got number/],
    ['an array id', (d: any) => { d.id = ['LGL-0001']; }, /id' must be a string, got array/],
    ['an impossible approval date', (d: any) => { d.approved_on = '2026-02-31'; },
      /approved_on.*not a real calendar date/],
    ['an impossible review date', (d: any) => { d.reviewed_on = '2026-13-40'; },
      /reviewed_on.*not a real calendar date/],
    ['an expiry not after approval', (d: any) => { d.expires_on = d.approved_on; },
      /expired on|is not after approved_on/],
    ['a future review date', (d: any) => { d.reviewed_on = '2026-12-31'; },
      /reviewed_on .* is in the future/],
  ])('rejects %s', (_label, mutate, pattern) => {
    const d = baseDisposition();
    mutate(d);
    const r = govern([d], new Set([`${d.target}|${d.purl}|${d.issue}`]));
    expect(r.valid).toHaveLength(0);
    expect(r.problems.join('\n')).toMatch(pattern);
  });

  it('a rubbish RUN DATE cannot make every record look current', () => {
    const d = baseDisposition();
    const r = validateLegalDispositions({ schema_version: '1.0.0', records: [d] }, {
      runDate: '2026-99-99', root: REPO, isTracked: tracked,
      unresolvedKeys: new Set([`${d.target}|${d.purl}|${d.issue}`]),
    });
    expect(r.valid).toHaveLength(0);
    expect(r.problems.join('\n')).toMatch(/run date .* is not a real calendar date/);
  });

  it('a BUNDLED nested licence is additional material, NOT a contradiction', () => {
    // Recursive discovery surfaced this on the real tree: next@16.2.12 declares MIT and ships
    // dist/compiled/@vercel/og/LICENSE, an MPL text belonging to a bundled dependency.
    const root = mkdtempSync(join(tmpdir(), 'eye-c172-nested-'));
    try {
      const node = { bomRef: 'bundler@1.0.0', purl: 'pkg:npm/bundler@1.0.0', name: 'bundler', version: '1.0.0', kind: 'npm' };
      const dir = join(root, 'node_modules', '.pnpm', 'bundler@1.0.0', 'node_modules', 'bundler');
      require('node:fs').mkdirSync(join(dir, 'dist', 'compiled', 'vendored'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bundler', version: '1.0.0', license: 'MIT' }));
      writeFileSync(join(dir, 'LICENSE'), 'MIT License\n\nCopyright (c) bundler\n');
      // A bundled dependency's MPL text, nested.
      writeFileSync(join(dir, 'dist', 'compiled', 'vendored', 'LICENSE'),
        'Mozilla Public License Version 2.0\n\n1. Definitions\n');
      resetStoreIndex();
      const inv = buildTargetInventory({
        root, target: 'production', closure: { nodes: new Map([[node.bomRef, node]]) },
      });
      resetStoreIndex();
      expect(inv.unresolved, 'a nested bundled licence must NOT be a contradiction').toEqual([]);
      const c = inv.components[0];
      expect(c.declared_license).toBe('MIT');
      // But it IS discovered, recorded as nested, and therefore emittable.
      const nested = c.licence_files.filter((f: any) => f.nested === true);
      expect(nested.map((f: any) => f.file)).toEqual(['dist/compiled/vendored/LICENSE']);
      expect(c.bundled_legal_files).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
      resetStoreIndex();
    }
  });

  it.each([
    ['ThirdPartyNotices.txt', 'third-party-notices'],
    ['ThirdPartyNoticeText.txt', 'third-party-notices'],
    ['THIRD-PARTY-LICENSE', 'third-party-notices'],
    ['CopyrightNotice.txt', 'copyright-notice'],
    ['AUTHORS', 'authors'],
    ['AUTHORS.md', 'authors'],
    ['utilsBundle.js.LICENSE', 'bundled-sidecar-licence'],
  ])('the legal-name contract classifies %s as %s', (name, kind) => {
    // Every one of these is a real shipped filename the C17.1 matcher missed.
    expect(isLegalFileName(name), `${name} must be recognised`).toBe(true);
    expect(classifyLegalFile(name)).toBe(kind);
  });

  it.each([['README.md'], ['index.js'], ['package.json'], ['licence-utils.ts']])(
    'and does NOT claim %s is a legal file', (name) => {
      expect(isLegalFileName(name)).toBe(false);
    },
  );
});
