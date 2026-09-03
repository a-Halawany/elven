/**
 * Observation Operations API client — WS-02.
 *
 * Every call builds the same governed envelope the rest of the shell does, and
 * every response is returned VERBATIM. Nothing here predicts a result, retries a
 * governed action, or fills in a value the server did not send: a control that
 * appears to have succeeded before the server agreed is a provenance lie in the
 * interface, and this is a provenance product.
 */
import { call, getSession, type ApiResult } from './api';

export interface Me {
  principalId: string;
  kind: string;
  assurance: string;
  homeScope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
  homeTenantId: string | null;
  homeDomainId: string | null;
  bindings: Array<{ roleCode: string; scope: string; tenantId: string | null; domainId: string | null }>;
}

export interface Receipt {
  policyDecisionId: string;
  auditSeq: number;
}

export type AuthorityClass = 'authoritative' | 'observational';
export type AcquisitionMode = 'replay' | 'live';
export type HealthState = 'healthy' | 'degraded' | 'unknown' | 'suspended' | 'failed';

export interface SourceSummary {
  source_id: string;
  contract_version: number;
  source_key: string;
  name: string;
  authority_class: AuthorityClass;
  acquisition_mode: AcquisitionMode;
  data_origin: 'real' | 'synthetic';
  lifecycle_state: string;
  rights_state: string;
  connector_kind: string;
  health_state: HealthState;
}

export interface Overview {
  sources: SourceSummary[];
  counts: {
    sources: number; active: number; draft: number; suspended: number;
    evidenceObjects: number; openQuarantineCases: number; openCorrections: number;
    unconfirmedRights: number;
  };
  replayRatio: { byObject: number | null; byBytes: number | null; measuredFrom: string };
  attention: Array<Record<string, unknown>>;
  receipt: Receipt;
}

export interface Measurement {
  dimension: string;
  state: 'measured' | 'unknown' | 'indeterminate' | 'not_applicable' | 'insufficient_evidence';
  value_numeric: string | number | null;
  value_text: string | null;
  denominator: string | number | null;
  denominator_derivation: string | null;
  coverage_universe_version: string;
  calc_version: string;
  evaluated_at: string;
  window_start: string;
  window_end: string;
  not_applicable_reason: string | null;
  evidence_refs: string[];
  confidence: string;
}

const DOMAIN_SCOPE = 'DOMAIN' as const;

/** One place that builds a domain-scoped observation request. */
async function obs<T>(
  scope: { tenantId: string; domainId: string },
  path: string,
  action: string,
  objectType: string,
  payload: unknown = {},
  objectId: string | null = null,
): Promise<ApiResult<T>> {
  return call<T>(
    `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation${path}`,
    {
      scope: DOMAIN_SCOPE,
      tenant_id: scope.tenantId,
      domain_id: scope.domainId,
      action,
      object_type: objectType,
      object_id: objectId,
      purpose_id: 'observation',
      side_effect_class: 'reversible',
    },
    payload,
  );
}

/**
 * Confirm this session's scope with the server.
 *
 * The envelope is built from the scope the SERVER reported at sign-in, so it
 * matches the scope the pipeline resolves — a client that declared a scope of
 * its own choosing would be refused, correctly. This call re-confirms that
 * answer under the full governed path rather than trusting what the browser is
 * holding.
 */
export async function whoAmI(): Promise<ApiResult<{ me: Me }>> {
  const s = getSession();
  const scope = s?.scope ?? { scope: 'PLATFORM' as const, tenantId: null, domainId: null };
  return call<{ me: Me }>('/v1/me', {
    scope: scope.scope,
    tenant_id: scope.tenantId,
    domain_id: scope.domainId,
    action: 'identity.self.read',
    object_type: 'PRN',
    purpose_id: 'observation',
    side_effect_class: 'none',
  });
}

export type Scope = { tenantId: string; domainId: string };

