/**
 * A COMPLETE, PASSING C15/C16 evidence pair for the C16-R3.4 controls.
 *
 * ── WHY THIS REPLACES THE R3.3 FIXTURE ────────────────────────────────────────────
 * The R3.3 fixture claimed `counts.nodes: 195` while shipping `components: []`. The verifier
 * of the day never looked, so the fixture that "proved" it worked was itself false evidence —
 * the third time that defect class appeared in this codebase.
 *
 * Nothing here is invented where it can be derived:
 *   * the C16 half comes from `deriveC16Expectation()` — the real lockfile, the real
 *     descriptor, real reconciliation and the real byte-identical SBOMs, graph and all;
 *   * the images come from `docker-compose.yml`;
 *   * the argv come from the tracked `expectedStepContract()`, with tokens expanded to this
 *     fixture's paths — so a control that alters an argument alters it away from the contract
 *     rather than away from a hand-copied string;
 *   * the trivy image reports are SYNTHESIZED FROM THE TRACKED DISPOSITION RECORDS, so
 *     reconstructing findings from them and reconciling against those records comes out clean
 *     for the same reason it does on a real run;
 *   * the scanner digest chain is anchored on the tracked pins;
 *   * the cache fingerprint is built exactly as `trivy-cache.mjs fingerprint()` builds it.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import {
  loadSourceContract, expectedStepContract, imageStepIdsFor, ARGV_TOKENS, SCAN_PLATFORMS,
} from '../../../../../scripts/gate/lib/verification-contract.mjs';
import { deriveC16Expectation } from '../../../../../scripts/gate/generate-closures.mjs';
import { loadScannerExclusions } from '../../../../../scripts/gate/lib/scanner-exclusions.mjs';
import { npmPurl } from '../../../../../scripts/gate/lib/lock-closure.mjs';
import { candidateSourceManifest } from '../../../../../scripts/gate/lib/candidate-source.mjs';

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/**
 * The real platform children of the two configured indexes (the derived maintenance images pinned
 * on 2026-09-10; each index has exactly these two runnable children and no attestation manifests).
 * Keyed by the image name as it appears in docker-compose.yml, before the `@`.
 */
const CHILDREN: Record<string, { amd64: string; arm64: string; size: number }> = {
  'ghcr.io/a-halawany/elven/postgres': {
    amd64: 'sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a',
    arm64: 'sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc',
    size: 2189,
  },
  'ghcr.io/a-halawany/elven/redis': {
    amd64: 'sha256:0c0a48ddfcea413916152bc64e91c665d0822053099d9bc385a4747d71609432',
    arm64: 'sha256:c11d75cace5d4effc9524e6baa11f559440f398e6f53899332557bf455ad56dc',
    size: 1809,
  },
};
/** The child of `name` for a scanned platform — the same selection the runner makes. */
const childDigestFor = (name: string, platform: string): string =>
  (platform === 'linux/arm64' ? CHILDREN[name].arm64 : CHILDREN[name].amd64);

export type BuiltR34 = {
  c15Dir: string;
  c16Dir: string;
  expectedSha: string;
  imageRefs: string[];
  scanRefs: string[];
  imageStepIds: string[];
  sbomFileFor: (target: string) => string;
  producerOutDir: string;
  runDate: string;
};

/**
 * Turn the tracked disposition records into a trivy image report whose reconstructed findings
 * are exactly the findings those records govern.
 */
/**
 * R3.4.4: the image reports are the REAL captured scanner output.
 *
 * `fixtures/real-image-results.json` holds the complete, unsampled Results arrays from a real
 * C15 run against the images pinned on 2026-09-10 - 53 alpine packages and NO OS finding for
 * postgres, 4 gobinary packages and 22 findings for its gosu binary, 22 alpine packages and no
 * finding for redis. Synthesising these would defeat the point: a control that mutates invented
 * data proves nothing about what the verifier does to a real receipt.
 *
 * Only the scan reference is substituted, because it is derived per run from the tracked
 * digest pins rather than fixed in the capture.
 */
const REAL_IMAGE_RESULTS = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'real-image-results.json'), 'utf8'),
) as Record<string, { OS: { Family: string; Name: string }; Results: any[] }>;

