/**
 * SUPPLY-CHAIN ARTIFACT GATES.
 *
 * Two blocks with deliberately different dependency models.
 *
 * G21-21 (licence inventory) still has a stated precondition — `node
 * scripts/license-inventory.mjs` must have run — declared here and encoded in CI
 * rather than hidden behind a skip, because a gate that quietly skips is not a gate.
 *
 * C16 (target-resolved closures) has NO precondition: it INVOKES the shipped runner
 * into a fresh temporary directory and asserts what that run produced. Remediation
 * after independent review of e3a0b1f — the previous version read a gitignored path,
 * so a local run could pass on leftover preliminary files while a clean checkout
 * failed. An artifact gate that depends on ignored state is not reproducible.
 *
 * The Gate-2.1 legacy SBOM artifacts (evidence/supply-chain/sbom.cdx.json and
 * reconciliation.txt) are SUPERSEDED and no longer part of the active gate: their
 * "bidirectional" reconciliation compared two structures derived from the same
 * generated SBOM, so it could not fail. See the supersession assertion below.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { validateCycloneDx } from '../../../../scripts/lib/supply-chain.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');

/** Fail with the exact command to run, rather than skipping silently. */
function required(relative: string, producer: string): string {
  const path = join(REPO, relative);
  if (!existsSync(path)) {
    throw new Error(
      `${relative} is missing — run \`${producer}\` first. ` +
      'This gate asserts the ARTIFACT that was shipped; it is not skippable.',
    );
  }
  return readFileSync(path, 'utf8');
}

