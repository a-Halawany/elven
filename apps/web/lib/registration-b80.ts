/**
 * B80 §CL-F — THE SOURCE-REGISTRATION FORM'S CONTRACT (apps/web/app/observation/sources/new/page.tsx, rebuilt on the library): its fields
 * and rules, its proposed defaults, the import map (a §7 contract JSON or a field,value CSV into the form) and the assembly of the §7
 * contract the governed call `observation.source.register` sends. The assembly is the one the page made before B80 — the same keys, the same
 * shapes, the same defaults — with two changes of PRESENTATION only: the cadence and freshness are entered with a unit (stored as the same
 * seconds), and `lifecycle.effective_from` is FROZEN when the person reaches the review step (so the review digest names the exact body that
 * is sent). Nothing here registers anything; the page's submit is the governed call, and it submits a DRAFT contract the registrar can never
 * approve (the pipeline's separation-of-duties rule).
 */
import { proposedDefault, toCanonical, typed, type FieldSpec, type FieldValue } from './forms-b80';

export const FORM_KEY = 'observation.source.register';
export const SCHEMA_VERSION = 'SRC-REG@v1';
export const STEPS = ['Identity', 'Authority & rights', 'Operations', 'Review'] as const;

const oneOf = (label: string, allowed: readonly string[]) => ({ kind: 'custom' as const, test: (v: string) => (allowed.includes(v) ? null : `${label} is one of ${allowed.join(', ')} (got “${v}”)`) });
export const CHOICES = {
  connector_kind: [['rest', 'governed REST poll'], ['rss', 'RSS / Atom'], ['upload', 'operator upload']],
  acquisition_mode: [['replay', 'replay — frozen fixture set'], ['live', 'live — poll the publisher']],
  data_origin: [['real', 'real'], ['synthetic', 'synthetic — every record is marked']],
  authority_class: [['authoritative', 'authoritative'], ['observational', 'observational']],
  rights_state: [['confirmed', 'confirmed — the reuse notice was verified'], ['pending', 'pending confirmation']],
} as const;
const keys = (k: keyof typeof CHOICES) => CHOICES[k].map(([v]) => v as string);

