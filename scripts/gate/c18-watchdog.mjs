#!/usr/bin/env node
/**
 * A PORTABLE WHOLE-SUITE WATCHDOG, IN THREE EXPLICIT STAGES.
 *
 * `timeout(1)` is not present on macOS, so a long phase had no bounded way to run and a hung suite
 * simply ran until someone noticed. This runs a command in its OWN process group with a hard
 * deadline, and sanitises everything that passes through it.
 *
 * The file grew one defence at a time — provider shapes, then piped output, then exact values,
 * then a preflight — and the seams between those layers are where six reproducible bypasses lived
 * at `e2077e1`. It is now organised as three stages with an explicit contract between them:
 *
 *   STAGE 1  CREDENTIAL PREFLIGHT — classify, decide, and either produce the protected-value set
 *            or refuse. Runs to completion BEFORE any child exists.
 *   STAGE 2  STREAMING SANITISER — one state machine per stream, which sees every byte of child
 *            output whether that byte is emitted, redacted, truncated or dropped.
 *   STAGE 3  PROCESS LIFECYCLE — spawn, pipe, drain, terminate, report.
 *
 * ── THE SIX BYPASSES THIS ORGANISATION CLOSES ──
 *
 * A. THE CHILD WAS SPAWNED BEFORE THE REFUSAL. `spawn()` came first and the preflight refusal came
 *    six lines later, so a run that exited 3 had already started a DETACHED child — which outlives
 *    the parent and completes its side effects regardless. Refusal is now a stage that finishes
 *    before Stage 3 begins; nothing spawns unless it succeeded.
 *
 * B. BOOLEAN-LOOKING PASSWORDS WERE EXEMPTED GLOBALLY. A closed set of literals (`0`, `1`, `true`,
 *    `false`, …) was excused wherever it appeared, so `EYE_TEST_PASSWORD=1` printed verbatim. A
 *    credential-named variable is a credential whatever its value looks like. The exemption now
 *    requires BOTH an unambiguously flag-shaped name AND a boolean literal, so
 *    `SDK_HAS_OAUTH_REFRESH=1` is a flag while `EYE_TEST_PASSWORD=1` is protected and
 *    `EYE_USE_PASSWORD=abc` — flag-shaped name, real value — is protected too.
 *
 * C. NAME MATCHING WAS SUBSTRING GUESSING. `PASS` was absent from the component list, so `DB_PASS`,
 *    `REDIS_PASS` and `POSTGRES_PASS` were invisible; adding it as a bare substring would have made
 *    `COMPASS_HEADING` a credential. Names are now split into COMPONENTS on the boundaries real
 *    variable names use, and a component must MATCH a credential word — not contain one.
 *
 * D. ONLY THE WHOLE MULTILINE VALUE WAS CONSIDERED. Preflight measured the value's total length, so
 *    `$'abc\nlong-secret-part'` passed the length test while its three-character first line could
 *    not be safely redacted and was printed. Preflight now decomposes a multiline value into its
 *    logical components and judges EVERY one.
 *
 * E. ANY PROTECTED END CLOSED ANY PROTECTED BLOCK. The tracker held a boolean, so an `-----END
 *    CERTIFICATE-----` inside a PGP private-key block ended suppression and the rest of the key was
 *    forwarded. The tracker now holds the exact normalised label captured by BEGIN and closes only
 *    on the matching END; a mismatched END stays suppressed, and an unterminated block stays
 *    suppressed through EOF.
 *
 * F. AN OVERSIZED LINE WAS DROPPED WITHOUT BEING READ. Marker detection happened when a line was
 *    EMITTED, so a BEGIN marker on a line too long to hold was discarded together with the line —
 *    and the payload and END that followed were treated as ordinary output. Marker state is now
 *    updated for every line the parser observes, including the ones it refuses to emit.
 *
 * Usage: node scripts/gate/c18-watchdog.mjs <seconds> <command> [args...]
 * Exit:  the child's code · 2 usage · 3 preflight refusal · 124 deadline exceeded.
 */
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1 — CREDENTIAL PREFLIGHT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The credential words a variable NAME may carry, as whole components rather than substrings.
 *
 * `PASS` belongs here — `DB_PASS`, `REDIS_PASS` and `POSTGRES_PASS` are ordinary names for a
 * password — but only as a component: `COMPASS_HEADING` splits into `COMPASS`/`HEADING`, neither
 * of which IS `PASS`, so it stays an ordinary variable. That distinction is the whole reason this
 * is a component list and not a regular expression over the raw name.
 */
