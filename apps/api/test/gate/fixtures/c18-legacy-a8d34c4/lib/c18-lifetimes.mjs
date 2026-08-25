/**
 * C18.1.12 — THE SOURCE-OWNED GOVERNED LIFETIMES.
 *
 * `2c3cab3` derived the governed TTL from the run's OWN prior rows: it took the minimum observed
 * `expires_at - issued_at` among the pre-existing rows of the same kind and required the new row to
 * sit within a second of it. That reads the answer out of the evidence. An archive whose session
 * lifetimes are ALL doubled — the seeded rows, the post-upgrade rows, every snapshot, consistently
 * — satisfies it exactly, because the derived TTL doubles with them. The same holds for
 * capabilities. Both packages were accepted with zero findings.
 *
 * A governed lifetime is a decision the SOURCE makes, so the source states it here once, and the
 * producer and the verifier both read it from here. There is nothing left for the evidence to
 * decide.
 *
 * Three lifetimes are governed, and each is owned by a different piece of source:
 *
 *   • `sessionSeconds` — the producer passes `Date.now() + sessionSeconds * 1000` as
 *     `identity.session_open`'s expiry argument. Owned by this file, used by the producer.
 *   • `capabilitySeconds` — the producer passes it as the `p_ttl_seconds` argument of
 *     `ctx.issue_identity_op` and `ctx.issue_commit`. Owned by this file, used by the producer.
 *   • `bootstrapCapabilitySeconds` — `ctx.issue_bootstrap` (migration 0011) hard-codes 120 inside
 *     the database function and takes no TTL argument. Migrations 0001–0021 are frozen, so this
 *     constant MIRRORS read-only source rather than driving it; the mirror is asserted against the
 *     migration text by a control so the two cannot drift apart.
 *
 * WHY A SKEW ALLOWANCE EXISTS, AND WHY IT IS SUB-SECOND. An observed lifetime is the governed TTL
 * plus the difference between the two clocks that stamped its ends, and those ends are not always
 * read from the same clock:
 *
 *   • a session's `expires_at` is computed in the APPLICATION from `Date.now()` while its
 *     `issued_at` is stamped by the DATABASE, so the difference is the app-to-database offset;
 *   • a capability's `expires_at` comes from `clock_timestamp()` while its `issued_at` comes from
 *     `now()` — both database clocks, but `now()` is the transaction start and `clock_timestamp()`
 *     advances during the transaction, so the difference is the elapsed statement time.
 *
 * Both are millisecond-scale — the largest deviation in the delivered evidence is 8 ms. The
 * allowance is capped at a quarter second: comfortably above real jitter, and three orders of
 * magnitude below any lifetime change worth making. It is a tolerance on the CLOCK, never on the
 * TTL: a lifetime that differs by more than `clockSkewMs` from the governed value is a finding, no
 * matter how consistently every other row in the archive was rewritten to agree with it.
 */

import { isPgTimestamp } from './c18-seed-validators.mjs';

export const GOVERNED_LIFETIMES = Object.freeze({
  sessionSeconds: 3_600,
  capabilitySeconds: 60,
  bootstrapCapabilitySeconds: 120,
  clockSkewMs: 250,
});

/** The governed session expiry the producer hands `identity.session_open`. */
export const sessionExpiresAt = (fromMs = Date.now()) => new Date(
  fromMs + GOVERNED_LIFETIMES.sessionSeconds * 1_000,
);

/**
 * The governed lifetime of a capability, in seconds. The bootstrap capability is minted by
 * `ctx.issue_bootstrap`, which carries its own fixed TTL; every other capability is issued with
 * the TTL the producer passes.
 */
export const capabilityLifetimeSeconds = (opClass) => (opClass === 'bootstrap'
  ? GOVERNED_LIFETIMES.bootstrapCapabilitySeconds
  : GOVERNED_LIFETIMES.capabilitySeconds);

/**
 * Judge one observed lifetime against its governed value. Returns zero or more problems; the
 * caller supplies the label used in the finding.
 */
export function judgeLifetime({ issuedAt, expiresAt, seconds, label }) {
  // C18.1.14: both ends are DATABASE columns, so both are parsed in the database family. The
  // caller validated the expiry; `Date.parse` on the raw `issuedAt` would have accepted prose, an
  // alternate offset or the body family for the other end of the same measurement.
  if (!isPgTimestamp(issuedAt) || !isPgTimestamp(expiresAt)) {
    return [`cannot be measured: ${JSON.stringify(issuedAt)} → ${JSON.stringify(expiresAt)} is not `
      + 'a pair of canonical database instants'];
  }
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const lived = expires - issued;
  if (lived < 0) return [`is ${JSON.stringify(expiresAt)}, which precedes its own issue instant`];
  const drift = Math.abs(lived - seconds * 1_000);
  if (drift <= GOVERNED_LIFETIMES.clockSkewMs) return [];
  return [`lives ${(lived / 1_000).toFixed(3)}s; the source governs every ${label} at ${seconds}s `
    + `(clock allowance ${GOVERNED_LIFETIMES.clockSkewMs}ms, observed drift ${drift}ms)`];
}
