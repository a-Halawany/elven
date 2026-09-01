/**
 * GATE-2.2 C15 CARRY-FORWARD (closed under C16) — SCANNER AND TARGET PROVENANCE.
 *
 * Three C15 evidence gaps are closed and controlled here.
 *
 *  A. MULTI-ARCH RESOLUTION. The compose pins are OCI image INDEXES, so "we scanned
 *     the digest-pinned image" did not say WHICH manifest was scanned: a scanner with
 *     no --platform follows the HOST, meaning an arm64 workstation scanned the arm64
 *     child while CI (ubuntu-latest, and the C16 target) runs linux/amd64. Those
 *     children have different layers and therefore different findings.
 *
 *  B. STEP-POLICY HONESTY. "eight steps, six blocking" reads as though two scans were
 *     permitted to fail. The two non-blocking steps are alternate output FORMATS of
 *     scans that already ran under a blocking policy with the same pinned tool. That
 *     claim is now machine-checked, and a non-blocking step that added coverage
 *     nothing blocking enforces fails the gate.
 *
 *  C. SCANNER IDENTITY. A --version string is a claim the binary makes about itself.
 *     The gate now records the resolved path and SHA-256 of each scanner executable,
 *     plus trivy's vulnerability-database identity and freshness.
 *
 * The controls below use FIXTURES for the index-resolution logic (no daemon, no
 * network), and assert against the real runner source for the wiring.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { platformPinnedRef, classifyStepPolicies, INFORMATIONAL_DUPLICATES, enforceTrivyDatabase, MAX_VULN_DB_AGE_HOURS } from '../../../../scripts/gate/lib/scanner-provenance.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { enforce, frozenCacheArgs, fingerprint, acquire } from '../../../../scripts/gate/lib/trivy-cache.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { reconcileFindings, validateRecords, REQUIRED_FIELDS, FIELD_TYPES } from '../../../../scripts/gate/lib/scanner-exclusions.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
/** Module-level scratch directories, removed at the end of the file's run. */
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const runnerSource = (): string => readFileSync(join(REPO, 'scripts', 'gate', 'supply-chain.mjs'), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-A — container scans name the exact per-platform child manifest', () => {
  it('the runner pins the scan platform to the deployment platform, not the host', () => {
    const src = runnerSource();
    expect(src).toContain("const SCAN_PLATFORM = 'linux/amd64'");
    // The pinned digest alone is NOT what gets scanned; the resolved child is.
    expect(src).toContain("'--platform', SCAN_PLATFORM");
    // C16-R3.4: resolution now crosses the execution adapter, so assert the ADAPTER call
    // rather than a direct one. The behaviour — that the resolved child, not the pinned index,
    // is what gets scanned — is proven end-to-end in c15-runner-behaviour.test.ts.
    expect(src).toContain('ADAPTER.resolveImage(image, SCAN_PLATFORM)');
    expect(src).toContain('platformPinnedRef(image, resolution)');
    expect(src).toContain('r.scan_ref');
  });

  it('a reference whose platform child cannot be resolved fails the gate closed', () => {
    const src = runnerSource();
    expect(src).toContain('cannot resolve a ${SCAN_PLATFORM} child manifest');
    expect(src).toContain('A scan that cannot name the manifest it examined is not evidence.');
  });

  it('platformPinnedRef rewrites the reference to the resolved child digest', () => {
    const pinned = 'postgres@sha256:' + 'a'.repeat(64);
    const child = 'sha256:' + 'b'.repeat(64);
    expect(platformPinnedRef(pinned, { target_digest: child })).toBe(`postgres@${child}`);
    // No child for the target platform means no reference to scan — never a silent
    // fallback to the index or to the host's architecture.
    expect(platformPinnedRef(pinned, { target_digest: null })).toBeNull();
  });

  it('buildkit attestation manifests are never mistaken for a platform child', () => {
    const src = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'scanner-provenance.mjs'), 'utf8');
    // unknown/unknown children are attestations, not runnable images.
    expect(src).toContain("m.platform?.os === 'unknown' && m.platform?.architecture === 'unknown'");
    expect(src).toContain('(c) => !c.attestation && c.os === wantOs');
  });

  it('the compose pins the gate resolves are digest pins, not tags', () => {
    const compose = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8');
    const images = [...compose.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]!);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image, `${image} must be digest-pinned`).toMatch(/@sha256:[a-f0-9]{64}$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-B — "eight steps, six blocking" is machine-checked, not asserted in prose', () => {
  const step = (id: string, policy: string, tool: string) => ({ id, policy, tool });

  it('the two non-blocking steps duplicate blocking scans by the same tool', () => {
    const audit = classifyStepPolicies([
      step('pnpm-audit-human', 'blocking', 'pnpm'),
      step('pnpm-audit-json', 'informational', 'pnpm'),
      step('gitleaks-worktree', 'blocking', 'gitleaks'),
      step('gitleaks-history', 'blocking', 'gitleaks'),
      step('trivy-fs', 'blocking', 'trivy'),
      step('trivy-fs-json', 'informational', 'trivy'),
      step('trivy-image-0', 'blocking', 'trivy'),
      step('trivy-image-1', 'blocking', 'trivy'),
    ]) as {
      total_steps: number; blocking_steps: number; informational_steps: number;
      every_informational_step_duplicates_a_blocking_step: boolean;
      unblocked_coverage_problems: string[];
      informational_classification: Array<{ id: string; duplicates_blocking_step: string; adds_unblocked_coverage: boolean }>;
    };
    expect(audit.total_steps).toBe(8);
    expect(audit.blocking_steps).toBe(6);
    expect(audit.informational_steps).toBe(2);
    expect(audit.every_informational_step_duplicates_a_blocking_step).toBe(true);
    expect(audit.unblocked_coverage_problems).toEqual([]);
    expect(audit.informational_classification.map((c) => `${c.id}->${c.duplicates_blocking_step}`).sort())
      .toEqual(['pnpm-audit-json->pnpm-audit-human', 'trivy-fs-json->trivy-fs']);
    for (const c of audit.informational_classification) expect(c.adds_unblocked_coverage).toBe(false);
  });

  it('CONTROL: a non-blocking step with no blocking counterpart is rejected', () => {
    const audit = classifyStepPolicies([
      step('trivy-fs', 'blocking', 'trivy'),
      step('trivy-secret-only', 'informational', 'trivy'),
    ]) as { every_informational_step_duplicates_a_blocking_step: boolean; unblocked_coverage_problems: string[] };
    expect(audit.every_informational_step_duplicates_a_blocking_step).toBe(false);
    expect(audit.unblocked_coverage_problems.join(' ')).toMatch(/declares no blocking step/);
  });

  it('CONTROL: a step duplicating another step that is ALSO non-blocking is rejected', () => {
    const audit = classifyStepPolicies([
      step('trivy-fs', 'informational', 'trivy'),
      step('trivy-fs-json', 'informational', 'trivy'),
    ]) as { every_informational_step_duplicates_a_blocking_step: boolean; unblocked_coverage_problems: string[] };
    expect(audit.every_informational_step_duplicates_a_blocking_step).toBe(false);
    expect(audit.unblocked_coverage_problems.join(' ')).toMatch(/is not blocking/);
  });

  it('CONTROL: a step duplicating a step that never ran is rejected', () => {
    const audit = classifyStepPolicies([step('trivy-fs-json', 'informational', 'trivy')]) as {
      every_informational_step_duplicates_a_blocking_step: boolean; unblocked_coverage_problems: string[];
    };
    expect(audit.every_informational_step_duplicates_a_blocking_step).toBe(false);
    expect(audit.unblocked_coverage_problems.join(' ')).toMatch(/did not run/);
  });

  it('CONTROL: a cross-tool duplication claim is rejected', () => {
    const audit = classifyStepPolicies([
      step('pnpm-audit-human', 'blocking', 'pnpm'),
      step('pnpm-audit-json', 'informational', 'trivy'),
    ]) as { every_informational_step_duplicates_a_blocking_step: boolean; unblocked_coverage_problems: string[] };
    expect(audit.every_informational_step_duplicates_a_blocking_step).toBe(false);
    expect(audit.unblocked_coverage_problems.join(' ')).toMatch(/different tools/);
  });

  it('the declared duplication map covers exactly the JSON-format captures', () => {
    expect(INFORMATIONAL_DUPLICATES).toEqual({
      'pnpm-audit-json': 'pnpm-audit-human',
      'trivy-fs-json': 'trivy-fs',
    });
  });

  it('the runner fails closed on unenforced coverage rather than warning', () => {
    const src = runnerSource();
    expect(src).toContain('every_informational_step_duplicates_a_blocking_step');
    expect(src).toContain('step policy —');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-C — scanner identity and vulnerability-database freshness are recorded', () => {
  it('the runner records binary paths and digests for every scanner it invokes', () => {
    const src = runnerSource();
    // Since C16-R3.1 the scanners are STAGED and authenticated separately, so the
    // generic binary inventory covers the remaining tools only.
    expect(src).toContain("scannerBinaries(['pnpm', 'node', 'docker'])");
    expect(src).toContain('stageAuthenticatedTools');
    const lib = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'scanner-provenance.mjs'), 'utf8');
    expect(lib).toContain('binary_sha256');
    expect(lib).toContain('resolved_path');
  });

  it('the runner captures and ENFORCES cache provenance before the first scan', () => {
    const src = runnerSource();
    expect(src).toContain('ADAPTER.acquireCache({ cacheDir');
    expect(src).toContain('enforce(provenance,');
    // Enforcement precedes the first scan, so stale or absent data can never silently
    // produce an empty finding set. Behaviour is proven in c15-runner-behaviour.test.ts.
    expect(src.indexOf('enforce(provenance,'))
      .toBeLessThan(src.indexOf("'pnpm-audit-human'"));
  });

  /**
   * BEHAVIOURAL controls for the enforcement itself. Recording DB metadata without
   * acting on it means a scan against an absent or stale database still reports "ok" —
   * it simply finds nothing. These drive the production function with real inputs.
   */
  describe('enforceTrivyDatabase', () => {
    const fresh = (over: Record<string, unknown> = {}) => ({
      available: true,
      vulnerability_db: {
        schema_version: 2,
        built_at: '2026-08-11T07:08:26Z',
        next_update_due: '2026-08-12T07:08:26Z',
        downloaded_at: '2026-08-11T12:37:10Z',
        age_hours_at_scan: 6.7,
        past_next_update_at_scan: false,
        ...over,
      },
      misconfig_check_bundle: { digest: `sha256:${'1'.repeat(64)}`, downloaded_at: '2026-08-11T12:37:10Z' },
    });

    it('accepts a fresh, complete database (positive control)', () => {
      expect(enforceTrivyDatabase(fresh())).toEqual([]);
    });

    it('rejects an UNAVAILABLE database', () => {
      const problems = enforceTrivyDatabase({ available: false, error: 'trivy not found' }) as string[];
      expect(problems.join(' ')).toMatch(/UNAVAILABLE/);
      expect(enforceTrivyDatabase(null).length).toBeGreaterThan(0);
      expect(enforceTrivyDatabase(undefined).length).toBeGreaterThan(0);
    });

    it('rejects MALFORMED metadata', () => {
      expect((enforceTrivyDatabase(fresh({ schema_version: null })) as string[]).join(' '))
        .toMatch(/no schema version/);
      expect((enforceTrivyDatabase(fresh({ built_at: 'yesterday' })) as string[]).join(' '))
        .toMatch(/build time is malformed/);
      expect((enforceTrivyDatabase(fresh({ age_hours_at_scan: null })) as string[]).join(' '))
        .toMatch(/age could not be computed/);
      const noBundle = fresh();
      (noBundle as { misconfig_check_bundle: { digest: string | null } }).misconfig_check_bundle.digest = null;
      expect((enforceTrivyDatabase(noBundle) as string[]).join(' ')).toMatch(/check bundle reports no digest/);
    });

    it('rejects a database BEYOND the freshness window', () => {
      const problems = enforceTrivyDatabase(fresh({ age_hours_at_scan: MAX_VULN_DB_AGE_HOURS + 0.1 })) as string[];
      expect(problems.join(' ')).toMatch(/beyond the permitted/);
      // …and accepts one exactly at the boundary.
      expect(enforceTrivyDatabase(fresh({ age_hours_at_scan: MAX_VULN_DB_AGE_HOURS }))).toEqual([]);
    });

    it('rejects a database PAST its next-update time', () => {
      const problems = enforceTrivyDatabase(fresh({ past_next_update_at_scan: true })) as string[];
      expect(problems.join(' ')).toMatch(/past its next-update time/);
    });

    it('rejects a NEGATIVE age, where the host clock and the database disagree', () => {
      const problems = enforceTrivyDatabase(fresh({ age_hours_at_scan: -3 })) as string[];
      expect(problems.join(' ')).toMatch(/negative age/);
    });
  });

  it('the runner requires an expected SHA and a clean worktree in --final mode', () => {
    const src = runnerSource();
    expect(src).toContain('--final requires --expected-sha');
    expect(src).toContain('--final requires a clean worktree');
    // Arguments are VALIDATED up front now, so the flag is parsed rather than scanned.
    expect(src).toContain('BOOLEAN_FLAGS');
    expect(src).toContain('requires a value');
    // Behaviour is proven in c15-runner-behaviour.test.ts, which spawns the runner.
  });

  it('every step already records the exact command and a digest of its raw output', () => {
    const src = runnerSource();
    for (const field of ['argv', 'stdout_sha256', 'stderr_sha256', 'started_at', 'finished_at',
      'exit_code', 'tool_version', 'source_sha']) {
      expect(src, field).toContain(field);
    }
  });

  it('the pinned toolchain is verified before any scan runs, and fails closed', () => {
    const src = runnerSource();
    expect(src).toContain('toolchain not pinned');
    expect(src).toContain('A scan from an unknown scanner version is not evidence.');
    // The pin check precedes the first scan.
    expect(src.indexOf('toolchain not pinned')).toBeLessThan(src.indexOf("'pnpm-audit-human'"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-R2 — trivy cache provenance is captured from the SAME cache and enforced', () => {
  /** A fully-populated provenance record; each test breaks exactly one thing. */
  const good = (over: Record<string, unknown> = {}) => ({
    captured_at: '2026-08-12T00:00:00.000Z',
    target_platform: 'linux/amd64',
    cache_dir: '/tmp/cache',
    executable: { name: 'trivy', resolved_path: '/usr/local/bin/trivy', sha256: 'a'.repeat(64), bytes: 100 },
    reported_version: '0.73.0',
    version_probe_error: null,
    freshness_window_hours: 24,
    vulnerability_db: {
      metadata_present: true, metadata_error: null, metadata_byte_sha256: 'b'.repeat(64),
      schema_version: 2, built_at: '2026-08-11T19:13:09Z', next_update_due: '2026-08-12T19:13:09Z',
      downloaded_at: '2026-08-11T20:00:00Z', age_hours_at_scan: 5, past_next_update_at_scan: false,
      artifact: { present: true, bytes: 1, sha256: 'c'.repeat(64) },
    },
    checks_bundle: {
      metadata_present: true, metadata_error: null, metadata_byte_sha256: 'd'.repeat(64),
      oci_digest: `sha256:${'1'.repeat(64)}`, major_version: 2,
      downloaded_at: '2026-08-11T20:00:00Z', age_hours_at_scan: 4,
      reported_by_tool: `sha256:${'1'.repeat(64)}`,
    },
    ...over,
  });
  const enforceIt = (p: unknown) => enforce(p, { expectedVersion: '0.73.0' }) as string[];

  it('accepts a complete, fresh capture (positive control)', () => {
    expect(enforceIt(good())).toEqual([]);
  });

  it('rejects an ABSENT checks bundle — the exact hosted-CI failure', () => {
    // Run 31532067899 failed here: CI prefetched only the vulnerability DB, and trivy has
    // no --download-check-only, so the bundle was never acquired.
    const p = good({
      checks_bundle: { ...good().checks_bundle, metadata_present: false, oci_digest: null, reported_by_tool: null },
    });
    const problems = enforceIt(p);
    expect(problems.join(' ')).toMatch(/checks-bundle metadata is absent/);
    expect(problems.join(' ')).toMatch(/no --download-check-only/);
  });

  it('rejects an ABSENT vulnerability database and a missing DB artifact', () => {
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, metadata_present: false },
    })).join(' ')).toMatch(/vulnerability database metadata is absent/);
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, artifact: { present: false } },
    })).join(' ')).toMatch(/artifact is missing from the cache/);
  });

  it('rejects a MISSING NextUpdate, a stale DB and a past-due DB', () => {
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, next_update_due: null },
    })).join(' ')).toMatch(/no NextUpdate/);
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, age_hours_at_scan: 25 },
    })).join(' ')).toMatch(/beyond the permitted 24h window/);
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, past_next_update_at_scan: true },
    })).join(' ')).toMatch(/past its next-update time/);
    expect(enforceIt(good({
      vulnerability_db: { ...good().vulnerability_db, age_hours_at_scan: -2 },
    })).join(' ')).toMatch(/negative age/);
  });

  it('rejects a DIGEST DISAGREEMENT between the cache file and the tool', () => {
    const p = good({
      checks_bundle: { ...good().checks_bundle, reported_by_tool: `sha256:${'9'.repeat(64)}` },
    });
    expect(enforceIt(p).join(' ')).toMatch(/checks-bundle digest disagreement/);
  });

  it('rejects a version mismatch and an unresolvable or untrusted executable', () => {
    expect(enforceIt(good({ reported_version: '0.72.0' })).join(' ')).toMatch(/expected 0\.73\.0/);
    expect(enforceIt(good({
      executable: { ...good().executable, resolved_path: null },
    })).join(' ')).toMatch(/could not be resolved on PATH/);
    const untrusted = enforce(good(), {
      expectedVersion: '0.73.0', expectedBinarySha256: 'f'.repeat(64),
    }) as string[];
    expect(untrusted.join(' ')).toMatch(/does not match the trusted value/);
  });

  it('the authoritative scan flags disable BOTH updates and use the captured cache', () => {
    expect(frozenCacheArgs('/tmp/c')).toEqual([
      '--cache-dir', '/tmp/c', '--skip-db-update', '--skip-check-update',
    ]);
  });

  it('the tracked scanner pins carry real upstream checksums for the CI platform', () => {
    const pins = JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-pins.json'), 'utf8')) as {
      tools: Record<string, { version: string; artifacts: Record<string, { url: string; sha256: string }> }>;
      checksum_sources: Record<string, string>;
    };
    expect(pins.tools.trivy.version).toBe('0.73.0');
    expect(pins.tools.gitleaks.version).toBe('8.30.1');
    for (const tool of ['trivy', 'gitleaks']) {
      const linux = pins.tools[tool]!.artifacts['linux-x64']!;
      expect(linux.sha256, `${tool} linux-x64 checksum`).toMatch(/^[a-f0-9]{64}$/);
      expect(linux.url).toContain(pins.tools[tool]!.version);
      expect(pins.checksum_sources[tool]).toMatch(/^https:\/\/github\.com\//);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-R2 — coverage equivalence is literal, not asserted', () => {
  it('the runner compares the coverage descriptors of duplicated steps', () => {
    const src = runnerSource();
    expect(src).toContain('JSON.stringify(a?.coverage) !== JSON.stringify(b?.coverage)');
    expect(src).toContain('their coverage');
  });

  it('both filesystem steps share severity, scanners, ignore and cache semantics', () => {
    const src = runnerSource();
    // One argument list is built once and reused, so the two steps cannot drift.
    expect(src).toContain('const FS_ARGS = [');
    // Both invoke the AUTHENTICATED staged binary, never a bare name.
    expect(src).toMatch(/trivy-fs',\s*\[TRIVY, \.\.\.FS_ARGS/);
    expect(src).toMatch(/trivy-fs-json',\s*\[TRIVY, \.\.\.FS_ARGS/);
    // The JSON capture previously omitted --severity, silently adding LOW/MEDIUM coverage.
    expect(src).toContain("'--severity', 'HIGH,CRITICAL'");
  });

  it('both pnpm audit steps share the same audit level', () => {
    const src = runnerSource();
    expect(src).toContain("const AUDIT_LEVEL = ['--audit-level', 'high']");
    expect(src).toMatch(/'pnpm', 'audit', \.\.\.AUDIT_LEVEL/);
    expect(src).toMatch(/'pnpm', 'audit', '--json', \.\.\.AUDIT_LEVEL/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — the checks-bundle fingerprint is byte-level, not count-and-size', () => {
  /**
   * The previous fingerprint hashed only the checks-bundle FILE COUNT and TOTAL BYTES, so
   * replacing a rego check with different bytes of the SAME LENGTH was invisible: the
   * before/after equality check would still pass while the policy content had changed.
   * These controls build a synthetic cache and prove an equal-length edit is detected.
   */
  /** A minimal cache tree with the three artifacts the fingerprint covers. */
  const synthCache = (): string => {
    const cache = mkdtempSync(join(tmpdir(), 'eye-c16r3-cache-'));
    made.push(cache);
    mkdirSync(join(cache, 'db'), { recursive: true });
    mkdirSync(join(cache, 'policy', 'content', 'policies'), { recursive: true });
    writeFileSync(join(cache, 'db', 'metadata.json'), JSON.stringify({
      Version: 2, NextUpdate: '2026-08-13T00:00:00Z',
      UpdatedAt: '2026-08-12T00:00:00Z', DownloadedAt: '2026-08-12T01:00:00Z',
    }));
    writeFileSync(join(cache, 'db', 'trivy.db'), 'synthetic-db-bytes');
    writeFileSync(join(cache, 'policy', 'metadata.json'), JSON.stringify({
      Digest: `sha256:${'1'.repeat(64)}`, DownloadedAt: '2026-08-12T01:00:00Z', MajorVersion: 2,
    }));
    // Two checks files whose contents will be swapped for equal-length bytes.
    writeFileSync(join(cache, 'policy', 'content', 'policies', 'a.rego'), 'deny { input.x == 1 }\n');
    writeFileSync(join(cache, 'policy', 'content', 'policies', 'b.rego'), 'deny { input.y == 2 }\n');
    return cache;
  };

  it('digests every checks file individually, with cache-relative paths', () => {
    const cache = synthCache();
    const fp = fingerprint(cache) as {
      digest: string;
      checks_content: { files: number; bytes: number; manifest_sha256: string };
      checks_manifest: Array<{ path: string; bytes: number; sha256: string }>;
    };
    expect(fp.checks_content.files).toBe(2);
    expect(fp.checks_manifest).toHaveLength(2);
    for (const f of fp.checks_manifest) {
      expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(f.path.startsWith('policy/content/')).toBe(true);
    }
    // Sorted by path, so the manifest never depends on directory-read order.
    expect(fp.checks_manifest.map((f) => f.path))
      .toEqual([...fp.checks_manifest.map((f) => f.path)].sort());
  });

  it('an EQUAL-LENGTH modification changes the fingerprint and fails equality', () => {
    const cache = synthCache();
    const before = fingerprint(cache) as { digest: string; checks_content: { files: number; bytes: number } };

    const victim = join(cache, 'policy', 'content', 'policies', 'a.rego');
    const original = readFileSync(victim, 'utf8');
    // Same byte length, different content — invisible to a count-and-size fingerprint.
    const tampered = 'deny { input.z == 9 }\n';
    expect(Buffer.byteLength(tampered), 'the control requires an equal-length edit')
      .toBe(Buffer.byteLength(original));
    writeFileSync(victim, tampered);

    const after = fingerprint(cache) as { digest: string; checks_content: { files: number; bytes: number } };
    // File count and total bytes are IDENTICAL — the old fingerprint would have matched.
    expect(after.checks_content.files).toBe(before.checks_content.files);
    expect(after.checks_content.bytes).toBe(before.checks_content.bytes);
    // …but the byte-level fingerprint differs, so before/after equality fails.
    expect(after.digest).not.toBe(before.digest);
  });

  it('swapping two checks files with each other is also detected', () => {
    const cache = synthCache();
    const before = fingerprint(cache) as { digest: string };
    const a = join(cache, 'policy', 'content', 'policies', 'a.rego');
    const b = join(cache, 'policy', 'content', 'policies', 'b.rego');
    const av = readFileSync(a);
    writeFileSync(a, readFileSync(b));
    writeFileSync(b, av);
    const after = fingerprint(cache) as { digest: string };
    // Total bytes and count are unchanged; only per-path content moved.
    expect(after.digest).not.toBe(before.digest);
  });

  it('an unmodified cache fingerprints identically twice (positive control)', () => {
    const cache = synthCache();
    expect((fingerprint(cache) as { digest: string }).digest)
      .toBe((fingerprint(cache) as { digest: string }).digest);
  });

  it('a modified vulnerability-DB artifact is detected', () => {
    const cache = synthCache();
    const before = fingerprint(cache) as { digest: string };
    const db = join(cache, 'db', 'trivy.db');
    writeFileSync(db, 'synthetic-db-byteS');   // same length, different content
    const after = fingerprint(cache) as { digest: string };
    expect(after.digest).not.toBe(before.digest);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — acquisition failure and tracked executable digests', () => {
  it('the runner treats a nonzero acquisition as fatal, even with an existing cache', () => {
    const src = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'trivy-cache.mjs'), 'utf8');
    expect(src).toContain('acquisition exited');
    expect(src).toContain('even if an older cache is present');
    const runner = runnerSource();
    expect(runner).toContain('trivy cache acquisition —');
  });

  it('acquisition records COMPLETE stdout/stderr with digests, not a tail', () => {
    const src = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'trivy-cache.mjs'), 'utf8');
    for (const field of ['stdout_sha256', 'stderr_sha256', 'stdout_bytes', 'stderr_bytes', 'stdout_file']) {
      expect(src, field).toContain(field);
    }
  });

  it('every pinned artifact carries BOTH an archive and an executable digest', () => {
    const pins = JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-pins.json'), 'utf8')) as {
      tools: Record<string, { artifacts: Record<string, { sha256: string; executable_sha256: string; executable_bytes: number }> }>;
    };
    for (const [tool, spec] of Object.entries(pins.tools)) {
      for (const [plat, art] of Object.entries(spec.artifacts)) {
        expect(art.sha256, `${tool}/${plat} archive digest`).toMatch(/^[a-f0-9]{64}$/);
        expect(art.executable_sha256, `${tool}/${plat} executable digest`).toMatch(/^[a-f0-9]{64}$/);
        expect(art.executable_bytes, `${tool}/${plat} executable size`).toBeGreaterThan(0);
        // The two must differ: an archive is not its own extracted member.
        expect(art.executable_sha256).not.toBe(art.sha256);
      }
    }
  });

  it('the installer verifies BOTH digests and refuses either mismatch', () => {
    const sh = readFileSync(join(REPO, 'scripts', 'gate', 'install-scanners.sh'), 'utf8');
    expect(sh).toContain('ARCHIVE digest');
    expect(sh).toContain('EXECUTABLE digest');
    expect(sh).toContain('executable_sha256');
    expect(sh).toContain('tar --no-same-owner');
    // Both checks must exit non-zero.
    expect((sh.match(/exit 1/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the runner authenticates and STAGES the executable before its first invocation', () => {
    const runner = runnerSource();
    expect(runner).toContain('executed_binary_authentication');
    expect(runner).toContain('authenticated — install via scripts/gate/install-scanners.sh');
    expect(runner).toContain('Refused BEFORE any ');
    expect(runner).toContain('stageAuthenticatedTools');
    // Authentication precedes even the VERSION probe, which itself executes the binary.
    expect(runner.indexOf('stageAuthenticatedTools('))
      .toBeLessThan(runner.indexOf('toolVersions(staged.paths)'));
    // …and every later use goes through the staged absolute path.
    expect(runner).toContain('const TRIVY = staged.paths.trivy');
    expect(runner).toContain('reverifyStagedTools');
  });

  it('the raw index manifest digest is checked against the configured reference', () => {
    const runner = runnerSource();
    expect(runner).toContain('raw_index_digest_matches_reference');
    expect(runner).toContain('No child digest from');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — the disposition matcher never skips a field because of its type', () => {
  /**
   * The matcher was type-gated: `Array.isArray(r.severities) && …` and
   * `typeof r.result_target === 'string' && …`. A string `severities` or a numeric
   * `result_target` therefore SKIPPED that comparison entirely, and the record governed a
   * finding it was never approved for. These controls call the matcher DIRECTLY with
   * wrong-typed records and require the finding to remain UNGOVERNED.
   */
  const finding = {
    advisory_id: 'CVE-2026-33630',
    image: 'postgres@sha256:' + '9'.repeat(64),
    package_name: 'c-ares',
    purl: 'pkg:apk/alpine/c-ares@1.34.6-r0',
    installed_version: '1.34.6-r0',
    severity: 'HIGH',
    target: 'postgres (alpine 3.24.1)',
  };
  const record = (over: Record<string, unknown> = {}) => ({
    id: 'R', advisory_ids: [finding.advisory_id], image: finding.image,
    scan_platform: 'linux/amd64', package_name: finding.package_name,
    package_purl: finding.purl, installed_version: finding.installed_version,
    severities: ['HIGH'], result_target: finding.target,
    ...over,
  });
  const match = (r: Record<string, unknown>, opts: Record<string, unknown> = {}) =>
    reconcileFindings({ records: [r] }, [finding], { scanPlatform: 'linux/amd64', ...opts }) as {
      matched: unknown[]; unmatched: string[]; unused_records: string[]; near_miss_detail: string[];
    };

  it('POSITIVE: a fully matching record governs the finding', () => {
    const r = match(record());
    expect(r.unmatched).toEqual([]);
    expect(r.matched).toHaveLength(1);
  });

  it('a STRING severities does not govern — the field is compared, not skipped', () => {
    const r = match(record({ severities: 'HIGH' }));
    expect(r.unmatched).toHaveLength(1);
    expect(r.near_miss_detail.join('\n')).toMatch(/severities is string, not an array/);
  });

  it('a NUMERIC result_target does not govern', () => {
    const r = match(record({ result_target: 12345 }));
    expect(r.unmatched).toHaveLength(1);
    expect(r.near_miss_detail.join('\n')).toMatch(/result_target 12345 !=/);
  });

  it('a MISSING severities or result_target does not govern', () => {
    const noSev = record(); delete (noSev as Record<string, unknown>).severities;
    expect(match(noSev).unmatched).toHaveLength(1);
    const noTarget = record(); delete (noTarget as Record<string, unknown>).result_target;
    expect(match(noTarget).unmatched).toHaveLength(1);
  });

  it('a record marked structurally FATAL governs nothing at all', () => {
    // Even a perfectly matching record cannot govern once validation marked it invalid.
    const r = match(record(), { fatalIndices: [0] });
    expect(r.unmatched).toHaveLength(1);
    expect(r.matched).toHaveLength(0);
  });

  it('platform, image, package, purl and installed-version mismatches each block matching', () => {
    for (const [field, value] of [
      ['scan_platform', 'linux/arm64'],
      ['image', 'postgres@sha256:' + '1'.repeat(64)],
      ['package_name', 'other'],
      ['package_purl', 'pkg:apk/alpine/other@1.0.0'],
      ['installed_version', '9.9.9'],
    ] as Array<[string, string]>) {
      const r = match(record({ [field]: value }));
      expect(r.unmatched, `${field} mismatch must block`).toHaveLength(1);
    }
  });

  it('the code-owned type contract covers every required field', () => {
    for (const field of REQUIRED_FIELDS as unknown as string[]) {
      expect(Object.hasOwn(FIELD_TYPES as object, field), `${field} needs a declared type`).toBe(true);
    }
    expect((FIELD_TYPES as Record<string, string>)['severities']).toBe('string[]');
    expect((FIELD_TYPES as Record<string, string>)['result_target']).toBe('string');
    expect((FIELD_TYPES as Record<string, string>)['evidence_sha256']).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C17.2-H — scanner amendments carry a real, chronological review date', () => {
  const evidencePath = 'docker-compose.yml';
  const evidenceBytes = readFileSync(join(REPO, evidencePath));
  const evidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');

  const record = () => ({
    id: 'SCX-TEST-REVIEW',
    advisory_ids: ['CVE-2026-99999'],
    image: `example.invalid/image@sha256:${'a'.repeat(64)}`,
    scan_platform: 'linux/amd64',
    package_name: 'example',
    package_purl: 'pkg:npm/example@1.0.0',
    installed_version: '1.0.0',
    severities: ['HIGH'],
    result_target: 'usr/bin/example',
    reason: 'Synthetic complete record used only to exercise amendment chronology.',
    compensating_controls: ['The fixture is not used to govern a real finding.'],
    // Required of every RISK_ACCEPTED record: an acceptance without a stated scope is an
    // acceptance without a limit. The synthetic record carries one for the same reason.
    prohibited_use: ['this fixture governs no real finding and bounds no real deployment'],
    owner: 'gate-owner',
    approver: 'independent-reviewer',
    evidence: evidencePath,
    evidence_sha256: evidenceSha256,
    evidence_files: [{ path: evidencePath, sha256: evidenceSha256 }],
    classification: 'RISK_ACCEPTED',
    approved_on: '2026-08-15',
    reviewed_on: '2026-08-15',
    expires_on: '2026-11-05',
  });

  const validate = (r: Record<string, unknown>, runDate = '2026-08-16') => validateRecords(
    { schema_version: '2.0.0', records: [r] },
    {
      runDate,
      root: REPO,
      isTracked: () => true,
      readEvidence: (rel: string) => rel === evidencePath ? evidenceBytes : null,
    },
  ) as { problems: string[]; fatalIndices: number[] };

  it('POSITIVE: an amendment reviewed on its approval date is valid', () => {
    const r = validate(record());
    expect(r.problems).toEqual([]);
    expect(r.fatalIndices).toEqual([]);
  });

  it.each([
    [
      'a missing reviewed_on',
      (r: Record<string, unknown>) => { delete r.reviewed_on; },
      /missing required field 'reviewed_on'/,
    ],
    [
      'a malformed reviewed_on',
      (r: Record<string, unknown>) => { r.reviewed_on = '2026\/08\/15'; },
      /reviewed_on .*not a real calendar date/,
    ],
    [
      'an impossible reviewed_on',
      (r: Record<string, unknown>) => { r.reviewed_on = '2026-02-31'; },
      /reviewed_on .*not a real calendar date/,
    ],
    [
      'a future reviewed_on',
      (r: Record<string, unknown>) => { r.reviewed_on = '2026-08-17'; },
      /reviewed_on 2026-08-17 is in the future relative to 2026-08-16/,
    ],
    [
      'a reviewed_on date before approval',
      (r: Record<string, unknown>) => { r.reviewed_on = '2026-08-14'; },
      /reviewed_on 2026-08-14 precedes approved_on 2026-08-15/,
    ],
  ])('validateRecords rejects %s', (_label, mutate, pattern) => {
    const candidate = record() as Record<string, unknown>;
    mutate(candidate);
    const r = validate(candidate);
    expect(r.problems.join('\n')).toMatch(pattern);
    expect(r.fatalIndices).toContain(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — exit zero is not success for the checks bundle', () => {
  /**
   * Observed in a real clean-clone run: the bundle download returned 404 from the mirror
   * CDN, trivy logged `ERROR [misconfig] Falling back to embedded checks`, and STILL EXITED
   * 0. The gate failed closed at the enforcement step (no bundle metadata) but blamed the
   * wrong thing — it told the operator to run a misconfig scan that had already run. The
   * fallback is now detected explicitly so the diagnosis names the real cause.
   */
  it('the acquisition detects the embedded-checks fallback even on exit 0', () => {
    const src = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'trivy-cache.mjs'), 'utf8');
    expect(src).toContain('Falling back to embedded checks');
    expect(src).toContain('EXIT ZERO IS NOT SUCCESS');
    expect(src).toContain('embedded rules of unknown provenance');
  });

  it('a fallback makes acquire() report a problem with the upstream detail', () => {
    // Drive the detection with a fake trivy that reproduces the exact upstream behaviour:
    // logs the fallback on stderr, writes a valid report, and exits 0.
    const binDir = mkdtempSync(join(tmpdir(), 'eye-r31-fallback-'));
    made.push(binDir);
    const fake = join(binDir, 'trivy');
    writeFileSync(fake, [
      '#!/bin/sh',
      'for a in "$@"; do',
      '  if [ "$a" = "--download-db-only" ]; then echo "db ok"; exit 0; fi',
      'done',
      'echo "ERROR [misconfig] Falling back to embedded checks err=\\"failed to download checks bundle: 404\\"" >&2',
      'echo "{}"',
      'exit 0',
      '',
    ].join('\n'));
    spawnSync('chmod', ['+x', fake]);

    const cache = mkdtempSync(join(tmpdir(), 'eye-r31-fbcache-'));
    made.push(cache);
    const out = mkdtempSync(join(tmpdir(), 'eye-r31-fbout-'));
    made.push(out);
    const r = acquire({ cacheDir: cache, outDir: out, trivyPath: fake }) as {
      problems: string[]; checks_exit: number;
    };
    expect(r.checks_exit, 'the fake exits zero, exactly like the real failure').toBe(0);
    expect(r.problems.join('\n')).toMatch(/fell back to its embedded checks while still exiting 0/);
    expect(r.problems.join('\n')).toMatch(/404/);
  });

  it('a clean acquisition reports no fallback problem (positive control)', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'eye-r31-ok-'));
    made.push(binDir);
    const fake = join(binDir, 'trivy');
    writeFileSync(fake, '#!/bin/sh\necho "{}"\nexit 0\n');
    spawnSync('chmod', ['+x', fake]);
    const cache = mkdtempSync(join(tmpdir(), 'eye-r31-okcache-'));
    made.push(cache);
    const out = mkdtempSync(join(tmpdir(), 'eye-r31-okout-'));
    made.push(out);
    const r = acquire({ cacheDir: cache, outDir: out, trivyPath: fake }) as { problems: string[] };
    expect(r.problems).toEqual([]);
  });
});