export const CREDENTIAL_NAME_COMPONENTS = Object.freeze([
  'TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'PASS', 'APIKEY', 'CREDENTIAL', 'CREDENTIALS',
  'PASSPHRASE', 'BEARER', 'COOKIE', 'AUTH', 'OAUTH', 'PRIVATEKEY', 'KEY',
]);

/**
 * Two-component credential words: pairs of adjacent components that together name a credential
 * while neither alone should. `API`+`KEY` is a credential; a bare `KEY` component is too, but
 * `PRIVATE`+`KEY` is listed so the intent is legible rather than incidental.
 */
export const CREDENTIAL_NAME_PAIRS = Object.freeze([
  ['API', 'KEY'], ['PRIVATE', 'KEY'], ['ACCESS', 'KEY'], ['SECRET', 'KEY'],
]);

/** Components that describe a POINTER to a credential rather than the credential itself. */
export const POINTER_NAME_COMPONENTS = Object.freeze([
  'SOCK', 'SOCKET', 'FILE', 'DIR', 'HOME', 'PATH', 'ENABLED', 'REQUIRED',
]);

/**
 * Leading components that make a name unambiguously a FLAG about a credential rather than one.
 * A flag exemption requires this AND a boolean value — see `classifyEnvVariable`.
 */
export const FLAG_NAME_COMPONENTS = Object.freeze([
  'HAS', 'IS', 'USE', 'USES', 'ENABLE', 'ENABLED', 'ALLOW', 'SKIP', 'REQUIRE', 'WITH', 'NO',
]);

/** The closed set of boolean literals. Membership alone never exempts a value — see B above. */
export const BOOLEAN_LITERALS = Object.freeze(['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off']);

/** Split a variable name into the components real names are built from. */
export const nameComponents = (name) => String(name)
  .split(/[^A-Za-z0-9]+/)
  .flatMap((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' '))
  .filter((part) => part !== '')
  .map((part) => part.toUpperCase());

/** Does this NAME carry a credential word as a whole component (or an adjacent pair)? */
export function isCredentialName(name) {
  const parts = nameComponents(name);
  if (parts.some((p) => POINTER_NAME_COMPONENTS.includes(p))) return false;
  if (parts.some((p) => CREDENTIAL_NAME_COMPONENTS.includes(p))) return true;
  return CREDENTIAL_NAME_PAIRS.some(([a, b]) => parts.some(
    (p, i) => p === a && parts[i + 1] === b,
  ));
}

/** Is this NAME shaped like a flag ABOUT a credential — `SDK_HAS_OAUTH_REFRESH`, `USE_AUTH`? */
export const isFlagShapedName = (name) => nameComponents(name)
  .some((p) => FLAG_NAME_COMPONENTS.includes(p));

/** Is this VALUE one of the closed boolean literals? */
export const isBooleanLiteral = (value) => BOOLEAN_LITERALS.includes(String(value).toLowerCase());

/**
 * Below this length a literal value cannot be replaced safely: redacting a one- or two-character
 * string would rewrite ordinary letters throughout every line, and the pattern of replacements
 * would itself disclose the value's length and every position it occupies.
 */
export const REDACTABLE_MIN_LENGTH = 4;

/**
 * The logical components of a credential value: the whole value plus every nonempty line, in both
 * LF and CRLF spellings. A multiline secret is emitted a line at a time, so protecting only the
 * whole value protects nothing that is actually printed.
 */
export function credentialComponents(value) {
  const out = new Set();
  const text = String(value);
  if (text === '') return out;
  out.add(text);
  if (/\r?\n/.test(text)) {
    out.add(text.replace(/\r?\n/g, '\r\n'));
    out.add(text.replace(/\r\n/g, '\n'));
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.replace(/\r$/, '');
      if (trimmed !== '') out.add(trimmed);
    }
  }
  return out;
}

