/**
 * C16-R3.4 — SOURCE-ANCHORED EVIDENCE RECONSTRUCTION.
 *
 * ── THE CONSTITUTIONAL RULE ───────────────────────────────────────────────────────
 * No evidence value may define the expectation used to validate itself. Every
 * acceptance-relevant claim is re-derived from tracked source, from deterministic
 * source-derived state, or from the delivered raw bytes.
 *
 * ── WHY THE MODEL CHANGED RATHER THAN THE FIELDS ──────────────────────────────────
 * Three rounds of field-by-field patching were each defeated the same way. R3.3 constrained
 * the step set — but derived it from `digest_pinned_images`, a manifest field. Replace both
 * configured images with one attacker-chosen digest, delete the second step, its files and its
 * bindings, and the package is perfectly self-consistent and was perfectly accepted. Six more
 * false passes had the same shape: a step redirected to another bound output, a cache entry
 * removed and the aggregates recomputed around it, an SBOM subject rewritten and rehashed,
 * duplicate contradictory metadata properties, argv removed entirely, and the whole component
 * graph deleted while the report kept claiming 195 nodes.
 *
 * So expectations no longer come from the manifest at all:
 *
 *   images        ← docker-compose.yml, cross-checked against conformance.manifest.json
 *   step set      ← the source image count, never the manifest's list
 *   argv          ← a tracked normalized contract, compared element by element
 *   cache entries ← a tracked path set, with every aggregate recomputed
 *   inventory     ← derived from the step/report contracts, and required to EQUAL the bindings
 *   C15 findings  ← RECONSTRUCTED from the delivered raw trivy bytes, then re-reconciled
 *                   against the tracked disposition records
 *   C16 closures  ← RE-DERIVED from pnpm-lock.yaml by the same pure function the generator
 *                   calls, then compared byte-for-byte with the delivered SBOMs
 *
 * Where a claim genuinely cannot be reconstructed, the limit is stated in a comment and the
 * derived aggregates around it are recomputed anyway.
 *
 * Usage:
 *   node scripts/gate/assert-final-manifests.mjs <C15_OUT> <C16_OUT> <EXPECTED_SHA>
 */
import { readFileSync, existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, normalize, isAbsolute, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadSourceContract, expectedStepContract, normalizeArgv, expectedC15Inventory,
  imageStepIdsFor, streamFilesFor, canonical, ownMap, hasOwnKey,
  C15_NORMAL_STEPS, C15_ACQUISITION_STEPS, C15_REQUIRED_REPORTS, C16_REQUIRED_REPORTS,
  CACHE_ENTRY_PATHS, SHA256_HEX, ARGV_TOKENS,
} from './lib/verification-contract.mjs';
import { deriveC16Expectation } from './generate-closures.mjs';
import {
  loadScannerExclusions, validateRecords, reconcileFindings, findingsFromTrivyJson,
} from './lib/scanner-exclusions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const C15_FINAL_MODE = 'final';
export const C15_PASS_OUTCOME = 'PASS';
export const C16_FINAL_STATUS =
  'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA';
export const PHASE0_TARGET_IDS = Object.freeze(['development', 'production']);
export const MANDATORY_SCANNERS = Object.freeze(['gitleaks', 'trivy']);
export const SCAN_PLATFORM = 'linux/amd64';

export const REQUIRED_C15_ARTIFACTS = C15_REQUIRED_REPORTS;
export const REQUIRED_C16_ARTIFACTS = C16_REQUIRED_REPORTS;
export { C15_NORMAL_STEPS, C15_ACQUISITION_STEPS, expectedC15Inventory, ARGV_TOKENS };

export const C15_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['supply-chain-manifest.json']),
  dirs: Object.freeze(['.trivy-cache', '.staged-scanners']),
});
export const C16_UNBOUND_ALLOWED = Object.freeze({
  files: Object.freeze(['closure-reconciliation.json']),
  dirs: Object.freeze([]),
});

/** The only target-record key the generator legitimately merges from the descriptor's top level. */
export const TARGET_RECORD_MERGED_KEYS = Object.freeze(['integrity_rules']);

