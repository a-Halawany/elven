/**
 * THE SEPARATE PROCESS one experiment chunk runs in — CP-6 B31 part O (0099 §O; the reproduce-worker.ts / method-worker.ts precedent).
 *
 * Spawned by the experiment worker with the run's STORED contract and the chunk's seed offset on stdin; it executes the pinned
 * supply-flow@1 from that contract alone — no database, no network, no credentials (its environment is PATH and NODE_ENV) — and answers
 * on stdout with the chunk's paths, their digest, the implementation digest it ran and its pid. A hang, a crash or an exhausted heap is
 * the parent's to observe (killed at the containment's bound); the process never claims to have finished what it did not.
 */
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../models/supply-flow.digest.js';
import { contractOf } from '../simulation.service.js';
import { chunkSampleTotals, digestOfJson } from './experiment-plan.js';

async function main(): Promise<void> {
  const raw = await new Promise<string>((resolve) => { let d = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { d += c; }); process.stdin.on('end', () => resolve(d)); });
  try {
    const req = JSON.parse(raw) as { run: Record<string, unknown>; first_path: number; paths: number };
    const c = contractOf(req.run);
    const totals = chunkSampleTotals(c.params, c.options, c.interventions, req.first_path, req.paths);
    process.stdout.write(JSON.stringify({ sample_totals: totals, digest: digestOfJson(totals), implementation_digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, pid: process.pid, node: process.version }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), pid: process.pid }));
  }
}

if (process.env['EYE_EXPERIMENT_CHUNK_WORKER'] === '1') void main();
