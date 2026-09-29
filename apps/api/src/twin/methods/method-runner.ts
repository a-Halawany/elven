/**
 * CP-6 B29 §C (0092): THE CONTAINMENT RUNNER — executes one method adapter on one input under the containment its registry row
 * declares (twin.behaviour_models.containment):
 *
 *   * ISOLATED (`isolated: true`): OUT OF PROCESS — a child node process running method-worker.js beside this file (the built tree;
 *     the reproduce-worker.ts precedent), fed { modelRef, module, input } on stdin, bounded by `timeout_ms` (killed with SIGKILL when
 *     it overruns) and `--max-old-space-size=<max_old_space_mb>`. The child's environment is MINIMAL (PATH and NODE_ENV only): an
 *     adapter never sees the product's credentials. The answer is re-checked here — the outputs digest is recomputed from the
 *     outputs, never taken on the child's word.
 *   * IN PROCESS (`isolated: false`): the adapter runs here (supply-flow@1's registry row, and a method a deployment chooses not to
 *     isolate); an exception is a crash fault, a malformed answer an invalid-output fault.
 *
 * The four answers are DISTINCT so the fabric counts only the adapter's own faults: `ok`; a FAULT (timeout, crash, memory — the
 * heap bound reached — or invalid output) that counts toward quarantine; the input INVALID by the adapter's own validation (the
 * caller's parameters, not the adapter's fault); and UNAVAILABLE — no executor installed, the executor running an implementation
 * other than the pinned one (a deploy) — the infrastructure's, never counted against the adapter.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { jcsCanonicalize } from '@eye/contracts';
import type { MethodAdapter, MethodInput, MethodOutput } from './types.js';

export type FaultKind = 'timeout' | 'crash' | 'memory' | 'invalid_output';
export interface Containment { isolated: boolean; timeout_ms: number; max_old_space_mb: number; quarantine_after: number }
export type Contained =
  | { outcome: 'ok'; output: MethodOutput; outputsDigest: string; implementationDigest: string; pid: number | null; isolated: boolean; elapsedMs: number }
  | { outcome: 'fault'; kind: FaultKind; message: string; pid: number | null; elapsedMs: number }
  | { outcome: 'invalid'; problems: string[] }
  | { outcome: 'unavailable'; reason: string };

/** The registry row's containment with the fabric's defaults (a row that says nothing is not isolated; an isolated one is bounded). */
export function containmentOf(raw: unknown): Containment {
  const c = (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
  return { isolated: c['isolated'] === true, timeout_ms: n(c['timeout_ms'], 30_000, 100, 600_000), max_old_space_mb: n(c['max_old_space_mb'], 256, 16, 8192),
           quarantine_after: n(c['quarantine_after'], 3, 1, 100) };
}

export const outputsDigestOf = (o: MethodOutput): string => createHash('sha256').update(jcsCanonicalize(o)).digest('hex');

/** Every problem with an adapter's answer, in words; an empty list is a well-formed MethodOutput (finite numbers, scalar cells, balances that are numbers). */
export function checkOutput(o: unknown): string[] {
  const problems: string[] = [];
  const scalar = (v: unknown): boolean => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return ['the answer is not an object'];
  const r = o as Record<string, unknown>;
  if (!Array.isArray(r['series'])) problems.push('series is not an array');
  else if (r['series'].length > 100_000) problems.push('series exceeds 100000 rows');
  else r['series'].forEach((row, i) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row) || !Object.values(row as Record<string, unknown>).every(scalar)) problems.push(`series[${i}] is not a row of scalars`);
  });
  if (r['summary'] === null || typeof r['summary'] !== 'object' || Array.isArray(r['summary']) || !Object.values(r['summary'] as Record<string, unknown>).every(scalar)) problems.push('summary is not an object of scalars');
  if (r['balances'] !== undefined) {
    if (!Array.isArray(r['balances'])) problems.push('balances is not an array');
    else r['balances'].forEach((b, i) => {
      const x = b as Record<string, unknown>;
      if (x === null || typeof x !== 'object' || typeof x['key'] !== 'string' || !['opening', 'inflow', 'outflow', 'closing'].every((k) => typeof x[k] === 'number' && Number.isFinite(x[k] as number))) {
        problems.push(`balances[${i}] is not { key, opening, inflow, outflow, closing } with finite numbers`);
      }
    });
  }
  const extra = Object.keys(r).filter((k) => !['series', 'summary', 'balances'].includes(k));
  if (extra.length > 0) problems.push(`unexpected keys ${extra.join(', ')}`);
  return problems.slice(0, 5);
}

