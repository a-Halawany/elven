/**
 * C16-R3.4 — THE SOURCE-OWNED VERIFICATION CONTRACT.
 *
 * ── THE CONSTITUTIONAL RULE THIS MODULE EXISTS TO ENFORCE ────────────────────────
 * No evidence value may define the expectation used to validate itself.
 *
 * Three previous rounds of this verifier were defeated the same way: an expectation was
 * derived from the very document being checked. R3.1 compared constants but never opened a
 * file. R3.2 opened the files behind bindings but trusted every other claim. R3.3 constrained
 * the step SET but took the pinned image list — a manifest field — as the definition of what
 * that set should be, so replacing both configured images with one attacker-chosen digest and
 * deleting the second step, its files and its bindings produced a perfectly consistent,
 * perfectly accepted package.
 *
 * Everything here is read from TRACKED SOURCE ONLY:
 *   docker-compose.yml            → the exact ordered infrastructure image set
 *   conformance.manifest.json     → an independent copy of that set, required to agree
 *   scripts/gate/target-descriptor.json → the exact closure target definitions
 *   scripts/gate/scanner-pins.json → scanner identities, versions and executable digests
 *   package.json / this file       → tool versions and the step/argv/cache/inventory contracts
 *
 * An evidence manifest may REPORT any of these. It may never define what is expected.
 *
 * Controlled-key lookups use `Object.hasOwn` and null-prototype maps throughout: a
 * prototype-sensitive `in` check answers true for `toString`, `constructor` and `__proto__`,
 * which is how a fabricated key passes for a governed one.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..', '..');

export const SHA256_HEX = /^[a-f0-9]{64}$/;
export const IMAGE_REF = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;

/** A map that cannot answer for an inherited key. */
export function ownMap(entries = []) {
  const m = Object.create(null);
  for (const [k, v] of entries) m[k] = v;
  return m;
}
export const hasOwnKey = (obj, key) =>
  obj !== null && obj !== undefined && Object.hasOwn(obj, key);

/** Key-order-independent canonical form, for exact structural comparison. */
export function canonical(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Infrastructure images — from Compose, cross-checked against the conformance manifest
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The exact ORDERED image set the gate must scan, read from tracked Compose configuration.
 * Order is Compose service declaration order, which is what fixes `trivy-image-<index>`.
 */
export function composeImages(root = REPO_ROOT) {
  const problems = [];
  const compose = parseYaml(readFileSync(join(root, 'docker-compose.yml'), 'utf8'));
  const services = compose?.services ?? {};
  const images = [];
  for (const name of Object.keys(services)) {
    const ref = services[name]?.image;
    if (typeof ref !== 'string') {
      problems.push(`docker-compose.yml service '${name}' declares no image`);
      continue;
    }
    if (!IMAGE_REF.test(ref)) {
      problems.push(`docker-compose.yml service '${name}' image ${JSON.stringify(ref)} is not digest-pinned as name@sha256:<64 hex>`);
      continue;
    }
    images.push({ service: name, ref, digest: ref.slice(ref.indexOf('@') + 1) });
  }
  if (images.length === 0) problems.push('docker-compose.yml declares no digest-pinned images');
  return { images, problems };
}

/**
 * The same set as recorded independently in conformance.manifest.json. Two tracked documents
 * that must agree; a single one could be edited alone.
 */
export function conformanceImages(root = REPO_ROOT) {
  const problems = [];
  const doc = JSON.parse(readFileSync(join(root, 'conformance.manifest.json'), 'utf8'));
  const pinned = doc.pinned_images;
  const refs = [];
  if (pinned === null || typeof pinned !== 'object') {
    problems.push('conformance.manifest.json has no pinned_images');
    return { refs, problems };
  }
  const collect = (v) => {
    if (typeof v === 'string' && IMAGE_REF.test(v)) refs.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v !== null && typeof v === 'object') Object.keys(v).forEach((k) => collect(v[k]));
  };
  collect(pinned);
  if (refs.length === 0) problems.push('conformance.manifest.json pinned_images contains no digest-pinned reference');
  return { refs, problems };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step, argv, cache and inventory contracts
// ═══════════════════════════════════════════════════════════════════════════════

export const C15_NORMAL_STEPS = Object.freeze([
  Object.freeze({ id: 'pnpm-audit-human', tool: 'pnpm', policy: 'blocking' }),
  Object.freeze({ id: 'pnpm-audit-json', tool: 'pnpm', policy: 'informational' }),
  Object.freeze({ id: 'gitleaks-worktree', tool: 'gitleaks', policy: 'blocking' }),
  Object.freeze({ id: 'gitleaks-history', tool: 'gitleaks', policy: 'blocking' }),
  Object.freeze({ id: 'trivy-fs', tool: 'trivy', policy: 'blocking' }),
  Object.freeze({ id: 'trivy-fs-json', tool: 'trivy', policy: 'informational' }),
]);
export const C15_ACQUISITION_STEPS = Object.freeze([
  Object.freeze({ id: 'trivy-acquire-db', tool: 'trivy' }),
  Object.freeze({ id: 'trivy-acquire-checks', tool: 'trivy' }),
]);
export const IMAGE_STEP_PREFIX = 'trivy-image-';

/** Governed reports that are not a step's raw stream but must still be produced and bound. */
export const C15_REQUIRED_REPORTS = Object.freeze([
  'RESULT-PASS.txt',
  'gitleaks-worktree.json',
  'gitleaks-history.json',
  'image-findings.json',
]);
export const C16_REQUIRED_REPORTS = Object.freeze(['RESULT-PASS.txt']);

/** The exact cache entries a fingerprint must cover — no more, no fewer, no duplicates. */
export const CACHE_ENTRY_PATHS = Object.freeze([
  'db/metadata.json',
  'db/trivy.db',
  'policy/metadata.json',
]);

/** Volatile absolute paths are replaced by these controlled tokens before comparison. */
export const ARGV_TOKENS = Object.freeze({
  REPO_ROOT: '<REPO_ROOT>',
  OUT_DIR: '<OUT_DIR>',
  TRIVY_CACHE: '<TRIVY_CACHE>',
  STAGED_GITLEAKS: '<STAGED_GITLEAKS>',
  STAGED_TRIVY: '<STAGED_TRIVY>',
  CHECK_WARM_DIR: '<CHECK_WARM_DIR>',
});

const T = ARGV_TOKENS;

/**
 * Normalize one argv element: replace known volatile paths with tokens, longest-prefix first
 * so a nested path (the staged binary inside the out dir) tokenizes as the binary, not as the
 * out dir plus a suffix.
 */
export function normalizeArg(arg, paths) {
  if (typeof arg !== 'string') return arg;
  const rules = [
    [paths.stagedGitleaks, T.STAGED_GITLEAKS],
    [paths.stagedTrivy, T.STAGED_TRIVY],
    [paths.trivyCache, T.TRIVY_CACHE],
    [paths.outDir, T.OUT_DIR],
    [paths.repoRoot, T.REPO_ROOT],
  ].filter(([p]) => typeof p === 'string' && p.length > 0)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [prefix, token] of rules) {
    if (arg === prefix) return token;
    if (arg.startsWith(`${prefix}/`)) return `${token}${arg.slice(prefix.length)}`;
  }
  // The checks-warm probe is a bare mktemp directory with a recognisable stem, and its
  // location is genuinely arbitrary — token it by shape rather than by known path.
  if (/eye-trivy-checkwarm-/.test(arg)) return T.CHECK_WARM_DIR;
  return arg;
}

