/**
 * C16-R3.4 §F — non-vacuity controls for source-anchored evidence reconstruction.
 *
 * R3.3 constrained the step set, cross-checked receipts against bindings, recomputed cache
 * aggregates and parsed each SBOM — and still accepted seven coordinated false passes, all
 * with one root cause: an expectation derived from the evidence being checked.
 *
 * Each control mutates a COMPLETE, PASSING pair in exactly one way and runs BOTH verifiers:
 * the corrected one, and `fixtures/assert-final-manifests.r33-frozen.mjs`, a byte copy of R3.3
 * with only its CLI guard removed and its contracts import repointed at a frozen copy. Both
 * are given the real repository root explicitly, because their own `ROOT` resolves relative to
 * the fixtures directory.
 *
 * Where R3.3 already rejected a mutation, the control says so rather than claiming a fresh
 * catch. The exact split is reported in the closure record, not asserted to be uniform.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, rmSync, mkdtempSync, mkdirSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertFinalManifests } from '../../../../scripts/gate/assert-final-manifests.mjs';
import { assertFinalManifests as assertR33Defective } from './fixtures/assert-final-manifests.r33-frozen.mjs';
import { assertFinalManifests as assertR34Frozen } from './fixtures/assert-final-manifests.r34-frozen.mjs';
import {
  loadSourceContract, expectedStepContract, normalizeArg, ownMap, hasOwnKey, canonical,
} from '../../../../scripts/gate/lib/verification-contract.mjs';
import {
  buildPassingR34Evidence, editManifest, rebind, sha256,
} from './helpers/evidence-fixture-r34';

const REPO = join(__dirname, '..', '..', '..', '..');

describe('C16-R3.4 source-anchored evidence reconstruction', () => {
  let root: string;
  let built: ReturnType<typeof buildPassingR34Evidence>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r34-'));
    built = buildPassingR34Evidence(root, REPO);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const c15 = () => built.c15Dir;
  const c16 = () => built.c16Dir;
  const editC15 = (fn: (m: Record<string, any>) => void) => editManifest(c15(), 'supply-chain-manifest.json', fn);
  const editC16 = (fn: (m: Record<string, any>) => void) => editManifest(c16(), 'closure-reconciliation.json', fn);

  const check = (over: { c15?: string; c16?: string } = {}) =>
    assertFinalManifests({
      c15Dir: over.c15 ?? c15(), c16Dir: over.c16 ?? c16(),
      expectedSha: built.expectedSha, root: REPO,
    }) as string[];

  const frozen = (over: { c15?: string; c16?: string } = {}) => {
    try {
      return assertR33Defective({
        c15Dir: over.c15 ?? c15(), c16Dir: over.c16 ?? c16(),
        expectedSha: built.expectedSha, root: REPO,
      }) as string[];
    } catch (e) {
      return [`THREW: ${e instanceof Error ? e.message.slice(0, 120) : e}`];
    }
  };

  /** R3.4 rejects with a message matching `expected`; R3.3 accepted the same package. */
  const closesFalsePass = (expected: RegExp, over: { c15?: string; c16?: string } = {}) => {
    const problems = check(over);
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.join('\n') || '(none)'}`).toBe(true);
    const stale = frozen(over);
    expect(stale, `R3.3 must ACCEPT this mutation for it to be a false pass, but reported:\n${stale.join('\n')}`)
      .toEqual([]);
  };

  /** R3.4 rejects; R3.3 also rejected. Recorded, not counted as a closed false pass. */
  const alsoCaughtByR33 = (expected: RegExp) => {
    const problems = check();
    expect(problems.some((p) => expected.test(p)),
      `expected a problem matching ${expected}, got:\n${problems.join('\n') || '(none)'}`).toBe(true);
    expect(frozen().length, 'R3.3 was expected to reject this one too').toBeGreaterThan(0);
  };

  // ── the fixture ──────────────────────────────────────────────────────────────

  it('the untouched fixture passes BOTH verifiers, with a GENUINELY NONEMPTY graph', () => {
    expect(check()).toEqual([]);
    expect(frozen()).toEqual([]);
    // The R3.3 fixture claimed 195 nodes while shipping `components: []`. Prohibited.
    for (const target of ['production', 'development']) {
      const sbom = JSON.parse(readFileSync(join(c16(), built.sbomFileFor(target)), 'utf8'));
      expect(sbom.components.length).toBeGreaterThan(100);
      expect(sbom.dependencies.length).toBeGreaterThan(100);
      const report = JSON.parse(readFileSync(join(c16(), 'closure-reconciliation.json'), 'utf8'));
      expect(report.targets[target].counts.nodes).toBeGreaterThan(100);
    }
  });

  it('the fixture still passes after RELOCATION — a reviewer unpacks the ZIP elsewhere', () => {
    const moved = mkdtempSync(join(tmpdir(), 'eye-r34-moved-'));
    cpSync(c15(), join(moved, 'c15'), { recursive: true });
    cpSync(c16(), join(moved, 'c16'), { recursive: true });
    expect(check({ c15: join(moved, 'c15'), c16: join(moved, 'c16') })).toEqual([]);
    rmSync(moved, { recursive: true, force: true });
  });

  // ── §B the source-owned contract ─────────────────────────────────────────────

  it('every expectation comes from tracked source, and tracked source agrees with itself', () => {
    const c = loadSourceContract(REPO);
    expect(c.problems).toEqual([]);
    expect(c.imageRefs.length).toBeGreaterThan(0);
    expect([...c.conformanceRefs].sort()).toEqual([...c.imageRefs].sort());
    expect(c.targetIds).toEqual(['development', 'production']);
    expect(c.scannerNames).toEqual(['gitleaks', 'trivy']);
    // 6 normal + N image + 2 acquisition steps, two streams each; 4 governed reports; and
    // C16-R3.4.1 §A1 adds one shipped raw OCI index per configured image.
    expect(c.expectedInventory.length).toBe((6 + c.imageRefs.length + 2) * 2 + 4 + c.imageRefs.length);
  });

  it('controlled-key lookups are prototype-safe', () => {
    const m = ownMap([['real', 1]]);
    for (const inherited of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(hasOwnKey(m, inherited), `${inherited} must not answer as a governed key`).toBe(false);
    }
    expect(hasOwnKey(m, 'real')).toBe(true);
    expect(Object.getPrototypeOf(m)).toBeNull();
  });

  it('argv normalization tokenizes only volatile paths, longest prefix first', () => {
    const paths = {
      repoRoot: '/repo', outDir: '/out', trivyCache: '/out/.trivy-cache',
      stagedGitleaks: '/out/.staged-scanners/gitleaks', stagedTrivy: '/out/.staged-scanners/trivy',
    };
    expect(normalizeArg('/out/.staged-scanners/trivy', paths)).toBe('<STAGED_TRIVY>');
    expect(normalizeArg('/out/.trivy-cache', paths)).toBe('<TRIVY_CACHE>');
    expect(normalizeArg('/out/report.json', paths)).toBe('<OUT_DIR>/report.json');
    expect(normalizeArg('/repo/.gitleaks.toml', paths)).toBe('<REPO_ROOT>/.gitleaks.toml');
    expect(normalizeArg('--severity', paths)).toBe('--severity');
    expect(normalizeArg('/somewhere/else', paths)).toBe('/somewhere/else');
  });

  // ── A1 §C images ─────────────────────────────────────────────────────────────

  it('an ATTACKER-DEFINED image set is rejected: source, not the manifest, fixes the steps', () => {
    const fake = `postgres@sha256:${'c'.repeat(64)}`;
    for (const f of ['trivy-image-1.stdout.txt', 'trivy-image-1.stderr.txt']) rmSync(join(c15(), f));
    editC15((m) => {
      m.digest_pinned_images = [fake];
      m.image_platform_resolution = [m.image_platform_resolution[0]];
      m.image_platform_resolution[0].pinned_ref = fake;
      m.image_platform_resolution[0].pinned_digest = fake.slice(fake.indexOf('@') + 1);
      m.image_platform_resolution[0].raw_index_digest = fake.slice(fake.indexOf('@') + 1);
      m.steps = m.steps.filter((s: any) => s.id !== 'trivy-image-1');
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => !a.path.startsWith('trivy-image-1.'));
    });
    closesFalsePass(/digest_pinned_images is \[.*\], but tracked source/);
  });

  it('a MISSING configured image is rejected even when everything else is consistent', () => {
    for (const f of ['trivy-image-1.stdout.txt', 'trivy-image-1.stderr.txt']) rmSync(join(c15(), f));
    editC15((m) => {
      m.digest_pinned_images = [m.digest_pinned_images[0]];
      m.image_platform_resolution = [m.image_platform_resolution[0]];
      m.steps = m.steps.filter((s: any) => s.id !== 'trivy-image-1');
      m.evidence_artifacts = m.evidence_artifacts.filter((a: any) => !a.path.startsWith('trivy-image-1.'));
    });
    closesFalsePass(/tracked source .* declares \[.*redis/);
  });

  it('an ALTERED child / scan reference is rejected against the index it claims to come from', () => {
    editC15((m) => { m.image_platform_resolution[0].scan_ref = `postgres@sha256:${'d'.repeat(64)}`; });
    closesFalsePass(/scan_ref .* is not the linux\/amd64 child/);
  });

  it('a raw index digest that disagrees with the configured reference is rejected', () => {
    editC15((m) => { m.image_platform_resolution[0].raw_index_digest = `sha256:${'9'.repeat(64)}`; });
    closesFalsePass(/raw_index_digest .* != the configured/);
  });

  // ── A2/A6 §C steps and argv ──────────────────────────────────────────────────

  it('a step REDIRECTED to another bound output is rejected on the canonical name', () => {
    editC15((m) => {
      const donor = m.steps.find((s: any) => s.id === 'trivy-fs-json');
      const t = m.steps.find((s: any) => s.id === 'trivy-fs');
      t.stdout_file = donor.stdout_file;
      t.stdout_bytes = donor.stdout_bytes;
      t.stdout_sha256 = donor.stdout_sha256;
    });
    // R3.3 rejected this too — but only because both steps then referenced one stream, not
    // because it knew the canonical name. Recorded rather than claimed as a false pass.
    alsoCaughtByR33(/stdout_file is "trivy-fs-json\.stdout\.txt"; the only canonical name is 'trivy-fs\.stdout\.txt'/);
  });

  it('argv REMOVED entirely is rejected — a label is not a record of what executed', () => {
    editC15((m) => { delete m.steps.find((s: any) => s.id === 'trivy-fs').argv; });
    closesFalsePass(/records no argv array, so what executed is unknown/);
  });

  it('argv REPLACED with something unrelated is rejected', () => {
    editC15((m) => { m.steps.find((s: any) => s.id === 'trivy-fs').argv = ['echo', 'ok']; });
    closesFalsePass(/normalized argv does not match the tracked contract/);
  });

  it.each([
    ['severity lowered', (a: string[]) => a.map((x) => (x === 'HIGH,CRITICAL' ? 'CRITICAL' : x))],
    ['a scanner dropped', (a: string[]) => a.map((x) => (x === 'vuln,secret,misconfig' ? 'vuln' : x))],
    ['the ignorefile pointed at a real file', (a: string[]) => a.map((x) => (x === '/dev/null' ? '/tmp/ignore.yaml' : x))],
    ['a frozen-cache flag removed', (a: string[]) => a.filter((x) => x !== '--skip-db-update')],
  ])('WRONG scanner arguments (%s) are rejected', (_label, mutate) => {
    editC15((m) => {
      const s = m.steps.find((x: any) => x.id === 'trivy-fs');
      s.argv = (mutate as (a: string[]) => string[])(s.argv);
    });
    closesFalsePass(/normalized argv does not match the tracked contract/);
  });

  it('a WRONG coverage claim is rejected against the tracked contract', () => {
    editC15((m) => { m.steps.find((x: any) => x.id === 'trivy-fs').coverage.scanners = 'vuln'; });
    closesFalsePass(/coverage is .* expected/);
  });

  it('a gitleaks step run without --no-git, or against another config, is rejected', () => {
    editC15((m) => {
      const s = m.steps.find((x: any) => x.id === 'gitleaks-worktree');
      s.argv = s.argv.filter((a: string) => a !== '--no-git');
    });
    closesFalsePass(/gitleaks-worktree.* normalized argv does not match/);
  });

  it('an acquisition step with unrelated argv is rejected', () => {
    editC15((m) => { m.trivy_cache_acquisition.steps[0].argv = ['true']; });
    closesFalsePass(/acquisition step 'trivy-acquire-db' normalized argv does not match/);
  });

  it('a WRONG pinned tool version is rejected', () => {
    editC15((m) => { m.steps.find((x: any) => x.id === 'trivy-fs').tool_version = '0.99.0'; });
    closesFalsePass(/tool_version is "0\.99\.0", expected the pinned/);
  });

  it('an ALTERNATE bound stream path is rejected even when the file exists and is bound', () => {
    // Bind a second copy under a non-canonical name and point the step at it.
    const alt = 'trivy-fs.stdout.alt.txt';
    writeFileSync(join(c15(), alt), readFileSync(join(c15(), 'trivy-fs.stdout.txt')));
    editC15((m) => {
      const bytes = readFileSync(join(c15(), alt));
      m.evidence_artifacts.push({ path: alt, bytes: bytes.length, sha256: sha256(bytes) });
      const s = m.steps.find((x: any) => x.id === 'trivy-fs');
      s.stdout_file = alt;
    });
    const problems = check();
    expect(problems.some((p) => /the only canonical name is 'trivy-fs\.stdout\.txt'/.test(p))).toBe(true);
    // And the inventory is an EQUALITY, so the extra bound file is reported too.
    expect(problems.some((p) => /bound 'trivy-fs\.stdout\.alt\.txt', which the source-owned contract does not expect/.test(p))).toBe(true);
    expect(frozen(), 'R3.3 accepted any bound path a step named').toEqual([]);
  });

  // ── A3 §C cache reconstruction ───────────────────────────────────────────────

  it('REMOVING db/trivy.db and recomputing the aggregates is rejected', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.entries = fp.entries.filter((e: any) => e.path !== 'db/trivy.db');
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    closesFalsePass(/cache fingerprint omits the required entry 'db\/trivy\.db'/);
  });

  it('a DUPLICATE cache entry path is rejected', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.entries.push({ ...fp.entries[0] });
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    closesFalsePass(/cache entry '.*' appears more than once/);
  });

  it('a DUPLICATE checks-manifest path is rejected', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.checks_manifest.push({ ...fp.checks_manifest[0] });
        fp.checks_content.files = fp.checks_manifest.length;
        fp.checks_content.bytes = fp.checks_manifest.reduce((a: number, f: any) => a + f.bytes, 0);
        fp.checks_content.manifest_sha256 = sha256(JSON.stringify(fp.checks_manifest));
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    closesFalsePass(/checks-manifest lists '.*' more than once/);
  });

  it('an UNKNOWN cache entry path is rejected — the set is source-owned', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.entries.push({ path: 'db/extra.json', present: true, bytes: 1, sha256: sha256('x') });
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    closesFalsePass(/cache entry 'db\/extra\.json' is not one of the tracked cache artifacts/);
  });

  it('a PROTOTYPE-NAMED controlled key is rejected, not silently accepted', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.entries = fp.entries.map((e: any) => (e.path === 'db/trivy.db' ? { ...e, path: '__proto__' } : e));
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    const problems = check();
    expect(problems.some((p) => /cache entry '__proto__' is not one of the tracked cache artifacts/.test(p))).toBe(true);
    expect(problems.some((p) => /omits the required entry 'db\/trivy\.db'/.test(p))).toBe(true);
    expect(frozen()).toEqual([]);
  });

  it('an out-of-order checks manifest is rejected', () => {
    editC15((m) => {
      for (const k of ['trivy_cache_fingerprint_before', 'trivy_cache_fingerprint_after']) {
        const fp = m[k];
        fp.checks_manifest = [...fp.checks_manifest].reverse();
        fp.checks_content.manifest_sha256 = sha256(JSON.stringify(fp.checks_manifest));
        fp.digest = sha256(JSON.stringify({ entries: fp.entries, checksManifest: fp.checks_manifest }));
      }
    });
    closesFalsePass(/checks-manifest is not sorted by path/);
  });

  // ── §C raw-output semantic reconstruction ────────────────────────────────────

  it('a RAW image report altered while the reconciliation claim stands is rejected', () => {
    const p = join(c15(), 'trivy-image-0.stdout.txt');
    const r = JSON.parse(readFileSync(p, 'utf8'));
    for (const res of r.Results ?? []) res.Vulnerabilities = [];
    writeFileSync(p, JSON.stringify(r, null, 2));
    editC15((m) => {
      const b = readFileSync(p);
      const s = m.steps.find((x: any) => x.id === 'trivy-image-0');
      s.stdout_bytes = b.length; s.stdout_sha256 = sha256(b);
    });
    rebind(c15(), 'supply-chain-manifest.json', 'trivy-image-0.stdout.txt');
    closesFalsePass(/image-findings\.json does not equal the findings reconstructed from the delivered raw/);
  });

  it('image-findings.json altered INDEPENDENTLY of the raw output is rejected', () => {
    writeFileSync(join(c15(), 'image-findings.json'), `${JSON.stringify([], null, 2)}\n`);
    rebind(c15(), 'supply-chain-manifest.json', 'image-findings.json');
    closesFalsePass(/image-findings\.json does not equal the findings reconstructed/);
  });

  it('a disposition RESULT altered independently is rejected against the recomputation', () => {
    editC15((m) => {
      m.image_finding_reconciliation.matched = [];
      m.image_finding_reconciliation.total_findings = 0;
    });
    alsoCaughtByR33(/image_finding_reconciliation does not equal the reconciliation recomputed/);
  });

  it('a non-empty gitleaks report is rejected even though it is byte-bound', () => {
    writeFileSync(join(c15(), 'gitleaks-worktree.json'),
      JSON.stringify([{ RuleID: 'generic-api-key', File: 'x.ts' }]));
    rebind(c15(), 'supply-chain-manifest.json', 'gitleaks-worktree.json');
    closesFalsePass(/gitleaks-worktree\.json reports 1 secret finding/);
  });

  it('a dependency audit carrying high vulnerabilities is rejected', () => {
    const p = join(c15(), 'pnpm-audit-json.stdout.txt');
    writeFileSync(p, `${JSON.stringify({
      advisories: { 1: { severity: 'high', title: 'x' } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    })}\n`);
    editC15((m) => {
      const b = readFileSync(p);
      const s = m.steps.find((x: any) => x.id === 'pnpm-audit-json');
      s.stdout_bytes = b.length; s.stdout_sha256 = sha256(b);
    });
    rebind(c15(), 'supply-chain-manifest.json', 'pnpm-audit-json.stdout.txt');
    closesFalsePass(/dependency audit reports 1 high vulnerability/);
  });

  it('a filesystem scan carrying blocking results is rejected', () => {
    const p = join(c15(), 'trivy-fs-json.stdout.txt');
    writeFileSync(p, `${JSON.stringify({
      SchemaVersion: 2,
      Results: [{ Target: 'x', Vulnerabilities: [{ VulnerabilityID: 'CVE-1', Severity: 'CRITICAL' }] }],
    })}\n`);
    editC15((m) => {
      const b = readFileSync(p);
      const s = m.steps.find((x: any) => x.id === 'trivy-fs-json');
      s.stdout_bytes = b.length; s.stdout_sha256 = sha256(b);
    });
    rebind(c15(), 'supply-chain-manifest.json', 'trivy-fs-json.stdout.txt');
    closesFalsePass(/filesystem scan carries 1 blocking HIGH\/CRITICAL result/);
  });

  // ── §D C16 from source ───────────────────────────────────────────────────────

  it('MISSING sbom_bytes is rejected — it is a mandatory integer', () => {
    editC16((m) => { delete m.targets.production.sbom_bytes; });
    closesFalsePass(/sbom_bytes is undefined; a mandatory integer byte count/);
  });

  it.each([
    ['type', 'library'],
    ['name', 'not-the-eye'],
    ['version', '9.9.9'],
    ['purl', 'pkg:npm/not-the-eye@9.9.9'],
  ])('a changed SBOM subject %s is rejected, rehashed and rebound though it is', (field, value) => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.metadata.component[field as string] = value;
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    const problems = check();
    expect(problems.some((p2) => /is not byte-identical to the SBOM deterministically generated/.test(p2))).toBe(true);
    expect(problems.some((p2) => new RegExp(`subject '${field}' is`).test(p2))).toBe(true);
    expect(frozen()).toEqual([]);
  });

  it('a DUPLICATE CONTRADICTORY metadata property is rejected', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.metadata.properties.push({ name: 'eye:target-id', value: 'linux-x64-glibc-dev' });
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    const problems = check();
    expect(problems.some((p2) => /declares 'eye:target-id' more than once with CONFLICTING values/.test(p2))).toBe(true);
    // HONEST NOTE: R3.3 rejects this too, but only because its last-wins property read
    // happened to land on the contradictory value. It never detected the DUPLICATION, so a
    // duplicate whose second value matched would have passed. R3.4 rejects the duplication
    // itself, which is the property being added.
    const stale = frozen();
    expect(stale.some((p2) => /'eye:target-id' is/.test(p2)),
      `R3.3 was expected to object to the value, got:\n${stale.join('\n')}`).toBe(true);
    expect(stale.some((p2) => /more than once/.test(p2)),
      'R3.3 must NOT detect the duplication — that is the gap being closed').toBe(false);
  });

  it('an ADDITIONAL metadata property is rejected', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.metadata.properties.push({ name: 'eye:extra', value: 'smuggled' });
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    closesFalsePass(/declares an additional metadata property 'eye:extra'/);
  });

  it('a MISSING provenance property is rejected', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.metadata.properties = s.metadata.properties.filter((x: any) => x.name !== 'eye:lockfile-sha256');
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    closesFalsePass(/missing the provenance property 'eye:lockfile-sha256'/);
  });

  it('COMPLETE GRAPH DELETION with an updated digest and binding is rejected', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.components = []; s.dependencies = [];
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
      // The counts are LEFT CLAIMING the real numbers — exactly the reported false pass.
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    const problems = check();
    expect(problems.some((p2) => /SBOM graph is EMPTY/.test(p2))).toBe(true);
    expect(problems.some((p2) => /is not byte-identical to the SBOM deterministically generated/.test(p2))).toBe(true);
    expect(frozen(), 'R3.3 digested the SBOM and never counted its graph').toEqual([]);
  });

  it('PARTIAL component deletion is rejected against source-derived counts', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.components = s.components.slice(0, -5);
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    const problems = check();
    expect(problems.some((p2) => /carries \d+ components; the source-derived closure has \d+ node/.test(p2))).toBe(true);
    expect(frozen()).toEqual([]);
  });

  it('DEPENDENCY-EDGE deletion is rejected against source-derived edge counts', () => {
    const rel = built.sbomFileFor('production');
    const p = join(c16(), rel);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    const i = s.dependencies.findIndex((x: any) => Array.isArray(x.dependsOn) && x.dependsOn.length > 0);
    s.dependencies[i].dependsOn = s.dependencies[i].dependsOn.slice(1);
    writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
    const b = readFileSync(p);
    editC16((m) => {
      m.targets.production.sbom_sha256 = sha256(b);
      m.targets.production.sbom_bytes = b.length;
    });
    rebind(c16(), 'closure-reconciliation.json', rel);
    const problems = check();
    expect(problems.some((p2) => /dependency graph has \d+ edge\(s\); the source-derived closure has \d+/.test(p2))).toBe(true);
    expect(frozen()).toEqual([]);
  });

  it('FALSIFIED counts are rejected against the source-derived counts', () => {
    editC16((m) => { m.targets.production.counts.nodes = 9999; });
    closesFalsePass(/counts do not equal the source-derived counts/);
  });

  it('a FALSIFIED clean reconciliation is rejected against the re-derivation', () => {
    editC16((m) => { m.targets.production.reconciliation.lock_nodes = 1; });
    closesFalsePass(/reconciliation does not equal the source-derived reconciliation/);
  });

  it('swapping the production and development records is rejected', () => {
    editC16((m) => {
      const p = m.targets.production; const d = m.targets.development;
      m.targets.production = d; m.targets.development = p;
    });
    alsoCaughtByR33(/records appear swapped/);
  });

  // ── §E root and path safety, applied first ───────────────────────────────────

  it('a SYMLINKED C15 root is rejected before any evidence is read', () => {
    const link = join(root, 'c15-link');
    symlinkSync(c15(), link);
    const problems = check({ c15: link });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/C15 output directory .* is a SYMLINK/);
    // §E RETAINS the R3.3 root protections rather than closing them, so R3.3 rejects this too.
    // The control exists to prove the retention, and that it still runs BEFORE any evidence is
    // read — hence the single problem.
    expect(frozen({ c15: link }).length, 'R3.3 introduced this check; it must still reject').toBeGreaterThan(0);
  });

  it('a SYMLINKED C16 root manifest is rejected even pointing at valid bytes', () => {
    const outside = join(root, 'outside.json');
    cpSync(join(c16(), 'closure-reconciliation.json'), outside);
    rmSync(join(c16(), 'closure-reconciliation.json'));
    symlinkSync(outside, join(c16(), 'closure-reconciliation.json'));
    // §E retention, not a closure: R3.3 rejects this too.
    alsoCaughtByR33(/C16 closure-reconciliation\.json is a SYMLINK/);
  });

  it('an artifact behind a symlinked INTERMEDIATE directory is rejected', () => {
    const outsideDir = join(root, 'outside-reports');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, 'nested.json'), '{"outside":true}');
    symlinkSync(outsideDir, join(c15(), 'reports'));
    const bytes = readFileSync(join(outsideDir, 'nested.json'));
    editC15((m) => {
      m.evidence_artifacts.push({ path: join('reports', 'nested.json'), bytes: bytes.length, sha256: sha256(bytes) });
    });
    const problems = check();
    expect(problems.some((p) => /intermediate path 'reports' is a SYMLINK/.test(p))).toBe(true);
  });

  // ── inventory equality ───────────────────────────────────────────────────────

  it('an EXTRA bound file is rejected: the inventory is an equality, not a minimum', () => {
    writeFileSync(join(c15(), 'bonus.txt'), 'extra');
    const bytes = readFileSync(join(c15(), 'bonus.txt'));
    editC15((m) => { m.evidence_artifacts.push({ path: 'bonus.txt', bytes: bytes.length, sha256: sha256(bytes) }); });
    closesFalsePass(/bound 'bonus\.txt', which the source-owned contract does not expect/);
  });

  it('an EXTRA unbound file is still rejected', () => {
    writeFileSync(join(c15(), 'unbound.txt'), 'nobody checked these bytes');
    alsoCaughtByR33(/unbound\.txt.*UNBOUND/);
  });

  it('the step contract itself is exact and source-shaped', () => {
    const contract = loadSourceContract(REPO);
    const steps = expectedStepContract({ scanRefs: built.scanRefs });
    for (const id of contract.normalStepIds as string[]) {
      expect(hasOwnKey(steps, id), `${id} must have an argv contract`).toBe(true);
      expect(Array.isArray(steps[id].argv)).toBe(true);
    }
    // The image steps carry the resolved child reference, not the configured index.
    built.scanRefs.forEach((ref, i) => {
      expect(canonical(steps[`trivy-image-${i}`].argv)).toContain(ref);
    });
  });
});

/**
 * C16-R3.4.1 §A — the four false passes independent review reproduced against R3.4.
 *
 * Each executes BOTH the corrected verifier and `fixtures/assert-final-manifests.r34-frozen.mjs`,
 * a byte copy of the R3.4 verifier as delivered at e819b1e.
 */
describe('C16-R3.4.1 — false passes reproduced against the frozen R3.4 verifier', () => {
  let root: string;
  let built: ReturnType<typeof buildPassingR34Evidence>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eye-r341-'));
    built = buildPassingR34Evidence(root, REPO);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const check = () => assertFinalManifests({
    c15Dir: built.c15Dir, c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
  }) as string[];
  /**
   * The frozen R3.4 verifier, with ONE class of complaint filtered out and named.
   *
   * R3.4's derived inventory predates §A1, so it does not know the raw OCI index bytes exist
   * and reports each as an unexpected extra. That is not the false pass under test — it is
   * R3.4 correctly enforcing its own, older, inventory. Every OTHER complaint is retained, so
   * "R3.4 accepted this mutation" still means exactly that.
   */
  const frozen34 = () => {
    try {
      const all = assertR34Frozen({
        c15Dir: built.c15Dir, c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
      }) as string[];
      return all.filter((p) => !/bound 'oci-index-\d+\.json', which the source-owned contract does not expect/.test(p));
    } catch (e) { return [`THREW: ${e instanceof Error ? e.message.slice(0, 100) : e}`]; }
  };
  const editC15 = (fn: (m: Record<string, any>) => void) =>
    editManifest(built.c15Dir, 'supply-chain-manifest.json', fn);

  const closes = (expected: RegExp) => {
    const problems = check();
    expect(problems.some((p) => expected.test(p)),
      `expected ${expected}, got:\n${problems.join('\n') || '(none)'}`).toBe(true);
    const stale = frozen34();
    expect(stale, `frozen R3.4 must ACCEPT this, but reported:\n${stale.join('\n')}`).toEqual([]);
  };

  it('the untouched fixture passes BOTH the corrected and the frozen R3.4 verifier', () => {
    expect(check()).toEqual([]);
    expect(frozen34()).toEqual([]);
    // And the filtered class really is only the new artifact: R3.4 reports exactly two.
    const raw = assertR34Frozen({
      c15Dir: built.c15Dir, c16Dir: built.c16Dir, expectedSha: built.expectedSha, root: REPO,
    }) as string[];
    expect(raw).toHaveLength(2);
    expect(raw.every((p) => /oci-index-\d+\.json/.test(p))).toBe(true);
  });

  it('§A1 a substituted image child — digest, scan_ref and argv changed together — is rejected', () => {
    // R3.4 read resolution.children, so a consistent substitution was self-proving. The child
    // is now derived from the shipped index bytes, which still hash to the configured digest.
    const fakeChild = `sha256:${'7'.repeat(64)}`;
    editC15((m) => {
      const r = m.image_platform_resolution[0];
      const name = r.pinned_ref.slice(0, r.pinned_ref.indexOf('@'));
      r.scan_ref = `${name}@${fakeChild}`;
      r.resolution.target_digest = fakeChild;
      r.resolution.children = [{
        digest: fakeChild, media_type: 'application/vnd.oci.image.manifest.v1+json',
        os: 'linux', architecture: 'amd64', variant: null, size: 2678, attestation: false,
      }];
      const step = m.steps.find((s: any) => s.id === 'trivy-image-0');
      step.argv = step.argv.map((a: string) => (a.startsWith(`${name}@`) ? `${name}@${fakeChild}` : a));
    });
    closes(/scan_ref .* is not the linux\/amd64 child derived from the shipped index bytes/);
  });

  it.each([
    ['pnpm audit JSON replaced with {}', 'pnpm-audit-json.stdout.txt', '{}', /no 'metadata' object|no 'metadata\.vulnerabilities' counters/],
    ['trivy filesystem JSON replaced with {}', 'trivy-fs-json.stdout.txt', '{}', /no integer SchemaVersion|no ArtifactName/],
  ])('§A2 %s is rejected', (_label, rel, body, expected) => {
    writeFileSync(join(built.c15Dir, rel as string), body as string);
    const bytes = readFileSync(join(built.c15Dir, rel as string));
    editC15((m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === rel);
      a.bytes = bytes.length; a.sha256 = sha256(bytes);
      const step = m.steps.find((x: any) => x.stdout_file === rel);
      if (step !== undefined) { step.stdout_bytes = bytes.length; step.stdout_sha256 = sha256(bytes); }
    });
    closes(expected as RegExp);
  });

  it('§A2 an EMPTY blocking table receipt beside a populated JSON is rejected', () => {
    writeFileSync(join(built.c15Dir, 'trivy-fs.stdout.txt'), '');
    const bytes = readFileSync(join(built.c15Dir, 'trivy-fs.stdout.txt'));
    editC15((m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'trivy-fs.stdout.txt');
      a.bytes = bytes.length; a.sha256 = sha256(bytes);
      const step = m.steps.find((x: any) => x.id === 'trivy-fs');
      step.stdout_bytes = bytes.length; step.stdout_sha256 = sha256(bytes);
    });
    closes(/trivy-fs\.stdout\.txt is empty; the blocking filesystem scan produced no receipt/);
  });

  it('§A4 a DELETED tool_version is rejected on a normal receipt', () => {
    editC15((m) => { delete m.steps.find((s: any) => s.id === 'trivy-fs').tool_version; });
    closes(/records no tool_version; the version that ran is not optional/);
  });

  it('§A4 a DELETED tool_version is rejected on an acquisition receipt', () => {
    editC15((m) => { delete m.trivy_cache_acquisition.steps[0].tool_version; });
    closes(/acquisition step 'trivy-acquire-db' records no tool_version/);
  });

  it('§A4 a MISMATCHED tool_version is rejected — and R3.4 caught this one too', () => {
    // HONEST NOTE: R3.4 compared the version whenever the field was PRESENT, so a wrong value
    // was already refused. The false pass was the MISSING field, which R3.4 skipped entirely —
    // covered by the two deletion controls above. This control records the retained behaviour.
    editC15((m) => { m.steps.find((s: any) => s.id === 'trivy-fs').tool_version = '0.99.0'; });
    const problems = check();
    expect(problems.some((p) => /tool_version is "0\.99\.0", expected the pinned/.test(p))).toBe(true);
    expect(frozen34().length, 'R3.4 was expected to reject a mismatched version as well').toBeGreaterThan(0);
  });

  it('§A1 a raw index whose bytes do not hash to the configured reference is rejected', () => {
    writeFileSync(join(built.c15Dir, 'oci-index-0.json'), '{"manifests":[]}');
    const bytes = readFileSync(join(built.c15Dir, 'oci-index-0.json'));
    editC15((m) => {
      const a = m.evidence_artifacts.find((x: any) => x.path === 'oci-index-0.json');
      a.bytes = bytes.length; a.sha256 = sha256(bytes);
    });
    closes(/these are not the bytes the reference names/);
  });
});
