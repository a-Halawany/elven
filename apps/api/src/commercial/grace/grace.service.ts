/**
 * CP-6 B91 §GR (0105 §GR) — GRACE, CONTINUITY AND THE ENTITLEMENT SURFACE (F-P7-F-01 clauses 4 and 5: FEX-30, PR-66-005/006, AT-66,
 * UX-67-001..006).
 *
 * THE TRANSITIONS of a licence version's STATE (the version itself is §EN's): renew, suspend, reinstate — the vendor's commercial authority,
 * a named human (human-gated), with a reason — and the tick step `commercial-licence-lapse` (order 80) that moves a version past its term end
 * into GRACE with the last valid entitlement, a grace past its end to LAPSED, an INDETERMINATE entitlement (conflicting live versions, an
 * unreadable version) into grace with the last valid entitlement (FEX-30), and raises the renewal notice. Each move is a ledger row and a
 * commercial.entitlement attention item in every active domain of the tenant, routed under the domain's PUBLISHED attention policy. The tick
 * lifts nothing: a reinstatement or a renewal is the commercial authority's.
 *
 * THE GRACE POLICY per tenant (versioned; the default stated when none is declared) and commercial.grace_rules(tenant), the read §EN's gate
 * consults. THE OFFLINE LICENCE TOKEN (licence-token.ts): the canonical payload over the version's basis, signed with the key an env
 * REFERENCE names — the disconnected profile itself does not exist yet (P7-D / B106).
 *
 * THE SURFACE (UX-67-001): current entitlement, included capabilities, limits and usage (§ME's usage_records this month), renewal and
 * continuity (the term, the notices, the transitions), grace (the policy, the rules, the last valid entitlement), the offline tokens, and —
 * through to_regclass seams — §ME's caps and §LE's budgets when those tables exist. Every figure is SYNTHETIC in the harness and the demo.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { GraceCapability, type GraceReads, type PolicyWrites, type TokenWrites, type TransitionWrites } from './grace.capabilities.js';
import { canonicalPayload, LicenceSigningKeyStore, LICENCE_KEY_REF, sha256Hex, TOKEN_ALGORITHM, TOKEN_FORMAT, TOKEN_PROFILES, verifySignature,
         type LicenceBasis, type OfflineToken, type TokenPayload, type TokenProfile } from './licence-token.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LICENCE_LAPSE_STEP = 'commercial-licence-lapse';
export const LICENCE_LAPSE_ORDER = 80;
export const GRACE_ALLOWS = ['read_and_preserve', 'finish_running_work', 'new_work'] as const;
/** What stays available in every commercial state (ADR-022, UX-67-004) — the surface and the banner say it in these words. */
export const ALWAYS_AVAILABLE = [
  'the audit read and verification',
  'warnings and their acknowledgement',
  'corrections and withdrawals',
  'export and the customer\'s own records',
  'the provenance of every record',
  'identity and sign-in',
  'reading every existing record — nothing is deleted',
] as const;

export interface TransitionIntake { version: number; reason: string; evidence: Row }
export interface RenewIntake extends TransitionIntake { renewedUntil: string }
export interface PolicyIntake { tenantId: string; expectedVersion: number; graceDays: number; allows: string[]; renewalNoticeDays: number; reason: string }
export interface TokenIntake { version: number; profile: TokenProfile; expiresAt: string; keyRef: string; reason: string }