export function normalizeArgv(argv, paths) {
  if (!Array.isArray(argv)) return null;
  return argv.map((a) => normalizeArg(a, paths));
}

/**
 * The EXACT normalized argv every step must have executed, and the exact coverage it must
 * report. Owned here, in tracked source — not read back from the manifest.
 *
 * `scanRefs` is the ordered list of resolved child-image scan references; it is supplied by
 * the caller only after being derived from Compose + verified index resolution, so an
 * evidence-supplied reference can never reach this function.
 */
export function expectedStepContract({ scanRefs }) {
  const contract = ownMap();

  contract['pnpm-audit-human'] = {
    tool: 'pnpm', policy: 'blocking',
    argv: ['pnpm', 'audit', '--audit-level', 'high'],
    coverage: { audit_level: 'high' },
  };
  contract['pnpm-audit-json'] = {
    tool: 'pnpm', policy: 'informational',
    argv: ['pnpm', 'audit', '--json', '--audit-level', 'high'],
    coverage: { audit_level: 'high' },
  };
  contract['gitleaks-worktree'] = {
    tool: 'gitleaks', policy: 'blocking',
    argv: [
      T.STAGED_GITLEAKS, 'detect', '--source', T.REPO_ROOT, '--no-git', '--redact',
      '--config', `${T.REPO_ROOT}/.gitleaks.toml`,
      '--report-format', 'json', '--report-path', `${T.OUT_DIR}/gitleaks-worktree.json`,
    ],
    coverage: null,
  };
  contract['gitleaks-history'] = {
    tool: 'gitleaks', policy: 'blocking',
    argv: [
      T.STAGED_GITLEAKS, 'detect', '--source', T.REPO_ROOT, '--redact',
      '--config', `${T.REPO_ROOT}/.gitleaks.toml`,
      '--log-opts', '--all --full-history',
      '--report-format', 'json', '--report-path', `${T.OUT_DIR}/gitleaks-history.json`,
    ],
    coverage: null,
  };
  const fsArgv = (format) => [
    T.STAGED_TRIVY, 'fs', '--scanners', 'vuln,secret,misconfig',
    '--severity', 'HIGH,CRITICAL', '--ignorefile', '/dev/null',
    '--cache-dir', T.TRIVY_CACHE, '--skip-db-update', '--skip-check-update', '--no-progress',
    ...(format === 'table' ? ['--exit-code', '1'] : []),
    '--format', format, T.REPO_ROOT,
  ];
  const fsCoverage = {
    scanners: 'vuln,secret,misconfig', severity: 'HIGH,CRITICAL',
    target: '<repo root>', ignorefile: 'none', cache: 'captured',
  };
  contract['trivy-fs'] = { tool: 'trivy', policy: 'blocking', argv: fsArgv('table'), coverage: fsCoverage };
  contract['trivy-fs-json'] = { tool: 'trivy', policy: 'informational', argv: fsArgv('json'), coverage: fsCoverage };

  scanRefs.forEach((scanRef, index) => {
    contract[`${IMAGE_STEP_PREFIX}${index}`] = {
      tool: 'trivy', policy: 'blocking',
      argv: [
        T.STAGED_TRIVY, 'image', '--platform', 'linux/amd64',
        '--severity', 'HIGH,CRITICAL', '--ignorefile', '/dev/null',
        '--cache-dir', T.TRIVY_CACHE, '--skip-db-update', '--skip-check-update', '--no-progress',
        '--format', 'json', scanRef,
      ],
      coverage: {
        severity: 'HIGH,CRITICAL', ignorefile: 'none', cache: 'captured', platform: 'linux/amd64',
      },
    };
  });

  contract['trivy-acquire-db'] = {
    tool: 'trivy',
    argv: [T.STAGED_TRIVY, '--cache-dir', T.TRIVY_CACHE, '--timeout', '15m',
      'image', '--download-db-only', '--no-progress'],
  };
  contract['trivy-acquire-checks'] = {
    tool: 'trivy',
    argv: [T.STAGED_TRIVY, '--cache-dir', T.TRIVY_CACHE, '--timeout', '15m',
      'fs', '--scanners', 'misconfig', '--no-progress', '--format', 'json', T.CHECK_WARM_DIR],
  };

  return contract;
}