export const SPECS: FieldSpec[] = [
  { key: 'source_key', label: 'Source key', step: 0, help: 'stable identifier, e.g. imf-portwatch-chokepoints',
    rules: [{ kind: 'required' }, { kind: 'pattern', re: /^[a-z0-9][a-z0-9._-]{1,99}$/, message: 'lower-case letters, digits, dots, dashes and underscores' }] },
  { key: 'name', label: 'Name', step: 0, rules: [{ kind: 'required' }, { kind: 'maxLength', n: 200 }] },
  { key: 'publisher', label: 'Publisher', step: 0, rules: [{ kind: 'required' }, { kind: 'maxLength', n: 200 }] },
  { key: 'connector_kind', label: 'Connector', step: 0, rules: [{ kind: 'required' }, oneOf('Connector', keys('connector_kind'))] },
  { key: 'acquisition_mode', label: 'Acquisition mode', step: 0, rules: [{ kind: 'required' }, oneOf('Acquisition mode', keys('acquisition_mode'))],
    help: 'Live acquisition requires confirmed reuse rights; replay does not, because reading a frozen fixture exercises no publisher’s terms.' },
  { key: 'data_origin', label: 'Data origin', step: 0, rules: [{ kind: 'required' }, oneOf('Data origin', keys('data_origin'))] },
  { key: 'endpoints', label: 'Endpoints (comma separated, HTTPS only)', step: 0,
    rules: [{ kind: 'custom', test: (v, all) => (all['connector_kind']?.value !== 'upload' && v.trim() === '' ? 'Endpoints are required for a polled connector' : null) }, { kind: 'httpsList' }] },
  { key: 'cadence', label: 'Cadence (minimum 60 seconds)', step: 0,
    rules: [{ kind: 'custom', test: (v, all) => { const c = toCanonical(v, all['cadence']?.unit ?? 's', 'duration'); return !c.ok ? `Cadence: ${c.error}` : !c.exact ? `Cadence: ${c.error}` : (c.canonical ?? 0) < 60 ? 'Cadence is at least 60 seconds' : null; } }] },
  { key: 'authority_class', label: 'Authority class', step: 1, rules: [{ kind: 'required' }, oneOf('Authority class', keys('authority_class'))],
    help: 'An observational source may never be presented as factual authority. This is enforced at admission, not merely labelled here.' },
  { key: 'legal_basis', label: 'Legal basis', step: 1, rules: [{ kind: 'required' }] },
  { key: 'licence', label: 'Licence', step: 1, rules: [{ kind: 'required' }] },
  { key: 'permitted_use', label: 'Permitted use (comma separated)', step: 1, rules: [{ kind: 'required' }] },
  { key: 'rights_state', label: 'Rights state', step: 1, rules: [{ kind: 'required' }, oneOf('Rights state', keys('rights_state'))],
    help: 'Choosing `pending` is a statement, not an omission: a live contract with unverified rights cannot be activated.' },
  { key: 'purposes', label: 'Purposes (comma separated)', step: 1, rules: [{ kind: 'required' }] },
  { key: 'classification', label: 'Classification ceiling', step: 1, rules: [{ kind: 'required' }] },
  { key: 'residency', label: 'Residency', step: 1, rules: [{ kind: 'required' }] },
  { key: 'retention', label: 'Retention', step: 1, rules: [{ kind: 'required' }] },
  { key: 'media_types', label: 'Expected media types (comma separated)', step: 2, rules: [{ kind: 'required' }] },
  { key: 'required_fields', label: 'Required fields (comma separated, dotted paths)', step: 2, help: 'A payload missing more of these than the tolerance allows is QUARANTINED, not admitted-and-flagged.' },
  { key: 'drift_tolerance', label: 'Schema drift tolerance', step: 2, rules: [{ kind: 'integer', min: 0 }] },
  { key: 'freshness', label: 'Freshness threshold', step: 2,
    rules: [{ kind: 'custom', test: (v, all) => { const c = toCanonical(v, all['freshness']?.unit ?? 's', 'duration'); return !c.ok ? `Freshness threshold: ${c.error}` : !c.exact ? `Freshness threshold: ${c.error}` : (c.canonical ?? 0) < 1 ? 'Freshness threshold is at least 1 second' : null; } }] },
  { key: 'expected_interval', label: 'Expected interval', step: 2 },
  { key: 'universe_version', label: 'Coverage universe version', step: 2 },
  { key: 'denominator', label: 'Denominator derivation', step: 2, help: 'How the expected count for a window is derived. A coverage percentage without this is a number nobody can check.' },
  { key: 'correction_channel', label: 'Correction channel', step: 2 },
  { key: 'item_path', label: 'Item path', step: 2, help: 'For an array payload, the path to the array. Each element then becomes a child evidence object that is an exact byte range of the preserved parent. Leave blank to admit the payload whole.' },
  { key: 'item_key_field', label: 'Item key field', step: 2, help: 'Which field ADDRESSES an element. This says nothing about what the field means.',
    rules: [{ kind: 'custom', test: (v, all) => ((all['item_path']?.value ?? '').trim() !== '' && v.trim() === '' ? 'Item key field is required when an item path is given (framing is all-or-nothing)' : null) }] },
  { key: 'item_time_field', label: 'Item time field', step: 2, help: 'Which field carries the publisher\'s own time for an element. Without it, coverage cannot place items on a timeline and reports completeness as unknown.' },
  { key: 'replay_set', label: 'Replay set', step: 2, help: 'The frozen fixture set this contract reads from. Defaults to the source key when left blank.' },
];

/** The form's opening values: the PROPOSED defaults the page always offered (each shown as a proposal until its step is continued past). */
export function initialValues(): Record<string, FieldValue> {
  const d = (v: string, unit?: string): FieldValue => ({ ...proposedDefault(v), ...(unit === undefined ? {} : { unit }) });
  const blank = typed('');
  const v: Record<string, FieldValue> = {};
  for (const s of SPECS) v[s.key] = blank;
  return { ...v, connector_kind: d('rest'), acquisition_mode: d('replay'), data_origin: d('real'), cadence: d('1', 'd'), authority_class: d('authoritative'),
    permitted_use: d('internal analysis'), rights_state: d('pending'), purposes: d('observation'), classification: d('internal'), residency: d('EU'), retention: d('24 months'),
    media_types: d('application/json'), drift_tolerance: d('0'), freshness: d('3', 'd'), expected_interval: d('daily'), universe_version: d('v1') };
}

