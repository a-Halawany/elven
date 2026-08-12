/**
 * C16-R3.3 — FINAL ASSERTION CLOSURE.
 *
 * Assert that a C15/C16 evidence pair is internally closed: that the steps a run claims to
 * have executed are exactly the steps the contract requires, that every raw stream those
 * steps reference exists with the bytes the step receipt AND the artifact binding both
 * claim, that each scanner's digest forms one unbroken chain back to its tracked pin, that
 * the trivy cache fingerprint recomputes, that each C16 target is bound to its descriptor
 * identity and to an SBOM that says so itself, and that nothing in the package is reached
 * through a symlink.
 *
 * ── THE THREE ROUNDS THIS FILE HAS SURVIVED ──────────────────────────────────────
 * R3.1 compared exact, code-owned constants — and never opened a file, so every artifact
 * could be replaced with the word TAMPERED while the fabricated digests stayed.
 *
 * R3.2 re-read the bytes behind every BINDING. Independent review then found six
 * coordinated false passes that survive byte-verified bindings:
 *
 *   1. The step receipts were never checked at all. Delete a raw file AND its binding while
 *      the step still references it: nothing looked at the step, so nothing noticed. Tamper
 *      with a file and update only its binding: the step's own stale hash and length went
 *      unread. There was no exact step set, so a step could be missing, duplicated, renamed
 *      or added.
 *   2. The required inventory was ten hardcoded names. Any output the list did not mention
 *      could go missing.
 *   3. Scanner digests were compared pairwise. `sha256_after` and `expected` were compared
 *      to each other, so forging both together passed.
 *   4. The cache was trusted: `trivy_cache_unchanged` and a caller-supplied top-level digest
 *      decided the question, so corrupt entry data with a preserved digest passed.
 *   5. A target's SBOM was digested but never parsed, and never tied to the descriptor. Swap
 *      the production and development records, or point both targets at the production SBOM,
 *      and it passed.
 *   6. Nothing lstat-ed the output roots or the two root manifests, so the whole package
 *      could be a symlink to bytes outside it.
 *
 * Each of those is now closed by RECOMPUTATION or by comparison against a contract in
 * tracked source that the evidence cannot edit. Where a check cannot be made without
 * trusting something, the limit is stated in a comment rather than papered over.
 *
 * Usage:
 *   node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>
 */
import { readFileSync, existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, normalize, isAbsolute, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  C15_NORMAL_STEPS,
  C15_ACQUISITION_STEPS,
  C15_REQUIRED_REPORTS,
  C16_REQUIRED_REPORTS,
  SHA256_HEX,
  imageStepIds,
  streamFilesFor,
  expectedC15Inventory,
} from './lib/final-assertion-contracts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** CODE-OWNED constants. A prefix match is not an equality check. */
export const C15_FINAL_MODE = 'final';
export const C15_PASS_OUTCOME = 'PASS';
export const C16_FINAL_STATUS =
  'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA';

/**
 * The Phase 0 target set, owned by THIS FILE. Deriving it from the descriptor was circular:
 * the descriptor is an input a tampering party edits, so `{} === {}` passed.
 */
export const PHASE0_TARGET_IDS = Object.freeze(['development', 'production']);

/** Scanners that must be pinned AND authenticated whatever the pins happen to say. */
export const MANDATORY_SCANNERS = Object.freeze(['gitleaks', 'trivy']);

/**
 * Retained because other controls import it. The full inventory is now DERIVED — see
 * `expectedC15Inventory()` — and this list is only the subset that is not a step's stream.
 */
export const REQUIRED_C15_ARTIFACTS = C15_REQUIRED_REPORTS;
export const REQUIRED_C16_ARTIFACTS = C16_REQUIRED_REPORTS;

export { C15_NORMAL_STEPS, C15_ACQUISITION_STEPS, expectedC15Inventory };

/** The ONLY paths a bound-file inventory may omit, and why. */
export const C15_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['supply-chain-manifest.json']),      // cannot contain its own digest
  dirs: Object.freeze(['.trivy-cache', '.staged-scanners']), // bound by fingerprint / digests
});
export const C16_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['closure-reconciliation.json']),     // cannot contain its own digest
  dirs: Object.freeze([]),
});

/** The descriptor's declared target identities. CHECKED against the code-owned set, not used as it. */
export function descriptorTargets(root = ROOT) {
  const descriptor = JSON.parse(
    readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8'),
  );
  return descriptor.targets ?? {};
}
export function descriptorTargetIds(root = ROOT) {
  return Object.keys(descriptorTargets(root)).sort();
}
export function expectedTargetIds() {
  return [...PHASE0_TARGET_IDS];
}

