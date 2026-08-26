/**
 * C19 — THE FROZEN ACCEPTANCE AND ATTACK CRITERIA.
 *
 * This file exists to stop C19 from growing. Every gate before it expanded while it was being
 * built: a new attack class was noticed, it was obviously in scope, it was added, and the finish
 * line moved. The criteria below are therefore FROZEN as of this contract, and the rule for what
 * happens next is written down rather than decided case by case.
 *
 * ── THE ROUTING RULE ──
 *
 * A newly discovered attack class is routed to C20. It does NOT reopen C19.
 *
 * The single exception is a CONSTITUTIONAL INVARIANT violation — a defect showing that one of the
 * properties C19 claims is not actually held by the delivered system. That is not scope growth;
 * it is the discovery that a frozen criterion was never met. Those, and only those, reopen the
 * frozen set, and `isConstitutional` below is the test.
 *
 * The distinction matters because both look the same at the moment of discovery. "The verifier
 * accepts a signature from the wrong workflow" is constitutional: C19 claims exact identity
 * binding, so the claim is false. "An attacker with a Rekor operator key could forge inclusion" is
 * a new class: C19 never claimed to defend against a compromised log operator, so defending
 * against it is C20's subject, not a correction to C19.
 */

/**
 * The CONSTITUTIONAL INVARIANTS. These are the properties C19 asserts about the delivered system.
 * A demonstrated violation of any one of them means a frozen criterion was not met, and reopens
 * the frozen set. Everything else routes forward.
 */
export const C19_INVARIANTS = Object.freeze([
  Object.freeze({
    id: 'independent-authority',
    invariant: 'the evidence producer is never its own sole authority for a claim marked closed',
    violatedWhen: 'a claim is accepted as proved on the strength of a signature the producer itself '
      + 'controls, or an authority ledger entry is closed without an independent authority',
  }),
  Object.freeze({
    id: 'exact-identity-binding',
    invariant: 'a delivery-standing signature is accepted only from the exact declared signer '
      + 'identity — issuer, SAN, repository, owner, ref, workflow digest, event and runner '
      + 'environment — with no pattern acceptance where an exact value exists',
    violatedWhen: 'a signature from any other workflow, ref, repository, fork or event is accepted',
  }),
  Object.freeze({
    id: 'signed-bytes-are-the-verified-bytes',
    invariant: 'signatures are verified over canonical bytes, never over a reparsed projection, and '
      + 'the envelope digest is recomputed rather than trusted',
    violatedWhen: 'altered payload, altered signature or a mismatched digest is accepted',
  }),
  Object.freeze({
    id: 'replay-and-substitution-resistance',
    invariant: 'an attestation is bound to one archive, one source SHA, one run and one attempt, '
      + 'and a nonce is accepted once',
    violatedWhen: 'a valid attestation from another archive, run, attempt or SHA is accepted, or a '
      + 'nonce is accepted twice',
  }),
  Object.freeze({
    id: 'offline-verifiability',
    invariant: 'a foreign checkout verifies the delivered artifact with no network access, against '
      + 'independently bootstrapped trust material held in source',
    violatedWhen: 'verification requires or silently performs a network call, or depends on a '
      + 'rotating remote key',
  }),
  Object.freeze({
    id: 'publication-unreachable-except-on-main',
    invariant: 'Rekor publication is structurally unreachable from anything other than the exact '
      + 'successful push on main of this repository',
    violatedWhen: 'a pull request, fork, dispatch, branch run, failed upstream run or superseded '
      + 'attempt can reach the publication step',
  }),
  Object.freeze({
    id: 'no-credential-in-argv-or-metadata',
    invariant: 'no credential value reaches argv, a process listing, container metadata, logs, the '
      + 'evidence archive or any persistent file',
    violatedWhen: 'a credential is observable in any of those, at any point in the run',
  }),
  Object.freeze({
    id: 'bounded-containment-of-the-governed-workload',
    invariant: 'for the governed, non-evasive workload, SIGINT, SIGTERM and SIGHUP leave no owned '
      + 'process and no owned docker resource alive; only SIGKILL to the watchdog is unhandleable',
    violatedWhen: 'any owned process or labelled resource survives one of those signals',
  }),
  Object.freeze({
    id: 'honest-limits',
    invariant: 'a claim without an independent authority is recorded as an open observational '
      + 'limit and is never presented as proved',
    violatedWhen: 'a limit is closed by improving packaging rather than by naming an authority',
  }),
]);

/**
 * The FROZEN ACCEPTANCE CRITERIA. C19 is complete when every one of these holds. Adding to this
 * list is scope growth; the routing rule sends it to C20 instead.
 */
