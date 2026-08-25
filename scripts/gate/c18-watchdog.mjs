#!/usr/bin/env node
/**
 * THE C18 WATCHDOG — A BOUNDED RUNNER WITH A FINITE CONTAINMENT GUARANTEE.
 *
 * `timeout(1)` is absent on macOS, so a long phase had no bounded way to run. This runs a command
 * in its own process group under a hard deadline and sanitises everything that passes through it.
 *
 * Three stages, with an explicit contract between them:
 *
 *   STAGE 1  CREDENTIAL PREFLIGHT — classify the environment and the argv, decide, and either
 *            produce the protected-value set or refuse. Completes BEFORE any child exists.
 *   STAGE 2  ORDERED STREAMING SANITISER — one parser per stream that processes marker events in
 *            textual order over a block STACK, keeping parser state independent of the bounded
 *            output buffer.
 *   STAGE 3  LIFECYCLE — spawn, backpressure-aware piping, signals, bounded drain, termination.
 *
 * ── THE THREAT BOUNDARY (read this before trusting anything below) ──
 *
 * This is a LOG REDACTOR, not an information-flow monitor. The guarantee is finite, and it is
 * stated so it can be checked:
 *
 *   GUARANTEED — literal UTF-8 reproduction of (a) values classified from the environment by the
 *   source-owned registry below, (b) components derived from those values (URL userinfo in both
 *   encoded and decoded form, the individual lines of a multiline value), and (c) the registered
 *   syntactic shapes: provider tokens, secret assignments, secret flags, Authorization headers,
 *   URL userinfo and private-material blocks. Held across arbitrary chunk boundaries, LF and CRLF
 *   line boundaries, oversized lines, nested and mismatched block markers, multiple markers on one
 *   line, EOF, timeout, signals, spawn failure and ordinary process failure.
 *
 *   NOT GUARANTEED — a deliberately malicious child that encodes, hashes, encrypts, reorders or
 *   fragments a secret into pieces that are not literal reproductions; cross-stream or timing
 *   covert channels; credential formats absent from the registry; and SIGKILL delivered to the
 *   watchdog itself, which no process can handle. JSON-escaped and general URL-encoded forms are
 *   NOT claimed: the only transformed representation registered is a URL password's decoded form,
 *   because the value's own derivation produces it.
 *
 * Stronger isolation against a malicious child needs least-privilege environment allowlisting and
 * sandboxing. That is C19's work, and nothing here pretends otherwise.
 *
 * Usage: node scripts/gate/c18-watchdog.mjs <seconds> <command> [args...]
 * Exit:  the child's code · 2 usage · 3 preflight refusal · 124 deadline exceeded · 126 spawn error.
 */
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1 — CREDENTIAL PREFLIGHT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The SOURCE-OWNED credential registry: every secret-bearing environment name this repository
 * actually uses, so classification is a declaration rather than a guess. A meta-control proves
 * this list covers every secret-bearing reference in the workflows, the gate scripts, the Compose
 * configuration and the config schema.
 */
export const SOURCE_OWNED_SECRET_NAMES = Object.freeze([
  'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD', 'EYE_DB_SYSTEM_PASSWORD',
  'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD', 'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD', 'EYE_DB_MIGRATE_PASSWORD',
  'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD', 'EYE_REDIS_PASSWORD',
  'EYE_IDENTITY_JWT_SECRET', 'REDIS_HEALTHCHECK_PASSWORD', 'POSTGRES_PASSWORD',
  'PGPASSWORD', 'GITHUB_TOKEN', 'GH_TOKEN',
]);

/**
 * CONVENTIONAL COMPACT ALIASES — credential names written without separators, which component
 * splitting cannot see. `PGPASSWORD` is used by this repository's own `psql` invocations; the rest
 * are the conventional spellings a caller is likely to reach for.
 */
export const COMPACT_CREDENTIAL_ALIASES = Object.freeze([
  'PGPASSWORD', 'PGPASS', 'DBPASS', 'DBPASSWORD', 'CLIENTSECRET', 'CLIENTKEY', 'APIKEY',
  'APISECRET', 'AUTHTOKEN', 'ACCESSTOKEN', 'REFRESHTOKEN', 'IDTOKEN', 'PRIVATEKEY', 'SECRETKEY',
  'AUTHPASS', 'MYSQLPASS', 'REDISPASS',
]);

/**
 * Long credential words unambiguous enough to match INSIDE a compact name. `PASS`, `KEY` and
 * `AUTH` are deliberately absent: they occur inside ordinary words (`COMPASS`, `MONKEY`,
 * `AUTHOR`), and are matched only as whole components or through the alias list above.
 */
export const COMPACT_CREDENTIAL_WORDS = Object.freeze([
  'PASSWORD', 'PASSWD', 'PASSPHRASE', 'SECRET', 'TOKEN', 'CREDENTIAL', 'APIKEY', 'BEARER',
]);

/** Credential words that count when they are a WHOLE component of a separated name. */
export const CREDENTIAL_NAME_COMPONENTS = Object.freeze([
  'TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'PASS', 'APIKEY', 'CREDENTIAL', 'CREDENTIALS',
  'PASSPHRASE', 'BEARER', 'COOKIE', 'AUTH', 'OAUTH', 'PRIVATEKEY', 'KEY',
]);

/** Adjacent component pairs that name a credential together. */
export const CREDENTIAL_NAME_PAIRS = Object.freeze([
  ['API', 'KEY'], ['PRIVATE', 'KEY'], ['ACCESS', 'KEY'], ['SECRET', 'KEY'], ['CLIENT', 'SECRET'],
]);

/**
 * POINTER and FLAG components. These NEVER exempt on the name alone — the VALUE must also satisfy
 * the declared grammar. A secret hidden under `EYE_TOKEN_FILE` is still a secret; only a value that
 * really is a path is a pointer, and only a boolean literal is really a flag.
 */
