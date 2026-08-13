/**
 * FROZEN HISTORICAL FIXTURE — used ONLY by the frozen R3.1/R3.2/R3.3 control suites.
 *
 * C16-R3.4 note: this builder satisfies the contracts those verifiers enforced, and nothing
 * newer. It is deliberately NOT used against the live verifier: pointing an old fixture at a
 * stricter verifier is what produced two rounds of false fixtures, most recently one claiming
 * `counts.nodes: 195` while shipping `components: []`.
 *
 * The live verifier is covered by `helpers/evidence-fixture-r34.ts`, whose C16 half is the real
 * source derivation — real graph, real reconciliation, real bytes.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const FIXTURE_SHA = '1'.repeat(40);
export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export type Pins = {
  tools: Record<string, { artifacts: Record<string, { executable_sha256: string }> }>;
};
export type DescriptorTarget = {
  id: string; os: string; arch: string; libc: string;
  node: { pinned: string }; pnpm: { pinned: string };
  description: string; importer_roots: string[]; dependency_scopes: string[];
};

/** The two digest-pinned images a Phase 0 run scans. Shape matters; the digests are fixture values. */
export const FIXTURE_IMAGES = [
  `postgres@sha256:${'a'.repeat(64)}`,
  `redis@sha256:${'b'.repeat(64)}`,
];

export const NORMAL_STEP_CONTRACT = [
  { id: 'pnpm-audit-human', tool: 'pnpm', policy: 'blocking' },
  { id: 'pnpm-audit-json', tool: 'pnpm', policy: 'informational' },
  { id: 'gitleaks-worktree', tool: 'gitleaks', policy: 'blocking' },
  { id: 'gitleaks-history', tool: 'gitleaks', policy: 'blocking' },
  { id: 'trivy-fs', tool: 'trivy', policy: 'blocking' },
  { id: 'trivy-fs-json', tool: 'trivy', policy: 'informational' },
] as const;
export const ACQUISITION_STEP_IDS = ['trivy-acquire-db', 'trivy-acquire-checks'] as const;

export type BuiltEvidence = {
  c15Dir: string;
  c16Dir: string;
  hostKey: string;
  tools: string[];
  imageStepIds: string[];
  normalStepIds: string[];
  descriptor: Record<string, DescriptorTarget>;
  sbomFileFor: (targetName: string) => string;
};

/**
 * Write a passing pair under `root`. `repo` supplies the tracked descriptor and pins; pass a
 * fabricated repo to exercise the verifier's contract checks against altered inputs.
 */
