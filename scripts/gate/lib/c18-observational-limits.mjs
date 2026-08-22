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
 */

export const OBSERVATIONAL_LIMITS = Object.freeze([
  Object.freeze({
    id: 'bootstrap-marking-instant',
    subject: 'identity.credentials.expires_at (the rotated bootstrap predecessor)',
    undecidable: 'the exact instant at which identity.bootstrap_mark_one_time read clock_timestamp()',
    because: 'migration 0012 records no observation of that clock, and migrations 0001-0021 are frozen',
    proved: 'the marking lies strictly after the credential-creating transaction time, at or before '
      + "the audited bootstrap event's stamp, and strictly before the rotation",
    residual: 'a rebinding that keeps the implied marking instant inside that causal interval is '
      + 'observationally indistinguishable from an authentic reading of the clock',
    anchorRequires: 'a signed external time attestation over the bootstrap transaction',
    ledger: 'C19 external-anchoring',
  }),
]);

/** The declared limit ids, for the control that proves this list is exactly what the gate tolerates. */
export const observationalLimitIds = () => OBSERVATIONAL_LIMITS.map((l) => l.id).sort();
