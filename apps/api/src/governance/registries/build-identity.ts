/**
 * B107 §RG (0115_b107_x_rg) — THE BUILD IDENTITY (ES-06-003, ES-06-002): what produced an output — the head SHA (from the environment ONLY:
 * EYE_BUILD_SHA, else GITHUB_SHA; absent → null, stated "unstated", never guessed from a working tree), the migration head (the database's
 * public.schema_migrations, read by governance.rg_build_identity), the policy bundle version (the PDP's), and the conformance manifest's
 * sha256 (the repository's conformance.manifest.json as the API reads it). Stamped on the DECLARED SET of §RG's own outputs — every import,
 * every recorded impact, every verification record — and nothing else (the scope bound of ES-06-003 in this stage).
 *
 * THE REPOSITORY ROOT the importers read: EYE_GOVERNANCE_REPO_ROOT when set (a harness's synthetic registers), else the nearest ancestor of
 * the working directory holding pnpm-workspace.yaml. Files are READ; nothing here writes the repository.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sha256 } from './importers.js';

export function repoRoot(): string {
  const env = process.env['EYE_GOVERNANCE_REPO_ROOT'];
  if (env !== undefined && env !== '') return resolve(env);
  let d = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  return process.cwd();
}

export interface BuildIdentity { head_sha: string | null; head_sha_source: string; policy_bundle: string | null; manifest_digest: string | null; manifest_path: string }
export function buildIdentity(policyBundle: string | null, root = repoRoot()): BuildIdentity {
  const sha = process.env['EYE_BUILD_SHA'] ?? process.env['GITHUB_SHA'] ?? null;
  const path = join(root, 'conformance.manifest.json');
  let digest: string | null = null;
  try { digest = sha256(readFileSync(path)); } catch { digest = null; }
  return {
    head_sha: sha !== null && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null,
    head_sha_source: sha === null ? 'unstated (EYE_BUILD_SHA / GITHUB_SHA absent)' : /^[0-9a-f]{7,40}$/.test(sha) ? (process.env['EYE_BUILD_SHA'] !== undefined ? 'EYE_BUILD_SHA' : 'GITHUB_SHA') : 'unstated (not a SHA)',
    policy_bundle: policyBundle, manifest_digest: digest, manifest_path: 'conformance.manifest.json',
  };
}
