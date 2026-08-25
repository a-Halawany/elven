/**
 * C18.1.12 — WHAT THIS EVIDENCE CANNOT DECIDE, STATED IN SOURCE.
 *
 * A verifier is only honest about what it proves if it is equally explicit about what it does not.
 * C18.1.11 described the bootstrap credential's marking instant as narrowed "to the marking
 * itself" and reported that the drift an earlier review cited "now fails". Re-run against the
 * delivered verifier, a fully rebound `expires_at - 10 ms` was still accepted with zero findings.
 * The enforcement was correct; the CLAIM was not. This file exists so a claim of that shape cannot
 * be made again in prose alone.
 *
 * Each entry names a proposition the archive genuinely cannot decide, why it cannot, what IS
 * proved instead, and where the missing anchor has to come from. A control asserts this list is
 * exactly the set of limits the verifier tolerates, so adding a new blind spot means declaring it
 * here, and closing one means deleting it here.
 *
 * ── WHY THE BOOTSTRAP MARKING INSTANT CANNOT BE PINNED ──
 *
 * `identity.bootstrap_mark_one_time` (migration 0012, frozen) sets
 *
 *     expires_at = clock_timestamp() + interval '24 hours'
 *
 * and records nothing else about that read. The instant τ = expires_at − 24 h is therefore a
 * `clock_timestamp()` value from inside the bootstrap transaction, and the archive contains no
 * second observation of that clock. What the evidence does bound is the CAUSAL INTERVAL τ must lie
 * in: strictly after the transaction's `now()` (which stamped the credential row and the bootstrap
 * claim), at or before the audited bootstrap event's `occurred_at` (the application stamps that
 * only after the port call returned), and strictly before the rotation.
 *
 * Any τ inside that interval is a legitimate reading of the clock. Moving `expires_at` by a few
 * milliseconds moves τ to another legitimate reading, so the mutated archive and the authentic one
 * are OBSERVATIONALLY INDISTINGUISHABLE — not because the rule is weak, but because the
 * implementation genuinely admits both. Recording a tighter producer-side bracket around the call
 * would not change this: the bracket is archive data like everything else, and an attacker
 * rebinding the expiry rebinds the bracket with it. Only an anchor the archive cannot author —
 * a signed external time attestation over the marking transaction — makes the exact instant
 * falsifiable, and that is C19's external-anchoring work, not C18's.
 *
 * So the claim is narrowed to what is proved: the marking happened within a bounded causal
 * interval. It is no longer described as exact.
 *
 * ── C18.1.14: THE REMAINING UNOWNED VALUES, DECLARED RATHER THAN LEFT IMPLICIT ──
 *
 * The comprehensive audit inventoried every `source_owned_value:false`, opaque, nullable and
 * per-instance declaration in the verifier. Most turned out to be constrained after all — the six
 * volatile seed columns are pinned to `null` by their own rules, and the migration-owned
 * per-instance columns gained explicit grammars in this pass. Five values genuinely cannot be
 * derived from any source artifact, and they are declared below rather than sitting as quiet
 * exemptions inside a coverage table. Each still carries a real rule; what cannot be decided is
 * WHICH legitimate value was assigned, and that is stated plainly instead of implied to be proven.
 *
 * ── C18.1.14-final: EQUALITY STRUCTURE IS OBSERVABLE EVEN WHEN THE VALUE IS NOT ──
 *
 * `per-instance-generated-secrets` claimed presence, grammar and uniqueness — and the verifier
 * enforced only presence and grammar. An archive in which BOTH independently provisioned databases
 * carried the SAME valid 64-hex `ctx.context_secret.secret`, in every snapshot and fully rebound,
 * was accepted with zero findings. The gap was not in the honesty of the limit but in the reach of
 * the enforcement behind it.
 *
 * The distinction that matters: a value the evidence must never contain can still have an
 * observable EQUALITY STRUCTURE. Two instances that each generate a secret for themselves cannot
 * agree on it, and one instance does not change it between snapshots. Both facts are decidable
 * from the already-digested form alone, and both are now enforced. What remains undecidable — and
 * is what this entry claims — is which particular value was drawn.
 */


