/**
 * CP-6 B90 §R (0095) — THE PRODUCT REGISTRY COMPLETED: the validation of what a route hands in (in plain words, before any port) and the
 * two orchestrations this part owns — the WITHDRAWAL and the RETIREMENT, each admitting the DPR's next version (0078's lifecycle idiom, as
 * 0094 §D's publication does: the SAME object at the next object_version, lifecycle withdrawn | archived, the reason in the header) BEFORE
 * the port, which refuses when the admission is missing — the whole write rolls back with the object. The degradation's wording for the
 * tick is a pure function here (unit-tested). Every figure a harness or the demonstration registers is SYNTHETIC.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { DPR_SCHEMA } from '../products.service.js';
import type { LifecycleWrites } from './consumers.capabilities.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };

export const CONTRACT_TEST_OUTCOMES = ['pass', 'fail'] as const;
export const SCORECARD_OVERALLS = ['ok', 'degraded', 'failing'] as const;
export const CONSUMER_STATES = ['registered', 'accepted', 'revoked', 'migrated'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function uuidOf(v: unknown, noun: string, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}
export function versionOf(v: unknown, noun: string, correlationId: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, `${noun} rejected (version): a declared version is named (an integer ≥ 1)`);
  return v as number;
}
export function reasonOf(v: unknown, noun: string, what: string, correlationId: string): string {
  const s = text(v);
  if (s.length < 8 || s.length > 2000) refuse(correlationId, `${noun} rejected (${what}): a governed act says why — 8 to 2000 characters`);
  return s;
}

export function validateConsumerRegister(p: Row, actor: string, correlationId: string): { consumer: string; consumerDomainId: string | null; purpose: string; impact: string | null } {
  const consumer = p['consumerPrincipalId'] === undefined || p['consumerPrincipalId'] === null ? actor : uuidOf(p['consumerPrincipalId'], 'data product consumer', 'consumer', correlationId);
  const consumerDomainId = p['consumerDomainId'] === undefined || p['consumerDomainId'] === null ? null : uuidOf(p['consumerDomainId'], 'data product consumer', 'consumer_domain', correlationId);
  const purpose = text(p['purpose']);
  if (purpose.length < 8 || purpose.length > 2000) refuse(correlationId, 'data product consumer rejected (purpose): a consumer states its purpose (8 to 2000 characters)');
  const impact = p['impact'] === undefined || p['impact'] === null ? null : text(p['impact']);
  if (impact !== null && impact.length > 2000) refuse(correlationId, 'data product consumer rejected (impact): the downstream impact is at most 2000 characters');
  return { consumer, consumerDomainId, purpose, impact: impact === '' ? null : impact };
}

export function validateContractTest(p: Row, correlationId: string): { version: number; outcome: string; evidence: Row } {
  const version = versionOf(p['version'], 'contract test', correlationId);
  const outcome = text(p['outcome']);
  if (!(CONTRACT_TEST_OUTCOMES as readonly string[]).includes(outcome)) refuse(correlationId, 'contract test rejected (outcome): a contract test passes or fails');
  const evidence = p['evidence'] === undefined ? {} : p['evidence'];
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) refuse(correlationId, 'contract test rejected (evidence): a contract test\'s evidence is an object');
  return { version, outcome, evidence: evidence as Row };
}

/** A period's cost: two DATE strings (the day each names), a decimal STRING amount with at most two places (an integer accepted; never a float), an ISO-4217 code, a basis. */
export function validateCost(p: Row, correlationId: string): { periodStart: string; periodEnd: string; amount: string; currency: string; basis: string; details: Row } {
  const periodStart = text(p['periodStart']); const periodEnd = text(p['periodEnd']);
  if (!DATE.test(periodStart) || !DATE.test(periodEnd)) refuse(correlationId, 'product cost rejected (period): periodStart and periodEnd are days (YYYY-MM-DD)');
  if (periodStart >= periodEnd) refuse(correlationId, 'product cost rejected (period): a period runs from a start day to a later end day');
  const amount = typeof p['amount'] === 'number' ? (Number.isInteger(p['amount']) ? String(p['amount']) : '') : text(p['amount']);
  if (!MONEY.test(amount)) refuse(correlationId, 'product cost rejected (amount): a cost is a non-negative decimal amount with at most two places (as a string, e.g. "1250.00"), never a float');
  const currency = text(p['currency']).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) refuse(correlationId, 'product cost rejected (currency): a currency is an ISO-4217 code');
  const basis = text(p['basis']);
  if (basis.length < 2 || basis.length > 400) refuse(correlationId, 'product cost rejected (basis): a cost names its basis (2–400 characters)');
  const details = p['details'] === undefined ? {} : p['details'];
  if (details === null || typeof details !== 'object' || Array.isArray(details)) refuse(correlationId, 'product cost rejected (details): a cost\'s details are an object');
  return { periodStart, periodEnd, amount, currency, basis, details: details as Row };
}

