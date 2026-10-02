/**
 * THE PRODUCT'S EXECUTOR OF A FABRIC CHUNK — CP-6 B30 part `experiments` (0103 §EX.2). One chunk in a separate process
 * (fabric-chunk-worker.js beside this file in the built tree) under the chunk containment B31 records on every manifest (60 s, 256 MB
 * heap, environment PATH/NODE_ENV only); the answer re-checked here: the path count, the implementation the process ran (the run's
 * pinned one), the digest recomputed from the paths. The orchestration worker dispatches to it by the run's model reference.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CHUNK_CONTAINMENT } from '../orchestration/experiment-plan.js';
import { assembleFabricOutputs, digestOfJson, type FabricPath, type Measure } from './fabric-plan.js';

type Row = Record<string, unknown>;
export type FabricChunkExecution = { ok: true; sampleTotals: FabricPath[]; digest: string; wallMs: number; pid: number | null } | { ok: false; error: string; wallMs: number };

/** fabric-chunk-worker.js in the built tree: beside this file in dist, or the dist beside a source checkout. */
export function fabricWorkerPath(): string | null {
  const candidates: string[] = [];
  const here = typeof __dirname === 'string' ? __dirname : null;
  if (here !== null) {
    candidates.push(join(here, 'fabric-chunk-worker.js'));
    candidates.push(join(here.replace(/([\\/])src([\\/])/, '$1dist$2'), 'fabric-chunk-worker.js'));
  }
  candidates.push(join(process.cwd(), 'dist', 'twin', 'simulations', 'fabric', 'fabric-chunk-worker.js'));
  candidates.push(join(process.cwd(), 'apps', 'api', 'dist', 'twin', 'simulations', 'fabric', 'fabric-chunk-worker.js'));
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function fabricProcessExecutor(claimed: Row): Promise<FabricChunkExecution> {
  const worker = fabricWorkerPath();
  const t0 = performance.now();
  if (worker === null) return { ok: false, error: 'no fabric chunk executor is installed beside the method fabric (fabric-chunk-worker.js)', wallMs: 0 };
  const run = (claimed['run'] ?? {}) as Row;
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { PATH: process.env['PATH'] ?? '', NODE_ENV: process.env['NODE_ENV'] ?? 'production', EYE_FABRIC_CHUNK_WORKER: '1' };
    const child = execFile(process.execPath, [`--max-old-space-size=${CHUNK_CONTAINMENT.max_old_space_mb}`, worker],
      { timeout: CHUNK_CONTAINMENT.timeout_ms, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024, env, windowsHide: true }, (error, stdout, stderr) => {
        const wallMs = Math.round(performance.now() - t0);
        if (error) {
          const e = error as unknown as { killed?: boolean; signal?: string | null; code?: number | string };
          const tail = String(stderr ?? '').slice(-300).trim().split('\n').at(-1) ?? '';
          resolve({ ok: false, wallMs, error: e.killed === true && e.signal === 'SIGKILL' ? `the chunk ran past its bound of ${CHUNK_CONTAINMENT.timeout_ms} ms and was killed`
            : /heap out of memory|allocation failed/i.test(String(stderr ?? '')) ? `the chunk exhausted its heap bound of ${CHUNK_CONTAINMENT.max_old_space_mb} MB`
            : `the chunk's process ended abnormally (${e.signal ?? `exit ${String(e.code)}`})${tail ? `: ${tail}` : ''}`.slice(0, 500) });
          return;
        }
        let out: Row;
        try { out = JSON.parse(String(stdout)) as Row; } catch { resolve({ ok: false, wallMs, error: 'the chunk\'s process answered something that is not JSON' }); return; }
        if (typeof out['error'] === 'string') { resolve({ ok: false, wallMs, error: `the chunk failed: ${out['error']}`.slice(0, 500) }); return; }
        const totals = out['sample_totals'] as FabricPath[];
        if (!Array.isArray(totals) || totals.length !== Number(claimed['paths'])) { resolve({ ok: false, wallMs, error: 'the chunk\'s process answered the wrong number of paths' }); return; }
        if (out['implementation_digest'] !== run['implementation_digest']) { resolve({ ok: false, wallMs, error: 'the chunk\'s process ran an implementation other than the one the run pinned' }); return; }
        const digest = digestOfJson(totals);
        if (out['digest'] !== digest) { resolve({ ok: false, wallMs, error: 'the chunk\'s process attested a digest its paths do not have' }); return; }
        resolve({ ok: true, sampleTotals: totals, digest, wallMs, pid: typeof out['pid'] === 'number' ? out['pid'] : null });
      });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify({ run, first_path: claimed['first_path'], paths: claimed['paths'] }));
  });
}

/**
 * THE COLD REPRODUCTION of a chunked fabric experiment's run (the existing reproduce route, simulation.reproduce): every path [0, samples)
 * re-executed in ONE separate process from the stored contract and the per-path seeds, the outputs re-assembled with the projection the
 * run recorded, their digest answered for the route to compare with the stored one. A run too large for the chunk bound is unreproducible
 * here (the infrastructure's — the route withholds any invalidation).
 */
export async function reexecuteFabricExperiment(r: Row): Promise<{ outputs_digest: string; implementation_digest: string; pid: number } | { failed: string }> {
  const samples = Number(r['samples']);
  const got = await fabricProcessExecutor({ run: r, first_path: 0, paths: samples });
  if (!got.ok) return { failed: got.error };
  const projection = ((((r['outputs'] ?? {}) as Row)['projection'] ?? []) as Array<{ measure: Measure }>).map((p) => p.measure);
  const outputs = assembleFabricOutputs(String(r['model_ref']), String(r['component']), Number(r['seed']), got.sampleTotals, projection);
  return { outputs_digest: digestOfJson(outputs), implementation_digest: String(r['implementation_digest']), pid: got.pid ?? 0 };
}
