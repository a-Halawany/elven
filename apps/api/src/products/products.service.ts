/**
 * CP-6 B90 §0 (0095) — THE DATA PRODUCT REGISTRY CORE (F-P7-F-09/-10/-11's shared registry): the validation of what a route hands in and
 * the ONE orchestration the prelude owns — the RELEASE, which admits the canonical DPR version (objects.admit_version under
 * products.product.release; the payload IS the released declaration with its reviews) BEFORE the port, which refuses a missing admission,
 * a missing contract, a missing accepted admission review, a duplicate canonical authority, or anyone but the owner — the whole write
 * rolls back with the object. Every figure a harness or the demonstration registers is SYNTHETIC.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { newId } from '../shared/ids.js';
import type { ProductWrites } from './products.capabilities.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };

export const DPR_SCHEMA = 'DPR@v1';
export const PRODUCT_KINDS = ['object', 'evidence', 'dataset', 'graph', 'memory', 'twin_snapshot', 'forecast', 'scenario', 'simulation', 'decision', 'briefing',
  'metric', 'event', 'search', 'vector', 'feature', 'evaluation_dataset', 'context', 'export', 'marketplace'] as const;
export const REVIEW_KINDS = ['admission', 'domain', 'retirement'] as const;
export const REVIEW_OUTCOMES = ['accepted', 'rejected', 'deferred'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
export function assertUuid(v: unknown, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `data product rejected (${what}): a uuid is required`);
  return v as string;
}

export function validateRegister(p: Row, correlationId: string): { key: string; title: string; kind: string; purpose: string; owner: string } {
  const key = str(p, 'key'); const title = str(p, 'title'); const kind = str(p, 'kind'); const purpose = str(p, 'purpose');
  if (key === null || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(key)) refuse(correlationId, 'data product rejected (key): a product key is 2–64 lower-case letters, digits, dots and dashes');
  if (title === null || title.trim().length < 2 || title.trim().length > 200) refuse(correlationId, 'data product rejected (title): a title is 2–200 characters');
  if (kind === null || !(PRODUCT_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `data product rejected (kind): ${kind ?? 'null'} is not a product kind (App G DPD-01..20)`);
  if (purpose === null || purpose.trim().length < 8) refuse(correlationId, 'data product rejected (purpose): a product states its purpose (8+ characters)');
  const owner = assertUuid(p['ownerPrincipalId'], 'owner', correlationId);
  return { key: key as string, title: (title as string).trim(), kind: kind as string, purpose: (purpose as string).trim(), owner };
}

/** The declaration's SHAPE (the port judges its content — the schema references, the kinds — against the registry). */
export function validateDeclaration(p: Row, correlationId: string): Row {
  const d = p['declaration'];
  if (d === null || typeof d !== 'object' || Array.isArray(d)) refuse(correlationId, 'data product rejected (declaration): a declaration is an object');
  const dd = d as Row;
  for (const k of ['contract', 'slo', 'policy', 'cost', 'quality']) {
    if (dd[k] === null || typeof dd[k] !== 'object' || Array.isArray(dd[k])) refuse(correlationId, `data product rejected (declaration): a declaration carries a ${k} object`);
  }
  for (const k of ['serving_modes', 'inputs', 'outputs']) {
    if (!Array.isArray(dd[k])) refuse(correlationId, `data product rejected (declaration): a declaration carries ${k} (an array)`);
  }
  return dd;
}

export function validateReview(p: Row, correlationId: string): { version: number; kind: string; outcome: string; notes: string; evidence: Row } {
  const version = typeof p['version'] === 'number' && Number.isInteger(p['version']) && (p['version'] as number) >= 1 ? (p['version'] as number) : null;
  if (version === null) refuse(correlationId, 'data product rejected (version): a review names a declared version (an integer ≥ 1)');
  const kind = str(p, 'kind'); const outcome = str(p, 'outcome'); const notes = str(p, 'notes');
  if (kind === null || !(REVIEW_KINDS as readonly string[]).includes(kind)) refuse(correlationId, 'data product rejected (review_kind): a review is an admission, domain or retirement review');
  if (outcome === null || !(REVIEW_OUTCOMES as readonly string[]).includes(outcome)) refuse(correlationId, 'data product rejected (outcome): a review\'s outcome is accepted, rejected or deferred');
  if (notes === null || notes.trim().length < 8) refuse(correlationId, 'data product rejected (notes): a review carries notes (8+ characters)');
  const evidence = p['evidence'] === undefined ? {} : p['evidence'];
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) refuse(correlationId, 'data product rejected (evidence): a review\'s evidence is an object');
  return { version: version as number, kind: kind as string, outcome: outcome as string, notes: (notes as string).trim(), evidence: evidence as Row };
}

