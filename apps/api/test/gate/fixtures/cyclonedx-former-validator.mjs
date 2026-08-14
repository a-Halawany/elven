/**
 * FROZEN: the ACTUAL pre-C17 CycloneDX validator, lifted verbatim from
 * `scripts/lib/supply-chain.mjs` at 91f25b86 — `CYCLONEDX_16_SCHEMA` and `validateCycloneDx()`,
 * with only the `export` plumbing kept and the Ajv constructor passed in by the caller.
 *
 * This is the real predecessor, not a reconstruction. It is a hand-written subset of CycloneDX
 * 1.6: it constrains the document identity and a handful of component fields, and it knows
 * nothing of the SPDX licence enumeration, so an invented licence id passes it.
 *
 * DO NOT EDIT.
 */
export const CYCLONEDX_16_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['bomFormat', 'specVersion', 'version', 'metadata', 'components'],
  additionalProperties: true,
  properties: {
    bomFormat: { const: 'CycloneDX' },
    specVersion: { enum: ['1.6'] },
    serialNumber: { type: 'string', pattern: '^urn:uuid:[0-9a-fA-F-]{36}$' },
    version: { type: 'integer', minimum: 1 },
    metadata: {
      type: 'object',
      required: ['timestamp', 'component'],
      properties: {
        timestamp: { type: 'string', format: 'date-time' },
        component: {
          type: 'object',
          required: ['type', 'name', 'version'],
          properties: {
            type: { enum: ['application', 'library', 'framework', 'container', 'platform', 'file'] },
            name: { type: 'string', minLength: 1 },
            version: { type: 'string', minLength: 1 },
          },
        },
        properties: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'value'],
            properties: { name: { type: 'string', minLength: 1 }, value: { type: 'string' } },
          },
        },
      },
    },
    components: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type', 'name', 'version', 'purl', 'bom-ref', 'licenses'],
        properties: {
          type: { enum: ['application', 'library', 'framework', 'container', 'platform', 'file'] },
          name: { type: 'string', minLength: 1 },
          version: { type: 'string', minLength: 1 },
          purl: { type: 'string', pattern: '^pkg:npm/' },
          'bom-ref': { type: 'string', minLength: 1 },
          licenses: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              oneOf: [
                { required: ['license'], properties: { license: {
                  type: 'object',
                  anyOf: [{ required: ['id'] }, { required: ['name'] }],
                  properties: { id: { type: 'string' }, name: { type: 'string' } },
                } } },
                { required: ['expression'], properties: { expression: { type: 'string' } } },
              ],
            },
          },
          properties: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'value'],
              properties: { name: { type: 'string' }, value: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

export function validateCycloneDx(bom, Ajv, addFormats) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  if (typeof addFormats === 'function') addFormats(ajv);
  const validate = ajv.compile(CYCLONEDX_16_SCHEMA);
  const errors = [];
  if (!validate(bom)) {
    for (const e of validate.errors ?? []) {
      errors.push(`${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
    }
  }
  // Structural rules the JSON Schema cannot express: bom-ref uniqueness and
  // purl/name/version agreement (a mismatched purl silently misidentifies a
  // component to every downstream scanner).
  const seen = new Set();
  for (const c of bom?.components ?? []) {
    if (seen.has(c['bom-ref'])) errors.push(`duplicate bom-ref ${c['bom-ref']}`);
    seen.add(c['bom-ref']);
    const encoded = String(c.name ?? '').startsWith('@')
      ? String(c.name).replace('@', '%40').replace('/', '%2F')
      : String(c.name ?? '');
    const expected = `pkg:npm/${encoded}@${c.version}`;
    if (c.purl !== expected) errors.push(`purl ${c.purl} does not match ${c.name}@${c.version}`);
  }
  return { ok: errors.length === 0, errors };
}
