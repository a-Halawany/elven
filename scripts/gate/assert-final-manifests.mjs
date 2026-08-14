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
import { spawnSync } from 'node:child_process';
import { PackageURL } from 'packageurl-js';
import { npmPurl } from './lib/lock-closure.mjs';

import {
  loadSourceContract, expectedStepContract, normalizeArgv, expectedC15Inventory,
  imageStepIdsFor, streamFilesFor, canonical, ownMap, hasOwnKey, ociIndexFileFor,
  C15_NORMAL_STEPS, C15_ACQUISITION_STEPS, C15_REQUIRED_REPORTS, C16_REQUIRED_REPORTS,
  CACHE_ENTRY_PATHS, SHA256_HEX, ARGV_TOKENS, CANDIDATE_ROOT_TOKEN,
} from './lib/verification-contract.mjs';
import { deriveC16Expectation } from './generate-closures.mjs';
import { candidateSourceManifest } from './lib/candidate-source.mjs';
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

function verifyImages({ c15, c15Dir, contract }) {
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
    // ── §A1: DERIVE THE CHILD FROM THE SHIPPED RAW INDEX BYTES ────────────────────
    // R3.4 read `resolution.children` — the producer's own summary — so replacing the child
    // digest, the scan reference and the argv together was perfectly self-consistent and was
    // accepted. The index bytes are now shipped and bound; the digest is recomputed from them,
    // the child is parsed out of them, and the summary is checked AGAINST that, never used as it.
    const indexRel = ociIndexFileFor(index);
    const { bytes: indexBytes, problem: indexProblem } = readMember(c15Dir, indexRel);
    if (indexProblem !== null) {
      problems.push(`C15 raw OCI index '${indexRel}' ${indexProblem}; the scanned child cannot be derived`);
      scanRefs.push(null);
      return;
    }
    const recomputed = `sha256:${sha256(indexBytes)}`;
    if (recomputed !== digest) {
      problems.push(
        `C15 raw OCI index '${indexRel}' hashes to ${recomputed}, but the CONFIGURED reference ` +
        `pins ${digest}; these are not the bytes the reference names`,
      );
      scanRefs.push(null);
      return;
    }
    let indexDoc;
    try {
      indexDoc = JSON.parse(indexBytes.toString('utf8'));
    } catch (e) {
      problems.push(`C15 raw OCI index '${indexRel}' is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
      scanRefs.push(null);
      return;
    }
    const manifests = Array.isArray(indexDoc.manifests) ? indexDoc.manifests : null;
    if (manifests === null) {
      problems.push(`C15 raw OCI index '${indexRel}' declares no manifests array`);
      scanRefs.push(null);
      return;
    }
    const derivedChildren = manifests.filter((m) => {
      const os = m?.platform?.os;
      const arch = m?.platform?.architecture;
      const attestation = os === 'unknown' && arch === 'unknown';
      return !attestation && os === 'linux' && arch === 'amd64';
    });
    if (derivedChildren.length !== 1) {
      problems.push(
        `C15 raw OCI index '${indexRel}' yields ${derivedChildren.length} non-attestation ` +
        `linux/amd64 children; exactly 1 is required`,
      );
      scanRefs.push(null);
      return;
    }
    const derivedRef = `${ref.slice(0, ref.indexOf('@'))}@${derivedChildren[0].digest}`;
    if (r.scan_ref !== derivedRef) {
      problems.push(
        `C15 resolution ${index} scan_ref ${JSON.stringify(r.scan_ref)} is not the linux/amd64 child ` +
        `derived from the shipped index bytes (${derivedRef})`,
      );
    }
    if (r.resolution?.target_digest !== undefined && r.resolution.target_digest !== derivedChildren[0].digest) {
      problems.push(
        `C15 resolution ${index} reports target_digest ${JSON.stringify(r.resolution.target_digest)}, ` +
        `but the shipped index bytes yield ${derivedChildren[0].digest}`,
      );
    }
    if (r.raw_index_file !== undefined && r.raw_index_file !== indexRel) {
      problems.push(`C15 resolution ${index} names raw_index_file ${JSON.stringify(r.raw_index_file)}, expected '${indexRel}'`);
    }
    // The expectation is the DERIVED reference, never the reported one.
    scanRefs.push(derivedRef);
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

/**
 * §A3: THE SCANNED CANDIDATE IS RECOMPUTED, NOT READ OUT OF THE EVIDENCE.
 *
 * R3.4 took the expected repository root from the recorded `--source` argument, so rewriting
 * every recorded scan root to `/attacker/decoy-source` was self-consistent and accepted. The
 * scanners now take source-owned RELATIVE arguments, so there is no absolute path in argv to
 * rewrite, and the subject is identified by a manifest recomputed here from the verifier's own
 * checkout of the expected SHA.
 */
function verifyCandidateSource({ c15, root, expectedSha }) {
  const problems = [];
  const claimed = c15.candidate_source;
  if (claimed === null || claimed === undefined || typeof claimed !== 'object') {
    problems.push('C15 recorded no candidate_source manifest, so the scanned subject is unidentified');
    return problems;
  }
  if (claimed.ok !== true) {
    problems.push(`C15 candidate_source did not compute: ${claimed.error ?? 'unknown'}`);
    return problems;
  }
  if (!SHA256_HEX.test(String(claimed.digest))) {
    problems.push('C15 candidate_source has no valid digest');
    return problems;
  }
  if (claimed.expected_sha !== undefined && claimed.expected_sha !== null && claimed.expected_sha !== expectedSha) {
    problems.push(`C15 candidate_source binds ${JSON.stringify(claimed.expected_sha)}, not the expected ${expectedSha}`);
  }
  const after = c15.candidate_source_after;
  if (after?.ok !== true || after.digest !== claimed.digest) {
    problems.push(
      `C15 candidate source changed during scanning (${claimed.digest} → ${after?.digest ?? 'absent'})`,
    );
  }
  // §4: the verifier's own checkout must BE the expected candidate before its manifest means
  // anything. Recomputing against some other commit would compare the wrong thing.
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const headSha = head.status === 0 ? head.stdout.trim() : null;
  if (headSha !== expectedSha) {
    problems.push(
      `the verifier's checkout is at ${JSON.stringify(headSha)}, not the expected ${expectedSha}; ` +
      'the candidate-source manifest cannot be recomputed against a different commit',
    );
    return problems;
  }

  // RECOMPUTE from the verifier's own tree. Equality means the bytes scanned are the bytes here.
  const recomputed = candidateSourceManifest(root);
  if (recomputed.ok !== true) {
    problems.push(`the verifier could not enumerate its own candidate: ${recomputed.error}`);
    return problems;
  }
  if (recomputed.digest !== claimed.digest) {
    problems.push(
      `C15 scanned a DIFFERENT candidate: the evidence records ${claimed.digest} ` +
      `(${claimed.file_count} files / ${claimed.total_bytes}B) but this checkout of ${expectedSha} ` +
      `computes ${recomputed.digest} (${recomputed.file_count} files / ${recomputed.total_bytes}B)`,
    );
  }
  return problems;
}

