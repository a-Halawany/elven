/**
 * The data product registry client — CP-6 B90 part `products` (0095 §0 + §R; F-P7-F-09).
 *
 * Every response is returned VERBATIM (the Graph client's rule): a product's state, a scorecard's verdict and its reasons, a consumer's
 * state, a contract test's outcome — rendered exactly as the server computed them AS OF the instant the answer states. Nothing is scored
 * here. Money is a decimal STRING with its ISO-4217 code, never a float, and is passed back as such. The acts are the person's OWN: the
 * owner releases, degrades, restores, withdraws and retires; the consumer registers itself and ACCEPTS (nobody accepts for it); the
 * steward registers, reviews and computes; the server refuses anyone the policy or the port does not name.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type ProductState = 'registered' | 'released' | 'degraded' | 'withdrawn' | 'retired';
export type Overall = 'ok' | 'degraded' | 'failing';
export type ConsumerState = 'registered' | 'accepted' | 'revoked' | 'migrated';
export type ReviewKind = 'admission' | 'domain' | 'retirement';
export type Decimal = string | number;

export interface ProductRow {
  product_id: string; product_key: string; title: string; kind: string; purpose: string; owner_principal_id: string; registered_by: string; state: ProductState;
  current_version: number; released_version: number | null; declaration: Record<string, unknown> | null; declaration_digest: string | null;
  degraded_reason: string | null; degraded_at: string | null; withdrawn_at: string | null; withdrawn_by: string | null; withdrawal_reason: string | null;
  retired_at: string | null; retired_by: string | null; registered_at: string; updated_at: string;
}
export interface ProductListRow extends ProductRow { scorecard: { overall: Overall; attainment_pct: Decimal | null; floor_pct: Decimal; below_floor: boolean; computed_at: string } | null }
export interface VersionRow { version: number; digest: string; declared_by: string; declared_at: string; released_by: string | null; released_at: string | null }
export interface ReviewRow { review_id: string; product_id: string; version: number; kind: ReviewKind; outcome: 'accepted' | 'rejected' | 'deferred'; reviewer_principal_id: string; notes: string; evidence: Record<string, unknown>; reviewed_at: string }
export interface ProductView extends ProductRow { versions: VersionRow[]; reviews: ReviewRow[]; slo: Record<string, { value: Decimal; threshold: Decimal | null; met: boolean; observed_at: string; source: string }> }
export interface SloMeasure { observations: number; met: number; attainment_pct: Decimal; last_value: Decimal; threshold: Decimal | null; last_observed_at: string }
export interface ScorecardRow {
  scorecard_id: string; product_id: string; computed_at: string; computed_by: string; window_days: number; state_at: string; released_version: number | null;
  slo: Record<string, SloMeasure>; attainment_pct: Decimal | null; floor_pct: Decimal; below_floor: boolean;
  reviews: Record<string, { outcome: string; version: number; reviewed_at: string; reviewer_principal_id: string }>;
  consumers: { registered: number; accepted: number; revoked: number; migrated: number }; contract_tests: { pass: number; fail: number; version: number | null };
  lineage_closed: boolean; policy_closed: boolean; cost: CostRow | null; overall: Overall; reasons: string[]; digest: string;
}
export interface ScorecardSummary { scorecard_id: string; computed_at: string; computed_by: string; overall: Overall; attainment_pct: Decimal | null; floor_pct: Decimal; below_floor: boolean; window_days: number; state_at: string; digest: string }
export interface ConsumerRow {
  consumer_id: string; product_id: string; consumer_principal_id: string; consumer_domain_id: string | null; purpose: string; impact: string | null; contract_version: number; state: ConsumerState;
  usage: Record<string, unknown>; registered_by: string; registered_at: string; accepted_at: string | null; accepted_by: string | null; revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null;
  migrated_from: string | null; migrated_to: string | null; migrated_at: string | null; updated_at: string;
}
export interface ContractTestRow { test_id: string; product_id: string; consumer_id: string; version: number; outcome: 'pass' | 'fail'; evidence: Record<string, unknown>; recorded_by: string; recorded_at: string }
export interface CostRow { attribution_id: string; product_id: string; period_start: string; period_end: string; amount: Decimal; currency: string; basis: string; details: Record<string, unknown>; attributed_by: string; attributed_at: string }
export interface ObservationRow { observation_id: string; product_id: string; measure: string; value: Decimal; threshold: Decimal | null; met: boolean; source: string; details: Record<string, unknown>; observed_at: string; observed_by: string }
export interface EventRow { event_id: string; event: string; occurred_at: string; actor_principal_id: string | null; details: Record<string, unknown> }
export interface ScorecardView { product_id: string; scorecard: ScorecardRow | null; scorecards: ScorecardSummary[]; consumers: ConsumerRow[]; contract_tests: ContractTestRow[]; cost: CostRow[]; observations: ObservationRow[]; events: EventRow[] }
export interface ProductPage { at: string; product: ProductView; scorecard: ScorecardView; receipt: Receipt }

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const STATE_LABEL: Record<ProductState, string> = {
  registered: '○ registered — no version released yet',
  released: '● released — the contract is served',
  degraded: '◐ degraded — served, its levels missed; the consumers were notified',
  withdrawn: '⊘ withdrawn — the last released version stays readable as the last valid one',
  retired: '■ retired — retirement reviewed; no consumer remained',
};
export const OVERALL_LABEL: Record<Overall, string> = {
  ok: '✓ ok — the levels held, the reviews stand, lineage and policy closed',
  degraded: '◐ degraded — something is open (see the reasons)',
  failing: '✗ failing — the attainment is under the floor, or every contract test fails',
};
export const CONSUMER_STATE_LABEL: Record<ConsumerState, string> = {
  registered: '○ registered — the consumer has not accepted the contract yet',
  accepted: '● accepted — the consumer accepted this contract version itself',
  revoked: '⊘ revoked',
  migrated: '→ migrated to a newer version (a new row continues it)',
};
export const PRODUCT_KINDS = ['object', 'evidence', 'dataset', 'graph', 'memory', 'twin_snapshot', 'forecast', 'scenario', 'simulation', 'decision', 'briefing',
  'metric', 'event', 'search', 'vector', 'feature', 'evaluation_dataset', 'context', 'export', 'marketplace'] as const;

/** The attainment in words: the server's percentage against the declared floor — never recomputed, only worded. */
export function attainmentLine(s: { attainment_pct: Decimal | null; floor_pct: Decimal; below_floor: boolean; window_days: number }): string {
  if (s.attainment_pct === null) return `no SLO observation in the last ${s.window_days} day(s) — attainment unknown (floor ${s.floor_pct}%)`;
  return `attainment ${s.attainment_pct}% vs floor ${s.floor_pct}% over ${s.window_days} day(s)${s.below_floor ? ' — UNDER THE FLOOR' : ''}`;
}
/** A cost line keeps the server's decimal string and its currency; the period's days are rendered as the days they name. */
export function costLine(c: { period_start: string; period_end: string; amount: Decimal; currency: string; basis: string }): string {
  return `${c.period_start} → ${c.period_end}: ${c.amount} ${c.currency} (${c.basis})`;
}
/** The acts a product's state admits and WHO holds each (the PDP names the roles; the port asserts the person). */
export function actsOf(state: ProductState): Array<{ act: 'release' | 'degrade' | 'restore' | 'withdraw' | 'retire'; by: string }> {
  switch (state) {
    case 'registered': return [{ act: 'release', by: 'the owner — after an accepted admission review of the version by someone else' }, { act: 'retire', by: 'the owner — after an accepted retirement review' }];
    case 'released': return [{ act: 'release', by: 'the owner — a newer reviewed version' }, { act: 'degrade', by: 'the owner or the data steward — with a reason; every accepted consumer is notified' },
      { act: 'withdraw', by: 'the owner — with a reason; the released version stays the last valid one' }, { act: 'retire', by: 'the owner — no accepted consumer, an accepted retirement review' }];
    case 'degraded': return [{ act: 'restore', by: 'the owner — through a scorecard that reads ok or a domain review newer than the degradation' }, { act: 'release', by: 'the owner — a controlled release also restores' },
      { act: 'withdraw', by: 'the owner — with a reason' }, { act: 'retire', by: 'the owner — no accepted consumer, an accepted retirement review' }];
    case 'withdrawn': return [{ act: 'retire', by: 'the owner — no accepted consumer, an accepted retirement review' }];
    case 'retired': return [];
  }
}
export const short = (id: string | null | undefined): string => (id === null || id === undefined ? '—' : `${id.slice(0, 8)}…`);

