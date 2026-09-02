/**
 * Source contract (SRC@v1) — PHASE1_PLAN §7.
 *
 * The complete §7 field set, as one type and one validator. Everything is
 * REQUIRED unless the contract itself records a contract-approved N/A: the plan
 * is explicit that a source registered with half its terms filled in is not a
 * governed source, and this is where that becomes true rather than aspirational.
 *
 * The authoritative JSON Schema lives in the object registry (migration 0022
 * §20) and is enforced again by objects.admit_version inside the trusted
 * boundary. This module validates the same shape at the edge so a registrar gets
 * a usable error instead of a schema violation from three layers down.
 */

export type AuthorityClass = 'authoritative' | 'observational';
export type ConnectorKind = 'upload' | 'rss' | 'rest';
export type AcquisitionMode = 'replay' | 'live';
export type DataOrigin = 'real' | 'synthetic';
export type RightsState = 'confirmed' | 'pending' | 'withdrawn';

export interface SourceContractV1 {
  source_key: string;
  name: string;
  publisher: string;
  authority_class: AuthorityClass;
  connector_kind: ConnectorKind;
  acquisition_mode: AcquisitionMode;
  data_origin: DataOrigin;
  identity: {
    source_identity: string;
    publisher_identity: string;
    endpoints: string[];
    scheme_allowlist: 'https'[];
    cadence_seconds: number;
    jitter_seconds?: number;
    collection_window?: string | null;
  };
  authority_and_rights: {
    owner: string;
    steward: string;
    authority: string;
    legal_basis: string;
    rights_state: RightsState;
    licence: string;
    permitted_use: string[];
    robots_policy: string;
    purposes: string[];
    classification_ceiling: string;
    residency: string;
    retention: string;
    deletion_obligation: string;
  };
  security_and_operations: {
    /** A REFERENCE, never the secret. A contract carrying a secret is rejected. */
    credential_ref: string | null;
    authentication_method: string;
    /** The four §6 concepts, recorded separately and never collapsed. */
    authenticity_method: {
      transport_endpoint: string;
      byte_integrity: string;
      source_origin: string;
      content_authenticity: string;
    };
    budgets: {
      max_requests_per_run: number;
      max_bytes_per_run: number;
      max_concurrency: number;
      timeout_ms: number;
      max_retries: number;
      cost_units?: number;
    };
    expected_schema: {
      media_types: string[];
      required_fields: string[];
      drift_tolerance: number;
      max_bytes?: number;
    };
    freshness_expectation: {
      threshold_seconds: number;
      expected_interval: string;
    };
    coverage_expectations: {
      universe_version: string;
      denominator_derivation: string;
      expected_items_per_window?: number | null;
      not_applicable_dimensions?: string[];
      not_applicable_reason?: string | null;
    };
    correction_channel: string;
  };
  lifecycle: {
    contract_version: number;
    effective_from: string;
    effective_to?: string | null;
    supersedes_version?: number | null;
  };
  separation_of_duties?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * A value that looks like a secret must never reach a contract field. The check
 * is on SHAPE, not on a name allowlist: a long high-entropy string in
 * `credential_ref` is a pasted secret whatever the field is called.
 */
function looksLikeSecret(v: string): boolean {
  if (v.length < 20) return false;
  if (/^[a-z0-9._:/-]+$/i.test(v) && v.includes('/')) return false; // a path-shaped reference
  const distinct = new Set(v).size;
  return distinct > 14 && /[A-Za-z]/.test(v) && /\d/.test(v) && !v.includes(' ');
}

const SCHEDULER_FLOOR_SECONDS = 60;

/**
 * Validate a submitted contract. Returns EVERY error rather than the first, so a
 * registrar filling in a long form is told everything that is wrong in one pass.
 */
export function validateSourceContract(input: unknown): ValidationResult {
  const errors: string[] = [];
  const push = (m: string): void => { errors.push(m); };
  if (input === null || typeof input !== 'object') {
    return { ok: false, errors: ['contract must be an object'] };
  }
  const c = input as Partial<SourceContractV1>;

  const str = (v: unknown, path: string, min = 1): void => {
    if (typeof v !== 'string' || v.trim().length < min) push(`${path} is required`);
  };
  const enumOf = <T extends string>(v: unknown, path: string, allowed: readonly T[]): void => {
    if (typeof v !== 'string' || !allowed.includes(v as T)) {
      push(`${path} must be one of ${allowed.join(' | ')}`);
    }
  };

  str(c.source_key, 'source_key', 2);
  str(c.name, 'name', 2);
  str(c.publisher, 'publisher', 2);
  enumOf(c.authority_class, 'authority_class', ['authoritative', 'observational'] as const);
  enumOf(c.connector_kind, 'connector_kind', ['upload', 'rss', 'rest'] as const);
  enumOf(c.acquisition_mode, 'acquisition_mode', ['replay', 'live'] as const);
  enumOf(c.data_origin, 'data_origin', ['real', 'synthetic'] as const);

  const id = c.identity;
  if (id === undefined || typeof id !== 'object') push('identity block is required');
  else {
    str(id.source_identity, 'identity.source_identity', 2);
    str(id.publisher_identity, 'identity.publisher_identity', 2);
    if (!Array.isArray(id.endpoints)) push('identity.endpoints is required');
    else if (c.connector_kind !== 'upload' && id.endpoints.length === 0) {
      push('identity.endpoints must name at least one endpoint for a polled source');
    } else {
      for (const e of id.endpoints) {
        if (typeof e !== 'string') { push('identity.endpoints must contain strings'); continue; }
        try {
          const u = new URL(e);
          // HTTPS ONLY (§8.1). A contract cannot opt out of it.
          if (u.protocol !== 'https:') push(`identity.endpoints: ${u.protocol.replace(':', '')} is not permitted; HTTPS only`);
        } catch {
          push(`identity.endpoints: "${e.slice(0, 60)}" is not a valid URL`);
        }
      }
    }
    if (!Array.isArray(id.scheme_allowlist) || id.scheme_allowlist.some((s) => s !== 'https')) {
      push('identity.scheme_allowlist must be ["https"]');
    }
    if (typeof id.cadence_seconds !== 'number' || !Number.isInteger(id.cadence_seconds)) {
      push('identity.cadence_seconds is required');
    } else if (id.cadence_seconds < SCHEDULER_FLOOR_SECONDS) {
      push(`identity.cadence_seconds must be at least ${SCHEDULER_FLOOR_SECONDS} (the local scheduler floor)`);
    }
  }

  const ar = c.authority_and_rights;
  if (ar === undefined || typeof ar !== 'object') push('authority_and_rights block is required');
  else {
    str(ar.owner, 'authority_and_rights.owner');
    str(ar.steward, 'authority_and_rights.steward');
    str(ar.authority, 'authority_and_rights.authority');
    str(ar.legal_basis, 'authority_and_rights.legal_basis');
    enumOf(ar.rights_state, 'authority_and_rights.rights_state', ['confirmed', 'pending', 'withdrawn'] as const);
    str(ar.licence, 'authority_and_rights.licence');
    str(ar.robots_policy, 'authority_and_rights.robots_policy');
    str(ar.classification_ceiling, 'authority_and_rights.classification_ceiling');
    str(ar.residency, 'authority_and_rights.residency');
    str(ar.retention, 'authority_and_rights.retention');
    str(ar.deletion_obligation, 'authority_and_rights.deletion_obligation');
    if (!Array.isArray(ar.permitted_use) || ar.permitted_use.length === 0) {
      push('authority_and_rights.permitted_use must name at least one permitted use');
    }
    if (!Array.isArray(ar.purposes) || ar.purposes.length === 0) {
      push('authority_and_rights.purposes must name at least one purpose');
    }
  }

  const so = c.security_and_operations;
  if (so === undefined || typeof so !== 'object') push('security_and_operations block is required');
  else {
    if (so.credential_ref !== null && typeof so.credential_ref !== 'string') {
      push('security_and_operations.credential_ref must be a reference or null');
    } else if (typeof so.credential_ref === 'string' && looksLikeSecret(so.credential_ref)) {
      // The contract stores a REFERENCE. A pasted secret is refused here rather
      // than stored and later redacted, because a stored secret has already leaked.
      push('security_and_operations.credential_ref looks like a secret value; contracts carry a reference, never the secret');
    }
    str(so.authentication_method, 'security_and_operations.authentication_method');
    str(so.correction_channel, 'security_and_operations.correction_channel');

    const am = so.authenticity_method;
    if (am === undefined || typeof am !== 'object') push('security_and_operations.authenticity_method is required');
    else {
      str(am.transport_endpoint, 'authenticity_method.transport_endpoint');
      str(am.byte_integrity, 'authenticity_method.byte_integrity');
      str(am.source_origin, 'authenticity_method.source_origin');
      str(am.content_authenticity, 'authenticity_method.content_authenticity');
    }

    const b = so.budgets;
    if (b === undefined || typeof b !== 'object') push('security_and_operations.budgets is required');
    else {
      for (const [k, min] of [['max_requests_per_run', 1], ['max_bytes_per_run', 1], ['max_concurrency', 1], ['timeout_ms', 100], ['max_retries', 0]] as const) {
        const v = (b as Record<string, unknown>)[k];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min) push(`budgets.${k} must be an integer >= ${min}`);
      }
    }

    const es = so.expected_schema;
    if (es === undefined || typeof es !== 'object') push('security_and_operations.expected_schema is required');
    else {
      if (!Array.isArray(es.media_types) || es.media_types.length === 0) push('expected_schema.media_types is required');
      if (!Array.isArray(es.required_fields)) push('expected_schema.required_fields is required (an empty list is a valid declaration)');
      if (typeof es.drift_tolerance !== 'number' || es.drift_tolerance < 0) push('expected_schema.drift_tolerance is required');
    }

    const fe = so.freshness_expectation;
    if (fe === undefined || typeof fe !== 'object') push('security_and_operations.freshness_expectation is required');
    else {
      if (typeof fe.threshold_seconds !== 'number' || fe.threshold_seconds < 1) push('freshness_expectation.threshold_seconds is required');
      str(fe.expected_interval, 'freshness_expectation.expected_interval');
    }

    const ce = so.coverage_expectations;
    if (ce === undefined || typeof ce !== 'object') push('security_and_operations.coverage_expectations is required');
    else {
      str(ce.universe_version, 'coverage_expectations.universe_version');
      str(ce.denominator_derivation, 'coverage_expectations.denominator_derivation');
      // §6: a dimension declared not-applicable must carry the reason THE CONTRACT
      // approves. Declaring the exemption without the reason is the exact shape of
      // "we do not measure this" dressed up as "this does not apply".
      if (Array.isArray(ce.not_applicable_dimensions) && ce.not_applicable_dimensions.length > 0) {
        if (typeof ce.not_applicable_reason !== 'string' || ce.not_applicable_reason.trim().length < 8) {
          push('coverage_expectations.not_applicable_reason is required when any dimension is declared not applicable');
        }
      }
    }
  }