function argvPathsFor({ c15, root, producerOutDir }) {
  const staged = c15.staged_scanner_binaries ?? {};
  return {
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
    // which is stronger than a self-declared label anyway. Their tool_version IS required —
    // see the mandatory check below, which applies to both kinds.
    if (isNormal && step.tool !== want.tool) {
      problems.push(`${label} '${step.id}' was run by ${JSON.stringify(step.tool)}, expected ${JSON.stringify(want.tool)}`);
    }
    if (isNormal && step.policy !== want.policy) {
      problems.push(`${label} '${step.id}' has policy ${JSON.stringify(step.policy)}, expected ${JSON.stringify(want.policy)}`);
    }
    // §4: THE EXECUTION DIRECTORY IS GOVERNED. R3.4.1 ignored `cwd` entirely, so rewriting
    // every receipt to /attacker/decoy-source passed. A normal step records the canonical
    // candidate-root token and nothing else; an acquisition step records no cwd at all.
    if (isNormal) {
      if (!hasOwnKey(step, 'cwd')) {
        problems.push(`${label} '${step.id}' records no cwd; where it executed is not optional`);
      } else if (step.cwd !== CANDIDATE_ROOT_TOKEN) {
        problems.push(
          `${label} '${step.id}' cwd is ${JSON.stringify(step.cwd)}, expected the canonical ` +
          `${JSON.stringify(CANDIDATE_ROOT_TOKEN)} — an absolute or alternate path is not the candidate root`,
        );
      }
    } else if (hasOwnKey(step, 'cwd') && step.cwd !== null && step.cwd !== undefined) {
      problems.push(`${label} '${step.id}' records cwd ${JSON.stringify(step.cwd)}; acquisition steps declare none`);
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
    // §A4: MANDATORY and exact. R3.4 skipped the check whenever the field was absent, so
    // deleting it passed — the one mutation guaranteed to work on a receipt you control.
    const wantVersion = hasOwnKey(contract.toolVersions, want.tool) ? contract.toolVersions[want.tool] : null;
    if (wantVersion !== null) {
      if (!hasOwnKey(step, 'tool_version') || step.tool_version === null || step.tool_version === undefined) {
        problems.push(`${label} '${step.id}' records no tool_version; the version that ran is not optional`);
      } else if (typeof step.tool_version !== 'string' || step.tool_version.length === 0) {
        problems.push(`${label} '${step.id}' tool_version is ${JSON.stringify(step.tool_version)}, not a version string`);
      } else if (step.tool_version !== wantVersion) {
        problems.push(`${label} '${step.id}' tool_version is ${JSON.stringify(step.tool_version)}, expected the pinned ${wantVersion}`);
      }
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
/**
 * C16-R3.4.3 §A — ONE shared, source-owned validator for a trivy Results array.
 *
 * R3.4.2 asked only that results be objects carrying a Target and a Class, so
 * `[{"Target":"pnpm-lock.yaml","Class":"lang-pkgs"}]` — no Type, no Packages, no package
 * identity, no evidence anything was analysed — passed as coverage, as did image `Results: []`
 * and `Results: [{}]`. A result row that names a file without listing what was found in it is
 * a label, not a scan.
 */

/**
 * R3.4.4 SS-A: EVERY package, with a REAL PURL parser.
 *
 * R3.4.3 sampled the first five packages and asked only that a PURL be a nonempty string.
 * So truncating the real 229-package result to 5 - or to 1 - passed, and a PURL saying
 * anything at all passed. A sample cannot establish a property of a set, and a string is
 * not an identity.
 *
 * Identity is now parsed with the same exact-pinned packageurl-js the C16 closure uses, so
 * the verifier and the SBOM generator cannot disagree about what a package IS.
 */
// Keyed by the RESULT's Type, which is what trivy reports. Each row says which ecosystem the
// PURLs must belong to and which analyzer trivy names in `AnalyzedBy` - and the two are not
// the same string: an `alpine` result carries `apk` packages produced by the `apk` analyzer,
// while a `pnpm` result carries `npm` packages produced by `pnpm`.
/**
 * R3.4.5 SS-3: ONE TOTAL, CODE-OWNED RESULT CONTRACT.
 *
 * R3.4.4 kept three separate partial allowlists - `IMAGE_CLASS_TYPES` for image classes,
 * `PURL_TYPE_FOR_ANALYZER` for ecosystems, `ANALYZED_BY_FOR_TYPE` for analyzers - each keyed
 * differently and each permitting combinations the others did not cover. A `lang-pkgs`/`jar`
 * result had an allowed class and type but no ecosystem or analyzer mapping, so its packages
 * were validated against nothing.
 *
 * There is now exactly one table. It is keyed by the pair the scanner actually reports, and it
 * is TOTAL: a (Class, Type) absent from it is rejected outright rather than falling through to
 * a laxer path. Adding a scanner target means adding a row here, deliberately.
 */
const RESULT_CONTRACTS = Object.freeze({
  'lang-pkgs pnpm': Object.freeze({ purlType: 'npm', analyzedBy: 'pnpm' }),
  'lang-pkgs gobinary': Object.freeze({ purlType: 'golang', analyzedBy: 'gobinary' }),
  'os-pkgs alpine': Object.freeze({ purlType: 'apk', analyzedBy: 'apk' }),
});
const contractKey = (cls, type) => `${cls} ${type}`;
const contractFor = (cls, type) => {
  const k = contractKey(cls, type);
  return hasOwnKey(RESULT_CONTRACTS, k) ? RESULT_CONTRACTS[k] : null;
};

/**
 * The package NAME a PURL denotes, which is ecosystem-specific and not simply
 * `namespace/name`. For npm and golang the namespace is part of the name
 * (`@nestjs/common`, `github.com/tianon/gosu`); for apk the namespace is the DISTRO
 * (`pkg:apk/alpine/busybox`), so the package is just `busybox`.
 */
const NAMESPACE_IS_DISTRO = Object.freeze(['apk', 'deb', 'rpm']);
const purlPackageName = (u) => (
  u.namespace && !NAMESPACE_IS_DISTRO.includes(u.type) ? `${u.namespace}/${u.name}` : u.name
);

/**
 * R3.4.5 SS-2: a package is identified by its COMPLETE canonical PURL.
 *
 * R3.4.4 reduced identity to `name@version` before comparing against source, which discards
 * qualifiers and subpath entirely: `pkg:apk/alpine/busybox@1.37.0-r20?arch=x86_64` and the same
 * package claimed for another architecture, or an npm package with a `?repository_url=` pointing
 * somewhere else, collapsed to the same string and compared equal. The whole canonical string is
 * the identity now, and it is what is compared against the source-derived sets.
 */
function packageProblems(label, at, pkg, { contract, seen, purls }) {
  const problems = [];
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    problems.push(`C15 ${label} ${at} is not an object`);
    return problems;
  }
  if (typeof pkg.Name !== 'string' || pkg.Name.length === 0) {
    problems.push(`C15 ${label} ${at} has no Name`);
  }
  if (typeof pkg.Version !== 'string' || pkg.Version.length === 0) {
    problems.push(`C15 ${label} ${at} has no Version`);
  }
  // SS-3: EVERY package states its analyzer, and it must be the one this result's contract
  // names. An absent field is a failure, not a pass.
  if (pkg.AnalyzedBy !== contract.analyzedBy) {
    problems.push(
      `C15 ${label} ${at} AnalyzedBy is ${JSON.stringify(pkg.AnalyzedBy)}, expected `
      + `${JSON.stringify(contract.analyzedBy)}; the package was not produced by the analyzer `
      + 'this result declares',
    );
  }
  const raw = pkg.Identifier?.PURL;
  if (typeof raw !== 'string' || raw.length === 0) {
    problems.push(`C15 ${label} ${at} has no Identifier.PURL; the package has no identity`);
    return problems;
  }
  let parsed;
  try {
    parsed = PackageURL.fromString(raw);
  } catch (e) {
    problems.push(`C15 ${label} ${at} PURL ${JSON.stringify(raw)} does not parse: ${e instanceof Error ? e.message : e}`);
    return problems;
  }
  if (parsed.toString() !== raw) {
    problems.push(
      `C15 ${label} ${at} PURL ${JSON.stringify(raw)} is not canonical; it round-trips to `
      + `${JSON.stringify(parsed.toString())}`,
    );
  }
  if (parsed.type !== contract.purlType) {
    problems.push(
      `C15 ${label} ${at} PURL type is ${JSON.stringify(parsed.type)}, but a `
      + `${JSON.stringify(contract.analyzedBy)} result carries ${JSON.stringify(contract.purlType)} packages`,
    );
  }
  const purlName = purlPackageName(parsed);
  if (typeof pkg.Name === 'string' && purlName !== pkg.Name) {
    problems.push(`C15 ${label} ${at} PURL names ${JSON.stringify(purlName)} but the package is ${JSON.stringify(pkg.Name)}`);
  }
  if (typeof pkg.Version === 'string' && parsed.version !== pkg.Version) {
    problems.push(`C15 ${label} ${at} PURL version is ${JSON.stringify(parsed.version)} but the package is ${JSON.stringify(pkg.Version)}`);
  }
  // Duplicate detection is on the package's FULL identity, not its PURL.
  //
  // A canonical PURL is NOT unique within a lockfile: `ajv-formats@3.0.1` resolves twice, once
  // against each `ajv` it peers with, and both are real distinct installations that trivy
  // reports separately. Keying on the PURL alone would call the second a forgery. Trivy's `ID`
  // carries the lock key including peer context, so it distinguishes them; where it is absent
  // the PURL is the best identity available and is used instead.
  // The canonical PURL is collected SEPARATELY, for the source-coverage comparison: coverage
  // asks which packages were analysed, and two peer-context installations of one package cover
  // the same package.
  purls.add(raw);
  const identity = typeof pkg.ID === 'string' && pkg.ID.length > 0 ? `${pkg.ID}\u0000${raw}` : raw;
  if (seen.has(identity)) {
    problems.push(`C15 ${label} ${at} repeats the package identity ${identity.replace('\u0000', ' / ')}; a scan reports each installation once`);
  } else {
    seen.add(identity);
  }
  return problems;
}

/** Every package in a result. No sampling. */
function packagesProblems(label, where, packages, { contract }) {
  const problems = [];
  const purls = new Set();
  const seen = new Set();
  if (!Array.isArray(packages)) {
    problems.push(`C15 ${label} ${where} Packages is ${typeof packages}, not an array`);
    return { problems, purls };
  }
  if (packages.length === 0) {
    problems.push(`C15 ${label} ${where} lists ZERO packages; a result that analysed nothing is not coverage`);
    return { problems, purls };
  }
  for (const [i, pkg] of packages.entries()) {
    problems.push(...packageProblems(label, `${where} Packages[${i}]`, pkg, { contract, seen, purls }));
  }
  return { problems, purls };
}

/**
 * R3.4.5 SS-4: every array-valued key other than `Packages` must be EMPTY, whether or not the
 * verifier recognises it.
 *
 * R3.4.4 enumerated the three finding classes it knew about. A result carrying findings under
 * any other key - a new scanner class, a renamed one - was simply not looked at on the
 * filesystem path. The rule is now stated the other way round: anything nonempty that is not
 * the package list is an unreconciled claim.
 */
function nonPackageArrayProblems(label, at, r, { context }) {
  const problems = [];
  for (const key of Object.keys(r)) {
    if (key === 'Packages') continue;
    const val = r[key];
    if (!Array.isArray(val) || val.length === 0) continue;
    problems.push(
      `C15 ${label} ${at} carries ${val.length} entr(ies) under ${JSON.stringify(key)}; ${context}`,
    );
  }
  return problems;
}

/** SS-B5: a scan reports each (Target, Class, Type) exactly once. */
function duplicateResultProblems(label, results) {
  const problems = [];
  const seen = new Set();
  for (const [i, r] of results.entries()) {
    if (r === null || typeof r !== 'object') continue;
    const key = `${r.Target} ${r.Class} ${r.Type}`;
    if (seen.has(key)) {
      problems.push(
        `C15 ${label} Results[${i}] repeats the result identity (${JSON.stringify(r.Target)}, `
        + `${JSON.stringify(r.Class)}, ${JSON.stringify(r.Type)}); a duplicate can carry contradictory findings`,
      );
    }
    seen.add(key);
  }
  return problems;
}

/**
 * R3.4.5 SS-4: the filesystem result set is EXACTLY what the source contract says it is.
 *
 * The scan is invoked on the candidate root and the only manifest the repository resolves is
 * `pnpm-lock.yaml`, so a genuine receipt has exactly one result. R3.4.4 required that result to
 * be PRESENT and let anything else ride alongside it, so an extra fabricated result - a second
 * lockfile, a decoy target - was never questioned.
 */
const FILESYSTEM_RESULT_SET = Object.freeze([
  Object.freeze({ Target: 'pnpm-lock.yaml', Class: 'lang-pkgs', Type: 'pnpm' }),
]);

function filesystemCoverageProblems(label, purls, sourceSets) {
  const problems = [];
  if (sourceSets === null) return problems;
  const { lockUniversePurls, productionRegistryPurls } = sourceSets;
  const invented = [...purls].filter((u) => !lockUniversePurls.has(u)).sort();
  if (invented.length > 0) {
    problems.push(
      `C15 ${label} reports ${invented.length} package(s) whose canonical PURL is absent from the `
      + `${lockUniversePurls.size}-package universe derived from pnpm-lock.yaml, e.g. `
      + `${invented.slice(0, 3).join(', ')}`,
    );
  }
  const omitted = [...productionRegistryPurls].filter((u) => !purls.has(u)).sort();
  if (omitted.length > 0) {
    problems.push(
      `C15 ${label} omits ${omitted.length} of the ${productionRegistryPurls.size} production `
      + `registry package(s) the C16 closure derives, e.g. ${omitted.slice(0, 3).join(', ')}. A scan `
      + 'that missed part of the shipped closure did not cover it.',
    );
  }
  return problems;
}

function filesystemResultsProblems(label, results, sourceSets) {
  const problems = [];
  if (!Array.isArray(results)) {
    problems.push(`C15 ${label} Results is ${typeof results}, not an array`);
    return problems;
  }
  problems.push(...duplicateResultProblems(label, results));

  // Exact set equality against the source-owned expectation, in both directions.
  const seen = results.map((r) => (r === null || typeof r !== 'object'
    ? '(not an object)'
    : `${r.Target} [${r.Class}/${r.Type}]`));
  const want = FILESYSTEM_RESULT_SET.map((e) => `${e.Target} [${e.Class}/${e.Type}]`);
  if (seen.length !== want.length || [...seen].sort().join(' | ') !== [...want].sort().join(' | ')) {
    problems.push(
      `C15 ${label} Results is ${JSON.stringify(seen)}, but the source contract derives exactly `
      + `${JSON.stringify(want)}`,
    );
    return problems;
  }

  let purls = new Set();
  for (const [i, r] of results.entries()) {
    const at = `Results[${i}]`;
    const contract = contractFor(r.Class, r.Type);
    if (contract === null) {
      problems.push(`C15 ${label} ${at} has no result contract for (${r.Class}, ${r.Type})`);
      continue;
    }
    const res = packagesProblems(label, at, r.Packages, { contract });
    problems.push(...res.problems);
    purls = res.purls;
    // The filesystem command scans HIGH,CRITICAL and its blocking step PASSED, so a genuine
    // receipt reports nothing at all - under any key.
    problems.push(...nonPackageArrayProblems(label, at, r, {
      context: 'the blocking filesystem scan PASSED at HIGH,CRITICAL, so a genuine receipt reports none',
    }));
  }
  problems.push(...filesystemCoverageProblems(label, purls, sourceSets));
  return problems;
}

function filesystemReportProblems(label, report, { expectedSha, sourceSets }) {
  const problems = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    problems.push(`C15 ${label} is not a JSON object`);
    return problems;
  }
  if (report.SchemaVersion !== 2) {
    problems.push(`C15 ${label} SchemaVersion is ${JSON.stringify(report.SchemaVersion)}, expected 2`);
  }
  // The scanner is invoked with the source-owned relative target, so this is the ONLY name a
  // genuine filesystem receipt can carry.
  if (report.ArtifactName !== '.') {
    problems.push(`C15 ${label} ArtifactName is ${JSON.stringify(report.ArtifactName)}, expected "." — the candidate root`);
  }
  if (report.ArtifactType !== 'repository') {
    problems.push(`C15 ${label} ArtifactType is ${JSON.stringify(report.ArtifactType)}, expected "repository"`);
  }
  const meta = report.Metadata;
  if (meta === null || typeof meta !== 'object') {
    problems.push(`C15 ${label} has no Metadata, so it identifies no repository`);
  } else if (meta.Commit !== expectedSha) {
    problems.push(
      `C15 ${label} Metadata.Commit is ${JSON.stringify(meta.Commit)}, but the expected candidate ` +
      `is ${expectedSha}; the scan describes a different source`,
    );
  }
  problems.push(...filesystemResultsProblems(label, report.Results, sourceSets));
  return problems;
}

/**
 * R3.4.5 SS-5: image results, under the one total contract.
 *
 * Every result must resolve to a row of RESULT_CONTRACTS, and the row then binds three things
 * that R3.4.4 checked separately or not at all: the analyzer every package states, the
 * ecosystem every PURL belongs to, and - for the OS result - the family the image itself
 * declares. A postgres image declaring `alpine` whose os-pkgs result claims Type `debian`,
 * or whose packages carry `golang` PURLs, is a report contradicting itself.
 */
const CANONICAL_SEVERITIES = Object.freeze(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function vulnerabilityProblems(label, at, v, { packagePurls }) {
  const problems = [];
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    problems.push(`C15 ${label} ${at} is not an object`);
    return problems;
  }
  if (typeof v.VulnerabilityID !== 'string' || !/^[A-Z][A-Z0-9-]{2,}-/.test(v.VulnerabilityID)) {
    problems.push(`C15 ${label} ${at} VulnerabilityID ${JSON.stringify(v.VulnerabilityID)} is not an advisory identifier`);
  }
  if (typeof v.PkgName !== 'string' || v.PkgName.length === 0) {
    problems.push(`C15 ${label} ${at} has no PkgName`);
  }
  if (typeof v.InstalledVersion !== 'string' || v.InstalledVersion.length === 0) {
    problems.push(`C15 ${label} ${at} has no InstalledVersion`);
  }
  if (!CANONICAL_SEVERITIES.includes(v.Severity)) {
    problems.push(
      `C15 ${label} ${at} Severity ${JSON.stringify(v.Severity)} is not one of `
      + `${CANONICAL_SEVERITIES.join(', ')}; trivy emits canonical upper-case severities`,
    );
  }
  const raw = v.PkgIdentifier?.PURL;
  if (typeof raw !== 'string' || raw.length === 0) {
    problems.push(`C15 ${label} ${at} has no PkgIdentifier.PURL, so the finding names no package`);
    return problems;
  }
  let parsed;
  try {
    parsed = PackageURL.fromString(raw);
  } catch (e) {
    problems.push(`C15 ${label} ${at} PURL ${JSON.stringify(raw)} does not parse: ${e instanceof Error ? e.message : e}`);
    return problems;
  }
  // The COMPLETE canonical PURL must be one the SAME result listed among its packages.
  if (!packagePurls.has(parsed.toString())) {
    problems.push(
      `C15 ${label} ${at} reports a vulnerability in ${parsed.toString()}, which this result does `
      + 'not list among its packages',
    );
  }
  if (typeof v.PkgName === 'string' && purlPackageName(parsed) !== v.PkgName) {
    problems.push(`C15 ${label} ${at} PkgName is ${JSON.stringify(v.PkgName)} but its PURL names ${JSON.stringify(purlPackageName(parsed))}`);
  }
  if (typeof v.InstalledVersion === 'string' && parsed.version !== v.InstalledVersion) {
    problems.push(
      `C15 ${label} ${at} InstalledVersion is ${JSON.stringify(v.InstalledVersion)} but its PURL `
      + `says ${JSON.stringify(parsed.version)}`,
    );
  }
  return problems;
}

/**
 * A secret in a shipped image fails closed. There is deliberately NO secret-disposition
 * mechanism: governing one would mean recording, in a tracked document, that a particular
 * credential is acceptable, and that needs its own typed mechanism and its own review rather
 * than a reuse of the vulnerability dispositions.
 */
function imageFindingArrayProblems(label, at, r) {
  const problems = [];
  for (const key of Object.keys(r)) {
    if (key === 'Packages' || key === 'Vulnerabilities') continue;
    const val = r[key];
    if (!Array.isArray(val) || val.length === 0) continue;
    if (key === 'Secrets') {
      problems.push(
        `C15 ${label} ${at} reports ${val.length} SECRET finding(s). There is no secret-disposition `
        + 'mechanism, so a secret in a shipped image fails closed rather than being absorbed by the '
        + 'vulnerability dispositions.',
      );
      continue;
    }
    problems.push(
      `C15 ${label} ${at} carries ${val.length} entr(ies) under ${JSON.stringify(key)}, which the `
      + 'image reconciliation does not cover; an unreconciled finding cannot be shown to be governed',
    );
  }
  return problems;
}

function imageResultsProblems(label, results, { expectedRef, osFamily, osName }) {
  const problems = [];
  if (!Array.isArray(results)) {
    problems.push(`C15 ${label} Results is ${typeof results}, not an array`);
    return problems;
  }
  if (results.length === 0) {
    problems.push(`C15 ${label} Results is EMPTY; the image was not analysed`);
    return problems;
  }
  problems.push(...duplicateResultProblems(label, results));

  for (const [i, r] of results.entries()) {
    const at = `Results[${i}]`;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      problems.push(`C15 ${label} ${at} is not an object`);
      continue;
    }
    if (Object.keys(r).length === 0) {
      problems.push(`C15 ${label} ${at} is an EMPTY object; it records no scan at all`);
      continue;
    }
    for (const field of ['Target', 'Class', 'Type']) {
      if (typeof r[field] !== 'string' || r[field].length === 0) {
        problems.push(`C15 ${label} ${at} has no ${field}`);
      }
    }
    const contract = contractFor(r.Class, r.Type);
    if (contract === null) {
      problems.push(
        `C15 ${label} ${at} has no result contract for (${JSON.stringify(r.Class)}, `
        + `${JSON.stringify(r.Type)}); this gate does not analyse that combination`,
      );
      continue;
    }
    // SS-5: the OS result's type IS the family the image declares. A contradiction between
    // them means one of the two is describing a different image.
    if (r.Class === 'os-pkgs' && typeof osFamily === 'string' && r.Type !== osFamily) {
      problems.push(
        `C15 ${label} ${at} os-pkgs Type is ${JSON.stringify(r.Type)} but Metadata.OS.Family is `
        + `${JSON.stringify(osFamily)}; the report contradicts itself`,
      );
    }
    const res = packagesProblems(label, at, r.Packages, { contract });
    problems.push(...res.problems);
    for (const [j, v] of (Array.isArray(r.Vulnerabilities) ? r.Vulnerabilities : []).entries()) {
      problems.push(...vulnerabilityProblems(label, `${at} Vulnerabilities[${j}]`, v, {
        packagePurls: res.purls,
      }));
    }
    problems.push(...imageFindingArrayProblems(label, at, r));
  }

  const osResults = results.filter((r) => r?.Class === 'os-pkgs');
  if (osResults.length !== 1) {
    problems.push(
      `C15 ${label} has ${osResults.length} 'os-pkgs' result(s); a single image has exactly one `
      + 'operating-system package set',
    );
    return problems;
  }
  if (typeof osFamily === 'string' && typeof osName === 'string') {
    const exactTarget = `${expectedRef} (${osFamily} ${osName})`;
    if (osResults[0].Target !== exactTarget) {
      problems.push(
        `C15 ${label} os-pkgs target is ${JSON.stringify(osResults[0].Target)}, expected exactly `
        + `${JSON.stringify(exactTarget)}. The analysed packages belong to another image.`,
      );
    }
  }
  return problems;
}

/**
 * §2 — EXACT CONTAINER-IMAGE IDENTITY.
 *
 * R3.4.1 asked whether `ArtifactName` CONTAINED the derived digest, so
 * `attacker.example/decoy@sha256:<correct-child-digest>` passed. Equality now, in three places.
 */
function imageReportProblems(label, report, { expectedRef }) {
  const problems = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    problems.push(`C15 ${label} is not a JSON object`);
    return problems;
  }
  if (report.SchemaVersion !== 2) {
    problems.push(`C15 ${label} SchemaVersion is ${JSON.stringify(report.SchemaVersion)}, expected 2`);
  }
  if (report.ArtifactType !== 'container_image') {
    problems.push(`C15 ${label} ArtifactType is ${JSON.stringify(report.ArtifactType)}, expected "container_image"`);
  }
  if (expectedRef === null || expectedRef === undefined) {
    problems.push(`C15 ${label} has no derived scan reference to compare against`);
    return problems;
  }
  if (report.ArtifactName !== expectedRef) {
    problems.push(
      `C15 ${label} ArtifactName is ${JSON.stringify(report.ArtifactName)}; the derived child is ` +
      `${expectedRef}. A name that merely contains the digest is a different image.`,
    );
  }
  const meta = report.Metadata;
  if (meta === null || typeof meta !== 'object') {
    problems.push(`C15 ${label} has no Metadata`);
    return problems;
  }
  if (meta.Reference !== expectedRef) {
    problems.push(`C15 ${label} Metadata.Reference is ${JSON.stringify(meta.Reference)}, expected ${expectedRef}`);
  }
  const digests = Array.isArray(meta.RepoDigests) ? meta.RepoDigests : null;
  if (digests === null) {
    problems.push(`C15 ${label} Metadata.RepoDigests is not an array`);
  } else if (!digests.includes(expectedRef)) {
    problems.push(`C15 ${label} Metadata.RepoDigests ${JSON.stringify(digests)} does not contain ${expectedRef}`);
  }
  // SS-B6: the OS identity is what ties the os-pkgs result to this image, so it must exist.
  const os = meta.OS;
  const osFamily = typeof os?.Family === 'string' && os.Family.length > 0 ? os.Family : null;
  const osName = typeof os?.Name === 'string' && os.Name.length > 0 ? os.Name : null;
  if (osFamily === null) problems.push(`C15 ${label} Metadata.OS.Family is missing; the image identifies no operating system`);
  if (osName === null) problems.push(`C15 ${label} Metadata.OS.Name is missing; the image identifies no OS release`);
  problems.push(...imageResultsProblems(label, report.Results, { expectedRef, osFamily, osName }));
  return problems;
}

