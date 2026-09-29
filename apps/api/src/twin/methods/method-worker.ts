/**
 * CP-6 B29 §C (0092): THE SEPARATE PROCESS a contained method adapter runs in (method-runner.ts spawns it; the reproduce-worker.ts
 * precedent). It reads { modelRef, module, input } on stdin, resolves the adapter — a product method by its model reference
 * (builtin.ts), or the module a harness registered — validates the input with the adapter's own rule, runs it, and answers on
 * stdout with the outputs, their digest, the implementation digest it ran (a builtin's pinned constant; a module's sha256 over the
 * file's bytes it loaded) and its pid. No database, no network, no credentials (its environment is PATH and NODE_ENV alone). A
 * throw is answered as `{ error }`; a hang, a crash or an exhausted heap is the parent's to observe — the process never lies about
 * finishing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { jcsCanonicalize } from '@eye/contracts';
import type { MethodAdapter, MethodInput } from './types.js';
import { builtinMethod } from './builtin.js';

function resolveAdapter(modelRef: string, module: string | null): { adapter: MethodAdapter; digest: string } | { unavailable: string } {
  if (module === null) {
    const b = builtinMethod(modelRef);
    return b === undefined ? { unavailable: `no method ${modelRef} in this build` } : { adapter: b.adapter, digest: b.adapter.digest };
  }
  const bytes = readFileSync(module);
  const loaded = createRequire(join(process.cwd(), 'method-worker.cjs'))(module) as { adapter?: MethodAdapter };
  if (loaded.adapter === undefined || loaded.adapter.modelRef !== modelRef) return { unavailable: `module ${module} does not export the adapter of ${modelRef}` };
  return { adapter: loaded.adapter, digest: createHash('sha256').update(bytes).digest('hex') };
}

async function main(): Promise<void> {
  const raw = await new Promise<string>((resolve) => { let d = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { d += c; }); process.stdin.on('end', () => resolve(d)); });
  let answer: Record<string, unknown>;
  try {
    const req = JSON.parse(raw) as { modelRef: string; module: string | null; input: MethodInput };
    const r = resolveAdapter(req.modelRef, req.module ?? null);
    if ('unavailable' in r) answer = { unavailable: r.unavailable, pid: process.pid };
    else {
      const problems = r.adapter.validate(req.input);
      if (problems.length > 0) answer = { invalid: problems, pid: process.pid };
      else {
        const output = r.adapter.run(req.input);
        answer = { output, outputs_digest: createHash('sha256').update(jcsCanonicalize(output)).digest('hex'), implementation_digest: r.digest, pid: process.pid, node: process.version };
      }
    }
  } catch (e) {
    answer = { error: e instanceof Error ? e.message : String(e), pid: process.pid };
  }
  process.stdout.write(JSON.stringify(answer));
}

if (process.env['EYE_METHOD_WORKER'] === '1') void main();