  const lc = c.lifecycle;
  if (lc === undefined || typeof lc !== 'object') push('lifecycle block is required');
  else {
    if (typeof lc.contract_version !== 'number' || lc.contract_version < 1) push('lifecycle.contract_version must be >= 1');
    str(lc.effective_from, 'lifecycle.effective_from');
    if (typeof lc.effective_from === 'string' && Number.isNaN(Date.parse(lc.effective_from))) {
      push('lifecycle.effective_from must be an RFC 3339 instant');
    }
    if (lc.effective_to != null) {
      if (Number.isNaN(Date.parse(lc.effective_to))) push('lifecycle.effective_to must be an RFC 3339 instant');
      else if (typeof lc.effective_from === 'string' && Date.parse(lc.effective_to) <= Date.parse(lc.effective_from)) {
        push('lifecycle.effective_to must be after lifecycle.effective_from');
      }
    }
  }

  // A cross-field rule worth stating: an UPLOAD source has no endpoints to poll,
  // so a cadence is meaningless and a declared one would imply a schedule that
  // will never run.
  if (c.connector_kind === 'upload' && Array.isArray(c.identity?.endpoints) && c.identity.endpoints.length > 0) {
    push('an upload source declares no endpoints — bytes are supplied by an operator, not polled');
  }

  return { ok: errors.length === 0, errors };
}

/** Host allowlist derived from the contract's OWN endpoints. Nothing wider is reachable. */
export function hostAllowlistOf(contract: SourceContractV1): string[] {
  const hosts = new Set<string>();
  for (const e of contract.identity.endpoints) {
    try { hosts.add(new URL(e).hostname.toLowerCase()); } catch { /* validation already reported it */ }
  }
  return [...hosts];
}