export const POINTER_NAME_COMPONENTS = Object.freeze(['SOCK', 'SOCKET', 'FILE', 'DIR', 'HOME', 'PATH']);
export const FLAG_NAME_COMPONENTS = Object.freeze([
  'HAS', 'IS', 'USE', 'USES', 'ENABLE', 'ENABLED', 'ALLOW', 'SKIP', 'REQUIRE', 'REQUIRED',
  'WITH', 'NO',
]);
export const BOOLEAN_LITERALS = Object.freeze(['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off']);
/** A pointer VALUE: a filesystem path, a Windows path, a UNC path, or a socket URL. */
export const POINTER_VALUE_RE = /^(?:[A-Za-z]:[\\/]|\.{0,2}\/|\\\\)\S*$|^[a-z]+:\/\/\/\S*$/;

/** Names that must never be treated as credentials however they are spelled. */
export const NON_CREDENTIAL_NAMES = Object.freeze(['COMPASS', 'CLASSPATH', 'PATH', 'MANPATH']);

/**
 * Below this length a literal value cannot be replaced safely: redacting a one- or two-character
 * string would rewrite ordinary letters throughout every line, and the pattern of replacements
 * would itself disclose the value's length and every position it occupies.
 */
export const REDACTABLE_MIN_LENGTH = 4;

/** Split a variable name into the components real names are built from. */
export const nameComponents = (name) => String(name)
  .split(/[^A-Za-z0-9]+/)
  .flatMap((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' '))
  .filter((part) => part !== '')
  .map((part) => part.toUpperCase());

/** Does this NAME denote a credential? Registry, then alias, then component, then compact word. */
export function isCredentialName(name) {
  const upper = String(name).toUpperCase();
  if (SOURCE_OWNED_SECRET_NAMES.includes(upper)) return true;
  if (NON_CREDENTIAL_NAMES.includes(upper)) return false;
  // NON_CREDENTIAL_NAMES applies to the WHOLE name only. Testing it per COMPONENT made
  // `EYE_SECRET_PATH` a non-credential because one of its components is `PATH` — the pointer
  // exemption is a value question, decided in `classifyEnvVariable`, not a naming veto here.
  const parts = nameComponents(name);
  if (parts.some((p) => COMPACT_CREDENTIAL_ALIASES.includes(p))) return true;
  if (parts.some((p) => CREDENTIAL_NAME_COMPONENTS.includes(p))) return true;
  if (CREDENTIAL_NAME_PAIRS.some(([a, b]) => parts.some((p, i) => p === a && parts[i + 1] === b))) {
    return true;
  }
  // A compact component carries no separators, so only the unambiguous long words apply — and only
  // as a SUFFIX. Conventional compact credential names put the credential word last (`PGPASSWORD`,
  // `CLIENTSECRET`, `AUTHTOKEN`); matching anywhere inside would make `TOKENIZER_MODE` a
  // credential, which is the same substring mistake in a new place.
  return parts.some((p) => COMPACT_CREDENTIAL_WORDS.some((w) => p.endsWith(w)));
}

export const isPointerShapedName = (name) => nameComponents(name)
  .some((p) => POINTER_NAME_COMPONENTS.includes(p));
export const isFlagShapedName = (name) => nameComponents(name)
  .some((p) => FLAG_NAME_COMPONENTS.includes(p));
export const isBooleanLiteral = (value) => BOOLEAN_LITERALS.includes(String(value).toLowerCase());
export const isPointerValue = (value) => POINTER_VALUE_RE.test(String(value));

/** The credential parts carried inside a connection URL: userinfo, encoded and decoded. */
export function urlCredentialParts(text) {
  const out = new Set();
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\s/@]*)@/.exec(String(text));
  if (m === null) return out;
  const userinfo = m[2];
  const colon = userinfo.indexOf(':');
  const raw = colon >= 0 ? userinfo.slice(colon + 1) : '';
  if (raw === '') return out;
  out.add(raw);
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) out.add(decoded);
  } catch { /* a malformed escape is not a second form */ }
  return out;
}

/**
 * The logical components of a credential value: the value itself, every nonempty line (LF and
 * CRLF), and — for a connection URL — the userinfo password in BOTH its encoded and decoded form,
 * because a child that parses the URL prints the decoded one.
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
  for (const part of urlCredentialParts(text)) out.add(part);
  return out;
}

/**
 * Classify ONE environment variable: `ignore`, `pointer`, `flag`, `protect` or `unprotectable`.
 * The value is inspected and never returned, logged or embedded in a diagnostic.
 */
export function classifyEnvVariable(name, value) {
  if (typeof value !== 'string' || value === '') return 'ignore';
  // A connection URL carries a credential in its VALUE regardless of what the variable is called:
  // `EYE_TEST_DSN=postgres://u:pw@host/db` names nothing secret, and holds a password. A child
  // that parses the URL prints the password ALONE, which whole-value redaction never sees.
  const urlParts = urlCredentialParts(value);
  if (urlParts.size > 0) {
    return [...urlParts].some((p) => p.length < REDACTABLE_MIN_LENGTH || isBooleanLiteral(p))
      ? 'unprotectable' : 'protect';
  }
  if (!isCredentialName(name)) return 'ignore';
  // An exemption needs the NAME shape AND the VALUE grammar. Name alone is how a secret hidden
  // under `EYE_TOKEN_FILE` or `EYE_AUTH_ENABLED` walked out in the clear.
  if (isPointerShapedName(name) && isPointerValue(value)) return 'pointer';
  if (isFlagShapedName(name) && isBooleanLiteral(value)) return 'flag';
  const components = [...credentialComponents(value)];
  if (components.some((c) => c.length < REDACTABLE_MIN_LENGTH || isBooleanLiteral(c))) {
    return 'unprotectable';
  }
  return 'protect';
}

