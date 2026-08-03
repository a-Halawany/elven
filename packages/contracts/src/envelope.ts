/**
 * Canonical contract envelope — Vol 3 App. C (7 families), Vol 4 App. D field dictionary.
 * Envelope validation happens BEFORE payload processing (ES-20-002).
 * One canonical meaning across transports and languages (ES-20-001) —
 * the JSON Schema in `schemas()` is the language-neutral source of truth.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ConsequenceClass, Scope } from './truth-state.js';

export type SideEffectClass =
  | 'none'
  | 'reversible'
  | 'compensatable'
  | 'approval-required'
  | 'irreversible'
  | 'prohibited';

export interface Envelope {
  // Identity
  message_id: string;
  scope: Scope;
  tenant_id?: string | null;
  domain_id?: string | null;
  principal_id: string;
  delegation_id?: string | null;
  // Intent
  purpose_id?: string | null; // required for protected operations (enforced at PEP)
  action: string;
  side_effect_class: SideEffectClass;
  consequence_class: ConsequenceClass;
  // Semantics
  object_type: string;
  object_id?: string | null;
  object_version?: string | null;
  schema_version: string;
  truth_state?: string | null;
  // Time
  issued_at: string; // RFC 3339
  clock_quality: 'trusted' | 'degraded' | 'unknown';
  deadline?: string | null;
  expires_at?: string | null;
  // Trust
  source_refs?: string[] | null;
  lineage_ref?: string | null;
  // Control
  classification?: string | null; // required for protected content (enforced at PEP)
  policy_version?: string | null;
  // Operations
  correlation_id: string;
  causation_id?: string | null;
  trace_id: string;
  idempotency_key?: string | null;
  payload_digest: string; // lowercase hex SHA-256 over JCS(payload)
}

export const ENVELOPE_SCHEMA = {
  $id: 'https://the-eye.local/schemas/envelope/v1',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: [
    'message_id',
    'scope',
    'principal_id',
    'action',
    'side_effect_class',
    'consequence_class',
    'object_type',
    'schema_version',
    'issued_at',
    'clock_quality',
    'correlation_id',
    'trace_id',
    'payload_digest',
  ],
  properties: {
    message_id: { type: 'string', format: 'uuid' },
    scope: { enum: ['PLATFORM', 'TENANT', 'DOMAIN'] },
    tenant_id: { type: ['string', 'null'], format: 'uuid' },
    domain_id: { type: ['string', 'null'], format: 'uuid' },
    principal_id: { type: 'string', minLength: 1, maxLength: 256 },
    delegation_id: { type: ['string', 'null'] },
    purpose_id: { type: ['string', 'null'], maxLength: 256 },
    action: { type: 'string', pattern: '^[a-z][a-z0-9_.]{2,127}$' },
    side_effect_class: {
      enum: ['none', 'reversible', 'compensatable', 'approval-required', 'irreversible', 'prohibited'],
    },
    consequence_class: { enum: ['C0', 'C1', 'C2', 'C3', 'C4'] },
    object_type: { type: 'string', pattern: '^[A-Z]{3}$|^[a-z][a-z0-9_-]{1,63}$' },
    object_id: { type: ['string', 'null'], format: 'uuid' },
    object_version: { type: ['string', 'null'] },
    schema_version: { type: 'string', pattern: '^v[0-9]+$' },
    truth_state: {
      type: ['string', 'null'],
      enum: [
        'observed', 'asserted', 'extracted', 'inferred', 'assessed',
        'synthetic', 'decided', 'disputed', 'withdrawn', null,
      ],
    },
    issued_at: { type: 'string', format: 'date-time' },
    clock_quality: { enum: ['trusted', 'degraded', 'unknown'] },
    deadline: { type: ['string', 'null'], format: 'date-time' },
    expires_at: { type: ['string', 'null'], format: 'date-time' },
    source_refs: { type: ['array', 'null'], items: { type: 'string' }, maxItems: 256 },
    lineage_ref: { type: ['string', 'null'] },
    classification: { type: ['string', 'null'], maxLength: 64 },
    policy_version: { type: ['string', 'null'] },
    correlation_id: { type: 'string', format: 'uuid' },
    causation_id: { type: ['string', 'null'], format: 'uuid' },
    trace_id: { type: 'string', minLength: 1, maxLength: 128 },
    idempotency_key: { type: ['string', 'null'], maxLength: 256 },
    payload_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
  allOf: [
    // Scope → identifier requirements (ADR-P0-04). Fail closed on mismatch.
    {
      if: { properties: { scope: { const: 'PLATFORM' } } },
      then: {
        properties: { tenant_id: { type: 'null' }, domain_id: { type: 'null' } },
      },
    },
    {
      if: { properties: { scope: { const: 'TENANT' } } },
      then: {
        required: ['tenant_id'],
        properties: { tenant_id: { type: 'string' }, domain_id: { type: 'null' } },
      },
    },
    {
      if: { properties: { scope: { const: 'DOMAIN' } } },
      then: {
        required: ['tenant_id', 'domain_id'],
        properties: { tenant_id: { type: 'string' }, domain_id: { type: 'string' } },
      },
    },
  ],
} as const;

let compiled: ReturnType<Ajv2020['compile']> | null = null;

export interface EnvelopeValidation {
  ok: boolean;
  errors?: string[];
}

export function validateEnvelope(input: unknown): EnvelopeValidation {
  if (compiled === null) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats.default ? addFormats.default(ajv) : (addFormats as unknown as (a: Ajv2020) => void)(ajv);
    compiled = ajv.compile(ENVELOPE_SCHEMA as unknown as Record<string, unknown>);
  }
  const valid = compiled(input);
  if (valid) return { ok: true };
  return {
    ok: false,
    errors: (compiled.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`),
  };
}