/** method-worker.js in the built tree (the reproduce worker's resolution): beside this file in dist, or the dist beside a source checkout. */
export function methodWorkerPath(): string | null {
  const candidates: string[] = [];
  const here = typeof __dirname === 'string' ? __dirname : null;
  if (here !== null) {
    candidates.push(join(here, 'method-worker.js'));
    candidates.push(join(here.replace(/([\\/])src([\\/])/, '$1dist$2'), 'method-worker.js'));
  }
  candidates.push(join(process.cwd(), 'dist', 'twin', 'methods', 'method-worker.js'));
  candidates.push(join(process.cwd(), 'apps', 'api', 'dist', 'twin', 'methods', 'method-worker.js'));
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * Run `adapter` on `input` under `containment`. `module` is the path of an adapter outside the product's tree (a harness adapter,
 * registered at run time) — the worker loads it; null for a builtin, which the worker resolves by model reference.
 */
export async function runContained(adapter: MethodAdapter, module: string | null, input: MethodInput, containment: Containment): Promise<Contained> {
  const problems = adapter.validate(input);
  if (problems.length > 0) return { outcome: 'invalid', problems };
  const t0 = performance.now();
  if (!containment.isolated) {
    let output: MethodOutput;
    try { output = adapter.run(input); } catch (e) {
      return { outcome: 'fault', kind: 'crash', message: `the adapter threw: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500), pid: null, elapsedMs: Math.round(performance.now() - t0) };
    }
    const bad = checkOutput(output);
    if (bad.length > 0) return { outcome: 'fault', kind: 'invalid_output', message: `the adapter answered an invalid output: ${bad.join('; ')}`.slice(0, 500), pid: null, elapsedMs: Math.round(performance.now() - t0) };
    return { outcome: 'ok', output, outputsDigest: outputsDigestOf(output), implementationDigest: adapter.digest, pid: null, isolated: false, elapsedMs: Math.round(performance.now() - t0) };
  }
  const worker = methodWorkerPath();
  if (worker === null) return { outcome: 'unavailable', reason: 'no isolated executor is installed beside the method fabric (method-worker.js)' };
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { PATH: process.env['PATH'] ?? '', NODE_ENV: process.env['NODE_ENV'] ?? 'production', EYE_METHOD_WORKER: '1' };
    const child = execFile(process.execPath, [`--max-old-space-size=${containment.max_old_space_mb}`, worker],
      { timeout: containment.timeout_ms, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, env, windowsHide: true }, (error, stdout, stderr) => {
        const elapsedMs = Math.round(performance.now() - t0);
        const pid = child.pid ?? null;
        const tail = String(stderr ?? '').slice(-400);
        if (error) {
          const e = error as unknown as { killed?: boolean; signal?: string | null; code?: number | string };
          if (e.killed === true && e.signal === 'SIGKILL') { resolve({ outcome: 'fault', kind: 'timeout', message: `the adapter ran past its bound of ${containment.timeout_ms} ms and was killed`, pid, elapsedMs }); return; }
          if (/heap out of memory|allocation failed/i.test(tail) || e.signal === 'SIGABRT' || e.code === 134) {
            resolve({ outcome: 'fault', kind: 'memory', message: `the adapter exhausted its heap bound of ${containment.max_old_space_mb} MB`, pid, elapsedMs }); return;
          }
          resolve({ outcome: 'fault', kind: 'crash', message: `the adapter's process ended abnormally (${e.signal ?? `exit ${String(e.code)}`})${tail ? `: ${tail.trim().split('\n').at(-1)}` : ''}`.slice(0, 500), pid, elapsedMs });
          return;
        }
        let out: Record<string, unknown>;
        try { out = JSON.parse(String(stdout)) as Record<string, unknown>; } catch {
          resolve({ outcome: 'fault', kind: 'invalid_output', message: 'the adapter\'s process answered something that is not JSON', pid, elapsedMs }); return;
        }
        if (Array.isArray(out['invalid'])) { resolve({ outcome: 'invalid', problems: (out['invalid'] as unknown[]).map(String) }); return; }
        if (typeof out['unavailable'] === 'string') { resolve({ outcome: 'unavailable', reason: out['unavailable'] }); return; }
        if (typeof out['error'] === 'string') { resolve({ outcome: 'fault', kind: 'crash', message: `the adapter threw: ${out['error']}`.slice(0, 500), pid, elapsedMs }); return; }
        const bad = checkOutput(out['output']);
        if (bad.length > 0) { resolve({ outcome: 'fault', kind: 'invalid_output', message: `the adapter answered an invalid output: ${bad.join('; ')}`.slice(0, 500), pid, elapsedMs }); return; }
        const output = out['output'] as MethodOutput;
        const digest = outputsDigestOf(output);
        if (out['outputs_digest'] !== digest) { resolve({ outcome: 'fault', kind: 'invalid_output', message: 'the adapter\'s process attested an outputs digest its outputs do not have', pid, elapsedMs }); return; }
        if (typeof out['implementation_digest'] !== 'string') { resolve({ outcome: 'fault', kind: 'invalid_output', message: 'the adapter\'s process did not name the implementation it ran', pid, elapsedMs }); return; }
        resolve({ outcome: 'ok', output, outputsDigest: digest, implementationDigest: out['implementation_digest'], pid: typeof out['pid'] === 'number' ? out['pid'] : pid, isolated: true, elapsedMs });
      });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify({ modelRef: adapter.modelRef, module, input }));
  });
}
