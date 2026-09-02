/**
 * The ten Phase 1 source contracts — SOURCE_DATA_MANIFEST.
 *
 * Each is a complete §7 contract. Two things are deliberately NOT glossed:
 *
 *  * PortWatch and ECB carry `rights_state: 'pending'`. The owner accepted the
 *    recommendation to keep their reuse terms UNVERIFIED (packet C4/D2), so their
 *    contracts stay in draft and cannot be activated. Replay is unaffected, which
 *    is exactly why the honest state costs nothing.
 *  * GDELT is `observational`. Its first live result for this corridor was a
 *    financial blog, which is the argument for enforcing the class at admission
 *    rather than trusting an operator to remember.
 */

const HTTPS = ['https'];

/** Every contract declares its four authenticity concepts SEPARATELY (§6). */
function authenticity(origin) {
  return {
    transport_endpoint: 'TLS certificate verification of the connected endpoint',
    byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
    source_origin: origin,
    // The one that matters: no cohort-1 source offers a signature mechanism, so
    // content authenticity is UNKNOWN and says so.
    content_authenticity:
      'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
  };
}

const BUDGETS = {
  max_requests_per_run: 12,
  max_bytes_per_run: 33_554_432,
  max_concurrency: 2,
  timeout_ms: 60_000,
  max_retries: 2,
};

const PORTWATCH_BASE =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';
const FSF_LINK =
  'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

