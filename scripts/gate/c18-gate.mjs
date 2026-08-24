#!/usr/bin/env node
/**
 * THE C18 GATE ENTRYPOINT — the whole gate as ONE command, so the watchdog can bound it.
 *
 * The CI step used to invoke the producer, the verifier and the two control suites as four
 * separate shell commands, and the records claimed a "900-second watchdog" the whole time. That
 * claim was false: the watchdog bounded nothing, because nothing ran under it. The only honest
 * ways to make it true are to wrap each command separately — four bounds, none covering the gate —
 * or to make the gate a single command. This is that command.
 *
 *   node scripts/gate/c18-watchdog.mjs 900 node scripts/gate/c18-gate.mjs --final --expected-sha <sha>
 *
 * The sequence is fixed here in source rather than in a workflow file, so the local command and the
 * hosted one cannot drift apart, and a control can assert that both invoke it through the watchdog:
 *
 *   1. evidence production;
 *   2. offline self-verification;
 *   3. the parallel mutation/differential shards;
 *   4. the serial lifecycle controls.
 *
 * Every stage inherits stdio, so all of it flows through the watchdog's sanitiser. A nonzero stage
 * ends the gate immediately with that stage's exit code.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/** The gate's ordered stages. Named here so a control can assert the sequence. */
export const C18_GATE_STAGES = Object.freeze([
  'produce', 'verify-offline', 'controls-parallel', 'controls-serial',
]);

const run = (label, argv, env = {}) => {
  process.stderr.write(`c18-gate: ${label}\n`);
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env },
  });
  if (r.error !== undefined) {
    process.stderr.write(`c18-gate: ${label} could not start (${r.error.code ?? 'spawn error'})\n`);
    process.exit(126);
  }
  if (r.status !== 0) {
    process.stderr.write(`c18-gate: ${label} FAILED (code=${r.status} signal=${r.signal})\n`);
    process.exit(r.status === null ? 1 : r.status);
  }
  return r;
};

export function runC18Gate(argv) {
  // The gate is a DELIVERY gate: the offline self-verification stage requires a final manifest, so
  // final mode is the default rather than an opt-in. Defaulting it here is what makes the
  // documented local command and the CI command the same command.
  const shaIndex = argv.indexOf('--expected-sha');
  const expectedSha = shaIndex >= 0 ? argv[shaIndex + 1]
    : spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const final = !argv.includes('--preliminary');
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 ? argv[outIndex + 1] : mkdtempSync(join(tmpdir(), 'c18-gate-'));

  // 1 — evidence production
  const produce = ['node', join('scripts', 'gate', 'c18-db-paths.mjs'), 'run', '--out', outDir];
  if (final) {
    produce.push('--final');
    if (expectedSha !== '') produce.push('--expected-sha', expectedSha);
  }
  run(`${C18_GATE_STAGES[0]} → ${outDir}`, produce);

  const zips = readdirSync(outDir).filter((f) => /^c18-db-paths-evidence-.*\.zip$/.test(f));
  if (zips.length !== 1) {
    process.stderr.write(`c18-gate: expected exactly one evidence archive, found ${zips.length}\n`);
    process.exit(1);
  }
  const archive = join(outDir, zips[0]);

  // 2 — offline self-verification from this checkout
  run(C18_GATE_STAGES[1],
    ['node', join('scripts', 'gate', 'c18-db-paths.mjs'), 'verify', '--zip', archive, '--root', ROOT]);

  // 3 — the parallel mutation/differential shards
  run(C18_GATE_STAGES[2],
    ['pnpm', '--filter', '@eye/api', 'exec', 'vitest', 'run', '--config', 'vitest.c18.config.ts'],
    { C18_ARCHIVE: archive });

  // 4 — the serial lifecycle controls, isolated from the parallel shards because one of them
  //     deliberately dirties the checkout.
  run(C18_GATE_STAGES[3],
    ['pnpm', '--filter', '@eye/api', 'exec', 'vitest', 'run', '--config', 'vitest.c18-serial.config.ts'],
    { C18_ARCHIVE: archive });

  process.stderr.write(`c18-gate: all ${C18_GATE_STAGES.length} stages passed\n`);
  return { archive, outDir };
}

const invokedDirectly = (() => {
  const a = process.argv[1];
  if (typeof a !== 'string' || a === '') return false;
  return existsSync(a) && a.endsWith('c18-gate.mjs');
})();

if (invokedDirectly) {
  const { archive } = runC18Gate(process.argv.slice(2));
  process.stdout.write(`${archive}\n`);
}