const bad = (correlationId: string) => (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

function reasonOf(m: Row, correlationId: string): string {
  if (typeof m['reason'] !== 'string' || m['reason'].trim().length < 8 || m['reason'].length > 2000) bad(correlationId)('reason must say why (8–2000 characters)');
  return (m['reason'] as string).trim();
}
function versionOf(m: Row, correlationId: string): number {
  if (!Number.isInteger(m['version']) || (m['version'] as number) < 1) bad(correlationId)('version must name the licence version acted on (its newest)');
  return m['version'] as number;
}
function evidenceOf(m: Row, correlationId: string): Row {
  const e = m['evidence'] ?? {};
  if (typeof e !== 'object' || e === null || Array.isArray(e) || JSON.stringify(e).length > 8000) bad(correlationId)('evidence must be an object (an order or ticket reference, a contract clause) of at most 8000 characters');
  return e as Row;
}
const instantOk = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && !Number.isNaN(Date.parse(v));

export function validateTransition(m: Row, correlationId: string): TransitionIntake {
  return { version: versionOf(m, correlationId), reason: reasonOf(m, correlationId), evidence: evidenceOf(m, correlationId) };
}
export function validateRenewal(m: Row, correlationId: string): RenewIntake {
  if (!instantOk(m['renewedUntil'])) bad(correlationId)('renewedUntil must be an instant (the new term end)');
  return { ...validateTransition(m, correlationId), renewedUntil: m['renewedUntil'] as string };
}
export function validatePolicy(m: Row, correlationId: string): PolicyIntake {
  const no = bad(correlationId);
  if (typeof m['tenantId'] !== 'string' || !UUID.test(m['tenantId'])) no('tenantId must be a tenant id');
  if (!Number.isInteger(m['expectedVersion']) || (m['expectedVersion'] as number) < 0) no('expectedVersion must name the tenant\'s current grace policy version (0 when none is declared)');
  if (!Number.isInteger(m['graceDays'])) no('graceDays must be a whole number of days (1–90)');
  if (!Number.isInteger(m['renewalNoticeDays'])) no('renewalNoticeDays must be a whole number of days (0–180)');
  const allows = m['allows'];
  if (!Array.isArray(allows) || allows.length === 0 || allows.length > 3 || !allows.every((a) => typeof a === 'string')) no(`allows must list what grace allows, of ${GRACE_ALLOWS.join(', ')}`);
  // the boundary itself (read_and_preserve cannot be removed) is the PORT's refusal, recorded — not pre-empted here
  return { tenantId: m['tenantId'] as string, expectedVersion: m['expectedVersion'] as number, graceDays: m['graceDays'] as number, allows: [...new Set(allows as string[])],
           renewalNoticeDays: m['renewalNoticeDays'] as number, reason: reasonOf(m, correlationId) };
}
export function validateToken(m: Row, correlationId: string): TokenIntake {
  const no = bad(correlationId);
  const profile = m['profile'] ?? 'disconnected';
  if (typeof profile !== 'string' || !(TOKEN_PROFILES as readonly string[]).includes(profile)) no(`profile is one of ${TOKEN_PROFILES.join(', ')}`);
  if (!instantOk(m['expiresAt'])) no('expiresAt must be an instant (the token\'s expiry)');
  if (typeof m['keyRef'] !== 'string' || !LICENCE_KEY_REF.test(m['keyRef'])) no('keyRef must be an env reference EYE_LICENCE_SIGNING_KEY_<NAME> (the key itself is never sent)');
  return { version: versionOf(m, correlationId), profile: profile as TokenProfile, expiresAt: m['expiresAt'] as string, keyRef: m['keyRef'] as string, reason: reasonOf(m, correlationId) };
}

const iso = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);
function strip(r: Row): Row { return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)])); }

@Injectable()
export class GraceService implements OnModuleInit {
  private readonly log = new Logger('commercial.grace');
  constructor(private readonly moduleRef: ModuleRef, private readonly keys: LicenceSigningKeyStore) {}

  /** The tick step (the branch.service idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: licences are not lapsed by the tick'); return; }
    registry.register({ name: LICENCE_LAPSE_STEP, order: LICENCE_LAPSE_ORDER, run: async (c: AttentionTickContext) => this.lapse(c) });
  }
  private async lapse(c: AttentionTickContext): Promise<Row> {
    return GraceCapability.tick(c.tx, 'executive.attention.tick').lapse({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  /* ───────────── reads ───────────── */
  /** The newest version of each tenant's licence the reader may see (the commercial authority: every tenant's), with its term end and the rules. */
  async licences(cap: GraceReads, tenantId: string | null): Promise<Row[]> {
    let q = cap.readLicences().selectAll().where('state' as never, '<>', 'superseded' as never);
    if (tenantId !== null) q = q.where('tenant_id' as never, '=', tenantId as never);
    const rows = (await q.orderBy('tenant_id' as never).orderBy('issued_at' as never, 'desc').limit(500).execute()) as Row[];
    return rows.map(strip);
  }

