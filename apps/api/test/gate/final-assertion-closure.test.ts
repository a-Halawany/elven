/**
 * C16-R3.3 — mutation controls for the six coordinated false passes the R3.2 verifier still
 * permitted.
 *
 * R3.2 re-read the bytes behind every artifact BINDING, which closed R3.1's defect. It still
 * never looked at a step receipt, derived its required inventory from ten hardcoded names,
 * compared scanner digests to each other instead of to the tracked pin, trusted the caller's
 * cache digest, digested each SBOM without parsing it or tying it to the descriptor, and
 * never lstat-ed the output roots or the root manifests.
 *
 * EVERY control in this file executes BOTH verifiers: the corrected one and
 * `fixtures/assert-final-manifests.r32-frozen.mjs`, a byte copy of R3.2 with only its CLI
 * guard removed. Each asserts the corrected verifier rejects the mutation AND that the
 * frozen one accepts it — the frozen verifier is given the real repository root explicitly,
 * because its own `ROOT` resolves relative to the fixtures directory and it would otherwise
 * throw ENOENT and appear to "reject" everything.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, mkdtempSync, mkdirSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// C16-R3.4: this suite is a FROZEN historical record of the R3.3 verifier's behaviour. It
// executes the frozen R3.3 code against the frozen fixture, so neither drifts. The LIVE
// verifier is covered by source-anchored-reconstruction.test.ts, which is strictly stronger.
import {
  assertFinalManifests,
  PHASE0_TARGET_IDS,
  C15_NORMAL_STEPS,
  C15_ACQUISITION_STEPS,
  expectedC15Inventory,
  TARGET_RECORD_MERGED_KEYS,
} from './fixtures/assert-final-manifests.r33-frozen.mjs';
import { assertFinalManifests as assertR32Defective } from './fixtures/assert-final-manifests.r32-frozen.mjs';
import {
  buildPassingEvidence, editManifest, sha256, FIXTURE_SHA, FIXTURE_IMAGES,
} from './helpers/evidence-fixture';

const REPO = join(__dirname, '..', '..', '..', '..');

describe('C16-R3.3 final assertion closure', () => {
  let root: string;
  let c15Dir: string;
  let c16Dir: string;
  let sbomFileFor: (t: string) => string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r33-'));
    const built = buildPassingEvidence(root, REPO);
    c15Dir = built.c15Dir;
    c16Dir = built.c16Dir;
    sbomFileFor = built.sbomFileFor;
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  /** The corrected verifier. */
  const check = (over: { c15?: string; c16?: string } = {}) =>
    assertFinalManifests({
      c15Dir: over.c15 ?? c15Dir, c16Dir: over.c16 ?? c16Dir,
      expectedSha: FIXTURE_SHA, root: REPO,
    }) as string[];

  /** The FROZEN R3.2 verifier, given the real root so it can actually run. */
  const frozen = (over: { c15?: string; c16?: string } = {}) =>
    assertR32Defective({
      c15Dir: over.c15 ?? c15Dir, c16Dir: over.c16 ?? c16Dir,
      expectedSha: FIXTURE_SHA, root: REPO,
    }) as string[];

  /**
   * Assert the mutation is closed: rejected by R3.3 with a message matching `expected`, and
   * accepted by the frozen R3.2. Both halves are required — without the second, a control
   * cannot show it closes a defect rather than restating a check that already passed.
   */
  const closes = (expected: RegExp, over: { c15?: string; c16?: string } = {}) => {
    const problems = check(over);
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.join('\n') || '(none)'}`).toBe(true);
    const stale = frozen(over);
    expect(stale, `the frozen R3.2 verifier must ACCEPT this mutation, but reported:\n${stale.join('\n')}`)
      .toEqual([]);
  };

  // ── the fixture itself ───────────────────────────────────────────────────────

  it('the untouched fixture passes BOTH verifiers, so every rejection below is the mutation', () => {
    expect(check()).toEqual([]);
    expect(frozen()).toEqual([]);
  });

  it('the derived inventory covers every step stream and report — not ten hardcoded names', () => {
    const { inventory, problem } = expectedC15Inventory(FIXTURE_IMAGES) as
      { inventory: string[]; problem: null };
    expect(problem).toBeNull();
    // 6 normal + 2 image + 2 acquisition steps = 10 steps × 2 streams, + 4 reports.
    expect(inventory).toHaveLength((C15_NORMAL_STEPS.length + FIXTURE_IMAGES.length + C15_ACQUISITION_STEPS.length) * 2 + 4);
    for (const id of [...C15_NORMAL_STEPS.map((s: { id: string }) => s.id), 'trivy-image-0', 'trivy-image-1',
      ...C15_ACQUISITION_STEPS.map((s: { id: string }) => s.id)]) {
      expect(inventory).toContain(`${id}.stdout.txt`);
      expect(inventory).toContain(`${id}.stderr.txt`);
    }
    expect(inventory).toContain('image-findings.json');
    expect(inventory).toContain('RESULT-PASS.txt');
  });

  it('the image step set is DERIVED from digest_pinned_images and refuses a malformed list', () => {
    for (const bad of [[], null, ['postgres:18-alpine'], [`x@sha256:${'A'.repeat(64)}`],
      [FIXTURE_IMAGES[0], FIXTURE_IMAGES[0]]]) {
      editManifest(c15Dir, 'supply-chain-manifest.json', (m) => { m.digest_pinned_images = bad; });
      expect(check().some((p) => /digest_pinned_images/.test(p)),
        `image list ${JSON.stringify(bad)} must be refused`).toBe(true);
      const built = buildPassingEvidence(root, REPO);   // restore for the next iteration
      c15Dir = built.c15Dir;
    }
  });

  // ── item 1: exact step closure and the three-way stream cross-check ──────────

  it('deleting a raw stream AND its binding while the step still references it is rejected', () => {
    rmSync(join(c15Dir, 'trivy-image-0.stdout.txt'));
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => a.path !== 'trivy-image-0.stdout.txt');
    });
    // Both the derived inventory and the step reference must complain.
    const problems = check();
    expect(problems.some((p) => /did not bind the required output 'trivy-image-0\.stdout\.txt'/.test(p))).toBe(true);
    expect(problems.some((p) => /step 'trivy-image-0' stdout file 'trivy-image-0\.stdout\.txt' does not exist/.test(p))).toBe(true);
    expect(frozen(), 'R3.2 checked no step and required no such artifact').toEqual([]);
  });

  it('tampering a stream and updating ONLY its binding leaves a stale step hash, and is rejected', () => {
    const rel = 'trivy-fs.stdout.txt';
    writeFileSync(join(c15Dir, rel), 'TAMPERED');
    const bytes = readFileSync(join(c15Dir, rel));
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === rel);
      a.bytes = bytes.length; a.sha256 = sha256(bytes);
    });
    const problems = check();
    expect(problems.some((p) => /step 'trivy-fs' claims stdout is \d+ bytes/.test(p))).toBe(true);
    expect(problems.some((p) => /step 'trivy-fs' claims stdout sha256 .* hashes to/.test(p))).toBe(true);
    expect(problems.some((p) => /step 'trivy-fs' claims .* but its binding claims/.test(p))).toBe(true);
    expect(frozen(), 'R3.2 verified the binding it had just been handed').toEqual([]);
  });

  it.each([
    ['a MISSING normal step', (m: any) => { m.steps = m.steps.filter((s: any) => s.id !== 'trivy-fs-json'); },
      /missing the required step 'trivy-fs-json'/],
    ['a DUPLICATE normal step', (m: any) => { m.steps.push(JSON.parse(JSON.stringify(m.steps.find((s: any) => s.id === 'trivy-fs')))); },
      /step 'trivy-fs' appears 2 times/],
    ['an EXTRA normal step', (m: any) => { const s = JSON.parse(JSON.stringify(m.steps[0])); s.id = 'semgrep-scan'; m.steps.push(s); },
      /unexpected step 'semgrep-scan'/],
    ['a RENAMED normal step', (m: any) => { m.steps.find((s: any) => s.id === 'gitleaks-history').id = 'gitleaks-log'; },
      /missing the required step 'gitleaks-history'/],
    ['a step run by the WRONG TOOL', (m: any) => { m.steps.find((s: any) => s.id === 'trivy-fs').tool = 'grype'; },
      /step 'trivy-fs' was run by "grype"/],
    ['a BLOCKING step demoted to informational', (m: any) => { m.steps.find((s: any) => s.id === 'trivy-fs').policy = 'informational'; },
      /step 'trivy-fs' has policy "informational", expected "blocking"/],
    ['a step with a NONZERO exit', (m: any) => { m.steps.find((s: any) => s.id === 'trivy-fs').exit_code = 1; },
      /step 'trivy-fs' exited 1/],
    ['a step recording a FOREIGN source SHA', (m: any) => { m.steps.find((s: any) => s.id === 'trivy-fs').source_sha = '2'.repeat(40); },
      /step 'trivy-fs' records source_sha/],
  ])('%s is rejected', (_label, mutate, expected) => {
    editManifest(c15Dir, 'supply-chain-manifest.json', mutate as (m: Record<string, any>) => void);
    closes(expected as RegExp);
  });

  it.each([
    ['a MISSING acquisition step', (m: any) => {
      m.trivy_cache_acquisition.steps = m.trivy_cache_acquisition.steps.filter((s: any) => s.id !== 'trivy-acquire-checks');
    }, /missing the required acquisition step 'trivy-acquire-checks'/],
    ['a DUPLICATE acquisition step', (m: any) => {
      m.trivy_cache_acquisition.steps.push(JSON.parse(JSON.stringify(m.trivy_cache_acquisition.steps[0])));
    }, /acquisition step 'trivy-acquire-db' appears 2 times/],
    ['an acquisition step that FAILED', (m: any) => { m.trivy_cache_acquisition.steps[0].exit_code = 1; },
      /acquisition step 'trivy-acquire-db' exited 1/],
  ])('%s is rejected', (_label, mutate, expected) => {
    editManifest(c15Dir, 'supply-chain-manifest.json', mutate as (m: Record<string, any>) => void);
    closes(expected as RegExp);
  });

  it('two steps sharing one raw stream is rejected — a step cannot borrow verified bytes', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const donor = m.steps.find((s: any) => s.id === 'trivy-fs');
      const thief = m.steps.find((s: any) => s.id === 'trivy-fs-json');
      thief.stdout_file = donor.stdout_file;
      thief.stdout_bytes = donor.stdout_bytes;
      thief.stdout_sha256 = donor.stdout_sha256;
    });
    closes(/raw stream 'trivy-fs\.stdout\.txt' is referenced by 2 steps/);
  });

  // ── item 2: the derived inventory ────────────────────────────────────────────

  it('a missing governed report that no old hardcoded list covered is rejected', () => {
    // `trivy-image-1.stderr.txt` was in NO version of the ten-name list.
    const rel = 'trivy-image-1.stderr.txt';
    rmSync(join(c15Dir, rel));
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => a.path !== rel);
    });
    closes(new RegExp(`did not bind the required output '${rel.replace('.', '\\.')}'`));
  });

  it('an extra unbound output is still rejected', () => {
    writeFileSync(join(c15Dir, 'EXTRA-UNBOUND.txt'), 'nobody checked these bytes');
    const problems = check();
    expect(problems.some((p) => /EXTRA-UNBOUND\.txt.*UNBOUND/.test(p))).toBe(true);
    // R3.2 already caught this one; say so rather than implying a fresh catch.
    expect(frozen().some((p) => /EXTRA-UNBOUND/.test(p))).toBe(true);
  });

  // ── item 3: the scanner digest chain ────────────────────────────────────────

  it('forging sha256_after AND expected TOGETHER is rejected — the chain anchors on the pin', () => {
    const forged = '9'.repeat(64);
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.staged_tools_after_scanning.trivy.sha256_after = forged;
      m.staged_tools_after_scanning.trivy.expected = forged;
    });
    const problems = check();
    expect(problems.some((p) => /trivy chain BROKEN: staged post-scan expected digest/.test(p))).toBe(true);
    expect(problems.some((p) => /trivy chain BROKEN: staged post-scan actual digest/.test(p))).toBe(true);
    expect(frozen(), 'R3.2 compared the two forged values to each other').toEqual([]);
  });

  it.each([
    ['the staged pre-execution digest', 'staged_sha256', /staged pre-execution digest/],
    ['the expected executable digest', 'expected_sha256', /expected executable digest/],
    ['the authenticated executable digest', 'actual_sha256', /authenticated executable digest/],
  ])('a broken link at %s is rejected', (_label, field, expected) => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.executed_binary_authentication.verified.gitleaks[field as string] = '8'.repeat(64);
    });
    const problems = check();
    expect(problems.some((p) => /gitleaks chain BROKEN/.test(p) && (expected as RegExp).test(p)),
      `got:\n${problems.join('\n')}`).toBe(true);
  });

  // ── item 4: cache provenance ────────────────────────────────────────────────

  it('corrupting a cache entry while keeping the caller-supplied top digest is rejected', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        m[k].entries[0].sha256 = '0'.repeat(64);
      }
    });
    closes(/cache fingerprint digest is ".*"; recomputes to/);
  });

  it('a falsified checks-manifest aggregate is rejected', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        m[k].checks_content.files = 641;
        m[k].checks_content.bytes = 1054940;
      }
    });
    const problems = check();
    expect(problems.some((p) => /checks_content\.files is 641; the manifest lists 2/.test(p))).toBe(true);
    expect(problems.some((p) => /checks_content\.bytes is 1054940; the manifest totals/.test(p))).toBe(true);
    expect(frozen()).toEqual([]);
  });

  it('an absent cache entry is rejected even if everything recomputes around it', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const e = m[k].entries[1];
        e.present = false; delete e.bytes; delete e.sha256;
        m[k].digest = sha256(JSON.stringify({ entries: m[k].entries, checksManifest: m[k].checks_manifest }));
      }
    });
    closes(/cache entry 'db\/trivy\.db' is absent/);
  });

  it('a before/after cache difference is rejected even when the boolean claims unchanged', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const fp = m.trivy_cache_fingerprint_after;
      fp.entries[0].bytes = fp.entries[0].bytes + 1;
      fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      m.trivy_cache_unchanged = true;   // the boolean lies; the recomputation does not
    });
    const problems = check();
    expect(problems.some((p) => /recomputed cache digest changed across scanning/.test(p))).toBe(true);
    expect(problems.some((p) => /not canonically identical/.test(p))).toBe(true);
    // HONEST NOTE: R3.2 already compared the two CLAIMED top-level digests, so it catches
    // this one too. It is kept because R3.3 catches it by recomputation and adds canonical
    // entry-level equality; the mutation R3.2 genuinely missed is the corrupted-entry case
    // above, where the claimed digests still agreed.
    expect(frozen().some((p) => /cache digest changed/.test(p)),
      'R3.2 is expected to catch this one as well').toBe(true);
  });

  // ── item 5: target-to-SBOM identity ─────────────────────────────────────────

  it('swapping the production and development target records is rejected', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      const p = m.targets.production; const d = m.targets.development;
      m.targets.production = d; m.targets.development = p;
    });
    const problems = check();
    expect(problems.some((p) => /target key 'production' carries identity "linux-x64-glibc-dev".*records appear swapped/.test(p))).toBe(true);
    expect(problems.some((p) => /target key 'development' carries identity "linux-x64-glibc-prod"/.test(p))).toBe(true);
    expect(frozen(), 'R3.2 never tied a target key to a descriptor identity').toEqual([]);
  });

  it('pointing BOTH targets at the production SBOM and dropping the dev SBOM is rejected', () => {
    const prod = sbomFileFor('production');
    const dev = sbomFileFor('development');
    const bytes = readFileSync(join(c16Dir, prod));
    rmSync(join(c16Dir, dev));
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.development.sbom_file = prod;
      m.targets.development.sbom_sha256 = sha256(bytes);
      m.targets.development.sbom_bytes = bytes.length;
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => a.path !== dev);
    });
    const problems = check();
    // Caught two independent ways: the SBOM says it is the production target, and no two
    // targets may share one SBOM.
    expect(problems.some((p) => /both reference|distinct SBOM/.test(p))
      || problems.some((p) => /SBOM 'eye:target-id'|eye:target-id' is/.test(p)),
      `got:\n${problems.join('\n')}`).toBe(true);
    expect(problems.some((p) => /target development SBOM/.test(p))).toBe(true);
    expect(frozen(), 'R3.2 digested the SBOM without reading what it claimed to be').toEqual([]);
  });

  it.each([
    ['eye:source-sha', '2'.repeat(40)],
    ['eye:target-id', 'linux-x64-glibc-dev'],
    ['eye:target-arch', 'arm64'],
    ['eye:dependency-scopes', 'dependencies'],
    ['eye:importer-roots', 'apps/api'],
  ])('an SBOM whose %s contradicts the descriptor is rejected', (prop, value) => {
    const file = sbomFileFor('production');
    const path = join(c16Dir, file);
    const sbom = JSON.parse(readFileSync(path, 'utf8')) as any;
    sbom.metadata.properties.find((p: any) => p.name === prop).value = value;
    const body = JSON.stringify(sbom, null, 2);
    writeFileSync(path, body);
    const bytes = readFileSync(path);
    // Keep every digest claim honest, so ONLY the identity contradiction is under test.
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.production.sbom_sha256 = sha256(bytes);
      m.targets.production.sbom_bytes = bytes.length;
      const b = m.evidence_artifacts.find((a: any) => a.path === file);
      b.sha256 = sha256(bytes); b.bytes = bytes.length;
    });
    closes(new RegExp(`SBOM '${prop}' is`));
  });

  it('an SBOM whose serialNumber disagrees with the report is rejected', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.production.serial_number = 'urn:uuid:00000000-0000-5000-8000-000000000000';
    });
    closes(/SBOM serialNumber .* does not equal the report's/);
  });

  it('a target identity field that contradicts the descriptor is rejected', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.production.target.arch = 'arm64';
    });
    closes(/target 'production' identity field 'arch' is/);
  });

  it('an undeclared field smuggled into a target identity record is rejected', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.production.target.allow_everything = true;
    });
    closes(/carries undeclared field\(s\): allow_everything/);
    // The one merged key the generator legitimately adds is NOT reported.
    expect(TARGET_RECORD_MERGED_KEYS).toEqual(['integrity_rules']);
  });

  // ── item 6: root path safety ────────────────────────────────────────────────

  it('a SYMLINKED C15 output root is rejected', () => {
    const link = join(root, 'c15-link');
    symlinkSync(c15Dir, link);
    closes(/C15 output directory .* is a SYMLINK/, { c15: link });
  });

  it('a SYMLINKED C16 output root is rejected', () => {
    const link = join(root, 'c16-link');
    symlinkSync(c16Dir, link);
    closes(/C16 output directory .* is a SYMLINK/, { c16: link });
  });

  it('a SYMLINKED C15 root manifest is rejected even when it points at valid bytes', () => {
    const outside = join(root, 'outside-manifest.json');
    cpSync(join(c15Dir, 'supply-chain-manifest.json'), outside);
    rmSync(join(c15Dir, 'supply-chain-manifest.json'));
    symlinkSync(outside, join(c15Dir, 'supply-chain-manifest.json'));
    closes(/C15 supply-chain-manifest\.json is a SYMLINK/);
  });

  it('a SYMLINKED C16 root manifest is rejected even when it points at valid bytes', () => {
    const outside = join(root, 'outside-reconciliation.json');
    cpSync(join(c16Dir, 'closure-reconciliation.json'), outside);
    rmSync(join(c16Dir, 'closure-reconciliation.json'));
    symlinkSync(outside, join(c16Dir, 'closure-reconciliation.json'));
    closes(/C16 closure-reconciliation\.json is a SYMLINK/);
  });

  it('an artifact reached through a symlinked INTERMEDIATE directory is rejected', () => {
    // A nested bound path whose parent directory is a symlink to bytes outside the package.
    const outsideDir = join(root, 'outside-reports');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, 'nested.json'), '{"outside":true}');
    symlinkSync(outsideDir, join(c15Dir, 'reports'));
    const bytes = readFileSync(join(outsideDir, 'nested.json'));
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.evidence_artifacts.push({
        path: join('reports', 'nested.json'), bytes: bytes.length, sha256: sha256(bytes),
      });
    });
    const problems = check();
    expect(problems.some((p) => /intermediate path 'reports' is a SYMLINK/.test(p)),
      `got:\n${problems.join('\n')}`).toBe(true);
    // HONEST NOTE: R3.2 rejects this too, but for the WRONG reason and with a misleading
    // message: its directory walk treats the symlink as a plain file and reports
    // `reports is present but UNBOUND`. It never identifies the symlink, and it lstat-ed
    // only the final path component, so it would have read the outside bytes as verified had
    // the link been bound. The control records what each verifier actually says.
    const stale = frozen();
    expect(stale.some((p) => /'reports' is present but UNBOUND/.test(p)),
      `R3.2 was expected to misreport this as an unbound file, got:\n${stale.join('\n')}`).toBe(true);
    expect(stale.some((p) => /SYMLINK/.test(p)),
      'R3.2 must NOT identify the symlink — that is the gap being closed').toBe(false);
  });

  it('the descriptor target set is still checked against the code-owned Phase 0 set', () => {
    expect([...PHASE0_TARGET_IDS].sort()).toEqual(['development', 'production']);
    const fakeRoot = join(root, 'fake-repo');
    mkdirSync(join(fakeRoot, 'scripts', 'gate'), { recursive: true });
    writeFileSync(join(fakeRoot, 'scripts/gate/target-descriptor.json'), JSON.stringify({ targets: {} }));
    cpSync(join(REPO, 'scripts/gate/scanner-pins.json'), join(fakeRoot, 'scripts/gate/scanner-pins.json'));
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => { m.targets = {}; });
    const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha: FIXTURE_SHA, root: fakeRoot }) as string[];
    expect(problems.some((p) => /target-descriptor\.json declares \[\]/.test(p))).toBe(true);
  });
});
