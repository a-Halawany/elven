import { describe, expect, it } from 'vitest';
import { applyImport, confirmStepDefaults, edit, submitHolds, validateForm, type FieldValue } from './forms-b80';
import { IMPORT_MAP, SPECS, contractOf, initialValues } from './registration-b80';

/**
 * CP-6 B80 §CL-F — the rebuilt source-registration form sends THE SAME §7 contract the page sent at 54d2936 (the governed call is
 * unchanged; only its presentation moved onto the library). `before` below is the pre-B80 assembly, copied verbatim from the old page, fed
 * the hosted suite's own inputs (e2e/phase1-observation.spec.ts scene 1). SYNTHETIC values.
 */
function before(i: Record<string, string | number>, principalId: string, effectiveFrom: string) {
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x !== '');
  const s = (k: string) => String(i[k]);
  return {
    source_key: s('sourceKey'), name: s('name'), publisher: s('publisher'), authority_class: s('authorityClass'), connector_kind: s('connectorKind'),
    acquisition_mode: s('acquisitionMode'), data_origin: s('dataOrigin'),
    identity: { source_identity: s('sourceKey'), publisher_identity: s('publisher'), endpoints: s('connectorKind') === 'upload' ? [] : list(s('endpoints')), scheme_allowlist: ['https'], cadence_seconds: i['cadence'], jitter_seconds: 60, collection_window: null },
    authority_and_rights: {
      owner: 'observation.operations', steward: `principal:${principalId}`,
      authority: s('authorityClass') === 'observational' ? 'NONE. This source indexes what others published and may never be presented as factual authority.' : 'The publisher is the authority of record for this data.',
      legal_basis: s('legalBasis'), rights_state: s('rightsState'), licence: s('licence'), permitted_use: list(s('permittedUse')),
      robots_policy: s('connectorKind') === 'upload' ? 'not applicable — no automated collection' : 'public endpoint',
      purposes: list(s('purposes')), classification_ceiling: s('classification'), residency: s('residency'), retention: s('retention'), deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint', byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'endpoint host allowlisted from the contract and pinned at connect time',
        content_authenticity: 'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
      },
      budgets: { max_requests_per_run: 12, max_bytes_per_run: 33554432, max_concurrency: 2, timeout_ms: 60000, max_retries: 2 },
      expected_schema: {
        media_types: list(s('mediaTypes')), required_fields: list(s('requiredFields')), drift_tolerance: i['driftTolerance'], max_bytes: 8388608,
        ...(s('itemPath') !== '' && s('itemKeyField') !== '' ? { item_path: s('itemPath'), item_key_field: s('itemKeyField'), ...(s('itemTimeField') !== '' ? { item_time_field: s('itemTimeField') } : {}) } : {}),
      },
      freshness_expectation: { threshold_seconds: i['freshnessSeconds'], expected_interval: s('expectedInterval') },
      coverage_expectations: { universe_version: s('universeVersion'), denominator_derivation: s('denominator'), expected_items_per_window: null, not_applicable_dimensions: [], not_applicable_reason: null },
      correction_channel: s('correctionChannel'),
      ...(s('acquisitionMode') === 'replay' && s('replaySet') !== '' ? { replay_set: s('replaySet') } : {}),
    },
    lifecycle: { contract_version: 1, effective_from: effectiveFrom, effective_to: null },
  };
}
const E2E = {
  source_key: 'e2e-portwatch-abc', name: 'E2E PortWatch Chokepoints abc', publisher: 'International Monetary Fund',
  endpoints: 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=portid%3D%27chokepoint4%27&outFields=*&f=json',
  legal_basis: 'Public open-data platform publication', licence: 'UNVERIFIED — no unambiguous reuse notice located',
  required_fields: 'features.[].attributes.n_total, features.[].attributes.date', denominator: 'one framed row per chokepoint per day',
  correction_channel: 'publisher re-publication of the series', replay_set: 'imf-portwatch-chokepoints', item_path: 'features', item_key_field: 'attributes.date', item_time_field: 'attributes.date',
};
const filled = (): Record<string, FieldValue> => { const v = initialValues(); for (const [k, x] of Object.entries(E2E)) v[k] = edit(x); return v; };

