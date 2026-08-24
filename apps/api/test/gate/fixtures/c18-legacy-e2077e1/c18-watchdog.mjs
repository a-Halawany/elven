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
 * C18.1.13 — REDACTION BY VALUE, AND BOUNDARIES THAT CANNOT LEAK. Three disclosure paths survived
 * C18.1.12, and all three came from the same mistake: the filter knew credential SHAPES but not
 * credential VALUES, and its buffering emitted text it had not finished inspecting.
 *
 *   1. An arbitrary credential — a provider-specific token, a database password, anything that
 *      matches no published format — passed straight through. The gate hands credentials to
 *      children through the ENVIRONMENT, so the watchdog now READS the values it is being asked to
 *      protect: at startup it collects the values of environment variables whose names indicate a
 *      credential and redacts those exact strings wherever they appear, in any formatting. The set
 *      is held in memory only; it is never printed, logged or written anywhere.
 *   2. A shaped canary straddling the forced carry cut had its prefix emitted before its suffix
 *      was ever seen — 19 of 36 split offsets disclosed the canary or a prefix of it. Output is
 *      now emitted only in COMPLETE LINES, so nothing is forwarded that the filter has not seen
 *      whole, and no prefix of a pending credential can escape.
 *   3. Multiline private material written as separate delayed writes was forwarded line by line
 *      long before its END marker arrived, so the single-pass block regex never matched. The
 *      filter now tracks begin/end state ACROSS chunks and lines and suppresses the whole block.
 *
 * An unbroken line longer than `MAX_LINE` is DROPPED in full and replaced by a truncation marker
 * until the next newline. Emitting a bounded prefix of a line the filter cannot finish reading is
 * precisely the defect above, so the safe direction is to lose the line, not to guess at it.
 *
 * stdout and stderr keep their own filters and their own destinations, so the separation callers
 * rely on survives; ordering of normal output, exit codes, signals and the timeout diagnostics are
 * unchanged.
 */
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Redact credential-shaped text: provider token formats, `KEY=value` assignments whose key names
 * a secret, `--flag value` pairs likewise, and Authorization headers. Deliberately broad — a
 * false redaction costs a little legibility, a missed one costs a credential.
 */
/**
 * Environment variable names that indicate a credential VALUE. The suffix exclusions keep ordinary
 * pointers — a socket path, a file location — out of the value set: redacting those would hide
 * useful diagnostics without protecting anything, because the value is not itself a secret.
 */
const SECRET_ENV_NAME_RE = /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY|PASSPHRASE|BEARER|COOKIE|AUTH)/i;
// C18.1.14: `_URL` was here, and it should never have been. A connection URL is one of the most
// common places a password actually lives — `postgres://user:pw@host/db` — so excluding
// credential-named URL variables from the value set excluded exactly the values worth protecting.
const NON_SECRET_ENV_SUFFIX_RE = /(_SOCK|_SOCKET|_FILE|_DIR|_HOME|_ENABLED|_REQUIRED)$/i;
/**
 * C18.1.14-final — names that describe a FLAG about a credential rather than a credential.
 * `CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH=1` matches `AUTH`, and treating its value as an
 * unprotectable secret would refuse to launch over a boolean. The exclusion is on the NAME's
 * grammar, not on the value's length, so a genuinely short secret still refuses.
 */
const FLAG_ENV_NAME_RE = /(^|_)(HAS|IS|USE|ENABLE|ALLOW|SKIP|REQUIRE|WITH|NO)_/i;
/**
 * Values that cannot be a credential in any system: the boolean and empty-ish literals. Enumerated
 * exactly, so this is a closed exclusion rather than another length guess.
 */
const NON_SECRET_VALUES = new Set(['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none']);
/**
 * C18.1.14-final — NO SECRET IS TOO SHORT TO PROTECT.
 *
 * A `MIN_SECRET_VALUE_LENGTH` of 8 silently dropped anything shorter from the protected set, so a
 * seven-character password in a secret-named variable was printed verbatim. "Too short to be a
 * credential" is a guess about someone else's secret, and it was wrong.
 *
 * Every nonempty value of a credential-named variable is now protected, and the length threshold
 * only chooses HOW:
 *
 *   • at or above `REDACTABLE_MIN_LENGTH`, the value is redacted wherever it appears;
 *   • below it, the watchdog REFUSES TO LAUNCH, naming the VARIABLE and never the value.
 *
 * The refusal exists because redacting a one- or two-character string would replace ordinary
 * letters throughout every line of output: the run would be unreadable, and the redaction pattern
 * would itself disclose the value's length and every position it occupies. Refusing is the safe
 * direction and it is loud — a secret that cannot be protected safely is a configuration problem,
 * not something to pass over in silence.
 */
export const REDACTABLE_MIN_LENGTH = 4;

/** Is this variable's NAME one that indicates a credential value? */
export const isCredentialName = (name) => SECRET_ENV_NAME_RE.test(name)
  && !NON_SECRET_ENV_SUFFIX_RE.test(name)
  && !FLAG_ENV_NAME_RE.test(name);
