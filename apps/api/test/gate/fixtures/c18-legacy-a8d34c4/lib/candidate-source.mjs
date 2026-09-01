/**
 * C16-R3.4.1 §A3 — THE SCANNED CANDIDATE, BOUND.
 *
 * ── THE FALSE PASS THIS CLOSES ────────────────────────────────────────────────────
 * R3.4 derived the expected repository root FROM the evidence: it read the `--source`
 * argument out of the recorded argv and used that as the definition of "the repo". Rewrite
 * every recorded scan root consistently to `/attacker/decoy-source` and the package was
 * self-consistent and accepted. The gate proved something had been scanned; it did not prove
 * WHAT.
 *
 * The scanners are now invoked with source-owned RELATIVE arguments (`.`, `.gitleaks.toml`)
 * from a runner-controlled candidate root, so no absolute path appears in argv at all and there
 * is nothing there to rewrite. What identifies the subject instead is this manifest: a
 * deterministic digest over the TRACKED FILES of the candidate, computed before scanning,
 * recomputed after, and bound to the expected source SHA.
 *
 * A verifier recomputes it from its own checkout of that SHA. A decoy tree cannot match, and a
 * modified tree cannot match either — which is the same guarantee, stated once.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Every tracked path, in `git ls-files` order (sorted, deterministic), with its blob digest
 * taken from the WORKING TREE rather than the index — the bytes a scanner would actually read.
 *
 * Deliberate limits, stated rather than hidden:
 *   * untracked files are NOT included; they are not the candidate, and the gate separately
 *     requires a clean worktree in final mode, which is what makes that safe;
 *   * file modes are not covered — a mode-only change would not alter this digest.
 */
export function candidateSourceManifest(root) {
  const listing = spawnSync('git', ['ls-files', '-z'], {
    cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
  });
  if (listing.status !== 0) {
    return { ok: false, error: 'git ls-files failed; the candidate source cannot be enumerated' };
  }
  const paths = listing.stdout.toString('utf8').split('\u0000').filter((p) => p.length > 0).sort();
  if (paths.length === 0) {
    return { ok: false, error: 'the candidate contains no tracked files' };
  }
  const entries = [];
  for (const rel of paths) {
    let bytes;
    try {
      bytes = readFileSync(join(root, rel));
    } catch {
      // A tracked path absent from the worktree is itself a finding.
      return { ok: false, error: `tracked path '${rel}' is missing from the candidate worktree` };
    }
    entries.push({ path: rel, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return {
    ok: true,
    algorithm: 'sha256 over the sorted list of {path,bytes,sha256} for every tracked file',
    file_count: entries.length,
    total_bytes: entries.reduce((a, e) => a + e.bytes, 0),
    digest: sha256(JSON.stringify(entries)),
  };
}

/** Compare two manifests, naming what moved. */
export function manifestProblems(before, after) {
  const problems = [];
  if (before?.ok !== true) {
    problems.push(`candidate source manifest (before) failed: ${before?.error ?? 'unknown'}`);
  }
  if (after?.ok !== true) {
    problems.push(`candidate source manifest (after) failed: ${after?.error ?? 'unknown'}`);
  }
  if (before?.ok === true && after?.ok === true) {
    if (before.digest !== after.digest) {
      problems.push(
        `the candidate source changed DURING scanning: ${before.digest} → ${after.digest} ` +
        `(${before.file_count}/${before.total_bytes}B → ${after.file_count}/${after.total_bytes}B)`,
      );
    }
  }
  return problems;
}