/**
 * §3 — the human/table receipts are the SAME scan in another format, so they are parsed and
 * cross-checked. "Non-empty" is not a semantic check: `NOT A TRIVY REPORT` and
 * `AUDIT FAILED WITH HIDDEN VULNERABILITIES` both satisfied it.
 *
 * These forms remain raw scanner output rather than being regenerated, so what is asserted is
 * agreement with the authoritative JSON: same subject, and no blocking finding reported.
 */
/**
 * R3.4.4 SS-C: the table is compared as a MULTISET against the JSON, with counts.
 *
 * R3.4.3 looked up each JSON target in a Map built from the table rows and checked the count
 * cells were 0 or '-'. A forged FIRST row for the same target - `999 / 99 / 88` - was silently
 * overwritten by the genuine zero row that followed it, so the fabricated row was never seen.
 * A receipt is now parsed as an ordered list of rows and compared row-for-row.
 */
const TABLE_COLUMNS = Object.freeze(['Target', 'Type', 'Vulnerabilities', 'Secrets', 'Misconfigurations']);

function tableReceiptProblems(label, text, { jsonResults, kind }) {
  const problems = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    problems.push(`C15 ${label} is empty; the blocking ${kind} scan produced no receipt`);
    return problems;
  }
  if (!/^Report Summary\s*$/m.test(trimmed)) {
    problems.push(`C15 ${label} has no 'Report Summary' heading; it is not trivy table output`);
    return problems;
  }
  const rows = trimmed.split('\n').filter((l) => l.includes('│'));
  if (rows.length < 2) {
    problems.push(`C15 ${label} has ${rows.length} table row(s); a summary needs a header and at least one target`);
    return problems;
  }
  const cellsOf = (row) => row.split('│').map((c) => c.trim()).filter((c) => c.length > 0);
  const header = cellsOf(rows[0]);
  // Exact column ORDER, not merely presence: a reordered header means the cells beneath it
  // are being read as something other than what they are.
  if (header.length !== TABLE_COLUMNS.length || header.some((c, i) => c !== TABLE_COLUMNS[i])) {
    problems.push(
      `C15 ${label} header is ${JSON.stringify(header)}, expected exactly `
      + `${JSON.stringify([...TABLE_COLUMNS])} in that order`,
    );
    return problems;
  }

  // Every non-header row must PARSE. R3.4.3 filtered mismatched rows away, which is how a
  // malformed row became invisible rather than fatal.
  const dataRows = [];
  for (const [i, row] of rows.slice(1).entries()) {
    const cells = cellsOf(row);
    if (cells.length !== TABLE_COLUMNS.length) {
      problems.push(
        `C15 ${label} row ${i + 1} has ${cells.length} cell(s), not ${TABLE_COLUMNS.length}: `
        + `${JSON.stringify(row.slice(0, 100))}. A row the verifier cannot parse is not a row it may ignore.`,
      );
      continue;
    }
    dataRows.push(cells);
  }
  if (problems.length > 0) return problems;
  if (dataRows.length === 0) {
    problems.push(`C15 ${label} has no data row matching its header; the table is decorative`);
    return problems;
  }

  const seen = new Set();
  for (const cells of dataRows) {
    if (seen.has(cells[0])) {
      problems.push(
        `C15 ${label} lists '${cells[0]}' more than once; duplicate rows can carry contradictory counts `
        + 'and only one of them can be true',
      );
    }
    seen.add(cells[0]);
  }

  // Exact multiset comparison with the authoritative JSON, on (Target, Type).
  const tableKeys = dataRows.map((c) => `${c[0]} :: ${c[1]}`).sort();
  const jsonKeys = jsonResults.map((r) => `${r.Target} :: ${r.Type}`).sort();
  if (tableKeys.length !== jsonKeys.length || tableKeys.some((k, i) => k !== jsonKeys[i])) {
    problems.push(
      `C15 ${label} rows ${JSON.stringify(tableKeys)} do not equal the `
      + `JSON scan's ${JSON.stringify(jsonKeys)}; the receipts disagree`,
    );
    return problems;
  }

  // Counts, compared with the JSON arrays rather than pattern-matched.
  const byKey = new Map(jsonResults.map((r) => [`${r.Target} :: ${r.Type}`, r]));
  const COUNTED = { Vulnerabilities: 2, Secrets: 3, Misconfigurations: 4 };
  for (const cells of dataRows) {
    const r = byKey.get(`${cells[0]} :: ${cells[1]}`);
    if (r === undefined) continue;
    for (const [field, col] of Object.entries(COUNTED)) {
      const cell = cells[col];
      const jsonCount = Array.isArray(r[field]) ? r[field].length : 0;
      // '-' means the scanner did not run for that target, which is only consistent with the
      // JSON carrying no such array at all.
      if (cell === '-') {
        if (hasOwnKey(r, field)) {
          problems.push(
            `C15 ${label} row '${cells[0]}' reports ${field}='-' (not scanned) while the JSON scan `
            + `carries a ${field} array`,
          );
        }
        continue;
      }
      if (!/^\d+$/.test(cell)) {
        problems.push(`C15 ${label} row '${cells[0]}' ${field} cell ${JSON.stringify(cell)} is neither a count nor '-'`);
        continue;
      }
      if (Number(cell) !== jsonCount) {
        problems.push(
          `C15 ${label} row '${cells[0]}' reports ${field}=${cell} but the JSON scan reports `
          + `${jsonCount}; the receipts disagree`,
        );
      }
    }
  }
  return problems;
}

