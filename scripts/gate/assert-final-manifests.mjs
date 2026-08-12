/**
 * C16-R3 — assert that the uploaded gate manifests really state FINAL mode and really
 * carry the exact commit the run describes.
 *
 * A tracked script rather than an inline CI heredoc: the assertion is the point, so it
 * should be reviewable, testable and identical wherever it runs. It also cannot be broken
 * by YAML block-scalar indentation rules.
 *
 * Usage:
 *   node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [c15Dir, c16Dir, expectedSha] = process.argv.slice(2);
const problems = [];

if (c15Dir === undefined || c16Dir === undefined || expectedSha === undefined) {
  console.error('usage: node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>');
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
  console.error(`expected SHA ${JSON.stringify(expectedSha)} is not a 40-character git object id`);
  process.exit(2);
}

const read = (label, path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    problems.push(`${label}: could not read ${path} (${e instanceof Error ? e.message.slice(0, 160) : e})`);
    return null;
  }
};

const c15 = read('C15', join(c15Dir, 'supply-chain-manifest.json'));
if (c15 !== null) {
  if (c15.mode !== 'final') problems.push(`C15 mode is ${JSON.stringify(c15.mode)}, expected "final"`);
  if (c15.outcome !== 'PASS') problems.push(`C15 outcome is ${JSON.stringify(c15.outcome)}, expected "PASS"`);
  if (c15.source_sha !== expectedSha) {
    problems.push(`C15 source_sha is ${JSON.stringify(c15.source_sha)}, expected ${expectedSha}`);
  }
  if (c15.tree_clean_at_run !== true) problems.push('C15 did not record a clean worktree');
  if (!Array.isArray(c15.evidence_artifacts) || c15.evidence_artifacts.length === 0) {
    problems.push('C15 bound no evidence artifacts');
  }
  for (const a of c15.evidence_artifacts ?? []) {
    if (!/^[a-f0-9]{64}$/.test(String(a.sha256))) {
      problems.push(`C15 artifact ${a.path} has no valid SHA-256`);
    }
  }
  if (c15.trivy_cache_unchanged !== true) {
    problems.push('C15 did not prove the trivy cache was unchanged across the authoritative scans');
  }
  const auth = c15.executed_binary_authentication?.verified ?? {};
  for (const [tool, v] of Object.entries(auth)) {
    if (v.match !== true) problems.push(`C15 did not authenticate the ${tool} executable bytes`);
  }
}

const c16 = read('C16', join(c16Dir, 'closure-reconciliation.json'));
if (c16 !== null) {
  if (typeof c16.status !== 'string' || !c16.status.startsWith('FINAL')) {
    problems.push(`C16 status is ${JSON.stringify(c16.status)}, expected a FINAL status`);
  }
  if (c16.generated_from?.source_sha !== expectedSha) {
    problems.push(`C16 source_sha is ${JSON.stringify(c16.generated_from?.source_sha)}, expected ${expectedSha}`);
  }
  const posture = c16.final_source_posture;
  if (posture === null || posture === undefined) {
    problems.push('C16 recorded no final_source_posture');
  } else {
    if (posture.expected_sha !== expectedSha) {
      problems.push(`C16 final_source_posture.expected_sha is ${JSON.stringify(posture.expected_sha)}`);
    }
    if (posture.head_sha !== expectedSha) {
      problems.push(`C16 final_source_posture.head_sha is ${JSON.stringify(posture.head_sha)}`);
    }
    if (posture.worktree_clean !== true) problems.push('C16 did not record a clean worktree');
  }
  for (const [name, t] of Object.entries(c16.targets ?? {})) {
    if (t.reconciliation?.clean !== true) problems.push(`C16 target ${name} did not reconcile clean`);
    if (!/^[a-f0-9]{64}$/.test(String(t.sbom_sha256))) {
      problems.push(`C16 target ${name} has no valid SBOM digest`);
    }
  }
}

if (problems.length > 0) {
  console.error('=== FINAL-MANIFEST ASSERTION FAILED ===');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`final mode confirmed for C15 and C16 at ${expectedSha}`);
console.log(`  C15 artifacts bound: ${c15.evidence_artifacts.length}`);
console.log(`  C16 targets: ${Object.keys(c16.targets).join(', ')}`);