/** The pinned scanner set — the expected authenticated set. */
export function pinnedScannerNames(root = ROOT) {
  const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
  return Object.keys(pins.tools ?? {}).sort();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Path safety
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A binding or stream path must be relative, stay inside the output directory, and name a
 * real regular file. A symlinked "artifact" lets the bytes that verify live somewhere the
 * gate never scanned.
 */
function pathProblem(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return `is ${JSON.stringify(rel)}, not a path`;
  if (rel.includes('\u0000')) return 'contains a NUL byte';
  if (isAbsolute(rel)) return 'is an absolute path; must be output-relative';
  if (rel.startsWith('~')) return 'starts with ~; must be output-relative';
  const norm = normalize(rel);
  if (norm === '..' || norm.startsWith(`..${sep}`)) return 'escapes the output directory';
  if (norm.split(sep).includes('..')) return 'traverses upward with ..';
  if (norm !== rel) return `is not normalized (${JSON.stringify(rel)} normalizes to ${JSON.stringify(norm)})`;
  return null;
}

/**
 * Read a file that must be a real, regular, non-symlinked member of `dir`, checking every
 * intermediate directory INSIDE the package too.
 *
 * Deliberate limit, stated rather than hidden: directories ABOVE the output root are not
 * checked for symlinks. The caller names the root, and on macOS `/tmp` and `/var` are
 * themselves symlinks, so walking to the filesystem root would reject every legitimate run.
 * The guarantee provided instead is containment: the artifact's resolved real path must lie
 * within the root's resolved real path, which catches a symlink at any level inside the
 * package pointing anywhere outside it.
 */
function readMember(dir, rel) {
  const abs = join(dir, rel);
  const parts = rel.split(sep);
  for (let i = 0; i < parts.length - 1; i += 1) {
    const intermediate = join(dir, ...parts.slice(0, i + 1));
    let st;
    try {
      st = lstatSync(intermediate);
    } catch {
      return { bytes: null, problem: `intermediate path '${parts.slice(0, i + 1).join('/')}' does not exist` };
    }
    if (st.isSymbolicLink()) {
      return { bytes: null, problem: `intermediate path '${parts.slice(0, i + 1).join('/')}' is a SYMLINK` };
    }
    if (!st.isDirectory()) {
      return { bytes: null, problem: `intermediate path '${parts.slice(0, i + 1).join('/')}' is not a directory` };
    }
  }
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return { bytes: null, problem: 'does not exist' };
  }
  if (st.isSymbolicLink()) return { bytes: null, problem: 'is a SYMLINK; the verified bytes must be the delivered bytes' };
  if (!st.isFile()) return { bytes: null, problem: 'is not a regular file' };
  // Containment: the real path must stay inside the real root.
  try {
    const realRoot = realpathSync(dir);
    const realFile = realpathSync(abs);
    const rel2 = relative(realRoot, realFile);
    if (rel2.startsWith('..') || isAbsolute(rel2)) {
      return { bytes: null, problem: `resolves to ${realFile}, which is outside the evidence package` };
    }
  } catch {
    return { bytes: null, problem: 'could not be resolved' };
  }
  return { bytes: readFileSync(abs), problem: null };
}

/**
 * Item 6: the output roots and the two root manifests themselves. A package whose root is a
 * symlink is a package whose bytes live somewhere else.
 */
function rootPathProblems(label, dir, manifestName) {
  const problems = [];
  let st;
  try {
    st = lstatSync(dir);
  } catch {
    problems.push(`${label} output directory ${dir} does not exist`);
    return problems;
  }
  if (st.isSymbolicLink()) {
    problems.push(`${label} output directory ${dir} is a SYMLINK; the evidence root must be a real directory`);
    return problems;
  }
  if (!st.isDirectory()) {
    problems.push(`${label} output path ${dir} is not a directory`);
    return problems;
  }
  let mst;
  try {
    mst = lstatSync(join(dir, manifestName));
  } catch {
    problems.push(`${label} ${manifestName} does not exist`);
    return problems;
  }
  if (mst.isSymbolicLink()) {
    problems.push(`${label} ${manifestName} is a SYMLINK; the root manifest must be a real file`);
  } else if (!mst.isFile()) {
    problems.push(`${label} ${manifestName} is not a regular file`);
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Item 1 + 2: exact step closure and the derived inventory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compare an actual id list against an expected one as a MULTISET, so a duplicate is a
 * distinct finding from an extra.
 */
function compareIdSets(kind, expected, actual) {
  const problems = [];
  const counts = new Map();
  for (const id of actual) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > 1) problems.push(`C15 ${kind} '${id}' appears ${n} times; step ids must be unique`);
  }
  for (const id of expected) {
    if (!counts.has(id)) problems.push(`C15 is missing the required ${kind} '${id}'`);
  }
  for (const id of counts.keys()) {
    if (!expected.includes(id)) {
      problems.push(`C15 recorded an unexpected ${kind} '${id}'; the ${kind} set is exact`);
    }
  }
  return problems;
}

/**
 * Verify one step's raw streams THREE WAYS: the bytes on disk, the step receipt's own
 * claims, and the artifact binding's claims must all agree. R3.2 checked only the binding,
 * so a tampered file whose binding was updated kept a stale step hash nobody read.
 */
