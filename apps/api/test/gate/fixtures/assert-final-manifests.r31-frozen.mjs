/**
 * FROZEN HISTORICAL ARTIFACT — DO NOT EDIT, DO NOT IMPORT FROM PRODUCTION CODE.
 *
 * This is a byte copy of `scripts/gate/assert-final-manifests.mjs` as it stood at commit
 * 28b60e8 — the C16-R3.1 verifier that an independent reviewer showed to be a false pass:
 * it validated CLAIMS about digests and sizes without ever reading the files those claims
 * describe, derived the expected target set from the same descriptor it was checking, and
 * hardcoded the authenticated-scanner pair instead of deriving it from the pins.
 *
 * It exists so the C16-R3.2 mutation controls can EXECUTE the defective behaviour and show
 * that each mutation passes it and fails the corrected verifier. Without that, a control
 * only asserts that the new code rejects something — it cannot show the rejection is the
 * defect being closed rather than a check that always existed.
 *
 * The one edit below is mechanical: the `import.meta.url` main-module guard is removed so
 * importing this file cannot execute a CLI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** CODE-OWNED constants. A prefix match is not an equality check. */
export const C15_FINAL_MODE = 'final';
export const C15_PASS_OUTCOME = 'PASS';
export const C16_FINAL_STATUS =
  'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA';
/** Scanners whose executable bytes must have been authenticated. */
export const REQUIRED_AUTHENTICATED_TOOLS = Object.freeze(['trivy', 'gitleaks']);
/** Raw outputs every passing C15 run must have produced and bound. */
export const REQUIRED_C15_ARTIFACTS = Object.freeze([
  'RESULT-PASS.txt',
  'gitleaks-history.json',
  'gitleaks-worktree.json',
  'image-findings.json',
  'pnpm-audit-human.stdout.txt',
  'pnpm-audit-json.stdout.txt',
  'trivy-acquire-checks.stdout.txt',
  'trivy-acquire-db.stdout.txt',
  'trivy-fs-json.stdout.txt',
  'trivy-fs.stdout.txt',
]);

const SHA256_HEX = /^[a-f0-9]{64}$/;

/** The exact target ids the descriptor declares — the expected C16 target set. */
export function expectedTargetIds(root = ROOT) {
  const descriptor = JSON.parse(
    readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8'),
  );
  return Object.keys(descriptor.targets ?? {}).sort();
}