export const observation = {
  overview: (s: Scope) => obs<Overview>(s, '/overview', 'observation.read.overview', 'SRC'),

  listSources: (s: Scope) =>
    obs<{ sources: SourceSummary[]; receipt: Receipt }>(s, '/sources/list', 'observation.read.sources', 'SRC', { limit: 200 }),

  getSource: (s: Scope, sourceId: string) =>
    obs<Record<string, unknown>>(s, `/sources/${sourceId}/get`, 'observation.read.sources', 'SRC', {}, sourceId),

  registerSource: (s: Scope, contract: unknown) =>
    obs<{ source: { sourceId: string; contractVersion: number; lifecycleState: string }; receipt: Receipt }>(
      s, '/sources/register', 'observation.source.register', 'SRC', { contract }),

  approveSource: (s: Scope, sourceId: string, contractVersion: number, decision: 'approve' | 'reject', reason: string) =>
    obs<{ source: { lifecycleState: string }; receipt: Receipt }>(
      s, `/sources/${sourceId}/approve`, 'observation.source.approve', 'SRC',
      { contractVersion, decision, reason }, sourceId),

  transitionSource: (s: Scope, sourceId: string, contractVersion: number, target: string, reason: string) =>
    obs<{ source: { lifecycleState: string }; receipt: Receipt }>(
      s, `/sources/${sourceId}/transition`, 'observation.source.transition', 'SRC',
      { contractVersion, target, reason }, sourceId),

  setRights: (s: Scope, sourceId: string, contractVersion: number, rightsState: string, evidence: string) =>
    obs<{ source: { rightsState: string }; receipt: Receipt }>(
      s, `/sources/${sourceId}/rights`, 'observation.source.rights', 'SRC',
      { contractVersion, rightsState, evidence }, sourceId),

  collect: (s: Scope, sourceId: string, contractVersion: number) =>
    obs<{ run: { runId: string; state: string; admitted: number; quarantined: number; noop: number; reason?: string } }>(
      s, `/sources/${sourceId}/collect`, 'observation.run.trigger', 'RUN', { contractVersion }),

  evaluate: (s: Scope, sourceId: string, window: { windowStart?: string; windowEnd?: string; evaluatedAt?: string }) =>
    obs<{ coverage: Record<string, unknown>; receipt: Receipt }>(
      s, `/sources/${sourceId}/evaluate`, 'observation.coverage.measure', 'SRC', window, sourceId),

  replayHealth: (s: Scope, sourceId: string) =>
    obs<{ timeline: Array<Record<string, unknown>>; deterministic: boolean; receipt: Receipt }>(
      s, `/sources/${sourceId}/health/replay`, 'observation.read.health', 'SRC', {}, sourceId),

  listEvidence: (s: Scope, sourceId: string | null) =>
    obs<{ evidence: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/evidence/list', 'observation.read.evidence', 'EVD',
      sourceId === null ? { limit: 200 } : { sourceId, limit: 200 }),

  getEvidence: (s: Scope, evdId: string, knownAt: string | null) =>
    obs<Record<string, unknown>>(
      s, `/evidence/${evdId}/get`, 'observation.read.evidence', 'EVD',
      knownAt === null ? {} : { knownAt }, evdId),

  downloadEvidence: (s: Scope, evdId: string) =>
    obs<{ download: { filename: string; contentType: string; contentDisposition: string; contentDigest: string; byteLength: number; base64: string; integrity: string }; receipt: Receipt }>(
      s, `/evidence/${evdId}/download`, 'observation.evidence.retrieve', 'EVD', {}, evdId),

  listQuarantine: (s: Scope, state: string | null) =>
    obs<{ cases: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/quarantine/list', 'observation.read.quarantine', 'QAR',
      state === null ? { limit: 200 } : { state, limit: 200 }),

  getQuarantine: (s: Scope, caseId: string) =>
    obs<Record<string, unknown>>(s, `/quarantine/${caseId}/get`, 'observation.read.quarantine', 'QAR', {}, caseId),

  reviewQuarantine: (s: Scope, caseId: string, decision: 'release' | 'discard', reason: string) =>
    obs<{ case: Record<string, unknown>; receipt: Receipt }>(
      s, `/quarantine/${caseId}/review`, 'observation.quarantine.review', 'QAR',
      { decision, reason }, caseId),

  listCorrections: (s: Scope) =>
    obs<{ corrections: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/corrections/list', 'observation.read.corrections', 'COR', { limit: 200 }),

  getCorrection: (s: Scope, caseId: string) =>
    obs<Record<string, unknown>>(s, `/corrections/${caseId}/get`, 'observation.read.corrections', 'COR', {}, caseId),

  submitCorrection: (s: Scope, body: {
    sourceId: string; kind: 'correction' | 'withdrawal' | 'supersession';
    channel: string; publisherRef: string | null; reason: string; affectedEvdIds: string[];
  }) =>
    obs<{ correction: Record<string, unknown>; receipt: Receipt }>(
      s, '/corrections/submit', 'observation.correction.receive', 'COR', body),

  applyCorrection: (s: Scope, caseId: string, decision: 'apply' | 'reject', affectedEvdIds: string[], reason: string) =>
    obs<{ correction: Record<string, unknown>; receipt: Receipt }>(
      s, `/corrections/${caseId}/apply`, 'observation.correction.apply', 'COR',
      { decision, affectedEvdIds, reason }, caseId),

  getRun: (s: Scope, runId: string) =>
    obs<Record<string, unknown>>(s, `/runs/${runId}/get`, 'observation.read.runs', 'RUN', {}, runId),

  verifyProjections: (s: Scope) =>
    obs<{ projections: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/projections/verify', 'observation.read.projections', 'SRC'),

  sweep: (s: Scope) =>
    obs<{ sweep: Record<string, unknown> }>(s, '/sweep', 'observation.sweeper.reconcile', 'RUN'),
};
