/**
 * B107 §AR (0115_b107_x_ar; Q5, ES-71-004, FEX-31) — THE OPT-IN REQUEST GATE's process-side half: the ENFORCED capabilities and their action
 * prefixes (governance.ar_gate_prefixes — the vendor's register, no tenant data), held in a short-lived cache so a request whose action matches
 * no enforced prefix costs nothing more. The pipeline's `B107 acceptance` block asks `needsAcceptanceCheck` after the PDP's allow (and after
 * the entitlement gate); only a matching, non-exempt, DOMAIN-scoped request reads governance.ar_gate under its own evidence context.
 *
 * Fail-closed shape: when the register cannot be read, the cache is UNKNOWN and every non-exempt DOMAIN request is asked of the database
 * (whose own failure the pipeline answers 503, nothing done) — the gate is never silently open because a read failed.
 * Never gated: reads, corrections, withdrawals, attention, warnings, the mandatory controls, human gates and governance itself.
 */
import { sql } from 'kysely';
import type { Db } from '../../shared/db.js';
import { acceptanceGateExemption, matchingCapability } from './acceptance-logic.js';

export interface EnforcedCapability { capability: string; prefixes: string[] }
const TTL_MS = 10_000;

class AcceptanceGateCache {
  private list: EnforcedCapability[] | null = null;
  private loadedAt = 0;
  private unknown = false;
  /** The enforced list (refreshed at most every TTL); `null` while UNKNOWN (the register could not be read). */
  async enforced(db: Db): Promise<EnforcedCapability[] | null> {
    if (this.list !== null && !this.unknown && Date.now() - this.loadedAt < TTL_MS) return this.list;
    try {
      const r = await sql<{ p: EnforcedCapability[] }>`select governance.ar_gate_prefixes() as p`.execute(db);
      this.list = (r.rows[0]?.p ?? []).map((x) => ({ capability: String(x.capability), prefixes: (x.prefixes ?? []).map(String) }));
      this.loadedAt = Date.now(); this.unknown = false;
      return this.list;
    } catch (e) {
      // a database without §AR's register (undefined_function: 0115_b107_x_ar not applied) has nothing enforced — stated, not guessed;
      // any other failure is UNKNOWN (every non-exempt DOMAIN request is then asked, and that read fails closed)
      if ((e as { code?: string }).code === '42883') { this.list = []; this.loadedAt = Date.now(); this.unknown = false; return this.list; }
      this.unknown = true;
      return null;
    }
  }
  /** After a marking (governance.acceptance.enforce) in this process: read the register again on the next request. */
  invalidate(): void { this.loadedAt = 0; }
}
export const acceptanceGateCache = new AcceptanceGateCache();

/** Must this request be asked of governance.ar_gate? (an exempt action never; a TENANT/PLATFORM route never; no enforced prefix → never). */
export async function needsAcceptanceCheck(db: Db, a: { action: string; humanGated: boolean; scope: string }): Promise<boolean> {
  if (a.scope !== 'DOMAIN') return false;
  if (acceptanceGateExemption(a.action, a.humanGated) !== null) return false;
  const list = await acceptanceGateCache.enforced(db);
  if (list === null) return true;
  return matchingCapability(a.action, list) !== null;
}

/** governance.ar_gate's answer. */
export interface AcceptanceGateAnswer { gated: boolean; available: boolean; capability?: string; state?: string; record_id?: string; version?: number; reason?: string }
/** The refusal's machine-readable result code (audit); the HTTP answer is 403 `acceptance record rejected (access): …`. */
export const ACCEPTANCE_GATE_RESULT_CODE = 'EYE-AUT-001';