function verifyStepStreams({ label, dir, step, bindings, referenceCounts }) {
  const problems = [];
  for (const stream of ['stdout', 'stderr']) {
    const rel = step[`${stream}_file`];
    const claimedBytes = step[`${stream}_bytes`];
    const claimedSha = step[`${stream}_sha256`];

    const bad = pathProblem(rel);
    if (bad !== null) {
      problems.push(`${label} step '${step.id}' ${stream}_file ${JSON.stringify(rel)} ${bad}`);
      continue;
    }
    referenceCounts.set(rel, (referenceCounts.get(rel) ?? 0) + 1);

    if (!SHA256_HEX.test(String(claimedSha))) {
      problems.push(`${label} step '${step.id}' ${stream}_sha256 is not lowercase 64-hex (${JSON.stringify(claimedSha)})`);
      continue;
    }
    if (!Number.isInteger(claimedBytes) || claimedBytes < 0) {
      problems.push(`${label} step '${step.id}' ${stream}_bytes is not a non-negative integer (${JSON.stringify(claimedBytes)})`);
      continue;
    }

    const { bytes, problem } = readMember(dir, rel);
    if (problem !== null) {
      problems.push(`${label} step '${step.id}' ${stream} file '${rel}' ${problem}`);
      continue;
    }
    const actualSha = sha256(bytes);
    if (bytes.length !== claimedBytes) {
      problems.push(`${label} step '${step.id}' claims ${stream} is ${claimedBytes} bytes; '${rel}' is ${bytes.length}`);
    }
    if (actualSha !== claimedSha) {
      problems.push(`${label} step '${step.id}' claims ${stream} sha256 ${claimedSha}; '${rel}' hashes to ${actualSha}`);
    }

    // THE CROSS-CHECK R3.2 LACKED: the step receipt and the artifact binding must agree.
    const binding = bindings.get(rel);
    if (binding === undefined) {
      problems.push(`${label} step '${step.id}' references '${rel}', which is NOT bound in evidence_artifacts`);
      continue;
    }
    if (binding.sha256 !== claimedSha) {
      problems.push(
        `${label} '${rel}': step '${step.id}' claims sha256 ${claimedSha} but its binding claims ${binding.sha256}`,
      );
    }
    if (binding.bytes !== claimedBytes) {
      problems.push(
        `${label} '${rel}': step '${step.id}' claims ${claimedBytes} bytes but its binding claims ${binding.bytes}`,
      );
    }
  }
  return problems;
}

