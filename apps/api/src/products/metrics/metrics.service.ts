/**
 * CP-6 B90 §M (0095) — THE SEMANTIC ANALYTICS LAYER AND CERTIFIED METRICS (F-P7-F-10; V7 ch44 DP-44-001..006; DAT-SV-04; the Strategic
 * Health Score data model, V0 C-034): the validation of what a route hands in — a DECLARATIVE definition (a whitelisted measure, a unit,
 * an aggregation, a grain, dimensions, filters, an effective instant; never an expression) — and the ONE orchestration this part owns:
 * the CERTIFICATION, which SIGNS the version's digest through §0's signer (kind metric_certification, under products.metric.certify),
 * admits the canonical MET object (objects.admit_version; the payload IS the certified definition with its certification), then the port,
 * which refuses a missing signature or object, anyone but the owner, a conflict with another certified model, an expiry beyond 366 days
 * — the whole write rolls back with the object. The tick step `metric-certification` (order 65) sweeps expired certifications.
 * Every figure a harness or the demonstration registers is SYNTHETIC.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { SignatureService } from '../../executive/signatures/signature.service.js';
import { MetricCapability, type MetricWrites } from './metrics.capabilities.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };

export const MET_SCHEMA = 'MET@v1';
export const METRIC_CERTIFICATION_SIGNATURE_KIND = 'metric_certification' as const;
export const METRIC_CERTIFICATION_STEP = 'metric-certification';
export const METRIC_CERTIFICATION_ORDER = 65;
export const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'last', 'count'] as const;
export const VIEWS = ['executive', 'analyst'] as const;
/** The longest certification (DP-44-005): 366 days. */
export const MAX_CERTIFICATION_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z][a-z0-9_]{1,63}$/;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
export function assertUuid(v: unknown, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `metric rejected (${what}): a uuid is required`);
  return v as string;
}
/** An instant the caller states (ISO 8601); NULL when absent. The database judges it against its own clock. */
export function instantOf(v: unknown, what: string, correlationId: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) refuse(correlationId, `metric rejected (${what}): an instant is an ISO 8601 timestamp`);
  return new Date(v as string).toISOString();
}
/** The filters: an object of dimension → scalar (the port judges the dimensions against the declaration). */
export function filtersOf(v: unknown, correlationId: string): Row | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) refuse(correlationId, 'metric rejected (filter): filters are an object of dimension → value');
  for (const [k, x] of Object.entries(v as Row)) {
    if (!IDENT.test(k)) refuse(correlationId, `metric rejected (filter): ${k} is not a dimension name`);
    if (x === null || (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean')) refuse(correlationId, `metric rejected (filter): filter ${k} is a scalar value`);
  }
  return v as Row;
}

/** THE DEFINITION's shape (the port judges its content against the whitelist): measure, unit, aggregation, grain, dimensions[], filters{}, effectiveFrom?. */
export function validateDefinition(p: Row, correlationId: string): { title: string | null; measure: string; unit: string; aggregation: string; grain: string; dimensions: string[]; filters: Row; effectiveFrom: string | null } {
  const measure = str(p, 'measure'); const unit = str(p, 'unit'); const aggregation = str(p, 'aggregation'); const grain = str(p, 'grain'); const title = str(p, 'title');
  if (measure === null || !IDENT.test(measure)) refuse(correlationId, 'metric rejected (measure): a definition names a whitelisted measure (a lower-case identifier) — never an expression');
  if (unit === null || unit.trim().length < 1 || unit.trim().length > 32) refuse(correlationId, 'metric rejected (unit): a unit is 1–32 characters');
  if (aggregation === null || !(AGGREGATIONS as readonly string[]).includes(aggregation)) refuse(correlationId, `metric rejected (aggregation): an aggregation is one of ${AGGREGATIONS.join(', ')}`);
  if (grain === null || !IDENT.test(grain)) refuse(correlationId, 'metric rejected (grain): a definition names a grain (a lower-case identifier)');
  const dims = p['dimensions'] === undefined ? [] : p['dimensions'];
  if (!Array.isArray(dims) || dims.some((d) => typeof d !== 'string' || !IDENT.test(d))) refuse(correlationId, 'metric rejected (dimension): dimensions are a list of identifiers');
  const filters = filtersOf(p['filters'], correlationId) ?? {};
  if (title !== null && (title.trim().length < 2 || title.trim().length > 200)) refuse(correlationId, 'metric rejected (title): a title is 2–200 characters');
  return { title: title === null ? null : title.trim(), measure: measure as string, unit: (unit as string).trim(), aggregation: aggregation as string, grain: grain as string,
           dimensions: [...new Set(dims as string[])], filters, effectiveFrom: instantOf(p['effectiveFrom'], 'effective_from', correlationId) };
}

export function validateCertify(p: Row, correlationId: string): { version: number; expiresAt: string } {
  const version = typeof p['version'] === 'number' && Number.isInteger(p['version']) && (p['version'] as number) >= 1 ? (p['version'] as number) : null;
  if (version === null) refuse(correlationId, 'metric certification rejected (version): a certification names the declared version (an integer ≥ 1)');
  const expiresAt = instantOf(p['expiresAt'], 'expiry', correlationId);
  if (expiresAt === null) refuse(correlationId, `metric certification rejected (expiry): a certification names its expiry (an ISO 8601 instant within ${MAX_CERTIFICATION_DAYS} days)`);
  return { version: version as number, expiresAt: expiresAt as string };
}

export function validateServe(p: Row, correlationId: string): { grain: string | null; filters: Row | null; asOf: string | null; view: string } {
  const view = str(p, 'view');
  if (view === null || !(VIEWS as readonly string[]).includes(view)) refuse(correlationId, 'metric rejected (view): a metric is served in the executive or the analyst view');
  const grain = str(p, 'grain');
  if (p['grain'] !== undefined && p['grain'] !== null && (grain === null || !IDENT.test(grain))) refuse(correlationId, 'metric rejected (grain): a grain is a lower-case identifier');
  return { grain: grain === null || grain === '' ? null : grain, filters: filtersOf(p['filters'], correlationId), asOf: instantOf(p['asOf'], 'as_of', correlationId), view: view as string };
}

export function reasonOf(p: Row, correlationId: string): string {
  const reason = str(p, 'reason');
  if (reason === null || reason.trim().length < 8 || reason.trim().length > 2000) refuse(correlationId, 'metric certification rejected (reason): a withdrawal says why (8–2000 characters)');
  return (reason as string).trim();
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly log = new Logger('products.metrics');
  constructor(private readonly moduleRef: ModuleRef, private readonly signatures: SignatureService) {}

  /** The tick step (the planning service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the metric certification sweep is not scheduled'); return; }
    registry.register({ name: METRIC_CERTIFICATION_STEP, order: METRIC_CERTIFICATION_ORDER, run: async (c: AttentionTickContext) => this.sweep(c) });
  }
  private async sweep(c: AttentionTickContext): Promise<Row> {
    return MetricCapability.tick(c.tx, 'executive.attention.tick').sweepCertifications({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  /**
   * THE CERTIFICATION: read the model and the version's digest; SIGN the digest through §0's signer under this same bound action (kind
   * metric_certification, subject = the model at that version); admit the MET object (object_version = this certification's ordinal; the
   * payload is the certified definition with its certification); then the port, which binds the signature id and refuses what is missing.
   * A deployment without a signing key refuses the whole act (409 `signature rejected (unbound)`): a certification is never unsigned.
   */
  async certify(cap: MetricWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, modelId: string, version: number, expiresAt: string, correlationId: string): Promise<Row> {
    const m = await cap.model(modelId);
    if (m === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `metric certification rejected (unknown_metric): ${modelId} is not a semantic model of this domain`), 404);
    const v = (Array.isArray(m['versions']) ? (m['versions'] as Row[]) : []).find((x) => Number(x['version']) === version);
    if (v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `metric certification rejected (unknown_version): metric ${String(m['metric_key'])} has no version ${version}`), 404);
    // every other rule is the PORT's (the owner, the current version, the expiry, the conflict): a refused act rolls the signature and the object back with it
    const digest = String(v['digest']);
    const signature = await this.signatures.sign(cap, { tenantId: scope.tenantId, domainId: scope.domainId, action: 'products.metric.certify', kind: METRIC_CERTIFICATION_SIGNATURE_KIND,
      subjectId: modelId, subjectVersion: version, subjectDigest: digest, actor: principal.principalId, correlationId });
    const signatureId = String(signature['signature_id']);
    const prior = await cap.latestObjectVersion(modelId);
    const ordinal = (prior ?? 0) + 1;
    const certificationId = newId();
    const payload: Row = {
      model_id: modelId, product_id: modelId, metric_key: String(m['metric_key']), title: String(m['title']), owner_principal_id: String(m['owner_principal_id']),
      version, definition: v['definition'], definition_digest: digest,
      certification: { certification_id: certificationId, certified_by: principal.principalId, expires_at: expiresAt, signature_id: signatureId },
      certification_ordinal: ordinal, state: 'certified',
    };
    const header: CanonicalHeader = {
      object_id: modelId, object_type: 'MET', tenant_id: scope.tenantId, domain_id: scope.domainId, scope: 'DOMAIN', object_version: String(ordinal), lifecycle_state: 'active',
      owning_component: 'CP-DAT-01', accountable_owner: `principal:${String(m['owner_principal_id'])}`,
      source_object_ids: [`DPR:${modelId}`],
      event_time: null, observation_time: null, valid_from: String(v['effective_from']), valid_to: expiresAt, recorded_at: new Date().toISOString(), time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${principal.principalId}`, method_ref: 'products.metric.certify/1',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${principal.principalId}`],
      classification: 'internal', purpose_scope: purpose, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: { definition_digest: digest, signature_id: signatureId }, freshness_state: null, schema_ref: MET_SCHEMA, ontology_ref: null,
      correction_of: null, supersedes: prior === null ? null : `MET:${modelId}@${prior}`, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    } as CanonicalHeader;
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `metric certification header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    const r = await cap.certifyMetric({ certificationId, modelId, tenantId: scope.tenantId, domainId: scope.domainId, version, expiresAt, signatureId, actor: principal.principalId, eventId: newId(), correlationId });
    return { ...r, met: { object_version: ordinal, content_digest: admitted.contentDigest, schema_ref: MET_SCHEMA }, signature: { signature_id: signatureId, key_id: signature['key_id'], signed_at: signature['signed_at'] } };
  }
}
