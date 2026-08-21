#!/usr/bin/env node
/**
 * C18.1.10 — A PORTABLE WHOLE-SUITE WATCHDOG.
 *
 * `timeout(1)` is not present on macOS, so C18.1.9 had no bounded way to run a long phase and a
 * hung suite simply ran until someone noticed — the three-hour control run was discovered that
 * way. This runs a command in its OWN process group with a hard deadline: on expiry it prints the
 * surviving process tree as diagnostics, signals the whole group, waits a bounded moment and then
 * kills it. No background phase can wait indefinitely.
 *
 *   node scripts/gate/c18-watchdog.mjs <seconds> <command> [args...]
 */
import { spawn, spawnSync } from 'node:child_process';

const [, , rawDeadline, ...command] = process.argv;
const deadline = Number(rawDeadline);
if (!Number.isFinite(deadline) || deadline <= 0 || command.length === 0) {
  console.error('usage: c18-watchdog.mjs <seconds> <command> [args...]');
  process.exit(2);
}

const started = Date.now();
const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });
console.error(`c18-watchdog: pid=${child.pid} deadline=${deadline}s command=${command.join(' ')}`);

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.error(`c18-watchdog: DEADLINE EXCEEDED after ${elapsed}s — surviving process tree:`);
  const tree = spawnSync('ps', ['-o', 'pid,ppid,pgid,etime,command', '-g', String(child.pid)], { encoding: 'utf8' });
  console.error(tree.stdout ?? tree.stderr ?? '(process tree unavailable)');
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }, 10_000).unref();
}, deadline * 1000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.error(`c18-watchdog: finished in ${elapsed}s (code=${code} signal=${signal})`);
  if (timedOut) process.exit(124);
  process.exit(code === null ? 1 : code);
});
