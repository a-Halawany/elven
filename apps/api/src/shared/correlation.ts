/**
 * CALLER-VISIBLE CORRELATION (Gate-2.2 C12).
 *
 * Every error a caller receives must carry the correlation id from ITS OWN request
 * envelope, because that is the identifier it will use to locate the POL/AUD
 * evidence for its own failure. Two things therefore must never happen:
 *
 *  1. A downstream service must never MINT A REPLACEMENT correlation. A fresh id
 *     is not traceable to anything the caller can see, so the evidence becomes
 *     unfindable exactly when it is needed.
 *  2. An error must never carry a PLACEHOLDER such as the literal 'unknown'.
 *     A placeholder looks like an id, satisfies the response shape, and locates
 *     nothing at all — which is worse than failing loudly.
 *
 * The request guard establishes `eyeCorrelationId` from the envelope before any
 * controller or service runs, so this accessor cannot legitimately fail. If it
 * ever does, that is a wiring defect and it is raised as one rather than papered
 * over with a placeholder.
 */
import type { EyeRequest } from '../pipeline/http.js';

export class MissingCorrelationError extends Error {
  constructor() {
    super(
      'no correlation id on the request: the envelope guard did not run. ' +
      'This is a wiring defect — a placeholder correlation would make the ' +
      "caller's evidence unfindable, so none is invented.",
    );
  }
}

/** The request's own correlation id. Never a fresh id, never a placeholder. */
export function requireCorrelation(req: EyeRequest): string {
  const id = req.eyeCorrelationId ?? req.eyeEnvelope?.correlation_id;
  if (typeof id !== 'string' || id.length === 0) throw new MissingCorrelationError();
  return id;
}