/** Shapes that must never appear in ARGV, whatever variable they came from. */
export const ARGV_SECRET_SHAPES = Object.freeze([
  ['a secret assignment', /(?:^|[^A-Za-z0-9_])[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PASS|APIKEY|CREDENTIAL|PASSPHRASE|BEARER|COOKIE|AUTH)[A-Za-z0-9_]*=\S+/i],
  ['a secret flag value', /--[A-Za-z0-9-]*(?:token|secret|password|pass|api-key|credential)[A-Za-z0-9-]*[= ]\S+/i],
  ['an Authorization credential', /Authorization\s*:\s*\S+/i],
  ['provider-token material', /gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}/],
  ['URL userinfo credentials', /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/:@]*:[^\s/@]+@/],
]);

/**
 * Scan the command line for credential material. Credentials travel through the environment or
 * stdin; argv is visible in the OS process list to every user on the machine, and no amount of
 * redaction inside this process can undo that.
 */
export function scanArgvForSecrets(argv, protectedValues = new Set()) {
  const reasons = [];
  const text = argv.join(' ');
  for (const v of protectedValues) {
    if (v.length >= REDACTABLE_MIN_LENGTH && text.includes(v)) {
      reasons.push('an exact protected value');
      break;
    }
  }
  for (const [label, re] of ARGV_SECRET_SHAPES) if (re.test(text)) reasons.push(label);
  return [...new Set(reasons)];
}

/**
 * STAGE 1. Classify the environment and the command line, then either produce the protected-value
 * set or refuse. `values` is held in memory only; `unprotectable` and `argvReasons` name variables
 * and rules, never values.
 */
export function credentialPreflight(env = process.env, argv = []) {
  const values = new Set();
  const unprotectable = [];
  const exempt = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    const verdict = classifyEnvVariable(name, value);
    if (verdict === 'flag' || verdict === 'pointer') { exempt.push(`${name}:${verdict}`); continue; }
    if (verdict === 'unprotectable') { unprotectable.push(name); continue; }
    if (verdict !== 'protect') continue;
    for (const component of credentialComponents(value)) values.add(component);
    // A URL's credential parts are protected even when only the value identified it.
    for (const part of urlCredentialParts(value)) values.add(part);
  }
  const argvReasons = scanArgvForSecrets(argv, values);
  return {
    ok: unprotectable.length === 0 && argvReasons.length === 0,
    values,
    unprotectable: unprotectable.sort(),
    argvReasons,
    exempt: exempt.sort(),
  };
}

/** The refusal text. It names variables and rules, and nothing else. */
export function refusalDiagnostic({ unprotectable = [], argvReasons = [] }) {
  const parts = [];
  if (unprotectable.length > 0) {
    parts.push('these credential-named variables hold values that cannot be redacted safely: '
      + `${unprotectable.join(', ')} (lengthen the value, or rename the variable if it is not a `
      + 'credential)');
  }
  if (argvReasons.length > 0) {
    parts.push(`the command line carries ${argvReasons.join(', ')} — argv is visible in the OS `
      + 'process list; pass credentials through the environment or stdin');
  }
  return `c18-watchdog: REFUSING TO LAUNCH — ${parts.join('; ')}. `
    + 'No value, component, length or position is printed.';
}

// Back-compatible helpers used by controls and callers.
export const credentialValuesFromEnv = (env = process.env) => credentialPreflight(env, []).values;
export const unprotectableCredentialNames = (env = process.env) => credentialPreflight(env, []).unprotectable;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2 — ORDERED STREAMING SANITISER
// ═══════════════════════════════════════════════════════════════════════════════