export function assertFinalManifests({ c15Dir, c16Dir, expectedSha, root = ROOT }) {
  const problems = [];
  const read = (label, path) => {
    if (!existsSync(path)) {
      problems.push(`${label}: ${path} does not exist`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      problems.push(`${label}: ${path} is not valid JSON (${e instanceof Error ? e.message.slice(0, 160) : e})`);
      return null;
    }
  };

  // ── C15 ────────────────────────────────────────────────────────────────────────
  const c15 = read('C15', join(c15Dir, 'supply-chain-manifest.json'));
  if (c15 !== null) {
    if (c15.mode !== C15_FINAL_MODE) {
      problems.push(`C15 mode is ${JSON.stringify(c15.mode)}, expected exactly ${JSON.stringify(C15_FINAL_MODE)}`);
    }
    if (c15.outcome !== C15_PASS_OUTCOME) {
      problems.push(`C15 outcome is ${JSON.stringify(c15.outcome)}, expected exactly ${JSON.stringify(C15_PASS_OUTCOME)}`);
    }
    if (c15.source_sha !== expectedSha) {
      problems.push(`C15 source_sha is ${JSON.stringify(c15.source_sha)}, expected ${expectedSha}`);
    }
    if (c15.tree_clean_at_run !== true) problems.push('C15 did not record a clean worktree');
    if (c15.trivy_cache_unchanged !== true) {
      problems.push('C15 did not prove the trivy cache was unchanged across the authoritative scans');
    }
    if (!Array.isArray(c15.failures) || c15.failures.length !== 0) {
      problems.push(`C15 recorded ${(c15.failures ?? []).length} failure(s) in a PASS manifest`);
    }

    // AUTHENTICATED TOOL SET — exact, derived from the pins, never "whatever was present".
    const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
    const verified = c15.executed_binary_authentication?.verified ?? {};
    const verifiedNames = Object.keys(verified).sort();
    const expectedTools = [...REQUIRED_AUTHENTICATED_TOOLS].sort();
    if (verifiedNames.join(',') !== expectedTools.join(',')) {
      problems.push(
        `C15 authenticated tool set is [${verifiedNames.join(', ')}], expected exactly ` +
        `[${expectedTools.join(', ')}]`,
      );
    }
    for (const tool of expectedTools) {
      const v = verified[tool];
      if (v === undefined) continue;   // already reported by the set comparison
      if (v.match !== true) problems.push(`C15 did not authenticate the ${tool} executable bytes`);
      if (!SHA256_HEX.test(String(v.actual_sha256))) {
        problems.push(`C15 recorded no valid ${tool} executable digest`);
      }
      const hostKey = c15.host_platform_key;
      const want = pins.tools?.[tool]?.artifacts?.[hostKey]?.executable_sha256 ?? null;
      if (want === null) {
        problems.push(`C15 host platform ${JSON.stringify(hostKey)} has no tracked ${tool} digest`);
      } else if (v.actual_sha256 !== want) {
        problems.push(`C15 ${tool} digest ${v.actual_sha256} does not match the tracked ${want}`);
      }
    }

    // ARTIFACT BINDINGS — every required raw output present, digested, and non-empty set.
    const bound = new Map(
      (Array.isArray(c15.evidence_artifacts) ? c15.evidence_artifacts : []).map((a) => [a.path, a]),
    );
    if (bound.size === 0) problems.push('C15 bound no evidence artifacts');
    for (const required of REQUIRED_C15_ARTIFACTS) {
      const a = bound.get(required);
      if (a === undefined) {
        problems.push(`C15 did not bind the required artifact '${required}'`);
        continue;
      }
      if (!SHA256_HEX.test(String(a.sha256))) {
        problems.push(`C15 artifact '${required}' has no valid SHA-256`);
      }
      if (typeof a.bytes !== 'number') {
        problems.push(`C15 artifact '${required}' records no byte length`);
      }
    }
    for (const [path, a] of bound) {
      if (!SHA256_HEX.test(String(a.sha256))) {
        problems.push(`C15 artifact '${path}' has no valid SHA-256`);
      }
    }

    // Image findings must have been reconciled, with nothing ungoverned or stale.
    const ir = c15.image_finding_reconciliation;
    if (ir === null || ir === undefined) {
      problems.push('C15 recorded no image finding reconciliation');
    } else {
      if (!(ir.total_findings > 0)) problems.push('C15 reconciled zero image findings');
      for (const key of ['unmatched', 'unused_records', 'stale_advisory_ids']) {
        if (!Array.isArray(ir[key]) || ir[key].length !== 0) {
          problems.push(`C15 image reconciliation has a non-empty '${key}'`);
        }
      }
    }
    if (c15.step_policy_audit?.every_informational_step_duplicates_a_blocking_step !== true) {
      problems.push('C15 did not prove every non-blocking step duplicates a blocking one');
    }
  }

  // ── C16 ────────────────────────────────────────────────────────────────────────
  const c16 = read('C16', join(c16Dir, 'closure-reconciliation.json'));
  if (c16 !== null) {
    if (c16.status !== C16_FINAL_STATUS) {
      problems.push(
        `C16 status is ${JSON.stringify(c16.status)}, expected exactly ${JSON.stringify(C16_FINAL_STATUS)}`,
      );
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

    // TARGET SET — exact and DERIVED from the descriptor. An empty or partial set fails.
    const want = expectedTargetIds(root);
    const got = Object.keys(c16.targets ?? {}).sort();
    if (got.join(',') !== want.join(',')) {
      problems.push(`C16 target set is [${got.join(', ')}], expected exactly [${want.join(', ')}]`);
    }
    for (const name of want) {
      const t = c16.targets?.[name];
      if (t === undefined) continue;   // reported by the set comparison
      if (t.reconciliation?.clean !== true) problems.push(`C16 target ${name} did not reconcile clean`);
      if (!SHA256_HEX.test(String(t.sbom_sha256))) {
        problems.push(`C16 target ${name} has no valid SBOM digest`);
      }
      if (!(t.counts?.nodes > 0)) problems.push(`C16 target ${name} reported no components`);
      if (t.counts?.subject_root_edges !== t.reconciliation?.subject_root_edges_present) {
        problems.push(`C16 target ${name} subject-to-root edge counts disagree`);
      }
      // The SBOM the manifest names must actually exist beside it.
      const sbomPath = join(c16Dir, String(t.sbom_file));
      if (!existsSync(sbomPath)) {
        problems.push(`C16 target ${name} names ${t.sbom_file}, which is not present`);
      }
    }
    if (!Array.isArray(c16.vulnerable_residuals) || c16.vulnerable_residuals.length !== 0) {
      problems.push('C16 recorded a vulnerable residual');
    }
    const gov = c16.governed_exclusions;
    if (!Array.isArray(gov?.rejected) || gov.rejected.length !== 0) {
      problems.push('C16 recorded a rejected closure exclusion');
    }
    if (!Array.isArray(gov?.cardinality_problems) || gov.cardinality_problems.length !== 0) {
      problems.push('C16 recorded an exclusion cardinality problem');
    }
  }

  return problems;
}