/**
 * ── C19: WHAT AN EXTERNAL ANCHOR ACTUALLY PROVES, AND WHAT IT DOES NOT ──
 *
 * C19 introduces a trust root the evidence producer does not control: a GitHub Actions OIDC
 * identity and a Sigstore signature published to the Rekor transparency log. It is worth stating
 * precisely what that buys, because the tempting error — treating a signed claim as a proved claim
 * — would be a worse failure than the gap it purports to close.
 *
 * A Sigstore/Rekor anchor proves FOUR things, all of them about the ARTIFACT rather than about the
 * world the artifact describes:
 *
 *   1. IDENTITY   — which workflow, in which repository, at which source SHA and run/attempt,
 *                   produced the signature. Fulcio binds it to an OIDC identity the producer
 *                   cannot mint for itself.
 *   2. INTEGRITY  — exactly which bytes were signed. Any later edit invalidates the signature.
 *   3. PUBLICATION— that those bytes were entered in a public append-only log, so the producer
 *                   cannot quietly withdraw or replace them afterwards.
 *   4. AN UPPER TIME BOUND — the log's signed entry timestamp proves the bytes existed BY then.
 *
 * What it does NOT prove is anything about the DATABASE. Postgres does not sign its own
 * observations, and the container it runs in is started, configured and clocked by the producer.
 * A signature over a claim about `txid` proves that the producer COMMITTED to that value before
 * publication; it says nothing about whether the value is the one Postgres actually assigned.
 *
 * That distinction is the whole of C19's honesty. Each entry below therefore separates:
 *
 *   • `proved`      — what holds after anchoring, including the genuinely new property;
 *   • `undecidable` — the proposition that remains open, unchanged in substance;
 *   • `authority`   — the independent factual authority for the claim, or an explicit statement
 *                     that NONE EXISTS, with what it would take to create one.
 *
 * The new property anchoring adds, and it is worth having, is NON-RETROFITTABILITY: once a claim
 * is signed under a workflow identity and published to a transparency log, the producer can no
 * longer choose its value with hindsight. An adversary who could previously rebind every
 * attacker-controlled field consistently must now do so BEFORE publication, under an identity it
 * does not control, leaving a permanent public record. That narrows the attack from "undetectable"
 * to "committed and attributable". It does not make a database observation externally true, and
 * this file does not claim it does.
 */

