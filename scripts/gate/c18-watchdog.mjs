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
 * echoed command line and the process-tree diagnostics pass through `redactSecrets`, and secrets
 * are expected to arrive through the ENVIRONMENT, which is never printed.
 *
 * C18.1.12 — THE CHILD'S OWN OUTPUT IS REDACTED TOO. C18.1.11 redacted what the WATCHDOG printed
 * and then handed the child `stdio: 'inherit'`, which connects the child directly to this
 * process's file descriptors. Nothing the child wrote passed through `redactSecrets` at all: a
 * credential handed to the child through the environment — the supported way — reappeared verbatim
 * on stdout and stderr the moment the child echoed it, which is exactly the shape of the original
 * incident. The child's streams are now PIPED and filtered.
 *
 * The filter is cross-chunk safe. A pipe splits wherever the kernel happens to split it, so a
 * token can straddle two reads and a naive per-chunk `replace` would miss it entirely. Output is
 * therefore held until a line is complete before it is redacted and forwarded, with a bounded
 * carry so a pathological writer that never emits a newline cannot grow the buffer without limit.
 * stdout and stderr keep their own filters and their own destinations, so the separation callers
 * rely on survives; exit codes, signals and the timeout diagnostics are unchanged.
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
    //
    // C18.1.12: these deliberately carry NO leading `\b`. A word boundary requires a non-word
    // character before the match, so a token abutting other output — which is exactly what a
    // forced chunk boundary or an unlucky log line produces — was left verbatim. The anchor bought
    // nothing but a hole.
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
    .replace(/xox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]')
    // KEY=value and KEY: value where the KEY names a secret.
    .replace(new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)(\\S+)`, 'gi'), '$1[REDACTED]')
    // --token VALUE / --password VALUE, and Authorization headers.
    .replace(/(--[A-Za-z0-9-]*(?:token|secret|password|api-key|credential)[A-Za-z0-9-]*[= ])(\S+)/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*)(\S+\s*\S*)/gi, '$1[REDACTED]');
}

/**
 * A streaming redactor. Text is forwarded a whole line at a time so a secret cannot be missed by
 * landing across a chunk boundary; `flush()` emits whatever is left when the stream ends.
 *
 * `CARRY_LIMIT` bounds the held text. A writer that produces a very long line without a newline
 * would otherwise buffer unboundedly; when the limit is reached the held text is redacted and
 * forwarded, keeping a `OVERLAP` tail behind so a secret straddling that forced boundary is still
 * seen whole by the next pass.
 */
export function createRedactingStream(sink) {
  const CARRY_LIMIT = 1 << 16;
  const OVERLAP = 4_096;
  let held = '';
  return {
    push(chunk) {
      held += chunk;
      const cut = held.lastIndexOf('\n');
      if (cut >= 0) {
        sink(redactSecrets(held.slice(0, cut + 1)));
        held = held.slice(cut + 1);
      }
      if (held.length > CARRY_LIMIT) {
        const emit = held.slice(0, held.length - OVERLAP);
        sink(redactSecrets(emit));
        held = held.slice(held.length - OVERLAP);
      }
    },
    flush() {
      if (held === '') return;
      sink(redactSecrets(held));
      held = '';
    },
  };
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
  // stdin is inherited so an interactive child still works; stdout and stderr are PIPED so every
  // byte the child writes is redacted before it reaches this process's streams.
  const child = spawn(command[0], command.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'], detached: true,
  });
  const out = createRedactingStream((t) => process.stdout.write(t));
  const err = createRedactingStream((t) => process.stderr.write(t));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', (c) => err.push(c));
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

  /**
   * Finish once — from `close` normally, or from `exit` plus a bounded drain.
   *
   * `close` is the correct signal because it fires only after both pipes have ended, so nothing
   * the child wrote is dropped. But a pipe stays open while ANY process holds its write end, and
   * this child leads a detached process group: a surviving grandchild would keep `close` pending
   * indefinitely, which is precisely the unbounded wait this watchdog exists to prevent. So the
   * child's own `exit` starts a short drain, and whichever arrives first ends the run.
   */
  let finished = false;
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    // Whatever is still held — a final line with no newline — is redacted and forwarded here.
    out.flush();
    err.flush();
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`c18-watchdog: finished in ${elapsed}s (code=${code} signal=${signal})`);
    if (timedOut) process.exit(124);
    process.exit(code === null ? 1 : code);
  };
  const DRAIN_MS = 5_000;
  child.on('close', (code, signal) => finish(code, signal));
  child.on('exit', (code, signal) => {
    setTimeout(() => {
      if (!finished) console.error('c18-watchdog: child exited but its output pipes are still held; draining stopped');
      finish(code, signal);
    }, DRAIN_MS).unref();
  });
}