  /** THE STANDING (the /admin/commercial surface): every section of UX-67-001, in its order. */
  async standing(cap: GraceReads, tenantId: string): Promise<Row> {
    const rules = await cap.graceRules(tenantId);
    const versions = ((await cap.readLicences().selectAll().where('tenant_id' as never, '=', tenantId as never).orderBy('issued_at' as never, 'desc').orderBy('version' as never, 'desc').limit(100).execute()) as Row[]).map(strip);
    const transitions = ((await cap.readTransitions().selectAll().where('tenant_id' as never, '=', tenantId as never).orderBy('occurred_at' as never, 'desc').limit(100).execute()) as Row[]).map(strip);
    const policies = ((await cap.readPolicies().selectAll().where('tenant_id' as never, '=', tenantId as never).orderBy('version' as never, 'desc').execute()) as Row[]).map(strip);
    const tokens = ((await cap.readTokens().select(['token_id', 'licence_id', 'version', 'profile', 'payload_digest', 'key_id', 'issued_at', 'expires_at', 'issued_by', 'reason'] as never)
      .where('tenant_id' as never, '=', tenantId as never).orderBy('issued_at' as never, 'desc').limit(50).execute()) as Row[]).map(strip);
    const usage = await cap.usageThisMonth(tenantId);
    const licence = (rules['licence'] ?? null) as Row | null;
    const limits = (licence?.['limits'] ?? {}) as Row;
    const usageLines = usage.map((u) => {
      const limit = limits[u.dimension];
      const lim = typeof limit === 'number' ? limit : null;
      return { ...u, limit: lim, share: lim !== null && lim > 0 ? Number(u.quantity) / lim : null };
    });
    const seams: Row = {};
    for (const [key, rel] of [['caps', 'commercial.caps'], ['budgets', 'commercial.budgets']] as const) {
      seams[key] = (await cap.readable(rel)) ? { available: true, rows: (await cap.seamRows(rel, tenantId)).map(strip) }
        : { available: false, note: key === 'caps' ? 'the caps are §ME\'s (commercial.caps) — not present in this build' : 'the budgets are §LE\'s (commercial.budgets) — not present in this build' };
    }
    const lastNotice = transitions.find((t) => t['kind'] === 'renewal_notice') ?? null;
    return {
      tenant_id: tenantId,
      current: { state: rules['state'], contracted: rules['contracted'], determinate: rules['determinate'], indeterminate: rules['indeterminate'], explanation: rules['explanation'], licence },
      included: { capabilities: licence?.['capabilities'] ?? [], available_now: (rules['rules'] as Row | undefined)?.['capabilities'] ?? [], always_available: ALWAYS_AVAILABLE },
      limits_and_usage: { limits, usage: usageLines, period: 'this calendar month (the database\'s)', caps: seams['caps'], budgets: seams['budgets'] },
      renewal_and_continuity: { term_end: licence?.['term_end'] ?? null, renewal_notice_days: (rules['policy'] as Row | undefined)?.['renewal_notice_days'] ?? null, last_notice: lastNotice,
                                transitions, versions, tokens },
      grace: { policy: rules['policy'], policies, rules: rules['rules'], grace_until: licence?.['grace_until'] ?? null, last_valid: rules['last_valid'] },
      as_of: rules['as_of'],
    };
  }

  /** THE EXPLANATION (the simulations banner): the server's reason, the licence version, what stays available. §EN's gate answers the
   *  availability of an action when it exists (commercial.capability_available — the integrator's seam); this part states the licence. */
  async explanation(cap: GraceReads, tenantId: string, capabilityKey: string): Promise<Row> {
    const rules = await cap.graceRules(tenantId);
    const licence = (rules['licence'] ?? null) as Row | null;
    const r = (rules['rules'] ?? {}) as Row;
    const contracted = rules['contracted'] === true;
    const licensed = contracted && Array.isArray(r['capabilities']) && (r['capabilities'] as unknown[]).includes(capabilityKey);
    const state = String(rules['state']);
    const reason = !contracted ? null
      : licensed ? (state === 'grace' ? `in grace: ${capabilityKey} stays available as the grace policy allows — ${r['new_work'] === true ? 'new work may start' : r['finish_running_work'] === true ? 'running work may finish; no new work starts' : 'no work runs'}` : null)
      : `capability unavailable (entitlement): ${capabilityKey} is not licensed for this tenant (${state}; licence v${String(licence?.['version'] ?? '?')})`;
    return {
      capability: capabilityKey, contracted, state, licensed, available: !contracted || licensed, reason,
      licence: licence === null ? null : { licence_id: licence['licence_id'], version: licence['version'], package_key: licence['package_key'], capabilities: licence['capabilities'], term_end: licence['term_end'], grace_until: licence['grace_until'] },
      last_valid: rules['last_valid'] ?? null, explanation: rules['explanation'], always_available: ALWAYS_AVAILABLE, as_of: rules['as_of'],
    };
  }

