/**
 * C19 — OFFLINE ENFORCED AT THE OPERATING SYSTEM, NOT INSIDE NODE.
 *
 * The previous offline guard patched Node's own networking primitives. That proves something about
 * code running in THIS process and nothing whatever about a spawned `cosign`, which is precisely
 * the process whose offline behaviour matters most: it is the one that would silently reach Fulcio
 * or Rekor and then report success.
 *
 * The boundary is therefore the kernel's:
 *
 *   Linux   `unshare --net` — the child gets an empty network namespace with no route anywhere.
 *   macOS   `sandbox-exec` with `(deny network*)` — the child's sockets are refused by the sandbox.
 *
 * Both constrain descendants, which is the whole point. If neither is available, offline
 * verification REFUSES rather than running unconstrained and calling the result offline.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX_PROFILE = `(version 1)
(allow default)
(deny network*)
`;

/**
 * The mechanisms, in preference order. Each is a full argv PREFIX.
 *
 * Hosted Ubuntu proved that unprivileged `unshare --net -r` does NOT work there, while the runner
 * does have passwordless sudo. A single mechanism was therefore not enough, and discovering that
 * only at verification time was catastrophic: the pipeline signed first and threw afterwards, which
 * would have published to Rekor and then failed before persisting anything.
 */
export const MECHANISMS = Object.freeze([
  { name: 'unshare', platform: 'linux', prefix: ['unshare', '--net', '-r'] },
  // GitHub-hosted runners have passwordless sudo; `-n` never prompts, so an unavailable sudo fails
  // fast rather than hanging.
  { name: 'sudo-unshare', platform: 'linux', prefix: ['sudo', '-n', 'unshare', '--net'] },
  { name: 'sandbox-exec', platform: 'darwin', prefix: null },   // needs a generated profile
]);

/**
 * Which OS mechanism actually WORKS here.
 *
 * The probe is FUNCTIONAL, not a `which`. On GitHub's Linux runners `unshare` is installed and
 * nevertheless cannot create a namespace — the binary existing says nothing about whether the
 * kernel will permit the call. A mechanism that is present but non-functional is worse than an
 * absent one, because it reports enforcement it does not provide.
 */
export function networkDenialMechanism(platform = process.platform, probe = worksHere) {
  for (const m of MECHANISMS) {
    if (m.platform !== platform) continue;
    if (m.name === 'sandbox-exec') {
      if (probe('sandbox-exec', ['-p', '(version 1)(allow default)', 'true'])) return m.name;
      continue;
    }
    if (probe(m.prefix[0], [...m.prefix.slice(1), 'true'])) return m.name;
  }
  return null;
}

/** Actually run the mechanism over a trivial command and see whether it succeeds. */
const worksHere = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000 });
  return r.error === undefined && r.status === 0;
};

/**
 * Prove the boundary works BEFORE anything irreversible depends on it.
 *
 * Not "is a mechanism named", but "does a child spawned under it actually fail to reach the
 * network". This is called before signing, so a missing or broken sandbox means ZERO signing
 * attempts rather than a publication that cannot then be verified or persisted.
 */
export function proveNetworkDenial({ platform = process.platform } = {}) {
  const mech = networkDenialMechanism(platform);
  if (mech === null) {
    return { ok: false, mechanism: null,
      why: 'no OS-level network denial mechanism works on this host; offline verification cannot '
        + 'be performed, so nothing may be signed' };
  }
  const probe = runWithoutNetwork([process.execPath, '-e',
    'const h=require("https");const q=h.request("https://example.com");'
    + 'q.on("error",()=>{console.log("DENIED");process.exit(0)});q.end();'
    + 'setTimeout(()=>{console.log("REACHED");process.exit(1)},8000)'], { platform });
  const out = `${probe.stdout}${probe.stderr}`;
  if (!/DENIED/.test(out)) {
    return { ok: false, mechanism: mech,
      why: `the ${mech} boundary did not deny a spawned child (${out.trim().slice(0, 120) || 'no output'}); `
        + 'a boundary that does not hold is not a boundary' };
  }
  // And it must still permit file access, or offline verification cannot read what it verifies.
  const files = runWithoutNetwork([process.execPath, '-e',
    'require("fs").readFileSync("/etc/hosts");console.log("FILES-OK")'], { platform });
  if (!/FILES-OK/.test(`${files.stdout}${files.stderr}`)) {
    return { ok: false, mechanism: mech, why: `the ${mech} boundary also blocks file access` };
  }
  return { ok: true, mechanism: mech };
}

/**
 * Build the argv that runs `command` with the network denied at the OS boundary.
 *
 * Returned rather than executed so a control can assert on the exact invocation without needing
 * the mechanism to be present on the machine running the control.
 */
export function denyNetworkArgv(command, {
  platform = process.platform, profilePath, probe = worksHere, mechanism,
} = {}) {
  const mech = mechanism ?? networkDenialMechanism(platform, probe);
  if (mech === null) return null;
  if (mech === 'sandbox-exec') {
    if (profilePath === undefined) throw new Error('c19-sandbox: a profile path is required on darwin');
    return ['sandbox-exec', '-f', profilePath, ...command];
  }
  const found = MECHANISMS.find((m) => m.name === mech);
  if (found === undefined || found.prefix === null) return null;
  return [...found.prefix, ...command];
}

/**
 * Run `command` with the network denied at the OS boundary.
 *
 * `{ enforced: false }` is never returned silently — when no mechanism exists this raises, because
 * an unconstrained run reported as offline is exactly the false assurance this replaces.
 */
export function runWithoutNetwork(command, {
  cwd, env, platform = process.platform, probe = worksHere,
} = {}) {
  const mech = networkDenialMechanism(platform, probe);
  if (mech === null) {
    throw new Error('c19-sandbox: no OS-level network denial is available on this platform '
      + '(need `unshare` on Linux or `sandbox-exec` on macOS); refusing to run unconstrained and '
      + 'call the result offline');
  }
  let profilePath;
  if (mech === 'sandbox-exec') {
    profilePath = join(mkdtempSync(join(tmpdir(), 'c19-sb-')), 'deny-network.sb');
    writeFileSync(profilePath, SANDBOX_PROFILE);
  }
  const argv = denyNetworkArgv(command, { platform, profilePath, probe });
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  return {
    mechanism: mech, enforced: true,
    status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '',
  };
}

/** The profile text, exported so a control can assert what is actually denied. */
export const DARWIN_PROFILE = SANDBOX_PROFILE;
