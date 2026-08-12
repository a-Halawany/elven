/**
 * C16-R3.2 — assert that the DELIVERED BYTES are the bytes the gate manifests claim.
 *
 * A tracked script rather than an inline CI heredoc: the assertion is the point, so it
 * should be reviewable, testable and identical wherever it runs.
 *
 * ── WHY THIS WAS REWRITTEN, AGAIN ────────────────────────────────────────────────
 * C16-R3.1 made every expectation exact and derived, and it was still a false pass: it
 * validated CLAIMS ABOUT hashes without ever opening the files those hashes describe. An
 * independent reviewer replaced every required C15 artifact and both C16 SBOMs with the
 * word TAMPERED, left the fabricated 64-character digests and byte counts in place, added
 * an unbound extra output, and this assertion returned NO PROBLEMS. A verifier that trusts
 * the manifest it is verifying is a transcription check, not evidence.
 *
 * Two further vacuous passes came from deriving an expectation from a source the same
 * attacker controls:
 *   * `expectedTargetIds()` read the descriptor and compared it to the report, so a
 *     descriptor with ZERO targets matched a report with zero targets and passed;
 *   * the authenticated-scanner set was a hardcoded pair rather than the pinned set, so a
 *     third scanner could be pinned — and executed — with no authentication evidence.
 *
 * What this now does:
 *   * re-reads EVERY bound C15 and C16 artifact from disk and recomputes its SHA-256 and
 *     byte length, rejecting any mismatch, any phantom binding, any duplicate binding path,
 *     any symlink, any traversal-unsafe path and any EXTRA unbound file;
 *   * recomputes each target's SBOM digest and requires it to equal BOTH `sbom_sha256` and
 *     that file's evidence binding;
 *   * pins the Phase 0 target set in CODE and requires the descriptor AND the report to be
 *     exactly that nonempty set;
 *   * derives the scanner set from `Object.keys(scanner-pins.json.tools)` and requires
 *     authenticated-before-execution evidence for every pinned scanner;
 *   * requires the post-scan posture: clean tree after scanning, worktree unchanged by
 *     scanning, staged binaries still matching, and identical before/after cache digests.
 *
 * Usage:
 *   node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>
 */
import { readFileSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, normalize, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** CODE-OWNED constants. A prefix match is not an equality check. */
export const C15_FINAL_MODE = 'final';
export const C15_PASS_OUTCOME = 'PASS';
export const C16_FINAL_STATUS =
  'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA';

/**
 * The Phase 0 target set, owned by THIS FILE.
 *
 * Deriving it from the descriptor alone was circular: the descriptor is an input a
 * tampering party edits, so `{} === {}` passed. The descriptor must now match this, and the
 * report must match this, so neither an empty nor a partial nor an extended set can pass.
 */
export const PHASE0_TARGET_IDS = Object.freeze(['development', 'production']);

/**
 * Scanners that must be pinned AND authenticated no matter what the pins say. The full
 * expected set is derived from the pins so a newly pinned scanner cannot arrive
 * unauthenticated; these two must always be in it.
 */
export const MANDATORY_SCANNERS = Object.freeze(['gitleaks', 'trivy']);

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

/** Outputs every passing C16 run must have produced and bound. */
export const REQUIRED_C16_ARTIFACTS = Object.freeze(['RESULT-PASS.txt']);

/**
 * The ONLY paths a bound-file inventory may omit, and why. Anything else present in an
 * output directory but absent from the manifest is unaccounted-for evidence.
 */
export const C15_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['supply-chain-manifest.json']),   // cannot contain its own digest
  dirs: Object.freeze(['.trivy-cache', '.staged-scanners']), // bound by fingerprint / digests
});
export const C16_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['closure-reconciliation.json']),  // cannot contain its own digest
  dirs: Object.freeze([]),
});

const SHA256_HEX = /^[a-f0-9]{64}$/;

/** The target ids the descriptor declares. Compared AGAINST the code-owned set, not used as it. */
export function descriptorTargetIds(root = ROOT) {
  const descriptor = JSON.parse(
    readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8'),
  );
  return Object.keys(descriptor.targets ?? {}).sort();
}

/** Retained for callers that imported it; now the code-owned set, not the descriptor's. */
export function expectedTargetIds() {
  return [...PHASE0_TARGET_IDS];
}