/**
 * Classify ONE environment variable. Returns `'ignore'`, `'flag'`, `'protect'` or `'unprotectable'`.
 * The value is inspected but never returned, logged or embedded in a diagnostic.
 */
export function classifyEnvVariable(name, value) {
  if (typeof value !== 'string' || value === '') return 'ignore';
  if (!isCredentialName(name)) return 'ignore';
  // A flag exemption needs BOTH halves: a flag-shaped name AND a boolean literal. Either alone is
  // exactly the mistake that let `EYE_TEST_PASSWORD=1` and `EYE_USE_PASSWORD=abc` through.
  if (isFlagShapedName(name) && isBooleanLiteral(value)) return 'flag';
  const components = [...credentialComponents(value)];
  // A component is unprotectable when replacing it literally would damage ordinary output: when it
  // is too short, or when it is a common word. `EYE_TEST_PASSWORD=true` is a credential — the flag
  // exemption above did not apply — but redacting the literal `true` would rewrite that word
  // throughout every line, so the safe answer is to refuse rather than to mangle the run.
  if (components.some((c) => c.length < REDACTABLE_MIN_LENGTH || isBooleanLiteral(c))) {
    return 'unprotectable';
  }
  return 'protect';
}

/**
 * STAGE 1. Classify the environment, and either produce the protected-value set or refuse.
 *
 * `values` is held in memory only — never printed, logged or persisted. `unprotectable` carries
 * NAMES alone, so a refusal can say what to fix without disclosing a value, a component, a length
 * or a position.
 */
export function credentialPreflight(env = process.env) {
  const values = new Set();
  const unprotectable = [];
  const flags = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    const verdict = classifyEnvVariable(name, value);
    if (verdict === 'flag') { flags.push(name); continue; }
    if (verdict === 'unprotectable') { unprotectable.push(name); continue; }
    if (verdict !== 'protect') continue;
    for (const component of credentialComponents(value)) values.add(component);
  }
  return { ok: unprotectable.length === 0, values, unprotectable: unprotectable.sort(), flags: flags.sort() };
}

/** The refusal text. It names variables and nothing else. */
export const refusalDiagnostic = (names) => 'c18-watchdog: REFUSING TO LAUNCH — these '
  + `credential-named variables hold values that cannot be redacted safely: ${names.join(', ')}. `
  + 'Lengthen the value, or rename the variable if it is not a credential. No value, component, '
  + 'length or position is printed.';

// ── back-compatible helpers the controls and callers use ──────────────────────
export const credentialValuesFromEnv = (env = process.env) => credentialPreflight(env).values;
export const unprotectableCredentialNames = (env = process.env) => credentialPreflight(env).unprotectable;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2 — STREAMING SANITISER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Redact credential-shaped text: provider token formats, `KEY=value` assignments whose key names a
 * secret, `--flag value` pairs likewise, Authorization headers, URL userinfo and private-material
 * blocks. Deliberately broad — a false redaction costs a little legibility, a missed one costs a
 * credential.
 */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  const SECRET_KEY = '(?:[A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PASS|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY|PASSPHRASE|BEARER|COOKIE|AUTH)[A-Za-z0-9_-]*)';
  return text
    // Provider token shapes, redacted wherever they appear. No leading `\b`: a word boundary needs
    // a non-word character before the match, so a token abutting other output escaped it.
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
    .replace(/xox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    // A whole block on one line, judged by the SAME label predicate the stream tracker uses.
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
      (block) => (isProtectedBlockLine(block, 'begin') ? '[REDACTED]' : block))
    // KEY=value and KEY: value where the KEY names a secret.
    .replace(new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)(\\S+)`, 'gi'), '$1[REDACTED]')
    // --token VALUE / --password VALUE, and Authorization headers.
    .replace(/(--[A-Za-z0-9-]*(?:token|secret|password|pass|api-key|credential)[A-Za-z0-9-]*[= ])(\S+)/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*)(\S+\s*\S*)/gi, '$1[REDACTED]')
    // URL userinfo, with or without a username: `scheme://user:pw@host` and `scheme://:pw@host`
    // are both ordinary, and requiring a username left the second one in the clear.
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s/:@]*):([^\s/@]+)@/g, '$1$2:[REDACTED]@');
}

