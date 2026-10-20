/**
 * CP-6 B40 §0 — THE CONFINED-PROCESS LAUNCHER (DESIGN D3; MAP §3 §0 item 3). Shared by §IN's content inspector (engine 1) and §CR's
 * connector cell; nothing else in the API spawns an untrusted workload.
 *
 * WHAT IT DOES — one child process per call, started from the running Node binary under NODE 24'S PERMISSION MODEL:
 *   - `--permission` with an fs READ allowance for exactly the paths the caller names (the script itself is added; the item, the package
 *     directory) and NO fs write, NO child process, NO worker thread, NO addon, NO WASI (none of the --allow-* flags for them is passed —
 *     the model denies what is not granted: ERR_ACCESS_DENIED);
 *   - `--disallow-code-generation-from-strings` (no eval / new Function in the child) and `--max-old-space-size` (the V8 heap cap);
 *   - the ENVIRONMENT STRIPPED: the child receives an empty environment (no credential, no database or Redis address, no NODE_OPTIONS —
 *     the parent's are never inherited); the caller may pass named, non-secret values explicitly;
 *   - input on stdin, output on stdout (bounded: a child writing more than `maxOutputBytes` is killed), stderr bounded and kept for the record;
 *   - a WALL-CLOCK limit: on expiry the child is KILLED (SIGKILL) and the outcome is `timeout`.
 * Every outcome other than `ok` is the caller's `unavailable` — §IN quarantines (fail closed), §CR fails the run closed.
 *
 * WHAT IT DOES NOT DO — stated, never claimed (D3): Node 24's permission model has NO network switch. The child is given no credential and
 * no address, and its only intended egress is §CR's gateway on loopback, but a direct socket is NOT prevented by this launcher; the
 * network-level denial (namespaces, firewall, zones) is B103 (F-P7D-02) / B109 (F-P1-17), then R1. The memory cap is the V8 heap only
 * (not the process's resident size). The process shares the host user's identity. These are process-and-capability limits.
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/** A path as the child's loader sees it: symbolic links resolved (macOS's /var → /private/var), so the grant names the real file. */
const real = (p: string): string => { try { return realpathSync(p); } catch { return resolve(p); } };

/** The flags this launcher never passes (asserted by its unit test): each would hand the child a capability it must not hold. */
export const FORBIDDEN_CAPABILITY_FLAGS = ['--allow-fs-write', '--allow-child-process', '--allow-worker', '--allow-addons', '--allow-wasi'] as const;

export interface ConfinedSpawnOptions {
  /** Absolute path of the ES module (or CommonJS file) the child runs. Read access to it is granted automatically. */
  script: string;
  /** Arguments after the script (never interpreted by a shell). */
  args?: readonly string[];
  /** Absolute paths the child may READ (files, or directories whose contents it may read). Nothing else is readable. */
  readPaths?: readonly string[];
  /** Bytes written to the child's stdin, then stdin is closed. */
  stdin?: Uint8Array | string;
  /** Wall-clock limit; the child is killed (SIGKILL) when it is reached. */
  timeoutMs: number;
  /** The V8 old-space heap cap in MiB (`--max-old-space-size`). */
  maxHeapMb: number;
  /** stdout cap; a child that writes more is killed and the outcome is `output_limit`. */
  maxOutputBytes: number;
  /** stderr kept for the record, truncated at this many bytes (default 16 KiB). */
  maxStderrBytes?: number;
  /** Explicit, NON-SECRET values for the child's environment. The parent's environment is never inherited. */
  env?: Readonly<Record<string, string>>;
}

export type ConfinedStatus =
  | 'ok'            // exited with code 0 within every limit
  | 'failed'        // exited non-zero or by a signal it was not sent by the launcher (a crash, an out-of-memory abort, a permission refusal it did not handle)
  | 'timeout'       // killed by the launcher at the wall-clock limit
  | 'output_limit'  // killed by the launcher for writing more than maxOutputBytes
  | 'spawn_failed'; // the process could not be started

export interface ConfinedOutcome {
  status: ConfinedStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  /** Truncated at maxStderrBytes; for the record, never parsed as a verdict. */
  stderr: string;
  durationMs: number;
  /** The exact Node flags the child ran under (no script, no args) — recorded so a verdict states its confinement. */
  flags: string[];
}