/**
 * §B — the bound stderr must prove which scanners were enabled. Deleting it removed all
 * evidence that vulnerability, misconfiguration and secret scanning ran, and R3.4.2 never
 * looked at it.
 */
const SCANNER_MARKERS = Object.freeze([
  { scanner: 'vulnerability', pattern: /\[vuln\]\s+Vulnerability scanning is enabled/ },
  { scanner: 'misconfiguration', pattern: /\[misconfig\]\s+Misconfiguration scanning is enabled/ },
  { scanner: 'secret', pattern: /\[secret\]\s+Secret scanning is enabled/ },
]);

function scannerCoverageProblems(label, stderrText, { scanners = ['vulnerability', 'misconfiguration', 'secret'] } = {}) {
  const problems = [];
  if (stderrText === null) {
    problems.push(`C15 ${label} is absent; without it nothing proves which scanners were enabled`);
    return problems;
  }
  if (stderrText.trim().length === 0) {
    problems.push(`C15 ${label} is EMPTY; a filesystem scan announces the scanners it enables`);
    return problems;
  }
  for (const { scanner, pattern } of SCANNER_MARKERS) {
    if (!scanners.includes(scanner)) continue;
    if (!pattern.test(stderrText)) {
      problems.push(`C15 ${label} carries no evidence that ${scanner} scanning was enabled`);
    }
  }
  return problems;
}