const escapeLiteral = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Redact a set of EXACT values wherever they appear. Longest first, so a value that contains
 * another is replaced whole rather than piecemeal. */
export function redactValues(text, values) {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (values === undefined || values === null || values.size === 0) return text;
  let out = text;
  for (const v of [...values].sort((a, b) => b.length - a.length)) out = out.split(v).join('[REDACTED]');
  return out;
}

export const TRUNCATION_MARKER = '[c18-watchdog: oversized line dropped without inspection]\n';
export const PRIVATE_BLOCK_MARKER = '[REDACTED: private material block]\n';
/** The longest unbroken line the filter will hold, and therefore inspect, before dropping it. */
export const MAX_LINE = 1 << 16;

/** The block labels whose contents must never be forwarded. */
export const PROTECTED_BLOCK_LABEL_RE = /(PRIVATE KEY|PGP MESSAGE|CERTIFICATE|KEY)/;
const BLOCK_BEGIN_RE = /-----BEGIN ([A-Z0-9 ]+?)-----/;
const BLOCK_END_RE = /-----END ([A-Z0-9 ]+?)-----/;

/** The normalised label a BEGIN/END marker carries, or `null` if the line carries none. */
export function blockLabel(line, which = 'begin') {
  const m = (which === 'begin' ? BLOCK_BEGIN_RE : BLOCK_END_RE).exec(String(line));
  if (m === null) return null;
  const label = m[1].trim().replace(/\s+/g, ' ').toUpperCase();
  return PROTECTED_BLOCK_LABEL_RE.test(label) ? label : null;
}
/** Does this line open or close a block whose contents must never be forwarded? */
export const isProtectedBlockLine = (line, which = 'begin') => blockLabel(line, which) !== null;

/**
 * One state machine per output stream.
 *
 * Two invariants carry the design:
 *
 *   1. NOTHING IS EMITTED THAT HAS NOT BEEN SEEN WHOLE. Output leaves only in complete lines, so a
 *      credential cannot escape by straddling a chunk boundary. A line too long to hold is DROPPED
 *      behind a marker rather than emitted in part — a bounded prefix of an uninspected line is
 *      precisely the disclosure this exists to prevent.
 *   2. MARKER STATE IS UPDATED FOR EVERY LINE THE PARSER OBSERVES, whether that line is emitted,
 *      redacted, truncated or dropped. Detection and emission were previously the same decision,
 *      so an oversized BEGIN line took its block state to the bin with it.
 *
 * Suppression is keyed on the exact label BEGIN captured: only the matching END closes it, a
 * mismatched END stays inside the block, and an unterminated block stays suppressed through EOF.
 */