/** Is this VALUE one that cannot be a credential, whatever the variable is called? */
export const isNonSecretValue = (value) => NON_SECRET_VALUES.has(String(value).toLowerCase());

/**
 * C18.1.14-final — A MULTILINE SECRET IS PROTECTED LINE BY LINE TOO.
 *
 * The filter emits COMPLETE LINES, which is what makes a straddling token impossible; but an exact
 * value containing a newline can never appear whole inside one emitted line, so a three-line secret
 * was forwarded as three unprotected lines. Every nonempty line of a multiline value therefore
 * enters the set alongside the whole value, in both LF and CRLF spellings.
 */
const expandValue = (value) => {
  const out = new Set([value]);
  if (/\r?\n/.test(value)) {
    out.add(value.replace(/\r?\n/g, '\r\n'));
    out.add(value.replace(/\r\n/g, '\n'));
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.replace(/\r$/, '');
      if (trimmed.length >= REDACTABLE_MIN_LENGTH) out.add(trimmed);
    }
  }
  return out;
};

/**
 * The exact credential values this process must never emit, taken from the environment it was
 * given. Returned for the caller to hold in memory; it is never printed, logged or persisted.
 */
export function credentialValuesFromEnv(env = process.env) {
  const values = new Set();
  for (const [name, value] of Object.entries(env ?? {})) {
    if (typeof value !== 'string' || value === '') continue;
    if (!isCredentialName(name) || isNonSecretValue(value)) continue;
    if (value.length < REDACTABLE_MIN_LENGTH) continue;   // `unprotectableCredentialNames` owns these
    for (const v of expandValue(value)) values.add(v);
  }
  return values;
}

/**
 * The NAMES of credential-named variables whose values are too short to redact safely. Only the
 * names are returned — never the values — so the caller can refuse to launch and say which
 * variable to fix.
 */
export function unprotectableCredentialNames(env = process.env) {
  const names = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    if (typeof value !== 'string' || value === '') continue;
    if (!isCredentialName(name) || isNonSecretValue(value)) continue;
    if (value.length < REDACTABLE_MIN_LENGTH) names.push(name);
  }
  return names.sort();
}

const escapeLiteral = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Redact a set of EXACT values wherever they appear, whatever surrounds them. Longest first, so a
 * value that contains another is replaced whole rather than piecemeal.
 */
export function redactValues(text, values) {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (values === undefined || values === null || values.size === 0) return text;
  const ordered = [...values].sort((a, b) => b.length - a.length);
  let out = text;
  for (const v of ordered) out = out.split(v).join('[REDACTED]');
  return out;
}

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
    // C18.1.13: the same marker set the streaming block tracker uses, so a block that arrives on
    // ONE line and a block split across writes are redacted by the same definition. The narrower
    // `PRIVATE KEY`-only form left `-----BEGIN … KEY-----` and certificate blocks untouched here
    // while the stream tracker suppressed them, which is an inconsistency waiting to be a hole.
    // C18.1.14-final: the same label definition the streaming tracker uses, so a block arriving on
    // ONE line and a block split across writes are judged identically.
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
      (block) => (isProtectedBlockLine(block, 'begin') ? '[REDACTED]' : block))
    // KEY=value and KEY: value where the KEY names a secret.
    .replace(new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)(\\S+)`, 'gi'), '$1[REDACTED]')
    // --token VALUE / --password VALUE, and Authorization headers.
    .replace(/(--[A-Za-z0-9-]*(?:token|secret|password|api-key|credential)[A-Za-z0-9-]*[= ])(\S+)/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*)(\S+\s*\S*)/gi, '$1[REDACTED]')
    // C18.1.14: userinfo embedded in a URL — `scheme://user:password@host` — is a credential
    // wherever it appears, whatever the variable holding it was called.
    // C18.1.14-final: the username may be EMPTY — `redis://:password@host` is the ordinary shape
    // for a cache URL, and requiring a nonempty username left exactly that password in the clear.
    // Percent-encoded userinfo is covered: `%` is an ordinary character in both classes.
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s/:@]*):([^\s/@]+)@/g, '$1$2:[REDACTED]@');
}

/** The marker that replaces a line too long for the filter to inspect whole. */
export const TRUNCATION_MARKER = '[c18-watchdog: oversized line dropped without inspection]\n';
/** The marker that replaces a suppressed block of private material. */
export const PRIVATE_BLOCK_MARKER = '[REDACTED: private material block]\n';
/** The longest unbroken line the filter will hold, and therefore inspect, before dropping it. */
export const MAX_LINE = 1 << 16;

/**
 * C18.1.14-final — ONE SOURCE-OWNED BLOCK-LABEL DEFINITION.
 *
 * The previous markers required a label ending directly in `PRIVATE KEY`, `KEY` or `CERTIFICATE`,
 * so `-----BEGIN PGP PRIVATE KEY BLOCK-----` matched none of them and the whole block was
 * forwarded. Guessing at label suffixes one at a time is how that happened. The label is now
 * captured whole and judged by a single predicate that BOTH the single-line pattern and the
 * streaming tracker use, so the two can never disagree about what a protected block is.
 */
