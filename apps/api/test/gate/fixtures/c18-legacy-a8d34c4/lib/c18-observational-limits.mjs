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
    anchorRequires: 'the database emitting a signed statement of the identifiers it assigned',
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
    anchorRequires: 'a key-management attestation binding the generated value to the instance',
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
    anchorRequires: 'a signed external time attestation over the bootstrap transaction',
    ledger: 'C19 external-anchoring',
  }),
]);

/** The declared limit ids, for the control that proves this list is exactly what the gate tolerates. */
export const observationalLimitIds = () => OBSERVATIONAL_LIMITS.map((l) => l.id).sort();
