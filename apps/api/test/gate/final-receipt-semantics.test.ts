/**
 * C16-R3.4.3 §F — non-vacuity controls for receipt SEMANTICS.
 *
 * R3.4.2 bound every byte of every receipt and recomputed every digest, and still accepted six
 * coordinated false passes, all with one root cause: it checked that a receipt EXISTED and was
 * well-formed JSON, not that it SAID a scan had happened. A result row naming a file with no
 * packages, an image report with no results at all, a deleted scanner banner, a two-line
 * "table", an audit that reports clean and HIGH in the same breath, and an advisory container
 * shaped as an array so a key walk finds nothing — each survived.
 *
 * Every control below mutates a COMPLETE, PASSING package in exactly ONE way and runs BOTH
 * verifiers: the corrected one, and `fixtures/assert-final-manifests.r342-frozen.mjs`, a byte
 * copy of R3.4.2 with only its CLI guard removed and its imports repointed. Both are given the
 * real repository root explicitly, because their own `ROOT` resolves relative to the fixtures
 * directory.
 *
 * A control only counts if the frozen verifier ACCEPTS the mutation. That is what makes it a
 * reproduced false pass rather than a restatement of something already caught.
 *
 * ARITHMETIC, corrected at R3.4.4. The R3.4.3 delivery report described this file as
 * "17 closures plus one recorded case". That was wrong, and it double-counted: 18 tests are
 * 1 positive baseline + 16 reproduced R3.4.2 false-pass closures + 1 already-caught case.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertFinalManifests } from '../../../../scripts/gate/assert-final-manifests.mjs';
import { assertFinalManifests as assertR342Frozen } from './fixtures/assert-final-manifests.r342-frozen.mjs';
import { buildPassingR34Evidence, editManifest, sha256 } from './helpers/evidence-fixture-r34';

const REPO = join(__dirname, '..', '..', '..', '..');

describe('C16-R3.4.3 receipt semantics', () => {
  let root: string;
  let built: ReturnType<typeof buildPassingR34Evidence>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r343-'));
    built = buildPassingR34Evidence(root, REPO);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const c15 = () => built.c15Dir;

  const check = () => assertFinalManifests({
    c15Dir: c15(), c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
  }) as string[];

  const frozen = () => {
    try {
      return assertR342Frozen({
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

  /** Rewrite one JSON artifact through a mutator, rebinding it. */
  const editRaw = (rel: string, mutate: (doc: any) => void) => {
    const doc = JSON.parse(readFileSync(join(c15(), rel), 'utf8'));
    mutate(doc);
    replace(rel, `${JSON.stringify(doc, null, 2)}\n`);
  };

  /** R3.4.3 rejects for the stated reason; R3.4.2 accepted the identical package. */
  const closesFalsePass = (expected: RegExp) => {
    const problems = check();
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.join('\n') || '(none)'}`).toBe(true);
    const stale = frozen();
    expect(stale,
      `R3.4.2 must ACCEPT this mutation for it to be a reproduced false pass, but reported:\n${stale.join('\n')}`)
      .toEqual([]);
  };

  it('the untouched package passes BOTH verifiers', () => {
    expect(check()).toEqual([]);
    expect(frozen()).toEqual([]);
  });

  // ── §A — a result record must record a scan ──────────────────────────────────

  it('rejects a filesystem result that names the lockfile but analysed nothing', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results = [{ Target: 'pnpm-lock.yaml', Class: 'lang-pkgs' }];
    });
    closesFalsePass(/Results\[0\] has no Type|lists ZERO packages|Packages is undefined/);
  });

  it('rejects a filesystem result whose packages carry no identity', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      d.Results[0].Packages = [{ Name: 'pg', Version: '8.16.3', AnalyzedBy: 'pnpm' }];
    });
    closesFalsePass(/has no Identifier\.PURL/);
  });

  it('rejects packages attributed to an analyzer other than pnpm', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => {
      for (const p of d.Results[0].Packages) p.AnalyzedBy = 'npm';
    });
    closesFalsePass(/PURL type is "npm".*analyzer|AnalyzedBy is "npm"|does not parse|not canonical/);
  });

  it('rejects a filesystem report whose Type is not pnpm', () => {
    editRaw('trivy-fs-json.stdout.txt', (d) => { d.Results[0].Type = 'npm'; });
    closesFalsePass(/pnpm-lock\.yaml Type is "npm", expected "pnpm"/);
  });

  // These four use `trivy-image-1`, the image with NO tracked dispositions. Emptying an image
  // that HAS them is already caught by R3.4.2's finding-reconciliation arithmetic; emptying one
  // that has none costs nothing arithmetically, which is exactly why it passed.
  it('rejects an image report with Results: []', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => { d.Results = []; });
    closesFalsePass(/Results is EMPTY; the image was not analysed/);
  });

  it('rejects an image report with Results: [{}]', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => { d.Results = [{}]; });
    closesFalsePass(/Results\[0\] is an EMPTY object/);
  });

  it('rejects an image whose os-pkgs result lists no packages', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => { d.Results[0].Packages = []; });
    closesFalsePass(/lists ZERO packages/);
  });

  it('rejects an image whose analysed packages belong to another image', () => {
    editRaw('trivy-image-1.stdout.txt', (d) => {
      d.Results[0].Target = `elsewhere@sha256:${'c'.repeat(64)} (alpine 3.24.1)`;
    });
    closesFalsePass(/is not the derived reference|no os-pkgs result targeting exactly/);
  });

  // ── §B — the scanner banner is the only proof of coverage ────────────────────

  it('rejects a filesystem scan whose stderr no longer proves the scanners were enabled', () => {
    replace('trivy-fs.stderr.txt', '');
    closesFalsePass(/trivy-fs\.stderr\.txt is EMPTY/);
  });

  it('rejects a filesystem scan with vulnerability scanning unannounced', () => {
    const kept = readFileSync(join(c15(), 'trivy-fs-json.stderr.txt'), 'utf8')
      .split('\n').filter((l) => !l.includes('[vuln]')).join('\n');
    replace('trivy-fs-json.stderr.txt', kept);
    closesFalsePass(/no evidence that vulnerability scanning was enabled/);
  });

  it('rejects a filesystem scan with secret scanning unannounced', () => {
    const kept = readFileSync(join(c15(), 'trivy-fs.stderr.txt'), 'utf8')
      .split('\n').filter((l) => !l.includes('[secret]')).join('\n');
    replace('trivy-fs.stderr.txt', kept);
    closesFalsePass(/no evidence that secret scanning was enabled/);
  });

  // ── §C — the table is a grammar, not a phrase ────────────────────────────────

  it('rejects a fabricated table carrying only the heading and the target name', () => {
    replace('trivy-fs.stdout.txt', 'Report Summary\npnpm-lock.yaml\n');
    closesFalsePass(/table row\(s\); a summary needs a header/);
  });

  it('rejects a table missing a required column', () => {
    const text = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8')
      .replace('Secrets', 'Notes  ');
    replace('trivy-fs.stdout.txt', text);
    closesFalsePass(/missing the 'Secrets' column|header is .*expected exactly/);
  });

  it('rejects a table whose row contradicts the JSON scan type', () => {
    const text = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8')
      .replace('│ pnpm │', '│ npm  │');
    replace('trivy-fs.stdout.txt', text);
    closesFalsePass(/reports Type "npm", but the JSON scan reports "pnpm"|do not equal the JSON scan/);
  });

  // Recorded, NOT counted as a closed false pass: R3.4.2 already rejected a nonzero count. The
  // control exists so the grammar rewrite cannot silently drop a check the old matcher had.
  it('rejects a table reporting findings the JSON scan does not (R3.4.2 caught this too)', () => {
    const text = readFileSync(join(c15(), 'trivy-fs.stdout.txt'), 'utf8')
      .replace('        0        ', '        7        ');
    replace('trivy-fs.stdout.txt', text);
    expect(check().some((p) => /reports Vulnerabilities=7 but the JSON scan reports 0/.test(p)),
      `got:\n${check().slice(0, 8).join('\n')}`).toBe(true);
    expect(frozen().length, 'R3.4.2 was expected to reject this one too').toBeGreaterThan(0);
  });

  // ── §D — the audit receipt must say one thing ────────────────────────────────

  it('rejects an audit receipt that reports clean AND a HIGH finding', () => {
    replace('pnpm-audit-human.stdout.txt', 'No known vulnerabilities found\nHIGH vulnerability found\n');
    closesFalsePass(/not the exact clean pnpm receipt/);
  });

  it('rejects an advisory container shaped as an array', () => {
    editRaw('pnpm-audit-json.stdout.txt', (d) => { d.advisories = []; });
    closesFalsePass(/advisory container is an ARRAY/);
  });
});
