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
/** B40 §0: `adapter` — a custom adapter package run in §CR's connector cell; an SRC@v4 contract only (it names its package in `adapter`). */
export type ConnectorKind = 'upload' | 'rss' | 'rest' | 'adapter';
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
    /**
     * The exact attribution the publisher's terms require, rendered wherever the
     * data is shown or exported (e.g. "Source: ECB statistics."). Optional in the
     * schema because not every licence asks for one; when present it travels
     * with every derived object.
     */
    attribution?: string | null;
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
    /** A REFERENCE, never the secret. A contract carrying a secret is rejected. B11: the deployment's variable name (`EYE_SRC_<NAME>`). */
    credential_ref: string | null;
    /** B11: the request header the credential travels in (`authorization` when absent); named only when a credential is. */
    credential_header?: string | null;
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
      /**
       * TRANSPORT FRAMING, declared by the contract (§2, §10.1).
       *
       * When a payload is an array of records, `item_path` names it and the
       * connector emits one child evidence object per element, each an exact byte
       * range of the preserved parent. `item_key_field` and `item_time_field`
       * name which field ADDRESSES an element and which carries the publisher's
       * own time for it.
       *
       * This is addressing, not interpretation: nothing here says what a field
       * MEANS. Without it the response is admitted whole, which is the right
       * answer for an opaque payload.
       *
       * A COMPOSITE KEY (§9.7). Some layers are addressed by more than one field:
       * the IMF PortWatch daily chokepoints series carries one row per (date,
       * portid), so a page ordered by `date,portid` puts three chokepoints of the
       * same day under one key if `date` alone addresses it — three evidence objects
       * per key on the first walk, and two spurious "revisions" on every re-walk.
       * `item_key_field` therefore also accepts an ORDERED LIST of paths, and the
       * child's key carries each component's value in the declared order.
       *
       * A CONTRACT THAT DECLARES A STRING IS UNCHANGED, byte for byte: the same key,
       * the same separator, the same framing. Composite framing is reached only by
       * declaring a list.
       */
      item_path?: string;
      item_key_field?: string | string[];
      item_time_field?: string;
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
    /**
     * The frozen replay set this contract reads from when
     * `acquisition_mode: 'replay'`. Defaults to the source key.
     *
     * It is DECLARED rather than inferred so the coupling between a contract and
     * a fixture set is visible in the contract itself — an implicit convention
     * is a coupling nobody reviews.
     */
    replay_set?: string;
    /**
     * A CLOSED-RANGE BACKFILL this contract performs on activation (Phase 4 §4a),
     * declared here so the traversal — strategy, window, ordering, page size — is
     * part of the reviewed contract rather than a connector's private choice.
     * Live acquisition only; a replay contract reads its frozen set as before.
     */
    backfill?: {
      strategy: 'period-range' | 'arcgis-offset';
      endpoint: string;
      from: string;
      to?: string | null;
      window_days?: number;
      start_param?: string;
      end_param?: string;
      page_size?: number;
      order_by?: string;
      time_field?: string;
      where?: string;
    };
  };
  lifecycle: {
    contract_version: number;
    effective_from: string;
    effective_to?: string | null;
    supersedes_version?: number | null;
  };
  separation_of_duties?: Record<string, unknown>;
  /* B40 §0 SRC@v4 — the six blocks a v4 contract carries (all of them; `adapter` for an adapter source only). Absent on v1–v3. */
  acquisition_policy?: SrcV4AcquisitionPolicy;
  authenticity?: SrcV4Authenticity;
  content_policy?: SrcV4ContentPolicy;
  economics?: SrcV4Economics;
  stewardship?: SrcV4Stewardship;
  adapter?: SrcV4Adapter;
  evidence_attributes?: SrcV4EvidenceAttributes;
  /* end B40 §0 SRC@v4 */
}