export function descriptorTargets(root = ROOT) {
  return loadSourceContract(root).targets;
}
export function descriptorTargetIds(root = ROOT) {
  return Object.keys(descriptorTargets(root)).sort();
}
export function expectedTargetIds() {
  return [...PHASE0_TARGET_IDS];
}
export function pinnedScannerNames(root = ROOT) {
  return loadSourceContract(root).scannerNames;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §E Path safety — applied BEFORE any evidence is read
// ═══════════════════════════════════════════════════════════════════════════════

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
 * Read a real, regular, non-symlinked member of `dir`, checking intermediate directories.
 *
 * Stated limit: directories ABOVE the output root are not symlink-checked — the caller names
 * the root, and on macOS `/tmp` and `/var` are themselves symlinks, so walking to the
 * filesystem root would reject every legitimate run. Containment is enforced instead.
 */
function readMember(dir, rel) {
  const abs = join(dir, rel);
  const parts = rel.split(sep);
  for (let i = 0; i < parts.length - 1; i += 1) {
    const intermediate = join(dir, ...parts.slice(0, i + 1));
    let st;
    try { st = lstatSync(intermediate); } catch {
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
  try { st = lstatSync(abs); } catch { return { bytes: null, problem: 'does not exist' }; }
  if (st.isSymbolicLink()) return { bytes: null, problem: 'is a SYMLINK; the verified bytes must be the delivered bytes' };
  if (!st.isFile()) return { bytes: null, problem: 'is not a regular file' };
  try {
    const rel2 = relative(realpathSync(dir), realpathSync(abs));
    if (rel2.startsWith('..') || isAbsolute(rel2)) {
      return { bytes: null, problem: 'resolves outside the evidence package' };
    }
  } catch { return { bytes: null, problem: 'could not be resolved' }; }
  return { bytes: readFileSync(abs), problem: null };
}

function rootPathProblems(label, dir, manifestName) {
  const problems = [];
  let st;
  try { st = lstatSync(dir); } catch {
    problems.push(`${label} output directory ${dir} does not exist`); return problems;
  }
  if (st.isSymbolicLink()) {
    problems.push(`${label} output directory ${dir} is a SYMLINK; the evidence root must be a real directory`);
    return problems;
  }
  if (!st.isDirectory()) { problems.push(`${label} output path ${dir} is not a directory`); return problems; }
  let mst;
  try { mst = lstatSync(join(dir, manifestName)); } catch {
    problems.push(`${label} ${manifestName} does not exist`); return problems;
  }
  if (mst.isSymbolicLink()) {
    problems.push(`${label} ${manifestName} is a SYMLINK; the root manifest must be a real file`);
  } else if (!mst.isFile()) {
    problems.push(`${label} ${manifestName} is not a regular file`);
  }
  return problems;
}

function walkFiles(dir, excludedDirs, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      if (prefix === '' && excludedDirs.includes(entry.name)) continue;
      out.push(...walkFiles(join(dir, entry.name), excludedDirs, rel));
    } else out.push(rel);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bindings — bytes, and an inventory that must EQUAL the derived one
// ═══════════════════════════════════════════════════════════════════════════════

export function verifyBindings({ label, dir, bindings, allowed, requiredInventory = null }) {
  const problems = [];
  const list = Array.isArray(bindings) ? bindings : null;
  if (list === null) {
    problems.push(`${label} evidence_artifacts is not an array`);
    return { problems, verified: 0, byPath: ownMap() };
  }
  if (list.length === 0) {
    problems.push(`${label} bound no evidence artifacts`);
    return { problems, verified: 0, byPath: ownMap() };
  }

  const byPath = ownMap();
  let verified = 0;
  for (const binding of list) {
    const rel = binding?.path;
    const bad = pathProblem(rel);
    if (bad !== null) { problems.push(`${label} binding path ${JSON.stringify(rel)} ${bad}`); continue; }
    if (hasOwnKey(byPath, rel)) {
      problems.push(`${label} binds '${rel}' more than once; a duplicate binding hides which bytes were checked`);
      continue;
    }
    byPath[rel] = binding;

    if (!SHA256_HEX.test(String(binding.sha256))) {
      problems.push(`${label} binding '${rel}' claims no valid lowercase SHA-256 (got ${JSON.stringify(binding.sha256)})`);
      continue;
    }
    if (!Number.isInteger(binding.bytes) || binding.bytes < 0) {
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

  // EXACT SET EQUALITY, not containment. An extra bound file is as much a defect as a
  // missing one: it is a file nobody's contract accounts for.
  if (requiredInventory !== null) {
    const bound = Object.keys(byPath).sort();
    const want = [...requiredInventory].sort();
    for (const rel of want) {
      if (!hasOwnKey(byPath, rel)) {
        problems.push(`${label} did not bind the required output '${rel}' (derived from the source-owned contract)`);
      }
    }
    for (const rel of bound) {
      if (!want.includes(rel)) {
        problems.push(`${label} bound '${rel}', which the source-owned contract does not expect`);
      }
    }
  }

  let present;
  try { present = walkFiles(dir, [...allowed.dirs]); } catch {
    problems.push(`${label} output directory ${dir} could not be read`);
    return { problems, verified, byPath };
  }
  for (const rel of present) {
    if (allowed.files.includes(rel)) continue;
    if (!hasOwnKey(byPath, rel)) {
      problems.push(`${label} output '${rel}' is present but UNBOUND; every delivered file must be bound`);
    }
  }
  return { problems, verified, byPath };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §C Images and platform resolution — from Compose, never from the manifest
// ═══════════════════════════════════════════════════════════════════════════════

function verifyImages({ c15, contract }) {
  const problems = [];
  const sourceRefs = contract.imageRefs;

  // The manifest may REPORT the set; it may not define it.
  const reported = Array.isArray(c15.digest_pinned_images) ? c15.digest_pinned_images : null;
  if (reported === null) {
    problems.push('C15 digest_pinned_images is not an array');
  } else if (canonical(reported) !== canonical(sourceRefs)) {
    problems.push(
      `C15 digest_pinned_images is [${reported.join(', ')}], but tracked source (docker-compose.yml, ` +
      `cross-checked against conformance.manifest.json) declares [${sourceRefs.join(', ')}]`,
    );
  }

  const res = Array.isArray(c15.image_platform_resolution) ? c15.image_platform_resolution : null;
  if (res === null) {
    problems.push('C15 image_platform_resolution is not an array');
    return { problems, scanRefs: null };
  }
  if (res.length !== sourceRefs.length) {
    problems.push(`C15 resolved ${res.length} image(s); tracked source declares ${sourceRefs.length}`);
  }

  const scanRefs = [];
  sourceRefs.forEach((ref, index) => {
    const r = res[index];
    if (r === undefined) {
      problems.push(`C15 has no platform resolution for source-declared image ${index} (${ref})`);
      scanRefs.push(null);
      return;
    }
    if (r.pinned_ref !== ref) {
      problems.push(`C15 resolution ${index} is for ${JSON.stringify(r.pinned_ref)}; source declares ${ref}`);
    }
    const digest = ref.slice(ref.indexOf('@') + 1);
    if (r.pinned_digest !== digest) {
      problems.push(`C15 resolution ${index} pinned_digest ${JSON.stringify(r.pinned_digest)} != ${digest}`);
    }
    // The raw index bytes must hash to the digest in the CONFIGURED reference.
    if (r.raw_index_digest !== digest) {
      problems.push(`C15 resolution ${index} raw_index_digest ${JSON.stringify(r.raw_index_digest)} != the configured ${digest}`);
    }
    if (r.raw_index_digest_matches_reference !== true) {
      problems.push(`C15 resolution ${index} did not verify the raw index digest against the configured reference`);
    }
    if (r.resolution?.resolved !== true) {
      problems.push(`C15 resolution ${index} did not resolve`);
    }
    // The scanned child must be the linux/amd64 child of THAT index, named by the resolution
    // itself — so a scan_ref cannot be an arbitrary digest.
    const children = Array.isArray(r.resolution?.children) ? r.resolution.children : [];
    const amd64 = children.filter(
      (c) => c.os === 'linux' && c.architecture === 'amd64' && c.attestation !== true,
    );
    if (amd64.length !== 1) {
      problems.push(`C15 resolution ${index} has ${amd64.length} non-attestation linux/amd64 children; expected exactly 1`);
    } else if (r.scan_ref !== `${ref.slice(0, ref.indexOf('@'))}@${amd64[0].digest}`) {
      problems.push(
        `C15 resolution ${index} scan_ref ${JSON.stringify(r.scan_ref)} is not the linux/amd64 child ` +
        `${amd64[0].digest} of the configured index`,
      );
    }
    scanRefs.push(typeof r.scan_ref === 'string' ? r.scan_ref : null);
  });

  if (c15.scan_platform !== undefined && c15.scan_platform !== SCAN_PLATFORM) {
    problems.push(`C15 scan_platform is ${JSON.stringify(c15.scan_platform)}, expected ${SCAN_PLATFORM}`);
  }
  return { problems, scanRefs };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §C Exact step closure: ids, argv, coverage, policy, version, streams
// ═══════════════════════════════════════════════════════════════════════════════

function compareIdSets(kind, expected, actual) {
  const problems = [];
  const counts = ownMap();
  for (const id of actual) counts[id] = (hasOwnKey(counts, id) ? counts[id] : 0) + 1;
  for (const id of Object.keys(counts)) {
    if (counts[id] > 1) problems.push(`C15 ${kind} '${id}' appears ${counts[id]} times; step ids must be unique`);
  }
  for (const id of expected) {
    if (!hasOwnKey(counts, id)) problems.push(`C15 is missing the required ${kind} '${id}'`);
  }
  for (const id of Object.keys(counts)) {
    if (!expected.includes(id)) problems.push(`C15 recorded an unexpected ${kind} '${id}'; the ${kind} set is exact`);
  }
  return problems;
}

function verifyStepStreams({ label, dir, step, bindings, referenceCounts }) {
  const problems = [];
  for (const stream of ['stdout', 'stderr']) {
    const rel = step[`${stream}_file`];
    const claimedBytes = step[`${stream}_bytes`];
    const claimedSha = step[`${stream}_sha256`];

    // CANONICAL NAME. R3.3 accepted any bound path, so a step could be redirected at another
    // step's output while its own canonical file sat unused.
    const canonicalName = streamFilesFor(step.id)[stream];
    if (rel !== canonicalName) {
      problems.push(
        `${label} step '${step.id}' ${stream}_file is ${JSON.stringify(rel)}; the only canonical name is '${canonicalName}'`,
      );
      continue;
    }
    referenceCounts[rel] = (hasOwnKey(referenceCounts, rel) ? referenceCounts[rel] : 0) + 1;

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
    const binding = hasOwnKey(bindings, rel) ? bindings[rel] : undefined;
    if (binding === undefined) {
      problems.push(`${label} step '${step.id}' references '${rel}', which is NOT bound in evidence_artifacts`);
      continue;
    }
    if (binding.sha256 !== claimedSha) {
      problems.push(`${label} '${rel}': step '${step.id}' claims sha256 ${claimedSha} but its binding claims ${binding.sha256}`);
    }
    if (binding.bytes !== claimedBytes) {
      problems.push(`${label} '${rel}': step '${step.id}' claims ${claimedBytes} bytes but its binding claims ${binding.bytes}`);
    }
  }
  return problems;
}

/** The volatile paths whose values the normalized argv contract tokenizes. */
/**
 * The PRODUCER's output directory, derived by shape from the staged-binary paths.
 *
 * It cannot be the verifier's own `c15Dir`: a reviewer unpacks the delivered ZIP somewhere
 * else entirely, and the argv recorded at run time necessarily names the directory the run
 * used. Nor is it read from a dedicated manifest field — there is none, and inventing one
 * would hand the evidence a lever.
 *
 * Instead it is derived from `<OUT>/.staged-scanners/<tool>`, the same paths the scanner digest
 * chain already pins, and every pinned scanner must agree on it. Every report path in every
 * argv is then required to sit directly inside that one directory, so a step cannot point its
 * report somewhere else and still normalize to the expected shape.
 */
function deriveProducerOutDir(c15) {
  const staged = c15.staged_scanner_binaries ?? {};
  const problems = [];
  const candidates = new Set();
  for (const tool of Object.keys(staged)) {
    const p = staged[tool]?.staged_path;
    if (typeof p !== 'string' || p.length === 0) {
      problems.push(`C15 staged ${tool} binary records no staged_path, so the run's output directory cannot be derived`);
      continue;
    }
    const parent = dirname(p);
    if (parent.split(sep).pop() !== '.staged-scanners') {
      problems.push(`C15 staged ${tool} binary path ${JSON.stringify(p)} is not inside a '.staged-scanners' directory`);
      continue;
    }
    candidates.add(dirname(parent));
  }
  if (candidates.size === 0) {
    problems.push('C15 records no staged scanner path, so the run output directory cannot be derived');
    return { outDir: null, problems };
  }
  if (candidates.size > 1) {
    problems.push(`C15 staged scanners disagree about the run output directory: ${[...candidates].join(', ')}`);
    return { outDir: null, problems };
  }
  return { outDir: [...candidates][0], problems };
}

function argvPathsFor({ c15, root, producerOutDir }) {
  const staged = c15.staged_scanner_binaries ?? {};
  return {
    // The repository root is the verifier's OWN root — tracked ground truth. Taking it from a
    // manifest field would let the evidence relabel whatever it scanned as "the repo".
    repoRoot: root,
    outDir: producerOutDir,
    // The cache and staged-binary locations are genuinely per-run, and are tokenized only so
    // the surrounding argument shape can be compared exactly; their VALUES are separately
    // pinned by the cache fingerprint and the scanner digest chain.
    trivyCache: typeof c15.trivy_cache_dir === 'string' ? c15.trivy_cache_dir : null,
    stagedGitleaks: staged.gitleaks?.staged_path ?? null,
    stagedTrivy: staged.trivy?.staged_path ?? null,
  };
}

function verifyStepClosure({ c15, c15Dir, expectedSha, bindings, contract, scanRefs, root }) {
  const problems = [];
  const referenceCounts = ownMap();

  const imageIds = imageStepIdsFor(contract.imageRefs.length);
  const expectedNormal = [...C15_NORMAL_STEPS.map((s) => s.id), ...imageIds];
  const expectedArgv = expectedStepContract({ scanRefs: scanRefs ?? [] });
  const derivedOut = deriveProducerOutDir(c15);
  problems.push(...derivedOut.problems);
  const paths = argvPathsFor({ c15, root, producerOutDir: derivedOut.outDir });

  const steps = Array.isArray(c15.steps) ? c15.steps : null;
  if (steps === null) {
    problems.push('C15 steps is not an array');
    return { problems };
  }
  problems.push(...compareIdSets('step', expectedNormal, steps.map((s) => s?.id)));

  const checkOne = (step, label, isNormal) => {
    if (typeof step?.id !== 'string') return;
    const want = hasOwnKey(expectedArgv, step.id) ? expectedArgv[step.id] : null;
    if (want === null) return;   // reported by the set comparison

    // Acquisition receipts carry no `tool` field; their argv contract names the staged binary,
    // which is stronger than a self-declared label anyway.
    if (isNormal && step.tool !== want.tool) {
      problems.push(`${label} '${step.id}' was run by ${JSON.stringify(step.tool)}, expected ${JSON.stringify(want.tool)}`);
    }
    if (isNormal && step.policy !== want.policy) {
      problems.push(`${label} '${step.id}' has policy ${JSON.stringify(step.policy)}, expected ${JSON.stringify(want.policy)}`);
    }
    if (step.exit_code !== 0) problems.push(`${label} '${step.id}' exited ${JSON.stringify(step.exit_code)}; a PASS run requires 0`);
    if (isNormal && step.failed !== false) problems.push(`${label} '${step.id}' is marked failed in a PASS manifest`);
    if (step.signal !== null && step.signal !== undefined) {
      problems.push(`${label} '${step.id}' was terminated by signal ${JSON.stringify(step.signal)}`);
    }
    if (isNormal && step.source_sha !== expectedSha) {
      problems.push(`${label} '${step.id}' records source_sha ${JSON.stringify(step.source_sha)}, expected ${expectedSha}`);
    }

    // EXACT NORMALIZED ARGV. R3.3 validated the step LABEL and never what executed, so argv
    // could be removed entirely or replaced with something unrelated.
    const gotArgv = normalizeArgv(step.argv, paths);
    if (gotArgv === null) {
      problems.push(`${label} '${step.id}' records no argv array, so what executed is unknown`);
    } else if (canonical(gotArgv) !== canonical(want.argv)) {
      problems.push(
        `${label} '${step.id}' normalized argv does not match the tracked contract:\n` +
        `      got  ${JSON.stringify(gotArgv)}\n` +
        `      want ${JSON.stringify(want.argv)}`,
      );
    }
    if (isNormal && canonical(step.coverage ?? null) !== canonical(want.coverage ?? null)) {
      problems.push(
        `${label} '${step.id}' coverage is ${JSON.stringify(step.coverage ?? null)}, ` +
        `expected ${JSON.stringify(want.coverage ?? null)}`,
      );
    }
    const wantVersion = hasOwnKey(contract.toolVersions, want.tool) ? contract.toolVersions[want.tool] : null;
    if (wantVersion !== null && step.tool_version !== undefined && step.tool_version !== wantVersion) {
      problems.push(`${label} '${step.id}' tool_version is ${JSON.stringify(step.tool_version)}, expected the pinned ${wantVersion}`);
    }

    problems.push(...verifyStepStreams({ label: 'C15', dir: c15Dir, step, bindings, referenceCounts }));
  };

  for (const step of steps) checkOne(step, 'C15 step', true);

  const acq = c15.trivy_cache_acquisition?.steps;
  if (!Array.isArray(acq)) {
    problems.push('C15 trivy_cache_acquisition.steps is not an array');
  } else {
    problems.push(...compareIdSets('acquisition step', C15_ACQUISITION_STEPS.map((s) => s.id), acq.map((s) => s?.id)));
    for (const step of acq) checkOne(step, 'C15 acquisition step', false);
  }

  for (const rel of Object.keys(referenceCounts)) {
    if (referenceCounts[rel] > 1) {
      problems.push(`C15 raw stream '${rel}' is referenced by ${referenceCounts[rel]} steps; each belongs to exactly one`);
    }
  }
  return { problems };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §C Raw-output semantic reconstruction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A byte-bound report is not a semantically proven one. Parse every governed raw output and
 * evaluate it independently, then RECONSTRUCT the image findings from the delivered trivy
 * bytes and re-run the tracked disposition reconciliation over them.
 */
function verifyRawSemantics({ c15, c15Dir, contract, scanRefs, root }) {
  const problems = [];
  const read = (rel) => {
    const { bytes, problem } = readMember(c15Dir, rel);
    if (problem !== null) { problems.push(`C15 '${rel}' ${problem}`); return null; }
    return bytes.toString('utf8');
  };

  // 1. Dependency audit — no governed blocking vulnerability.
  const auditText = read('pnpm-audit-json.stdout.txt');
  if (auditText !== null) {
    let audit = null;
    try { audit = JSON.parse(auditText); } catch (e) {
      problems.push(`C15 pnpm-audit-json.stdout.txt is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
    }
    if (audit !== null) {
      const vuln = audit.metadata?.vulnerabilities ?? {};
      for (const level of ['high', 'critical']) {
        const n = vuln[level];
        if (Number.isInteger(n) && n > 0) {
          problems.push(`C15 dependency audit reports ${n} ${level} vulnerability(ies); a PASS run requires none`);
        }
      }
      const advisories = audit.advisories ?? {};
      const blocking = Object.keys(advisories).filter(
        (k) => ['high', 'critical'].includes(String(advisories[k]?.severity).toLowerCase()),
      );
      if (blocking.length > 0) {
        problems.push(`C15 dependency audit carries ${blocking.length} blocking advisory(ies)`);
      }
    }
  }

  // 2. Both gitleaks reports: structurally valid AND empty.
  for (const rel of ['gitleaks-worktree.json', 'gitleaks-history.json']) {
    const text = read(rel);
    if (text === null) continue;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {
      problems.push(`C15 ${rel} is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      problems.push(`C15 ${rel} is ${parsed === null ? 'null' : typeof parsed}, expected a JSON array of findings`);
    } else if (parsed.length !== 0) {
      problems.push(`C15 ${rel} reports ${parsed.length} secret finding(s); a PASS run requires none`);
    }
  }

  // 3. Filesystem trivy JSON — no blocking HIGH/CRITICAL result.
  const fsText = read('trivy-fs-json.stdout.txt');
  if (fsText !== null) {
    let fsReport = null;
    try { fsReport = JSON.parse(fsText); } catch (e) {
      problems.push(`C15 trivy-fs-json.stdout.txt is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
    }
    if (fsReport !== null) {
      let blocking = 0;
      for (const result of fsReport.Results ?? []) {
        for (const v of result.Vulnerabilities ?? []) {
          if (['HIGH', 'CRITICAL'].includes(String(v.Severity))) blocking += 1;
        }
        for (const m of result.Misconfigurations ?? []) {
          if (['HIGH', 'CRITICAL'].includes(String(m.Severity))) blocking += 1;
        }
        for (const s of result.Secrets ?? []) {
          if (['HIGH', 'CRITICAL'].includes(String(s.Severity))) blocking += 1;
        }
      }
      if (blocking > 0) {
        problems.push(`C15 filesystem scan carries ${blocking} blocking HIGH/CRITICAL result(s); a PASS run requires none`);
      }
    }
  }

  // 4. RECONSTRUCT the image findings from the delivered raw trivy bytes.
  if (scanRefs === null) {
    problems.push('C15 image findings cannot be reconstructed: platform resolution did not verify');
    return problems;
  }
  const reconstructed = [];
  let reconstructable = true;
  contract.imageRefs.forEach((pinnedRef, index) => {
    const rel = `trivy-image-${index}.stdout.txt`;
    const text = read(rel);
    if (text === null) { reconstructable = false; return; }
    try {
      reconstructed.push(...findingsFromTrivyJson(text, pinnedRef));
    } catch (e) {
      problems.push(`C15 ${rel} could not be parsed as a trivy report (${e instanceof Error ? e.message.slice(0, 100) : e})`);
      reconstructable = false;
    }
  });
  if (!reconstructable) return problems;

  // 4a. image-findings.json must equal the reconstruction EXACTLY.
  const deliveredText = read('image-findings.json');
  if (deliveredText !== null) {
    let delivered = null;
    try { delivered = JSON.parse(deliveredText); } catch (e) {
      problems.push(`C15 image-findings.json is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
    }
    if (delivered !== null && canonical(delivered) !== canonical(reconstructed)) {
      problems.push(
        `C15 image-findings.json does not equal the findings reconstructed from the delivered raw ` +
        `trivy output (${Array.isArray(delivered) ? delivered.length : 'non-array'} vs ${reconstructed.length} finding(s))`,
      );
    }
  }

  // 4b. Re-run disposition validation and reconciliation against TRACKED records.
  const exclusionDoc = loadScannerExclusions(root).doc;
  const asOf = c15.started_at ?? c15.finished_at;
  const runDate = typeof asOf === 'string' ? asOf.slice(0, 10) : null;
  if (runDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    problems.push('C15 records no usable run date, so disposition expiry cannot be re-evaluated');
    return problems;
  }
  const isTracked = () => true;   // the records cite tracked evidence; the gate proved that
  const validation = validateRecords(exclusionDoc, {
    runDate, root, isTracked, readEvidence: (rel) => {
      try { return readFileSync(join(root, rel)); } catch { return null; }
    },
  });
  if (validation.problems.length > 0) {
    problems.push(`C15 tracked scanner dispositions do not validate at ${runDate}: ${validation.problems[0]}`);
  }
  const recomputed = reconcileFindings(exclusionDoc, reconstructed, {
    scanPlatform: SCAN_PLATFORM, fatalIndices: validation.fatalIndices,
  });

  for (const key of ['unmatched', 'unused_records', 'stale_advisory_ids']) {
    const list = recomputed[key];
    if (!Array.isArray(list) || list.length !== 0) {
      problems.push(`C15 RECOMPUTED reconciliation has a non-empty '${key}' (${(list ?? []).length})`);
    }
  }
  if (!(recomputed.total_findings > 0)) {
    problems.push('C15 reconstruction produced zero image findings, so nothing was reconciled');
  }

  // 4c. The manifest's own reconciliation must EQUAL the recomputation.
  const claimed = c15.image_finding_reconciliation;
  if (claimed === null || claimed === undefined) {
    problems.push('C15 recorded no image finding reconciliation');
  } else if (canonical(claimed) !== canonical(recomputed)) {
    const summarise = (r) => JSON.stringify({
      total: r?.total_findings,
      matched: Array.isArray(r?.matched) ? r.matched.length : r?.matched,
      unmatched: Array.isArray(r?.unmatched) ? r.unmatched.length : r?.unmatched,
      unused: Array.isArray(r?.unused_records) ? r.unused_records.length : r?.unused_records,
    });
    problems.push(
      `C15 image_finding_reconciliation does not equal the reconciliation recomputed from the ` +
      `delivered raw bytes against the tracked disposition records: claimed ${summarise(claimed)}, ` +
      `recomputed ${summarise(recomputed)}`,
    );
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §C Scanner digest chain and cache reconstruction
// ═══════════════════════════════════════════════════════════════════════════════

function verifyScannerChain({ c15, contract }) {
  const problems = [];
  const hostKey = c15.host_platform_key;
  const verifiedTools = c15.executed_binary_authentication?.verified ?? {};
  const stagedAfter = c15.staged_tools_after_scanning ?? {};
  const pinned = contract.scannerNames;

  const verifiedNames = Object.keys(verifiedTools).sort();
  if (verifiedNames.join(',') !== pinned.join(',')) {
    problems.push(`C15 authenticated tool set is [${verifiedNames.join(', ')}], expected exactly the pinned set [${pinned.join(', ')}]`);
  }
  for (const mandatory of MANDATORY_SCANNERS) {
    if (!pinned.includes(mandatory)) problems.push(`scanner-pins.json does not pin the mandatory scanner '${mandatory}'`);
  }
  if (pinned.length === 0) problems.push('scanner-pins.json pins no tools; the expected authenticated set cannot be empty');

  for (const tool of pinned) {
    const artifacts = contract.scanners[tool]?.artifacts ?? {};
    const tracked = hasOwnKey(artifacts, hostKey) ? artifacts[hostKey]?.executable_sha256 : null;
    if (typeof tracked !== 'string' || !SHA256_HEX.test(tracked)) {
      problems.push(`C15 host platform ${JSON.stringify(hostKey)} has no valid tracked ${tool} digest, so no chain can be anchored`);
      continue;
    }
    const v = hasOwnKey(verifiedTools, tool) ? verifiedTools[tool] : undefined;
    if (v === undefined) { problems.push(`C15 has no authentication evidence for the pinned scanner '${tool}'`); continue; }
    const after = hasOwnKey(stagedAfter, tool) ? stagedAfter[tool] : undefined;
    if (after === undefined) problems.push(`C15 did not re-verify the staged ${tool} binary after scanning`);

    for (const [name, value] of [
      ['tracked pin', tracked],
      ['authenticated executable digest', v.actual_sha256],
      ['expected executable digest', v.expected_sha256],
      ['staged pre-execution digest', v.staged_sha256],
      ['staged post-scan expected digest', after?.expected],
      ['staged post-scan actual digest', after?.sha256_after],
    ]) {
      if (!SHA256_HEX.test(String(value))) {
        problems.push(`C15 ${tool} ${name} is not a valid lowercase SHA-256 (${JSON.stringify(value)})`);
      } else if (value !== tracked) {
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
    const wantVersion = hasOwnKey(contract.toolVersions, tool) ? contract.toolVersions[tool] : null;
    const reported = c15.pinned_toolchain?.[tool]?.actual ?? null;
    if (wantVersion !== null && reported !== null && reported !== wantVersion) {
      problems.push(`C15 reports ${tool} ${reported}, but the pins declare ${wantVersion}`);
    }
  }
  return problems;
}

/**
 * Recompute a cache fingerprint from its own delivered metadata, and require the entry PATH
 * SET to be exactly the tracked one.
 *
 * Stated honestly: the cache files are not shipped — the trivy DB alone exceeds a gigabyte —
 * so the individual per-entry digests are claims bound by the producer and cannot be
 * recomputed from cache bytes here. Every aggregate derived from those entries is recomputed,
 * and the entry path set is source-owned, so removing `db/trivy.db` and recomputing the
 * aggregates around it no longer passes.
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

  // EXACT, UNIQUE, SOURCE-OWNED PATH SET.
  const seen = ownMap();
  for (const [i, e] of entries.entries()) {
    if (typeof e?.path !== 'string' || e.path.length === 0) {
      problems.push(`C15 ${label} cache entry ${i} has no path`);
      continue;
    }
    if (hasOwnKey(seen, e.path)) {
      problems.push(`C15 ${label} cache entry '${e.path}' appears more than once`);
      continue;
    }
    seen[e.path] = true;
    if (!CACHE_ENTRY_PATHS.includes(e.path)) {
      problems.push(`C15 ${label} cache entry '${e.path}' is not one of the tracked cache artifacts`);
    }
    if (e.present !== true) {
      problems.push(`C15 ${label} cache entry '${e.path}' is absent; an authoritative scan requires a complete cache`);
      continue;
    }
    if (!Number.isInteger(e.bytes) || e.bytes < 0) problems.push(`C15 ${label} cache entry '${e.path}' has no valid byte count`);
    if (!SHA256_HEX.test(String(e.sha256))) problems.push(`C15 ${label} cache entry '${e.path}' has no valid SHA-256`);
  }
  for (const want of CACHE_ENTRY_PATHS) {
    if (!hasOwnKey(seen, want)) {
      problems.push(`C15 ${label} cache fingerprint omits the required entry '${want}'`);
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
  const checkPaths = ownMap();
  let previous = null;
  for (const [i, f] of checksManifest.entries()) {
    if (typeof f?.path !== 'string' || !Number.isInteger(f?.bytes) || !SHA256_HEX.test(String(f?.sha256))) {
      problems.push(`C15 ${label} checks-manifest entry ${i} is malformed`);
      continue;
    }
    if (hasOwnKey(checkPaths, f.path)) {
      problems.push(`C15 ${label} checks-manifest lists '${f.path}' more than once`);
    }
    checkPaths[f.path] = true;
    if (f.path !== normalize(f.path)) {
      problems.push(`C15 ${label} checks-manifest path ${JSON.stringify(f.path)} is not normalized`);
    }
    if (previous !== null && f.path < previous) {
      problems.push(`C15 ${label} checks-manifest is not sorted by path ('${f.path}' follows '${previous}')`);
    }
    previous = f.path;
  }

  const cc = fp.checks_content ?? {};
  const files = checksManifest.length;
  const bytes = checksManifest.reduce((a, f) => a + (Number.isInteger(f?.bytes) ? f.bytes : 0), 0);
  const manifestSha = sha256(JSON.stringify(checksManifest));
  if (cc.files !== files) problems.push(`C15 ${label} checks_content.files is ${JSON.stringify(cc.files)}; the manifest lists ${files}`);
  if (cc.bytes !== bytes) problems.push(`C15 ${label} checks_content.bytes is ${JSON.stringify(cc.bytes)}; the manifest totals ${bytes}`);
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
  if (before.digest !== null && after.digest !== null && before.digest !== after.digest) {
    problems.push(`C15 recomputed cache digest changed across scanning: ${before.digest} → ${after.digest}`);
  }
  const canon = (fp) => canonical({ entries: fp?.entries ?? null, checksManifest: fp?.checks_manifest ?? null });
  if (canon(c15.trivy_cache_fingerprint_before) !== canon(c15.trivy_cache_fingerprint_after)) {
    problems.push('C15 before/after cache fingerprints are not canonically identical');
  }
  if (c15.trivy_cache_unchanged !== true) {
    problems.push('C15 did not prove the trivy cache was unchanged across the authoritative scans');
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §D C16 — reconstructed from tracked source, not read back from the report
// ═══════════════════════════════════════════════════════════════════════════════

const PROVENANCE_PROPERTIES = Object.freeze([
  'eye:closure-source', 'eye:dependency-scopes', 'eye:descriptor-sha256', 'eye:generator',
  'eye:generator-sha256', 'eye:importer-roots', 'eye:lockfile-sha256', 'eye:purl-implementation',
  'eye:source-sha', 'eye:target-arch', 'eye:target-id', 'eye:target-libc', 'eye:target-node',
  'eye:target-os', 'eye:target-pnpm', 'eye:yaml-implementation',
]);

function verifyC16FromSource({ c16, c16Dir, expectedSha, bindings, root }) {
  const problems = [];
  const want = [...PHASE0_TARGET_IDS].sort();

  // Re-derive everything from tracked source using the SAME function the generator calls.
  // The as-of date comes from the evidence only to reproduce the exclusion window; it cannot
  // change any closure because there are no governed closure exclusions to expire, and a
  // mismatch in the derived result is what fails.
  const asOfDate = typeof c16.generated_from?.run_date === 'string'
    ? c16.generated_from.run_date
    : new Date().toISOString().slice(0, 10);
  let derived;
  try {
    derived = deriveC16Expectation({ root, asOfDate });
  } catch (e) {
    problems.push(`C16 could not be re-derived from tracked source (${e instanceof Error ? e.message.slice(0, 200) : e})`);
    return problems;
  }
  if (derived.cardinalityProblems.length > 0) {
    problems.push(`C16 source re-derivation reports an exclusion cardinality problem: ${derived.cardinalityProblems[0]}`);
  }
  if (Object.keys(derived.unresolved).length > 0) {
    problems.push('C16 source re-derivation left unresolved lockfile references');
  }
  if (derived.meta.sourceSha !== expectedSha) {
    problems.push(`C16 re-derivation ran at source ${derived.meta.sourceSha}, not the expected ${expectedSha}`);
  }

  const declaredIds = Object.keys(derived.descriptor.targets ?? {}).sort();
  if (declaredIds.join(',') !== want.join(',')) {
    problems.push(`target-descriptor.json declares [${declaredIds.join(', ')}], expected exactly the Phase 0 set [${want.join(', ')}]`);
  }
  const got = Object.keys(c16.targets ?? {}).sort();
  if (got.join(',') !== want.join(',')) {
    problems.push(`C16 target set is [${got.join(', ')}], expected exactly [${want.join(', ')}]`);
  }

  const sbomOwners = ownMap();
  for (const name of want) {
    const report = hasOwnKey(c16.targets ?? {}, name) ? c16.targets[name] : undefined;
    const expected = hasOwnKey(derived.reports, name) ? derived.reports[name] : undefined;
    if (report === undefined) continue;          // reported by the set comparison
    if (expected === undefined) {
      problems.push(`C16 target '${name}' has no source-derived counterpart`);
      continue;
    }
    const declared = derived.descriptor.targets[name];

    // Identity: the map KEY must own the descriptor identity.
    if (report.target?.id !== declared.id) {
      problems.push(
        `C16 target key '${name}' carries identity ${JSON.stringify(report.target?.id)}, but the descriptor ` +
        `declares ${JSON.stringify(declared.id)} — records appear swapped`,
      );
    }
    for (const key of Object.keys(declared)) {
      if (canonical(report.target?.[key]) !== canonical(declared[key])) {
        problems.push(`C16 target '${name}' identity field '${key}' does not equal the descriptor's declaration`);
      }
    }
    const extra = Object.keys(report.target ?? {}).filter(
      (k) => !hasOwnKey(declared, k) && !TARGET_RECORD_MERGED_KEYS.includes(k),
    );
    if (extra.length > 0) {
      problems.push(`C16 target '${name}' identity record carries undeclared field(s): ${extra.join(', ')}`);
    }

    // COUNTS AND RECONCILIATION FROM SOURCE, not from the report's own claim.
    if (canonical(report.counts) !== canonical(expected.counts)) {
      problems.push(
        `C16 target '${name}' counts do not equal the source-derived counts: reported ` +
        `${JSON.stringify(report.counts)}, derived ${JSON.stringify(expected.counts)}`,
      );
    }
    if (canonical(report.scope_distribution) !== canonical(expected.scope_distribution)) {
      problems.push(`C16 target '${name}' scope distribution does not equal the source-derived distribution`);
    }
    if (canonical(report.workspace_identities) !== canonical(expected.workspace_identities)) {
      problems.push(`C16 target '${name}' workspace identities do not equal the source-derived identities`);
    }
    if (canonical(report.reconciliation) !== canonical(expected.reconciliation)) {
      problems.push(`C16 target '${name}' reconciliation does not equal the source-derived reconciliation`);
    }
    if (expected.reconciliation.clean !== true) {
      problems.push(`C16 target '${name}' does not reconcile clean when re-derived from tracked source`);
    }
    if (report.serial_number !== expected.serial_number) {
      problems.push(`C16 target '${name}' serial_number is ${JSON.stringify(report.serial_number)}, derived ${expected.serial_number}`);
    }
    if (report.subject_ref !== expected.subject_ref) {
      problems.push(`C16 target '${name}' subject_ref is ${JSON.stringify(report.subject_ref)}, derived ${expected.subject_ref}`);
    }
    if (!Number.isInteger(report.sbom_bytes)) {
      problems.push(`C16 target '${name}' sbom_bytes is ${JSON.stringify(report.sbom_bytes)}; a mandatory integer byte count`);
    }

    // ── the SBOM file itself ──────────────────────────────────────────────────────
    const rel = String(report.sbom_file);
    const bad = pathProblem(rel);
    if (bad !== null) { problems.push(`C16 target ${name} names sbom_file ${JSON.stringify(rel)}, which ${bad}`); continue; }
    if (rel !== expected.sbom_file) {
      problems.push(`C16 target '${name}' names ${rel}; the source-derived name is ${expected.sbom_file}`);
    }
    if (hasOwnKey(sbomOwners, rel)) {
      problems.push(`C16 targets '${sbomOwners[rel]}' and '${name}' both reference ${rel}; each target needs its own SBOM`);
      continue;
    }
    sbomOwners[rel] = name;

    const { bytes, problem } = readMember(c16Dir, rel);
    if (problem !== null) { problems.push(`C16 target ${name} SBOM '${rel}' ${problem}`); continue; }
    const actual = sha256(bytes);
    const text = bytes.toString('utf8');

    // BYTE-FOR-BYTE against the deterministically generated expectation. The SBOM carries no
    // timestamp and its serialNumber is content-derived, so there is no documented
    // nondeterministic field and full byte equality is the correct comparison.
    const expectedText = derived.sbomTexts[name];
    if (text !== expectedText) {
      problems.push(
        `C16 target '${name}' SBOM ${rel} is not byte-identical to the SBOM deterministically ` +
        `generated from tracked source (${bytes.length} delivered vs ${Buffer.byteLength(expectedText)} derived)`,
      );
    }
    if (actual !== report.sbom_sha256) {
      problems.push(`C16 target ${name} SBOM ${rel} claims sha256 ${report.sbom_sha256} but hashes to ${actual}`);
    }
    if (actual !== expected.sbom_sha256) {
      problems.push(`C16 target ${name} SBOM ${rel} hashes to ${actual}; the source-derived digest is ${expected.sbom_sha256}`);
    }
    if (Number.isInteger(report.sbom_bytes) && report.sbom_bytes !== bytes.length) {
      problems.push(`C16 target ${name} SBOM ${rel} claims ${report.sbom_bytes} bytes but is ${bytes.length}`);
    }
    const binding = hasOwnKey(bindings, rel) ? bindings[rel] : undefined;
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

    // ── the SBOM's own contents ───────────────────────────────────────────────────
    let sbom = null;
    try { sbom = JSON.parse(text); } catch (e) {
      problems.push(`C16 target ${name} SBOM ${rel} is not valid JSON (${e instanceof Error ? e.message.slice(0, 120) : e})`);
      continue;
    }
    if (sbom.serialNumber !== expected.serial_number) {
      problems.push(`C16 target ${name} SBOM serialNumber ${JSON.stringify(sbom.serialNumber)} != the derived ${expected.serial_number}`);
    }

    // A NONEMPTY GRAPH, sized from source. R3.3 accepted a deleted graph behind a rehashed
    // digest while the report kept claiming 195 nodes.
    const components = Array.isArray(sbom.components) ? sbom.components : null;
    const dependencies = Array.isArray(sbom.dependencies) ? sbom.dependencies : null;
    if (components === null || dependencies === null) {
      problems.push(`C16 target ${name} SBOM has no components/dependencies arrays`);
    } else {
      if (components.length === 0 || dependencies.length === 0) {
        problems.push(`C16 target ${name} SBOM graph is EMPTY (${components.length} components, ${dependencies.length} dependencies)`);
      }
      const derivedNodes = expected.counts.nodes;
      // The subject is a component of the graph in addition to the closure nodes.
      if (components.length + 1 !== derivedNodes && components.length !== derivedNodes) {
        problems.push(
          `C16 target ${name} SBOM carries ${components.length} components; the source-derived closure has ` +
          `${derivedNodes} node(s)`,
        );
      }
      const edgeTotal = dependencies.reduce((a, d) => a + (Array.isArray(d.dependsOn) ? d.dependsOn.length : 0), 0);
      const derivedEdges = expected.counts.edges + expected.counts.subject_root_edges;
      if (edgeTotal !== derivedEdges) {
        problems.push(
          `C16 target ${name} SBOM dependency graph has ${edgeTotal} edge(s); the source-derived closure has ` +
          `${derivedEdges} (${expected.counts.edges} + ${expected.counts.subject_root_edges} subject->root)`,
        );
      }
    }

    // EXACT subject identity.
    const subject = sbom.metadata?.component ?? {};
    const derivedSubject = JSON.parse(expectedText).metadata?.component ?? {};
    for (const field of ['bom-ref', 'type', 'name', 'version', 'purl', 'description']) {
      if (canonical(subject[field]) !== canonical(derivedSubject[field])) {
        problems.push(
          `C16 target ${name} SBOM subject '${field}' is ${JSON.stringify(subject[field])}, ` +
          `derived ${JSON.stringify(derivedSubject[field])}`,
        );
      }
    }

    // EXACT metadata-property multiset — no missing, duplicate, conflicting or additional.
    const props = Array.isArray(sbom.metadata?.properties) ? sbom.metadata.properties : null;
    if (props === null) {
      problems.push(`C16 target ${name} SBOM has no metadata.properties array`);
    } else {
      const byName = ownMap();
      for (const p of props) {
        if (typeof p?.name !== 'string') {
          problems.push(`C16 target ${name} SBOM has a metadata property with no name`);
          continue;
        }
        if (hasOwnKey(byName, p.name)) {
          problems.push(
            `C16 target ${name} SBOM declares '${p.name}' more than once` +
            (byName[p.name] === p.value ? '' : ` with CONFLICTING values ${JSON.stringify(byName[p.name])} and ${JSON.stringify(p.value)}`),
          );
          continue;
        }
        byName[p.name] = p.value;
      }
      const derivedProps = ownMap(
        (JSON.parse(expectedText).metadata?.properties ?? []).map((p) => [p.name, p.value]),
      );
      for (const prop of PROVENANCE_PROPERTIES) {
        if (!hasOwnKey(byName, prop)) {
          problems.push(`C16 target ${name} SBOM is missing the provenance property '${prop}'`);
        }
      }
      for (const prop of Object.keys(derivedProps)) {
        if (hasOwnKey(byName, prop) && byName[prop] !== derivedProps[prop]) {
          problems.push(
            `C16 target ${name} SBOM '${prop}' is ${JSON.stringify(byName[prop])}, derived ${JSON.stringify(derivedProps[prop])}`,
          );
        }
      }
      for (const prop of Object.keys(byName)) {
        if (!hasOwnKey(derivedProps, prop)) {
          problems.push(`C16 target ${name} SBOM declares an additional metadata property '${prop}'`);
        }
      }
      if (hasOwnKey(byName, 'eye:source-sha') && byName['eye:source-sha'] !== expectedSha) {
        problems.push(`C16 target ${name} SBOM 'eye:source-sha' is ${JSON.stringify(byName['eye:source-sha'])}, expected ${expectedSha}`);
      }
    }
  }

  if (Object.keys(sbomOwners).length !== want.length) {
    problems.push(`C16 produced ${Object.keys(sbomOwners).length} distinct SBOM(s) for ${want.length} target(s)`);
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The assertion
// ═══════════════════════════════════════════════════════════════════════════════

export function assertFinalManifests({ c15Dir, c16Dir, expectedSha, root = ROOT }) {
  const problems = [];

  // §E first: nothing read through a symlinked root is evidence.
  problems.push(...rootPathProblems('C15', c15Dir, 'supply-chain-manifest.json'));
  problems.push(...rootPathProblems('C16', c16Dir, 'closure-reconciliation.json'));
  if (problems.length > 0) return problems;

  // §B: tracked source must agree with itself before it can anchor anything.
  const contract = loadSourceContract(root);
  if (contract.problems.length > 0) {
    return contract.problems.map((p) => `tracked source contract: ${p}`);
  }

  const read = (label, path) => {
    if (!existsSync(path)) { problems.push(`${label}: ${path} does not exist`); return null; }
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
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
    if (c15.tree_clean_after_scanning !== true) problems.push('C15 did not record a clean worktree AFTER scanning');
    if (c15.worktree_unchanged_by_scanning !== true) problems.push('C15 did not prove the worktree was unchanged by scanning');

    // A run that read its dispositions from anywhere but the tracked governed document is
    // not final evidence, whatever else it proves.
    const GOVERNED_EXCLUSIONS = 'scripts/gate/scanner-exclusions.json';
    if (c15.scanner_exclusions?.file !== GOVERNED_EXCLUSIONS) {
      problems.push(
        `C15 read dispositions from ${JSON.stringify(c15.scanner_exclusions?.file)}, not the governed ` +
        `${GOVERNED_EXCLUSIONS}; an overridden run is never final evidence`,
      );
    }
    if (c15.scanner_exclusions?.is_governed_default === false) {
      problems.push('C15 recorded that its disposition document was overridden');
    }

    problems.push(...verifyCacheProvenance(c15));
    problems.push(...verifyScannerChain({ c15, contract }));

    const images = verifyImages({ c15, contract });
    problems.push(...images.problems);

    const { inventory } = expectedC15Inventory(contract.imageRefs.length);
    const c15Bindings = verifyBindings({
      label: 'C15', dir: c15Dir, bindings: c15.evidence_artifacts,
      allowed: C15_UNBOUND_ALLOWED, requiredInventory: inventory,
    });
    problems.push(...c15Bindings.problems);

    problems.push(...verifyStepClosure({
      c15, c15Dir, expectedSha, bindings: c15Bindings.byPath, contract, scanRefs: images.scanRefs, root,
    }).problems);

    problems.push(...verifyRawSemantics({ c15, c15Dir, contract, scanRefs: images.scanRefs, root }));

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
      if (posture.expected_sha !== expectedSha) problems.push(`C16 final_source_posture.expected_sha is ${JSON.stringify(posture.expected_sha)}`);
      if (posture.head_sha !== expectedSha) problems.push(`C16 final_source_posture.head_sha is ${JSON.stringify(posture.head_sha)}`);
      if (posture.worktree_clean !== true) problems.push('C16 did not record a clean worktree');
    }

    const c16Bindings = verifyBindings({
      label: 'C16', dir: c16Dir, bindings: c16.evidence_artifacts, allowed: C16_UNBOUND_ALLOWED,
      requiredInventory: [
        ...C16_REQUIRED_REPORTS,
        ...[...PHASE0_TARGET_IDS].sort().map((n) => c16.targets?.[n]?.sbom_file).filter((f) => typeof f === 'string'),
      ],
    });
    problems.push(...c16Bindings.problems);

    problems.push(...verifyC16FromSource({
      c16, c16Dir, expectedSha, bindings: c16Bindings.byPath, root,
    }));

    if (!Array.isArray(c16.vulnerable_residuals) || c16.vulnerable_residuals.length !== 0) {
      problems.push('C16 recorded a vulnerable residual');
    }
    const gov = c16.governed_exclusions;
    if (!Array.isArray(gov?.rejected) || gov.rejected.length !== 0) problems.push('C16 recorded a rejected closure exclusion');
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
  const contract = loadSourceContract();
  const c15 = JSON.parse(readFileSync(join(c15Dir, 'supply-chain-manifest.json'), 'utf8'));
  const c16 = JSON.parse(readFileSync(join(c16Dir, 'closure-reconciliation.json'), 'utf8'));
  console.log(`final mode confirmed for C15 and C16 at ${expectedSha}`);
  console.log(`  images: ${contract.imageRefs.length} from docker-compose.yml, agreeing with conformance.manifest.json`);
  console.log(`  C15 steps: ${c15.steps.length} normal + ${c15.trivy_cache_acquisition.steps.length} acquisition, each with contract-exact normalized argv`);
  console.log(`  C15 outputs: ${c15.evidence_artifacts.length} bound, EQUAL to the ${contract.expectedInventory.length} the source contract derives`);
  console.log('  C15 image findings RECONSTRUCTED from the delivered raw trivy bytes and re-reconciled against the tracked dispositions');
  console.log('  C15 cache recomputed over the exact tracked entry set, before === after');
  console.log(`  C16 SBOMs byte-identical to the deterministic source-derived generation for ${Object.keys(c16.targets).sort().join(', ')}`);
}
