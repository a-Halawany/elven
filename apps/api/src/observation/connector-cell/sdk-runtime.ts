/**
 * CP-6 B40 §CR — WHERE THE PUBLISHED SDK IS, AND WHAT IT DIGESTS TO.
 *
 * The SDK (`packages/connector-sdk`, private, semver, dependency-free) is the contract a cell speaks. The API reaches it BY PATH — the
 * workspace root (the directory holding pnpm-workspace.yaml, found from this module's own directory: the config's idiom; this package
 * emits CommonJS, so __dirname) + packages/connector-sdk — and NOT as a declared workspace dependency: a declared link would make the
 * package a new first-party importer of the C16 closure, whose governed component type lives in the frozen
 * scripts/gate/target-descriptor.json (D18). The lockfile carries the package as an importer with no dependency, so the closures are
 * unchanged (proved by running the closure generator; reported for the integrator).
 *
 * The cell connector's CODE DIGEST is the SDK's own digest (its package digest over package.json, index.js, cell-runtime.js): an agent is
 * registered for exactly that SDK, and a changed SDK is a new agent instance, never the same one quietly running other code.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export type Sdk = typeof import('../../../../../packages/connector-sdk/index.js');

/** The SDK files the cell's code digest covers (everything that runs or declares the package). */
export const SDK_FILES = ['cell-runtime.js', 'index.js', 'package.json'] as const;

function workspaceRoot(): string | null {
  for (const start of [__dirname, process.cwd()]) {
    let dir = resolve(start);
    for (let i = 0; i < 12; i += 1) {
      if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

export interface SdkLocation { dir: string; runtime: string; index: string; version: string; digest: string; files: Array<{ file: string; sha256: string }> }

let located: SdkLocation | null | undefined;
/** The SDK's directory, its cell runtime, its version and its digest — or null (a deployment without it runs no cell; fail closed). */
export function locateSdk(): SdkLocation | null {
  if (located !== undefined) return located;
  const root = workspaceRoot();
  const dir = root === null ? null : join(root, 'packages', 'connector-sdk');
  if (dir === null || !SDK_FILES.every((f) => existsSync(join(dir, f)))) { located = null; return null; }
  const files = SDK_FILES.map((file) => ({ file, sha256: createHash('sha256').update(readFileSync(join(dir, file))).digest('hex') }));
  const digest = createHash('sha256').update(files.map((f) => `${f.file}\0${f.sha256}\n`).join('')).digest('hex');
  const version = String((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: unknown }).version ?? '0.0.0');
  located = { dir, runtime: join(dir, 'cell-runtime.js'), index: join(dir, 'index.js'), version, digest, files };
  return located;
}

let loaded: Promise<Sdk> | null = null;
/** The SDK module itself (frame validation, the manifest check, the package digest) — the same file the cell imports. */
export function loadSdk(): Promise<Sdk> {
  if (loaded === null) {
    const at = locateSdk();
    if (at === null) return Promise.reject(new Error('the connector SDK (packages/connector-sdk) is not present in this deployment'));
    loaded = import(pathToFileURL(at.index).href) as Promise<Sdk>;
  }
  return loaded;
}