/* ───────────── the calls ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/products`;
const env = (s: Scope, action: string, objectId: string | null, read = false) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'DPR', object_id: objectId, purpose_id: 'executive',
  consequence_class: 'C2' as const, side_effect_class: read ? ('none' as const) : ('reversible' as const),
});
type R<T> = Promise<ApiResult<T & { receipt: Receipt }>>;

export const products = {
  list: (s: Scope, payload: { state?: string; kind?: string } = {}): R<{ at: string; products: ProductListRow[] }> => call(`${base(s)}/scorecards/list`, env(s, 'products.product.read', null, true), payload),
  view: (s: Scope, productId: string): R<{ at: string; product: ProductView; scorecard: ScorecardView }> => call(`${base(s)}/${productId}/scorecard`, env(s, 'products.product.read', productId, true), {}),
  register: (s: Scope, p: { key: string; title: string; kind: string; purpose: string; ownerPrincipalId: string }): R<{ product: ProductRow }> => call(`${base(s)}/register`, env(s, 'products.product.register', null), p),
  declare: (s: Scope, productId: string, declaration: Record<string, unknown>): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/declare`, env(s, 'products.product.declare', productId), { declaration }),
  review: (s: Scope, productId: string, p: { version: number; kind: ReviewKind; outcome: string; notes: string }): R<{ review: ReviewRow }> => call(`${base(s)}/${productId}/reviews`, env(s, 'products.product.review', productId), p),
  release: (s: Scope, productId: string, version: number): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/release`, env(s, 'products.product.release', productId), { version }),
  observe: (s: Scope, productId: string, p: { measure: string; value: number; threshold: number | null; met: boolean; source: string }): R<{ observation: ObservationRow }> => call(`${base(s)}/${productId}/slo`, env(s, 'products.slo.observe', productId), p),
  registerConsumer: (s: Scope, productId: string, p: { purpose: string; impact?: string; consumerPrincipalId?: string }): R<{ consumer: ConsumerRow }> => call(`${base(s)}/${productId}/consumers/register`, env(s, 'products.consumer.register', productId), p),
  accept: (s: Scope, productId: string, consumerId: string, version: number): R<{ consumer: ConsumerRow }> => call(`${base(s)}/${productId}/consumers/${consumerId}/accept`, env(s, 'products.consumer.accept', productId), { version }),
  revokeConsumer: (s: Scope, productId: string, consumerId: string, reason: string): R<{ consumer: ConsumerRow }> => call(`${base(s)}/${productId}/consumers/${consumerId}/revoke`, env(s, 'products.consumer.revoke', productId), { reason }),
  migrate: (s: Scope, productId: string, consumerId: string, version: number): R<{ consumer: ConsumerRow }> => call(`${base(s)}/${productId}/consumers/${consumerId}/migrate`, env(s, 'products.consumer.migrate', productId), { version }),
  contractTest: (s: Scope, productId: string, consumerId: string, p: { version: number; outcome: 'pass' | 'fail'; evidence?: Record<string, unknown> }): R<{ test: ContractTestRow }> => call(`${base(s)}/${productId}/consumers/${consumerId}/contract-tests`, env(s, 'products.product.contract_test', productId), p),
  cost: (s: Scope, productId: string, p: { periodStart: string; periodEnd: string; amount: string; currency: string; basis: string }): R<{ attribution: CostRow }> => call(`${base(s)}/${productId}/cost`, env(s, 'products.product.cost.attribute', productId), p),
  compute: (s: Scope, productId: string, windowDays?: number): R<{ scorecard: ScorecardRow }> => call(`${base(s)}/${productId}/scorecard/compute`, env(s, 'products.product.scorecard.compute', productId), windowDays === undefined ? {} : { windowDays }),
  degrade: (s: Scope, productId: string, reason: string): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/degrade`, env(s, 'products.product.degrade', productId), { reason }),
  restore: (s: Scope, productId: string, note: string | null): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/restore`, env(s, 'products.product.restore', productId), note === null ? {} : { note }),
  withdraw: (s: Scope, productId: string, reason: string): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/withdraw`, env(s, 'products.product.withdraw', productId), { reason }),
  retire: (s: Scope, productId: string): R<{ product: ProductRow }> => call(`${base(s)}/${productId}/retire`, env(s, 'products.product.retire', productId), {}),
};