/** A §7 contract JSON (flattened) or a CSV's field names → the form's fields. Unknown names are reported by applyImport. */
export const IMPORT_MAP: Readonly<Record<string, string>> = {
  'identity.endpoints': 'endpoints', 'identity.cadence_seconds': 'cadence',
  'authority_and_rights.legal_basis': 'legal_basis', 'authority_and_rights.licence': 'licence', 'authority_and_rights.permitted_use': 'permitted_use',
  'authority_and_rights.rights_state': 'rights_state', 'authority_and_rights.purposes': 'purposes', 'authority_and_rights.classification_ceiling': 'classification',
  'authority_and_rights.residency': 'residency', 'authority_and_rights.retention': 'retention',
  'security_and_operations.expected_schema.media_types': 'media_types', 'security_and_operations.expected_schema.required_fields': 'required_fields',
  'security_and_operations.expected_schema.drift_tolerance': 'drift_tolerance', 'security_and_operations.expected_schema.item_path': 'item_path',
  'security_and_operations.expected_schema.item_key_field': 'item_key_field', 'security_and_operations.expected_schema.item_time_field': 'item_time_field',
  'security_and_operations.freshness_expectation.threshold_seconds': 'freshness', 'security_and_operations.freshness_expectation.expected_interval': 'expected_interval',
  'security_and_operations.coverage_expectations.universe_version': 'universe_version', 'security_and_operations.coverage_expectations.denominator_derivation': 'denominator',
  'security_and_operations.correction_channel': 'correction_channel', 'security_and_operations.replay_set': 'replay_set',
  classification_ceiling: 'classification', cadence_seconds: 'cadence', threshold_seconds: 'freshness', denominator_derivation: 'denominator',
};
/** The import keys whose values are seconds (they land in the unit fields as seconds). */
export const IMPORT_SECONDS = new Set(['cadence', 'freshness']);

const list = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x !== '');
const seconds = (f: FieldValue | undefined, fallback: number) => { const c = toCanonical(f?.value ?? '', f?.unit ?? 's', 'duration'); return c.ok && c.canonical !== null ? c.canonical : fallback; };

/** The §7 contract the governed registration sends — the shape the page sent before B80, from the form's values. */
export function contractOf(values: Readonly<Record<string, FieldValue>>, principalId: string, effectiveFrom: string): Record<string, unknown> {
  const v = (k: string) => values[k]?.value ?? '';
  const connectorKind = v('connector_kind'); const acquisitionMode = v('acquisition_mode'); const authorityClass = v('authority_class');
  const itemPath = v('item_path').trim(); const itemKeyField = v('item_key_field').trim(); const itemTimeField = v('item_time_field').trim(); const replaySet = v('replay_set').trim();
  return {
    source_key: v('source_key'), name: v('name'), publisher: v('publisher'),
    authority_class: authorityClass, connector_kind: connectorKind, acquisition_mode: acquisitionMode, data_origin: v('data_origin'),
    identity: {
      source_identity: v('source_key'), publisher_identity: v('publisher'),
      endpoints: connectorKind === 'upload' ? [] : list(v('endpoints')), scheme_allowlist: ['https'],
      cadence_seconds: seconds(values['cadence'], 86400), jitter_seconds: 60, collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations', steward: `principal:${principalId}`,
      authority: authorityClass === 'observational'
        ? 'NONE. This source indexes what others published and may never be presented as factual authority.'
        : 'The publisher is the authority of record for this data.',
      legal_basis: v('legal_basis'), rights_state: v('rights_state'), licence: v('licence'), permitted_use: list(v('permitted_use')),
      robots_policy: connectorKind === 'upload' ? 'not applicable — no automated collection' : 'public endpoint',
      purposes: list(v('purposes')), classification_ceiling: v('classification'), residency: v('residency'), retention: v('retention'), deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'endpoint host allowlisted from the contract and pinned at connect time',
        content_authenticity: 'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
      },
      budgets: { max_requests_per_run: 12, max_bytes_per_run: 33554432, max_concurrency: 2, timeout_ms: 60000, max_retries: 2 },
      expected_schema: {
        media_types: list(v('media_types')), required_fields: list(v('required_fields')), drift_tolerance: Number(v('drift_tolerance') || '0'), max_bytes: 8388608,
        // Framing is all-or-nothing: a path without a key field would produce items nothing can address.
        ...(itemPath !== '' && itemKeyField !== '' ? { item_path: itemPath, item_key_field: itemKeyField, ...(itemTimeField !== '' ? { item_time_field: itemTimeField } : {}) } : {}),
      },
      freshness_expectation: { threshold_seconds: seconds(values['freshness'], 259200), expected_interval: v('expected_interval') },
      coverage_expectations: { universe_version: v('universe_version'), denominator_derivation: v('denominator'), expected_items_per_window: null, not_applicable_dimensions: [], not_applicable_reason: null },
      correction_channel: v('correction_channel'),
      ...(acquisitionMode === 'replay' && replaySet !== '' ? { replay_set: replaySet } : {}),
    },
    lifecycle: { contract_version: 1, effective_from: effectiveFrom, effective_to: null },
  };
}