export const SOURCE_CONTRACTS = [
  {
    source_key: 'imf-portwatch-chokepoints',
    name: 'IMF PortWatch — Chokepoints',
    publisher: 'International Monetary Fund',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'imf-portwatch-chokepoints',
      publisher_identity: 'International Monetary Fund — PortWatch',
      endpoints: [
        `${PORTWATCH_BASE}?where=portid%3D%27chokepoint4%27&outFields=*&f=json`,
        `${PORTWATCH_BASE}?where=portid%3D%27chokepoint1%27&outFields=*&f=json`,
        `${PORTWATCH_BASE}?where=portid%3D%27chokepoint7%27&outFields=*&f=json`,
      ],
      scheme_allowlist: HTTPS,
      cadence_seconds: 86_400,
      jitter_seconds: 300,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official IMF derived indicator of chokepoint transits and capacity',
      legal_basis: 'Public open-data platform publication',
      // UNVERIFIED per the owner's decision. This holds the contract in draft.
      rights_state: 'pending',
      licence: 'UNVERIFIED — no unambiguous reuse notice located in primary documentation',
      permitted_use: ['internal analysis'],
      robots_policy: 'API endpoint; robots.txt not applicable to the ArcGIS FeatureServer query path',
      purposes: ['observation', 'corridor monitoring'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none declared by the publisher',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('endpoint host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/json'],
        // Zero drift tolerance: a missing n_total is quarantined, not
        // admitted-and-flagged. DEF-04 exercises exactly this.
        required_fields: ['features.[].attributes.n_total', 'features.[].attributes.date'],
        drift_tolerance: 0,
        max_bytes: 8_388_608,
        // TRANSPORT FRAMING, declared by the contract. The response is preserved
        // whole as a parent, and each feature becomes a child that is an exact
        // byte range of it. Nothing here interprets what a transit count MEANS —
        // the contract only says which field addresses a row and which carries
        // the publisher's own date for it.
        item_path: 'features',
        item_key_field: 'attributes.date',
        item_time_field: 'attributes.date',
      },
      freshness_expectation: { threshold_seconds: 259_200, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v2',
        denominator_derivation: 'one framed row per chokepoint per day across the covered band (3 chokepoints x 21 published days)',
        expected_items_per_window: 63,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'publisher re-publication of the series; no dedicated corrections feed',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'eu-sanctions-rss',
    name: 'EU Financial Sanctions — RSS',
    publisher: 'European Commission (DG FISMA)',
    authority_class: 'authoritative',
    connector_kind: 'rss',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'eu-sanctions-rss',
      publisher_identity: 'European Commission — Financial Sanctions Files',
      endpoints: ['https://webgate.ec.europa.eu/fsd/fsf/public/rss'],
      scheme_allowlist: HTTPS,
      cadence_seconds: 3_600,
      jitter_seconds: 60,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official EU publication channel for consolidated financial sanctions files',
      legal_basis: 'EU Open Data Portal publication; Commission reuse notice',
      rights_state: 'confirmed',
      licence: 'Commission Decision 2011/833/EU (reuse permitted with source acknowledgement)',
      permitted_use: ['internal analysis'],
      robots_policy: 'public RSS endpoint; crawl-delay not declared',
      purposes: ['observation', 'corridor monitoring'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('publisher host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/rss+xml', 'application/xml', 'text/xml'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 4_194_304,
      },
      freshness_expectation: { threshold_seconds: 2_592_000, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'the feed publishes on change, so no fixed item count is expected per window',
        expected_items_per_window: null,
        // The publisher DOES have a correction channel — this feed is it — so
        // correction_lag is measurable and nothing here is exempted.
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'the RSS feed itself: a republished guid with a new pubDate is the publisher’s correction signal',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'eu-sanctions-payload',
    name: 'EU Financial Sanctions — CSV/XML payload',
    publisher: 'European Commission (DG FISMA)',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'eu-sanctions-payload',
      publisher_identity: 'European Commission — Financial Sanctions Files',
      // The `token=` parameter is PUBLISHED in the EU Open Data Portal metadata
      // and in the feed's own <link> elements. It is not a secret, is never
      // stored as one, and §8.1 redaction strips the whole query string from
      // logs, events and audit metadata regardless.
      endpoints: [FSF_LINK, `${FSF_LINK}&version=2`],
      scheme_allowlist: HTTPS,
      cadence_seconds: 21_600,
      jitter_seconds: 120,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official consolidated sanctions payload',
      legal_basis: 'EU Open Data Portal publication; Commission reuse notice',
      rights_state: 'confirmed',
      licence: 'Commission Decision 2011/833/EU',
      permitted_use: ['internal analysis'],
      robots_policy: 'public download endpoint',
      purposes: ['observation', 'corridor monitoring'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (published URL parameter, not a credential)',
      authenticity_method: authenticity('publisher host allowlisted from the contract and pinned at connect time'),
      budgets: { ...BUDGETS, max_bytes_per_run: 67_108_864 },
      expected_schema: {
        media_types: ['text/csv', 'application/xml'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 16_777_216,
      },
      freshness_expectation: { threshold_seconds: 2_592_000, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one payload version per publication event',
        expected_items_per_window: null,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'republication of the payload under a new version, announced on the RSS feed',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'ecb-eurusd',
    name: 'ECB EUR/USD reference rate',
    publisher: 'European Central Bank',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'ecb-eurusd',
      publisher_identity: 'European Central Bank — Statistical Data Warehouse',
      endpoints: [
        'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&startPeriod=2023-12-01&endPeriod=2024-01-31',
      ],
      scheme_allowlist: HTTPS,
      cadence_seconds: 86_400,
      jitter_seconds: 300,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official ECB daily reference rate',
      legal_basis: 'Public statistical publication',
      // UNVERIFIED per the owner's decision, exactly as for PortWatch.
      rights_state: 'pending',
      licence: 'UNVERIFIED — no unambiguous reuse notice located in primary documentation',
      permitted_use: ['internal analysis'],
      robots_policy: 'public API endpoint',
      purposes: ['observation', 'cost exposure'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none declared by the publisher',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('publisher host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/json'],
        required_fields: ['dataSets'],
        drift_tolerance: 0,
        max_bytes: 4_194_304,
      },
      freshness_expectation: { threshold_seconds: 259_200, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one observation per TARGET business day in the declared window',
        expected_items_per_window: 1,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'republication of the series; no dedicated corrections feed',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'worldbank-indicators',
    name: 'World Bank Indicators',
    publisher: 'The World Bank',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'worldbank-indicators',
      publisher_identity: 'The World Bank — Indicators API',
      endpoints: [
        'https://api.worldbank.org/v2/country/DE/indicator/NE.IMP.GNFS.ZS?format=json',
        'https://api.worldbank.org/v2/country/CN/indicator/TX.VAL.MRCH.CD.WT?format=json',
      ],
      scheme_allowlist: HTTPS,
      cadence_seconds: 604_800,
      jitter_seconds: 600,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official World Bank development indicators',
      legal_basis: 'World Bank Open Data terms of use',
      rights_state: 'confirmed',
      licence: 'CC-BY-4.0',
      permitted_use: ['internal analysis', 'redistribution with attribution'],
      robots_policy: 'public API endpoint',
      purposes: ['observation', 'structural context'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('publisher host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/json'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 4_194_304,
      },
      freshness_expectation: { threshold_seconds: 7_776_000, expected_interval: 'monthly' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one series per indicator/country pair',
        expected_items_per_window: 2,
        // The publisher offers NO corrections channel, so correction_lag is
        // genuinely not applicable — and the exemption carries its reason.
        not_applicable_dimensions: ['correction_lag'],
        not_applicable_reason:
          'the publisher operates no corrections channel; revisions are issued as new annual releases, so correction lag has no meaning for this source',
      },
      correction_channel: 'none — revisions are issued as new annual releases',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'gdelt-discovery',
    name: 'GDELT DOC 2.0 — discovery',
    publisher: 'The GDELT Project',
    // OBSERVATIONAL. Enforced at admission, not a label in the UI.
    authority_class: 'observational',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'gdelt-discovery',
      publisher_identity: 'The GDELT Project — DOC 2.0 API',
      endpoints: [
        'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Bab%20el-Mandeb%22&mode=artlist&format=json',
      ],
      scheme_allowlist: HTTPS,
      cadence_seconds: 3_600,
      jitter_seconds: 120,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority:
        'NONE. GDELT indexes what outlets published; it is a discovery signal and may never be presented as factual authority.',
      legal_basis: 'Public API; GDELT terms of use',
      rights_state: 'confirmed',
      licence: 'GDELT Project terms of use',
      permitted_use: ['internal analysis'],
      robots_policy: 'public API endpoint',
      purposes: ['observation', 'discovery'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '6 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('publisher host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/json'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 4_194_304,
      },
      freshness_expectation: { threshold_seconds: 86_400, expected_interval: 'hourly' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'no denominator exists: the source indexes an open corpus of unknown size',
        expected_items_per_window: null,
        not_applicable_dimensions: ['expected_coverage', 'actual_coverage'],
        not_applicable_reason:
          'the source indexes an open corpus of unknown extent, so no denominator exists and a coverage percentage would be invented',
      },
      correction_channel: 'none — outlets correct their own articles outside this index',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'un-comtrade-upload',
    name: 'UN Comtrade — HS 8505 (uploaded replay evidence)',
    publisher: 'United Nations Statistics Division',
    authority_class: 'authoritative',
    // UPLOAD, not REST: UN Comtrade requires a free registration even on its free
    // tier, and registering would accept terms on the project's behalf. Owner
    // decision C1/D6: no account, no key — the data enters as uploaded evidence.
    connector_kind: 'upload',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'un-comtrade-upload',
      publisher_identity: 'UN Comtrade',
      endpoints: [],
      scheme_allowlist: HTTPS,
      cadence_seconds: 604_800,
      jitter_seconds: 0,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official UN trade statistics',
      legal_basis: 'Manual export by an operator under the publisher’s terms',
      rights_state: 'confirmed',
      licence: 'UN Comtrade terms of use (manual export)',
      permitted_use: ['internal analysis'],
      robots_policy: 'not applicable — no automated collection is performed',
      purposes: ['observation', 'trade baseline'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'none — no automated access; an operator supplies the export',
      authenticity_method: {
        transport_endpoint: 'not applicable — no transport was performed by this system',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'operator attestation only',
        content_authenticity:
          'unknown — an operator-supplied export carries no publisher signature, and operator attestation is not proof of origin',
      },
      budgets: { ...BUDGETS, max_requests_per_run: 25 },
      expected_schema: {
        media_types: ['application/json', 'text/csv'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 16_777_216,
      },
      freshness_expectation: { threshold_seconds: 31_536_000, expected_interval: 'yearly' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one export per reporting period an operator supplies',
        expected_items_per_window: null,
        not_applicable_dimensions: ['latency', 'correction_lag'],
        not_applicable_reason:
          'the data arrives by manual export, so publication-to-admission latency measures operator scheduling rather than the source, and no corrections channel exists',
      },
      correction_channel: 'a corrected export supplied by the operator',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'nordwerk-internal',
    name: 'NORDWERK internal records (SYNTHETIC)',
    publisher: 'NORDWERK ANTRIEBSTECHNIK GmbH (synthetic)',
    authority_class: 'authoritative',
    connector_kind: 'upload',
    acquisition_mode: 'replay',
    // SYNTHETIC. Every object from this source carries the marker, and the UI
    // renders it — a provenance product cannot be casual about which of its own
    // facts are invented.
    data_origin: 'synthetic',
    identity: {
      source_identity: 'nordwerk-internal',
      publisher_identity: 'SYN-ORG-NORDWERK (synthetic entity; does not exist)',
      endpoints: [],
      scheme_allowlist: HTTPS,
      cadence_seconds: 86_400,
      jitter_seconds: 0,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Internal ERP and shipment records (synthetic)',
      legal_basis: 'Internal synthetic data created for demonstration',
      rights_state: 'confirmed',
      licence: 'internal',
      permitted_use: ['internal analysis'],
      robots_policy: 'not applicable',
      purposes: ['observation', 'corridor monitoring'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'operator upload under an authenticated session',
      authenticity_method: {
        transport_endpoint: 'not applicable — no transport was performed by this system',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'operator attestation only',
        content_authenticity: 'not applicable — the records are synthetic and marked as such at object level',
      },
      budgets: { ...BUDGETS, max_requests_per_run: 25 },
      expected_schema: {
        media_types: ['text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 16_777_216,
      },
      freshness_expectation: { threshold_seconds: 604_800, expected_interval: 'weekly' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one upload set per reporting period',
        expected_items_per_window: null,
        not_applicable_dimensions: ['latency', 'correction_lag', 'authenticity'],
        not_applicable_reason:
          'the records are synthetic internal data supplied by an operator: there is no publisher to lag behind, no corrections channel, and no external origin to authenticate',
      },
      correction_channel: 'a corrected upload supplied by the operator',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'carrier-advisories',
    name: 'Carrier & port advisories',
    publisher: 'Carriers and port authorities (synthetic instances)',
    authority_class: 'authoritative',
    connector_kind: 'upload',
    acquisition_mode: 'replay',
    data_origin: 'synthetic',
    identity: {
      source_identity: 'carrier-advisories',
      publisher_identity: 'Carrier and port authority advisories (synthetic)',
      endpoints: [],
      scheme_allowlist: HTTPS,
      cadence_seconds: 86_400,
      jitter_seconds: 0,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Publisher advisories supplied by an operator',
      legal_basis: 'Operator-supplied publisher advisory',
      rights_state: 'confirmed',
      licence: 'internal',
      permitted_use: ['internal analysis'],
      robots_policy: 'not applicable',
      purposes: ['observation', 'corridor monitoring'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'withdrawn advisories are marked withdrawn; the bytes are retained',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'operator upload under an authenticated session',
      authenticity_method: {
        transport_endpoint: 'not applicable — no transport was performed by this system',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'operator attestation only',
        content_authenticity:
          'unknown — an operator-supplied advisory carries no publisher signature, and operator attestation is not proof of origin',
      },
      budgets: { ...BUDGETS, max_requests_per_run: 25 },
      expected_schema: {
        media_types: ['application/pdf'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 16_777_216,
      },
      freshness_expectation: { threshold_seconds: 604_800, expected_interval: 'weekly' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'advisories arrive on publication; no fixed count is expected',
        expected_items_per_window: null,
        not_applicable_dimensions: ['expected_coverage', 'actual_coverage'],
        not_applicable_reason:
          'advisories are published on event, so the set of advisories that should exist in a window is not knowable and any denominator would be invented',
      },
      correction_channel: 'the publisher issues a withdrawal or a superseding advisory',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },

  {
    source_key: 'imf-portwatch-ports',
    name: 'IMF PortWatch — Ports',
    publisher: 'International Monetary Fund',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: 'imf-portwatch-ports',
      publisher_identity: 'International Monetary Fund — PortWatch',
      endpoints: [`${PORTWATCH_BASE}?where=portid%3D%27port1114%27&outFields=*&f=json`],
      scheme_allowlist: HTTPS,
      cadence_seconds: 86_400,
      jitter_seconds: 300,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: 'a.hoffmann',
      authority: 'Official IMF derived indicator of port calls and capacity',
      legal_basis: 'Public open-data platform publication',
      rights_state: 'pending',
      licence: 'UNVERIFIED — no unambiguous reuse notice located in primary documentation',
      permitted_use: ['internal analysis'],
      robots_policy: 'API endpoint',
      purposes: ['observation', 'port context'],
      classification_ceiling: 'internal',
      residency: 'EU',
      retention: '24 months',
      deletion_obligation: 'none declared by the publisher',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: authenticity('endpoint host allowlisted from the contract and pinned at connect time'),
      budgets: BUDGETS,
      expected_schema: {
        media_types: ['application/json'],
        required_fields: ['features.[].attributes.date'],
        drift_tolerance: 0,
        max_bytes: 8_388_608,
        item_path: 'features',
        item_key_field: 'attributes.date',
        item_time_field: 'attributes.date',
      },
      freshness_expectation: { threshold_seconds: 259_200, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v1',
        denominator_derivation: 'one framed row per port per day across the covered band',
        expected_items_per_window: 21,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'publisher re-publication of the series',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  },
];
