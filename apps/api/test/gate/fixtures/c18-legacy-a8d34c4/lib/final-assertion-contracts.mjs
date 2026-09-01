/**
 * C16-R3.3 — the CODE-OWNED contracts the final assertion checks a run against.
 *
 * These live in their own module for one reason: every earlier round of this verifier was
 * defeated by deriving an expectation from the same document it was verifying. A contract
 * that lives in tracked source, separate from any manifest, cannot be edited by whoever
 * edits the evidence.
 *
 * Nothing here reads a manifest. The only run-dependent input is the pinned image list,
 * and even that is validated against a strict digest-reference shape before it is used to
 * derive step ids.
 */

/**
 * The exact normal scan steps, with the tool that must have run them and the policy each
 * must carry. `blocking` steps gate the run; `informational` steps are alternate output
 * formats of a blocking step and are named here so a run cannot quietly demote a blocking
 * scan by relabelling it.
 */
export const C15_NORMAL_STEPS = Object.freeze([
  Object.freeze({ id: 'pnpm-audit-human', tool: 'pnpm', policy: 'blocking' }),
  Object.freeze({ id: 'pnpm-audit-json', tool: 'pnpm', policy: 'informational' }),
  Object.freeze({ id: 'gitleaks-worktree', tool: 'gitleaks', policy: 'blocking' }),
  Object.freeze({ id: 'gitleaks-history', tool: 'gitleaks', policy: 'blocking' }),
  Object.freeze({ id: 'trivy-fs', tool: 'trivy', policy: 'blocking' }),
  Object.freeze({ id: 'trivy-fs-json', tool: 'trivy', policy: 'informational' }),
]);

/** The exact cache-acquisition steps. Both must have run, and both must have succeeded. */
export const C15_ACQUISITION_STEPS = Object.freeze([
  Object.freeze({ id: 'trivy-acquire-db' }),
  Object.freeze({ id: 'trivy-acquire-checks' }),
]);

/** Image scans are `trivy-image-<index>`, one per pinned image, in pin order. */
export const IMAGE_STEP_PREFIX = 'trivy-image-';

/** Governed reports that are not a step's raw stream but must still be produced and bound. */
export const C15_REQUIRED_REPORTS = Object.freeze([
  'RESULT-PASS.txt',
  'gitleaks-worktree.json',
  'gitleaks-history.json',
  'image-findings.json',
]);

/** Outputs every passing C16 run must have produced and bound. */
export const C16_REQUIRED_REPORTS = Object.freeze(['RESULT-PASS.txt']);

/** A digest-pinned image reference: `name@sha256:<64 lowercase hex>`, nothing else. */
export const IMAGE_REF = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;

export const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * The image step ids implied by a pinned image list, or a problem describing why the list
 * cannot imply any. The list is run-supplied, so it is validated before it is trusted to
 * shape an expectation.
 */
export function imageStepIds(pinnedImages) {
  if (!Array.isArray(pinnedImages) || pinnedImages.length === 0) {
    return { ids: null, problem: 'digest_pinned_images is not a non-empty array, so the expected image-step set cannot be derived' };
  }
  const seen = new Set();
  for (const [index, ref] of pinnedImages.entries()) {
    if (typeof ref !== 'string' || !IMAGE_REF.test(ref)) {
      return { ids: null, problem: `digest_pinned_images[${index}] ${JSON.stringify(ref)} is not a name@sha256:<64 hex> reference` };
    }
    if (seen.has(ref)) {
      return { ids: null, problem: `digest_pinned_images lists ${ref} more than once` };
    }
    seen.add(ref);
  }
  return { ids: pinnedImages.map((_, i) => `${IMAGE_STEP_PREFIX}${i}`), problem: null };
}

/** `<id>.stdout.txt` and `<id>.stderr.txt` — the raw streams every step must have left. */
export function streamFilesFor(id) {
  return { stdout: `${id}.stdout.txt`, stderr: `${id}.stderr.txt` };
}

/**
 * The COMPLETE expected C15 output inventory, derived from the step contract, the
 * acquisition contract, the pinned image set and the required reports — not from a
 * hardcoded list that drifts the moment a step is added.
 */
export function expectedC15Inventory(pinnedImages) {
  const { ids: imageIds, problem } = imageStepIds(pinnedImages);
  if (problem !== null) return { inventory: null, problem };
  const normalIds = [...C15_NORMAL_STEPS.map((s) => s.id), ...imageIds];
  const files = [...C15_REQUIRED_REPORTS];
  for (const id of [...normalIds, ...C15_ACQUISITION_STEPS.map((s) => s.id)]) {
    const { stdout, stderr } = streamFilesFor(id);
    files.push(stdout, stderr);
  }
  const duplicates = files.filter((f, i) => files.indexOf(f) !== i);
  if (duplicates.length > 0) {
    return { inventory: null, problem: `the expected inventory itself is inconsistent: ${[...new Set(duplicates)].join(', ')} derived more than once` };
  }
  return { inventory: files.sort(), problem: null, normalIds, imageIds };
}