function trivyReportForImage(_records: any[], pinnedRef: string, childDigest: string, index: number) {
  const scanRef = `${pinnedRef.slice(0, pinnedRef.indexOf('@'))}@${childDigest}`;
  const captured = REAL_IMAGE_RESULTS[String(index)];
  const os = captured.OS;
  const Results = captured.Results.map((r) => (r.Class === 'os-pkgs'
    // The OS result names the image it scanned, so it must name THIS derived reference.
    ? { ...r, Target: `${scanRef} (${os.Family} ${os.Name})` }
    : { ...r }));
  return {
    SchemaVersion: 2,
    ArtifactName: scanRef,
    ArtifactType: 'container_image',
    Metadata: { Reference: scanRef, RepoDigests: [scanRef], OS: os },
    Results,
  };
}

/**
 * The source derivation is expensive — it parses the whole lockfile and builds both closures —
 * and it is deterministic for a given (repo, asOfDate). Building it once per process instead of
 * once per test took the R3.4 suite from minutes (which starved the concurrently running C15
 * behavioural controls until the runner was killed) to seconds.
 */
/**
 * Identified packages, shaped as real trivy emits them. R3.4.3 §A requires Name, Version and
 * an Identifier.PURL on every package, and `AnalyzedBy` naming the analyzer that produced it.
 */
/**
 * R3.4.3 §B: a filesystem scan announces the scanners it enables, and deleting that stderr
 * removed the only evidence they were on. Both filesystem steps must carry the banner.
 */
const TRIVY_FS_BANNER = [
  '2026-01-01T00:00:00Z\tINFO\t[vuln] Vulnerability scanning is enabled',
  '2026-01-01T00:00:00Z\tINFO\t[misconfig] Misconfiguration scanning is enabled',
  '2026-01-01T00:00:00Z\tINFO\t[secret] Secret scanning is enabled',
  '2026-01-01T00:00:00Z\tINFO\t[pnpm] Detecting vulnerabilities...',
  '',
].join('\n');
// R3.4.4: the image command declares `--scanners vuln,secret`, so its receipt says so.
const TRIVY_IMAGE_BANNER = [
  '2026-01-01T00:00:00Z\tINFO\t[vuln] Vulnerability scanning is enabled',
  '2026-01-01T00:00:00Z\tINFO\t[secret] Secret scanning is enabled',
  '',
].join('\n');
/**
 * The stderr banner a step must carry. Derived from the step id rather than enumerated, so it
 * does not have to be re-listed every time the image step count changes — one image step per
 * (platform, image) pair, and every one of them announces its scanners.
 */
const scannerBannerFor = (id: string): string => {
  if (id === 'trivy-fs' || id === 'trivy-fs-json') return TRIVY_FS_BANNER;
  if (id.startsWith('trivy-image-')) return TRIVY_IMAGE_BANNER;
  return `${id}: fixture stderr\n`;
};

/**
 * R3.4.4: the COMPLETE lockfile universe, derived from source rather than listed.
 *
 * R3.4.3's fixture carried two hand-written packages, which was enough only because the
 * verifier sampled five. The verifier now measures the reported set against the lockfile
 * universe and the production closure, so the fixture must carry the whole thing - every
 * package pnpm-lock.yaml resolves, identified exactly as trivy identifies it.
 */
function lockfilePackages(repo: string, runDate: string) {
  const { derived } = derivationFor(repo, runDate);
  return [...(derived.lockUniverse as Set<string>)].sort().map((id) => {
    const at = id.lastIndexOf('@');
    const name = id.slice(0, at);
    const version = id.slice(at + 1);
    return {
      ID: id,
      Name: name,
      Version: version,
      Identifier: { PURL: npmPurl(name, version), UID: sha256(id).slice(0, 16) },
      Relationship: 'indirect',
      AnalyzedBy: 'pnpm',
    };
  });
}


const derivationCache = new Map<string, { contract: any; derived: any }>();
function derivationFor(repo: string, runDate: string) {
  const key = `${repo}\u0000${runDate}`;
  let hit = derivationCache.get(key);
  if (hit === undefined) {
    hit = {
      contract: loadSourceContract(repo),
      derived: deriveC16Expectation({ root: repo, asOfDate: runDate }),
    };
    derivationCache.set(key, hit);
  }
  return hit;
}

/**
 * `shape: 'r341'` (default) builds a package for the CURRENT contract: relative scanner
 * arguments, shipped raw OCI index bytes, a bound candidate-source manifest.
 *
 * `shape: 'r34'` builds the package R3.4 expected — absolute scan arguments, no index bytes, no
 * candidate manifest. The §A mutation controls apply the same mutation to both, so
 * "frozen R3.4 accepted this" is an unfiltered claim about the mutation rather than a claim
 * filtered around R3.4 not knowing about the new artifacts.
 */