function auditHumanReceiptProblems(label, text) {
  const problems = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    problems.push(`C15 ${label} is empty; the blocking audit produced no receipt`);
    return problems;
  }
  // pnpm 11.9.0 emits EXACTLY this line for a clean tree. R3.4.2 accepted anything CONTAINING
  // the clean phrase, so appending "HIGH vulnerability found" passed.
  const CLEAN = 'No known vulnerabilities found';
  const normalized = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join('\n');
  if (normalized !== CLEAN) {
    problems.push(
      `C15 ${label} is not the exact clean pnpm receipt. A PASS run's human audit is `
      + `${JSON.stringify(CLEAN)} and nothing else; got ${JSON.stringify(normalized.slice(0, 80))}`
      + (normalized.length > 80 ? '…' : ''),
    );
  }
  return problems;
}

/**
 * R3.4.5 SS-6: the pnpm audit document is pinned to an EXACT schema.
 *
 * R3.4.4 read the fields it expected and ignored everything else, so a document could carry an
 * extra top-level key, an extra severity counter, or an advisory container beside a second
 * populated one, and the parts the verifier happened to read still said "clean". The shape is
 * now closed: exactly these keys, exactly these five counters, nothing else.
 *
 * What is NOT derived, stated rather than implied: pnpm's per-category `dependencies` /
 * `devDependencies` / `optionalDependencies` accounting is internal to pnpm and is not
 * reproduced from the lockfile here. Inventing a formula that happens to reproduce today's
 * three numbers would be an expectation defined by the evidence it checks. What IS derived and
 * asserted exactly is `totalDependencies`, which must equal the lockfile universe; the three
 * categories are required to be positive integers no larger than that total, and to cover it
 * between them.
 */
