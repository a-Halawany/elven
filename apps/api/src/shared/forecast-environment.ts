/**
 * B25 §CX (0108; V03-T-196, F-P5-03 carried) — THE FORECAST ENVIRONMENT: the runtime a forecast was computed in, recorded with the forecast
 * (forecasts_current.environment / environment_digest; the FCT@v2 payload's `environment`) and compared by its replay.
 *
 * The shape mirrors the simulation side's `environmentFor(modelRef, implementationDigest)` (twin/simulations/simulation.service.ts — not
 * imported: prediction may not import twin code, the Nest module cycle), with the forecast's own two facts beside it: the method reference
 * instead of the model reference, and the version of the context ASSEMBLER that froze its information set. The digest is sha-256 over the
 * JCS form of the facts (the `digestOf` rule) — the same facts give the same digest on any host; a different node, platform, architecture,
 * method implementation or assembler gives a different one, and the replay SAYS so (reported, never hidden).
 *
 * THE METHOD REGISTER. A method's implementation digest (sha-256 over the bytes of its implementation file, pinned by a unit control) and,
 * when the method can be re-run deterministically, its compute — registered by the module that implements it (the context part registers
 * the two legacy methods; another part registers its own the same way). It lives here, in `shared/`, so every part can reach it without
 * importing another part's files. An unregistered method still gets an environment (its implementation digest null, said so).
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
/** sha-256 over the JCS (RFC 8785) form — the platform's one canonical digest. */
export const canonicalDigest = (v: unknown): string => sha256(jcsCanonicalize(v));

export interface ForecastEnvironmentFacts {
  node: string; platform: string; arch: string;
  method_ref: string;
  /** sha-256 over the method's implementation bytes; null when the method is not registered (said so in `implementation`) */
  implementation_digest: string | null;
  implementation: 'registered' | 'unregistered';
  assembler_version: string;
}

/** A point of a re-runnable method's output: what a replay recomputes and digests. */
export interface ReplayableOutput { quantiles: { q10: number; q50: number; q90: number }; path: Array<Record<string, unknown>> }
export type ReplayCompute = (points: Array<{ date: string; value: number }>, steps: number, season: number) => ReplayableOutput;

interface Registered { implementationDigest: string; compute: ReplayCompute | null }
const REGISTER = new Map<string, Registered>();

/** Register (or, in a test, replace) a method's implementation digest and its deterministic compute. Answers the previous entry. */
export function registerForecastMethod(methodRef: string, entry: { implementationDigest: string; compute?: ReplayCompute | null }): Registered | undefined {
  if (!/^[a-z0-9][a-z0-9_.-]*@[0-9A-Za-z.]+$/.test(methodRef)) throw new Error(`a method reference is key@version (got ${methodRef})`);
  if (!/^[0-9a-f]{64}$/.test(entry.implementationDigest)) throw new Error('an implementation digest is a sha-256 (64 hex)');
  const prior = REGISTER.get(methodRef);
  REGISTER.set(methodRef, { implementationDigest: entry.implementationDigest, compute: entry.compute ?? null });
  return prior;
}
/** Restore an entry answered by registerForecastMethod (undefined: remove). */
export function restoreForecastMethod(methodRef: string, prior: Registered | undefined): void {
  if (prior === undefined) REGISTER.delete(methodRef); else REGISTER.set(methodRef, prior);
}
export function registeredForecastMethod(methodRef: string): Registered | undefined { return REGISTER.get(methodRef); }

/** The environment facts of a forecast computed by `methodRef` under `assemblerVersion`, on this process. */
export function forecastEnvironmentFacts(methodRef: string, assemblerVersion: string,
  runtime: { node: string; platform: string; arch: string } = { node: process.version, platform: process.platform, arch: process.arch }): ForecastEnvironmentFacts {
  const reg = REGISTER.get(methodRef);
  return {
    node: runtime.node, platform: runtime.platform, arch: runtime.arch, method_ref: methodRef,
    implementation_digest: reg?.implementationDigest ?? null, implementation: reg === undefined ? 'unregistered' : 'registered',
    assembler_version: assemblerVersion,
  };
}

/** The recorded environment: the facts and their digest. */
export function forecastEnvironment(methodRef: string, assemblerVersion: string,
  runtime?: { node: string; platform: string; arch: string }): { digest: string; facts: ForecastEnvironmentFacts } {
  const facts = forecastEnvironmentFacts(methodRef, assemblerVersion, runtime);
  return { digest: canonicalDigest(facts), facts };
}

/** Which facts differ between two environments (the replay's report). */
export function environmentDifferences(a: Record<string, unknown> | null, b: Record<string, unknown> | null): string[] {
  if (a === null || b === null) return a === b ? [] : ['environment'];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k !== 'digest').sort();
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}
