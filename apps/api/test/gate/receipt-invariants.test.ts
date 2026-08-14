/**
 * C16-R3.4.4 §E — non-vacuity controls for receipt INVARIANTS.
 *
 * R3.4.3 read receipts, but read them shallowly. It sampled the first five packages, so
 * truncating a real 229-package result to five passed. It accepted any string as a PURL, so an
 * identity could say anything. It required packages only on `os-pkgs`, matched the OS target
 * with `startsWith`, never opened a single finding, built its table comparison from a Map keyed
 * by target — so a forged first row was silently overwritten by the genuine one — and never
 * read the audit's own counters or dependency totals.
 *
 * Every control below mutates a COMPLETE, PASSING package in exactly ONE way, rebinding every
 * changed stream and the producing step's own claims about it, and runs BOTH verifiers: the
 * corrected one, and `fixtures/assert-final-manifests.r343-frozen.mjs`, a byte copy of R3.4.3
 * with only its CLI guard removed and its imports repointed at the live tracked contracts.
 *
 * The package the controls mutate is real, not invented: its image results are the captured
 * scanner output from the delivered C15 evidence, and its filesystem package set is the whole
 * lockfile universe derived from pnpm-lock.yaml. Mutating fabricated data would prove nothing
 * about what the verifier does to a genuine receipt.
 *
 * A control only counts if the frozen verifier ACCEPTS the mutation.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertFinalManifests } from '../../../../scripts/gate/assert-final-manifests.mjs';
import { assertFinalManifests as assertR343Frozen } from './fixtures/assert-final-manifests.r343-frozen.mjs';
import { buildPassingR34Evidence, editManifest, sha256 } from './helpers/evidence-fixture-r34';

const REPO = join(__dirname, '..', '..', '..', '..');

describe('C16-R3.4.4 receipt invariants', () => {
  let root: string;
  let built: ReturnType<typeof buildPassingR34Evidence>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r344-'));
    built = buildPassingR34Evidence(root, REPO);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const c15 = () => built.c15Dir;

  const check = () => assertFinalManifests({
    c15Dir: c15(), c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
  }) as string[];

  const frozen = () => {
    try {
      return assertR343Frozen({
        c15Dir: c15(), c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
      }) as string[];
    } catch (e) {
      return [`THREW: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`];
    }
  };

  /**
   * Rewrite one bound artifact and repair EVERY claim about it — the artifact binding and the
   * producing step's own byte count and digest. A forger who rewrites a receipt rewrites both,
   * so a control that leaves one stale would be caught by digest arithmetic and would prove
   * nothing about semantics.
   */
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

  /** R3.4.4 rejects for the stated reason; R3.4.3 accepted the identical package. */
  const closesFalsePass = (expected: RegExp) => {
    const problems = check();
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.slice(0, 12).join('\n') || '(none)'}`).toBe(true);
    const stale = frozen();
    expect(stale,
      `R3.4.3 must ACCEPT this mutation for it to be a reproduced false pass, but reported:\n${stale.join('\n')}`)
      .toEqual([]);
  };

  it('the untouched package passes BOTH verifiers, on REAL complete data', () => {
    expect(check()).toEqual([]);
    expect(frozen()).toEqual([]);
    // Guard against a fixture that quietly shrinks: these controls are only meaningful because
    // the data is genuinely large. The counts are read, not asserted against a literal.
    const fs = JSON.parse(readFileSync(join(c15(), 'trivy-fs-json.stdout.txt'), 'utf8'));
    const img = JSON.parse(readFileSync(join(c15(), 'trivy-image-0.stdout.txt'), 'utf8'));
    expect(fs.Results[0].Packages.length).toBeGreaterThan(200);
    expect(img.Results.some((r: any) => r.Class === 'lang-pkgs' && r.Packages.length > 0)).toBe(true);
    expect(img.Results.flatMap((r: any) => r.Vulnerabilities ?? []).length).toBeGreaterThan(0);
  });

  // ── §A1: every package, not a sample ─────────────────────────────────────────

  it('rejects corruption that begins AFTER the fifth package', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      // R3.4.3 read exactly five. Everything beyond index four was unexamined.
      for (const p of d.Results[0].Packages.slice(5)) delete p.Identifier;
    });
    closesFalsePass(/Packages\[\d+\] has no Identifier\.PURL/);
  });

  it('rejects a filesystem package set truncated to five', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => { d.Results[0].Packages = d.Results[0].Packages.slice(0, 5); });
    closesFalsePass(/omits \d+ of the \d+ production registry package/);
  });

  it('rejects a filesystem package set truncated to one', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => { d.Results[0].Packages = d.Results[0].Packages.slice(0, 1); });
    closesFalsePass(/omits \d+ of the \d+ production registry package/);
  });

  it('rejects a package invented from outside the lockfile universe', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results[0].Packages.push({
        ID: 'totally-made-up@9.9.9',
        Name: 'totally-made-up',
        Version: '9.9.9',
        Identifier: { PURL: 'pkg:npm/totally-made-up@9.9.9', UID: 'deadbeefdeadbeef' },
        AnalyzedBy: 'pnpm',
      });
    });
    closesFalsePass(/absent from the \d+-package lockfile universe/);
  });

  // ── §A2: PURLs are parsed, not glanced at ────────────────────────────────────

  it('rejects a malformed PURL', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => { d.Results[0].Packages[0].Identifier.PURL = 'not-a-purl'; });
    closesFalsePass(/PURL "not-a-purl" does not parse/);
  });

  it('rejects a valid PURL that names a different package than its record', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      // Parses cleanly, round-trips, right ecosystem — and describes something else entirely.
      d.Results[0].Packages[0].Identifier.PURL = 'pkg:npm/somewhere-else@1.2.3';
    });
    closesFalsePass(/PURL names "somewhere-else" but the package is|PURL version "1\.2\.3" but the package is/);
  });

  it('rejects a package attributed to the wrong ecosystem', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      const p = d.Results[0].Packages[0];
      p.Identifier.PURL = `pkg:golang/${p.Name}@${p.Version}`;
    });
    closesFalsePass(/PURL type is "golang", but an analyzer of "pnpm" produces "npm"/);
  });

  // ── §A4 / §B6: image results ─────────────────────────────────────────────────

  it('rejects a lang-pkgs image result that lists no packages', () => {
    editRaw('trivy-image-0.stdout.txt', (d) => {
      d.Results.find((r: any) => r.Class === 'lang-pkgs').Packages = [];
    });
    closesFalsePass(/lists ZERO packages/);
  });

  it('rejects an os-pkgs result whose Type contradicts the image OS', () => {
    editRaw('trivy-image-0.stdout.txt', (d) => {
      d.Results.find((r: any) => r.Class === 'os-pkgs').Type = 'debian';
    });
    closesFalsePass(/Type "debian" but Metadata\.OS\.Family is "alpine"|Type "debian" is not valid/);
  });

  // This and the next control use `trivy-image-1`, the image with NO findings. Mutating a
  // target or duplicating a result on an image that HAS findings also disturbs the finding
  // reconciliation, which R3.4.3 already catches; on an image with none, the arithmetic is
  // untouched and only the identity invariant can fail. That is the false pass.
  it('rejects an os-pkgs target that merely STARTS WITH the derived reference', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => {
      const r = d.Results.find((x: any) => x.Class === 'os-pkgs');
      r.Target = `${d.Metadata.Reference}-attacker (alpine 3.23.5)`;
    });
    closesFalsePass(/no os-pkgs result targeting exactly/);
  });

  it('rejects a duplicated JSON result', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => { d.Results.push({ ...d.Results[0] }); });
    closesFalsePass(/repeats the result identity/);
  });

  // ── §B7: findings ────────────────────────────────────────────────────────────

  it('rejects a LOW filesystem finding the command could not have produced', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-2026-0001', PkgName: 'x', Severity: 'LOW' }];
    });
    closesFalsePass(/reports 1 Vulnerabilities; the blocking filesystem scan PASSED/);
  });

  it('rejects a lowercase-severity filesystem finding', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-2026-0002', PkgName: 'x', Severity: 'critical' }];
    });
    closesFalsePass(/reports 1 Vulnerabilities; the blocking filesystem scan PASSED/);
  });

  it('rejects a malformed filesystem finding', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => { d.Results[0].Secrets = [{}]; });
    closesFalsePass(/reports 1 Secrets; the blocking filesystem scan PASSED/);
  });

  it('rejects a CRITICAL secret finding in an image', () => {
    editRaw('trivy-image-0.stdout.txt', (d) => {
      d.Results.find((r: any) => r.Class === 'os-pkgs').Secrets = [{
        RuleID: 'private-key', Severity: 'CRITICAL', Title: 'Asymmetric Private Key',
      }];
    });
    closesFalsePass(/reports 1 SECRET finding\(s\)/);
  });

  it('rejects an image vulnerability in a package the result never listed', () => {
    // The FINDING is left exactly as captured, so the reconciliation arithmetic is identical
    // and R3.4.3 sees nothing wrong. What is removed is the package the finding is about — a
    // result asserting a vulnerability in something it never claimed to have found.
    editRaw('trivy-image-0.stdout.txt', (d) => {
      const r = d.Results.find((x: any) => x.Class === 'os-pkgs');
      const name = r.Vulnerabilities[0].PkgName;
      r.Packages = r.Packages.filter((p: any) => p.Name !== name);
    });
    closesFalsePass(/reports a vulnerability in .*, which this result does not list/);
  });

  it('rejects an image stderr that proves no scanners were enabled', () => {
    replace('trivy-image-0.stderr.txt', '');
    closesFalsePass(/trivy-image-0\.stderr\.txt is EMPTY/);
  });

  // ── §C: the table multiset ───────────────────────────────────────────────────

  it('rejects a duplicate table row with contradictory counts before the genuine row', () => {
    const text = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8');
    const genuine = text.split('\n').find((l) => l.includes('pnpm-lock.yaml') && l.includes('│')) as string;
    // The forged row comes FIRST. R3.4.3 keyed a Map by target, so the genuine row that
    // followed simply overwrote it and the fabrication was never examined.
    const forged = genuine
      .replace(/│(\s*)0(\s*)│(\s*)-(\s*)│(\s*)-(\s*)│/, '│$1999$2│$3 99$4│$5 88$6│');
    replace('trivy-fs.stdout.txt', text.replace(genuine, `${forged}\n${genuine}`));
    closesFalsePass(/lists 'pnpm-lock\.yaml' more than once|has \d+ cell\(s\), not 5/);
  });

  // Recorded, NOT counted as a closed false pass. R3.4.3 read its column indices from the
  // header it found, so a swap made it look 'pnpm' up as a target and it rejected too — for a
  // different reason, but it rejected. The control exists so the order invariant cannot be
  // silently dropped by a future rewrite.
  it('rejects a reordered table header (R3.4.3 rejected this too)', () => {
    const text = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8')
      .replace('│     Target     │ Type │', '│      Type      │Target│');
    replace('trivy-fs.stdout.txt', text);
    expect(check().some((p) => /header is .*expected exactly/.test(p)),
      `got:\n${check().slice(0, 6).join('\n')}`).toBe(true);
    expect(frozen().length, 'R3.4.3 was expected to reject this one too').toBeGreaterThan(0);
  });

  // ── §D: audit consistency ────────────────────────────────────────────────────

  it('rejects low=1 with a LOW advisory beside a clean human receipt', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => {
      d.metadata.vulnerabilities.low = 1;
      d.advisories = { '1234': { severity: 'low', module_name: 'left-pad' } };
    });
    closesFalsePass(/reports 1 low finding\(s\) while the human receipt says the tree is clean/);
  });

  it('rejects info=10 with no advisory to account for it', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.metadata.vulnerabilities.info = 10; });
    closesFalsePass(/reports 10 info finding\(s\) while the human receipt says the tree is clean/);
  });

  it('rejects an audit that examined nothing', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => {
      d.metadata.dependencies = 0;
      d.metadata.devDependencies = 0;
      d.metadata.optionalDependencies = 0;
      d.metadata.totalDependencies = 0;
    });
    closesFalsePass(/reports ZERO dependencies of every kind|did not cover the tree/);
  });

  it('rejects an audit whose total disagrees with the lockfile universe', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.metadata.totalDependencies = 12; });
    closesFalsePass(/examined 12 package\(s\), but the lockfile universe .* has \d+/);
  });
});