const AUDIT_TOP_LEVEL_KEYS = Object.freeze(['advisories', 'metadata']);
const AUDIT_METADATA_KEYS = Object.freeze([
  'vulnerabilities', 'dependencies', 'devDependencies', 'optionalDependencies', 'totalDependencies',
]);
const AUDIT_SEVERITIES = Object.freeze(['info', 'low', 'moderate', 'high', 'critical']);
const AUDIT_CATEGORIES = Object.freeze(['dependencies', 'devDependencies', 'optionalDependencies']);

const exactKeyProblems = (where, obj, expected) => {
  const got = Object.keys(obj).sort();
  const want = [...expected].sort();
  return got.join(',') === want.join(',')
    ? []
    : [`C15 dependency audit ${where} keys are ${JSON.stringify(got)}, expected exactly ${JSON.stringify(want)}`];
};

function auditConsistencyProblems(audit, { lockUniverseSize }) {
  const problems = [];
  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) {
    problems.push('C15 dependency audit is not a JSON object');
    return problems;
  }
  problems.push(...exactKeyProblems('top-level', audit, AUDIT_TOP_LEVEL_KEYS));

  const advisories = audit.advisories;
  if (advisories === null || typeof advisories !== 'object' || Array.isArray(advisories)) {
    problems.push(
      `C15 dependency audit advisories is ${Array.isArray(advisories) ? 'an ARRAY' : typeof advisories}; `
      + 'it must be a plain object',
    );
  } else if (Object.keys(advisories).length > 0) {
    problems.push(
      `C15 dependency audit carries ${Object.keys(advisories).length} advisory record(s) while the `
      + 'human receipt says the tree is clean',
    );
  }

  const meta = audit.metadata;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    problems.push('C15 dependency audit has no metadata object, so it describes no tree');
    return problems;
  }
  problems.push(...exactKeyProblems('metadata', meta, AUDIT_METADATA_KEYS));

  const counts = meta.vulnerabilities;
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) {
    problems.push('C15 dependency audit metadata has no vulnerabilities counters');
  } else {
    problems.push(...exactKeyProblems('metadata.vulnerabilities', counts, AUDIT_SEVERITIES));
    for (const sev of AUDIT_SEVERITIES) {
      const n = counts[sev];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
        problems.push(`C15 dependency audit ${sev} counter is ${JSON.stringify(n)}, not a non-negative integer`);
      } else if (n !== 0) {
        problems.push(
          `C15 dependency audit reports ${n} ${sev} finding(s) while the human receipt says the tree `
          + 'is clean; the two receipts describe different trees',
        );
      }
    }
  }

  const values = {};
  for (const f of [...AUDIT_CATEGORIES, 'totalDependencies']) {
    const n = meta[f];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      problems.push(`C15 dependency audit metadata.${f} is ${JSON.stringify(n)}, not a non-negative integer`);
    } else {
      values[f] = n;
    }
  }
  if (Object.keys(values).length !== AUDIT_CATEGORIES.length + 1) return problems;

  if (typeof lockUniverseSize === 'number' && values.totalDependencies !== lockUniverseSize) {
    problems.push(
      `C15 dependency audit examined ${values.totalDependencies} package(s), but the lockfile `
      + `universe derived from pnpm-lock.yaml has ${lockUniverseSize}; the audit did not cover the tree`,
    );
  }
  for (const f of AUDIT_CATEGORIES) {
    if (values[f] === 0) {
      problems.push(`C15 dependency audit metadata.${f} is 0; this workspace declares packages in every category`);
    } else if (values[f] > values.totalDependencies) {
      problems.push(
        `C15 dependency audit metadata.${f} is ${values[f]}, larger than its own `
        + `totalDependencies ${values.totalDependencies}`,
      );
    }
  }
  const covered = AUDIT_CATEGORIES.reduce((a, f) => a + (values[f] ?? 0), 0);
  if (covered < values.totalDependencies) {
    problems.push(
      `C15 dependency audit categories cover ${covered} package(s) but claim a total of `
      + `${values.totalDependencies}; the categories do not account for the tree`,
    );
  }
  return problems;
}

