/**
 * C17.2 I — the cross-host comparison is an artifact, not a delivery-report sentence.
 *
 * These controls exercise the tracked creator and verifier.  Every mutation is rebound into the
 * outer SHA256SUMS.txt; mutations to the embedded Linux archive are also rebound into its own
 * checksum manifest.  A rejection at the old checksum layer therefore cannot satisfy a test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import {
  canonicalJson, createCrossHostFinalization, verifyCrossHostFinalization,
  verifyFinalizerHostedRun,
  CROSS_HOST_ARTIFACTS, DEVELOPMENT_COMPONENTS, FINALIZED_PAYLOAD,
  REQUIRED_FINALIZER_STEPS, finalizerRunUrl, finalizerJobsUrl, finalizerArtifactsUrl,
  writeFinalizerReceipt,
} from '../../../../scripts/gate/c17-cross-host-finalization.mjs';
// The artifact naming contract is centralized: the finalizer module owns no second copy.
import { finalizerArtifactName } from '../../../../scripts/gate/lib/hosted-run.mjs';

const SHA = 'a'.repeat(40);
const AS_OF = '2026-08-16';
const FIXED = new Date('1980-01-01T00:00:00.000Z');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function walk(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(root, abs));
    else out.push(relative(root, abs).split(sep).join('/'));
  }
  return out;
}

function write(root: string, rel: string, bytes: string | Buffer) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

function checksums(root: string) {
  const files = walk(root).filter((p) => p !== 'SHA256SUMS.txt').sort();
  writeFileSync(join(root, 'SHA256SUMS.txt'), `${files.map((p) => `${hash(readFileSync(join(root, p)))}  ${p}`).join('\n')}\n`);
}

function zipExact(root: string, zip: string) {
  const files = walk(root).sort();
  for (const file of files) {
    chmodSync(join(root, file), 0o644);
    utimesSync(join(root, file), FIXED, FIXED);
  }
  const r = spawnSync('zip', ['-qX', zip, ...files], { cwd: root, encoding: 'utf8' });
  expect(r.status, `zip failed: ${r.stderr}`).toBe(0);
}

function unzip(zip: string, prefix: string) {
  const out = mkdtempSync(join(tmpdir(), prefix));
  const r = spawnSync('unzip', ['-q', zip, '-d', out], { encoding: 'utf8' });
  expect(r.status, `unzip failed: ${r.stderr}`).toBe(0);
  return out;
}

const components = (n: number) => Array.from({ length: n }, (_, i) => ({
  'bom-ref': `pkg:npm/example-${i}@1.0.0`, type: 'library', name: `example-${i}`, version: '1.0.0',
}));

function bytesFor(id: string, development = DEVELOPMENT_COMPONENTS): string {
  if (id === 'sbom-production') return canonicalJson({ bomFormat: 'CycloneDX', components: components(195) });
  if (id === 'sbom-development') return canonicalJson({ bomFormat: 'CycloneDX', components: components(development) });
  if (id === 'license-inventory') {
    return canonicalJson({
      targets: {
        production: { components: components(195), unresolved: [] },
        development: { components: components(development), unresolved: [] },
      },
    });
  }
  if (id === 'license-reconciliation') {
    return canonicalJson({
      targets: {
        production: { closure_components: 195, inventory_classified: 195 },
        development: { closure_components: development, inventory_classified: development },
      },
      unresolved: [],
    });
  }
  if (id === 'third-party-notices') return '# Third-party notices\n\nComplete legal text.\n';
  return canonicalJson({ artifact: id, complete: true, records: [{ id: `${id}-1` }] });
}

function c17Manifest() {
  return {
    result: 'PASS', mode: 'final', generated_from: { source_sha: SHA, as_of: AS_OF },
    artifacts: CROSS_HOST_ARTIFACTS.filter((artifact) => artifact.generatedGroup === 'c17').map((artifact) => {
      const bytes = Buffer.from(bytesFor(artifact.id));
      return { path: artifact.generated, bytes: bytes.byteLength, sha256: hash(bytes) };
    }),
    final_source_posture: {
      mode: 'final', expected_sha: SHA, head_sha: SHA,
      worktree_clean_before: true, worktree_clean_after: true,
      output_outside_repo: true, target_materialization: true, test_seams: [],
    },
  };
}

function sourceReceipt() {
  return {
    source_sha: SHA, worktree_clean: true, mode: 'final', c17_result: 'PASS', c17_as_of: AS_OF,
  };
}

function sourceRunReceipt() {
  return {
    hosted: true, repository: 'a-Halawany/elven', workflow: 'ci', job: 'supply-chain',
    workflow_ref: 'a-Halawany/elven/.github/workflows/ci.yml@refs/heads/main',
    run_id: '424242', run_attempt: '1', head_sha: SHA,
    ref: 'refs/heads/main', event: 'push', runner_os: 'Linux', runner_arch: 'X64',
  };
}

function finalizerReceipt() {
  return {
    schema_version: '1.0.0', hosted: true, repository: 'a-Halawany/elven',
    workflow: 'C17 finalize', workflow_path: '.github/workflows/c17-finalize.yml', job: 'finalize',
    workflow_ref: 'a-Halawany/elven/.github/workflows/c17-finalize.yml@refs/heads/main',
    run_id: '525252', run_attempt: '1', source_run_id: '424242', source_run_attempt: '1',
    head_sha: SHA, head_branch: 'main',
    source_sha: SHA, as_of: AS_OF, runner_os: 'macOS', runner_arch: 'ARM64',
    ref: 'refs/heads/main', event: 'workflow_run', source_status: 'completed',
    source_conclusion: 'success', source_event: 'push', source_head_branch: 'main',
  };
}

type Fixture = {
  root: string; sourceZip: string; darwinC16: string; darwinC17: string;
  finalizer: string; output: string; finalized: string;
};

function buildFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'eye-c17-cross-host-fixture-'));
  const source = join(root, 'source');
  const darwinC16 = join(root, 'darwin-c16');
  const darwinC17 = join(root, 'darwin-c17');
  const output = join(root, 'out');
  mkdirSync(source, { recursive: true });
  mkdirSync(darwinC16, { recursive: true });
  mkdirSync(darwinC17, { recursive: true });
  mkdirSync(output, { recursive: true });
  for (const a of CROSS_HOST_ARTIFACTS) {
    const bytes = bytesFor(a.id);
    write(source, a.source, bytes);
    write(a.generatedGroup === 'c16' ? darwinC16 : darwinC17, a.generated, bytes);
  }
  write(source, 'receipt/source-receipt.json', canonicalJson(sourceReceipt()));
  write(source, 'receipt/run-receipt.json', canonicalJson(sourceRunReceipt()));
  write(source, 'licence/c17-manifest.json', canonicalJson(c17Manifest()));
  checksums(source);
  const sourceZip = join(root, 'source.zip');
  zipExact(source, sourceZip);
  write(darwinC17, 'c17-manifest.json', canonicalJson(c17Manifest()));
  const finalizer = join(root, 'finalizer.json');
  writeFileSync(finalizer, canonicalJson(finalizerReceipt()));
  const made = createCrossHostFinalization({
    sourceZip, darwinC16Dir: darwinC16, darwinC17Dir: darwinC17,
    finalizerReceiptPath: finalizer, outDir: output,
  });
  expect(made.ok, made.problems.join('\n')).toBe(true);
  return { root, sourceZip, darwinC16, darwinC17, finalizer, output, finalized: made.zip as string };
}

function mutateFinalized(baseZip: string, mutate: (root: string) => void) {
  const root = unzip(baseZip, 'eye-c17-cross-host-mut-');
  mutate(root);
  checksums(root); // every mutation is rebound into the outer manifest
  const zip = join(dirname(root), `${root.split('/').pop()}-mutated.zip`);
  zipExact(root, zip);
  return { root, zip };
}

function updateComparison(root: string, mutate: (doc: any) => void) {
  const path = join(root, 'cross-host-comparison.json');
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  mutate(doc);
  writeFileSync(path, canonicalJson(doc));
}

function rebindComparisonArtifacts(root: string) {
  const sourceDir = unzip(join(root, 'source/c17-evidence.zip'), 'eye-c17-cross-source-rebind-');
  try {
    updateComparison(root, (doc) => {
      const sourceArchive = readFileSync(join(root, 'source/c17-evidence.zip'));
      doc.source.archive = { bytes: sourceArchive.byteLength, sha256: hash(sourceArchive) };
      for (const a of CROSS_HOST_ARTIFACTS) {
        const claim = doc.artifacts.find((x: any) => x.id === a.id);
        const linux = readFileSync(join(sourceDir, a.source));
        const macos = readFileSync(join(root, a.darwin));
        claim.linux = { bytes: linux.byteLength, sha256: hash(linux) };
        claim.macos = { bytes: macos.byteLength, sha256: hash(macos) };
        claim.equal = true; // attacker keeps the PASS claim, even if the bytes disagree
      }
      doc.result = 'PASS';
    });
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
  }
}

const sourceVerifier = async () => ({ ok: true, problems: [], notes: ['source_archive=PASS'] });
const verifyFinal = (zipPath: string, options: Record<string, unknown> = {}) =>
  verifyCrossHostFinalization({ zipPath, sourceArchiveVerifier: sourceVerifier, ...options });

type ApiSet = { run: any; jobs: any; artifacts: any };
let hostedFinalizedZip = '';

function passingApi(finalizedZip = hostedFinalizedZip): ApiSet {
  const finalizedDigest = hash(readFileSync(finalizedZip));
  return {
    run: {
      id: 525252, run_attempt: 1, repository: { full_name: 'a-Halawany/elven' },
      name: 'C17 finalize', path: '.github/workflows/c17-finalize.yml', event: 'workflow_run',
      head_branch: 'main', head_sha: SHA, status: 'completed', conclusion: 'success',
    },
    jobs: {
      total_count: 1,
      jobs: [{
        name: 'finalize', head_sha: SHA, status: 'completed',
        conclusion: 'success', labels: ['macos-14'],
        steps: REQUIRED_FINALIZER_STEPS.map((name) => ({
          name, status: 'completed', conclusion: 'success',
        })),
      }],
    },
    artifacts: {
      total_count: 1,
      artifacts: [{
        name: finalizerArtifactName('1', finalizedDigest), expired: false, size_in_bytes: 12345,
        digest: `sha256:${'d'.repeat(64)}`,
        workflow_run: { id: 525252, head_sha: SHA },
      }],
    },
  };
}

function apiFetch(api: ApiSet, seen: string[] = []) {
  const bodies = new Map<string, unknown>([
    [finalizerRunUrl('525252'), api.run],
    [finalizerJobsUrl('525252', '1'), api.jobs],
    [finalizerArtifactsUrl('525252'), api.artifacts],
  ]);
  return async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    const body = bodies.get(url);
    if (body === undefined) {
      return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) } as Response;
    }
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => structuredClone(body),
    } as Response;
  };
}

describe('C17.2 I — machine-bound cross-host finalization', () => {
  let f: Fixture;
  beforeAll(() => { f = buildFixture(); hostedFinalizedZip = f.finalized; });
  afterAll(() => { rmSync(f.root, { recursive: true, force: true }); });

  it('creates a canonical exact-nine comparison and verifies it independently', async () => {
    const result = await verifyFinal(f.finalized);
    expect(result.ok, result.problems.join('\n')).toBe(true);
    expect(result.notes.join('\n')).toMatch(/cross_host_artifacts=9 development_components=312/);
    const dir = unzip(f.finalized, 'eye-c17-cross-host-positive-');
    try {
      const comparison = JSON.parse(readFileSync(join(dir, 'cross-host-comparison.json'), 'utf8'));
      expect(comparison.artifacts).toHaveLength(9);
      expect(comparison.artifacts.every((a: any) => a.equal === true)).toBe(true);
      expect(comparison.contract.development_components).toBe(312);
      expect(walk(dir).sort()).toEqual([...FINALIZED_PAYLOAD, 'SHA256SUMS.txt'].sort());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('parses the tracked workflow and enforces the real macOS finalizer wiring', () => {
    const workflow = parseYaml(readFileSync(join(REPO_ROOT, '.github/workflows/c17-finalize.yml'), 'utf8'));
    expect(workflow.on.workflow_run.workflows).toEqual(['ci']);
    expect(workflow.on.workflow_run.types).toEqual(['completed']);
    const job = workflow.jobs.finalize;
    expect(job['runs-on']).toBe('macos-14');
    const named = new Map(job.steps.filter((step: any) => step.name).map((step: any) => [step.name, step]));
    for (const name of REQUIRED_FINALIZER_STEPS) expect(named.has(name), name).toBe(true);

    const generate = String(named.get('Generate FINAL C16 + C17 artifacts on macOS ARM64').run);
    expect(generate).toContain('scripts/gate/generate-closures.mjs');
    expect(generate).toContain('scripts/gate/licence-obligations.mjs');
    expect(generate.match(/--final/g)).toHaveLength(2);
    expect(generate.match(/--expected-sha "\$\{\{ github\.event\.workflow_run\.head_sha \}\}"/g)).toHaveLength(2);

    const create = String(named.get('Create + verify the finalized cross-host evidence').run);
    expect(create).toContain('c17-cross-host-finalization.mjs create');
    expect(create).toContain('c17-cross-host-finalization.mjs verify');
    expect(create).toContain('--zip "$FINAL_ZIP" --root "$PWD"');
    const upload: any = named.get('Upload the FINALIZED cross-host evidence');
    expect(upload.with.name).toBe(
      `c17-evidence-finalized-a${'${{ github.run_attempt }}'}-${'${{ env.C17_FINALIZED_SHA256 }}'}`,
    );
    // Statically nonempty upload path: a deterministic directory under the runner temp root,
    // never an `${{ env.* }}` value that is empty when the producing step did not run.
    expect(upload.with.path).toBe('${{ runner.temp }}/finalized');
  });

  it('derives the finalizer receipt from the real Actions event/env and refuses a forged event', () => {
    const env = {
      GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'a-Halawany/elven',
      GITHUB_WORKFLOW: 'C17 finalize',
      GITHUB_WORKFLOW_REF: 'a-Halawany/elven/.github/workflows/c17-finalize.yml@refs/heads/main',
      GITHUB_JOB: 'finalize', GITHUB_RUN_ID: '525252', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: SHA, GITHUB_REF_NAME: 'main', GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_run', RUNNER_OS: 'macOS', RUNNER_ARCH: 'ARM64',
    };
    const event = {
      workflow_run: {
        id: 424242, run_attempt: 1, head_sha: SHA, status: 'completed',
        conclusion: 'success', event: 'push', head_branch: 'main',
      },
    };
    const path = join(f.root, 'derived-finalizer-receipt.json');
    const result = writeFinalizerReceipt({ sourceZip: f.sourceZip, outPath: path, env, event });
    expect(result.ok, result.problems.join('\n')).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(finalizerReceipt());

    const forged = structuredClone(event);
    forged.workflow_run.id = 999999;
    const refused = writeFinalizerReceipt({
      sourceZip: f.sourceZip, outPath: join(f.root, 'forged-receipt.json'), env, event: forged,
    });
    expect(refused.ok).toBe(false);
    expect(refused.problems.join('\n')).toMatch(/source run id|event id differs/);
  });

  it('is byte-deterministic for identical inputs', () => {
    const another = join(f.root, 'another');
    const made = createCrossHostFinalization({
      sourceZip: f.sourceZip, darwinC16Dir: f.darwinC16, darwinC17Dir: f.darwinC17,
      finalizerReceiptPath: f.finalizer, outDir: another,
    });
    expect(made.ok, made.problems.join('\n')).toBe(true);
    expect(readFileSync(made.zip as string).equals(readFileSync(f.finalized))).toBe(true);
  });

  it('refuses a non-empty output directory without following a pre-existing sidecar symlink', () => {
    const output = join(f.root, 'sentinel-output');
    const sentinel = join(f.root, 'sentinel.txt');
    const zip = join(output, `c17-cross-host-finalized-${SHA}.zip`);
    mkdirSync(output);
    writeFileSync(sentinel, 'DO NOT MUTATE\n');
    symlinkSync(sentinel, `${zip}.sha256`);

    const made = createCrossHostFinalization({
      sourceZip: f.sourceZip, darwinC16Dir: f.darwinC16, darwinC17Dir: f.darwinC17,
      finalizerReceiptPath: f.finalizer, outDir: output,
    });
    expect(made.ok).toBe(false);
    expect(made.problems.join('\n')).toMatch(/output directory is not empty/);
    expect(readFileSync(sentinel, 'utf8')).toBe('DO NOT MUTATE\n');
    expect(existsSync(zip)).toBe(false);
  });

  it('refuses a symlink as the finalization output directory', () => {
    const realOutput = join(f.root, 'real-output');
    const linkedOutput = join(f.root, 'linked-output');
    mkdirSync(realOutput);
    symlinkSync(realOutput, linkedOutput);

    const made = createCrossHostFinalization({
      sourceZip: f.sourceZip, darwinC16Dir: f.darwinC16, darwinC17Dir: f.darwinC17,
      finalizerReceiptPath: f.finalizer, outDir: linkedOutput,
    });
    expect(made.ok).toBe(false);
    expect(made.problems.join('\n')).toMatch(/output path is not a real directory/);
    expect(readdirSync(realOutput)).toEqual([]);
  });

  it.each([
    ['missing payload', (root: string) => rmSync(join(root, CROSS_HOST_ARTIFACTS[0].darwin))],
    ['extra payload', (root: string) => write(root, 'attacker/extra.txt', 'bound extra')],
  ])('rejects a fully-checksummed %s', async (_label, mutate) => {
    const m = mutateFinalized(f.finalized, mutate);
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/missing|extra/i);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects a duplicate artifact record after the comparison and checksums are rebound', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      updateComparison(root, (doc) => doc.artifacts.push(structuredClone(doc.artifacts[0])));
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/duplicates artifact|10 artifact records/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects a duplicate ZIP member before extraction', async () => {
    const root = unzip(f.finalized, 'eye-c17-cross-host-duplicate-entry-');
    const zip = join(dirname(root), `${root.split('/').pop()}-duplicate.zip`);
    // Two genuine central-directory members with the SAME path — the ambiguity the verifier must
    // reject before extraction, because which of the two a consumer reads is unspecified.
    //
    // Built with python's zipfile rather than `zipnote -w`. zipnote exits 10 with "Bad file
    // descriptor" on macOS 14 (Info-ZIP 3.0, 2008), so the original construction failed on the
    // host rather than on the code under test — a control that cannot run proves nothing. python3
    // is present on this host and on both GitHub runner images in play.
    const build = spawnSync('python3', ['-c', [
      'import sys, zipfile, os',
      'src, dst = sys.argv[1], sys.argv[2]',
      'names = []',
      'with zipfile.ZipFile(src) as z:',
      '    items = [(i.filename, z.read(i.filename)) for i in z.infolist() if not i.is_dir()]',
      'dup = "cross-host-comparison.json"',
      'with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as o:',
      '    for name, data in items:',
      '        o.writestr(name, data)',
      '    o.writestr(dup, [d for n, d in items if n == dup][0])',
    ].join('\n'), f.finalized, zip], { encoding: 'utf8' });
    expect(build.status, build.stderr).toBe(0);
    // Non-vacuity: the archive really does carry the same path twice.
    const listed = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout
      .split('\n').filter((l) => l.trim() === 'cross-host-comparison.json');
    expect(listed.length, 'the fixture must contain a genuine duplicate member').toBe(2);
    try {
      const result = await verifyFinal(zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/duplicate entry 'cross-host-comparison\.json'/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects a SAME-LENGTH macOS tamper with every digest and PASS claim rebound', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      const path = join(root, 'darwin/licence/THIRD_PARTY_NOTICES.md');
      const before = readFileSync(path);
      const after = Buffer.from(before);
      after[after.length - 2] = after[after.length - 2] === 0x58 ? 0x59 : 0x58;
      expect(after.byteLength).toBe(before.byteLength);
      writeFileSync(path, after);
      rebindComparisonArtifacts(root);
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/third-party-notices.*equality claim is false|third-party-notices.*bytes differ/);
      expect(result.problems.join('\n')).not.toMatch(/checksum claims/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects a rebound false C17 manifest artifact table', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      const path = join(root, 'darwin/c17-manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      const record = manifest.artifacts.find((item: any) => item.path === 'THIRD_PARTY_NOTICES.md');
      record.sha256 = 'f'.repeat(64);
      record.bytes += 1;
      writeFileSync(path, canonicalJson(manifest));
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/manifest artifact 'THIRD_PARTY_NOTICES\.md' does not match delivered bytes/);
      expect(result.problems.join('\n')).not.toMatch(/checksum claims/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects a rebound macOS manifest with a non-final final-source posture', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      const path = join(root, 'darwin/c17-manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.final_source_posture.mode = 'preliminary';
      writeFileSync(path, canonicalJson(manifest));
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(
        /macOS C17 manifest final_source_posture\.mode.*preliminary.*expected 'final'/,
      );
      expect(result.problems.join('\n')).not.toMatch(/checksum claims/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects forged equality and contract counts with the outer checksum rebound', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      updateComparison(root, (doc) => {
        doc.artifacts[0].equal = false;
        doc.contract.artifact_count = 8;
      });
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/artifact_count.*expected 9/);
      expect(result.problems.join('\n')).toMatch(/equality claim is false/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it.each([
    ['SHA', (root: string) => {
      const receiptPath = join(root, 'finalizer-receipt.json');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt.source_sha = 'f'.repeat(40);
      writeFileSync(receiptPath, canonicalJson(receipt));
      updateComparison(root, (doc) => { doc.source.source_sha = receipt.source_sha; });
    }],
    ['as-of date', (root: string) => {
      const receiptPath = join(root, 'finalizer-receipt.json');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt.as_of = '2026-08-15';
      writeFileSync(receiptPath, canonicalJson(receipt));
      updateComparison(root, (doc) => { doc.source.as_of = receipt.as_of; });
    }],
  ])('rejects a rebound wrong %s binding', async (_label, mutate) => {
    const m = mutateFinalized(f.finalized, mutate);
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/differs from source evidence|differs from the source receipt/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects two receipts claiming the SAME host', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      const receiptPath = join(root, 'finalizer-receipt.json');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt.runner_os = 'Linux';
      writeFileSync(receiptPath, canonicalJson(receipt));
      updateComparison(root, (doc) => {
        doc.contract.finalizer_host_os = 'Linux';
        doc.finalizer.runner_os = 'Linux';
      });
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/expected macOS|SAME host OS|not Linux -> macOS/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it.each([
    ['api_url', 'file:///tmp/fake-api.json', /undeclared field 'api_url'/],
    ['hosted', false, /not hosted/],
    ['repository', 'attacker/example', /repository must be a-Halawany\/elven/],
    ['workflow', 'Attacker finalize', /workflow is.*expected 'C17 finalize'/],
    ['job', 'attacker', /job is.*expected 'finalize'/],
    ['run_attempt', '2', /run attempt/],
    ['ref', 'refs\/heads\/attacker', /ref is.*expected refs\/heads\/main/],
    ['runner_arch', 'X64', /runner_arch is.*expected ARM64/],
    ['source_conclusion', 'failure', /completed successful main\/push source run/],
  ])('rejects a fully rebound forged finalizer %s', async (field, value, expected) => {
    const m = mutateFinalized(f.finalized, (root) => {
      const receiptPath = join(root, 'finalizer-receipt.json');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt[field] = value;
      writeFileSync(receiptPath, canonicalJson(receipt));
      updateComparison(root, (doc) => {
        if (Object.prototype.hasOwnProperty.call(doc.finalizer, field)) doc.finalizer[field] = value;
        if (field === 'runner_arch') doc.contract.finalizer_host_arch = value;
      });
    });
    try {
      const result = await verifyFinal(m.zip, {
        requireOnline: true, fetchImpl: apiFetch(passingApi()),
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(expected);
      expect(result.problems.join('\n')).not.toMatch(/checksum claims/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('rejects a fully rebound development 296 substitution', async () => {
    const m = mutateFinalized(f.finalized, (root) => {
      const embedded = join(root, 'source/c17-evidence.zip');
      const source = unzip(embedded, 'eye-c17-cross-host-dev296-');
      try {
        for (const a of CROSS_HOST_ARTIFACTS.filter((x) =>
          ['sbom-development', 'license-inventory', 'license-reconciliation'].includes(x.id))) {
          write(source, a.source, bytesFor(a.id, 296));
          write(root, a.darwin, bytesFor(a.id, 296));
        }
        checksums(source);
        rmSync(embedded);
        zipExact(source, embedded);
      } finally { rmSync(source, { recursive: true, force: true }); }
      updateComparison(root, (doc) => { doc.contract.development_components = 296; });
      rebindComparisonArtifacts(root);
    });
    try {
      const result = await verifyFinal(m.zip);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/is 296, expected measured 312/);
      expect(result.problems.join('\n')).toMatch(/development_components is 296, expected 312/);
      expect(result.problems.join('\n')).not.toMatch(/checksum claims/);
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it('requires composition with the original C17 source-archive verifier', async () => {
    const absent = await verifyCrossHostFinalization({ zipPath: f.finalized });
    expect(absent.ok).toBe(false);
    expect(absent.problems.join('\n')).toMatch(/no source-archive verifier was supplied/);

    const rejected = await verifyCrossHostFinalization({
      zipPath: f.finalized,
      sourceArchiveVerifier: async () => ({
        ok: false, problems: ['original C17 verifier rejected substituted semantics'], notes: [],
      }),
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.problems).toContain('original C17 verifier rejected substituted semantics');
  });

  it('constructs all finalizer API endpoints from code-owned data and verifies the real contract', async () => {
    const seen: string[] = [];
    const result = await verifyFinal(f.finalized, {
      requireOnline: true, fetchImpl: apiFetch(passingApi(), seen),
    });
    expect(result.ok, result.problems.join('\n')).toBe(true);
    expect(seen).toEqual([
      finalizerRunUrl('525252'), finalizerJobsUrl('525252', '1'),
      finalizerArtifactsUrl('525252'),
    ]);
    expect(seen.every((url) => url.startsWith('https://api.github.com/repos/a-Halawany/elven/'))).toBe(true);
    expect(result.notes.join('\n')).toMatch(/github_finalizer_run=525252/);
    expect(result.notes.join('\n')).toMatch(
      /github_finalizer_artifact=c17-evidence-finalized-a1-[0-9a-f]{64}/,
    );
  });

  it('binds the submitted inner ZIP bytes to the API-authenticated artifact name', async () => {
    // Repack identical payload bytes with a different ZIP encoding. Offline verification still
    // passes; the API response describes the genuine artifact and therefore names the ORIGINAL
    // inner ZIP digest. Before the digest-in-name correction, this local substitute passed online.
    const m = mutateFinalized(f.finalized, () => {});
    try {
      const offline = await verifyFinal(m.zip);
      expect(offline.ok, offline.problems.join('\n')).toBe(true);
      expect(hash(readFileSync(m.zip))).not.toBe(hash(readFileSync(f.finalized)));

      const online = await verifyFinal(m.zip, {
        requireOnline: true, fetchImpl: apiFetch(passingApi(f.finalized)),
      });
      expect(online.ok).toBe(false);
      expect(online.problems.join('\n')).toMatch(
        /but the delivered archive requires 'c17-evidence-finalized-a1-[0-9a-f]{64}'/,
      );
    } finally { rmSync(m.root, { recursive: true, force: true }); }
  });

  it.each([
    ['failed run conclusion', (api: ApiSet) => { api.run.conclusion = 'failure'; }, /finalizer conclusion.*failure/],
    ['wrong repository', (api: ApiSet) => { api.run.repository.full_name = 'attacker/example'; }, /repository/],
    ['wrong run attempt', (api: ApiSet) => { api.run.run_attempt = 2; }, /run attempt/],
    ['wrong workflow path', (api: ApiSet) => { api.run.path = '.github\/workflows\/attacker.yml'; }, /workflow path/],
    ['wrong head SHA', (api: ApiSet) => { api.run.head_sha = 'b'.repeat(40); }, /head SHA/],
    ['wrong event', (api: ApiSet) => { api.run.event = 'workflow_dispatch'; }, /event/],
    ['failed finalizer job', (api: ApiSet) => { api.jobs.jobs[0].conclusion = 'failure'; }, /job conclusion/],
    ['wrong runner label', (api: ApiSet) => { api.jobs.jobs[0].labels = ['ubuntu-latest']; }, /macos-14/],
    ['missing required step', (api: ApiSet) => { api.jobs.jobs[0].steps.pop(); }, /no finalizer step/],
    ['failed required step', (api: ApiSet) => { api.jobs.jobs[0].steps[0].conclusion = 'failure'; }, /step.*conclusion/],
    ['missing final artifact', (api: ApiSet) => { api.artifacts.artifacts = []; api.artifacts.total_count = 0; }, /no 'c17-evidence-finalized-a1-\*' artifact for attempt 1/],
    ['expired final artifact', (api: ApiSet) => { api.artifacts.artifacts[0].expired = true; }, /expired/],
    ['artifact bound to wrong SHA', (api: ApiSet) => { api.artifacts.artifacts[0].workflow_run.head_sha = 'b'.repeat(40); }, /artifact head SHA/],
    ['missing wrapper digest', (api: ApiSet) => { delete api.artifacts.artifacts[0].digest; }, /wrapper digest/],
    ['malformed wrapper digest', (api: ApiSet) => { api.artifacts.artifacts[0].digest = 'sha256:not-a-digest'; }, /wrapper digest/],
    ['incomplete jobs page', (api: ApiSet) => { api.jobs.total_count = 2; }, /paginated or incomplete/],
    ['duplicate final artifact', (api: ApiSet) => {
      api.artifacts.artifacts.push(structuredClone(api.artifacts.artifacts[0]));
      api.artifacts.total_count = 2;
    }, /2 'c17-evidence-finalized-a1-\*' artifacts for attempt 1/],
    ['extra different-digest finalized artifact', (api: ApiSet) => {
      const extra = structuredClone(api.artifacts.artifacts[0]);
      extra.name = finalizerArtifactName('1', '0'.repeat(64));
      api.artifacts.artifacts.push(extra);
      api.artifacts.total_count = 2;
    }, /2 'c17-evidence-finalized-a1-\*' artifacts for attempt 1/],
  ])('rejects API mutation: %s', async (_label, mutate, expected) => {
    const api = passingApi();
    mutate(api);
    const result = await verifyFinal(f.finalized, {
      requireOnline: true, fetchImpl: apiFetch(api),
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(expected);
  });

  /**
   * Attempt scoping for the FINALIZER artifact — the same centralized selector the source
   * archive uses. After a full re-run of the finalizer, attempt 1's artifact legitimately
   * remains on the run; it may be ignored but must never satisfy or rescue attempt 2.
   */
  describe('finalizer artifact attempt scoping', () => {
    const finalArtifact = (name: string) => ({
      name, expired: false, size_in_bytes: 12345,
      digest: `sha256:${'d'.repeat(64)}`,
      workflow_run: { id: 525252, head_sha: SHA },
    });
    const attempt2Verify = (build: (digest: string) => Array<Record<string, unknown>>) => {
      const digest = hash(readFileSync(hostedFinalizedZip));
      const artifacts = build(digest);
      const receipt = { ...finalizerReceipt(), run_attempt: '2' };
      const bodies = new Map<string, unknown>([
        [finalizerRunUrl('525252'), {
          id: 525252, run_attempt: 2, repository: { full_name: 'a-Halawany/elven' },
          name: 'C17 finalize', path: '.github/workflows/c17-finalize.yml', event: 'workflow_run',
          head_branch: 'main', head_sha: SHA, status: 'completed', conclusion: 'success',
        }],
        [finalizerJobsUrl('525252', '2'), {
          total_count: 1,
          jobs: [{
            name: 'finalize', head_sha: SHA, status: 'completed',
            conclusion: 'success', labels: ['macos-14'],
            steps: REQUIRED_FINALIZER_STEPS.map((name) => ({
              name, status: 'completed', conclusion: 'success',
            })),
          }],
        }],
        [finalizerArtifactsUrl('525252'), { total_count: artifacts.length, artifacts }],
      ]);
      return verifyFinalizerHostedRun(receipt, {
        sourceReceipt: sourceReceipt(), sourceRun: sourceRunReceipt(),
        finalizedZipSha256: digest,
        fetchImpl: (async (input: string | URL) => ({
          ok: true, status: 200, headers: { get: () => null },
          json: async () => structuredClone(bodies.get(String(input)) ?? {}),
        })) as never,
      });
    };

    it('accepts the exact digest-bound artifact of the finalizer\'s OWN attempt', async () => {
      const result = await attempt2Verify((d) => [finalArtifact(finalizerArtifactName('2', d))]);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('ignores an older attempt beside the current exact artifact, and says so', async () => {
      const result = await attempt2Verify((d) => [
        finalArtifact(finalizerArtifactName('1', d)),
        finalArtifact(finalizerArtifactName('2', d)),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.notes.join('\n')).toMatch(/older_attempts_ignored=1/);
    });

    it('REJECTS when only a superseded attempt\'s artifact exists, even with the right digest', async () => {
      const result = await attempt2Verify((d) => [finalArtifact(finalizerArtifactName('1', d))]);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/no 'c17-evidence-finalized-a2-\*' artifact for attempt 2/);
      expect(result.problems.join('\n')).toMatch(/superseded attempt.*cannot satisfy this receipt/s);
    });

    it('an old exact artifact cannot rescue a wrong current one', async () => {
      const result = await attempt2Verify((d) => [
        finalArtifact(finalizerArtifactName('1', d)),
        finalArtifact(finalizerArtifactName('2', '0'.repeat(64))),
      ]);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(
        /but the delivered archive requires 'c17-evidence-finalized-a2-/,
      );
    });

    it('REJECTS multiple current-attempt artifacts', async () => {
      const result = await attempt2Verify((d) => [
        finalArtifact(finalizerArtifactName('2', d)),
        finalArtifact(finalizerArtifactName('2', '0'.repeat(64))),
      ]);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/2 'c17-evidence-finalized-a2-\*' artifacts for attempt 2/);
    });

    it('REJECTS a legacy unscoped artifact name', async () => {
      const result = await attempt2Verify((d) => [finalArtifact(`c17-evidence-finalized-${d}`)]);
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toMatch(/no 'c17-evidence-finalized-a2-\*' artifact for attempt 2/);
    });
  });

  it('retains an injectable hosted verifier only as a non-vacuous test seam', async () => {
    let calls = 0;
    const present = await verifyFinal(f.finalized, {
      requireOnline: true,
      onlineVerifier: async ({ source, finalizer, comparison }: any) => {
        calls += 1;
        expect(source.run_id).toBe('424242');
        expect(finalizer.run_id).toBe('525252');
        expect(comparison.source.source_sha).toBe(SHA);
        return { ok: true, problems: [], notes: ['mock_online=PASS'] };
      },
    });
    expect(calls).toBe(1);
    expect(present.ok, present.problems.join('\n')).toBe(true);
    expect(present.notes).toContain('mock_online=PASS');
  });
});
