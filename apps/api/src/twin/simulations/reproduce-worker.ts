/**
 * THE SEPARATE PROCESS a reproduction runs in.
 *
 * Spawned by the simulation service with the STORED run on stdin; it re-executes the
 * pinned implementation from that contract alone — no database, no network, no twin
 * — and answers with the outputs digest, the implementation digest it ran and its
 * own pid. The service derives the cold-process attestation from this answer; a
 * request cannot supply it.
 *
 * CP-6 B29 (0092) §C: this worker re-executes supply-flow@1 only (its path is unchanged).
 * A method-fabric run (discrete-event, system dynamics, agent-based, optimisation,
 * war-gaming, counterfactual) is re-executed by the method fabric's own separate
 * process (../methods/method-worker.ts), from the same stored run (methodInputOf),
 * always out of process and under its registry row's bounds.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import { simulateSupplyFlow } from '../models/supply-flow.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../models/supply-flow.digest.js';
import { contractOf } from './simulation.service.js';

async function main(): Promise<void> {
  const input = await new Promise<string>((resolve) => { let d = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { d += c; }); process.stdin.on('end', () => resolve(d)); });
  try {
    const stored = JSON.parse(input) as Record<string, unknown>;
    const c = contractOf(stored);
    const out = simulateSupplyFlow(c.params, c.options, c.interventions);
    const digest = createHash('sha256').update(jcsCanonicalize(out)).digest('hex');
    process.stdout.write(JSON.stringify({ outputs_digest: digest, implementation_digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, pid: process.pid, node: process.version }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), pid: process.pid }));
  }
}

void main();
