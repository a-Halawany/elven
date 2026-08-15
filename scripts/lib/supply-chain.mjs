/**
 * Supply-chain gate logic (Gate-2.1 §9) — the SINGLE implementation used by both
 * the CI scripts and the negative-fixture regression tests.
 *
 * Everything here is a pure function over data, so a test can drive the REAL gate
 * with a controlled fixture instead of asserting against a reimplementation. If a
 * gate is weakened, the tests that feed it a known-bad fixture stop failing —
 * which is exactly what test 21/22 detect.
 */

/** Licences accepted in ANY dependency scope. */
export const LICENSE_ALLOWLIST = new Set([
  // C17.1: spdx-exceptions@2.5.0, a DEVELOPMENT-only dependency of the SPDX expression parser
  // added in C17.1 B3. CC-BY-3.0 is an attribution licence, and the attribution is DISCHARGED in
  // THIRD_PARTY_NOTICES.md, which names The Linux Foundation and Kyle E. Mitchell and reproduces
  // the canonical CC-BY-3.0 text. The package is a build-time data table of SPDX exception ids;
  // it ships in nothing. Recorded here rather than waved through by widening the check.
  'CC-BY-3.0',
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD',
  'BlueOak-1.0.0', 'CC-BY-4.0', 'CC0-1.0', 'Unlicense', 'Python-2.0',
  'MIT OR Apache-2.0', '(MIT OR CC0-1.0)', 'Apache-2.0 OR MIT', '(Apache-2.0 OR MPL-1.1)',
  '(MIT AND CC-BY-3.0)', 'MPL-2.0', '(AFL-2.1 OR BSD-3-Clause)', '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(MIT AND Zlib)', '(WTFPL OR MIT)', 'LGPL-3.0-or-later',
]);

/**
 * Check a licence inventory. `scopes` maps a scope label to its entries, so a
 * violation is attributed to the scope it came from — Gate-2.1 §9 requires BOTH
 * production and development closures to be gated, not production alone.
 *
 * @param {Record<string, Array<{name: string, version?: string, license: string}>>} scopes
 * @param {Set<string>} allow
 * @returns {{ ok: boolean, violations: Array<{scope: string, name: string, license: string}>, checked: number }}
 */
export function checkLicenses(scopes, allow = LICENSE_ALLOWLIST) {
  const violations = [];
  let checked = 0;
  for (const [scope, entries] of Object.entries(scopes)) {
    for (const e of entries) {
      checked += 1;
      if (!allow.has(e.license)) {
        violations.push({ scope, name: e.version ? `${e.name}@${e.version}` : e.name, license: e.license });
      }
    }
  }
  return { ok: violations.length === 0, violations, checked };
}

/**
 * BIDIRECTIONAL reconciliation (Gate-2.1 §9).
 *
 *   forward  — every SBOM component must exist in the dependency closure;
 *   reverse  — every closure identity must appear in the SBOM, unless it is a
 *              GOVERNED EXCLUSION with a recorded reason.
 *
 * One direction alone cannot detect the interesting failures: forward-only misses
 * a dependency that the SBOM silently omits, which is precisely how an unlisted
 * package reaches production.
 *
 * @param {{ components: Array<{name: string, version: string}>,
 *           lockIdentities: Iterable<string>,
 *           exclusions?: Array<{identity: string, reason: string, kind?: string}> }} input
 */
export function reconcile({ components, lockIdentities, exclusions = [] }) {
  const lock = new Set(lockIdentities);
  const sbom = new Set(components.map((c) => `${c.name}@${c.version}`));

  const excludedById = new Map();
  const badExclusions = [];
  for (const x of exclusions) {
    if (typeof x?.identity !== 'string' || typeof x?.reason !== 'string' || x.reason.trim().length < 10) {
      badExclusions.push(x?.identity ?? '<malformed>');
      continue;
    }
    excludedById.set(x.identity, x);
  }

  const missingFromLock = [...sbom].filter((id) => !lock.has(id)).sort();
  const missingFromSbom = [...lock]
    .filter((id) => !sbom.has(id) && !excludedById.has(id))
    .sort();
  // An exclusion that no longer corresponds to anything is stale governance and
  // must be removed rather than left to rot.
  const staleExclusions = [...excludedById.keys()].filter((id) => !lock.has(id) || sbom.has(id)).sort();

  const failures = [];
  if (missingFromLock.length > 0) {
    failures.push(`${missingFromLock.length} SBOM component(s) absent from the dependency closure: ` +
      missingFromLock.slice(0, 10).join(', ') + (missingFromLock.length > 10 ? ' …' : ''));
  }
  if (missingFromSbom.length > 0) {
    failures.push(`${missingFromSbom.length} closure identit(y|ies) absent from the SBOM with no governed exclusion: ` +
      missingFromSbom.slice(0, 10).join(', ') + (missingFromSbom.length > 10 ? ' …' : ''));
  }
  if (badExclusions.length > 0) {
    failures.push(`${badExclusions.length} exclusion(s) lack an identity or a substantive reason: ` +
      badExclusions.slice(0, 10).join(', '));
  }
  if (staleExclusions.length > 0) {
    failures.push(`${staleExclusions.length} stale exclusion(s) no longer needed: ` +
      staleExclusions.slice(0, 10).join(', '));
  }
  return {
    ok: failures.length === 0,
    failures,
    missingFromLock,
    missingFromSbom,
    staleExclusions,
    excluded: [...excludedById.values()],
    counts: { sbom: sbom.size, lock: lock.size, excluded: excludedById.size },
  };
}

/**
 * CycloneDX 1.6 structural schema. Validated with ajv — the same validator the
 * contracts package uses — so this is real schema validation, not a field-presence
 * spot check. It is deliberately offline: a gate that needs the network to decide
 * whether a build is releasable is a gate that fails open when the network does.
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

/**
 * Validate a CycloneDX document. `Ajv`/`addFormats` are injected so this module
 * stays dependency-free and usable from both scripts and tests.
 *
 * @returns {{ ok: boolean, errors: string[] }}
 */
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
