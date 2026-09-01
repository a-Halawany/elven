/**
 * C19 — WHAT THE EXTERNAL ANCHOR ACTUALLY PROVES, CLAIM BY CLAIM.
 *
 * The single most dangerous move available in this pass would be to sign the evidence archive and
 * then treat everything inside it as proven. A signature over a container of claims authenticates
 * the CONTAINER. It says nothing whatever about whether the claims are true.
 *
 * GitHub OIDC together with Fulcio and Rekor is a strong authority, and its strength is specific:
 *
 *   PROVED  · the WORKFLOW IDENTITY that produced the signature — repository, workflow reference,
 *             run and attempt — because Fulcio issues the certificate against an OIDC token that
 *             only GitHub's issuer can mint, and this gate cannot mint one for itself.
 *           · the exact BYTES that were signed, because the signature is over their digest.
 *           · PUBLICATION, because Rekor is an append-only transparency log a third party can read
 *             independently of this repository and of anyone who controls it.
 *           · a publication TIME WINDOW, bounded by the certificate validity and the log's own
 *             signed entry timestamp.
 *
 *   NOT PROVED · that any claim inside those bytes is true.
 *
 * That second line is the whole point of this file. Every proposition below was undecidable in C18,
 * and for each one the honest question is not "are the bytes signed" but "is there an authority
 * independent of the producer that can testify to THIS FACT". Where there is, it is named. Where
 * there is not, the limit stays open, with the strongest property that IS proved recorded beside
 * it, and with the exact reason it cannot be closed.
 *
 * A limit is closed by finding an authority, never by improving the packaging.
 */

/** What the chosen trust root testifies to, stated once so no entry can quietly overstate it. */
export const ANCHOR_PROVES = Object.freeze([
  'workflow-identity', 'signed-bytes', 'log-inclusion', 'publication-time-window',
]);

/**
 * Each entry answers one question: for this claim, who — other than the party asserting it — can
 * testify? `authority: null` means nobody can, and the claim remains an observational limit.
 */
export const C19_CLAIM_AUTHORITY = Object.freeze([
  Object.freeze({
    id: 'evidence-archive-provenance',
    claim: 'these archive bytes were produced by this repository\'s workflow at this source commit',
    authority: 'github-actions-oidc + sigstore-fulcio + rekor',
    independent: true,
    proves: 'the signing identity is a workflow this repository owns, the bytes are exactly those '
      + 'signed, and the signature was published to a log the producer does not control',
    closes: true,
    because: 'the producer cannot mint an OIDC token for an identity it does not have, and cannot '
      + 'retract a Rekor entry once it is included',
  }),
  Object.freeze({
    id: 'bootstrap-marking-instant',
    claim: 'the exact instant identity.bootstrap_mark_one_time read clock_timestamp()',
    authority: null,
    independent: false,
    proves: 'the marking lies strictly after the credential-creating transaction time, at or '
      + 'before the audited bootstrap stamp, and strictly before the rotation — and now also '
      + 'strictly before the Rekor inclusion time, which bounds the whole archive from above',
    closes: false,
    because: 'Rekor timestamps the PUBLICATION of the bytes, not the database clock read inside '
      + 'them. A trusted timestamp over the marking transaction itself would be required, and '
      + 'migration 0012 — frozen — records no second observation of that clock. The anchor '
      + 'narrows the interval; it does not make the instant falsifiable.',
    wouldRequire: 'an RFC 3161 timestamp authority, or a database that signs its own clock reads',
  }),
  Object.freeze({
    id: 'backend-assigned-identifiers',
    claim: 'the specific txid, backend_pid and effect serial PostgreSQL assigned',
    authority: null,
    independent: false,
    proves: 'each carries its exact delivered serialized type and grammar, is present on every row '
      + 'it belongs to, and is internally consistent across the archive',
    closes: false,
    because: 'PostgreSQL does not sign the identifiers it assigns, so the only party asserting '
      + 'them is the producer that read them. Signing the archive authenticates who reported the '
      + 'values; it cannot testify that the database issued those values rather than others.',
    wouldRequire: 'the database emitting a signed statement of the identifiers it assigned',
  }),
  Object.freeze({
    id: 'per-instance-generated-secrets',
    claim: 'the specific value of a secret generated independently by each instance',
    authority: null,
    independent: false,
    proves: 'each is a sha-256 digest of the declared shape, unique across a run, stable across '
      + "one instance's snapshots, and distinct between the two independently provisioned instances",
    closes: false,
    because: 'the value is random by construction and is generated by the producer\'s own process. '
      + 'A commitment signed by that same process proves only that it committed to something; an '
      + 'independent key-management service would have to be the one generating or attesting it.',
    wouldRequire: 'a KMS or HSM attestation binding the generated value to the instance identity',
  }),
  Object.freeze({
    id: 'docker-resource-identity',
    claim: 'the container and image ids dockerd assigned to this run\'s resources',
    authority: null,
    independent: false,
    proves: 'the ids are well-formed, the images are the digest-pinned Compose references, the two '
      + 'paths never share a resource, and every governed resource carried this run\'s ownership '
      + 'label from creation and was swept to a verified-empty inventory',
    closes: false,
    because: 'the docker daemon does not sign its inventory, and the producer is the only party '
      + 'reporting what it was told. Image DIGESTS are a different matter and are pinned in source; '
      + 'what remains unattested is the runtime identity of the specific containers.',
    wouldRequire: 'a signed attestation from the container runtime, or a registry-backed runtime '
      + 'identity the verifier can query independently',
  }),
  Object.freeze({
    id: 'producer-local-clock',
    claim: 'the wall-clock instants the producer recorded for its own steps',
    authority: null,
    independent: false,
    proves: 'the recorded instants are internally ordered and consistent with the causal structure '
      + 'of the run, and the whole archive precedes its Rekor inclusion time',
    closes: false,
    because: 'the producer reads its own clock and reports the result. Publication time bounds the '
      + 'archive from above and nothing bounds it from below except the source commit.',
    wouldRequire: 'a trusted timestamp authority countersigning the producer\'s own marks',
  }),
]);

/** The claims genuinely closed by an independent authority. */
export const closedClaims = () => C19_CLAIM_AUTHORITY.filter((c) => c.closes).map((c) => c.id).sort();

/** The claims that remain observational limits, with nobody independent to testify. */
export const openLimits = () => C19_CLAIM_AUTHORITY.filter((c) => !c.closes).map((c) => c.id).sort();

/**
 * A claim may only be marked closed if it actually names an independent authority. This is the
 * structural guard against the failure this file exists to prevent: closing a limit because the
 * bytes around it became signed.
 */
export function verifyAuthorityLedger(entries = C19_CLAIM_AUTHORITY) {
  const problems = [];
  for (const e of entries) {
    if (e.closes && (e.authority === null || e.independent !== true)) {
      problems.push(`c19 authority: '${e.id}' is marked closed without an independent authority; a `
        + 'signature over the containing bytes does not testify to the claim inside them');
    }
    if (!e.closes && typeof e.wouldRequire !== 'string') {
      problems.push(`c19 authority: open limit '${e.id}' does not say what would be required to `
        + 'close it, which is how a limit becomes permanent by default');
    }
    if (typeof e.proves !== 'string' || e.proves === '') {
      problems.push(`c19 authority: '${e.id}' records no property that IS proved`);
    }
  }
  return problems;
}