/** Redact the registered syntactic shapes. Broad within its declared boundary, and no wider. */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  const SECRET_KEY = '(?:[A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PASS|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY|PASSPHRASE|BEARER|COOKIE|AUTH)[A-Za-z0-9_-]*)';
  return text
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
    .replace(/xox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    // A whole protected block on ONE piece of text, judged by the SAME label predicate the
    // streaming stack uses. `redactSecrets` is also what sanitises this process's own diagnostics
    // and the process-tree dump, which the streaming parser never sees.
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
      (block) => (isProtectedBlockLine(block, 'begin') ? '[REDACTED]' : block))
    .replace(new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)(\\S+)`, 'gi'), '$1[REDACTED]')
    .replace(/(--[A-Za-z0-9-]*(?:token|secret|password|pass|api-key|credential)[A-Za-z0-9-]*[= ])(\S+)/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*)(\S+\s*\S*)/gi, '$1[REDACTED]')
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s/:@]*):([^\s/@]+)@/g, '$1$2:[REDACTED]@');
}

/** Redact exact values wherever they appear, longest first. */
export function redactValues(text, values) {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (values === undefined || values === null || values.size === 0) return text;
  let out = text;
  for (const v of [...values].sort((a, b) => b.length - a.length)) out = out.split(v).join('[REDACTED]');
  return out;
}

export const TRUNCATION_MARKER = '[c18-watchdog: oversized line dropped without inspection]\n';
export const PRIVATE_BLOCK_MARKER = '[REDACTED: private material block]\n';
export const MAX_LINE = 1 << 16;

/** ONE source-owned block-label definition, used by the single-line and the streaming paths. */
export const PROTECTED_BLOCK_LABEL_RE = /(PRIVATE KEY|PGP MESSAGE|CERTIFICATE|KEY)/;
/** Every BEGIN/END marker, scanned in textual order. */
const MARKER_SOURCE = '-----(BEGIN|END) ([A-Z0-9 ]+?)-----';
/** The longest marker text the parser must recognise across a discarded boundary. */
export const MARKER_CARRY = 128;

const normaliseLabel = (raw) => raw.trim().replace(/\s+/g, ' ').toUpperCase();

/** The first protected BEGIN/END label on a line, or null. */
export function blockLabel(line, which = 'begin') {
  const re = new RegExp(MARKER_SOURCE, 'g');
  for (let m = re.exec(String(line)); m !== null; m = re.exec(String(line))) {
    if (m[1].toLowerCase() !== which) continue;
    const label = normaliseLabel(m[2]);
    if (PROTECTED_BLOCK_LABEL_RE.test(label)) return label;
  }
  return null;
}
export const isProtectedBlockLine = (line, which = 'begin') => blockLabel(line, which) !== null;

/**
 * One ordered streaming parser per output stream.
 *
 * THREE INVARIANTS.
 *
 *   1. MARKER EVENTS ARE PROCESSED IN TEXTUAL ORDER over a block STACK. A begin-regex followed by
 *      an end-regex sees at most one of each, and in the wrong order — which is how a line that
 *      opened, closed and opened again lost its second BEGIN, and how a same-label nested block
 *      closed on its inner END and released the outer payload.
 *   2. PARSER STATE IS INDEPENDENT OF THE OUTPUT BUFFER. Text dropped for being uninspectably long
 *      is still SCANNED for markers, and a `MARKER_CARRY` tail is retained across drops so a marker
 *      split over any number of discarded chunks is still recognised.
 *   3. NOTHING UNINSPECTED IS EMITTED. Output leaves in complete lines only; an oversized line is
 *      dropped whole behind a marker rather than emitted in part.
 *
 * A marker contains no newline, so it can never straddle a line boundary — the only place a marker
 * can be split is inside an oversized line, which is exactly what `dropCarry` covers.
 */
export function createRedactingStream(sink, values = null) {
  let held = '';               // the current partial line, while it is still emittable
  let dropping = false;        // inside an oversized line
  let dropCarry = '';          // tail of discarded text, so a split marker is still seen
  const stack = [];            // open protected block labels, innermost last

  const clean = (text) => redactValues(redactSecrets(text), values);

  /**
   * Scan one unit in textual order, updating the stack, and return the text that lies outside
   * every protected region. `offset` marks how much of `text` a previous pass already handled.
   */
  const scanUnit = (text, offset = 0) => {
    const re = new RegExp(MARKER_SOURCE, 'g');
    let cursor = offset;
    let out = '';
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const end = m.index + m[0].length;
      if (end <= offset) continue;                          // wholly inside already-handled text
      const label = normaliseLabel(m[2]);
      if (!PROTECTED_BLOCK_LABEL_RE.test(label)) continue;  // an unprotected banner is ordinary text
      if (stack.length === 0 && m.index > cursor) out += text.slice(cursor, m.index);
      if (m[1] === 'BEGIN') {
        if (stack.length === 0) sink(PRIVATE_BLOCK_MARKER);
        stack.push(label);
      } else if (stack.length > 0 && stack[stack.length - 1] === label) {
        stack.pop();
      }
      // A mismatched END, or an END with nothing open, changes nothing: it stays inside the block,
      // or it is ordinary text that was already emitted above.
      cursor = end;
    }
    if (stack.length === 0 && cursor < text.length) out += text.slice(cursor);
    return out;
  };

  /** Emit one complete line, or scan it for markers only. */
  const takeLine = (line, { emit }) => {
    if (!emit) {
      // A dropped line is still SCANNED. `dropCarry` supplies whatever preceded it, so a marker
      // split across discarded chunks is recognised whole.
      const scan = dropCarry + line;
      scanUnit(scan, dropCarry.length);
      dropCarry = scan.slice(Math.max(0, scan.length - MARKER_CARRY));
      return;
    }
    const text = scanUnit(line);
    if (text !== '') sink(clean(text));
    dropCarry = '';
  };

  return {
    push(chunk) {
      held += chunk;
      for (;;) {
        const nl = held.indexOf('\n');
        if (nl >= 0) {
          const line = held.slice(0, nl + 1);
          held = held.slice(nl + 1);
          // An oversized line is dropped whether or not it happened to arrive whole. Making the
          // decision depend on the CHUNKING would mean the same output is emitted or suppressed
          // according to how the kernel split the pipe — a property no reader could rely on and no
          // model could check. Length is the rule; arrival is not.
          if (line.length > MAX_LINE) {
            takeLine(line, { emit: false });
            if (!dropping) sink(TRUNCATION_MARKER);
          } else {
            takeLine(line, { emit: !dropping });
          }
          dropping = false;
          continue;
        }
        if (dropping) { takeLine(held, { emit: false }); held = ''; break; }
        if (held.length > MAX_LINE) {
          takeLine(held, { emit: false });
          dropping = true;
          held = '';
          sink(TRUNCATION_MARKER);
          continue;
        }
        break;
      }
    },
    flush() {
      if (dropping) { takeLine(held, { emit: false }); dropping = false; held = ''; }
      else if (held !== '') { takeLine(held, { emit: true }); held = ''; }
      // An unterminated protected block stays suppressed, and says so once.
      if (stack.length > 0) { stack.length = 0; sink(PRIVATE_BLOCK_MARKER); }
      dropCarry = '';
    },
    /** For controls: the open block labels, innermost last. Never contains payload. */
    openBlocks: () => [...stack],
    openBlockLabel: () => (stack.length === 0 ? null : stack[stack.length - 1]),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3 — LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tolerant main-module detection. `process.argv[1]` may be missing, unresolved, a symlink, or a
 * path that no longer exists; none of those is a reason to throw before the guard has decided.
 */
export function isMainModule(argv1, moduleUrl) {
  if (typeof argv1 !== 'string' || argv1 === '') return false;
  const resolve = (p) => { try { return realpathSync(p); } catch { return p; } };
  let self;
  try { self = fileURLToPath(moduleUrl); } catch { return false; }
  return resolve(argv1) === resolve(self);
}

/**
 * ── C19: THE LIFECYCLE, CORRECTED AGAINST A REPRODUCED SURVIVAL DEFECT ──
 *
 * The a8d34c4 lifecycle leaked processes on every external signal. Reproduced, not inferred:
 * running a child that ignores SIGTERM and forks a grandchild into its own session, then sending
 * SIGINT, SIGTERM or SIGHUP to the watchdog, left BOTH alive indefinitely (observed past t+14s),
 * while the watchdog exited after 2.3 s with status 1.
 *
 * Two independent causes, each fixed here:
 *
 *   S1  ESCALATION WAS UNREACHABLE ON THE SIGNAL PATH. `terminateGroup` sent SIGTERM and scheduled
 *       SIGKILL 10 s later on an `.unref()`'d timer, but the signal handler called `finish()` after
 *       2 s and `finish()` calls `process.exit()`. The process was gone long before the escalation
 *       could run, so a child that ignores SIGTERM simply survived. The deadline path did NOT have
 *       this bug — there the loop stayed alive and the child was killed at deadline+10 s — which is
 *       why the defect hid: the timeout case, the one everybody tested, worked.
 *
 *   S2  ONLY THE PROCESS GROUP WAS SIGNALLED. `process.kill(-child.pid, …)` reaches the child's
 *       process group and nothing else, so any descendant that calls `setsid(2)` leaves the group
 *       and is never signalled at all. This affected BOTH paths: at the deadline the child died and
 *       its grandchild survived, and the watchdog's own `ps -g` diagnostic printed only the child,
 *       which is exactly why the leak was invisible in the logs.
 *
 * The correction terminates a CENSUS, not a group: every pid ever observed as a descendant or a
 * group member is recorded while the command runs, and termination signals that whole set with a
 * bounded, verified reap. Escalation is awaited rather than scheduled, so it cannot be outrun.
 *
 * ── THE BOUNDARY, STATED HONESTLY ──
 *
 *   • SIGKILL delivered to the WATCHDOG ITSELF remains unhandleable by any program. It is the
 *     explicit residual case, not an oversight.
 *   • A process that forks, calls setsid and reparents to init ENTIRELY BETWEEN two census samples
 *     is never observed and therefore never signalled. The sample interval bounds this window; it
 *     does not close it.
 *   • A process owned by another daemon — a container under dockerd — is not a descendant of this
 *     process at all and is not reachable by any signal from here. Cleaning those up belongs to
 *     whoever created them.
 */

/** Signal numbers for the handled signals, so an exit status can encode which one arrived. */
export const SIGNAL_NUMBERS = Object.freeze({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 });

/** POSIX shell convention: a process terminated by signal N reports 128+N. */
export const signalExitCode = (sig) => 128 + (SIGNAL_NUMBERS[sig] ?? 0);

export const TERM_GRACE_MS = 5_000;
export const KILL_GRACE_MS = 5_000;
export const CENSUS_INTERVAL_MS = 500;
/**
 * Containment failure has its OWN exit code. A run whose command succeeded but which left a
 * process or a container behind has not done what a bounded runner exists to do, and reporting
 * that as success is precisely the silent survival this pass is closing.
 */
export const CONTAINMENT_FAILURE_EXIT = 125;

/**
 * Parse `ps -eo pid=,ppid=,pgid=` output. Malformed lines are skipped rather than throwing: this
 * runs on the termination path, where giving up would leak exactly what it exists to prevent.
 */
export function parseProcessTable(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (m !== null) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]) });
  }
  return rows;
}

/**
 * Every pid reachable from `rootPid` as a transitive child, UNION every pid in `rootPid`'s process
 * group. The union is the point: the group catches what the parent walk misses when an intermediate
 * process has already been reaped, and the parent walk catches what the group misses when a
 * descendant called setsid. Neither alone is sufficient — S2 is precisely the group-only case.
 */
export function descendantsOf(rows, rootPid) {
  const byParent = new Map();
  for (const r of rows) {
    if (!byParent.has(r.ppid)) byParent.set(r.ppid, []);
    byParent.get(r.ppid).push(r.pid);
  }
  const found = new Set();
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.pop();
    for (const kid of byParent.get(pid) ?? []) {
      if (!found.has(kid)) { found.add(kid); queue.push(kid); }
    }
  }
  for (const r of rows) if (r.pgid === rootPid) found.add(r.pid);
  found.add(rootPid);
  return found;
}

/**
 * A pid this process may signal. Refusing 0 and negatives is not defensive noise: `kill(0, SIG)`
 * signals the CALLER'S ENTIRE PROCESS GROUP, which on a CI runner is the job. A parse slip that
 * produced 0 would turn cleanup into self-destruction.
 */
export const isSignallablePid = (pid, selfPid) => Number.isInteger(pid) && pid > 1 && pid !== selfPid;

/**
 * Terminate a set of pids with a BOUNDED, VERIFIED reap: SIGTERM, poll until the set is empty or
 * the grace expires, SIGKILL the survivors, poll again, then report whatever is still alive.
 *
 * Every primitive is injected so a control can drive the whole state machine deterministically —
 * including the case where a process refuses to die — without spawning anything.
 */
export async function terminateTree({
  pids, selfPid, kill, alive, sleep, termGraceMs = TERM_GRACE_MS, killGraceMs = KILL_GRACE_MS,
  pollMs = 100,
}) {
  const targets = [...pids].filter((p) => isSignallablePid(p, selfPid));
  const stillAlive = () => targets.filter((p) => alive(p));
  const sweep = async (signal, graceMs) => {
    for (const pid of stillAlive()) { try { kill(pid, signal); } catch { /* already gone */ } }
    const deadline = graceMs;
    let waited = 0;
    while (waited < deadline) {
      if (stillAlive().length === 0) return true;
      await sleep(pollMs);
      waited += pollMs;
    }
    return stillAlive().length === 0;
  };
  const termed = await sweep('SIGTERM', termGraceMs);
  if (termed) return { survivors: [], escalated: false };
  await sweep('SIGKILL', killGraceMs);
  return { survivors: stillAlive(), escalated: true };
}


/**
 * ── C19: OWNERSHIP TRACKING THAT SURVIVES setsid AND REPARENTING ──
 *
 * A pid census closes the group-only leak, but it is still a census: a process that forks, calls
 * setsid and reparents to init ENTIRELY BETWEEN two samples is never observed, and so is never
 * signalled. Recording that as an observational limit would be settling for the weaker mechanism
 * when a stronger one is available on both target systems.
 *
 * The stronger mechanism is OWNERSHIP rather than observation. The watchdog mints a random run
 * token and puts it in the child's environment. Every descendant inherits that environment across
 * fork, setsid, reparenting and exec — inheritance is not something a sample can miss, because it
 * is a property of the process rather than of when we looked. At termination the watchdog sweeps
 * every process whose environment carries the token, whatever its parent or session is by then.
 *
 * Both systems expose this without privileges, for processes of the same user:
 *   • Linux — /proc/<pid>/environ
 *   • macOS — `ps -Eww`, which appends the environment to the command column
 *
 * The census and the ownership sweep are UNIONED, because they fail in different directions: the
 * census catches a process that scrubbed its environment but was observed while it lived, and the
 * ownership sweep catches one that was never observed at all.
 *
 * THE REMAINING BOUNDARY, stated so it can be judged rather than assumed: a process that both
 * scrubs the token from its own environment AND is never present at any census sample escapes
 * both mechanisms. That requires deliberate evasion by the child — the watchdog runs a command
 * this repository owns, so it is a real limit but not a reachable one for the gate's own workload.
 * It is reported, with evidence, rather than silently accepted.
 */

/**
 * The environment variable carrying the run marker, and the docker label derived from it.
 *
 * The name matters. `C19_RUN_TOKEN` would be classified as a CREDENTIAL by the Stage 1 registry —
 * `TOKEN` is a credential component — and its value would then be redacted out of the very
 * diagnostics that exist to report containment, and out of the docker label the sweep queries on.
 * A marker is a public identifier, so it is named as one.
 */
export const RUN_MARKER_VAR = 'C19_RUN_MARKER';
export const DOCKER_RUN_LABEL = 'c19.run';

/** Parse `ps -Eww -o pid=,command=` output, returning pids whose environment carries the token. */
export function parseMarkedPs(text, token) {
  const pids = [];
  if (typeof token !== 'string' || token === '') return pids;
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m === null) continue;
    if (m[2].includes(`${RUN_MARKER_VAR}=${token}`)) pids.push(Number(m[1]));
  }
  return pids;
}

/** Parse one `/proc/<pid>/environ` blob (NUL-separated) for the token. */
export const environHasToken = (blob, token) => typeof token === 'string' && token !== ''
  && String(blob ?? '').split('\0').includes(`${RUN_MARKER_VAR}=${token}`);

/**
 * Every pid owned by this run, by ENVIRONMENT rather than by ancestry. Injected readers keep the
 * whole thing testable; the defaults are the two real system interfaces.
 */
export function ownedPids(token, {
  platform = process.platform,
  // `-A` is load-bearing: without it macOS `ps` lists only the CURRENT SESSION, which is exactly
  // what a process that called setsid has left. Omitting it made the ownership sweep blind to the
  // one class of process it exists to catch.
  readPsE = () => spawnSync('ps', ['-A', '-E', '-ww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '',
  listProcPids = () => { try { return readdirSync('/proc').filter((f) => /^\d+$/.test(f)).map(Number); } catch { return []; } },
  readEnviron = (pid) => { try { return readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { return ''; } },
} = {}) {
  if (platform === 'linux') {
    return listProcPids().filter((pid) => environHasToken(readEnviron(pid), token));
  }
  return parseMarkedPs(readPsE(), token);
}

/**
 * ── C19: DOCKER RESOURCES ARE NOT DESCENDANTS ──
 *
 * A container is a child of dockerd, not of this process, so no signal from here reaches it and no
 * process census can prove it stopped. The gate creates containers on every run, and a run that
 * ends on a signal, a deadline or a crash previously left them behind — the producer's own cleanup
 * only runs when the producer reaches its end.
 *
 * Every resource this run creates is therefore LABELLED with the run token, which makes cleanup a
 * query rather than a bookkeeping exercise: whatever carries the label belongs to this run, however
 * it was created and whether or not the producer got far enough to record it. The sweep runs on
 * every exit path, and the inventory is re-read afterwards so the report states whether the
 * baseline was actually restored rather than assuming the remove commands worked.
 */

/** Split `docker ... -q` output into ids, tolerating blank lines and warnings on stderr. */
export const parseDockerIds = (text) => String(text ?? '').split('\n')
  .map((l) => l.trim()).filter((l) => /^[0-9a-f]{6,}$/i.test(l));

/**
 * The resources this run owns, by label. Returned as a flat inventory so a control can compare a
 * before and an after without knowing docker's output shapes.
 */
export function dockerInventory(token, run = (args) => spawnSync('docker', args, { encoding: 'utf8' }).stdout ?? '') {
  const filter = `label=${DOCKER_RUN_LABEL}=${token}`;
  return {
    containers: parseDockerIds(run(['ps', '-aq', '--filter', filter])),
    networks: parseDockerIds(run(['network', 'ls', '-q', '--filter', filter])),
    volumes: parseDockerIds(run(['volume', 'ls', '-q', '--filter', filter])),
  };
}

/** The three queries are independent, so they are issued CONCURRENTLY: run serially they cost
 *  roughly half a second on every single watchdog invocation, which a control suite that spawns
 *  the watchdog dozens of times pays in full. */
export async function dockerInventoryAsync(token, runAsync = spawnDockerAsync) {
  const filter = `label=${DOCKER_RUN_LABEL}=${token}`;
  const [containers, networks, volumes] = await Promise.all([
    runAsync(['ps', '-aq', '--filter', filter]),
    runAsync(['network', 'ls', '-q', '--filter', filter]),
    runAsync(['volume', 'ls', '-q', '--filter', filter]),
  ]);
  return {
    containers: parseDockerIds(containers),
    networks: parseDockerIds(networks),
    volumes: parseDockerIds(volumes),
  };
}

/** One `docker` invocation, resolved with its stdout. A missing docker yields '' rather than
 *  throwing, so an environment without it simply reports an empty inventory. */
export function spawnDockerAsync(args) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(out); } };
    try {
      const p = spawn('docker', args, { stdio: ['ignore', 'pipe', 'ignore'] });
      p.stdout.on('data', (b) => { out += b.toString(); });
      p.on('error', finish);
      p.on('close', finish);
    } catch { finish(); }
  });
}

/** The async counterpart of `sweepDockerResources`, used on the real shutdown path. */
export async function sweepDockerResourcesAsync(token, runAsync = spawnDockerAsync) {
  const before = await dockerInventoryAsync(token, runAsync);
  await Promise.all([
    before.containers.length > 0 ? runAsync(['rm', '-f', ...before.containers]) : Promise.resolve(''),
    before.networks.length > 0 ? runAsync(['network', 'rm', ...before.networks]) : Promise.resolve(''),
    before.volumes.length > 0 ? runAsync(['volume', 'rm', '-f', ...before.volumes]) : Promise.resolve(''),
  ]);
  const after = await dockerInventoryAsync(token, runAsync);
  return { before, after, removed: inventorySize(before) - inventorySize(after), residue: inventorySize(after) };
}

/** Total resources in an inventory — the number a baseline comparison actually cares about. */
export const inventorySize = (inv) => (inv.containers.length + inv.networks.length + inv.volumes.length);

/**
 * Remove every labelled resource, then RE-READ the inventory and report what remains. Returning
 * the residue rather than a boolean is deliberate: a cleanup that silently failed and a cleanup
 * that succeeded must not look the same to the caller.
 */
export function sweepDockerResources(token, run = (args) => spawnSync('docker', args, { encoding: 'utf8' }).stdout ?? '') {
  const before = dockerInventory(token, run);
  if (before.containers.length > 0) run(['rm', '-f', ...before.containers]);
  if (before.networks.length > 0) run(['network', 'rm', ...before.networks]);
  if (before.volumes.length > 0) run(['volume', 'rm', '-f', ...before.volumes]);
  const after = dockerInventory(token, run);
  return { before, after, removed: inventorySize(before) - inventorySize(after), residue: inventorySize(after) };
}

if (isMainModule(process.argv[1], import.meta.url)) {
  const [, , rawDeadline, ...command] = process.argv;
  const deadline = Number(rawDeadline);
  if (!Number.isFinite(deadline) || deadline <= 0 || command.length === 0) {
    console.error('usage: c18-watchdog.mjs <seconds> <command> [args...]');
    process.exit(2);
  }

  // ── STAGE 1, to completion, before anything is spawned ──────────────────────
  const preflight = credentialPreflight(process.env, command);
  if (!preflight.ok) {
    console.error(refusalDiagnostic(preflight));
    process.exit(3);
  }
  const secretValues = preflight.values;
  const say = (text) => console.error(redactValues(redactSecrets(text), secretValues));

  // ── STAGE 3 ─────────────────────────────────────────────────────────────────
  const started = Date.now();
  // Inherited when a watchdog runs under another watchdog, so nested runs share one identity and
  // the outer sweep still owns everything the inner one created.
  const marker = process.env[RUN_MARKER_VAR] ?? randomBytes(16).toString('hex');
  let finished = false;
  let timedOut = false;
  let timer = null;
  let censusTimer = null;
  let child = null;
  /** How the child itself ended, so the report can say whether it had to be hard-killed. */
  let childSignal = null;
  /** A signal that arrives BEFORE the child exists still has to be honoured once it does. */
  let pendingSignal = null;

  /**
   * The running census. A pid seen at any sample is remembered even if it later reparents to init,
   * which is what makes a double-forked descendant reachable at termination time.
   */
  const census = new Set();
  const readTable = () => {
    const r = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
    return parseProcessTable(r.stdout ?? '');
  };
  const sampleCensus = () => {
    if (child === null || child.pid === undefined) return;
    // ANCESTRY — catches a process that scrubbed the marker but was alive when we looked.
    try { for (const pid of descendantsOf(readTable(), child.pid)) census.add(pid); } catch { /* best effort */ }
    // OWNERSHIP — catches a process that setsid'd and reparented and was never seen as a
    // descendant at all. Inheritance cannot be missed by a sample the way ancestry can.
    try { for (const pid of ownedPids(marker)) census.add(pid); } catch { /* best effort */ }
  };

  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * The single termination path. Signals are handled by AWAITING this, never by scheduling it, so
   * the escalation to SIGKILL cannot be outrun by our own exit — which is defect S1 exactly.
   */
  let shuttingDown = false;
  const shutdown = async (reason, exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    finished = true;
    if (timer !== null) clearTimeout(timer);
    if (censusTimer !== null) clearInterval(censusTimer);
    sampleCensus();
    const { survivors, escalated } = await terminateTree({
      pids: census, selfPid: process.pid, kill: (p, s) => process.kill(p, s), alive, sleep,
    });
    if (escalated) say(`c18-watchdog: ${reason} — SIGTERM did not clear the tree; escalated to SIGKILL`);
    if (survivors.length > 0) {
      say(`c18-watchdog: ${survivors.length} process(es) survived SIGKILL and are NOT contained`);
    }
    // A final ownership sweep AFTER termination: a process that appeared only during shutdown is
    // still this run's to clean up.
    const late = ownedPids(marker).filter((p) => isSignallablePid(p, process.pid));
    if (late.length > 0) {
      say(`c18-watchdog: ${late.length} late-appearing owned process(es); terminating`);
      await terminateTree({
        pids: new Set(late), selfPid: process.pid, kill: (pp, sg) => process.kill(pp, sg), alive, sleep,
      });
    }
    // Containers belong to dockerd, so no signal from here reaches them. They are removed by the
    // label this run stamped on them, and the inventory is re-read to prove the baseline returned.
    // Probed lazily, at shutdown, exactly once. A `docker version` handshake at STARTUP cost half
    // a second on every invocation, which a control suite that spawns the watchdog dozens of times
    // pays in full for no benefit. An absent docker simply yields an empty inventory.
    let dockerResidue = 0;
    const swept = await sweepDockerResourcesAsync(marker);
    if (swept.removed > 0) say(`c18-watchdog: removed ${swept.removed} docker resource(s) labelled ${DOCKER_RUN_LABEL}=${marker}`);
    dockerResidue = swept.residue;
    if (dockerResidue > 0) {
      say(`c18-watchdog: ${dockerResidue} docker resource(s) survived cleanup and are NOT contained`);
    }
    const stragglers = ownedPids(marker).filter((p) => isSignallablePid(p, process.pid));
    const contained = survivors.length === 0 && stragglers.length === 0 && dockerResidue === 0;
    out.flush();
    err.flush();
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    say(`c18-watchdog: finished in ${elapsed}s (${reason}, exit=${exitCode}, `
      + `signal=${childSignal ?? 'none'}, contained=${contained})`);
    // Fail closed. A command that succeeded while leaving something running did not succeed at
    // being bounded, and the caller has to be able to tell.
    process.exit(contained ? exitCode : (exitCode === 0 ? CONTAINMENT_FAILURE_EXIT : exitCode));
  };

  /**
   * Handlers are registered BEFORE the spawn. Registering them after left a window in which the
   * default disposition terminated the watchdog and orphaned a child that already existed.
   */
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      if (finished) return;
      if (child === null) { pendingSignal = sig; return; }
      say(`c18-watchdog: received ${sig} — terminating the whole descendant tree`);
      void shutdown(`terminated by ${sig}`, signalExitCode(sig));
    });
  }

  child = spawn(command[0], command.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'], detached: true,
    // Every descendant inherits this, across fork, setsid, reparenting and exec.
    env: { ...process.env, [RUN_MARKER_VAR]: marker },
  });

  // A spawn failure must never reach Node's default error serialisation: that object carries
  // `spawnargs`, and printing it would put the whole command line — credentials included — on
  // stderr. The code alone is enough to diagnose it.
  child.on('error', (error) => {
    if (finished) return;
    finished = true;
    if (timer !== null) clearTimeout(timer);
    say(`c18-watchdog: could not start the command (${error.code ?? error.name ?? 'spawn error'})`);
    process.exit(126);
  });

  const out = createRedactingStream((t) => process.stdout.write(t), secretValues);
  const err = createRedactingStream((t) => process.stderr.write(t), secretValues);

  /**
   * Pipe with BACKPRESSURE. A destination that cannot accept more sets `writableNeedDrain`; the
   * child's stream is paused until `drain`, so a fast child's output cannot accumulate in this
   * process without bound.
   */
  const pipe = (source, filter, destination) => {
    source.setEncoding('utf8');
    source.on('data', (chunk) => {
      filter.push(chunk);
      if (destination.writableNeedDrain) {
        source.pause();
        destination.once('drain', () => source.resume());
      }
    });
  };
  pipe(child.stdout, out, process.stdout);
  pipe(child.stderr, err, process.stderr);

  say(`c18-watchdog: pid=${child.pid} deadline=${deadline}s command=${command.join(' ')}`);
  // A non-secret activation marker, so a hosted log can prove the gate really ran UNDER the
  // watchdog rather than beside it.
  say(`c18-watchdog: ACTIVE deadline=${deadline}s (whole-command bound enforced)`);
  say(`c18-watchdog: run marker ${marker} (docker label ${DOCKER_RUN_LABEL}=${marker})`);

  sampleCensus();
  censusTimer = setInterval(sampleCensus, CENSUS_INTERVAL_MS);
  censusTimer.unref();

  timer = setTimeout(() => {
    timedOut = true;
    say(`c18-watchdog: DEADLINE EXCEEDED after ${deadline}s — surviving process tree:`);
    sampleCensus();
    const survivors = [...census].filter((p) => alive(p));
    // The frozen implementation printed `ps -g <pid>`, which by construction could not show the
    // setsid descendants that were the actual leak. The census can, so the diagnostic now names
    // every tracked process rather than one process group.
    // One comma-separated -p list: repeated -p flags are not portable, and an EMPTY list would
    // make `ps` print every process on the machine.
    const tree = survivors.length === 0 ? { stdout: '  PID  PPID  PGID ELAPSED COMMAND\n' }
      : spawnSync('ps', ['-o', 'pid,ppid,pgid,etime,command', '-p', survivors.join(',')],
        { encoding: 'utf8' });
    say(tree.stdout ?? tree.stderr ?? '(process tree unavailable)');
    say(`c18-watchdog: ${survivors.length} live process(es) in the tracked tree`);
    void shutdown('deadline exceeded', 124);
  }, deadline * 1000);

  const DRAIN_MS = 5_000;
  const onChildGone = (code) => {
    if (finished || shuttingDown) return;
    // Even a clean exit gets a cleanup sweep: a bounded runner that returns 0 while leaving a
    // descendant running has not bounded anything.
    void shutdown(timedOut ? 'deadline exceeded' : 'finished',
      timedOut ? 124 : (code === null ? 1 : code));
  };
  child.on('close', (code, signal) => { childSignal = signal ?? childSignal; onChildGone(code); });
  child.on('exit', (code, signal) => {
    childSignal = signal ?? childSignal;
    setTimeout(() => {
      if (!finished) say('c18-watchdog: child exited but its output pipes are still held; draining stopped');
      onChildGone(code);
    }, DRAIN_MS).unref();
  });

  // A signal that beat the spawn is honoured now that there is something to terminate.
  if (pendingSignal !== null) {
    say(`c18-watchdog: received ${pendingSignal} before the child was ready — terminating`);
    void shutdown(`terminated by ${pendingSignal}`, signalExitCode(pendingSignal));
  }
}