/**
 * R3.4.5 SS-2: the two source-derived PURL sets the filesystem receipt is measured against.
 *
 * Both are sets of COMPLETE canonical PURLs, not reduced identities, and both come from tracked
 * source only - the lockfile and the deterministic C16 closure. `npmPurl` is the same encoder
 * the SBOM generator uses, so the two cannot disagree about how a scoped name is escaped.
 */
function sourceCoverageSets(root, asOfDate) {
  try {
    const derived = deriveC16Expectation({ root, asOfDate });
    const production = derived.closures?.production;
    if (production === undefined) {
      return { sets: null, problems: ['C15 could not derive the production closure to measure filesystem coverage against'] };
    }
    const lockUniversePurls = new Set();
    for (const id of derived.lockUniverse) {
      const at = id.lastIndexOf('@');
      lockUniversePurls.add(npmPurl(id.slice(0, at), id.slice(at + 1)));
    }
    const productionRegistryPurls = new Set();
    for (const node of production.nodes.values()) {
      // Registry packages only: first-party workspace components are not published, so no
      // dependency scanner reports them.
      if (node.kind !== 'npm' || typeof node.purl !== 'string') continue;
      productionRegistryPurls.add(node.purl);
    }
    return { sets: { lockUniversePurls, productionRegistryPurls }, problems: [] };
  } catch (e) {
    return {
      sets: null,
      problems: [`C15 could not derive the source coverage sets (${e instanceof Error ? e.message.slice(0, 160) : e})`],
    };
  }
}

