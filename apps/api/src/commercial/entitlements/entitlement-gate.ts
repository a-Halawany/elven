/**
 * CP-6 B91 §EN (0105) — THE AVAILABILITY GATE's PURE RULES (ADR-022, PR-66-003, UX-67-004). No database, no imports: the pipeline's
 * resolveAndEvaluate (its one `B91 entitlements` block) asks `entitlementExemption` first and consults the database's
 * commercial.capability_available(tenant, action, human_gated) only for an action that is NOT exempt, on a tenant-scoped route.
 *
 * THE EXEMPTION LIST — the actions no licence state can make unavailable — mirrors commercial.cen_exemption EXACTLY (the unit test pins
 * both to one table of cases):
 *   human_gate            every rule carrying the human gate (a named human's authority is never sold or removed);
 *   mandatory_control     identity, tenancy, audit, policy, retention (export, the customer's own records), objects (canonical objects and
 *                         provenance), commercial (the customer always sees and manages its own entitlement);
 *   warning_control       prediction.warning.* and executive.attention.* (warnings, their acknowledgement and the attention that carries them);
 *   correction_withdrawal a segment beginning `correct` or `withdraw` (a correction or withdrawal of any record);
 *   read_existing         a segment read, list, search, export, download or verify (customer work stays readable).
 */
export type Exemption = 'human_gate' | 'mandatory_control' | 'warning_control' | 'correction_withdrawal' | 'read_existing';

const MANDATORY_TOP = new Set(['identity', 'tenancy', 'audit', 'policy', 'retention', 'objects', 'commercial']);
const CORRECTION = /(^|\.)(correct|withdraw)[a-z_]*(\.|$)/;
const READ = /(^|\.)(read|list|search|export|download|verify|retrieve)(\.|$)/;

export function entitlementExemption(action: string, humanGated = false): Exemption | null {
  if (humanGated) return 'human_gate';
  if (MANDATORY_TOP.has(action.split('.')[0] ?? '')) return 'mandatory_control';
  if (action.startsWith('prediction.warning.') || action.startsWith('executive.attention.')) return 'warning_control';
  if (CORRECTION.test(action)) return 'correction_withdrawal';
  if (READ.test(action)) return 'read_existing';
  return null;
}

/** The database's answer (commercial.capability_available), as the pipeline and the reads use it. */
export interface Availability {
  available: boolean;
  action: string;
  tenant_id: string;
  contracted: boolean;
  exemption: Exemption | null;
  capability: { key: string; label: string; core: boolean; built: boolean; version: number } | null;
  capability_name: string;
  licence: { licence_id: string; version: number; state: string; package_key: string; effective_from: string; effective_to: string | null; digest: string; capabilities: string[] } | null;
  state: string;
  reason: string;
  stays_available: string;
  grace: { in_grace: boolean; grace_until: string | null; last_valid: unknown; rules?: unknown; rules_source?: string; indeterminate?: boolean };
}

/** The refusal's machine-readable result code (audit) — the HTTP answer is EYE_ENT_001 / EYE-ENT-001, 403. */
export const ENTITLEMENT_RESULT_CODE = 'EYE-ENT-001';
