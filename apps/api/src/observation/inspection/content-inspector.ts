/**
 * CP-6 B40 §IN — ENGINE 1, THE CONTENT INSPECTOR, as the API calls it (DESIGN D2, D3; L1-C07, DAT-IN-11, IC-19). The rules live in
 * content-inspector.child.mjs; this module runs them in the §0 launcher (sandbox/spawn-confined.ts) and turns what comes back into an
 * EngineVerdict WITH the engine identity — the engine, its version, the rule set's digest (sha256 of the child script: a changed rule is a
 * changed engine) and the confinement it ran under.
 *
 * THE SANDBOX: one child per item; the bytes are written to a private temporary file (0600, in a fresh 0700 directory, removed after) and the
 * child may READ that one file and its own script — nothing else; no fs write, no child process, no worker, no addon, no code generation
 * from strings; 128 MiB of heap; 5 s of wall clock (killed at the limit); the environment empty. Network denial is NOT a launcher property
 * (D3): the inspector opens no socket, and the network-level denial is B103/B109's — stated on every verdict, never claimed.
 *
 * FAIL CLOSED: a crash, a timeout, an output over its cap, a spawn failure — every launcher outcome but `ok` — is `unavailable`; an answer
 * that is not the inspector's JSON, or the inspector's own `failed`, is `failed`; a scan cut short by a budget is `incomplete`. None of them
 * is clean (D2), and the stage quarantines each with its class (QUARANTINE_CLASS_OF_OUTCOME).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { confinedSpawn, type ConfinedOutcome } from '../sandbox/spawn-confined.js';
import * as fault from '../fault-injection.js';
import type { EngineIdentity, InspectionFinding, InspectionOutcome } from '../acquisition/intake-stage-types.js';
import type { RecordedEngineVerdict } from './engine-port.js';

export const CONTENT_INSPECTOR_ENGINE = 'content-inspector';
export const CONTENT_INSPECTOR_VERSION = '1.0.0';
/** The finding classes engine 1 reports (content-inspector.child.mjs). */
export type ContentFindingClass = 'malware' | 'active_content' | 'macro' | 'embedded_file' | 'hidden_instruction' | 'limit' | 'info';
export const CONTENT_POLICY_CLASSES = ['active_content', 'macro', 'embedded_file', 'hidden_instruction'] as const;
export type ContentPolicyClass = (typeof CONTENT_POLICY_CLASSES)[number];

export interface ContentInspectorLimits { timeoutMs: number; maxHeapMb: number; maxOutputBytes: number }
/** MAP §3 / the brief: 128 MiB, 5 s. */
export const CONTENT_INSPECTOR_LIMITS: Readonly<ContentInspectorLimits> = Object.freeze({ timeoutMs: 5_000, maxHeapMb: 128, maxOutputBytes: 256 * 1024 });

/** The child script beside this module (the build copies it next to the emitted module; the source tree is the fallback — xml-parse.ts's rule). */
export function contentInspectorScript(): string {
  const local = join(__dirname, 'content-inspector.child.mjs');
  if (existsSync(local)) return local;
  return join(__dirname.replace(`${sep}dist${sep}`, `${sep}src${sep}`), 'content-inspector.child.mjs');
}
let ruleSetDigestCache: { path: string; digest: string } | null = null;
/** sha256 (hex) of the rule set — the child script's bytes. */
export function contentInspectorRuleSetDigest(): string {
  const path = contentInspectorScript();
  if (ruleSetDigestCache?.path !== path) ruleSetDigestCache = { path, digest: createHash('sha256').update(readFileSync(path)).digest('hex') };
  return ruleSetDigestCache.digest;
}

/** One finding as the child reports it (a code, a class, offsets, a short detail — never content). */
export interface ContentFinding extends InspectionFinding { class?: ContentFindingClass }
export interface ContentInspectorVerdict extends RecordedEngineVerdict {
  findings: ContentFinding[];
  /** What the child could say about the structure (for the quality score): null when it did not answer. */
  parse: { format: string; structure_ok: boolean } | null;
}

const ALLOWED_OUTCOMES: ReadonlySet<InspectionOutcome> = new Set(['clean', 'detected', 'incomplete', 'failed']);
const FINDING_CLASSES: ReadonlySet<string> = new Set(['malware', 'active_content', 'macro', 'embedded_file', 'hidden_instruction', 'limit', 'info']);

/** The flags as recorded (the item's temporary path replaced by `<item>` — the record names the grant, not a host path). */
const recordedFlags = (o: ConfinedOutcome | null, script: string, item: string | null): string[] =>
  (o?.flags ?? []).map((f) => (item !== null && f.includes(item) ? f.replace(item, '<item>') : f.replace(script, '<inspector>')));

