/**
 * C16-R3.4.5 §7 — non-vacuity controls for the receipt CONTRACT.
 *
 * R3.4.4 validated every package and parsed every PURL, but it compared identities after
 * reducing them to `name@version`, kept three partial allowlists that disagreed about which
 * (Class, Type) pairs meant anything, required only that the expected filesystem result be
 * PRESENT, and read the audit document field by field rather than as a closed shape. Each of
 * those left a specific bypass, and each bypass is reproduced below.
 *
 * Every control mutates a COMPLETE, PASSING package in exactly ONE way, rebinding the changed
 * stream and the producing step's own claims about it, and runs BOTH verifiers: the corrected
 * one, and `fixtures/assert-final-manifests.r344-frozen.mjs`, a byte copy of R3.4.4 with only
 * its CLI guard removed and its imports repointed at the live tracked contracts.
 *
 * The package is real: its image results are captured scanner output and its filesystem package
 * set is the whole lockfile universe derived from `pnpm-lock.yaml`.
 *
 * A control only counts if the frozen verifier ACCEPTS the mutation.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertFinalManifests } from '../../../../scripts/gate/assert-final-manifests.mjs';
import { assertFinalManifests as assertR344Frozen } from './fixtures/assert-final-manifests.r344-frozen.mjs';
import { buildPassingR34Evidence, editManifest, sha256 } from './helpers/evidence-fixture-r34';

const REPO = join(__dirname, '..', '..', '..', '..');

describe('C16-R3.4.5 receipt contract', () => {
  let root: string;
  let built: ReturnType<typeof buildPassingR34Evidence>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r345-'));
    built = buildPassingR34Evidence(root, REPO);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const c15 = () => built.c15Dir;
  const check = () => assertFinalManifests({
    c15Dir: c15(), c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
  }) as string[];
  const frozen = () => {
    try {
      return assertR344Frozen({
        c15Dir: c15(), c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
      }) as string[];
    } catch (e) {
      return [`THREW: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`];
    }
  };

  /** Rewrite one bound artifact and repair EVERY claim about it. */
  const replace = (rel: string, text: string) => {
    writeFileSync(join(c15(), rel), text);
    const bytes = readFileSync(join(c15(), rel));
    const digest = sha256(bytes);
    editManifest(c15(), 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === rel);
      if (a !== undefined) { a.bytes = bytes.length; a.sha256 = digest; }
      for (const s of [...m.steps, ...m.trivy_cache_acquisition.steps]) {
        for (const stream of ['stdout', 'stderr']) {
          if (s[`${stream}_file`] === rel) {
            s[`${stream}_bytes`] = bytes.length;
            s[`${stream}_sha256`] = digest;
          }
        }
      }
    });
  };

  const editRaw = (rel: string, mutate: (doc: any) => void) => {
    const doc = JSON.parse(readFileSync(join(c15(), rel), 'utf8'));
    mutate(doc);
    replace(rel, `${JSON.stringify(doc, null, 2)}\n`);
  };

  const closesFalsePass = (expected: RegExp) => {
    const problems = check();
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.slice(0, 10).join('\n') || '(none)'}`).toBe(true);
    const stale = frozen();
    expect(stale,
      `R3.4.4 must ACCEPT this mutation for it to be a reproduced bypass, but reported:\n${stale.join('\n')}`)
      .toEqual([]);
  };

  it('the untouched package passes BOTH verifiers', () => {
    expect(check()).toEqual([]);
    expect(frozen()).toEqual([]);
  });

  // ── §2: identity is the COMPLETE canonical PURL ──────────────────────────────

  it('rejects a filesystem PURL carrying a qualifier the source PURL does not', () => {
    // `?repository_url=` redirects where the package came from. R3.4.4 discarded qualifiers
    // before comparing against source, so this collapsed to the same `name@version` and matched.
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      const p = d.Results[0].Packages[0];
      p.Identifier.PURL = `${p.Identifier.PURL}?repository_url=https%3A%2F%2Fattacker.example`;
    });
    closesFalsePass(/absent from the \d+-package universe derived from pnpm-lock\.yaml/);
  });

  it('rejects an image package whose PURL claims another architecture', () => {
    // Same name and version, different `arch` qualifier: a different artifact entirely, and
    // indistinguishable from the genuine one once identity is reduced to name@version.
    editRaw('trivy-image-0.stdout.txt', (d) => {
      const r = d.Results.find((x: any) => x.Class === 'os-pkgs');
      const v = r.Vulnerabilities[0];
      const p = r.Packages.find((q: any) => q.Name === v.PkgName);
      p.Identifier.PURL = p.Identifier.PURL.replace('arch=x86_64', 'arch=aarch64');
    });
    closesFalsePass(/reports a vulnerability in .*which this result does not list among its packages/);
  });

  // ── §3: one total (Class, Type) contract ─────────────────────────────────────

  it('rejects a result class/type combination the gate has no contract for', () => {
    // `lang-pkgs`/`python-pkg` was in R3.4.4's image class allowlist but in neither its
    // ecosystem nor its analyzer table, so its packages were validated against nothing at all.
    editRaw('trivy-image-0.stdout.txt', (d) => {
      d.Results.push({
        Target: 'usr/lib/python3/site-packages',
        Class: 'lang-pkgs',
        Type: 'python-pkg',
        Packages: [{
          Name: 'anything', Version: '0.0.0', AnalyzedBy: 'python-pkg',
          Identifier: { PURL: 'pkg:pypi/anything@0.0.0' },
        }],
      });
    });
    closesFalsePass(/no result contract for \("lang-pkgs", "python-pkg"\)/);
  });

  it('rejects an image package that states no analyzer at all', () => {
    editRaw('trivy-image-0.stdout.txt', (d) => {
      for (const p of d.Results.find((x: any) => x.Class === 'os-pkgs').Packages) delete p.AnalyzedBy;
    });
    closesFalsePass(/AnalyzedBy is undefined, expected "apk"/);
  });

  // ── §4: the filesystem result SET, exactly ───────────────────────────────────

  it('rejects an extra filesystem result riding alongside the genuine one', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results.push({
        Target: 'vendor/other-lock.yaml',
        Class: 'lang-pkgs',
        Type: 'pnpm',
        Packages: [...d.Results[0].Packages],
      });
    });
    // The forger adds the matching table row as well, so the JSON/table multiset still agrees
    // and ONLY the source-derived result-set invariant can catch the extra result.
    const table = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8');
    const row = table.split('\n').find((l) => l.includes('pnpm-lock.yaml') && l.includes('\u2502')) as string;
    replace('trivy-fs.stdout.txt', table.replace(row, `${row}\n${row.replace('pnpm-lock.yaml', 'vendor/other-lock.yaml')}`));
    closesFalsePass(/but the source contract derives exactly/);
  });

  it('rejects a nonempty finding array under a key the verifier does not know', () => {
    // R3.4.4 enumerated Vulnerabilities, Misconfigurations and Secrets. Anything reported under
    // a fourth key was simply not looked at on the filesystem path.
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results[0].Licenses = [{ Name: 'GPL-3.0', Severity: 'HIGH', Category: 'restricted' }];
    });
    closesFalsePass(/carries 1 entr\(ies\) under "Licenses"/);
  });

  // ── §5: exact image result contracts ─────────────────────────────────────────

  it('rejects a SECOND os-pkgs result smuggled in beside the genuine one', () => {
    // R3.4.4 asked only that SOME os-pkgs result be tied to the derived reference, so a second
    // one describing another image passed unexamined.
    editRaw('trivy-image-1.stdout.txt', (d) => {
      const genuine = d.Results.find((x: any) => x.Class === 'os-pkgs');
      d.Results.push({ ...genuine, Target: 'somewhere-else@sha256:0000 (alpine 3.23.5)' });
    });
    closesFalsePass(/has 2 'os-pkgs' result\(s\)/);
  });

  // ── §6: the audit document is a closed shape ─────────────────────────────────

  it('rejects an audit carrying an unexpected top-level key', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.vulnerabilities = { 'GHSA-xxxx': { severity: 'high' } }; });
    closesFalsePass(/top-level keys are .*expected exactly/);
  });

  it('rejects an audit carrying a severity counter outside the five', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.metadata.vulnerabilities.severe = 7; });
    closesFalsePass(/metadata\.vulnerabilities keys are .*expected exactly/);
  });

  it('rejects an audit carrying an unexpected metadata key', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.metadata.ignoredDependencies = 99; });
    closesFalsePass(/metadata keys are .*expected exactly/);
  });

  it('rejects dependency categories that do not account for the tree', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => {
      d.metadata.dependencies = 1;
      d.metadata.devDependencies = 1;
      d.metadata.optionalDependencies = 1;
    });
    closesFalsePass(/categories cover 3 package\(s\) but claim a total of \d+/);
  });
});
