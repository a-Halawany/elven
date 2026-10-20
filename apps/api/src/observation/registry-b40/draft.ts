/**
 * CP-6 B40 §RG — THE PREFILLED DRAFT (JRN-02: discover → rights → contract): an SRC@v4 contract skeleton built from a discovered candidate — its
 * name, publisher, terms and proposed purposes carried over; the six v4 blocks at their conservative defaults (active content, macros, embedded
 * files and hidden instructions quarantined — D7; robots evaluated; residency enforced; rights PENDING until the evaluation and the approval).
 * Pure: the registrar completes and edits it in the four-step form, and the registration validates it (validateSourceContract, the registry's
 * SRC@v4 row) — a draft is a proposal, never a registered contract. What a polled source still needs (its endpoints) is listed, never invented.
 */
import { validateSourceContract } from '../sources/source-contract.js';

export interface CandidateRow {
  candidate_id: string; name: string; publisher: string; how_found: string; terms_url: string | null; proposed_purposes: string[]; assessment: string;
}

export type DraftKind = 'rss' | 'rest' | 'upload';

/** A source key from a name: lower case, words joined by hyphens, at most 64 characters (never empty). */
export function sourceKeyOf(name: string): string {
  const k = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(synthetic\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return k.length >= 2 ? k : 'source-candidate';
}

/** The SRC@v4 draft of one candidate. `today` (YYYY-MM-DD) dates the draft and its first stewardship review (six months on). */
export function draftContractFromCandidate(c: CandidateRow, kind: DraftKind, today: string): { contract: Record<string, unknown>; missing: string[] } {
  const upload = kind === 'upload';
  const review = new Date(`${today}T00:00:00Z`); review.setUTCMonth(review.getUTCMonth() + 6);
  const contract: Record<string, unknown> = {
    source_key: sourceKeyOf(c.name), name: c.name, publisher: c.publisher,
    authority_class: 'observational', connector_kind: kind, acquisition_mode: 'replay', data_origin: 'real',
    identity: { source_identity: sourceKeyOf(c.name), publisher_identity: c.publisher, endpoints: [], scheme_allowlist: ['https'], cadence_seconds: 3_600, jitter_seconds: 0, collection_window: null },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'to be named by the data steward', authority: `As assessed at discovery: ${c.assessment}`.slice(0, 2000),
      legal_basis: c.terms_url === null ? 'to be established: no published terms were recorded at discovery' : `the publisher's terms at ${c.terms_url}`,
      rights_state: 'pending', licence: c.terms_url === null ? 'unknown until the terms are read' : `see ${c.terms_url}`, permitted_use: ['internal analysis'],
      robots_policy: 'evaluated per SRC@v4 acquisition_policy.robots', purposes: [...c.proposed_purposes], classification_ceiling: 'internal', residency: 'EU',
      retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: upload ? 'operator upload under an authenticated session' : 'none (public feed)',
      authenticity_method: { transport_endpoint: 'TLS to the declared host', byte_integrity: 'SHA-256 verified pre-store, post-store and on every read',
                             source_origin: 'the declared host allowlist', content_authenticity: 'per SRC@v4 authenticity' },
      budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      expected_schema: { media_types: kind === 'rss' ? ['application/rss+xml'] : upload ? ['application/pdf'] : ['application/json'], required_fields: [], drift_tolerance: 0 },
      freshness_expectation: { threshold_seconds: 86_400, expected_interval: 'daily' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one response per poll', expected_items_per_window: null },
      correction_channel: 'a later notice from the publisher',
    },
    lifecycle: { contract_version: 1, effective_from: `${today}T00:00:00Z`, effective_to: null, supersedes_version: null },
    acquisition_policy: {
      rate: { requests: 6, per_seconds: 60, burst: 2 },
      backoff: { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true },
      robots: { mode: 'evaluate', reason: null },
      window: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hours_utc: { from: 0, to: 24 }, blackout: [] },
      residency_check: 'enforce',
    },
    authenticity: { scheme: 'none', key_refs: [], tls_spki_pins: [] },
    content_policy: { scan_engines: ['content-inspector'], active_content: 'quarantine', macros: 'quarantine', embedded_files: 'quarantine', hidden_instructions: 'quarantine',
                      admit_opaque_reason: null, auto_admit: { mode: 'never', max_bytes: null, media_types: [] } },
    economics: { cost_per_run: 0, budget_per_period: 0, period: 'month', currency: 'EUR', owner: 'observation.operations' },
    stewardship: { steward: 'to be named by the data steward', review_due: review.toISOString().slice(0, 10) },
    evidence_attributes: { geographic_scope: ['to be declared'], language: 'und', sensitivity: 'none' },
  };
  const v = validateSourceContract(contract);
  return { contract, missing: v.ok ? [] : v.errors };
}
