/**
 * ECB EUR/USD reference rate — contract VERSION 2 (Phase 4, owner decision 2 of
 * 2026-09-05): live acquisition through the governed REST poller, a declared
 * closed-range backfill from the series' first observation, rights CONFIRMED
 * against the ESCB reuse policy, and the attribution that policy requires.
 *
 * What changes from v1 and why, field by field:
 *   acquisition_mode      replay → live      the owner activated the source
 *   identity.endpoints    a fixed window → the forward endpoint (last 30 observations)
 *   rights_state          pending → confirmed  read at the source (plan §6)
 *   attribution           new                the policy's own condition
 *   backfill              new                1999-01-04 → today, 366-day windows,
 *                                            28 requests, 12 per run → 3 runs
 * Everything else is v1's, unchanged, and v1 stays on record.
 */
const ECB_SERIES = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A';

export const ECB_ATTRIBUTION = 'Source: ECB statistics.';

export function ecbContractV2(supersedesVersion) {
  return {
    source_key: 'ecb-eurusd',
    name: 'ECB EUR/USD reference rate',
    publisher: 'European Central Bank',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'live',
    data_origin: 'real',
    identity: {
      source_identity: 'ecb-eurusd',
      publisher_identity: 'European Central Bank — ECB Data Portal',
      endpoints: [`${ECB_SERIES}?format=jsondata&lastNObservations=30`],
      scheme_allowlist: ['https'],
      cadence_seconds: 86_400,
      jitter_seconds: 300,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      attribution: ECB_ATTRIBUTION,
      authority: 'Official ECB daily euro foreign exchange reference rate',
      legal_basis: 'Public statistical publication under the ESCB reuse policy',
      rights_state: 'confirmed',
      licence: 'ESCB reuse policy: publicly available ESCB statistics may be reused free of charge, on condition that the source is quoted (e.g. "Source: ECB statistics.") and that the statistics, including metadata, are not modified. Read at the source 2026-09-05 (plan §6).',
      permitted_use: ['internal analysis', 'display with attribution', 'export with attribution'],
      robots_policy: 'public API endpoint',
      purposes: ['observation', 'cost exposure', 'forecasting'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none declared by the publisher',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'publisher host allowlisted from the contract and pinned at connect time',
        content_authenticity:
          'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
      },
      budgets: {
        max_requests_per_run: 12,
        max_bytes_per_run: 33_554_432,
        max_concurrency: 2,
        timeout_ms: 60_000,
        max_retries: 2,
      },
      expected_schema: {
        media_types: ['application/json'],
        required_fields: ['dataSets'],
        drift_tolerance: 0,
        max_bytes: 4_194_304,
      },
      freshness_expectation: { threshold_seconds: 259_200, expected_interval: 'daily (TARGET business days)' },
      coverage_expectations: {
        universe_version: 'v2',
        denominator_derivation: 'one observation per TARGET business day; the backfill window is [1999-01-04, today)',
        expected_items_per_window: 1,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'republication of the series; revisions detected by digest comparison on re-walk and recorded as evidence versions',
      backfill: {
        strategy: 'period-range',
        endpoint: `${ECB_SERIES}?format=jsondata`,
        from: '1999-01-04',
        to: null,
        window_days: 366,
        start_param: 'startPeriod',
        end_param: 'endPeriod',
      },
    },
    lifecycle: {
      contract_version: supersedesVersion + 1,
      effective_from: '2026-09-05T00:00:00Z',
      effective_to: null,
      supersedes_version: supersedesVersion,
    },
  };
}
