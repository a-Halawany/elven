/**
 * THE SEPARATE PROCESS one chunk of a METHOD-FABRIC experiment runs in — CP-6 B30 part `experiments` (0103 §EX.2; the B31
 * experiment-chunk-worker.ts and B29 method-worker.ts precedents). Spawned by the experiment worker with the run's STORED contract and the
 * chunk's seed offset on stdin; it resolves the product's adapter by the run's model reference (builtin.ts — the same table the method
 * registry and the method worker read), runs each path of the chunk with its path seed (fabric-plan.ts), and answers on stdout with the
 * paths, their digest, the implementation digest it ran and its pid. No database, no network, no credentials (its environment is PATH
 * and NODE_ENV). A throw is answered as `{ error }`; a hang, a crash or an exhausted heap is the parent's to observe.
 */
import { builtinMethod } from '../../methods/builtin.js';
import { methodInputOf } from '../simulation.service.js';
import { digestOfJson, fabricChunkPaths, isFabricChunkable } from './fabric-plan.js';

async function main(): Promise<void> {
  const raw = await new Promise<string>((resolve) => { let d = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { d += c; }); process.stdin.on('end', () => resolve(d)); });
  try {
    const req = JSON.parse(raw) as { run: Record<string, unknown>; first_path: number; paths: number };
    const modelRef = String(req.run['model_ref']);
    if (!isFabricChunkable(modelRef)) throw new Error(`${modelRef} is not a chunkable fabric method`);
    const b = builtinMethod(modelRef);
    if (b === undefined) throw new Error(`no method ${modelRef} in this build`);
    const base = methodInputOf(req.run);
    const totals = fabricChunkPaths(b.adapter, base, Number(req.run['seed']), req.first_path, req.paths, Number(req.run['samples']));
    process.stdout.write(JSON.stringify({ sample_totals: totals, digest: digestOfJson(totals), implementation_digest: b.adapter.digest, pid: process.pid, node: process.version }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), pid: process.pid }));
  }
}

if (process.env['EYE_FABRIC_CHUNK_WORKER'] === '1') void main();