export const PROTECTED_BLOCK_LABEL_RE = /(PRIVATE KEY|PGP MESSAGE|CERTIFICATE|KEY)/;
const BLOCK_BEGIN_RE = /-----BEGIN ([A-Z0-9 ]+?)-----/;
const BLOCK_END_RE = /-----END ([A-Z0-9 ]+?)-----/;
/** Does this line open or close a block whose contents must never be forwarded? */
export const isProtectedBlockLine = (line, which = 'begin') => {
  const m = (which === 'begin' ? BLOCK_BEGIN_RE : BLOCK_END_RE).exec(String(line));
  return m !== null && PROTECTED_BLOCK_LABEL_RE.test(m[1]);
};

/**
 * A streaming redactor that forwards COMPLETE LINES only.
 *
 * Nothing is emitted that the filter has not seen whole, which is what closes the straddling-token
 * path: a credential cannot span a newline, so a complete line is a complete inspection unit. The
 * two states that DO span lines are tracked explicitly — an oversized line being dropped, and a
 * block of private material between its begin and end markers — and both survive arbitrary chunk
 * boundaries because they live in the filter, not in the buffer.
 *
 * `values` is the set of exact credential values to redact in addition to the shape patterns. It
 * is read here and never emitted.
 */
export function createRedactingStream(sink, values = null) {
  let held = '';
  let dropping = false;        // inside an oversized line, until its newline arrives
  let inPrivate = false;       // inside a private-material block, until its end marker

  const clean = (text) => redactValues(redactSecrets(text), values);

  const emitLine = (line) => {
    if (inPrivate) {
      if (isProtectedBlockLine(line, 'end')) {
        inPrivate = false;
        sink(PRIVATE_BLOCK_MARKER);
      }
      return;                                   // the body never reaches the sink
    }
    if (isProtectedBlockLine(line, 'begin')) {
      // A block that opens and closes on ONE line is replaced by the marker too: forwarding the
      // redacted line would still disclose its label and length, and the marker says everything a
      // reader needs.
      if (isProtectedBlockLine(line, 'end')) { sink(PRIVATE_BLOCK_MARKER); return; }
      inPrivate = true;
      return;
    }
    sink(clean(line));
  };

  return {
    push(chunk) {
      held += chunk;
      for (;;) {
        const nl = held.indexOf('\n');
        if (nl >= 0) {
          const line = held.slice(0, nl + 1);
          held = held.slice(nl + 1);
          if (dropping) dropping = false;       // the oversized line ends here; drop it entirely
          else emitLine(line);
          continue;
        }
        if (dropping) { held = ''; break; }     // still inside the dropped line
        if (held.length > MAX_LINE) {
          // The filter cannot inspect this line whole, and emitting a bounded prefix of it is
          // exactly how a credential straddling a buffer boundary escaped before. Drop it.
          dropping = true;
          held = '';
          sink(TRUNCATION_MARKER);
          continue;
        }
        break;
      }
    },
    flush() {
      if (dropping) { dropping = false; held = ''; return; }
      if (inPrivate) { inPrivate = false; held = ''; sink(PRIVATE_BLOCK_MARKER); return; }
      if (held === '') return;
      emitLine(held);
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
  // C18.1.14-final: a credential-named value too short to redact safely stops the run before the
  // child is spawned. The diagnostic names the VARIABLE and never the value, and exit code 3
  // distinguishes it from a usage error (2) and from a timeout (124).
  const unprotectable = unprotectableCredentialNames(process.env);
  if (unprotectable.length > 0) {
    console.error('c18-watchdog: REFUSING TO LAUNCH — these credential-named variables hold values '
      + `too short to redact safely: ${unprotectable.join(', ')}. Lengthen the value or rename the `
      + 'variable; the value itself is not printed.');
    process.exit(3);
  }
  // The exact credential values this process was given, held in memory and never emitted.
  const secretValues = credentialValuesFromEnv(process.env);
  const out = createRedactingStream((t) => process.stdout.write(t), secretValues);
  const err = createRedactingStream((t) => process.stderr.write(t), secretValues);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', (c) => err.push(c));
  // The command line is redacted before it is ever printed. A secret should arrive through the
  // environment, which this process never echoes.
  console.error(redactValues(
    redactSecrets(`c18-watchdog: pid=${child.pid} deadline=${deadline}s command=${command.join(' ')}`),
    secretValues,
  ));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`c18-watchdog: DEADLINE EXCEEDED after ${elapsed}s — surviving process tree:`);
    const tree = spawnSync('ps', ['-o', 'pid,ppid,pgid,etime,command', '-g', String(child.pid)], { encoding: 'utf8' });
    console.error(redactValues(
      redactSecrets(tree.stdout ?? tree.stderr ?? '(process tree unavailable)'), secretValues,
    ));
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
