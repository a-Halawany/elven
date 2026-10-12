/**
 * B94 (0114 §0) — THE SHARED VOCABULARY of customer onboarding and migration, the implementation programme and enablement, and the service
 * portal with governed support access: the attention classes and subject kinds the prelude added, the NOUNS every B94 refusal speaks in
 * (`<noun> rejected (<class>): …`, mapped centrally in observation-errors.ts `B94 §0`), the refusal helper, the service idiom (the
 * pipeline's read / write with a TENANT or DOMAIN route) and the boundary statement. Parts add nothing here — ask the integrator.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this software and its harnesses); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK records —
 * an in-product approval by a synthetic persona demonstrates the software only); REAL CUSTOMER ACCEPTANCE (AT-67/68/69, PR-6x-006, UX-66-006:
 * R2, never claimed). Production admission and profile parity: R1 / B111.
 */
import { HttpException } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { newId } from '../shared/ids.js';
import type { PipelineService, RouteInfo } from '../pipeline/pipeline.service.js';
import type { CapabilityFactory } from '../shared/capabilities.js';

export const B94_SIGNAL_CLASSES = ['onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap'] as const;
export const B94_SUBJECT_KINDS = ['onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case',
  'support_grant', 'responsibility_matrix'] as const;
export const B94_ROLES = { sponsor: 'customer_sponsor', authority: 'onboarding_authority', lead: 'implementation_lead', engineer: 'support_engineer', assessor: 'enablement_assessor' } as const;

/** Every B94 noun (the error rows in observation-errors.ts `B94 §0` cover exactly these). */
export type DeliveryNoun =
  // §ON
  | 'onboarding programme' | 'onboarding step' | 'sponsor intent' | 'config baseline' | 'domain draft'
  // §MG
  | 'migration wave' | 'migration mapping' | 'migration rehearsal' | 'migration cutover' | 'migration rollback' | 'onboarding acceptance'
  // §IM
  | 'implementation programme' | 'readiness item' | 'go-live gate' | 'implementation change'
  // §AD
  | 'training path' | 'training record' | 'competence record' | 'adoption cohort' | 'shadow finding'
  // §SV
  | 'service case' | 'service problem' | 'service change' | 'known error' | 'evidence bundle' | 'service commitment' | 'value review'
  // §SA
  | 'support grant' | 'support access' | 'responsibility matrix' | 'accountable owner' | 'admission record' | 'control drill';
export const DELIVERY_NOUNS: readonly DeliveryNoun[] = [
  'onboarding programme', 'onboarding step', 'sponsor intent', 'config baseline', 'domain draft',
  'migration wave', 'migration mapping', 'migration rehearsal', 'migration cutover', 'migration rollback', 'onboarding acceptance',
  'implementation programme', 'readiness item', 'go-live gate', 'implementation change',
  'training path', 'training record', 'competence record', 'adoption cohort', 'shadow finding',
  'service case', 'service problem', 'service change', 'known error', 'evidence bundle', 'service commitment', 'value review',
  'support grant', 'support access', 'responsibility matrix', 'accountable owner', 'admission record', 'control drill',
];

const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');
/** A refusal in the class form, answered by a route before any port runs (the caller's own request). */
export function refuseDelivery(noun: DeliveryNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

export const BOUNDARY = 'construction, demonstrated operation and real customer acceptance are three different claims: an in-product approval or acceptance by a SYNTHETIC persona demonstrates the software only; real customer acceptance (AT-67/68/69, PR-67/68/69-006, UX-66-006) is R2; production admission and deployment-profile parity (IA-04-004/-006) are R1/B111.';

/** The route of a TENANT-level act (a programme, a matrix's tenant view) or a DOMAIN-level one. */
export type DeliveryRoute = RouteInfo & { scope: 'TENANT' | 'DOMAIN'; tenantId: string };
export const tenantRoute = (tenantId: string, action: string, objectType: string | null, objectId: string | null): DeliveryRoute =>
  ({ scope: 'TENANT', tenantId, domainId: null, action, objectType, objectId });
export const domainRoute = (tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null): DeliveryRoute =>
  ({ scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId });
export function derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
  return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
}
export const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

/** The part services' governed read (audited consequential read: B33-H — it fails closed if the context expired mid-read) and write. */
export function governedRead<C, T>(pipeline: PipelineService, env: Envelope, p: AuthenticatedPrincipal, route: DeliveryRoute, cap: CapabilityFactory<C>, fn: (c: C) => Promise<T>) {
  return pipeline.consequentialRead(derive(env, route.action, route.objectType, route.objectId), p, route, cap, async (c) => fn(c));
}
export function governedWrite<C, T>(pipeline: PipelineService, env: Envelope, p: AuthenticatedPrincipal, route: DeliveryRoute, cap: CapabilityFactory<C>,
                                    fn: (c: C) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
  return pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, cap,
    async (c) => { const r = await fn(c); return { result: r.result, targetType: r.targetType ?? route.objectType, targetId: r.targetId ?? route.objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
}