/** The pinned scanner set — the expected authenticated set. */
export function pinnedScannerNames(root = ROOT) {
  const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
  return Object.keys(pins.tools ?? {}).sort();
}

/**
 * A binding path must be relative, stay inside the output directory, and name a real
 * regular file. `..`, absolute paths, NUL bytes and symlinks are all refused: a symlinked
 * "artifact" lets the bytes that verify live somewhere the gate never scanned.
 */
function pathProblem(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return `is ${JSON.stringify(rel)}, not a path`;
  if (rel.includes('\u0000')) return 'contains a NUL byte';
  if (isAbsolute(rel)) return 'is an absolute path; bindings must be output-relative';
  if (rel.startsWith('~')) return 'starts with ~; bindings must be output-relative';
  const norm = normalize(rel);
  if (norm === '..' || norm.startsWith(`..${sep}`)) return 'escapes the output directory';
  if (norm.split(sep).includes('..')) return 'traverses upward with ..';
  if (norm !== rel) return `is not normalized (${JSON.stringify(rel)} normalizes to ${JSON.stringify(norm)})`;
  return null;
}

/** Every regular file under `dir`, output-relative, excluding the documented directories. */
function walkFiles(dir, excludedDirs, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      if (prefix === '' && excludedDirs.includes(entry.name)) continue;
      out.push(...walkFiles(join(dir, entry.name), excludedDirs, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Re-read every binding and compare the BYTES against the claim. This is the whole point of
 * the correction: the previous version never opened these files.
 */
export function verifyBindings({ label, dir, bindings, allowed }) {
  const problems = [];
  const list = Array.isArray(bindings) ? bindings : null;
  if (list === null) {
    problems.push(`${label} evidence_artifacts is not an array`);
    return { problems, verified: 0 };
  }
  if (list.length === 0) {
    problems.push(`${label} bound no evidence artifacts`);
    return { problems, verified: 0 };
  }

  const seen = new Set();
  const boundPaths = new Set();
  let verified = 0;

  for (const binding of list) {
    const rel = binding?.path;
    const bad = pathProblem(rel);
    if (bad !== null) {
      problems.push(`${label} binding path ${JSON.stringify(rel)} ${bad}`);
      continue;
    }
    if (seen.has(rel)) {
      problems.push(`${label} binds '${rel}' more than once; a duplicate binding hides which bytes were checked`);
      continue;
    }
    seen.add(rel);
    boundPaths.add(rel);

    if (!SHA256_HEX.test(String(binding.sha256))) {
      problems.push(`${label} binding '${rel}' claims no valid lowercase SHA-256 (got ${JSON.stringify(binding.sha256)})`);
      continue;
    }
    if (typeof binding.bytes !== 'number' || !Number.isInteger(binding.bytes) || binding.bytes < 0) {
      problems.push(`${label} binding '${rel}' claims no valid byte length (got ${JSON.stringify(binding.bytes)})`);
      continue;
    }

    const abs = join(dir, rel);
    let stat;
    try {
      stat = lstatSync(abs);
    } catch {
      problems.push(`${label} binds '${rel}', which does not exist — a phantom binding`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      problems.push(`${label} binding '${rel}' is a SYMLINK; the verified bytes must be the delivered bytes`);
      continue;
    }
    if (!stat.isFile()) {
      problems.push(`${label} binding '${rel}' is not a regular file`);
      continue;
    }

    const bytes = readFileSync(abs);
    if (bytes.length !== binding.bytes) {
      problems.push(
        `${label} binding '${rel}' claims ${binding.bytes} bytes but the file on disk is ${bytes.length}`,
      );
      continue;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== binding.sha256) {
      problems.push(
        `${label} binding '${rel}' claims sha256 ${binding.sha256} but the delivered bytes hash to ${actual}`,
      );
      continue;
    }
    verified += 1;
  }

  // EXTRA UNBOUND FILES. An output the manifest does not account for is evidence nobody
  // checked; only the documented root manifest and directories may be absent.
  let present;
  try {
    present = walkFiles(dir, [...allowed.dirs]);
  } catch {
    problems.push(`${label} output directory ${dir} could not be read`);
    return { problems, verified };
  }
  for (const rel of present) {
    if (allowed.files.includes(rel)) continue;
    if (!boundPaths.has(rel)) {
      problems.push(`${label} output '${rel}' is present but UNBOUND; every delivered file must be bound`);
    }
  }

  return { problems, verified };
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
    if (!Array.isArray(c15.failures) || c15.failures.length !== 0) {
      problems.push(`C15 recorded ${(c15.failures ?? []).length} failure(s) in a PASS manifest`);
    }

    // POST-SCAN POSTURE. Scanning must not have altered the source tree or the cache, and
    // the binaries that ran must still be the binaries that were authenticated.
    if (c15.tree_clean_after_scanning !== true) {
      problems.push('C15 did not record a clean worktree AFTER scanning');
    }
    if (c15.worktree_unchanged_by_scanning !== true) {
      problems.push('C15 did not prove the worktree was unchanged by scanning');
    }
    if (c15.trivy_cache_unchanged !== true) {
      problems.push('C15 did not prove the trivy cache was unchanged across the authoritative scans');
    }
    const before = c15.trivy_cache_fingerprint_before?.digest;
    const after = c15.trivy_cache_fingerprint_after?.digest;
    if (!SHA256_HEX.test(String(before)) || !SHA256_HEX.test(String(after))) {
      problems.push('C15 recorded no valid before/after trivy cache digests');
    } else if (before !== after) {
      problems.push(`C15 trivy cache digest changed across scanning: ${before} → ${after}`);
    }

    // SCANNER SET — DERIVED FROM THE PINS, not a hardcoded pair. A newly pinned scanner
    // that never had its bytes authenticated must fail here.
    const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
    const pinned = pinnedScannerNames(root);
    if (pinned.length === 0) {
      problems.push('scanner-pins.json pins no tools; the expected authenticated set cannot be empty');
    }
    for (const mandatory of MANDATORY_SCANNERS) {
      if (!pinned.includes(mandatory)) {
        problems.push(`scanner-pins.json does not pin the mandatory scanner '${mandatory}'`);
      }
    }
    const verifiedTools = c15.executed_binary_authentication?.verified ?? {};
    const verifiedNames = Object.keys(verifiedTools).sort();
    if (verifiedNames.join(',') !== pinned.join(',')) {
      problems.push(
        `C15 authenticated tool set is [${verifiedNames.join(', ')}], expected exactly the pinned set ` +
        `[${pinned.join(', ')}]`,
      );
    }
    const stagedAfter = c15.staged_tools_after_scanning ?? {};
    for (const tool of pinned) {
      const v = verifiedTools[tool];
      if (v === undefined) {
        problems.push(`C15 has no authentication evidence for the pinned scanner '${tool}'`);
        continue;
      }
      if (v.match !== true) problems.push(`C15 did not authenticate the ${tool} executable bytes`);
      if (v.authenticated_before_first_execution !== true) {
        problems.push(`C15 did not authenticate ${tool} BEFORE its first execution`);
      }
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
      const staged = stagedAfter[tool];
      if (staged === undefined) {
        problems.push(`C15 did not re-verify the staged ${tool} binary after scanning`);
      } else if (staged.match !== true || staged.sha256_after !== staged.expected) {
        problems.push(
          `C15 staged ${tool} binary changed during scanning (${staged.sha256_after} vs ${staged.expected})`,
        );
      }
    }

    // ARTIFACT BINDINGS — re-read from disk, byte for byte.
    const bound = new Map(
      (Array.isArray(c15.evidence_artifacts) ? c15.evidence_artifacts : []).map((a) => [a?.path, a]),
    );
    for (const required of REQUIRED_C15_ARTIFACTS) {
      if (!bound.has(required)) {
        problems.push(`C15 did not bind the required artifact '${required}'`);
      }
    }
    const c15Bindings = verifyBindings({
      label: 'C15',
      dir: c15Dir,
      bindings: c15.evidence_artifacts,
      allowed: C15_UNBOUND_ALLOWED,
    });
    problems.push(...c15Bindings.problems);

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

    // TARGET SET — the code-owned Phase 0 set. The descriptor is CHECKED, not trusted:
    // deriving the expectation from it made an empty descriptor match an empty report.
    const want = [...PHASE0_TARGET_IDS].sort();
    const declared = descriptorTargetIds(root);
    if (declared.join(',') !== want.join(',')) {
      problems.push(
        `target-descriptor.json declares [${declared.join(', ')}], expected exactly the Phase 0 set ` +
        `[${want.join(', ')}]`,
      );
    }
    const got = Object.keys(c16.targets ?? {}).sort();
    if (got.join(',') !== want.join(',')) {
      problems.push(`C16 target set is [${got.join(', ')}], expected exactly [${want.join(', ')}]`);
    }

    const c16Bound = new Map(
      (Array.isArray(c16.evidence_artifacts) ? c16.evidence_artifacts : []).map((a) => [a?.path, a]),
    );
    for (const required of REQUIRED_C16_ARTIFACTS) {
      if (!c16Bound.has(required)) {
        problems.push(`C16 did not bind the required artifact '${required}'`);
      }
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

      // The SBOM the manifest NAMES must exist, be bound, and its BYTES must hash to both
      // the target's `sbom_sha256` and its evidence binding. Two independent claims about
      // the same file are only evidence if the file agrees with both.
      const rel = String(t.sbom_file);
      const bad = pathProblem(rel);
      if (bad !== null) {
        problems.push(`C16 target ${name} names sbom_file ${JSON.stringify(rel)}, which ${bad}`);
        continue;
      }
      const sbomPath = join(c16Dir, rel);
      let stat = null;
      try {
        stat = lstatSync(sbomPath);
      } catch {
        problems.push(`C16 target ${name} names ${rel}, which is not present`);
        continue;
      }
      if (stat.isSymbolicLink() || !stat.isFile()) {
        problems.push(`C16 target ${name} SBOM ${rel} is not a regular file`);
        continue;
      }
      const sbomBytes = readFileSync(sbomPath);
      const actual = createHash('sha256').update(sbomBytes).digest('hex');
      if (actual !== t.sbom_sha256) {
        problems.push(
          `C16 target ${name} SBOM ${rel} claims sha256 ${t.sbom_sha256} but hashes to ${actual}`,
        );
      }
      if (typeof t.sbom_bytes === 'number' && t.sbom_bytes !== sbomBytes.length) {
        problems.push(
          `C16 target ${name} SBOM ${rel} claims ${t.sbom_bytes} bytes but is ${sbomBytes.length}`,
        );
      }
      const binding = c16Bound.get(rel);
      if (binding === undefined) {
        problems.push(`C16 target ${name} SBOM ${rel} is not bound in evidence_artifacts`);
      } else if (binding.sha256 !== actual) {
        problems.push(
          `C16 target ${name} SBOM ${rel} binding claims ${binding.sha256} but the bytes hash to ${actual}`,
        );
      }
    }

    const c16Bindings = verifyBindings({
      label: 'C16',
      dir: c16Dir,
      bindings: c16.evidence_artifacts,
      allowed: C16_UNBOUND_ALLOWED,
    });
    problems.push(...c16Bindings.problems);

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

// Only run when invoked as a script — the controls import the assertion.
if (process.argv[1] !== undefined &&
    join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  const [c15Dir, c16Dir, expectedSha] = process.argv.slice(2);
  if (c15Dir === undefined || c16Dir === undefined || expectedSha === undefined) {
    console.error('usage: node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>');
    process.exit(2);
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    console.error(`expected SHA ${JSON.stringify(expectedSha)} is not a 40-character git object id`);
    process.exit(2);
  }
  const problems = assertFinalManifests({ c15Dir, c16Dir, expectedSha });
  if (problems.length > 0) {
    console.error('=== FINAL-MANIFEST ASSERTION FAILED ===');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const c15 = JSON.parse(readFileSync(join(c15Dir, 'supply-chain-manifest.json'), 'utf8'));
  const c16 = JSON.parse(readFileSync(join(c16Dir, 'closure-reconciliation.json'), 'utf8'));
  console.log(`final mode confirmed for C15 and C16 at ${expectedSha}`);
  console.log(
    `  C15 bindings re-read and byte-verified: ${c15.evidence_artifacts.length} ` +
    `(all ${REQUIRED_C15_ARTIFACTS.length} required present, no unbound outputs)`,
  );
  console.log(
    `  C16 bindings re-read and byte-verified: ${c16.evidence_artifacts.length} ` +
    `(both SBOMs recomputed against sbom_sha256 and their bindings)`,
  );
  console.log(`  C15 authenticated tools: ${pinnedScannerNames().join(', ')} (exactly the pinned set)`);
  console.log(`  C16 targets: ${Object.keys(c16.targets).sort().join(', ')} (exactly the Phase 0 set)`);
}
