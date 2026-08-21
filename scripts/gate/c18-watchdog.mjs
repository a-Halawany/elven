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
 *
 * C18.1.11 — EVERYTHING THIS PROCESS PRINTS IS REDACTED FIRST. A GitHub token was once passed
 * through argv and echoed verbatim into a watchdog log. Scrubbing that log afterwards is not a
 * fix: the defence has to be that a secret can never reach the log in the first place. Both the
 * echoed command line and the process-tree diagnostics now pass through `redactSecrets`, and
 * secrets are expected to arrive through the ENVIRONMENT, which is never printed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Redact credential-shaped text: provider token formats, `KEY=value` assignments whose key names
 * a secret, `--flag value` pairs likewise, and Authorization headers. Deliberately broad — a
 * false redaction costs a little legibility, a missed one costs a credential.
 */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  const SECRET_KEY = '(?:[A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY|SESSION|COOKIE|BEARER|AUTH)[A-Za-z0-9_-]*)';
  return text
    // Provider token shapes, redacted wherever they appear.
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]')
    // KEY=value and KEY: value where the KEY names a secret.
    .replace(new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)(\\S+)`, 'gi'), '$1[REDACTED]')
    // --token VALUE / --password VALUE, and Authorization headers.
    .replace(/(--[A-Za-z0-9-]*(?:token|secret|password|api-key|credential)[A-Za-z0-9-]*[= ])(\S+)/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*)(\S+\s*\S*)/gi, '$1[REDACTED]');
}

// Only run as a CLI. Imported (by the controls that prove redaction works) it exports the
// redaction helper and does nothing else.
const isMain = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const [, , rawDeadline, ...command] = process.argv;
  const deadline = Number(rawDeadline);
  if (!Number.isFinite(deadline) || deadline <= 0 || command.length === 0) {
    console.error('usage: c18-watchdog.mjs <seconds> <command> [args...]');
    process.exit(2);
  }

  const started = Date.now();
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });
  // The command line is redacted before it is ever printed. A secret should arrive through the
  // environment, which this process never echoes.
  console.error(redactSecrets(`c18-watchdog: pid=${child.pid} deadline=${deadline}s command=${command.join(' ')}`));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`c18-watchdog: DEADLINE EXCEEDED after ${elapsed}s — surviving process tree:`);
    const tree = spawnSync('ps', ['-o', 'pid,ppid,pgid,etime,command', '-g', String(child.pid)], { encoding: 'utf8' });
    console.error(redactSecrets(tree.stdout ?? tree.stderr ?? '(process tree unavailable)'));
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
}