/** The image step ids implied by a SOURCE-derived image count. */
export function imageStepIdsFor(count) {
  return Array.from({ length: count }, (_, i) => `${IMAGE_STEP_PREFIX}${i}`);
}

/** `<id>.stdout.txt` / `<id>.stderr.txt` — the only canonical stream names. */
export function streamFilesFor(id) {
  return { stdout: `${id}.stdout.txt`, stderr: `${id}.stderr.txt` };
}

/**
 * The COMPLETE expected C15 output inventory, derived from the contracts and a SOURCE-derived
 * image count. The binding inventory must EQUAL this, not merely contain it.
 */
export function expectedC15Inventory(imageCount) {
  const ids = [
    ...C15_NORMAL_STEPS.map((s) => s.id),
    ...imageStepIdsFor(imageCount),
    ...C15_ACQUISITION_STEPS.map((s) => s.id),
  ];
  const files = [...C15_REQUIRED_REPORTS];
  for (const id of ids) {
    const { stdout, stderr } = streamFilesFor(id);
    files.push(stdout, stderr);
  }
  const dupes = files.filter((f, i) => files.indexOf(f) !== i);
  if (dupes.length > 0) {
    return { inventory: null, problem: `the derived inventory is inconsistent: ${[...new Set(dupes)].join(', ')}` };
  }
  return { inventory: files.sort(), problem: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The whole contract
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load every source-owned expectation at once. `problems` is non-empty only when TRACKED
 * SOURCE is itself inconsistent — which is a gate failure in its own right, and must never be
 * silently tolerated just because the evidence happens to agree with one of the two copies.
 */
export function loadSourceContract(root = REPO_ROOT) {
  const problems = [];

  const compose = composeImages(root);
  problems.push(...compose.problems);
  const conformance = conformanceImages(root);
  problems.push(...conformance.problems);

  // Two independent tracked records of the same set must agree, as sets.
  const composeRefs = compose.images.map((i) => i.ref);
  const a = [...composeRefs].sort().join(',');
  const b = [...conformance.refs].sort().join(',');
  if (a !== b) {
    problems.push(
      `tracked source disagrees with itself: docker-compose.yml pins [${composeRefs.join(', ')}] ` +
      `but conformance.manifest.json records [${conformance.refs.join(', ')}]`,
    );
  }

  const descriptor = JSON.parse(readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8'));
  const targets = descriptor.targets ?? {};
  const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  const scanners = ownMap();
  for (const name of Object.keys(pins.tools ?? {})) {
    const tool = pins.tools[name];
    scanners[name] = {
      version: tool?.version ?? null,
      artifacts: tool?.artifacts ?? {},
    };
  }

  return {
    problems,
    images: compose.images,
    imageRefs: composeRefs,
    conformanceRefs: conformance.refs,
    targets,
    targetIds: Object.keys(targets).sort(),
    scanners,
    scannerNames: Object.keys(scanners).sort(),
    pins,
    toolVersions: ownMap([
      ['pnpm', (pkg.packageManager ?? '').replace(/^pnpm@/, '') || null],
      ['gitleaks', pins.tools?.gitleaks?.version ?? null],
      ['trivy', pins.tools?.trivy?.version ?? null],
    ]),
    cacheEntryPaths: [...CACHE_ENTRY_PATHS],
    normalStepIds: [...C15_NORMAL_STEPS.map((s) => s.id), ...imageStepIdsFor(compose.images.length)],
    acquisitionStepIds: C15_ACQUISITION_STEPS.map((s) => s.id),
    expectedInventory: expectedC15Inventory(compose.images.length).inventory,
  };
}