function verifyStepClosure({ c15, c15Dir, expectedSha, bindings }) {
  const problems = [];
  const referenceCounts = new Map();

  const { ids: imageIds, problem: imageProblem } = imageStepIds(c15.digest_pinned_images);
  if (imageProblem !== null) {
    problems.push(`C15 ${imageProblem}`);
    return { problems, referenceCounts, imageIds: null };
  }

  // ── normal steps ──────────────────────────────────────────────────────────────
  const expectedNormal = [...C15_NORMAL_STEPS.map((s) => s.id), ...imageIds];
  const steps = Array.isArray(c15.steps) ? c15.steps : null;
  if (steps === null) {
    problems.push('C15 steps is not an array');
    return { problems, referenceCounts, imageIds };
  }
  problems.push(...compareIdSets('step', expectedNormal, steps.map((s) => s?.id)));

  const contractFor = new Map(C15_NORMAL_STEPS.map((s) => [s.id, s]));
  for (const step of steps) {
    if (typeof step?.id !== 'string') continue;   // reported by the set comparison
    const contract = contractFor.get(step.id);
    if (contract !== undefined) {
      if (step.tool !== contract.tool) {
        problems.push(`C15 step '${step.id}' was run by ${JSON.stringify(step.tool)}, expected ${JSON.stringify(contract.tool)}`);
      }
      if (step.policy !== contract.policy) {
        problems.push(`C15 step '${step.id}' has policy ${JSON.stringify(step.policy)}, expected ${JSON.stringify(contract.policy)}`);
      }
    } else if (step.id.startsWith('trivy-image-')) {
      // Image steps are derived, so their tool and policy are fixed here rather than listed.
      if (step.tool !== 'trivy') {
        problems.push(`C15 image step '${step.id}' was run by ${JSON.stringify(step.tool)}, expected "trivy"`);
      }
      if (step.policy !== 'blocking') {
        problems.push(`C15 image step '${step.id}' has policy ${JSON.stringify(step.policy)}, expected "blocking"`);
      }
    }
    if (step.exit_code !== 0) problems.push(`C15 step '${step.id}' exited ${JSON.stringify(step.exit_code)}; a PASS run requires 0`);
    if (step.failed !== false) problems.push(`C15 step '${step.id}' is marked failed in a PASS manifest`);
    if (step.signal !== null && step.signal !== undefined) {
      problems.push(`C15 step '${step.id}' was terminated by signal ${JSON.stringify(step.signal)}`);
    }
    if (step.source_sha !== expectedSha) {
      problems.push(`C15 step '${step.id}' records source_sha ${JSON.stringify(step.source_sha)}, expected ${expectedSha}`);
    }
    problems.push(...verifyStepStreams({ label: 'C15', dir: c15Dir, step, bindings, referenceCounts }));
  }

  // ── acquisition steps ─────────────────────────────────────────────────────────
  const acq = c15.trivy_cache_acquisition?.steps;
  const acqSteps = Array.isArray(acq) ? acq : null;
  if (acqSteps === null) {
    problems.push('C15 trivy_cache_acquisition.steps is not an array');
  } else {
    problems.push(...compareIdSets(
      'acquisition step',
      C15_ACQUISITION_STEPS.map((s) => s.id),
      acqSteps.map((s) => s?.id),
    ));
    for (const step of acqSteps) {
      if (typeof step?.id !== 'string') continue;
      if (step.exit_code !== 0) {
        problems.push(`C15 acquisition step '${step.id}' exited ${JSON.stringify(step.exit_code)}; a PASS run requires 0`);
      }
      if (step.signal !== null && step.signal !== undefined) {
        problems.push(`C15 acquisition step '${step.id}' was terminated by signal ${JSON.stringify(step.signal)}`);
      }
      problems.push(...verifyStepStreams({ label: 'C15 acquisition', dir: c15Dir, step, bindings, referenceCounts }));
    }
  }

  // No raw stream may be referenced by two steps: that would let one step borrow another's
  // verified bytes.
  for (const [rel, n] of referenceCounts) {
    if (n > 1) problems.push(`C15 raw stream '${rel}' is referenced by ${n} steps; each stream belongs to exactly one`);
  }

  return { problems, referenceCounts, imageIds };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bindings
// ═══════════════════════════════════════════════════════════════════════════════

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

/** Re-read every binding and compare the BYTES against the claim. */
export function verifyBindings({ label, dir, bindings, allowed, requiredInventory = null }) {
  const problems = [];
  const list = Array.isArray(bindings) ? bindings : null;
  if (list === null) {
    problems.push(`${label} evidence_artifacts is not an array`);
    return { problems, verified: 0, byPath: new Map() };
  }
  if (list.length === 0) {
    problems.push(`${label} bound no evidence artifacts`);
    return { problems, verified: 0, byPath: new Map() };
  }

  const byPath = new Map();
  let verified = 0;

  for (const binding of list) {
    const rel = binding?.path;
    const bad = pathProblem(rel);
    if (bad !== null) {
      problems.push(`${label} binding path ${JSON.stringify(rel)} ${bad}`);
      continue;
    }
    if (byPath.has(rel)) {
      problems.push(`${label} binds '${rel}' more than once; a duplicate binding hides which bytes were checked`);
      continue;
    }
    byPath.set(rel, binding);

    if (!SHA256_HEX.test(String(binding.sha256))) {
      problems.push(`${label} binding '${rel}' claims no valid lowercase SHA-256 (got ${JSON.stringify(binding.sha256)})`);
      continue;
    }
    if (typeof binding.bytes !== 'number' || !Number.isInteger(binding.bytes) || binding.bytes < 0) {
      problems.push(`${label} binding '${rel}' claims no valid byte length (got ${JSON.stringify(binding.bytes)})`);
      continue;
    }

    const { bytes, problem } = readMember(dir, rel);
    if (problem !== null) {
      problems.push(`${label} binds '${rel}', which ${problem}${problem === 'does not exist' ? ' — a phantom binding' : ''}`);
      continue;
    }
    if (bytes.length !== binding.bytes) {
      problems.push(`${label} binding '${rel}' claims ${binding.bytes} bytes but the file on disk is ${bytes.length}`);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== binding.sha256) {
      problems.push(`${label} binding '${rel}' claims sha256 ${binding.sha256} but the delivered bytes hash to ${actual}`);
      continue;
    }
    verified += 1;
  }

  // The DERIVED inventory: every expected output must be bound, by name.
  if (requiredInventory !== null) {
    for (const rel of requiredInventory) {
      if (!byPath.has(rel)) {
        problems.push(`${label} did not bind the required output '${rel}' (derived from the step and report contract)`);
      }
    }
  }

  // Extra unbound files: an output the manifest does not account for is evidence nobody checked.
  let present;
  try {
    present = walkFiles(dir, [...allowed.dirs]);
  } catch {
    problems.push(`${label} output directory ${dir} could not be read`);
    return { problems, verified, byPath };
  }
  for (const rel of present) {
    if (allowed.files.includes(rel)) continue;
    if (!byPath.has(rel)) {
      problems.push(`${label} output '${rel}' is present but UNBOUND; every delivered file must be bound`);
    }
  }

  return { problems, verified, byPath };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Item 3: the scanner digest chain
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ONE unbroken equality chain per scanner:
 *
 *   tracked pin → authenticated actual → authenticated expected → staged pre-execution
 *                → staged post-scan expected → staged post-scan actual
 *
 * Every link is compared to the TRACKED PIN, not to its neighbour. Pairwise comparison is
 * what let a caller forge `sha256_after` and `expected` together: they agreed with each
 * other and with nothing else.
 */
function verifyScannerChain({ c15, pins, pinned, root }) {
  const problems = [];
  const hostKey = c15.host_platform_key;
  const verifiedTools = c15.executed_binary_authentication?.verified ?? {};
  const stagedAfter = c15.staged_tools_after_scanning ?? {};

  const verifiedNames = Object.keys(verifiedTools).sort();
  if (verifiedNames.join(',') !== pinned.join(',')) {
    problems.push(
      `C15 authenticated tool set is [${verifiedNames.join(', ')}], expected exactly the pinned set [${pinned.join(', ')}]`,
    );
  }

  for (const tool of pinned) {
    const tracked = pins.tools?.[tool]?.artifacts?.[hostKey]?.executable_sha256 ?? null;
    if (tracked === null) {
      problems.push(`C15 host platform ${JSON.stringify(hostKey)} has no tracked ${tool} digest, so no chain can be anchored`);
      continue;
    }
    if (!SHA256_HEX.test(String(tracked))) {
      problems.push(`the tracked ${tool} pin for ${hostKey} is not lowercase 64-hex`);
      continue;
    }

    const v = verifiedTools[tool];
    if (v === undefined) {
      problems.push(`C15 has no authentication evidence for the pinned scanner '${tool}'`);
      continue;
    }
    const after = stagedAfter[tool];
    if (after === undefined) {
      problems.push(`C15 did not re-verify the staged ${tool} binary after scanning`);
    }

    const chain = [
      ['tracked pin', tracked],
      ['authenticated executable digest', v.actual_sha256],
      ['expected executable digest', v.expected_sha256],
      ['staged pre-execution digest', v.staged_sha256],
      ['staged post-scan expected digest', after?.expected],
      ['staged post-scan actual digest', after?.sha256_after],
    ];
    for (const [name, value] of chain) {
      if (!SHA256_HEX.test(String(value))) {
        problems.push(`C15 ${tool} ${name} is not a valid lowercase SHA-256 (${JSON.stringify(value)})`);
        continue;
      }
      if (value !== tracked) {
        problems.push(`C15 ${tool} chain BROKEN: ${name} is ${value}, but the tracked pin is ${tracked}`);
      }
    }

    if (v.match !== true) problems.push(`C15 did not authenticate the ${tool} executable bytes`);
    if (v.authenticated_before_first_execution !== true) {
      problems.push(`C15 did not authenticate ${tool} BEFORE its first execution`);
    }
    if (after !== undefined && after.match !== true) {
      problems.push(`C15 staged ${tool} binary did not match after scanning`);
    }
  }

  for (const mandatory of MANDATORY_SCANNERS) {
    if (!pinned.includes(mandatory)) {
      problems.push(`scanner-pins.json does not pin the mandatory scanner '${mandatory}'`);
    }
  }
  if (pinned.length === 0) {
    problems.push('scanner-pins.json pins no tools; the expected authenticated set cannot be empty');
  }
  void root;
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Item 4: trivy cache provenance, RECOMPUTED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recompute a fingerprint's derived values from its own delivered entry metadata.
 *
 * This mirrors `scripts/gate/lib/trivy-cache.mjs fingerprint()` exactly:
 *   digest              = sha256(JSON.stringify({ entries, checksManifest: checks_manifest }))
 *   checks_content      = { files: n, bytes: Σ, manifest_sha256: sha256(JSON.stringify(checks_manifest)) }
 *
 * Honest limit: the cache files themselves are not shipped in the evidence package (the DB
 * alone is over a gigabyte), so the per-entry hashes cannot be recomputed from cache bytes
 * here. What CAN be recomputed — and now is — is every aggregate the manifest derives from
 * those entries. A corrupted entry therefore no longer survives behind an untouched
 * top-level digest, which is the false pass this closes.
 */
function recomputeFingerprint(label, fp) {
  const problems = [];
  if (fp === null || typeof fp !== 'object') {
    problems.push(`C15 ${label} cache fingerprint is missing`);
    return { problems, digest: null };
  }
  const entries = Array.isArray(fp.entries) ? fp.entries : null;
  if (entries === null) {
    problems.push(`C15 ${label} cache fingerprint has no entries array`);
    return { problems, digest: null };
  }
  if (entries.length === 0) {
    problems.push(`C15 ${label} cache fingerprint records no entries`);
  }
  for (const [i, e] of entries.entries()) {
    if (typeof e?.path !== 'string' || e.path.length === 0) {
      problems.push(`C15 ${label} cache entry ${i} has no path`);
      continue;
    }
    if (e.present !== true) {
      problems.push(`C15 ${label} cache entry '${e.path}' is absent; an authoritative scan requires a complete cache`);
      continue;
    }
    if (!Number.isInteger(e.bytes) || e.bytes < 0) {
      problems.push(`C15 ${label} cache entry '${e.path}' has no valid byte count`);
    }
    if (!SHA256_HEX.test(String(e.sha256))) {
      problems.push(`C15 ${label} cache entry '${e.path}' has no valid SHA-256`);
    }
  }

  const checksManifest = Array.isArray(fp.checks_manifest) ? fp.checks_manifest : null;
  if (checksManifest === null) {
    problems.push(`C15 ${label} cache fingerprint has no checks_manifest array`);
    return { problems, digest: null };
  }
  if (checksManifest.length === 0) {
    problems.push(`C15 ${label} checks manifest is empty; the pinned checks bundle was not captured`);
  }
  for (const [i, f] of checksManifest.entries()) {
    if (typeof f?.path !== 'string' || !Number.isInteger(f?.bytes) || !SHA256_HEX.test(String(f?.sha256))) {
      problems.push(`C15 ${label} checks-manifest entry ${i} is malformed`);
    }
  }

  const cc = fp.checks_content ?? {};
  const files = checksManifest.length;
  const bytes = checksManifest.reduce((a, f) => a + (Number.isInteger(f?.bytes) ? f.bytes : 0), 0);
  const manifestSha = sha256(JSON.stringify(checksManifest));
  if (cc.files !== files) {
    problems.push(`C15 ${label} checks_content.files is ${JSON.stringify(cc.files)}; the manifest lists ${files}`);
  }
  if (cc.bytes !== bytes) {
    problems.push(`C15 ${label} checks_content.bytes is ${JSON.stringify(cc.bytes)}; the manifest totals ${bytes}`);
  }
  if (cc.manifest_sha256 !== manifestSha) {
    problems.push(`C15 ${label} checks_content.manifest_sha256 is ${JSON.stringify(cc.manifest_sha256)}; recomputes to ${manifestSha}`);
  }

  const recomputed = sha256(JSON.stringify({ entries, checksManifest }));
  if (fp.digest !== recomputed) {
    problems.push(`C15 ${label} cache fingerprint digest is ${JSON.stringify(fp.digest)}; recomputes to ${recomputed}`);
  }
  return { problems, digest: recomputed };
}

function verifyCacheProvenance(c15) {
  const problems = [];
  const before = recomputeFingerprint('before', c15.trivy_cache_fingerprint_before ?? null);
  const after = recomputeFingerprint('after', c15.trivy_cache_fingerprint_after ?? null);
  problems.push(...before.problems, ...after.problems);

  // Canonical equality of the RECOMPUTED digests, not of the claimed ones and not of a boolean.
  if (before.digest !== null && after.digest !== null && before.digest !== after.digest) {
    problems.push(`C15 recomputed cache digest changed across scanning: ${before.digest} → ${after.digest}`);
  }
  const canonical = (fp) => JSON.stringify({ entries: fp?.entries ?? null, checksManifest: fp?.checks_manifest ?? null });
  if (canonical(c15.trivy_cache_fingerprint_before) !== canonical(c15.trivy_cache_fingerprint_after)) {
    problems.push('C15 before/after cache fingerprints are not canonically identical');
  }
  if (c15.trivy_cache_unchanged !== true) {
    problems.push('C15 did not prove the trivy cache was unchanged across the authoritative scans');
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Item 5: exact C16 target-to-SBOM identity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key-order-independent canonical form, so a record that differs only in property order is
 * not reported as a mismatch while a record that differs in VALUE always is.
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/**
 * The only keys a target record may carry that the per-target descriptor entry does not
 * declare. `integrity_rules` is merged in from the descriptor's top level by
 * generate-closures.mjs; anything else is an undeclared addition and is refused.
 */
export const TARGET_RECORD_MERGED_KEYS = Object.freeze(['integrity_rules']);

function propertyMap(properties) {
  const map = new Map();
  if (!Array.isArray(properties)) return map;
  for (const p of properties) {
    if (typeof p?.name === 'string') map.set(p.name, p.value);
  }
  return map;
}

/**
 * Tie each target to its descriptor identity AND to an SBOM that identifies itself as that
 * target. R3.2 digested the SBOM without opening it, so swapping the production and
 * development records — or pointing both at the production SBOM — passed.
 */
function verifyTargetIdentity({ c16, c16Dir, expectedSha, descriptor, bindings }) {
  const problems = [];
  const want = [...PHASE0_TARGET_IDS].sort();
  const sbomOwners = new Map();

  for (const name of want) {
    const t = c16.targets?.[name];
    if (t === undefined) continue;   // reported by the set comparison
    const declared = descriptor[name];
    if (declared === undefined) {
      problems.push(`C16 target '${name}' has no matching descriptor entry`);
      continue;
    }

    // The map KEY must own the identity: a swap puts the development identity under
    // 'production', which this catches even though both records are individually valid.
    if (t.target?.id !== declared.id) {
      problems.push(
        `C16 target key '${name}' carries identity ${JSON.stringify(t.target?.id)}, but the descriptor declares ${JSON.stringify(declared.id)} — records appear swapped`,
      );
    }
    // The full identity record must equal the descriptor's, FIELD FOR FIELD. A plain deep
    // comparison is wrong here: the generator legitimately merges the descriptor's top-level
    // `integrity_rules` into each target record, so that one key — and only that one — may
    // appear without being declared per target.
    for (const [key, value] of Object.entries(declared)) {
      if (canonical(t.target?.[key]) !== canonical(value)) {
        problems.push(
          `C16 target '${name}' identity field '${key}' is ${canonical(t.target?.[key]).slice(0, 120)}, ` +
          `the descriptor declares ${canonical(value).slice(0, 120)}`,
        );
      }
    }
    const extra = Object.keys(t.target ?? {}).filter(
      (k) => !(k in declared) && !TARGET_RECORD_MERGED_KEYS.includes(k),
    );
    if (extra.length > 0) {
      problems.push(`C16 target '${name}' identity record carries undeclared field(s): ${extra.join(', ')}`);
    }
    if (t.subject_ref !== `eye:target:${declared.id}`) {
      problems.push(`C16 target '${name}' subject_ref is ${JSON.stringify(t.subject_ref)}, expected "eye:target:${declared.id}"`);
    }

    const rel = String(t.sbom_file);
    const bad = pathProblem(rel);
    if (bad !== null) {
      problems.push(`C16 target ${name} names sbom_file ${JSON.stringify(rel)}, which ${bad}`);
      continue;
    }
    // Uniqueness: production and development may not share an SBOM.
    if (sbomOwners.has(rel)) {
      problems.push(`C16 targets '${sbomOwners.get(rel)}' and '${name}' both reference ${rel}; each target needs its own SBOM`);
      continue;
    }
    sbomOwners.set(rel, name);

    const { bytes, problem } = readMember(c16Dir, rel);
    if (problem !== null) {
      problems.push(`C16 target ${name} SBOM '${rel}' ${problem}`);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== t.sbom_sha256) {
      problems.push(`C16 target ${name} SBOM ${rel} claims sha256 ${t.sbom_sha256} but hashes to ${actual}`);
    }
    if (typeof t.sbom_bytes === 'number' && t.sbom_bytes !== bytes.length) {
      problems.push(`C16 target ${name} SBOM ${rel} claims ${t.sbom_bytes} bytes but is ${bytes.length}`);
    }
    const binding = bindings.get(rel);
    if (binding === undefined) {
      problems.push(`C16 target ${name} SBOM ${rel} is not bound in evidence_artifacts`);
    } else {
      if (binding.sha256 !== actual) {
        problems.push(`C16 target ${name} SBOM ${rel} binding claims ${binding.sha256} but the bytes hash to ${actual}`);
      }
      if (binding.bytes !== bytes.length) {
        problems.push(`C16 target ${name} SBOM ${rel} binding claims ${binding.bytes} bytes but the file is ${bytes.length}`);
      }
    }

    // PARSE it. An SBOM that does not say which target it describes cannot prove it.
    let sbom;
    try {
      sbom = JSON.parse(bytes.toString('utf8'));
    } catch (e) {
      problems.push(`C16 target ${name} SBOM ${rel} is not valid JSON (${e instanceof Error ? e.message.slice(0, 120) : e})`);
      continue;
    }
    if (sbom.serialNumber !== t.serial_number) {
      problems.push(`C16 target ${name} SBOM serialNumber ${JSON.stringify(sbom.serialNumber)} does not equal the report's ${JSON.stringify(t.serial_number)}`);
    }
    const subject = sbom.metadata?.component;
    if (subject?.['bom-ref'] !== `eye:target:${declared.id}`) {
      problems.push(`C16 target ${name} SBOM metadata subject bom-ref is ${JSON.stringify(subject?.['bom-ref'])}, expected "eye:target:${declared.id}"`);
    }
    if (typeof subject?.description === 'string' && subject.description !== declared.description) {
      problems.push(`C16 target ${name} SBOM subject description does not match the descriptor's`);
    }
    const props = propertyMap(sbom.metadata?.properties);
    const expectedProps = [
      ['eye:source-sha', expectedSha],
      ['eye:target-id', declared.id],
      ['eye:target-os', declared.os],
      ['eye:target-arch', declared.arch],
      ['eye:target-libc', declared.libc],
      ['eye:target-node', declared.node?.pinned],
      ['eye:target-pnpm', declared.pnpm?.pinned],
      ['eye:dependency-scopes', (declared.dependency_scopes ?? []).join(',')],
      ['eye:importer-roots', (declared.importer_roots ?? []).join(',')],
    ];
    for (const [prop, expected] of expectedProps) {
      if (!props.has(prop)) {
        problems.push(`C16 target ${name} SBOM has no '${prop}' property`);
      } else if (props.get(prop) !== expected) {
        problems.push(`C16 target ${name} SBOM '${prop}' is ${JSON.stringify(props.get(prop))}, expected ${JSON.stringify(expected)}`);
      }
    }
  }

  // Every declared target must have produced its own SBOM.
  if (sbomOwners.size !== want.length) {
    problems.push(`C16 produced ${sbomOwners.size} distinct SBOM(s) for ${want.length} target(s)`);
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The assertion
// ═══════════════════════════════════════════════════════════════════════════════

export function assertFinalManifests({ c15Dir, c16Dir, expectedSha, root = ROOT }) {
  const problems = [];

  // Item 6 FIRST: if the roots or the manifests are symlinks, nothing read through them is
  // evidence, so say so before reading anything else.
  problems.push(...rootPathProblems('C15', c15Dir, 'supply-chain-manifest.json'));
  problems.push(...rootPathProblems('C16', c16Dir, 'closure-reconciliation.json'));
  if (problems.length > 0) return problems;

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
    if (c15.tree_clean_after_scanning !== true) {
      problems.push('C15 did not record a clean worktree AFTER scanning');
    }
    if (c15.worktree_unchanged_by_scanning !== true) {
      problems.push('C15 did not prove the worktree was unchanged by scanning');
    }

    problems.push(...verifyCacheProvenance(c15));

    const pins = JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
    const pinned = pinnedScannerNames(root);
    problems.push(...verifyScannerChain({ c15, pins, pinned, root }));

    // Bindings first, so step verification can cross-check against them.
    const { inventory, problem: inventoryProblem } = expectedC15Inventory(c15.digest_pinned_images);
    if (inventoryProblem !== null) problems.push(`C15 ${inventoryProblem}`);
    const c15Bindings = verifyBindings({
      label: 'C15',
      dir: c15Dir,
      bindings: c15.evidence_artifacts,
      allowed: C15_UNBOUND_ALLOWED,
      requiredInventory: inventory,
    });
    problems.push(...c15Bindings.problems);

    problems.push(...verifyStepClosure({
      c15, c15Dir, expectedSha, bindings: c15Bindings.byPath,
    }).problems);

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
      problems.push(`C16 status is ${JSON.stringify(c16.status)}, expected exactly ${JSON.stringify(C16_FINAL_STATUS)}`);
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

    const want = [...PHASE0_TARGET_IDS].sort();
    const declaredTargets = descriptorTargets(root);
    const declared = Object.keys(declaredTargets).sort();
    if (declared.join(',') !== want.join(',')) {
      problems.push(
        `target-descriptor.json declares [${declared.join(', ')}], expected exactly the Phase 0 set [${want.join(', ')}]`,
      );
    }
    const got = Object.keys(c16.targets ?? {}).sort();
    if (got.join(',') !== want.join(',')) {
      problems.push(`C16 target set is [${got.join(', ')}], expected exactly [${want.join(', ')}]`);
    }
    for (const name of want) {
      const t = c16.targets?.[name];
      if (t === undefined) continue;
      if (t.reconciliation?.clean !== true) problems.push(`C16 target ${name} did not reconcile clean`);
      if (!SHA256_HEX.test(String(t.sbom_sha256))) {
        problems.push(`C16 target ${name} has no valid SBOM digest`);
      }
      if (!(t.counts?.nodes > 0)) problems.push(`C16 target ${name} reported no components`);
      if (t.counts?.subject_root_edges !== t.reconciliation?.subject_root_edges_present) {
        problems.push(`C16 target ${name} subject-to-root edge counts disagree`);
      }
    }

    const c16Bindings = verifyBindings({
      label: 'C16',
      dir: c16Dir,
      bindings: c16.evidence_artifacts,
      allowed: C16_UNBOUND_ALLOWED,
      requiredInventory: [
        ...C16_REQUIRED_REPORTS,
        ...want.map((n) => c16.targets?.[n]?.sbom_file).filter((f) => typeof f === 'string'),
      ],
    });
    problems.push(...c16Bindings.problems);

    problems.push(...verifyTargetIdentity({
      c16, c16Dir, expectedSha, descriptor: declaredTargets, bindings: c16Bindings.byPath,
    }));

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
  const { inventory } = expectedC15Inventory(c15.digest_pinned_images);
  console.log(`final mode confirmed for C15 and C16 at ${expectedSha}`);
  console.log(
    `  C15 steps: ${c15.steps.length} normal + ${c15.trivy_cache_acquisition.steps.length} acquisition, ` +
    `exactly the contract set (${c15.digest_pinned_images.length} pinned image(s))`,
  );
  console.log(
    `  C15 outputs: ${c15.evidence_artifacts.length} bound, all ${inventory.length} derived-required present, ` +
    'every step receipt agreeing with its binding and the bytes',
  );
  console.log(`  C15 scanner chains unbroken to the tracked pins: ${pinnedScannerNames().join(', ')}`);
  console.log('  C15 cache fingerprint recomputed from its own entries and checks manifest, before === after');
  console.log(
    `  C16 targets: ${Object.keys(c16.targets).sort().join(', ')} — each bound to its descriptor identity ` +
    'and to an SBOM that identifies itself as that target',
  );
}
