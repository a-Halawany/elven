/**
 * B107 §CM — THE BUILD IDENTITY the release candidate binds and the conformance monitor observes (DESIGN D1/D6): the HEAD SHA (the environment's
 * `EYE_BUILD_HEAD_SHA` when the deployment declares one, else the workspace's git HEAD read from the files — no subprocess; `unknown` when
 * neither answers: never inferred), the POLICY BUNDLE (its version and the digest of its rules), the COMMITTED component manifest (its path, the
 * sha256 of its bytes, its index) and the CONFIGURATION digest (over the declared non-secret configuration keys only — never a credential).
 * The migration head is the database's (governance.cm_migration_head()), read by the ports themselves.
 *
 * Everything here READS; nothing writes. A missing or unreadable manifest is reported as such (the monitor records `manifest_unreadable`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { PdpService, policyBundleDigest } from '../../policy/pdp.service.js';

export const MANIFEST_REL = 'conformance/components.manifest.json';
export const MANIFEST_SCHEMA_PREFIX = 'eye.components-manifest/v';
/** The non-secret configuration this candidate binds (names, not values, are listed in the record). */
export const CONFIG_KEYS = ['EYE_RUNTIME_ENV', 'EYE_POLICY_BUNDLE_VERSION', 'EYE_DB_NAME', 'EYE_REDIS_PORT', 'EYE_EXECUTIVE_SIGNING_KEY_REF'] as const;

type Row = Record<string, unknown>;
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

/** The workspace root (the directory holding pnpm-workspace.yaml) — the config's own idiom (this package emits CommonJS: __dirname). */
export function workspaceRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** The git HEAD of a workspace, read from its files (a worktree's `.git` file names its gitdir; a ref is resolved loose, then packed). */
export function gitHead(root: string): string | null {
  try {
    let gitDir = join(root, '.git');
    if (!existsSync(gitDir)) return null;
    if (statSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(gitDir, 'utf8'));
      if (m === null || m[1] === undefined) return null;
      gitDir = isAbsolute(m[1]) ? m[1] : resolve(root, m[1]);
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
    if (ref === undefined) return null;
    const common = existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()) : gitDir;
    for (const d of [gitDir, common]) {
      const loose = join(d, ref);
      if (existsSync(loose)) { const v = readFileSync(loose, 'utf8').trim(); if (/^[0-9a-f]{40}$/.test(v)) return v; }
    }
    const packed = join(common, 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const [sha, name] = line.trim().split(' ');
        if (name === ref && sha !== undefined && /^[0-9a-f]{40}$/.test(sha)) return sha;
      }
    }
    return null;
  } catch { return null; }
}

export interface CommittedManifest {
  readable: boolean; path: string; reason?: string; fileDigest?: string; schema?: string; generator?: string;
  summary?: Row; index?: { units: Row[]; components: Row[] }; layers?: Row[]; closure?: Row[]; manifest?: Row;
}

/** The manifest path this runtime reads (`EYE_CONFORMANCE_MANIFEST_PATH` may point elsewhere — the fault exercise uses it). */
export function manifestPath(root = workspaceRoot()): string {
  const v = process.env['EYE_CONFORMANCE_MANIFEST_PATH'];
  return v !== undefined && v !== '' ? (isAbsolute(v) ? v : resolve(root, v)) : join(root, MANIFEST_REL);
}

/** The INDEX the ports read: per unit its id, path, kind, components, layers, dependencies, semantic authority, mapped; per component its kind,
 *  name, layer, interfaces, schema types, requirement key (V3:/V6:/V7:<id>) and deploying units. */
export function indexOf(m: Row): { units: Row[]; components: Row[] } {
  const units = ((m['deployable_units'] ?? []) as Row[]).map((u) => ({
    unit_id: u['unit_id'] ?? null, path: u['path'], kind: u['kind'], mapped: u['mapped'] !== false, ...(u['reason'] !== undefined ? { reason: u['reason'] } : {}),
    component_ids: u['component_ids'] ?? [], layers: u['layers'] ?? [], dependencies: u['dependencies'] ?? [], semantic_authority: u['semantic_authority'] ?? null, owner: u['owner'] ?? null,
  }));
  const lc = ((m['logical_components'] ?? []) as Row[]).map((c) => ({ component_id: c['component_id'], kind: 'logical', name: c['name'], layer: c['layer'], owner: c['owner'],
    state_class: c['state_class'], interfaces: (c['contracts'] as Row | undefined)?.['interfaces'] ?? [], schema_types: (c['contracts'] as Row | undefined)?.['schema_types'] ?? [],
    requirement: c['requirement'] ?? null, deployed_by: (c['dependencies'] as Row | undefined)?.['deployed_by'] ?? [] }));
  const cat = (key: string, kind: string, vol: string | null) => ((m[key] ?? []) as Row[]).map((c) => ({ component_id: c['component_id'], kind,
    name: typeof c['catalogue_entry'] === 'string' ? String(c['catalogue_entry']).slice(0, 160) : (c['description'] ?? c['component_id']),
    requirement: vol === null ? null : `${vol}:${String(c['component_id'])}`, deployed_by: c['deployed_by'] ?? [] }));
  return { units, components: [...lc, ...cat('platform_components', 'platform', null), ...cat('infrastructure_components', 'infrastructure', 'V6'), ...cat('data_components', 'data', 'V7')] };
}

/** The COMMITTED manifest: its bytes' digest and its index — or why it cannot be read (never a guess). */
export function readCommittedManifest(path = manifestPath()): CommittedManifest {
  try {
    if (!existsSync(path)) return { readable: false, path, reason: 'the committed component manifest is missing' };
    const bytes = readFileSync(path);
    const m = JSON.parse(bytes.toString('utf8')) as Row;
    const schema = String(m['schema'] ?? '');
    if (!schema.startsWith(MANIFEST_SCHEMA_PREFIX)) return { readable: false, path, reason: `the file is not a component manifest (schema ${schema || 'absent'})` };
    return { readable: true, path, fileDigest: sha256(bytes), schema, generator: String(m['generator'] ?? ''), summary: (m['summary'] ?? {}) as Row, index: indexOf(m),
             layers: (m['layers'] ?? []) as Row[], manifest: m };
  } catch (e) {
    return { readable: false, path, reason: `the committed component manifest cannot be read: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` };
  }
}

export interface BuildIdentity {
  head_sha: string; head_source: 'env' | 'git' | 'unknown';
  policy_bundle: { version: string; digest: string };
  config_digest: string; config_keys: readonly string[];
  manifest: { path: string; readable: boolean; file_digest: string | null; reason: string | null };
}

/** The build identity of THIS runtime (the server's own — a client never supplies it). */
export function buildIdentity(root = workspaceRoot()): BuildIdentity {
  const env = process.env['EYE_BUILD_HEAD_SHA'];
  const fromEnv = env !== undefined && /^[0-9a-f]{40}$/.test(env) ? env : null;
  const fromGit = fromEnv === null ? gitHead(root) : null;
  const config = Object.fromEntries(CONFIG_KEYS.map((k) => [k, process.env[k] ?? null]));
  const m = readCommittedManifest(manifestPath(root));
  return {
    head_sha: fromEnv ?? fromGit ?? 'unknown', head_source: fromEnv !== null ? 'env' : fromGit !== null ? 'git' : 'unknown',
    policy_bundle: { version: new PdpService().bundleVersion, digest: policyBundleDigest() },
    config_digest: sha256(JSON.stringify(config)), config_keys: CONFIG_KEYS,
    manifest: { path: m.path, readable: m.readable, file_digest: m.fileDigest ?? null, reason: m.reason ?? null },
  };
}