export function validateWindow(p: Row, correlationId: string): number | null {
  const w = p['windowDays'];
  if (w === undefined || w === null) return null;
  if (typeof w !== 'number' || !Number.isInteger(w) || w < 1 || w > 366) refuse(correlationId, 'product scorecard rejected (window): a scorecard window is 1 to 366 days');
  return w as number;
}

/** The tick's degradation reason, in words (the port records it; the consumers' items carry it). */
export function degradationReason(a: { attainmentPct: number; floorPct: number; consecutive: number; windowDays: number }): string {
  return `SLO attainment ${a.attainmentPct}% under the floor ${a.floorPct}% on ${a.consecutive} consecutive scorecard(s) over ${a.windowDays} day(s) — degraded by the attention tick step product-scorecards`;
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

@Injectable()
export class ConsumersService {
  /** The prior DPR header carried forward as its next lifecycle version (the publishing service's withdrawnHeader, for a DPR). */
  private nextHeader(prior: Row, a: { lifecycle: 'withdrawn' | 'archived'; objectVersion: number; actor: string; purpose: string; reason: string | null; now: string; correlationId: string }): CanonicalHeader {
    const ref = `DPR:${String(prior['object_id'])}@${String(prior['object_version'])}`;
    const clock = String(prior['source_clock_quality'] ?? 'trusted');
    const priorTruth = String(prior['truth_state'] ?? 'asserted');
    return {
      object_id: String(prior['object_id']), object_type: 'DPR', tenant_id: String(prior['tenant_id']), domain_id: String(prior['domain_id']), scope: 'DOMAIN', object_version: String(a.objectVersion), lifecycle_state: a.lifecycle,
      owning_component: String(prior['owning_component'] ?? 'CP-DAT-01'), accountable_owner: String(prior['accountable_owner'] ?? `principal:${a.actor}`), source_object_ids: strArr(prior['source_object_ids']),
      event_time: iso(prior['event_time']), observation_time: iso(prior['observation_time']), valid_from: iso(prior['valid_from']), valid_to: iso(prior['valid_to']), recorded_at: a.now,
      time_precision: String(prior['time_precision'] ?? 'exact'), source_clock_quality: (clock === 'trusted' || clock === 'degraded' ? clock : 'unknown') as CanonicalHeader['source_clock_quality'],
      truth_state: a.lifecycle === 'withdrawn' ? 'withdrawn' : (priorTruth === 'withdrawn' ? 'withdrawn' : 'asserted'), synthetic_state: prior['synthetic_state'] === true, confidence: null, uncertainty: null,
      evidence_refs: strArr(prior['evidence_refs']), provenance_ref: `principal:${a.actor}`, method_ref: a.lifecycle === 'withdrawn' ? 'products.withdraw/1' : 'products.retire/1',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.actor}`],
      classification: String(prior['classification'] ?? 'internal'), purpose_scope: a.purpose, rights_profile: (prior['rights_profile'] as string | null) ?? null, residency_profile: (prior['residency_profile'] as string | null) ?? null,
      retention_profile: (prior['retention_profile'] as string | null) ?? null, access_policy_ref: null, quality_profile: null,
      quality_state: { last_valid_version: Number((prior['payload'] as Row | null)?.['version'] ?? 0), declaration_digest: String((prior['payload'] as Row | null)?.['declaration_digest'] ?? '') }, freshness_state: null,
      schema_ref: String(prior['schema_ref'] ?? DPR_SCHEMA), ontology_ref: null, correction_of: a.lifecycle === 'withdrawn' ? ref : null, supersedes: ref,
      withdrawal_reason: a.lifecycle === 'withdrawn' ? a.reason : ((prior['withdrawal_reason'] as string | null) ?? null), audit_correlation_id: a.correlationId, content_ref: (prior['content_ref'] as string | null) ?? null,
    } as CanonicalHeader;
  }

  private async admit(cap: LifecycleWrites, header: CanonicalHeader, payload: Row, correlationId: string): Promise<{ contentDigest: string }> {
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `data product header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    return cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
  }

  /** WITHDRAW: the DPR's withdrawn version admitted first (the prior payload kept, its state withdrawn, the reason), then the port, which notifies the accepted consumers. */
  async withdraw(cap: LifecycleWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, productId: string, reason: string, correlationId: string): Promise<Row> {
    const p = await cap.product(productId);
    if (p === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `data product rejected (unknown_product): ${productId} is not a product of this domain`), 404);
    const prior = await cap.latestDpr(productId);
    let objectVersion = 0; let admitted: { contentDigest: string } | null = null;
    if (prior !== null && String(prior['lifecycle_state']) === 'active') {
      objectVersion = Number(prior['object_version']) + 1;
      const now = await cap.now();
      const header = this.nextHeader(prior, { lifecycle: 'withdrawn', objectVersion, actor: principal.principalId, purpose, reason, now, correlationId });
      admitted = await this.admit(cap, header, { ...((prior['payload'] ?? {}) as Row), state: 'withdrawn', withdrawal_reason: reason }, correlationId);
    }
    const r = await cap.withdraw({ productId, tenantId: scope.tenantId, domainId: scope.domainId, reason, objectVersion, actor: principal.principalId, eventId: newId(), correlationId });
    return { ...r, dpr: admitted === null ? null : { object_version: objectVersion, content_digest: admitted.contentDigest, schema_ref: DPR_SCHEMA, lifecycle_state: 'withdrawn' } };
  }

  /** RETIRE: the DPR's archived version admitted (a product that was ever released), then the port's retirement evidence rules. */
  async retire(cap: LifecycleWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, productId: string, correlationId: string): Promise<Row> {
    const p = await cap.product(productId);
    if (p === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `data product rejected (unknown_product): ${productId} is not a product of this domain`), 404);
    const prior = await cap.latestDpr(productId);
    let objectVersion: number | null = null; let admitted: { contentDigest: string } | null = null;
    if (prior !== null && String(prior['lifecycle_state']) !== 'archived') {
      objectVersion = Number(prior['object_version']) + 1;
      const now = await cap.now();
      const header = this.nextHeader(prior, { lifecycle: 'archived', objectVersion, actor: principal.principalId, purpose, reason: null, now, correlationId });
      admitted = await this.admit(cap, header, { ...((prior['payload'] ?? {}) as Row), state: 'retired' }, correlationId);
    }
    const r = await cap.retire({ productId, tenantId: scope.tenantId, domainId: scope.domainId, objectVersion, actor: principal.principalId, eventId: newId(), correlationId });
    return { ...r, dpr: admitted === null ? null : { object_version: objectVersion, content_digest: admitted.contentDigest, schema_ref: DPR_SCHEMA, lifecycle_state: 'archived' } };
  }
}