/* B40 §0 SRC@v4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE COMBINED v4 CONTRACT (migration 0123 §0; MAP §3 §0 item 1). One schema so no part re-declares the contract:
 *   acquisition_policy   §AP enforces it (rate bucket, contract backoff + Retry-After, robots, window, residency at ingress)
 *   authenticity         §VA verifies against the publisher keys in force (ed25519 detached / JWS; TLS SPKI pins for live endpoints)
 *   content_policy       §IN applies it (v4 QUARANTINES active content, macros, embedded files and hidden instructions unless the contract
 *                        says `admit_opaque` with a reason — DESIGN D7; v1–v3 keep their recorded rule, D8); `auto_admit` is the upload rule (SP-22)
 *   economics            §RG's run meter compares (cost per run, budget per period, currency, owner)
 *   stewardship          §RG (steward, review due)
 *   adapter              §CR (the approved package a contract of kind `adapter` binds: id, semver, digest)
 *   evidence_attributes  §VA assigns them at intake into its side ledger (no header field — D11)
 * A v1–v3 contract is UNTOUCHED (no back-fill, no automatic supersession — D8); a steward publishes v4 through the existing supersede path.
 * A contract is v4 when it carries ANY of these blocks (then all are required) or names the `adapter` kind (v4 only).
 */
