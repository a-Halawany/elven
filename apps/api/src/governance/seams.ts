/**
 * B107 (0115 §0) — THE SHARED VOCABULARY of product governance: registries and traceability (§RG), conformance manifests (§CM), data
 * governance and ownership (§DR), the product-governance workspace (§PG), acceptance records (§AR) and design governance (§DG). The NOUNS
 * every B107 refusal speaks in (`<noun> rejected (<class>): …`, mapped centrally in observation-errors.ts `B107 §0`), the refusal helper,
 * the routes (PLATFORM for the vendor's registries, DOMAIN for acceptance records), the governed read/write idiom and the boundary.
 * Parts add nothing here — ask the integrator.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses); DEMONSTRATED OPERATION (the act — every record
 * `claim = 'demonstration'`); REAL ACCEPTANCE (named independent / customer authorities, production admission: R1/R2/H2/H3 — never claimed;
 * no record of 0115 can carry it).
 */
import { HttpException } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { newId } from '../shared/ids.js';
import type { PipelineService, RouteInfo } from '../pipeline/pipeline.service.js';
import type { CapabilityFactory } from '../shared/capabilities.js';

export const B107_SIGNAL_CLASSES = ['governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership'] as const;
export const B107_SUBJECT_KINDS = ['acceptance_record', 'governance_exception', 'release_candidate', 'conformance_finding', 'stewardship_case', 'design_contribution', 'change_proposal'] as const;
export const B107_ROLES = { product: 'product_authority', design: 'design_system_authority', assurance: 'independent_assurance', operations: 'operations_authority', steward: 'conformance_steward' } as const;

/** Every B107 noun (the error rows in observation-errors.ts `B107 §0` cover exactly these). */
export type GovernanceNoun =
  // §RG
  | 'requirement registry' | 'trace link' | 'change impact' | 'verification record' | 'governance fixture'
  // §CM
  | 'conformance manifest' | 'release candidate' | 'conformance finding'
  // §DR
  | 'data authority' | 'ownership record' | 'stewardship case'
  // §PG
  | 'product baseline' | 'decision rights' | 'governance exception' | 'conformance conflict' | 'change proposal' | 'governance record'
  // §AR
  | 'acceptance record' | 'acceptance attestation' | 'operational acceptance'
  // §DG
  | 'design baseline' | 'design contribution' | 'design acceptance' | 'design principle' | 'conformance package'
  // §0
  | 'governance hold';
export const GOVERNANCE_NOUNS: readonly GovernanceNoun[] = [
  'requirement registry', 'trace link', 'change impact', 'verification record', 'governance fixture',
  'conformance manifest', 'release candidate', 'conformance finding',
  'data authority', 'ownership record', 'stewardship case',
  'product baseline', 'decision rights', 'governance exception', 'conformance conflict', 'change proposal', 'governance record',
  'acceptance record', 'acceptance attestation', 'operational acceptance',
  'design baseline', 'design contribution', 'design acceptance', 'design principle', 'conformance package',
  'governance hold',
];

const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');
/** A refusal in the class form, answered by a route before any port runs (the caller's own request). */
export function refuseGovernance(noun: GovernanceNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

export const BOUNDARY = 'construction, demonstrated operation and real acceptance are three different claims: every in-product record is `claim = demonstration`; real acceptance by named independent and customer authorities, production admission and independent review are R1/R2/H2/H3 and never claimed. B65 (signed releases) is substituted by a local release-candidate record — not a release; B64 (SLO computation) by declared targets.';

/** The route of a vendor-side (PLATFORM) act, or a tenant-side DOMAIN act (an acceptance record). */
export type GovernanceRoute = RouteInfo;
export const platformRoute = (action: string, objectType: string | null, objectId: string | null): GovernanceRoute =>
  ({ scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId });
export const domainRoute = (tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null): GovernanceRoute =>
  ({ scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId });
export function derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
  return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
}
export const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

/** The governed read (audited consequential read — B33-H: fails closed if the context expired mid-read) and write. */
export function governedRead<C, T>(pipeline: PipelineService, env: Envelope, p: AuthenticatedPrincipal, route: GovernanceRoute, cap: CapabilityFactory<C>, fn: (c: C) => Promise<T>) {
  return pipeline.consequentialRead(derive(env, route.action, route.objectType, route.objectId), p, route, cap, async (c) => fn(c));
}
export function governedWrite<C, T>(pipeline: PipelineService, env: Envelope, p: AuthenticatedPrincipal, route: GovernanceRoute, cap: CapabilityFactory<C>,
                                    fn: (c: C) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
  return pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, cap,
    async (c) => { const r = await fn(c); return { result: r.result, targetType: r.targetType ?? route.objectType, targetId: r.targetId ?? route.objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
}