  /* ───────────── writes (each the port's) ───────────── */
  async renew(cap: TransitionWrites, licenceId: string, i: RenewIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.renew({ transitionId: newId(), licenceId, version: i.version, renewedUntil: i.renewedUntil, reason: i.reason, evidence: i.evidence, actor, correlationId });
  }
  async suspend(cap: TransitionWrites, licenceId: string, i: TransitionIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.suspend({ transitionId: newId(), licenceId, version: i.version, reason: i.reason, evidence: i.evidence, actor, correlationId });
  }
  async reinstate(cap: TransitionWrites, licenceId: string, i: TransitionIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.reinstate({ transitionId: newId(), licenceId, version: i.version, reason: i.reason, evidence: i.evidence, actor, correlationId });
  }
  async setPolicy(cap: PolicyWrites, policyId: string, i: PolicyIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.setPolicy({ policyId, tenantId: i.tenantId, expectedVersion: i.expectedVersion, graceDays: i.graceDays, allows: i.allows, renewalNoticeDays: i.renewalNoticeDays, reason: i.reason, actor, correlationId });
  }

  /**
   * ISSUE AN OFFLINE TOKEN: the version's basis read under the reader's row security, the payload canonicalised (JCS), digested and signed with
   * the key the reference names (the value read from the environment at this moment, never logged), the signature checked against the derived
   * public key, then the port binds the record. A reference the deployment does not bind is refused here (422) before anything is written.
   */
  async issueToken(cap: TokenWrites, licenceId: string, tokenId: string, i: TokenIntake, actor: string, correlationId: string): Promise<{ record: Row; token: OfflineToken }> {
    const no = bad(correlationId);
    const key = this.keys.derivePublic(i.keyRef);
    if (!key.ok) no(`offline token rejected (key): the reference ${i.keyRef} binds no Ed25519 key in this deployment (${key.reason})`);
    const k = key as { ok: true; keyId: string; publicKeyPem: string };
    const basis = await cap.tokenBasis(licenceId, i.version);
    if (basis === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `offline token rejected (unknown_licence): licence ${licenceId} has no version ${i.version}`), 404);
    const expiresAt = await cap.instantText(i.expiresAt);
    if (expiresAt === null) no('expiresAt must be an instant');
    const payload: TokenPayload = {
      format: TOKEN_FORMAT, token_id: tokenId, tenant_id: String(basis['tenant_id']), profile: i.profile, issued_at: await cap.dbInstant(), expires_at: expiresAt as string,
      issuer: { principal_id: actor, key_id: k.keyId }, licence: basis as unknown as LicenceBasis,
    };
    const text = canonicalPayload(payload);
    const digest = sha256Hex(text);
    const signature = this.keys.sign(i.keyRef, digest);
    if (signature === null || !verifySignature(k.publicKeyPem, digest, signature)) no('offline token rejected (signature): the signature did not verify against the derived public key');
    const record = await cap.issueToken({ tokenId, licenceId, version: i.version, profile: i.profile, payloadText: text, payloadDigest: digest, signature: signature as string,
      keyRef: i.keyRef, keyId: k.keyId, publicKeyPem: k.publicKeyPem, expiresAt: expiresAt as string, reason: i.reason, actor, correlationId });
    return { record, token: { format: TOKEN_FORMAT, payload: text, payload_digest: digest, algorithm: TOKEN_ALGORITHM, signature: signature as string, key_id: k.keyId, public_key_pem: k.publicKeyPem } };
  }

  /** A token as it was issued (re-served from the record: the exact payload text and signature). */
  async token(cap: GraceReads, tokenId: string): Promise<{ record: Row; token: OfflineToken } | null> {
    const r = (await cap.readTokens().selectAll().where('token_id' as never, '=', tokenId as never).executeTakeFirst()) as Row | undefined;
    if (r === undefined) return null;
    return { record: strip({ ...r, payload_text: undefined, signature: undefined, public_key_pem: undefined }),
             token: { format: TOKEN_FORMAT, payload: String(r['payload_text']), payload_digest: String(r['payload_digest']), algorithm: TOKEN_ALGORITHM, signature: String(r['signature']),
                      key_id: String(r['key_id']), public_key_pem: String(r['public_key_pem']) } };
  }
}