export const OBSERVATIONAL_LIMITS = Object.freeze([
  Object.freeze({
    id: 'backend-assigned-identifiers',
    subject: 'ctx.operation.txid, ctx.operation.backend_pid, ctx.operation_effect.id',
    undecidable: 'the specific values PostgreSQL assigns to a transaction id, a backend process id '
      + 'and a bare sequence',
    because: 'the database chooses them at run time from state no source artifact fixes, and no '
      + 'other recorded value derives from them',
    proved: 'each carries its exact delivered serialized type and grammar — a digit string, a '
      + 'positive integer and a positive serial — and each row carries the column',
    residual: 'one legitimate backend-assigned value can be exchanged for another legitimate one '
      + 'without contradicting anything the evidence records',
    authority: 'NONE EXISTS. PostgreSQL does not sign its own observations, and the instance is '
      + 'started and clocked by the producer, so there is no party outside the producer that can '
      + 'attest what the backend assigned. Creating one would mean a database that signs its own '
      + 'transaction metadata under a key the producer cannot reach — no such deployment exists '
      + 'here, and inventing a signer inside the producer would be self-assertion wearing a '
      + 'signature.',
    anchorAdds: 'the values are bound into a canonically-serialised payload signed under a GitHub '
      + 'Actions OIDC identity and published to Rekor, so they cannot be chosen with hindsight or '
      + 'silently replaced after the fact; substitution now requires forging an identity the '
      + 'producer does not hold, and leaves a permanent public record',
    stillUndecidable: 'whether the recorded values are the ones PostgreSQL actually assigned',
    anchorRequires: 'the database emitting a signed statement of the identifiers it assigned',
    anchorOutcome: 'anchored for non-retrofittability, NOT for truth',
    ledger: 'C19 external-anchoring',
  }),
  Object.freeze({
    id: 'per-instance-generated-secrets',
    subject: 'identity.sessions.context_key_hash and ctx.context_secret.secret',
    undecidable: 'the specific value of a secret generated independently by each instance',
    because: 'the value is random by construction — deriving it from source would defeat its '
      + 'purpose — and the two paths legitimately disagree on it',
    proved: 'each is a sha-256 hex digest, present on every row it belongs to, unique across the '
      + "sessions of a run, stable across one instance's snapshots, and — for the context secret — "
      + 'DISTINCT between the two independently provisioned instances',
    residual: 'one well-formed random digest can be exchanged for another, provided the exchange '
      + 'preserves that whole equality structure; the specific value remains undecidable',
    authority: 'NONE EXISTS WITHOUT PAID INFRASTRUCTURE. A hosted key-management service that '
      + 'generated the secret and attested its origin under its own key would be a genuine '
      + 'independent authority; that is a provisioning and cost decision outside this gate, and it '
      + 'is deliberately NOT taken here. A signer controlled by the evidence process is not an '
      + 'authority, and is registered deliveryCapable:false precisely so it can never be mistaken '
      + 'for one.',
    anchorAdds: 'an HMAC commitment binding the secret to its instance, path, source SHA and run '
      + 'is signed and published without revealing the value, so the committed secret cannot be '
      + 'exchanged for another after publication, and reuse across instances or runs is detectable '
      + 'from the commitments alone',
    stillUndecidable: 'whether the committed value was genuinely generated by that database '
      + 'instance rather than chosen by the producer before provisioning it',
    anchorRequires: 'a key-management attestation binding the generated value to the instance',
    anchorOutcome: 'commitment anchored, origin still unproved',
    ledger: 'C19 external-anchoring',
  }),
  Object.freeze({
    id: 'bootstrap-marking-instant',
    subject: 'identity.credentials.expires_at (the rotated bootstrap predecessor)',
    undecidable: 'the exact instant at which identity.bootstrap_mark_one_time read clock_timestamp()',
    because: 'migration 0012 records no observation of that clock, and migrations 0001-0021 are frozen',
    proved: 'the marking lies strictly after the credential-creating transaction time, at or before '
      + "the audited bootstrap event's stamp, and strictly before the rotation",
    residual: 'a rebinding that keeps the implied marking instant inside that causal interval is '
      + 'observationally indistinguishable from an authentic reading of the clock',
    authority: 'PARTIAL. Rekor\'s signed entry timestamp is a genuine external time authority, but '
      + 'it can only bound the marking from ABOVE — the evidence demonstrably existed by then. A '
      + 'lower bound requires an externally-signed nonce obtained BEFORE provisioning and carried '
      + 'into the run. Together these bound the marking to an INTERVAL between two externally '
      + 'attested instants. No available authority observes the database clock itself.',
    anchorAdds: 'the marking is bounded by two instants neither of which the producer authored, '
      + 'rather than only by causal ordering among values the producer wrote',
    stillUndecidable: 'the exact instant within that interval, and whether the container clock the '
      + 'database read was truthful at all. The interval is reported WITH its width; it is never '
      + 'collapsed to a point, because the authority does not prove a point.',
    anchorRequires: 'a signed external time attestation over the bootstrap transaction, plus an '
      + 'externally-signed nonce obtained before provisioning to bound it from below',
    anchorOutcome: 'bounded to an attested interval, never to an instant',
    ledger: 'C19 external-anchoring',
  }),
]);

/** The declared limit ids, for the control that proves this list is exactly what the gate tolerates. */
export const observationalLimitIds = () => OBSERVATIONAL_LIMITS.map((l) => l.id).sort();
