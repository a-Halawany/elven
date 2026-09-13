/**
 * B11 — the governed credential path (SOURCE_INTEGRATION_STATUS §6 item 3).
 *
 * A source contract names a credential by REFERENCE: the deployment's variable `EYE_SRC_<NAME>`. This store answers two
 * questions and nothing else — whether the deployment binds the reference (the readiness register's verdict) and, at
 * egress time, the value for the run's requests. The value is read from the process environment at the moment it is
 * needed, handed to the connector apart from the binding, carried in the contract's declared header, dropped on a
 * redirect off the origin, and never written: not on the run, not in the audit, not in the evidence. The reference is
 * what the records carry.
 */
import { Injectable } from '@nestjs/common';

const REF = /^EYE_SRC_[A-Z0-9_]{1,64}$/;

@Injectable()
export class SourceCredentialStore {
  /** Whether this deployment binds the reference (a non-empty value under that name). */
  has(ref: string): boolean {
    if (!REF.test(ref)) return false;
    const v = process.env[ref];
    return typeof v === 'string' && v.length > 0;
  }
  /** The value for a run's requests, or null when the deployment binds none. Callers never log it. */
  resolve(ref: string): string | null {
    if (!this.has(ref)) return null;
    return process.env[ref] as string;
  }
}