function verifyRawSemantics({ c15, c15Dir, contract, scanRefs, root, expectedSha, asOfDate }) {
  const problems = [];
  const { sets: sourceSets, problems: setProblems } = sourceCoverageSets(root, asOfDate);
  problems.push(...setProblems);
  const read = (rel) => {
    const { bytes, problem } = readMember(c15Dir, rel);
    if (problem !== null) { problems.push(`C15 '${rel}' ${problem}`); return null; }
    return bytes.toString('utf8');
  };

  // ── §A2 1. Dependency audit: REQUIRED STRUCTURE, not `?? {}` ──────────────────
  // R3.4 read counters through `?? {}` and advisories through `?? []`, so replacing the whole
  // report with `{}` looked like a clean audit. A missing field is now a missing field.
  const auditText = read('pnpm-audit-json.stdout.txt');
  if (auditText !== null) {
    let audit = null;
    try { audit = JSON.parse(auditText); } catch (e) {
      problems.push(`C15 pnpm-audit-json.stdout.txt is not valid JSON (${e instanceof Error ? e.message.slice(0, 100) : e})`);
    }
    if (audit !== null) {
      // SS-6: ONE closed schema check replaces the layered partial reads that preceded it. The
      // old path asked whether the fields it named were present and well-typed; anything it did
      // not name went unexamined, which is what let an extra counter, an extra top-level key, or
      // a second populated container ride alongside a clean-looking document.
      problems.push(...auditConsistencyProblems(audit, {
        lockUniverseSize: sourceSets === null ? null : sourceSets.lockUniversePurls.size,
      }));
    }
    // Cross-check the HUMAN receipt: an empty table beside a populated JSON, or vice versa,
    // means the two receipts do not describe the same scan.
    const humanText = read('pnpm-audit-human.stdout.txt');
    if (humanText !== null) {
      problems.push(...auditHumanReceiptProblems('pnpm-audit-human.stdout.txt', humanText));
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
    problems.push(...filesystemReportProblems('trivy-fs-json.stdout.txt', fsReport, { expectedSha, sourceSets }));
    // ── §3: the TABLE receipt is cross-checked against the JSON, not merely non-empty ─────
    // R3.4.1 accepted any non-empty string here — "NOT A TRIVY REPORT" passed. The table form
    // is the same scan in another format, so it must name the same subject and agree that
    // nothing blocking was found.
    const tableText = read('trivy-fs.stdout.txt');
    if (tableText !== null) {
      const jsonResults = Array.isArray(fsReport?.Results)
        ? fsReport.Results.filter((r) => typeof r?.Target === 'string' && typeof r?.Type === 'string')
        : [];
      problems.push(...tableReceiptProblems('trivy-fs.stdout.txt', tableText, {
        jsonResults, kind: 'filesystem',
      }));
      // §B: BOTH filesystem scans must prove which scanners were enabled.
      for (const rel of ['trivy-fs.stderr.txt', 'trivy-fs-json.stderr.txt']) {
        problems.push(...scannerCoverageProblems(rel, read(rel)));
      }
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
      const parsed = JSON.parse(text);
      problems.push(...imageReportProblems(rel, parsed, { expectedRef: scanRefs[index] }));
      // SS-B7: the image command declares `--scanners vuln,secret`, so its receipt must show
      // both were enabled. A scan that quietly ran fewer scanners covered less than it claims.
      problems.push(...scannerCoverageProblems(`trivy-image-${index}.stderr.txt`,
        read(`trivy-image-${index}.stderr.txt`), { scanners: ['vulnerability', 'secret'] }));
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

    // Both halves of the package are measured against the SAME derivation window. It selects
    // the exclusion window only; it cannot move a derived closure, and a mismatch in the
    // derived result is what fails. The C16 record is read directly here because the C16 block
    // below has not parsed it yet.
    let c16AsOfDate = new Date().toISOString().slice(0, 10);
    try {
      const rec = JSON.parse(readFileSync(join(c16Dir, 'closure-reconciliation.json'), 'utf8'));
      if (typeof rec.generated_from?.run_date === 'string') c16AsOfDate = rec.generated_from.run_date;
    } catch { /* the C16 block reports an unreadable record; C15 falls back to today */ }

    problems.push(...verifyCandidateSource({ c15, root, expectedSha }));
    problems.push(...verifyCacheProvenance(c15));
    problems.push(...verifyScannerChain({ c15, contract }));

    const images = verifyImages({ c15, c15Dir, contract });
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

    problems.push(...verifyRawSemantics({
      c15, c15Dir, contract, scanRefs: images.scanRefs, root, expectedSha, asOfDate: c16AsOfDate,
    }));

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