export const SRC_V4_BLOCKS = ['acquisition_policy', 'authenticity', 'content_policy', 'economics', 'stewardship', 'evidence_attributes'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type ContentRule = 'quarantine' | 'admit_opaque';
/** Ordered least → most restrictive (§VA's most-restrictive inheritance folds it in this order). */
export const SENSITIVITIES = ['none', 'commercial', 'personal', 'special_category'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export interface SrcV4AcquisitionPolicy {
  /** A token bucket per source: `requests` per `per_seconds`, at most `burst` at once. Shared by the command and stream forms and §CR's gateway. */
  rate: { requests: number; per_seconds: number; burst: number };
  /** The contract's own retry schedule (replaces the generic queue retry for a v4 contract): delays in seconds, non-decreasing. */
  backoff: { schedule_seconds: number[]; max_attempts: number; honour_retry_after: boolean };
  /** `evaluate`: robots.txt fetched through the vetted client and evaluated per path; `not_applicable` only with the contract's reason. */
  robots: { mode: 'evaluate' | 'not_applicable'; reason?: string | null };
  /** When collection may happen (UTC): the days, the hours [from, to), and declared blackouts. */
  window: { days: Weekday[]; hours_utc: { from: number; to: number }; blackout: Array<{ from: string; to: string; reason: string }> };
  /** `enforce`: a residency conflict refuses before egress (or quarantines at ingress); `record`: it is recorded on the authorization only. */
  residency_check: 'enforce' | 'record';
}
export interface SrcV4Authenticity {
  scheme: 'none' | 'ed25519_detached' | 'jws';
  /** The publisher keys the contract accepts (§VA's register ids or fingerprints); empty = any key in force for this source. Never key material. */
  key_refs: string[];
  /** TLS identity pins for live endpoints: base64 SHA-256 of the SubjectPublicKeyInfo. */
  tls_spki_pins: string[];
}
/** The inspection engines a v4 contract may require (DESIGN D2): engine 1 the sandboxed content inspector, engine 2 ClamAV over clamd. */
export const SCAN_ENGINES = ['content-inspector', 'clamav'] as const;
export type ScanEngine = (typeof SCAN_ENGINES)[number];
export interface SrcV4ContentPolicy {
  /**
   * The engines whose verdict must be `clean` for an item to be admitted. The outcome vocabulary is fixed, not a contract choice:
   * clean | detected | unavailable | failed | incomplete — ONLY clean admits; every other outcome quarantines (fail closed, D2).
   */
  scan_engines: ScanEngine[];
  active_content: ContentRule;
  macros: ContentRule;
  embedded_files: ContentRule;
  hidden_instructions: ContentRule;
  /** Required (≥ 8 characters) when any rule above is `admit_opaque`. */
  admit_opaque_reason?: string | null;
  /** The upload auto-admit rule (SP-22): `never` — every manual upload waits for a second person; `within_limits` — within the size and types. */
  auto_admit: { mode: 'never' | 'within_limits'; max_bytes?: number | null; media_types?: string[] };
}
export interface SrcV4Economics {
  cost_per_run: number;
  budget_per_period: number;
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  /** ISO 4217. */
  currency: string;
  owner: string;
}
export interface SrcV4Stewardship {
  steward: string;
  /** YYYY-MM-DD. */
  review_due: string;
}
export interface SrcV4Adapter {
  package_id: string;
  version: string;
  /** sha256 (hex) of the approved package. */
  digest: string;
}
export interface SrcV4EvidenceAttributes {
  geographic_scope: string[];
  /** A BCP 47 tag (`und` when undetermined). */
  language: string;
  sensitivity: Sensitivity;
}

/** True when the contract is an SRC@v4: it carries any v4 block or names the `adapter` kind. */
export function isSourceContractV4(input: unknown): boolean {
  if (input === null || typeof input !== 'object') return false;
  const c = input as Record<string, unknown>;
  return c['connector_kind'] === 'adapter' || c['adapter'] !== undefined || SRC_V4_BLOCKS.some((k) => c[k] !== undefined);
}

/** The schema reference a registered contract is admitted under (the registration's header `schema_ref`). */
export function schemaRefOf(c: SourceContractV1): 'SRC@v1' | 'SRC@v2' | 'SRC@v3' | 'SRC@v4' {
  if (isSourceContractV4(c)) return 'SRC@v4';
  // B11 (migration 0070 §1): SRC@v3 adds the credential header; a contract not naming it is admitted as before.
  if (c.security_and_operations.credential_header != null) return 'SRC@v3';
  // SRC@v2 (migration 0028) adds the optional backfill declaration and the publisher's attribution notice; a contract using neither is still a v1.
  return c.security_and_operations.backfill !== undefined || c.authority_and_rights.attribution != null ? 'SRC@v2' : 'SRC@v1';
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SPKI_PIN = /^[A-Za-z0-9+/]{43}=$/;
const BCP47 = /^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/;

/** The v4 blocks' rules (every error, not the first). Called by validateSourceContract for a v4 contract only. */
function validateV4Blocks(c: Record<string, unknown>, push: (m: string) => void): void {
  for (const k of SRC_V4_BLOCKS) if (!isObj(c[k])) push(`${k} is required on an SRC@v4 contract (a v4 contract declares all of ${SRC_V4_BLOCKS.join(', ')})`);
  const ap = c['acquisition_policy'];
  if (isObj(ap)) {
    const r = ap['rate'];
    if (!isObj(r) || !isInt(r['requests'], 1, 100_000) || !isInt(r['per_seconds'], 1, 86_400) || !isInt(r['burst'], 1, 100_000)) {
      push('acquisition_policy.rate declares requests (1–100000) per per_seconds (1–86400) with a burst (1–100000)');
    }
    const b = ap['backoff'];
    if (!isObj(b)) push('acquisition_policy.backoff is required');
    else {
      const s = b['schedule_seconds'];
      if (!Array.isArray(s) || s.length === 0 || s.length > 20 || !s.every((x) => isInt(x, 1, 86_400))) push('acquisition_policy.backoff.schedule_seconds lists 1–20 delays of 1–86400 seconds');
      else if (s.some((x, i) => i > 0 && (x as number) < (s[i - 1] as number))) push('acquisition_policy.backoff.schedule_seconds never decreases');
      if (!isInt(b['max_attempts'], 1, 21)) push('acquisition_policy.backoff.max_attempts is an integer between 1 and 21');
      if (typeof b['honour_retry_after'] !== 'boolean') push('acquisition_policy.backoff.honour_retry_after is true or false');
    }
    const rb = ap['robots'];
    if (!isObj(rb) || (rb['mode'] !== 'evaluate' && rb['mode'] !== 'not_applicable')) push('acquisition_policy.robots.mode is evaluate | not_applicable');
    else if (rb['mode'] === 'not_applicable' && (typeof rb['reason'] !== 'string' || rb['reason'].trim().length < 8)) {
      push('acquisition_policy.robots.reason is required when robots is not applicable (the contract says why)');
    }
    const w = ap['window'];
    if (!isObj(w)) push('acquisition_policy.window is required');
    else {
      const d = w['days'];
      if (!Array.isArray(d) || d.length === 0 || !d.every((x) => (WEEKDAYS as readonly unknown[]).includes(x)) || new Set(d).size !== d.length) {
        push(`acquisition_policy.window.days lists distinct days of ${WEEKDAYS.join(' | ')}`);
      }
      const h = w['hours_utc'];
      if (!isObj(h) || !isInt(h['from'], 0, 23) || !isInt(h['to'], 1, 24) || (h['to'] as number) <= (h['from'] as number)) {
        push('acquisition_policy.window.hours_utc is { from: 0–23, to: 1–24 } with from < to');
      }
      const bl = w['blackout'];
      if (!Array.isArray(bl)) push('acquisition_policy.window.blackout is a list (an empty list is a valid declaration)');
      else for (const x of bl) {
        if (!isObj(x) || typeof x['from'] !== 'string' || typeof x['to'] !== 'string' || Number.isNaN(Date.parse(x['from'])) || Number.isNaN(Date.parse(x['to']))
            || Date.parse(x['to']) <= Date.parse(x['from']) || typeof x['reason'] !== 'string' || x['reason'].trim().length < 3) {
          push('acquisition_policy.window.blackout entries are { from, to (after from), reason } instants');
          break;
        }
      }
    }
    if (ap['residency_check'] !== 'enforce' && ap['residency_check'] !== 'record') push('acquisition_policy.residency_check is enforce | record');
  }
  const au = c['authenticity'];
  if (isObj(au)) {
    if (!['none', 'ed25519_detached', 'jws'].includes(au['scheme'] as string)) push('authenticity.scheme is none | ed25519_detached | jws');
    const kr = au['key_refs'];
    if (!Array.isArray(kr) || !kr.every((x) => typeof x === 'string' && x.length >= 2 && x.length <= 128)) push('authenticity.key_refs lists key references (2–128 characters each; never key material)');
    else if (kr.some((x) => looksLikeSecret(x as string) && !/^[0-9a-f]{64}$/.test(x as string) && !UUID.test(x as string))) push('authenticity.key_refs looks like key material; a contract names a key by reference (a register id or a fingerprint)');
    const pins = au['tls_spki_pins'];
    if (!Array.isArray(pins) || !pins.every((x) => typeof x === 'string' && SPKI_PIN.test(x))) push('authenticity.tls_spki_pins lists base64 SHA-256 SubjectPublicKeyInfo pins');
    if (au['scheme'] === 'none' && Array.isArray(kr) && kr.length > 0) push('authenticity.key_refs are named only with a signature scheme');
  }
  const cp = c['content_policy'];
  if (isObj(cp)) {
    const se = cp['scan_engines'];
    if (!Array.isArray(se) || se.length === 0 || !se.every((x) => (SCAN_ENGINES as readonly unknown[]).includes(x)) || new Set(se).size !== se.length) {
      push(`content_policy.scan_engines lists the distinct engines whose verdict must be clean (${SCAN_ENGINES.join(' | ')})`);
    }
    let opaque = false;
    for (const k of ['active_content', 'macros', 'embedded_files', 'hidden_instructions'] as const) {
      if (cp[k] !== 'quarantine' && cp[k] !== 'admit_opaque') push(`content_policy.${k} is quarantine | admit_opaque`);
      if (cp[k] === 'admit_opaque') opaque = true;
    }
    if (opaque && (typeof cp['admit_opaque_reason'] !== 'string' || cp['admit_opaque_reason'].trim().length < 8)) {
      push('content_policy.admit_opaque_reason is required when any content rule admits opaque (the contract says why)');
    }
    const aa = cp['auto_admit'];
    if (!isObj(aa) || (aa['mode'] !== 'never' && aa['mode'] !== 'within_limits')) push('content_policy.auto_admit.mode is never | within_limits');
    else if (aa['mode'] === 'within_limits') {
      if (!isInt(aa['max_bytes'], 1)) push('content_policy.auto_admit.max_bytes is required (a positive integer) for within_limits');
      if (!Array.isArray(aa['media_types']) || aa['media_types'].length === 0 || !aa['media_types'].every((x) => typeof x === 'string' && x.includes('/'))) {
        push('content_policy.auto_admit.media_types lists the media types admitted without a second person (within_limits)');
      }
    }
  }
  const ec = c['economics'];
  if (isObj(ec)) {
    for (const k of ['cost_per_run', 'budget_per_period'] as const) if (typeof ec[k] !== 'number' || !Number.isFinite(ec[k]) || (ec[k] as number) < 0) push(`economics.${k} is a number >= 0`);
    if (!['day', 'week', 'month', 'quarter', 'year'].includes(ec['period'] as string)) push('economics.period is day | week | month | quarter | year');
    if (typeof ec['currency'] !== 'string' || !/^[A-Z]{3}$/.test(ec['currency'])) push('economics.currency is an ISO 4217 code');
    if (typeof ec['owner'] !== 'string' || ec['owner'].trim().length < 2) push('economics.owner is required');
  }
  const st = c['stewardship'];
  if (isObj(st)) {
    if (typeof st['steward'] !== 'string' || st['steward'].trim().length < 2) push('stewardship.steward is required');
    if (typeof st['review_due'] !== 'string' || !DAY.test(st['review_due']) || Number.isNaN(Date.parse(st['review_due']))) push('stewardship.review_due is a YYYY-MM-DD date');
  }
  const ea = c['evidence_attributes'];
  if (isObj(ea)) {
    const g = ea['geographic_scope'];
    if (!Array.isArray(g) || g.length === 0 || !g.every((x) => typeof x === 'string' && x.trim().length >= 2)) push('evidence_attributes.geographic_scope names at least one region (`global` is a valid declaration)');
    if (typeof ea['language'] !== 'string' || !BCP47.test(ea['language'])) push('evidence_attributes.language is a BCP 47 tag (und when undetermined)');
    if (!(SENSITIVITIES as readonly unknown[]).includes(ea['sensitivity'])) push(`evidence_attributes.sensitivity is ${SENSITIVITIES.join(' | ')}`);
  }
  const ad = c['adapter'];
  if (c['connector_kind'] === 'adapter') {
    if (!isObj(ad)) push('adapter is required for a contract of kind adapter (the approved package it binds)');
    else {
      if (typeof ad['package_id'] !== 'string' || !UUID.test(ad['package_id'])) push('adapter.package_id is a registered package id (uuid)');
      if (typeof ad['version'] !== 'string' || !SEMVER.test(ad['version'])) push('adapter.version is a semantic version');
      if (typeof ad['digest'] !== 'string' || !/^[0-9a-f]{64}$/.test(ad['digest'])) push('adapter.digest is the package\'s sha256 (hex)');
    }
  } else if (ad !== undefined) {
    push('adapter is declared only by a contract of kind adapter');
  }
}
/* end B40 §0 SRC@v4 */

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
  // B40 §0: `adapter` is an SRC@v4 kind (a v4 contract names its package); a v1–v3 contract keeps the three kinds.
  enumOf(c.connector_kind, 'connector_kind', isSourceContractV4(c) ? ['upload', 'rss', 'rest', 'adapter'] as const : ['upload', 'rss', 'rest'] as const);
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
    } else if (typeof so.credential_ref === 'string' && !/^EYE_SRC_[A-Z0-9_]{1,64}$/.test(so.credential_ref)) {
      // B11: the reference is the deployment's variable name, in the one namespace the credential store reads.
      push('security_and_operations.credential_ref names a deployment variable EYE_SRC_<NAME> (upper case, digits, underscores)');
    }
    if (so.credential_header !== undefined && so.credential_header !== null) {
      if (typeof so.credential_header !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(so.credential_header)) push('security_and_operations.credential_header is a header name (letters, digits, hyphens)');
      else if (so.credential_ref === null) push('security_and_operations.credential_header is named only with a credential_ref');
      else if (looksLikeSecret(so.credential_header)) push('security_and_operations.credential_header looks like a secret value; it names the header, never the secret');
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
      // Framing is all-or-nothing: an item path without a key field would produce
      // items nothing can address, and a key field without a path names nothing.
      const kf = es.item_key_field as unknown;
      const isSinglePath = typeof kf === 'string';
      const isComposite = Array.isArray(kf);
      if (es.item_path !== undefined && !isSinglePath && !isComposite) {
        push('expected_schema.item_key_field is required when expected_schema.item_path declares framing');
      }
      if (kf !== undefined && typeof es.item_path !== 'string') {
        push('expected_schema.item_path is required when expected_schema.item_key_field is declared');
      }
      if (isComposite) {
        // A composite key is an ORDERED LIST of paths. The order is part of the key —
        // reordering it renames every item — so it is declared, never inferred.
        const parts = kf as unknown[];
        if (parts.length === 0) {
          push('expected_schema.item_key_field declared as a list must name at least one path');
        }
        if (!parts.every((x) => typeof x === 'string' && x.length > 0)) {
          push('expected_schema.item_key_field declared as a list must contain only non-empty field paths');
        }
        if (new Set(parts.map((x) => String(x))).size !== parts.length) {
          push('expected_schema.item_key_field names the same path more than once; each component must address a different field');
        }
      }
      /*
       * A SINGLE-PATH KEY CANNOT ADDRESS A MULTI-VALUED WALK.
       *
       * §9.7: a backfill whose filter names several values of a second dimension —
       * `portid IN ('chokepoint1','chokepoint4','chokepoint7')` — returns several rows
       * per value of the single key field. On a single-path key those rows collide,
       * and the walk records the extras as revisions of one another. That contract is
       * refused at registration rather than accepted and mis-collected.
       */
      const where = (so.backfill as { where?: unknown } | undefined)?.where;
      if (isSinglePath && typeof where === 'string') {
        const literals = new Set((where.match(/'[^']*'/g) ?? []).map((x) => x.toLowerCase()));
        if (/\bin\s*\(/i.test(where)) {
          push('security_and_operations.backfill.where uses an IN (…) filter, which returns several rows per value of a single-path expected_schema.item_key_field; declare a composite item_key_field naming every dimension the walk varies');
        } else if (literals.size > 1) {
          push('security_and_operations.backfill.where names more than one value, which returns several rows per value of a single-path expected_schema.item_key_field; declare a composite item_key_field naming every dimension the walk varies');
        }
      }
    }

    const bf = so.backfill;
    if (bf !== undefined) {
      if (bf === null || typeof bf !== 'object') push('security_and_operations.backfill must be an object');
      else {
        enumOf(bf.strategy, 'backfill.strategy', ['period-range', 'arcgis-offset'] as const);
        str(bf.endpoint, 'backfill.endpoint');
        if (typeof bf.endpoint === 'string') {
          try {
            const u = new URL(bf.endpoint);
            if (u.protocol !== 'https:') push('backfill.endpoint must be https');
            const hosts = Array.isArray(c.identity?.endpoints)
              ? c.identity.endpoints.map((e) => { try { return new URL(e).hostname.toLowerCase(); } catch { return ''; } })
              : [];
            // The backfill may not reach a host the contract's own endpoints do not
            // name: the egress allowlist is derived from those, and a declaration
            // that quietly widened it would be a second allowlist nobody reviewed.
            if (!hosts.includes(u.hostname.toLowerCase())) {
              push('backfill.endpoint must be on a host the contract\'s identity.endpoints already name');
            }
          } catch {
            push('backfill.endpoint is not a valid URL');
          }
        }
        const day = /^\d{4}-\d{2}-\d{2}$/;
        if (typeof bf.from !== 'string' || !day.test(bf.from) || Number.isNaN(Date.parse(bf.from))) {
          push('backfill.from must be a YYYY-MM-DD date');
        }
        if (bf.to != null && (typeof bf.to !== 'string' || !day.test(bf.to) || Number.isNaN(Date.parse(bf.to)))) {
          push('backfill.to must be a YYYY-MM-DD date or null');
        } else if (typeof bf.to === 'string' && typeof bf.from === 'string' && bf.to <= bf.from) {
          push('backfill.to must be after backfill.from');
        }
        if (bf.strategy === 'period-range') {
          if (typeof bf.window_days !== 'number' || !Number.isInteger(bf.window_days) || bf.window_days < 1 || bf.window_days > 3660) {
            push('backfill.window_days must be an integer between 1 and 3660 for period-range');
          }
          str(bf.start_param, 'backfill.start_param');
          str(bf.end_param, 'backfill.end_param');
        }
        if (bf.strategy === 'arcgis-offset') {
          if (typeof bf.page_size !== 'number' || !Number.isInteger(bf.page_size) || bf.page_size < 1 || bf.page_size > 10_000) {
            push('backfill.page_size must be an integer between 1 and 10000 for arcgis-offset');
          }
          // UNORDERED PAGING IS UNDEFINED. ArcGIS does not promise a stable order
          // without orderByFields, so a backfill that omits it can skip and
          // duplicate rows while looking complete.
          str(bf.order_by, 'backfill.order_by');
          str(bf.time_field, 'backfill.time_field');
          if (typeof bf.order_by === 'string' && typeof bf.time_field === 'string'
              && !bf.order_by.split(',').map((x) => x.trim().split(/\s+/)[0]).includes(bf.time_field)) {
            push('backfill.order_by must include backfill.time_field so pages are ordered by the window field');
          }
        }
        if (c.acquisition_mode === 'replay') {
          push('backfill is declared on a replay contract; a replay set is addressed by URL and cannot be walked');
        }
      }
    }
    if (c.authority_and_rights !== undefined && c.authority_and_rights !== null
        && typeof c.authority_and_rights === 'object'
        && c.authority_and_rights.attribution != null && typeof c.authority_and_rights.attribution !== 'string') {
      push('authority_and_rights.attribution must be a string or null');
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

  // B40 §0 SRC@v4: the six blocks (and `adapter` for the adapter kind), only on a v4 contract — a v1–v3 contract is validated exactly as before
  if (isSourceContractV4(c)) validateV4Blocks(c as unknown as Record<string, unknown>, push);

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