describe('the same governed call: the rebuilt form sends the pre-B80 contract', () => {
  it('for the hosted suite\'s inputs, with the defaults untouched, the contract is byte-for-byte the old one', () => {
    const at = '2026-10-17T10:00:00.000Z';
    const old = before({ sourceKey: E2E.source_key, name: E2E.name, publisher: E2E.publisher, connectorKind: 'rest', acquisitionMode: 'replay', dataOrigin: 'real', endpoints: E2E.endpoints, cadence: 86400,
      authorityClass: 'authoritative', legalBasis: E2E.legal_basis, licence: E2E.licence, permittedUse: 'internal analysis', rightsState: 'pending', purposes: 'observation', classification: 'internal',
      residency: 'EU', retention: '24 months', mediaTypes: 'application/json', requiredFields: E2E.required_fields, driftTolerance: 0, freshnessSeconds: 259200, expectedInterval: 'daily',
      universeVersion: 'v1', denominator: E2E.denominator, correctionChannel: E2E.correction_channel, replaySet: E2E.replay_set, itemPath: E2E.item_path, itemKeyField: E2E.item_key_field, itemTimeField: E2E.item_time_field }, 'p-1', at);
    expect(JSON.stringify(contractOf(filled(), 'p-1', at))).toBe(JSON.stringify(old));
  });
  it('the cadence and freshness are entered with a unit and stored as the same seconds', () => {
    const v = filled(); v['cadence'] = edit('6', 'h'); v['freshness'] = edit('90', 'min');
    const c = contractOf(v, 'p', 'x') as { identity: { cadence_seconds: number }; security_and_operations: { freshness_expectation: { threshold_seconds: number } } };
    expect(c.identity.cadence_seconds).toBe(21600);
    expect(c.security_and_operations.freshness_expectation.threshold_seconds).toBe(5400);
  });
  it('the hosted path passes each step\'s validation and, once each step is continued past, nothing holds the submit', () => {
    let v = filled();
    for (const step of [0, 1, 2]) { expect(validateForm(SPECS, v, step), `step ${step}`).toEqual([]); v = confirmStepDefaults(SPECS, v, step); }
    expect(submitHolds({ specs: SPECS, values: v, reviewedDigest: 'd', currentDigest: 'd' })).toEqual([]);
  });
  it('before its step is continued past, a default holds the submit as an unreviewed proposal', () => {
    expect(submitHolds({ specs: SPECS, values: filled(), reviewedDigest: 'd', currentDigest: 'd' }).filter((h) => h.kind === 'unconfirmed_proposal').length).toBeGreaterThan(5);
  });
  it('the step rules: a polled connector needs endpoints; framing is all-or-nothing; the cadence floor', () => {
    const v = filled(); v['endpoints'] = edit(''); v['item_key_field'] = edit(''); v['cadence'] = edit('30', 's');
    expect(validateForm(SPECS, v).map((e) => e.message)).toEqual(['Endpoints are required for a polled connector', 'Cadence is at least 60 seconds',
      'Item key field is required when an item path is given (framing is all-or-nothing)']);
    v['connector_kind'] = edit('upload');
    expect(validateForm(SPECS, v).map((e) => e.key)).not.toContain('endpoints');
  });
  it('a §7 contract JSON imports as proposals with its origin (the import map), the person\'s typed values in conflict where they differ', () => {
    const contract = before({ ...Object.fromEntries(Object.entries(E2E)), sourceKey: 'imported-key', name: 'Imported', publisher: 'IMF', connectorKind: 'rest', acquisitionMode: 'replay', dataOrigin: 'real',
      cadence: 3600, authorityClass: 'observational', legalBasis: 'x', licence: 'CC-BY-4.0', permittedUse: 'internal analysis', rightsState: 'confirmed', purposes: 'observation', classification: 'internal',
      residency: 'EU', retention: '24 months', mediaTypes: 'application/json', requiredFields: '', driftTolerance: 1, freshnessSeconds: 7200, expectedInterval: 'hourly', universeVersion: 'v2',
      denominator: 'd', correctionChannel: 'c', replaySet: 'r', itemPath: '', itemKeyField: '', itemTimeField: '' }, 'p', 'x');
    const flat: Record<string, string> = {};
    const walk = (o: unknown, p: string) => { if (o !== null && typeof o === 'object' && !Array.isArray(o)) for (const [k, x] of Object.entries(o as Record<string, unknown>)) walk(x, p === '' ? k : `${p}.${k}`); else if (o !== null) flat[p] = Array.isArray(o) ? o.join(', ') : String(o); };
    walk(contract, '');
    const v = initialValues(); v['name'] = edit('Typed by me');
    const r = applyImport(SPECS, v, flat, 'contract.json', IMPORT_MAP);
    expect(r.conflicts.map((c) => c.key)).toEqual(['name']);
    expect(r.values['licence']).toEqual({ value: 'CC-BY-4.0', source: 'imported', confirmed: false, origin: 'contract.json' });
    expect(r.values['rights_state']).toMatchObject({ value: 'confirmed', source: 'imported', confirmed: false });
    expect(r.values['cadence']).toMatchObject({ value: '3600', source: 'imported' });
  });
});