export const C19_ACCEPTANCE = Object.freeze([
  'design-recorded-in-source',
  'trust-root-independently-bootstrapped',
  'anchor-acquisition-adapter',
  'anchor-verification-adapter-offline',
  'exact-signer-identity-binding',
  'least-privilege-job-scoped-permissions',
  'publication-guard-structurally-unreachable',
  'publication-recovery-idempotent',
  'credential-never-in-argv-or-container-metadata',
  'descendant-containment-ownership-chain',
  'docker-resource-containment-exact-label',
  'isolation-policy-and-environment-allowlist',
  'authority-classification-ledger',
  'observational-limits-honest',
  'mutation-families-complete',
  'linux-and-macos-parity',
  'historical-artifact-cleanup',
  'documentation-corrected',
]);

/**
 * The FROZEN ATTACK MATRIX. Each family must have at least one permanent control that proves the
 * corrected verifier rejects it AND that the mutation is non-vacuous against the frozen predecessor
 * where a predecessor exists.
 */
export const C19_ATTACK_FAMILIES = Object.freeze([
  // ── identity and trust material ──
  'wrong-signer', 'wrong-san', 'wrong-issuer', 'wrong-repository', 'wrong-ref', 'wrong-source-sha',
  'wrong-workflow-digest', 'regex-widened-identity',
  'substituted-trust-root', 'stale-trust-root', 'unknown-or-revoked-key', 'unsupported-algorithm',
  // ── the Sigstore bundle itself ──
  'missing-fulcio-certificate', 'replaced-fulcio-certificate', 'malformed-fulcio-certificate',
  'missing-sct', 'malformed-sct', 'missing-rekor-set', 'malformed-rekor-set',
  'missing-inclusion-proof', 'malformed-inclusion-proof', 'wrong-checkpoint', 'wrong-log-identity',
  'expired-certificate', 'certificate-outside-validity-window',
  // ── the signed bytes ──
  'signature-over-different-bytes', 'altered-payload', 'noncanonical-payload',
  'altered-zip', 'altered-manifest', 'altered-checksum', 'altered-nested-evidence',
  'removed-record', 'duplicated-record',
  // ── binding, replay and provenance ──
  'wrong-run', 'wrong-attempt', 'wrong-finalizer-run', 'replayed-nonce', 'reused-commitment',
  'valid-attestation-from-another-archive', 'processed-evidence-rebound', 'rollback-to-older-attestation',
  'local-signer-presented-as-delivery-authority',
  // ── publication lifecycle ──
  'publication-guard-bypass', 'publication-from-pull-request', 'publication-from-fork',
  'publication-from-dispatch', 'publication-from-branch', 'publication-after-failed-upstream',
  'publication-from-superseded-attempt', 'duplicate-publication', 'concurrent-publication',
  'failure-after-rekor-acceptance-before-bundle-persistence',
  // ── honesty ──
  'authority-ledger-closed-without-authority',
  // ── containment and credentials ──
  'credential-in-argv', 'credential-in-container-metadata', 'credential-in-logs',
  'credential-in-evidence', 'ownership-marker-removed', 'undeclared-environment-inherited',
  'stranded-process', 'stranded-docker-resource',
]);

/**
 * Is this finding a constitutional violation — meaning a property C19 CLAIMS is not held — or a new
 * attack class that belongs to C20?
 *
 * The question is deliberately not "is it serious" or "is it in the spirit of C19". Both of those
 * admit everything. The question is whether C19 asserted the property and was wrong.
 */
export function isConstitutional(finding) {
  const id = typeof finding === 'string' ? finding : finding?.invariant;
  return C19_INVARIANTS.some((i) => i.id === id);
}

/**
 * Where does a newly discovered attack class go? Anything already in the frozen matrix is C19's to
 * finish. A violated invariant reopens the frozen set. Everything else is C20's.
 */
export function route(finding) {
  const family = typeof finding === 'string' ? finding : finding?.family;
  if (isConstitutional(finding)) {
    return { gate: 'C19', reason: 'a constitutional invariant C19 claims is not held; the frozen criteria reopen' };
  }
  if (C19_ATTACK_FAMILIES.includes(family)) {
    return { gate: 'C19', reason: 'already inside the frozen attack matrix' };
  }
  return { gate: 'C20', reason: 'a new attack class; C19 is frozen and does not expand to absorb it' };
}

/** The frozen criteria as one digestible object, so a control can pin it and detect drift. */
export const C19_FROZEN = Object.freeze({
  invariants: C19_INVARIANTS.map((i) => i.id),
  acceptance: [...C19_ACCEPTANCE],
  attackFamilies: [...C19_ATTACK_FAMILIES],
});