export function createRedactingStream(sink, values = null) {
  let held = '';
  let dropping = false;        // inside an oversized line, until its newline arrives
  let openLabel = null;        // the exact label of the block currently suppressed, or null

  const clean = (text) => redactValues(redactSecrets(text), values);

  /**
   * Observe one line. `emit` is false for a line the parser refuses to forward — the marker state
   * still advances, which is what closes bypass F.
   */
  const observeLine = (line, { emit = true } = {}) => {
    if (openLabel !== null) {
      // Only the MATCHING end closes this block. A mismatched END is part of the payload.
      if (blockLabel(line, 'end') === openLabel) {
        openLabel = null;
        sink(PRIVATE_BLOCK_MARKER);
      }
      return;                                   // the body never reaches the sink
    }
    const begin = blockLabel(line, 'begin');
    if (begin !== null) {
      // A block that opens AND closes on one line is replaced by the marker: a redacted line still
      // discloses its label and length.
      if (blockLabel(line, 'end') === begin) { sink(PRIVATE_BLOCK_MARKER); return; }
      openLabel = begin;
      return;
    }
    if (emit) sink(clean(line));
  };

  return {
    push(chunk) {
      held += chunk;
      for (;;) {
        const nl = held.indexOf('\n');
        if (nl >= 0) {
          const line = held.slice(0, nl + 1);
          held = held.slice(nl + 1);
          // A dropped line is still OBSERVED: its markers count even though its text does not.
          observeLine(line, { emit: !dropping });
          dropping = false;
          continue;
        }
        if (dropping) {
          // Still inside the dropped line. Observe what we have for markers, then discard it.
          observeLine(held, { emit: false });
          held = '';
          break;
        }
        if (held.length > MAX_LINE) {
          // The filter cannot inspect this line whole. Observe it for markers, then drop the text.
          observeLine(held, { emit: false });
          dropping = true;
          held = '';
          sink(TRUNCATION_MARKER);
          continue;
        }
        break;
      }
    },
    flush() {
      if (dropping) { dropping = false; held = ''; }
      else if (held !== '') { observeLine(held); held = ''; }
      // An unterminated protected block stays suppressed, and says so.
      if (openLabel !== null) { openLabel = null; sink(PRIVATE_BLOCK_MARKER); }
    },
    /** For controls: the label currently suppressed, or null. Never contains payload. */
    openBlockLabel: () => openLabel,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3 — PROCESS LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

// Only run as a CLI. Imported (by the controls that prove redaction works) it exports the helpers
// and does nothing else.
const isMain = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const [, , rawDeadline, ...command] = process.argv;
  const deadline = Number(rawDeadline);
  if (!Number.isFinite(deadline) || deadline <= 0 || command.length === 0) {
    console.error('usage: c18-watchdog.mjs <seconds> <command> [args...]');
    process.exit(2);
  }

  // ── STAGE 1, to completion, BEFORE anything is spawned ──────────────────────
  const preflight = credentialPreflight(process.env);
  if (!preflight.ok) {
    console.error(refusalDiagnostic(preflight.unprotectable));
    process.exit(3);
  }
  const secretValues = preflight.values;
  const say = (text) => console.error(redactValues(redactSecrets(text), secretValues));

  // ── STAGE 3 ─────────────────────────────────────────────────────────────────
  const started = Date.now();
  // stdin is inherited so an interactive child still works; stdout and stderr are PIPED so every
  // byte the child writes is sanitised before it reaches this process's streams.
  const child = spawn(command[0], command.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'], detached: true,
  });
  const out = createRedactingStream((t) => process.stdout.write(t), secretValues);
  const err = createRedactingStream((t) => process.stderr.write(t), secretValues);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', (c) => err.push(c));
  say(`c18-watchdog: pid=${child.pid} deadline=${deadline}s command=${command.join(' ')}`);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    say(`c18-watchdog: DEADLINE EXCEEDED after ${elapsed}s — surviving process tree:`);
    const tree = spawnSync('ps', ['-o', 'pid,ppid,pgid,etime,command', '-g', String(child.pid)], { encoding: 'utf8' });
    say(tree.stdout ?? tree.stderr ?? '(process tree unavailable)');
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, 10_000).unref();
  }, deadline * 1000);

  /**
   * Finish once — from `close` normally, or from `exit` plus a bounded drain.
   *
   * `close` is the correct signal because it fires only after both pipes have ended, so nothing the
   * child wrote is dropped. But a pipe stays open while ANY process holds its write end, and this
   * child leads a detached process group: a surviving grandchild would keep `close` pending
   * indefinitely, which is the unbounded wait this watchdog exists to prevent. So the child's own
   * `exit` starts a short drain, and whichever arrives first ends the run.
   */
  let finished = false;
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    out.flush();
    err.flush();
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    say(`c18-watchdog: finished in ${elapsed}s (code=${code} signal=${signal})`);
    if (timedOut) process.exit(124);
    process.exit(code === null ? 1 : code);
  };
  const DRAIN_MS = 5_000;
  child.on('close', (code, signal) => finish(code, signal));
  child.on('exit', (code, signal) => {
    setTimeout(() => {
      if (!finished) say('c18-watchdog: child exited but its output pipes are still held; draining stopped');
      finish(code, signal);
    }, DRAIN_MS).unref();
  });
}
