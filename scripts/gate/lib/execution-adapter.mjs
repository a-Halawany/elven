/**
 * C16-R3.4 §2 — THE EXTERNAL-EFFECT BOUNDARY.
 *
 * Everything the C15 gate does that leaves this machine passes through exactly four hooks:
 *
 *   execute(argv, opts)         every scanner process
 *   acquireCache(opts)          the trivy vulnerability DB and misconfiguration checks bundle
 *   captureProvenance(opts)     scanner/DB identity read out of the acquired cache
 *   cacheFingerprint(dir)       the byte-level cache fingerprint
 *   resolveImage(ref, platform) remote registry index resolution
 *   whichTool(name)             local PATH resolution (no network, but still a process)
 *
 * The DECISION LOGIC — receipt construction, raw-output parsing, disposition validation,
 * finding reconciliation, cache-fingerprint recomputation, manifest construction, policy and
 * failure propagation — sits entirely above this boundary and never touches the network.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────
 * All 44 C15 behavioural controls used to spawn the full live gate, once per test: 44 real
 * scans, 44 database downloads, 44 registry resolutions. One file took 491s, and when the
 * upstream checks-bundle mirror returned 404 every one of them failed at acquisition while
 * asserting about behaviour it never reached — 22 failures all naming the wrong cause. A
 * suite whose result depends on a third-party CDN is not testing this repository.
 *
 * With a test adapter the same controls exercise the same real decision logic against injected
 * process results, so they prove what they claim and are hermetic.
 *
 * ── THE SEAM IS STRUCTURALLY PROHIBITED IN FINAL MODE ────────────────────────────
 * `assertNoTestSeams()` runs BEFORE any scanning in `--final`. If any override is active the
 * run is refused outright. A test adapter can therefore never produce, or launder, final
 * evidence — the seam exists only where evidence does not.
 */
import { spawnSync } from 'node:child_process';
import { acquire, capture, fingerprint } from './trivy-cache.mjs';
import { resolveImageIndex } from './scanner-provenance.mjs';

/**
 * EVERY environment variable that can alter what the gate executes or reads. Adding a seam
 * without adding it here is the defect this list exists to prevent, so it is exported and a
 * control asserts the runner recognises no other override.
 */
export const TEST_SEAM_ENV_VARS = Object.freeze([
  'EYE_GATE_ADAPTER',            // replaces the execution adapter wholesale
  'EYE_GATE_FIXTURE',            // the scenario a test adapter replays
  'EYE_GATE_EXCLUSIONS_PATH',    // an alternative governed disposition document
  'EYE_SCANNER_FETCH_CMD',       // installer download injection
  'EYE_SCANNER_NOW_CMD',         // installer clock injection
  'EYE_SCANNER_SLEEP_CMD',       // installer sleep injection
  'EYE_SECRET_GEN_CMD',          // CI credential generator injection
]);

/** The seams that are currently active, if any. */
export function activeTestSeams(env = process.env) {
  return TEST_SEAM_ENV_VARS.filter((name) => Object.hasOwn(env, name) && env[name] !== undefined);
}

/**
 * Refuse a final run that has ANY test seam active. Called before scanning, so a seeded run
 * cannot get far enough to write evidence.
 */
export function assertNoTestSeams(finalMode, env = process.env) {
  if (!finalMode) return [];
  const active = activeTestSeams(env);
  if (active.length === 0) return [];
  return [
    `--final refuses to run with test seams active: ${active.join(', ')}. Final evidence must be ` +
    'produced by the production adapter reading the tracked governed documents, with no injected ' +
    'process results, fixture inputs or alternative acquisition path.',
  ];
}

/** The real thing: processes, registries, mirrors. */
export function productionAdapter() {
  return {
    kind: 'production',
    execute(argv, opts = {}) {
      const res = spawnSync(argv[0], argv.slice(1), {
        cwd: opts.cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, ...(opts.env ?? {}) },
      });
      return { status: res.status, signal: res.signal ?? null, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
    },
    acquireCache(opts) {
      return acquire(opts);
    },
    captureProvenance(opts) {
      return capture(opts);
    },
    cacheFingerprint(cacheDir) {
      return fingerprint(cacheDir);
    },
    resolveImage(ref, platform) {
      return resolveImageIndex(ref, platform);
    },
    whichTool(name) {
      const res = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
      return { status: res.status, stdout: res.stdout ?? '' };
    },
  };
}

/**
 * Resolve the adapter for this run. Production unless `EYE_GATE_ADAPTER` names a module that
 * default-exports a factory — which `assertNoTestSeams()` has already refused in final mode.
 */
export async function loadAdapter(env = process.env) {
  const spec = env.EYE_GATE_ADAPTER;
  if (spec === undefined || spec === '') return productionAdapter();
  const mod = await import(spec);
  const factory = mod.default ?? mod.createAdapter;
  if (typeof factory !== 'function') {
    throw new Error(`EYE_GATE_ADAPTER ${spec} does not export an adapter factory`);
  }
  const adapter = factory(env);
  if (adapter?.kind === 'production') {
    throw new Error('a test adapter must not report kind "production"');
  }
  return adapter;
}