export function buildPassingEvidence(root: string, repo: string): BuiltEvidence {
  const c15 = join(root, 'c15');
  const c16 = join(root, 'c16');
  mkdirSync(c15, { recursive: true });
  mkdirSync(c16, { recursive: true });

  const pins = JSON.parse(readFileSync(join(repo, 'scripts/gate/scanner-pins.json'), 'utf8')) as Pins;
  const tools = Object.keys(pins.tools);
  // Any platform every pinned tool covers; a real run uses its own host the same way.
  const hostKey = Object.keys(pins.tools[tools[0]!]!.artifacts).find((k) =>
    tools.every((t) => pins.tools[t]!.artifacts[k] !== undefined),
  )!;
  const descriptor = (JSON.parse(
    readFileSync(join(repo, 'scripts/gate/target-descriptor.json'), 'utf8'),
  ) as { targets: Record<string, DescriptorTarget> }).targets;

  // ── C15 raw streams, one pair per step ────────────────────────────────────────
  const imageStepIds = FIXTURE_IMAGES.map((_, i) => `trivy-image-${i}`);
  const normalStepIds = [...NORMAL_STEP_CONTRACT.map((s) => s.id), ...imageStepIds];
  const streamBody = (id: string, stream: string) => `${id} ${stream}: fixture output\n`;

  const writeStreams = (id: string) => {
    const out = { stdout: `${id}.stdout.txt`, stderr: `${id}.stderr.txt` };
    writeFileSync(join(c15, out.stdout), streamBody(id, 'stdout'));
    writeFileSync(join(c15, out.stderr), streamBody(id, 'stderr'));
    return out;
  };
  const stepReceipt = (id: string, tool: string, policy: string) => {
    const files = writeStreams(id);
    const so = readFileSync(join(c15, files.stdout));
    const se = readFileSync(join(c15, files.stderr));
    return {
      id, tool, policy,
      exit_code: 0, failed: false, signal: null,
      source_sha: FIXTURE_SHA,
      stdout_file: files.stdout, stdout_bytes: so.length, stdout_sha256: sha256(so),
      stderr_file: files.stderr, stderr_bytes: se.length, stderr_sha256: sha256(se),
    };
  };

  const steps = [
    ...NORMAL_STEP_CONTRACT.map((s) => stepReceipt(s.id, s.tool, s.policy)),
    ...imageStepIds.map((id) => stepReceipt(id, 'trivy', 'blocking')),
  ];
  const acquisitionSteps = ACQUISITION_STEP_IDS.map((id) => stepReceipt(id, 'trivy', 'blocking'));

  // ── governed reports ─────────────────────────────────────────────────────────
  writeFileSync(join(c15, 'RESULT-PASS.txt'), 'C15 PASS\n');
  writeFileSync(join(c15, 'gitleaks-worktree.json'), '[]');
  writeFileSync(join(c15, 'gitleaks-history.json'), '[]');
  writeFileSync(join(c15, 'image-findings.json'), JSON.stringify({ findings: [] }));

  // ── excluded by documented design: the cache and the staged binaries ──────────
  mkdirSync(join(c15, '.trivy-cache', 'db'), { recursive: true });
  writeFileSync(join(c15, '.trivy-cache', 'db', 'trivy.db'), 'cache bytes');
  mkdirSync(join(c15, '.staged-scanners'), { recursive: true });
  for (const t of tools) writeFileSync(join(c15, '.staged-scanners', t), `${t} staged bytes`);

  // ── the cache fingerprint, built exactly as trivy-cache.mjs builds it ────────
  const entries = [
    { path: 'db/metadata.json', present: true, bytes: 150, sha256: sha256('db metadata') },
    { path: 'db/trivy.db', present: true, bytes: 1232056320, sha256: sha256('db artifact') },
    { path: 'policy/metadata.json', present: true, bytes: 152, sha256: sha256('policy metadata') },
  ];
  const checksManifest = [
    { path: 'policy/content/a.yaml', bytes: 11, sha256: sha256('check bytes a') },
    { path: 'policy/content/b.yaml', bytes: 22, sha256: sha256('check bytes b') },
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

  // ── the scanner digest chain: every link is the tracked pin ───────────────────
  const verified: Record<string, unknown> = {};
  const stagedAfter: Record<string, unknown> = {};
  for (const t of tools) {
    const digest = pins.tools[t]!.artifacts[hostKey]!.executable_sha256;
    verified[t] = {
      resolved_path: `/usr/local/bin/${t}`,
      actual_sha256: digest, expected_sha256: digest, staged_sha256: digest,
      match: true, authenticated_before_first_execution: true,
      staged_path: join(c15, '.staged-scanners', t),
    };
    stagedAfter[t] = {
      staged_path: join(c15, '.staged-scanners', t),
      sha256_after: digest, expected: digest, match: true,
    };
  }

  const bind = (dir: string, names: string[]) =>
    names.map((name) => {
      const bytes = readFileSync(join(dir, name));
      return { path: name, bytes: bytes.length, sha256: sha256(bytes) };
    });

  const c15Names = [
    'RESULT-PASS.txt', 'gitleaks-worktree.json', 'gitleaks-history.json', 'image-findings.json',
    ...[...steps, ...acquisitionSteps].flatMap((s) => [s.stdout_file, s.stderr_file]),
  ];

  const c15Manifest = {
    mode: 'final',
    outcome: 'PASS',
    source_sha: FIXTURE_SHA,
    host_platform_key: hostKey,
    digest_pinned_images: [...FIXTURE_IMAGES],
    tree_clean_at_run: true,
    tree_clean_after_scanning: true,
    worktree_unchanged_by_scanning: true,
    trivy_cache_unchanged: true,
    trivy_cache_fingerprint_before: fingerprint(),
    trivy_cache_fingerprint_after: fingerprint(),
    trivy_cache_acquisition: { cacheDir: join(c15, '.trivy-cache'), steps: acquisitionSteps },
    failures: [],
    executed_binary_authentication: { verified },
    staged_tools_after_scanning: stagedAfter,
    steps,
    evidence_artifacts: bind(c15, c15Names),
    image_finding_reconciliation: {
      total_findings: 16, matched: 3, unmatched: [], unused_records: [], stale_advisory_ids: [],
    },
    step_policy_audit: { every_informational_step_duplicates_a_blocking_step: true },
  };

  // ── C16: a receipt plus one SBOM per descriptor target ────────────────────────
  writeFileSync(join(c16, 'RESULT-PASS.txt'), 'C16 PASS\n');
  const sbomFileFor = (name: string) => `sbom-${descriptor[name]!.id}.cdx.json`;
  const targets: Record<string, unknown> = {};
  const c16Names = ['RESULT-PASS.txt'];

  for (const [name, declared] of Object.entries(descriptor)) {
    const file = sbomFileFor(name);
    const serial = `urn:uuid:${declared.id.replace(/[^0-9a-f]/g, '0').padEnd(32, '0').slice(0, 8)}-0000-5000-8000-000000000000`;
    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      serialNumber: serial,
      metadata: {
        component: {
          'bom-ref': `eye:target:${declared.id}`,
          type: 'application',
          name: 'the-eye',
          version: '0.0.1',
          description: declared.description,
        },
        properties: [
          { name: 'eye:source-sha', value: FIXTURE_SHA },
          { name: 'eye:target-id', value: declared.id },
          { name: 'eye:target-os', value: declared.os },
          { name: 'eye:target-arch', value: declared.arch },
          { name: 'eye:target-libc', value: declared.libc },
          { name: 'eye:target-node', value: declared.node.pinned },
          { name: 'eye:target-pnpm', value: declared.pnpm.pinned },
          { name: 'eye:dependency-scopes', value: declared.dependency_scopes.join(',') },
          { name: 'eye:importer-roots', value: declared.importer_roots.join(',') },
        ],
      },
      components: [],
      dependencies: [],
    };
    const body = JSON.stringify(sbom, null, 2);
    writeFileSync(join(c16, file), body);
    c16Names.push(file);
    const bytes = readFileSync(join(c16, file));
    targets[name] = {
      target: { ...declared, integrity_rules: [] },
      subject_ref: `eye:target:${declared.id}`,
      serial_number: serial,
      sbom_file: file,
      sbom_bytes: bytes.length,
      sbom_sha256: sha256(bytes),
      counts: { nodes: 195, subject_root_edges: 4 },
      reconciliation: { clean: true, subject_root_edges_present: 4 },
    };
  }

  const c16Manifest = {
    status:
      'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA',
    generated_from: { source_sha: FIXTURE_SHA },
    final_source_posture: { expected_sha: FIXTURE_SHA, head_sha: FIXTURE_SHA, worktree_clean: true },
    targets,
    vulnerable_residuals: [],
    governed_exclusions: { rejected: [], cardinality_problems: [] },
    evidence_artifacts: bind(c16, c16Names),
  };

  writeFileSync(join(c15, 'supply-chain-manifest.json'), JSON.stringify(c15Manifest, null, 2));
  writeFileSync(join(c16, 'closure-reconciliation.json'), JSON.stringify(c16Manifest, null, 2));

  return {
    c15Dir: c15, c16Dir: c16, hostKey, tools,
    imageStepIds, normalStepIds, descriptor, sbomFileFor,
  };
}

/** Read, mutate and rewrite a manifest in place. */
export function editManifest(dir: string, name: string, mutate: (m: Record<string, any>) => void) {
  const path = join(dir, name);
  const m = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  mutate(m);
  writeFileSync(path, JSON.stringify(m, null, 2));
}
