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
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { platformPinnedRef, classifyStepPolicies, INFORMATIONAL_DUPLICATES, enforceTrivyDatabase, MAX_VULN_DB_AGE_HOURS } from '../../../../scripts/gate/lib/scanner-provenance.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const runnerSource = (): string => readFileSync(join(REPO, 'scripts', 'gate', 'supply-chain.mjs'), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-A — container scans name the exact per-platform child manifest', () => {
  it('the runner pins the scan platform to the deployment platform, not the host', () => {
    const src = runnerSource();
    expect(src).toContain("const SCAN_PLATFORM = 'linux/amd64'");
    // The pinned digest alone is NOT what gets scanned; the resolved child is.
    expect(src).toContain("'--platform', SCAN_PLATFORM");
    expect(src).toContain('resolveImageIndex(image, SCAN_PLATFORM)');
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
    expect(src).toContain('SUPPLY-CHAIN GATE FAILED: unenforced scan coverage');
    expect(src).toContain('every_informational_step_duplicates_a_blocking_step');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15-C — scanner identity and vulnerability-database freshness are recorded', () => {
  it('the runner records binary paths and digests for every scanner it invokes', () => {
    const src = runnerSource();
    expect(src).toContain("scannerBinaries(['pnpm', 'node', 'gitleaks', 'trivy', 'docker'])");
    const lib = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'scanner-provenance.mjs'), 'utf8');
    expect(lib).toContain('binary_sha256');
    expect(lib).toContain('resolved_path');
  });

  it('the runner probes and ENFORCES the database before the first scan', () => {
    const src = runnerSource();
    expect(src).toContain('enforceTrivyDatabase(vulnDb, MAX_VULN_DB_AGE_HOURS)');
    expect(src).toContain('SUPPLY-CHAIN GATE FAILED: vulnerability database rejected');
    // The enforcement precedes the first scan, so a stale DB can never produce findings.
    expect(src.indexOf('vulnerability database rejected'))
      .toBeLessThan(src.indexOf("R('pnpm-audit-human'"));
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

  it('the runner refuses --final on a dirty worktree', () => {
    const src = runnerSource();
    expect(src).toContain('--final requires a clean worktree');
    expect(src).toContain("process.argv.includes('--final')");
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
    expect(src).toContain('SUPPLY-CHAIN GATE FAILED: toolchain is not pinned');
    expect(src).toContain('A scan from an unknown scanner version is not evidence.');
    // The pin check precedes the first scan.
    expect(src.indexOf('toolchain is not pinned')).toBeLessThan(src.indexOf("R('pnpm-audit-human'"));
  });
});