describe('G21-22 artifacts — the shipped SBOM, inventories and reconciliation report', () => {
  it('the licence inventory records BOTH closures, and neither is empty', () => {
    const inventory = JSON.parse(
      required('sbom/license-inventory.json', 'node scripts/license-inventory.mjs'),
    ) as { production: unknown[]; development: unknown[] };
    expect(Array.isArray(inventory.production)).toBe(true);
    expect(Array.isArray(inventory.development)).toBe(true);
    expect(inventory.production.length).toBeGreaterThan(0);
    expect(inventory.development.length).toBeGreaterThan(0);
  });

  it('the legacy self-reconciling SBOM artifacts are NOT part of the active gate', () => {
    // The Gate-2.1 generator and its reconciliation.txt are superseded by C16. They are
    // deliberately no longer generated or asserted: comparing an SBOM against a
    // structure derived from that same SBOM cannot fail, so it evidenced nothing.
    // C17 replaces the schema-validation and licence-obligation halves.
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    const active = ci.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(active, 'the legacy generator must not run in the active gate')
      .not.toContain('node scripts/generate-sbom.mjs');
    // …and the runners that DO gate supply-chain correctness are wired and blocking.
    expect(active).toContain('scripts/gate/supply-chain.mjs');
    expect(active).toContain('scripts/gate/generate-closures.mjs');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 artifacts — the target-resolved closures and their real reconciliation', () => {
  /**
   * Generate into a FRESH temporary directory by invoking the shipped runner, so this
   * gate is identical on a clean checkout and on a developer machine with leftover
   * preliminary outputs. Nothing here reads a gitignored path.
   */
  let outDir: string;
  let raw: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'eye-c16-artifacts-'));
    execFileSync('node', [join(REPO, 'scripts/gate/generate-closures.mjs'), '--out', outDir], {
      cwd: REPO, encoding: 'utf8', stdio: 'pipe',
    });
    raw = readFileSync(join(outDir, 'closure-reconciliation.json'), 'utf8');
  });
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  const generated = (relative: string): string => {
    const path = join(outDir, relative);
    if (!existsSync(path)) throw new Error(`${relative} was not produced by the C16 runner`);
    return readFileSync(path, 'utf8');
  };

  const report = (): {
    targets: Record<string, {
      target: { id: string; os: string; arch: string; libc: string; importer_roots: string[]; dependency_scopes: string[] };
      counts: { nodes: number; edges: number; platform_excluded: number; peer_variant_nodes: number; subject_root_edges: number };
      reconciliation: Record<string, unknown> & { clean: boolean };
      workspace_identities: Array<{ importer_root: string; name: string; version: string; purl: string; manifest_sha256: string }>;
      scope_distribution: Record<string, number>;
      sbom_sha256: string;
      sbom_file: string;
      subject_ref: string;
    }>;
    determinism_contract: Record<string, unknown>;
    generated_from: Record<string, unknown>;
    governed_exclusions: { rejected: string[]; applied_per_target: Record<string, { applied_count: number }> };
    vulnerable_residuals: string[];
    override_residual_proof: Array<{ package: string; pinned_exact: string; resolved_per_target: Record<string, string[]> }>;
  } => JSON.parse(raw);

  it('both targets reconcile clean over EVERY failure dimension, reported separately', () => {
    const r = report();
    expect(Object.keys(r.targets).sort()).toEqual(['development', 'production']);
    for (const [name, t] of Object.entries(r.targets)) {
      for (const key of [
        'missing_nodes', 'extra_nodes', 'missing_edges', 'extra_edges',
        'edge_multiplicity_mismatches', 'missing_subject_root_edges', 'extra_subject_edges',
        'field_mismatches', 'duplicate_components', 'duplicate_dependency_entries',
        'duplicate_depends_on', 'duplicate_properties', 'dangling_references',
        'components_without_dependency_entry', 'orphan_components',
        'subject_and_binding_problems',
      ]) {
        expect(t.reconciliation[key], `${name}.${key}`).toEqual([]);
      }
      // Counts must agree on both sides, not merely have an empty difference.
      expect(t.reconciliation['lock_nodes'], `${name} node counts`).toBe(t.reconciliation['sbom_nodes']);
      expect(t.reconciliation['lock_edges'], `${name} edge counts`).toBe(t.reconciliation['sbom_edges']);
      expect(t.reconciliation['subject_root_edges_present'], `${name} subject edges`)
        .toBe(t.reconciliation['subject_root_edges_expected']);
      expect(t.reconciliation.clean, `${name} clean`).toBe(true);
      expect(t.counts.nodes).toBeGreaterThan(0);
      expect(t.counts.subject_root_edges).toBe(t.target.importer_roots.length);
    }
  });

  it('the report records REAL first-party workspace identities, never path basenames', () => {
    const r = report();
    for (const [name, t] of Object.entries(r.targets)) {
      expect(t.workspace_identities.length, `${name} workspace identities`).toBeGreaterThan(0);
      for (const w of t.workspace_identities) {
        expect(w.version, `${name} ${w.importer_root} version`).not.toBe('0.0.0');
        expect(w.manifest_sha256, `${name} ${w.importer_root} manifest digest`).toMatch(/^[a-f0-9]{64}$/);
        // Canonical scoped PURL: namespace separated by '/', not '%2F'.
        if (w.name.startsWith('@')) expect(w.purl).toMatch(/^pkg:npm\/%40[^%]+\//);
      }
      const names = t.workspace_identities.map((w) => `${w.name}@${w.version}`);
      expect(names).toContain('@eye/api@0.0.1');
      expect(names).toContain('@eye/contracts@0.0.1');
    }
  });

  it('every component carries scope provenance', () => {
    const r = report();
    for (const [name, t] of Object.entries(r.targets)) {
      expect(t.scope_distribution['(none)'], `${name} components with no scope`).toBeUndefined();
      const total = Object.values(t.scope_distribution).reduce((a, b) => a + b, 0);
      expect(total, `${name} scope distribution must cover every component`).toBe(t.counts.nodes);
    }
  });

  it('the report binds the source SHA, lockfile, descriptor and generator digests', () => {
    const r = report();
    expect(r.generated_from['lockfile_sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(r.generated_from['descriptor_sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(r.generated_from['generator_sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(r.generated_from['exclusions_sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(r.generated_from['source_sha']).toMatch(/^[a-f0-9]{40}$|^\(not a git worktree\)$/);
    const pinned = r.generated_from['pinned_implementations'] as Record<string, { installed: string; expected: string }>;
    expect(pinned['packageurl-js'].installed).toBe(pinned['packageurl-js'].expected);
    expect(pinned['yaml'].installed).toBe(pinned['yaml'].expected);
    // And each serialized SBOM is bound by its exact digest.
    for (const t of Object.values(r.targets)) expect(t.sbom_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('the two targets are resolved for linux/x64/glibc and are genuinely distinct', () => {
    const r = report();
    for (const t of Object.values(r.targets)) {
      expect(t.target.os).toBe('linux');
      expect(t.target.arch).toBe('x64');
      expect(t.target.libc).toBe('glibc');
      expect(t.counts.platform_excluded).toBeGreaterThan(0);
      expect(t.counts.peer_variant_nodes).toBeGreaterThan(0);
    }
    const prod = r.targets['production']!;
    const dev = r.targets['development']!;
    expect(prod.target.dependency_scopes).not.toContain('devDependencies');
    expect(dev.target.dependency_scopes).toContain('devDependencies');
    expect(dev.counts.nodes).toBeGreaterThan(prod.counts.nodes);
    expect(dev.counts.edges).toBeGreaterThan(prod.counts.edges);
    expect(dev.sbom_sha256).not.toBe(prod.sbom_sha256);
  });

  it('the recorded determinism contract matches what the artifacts must satisfy', () => {
    const r = report();
    expect(r.determinism_contract['metadata_timestamp']).toBe('deliberately omitted');
    expect(r.determinism_contract['node_modules_read']).toBe(false);
    expect(r.determinism_contract['host_platform_read']).toBe(false);
    expect(r.determinism_contract['reconciliation_reads_sbom_from_disk']).toBe(true);
  });

  it('the shipped SBOMs carry no timestamp, so they are byte-comparable across runs', () => {
    const r = report();
    for (const t of Object.values(r.targets)) {
      const doc = JSON.parse(generated(t.sbom_file)) as {
        metadata: Record<string, unknown>; specVersion: string; serialNumber: string;
        components: unknown[]; dependencies: unknown[];
      };
      expect(doc.metadata['timestamp']).toBeUndefined();
      expect(doc.specVersion).toBe('1.6');
      expect(doc.serialNumber).toMatch(/^urn:uuid:/);
      // Every component has a dependency entry, leaves included, PLUS the metadata
      // subject's own entry naming the declared importer roots.
      expect(doc.dependencies.length).toBe(doc.components.length + 1);
    }
  });

  it('no exclusion is suppressing anything, and the exact override left no residual', () => {
    const r = report();
    expect(r.governed_exclusions.rejected).toEqual([]);
    expect(r.vulnerable_residuals).toEqual([]);
    // Nothing declared means nothing applied — stated, not assumed.
    for (const [name, a] of Object.entries(r.governed_exclusions.applied_per_target)) {
      expect(a.applied_count, `${name} applied exclusions`).toBe(0);
    }
    const nanoid = r.override_residual_proof.find((p) => p.package === 'nanoid');
    expect(nanoid, 'the nanoid override must be proven, not assumed').toBeDefined();
    expect(nanoid!.pinned_exact).toBe('3.3.18');
    for (const [target, versions] of Object.entries(nanoid!.resolved_per_target)) {
      expect(versions, `${target} nanoid versions`).toEqual(['3.3.18']);
    }
  });
});

/**
 * C16-R3.1: the published evidence package must be verifiable by the reviewer who
 * downloads it.
 *
 * The hosted run at `2abd959` produced a ZIP whose own `SHA256SUMS.txt` listed itself:
 * the manifest was created by redirecting into the bundle, so `find` saw the empty file
 * and recorded ITS digest, and every reviewer running `sha256sum -c` got
 * `SHA256SUMS.txt: FAILED`. An evidence manifest that always fails cannot be told apart
 * from corrupted evidence.
 *
 * These controls EXECUTE `scripts/gate/package-evidence.sh` — the same tracked script the
 * workflow calls — rather than asserting anything about the workflow YAML.
 */
describe('C16-R3.1 evidence packaging — the published manifest verifies', () => {
  const SCRIPT = join(REPO, 'scripts', 'gate', 'package-evidence.sh');
  const SHA = 'a'.repeat(40);
  let work: string;
  let zip: string;
  let digest: string;
  let unpacked: string;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'eye-pkg-'));
    const c15 = join(work, 'c15');
    const c16 = join(work, 'c16');
    const dest = join(work, 'dest');
    for (const d of [c15, c16, dest]) mkdirSync(d, { recursive: true });
    // A representative C15 output: reports, raw scanner streams, a result receipt, plus
    // the two trees the script must EXCLUDE by design.
    writeFileSync(join(c15, 'supply-chain-manifest.json'), JSON.stringify({ outcome: 'PASS' }));
    writeFileSync(join(c15, 'RESULT-PASS.txt'), 'PASS\n');
    writeFileSync(join(c15, 'trivy-fs.stdout.txt'), 'x'.repeat(4096));
    writeFileSync(join(c15, 'gitleaks-worktree.json'), '[]');
    mkdirSync(join(c15, '.trivy-cache', 'db'), { recursive: true });
    writeFileSync(join(c15, '.trivy-cache', 'db', 'trivy.db'), 'huge');
    mkdirSync(join(c15, '.staged-scanners'), { recursive: true });
    writeFileSync(join(c15, '.staged-scanners', 'trivy'), 'binary');
    writeFileSync(join(c16, 'closure-reconciliation.json'), JSON.stringify({ status: 'ok' }));
    writeFileSync(join(c16, 'sbom-linux-x64-glibc-prod.cdx.json'), '{}');

    const out = execFileSync('bash', [SCRIPT, c15, c16, SHA, dest], { encoding: 'utf8' })
      .trim().split('\n');
    zip = out[0]!;
    digest = out[1]!;
    unpacked = join(work, 'unpacked');
    mkdirSync(unpacked, { recursive: true });
    execFileSync('unzip', ['-q', zip], { cwd: unpacked });
  });

  afterAll(() => { rmSync(work, { recursive: true, force: true }); });

  it('the ZIP is named for the source SHA and the reported digest is the archive it wrote', () => {
    expect(zip.endsWith(`c16-r34-final-evidence-${SHA}.zip`)).toBe(true);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    const actual = createHash('sha256').update(readFileSync(zip)).digest('hex');
    expect(digest, 'the printed digest must describe the ZIP on disk').toBe(actual);
  });

  it('SHA256SUMS.txt does NOT list itself — a self-entry can never verify', () => {
    const manifest = readFileSync(join(unpacked, 'SHA256SUMS.txt'), 'utf8');
    const names = manifest.trim().split('\n').map((l) => l.split(/\s+/).slice(1).join(' '));
    expect(names.length).toBeGreaterThan(0);
    expect(names, 'the manifest must not contain an entry for itself').not.toContain('./SHA256SUMS.txt');
    expect(names.some((n) => n.endsWith('SHA256SUMS.txt'))).toBe(false);
  });

  it('every recorded digest matches the unpacked bytes, and every packaged file is recorded', () => {
    const manifest = readFileSync(join(unpacked, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    const recorded = new Map<string, string>();
    for (const line of manifest) {
      const [d, ...rest] = line.split(/\s+/);
      recorded.set(rest.join(' '), d!);
    }
    for (const [rel, expected] of recorded) {
      const bytes = readFileSync(join(unpacked, rel));
      expect(createHash('sha256').update(bytes).digest('hex'), rel).toBe(expected);
    }
    // Bidirectional: an unrecorded file is unverifiable evidence just as a wrong digest is.
    const walk = (dir: string, prefix: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name), `${prefix}${e.name}/`)
          : [`${prefix}${e.name}`]);
    const present = walk(unpacked, './').filter((f) => !f.endsWith('SHA256SUMS.txt')).sort();
    expect(present).toEqual([...recorded.keys()].sort());
  });

  it('`sha256sum -c` / `shasum -c` over the manifest reports NO failures', () => {
    const tool = (() => {
      try { execFileSync('sha256sum', ['--version'], { stdio: 'ignore' }); return 'sha256sum'; }
      catch { return null; }
    })();
    const out = tool
      ? execFileSync('sha256sum', ['-c', 'SHA256SUMS.txt'], { cwd: unpacked, encoding: 'utf8' })
      : execFileSync('shasum', ['-a', '256', '-c', 'SHA256SUMS.txt'], { cwd: unpacked, encoding: 'utf8' });
    // execFileSync throws on a nonzero exit, so reaching here already means it verified.
    expect(out).not.toMatch(/FAILED/);
    expect(out.trim().split('\n').every((l) => l.endsWith(': OK'))).toBe(true);
  });

  it('the isolated cache and the staged binaries are excluded, and the reports are included', () => {
    const files = readFileSync(join(unpacked, 'SHA256SUMS.txt'), 'utf8');
    expect(files).not.toMatch(/\.trivy-cache/);
    expect(files).not.toMatch(/\.staged-scanners/);
    expect(files).toMatch(/c15\/supply-chain-manifest\.json/);
    expect(files).toMatch(/c15\/RESULT-PASS\.txt/);
    expect(files).toMatch(/c16\/closure-reconciliation\.json/);
  });

  it('a one-byte edit to a packaged file makes the manifest FAIL — it is not decorative', () => {
    const target = join(unpacked, 'c15', 'RESULT-PASS.txt');
    writeFileSync(target, 'FAIL\n');
    let threw = false;
    let combined = '';
    try {
      execFileSync('sh', ['-c', '(sha256sum -c SHA256SUMS.txt 2>&1 || shasum -a 256 -c SHA256SUMS.txt 2>&1)'],
        { cwd: unpacked, encoding: 'utf8' });
    } catch (err) {
      threw = true;
      combined = String((err as { stdout?: string }).stdout ?? '');
    }
    expect(threw || /FAILED/.test(combined), 'a tampered member must not verify').toBe(true);
  });

  it('a malformed source SHA is refused rather than packaged under a wrong name', () => {
    const dest = mkdtempSync(join(tmpdir(), 'eye-pkg-bad-'));
    for (const bad of ['', 'not-hex', 'ABCDEF'.repeat(6) + 'abcd', 'a'.repeat(39)]) {
      let threw = false;
      try {
        execFileSync('bash', [SCRIPT, join(work, 'c15'), join(work, 'c16'), bad, dest],
          { encoding: 'utf8', stdio: 'pipe' });
      } catch { threw = true; }
      expect(threw, `SHA '${bad}' must be refused`).toBe(true);
    }
    rmSync(dest, { recursive: true, force: true });
  });
});