export function validateVersion(p: Row, correlationId: string): number {
  const version = p['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) refuse(correlationId, 'data product rejected (version): a release names a declared version (an integer ≥ 1)');
  return version as number;
}

export function validateObservation(p: Row, correlationId: string): { measure: string; value: number; threshold: number | null; met: boolean; source: string; details: Row } {
  const measure = str(p, 'measure'); const source = str(p, 'source');
  if (measure === null || !/^[a-z][a-z0-9_]{1,63}$/.test(measure)) refuse(correlationId, 'data product rejected (measure): an SLO measure is a lower-case identifier');
  if (typeof p['value'] !== 'number' || !Number.isFinite(p['value'])) refuse(correlationId, 'data product rejected (observation): an observation carries a numeric value');
  if (typeof p['met'] !== 'boolean') refuse(correlationId, 'data product rejected (observation): an observation says whether the level was met');
  if (p['threshold'] !== undefined && p['threshold'] !== null && (typeof p['threshold'] !== 'number' || !Number.isFinite(p['threshold']))) refuse(correlationId, 'data product rejected (observation): a threshold is numeric');
  if (source === null || source.trim().length < 2 || source.trim().length > 120) refuse(correlationId, 'data product rejected (source): an observation names its source');
  const details = p['details'] === undefined ? {} : p['details'];
  if (details === null || typeof details !== 'object' || Array.isArray(details)) refuse(correlationId, 'data product rejected (details): an observation\'s details are an object');
  return { measure: measure as string, value: p['value'] as number, threshold: (p['threshold'] as number | undefined) ?? null, met: p['met'] as boolean, source: (source as string).trim(), details: details as Row };
}

@Injectable()
export class ProductsService {
  /** THE RELEASE: read the product and the version, admit the DPR object (the released declaration with its reviews), then the port. */
  async release(cap: ProductWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, productId: string, version: number, correlationId: string): Promise<Row> {
    const p = await cap.product(productId);
    if (p === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `data product rejected (unknown_product): ${productId} is not a product of this domain`), 404);
    const v = await cap.version(productId, version);
    if (v === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `data product rejected (unknown_version): product ${String(p['product_key'])} has no version ${version}`), 404);
    const prior = await cap.latestObjectVersion(productId);
    // the port's newer-than rule, judged here too: the admission would otherwise refuse a duplicate DPR version before the port could say why
    if (prior !== null && version <= prior) throw new HttpException(errorBody('EYE_STA_002', correlationId, `data product rejected (state): version ${version} of product ${String(p['product_key'])} is not newer than the released version ${prior}`), 409);
    const reviews = (Array.isArray(p['reviews']) ? (p['reviews'] as Row[]) : []).filter((r) => Number(r['version']) === version)
      .map((r) => ({ review_id: String(r['review_id']), kind: String(r['kind']), outcome: String(r['outcome']), reviewer_principal_id: String(r['reviewer_principal_id']), reviewed_at: String(r['reviewed_at']) }));
    const payload: Row = {
      product_id: productId, product_key: String(p['product_key']), title: String(p['title']), kind: String(p['kind']), purpose: String(p['purpose']), owner_principal_id: String(p['owner_principal_id']),
      version, state: 'released', declaration: v['declaration'], declaration_digest: String(v['digest']), reviews, degraded_reason: null, withdrawal_reason: null,
    };
    const priorRef = prior === null ? null : `DPR:${productId}@${prior}`;
    const header: CanonicalHeader = {
      object_id: productId, object_type: 'DPR', tenant_id: scope.tenantId, domain_id: scope.domainId, scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active',
      owning_component: 'CP-DAT-01', accountable_owner: `principal:${String(p['owner_principal_id'])}`,
      source_object_ids: [],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: new Date().toISOString(), time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${principal.principalId}`, method_ref: 'products.release/1',
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${String(p['owner_principal_id'])}`, `principal:${principal.principalId}`])],
      classification: 'internal', purpose_scope: purpose, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: { declaration_digest: String(v['digest']) }, freshness_state: null, schema_ref: DPR_SCHEMA, ontology_ref: null,
      correction_of: null, supersedes: priorRef, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    } as CanonicalHeader;
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `data product header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    const admitted = await cap.admitObject(header, payload, headerDigest);
    const r = await cap.releaseProduct({ productId, tenantId: scope.tenantId, domainId: scope.domainId, version, actor: principal.principalId, eventId: newId(), correlationId });
    return { ...r, dpr: { object_version: version, content_digest: admitted.contentDigest, schema_ref: DPR_SCHEMA } };
  }
}