/**
 * `platforms` builds the package for a RESTRICTED platform set.
 *
 * The gate scans every child in `SCAN_PLATFORMS`, so that is the default and the shape the LIVE
 * verifier expects. The FROZEN historical verifiers are byte copies written when the gate scanned
 * one child; they are never edited, so they cannot validate a two-platform package — not because
 * the package is wrong, but because the shape postdates them. A control that runs one mutation
 * through both verifiers therefore builds the same evidence twice: once live-shaped, and once
 * with `platforms: ['linux/amd64']`, which is that evidence in the shape the frozen verifier was
 * written for. Restricting the set here is a FIXTURE affordance only; the runner and the live
 * verifier both read the tracked list and neither can be narrowed.
 */
export function buildPassingR34Evidence(
  root: string, repo: string, opts: { shape?: 'r34' | 'r341'; platforms?: string[] } = {},
): BuiltR34 {
  const shape = opts.shape ?? 'r341';
  const c15 = join(root, 'c15');
  const c16 = join(root, 'c16');
  const cache = join(root, 'trivy-cache');
  mkdirSync(c15, { recursive: true });
  mkdirSync(c16, { recursive: true });
  mkdirSync(cache, { recursive: true });

  /**
   * The fixture's run window must not predate the NEWEST tracked disposition.
   *
   * The final-manifest verifier re-validates the current tracked records against the evidence
   * package's own run date, and a record approved in the future of that date is correctly refused.
   * R3.4.5 moved this to 2026-08-15 when SCX-0004 was approved 2026-08-14; the CVE-2026-14456
   * maintenance change added SCX-0006..0009 approved 2026-09-01; the 2026-09-10 re-pin to the
   * derived images re-issued SCX-0002..0005 (approved 2026-09-10) and retired the rest, so it
   * moves again.
   *
   * The literal is deliberate. It has to be changed on purpose whenever a disposition is added,
   * which is exactly the coupling that makes a stale fixture fail loudly instead of quietly
   * verifying an evidence package against records it never saw.
   */
  const runDate = '2026-09-10';
  const { contract, derived } = derivationFor(repo, runDate);
  const candidateManifest = candidateSourceManifest(repo);
  const expectedSha = derived.meta.sourceSha as string;

  // ── staged binaries: the paths the producer-out-dir derivation reads ────────────
  const stagedDir = join(c15, '.staged-scanners');
  mkdirSync(stagedDir, { recursive: true });
  const stagedPath: Record<string, string> = {};
  const trackedDigest: Record<string, string> = {};
  for (const tool of contract.scannerNames) {
    const artifacts = contract.scanners[tool].artifacts as Record<string, { executable_sha256: string }>;
    const hostKey = Object.keys(artifacts).find((k) =>
      contract.scannerNames.every((t: string) =>
        (contract.scanners[t].artifacts as Record<string, unknown>)[k] !== undefined))!;
    trackedDigest[tool] = artifacts[hostKey].executable_sha256;
    stagedPath[tool] = join(stagedDir, tool);
    writeFileSync(stagedPath[tool], `${tool} staged bytes`);
  }
  const hostKey = Object.keys(contract.scanners[contract.scannerNames[0]].artifacts as object)
    .find((k) => contract.scannerNames.every((t: string) =>
      (contract.scanners[t].artifacts as Record<string, unknown>)[k] !== undefined))!;

  // ── §A1: the AUTHENTIC raw OCI index bytes, copied from the recorded trace. Their digests
  // really are the ones the configured references pin, so the verifier derives the scanned
  // child from them exactly as it does on a real run.
  const traceStreams = join(repo, 'apps/api/test/gate/fixtures/c15-trace/streams');

  // ── images and platform resolution, from Compose ────────────────────────────────
  const imageRefs: string[] = contract.imageRefs;
  const platforms = opts.platforms ?? [...(SCAN_PLATFORMS as readonly string[])];
  /**
   * One (platform, image) pair per image step, PLATFORM-MAJOR — the order the runner numbers
   * `trivy-image-<i>` in, and the order the verifier rebuilds from tracked source.
   */
  const scanPairs = platforms.flatMap((platform) =>
    imageRefs.map((ref, imageIndex) => ({ platform, ref, imageIndex })));
  const scanRefs = scanPairs.map(({ platform, ref }) => {
    const name = ref.slice(0, ref.indexOf('@'));
    return `${name}@${childDigestFor(name, platform)}`;
  });
  const scanPlatforms = scanPairs.map((p) => p.platform);
  if (shape === 'r341') {
    // ONE index document per IMAGE: the same bytes whichever child is selected from them.
    imageRefs.forEach((_ref, i) => {
      writeFileSync(join(c15, `oci-index-${i}.json`), readFileSync(join(traceStreams, `oci-index-${i}.json`)));
    });
  }
  const imagePlatformResolution = scanPairs.map(({ platform, ref, imageIndex }, i) => {
    const digest = ref.slice(ref.indexOf('@') + 1);
    const name = ref.slice(0, ref.indexOf('@'));
    return {
      pinned_ref: ref,
      scan_platform: platform,
      ...(shape === 'r341' ? { raw_index_file: `oci-index-${imageIndex}.json` } : {}),
      scan_ref: scanRefs[i],
      pinned_digest: digest,
      raw_index_digest: digest,
      raw_index_digest_matches_reference: true,
      resolution: {
        ref, resolved: true, kind: 'index',
        media_type: 'application/vnd.oci.image.index.v1+json',
        index_raw_sha256: digest.slice('sha256:'.length),
        child_count: 2, runnable_platform_count: 2,
        target_digest: childDigestFor(name, platform),
        // Mirrors the raw index bytes copied above: two runnable children, no attestations.
        children: [
          {
            digest: CHILDREN[name].amd64,
            media_type: 'application/vnd.oci.image.manifest.v1+json',
            os: 'linux', architecture: 'amd64', variant: null, size: CHILDREN[name].size, attestation: false,
          },
          {
            digest: CHILDREN[name].arm64,
            media_type: 'application/vnd.oci.image.manifest.v1+json',
            os: 'linux', architecture: 'arm64', variant: null, size: CHILDREN[name].size, attestation: false,
          },
        ],
      },
    };
  });

  // ── argv from the tracked contract, tokens expanded to this fixture ─────────────
  const expand = (argv: string[]) => argv.map((a) => (shape === 'r34'
    ? (a === '.' ? repo : a === '.gitleaks.toml' ? `${repo}/.gitleaks.toml` : a)
    : a))
    .map((a) => a
    .replaceAll(ARGV_TOKENS.STAGED_GITLEAKS, stagedPath.gitleaks)
    .replaceAll(ARGV_TOKENS.STAGED_TRIVY, stagedPath.trivy)
    .replaceAll(ARGV_TOKENS.TRIVY_CACHE, cache)
    .replaceAll(ARGV_TOKENS.OUT_DIR, c15)
    .replaceAll(ARGV_TOKENS.REPO_ROOT, repo)
    .replaceAll(ARGV_TOKENS.CHECK_WARM_DIR, join(root, 'eye-trivy-checkwarm-fixture')));
  const stepContract = expectedStepContract({ scanRefs, scanPlatforms });

  // ── raw outputs ────────────────────────────────────────────────────────────────
  const records = (loadScannerExclusions(repo) as { doc: { records: any[] } }).doc.records;
  const imageStepIds = imageStepIdsFor(imageRefs.length * platforms.length);
  const rawFor = new Map<string, string>();
  rawFor.set('pnpm-audit-human.stdout.txt', 'No known vulnerabilities found\n');
  // R3.4.4: the audit must describe the tree it audited, and its totals must agree with the
  // source-derived lockfile universe.
  const lockSize = (derivationFor(repo, runDate).derived.lockUniverse as Set<string>).size;
  rawFor.set('pnpm-audit-json.stdout.txt', `${JSON.stringify({
    advisories: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      dependencies: 182,
      devDependencies: 122,
      optionalDependencies: 79,
      totalDependencies: lockSize,
    },
  })}\n`);
  rawFor.set('gitleaks-worktree.stdout.txt', '');
  rawFor.set('gitleaks-history.stdout.txt', '');
  // §3: a real-shaped trivy Report Summary listing the same target the JSON analysed, with
  // zero findings — the cross-check the verifier performs.
  rawFor.set('trivy-fs.stdout.txt', [
    'Report Summary', '',
    '┌────────────────┬──────┬─────────────────┬─────────┬───────────────────┐',
    '│     Target     │ Type │ Vulnerabilities │ Secrets │ Misconfigurations │',
    '├────────────────┼──────┼─────────────────┼─────────┼───────────────────┤',
    '│ pnpm-lock.yaml │ pnpm │        0        │    -    │         -         │',
    '└────────────────┴──────┴─────────────────┴─────────┴───────────────────┘', '',
  ].join('\n'));
  // §1: full identity and real coverage — the candidate root, the expected commit, and the
  // analysed lockfile.
  rawFor.set('trivy-fs-json.stdout.txt', `${JSON.stringify({
    SchemaVersion: 2,
    ArtifactName: '.',
    ArtifactType: 'repository',
    Metadata: { RepoURL: 'https://github.com/a-Halawany/elven', Branch: 'main', Commit: expectedSha },
    Results: [{
      Target: 'pnpm-lock.yaml',
      Class: 'lang-pkgs',
      Type: 'pnpm',
      // R3.4.3 §A: a result that names a file without listing what was analysed in it is a
      // label, not a scan. Real trivy emits an identified package per lockfile entry.
      Packages: lockfilePackages(repo, runDate),
      Vulnerabilities: [],
    }],
  })}\n`);
  scanPairs.forEach(({ platform, ref }, i) => {
    const name = ref.slice(0, ref.indexOf('@'));
    rawFor.set(`${imageStepIds[i]}.stdout.txt`,
      `${JSON.stringify(trivyReportForImage(records, ref, childDigestFor(name, platform), i), null, 2)}\n`);
  });
  rawFor.set('trivy-acquire-db.stdout.txt', '');
  rawFor.set('trivy-acquire-checks.stdout.txt', '{}\n');

  // The tracked contract's normal-step list covers every platform in SCAN_PLATFORMS; a fixture
  // built for a restricted platform set carries only the image steps it actually has.
  const normalStepIds = [
    ...(contract.normalStepIds as string[]).filter((id) => !id.startsWith('trivy-image-')),
    ...imageStepIds,
  ];
  const allStepIds = [
    ...normalStepIds,
    ...(contract.acquisitionStepIds as string[]),
  ];
  const makeStep = (id: string, isNormal: boolean) => {
    const want = stepContract[id];
    const stdoutName = `${id}.stdout.txt`;
    const stderrName = `${id}.stderr.txt`;
    writeFileSync(join(c15, stdoutName), rawFor.get(stdoutName) ?? '');
    writeFileSync(join(c15, stderrName), scannerBannerFor(id));
    const so = readFileSync(join(c15, stdoutName));
    const se = readFileSync(join(c15, stderrName));
    const base: Record<string, unknown> = {
      id,
      argv: expand(want.argv),
      exit_code: 0, signal: null,
      stdout_file: stdoutName, stdout_bytes: so.length, stdout_sha256: sha256(so),
      stderr_file: stderrName, stderr_bytes: se.length, stderr_sha256: sha256(se),
    };
    base.tool_version = contract.toolVersions[want.tool];
    if (isNormal) {
      base.cwd = '<repo root>';
      base.tool = want.tool;
      base.policy = want.policy;
      base.coverage = want.coverage ?? null;
      base.failed = false;
      base.source_sha = expectedSha;
    }
    return base;
  };
  const steps = normalStepIds.map((id) => makeStep(id, true));
  const acquisitionSteps = (contract.acquisitionStepIds as string[]).map((id) => makeStep(id, false));

  // Governed reports.
  writeFileSync(join(c15, 'RESULT-PASS.txt'), 'C15 PASS\n');
  writeFileSync(join(c15, 'gitleaks-worktree.json'), '[]');
  writeFileSync(join(c15, 'gitleaks-history.json'), '[]');
  // image-findings.json must EQUAL the reconstruction from the raw reports above.
  const { findingsFromTrivyJson, reconcileFindings, validateRecords } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    require('../../../../../scripts/gate/lib/scanner-exclusions.mjs');
  /**
   * A package built for a RESTRICTED platform set is for a frozen verifier, and that verifier
   * reconstructs findings by calling `findingsFromTrivyJson(text, ref)` with no platform — so
   * its findings carry `scan_platform: null`. The fixture must match, or the equality check
   * fails on a field that verifier's era did not have. The live-shaped package carries the real
   * platform, which is what makes an amd64 row distinguishable from its arm64 twin.
   */
  const legacyShape = opts.platforms !== undefined;
  const reconstructed: unknown[] = [];
  scanPairs.forEach(({ platform, ref }, i) => {
    reconstructed.push(
      ...findingsFromTrivyJson(rawFor.get(`${imageStepIds[i]}.stdout.txt`)!, ref,
        legacyShape ? undefined : platform),
    );
  });
  writeFileSync(join(c15, 'image-findings.json'), `${JSON.stringify(reconstructed, null, 2)}\n`);

  const exclusionDoc = (loadScannerExclusions(repo) as { doc: unknown }).doc;
  const validation = validateRecords(exclusionDoc, {
    runDate, root: repo, isTracked: () => true,
    readEvidence: (rel: string) => { try { return readFileSync(join(repo, rel)); } catch { return null; } },
  });
  const disposition = reconcileFindings(exclusionDoc, reconstructed, {
    scanPlatform: 'linux/amd64', scanPlatforms: platforms,
    fatalIndices: validation.fatalIndices,
  });

  // ── cache fingerprint, built as trivy-cache.mjs builds it ───────────────────────
  const entries = [
    { path: 'db/metadata.json', present: true, bytes: 150, sha256: sha256('db metadata') },
    { path: 'db/trivy.db', present: true, bytes: 1232056320, sha256: sha256('db artifact') },
    { path: 'policy/metadata.json', present: true, bytes: 152, sha256: sha256('policy metadata') },
  ];
  const checksManifest = [
    { path: 'policy/content/a.yaml', bytes: 11, sha256: sha256('check a') },
    { path: 'policy/content/b.yaml', bytes: 22, sha256: sha256('check b') },
  ];
  const fingerprint = () => ({
    digest: sha256(JSON.stringify({ entries, checksManifest })),
    entries,
    checks_content: {
      files: checksManifest.length,
      bytes: checksManifest.reduce((a, f) => a + f.bytes, 0),
      manifest_sha256: sha256(JSON.stringify(checksManifest)),
    },
    checks_manifest: checksManifest,
  });

  const verified: Record<string, unknown> = {};
  const stagedAfter: Record<string, unknown> = {};
  const stagedBinaries: Record<string, unknown> = {};
  for (const tool of contract.scannerNames) {
    const d = trackedDigest[tool];
    verified[tool] = {
      resolved_path: `/usr/local/bin/${tool}`,
      actual_sha256: d, expected_sha256: d, staged_sha256: d,
      match: true, authenticated_before_first_execution: true, staged_path: stagedPath[tool],
    };
    stagedAfter[tool] = { staged_path: stagedPath[tool], sha256_after: d, expected: d, match: true };
    stagedBinaries[tool] = { staged_path: stagedPath[tool], actual_sha256: d, expected_sha256: d, match: true };
  }

  const bind = (dir: string, names: string[]) => names.map((name) => {
    const bytes = readFileSync(join(dir, name));
    return { path: name, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const c15Names = [
    'RESULT-PASS.txt', 'gitleaks-worktree.json', 'gitleaks-history.json', 'image-findings.json',
    ...(shape === 'r341' ? imageRefs.map((_r, i) => `oci-index-${i}.json`) : []),
    ...[...steps, ...acquisitionSteps].flatMap((s) => [s.stdout_file as string, s.stderr_file as string]),
  ];

  // C16-R3.4 §1.3: the governed disposition binding the verifier now requires. Read from the
  // TRACKED document, so the fixture cannot drift from what the gate actually governs.
  const exclusionsRaw = readFileSync(join(repo, 'scripts/gate/scanner-exclusions.json'));
  const exclusionsDoc = JSON.parse(exclusionsRaw.toString('utf8')) as {
    schema_version: string; records: unknown[];
  };

  const c15Manifest = {
    artifact: 'C15 supply-chain gate — raw execution evidence',
    scanner_exclusions: {
      file: 'scripts/gate/scanner-exclusions.json',
      canonical_path: 'scripts/gate/scanner-exclusions.json',
      is_governed_default: true,
      sha256: sha256(exclusionsRaw),
      schema_version: exclusionsDoc.schema_version,
      declared: exclusionsDoc.records.length,
    },
    mode: 'final', outcome: 'PASS', source_sha: expectedSha,
    host_platform_key: hostKey,
    scan_platform: 'linux/amd64',
    scan_platforms: [...platforms],
    digest_pinned_images: [...imageRefs],
    image_platform_resolution: imagePlatformResolution,
    trivy_cache_dir: cache,
    // §A3: the real candidate manifest for this checkout, so the verifier's recomputation
    // matches for the same reason it does on a real run.
    ...(shape === 'r341'
      ? { candidate_source: { ...candidateManifest, expected_sha: expectedSha }, candidate_source_after: candidateManifest }
      : {}),
    tree_clean_at_run: true, tree_clean_after_scanning: true, worktree_unchanged_by_scanning: true,
    trivy_cache_unchanged: true,
    trivy_cache_fingerprint_before: fingerprint(),
    trivy_cache_fingerprint_after: fingerprint(),
    trivy_cache_acquisition: { cacheDir: cache, steps: acquisitionSteps },
    failures: [],
    pinned_toolchain: Object.fromEntries(
      contract.scannerNames.map((t: string) => [t, { actual: contract.toolVersions[t], expected: contract.toolVersions[t] }]),
    ),
    executed_binary_authentication: { verified },
    staged_scanner_binaries: stagedBinaries,
    staged_tools_after_scanning: stagedAfter,
    steps,
    started_at: `${runDate}T00:00:00.000Z`,
    finished_at: `${runDate}T00:10:00.000Z`,
    evidence_artifacts: bind(c15, c15Names),
    image_finding_reconciliation: disposition,
    step_policy_audit: { every_informational_step_duplicates_a_blocking_step: true },
  };
  writeFileSync(join(c15, 'supply-chain-manifest.json'), JSON.stringify(c15Manifest, null, 2));

  // ── C16: the REAL derivation, SBOM bytes and all ────────────────────────────────
  writeFileSync(join(c16, 'RESULT-PASS.txt'), 'C16 PASS\n');
  const c16Names = ['RESULT-PASS.txt'];
  const targets: Record<string, unknown> = {};
  for (const [name, report] of Object.entries(derived.reports as Record<string, any>)) {
    writeFileSync(join(c16, report.sbom_file), derived.sbomTexts[name]);
    c16Names.push(report.sbom_file);
    targets[name] = {
      ...report,
      target: { ...report.target },
    };
  }
  const c16Manifest = {
    status: 'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA',
    generated_from: { source_sha: expectedSha, run_date: runDate },
    final_source_posture: { expected_sha: expectedSha, head_sha: expectedSha, worktree_clean: true },
    targets,
    vulnerable_residuals: [],
    governed_exclusions: { rejected: [], cardinality_problems: [] },
    evidence_artifacts: bind(c16, c16Names),
  };
  writeFileSync(join(c16, 'closure-reconciliation.json'), JSON.stringify(c16Manifest, null, 2));

  return {
    c15Dir: c15, c16Dir: c16, expectedSha, imageRefs, scanRefs, imageStepIds,
    sbomFileFor: (t: string) => (derived.reports as Record<string, any>)[t].sbom_file,
    producerOutDir: c15, runDate,
  };
}

/** Read, mutate and rewrite a manifest in place. */
export function editManifest(dir: string, name: string, mutate: (m: Record<string, any>) => void) {
  const path = join(dir, name);
  const m = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  mutate(m);
  writeFileSync(path, JSON.stringify(m, null, 2));
}

/** Rewrite an artifact binding so only the mutation under test is out of place. */
export function rebind(dir: string, manifestName: string, rel: string) {
  const bytes = readFileSync(join(dir, rel));
  editManifest(dir, manifestName, (m) => {
    const a = m.evidence_artifacts.find((x: any) => x.path === rel);
    if (a !== undefined) { a.bytes = bytes.length; a.sha256 = sha256(bytes); }
  });
}

/**
 * Rewrite one bound artifact in EVERY copy of a package and repair every claim about it.
 *
 * A control that runs one mutation through the live verifier and a frozen one now has two
 * copies of the same evidence — live-shaped, and single-platform-shaped for the frozen verifier,
 * which was written before the gate scanned a second child. The mutation must land in both, or
 * the two verifiers are not being shown the same thing. The manifests differ between the copies
 * (different step sets), so each is repaired from its own bytes rather than copied.
 */
export function replaceBoundInAll(dirs: string[], rel: string, text: string): void {
  for (const dir of dirs) {
    writeFileSync(join(dir, rel), text);
    const bytes = readFileSync(join(dir, rel));
    const digest = sha256(bytes);
    editManifest(dir, 'supply-chain-manifest.json', (m) => {
      const a = m.evidence_artifacts.find((x: { path: string }) => x.path === rel);
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
  }
}
