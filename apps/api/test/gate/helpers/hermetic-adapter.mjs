/**
 * C16-R3.4 §2 — THE HERMETIC TEST ADAPTER.
 *
 * Replays a RECORDED REAL TRACE of a passing C15 run (`fixtures/c15-trace/`) so the behavioural
 * controls exercise the gate's genuine decision logic against genuine scanner output — the real
 * 230KB trivy image report, the real gitleaks output, the real acquisition receipts — while
 * contacting nothing. No database download, no registry resolution, no image scan.
 *
 * A scenario file (`EYE_GATE_FIXTURE`) may override any part of the trace, which is how a
 * control injects the one defect it is testing: a planted secret, a crashed scanner, a fallen-back
 * checks bundle, a mismatched digest.
 *
 * This adapter is refused outright in `--final` mode by `assertNoTestSeams()`, so it can never
 * produce or launder evidence.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = join(HERE, '..', 'fixtures', 'c15-trace');

const readTrace = () => JSON.parse(readFileSync(join(TRACE_DIR, 'trace.json'), 'utf8'));
const readStream = (rel) => readFileSync(join(TRACE_DIR, rel), 'utf8');

/**
 * A scenario is a shallow patch over the trace:
 *   { steps: { 'gitleaks-worktree': { exit_code: 1, stdout: '…' } },
 *     acquisition: {...}, resolveImage: {...}, whichTool: { trivy: null } }
 */
function loadScenario(env) {
  const path = env.EYE_GATE_FIXTURE;
  if (path === undefined || path === '' || !existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

export default function createAdapter(env = process.env) {
  const trace = readTrace();
  const scenario = loadScenario(env);
  const stepOverrides = scenario.steps ?? {};

  /** Which recorded step a given argv corresponds to. The runner passes its id through. */
  const recordedFor = (id) => trace.steps[id];

  return {
    kind: 'hermetic-replay',

    execute(argv, opts = {}) {
      const id = opts.id;
      const override = Object.hasOwn(stepOverrides, id) ? stepOverrides[id] : null;

      // A `--version` probe or any other unrecorded invocation: answer from the recorded
      // toolchain rather than inventing something, so version enforcement still runs for real.
      const recorded = recordedFor(id);
      if (recorded === undefined && override === null) {
        const tool = argv[0].split('/').pop();
        if (argv.includes('--version') || argv.includes('version')) {
          const v = trace.tool_versions?.[tool]?.actual;
          if (v !== undefined) {
            return { status: 0, signal: null, stdout: tool === 'trivy' ? `Version: ${v}\n` : `${v}\n`, stderr: '' };
          }
        }
        return { status: 0, signal: null, stdout: '', stderr: '' };
      }

      const base = recorded === undefined
        ? { exit_code: 0, signal: null }
        : {
          exit_code: recorded.exit_code,
          signal: recorded.signal,
          stdout: readStream(recorded.stdout_file),
          stderr: readStream(recorded.stderr_file),
        };
      const merged = { ...base, ...(override ?? {}) };

      // gitleaks writes its JSON report as a side effect; replay that too, because the gate
      // reads those files and the controls assert on them.
      const reportIndex = argv.indexOf('--report-path');
      if (reportIndex !== -1 && argv[reportIndex + 1] !== undefined) {
        const sideEffect = merged.report ?? (
          Object.hasOwn(trace.side_effect_files ?? {}, id) ? readStream(trace.side_effect_files[id]) : '[]'
        );
        writeFileSync(argv[reportIndex + 1], sideEffect);
      }

      return {
        status: merged.exit_code,
        signal: merged.signal ?? null,
        stdout: merged.stdout ?? '',
        stderr: merged.stderr ?? '',
      };
    },

    acquireCache(opts) {
      const override = scenario.acquisition;
      const acquisition = { ...trace.acquisition, cacheDir: opts.cacheDir, ...(override ?? {}) };
      // The runner writes the acquisition streams into the output directory; replay them so the
      // derived inventory and the step receipts line up exactly as on a real run.
      for (const step of acquisition.steps ?? []) {
        const rec = trace.steps[step.id];
        const so = rec !== undefined ? readStream(rec.stdout_file) : '';
        const se = rec !== undefined ? readStream(rec.stderr_file) : '';
        writeFileSync(join(opts.outDir, step.stdout_file), so);
        writeFileSync(join(opts.outDir, step.stderr_file), se);
      }
      return acquisition;
    },

    captureProvenance(opts) {
      // Cache identity is metadata the core EVALUATES; replaying it keeps freshness, version
      // and digest enforcement running for real without a 1.2GB database on disk.
      const base = trace.provenance ?? {};
      return { ...base, cache_dir: opts.cacheDir, ...(scenario.provenance ?? {}) };
    },

    cacheFingerprint() {
      return { ...trace.fingerprint, ...(scenario.fingerprint ?? {}) };
    },

    resolveImage(ref, platform) {
      if (Object.hasOwn(scenario.resolveImage ?? {}, ref)) return scenario.resolveImage[ref];
      const hit = (trace.image_resolutions ?? []).find((r) => r.ref === ref);
      if (hit === undefined) {
        return { ref, resolved: false, error: `no recorded resolution for ${ref} on ${platform}` };
      }
      return hit.resolution;
    },

    whichTool(name) {
      if (Object.hasOwn(scenario.whichTool ?? {}, name)) {
        const v = scenario.whichTool[name];
        return v === null ? { status: 1, stdout: '' } : { status: 0, stdout: `${v}\n` };
      }
      return { status: 0, stdout: `/usr/local/bin/${name}\n` };
    },
  };
}
