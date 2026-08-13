/**
 * C16-R3.2 — mutation controls for the final-manifest verifier.
 *
 * An independent reviewer showed the C16-R3.1 verifier to be a false pass: every required
 * C15 artifact and both C16 SBOMs were replaced with the word TAMPERED, their manifests kept
 * the fabricated 64-character digests and byte counts, an extra unbound output was added,
 * and `assertFinalManifests()` returned no problems. A descriptor with zero targets and an
 * extra pinned-but-unauthenticated scanner also passed.
 *
 * Each control below mutates a COMPLETE, PASSING evidence pair in exactly one way and
 * asserts two things:
 *
 *   1. the corrected verifier REJECTS it, with a message naming the actual cause; and
 *   2. the FROZEN R3.1 verifier — real defective code, executed, not a paraphrase —
 *      ACCEPTS it.
 *
 * Without (2) a control cannot distinguish "the new code closes this defect" from "some
 * check already covered this", which is the difference between a regression test and a
 * decorative one. Where R3.1 happened to reject a mutation for an unrelated reason, the
 * control says so explicitly rather than pretending it was a fresh catch.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// C16-R3.4: FROZEN historical record of the R3.2 verifier, executed against the frozen
// fixture. The live verifier is covered by source-anchored-reconstruction.test.ts.
import {
  assertFinalManifests,
  PHASE0_TARGET_IDS,
  MANDATORY_SCANNERS,
  REQUIRED_C15_ARTIFACTS,
  pinnedScannerNames,
  descriptorTargetIds,
} from './fixtures/assert-final-manifests.r32-frozen.mjs';
import { assertFinalManifests as assertR31Defective } from './fixtures/assert-final-manifests.r31-frozen.mjs';
import { buildPassingEvidence, editManifest, FIXTURE_SHA } from './helpers/evidence-fixture';

const REPO = join(__dirname, '..', '..', '..', '..');
const SHA = FIXTURE_SHA;
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

describe('C16-R3.2 final-manifest verifier — the delivered bytes, not the claims about them', () => {
  let root: string;
  let c15Dir: string;
  let c16Dir: string;
  let hostKey: string;
  let sbomFileFor: (t: string) => string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-verifier-'));
    const built = buildPassingEvidence(root, REPO);
    c15Dir = built.c15Dir;
    c16Dir = built.c16Dir;
    hostKey = built.hostKey;
    sbomFileFor = built.sbomFileFor;
  });

  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const check = () => assertFinalManifests({ c15Dir, c16Dir, expectedSha: SHA, root: REPO });
  const checkDefective = () =>
    assertR31Defective({ c15Dir, c16Dir, expectedSha: SHA, root: REPO }) as string[];

  it('the untampered fixture passes BOTH verifiers — so every rejection below is the mutation', () => {
    expect(check()).toEqual([]);
    expect(checkDefective()).toEqual([]);
  });

  it("REPRODUCES THE REVIEWER'S SCENARIO: every artifact TAMPERED, hashes fabricated, an extra unbound output", () => {
    // Exactly what was independently reproduced against R3.1: replace every required C15
    // artifact and both C16 SBOMs with the word TAMPERED, leave the fabricated 64-character
    // digests and byte counts in the manifests, and add an unbound extra output.
    for (const name of REQUIRED_C15_ARTIFACTS) writeFileSync(join(c15Dir, name), 'TAMPERED');
    for (const t of PHASE0_TARGET_IDS) {
      writeFileSync(join(c16Dir, sbomFileFor(t)), 'TAMPERED');
    }
    writeFileSync(join(c15Dir, 'EXTRA-UNBOUND.txt'), 'nobody checked these bytes');

    const defective = checkDefective();
    expect(defective, `R3.1 returned problems, so this is not the reported false pass:\n${defective.join('\n')}`)
      .toEqual([]);

    const problems = check();
    // Every tampered artifact must be named, not just the first one found.
    for (const name of REQUIRED_C15_ARTIFACTS) {
      expect(problems.some((p) => p.includes(name)), `${name} must be reported`).toBe(true);
    }
    for (const t of PHASE0_TARGET_IDS) {
      expect(problems.some((p) => p.includes(`target ${t}`) && /hashes to/.test(p))).toBe(true);
    }
    expect(problems.some((p) => /EXTRA-UNBOUND\.txt.*UNBOUND/.test(p))).toBe(true);
  });

  it('the fixture is built from the real pins and the real Phase 0 target set', () => {
    expect(pinnedScannerNames(REPO)).toEqual([...MANDATORY_SCANNERS].sort());
    expect(descriptorTargetIds(REPO)).toEqual([...PHASE0_TARGET_IDS].sort());
    expect(hostKey.length).toBeGreaterThan(0);
  });

  // ── MODIFIED BYTES ───────────────────────────────────────────────────────────────

  it('MODIFIED RAW C15 BYTES with the claim untouched is rejected', () => {
    writeFileSync(join(c15Dir, 'trivy-fs.stdout.txt'), 'TAMPERED');
    const problems = check();
    expect(problems.join('\n')).toMatch(/trivy-fs\.stdout\.txt/);
    expect(problems.some((p) => /bytes but the file on disk is|hash to/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 never opened the file').toEqual([]);
  });

  it('a SAME-LENGTH C15 tamper — size claim still correct — is rejected on the digest', () => {
    const path = join(c15Dir, 'image-findings.json');
    const original = readFileSync(path);
    // Byte-for-byte the same length, so only a recomputed digest can catch it.
    const swapped = Buffer.from(original);
    swapped[0] = swapped[0] === 0x58 ? 0x59 : 0x58;
    writeFileSync(path, swapped);
    expect(statSync(path).size).toBe(original.length);
    const problems = check();
    expect(problems.some((p) => /image-findings\.json/.test(p) && /hash/.test(p)),
      `expected a digest mismatch, got:\n${problems.join('\n')}`).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('MODIFIED C16 SBOM BYTES are rejected against sbom_sha256 AND the binding', () => {
    const target = PHASE0_TARGET_IDS[0]!;
    writeFileSync(join(c16Dir, sbomFileFor(target)), 'TAMPERED');
    const problems = check();
    expect(problems.some((p) => p.includes(`target ${target}`) && /hashes to/.test(p))).toBe(true);
    expect(problems.some((p) => /binding claims/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 only checked the SBOM existed').toEqual([]);
  });

  // ── FALSE CLAIMS ─────────────────────────────────────────────────────────────────

  it('a WRONG CLAIMED SIZE is rejected even when the digest is right', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'trivy-fs.stdout.txt');
      a.bytes = a.bytes + 1;
    });
    expect(check().some((p) => /claims \d+ bytes but the file on disk is \d+/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 only checked bytes was a number').toEqual([]);
  });

  it('a WRONG CLAIMED DIGEST is rejected even when the size is right', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'trivy-fs.stdout.txt');
      a.sha256 = 'f'.repeat(64);   // well-formed, and wrong
    });
    expect(check().some((p) => /but the delivered bytes hash to/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 only checked the digest matched /^[a-f0-9]{64}$/').toEqual([]);
  });

  // ── INVENTORY INTEGRITY ──────────────────────────────────────────────────────────

  it('a DUPLICATE binding path is rejected', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'trivy-fs.stdout.txt');
      m.evidence_artifacts.push({ ...a, sha256: 'a'.repeat(64) });
    });
    expect(check().some((p) => /more than once/.test(p))).toBe(true);
    // R3.1 keyed a Map by path, so the second entry silently replaced the first.
    expect(checkDefective()).toEqual([]);
  });

  it('a MISSING FILE behind a binding is rejected', () => {
    rmSync(join(c15Dir, 'gitleaks-worktree.json'));
    expect(check().some((p) => /gitleaks-worktree\.json.*does not exist|phantom/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 never stat-ed the bound paths').toEqual([]);
  });

  it('a PHANTOM binding — a claim with no file at all — is rejected', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.evidence_artifacts.push({
        path: 'never-produced.json',
        bytes: 42,
        sha256: 'b'.repeat(64),
      });
    });
    expect(check().some((p) => /never-produced\.json.*phantom binding/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('an EXTRA UNBOUND file in the output directory is rejected', () => {
    writeFileSync(join(c15Dir, 'EXTRA-UNBOUND.txt'), 'nobody checked these bytes');
    expect(check().some((p) => /EXTRA-UNBOUND\.txt.*UNBOUND/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 never enumerated the directory').toEqual([]);
  });

  it('an extra unbound file in the C16 output is rejected too', () => {
    writeFileSync(join(c16Dir, 'sbom-extra.cdx.json'), '{}');
    expect(check().some((p) => /C16 output 'sbom-extra\.cdx\.json'.*UNBOUND/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('only the documented root manifest and directories may be unbound', () => {
    // The cache and staged-scanner trees are present in the fixture and must NOT be
    // reported; if the exclusion list were open-ended this control would not distinguish it.
    expect(check()).toEqual([]);
    writeFileSync(join(c15Dir, '.trivy-cache', 'db', 'extra-cache-file'), 'x');
    expect(check(), 'files inside the documented cache dir stay excluded').toEqual([]);
    mkdirSync(join(c15Dir, 'nested'), { recursive: true });
    writeFileSync(join(c15Dir, 'nested', 'report.json'), '{}');
    expect(check().some((p) => /nested.report\.json.*UNBOUND/.test(p)),
      'a NESTED unbound file must still be caught').toBe(true);
  });

  // ── PATH SAFETY ──────────────────────────────────────────────────────────────────

  it('a SYMLINKED artifact is rejected — verified bytes must be delivered bytes', () => {
    const outside = join(root, 'outside.txt');
    writeFileSync(outside, 'bytes the gate never scanned');
    const target = join(c15Dir, 'trivy-fs.stdout.txt');
    rmSync(target);
    symlinkSync(outside, target);
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'trivy-fs.stdout.txt');
      const bytes = readFileSync(outside);
      a.bytes = bytes.length;
      a.sha256 = sha256(bytes);   // the symlink target's real digest — still refused
    });
    expect(check().some((p) => /is a SYMLINK/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('a TRAVERSING binding path is rejected in every form', () => {
    for (const bad of ['../escape.txt', 'a/../../escape.txt', '/etc/passwd', './trivy-fs.stdout.txt']) {
      const fresh = mkdtempSync(join(tmpdir(), 'eye-trav-'));
      const built = buildPassingEvidence(fresh, REPO);
      editManifest(built.c15Dir, 'supply-chain-manifest.json', (m) => {
        m.evidence_artifacts.push({ path: bad, bytes: 1, sha256: 'c'.repeat(64) });
      });
      const problems = assertFinalManifests({
        c15Dir: built.c15Dir, c16Dir: built.c16Dir, expectedSha: SHA, root: REPO,
      });
      expect(problems.some((p) => p.includes('binding path')),
        `path ${bad} must be refused, got:\n${problems.join('\n')}`).toBe(true);
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  // ── DERIVED-EXPECTATION CIRCULARITY ──────────────────────────────────────────────

  it('an EMPTY descriptor no longer matches an empty report', () => {
    // R3.1 derived the expected set from the descriptor, so `{} === {}` passed. The Phase 0
    // set is now code-owned, and the descriptor is checked against it.
    const fakeRepo = join(root, 'fake-repo', 'scripts', 'gate');
    mkdirSync(fakeRepo, { recursive: true });
    writeFileSync(join(fakeRepo, 'target-descriptor.json'), JSON.stringify({ targets: {} }));
    writeFileSync(
      join(fakeRepo, 'scanner-pins.json'),
      readFileSync(join(REPO, 'scripts/gate/scanner-pins.json')),
    );
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => { m.targets = {}; });

    const fakeRoot = join(root, 'fake-repo');
    const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot });
    expect(problems.some((p) => /target-descriptor\.json declares \[\]/.test(p))).toBe(true);
    expect(problems.some((p) => /C16 target set is \[\]/.test(p))).toBe(true);

    const defective = assertR31Defective({
      c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot,
    }) as string[];
    expect(defective, 'R3.1 accepted zero targets against a zero-target descriptor').toEqual([]);
  });

  it('a PARTIAL target set fails', () => {
    const dropped = PHASE0_TARGET_IDS[0]!;
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      delete m.targets[dropped];
      m.evidence_artifacts = m.evidence_artifacts.filter(
        (a: any) => a.path !== sbomFileFor(dropped),
      );
    });
    rmSync(join(c16Dir, sbomFileFor(dropped)));
    expect(check().some((p) => /C16 target set is \[/.test(p))).toBe(true);
  });

  it('an ADDITIONAL target fails', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.targets.staging = { ...m.targets[PHASE0_TARGET_IDS[0]!] };
    });
    expect(check().some((p) => /C16 target set is \[.*staging/.test(p))).toBe(true);
  });

  // ── SCANNER SET ──────────────────────────────────────────────────────────────────

  it('an ADDED PINNED SCANNER with no authentication evidence fails', () => {
    const fakeRoot = join(root, 'fake-pins');
    const gateDir = join(fakeRoot, 'scripts', 'gate');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, 'target-descriptor.json'),
      readFileSync(join(REPO, 'scripts/gate/target-descriptor.json')),
    );
    const pins = JSON.parse(
      readFileSync(join(REPO, 'scripts/gate/scanner-pins.json'), 'utf8'),
    ) as Pins;
    // A third scanner, pinned and therefore executable, with no authentication record.
    pins.tools.semgrep = { artifacts: { [hostKey]: { executable_sha256: 'd'.repeat(64) } } };
    writeFileSync(join(gateDir, 'scanner-pins.json'), JSON.stringify(pins, null, 2));

    const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot });
    expect(problems.some((p) => /authenticated tool set is .*expected exactly the pinned set/.test(p))).toBe(true);
    expect(problems.some((p) => /no authentication evidence for the pinned scanner 'semgrep'/.test(p))).toBe(true);

    const defective = assertR31Defective({
      c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot,
    }) as string[];
    expect(defective, 'R3.1 compared against a hardcoded pair, so the third pin was invisible')
      .toEqual([]);
  });

  it('dropping a mandatory scanner from the pins fails', () => {
    const fakeRoot = join(root, 'fake-pins-2');
    const gateDir = join(fakeRoot, 'scripts', 'gate');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, 'target-descriptor.json'),
      readFileSync(join(REPO, 'scripts/gate/target-descriptor.json')),
    );
    const pins = JSON.parse(
      readFileSync(join(REPO, 'scripts/gate/scanner-pins.json'), 'utf8'),
    ) as Pins;
    delete pins.tools.gitleaks;
    writeFileSync(join(gateDir, 'scanner-pins.json'), JSON.stringify(pins, null, 2));
    const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot });
    expect(problems.some((p) => /does not pin the mandatory scanner 'gitleaks'/.test(p))).toBe(true);
  });

  it('an empty pin set fails rather than expecting nothing', () => {
    const fakeRoot = join(root, 'fake-pins-3');
    const gateDir = join(fakeRoot, 'scripts', 'gate');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, 'target-descriptor.json'),
      readFileSync(join(REPO, 'scripts/gate/target-descriptor.json')),
    );
    writeFileSync(join(gateDir, 'scanner-pins.json'), JSON.stringify({ tools: {} }));
    const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha: SHA, root: fakeRoot });
    expect(problems.some((p) => /pins no tools/.test(p))).toBe(true);
  });

  it('an authentication record that did not precede execution fails', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.executed_binary_authentication.verified.trivy.authenticated_before_first_execution = false;
    });
    expect(check().some((p) => /did not authenticate trivy BEFORE its first execution/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  // ── POST-SCAN POSTURE ────────────────────────────────────────────────────────────

  it('a tree that was not clean AFTER scanning fails', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => { m.tree_clean_after_scanning = false; });
    expect(check().some((p) => /clean worktree AFTER scanning/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('a worktree changed by scanning fails', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => { m.worktree_unchanged_by_scanning = false; });
    expect(check().some((p) => /unchanged by scanning/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('a staged binary whose post-scan digest moved fails', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.staged_tools_after_scanning.trivy.sha256_after = 'e'.repeat(64);
      m.staged_tools_after_scanning.trivy.match = false;
    });
    expect(check().some((p) => /staged trivy binary changed during scanning/.test(p))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });

  it('disagreeing before/after cache digests fail even when the boolean claims unchanged', () => {
    editManifest(c15Dir, 'supply-chain-manifest.json', (m) => {
      m.trivy_cache_fingerprint_after.digest = sha256('a different cache');
      m.trivy_cache_unchanged = true;   // the boolean lies; the digests do not
    });
    expect(check().some((p) => /cache digest changed across scanning/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 trusted the boolean').toEqual([]);
  });

  it('a missing C16 receipt binding fails', () => {
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => a.path !== 'RESULT-PASS.txt');
    });
    const problems = check();
    expect(problems.some((p) => /C16 did not bind the required artifact 'RESULT-PASS\.txt'/.test(p))).toBe(true);
    expect(problems.some((p) => /RESULT-PASS\.txt.*UNBOUND/.test(p))).toBe(true);
    expect(checkDefective(), 'R3.1 required no C16 bindings at all').toEqual([]);
  });

  it('an SBOM present and correct but NOT bound fails', () => {
    const target = PHASE0_TARGET_IDS[0]!;
    const file = sbomFileFor(target);
    editManifest(c16Dir, 'closure-reconciliation.json', (m) => {
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => a.path !== file);
    });
    expect(check().some((p) => p.includes(`SBOM ${file} is not bound`))).toBe(true);
    expect(checkDefective()).toEqual([]);
  });
});