/** Parse the child's answer strictly: anything but the inspector's own JSON shape is `failed`. */
export function parseInspectorAnswer(stdout: string): { outcome: InspectionOutcome; findings: ContentFinding[]; parse: ContentInspectorVerdict['parse']; detail: string | null } | null {
  let j: unknown;
  try { j = JSON.parse(stdout); } catch { return null; }
  if (j === null || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o['engine'] !== CONTENT_INSPECTOR_ENGINE || o['version'] !== CONTENT_INSPECTOR_VERSION) return null;
  if (typeof o['outcome'] !== 'string' || !ALLOWED_OUTCOMES.has(o['outcome'] as InspectionOutcome)) return null;
  if (!Array.isArray(o['findings'])) return null;
  const findings: ContentFinding[] = [];
  for (const f of o['findings'] as unknown[]) {
    if (f === null || typeof f !== 'object') return null;
    const r = f as Record<string, unknown>;
    if (typeof r['code'] !== 'string' || (r['class'] !== undefined && (typeof r['class'] !== 'string' || !FINDING_CLASSES.has(r['class'])))) return null;
    findings.push({
      code: r['code'].slice(0, 160),
      ...(typeof r['class'] === 'string' ? { class: r['class'] as ContentFindingClass } : {}),
      ...(Number.isInteger(r['offset']) && (r['offset'] as number) >= 0 ? { offset: r['offset'] as number } : {}),
      ...(Number.isInteger(r['length']) && (r['length'] as number) >= 0 ? { length: r['length'] as number } : {}),
      ...(typeof r['detail'] === 'string' ? { detail: r['detail'].slice(0, 240) } : {}),
    });
  }
  const p = o['parse'] as Record<string, unknown> | null | undefined;
  return {
    outcome: o['outcome'] as InspectionOutcome, findings,
    parse: p !== null && typeof p === 'object' && typeof p['format'] === 'string' ? { format: p['format'], structure_ok: p['structure_ok'] === true } : null,
    detail: typeof o['detail'] === 'string' ? o['detail'].slice(0, 300) : null,
  };
}

/**
 * Inspect one item's bytes in the sandbox. Never throws: every way it can end is a verdict (fail closed). `limits` exists for the unit test's
 * timeout case; the stage always uses CONTENT_INSPECTOR_LIMITS.
 */
export async function runContentInspector(bytes: Uint8Array, meta: { filename: string | null; declaredType: string | null },
                                          limits: ContentInspectorLimits = CONTENT_INSPECTOR_LIMITS): Promise<ContentInspectorVerdict> {
  const startedAt = new Date().toISOString();
  const script = contentInspectorScript();
  const identity = (): EngineIdentity => ({
    engine: CONTENT_INSPECTOR_ENGINE, engineVersion: CONTENT_INSPECTOR_VERSION, imageDigest: null,
    ruleSetDigest: contentInspectorRuleSetDigest(), signatureDatabases: [],
  });
  const config = (o: ConfinedOutcome | null, item: string | null) => ({
    sandbox: 'node --permission (spawn-confined.ts): fs read of the one item and the inspector only; no fs write, no child process, no worker, no addon',
    flags: recordedFlags(o, script, item), timeout_ms: limits.timeoutMs, max_heap_mb: limits.maxHeapMb,
    network: 'not denied by the launcher — the inspector opens no socket; network-level denial is B103/B109 (D3)',
    ...(o === null ? {} : { duration_ms: o.durationMs, exit_code: o.exitCode }),
  });
  const verdict = (o: ConfinedOutcome | null, item: string | null, outcome: InspectionOutcome, findings: ContentFinding[], parse: ContentInspectorVerdict['parse'],
                   detail: string | null): ContentInspectorVerdict => ({
    identity: identity(), outcome, findings, parse, startedAt, finishedAt: new Date().toISOString(),
    ...(detail === null ? {} : { detail }), engineConfig: config(o, item),
  });
  let dir: string | null = null; let item: string | null = null; let o: ConfinedOutcome | null = null;
  try {
    fault.at('f48.inspector_crash_or_timeout');   // B40 in (F48): the sandbox crashed or timed out — answered below as unavailable
    dir = await realpath(await mkdtemp(join(tmpdir(), 'eye-inspect-')));   // the real path: the permission grant names the file the child opens
    item = join(dir, 'item');
    await writeFile(item, bytes, { mode: 0o600 });
    o = await confinedSpawn({
      script, args: [item], readPaths: [item], stdin: JSON.stringify({ filename: meta.filename, declaredType: meta.declaredType }),
      timeoutMs: limits.timeoutMs, maxHeapMb: limits.maxHeapMb, maxOutputBytes: limits.maxOutputBytes,
    });
  } catch (e) {
    return verdict(o, item, 'unavailable', [], null, `the sandboxed inspector could not run (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`);
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  if (o.status !== 'ok') {
    const why = o.status === 'timeout' ? `killed at the ${limits.timeoutMs} ms limit` : o.status === 'output_limit' ? 'killed for writing past its output cap'
      : o.status === 'spawn_failed' ? 'the sandbox could not be started' : `the sandbox ended abnormally (exit ${o.exitCode ?? 'none'}${o.signal === null ? '' : `, ${o.signal}`})`;
    return verdict(o, item, 'unavailable', [], null, `content inspector unavailable: ${why}`);
  }
  const a = parseInspectorAnswer(o.stdout.toString('utf8'));
  if (a === null) return verdict(o, item, 'failed', [], null, 'the inspector answered with something that is not its verdict');
  return verdict(o, item, a.outcome, a.findings, a.parse, a.detail);
}
