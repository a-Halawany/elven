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

/**
 * EVERY frozen family, mapped to the control that covers it.
 *
 * A coverage report computed by keyword matching is worthless: it counts a family as covered
 * because some unrelated control happens to contain the word "wrong". The mapping is therefore
 * DECLARED, and a meta-control asserts both that every family appears here and that each named
 * control actually exists. A family cannot be added without a control, and a control cannot be
 * deleted without the mapping failing.
 */
export const C19_FAMILY_CONTROLS = Object.freeze({
  'wrong-signer': 'REJECTS local-signer-presented-as-delivery-authority',
  'wrong-san': 'REJECTS %s',
  'wrong-issuer': 'REJECTS %s',
  'wrong-repository': 'REJECTS %s',
  'wrong-ref': 'REJECTS %s',
  'wrong-source-sha': 'REJECTS %s',
  'wrong-workflow-digest': 'REJECTS %s',
  'regex-widened-identity': 'REJECTS regex-widened-identity: the policy itself must hold no patterns',
  'substituted-trust-root': 'REJECTS substituted-trust-root: a tampered trusted root fails its TUF digest',
  'stale-trust-root': 'REJECTS a policy that pins a rotating key as its offline root',
  'unknown-or-revoked-key': 'REJECTS wrong-log-identity',
  'unsupported-algorithm': 'REJECTS unsupported-algorithm',
  'missing-fulcio-certificate': 'REJECTS missing-fulcio-certificate',
  'replaced-fulcio-certificate': 'REJECTS a certificate that chains to no pinned authority',
  'malformed-fulcio-certificate': 'REJECTS malformed-fulcio-certificate',
  'missing-sct': 'REJECTS an SCT that is absent from the certificate',
  'malformed-sct': 'REJECTS an SCT that is absent from the certificate',
  'missing-rekor-set': 'REJECTS missing-rekor-set',
  'malformed-rekor-set': 'REJECTS malformed-rekor-set against a pinned key',
  'missing-inclusion-proof': 'REJECTS missing-inclusion-proof',
  'malformed-inclusion-proof': 'accepts a GENUINE inclusion proof and rejects every forgery of it',
  'wrong-checkpoint': 'REJECTS an unauthenticated checkpoint — a self-chosen root proves nothing',
  'wrong-log-identity': 'REJECTS wrong-log-identity',
  'expired-certificate': 'REJECTS expired-certificate',
  'certificate-outside-validity-window': 'REJECTS certificate-outside-validity-window',
  'signature-over-different-bytes': 'REJECTS signature-over-different-bytes',
  'altered-payload': 'REJECTS an altered artifact even when the bundle is internally consistent',
  'noncanonical-payload': 'REJECTS missing-sct, malformed-sct, removed-record, duplicated-record and noncanonical-payload',
  'altered-zip': 'REJECTS an altered artifact even when the bundle is internally consistent',
  'altered-manifest': 'REJECTS an altered artifact even when the bundle is internally consistent',
  'altered-checksum': 'REJECTS an altered artifact even when the bundle is internally consistent',
  'altered-nested-evidence': 'REJECTS an altered artifact even when the bundle is internally consistent',
  'removed-record': 'REJECTS missing-sct, malformed-sct, removed-record, duplicated-record and noncanonical-payload',
  'duplicated-record': 'REJECTS missing-sct, malformed-sct, removed-record, duplicated-record and noncanonical-payload',
  'wrong-run': 'REJECTS wrong-run and wrong-attempt',
  'wrong-attempt': 'REJECTS wrong-run and wrong-attempt',
  'wrong-finalizer-run': 'REJECTS wrong-finalizer-run',
  'replayed-nonce': 'REJECTS rollback-to-older-attestation and reused-commitment',
  'reused-commitment': 'REJECTS rollback-to-older-attestation and reused-commitment',
  'valid-attestation-from-another-archive': 'REJECTS valid-attestation-from-another-archive and processed-evidence-rebound',
  'processed-evidence-rebound': 'REJECTS valid-attestation-from-another-archive and processed-evidence-rebound',
  'rollback-to-older-attestation': 'REJECTS rollback-to-older-attestation and reused-commitment',
  'local-signer-presented-as-delivery-authority': 'REJECTS local-signer-presented-as-delivery-authority',
  'publication-guard-bypass': 'REJECTS publication-guard-bypass: publish depends on the guard AND on both platforms',
  'publication-from-pull-request': 'the workflow cannot be triggered by a pull request, a dispatch or a branch push',
  'publication-from-fork': 'the guard requires push, success, main, this repository, and not a fork',
  'publication-from-dispatch': 'the workflow cannot be triggered by a pull request, a dispatch or a branch push',
  'publication-from-branch': 'the guard requires push, success, main, this repository, and not a fork',
  'publication-after-failed-upstream': 'the guard requires push, success, main, this repository, and not a fork',
  'publication-from-superseded-attempt': 'REJECTS publication-from-superseded-attempt',
  'duplicate-publication': 'REFUSES on ambiguity rather than resolving it by guessing',
  'concurrent-publication': 'REJECTS duplicate/concurrent-publication: one publication per source commit',
  'failure-after-rekor-acceptance-before-bundle-persistence': 'THE differential: entry accepted, bundle lost, retry performs ZERO signing',
  'authority-ledger-closed-without-authority': 'the authority ledger cannot close a claim without an independent authority',
  'credential-in-argv': 'the producer refuses to spawn a command carrying a credential in argv',
  'credential-in-container-metadata': 'the handoff contract keeps the value out of argv, the container config and any disk',
  'credential-in-logs': 'SECRET-SAFE OUTPUT: a credential in the environment never reaches the shutdown report',
  'credential-in-evidence': 'the handoff contract keeps the value out of argv, the container config and any disk',
  'ownership-marker-removed': 'the governed gate never removes or replaces the ownership markers',
  'undeclared-environment-inherited': 'DENY BY DEFAULT: an undeclared credential never reaches the child',
  'stranded-process': 'DIFFERENTIAL: %s — a8d34c4 leaks a reparented grandchild; the corrected watchdog contains it',
  'stranded-docker-resource': 'NON-VACUITY: a weakened cleanup leaves resources behind and is reported, not hidden',
});

/** The frozen criteria as one digestible object, so a control can pin it and detect drift. */
export const C19_FROZEN = Object.freeze({
  invariants: C19_INVARIANTS.map((i) => i.id),
  acceptance: [...C19_ACCEPTANCE],
  attackFamilies: [...C19_ATTACK_FAMILIES],
});
