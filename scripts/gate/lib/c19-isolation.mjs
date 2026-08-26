/**
 * C19 — THE CHILD ISOLATION CONTRACT.
 *
 * The watchdog bounds a child's LIFETIME. This bounds what a child can SEE. They are different
 * problems: a command that is terminated on time can still have been handed every credential in
 * the ambient environment for as long as it ran, and the gate's own children are spawned with
 * `{...process.env}` — which on a CI runner means every secret the job was given, whether or not
 * the command needs it.
 *
 * ── DENY BY DEFAULT ──
 *
 * A child receives the ALLOWLIST below, plus exactly the variables its own command declares. Not
 * the ambient environment minus a blocklist: a blocklist is a list of the leaks somebody thought
 * of, and the one that matters is always the one nobody did.
 *
 * ── THE THREAT MODEL, UNCHANGED ──
 *
 * This is a bounded supervisor for the source-bound governed workload, NOT a sandbox for arbitrary
 * hostile code. A child that is handed a credential it needs can still misuse it; a child that
 * deliberately evades its ownership markers is outside the boundary, as
 * `c19-lifecycle.suite.ts` demonstrates rather than implies. What this contract gives is that a
 * command cannot receive a credential it was never declared to need, which is the difference
 * between a compromised step leaking one secret and leaking all of them.
 *
 * ── OS ENFORCEMENT, STATED HONESTLY ──
 *
 * Environment scrubbing, cwd control, isolated temp directories, process-group containment,
 * ownership tracking and bounded reap are implemented identically on Linux and macOS, because they
 * are all POSIX process mechanics.
 *
 * Kernel-level sandboxing is NOT claimed on either. Linux namespaces (`unshare`, `bwrap`, `nsjail`)
 * and macOS `sandbox-exec` are different mechanisms with different guarantees, and implementing one
 * would create a guarantee the other platform could not match. Rather than claim a Linux-only
 * property and quietly weaken it on macOS, the contract is the same on both and says so. Where a
 * stronger boundary is genuinely required, the honest answer is a container, not a flag.
 */

/**
 * The ONLY ambient variables a governed child inherits. Every entry earns its place: without it a
 * real command in this gate fails, and a control proves the list is neither short nor padded.
 */
export const C19_ENV_ALLOWLIST = Object.freeze([
  // process fundamentals
  'PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'PWD', 'TMPDIR', 'TEMP', 'TMP',
  // locale — psql's output encoding depends on it, so it is correctness, not cosmetics
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'LC_NUMERIC', 'LC_TIME', 'LC_COLLATE',
  // terminal shape, so tools do not wrap output differently between environments
  'TERM', 'COLUMNS', 'LINES', 'NO_COLOR', 'FORCE_COLOR', 'CI',
  // the docker client's own configuration — without these it cannot reach the daemon
  'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'DOCKER_CONTEXT',
  'DOCKER_BUILDKIT', 'COLIMA_HOME',
  // node and package-manager machinery the gate's own child processes need
  'NODE_OPTIONS', 'NODE_ENV', 'NODE_PATH', 'npm_config_registry', 'npm_config_cache',
  'PNPM_HOME', 'COREPACK_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  // the ownership markers — a child that does not inherit these is an UNOWNED child, so removing
  // them from this list would silently defeat the containment contract
  'EYE_RUN_ID', 'EYE_RUN_ID_CHAIN', 'EYE_GATE_RESOURCE_ID',
  // the gate's own non-secret controls
  'C18_ARCHIVE', 'C18_TEARDOWN_DEADLINE_MS', 'EYE_GATE_EXCLUSIONS_PATH',
]);

/** Variables that must NEVER reach a child unless that child's command declares them by name. */
export const C19_NEVER_INHERITED = Object.freeze([
  'GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_RUNTIME_TOKEN', 'NPM_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
]);

/**
 * Build the environment a governed child actually receives.
 *
 * `declared` is what the command asked for by name — its own credentials, delivered deliberately.
 * Everything else must be on the allowlist or it does not travel. The report names what was
 * withheld so a command that genuinely needs something can be given it explicitly rather than by
 * widening the default.
 */
export function applyEnvironmentPolicy(ambient, declared = {}, {
  allowlist = C19_ENV_ALLOWLIST, neverInherited = C19_NEVER_INHERITED,
} = {}) {
  const allowed = new Set(allowlist);
  const never = new Set(neverInherited);
  const env = {};
  const withheld = [];
  for (const [k, v] of Object.entries(ambient ?? {})) {
    if (Object.prototype.hasOwnProperty.call(declared, k)) continue;   // declared wins, added below
    if (never.has(k)) { withheld.push(k); continue; }
    if (!allowed.has(k)) { withheld.push(k); continue; }
    env[k] = v;
  }
  // A declared variable travels even if it is not on the allowlist: that is what declaring means.
  for (const [k, v] of Object.entries(declared)) env[k] = v;
  return { env, withheld: withheld.sort() };
}

/**
 * Would this child receive a credential it never declared? Used as a pre-spawn assertion, so the
 * answer is enforced rather than reviewed.
 */
export function undeclaredCredentials(childEnv, declared, isCredentialName) {
  const out = [];
  for (const k of Object.keys(childEnv ?? {})) {
    if (Object.prototype.hasOwnProperty.call(declared ?? {}, k)) continue;
    if (isCredentialName(k)) out.push(k);
  }
  return out.sort();
}

/** The per-OS capability table, so a reader can see exactly what is and is not enforced where. */
export const C19_OS_ENFORCEMENT = Object.freeze({
  'environment-allowlist': { linux: 'enforced', darwin: 'enforced' },
  'controlled-cwd': { linux: 'enforced', darwin: 'enforced' },
  'isolated-temp-dir': { linux: 'enforced', darwin: 'enforced' },
  'process-group-containment': { linux: 'enforced', darwin: 'enforced' },
  'ownership-chain-tracking': { linux: 'enforced (/proc/<pid>/environ)', darwin: 'enforced (ps -A -E)' },
  'bounded-reap-and-escalation': { linux: 'enforced', darwin: 'enforced' },
  'docker-resource-sweep': { linux: 'enforced', darwin: 'enforced' },
  'output-and-time-limits': { linux: 'enforced', darwin: 'enforced' },
  // Stated as NOT claimed on both, rather than claimed on one. A guarantee that exists on only one
  // target platform is a guarantee the delivery chain cannot rely on.
  'kernel-sandbox': {
    linux: 'NOT claimed — namespaces are not used',
    darwin: 'NOT claimed — sandbox-exec is not used',
    why: 'implementing one platform\'s mechanism would create a guarantee the other cannot match; '
      + 'the contract is deliberately identical on both, and a container is the honest answer '
      + 'where a stronger boundary is genuinely required',
  },
  'arbitrary-hostile-child': {
    linux: 'NOT claimed', darwin: 'NOT claimed',
    why: 'this is a bounded lifecycle supervisor for a source-bound governed workload; deliberate '
      + 'evasion of ownership metadata is outside the boundary and is demonstrated by a control',
  },
});