/** The Node flags for a confined child. Exported for the record and the unit test; `confinedSpawn` is the only caller that runs them. */
export function confinedFlags(opts: Pick<ConfinedSpawnOptions, 'script' | 'readPaths' | 'maxHeapMb'>): string[] {
  const reads = [opts.script, ...(opts.readPaths ?? [])];
  for (const p of reads) {
    if (typeof p !== 'string' || p.length === 0 || !isAbsolute(p)) throw new TypeError(`spawn-confined: a readable path must be absolute (got ${JSON.stringify(p)})`);
    if (p.includes(',')) throw new TypeError('spawn-confined: a readable path may not contain a comma (the permission flag\'s separator)');
  }
  if (!Number.isInteger(opts.maxHeapMb) || opts.maxHeapMb < 16 || opts.maxHeapMb > 4096) throw new RangeError('spawn-confined: maxHeapMb is an integer between 16 and 4096');
  return [
    '--permission',
    ...[...new Set(reads.map(real))].map((p) => `--allow-fs-read=${p}`),
    '--disallow-code-generation-from-strings',
    `--max-old-space-size=${opts.maxHeapMb}`,
    '--no-warnings',
  ];
}

/**
 * Run one confined child to completion. Never throws for the child's behaviour — every way it can end is an outcome; it throws only for
 * a malformed call (a relative path, a cap out of range).
 */
export function confinedSpawn(opts: ConfinedSpawnOptions): Promise<ConfinedOutcome> {
  const flags = confinedFlags(opts);
  if (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1 || opts.timeoutMs > 600_000) throw new RangeError('spawn-confined: timeoutMs is an integer between 1 and 600000');
  if (!Number.isInteger(opts.maxOutputBytes) || opts.maxOutputBytes < 1) throw new RangeError('spawn-confined: maxOutputBytes is a positive integer');
  const maxStderr = opts.maxStderrBytes ?? 16 * 1024;
  const started = Date.now();
  return new Promise<ConfinedOutcome>((done) => {
    let settled = false;
    let killedFor: 'timeout' | 'output_limit' | null = null;
    const out: Buffer[] = []; let outBytes = 0;
    const err: Buffer[] = []; let errBytes = 0;
    const finish = (o: Omit<ConfinedOutcome, 'durationMs' | 'flags' | 'stdout' | 'stderr'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ ...o, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8'), durationMs: Date.now() - started, flags });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [...flags, real(opts.script), ...(opts.args ?? [])], {
        cwd: dirname(real(opts.script)),
        // THE ENVIRONMENT STRIPPED: only what the caller names explicitly; nothing of the parent's (no credential, no address, no NODE_OPTIONS).
        env: { ...(opts.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch {
      finish({ status: 'spawn_failed', exitCode: null, signal: null });
      return;
    }
    const kill = (why: 'timeout' | 'output_limit') => {
      if (killedFor === null) killedFor = why;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => kill('timeout'), opts.timeoutMs);
    child.stdout!.on('data', (c: Buffer) => {
      outBytes += c.byteLength;
      if (outBytes > opts.maxOutputBytes) { kill('output_limit'); return; }
      out.push(c);
    });
    child.stderr!.on('data', (c: Buffer) => {
      if (errBytes >= maxStderr) return;
      const room = maxStderr - errBytes;
      err.push(c.byteLength > room ? c.subarray(0, room) : c);
      errBytes += Math.min(c.byteLength, room);
    });
    child.on('error', () => finish({ status: killedFor ?? 'spawn_failed', exitCode: null, signal: null }));
    child.on('close', (code, signal) => {
      if (killedFor !== null) finish({ status: killedFor, exitCode: code, signal });
      else finish({ status: code === 0 && signal === null ? 'ok' : 'failed', exitCode: code, signal });
    });
    // stdin: written then closed; a child that exits without reading it is not an error of the launcher
    child.stdin!.on('error', () => undefined);
    if (opts.stdin !== undefined) child.stdin!.end(typeof opts.stdin === 'string' ? Buffer.from(opts.stdin, 'utf8') : Buffer.from(opts.stdin));
    else child.stdin!.end();
  });
}
